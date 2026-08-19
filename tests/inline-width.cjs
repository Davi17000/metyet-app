/* ============================================================================
   EXPANDED GOAL WIDTH + CONTAINER-AWARE RESPONSIVENESS

   Two geometry defects, both about WIDTH rather than structure:

   1. The Goals page was capped at `max-width: 800px` whatever the browser was
      doing, so an expanded Deal Flow had roughly 720px of usable card no matter
      how wide the window. It now widens to 1240px — but ONLY while a deal is
      open, so browsing keeps its comfortable narrow reading column.

   2. The stage/conversation split fired from `@media (min-width: 900px)` — the
      VIEWPORT. A wide window says nothing about how much room this deal has, so
      on a 1400px screen the split activated inside a ~720px column and squeezed
      both sides into strips, taking the rail with it. The split is now a
      container query on the expanded Goal, so it answers to the width the deal
      actually has.

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
const pageOf = (r) => cls(r, "pg")[0];
const worldShape = () => JSON.stringify({
  opps: S().opportunities.map((o) => [o.id, o.stage, o.agreedPrice, o.completedAt,
    o.declined, JSON.stringify(o.trade), D.nextActor(o).actor]),
  goals: S().goals.map((g) => [g.id, g.tier]),
  convs: S().conversations.map((t) => [t.key, t.entries.length]) });

/* The rules under test, read once. */
const WIDE = /\.pg\.pg-wide \{[^}]*\}/.exec(SRC);
const CQ_AT = SRC.indexOf("@container deal (min-width: 820px)");
const CQ = SRC.slice(CQ_AT, CQ_AT + 700);

describe("A. The page widens only while a deal is open", () => {
  test("browsing keeps the narrow reading column", () => {
    const r = mk();
    const page = pageOf(r);
    assert(page, "the Goals page renders");
    assert(!/pg-wide/.test(page.props.className),
      "no widening while nothing is expanded");
    eq(cls(r, "goal-dw").length, 0, "and nothing is expanded");
  });

  test("expanding widens the page; collapsing restores it", () => {
    const r = mk();
    const g = goalOf(oppAt("select-trade"));
    expand(r, g);
    assert(/pg-wide/.test(pageOf(r).props.className),
      "the page takes the wider workspace while the deal is open");
    click(rowIn(cardFor(r, g)));
    assert(!/pg-wide/.test(pageOf(r).props.className),
      "and returns to the browsing width when closed");
  });

  test("switching the open Goal keeps the page wide, mutating nothing", () => {
    const r = mk();
    const a = goalOf(oppAt("select-trade"));
    const b = goalOf(oppAt("value-trade"));
    const before = worldShape();
    expand(r, a);
    expand(r, b);
    assert(/pg-wide/.test(pageOf(r).props.className), "still wide for the new Goal");
    eq(cls(r, "goal-dw").length, 1, "with one deal open");
    eq(cls(cardFor(r, a), "goal-dw").length, 0, "the first collapsed");
    eq(worldShape(), before, "and no canonical data changed");
  });

  test("the widening is a page rule, so collapsed cards stay compact", () => {
    assert(WIDE, "a .pg-wide rule exists");
    const px = /max-width:\s*(\d+)px/.exec(WIDE[0]);
    assert(px && Number(px[1]) > 800,
      "wider than the 800px browsing column (" + (px && px[1]) + "px)");
    /* .goal itself declares no width, so only the page grew — collapsed cards
       inside a wide page simply fill it as they always did. */
    const goal = /\n\.goal \{[^}]*\}/.exec(SRC);
    assert(goal && !/max-width|width:/.test(goal[0]),
      "the goal card sets no width of its own");
    assert(!/position:\s*absolute/.test(WIDE[0]), "and nothing is absolutely positioned");
  });

  test("a wide page still keeps its gutters", () => {
    const base = /\.pg \{[^}]*\}/.exec(SRC);
    assert(base && /padding:/.test(base[0]), "the page keeps horizontal padding");
    assert(!/padding:\s*0/.test(WIDE[0]), "which the wide variant does not remove");
  });
});

