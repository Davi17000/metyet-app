/* ============================================================================
   M3B B2 — VALUE TRADE THROUGH THE REAL SERVER, BEHIND A DOOR THAT STAYS SHUT

   The founder's decision for B2 ("open with the screens"): the production
   allow-list does NOT change. `server/exposed-commands.js` says a command joins
   it in the batch that ships a screen that sends it, doctrine §13 says Value
   Trade stays closed until those screens ship, and the exposed == client-sent
   equality tests hold that line. So the five Value Trade commands —
   proposeMarketValue, acceptMarketValue, proposeTradePercent,
   acceptTradePercent and declineTradeCard — open in B3/B4 with their screens.

   What B2 proves now, through the real HTTP server, the real token check, the
   real transaction and every migration, is that opening them will not open
   anything else: a second copy of the server is loaded with the production
   list PLUS exactly those five (a test-only list, injected through Node's
   module cache — no server code knows it exists), and every refusal below is
   the domain's, reached through the door the screens will use.

     A  the door: production refuses all five; the test door adds only them
     B  the right seat for each move           H  duplicate and racing declines
     C  wrong actor, wrong relationship         I  the decline note
     D  wrong turn                              J  whole dollars, whole percents
     E  wrong phase                             K  what each side may see
     F  forged ids and forged authority         L  nothing else is written
     G  ended deals, a shop card gone           M  a full journey to Deal
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { createApp, FORBIDDEN_PAYLOAD_KEYS } = require("../server/app.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
const { COMMAND_NAMES } = require("../domain/metyet-commands.js");
const RT = require("../domain/metyet-runtime.js");
const D = require("../domain/metyet-domain.js");
const W = require("../domain/metyet-world.js");
const P = require("../domain/metyet-projection.js");

const ROOT = path.join(__dirname, "..");
const json = (v) => JSON.stringify(v);
const VALUE_TRADE = ["proposeMarketValue", "acceptMarketValue", "proposeTradePercent", "acceptTradePercent", "declineTradeCard"];

/* ------------------------------------------------------- THE TEST-ONLY DOOR
   `server/app.js` reads `isExposed` from exposed-commands.js when it loads. A
   fresh copy of app.js is loaded while the module cache holds a stand-in list
   (production's + the five); both cache entries are then put back, so every
   other require in this process — and the production `createApp` above — sees
   the real list. */
const createAppWithValueTrade = (() => {
  const EXPOSED_PATH = require.resolve("../server/exposed-commands.js");
  const APP_PATH = require.resolve("../server/app.js");
  const realExposed = require.cache[EXPOSED_PATH];
  const realApp = require.cache[APP_PATH];
  const list = Object.freeze([...EXPOSED_COMMANDS, ...VALUE_TRADE]);
  const stand = new module.constructor(EXPOSED_PATH);
  Object.assign(stand, { filename: EXPOSED_PATH, loaded: true,
    exports: { EXPOSED_COMMANDS: list, isExposed: (c) => typeof c === "string" && list.includes(c) } });
  require.cache[EXPOSED_PATH] = stand;
  delete require.cache[APP_PATH];
  try { return require(APP_PATH).createApp; } finally {
    require.cache[EXPOSED_PATH] = realExposed;
    require.cache[APP_PATH] = realApp;
  }
})();

