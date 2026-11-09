/* ============================================================================
   M3B B4 — VALUE TRADE IN PRODUCTION: THE COLLECTOR'S SCREEN AND THE DEAL SUMMARY

   B3 gave the Trusted Partner its Value Trade screen and opened the five
   commands. B4 gives the Collector hers, in the Deal Workspace, with four of
   the same bindings — no allow-list change — and the first form of the Deal
   Summary: the card being bought, the cards going toward it, and what is left
   to pay.

     Collector   proposeMarketValue   "Propose a market value" (she opens) / "Counter"
                 acceptMarketValue    "Accept $N"
                 proposeTradePercent  "Counter" a partner's %
                 acceptTradePercent   "Accept N%"
                 withdrawTradeCard    "Take out of this deal" — confirmation (existing)

   Both seats are rendered here over the whole production path — the real
   API client, store, Fastify app (auth, allow-list), executeCommand, PGlite
   with every migration and the projection — and each journey is checked on
   both screens and in the database. As in the A3 freshness suite, the page
   and ONLY the freshness timers are stood in for.

     A  the Collector's Value Trade, state by state      E  stage transitions
     B  taking a card out                                F  stale, lost, double, refused
     C  a card the partner declined                      G  nothing else changes
     D  the Deal Summary                                 H  wiring, layout, accessibility
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
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
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
const { fetchFor } = require("./helpers/command-server.cjs");
const RT = require("../domain/metyet-runtime.js");
const D = require("../domain/metyet-domain.js");
const W = require("../domain/metyet-world.js");
const P = require("../domain/metyet-projection.js");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
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
const SUM = load("client/deal-summary.jsx");
const VTX = load("client/value-trade.jsx");
const ProductionApp = load("client/production-app.jsx").default;
const h = React.createElement;
const json = (v) => JSON.stringify(v);

/* ------------------------------------------------------ THE PAGE AND CLOCK */
const listeners = { document: {}, window: {} };
const on = (where) => (type, fn) => { (listeners[where][type] = listeners[where][type] || new Set()).add(fn); };
const off = (where) => (type, fn) => { if (listeners[where][type]) listeners[where][type].delete(fn); };
globalThis.document = { visibilityState: "visible", addEventListener: on("document"), removeEventListener: off("document"), querySelector: () => null };
globalThis.window = Object.assign(Object.create(globalThis), { addEventListener: on("window"), removeEventListener: off("window"),
  scrollTo() {}, location: { pathname: "/app", search: "", hash: "", href: "http://localhost/app", origin: "http://localhost" },
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
const tick = async () => { const due = [...held]; held.clear(); for (const t of due) await TR.act(async () => { await t.fn(); }); await settle(); };

/* ------------------------------------------------------------- THE SERVER */
const SUBJECT = { north: "sub-north", casey: "sub-casey" };
let pglite = null;
const seats = [];
async function world({ ask = 300, cost = null, market = null, rawFeatured = false } = {}) {
  while (seats.length) await seats.pop().unmount();
  held.clear();
  const pg = pglite || (pglite = new PGlite());
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  const runtime = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 1000 });
  const repository = createWorldRepository(db);
  const catalog = createCatalogRepository(db, { newId: runtime.newId });
  const { expansionId } = await catalog.putExpansion({ game: "pokemon", code: "b1", name: "Base Set", printedTotal: 102 });
  const { expansionId: sv } = await catalog.putExpansion({ game: "pokemon", code: "sv3pt5", name: "151", printedTotal: 165 });
  /* A release whose printed total the catalogue does not hold (B4 refinement). */
  const { expansionId: promo } = await catalog.putExpansion({ game: "pokemon", code: "svp", name: "Black Star Promos" });
  const card = async (exp, n, name, dims) => (await catalog.putCanonicalCard({ ...dims,
    cardContextId: (await catalog.putCardContext({ game: "pokemon", expansionId: exp, collectorNumber: n, cardName: name, artist: "Ken Sugimori", rarity: "Rare" })).cardContextId })).canonicalCardId;
  const cards = {
    char: await card(expansionId, "4", "Charizard", { finish: "holofoil", printRun: "first_edition" }),
    pika: await card(sv, "173", "Pikachu", { finish: "non_holo" }),
    mew: await card(sv, "151", "Mew", { finish: "holofoil", language: "ja" }),
    promo: await card(promo, "050", "Eevee", { finish: "holofoil", stamp: "prerelease" }),
  };
  await repository.saveWorld({
    catalog: [], collectors: [{ id: "c1", name: "Casey Lin" }],
    partners: [{ id: "p1", name: "Northline", tradeRate: 0.85 }],
    relationships: [{ partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" }],
    invitations: [], goals: [], inventory: [], collectorCopies: [], binders: [], binderEntries: [],
    interests: [], opportunities: [], conversations: [], photoRequests: [], copyReviews: [] });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: SUBJECT.north, role: "tp", partnerId: "p1" });
  await accounts.linkAccount({ subject: SUBJECT.casey, role: "collector", collectorId: "c1" });
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
  /* Casey's Trade/Sell cards: a graded first-edition Charizard, a raw
     Pikachu, a graded Japanese Mew. */
  k.char = await ok("casey", "addCollectorCopy", { copy: { canonicalCardId: cards.char, grade: "PSA 9", cert: "CERT-AAA", offered: true,
    ...(market != null ? { market } : {}) } });
  k.pika = await ok("casey", "addCollectorCopy", { copy: { canonicalCardId: cards.pika, grade: "Raw", condition: "Near Mint", offered: true } });
  k.mew = await ok("casey", "addCollectorCopy", { copy: { canonicalCardId: cards.mew, grade: "PSA 8", offered: true } });
  /* The card she is buying: Northline's graded Charizard... of a different
     printing — a Pikachu from 151, graded PSA 10, cert NL-0001. */
  /* `rawFeatured` (B4 polish): the card she is buying is a raw Near Mint copy instead. */
  const featuredCopy = rawFeatured ? { grade: "Raw", condition: "Near Mint" } : { grade: "PSA 10", cert: "NL-0001" };
  const g1 = await ok("casey", "addGoal", { canonicalCardId: cards.pika, tier: "primary",
    desired: rawFeatured ? { grade: "Raw", condition: "Near Mint" } : { grade: "PSA 10" } });
  const i1 = await ok("north", "addInventoryCopy", { copy: { canonicalCardId: cards.pika, ...featuredCopy, ask,
    ...(cost != null ? { cost } : {}) } });
  const nl = await ok("casey", "startOpportunity", { goalId: g1, invId: i1, amount: ask });
  await ok("north", "acceptPrice", { oppId: nl });
  const ctx = { app, repository, cards, k, nl, i1, post, ok };
  ctx.load = () => repository.loadWorld();
  ctx.deal = async () => (await ctx.load()).opportunities.find((o) => o.id === nl);
  ctx.row = async (id) => (await ctx.deal()).trade.cards.find((r) => r.id === id);
  ctx.status = async (copyId) => D.collectorCopyStatus(copyId, (await ctx.load()).opportunities);
  ctx.valid = async () => { const v = W.validateWorld(await ctx.load()); assert(v.ok, json(v.errors.slice(0, 3))); };
  ctx.toValuation = async (copyIds) => {
    await ok("north", "selectTradeCards", { oppId: nl, copyIds });
    await ok("casey", "continueTradeSelection", { oppId: nl });
    await ok("north", "closeTradeSelection", { oppId: nl });
    const rows = (await ctx.deal()).trade.cards;
    return copyIds.map((id) => rows.find((r) => r.binderId === id && r.inclusion === "accepted" && !r.withdrawn).id);
  };
  const v = (who, command) => (row, x = {}) => ok(who, command, { oppId: nl, tradeCardId: row, ...x });
  ctx.casey = { market: (r, amount) => v("casey", "proposeMarketValue")(r, { amount }), acceptMarket: v("casey", "acceptMarketValue"),
    percent: (r, percent) => v("casey", "proposeTradePercent")(r, { percent }), acceptPercent: v("casey", "acceptTradePercent") };
  ctx.north = { market: (r, amount) => v("north", "proposeMarketValue")(r, { amount }), acceptMarket: v("north", "acceptMarketValue"),
    percent: (r, percent) => v("north", "proposeTradePercent")(r, { percent }), acceptPercent: v("north", "acceptTradePercent"),
    decline: (r, note) => v("north", "declineTradeCard")(r, note ? { note } : {}) };
  /* Value one card all the way: Casey opens at `m`, Northline accepts, opens `p`, Casey accepts. */
  ctx.settle = async (r, m, p) => { await ctx.casey.market(r, m); await ctx.north.acceptMarket(r); await ctx.north.percent(r, p); await ctx.casey.acceptPercent(r); };
  return ctx;
}

