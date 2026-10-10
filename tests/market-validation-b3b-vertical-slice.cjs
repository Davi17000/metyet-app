/* ============================================================================
   MARKET VALIDATION — BATCH 3B: THE VERTICAL SLICE
   A Collector makes a real offer from Deal Flow; the shop sees it, actionable,
   in Opportunities; both negotiate to agreement or end it — through the whole
   production path, and nothing in between is simulated:

     screen (ProductionApp → shell → section, rendered with react-test-renderer)
       → the client/commands.js factory, bound to the store exactly as SignIn
         binds it
       → the production store → the real API client → fetch
       → the real Fastify app (auth verifier, allow-list, catalog guard)
       → executeCommand → the domain → PGlite with every migration
       → the projection → back into the store → back onto the screen.

   The only stand-ins are the sign-in step (each seat gets a store directly
   rather than through SignIn's session plumbing) and `fetch`, which is
   Fastify's inject in fetch's shape (tests/helpers/command-server.cjs). A
   shop learns of a new offer when its screen reads the server again; the test
   does that with the store's own `load`, which is the product's refresh.

     A. open           the Collector's offer, from Deal Flow
     B. answer         the shop's Accept / Counter / Decline, from Opportunities
     C. back and forth counters, withdrawal, agreement, Firm on Price
     D. entry          whole dollars, whole percentages, said back, never fixed
     E. one offer      per exact card, across shops
     F. who sees what  authorization and privacy, on screen and over the wire
     G. stale, twice   concurrent changes, repeated presses
     H. the page       placement, responsive styles, the rest of Deal Flow
     I. the door       client-command / allow-list parity
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
const json = (v) => JSON.stringify(v);
const h = React.createElement;

/* ------------------------------------------------------------- THE SERVER */
const SUBJECT = { north: "sub-north", silver: "sub-silver", casey: "sub-casey", jordan: "sub-jordan" };
let pglite = null;
async function world({ firm = false, unpriced = false } = {}) {
  const pg = pglite || (pglite = new PGlite());
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
    if (!SUBJECT[token]) throw Object.assign(new Error("no"), { reason: "bad token" });
    return { subject: SUBJECT[token], email: `${token}@example.invalid`, emailVerified: true };
  } };
  const app = createApp({ repository, catalog, accounts, verifier, runtime });
  const { expansionId } = await catalog.putExpansion({ game: "pokemon", code: "ex1", name: "Ruby & Sapphire", printedTotal: 109 });
  const { cardContextId } = await catalog.putCardContext({ game: "pokemon", expansionId,
    collectorNumber: "60", cardName: "Mudkip", artist: "Ken Sugimori", rarity: "Common" });
  const x = (await catalog.putCanonicalCard({ cardContextId, finish: "non_holo" })).canonicalCardId;
  const y = (await catalog.putCanonicalCard({ cardContextId, finish: "reverse_holofoil" })).canonicalCardId;
  const ctx = { app, repository, cards: { x, y } };
  /* Supply and demand, through the doors that existed before this batch. */
  const post = async (who, command, payload) => {
    const res = await app.inject({ method: "POST", url: "/api/commands",
      headers: { authorization: `Bearer ${who}` }, payload: { command, payload } });
    eq(res.statusCode, 200, `${command}: ${res.body}`);
    return res.json().value;
  };
  ctx.post = post;
  ctx.gA = await post("casey", "addGoal", { canonicalCardId: x, tier: "primary", desired: { grade: "PSA 9" } });
  ctx.gY = await post("casey", "addGoal", { canonicalCardId: y, tier: "secondary", desired: { grade: "PSA 9" } });
  ctx.gJ = await post("jordan", "addGoal", { canonicalCardId: x, tier: "primary", desired: { grade: "PSA 9" } });
  ctx.i1 = await post("north", "addInventoryCopy", { copy: { canonicalCardId: x, grade: "PSA 9", cert: "NL-111",
    ...(unpriced ? {} : { ask: 120 }), cost: 61, firmOnPrice: firm } });
  ctx.i2 = await post("silver", "addInventoryCopy", { copy: { canonicalCardId: x, grade: "PSA 9", cert: "SV-222", ask: 125, cost: 77 } });
  ctx.i3 = await post("north", "addInventoryCopy", { copy: { canonicalCardId: y, grade: "PSA 9", cert: "NL-333", ask: 200, cost: 99 } });
  return ctx;
}
const stored = async (ctx, id) => (await ctx.repository.loadWorld()).opportunities.find((o) => o.id === id);
const only = async (ctx) => (await ctx.repository.loadWorld()).opportunities;

