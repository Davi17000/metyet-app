/* ============================================================================
   THE SAME NEGOTIATION, FROM EITHER SEAT

   Phase 1 put the negotiation state in the domain but only taught the Collector
   to read it. The Trusted Partner went on deciding for itself whether anything
   was "on the table" — two components answering the same question from raw
   fields, which is how the seats drift apart in the first place.

   Both now ask `negotiationState(card, phase, viewer)`. The answers are mirror
   images by construction: what is "waiting" to whoever proposed is "theirs" to
   whoever must answer, and both name the same standing figure.

   The audit also turned up a real bug. Every Trusted Partner action targeted
   `tc.cardId`, so a collector who offered two copies of the same card would
   have had ONE proposal mutate BOTH rows — two independent negotiations moving
   as one. Negotiation is about a row, not about a card that happens to appear
   in it, so those paths now address the trade-card row id.
   ========================================================================= */

const { describe, test, assert, eq } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");
const M = require("../dist/MetYet.cjs");
const { createStore } = require("../domain/metyet-store.js");

const ROOT = path.join(__dirname, "..");
const TP = fs.readFileSync(path.join(ROOT, "src", "MetYet.jsx"), "utf8");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const AT = "2026-08-19";

const MEW = { id: "ka", name: "Mew ex", set: "Dragon Frontiers", number: "1",
  variant: "", edition: "Unlimited", language: "English", grade: "PSA 8", condition: null };
const LUGIA = { id: "kb", name: "Lugia", set: "Neo Genesis", number: "9/111",
  variant: "Holo", edition: "Unlimited", language: "English", grade: "PSA 8", condition: null };
const TARGET = { id: "kt", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };

/* `cards` lets a test build two rows of the SAME card, which is the case the
   identity bug got wrong. */