/* ------------------------------------------------------------- A SEAT */
async function seat(ctx, token) {
  const posts = []; const sent = [];
  const base = fetchFor(ctx.app);
  const s = { posts, sent, lose: null, nl: ctx.nl, failViews: false, views: 0 };
  const fetchImpl = async (url, init = {}) => {
    const isCommand = (init.method || "GET") === "POST" && /\/api\/commands$/.test(String(url));
    if (isCommand) { const b = JSON.parse(init.body); posts.push(b.command); sent.push(b); }
    if (!isCommand && /\/api\/view/.test(String(url))) { s.views += 1; if (s.failViews) throw new TypeError("network down"); }
    const res = await base(url, init);
    if (isCommand && s.lose && JSON.parse(init.body).command === s.lose) { s.lose = null; throw new TypeError("network lost"); }
    return res;
  };
  const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => token, fetchImpl, timeoutMs: 60000 });
  const store = STORE.createProductionStore({ api });
  await store.load();
  /* Bound exactly as client/sign-in/SignIn.jsx binds them. */
  const bind = {
    onBrowseCards: C.browseCards(store), onRefresh: C.refreshView(store),
    onOpenOffer: C.openOffer(store), onCounterOffer: C.counterOffer(store), onAcceptOffer: C.acceptOffer(store),
    onDeclineOffer: C.declineOffer(store), onWithdrawOffer: C.withdrawOffer(store), onSendMessage: C.sendDealMessage(store),
    onSelectTrade: C.selectTrade(store), onDeselectTrade: C.deselectTrade(store), onCloseSelection: C.closeSelection(store),
    onHoldSelection: C.holdSelection(store), onReadyForSelection: C.readyForSelection(store), onWithdrawTradeCard: C.withdrawTradeCard(store),
    onProposeMarket: C.proposeMarketValue(store), onAcceptMarket: C.acceptMarketValue(store),
    onProposePercent: C.proposeTradePercent(store), onAcceptPercent: C.acceptTradePercent(store), onDeclineCard: C.declineCard(store),
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
  s.refresh = async () => { await TR.act(async () => { await store.load(); }); await settle(); };
  s.unmount = async () => { await TR.act(async () => { r.unmount(); }); };
  seats.push(s);
  return s;
}

/* ------------------------------------------------------------- READING */
const textOf = (node) => {
  if (typeof node === "string") return node;
  if (!node || !node.children || node.type === "style") return "";
  return node.children.map(textOf).join(" ");
};
const flat = (node) => textOf(node).replace(/\s+/g, " ").trim();
const buttons = (root) => (root ? root.findAll((n) => n.type === "button") : []);
const label = (b) => flat(b);
const button = (root, t) => buttons(root).find((b) => label(b) === t || label(b).startsWith(t)) || null;
const press = async (root, t) => {
  const b = button(root, t);
  assert(b, `no "${t}" among: ${buttons(root).map(label).join(" | ")}`);
  assert(!b.props.disabled, `"${t}" is disabled`);
  await TR.act(async () => { await b.props.onClick(); }); await settle();
};
const go = async (s, nav) => {
  const b = buttons(s.root()).find((n) => label(n).startsWith(nav));
  assert(b, `no "${nav}" in the navigation`);
  await TR.act(async () => { b.props.onClick(); }); await settle();
};
const typeInto = async (root, value, kind = "input") => {
  const field = root.findAll((n) => n.type === kind)[0];
  assert(field, `no ${kind}`);
  await TR.act(async () => { field.props.onChange({ target: { value } }); }); await settle();
};
const submit = async (root) => {
  const form = root.findAll((n) => n.type === "form")[0];
  assert(form, "no form");
  const b = form.findAll((n) => n.type === "button" && n.props.type === "submit")[0];
  assert(!b.props.disabled, `"${label(b)}" is disabled`);
  await TR.act(async () => { await form.props.onSubmit({ preventDefault() {} }); }); await settle();
};
const submitOf = (root) => root.findAll((n) => n.type === "button" && n.props.type === "submit")[0];
const rowIn = (root, id) => (root ? root.findAll((n) => n.type === "li" && n.props["data-row"] === id)[0] || null : null);
const listIn = (root, aria) => (root ? root.findAll((n) => n.type === "ul" && n.props["aria-label"] === aria)[0] || null : null);
const rowIds = (ul) => (ul ? ul.findAll((n) => n.type === "li" && n.props["data-row"]).map((n) => n.props["data-row"]) : []);
const tagOf = (li) => { const t = li && li.findAll((n) => n.type === "span" && /-sel-tag/.test(String(n.props.className)))[0]; return t ? flat(t) : null; };
const fact = (li, name) => {
  const pair = li.findAll((n) => n.type === "div" && n.children && n.children.some((c) => c && c.type === "dt" && flat(c) === name))[0];
  return pair ? flat(pair.findAll((n) => n.type === "dd")[0]) : null;
};
/* The Collector's Deal Workspace for the deal, opened from Deal Flow. */
const ws = (s) => s.root().findAll((n) => n.type === "div" && n.props.className === "mcs-ws" && n.props["data-opp"] === s.nl)[0] || null;
async function open(s) {
  if (ws(s)) return ws(s);
  if (!s.root().findAll((n) => n.type === "div" && n.props.className === "mcs-dg-deal").length) await go(s, "Deal Flow");
  const card = s.root().findAll((n) => n.type === "div" && n.props.className === "mcs-dg-deal" && n.props["data-opp"] === s.nl)[0];
  assert(card, "no Deal Flow card");
  const cta = card.findAll((n) => n.type === "button" && String(n.props.className || "").includes("mcs-dg-cta"))[0];
  await TR.act(async () => { cta.props.onClick(); }); await settle();
  return ws(s);
}
const theirs = (s) => s.root().findAll((n) => n.type === "section" && n.props["data-value"] === s.nl)[0] || null;  // either seat's Value Trade
const summary = (s) => s.root().findAll((n) => n.type === "section" && n.props["data-summary"] === s.nl)[0] || null;
const casey = async (ctx) => { const s = await seat(ctx, "casey"); await open(s); return s; };
const north = async (ctx) => { const s = await seat(ctx, "north"); await go(s, "Opportunities"); return s; };
const glanceOf = async (ctx) => {
  const s = await seat(ctx, "casey"); await go(s, "Deal Flow");
  const card = s.root().findAll((n) => n.type === "div" && n.props.className === "mcs-dg-deal" && n.props["data-opp"] === ctx.nl)[0];
  const out = flat(card); await s.unmount(); seats.pop(); return out;
};
const summaryItem = (s, row) => rowIn(listIn(summary(s), "Trade-ins"), row);

