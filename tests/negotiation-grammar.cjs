/* ============================================================================
   ONE NEGOTIATION LANGUAGE

   Two browser defects turned out to be one missing idea.

   A collector could press Send three times and put the same $2,050 into the
   history three times — negotiating with themselves — because nothing said a
   proposal is a TURN. And a collector could type 90%, press Send, and have
   absolutely nothing happen: the partner opens the percentage phase by design,
   so the reducer correctly refused, while the screen went on offering a control
   that could never do anything.

   Both come from each surface working out whose move it is from raw fields.
   So `negotiationState(card, phase, viewer)` answers that once, for both seats:

     locked / settled / waiting / theirs / open / blocked

   The UI renders those states rather than inventing them, which is why the
   collector now SEES that they are waiting instead of being handed a button.

   And because a trade percentage and the dollars it represents are the same
   economic statement written two ways, both are editable and each keeps the
   other in step through the canonical helpers.
   ========================================================================= */

process.env.METYET_DEV = "1";

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");
const M = require("../dist/MetYet.cjs");
const { createStore } = require("../domain/metyet-store.js");
const { collectorView } = require("../domain/collector-view.js");
const App = require("../dist/Collector.cjs").default;
const { __store } = require("../dist/Collector.cjs");

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const AT = "2026-08-19";

const txt = (n) => {
  if (!n) return "";
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ").replace(/\s+/g, " ").trim();
};
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));

/* ---- domain fixture ------------------------------------------------------ */
const MEW = { id: "ka", name: "Mew ex", set: "Dragon Frontiers", number: "1",
  variant: "", edition: "Unlimited", language: "English", grade: "PSA 8", condition: null };
const LUGIA = { id: "kb", name: "Lugia", set: "Neo Genesis", number: "9/111",
  variant: "Holo", edition: "Unlimited", language: "English", grade: "PSA 8", condition: null };
const TARGET = { id: "kt", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };

const world = (n = 1) => {
  const st = createStore({
    catalog: [MEW, LUGIA, TARGET],
    collectors: [{ id: "casey", name: "Casey", prefs: [] }],
    partners: [{ id: "nl", name: "Northline Cards" }],
    goals: [], binder: [], interests: [], conversations: [], opportunities: [],
    preferences: [], photoRequests: [], copyReviews: [],
    inventory: [{ invId: "inv-1", partnerId: "nl", cardId: "kt", ask: 4200,
      archived: false, photos: { front: "f", back: "b" } }],
  });
  const g = st.actions.addGoal({ collectorId: "casey", cardId: "kt", tier: "primary", at: AT });
  const o = st.actions.startOpportunity({ goalId: g, collectorId: "casey", partnerId: "nl",
    cardId: "kt", invId: "inv-1", listedPrice: 4200, amount: 3990, at: AT });
  st.actions.agreePrice({ oppId: o, amount: 3990, by: "tp", at: AT });
  const rows = [M.emptyTradeCard("ka", null, null, "b-a")];
  if (n > 1) rows.push(M.emptyTradeCard("kb", null, null, "b-b"));
  st.actions.patchOpportunity(o, (x) => ({ ...x, stage: "select-trade",
    trade: { ...x.trade, submitted: true, cards: rows } }));
  st.actions.reviewTradeCards({ oppId: o, decision: "accepted", at: AT });
  const get = () => st.get().opportunities.find((x) => x.id === o);
  return { st, o, get, ids: rows.map((r) => r.id),
    card: (id) => get().trade.cards.find((c) => c.id === id) };
};
const market = (w, id, by, action, amount) => w.st.actions.tradeMarketRespond({
  oppId: w.o, tradeCardId: id, by, action, amount, at: AT });
const percent = (w, id, by, action, p) => w.st.actions.tradePercentRespond({
  oppId: w.o, tradeCardId: id, by, action, percent: p, at: AT });

