/* ============================================================================
   MARKET VALIDATION — BATCH 3A: PRODUCTION INTEGRATION (no new door)
   The five negotiation commands — startOpportunity, proposePrice, acceptPrice,
   declineOffer, cancelOpportunity — are NOT on the production allow-list, and
   this batch does not put them there: a command joins the list in the change
   that gives it a real client caller (server/exposed-commands.js). So this
   suite verifies them against everything in production EXCEPT that door.

   WHICH PATH EACH PART EXERCISES — said plainly, because it matters:
     HTTP        real Fastify app (createApp), real auth verifier, real
                 POST /api/commands and GET /api/view, over PGlite with every
                 migration applied. Used for: setup through commands that ARE
                 exposed (addGoal, addInventoryCopy, addCollectorCopy), every
                 projection read, and the 409 the door gives the five today.
     PERSISTENCE the real write path the route itself calls after the door —
                 executeCommand: advisory lock, version read, domain execute,
                 validateWorld, versioned save — on the same database. NOT an
                 HTTP request: the route's authenticate → actor step is not
                 exercised for these five here (it is shared by every command
                 and covered by the server suites).
   Nothing here is described as a full HTTP integration test of the five
   commands, because the product does not yet offer them over HTTP.
     A. the door          HTTP: the five are refused today, and write nothing
     B. negotiation       PERSISTENCE: open, accept, counter, decline, withdraw
     C. Firm and dollars  PERSISTENCE: Firm, whole dollars, percentages
     D. one offer         PERSISTENCE: across partners; released on end
     E. who may act       PERSISTENCE: cross-account, turns, repeats, races
     F. reloads           PERSISTENCE + HTTP: everything survives a new process
     G. what each sees    HTTP: projections, privately
     H. refusals          PERSISTENCE: codes; HTTP: the 409 body shape
     I. after agreement   PERSISTENCE: existing Deal Flow continues unchanged
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { executeCommand } = require("../persistence/command-transaction.js");
const { createApp } = require("../server/app.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
const D = require("../domain/metyet-domain.js");
const RT = require("../domain/metyet-runtime.js");

const json = (v) => JSON.stringify(v);
const FIVE = ["startOpportunity", "proposePrice", "acceptPrice", "declineOffer", "cancelOpportunity"];
const SUBJECT = { north: "sub-north", silver: "sub-silver", casey: "sub-casey", jordan: "sub-jordan" };
const ACTOR = { north: { partnerId: "p1" }, silver: { partnerId: "p2" }, casey: { collectorId: "c1" }, jordan: { collectorId: "c2" } };
const PLAN = { method: "meetup", date: "2030-02-01", time: "18:00", location: "Card shop" };

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));
/* Two shops, two Collectors. Casey knows both shops; Jordan knows Northline only. */
async function world() {
  const pg = database();
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  const runtime = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 1000 });
  const repository = createWorldRepository(db);
  const catalog = createCatalogRepository(db, { newId: runtime.newId });
  await repository.saveWorld({
    catalog: [], collectors: [{ id: "c1", name: "Casey" }, { id: "c2", name: "Jordan" }],
    partners: [{ id: "p1", name: "Northline", tradeRate: 0.7 }, { id: "p2", name: "Silver Vale", tradeRate: 0.6 }],
    relationships: [
      { partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" },
      { partnerId: "p2", collectorId: "c1", status: "accepted", at: "2030-01-01" },
      { partnerId: "p1", collectorId: "c2", status: "accepted", at: "2030-01-01" }],
    invitations: [], goals: [], inventory: [], collectorCopies: [], binders: [], binderEntries: [],
    interests: [], opportunities: [], conversations: [], photoRequests: [], copyReviews: [] });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: SUBJECT.north, role: "tp", partnerId: "p1" });
  await accounts.linkAccount({ subject: SUBJECT.silver, role: "tp", partnerId: "p2" });
  await accounts.linkAccount({ subject: SUBJECT.casey, role: "collector", collectorId: "c1" });
  await accounts.linkAccount({ subject: SUBJECT.jordan, role: "collector", collectorId: "c2" });
  const verifier = { verify: async (token) => {
    const subject = SUBJECT[token];
    if (!subject) throw Object.assign(new Error("no"), { reason: "bad token" });
    return { subject, email: `${token}@example.invalid`, emailVerified: true };
  } };
  const app = createApp({ repository, catalog, accounts, verifier, runtime });
  const ctx = { pg, db, runtime, repository, catalog, app, accounts, verifier };
  ctx.cards = await cards(ctx);
  return ctx;
}
/* Two exact versions of one checklist line. */
async function cards(ctx) {
  const { expansionId } = await ctx.catalog.putExpansion({ game: "pokemon", code: "ex1", name: "Ruby & Sapphire", printedTotal: 109 });
  const { cardContextId } = await ctx.catalog.putCardContext({ game: "pokemon", expansionId,
    collectorNumber: "60", cardName: "Mudkip", artist: "Ken Sugimori", rarity: "Common" });
  const x = (await ctx.catalog.putCanonicalCard({ cardContextId, finish: "non_holo" })).canonicalCardId;
  const y = (await ctx.catalog.putCanonicalCard({ cardContextId, finish: "reverse_holofoil" })).canonicalCardId;
  return { x, y };
}
/* HTTP */
const post = (app, token, command, payload) => app.inject({ method: "POST", url: "/api/commands",
  headers: { authorization: `Bearer ${token}` }, payload: { command, payload } });
