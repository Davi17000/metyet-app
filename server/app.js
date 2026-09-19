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

   ONE ROUTE TAKES THE SECOND STEP DIFFERENTLY, and only that one. Registration
   (POST /api/registration/partner) is reached by somebody who has a verified
   sign-in and is nobody in MetYet yet — which is the state every Trusted
   Partner is in exactly once. It verifies the token and stops: what authorizes
   it is the invitation credential in the body, and what it produces is the
   account that every later request will need. See server/registration.js. There
   is no route that creates an invitation; MetYet invites Trusted Partners.

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
/* Whether an invitation is still open is a PRODUCT rule, so it is asked of the
   domain rather than restated here (Phase 5 Batch 3D). Calling the same
   predicate the acceptance transaction calls is what keeps the front door and
   the redemption from ever disagreeing about what "live" means. */
const D = require("../domain/metyet-domain.js");
const RT = require("../domain/metyet-runtime.js");
const { executeCommand } = require("../persistence/command-transaction.js");
const { redeemPartnerInvitation, REFUSALS } = require("./registration.js");
const { openCollectorInvitation } = require("./collector-invitation.js");
const { acceptCollectorInvitation } = require("./collector-acceptance.js");
const { buildInvitationEmail } = require("./collector-invitation-email.js");
const { normalizeEmail } = require("./auth/invitations.js");
/* Which provider outcomes are answers, and which are silence. Named in the
   adapter, because only the adapter knows what the provider said. */
const { ANSWERED: MAIL_ANSWERED } = require("./mail/resend.js");
const { apiError, toApiError, errorBody } = require("./errors.js");

/* Fields a request may not carry: they name authority, and authority comes from
   the verified token alone. Legitimate domain ids a command needs (collectorId,
   partnerId, goalId, invId, binderIds…) are untouched — the command layer
   derives the seat from the actor and ignores any owner named in a payload. */
const FORBIDDEN_PAYLOAD_KEYS = ["actor", "seat", "role", "by", "account", "accountId", "subject", "sub", "token", "at"];
const POLLUTING_KEYS = ["__proto__", "constructor", "prototype"];
const BODY_KEYS = ["command", "payload"];
/* Opening an invitation takes two labels and nothing else. Every authority and
   runtime value on the record it creates — the inviting partner, the id, both
   timestamps, the credential — is the server's, so there is no field here for
   one and nothing to reject beyond an unknown name. */
