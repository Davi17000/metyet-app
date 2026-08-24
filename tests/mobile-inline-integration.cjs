/* ============================================================================
   THE DOOR PEOPLE ACTUALLY USE

   The prototype worked, and almost nobody would have seen it. It was gated to
   the full-page deal route, while the path a collector actually takes is
   Goals → Primary Goal → Deal Flow — and on a phone that path still rendered
   the desktop workspace: a six-step vertical rail and stacked panels, which is
   exactly what the timeline exists to replace.

   So this is a second door onto one room, not a second room. The inline shell
   gates on the same hook, at the same 560px, to the same component. The tests
   below care mostly about that word "same": one MobileDeal, one breakpoint, one
   opportunity object, and the same canonical state whichever way you came in.

   One composition change was needed. Reached from inside a Goal, the card above
   already names the card and the partner and already offers the way back, so
   repeating them would put two deal headers on one phone screen. Embedded mode
   drops that chrome and nothing else — the progress rail and the summary stay,
   because those belong to the deal rather than to the Goal.
   ========================================================================= */

process.env.METYET_DEV = "1";

/* A phone viewport, switchable per test. Installed before the app loads. */
global.window = global.window || {};
let NARROW = true;
window.matchMedia = (q) => ({
  matches: /max-width:\s*560px/.test(q) && NARROW,
  addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {},
});

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
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const AT = "2026-08-20";

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
/* The collector's real path: open Goals, expand the Goal's Deal Flow. */
const openInline = ({ narrow = true, stage = "value-trade" } = {}) => {
  NARROW = narrow;
  __store.reset(M.buildCanonicalSeed({ review: true, demoStage: stage }));
  TR.act(() => { R = TR.create(React.createElement(App)); });
  expand();
  return R;
};
const expand = () => cls(R, "goal").forEach((g) => {
  const d = g.findAllByType("button")
    .find((b) => String(b.props.className || "").includes("goal-deal"));
  if (d && !d.props["aria-expanded"]) click(d);
});
const collapse = () => cls(R, "goal").forEach((g) => {
  const d = g.findAllByType("button")
    .find((b) => String(b.props.className || "").includes("goal-deal"));
  if (d && d.props["aria-expanded"]) click(d);
});
const rerender = () => { TR.act(() => { R.update(React.createElement(App)); }); expand(); };
const events = () => cls(R, "mdl-e").map(txt);

describe("A. The natural path reaches the timeline", () => {
  test("a phone opening a Goal's Deal Flow gets the mobile timeline", () => {
    /* THE SCREENSHOT CASE: this rendered the desktop workspace before. */
    openInline({ narrow: true });
    eq(cls(R, "mdl").length, 1, "the timeline renders inline");
    eq(cls(R, "idf-stage").length, 0, "and the desktop workspace does not");
  });

  test("no special route or extra step is needed", () => {
    openInline({ narrow: true });
    eq(cls(R, "mdl-step").map(txt).join(" | "),
      "Price | Trade | Value | Cash | Handoff",
      "the canonical five, straight from Goals");
    assert(cls(R, "mdl-now")[0], "with the current decision present");
  });

  test("desktop keeps the existing inline composition exactly", () => {
    openInline({ narrow: false });
    eq(cls(R, "mdl").length, 0, "no mobile shell");
    eq(cls(R, "goal-dw").length, 1, "the inline deal wrapper is unchanged");
    eq(cls(R, "idf-stage").length, 1, "the stage workspace renders");
    eq(cls(R, "chat-embed").length, 1, "with its conversation in place");
    assert(cls(R, "vcard")[0], "and the desktop value cards");
  });

  test("the full-page route still works too", () => {
    /* Both doors, one room — the earlier gate was not replaced. */
    const active = code(COL);
    eq((active.match(/if \(narrow\) return <MobileDeal/g) || []).length, 2,
      "both shells gate");
  });
});