/* ======================================================================= A */
describe("A. The Collector's Value Trade, state by state", () => {
  test("held, nothing proposed: her move on every card — she opens each market value; Deal Flow says so", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.char, ctx.k.pika]);
    const s = await casey(ctx);
    const v = theirs(s);
    assert(v, "no Value Trade in the Deal Workspace: " + flat(ws(s)).slice(0, 300));
    assert(!s.root().findAll((n) => n.type === "section" && n.props["data-select"] === ctx.nl).length, "Select Trade still drawn");
    assert(/Valuing your trade cards/.test(flat(v)) && /Your move — 2 cards waiting on you\./.test(flat(v)), flat(v));
    eq(json(rowIds(listIn(v, "Cards in this deal"))), json([r1, r2]));
    const li = rowIn(v, r1);
    assert(/Charizard/.test(flat(li)) && /PSA 9 · Cert CERT-AAA/.test(flat(li)), "identity: " + flat(li));
    eq(tagOf(li), "Your move");
    eq([fact(li, "Market value"), fact(li, "Trade %"), fact(li, "Trade credit")].join(" | "),
      "Yours to propose | After the market value is agreed | Not agreed yet");
    eq(json(buttons(li).map(label)), json(["Propose a market value", "Take out of this deal"]));
    assert(!/Decline/.test(flat(v)), "a Collector is offered the shop's decline");
    /* The journey bar draws Value Trade's steps as available now. */
    const segs = ws(s).findAll((n) => n.type === "span" && /mcs-dg-seg/.test(String(n.props.className)));
    eq(json(segs.map((n) => /planned/.test(n.props.className))), json([false, false, false, false, true, true, true, true, true, true]), "steps 1–4 available");
    assert(/Your turn · Value your trade cards/.test(await glanceOf(ctx)), "Deal Flow");
  });
  test("opening a market value: whole dollars, nothing filled in; her other card is still her move", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.char, ctx.k.pika]);
    const s = await casey(ctx);
    await press(rowIn(theirs(s), r1), "Propose a market value");
    let li = rowIn(theirs(s), r1);
    eq(li.findAll((n) => n.type === "input")[0].props.value, "", "the box is filled in");
    for (const bad of ["400.50", "0", "-1", "four hundred"]) {
      await typeInto(li, bad); li = rowIn(theirs(s), r1);
      assert(/Use whole dollars above \$0 — no cents\./.test(flat(li)) && submitOf(li).props.disabled, `${bad}: ${flat(li)}`);
    }
    await typeInto(li, "400"); li = rowIn(theirs(s), r1);
    eq(label(submitOf(li)), "Propose · $400");
    await submit(li);
    eq(json(s.sent.slice(-1)[0]), json({ command: "proposeMarketValue", payload: { oppId: ctx.nl, tradeCardId: r1, amount: 400 } }));
    eq((await ctx.row(r1)).collectorMarket, 400);
    li = rowIn(theirs(s), r1);
    eq(fact(li, "Market value"), "You proposed $400");
    eq(tagOf(li), "Waiting for Northline");
    eq(tagOf(rowIn(theirs(s), r2)), "Your move", "she keeps the turn while she still holds a card");
    assert(/Sent \$400 to Northline\./.test(flat(theirs(s))), flat(theirs(s)));
  });
  test("deal-level turn vs per-card: a card waiting on her says “You're next” while the shop still holds the turn", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.char, ctx.k.pika]);
    await ctx.casey.market(r1, 400); await ctx.casey.market(r2, 150);
    await ctx.north.market(r1, 360);
    const s = await casey(ctx);
    const v = theirs(s);
    /* RESTATED (M3B B4 polish) */ assert(/Waiting for Northline first — 1 card\. You're next on 1 card\./.test(flat(v)), flat(v));
    assert(!/'s move/.test(flat(v)), "a possessive turn sentence");
    eq(tagOf(rowIn(v, r1)), "You're next, after Northline");
    const say = v.findAll((n) => n.type === "p" && /mcs-sel-say/.test(String(n.props.className)))[0];
    assert(!/\bmine\b/.test(say.props.className), "her headline is marked as her move on the shop's turn");
    eq(fact(rowIn(v, r1), "Market value"), "Northline countered $360");
    eq(button(rowIn(v, r1), "Accept"), null, "an Accept on the shop's turn");
    assert(button(rowIn(v, r1), "Take out of this deal"), "taking a card out waits for no turn");
    assert(/Waiting for Northline · Valuing trade cards/.test(await glanceOf(ctx)), "Deal Flow");
  });
  test("answering the shop: accept its market value, counter its %, accept its % — the same facts on both screens", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.char, ctx.k.pika]);
    await ctx.casey.market(r1, 400); await ctx.casey.market(r2, 150);
    await ctx.north.market(r1, 360);
    await ctx.north.acceptMarket(r2); await ctx.north.percent(r2, 0.7);
    const s = await casey(ctx);
    let v = theirs(s);
    assert(/Your move — 2 cards waiting on you\./.test(flat(v)), flat(v));
    eq(fact(rowIn(v, r2), "Trade %"), "Northline proposed 70%");
    await press(rowIn(v, r1), "Accept $360");
    eq((await ctx.row(r1)).agreedMarket, 360, "agreed on the server");
    assert(/Accepted \$360 as this card's market value\./.test(flat(theirs(s))));
    await press(rowIn(theirs(s), r2), "Counter");
    let li = rowIn(theirs(s), r2);
    for (const bad of ["0", "101", "72.5"]) {
      await typeInto(li, bad); li = rowIn(theirs(s), r2);
      assert(/Use a whole percentage from 1 to 100/.test(flat(li)) && submitOf(li).props.disabled, bad);
    }
    await typeInto(li, "80"); li = rowIn(theirs(s), r2);
    assert(/That's \$120 of trade credit on \$150\./.test(flat(li)), flat(li));
    await submit(li);
    eq(s.sent.slice(-1)[0].payload.percent, 0.8, "sent as the stored fraction");
    eq(fact(rowIn(theirs(s), r2), "Trade %"), "You countered 80%");
    /* The shop's turn now (it holds r1's % and r2's answer). It opens r1 at 75% and accepts r2's 80%. */
    await ctx.north.percent(r1, 0.75); await ctx.north.acceptPercent(r2);
    await s.refresh();
    v = theirs(s);
    eq(fact(rowIn(v, r1), "Trade %"), "Northline proposed 75%");
    await press(rowIn(v, r1), "Accept 75%");
    eq((await ctx.deal()).stage, "deal", "every card valued");
    /* Both screens show the same figures. */
    const n = await north(ctx);
    const nv = theirs(n);
    for (const [r, credit] of [[r1, "$270"], [r2, "$120"]]) {
      eq(fact(rowIn(nv, r), "Trade credit"), credit, "the shop's screen");
      eq(fact(rowIn(theirs(s), r), "Trade credit"), credit, "the Collector's screen");
      eq(`$${D.tradeValueOf(await ctx.row(r))}`, credit, "the server");
    }
    /* RESTATED (M3B B4 refinement): one summary on both seats, "You Owe" /
       "You Receive" from where each sits — the shop owes her the $90. */
    assert(/You Owe \$90 You Receive \$0/.test(flat(summary(n))), flat(summary(n)));
    assert(/You Owe \$0 You Receive \$90/.test(flat(summary(s))), flat(summary(s)));
    await ctx.valid();
  });
});

/* ======================================================================= B */
describe("B. Taking a card out while it is being valued", () => {
  test("a confirmation; Keep it in sends nothing; taken out, its hold is released and it stays Trade/Sell; the shop sees it", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.char, ctx.k.pika]);
    await ctx.casey.market(r1, 400);
    const s = await casey(ctx);
    await press(rowIn(theirs(s), r1), "Take out of this deal");
    const box = rowIn(theirs(s), r1);
    assert(/Take Charizard out of this deal\? It stays in your Trade\/Sell cards and its history stays here\. The other cards stay as they are\./.test(flat(box)), flat(box));
    const before = s.posts.length;
    await press(box, "Keep it in");
    eq(s.posts.length, before, "Keep it in sent something");
    await press(rowIn(theirs(s), r1), "Take out of this deal");
    await press(rowIn(theirs(s), r1), "Take it out");
    eq(s.posts.slice(-1)[0], "withdrawTradeCard");
    const row = await ctx.row(r1);
    eq([row.withdrawn, row.withdrawnStage, row.valueThread.length].join(), "true,value-trade,1", "withdrawn, history kept");
    eq(await ctx.status(ctx.k.char), "available", "released");
    eq(await ctx.status(ctx.k.pika), "reserved", "the other card is still held");
    eq((await ctx.load()).collectorCopies.find((c) => c.id === ctx.k.char).offered, true, "still Trade/Sell");
    const v = theirs(s);
    assert(/Taken out of this deal\. It's still in your Trade\/Sell cards\./.test(flat(v)), flat(v));
    const out = rowIn(listIn(v, "Out of this deal"), r1);
    assert(out && tagOf(out) === "You took this out" && /It's out of this deal and still in your Trade\/Sell cards\./.test(flat(out)), flat(out));
    eq(buttons(out).length, 0, "a control on a card taken out");
    eq(json(rowIds(listIn(v, "Cards in this deal"))), json([r2]));
    assert(!rowIn(listIn(summary(s), "Trade-ins"), r1), "a card taken out is still a trade-in on the summary");
    const n = await north(ctx);
    eq(tagOf(rowIn(listIn(theirs(n), "Out of this deal"), r1)), "Taken out by Casey Lin");
  });
  test("taking out the last card: back to choosing cards, and she is told why", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.char]);
    const s = await casey(ctx);
    await press(rowIn(theirs(s), r1), "Take out of this deal");
    assert(/It's the last card, so the deal goes back to choosing cards\./.test(flat(rowIn(theirs(s), r1))));
    await press(rowIn(theirs(s), r1), "Take it out");
    eq((await ctx.deal()).stage, "select-trade");
    eq(theirs(s), null, "Value Trade still drawn");
    assert(s.root().findAll((n) => n.type === "section" && n.props["data-select"] === ctx.nl).length, "no Select Trade");
    assert(/You took out the last card, so this deal is back to choosing cards\./.test(flat(ws(s))), flat(ws(s)).slice(0, 400));
    eq(summary(s), null, "a Deal Summary while cards are being chosen");
  });
});

