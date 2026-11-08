/* ============================================================================
   M3B B2.5 — NO NEW COMMITMENT OUTSIDE A TRUSTED RELATIONSHIP

   Founder-approved. Starting a deal and choosing or holding a Collector's
   cards already needed a current relationship. Every later command that makes
   or changes a commitment now asks the same question of the deal's own two
   parties, and refuses with `no-relationship`:

     proposePrice, acceptPrice                         Agree on Price
     proposeMarketValue, acceptMarketValue,
     proposeTradePercent, acceptTradePercent           Value Trade
     chooseCashOnly, proposeFinalBalance, acceptDeal   cash only, the Deal
     setCopyPending (marking, not releasing)           the shop's card for a deal

   Ways out stay open: withdrawTradeCard, declineTradeCard, deselectTradeCard,
   holdTradeSelection, cancelOpportunity, declineOffer, releasing a pending
   mark, sendDealMessage and markDealViewed. A deal already finally agreed is
   an obligation made while the trust held, so Fulfillment and handoff are
   untouched. Nothing ends a deal or releases a hold by itself — no relationship
   is ended by any command (none exists); the tests end one in stored data.

     A  the domain: every commitment refused, every way out open
     B  the domain: what stays true (history, holds, stock, a new relationship)
     C  through the real server
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const { PGlite } = require("@electric-sql/pglite");
const D = require("../domain/metyet-domain.js");
const P = require("../domain/metyet-projection.js");
const W = require("../domain/metyet-world.js");
const RT = require("../domain/metyet-runtime.js");
const { createStore, settleFinalCash } = require("./fixture-store.cjs");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { createApp } = require("../server/app.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");

const AT = "2030-03-01";
const json = (v) => JSON.stringify(v);

/* ================================================================ DOMAIN */
const NL = { partnerId: "nl" }, RV = { partnerId: "rv" }, CASEY = { collectorId: "casey" };
const seed = () => ({
  partners: [{ id: "nl", name: "Northline", tradeRate: 0.85 }, { id: "rv", name: "Riverside" }],
  collectors: [{ id: "casey", name: "Casey" }],
  goals: [{ id: "gC", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } }],
  inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 300, grade: "PSA 9" }],
  collectorCopies: [
    { id: "k1", collectorId: "casey", canonicalCardId: "cc-y", grade: "PSA 8", cert: "K1", market: 410, offered: true },
    { id: "k2", collectorId: "casey", canonicalCardId: "cc-z", grade: "PSA 7", cert: "K2", market: 175, offered: true }],
  binders: [], binderEntries: [], opportunities: [], catalog: [], invitations: [],
  copyReviews: [], photoRequests: [], conversations: [], interests: [],
});
const world = () => createStore(seed());
const x = (st, actor, cmd, payload) => st.execute(actor, cmd, { at: AT, ...(payload || {}) });
const okv = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
const opp = (st, id) => st.get().opportunities.find((o) => o.id === id);
const status = (st, copyId) => D.collectorCopyStatus(copyId, st.get().opportunities);
const setRel = (st, value) => st.fixture.set({ ...st.get(), relationships: st.get().relationships.map((r) => (
  r.partnerId === "nl" && r.collectorId === "casey" ? { ...r, status: value } : r)) });
const end = (st) => setRel(st, "ended");
/* A refusal changes nothing at all. */
const refusedNoRel = (st, actor, cmd, payload, why) => {
  const before = json(st.get());
  eq(x(st, actor, cmd, payload).refused, "no-relationship", why);
  eq(json(st.get()), before, `${why}: a refusal changed the world`);
};
const opened = (st) => okv(x(st, CASEY, "startOpportunity", { goalId: "gC", invId: "i1", amount: 300 }), "open");
const agreed = (st) => { const id = opened(st); okv(x(st, NL, "acceptPrice", { oppId: id }), "price"); return id; };
const valuing = (st, copyIds = ["k1", "k2"]) => {
  const a = agreed(st);
  const rows = okv(x(st, NL, "selectTradeCards", { oppId: a, copyIds }), "select");
  okv(x(st, CASEY, "continueTradeSelection", { oppId: a }), "ready");
  okv(x(st, NL, "closeTradeSelection", { oppId: a }), "close");
  return { a, rows };
};
const inDeal = (st) => {
  const { a, rows: [r] } = valuing(st, ["k1"]);
  okv(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r, amount: 200 }), "m");
  okv(x(st, NL, "acceptMarketValue", { oppId: a, tradeCardId: r }), "m ok");
  okv(x(st, NL, "proposeTradePercent", { oppId: a, tradeCardId: r, percent: 0.5 }), "p");
  okv(x(st, CASEY, "acceptTradePercent", { oppId: a, tradeCardId: r }), "p ok");
  eq(opp(st, a).stage, "deal");
  return { a, r };
};

