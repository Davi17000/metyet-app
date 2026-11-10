/* ============================================================================
   B1 — OPEN COLLECTOR REGISTRATION, AND A SIGN-IN THAT SURVIVES A RELOAD

   Founder decisions: anyone with a verified email may create a Collector
   account (H1: with a required name), no invitation is needed, no Trusted
   Partner relationship is created, and Trusted Partners stay invitation-only.
   The sign-in session survives a reload within one tab (H3: sessionStorage,
   never localStorage).

   Every module below is the real one: the real domain, the real Postgres
   (PGlite) with every migration, the real Fastify routes and rate limiter, the
   real Supabase auth adapter, session, api client, store and <SignIn/>. Only
   the identity provider is a stand-in — the token verifier, GoTrue's
   /auth/v1/user, and GoTrue's OTP endpoints.

     A  the domain operation: one Collector, nothing else, unreachable as a command
     B  the route: who may register, and what it creates
     C  everything that must not register, and writes nothing when refused
     D  boundaries kept: TP privacy, TP provisioning, invitations, existing sign-ins
     E  rate limiting
     F  the client: the create-account screen, and the entrance without an invitation
     G  the session: reload, expiry, refresh, sign-out, damage, new tab, offline
     H  structure: where things live, and what may persist
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const React = require("react");
const TR = require("react-test-renderer");
const { PGlite } = require("@electric-sql/pglite");

const RT = require("../domain/metyet-runtime.js");
const { registerCollector, MAX_NAME } = require("../domain/metyet-registration.js");
const { COMMAND_NAMES } = require("../domain/metyet-commands.js");
const { validateWorld } = require("../domain/metyet-world.js");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { createCollectorCredentials } = require("../server/auth/collector-invitations.js");
const { createInvitationDirectory } = require("../server/auth/invitations.js");
const { createIdentityDirectory } = require("../server/auth/identity.js");
const { createApp, DEFAULT_REGISTRATION_RATE_LIMIT } = require("../server/app.js");
const { registerCollectorAccount } = require("../server/collector-registration.js");
const { isExposed } = require("../server/exposed-commands.js");
const H = require("./helpers/command-server.cjs");

const ROOT = path.join(__dirname, "..");
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (rel) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const load = (rel) => {
  const out = esbuild.buildSync({
    entryPoints: [path.join(ROOT, rel)], bundle: true, format: "cjs", write: false, logLevel: "silent",
    jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime"],
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};
const AUTH = load("client/supabase-auth.js");
const SESSION = load("client/supabase-session.js");
const STORAGE = load("client/session-storage.js");
const API = load("client/api.js");
const STORE = load("client/production-store.js");
const SIGNIN = load("client/sign-in/SignIn.jsx");

/* ------------------------------------------------------------- the people */
const NEW = { subject: "sub-new", email: "new.collector@example.test" };
const UNCONFIRMED = { subject: "sub-unconfirmed", email: "pending@example.test", confirmed: false };
const DISABLED = { subject: "sub-disabled", email: "gone@example.test" };
const token = (person) => `token-for:${person.subject}`;
const PEOPLE = { [H.SUBJECT]: { subject: H.SUBJECT, email: "owner@northline.example" },
  [H.COLLECTOR_SUBJECT]: { subject: H.COLLECTOR_SUBJECT, email: "casey@example.test" },
  [NEW.subject]: NEW, [UNCONFIRMED.subject]: UNCONFIRMED, [DISABLED.subject]: DISABLED };

/* GoTrue's GET /auth/v1/user, answering about whoever presents a token. */
const identityFor = ({ fail = null } = {}) => createIdentityDirectory({
  userUrl: "https://projectref.supabase.co/auth/v1/user", apiKey: "sb_publishable_test",
  fetchUser: async (bearer) => {
    if (fail) return fail(bearer);
    const m = /^token-for:(.+)$/.exec(bearer);
    const person = m && PEOPLE[m[1]];
    if (!person) return { status: 401, json: async () => ({}) };
    return { status: 200, json: async () => ({ id: person.subject, email: person.email,
      email_confirmed_at: person.confirmed === false ? null : "2026-11-01T10:00:00Z" }) };
  },
});
const verifier = {
  async verify(bearer) {
    const m = /^token-for:(.+)$/.exec(bearer);
    if (!m) { const e = new Error("no"); e.code = "token.invalid"; e.reason = "signature"; throw e; }
    return { subject: m[1] };
  },
};

/* ------------------------------------------------------------- the server */
let shared = null;
async function serve({ identity = identityFor(), limit = { max: 1000, timeWindow: 60000 },
  credentials = true, logger = false, trustProxy = false, clientAddressHeader = null } = {}) {
  const pg = shared || (shared = new PGlite());
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  const repository = createWorldRepository(db);
  await repository.saveWorld(H.world());
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: H.SUBJECT, role: "tp", partnerId: H.PARTNER });
  await accounts.linkAccount({ subject: H.COLLECTOR_SUBJECT, role: "collector", collectorId: H.COLLECTOR });
  const collectorCredentials = credentials ? createCollectorCredentials(db) : null;
  const app = createApp({ repository, accounts, verifier, identity,
    invitations: createInvitationDirectory(db),
    ...(collectorCredentials ? { collectorCredentials } : {}),
    runtime: RT.systemRuntime(), registrationRateLimit: limit, logger, trustProxy, clientAddressHeader });
  const inject = async (method, url, bearer, payload) => {
    const res = await app.inject({ method, url, headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
      ...(payload === undefined ? {} : { payload }) });
    let body = null; try { body = JSON.parse(res.body); } catch (e) { body = null; }
    return { status: res.statusCode, body, headers: res.headers, raw: res.body };
  };
  const register = (bearer, payload) => inject("POST", "/api/registration/collector", bearer, payload);
  /* A request as the network delivers it: a TCP peer and whatever headers
     the caller (and any proxy) wrote. */
  const registerFrom = async ({ peer = "127.0.0.1", headers = {} } = {}, bearer = "forged") => {
    const res = await app.inject({ method: "POST", url: "/api/registration/collector", remoteAddress: peer,
      headers: { authorization: `Bearer ${bearer}`, ...headers }, payload: { name: "x" } });
    return res.statusCode;
  };
  const view = (bearer) => inject("GET", "/api/view", bearer);
  const snapshot = async () => {
    const world = await repository.loadWorld();
    const rows = await accounts.listAccounts();
    return { world, accounts: rows };
  };
  return { app, db, repository, accounts, credentials: collectorCredentials, inject, register, registerFrom, view, snapshot };
}

const SEEDED_COLLECTORS = new Set([H.COLLECTOR, "c-stranger"]);
const newOnes = (world) => world.collectors.filter((c) => !SEEDED_COLLECTORS.has(c.id));
const same = (a, b, msg) => eq(JSON.stringify(a), JSON.stringify(b), msg);