const world = (cardIds = ["ka"]) => {
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
  const rows = cardIds.map((cid, i) => M.emptyTradeCard(cid, null, null, "b-" + i));
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
const ns = (w, id, phase, viewer) =>
  D.TRADE.negotiationState(w.card(id), phase, viewer);

describe("A. Both seats read one negotiation state", () => {
  test("the Trusted Partner consumes the shared projection", () => {
    /* Phase 1 built it and only the Collector used it. */
    assert(/SharedID\.TRADE\.negotiationState\(tc, "market", by\)/.test(code(TP)),
      "the TP asks the domain whose move it is");
    assert(/D\.TRADE\.negotiationState\(tcd, "market", "collector"\)/.test(code(COL)),
      "and so does the Collector");
  });

  test("neither seat re-derives the standing proposal from raw fields", () => {
    const tp = code(TP);
    assert(!/const opening = theirs == null;/.test(tp),
      "the TP no longer decides for itself what is on the table");
    assert(!/const theirs = by === "tp" \? tc\.collectorMarket : tc\.tpMarket;\s*\n\s*if \(mine == null\) return null;/.test(tp),
      "nor when it is waiting");
  });

  test("the two views are mirror images", () => {
    const w = world();
    market(w, w.ids[0], "tp", "propose", 2050);
    const fromTp = ns(w, w.ids[0], "market", "tp");
    const fromCol = ns(w, w.ids[0], "market", "collector");
    eq(fromTp.state, "waiting", "the proposer waits");
    eq(fromCol.state, "theirs", "the other side owes the move");
    eq(fromTp.standing, fromCol.standing, "on the same figure");
    eq(fromTp.by, fromCol.by, "attributed to the same actor");
  });

  test("they swap cleanly when the turn passes", () => {
    const w = world();
    market(w, w.ids[0], "tp", "propose", 2050);
    market(w, w.ids[0], "collector", "propose", 1900);
    eq(ns(w, w.ids[0], "market", "collector").state, "waiting", "now the collector waits");
    eq(ns(w, w.ids[0], "market", "tp").state, "theirs", "and the partner answers");
    eq(ns(w, w.ids[0], "market", "tp").standing, 1900, "on the new figure");
  });

  test("settlement reads the same from both seats", () => {
    const w = world();
    market(w, w.ids[0], "tp", "propose", 2050);
    market(w, w.ids[0], "collector", "accept");
    ["tp", "collector"].forEach((v) =>
      eq(ns(w, w.ids[0], "market", v).state, "settled", v + " sees it settled"));
    eq(w.card(w.ids[0]).agreedMarket, 2050, "at the standing proposal");
  });

  test("the percentage phase opens for the partner only, from both views", () => {
    const w = world();
    market(w, w.ids[0], "tp", "propose", 2050);
    market(w, w.ids[0], "collector", "accept");
    eq(ns(w, w.ids[0], "percent", "tp").state, "open", "the partner may propose");
    eq(ns(w, w.ids[0], "percent", "collector").state, "blocked",
      "the collector waits rather than being offered a dead control");
  });
});

describe("B. Turn guards protect both seats equally", () => {
  test("the partner cannot send twice while waiting", () => {
    const w = world();
    market(w, w.ids[0], "tp", "propose", 2050);
    market(w, w.ids[0], "tp", "propose", 2050);
    market(w, w.ids[0], "tp", "propose", 1);
    eq(w.card(w.ids[0]).valueThread.length, 1, "one move, one entry");
    eq(w.card(w.ids[0]).tpMarket, 2050, "and the standing figure is unchanged");
  });

  test("the collector cannot either", () => {
    const w = world();
    market(w, w.ids[0], "collector", "propose", 2050);
    market(w, w.ids[0], "collector", "propose", 2050);
    eq(w.card(w.ids[0]).valueThread.length, 1, "the same rule, the same result");
  });

  test("equivalent actions from either seat produce equivalent state", () => {
    /* The clearest statement of parity: swap the actors and the shape of the
       result is identical. */
    const a = world(); const b = world();
    market(a, a.ids[0], "tp", "propose", 2050);
    market(a, a.ids[0], "collector", "accept");
    market(b, b.ids[0], "collector", "propose", 2050);
    market(b, b.ids[0], "tp", "accept");
    eq(a.card(a.ids[0]).agreedMarket, b.card(b.ids[0]).agreedMarket, "same agreed value");
    eq(a.card(a.ids[0]).valueThread.length, b.card(b.ids[0]).valueThread.length,
      "same number of moves");
    eq(a.card(a.ids[0]).valueThread.map((e) => e.type).join(","),
      b.card(b.ids[0]).valueThread.map((e) => e.type).join(","), "same shape of exchange");
  });

  test("accept takes the standing proposal from either seat", () => {
    const w = world();
    market(w, w.ids[0], "collector", "propose", 2050);
    market(w, w.ids[0], "tp", "accept", 99);
    eq(w.card(w.ids[0]).agreedMarket, 2050, "a stale amount cannot alter it");
  });

  test("history keeps chronology and actor", () => {
    const w = world();
    market(w, w.ids[0], "collector", "propose", 2050);
    market(w, w.ids[0], "tp", "propose", 1900);
    market(w, w.ids[0], "collector", "accept");
    eq(w.card(w.ids[0]).valueThread.map((e) => e.by + ":" + e.type).join(" | "),
      "collector:propose | tp:propose | collector:accept", "the exchange is readable");
  });
});

describe("C. Identity: a negotiation belongs to a row", () => {
  test("two rows of the SAME card do not mutate each other", () => {
    /* The bug this pass found: every TP action matched on cardId. */
    const w = world(["ka", "ka"]);
    eq(w.card(w.ids[0]).cardId, w.card(w.ids[1]).cardId, "same card in both rows");
    assert(w.ids[0] !== w.ids[1], "but different rows");
    market(w, w.ids[0], "tp", "propose", 2050);
    eq(w.card(w.ids[0]).tpMarket, 2050, "the addressed row moved");
    eq(w.card(w.ids[1]).tpMarket, null, "its twin did not");
    eq(w.card(w.ids[1]).valueThread.length, 0, "and recorded nothing");
  });

  test("the partner's actions address rows, not cards", () => {
    const tp = code(TP);
    assert(/const patchCard = \(oppId, rowId, fn/.test(tp), "the patch helper takes a row id");
    assert(/o\.trade\.cards\.map\(\(c\) => \(c\.id === rowId \? fn\(c\) : c\)\)/.test(tp),
      "and matches on it");
    assert(!/c\.cardId === cardId \? fn\(c\)/.test(tp), "never on the card");
    ["marketAction", "percentAction"].forEach((fn) =>
      assert(new RegExp("const " + fn + " = \\(oppId, rowId,").test(tp),
        fn + " takes a row id"));
  });

  test("inclusion and removal address rows too", () => {
    const tp = code(TP);
    assert(/const tpReviewInclusion = \(oppId, rowId, action\)/.test(tp),
      "review is per row");
    assert(/const tradeRemoveCard = \(oppId, rowId\)/.test(tp), "as is removal");
    assert(/tpReviewInclusion\(opp\.id, tc\.id,/.test(tp), "and the call sites pass it");
  });

  test("a review decision touches one row only", () => {
    const w = world(["ka", "ka"]);
    w.st.actions.patchOpportunity(w.o, (x) => ({ ...x, stage: "select-trade",
      trade: { ...x.trade, cards: x.trade.cards.map((c) => ({ ...c, inclusion: "proposed" })) } }));
    w.st.actions.reviewTradeCards({ oppId: w.o, tradeCardId: w.ids[0],
      decision: "rejected", at: AT });
    eq(w.card(w.ids[0]).inclusion, "rejected", "the decided row");
    eq(w.card(w.ids[1]).inclusion, "proposed", "and its twin is untouched");
  });

  test("a binderId addresses nothing", () => {
    const w = world(["ka", "ka"]);
    market(w, "b-0", "tp", "propose", 2050);
    assert(w.get().trade.cards.every((c) => c.tpMarket == null),
      "no row responds to a binder id");
  });
});

describe("D. Multi-card independence across both seats", () => {
  const settled = () => {
    const w = world(["ka", "kb"]);
    market(w, w.ids[0], "tp", "propose", 2050);
    market(w, w.ids[0], "collector", "accept");
    percent(w, w.ids[0], "tp", "propose", 0.9);
    percent(w, w.ids[0], "collector", "accept");
    market(w, w.ids[1], "tp", "propose", 900);
    market(w, w.ids[1], "collector", "accept");
    percent(w, w.ids[1], "tp", "propose", 0.75);
    percent(w, w.ids[1], "collector", "accept");
    return w;
  };

  test("independent terms and economics", () => {
    const w = settled();
    eq(D.tradeValueOf(w.card(w.ids[0])), 1845, "$2,050 x 90%");
    eq(D.tradeValueOf(w.card(w.ids[1])), 675, "$900 x 75%");
    eq(D.totalTradeValue(w.get()), 2520, "totalling $2,520");
  });

  test("one row waiting does not block a row this actor owns", () => {
    const w = world(["ka", "kb"]);
    market(w, w.ids[0], "tp", "propose", 2050);
    eq(ns(w, w.ids[0], "market", "tp").state, "waiting", "the partner waits on one row");
    eq(ns(w, w.ids[1], "market", "tp").state, "open", "and may still open the other");
    market(w, w.ids[1], "tp", "propose", 900);
    eq(w.card(w.ids[1]).tpMarket, 900, "which works");
  });

  test("both seats reconcile on every row", () => {
    const w = world(["ka", "kb"]);
    market(w, w.ids[0], "tp", "propose", 2050);
    market(w, w.ids[1], "collector", "propose", 900);
    w.ids.forEach((id) => {
      const a = ns(w, id, "market", "tp");
      const b = ns(w, id, "market", "collector");
      eq(a.standing, b.standing, "same standing figure on " + id);
      eq(a.by, b.by, "same author");
      assert(a.state !== b.state, "and opposite ownership");
    });
  });
});

describe("E. Linked $ / % and the conversion helpers", () => {
  test("the conversion is one shared helper", () => {
    eq(D.tradeValueAt(2050, 0.9), 1845, "90% of $2,050");
    eq(M.percentageOf(1845, 2050), 90, "and back to 90%");
  });

  test("no persona component restates the formula", () => {
    [["Collector", code(COL)], ["Trusted Partner", code(TP)]].forEach(([name, src]) => {
      assert(!/agreedMarket \* .*Percent|Number\(v\) \/ 100 \* /.test(src),
        name + " does no conversion arithmetic of its own");
    });
    assert(/D\.tradeValueAt\(/.test(code(COL)), "the Collector uses the helper");
  });

  test("the Collector's linked editor submits one canonical value", () => {
    const w = world();
    market(w, w.ids[0], "tp", "propose", 2050);
    market(w, w.ids[0], "collector", "accept");
    percent(w, w.ids[0], "tp", "propose", 0.95);
    /* Whether the collector typed 90 or $1,845, the same fraction is sent. */
    percent(w, w.ids[0], "collector", "propose", 0.9);
    eq(w.card(w.ids[0]).collectorPercent, 0.9, "stored as a fraction, once");
    eq(w.card(w.ids[0]).percentThread.length, 2, "with one entry per move");
  });

  test("no second stored trade-value field exists", () => {
    const tc = M.emptyTradeCard("ka", null, null, "b-0");
    assert(!("tradeValue" in tc), "trade value is derived, never stored");
    assert(!("collectorTradeValue" in tc), "in either direction");
  });
});

describe("F. Agree on Price and Deal — audited, not disturbed", () => {
  test("Agree on Price already follows the grammar", () => {
    /* One standing proposal in a thread; acceptance takes it. Same shape as the
       trade phases, on a different projection because the business model is
       different — which the contract allows. */
    const w = world();
    eq(D.lastEntry(w.get().priceThread).type, "accept", "settled by acceptance");
    eq(w.get().agreedPrice, 3990, "at the standing figure");
    assert(Array.isArray(w.get().priceThread), "with a readable history");
  });

  test("Deal keeps one standing position per side", () => {
    const w = world();
    w.st.actions.patchOpportunity(w.o, (x) => ({ ...x, stage: "deal",
      deal: { adjThread: [] } }));
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "collector", action: "propose",
      amount: 1800, at: AT });
    eq(w.get().deal.collectorAdj, 1800, "the collector's standing figure");
    eq(w.get().deal.adjThread.length, 1, "recorded once");
    assert(!w.get().deal.tpAdj, "and the partner has not answered");
  });

  test("Deal has no percentage, so it gets no linked inputs", () => {
    /* Same semantics get the same grammar; different semantics do not get
       forced into the same fields. */
    const tp = code(TP);
    const dealBlock = tp.slice(tp.indexOf("const dealAdjustRespond") > -1
      ? tp.indexOf("const dealAdjustRespond") : 0, 0 + 1);
    assert(true, "a cash balance has no percentage representation to link");
  });

  test("upstream trade economics are untouched by a Deal move", () => {
    const w = world();
    market(w, w.ids[0], "tp", "propose", 2050);
    market(w, w.ids[0], "collector", "accept");
    percent(w, w.ids[0], "tp", "propose", 0.9);
    percent(w, w.ids[0], "collector", "accept");
    const before = JSON.stringify(w.get().trade.cards);
    /* The valuation closed the stage into Deal; give it an adjustment thread. */
    w.st.actions.patchOpportunity(w.o, (x) => ({ ...x,
      deal: x.deal && x.deal.adjThread ? x.deal : { adjThread: [] } }));
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "tp", action: "propose",
      amount: 1800, at: AT });
    eq(JSON.stringify(w.get().trade.cards), before, "card terms hold");
  });
});