/* ---- rendered fixture ---------------------------------------------------- */
const S = () => __store.get().get();
const acts = () => __store.get().actions;
const goal = () => collectorView(S(), "c12").myGoals()
  .find((g) => /^Review deal/.test(g.note || ""));
const opp = () => D.activeOppForGoal(goal().id, S().opportunities);
let R = null;
const render = (over) => {
  __store.reset(M.buildCanonicalSeed({ review: true, demoStage: "value-trade" }));
  const tc = opp().trade.cards.find((c) => c.inclusion === "accepted");
  TR.act(() => { acts().patchOpportunity(opp().id, (x) => ({ ...x,
    trade: { ...x.trade, cards: x.trade.cards.map((c) => (c.id === tc.id
      ? { ...c, ...over } : c)) } })); });
  TR.act(() => { R = TR.create(React.createElement(App)); });
  cls(R, "goal").forEach((g) => {
    const d = g.findAllByType("button")
      .find((b) => String(b.props.className || "").includes("goal-deal"));
    if (d && !d.props["aria-expanded"]) click(d);
  });
  return cls(R, "vcard")[0];
};
const MARKET_AGREED = { agreedMarket: 2050,
  valueThread: [{ by: "tp", type: "propose", amount: 2050, at: AT },
    { by: "collector", type: "accept", amount: 2050, at: AT }],
  /* Cleared explicitly: the seeded card arrives mid-percentage. */
  agreedPercent: null, tpPercent: null, collectorPercent: null, percentThread: [] };
const labels = (vc) => vc.findAllByType("button").map(txt).filter(Boolean);
const field = (aria) => cls(R, "vcard")[0].findAllByType("input")
  .find((i) => i.props["aria-label"] === aria);

describe("A. A proposal is a turn (Defect A)", () => {
  test("pressing Send repeatedly records one proposal", () => {
    /* THE REGRESSION. Three identical sends used to append three entries. */
    const w = world();
    market(w, w.ids[0], "collector", "propose", 2050);
    market(w, w.ids[0], "collector", "propose", 2050);
    market(w, w.ids[0], "collector", "propose", 2050);
    eq(w.card(w.ids[0]).valueThread.length, 1, "one move, one entry");
    eq(w.card(w.ids[0]).collectorMarket, 2050, "with the proposal standing");
  });

  test("a different amount cannot be slipped in while waiting either", () => {
    const w = world();
    market(w, w.ids[0], "collector", "propose", 2050);
    market(w, w.ids[0], "collector", "propose", 9999);
    eq(w.card(w.ids[0]).collectorMarket, 2050, "the standing proposal is unchanged");
    eq(w.card(w.ids[0]).valueThread.length, 1, "and nothing was appended");
  });

  test("the same rule holds for percentages", () => {
    const w = world();
    market(w, w.ids[0], "tp", "propose", 2050);
    market(w, w.ids[0], "collector", "accept");
    percent(w, w.ids[0], "tp", "propose", 0.9);
    percent(w, w.ids[0], "collector", "propose", 0.8);
    percent(w, w.ids[0], "collector", "propose", 0.8);
    eq(w.card(w.ids[0]).percentThread.length, 2, "their proposal, then one counter");
  });

  test("the back-and-forth still works", () => {
    const w = world();
    market(w, w.ids[0], "collector", "propose", 2050);
    market(w, w.ids[0], "tp", "propose", 1900);
    market(w, w.ids[0], "collector", "propose", 2000);
    market(w, w.ids[0], "tp", "accept");
    eq(w.card(w.ids[0]).valueThread.map((e) => e.by + ":" + e.amount).join(" | "),
      "collector:2050 | tp:1900 | collector:2000 | tp:2000",
      "alternating turns are the normal case");
    eq(w.card(w.ids[0]).agreedMarket, 2000, "settled at the standing proposal");
  });

  test("the waiting actor has no send control", () => {
    const vc = render({ agreedMarket: null, collectorMarket: 2050, tpMarket: null,
      valueThread: [{ by: "collector", type: "propose", amount: 2050, at: AT }] });
    assert(/is reviewing it/.test(txt(cls(vc, "vp-wait")[0])), "the screen says who has it");
    assert(!labels(vc).some((t) => /^Send /.test(t)),
      "and offers no way to send again: " + labels(vc).join(" | "));
    assert(!labels(vc).some((t) => /^Accept /.test(t)), "nor to accept their own proposal");
  });
});

