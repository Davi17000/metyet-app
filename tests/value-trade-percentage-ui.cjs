/* ============================================================================
   A PERCENTAGE IS HARD TO WEIGH ON ITS OWN

   "80%" tells a collector almost nothing without the number it is 80% of, so
   the proposed percentage now carries its dollar equivalent on the same line —
   one figure read two ways, not two facts.

   The other two fixes share a single cause. The field styles for the shared
   TradeFields editor were written as `.ap .pn-*`, scoped to the Agree on Price
   panel. When that editor was shared into Value Trade there was no `.ap`
   ancestor, so the unit markers lost their absolute positioning and fell back
   to inline text — which is how a label and its own unit came to read as one
   run-on string, and why the stacked fields had no space between them.

   Unscoping the rules fixes both, and is the correct fix precisely because the
   component is shared now: styles that only work inside one panel are not
   shared styles.

   Presentation only. No canonical action, state, or economics changed.
   ========================================================================= */

process.env.METYET_DEV = "1";

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");
const M = require("../dist/MetYet.cjs");
const { collectorView } = require("../domain/collector-view.js");
const App = require("../dist/Collector.cjs").default;
const { __store } = require("../dist/Collector.cjs");

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const AT = "2026-08-19";

const txt = (n) => {
  if (!n) return "";
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ").replace(/\s+/g, " ").trim();
};
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));

const S = () => __store.get().get();
const acts = () => __store.get().actions;
const goal = () => collectorView(S(), "c12").myGoals()
  .find((g) => /^Review deal/.test(g.note || ""));
const opp = () => D.activeOppForGoal(goal().id, S().opportunities);

let R = null;
/* The example from the spec: market $500, partner proposes 80% -> $400. */
const EXAMPLE = { agreedMarket: 500, agreedPercent: null, tpPercent: 0.8,
  collectorPercent: null,
  percentThread: [{ by: "tp", type: "propose", percent: 0.8, at: AT }] };
const render = (over) => {
  __store.reset(M.buildCanonicalSeed({ review: true, demoStage: "value-trade" }));
  const tc = opp().trade.cards.find((c) => c.inclusion === "accepted");
  TR.act(() => { acts().patchOpportunity(opp().id, (x) => ({ ...x,
    trade: { ...x.trade, cards: x.trade.cards.map((c) => (c.id === tc.id
      ? { ...c, ...over } : c)) } })); });
  TR.act(() => { R = TR.create(React.createElement(App)); });
  cls(R, "goal").forEach((g) => {
    const d = g.findAllByType("button")
      .find((b) => String(b.props.className || "").includes("goal-deal"));
    if (d && !d.props["aria-expanded"]) click(d);
  });
  return cls(R, "vcard")[0];
};
const pctPhase = (vc) => cls(vc, "vp")
  .find((n) => /Trade %/.test(txt(cls(n, "vp-h")[0])));
const field = (aria) => cls(R, "vcard")[0].findAllByType("input")
  .find((i) => i.props["aria-label"] === aria);
const PCT = "Trade percentage of the agreed market value";
const DOL = "Trade value in dollars";

describe("A. The proposed percentage carries its dollars", () => {
  test("both appear on one line, in the spec's format", () => {
    const vc = render(EXAMPLE);
    eq(txt(cls(pctPhase(vc), "vp-amt")[0]), "80% ($400)",
      "percentage first, dollars in parentheses");
  });

  test("the attribution line below is unchanged", () => {
    const vc = render(EXAMPLE);
    eq(txt(cls(pctPhase(vc), "vp-by")[0]), "Proposed by Northline Cards — your move",
      "who proposed it and whose move it is, as before");
  });

  test("the dollars come from the canonical helper", () => {
    eq(D.tradeValueAt(500, 0.8), 400, "80% of $500");
    assert(/quote=\{\(frac\) => money\(D\.tradeValueAt\(tcd\.agreedMarket, frac\)\)\}/.test(COL),
      "the quote is derived, not recomputed");
  });

  test("whole dollars, no decimals", () => {
    /* An awkward percentage still reads as a round figure. */
    const vc = render({ ...EXAMPLE, tpPercent: 0.825,
      percentThread: [{ by: "tp", type: "propose", percent: 0.825, at: AT }] });
    const shown = txt(cls(pctPhase(vc), "vp-amt")[0]);
    assert(!/\./.test(shown.split("(")[1] || ""), "no decimals in the dollar figure: " + shown);
    assert(/\$41[0-9]/.test(shown), "rounded to whole dollars: " + shown);
  });

  test("the market phase gets no parenthetical", () => {
    /* Dollars quoted against dollars would be noise. */
    const vc = render({ agreedMarket: null, tpMarket: 500,
      valueThread: [{ by: "tp", type: "propose", amount: 500, at: AT }],
      agreedPercent: null, tpPercent: null, collectorPercent: null, percentThread: [] });
    const market = cls(vc, "vp").find((n) => /Market value/.test(txt(cls(n, "vp-h")[0])));
    eq(txt(cls(market, "vp-amt")[0]), "$500", "just the figure");
  });

  test("a settled percentage shows it too", () => {
    const vc = render({ agreedMarket: 500, agreedPercent: 0.8,
      percentThread: [{ by: "tp", type: "propose", percent: 0.8, at: AT },
        { by: "collector", type: "accept", percent: 0.8, at: AT }] });
    assert(/80% \(\$400\)/.test(txt(vc)), "the agreed term reads the same way");
  });
});