const view = async (app, token) => (await app.inject({ method: "GET", url: "/api/view",
  headers: { authorization: `Bearer ${token}` } })).json().state;
const okHttp = async (app, token, command, payload) => {
  const res = await post(app, token, command, payload);
  eq(res.statusCode, 200, `${command} over HTTP: ${res.body}`);
  return res.json().value;
};
/* PERSISTENCE — the route's own write path, after the door. */
const exec = (ctx, who, command, payload) => executeCommand(ctx.repository, { actor: ACTOR[who], command, payload, runtime: ctx.runtime });
const ok = async (ctx, who, command, payload) => { const r = await exec(ctx, who, command, payload); assert(r && r.ok, `${who} ${command}: ${r && r.refused}`); return r.value; };
const no = async (ctx, who, command, payload, code, why) => { const r = await exec(ctx, who, command, payload); eq(r && r.refused, code, why || `${who} ${command}`); return r; };
const stored = async (ctx) => ctx.repository.loadWorld();
const oppIn = async (ctx, id) => (await stored(ctx)).opportunities.find((o) => o.id === id);

/* Supply and demand, made through the doors that exist. */
async function market(ctx, { ask = 120, firm = false, silverAsk = 125 } = {}) {
  const gA = await okHttp(ctx.app, "casey", "addGoal", { canonicalCardId: ctx.cards.x, tier: "primary", desired: { grade: "PSA 9" } });
  const gY = await okHttp(ctx.app, "casey", "addGoal", { canonicalCardId: ctx.cards.y, tier: "primary", desired: { grade: "PSA 9" } });
  const gJ = await okHttp(ctx.app, "jordan", "addGoal", { canonicalCardId: ctx.cards.x, tier: "primary", desired: { grade: "PSA 9" } });
  const i1 = await okHttp(ctx.app, "north", "addInventoryCopy", { copy: { canonicalCardId: ctx.cards.x, grade: "PSA 9", ask, cost: 61, firmOnPrice: firm } });
  const i2 = await okHttp(ctx.app, "silver", "addInventoryCopy", { copy: { canonicalCardId: ctx.cards.x, grade: "PSA 9", ask: silverAsk, cost: 77 } });
  const i3 = await okHttp(ctx.app, "north", "addInventoryCopy", { copy: { canonicalCardId: ctx.cards.y, grade: "PSA 9", ask: 200, cost: 99 } });
  const i4 = await okHttp(ctx.app, "north", "addInventoryCopy", { copy: { canonicalCardId: ctx.cards.x, grade: "PSA 9", ask: 118, cost: 60 } });
  return { gA, gY, gJ, i1, i2, i3, i4 };
}

