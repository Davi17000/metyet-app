/* ============================================================================
   MILESTONE 2C.2 — COLLECTOR INTERACTION REFINEMENT

   Through the real Collector shell over projections of worlds driven by real
   domain commands (the Milestone 2C.1 world: Charizard, Mudkip, Pikachu as
   Primary Goals, Venusaur as Secondary, and Jordan's deal):

     A. image-first: a copy's picture opens a viewer, which sends nothing and
        says what the picture is; Request actual photos is the existing command
     B. the opening offer: an empty box, Dollar Amount or Percentage, the
        amount said before Send, Firm on Price explicit, nothing sent early
     C. no Price History in the workspace; the canonical history untouched
     D. Primary Goals only in Deal Flow; Secondary Goals untouched elsewhere
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const path = require("path");
const React = require("react");
const TR = require("react-test-renderer");
const esbuild = require("esbuild");
const P = require("../domain/metyet-projection.js");
const { createStore } = require("./fixture-store.cjs");
const RT = require("../domain/metyet-runtime.js");

const ROOT = path.join(__dirname, "..");
const AT = "2026-11-03";
let seq = 0;
const runtime = () => RT.createRuntime({ now: () => AT, newId: (p = "") => `${p}${++seq}` });
const A = { collectorId: "casey" };
const J = { collectorId: "jordan" };
const NL = { partnerId: "nl" };

const world = ({ agreed = true, mudkipMoves = null } = {}) => {
  const st = createStore({
    partners: [{ id: "nl", name: "Northline Cards", tradeRate: 0.7 }, { id: "sv", name: "Silver Vale", tradeRate: 0.7 },
      { id: "far", name: "Faraway Games", tradeRate: 0.7 }],
    collectors: [{ id: "casey", name: "Casey" }, { id: "jordan", name: "Jordan" }],
    relationships: [
      { partnerId: "nl", collectorId: "casey", status: "accepted", at: AT },
      { partnerId: "sv", collectorId: "casey", status: "accepted", at: AT },
      { partnerId: "nl", collectorId: "jordan", status: "accepted", at: AT }],
    /* the server's order: Charizard first, then Mudkip — not the order of urgency */
    goals: [
      { id: "gC", collectorId: "casey", canonicalCardId: "cc-char", tier: "primary", desired: { grade: "PSA 9" } },
      { id: "gV", collectorId: "casey", canonicalCardId: "cc-ven", tier: "secondary", desired: { grade: "PSA 8" } },
      { id: "gM", collectorId: "casey", canonicalCardId: "cc-mud", tier: "primary", desired: { grade: "Raw", condition: "Near Mint" } },
      { id: "gP", collectorId: "casey", canonicalCardId: "cc-pika", tier: "primary", desired: { grade: "PSA 10" } },
      { id: "gJ", collectorId: "jordan", canonicalCardId: "cc-ven", tier: "primary", desired: { grade: "PSA 9" } }],
    inventory: [
      { invId: "m1", partnerId: "nl", canonicalCardId: "cc-mud", grade: "Raw", condition: "Near Mint", ask: 12, cost: 6, cert: "CERT-M" },
      { invId: "c1", partnerId: "nl", canonicalCardId: "cc-char", grade: "PSA 9", ask: 1200, cost: 900, cert: "CERT-C1" },
      { invId: "c2", partnerId: "nl", canonicalCardId: "cc-char", grade: "PSA 9", ask: 1250, cost: 950, firmOnPrice: true },
      { invId: "c3", partnerId: "sv", canonicalCardId: "cc-char", grade: "PSA 9", ask: 1180, cost: 800 },
      { invId: "j1", partnerId: "nl", canonicalCardId: "cc-ven", grade: "PSA 9", ask: 1300, cost: 999 },
      { invId: "p1", partnerId: "far", canonicalCardId: "cc-pika", grade: "PSA 10", ask: 500, cost: 300 },
      { invId: "v1", partnerId: "sv", canonicalCardId: "cc-ven", grade: "PSA 8", ask: 300, cost: 150 }],
    collectorCopies: [], binders: [], binderEntries: [], opportunities: [], catalog: [], copyReviews: [],
    photoRequests: [], conversations: [], interests: [],
  }, runtime());
  const x = (actor, cmd, payload) => st.execute(actor, cmd, { at: AT, ...(payload || {}) });
  const ok = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
  const mud = ok(x(A, "startOpportunity", { goalId: "gM", invId: "m1", amount: 10 }), "Mudkip offer");
  for (const [who, cmd, p] of mudkipMoves || (agreed ? [[NL, "proposePrice", { amount: 11 }], [A, "acceptPrice"]] : [])) {
    ok(x(who, cmd, { oppId: mud, ...(p || {}) }), cmd);
  }
  const jordans = ok(x(J, "startOpportunity", { goalId: "gJ", invId: "j1", amount: 1111 }), "Jordan's offer");
  return { st, x, mud, jordans };
};

