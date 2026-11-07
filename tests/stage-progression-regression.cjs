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
const { createStore } = require("./fixture-store.cjs");   // hand-built worlds declare their Relationships (contract §2)

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

/* RESTATED (M3A A1). The defect this suite exists for — a deal stranded in a
   stage nobody can act on — is the same; the move that resolves Select Trade
   changed. The partner no longer REVIEWS a Collector's package: it SELECTS, the
   Collector says they are ready, and the partner CLOSES selection, which is the
   one canonical action that moves the deal to Value Trade. So "a deal parked at
   Select Trade" is now the partner's selection awaiting that close, over real
   offered copies, and every test pins the same property against it. */
const atSelectTrade = (rows) => {
  const st = createStore({
    catalog: [A_CARD, B_CARD, TARGET],
    collectors: [{ id: "casey", name: "Casey", prefs: [] }],
    partners: [{ id: "nl", name: "Northline Cards" }],
    goals: [], binders: [], binderEntries: [], interests: [], conversations: [], opportunities: [],
    collectorCopies: [{ id: "b-a", collectorId: "casey", cardId: "ka", offered: true },
      { id: "b-b", collectorId: "casey", cardId: "kb", offered: true }],
    preferences: [], photoRequests: [], copyReviews: [],
    inventory: [{ invId: "inv-1", partnerId: "nl", cardId: "kt", ask: 4200,
      archived: false, photos: { front: "f", back: "b" } }],
  });
  const g = st.actions.addGoal({ collectorId: "casey", cardId: "kt", tier: "primary", at: AT });
  const o = st.actions.startOpportunity({ goalId: g, collectorId: "casey", partnerId: "nl",
    cardId: "kt", invId: "inv-1", listedPrice: 4200, amount: 3990, at: AT });
  st.actions.agreePrice({ oppId: o, amount: 3990, by: "tp", at: AT });
  st.actions.patchOpportunity(o, (x) => ({ ...x, stage: "select-trade",
    trade: { ...x.trade, cards: rows.map((r) => ({ ...r, inclusion: "accepted", by: "tp", selectedAt: AT })),
      selection: rows.length ? { sentAt: AT, readyAt: AT } : {} } }));
  const get = () => st.get().opportunities.find((x) => x.id === o);
  return { st, o, get, rows: () => get().trade.cards };
};
const cardA = () => M.emptyTradeCard("ka", null, null, "b-a");
const cardB = () => M.emptyTradeCard("kb", null, null, "b-b");
const close = (w) => w.st.actions.closeTradeSelection({ oppId: w.o, at: AT });

describe("A. The exact browser sequence", () => {
  test("closing selection on the only selected card resolves the stage", () => {
    const w = atSelectTrade([cardA()]);
    eq(w.get().stage, "select-trade", "the deal starts in Select Trade");
    eq(D.nextActor(w.get()).reason, "close-selection", "with the partner's close outstanding");
    close(w);
    eq(w.rows()[0].inclusion, "accepted", "the card is taken");
    /* THE ASSERTION THAT WOULD FAIL IF CLOSING STRANDED THE DEAL. */
    eq(w.get().stage, "value-trade",
      "and the stage follows, instead of stranding the collector in Select Trade");
  });

  test("the resolved state leaves somebody something to do", () => {
    const w = atSelectTrade([cardA()]);
    close(w);
    const turn = D.nextActor(w.get());
    assert(turn.actor, "somebody's move: " + JSON.stringify(turn));
    eq(D.acceptedTradeCards(w.get()).length, 1,
      "and a card to negotiate, ready for Value Trade");
  });

  test("the card keeps its identity and its empty negotiation fields", () => {
    const w = atSelectTrade([cardA()]);
    const before = w.rows()[0].id;
    close(w);
    const tc = w.rows()[0];
    eq(tc.id, before, "the same row");
    eq(tc.cardId, "ka", "the same card");
    eq(tc.binderId, "b-a", "the same physical copy");
    eq(tc.agreedMarket, null, "with nothing valued yet");
    eq(tc.valueThread.length, 0, "and no invented history");
    assert(tc.reservedAt, "but the reservation itself is recorded");
  });
});

