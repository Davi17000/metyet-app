/* ============================================================================
   SHARED BUSINESS EVENT → ONE CANONICAL ACTION → BOTH SEATS CALL IT

   The rules for market value, trade percentage and deal adjustment were already
   pure, actor-parameterised reducers — but they lived inside the Trusted
   Partner's React module. The Collector could not reach them, so it grew its
   own shortcuts: writing `agreedMarket` and `agreedPercent` directly with no
   thread history, agreeing on the partner's behalf, and inventing a fulfillment
   plan ("Meet in person / To arrange / To arrange") that no partner proposed.

   Nothing about the rules changed in this pass. They moved BENEATH both seats,
   and each business event now has exactly one canonical action that names who
   is acting. The consequence that matters most: `by` decides whose agreement
   moves, so no seat can assert the other's.
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
const DOM = fs.readFileSync(path.join(ROOT, "domain", "metyet-domain.js"), "utf8");
const STORE = fs.readFileSync(path.join(ROOT, "domain", "metyet-store.js"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const AT = "2026-08-19";

const CARD = { id: "k1", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };

/* A deal with one accepted trade card, sitting at Value Trade. */
const world = () => {
  const st = createStore({
    catalog: [CARD], collectors: [{ id: "casey", name: "Casey", prefs: [] }],
    partners: [{ id: "nl", name: "Northline Cards" }],
    goals: [], binder: [], interests: [], conversations: [], opportunities: [],
    preferences: [], photoRequests: [], copyReviews: [],
    inventory: [{ invId: "inv-1", partnerId: "nl", cardId: "k1", ask: 4000,
      archived: false, photos: { front: "f", back: "b" } }],
  });
  const g = st.actions.addGoal({ collectorId: "casey", cardId: "k1", tier: "primary", at: AT });
  const o = st.actions.startOpportunity({ goalId: g, collectorId: "casey", partnerId: "nl",
    cardId: "k1", invId: "inv-1", listedPrice: 4000, amount: 3600, at: AT });
  st.actions.agreePrice({ oppId: o, amount: 3600, by: "tp", at: AT });
  const tc = M.emptyTradeCard("k1", null, null, "b1");
  st.actions.patchOpportunity(o, (x) => ({ ...x,
    trade: { ...x.trade, submitted: true, cards: [{ ...tc, inclusion: "accepted" }] } }));
  const get = () => st.get().opportunities.find((x) => x.id === o);
  return { st, o, tcId: tc.id, get, card: () => get().trade.cards[0] };
};
const atDeal = (w) => w.st.actions.patchOpportunity(w.o,
  (x) => ({ ...x, stage: "deal", deal: { adjThread: [] } }));
const settle = (w) => {
  const a = w.st.actions;
  a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "tp", action: "propose", amount: 1804, at: AT });
  a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "collector", action: "accept", at: AT });
  a.tradePercentRespond({ oppId: w.o, tradeCardId: w.tcId, by: "tp", action: "propose", percent: 0.8, at: AT });
  a.tradePercentRespond({ oppId: w.o, tradeCardId: w.tcId, by: "collector", action: "accept", at: AT });
};

describe("A. Market value: one rule, both seats, full history", () => {
  test("a full round trip is preserved in the thread", () => {
    const w = world();
    const a = w.st.actions;
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "collector", action: "propose", amount: 1900, at: AT });
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "tp", action: "propose", amount: 1804, at: AT });
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "collector", action: "accept", at: AT });
    eq(w.card().valueThread.map((e) => e.by + ":" + e.type + ":" + e.amount).join(" | "),
      "collector:propose:1900 | tp:propose:1804 | collector:accept:1804",
      "every move is traceable — the old shortcut recorded none of this");
  });

  test("the agreed value is the standing proposal, never typed in", () => {
    const w = world();
    const a = w.st.actions;
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "tp", action: "propose", amount: 1804, at: AT });
    /* Accepting takes the OTHER side's figure; the amount argument is ignored. */
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "collector", action: "accept", amount: 99, at: AT });
    eq(w.card().agreedMarket, 1804, "settled at what was actually proposed");
  });

  test("accepting with nothing standing settles nothing", () => {
    const w = world();
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "collector", action: "accept", at: AT });
    eq(w.card().agreedMarket, null, "there was no proposal to accept");
  });

  test("an agreed market is closed", () => {
    const w = world();
    const a = w.st.actions;
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "tp", action: "propose", amount: 1804, at: AT });
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "collector", action: "accept", at: AT });
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "tp", action: "propose", amount: 1, at: AT });
    eq(w.card().agreedMarket, 1804, "a settled value does not reopen by proposal");
  });
});