/* ============================================================== A */
describe("A. HTTP — the door stays shut for all five, and refuses cleanly", () => {
  test("none of the five is on the allow-list", () => {
    for (const c of FIVE) assert(!EXPOSED_COMMANDS.includes(c), `${c} was exposed`);
  });
  test("each one, sent over HTTP by a real account, answers 409 command-unavailable and writes nothing", async () => {
    const ctx = await world(); const m = await market(ctx);
    const o = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 100 });
    const before = json(await stored(ctx));
    const sends = [["casey", "startOpportunity", { goalId: m.gY, invId: m.i3, amount: 150 }],
      ["north", "proposePrice", { oppId: o, amount: 115 }], ["north", "acceptPrice", { oppId: o }],
      ["north", "declineOffer", { oppId: o }], ["casey", "cancelOpportunity", { oppId: o }]];
    for (const [who, command, payload] of sends) {
      const res = await post(ctx.app, who, command, payload);
      eq(res.statusCode, 409, `${command} status`);
      eq(res.json().error.refused, "command-unavailable", `${command} refusal`);
      assert(!JSON.stringify(res.json()).includes("p1") && !JSON.stringify(res.json()).includes(o), `${command}'s refusal names nothing`);
    }
    eq(json(await stored(ctx)), before, "and the world is byte-identical");
  });
  test("an unauthenticated request is refused before the door", async () => {
    const ctx = await world();
    const res = await ctx.app.inject({ method: "POST", url: "/api/commands", payload: { command: "acceptPrice", payload: { oppId: "x" } } });
    eq(res.statusCode, 401, "401");
  });
});

/* ============================================================== B */
describe("B. PERSISTENCE — the negotiation, committed for real", () => {
  test("Collector opens; partner accepts → one agreed whole-dollar value, Select Trade", async () => {
    const ctx = await world(); const m = await market(ctx);
    const o = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 110 });
    let r = await oppIn(ctx, o);
    eq(r.stage, "agree-price", "opened"); eq(r.listedPrice, 120, "price captured"); eq(r.firmOnPrice, false, "Open captured");
    await ok(ctx, "north", "acceptPrice", { oppId: o });
    r = await oppIn(ctx, o);
    eq(r.agreedPrice, 110, "agreed"); eq(r.stage, "select-trade", "advanced once");
  });
  test("partner counters; Collector accepts — no second partner confirmation", async () => {
    const ctx = await world(); const m = await market(ctx);
    const o = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 100 });
    await ok(ctx, "north", "proposePrice", { oppId: o, amount: 115 });
    await ok(ctx, "casey", "acceptPrice", { oppId: o });
    eq((await oppIn(ctx, o)).agreedPrice, 115, "agreed at the counter");
    await no(ctx, "north", "acceptPrice", { oppId: o }, "wrong-stage", "nothing left to confirm");
  });
  test("Collector counters back; partner accepts", async () => {
    const ctx = await world(); const m = await market(ctx);
    const o = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, percent: 0.8 });
    await ok(ctx, "north", "proposePrice", { oppId: o, percent: 0.95 });
    await ok(ctx, "casey", "proposePrice", { oppId: o, amount: 108 });
    await ok(ctx, "north", "acceptPrice", { oppId: o });
    const r = await oppIn(ctx, o);
    eq(json(r.priceThread.map((e) => [e.by, e.type, e.amount, e.basis ? e.basis.percent : null])),
      json([["collector", "offer", 96, 0.8], ["tp", "counter", 114, 0.95], ["collector", "counter", 108, null], ["tp", "accept", 108, null]]), "the whole thread");
    eq(r.agreedPrice, 108, "agreed");
  });
  test("partner declines — a distinct, persisted outcome, history intact", async () => {
    const ctx = await world(); const m = await market(ctx);
    const o = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 90 });
    await ok(ctx, "north", "proposePrice", { oppId: o, amount: 115 });
    await ok(ctx, "north", "declineOffer", { oppId: o, reason: "not this one" });
    const r = await oppIn(ctx, o);
    eq([r.outcome, r.endedBy, r.endedStage, r.endedReason].join("|"), "declined|tp|agree-price|not this one", "declined by the partner");
    eq(r.priceThread.length, 2, "nothing appended to the price history");
  });
  test("Collector withdraws after a counter — ended, not declined", async () => {
    const ctx = await world(); const m = await market(ctx);
    const o = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 90 });
    await ok(ctx, "north", "proposePrice", { oppId: o, amount: 115 });
    await ok(ctx, "casey", "cancelOpportunity", { oppId: o });
    const r = await oppIn(ctx, o);
    eq([r.outcome, r.endedBy].join("|"), "ended|collector", "withdrawn by the Collector");
  });
});

