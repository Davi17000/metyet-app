/* ============================================================================
   A HARNESS THAT CANNOT ACCEPT IS NOT A HARNESS

   Real-device testing found the partner simulator offering only "propose" in
   Value Trade and only "agree the deal" in Cash. A tester whose collector had
   just put a number on the table could therefore do the one thing a real
   partner would rarely do — counter it — and nothing else. The most ordinary
   deal in the product, collector proposes and partner accepts, could not be
   walked on a phone.

   The cause was the simulator deciding for itself what moves existed, from the
   stage alone. Whose proposal is on the table is not a question this tool
   should answer: `negotiationState(card, phase, "tp")` and `dealAdjStanding`
   already answer it for the real partner's seat, and are now asked with the
   same arguments. "theirs" means a proposal awaits this seat — which is exactly
   when Accept is legal, in every phase.

   Accept reads the standing figure from canonical state inside the reducer, so
   no label, draft or stale local value can be substituted for it.
   ========================================================================= */

const { describe, test, assert, eq } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");
const M = require("../dist/MetYet.cjs");
const { createStore, collectorProposesCash } = require("./fixture-store.cjs");   // hand-built worlds declare their Relationships (contract §2)

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const SIM = () => code(COL).slice(code(COL).indexOf("function SimulateTP("),
  code(COL).indexOf("function SimulateTP(") + 6000);
const AT = "2026-08-21";

const GIVE = { id: "ka", name: "Mew ex", set: "DF", number: "1", variant: "",
  edition: "Unlimited", language: "English", grade: "PSA 8", condition: null };
const WANT = { id: "kt", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };

/* A deal at Value Trade with one accepted card, price as given. */
const atValueTrade = (price = 1000) => {
  const st = createStore({
    catalog: [GIVE, WANT], collectors: [{ id: "c", name: "Casey", prefs: [] }],
    partners: [{ id: "p", name: "Northline Cards" }],
    goals: [], collectorCopies: [], binders: [], binderEntries: [], interests: [], conversations: [], opportunities: [],
    preferences: [], photoRequests: [], copyReviews: [],
    inventory: [{ invId: "i", partnerId: "p", cardId: "kt", ask: price,
      archived: false, photos: { front: "f", back: "b" } }],
  });
  const g = st.actions.addGoal({ collectorId: "c", cardId: "kt", tier: "primary", at: AT });
  const o = st.actions.startOpportunity({ goalId: g, collectorId: "c", partnerId: "p",
    cardId: "kt", invId: "i", listedPrice: price, amount: price, at: AT });
  st.actions.agreePrice({ oppId: o, amount: price, by: "tp", at: AT });
  const row = M.emptyTradeCard("ka", null, null, "b1");
  st.actions.patchOpportunity(o, (x) => ({ ...x, stage: "select-trade",
    trade: { ...x.trade, submitted: true, cards: [row] } }));
  st.actions.reviewTradeCards({ oppId: o, decision: "accepted", at: AT });
  return { st, o, row,
    get: () => st.get().opportunities.find((x) => x.id === o),
    card: () => st.get().opportunities.find((x) => x.id === o).trade.cards[0] };
};
/* Settle the card so the deal reaches Cash, at a chosen market/percent. */
const atCash = (price, market, percent) => {
  const w = atValueTrade(price);
  const a = w.st.actions;
  /* PHASE 1: the collector opens market value (D.cardOwner); the partner accepts. */
  a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.row.id, by: "collector", action: "propose", amount: market, at: AT });
  a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.row.id, by: "tp", action: "accept", at: AT });
  a.tradePercentRespond({ oppId: w.o, tradeCardId: w.row.id, by: "tp", action: "propose", percent, at: AT });
  a.tradePercentRespond({ oppId: w.o, tradeCardId: w.row.id, by: "collector", action: "accept", at: AT });
  return w;
};

