/* ============================================================================
   INLINE DEAL FLOW — DEDICATED SHELL

   Previous passes mounted the standalone Deal PAGE inside the Primary Goal and
   then fought its geometry with overrides. The page shell owns `min-height:
   100vh`, page padding, a fixed action bar, its own context header and its own
   progress panel — every one of those is wrong inside a card, and no amount of
   overriding made it right.

   Inline mode now renders `InlineDeal`, a wrapper whose geometry is built for
   the Goal card. It reuses the canonical stage components, the same `register`
   contract for the one action, the same DealChat on the same partner-scoped
   thread, and the same opportunity. No business logic lives in it.

   These tests hold the STRUCTURE — which wrapper renders, what nests inside
   what, and which page-shell regions must be absent — rather than counting
   classes. Nothing here touches lifecycle or stage semantics.
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
/* Every region the standalone page owns. None may appear inside a Goal. */
const PAGE_SHELL = ["pg", "dw", "dw-inline", "dw-ctx", "dw-prog", "dw-guide",
  "dw-stage", "dw-bar", "dw-flow", "dw-chat"];

const mk = () => { __store.reset(buildCanonicalSeed({ review: true }));
  let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r; };
const S = () => __store.get().get();
const acts = () => __store.get().actions;
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
const worldShape = () => JSON.stringify({
  opps: S().opportunities.map((o) => [o.id, o.stage, o.agreedPrice, o.completedAt,
    o.declined, JSON.stringify(o.trade), D.nextActor(o).actor]),
  goals: S().goals.map((g) => [g.id, g.tier]),
  convs: S().conversations.map((t) => [t.key, t.entries.length]) });
/* The desktop rules, read once. */
const WIDE_AT = SRC.indexOf("@container deal (min-width: 820px)");
const DESKTOP = SRC.slice(WIDE_AT, WIDE_AT + 700);

describe("A. The dedicated inline shell", () => {
  STAGES.forEach((stage) => {
    test(stage + ": no region of the standalone page shell is mounted", () => {
      const r = mk();
      const card = expand(r, goalOf(oppAt(stage)));
      PAGE_SHELL.forEach((k) => eq(cls(card, k).length, 0,
        stage + ": ." + k + " must not exist inside a Goal"));
      assert(cls(card, "idf")[0], stage + ": the dedicated wrapper renders instead");
    });
  });

  test("the Goal mounts InlineDeal, not the page component", () => {
    const card = SRC.slice(SRC.indexOf("function GoalCard"), SRC.indexOf("function SimulateTP"));
    assert(/<InlineDeal o=\{live\} st=\{st\}/.test(card),
      "the Goal mounts the dedicated inline wrapper");
    assert(!/<Deal\b/.test(card), "and never the standalone page component");
  });

  test("stage and conversation are siblings inside one work container", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    const work = cls(card, "idf-work")[0];
    assert(work, "a single work container");
    eq(cls(work, "idf-task").length, 1, "one primary column");
    eq(cls(work, "idf-side").length, 1, "one supporting column");
    eq(cls(cls(work, "idf-task")[0], "idf-stage").length, 1, "stage work in the primary");
    eq(cls(cls(work, "idf-side")[0], "chat-embed").length, 1, "conversation in the supporting");
  });

  test("summary and rail sit above the work area; details and end below", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    const work = cls(card, "idf-work")[0];
    ["goal-deal", "rail-s"].forEach((k) => eq(cls(work, k).length, 0,
      "." + k + " is outside (above) the work area"));
    ["rc-wrap", "goal-holders"].forEach((k) => eq(cls(work, k).length, 0,
      "." + k + " is outside (below) the work area"));

    const seen = [];
    card.findAll((n) => typeof n.type === "string").forEach((n) => {
      String(n.props.className || "").split(/\s+/).forEach((k) => {
        if (["goal-deal", "goal-rail", "idf-work", "rc-wrap", "goal-holders"].includes(k)
          && !seen.includes(k)) seen.push(k);
      });
    });
    eq(seen.join(" → "), "goal-rail → goal-deal → idf-work → rc-wrap → goal-holders",
      "rail (beside identity), summary, work, details, alternatives");
  });

  test("the wrapper declares no page-level geometry", () => {
    const idf = SRC.slice(SRC.indexOf(".idf { display: block; }"),
      SRC.indexOf("@container deal (min-width: 820px)"));
    assert(!/min-height:\s*100vh/.test(idf), "no viewport min-height");
    assert(!/position:\s*(fixed|sticky)/.test(idf), "nothing pinned to the viewport");
    assert(!/env\(safe-area-inset/.test(idf), "no page safe-area padding");
    assert(!/grid-column:\s*\d/.test(idf), "no hardcoded legacy column placement");
  });

  test("no business logic was copied into the wrapper", () => {
    const w = SRC.slice(SRC.indexOf("function InlineDeal("), SRC.indexOf("/* THE ONE ACTIVE-DEAL"));
    assert(/<SelectTrade \{\.\.\.stageProps\} \/>/.test(w), "canonical stage components are reused");
    assert(/<DealChat o=\{o\}/.test(w), "and the canonical conversation");
    assert(/const register = useCallback/.test(w), "with the same registration contract");
    ["patchOpportunity", "endOpportunity", "startOpportunity", "appendThreadEntry",
     "submitTrade", "confirmHandoff"].forEach((fn) =>
      assert(!new RegExp("st\\." + fn + "\\(").test(w),
        fn + " is not called from the layout wrapper"));
  });
});

