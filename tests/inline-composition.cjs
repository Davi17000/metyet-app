/* ============================================================================
   INLINE DEAL FLOW — VISUAL COMPOSITION

   The work area is now three presentation regions rather than two:

     LEFT   current task — guidance, the stage's own work, the one action
     CENTRE stage details — what THIS stage has established
     RIGHT  conversation — the canonical thread, with ending the deal beneath it

   The centre column is the part that could go wrong quietly, so most of what
   follows is about it: every field is read from the canonical receipt, whose
   `reached(i)` guards blank out anything belonging to a later stage. Reading
   only the current stage's row therefore cannot leak future terms, and nothing
   is invented — a thin stage stays thin.

   Presentation only. No lifecycle, stage semantics or conversation state.
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
const detailKeys = (card) => cls(card, "idf-det-k").map(txt);
const detailOf = (card, key) => {
  const row = cls(card, "idf-det-r").find((n) => txt(cls(n, "idf-det-k")[0]) === key);
  return row ? txt(cls(row, "idf-det-v")[0]) : null;
};
const worldShape = () => JSON.stringify({
  opps: S().opportunities.map((o) => [o.id, o.stage, o.agreedPrice, o.completedAt,
    o.declined, JSON.stringify(o.trade), D.nextActor(o).actor]),
  goals: S().goals.map((g) => [g.id, g.tier]),
  convs: S().conversations.map((t) => [t.key, t.entries.length]) });

const CQ3_AT = SRC.indexOf("@container deal (min-width: 980px)");
const CQ3 = SRC.slice(CQ3_AT, CQ3_AT + 1200);

describe("A. Header and rail sit above the work area", () => {
  test("one full-width deal header, and no boxed summary inside the work area", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    eq(cls(card, "goal-deal").length, 1, "one deal header row");
    const work = cls(card, "idf-work")[0];
    eq(cls(work, "goal-deal").length, 0, "it is not floating inside the work area");
    eq(cls(work, "rail-s").length, 0, "and neither is the rail");
    eq(cls(card, "goal-with").length, 0, "no duplicate partner block");
  });

  test("the header is still the single collapse control, at the top", () => {
    const r = mk();
    const g = goalOf(oppAt("select-trade"));
    const row = () => rowIn(cardFor(r, g));
    eq(row().props["aria-expanded"], false, "collapsed to begin with");
    click(row());
    eq(row().props["aria-expanded"], true, "the header reports expanded");
    const seen = [];
    cardFor(r, g).findAll((n) => typeof n.type === "string").forEach((n) => {
      String(n.props.className || "").split(/\s+/).forEach((k) => {
        if (["goal-deal", "goal-rail", "idf-work"].includes(k) && !seen.includes(k)) seen.push(k);
      });
    });
    eq(seen.join(" → "), "goal-rail → goal-deal → idf-work",
      "rail beside the identity, then the header, then the work area");
    click(row());
    eq(cls(cardFor(r, g), "idf-work").length, 0, "and the same row closes it");
  });

  STAGES.forEach((stage) => {
    test(stage + ": exactly one rail, canonical current stage", () => {
      const r = mk();
      const card = expand(r, goalOf(oppAt(stage)));
      eq(cls(card, "rail-s").length, 6, "one six-step pursuit rail");
      const states = cls(card, "rail-s").map((n) => (String(n.props.className).includes("current")
        ? "current" : String(n.props.className).includes("done") ? "done" : "pending"));
      eq(states.filter((x) => x === "current").length, 1, "one current marker");
      eq(states[STAGES.indexOf(stage) + 1], "current",
        "on the canonical stage, offset by Review Card");
    });
  });
});

describe("B. Three regions, in order", () => {
  STAGES.forEach((stage) => {
    test(stage + ": its regions are siblings in one work container", () => {
      /* Agree on Price is a single pricing decision, so it has no centre
         details column — pricing and conversation only. */
      const THREE = stage !== "agree-price";
      const r = mk();
      const card = expand(r, goalOf(oppAt(stage)));
      const work = cls(card, "idf-work")[0];
      assert(work, "one work container");
      eq(cls(work, "idf-task").length, 1, "one current-task region");
      eq(cls(work, "idf-mid").length, THREE ? 1 : 0,
        THREE ? "one stage-details region" : "no details column at Agree on Price");
      eq(cls(work, "idf-side").length, 1, "one conversation region");

      const kids = work.children.filter((c) => typeof c !== "string")
        .map((c) => String(c.props && c.props.className || ""));
      eq(kids.length, THREE ? 3 : 2, "exactly the regions this stage needs");
      assert(/idf-task/.test(kids[0]), "task first");
      if (THREE) assert(/idf-mid/.test(kids[1]), "details second");
      assert(/idf-side/.test(kids[kids.length - 1]), "conversation last");
    });
  });

  test("each region holds what belongs to it", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    const task = cls(card, "idf-task")[0];
    const mid = cls(card, "idf-mid")[0];
    const side = cls(card, "idf-side")[0];
    eq(cls(task, "idf-stage").length, 1, "the stage's own work is in the task column");
    eq(cls(task, "idf-action").length, 1, "and so is the one action");
    eq(cls(mid, "idf-det").length, 1, "details in the centre");
    eq(cls(side, "chat-embed").length, 1, "conversation on the right");
    eq(cls(task, "chat-embed").length, 0, "conversation is not duplicated left");
    eq(cls(side, "idf-action").length, 0, "and the action is not duplicated right");
  });

  test("the desktop grid declares three tracks, conversation widest", () => {
    assert(CQ3_AT > -1, "a three-column container query exists");
    const m = /grid-template-columns:\s*minmax\((\d+)px, ([\d.]+)fr\)\s*minmax\((\d+)px, ([\d.]+)fr\)\s*minmax\((\d+)px, ([\d.]+)fr\)/.exec(CQ3);
    assert(m, "three explicit tracks: " + CQ3.slice(0, 160));
    const [taskMin, taskFr, midMin, midFr, sideMin, sideFr] =
      [+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]];
    eq(m[0].split("minmax").length - 1, 3, "exactly three — no hidden fourth column");
    assert(sideFr >= taskFr && sideFr >= midFr,
      "conversation is the widest or tied (" + sideFr + "fr)");
    assert(taskFr < 2 * midFr, "the task no longer dominates the composition");
    assert(taskMin >= 240 && midMin >= 220 && sideMin >= 300,
      "every region keeps a readable floor");
    assert(/align-items: start/.test(SRC.slice(SRC.indexOf(".idf-work { display: grid"))),
      "columns align to the top rather than stretching into blank space");
    assert(/grid-column: auto/.test(CQ3), "all three auto-place");
  });

  test("dividers are borders, not nested scrolling boxes", () => {
    /* Several rules share these selectors, so check that SOME rule in the
       three-column block gives each region its dividing border. */
    const has = (sel) => [...CQ3.matchAll(new RegExp("\\" + sel + " \\{[^}]*\\}", "g"))]
      .some((m) => /border-left: 1px solid var\(--line-soft\)/.test(m[0]));
    assert(has(".idf-mid"), "the centre is separated by a rule");
    assert(has(".idf-side"), "and so is the conversation");
    assert(!/overflow:\s*(auto|scroll)/.test(CQ3), "no region owns a scroller");
    assert(!/height:\s*\d+px|min-height:\s*\d+px/.test(CQ3), "and none has a fixed height");
  });
});

