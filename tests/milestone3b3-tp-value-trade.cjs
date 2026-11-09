/* ============================================================================
   M3B B3 — VALUE TRADE IN PRODUCTION: THE SHOP'S SCREEN

   The domain has had per-card valuation since M3A A1 and B1's precision and
   decline rules; B2 proved the five commands through the real server behind a
   door that stayed shut. B3 opens exactly those five with the Trusted
   Partner's Value Trade screen that sends them, and adds one projected field:

     row.owner   on every trade row, in both people's views — the domain's own
                 `cardOwner`: which seat answers next on THAT card, or null

     shop        acceptMarketValue    "Accept $N"     a Collector's market value
                 proposeMarketValue   "Counter"       whole dollars
                 proposeTradePercent  "Propose a %" / "Counter"   whole 1–100%
                 acceptTradePercent   "Accept N%"
                 declineTradeCard     "Decline this card" — confirmation, optional note

   The Collector's Value Trade screen is B4. Until it ships the Collector's
   moves here are sent as Casey over HTTP, through the same production door —
   which is also why B3 alone is not a releasable two-seat experience.

   Every rendered journey runs the WHOLE production path: the shop's seat
   rendered with react-test-renderer → client/commands.js → the production
   store → the real API client → the real Fastify app (auth, allow-list) →
   executeCommand → PGlite with every migration → the projection → back onto
   the screen. As in the A3 freshness suite, the page (`document`/`window`) and
   ONLY the freshness timers are stood in for.

     A  the projection: owner, privacy            F  the cash difference
     B  the door and the bindings                 G  stage transitions
     C  who may do what, and when                 H  stale answers, lost answers, double presses
     D  every state of the shop's screen          I  nothing else changes
     E  declining a card
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
const { EXPOSED_COMMANDS, isExposed } = require("../server/exposed-commands.js");
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
const VT = load("client/value-trade.jsx");
const SUM = load("client/deal-summary.jsx");
const summaryOf = (s) => s.root().findAll((n) => n.type === "section" && n.props["data-summary"] === s.nl)[0] || null;
const ProductionApp = load("client/production-app.jsx").default;
const h = React.createElement;
const json = (v) => JSON.stringify(v);
const FIVE = ["proposeMarketValue", "acceptMarketValue", "proposeTradePercent", "acceptTradePercent", "declineTradeCard"];

/* ------------------------------------------------------ THE PAGE AND CLOCK
   As tests/milestone3a3-freshness.cjs: a visible page, and the freshness
   timers (15/30/60/120 s) held here and run on demand. */
const listeners = { document: {}, window: {} };
const on = (where) => (type, fn) => { (listeners[where][type] = listeners[where][type] || new Set()).add(fn); };
const off = (where) => (type, fn) => { if (listeners[where][type]) listeners[where][type].delete(fn); };
const page = { visibilityState: "visible", addEventListener: on("document"), removeEventListener: off("document"), querySelector: () => null };
globalThis.document = page;
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
const tick = async () => { const due = [...held]; held.clear(); for (const t of due) await TR.act(async () => { await t.fn(); }); await settle(); };