describe("A. The domain: after the relationship ends, no commitment — every way out stays open", () => {
  test("Agree on Price: neither side can propose or accept; the shop can still decline the offer", () => {
    const st = world(); const a = opened(st);
    end(st);
    refusedNoRel(st, NL, "acceptPrice", { oppId: a }, "accepting the Collector's offer");
    refusedNoRel(st, NL, "proposePrice", { oppId: a, amount: 320 }, "countering it");
    okv(x(st, NL, "declineOffer", { oppId: a }), "declining the offer is a way out");
    eq(opp(st, a).outcome, "declined");
    const s2 = world(); const b = opened(s2);
    okv(x(s2, NL, "proposePrice", { oppId: b, amount: 320 }), "a counter while trusted");
    end(s2);
    refusedNoRel(s2, CASEY, "acceptPrice", { oppId: b }, "the Collector accepting the counter");
    refusedNoRel(s2, CASEY, "proposePrice", { oppId: b, amount: 310 }, "the Collector countering");
    okv(x(s2, CASEY, "cancelOpportunity", { oppId: b }), "the Collector ends it");
  });
  test("Value Trade: all four moves refused, for both seats", () => {
    const st = world(); const { a, rows: [r1, r2] } = valuing(st);
    okv(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r1, amount: 400 }), "m1 while trusted");
    end(st);
    refusedNoRel(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r2, amount: 150 }, "the Collector's market value");
    refusedNoRel(st, NL, "acceptMarketValue", { oppId: a, tradeCardId: r1 }, "the shop accepting it");
    refusedNoRel(st, NL, "proposeMarketValue", { oppId: a, tradeCardId: r1, amount: 380 }, "the shop countering it");
    setRel(st, "accepted");
    okv(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r2, amount: 150 }), "m2 while trusted");
    okv(x(st, NL, "acceptMarketValue", { oppId: a, tradeCardId: r1 }), "m1 agreed");
    okv(x(st, NL, "proposeTradePercent", { oppId: a, tradeCardId: r1, percent: 0.8 }), "p1 proposed");
    end(st);
    refusedNoRel(st, CASEY, "acceptTradePercent", { oppId: a, tradeCardId: r1 }, "the Collector accepting the percentage");
    refusedNoRel(st, CASEY, "proposeTradePercent", { oppId: a, tradeCardId: r1, percent: 0.9 }, "the Collector countering it");
  });
  test("…and the ways out of Value Trade release the cards: decline, withdraw, end the deal", () => {
    const st = world(); const { a, rows: [r1, r2] } = valuing(st);
    end(st);
    okv(x(st, NL, "declineTradeCard", { oppId: a, tradeCardId: r1, note: "We're no longer connected." }), "the shop declines");
    eq(status(st, "k1"), "available", "released");
    okv(x(st, CASEY, "withdrawTradeCard", { oppId: a, tradeCardId: r2 }), "the Collector takes hers out");
    eq(status(st, "k2"), "available", "released");
    eq(opp(st, a).stage, "select-trade", "nothing left");
    const s2 = world(); const v = valuing(s2);
    end(s2);
    okv(x(s2, NL, "cancelOpportunity", { oppId: v.a, reason: "We are no longer connected." }), "the shop ends the deal");
    eq([status(s2, "k1"), status(s2, "k2")].join(), "available,available", "ending releases every hold");
  });
  test("Select Trade: cash only refused; holding on, deselecting and ending stay open", () => {
    const st = world(); const a = agreed(st);
    const [r] = okv(x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1"] }), "select");
    okv(x(st, CASEY, "holdTradeSelection", { oppId: a }), "hold while trusted");
    okv(x(st, CASEY, "continueTradeSelection", { oppId: a }), "ready while trusted");
    end(st);
    okv(x(st, NL, "deselectTradeCard", { oppId: a, tradeCardId: r }), "the shop takes its choice back");
    refusedNoRel(st, CASEY, "chooseCashOnly", { oppId: a }, "cash only");
    okv(x(st, CASEY, "cancelOpportunity", { oppId: a, reason: "We are no longer connected." }), "ending the deal");
  });
  test("the Deal: no final balance and no final agreement; ending it stays open", () => {
    const st = world(); const { a } = inDeal(st);
    end(st);
    refusedNoRel(st, NL, "acceptDeal", { oppId: a }, "the shop's final agreement");
    refusedNoRel(st, NL, "proposeFinalBalance", { oppId: a, amount: 190 }, "the shop's final balance");
    okv(x(st, CASEY, "cancelOpportunity", { oppId: a, reason: "We are no longer connected." }), "ending the deal");
    eq(status(st, "k1"), "available", "and the card is free");
  });
  test("a shop cannot mark its card pending for the deal once the relationship ends, but can always take the mark off", () => {
    const st = world(); const a = opened(st);
    okv(x(st, NL, "setCopyPending", { invId: "i1", oppId: a }), "marked while trusted");
    end(st);
    okv(x(st, NL, "setCopyPending", { invId: "i1", oppId: null }), "releasing the mark");
    refusedNoRel(st, NL, "setCopyPending", { invId: "i1", oppId: a }, "marking it again");
  });
  test("a deal already finally agreed keeps its Fulfillment; deal messages and read marks still work", () => {
    const st = world(); const { a } = inDeal(st);
    const f = settleFinalCash(st, a, 200, AT);
    assert(f && f.ok !== false, `settling the final cash: ${f && f.refused}`);
    eq(opp(st, a).stage, "fulfillment");
    end(st);
    okv(x(st, NL, "proposeFulfillment", { oppId: a, plan: { method: "in-person", note: "Saturday at the shop" } }), "the plan");
    okv(x(st, CASEY, "sendDealMessage", { oppId: a, text: "See you Saturday.", nonce: "n1" }), "a deal message");
    okv(x(st, CASEY, "markDealViewed", { oppId: a, surface: "timeline" }), "a read mark");
    const s2 = world(); const b = opened(s2);
    end(s2);
    okv(x(s2, CASEY, "sendDealMessage", { oppId: b, text: "Are we still on?", nonce: "n2" }), "a message on a deal still agreeing a price");
  });
});

