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
const { createStore } = require("./fixture-store.cjs");   // hand-built worlds declare their Relationships (contract §2)

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const TP = fs.readFileSync(path.join(ROOT, "src", "MetYet.jsx"), "utf8");
const DOM = fs.readFileSync(path.join(ROOT, "domain", "metyet-domain.js"), "utf8");
const STORE = fs.readFileSync(path.join(ROOT, "domain", "metyet-store.js"), "utf8");
const COMMANDS = fs.readFileSync(path.join(ROOT, "domain", "metyet-commands.js"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const AT = "2026-08-19";

const CARD = { id: "k1", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };

/* A deal with one accepted trade card, sitting at Value Trade.
   PHASE 1: reached through the canonical path — the package is submitted and
   accepted by the partner, rather than written onto the record — because the
   command layer only accepts Value Trade moves at the Value Trade stage. */
const world = () => {
  const st = createStore({
    catalog: [CARD], collectors: [{ id: "casey", name: "Casey", prefs: [] }],
    partners: [{ id: "nl", name: "Northline Cards" }],
    binders: [], binderEntries: [],
    goals: [], interests: [], conversations: [], opportunities: [],
    collectorCopies: [{ offered: true, id: "b1", collectorId: "casey", cardId: "k1", market: 1900, photos: { front: "f", back: "b" } },
      { offered: true, id: "b2", collectorId: "casey", cardId: "k1", market: 1700, photos: { front: "f", back: "b" } }],
    preferences: [], photoRequests: [], copyReviews: [],
    inventory: [{ invId: "inv-1", partnerId: "nl", cardId: "k1", ask: 4000,
      archived: false, photos: { front: "f", back: "b" } }],
  });
  const g = st.actions.addGoal({ collectorId: "casey", cardId: "k1", tier: "primary", at: AT });
  const o = st.actions.startOpportunity({ goalId: g, collectorId: "casey", partnerId: "nl",
    cardId: "k1", invId: "inv-1", listedPrice: 4000, amount: 3600, at: AT });
  st.actions.agreePrice({ oppId: o, amount: 3600, by: "tp", at: AT });
  st.actions.proposeTradeSelection({ oppId: o, binderIds: ["b1"], at: AT });
  st.actions.reviewTradeCards({ oppId: o, decision: "accepted", at: AT });
  const get = () => st.get().opportunities.find((x) => x.id === o);
  return { st, o, tcId: get().trade.cards[0].id, get, card: () => get().trade.cards[0] };
};
const atDeal = (w) => w.st.actions.patchOpportunity(w.o,
  (x) => ({ ...x, stage: "deal", deal: { adjThread: [] } }));
/* PHASE 1: the collector opens market value (D.cardOwner); the partner answers. */
const settle = (w) => {
  const a = w.st.actions;
  a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "collector", action: "propose", amount: 1804, at: AT });
  a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "tp", action: "accept", at: AT });
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
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "collector", action: "propose", amount: 1804, at: AT });
    /* Accepting takes the OTHER side's figure; the amount argument is ignored. */
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "tp", action: "accept", amount: 99, at: AT });
    eq(w.card().agreedMarket, 1804, "settled at what was actually proposed");
  });

  test("accepting with nothing standing settles nothing", () => {
    const w = world();
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "tp", action: "accept", at: AT });
    eq(w.card().agreedMarket, null, "there was no proposal to accept");
  });

  test("an agreed market is closed", () => {
    const w = world();
    const a = w.st.actions;
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "collector", action: "propose", amount: 1804, at: AT });
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "tp", action: "accept", at: AT });
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "collector", action: "propose", amount: 1, at: AT });
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
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "collector", action: "propose", amount: 1804, at: AT });
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "tp", action: "accept", at: AT });
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
    const b = M.emptyTradeCard("k1", null, null, "b2");
    w.st.actions.patchOpportunity(w.o, (x) => ({ ...x, trade: { ...x.trade,
      cards: [...x.trade.cards, { ...b, inclusion: "accepted" }] } }));
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.tcId, by: "collector", action: "propose", amount: 1804, at: AT });
    const cards = w.get().trade.cards;
    eq(cards[0].collectorMarket, 1804, "the addressed card moved");
    eq(cards[1].collectorMarket, null, "and its sibling did not");
  });
});