describe("A. Market value — the partner may accept", () => {
  const standing = () => {
    const w = atValueTrade();
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.row.id,
      by: "collector", action: "propose", amount: 500, at: AT });
    return w;
  };

  test("a collector proposal puts the move on the partner", () => {
    const w = standing();
    const ns = D.TRADE.negotiationState(w.card(), "market", "tp");
    eq(ns.state, "theirs", "the partner owes a response");
    eq(ns.standing, 500, "to this figure");
  });

  test("accepting settles the standing proposal exactly", () => {
    const w = standing();
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.row.id,
      by: "tp", action: "accept", at: AT });
    eq(w.card().agreedMarket, 500, "agreed at what was proposed");
  });

  test("accepting creates no duplicate proposal", () => {
    const w = standing();
    eq(w.card().valueThread.length, 1, "one proposal so far");
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.row.id,
      by: "tp", action: "accept", at: AT });
    eq(w.card().valueThread.length, 2, "proposal then acceptance, nothing else");
    eq(w.card().valueThread.map((e) => e.by + ":" + e.type).join(" | "),
      "collector:propose | tp:accept", "and the exchange reads correctly");
  });

  test("the next canonical decision follows", () => {
    const w = standing();
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.row.id,
      by: "tp", action: "accept", at: AT });
    eq(w.get().stage, "value-trade", "still valuing — the percentage is open");
    eq(D.TRADE.negotiationState(w.card(), "percent", "tp").state, "open",
      "and the partner opens it, as the domain requires");
  });

  test("countering still works", () => {
    const w = standing();
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.row.id,
      by: "tp", action: "propose", amount: 450, at: AT });
    eq(w.card().tpMarket, 450, "the counter stands");
    eq(D.TRADE.negotiationState(w.card(), "market", "collector").state, "theirs",
      "and the move returns to the collector");
  });

  test("the simulator derives this from the canonical projection", () => {
    assert(/D\.TRADE\.negotiationState\(c, "market", "tp"\)\.state === "theirs"/.test(SIM()),
      "the same question the real partner's seat asks");
    assert(/A\.tradeMarketRespond\(\{ oppId: o\.id, tradeCardId: marketOpen\.id, by: "tp",\s*\n?\s*action: "accept"/
      .test(SIM()), "and the canonical accept");
  });
});

describe("B. Trade percentage — the partner may accept", () => {
  const standing = () => {
    const w = atValueTrade();
    const a = w.st.actions;
    /* PHASE 1: the collector opens market value (D.cardOwner); the partner accepts. */
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.row.id, by: "collector", action: "propose", amount: 500, at: AT });
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.row.id, by: "tp", action: "accept", at: AT });
    a.tradePercentRespond({ oppId: w.o, tradeCardId: w.row.id, by: "tp", action: "propose", percent: 0.75, at: AT });
    a.tradePercentRespond({ oppId: w.o, tradeCardId: w.row.id, by: "collector", action: "propose", percent: 0.9, at: AT });
    return w;
  };

  test("the collector's counter puts the move on the partner", () => {
    const w = standing();
    const ns = D.TRADE.negotiationState(w.card(), "percent", "tp");
    eq(ns.state, "theirs", "their response is owed");
    eq(ns.standing, 0.9, "at 90%");
  });

  test("accepting settles exactly the standing percentage", () => {
    const w = standing();
    w.st.actions.tradePercentRespond({ oppId: w.o, tradeCardId: w.row.id,
      by: "tp", action: "accept", at: AT });
    eq(w.card().agreedPercent, 0.9, "90%, not the partner's earlier 75%");
  });

  test("the derived dollars stay canonical", () => {
    const w = standing();
    w.st.actions.tradePercentRespond({ oppId: w.o, tradeCardId: w.row.id,
      by: "tp", action: "accept", at: AT });
    eq(D.tradeValueOf(w.card()), 450, "90% of $500 is $450");
    eq(D.totalTradeValue(w.get()), 450, "and the total agrees");
  });

  test("the stage moves only when the closeout rule says so", () => {
    const w = standing();
    eq(w.get().stage, "value-trade", "one term still open");
    w.st.actions.tradePercentRespond({ oppId: w.o, tradeCardId: w.row.id,
      by: "tp", action: "accept", at: AT });
    eq(w.get().stage, "deal", "the last card term settled, so valuation closes");
  });

  test("the offer names the percentage and what it comes to", () => {
    assert(/D\.tradeValueAt\(pctOpen\.agreedMarket, ns\.standing\)/.test(SIM()),
      "through the canonical helper, not new arithmetic");
  });
});

