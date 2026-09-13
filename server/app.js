/* ============================================================================
   THE SERVER BOUNDARY — AUTHENTICATED IDENTITY IN, ACTOR-SAFE PROJECTION OUT

     createApp({ repository, accounts, verifier, runtime, ... })  -> Fastify app

   Every request follows the same path, and nothing may skip a step:

     bearer token -> verifier.verify()          a signature, or 401
       -> accounts.findActiveBySubject()        one active account, or 403
         -> that account's actor                never anything the request said
           -> repository (Batch 2)              the canonical world, validated
             -> projectForActor()               what this actor may receive
               -> executeCommand()              for writes: the durable, locked,
                                                atomic canonical transaction

   What this file does NOT contain: a product rule, a visibility rule, a copy
   of any domain check, or a second way to write state. execute() decides what
   may happen, projectForActor() decides what may be seen, validateWorld() and
   the repository decide what may be stored. The routes wire them together and
   translate failures into a small, stable vocabulary (errors.js).

   THE CANONICAL WORLD NEVER LEAVES THIS PROCESS. Both routes answer with a
   projection for the authenticated actor. executeCommand returns the committed
   world for the server's own use; the command route projects it and drops it.

   Everything is injected — repository, account directory, token verifier,
   runtime, logger — so the tests run the real routes against an in-process
   Postgres and a fake verifier, and production wires the real ones
   (server/index.js). This module imports no demo seed, no client bundle and no
   database driver.
   ========================================================================== */

const Fastify = require("fastify");
const { projectForActor } = require("../domain/metyet-projection.js");
const RT = require("../domain/metyet-runtime.js");
const { executeCommand } = require("../persistence/command-transaction.js");
const { apiError, toApiError, errorBody } = require("./errors.js");

/* Fields a request may not carry: they name authority, and authority comes from
   the verified token alone. Legitimate domain ids a command needs (collectorId,
   partnerId, goalId, invId, binderIds…) are untouched — the command layer
   derives the seat from the actor and ignores any owner named in a payload. */
const FORBIDDEN_PAYLOAD_KEYS = ["actor", "seat", "role", "by", "account", "accountId", "subject", "sub", "token", "at"];
const POLLUTING_KEYS = ["__proto__", "constructor", "prototype"];
const BODY_KEYS = ["command", "payload"];
const DEFAULT_BODY_LIMIT = 256 * 1024;

const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

function checkPayload(payload) {
  if (payload === undefined) return {};
  if (!isPlainObject(payload)) throw apiError("invalid_request", { detail: "payload must be an object" });
  for (const key of FORBIDDEN_PAYLOAD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      throw apiError("invalid_request", { detail: `payload may not set "${key}"` });
    }
  }
  const walk = (value, depth) => {
    if (depth > 12) throw apiError("invalid_request", { detail: "payload is nested too deeply" });
    if (Array.isArray(value)) { value.forEach((v) => walk(v, depth + 1)); return; }
    if (!isPlainObject(value)) return;
    for (const key of Object.keys(value)) {
      if (POLLUTING_KEYS.includes(key)) throw apiError("invalid_request", { detail: `payload may not set "${key}"` });
      walk(value[key], depth + 1);
    }
  };
  walk(payload, 0);
  return payload;
}

function checkBody(body) {
  if (!isPlainObject(body)) throw apiError("invalid_request", { detail: "a JSON object is required" });
  const unknown = Object.keys(body).filter((k) => !BODY_KEYS.includes(k));
  if (unknown.length) throw apiError("invalid_request", { detail: `unknown field(s): ${unknown.join(", ")}` });
  if (typeof body.command !== "string" || !body.command) {
    throw apiError("invalid_request", { detail: "command must be a non-empty string" });
  }
  return { command: body.command, payload: checkPayload(body.payload) };
}

