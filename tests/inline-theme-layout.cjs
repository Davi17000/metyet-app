/* ============================================================================
   INLINE DEAL FLOW — LIGHT THEME AND LAYOUT

   Three defects this pass corrects, all presentation:

   1. THEME. The light token set lived on `.dw`, but the inline workspace had
      flattened its own panels to transparent — so the dark browsing card behind
      showed through. The expanded Goal now carries the light tokens itself: an
      expanded Goal IS the deal, so it takes the deal's close-reading surface.

   2. LAYOUT. The working area was one undifferentiated column. Guidance, stage
      work and its action now form the primary column and the conversation the
      supporting one — stacked on a phone, side by side on a wide screen, both
      inside the SAME Goal surface rather than in two cards.

   3. DUPLICATE ACTION. Three stages rendered their own primary button AND
      registered the identical action with the shell's bar, so the collector saw
      two identical buttons driving one handler.

   Nothing here touches lifecycle, stage semantics or conversation state.
   ========================================================================= */

process.env.METYET_DEV = "1";

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const D = require("../domain/metyet-domain.js");
const App = require("../dist/Collector.cjs").default;
const { __store } = require("../dist/Collector.cjs");
const { buildCanonicalSeed } = require("../dist/MetYet.cjs");

const readSrc = (rel) => require("fs").readFileSync(require("path").join(__dirname, "..", rel), "utf8");
const SRC = readSrc("collector/MetYetCollector.jsx");
const txt = (n) => {
  if (!n) return "";
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ");
};
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));

const ME = "c12";
const STAGES = ["agree-price", "select-trade", "value-trade", "deal", "fulfillment"];
const mk = () => { __store.reset(buildCanonicalSeed({ review: true }));
  let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r; };
const S = () => __store.get().get();
const oppAt = (stage) => S().opportunities.find((x) => x.collectorId === ME
  && D.isActive(x) && x.stage === stage);
const goalOf = (o) => S().goals.find((g) => g.id === o.goalId);
const cardFor = (r, g) => {
  const c = S().catalog.find((x) => x.id === g.cardId);
  return cls(r, "goal").find((n) => txt(n).includes(c.name) && txt(n).includes(c.set));
};
const rowIn = (node) => node.findAllByType("button")
  .find((b) => String(b.props.className || "").includes("goal-deal"));
const expand = (r, g) => { click(rowIn(cardFor(r, g))); return cardFor(r, g); };
const labels = (node) => node.findAllByType("button").map((b) => txt(b).trim()).filter(Boolean);
const dupes = (node) => {
  const seen = {}; labels(node).forEach((l) => { seen[l] = (seen[l] || 0) + 1; });
  return Object.entries(seen).filter(([, v]) => v > 1).map(([k]) => k);
};
const worldShape = () => JSON.stringify({
  opps: S().opportunities.map((o) => [o.id, o.stage, o.agreedPrice, o.completedAt,
    o.declined, JSON.stringify(o.trade), D.nextActor(o).actor]),
  goals: S().goals.map((g) => [g.id, g.tier]),
  convs: S().conversations.map((t) => [t.key, t.entries.length]) });

describe("Theme — the expanded Goal is the light workspace", () => {
  test("expanding switches the Goal onto the light token set", () => {
    const r = mk();
    const g = goalOf(oppAt("select-trade"));
    assert(!/deal-open/.test(cardFor(r, g).props.className),
      "collapsed, the Goal stays a browsing surface");
    const card = expand(r, g);
    assert(/deal-open/.test(card.props.className),
      "expanded, it carries the deal's light treatment");
  });

  test("the light tokens are the existing ones, not a second colour system", () => {
    /* One declaration block serves both the page workspace and the inline one. */
    assert(/\.goal\.deal-open, \.dw \{/.test(SRC),
      "the expanded Goal shares the .dw token block");
    const block = SRC.slice(SRC.indexOf(".goal.deal-open, .dw {"),
      SRC.indexOf("}", SRC.indexOf(".goal.deal-open, .dw {")));
    [["--panel", "#FFFFFF"], ["--bg", "#F7F9FA"], ["--text", "#16202A"],
     ["--accent", "#0B7A72"], ["--line", "#DFE5E8"]].forEach(([k, v]) =>
      assert(new RegExp(k + ":\\s*" + v).test(block), k + " keeps its canonical value"));
  });

  test("the expanded Goal paints a light surface, not a dark one showing through", () => {
    const open = /\.goal\.deal-open \{[^}]*background: var\(--panel\)[^}]*\}/.exec(SRC);
    assert(open, "the expanded Goal paints an opaque light panel");
    assert(/color: var\(--text\)/.test(open[0]), "with the dark reading text");
    assert(/border-color: var\(--line\)/.test(open[0]), "and the light divider colour");
  });

  test("browsing surfaces are untouched", () => {
    const r = mk();
    /* A goal with no expanded deal must not pick up the workspace theme. */
    cls(r, "goal").filter((n) => !/deal-open/.test(n.props.className))
      .forEach((n) => assert(!/deal-open/.test(n.props.className), "still browsing"));
    assert(!/\.pg\.deal-open|body\s*\{[^}]*--panel: #FFFFFF/.test(SRC),
      "no global light override leaked out");
  });
});