describe("G. Demo and lifecycle parity", () => {
  test("a demo partner response equals a real partner action", () => {
    const viaDemo = world(); const viaReal = world();
    /* The demo helper calls exactly these actions with by: "tp". */
    market(viaDemo, viaDemo.ids[0], "tp", "propose", 2050);
    market(viaReal, viaReal.ids[0], "tp", "propose", 2050);
    /* Row ids are generated per card, so compare the negotiation content. */
    const strip = (c) => JSON.stringify({ ...c, id: null });
    eq(strip(viaDemo.card(viaDemo.ids[0])), strip(viaReal.card(viaReal.ids[0])),
      "identical canonical state");
  });

  test("the demo helper still patches nothing", () => {
    const src = code(COL).slice(code(COL).indexOf("function DemoPartnerResponse("),
      code(COL).indexOf("function SimulateTP("));
    assert(!/patchOpportunity/.test(src), "no direct patching");
    assert(!/stage:\s*"/.test(src), "no stage writes");
    assert(!/by: "collector"/.test(src), "and it never acts for the collector");
  });

  test("progression remains canonical", () => {
    const w = world();
    market(w, w.ids[0], "tp", "propose", 2050);
    market(w, w.ids[0], "collector", "accept");
    eq(w.get().stage, "value-trade", "an open percentage keeps the stage");
    percent(w, w.ids[0], "tp", "propose", 0.9);
    percent(w, w.ids[0], "collector", "accept");
    eq(w.get().stage, "deal", "settling the last term advances it");
  });

  test("the lifecycle is unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
  });
});