/* ------------------------------------------------------------- THE SERVER */
const SUBJECT = { north: "sub-north", silver: "sub-silver", faraway: "sub-far", casey: "sub-casey", jordan: "sub-jordan" };
let pglite = null;
async function world() {
  const pg = pglite || (pglite = new PGlite());
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  const runtime = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 1000 });
  const repository = createWorldRepository(db);
  const catalog = createCatalogRepository(db, { newId: runtime.newId });
  const { expansionId } = await catalog.putExpansion({ game: "pokemon", code: "b1", name: "Base Set", printedTotal: 102 });
  const card = async (n, name, finish) => {
    const { cardContextId } = await catalog.putCardContext({ game: "pokemon", expansionId, collectorNumber: n, cardName: name, artist: "Ken Sugimori", rarity: "Rare" });
    return (await catalog.putCanonicalCard({ cardContextId, finish })).canonicalCardId;
  };
  const cards = { char: await card("4", "Charizard", "holofoil"), blas: await card("2", "Blastoise", "holofoil"),
    ven: await card("15", "Venusaur", "holofoil"), mud: await card("60", "Mudkip", "non_holo"), pika: await card("58", "Pikachu", "non_holo") };
  await repository.saveWorld({
    catalog: [], collectors: [{ id: "c1", name: "Casey Lin" }, { id: "c2", name: "Jordan Park" }],
    /* Northline's default trade rate is its own configuration (D5): the
       Collector must never see it on the deal. */
    partners: [{ id: "p1", name: "Northline", tradeRate: 0.85 }, { id: "p2", name: "Silver Vale" }, { id: "p3", name: "Faraway" }],
    relationships: [
      { partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" },
      { partnerId: "p2", collectorId: "c1", status: "accepted", at: "2030-01-01" },
      { partnerId: "p1", collectorId: "c2", status: "accepted", at: "2030-01-01" }],
    invitations: [], goals: [], inventory: [], collectorCopies: [], binders: [], binderEntries: [],
    interests: [], opportunities: [], conversations: [], photoRequests: [], copyReviews: [] });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: SUBJECT.north, role: "tp", partnerId: "p1" });
  await accounts.linkAccount({ subject: SUBJECT.silver, role: "tp", partnerId: "p2" });
  await accounts.linkAccount({ subject: SUBJECT.faraway, role: "tp", partnerId: "p3" });
  await accounts.linkAccount({ subject: SUBJECT.casey, role: "collector", collectorId: "c1" });
  await accounts.linkAccount({ subject: SUBJECT.jordan, role: "collector", collectorId: "c2" });
  const verifier = { verify: async (token) => {
    if (!SUBJECT[token]) throw Object.assign(new Error("no"), { reason: "bad token" });
    return { subject: SUBJECT[token], email: `${token}@example.invalid`, emailVerified: true };
  } };
  const opts = { repository, catalog, accounts, verifier, runtime };
  const apps = { production: createApp(opts), door: createAppWithValueTrade(opts) };
  const send = async (app, who, command, payload) => {
    const res = await app.inject({ method: "POST", url: "/api/commands",
      headers: { authorization: `Bearer ${who}` }, payload: { command, payload } });
    return { status: res.statusCode, body: res.json() };
  };
  const post = (who, command, payload) => send(apps.door, who, command, payload);
  const ok = async (who, command, payload) => {
    const r = await post(who, command, payload);
    eq(r.status, 200, `${who} ${command}: ${json(r.body)}`);
    return r.body.value;
  };
  const view = async (who) => {
    const res = await apps.door.inject({ method: "GET", url: "/api/view", headers: { authorization: `Bearer ${who}` } });
    eq(res.statusCode, 200, `${who} view`);
    return res.json().state;
  };
  /* Casey's Trade/Sell copies carry her private reference value (`market`). */
  const k = {};
  k.char = await ok("casey", "addCollectorCopy", { copy: { canonicalCardId: cards.char, grade: "PSA 9", cert: "CERT-CHAR", market: 410, offered: true } });
  k.blas = await ok("casey", "addCollectorCopy", { copy: { canonicalCardId: cards.blas, grade: "PSA 8", cert: "CERT-BLAS", market: 175, offered: true } });
  k.ven = await ok("casey", "addCollectorCopy", { copy: { canonicalCardId: cards.ven, grade: "PSA 7", cert: "CERT-VEN", market: 90, offered: true } });
  const g1 = await ok("casey", "addGoal", { canonicalCardId: cards.mud, tier: "primary", desired: { grade: "PSA 9" } });
  const g2 = await ok("casey", "addGoal", { canonicalCardId: cards.pika, tier: "primary", desired: { grade: "PSA 9" } });
  const i1 = await ok("north", "addInventoryCopy", { copy: { canonicalCardId: cards.mud, grade: "PSA 9", ask: 300 } });
  const i2 = await ok("silver", "addInventoryCopy", { copy: { canonicalCardId: cards.pika, grade: "PSA 9", ask: 200 } });
  const nl = await ok("casey", "startOpportunity", { goalId: g1, invId: i1, amount: 300 });
  await ok("north", "acceptPrice", { oppId: nl });
  const sv = await ok("casey", "startOpportunity", { goalId: g2, invId: i2, amount: 200 });
  await ok("silver", "acceptPrice", { oppId: sv });
  const ctx = { apps, send, post, ok, view, repository, cards, k, nl, sv, i1 };
  ctx.load = () => repository.loadWorld();
  ctx.deal = async (id) => (await repository.loadWorld()).opportunities.find((o) => o.id === id);
  ctx.row = async (id, rowId) => (await ctx.deal(id)).trade.cards.find((c) => c.id === rowId);
  ctx.version = async () => repository.withTransaction((tx) => repository.readVersion(tx));
  ctx.valid = async () => { const v = W.validateWorld(await repository.loadWorld()); assert(v.ok, json(v.errors.slice(0, 3))); };
  /* Through Select Trade's own (already exposed) doors into Value Trade. */
  ctx.toValuation = async (copyIds, oppId = nl, shop = "north") => {
    const rows = await ok(shop, "selectTradeCards", { oppId, copyIds });
    await ok("casey", "continueTradeSelection", { oppId });
    await ok(shop, "closeTradeSelection", { oppId });
    eq((await ctx.deal(oppId)).stage, "value-trade", "in Value Trade");
    return rows;
  };
  /* A refusal: 409, the domain's word, and the world untouched. */
  ctx.refused = async (who, command, payload, code, why) => {
    const before = await ctx.version();
    const r = await post(who, command, payload);
    eq(r.status, 409, `${why}: ${json(r.body)}`);
    eq(r.body.error && r.body.error.refused, code, why);
    eq(await ctx.version(), before, `${why}: a refusal wrote the world`);
  };
  return ctx;
}
const m = (oppId, tradeCardId, amount) => ({ oppId, tradeCardId, amount });
const p = (oppId, tradeCardId, percent) => ({ oppId, tradeCardId, percent });
const r_ = (oppId, tradeCardId, extra) => ({ oppId, tradeCardId, ...(extra || {}) });