/* ------------------------------------------------------------- A SEAT */
/* The store re-renders the app on every change, as SignIn's session does. */
function Seat({ store, bind }) {
  const [state, setState] = React.useState(store.get());
  React.useEffect(() => store.sub((s) => setState(s)), [store]);
  return h(ProductionApp, { state, onSignOut: () => {}, ...bind });
}
const settle = async () => { for (let i = 0; i < 4; i += 1) await TR.act(async () => {}); };
async function seat(ctx, token) {
  const posts = [];
  const base = fetchFor(ctx.app);
  const fetchImpl = async (url, init = {}) => {
    if ((init.method || "GET") === "POST" && /\/api\/commands$/.test(String(url))) posts.push(JSON.parse(init.body).command);
    return base(url, init);
  };
  const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => token, fetchImpl });
  const store = STORE.createProductionStore({ api });
  await store.load();
  /* Bound exactly as client/sign-in/SignIn.jsx binds them. */
  const bind = {
    onBrowseCards: C.browseCards(store), onRefresh: C.refreshView(store),
    onInspect: C.inspectCopy(store), onEndInspection: C.endInspection(store), onRequestPhotos: C.requestCopyPhotos(store),
    onOpenOffer: C.openOffer(store), onCounterOffer: C.counterOffer(store), onAcceptOffer: C.acceptOffer(store),
    onDeclineOffer: C.declineOffer(store), onWithdrawOffer: C.withdrawOffer(store),
  };
  let r;
  await TR.act(async () => { r = TR.create(h(Seat, { store, bind })); });
  await settle();
  const s = { store, r, posts, bind };
  s.refresh = async () => { await TR.act(async () => { await store.load(); }); await settle(); };
  return s;
}

/* ------------------------------------------------------------- READING A SCREEN */
const textOf = (node) => {
  if (typeof node === "string") return node;
  if (!node || !node.children) return "";
  return node.children.map(textOf).join(" ");
};
const flat = (s) => textOf(s.r.root).replace(/\s+/g, " ");
const buttons = (root) => root.findAll((n) => n.type === "button");
const label = (b) => textOf(b).replace(/\s+/g, " ").trim();
const button = (root, text) => buttons(root).find((b) => label(b) === text || label(b).startsWith(text)) || null;
const go = async (s, nav) => {
  const b = buttons(s.r.root).find((n) => label(n).startsWith(nav));
  assert(b, `no "${nav}" in the navigation`);
  await TR.act(async () => { b.props.onClick(); }); await settle();
};
const press = async (s, root, text) => {
  const b = button(root, text);
  assert(b, `no control "${text}" among: ${buttons(root).map(label).join(" | ")}`);
  assert(!b.props.disabled, `"${text}" is disabled`);
  await TR.act(async () => { await b.props.onClick(); }); await settle();
};
/* The copy row in Deal Flow for one shop. */
const copyRow = (s, cert) => s.r.root.findAll((n) => n.type === "li" && n.props.className === "mcs-df-copy")
  .find((li) => textOf(li).includes(cert)) || null;
const entry = (root) => root.findAll((n) => n.type === "input" && /^Offer/.test(n.props["aria-label"] || ""))[0] || null;
const typeIn = async (root, value) => {
  const i = entry(root); assert(i, "no offer box");
  await TR.act(async () => { i.props.onChange({ target: { value } }); });
};
const submit = async (root) => {
  const f = root.findAll((n) => n.type === "form")[0]; assert(f, "no offer form");
  await TR.act(async () => { await f.props.onSubmit({ preventDefault() {} }); }); await settle();
};
const submitButton = (root) => root.findAll((n) => n.type === "button" && n.props.type === "submit")[0] || null;
/* The live-deal box under a Goal (Collector) and a deal's record (shop). */
const liveBox = (s) => s.r.root.findAll((n) => n.props && n.props["aria-label"] === "Your offer")[0] || null;
const panel = (s, title) => s.r.root.findAll((n) => n.type === "section"
  && n.findAll((m) => m.type === "h2" && textOf(m).trim() === title).length)[0] || null;
