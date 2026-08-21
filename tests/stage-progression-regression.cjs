/* ============================================================================
   A RESOLVED STAGE MUST NEVER STRAND ANYONE

   A browser test found the Collector accepted into a dead end: the partner had
   reviewed the offered card, the row read "They'll take it", the guidance said
   "They've finished reviewing. Move on to agreeing values" — and the deal was
   still sitting in Select Trade with nothing the collector could press.

   The cause was not the demo helper. The rule that closes a selection
   (`maybeCloseSelection`) lived inside the Trusted Partner's React module and
   ran only on that module's own review path. The canonical action never applied
   it. So the CARD state advanced, every projection derived from it advanced,
   and the STAGE did not — the same opportunity disagreeing with itself
   depending on which fact you asked about.

   Auditing the next transition found the identical defect one stage later:
   `maybeCloseValuation` was module-local too, so a fully agreed valuation left
   the deal parked in Value Trade.

   Both rules now live in the domain and run inside the canonical actions, which
   is what makes one review mean one outcome for both seats. These tests drive
   the real store, and would fail against the previous implementation for
   exactly the reason the browser showed.
   ========================================================================= */

const { describe, test, assert, eq } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");
const M = require("../dist/MetYet.cjs");
const { createStore } = require("../domain/metyet-store.js");

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const TP = fs.readFileSync(path.join(ROOT, "src", "MetYet.jsx"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const AT = "2026-08-19";

const A_CARD = { id: "ka", name: "Mew ex", set: "Pokemon 151", number: "193/165",
  variant: "SIR", edition: "Unlimited", language: "English", grade: "PSA 10", condition: null };
const B_CARD = { id: "kb", name: "Lugia", set: "Neo Genesis", number: "9/111",
  variant: "Holo", edition: "Unlimited", language: "English", grade: "PSA 8", condition: null };
const TARGET = { id: "kt", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };

/* A deal parked at Select Trade with whatever rows the test needs. */
const atSelectTrade = (rows) => {
  const st = createStore({
    catalog: [A_CARD, B_CARD, TARGET],
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
  st.actions.patchOpportunity(o, (x) => ({ ...x, stage: "select-trade",
    trade: { ...x.trade, submitted: true, cards: rows } }));
  const get = () => st.get().opportunities.find((x) => x.id === o);
  return { st, o, get, rows: () => get().trade.cards };
};
const cardA = () => M.emptyTradeCard("ka", null, null, "b-a");
const cardB = () => M.emptyTradeCard("kb", null, null, "b-b");

describe("A. The exact browser sequence", () => {
  test("accepting the only proposed card resolves the stage", () => {
    const w = atSelectTrade([cardA()]);
    eq(w.get().stage, "select-trade", "the deal starts in Select Trade");
    eq(w.rows()[0].inclusion, "proposed", "with the card awaiting review");

    w.st.actions.reviewTradeCards({ oppId: w.o, decision: "accepted", at: AT });

    eq(w.rows()[0].inclusion, "accepted", "the card is taken — 'They'll take it'");
    eq(w.rows().filter((c) => c.inclusion === "proposed").length, 0,
      "nothing is still awaiting review — 'They've finished reviewing'");
    /* THE ASSERTION THAT FAILS AGAINST THE OLD IMPLEMENTATION. */
    eq(w.get().stage, "value-trade",
      "and the stage follows, instead of stranding the collector in Select Trade");
  });

  test("the resolved state leaves somebody something to do", () => {
    const w = atSelectTrade([cardA()]);
    w.st.actions.reviewTradeCards({ oppId: w.o, decision: "accepted", at: AT });
    const turn = D.nextActor(w.get());
    assert(turn.actor, "somebody's move: " + JSON.stringify(turn));
    eq(D.acceptedTradeCards(w.get()).length, 1,
      "and a card to negotiate, ready for Value Trade");
  });

  test("the card keeps its identity and its empty negotiation fields", () => {
    const w = atSelectTrade([cardA()]);
    const before = w.rows()[0].id;
    w.st.actions.reviewTradeCards({ oppId: w.o, decision: "accepted", at: AT });
    const tc = w.rows()[0];
    eq(tc.id, before, "the same row");
    eq(tc.cardId, "ka", "the same card");
    eq(tc.binderId, "b-a", "the same physical copy");
    eq(tc.agreedMarket, null, "with nothing valued yet");
    eq(tc.valueThread.length, 0, "and no invented history");
    assert(tc.reviewedAt, "but the review itself is recorded");
  });
});

describe("B. Which states advance, and which wait", () => {
  test("a partial review waits", () => {
    const w = atSelectTrade([cardA(), cardB()]);
    w.st.actions.reviewTradeCards({ oppId: w.o, tradeCardId: w.rows()[0].id,
      decision: "accepted", at: AT });
    eq(w.get().stage, "select-trade",
      "one card is still unreviewed, so the selection is not resolved");
  });

  test("a fully resolved mixed review advances, carrying only the accepted", () => {
    const w = atSelectTrade([cardA(), cardB()]);
    const [a, b] = w.rows();
    w.st.actions.reviewTradeCards({ oppId: w.o, tradeCardId: a.id, decision: "accepted", at: AT });
    w.st.actions.reviewTradeCards({ oppId: w.o, tradeCardId: b.id, decision: "rejected", at: AT });
    eq(w.get().stage, "value-trade", "every proposal is resolved");
    eq(D.acceptedTradeCards(w.get()).map((c) => c.cardId).join(","), "ka",
      "and a rejected card never becomes a Value Trade row");
    eq(w.rows().length, 2, "though its row and history remain");
  });

  test("rejecting everything becomes a cash purchase, not a dead end", () => {
    const w = atSelectTrade([cardA()]);
    w.st.actions.reviewTradeCards({ oppId: w.o, decision: "rejected", at: AT });
    eq(w.get().stage, "deal", "there is nothing left to value");
    eq(w.get().trade.mode, "cash", "so it settles in cash");
    eq(D.totalTradeValue(w.get()), 0, "with no trade credit");
  });

  test("nothing submitted stays put", () => {
    const w = atSelectTrade([]);
    w.st.actions.patchOpportunity(w.o, (x) => ({ ...x,
      trade: { ...x.trade, submitted: false, cards: [] } }));
    w.st.actions.reviewTradeCards({ oppId: w.o, decision: "accepted", at: AT });
    eq(w.get().stage, "select-trade", "the collector has not offered anything yet");
  });

  test("choosing cash needs no fake trade cards", () => {
    const w = atSelectTrade([]);
    w.st.actions.patchOpportunity(w.o, (x) => ({ ...x,
      trade: { ...x.trade, submitted: false, cards: [] } }));
    w.st.actions.chooseCashOnly({ oppId: w.o, at: AT });
    eq(w.get().stage, "deal", "it goes straight to the balance");
    eq(w.get().trade.mode, "cash", "recorded as a decision");
    eq(w.get().trade.cards.length, 0, "and invents nothing to value");
  });

  test("the rule only ever moves a deal that is in Select Trade", () => {
    const w = atSelectTrade([cardA()]);
    w.st.actions.reviewTradeCards({ oppId: w.o, decision: "accepted", at: AT });
    eq(w.get().stage, "value-trade", "advanced once");
    w.st.actions.reviewTradeCards({ oppId: w.o, decision: "accepted", at: AT });
    eq(w.get().stage, "value-trade", "and a later call cannot move it again");
  });
});

describe("C. The same defect one stage later", () => {
  const atValueTrade = () => {
    const w = atSelectTrade([cardA()]);
    w.st.actions.reviewTradeCards({ oppId: w.o, decision: "accepted", at: AT });
    return w;
  };
  const settle = (w, id, market, percent) => {
    const a = w.st.actions;
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "tp", action: "propose", amount: market, at: AT });
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "accept", at: AT });
    a.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "tp", action: "propose", percent, at: AT });
    a.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "accept", at: AT });
  };

  test("agreeing the market alone does not end valuation", () => {
    const w = atValueTrade();
    const id = w.rows()[0].id;
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "tp", action: "propose", amount: 1804, at: AT });
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "accept", at: AT });
    eq(w.get().stage, "value-trade", "the percentage is still open");
  });

  test("settling the last open term advances to Deal", () => {
    const w = atValueTrade();
    settle(w, w.rows()[0].id, 1804, 0.8);
    eq(w.get().stage, "deal", "nothing is left to negotiate about the cards");
    eq(D.totalTradeValue(w.get()), 1443, "$1,804 x 80% = $1,443, carried forward");
  });

  test("one settled card does not settle a valuation with two", () => {
    const w = atSelectTrade([cardA(), cardB()]);
    w.st.actions.reviewTradeCards({ oppId: w.o, decision: "accepted", at: AT });
    settle(w, w.rows()[0].id, 1804, 0.8);
    eq(w.get().stage, "value-trade", "the second card is still unagreed");
    settle(w, w.rows()[1].id, 900, 0.75);
    eq(w.get().stage, "deal", "and only both together finish the stage");
    eq(D.totalTradeValue(w.get()), 2118, "$1,443 + $675");
  });

  test("withdrawing the last unagreed card can also settle it", () => {
    const w = atSelectTrade([cardA(), cardB()]);
    w.st.actions.reviewTradeCards({ oppId: w.o, decision: "accepted", at: AT });
    settle(w, w.rows()[0].id, 1804, 0.8);
    eq(w.get().stage, "value-trade", "one card outstanding");
    w.st.actions.withdrawTradeCard({ oppId: w.o, tradeCardId: w.rows()[1].id, at: AT });
    eq(w.get().stage, "deal", "removing it leaves nothing unresolved");
    eq(D.totalTradeValue(w.get()), 1443, "and it contributes nothing");
  });
});