/* ------------------------------------------------------------- THE SERVER */
const SUBJECT = { north: "sub-north", silver: "sub-silver", casey: "sub-casey" };
let pglite = null;
const seats = [];
async function world() {
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
  const card = async (n, name, finish) => (await catalog.putCanonicalCard({ finish,
    cardContextId: (await catalog.putCardContext({ game: "pokemon", expansionId, collectorNumber: n, cardName: name, artist: "Ken Sugimori", rarity: "Rare" })).cardContextId })).canonicalCardId;
  const cards = { char: await card("4", "Charizard", "holofoil"), blas: await card("2", "Blastoise", "holofoil"),
    mud: await card("60", "Mudkip", "non_holo"), pika: await card("58", "Pikachu", "non_holo") };
  await repository.saveWorld({
    catalog: [], collectors: [{ id: "c1", name: "Casey Lin" }],
    /* Northline's default trade rate is its own configuration: never shown to
       the Collector, and never filled in for the shop either. */
    partners: [{ id: "p1", name: "Northline", tradeRate: 0.85 }, { id: "p2", name: "Silver Vale" }],
    relationships: [
      { partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" },
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
  const app = createApp({ repository, catalog, accounts, verifier, runtime });
  const post = async (who, command, payload) => {
    const res = await app.inject({ method: "POST", url: "/api/commands", headers: { authorization: `Bearer ${who}` }, payload: { command, payload } });
    return { status: res.statusCode, body: res.json() };
  };
  const ok = async (who, command, payload) => { const r = await post(who, command, payload); eq(r.status, 200, `${who} ${command}: ${json(r.body)}`); return r.body.value; };
  const refused = async (who, command, payload, code, why) => {
    const r = await post(who, command, payload);
    eq([r.status, r.body.error && r.body.error.refused].join(), `409,${code}`, why || command);
  };
  const k = {};
  k.a = await ok("casey", "addCollectorCopy", { copy: { canonicalCardId: cards.char, grade: "PSA 9", cert: "CERT-AAA", offered: true, market: 999 } });
  k.b = await ok("casey", "addCollectorCopy", { copy: { canonicalCardId: cards.blas, grade: "Raw", condition: "Near Mint", offered: true } });
  k.c = await ok("casey", "addCollectorCopy", { copy: { canonicalCardId: cards.char, grade: "PSA 7", cert: "CERT-CCC", offered: true } });
  const g1 = await ok("casey", "addGoal", { canonicalCardId: cards.mud, tier: "primary", desired: { grade: "PSA 9" } });
  const i1 = await ok("north", "addInventoryCopy", { copy: { canonicalCardId: cards.mud, grade: "PSA 9", ask: 300 } });
  const nl = await ok("casey", "startOpportunity", { goalId: g1, invId: i1, amount: 300 });
  await ok("north", "acceptPrice", { oppId: nl });
  const ctx = { app, repository, cards, k, nl, i1, post, ok, refused };
  ctx.load = () => repository.loadWorld();
  ctx.deal = async () => (await ctx.load()).opportunities.find((o) => o.id === nl);
  ctx.row = async (id) => (await ctx.deal()).trade.cards.find((r) => r.id === id);
  ctx.valid = async () => { const v = W.validateWorld(await ctx.load()); assert(v.ok, json(v.errors.slice(0, 3))); };
  ctx.status = async (copyId) => D.collectorCopyStatus(copyId, (await ctx.load()).opportunities);
  /* Northline chooses the copies, Casey is ready, Northline starts valuing:
     every chosen copy is held, and the deal is in Value Trade. Row ids in
     the order the copies were given. */
  ctx.toValuation = async (copyIds) => {
    await ok("north", "selectTradeCards", { oppId: nl, copyIds });
    await ok("casey", "continueTradeSelection", { oppId: nl });
    await ok("north", "closeTradeSelection", { oppId: nl });
    const rows = (await ctx.deal()).trade.cards;
    return copyIds.map((id) => rows.find((r) => r.binderId === id && r.inclusion === "accepted" && !r.withdrawn).id);
  };
  /* The Collector's moves, sent as Casey until B4 gives her a screen. */
  ctx.casey = {
    market: (row, amount) => ok("casey", "proposeMarketValue", { oppId: nl, tradeCardId: row, amount }),
    acceptMarket: (row) => ok("casey", "acceptMarketValue", { oppId: nl, tradeCardId: row }),
    percent: (row, percent) => ok("casey", "proposeTradePercent", { oppId: nl, tradeCardId: row, percent }),
    acceptPercent: (row) => ok("casey", "acceptTradePercent", { oppId: nl, tradeCardId: row }),
    withdraw: (row) => ok("casey", "withdrawTradeCard", { oppId: nl, tradeCardId: row }),
  };
  return ctx;
}

/* ------------------------------------------------------------- A SEAT
   The production app over the real API client and store, bound exactly as
   client/sign-in/SignIn.jsx binds it. `lose` drops the NEXT answer to that
   command after the server acted on it; `failViews` makes re-reads fail. */
async function seat(ctx, token) {
  const posts = [];
  const sent = [];
  const base = fetchFor(ctx.app);
  const s = { posts, sent, lose: null, failViews: false, views: 0 };
  const fetchImpl = async (url, init = {}) => {
    const isCommand = (init.method || "GET") === "POST" && /\/api\/commands$/.test(String(url));
    if (isCommand) { const b = JSON.parse(init.body); posts.push(b.command); sent.push(b); }
    if (!isCommand && /\/api\/view/.test(String(url))) s.views += 1;
    if (!isCommand && s.failViews && /\/api\/view/.test(String(url))) throw new TypeError("network down");
    const res = await base(url, init);
    if (isCommand && s.lose && JSON.parse(init.body).command === s.lose) { s.lose = null; throw new TypeError("network lost"); }
    return res;
  };
  const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => token, fetchImpl, timeoutMs: 60000 });
  const store = STORE.createProductionStore({ api });
  await store.load();
  const bind = {
    onBrowseCards: C.browseCards(store), onRefresh: C.refreshView(store),
    onOpenOffer: C.openOffer(store), onCounterOffer: C.counterOffer(store), onAcceptOffer: C.acceptOffer(store),
    onDeclineOffer: C.declineOffer(store), onWithdrawOffer: C.withdrawOffer(store), onSendMessage: C.sendDealMessage(store),
    onSelectTrade: C.selectTrade(store), onDeselectTrade: C.deselectTrade(store), onCloseSelection: C.closeSelection(store),
    onHoldSelection: C.holdSelection(store), onReadyForSelection: C.readyForSelection(store),
    onWithdrawTradeCard: C.withdrawTradeCard(store),
    onProposeMarket: C.proposeMarketValue(store), onAcceptMarket: C.acceptMarketValue(store),
    onProposePercent: C.proposeTradePercent(store), onAcceptPercent: C.acceptTradePercent(store),
    onDeclineCard: C.declineCard(store),
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
/* Northline, on its Opportunities. */
async function shop(ctx) {
  const s = await seat(ctx, "north");
  await go(s, "Opportunities");
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
const valuePanel = (s) => s.root().findAll((n) => n.type === "section" && n.props["data-value"] === s.nl)[0] || null;
const selectPanel = (s, oppId) => s.root().findAll((n) => n.type === "section" && n.props["data-select"] === oppId)[0] || null;
const rowIn = (root, id) => (root ? root.findAll((n) => n.type === "li" && n.props["data-row"] === id)[0] || null : null);
const listIn = (root, aria) => (root ? root.findAll((n) => n.type === "ul" && n.props["aria-label"] === aria)[0] || null : null);
const rowIds = (ul) => (ul ? ul.findAll((n) => n.type === "li" && n.props["data-row"]).map((n) => n.props["data-row"]) : []);
const tagOf = (li) => { const t = li && li.findAll((n) => n.type === "span" && /-sel-tag/.test(String(n.props.className)))[0]; return t ? flat(t) : null; };
const fact = (li, name) => {
  const pair = li.findAll((n) => n.type === "div" && n.children && n.children.some((c) => c && c.type === "dt" && flat(c) === name))[0];
  return pair ? flat(pair.findAll((n) => n.type === "dd")[0]) : null;
};
const typeInto = async (root, value, kind = "input") => {
  const field = root.findAll((n) => n.type === kind)[0];
  assert(field, `no ${kind}`);
  await TR.act(async () => { field.props.onChange({ target: { value } }); }); await settle();
};
const fieldValue = (root, kind = "input") => root.findAll((n) => n.type === kind)[0].props.value;
const submit = async (root) => {
  const form = root.findAll((n) => n.type === "form")[0];
  assert(form, "no form");
  const go1 = form.findAll((n) => n.type === "button" && n.props.type === "submit")[0];
  assert(!go1.props.disabled, `"${label(go1)}" is disabled`);
  await TR.act(async () => { await form.props.onSubmit({ preventDefault() {} }); }); await settle();
};
const submitLabel = (root) => label(root.findAll((n) => n.type === "button" && n.props.type === "submit")[0]);
const submitDisabled = (root) => !!root.findAll((n) => n.type === "button" && n.props.type === "submit")[0].props.disabled;
const recordOf = (s, inner) => s.root().findAll((n) => n.type === "article" && n.findAll((m) => m === inner).length)[0];
const panelTitled = (s, title) => s.root().findAll((n) => n.type === "section" && n.findAll((m) => m.type === "h2" && flat(m) === title).length)[0] || null;
/* The shop's view: open Value Trade for the one deal. */
const at = async (ctx) => { const s = await shop(ctx); s.nl = ctx.nl; return s; };

/* ======================================================================= A */
describe("A. The projection: each card says whose move it is, and nothing more", () => {
  test("every trade row carries owner = the domain's cardOwner, in both views, at every step; the record never stores it", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.a, ctx.k.b]);
    const check = async (why) => {
      const w = await ctx.load();
      const stored = w.opportunities.find((o) => o.id === ctx.nl);
      for (const row of stored.trade.cards) assert(!("owner" in row), `${why}: owner was stored`);
      for (const actor of [{ partnerId: "p1" }, { collectorId: "c1" }]) {
        const o = P.projectForActor(w, actor).opportunities.find((x) => x.id === ctx.nl);
        for (const row of o.trade.cards) {
          const want = D.cardOwner(stored.trade.cards.find((x) => x.id === row.id));
          eq(row.owner, want, `${why}: ${json(actor)} ${row.id}`);
        }
      }
      /* And over HTTP, as the screens receive it. */
      for (const who of ["north", "casey"]) {
        const res = await ctx.app.inject({ method: "GET", url: "/api/view", headers: { authorization: `Bearer ${who}` } });
        const o = res.json().state.opportunities.find((x) => x.id === ctx.nl);
        eq(json(o.trade.cards.map((r) => [r.id, r.owner])), json(stored.trade.cards.map((r) => [r.id, D.cardOwner(r)])), `${why}: ${who} over HTTP`);
      }
    };
    await check("both cards open");
    eq((await ctx.row(r1)).agreedMarket, null);
    await ctx.casey.market(r1, 400); await check("r1 proposed");
    await ctx.casey.market(r2, 150); await check("r2 proposed");
    await ctx.ok("north", "acceptMarketValue", { oppId: ctx.nl, tradeCardId: r1 }); await check("r1 market agreed");
    await ctx.ok("north", "proposeTradePercent", { oppId: ctx.nl, tradeCardId: r1, percent: 0.8 }); await check("r1 % proposed");
    /* The shop still holds r2, so the turn stays with it: it declines r2. */
    await ctx.ok("north", "declineTradeCard", { oppId: ctx.nl, tradeCardId: r2 }); await check("r2 declined");
    await ctx.casey.acceptPercent(r1); await check("r1 settled");
    eq((await ctx.deal()).stage, "deal", "the one card left was settled");
    const views = P.projectForActor(await ctx.load(), { partnerId: "p1" }).opportunities[0].trade.cards;
    eq(json(views.map((r) => r.owner)), json([null, null]), "settled and declined: nobody's move");
  });
  test("privacy is unchanged: owner is the only new key, the Collector's reference value and the shop's rate never cross", async () => {
    const ctx = await world();
    await ctx.toValuation([ctx.k.a]);
    const w = await ctx.load();
    const stored = w.opportunities.find((o) => o.id === ctx.nl);
    const tp = P.projectForActor(w, { partnerId: "p1" });
    const co = P.projectForActor(w, { collectorId: "c1" });
    for (const view of [tp, co]) {
      const o = view.opportunities.find((x) => x.id === ctx.nl);
      eq(json(Object.keys(o.trade.cards[0]).sort()), json([...Object.keys(stored.trade.cards[0]), "owner"].sort()), "exactly one key added to a row");
    }
    assert(!("tradeRate" in co.opportunities[0]), "the shop's default rate reached the Collector");
    assert(!json(co).includes("0.85"), "the shop's rate appears anywhere in the Collector's view");
    assert(tp.collectorCopies.every((c) => !("market" in c)), "a Collector's reference value reached the shop");
    assert(!json(tp.opportunities).includes("999"), "the Collector's reference value appears in the shop's deal");
    /* Another shop sees nothing of this deal. */
    const sv = P.projectForActor(w, { partnerId: "p2" });
    assert(!sv.opportunities.some((o) => o.id === ctx.nl), "Silver Vale sees Northline's deal");
  });
});

/* ======================================================================= B */
describe("B. The door and the bindings: exactly five, sent only by the shop's screen", () => {
  test("each sender sends exactly its command and payload; a percentage goes as the fraction the domain stores", async () => {
    const calls = [];
    const target = { execute: async (command, payload) => { calls.push([command, payload]); return { ok: true }; } };
    await C.proposeMarketValue(target)("o", "r", 360);
    await C.acceptMarketValue(target)("o", "r");
    await C.proposeTradePercent(target)("o", "r", 80);
    await C.proposeTradePercent(target)("o", "r", 29);
    await C.acceptTradePercent(target)("o", "r");
    await C.declineCard(target)("o", "r", "   ");
    await C.declineCard(target)("o", "r");
    await C.declineCard(target)("o", "r", "Too much edge wear");
    eq(json(calls), json([
      ["proposeMarketValue", { oppId: "o", tradeCardId: "r", amount: 360 }],
      ["acceptMarketValue", { oppId: "o", tradeCardId: "r" }],
      ["proposeTradePercent", { oppId: "o", tradeCardId: "r", percent: 0.8 }],
      ["proposeTradePercent", { oppId: "o", tradeCardId: "r", percent: 0.29 }],
      ["acceptTradePercent", { oppId: "o", tradeCardId: "r" }],
      ["declineTradeCard", { oppId: "o", tradeCardId: "r" }],
      ["declineTradeCard", { oppId: "o", tradeCardId: "r" }],
      ["declineTradeCard", { oppId: "o", tradeCardId: "r", note: "Too much edge wear" }],
    ]));
    for (const f of ["proposeMarketValue", "acceptMarketValue", "proposeTradePercent", "acceptTradePercent", "declineCard"]) {
      let threw = false; try { C[f](null); } catch (e) { threw = e instanceof TypeError; }
      assert(threw, `${f} binds without a store`);
    }
  });
  test("the door is exactly 42: the five with their sender, and Deal, Fulfillment and cash-only still shut", () => {
    eq(EXPOSED_COMMANDS.length, 42);
    for (const c of FIVE) assert(isExposed(c), `${c} is not exposed`);
    for (const c of ["chooseCashOnly", "proposeFinalBalance", "acceptDeal", "proposeFulfillment", "confirmFulfillmentPlan",
      "requestFulfillmentRevision", "confirmHandoff", "setCopyPending"]) assert(!isExposed(c), `${c} is exposed`);
    const client = read("client/commands.js");
    const sent = new Set([...client.matchAll(/execute\(\s*"([A-Za-z]+)"/g)].map((m) => m[1]));
    for (const m of client.matchAll(/^export const [A-Z_]+ = "([A-Za-z]+)";$/gm)) sent.add(m[1]);
    eq(json([...sent].sort()), json([...EXPOSED_COMMANDS].sort()), "exposed and client-sent disagree");
  });
  /* RESTATED (M3B B4): the Collector's Deal Workspace is handed four — never decline. */
  test("only the shop's Opportunities is handed all five; the Collector's screen never the decline", () => {
    const signIn = code("client/sign-in/SignIn.jsx");
    for (const fn of ["proposeMarketValue", "acceptMarketValue", "proposeTradePercent", "acceptTradePercent", "declineCard"]) {
      assert(new RegExp(`\\b${fn}\\(store\\)`).test(signIn), `${fn} is never bound`);
    }
    const tp = code("client/tp/TrustedPartnerShell.jsx");
    assert(/onCloseSelection,\s*onProposeMarket, onAcceptMarket, onProposePercent, onAcceptPercent, onDeclineCard \}/.test(tp), "the shop's Opportunities");
    for (const f of ["client/collector/CollectorShell.jsx", "client/collector/DealWorkspace.jsx", "client/collector/value-trade-area.jsx"]) {
      assert(!/onDeclineCard|declineCard/.test(code(f)), `${f} is handed the shop's decline`);
    }
    assert(!/onProposeMarket|onAcceptMarket|onProposePercent|onAcceptPercent|onDeclineCard/.test(code("client/tp/sections/CollectorNetwork.jsx")),
      "the Collector Network is handed Value Trade");
    assert(!/\.execute\(|store\./.test(code("client/tp/sections/Opportunities.jsx")), "Opportunities reaches for the store");
  });
  test("the screens never work out a turn: no turn engine, no stage comparison, no shop rate in the client", () => {
    for (const f of ["client/value-trade.jsx", "client/tp/sections/Opportunities.jsx"]) {
      const src = code(f);
      assert(!/nextActor|cardOwner|lastValueMover|turnFor|negotiationState|valueTradeSettled/.test(src), `${f} carries turn logic`);
      assert(!/tradeRate/.test(src), `${f} reads the shop's default rate`);
    }
    assert(!/stage\s*[!=]==|\.stage\b/.test(code("client/value-trade.jsx")), "value-trade.jsx compares a stage");
  });
});

/* ======================================================================= C */
describe("C. Who may do what, and when — the server's answer, through the production door", () => {
  test("each move belongs to its seat and its step", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.a]);
    const p = (x) => ({ oppId: ctx.nl, tradeCardId: r1, ...x });
    await ctx.refused("north", "proposeMarketValue", p({ amount: 300 }), "not-your-turn", "the shop cannot open a market value");
    await ctx.refused("north", "proposeTradePercent", p({ percent: 0.8 }), "not-your-turn", "nor a % before the market value");
    await ctx.refused("casey", "declineTradeCard", p({}), "not-owner", "only the shop declines");
    await ctx.refused("silver", "acceptMarketValue", p({}), "not-participant", "another shop");
    await ctx.casey.market(r1, 400);
    await ctx.refused("casey", "proposeMarketValue", p({ amount: 380 }), "not-your-turn", "the Collector answers herself");
    await ctx.ok("north", "acceptMarketValue", p({}));
    await ctx.refused("casey", "proposeTradePercent", p({ percent: 0.9 }), "not-your-turn", "the shop opens the %");
    await ctx.refused("north", "proposeTradePercent", p({ percent: 1.01 }), "invalid-amount", "over 100%");
    await ctx.refused("north", "proposeTradePercent", p({ percent: 0.805 }), "invalid-amount", "a fraction of a percent");
    await ctx.ok("north", "proposeTradePercent", p({ percent: 0.29 }));
    eq((await ctx.row(r1)).tpPercent, 0.29, "29% is whole");
    const forged = await ctx.post("north", "acceptMarketValue", { ...p({}), seat: "collector" });
    eq(forged.status, 400, "a payload naming a seat");
    await ctx.valid();
  });
  test("two cards: a card waiting on the shop is not its move while the Collector still holds the turn", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.a, ctx.k.b]);
    await ctx.casey.market(r1, 400);
    eq(D.cardOwner(await ctx.row(r1)), "tp", "r1 waits on the shop");
    await ctx.refused("north", "acceptMarketValue", { oppId: ctx.nl, tradeCardId: r1 }, "not-your-turn", "the Collector works through her cards first");
    await ctx.casey.market(r2, 150);
    await ctx.ok("north", "acceptMarketValue", { oppId: ctx.nl, tradeCardId: r1 });
  });
});

