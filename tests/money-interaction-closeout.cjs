/* ============================================================================
   TWO MONEY DEFECTS, BOTH ABOUT MEANING WHAT YOU SAY

   A. THE LINKED EDITOR OVERWROTE THE PERSON USING IT.

   The dollar field was derived from the percentage on every keystroke, so a
   partial number was converted to a whole percent and converted straight back.
   Typing "765" displayed "9", then "72". A field that rewrites your input
   mid-word is unusable, and it is how a legitimate entry could end up reading
   as the full market value.

   The percentage is still the authority — it is what gets submitted and what
   the settled display is computed from. But while somebody is typing dollars,
   the dollar field is theirs. It reconciles when they leave it.

   B. "PROPOSE $2,500" THREW, SO IT DID NOTHING.

   A deal that reached this stage through closeValuation had no adjustment
   thread, and the reducer spread one that was never created. The button was not
   inert by design; the action crashed. It also had no turn guard, so a second
   Send silently replaced the figure the other party was already reading.

   And the number had no stated meaning. Final Negotiation now says what it is:
   a proposal to change the CASH owed, after price and trade economics are
   settled. It cannot reopen either.
   ========================================================================= */

process.env.METYET_DEV = "1";

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");
const M = require("../dist/MetYet.cjs");
const { createStore } = require("../domain/metyet-store.js");

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const TPSRC = fs.readFileSync(path.join(ROOT, "src", "MetYet.jsx"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const AT = "2026-08-19";

/* ---- the shared linked editor, driven directly -------------------------- */
const editor = (market) => {
  let r;
  const Harness = () => {
    const [pcs, setPcs] = React.useState("");
    return React.createElement(M.TradeFields, { pcs, setPcs, market });
  };
  TR.act(() => { r = TR.create(React.createElement(Harness)); });
  const input = (re) => r.root.findAllByType("input")
    .find((i) => re.test(String(i.props["aria-label"] || "")));
  const dol = () => input(/Trade value/);
  const pct = () => input(/percentage/);
  return {
    dol, pct,
    typePct: (v) => TR.act(() => { pct().props.onChange({ target: { value: String(v) } }); }),
    /* Typing dollars, then leaving the field — which is when the two reconcile. */
    typeDollars: (v) => { TR.act(() => { dol().props.onChange({ target: { value: String(v) } }); }); },
    commit: () => TR.act(() => { dol().props.onBlur(); }),
  };
};

/* ---- a deal at the Deal stage, built through canonical actions ----------- */
const TARGET = { id: "kt", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };
const GIVE = { id: "ka", name: "Mew ex", set: "Dragon Frontiers", number: "1", variant: "",
  edition: "Unlimited", language: "English", grade: "PSA 8", condition: null };
const GIVE2 = { id: "kb", name: "Lugia", set: "Neo Genesis", number: "9/111", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 8", condition: null };

const atDeal = ({ price = 1000, cards = [["ka", 500, 0.55]] } = {}) => {
  const st = createStore({
    catalog: [GIVE, GIVE2, TARGET],
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
  const get = () => st.get().opportunities.find((x) => x.id === o);

  if (!cards.length) {
    st.actions.patchOpportunity(o, (x) => ({ ...x, stage: "select-trade",
      trade: { ...x.trade, submitted: false, cards: [] } }));
    st.actions.chooseCashOnly({ oppId: o, at: AT });
    return { st, o, get, ids: [] };
  }
  const rows = cards.map(([cid], i) => M.emptyTradeCard(cid, null, null, "b-" + i));
  st.actions.patchOpportunity(o, (x) => ({ ...x, stage: "select-trade",
    trade: { ...x.trade, submitted: true, cards: rows } }));
  st.actions.reviewTradeCards({ oppId: o, decision: "accepted", at: AT });
  cards.forEach(([, mkt, p], i) => {
    const id = rows[i].id;
    st.actions.tradeMarketRespond({ oppId: o, tradeCardId: id, by: "tp", action: "propose", amount: mkt, at: AT });
    st.actions.tradeMarketRespond({ oppId: o, tradeCardId: id, by: "collector", action: "accept", at: AT });
    st.actions.tradePercentRespond({ oppId: o, tradeCardId: id, by: "tp", action: "propose", percent: p, at: AT });
    st.actions.tradePercentRespond({ oppId: o, tradeCardId: id, by: "collector", action: "accept", at: AT });
  });
  return { st, o, get, ids: rows.map((r) => r.id) };
};
const propose = (w, by, amount) => w.st.actions.dealAdjustRespond({
  oppId: w.o, by, action: "propose", amount, at: AT });
const accept = (w, by) => w.st.actions.dealAdjustRespond({
  oppId: w.o, by, action: "accept", at: AT });

describe("A. The dollar field belongs to whoever is typing in it", () => {
  test("it shows the digits entered, not a re-derived figure", () => {
    /* THE DEFECT: this used to display "9", then "72". */
    const e = editor(900);
    ["7", "76", "765"].forEach((partial) => {
      e.typeDollars(partial);
      eq(e.dol().props.value, partial, 'typing "' + partial + '" shows "' + partial + '"');
    });
    eq(e.pct().props.value, "85", "while the percentage tracks it all along");
  });

  test("$450 does not become $900", () => {
    const e = editor(900);
    e.typeDollars(450);
    eq(e.dol().props.value, "450", "the entry stands");
    eq(e.pct().props.value, "50", "as half the market value");
    e.commit();
    eq(e.dol().props.value, "450", "and still stands once the field is left");
  });

  test("valid dollars never clamp to full market value", () => {
    [450, 675, 765, 100, 1].forEach((v) => {
      const e = editor(900);
      e.typeDollars(v); e.commit();
      assert(e.pct().props.value !== "100" || v === 900,
        "$" + v + " did not snap to 100%: got " + e.pct().props.value + "%");
    });
  });

  test("every required round trip holds", () => {
    [[50, 450], [75, 675], [85, 765], [100, 900]].forEach(([p, d]) => {
      const a = editor(900); a.typePct(p);
      eq(a.dol().props.value, String(d), p + "% -> $" + d);
      const b = editor(900); b.typeDollars(d); b.commit();
      eq(b.pct().props.value, String(p), "$" + d + " -> " + p + "%");
    });
  });

  test("leaving the field reconciles to what would actually be sent", () => {
    /* An awkward figure quantises to a whole percent, and the display follows —
       so what is on screen is always what a Send would submit. */
    const e = editor(500);
    e.typeDollars(398);
    eq(e.pct().props.value, "80", "80% is the nearest whole percent");
    e.commit();
    eq(e.dol().props.value, "400", "and the settled view shows what 80% comes to");
    eq(D.tradeValueAt(500, 0.8), 400, "via the canonical helper");
  });

  test("a percentage edit takes the dollar field back", () => {
    const e = editor(900);
    e.typeDollars(398);
    e.typePct(50);
    eq(e.dol().props.value, "450", "the derived figure returns immediately");
  });

  test("empty and unusable input produce nothing, never NaN", () => {
    const e = editor(900);
    e.typeDollars(765); e.typeDollars("");
    eq(e.pct().props.value, "", "clearing dollars clears the percentage");
    eq(e.dol().props.value, "", "and the field itself");
    [null, 0, -1, "x"].forEach((m) =>
      eq(D.tradeValueAt(m, 0.85), null, "no trade value against " + String(m)));
    const zero = editor(0);
    zero.typePct(85);
    assert(!zero.dol(), "a market of nothing offers no dollar field at all");
  });

  test("over-market entry is capped, not rejected", () => {
    const e = editor(900);
    e.typeDollars(5000); e.commit();
    eq(e.pct().props.value, "100", "capped at the whole card");
  });

  test("one implementation, one conversion", () => {
    eq((code(TPSRC).match(/function TradeFields\(/g) || []).length, 1, "defined once");
    assert(/<TradeFields /.test(code(TPSRC)), "the Trusted Partner renders it");
    assert(/<TradeFields /.test(code(COL)), "and so does the Collector");
    const shared = code(TPSRC).slice(code(TPSRC).indexOf("function TradeFields("),
      code(TPSRC).indexOf("function TradeFields(") + 1600);
    assert(/SharedID\.tradeValueAt\(/.test(shared) && /percentageOf\(/.test(shared),
      "converting through the domain helpers");
    [["Collector", code(COL)], ["Trusted Partner", code(TPSRC).replace(shared, "")]]
      .forEach(([n, src]) => assert(!/Math\.round\(.*market.*\*/i.test(src),
        n + " restates no conversion formula"));
  });

  test("submission still records the canonical fraction", () => {
    const w = atDeal({ cards: [] });
    const v = atDeal({ cards: [["ka", 900, 0.85]] });
    eq(v.get().trade.cards[0].agreedPercent, 0.85, "a decimal fraction, not 85");
    eq(D.tradeValueOf(v.get().trade.cards[0]), 765, "worth $765");
  });
});

describe("B. Final cash: the action works, and says what it means", () => {
  test("Propose mutates canonical state instead of throwing", () => {
    /* THE DEFECT: a deal reached through closeValuation had no adjThread, and
       the reducer spread one that never existed. */
    const w = atDeal();
    eq(D.calculatedBalance(w.get()), 725, "$1,000 - $275 = $725");
    propose(w, "collector", 700);
    eq(w.get().deal.collectorAdj, 700, "the proposal is recorded");
    eq(w.get().deal.adjThread.length, 1, "with one entry in the thread");
  });

  test("a deal arrives at this stage with somewhere to negotiate", () => {
    const w = atDeal();
    assert(Array.isArray(w.get().deal.adjThread), "the thread exists on arrival");
    const cash = atDeal({ cards: [] });
    assert(Array.isArray(cash.get().deal.adjThread), "including via the cash-only path");
  });

  test("the reducer tolerates a deal record it did not create", () => {
    const out = D.TRADE.applyDealAdjustment({}, "collector", "propose", 700, AT);
    eq(out.adjThread.length, 1, "a direct caller cannot make it throw");
    eq(out.collectorAdj, 700, "and the proposal lands");
  });

  test("the sender cannot send again while waiting", () => {
    const w = atDeal();
    propose(w, "collector", 700);
    propose(w, "collector", 650);
    eq(w.get().deal.adjThread.length, 1, "one move, one entry");
    eq(w.get().deal.collectorAdj, 700,
      "and the figure the other party is reading is not swapped underneath them");
  });

  test("the recipient can accept or counter, and the turn alternates", () => {
    const w = atDeal();
    propose(w, "collector", 700);
    eq(D.TRADE.dealAdjStanding(w.get().deal), "collector", "the collector holds the table");
    propose(w, "tp", 715);
    eq(D.TRADE.dealAdjStanding(w.get().deal), "tp", "a counter passes it over");
    eq(w.get().deal.adjThread.length, 2, "both moves recorded");
    accept(w, "collector");
    eq(w.get().deal.agreedAdj, 715, "acceptance settles at the standing figure");
  });

  test("accept takes the standing proposal, never stale input", () => {
    const w = atDeal();
    propose(w, "tp", 800);
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "collector", action: "accept",
      amount: 99, at: AT });
    eq(w.get().deal.agreedAdj, 800, "the passed amount is ignored");
  });
});

describe("C. The arithmetic, in both directions", () => {
  test("the worked example from the brief", () => {
    const w = atDeal();                        // $1,000 price, $500 x 55% = $275
    eq(w.get().agreedPrice, 1000, "agreed price $1,000");
    eq(D.totalTradeValue(w.get()), 275, "value of trade $275");
    eq(D.calculatedBalance(w.get()), 725, "calculated cash balance $725");
    propose(w, "collector", 700);
    accept(w, "tp");
    eq(D.finalBalance(w.get()), 700, "final amount owed $700");
    eq(D.finalBalance(w.get()) - D.calculatedBalance(w.get()), -25,
      "final cash adjustment -$25");
  });

  test("an increase is not called a discount", () => {
    const w = atDeal();
    propose(w, "tp", 800);
    accept(w, "collector");
    eq(D.finalBalance(w.get()) - D.calculatedBalance(w.get()), 75, "an adjustment of +$75");
    assert(/"Additional discount" : "Final cash adjustment"/.test(code(COL)),
      "which the receipt names neutrally");
  });

  test("an equal proposal changes nothing", () => {
    const w = atDeal();
    propose(w, "collector", 725);
    accept(w, "tp");
    eq(D.finalBalance(w.get()), 725, "the same figure");
    eq(D.finalBalance(w.get()) - D.calculatedBalance(w.get()), 0, "no adjustment");
    assert(/\{receipt\.adjustment !== 0 && \(/.test(code(COL)),
      "and the receipt omits the line rather than showing $0");
  });

  test("direction is preserved whoever owes", () => {
    const owedToThem = atDeal();
    assert(D.calculatedBalance(owedToThem.get()) > 0, "the collector owes");
    const owedToUs = atDeal({ price: 400, cards: [["ka", 500, 1]] });
    eq(D.calculatedBalance(owedToUs.get()), -100, "the partner owes $100");
    const level = atDeal({ price: 500, cards: [["ka", 500, 1]] });
    eq(D.calculatedBalance(level.get()), 0, "and a zero balance is possible");
    assert(/`You owe \$\{them\}`/.test(code(COL)) && /`\$\{them\} owes you`/.test(code(COL)),
      "each stated in words, not by a sign");
  });

  test("a no-trade deal is all cash", () => {
    const w = atDeal({ price: 500, cards: [] });
    eq(D.totalTradeValue(w.get()), 0, "no trade value");
    eq(D.calculatedBalance(w.get()), 500, "so the balance is the price");
    propose(w, "collector", 450);
    accept(w, "tp");
    eq(D.finalBalance(w.get()), 450, "and it can still be adjusted");
  });

  test("a multi-card trade adjusts only the cash", () => {
    const w = atDeal({ price: 4000, cards: [["ka", 2050, 0.9], ["kb", 900, 0.75]] });
    eq(D.totalTradeValue(w.get()), 2520, "$1,845 + $675");
    eq(D.calculatedBalance(w.get()), 1480, "calculated balance");
    const before = JSON.stringify(w.get().trade.cards);
    propose(w, "collector", 1400);
    accept(w, "tp");
    eq(D.finalBalance(w.get()), 1400, "the cash moved");
    eq(JSON.stringify(w.get().trade.cards), before, "and not one card term did");
  });
});

describe("D. Settled terms stay settled", () => {
  test("a cash proposal reopens nothing upstream", () => {
    const w = atDeal();
    const before = JSON.stringify({ cards: w.get().trade.cards,
      price: w.get().agreedPrice, thread: w.get().priceThread });
    propose(w, "collector", 700);
    propose(w, "tp", 690);
    accept(w, "collector");
    eq(JSON.stringify({ cards: w.get().trade.cards, price: w.get().agreedPrice,
      thread: w.get().priceThread }), before,
      "price, market values, percentages and inclusion all byte-identical");
  });

  test("agreement flags stay actor-specific", () => {
    const w = atDeal();
    w.st.actions.dealAgree({ oppId: w.o, by: "collector", at: AT });
    eq(w.get().deal.collectorAgreed, true, "the collector's own");
    assert(!w.get().deal.tpAgreed, "not the partner's");
    eq(w.get().stage, "deal", "and the deal waits for both");
  });

  test("a new proposal withdraws both confirmations", () => {
    const w = atDeal();
    w.st.actions.dealAgree({ oppId: w.o, by: "collector", at: AT });
    propose(w, "tp", 690);
    assert(!w.get().deal.collectorAgreed && !w.get().deal.tpAgreed,
      "nobody has agreed to a figure they have not seen");
  });

  test("the lifecycle still progresses canonically", () => {
    const w = atDeal();
    propose(w, "collector", 700);
    accept(w, "tp");
    w.st.actions.dealAgree({ oppId: w.o, by: "collector", at: AT });
    w.st.actions.dealAgree({ oppId: w.o, by: "tp", at: AT });
    eq(w.get().stage, "fulfillment", "on to the handoff");
    const f = w.get().fulfillment;
    ["method", "where", "when"].forEach((k) => assert(f[k] == null, k + " is unset"));
  });
});

describe("E. The screen says what the number is", () => {
  test("the section is named for the cash, not for negotiating", () => {
    assert(/<div className="sec-h">Final cash amount<\/div>/.test(code(COL)),
      "Final cash amount");
    assert(!/sec-h">Final negotiation/.test(code(COL)), "the ambiguous heading is gone");
  });

  test("the calculated figure is shown before anyone proposes one", () => {
    assert(/Calculated amount owed/.test(code(COL)),
      "so a proposal reads as a change from something");
    assert(/Only the cash changes\./.test(code(COL)), "with the scope stated plainly");
  });

  test("the input is labelled for what it holds", () => {
    assert(/aria-label="Final cash amount"/.test(code(COL)), "an accessible label");
    assert(/<div className="pn-fl">Final cash amount<\/div>/.test(code(COL)),
      "and a visible one");
  });

  test("standing proposals use the shared actor language", () => {
    assert(/You proposed <b className="mono">\{money\(adjStanding\.amount\)\}<\/b> — waiting on \{them\}/
      .test(code(COL)), "waiting reads the same as everywhere else");
    assert(/\{them\} proposed <b className="mono">\{money\(adjStanding\.amount\)\}<\/b> — your move/
      .test(code(COL)), "as does the other side");
  });

  test("the receipt preserves the derivation", () => {
    assert(/Calculated cash balance/.test(code(COL)), "what the settled terms came to");
    assert(/Additional discount|Final cash adjustment/.test(code(COL)), "what changed");
    assert(/`You owe \$\{them\}`/.test(code(COL)), "and what is actually owed");
  });

  test("no percentage appears where cash has none", () => {
    const deal = code(COL).slice(code(COL).indexOf("function DealStage("),
      code(COL).indexOf("function Fulfillment("));
    assert(!/<TradeFields/.test(deal), "the linked editor belongs to Value Trade only");
    assert(!/pn-u.*%/.test(deal), "and no percentage unit is offered");
  });

  test("the presentation writes nothing canonical", () => {
    const deal = code(COL).slice(code(COL).indexOf("function DealStage("),
      code(COL).indexOf("function Fulfillment("));
    ["agreedAdj:", "tpAgreed:", "collectorAgreed:", "stage:"].forEach((f) =>
      assert(!deal.includes(f), "no direct write of " + f));
    assert(/st\.dealPropose\(o\.id, n\)/.test(deal), "it calls the canonical action");
  });
});

require("./run.cjs").run();