const build = (rel) => {
  const out = esbuild.buildSync({ entryPoints: [path.join(ROOT, rel)], bundle: true, format: "cjs", write: false,
    logLevel: "silent", jsx: "automatic", platform: "node",
    external: ["react", "react-dom", "react/jsx-runtime", "react-test-renderer"] });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};
const Shell = build("client/collector/CollectorShell.jsx").default;
const DF = build("client/collector/sections/DealFlow.jsx");
const PARTS = build("client/collector/deal-parts.jsx");
const PG = build("client/collector/deal-progress.js");
const CARDS = {
  "cc-mud": { canonicalCardId: "cc-mud", cardName: "Mudkip", expansionName: "Ruby & Sapphire", collectorNumber: "60",
    finish: "non_holo", printRun: "not_applicable", language: "en", imageSmall: "https://example.test/mud.png" },
  "cc-char": { canonicalCardId: "cc-char", cardName: "Charizard", expansionName: "Base Set", collectorNumber: "4" },
  "cc-pika": { canonicalCardId: "cc-pika", cardName: "Pikachu", expansionName: "Jungle", collectorNumber: "60" },
  "cc-ven": { canonicalCardId: "cc-ven", cardName: "Venusaur", expansionName: "Base Set", collectorNumber: "15" } };
const door = { describe: async (ids) => ({ cards: ids.map((id) => CARDS[id]).filter(Boolean) }) };
const settle = async () => { for (let i = 0; i < 10; i += 1) await TR.act(async () => { await new Promise((d) => setTimeout(d, 0)); }); };

const textOf = (n) => (typeof n === "string" ? n : (n && n.children ? n.children.map(textOf).join(" ") : ""));
const flat = (n) => textOf(n).replace(/\s+/g, " ").trim();
const cls = (n) => String((n.props && n.props.className) || "").split(" ");
const byCls = (root, c) => root.findAll((n) => typeof n.type === "string" && cls(n).includes(c));
const buttons = (root) => root.findAll((n) => n.type === "button").map((b) => flat(b));
const bars = (root) => root.findAll((n) => n.props && n.props.role === "progressbar");
/* The deal block's three lines, in order, with the bar shown as [bar]. */
const lines = (card) => byCls(byCls(card, "mcs-dg-deal")[0], "mcs-dg-progress")[0].findAll((n) => typeof n.type === "string"
  && (n.type === "p" || n.props.role === "progressbar")).map((n) => (n.props.role === "progressbar" ? "[bar]" : flat(n))).join(" | ");

/* The Collector's shell over the store, sending real commands and
   re-projecting after each, as the production entrance does. */