/* ======================================================================= C */
describe("C. A card the shop declined", () => {
  test("she sees who declined it, the note, what it means, and nothing to press", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.char, ctx.k.pika]);
    await ctx.north.decline(r1, "Too much edge wear");
    const s = await casey(ctx);
    const out = rowIn(listIn(theirs(s), "Out of this deal"), r1);
    assert(out, flat(theirs(s)));
    eq(tagOf(out), "Declined by Northline");
    /* RESTATED (M3B B4 polish) */ assert(/Note from Northline: “Too much edge wear”/.test(flat(out)), flat(out));
    assert(/It's out of this deal and still in your Trade\/Sell cards\. You can ask Northline about it in the conversation below\./.test(flat(out)), flat(out));
    eq(buttons(out).length, 0);
    eq(json(rowIds(listIn(theirs(s), "Cards in this deal"))), json([r2]));
    eq(await ctx.status(ctx.k.char), "available");
  });
});

/* ======================================================================= D */
describe("D. The Deal Summary", () => {
  test("the featured card: picture, name, set and number, exact printing, the shop copy's own grade, the agreed price", async () => {
    const ctx = await world();
    await ctx.toValuation([ctx.k.char]);
    const s = await casey(ctx);
    const sum = summary(s);
    assert(sum && sum.props["aria-label"] === "Deal summary", "no Deal Summary");
    const feat = sum.findAll((n) => n.props && n.props.className === "mcs-sum-feat")[0];
    assert(feat.findAll((n) => n.props && /mcs-sum-art/.test(String(n.props.className))).length, "no picture frame");
    const lines = feat.findAll((n) => n.type === "p").map(flat);
    /* RESTATED (M3B B4 refinement): the printed number with its set total. */
    eq(json(lines), json(["Pikachu", "151 · 173/165", "English · Normal", "PSA 10 · Cert NL-0001", "Agreed price $300"]));
    /* The grade is the shop's copy's, not Casey's Goal criteria or another copy's. */
    eq((await ctx.load()).inventory.find((i) => i.invId === ctx.i1).grade, "PSA 10");
  });
  test("trade-ins: each identifiable, its printing and condition, market × % = credit; not yet valued says so", async () => {
    const ctx = await world();
    const [r1, r2, r3] = await ctx.toValuation([ctx.k.char, ctx.k.pika, ctx.k.mew]);
    /* In turn order: she opens all three; the shop agrees Pikachu's value and
       opens its %, and counters the other two; she accepts Pikachu's %. */
    await ctx.casey.market(r1, 400); await ctx.casey.market(r2, 200); await ctx.casey.market(r3, 300);
    await ctx.north.acceptMarket(r2); await ctx.north.percent(r2, 0.8);
    await ctx.north.market(r1, 380); await ctx.north.market(r3, 280);
    await ctx.casey.acceptPercent(r2);
    const s = await casey(ctx);
    const item = (r) => flat(summaryItem(s, r));
    eq(item(r2), "Pikachu · 151 · 173/165 English · Normal · Near Mint · Ungraded $200 × 80% = −$160");
    eq(item(r1), "Charizard · Base Set · 4/102 English · Holo · First Edition · PSA 9 · Cert CERT-AAA Market value not agreed yet Not valued yet");
    assert(/^Mew · 151 · 151\/165 Japanese · Holo · PSA 8 /.test(item(r3)), item(r3));
    /* RESTATED (M3B B4 polish): a positive subtotal; while valuing, "Current amounts" and the note come before the figures. */
    const total = flat(summary(s).findAll((n) => n.props && n.props["aria-label"] === "Who owes whom")[0]);
    eq(total, "Agreed trade-in value $160 Current amounts These amounts may change until all trade-in values are agreed. You Owe $140 You Receive $0");
    eq(D.calculatedBalance(await ctx.deal()), 140, "the domain's own balance");
  });
  test("a market value agreed but no % yet is still not valued; the total counts only full agreements", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.char]);
    await ctx.casey.market(r1, 400); await ctx.north.acceptMarket(r1);
    const s = await casey(ctx);
    assert(/\$400 agreed · % not agreed yet Not valued yet/.test(flat(summaryItem(s, r1))), flat(summaryItem(s, r1)));
    assert(/Agreed trade-in value \$0 Current amounts These amounts may change until all trade-in values are agreed\. You Owe \$300 You Receive \$0$/.test(flat(summary(s))), flat(summary(s)));
  });
  test("trade-ins worth more than the card: the shop pays her, said in words — never a bare negative", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.char]);
    await ctx.settle(r1, 500, 0.9);
    const s = await casey(ctx);
    const total = flat(summary(s).findAll((n) => n.props && n.props["aria-label"] === "Who owes whom")[0]);
    eq(total, "Agreed trade-in value $450 You Owe $0 You Receive $150");
    assert(!/-\$|−\$150/.test(total), "a negative balance shown");
    eq(D.calculatedBalance(await ctx.deal()), -150);
  });
  test("exactly even: nothing left to pay", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.char]);
    await ctx.settle(r1, 375, 0.8);
    const s = await casey(ctx);
    assert(/Agreed trade-in value \$300 You Owe \$0 You Receive \$0$/.test(flat(summary(s))), flat(summary(s)));
  });
  test("missing facts are left out, never invented — the real projection's shapes", async () => {
    const r = (el) => { let t; TR.act(() => { t = TR.create(el); }); return t; };
    const deal = { id: "o", agreedPrice: 300, trade: { cards: [
      { id: "t1", binderId: "b1", canonicalCardId: "cc1", inclusion: "accepted", agreedMarket: null, agreedPercent: null },
      { id: "t2", binderId: "gone", canonicalCardId: "cc-unknown", inclusion: "accepted", grade: "Raw", condition: "Lightly Played", agreedMarket: 101, agreedPercent: 0.33 }] } };
    const copies = new Map([["b1", { id: "b1", grade: "", condition: "", grading: { state: "unstated", label: null, problem: null } }]]);
    const t = r(h(SUM.DealSummary, { cls: "mcs", deal, seat: "collector", featured: { card: null, copy: null },
      named: { cc1: { cardName: "Eevee" } }, copies }));
    const text = flat(t.root);
    for (const bad of ["undefined", "null", "NaN", "#undefined"]) assert(!text.includes(bad), `${bad}: ${text}`);
    assert(/A card MetYet is still describing Agreed price \$300/.test(text), "featured with nothing described: " + text);
    assert(/Eevee Condition not stated Market value not agreed yet Not valued yet/.test(text), "no set, number or condition: " + text);
    /* A copy no longer in view: the deal row's own snapshot. 101 × 33% = 33.33, rounded as the domain rounds. */
    assert(/A card MetYet is still describing Lightly Played · Ungraded \$101 × 33% = −\$33/.test(text), text);
    eq(D.tradeValueOf(deal.trade.cards[1]), 33);
    /* A record that contradicts itself shows both halves. */
    eq(SUM.conditionLine({ grade: "PSA 9", condition: "Damaged", grading: { state: "graded", label: "PSA 9", problem: "graded-has-condition" } }), "Says PSA 9 and Damaged");
    eq(SUM.conditionLine({ grade: "Raw", condition: "Near Mint", grading: { state: "raw", label: "Raw · Near Mint", problem: null } }), "Near Mint · Ungraded");
    eq(SUM.conditionLine({ grade: "BGS 9.5", cert: "X1", grading: { state: "graded", label: "BGS 9.5", problem: null } }), "BGS 9.5 · Cert X1");
    eq(SUM.printingFacts({ language: "xx", finish: "reverse_holofoil", printRun: "unlimited", stamp: "pokemon_center" }), "XX · Reverse Holo · Unlimited · Pokemon Center stamp");
  });
  test("the shop's screen and the Collector's summary state the same bottom line", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.char, ctx.k.pika]);
    await ctx.casey.market(r1, 200); await ctx.casey.market(r2, 150);
    await ctx.north.acceptMarket(r1); await ctx.north.percent(r1, 0.5); await ctx.north.market(r2, 140);
    await ctx.casey.acceptPercent(r1);
    const s = await casey(ctx);
    const n = await north(ctx);
    /* RESTATED (M3B B4 refinement): the shop renders the same summary. */
    assert(/You Owe \$200 You Receive \$0/.test(flat(summary(s))), flat(summary(s)));
    assert(/You Owe \$0 You Receive \$200/.test(flat(summary(n))), flat(summary(n)));
    for (const x of [s, n]) {
      assert(/Valuing trade-ins · 1 of 2 agreed/.test(flat(summary(x))) && /Current amounts These amounts may change until all trade-in values are agreed\./.test(flat(summary(x))), "both say the amounts may change");
    }
    assert(rowIn(listIn(summary(s), "Trade-ins"), r2), "the unvalued card is listed");
  });
});