/* ======================================================================= D */
describe("D. The shop's Value Trade screen, state by state", () => {
  test("held, nothing proposed: a wait — every card says so, and the only control is Decline", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.a, ctx.k.b]);
    const s = await at(ctx);
    const v = valuePanel(s);
    assert(v, "no Value Trade: " + flat(s.root()).slice(0, 300));
    eq(selectPanel(s, ctx.nl), null, "Select Trade still drawn");
    /* RESTATED (M3B B4 polish) */ assert(/Waiting for Casey Lin — 2 cards\./.test(flat(v)), flat(v));
    eq(json(rowIds(listIn(v, "Cards in this deal"))), json([r1, r2]), "the held cards, by row");
    const li = rowIn(v, r1);
    assert(/Charizard/.test(flat(li)) && /PSA 9 · Cert CERT-AAA/.test(flat(li)), "identity: " + flat(li));
    assert(li.findAll((n) => /tps-sel-art/.test(String(n.props.className))).length, "no artwork frame");
    eq(tagOf(li), "Waiting for Casey Lin");
    eq(fact(li, "Market value"), "Waiting for Casey Lin to propose one");
    eq(fact(li, "Trade %"), "After the market value is agreed");
    eq(fact(li, "Trade credit"), "Not agreed yet");
    eq(json(buttons(v).map(label)), json(["Decline this card", "Decline this card"]));
    /* RESTATED (M3B B4 refinement): the shop's own cash block became the shared
       Deal Summary — the same component the Collector sees — beside this panel. */
    const sum = flat(summaryOf(s));
    /* RESTATED (M3B B4 polish) */ 
    assert(/Agreed price \$300/.test(sum) && /Valuing trade-ins · 0 of 2 agreed/.test(sum) && /Agreed trade-in value \$0/.test(sum), sum);
    assert(/Current amounts These amounts may change until all trade-in values are agreed\. You Owe \$0 You Receive \$300/.test(sum), sum);
    /* The deal waits in In progress, saying whose turn it is. */
    const rec = recordOf(s, v);
    assert(/Value Trade/.test(flat(rec)) && /Waiting for Casey Lin/.test(flat(rec)) && !/Your move/.test(flat(rec)), flat(rec).slice(0, 200));
    assert(panelTitled(s, "In progress").findAll((n) => n === rec).length, "not in In progress");
  });
  test("deal-level turn vs per-card: a card waiting on the shop says “You're next” until the turn is the shop's", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.a, ctx.k.b]);
    await ctx.casey.market(r1, 400);
    let s = await at(ctx);
    let v = valuePanel(s);
    /* RESTATED (M3B B4 polish) */ assert(/Waiting for Casey Lin first — 1 card\. You're next on 1 card\./.test(flat(v)), flat(v));
    assert(!/'s move/.test(flat(v)), "a possessive turn sentence");
    eq(tagOf(rowIn(v, r1)), "You're next, after Casey Lin");
    eq(fact(rowIn(v, r1), "Market value"), "Casey Lin proposed $400");
    eq(button(rowIn(v, r1), "Accept"), null, "an Accept while it is the Collector's turn");
    eq(button(rowIn(v, r1), "Counter"), null, "a Counter while it is the Collector's turn");
    eq(tagOf(rowIn(v, r2)), "Waiting for Casey Lin");
    await ctx.casey.market(r2, 150);
    await s.refresh();
    v = valuePanel(s);
    assert(/Your move — 2 cards waiting on you\./.test(flat(v)), flat(v));
    for (const r of [r1, r2]) eq(tagOf(rowIn(v, r)), "Your move");
    assert(button(rowIn(v, r1), "Accept $400") && button(rowIn(v, r2), "Accept $150") && button(rowIn(v, r1), "Counter"));
    /* Ready to coordinate, and it says what is waiting. */
    const ready = panelTitled(s, "Ready to coordinate");
    assert(ready && ready.findAll((n) => n === recordOf(s, v)).length, "the deal is not in Ready to coordinate");
    assert(/1 deal to value cards for/.test(flat(ready)), flat(ready).slice(0, 200));
    assert(/Your move/.test(flat(recordOf(s, v))));
  });
  test("accepting a market value, then opening the %: nothing filled in, whole numbers only, a credit preview", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.a, ctx.k.b]);
    await ctx.casey.market(r1, 400); await ctx.casey.market(r2, 150);
    const s = await at(ctx);
    await press(rowIn(valuePanel(s), r1), "Accept $400");
    eq(s.posts.slice(-1)[0], "acceptMarketValue");
    eq((await ctx.row(r1)).agreedMarket, 400, "agreed on the server");
    let li = rowIn(valuePanel(s), r1);
    eq(fact(li, "Market value"), "$400 agreed");
    eq(fact(li, "Trade %"), "Yours to propose");
    assert(/Accepted \$400 as this card's market value\./.test(flat(valuePanel(s))), flat(valuePanel(s)));
    eq(json(li.findAll((n) => n.type === "ol")[0].findAll((n) => n.type === "li").map(flat)),
      json(["Casey Lin proposed $400 market value", "You accepted $400 market value"]), "history");
    await press(li, "Propose a %");
    li = rowIn(valuePanel(s), r1);
    eq(fieldValue(li), "", "the % box is filled in");
    assert(!/85/.test(flat(valuePanel(s))), "the shop's default rate is shown");
    for (const bad of ["0", "101", "80.5", "eighty", "-5"]) {
      await typeInto(li, bad); li = rowIn(valuePanel(s), r1);
      assert(/Use a whole percentage from 1 to 100/.test(flat(li)) && submitDisabled(li), `${bad}: ${flat(li)}`);
    }
    await typeInto(li, "80"); li = rowIn(valuePanel(s), r1);
    assert(/That's \$320 of trade credit on \$400\./.test(flat(li)), flat(li));
    eq(submitLabel(li), "Propose · 80%");
    await submit(li);
    eq(json(s.sent.slice(-1)[0]), json({ command: "proposeTradePercent", payload: { oppId: ctx.nl, tradeCardId: r1, percent: 0.8 } }));
    li = rowIn(valuePanel(s), r1);
    eq(fact(li, "Trade %"), "You proposed 80%");
    eq(tagOf(li), "Waiting for Casey Lin");
    assert(/Sent 80% to Casey Lin\./.test(flat(valuePanel(s))));
  });
  test("countering a market value: whole dollars only, nothing filled in, and the counter is what is sent", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.a]);
    await ctx.casey.market(r1, 400);
    const s = await at(ctx);
    await press(rowIn(valuePanel(s), r1), "Counter");
    let li = rowIn(valuePanel(s), r1);
    eq(fieldValue(li), "", "the counter is filled in");
    for (const bad of ["150.50", "0", "abc", "$200", "1e3"]) {
      await typeInto(li, bad); li = rowIn(valuePanel(s), r1);
      assert(/Use whole dollars above \$0 — no cents\./.test(flat(li)) && submitDisabled(li), `${bad}: ${flat(li)}`);
    }
    const before = s.posts.length;
    await press(li, "Cancel");
    eq(s.posts.length, before, "Cancel sent something");
    await press(rowIn(valuePanel(s), r1), "Counter");
    li = rowIn(valuePanel(s), r1);
    await typeInto(li, "360"); li = rowIn(valuePanel(s), r1);
    eq(submitLabel(li), "Send counter · $360");
    await submit(li);
    eq(json(s.sent.slice(-1)[0]), json({ command: "proposeMarketValue", payload: { oppId: ctx.nl, tradeCardId: r1, amount: 360 } }));
    li = rowIn(valuePanel(s), r1);
    eq(fact(li, "Market value"), "You proposed $360");
    eq(tagOf(li), "Waiting for Casey Lin");
    assert(/You countered \$360 market value/.test(flat(li)), flat(li));
  });
  test("answering the Collector's %: Accept or Counter; agreed shows the credit, and the cash moves with it", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.a, ctx.k.b]);
    await ctx.casey.market(r1, 400); await ctx.casey.market(r2, 150);
    await ctx.ok("north", "acceptMarketValue", { oppId: ctx.nl, tradeCardId: r1 });
    await ctx.ok("north", "proposeTradePercent", { oppId: ctx.nl, tradeCardId: r1, percent: 0.8 });
    await ctx.ok("north", "acceptMarketValue", { oppId: ctx.nl, tradeCardId: r2 });
    await ctx.ok("north", "proposeTradePercent", { oppId: ctx.nl, tradeCardId: r2, percent: 0.4 });
    await ctx.casey.percent(r1, 0.9); await ctx.casey.percent(r2, 0.5);
    const s = await at(ctx);
    let li = rowIn(valuePanel(s), r1);
    eq(fact(li, "Trade %"), "Casey Lin countered 90%");
    assert(button(li, "Accept 90%") && button(li, "Counter"), buttons(li).map(label).join("|"));
    await press(li, "Counter"); li = rowIn(valuePanel(s), r1);
    await typeInto(li, "85"); li = rowIn(valuePanel(s), r1);
    assert(/That's \$340 of trade credit on \$400\./.test(flat(li)), flat(li));
    eq(submitLabel(li), "Send counter · 85%");
    await submit(li);
    eq(s.sent.slice(-1)[0].payload.percent, 0.85);
    /* The shop still holds r2, so the turn is still its own: it accepts 50%. */
    await press(rowIn(valuePanel(s), r2), "Accept 50%");
    li = rowIn(valuePanel(s), r2);
    eq(tagOf(li), "Agreed");
    eq([fact(li, "Market value"), fact(li, "Trade %"), fact(li, "Trade credit")].join(" | "), "$150 agreed | 50% agreed | $75");
    eq(D.tradeValueOf(await ctx.row(r2)), 75, "the server's credit");
    eq(buttons(li).map(label).join(), "Decline this card", "an agreed card offers anything but Decline");
    /* RESTATED (M3B B4 refinement): the shop's own cash block became the shared
       Deal Summary — the same component the Collector sees — beside this panel. */
    let sum = flat(summaryOf(s));
    /* RESTATED (M3B B4 polish) */ 
    assert(/Valuing trade-ins · 1 of 2 agreed/.test(sum) && /Agreed trade-in value \$75/.test(sum) && /You Owe \$0 You Receive \$225/.test(sum), sum);
    assert(/Current amounts These amounts may change until all trade-in values are agreed\./.test(sum), sum);
    /* Now it is Casey's: she counters 88%, and the shop accepts. */
    await ctx.casey.percent(r1, 0.88);
    await s.refresh();
    await press(rowIn(valuePanel(s), r1), "Accept 88%");
    eq(D.tradeValueOf(await ctx.row(r1)), 352);
    sum = flat(summaryOf(s));
    assert(/Agreed trade-in value \$427/.test(sum) && /You Owe \$127 You Receive \$0/.test(sum) && !/Current amounts|may change/.test(sum), sum);
  });
  test("a fresh seat at every step draws the same screen from the server alone", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.a]);
    const view = async () => { const s = await at(ctx); const v = valuePanel(s); const out = [flat(v), buttons(v).map(label).join("|")]; await s.unmount(); seats.pop(); return out; };
    const a1 = await view(); const a2 = await view();
    eq(json(a1), json(a2), "the same deal drew differently");
    await ctx.casey.market(r1, 400);
    const b = await view();
    assert(/Your move — 1 card waiting on you\./.test(b[0]) && b[1] === "Accept $400|Counter|Decline this card", json(b));
  });
});