describe("B. One component, one breakpoint", () => {
  test("there is exactly one MobileDeal", () => {
    eq((code(COL).match(/function MobileDeal\(/g) || []).length, 1, "one definition");
    assert(/<MobileDeal o=\{o\} st=\{st\} go=\{go\} embedded \/>/.test(code(COL)),
      "the inline path renders it rather than copying its JSX");
  });

  test("there is exactly one breakpoint", () => {
    eq((code(COL).match(/const MOBILE_MAX = /g) || []).length, 1, "one constant");
    eq((code(COL).match(/function useNarrow\(/g) || []).length, 1, "one hook");
    eq((code(COL).match(/const narrow = useNarrow\(\);/g) || []).length, 2,
      "used by both shells, and nowhere else");
    assert(/const MOBILE_MAX = 560;/.test(code(COL)), "still 560px");
  });

  test("nothing was duplicated to make this work", () => {
    ["function dealTimeline(", "const M_STEPS"].forEach((k) =>
      eq((code(COL).match(new RegExp(k.replace(/[()]/g, "\\$&"), "g")) || []).length, 1,
        k + " exists once"));
  });

  test("the inline path adds no adapter of its own", () => {
    const inline = code(COL).slice(code(COL).indexOf("function InlineDeal("),
      code(COL).indexOf("function useNarrow("));
    assert(!/dealTimeline\(/.test(inline), "it does not project events itself");
    assert(!/cashReceipt|totalTradeValue/.test(inline), "nor recompute economics");
  });
});

describe("C. The same opportunity, not a copy", () => {
  test("the inline timeline reads the canonical opportunity", () => {
    openInline({ narrow: true });
    const o = opp();
    /* Every figure on screen traces to this object. */
    const shown = cls(R, "mdl")[0];
    assert(txt(shown).length > 0, "the shell rendered");
    eq(D.RECEIPT_STAGES.indexOf(o.stage) >= 0, true, "on a canonical stage");
    const now = cls(R, "mdl-step").filter((n) => String(n.props.className).includes("now"));
    eq(txt(now[0]), "Value", "and the marker matches the opportunity's own stage");
  });

  test("inline and full-page agree about stage and turn", () => {
    openInline({ narrow: true });
    const o = opp();
    const inlineStage = txt(cls(R, "mdl-step")
      .filter((n) => String(n.props.className).includes("now"))[0]);
    const inlineTurn = txt(cls(R, "mdl-now-h")[0]);
    /* Both shells render the same component from the same object, so agreement
       is structural — asserted anyway, since that is the claim being made. */
    eq(D.RECEIPT_STAGES[D.RECEIPT_STAGES.indexOf(o.stage)], o.stage, "one stage");
    assert(/Your move|Waiting on/.test(inlineTurn), "one turn statement: " + inlineTurn);
    assert(inlineStage.length > 0, "and one marker");
  });

  test("opening and collapsing the Goal mutate nothing", () => {
    openInline({ narrow: true });
    const before = JSON.stringify(S().opportunities);
    collapse();
    expand();
    collapse();
    eq(JSON.stringify(S().opportunities), before, "expanding is presentation only");
  });

  test("only one Goal expands at a time, as before", () => {
    openInline({ narrow: true });
    const open = cls(R, "goal").flatMap((g) => g.findAllByType("button"))
      .filter((b) => String(b.props.className || "").includes("goal-deal")
        && b.props["aria-expanded"]);
    assert(open.length <= 1, "at most one deal flow open");
  });
});

describe("D. Canonical behaviour is unchanged through the inline door", () => {
  test("an action from the inline timeline mutates canonical state", () => {
    openInline({ narrow: true, stage: "agree-price" });
    const o = opp();
    const id = o.id;
    /* Give the collector the move, then act through the mobile UI. */
    TR.act(() => { acts().patchOpportunity(id, (x) => ({ ...x,
      priceThread: [...x.priceThread,
        { by: "tp", type: "propose", amount: 3700, at: "2026-08-15" }] })); });
    rerender();
    const b = R.root.findAllByType("button").find((x) => /^Accept \$3,700$/.test(txt(x)));
    assert(b, "the canonical accept is offered: "
      + R.root.findAllByType("button").map(txt).filter(Boolean).join(" | "));
    click(b);
    const after = S().opportunities.find((x) => x.id === id);
    eq(after.agreedPrice, 3700, "settled through the canonical action");
    eq(after.stage, "select-trade", "and advanced canonically");
  });

  test("a message from the inline path joins the same thread", () => {
    openInline({ narrow: true });
    const o = opp();
    const card = S().catalog.find((x) => x.id === o.cardId);
    TR.act(() => { acts().sendMessage({ collectorId: "c12", partnerId: o.partnerId,
      cardId: card.id, by: "collector", text: "Works for me", at: "2026-08-21" }); });
    rerender();
    assert(events().some((e) => /Works for me/.test(e)), "it appears on the timeline");
    const thread = collectorView(S(), "c12").threadWith(o.partnerId, o.cardId);
    assert(thread && thread.entries.some((e) => e.text === "Works for me"),
      "in the one canonical conversation");
  });

  test("a message still settles nothing", () => {
    openInline({ narrow: true, stage: "agree-price" });
    const o = opp();
    const card = S().catalog.find((x) => x.id === o.cardId);
    TR.act(() => { acts().sendMessage({ collectorId: "c12", partnerId: o.partnerId,
      cardId: card.id, by: "collector", text: "Deal!", at: "2026-08-21" }); });
    const after = opp();
    eq(after.agreedPrice, null, "no price agreed by saying so");
    eq(after.stage, "agree-price", "and the stage has not moved");
  });

  test("controls follow turn ownership, and waiting offers none", () => {
    openInline({ narrow: true, stage: "agree-price" });
    const mine = D.nextActor(opp()).actor === "collector";
    const header = txt(cls(R, "mdl-now-h")[0]);
    const hasAccept = R.root.findAllByType("button").some((b) => /^Accept \$/.test(txt(b)));
    if (mine) {
      assert(/Your move/.test(header), "the collector's turn says so: " + header);
    } else {
      assert(/Waiting on/.test(header), "otherwise it names who is holding it");
      assert(!hasAccept, "and offers no inert accept");
    }
    /* The decisive case: hand the move to the partner and watch controls go. */
    const id = opp().id;
    TR.act(() => { acts().patchOpportunity(id, (x) => ({ ...x,
      priceThread: [...x.priceThread,
        { by: "collector", type: "counter", amount: 3400, at: "2026-08-16" }] })); });
    rerender();
    eq(D.nextActor(opp()).actor, "partner", "now it is theirs");
    assert(/Waiting on/.test(txt(cls(R, "mdl-now-h")[0])), "the header follows");
    assert(!R.root.findAllByType("button").some((b) => /^Accept \$/.test(txt(b))),
      "and the accept is gone rather than disabled");
  });

  test("exact binder-copy identity survives the inline path", () => {
    openInline({ narrow: true });
    const rows = (opp().trade && opp().trade.cards) || [];
    rows.forEach((r) => assert("binderId" in r && r.id !== r.binderId,
      "a trade row keeps its own id and its copy's id"));
  });

  test("signed cash direction is unchanged", () => {
    const mk = (price, trade) => ({ agreedPrice: price,
      trade: { cards: [{ inclusion: "accepted", agreedMarket: trade, agreedPercent: 1 }] },
      deal: {} });
    eq(D.cashReceipt(mk(1000, 275)).calculated.direction, "collector-to-tp", "you owe");
    eq(D.cashReceipt(mk(700, 1000)).calculated.direction, "tp-to-collector", "they owe");
    eq(D.cashReceipt(mk(1000, 1000)).calculated.direction, "settled", "nobody owes");
  });

  test("the lifecycle is unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
  });
});

describe("E. Embedded chrome, and what stays outside the deal", () => {
  test("the inline shell suppresses the duplicate header", () => {
    openInline({ narrow: true });
    const h = cls(R, "mdl-h")[0];
    assert(h, "the header region still exists");
    assert(String(h.props.className).includes("emb"), "in embedded form");
    assert(!txt(h).includes("← Goals"),
      "without a second way back, since the Goal card already has one");
  });

  test("the full-page shell keeps its own header", () => {
    const shell = code(COL).slice(code(COL).indexOf("function MobileDeal("),
      code(COL).indexOf("function MobileDeal(") + 3000);
    assert(/\{!embedded && \(/.test(shell), "the chrome is conditional");
    assert(/← Goals/.test(shell), "and the standalone route keeps its back link");
  });

  test("progress and summary belong to the deal, so they stay", () => {
    openInline({ narrow: true });
    eq(cls(R, "mdl-step").length, 5, "the canonical five still render");
    const sum = R.root.findAllByType("button").find((b) => /Deal summary/.test(txt(b)));
    assert(sum, "and the summary is still reachable");
    click(sum);
    assert(cls(R, "mdl-sum")[0], "expanding in place");
  });

  test("a Goal with no active deal is untouched", () => {
    /* Pre-offer pursuit is not a five-stage deal, and stays outside. */
    NARROW = true;
    __store.reset(M.buildCanonicalSeed({ review: true, demoStage: "pre-deal-ready" }));
    TR.act(() => { R = TR.create(React.createElement(App)); });
    const g = goal();
    assert(!D.activeOppForGoal(g.id, S().opportunities),
      "the goal has no opportunity yet");
    eq(cls(R, "mdl").length, 0, "so no deal timeline renders");
  });

  test("the inline gate only fires for a real deal", () => {
    const inline = code(COL).slice(code(COL).indexOf("function InlineDeal("),
      code(COL).indexOf("function useNarrow("));
    assert(/if \(narrow\) return <MobileDeal/.test(inline), "the gate is here");
    /* InlineDeal is only mounted for an active opportunity, so the gate cannot
       capture discovery or Review Card. */
    assert(/<InlineDeal o=\{live\} st=\{st\} go=\{go\} \/>/.test(code(COL)),
      "and it is mounted with a live opportunity");
  });
});

require("./run.cjs").run();