/* ============================================================== C */
describe("C. PERSISTENCE — Firm on Price, whole dollars, percentages", () => {
  test("a Firm copy opens only at its price; the partner may still counter", async () => {
    const ctx = await world(); const m = await market(ctx, { firm: true });
    await no(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 119 }, "firm-on-price", "below");
    await no(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, percent: 0.9 }, "firm-on-price", "90%");
    eq((await stored(ctx)).opportunities.length, 0, "nothing persisted by a refusal");
    const o = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 120 });
    eq((await oppIn(ctx, o)).firmOnPrice, true, "firm captured");
    eq((await oppIn(ctx, o)).stage, "agree-price", "still waits for the partner");
    await ok(ctx, "north", "proposePrice", { oppId: o, amount: 130 });
    await ok(ctx, "casey", "acceptPrice", { oppId: o });
    eq((await oppIn(ctx, o)).agreedPrice, 130, "the counter stands");
  });
  test("fractional dollars and bad percentages are refused at every step", async () => {
    const ctx = await world(); const m = await market(ctx);
    for (const pay of [{ amount: 100.5 }, { amount: 0 }, { percent: 0 }, { percent: -0.1 }, { amount: 100, percent: 0.9 }, { percent: "0.9" }]) {
      await no(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, ...pay }, "invalid-amount", `open ${json(pay)}`);
    }
    const o = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, percent: 0.9 });
    eq((await oppIn(ctx, o)).priceThread[0].amount, 108, "90% of $120 = $108");
    await no(ctx, "north", "proposePrice", { oppId: o, amount: 114.5 }, "invalid-amount", "a fractional counter");
    await ok(ctx, "north", "proposePrice", { oppId: o, percent: 0.95 });
    eq((await oppIn(ctx, o)).priceThread[1].amount, 114, "95% of the captured $120");
    assert((await oppIn(ctx, o)).priceThread.every((e) => Number.isSafeInteger(e.amount)), "every persisted amount is an integer");
  });
  test("the denominator is the captured price, even after the shop reprices over HTTP", async () => {
    const ctx = await world(); const m = await market(ctx);
    const o = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 100 });
    await okHttp(ctx.app, "north", "updateInventoryCopy", { invId: m.i1, patch: { ask: 200, firmOnPrice: true } });
    await ok(ctx, "north", "proposePrice", { oppId: o, percent: 0.97 });
    const r = await oppIn(ctx, o);
    eq(r.priceThread[1].amount, 116, "97% of $120, not of $200");
    eq([r.listedPrice, r.firmOnPrice].join("|"), "120|false", "the snapshot did not move");
  });
});

/* ============================================================== D */
describe("D. PERSISTENCE — one active offer per exact card", () => {
  test("refused across partners; other versions and other Collectors are free", async () => {
    const ctx = await world(); const m = await market(ctx);
    await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 100 });
    await no(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i2, amount: 110 }, "already-negotiating", "Silver Vale, same card");
    await no(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i4, amount: 110 }, "already-negotiating", "Northline, another copy");
    await ok(ctx, "casey", "startOpportunity", { goalId: m.gY, invId: m.i3, amount: 180 });
    await ok(ctx, "jordan", "startOpportunity", { goalId: m.gJ, invId: m.i4, amount: 100 });
  });
  test("HTTP — and it cannot be dodged with a second or a re-made Goal through the doors that exist", async () => {
    /* Through production the per-card rule is a backstop: three exposed-door
       guards reach the same answer first. This holds them together. The rule
       on its own (a Goal-free or legacy deal) is market-validation-b2's. */
    const ctx = await world(); const m = await market(ctx);
    await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 100 });
    const dup = await post(ctx.app, "casey", "addGoal", { canonicalCardId: ctx.cards.x, tier: "primary", desired: { grade: "PSA 9" } });
    eq([dup.statusCode, dup.json().error.refused].join("|"), "409|duplicate-goal", "no second Goal for the same card");
    const rm = await post(ctx.app, "casey", "removeGoal", { goalId: m.gA });
    eq([rm.statusCode, rm.json().error.refused].join("|"), "409|goal-locked", "nor removing the Goal while its offer is active");
    await no(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i2, amount: 110 }, "already-negotiating", "so Silver Vale's copy stays out of reach");
  });
  test("declined, withdrawn and completed deals each release it", async () => {
    const ctx = await world(); const m = await market(ctx);
    let o = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 100 });
    await ok(ctx, "north", "declineOffer", { oppId: o });
    o = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i2, amount: 110 });
    await ok(ctx, "casey", "cancelOpportunity", { oppId: o });
    o = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 120 });
    await ok(ctx, "north", "acceptPrice", { oppId: o }); await ok(ctx, "casey", "chooseCashOnly", { oppId: o });
    await ok(ctx, "north", "acceptDeal", { oppId: o }); await ok(ctx, "casey", "acceptDeal", { oppId: o });
    await ok(ctx, "north", "proposeFulfillment", { oppId: o, plan: PLAN }); await ok(ctx, "casey", "confirmFulfillmentPlan", { oppId: o });
    await ok(ctx, "north", "confirmHandoff", { oppId: o }); await ok(ctx, "casey", "confirmHandoff", { oppId: o });
    eq((await oppIn(ctx, o)).stage, "completed", "completed");
    await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i2, amount: 120 });
  });
});