/* ======================================================================= E */
describe("E. Declining a card: a confirmation, an optional note, and only that card", () => {
  test("Decline asks first; Keep it sends nothing", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.a, ctx.k.b]);
    const s = await at(ctx);
    const before = s.posts.length;
    await press(rowIn(valuePanel(s), r2), "Decline this card");
    const box = rowIn(valuePanel(s), r2);
    assert(/Decline this card\? It leaves this deal and its history stays\. The other cards stay as they are\. Casey Lin will see that you declined it\./.test(flat(box)), flat(box));
    eq(fieldValue(box, "textarea"), "", "a note was filled in");
    await press(box, "Keep it");
    eq(s.posts.length, before, "Keep it sent something");
    eq(json(D.TRADE.liveTradeRows(await ctx.deal()).map((r) => r.id)), json([r1, r2]), "a card left");
  });
  test("the note: optional, at most 140 characters counted as the server counts them", async () => {
    const ctx = await world();
    const [, r2] = await ctx.toValuation([ctx.k.a, ctx.k.b]);
    const s = await at(ctx);
    await press(rowIn(valuePanel(s), r2), "Decline this card");
    let box = rowIn(valuePanel(s), r2);
    await typeInto(box, "x".repeat(141), "textarea"); box = rowIn(valuePanel(s), r2);
    assert(/141\/140/.test(flat(box)) && /A note can be at most 140 characters\./.test(flat(box)), flat(box));
    assert(button(box, "Decline card").props.disabled, "a 141-character note can be sent");
    await typeInto(box, "🃏".repeat(140), "textarea"); box = rowIn(valuePanel(s), r2);
    assert(/140\/140/.test(flat(box)) && !button(box, "Decline card").props.disabled, "140 emoji are 140 characters");
    await typeInto(box, `  ${"y".repeat(70)}     ${"z".repeat(69)}  `, "textarea"); box = rowIn(valuePanel(s), r2);
    assert(/140\/140/.test(flat(box)), "spaces collapse as the server collapses them: " + flat(box));
    eq(VT.noteLength("  a \n\t b  "), 3);
  });
  test("declining with a note takes out that card only: history kept, its hold released, the other card untouched", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.a, ctx.k.b]);
    await ctx.casey.market(r1, 400); await ctx.casey.market(r2, 150);
    const s = await at(ctx);
    const r1Before = json(await ctx.row(r1));
    await press(rowIn(valuePanel(s), r2), "Decline this card");
    await typeInto(rowIn(valuePanel(s), r2), "Too much   edge wear ", "textarea");
    await press(rowIn(valuePanel(s), r2), "Decline card");
    eq(json(s.sent.slice(-1)[0]), json({ command: "declineTradeCard", payload: { oppId: ctx.nl, tradeCardId: r2, note: "Too much edge wear" } }));
    const row = await ctx.row(r2);
    eq([row.inclusion, row.declinedStage, row.declineNote].join(), "rejected,value-trade,Too much edge wear");
    eq(row.valueThread.length, 1, "its history");
    eq(json(await ctx.row(r1)), r1Before, "the other card changed");
    eq(await ctx.status(ctx.k.b), "available", "the declined card's hold");
    eq(await ctx.status(ctx.k.a), "reserved", "the other card's hold");
    const v = valuePanel(s);
    assert(/Declined\. The other cards are unchanged\./.test(flat(v)), flat(v));
    eq(json(rowIds(listIn(v, "Cards in this deal"))), json([r1]));
    const out = rowIn(listIn(v, "Out of this deal"), r2);
    assert(out && tagOf(out) === "Declined by you" && /Your note: “Too much edge wear”/.test(flat(out)), flat(out));
    assert(/Casey Lin proposed \$150 market value/.test(flat(out)), "its history on screen");
    eq(buttons(out).length, 0, "a control on a declined card");
    /* The Collector sees it too: the note, the history, and nobody's move. */
    const caseyRow = P.projectForActor(await ctx.load(), { collectorId: "c1" }).opportunities[0].trade.cards.find((r) => r.id === r2);
    eq([caseyRow.declineNote, caseyRow.owner, caseyRow.valueThread.length].join(), "Too much edge wear,,1");
    /* The deal-level turn moved to the shop's one remaining card. */
    assert(/Your move — 1 card waiting on you\./.test(flat(v)), flat(v));
    await ctx.valid();
  });
  test("a decline at the Collector's turn, and one with no note stores no note", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.a, ctx.k.b]);
    const s = await at(ctx);
    assert(/Waiting for Casey Lin/.test(flat(valuePanel(s))));
    await press(rowIn(valuePanel(s), r1), "Decline this card");
    await press(rowIn(valuePanel(s), r1), "Decline card");
    eq(json(s.sent.slice(-1)[0].payload), json({ oppId: ctx.nl, tradeCardId: r1 }), "a note was sent");
    assert(!("declineNote" in (await ctx.row(r1))), "an empty note was stored");
    eq(json(D.TRADE.liveTradeRows(await ctx.deal()).map((r) => r.id)), json([r2]));
  });
});