describe("B. The split is container-aware, not viewport-aware", () => {
  test("the expanded Goal declares itself a query container", () => {
    assert(/\.goal\.deal-open \{[^}]*container-type: inline-size/.test(SRC),
      "container-type: inline-size on the expanded Goal");
    assert(/container-name: deal/.test(SRC), "named, so the query cannot bind elsewhere");
  });

  test("the two-column rule is a container query, not a media query", () => {
    assert(CQ_AT > -1, "an @container rule exists");
    assert(/@container deal \(min-width: (\d+)px\)/.test(CQ), "keyed to the deal container");
    /* And no viewport media query still drives the inline work area: every
       .idf-work layout declaration must sit inside the container query. */
    const decls = [...SRC.matchAll(/\.idf-work \{[^}]*\}/g)].map((m) => m.index);
    eq(decls.length, 3,
      "three .idf-work rules: stacked base, two-column, three-column");
    assert(decls[0] < CQ_AT, "the base rule sits outside any query");
    /* Every widening rule lives inside a container query, never a media query. */
    decls.slice(1).forEach((ix) => assert(ix > CQ_AT,
      "each grid rule sits inside an @container block"));
    const media = [...SRC.matchAll(/@media \([^)]*\)/g)].map((m) => m.index);
    decls.slice(1).forEach((ix) => {
      const owner = [...SRC.matchAll(/@(media|container)[^{]*\{/g)]
        .filter((m) => m.index < ix).pop();
      eq(owner[1], "container", "the rule at " + ix + " is governed by a container query");
    });
  });

  test("the threshold leaves both columns comfortable", () => {
    const m = /@container deal \(min-width: (\d+)px\)/.exec(CQ);
    const threshold = Number(m[1]);
    const cols = /grid-template-columns: minmax\(0, (\d+)fr\) minmax\((\d+)px, (\d+)fr\)/.exec(CQ);
    const gap = /gap: (\d+)px/.exec(CQ);
    assert(cols && gap, "the grid is fully specified");
    const convMin = Number(cols[2]);
    /* At the threshold the stage gets whatever the conversation does not. */
    const stageAt = threshold - convMin - Number(gap[1]);
    assert(stageAt >= 440,
      "at the threshold the stage still has " + stageAt + "px — enough to lay out card rows");
    assert(stageAt > convMin,
      "and the stage is the wider of the two even at the narrowest split");
  });

  test("one column by default, whatever the browser is doing", () => {
    assert(/\.idf-work \{[^}]*display: block/.test(SRC),
      "stacking is the base case, not a fallback");
    /* The base rule sits outside any query, so a narrow container stacks even
       on a wide viewport — the exact case that was broken. */
    const base = SRC.slice(SRC.indexOf(".idf { display: block; }"), CQ_AT);
    assert(/\.idf-work \{[^}]*display: block/.test(base),
      "declared before any query, so a narrow deal stacks on a wide screen");
    assert(!/display: grid/.test(base), "with no side-by-side layout below the threshold");
  });

  test("exactly two tracks, stage larger, conversation floored", () => {
    const m = /grid-template-columns: minmax\(0, (\d+)fr\) minmax\((\d+)px, (\d+)fr\)/.exec(CQ);
    assert(m, "explicit tracks");
    eq(m[0].split("minmax").length - 1, 2, "exactly two — no third column");
    assert(Number(m[1]) > Number(m[3]),
      "stage takes the larger share (" + m[1] + "fr vs " + m[3] + "fr)");
    assert(Number(m[2]) >= 320, "conversation floors at " + m[2] + "px");
    assert(/minmax\(0,/.test(m[0]), "and the stage track may shrink below its content");
    assert(/align-items: start/.test(CQ), "both columns begin at the same level");
    assert(/\.idf-main, \.idf-side \{ grid-column: auto/.test(CQ),
      "with no inherited placement");
  });
});

describe("C. Rail readability", () => {
  test("labels never break letter by letter in an expanded deal", () => {
    /* `overflow-wrap: anywhere` is what produced vertical character stacking
       once the rail was squeezed; the expanded Goal turns it back off. */
    assert(/\.goal\.deal-open \.rail-l \{[^}]*overflow-wrap: normal/.test(SRC),
      "overflow-wrap is normal inside an expanded deal");
    assert(/\.goal\.deal-open \.rail-l \{[^}]*word-break: normal/.test(SRC),
      "and word-break is normal");
    assert(/\.goal\.deal-open \.rail-l \{[^}]*hyphens: none/.test(SRC),
      "with no hyphenation");
  });

  test("the rail has no fixed or narrow width", () => {
    const rail = /\n\.rail \{[^}]*\}/.exec(SRC);
    assert(rail && !/max-width|width:\s*\d/.test(rail[0]), "the rail sets no fixed width");
    assert(/\.goal\.deal-open \.rail-s \{[^}]*min-width: 0/.test(SRC),
      "and its stages may share the full card width");
  });

  STAGES.forEach((stage) => {
    test(stage + ": one rail, canonical state, spanning the card", () => {
      const r = mk();
      const card = expand(r, goalOf(oppAt(stage)));
      eq(cls(card, "rail-s").length, 5, "exactly one five-stage rail");
      /* The rail sits above the work area, so it spans the whole card. */
      const work = cls(card, "idf-work")[0];
      eq(cls(work, "rail-s").length, 0, "outside the two-column area");
      const states = cls(card, "rail-s").map((n) => {
        const k = String(n.props.className);
        return k.includes("current") ? "current" : k.includes("done") ? "done" : "pending";
      });
      eq(states.filter((x) => x === "current").length, 1, "one current stage");
      eq(states[STAGES.indexOf(stage)], "current", "and it is the canonical one");
    });
  });
});

describe("D. Nothing canonical moved", () => {
  test("summary above, work between, details below — still", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    const seen = [];
    card.findAll((n) => typeof n.type === "string").forEach((n) => {
      String(n.props.className || "").split(/\s+/).forEach((k) => {
        if (["goal-deal", "goal-rail", "idf-work", "rc-wrap", "goal-holders"].includes(k)
          && !seen.includes(k)) seen.push(k);
      });
    });
    eq(seen.join(" → "), "goal-rail → goal-deal → idf-work → rc-wrap → goal-holders",
      "rail beside the identity, then the disclosure, then the work area");
  });

  STAGES.forEach((stage) => {
    test(stage + ": one action, one conversation, state untouched", () => {
      const r = mk();
      const o = oppAt(stage);
      const before = worldShape();
      const card = expand(r, goalOf(o));
      eq(cls(card, "idf-action").length, 1, "one action area");
      eq(cls(card, "chat-embed").length, 1, "one conversation");
      const seen = {};
      card.findAllByType("button").map((b) => txt(b).trim()).filter(Boolean)
        .forEach((l) => { seen[l] = (seen[l] || 0) + 1; });
      eq(Object.entries(seen).filter(([, v]) => v > 1).length, 0, "no duplicate control");
      eq(worldShape(), before, "and expanding mutated nothing");
    });
  });

  test("the light treatment and collapse behaviour are unchanged", () => {
    const r = mk();
    const g = goalOf(oppAt("select-trade"));
    const card = expand(r, g);
    assert(/deal-open/.test(card.props.className), "still the light surface");
    const row = rowIn(cardFor(r, g));
    eq(row.props["aria-expanded"], true, "still reporting expanded");
    click(row);
    eq(rowIn(cardFor(r, g)).props["aria-expanded"], false, "and still collapsible from the top");
  });
});

require("./run.cjs").run();
