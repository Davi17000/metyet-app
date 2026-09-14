/* ============================================================================
   PHASE 3 BATCH 3 — THE AUTHENTICATED SERVER BOUNDARY

   The real routes, the real account directory, the real command transaction and
   a real Postgres (PGlite, in process). Only the identity provider is a
   stand-in: the app is given a fake verifier, and the real verifier is tested
   separately against keys minted in the test itself.

     A  authentication
     B  account -> actor mapping
     C  the read endpoint is a projection
     D  privacy, adversarially
     E  the command endpoint
     F  authority cannot be claimed by a request
     G  failures, health and error vocabulary
     H  token verification
     I  configuration
     J  boundaries and composition
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const RT = require("../domain/metyet-runtime.js");
const { createStore } = require("../domain/metyet-store.js");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createAccountDirectory, AccountError } = require("../server/auth/accounts.js");
const { createTokenVerifier } = require("../server/auth/token-verifier.js");
const { createApp, FORBIDDEN_PAYLOAD_KEYS } = require("../server/app.js");
const { loadServerConfig, describeConfig } = require("../server/config.js");
const { API_ERRORS } = require("../server/errors.js");

const ROOT = path.join(__dirname, "..");

/* Markers: every private value is distinctive, so a leak is a substring. */
const MARK = {
  cost: 31337, ask: 41415, rate: 0.7777, binderCasey: 99911, binderDana: 88811,
  relNote: "P1-PRIVATE-NOTE-ABOUT-CASEY", danaMessage: "DANA-ONLY-MESSAGE",
  danaGoalNote: "DANA-GOAL-NOTE", activity: "P1-PRIVATE-ACTIVITY", caseyGoalNote: "CASEY-GOAL-NOTE",
  p2Note: "P2-PRIVATE-NOTE-ABOUT-CASEY", p2Cost: 52111,
};
const card = (id, o = {}) => ({ id, name: o.name || "Charizard", set: "Base Set", num: o.num || "4/102",
  print: "Holo", edition: "Unlimited", language: "English", grade: "PSA 9", condition: null, tags: [] });
const photos = (id) => ({ front: id + ":front", back: id + ":back" });

/* Casey (c1) knows Northline (p1) and Second (p2). Dana (c2) knows Northline
   only. Erin (c3) knows nobody. */
function world() {
  return {
    catalog: [card("k1"), card("k2", { name: "Blastoise", num: "2/102" }), card("k5", { name: "Venusaur", num: "15/102" })],
    collectors: [{ id: "c1", name: "Casey" }, { id: "c2", name: "Dana" }, { id: "c3", name: "Erin" }],
    partners: [{ id: "p1", name: "Northline", tradeRate: MARK.rate }, { id: "p2", name: "Second", tradeRate: 0.6 }],
    relationships: [
      { partnerId: "p1", collectorId: "c1", status: "accepted", at: "2026-01-01", note: MARK.relNote },
      { partnerId: "p1", collectorId: "c2", status: "accepted", at: "2026-02-02" },
      { partnerId: "p2", collectorId: "c1", status: "accepted", at: "2026-03-03", note: MARK.p2Note },
    ],
    invitations: [],
    goals: [
      { id: "g1", collectorId: "c1", cardId: "k1", tier: "primary", note: MARK.caseyGoalNote },
      { id: "g2", collectorId: "c2", cardId: "k1", tier: "primary", note: MARK.danaGoalNote },
      { id: "g3", collectorId: "c3", cardId: "k5", tier: "primary" },
    ],
    inventory: [
      { invId: "i1", partnerId: "p1", cardId: "k1", ask: MARK.ask, cost: MARK.cost, archived: false, photos: photos("i1") },
      { invId: "i2", partnerId: "p1", cardId: "k5", ask: 900, cost: 400, archived: false, photos: photos("i2") },
      { invId: "i3", partnerId: "p2", cardId: "k1", ask: 1200, cost: MARK.p2Cost, archived: false, photos: photos("i3") },
    ],
    binder: [
      { id: "b1", collectorId: "c1", cardId: "k2", market: MARK.binderCasey, cert: null, photos: photos("b1") },
      { id: "b2", collectorId: "c2", cardId: "k5", market: MARK.binderDana, cert: null, photos: photos("b2") },
    ],
    interests: [], conversations: [], opportunities: [], photoRequests: [], copyReviews: [],
    activity: [{ id: "a1", partnerId: "p1", collectorId: "c1", type: "manual", text: MARK.activity, date: "2026-04-04" }],
  };
}

const CASEY = { collectorId: "c1" }, DANA = { collectorId: "c2" }, NORTHLINE = { partnerId: "p1" }, SECOND = { partnerId: "p2" };
const SUBJECTS = { casey: "sub-casey", dana: "sub-dana", northline: "sub-northline", second: "sub-second",
  stranger: "sub-stranger", retired: "sub-retired", ghost: "sub-ghost" };
const bearer = (subject) => ({ authorization: `Bearer token-for:${subject}` });

/* The identity provider, stubbed: a token names its subject, and "bad" tokens
   fail exactly as a rejected signature does. */
function fakeVerifier() {
  const calls = [];
  return {
    calls,
    async verify(token) {
      calls.push(token);
      const match = /^token-for:(.+)$/.exec(token);
      if (!match) {
        const error = new Error("the bearer token was not accepted (signature)");
        error.code = "token.invalid";
        error.reason = "signature";
        throw error;
      }
      return { subject: match[1], expiresAt: Math.floor(Date.now() / 1000) + 3600 };
    },
  };
}

const runtime = () => RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 60000 });

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

/* A migrated database, a seeded world, provisioned accounts and the app. */
async function serve({ seed = world(), runtimeFor = runtime, repositoryWrapper } = {}) {
  const pg = database();
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  const base = createWorldRepository(db);
  const repository = repositoryWrapper ? repositoryWrapper(base) : base;
  await base.saveWorld(seed);
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: SUBJECTS.casey, role: "collector", collectorId: "c1" });
  await accounts.linkAccount({ subject: SUBJECTS.dana, role: "collector", collectorId: "c2" });
  await accounts.linkAccount({ subject: SUBJECTS.northline, role: "tp", partnerId: "p1" });
  await accounts.linkAccount({ subject: SUBJECTS.second, role: "tp", partnerId: "p2" });
  const retired = await accounts.linkAccount({ subject: SUBJECTS.retired, role: "collector", collectorId: "c3" });
  await accounts.disableAccount(retired.accountId);
  /* An account whose actor the world does not have. */
  await accounts.linkAccount({ subject: SUBJECTS.ghost, role: "collector", collectorId: "c404" });
  const verifier = fakeVerifier();
  const app = createApp({ repository, accounts, verifier, runtime: runtimeFor() });
  return { pg, db, repository: base, accounts, verifier, app };
}