function createApp({
  repository,
  accounts,
  verifier,
  checkSchema,
  runtime = RT.systemRuntime(),
  logger = false,
  bodyLimit = DEFAULT_BODY_LIMIT,
  trustProxy = false,
} = {}) {
  if (!repository || typeof repository.loadWorld !== "function") throw new TypeError("createApp: a world repository is required");
  if (!accounts || typeof accounts.findActiveBySubject !== "function") throw new TypeError("createApp: an account directory is required");
  if (!verifier || typeof verifier.verify !== "function") throw new TypeError("createApp: a token verifier is required");
  if (!RT.isRuntime(runtime) || runtime.mode !== RT.MODES.authoritative) {
    throw new TypeError("createApp: the server runs commands on an authoritative runtime");
  }

  const app = Fastify({ logger, bodyLimit, trustProxy });

  /* ------------------------------------------------------------ AUTHENTICATION */
  async function authenticate(request) {
    const header = request.headers.authorization;
    const match = typeof header === "string" && header.match(/^Bearer +(\S+)$/i);
    if (!match) throw apiError("unauthenticated", { detail: "no bearer token" });

    let verified;
    try {
      verified = await verifier.verify(match[1]);
    } catch (error) {
      request.log.info({ reason: error && error.reason }, "bearer token rejected");
      throw apiError("unauthenticated", { detail: (error && error.reason) || "not verified" });
    }

    const account = await accounts.findActiveBySubject(verified.subject);
    if (!account) {
      const history = typeof accounts.findBySubject === "function" ? await accounts.findBySubject(verified.subject) : [];
      throw apiError(history.length ? "account_disabled" : "account_not_provisioned");
    }
    /* The only identity that exists from here on. */
    request.metyet = { actor: account.actor, accountId: account.accountId, role: account.role };
  }

  /* ------------------------------------------------------------ HEALTH */
  app.get("/api/health/live", async () => ({ status: "ok" }));

  /* Ready means: the database answers AND its schema is the one this build
     expects. A process that starts before its migrations have been applied says
     so, instead of failing every request.

     Three unready answers, and they are not interchangeable. "migrations-pending"
     means the schema is behind and the fix is to run the migration command.
     "schema-integrity" means an applied migration's file has been edited since,
     so the database and this build disagree about what the schema IS — running
     anything would be a guess. Anything else that goes wrong is unavailable with
     no reason at all: a database that cannot be reached is not a database that
     needs migrating, and saying so would send an operator after the wrong
     problem. None of the three carries a database detail outward. */
  app.get("/api/health/ready", async (request, reply) => {
    try {
      if (checkSchema) {
        const schema = await checkSchema();
        if (schema.changed && schema.changed.length) {
          request.log.error({ versions: schema.changed }, "an applied migration no longer matches this build");
          reply.code(503);
          return { status: "unavailable", reason: "schema-integrity" };
        }
        if (!schema.migrated || schema.pending.length) {
          request.log.warn({ pending: schema.pending }, "schema is not up to date");
          reply.code(503);
          return { status: "unavailable", reason: "migrations-pending" };
        }
      }
      await repository.readVersion();
      return { status: "ready" };
    } catch (error) {
      request.log.error({ err: error }, "readiness check failed");
      reply.code(503);
      return { status: "unavailable" };
    }
  });

  /* ------------------------------------------------------------ READ */
  app.get("/api/view", { preHandler: authenticate }, async (request) => {
    const { actor } = request.metyet;
    const { version, state } = await repository.withTransaction(async (tx) => ({
      version: await repository.readVersion(tx),
      state: projectForActor(await repository.loadWorld(tx), actor),
    }), { readOnly: true });
    if (!state.actor) throw apiError("actor_unknown");
    return { version, state };
  });

  /* ------------------------------------------------------------ WRITE */
  app.post("/api/commands", { preHandler: authenticate }, async (request, reply) => {
    const { actor } = request.metyet;
    const { command, payload } = checkBody(request.body);

    const result = await executeCommand(repository, { actor, command, payload, runtime });

    if (!result.ok) {
      request.log.info({ command, refused: result.refused }, "command refused");
      reply.code(409);
      return { ...errorBody(apiError("command_refused", { refused: result.refused }), request.id), version: result.version };
    }
    /* The committed world stays here; the actor receives their projection. */
    const state = projectForActor(result.world, actor);
    if (!state.actor) throw apiError("actor_unknown");
    return { ok: true, version: result.version, value: result.value === undefined ? null : result.value, state };
  });

  /* ------------------------------------------------------------ FAILURES */
  app.setNotFoundHandler((request, reply) => {
    const error = apiError("not_found");
    reply.code(error.status).send(errorBody(error, request.id));
  });

  app.setErrorHandler((error, request, reply) => {
    const api = toApiError(error);
    const log = api.status >= 500 ? request.log.error.bind(request.log) : request.log.info.bind(request.log);
    log({ err: error, code: api.code, detail: api.detail }, "request failed");
    reply.code(api.status).send(errorBody(api, request.id));
  });

  return app;
}

module.exports = { createApp, FORBIDDEN_PAYLOAD_KEYS };
