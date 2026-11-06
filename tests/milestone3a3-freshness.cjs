/* ============================================================================
   M3A A3 — FRESHNESS: NEITHER PERSON ACTS ON, OR WAITS ON, A DEAL AS IT WAS

   Founder-authorized acceptance requirement: neither participant should
   unknowingly act on outdated deal information or be confused about whose
   turn it is — especially while coordinating outside MetYet.

   A screen showing a live deal reads the server again on arrival, on return to
   the page, and every 15 seconds while the page is visible (client/deal-
   freshness.js). A change is found per deal — never from the world's global
   version — and said once, quietly, on that deal. A failed check pauses the
   deal's moves until one succeeds. An unsent choice is never thrown away by a
   re-read: what is still choosable stays chosen; what is not is marked.

   Every seat is the real production app over the real API client and store,
   against the real Fastify app and PGlite. Two things are stood in for so the
   clock can be tested without waiting: the page (`document`/`window`, so it
   can be visible or hidden) and ONLY the freshness timers — a setTimeout of
   exactly 15, 30, 60 or 120 seconds is held here and run on demand; every
   other timer is the real one.
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const path = require("path");
const esbuild = require("esbuild");
const React = require("react");
const TR = require("react-test-renderer");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { createApp } = require("../server/app.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { fetchFor } = require("./helpers/command-server.cjs");
const RT = require("../domain/metyet-runtime.js");
const D = require("../domain/metyet-domain.js");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const load = (rel) => {
  const out = esbuild.buildSync({ entryPoints: [path.join(ROOT, rel)], bundle: true, format: "cjs",
    write: false, logLevel: "silent", jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"], define: { "process.env.NODE_ENV": '"production"' } });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};
const API = load("client/api.js");
const STORE = load("client/production-store.js");
const C = load("client/commands.js");
const ProductionApp = load("client/production-app.jsx").default;
const FRESH = load("client/deal-freshness.js");
const h = React.createElement;
const json = (v) => JSON.stringify(v);

/* ------------------------------------------------------ THE PAGE AND CLOCK */
const listeners = { document: {}, window: {} };
const on = (where) => (type, fn) => { (listeners[where][type] = listeners[where][type] || new Set()).add(fn); };
const off = (where) => (type, fn) => { if (listeners[where][type]) listeners[where][type].delete(fn); };
const page = { visibilityState: "visible", addEventListener: on("document"), removeEventListener: off("document"), querySelector: () => null };
globalThis.document = page;
/* A page that is otherwise the process's own globals: only its listeners,
   location and visibility are ours. */
globalThis.window = Object.assign(Object.create(globalThis), { addEventListener: on("window"), removeEventListener: off("window"),
  location: { pathname: "/app", search: "", hash: "", href: "http://localhost/app", origin: "http://localhost" },
  history: { replaceState() {}, pushState() {} } });
const FRESH_DELAYS = new Set([15000, 30000, 60000, 120000]);
const realSet = globalThis.setTimeout; const realClear = globalThis.clearTimeout;
const held = new Set();
globalThis.setTimeout = (fn, ms, ...rest) => {
  if (FRESH_DELAYS.has(ms)) { const t = { fn, ms, unref() {} }; held.add(t); return t; }
  return realSet(fn, ms, ...rest);
};
globalThis.clearTimeout = (t) => { if (held.has(t)) held.delete(t); else realClear(t); };
const settle = async () => { for (let i = 0; i < 6; i += 1) await TR.act(async () => {}); };
/* Fifteen seconds pass: every freshness timer waiting fires, once. */
const tick = async () => { const due = [...held]; held.clear(); for (const t of due) await TR.act(async () => { await t.fn(); }); await settle(); };
const pending = () => [...held].map((t) => t.ms);
const setVisible = async (v) => {
  page.visibilityState = v ? "visible" : "hidden";
  for (const fn of listeners.document.visibilitychange || []) await TR.act(async () => { fn(); });
  await settle();
};