/* ======================================================================= E */
describe("E. Moving between stages", () => {
  test("every card agreed: Deal is next, shown read-only — no Deal control and no way to take a card out", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.char]);
    await ctx.casey.market(r1, 400); await ctx.north.acceptMarket(r1); await ctx.north.percent(r1, 0.8);
    const s = await casey(ctx);
    await press(rowIn(theirs(s), r1), "Accept 80%");
    eq((await ctx.deal()).stage, "deal");
    const v = theirs(s);
    assert(/Trade values agreed/.test(flat(v)) && /Every card's value is agreed\. Next comes Deal, which isn't available in MetYet yet\./.test(flat(v)), flat(v));
    assert(/Agreed 80% — \$320 trade credit\./.test(flat(v)), flat(v));
    eq(buttons(v).length, 0, "a control in Deal: " + buttons(v).map(label).join("|"));
    assert(/Every trade-in value is agreed/.test(flat(summary(s))) && !/Current amounts|may change/.test(flat(summary(s))), flat(summary(s)));
    assert(!/doesn't complete the deal/.test(flat(ws(s))), "the price area repeats what comes next");
    const glance = await glanceOf(ctx);
    assert(/Trade values agreed/.test(glance) && /Deal not yet available/.test(glance), glance);
    const d = await ctx.deal();
    eq([d.deal.tpAgreed, d.deal.collectorAgreed].join(), "false,false");
  });
  test("the shop declines the last card: her screen follows back to choosing cards", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.char]);
    const s = await casey(ctx);
    await ctx.north.decline(r1);
    await tick();
    eq(theirs(s), null, "Value Trade still drawn");
    assert(s.root().findAll((n) => n.type === "section" && n.props["data-select"] === ctx.nl).length, "no Select Trade");
  });
});

/* ======================================================================= F */
describe("F. Stale screens, lost answers, double presses and refusals", () => {
  test("a stale screen: the shop declined the card meanwhile; the refusal says so and the screen catches up", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.char, ctx.k.pika]);
    await ctx.casey.market(r1, 400); await ctx.casey.market(r2, 150); await ctx.north.market(r1, 360);
    await ctx.north.acceptMarket(r2); await ctx.north.percent(r2, 0.7);
    const s = await casey(ctx);
    await ctx.north.decline(r1);
    await press(rowIn(theirs(s), r1), "Accept $360");
    assert(/That card isn't in this deal any more\. The latest is shown\./.test(flat(theirs(s))), flat(theirs(s)));
    eq(tagOf(rowIn(listIn(theirs(s), "Out of this deal"), r1)), "Declined by Northline");
    eq((await ctx.row(r1)).agreedMarket, null);
  });
  test("an answer lost after the server acted: nothing claimed, the re-read shows the truth, sent once", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.char]);
    const s = await casey(ctx);
    s.lose = "proposeMarketValue";
    await press(rowIn(theirs(s), r1), "Propose a market value");
    await typeInto(rowIn(theirs(s), r1), "400"); await submit(rowIn(theirs(s), r1));
    assert(/MetYet couldn't confirm that just now/.test(flat(theirs(s))) && !/Sent \$400/.test(flat(theirs(s))), flat(theirs(s)));
    eq(fact(rowIn(theirs(s), r1), "Market value"), "You proposed $400");
    eq(s.posts.filter((c) => c === "proposeMarketValue").length, 1);
  });
  test("two presses in the same instant send one command", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.char]);
    await ctx.casey.market(r1, 400); await ctx.north.market(r1, 360);
    const s = await casey(ctx);
    const b = button(rowIn(theirs(s), r1), "Accept $360");
    await TR.act(async () => { await Promise.all([b.props.onClick(), b.props.onClick()]); }); await settle();
    eq(s.posts.filter((c) => c === "acceptMarketValue").length, 1);
  });
  test("a check that finds the deal changed closes her open box and says so", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.char, ctx.k.pika]);
    const s = await casey(ctx);
    await press(rowIn(theirs(s), r1), "Propose a market value");
    await ctx.north.decline(r2);
    await tick();
    const v = theirs(s);
    assert(!v.findAll((n) => n.type === "form").length, "the box stayed open on a changed deal");
    assert(/This deal changed while you were answering — check the card and try again\./.test(flat(v)), flat(v));
  });
  test("the Collector cannot do the shop's part, through the production door", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.char]);
    const p = (x) => ({ oppId: ctx.nl, tradeCardId: r1, ...x });
    eq((await ctx.post("casey", "declineTradeCard", p({}))).body.error.refused, "not-owner");
    await ctx.casey.market(r1, 400); await ctx.north.acceptMarket(r1);
    eq((await ctx.post("casey", "proposeTradePercent", p({ percent: 0.9 }))).body.error.refused, "not-your-turn", "the shop opens the %");
    eq((await ctx.post("casey", "acceptDeal", { oppId: ctx.nl })).body.error.refused, "command-unavailable");
  });
});

describe("F2. Refusals outside the stale list, a paused check, and the shop's counter", () => {
  test("the relationship ended: her accept is refused, the screen asks the server again, and says why", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.char]);
    await ctx.casey.market(r1, 400); await ctx.north.market(r1, 360);
    const s = await casey(ctx);
    const w = await ctx.load();
    await ctx.repository.saveWorld({ ...w, relationships: w.relationships.map((r) => ({ ...r, status: "ended" })) });
    const views = s.views;
    await press(rowIn(theirs(s), r1), "Accept $360");
    assert(s.views > views, "no re-read after the refusal");
    assert(/You're no longer connected with Northline, so cards can't be valued in this deal\./.test(flat(s.root())), flat(s.root()).slice(0, 400));
    eq((await ctx.row(r1)).agreedMarket, null);
  });
  test("a failed check pauses every one of her controls", async () => {
    const ctx = await world();
    await ctx.toValuation([ctx.k.char, ctx.k.pika]);
    const s = await casey(ctx);
    s.failViews = true;
    await tick();
    assert(/Your moves are paused/.test(flat(ws(s))), "no pause said");
    const bs = buttons(theirs(s));
    assert(bs.length && bs.every((b) => b.props.disabled), "a live control while paused: " + bs.filter((b) => !b.props.disabled).map(label).join("|"));
    s.failViews = false;
  });
  test("the shop counters her %: said as a counter, not an opening", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.char]);
    await ctx.casey.market(r1, 400); await ctx.north.acceptMarket(r1);
    await ctx.north.percent(r1, 0.7); await ctx.casey.percent(r1, 0.85); await ctx.north.percent(r1, 0.8);
    const s = await casey(ctx);
    eq(fact(rowIn(theirs(s), r1), "Trade %"), "Northline countered 80%");
    eq(json(rowIn(theirs(s), r1).findAll((n) => n.type === "ol")[0].findAll((n) => n.type === "li").map(flat)), json([
      "You proposed $400 market value", "Northline accepted $400 market value",
      "Northline proposed 70% trade credit", "You countered 85% trade credit", "Northline countered 80% trade credit"]), "history");
  });
});