/* A deal's record is titled with the Collector's name; a shelf overlap is
   titled with the card and may mention the Collector in its note, so the match
   is on the title, exactly. */
const record = (root, name) => root.findAll((n) => n.type === "article" && n.props.className === "tps-rec")
  .find((a) => a.findAll((t) => t.props && t.props.className === "tps-rec-t" && textOf(t).trim() === name).length) || null;

/* The opening most tests start from: Casey offers $100 on Northline's copy. */
async function opened(ctx, amount = "100") {
  const casey = await seat(ctx, "casey");
  await go(casey, "Deal Flow");
  const row = copyRow(casey, "NL-111");
  await press(casey, row, "Make an offer");
  await typeIn(copyRow(casey, "NL-111"), amount);
  await submit(copyRow(casey, "NL-111"));
  const north = await seat(ctx, "north");
  await go(north, "Opportunities");
  const [o] = await only(ctx);
  return { casey, north, o };
}

/* ============================================================== A */
describe("A. the Collector opens an offer from Deal Flow", () => {
  test("[1] the offer panel names the card, the shop, the price and the terms; Send creates the deal", async () => {
    const ctx = await world();
    const casey = await seat(ctx, "casey");
    await go(casey, "Deal Flow");
    const row = copyRow(casey, "NL-111");
    assert(row, "Northline's matching copy is listed");
    await press(casey, row, "Make an offer");
    const open = copyRow(casey, "NL-111");
    const t = textOf(open).replace(/\s+/g, " ");
    for (const part of ["Mudkip", "Ruby & Sapphire #60", "non_holo", "Northline", "Proposed Market Price $120", "Open to Offers", "PSA 9"]) {
      assert(t.includes(part), `the panel does not say "${part}": ${t}`);
    }
    await typeIn(open, "100");
    assert(label(submitButton(copyRow(casey, "NL-111"))).includes("$100"), "the button says what will be sent");
    await submit(copyRow(casey, "NL-111"));
    eq(json(casey.posts), json(["startOpportunity"]), "one command, through the factory");
    const [o] = await only(ctx);
    eq([o.goalId, o.invId, o.priceThread[0].amount, o.stage].join("|"), `${ctx.gA}|${ctx.i1}|100|agree-price`, "persisted");
    const box = liveBox(casey);
    assert(box, "the offer now sits under the Goal");
    assert(textOf(box).includes("Waiting for Northline to reply to your $100."), "pending the shop: " + textOf(box));
    assert(!button(box, "Accept"), "nothing for the Collector to accept on their own offer");
    eq((await stored(ctx, o.id)).agreedPrice, null, "not accepted by being sent");
  });
  test("[1] a Secondary goal shows no way to offer; nothing creates or changes a Goal", async () => {
    const ctx = await world();
    const casey = await seat(ctx, "casey");
    await go(casey, "Deal Flow");
    assert(!button(copyRow(casey, "NL-333"), "Make an offer"), "an offer from a Secondary goal");
    const goals = json((await ctx.repository.loadWorld()).goals);
    await press(casey, copyRow(casey, "NL-111"), "Make an offer");
    await typeIn(copyRow(casey, "NL-111"), "100");
    await submit(copyRow(casey, "NL-111"));
    eq(json((await ctx.repository.loadWorld()).goals), goals, "no Goal was created or changed");
  });
});