/* ======================================================================= A */
describe("A. The door: production stays shut; the test door adds exactly five", () => {
  test("production's list is unchanged at 37 and names none of the five, nor Deal, Fulfillment or cash-only", () => {
    eq(EXPOSED_COMMANDS.length, 37, "the production allow-list moved");
    for (const c of [...VALUE_TRADE, "chooseCashOnly", "proposeFinalBalance", "acceptDeal", "proposeFulfillment", "confirmHandoff"]) {
      assert(!EXPOSED_COMMANDS.includes(c), `${c} is exposed in production`);
    }
    assert(VALUE_TRADE.every((c) => COMMAND_NAMES.includes(c)), "every one of the five is a real domain command");
    eq(require("../server/exposed-commands.js").EXPOSED_COMMANDS.length, 37, "the stand-in list leaked into this process");
  });
  test("the production server refuses all five exactly as it refuses a command that does not exist", async () => {
    const ctx = await world();
    const [row] = await ctx.toValuation([ctx.k.char]);
    const before = await ctx.version();
    const unknown = await ctx.send(ctx.apps.production, "casey", "noSuchCommand", {});
    for (const c of VALUE_TRADE) {
      const who = c === "declineTradeCard" || c === "acceptMarketValue" ? "north" : "casey";
      const r = await ctx.send(ctx.apps.production, who, c, { oppId: ctx.nl, tradeCardId: row, amount: 200, percent: 0.8 });
      eq(r.status, 409, c);
      eq(json(r.body.error && r.body.error.refused), json(unknown.body.error.refused), `${c} answers apart from an unknown command`);
      eq(r.body.error.refused, "command-unavailable", c);
    }
    eq(await ctx.version(), before, "a closed door wrote the world");
  });
  test("nothing in client/ sends the five yet — they open in B3/B4 with their screens", () => {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory()
      ? walk(path.join(dir, e.name)) : /\.(js|jsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));
    for (const f of walk(path.join(ROOT, "client"))) {
      const src = fs.readFileSync(f, "utf8");
      for (const c of VALUE_TRADE) assert(!src.includes(`"${c}"`), `${path.relative(ROOT, f)} sends ${c}`);
    }
  });
});