async function shell(st, actor = A) {
  const sent = [];
  let r;
  const props = () => ({
    state: P.projectForActor(st.get(), actor), onSignOut: () => {}, onBrowseCards: door,
    onAddGoal: async () => ({ ok: true }),
    onOpenOffer: (goalId, invId, price) => send("startOpportunity", { goalId, invId, ...price }),
    onCounterOffer: (oppId, price) => send("proposePrice", { oppId, ...price }),
    onAcceptOffer: (oppId) => send("acceptPrice", { oppId }),
    onWithdrawOffer: (oppId) => send("cancelOpportunity", { oppId }),
    onInspect: (invId) => send("reviewCopy", { invId }),
    onEndInspection: (reviewId) => send("endReview", { reviewId }),
    onRequestPhotos: (invId) => send("requestPhotos", { invId }),
    onRefresh: async () => { await TR.act(async () => { r.update(el()); }); },
  });
  const send = async (cmd, payload) => {
    sent.push(cmd);
    const out = st.execute(actor, cmd, { at: AT, ...payload });
    await TR.act(async () => { r.update(el()); });
    await settle();
    return out;
  };
  const el = () => React.createElement(Shell, props());
  await TR.act(async () => { r = TR.create(el()); });
  await settle();
  const s = { sent, get r() { return r; } };
  s.go = async (label) => { const b = r.root.findAll((n) => n.type === "button" && flat(n).includes(label) && cls(n).includes("mcs-i"))[0];
    await TR.act(async () => { b.props.onClick(); }); await settle(); };
  s.cards = () => r.root.findAll((n) => n.type === "article" && n.props["data-goal"]);
  s.goal = (id) => s.cards().find((a) => a.props["data-goal"] === id) || null;
  s.press = async (root, label) => { const b = root.findAll((n) => n.type === "button" && (flat(n) === label || n.props["aria-label"] === label))[0];
    assert(b, `no "${label}" in: ${flat(root).slice(0, 300)}`);
    await TR.act(async () => { await b.props.onClick(); }); await settle(); };
  s.ws = () => r.root.findAll((n) => n.type === "div" && n.props.className === "mcs-ws")[0] || null;
  s.gm = () => r.root.findAll((n) => n.type === "div" && cls(n).includes("mcs-gm"))[0] || null;
  s.nav = () => r.root.findAll((n) => n.type === "nav").length;
  return s;
}
const landing = async (opts) => { const w = world(opts); const s = await shell(w.st); await s.go("Deal Flow"); return { ...w, s }; };

const okv = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };

const dialog = (s) => s.r.root.findAll((n) => n.props && n.props.role === "dialog")[0] || null;
const rowOf = (s, inv) => s.gm().findAll((n) => n.type === "li" && n.props["data-inv"] === inv)[0];
const thumbOf = (s, inv) => byCls(rowOf(s, inv), "mcs-pv-thumb")[0];
const typeIn = async (root, value) => {
  const input = root.findAll((n) => n.type === "input")[0];
  assert(input, "no input");
  await TR.act(async () => { input.props.onChange({ target: { value } }); });
};
const offerBox = (s, inv) => byCls(rowOf(s, inv), "mcs-oo")[0] || null;
const matchesOf = async (goal = "gC", opts) => { const w = await landing(opts); await w.s.press(w.s.goal(goal), "View Matches"); return w; };