/* ======================================================================= G */
describe("G. Nothing else changes", () => {
  test("a journey on her screen writes no copy, shelf or Goal fact; the door is unchanged", async () => {
    const ctx = await world();
    const snap = (w) => json({ copies: w.collectorCopies.map((c) => [c.id, c.offered, c.keeping, c.grade, c.cert]).sort(),
      inventory: w.inventory.map((i) => [i.invId, i.ask, i.grade, i.archived || false]).sort(), goals: w.goals.map((g) => [g.id, g.tier]).sort() });
    const [r1, r2] = await ctx.toValuation([ctx.k.char, ctx.k.pika]);
    const before = snap(await ctx.load());
    const s = await casey(ctx);
    await press(rowIn(theirs(s), r1), "Propose a market value");
    await typeInto(rowIn(theirs(s), r1), "400"); await submit(rowIn(theirs(s), r1));
    await press(rowIn(theirs(s), r2), "Take out of this deal"); await press(rowIn(theirs(s), r2), "Take it out");
    eq(snap(await ctx.load()), before);
    eq(json(s.posts), json(["proposeMarketValue", "withdrawTradeCard"]));
    eq(EXPOSED_COMMANDS.length, 42, "B4 opened nothing");
    await ctx.valid();
  });
});

/* ======================================================================= I */
/* M3B B4 REFINEMENT — ONE DEAL, ONE SHARED TRUTH, TWO PERSPECTIVES. The same
   Deal Summary on both seats; the printed card number with its set total; the
   catalogue's picture (a copy's photo references are never one); "You Owe" /
   "You Receive" from where each participant sits. */