/* ------------------------------------------------------------- THE SERVER */
const SUBJECT = { north: "sub-north", silver: "sub-silver", casey: "sub-casey", jordan: "sub-jordan" };
let pglite = null;
const seats = [];
async function world() {
  /* The last test's seats leave the page first, taking their clocks and listeners. */
  while (seats.length) await seats.pop().unmount();
  held.clear();
  page.visibilityState = "visible";
  const pg = pglite || (pglite = new PGlite());
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  const runtime = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 1000 });
  const repository = createWorldRepository(db);
  const catalog = createCatalogRepository(db, { newId: runtime.newId });
  const { expansionId } = await catalog.putExpansion({ game: "pokemon", code: "b1", name: "Base Set", printedTotal: 102 });
  const card = async (n, name, finish) => (await catalog.putCanonicalCard({ finish,
    cardContextId: (await catalog.putCardContext({ game: "pokemon", expansionId, collectorNumber: n, cardName: name, artist: "x", rarity: "Rare" })).cardContextId })).canonicalCardId;
  const cards = { char: await card("4", "Charizard", "holofoil"), blas: await card("2", "Blastoise", "holofoil"),
    mud: await card("60", "Mudkip", "non_holo"), pika: await card("58", "Pikachu", "non_holo") };
  await repository.saveWorld({
    catalog: [], collectors: [{ id: "c1", name: "Casey Lin" }, { id: "c2", name: "Jordan Park" }],
    partners: [{ id: "p1", name: "Northline" }, { id: "p2", name: "Silver Vale" }],
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
    if (!SUBJECT[token]) throw Object.assign(new Error("no"), { reason: "bad token" });
    return { subject: SUBJECT[token], email: `${token}@example.invalid`, emailVerified: true };
  } };
  const app = createApp({ repository, catalog, accounts, verifier, runtime });
  const post = async (who, command, payload) => {
    const res = await app.inject({ method: "POST", url: "/api/commands", headers: { authorization: `Bearer ${who}` }, payload: { command, payload } });
    return { status: res.statusCode, body: res.json() };
  };
  const ok = async (who, command, payload) => { const r = await post(who, command, payload); eq(r.status, 200, `${who} ${command}: ${json(r.body)}`); return r.body.value; };
  const k = {};
  k.a = await ok("casey", "addCollectorCopy", { copy: { canonicalCardId: cards.char, grade: "PSA 9", cert: "CERT-AAA", offered: true } });
  k.b = await ok("casey", "addCollectorCopy", { copy: { canonicalCardId: cards.char, grade: "PSA 7", cert: "CERT-BBB", offered: true } });
  k.blas = await ok("casey", "addCollectorCopy", { copy: { canonicalCardId: cards.blas, grade: "Raw", condition: "Near Mint", offered: true } });
  const g1 = await ok("casey", "addGoal", { canonicalCardId: cards.mud, tier: "primary", desired: { grade: "PSA 9" } });
  const g2 = await ok("casey", "addGoal", { canonicalCardId: cards.pika, tier: "primary", desired: { grade: "PSA 9" } });
  const i1 = await ok("north", "addInventoryCopy", { copy: { canonicalCardId: cards.mud, grade: "PSA 9", ask: 300 } });
  const i2 = await ok("silver", "addInventoryCopy", { copy: { canonicalCardId: cards.pika, grade: "PSA 9", ask: 200 } });
  const nl = await ok("casey", "startOpportunity", { goalId: g1, invId: i1, amount: 300 });
  await ok("north", "acceptPrice", { oppId: nl });
  const sv = await ok("casey", "startOpportunity", { goalId: g2, invId: i2, amount: 200 });
  await ok("silver", "acceptPrice", { oppId: sv });
  const ctx = { app, repository, cards, k, nl, sv, post, ok };
  ctx.deal = async (id) => (await repository.loadWorld()).opportunities.find((o) => o.id === id);
  ctx.row = async (id, copyId) => D.TRADE.liveTradeRows(await ctx.deal(id)).find((r) => r.binderId === copyId).id;
  ctx.version = async () => repository.withTransaction((tx) => repository.readVersion(tx));
  return ctx;
}