/* ======================================================================= F */
describe("F. The cash difference: agreed credits only, said as who pays whom", () => {
  const rnd = (() => { let x = 7; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; })();
  test("credit and balance are the domain's own arithmetic, on any mix of cards", () => {
    for (let i = 0; i < 400; i += 1) {
      const cards = Array.from({ length: Math.floor(rnd() * 5) }, (_, j) => {
        const m = rnd() < 0.7 ? 1 + Math.floor(rnd() * 900) : null;
        const pc = m != null && rnd() < 0.7 ? (1 + Math.floor(rnd() * 100)) / 100 : null;
        const r = rnd();
        return { id: `t${j}`, inclusion: r < 0.1 ? "rejected" : "accepted", withdrawn: r > 0.9, agreedMarket: m, agreedPercent: pc };
      });
      const deal = { agreedPrice: rnd() < 0.9 ? 1 + Math.floor(rnd() * 1500) : null, trade: { cards } };
      for (const c of cards) eq(VT.creditOf(c), D.tradeValueOf(c), json(c));
      const pic = VT.cashPicture(deal);
      eq(pic.balance, D.calculatedBalance(deal), json(deal));
      const dir = D.cashDirection(D.calculatedBalance(deal)).direction;
      eq(pic.direction, dir === "settled" ? "even" : dir, json(deal));
    }
    eq(VT.creditAt(175, 50), D.tradeValueAt(175, 0.5), "a preview rounds as the domain rounds");
  });
  /* RESTATED (M3B B4 refinement): `cashLine`'s two sentences became the shared
     summary's "You Owe" / "You Receive", relative to the seat (deal-summary.jsx
     `payments`). */
  test("each seat is told the direction in its own words", () => {
    const pic = (b) => ({ direction: b > 0 ? "collector-to-tp" : b < 0 ? "tp-to-collector" : "even", amount: Math.abs(b) });
    const say = (b, seat) => json(SUM.payments(pic(b), seat));
    eq(say(120, "tp"), json({ owe: 0, receive: 120 }));
    eq(say(-52, "tp"), json({ owe: 52, receive: 0 }));
    eq(say(120, "collector"), json({ owe: 120, receive: 0 }));
    eq(say(-52, "collector"), json({ owe: 0, receive: 52 }));
    eq(say(0, "tp"), json({ owe: 0, receive: 0 }));
  });
  test("whole-number entry is read as the server checks it, never corrected", () => {
    const ok = (m, raw) => VT.readValue(m, raw).value;
    eq(json(["1", "100", "007", " 80 "].map((r) => ok("percent", r))), json([1, 100, null, 80]));
    eq(json(["0", "101", "1.5", "50%", ""].map((r) => ok("percent", r))), json([null, null, null, null, null]));
    eq(json(["1", "250", "9007199254740991"].map((r) => ok("market", r))), json([1, 250, 9007199254740991]));
    eq(json(["0", "1.00", "-3", "9007199254740993", "1,000"].map((r) => ok("market", r))), json([null, null, null, null, null]));
  });
});