const totalBlock = (sum) => (sum ? sum.findAll((n) => n.type === "div" && n.props["aria-label"] === "Who owes whom")[0] || null : null);
const payOf = (sum) => {
  const t = flat(totalBlock(sum));
  const m = /You Owe (\S+) You Receive (\S+)/.exec(t);
  return m ? { owe: m[1], receive: m[2] } : null;
};
/* Everything the summary says apart from the two amounts. */
const factsOf = (sum) => flat(sum).replace(/You Owe \S+ You Receive \S+/, "<pay>");
describe("I. One Deal Summary, shared by both participants (B4 refinement)", () => {
  test("the printed number: 173/165 with the set total, the bare number without one — never a made-up denominator", async () => {
    eq(SUM.cardNumber({ collectorNumber: "173", expansionPrintedTotal: 165 }), "173/165");
    eq(SUM.cardNumber({ collectorNumber: "4", expansionPrintedTotal: 102 }), "4/102");
    for (const t of [null, undefined, 0, -3, 16.5, "165"]) eq(SUM.cardNumber({ collectorNumber: "173", expansionPrintedTotal: t }), "#173", String(t));
    eq(SUM.cardNumber({ collectorNumber: "TG05", expansionPrintedTotal: 30 }), "#TG05", "a number that is not plain digits keeps its own form");
    eq(SUM.cardNumber({ collectorNumber: "", expansionPrintedTotal: 165 }), null);
    eq(SUM.setLine({ expansionName: "151", collectorNumber: "173", expansionPrintedTotal: 165 }), "151 · 173/165");
    /* The real description, over the real route: the total where the catalogue holds one, null where it does not. */
    const ctx = await world();
    const res = await ctx.app.inject({ method: "GET", url: `/api/canonical-cards?ids=${ctx.cards.pika},${ctx.cards.promo}`, headers: { authorization: "Bearer casey" } });
    eq(res.statusCode, 200);
    const by = Object.fromEntries(res.json().cards.map((c) => [c.cardName, c]));
    eq(by.Pikachu.expansionPrintedTotal, 165);
    eq(by.Eevee.expansionPrintedTotal, null, "no total is held for the promo release");
    eq(SUM.setLine(by.Pikachu), "151 · 173/165");
    eq(SUM.setLine(by.Eevee), "Black Star Promos · #050");
    eq(SUM.printingFacts(by.Eevee), "English · Holo · Prerelease stamp");
  });
  test("both seats render the same summary: identical cards, figures and status — only the two amounts mirror", async () => {
    const ctx = await world();
    const [r1, r2, r3] = await ctx.toValuation([ctx.k.char, ctx.k.pika, ctx.k.mew]);
    await ctx.casey.market(r1, 400); await ctx.casey.market(r2, 200); await ctx.casey.market(r3, 300);
    await ctx.north.acceptMarket(r2); await ctx.north.percent(r2, 0.8);
    await ctx.north.market(r1, 380); await ctx.north.market(r3, 280);
    await ctx.casey.acceptPercent(r2);
    const s = await casey(ctx);
    const n = await north(ctx);
    const mine = summary(s); const shop = summary(n);
    assert(mine && shop, "a seat without the Deal Summary");
    eq(mine.props.className, "mcs-sum"); eq(shop.props.className, "tps-sum");
    eq(factsOf(shop), factsOf(mine), "the two seats' summaries differ");
    /* A graded trade-in, with its grading company, grade and certificate — on both seats. */
    for (const x of [s, n]) {
      eq(flat(summaryItem(x, r1)), "Charizard · Base Set · 4/102 English · Holo · First Edition · PSA 9 · Cert CERT-AAA Market value not agreed yet Not valued yet");
      assert(/^Mew · 151 · 151\/165 Japanese · Holo · PSA 8 /.test(flat(summaryItem(x, r3))), flat(summaryItem(x, r3)));
      eq(flat(summaryItem(x, r2)), "Pikachu · 151 · 173/165 English · Normal · Near Mint · Ungraded $200 × 80% = −$160");
    }
    for (const x of [mine, shop]) eq(listIn(x, "Trade-ins").findAll((y) => y.type === "img").length, 0, "a trade-in with a picture");
    eq(json(payOf(mine)), json({ owe: "$140", receive: "$0" }));
    eq(json(payOf(shop)), json({ owe: "$0", receive: "$140" }));
    eq(D.calculatedBalance(await ctx.deal()), 140);
    /* The shop keeps every control it had; the summary adds none to either seat. */
    eq(buttons(mine).length + buttons(shop).length, 0, "a control in the summary");
    assert(button(theirs(n), "Decline this card"), "the shop lost Decline");
    assert(button(theirs(s), "Take out of this deal"), "the Collector lost Take out");
  });
  const scenario = async (ask, m, p) => {
    const ctx = await world({ ask });
    const [r1] = await ctx.toValuation([ctx.k.char]);
    await ctx.settle(r1, m, p);
    const s = await casey(ctx); const n = await north(ctx);
    eq(factsOf(summary(n)), factsOf(summary(s)), "the two seats' summaries differ");
    return { ctx, collector: payOf(summary(s)), tp: payOf(summary(n)), text: flat(totalBlock(summary(s))), balance: D.calculatedBalance(await ctx.deal()) };
  };
  test("Scenario A — the Collector owes the shop: $650 card, $265 of trade-ins", async () => {
    const x = await scenario(650, 530, 0.5);
    eq(x.balance, 385, "the domain's balance");
    eq(json(x.collector), json({ owe: "$385", receive: "$0" }));
    eq(json(x.tp), json({ owe: "$0", receive: "$385" }));
    eq(x.text, "Agreed trade-in value $265 You Owe $385 You Receive $0");
  });
  test("Scenario B — the shop owes the Collector: $300 card, $450 of trade-ins; never a negative", async () => {
    const x = await scenario(300, 500, 0.9);
    eq(x.balance, -150, "the domain's balance");
    eq(json(x.collector), json({ owe: "$0", receive: "$150" }));
    eq(json(x.tp), json({ owe: "$150", receive: "$0" }));
    assert(!/-\$150|−\$150/.test(x.text), x.text);
  });
  test("Scenario C — an even trade: $300 card, $300 of trade-ins", async () => {
    const x = await scenario(300, 375, 0.8);
    eq(x.balance, 0);
    eq(json(x.collector), json({ owe: "$0", receive: "$0" }));
    eq(json(x.tp), json({ owe: "$0", receive: "$0" }));
  });
  test("You Owe / You Receive: never negative, never both above $0, mirror images across seats — the domain's own balance", () => {
    let x = 11; const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
    for (let i = 0; i < 400; i += 1) {
      const cards = Array.from({ length: Math.floor(rnd() * 4) }, (_, j) => ({ id: `t${j}`, inclusion: "accepted",
        agreedMarket: rnd() < 0.8 ? 1 + Math.floor(rnd() * 900) : null, agreedPercent: rnd() < 0.8 ? (1 + Math.floor(rnd() * 100)) / 100 : null }));
      const deal = { agreedPrice: rnd() < 0.95 ? 1 + Math.floor(rnd() * 1200) : null, trade: { cards } };
      const pic = VTX.cashPicture(deal);
      const c = SUM.payments(pic, "collector"); const t = SUM.payments(pic, "tp");
      const bal = D.calculatedBalance(deal);
      if (deal.agreedPrice == null) { eq(json([c, t]), json([{ owe: null, receive: null }, { owe: null, receive: null }])); continue; }
      eq(c.owe - c.receive, bal, json(deal)); eq(t.receive - t.owe, bal, json(deal));
      eq(json([c.owe, c.receive]), json([t.receive, t.owe]), "the seats do not mirror");
      for (const v of [c.owe, c.receive, t.owe, t.receive]) assert(v >= 0, `negative: ${json(deal)}`);
      assert(!(c.owe > 0 && c.receive > 0), "both above $0");
    }
    eq(json(SUM.payments(VTX.cashPicture({ agreedPrice: 100, trade: { cards: [] } }), "someone")), json({ owe: null, receive: null }), "a seat that is not the deal's");
  });
  test("incomplete: no trade-in agreed yet — the full price, and the amounts may change; agreed — the warning goes", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.char]);
    const s = await casey(ctx); const n = await north(ctx);
    for (const x of [s, n]) {
      assert(/Valuing trade-ins · 0 of 1 agreed/.test(flat(summary(x))), flat(summary(x)));
      assert(/Current amounts These amounts may change until all trade-in values are agreed\. You Owe/.test(flat(totalBlock(summary(x)))), flat(summary(x)));
      eq(totalBlock(summary(x)).props.className.split(" ").includes("pending"), true, "the current amounts are not drawn quieter");
    }
    eq(json(payOf(summary(s))), json({ owe: "$300", receive: "$0" }));
    eq(json(payOf(summary(n))), json({ owe: "$0", receive: "$300" }));
    for (const word of ["Provisional", "settlement", "liability", "consideration", "paid", "Remaining to Pay"]) {
      assert(!new RegExp(word, "i").test(flat(summary(s)) + flat(summary(n))), `"${word}" in the summary`);
    }
    await ctx.settle(r1, 400, 0.8);
    await s.refresh(); await n.refresh();
    for (const x of [s, n]) {
      assert(!/Current amounts|may change/.test(flat(summary(x))) && /Every trade-in value is agreed/.test(flat(summary(x))), flat(summary(x)));
      eq(totalBlock(summary(x)).props.className.split(" ").includes("pending"), false, "agreed amounts still drawn as current");
    }
  });
  test("the picture: the catalogue's artwork, captioned — a copy's photo reference is never shown; the plate when there is none", () => {
    const r = (el) => { let t; TR.act(() => { t = TR.create(el); }); return t; };
    const deal = { id: "o", agreedPrice: 300, trade: { cards: [] } };
    const copy = { grade: "PSA 10", cert: "NL-1", photos: { front: "inv:i1:front", back: "inv:i1:back" }, grading: { state: "graded", label: "PSA 10", problem: null } };
    const card = { cardName: "Pikachu", imageSmall: "https://images.example.invalid/pika.png", imageLarge: "https://images.example.invalid/pika-l.png" };
    let t = r(h(SUM.DealSummary, { cls: "mcs", deal, seat: "collector", featured: { card, copy } }));
    const srcs = t.root.findAll((n) => n.type === "img").map((n) => n.props.src);
    eq(json(srcs), json([card.imageSmall]), "the featured picture");
    assert(/Catalogue image/.test(flat(t.root)), "the picture is not said to be the catalogue's");
    assert(!/inv:i1/.test(JSON.stringify(t.toJSON())), "a photo reference reached the page");
    eq(json(SUM.featuredImage(card)), json({ src: card.imageSmall, source: "catalogue" }));
    eq(json(SUM.featuredImage({ cardName: "X", imageLarge: "https://images.example.invalid/x.png" })), json({ src: "https://images.example.invalid/x.png", source: "catalogue" }));
    t = r(h(SUM.DealSummary, { cls: "mcs", deal, seat: "collector", featured: { card: { cardName: "Pikachu" }, copy } }));
    eq(t.root.findAll((n) => n.type === "img").length, 0, "an image with nothing to show");
    assert(!/Catalogue image/.test(flat(t.root)), "a caption on the plate");
    assert(t.root.findAll((n) => n.props && /mcs-sum-art/.test(String(n.props.className))).length, "no picture frame");
    assert(!/photos/.test(code("client/deal-summary.jsx")), "the summary reads a copy's photos");
  });
  test("no private field crosses: the shop's cost and the Collector's own reference value appear on neither summary", async () => {
    const ctx = await world({ cost: 123, market: 987 });
    const [r1] = await ctx.toValuation([ctx.k.char]);
    await ctx.casey.market(r1, 400);
    const s = await casey(ctx); const n = await north(ctx);
    const w = await ctx.load();
    eq(w.inventory.find((i) => i.invId === ctx.i1).cost, 123, "the shop's cost is stored");
    eq(w.collectorCopies.find((b) => b.id === ctx.k.char).market, 987, "her reference value is stored");
    for (const x of [s, n]) {
      const t = flat(summary(x));
      assert(!/\$123|\b123\b/.test(t) && !/\$987|\b987\b/.test(t), t);
    }
    /* And neither seat's projection hands the other its private field. */
    eq(s.store.get().inventory.find((i) => i.invId === ctx.i1).cost, undefined, "the shop's cost reached the Collector");
    eq(n.store.get().collectorCopies.find((b) => b.id === ctx.k.char).market, undefined, "her reference value reached the shop");
  });
  test("the header says where the deal is now — Value Trade is the current step, not a later one", async () => {
    const ctx = await world();
    await ctx.toValuation([ctx.k.char]);
    const s = await casey(ctx);
    const bar = ws(s).findAll((n) => n.props && n.props.role === "progressbar")[0];
    eq(bar.props["aria-valuetext"], "Select Trade complete. Now: Steps 3–4 of 10 · Trade Market Validation, Trade %");
    const said = ws(s).findAll((n) => n.props && n.props.role === "progressbar").map((b) => `${b.props["aria-label"]} ${b.props["aria-valuetext"]}`).join(" ");
    assert(!/Next: Steps 3–4/.test(said + flat(ws(s))), "Value Trade still said to be next");
    /* And on Deal Flow, where the deal's card carries the same bar. */
    const d = await seat(ctx, "casey"); await go(d, "Deal Flow");
    const bars = d.root().findAll((n) => n.props && n.props.role === "progressbar").map((x) => x.props["aria-valuetext"]);
    assert(bars.length && bars.every((t) => t === "Select Trade complete. Now: Steps 3–4 of 10 · Trade Market Validation, Trade %"), json(bars));
  });
  test("one look on both seats: both shells place the shared stylesheet; the bottom line is named and announced", async () => {
    assert(/\$\{summaryCss\("mcs"\)\}/.test(read("client/collector/CollectorShell.jsx")), "the Collector's shell");
    /* RESTATED (M3B B4 polish): at phone width the shop's summary drops the record's extra inset, so both seats give it the same width. */
    assert(/\$\{summaryCss\("tps", \{ margin: "0 16px 15px", phoneMargin: "0 -10px 12px" \}\)\}/.test(read("client/tp/TrustedPartnerShell.jsx")), "the shop's shell");
    assert(!/\.mcs-sum-[a-z]+ \{/.test(read("client/collector/CollectorShell.jsx")) && !/\.tps-vt-sum/.test(read("client/tp/TrustedPartnerShell.jsx")), "a second summary stylesheet");
    eq(SUM.summaryCss("tps").replace(/tps/g, "mcs"), SUM.summaryCss("mcs"), "the two seats' summaries are styled differently");
    assert(/-pay span \{ font-size:14px/.test(SUM.summaryCss("mcs")), "the two amounts' labels");
    const ctx = await world();
    await ctx.toValuation([ctx.k.char]);
    const n = await north(ctx);
    const tb = totalBlock(summary(n));
    assert(tb && tb.props.role === "status", "the shop's bottom line is not announced");
    eq(json(tb.findAll((x) => x.type === "p" && x.props["data-pay"]).map((x) => x.props["data-pay"])), json(["owe", "receive"]));
    eq(summary(n).findAll((x) => x.type === "h2" && flat(x) === "Deal summary").length, 1, "the shop's summary has a heading");
  });
});

/* ======================================================================= H */
/* ======================================================================= J */
/* M3B B4 POLISH — the same card said one way on every deal surface; turn
   sentences without awkward possessives; the summary's layout on both seats. */