describe("C. Stage details are canonical and leak nothing", () => {
  const EXPECTED = {
    "agree-price": ["Listed", "Agreed"],
    "select-trade": ["Proposed", "Accepted", "Unresolved", "Sent for review"],
    "value-trade": ["Cards accepted", "Values agreed", "Trade value"],
    deal: ["Agreed price", "Trade value", "Calculated", "Balance"],
    fulfillment: ["How", "Where", "When", "You"],
  };

  STAGES.filter((x) => x !== "agree-price").forEach((stage) => {
    test(stage + ": renders its own stage's fields", () => {
      const r = mk();
      const card = expand(r, goalOf(oppAt(stage)));
      const keys = detailKeys(card);
      assert(keys.length > 0, stage + ": the centre column has content");
      EXPECTED[stage].forEach((k) => assert(keys.includes(k),
        stage + ": shows " + k + " — got " + keys.join(", ")));
    });
  });

  test("no future-stage value is exposed at Select Trade", () => {
    const r = mk();
    const o = oppAt("select-trade");
    const card = expand(r, goalOf(o));
    const keys = detailKeys(card);
    ["Balance", "Calculated", "Trade value", "How", "Where", "When"]
      .forEach((k) => assert(!keys.includes(k),
        k + " belongs to a later stage and must not appear"));
    /* And the receipt itself blanks them, which is why the column cannot. */
    const rec = D.receiptForOpportunity(o, { binderById: (id) => S().binder.find((b) => b.id === id),
      cardById: (id) => S().catalog.find((c) => c.id === id),
      partnerById: (id) => S().partners.find((p) => p.id === id) });
    eq(rec.stages[3].balance, null, "the Deal row is blank at Select Trade");
    eq(rec.stages[4].method, null, "and so is Fulfillment");
  });

  test("values match the canonical opportunity, not a copy", () => {
    const r = mk();
    const o = oppAt("select-trade");
    const card = expand(r, goalOf(o));
    const all = (o.trade && o.trade.cards) || [];
    eq(detailOf(card, "Proposed"), String(all.length), "proposed count is derived");
    eq(detailOf(card, "Accepted"),
      String(all.filter((c) => c.inclusion === "accepted").length), "accepted count is derived");
    eq(detailOf(card, "Sent for review"), o.trade && o.trade.submitted ? "Yes" : "Not yet",
      "and submission state is read, not stored");
  });

  test("the details column reads the receipt and invents no store", () => {
    const w = SRC.slice(SRC.indexOf("function StageDetails("), SRC.indexOf("function InlineDeal("));
    assert(/D\.receiptForOpportunity\(o,/.test(w), "it reads the canonical receipt");
    assert(!/useState|useReducer/.test(w), "holding no state of its own");
    ["patchOpportunity", "submitTrade", "confirmHandoff", "sendMessage", "endOpportunity"]
      .forEach((fn) => assert(!new RegExp("st\\." + fn + "\\(").test(w),
        fn + " is not called from a presentation column"));
  });

  test("an unsettled stage says so rather than padding itself", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("fulfillment")));
    const heading = cls(card, "idf-mid")[0] && txt(cls(cls(card, "idf-mid")[0], "idf-h")[0]);
    assert(/Details/.test(heading), "the column is headed Details");
    /* Blank canonical fields render as an em dash, never as invented content. */
    const values = cls(card, "idf-det-v").map(txt);
    values.forEach((v) => assert(v && v.length > 0, "every row has a value or a dash"));
  });
});