/* ============================================================== B */
describe("B. the shop answers from Opportunities", () => {
  test("[2][13] the offer arrives under Ready to coordinate, with the facts and the three answers", async () => {
    const ctx = await world(); const { north } = await opened(ctx);
    const ready = panel(north, "Ready to coordinate");
    assert(ready, "no Ready to coordinate panel");
    const rec = record(ready, "Casey");
    assert(rec, "Casey's offer is not under Ready to coordinate");
    const t = textOf(rec).replace(/\s+/g, " ");
    for (const part of ["Mudkip", "non_holo", "PSA 9", "Listed at $120", "Open to Offers", "Casey's offer is $100. Your move.",
      "Casey offered $100", "Your move"]) assert(t.includes(part), `the shop is not told "${part}": ${t}`);
    for (const b of ["Accept $100", "Counter", "Decline"]) assert(button(rec, b), `no ${b}`);
    assert(!record(panel(north, "In progress") || north.r.root, "Casey") || !panel(north, "In progress")
      || !textOf(panel(north, "In progress")).includes("Casey"), "and it is not also under In progress");
  });
  test("[3] accepting agrees once; both sides see the next stage", async () => {
    const ctx = await world(); const { casey, north, o } = await opened(ctx, "110");
    await press(north, record(panel(north, "Ready to coordinate"), "Casey"), "Accept $110");
    eq(json(north.posts), json(["acceptPrice"]), "one command");
    const r = await stored(ctx, o.id);
    eq([r.agreedPrice, r.stage].join("|"), "110|select-trade", "agreed and advanced");
    const prog = panel(north, "In progress");
    assert(prog && textOf(prog).includes("Waiting for Casey"), "the shop sees whose turn it now is");
    const ready = panel(north, "Ready to coordinate");
    assert(!ready || !record(ready, "Casey"), "Casey's offer is no longer waiting on the shop");
    await casey.refresh();
    const box = liveBox(casey);
    assert(textOf(box).includes("Agreed at $110. Next: Choosing what to trade."), "the Collector sees it: " + textOf(box));
    assert(!button(box, "Withdraw offer") && !button(box, "Counter") && !button(box, "Accept"), "and no price controls after agreement");
  });
  test("[6] declining ends it as a decline; the Collector is told and may offer again", async () => {
    const ctx = await world(); const { casey, north, o } = await opened(ctx);
    await press(north, record(panel(north, "Ready to coordinate"), "Casey"), "Decline");
    const r = await stored(ctx, o.id);
    eq([r.outcome, r.endedBy].join("|"), "declined|tp", "declined");
    assert(textOf(panel(north, "Completed")).includes("You declined this offer."), "the shop's history says so");
    await casey.refresh();
    assert(flat(casey).includes("Northline declined this offer."), "the Collector is told");
    assert(button(copyRow(casey, "NL-111"), "Make an offer"), "and may offer again");
  });
});

/* ============================================================== C */
describe("C. back and forth", () => {
  test("[4] the shop counters in dollars; the Collector accepts — no second confirmation", async () => {
    const ctx = await world(); const { casey, north, o } = await opened(ctx);
    const rec = () => record(panel(north, "Ready to coordinate"), "Casey");
    await press(north, rec(), "Counter");
    await typeIn(rec(), "115"); await submit(rec());
    eq((await stored(ctx, o.id)).priceThread[1].amount, 115, "counter recorded");
    assert(textOf(panel(north, "In progress")).includes("Waiting for Casey to reply to your $115."), "the shop now waits");
    await casey.refresh();
    const box = liveBox(casey);
    assert(textOf(box).includes("Northline's counter is $115. Your move."), "the Collector's move: " + textOf(box));
    await press(casey, liveBox(casey), "Accept $115");
    const r = await stored(ctx, o.id);
    eq([r.agreedPrice, r.stage].join("|"), "115|select-trade", "agreed by the Collector's acceptance alone");
  });
  test("[5][9] the Collector counters back as a percentage; the shop accepts", async () => {
    const ctx = await world(); const { casey, north, o } = await opened(ctx);
    await press(north, record(panel(north, "Ready to coordinate"), "Casey"), "Counter");
    await typeIn(record(panel(north, "Ready to coordinate"), "Casey"), "118");
    await submit(record(panel(north, "Ready to coordinate"), "Casey"));
    await casey.refresh();
    await press(casey, liveBox(casey), "Counter");
    await press(casey, liveBox(casey), "% of $120");
    await typeIn(liveBox(casey), "90");
    assert(textOf(liveBox(casey)).includes("That's $108 — 90% of $120."), "the resolved amount, live: " + textOf(liveBox(casey)));
    await submit(liveBox(casey));
    const t = (await stored(ctx, o.id)).priceThread[2];
    eq([t.amount, t.basis && t.basis.percent].join("|"), "108|0.9", "sent as a percentage; the server resolved it");
    await north.refresh();
    const rec = record(panel(north, "Ready to coordinate"), "Casey");
    assert(textOf(rec).includes("Casey countered with $108 (90% of $120)"), "the shop sees the basis: " + textOf(rec));
    await press(north, rec, "Accept $108");
    eq((await stored(ctx, o.id)).agreedPrice, 108, "agreed");
  });
  test("[7] the Collector withdraws after a counter — an ending, not a decline", async () => {
    const ctx = await world(); const { casey, north, o } = await opened(ctx);
    await press(north, record(panel(north, "Ready to coordinate"), "Casey"), "Counter");
    await typeIn(record(panel(north, "Ready to coordinate"), "Casey"), "118");
    await submit(record(panel(north, "Ready to coordinate"), "Casey"));
    await casey.refresh();
    await press(casey, liveBox(casey), "Withdraw offer");
    eq(json(casey.posts.slice(-1)), json(["cancelOpportunity"]), "Withdraw is cancelOpportunity, with no reason");
    const r = await stored(ctx, o.id);
    eq([r.outcome, r.endedBy, r.endedStage].join("|"), "ended|collector|agree-price", "withdrawn");
    await north.refresh();
    assert(textOf(panel(north, "Completed")).includes("Casey withdrew the offer."), "the shop sees a withdrawal, not a decline");
  });
  test("[8] Firm on Price: the opening is the price, sent as is; the shop may still counter", async () => {
    const ctx = await world({ firm: true });
    const casey = await seat(ctx, "casey");
    await go(casey, "Deal Flow");
    await press(casey, copyRow(casey, "NL-111"), "Make an offer");
    const row = copyRow(casey, "NL-111");
    assert(textOf(row).includes("This shop is Firm on Price, so an offer opens at $120."), "said plainly");
    assert(!entry(row), "nothing to type");
    await press(casey, row, "Send offer at $120");
    const [o] = await only(ctx);
    eq([o.priceThread[0].amount, o.firmOnPrice, o.agreedPrice].join("|"), "120|true|", "opened at the price, not accepted");
    const north = await seat(ctx, "north");
    await go(north, "Opportunities");
    const rec = record(panel(north, "Ready to coordinate"), "Casey");
    assert(textOf(rec).includes("Firm on Price"), "the shop sees the terms it set");
    assert(button(rec, "Counter"), "Counter is still the shop's to use");
    /* And the server holds the rule even for a request no screen would send. */
    const forced = await casey.bind.onOpenOffer(ctx.gA, ctx.i1, { amount: 110 });
    eq(forced.refused, "already-negotiating", "already open — and see [10]");
  });
  test("[8] a Firm opening below the price is refused by the server, and said back", async () => {
    const ctx = await world({ firm: true });
    const casey = await seat(ctx, "casey");
    const res = await casey.bind.onOpenOffer(ctx.gA, ctx.i1, { amount: 110 });
    eq(res.refused, "firm-on-price", "the server's rule");
    eq((await only(ctx)).length, 0, "nothing created");
  });
});

