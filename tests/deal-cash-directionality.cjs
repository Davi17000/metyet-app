/* ============================================================================
   WHO OWES WHOM

   The receipt showed a deal where the trade was worth $449 MORE than the card,
   and still said "You pay Northline Cards". The domain was never wrong — the
   balance was already -449 — but the screen rendered Math.abs() of it, and once
   direction is thrown away every line built on it becomes misleading: the
   adjustment gets measured against a magnitude rather than a position, and the
   payer label is a coin flip.

   So direction is derived once, in the domain, from the signed amount:

     balance > 0   the collector owes the partner
     balance < 0   the partner owes the collector
     balance === 0 nobody owes anything

   and returned as meaning rather than as a number to be interpreted again.
   The magnitude comes back unsigned because a headline should never contain a
   negative: which way the money moves belongs in the words, with colour only
   reinforcing what the sentence already says.
   ========================================================================= */

process.env.METYET_DEV = "1";

const { describe, test, assert, eq } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");
const M = require("../dist/MetYet.cjs");
const { createStore } = require("../domain/metyet-store.js");

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const TPSRC = fs.readFileSync(path.join(ROOT, "src", "MetYet.jsx"), "utf8");
const DOM = fs.readFileSync(path.join(ROOT, "domain", "metyet-domain.js"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const AT = "2026-08-19";

/* A deal whose economics we choose outright, so directions are exact. */
const deal = (price, tradeValue) => ({
  id: "o1", stage: "deal", collectorId: "casey", partnerId: "nl", cardId: "kt",
  agreedPrice: price,
  priceThread: [{ by: "collector", type: "offer", amount: price, at: AT }],
  trade: { submitted: true, mode: "trade",
    cards: tradeValue === 0 ? [] : [{ id: "tc1", cardId: "ka", binderId: "b1",
      inclusion: "accepted", withdrawn: false,
      agreedMarket: tradeValue, agreedPercent: 1, valueThread: [], percentThread: [] }] },
  deal: { adjThread: [] },
});
const withFinal = (o, amount) => ({ ...o, deal: { ...o.deal, agreedAdj: amount } });

/* The same economics built through canonical actions, for the invariance tests. */
const TARGET = { id: "kt", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };
const GIVE = { id: "ka", name: "Mew ex", set: "Dragon Frontiers", number: "1", variant: "",
  edition: "Unlimited", language: "English", grade: "PSA 8", condition: null };
const real = ({ price, market, pct }) => {
  const st = createStore({
    catalog: [GIVE, TARGET],
    collectors: [{ id: "casey", name: "Casey", prefs: [] }],
    partners: [{ id: "nl", name: "Northline Cards" }],
    goals: [], binder: [], interests: [], conversations: [], opportunities: [],
    preferences: [], photoRequests: [], copyReviews: [],
    inventory: [{ invId: "inv-1", partnerId: "nl", cardId: "kt", ask: price,
      archived: false, photos: { front: "f", back: "b" } }],
  });
  const g = st.actions.addGoal({ collectorId: "casey", cardId: "kt", tier: "primary", at: AT });
  const o = st.actions.startOpportunity({ goalId: g, collectorId: "casey", partnerId: "nl",
    cardId: "kt", invId: "inv-1", listedPrice: price, amount: price, at: AT });
  st.actions.agreePrice({ oppId: o, amount: price, by: "tp", at: AT });
  const row = M.emptyTradeCard("ka", null, null, "b-0");
  st.actions.patchOpportunity(o, (x) => ({ ...x, stage: "select-trade",
    trade: { ...x.trade, submitted: true, cards: [row] } }));
  st.actions.reviewTradeCards({ oppId: o, decision: "accepted", at: AT });
  st.actions.tradeMarketRespond({ oppId: o, tradeCardId: row.id, by: "tp", action: "propose", amount: market, at: AT });
  st.actions.tradeMarketRespond({ oppId: o, tradeCardId: row.id, by: "collector", action: "accept", at: AT });
  st.actions.tradePercentRespond({ oppId: o, tradeCardId: row.id, by: "tp", action: "propose", percent: pct, at: AT });
  st.actions.tradePercentRespond({ oppId: o, tradeCardId: row.id, by: "collector", action: "accept", at: AT });
  return { st, o, id: row.id, get: () => st.get().opportunities.find((x) => x.id === o) };
};
const dealBlock = () => code(COL).slice(code(COL).indexOf("function DealStage("),
  code(COL).indexOf("function Fulfillment("));

describe("A. The signed balance, and what it means", () => {
  test("the collector owing is positive", () => {
    const o = deal(1000, 275);
    eq(D.calculatedBalance(o), 725, "$1,000 - $275");
    eq(D.cashDirection(725).direction, "collector-to-tp", "which way it goes");
  });

  test("the partner owing is negative", () => {
    const o = deal(700, 1000);
    eq(D.calculatedBalance(o), -300, "$700 - $1,000");
    eq(D.cashDirection(-300).direction, "tp-to-collector", "the other way");
  });

  test("an even deal is settled", () => {
    const o = deal(1000, 1000);
    eq(D.calculatedBalance(o), 0, "nothing between them");
    eq(D.cashDirection(0).direction, "settled", "and neither owes");
  });

  test("magnitude is always unsigned", () => {
    [[725, 725], [-300, 300], [0, 0]].forEach(([signed, mag]) =>
      eq(D.cashDirection(signed).amount, mag,
        String(signed) + " reads as " + mag + ", never negative"));
  });

  test("the screenshot case, with its direction restored", () => {
    /* THE REGRESSION. The old receipt showed $449 with "You pay". */
    const o = deal(3555, 4004);
    eq(D.calculatedBalance(o), -449, "the trade is worth $449 more than the card");
    const r = D.cashReceipt(o);
    eq(r.calculated.direction, "tp-to-collector", "so the partner owes the collector");
    eq(r.calculated.amount, 449, "$449");
    assert(r.calculated.direction !== "collector-to-tp",
      "and it is emphatically not the collector paying");
  });

  test("an unknown balance is not guessed at", () => {
    eq(D.cashDirection(null).direction, "unknown", "no price agreed yet");
    eq(D.cashDirection(null).amount, null, "and no amount invented");
  });
});

describe("B. The adjustment stays signed against the signed balance", () => {
  test("less owed to the partner is a reduction", () => {
    const o = withFinal(deal(1000, 275), 700);
    eq(D.cashReceipt(o).adjustment, -25, "725 -> 700 is -25");
  });

  test("less owed to the collector is an increase", () => {
    /* The case an abs() would get backwards. */
    const o = withFinal(deal(700, 1000), -250);
    eq(D.cashReceipt(o).adjustment, 50, "-300 -> -250 is +50");
    eq(D.cashReceipt(o).final.direction, "tp-to-collector", "still the partner owing");
    eq(D.cashReceipt(o).final.amount, 250, "just less of it");
  });

  test("more owed to the collector is a reduction", () => {
    const o = withFinal(deal(700, 1000), -350);
    eq(D.cashReceipt(o).adjustment, -50, "-300 -> -350 is -50");
    eq(D.cashReceipt(o).final.amount, 350, "and they owe more");
  });

  test("an equal final amount adjusts nothing", () => {
    const o = withFinal(deal(1000, 275), 725);
    eq(D.cashReceipt(o).adjustment, 0, "no change");
    assert(/\{receipt\.adjustment !== 0 && \(/.test(dealBlock()),
      "so the receipt omits the line rather than showing a $0 row");
  });

  test("no magnitude is taken before the arithmetic", () => {
    /* CONTRACT CHANGE, narrowed: cashReceipt still subtracts SIGNED values, which
       is what this protects. compareCashSettlement compares magnitudes, but only
       for a same-payer delta and never to decide direction. */
    const receiptFn = code(DOM).slice(code(DOM).indexOf("const cashReceipt"),
      code(DOM).indexOf("const cashReceipt") + 900);
    assert(!/Math\.abs\([^)]*\)\s*-\s*Math\.abs\(/.test(receiptFn),
      "the receipt subtracts signed values");
    const cmpFn = code(DOM).slice(code(DOM).indexOf("const compareCashSettlement"),
      code(DOM).indexOf("const cashReceipt"));
    assert(/crossesZero \? Math\.abs\(a\) \+ Math\.abs\(b\)/.test(cmpFn),
      "and a crossing is a swing, never a signed difference");
    const rec = code(DOM).slice(code(DOM).indexOf("const cashReceipt"),
      code(DOM).indexOf("const cashReceipt") + 500);
    assert(/final - calc/.test(rec), "adjustment = final - calculated, both signed");
  });
});

describe("C. The final amount carries direction too", () => {
  test("a positive final amount is the collector paying", () => {
    const r = D.cashReceipt(withFinal(deal(1000, 275), 700));
    eq(r.final.direction, "collector-to-tp", "they owe");
    eq(r.final.amount, 700, "$700");
  });

  test("a negative final amount is the partner paying", () => {
    const r = D.cashReceipt(withFinal(deal(700, 1000), -250));
    eq(r.final.direction, "tp-to-collector", "the partner owes");
    eq(r.final.amount, 250, "$250");
  });

  test("a zero final amount settles it", () => {
    const r = D.cashReceipt(withFinal(deal(1000, 275), 0));
    eq(r.final.direction, "settled", "nobody owes");
    eq(r.final.amount, 0, "$0");
  });

  test("with no accepted amount, the calculated balance stands", () => {
    const o = deal(700, 1000);
    const r = D.cashReceipt(o);
    eq(r.final.direction, r.calculated.direction, "same direction");
    eq(r.final.amount, r.calculated.amount, "same magnitude");
    eq(r.adjustment, 0, "and nothing was adjusted");
  });
});

describe("D. The receipt says it in words", () => {
  test("each direction has its own sentence", () => {
    /* CONTRACT CHANGE: each direction is still its own sentence, but the
       sentence is built once by D.settlement rather than per component. */
    const ctx = { viewer: "collector", partner: "Northline Cards" };
    eq(D.settlement(272, ctx).sentence, "You pay Northline Cards", "the collector owing");
    eq(D.settlement(-272, ctx).sentence, "Northline Cards pays you", "the partner owing");
    eq(D.settlement(0, ctx).sentence, "No cash owed", "and neither");
  });

  test("the headline shows an unsigned magnitude", () => {
    const d = dealBlock();
    assert(/money\(receipt\.final\.amount\)/.test(d),
      "the projection's amount, which is never negative");
    assert(!/money\(Math\.abs\(cash\)\)/.test(d), "no local abs of a signed figure");
    eq(D.settlement(-272, { partner: "X" }).amount, 272, "and the helper is unsigned too");
  });

  test("the calculated row is readable rather than signed", () => {
    /* CONTRACT CHANGE: "to you" / "to them" were the ambiguous phrases this
       pass removed. The row now names payer and recipient outright. */
    const d = dealBlock();
    assert(!/" to you"/.test(d) && !/" to them"/.test(d), "no pronouns for direction");
    assert(/settle\(calc, them\)/.test(d), "the calculated row uses the formatter");
    assert(!/money\(Math\.abs\(calc\)\)/.test(d), "the bare magnitude is gone");
  });

  test("colour reinforces the words and never replaces them", () => {
    const d = dealBlock();
    assert(/"row tot dl-final " \+ receipt\.final\.direction/.test(d),
      "the semantic direction becomes the class");
    ["collector-to-tp", "tp-to-collector", "settled"].forEach((k) =>
      assert(new RegExp("\\.dl-final\\." + k).test(COL), k + " has a treatment"));
    /* Every direction still has a sentence, so colour is never the only
       signal — it just comes from the formatter now. */
    assert(/settle\(cash, them\)\.sentence/.test(d),
      "each state is legible without colour");
  });

  test("the treatments use existing tokens", () => {
    assert(/\.dl-final\.collector-to-tp > span:first-child \{ color: var\(--danger\); \}/.test(COL),
      "outflow uses the existing danger token");
    assert(/\.dl-final\.tp-to-collector > span:first-child \{ color: var\(--t1\); \}/.test(COL),
      "inflow uses the app's own accent");
    assert(/\.dl-final\.settled > span:first-child \{ color: var\(--muted\); \}/.test(COL),
      "and settled is quiet");
  });

  test("the adjustment label stays neutral unless a discount is truthful", () => {
    const d = dealBlock();
    assert(/receipt\.calculated\.direction === "collector-to-tp"\s*\n?\s*\? "Additional discount" : "Final cash adjustment"/
      .test(d), "a discount only when the collector is the one paying less");
  });
});

describe("E. Direction is derived, never stored or guessed", () => {
  test("there is one direction rule, in the domain", () => {
    assert(typeof D.cashDirection === "function", "a canonical projection");
    assert(typeof D.cashReceipt === "function", "and a receipt built on it");
    eq((code(DOM).match(/const cashDirection = /g) || []).length, 1, "declared once");
  });

  test("no persona computes its own payer", () => {
    [["Collector", code(COL)], ["Trusted Partner", code(TPSRC)]].forEach(([n, src]) => {
      assert(!/collectorOwes|tpOwes/.test(src), n + " stores no duplicated payer flag");
      assert(!/Math\.abs\(o\.agreedPrice - /.test(src),
        n + " does not take a magnitude to decide direction");
    });
  });

  test("no colour is stored in the domain", () => {
    ["red", "green", "danger", "success"].forEach((w) =>
      assert(!new RegExp('"' + w + '"').test(code(DOM)),
        "the domain returns meaning, not presentation: " + w));
  });

  test("the presentation writes nothing canonical", () => {
    const d = dealBlock();
    ["agreedAdj:", "agreedPrice:", "stage:"].forEach((f) =>
      assert(!d.includes(f), "no direct write of " + f));
    assert(/D\.cashReceipt\(o\)/.test(d), "it reads the projection");
  });
});

describe("F. Settled economics are untouched, and both seats agree", () => {
  test("a final cash agreement changes no upstream term", () => {
    const w = real({ price: 700, market: 1000, pct: 1 });
    eq(D.calculatedBalance(w.get()), -300, "the partner owes $300");
    const before = JSON.stringify({ cards: w.get().trade.cards,
      price: w.get().agreedPrice, thread: w.get().priceThread });
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "collector", action: "propose",
      amount: -250, at: AT });
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "tp", action: "accept", at: AT });
    eq(D.finalBalance(w.get()), -250, "the cash moved");
    eq(JSON.stringify({ cards: w.get().trade.cards, price: w.get().agreedPrice,
      thread: w.get().priceThread }), before,
      "price, market value, percentage and inclusion all byte-identical");
  });

  test("the direction survives the negotiation", () => {
    const w = real({ price: 700, market: 1000, pct: 1 });
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "collector", action: "propose",
      amount: -250, at: AT });
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "tp", action: "accept", at: AT });
    const r = D.cashReceipt(w.get());
    eq(r.final.direction, "tp-to-collector", "the partner still owes");
    eq(r.adjustment, 50, "having reduced what they owe by $50");
  });

  test("both seats read the one signed number", () => {
    /* Mirror views: the same projection, described from each side. The domain
       returns direction, and each persona words it for its own reader. */
    const o = withFinal(deal(700, 1000), -500);
    const r = D.cashReceipt(o);
    eq(r.final.direction, "tp-to-collector", "one canonical direction");
    eq(r.final.amount, 500, "one magnitude");
    eq(D.settlement(-500, { viewer: "collector", partner: "Northline Cards" }).sentence,
      "Northline Cards pays you", "the collector reads it as the partner paying");
    eq(D.settlement(-500, { viewer: "tp", partner: "Northline Cards",
      collector: "Casey" }).sentence, "You pay Casey",
      "and the partner reads the same agreement from their side");
  });

  test("the demo helper cannot bypass it", () => {
    const src = code(COL).slice(code(COL).indexOf("function DemoPartnerResponse("),
      code(COL).indexOf("function SimulateTP("));
    assert(/A\.dealAdjustRespond\(\{ oppId: o\.id, by: "tp"/.test(src),
      "it uses the canonical action, acting as the partner");
    /* Reading agreedAdj to decide whether a response is even valid is right;
       the forbidden thing is writing it. */
    assert(!/agreedAdj:/.test(src), "and writes no balance");
    assert(!/patchOpportunity/.test(src), "nor patches the opportunity at all");
  });

  test("the lifecycle is unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
  });
});

require("./run.cjs").run();