/* ================================================================ A */
describe("A. image-first viewing", () => {
  test("tapping a copy's picture opens a viewer on that copy; closing returns focus to it; nothing is sent", async () => {
    const { s, st } = await matchesOf();
    const before = JSON.stringify(st.get());
    assert(!buttons(s.gm()).includes("Inspect"), "Inspect is still offered");
    await TR.act(async () => { thumbOf(s, "c3").props.onClick(); });
    const d = dialog(s);
    assert(d && d.props["aria-modal"] === "true", "no viewer");
    eq(rowOf(s, "c3").findAll((n) => n === d).length, 1, "the viewer is not the tapped copy's");
    assert(/Charizard/.test(flat(d)) && /PSA 9 · Silver Vale/.test(flat(d)), flat(d));
    await TR.act(async () => { d.props.onKeyDown({ key: "Escape" }); });
    eq(dialog(s), null, "Escape did not close it");
    await TR.act(async () => { thumbOf(s, "c3").props.onClick(); });
    await s.press(dialog(s), "Close");
    eq(dialog(s), null, "Close did not close it");
    eq(s.sent.length, 0, "looking sent a command");
    eq(JSON.stringify(st.get()), before, "looking changed the world");
  });
  test("catalog artwork is said to be catalog artwork, not this copy's condition", async () => {
    const { s } = await matchesOf("gM", { agreed: false, mudkipMoves: [[A, "cancelOpportunity"]] });
    await TR.act(async () => { thumbOf(s, "m1").props.onClick(); });
    const d = dialog(s);
    assert(/Catalog image — it shows the printing, not this copy's condition\./.test(flat(d)), flat(d));
    const stage = byCls(d, "mcs-pv-stage")[0];
    eq(stage.props["aria-label"], "Catalog image of Mudkip");
    eq(stage.findAll((n) => n.type === "img")[0].props.src, "https://example.test/mud.png", "not the catalogue's picture");
    eq(flat(byCls(rowOf(s, "m1"), "mcs-pv-tag")[0]), "Catalog");
  });
  test("a partner's photos are described in words, never drawn as a picture", async () => {
    const w = world();
    okv(w.x(NL, "addCopyPhotos", { invId: "c1", front: "https://partner.example/c1-front.jpg", back: "https://partner.example/c1-back.jpg" }), "photos");
    const s = await shell(w.st); await s.go("Deal Flow"); await s.press(s.goal("gC"), "View Matches");
    assert(/Partner photos: Front and back/.test(flat(rowOf(s, "c1"))), flat(rowOf(s, "c1")));
    await TR.act(async () => { thumbOf(s, "c1").props.onClick(); });
    const d = dialog(s);
    assert(/Northline Cards has added photos of this copy \(front and back\)/.test(flat(d)), flat(d));
    eq(s.r.root.findAll((n) => n.type === "img" && /partner\.example/.test(String(n.props.src))).length, 0, "a partner's photo reference was rendered");
    assert(!buttons(d).includes("Request actual photos") && !buttons(rowOf(s, "c1")).includes("Request actual photos"), "asked again for photos it has");
  });
  test("Request actual photos is the existing command, once, for that copy; the pending state stays", async () => {
    const { s, st } = await matchesOf();
    await TR.act(async () => { thumbOf(s, "c3").props.onClick(); });
    await s.press(dialog(s), "Request actual photos");
    eq(JSON.stringify(s.sent), JSON.stringify(["requestPhotos"]));
    const req = st.get().photoRequests.filter((r) => r.collectorId === "casey");
    eq(req.map((r) => r.invId).join(), "c3", "not a request for that copy");
    assert(/Photos requested — Silver Vale will add them\./.test(flat(dialog(s))), flat(dialog(s)));
    await s.press(dialog(s), "Close");
    assert(/Photos requested/.test(flat(rowOf(s, "c3"))) && !buttons(rowOf(s, "c3")).includes("Request actual photos"), "it offers to ask again");
    /* the domain's own duplicate protection, unchanged */
    w2: { const again = st.execute(A, "requestPhotos", { invId: "c3", at: AT }); assert(again.ok !== false); }
    eq(st.get().photoRequests.filter((r) => r.collectorId === "casey").length, 1, "a second request was written");
  });
  test("no unauthorized photo or copy data: an unconnected partner's or another Collector's never appears", async () => {
    const { s } = await matchesOf();
    const t = flat(s.gm());
    assert(!/Faraway|Jordan|\$1,300|\$900|\$950|\$800|CERT-/.test(t), t);
  });
});

/* ================================================================ B */
describe("B. the opening offer", () => {
  test("Open to Offers: the partner's price above an EMPTY box, Dollar Amount and Percentage, nothing sent", async () => {
    const { s } = await matchesOf();
    await s.press(rowOf(s, "c1"), "Make an offer");
    const box = offerBox(s, "c1");
    assert(/Proposed Market Price from Northline Cards \$1,200/.test(flat(box)), flat(box));
    eq(buttons(box).join("|"), "Dollar Amount|Percentage|Send offer|Cancel");
    const input = box.findAll((n) => n.type === "input")[0];
    eq(input.props.value, "", "the box is pre-filled");
    assert(!input.props.placeholder, "the partner's price is offered as a placeholder");
    eq(box.findAll((n) => n.type === "button" && n.props.type === "submit")[0].props.disabled, true, "Send is live with nothing typed");
    eq(s.sent.length, 0, "opening the composer sent something");
  });
  test("Dollar Amount: a custom whole-dollar opening, said back, sent only on Send, and the deal opens", async () => {
    const { s, st } = await matchesOf();
    await s.press(rowOf(s, "c1"), "Make an offer");
    await typeIn(offerBox(s, "c1"), "1050");
    assert(/Your opening offer \$1,050/.test(flat(offerBox(s, "c1"))), flat(offerBox(s, "c1")));
    eq(s.sent.length, 0, "typing sent something");
    await TR.act(async () => { await offerBox(s, "c1").props.onSubmit({ preventDefault() {} }); });
    await settle(); await settle();
    const o = st.get().opportunities.find((x) => x.goalId === "gC");
    eq([o.invId, o.priceThread[0].amount, o.listedPrice, o.agreedPrice].join(), "c1,1050,1200,", "not the custom offer");
    eq(s.ws() && s.ws().props["data-opp"], o.id, "the deal did not open");
  });
  test("Percentage: 90% of the original Proposed Market Price, Math.round, said before Send", async () => {
    const { s, st } = await matchesOf();
    await s.press(rowOf(s, "c3"), "Make an offer");
    await s.press(offerBox(s, "c3"), "Percentage");
    assert(/A percentage of the \$1,180 Proposed Market Price\./.test(flat(offerBox(s, "c3"))));
    await typeIn(offerBox(s, "c3"), "90");
    /* 1180 × 0.9 = 1062 */
    assert(/Your opening offer · 90% of \$1,180 \$1,062/.test(flat(offerBox(s, "c3"))), flat(offerBox(s, "c3")));
    await typeIn(offerBox(s, "c3"), "33");
    /* 1180 × 0.33 = 389.4 → 389 */
    assert(/\$389\b/.test(flat(offerBox(s, "c3"))), flat(offerBox(s, "c3")));
    await typeIn(offerBox(s, "c3"), "90.5");
    assert(/whole percentage/.test(flat(offerBox(s, "c3"))), "a fractional percentage was accepted");
    await typeIn(offerBox(s, "c3"), "90");
    eq(s.sent.length, 0);
    await TR.act(async () => { await offerBox(s, "c3").props.onSubmit({ preventDefault() {} }); });
    await settle();
    const o = st.get().opportunities.find((x) => x.goalId === "gC");
    eq([o.priceThread[0].amount, o.listedPrice].join(), "1062,1180", "the server's amount differs from what was said");
  });
  test("the $300 example: 90% opens at $270", () => {
    const N = build("client/negotiation.jsx");
    const e = N.readEntry("percent", "90", 300);
    eq([e.amount, e.price.percent].join(), "270,0.9");
  });
  test("a counter's percentage is of the original snapshot, not a later shelf price or the latest counter", async () => {
    const w = world({ agreed: false, mudkipMoves: [[NL, "proposePrice", { amount: 11 }]] });
    okv(w.x(NL, "updateInventoryCopy", { invId: "m1", patch: { ask: 40 } }), "the shelf price moves");
    const s = await shell(w.st); await s.go("Deal Flow"); await s.press(s.goal("gM"), "Review Counteroffer");
    await s.press(s.ws(), "Counter");
    assert(buttons(s.ws()).includes("% of $12"), "the counter is not of the $12 snapshot: " + buttons(s.ws()).join("|"));
  });
  test("Firm on Price: explained, no editable box, still an explicit Send at the price", async () => {
    const { s, st } = await matchesOf();
    await s.press(rowOf(s, "c2"), "Make an offer");
    const box = offerBox(s, "c2");
    assert(/Northline Cards is Firm on Price, so an opening offer is the Proposed Market Price\./.test(flat(box)), flat(box));
    eq(box.findAll((n) => n.type === "input").length, 0, "an editable box that would always fail");
    eq(buttons(box).join("|"), "Send offer at $1,250|Cancel");
    eq(s.sent.length, 0, "opening the composer sent the offer");
    await s.press(box, "Send offer at $1,250");
    const o = st.get().opportunities.find((x) => x.goalId === "gC");
    eq([o.priceThread[0].amount, o.agreedPrice].join(), "1250,", "the Firm opening was accepted, or not sent at the price");
  });
  test("a second offer stays blocked while one is open", async () => {
    const w = world({ agreed: false });
    eq(w.x(A, "startOpportunity", { goalId: "gM", invId: "m1", amount: 9 }).refused, "already-negotiating");
    const s = await shell(w.st); await s.go("Deal Flow");
    eq(buttons(s.goal("gM")).join("|"), "View Deal", "the Goal offers a second deal");
  });
});

/* ================================================================ C */
describe("C. no Price History in the workspace", () => {
  test("a counter: the Proposed Market Price and the one proposal on the table — no history control, no ledger", async () => {
    const w = world({ agreed: false, mudkipMoves: [[NL, "proposePrice", { amount: 11 }]] });
    const s = await shell(w.st); await s.go("Deal Flow"); await s.press(s.goal("gM"), "Review Counteroffer");
    const stage = byCls(s.ws(), "mcs-ws-stage")[0];
    const rowsOf = stage.findAll((n) => n.type === "dt").map((d) => flat(d));
    eq(rowsOf.join("|"), "Proposed Market Price|Counteroffer from Northline Cards");
    assert(/Counteroffer from Northline Cards \$11/.test(flat(stage)), flat(stage));
    assert(!/Price history|Your opening offer|offered \$|countered with/i.test(flat(s.ws())), "a history is recited: " + flat(s.ws()));
    eq(s.ws().findAll((n) => n.type === "details" || n.type === "summary").length, 0, "an expand/collapse history remains");
    /* the canonical history is untouched */
    eq(w.st.get().opportunities.find((o) => o.id === w.mud).priceThread.map((e) => `${e.by}:${e.type}:${e.amount}`).join(),
      "collector:offer:10,tp:counter:11");
  });
  test("waiting on the partner: your proposal is the one on the table", async () => {
    const w = world({ agreed: false });
    const s = await shell(w.st); await s.go("Deal Flow"); await s.press(s.goal("gM"), "View Deal");
    eq(byCls(s.ws(), "mcs-ws-stage")[0].findAll((n) => n.type === "dt").map((d) => flat(d)).join("|"),
      "Proposed Market Price|Your opening offer");
  });
  test("agreed: the Agreed Market Price beside the Proposed Market Price, the next stage named; history kept", async () => {
    const w = world();
    const s = await shell(w.st); await s.go("Deal Flow"); await s.press(s.goal("gM"), "View Agreement");
    const stage = byCls(s.ws(), "mcs-ws-stage")[0];
    eq(stage.findAll((n) => n.type === "dt").map((d) => flat(d)).join("|"), "Proposed Market Price|Agreed Market Price");
    assert(/Agreed Market Price \$11/.test(flat(stage)) && /doesn't complete the deal/.test(flat(stage)), flat(stage));
    assert(!/Price history/i.test(flat(s.ws())));
    eq(w.st.get().opportunities.find((o) => o.id === w.mud).priceThread.length, 3, "the canonical history changed");
  });
  test("the workspace no longer reads or renders the history", () => {
    const src = require("fs").readFileSync(path.join(ROOT, "client/collector/DealWorkspace.jsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    assert(!/PriceHistory|priceLedger|priceThread|pricelog/.test(src), "the workspace still reaches the history");
  });
});

/* ================================================================ D */
describe("D. Primary Goals only", () => {
  test("Deal Flow shows the Primary Goals and their progress; the Secondary Goal is nowhere in it", async () => {
    const { s, st } = await landing();
    eq(s.cards().map((a) => a.props["data-goal"]).join(), "gC,gM,gP");
    assert(!/Venusaur|Secondary/.test(flat(s.r.root.findAll((n) => n.type === "main")[0])), "the Secondary Goal is mentioned");
    eq(bars(s.goal("gM")).length, 1, "the active Goal's progress bar is gone");
    eq(flat(byCls(s.goal("gC"), "mcs-dg-match")[0]), "2 Trusted Partners match");
    eq(st.get().goals.find((g) => g.id === "gV").tier, "secondary", "the Secondary Goal changed");
  });
  test("the Secondary Goal is still in Binders", async () => {
    const { s } = await landing();
    await s.go("Binders");
    const v = s.r.root.findAll((n) => n.type === "button" && /^Secondary/.test(flat(n)))[0];
    assert(v, "no Secondary view in Binders");
    await TR.act(async () => { v.props.onClick(); }); await settle();
    assert(/Venusaur/.test(flat(s.r.root.findAll((n) => n.type === "main")[0])), "the Secondary Goal is gone from Binders");
  });
  test("no Primary Goals: a short empty state with a working way to Browse", async () => {
    const w = world();
    const st = w.st;
    const g = st.get();
    const only = createStore({ ...g, goals: g.goals.filter((x) => x.tier !== "primary" || x.collectorId !== "casey"),
      opportunities: g.opportunities.filter((o) => o.collectorId !== "casey") }, runtime());
    const s = await shell(only); await s.go("Deal Flow");
    const main = s.r.root.findAll((n) => n.type === "main")[0];
    assert(/No Primary Goals yet\./.test(flat(main)), flat(main));
    eq(s.cards().length, 0);
    await s.press(main, "Find a card in Browse");
    const on = s.r.root.findAll((n) => n.type === "button" && n.props["aria-current"] === "page")[0];
    assert(/Browse/.test(flat(on)), "the button did not go to Browse");
  });
});

run();