/* ======================================================================= B */
describe("B. Each move belongs to its seat", () => {
  test("the Collector opens market value, the shop counters, she accepts; the shop opens the percentage, she counters, it accepts", async () => {
    const ctx = await world();
    const [row] = await ctx.toValuation([ctx.k.char]);
    await ctx.refused("north", "proposeMarketValue", m(ctx.nl, row, 300), "not-your-turn", "the shop cannot open the market value");
    await ctx.ok("casey", "proposeMarketValue", m(ctx.nl, row, 400));
    await ctx.ok("north", "proposeMarketValue", m(ctx.nl, row, 360));
    await ctx.ok("casey", "acceptMarketValue", r_(ctx.nl, row));
    eq((await ctx.row(ctx.nl, row)).agreedMarket, 360, "agreed is the shop's standing counter");
    await ctx.refused("casey", "proposeTradePercent", p(ctx.nl, row, 0.9), "not-your-turn", "the Collector cannot open the percentage");
    await ctx.ok("north", "proposeTradePercent", p(ctx.nl, row, 0.7));
    await ctx.ok("casey", "proposeTradePercent", p(ctx.nl, row, 0.8));
    await ctx.ok("north", "acceptTradePercent", r_(ctx.nl, row));
    const c = await ctx.row(ctx.nl, row);
    eq([c.agreedMarket, c.agreedPercent, D.tradeValueOf(c)].join(), "360,0.8,288");
    await ctx.valid();
  });
  test("only the shop declines; the Collector's way out is still to take the card out", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.char, ctx.k.blas]);
    await ctx.refused("casey", "declineTradeCard", r_(ctx.nl, r1), "not-owner", "the Collector cannot decline");
    await ctx.ok("north", "declineTradeCard", r_(ctx.nl, r1));
    await ctx.ok("casey", "withdrawTradeCard", r_(ctx.nl, r2));
    eq((await ctx.deal(ctx.nl)).stage, "select-trade", "nothing left — back to Select Trade");
  });
});

/* ======================================================================= C */
describe("C. Wrong actor, wrong relationship", () => {
  test("another shop, an unrelated shop, another Collector and a bad token are all refused with nothing written", async () => {
    const ctx = await world();
    const [row] = await ctx.toValuation([ctx.k.char]);
    await ctx.ok("casey", "proposeMarketValue", m(ctx.nl, row, 400));
    for (const c of VALUE_TRADE) {
      const payload = { oppId: ctx.nl, tradeCardId: row, amount: 380, percent: 0.8 };
      await ctx.refused("silver", c, payload, "not-participant", `Silver Vale (related to Casey, not in the deal) ${c}`);
      await ctx.refused("faraway", c, payload, "not-participant", `Faraway (unrelated) ${c}`);
      const jordanCode = c === "declineTradeCard" ? "not-owner" : "not-participant";
      await ctx.refused("jordan", c, payload, jordanCode, `Jordan (another Collector) ${c}`);
    }
    const before = await ctx.version();
    const bad = await ctx.post("nobody", "acceptMarketValue", r_(ctx.nl, row));
    eq(bad.status, 401, "an unknown token");
    eq(await ctx.version(), before);
  });
});

/* ======================================================================= D */
describe("D. Wrong turn", () => {
  test("nobody moves twice, nobody accepts their own figure — but the shop may decline at any turn", async () => {
    const ctx = await world();
    const [row, r2] = await ctx.toValuation([ctx.k.char, ctx.k.blas]);
    await ctx.ok("casey", "proposeMarketValue", m(ctx.nl, row, 400));
    await ctx.ok("casey", "proposeMarketValue", m(ctx.nl, r2, 150));
    await ctx.refused("casey", "proposeMarketValue", m(ctx.nl, row, 390), "not-your-turn", "the Collector proposing again");
    await ctx.refused("casey", "acceptMarketValue", r_(ctx.nl, row), "not-your-turn", "the Collector accepting her own figure");
    await ctx.ok("north", "declineTradeCard", r_(ctx.nl, r2));
    await ctx.ok("north", "acceptMarketValue", r_(ctx.nl, row));
    await ctx.refused("north", "acceptTradePercent", r_(ctx.nl, row), "nothing-to-accept", "accepting a percentage nobody proposed");
  });
  test("a decline on the Collector's turn", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.char, ctx.k.blas]);
    eq((await ctx.view("north")).opportunities.find((o) => o.id === ctx.nl).turn.seat, "collector", "the Collector's move");
    await ctx.ok("north", "declineTradeCard", r_(ctx.nl, r1));
    await ctx.valid();
  });
});