const get = (app, subject, url = "/api/view") => app.inject({ method: "GET", url, headers: subject ? bearer(subject) : {} });
const send = (app, subject, body, url = "/api/commands") => app.inject({ method: "POST", url,
  headers: { ...(subject ? bearer(subject) : {}), "content-type": "application/json" }, payload: body });

async function dump(pg) {
  const tables = (await pg.query("select table_name from information_schema.tables where table_schema = 'metyet' order by 1")).rows;
  const out = [];
  for (const { table_name: t } of tables) {
    out.push(t, (await pg.query(`select to_jsonb(x) as r from metyet.${t} x`)).rows.map((r) => JSON.stringify(r.r)).sort().join("|"));
  }
  return out.join("\n");
}
const absent = (body, values, who) => values.forEach(([label, value]) =>
  assert(!body.includes(String(value)), `${who} received ${label}`));

/* ============================================================== A */
describe("A. authentication", () => {
  test("without a bearer token there is no answer", async () => {
    const { app } = await serve();
    for (const headers of [{}, { authorization: "" }, { authorization: "Basic aGk6dGhlcmU=" },
      { authorization: "Bearer" }, { authorization: "Bearer " }, { authorization: "token-for:sub-casey" }]) {
      const res = await app.inject({ method: "GET", url: "/api/view", headers });
      eq(res.statusCode, 401, JSON.stringify(headers));
      eq(res.json().error.code, "unauthenticated", "code");
    }
  });

  test("a token the verifier rejects is refused, and the reason stays on the server", async () => {
    const { app } = await serve();
    const res = await app.inject({ method: "GET", url: "/api/view", headers: { authorization: "Bearer forged.token.here" } });
    eq(res.statusCode, 401);
    eq(res.json().error.code, "unauthenticated");
    assert(!/signature|reason|verif/i.test(res.body), "the body explains nothing about the failure: " + res.body);
    assert(res.json().error.requestId, "a request id to quote");
  });

  test("commands need the same authentication as reads", async () => {
    const { app } = await serve();
    const res = await send(app, null, { command: "addGoal", payload: { cardId: "k2" } });
    eq(res.statusCode, 401);
    eq(res.json().error.code, "unauthenticated");
  });

  test("the token is verified on every request", async () => {
    const { app, verifier } = await serve();
    await get(app, SUBJECTS.casey);
    await get(app, SUBJECTS.casey);
    eq(verifier.calls.length, 2, "no cached authority");
  });
});

/* ============================================================== B */
describe("B. account to actor mapping", () => {
  test("a verified stranger with no account is refused", async () => {
    const { app } = await serve();
    const res = await get(app, SUBJECTS.stranger);
    eq(res.statusCode, 403);
    eq(res.json().error.code, "account_not_provisioned");
  });

  test("a disabled account is refused, and says so", async () => {
    const { app } = await serve();
    const res = await get(app, SUBJECTS.retired);
    eq(res.statusCode, 403);
    eq(res.json().error.code, "account_disabled");
  });

  test("an account naming an actor the world does not have is refused by name", async () => {
    const { app } = await serve();
    const res = await get(app, SUBJECTS.ghost);
    eq(res.statusCode, 403);
    eq(res.json().error.code, "actor_unknown");
    assert(!res.body.includes("c404"), "and does not echo the mapping");
  });

  test("the database refuses an ambiguous mapping: one active account per subject and per actor", async () => {
    const { accounts } = await serve();
    const rejected = async (fn, what) => {
      try { await fn(); } catch (e) { assert(e instanceof AccountError, what + " — " + e.message); return e; }
      throw new Error(what + " — it was allowed");
    };
    await rejected(() => accounts.linkAccount({ subject: SUBJECTS.casey, role: "collector", collectorId: "c3" }), "second account for one subject");
    await rejected(() => accounts.linkAccount({ subject: "sub-new", role: "collector", collectorId: "c1" }), "second account for one collector");
    await rejected(() => accounts.linkAccount({ subject: "sub-new", role: "tp", partnerId: "p1" }), "second account for one partner");
    await rejected(() => accounts.linkAccount({ subject: "sub-new", role: "collector", collectorId: "c9", partnerId: "p9" }), "two actors at once");
    await rejected(() => accounts.linkAccount({ subject: "sub-new", role: "tp", collectorId: "c9" }), "role and actor disagree");
    await rejected(() => accounts.linkAccount({ subject: "", role: "collector", collectorId: "c9" }), "no subject");
    await rejected(() => accounts.linkAccount({ subject: "sub-new", role: "admin", collectorId: "c9" }), "an unknown role");
  });

  test("the table itself refuses a malformed mapping written around the directory", async () => {
    const { pg } = await serve();
    const rejected = async (sql, what) => {
      try { await pg.query(sql); } catch (e) { return e; }
      throw new Error(what + " — the database allowed it");
    };
    const insert = (cols, vals) => `insert into metyet_auth.accounts (id, subject, ${cols}) values ('x1', 'sub-x', ${vals})`;
    await rejected(insert("role, collector_id", "'tp', 'c1'"), "a tp account naming a collector");
    await rejected(insert("role, partner_id", "'collector', 'p1'"), "a collector account naming a partner");
    await rejected(insert("role, collector_id, partner_id", "'collector', 'c9', 'p9'"), "two actors at once");
    await rejected(insert("role", "'collector'"), "no actor at all");
    await rejected(insert("role, collector_id", "'admin', 'c9'"), "an unknown role");
    await rejected(insert("role, collector_id, status", "'collector', 'c9', 'retired'"), "an unknown status");
    await rejected(insert("role, collector_id, status", "'collector', 'c9', 'disabled'"), "disabled without a time");
  });

  test("an actor can be re-provisioned after the old account is disabled", async () => {
    const { accounts, app } = await serve();
    const casey = await accounts.findActiveBySubject(SUBJECTS.casey);
    await accounts.disableAccount(casey.accountId);
    eq((await get(app, SUBJECTS.casey)).statusCode, 403, "the old sign-in stops working");
    await accounts.linkAccount({ subject: "sub-casey-new-phone", role: "collector", collectorId: "c1" });
    eq((await get(app, "sub-casey-new-phone")).statusCode, 200, "the new one works");
  });

  test("the directory maps a subject to one actor and carries nothing else", async () => {
    const { accounts } = await serve();
    const account = await accounts.findActiveBySubject(SUBJECTS.northline);
    eq(JSON.stringify(account.actor), JSON.stringify({ partnerId: "p1" }), "the domain's actor shape");
    eq(Object.keys(account).sort().join(), "accountId,actor,role,status,subject", "no email, no name, no claims");
    eq(await accounts.findActiveBySubject("sub-nobody"), null, "an unknown subject maps to nothing");
  });
});