/* `email` is accepted only when MetYet can actually send (Phase 5 Batch 3B-2).
   A field that is taken and then quietly ignored is worse than one that is
   refused: a partner would believe an invitation had been emailed. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITATION_BODY_KEYS = ["recipient", "note"];
const INVITATION_BODY_KEYS_WITH_DELIVERY = [...INVITATION_BODY_KEYS, "email"];
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
  invitations,
  identity,
  /* The Collector invitation credential directory (Phase 5 Batch 2). Injected
     like everything else, and when it is absent the route that needs it is not
     mounted — a Trusted Partner cannot open an invitation the server has
     nowhere to keep the secret for. */
  collectorCredentials,
  /* How MetYet sends an invitation, and where its links point (Phase 5 Batch
     3B-2). Injected like everything else, and when it is absent the delivery
     field is refused and nothing is sent — invitations still work, handed over
     by the partner themselves. */
  mailer = null,
  appUrl = null,
  checkSchema,
  runtime = RT.systemRuntime(),
  /* The built production client, as two strings, or null. Injected rather than
     read here: this file knows about requests and the domain, and nothing
     about a filesystem — the bootstrap is the only place that does. */
  client = null,
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

  /* Registration is the one route reached by someone who is authenticated but
     is nobody in MetYet yet — that is the whole point of it. So it verifies the
     token and stops there: a subject, and the token itself, which registration
     uses to ask the provider about this person. No account lookup, no actor, no
     claim beyond the subject, and nothing a request body says. */
  async function verifyOnly(request) {
    const header = request.headers.authorization;
    const match = typeof header === "string" && header.match(/^Bearer +(\S+)$/i);
    if (!match) throw apiError("unauthenticated", { detail: "no bearer token" });
    try {
      const verified = await verifier.verify(match[1]);
      /* The token is kept only so registration can ask the provider about this
         person with their own credential. It is never logged or returned. */
      request.metyet = { subject: verified.subject, bearer: match[1] };
    } catch (error) {
      request.log.info({ reason: error && error.reason }, "bearer token rejected");
      throw apiError("unauthenticated", { detail: (error && error.reason) || "not verified" });
    }
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
    /* AN INVITATION THAT IS OVER KEEPS NO ADDRESS (Phase 5 Batch 3B-2).

       Acceptance clears its own delivery record inside the claim, in one
       statement (server/auth/collector-invitations.js). Withdrawal cannot: it
       is an ordinary command, the canonical world knows nothing of metyet_auth,
       and the command transaction offers this route no hook — deliberately, so
       that no ordinary command can acquire a second write.

       So the cleanup lives here, at the only place that sees both the command
       that closed the invitation and the directory that holds its address. It
       adds nothing a command can reach: it sends nothing, redeems nothing, and
       runs only after a withdrawal the domain already allowed. A failure to
       clear is logged and does not fail the withdrawal — the invitation is
       genuinely withdrawn either way. */
    if (collectorCredentials && command === "revokeCollectorInvitation" && result.value) {
      try {
        await collectorCredentials.closeDelivery(result.value);
      } catch (error) {
        request.log.info({ invitationId: result.value }, "delivery record not cleared on withdrawal");
      }
    }

    /* The committed world stays here; the actor receives their projection. */
    const state = projectForActor(result.world, actor);
    if (!state.actor) throw apiError("actor_unknown");
    return { ok: true, version: result.version, value: result.value === undefined ? null : result.value, state };
  });

  /* ------------------------------------------- OPENING A COLLECTOR INVITATION
     "Come and join my Collector Network." A Trusted Partner's own offer, and
     the one secret that will redeem it, created together.

     This is an authenticated TP route rather than a command, for one reason:
     the reply carries a credential, and `POST /api/commands` answers with the
     actor's projection — which is read again on every refresh, so a secret
     placed in one would not be shown once. The canonical mutation still goes
     through the ordinary command transaction; see server/collector-invitation.js.

     THE INVITATION NAMES NOBODY. No Collector is created, no Relationship is
     created, and redeeming is Batch 3's work and does not exist yet. The body
     carries at most a recipient hint and a note — labels, for the partner's own
     recognition, deciding nothing about who may accept. */
  if (collectorCredentials) {
    app.post("/api/invitations/collector", { preHandler: authenticate }, async (request, reply) => {
      const { actor } = request.metyet;
      const body = request.body === undefined ? {} : request.body;
      if (!isPlainObject(body)) throw apiError("invalid_request", { detail: "a JSON object is required" });
      const canDeliver = Boolean(mailer && appUrl);
      const allowed = canDeliver ? INVITATION_BODY_KEYS_WITH_DELIVERY : INVITATION_BODY_KEYS;
      const unknown = Object.keys(body).filter((k) => !allowed.includes(k));
      if (unknown.length) throw apiError("invalid_request", { detail: `unknown field(s): ${unknown.join(", ")}` });
      for (const key of allowed) {
        if (body[key] !== undefined && body[key] !== null && typeof body[key] !== "string") {
          throw apiError("invalid_request", { detail: `${key} must be text` });
        }
      }
      /* A destination, checked for shape only. Nothing downstream compares it
         to anything, and nothing about who may accept depends on it. */
      const deliverTo = canDeliver ? normalizeEmail(body.email) : "";
      if (deliverTo && !LOOKS_LIKE_EMAIL.test(deliverTo)) {
        throw apiError("invalid_request", { detail: "email must be an email address" });
      }

      const result = await openCollectorInvitation({ repository, credentials: collectorCredentials, runtime },
        { actor, recipient: body.recipient ?? null, note: body.note ?? null,
          deliverTo: deliverTo || null });

      if (!result.ok) {
        request.log.info({ refused: result.refused }, "invitation refused");
        reply.code(409);
        return { ...errorBody(apiError("command_refused", { refused: result.refused }), request.id),
          version: result.version };
      }

      /* ------------------------------------------------- AND NOW THE SENDING

         COMMITTED FIRST, ALWAYS. Everything above happened in one transaction
         holding the global world lock; asking a mail provider from inside it
         would hold that lock for as long as a third party took to answer, which
         is the reason server/registration.js keeps its own provider call
         outside a transaction too.

         So the invitation exists before anything is sent, and a provider that
         refuses cannot undo it. A partner with an undelivered invitation still
         has one, and can hand over the code on screen or replace it.

         AND NOTHING IS CLAIMED WITHOUT EVIDENCE. `sent` is written only when
         the provider accepted it. A timeout, an unreadable answer, or a process
         that stops before the outcome is recorded all leave the row saying
         MetYet does not know — which is true, and which the partner can act on. */
      let delivery = { requested: false };
      if (deliverTo) {
        const partner = (result.world.partners || []).find((p) => p.id === actor.partnerId) || null;
        const { subject, text } = buildInvitationEmail({
          /* The shop's name from the committed world, never from the request. */
          partnerName: partner && partner.name,
          appUrl,
          credential: result.token,
        });
        const sent = await mailer.send({ to: deliverTo, subject, text,
          /* One issuance, one key. A replacement is a different invitation with
             a different id, so its send is never the cached answer to this one. */
          idempotencyKey: `collector-invite/${result.invitationId}` });
        /* WHAT IS ANSWERED IS WHAT WAS RECORDED, and that is the whole reason
           this is a variable rather than an expression. If the outcome write
           fails, the durable row says "requested, outcome unknown" — so the
           partner is told the same thing. A screen that said `sent` over a row
           that says `unconfirmed` would be two answers to one question, and the
           weaker one is the true one.

           AND ONLY AN ANSWER IS AN OUTCOME. A refusal and a 429 are the
           provider saying no; a timeout is nobody saying anything, and the
           message may already be on its way. The second is recorded as nothing
           at all, which leaves the row reading "requested, outcome unknown" —
           the truth, and the state the partner resolves by replacing. */
        const answered = sent.ok || MAIL_ANSWERED.includes(sent.failure);
        let outcome = sent.ok ? "sent" : answered ? "failed" : "unconfirmed";
        if (answered) {
          try {
            await collectorCredentials.recordDelivery(result.invitationId,
              sent.ok ? { at: new Date() } : { error: sent.failure });
          } catch (error) {
            /* The message may have gone; the record of it did not. */
            outcome = "unconfirmed";
            request.log.info({ invitationId: result.invitationId }, "delivery outcome not recorded");
          }
        }
        /* The failure word is ours (server/mail/resend.js). The provider's own
           answer is never logged, returned or stored: it can quote back the
           request that caused it, and that request carried a credential. */
        delivery = { requested: true, state: outcome, to: deliverTo,
          ...(outcome === "failed" ? { failure: sent.failure } : {}) };
        request.log.info({ invitationId: result.invitationId, delivery: delivery.state },
          "collector invitation delivery");
      }

      /* The credential is a sibling of the projection, never inside it — and
         this is the only reply in the product that will ever carry it. It is
         not logged here or anywhere: the id is what support quotes. */
      request.log.info({ invitationId: result.invitationId }, "collector invitation opened");
      const state = projectForActor(result.world, actor);
      if (!state.actor) throw apiError("actor_unknown");
      /* THE SAME LINK THE EMAIL WOULD HAVE CARRIED, for the partner who is
         going to hand it over themselves — which is every partner when nothing
         was sent, and the one whose send failed. It is built from CONFIGURED
         APP_URL, never from this request: `trustProxy` is on, so `Host` is a
         value a caller chooses, and a link is exactly the thing not to let them
         choose. Without that configuration there is no link and the reply says
         so by omission; the code is still there, as it was in Batch 2.

         The credential is in it because the credential IS the link. This is the
         one reply that carries the secret, and this adds no place it lives. */
      return { ok: true, version: result.version, invitationId: result.invitationId,
        credential: result.token, delivery, state,
        ...(appUrl ? { joinUrl: `${appUrl}/join#${result.token}` } : {}) };
    });
  }

  /* ------------------------------------------- WHO INVITED YOU (Batch 3D)

     A person who has just scanned a shop's QR code is standing at that shop's
     counter holding a phone. Until this route existed, what MetYet showed them
     first was a box asking for their email address — a stranger's login form,
     for a relationship that began in the real world thirty seconds earlier.
     This route is the whole of the fix: it names the shop, before anything is
     asked of anybody.

     IT IS UNAUTHENTICATED, AND THAT IS THE POINT. Authentication is what makes
     somebody the durable owner of a Collector identity, and it happens exactly
     where it always did — before acceptance. What comes first is context, and
     context is what a person needs in order to decide whether to sign in at all.

     WHAT IT DISCLOSES, EXACTLY: the inviting partner's canonical display name.
     Not the recipient label the partner typed, not the address MetYet was asked
     to send to, not the note, not the invitation's id, not its expiry, not its
     delivery state, and nothing about any Collector. The reply has one field.

     WHY THAT IS SAFE NOW, WHEN BATCH 3A SAID OTHERWISE. Batch 3A refused to
     name the shop because "a route that describes an invitation to anyone who
     submits a string is a route that tells a guesser which strings are real".
     Three things have changed. The credential is 160 bits from a 32-symbol
     alphabet, so guessing is arithmetic rather than a threat. Since Batch 3B-2
     the invitation email already names the shop, and since Batch 3C the QR is
     handed over by the shop in person — so the shop's identity is not a secret
     from anybody legitimately holding the credential. And acceptance is already
     an oracle: submitting a credential there tells you whether it is live. What
     this adds is the ability to ask without spending, for somebody who already
     holds one.

     ONE REFUSAL FOR EVERY FAILURE. Unknown, malformed, spent, expired,
     withdrawn, accepted, replaced, or an invitation whose partner has vanished:
     all of them are `invitation-unusable`, which is the same word and the same
     status the acceptance route gives. Telling them apart would hand a holder a
     classifier they have no use for and an attacker one they do.

     IT CHANGES NOTHING. No claim, no reservation, no write of any kind: one
     read-only lookup by digest, one read-only load of the world. */
  if (collectorCredentials) {
    app.post("/api/invitations/collector/context", async (request, reply) => {
      const body = request.body;
      if (!isPlainObject(body)) throw apiError("invalid_request", { detail: "a JSON object is required" });
      const unknown = Object.keys(body).filter((k) => k !== "token");
      if (unknown.length) throw apiError("invalid_request", { detail: `unknown field(s): ${unknown.join(", ")}` });
      if (typeof body.token !== "string" || !body.token) {
        throw apiError("invalid_request", { detail: "token must be a non-empty string" });
      }

      /* The one answer this route can give when it cannot answer. Built once so
         that no branch below can accidentally say something more specific. */
      const unusable = () => {
        reply.code(409);
        return errorBody(apiError("command_refused", { refused: "invitation-unusable" }), request.id);
      };

      const found = await collectorCredentials.findUnspent(body.token);
      if (!found) return unusable();

      /* The canonical rules live on the canonical invitation, so they are read
         from the world — the same predicate acceptance uses, against the same
         runtime clock. */
      const world = await repository.withTransaction(
        async (tx) => repository.loadWorld(tx), { readOnly: true });
      const invitation = (world.invitations || []).find((i) => i.id === found.invitationId) || null;
      if (!D.invitationOpen(invitation, runtime.now())) return unusable();

      const partner = (world.partners || []).find((p) => p.id === invitation.partnerId) || null;
      const partnerName = partner && typeof partner.name === "string" ? partner.name.trim() : "";
      if (!partnerName) return unusable();

      /* The id is what a support question quotes; the credential is never
         logged, here or anywhere. */
      request.log.info({ invitationId: found.invitationId }, "invitation context read");
      return { ok: true, partnerName };
    });
  }

  /* --------------------------------------------------- ACCEPTING AN INVITATION
     The other side of the invitation Batch 2 opened, and the moment a Collector
     comes into being (Phase 5 Batch 3A).

     IT USES `verifyOnly`, NOT `authenticate`, AND THAT IS THE POINT. The person
     redeeming has proved who they are to the identity provider and is nobody in
     MetYet yet — which is exactly what `authenticate` refuses, with
     `account_not_provisioned`. Registration has the same shape for the same
     reason, and this is the second and last route that needs it.

     ONE FIELD. The credential, and nothing else. There is no collectorId to
     send, no partnerId, no subject, no timestamp: the Collector is resolved or
     minted by the server from the verified subject, the partner comes from the
     invitation, and every time comes from the runtime. A body that carries
     anything else is rejected rather than quietly ignored.

     THE CREDENTIAL IS NEVER LOGGED. Not on success, not on refusal, not in
     part. What support quotes is the invitation id, which the server knows only
     after a genuine claim. */
  if (collectorCredentials) {
    app.post("/api/invitations/collector/accept", { preHandler: verifyOnly }, async (request, reply) => {
      const body = request.body;
      if (!isPlainObject(body)) throw apiError("invalid_request", { detail: "a JSON object is required" });
      const unknown = Object.keys(body).filter((k) => k !== "token");
      if (unknown.length) throw apiError("invalid_request", { detail: `unknown field(s): ${unknown.join(", ")}` });
      if (typeof body.token !== "string" || !body.token) {
        throw apiError("invalid_request", { detail: "token must be a non-empty string" });
      }

      const { subject } = request.metyet;
      const result = await acceptCollectorInvitation(
        { repository, accounts, credentials: collectorCredentials, runtime },
        { token: body.token, subject });

      if (!result.ok) {
        request.log.info({ refused: result.refused }, "acceptance refused");
        reply.code(409);
        return errorBody(apiError("command_refused", { refused: result.refused }), request.id);
      }

      request.log.info({ invitationId: result.invitationId, collectorId: result.collectorId,
        converged: result.converged }, "collector invitation accepted");
      /* What they would receive from /api/view: their own account, now with one
         Trusted Partner in it. A convergent replay answers identically, because
         it IS identical — that is what makes a lost reply survivable. */
      const actor = { collectorId: result.collectorId };
      const state = projectForActor(await repository.loadWorld(), actor);
      if (!state.actor) throw apiError("actor_unknown");
      return { ok: true, version: result.version, state };
    });
  }

  /* ------------------------------------------------------------ REGISTRATION
     "You've been invited to become a MetYet Trusted Partner." This is the
     accept. It exists only when an invitation directory is wired in, it takes
     one field — the credential from that invitation — and it cannot be reached
     without a verified sign-in. There is no route that CREATES an invitation:
     MetYet invites Trusted Partners, and nobody applies. */
  if (invitations && identity) {
    app.post("/api/registration/partner", { preHandler: verifyOnly }, async (request, reply) => {
      const body = request.body;
      if (!isPlainObject(body)) throw apiError("invalid_request", { detail: "a JSON object is required" });
      const unknown = Object.keys(body).filter((k) => k !== "token");
      if (unknown.length) throw apiError("invalid_request", { detail: `unknown field(s): ${unknown.join(", ")}` });
      if (typeof body.token !== "string" || !body.token) {
        throw apiError("invalid_request", { detail: "token must be a non-empty string" });
      }

      const { subject, bearer } = request.metyet;
      const result = await redeemPartnerInvitation({ repository, accounts, invitations, identity, runtime },
        { token: body.token, subject, bearer });

      if (!result.ok) {
        /* Neither credential is ever logged, not even in part. */
        request.log.info({ refused: result.refused, reason: result.reason }, "registration refused");
        /* Being unable to ASK is not the same as being told no: it is the
           server's problem, it says nothing about this person, and trying again
           later is the whole remedy. */
        if (result.refused === REFUSALS.identityUnavailable) {
          reply.code(503);
          return errorBody(apiError("service_unavailable"), request.id);
        }
        reply.code(409);
        return errorBody(apiError("command_refused", { refused: result.refused }), request.id);
      }

      request.log.info({ partnerId: result.partner.id, invitationId: result.invitationId }, "Trusted Partner registered");
      /* They receive what they would receive from /api/view: their own new,
         empty shop. The canonical world does not leave this process here
         either. */
      const actor = { partnerId: result.partner.id };
      const state = projectForActor(await repository.loadWorld(), actor);
      if (!state.actor) throw apiError("actor_unknown");
      return { ok: true, version: result.version, state };
    });
  }

  /* ------------------------------------------------------------ FAILURES */
  /* ------------------------------------------------ THE CLIENT

     The production client is served by the same process as the API, which is
     why they are the same origin and why there is no cross-origin anything to
     configure. It is two files and they are served by name — there is no
     directory to walk, no path to join, and nothing a request can ask for that
     is not one of these two. A path traversal has nowhere to go.

     Anything else that is not a route becomes the page, so a person who
     bookmarks a deep link still lands in the app rather than on a 404. Anything
     under /api/ never does: an unknown API path is an API error, and answering
     it with HTML would turn a typo in a client into a parse failure instead of
     a 404. */
  app.setNotFoundHandler((request, reply) => {
    const isApi = String(request.url || "").split("?")[0].startsWith("/api/");
    if (!isApi && client && request.method === "GET") {
      if (String(request.url || "").split("?")[0] === "/main.js") {
        return reply.code(200).type("application/javascript; charset=utf-8").send(client.script);
      }
      return reply.code(200).type("text/html; charset=utf-8").send(client.page);
    }
    const error = apiError("not_found");
    return reply.code(error.status).send(errorBody(error, request.id));
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