/* ======================================================================= E */
describe("E. Wrong phase", () => {
  test("no value moves before Value Trade, no percentage before an agreed market value, no market move after it", async () => {
    const ctx = await world();
    const rows = await ctx.ok("north", "selectTradeCards", { oppId: ctx.nl, copyIds: [ctx.k.char] });
    for (const c of VALUE_TRADE) {
      const who = c === "declineTradeCard" ? "north" : "casey";
      await ctx.refused(who, c, { oppId: ctx.nl, tradeCardId: rows[0], amount: 400, percent: 0.8 }, "wrong-stage", `${c} in Select Trade`);
    }
    await ctx.ok("casey", "continueTradeSelection", { oppId: ctx.nl });
    await ctx.ok("north", "closeTradeSelection", { oppId: ctx.nl });
    const [row] = rows;
    await ctx.ok("casey", "proposeMarketValue", m(ctx.nl, row, 400));
    await ctx.refused("north", "proposeTradePercent", p(ctx.nl, row, 0.8), "wrong-stage", "a percentage before the market value is agreed");
    await ctx.ok("north", "acceptMarketValue", r_(ctx.nl, row));
    await ctx.refused("north", "proposeMarketValue", m(ctx.nl, row, 350), "wrong-stage", "a market move after it is agreed");
  });
  test("once every card is agreed the deal is in Deal, and Value Trade's moves and the decline are refused", async () => {
    const ctx = await world();
    const [row] = await ctx.toValuation([ctx.k.char]);
    await ctx.ok("casey", "proposeMarketValue", m(ctx.nl, row, 400));
    await ctx.ok("north", "acceptMarketValue", r_(ctx.nl, row));
    await ctx.ok("north", "proposeTradePercent", p(ctx.nl, row, 0.8));
    await ctx.ok("casey", "acceptTradePercent", r_(ctx.nl, row));
    eq((await ctx.deal(ctx.nl)).stage, "deal");
    await ctx.refused("north", "declineTradeCard", r_(ctx.nl, row), "wrong-stage", "a decline that arrives in Deal");
    await ctx.refused("casey", "proposeTradePercent", p(ctx.nl, row, 0.7), "wrong-stage", "a late counter");
  });
});

/* ======================================================================= F */
describe("F. Forged ids and forged authority", () => {
  test("a made-up deal or row, a row from another deal, and authority in the payload are all refused", async () => {
    const ctx = await world();
    const [row] = await ctx.toValuation([ctx.k.char]);
    const [svRow] = await ctx.toValuation([ctx.k.blas], ctx.sv, "silver");
    await ctx.refused("casey", "proposeMarketValue", m("opp-made-up", row, 400), "not-found", "a made-up deal");
    await ctx.refused("casey", "proposeMarketValue", m(ctx.nl, "tc-made-up", 400), "not-found", "a made-up row");
    await ctx.refused("casey", "proposeMarketValue", m(ctx.nl, svRow, 400), "not-found", "Silver Vale's row on Northline's deal");
    await ctx.refused("north", "declineTradeCard", r_(ctx.nl, svRow), "not-found", "declining another deal's row");
    await ctx.refused("north", "declineTradeCard", r_(ctx.sv, svRow), "not-participant", "declining in another shop's deal");
    for (const key of FORBIDDEN_PAYLOAD_KEYS) {
      const before = await ctx.version();
      const r = await ctx.post("north", "declineTradeCard", { ...r_(ctx.nl, row), [key]: "casey" });
      eq(r.status, 400, `a payload carrying "${key}"`);
      eq(await ctx.version(), before);
    }
    eq((await ctx.row(ctx.nl, row)).inclusion, "accepted", "the card is still in the deal");
  });
});

/* ======================================================================= G */
describe("G. Ended deals, and a shop card that is gone", () => {
  test("after the Collector ends the deal every Value Trade command is refused as terminal, and nothing is held", async () => {
    const ctx = await world();
    const [row] = await ctx.toValuation([ctx.k.char]);
    await ctx.ok("casey", "cancelOpportunity", { oppId: ctx.nl, reason: "Found it elsewhere." });
    for (const c of VALUE_TRADE) {
      const who = c === "declineTradeCard" || c === "acceptMarketValue" ? "north" : "casey";
      await ctx.refused(who, c, { oppId: ctx.nl, tradeCardId: row, amount: 400, percent: 0.8 }, "terminal", `${c} on an ended deal`);
    }
    eq(D.collectorCopyStatus(ctx.k.char, (await ctx.load()).opportunities), "available", "the ended deal holds nothing");
  });
  test("the shop cannot take its card off the shelf mid-valuation; if it is gone anyway, no new figure is accepted", async () => {
    const ctx = await world();
    const [row] = await ctx.toValuation([ctx.k.char]);
    await ctx.ok("casey", "proposeMarketValue", m(ctx.nl, row, 400));
    await ctx.ok("north", "acceptMarketValue", r_(ctx.nl, row));
    await ctx.refused("north", "removeInventoryCopy", { invId: ctx.i1 }, "copy-committed", "taking the card off the shelf mid-deal");
    /* Gone by a route no screen offers (the stored world edited directly, as
       the A3 suite ends a relationship): every new figure is refused. */
    const w = await ctx.load();
    await ctx.repository.saveWorld({ ...w, inventory: w.inventory.map((i) => (i.invId === ctx.i1 ? { ...i, archived: true } : i)) });
    await ctx.refused("north", "proposeTradePercent", p(ctx.nl, row, 0.8), "copy-unavailable", "valuing against a card that is gone");
  });
});