/* ============================================================== C */
describe("C. the read endpoint is a projection", () => {
  test("a collector receives their own projection and the world version", async () => {
    const { app, repository } = await serve();
    const res = await get(app, SUBJECTS.casey);
    eq(res.statusCode, 200);
    const body = res.json();
    eq(JSON.stringify(body.state.actor), JSON.stringify({ seat: "collector", collectorId: "c1" }), "the actor is the account's");
    eq(body.version, await repository.readVersion(), "the version it was read at");
    eq(Object.keys(body).sort().join(), "state,version", "nothing else is returned");
    eq(body.state.goals.length, 1, "own goals only");
    eq(body.state.partners.map((p) => p.id).sort().join(), "p1,p2", "their Trusted Partners");
  });

  test("a Trusted Partner receives their own projection", async () => {
    const { app } = await serve();
    const body = (await get(app, SUBJECTS.northline)).json();
    eq(JSON.stringify(body.state.actor), JSON.stringify({ seat: "tp", partnerId: "p1" }));
    eq(body.state.collectors.map((c) => c.id).sort().join(), "c1,c2", "their Collector Network");
    eq(body.state.inventory.map((i) => i.invId).sort().join(), "i1,i2", "their own stock");
  });

  test("no response carries the canonical world", async () => {
    const { app } = await serve();
    for (const subject of [SUBJECTS.casey, SUBJECTS.northline]) {
      const body = (await get(app, subject)).json();
      assert(!("world" in body) && !("canonical" in body), "no world field");
      assert(body.state.actor, "a projection, which the canonical world has no notion of");
    }
  });
});

/* ============================================================== D */
describe("D. privacy, adversarially", () => {
  test("a collector never receives another party's private data", async () => {
    const { app } = await serve();
    const body = (await get(app, SUBJECTS.casey)).body;
    absent(body, [["a partner's acquisition cost", MARK.cost], ["another partner's cost", MARK.p2Cost],
      ["a partner's default trade %", MARK.rate], ["a partner's private note", MARK.relNote],
      ["another partner's note", MARK.p2Note], ["another collector's goal note", MARK.danaGoalNote],
      ["another collector's binder value", MARK.binderDana], ["a partner's activity", MARK.activity],
      ["another collector's message", MARK.danaMessage]], "Casey");
    const state = JSON.parse(body).state;
    eq(state.activity.length, 0, "activity is partner-private");
    eq(state.collectors.map((c) => c.id).join(), "c1", "no other collector");
    assert(state.binder.every((b) => b.collectorId === "c1"), "only their own binder");
  });

  test("the Trusted Partner's acquisition cost stays with the Trusted Partner", async () => {
    const { app } = await serve();
    const mine = (await get(app, SUBJECTS.northline)).body;
    assert(mine.includes(String(MARK.cost)), "Northline sees its own cost");
    absent((await get(app, SUBJECTS.casey)).body, [["Northline's cost", MARK.cost]], "Casey");
    absent((await get(app, SUBJECTS.second)).body, [["another partner's cost", MARK.cost],
      ["another partner's ask", MARK.ask]], "Second");
    absent((await get(app, SUBJECTS.dana)).body, [["Northline's cost", MARK.cost]], "Dana");
  });

  test("a Trusted Partner never receives a collector's private value or an unrelated collector", async () => {
    const { app } = await serve();
    const body = (await get(app, SUBJECTS.northline)).body;
    absent(body, [["Casey's binder reference value", MARK.binderCasey],
      ["Dana's binder reference value", MARK.binderDana], ["another partner's note", MARK.p2Note],
      ["another partner's cost", MARK.p2Cost]], "Northline");
    const state = JSON.parse(body).state;
    assert(!state.collectors.some((c) => c.id === "c3"), "an unrelated collector is not in the network");
    assert(!state.goals.some((g) => g.collectorId === "c3"), "nor are their goals");
  });

  test("a partner outside the relationship receives nothing of it", async () => {
    const { app } = await serve();
    const state = (await get(app, SUBJECTS.second)).json().state;
    eq(state.collectors.map((c) => c.id).join(), "c1", "only its own network");
    assert(!state.goals.some((g) => g.collectorId === "c2"), "no goals of a collector it does not know");
    assert(state.binder.every((b) => b.collectorId === "c1"), "no binder outside the network");
  });

  test("reading positions stay with the seat that read", async () => {
    const { app, repository } = await serve();
    const started = await send(app, SUBJECTS.casey, { command: "startOpportunity", payload: { goalId: "g1", invId: "i1", amount: 900 } });
    eq(started.statusCode, 200, started.body);
    const oppId = started.json().value;
    eq((await send(app, SUBJECTS.casey, { command: "markDealViewed", payload: { oppId, surface: "messages" } })).statusCode, 200);
    eq((await send(app, SUBJECTS.northline, { command: "markDealViewed", payload: { oppId, surface: "timeline" } })).statusCode, 200);
    const canonical = (await repository.loadWorld()).opportunities[0].viewedAt;
    assert(canonical.collector && canonical.tp, "canonical state keeps both");
    const casey = (await get(app, SUBJECTS.casey)).json().state.opportunities[0];
    const northline = (await get(app, SUBJECTS.northline)).json().state.opportunities[0];
    eq(Object.keys(casey.viewedAt).join(), "collector", "Casey receives only her own");
    eq(Object.keys(northline.viewedAt).join(), "tp", "Northline only its own");
    assert(!(await get(app, SUBJECTS.casey)).body.includes(canonical.tp.timeline), "no read receipt crosses");
    assert(!(await get(app, SUBJECTS.northline)).body.includes(canonical.collector.messages), "in either direction");
  });
});