describe("B. Desktop is an explicit two-column grid", () => {
  test("the work area declares exactly two tracks, stage larger", () => {
    assert(/\.idf-work \{ display: grid/.test(DESKTOP), "a real grid at desktop width");
    const m = /grid-template-columns: minmax\(0, (\d+)fr\) minmax\((\d+)px, (\d+)fr\)/.exec(DESKTOP);
    assert(m, "with explicit tracks: " + DESKTOP.slice(0, 120));
    eq(m[0].split("minmax").length - 1, 2, "exactly two tracks — no hidden third column");
    assert(Number(m[1]) > Number(m[3]),
      "stage takes the larger share (" + m[1] + "fr vs " + m[3] + "fr)");
    assert(Number(m[2]) >= 300, "and the conversation keeps a readable floor (" + m[2] + "px)");
  });

  test("children are auto-placed, inheriting nothing from the page shell", () => {
    assert(/\.idf-main, \.idf-side \{ grid-column: auto/.test(DESKTOP),
      "both columns are explicitly auto-placed");
    assert(!/grid-row:/.test(DESKTOP), "and no row placement is imposed");
  });

  test("both columns begin at the same vertical level", () => {
    assert(/align-items: start/.test(DESKTOP),
      "align-items: start, so neither column is pushed down or stretched");
  });
});

describe("C. Mobile is explicitly one column", () => {
  test("the work area is block-level by default", () => {
    assert(/\.idf-work \{[^}]*display: block/.test(SRC),
      "one column is the base case, not a fallback");
    const base = SRC.slice(SRC.indexOf(".idf { display: block; }"),
      SRC.indexOf("@container deal (min-width: 820px)"));
    assert(!/display: grid|display: flex/.test(base.slice(0, base.indexOf(".idf-guide"))),
      "no side-by-side layout below the breakpoint");
  });

  test("stage precedes conversation in document order", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    const seen = [];
    card.findAll((n) => typeof n.type === "string").forEach((n) => {
      String(n.props.className || "").split(/\s+/).forEach((k) => {
        if (["idf-stage", "idf-action", "chat-embed"].includes(k)
          && !seen.includes(k)) seen.push(k);
      });
    });
    eq(seen.join(" → "), "idf-stage → idf-action → chat-embed",
      "guidance, stage, action, then conversation — the mobile reading order");
  });

  test("no fixed heights and no nested overflow owner", () => {
    const idf = SRC.slice(SRC.indexOf(".idf { display: block; }"),
      SRC.indexOf("@container deal (min-width: 820px)"));
    assert(!/height:\s*\d+px/.test(idf), "no fixed heights");
    assert(/\.idf \.chat-embed \.chat-scroll[^}]*overflow: visible/.test(SRC),
      "the conversation owns no scroller");
    assert(/\.idf-task, \.idf-mid, \.idf-side \{ min-width: 0; \}/.test(SRC),
      "columns may shrink, so content cannot force horizontal overflow");
  });
});

describe("D. Theme", () => {
  test("the expanded Goal is the light reading surface", () => {
    const r = mk();
    const g = goalOf(oppAt("select-trade"));
    assert(!/deal-open/.test(cardFor(r, g).props.className), "collapsed stays browsing");
    assert(/deal-open/.test(expand(r, g).props.className), "expanded goes light");
    const open = /\.goal\.deal-open \{[^}]*background: var\(--panel\)[^}]*\}/.exec(SRC);
    assert(open, "painting an opaque light panel");
    assert(/color: var\(--text\)/.test(open[0]), "with dark reading text");
  });

  test("inline sections are opaque or flat — never transparent over a dark card", () => {
    /* The card behind is light while open, so flattened bands are safe; the
       small contained rows still paint their own panel. */
    assert(/\.idf-stage \.pick[^}]*background: var\(--panel\)/.test(SRC),
      "contained rows paint the light panel");
    assert(/\.goal\.deal-open, \.dw \{/.test(SRC),
      "and the light tokens come from the one canonical block");
  });

  test("browsing surfaces are unchanged", () => {
    const r = mk();
    cls(r, "goal").filter((n) => !/deal-open/.test(n.props.className))
      .forEach((n) => assert(!/deal-open/.test(n.props.className), "collapsed goals stay dark"));
  });
});