describe("B. Which states advance, and which wait", () => {
  test("a partial deselection waits", () => {
    const w = atSelectTrade([cardA(), cardB()]);
    w.st.actions.deselectTradeCard({ oppId: w.o, tradeCardId: w.rows()[0].id, at: AT });
    eq(w.get().stage, "select-trade", "deselecting is not closing, so the selection is not resolved");
  });

  test("a mixed selection advances on close, carrying only what is still selected", () => {
    const w = atSelectTrade([cardA(), cardB()]);
    const [, b] = w.rows();
    w.st.actions.deselectTradeCard({ oppId: w.o, tradeCardId: b.id, at: AT });
    close(w);
    eq(w.get().stage, "value-trade", "the partner closed selection");
    eq(D.acceptedTradeCards(w.get()).map((c) => c.cardId).join(","), "ka",
      "and a deselected card never becomes a Value Trade row");
    eq(w.rows().length, 2, "though its row and history remain");
  });

  /* RESTATED (M3A A1). WAS: rejecting everything became a cash purchase by
     itself. NOW: cash only is the Collector's explicit decision — an empty
     close hands it to them, and the deal is not a dead end because they can
     add cards, choose cash only, or end it. */
  test("deselecting everything is not a dead end, and not cash by default", () => {
    const w = atSelectTrade([cardA()]);
    w.st.actions.deselectTradeCard({ oppId: w.o, tradeCardId: w.rows()[0].id, at: AT });
    close(w);
    eq(w.get().stage, "select-trade", "nothing is chosen for the Collector");
    eq(D.nextActor(w.get()).reason, "trade-reviewed", "it is their decision");
    w.st.actions.chooseCashOnly({ oppId: w.o, at: AT });
    eq(w.get().stage, "deal", "cash only, chosen");
    eq(w.get().trade.mode, "cash", "so it settles in cash");
    eq(D.totalTradeValue(w.get()), 0, "with no trade credit");
  });

  test("nothing selected yet stays put", () => {
    const w = atSelectTrade([]);
    const r = close(w);
    eq(r && r.refused, "not-your-turn", "the partner has not shown the Collector anything yet");
    eq(w.get().stage, "select-trade", "so nothing closes");
  });

  test("choosing cash needs no fake trade cards", () => {
    const w = atSelectTrade([]);
    w.st.actions.chooseCashOnly({ oppId: w.o, at: AT });
    eq(w.get().stage, "deal", "it goes straight to the balance");
    eq(w.get().trade.mode, "cash", "recorded as a decision");
    eq(w.get().trade.cards.length, 0, "and invents nothing to value");
  });

  test("the rule only ever moves a deal that is in Select Trade", () => {
    const w = atSelectTrade([cardA()]);
    close(w);
    eq(w.get().stage, "value-trade", "advanced once");
    eq((close(w) || {}).refused, "wrong-stage", "and a later close is refused");
    eq(w.get().stage, "value-trade", "so it cannot move it again");
  });
});

describe("C. The same defect one stage later", () => {
  const atValueTrade = () => {
    const w = atSelectTrade([cardA()]);
    close(w);
    return w;
  };
  /* PHASE 1: the collector opens market value (D.cardOwner), and the Value
     Trade turn is one owner per Opportunity (D.nextActor) — a seat moves on
     every card it holds before the other answers. `settle` takes [id, market,
     percent] terms and walks them in that canonical order; `acceptPercents: false`
     stops before the collector's final acceptances so a test can settle cards one by one. */
  const settle = (w, terms, { acceptPercents = true } = {}) => {
    const a = w.st.actions;
    terms.forEach(([id, market]) => a.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "propose", amount: market, at: AT }));
    terms.forEach(([id]) => a.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "tp", action: "accept", at: AT }));
    terms.forEach(([id, , percent]) => a.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "tp", action: "propose", percent, at: AT }));
    if (acceptPercents) terms.forEach(([id]) => a.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "accept", at: AT }));
  };
  const acceptPercent = (w, id) => w.st.actions.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "accept", at: AT });

  test("agreeing the market alone does not end valuation", () => {
    const w = atValueTrade();
    const id = w.rows()[0].id;
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "propose", amount: 1804, at: AT });
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "tp", action: "accept", at: AT });
    eq(w.get().stage, "value-trade", "the percentage is still open");
    eq(w.get().trade.cards[0].agreedMarket, 1804, "with the market agreed");
  });

  test("settling the last open term advances to Deal", () => {
    const w = atValueTrade();
    settle(w, [[w.rows()[0].id, 1804, 0.8]]);
    eq(w.get().stage, "deal", "nothing is left to negotiate about the cards");
    eq(D.totalTradeValue(w.get()), 1443, "$1,804 x 80% = $1,443, carried forward");
  });

  test("one settled card does not settle a valuation with two", () => {
    const w = atSelectTrade([cardA(), cardB()]);
    close(w);
    const [a, b] = w.rows();
    settle(w, [[a.id, 1804, 0.8], [b.id, 900, 0.75]], { acceptPercents: false });
    acceptPercent(w, a.id);
    eq(D.cardSettled(w.rows()[0]), true, "the first card is settled");
    eq(w.get().stage, "value-trade", "the second card is still unagreed");
    acceptPercent(w, b.id);
    eq(w.get().stage, "deal", "and only both together finish the stage");
    eq(D.totalTradeValue(w.get()), 2118, "$1,443 + $675");
  });

  /* RESTATED (M3A A1). WAS: a card the partner had accepted was committed and
     could not be withdrawn, so withdrawing the unagreed card changed nothing.
     NOW: the founder decided the Collector may withdraw a card until final
     agreement — including in valuation when the value is not worth it — and the
     earlier rule this superseded is back: withdrawing the last unagreed card
     settles the stage, with the other card's agreement untouched. */
  test("withdrawing the last unagreed card settles the stage", () => {
    const w = atSelectTrade([cardA(), cardB()]);
    close(w);
    const [a, b] = w.rows();
    settle(w, [[a.id, 1804, 0.8], [b.id, 900, 0.75]], { acceptPercents: false });
    acceptPercent(w, a.id);
    eq(w.get().stage, "value-trade", "one card outstanding");
    w.st.actions.withdrawTradeCard({ oppId: w.o, tradeCardId: b.id, at: AT });
    eq(w.get().stage, "deal", "what is left is settled, so the deal moves on");
    eq(D.totalTradeValue(w.get()), 1443, "valued on the card that stayed");
    eq(w.rows()[1].withdrawn, true, "and the withdrawn card keeps its row");
  });

  /* RESTATED (M3A A1): selection closes only by the partner's decision. */
  test("withdrawing during selection waits for the partner's close", () => {
    const w = atSelectTrade([cardA(), cardB()]);
    const [, b] = w.rows();
    w.st.actions.withdrawTradeCard({ oppId: w.o, tradeCardId: b.id, at: AT });
    eq(w.get().stage, "select-trade", "nothing moves by itself");
    close(w);
    eq(w.get().stage, "value-trade", "the close resolves it");
    eq(D.acceptedTradeCards(w.get()).map((c) => c.cardId).join(","), "ka", "and the withdrawn card is not valued");
  });
});