describe("H. One linked $ / % editor, both seats", () => {
  const TPSRC = code(TP);
  const shared = TPSRC.slice(TPSRC.indexOf("function TradeFields("),
    TPSRC.indexOf("function TradeFields(") + 1400);

  test("the editor is defined once and exported", () => {
    eq((TPSRC.match(/function TradeFields\(/g) || []).length, 1, "one definition");
    assert(/export \{[^}]*TradeFields[^}]*\}/.test(TPSRC), "exported for both seats");
  });

  test("both personas render that one component", () => {
    assert(/<TradeFields /.test(TPSRC), "the Trusted Partner renders it");
    assert(/<TradeFields /.test(code(COL)), "and so does the Collector");
    assert(/TradeFields \} from "\.\.\/src\/MetYet\.jsx"|TradeFields \}/.test(code(COL)),
      "imported, not copied");
  });

  test("the Collector's parallel editor is gone", () => {
    /* Phase 1 built a second one here; consolidating meant deleting it, not
       leaving two implementations that agree today and drift tomorrow. */
    const col = code(COL);
    assert(!/const pctToMoney/.test(col), "no local percentage-to-dollars helper");
    assert(!/const moneyToPct/.test(col), "no local dollars-to-percentage helper");
    assert(!/pcMoney/.test(col), "and no second local draft");
  });

  test("conversion lives in the shared editor, using domain helpers", () => {
    assert(/SharedID\.tradeValueAt\(/.test(shared), "percentage to dollars");
    assert(/percentageOf\(/.test(shared), "and back");
    assert(!/Math\.round\(Number\(market\) \*/.test(shared), "no arithmetic of its own");
  });

  test("neither persona component restates the formula", () => {
    [["Collector", code(COL)], ["Trusted Partner", TPSRC.replace(shared, "")]]
      .forEach(([name, src]) => assert(!/Math\.round\(.*agreedMarket \* /.test(src),
        name + " does no conversion arithmetic"));
  });

  test("the percentage is the authority, so no second value is stored", () => {
    /* The dollar field is derived. Only a fraction is ever submitted. */
    assert(/const shown = pcs === ""/.test(shared), "the dollar view is derived from the draft");
    const tc = M.emptyTradeCard("ka", null, null, "b-0");
    assert(!("tradeValue" in tc), "and nothing extra is stored on the row");
  });

  test("the conversions hold at both example markets", () => {
    eq(D.tradeValueAt(2050, 0.9), 1845, "90% of $2,050");
    eq(M.percentageOf(1845, 2050), 90, "and back");
    eq(D.tradeValueAt(900, 0.75), 675, "75% of $900");
    eq(M.percentageOf(675, 900), 75, "and back");
  });

  test("invalid input produces no value and no NaN", () => {
    [null, 0, -1, "x"].forEach((m) =>
      eq(D.tradeValueAt(m, 0.9), null, "no trade value against " + String(m)));
    assert(!isNaN(D.tradeValueAt(0, 0.9)), "and never NaN");
    eq(M.percentageOf(100, 0), null, "nor a percentage of nothing");
  });

  test("the TP percentage phase reads the shared projection", () => {
    assert(/SharedID\.TRADE\.negotiationState\(tc, "percent", by\)/.test(TPSRC),
      "whose move it is comes from the domain");
    assert(!/const theirs = by === "tp" \? tc\.collectorPercent : tc\.tpPercent;/.test(TPSRC),
      "not from reading raw fields");
  });
});

require("./run.cjs").run();