/* ======================================================================= H */
describe("H. Duplicate and racing declines", () => {
  test("a decline sent twice answers the same both times and writes once", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.char, ctx.k.blas]);
    const first = await ctx.post("north", "declineTradeCard", r_(ctx.nl, r1, { note: "Not this one." }));
    eq(first.status, 200);
    const v = await ctx.version();
    const again = await ctx.post("north", "declineTradeCard", r_(ctx.nl, r1, { note: "Not this one." }));
    eq([again.status, json(again.body.value)].join(), `200,${json(first.body.value)}`, "the retry's answer");
    eq(await ctx.version(), v, "the retry wrote the world");
    eq(D.collectorCopyStatus(ctx.k.blas, (await ctx.load()).opportunities), "reserved", "the other card is still held");
  });
  test("withdraw and decline sent at once: exactly one lands, the other is refused, the world stays valid", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.char, ctx.k.blas]);
    const [w, d] = await Promise.all([
      ctx.post("casey", "withdrawTradeCard", r_(ctx.nl, r1)),
      ctx.post("north", "declineTradeCard", r_(ctx.nl, r1))]);
    eq([w.status, d.status].sort().join(), "200,409", `one lands: ${json([w.body, d.body])}`);
    eq((w.status === 409 ? w : d).body.error.refused, "nothing-to-accept", "the loser is told the card is already out");
    const row = await ctx.row(ctx.nl, r1);
    eq(row.withdrawn === true, w.status === 200, "withdrawn only if the withdrawal landed");
    eq(row.inclusion === "rejected", d.status === 200, "declined only if the decline landed");
    eq(D.collectorCopyStatus(ctx.k.char, (await ctx.load()).opportunities), "available", "released either way");
    await ctx.valid();
  });
  test("a decline and a market move on the same card at once: both may land, in either order, and the world stays valid", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.char, ctx.k.blas]);
    const [mv, d] = await Promise.all([
      ctx.post("casey", "proposeMarketValue", m(ctx.nl, r1, 400)),
      ctx.post("north", "declineTradeCard", r_(ctx.nl, r1))]);
    eq(d.status, 200, "the decline is a retraction and lands");
    if (mv.status === 409) eq(mv.body.error.refused, "not-found", "a move on a card already declined");
    eq((await ctx.row(ctx.nl, r1)).inclusion, "rejected");
    await ctx.valid();
  });
});

describe("H2. What a decline does, as the server stores it", () => {
  test("declining the only card returns the deal to Select Trade; declining the last open one moves it to Deal", async () => {
    const ctx = await world();
    const [only] = await ctx.toValuation([ctx.k.char]);
    await ctx.ok("north", "declineTradeCard", r_(ctx.nl, only));
    eq((await ctx.deal(ctx.nl)).stage, "select-trade", "nothing left");
    const c2 = await world();
    const [a, b] = await c2.toValuation([c2.k.char, c2.k.blas]);
    await c2.ok("casey", "proposeMarketValue", m(c2.nl, a, 400));
    await c2.ok("casey", "proposeMarketValue", m(c2.nl, b, 150));
    await c2.ok("north", "acceptMarketValue", r_(c2.nl, a));
    await c2.ok("north", "proposeTradePercent", p(c2.nl, a, 0.8));
    await c2.ok("north", "proposeMarketValue", m(c2.nl, b, 140));
    await c2.ok("casey", "acceptTradePercent", r_(c2.nl, a));
    eq((await c2.deal(c2.nl)).stage, "value-trade");
    await c2.ok("north", "declineTradeCard", r_(c2.nl, b));
    const o = await c2.deal(c2.nl);
    eq(o.stage, "deal", "the one remaining card is settled → Deal");
    eq(D.calculatedBalance(o), 300 - 320, "the shop owes the Collector $20");
    const row = o.trade.cards.find((x) => x.id === b);
    eq(json(row.valueThread.map((e) => e.amount)), json([150, 140]), "the declined card's history is kept");
    assert(typeof row.declinedAt === "string" && row.declinedAt.startsWith("2030-"), `declinedAt is the server's time: ${row.declinedAt}`);
    await c2.valid();
  });
  test("a card deselected in Select Trade cannot be declined in Value Trade", async () => {
    const ctx = await world();
    const [r1] = await ctx.ok("north", "selectTradeCards", { oppId: ctx.nl, copyIds: [ctx.k.char, ctx.k.blas] });
    await ctx.ok("casey", "continueTradeSelection", { oppId: ctx.nl });
    await ctx.ok("north", "deselectTradeCard", r_(ctx.nl, r1));
    await ctx.ok("north", "closeTradeSelection", { oppId: ctx.nl });
    await ctx.refused("north", "declineTradeCard", r_(ctx.nl, r1), "nothing-to-accept", "a deselected card is not in the trade");
  });
});