describe("D. The whole lifecycle runs on canonical actions alone", () => {
  test("Select Trade through completion, with no direct stage writes", () => {
    const w = atSelectTrade([cardA()]);
    const a = w.st.actions;
    const seen = [];
    const note = () => seen.push(w.get().stage);

    close(w); note();
    const id = w.rows()[0].id;
    /* PHASE 1: collector opens market value; final agreement is partner first,
       collector second (contract §4). */
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "propose", amount: 1804, at: AT });
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "tp", action: "accept", at: AT });
    a.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "tp", action: "propose", percent: 0.8, at: AT });
    a.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "accept", at: AT }); note();
    a.dealAgree({ oppId: w.o, by: "tp", at: AT });
    a.dealAgree({ oppId: w.o, by: "collector", at: AT }); note();
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
    assert(D.nextActor(w.get()).actor, "in Select Trade somebody has the move");
    close(w);
    assert(D.nextActor(w.get()).actor, "at " + w.get().stage + " somebody has the move");
  });
});

describe("E. The rule lives in one place, and no shortcut exists", () => {
  /* RESTATED (M3A A1): selection closes by one canonical COMMAND now
     (`closeTradeSelection`) — the automatic rule is gone — and valuation still
     closes by the shared domain rule. */
  test("both closing rules are canonical", () => {
    ["closeValuation", "valueTradeSettled"]
      .forEach((k) => assert(typeof D.TRADE[k] === "function", k + " is in the domain"));
    assert(typeof require("../domain/metyet-commands.js").COMMANDS.closeTradeSelection === "function",
      "and selection closes by the canonical command");
  });

  test("the Trusted Partner uses the shared rules, not its own copies", () => {
    const tp = code(TP);
    assert(!/const maybeCloseSelection = \(o\) => \{/.test(tp), "no TP-local selection rule");
    assert(!/const maybeCloseValuation = \(o\) =>\s*\n?\s*valueTradeSettled/.test(tp),
      "no TP-local valuation rule");
    /* PHASE 1: the TP issues canonical commands; the closing rules run inside
       the command layer, for every caller. */
    const cmd = code(fs.readFileSync(path.join(ROOT, "domain", "metyet-commands.js"), "utf8"));
    /* RESTATED (M3A A1): the TP prototype still names the retired review (A1P
       moves it to TP-led selection); what is pinned here is that no closing
       rule lives in it, and that the command layer owns the selection close. */
    assert(/closeTradeSelection\(state, a/.test(cmd), "the command layer closes selection");
    assert(/"acceptTradePercent"|percentAction/.test(tp) && /D\.TRADE\.closeValuation\(/.test(cmd), "and the other");
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
    /* RESTATED (M3A A1P): the canonical partner moves are now TP-led selection. */
    assert(/A\.selectTradeCards\(/.test(src) && /A\.closeTradeSelection\(/.test(src), "it calls the canonical review");
    assert(!/A\.reviewTradeCards\(/.test(src), "and not the retired one");
  });

  /* RESTATED (M3A A1): parity between the store's binding and a direct
     command call, for the close that replaced the review. */
  test("the store binding and a direct command produce the same stage", () => {
    const viaStore = atSelectTrade([cardA()]);
    viaStore.st.actions.closeTradeSelection({ oppId: viaStore.o, at: AT });
    const viaDirect = atSelectTrade([cardA()]);
    viaDirect.st.execute({ partnerId: "nl" }, "closeTradeSelection", { oppId: viaDirect.o, at: AT });
    eq(viaStore.get().stage, viaDirect.get().stage, "same outcome, whoever asked");
    eq(viaStore.get().stage, "value-trade", "and it is the right one");
  });

  test("the lifecycle and economics are unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
    eq(D.tradeValueOf({ inclusion: "accepted", agreedMarket: 900, agreedPercent: 0.75 }), 675,
      "and the formula is untouched");
  });
});

require("./run.cjs").run();