describe("B. The domain: what stays true", () => {
  test("no refusal and no way out writes a copy, the shop's stock or a Goal", () => {
    const st = world(); const { a, rows: [r1, r2] } = valuing(st);
    const pick = () => json([st.get().collectorCopies, st.get().inventory, st.get().goals]);
    const before = pick();
    end(st);
    x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r1, amount: 400 });
    okv(x(st, NL, "declineTradeCard", { oppId: a, tradeCardId: r1 }), "decline");
    okv(x(st, CASEY, "withdrawTradeCard", { oppId: a, tradeCardId: r2 }), "withdraw");
    eq(pick(), before, "a copy, the stock or a Goal changed");
    assert(W.validateWorld(st.get()).ok, "the world is valid");
  });
  test("holds are not released by the relationship ending — only by a way out", () => {
    const st = world(); valuing(st);
    end(st);
    eq([status(st, "k1"), status(st, "k2")].join(), "reserved,reserved", "nothing releases itself");
  });
  test("both people still see the deal's history; the reference value and the default rate still never cross", () => {
    const st = world(); const { a, rows: [r1] } = valuing(st);
    okv(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r1, amount: 400 }), "m1");
    end(st);
    const tp = P.projectForActor(st.get(), NL), col = P.projectForActor(st.get(), CASEY);
    assert(tp.opportunities.some((o) => o.id === a) && col.opportunities.some((o) => o.id === a), "the deal left someone's view");
    const held = tp.collectorCopies.find((b) => b.id === "k1");
    assert(held && held.status === "reserved" && !("market" in held), `the shop's view of its held card: ${json(held)}`);
    assert(!("tradeRate" in col.opportunities.find((o) => o.id === a)), "the Collector sees the shop's default rate");
    assert(!P.projectForActor(st.get(), RV).opportunities.some((o) => o.id === a), "another shop sees the deal");
  });
  test("the rule asks about the relationship as it is NOW: accepted again, the moves work again", () => {
    const st = world(); const { a, rows: [r1] } = valuing(st);
    end(st);
    eq(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r1, amount: 400 }).refused, "no-relationship");
    setRel(st, "accepted");
    okv(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r1, amount: 400 }), "trusted again");
  });
});