describe("D. The whole lifecycle runs on canonical actions alone", () => {
  test("Select Trade through completion, with no direct stage writes", () => {
    const w = atSelectTrade([cardA()]);
    const a = w.st.actions;
    const seen = [];
    const note = () => seen.push(w.get().stage);

    a.reviewTradeCards({ oppId: w.o, decision: "accepted", at: AT }); note();
    const id = w.rows()[0].id;
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "tp", action: "propose", amount: 1804, at: AT });
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "accept", at: AT });
    a.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "tp", action: "propose", percent: 0.8, at: AT });
    a.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "accept", at: AT }); note();
    a.dealAgree({ oppId: w.o, by: "collector", at: AT });
    a.dealAgree({ oppId: w.o, by: "tp", at: AT }); note();
    a.proposeFulfillment({ oppId: w.o, plan: { method: "Meet in person", where: "Duluth", when: "Saturday" }, at: AT });
    a.confirmFulfillmentPlan({ oppId: w.o, at: AT });
    a.confirmHandoff({ oppId: w.o, by: "tp", at: AT });
    a.confirmHandoff({ oppId: w.o, by: "collector", at: AT }); note();

    eq(seen.join(" -> "), "value-trade -> deal -> fulfillment -> completed",
      "every transition follows from a real move by one of the two people");
  });

  test("no stage is ever waiting on nobody", () => {
    /* The dead-end in words: a stage nobody can act on and nothing can leave. */
    const w = atSelectTrade([cardA()]);
    w.st.actions.reviewTradeCards({ oppId: w.o, decision: "accepted", at: AT });
    ["value-trade"].forEach(() => {
      const turn = D.nextActor(w.get());
      assert(turn.actor, "at " + w.get().stage + " somebody has the move");
    });
  });
});