/* ============================================================== E */
describe("E. PERSISTENCE — who may act, and when", () => {
  test("only the participating partner responds; a Collector cannot decline; another Collector cannot act", async () => {
    const ctx = await world(); const m = await market(ctx);
    const o = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 100 });
    await no(ctx, "silver", "acceptPrice", { oppId: o }, "not-participant", "another shop accepting");
    await no(ctx, "silver", "proposePrice", { oppId: o, amount: 110 }, "not-participant", "another shop countering");
    await no(ctx, "silver", "declineOffer", { oppId: o }, "not-participant", "another shop declining");
    await no(ctx, "jordan", "proposePrice", { oppId: o, amount: 110 }, "not-participant", "another Collector");
    await no(ctx, "jordan", "cancelOpportunity", { oppId: o }, "not-participant", "another Collector withdrawing it");
    await no(ctx, "casey", "declineOffer", { oppId: o }, "not-owner", "a Collector withdraws, not declines");
    await no(ctx, "north", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 100 }, "not-owner", "a partner cannot open");
    await no(ctx, "jordan", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 100 }, "not-owner", "Jordan cannot use Casey's Goal");
  });
  test("turns: no self-acceptance, no double counter", async () => {
    const ctx = await world(); const m = await market(ctx);
    const o = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 120 });
    await no(ctx, "casey", "acceptPrice", { oppId: o }, "not-your-turn", "accepting one's own opening, even at the price");
    await no(ctx, "casey", "proposePrice", { oppId: o, amount: 115 }, "not-your-turn", "countering oneself");
    await ok(ctx, "north", "proposePrice", { oppId: o, amount: 125 });
    await no(ctx, "north", "proposePrice", { oppId: o, amount: 124 }, "not-your-turn", "the partner twice");
  });
  test("acceptance advances exactly once — repeated and racing requests change nothing more", async () => {
    const ctx = await world(); const m = await market(ctx);
    const o = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 110 });
    const results = await Promise.all([exec(ctx, "north", "acceptPrice", { oppId: o }), exec(ctx, "north", "acceptPrice", { oppId: o }),
      exec(ctx, "north", "declineOffer", { oppId: o })]);
    eq(results.filter((r) => r.ok).length, 1, `exactly one of three racing responses landed: ${json(results.map((r) => r.ok || r.refused))}`);
    const r = await oppIn(ctx, o);
    const accepts = r.priceThread.filter((e) => e.type === "accept").length;
    assert((r.agreedPrice === 110 && accepts === 1 && !r.declined) || (r.declined && r.agreedPrice == null && accepts === 0), "one coherent outcome");
    const v = (await exec(ctx, "north", "acceptPrice", { oppId: o }));
    assert(!v.ok, "a stale repeat after the fact is refused (" + v.refused + ")");
  });
  test("a deal that has ended takes no further moves", async () => {
    const ctx = await world(); const m = await market(ctx);
    const o = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 100 });
    await ok(ctx, "north", "declineOffer", { oppId: o });
    for (const [who, c, p] of [["casey", "proposePrice", { oppId: o, amount: 110 }], ["north", "acceptPrice", { oppId: o }],
      ["north", "declineOffer", { oppId: o }], ["casey", "cancelOpportunity", { oppId: o }]]) {
      await no(ctx, who, c, p, "terminal", `${c} after decline`);
    }
  });
});