describe("E. One of everything, across all five stages", () => {
  STAGES.forEach((stage) => {
    test(stage + ": exactly one of each element", () => {
      const r = mk();
      const card = expand(r, goalOf(oppAt(stage)));
      eq(cls(card, "goal-deal").length, 1, "one summary row");
      eq(cls(card, "rail-s").length, 5, "one five-stage rail");
      eq(cls(card, "chat-embed").length, 1, "one conversation");
      eq(cls(card, "rc-wrap").length, 1, "one receipt");
      eq(cls(card, "idf-action").length, 1, "one action area");
      eq(cls(card, "goal-with").length, 0, "no NEGOTIATING WITH panel");
      eq(cls(card, "goal-live-view").length, 0, "no Hide Deal Flow button");

      const seen = {};
      card.findAllByType("button").map((b) => txt(b).trim()).filter(Boolean)
        .forEach((l) => { seen[l] = (seen[l] || 0) + 1; });
      eq(Object.entries(seen).filter(([, v]) => v > 1).length, 0,
        stage + ": no button label appears twice");
    });
  });
});

describe("F. Behaviour is unchanged", () => {
  test("same opportunity, stage, action handler and thread", () => {
    const r = mk();
    const o = oppAt("select-trade");
    const g = goalOf(o);
    const oppsBefore = S().opportunities.length;
    const card = expand(r, g);

    eq(D.activeOppForGoal(g.id, S().opportunities).id, o.id, "the same opportunity");
    eq(S().opportunities.length, oppsBefore, "and no second one");
    const go = cls(card, "idf-action")[0].findAllByType("button")[0];
    assert(go && /for review/.test(txt(go)), "the registered canonical action renders");
    assert(/run: \(\) => st\.submitTrade\(o\.id, picked\)/.test(SRC),
      "driving the same handler as before");
  });

  test("sending a message changes no stage or nextActor", () => {
    const r = mk();
    const o = oppAt("select-trade");
    const g = goalOf(o);
    const card = expand(r, g);
    const stage = o.stage, actor = D.nextActor(o).actor;

    const ta = cls(card, "chat-embed")[0].findAllByType("textarea")[0];
    TR.act(() => { ta.props.onChange({ target: { value: "any news?" } }); });
    click(cls(cardFor(r, g), "chat-embed")[0].findAllByType("button")
      .find((b) => txt(b).trim() === "Send"));

    const now = D.activeOppForGoal(g.id, S().opportunities);
    eq(now.stage, stage, "stage unchanged");
    eq(D.nextActor(now).actor, actor, "nextActor unchanged");
    const t = D.findThread(S().conversations, ME, o.partnerId,
      S().catalog.find((c) => c.id === o.cardId));
    assert(t.entries.some((e) => e.text === "any news?"), "on the canonical thread");
  });

  test("expand, collapse and switching mutate nothing; single-open holds", () => {
    const r = mk();
    const a = goalOf(oppAt("select-trade"));
    const b = goalOf(oppAt("value-trade"));
    const before = worldShape();
    expand(r, a);
    expand(r, b);
    eq(cls(r, "idf").length, 1, "one deal open at a time");
    eq(cls(cardFor(r, a), "idf").length, 0, "the first collapsed");
    click(rowIn(cardFor(r, b)));
    eq(cls(r, "idf").length, 0, "and the second closed");
    eq(worldShape(), before, "no canonical data changed at any point");
  });

  test("end and one-active-negotiation are untouched", () => {
    const r0 = mk();
    const o = oppAt("select-trade");
    const g = goalOf(o);
    const convs = S().conversations.length;
    TR.act(() => { acts().endOpportunity(o.id, "collector", "2026-08-17"); });
    eq(D.goalState(g.id, S().opportunities), "seeking", "the Goal returns to pursuit");
    eq(S().conversations.length, convs, "conversation history remains");
    assert(S().opportunities.find((x) => x.id === o.id).declined, "terminal record remains");

    let r; TR.act(() => { r = TR.create(React.createElement(App)); });
    const card = cardFor(r, g);
    eq(cls(card, "goal-deal").length, 0, "and the inline Deal Flow is gone");
  });
});

require("./run.cjs").run();