describe("B. Trade percentage: gated, per card, per seat", () => {
  test("percentage cannot open before the market is agreed", () => {
    const w = world();
    w.st.actions.tradePercentRespond({ oppId: w.o, tradeCardId: w.tcId, by: "tp", action: "propose", percent: 0.8, at: AT });
    eq(w.card().tpPercent, null, "market first — the sequence is the product rule");
    eq(w.card().percentThread.length, 0, "and nothing is recorded");
  });

  test("once market is agreed, the partner opens and the collector answers", () => {
    const w = world();
    const a = w.st.actions;
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "tp", action: "propose", amount: 1804, at: AT });
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "collector", action: "accept", at: AT });
    /* The collector cannot open this phase. */
    a.tradePercentRespond({ oppId: w.o, tradeCardId: w.tcId, by: "collector", action: "propose", percent: 0.9, at: AT });
    eq(w.card().collectorPercent, null, "the partner proposes the percentage");
    a.tradePercentRespond({ oppId: w.o, tradeCardId: w.tcId, by: "tp", action: "propose", percent: 0.8, at: AT });
    a.tradePercentRespond({ oppId: w.o, tradeCardId: w.tcId, by: "collector", action: "accept", at: AT });
    eq(w.card().agreedPercent, 0.8, "and the collector agrees to it");
    eq(w.card().percentThread.map((e) => e.by + ":" + e.type).join(" | "),
      "tp:propose | collector:accept", "with the exchange recorded");
  });

  test("the economics are unchanged", () => {
    const w = world();
    settle(w);
    eq(D.tradeValueOf(w.card()), 1443, "$1,804 x 80% = $1,443, as before");
    eq(D.totalTradeValue(w.get()), 1443, "and totals from the per-card figures");
  });

  test("each card is negotiated independently", () => {
    /* Addressing by row id, not binderId — two rows for one binder copy differ. */
    const w = world();
    const b = M.emptyTradeCard("k1", null, null, "b1");
    w.st.actions.patchOpportunity(w.o, (x) => ({ ...x, trade: { ...x.trade,
      cards: [...x.trade.cards, { ...b, inclusion: "accepted" }] } }));
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "tp", action: "propose", amount: 1804, at: AT });
    const cards = w.get().trade.cards;
    eq(cards[0].tpMarket, 1804, "the addressed card moved");
    eq(cards[1].tpMarket, null, "and its sibling did not");
  });
});