/* ======================================================================= I */
describe("I. The decline note", () => {
  test("optional; one line of at most 140 characters; refused, never cut, when longer; not text is refused", async () => {
    const ctx = await world();
    const [r1, r2, r3] = await ctx.toValuation([ctx.k.char, ctx.k.blas, ctx.k.ven]);
    await ctx.refused("north", "declineTradeCard", r_(ctx.nl, r1, { note: "x".repeat(141) }), "message-too-long", "141 characters");
    await ctx.refused("north", "declineTradeCard", r_(ctx.nl, r1, { note: { text: "hi" } }), "message-empty", "a note that is not text");
    await ctx.ok("north", "declineTradeCard", r_(ctx.nl, r1, { note: "  Corner wear\n is more than the photos showed. " }));
    eq((await ctx.row(ctx.nl, r1)).declineNote, "Corner wear is more than the photos showed.");
    await ctx.ok("north", "declineTradeCard", r_(ctx.nl, r2, { note: "🃏".repeat(140) }));
    await ctx.ok("north", "declineTradeCard", r_(ctx.nl, r3));
    assert(!("declineNote" in (await ctx.row(ctx.nl, r3))), "no note was asked for");
    await ctx.valid();
  });
});

/* ======================================================================= J */
describe("J. Whole dollars and whole percentages, at the door", () => {
  test("fractional, zero, negative, over-100% and non-number values are refused; whole ones land", async () => {
    const ctx = await world();
    const [row] = await ctx.toValuation([ctx.k.char]);
    for (const bad of [399.5, 0, -10, "400", null]) {
      await ctx.refused("casey", "proposeMarketValue", m(ctx.nl, row, bad), "invalid-amount", `market ${json(bad)}`);
    }
    await ctx.ok("casey", "proposeMarketValue", m(ctx.nl, row, 400));
    await ctx.ok("north", "acceptMarketValue", r_(ctx.nl, row));
    for (const bad of [0, 0.755, -0.5, 1.01, 80, "0.8", null]) {
      await ctx.refused("north", "proposeTradePercent", p(ctx.nl, row, bad), "invalid-amount", `percent ${json(bad)}`);
    }
    await ctx.ok("north", "proposeTradePercent", p(ctx.nl, row, 0.29));
    eq((await ctx.row(ctx.nl, row)).tpPercent, 0.29, "29% — not exactly 29 × 0.01 in binary — is a whole percentage");
    await ctx.ok("casey", "proposeTradePercent", p(ctx.nl, row, 0.3));
    await ctx.ok("north", "proposeTradePercent", p(ctx.nl, row, 0.01));
    await ctx.ok("casey", "proposeTradePercent", p(ctx.nl, row, 1));
    await ctx.ok("north", "acceptTradePercent", r_(ctx.nl, row));
    eq(D.tradeValueOf(await ctx.row(ctx.nl, row)), 400, "100% of $400");
  });
});