const PR = load("client/printing.js");
const VTW = VTX;
describe("J. One wording for one card, and the summary's layout (B4 polish)", () => {
  test("the shared formatter: full number, the #-fallback, raw said once — used by rows, headers and the summary alike", () => {
    eq(PR.printingLine({ expansionName: "Fossil", collectorNumber: "5", expansionPrintedTotal: 62, finish: "holofoil" }), "Fossil · 5/62 · Holo");
    eq(PR.printingLine({ expansionName: "Black Star Promos", collectorNumber: "4", expansionPrintedTotal: null, finish: "holofoil" }), "Black Star Promos · #4 · Holo");
    eq(PR.rawLine("Moderately Played"), "Moderately Played · Ungraded");
    eq(PR.rawLine(""), "Ungraded");
    eq(PR.dealGradeLine({ grading: { state: "raw", condition: "Near Mint", label: "Raw · Near Mint" } }), "Near Mint · Ungraded");
    eq(PR.dealGradeLine({ grading: { state: "graded", label: "PSA 9" } }), "PSA 9");
    eq(PR.dealGradeLine({}), null);
    const sumSrc = code("client/deal-summary.jsx");
    assert(/import \{ cardNumber, conditionLine \} from "\.\/printing\.js"/.test(sumSrc)
      && !/const cardNumber|function conditionLine|const totalOf/.test(sumSrc), "the summary has a number or condition wording of its own");
    assert(/import \{ printingLine, rawLine \} from "\.\/printing\.js"/.test(code("client/select-trade.jsx")), "the rows' wording");
    for (const f of ["client/select-trade.jsx", "client/collector/DealWorkspace.jsx", "client/tp/sections/Opportunities.jsx"]) {
      assert(!/`Raw · \$\{/.test(code(f)), `${f} still words a raw copy "Raw · …"`);
    }
  });
  test("on both seats, the Value Trade rows, header and record name a card as the summary does", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.char, ctx.k.pika]);
    const s = await casey(ctx); const n = await north(ctx);
    for (const x of [s, n]) {
      const rows = flat(theirs(x));
      assert(/Base Set · 4\/102 · Holo · First Edition/.test(flat(rowIn(theirs(x), r1))), flat(rowIn(theirs(x), r1)));
      assert(/151 · 173\/165 · Normal/.test(flat(rowIn(theirs(x), r2))) && /Near Mint · Ungraded/.test(flat(rowIn(theirs(x), r2))), flat(rowIn(theirs(x), r2)));
      assert(!/Raw · /.test(rows) && !/#4\b|#173\b/.test(rows), rows);
    }
    assert(/Pikachu.*151 · 173\/165/.test(flat(ws(s).findAll((n2) => n2.type === "header")[0])), "the workspace header");
    assert(!/Raw · /.test(flat(s.root())) && !/Raw · /.test(flat(n.root())), "a raw copy said two ways on a deal screen");
  });
  test("a raw featured card reads one way across the whole deal, on both seats", async () => {
    const ctx = await world({ rawFeatured: true });
    await ctx.toValuation([ctx.k.char]);
    const s = await casey(ctx); const n = await north(ctx);
    const terms = flat(ws(s).findAll((x) => x.props && x.props.className === "mcs-ws-terms")[0]);
    assert(/^Near Mint · Ungraded · /.test(terms), "the Collector's price area: " + terms);
    for (const x of [s, n]) {
      assert(/Near Mint · Ungraded/.test(flat(summary(x))), flat(summary(x)));
      assert(!/Raw · /.test(flat(x.root())), "a raw copy said two ways: " + flat(x.root()).slice(0, 400));
    }
  });
  test("turn and refusal sentences never build a possessive from a name", () => {
    for (const other of ["Northline Cards", "Casey Lin"]) {
      for (const seat of ["collector", "tp"]) {
        const said = VTW.valueRefusal(seat, other)("not-your-turn");
        assert(!/'s move|s's/.test(said) && said.includes(other), said);
      }
      eq(VTW.leftNote({ kind: "declined" }, { declineNote: "Edge wear" }, "collector", other).note, `Note from ${other}: “Edge wear”`);
    }
    for (const f of ["client/collector/value-trade-area.jsx", "client/tp/sections/Opportunities.jsx", "client/value-trade.jsx"]) {
      assert(!/\$\{(who|other|them)\}'s (move|note)/.test(read(f)), `${f}: a possessive turn or note sentence`);
    }
  });
  test("the layout: the shop's summary loses the record's extra inset on a phone; centred at receipt width on a wide screen", () => {
    const tps = SUM.summaryCss("tps", { margin: "0 16px 15px", phoneMargin: "0 -10px 12px" });
    assert(tps.includes("@media (max-width:520px) { .tps-sum { margin:0 -10px 12px; } }"), "the phone inset");
    assert(!SUM.summaryCss("mcs").includes("@media (max-width:520px) { .mcs-sum"), "the Collector's needs no phone inset");
    for (const css of [tps, SUM.summaryCss("mcs")]) {
      assert(/@media \(min-width:700px\) \{ \.(tps|mcs)-sum \{ margin-left:auto; margin-right:auto; width:100%; \} \}/.test(css), "centred on a wide screen");
      assert(/-sum \{ margin:[^;]+; max-width:560px;/.test(css), "receipt width");
      assert(/-total\.pending \{ background:var\(--amber-bg\)/.test(css) && /-total\.pending [^{]+-pay strong, [^{]+\{ font-size:17px/.test(css), "the quieter current amounts");
    }
  });
});

describe("H. Wiring, layout and accessibility", () => {
  test("the Collector's screen is handed four Value Trade bindings and never the shop's decline", () => {
    const shell = code("client/collector/CollectorShell.jsx");
    for (const b of ["onProposeMarket", "onAcceptMarket", "onProposePercent", "onAcceptPercent"]) assert(new RegExp(`${b}=\\{${b}\\}`).test(shell), b);
    for (const f of ["client/collector/CollectorShell.jsx", "client/collector/DealWorkspace.jsx", "client/collector/value-trade-area.jsx", "client/deal-summary.jsx"]) {
      assert(!/onDeclineCard|declineCard/.test(code(f)), `${f} reaches the shop's decline`);
      assert(!/nextActor|cardOwner|lastValueMover|tradeValueOf|calculatedBalance|tradeRate/.test(code(f)), `${f} works out a turn or a figure`);
      assert(!/\.execute\(|store\./.test(code(f)), `${f} reaches for the store`);
    }
    assert(/onProposeMarket=\{onProposeMarket\}/.test(code("client/production-app.jsx").split('who.seat === "collector"')[1]), "the Collector's branch");
  });
  test("each control is a full finger high, the summary is one column at phone width, and every region is named", async () => {
    const css = read("client/collector/CollectorShell.jsx");
    assert(/\.mcs-sel-do \.mcs-go, \.mcs-sel-copy \.mcs-go \{ min-height:44px; \}/.test(css), "row buttons");
    assert(/\.mcs-vt \.mcs-offer-do \.mcs-go \{ min-height:44px; \}/.test(css) && /\.mcs-vt \.mcs-offer-field input \{ min-height:44px; font-size:16px; \}/.test(css), "the value box (16px stops iOS zooming)");
    /* RESTATED (M3B B4 refinement): the summary's stylesheet is the shared
       component's, placed by both shells. */
    const sumCss = SUM.summaryCss("mcs");
    assert(sumCss.includes(".mcs-sum {") && /@media \(max-width:380px\)/.test(sumCss), "the summary's stylesheet");
    /* RESTATED (M3B B4 polish): media-query breakpoints are conditions, not widths. */
    assert(!/(?<!max-)width:\s*[4-9]\d\dpx|min-width:\s*[2-9]\d\dpx/.test(sumCss.replace(/@media \([^)]*\)/g, "")), "a fixed width wider than a phone in the summary");
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.char]);
    const s = await casey(ctx);
    assert(summary(s).findAll((n) => n.type === "h2" && flat(n) === "Deal summary").length, "the summary has a heading");
    assert(summary(s).findAll((n) => n.props && n.props.role === "status").length, "the bottom line is announced when it changes");
    assert(theirs(s).props["aria-label"] === "Valuing your trade cards", "the Value Trade region is named");
    await press(rowIn(theirs(s), r1), "Propose a market value");
    const input = rowIn(theirs(s), r1).findAll((n) => n.type === "input")[0];
    assert(/Market value, in whole dollars/.test(input.props["aria-label"]) && input.props.inputMode === "numeric", "the box is labelled and numeric");
  });
});

run().finally(() => { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; delete globalThis.document; delete globalThis.window; });