describe("C. Deal agreement belongs to whoever acts", () => {
  test("the collector agrees for the collector only", () => {
    const w = world(); atDeal(w);
    w.st.actions.dealAgree({ oppId: w.o, by: "collector", at: AT });
    eq(w.get().deal.collectorAgreed, true, "their own bit is set");
    assert(!w.get().deal.tpAgreed, "and the partner's is not");
    eq(w.get().stage, "deal", "so the deal has not advanced");
  });

  test("the partner agrees for the partner only", () => {
    const w = world(); atDeal(w);
    w.st.actions.dealAgree({ oppId: w.o, by: "tp", at: AT });
    eq(w.get().deal.tpAgreed, true, "their own bit");
    assert(!w.get().deal.collectorAgreed, "and not the collector's");
  });

  test("mutual agreement requires both, and only then advances", () => {
    const w = world(); atDeal(w);
    w.st.actions.dealAgree({ oppId: w.o, by: "collector", at: AT });
    w.st.actions.dealAgree({ oppId: w.o, by: "tp", at: AT });
    eq(w.get().deal.tpAgreed && w.get().deal.collectorAgreed, true, "both agreed");
    eq(w.get().stage, "fulfillment", "and the deal moves on");
  });

  test("entering fulfillment fabricates no terms", () => {
    /* The defect this replaces invented "Meet in person / To arrange / To
       arrange" — a plan presented to the collector as if the partner had
       proposed it. Entering the stage creates unset state and nothing else. */
    const w = world(); atDeal(w);
    w.st.actions.dealAgree({ oppId: w.o, by: "collector", at: AT });
    w.st.actions.dealAgree({ oppId: w.o, by: "tp", at: AT });
    const f = w.get().fulfillment;
    ["method", "where", "when"].forEach((k) => assert(f[k] == null, k + " is unset"));
    assert(!f.proposedAt, "nobody has proposed anything");
    assert(!f.collectorConfirmedPlan, "and nobody has agreed to it");
    eq(D.FULFILLMENT.handedOff(f), false, "no handoff");
    eq(D.FULFILLMENT.received(f), false, "no receipt");
    assert(!/Meet in person/.test(JSON.stringify(f)), "and no invented method");
  });

  test("a re-opened balance withdraws both confirmations", () => {
    const w = world(); atDeal(w);
    w.st.actions.dealAgree({ oppId: w.o, by: "collector", at: AT });
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "tp", action: "propose", amount: 120, at: AT });
    assert(!w.get().deal.collectorAgreed, "a changed figure is not the one they agreed to");
    assert(!w.get().deal.tpAgreed, "for either side");
  });

  test("agreeing the deal never touches upstream card economics", () => {
    const w = world();
    settle(w);
    const before = JSON.stringify(w.card());
    atDeal(w);
    w.st.actions.dealAgree({ oppId: w.o, by: "collector", at: AT });
    w.st.actions.dealAgree({ oppId: w.o, by: "tp", at: AT });
    eq(JSON.stringify(w.get().trade.cards[0]), before,
      "market value and percentage stay settled");
  });
});

describe("D. Fulfillment: propose, agree, then two completions", () => {
  const atFulfillment = () => {
    const w = world(); settle(w); atDeal(w);
    w.st.actions.dealAgree({ oppId: w.o, by: "collector", at: AT });
    w.st.actions.dealAgree({ oppId: w.o, by: "tp", at: AT });
    return w;
  };

  test("the partner proposes and the collector sees exactly that", () => {
    const w = atFulfillment();
    w.st.actions.proposeFulfillment({ oppId: w.o,
      plan: { method: "Meet in person", where: "Duluth", when: "Saturday" }, at: AT });
    const f = w.get().fulfillment;
    eq(f.method + " / " + f.where + " / " + f.when, "Meet in person / Duluth / Saturday",
      "one record, both seats read it");
    eq(f.proposedAt, AT, "with a proposal time");
    eq(f.collectorConfirmedPlan, false, "and no agreement yet");
  });

  test("agreeing the plan is separate from proposing it", () => {
    const w = atFulfillment();
    w.st.actions.confirmFulfillmentPlan({ oppId: w.o, at: AT });
    assert(!w.get().fulfillment.collectorConfirmedPlan,
      "there is nothing to confirm before a proposal exists");
    w.st.actions.proposeFulfillment({ oppId: w.o, plan: { method: "Ship", where: "MN", when: "Fri" }, at: AT });
    w.st.actions.confirmFulfillmentPlan({ oppId: w.o, at: AT });
    eq(w.get().fulfillment.collectorConfirmedPlan, true, "and true once there is");
  });

  test("requesting a revision unsettles the plan without erasing it", () => {
    const w = atFulfillment();
    w.st.actions.proposeFulfillment({ oppId: w.o, plan: { method: "Ship", where: "MN", when: "Fri" }, at: AT });
    w.st.actions.confirmFulfillmentPlan({ oppId: w.o, at: AT });
    w.st.actions.requestFulfillmentRevision({ oppId: w.o, note: "Weekend better", at: AT });
    const f = w.get().fulfillment;
    eq(f.collectorConfirmedPlan, false, "no longer agreed");
    eq(f.revisionRequested.note, "Weekend better", "with the reason recorded");
    eq(f.method, "Ship", "and the proposal still visible");
  });

  test("completion is blocked until the plan is agreed", () => {
    const w = atFulfillment();
    w.st.actions.confirmHandoff({ oppId: w.o, by: "tp", at: AT });
    eq(D.FULFILLMENT.handedOff(w.get().fulfillment), false,
      "you cannot complete an exchange nobody has agreed to");
  });

  test("handoff and receipt are two acts, and one action never does both", () => {
    const w = atFulfillment();
    w.st.actions.proposeFulfillment({ oppId: w.o, plan: { method: "Ship", where: "MN", when: "Fri" }, at: AT });
    w.st.actions.confirmFulfillmentPlan({ oppId: w.o, at: AT });

    w.st.actions.confirmHandoff({ oppId: w.o, by: "tp", at: AT });
    eq(D.FULFILLMENT.handedOff(w.get().fulfillment), true, "the partner handed over");
    eq(D.FULFILLMENT.received(w.get().fulfillment), false, "the collector has not confirmed");
    eq(w.get().stage, "fulfillment", "so it is not complete");

    w.st.actions.confirmHandoff({ oppId: w.o, by: "collector", at: AT });
    eq(D.FULFILLMENT.received(w.get().fulfillment), true, "now they have");
    eq(w.get().stage, "completed", "and only now is it complete");
  });
});