/* ======================================================================= K */
describe("K. What each side may see", () => {
  test("the shop never sees the Collector's reference values; the Collector never sees the shop's default rate", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.char, ctx.k.blas]);
    await ctx.ok("casey", "proposeMarketValue", m(ctx.nl, r1, 400));
    eq((await ctx.deal(ctx.nl)).tradeRate, 0.85, "the stored deal carries Northline's rate");
    const north = await ctx.view("north");
    for (const id of [ctx.k.char, ctx.k.blas]) {
      const copy = north.collectorCopies.find((b) => b.id === id);
      assert(copy && !("market" in copy), `Northline sees Casey's reference value on ${id}`);
    }
    assert(!JSON.stringify(north).includes("410") && !JSON.stringify(north).includes("175"), "a reference value appears in Northline's view");
    const casey = await ctx.view("casey");
    const deal = casey.opportunities.find((o) => o.id === ctx.nl);
    assert(!("tradeRate" in deal), "Casey sees Northline's default rate");
    eq(deal.trade.cards.find((c) => c.id === r1).collectorMarket, 400, "the figure she proposed is shared");
  });
  test("a decline and its note reach both participants and no one else", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.char, ctx.k.blas]);
    await ctx.ok("north", "declineTradeCard", r_(ctx.nl, r1, { note: "Corner wear." }));
    for (const who of ["north", "casey"]) {
      const c = (await ctx.view(who)).opportunities.find((o) => o.id === ctx.nl).trade.cards.find((x) => x.id === r1);
      eq([c.inclusion, c.declinedStage, c.declineNote].join(), "rejected,value-trade,Corner wear.", who);
    }
    for (const who of ["silver", "faraway", "jordan"]) {
      const v = await ctx.view(who);
      assert(!v.opportunities.some((o) => o.id === ctx.nl), `${who} sees the deal`);
      assert(!JSON.stringify(v).includes("Corner wear."), `${who} sees the note`);
    }
  });
});

/* ======================================================================= L */
describe("L. Nothing else is written", () => {
  test("a whole valuation and a decline change no copy, no shop stock, no Goal, no relationship", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.char, ctx.k.blas]);
    const pick = (w) => json([w.collectorCopies, w.inventory, w.goals, w.relationships, w.partners, w.collectors,
      w.opportunities.find((o) => o.id === ctx.sv)]);
    const before = pick(await ctx.load());
    await ctx.ok("casey", "proposeMarketValue", m(ctx.nl, r1, 400));
    await ctx.ok("casey", "proposeMarketValue", m(ctx.nl, r2, 150));
    await ctx.ok("north", "acceptMarketValue", r_(ctx.nl, r1));
    await ctx.ok("north", "proposeTradePercent", p(ctx.nl, r1, 0.8));
    await ctx.ok("north", "declineTradeCard", r_(ctx.nl, r2, { note: "Not this one." }));
    eq(pick(await ctx.load()), before, "something outside the deal changed (copies, stock, Goals, relationships, Silver Vale's deal)");
  });
});

/* ======================================================================= M */
describe("M. A whole journey to Deal, through the door", () => {
  test("three cards: one settled, one declined after its value was agreed, one settled last → Deal, with the right cash", async () => {
    const ctx = await world();
    const [a, b, c] = await ctx.toValuation([ctx.k.char, ctx.k.blas, ctx.k.ven]);
    for (const [r, v] of [[a, 400], [b, 150], [c, 80]]) await ctx.ok("casey", "proposeMarketValue", m(ctx.nl, r, v));
    for (const r of [a, b, c]) await ctx.ok("north", "acceptMarketValue", r_(ctx.nl, r));
    await ctx.ok("north", "proposeTradePercent", p(ctx.nl, a, 0.5));
    await ctx.ok("north", "proposeTradePercent", p(ctx.nl, b, 0.5));
    await ctx.ok("north", "proposeTradePercent", p(ctx.nl, c, 0.5));
    await ctx.ok("casey", "acceptTradePercent", r_(ctx.nl, a));
    await ctx.ok("casey", "acceptTradePercent", r_(ctx.nl, b));
    eq((await ctx.deal(ctx.nl)).stage, "value-trade", "one card still open");
    await ctx.ok("north", "declineTradeCard", r_(ctx.nl, b, { note: "Changed our mind on this one." }));
    eq((await ctx.deal(ctx.nl)).stage, "value-trade", "still one card open");
    await ctx.ok("casey", "acceptTradePercent", r_(ctx.nl, c));
    const o = await ctx.deal(ctx.nl);
    eq(o.stage, "deal", "every remaining card agreed → Deal");
    eq(D.totalTradeValue(o), 200 + 40, "credit from the two remaining cards");
    eq(D.calculatedBalance(o), 300 - 240, "the Collector pays the $60 difference");
    const shown = (await ctx.view("casey")).opportunities.find((x) => x.id === ctx.nl);
    eq(shown.stage, "deal", "the Collector's view agrees");
    eq(D.collectorCopyStatus(ctx.k.blas, (await ctx.load()).opportunities), "available", "the declined card is free");
    await ctx.valid();
  });
});

run();