/* PHASE 1 (contract §4): final confirmation is ordered — the partner confirms
   first, the collector second, and the collector's confirmation is what records
   the agreed figure. So a collector's cash proposal is made after the partner's
   first confirmation, the partner's "accept" confirms the standing figure, and
   the settled `agreedAdj` appears once the collector confirms. The figures and
   directions under test are unchanged. */
const collectorConfirms = (w) =>
  w.st.execute({ collectorId: w.get().collectorId }, "acceptDeal", { oppId: w.o, at: AT });

describe("C. Final cash — the partner may accept, in either direction", () => {
  const proposing = (price, market, percent, delta) => {
    const w = atCash(price, market, percent);
    const calc = D.calculatedBalance(w.get());
    collectorProposesCash(w.st, w.o, calc + delta, AT);
    return { w, calc };
  };

  test("a collector cash proposal puts the move on the partner", () => {
    const { w } = proposing(1000, 500, 1, -50);
    eq(D.TRADE.dealAdjStanding(w.get().deal), "collector", "their figure is standing");
  });

  test("accepting settles exactly that figure", () => {
    const { w, calc } = proposing(1000, 500, 1, -50);
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "tp", action: "accept", at: AT });
    eq(w.get().deal.tpAgreed, true, "the partner confirmed the standing figure");
    eq(D.currentCashFigure(w.get()), calc - 50, "which is the current economic state");
    collectorConfirms(w);
    eq(w.get().deal.agreedAdj, calc - 50, "the standing amount, unchanged");
    eq(D.finalBalance(w.get()), calc - 50, "and the balance follows it");
  });

  test("the collector owing keeps its direction", () => {
    const { w } = proposing(1000, 500, 1, -50);       // calc +500 -> 450
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "tp", action: "accept", at: AT });
    collectorConfirms(w);
    const r = D.cashReceipt(w.get());
    eq(r.final.direction, "collector-to-tp", "the collector still pays");
    eq(r.final.amount, 450, "$450");
  });

  test("the partner owing keeps its direction too", () => {
    /* The case a magnitude would flatten: -100 becoming -50 is still them. */
    const { w } = proposing(400, 500, 1, 50);          // calc -100 -> -50
    eq(D.calculatedBalance(w.get()), -100, "the partner owes $100");
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "tp", action: "accept", at: AT });
    collectorConfirms(w);
    const r = D.cashReceipt(w.get());
    eq(w.get().deal.agreedAdj, -50, "the signed figure is preserved");
    eq(r.final.direction, "tp-to-collector", "and they still pay");
    eq(r.final.amount, 50, "$50");
  });

  test("an even balance is handled", () => {
    const w = atCash(500, 500, 1);
    eq(D.calculatedBalance(w.get()), 0, "nothing between them");
    eq(D.cashReceipt(w.get()).final.direction, "settled", "and it reads settled");
  });

  test("agreement remains actor-specific and progression canonical", () => {
    /* PHASE 1: the order is fixed — partner first, collector second. */
    const { w } = proposing(1000, 500, 1, -50);
    eq(collectorConfirms(w).refused, D.REFUSE.notYourTurn, "the collector cannot confirm first");
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "tp", action: "accept", at: AT });
    eq(w.get().deal.tpAgreed, true, "one seat's agreement");
    assert(!w.get().deal.collectorAgreed, "not the other's");
    eq(w.get().stage, "deal", "so the deal waits");
    collectorConfirms(w);
    eq(w.get().stage, "fulfillment", "until both have agreed");
  });

  test("the simulator reads the canonical standing position", () => {
    assert(/D\.TRADE\.dealAdjStanding\(o\.deal\)/.test(SIM()), "not its own turn logic");
    assert(/A\.dealAdjustRespond\(\{ oppId: o\.id, by: "tp", action: "accept", at: AT \}\)/
      .test(SIM()), "and the canonical accept");
    assert(!/Math\.abs\(o\.deal\.collectorAdj\)/.test(SIM()),
      "the signed figure is never flattened before the action");
  });
});