/* ------------------------------------------------------------- A SEAT */
async function seat(ctx, token) {
  const s = { posts: [], views: 0, failViews: false, token };
  const base = fetchFor(ctx.app);
  const fetchImpl = async (url, init = {}) => {
    const isCommand = (init.method || "GET") === "POST" && /\/api\/commands$/.test(String(url));
    if (isCommand) s.posts.push(JSON.parse(init.body).command);
    if (/\/api\/view$/.test(String(url))) { s.views += 1; if (s.failViews) throw new TypeError("network lost"); }
    return base(url, init);
  };
  const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => s.token, fetchImpl, timeoutMs: 60000 });
  const store = STORE.createProductionStore({ api });
  await store.load();
  const bind = {
    onBrowseCards: C.browseCards(store), onRefresh: C.refreshView(store),
    onOpenOffer: C.openOffer(store), onCounterOffer: C.counterOffer(store), onAcceptOffer: C.acceptOffer(store),
    onDeclineOffer: C.declineOffer(store), onWithdrawOffer: C.withdrawOffer(store), onSendMessage: C.sendDealMessage(store),
    onSelectTrade: C.selectTrade(store), onDeselectTrade: C.deselectTrade(store), onCloseSelection: C.closeSelection(store),
    onHoldSelection: C.holdSelection(store), onReadyForSelection: C.readyForSelection(store), onWithdrawTradeCard: C.withdrawTradeCard(store),
  };
  function Seat() {
    const [state, setState] = React.useState(store.get());
    React.useEffect(() => store.sub((x) => setState(x)), []);
    return h(ProductionApp, { state, onSignOut: () => {}, ...bind });
  }
  let r;
  await TR.act(async () => { r = TR.create(h(Seat), { createNodeMock: () => ({ focus() {}, scrollIntoView() {} }) }); });
  await settle();
  Object.assign(s, { r, store, root: () => r.root });
  s.unmount = async () => { await TR.act(async () => { r.unmount(); }); };
  seats.push(s);
  return s;
}
const textOf = (node) => (typeof node === "string" ? node : !node || !node.children || node.type === "style" ? "" : node.children.map(textOf).join(" "));
const flat = (n) => textOf(n).replace(/\s+/g, " ").trim();
const buttons = (root) => root.findAll((n) => n.type === "button");
const button = (root, t) => buttons(root).find((b) => flat(b) === t || flat(b).startsWith(t)) || null;
const press = async (root, t) => {
  const b = button(root, t); assert(b, `no "${t}" among: ${buttons(root).map(flat).join(" | ")}`);
  assert(!b.props.disabled, `"${t}" is disabled`);
  await TR.act(async () => { await b.props.onClick(); }); await settle();
};
const go = async (s, nav) => { const b = buttons(s.root()).find((n) => flat(n).startsWith(nav)); assert(b, nav); await TR.act(async () => { b.props.onClick(); }); await settle(); };
const shopPanel = (s, oppId) => s.root().findAll((n) => n.type === "section" && n.props["data-select"] === oppId && String(n.props.className).includes("tps-sel"))[0] || null;
const listIn = (root, aria) => (root ? root.findAll((n) => n.type === "ul" && n.props["aria-label"] === aria)[0] || null : null);
const ids = (ul) => (ul ? ul.findAll((n) => n.type === "li" && n.props["data-copy"]).map((n) => n.props["data-copy"]) : []);
const copyIn = (root, id) => (root ? root.findAll((n) => n.type === "li" && n.props["data-copy"] === id)[0] || null : null);
const ws = (s, oppId) => s.root().findAll((n) => n.type === "div" && n.props.className === "mcs-ws" && n.props["data-opp"] === oppId)[0] || null;
const area = (s, oppId) => { const w = ws(s, oppId); return w ? w.findAll((n) => n.type === "section" && n.props["data-select"] === oppId)[0] || null : null; };
const noteOf = (root) => root.findAll((n) => n.props && ["tps-fresh", "mcs-fresh"].includes(n.props.className)).map(flat);
async function openDeal(s, oppId) {
  const back = s.root().findAll((n) => n.type === "button" && n.props.className === "mcs-ws-back")[0];
  if (back) { await TR.act(async () => { back.props.onClick(); }); await settle(); }
  if (!s.root().findAll((n) => n.props && n.props.className === "mcs-dg-deal").length) await go(s, "Deal Flow");
  const card = s.root().findAll((n) => n.type === "div" && n.props.className === "mcs-dg-deal" && n.props["data-opp"] === oppId)[0];
  assert(card, "no deal card");
  await TR.act(async () => { card.findAll((n) => n.type === "button" && String(n.props.className || "").includes("mcs-dg-cta"))[0].props.onClick(); });
  await settle();
  return ws(s, oppId);
}
const selected = async (ctx, id) => D.TRADE.liveTradeRows(await ctx.deal(id)).map((r) => r.binderId).sort();