/* ======================================================================= G */
describe("G. When valuing ends", () => {
  test("the last card agreed: the deal shows Deal next — read-only, no Deal control, no “Your move”", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.a, ctx.k.b]);
    await ctx.casey.market(r1, 400); await ctx.casey.market(r2, 175);
    for (const [r, pc] of [[r1, 0.8], [r2, 0.4]]) {
      await ctx.ok("north", "acceptMarketValue", { oppId: ctx.nl, tradeCardId: r });
      await ctx.ok("north", "proposeTradePercent", { oppId: ctx.nl, tradeCardId: r, percent: pc });
    }
    await ctx.casey.acceptPercent(r1); await ctx.casey.percent(r2, 0.5);
    const s = await at(ctx);
    await press(rowIn(valuePanel(s), r2), "Accept 50%");
    eq((await ctx.deal()).stage, "deal", "the server moved the deal to Deal");
    const v = valuePanel(s);
    assert(/Values agreed/.test(flat(v)) && /Every card's value is agreed\. Next comes Deal, which isn't available in MetYet yet\./.test(flat(v)), flat(v));
    assert(/Agreed 50% — \$88 trade credit\./.test(flat(v)), flat(v));
    eq(buttons(v).length, 0, "a control once every card is agreed: " + buttons(v).map(label).join("|"));
    /* RESTATED (M3B B4 refinement): the shop's own cash block became the shared
       Deal Summary — the same component the Collector sees — beside this panel. */
    const sum = flat(summaryOf(s));
    assert(/Every trade-in value is agreed/.test(sum) && /Agreed trade-in value \$408/.test(sum) && /You Owe \$108 You Receive \$0/.test(sum)
      && !/Current amounts|may change/.test(sum), sum);
    const rec = recordOf(s, v);
    assert(/Values agreed · Deal coming soon/.test(flat(rec)) && !/Your move/.test(flat(rec)), flat(rec).slice(0, 200));
    assert(!panelTitled(s, "Ready to coordinate") || !panelTitled(s, "Ready to coordinate").findAll((n) => n === rec).length, "a Deal with no control is in Ready to coordinate");
    const d = await ctx.deal();
    eq([d.deal.tpAgreed, d.deal.collectorAgreed].join(), "false,false", "nothing agreed past the values");
    await ctx.valid();
  });
  test("the last card declined: back to choosing cards, and the shop is told why", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.a]);
    const s = await at(ctx);
    await press(rowIn(valuePanel(s), r1), "Decline this card");
    assert(/It's the last card, so the deal goes back to choosing cards\./.test(flat(rowIn(valuePanel(s), r1))));
    await press(rowIn(valuePanel(s), r1), "Decline card");
    eq((await ctx.deal()).stage, "select-trade");
    eq(valuePanel(s), null, "Value Trade still drawn");
    const sel = selectPanel(s, ctx.nl);
    assert(sel && /Choose the cards you'd consider/.test(flat(sel)), flat(s.root()).slice(0, 300));
    assert(/You declined the last card, so this deal is back to choosing cards\./.test(flat(recordOf(s, sel))), flat(recordOf(s, sel)));
    eq(await ctx.status(ctx.k.a), "available", "released");
  });
  test("the Collector takes the last card out: the shop's screen follows to Select Trade", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.a]);
    const s = await at(ctx);
    await ctx.casey.withdraw(r1);
    await tick();
    assert(selectPanel(s, ctx.nl) && !valuePanel(s), "the shop still shows Value Trade");
    assert(/Updated — Casey Lin took a card out of this deal\./.test(flat(s.root())), "said once: " + flat(s.root()).slice(0, 300));
  });
});