describe("B. The inert percentage send (Defect B)", () => {
  test("the partner opens the percentage phase — the collector cannot", () => {
    /* Not missing copy: the reducer correctly refuses, and the UI was offering
       a control that could never work. */
    const w = world();
    market(w, w.ids[0], "tp", "propose", 2050);
    market(w, w.ids[0], "collector", "accept");
    percent(w, w.ids[0], "collector", "propose", 0.9);
    eq(w.card(w.ids[0]).percentThread.length, 0, "the domain refuses, as designed");
  });

  test("so the collector is shown a waiting state, not an editor", () => {
    const vc = render(MARKET_AGREED);
    const waits = cls(vc, "vp-wait").map(txt);
    assert(waits.some((t) => /Waiting on Northline Cards to propose/.test(t)),
      "it says what is being waited for: " + waits.join(" | "));
    assert(!labels(vc).some((t) => /Enter a percentage/.test(t)),
      "and offers no control that would silently do nothing");
  });

  test("once they propose, the collector can act", () => {
    const vc = render({ ...MARKET_AGREED, tpPercent: 0.9,
      percentThread: [{ by: "tp", type: "propose", percent: 0.9, at: AT }] });
    assert(labels(vc).some((t) => /^Accept 90%$/.test(t)),
      "with the standing proposal named: " + labels(vc).join(" | "));
    assert(cls(vc, "vp-linked")[0], "and a counter editor");
  });

  test("the collector's counter is recorded once and hands the turn back", () => {
    const w = world();
    market(w, w.ids[0], "tp", "propose", 2050);
    market(w, w.ids[0], "collector", "accept");
    percent(w, w.ids[0], "tp", "propose", 0.9);
    percent(w, w.ids[0], "collector", "propose", 0.8);
    eq(w.card(w.ids[0]).percentThread.length, 2, "recorded exactly once");
    eq(D.TRADE.negotiationState(w.card(w.ids[0]), "percent", "collector").state, "waiting",
      "and the collector is now waiting");
    eq(D.TRADE.negotiationState(w.card(w.ids[0]), "percent", "tp").state, "theirs",
      "while the partner holds the move");
  });
});