/* ======================================================================= 1 */
describe("1. Coming back to a deal shows it as it stands, with nothing to press", () => {
  test("Collector: the shop changed the selection while she was away — Deal Flow and the deal both show the latest", async () => {
    const ctx = await world();
    await ctx.ok("north", "selectTradeCards", { oppId: ctx.nl, copyIds: [ctx.k.a, ctx.k.b] });
    await ctx.ok("casey", "continueTradeSelection", { oppId: ctx.nl });
    const casey = await seat(ctx, "casey");
    await openDeal(casey, ctx.nl);
    eq(ids(listIn(area(casey, ctx.nl), "Chosen by Northline")).sort().join(), [ctx.k.a, ctx.k.b].sort().join(), "what she saw");
    await ctx.ok("north", "deselectTradeCard", { oppId: ctx.nl, tradeCardId: await ctx.row(ctx.nl, ctx.k.b) });
    const before = casey.views;
    await openDeal(casey, ctx.nl);         // back to Deal Flow, then into the deal again
    assert(casey.views > before, "returning did not read the server");
    eq(ids(listIn(area(casey, ctx.nl), "Chosen by Northline")).join(), ctx.k.a, "the removed card is still shown");
    eq(casey.posts.length, 0, "she had to press something");
  });
  test("Shop: Casey said she's ready while Northline was elsewhere — opening Opportunities shows Start valuing", async () => {
    const ctx = await world();
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    await ctx.ok("north", "selectTradeCards", { oppId: ctx.nl, copyIds: [ctx.k.a] });
    await go(north, "Inventory");
    await ctx.ok("casey", "continueTradeSelection", { oppId: ctx.nl });
    await go(north, "Opportunities");
    assert(button(shopPanel(north, ctx.nl), "Start valuing 1 card"), flat(shopPanel(north, ctx.nl)));
  });
});

/* ======================================================================= 2 */
describe("2. Both on the deal: each sees the other's move within one check, and is told what it was", () => {
  test("the shop sends; Casey's open deal shows it on the next check — then she's ready, and the shop's does", async () => {
    const ctx = await world();
    const casey = await seat(ctx, "casey");
    await openDeal(casey, ctx.nl);
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    await press(copyIn(shopPanel(north, ctx.nl), ctx.k.a), "Choose");
    await press(shopPanel(north, ctx.nl), "Send 1 card to Casey Lin");
    assert(!button(area(casey, ctx.nl), "I'm ready"), "she knew before any check");
    await tick();
    const a = area(casey, ctx.nl);
    assert(button(a, "I'm ready — they can finish choosing"), "the check did not bring her turn: " + flat(a));
    eq(json(noteOf(ws(casey, ctx.nl))), json(["Updated — Northline chose cards."]), "what happened, said once");
    await press(a, "I'm ready — they can finish choosing");
    await tick();
    assert(button(shopPanel(north, ctx.nl), "Start valuing 1 card"), "the shop's check did not bring its turn");
    assert(noteOf(north.root()).includes("Updated — Casey Lin is ready."), json(noteOf(north.root())));
    assert(!/Sent 1 card to Casey Lin\./.test(flat(shopPanel(north, ctx.nl))), "the old 'Sent' line outlived the change");
    /* The stage moves: the shop starts valuing; Casey's next check says so. */
    await press(shopPanel(north, ctx.nl), "Start valuing 1 card"); await press(shopPanel(north, ctx.nl), "Start valuing");
    await tick();
    assert(/held for this deal/.test(flat(area(casey, ctx.nl))), flat(area(casey, ctx.nl)));
    assert(noteOf(ws(casey, ctx.nl)).includes("Updated — the chosen cards are now held for this deal."), json(noteOf(ws(casey, ctx.nl))));
  });
  test("a person's own move is not announced to them as an update", async () => {
    const ctx = await world();
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    await press(copyIn(shopPanel(north, ctx.nl), ctx.k.a), "Choose");
    await press(shopPanel(north, ctx.nl), "Send 1 card to Casey Lin");
    await tick();
    eq(json(noteOf(north.root())), "[]", "Northline was told about its own send");
  });
});