/* ============================================================== E */
describe("E. the command endpoint", () => {
  test("a valid command runs through the durable seam and is readable afterwards", async () => {
    const { app, repository, pg } = await serve();
    const before = await repository.readVersion();
    const res = await send(app, SUBJECTS.casey, { command: "addGoal", payload: { cardId: "k2", tier: "primary" } });
    eq(res.statusCode, 200, res.body);
    const body = res.json();
    eq(body.ok, true);
    eq(body.version, before + 1, "the version advanced once");
    eq(Object.keys(body).sort().join(), "ok,state,value,version", "the response shape");
    const stored = (await repository.loadWorld()).goals.find((g) => g.id === body.value);
    assert(stored, "persisted");
    eq(stored.collectorId, "c1", "owned by the authenticated actor");
    assert(body.state.goals.some((g) => g.id === body.value), "and it is in the projection returned");
    eq((await pg.query("select count(*)::int as n from metyet.goals")).rows[0].n, 4, "a row, not a cache");
  });

  test("the response is the actor's projection, never the world", async () => {
    const { app } = await serve();
    const body = (await send(app, SUBJECTS.northline, { command: "updatePartnerProfile", payload: { patch: { about: "Vintage" } } })).json();
    assert(!("world" in body), "no world");
    eq(JSON.stringify(body.state.actor), JSON.stringify({ seat: "tp", partnerId: "p1" }));
    absent(JSON.stringify(body), [["another partner's cost", MARK.p2Cost], ["a collector's binder value", MARK.binderCasey]], "the command response");
  });

  test("the server's runtime owns the ids and the times", async () => {
    const { app, repository } = await serve();
    const res = await send(app, SUBJECTS.casey, { command: "addGoal", payload: { cardId: "k2" } });
    const id = res.json().value;
    assert(/^g\d{6}$/.test(id), "the runtime minted the id: " + id);
    const goal = (await repository.loadWorld()).goals.find((g) => g.id === id);
    eq(goal.since, "2030-01-01T00:00:00.000Z", "and the time");
    const production = createApp({ repository, accounts: { findActiveBySubject: async () => null }, verifier: fakeVerifier() });
    assert(production, "the default runtime is the system runtime");
    let threw = null;
    try { createApp({ repository, accounts: { findActiveBySubject: async () => null }, verifier: fakeVerifier(), runtime: RT.prototypeRuntime() }); }
    catch (e) { threw = e; }
    assert(threw instanceof TypeError, "and the prototype runtime cannot be wired in");
  });

  test("a refused command answers with the rule and writes nothing", async () => {
    const { app, pg } = await serve();
    const before = await dump(pg);
    const res = await send(app, SUBJECTS.northline, { command: "addGoal", payload: { cardId: "k2" } });
    eq(res.statusCode, 409, res.body);
    const body = res.json();
    eq(body.error.code, "command_refused");
    eq(body.error.refused, "not-owner", "the domain's own code");
    assert(body.error.requestId, "with a request id");
    eq(await dump(pg), before, "the database is untouched");
  });

  test("an unknown or malformed command is answered safely", async () => {
    const { app, pg } = await serve();
    const before = await dump(pg);
    const unknown = await send(app, SUBJECTS.casey, { command: "dropEverything", payload: {} });
    eq(unknown.statusCode, 409);
    eq(unknown.json().error.refused, "unknown-command");
    for (const body of [{}, { command: "" }, { command: 7 }, { command: "addGoal", payload: [] },
      { command: "addGoal", payload: "k2" }, { command: "addGoal", extra: 1 }, "not-an-object"]) {
      const res = await send(app, SUBJECTS.casey, body);
      eq(res.statusCode, 400, JSON.stringify(body));
      eq(res.json().error.code, "invalid_request");
    }
    const broken = await app.inject({ method: "POST", url: "/api/commands",
      headers: { ...bearer(SUBJECTS.casey), "content-type": "application/json" }, payload: "{not json" });
    eq(broken.statusCode, 400, "malformed JSON");
    eq(broken.json().error.code, "invalid_request");
    eq(await dump(pg), before, "nothing was written by any of it");
  });

  test("a full deal runs through the API, seat by seat", async () => {
    const { app, repository } = await serve();
    const started = await send(app, SUBJECTS.casey, { command: "startOpportunity", payload: { goalId: "g1", invId: "i1", amount: 900 } });
    const oppId = started.json().value;
    const steps = [
      [SUBJECTS.northline, "acceptPrice", { oppId }],
      [SUBJECTS.casey, "proposeTradeSelection", { oppId, binderIds: ["b1"] }],
      [SUBJECTS.northline, "reviewTradeCard", { oppId, decision: "accepted" }],
    ];
    for (const [subject, command, payload] of steps) {
      const res = await send(app, subject, { command, payload });
      eq(res.statusCode, 200, `${command}: ${res.body}`);
    }
    const world = await repository.loadWorld();
    eq(world.opportunities[0].stage, "value-trade", "the deal advanced");
    const caseyView = (await get(app, SUBJECTS.casey)).json().state.opportunities[0];
    assert(!("tradeRate" in caseyView), "and the partner's trade % never crossed");
  });
});