/* ======================================================================= H */
describe("H. Stale screens, lost answers and double presses", () => {
  test("an answer lost after the server acted: nothing claimed, the re-read shows the truth, nothing sent twice", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.a]);
    await ctx.casey.market(r1, 400);
    const s = await at(ctx);
    s.lose = "acceptMarketValue";
    await press(rowIn(valuePanel(s), r1), "Accept $400");
    const v = valuePanel(s);
    assert(/MetYet couldn't confirm that just now\. Check the latest here before trying again\./.test(flat(v)), flat(v));
    assert(!/Accepted \$400/.test(flat(v)), "success claimed without an answer");
    eq(fact(rowIn(v, r1), "Market value"), "$400 agreed", "the re-read");
    eq(s.posts.filter((c) => c === "acceptMarketValue").length, 1, "sent again by itself");
  });
  test("two presses in the same instant send one command", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.a]);
    await ctx.casey.market(r1, 400);
    const s = await at(ctx);
    const b = button(rowIn(valuePanel(s), r1), "Accept $400");
    await TR.act(async () => { await Promise.all([b.props.onClick(), b.props.onClick()]); }); await settle();
    eq(s.posts.filter((c) => c === "acceptMarketValue").length, 1);
    eq((await ctx.row(r1)).valueThread.length, 2, "one accept in the history");
  });
  test("a stale screen: the card was taken out meanwhile; the refusal says so and the screen catches up", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.a, ctx.k.b]);
    await ctx.casey.market(r1, 400); await ctx.casey.market(r2, 150);
    const s = await at(ctx);
    await ctx.casey.withdraw(r1);
    await press(rowIn(valuePanel(s), r1), "Accept $400");
    const v = valuePanel(s);
    assert(/That card isn't in this deal any more\. The latest is shown\./.test(flat(v)), flat(v));
    const out = rowIn(listIn(v, "Out of this deal"), r1);
    assert(out && tagOf(out) === "Taken out by Casey Lin", "the re-read: " + flat(v));
    eq((await ctx.row(r1)).agreedMarket, null, "a stale accept landed");
  });
  test("a refusal the shared table does not call stale — the relationship ended — still re-reads, and says what is left", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.a]);
    await ctx.casey.market(r1, 400);
    const s = await at(ctx);
    const w = await ctx.load();
    await ctx.repository.saveWorld({ ...w, relationships: w.relationships.map((r) => (r.partnerId === "p1" ? { ...r, status: "ended" } : r)) });
    const views = s.views;
    await press(rowIn(valuePanel(s), r1), "Accept $400");
    assert(s.views > views, "the screen did not ask the server again after the refusal");
    assert(/You're no longer connected with Casey Lin, so cards can't be valued in this deal\. You can still decline a card\./.test(flat(s.root())), flat(s.root()).slice(0, 400));
    eq((await ctx.row(r1)).agreedMarket, null, "accepted without a relationship");
  });
  test("a check notices a move on a card's value even when the turn and the cards are unchanged", async () => {
    const ctx = await world();
    const [r1] = await ctx.toValuation([ctx.k.a, ctx.k.b]);
    const s = await at(ctx);
    const before = json([s.store.get().opportunities[0].turn.seat, s.store.get().opportunities[0].turn.reason]);
    await ctx.casey.market(r1, 400);
    await tick();
    eq(json([s.store.get().opportunities[0].turn.seat, s.store.get().opportunities[0].turn.reason]), before, "the turn moved — this test needs it not to");
    assert(/Updated — Casey Lin answered on a card's value\./.test(flat(s.root())), flat(s.root()).slice(0, 400));
  });
  test("a change found by a check closes an open answer box and says so; a failed check pauses every control", async () => {
    const ctx = await world();
    const [r1, r2] = await ctx.toValuation([ctx.k.a, ctx.k.b]);
    await ctx.casey.market(r1, 400); await ctx.casey.market(r2, 150);
    const s = await at(ctx);
    await press(rowIn(valuePanel(s), r1), "Counter");
    await ctx.casey.withdraw(r2);
    await tick();
    let v = valuePanel(s);
    assert(!v.findAll((n) => n.type === "form").length, "the counter box stayed open on a changed deal");
    assert(/This deal changed while you were answering — check the card and try again\./.test(flat(v)), flat(v));
    s.failViews = true;
    await tick();
    v = valuePanel(s);
    assert(/Deal actions are paused/.test(flat(s.root())), "no pause said");
    assert(buttons(v).length && buttons(v).every((b) => b.props.disabled), "a control live while paused: " + buttons(v).filter((b) => !b.props.disabled).map(label).join("|"));
    s.failViews = false;
  });
});