/* ======================================================================= 3 */
describe("3. Only this deal's changes count", () => {
  test("other people's activity moves the world's version, but says nothing on this deal", async () => {
    const ctx = await world();
    const casey = await seat(ctx, "casey"); await openDeal(casey, ctx.nl);
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    await tick();
    const v0 = await ctx.version();
    await ctx.ok("jordan", "addCollectorCopy", { copy: { canonicalCardId: ctx.cards.pika, grade: "PSA 8", offered: true } });
    await ctx.ok("silver", "addInventoryCopy", { copy: { canonicalCardId: ctx.cards.blas, grade: "PSA 9", ask: 99 } });
    await ctx.ok("casey", "addGoal", { canonicalCardId: ctx.cards.blas, tier: "secondary", desired: { grade: "PSA 9" } });
    assert((await ctx.version()) > v0, "the version did not move");
    await tick();
    eq(json(noteOf(ws(casey, ctx.nl))), "[]", "Casey was told her deal changed");
    eq(json(noteOf(north.root())), "[]", "Northline was told its deal changed");
  });
  test("the fingerprint ignores conversation and read position, and sees turn, rows, copies and connection", () => {
    const deal = { id: "o", collectorId: "c", partnerId: "p", turn: { seat: "tp", reason: "select-trade", active: true },
      trade: { cards: [{ id: "r1", binderId: "b1", inclusion: "accepted" }] }, viewedAt: { tp: "x" } };
    const state = { opportunities: [deal], collectorCopies: [{ id: "b1", collectorId: "c", status: "selected" }], collectors: [{ id: "c" }],
      conversations: [{ id: "t", messages: [] }] };
    const base = FRESH.dealPrint(state, "o", "tp");
    const same = (s2) => json(FRESH.dealPrint(s2, "o", "tp")) === json(base);
    assert(same({ ...state, conversations: [{ id: "t", messages: [{ text: "hi" }] }] }), "a message counted as a deal change");
    assert(same({ ...state, opportunities: [{ ...deal, viewedAt: { tp: "y" } }] }), "a read position counted");
    assert(!same({ ...state, opportunities: [{ ...deal, turn: { ...deal.turn, reason: "more-cards" } }] }), "a turn did not count");
    assert(!same({ ...state, opportunities: [{ ...deal, trade: { cards: [{ ...deal.trade.cards[0], withdrawn: true }] } }] }), "a row did not count");
    assert(!same({ ...state, collectorCopies: [{ id: "b1", collectorId: "c", status: "unavailable" }] }), "a copy did not count");
    assert(!same({ ...state, collectors: [] }), "the connection did not count");
  });
});