/* ============================================================== F */
describe("F. authority cannot be claimed by a request", () => {
  test("a request cannot name another actor", async () => {
    const { app } = await serve();
    const spoofed = await app.inject({ method: "GET", url: "/api/view?actor=p1&collectorId=c2",
      headers: { ...bearer(SUBJECTS.casey), "x-metyet-actor": "p1", "x-actor-id": "c2" } });
    eq(spoofed.statusCode, 200);
    eq(JSON.stringify(spoofed.json().state.actor), JSON.stringify({ seat: "collector", collectorId: "c1" }), "still Casey");
    absent(spoofed.body, [["Northline's cost", MARK.cost]], "the spoofed read");
  });

  test("authority fields in a body or payload are rejected outright", async () => {
    const { app, pg } = await serve();
    const before = await dump(pg);
    const bodies = [
      { command: "addGoal", payload: { cardId: "k2" }, actor: { partnerId: "p1" } },
      { command: "addGoal", payload: { cardId: "k2" }, account: "someone-else" },
      ...FORBIDDEN_PAYLOAD_KEYS.map((key) => ({ command: "addGoal", payload: { cardId: "k2", [key]: "p1" } })),
    ];
    for (const body of bodies) {
      const res = await send(app, SUBJECTS.casey, body);
      eq(res.statusCode, 400, JSON.stringify(body));
      eq(res.json().error.code, "invalid_request");
    }
    /* Written as raw JSON, because an object literal cannot carry these keys. */
    for (const raw of ['{"command":"addGoal","payload":{"cardId":"k2","__proto__":{"admin":true}}}',
      '{"command":"addGoal","payload":{"cardId":"k2","nested":{"constructor":{"x":1}}}}',
      '{"command":"addGoal","payload":{"cardId":"k2","at":"1999-01-01"}}']) {
      const res = await app.inject({ method: "POST", url: "/api/commands",
        headers: { ...bearer(SUBJECTS.casey), "content-type": "application/json" }, payload: raw });
      eq(res.statusCode, 400, raw);
      eq(res.json().error.code, "invalid_request", raw);
    }
    eq(await dump(pg), before, "nothing written");
  });

  test("legitimate domain ids in a payload still work, and still grant nothing", async () => {
    const { app, repository } = await serve();
    /* A Trusted Partner names the collector its note is about: legitimate. */
    const note = await send(app, SUBJECTS.northline, { command: "recordNote",
      payload: { collectorId: "c2", cardId: "k1", activity: { type: "manual", text: "Called Dana" } } });
    eq(note.statusCode, 200, note.body);
    /* A collector names the partner it is writing to: legitimate. */
    const message = await send(app, SUBJECTS.casey, { command: "sendMessage", payload: { partnerId: "p1", cardId: "k1", text: "Still keen" } });
    eq(message.statusCode, 200, message.body);
    const world = await repository.loadWorld();
    eq(world.activity[0].partnerId, "p1", "the note belongs to the authenticated partner");
    eq(world.conversations[0].collectorId, "c1", "the message belongs to the authenticated collector");
  });

  test("naming another party's record does not act for them", async () => {
    const { app, pg } = await serve();
    const before = await dump(pg);
    const cases = [
      [SUBJECTS.casey, { command: "updateGoalTier", payload: { goalId: "g2", tier: "secondary" } }, "not-owner"],
      [SUBJECTS.casey, { command: "updateInventoryCopy", payload: { invId: "i1", patch: { ask: 1 } } }, "not-owner"],
      [SUBJECTS.dana, { command: "startOpportunity", payload: { goalId: "g1", invId: "i1", amount: 900 } }, "not-owner"],
      [SUBJECTS.second, { command: "markBinderReviewed", payload: { collectorId: "c2" } }, "no-relationship"],
    ];
    for (const [subject, body, refused] of cases) {
      const res = await send(app, subject, body);
      eq(res.statusCode, 409, JSON.stringify(body));
      eq(res.json().error.refused, refused, JSON.stringify(body));
    }
    eq(await dump(pg), before, "and nothing was written");
  });
});

/* ============================================================== G */
describe("G. failures, health and the error vocabulary", () => {
  test("liveness needs no database; readiness reports the database", async () => {
    const { app } = await serve();
    const live = await app.inject({ method: "GET", url: "/api/health/live" });
    eq(live.statusCode, 200); eq(live.json().status, "ok");
    const ready = await app.inject({ method: "GET", url: "/api/health/ready" });
    eq(ready.statusCode, 200); eq(ready.json().status, "ready");
    assert(!("version" in ready.json()), "readiness says nothing about the world");
  });

  test("an unreachable database is a 503, not a stack trace", async () => {
    const { app } = await serve({ repositoryWrapper: (repo) => ({ ...repo,
      readVersion: async () => { const e = new Error("connect ECONNREFUSED 10.0.0.1:5432"); e.code = "persistence.database"; throw e; },
      withTransaction: async () => { const e = new Error("connect ECONNREFUSED 10.0.0.1:5432"); e.code = "persistence.database"; throw e; } }) });
    const ready = await app.inject({ method: "GET", url: "/api/health/ready" });
    eq(ready.statusCode, 503); eq(ready.json().status, "unavailable");
    const view = await get(app, SUBJECTS.casey);
    eq(view.statusCode, 503);
    eq(view.json().error.code, "service_unavailable");
    assert(!/ECONNREFUSED|10\.0\.0\.1|5432/.test(view.body), "no infrastructure detail: " + view.body);
  });

  test("an internal failure never reaches the client", async () => {
    const { app } = await serve({ repositoryWrapper: (repo) => ({ ...repo,
      withTransaction: async () => { throw new Error("TypeError: cannot read property 'attrs' of undefined at Object.<anonymous> (/app/persistence/world-repository.js:42)"); } }) });
    const res = await get(app, SUBJECTS.casey);
    eq(res.statusCode, 500);
    const body = res.json();
    eq(body.error.code, "internal_error");
    eq(body.error.message, API_ERRORS.internal_error.message);
    assert(!/world-repository|TypeError|attrs|at Object/.test(res.body), "no stack, file or internals: " + res.body);
    assert(body.error.requestId, "but a request id to correlate with the log");
  });

  test("a world that moved under a command is a retryable conflict", async () => {
    const { app } = await serve({ repositoryWrapper: (repo) => ({ ...repo,
      loadWorld: async (tx) => { const w = await repo.loadWorld(tx); if (tx) await tx.query("update metyet.world_meta set version = version + 1"); return w; } }) });
    const res = await send(app, SUBJECTS.casey, { command: "addGoal", payload: { cardId: "k2" } });
    eq(res.statusCode, 409);
    eq(res.json().error.code, "state_changed");
  });

  test("unknown routes and methods answer in the same vocabulary", async () => {
    const { app } = await serve();
    for (const url of ["/", "/api", "/api/world", "/api/view/all"]) {
      const res = await app.inject({ method: "GET", url, headers: bearer(SUBJECTS.casey) });
      eq(res.statusCode, 404, url);
      eq(res.json().error.code, "not_found", url);
    }
    const wrongMethod = await app.inject({ method: "DELETE", url: "/api/view", headers: bearer(SUBJECTS.casey) });
    eq(wrongMethod.statusCode, 404, "no route");
  });

  test("the log never carries a bearer token or an account's claims", async () => {
    const lines = [];
    const stream = { write: (line) => lines.push(line) };
    const { repository, accounts, verifier } = await serve();
    const app = createApp({ repository, accounts, verifier, runtime: runtime(), logger: { level: "info", stream } });
    await app.inject({ method: "GET", url: "/api/view", headers: bearer(SUBJECTS.casey) });
    await app.inject({ method: "GET", url: "/api/view", headers: { authorization: "Bearer forged.token.here" } });
    const log = lines.join("\n");
    assert(log.length > 0, "the server did log the requests");
    assert(!log.includes("token-for:"), "no bearer token in the log");
    assert(!log.includes("forged.token.here"), "not even a rejected one");
    assert(!/authorization/i.test(log), "and no authorization header at all");
  });

  test("no response invites a browser to use it from another origin", async () => {
    const { app } = await serve();
    const res = await app.inject({ method: "GET", url: "/api/view", headers: { ...bearer(SUBJECTS.casey), origin: "https://evil.example" } });
    assert(!res.headers["access-control-allow-origin"], "no CORS was configured");
  });
});