/* ================================================================ SERVER */
/* THE DOOR (M3B B3). B2.5 built the same test-only door as the B2 suite —
   production's list plus the five — because the five were not yet production
   doors. M3B B3 opened them with the shop's Value Trade screen, so `door` IS
   the production server now and the stand-in is retired. */
const createAppWithValueTrade = createApp;
const SUBJECT = { north: "sub-north", silver: "sub-silver", casey: "sub-casey" };
let pglite = null;
async function server() {
  const pg = pglite || (pglite = new PGlite());
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg); await migrate(db);
  const runtime = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 1000 });
  const repository = createWorldRepository(db);
  const catalog = createCatalogRepository(db, { newId: runtime.newId });
  const { expansionId } = await catalog.putExpansion({ game: "pokemon", code: "b1", name: "Base Set", printedTotal: 102 });
  const card = async (n, name) => {
    const { cardContextId } = await catalog.putCardContext({ game: "pokemon", expansionId, collectorNumber: n, cardName: name, artist: "x", rarity: "Rare" });
    return (await catalog.putCanonicalCard({ cardContextId, finish: "holofoil" })).canonicalCardId;
  };
  const cards = { char: await card("4", "Charizard"), blas: await card("2", "Blastoise"), mud: await card("60", "Mudkip") };
  await repository.saveWorld({ catalog: [], collectors: [{ id: "c1", name: "Casey Lin" }],
    partners: [{ id: "p1", name: "Northline", tradeRate: 0.85 }, { id: "p2", name: "Silver Vale" }],
    relationships: [{ partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" },
      { partnerId: "p2", collectorId: "c1", status: "accepted", at: "2030-01-01" }],
    invitations: [], goals: [], inventory: [], collectorCopies: [], binders: [], binderEntries: [],
    interests: [], opportunities: [], conversations: [], photoRequests: [], copyReviews: [] });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: SUBJECT.north, role: "tp", partnerId: "p1" });
  await accounts.linkAccount({ subject: SUBJECT.silver, role: "tp", partnerId: "p2" });
  await accounts.linkAccount({ subject: SUBJECT.casey, role: "collector", collectorId: "c1" });
  const verifier = { verify: async (token) => {
    if (!SUBJECT[token]) throw Object.assign(new Error("no"), { reason: "bad token" });
    return { subject: SUBJECT[token], email: `${token}@example.invalid`, emailVerified: true };
  } };
  const opts = { repository, catalog, accounts, verifier, runtime };
  const apps = { production: createApp(opts), door: createAppWithValueTrade(opts) };
  const send = async (app, who, command, payload) => {
    const res = await apps[app].inject({ method: "POST", url: "/api/commands", headers: { authorization: `Bearer ${who}` }, payload: { command, payload } });
    return { status: res.statusCode, body: res.json() };
  };
  const version = () => repository.withTransaction((tx) => repository.readVersion(tx));
  const ctx = { apps, repository, cards, version };
  ctx.ok = async (app, who, command, payload) => { const r = await send(app, who, command, payload); eq(r.status, 200, `${who} ${command}: ${json(r.body)}`); return r.body.value; };
  ctx.refused = async (app, who, command, payload, code, why) => {
    const before = await version();
    const r = await send(app, who, command, payload);
    eq([r.status, r.body.error && r.body.error.refused].join(), `409,${code}`, why);
    eq(await version(), before, `${why}: a refusal wrote the world`);
  };
  ctx.view = async (who) => (await apps.production.inject({ method: "GET", url: "/api/view", headers: { authorization: `Bearer ${who}` } })).json().state;
  ctx.load = () => repository.loadWorld();
  ctx.end = async () => { const w = await repository.loadWorld();
    await repository.saveWorld({ ...w, relationships: w.relationships.map((r) => (r.partnerId === "p1" ? { ...r, status: "ended" } : r)) }); };
  ctx.k1 = await ctx.ok("production", "casey", "addCollectorCopy", { copy: { canonicalCardId: cards.char, grade: "PSA 9", cert: "C-1", market: 410, offered: true } });
  ctx.k2 = await ctx.ok("production", "casey", "addCollectorCopy", { copy: { canonicalCardId: cards.blas, grade: "PSA 8", cert: "C-2", market: 175, offered: true } });
  ctx.goal = await ctx.ok("production", "casey", "addGoal", { canonicalCardId: cards.mud, tier: "primary", desired: { grade: "PSA 9" } });
  ctx.inv = await ctx.ok("production", "north", "addInventoryCopy", { copy: { canonicalCardId: cards.mud, grade: "PSA 9", ask: 300 } });
  ctx.oppId = await ctx.ok("production", "casey", "startOpportunity", { goalId: ctx.goal, invId: ctx.inv, amount: 300 });
  return ctx;
}