/* ============================================================== F */
describe("F. reloads — PERSISTENCE written, then read by a new repository and a new app (HTTP)", () => {
  test("snapshots, basis, agreed value and both outcomes survive a fresh process", async () => {
    const ctx = await world(); const m = await market(ctx, { firm: true });
    const agreed = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, percent: 1 });
    await ok(ctx, "north", "proposePrice", { oppId: agreed, percent: 1.05 });
    await ok(ctx, "casey", "acceptPrice", { oppId: agreed });
    const declined = await ok(ctx, "casey", "startOpportunity", { goalId: m.gY, invId: m.i3, amount: 150 });
    await ok(ctx, "north", "declineOffer", { oppId: declined });
    const withdrawn = await ok(ctx, "jordan", "startOpportunity", { goalId: m.gJ, invId: m.i4, amount: 100 });
    await ok(ctx, "jordan", "cancelOpportunity", { oppId: withdrawn });
    /* A new repository and a new app on the same database: nothing in memory carries over. */
    const repository = createWorldRepository(ctx.db);
    const fresh = (await repository.loadWorld()).opportunities;
    const a = fresh.find((o) => o.id === agreed), d = fresh.find((o) => o.id === declined), w = fresh.find((o) => o.id === withdrawn);
    eq([a.listedPrice, a.firmOnPrice, a.priceThread[0].amount, a.priceThread[0].basis.percent, a.priceThread[1].amount, a.agreedPrice, a.stage].join("|"),
      "120|true|120|1|126|126|select-trade", "the agreed deal, exactly");
    eq([d.outcome, d.endedBy].join("|"), "declined|tp", "the decline");
    eq([w.outcome, w.endedBy].join("|"), "ended|collector", "the withdrawal");
    const app2 = createApp({ repository, catalog: ctx.catalog, accounts: ctx.accounts, verifier: ctx.verifier, runtime: ctx.runtime });
    const seen = (await view(app2, "casey")).opportunities.find((o) => o.id === agreed);
    eq([seen.agreedPrice, seen.priceThread[1].basis.percent].join("|"), "126|1.05", "served by a new app too");
    /* and the released slot is still released after the reload */
    const again = await executeCommand(repository, { actor: ACTOR.casey, command: "startOpportunity",
      payload: { goalId: m.gY, invId: m.i3, amount: 160 }, runtime: ctx.runtime });
    assert(again.ok, "the declined deal still frees the slot after a reload: " + again.refused);
  });
});

/* ============================================================== G */
describe("G. HTTP — what each account is shown", () => {
  test("the Collector sees their deal, without the partner's trade rate or cost", async () => {
    const ctx = await world(); const m = await market(ctx);
    const o = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, percent: 0.9 });
    await ok(ctx, "north", "proposePrice", { oppId: o, amount: 115 });
    const mine = await view(ctx.app, "casey");
    const seen = mine.opportunities.find((x) => x.id === o);
    assert(seen, "visible to its Collector");
    eq([seen.listedPrice, seen.firmOnPrice, seen.priceThread.length, seen.priceThread[0].basis.percent].join("|"), "120|false|2|0.9", "the negotiation as it stands");
    assert(!("tradeRate" in seen), "the partner's trade rate is private");
    const body = JSON.stringify(mine);
    for (const secret of ["\"cost\"", ":61", ":77", ":99", ":60"]) assert(!body.includes(secret), `the Collector's view carries ${secret}`);
  });
  test("the partner sees its own deal and nothing private of the Collector's", async () => {
    const ctx = await world(); const m = await market(ctx);
    await okHttp(ctx.app, "casey", "addCollectorCopy", { copy: { canonicalCardId: ctx.cards.y, grade: "PSA 8", offered: true, market: 4321 } });
    const o = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 100 });
    const theirs = await view(ctx.app, "north");
    assert(theirs.opportunities.some((x) => x.id === o), "visible to the participating partner");
    assert(!JSON.stringify(theirs).includes("4321"), "the Collector's private value never reaches the partner");
  });
  test("nobody else sees it: not the other shop, not the other Collector", async () => {
    const ctx = await world(); const m = await market(ctx);
    const o = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 100 });
    const j = await ok(ctx, "jordan", "startOpportunity", { goalId: m.gJ, invId: m.i4, amount: 100 });
    assert(!(await view(ctx.app, "silver")).opportunities.some((x) => x.id === o || x.id === j), "Silver Vale sees neither");
    const jordan = await view(ctx.app, "jordan");
    assert(!jordan.opportunities.some((x) => x.id === o), "Jordan does not see Casey's deal");
    const casey = await view(ctx.app, "casey");
    assert(!casey.opportunities.some((x) => x.id === j), "Casey does not see Jordan's deal");
  });
});

