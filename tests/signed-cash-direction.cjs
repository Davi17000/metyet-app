/* ============================================================================
   OWING AND BEING OWED ARE ONE NUMBER WITH TWO SIGNS

   A collector owed $185 proposed $200 and ended up owing $200. The domain was
   never wrong — the balance had always been signed — but the input stripped the
   minus sign and refused anything but a positive number, so a typed 200 was
   always +200. The money changed hands the wrong way because the control could
   not express the direction the deal was already in.

   So the draft is a signed balance, and both controls edit that one value. The
   slider is an axis with zero in the middle; crossing zero is the only way to
   change who pays, which makes reversal something you do rather than something
   that happens to you.
   ========================================================================= */

const { describe, test, assert, eq } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");
const M = require("../dist/MetYet.cjs");
const { createStore } = require("../domain/metyet-store.js");

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const DEAL = () => code(COL).slice(code(COL).indexOf("function DealStage("),
  code(COL).indexOf("function Fulfillment("));
const AT = "2026-08-24";

const GIVE = { id: "ka", name: "Mew ex", set: "DF", number: "1", variant: "",
  edition: "Unlimited", language: "English", grade: "PSA 8", condition: null };
const WANT = { id: "kt", name: "Charizard", set: "Base Set", number: "4",
  variant: "Holo", edition: "Unlimited", language: "English", grade: "PSA 9",
  condition: null };

/* price and market chosen so the calculated balance lands where a test wants. */
const atCash = (price, market) => {
  const st = createStore({
    catalog: [GIVE, WANT], collectors: [{ id: "c", name: "Casey", prefs: [] }],
    partners: [{ id: "p", name: "Northline Cards" }],
    goals: [], binder: [], interests: [], conversations: [], opportunities: [],
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
  st.actions.tradeMarketRespond({ oppId: o, tradeCardId: row.id, by: "tp",
    action: "propose", amount: market, at: AT });
  st.actions.tradeMarketRespond({ oppId: o, tradeCardId: row.id, by: "collector",
    action: "accept", at: AT });
  st.actions.tradePercentRespond({ oppId: o, tradeCardId: row.id, by: "tp",
    action: "propose", percent: 1, at: AT });
  st.actions.tradePercentRespond({ oppId: o, tradeCardId: row.id, by: "collector",
    action: "accept", at: AT });
  return { st, o, get: () => st.get().opportunities.find((x) => x.id === o) };
};
/* Collector owes $185 / partner owes $185, at the same magnitude. */
const collectorOwes = () => atCash(685, 500);
const partnerOwes = () => atCash(315, 500);

const settle = (w, amount) => {
  w.st.actions.dealAdjustRespond({ oppId: w.o, by: "collector", action: "propose",
    amount, at: AT });
  w.st.actions.dealAdjustRespond({ oppId: w.o, by: "tp", action: "accept", at: AT });
  return D.cashReceipt(w.get()).final;
};

describe("A. Same side, larger amount, same payer", () => {
  test("the collector owing $185 who proposes $200 still owes", () => {
    const w = collectorOwes();
    eq(D.calculatedBalance(w.get()), 185, "the collector owes $185");
    const r = settle(w, 200);
    eq(r.direction, "collector-to-tp", "and still owes after agreeing $200");
    eq(r.amount, 200, "$200");
  });

  test("the partner owing $185 who proposes $200 still owes", () => {
    /* THE REPORTED BUG: this used to flip to the collector owing $200. */
    const w = partnerOwes();
    eq(D.calculatedBalance(w.get()), -185, "the partner owes $185");
    const r = settle(w, -200);
    eq(r.direction, "tp-to-collector", "and still owes after agreeing $200");
    eq(r.amount, 200, "$200");
  });

  test("a bare positive magnitude is what used to reverse it", () => {
    /* Kept as evidence of the shape of the defect. */
    const w = partnerOwes();
    const r = settle(w, 200);
    eq(r.direction, "collector-to-tp",
      "an unsigned 200 genuinely means the collector pays — which is why the "
      + "control must carry the sign");
  });
});

describe("B. Direction changes only by crossing zero", () => {
  test("from the collector owing, through zero, to the partner owing", () => {
    const w = collectorOwes();
    eq(D.cashDirection(185).direction, "collector-to-tp", "start");
    eq(D.cashDirection(50).direction, "collector-to-tp", "smaller, same side");
    eq(D.cashDirection(0).direction, "settled", "zero is the crossing");
    eq(D.cashDirection(-50).direction, "tp-to-collector", "and past it, the other side");
    const r = settle(w, -50);
    eq(r.direction, "tp-to-collector", "settled the far side");
    eq(r.amount, 50, "$50");
  });

  test("and back the other way", () => {
    const w = partnerOwes();
    eq(D.cashDirection(-185).direction, "tp-to-collector", "start");
    eq(D.cashDirection(-1).direction, "tp-to-collector", "right up to zero");
    const r = settle(w, 50);
    eq(r.direction, "collector-to-tp", "crossing settles the other side");
    eq(r.amount, 50, "$50");
  });

  test("zero settles as even", () => {
    const w = collectorOwes();
    const r = settle(w, 0);
    eq(w.get().deal.agreedAdj, 0, "zero is a real settlement");
    eq(r.direction, "settled", "and reads as even");
    eq(r.amount, 0, "$0");
    assert(/Even — no cash owed/.test(DEAL()), "said in words on screen");
  });

  test("the reducer no longer rejects an even split", () => {
    /* It treated 0 as a missing value, so the one balance you could not
       propose was the one where nobody owes anything. */
    const out = D.TRADE.applyDealAdjustment({ adjThread: [] }, "collector",
      "propose", 0, AT);
    eq(out.collectorAdj, 0, "zero is recorded");
    eq(out.adjThread.length, 1, "as a real move");
  });
});

describe("C. One signed draft, two controls", () => {
  test("the draft starts at the canonical calculated balance", () => {
    assert(/const draft = signed == null \? \(calc \|\| 0\) : signed;/.test(DEAL()),
      "untouched, it is the deal's own balance");
    assert(/calcBalance\(o\)/.test(DEAL()), "read from the canonical helper");
  });

  test("the slider edits the same value as the number", () => {
    const d = DEAL();
    assert(/value=\{-draft\}/.test(d), "the slider reads the draft");
    assert(/onChange=\{\(e\) => setSigned\(-Number\(e\.target\.value\)\)\}/.test(d),
      "and writes it back");
    assert(/setSigned\(draft < 0 \? -mag : mag\)/.test(d),
      "typing changes magnitude and keeps the side");
    eq((d.match(/const \[signed, setSigned\]/g) || []).length, 1,
      "one draft, so they cannot disagree");
  });

  test("typing cannot silently move the money", () => {
    const d = DEAL();
    assert(/draft < 0 \? -mag : mag/.test(d),
      "a typed number inherits the side the deal is already on");
    assert(!/disabled=\{!\(n > 0\)\}/.test(d), "and negatives are no longer forbidden");
  });

  test("reversing is a deliberate act", () => {
    const d = DEAL();
    assert(/onClick=\{\(\) => setSigned\(-draft\)\}/.test(d), "an explicit switch");
    assert(/Switch to/.test(d), "labelled for what it does");
    assert(/step=\{1\}/.test(d) && /min=\{-span\} max=\{span\}/.test(d),
      "and the slider spans both sides of zero");
  });

  test("the direction is never guessed after the fact", () => {
    const d = DEAL();
    assert(!/Math\.abs\([^)]*\)\s*\)\s*;?\s*$/m.test(d.split("draftDir")[0] || ""),
      "no magnitude is taken before direction is resolved");
    assert(/const draftDir = D\.cashDirection\(draft\);/.test(d),
      "direction comes from the signed value");
    /* Math.abs appears only for DISPLAY, after direction is known. */
    assert(/money\(draftSet\.amount\)/.test(d), "and the figure shown is unsigned");
  });

  test("the interpretation is always in words", () => {
    /* CONTRACT CHANGE: the live interpretation now comes from the shared
       formatter, so the slider and the receipt cannot word it differently. */
    const d = DEAL();
    assert(/draftSet\.sentence/.test(d), "phrased by the formatter");
    assert(/const draftSet = settle\(draft, them\)/.test(d), "from the signed draft");
    assert(/"Even — no cash owed"/.test(d), "with zero stated explicitly");
  });
});