/* ============================================================== A */
describe("A. the domain operation creates one Collector and nothing else", () => {
  const ctx = () => RT.callContext(RT.systemRuntime(), undefined);

  test("one record — an id, the cleaned name, when — and every other collection untouched", () => {
    const before = H.world();
    const result = registerCollector(before, { name: "  Dana   Reyes  " }, ctx());
    assert(result.ok, JSON.stringify(result));
    eq(result.state.collectors.length, before.collectors.length + 1, "not exactly one Collector");
    const made = result.state.collectors.at(-1);
    eq(Object.keys(made).sort().join(","), "id,name,registeredAt", "the record carries something it should not");
    eq(made.name, "Dana Reyes", "the name was not cleaned the way a shop's is");
    for (const key of Object.keys(before).filter((k) => k !== "collectors")) {
      same(result.state[key], before[key], `${key} changed — registration must create no ${key}`);
    }
    assert(validateWorld(result.state).ok, "the result is not a valid world");
  });

  test("a name is required, cleaned, and at most 80 characters", () => {
    for (const bad of ["", "   ", null, undefined, 42, {}, "x".repeat(MAX_NAME + 1)]) {
      const r = registerCollector(H.world(), { name: bad }, ctx());
      eq(r.ok, false, `accepted ${JSON.stringify(bad)}`);
      eq(r.refused, "name-required");
    }
    assert(registerCollector(H.world(), { name: "x".repeat(MAX_NAME) }, ctx()).ok, "80 characters is allowed");
    eq(MAX_NAME, 80);
  });

  test("the id and the time are the runtime's, never the caller's", () => {
    const r = registerCollector(H.world(), { name: "Dana", id: "c-chosen", registeredAt: "1999-01-01" }, ctx());
    assert(r.ok);
    const made = r.state.collectors.at(-1);
    assert(made.id !== "c-chosen" && made.registeredAt !== "1999-01-01", "a caller chose the id or the time");
  });

  test("the account is looked up INSIDE the world lock — what makes the race safe on a real pool", () => {
    /* PGlite is one connection, so the race above serializes either way. The
       ordering is what makes it safe on Postgres with a pool, and it is held
       structurally, as the acceptance suite holds its own. */
    const body = code("server/collector-registration.js");
    const lock = body.indexOf("repository.lockWorld(tx)");
    const lookup = body.indexOf("accounts.findActiveBySubject(subject, { tx })");
    const history = body.indexOf("accounts.findBySubject(subject, { tx })");
    const save = body.indexOf("repository.saveWorld(");
    const link = body.indexOf("accounts.linkAccount(");
    const ask = body.indexOf("identity.confirmedEmail(");
    assert(ask > 0 && lock > ask, "the provider is asked inside the lock, or not at all");
    assert(lookup > lock && history > lookup && save > history && link > save,
      "the order is not lock → account → history → save → link");
  });

  test("it is not a command: no request body can name it", () => {
    assert(!COMMAND_NAMES.includes("registerCollector"), "registerCollector is in COMMANDS");
    assert(!isExposed("registerCollector"), "registerCollector is on the production allow-list");
  });
});

/* ============================================================== B */
describe("B. a verified person with no account becomes one Collector", () => {
  test("one Collector, one collector account, an empty workspace — and no relationship", async () => {
    const s = await serve();
    const before = await s.snapshot();
    eq((await s.view(token(NEW))).body.error.code, "account_not_provisioned", "they start as nobody");

    const res = await s.register(token(NEW), { name: "Dana Reyes" });
    eq(res.status, 200, JSON.stringify(res.body));
    eq(res.body.created, true);
    eq(res.body.state.actor.seat, "collector");

    const after = await s.snapshot();
    const made = newOnes(after.world);
    eq(made.length, 1, "not exactly one Collector");
    eq(made[0].name, "Dana Reyes");
    eq(res.body.state.actor.collectorId, made[0].id, "the reply is about somebody else");
    const mine = after.accounts.filter((a) => a.subject === NEW.subject);
    eq(mine.length, 1, "not exactly one account");
    eq(mine[0].role, "collector", "the account is not a Collector account");
    eq(mine[0].actor.collectorId, made[0].id);
    eq(mine[0].status, "active");
    for (const key of ["relationships", "invitations", "goals", "collectorCopies", "binders",
      "opportunities", "conversations", "inventory", "partners"]) {
      same(after.world[key], before.world[key], `${key} changed`);
    }

    const v = await s.view(token(NEW));
    eq(v.status, 200, "they cannot sign in afterwards");
    eq(v.body.state.actor.collectorId, made[0].id);
    eq(v.body.state.partners.length, 0, "a new Collector can see a shop");
    eq(v.body.state.relationships.length, 0);
    eq(v.body.state.inventory.length, 0, "a new Collector can see inventory");
    eq(v.body.state.goals.length, 0);
  });

  test("asking again answers with the same account, and changes nothing — not even the name", async () => {
    const s = await serve();
    const first = await s.register(token(NEW), { name: "Dana Reyes" });
    const once = await s.snapshot();
    const second = await s.register(token(NEW), { name: "Somebody Else" });
    eq(second.status, 200, JSON.stringify(second.body));
    eq(second.body.created, false, "a repeat said it created something");
    eq(second.body.state.actor.collectorId, first.body.state.actor.collectorId);
    const twice = await s.snapshot();
    same(twice.world.collectors, once.world.collectors, "a repeat changed the Collectors");
    eq(twice.accounts.length, once.accounts.length, "a repeat added an account");
    eq(newOnes(twice.world)[0].name, "Dana Reyes", "a repeat renamed somebody");
  });

  test("two at once create exactly one Collector and one account", async () => {
    const s = await serve();
    const answers = await Promise.all([1, 2, 3].map(() => s.register(token(NEW), { name: "Dana" })));
    answers.forEach((a) => eq(a.status, 200, JSON.stringify(a.body)));
    eq(answers.filter((a) => a.body.created).length, 1, "more than one request created somebody");
    eq(new Set(answers.map((a) => a.body.state.actor.collectorId)).size, 1, "they disagree about who");
    const after = await s.snapshot();
    eq(newOnes(after.world).length, 1, "a race made two Collectors");
    eq(after.accounts.filter((a) => a.subject === NEW.subject).length, 1, "a race made two accounts");
  });

  /* PARTIAL WRITES. The world is saved before the account is bound, so the
     bind failing must take the save back with it. These reach past the lock on
     purpose — a lookup that "misses" — to prove the transaction, not the lock,
     is what stops a Collector with no account from being left behind. */
  const slipped = (accounts, overrides) => ({ ...accounts,
    findActiveBySubject: async () => null, findBySubject: async () => [], ...overrides });
  const directly = (s, accounts) => registerCollectorAccount(
    { repository: s.repository, accounts, identity: identityFor(), runtime: RT.systemRuntime() },
    { name: "Dana", subject: NEW.subject, bearer: token(NEW) });

  test("if the database refuses the account, the Collector it would have named is not left behind", async () => {
    const s = await serve();
    await s.accounts.linkAccount({ subject: NEW.subject, role: "collector", collectorId: "c-stranger" });
    const before = await s.snapshot(); const version = await s.repository.readVersion();
    const answer = await directly(s, slipped(s.accounts));
    same(answer, { ok: false, refused: "already-linked" }, "the refusal was not reported as already-linked");
    const after = await s.snapshot();
    eq(await s.repository.readVersion(), version, "the world version moved — the save was not rolled back");
    same(after.world, before.world, "a Collector was left behind with no account");
    eq(after.accounts.length, before.accounts.length, "an account was added");
  });

  test("a bind refusal rolls back by itself — not only because the database aborted the transaction", async () => {
    /* A refusal that arrives without a failed statement (a future ON CONFLICT,
       a savepoint) leaves the transaction healthy; only ROLLBACK undoes the save. */
    const s = await serve();
    const before = await s.snapshot(); const version = await s.repository.readVersion();
    const refusing = slipped(s.accounts, { linkAccount: async () => {
      throw Object.assign(new Error("already active"), { code: "account.already-active" }); } });
    same(await directly(s, refusing), { ok: false, refused: "already-linked" });
    eq(await s.repository.readVersion(), version, "the world version moved — a refused bind committed the save");
    same((await s.snapshot()).world, before.world, "a Collector was left behind with no account");
  });

  test("an unexpected failure binding the account writes nothing and is not swallowed", async () => {
    const s = await serve();
    const before = await s.snapshot(); const version = await s.repository.readVersion();
    let threw = null;
    try {
      await directly(s, slipped(s.accounts, { linkAccount: async () => { throw new Error("connection reset"); } }));
    } catch (error) { threw = error; }
    assert(threw && /connection reset/.test(threw.message), "the failure was swallowed or changed");
    eq(await s.repository.readVersion(), version, "the world version moved");
    same((await s.snapshot()).world, before.world, "a Collector was left behind with no account");
  });

  test("nothing about the person's address is returned or stored", async () => {
    const s = await serve();
    const res = await s.register(token(NEW), { name: "Dana" });
    assert(!res.raw.includes(NEW.email), "the reply carries the email address");
    const after = await s.snapshot();
    assert(!JSON.stringify(after.world).includes(NEW.email), "the world stores the email address");
  });
});

