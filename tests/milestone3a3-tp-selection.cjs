/* ============================================================================
   M3A A3 — SELECT TRADE IN PRODUCTION: THE SHOP CHOOSES, THE COLLECTOR ANSWERS

   The domain (M3A A1) has had TP-led selection since A1; A3 opens six of its
   doors with the screens that send them, and nothing past Select Trade:

     shop        selectTradeCards   "Send N cards" (first choice, ONE send) /
                                    "Add to this deal" (after the Collector is ready)
                 deselectTradeCard  "Remove"
                 closeTradeSelection "Start valuing" — after a confirmation;
                                    holds every chosen card for this deal, or
                                    nothing (a refusal names the shop's OWN rows)
     Collector   holdTradeSelection "Hold on, I'm adding cards"
                 continueTradeSelection "I'm ready — they can finish choosing"
                 withdrawTradeCard  "Take out of this deal" (confirmation)

   Every journey below runs the WHOLE production path: two seats rendered with
   react-test-renderer → the client/commands.js bindings → the production
   store → the real API client → the real Fastify app (auth verifier,
   allow-list, catalog guard) → executeCommand → PGlite with every migration →
   the projection → back onto each seat's screen. Only sign-in and `fetch`
   (Fastify's inject in fetch's shape) are stood in for. The browser journeys
   are harness/phase6-select-trade-browser.cjs.

     A  offer → see → choose → both sides         I  PC switch while chosen
     B  two copies of one printing                J  forged and unauthorized
     C  remove one                                K  relationship ended
     D  ready → confirm → held → Value Trade      L  unavailable after choosing
     E  hold, add a card, finish                  M  lost answers
     F  reload at every turn                      N  take out, choose again
     G  two shops, one card                       O  the exact door
     H  one shop, two stale sessions              P  `detail`, layer by layer
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
const { executeCommand } = require("../persistence/command-transaction.js");
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
const ProductionApp = load("client/production-app.jsx").default;
const h = React.createElement;
const json = (v) => JSON.stringify(v);

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
  const ctxOf = async (n, name) => (await catalog.putCardContext({ game: "pokemon", expansionId,
    collectorNumber: n, cardName: name, artist: "Ken Sugimori", rarity: "Rare" })).cardContextId;
  const card = async (n, name, finish, printRun) => (await catalog.putCanonicalCard({ cardContextId: await ctxOf(n, name), finish,
    ...(printRun ? { printRun } : {}) })).canonicalCardId;
  const cards = { char: await card("4", "Charizard", "holofoil", "first_edition"), blas: await card("2", "Blastoise", "holofoil"),
    mud: await card("60", "Mudkip", "non_holo"), pika: await card("58", "Pikachu", "non_holo"), ven: await card("15", "Venusaur", "holofoil") };
  await repository.saveWorld({
    catalog: [], collectors: [{ id: "c1", name: "Casey Lin" }, { id: "c2", name: "Jordan Park" }],
    partners: [{ id: "p1", name: "Northline" }, { id: "p2", name: "Silver Vale" }, { id: "p3", name: "Faraway" }],
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
  const app = createApp({ repository, catalog, accounts, verifier, runtime });
  const post = async (who, command, payload) => {
    const res = await app.inject({ method: "POST", url: "/api/commands",
      headers: { authorization: `Bearer ${who}` }, payload: { command, payload } });
    return { status: res.statusCode, body: res.json() };
  };
  const ok = async (who, command, payload) => {
    const r = await post(who, command, payload);
    eq(r.status, 200, `${who} ${command}: ${json(r.body)}`);
    return r.body.value;
  };
  /* Casey's shelf, through Your Cards' doors: two Trade/Sell copies of ONE
     printing that differ in every physical fact, a PC copy of the same card
     and a Trade/Sell Blastoise. Jordan offers one card. */
  const k = {};
  k.a = await ok("casey", "addCollectorCopy", { copy: { canonicalCardId: cards.char, grade: "PSA 9", cert: "CERT-AAA",
    photos: { front: "b:a:f", back: "b:a:b" }, offered: true } });
  k.b = await ok("casey", "addCollectorCopy", { copy: { canonicalCardId: cards.char, grade: "PSA 7", cert: "CERT-BBB", offered: true } });
  k.pc = await ok("casey", "addCollectorCopy", { copy: { canonicalCardId: cards.char, grade: "PSA 10", cert: "CERT-KEEP", keeping: true } });
  k.blas = await ok("casey", "addCollectorCopy", { copy: { canonicalCardId: cards.blas, grade: "Raw", condition: "Near Mint", offered: true } });
  k.jordan = await ok("jordan", "addCollectorCopy", { copy: { canonicalCardId: cards.pika, grade: "PSA 8", cert: "JORDAN-1", offered: true } });
  /* Two deals at an agreed price: Casey's Mudkip with Northline, her Pikachu
     with Silver Vale. Each now in Select Trade, on the shop's move. */
  const g1 = await ok("casey", "addGoal", { canonicalCardId: cards.mud, tier: "primary", desired: { grade: "PSA 9" } });
  const g2 = await ok("casey", "addGoal", { canonicalCardId: cards.pika, tier: "primary", desired: { grade: "PSA 9" } });
  const i1 = await ok("north", "addInventoryCopy", { copy: { canonicalCardId: cards.mud, grade: "PSA 9", ask: 300 } });
  const i2 = await ok("silver", "addInventoryCopy", { copy: { canonicalCardId: cards.pika, grade: "PSA 9", ask: 200 } });
  const nl = await ok("casey", "startOpportunity", { goalId: g1, invId: i1, amount: 300 });
  await ok("north", "acceptPrice", { oppId: nl });
  const sv = await ok("casey", "startOpportunity", { goalId: g2, invId: i2, amount: 200 });
  await ok("silver", "acceptPrice", { oppId: sv });
  const ctx = { app, repository, catalog, cards, k, nl, sv, post, ok, runtime };
  ctx.deal = async (id) => (await repository.loadWorld()).opportunities.find((o) => o.id === id);
  ctx.version = async () => repository.withTransaction((tx) => repository.readVersion(tx));
  ctx.valid = async () => { const v = W.validateWorld(await repository.loadWorld()); assert(v.ok, json(v.errors.slice(0, 3))); };
  return ctx;
}

/* ------------------------------------------------------------- A SEAT */
const settle = async () => { for (let i = 0; i < 5; i += 1) await TR.act(async () => {}); };
/* A seat: the production app over the real API client and store, bound
   exactly as client/sign-in/SignIn.jsx binds it. `lose` makes the NEXT
   command's answer go missing after the server has acted on it. */