/* ============================================================== D */
describe("D. whole numbers, said back and never fixed", () => {
  test("[9] cents, zero and fractions are refused on screen, with Send disabled", async () => {
    const ctx = await world();
    const casey = await seat(ctx, "casey");
    await go(casey, "Deal Flow");
    await press(casey, copyRow(casey, "NL-111"), "Make an offer");
    for (const v of ["100.50", "0", "1e2", "-5", "$100"]) {
      await typeIn(copyRow(casey, "NL-111"), v);
      assert(textOf(copyRow(casey, "NL-111")).includes("Use whole dollars above $0 — no cents."), `${v} was not explained`);
      eq(submitButton(copyRow(casey, "NL-111")).props.disabled, true, `${v} could be sent`);
    }
    await press(casey, copyRow(casey, "NL-111"), "% of $120");
    await typeIn(copyRow(casey, "NL-111"), "90.5");
    assert(textOf(copyRow(casey, "NL-111")).includes("Use a whole percentage above 0, like 90."), "a fractional percentage");
    eq(submitButton(copyRow(casey, "NL-111")).props.disabled, true, "not sendable");
    eq(casey.posts.length, 0, "and nothing was sent, rounded or otherwise");
  });
  test("[9] the server stays authoritative: a cents amount sent past the screen is refused", async () => {
    const ctx = await world();
    const casey = await seat(ctx, "casey");
    eq((await casey.bind.onOpenOffer(ctx.gA, ctx.i1, { amount: 100.5 })).refused, "invalid-amount", "cents");
    eq((await casey.bind.onOpenOffer(ctx.gA, ctx.i1, { percent: 0.905 })).ok, true, "a percentage is the server's to round");
    eq((await only(ctx))[0].priceThread[0].amount, 109, "round(120 × 0.905) = 109, by the server");
  });
  test("[9] an unpriced copy offers dollars only", async () => {
    const ctx = await world({ unpriced: true });
    const casey = await seat(ctx, "casey");
    await go(casey, "Deal Flow");
    await press(casey, copyRow(casey, "NL-111"), "Make an offer");
    const row = copyRow(casey, "NL-111");
    assert(textOf(row).includes("No price listed"), "says so");
    assert(!buttons(row).some((b) => /^% of/.test(label(b))), "no percentage of nothing");
    await typeIn(row, "90"); await submit(copyRow(casey, "NL-111"));
    eq((await only(ctx))[0].priceThread[0].amount, 90, "a dollar opening on an unpriced copy");
  });
});