/* ======================================================================= 4 */
describe("4. A re-read never throws away an unsent choice", () => {
  test("still-choosable cards stay chosen; one now held elsewhere is kept, marked, never sent", async () => {
    const ctx = await world();
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    for (const id of [ctx.k.a, ctx.k.b, ctx.k.blas]) await press(copyIn(shopPanel(north, ctx.nl), id), "Choose");
    assert(/3 cards chosen · Not sent yet/.test(flat(shopPanel(north, ctx.nl))));
    /* Silver Vale takes k.a for its own deal while Northline's choice is unsent. */
    await ctx.ok("silver", "selectTradeCards", { oppId: ctx.sv, copyIds: [ctx.k.a] });
    await ctx.ok("casey", "continueTradeSelection", { oppId: ctx.sv });
    await ctx.ok("silver", "closeTradeSelection", { oppId: ctx.sv });
    await tick();
    const p = shopPanel(north, ctx.nl);
    assert(/2 cards chosen · Not sent yet/.test(flat(p)), "the eligible two: " + flat(p));
    const lost = listIn(p, "No longer available to choose");
    eq(ids(lost).join(), ctx.k.a, "the held card is kept and marked");
    assert(/No longer available to choose — it won't be sent/.test(flat(lost)) && /CERT-AAA/.test(flat(lost)), flat(lost));
    eq(north.posts.length, 0, "a re-read sent something");
    await press(p, "Send 2 cards to Casey Lin");
    eq(json(await selected(ctx, ctx.nl)), json([ctx.k.b, ctx.k.blas].sort()), "exactly the eligible two were sent");
  });
  test("when every unsent card is gone, nothing is sent until the shop clears them", async () => {
    const ctx = await world();
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    await press(copyIn(shopPanel(north, ctx.nl), ctx.k.a), "Choose");
    await ctx.ok("casey", "setCollectorCopyKept", { copyId: ctx.k.a, keeping: true });
    await tick();
    const p = shopPanel(north, ctx.nl);
    eq(ids(listIn(p, "No longer available to choose")).join(), ctx.k.a, "kept from what it was");
    assert(button(p, "Ask Casey Lin for more cards").props.disabled, "an empty send while a lost choice is on screen");
    await press(copyIn(listIn(p, "No longer available to choose"), ctx.k.a), "Remove from my choice");
    assert(!button(shopPanel(north, ctx.nl), "Ask Casey Lin for more cards").props.disabled);
  });
  test("an open 'Start valuing' confirmation closes when the deal changes under it, and nothing is sent", async () => {
    const ctx = await world();
    await ctx.ok("north", "selectTradeCards", { oppId: ctx.nl, copyIds: [ctx.k.a, ctx.k.b] });
    await ctx.ok("casey", "continueTradeSelection", { oppId: ctx.nl });
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    await press(shopPanel(north, ctx.nl), "Start valuing 2 cards");
    assert(/Start valuing these 2 cards\?/.test(flat(shopPanel(north, ctx.nl))));
    await ctx.ok("casey", "withdrawTradeCard", { oppId: ctx.nl, tradeCardId: await ctx.row(ctx.nl, ctx.k.b) });
    await tick();
    const p = shopPanel(north, ctx.nl);
    assert(!/Start valuing these/.test(flat(p)), "the confirmation outlived the change");
    assert(/This deal changed while you were confirming — check the cards\./.test(flat(p)), flat(p));
    assert(button(p, "Start valuing 1 card"), "the deal as it stands");
    eq(north.posts.length, 0, "something was sent");
    eq((await ctx.deal(ctx.nl)).stage, "select-trade");
  });
});

/* ======================================================================= 5 */
describe("5. When the latest can't be confirmed, nothing consequential is sent", () => {
  test("a failed check says so, pauses the moves, backs off; Refresh deal recovers everything", async () => {
    const ctx = await world();
    await ctx.ok("north", "selectTradeCards", { oppId: ctx.nl, copyIds: [ctx.k.a] });
    await ctx.ok("casey", "continueTradeSelection", { oppId: ctx.nl });
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    const casey = await seat(ctx, "casey"); await openDeal(casey, ctx.nl);
    north.failViews = true; casey.failViews = true;
    await tick();
    for (const [s, label, scope] of [[north, "Refresh deals", north.root()], [casey, "Refresh deal", ws(casey, ctx.nl)]]) {
      assert(/Couldn't check for updates — what's shown may be out of date\./.test(flat(scope)), flat(scope).slice(0, 300));
      assert(button(scope, label), label);
    }
    assert(button(shopPanel(north, ctx.nl), "Start valuing 1 card").props.disabled, "the shop could start valuing on a stale view");
    assert(button(area(casey, ctx.nl), "Hold on, I'm adding cards").props.disabled, "the Collector could act on a stale view");
    assert(pending().includes(30000), "no back-off: " + json(pending()));
    await tick();
    assert(pending().includes(60000), "back-off did not grow: " + json(pending()));
    north.failViews = false; casey.failViews = false;
    await press(north.root(), "Refresh deals");
    await press(ws(casey, ctx.nl), "Refresh deal");
    assert(!/Couldn't check/.test(flat(north.root())) && !/Couldn't check/.test(flat(ws(casey, ctx.nl))), "the failure line stayed");
    assert(!button(shopPanel(north, ctx.nl), "Start valuing 1 card").props.disabled, "the moves stayed paused");
    assert(pending().every((ms) => ms === 15000), "the clock did not return to 15s: " + json(pending()));
    eq(north.posts.length + casey.posts.length, 0, "a paused screen sent something");
  });
  test("a session that ended stops checking and says so; it does not keep asking", async () => {
    const ctx = await world();
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    north.token = "nobody";
    await tick();
    assert(/Your session has ended — sign in again to see the latest\./.test(flat(north.root())), flat(north.root()).slice(0, 300));
    const n = north.views;
    eq(pending().length, 0, "it kept a timer after the session ended");
    await tick();
    eq(north.views, n, "it kept asking");
  });
  test("a relationship that ends during the deal is noticed and said; the moves are refused by the server", async () => {
    const ctx = await world();
    await ctx.ok("north", "selectTradeCards", { oppId: ctx.nl, copyIds: [ctx.k.a] });
    await ctx.ok("casey", "continueTradeSelection", { oppId: ctx.nl });
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    const w = await ctx.repository.loadWorld();
    await ctx.repository.saveWorld({ ...w, relationships: w.relationships.map((r) => (r.partnerId === "p1" && r.collectorId === "c1" ? { ...r, status: "ended" } : r)) });
    await tick();
    assert(noteOf(north.root()).some((t) => /Updated — you're no longer connected with/.test(t)), json(noteOf(north.root())));
    eq((await ctx.post("north", "closeTradeSelection", { oppId: ctx.nl })).body.error.refused, "no-relationship");
  });
});

/* ======================================================================= 6 */
describe("6. One clock per deal screen, and only while it can be seen", () => {
  test("one timer while visible; none when hidden; coming back checks at once; leaving stops it", async () => {
    const ctx = await world();
    const north = await seat(ctx, "north");
    eq(pending().length, 0, "a clock with no deal on screen");
    await go(north, "Opportunities");
    eq(json(pending()), json([15000]), "not exactly one clock");
    await tick(); await tick();
    eq(json(pending()), json([15000]), "the clock multiplied");
    await setVisible(false);
    eq(pending().length, 0, "it kept checking while hidden");
    const n = north.views;
    await setVisible(true);
    assert(north.views === n + 1, "coming back did not check at once");
    eq(json(pending()), json([15000]), "the clock did not resume once");
    await go(north, "Inventory");
    eq(pending().length, 0, "leaving the deals left the clock running");
  });
  test("Deal Flow reads on arrival and on return but keeps no clock; an open deal keeps one", async () => {
    const ctx = await world();
    const casey = await seat(ctx, "casey");
    const n = casey.views;
    await go(casey, "Deal Flow");
    assert(casey.views > n, "arriving at Deal Flow did not read");
    eq(pending().length, 0, "Deal Flow keeps a clock");
    await openDeal(casey, ctx.nl);
    eq(json(pending()), json([15000]), "the open deal has no clock, or more than one");
  });
  test("the freshness code reaches nothing but the re-read it is handed, and names no seat", () => {
    const src = code("client/deal-freshness.js");
    assert(!/\bfetch\s*\(|XMLHttpRequest|EventSource|WebSocket|store\.|api\.|localStorage|sessionStorage/.test(src), "it reaches past onRefresh");
    assert(!/world_meta|\.version\b|version\(\)/.test(src), "it compares the world's version");
    for (const f of ["client/tp/sections/Opportunities.jsx", "client/collector/DealWorkspace.jsx", "client/collector/sections/DealFlow.jsx"]) {
      assert(!/(seat)\s*:\s*["'`]/.test(code(f)), `${f} names a seat`);
    }
  });
});

/* ======================================================================= 7 */
describe("7. The conversation is untouched: notes are not messages", () => {
  test("checks add nothing to the thread; Refresh messages still re-reads; a note is never a stored record", async () => {
    const ctx = await world();
    const casey = await seat(ctx, "casey"); await openDeal(casey, ctx.nl);
    await ctx.ok("north", "selectTradeCards", { oppId: ctx.nl, copyIds: [ctx.k.a] });
    await tick();
    assert(noteOf(ws(casey, ctx.nl)).length === 1, "no note");
    const thread = ws(casey, ctx.nl).findAll((n) => n.type === "section" && n.props["data-thread"] === ctx.nl)[0];
    eq(thread.findAll((n) => n.type === "li").length, 0, "a check wrote into the conversation");
    eq(((await ctx.repository.loadWorld()).conversations || []).length, 0, "a check stored something");
    await ctx.ok("north", "sendDealMessage", { oppId: ctx.nl, text: "Sent you one.", nonce: "n1" });
    const n = casey.views;
    await press(ws(casey, ctx.nl), "Refresh messages");
    assert(casey.views === n + 1 && /Sent you one\./.test(flat(ws(casey, ctx.nl))), "Refresh messages");
    eq(noteOf(ws(casey, ctx.nl)).length, 1, "a message became a deal note");
  });
});

run().finally(() => { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; delete globalThis.document; delete globalThis.window; });