describe("D. Action, conversation and ending", () => {
  STAGES.forEach((stage) => {
    test(stage + ": exactly one primary action, in the task column", () => {
      const r = mk();
      const card = expand(r, goalOf(oppAt(stage)));
      eq(cls(card, "idf-action").length, 1, "one action area");
      eq(cls(cls(card, "idf-task")[0], "idf-action").length, 1, "inside the task column");
      const seen = {};
      card.findAllByType("button").map((b) => txt(b).trim()).filter(Boolean)
        .forEach((l) => { seen[l] = (seen[l] || 0) + 1; });
      eq(Object.entries(seen).filter(([, v]) => v > 1).length, 0, "no duplicated control");
    });
  });

  test("the canonical handler and registration are untouched", () => {
    assert(/register\(!o\.trade\.submitted && eligible\.length/.test(SRC),
      "Select Trade still registers its action");
    assert(/run: \(\) => st\.submitTrade\(o\.id, picked\)/.test(SRC), "same handler");
  });

  test("one conversation; sending changes no stage or turn", () => {
    const r = mk();
    const o = oppAt("select-trade");
    const g = goalOf(o);
    const card = expand(r, g);
    eq(cls(card, "chat-embed").length, 1, "one conversation");
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

  test("ending lives only in the overflow menu, never beside the action", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    /* One stop route: the header's overflow menu. Nothing in the body. */
    eq(cls(card, "idf-stop").length, 0, "no end control in the work area");
    assert(!/Stop this negotiation|Cancel agreed deal/.test(txt(cls(card, "idf-work")[0])),
      "and none anywhere in the working columns");
    click(cls(card, "goal-edit-b")[0]);
    const stop = cls(cardFor(r, goalOf(oppAt("select-trade"))), "goal-stop")[0];
    assert(stop, "it is in the overflow menu");
    assert(!String(stop.props.className).includes("pri"),
      "and is never styled as forward progress");
  });

  test("the lower summary row stays secondary and singular", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    eq(cls(card, "rc-wrap").length, 1, "one receipt disclosure");
    const seen = [];
    card.findAll((n) => typeof n.type === "string").forEach((n) => {
      String(n.props.className || "").split(/\s+/).forEach((k) => {
        if (["idf-work", "rc-wrap", "goal-holders"].includes(k) && !seen.includes(k)) seen.push(k);
      });
    });
    eq(seen.join(" → "), "idf-work → rc-wrap → goal-holders",
      "work area, then details, then partner alternatives");
    assert(/of 5 settled/.test(txt(cls(card, "rc-wrap")[0])), "with the canonical count");
  });
});

describe("E. Narrow containers stack; width behaviour retained", () => {
  test("one column is the base case, in task → details → conversation order", () => {
    assert(/\.idf-work \{[^}]*display: block/.test(SRC), "stacked by default");
    const base = SRC.slice(SRC.indexOf(".idf { display: block; }"),
      SRC.indexOf("@container deal (min-width:"));
    assert(!/display: grid/.test(base), "no columns below the threshold");
    assert(/\.idf-mid, \.idf-side \{ margin-top: 22px/.test(base),
      "stacked regions are separated by spacing, not columns");
  });

  test("both widenings are container queries, never viewport", () => {
    const grids = [...SRC.matchAll(/\.idf-work \{[^}]*display: grid[^}]*\}|\.idf-work \{ grid-template-columns[^}]*\}/g)];
    assert(grids.length >= 1, "grid rules exist");
    grids.forEach((m) => {
      const owner = [...SRC.matchAll(/@(media|container)[^{]*\{/g)]
        .filter((x) => x.index < m.index).pop();
      eq(owner[1], "container", "governed by a container query, not a viewport one");
    });
  });

  test("the expanded Goal still widens and stays a query container", () => {
    const r = mk();
    const g = goalOf(oppAt("select-trade"));
    assert(!/pg-wide/.test(cls(r, "pg")[0].props.className), "narrow while browsing");
    expand(r, g);
    assert(/pg-wide/.test(cls(r, "pg")[0].props.className), "wide while a deal is open");
    assert(/\.goal\.deal-open \{[^}]*container-type: inline-size/.test(SRC),
      "and the Goal is still the query container");
  });

  test("expanding and collapsing still mutate nothing", () => {
    const r = mk();
    const g = goalOf(oppAt("value-trade"));
    const before = worldShape();
    expand(r, g);
    click(rowIn(cardFor(r, g)));
    eq(worldShape(), before, "no canonical data changed");
    assert(!/deal-open/.test(cardFor(r, g).props.className), "and the card is compact again");
  });
});

require("./run.cjs").run();