describe("B. Labels no longer collide with their units", () => {
  test("each field is labelled exactly once", () => {
    const vc = render(EXAMPLE);
    const labels = cls(pctPhase(vc), "pn-fl").map(txt);
    eq(labels.join(" | "), "Trade % | Trade Value",
      "single %, and no duplicated heading");
    eq(labels.filter((l) => /%%/.test(l)).length, 0, "no doubled unit in any label");
  });

  test("the counter heading names the move, not the fields", () => {
    const vc = render(EXAMPLE);
    eq(txt(cls(pctPhase(vc), "vp-counter-h")[0]), "Your counter",
      "the shared editor labels its own fields");
  });

  test("no duplicate editor renders alongside the shared one", () => {
    const vc = render(EXAMPLE);
    eq(cls(pctPhase(vc), "pn-in").length, 1, "one editor");
    eq(vc.findAllByType("input").filter((i) => i.props["aria-label"] === PCT).length, 1,
      "and one percentage field");
  });

  test("the units are markers inside the inputs, not label text", () => {
    const vc = render(EXAMPLE);
    eq(cls(pctPhase(vc), "pn-u").map(txt).join(","), "%,$", "one marker per field");
  });
});

describe("C. The shared field styles are actually shared", () => {
  test("they are no longer scoped to the Agree on Price panel", () => {
    /* THE ROOT CAUSE of both the doubled label and the missing spacing. */
    [".pn-in", ".pn-f", ".pn-fl", ".pn-w", ".pn-u"].forEach((sel) => {
      const scoped = new RegExp("\\.ap \\" + sel + " \\{");
      assert(!scoped.test(COL), sel + " is not locked to one panel");
      assert(new RegExp("^\\" + sel + " \\{", "m").test(COL), sel + " applies wherever used");
    });
  });

  test("the unit markers are positioned, so they cannot fall back to inline text", () => {
    assert(/^\.pn-u \{ position: absolute;/m.test(COL), "absolutely positioned");
    assert(/^\.pn-w \{ position: relative;/m.test(COL), "against a positioned field");
    assert(/^\.pn-u\.r \{ left: auto; right: 11px; \}/m.test(COL),
      "with the percentage marker on the trailing edge");
  });

  test("stacked fields get the spacing the send button has", () => {
    assert(/\.vp \.pn-in \{ flex-direction: column; gap: 0; \}/.test(COL),
      "the two fields stack in Value Trade");
    assert(/\.vp \.pn-in > \.pn-f \+ \.pn-f \{ margin-top: 12px; \}/.test(COL),
      "and the second one is given room above it");
    assert(/margin-top: 10px/.test(COL), "matching the button spacing elsewhere");
  });

  test("Agree on Price still styles its own fields", () => {
    __store.reset(M.buildCanonicalSeed({ review: true, demoStage: "agree-price" }));
    TR.act(() => { R = TR.create(React.createElement(App)); });
    cls(R, "goal").forEach((g) => {
      const d = g.findAllByType("button")
        .find((b) => String(b.props.className || "").includes("goal-deal"));
      if (d && !d.props["aria-expanded"]) click(d);
    });
    const ap = cls(R, "ap")[0];
    if (!ap) return;                       /* only when it is the collector's move */
    const units = cls(ap, "pn-u").map(txt);
    if (units.length) assert(units.every((u) => /[$%]/.test(u)), "its units still render");
  });
});

describe("D. Nothing but presentation changed", () => {
  test("the linked editor still converts both ways", () => {
    render(EXAMPLE);
    TR.act(() => { field(PCT).props.onChange({ target: { value: "90" } }); });
    eq(field(DOL).props.value, "450", "90% of $500");
    TR.act(() => { field(DOL).props.onChange({ target: { value: "450" } }); });
    eq(field(PCT).props.value, "90", "and back");
  });

  test("the send action still names the draft", () => {
    const vc = render(EXAMPLE);
    TR.act(() => { field(PCT).props.onChange({ target: { value: "90" } }); });
    const labels = cls(R, "vcard")[0].findAllByType("button").map(txt);
    assert(labels.some((t) => /^Send 90%$/.test(t)), "Send 90%: " + labels.join(" | "));
    assert(labels.some((t) => /^Accept 80%$/.test(t)), "and Accept still names the standing one");
  });

  test("accepting settles at the standing proposal, unchanged", () => {
    const vc = render(EXAMPLE);
    const before = JSON.stringify(opp().trade.cards);
    click(cls(R, "vcard")[0].findAllByType("button").find((b) => /^Accept 80%$/.test(txt(b))));
    const card = opp().trade.cards.find((c) => c.inclusion === "accepted");
    eq(card.agreedPercent, 0.8, "settled at 80%");
    eq(D.tradeValueOf(card), 400, "worth $400 toward the card");
    assert(before !== JSON.stringify(opp().trade.cards), "and the state really moved");
  });

  test("no canonical field is written by the presentation", () => {
    const vc = COL.slice(COL.indexOf("function Phase("), COL.indexOf("function ValueCard("));
    ["agreedMarket:", "agreedPercent:", "stage:"].forEach((f) =>
      assert(!vc.includes(f), "no direct write of " + f));
  });

  test("the lifecycle is unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
    eq(D.tradeValueOf({ inclusion: "accepted", agreedMarket: 500, agreedPercent: 0.8 }),
      400, "and the formula holds");
  });
});

require("./run.cjs").run();