describe("E. The rule lives in one place, and no shortcut exists", () => {
  test("both closing rules are canonical", () => {
    ["closeSelection", "closeValuation", "selectTradeSettled", "valueTradeSettled"]
      .forEach((k) => assert(typeof D.TRADE[k] === "function", k + " is in the domain"));
  });

  test("the Trusted Partner uses the shared rules, not its own copies", () => {
    const tp = code(TP);
    assert(!/const maybeCloseSelection = \(o\) => \{/.test(tp), "no TP-local selection rule");
    assert(!/const maybeCloseValuation = \(o\) =>\s*\n?\s*valueTradeSettled/.test(tp),
      "no TP-local valuation rule");
    assert(/SharedID\.TRADE\.closeSelection/.test(tp), "it calls the shared one");
    assert(/SharedID\.TRADE\.closeValuation/.test(tp), "and the other");
  });

  test("the demo helper takes no shortcut", () => {
    const src = code(COL).slice(code(COL).indexOf("function DemoPartnerResponse("),
      code(COL).indexOf("function SimulateTP("));
    /* Reading o.stage to decide which response is valid is exactly right; the
       forbidden thing is WRITING one. */
    assert(!/stage:\s*"/.test(src), "it never writes a stage");
    assert(!/patchOpportunity/.test(src), "and never patches the opportunity");
    const reads = (src.match(/o\.stage === "/g) || []).length;
    assert(reads > 0, "it reads the stage to choose a valid response (" + reads + " checks)");
    assert(!/inclusion:/.test(src), "and never patches acceptance directly");
    assert(/A\.reviewTradeCards\(/.test(src), "it calls the canonical review");
  });

  test("the demo response and a real partner review produce the same stage", () => {
    /* Both go through the one action, so this is parity by construction —
       asserted anyway, because that was exactly the thing that had drifted. */
    const viaDemo = atSelectTrade([cardA()]);
    viaDemo.st.actions.reviewTradeCards({ oppId: viaDemo.o, decision: "accepted", at: AT });
    const viaRow = atSelectTrade([cardA()]);
    viaRow.st.actions.reviewTradeCards({ oppId: viaRow.o,
      tradeCardId: viaRow.rows()[0].id, decision: "accepted", at: AT });
    eq(viaDemo.get().stage, viaRow.get().stage, "same outcome, whoever asked");
    eq(viaDemo.get().stage, "value-trade", "and it is the right one");
  });

  test("the lifecycle and economics are unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
    eq(D.tradeValueOf({ inclusion: "accepted", agreedMarket: 900, agreedPercent: 0.75 }), 675,
      "and the formula is untouched");
  });
});

require("./run.cjs").run();
