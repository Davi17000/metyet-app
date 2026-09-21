/* ============================================================================
   ACCEPTING A TRADE IS AN ACTION, NOT A FIELD

   A real-device report: the partner accepted a proposed trade card through the
   DEV simulator and the deal stopped. The cards read as accepted and nothing
   could move.

   The simulator was setting `inclusion: "accepted"` with a raw patch. That
   produces data identical to the canonical review — and skips the rule that
   matters. `reviewTradeCards` runs `closeSelection`, which is what ends the
   stage once nothing is left unreviewed. Writing the field marked the cards
   accepted and left the deal parked in Select Trade with no legal move: the
   exact dead-end an earlier pass fixed in the product, reintroduced by a tool
   that wrote state instead of taking an action.

   This is the general lesson, so the tests below pin the mechanism rather than
   the one button: the difference between the two paths, and the properties the
   canonical one carries — reviewedAt, progression, turn, identity.
   ========================================================================= */

const { describe, test, assert, eq } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");
const M = require("../dist/MetYet.cjs");
const { createStore } = require("./fixture-store.cjs");   // hand-built worlds declare their Relationships (contract §2)

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const AT = "2026-08-21";

const GIVE = { id: "ka", name: "Mew ex", set: "DF", number: "1", variant: "",
  edition: "Unlimited", language: "English", grade: "PSA 8", condition: null };
const WANT = { id: "kt", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };

/* A submitted trade package awaiting the partner's review. */
const awaitingReview = (n = 1) => {
  const st = createStore({
    catalog: [GIVE, WANT], collectors: [{ id: "c", name: "Casey", prefs: [] }],
    partners: [{ id: "p", name: "Northline Cards" }],
    goals: [], collectorCopies: [], binders: [], binderEntries: [], interests: [], conversations: [], opportunities: [],
    preferences: [], photoRequests: [], copyReviews: [],
    inventory: [{ invId: "i", partnerId: "p", cardId: "kt", ask: 4000,
      archived: false, photos: { front: "f", back: "b" } }],
  });
  const g = st.actions.addGoal({ collectorId: "c", cardId: "kt", tier: "primary", at: AT });
  const o = st.actions.startOpportunity({ goalId: g, collectorId: "c", partnerId: "p",
    cardId: "kt", invId: "i", listedPrice: 4000, amount: 3800, at: AT });
  st.actions.agreePrice({ oppId: o, amount: 3800, by: "tp", at: AT });
  const rows = [];
  for (let k = 0; k < n; k += 1) rows.push(M.emptyTradeCard("ka", null, null, "b" + k));
  st.actions.patchOpportunity(o, (x) => ({ ...x, stage: "select-trade",
    trade: { ...x.trade, submitted: true, cards: rows } }));
  return { st, o, rows, get: () => st.get().opportunities.find((x) => x.id === o) };
};

describe("A. The reported sequence, end to end", () => {
  test("the partner's acceptance resolves the selection and advances", () => {
    const w = awaitingReview();
    eq(w.get().stage, "select-trade", "waiting on the partner");
    eq(w.get().trade.cards.filter((c) => c.inclusion === "proposed").length, 1,
      "with one card unreviewed");

    w.st.actions.reviewTradeCards({ oppId: w.o, decision: "accepted", at: AT });

    eq(w.get().trade.cards.filter((c) => c.inclusion === "proposed").length, 0,
      "the last unresolved decision is resolved");
    eq(w.get().stage, "value-trade", "and the deal advances — this used to stall");
  });

  test("the collector owns the next move", () => {
    const w = awaitingReview();
    w.st.actions.reviewTradeCards({ oppId: w.o, decision: "accepted", at: AT });
    eq(D.nextActor(w.get()).actor, "collector", "it is theirs to price");
    eq(D.acceptedTradeCards(w.get()).length, 1, "with a card to value");
    eq(D.TRADE.negotiationState(w.get().trade.cards[0], "market", "collector").state,
      "open", "and the market-value proposal is available to them");
  });

  test("nothing is duplicated and no identity moves", () => {
    const w = awaitingReview(2);
    const before = w.get().trade.cards.map((c) => c.id + "|" + c.binderId);
    w.st.actions.reviewTradeCards({ oppId: w.o, decision: "accepted", at: AT });
    eq(w.st.get().opportunities.length, 1, "one opportunity");
    eq(w.get().trade.cards.length, 2, "two rows, as before");
    eq(w.get().trade.cards.map((c) => c.id + "|" + c.binderId).join(","),
      before.join(","), "each keeping its own row id and binder copy");
  });

  test("the review is recorded, so the timeline can show it", () => {
    const w = awaitingReview();
    w.st.actions.reviewTradeCards({ oppId: w.o, decision: "accepted", at: AT });
    eq(w.get().trade.cards[0].reviewedAt, AT, "reviewedAt is stamped");
  });
});

