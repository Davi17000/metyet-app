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

/* RESTATED (M3A A1). The lesson of this suite is unchanged — advancing a trade
   is an ACTION, never a field — but the action moved. The partner no longer
   reviews a Collector's package; it selects, the Collector says they are ready,
   and the partner CLOSES selection, which is what reserves the copies and moves
   the deal to Value Trade. So the fixture is a selection awaiting that close,
   over real offered copies, and each test pins the same property against the
   new action. */
const awaitingReview = (n = 1) => {
  const copies = [];
  for (let k = 0; k < n; k += 1) copies.push({ id: "b" + k, collectorId: "c", cardId: "ka", offered: true });
  const st = createStore({
    catalog: [GIVE, WANT], collectors: [{ id: "c", name: "Casey", prefs: [] }],
    partners: [{ id: "p", name: "Northline Cards" }],
    goals: [], collectorCopies: copies, binders: [], binderEntries: [], interests: [], conversations: [], opportunities: [],
    preferences: [], photoRequests: [], copyReviews: [],
    inventory: [{ invId: "i", partnerId: "p", cardId: "kt", ask: 4000,
      archived: false, photos: { front: "f", back: "b" } }],
  });
  const g = st.actions.addGoal({ collectorId: "c", cardId: "kt", tier: "primary", at: AT });
  const o = st.actions.startOpportunity({ goalId: g, collectorId: "c", partnerId: "p",
    cardId: "kt", invId: "i", listedPrice: 4000, amount: 3800, at: AT });
  st.actions.agreePrice({ oppId: o, amount: 3800, by: "tp", at: AT });
  st.actions.selectTradeCards({ oppId: o, copyIds: copies.map((b) => b.id), at: AT });
  st.actions.continueTradeSelection({ oppId: o, at: AT });
  const get = () => st.get().opportunities.find((x) => x.id === o);
  return { st, o, rows: get().trade.cards, get };
};

describe("A. The reported sequence, end to end", () => {
  test("the partner's close resolves the selection and advances", () => {
    const w = awaitingReview();
    eq(w.get().stage, "select-trade", "waiting on the partner");
    eq(D.nextActor(w.get()).reason, "close-selection", "to close selection");
    w.st.actions.closeTradeSelection({ oppId: w.o, at: AT });
    eq(w.get().stage, "value-trade", "and the deal advances");
  });

  test("the collector owns the next move", () => {
    const w = awaitingReview();
    w.st.actions.closeTradeSelection({ oppId: w.o, at: AT });
    eq(D.nextActor(w.get()).actor, "collector", "it is theirs to price");
    eq(D.acceptedTradeCards(w.get()).length, 1, "with a card to value");
    eq(D.TRADE.negotiationState(w.get().trade.cards[0], "market", "collector").state,
      "open", "and the market-value proposal is available to them");
  });

  test("nothing is duplicated and no identity moves", () => {
    const w = awaitingReview(2);
    const before = w.get().trade.cards.map((c) => c.id + "|" + c.binderId);
    w.st.actions.closeTradeSelection({ oppId: w.o, at: AT });
    eq(w.st.get().opportunities.length, 1, "one opportunity");
    eq(w.get().trade.cards.length, 2, "two rows, as before");
    eq(w.get().trade.cards.map((c) => c.id + "|" + c.binderId).join(","),
      before.join(","), "each keeping its own row id and binder copy");
  });

  test("the reservation is recorded, so the timeline can show it", () => {
    const w = awaitingReview();
    w.st.actions.closeTradeSelection({ oppId: w.o, at: AT });
    eq(w.get().trade.cards[0].reservedAt, AT, "reservedAt is stamped");
    eq(w.get().trade.cards[0].selectedAt, AT, "beside when it was selected");
  });
});

describe("B. Why writing the field was not the same thing", () => {
  test("a raw patch marks the cards and strands the deal", () => {
    /* Kept as evidence: the data looks right and the deal has not moved. */
    const w = awaitingReview();
    w.st.actions.patchOpportunity(w.o, (x) => ({ ...x, trade: { ...x.trade,
      cards: x.trade.cards.map((c) => ({ ...c, reservedAt: AT })) } }));
    eq(w.get().trade.cards[0].reservedAt, AT, "the field says reserved");
    eq(w.get().stage, "select-trade", "and the stage never moves");
  });

  test("the canonical action carries the progression rule", () => {
    assert(typeof D.TRADE.closeValuation === "function", "the next rule exists");
    const w = awaitingReview();
    w.st.actions.closeTradeSelection({ oppId: w.o, at: AT });
    eq(w.get().stage, "value-trade", "and the action runs it");
  });

  test("a partial deselection still waits, as it should", () => {
    const w = awaitingReview(2);
    w.st.actions.deselectTradeCard({ oppId: w.o, tradeCardId: w.rows[0].id, at: AT });
    eq(w.get().stage, "select-trade", "deselecting moves nothing");
    w.st.actions.closeTradeSelection({ oppId: w.o, at: AT });
    eq(w.get().stage, "value-trade", "only the close finishes it");
    eq(D.acceptedTradeCards(w.get()).length, 1, "with the one card left");
  });

  /* RESTATED (M3A A1). WAS: rejecting everything became a cash purchase by
     itself. WHY IT CHANGED: cash only is a decision the Collector makes, never
     a default. NOW: an empty close hands the Collector that decision. */
  test("deselecting everything never becomes a cash purchase by itself", () => {
    const w = awaitingReview();
    w.st.actions.deselectTradeCard({ oppId: w.o, tradeCardId: w.rows[0].id, at: AT });
    w.st.actions.closeTradeSelection({ oppId: w.o, at: AT });
    eq(w.get().stage, "select-trade", "nothing left to value, and no stage chosen for them");
    eq(D.nextActor(w.get()).reason, "trade-reviewed", "the Collector decides");
    w.st.actions.chooseCashOnly({ oppId: w.o, at: AT });
    eq(w.get().trade.mode, "cash", "and cash is their explicit choice");
  });
});

describe("C. The simulator takes actions now", () => {
  const sim = () => code(COL).slice(code(COL).indexOf("function SimulateTP("),
    code(COL).indexOf("function SimulateTP(") + 4500);

  /* RESTATED (M3A A1P): the simulator's partner moves are TP-led selection. */
  test("trade review goes through the canonical action", () => {
    assert(/A\.selectTradeCards\(\{ oppId: o\.id \}\)/.test(sim()) && /A\.closeTradeSelection\(\{ oppId: o\.id \}\)/
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
    w.st.actions.closeTradeSelection({ oppId: w.o, at: AT });   // RESTATED (M3A A1)
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
