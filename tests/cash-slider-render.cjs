/* ============================================================================
   WHAT THE SLIDER ACTUALLY SHOWS

   Source-string tests kept passing while the control stayed unusable, because
   they proved a helper was called, not that a person could see the answer. So
   these drive the real slider and read the rendered text.

   The concept the control was missing is comparison. A draft on its own says
   what you would settle at; it cannot say what that would CHANGE, and the change
   is the thing being decided. Once both settlements are present, one rule
   matters: a signed delta means something only while the payer stays the same.
   Cross zero and "+$208" describes nothing anybody experienced — the money did
   not grow, it reversed. That case is a swing, and never signed.
   ========================================================================= */

process.env.METYET_DEV = "1";

global.window = global.window || {};
window.matchMedia = (q) => ({ matches: /max-width:\s*560px/.test(q),
  addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {} });

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");
const M = require("../dist/MetYet.cjs");
const { createStore } = require("../domain/metyet-store.js");
const App = require("../dist/Collector.cjs").default;
const { __store } = require("../dist/Collector.cjs");

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const AT = "2026-08-24";
const PARTNER = "Northline Cards";

const txt = (n) => {
  if (!n) return "";
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ").replace(/\s+/g, " ").trim();
};
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));

/* A deal at Cash whose CURRENT settlement is exactly the signed figure asked
   for, reached through canonical actions. */
const GIVE = { id: "ka", name: "Mew ex", set: "DF", number: "1", variant: "",
  edition: "Unlimited", language: "English", grade: "PSA 8", condition: null };
const WANT = { id: "kt", name: "Charizard", set: "Base Set", number: "4",
  variant: "Holo", edition: "Unlimited", language: "English", grade: "PSA 9",
  condition: null };