/* ============================================================== E */
describe("E. one active offer per exact card, across shops", () => {
  test("[10] once an offer is open, no other copy of the card offers one — and the server agrees", async () => {
    const ctx = await world(); const { casey } = await opened(ctx);
    await casey.refresh();
    assert(!button(copyRow(casey, "SV-222"), "Make an offer"), "Silver Vale's copy still offers one");
    const direct = await casey.bind.onOpenOffer(ctx.gA, ctx.i2, { amount: 110 });
    eq(direct.refused, "already-negotiating", "the server's rule, across shops");
    eq((await only(ctx)).length, 1, "still one");
  });
  test("[10][12] a stale second tab is told plainly, and nothing is created", async () => {
    const ctx = await world();
    const tab = await seat(ctx, "casey");
    await go(tab, "Deal Flow");
    await opened(ctx);
    await press(tab, copyRow(tab, "SV-222"), "Make an offer");
    await typeIn(copyRow(tab, "SV-222"), "110"); await submit(copyRow(tab, "SV-222"));
    assert(flat(tab).includes("You already have an offer open on this card."), "said: " + flat(tab));
    eq((await only(ctx)).length, 1, "nothing created");
  });
});

/* ============================================================== F */
describe("F. who may act, and who sees what", () => {
  test("[11] each seat has only its own controls", async () => {
    const ctx = await world(); const { casey, north } = await opened(ctx);
    assert(!flat(casey).includes("Decline"), "a Collector cannot decline");
    assert(!buttons(north.r.root).some((b) => /Make an offer|Withdraw offer/.test(label(b))), "a shop cannot open or withdraw");
  });
  test("[11] another shop sees nothing of it and cannot act on it; another Collector neither", async () => {
    const ctx = await world(); const { o } = await opened(ctx);
    const silver = await seat(ctx, "silver");
    await go(silver, "Opportunities");
    assert(!flat(silver).includes("Casey's offer") && !flat(silver).includes("$100"), "Silver Vale sees the deal: " + flat(silver));
    eq((await silver.bind.onAcceptOffer(o.id)).refused, "not-participant", "and cannot accept it");
    eq((await silver.bind.onDeclineOffer(o.id)).refused, "not-participant", "or decline it");
    const jordan = await seat(ctx, "jordan");
    eq((await jordan.bind.onWithdrawOffer(o.id)).refused, "not-participant", "Jordan cannot withdraw Casey's offer");
    eq((await jordan.bind.onCounterOffer(o.id, { amount: 1 })).refused, "not-participant", "or counter it");
    assert(!json(jordan.store.get()).includes(o.id), "and never received it");
    eq((await stored(ctx, o.id)).priceThread.length, 1, "unchanged");
  });
  test("[11] privacy: the Collector's screen and data carry no shop cost or trade rate", async () => {
    const ctx = await world(); const { casey } = await opened(ctx);
    await casey.refresh();
    const data = json(casey.store.get());
    for (const secret of ["tradeRate", "\"cost\"", "0.7"]) assert(!data.includes(secret), `the Collector received ${secret}`);
    /* What the Collector is SHOWN: the rendered text, not the stylesheet that
       ships with it (P6-F1: the ported placeholder's colours are written
       "hsl(… 70% …)", which is a colour, not a trade rate). */
    const shownText = (n) => (typeof n === "string" ? n : !n || !n.children || n.type === "style" ? "" : n.children.map(shownText).join(" "));
    for (const secret of ["$61", "$77", "70%"]) assert(!shownText(casey.r.root).includes(secret), `the Collector is shown ${secret}`);
  });
  test("[11] the turn is the server's: a Collector cannot accept their own offer, even by request", async () => {
    const ctx = await world(); const { casey, o } = await opened(ctx, "120");
    eq((await casey.bind.onAcceptOffer(o.id)).refused, "not-your-turn", "own opening, at the price");
    eq((await stored(ctx, o.id)).agreedPrice, null, "not agreed");
  });
});