/* ============================================================== C */
describe("C. who may not register — and a refusal writes nothing", () => {
  const refusedWithoutWriting = async (s, res, status, codeOrRefusal) => {
    eq(res.status, status, JSON.stringify(res.body));
    const said = res.body && res.body.error && (res.body.error.refused || res.body.error.code);
    eq(said, codeOrRefusal);
    const after = await s.snapshot();
    eq(newOnes(after.world).length, 0, "a refusal created a Collector");
    eq(after.accounts.length, 2, "a refusal created an account");
  };

  test("no token, or one that does not verify: 401", async () => {
    const s = await serve();
    await refusedWithoutWriting(s, await s.register(null, { name: "Dana" }), 401, "unauthenticated");
    await refusedWithoutWriting(s, await s.register("forged", { name: "Dana" }), 401, "unauthenticated");
  });

  test("an address the provider has not confirmed cannot register", async () => {
    const s = await serve();
    await refusedWithoutWriting(s, await s.register(token(UNCONFIRMED), { name: "Pat" }), 409, "email-unverified");
  });

  test("a provider outage fails closed: 503, nothing opened, nothing written", async () => {
    for (const fail of [async () => { throw new Error("ECONNREFUSED"); },
      async () => ({ status: 500, json: async () => ({}) }),
      async () => ({ status: 200, json: async () => { throw new SyntaxError("x"); } })]) {
      const s = await serve({ identity: identityFor({ fail }) });
      await refusedWithoutWriting(s, await s.register(token(NEW), { name: "Dana" }), 503, "service_unavailable");
    }
  });

  test("a name that cannot succeed is refused before the provider is asked", async () => {
    let asked = 0;
    const s = await serve({ identity: identityFor({ fail: async () => { asked += 1;
      return { status: 200, json: async () => ({ id: NEW.subject, email: NEW.email, email_confirmed_at: "2026-11-01T00:00:00Z" }) }; } }) });
    for (const name of ["", "   ", "x".repeat(81)]) {
      const r = await s.register(token(NEW), { name });
      eq(r.status, 409); eq(r.body.error.refused, "name-required");
    }
    eq(asked, 0, "the provider was asked about a request that could never succeed");
  });

  test("a switched-off account is never re-created by a form", async () => {
    const s = await serve();
    const { accountId } = await s.accounts.linkAccount({ subject: DISABLED.subject, role: "collector", collectorId: "c-stranger" });
    await s.accounts.disableAccount(accountId);
    const res = await s.register(token(DISABLED), { name: "Back Again" });
    eq(res.status, 403, JSON.stringify(res.body));
    eq(res.body.error.code, "account_disabled", "the same answer /api/view gives");
    const after = await s.snapshot();
    eq(newOnes(after.world).length, 0);
    eq(after.accounts.filter((a) => a.subject === DISABLED.subject && a.status === "active").length, 0,
      "a disabled sign-in became active again");
  });

  test("a Trusted Partner keeps their account and role, and gains no Collector seat", async () => {
    const s = await serve();
    const res = await s.register(H.TOKEN, { name: "Northline Owner" });
    await refusedWithoutWriting(s, res, 409, "already-a-partner");
    const tp = (await s.snapshot()).accounts.filter((a) => a.subject === H.SUBJECT);
    eq(tp.length, 1); eq(tp[0].role, "tp"); eq(tp[0].actor.partnerId, H.PARTNER);
    eq((await s.view(H.TOKEN)).body.state.actor.seat, "tp", "the Trusted Partner's sign-in changed seat");
  });

  test("an existing Collector is answered with their own account, untouched", async () => {
    const s = await serve();
    const before = await s.snapshot();
    const res = await s.register(H.COLLECTOR_TOKEN, { name: "Renamed" });
    eq(res.status, 200); eq(res.body.created, false);
    eq(res.body.state.actor.collectorId, H.COLLECTOR);
    same((await s.snapshot()).world.collectors, before.world.collectors, "an existing Collector was changed");
  });

  test("the body may carry a name and nothing else", async () => {
    const s = await serve();
    for (const extra of [{ role: "tp" }, { collectorId: "c-chosen" }, { accountId: "a1" }, { partnerId: H.PARTNER },
      { email: "x@example.test" }, { subject: "sub-other" }, { seat: "tp" }, { invitation: "abc" }]) {
      await refusedWithoutWriting(s, await s.register(token(NEW), { name: "Dana", ...extra }), 400, "invalid_request");
    }
    await refusedWithoutWriting(s, await s.register(token(NEW), { name: 7 }), 400, "invalid_request");
    await refusedWithoutWriting(s, await s.register(token(NEW), ["Dana"]), 400, "invalid_request");
    await refusedWithoutWriting(s, await s.register(token(NEW), {}), 400, "invalid_request");
    await refusedWithoutWriting(s, await s.register(token(NEW), { name: "   " }), 409, "name-required");
    await refusedWithoutWriting(s, await s.register(token(NEW), { name: "x".repeat(81) }), 409, "name-required");
  });

  test("POST /api/commands cannot reach registration", async () => {
    const s = await serve();
    const res = await s.inject("POST", "/api/commands", token(NEW), { command: "registerCollector", payload: { name: "Dana" } });
    assert(res.status !== 200, "the command route registered somebody");
    eq((await s.snapshot()).accounts.length, 2);
    eq(newOnes((await s.snapshot()).world).length, 0);
  });

  test("the name a person typed is never logged", async () => {
    const lines = [];
    const pino = require("pino");
    const logger = pino({ level: "info" }, { write: (l) => lines.push(l) });
    const s = await serve({ logger });
    await s.register(token(NEW), { name: "Unmistakable Zebra Name" });
    await s.register(token(UNCONFIRMED), { name: "Another Unmistakable Name" });
    const all = lines.join("");
    assert(/collector registered/.test(all), "the success was not logged at all");
    assert(/collector registration refused/.test(all), "the refusal was not logged at all");
    assert(!/Unmistakable/.test(all), "a typed name reached the log");
    assert(!all.includes(NEW.email) && !all.includes(token(NEW)), "an address or a token reached the log");
  });
});