describe("E. Cash-only, and one implementation per rule", () => {
  test("choosing cash is canonical and distinguishable from undecided", () => {
    const w = world();
    w.st.actions.patchOpportunity(w.o, (x) => ({ ...x, stage: "select-trade" }));
    eq(w.get().trade.mode, undefined, "undecided has no mode");
    w.st.actions.chooseCashOnly({ oppId: w.o, at: AT });
    eq(w.get().trade.mode, "cash", "deciding records the decision");
    eq(w.get().trade.cashOnlyAt, AT, "and when it was made");
    eq(w.get().stage, "deal", "moving past valuation, with nothing to value");
    eq(D.totalTradeValue(w.get()), 0, "and no trade credit");
  });

  test("the negotiation rules live in the domain, once", () => {
    assert(/TRADE = \{ applyMarket/.test(code(DOM)), "the shared rules are exported");
    ["applyMarket", "applyPercent", "applyDealAdjustment"].forEach((k) =>
      assert(typeof D.TRADE[k] === "function", k + " is reachable by both seats"));
    /* And the Trusted Partner no longer owns a private copy. */
    const tp = code(TP);
    assert(!/function tcApplyMarket\(/.test(tp), "no TP-local market rule");
    assert(!/function tcApplyPercent\(/.test(tp), "no TP-local percentage rule");
    assert(!/function dealApplyAdj\(/.test(tp), "no TP-local adjustment rule");
    assert(/SharedID\.TRADE\.applyMarket/.test(tp), "the TP calls the shared rule");
  });

  test("no Collector stage handler writes a canonical business field", () => {
    /* The guard against regression: these fields are OUTPUT of a rule, never
       something a UI layer assigns. */
    const handlers = code(COL).slice(code(COL).indexOf("marketRespond:"),
      code(COL).indexOf("const go = (n) => setNav(n)"));
    ["agreedMarket", "agreedPercent", "tpAgreed", "collectorAgreed",
      "tpHandoff", "collectorReceipt"].forEach((f) =>
      assert(!new RegExp(f + "\\s*[:=]").test(handlers),
        "no direct write to " + f + " in the Collector's stage handlers"));
    assert(!/method:\s*"/.test(handlers), "and no invented fulfillment terms");
  });

  test("the Collector's stage handlers call canonical actions", () => {
    const active = code(COL);
    ["tradeMarketRespond", "tradePercentRespond", "dealAdjustRespond", "dealAgree",
      "confirmFulfillmentPlan", "requestFulfillmentRevision", "confirmHandoff",
      "chooseCashOnly"].forEach((a) =>
      assert(new RegExp("A\\." + a + "\\(").test(active), "the Collector calls " + a));
  });

  test("agreement actions name the actor rather than assuming one", () => {
    const store = code(STORE);
    assert(/\[by === "tp" \? "tpAgreed" : "collectorAgreed"\]/.test(store),
      "deal agreement moves exactly one bit, chosen by the actor");
    assert(/\[by === "tp" \? "tpHandoff" : "collectorReceipt"\]/.test(store),
      "and so does completion");
  });

  test("the lifecycle is unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
  });
});

require("./run.cjs").run();