/* ============================================================== G */
describe("G. stale screens and repeated presses", () => {
  test("[12] two presses in the same instant send one command", async () => {
    const ctx = await world(); const { north, o } = await opened(ctx);
    const b = button(record(panel(north, "Ready to coordinate"), "Casey"), "Accept $100");
    await TR.act(async () => { const a = b.props.onClick(); const c = b.props.onClick(); await Promise.all([a, c]); });
    await settle();
    eq(json(north.posts), json(["acceptPrice"]), "one command left the browser");
    assert(!flat(north).includes("couldn't confirm"), "and no error was reported for the second press");
    eq((await stored(ctx, o.id)).priceThread.filter((e) => e.type === "accept").length, 1, "accepted once");
  });
  test("[12] a second tab answering an offer already answered is told, and catches up", async () => {
    const ctx = await world(); const { north, o } = await opened(ctx);
    const tab = await seat(ctx, "north");
    await go(tab, "Opportunities");
    await press(north, record(panel(north, "Ready to coordinate"), "Casey"), "Accept $100");
    const stale = record(panel(tab, "Ready to coordinate"), "Casey");
    await press(tab, stale, "Decline");
    assert(flat(tab).includes("This deal has moved past agreeing a price. The latest is shown here."), "told: " + flat(tab));
    assert(!panel(tab, "Ready to coordinate") || !record(panel(tab, "Ready to coordinate"), "Casey"),
      "and the stale offer is gone after the re-read");
    assert(record(panel(tab, "In progress"), "Casey"), "it is in progress now, where the message went with it");
    eq((await stored(ctx, o.id)).agreedPrice, 100, "the first answer stands");
  });
  test("[12] an offer on a copy the shop has just removed is refused, and the screen catches up", async () => {
    const ctx = await world();
    const casey = await seat(ctx, "casey");
    await go(casey, "Deal Flow");
    await ctx.post("north", "removeInventoryCopy", { invId: ctx.i1 });
    await press(casey, copyRow(casey, "NL-111"), "Make an offer");
    await typeIn(copyRow(casey, "NL-111"), "100"); await submit(copyRow(casey, "NL-111"));
    assert(flat(casey).includes("That copy isn't available any more."), "told, even though the re-read took the copy away: " + flat(casey));
    assert(!copyRow(casey, "NL-111"), "and the removed copy is gone from the screen");
    eq((await only(ctx)).length, 0, "nothing created");
  });
});