/* ============================================================== H */
describe("H. refusals — PERSISTENCE codes, and what they do not reveal", () => {
  test("eligibility: no Goal, a Secondary Goal, wrong card, criteria, no relationship", async () => {
    const ctx = await world(); const m = await market(ctx);
    await no(ctx, "casey", "startOpportunity", { goalId: "g-none", invId: m.i1, amount: 100 }, "no-goal", "an invented Goal");
    await okHttp(ctx.app, "casey", "updateGoalTier", { goalId: m.gA, tier: "secondary" });
    await no(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 100 }, "goal-not-primary", "a Secondary Goal");
    await okHttp(ctx.app, "casey", "updateGoalTier", { goalId: m.gA, tier: "primary" });
    await no(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i3, amount: 100 }, "identity-mismatch", "a different version");
    const raw = await okHttp(ctx.app, "north", "addInventoryCopy", { copy: { canonicalCardId: ctx.cards.x, grade: "Raw", condition: "Near Mint", ask: 50 } });
    await no(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: raw, amount: 50 }, "criteria-mismatch", "not what the Goal asks for");
    await no(ctx, "jordan", "startOpportunity", { goalId: m.gJ, invId: m.i2, amount: 100 }, "no-relationship", "a shop Jordan does not know");
  });
  test("stale or unavailable inventory: retired, or held by somebody else's deal — one answer, no detail", async () => {
    const ctx = await world(); const m = await market(ctx);
    await okHttp(ctx.app, "north", "removeInventoryCopy", { invId: m.i4 });
    await no(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i4, amount: 100 }, "copy-unavailable", "a retired copy");
    const j = await ok(ctx, "jordan", "startOpportunity", { goalId: m.gJ, invId: m.i1, amount: 100 });
    await ok(ctx, "north", "acceptPrice", { oppId: j });
    await ok(ctx, "north", "setCopyPending", { invId: m.i1, oppId: j });
    const r = await no(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, amount: 100 }, "copy-unavailable", "pending for Jordan's deal");
    assert(!JSON.stringify(r).includes(j) && !JSON.stringify(r).includes("c2"), "the refusal names no deal and no Collector");
  });
  test("over HTTP, a refusal body is the standard shape and carries only a code", async () => {
    const ctx = await world();
    const res = await post(ctx.app, "casey", "proposePrice", { oppId: "anything", amount: 1 });
    const b = res.json();
    eq(res.statusCode, 409, "409");
    const allowed = new Set(["code", "message", "refused", "requestId"]);
    for (const k of Object.keys(b.error)) assert(allowed.has(k), `unexpected field in a refusal: ${k}`);
    eq(b.error.refused, "command-unavailable", "the code, and nothing about the deal");
    eq(b.error.code, "command_refused", "the standard code");
  });
});

/* ============================================================== I */
describe("I. PERSISTENCE — after agreement, the existing Deal Flow carries on unchanged", () => {
  test("cash only → whole-dollar final balance → both agree → fulfilment, with the same arithmetic", async () => {
    const ctx = await world(); const m = await market(ctx);
    const o = await ok(ctx, "casey", "startOpportunity", { goalId: m.gA, invId: m.i1, percent: 0.9 });
    await ok(ctx, "north", "acceptPrice", { oppId: o });
    await ok(ctx, "casey", "chooseCashOnly", { oppId: o });
    eq(D.calculatedBalance(await oppIn(ctx, o)), 108, "balance = agreed value, no trade credit");
    await ok(ctx, "north", "acceptDeal", { oppId: o });
    await no(ctx, "casey", "proposeFinalBalance", { oppId: o, amount: 104.5 }, "invalid-amount", "cents refused (Batch 2.1)");
    await ok(ctx, "casey", "proposeFinalBalance", { oppId: o, amount: 104 });
    await ok(ctx, "north", "acceptDeal", { oppId: o }); await ok(ctx, "casey", "acceptDeal", { oppId: o });
    const r = await oppIn(ctx, o);
    eq([r.stage, D.finalBalance(r)].join("|"), "fulfillment|104", "agreed and on to fulfilment");
    await no(ctx, "casey", "cancelOpportunity", { oppId: o }, "reason-required", "after final agreement a reason is still required");
    await no(ctx, "north", "declineOffer", { oppId: o }, "wrong-stage", "and decline is not a way around it");
  });
});

run();