describe("Layout — one surface, primary and supporting columns", () => {
  test("the working area splits into stage and conversation columns", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    const work = cls(card, "idf-work")[0];
    const main = cls(card, "idf-task")[0];
    const side = cls(card, "idf-side")[0];
    assert(work && main && side, "both columns exist inside one work container");
    eq(cls(work, "idf-task").length, 1, "stage and conversation are siblings");
    eq(cls(work, "idf-side").length, 1, "in the same work container");
    eq(cls(main, "idf-stage").length, 1, "stage work is in the primary column");
    eq(cls(main, "idf-action").length, 1, "with its one action");
    eq(cls(side, "chat-embed").length, 1, "conversation is the supporting column");
    eq(cls(main, "chat-embed").length, 0, "and does not also sit in the primary one");
    /* Summary and rail are ABOVE the work area; details/alternatives BELOW. */
    eq(cls(work, "goal-deal").length, 0, "the summary is outside the work area");
    eq(cls(work, "rail-s").length, 0, "and so is the rail");
    eq(cls(work, "rc-wrap").length, 0, "the receipt sits below it");
    eq(cls(work, "goal-holders").length, 0, "and so do the partner alternatives");
  });

  test("mobile stacks; the desktop split is an enhancement, not a second build", () => {
    assert(/\.idf-work \{[^}]*display: block/.test(SRC),
      "one column by default — mobile is the base case");
    const desk = SRC.slice(SRC.indexOf("@container deal (min-width:"));
    assert(/\.idf-work \{ display: grid/.test(desk),
      "becoming a real two-column grid only when there is room");
  });

  test("neither column collapses to a strip, and stage carries more weight", () => {
    const desk = SRC.slice(SRC.indexOf("@container deal (min-width:"));
    const cols = /grid-template-columns: minmax\(0, (\d+)fr\) minmax\((\d+)px, (\d+)fr\)/.exec(desk);
    assert(cols, "the work area declares an explicit two-column grid");
    assert(Number(cols[1]) > Number(cols[3]),
      "the stage column takes the larger share (" + cols[1] + "fr vs " + cols[3] + "fr)");
    assert(Number(cols[2]) >= 300, "and the conversation has a readable floor");
    /* Exactly two columns — no hidden third. */
    eq(cols[0].split("minmax").length - 1, 2, "exactly two tracks");
    assert(/\.idf-main, \.idf-side \{ grid-column: auto/.test(desk),
      "with no legacy grid-column placement inherited from the page shell");
  });

  test("the standalone page shell controls no inline geometry", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    /* None of the page shell's regions are mounted inside the Goal. */
    ["dw", "dw-inline", "dw-ctx", "dw-prog", "dw-bar", "dw-stage", "dw-guide", "dw-flow", "pg"]
      .forEach((k) => eq(cls(card, k).length, 0, "no ." + k + " inside the Goal"));
    assert(cls(card, "idf")[0], "the dedicated inline wrapper is what renders");
    /* And it declares none of the page-level geometry that caused the trouble. */
    const idf = SRC.slice(SRC.indexOf(".idf { display: block; }"),
      SRC.indexOf("@container deal (min-width:"));
    assert(!/min-height: 100vh/.test(idf), "no viewport min-height");
    assert(!/position: fixed|position: sticky/.test(idf), "nothing pinned");
    assert(!/env\(safe-area-inset/.test(idf), "no page safe-area padding");
  });

  test("no nested scroller and no horizontal overflow", () => {
    assert(/\.idf \.chat-embed \.chat-scroll[^}]*max-height: none; overflow: visible/.test(SRC),
      "the conversation does not scroll inside its own box");
    assert(/\.idf-task, \.idf-mid, \.idf-side \{ min-width: 0; \}/.test(SRC),
      "grid children may shrink, so nothing forces horizontal overflow");
    assert(/minmax\(0,/.test(SRC), "and the stage track may shrink below its content");
  });
});

describe("Exactly one primary stage action", () => {
  STAGES.forEach((stage) => {
    test(stage + " shows its canonical action exactly once", () => {
      const r = mk();
      const card = expand(r, goalOf(oppAt(stage)));
      eq(dupes(card).length, 0,
        stage + ": no button label appears twice — " + dupes(card).join(", "));
    });
  });

  test("the duplication was removed at source, not hidden with CSS", () => {
    /* Each stage now defers to the registration when the shell will present it. */
    ["st.submitTrade(o.id, picked)", "st.confirmHandoff(o.id)"].forEach((handler) => {
      const ix = SRC.indexOf(handler);
      const before = SRC.slice(Math.max(0, ix - 400), ix);
      assert(/!register/.test(before),
        "the in-stage duplicate of " + handler + " is guarded by !register");
    });
    assert(!/\.dw-inline[^{]*\{[^}]*display: none/.test(SRC),
      "nothing is merely hidden from view");
  });

  test("the canonical handler and registration are unchanged", () => {
    assert(/register\(!o\.trade\.submitted && eligible\.length/.test(SRC),
      "Select Trade still registers its action");
    assert(/run: \(\) => st\.submitTrade\(o\.id, picked\)/.test(SRC),
      "driving the same canonical handler");
    const r = mk();
    const o = oppAt("select-trade");
    const card = expand(r, goalOf(o));
    const go = cls(card, "idf-action")[0].findAllByType("button")[0];
    assert(go, "the bar presents the action");
    assert(/for review/.test(txt(go)), "with the stage's own label");
  });
});

describe("Duplication and hierarchy hold across all five stages", () => {
  STAGES.forEach((stage) => {
    test(stage + " renders one of each element", () => {
      const r = mk();
      const card = expand(r, goalOf(oppAt(stage)));
      eq(cls(card, "goal-deal").length, 1, "one deal summary");
      eq(cls(card, "rail-s").length, 5, "one five-stage rail");
      eq(cls(card, "rc-wrap").length, 1, "one receipt");
      eq(cls(card, "chat-embed").length, 1, "one conversation");
      eq(cls(card, "goal-with").length, 0, "no separate partner block");
      eq(cls(card, "goal-live-view").length, 0, "no large Hide Deal Flow button");
      eq(cls(card, "goal-live-stage").length, 0, "no repeated stage title");
      assert(/deal-open/.test(card.props.className), "on the light surface");
    });
  });

  test("Value Trade still resolves real BinderCopies", () => {
    const r = mk();
    const o = oppAt("value-trade");
    expand(r, goalOf(o));
    const owned = new Set(S().binder.filter((b) => b.collectorId === ME).map((b) => b.id));
    D.acceptedTradeCards(o).forEach((tc) => assert(owned.has(tc.binderId),
      "every trade term names a copy the collector owns"));
  });

  test("details, partner discovery and end stay below the working area", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    const seen = [];
    card.findAll((n) => typeof n.type === "string").forEach((n) => {
      String(n.props.className || "").split(/\s+/).forEach((k) => {
        if (["idf-work", "rc-wrap", "goal-holders"].includes(k) && !seen.includes(k)) seen.push(k);
      });
    });
    eq(seen[0], "idf-work", "the working area comes first");
    assert(!/Stop this negotiation/.test(txt(cls(card, "idf-action")[0])),
      "and stopping never sits beside the forward action");
  });
});

describe("Collapse still behaves", () => {
  test("the summary row opens and closes, reporting aria-expanded", () => {
    const r = mk();
    const g = goalOf(oppAt("select-trade"));
    const row = () => rowIn(cardFor(r, g));
    eq(row().props["aria-expanded"], false, "collapsed to begin with");
    click(row());
    eq(row().props["aria-expanded"], true, "reports expanded");
    assert(cls(cardFor(r, g), "idf-work")[0], "and the working area is there");
    click(row());
    eq(row().props["aria-expanded"], false, "the same row closed it");
    eq(cls(cardFor(r, g), "idf-work").length, 0, "leaving nothing behind");
    assert(!/deal-open/.test(cardFor(r, g).props.className),
      "and returning the card to the browsing surface");
  });

  test("expanding, collapsing and switching mutate nothing", () => {
    const r = mk();
    const a = goalOf(oppAt("select-trade"));
    const b = goalOf(oppAt("value-trade"));
    const before = worldShape();
    expand(r, a);
    expand(r, b);
    eq(cls(r, "idf-work").length, 1, "one deal open at a time");
    click(rowIn(cardFor(r, b)));
    eq(worldShape(), before, "no canonical data changed at any point");
  });
});

require("./run.cjs").run();