describe("D. Nothing upstream moves", () => {
  test("a cash proposal changes no trade term", () => {
    const w = collectorOwes();
    const before = JSON.stringify({ cards: w.get().trade.cards,
      price: w.get().agreedPrice });
    settle(w, -50);
    eq(JSON.stringify({ cards: w.get().trade.cards, price: w.get().agreedPrice }),
      before, "price, market value and percentage are byte-identical");
  });

  test("accept settles the exact standing signed proposal", () => {
    const w = partnerOwes();
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "collector", action: "propose",
      amount: -200, at: AT });
    /* A stale amount on the accept cannot change it. */
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "tp", action: "accept",
      amount: 999, at: AT });
    eq(w.get().deal.agreedAdj, -200, "the standing figure, sign and all");
  });

  test("both seats read the same signed result", () => {
    const w = partnerOwes();
    settle(w, -200);
    const r = D.cashReceipt(w.get());
    eq(r.final.direction, "tp-to-collector", "one direction");
    eq(r.final.amount, 200, "one magnitude");
    eq(w.get().deal.agreedAdj, -200, "from one signed number");
  });

  test("the DEV simulator preserves the sign", () => {
    const sim = code(COL).slice(code(COL).indexOf("function SimulateTP("),
      code(COL).indexOf("function SimulateTP(") + 6000);
    assert(/A\.dealAdjustRespond\(\{ oppId: o\.id, by: "tp", action: "accept"/.test(sim),
      "it accepts through the canonical action");
    assert(!/Math\.abs\(o\.deal\.collectorAdj\)/.test(sim),
      "and never flattens the figure first");
    const w = partnerOwes();
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "collector", action: "propose",
      amount: -200, at: AT });
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "tp", action: "accept", at: AT });
    eq(D.cashReceipt(w.get()).final.direction, "tp-to-collector", "direction survives");
  });

  test("the lifecycle and economics are unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment",
      "six, in order");
    eq(D.tradeValueOf({ inclusion: "accepted", agreedMarket: 500, agreedPercent: 1 }),
      500, "the formula holds");
  });
});

require("./run.cjs").run();