describe("C. One state, read the same way by both seats", () => {
  const tc = () => M.emptyTradeCard("ka", null, null, "b-a");

  test("the six states are exhaustive and opposite", () => {
    let c = tc();
    eq(D.TRADE.negotiationState(c, "market", "collector").state, "open", "nobody has proposed");
    eq(D.TRADE.negotiationState(c, "percent", "collector").state, "locked",
      "and percentage is not open at all");

    c = D.TRADE.applyMarket(c, "collector", "propose", 2050, AT);
    eq(D.TRADE.negotiationState(c, "market", "collector").state, "waiting", "the proposer waits");
    eq(D.TRADE.negotiationState(c, "market", "tp").state, "theirs", "the other holds it");

    c = D.TRADE.applyMarket(c, "tp", "accept", null, AT);
    eq(D.TRADE.negotiationState(c, "market", "collector").state, "settled", "then it is settled");
    eq(D.TRADE.negotiationState(c, "market", "tp").state, "settled", "for both");
    eq(D.TRADE.negotiationState(c, "percent", "collector").state, "blocked",
      "and percentage opens for the partner only");
    eq(D.TRADE.negotiationState(c, "percent", "tp").state, "open", "who may propose");
  });

  test("the standing value and its author come with the state", () => {
    let c = D.TRADE.applyMarket(tc(), "tp", "propose", 2050, AT);
    const seen = D.TRADE.negotiationState(c, "market", "collector");
    eq(seen.state, "theirs", "a proposal is on the table");
    eq(seen.standing, 2050, "with its value");
    eq(seen.by, "tp", "and who made it — no inferring from history");
  });

  test("an agreed value is never confused with a proposed one", () => {
    let c = D.TRADE.applyMarket(tc(), "tp", "propose", 2050, AT);
    eq(c.agreedMarket, null, "a proposal is not an agreement");
    eq(D.TRADE.negotiationState(c, "market", "collector").state, "theirs", "it is still open");
    c = D.TRADE.applyMarket(c, "collector", "accept", null, AT);
    eq(c.agreedMarket, 2050, "acceptance settles it");
    eq(D.TRADE.negotiationState(c, "market", "collector").state, "settled", "and it reads settled");
  });

  test("the Collector UI renders the projection rather than deriving turns", () => {
    const src = code(COL).slice(code(COL).indexOf("function ValueCard("),
      code(COL).indexOf("function ValueCard(") + 8000);
    assert(/D\.TRADE\.negotiationState\(tcd, "market", "collector"\)/.test(src),
      "market state comes from the domain");
    assert(/D\.TRADE\.negotiationState\(tcd, "percent", "collector"\)/.test(src),
      "and so does percentage state");
    assert(!/tcd\.tpMarket != null && tcd\.agreedMarket == null/.test(src),
      "no local re-derivation of whose move it is");
  });

  test("accept takes the standing proposal, not a stale parameter", () => {
    const w = world();
    market(w, w.ids[0], "tp", "propose", 2050);
    market(w, w.ids[0], "collector", "accept", 99);
    eq(w.card(w.ids[0]).agreedMarket, 2050, "the amount argument cannot alter it");
  });
});