/* ============================================================== D */
describe("D. the boundaries that registration must not move", () => {
  test("an unrelated Trusted Partner cannot see a new Collector, in any collection", async () => {
    const s = await serve();
    const res = await s.register(token(NEW), { name: "Invisible Dana" });
    const id = res.body.state.actor.collectorId;
    const tp = await s.view(H.TOKEN);
    eq(tp.status, 200);
    const seen = JSON.stringify(tp.body.state);
    assert(!seen.includes(id), "the new Collector's id reached a Trusted Partner");
    assert(!seen.includes("Invisible Dana"), "the new Collector's name reached a Trusted Partner");
  });

  test("existing Collector and Trusted Partner sign-ins are unchanged", async () => {
    const s = await serve();
    await s.register(token(NEW), { name: "Dana" });
    const c = await s.view(H.COLLECTOR_TOKEN);
    eq(c.status, 200); eq(c.body.state.actor.collectorId, H.COLLECTOR);
    eq(c.body.state.partners.length, 1, "the existing relationship was disturbed");
    const t = await s.view(H.TOKEN);
    eq(t.status, 200); eq(t.body.state.actor.partnerId, H.PARTNER);
  });

  test("the invitation-code flow still works for somebody with no account (unchanged until B2)", async () => {
    const s = await serve();
    const opened = await s.inject("POST", "/api/invitations/collector", H.TOKEN, { recipient: "Dana", note: null });
    eq(opened.status, 200, JSON.stringify(opened.body));
    const accepted = await s.inject("POST", "/api/invitations/collector/accept", token(NEW), { token: opened.body.credential });
    eq(accepted.status, 200, JSON.stringify(accepted.body));
    const w = (await s.snapshot()).world;
    eq(newOnes(w).length, 1);
    assert(w.relationships.some((r) => r.partnerId === H.PARTNER && r.collectorId === newOnes(w)[0].id),
      "acceptance no longer creates the relationship it did before B1");
  });

  test("somebody who registered first and then accepts is ONE Collector, not two", async () => {
    const s = await serve();
    const reg = await s.register(token(NEW), { name: "Dana" });
    const opened = await s.inject("POST", "/api/invitations/collector", H.TOKEN, { recipient: "Dana", note: null });
    const accepted = await s.inject("POST", "/api/invitations/collector/accept", token(NEW), { token: opened.body.credential });
    eq(accepted.status, 200, JSON.stringify(accepted.body));
    const w = (await s.snapshot()).world;
    eq(newOnes(w).length, 1, "accepting after registering minted a second identity");
    eq(accepted.body.state.actor.collectorId, reg.body.state.actor.collectorId);
    eq((await s.snapshot()).accounts.filter((a) => a.subject === NEW.subject).length, 1);
  });

  test("Trusted Partner provisioning is untouched: invitation-only, and no route offers a TP seat", async () => {
    const app = code("server/app.js");
    assert(/\/api\/registration\/partner/.test(app), "partner registration route is gone");
    const routes = [...app.matchAll(/\.(?:post|get|put|patch|delete)\("([^"]+)"/g)].map((m) => m[1]);
    eq(routes.filter((r) => /registration/.test(r)).sort().join(","),
      "/api/registration/collector,/api/registration/partner", "a registration route was added or removed");
    const reg = code("server/collector-registration.js");
    assert(/role: "collector"/.test(reg) && !/role: "tp"|partnerId:/.test(reg),
      "open registration can bind something other than a Collector");
    const pkg = JSON.parse(src("package.json"));
    eq(pkg.scripts["partner:invite"], "node server/cli.js invite-partner", "the founder's TP invitation command moved");
  });
});

/* ============================================================== E */
describe("E. registration is rate limited, and nothing else is", () => {
  test("past the limit: 429 in MetYet's vocabulary, with a Retry-After, and nothing written", async () => {
    const s = await serve({ limit: { max: 2, timeWindow: 60000 } });
    eq((await s.register(token(NEW), { name: "Dana" })).status, 200);
    eq((await s.register(token(NEW), { name: "Dana" })).status, 200);
    const over = await s.register(token(UNCONFIRMED), { name: "Pat" });
    eq(over.status, 429, JSON.stringify(over.body));
    eq(over.body.error.code, "rate_limited");
    eq(Object.keys(over.body.error).sort().join(","), "code,message,requestId", "the plugin's own body leaked through");
    assert(over.headers["retry-after"], "no Retry-After");
    eq((await s.snapshot()).accounts.length, 3, "a limited request still wrote");
  });

  test("the limit applies before the token is checked, so a flood costs a counter", async () => {
    const s = await serve({ limit: { max: 1, timeWindow: 60000 } });
    eq((await s.register("forged", { name: "x" })).status, 401);
    eq((await s.register("forged", { name: "x" })).status, 429, "an unauthenticated flood is not limited");
  });

  test("no other route inherits the limit", async () => {
    const s = await serve({ limit: { max: 1, timeWindow: 60000 } });
    await s.register(token(NEW), { name: "Dana" });
    for (let i = 0; i < 5; i += 1) eq((await s.view(H.COLLECTOR_TOKEN)).status, 200, "/api/view was rate limited");
    for (let i = 0; i < 3; i += 1) {
      const r = await s.inject("POST", "/api/registration/partner", token(NEW), { token: "x" });
      assert(r.status !== 429, "partner registration inherited the Collector limit");
    }
  });

  /* FORGED FORWARDING HEADERS. Production runs with trustProxy on, so
     request.ip is the leftmost X-Forwarded-For entry — which, on Render, the
     caller writes (Cloudflare appends; it does not replace). Each of these
     sends a fresh forged value on every request and must still be stopped. */
  const PROD = { trustProxy: true, limit: { max: 2, timeWindow: 60000 } };
  const RENDER = { ...PROD, clientAddressHeader: "cf-connecting-ip" };
  const statuses = async (s, n, request) => {
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(await s.registerFrom(request(i)));
    return out;
  };

  test("a forged X-Forwarded-For per request does not escape the limit (no proxy: the TCP peer decides)", async () => {
    const s = await serve(PROD);
    const got = await statuses(s, 4, (i) => ({ peer: "203.0.113.7",
      headers: { "x-forwarded-for": `198.51.100.${i + 1}` } }));
    eq(got.join(","), "401,401,429,429", "rotating X-Forwarded-For bought new attempts");
  });

  test("on Render: rotating X-Forwarded-For behind one CF-Connecting-IP does not escape the limit", async () => {
    const s = await serve(RENDER);
    const got = await statuses(s, 4, (i) => ({ peer: "10.0.0.5",
      headers: { "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": `198.51.100.${i + 1}, 203.0.113.7, 172.68.0.1` } }));
    eq(got.join(","), "401,401,429,429", "rotating X-Forwarded-For bought new attempts behind Cloudflare");
  });

  test("on Render: two real callers behind the same proxy are counted separately", async () => {
    const s = await serve(RENDER);
    const a = await statuses(s, 3, () => ({ peer: "10.0.0.5", headers: { "cf-connecting-ip": "203.0.113.7" } }));
    const b = await s.registerFrom({ peer: "10.0.0.5", headers: { "cf-connecting-ip": "203.0.113.8" } });
    eq(a.join(","), "401,401,429");
    eq(b, 401, "a second caller was limited by the first — the key is the proxy, not the caller");
  });

  test("on Render: a missing, listed or malformed CF-Connecting-IP falls back to the peer — stricter, never a bypass", async () => {
    const s = await serve(RENDER);
    const forged = ["", "203.0.113.9, 198.51.100.1", "not-an-address", undefined];
    const got = await statuses(s, 4, (i) => ({ peer: "10.0.0.5",
      headers: forged[i] === undefined ? { "x-forwarded-for": "198.51.100.77" } : { "cf-connecting-ip": forged[i] } }));
    eq(got.join(","), "401,401,429,429", "a header that is not one address bought new attempts");
  });

  test("IPv6 is counted by /64, so one host cannot rotate through its own prefix", async () => {
    const s = await serve(RENDER);
    const got = await statuses(s, 3, (i) => ({ peer: "10.0.0.5",
      headers: { "cf-connecting-ip": `2001:db8:1:2::${(i + 1).toString(16)}` } }));
    eq(got.join(","), "401,401,429", "addresses in one /64 counted separately");
    eq(await s.registerFrom({ peer: "10.0.0.5", headers: { "cf-connecting-ip": "2001:db8:1:3::1" } }), 401,
      "a different /64 shared the bucket");
  });

  test("the key is never request.ip or X-Forwarded-For, and production names CF-Connecting-IP only on Render", () => {
    const APP_SRC = fs.readFileSync(path.join(__dirname, "..", "server", "app.js"), "utf8");
    const fn = APP_SRC.slice(APP_SRC.indexOf("function registrationClientKey"), APP_SRC.indexOf("/* Registering a Collector takes"));
    assert(fn.length > 50, "registrationClientKey not found");
    assert(!/request\.ip\b|x-forwarded-for/i.test(fn.replace(/\/\*[\s\S]*?\*\//g, "")), "the key reads request.ip or X-Forwarded-For");
    assert(/keyGenerator: \(request\) => registrationClientKey\(request, clientAddressHeader\)/.test(APP_SRC),
      "the registration route does not use registrationClientKey");
    const INDEX_SRC = fs.readFileSync(path.join(__dirname, "..", "server", "index.js"), "utf8");
    assert(/clientAddressHeader: config\.clientAddressHeader/.test(INDEX_SRC), "production does not pass the configured header");
    const { loadServerConfig, describeConfig } = require("../server/config.js");
    const ENV = { DATABASE_URL: "postgresql://u:p@db.example.supabase.co:5432/postgres",
      SUPABASE_URL: "https://projectref.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example" };
    eq(loadServerConfig({ ...ENV, RENDER: "true" }).clientAddressHeader, "cf-connecting-ip");
    eq(loadServerConfig(ENV).clientAddressHeader, null, "off Render, a header nobody overwrites was trusted");
    eq(loadServerConfig({ ...ENV, RENDER: "false" }).clientAddressHeader, null);
    eq(describeConfig(loadServerConfig({ ...ENV, RENDER: "true" })).clientAddressHeader, "cf-connecting-ip");
  });

  test("production's default is ten a minute", () => {
    eq(DEFAULT_REGISTRATION_RATE_LIMIT.max, 10);
    eq(DEFAULT_REGISTRATION_RATE_LIMIT.timeWindow, 60000);
  });
});

/* ============================================================== F */
/* The browser, against the real server: Supabase's OTP endpoints are a stub
   that issues each code once, and everything under app.metyet.io is the real
   Fastify app through inject. */
const PROJECT = "https://projectref.supabase.co";
const APP = "https://app.metyet.io";
const OTP = "24681357";

function browser(s, { email = NEW.email, person = NEW, refresh = null, viewOffline = () => false } = {}) {
  const calls = [];
  const used = new Set();
  let n = 0;
  const reply = (status, body) => ({ status, json: async () => body });
  const impl = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init.method || "GET", body });
    if (url.startsWith(PROJECT)) {
      if (url.includes("/otp")) return reply(200, {});
      if (url.includes("/verify")) {
        if (body.token !== OTP || used.has(body.email)) return reply(403, { msg: "Token has expired or is invalid" });
        used.add(body.email);
        n += 1;
        return reply(200, { access_token: token(person), refresh_token: `refresh-${n}`, expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600 });
      }
      if (url.includes("/token")) {
        if (refresh) return refresh(body);
        return reply(200, { access_token: token(person), refresh_token: `refresh-r${(n += 1)}`, expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600 });
      }
      if (url.includes("/logout")) return reply(204, {});
    }
    if (viewOffline(url)) throw new TypeError("Failed to fetch");
    return H.fetchFor(s.app)(url, init);
  };
  const box = { v: null };
  const tab = { getItem: (k) => (k in tabStore ? tabStore[k] : null), setItem: (k, v) => { tabStore[k] = String(v); },
    removeItem: (k) => { delete tabStore[k]; } };
  const tabStore = {};
  const make = () => {
    const auth = AUTH.createSupabaseAuth({ supabaseUrl: PROJECT, publishableKey: "sb_publishable_example", fetchImpl: impl });
    const session = SESSION.createSupabaseSession({ auth, storage: STORAGE.createTabSessionStorage({ storage: tab }) });
    const api = API.createApiClient({ baseUrl: APP, getToken: () => session.token(), fetchImpl: impl });
    const store = STORE.createProductionStore({ api });
    return { session, store };
  };
  return { calls, make, tabStore, email, box,
    apiCalls: () => calls.filter((c) => c.url.startsWith(APP)) };
}

const render = (props) => { let r; TR.act(() => { r = TR.create(React.createElement(SIGNIN.default, props)); }); return r; };
const flush = async () => { for (let i = 0; i < 6; i += 1) {
  await TR.act(async () => { await new Promise((res) => setTimeout(res, 0)); }); } };
const flat = (r) => { const out = []; const walk = (n) => { for (const c of (n && n.children) || []) {
  if (typeof c === "string" || typeof c === "number") out.push(String(c)); else walk(c); } };
walk(r.toJSON()); return out.join(" ").replace(/\s+/g, " "); };
const typeInto = (r, id, value) => { const el = r.root.findAll((n) => n.type === "input" && n.props.id === id)[0];
  assert(el, `no input ${id}: ${flat(r)}`); TR.act(() => { el.props.onChange({ target: { value } }); }); };
const submit = (r) => { const form = r.root.findAll((n) => n.type === "form")[0]; assert(form, "no form");
  TR.act(() => { form.props.onSubmit({ preventDefault() {} }); }); };
const textOf = (node) => { const out = []; const walk = (n) => { if (typeof n === "string") { out.push(n); return; }
  if (n && Array.isArray(n.children)) n.children.forEach(walk); }; walk(node); return out.join(" "); };
const press = async (r, label) => { const b = r.root.findAll((n) => n.type === "button").find((n) => textOf(n).includes(label));
  assert(b, `no button "${label}": ${flat(r)}`); TR.act(() => { b.props.onClick(); }); await flush(); };

async function signInAs(b, { session, store }, email = b.email) {
  const r = render({ session, store });
  typeInto(r, "metyet-email", email); submit(r); await flush();
  typeInto(r, "metyet-code", OTP); submit(r); await flush();
  return r;
}

describe("F. the client: a new Collector creates their own account", () => {
  test("the entrance no longer asks for an invitation, and says the same code creates an account", async () => {
    const s = await serve(); const b = browser(s); const r = render(b.make());
    const shown = flat(r);
    assert(!/invited at|An invitation is what creates/i.test(shown), "the entrance still assumes an invitation: " + shown);
    assert(/New to MetYet\? The same code creates your account\./.test(shown), shown);
    assert(/I have an invitation code/.test(shown), "the invitation-code door was removed (it stays until B2)");
    eq(b.calls.length, 0, "the entrance asked somebody something before a person did");
  });

  test("code → Welcome to MetYet → name → Create my account → their own empty workspace", async () => {
    const s = await serve(); const b = browser(s); const pair = b.make();
    const r = await signInAs(b, pair);
    const shown = flat(r);
    assert(/Welcome to MetYet/.test(shown), shown);
    assert(shown.includes(`You're signed in as ${NEW.email}. Create your collector account to start tracking your Goals, Binders, and cards.`), shown);
    assert(/Your name/.test(shown) && /Create my account/.test(shown), shown);
    eq(newOnes((await s.snapshot()).world).length, 0, "an account was created before the person asked");

    typeInto(r, "metyet-name", "Dana Reyes"); submit(r); await flush();
    const posts = b.apiCalls().filter((c) => c.url.endsWith("/api/registration/collector"));
    eq(posts.length, 1, "not exactly one registration request");
    eq(JSON.stringify(posts[0].body), JSON.stringify({ name: "Dana Reyes" }), "something besides the name left the browser");
    eq(pair.store.get().actor.seat, "collector", "they did not arrive in a Collector workspace");
    assert(!/Create my account/.test(flat(r)), "still on the create screen: " + flat(r));
    eq(newOnes((await s.snapshot()).world).length, 1);
  });

  test("a blank or too-long name is caught before anything is sent", async () => {
    const s = await serve(); const b = browser(s); const r = await signInAs(b, b.make());
    submit(r); await flush();
    assert(/Enter your name\./.test(flat(r)), flat(r));
    typeInto(r, "metyet-name", "x".repeat(81)); submit(r); await flush();
    assert(/80 characters or fewer/.test(flat(r)), flat(r));
    eq(b.apiCalls().filter((c) => c.url.endsWith("/api/registration/collector")).length, 0);
  });

  test("every button on the create screen is at least a 44px touch target", async () => {
    const s = await serve(); const b = browser(s); const r = await signInAs(b, b.make());
    const buttons = r.root.findAll((n) => n.type === "button");
    assert(buttons.some((n) => textOf(n).includes("Create my account")), "no create button");
    assert(buttons.some((n) => textOf(n).includes("Not you? Sign out")), "no sign-out button");
    for (const n of buttons) {
      const st = n.props.style || {};
      assert(st.minHeight >= 44 && st.boxSizing === "border-box",
        `"${textOf(n)}" has no 44px border-box minimum: ${JSON.stringify(st)}`);
    }
  });

  test("a double press sends one request", async () => {
    const s = await serve(); const b = browser(s); const r = await signInAs(b, b.make());
    typeInto(r, "metyet-name", "Dana");
    const form = r.root.findAll((n) => n.type === "form")[0];
    TR.act(() => { form.props.onSubmit({ preventDefault() {} }); form.props.onSubmit({ preventDefault() {} }); });
    await flush();
    eq(b.apiCalls().filter((c) => c.url.endsWith("/api/registration/collector")).length, 1, "a double press sent twice");
  });

  test("a refusal is said in words a person can act on", async () => {
    const s = await serve();
    const b = browser(s, { email: UNCONFIRMED.email, person: UNCONFIRMED });
    const r = await signInAs(b, b.make());
    typeInto(r, "metyet-name", "Pat"); submit(r); await flush();
    assert(/couldn't confirm your email address/.test(flat(r)), flat(r));
  });

  test("losing contact while creating says it is safe to try again — and it is", async () => {
    const s = await serve();
    let offline = true;
    const b = browser(s, { viewOffline: (url) => offline && url.endsWith("/api/registration/collector") });
    const pair = b.make();
    const r = await signInAs(b, pair);
    typeInto(r, "metyet-name", "Dana"); submit(r); await flush();
    assert(/safe to repeat/.test(flat(r)), flat(r));
    offline = false;
    submit(r); await flush();
    eq(pair.store.get().actor.seat, "collector", flat(r));
  });

  test("Not you? Sign out returns to the entrance and ends the session", async () => {
    const s = await serve(); const b = browser(s); const pair = b.make();
    const r = await signInAs(b, pair);
    await press(r, "Not you? Sign out");
    assert(/We'll email you a sign-in code/.test(flat(r)), flat(r));
    eq(pair.session.status(), SESSION.ANONYMOUS);
    eq(Object.keys(b.tabStore).length, 0, "the stored session outlived sign-out");
  });

  test("a returning Collector goes straight to their workspace, never the create screen", async () => {
    const s = await serve();
    const b = browser(s, { email: "casey@example.test", person: PEOPLE[H.COLLECTOR_SUBJECT] });
    const pair = b.make();
    const r = await signInAs(b, pair);
    assert(!/Create my account/.test(flat(r)), flat(r));
    eq(pair.store.get().actor.collectorId, H.COLLECTOR);
  });

  test("a returning Trusted Partner goes straight to their shop, never the create screen", async () => {
    const s = await serve();
    const b = browser(s, { email: "owner@northline.example", person: PEOPLE[H.SUBJECT] });
    const pair = b.make();
    const r = await signInAs(b, pair);
    assert(!/Create my account/.test(flat(r)), flat(r));
    eq(pair.store.get().actor.partnerId, H.PARTNER);
  });

  test("a used code is refused: replaying it signs nobody in", async () => {
    const s = await serve(); const b = browser(s); const pair = b.make();
    await signInAs(b, pair);
    await pair.session.signOut();
    const again = b.make();
    const r = render(again);
    typeInto(r, "metyet-email", NEW.email); submit(r); await flush();
    typeInto(r, "metyet-code", OTP); submit(r); await flush();
    assert(/That code did not work/.test(flat(r)), flat(r));
    eq(again.session.status(), SESSION.ANONYMOUS, "a replayed code produced a session");
  });

  test("a switched-off account is told so, and is not offered a new account", async () => {
    const s = await serve();
    const { accountId } = await s.accounts.linkAccount({ subject: DISABLED.subject, role: "collector", collectorId: "c-stranger" });
    await s.accounts.disableAccount(accountId);
    const b = browser(s, { email: DISABLED.email, person: DISABLED });
    const r = await signInAs(b, b.make());
    assert(/switched off/.test(flat(r)), flat(r));
    assert(!/Create my account/.test(flat(r)), "a disabled account was offered a new one: " + flat(r));
  });
});

/* ============================================================== G */
describe("G. the session survives a reload in this tab, and nothing more", () => {
  const signedInPair = async () => {
    const s = await serve(); const b = browser(s, { email: "casey@example.test", person: PEOPLE[H.COLLECTOR_SUBJECT] });
    const first = b.make(); await signInAs(b, first);
    return { s, b, first };
  };

  test("a reload in the same tab restores the session and opens the workspace without a new code", async () => {
    const { b } = await signedInPair();
    const verifies = b.calls.filter((c) => c.url.includes("/verify")).length;
    const reloaded = b.make();
    eq(reloaded.session.status(), SESSION.PRESENT, "the reload signed them out");
    const r = render(reloaded); await flush();
    eq(reloaded.store.get().actor.collectorId, H.COLLECTOR, flat(r));
    eq(b.calls.filter((c) => c.url.includes("/verify")).length, verifies, "a reload asked for a new code");
  });

  test("a reload while unregistered lands on the create screen, and creating works", async () => {
    const s = await serve(); const b = browser(s); await signInAs(b, b.make());
    const reloaded = b.make(); const r = render(reloaded); await flush();
    assert(/Welcome to MetYet/.test(flat(r)) && /You're signed in\. Create/.test(flat(r)), flat(r));
    typeInto(r, "metyet-name", "Dana"); submit(r); await flush();
    eq(reloaded.store.get().actor.seat, "collector");
  });

  test("what is kept is the session's three fields, under one key, in sessionStorage only", async () => {
    const { b } = await signedInPair();
    eq(Object.keys(b.tabStore).join(","), STORAGE.SESSION_KEY);
    const kept = JSON.parse(b.tabStore[STORAGE.SESSION_KEY]);
    eq(Object.keys(kept).sort().join(","), "accessToken,expiresAt,refreshToken");
    assert(!b.tabStore[STORAGE.SESSION_KEY].includes("example.test"), "an email address was stored");
  });

  test("an expired access token is renewed on restore, and the renewal is what is kept", async () => {
    const { b } = await signedInPair();
    const stale = JSON.parse(b.tabStore[STORAGE.SESSION_KEY]);
    const expired = Math.floor(Date.now() / 1000) - 10;
    b.tabStore[STORAGE.SESSION_KEY] = JSON.stringify({ ...stale, expiresAt: expired });
    const reloaded = b.make(); render(reloaded); await flush();
    assert(b.calls.some((c) => c.url.includes("/token")), "an expired token was used instead of renewed");
    eq(reloaded.store.get().actor.collectorId, H.COLLECTOR);
    const now = JSON.parse(b.tabStore[STORAGE.SESSION_KEY]);
    assert(now.refreshToken !== stale.refreshToken && now.expiresAt > expired, "the renewed session was not kept");
  });

  test("a renewal the provider refuses ends the session, clears storage, and says so", async () => {
    const s = await serve();
    const b = browser(s, { email: "casey@example.test", person: PEOPLE[H.COLLECTOR_SUBJECT],
      refresh: async () => ({ status: 400, json: async () => ({}) }) });
    await signInAs(b, b.make());
    const stale = JSON.parse(b.tabStore[STORAGE.SESSION_KEY]);
    b.tabStore[STORAGE.SESSION_KEY] = JSON.stringify({ ...stale, expiresAt: 1 });
    const reloaded = b.make(); const r = render(reloaded); await flush();
    assert(/Your session has ended/.test(flat(r)), flat(r));
    eq(Object.keys(b.tabStore).length, 0, "a refused renewal left the session stored");
    eq(reloaded.store.get(), null, "a projection appeared without a valid session");
    await press(r, "Try again");
    assert(/We'll email you a sign-in code/.test(flat(r)), "Try again did not return to the entrance: " + flat(r));
  });

  test("a renewal that cannot reach the provider keeps the session; Try again recovers", async () => {
    const s = await serve();
    let offline = true;
    const b = browser(s, { email: "casey@example.test", person: PEOPLE[H.COLLECTOR_SUBJECT],
      refresh: async () => { if (offline) throw new TypeError("Failed to fetch");
        return { status: 200, json: async () => ({ access_token: H.COLLECTOR_TOKEN, refresh_token: "refresh-back",
          expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 }) }; } });
    await signInAs(b, b.make());
    const stale = JSON.parse(b.tabStore[STORAGE.SESSION_KEY]);
    b.tabStore[STORAGE.SESSION_KEY] = JSON.stringify({ ...stale, expiresAt: 1 });
    const reloaded = b.make(); const r = render(reloaded); await flush();
    assert(/could not be reached/.test(flat(r)), "a network blip was reported as something else: " + flat(r));
    assert(!/session has ended/.test(flat(r)), "a network blip signed them out");
    eq(reloaded.session.status(), SESSION.PRESENT, "the session was thrown away while offline");
    assert(b.tabStore[STORAGE.SESSION_KEY], "the stored session was thrown away while offline");
    eq(b.apiCalls().filter((c) => c.url.endsWith("/api/view")).length, 1, "a request left without a valid token");
    offline = false;
    await press(r, "Try again");
    eq(reloaded.store.get().actor.collectorId, H.COLLECTOR, flat(r));
  });

  test("a connection lost on restore is a failure with a way back, not a sign-out", async () => {
    const s = await serve();
    let offline = false;
    const b = browser(s, { email: "casey@example.test", person: PEOPLE[H.COLLECTOR_SUBJECT],
      viewOffline: (url) => offline && url.endsWith("/api/view") });
    await signInAs(b, b.make());
    offline = true;
    const reloaded = b.make(); const r = render(reloaded); await flush();
    assert(/could not be reached/.test(flat(r)), flat(r));
    offline = false;
    await press(r, "Try again");
    eq(reloaded.store.get().actor.collectorId, H.COLLECTOR);
  });

  test("sign-out clears this tab's storage — even when the provider cannot be told", async () => {
    const { b, first } = await signedInPair();
    await first.session.signOut();
    eq(Object.keys(b.tabStore).length, 0);
    eq(b.make().session.status(), SESSION.ANONYMOUS, "a reload after sign-out signed them back in");
    assert(b.calls.some((c) => c.url.includes("/logout")), "sign-out did not revoke at the provider");

    const auth = AUTH.createSupabaseAuth({ supabaseUrl: PROJECT, publishableKey: "sb_publishable_example",
      fetchImpl: async () => { throw new TypeError("offline"); } });
    const tab = {}; const st = { getItem: (k) => tab[k] || null, setItem: (k, v) => { tab[k] = v; }, removeItem: (k) => { delete tab[k]; } };
    tab[STORAGE.SESSION_KEY] = JSON.stringify({ accessToken: "a", refreshToken: "r", expiresAt: 9e9 });
    const s2 = SESSION.createSupabaseSession({ auth, storage: STORAGE.createTabSessionStorage({ storage: st }) });
    eq(s2.status(), SESSION.PRESENT);
    await s2.signOut();
    eq(Object.keys(tab).length, 0, "an unreachable provider kept the session stored");
  });

  test("a damaged or foreign stored value is cleared, and the person starts signed out", () => {
    for (const bad of ["{not json", JSON.stringify({ accessToken: "a" }),
      JSON.stringify({ accessToken: "a", refreshToken: "r", expiresAt: 1, email: "x@y.z" }),
      JSON.stringify({ accessToken: "", refreshToken: "r", expiresAt: 1 }),
      JSON.stringify({ accessToken: "a", refreshToken: "r", expiresAt: "soon" }), JSON.stringify([1, 2])]) {
      const tab = { [STORAGE.SESSION_KEY]: bad };
      const st = { getItem: (k) => tab[k] || null, setItem: (k, v) => { tab[k] = v; }, removeItem: (k) => { delete tab[k]; } };
      const auth = AUTH.createSupabaseAuth({ supabaseUrl: PROJECT, publishableKey: "sb_publishable_example", fetchImpl: async () => ({ status: 500, json: async () => ({}) }) });
      const session = SESSION.createSupabaseSession({ auth, storage: STORAGE.createTabSessionStorage({ storage: st }) });
      eq(session.status(), SESSION.ANONYMOUS, `believed ${bad}`);
      eq(tab[STORAGE.SESSION_KEY], undefined, `left ${bad} in storage`);
    }
  });

  test("the adapter writes only a valid session, keeps only its three fields, and clears on anything else", () => {
    const tab = {};
    const st = { getItem: (k) => (k in tab ? tab[k] : null), setItem: (k, v) => { tab[k] = v; }, removeItem: (k) => { delete tab[k]; } };
    const adapter = STORAGE.createTabSessionStorage({ storage: st });
    adapter.save({ accessToken: "a", refreshToken: "r", expiresAt: 9e9, email: "x@y.z", code: "24681357" });
    eq(Object.keys(JSON.parse(tab[STORAGE.SESSION_KEY])).sort().join(","), "accessToken,expiresAt,refreshToken",
      "something besides the session was written");
    for (const bad of [{ accessToken: "", refreshToken: "r", expiresAt: 1 }, { accessToken: "a", refreshToken: "r" }, null]) {
      adapter.save({ accessToken: "a", refreshToken: "r", expiresAt: 9e9 });
      adapter.save(bad);
      eq(tab[STORAGE.SESSION_KEY], undefined, `an invalid session was written, or the old one kept: ${JSON.stringify(bad)}`);
    }
  });

  test("a new tab starts signed out", async () => {
    const { s } = await signedInPair();
    const other = browser(s);           // a different tab: its own sessionStorage
    eq(other.make().session.status(), SESSION.ANONYMOUS);
  });

  test("storage that throws, or is missing, never breaks signing in", async () => {
    const throwing = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceeded"); },
      removeItem() { throw new Error("SecurityError"); } };
    for (const storage of [throwing, null, undefined, {}]) {
      const adapter = STORAGE.createTabSessionStorage({ storage });
      eq(adapter.load(), null);
      adapter.save({ accessToken: "a", refreshToken: "r", expiresAt: 9e9 });
      adapter.clear();
    }
    const auth = AUTH.createSupabaseAuth({ supabaseUrl: PROJECT, publishableKey: "sb_publishable_example",
      fetchImpl: async () => ({ status: 200, json: async () => ({ access_token: "tok", refresh_token: "r", expires_in: 3600 }) }) });
    const session = SESSION.createSupabaseSession({ auth, storage: STORAGE.createTabSessionStorage({ storage: throwing }) });
    await session.verifyCode("a@b.co", OTP);
    eq(session.status(), SESSION.PRESENT, "a broken storage stopped a sign-in");
  });

  test("the real browser storage: only sessionStorage, only the session, never localStorage", async () => {
    const writes = [];
    const spy = (name) => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null),
      setItem: (k, v) => { m[k] = v; writes.push({ name, k, v }); }, removeItem: (k) => { delete m[k]; writes.push({ name, k, v: null }); } }; };
    const had = { l: Object.getOwnPropertyDescriptor(globalThis, "localStorage"), s: Object.getOwnPropertyDescriptor(globalThis, "sessionStorage") };
    globalThis.localStorage = spy("localStorage");
    globalThis.sessionStorage = spy("sessionStorage");
    try {
      const s = await serve();
      const opened = await s.inject("POST", "/api/invitations/collector", H.TOKEN, { recipient: "Dana", note: null });
      const credential = opened.body.credential;
      const auth = AUTH.createSupabaseAuth({ supabaseUrl: PROJECT, publishableKey: "sb_publishable_example",
        fetchImpl: async (url, init) => (url.includes("/verify")
          ? { status: 200, json: async () => ({ access_token: token(NEW), refresh_token: "r1", expires_in: 3600 }) }
          : url.startsWith(PROJECT) ? { status: 200, json: async () => ({}) } : H.fetchFor(s.app)(url, init)) });
      const session = SESSION.createSupabaseSession({ auth, storage: STORAGE.createTabSessionStorage() });   // the default: the browser's
      const api = API.createApiClient({ baseUrl: APP, getToken: () => session.token(), fetchImpl: H.fetchFor(s.app) });
      const store = STORE.createProductionStore({ api });
      const r = render({ session, store, arrivedWith: credential });
      typeInto(r, "metyet-email", NEW.email); submit(r); await flush();
      typeInto(r, "metyet-code", OTP); submit(r); await flush();
      await press(r, "Accept invitation");
      eq(writes.filter((w) => w.name === "localStorage").length, 0, "localStorage was written");
      assert(writes.every((w) => w.k === STORAGE.SESSION_KEY), "something other than the session was stored");
      assert(!writes.some((w) => String(w.v).includes(credential)), "THE INVITATION CODE WAS STORED");
      assert(!writes.some((w) => String(w.v).includes(OTP)), "the one-time code was stored");
    } finally {
      for (const [k, d] of [["localStorage", had.l], ["sessionStorage", had.s]]) {
        if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k];
      }
    }
  });
});