/* ============================================================== H */
describe("H. token verification", () => {
  const ISSUER = "https://project.supabase.co/auth/v1";
  const AUDIENCE = "authenticated";
  const JWKS_URL = "https://project.supabase.co/auth/v1/.well-known/jwks.json";

  /* One ES256 key pair, published as a JWKS the verifier fetches through an
     injected fetch — no network, no provider account. */
  async function keys(kid = "key-1") {
    const jose = await import("jose");
    const { publicKey, privateKey } = await jose.generateKeyPair("ES256", { extractable: true });
    const jwk = { ...(await jose.exportJWK(publicKey)), kid, alg: "ES256", use: "sig" };
    return { jose, privateKey, jwk };
  }
  const sign = async (jose, privateKey, claims = {}, header = {}) => new jose.SignJWT({ ...claims })
    .setProtectedHeader({ alg: "ES256", kid: "key-1", ...header })
    .setIssuer(claims.iss === null ? undefined : ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(claims.sub || "sub-casey")
    .setIssuedAt()
    .setExpirationTime(claims.exp || "1h")
    .sign(privateKey);

  test("a properly signed token yields the provider's subject and nothing else", async () => {
    const { jose, privateKey, jwk } = await keys();
    let fetches = 0;
    const verifier = createTokenVerifier({ jwksUrl: JWKS_URL, issuer: ISSUER, audience: AUDIENCE,
      fetchJwks: async () => { fetches += 1; return { keys: [jwk] }; } });
    const token = await sign(jose, privateKey, { sub: "sub-casey", email: "casey@example.test", role: "service_role" });
    const verified = await verifier.verify(token);
    eq(verified.subject, "sub-casey");
    eq(Object.keys(verified).sort().join(), "expiresAt,subject", "no claims are handed on");
    await verifier.verify(token);
    eq(fetches, 1, "the key set is cached");
  });

  const rejected = async (verifier, token, what) => {
    try { await verifier.verify(token); } catch (e) {
      eq(e.code, "token.invalid", what + " — " + e.message);
      return e;
    }
    throw new Error(what + " — it was accepted");
  };

  test("a token that is expired, misaddressed, unsigned or tampered with is refused", async () => {
    const { jose, privateKey, jwk } = await keys();
    const verifier = createTokenVerifier({ jwksUrl: JWKS_URL, issuer: ISSUER, audience: AUDIENCE,
      fetchJwks: async () => ({ keys: [jwk] }) });
    const expired = await new jose.SignJWT({}).setProtectedHeader({ alg: "ES256", kid: "key-1" })
      .setIssuer(ISSUER).setAudience(AUDIENCE).setSubject("sub-casey")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200).setExpirationTime(Math.floor(Date.now() / 1000) - 3600).sign(privateKey);
    eq((await rejected(verifier, expired, "expired")).reason, "expired");
    const wrongIssuer = await new jose.SignJWT({}).setProtectedHeader({ alg: "ES256", kid: "key-1" })
      .setIssuer("https://attacker.example").setAudience(AUDIENCE).setSubject("s").setIssuedAt().setExpirationTime("1h").sign(privateKey);
    eq((await rejected(verifier, wrongIssuer, "another issuer")).reason, "claims");
    const wrongAudience = await new jose.SignJWT({}).setProtectedHeader({ alg: "ES256", kid: "key-1" })
      .setIssuer(ISSUER).setAudience("someone-else").setSubject("s").setIssuedAt().setExpirationTime("1h").sign(privateKey);
    eq((await rejected(verifier, wrongAudience, "another audience")).reason, "claims");
    const noExpiry = await new jose.SignJWT({}).setProtectedHeader({ alg: "ES256", kid: "key-1" })
      .setIssuer(ISSUER).setAudience(AUDIENCE).setSubject("s").setIssuedAt().sign(privateKey);
    eq((await rejected(verifier, noExpiry, "no expiry")).reason, "no-expiry");
    const good = await sign(jose, privateKey);
    const [head, body, signature] = good.split(".");
    const tampered = [head, Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), sub: "sub-northline" })).toString("base64url"), signature].join(".");
    await rejected(verifier, tampered, "a tampered payload");
    await rejected(verifier, `${head}.${body}.`, "an empty signature");
    for (const junk of ["", "abc", "a.b", "a.b.c.d", null, 42, {}]) await rejected(verifier, junk, "junk: " + JSON.stringify(junk));
  });

  test("a token signed with the public key as a shared secret is refused", async () => {
    const { jose, privateKey, jwk } = await keys();
    const verifier = createTokenVerifier({ jwksUrl: JWKS_URL, issuer: ISSUER, audience: AUDIENCE,
      fetchJwks: async () => ({ keys: [jwk] }) });
    const forged = await new jose.SignJWT({}).setProtectedHeader({ alg: "HS256", kid: "key-1" })
      .setIssuer(ISSUER).setAudience(AUDIENCE).setSubject("sub-northline").setIssuedAt().setExpirationTime("1h")
      .sign(new TextEncoder().encode(JSON.stringify(jwk)));
    await rejected(verifier, forged, "algorithm confusion");
    const unsigned = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: "sub-northline", exp: 9999999999 })).toString("base64url")}.`;
    await rejected(verifier, unsigned, "alg none");
    let threw = null;
    try { createTokenVerifier({ jwksUrl: JWKS_URL, issuer: ISSUER, algorithms: ["HS256"] }); } catch (e) { threw = e; }
    assert(threw instanceof TypeError, "a symmetric algorithm cannot even be configured");
    void privateKey;
  });

  test("an unknown key is refused, and a rotated key is picked up once", async () => {
    const first = await keys("key-1");
    const second = await keys("key-2");
    let published = [first.jwk];
    let fetches = 0;
    const verifier = createTokenVerifier({ jwksUrl: JWKS_URL, issuer: ISSUER, audience: AUDIENCE,
      refreshCooldownMs: 0, fetchJwks: async () => { fetches += 1; return { keys: published }; } });
    eq((await verifier.verify(await sign(first.jose, first.privateKey))).subject, "sub-casey", "the published key works");
    const rotatedToken = await sign(second.jose, second.privateKey, {}, { kid: "key-2" });
    await rejected(verifier, rotatedToken, "a key that was never published");
    published = [first.jwk, second.jwk];
    eq((await verifier.verify(rotatedToken)).subject, "sub-casey", "after rotation it verifies");
    assert(fetches >= 2, "the key set was refreshed");
  });

  test("the verifier refuses to be built without a trustworthy source", async () => {
    const bad = [{}, { jwksUrl: "not-a-url", issuer: "x" }, { jwksUrl: "ftp://x/y", issuer: "x" }, { jwksUrl: JWKS_URL },
      /* A key set fetched over plaintext is every session at once: whoever is
         on the wire substitutes the keys and mints their own tokens. The host
         is compared after parsing, so a lookalike is not a loopback. */
      { jwksUrl: "http://project.supabase.co/auth/v1/.well-known/jwks.json", issuer: "x" },
      { jwksUrl: "http://localhost.example.com/auth/v1/.well-known/jwks.json", issuer: "x" }];
    for (const options of bad) {
      let threw = null;
      try { createTokenVerifier(options); } catch (e) { threw = e; }
      assert(threw instanceof TypeError, JSON.stringify(options));
    }
    /* Loopback is for local development, and still builds. */
    assert(createTokenVerifier({ jwksUrl: "http://localhost:54321/auth/v1/.well-known/jwks.json", issuer: "x" }),
      "a local provider is usable");
  });
});

/* ============================================================== I */
describe("I. configuration", () => {
  const ENV = { DATABASE_URL: "postgresql://user:hunter2@db.example:5432/metyet",
    SUPABASE_URL: "https://project.supabase.co/", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example", PORT: "8080" };

  test("configuration comes from the environment and derives the provider's endpoints", () => {
    const config = loadServerConfig(ENV);
    eq(config.auth.jwksUrl, "https://project.supabase.co/auth/v1/.well-known/jwks.json");
    eq(config.auth.issuer, "https://project.supabase.co/auth/v1");
    eq(config.auth.audience, "authenticated");
    eq(config.auth.userUrl, "https://project.supabase.co/auth/v1/user", "where registration asks about a person");
    eq(config.port, 8080);
    eq(JSON.stringify(config.database.ssl), JSON.stringify({ rejectUnauthorized: true }), "TLS on by default");
    eq(loadServerConfig({ ...ENV, DATABASE_SSL: "no-verify" }).database.ssl.rejectUnauthorized, false, "a provider chain can be trusted loosely");
    eq(loadServerConfig({ ...ENV, DATABASE_SSL: "disable" }).database.ssl, false, "and disabled for a local database");
  });

  test("a missing setting stops the server and names what is missing, never its value", () => {
    let threw = null;
    try { loadServerConfig({ DATABASE_SSL: "sometimes" }); } catch (e) { threw = e; }
    assert(threw && threw.code === "config.invalid", "it refuses to start");
    assert(/DATABASE_URL/.test(threw.message) && /SUPABASE_URL/.test(threw.message), threw.message);
    assert(/SUPABASE_PUBLISHABLE_KEY/.test(threw.message), "including the key registration needs: " + threw.message);
    /* Its older name is accepted, and a SECRET key is refused rather than used. */
    eq(loadServerConfig({ ...ENV, SUPABASE_PUBLISHABLE_KEY: "", SUPABASE_ANON_KEY: "sb_publishable_old" }).auth.apiKey,
      "sb_publishable_old", "SUPABASE_ANON_KEY still works");
    let secret = null;
    try { loadServerConfig({ ...ENV, SUPABASE_PUBLISHABLE_KEY: "sb_secret_abc123" }); } catch (e) { secret = e; }
    assert(secret && /publishable/.test(secret.message), "a secret key is refused");
    assert(secret && !/sb_secret_abc123/.test(secret.message), "and the message does not repeat it");
    let leaked = null;
    try { loadServerConfig({ ...ENV, PORT: "0" }); } catch (e) { leaked = e; }
    assert(leaked && !/hunter2/.test(leaked.message), "no secret in the message");
    assert(!/hunter2/.test(JSON.stringify(describeConfig(loadServerConfig(ENV)))), "nor in what is logged at startup");
  });
});

/* ============================================================== J */
describe("J. boundaries and composition", () => {
  const serverFiles = () => {
    const out = [];
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".js")) out.push([path.relative(ROOT, full), fs.readFileSync(full, "utf8")]);
    });
    walk(path.join(ROOT, "server"));
    return out;
  };
  const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  test("the server never imports demo state, a client bundle or the prototype store", () => {
    for (const [file, text] of serverFiles()) {
      const body = code(text);
      assert(!/buildCanonicalSeed|createStore|dist\/|\.\.\/src\/|\.\.\/collector\/|\.\.\/shell\//.test(body), file + " reaches into the prototype");
    }
  });

  test("the server owns no product rule and no second way to write", () => {
    /* Three files are allowed what the rest are not, and only these three:
       server/bootstrap.js writes the world directly — but only the empty one,
       only when there is none, and only from an operator command (Batch 4's
       suite holds it to that); server/registration.js writes it when a Trusted
       Partner redeems an invitation, through the domain's own registration
       module and never around it (Batch 5's suite holds it to that);
       server/db-pool.js is where the driver lives. */
    const MAY_WRITE_WORLD = ["server/bootstrap.js", "server/registration.js"];
    const UNREACHABLE_FROM_ROUTES = ["server/bootstrap.js"];
    const MAY_KNOW_DRIVER = ["server/db-pool.js"];
    for (const [file, text] of serverFiles()) {
      const body = code(text);
      assert(!/metyet-commands|isRelated|nextActor|COMMANDS\[/.test(body), file + " reimplements or reaches around the command layer");
      if (!MAY_WRITE_WORLD.includes(file)) assert(!/saveWorld\(/.test(body), file + " writes state outside executeCommand");
      if (!MAY_KNOW_DRIVER.includes(file)) assert(!/require\(["']pg["']\)/.test(body), file + " knows a database driver");
    }
    const app = code(fs.readFileSync(path.join(ROOT, "server", "app.js"), "utf8"));
    assert(/executeCommand\(repository/.test(app), "writes go through the canonical command transaction");
    assert(/projectForActor\(/.test(app), "and reads through the projection");
    /* One exemption cannot leak into a request at all: nothing the HTTP app
       loads can reach bootstrap, so no route can create or overwrite a world.
       The other is reachable on purpose, and is held to a narrower rule — it
       authors through the domain, and only what the domain gives it. */
    const registration = code(fs.readFileSync(path.join(ROOT, "server", "registration.js"), "utf8"));
    assert(/registerPartner\(/.test(registration), "registration authors through the domain");
    assert(/validateWorld\(/.test(registration), "and validates what the domain produced");
    assert(/expectedVersion: version/.test(registration), "and saves only the version it loaded");
    assert(!/partners:\s*\[|\.partners\s*=/.test(registration), "it never assembles a partner itself");
    const reachable = new Set();
    const follow = (relative) => {
      if (reachable.has(relative)) return;
      reachable.add(relative);
      const full = path.join(ROOT, relative);
      if (!fs.existsSync(full)) return;
      for (const match of code(fs.readFileSync(full, "utf8")).matchAll(/require\(["'](\.[^"']+)["']\)/g)) {
        follow(path.relative(ROOT, path.resolve(path.dirname(full), match[1])));
      }
    };
    follow("server/app.js");
    UNREACHABLE_FROM_ROUTES.forEach((file) => assert(!reachable.has(file), file + " is reachable from an HTTP route"));
  });

  test("no credential, token or connection string is committed", () => {
    for (const [file, text] of [...serverFiles(), ["persistence/migrations/0002_accounts.sql",
      fs.readFileSync(path.join(ROOT, "persistence", "migrations", "0002_accounts.sql"), "utf8")]]) {
      assert(!/eyJ[A-Za-z0-9_-]{20,}/.test(text), file + " contains something that looks like a token");
      assert(!/postgres(ql)?:\/\/[^\s"']*:[^\s"']*@/.test(text), file + " contains a connection string with a password");
      assert(!/BEGIN (RSA )?PRIVATE KEY/.test(text), file + " contains a private key");
      /* Key MATERIAL, not the words. A file is allowed to name `service_role`
         or `sb_secret_` in order to REFUSE one (server/auth/identity.js does
         exactly that); what it may never contain is an actual key. */
      assert(!/sb_(secret|publishable)_[A-Za-z0-9_-]{10,}/.test(text), file + " contains an API key");
      assert(!/(service_role|anon_key)["']?\s*[:=]\s*["'][^"']{8,}/.test(text), file + " assigns a key");
    }
  });

  test("everything the app needs is injected, and it refuses half a composition", () => {
    const { repository, accounts, verifier } = { repository: { loadWorld() {}, withTransaction() {}, readVersion() {} },
      accounts: { findActiveBySubject() {} }, verifier: { verify() {} } };
    for (const deps of [{}, { repository }, { repository, accounts }, { accounts, verifier }]) {
      let threw = null;
      try { createApp(deps); } catch (e) { threw = e; }
      assert(threw instanceof TypeError, JSON.stringify(Object.keys(deps)));
    }
    assert(createApp({ repository, accounts, verifier }), "a complete composition builds");
  });

  test("the account table lives outside the canonical schema, and the world repository never sees it", async () => {
    const { pg, repository } = await serve();
    const inCanonical = (await pg.query(`select count(*)::int as n from information_schema.tables
      where table_schema = 'metyet' and table_name like '%account%'`)).rows[0].n;
    eq(inCanonical, 0, "no account table in the canonical schema");
    const world = await repository.loadWorld();
    assert(!("accounts" in world), "and no account collection in the world");
  });

  test("the runtime dependencies are the server's, and nothing more", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    eq(Object.keys(pkg.dependencies).sort().join(), "esbuild,fastify,jose,pg,react,react-dom,react-test-renderer",
      "Fastify (server), pg (driver) and jose (token verification) — no SDK, no ORM, no mailer");
    const vendors = ["@supabase/supabase-js", "@supabase/auth-js", "resend", "nodemailer", "@sentry/node", "aws-sdk"];
    vendors.forEach((name) => assert(!pkg.dependencies[name], name + " was added: no vendor SDK belongs in this batch"));
    eq(pkg.scripts.start, "node server/index.js", "one way to start the server");
  });

  test("the in-memory prototype is untouched by any of this", () => {
    const store = createStore(world());
    const r = store.execute({ collectorId: "c1" }, "addGoal", { cardId: "k2", at: "2026-08-14" });
    assert(r.ok, "the prototype still runs its own way");
    eq(store.get().goals.find((g) => g.id === r.value).since, "2026-08-14", "on the demo clock");
  });
});

run();