/* ============================================================== H */
describe("H. the page", () => {
  test("[13] placement: the shop's move in Ready to coordinate, the Collector's in In progress, ended in Completed", async () => {
    const ctx = await world(); const { casey, north } = await opened(ctx);
    assert(textOf(panel(north, "Ready to coordinate")).includes("Casey"), "the shop's move is ready");
    await press(north, record(panel(north, "Ready to coordinate"), "Casey"), "Counter");
    await typeIn(record(panel(north, "Ready to coordinate"), "Casey"), "118");
    await submit(record(panel(north, "Ready to coordinate"), "Casey"));
    const prog = record(panel(north, "In progress"), "Casey");
    assert(prog && textOf(prog).includes("Waiting for Casey"), "the Collector's move is in progress, and says whose");
    assert(!button(prog, "Accept") && !button(prog, "Counter") && !button(prog, "Decline"), "with nothing to press");
    await casey.refresh();
    await press(casey, liveBox(casey), "Withdraw offer");
    await north.refresh();
    assert(record(panel(north, "Completed"), "Casey"), "ended deals sit with the finished ones");
    assert(!panel(north, "In progress") || !record(panel(north, "In progress"), "Casey"), "not in progress");
  });
  test("[14] responsive: one column that wraps, a numeric keypad, no fixed widths a phone cannot hold", () => {
    const shells = { mcs: read("client/collector/CollectorShell.jsx"), tps: read("client/tp/TrustedPartnerShell.jsx") };
    for (const [pre, css] of Object.entries(shells)) {
      for (const cls of ["offer-do", "offer-mode"]) {
        assert(new RegExp(`\\.${pre}-${cls}[^{]*\\{[^}]*flex-wrap:wrap`).test(css), `${pre}-${cls} does not wrap`);
      }
      assert(new RegExp(`\\.${pre}-offer-entry \\{[^}]*flex-direction:column`).test(css), `${pre} entry is not one column`);
      const block = css.slice(css.indexOf(`.${pre}-offer`), css.indexOf(`.${pre}-chip.on`));
      for (const m of block.matchAll(/(?:^|[;{ ])(?:width|min-width):\s*(\d+)px/g)) {
        assert(Number(m[1]) <= 320, `${pre}: a fixed width of ${m[1]}px`);
      }
    }
    assert(/\.mcs-offer-field input \{[^}]*font-size:16px/.test(shells.mcs), "a phone would zoom into the Collector's box");
    assert(/inputMode="numeric"/.test(read("client/negotiation.jsx")), "not a numeric keypad");
  });
  test("[15] the rest of Deal Flow still works beside the offer", async () => {
    const ctx = await world();
    const casey = await seat(ctx, "casey");
    await go(casey, "Deal Flow");
    await press(casey, copyRow(casey, "NL-111"), "Inspect");
    assert(textOf(copyRow(casey, "NL-111")).includes("You're inspecting this copy"), "inspection still opens");
    await press(casey, copyRow(casey, "SV-222"), "Request photos");
    assert(textOf(copyRow(casey, "SV-222")).includes("Photos requested"), "photo requests still go");
    eq(json(casey.posts), json(["reviewCopy", "requestPhotos"]), "and nothing else was sent");
    assert(button(copyRow(casey, "NL-111"), "Make an offer"), "and the offer is there beside them");
  });
  test("[15] without the callbacks, Deal Flow and Opportunities offer no price control at all", async () => {
    const ctx = await world(); await opened(ctx);
    for (const who of ["casey", "north"]) {
      const s = await seat(ctx, who);
      await TR.act(async () => { s.r.update(h(Seat, { store: s.store, bind: { onBrowseCards: s.bind.onBrowseCards } })); });
      await go(s, who === "casey" ? "Deal Flow" : "Opportunities");
      assert(!buttons(s.r.root).some((b) => /Make an offer|^Accept|^Counter|Decline|Withdraw offer/.test(label(b))),
        `${who} was offered a control nobody can send: ${buttons(s.r.root).map(label).join(" | ")}`);
    }
  });
});

/* ============================================================== I */
describe("I. the door and the client agree", () => {
  test("[16] every command the client sends is exposed, and nothing more", () => {
    const client = read("client/commands.js");
    const sent = new Set();
    for (const m of client.matchAll(/execute\(\s*"([A-Za-z]+)"/g)) sent.add(m[1]);
    for (const m of client.matchAll(/^export const [A-Z_]+ = "([A-Za-z]+)";$/gm)) sent.add(m[1]);
    eq(json([...sent].sort()), json([...EXPOSED_COMMANDS].sort()), "the door and the client disagree");
    for (const c of ["startOpportunity", "proposePrice", "acceptPrice", "declineOffer", "cancelOpportunity"]) {
      assert(sent.has(c), `${c} has no client caller`);
    }
  });
  test("[16] each binding is imported and bound by the entrance, and handed only to its seat's screen", () => {
    const signIn = code("client/sign-in/SignIn.jsx");
    for (const fn of ["openOffer", "counterOffer", "acceptOffer", "declineOffer", "withdrawOffer"]) {
      assert(new RegExp(`\\b${fn}\\(store\\)`).test(signIn), `${fn} is never bound`);
    }
    const tpShell = code("client/tp/TrustedPartnerShell.jsx");
    assert(/opportunities" \? \{ onBrowseCards, onCounterOffer, onAcceptOffer, onDeclineOffer, onRefresh \}/.test(tpShell),
      "Opportunities is handed something other than the shop's three answers");
    assert(!/onOpenOffer|onWithdrawOffer/.test(tpShell), "the shop's shell can reach the Collector's moves");
    const coShell = code("client/collector/CollectorShell.jsx");
    assert(!/onDeclineOffer/.test(coShell), "the Collector's shell can reach the shop's decline");
    const dealFlow = code("client/collector/sections/DealFlow.jsx");
    assert(!/\.execute\(|store\./.test(dealFlow), "Deal Flow reaches for the store");
    assert(!/\.execute\(|store\./.test(code("client/tp/sections/Opportunities.jsx")), "Opportunities reaches for the store");
  });
});

run();