describe("B. Why writing the field was not the same thing", () => {
  test("a raw patch marks the cards and strands the deal", () => {
    /* Kept as evidence: the data looks right and the deal is dead. */
    const w = awaitingReview();
    w.st.actions.patchOpportunity(w.o, (x) => ({ ...x, trade: { ...x.trade,
      cards: x.trade.cards.map((c) => (c.inclusion === "proposed"
        ? { ...c, inclusion: "accepted" } : c)) } }));
    eq(w.get().trade.cards[0].inclusion, "accepted", "the field says accepted");
    eq(w.get().stage, "select-trade", "and the stage never moves");
    assert(!w.get().trade.cards[0].reviewedAt, "with no record of a review");
  });

  test("the canonical action carries the progression rule", () => {
    assert(typeof D.TRADE.closeSelection === "function", "the rule exists");
    const w = awaitingReview();
    w.st.actions.reviewTradeCards({ oppId: w.o, decision: "accepted", at: AT });
    eq(w.get().stage, "value-trade", "and the action runs it");
  });

  test("a partial review still waits, as it should", () => {
    const w = awaitingReview(2);
    w.st.actions.reviewTradeCards({ oppId: w.o, tradeCardId: w.rows[0].id,
      decision: "accepted", at: AT });
    eq(w.get().stage, "select-trade", "one card is still unreviewed");
    w.st.actions.reviewTradeCards({ oppId: w.o, tradeCardId: w.rows[1].id,
      decision: "accepted", at: AT });
    eq(w.get().stage, "value-trade", "and only both together finish it");
  });

  test("rejecting everything still becomes a cash purchase", () => {
    const w = awaitingReview();
    w.st.actions.reviewTradeCards({ oppId: w.o, decision: "rejected", at: AT });
    eq(w.get().stage, "deal", "nothing left to value");
    eq(w.get().trade.mode, "cash", "so it settles in cash");
  });
});

describe("C. The simulator takes actions now", () => {
  const sim = () => code(COL).slice(code(COL).indexOf("function SimulateTP("),
    code(COL).indexOf("function SimulateTP(") + 4500);

  test("trade review goes through the canonical action", () => {
    assert(/A\.reviewTradeCards\(\{ oppId: o\.id, decision: "accepted", at: AT \}\)/
      .test(sim()), "the review is an action");
    assert(!/inclusion: "accepted"/.test(sim()), "and the field is never written");
  });

  test("value proposals go through the canonical reducers", () => {
    /* Same defect shape: writing tpMarket and tpPercent together skipped the
       turn guards, the market-before-percentage gate, and the threads. */
    assert(/A\.tradeMarketRespond\(/.test(sim()), "market value is proposed");
    assert(/A\.tradePercentRespond\(/.test(sim()), "and so is the percentage");
    assert(!/tpMarket: c\.tpMarket != null/.test(sim()), "neither is assigned directly");
  });

  test("no stage is ever written by the tool", () => {
    assert(!/stage:\s*["']/.test(sim()), "the lifecycle cannot be skipped");
  });

  test("the guards it now runs through actually hold", () => {
    const w = awaitingReview();
    w.st.actions.reviewTradeCards({ oppId: w.o, decision: "accepted", at: AT });
    const id = w.get().trade.cards[0].id;
    /* PHASE 1: the collector opens market value (D.cardOwner), so the repeated
       send is the collector's; a partner opening is refused outright. */
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "tp",
      action: "propose", amount: 150, at: AT });
    eq(w.get().trade.cards[0].valueThread.length, 0, "the partner cannot open market value");
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "collector",
      action: "propose", amount: 200, at: AT });
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "collector",
      action: "propose", amount: 900, at: AT });
    eq(w.get().trade.cards[0].valueThread.length, 1, "one turn, one entry");
    w.st.actions.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "tp",
      action: "propose", percent: 0.8, at: AT });
    eq(w.get().trade.cards[0].tpPercent, null,
      "and a percentage cannot open before the market is agreed");
  });

  test("the lifecycle is unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
  });
});

require("./run.cjs").run();