describe("C. Through the real server", () => {
  test("price: refused at the production door after the relationship ends; the Collector can still end the deal", async () => {
    const ctx = await server();
    await ctx.end();
    await ctx.refused("production", "north", "acceptPrice", { oppId: ctx.oppId }, "no-relationship", "accepting the offer");
    await ctx.refused("production", "north", "proposePrice", { oppId: ctx.oppId, amount: 320 }, "no-relationship", "countering it");
    await ctx.ok("production", "casey", "sendDealMessage", { oppId: ctx.oppId, text: "Still there?", nonce: "h1" });
    await ctx.ok("production", "casey", "cancelOpportunity", { oppId: ctx.oppId });
    const both = [await ctx.view("north"), await ctx.view("casey")];
    assert(both.every((v) => v.opportunities.some((o) => o.id === ctx.oppId)), "the ended deal left someone's history");
  });
  test("Value Trade through the test door: four moves refused, the decline and the withdrawal land and release", async () => {
    const ctx = await server();
    const a = ctx.oppId;
    await ctx.ok("production", "north", "acceptPrice", { oppId: a });
    const [r1, r2] = await ctx.ok("production", "north", "selectTradeCards", { oppId: a, copyIds: [ctx.k1, ctx.k2] });
    await ctx.ok("production", "casey", "continueTradeSelection", { oppId: a });
    await ctx.ok("production", "north", "closeTradeSelection", { oppId: a });
    await ctx.ok("door", "casey", "proposeMarketValue", { oppId: a, tradeCardId: r1, amount: 400 });
    const stock = json([(await ctx.load()).collectorCopies, (await ctx.load()).inventory]);
    await ctx.end();
    await ctx.refused("door", "casey", "proposeMarketValue", { oppId: a, tradeCardId: r2, amount: 150 }, "no-relationship", "market value");
    await ctx.refused("door", "north", "acceptMarketValue", { oppId: a, tradeCardId: r1 }, "no-relationship", "accepting it");
    await ctx.refused("door", "north", "proposeTradePercent", { oppId: a, tradeCardId: r1, percent: 0.8 }, "no-relationship", "a percentage");
    await ctx.refused("door", "north", "acceptTradePercent", { oppId: a, tradeCardId: r1 }, "no-relationship", "accepting a percentage");
    await ctx.ok("door", "north", "declineTradeCard", { oppId: a, tradeCardId: r1 });
    await ctx.ok("production", "casey", "withdrawTradeCard", { oppId: a, tradeCardId: r2 });
    const w = await ctx.load();
    eq([D.collectorCopyStatus(ctx.k1, w.opportunities), D.collectorCopyStatus(ctx.k2, w.opportunities)].join(), "available,available", "released");
    eq(json([w.collectorCopies, w.inventory]), stock, "a copy or the stock changed");
    const north = await ctx.view("north");
    assert(north.opportunities.some((o) => o.id === a), "the shop lost the deal's history");
    assert(!json(north).includes("410") && !json(north).includes("175"), "a reference value reached the shop");
    assert(!("tradeRate" in (await ctx.view("casey")).opportunities.find((o) => o.id === a)), "the default rate reached the Collector");
    assert(!(await ctx.view("silver")).opportunities.some((o) => o.id === a), "another shop sees the deal");
    assert(W.validateWorld(w).ok, "valid");
  });
  test("cash only, the final balance and final agreement are still closed at the production door", async () => {
    const ctx = await server();
    for (const c of ["chooseCashOnly", "proposeFinalBalance", "acceptDeal", "setCopyPending"]) {
      assert(!EXPOSED_COMMANDS.includes(c), `${c} became exposed`);
      await ctx.refused("production", "casey", c, { oppId: ctx.oppId }, "command-unavailable", c);
    }
    /* M3B B3: + Value Trade's five, opened with the shop's screen (founder-authorized). */
    eq(EXPOSED_COMMANDS.length, 42, "the production allow-list moved");
  });
});

run();