/* ======================================================================= I */
describe("I. Nothing else changes", () => {
  test("a whole journey writes no copy, inventory or Goal fact; holds are only the live cards'", async () => {
    const ctx = await world();
    const snap = (w) => json({
      copies: w.collectorCopies.map((c) => [c.id, c.offered, c.keeping, c.grade, c.cert, c.market]).sort(),
      inventory: w.inventory.map((i) => [i.invId, i.ask, i.archived || false, i.grade]).sort(),
      goals: w.goals.map((g) => [g.id, g.tier, g.canonicalCardId]).sort() });
    const [r1, r2, r3] = await ctx.toValuation([ctx.k.a, ctx.k.b, ctx.k.c]);
    const before = snap(await ctx.load());
    const s = await at(ctx);
    await ctx.casey.market(r1, 400); await ctx.casey.market(r2, 150); await ctx.casey.market(r3, 90);
    await s.refresh();
    await press(rowIn(valuePanel(s), r1), "Accept $400");
    await press(rowIn(valuePanel(s), r3), "Decline this card"); await press(rowIn(valuePanel(s), r3), "Decline card");
    await press(rowIn(valuePanel(s), r1), "Propose a %");
    await typeInto(rowIn(valuePanel(s), r1), "75"); await submit(rowIn(valuePanel(s), r1));
    eq(snap(await ctx.load()), before, "a copy, shelf or Goal fact moved");
    const statuses = await Promise.all([ctx.k.a, ctx.k.b, ctx.k.c].map(ctx.status));
    eq(json(statuses), json(["reserved", "reserved", "available"]), "holds are exactly the live cards'");
    const d = await ctx.deal();
    eq(d.stage, "value-trade");
    eq(d.invId, ctx.i1, "the shop's copy");
    eq(json(s.posts), json(["acceptMarketValue", "declineTradeCard", "proposeTradePercent"]), "the shop sent exactly these");
    await ctx.valid();
  });
});

run().finally(() => { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; delete globalThis.document; delete globalThis.window; });