describe("D. Guards, staleness and scope", () => {
  test("accept takes the standing proposal, never a passed value", () => {
    const w = atValueTrade();
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.row.id,
      by: "collector", action: "propose", amount: 500, at: AT });
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.row.id,
      by: "tp", action: "accept", amount: 9999, at: AT });
    eq(w.card().agreedMarket, 500, "a stale amount cannot alter it");
  });

  test("the waiting actor cannot act twice", () => {
    const w = atValueTrade();
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.row.id,
      by: "collector", action: "propose", amount: 500, at: AT });
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.row.id,
      by: "collector", action: "propose", amount: 600, at: AT });
    eq(w.card().valueThread.length, 1, "one turn, one entry");
    eq(w.card().collectorMarket, 500, "the standing figure is unchanged");
  });

  test("accept is offered only when it is legal", () => {
    /* Nobody has proposed: there is nothing to accept.
       PHASE 1: the collector opens market value (D.cardOwner), so the partner
       may neither open nor accept an unopened card — it reads "blocked", and a
       partner opening is refused. */
    const w = atValueTrade();
    eq(D.TRADE.negotiationState(w.card(), "market", "tp").state, "blocked",
      "the partner may not open, nor accept");
    const before = JSON.stringify(w.card());
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.row.id,
      by: "tp", action: "propose", amount: 500, at: AT });
    eq(JSON.stringify(w.card()), before, "a partner opening is refused");
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.row.id,
      by: "collector", action: "propose", amount: 500, at: AT });
    eq(D.TRADE.negotiationState(w.card(), "market", "collector").state, "waiting",
      "and having proposed, the collector waits rather than accept themselves");
    eq(D.TRADE.negotiationState(w.card(), "market", "tp").state, "theirs",
      "while accept becomes legal for the partner");
  });

  test("no stage is written and no mobile-only action was added", () => {
    assert(!/stage:\s*["']/.test(SIM()), "the lifecycle cannot be skipped");
    const shell = code(COL).slice(code(COL).indexOf("function MobileDeal("),
      code(COL).indexOf("function Deal({", code(COL).indexOf("function MobileDeal(")));
    ["tradeMarketRespond", "tradePercentRespond", "dealAdjustRespond"].forEach((a) =>
      assert(!shell.includes(a), "the mobile shell adds no " + a));
  });

  /* PHASE 1: the known gap is closed. The price counter now has a canonical
     command (proposePrice), so the simulator holds no raw patch at all. */
  test("no raw patch remains — the price counter is canonical too", () => {
    eq((SIM().match(/patchOpportunity/g) || []).length, 0, "no raw patch in the simulator");
    const counter = SIM().slice(SIM().indexOf("Counter at 96%"),
      SIM().indexOf("Counter at 96%") + 400);
    assert(/A\.proposePrice\(/.test(counter), "the counter goes through the canonical command");
    assert(!/priceThread/.test(counter), "and writes no thread itself");
  });

  test("economics and lifecycle are untouched", () => {
    eq(D.tradeValueOf({ inclusion: "accepted", agreedMarket: 500, agreedPercent: 0.9 }),
      450, "the formula holds");
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
  });
});

require("./run.cjs").run();