/* ============================================================== H */
describe("H. structure", () => {
  const walk = (dir, out = []) => { for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`; if (e.isDirectory()) walk(rel, out); else if (/\.jsx?$/.test(e.name)) out.push(rel); }
  return out; };

  test("exactly one client file names browser storage, and it is sessionStorage", () => {
    const files = [...walk("client"), ...walk("app-src")];
    eq(files.filter((rel) => /sessionStorage/.test(code(rel))).join(","), "client/session-storage.js");
    eq(files.filter((rel) => /localStorage|indexedDB|document\.cookie/.test(code(rel))).join(","), "",
      "something persists beyond the tab");
  });

  test("the production entry wires the tab storage; the session module still defaults to none", () => {
    assert(/createSupabaseSession\(\{ auth, storage: createTabSessionStorage\(\) \}\)/.test(code("app-src/main.jsx")),
      "the entry does not keep the session across a reload");
    assert(/storage = NO_STORAGE/.test(code("client/supabase-session.js")), "the default stopped being none");
  });

  test("the session module still never decodes a token", () => {
    assert(!/atob|base64|jwtDecode|decodeJwt|\.split\(["']\.["']\)/.test(code("client/supabase-session.js")
      + code("client/session-storage.js")));
  });

  test("the create screen and the API send a name and nothing else", () => {
    const api = code("client/api.js");
    assert(/send\("\/api\/registration\/collector",\s*\{ method: "POST", body: \{ name \} \}\)/.test(api),
      "the registration request carries more than a name");
  });

  test("open registration is wired only when the provider can be asked", async () => {
    const pg = shared || (shared = new PGlite());
    await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
    const db = fromPGlite(pg); await migrate(db);
    const repository = createWorldRepository(db); await repository.saveWorld(H.world());
    const app = createApp({ repository, accounts: createAccountDirectory(db), verifier, runtime: RT.systemRuntime() });
    const res = await app.inject({ method: "POST", url: "/api/registration/collector",
      headers: { authorization: `Bearer ${token(NEW)}` }, payload: { name: "Dana" } });
    eq(res.statusCode, 404, "registration was mounted without a way to confirm an address");
  });
});

run();