const worldAt = (currentSigned) => {
  /* price - trade = currentSigned, with a fixed trade value. */
  const market = 500;
  const price = market + currentSigned;
  const st = createStore({
    catalog: [GIVE, WANT], collectors: [{ id: "c12", name: "Casey", prefs: [] }],
    partners: [{ id: "p", name: PARTNER }],
    goals: [], binder: [], interests: [], conversations: [], opportunities: [],
    preferences: [], photoRequests: [], copyReviews: [],
    inventory: [{ invId: "i", partnerId: "p", cardId: "kt", ask: price,
      archived: false, photos: { front: "f", back: "b" } }],
  });
  const g = st.actions.addGoal({ collectorId: "c12", cardId: "kt", tier: "primary", at: AT });
  const o = st.actions.startOpportunity({ goalId: g, collectorId: "c12", partnerId: "p",
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
  return st.get();
};

let R = null;
/* Open the deal and drag the slider to a signed target. */
const openAt = (currentSigned) => {
  __store.reset(worldAt(currentSigned));
  TR.act(() => { R = TR.create(React.createElement(App)); });
  const b = R.root.findAllByType("button").find((x) => /^Deal Flow/.test(txt(x)));
  assert(b, "the Deal Flow disclosure");
  click(b);
  assert(cls(R, "cs-r")[0], "the cash slider renders");
  return R;
};
const dragTo = (signed) => {
  const slider = cls(R, "cs-r")[0];
  /* The slider reads left as you-owe, so its value is the negated balance. */
  TR.act(() => { slider.props.onChange({ target: { value: String(-signed) } }); });
};
const shown = (c) => txt(cls(R, c)[0]);
const cta = () => {
  const b = R.root.findAllByType("button").find((x) => /^Propose/.test(txt(x)));
  return b ? txt(b) : "(no propose CTA)";
};
const current = () => shown("cp-cur");
const proposed = () => shown("cp-prop");
const delta = () => shown("cp-delta");

/* The ten mandated cases, as { current, proposed } signed pairs. */
const CASES = [
  { id: 1, from: 168, to: 200,
    cur: /You pay Northline Cards \$168/, prop: /You pay Northline Cards \$200/,
    change: /\+\$32 from current/, ctaRe: /Propose \$200 settlement/ },
  { id: 2, from: 168, to: 100,
    cur: /You pay Northline Cards \$168/, prop: /You pay Northline Cards \$100/,
    change: /-\$68 from current/, ctaRe: /Propose \$100 settlement/ },
  { id: 3, from: 168, to: 0,
    cur: /You pay Northline Cards \$168/, prop: /No cash owed/,
    change: /\$168 reduction from current/, ctaRe: /Propose no cash owed/ },
  { id: 4, from: 168, to: -40,
    cur: /You pay Northline Cards \$168/, prop: /Northline Cards pays you \$40/,
    change: /\$208 swing from current/,
    ctaRe: /Propose: Northline Cards pays you \$40/ },
  { id: 5, from: -168, to: -200,
    cur: /Northline Cards pays you \$168/, prop: /Northline Cards pays you \$200/,
    change: /\+\$32 from current/,
    ctaRe: /Propose: Northline Cards pays you \$200/ },
  { id: 6, from: -168, to: -100,
    cur: /Northline Cards pays you \$168/, prop: /Northline Cards pays you \$100/,
    change: /-\$68 from current/,
    ctaRe: /Propose: Northline Cards pays you \$100/ },
  { id: 7, from: -168, to: 0,
    cur: /Northline Cards pays you \$168/, prop: /No cash owed/,
    change: /\$168 reduction from current/, ctaRe: /Propose no cash owed/ },
  { id: 8, from: -168, to: 40,
    cur: /Northline Cards pays you \$168/, prop: /You pay Northline Cards \$40/,
    change: /\$208 swing from current/, ctaRe: /Propose \$40 settlement/ },
  { id: 9, from: 0, to: 40,
    cur: /No cash owed/, prop: /You pay Northline Cards \$40/,
    change: /New \$40 cash settlement/, ctaRe: /Propose \$40 settlement/ },
  { id: 10, from: 0, to: -40,
    cur: /No cash owed/, prop: /Northline Cards pays you \$40/,
    change: /New \$40 cash settlement/,
    ctaRe: /Propose: Northline Cards pays you \$40/ },
];

describe("A. The ten cases, as rendered", () => {
  CASES.forEach((c) => {
    test("case " + c.id + ": " + c.from + " -> " + c.to, () => {
      openAt(c.from);
      /* Before touching anything, the control states where the cash stands. */
      assert(c.cur.test(current()),
        "current cash settlement: " + current());
      dragTo(c.to);
      assert(c.prop.test(proposed()),
        "proposed cash settlement: " + proposed());
      assert(c.change.test(delta()),
        "change line: " + delta());
      assert(c.ctaRe.test(cta()), "CTA: " + cta());
    });
  });
});

describe("B. The rules the labels follow", () => {
  test("a crossing is never signed", () => {
    [[168, -40], [-168, 40]].forEach(([a, b]) => {
      openAt(a); dragTo(b);
      const d = delta();
      assert(/swing from current/.test(d), a + " -> " + b + " is a swing: " + d);
      assert(!/^\+/.test(d) && !/^-/.test(d),
        "and carries no sign: " + d);
    });
  });

  test("a same-payer change is signed by magnitude", () => {
    openAt(168); dragTo(200);
    assert(/^\+\$32/.test(delta()), "larger is +: " + delta());
    openAt(168); dragTo(100);
    assert(/^-\$68/.test(delta()), "smaller is -: " + delta());
    /* And the same holds with the payer reversed. */
    openAt(-168); dragTo(-200);
    assert(/^\+\$32/.test(delta()), "symmetric when they owe: " + delta());
  });

  test("reaching zero is a reduction, leaving zero is a new settlement", () => {
    openAt(168); dragTo(0);
    assert(/reduction from current/.test(delta()), delta());
    openAt(0); dragTo(40);
    assert(/^New \$40 cash settlement/.test(delta()), delta());
    assert(!/from current/.test(delta()),
      "no previous payer is implied: " + delta());
  });

  test("no raw signed currency is ever shown", () => {
    [[168, 200], [168, -40], [-168, 40], [0, -40]].forEach(([a, b]) => {
      openAt(a); dragTo(b);
      [current(), proposed(), delta(), cta()].forEach((s) =>
        assert(!/-\$|\$-/.test(s.replace(/^-\$\d/, "")) || /^-\$\d+ from current$/.test(s),
          "unsigned currency in: " + s));
    });
  });
});

describe("C. The slider is the only direction control", () => {
  test("no switch, toggle or payer selector exists", () => {
    openAt(168);
    const labels = R.root.findAllByType("button").map(txt);
    assert(!labels.some((l) => /Switch to/i.test(l)), "no switch: " + labels.join(" | "));
    assert(!labels.some((l) => /reverse|flip|swap/i.test(l)), "no reverse control");
    const d = code(COL);
    assert(!/cs-flip/.test(d), "and no toggle survives in source");
    eq(R.root.findAllByType("input").filter((i) =>
      i.props.type === "checkbox" || i.props.type === "radio").length, 0,
      "no payer checkbox or radio");
  });

  test("crossing zero on the slider changes payer", () => {
    openAt(168);
    assert(/You pay/.test(proposed()), "starts on one side");
    dragTo(-40);
    assert(/Northline Cards pays you/.test(proposed()), "and crosses by dragging");
  });

  test("the slider and the numeric field are synchronized", () => {
    openAt(168);
    dragTo(-40);
    const field = R.root.findAllByType("input")
      .find((i) => i.props["aria-label"] === "Proposed cash amount");
    assert(field, "the numeric field exists");
    eq(field.props.value, "40", "showing the magnitude the slider set");
    /* Typing changes magnitude and keeps the side the slider chose. */
    TR.act(() => { field.props.onChange({ target: { value: "90" } }); });
    assert(/Northline Cards pays you \$90/.test(proposed()),
      "typing keeps the side: " + proposed());
  });
});

describe("D. Nothing underneath moves while editing", () => {
  test("the current baseline does not change as the draft moves", () => {
    openAt(168);
    const before = current();
    [200, 0, -40, 500].forEach((v) => {
      dragTo(v);
      eq(current(), before, "current stays put at draft " + v);
    });
  });

  test("editing writes nothing to the deal", () => {
    openAt(168);
    const snapshot = JSON.stringify(__store.get().get().opportunities);
    dragTo(-250);
    eq(JSON.stringify(__store.get().get().opportunities), snapshot,
      "a draft is local until proposed");
  });

  test("an accepted proposal reaches the receipt and Handoff", () => {
    openAt(168);
    const o = __store.get().get().opportunities[0];
    TR.act(() => { __store.get().actions.dealAdjustRespond({ oppId: o.id,
      by: "collector", action: "propose", amount: -40, at: AT }); });
    TR.act(() => { __store.get().actions.dealAdjustRespond({ oppId: o.id,
      by: "tp", action: "accept", at: AT }); });
    const after = __store.get().get().opportunities[0];
    eq(D.finalBalance(after), -40, "the agreed figure is the balance");
    const r = D.cashReceipt(after);
    eq(r.final.direction, "tp-to-collector", "with direction preserved");
    eq(r.final.amount, 40, "and an unsigned magnitude for display");
  });

  test("both seats stay economically consistent", () => {
    const s = worldAt(-168);
    const o = s.opportunities[0];
    const asCol = D.settlement(D.finalBalance(o), { viewer: "collector",
      partner: PARTNER, collector: "Casey" });
    const asTp = D.settlement(D.finalBalance(o), { viewer: "tp",
      partner: PARTNER, collector: "Casey" });
    eq(asCol.payerSeat, asTp.payerSeat, "one payer");
    eq(asCol.amount, asTp.amount, "one amount");
    assert(asCol.sentence !== asTp.sentence, "described from each side");
  });

  test("settlement() remains the only source of payer wording", () => {
    const cmpFn = code(fs.readFileSync(path.join(ROOT, "domain",
      "metyet-domain.js"), "utf8"));
    assert(/settlement\(currentSigned, ctx\)/.test(cmpFn),
      "the comparison delegates to it");
    assert(/settlement\(proposedSigned, ctx\)/.test(cmpFn), "for both sides");
    const deal = code(COL).slice(code(COL).indexOf("function DealStage("),
      code(COL).indexOf("function Fulfillment("));
    assert(!/> 0 \? "You pay"/.test(deal), "and no JSX re-derives it");
  });

  test("the lifecycle and economics are unchanged", () => {
    eq(D.PURSUIT_STEPS.map((x) => x.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment",
      "six, in order");
    eq(D.tradeValueOf({ inclusion: "accepted", agreedMarket: 500, agreedPercent: 1 }),
      500, "the formula holds");
  });
});

require("./run.cjs").run();