async function seat(ctx, token) {
  const posts = [];
  const base = fetchFor(ctx.app);
  const s = { posts, lose: null };
  const fetchImpl = async (url, init = {}) => {
    const isCommand = (init.method || "GET") === "POST" && /\/api\/commands$/.test(String(url));
    if (isCommand) posts.push(JSON.parse(init.body).command);
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
    /* M3B B3: Value Trade's five, bound as SignIn binds them. */
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
  return s;
}

/* ------------------------------------------------------------- READING */
const textOf = (node) => {
  if (typeof node === "string") return node;
  if (!node || !node.children || node.type === "style") return "";
  return node.children.map(textOf).join(" ");
};
const flat = (node) => textOf(node).replace(/\s+/g, " ").trim();
const buttons = (root) => root.findAll((n) => n.type === "button");
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
/* The shop's Select Trade panel for one deal, inside its Opportunity record. */
const shopPanel = (s, oppId) => s.root().findAll((n) => n.type === "section" && n.props["data-select"] === oppId
  && String(n.props.className).includes("tps-sel"))[0] || null;
/* M3B B3: once the cards are held, the shop's Opportunity shows Value Trade
   in their place — its own section, `data-value`. */
const valuePanel = (s, oppId) => s.root().findAll((n) => n.type === "section" && n.props["data-value"] === oppId)[0] || null;
const copyIn = (root, id) => (root ? root.findAll((n) => n.type === "li" && n.props["data-copy"] === id)[0] || null : null);
const rowIn = (root, id) => (root ? root.findAll((n) => n.type === "li" && n.props["data-row"] === id)[0] || null : null);
const listIn = (root, aria) => (root ? root.findAll((n) => n.type === "ul" && n.props["aria-label"] === aria)[0] || null : null);
const idsIn = (ul) => (ul ? ul.findAll((n) => n.type === "li" && n.props["data-copy"]).map((n) => n.props["data-copy"]) : []);
/* The Collector's Deal Workspace for one deal, opened from its Deal Flow card. */
async function collectorDeal(s, oppId) {
  const here = s.root().findAll((n) => n.type === "div" && n.props.className === "mcs-ws" && n.props["data-opp"] === oppId)[0];
  if (here) return here;
  const back = s.root().findAll((n) => n.type === "button" && n.props.className === "mcs-ws-back")[0];
  if (back) { await TR.act(async () => { back.props.onClick(); }); await settle(); }
  if (!s.root().findAll((n) => n.type === "div" && n.props.className === "mcs-dg-deal").length) await go(s, "Deal Flow");
  const card = s.root().findAll((n) => n.type === "div" && n.props.className === "mcs-dg-deal" && n.props["data-opp"] === oppId)[0];
  assert(card, "no Deal Flow card for " + oppId);
  const cta = card.findAll((n) => n.type === "button" && String(n.props.className || "").includes("mcs-dg-cta"))[0];
  await TR.act(async () => { cta.props.onClick(); }); await settle();
  return s.root().findAll((n) => n.type === "div" && n.props.className === "mcs-ws" && n.props["data-opp"] === oppId)[0];
}
const collectorArea = async (s, oppId) => {
  const ws = await collectorDeal(s, oppId);
  return ws.findAll((n) => n.type === "section" && n.props["data-select"] === oppId)[0] || null;
};
const liveIds = (deal) => D.TRADE.liveTradeRows(deal).map((r) => r.binderId).sort();

/* The shop's first choice, gathered on screen and sent once. */
async function shopSends(north, oppId, copyIds) {
  for (const id of copyIds) await press(copyIn(listIn(shopPanel(north, oppId), "Casey Lin's Trade/Sell cards"), id), "Choose");
  await press(shopPanel(north, oppId), "Send");
}

/* ======================================================================= A */
describe("A. The Collector offers; the shop sees it, chooses it, and both see the same deal", () => {
  test("first choice is gathered on screen — Not sent yet, no command — then sent as ONE command", async () => {
    const ctx = await world();
    const north = await seat(ctx, "north");
    await go(north, "Opportunities");
    const panel = shopPanel(north, ctx.nl);
    assert(panel, "no Select Trade in the Opportunity: " + flat(north.root()).slice(0, 400));
    /* Ready to coordinate says what is waiting: a choice of cards, not an offer. */
    const note = north.root().findAll((n) => n.props && n.props.className === "tps-note").map(flat);
    assert(note.includes("1 deal to choose cards for") && !note.some((t) => /offer/.test(t)), json(note));
    assert(/Choose the cards you'd consider from Casey Lin's Trade\/Sell cards/.test(flat(panel)), flat(panel));
    /* What may be chosen is exactly the projection's choosable copies. */
    eq(json(idsIn(listIn(panel, "Casey Lin's Trade/Sell cards")).sort()), json([ctx.k.a, ctx.k.b, ctx.k.blas].sort()),
      "Casey's Trade/Sell copies — not the PC copy, not Jordan's");
    await press(copyIn(panel, ctx.k.a), "Choose");
    await press(copyIn(shopPanel(north, ctx.nl), ctx.k.blas), "Choose");
    const p2 = shopPanel(north, ctx.nl);
    assert(/2 cards chosen · Not sent yet/.test(flat(p2)), flat(p2));
    eq(north.posts.length, 0, "a choice sent a command");
    eq(liveIds(await ctx.deal(ctx.nl)).length, 0, "the server heard about an unsent choice");
    await press(p2, "Send 2 cards to Casey Lin");
    eq(json(north.posts), json(["selectTradeCards"]), "one command");
    const d = await ctx.deal(ctx.nl);
    eq(json(liveIds(d)), json([ctx.k.a, ctx.k.blas].sort()), "the exact copies");
    eq(D.nextActor(d).reason, "more-cards", "the Collector's look");
    for (const id of [ctx.k.a, ctx.k.blas]) eq(D.collectorCopyStatus(id, (await ctx.repository.loadWorld()).opportunities), "selected", "selected, not held");
    const after = shopPanel(north, ctx.nl);
    assert(/Waiting for Casey Lin to add cards or say they're ready/.test(flat(after)), flat(after));
    assert(/Sent 2 cards to Casey Lin\./.test(flat(after)), "the server-confirmed answer: " + flat(after));
    eq(idsIn(listIn(after, "Chosen for this deal")).sort().join(), [ctx.k.a, ctx.k.blas].sort().join(), "chosen, from the server");
    assert(!button(after, "Remove") && !button(after, "Start valuing"), "a control on the Collector's turn");
    await ctx.valid();
  });
  test("the Collector sees the exact copies chosen, whose turn it is, and what to do", async () => {
    const ctx = await world();
    /* Before the shop has sent anything it is the shop's move: Casey may hold, never "ready". */
    const early = await seat(ctx, "casey");
    const before = await collectorArea(early, ctx.nl);
    assert(!button(before, "I'm ready") && button(before, "Hold on, I'm adding cards"), buttons(before).map(label).join("|"));
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    await shopSends(north, ctx.nl, [ctx.k.a]);
    const casey = await seat(ctx, "casey");
    const area = await collectorArea(casey, ctx.nl);
    const t = flat(area);
    assert(/Northline chose a card to consider\. Add more Trade\/Sell cards, or tell Northline you're ready\./.test(t), t);
    eq(idsIn(listIn(area, "Chosen by Northline")).join(), ctx.k.a, "the exact copy");
    assert(/Charizard/.test(t) && /PSA 9/.test(t) && /Cert CERT-AAA/.test(t), "identity: " + t);
    assert(button(area, "I'm ready — they can finish choosing") && button(area, "Hold on, I'm adding cards")
      && button(area, "Take out of this deal"), buttons(area).map(label).join("|"));
    /* Deal Flow says it at a glance. */
    await TR.act(async () => { casey.root().findAll((n) => n.type === "button" && n.props.className === "mcs-ws-back")[0].props.onClick(); });
    await settle();
    const card = casey.root().findAll((n) => n.type === "div" && n.props.className === "mcs-dg-deal" && n.props["data-opp"] === ctx.nl)[0];
    assert(/Your turn · Northline chose cards/.test(flat(card)), flat(card));
  });
  test("choosing is not holding: another shop still sees the copy as free, unchanged, with no word of the first", async () => {
    const ctx = await world();
    const silver = await seat(ctx, "silver"); await go(silver, "Opportunities");
    const before = flat(shopPanel(silver, ctx.sv));
    const beforeCopies = json(P.projectForActor(await ctx.repository.loadWorld(), { partnerId: "p2" }).collectorCopies);
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    await shopSends(north, ctx.nl, [ctx.k.a]);
    await silver.refresh();
    eq(flat(shopPanel(silver, ctx.sv)), before, "Silver Vale's screen moved because Northline chose a card");
    eq(json(P.projectForActor(await ctx.repository.loadWorld(), { partnerId: "p2" }).collectorCopies), beforeCopies, "or its projection");
  });
});

/* ======================================================================= B */
describe("B. Two copies of one printing stay two copies", () => {
  test("each row is its own copy id, with its own grade, certificate and photos", async () => {
    const ctx = await world();
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    const pick = listIn(shopPanel(north, ctx.nl), "Casey Lin's Trade/Sell cards");
    const a = flat(copyIn(pick, ctx.k.a)); const b = flat(copyIn(pick, ctx.k.b));
    /* (The picture's placeholder names the card too — CardArt's plate.) */
    for (const t of [a, b]) assert(/Charizard Base Set · #4 · Holo · First Edition/.test(t), t);
    assert(/PSA 9 · Cert CERT-AAA · Photos: front and back/.test(a) && !/CERT-BBB|PSA 7/.test(a), a);
    assert(/PSA 7 · Cert CERT-BBB/.test(b) && !/CERT-AAA|PSA 9|Photos/.test(b), b);
    await shopSends(north, ctx.nl, [ctx.k.a, ctx.k.b]);
    const d = await ctx.deal(ctx.nl);
    const rows = D.TRADE.liveTradeRows(d);
    eq(rows.length, 2, "two rows");
    eq(new Set(rows.map((r) => r.id)).size, 2, "two row ids");
    eq(json(rows.map((r) => [r.binderId, r.grade, r.cert]).sort()), json([[ctx.k.a, "PSA 9", "CERT-AAA"], [ctx.k.b, "PSA 7", "CERT-BBB"]].sort()),
      "each row snapshots its own copy");
  });
});

/* ===================================================================== C+D */
async function toClosing(ctx, ids = [ctx.k.a, ctx.k.b]) {
  const north = await seat(ctx, "north"); await go(north, "Opportunities");
  await shopSends(north, ctx.nl, ids);
  const casey = await seat(ctx, "casey");
  await press(await collectorArea(casey, ctx.nl), "I'm ready — they can finish choosing");
  await north.refresh();
  return { north, casey };
}
describe("C. Removing one card changes only that card in that deal", () => {
  test("after the Collector is ready the shop may remove a card; the row stays as history", async () => {
    const ctx = await world();
    const { north, casey } = await toClosing(ctx);
    eq(json(casey.posts), json(["continueTradeSelection"]));
    const panel = shopPanel(north, ctx.nl);
    assert(/Casey Lin is ready\. Add or remove cards, then start valuing\./.test(flat(panel)), flat(panel));
    /* …and once Casey has said so, it is the shop's move again: no second "ready". */
    const area = await collectorArea(casey, ctx.nl);
    assert(/Northline is finishing their choice\./.test(flat(area)) && !button(area, "I'm ready"), flat(area));
    const rowB = D.TRADE.liveTradeRows(await ctx.deal(ctx.nl)).find((r) => r.binderId === ctx.k.b).id;
    await press(rowIn(panel, rowB), "Remove");
    const d = await ctx.deal(ctx.nl);
    eq(json(liveIds(d)), json([ctx.k.a]), "only k.b left the deal");
    eq(d.trade.cards.find((r) => r.id === rowB).inclusion, "rejected", "kept as history");
    eq(D.collectorCopyStatus(ctx.k.b, (await ctx.repository.loadWorld()).opportunities), "available", "and it is free again");
    assert(/Removed from this deal\./.test(flat(shopPanel(north, ctx.nl))));
  });
});
describe("D. Starting valuation: a confirmation, then every card held at once, then an honest stop", () => {
  test("Start valuing asks first; Not yet sends nothing; confirming holds both and moves to Value Trade", async () => {
    const ctx = await world();
    const { north, casey } = await toClosing(ctx);
    const before = north.posts.length;
    await press(shopPanel(north, ctx.nl), "Start valuing 2 cards");
    const confirm = shopPanel(north, ctx.nl);
    assert(/Start valuing these 2 cards\? They'll be held for this deal and can't be chosen in another one\. Casey Lin can still take a card out\./.test(flat(confirm)), flat(confirm));
    eq(north.posts.length, before, "asking sent something");
    await press(confirm, "Not yet");
    eq((await ctx.deal(ctx.nl)).stage, "select-trade", "Not yet did something");
    await press(shopPanel(north, ctx.nl), "Start valuing 2 cards");
    await press(shopPanel(north, ctx.nl), "Start valuing");
    eq(north.posts.slice(-1)[0], "closeTradeSelection");
    const d = await ctx.deal(ctx.nl);
    eq(d.stage, "value-trade", "Value Trade");
    const w = await ctx.repository.loadWorld();
    for (const id of [ctx.k.a, ctx.k.b]) eq(D.collectorCopyStatus(id, w.opportunities), "reserved", "held");
    /* M3B B3 restates this stop: the shop's Opportunity now shows Value Trade.
       The Collector opens every market value, so the shop's first screen is
       a wait — no accept, counter or % control — but it may decline a card. */
    eq(shopPanel(north, ctx.nl), null, "Select Trade is still drawn for a deal in Value Trade");
    const after = valuePanel(north, ctx.nl);
    assert(/Waiting for Casey Lin — 2 cards waiting on Casey Lin\./.test(flat(after)), flat(after));
    assert(/These cards are now held for this deal\./.test(flat(after)), "success said only after the server: " + flat(after));
    eq(json(buttons(after).map(label)), json(["Decline this card", "Decline this card"]), "a control on the Collector's move");
    const rec = north.root().findAll((n) => n.type === "article" && n.findAll((m) => m === after).length)[0];
    assert(/Value Trade/.test(flat(rec)) && /Waiting for Casey Lin/.test(flat(rec)) && !/Your move/.test(flat(rec)), flat(rec).slice(0, 300));
    await casey.refresh();
    const area = await collectorArea(casey, ctx.nl);
    assert(/These cards are held for this deal\. Value Trade isn't available in MetYet yet\./.test(flat(area)), flat(area));
    eq(buttons(area).length, 0, "a Collector control in Value Trade");
    /* Silver Vale no longer sees either card as something to choose. */
    const silver = await seat(ctx, "silver"); await go(silver, "Opportunities");
    eq(json(idsIn(listIn(shopPanel(silver, ctx.sv), "Casey Lin's Trade/Sell cards"))), json([ctx.k.blas]), "held cards leave other shops' choice");
    await ctx.valid();
  });
});

/* ======================================================================= E */
describe("E. Hold on, add a card, then finish — as often as the Collector needs", () => {
  test("hold → the shop waits → a new Trade/Sell copy → ready → the shop adds it at once and closes", async () => {
    const ctx = await world();
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    await shopSends(north, ctx.nl, [ctx.k.a]);
    const casey = await seat(ctx, "casey");
    await press(await collectorArea(casey, ctx.nl), "Hold on, I'm adding cards");
    eq(json(casey.posts), json(["holdTradeSelection"]));
    const area = await collectorArea(casey, ctx.nl);
    assert(/You're adding cards\. Mark cards Trade \/ Sell in your Binders, then tell Northline you're ready\./.test(flat(area)), flat(area));
    await north.refresh();
    assert(/Casey Lin is adding cards/.test(flat(shopPanel(north, ctx.nl))));
    /* The Collector adds a card the only way there is: offering a copy. */
    await ctx.ok("casey", "changeCollectingState", { collectorCopyId: ctx.k.pc, from: "pc", to: "trade" });
    await casey.refresh();
    await press(await collectorArea(casey, ctx.nl), "I'm ready — they can finish choosing");
    await north.refresh();
    await press(copyIn(listIn(shopPanel(north, ctx.nl), "Casey Lin's Trade/Sell cards"), ctx.k.pc), "Add to this deal");
    eq(north.posts.slice(-1)[0], "selectTradeCards");
    eq(D.nextActor(await ctx.deal(ctx.nl)).reason, "close-selection", "adding after ready is not a second send");
    eq(json(liveIds(await ctx.deal(ctx.nl))), json([ctx.k.a, ctx.k.pc].sort()));
    await press(shopPanel(north, ctx.nl), "Start valuing 2 cards");
    await press(shopPanel(north, ctx.nl), "Start valuing");
    eq((await ctx.deal(ctx.nl)).stage, "value-trade");
  });
  test("with nothing chosen the shop asks for more cards — never an empty close", async () => {
    const ctx = await world();
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    await press(shopPanel(north, ctx.nl), "Ask Casey Lin for more cards");
    const d = await ctx.deal(ctx.nl);
    eq(liveIds(d).length, 0); eq(D.nextActor(d).reason, "more-cards", "the Collector's look");
    const casey = await seat(ctx, "casey");
    assert(/Northline asked if you have more cards to trade/.test(flat(await collectorArea(casey, ctx.nl))));
    await press(await collectorArea(casey, ctx.nl), "I'm ready — they can finish choosing");
    await north.refresh();
    const p = shopPanel(north, ctx.nl);
    assert(!button(p, "Start valuing"), "an empty close is offered");
    assert(/Add a card to continue/.test(flat(p)), flat(p));
    assert(!EXPOSED_COMMANDS.includes("chooseCashOnly"), "cash-only");
  });
});

/* ======================================================================= F */
describe("F. Leaving and coming back shows exactly where the deal stands", () => {
  test("a fresh seat at every turn: the same words, the same rows, the same one next action", async () => {
    const ctx = await world();
    const fresh = async (who) => { const s = await seat(ctx, who); if (who === "north") await go(s, "Opportunities"); return s; };
    let n = await fresh("north");
    assert(/Choose the cards/.test(flat(shopPanel(n, ctx.nl))) && button(shopPanel(n, ctx.nl), "Ask Casey Lin for more cards"));
    /* An unsent choice is lost with the page, as approved (D4) — and says so while it exists. */
    await press(copyIn(shopPanel(n, ctx.nl), ctx.k.a), "Choose");
    n = await fresh("north");
    assert(!/Not sent yet/.test(flat(shopPanel(n, ctx.nl))), "an unsent choice survived a reload");
    await shopSends(n, ctx.nl, [ctx.k.a]);
    n = await fresh("north");
    assert(/Waiting for Casey Lin/.test(flat(shopPanel(n, ctx.nl))) && idsIn(listIn(shopPanel(n, ctx.nl), "Chosen for this deal")).join() === ctx.k.a);
    let c = await fresh("casey");
    assert(button(await collectorArea(c, ctx.nl), "I'm ready — they can finish choosing"));
    await press(await collectorArea(c, ctx.nl), "Hold on, I'm adding cards");
    c = await fresh("casey");
    assert(/You're adding cards/.test(flat(await collectorArea(c, ctx.nl))));
    await press(await collectorArea(c, ctx.nl), "I'm ready — they can finish choosing");
    n = await fresh("north");
    assert(button(shopPanel(n, ctx.nl), "Start valuing 1 card"), flat(shopPanel(n, ctx.nl)));
    await press(shopPanel(n, ctx.nl), "Start valuing 1 card"); await press(shopPanel(n, ctx.nl), "Start valuing");
    n = await fresh("north"); c = await fresh("casey");
    /* M3B B3: the shop's side is Value Trade now; the Collector's is still
       the held-cards stop until B4. */
    assert(/Waiting for Casey Lin to propose one/.test(flat(valuePanel(n, ctx.nl))) && /held for this deal/.test(flat(await collectorArea(c, ctx.nl))));
  });
});

/* ======================================================================= G */
describe("G. Two shops, one card: both may choose it; the first to start valuing holds it", () => {
  test("the second close is refused, names its own row, changes nothing, and recovers by removing it", async () => {
    const ctx = await world();
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    const silver = await seat(ctx, "silver"); await go(silver, "Opportunities");
    await shopSends(north, ctx.nl, [ctx.k.a, ctx.k.b]);
    await press(copyIn(listIn(shopPanel(silver, ctx.sv), "Casey Lin's Trade/Sell cards"), ctx.k.a), "Choose");
    await press(shopPanel(silver, ctx.sv), "Send");
    const casey = await seat(ctx, "casey");
    await press(await collectorArea(casey, ctx.nl), "I'm ready — they can finish choosing");
    await press(await collectorArea(casey, ctx.sv), "I'm ready — they can finish choosing");
    await north.refresh(); await silver.refresh();
    /* Both shops now hold the same card as chosen, and neither screen says so. */
    assert(!/Silver|Vale/.test(flat(shopPanel(north, ctx.nl))) && !/Northline/.test(flat(shopPanel(silver, ctx.sv))), "a rival named");
    await press(shopPanel(silver, ctx.sv), "Start valuing 1 card"); await press(shopPanel(silver, ctx.sv), "Start valuing");
    eq((await ctx.deal(ctx.sv)).stage, "value-trade", "Silver Vale holds it");
    const before = json(await ctx.deal(ctx.nl));
    const v0 = await ctx.version();
    /* Northline's screen is a step behind: it has not re-read since. */
    await press(shopPanel(north, ctx.nl), "Start valuing 2 cards"); await press(shopPanel(north, ctx.nl), "Start valuing");
    eq(json(await ctx.deal(ctx.nl)), before, "a refused close wrote something");
    eq(await ctx.version(), v0, "the world moved");
    const p = shopPanel(north, ctx.nl);
    assert(/A card you chose isn't available for this deal any more\. It's marked below — remove it to continue\./.test(flat(p)), flat(p));
    const rowA = D.TRADE.liveTradeRows(await ctx.deal(ctx.nl)).find((r) => r.binderId === ctx.k.a).id;
    const rowB = D.TRADE.liveTradeRows(await ctx.deal(ctx.nl)).find((r) => r.binderId === ctx.k.b).id;
    assert(/No longer available — remove it to continue/.test(flat(rowIn(p, rowA))), flat(rowIn(p, rowA)));
    assert(!/No longer available/.test(flat(rowIn(p, rowB))), "the free card was marked too");
    assert(!/Silver|Vale|reserved|value-trade/i.test(flat(p)), "the rival is named: " + flat(p));
    await press(rowIn(p, rowA), "Remove");
    eq(P.projectForActor(await ctx.repository.loadWorld(), { partnerId: "p1" }).collectorCopies.find((b) => b.id === ctx.k.a).status,
      "unavailable", "the projection's word for it now");
    assert(!idsIn(listIn(shopPanel(north, ctx.nl), "Casey Lin's Trade/Sell cards")).includes(ctx.k.a), "a held card is offered to choose again");
    await press(shopPanel(north, ctx.nl), "Start valuing 1 card"); await press(shopPanel(north, ctx.nl), "Start valuing");
    eq((await ctx.deal(ctx.nl)).stage, "value-trade", "recovered");
    eq(json(liveIds(await ctx.deal(ctx.nl))), json([ctx.k.b]));
    await ctx.valid();
  });
});

describe("G2. One shop, two of its own deals with the same Collector", () => {
  test("a copy chosen in one deal may be chosen in the other; once one deal holds it, the other cannot", async () => {
    const ctx = await world();
    /* A second Northline deal with Casey, through production's doors. */
    const g3 = await ctx.ok("casey", "addGoal", { canonicalCardId: ctx.cards.ven, tier: "primary", desired: { grade: "PSA 9" } });
    const i3 = await ctx.ok("north", "addInventoryCopy", { copy: { canonicalCardId: ctx.cards.ven, grade: "PSA 9", ask: 150 } });
    const nl2 = await ctx.ok("casey", "startOpportunity", { goalId: g3, invId: i3, amount: 150 });
    await ctx.ok("north", "acceptPrice", { oppId: nl2 });
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    await shopSends(north, ctx.nl, [ctx.k.a]);
    eq(P.projectForActor(await ctx.repository.loadWorld(), { partnerId: "p1" }).collectorCopies.find((b) => b.id === ctx.k.a).status,
      "selected", "the projection's word: chosen in a deal of Northline's");
    const other = listIn(shopPanel(north, nl2), "Casey Lin's Trade/Sell cards");
    assert(idsIn(other).includes(ctx.k.a), "choosing is not holding — the other deal may choose it too");
    assert(/Also chosen in another of your deals/.test(flat(copyIn(other, ctx.k.a))), flat(copyIn(other, ctx.k.a)));
    await ctx.ok("casey", "continueTradeSelection", { oppId: ctx.nl });
    await ctx.ok("north", "closeTradeSelection", { oppId: ctx.nl });
    await north.refresh();
    eq(P.projectForActor(await ctx.repository.loadWorld(), { partnerId: "p1" }).collectorCopies.find((b) => b.id === ctx.k.a).status,
      "reserved", "held by the first deal");
    assert(!idsIn(listIn(shopPanel(north, nl2), "Casey Lin's Trade/Sell cards")).includes(ctx.k.a), "a held card is offered to the other deal");
  });
});

/* ======================================================================= H */
describe("H. One shop, two sessions: the stale one is told, never obeyed", () => {
  test("tab 2 removes a card; tab 1 starts valuing what it showed → terms-changed, nothing held", async () => {
    const ctx = await world();
    const { north } = await toClosing(ctx);
    const tab = await seat(ctx, "north"); await go(tab, "Opportunities");
    const rowB = D.TRADE.liveTradeRows(await ctx.deal(ctx.nl)).find((r) => r.binderId === ctx.k.b).id;
    await press(rowIn(shopPanel(tab, ctx.nl), rowB), "Remove");
    await press(shopPanel(north, ctx.nl), "Start valuing 2 cards"); await press(shopPanel(north, ctx.nl), "Start valuing");
    const d = await ctx.deal(ctx.nl);
    eq(d.stage, "select-trade", "a stale screen held cards");
    eq(D.collectorCopyStatus(ctx.k.a, (await ctx.repository.loadWorld()).opportunities), "selected", "nothing held");
    const p = shopPanel(north, ctx.nl);
    assert(/This deal changed since you looked\. The latest is shown — check the cards and try again\./.test(flat(p)), flat(p));
    eq(idsIn(listIn(p, "Chosen for this deal")).join(), ctx.k.a, "and the screen caught up");
  });
  test("a card already chosen in another tab is refused as already in the deal, and the screen catches up", async () => {
    const ctx = await world();
    const { north } = await toClosing(ctx, [ctx.k.a]);
    const tab = await seat(ctx, "north"); await go(tab, "Opportunities");
    await press(copyIn(listIn(shopPanel(tab, ctx.nl), "Casey Lin's Trade/Sell cards"), ctx.k.blas), "Add to this deal");
    await press(copyIn(listIn(shopPanel(north, ctx.nl), "Casey Lin's Trade/Sell cards"), ctx.k.blas), "Add to this deal");
    eq(liveIds(await ctx.deal(ctx.nl)).filter((id) => id === ctx.k.blas).length, 1, "chosen twice");
    assert(/That card is already in this deal\./.test(flat(shopPanel(north, ctx.nl))), flat(shopPanel(north, ctx.nl)));
  });
});

/* ======================================================================= I */
describe("I. A chosen or held copy stays Trade/Sell", () => {
  test("switching to PC while chosen, then while held, is refused, and the Collector's words say why", async () => {
    const ctx = await world();
    await toClosing(ctx, [ctx.k.a]);
    for (const [cmd, payload] of [["setCollectorCopyKept", { copyId: ctx.k.a, keeping: true }],
      ["changeCollectingState", { collectorCopyId: ctx.k.a, from: "trade", to: "pc" }]]) {
      const r = await ctx.post("casey", cmd, payload);
      eq([r.status, r.body.error.refused].join(), "409,copy-in-deal", cmd + " while chosen");
    }
    const n = await seat(ctx, "north"); await go(n, "Opportunities");
    await press(shopPanel(n, ctx.nl), "Start valuing 1 card"); await press(shopPanel(n, ctx.nl), "Start valuing");
    const r = await ctx.post("casey", "changeCollectingState", { collectorCopyId: ctx.k.a, from: "trade", to: "pc" });
    assert(r.status === 409 && ["copy-in-deal", "copy-reserved"].includes(r.body.error.refused), json(r.body));
    eq((await ctx.repository.loadWorld()).collectorCopies.find((b) => b.id === ctx.k.a).offered, true, "still Trade/Sell");
    assert(/"copy-in-deal": "A Trusted Partner has chosen this copy for a deal/.test(read("client/collector/CardEdit.jsx")), "CardEdit says it");
    assert(/"copy-in-deal": "A Trusted Partner has chosen that copy for a deal/.test(read("client/collector/CardSpecification.jsx")), "and so does a correction");
  });
});

/* ======================================================================= J */
describe("J. Forged and unauthorized requests are refused at the production door, and change nothing", () => {
  test("wrong seat, wrong shop, someone else's copy, a kept copy, made-up ids", async () => {
    const ctx = await world();
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    await shopSends(north, ctx.nl, [ctx.k.a]);
    const row = D.TRADE.liveTradeRows(await ctx.deal(ctx.nl))[0].id;
    const v0 = await ctx.version();
    const cases = [
      ["casey", "selectTradeCards", { oppId: ctx.nl, copyIds: [ctx.k.b] }, ["not-owner"]],
      ["casey", "deselectTradeCard", { oppId: ctx.nl, tradeCardId: row }, ["not-owner"]],
      ["casey", "closeTradeSelection", { oppId: ctx.nl }, ["not-owner"]],
      ["north", "continueTradeSelection", { oppId: ctx.nl }, ["not-owner"]],
      ["north", "holdTradeSelection", { oppId: ctx.nl }, ["not-owner"]],
      ["north", "withdrawTradeCard", { oppId: ctx.nl, tradeCardId: row }, ["not-owner"]],
      ["silver", "selectTradeCards", { oppId: ctx.nl, copyIds: [ctx.k.b] }, ["not-participant"]],
      ["faraway", "selectTradeCards", { oppId: ctx.nl, copyIds: [ctx.k.b] }, ["not-participant"]],
      ["jordan", "withdrawTradeCard", { oppId: ctx.nl, tradeCardId: row }, ["not-participant"]],
      ["north", "selectTradeCards", { oppId: "opp-made-up", copyIds: [ctx.k.b] }, ["not-found"]],
      ["north", "deselectTradeCard", { oppId: ctx.nl, tradeCardId: "tc-made-up" }, ["not-found", "not-your-turn"]],
    ];
    for (const [who, cmd, payload, codes] of cases) {
      const r = await ctx.post(who, cmd, payload);
      eq(r.status, 409, `${who} ${cmd}`);
      assert(codes.includes(r.body.error.refused), `${who} ${cmd}: ${r.body.error.refused}`);
      eq(json(Object.keys(r.body).sort()), json(["error", "version"]), `${who} ${cmd} said more than its refusal: ${json(r.body)}`);
    }
    eq(await ctx.version(), v0, "a refused request moved the world");
    /* On the shop's own turn, a copy it may not have is one public answer. */
    const casey = await seat(ctx, "casey");
    await press(await collectorArea(casey, ctx.nl), "I'm ready — they can finish choosing");
    const v1 = await ctx.version();
    for (const [ids, codes] of [[[ctx.k.jordan], ["not-found"]], [["b-made-up"], ["not-found"]], [[ctx.k.pc], ["copy-unavailable"]]]) {
      const r = await ctx.post("north", "selectTradeCards", { oppId: ctx.nl, copyIds: ids });
      assert(r.status === 409 && codes.includes(r.body.error.refused), `${ids}: ${json(r.body)}`);
    }
    eq(await ctx.version(), v1, "a refused choice moved the world");
    /* An authority field in the payload is refused before any of this. */
    const forged = await ctx.post("north", "selectTradeCards", { oppId: ctx.nl, copyIds: [ctx.k.b], actor: { partnerId: "p2" } });
    eq(forged.status, 400, "an actor in the payload");
  });
});

/* ======================================================================= K */
describe("K. A relationship that ends stops the choosing", () => {
  test("the shop can no longer choose or start valuing, and is told why; the Collector's copies leave its view", async () => {
    const ctx = await world();
    const { north } = await toClosing(ctx, [ctx.k.a]);
    const w = await ctx.repository.loadWorld();
    await ctx.repository.saveWorld({ ...w, relationships: w.relationships.map((r) => (r.partnerId === "p1" && r.collectorId === "c1"
      ? { ...r, status: "ended" } : r)) });
    const r1 = await ctx.post("north", "selectTradeCards", { oppId: ctx.nl, copyIds: [ctx.k.b] });
    eq(r1.body.error && r1.body.error.refused, "no-relationship", "choose");
    const r2 = await ctx.post("north", "closeTradeSelection", { oppId: ctx.nl });
    eq(r2.body.error && r2.body.error.refused, "no-relationship", "close");
    await press(shopPanel(north, ctx.nl), "Start valuing 1 card"); await press(shopPanel(north, ctx.nl), "Start valuing");
    assert(/no longer connected with/.test(flat(north.root())), flat(north.root()).slice(0, 600));
    const view = P.projectForActor(await ctx.repository.loadWorld(), { partnerId: "p1" });
    assert(!view.collectors.some((c) => c.id === "c1"), "Casey is still in Northline's network");
    assert(!view.collectorCopies.some((b) => [ctx.k.b, ctx.k.blas, ctx.k.pc].includes(b.id)), "her other copies are still visible");
  });
});

/* ======================================================================= L */
describe("L. A card that becomes unavailable after it was chosen is seen before anything is pressed", () => {
  test("held by another shop: the row is marked from the projection; the close is refused with that row named", async () => {
    const ctx = await world();
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    await shopSends(north, ctx.nl, [ctx.k.a]);
    await ctx.ok("silver", "selectTradeCards", { oppId: ctx.sv, copyIds: [ctx.k.a] });
    await ctx.ok("casey", "continueTradeSelection", { oppId: ctx.sv });
    await ctx.ok("silver", "closeTradeSelection", { oppId: ctx.sv });
    await ctx.ok("casey", "continueTradeSelection", { oppId: ctx.nl });
    await north.refresh();
    const rowA = D.TRADE.liveTradeRows(await ctx.deal(ctx.nl))[0].id;
    assert(/No longer available — remove it to continue/.test(flat(rowIn(shopPanel(north, ctx.nl), rowA))), "not marked before pressing");
    const r = await ctx.post("north", "closeTradeSelection", { oppId: ctx.nl, expect: { tradeCardIds: [rowA] } });
    eq(json([r.status, r.body.error.refused, r.body.detail]), json([409, "copy-unavailable", { tradeCardIds: [rowA] }]), "the refusal names the row");
  });
});

/* ======================================================================= M */
describe("M. A lost answer is never reported as success or failure", () => {
  test("send: the server acted, the answer was lost — the screen says it couldn't confirm, then shows the truth", async () => {
    const ctx = await world();
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    await press(copyIn(shopPanel(north, ctx.nl), ctx.k.a), "Choose");
    north.lose = "selectTradeCards";
    await press(shopPanel(north, ctx.nl), "Send 1 card to Casey Lin");
    const p = shopPanel(north, ctx.nl);
    assert(/MetYet couldn't confirm that just now\. Check the latest here before trying again\./.test(flat(p)), flat(p));
    assert(!/Sent 1 card/.test(flat(p)), "success claimed without an answer");
    eq(idsIn(listIn(p, "Chosen for this deal")).join(), ctx.k.a, "the re-read shows what the server did");
    eq(liveIds(await ctx.deal(ctx.nl)).length, 1, "and it happened once");
  });
  test("close: lost after it held the cards — no 'held' claimed until the re-read says so, nothing done twice", async () => {
    const ctx = await world();
    const { north } = await toClosing(ctx, [ctx.k.a]);
    north.lose = "closeTradeSelection";
    await press(shopPanel(north, ctx.nl), "Start valuing 1 card"); await press(shopPanel(north, ctx.nl), "Start valuing");
    /* M3B B3: the re-read shows the deal in Value Trade, and the lost answer
       is still said there rather than a success. */
    const p = valuePanel(north, ctx.nl);
    assert(p && /couldn't confirm/.test(flat(p)) && !/These cards are now held/.test(flat(p)), flat(p));
    assert(/Waiting for Casey Lin — 1 card waiting on Casey Lin\./.test(flat(p)), "the server's state after the re-read: " + flat(p));
    eq(north.posts.filter((c) => c === "closeTradeSelection").length, 1, "sent again by itself");
  });
});

/* ======================================================================= N */
describe("N. The Collector takes a card out; the shop may choose it again as a new row", () => {
  test("a confirmation first; the copy stays Trade/Sell; the shop's screen follows; re-choosing is a new row", async () => {
    const ctx = await world();
    const north = await seat(ctx, "north"); await go(north, "Opportunities");
    await shopSends(north, ctx.nl, [ctx.k.a, ctx.k.b]);
    const casey = await seat(ctx, "casey");
    const area = await collectorArea(casey, ctx.nl);
    const rowA = D.TRADE.liveTradeRows(await ctx.deal(ctx.nl)).find((r) => r.binderId === ctx.k.a).id;
    await press(rowIn(area, rowA), "Take out of this deal");
    const confirm = await collectorArea(casey, ctx.nl);
    assert(/Take Charizard out of this deal\? It stays in your Trade\/Sell cards — this only takes it out of this deal\./.test(flat(confirm)), flat(confirm));
    eq(casey.posts.length, 0, "asking sent something");
    await press(confirm, "Keep it in");
    eq(liveIds(await ctx.deal(ctx.nl)).length, 2);
    await press(rowIn(await collectorArea(casey, ctx.nl), rowA), "Take out of this deal");
    await press(await collectorArea(casey, ctx.nl), "Take it out");
    eq(json(casey.posts), json(["withdrawTradeCard"]));
    const d = await ctx.deal(ctx.nl);
    eq(json(liveIds(d)), json([ctx.k.b]), "only that card left");
    eq(d.trade.cards.find((r) => r.id === rowA).withdrawn, true, "kept as history");
    eq((await ctx.repository.loadWorld()).collectorCopies.find((b) => b.id === ctx.k.a).offered, true, "still Trade/Sell");
    assert(/Taken out of this deal: Charizard/.test(flat(await collectorArea(casey, ctx.nl))));
    await press(await collectorArea(casey, ctx.nl), "I'm ready — they can finish choosing");
    await north.refresh();
    eq(idsIn(listIn(shopPanel(north, ctx.nl), "Chosen for this deal")).join(), ctx.k.b, "the shop sees it gone");
    await press(copyIn(listIn(shopPanel(north, ctx.nl), "Casey Lin's Trade/Sell cards"), ctx.k.a), "Add to this deal");
    const again = (await ctx.deal(ctx.nl)).trade.cards.filter((r) => r.binderId === ctx.k.a);
    eq(again.length, 2, "a new row"); assert(again[0].id !== again[1].id);
  });
  test("taking a card out is offered on the Select Trade screen only; the domain's later permission is untouched", async () => {
    const ctx = await world();
    await toClosing(ctx, [ctx.k.a]);
    await ctx.ok("north", "closeTradeSelection", { oppId: ctx.nl });
    const casey = await seat(ctx, "casey");
    assert(!button(await collectorArea(casey, ctx.nl), "Take out of this deal"), "offered in Value Trade");
    const row = D.TRADE.liveTradeRows(await ctx.deal(ctx.nl))[0].id;
    eq((await ctx.post("casey", "withdrawTradeCard", { oppId: ctx.nl, tradeCardId: row })).status, 200,
      "the domain still permits it until final agreement (D3)");
    eq((await ctx.deal(ctx.nl)).stage, "select-trade", "and the last card leaving returns to Select Trade (A1)");
  });
});

/* ======================================================================= O */
describe("O. The door: exactly six more, and nothing past Select Trade", () => {
  const SIX = ["selectTradeCards", "deselectTradeCard", "closeTradeSelection", "holdTradeSelection", "continueTradeSelection", "withdrawTradeCard"];
  /* M3B B3 opened Value Trade's five with the shop's screen; they are
     milestone3b3-tp-value-trade.cjs's to pin. Everything later stays shut. */
  const SHUT = ["chooseCashOnly",
    "proposeFinalBalance", "acceptDeal", "proposeFulfillment", "confirmFulfillmentPlan", "confirmHandoff", "setInterest",
    "setCopyPending", "proposeTradeSelection", "reviewTradeCard"];
  test("the six are exposed and every later command is not", () => {
    for (const c of SIX) eq(isExposed(c), true, c);
    for (const c of SHUT) eq(isExposed(c), false, c);
    eq(EXPOSED_COMMANDS.length, 42, "37 at A3, plus Value Trade's five (M3B B3)");
  });
  test("over HTTP: each of the six reaches the domain; each shut one is command-unavailable before it", async () => {
    const ctx = await world();
    for (const c of SIX) {
      const r = await ctx.post(c.startsWith("hold") || c.startsWith("continue") || c.startsWith("withdraw") ? "casey" : "north", c, { oppId: "opp-made-up" });
      assert(!(r.body.error && r.body.error.refused === "command-unavailable"), `${c} is blocked`);
    }
    for (const c of SHUT) {
      const r = await ctx.post("north", c, { oppId: ctx.nl });
      eq([r.status, r.body.error.refused].join(), "409,command-unavailable", c);
    }
  });
  test("each seat's screen is handed only its own three", () => {
    const tp = code("client/tp/TrustedPartnerShell.jsx");
    /* M3B B3 hands the same section Value Trade's five after these three. */
    assert(/onSelectTrade, onDeselectTrade, onCloseSelection,\s*onProposeMarket, onAcceptMarket, onProposePercent, onAcceptPercent, onDeclineCard \}/.test(tp)
      && !/onHoldSelection|onReadyForSelection|onWithdrawTradeCard/.test(tp), "the shop's shell");
    const co = code("client/collector/CollectorShell.jsx");
    assert(/onHoldSelection=\{onHoldSelection\}/.test(co) && !/onSelectTrade|onDeselectTrade|onCloseSelection/.test(co), "the Collector's shell");
    assert(!/onSelectTrade|onDeselectTrade|onCloseSelection/.test(code("client/tp/sections/CollectorNetwork.jsx")),
      "the Collector Network can choose cards");
  });
  test("Select Trade reads the server's turn: no stage compared, no turn engine, rows only through one reader", () => {
    const src = code("client/select-trade.jsx");
    assert(!/stage\s*===|stage\s*!==|\.stage\b|nextActor|turnFor/.test(src), "Select Trade works out a lifecycle");
    const reader = "export const tradeRows = (deal) => list(deal && deal.trade && deal.trade.cards);";
    assert(src.includes(reader), "the one reader");
    assert(!/\.trade\b/.test(src.replace(reader, "")), "the rows are opened somewhere other than tradeRows");
    for (const f of ["client/tp/sections/Opportunities.jsx", "client/collector/DealWorkspace.jsx", "client/collector/deal-parts.jsx"]) {
      assert(!/\.trade\b|nextActor|collectorCopyStatus|EXCLUSIVE_COPY_STATES/.test(code(f)), `${f} reads rows or decides a status`);
    }
  });
});

/* ======================================================================= P */
describe("P. A refused close's detail survives every layer, and only it", () => {
  test("domain → transaction → HTTP → API client → store: the caller's own row ids, and nothing else", async () => {
    const ctx = await world();
    await ctx.ok("north", "selectTradeCards", { oppId: ctx.nl, copyIds: [ctx.k.a] });
    await ctx.ok("silver", "selectTradeCards", { oppId: ctx.sv, copyIds: [ctx.k.a] });
    await ctx.ok("casey", "continueTradeSelection", { oppId: ctx.sv });
    await ctx.ok("silver", "closeTradeSelection", { oppId: ctx.sv });
    await ctx.ok("casey", "continueTradeSelection", { oppId: ctx.nl });
    const rowA = D.TRADE.liveTradeRows(await ctx.deal(ctx.nl))[0].id;
    const want = json({ tradeCardIds: [rowA] });
    const tx = await executeCommand(ctx.repository, { actor: { partnerId: "p1" }, command: "closeTradeSelection", payload: { oppId: ctx.nl }, runtime: ctx.runtime });
    eq(json(tx.detail), want, "transaction");
    const http = await ctx.post("north", "closeTradeSelection", { oppId: ctx.nl });
    eq(json(http.body.detail), want, "HTTP");
    eq(json(Object.keys(http.body).sort()), json(["detail", "error", "version"]), "nothing else rode along");
    const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => "north", fetchImpl: fetchFor(ctx.app) });
    eq(json((await api.command("closeTradeSelection", { oppId: ctx.nl })).detail), want, "API client");
    const store = STORE.createProductionStore({ api }); await store.load();
    eq(json((await store.execute("closeTradeSelection", { oppId: ctx.nl })).detail), want, "store");
    /* Silver Vale's row ids never appear in Northline's answer. */
    const silverRows = (await ctx.deal(ctx.sv)).trade.cards.map((r) => r.id);
    assert(!silverRows.some((id) => http.body.detail.tradeCardIds.includes(id)), "a rival's row");
  });
  test("a refusal without detail is exactly as before, and a malformed detail is dropped by the client", async () => {
    const ctx = await world();
    const r = await ctx.post("north", "deselectTradeCard", { oppId: ctx.nl, tradeCardId: "nope" });
    eq(json(Object.keys(r.body).sort()), json(["error", "version"]));
    for (const bad of [{ tradeCardIds: "x" }, { tradeCardIds: [] }, { tradeCardIds: [1] }, { other: ["x"] }]) {
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => "north",
        fetchImpl: async () => ({ status: 409, ok: false, headers: { get: () => "application/json" },
          text: async () => json({ error: { code: "command_refused", refused: "copy-unavailable" }, version: 3, detail: bad }),
          json: async () => ({ error: { code: "command_refused", refused: "copy-unavailable" }, version: 3, detail: bad }) }) });
      const out = await api.command("closeTradeSelection", { oppId: "x" });
      eq(json(out), json({ ok: false, refused: "copy-unavailable", version: 3 }), json(bad));
    }
  });
});

run();