describe("D. Dollars and percentages are one proposal", () => {
  test("editing the percentage updates the dollars", () => {
    render({ ...MARKET_AGREED, tpPercent: 0.9,
      percentThread: [{ by: "tp", type: "propose", percent: 0.9, at: AT }] });
    TR.act(() => { field("Trade percentage").props.onChange({ target: { value: "90" } }); });
    eq(field("Trade value in dollars").props.value, "1845",
      "90% of $2,050 is $1,845");
  });

  test("editing the dollars updates the percentage", () => {
    render({ ...MARKET_AGREED, tpPercent: 0.9,
      percentThread: [{ by: "tp", type: "propose", percent: 0.9, at: AT }] });
    TR.act(() => { field("Trade value in dollars").props.onChange({ target: { value: "1845" } }); });
    eq(field("Trade percentage").props.value, "90", "and back again");
  });

  test("both resolve through the canonical helpers", () => {
    eq(D.tradeValueAt(2050, 0.9), 1845, "percentage to dollars");
    const src = code(COL).slice(code(COL).indexOf("const pctToMoney"),
      code(COL).indexOf("const pctToMoney") + 600);
    assert(/D\.tradeValueAt\(/.test(src), "the UI converts with the domain helper");
    assert(/percentageOf\(/.test(src), "in both directions");
    assert(!/\* 100|\/ 2050|Math\.round\(Number\(v\) \* /.test(src),
      "and does no arithmetic of its own");
  });

  test("both fields carry their unit", () => {
    const vc = render({ ...MARKET_AGREED, tpPercent: 0.9,
      percentThread: [{ by: "tp", type: "propose", percent: 0.9, at: AT }] });
    const marks = cls(vc, "vp-unit-m").map(txt);
    assert(marks.includes("%") && marks.includes("$"), "both units shown: " + marks.join(","));
    assert(field("Trade percentage"), "a labelled percentage field");
    assert(field("Trade value in dollars"), "and a labelled dollar field");
  });

  test("the sent proposal is the same either way", () => {
    const w = world();
    market(w, w.ids[0], "tp", "propose", 2050);
    market(w, w.ids[0], "collector", "accept");
    percent(w, w.ids[0], "tp", "propose", 0.95);
    percent(w, w.ids[0], "collector", "propose", 0.9);
    eq(w.card(w.ids[0]).collectorPercent, 0.9, "stored as the canonical fraction");
    percent(w, w.ids[0], "tp", "accept");
    eq(D.tradeValueOf(w.card(w.ids[0])), 1845, "and worth $1,845 toward the card");
  });
});

describe("E. Multi-card independence and identity", () => {
  test("two rows negotiate entirely separately", () => {
    const w = world(2);
    market(w, w.ids[0], "tp", "propose", 2050);
    market(w, w.ids[0], "collector", "accept");
    percent(w, w.ids[0], "tp", "propose", 0.9);
    percent(w, w.ids[0], "collector", "accept");

    market(w, w.ids[1], "tp", "propose", 900);
    market(w, w.ids[1], "collector", "accept");
    percent(w, w.ids[1], "tp", "propose", 0.75);
    percent(w, w.ids[1], "collector", "accept");

    eq(D.tradeValueOf(w.card(w.ids[0])), 1845, "$2,050 x 90%");
    eq(D.tradeValueOf(w.card(w.ids[1])), 675, "$900 x 75%");
    eq(D.totalTradeValue(w.get()), 2520, "totalling $2,520");
  });

  test("a turn on one row is not a turn on the other", () => {
    const w = world(2);
    market(w, w.ids[0], "collector", "propose", 2050);
    eq(D.TRADE.negotiationState(w.card(w.ids[0]), "market", "collector").state, "waiting",
      "the row acted on is waiting");
    eq(D.TRADE.negotiationState(w.card(w.ids[1]), "market", "collector").state, "open",
      "the other is still the collector's to open");
  });

  test("addressing by binderId mutates nothing", () => {
    const w = world(2);
    market(w, "b-a", "collector", "propose", 2050);
    eq(w.card(w.ids[0]).collectorMarket, null, "a binder id addresses no row");
    eq(w.card(w.ids[1]).collectorMarket, null, "and certainly not a sibling");
  });

  test("withdrawal preserves history and the stage rule", () => {
    const w = world(2);
    market(w, w.ids[0], "tp", "propose", 2050);
    market(w, w.ids[0], "collector", "accept");
    percent(w, w.ids[0], "tp", "propose", 0.9);
    percent(w, w.ids[0], "collector", "accept");
    eq(w.get().stage, "value-trade", "one row still unsettled");
    w.st.actions.withdrawTradeCard({ oppId: w.o, tradeCardId: w.ids[1], at: AT });
    eq(w.get().stage, "deal", "removing it closes the stage canonically");
    eq(w.card(w.ids[0]).valueThread.length, 2, "and history is untouched");
  });
});

describe("F. Nothing else moved", () => {
  test("Agree on Price keeps its own grammar", () => {
    /* Same semantics, already shared: one standing proposal, accept takes it. */
    const w = world();
    eq(D.lastEntry(w.get().priceThread).type, "accept", "price settled by acceptance");
    eq(w.get().agreedPrice, 3990, "at the standing figure");
  });

  test("stage progression is still canonical", () => {
    const w = world();
    market(w, w.ids[0], "tp", "propose", 2050);
    market(w, w.ids[0], "collector", "accept");
    percent(w, w.ids[0], "tp", "propose", 0.9);
    eq(w.get().stage, "value-trade", "an open percentage keeps the stage");
    percent(w, w.ids[0], "collector", "accept");
    eq(w.get().stage, "deal", "settling the last term advances it");
  });

  test("the Collector writes no canonical field", () => {
    const active = code(COL);
    const vc = active.slice(active.indexOf("function ValueCard("),
      active.indexOf("function ValueCard(") + 8000);
    ["agreedMarket:", "agreedPercent:", "withdrawn:", "stage:"].forEach((f) =>
      assert(!vc.includes(f), "no direct write of " + f));
  });

  test("the lifecycle is unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
  });
});

require("./run.cjs").run();