describe("C. Deal agreement belongs to whoever acts", () => {
  /* PHASE 1 (contract §4, Invariant 19): the partner confirms first, the
     collector second. A collector confirmation before the partner's is refused. */
  test("the collector cannot confirm before the partner", () => {
    const w = world(); atDeal(w);
    w.st.actions.dealAgree({ oppId: w.o, by: "collector", at: AT });
    assert(!w.get().deal.collectorAgreed, "refused: the partner confirms first");
    assert(!w.get().deal.tpAgreed, "and the partner's bit is untouched");
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
    w.st.actions.dealAgree({ oppId: w.o, by: "tp", at: AT });
    eq(w.get().stage, "deal", "one confirmation does not advance");
    w.st.actions.dealAgree({ oppId: w.o, by: "collector", at: AT });
    eq(w.get().deal.tpAgreed && w.get().deal.collectorAgreed, true, "both agreed");
    eq(w.get().stage, "fulfillment", "and the deal moves on");
  });

  test("entering fulfillment fabricates no terms", () => {
    /* The defect this replaces invented "Meet in person / To arrange / To
       arrange" — a plan presented to the collector as if the partner had
       proposed it. Entering the stage creates unset state and nothing else. */
    const w = world(); atDeal(w);
    w.st.actions.dealAgree({ oppId: w.o, by: "tp", at: AT });
    w.st.actions.dealAgree({ oppId: w.o, by: "collector", at: AT });
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
    w.st.actions.dealAgree({ oppId: w.o, by: "tp", at: AT });
    assert(w.get().deal.tpAgreed, "the partner had confirmed");
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "collector", action: "propose", amount: 120, at: AT });
    assert(!w.get().deal.collectorAgreed, "a changed figure is not the one they agreed to");
    assert(!w.get().deal.tpAgreed, "for either side");
  });

  test("agreeing the deal never touches upstream card economics", () => {
    const w = world();
    settle(w);
    const before = JSON.stringify(w.card());
    atDeal(w);
    w.st.actions.dealAgree({ oppId: w.o, by: "tp", at: AT });
    w.st.actions.dealAgree({ oppId: w.o, by: "collector", at: AT });
    eq(JSON.stringify(w.get().trade.cards[0]), before,
      "market value and percentage stay settled");
  });
});

describe("D. Fulfillment: propose, agree, then two completions", () => {
  const atFulfillment = () => {
    const w = world(); settle(w); atDeal(w);
    w.st.actions.dealAgree({ oppId: w.o, by: "tp", at: AT });
    w.st.actions.dealAgree({ oppId: w.o, by: "collector", at: AT });
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
    /* PHASE 1: a revision is the collector's answer to a PROPOSED plan (the
       confirm-plan turn). Once confirmed, the next move is the partner's handoff. */
    w.st.actions.proposeFulfillment({ oppId: w.o, plan: { method: "Ship", where: "MN", when: "Fri" }, at: AT });
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
    /* CONTRACT CHANGE: cash-only now refuses while cards are still in the
       trade, because that state is contradictory. Emptying the package first
       is exactly what the collector does in the UI to make it valid again. */
    w.st.actions.patchOpportunity(w.o, (x) => ({ ...x, stage: "select-trade",
      trade: { submitted: false, cards: [] } }));
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
    /* PHASE 1: the Collector names canonical COMMANDS through store.execute. */
    const active = code(COL);
    ["proposeMarketValue", "acceptMarketValue", "proposeTradePercent", "acceptTradePercent",
      "proposeFinalBalance", "acceptDeal", "confirmFulfillmentPlan", "requestFulfillmentRevision",
      "confirmHandoff", "chooseCashOnly"].forEach((a) =>
      assert(new RegExp('exec\\(\\s*"' + a + '"').test(active)
        || new RegExp('"' + a + '"').test(active), "the Collector calls " + a));
  });

  test("agreement actions name the actor rather than assuming one", () => {
    /* PHASE 1: the seat comes from the ACTOR (a.seat), never from a payload `by`. */
    const cmds = code(COMMANDS);
    const accept = cmds.slice(cmds.indexOf("acceptDeal(state, a"), cmds.indexOf("proposeFulfillment(state, a"));
    assert(/if \(a\.seat === "tp"\)[\s\S]*tpAgreed: true/.test(accept),
      "deal agreement moves exactly one bit, chosen by the actor");
    const hand = cmds.slice(cmds.indexOf("confirmHandoff(state, a"), cmds.indexOf("cancelOpportunity(state, a"));
    assert(/if \(a\.seat === "tp"\)[\s\S]*tpHandoff: true[\s\S]*collectorReceipt: true/.test(hand),
      "and so does completion");
    assert(!/\{[^{}]*\bby\b[^{}]*\}\s*\)\s*\{/.test(cmds.slice(cmds.indexOf("const COMMANDS")) .replace(/function valueStep[\s\S]*/, "")),
      "no command reads a seat from its payload");
  });

  test("the lifecycle is unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
  });
});

require("./run.cjs").run();
