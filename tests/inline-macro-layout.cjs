/* ============================================================================
   INLINE DEAL FLOW — MACRO LAYOUT

   The Deal Flow header and the stage rail were rendering BESIDE the three work
   columns rather than above them. The cause was not inside `.idf-work` at all:

     .goal-live { display: flex; align-items: center; ... }   <- an older rule,
     further up the same stylesheet, for a compact status strip on a different
     surface. Both rules match `.goal-live`, so that one governed `display` for
     the deal too, and the header, the rail and the work area became flex items
     in a ROW.

   The deal's own rule now states `display: block` explicitly. These tests hold
   that macro-structure — which elements are rows, which are columns, and where
   the three-column layout is allowed to begin — plus the two containment bugs
   that came with it: the composer escaping its track, and two Conversation
   headings existing semantically rather than one.

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
const kidsOf = (n) => n.children.filter((c) => typeof c !== "string")
  .map((c) => String((c.props && c.props.className) || ""));

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

/* Every rule in the stylesheet whose selector list mentions a given class. */
const rulesFor = (sel) => [...SRC.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .filter((m) => m[1].split(",").some((s) => s.trim().split(/\s+/).some((tok) =>
    tok === sel || tok.startsWith(sel + ":") || tok.endsWith(sel))))
  .map((m) => ({ sel: m[1].trim(), body: m[2] }));

describe("A. The parent lays its children out as rows", () => {
  test("goal-deal, goal-rail and the work area are siblings, in that order", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    const live = cls(card, "goal-live")[0];
    assert(live, "the deal region exists");
    const kids = kidsOf(live);
    /* The rail moved up beside the card identity, so goal-live now carries the
       disclosure and the work area. */
    assert(/goal-deal/.test(kids[0]), "the disclosure is the first row");
    assert(/goal-dw/.test(kids[1]), "and the work area is the second");
    eq(cls(card, "goal-rail").length, 1, "with exactly one rail, in the top row");
  });

  test("that parent is explicitly block, overriding the older flex rule", () => {
    const rules = rulesFor(".goal-live");
    const setsDisplay = rules.filter((x) => /display:/.test(x.body));
    assert(setsDisplay.length >= 2,
      "more than one rule matches .goal-live, which is why this must be explicit");
    /* The LAST rule that sets display wins for equal specificity. */
    const last = setsDisplay[setsDisplay.length - 1];
    assert(/display:\s*block/.test(last.body),
      "the winning declaration is display: block, not flex — got: " + last.body.trim());
  });

  test("no ancestor of the work area defines columns", () => {
    /* Ancestors carry the macro rows; only .idf-work may split horizontally.
       (Unrelated leaf components elsewhere may use grid freely — the concern is
       strictly the chain from the Goal card down to the work area.) */
    [".goal-live", ".goal-dw", ".goal", ".pg"].forEach((sel) => {
      rulesFor(sel).forEach((x) => assert(!/grid-template-columns/.test(x.body),
        sel + " must not define columns: " + x.sel));
    });
  });

  test("the three-column layout is introduced only on idf-work", () => {
    /* Every rule that establishes columns for the deal must target .idf-work. */
    /* Read backwards from each grid-template-columns to the selector that owns
       it, so multi-line declarations and comments cannot confuse the match. */
    const owners = [...SRC.matchAll(/grid-template-columns:/g)].map((m) => {
      const before = SRC.slice(0, m.index);
      const parts = before.replace(/\/\*[\s\S]*?\*\//g, "").split(/[{}]/);
      return (parts[parts.length - 2] || "").trim();
    }).filter((sel) => /idf|goal-live|goal-dw/.test(sel));
    assert(owners.length >= 2, "the deal defines columns at its widening tiers");
    owners.forEach((sel) => assert(/idf-work/.test(sel),
      "and only on .idf-work — found: " + sel));
  });
});

describe("B. Header and rail are full-width rows", () => {
  STAGES.forEach((stage) => {
    test(stage + ": neither header nor rail is inside the work grid", () => {
      const r = mk();
      const card = expand(r, goalOf(oppAt(stage)));
      const work = cls(card, "idf-work")[0];
      eq(cls(work, "goal-deal").length, 0, "the disclosure is outside the grid");
      eq(cls(work, "rail-s").length, 0, "and so is the rail");
      eq(cls(card, "goal-deal").length, 1, "exactly one disclosure");
      eq(cls(card, "rail-s").length, 5, "exactly one rail");
    });
  });

  test("expanded, the header sheds its boxed treatment and fills the width", () => {
    /* Several rules now target the expanded header (base treatment, hover), so
       check the properties across all of them rather than the first match. */
    const open = rulesFor(".goal-deal").filter((x) => /deal-open/.test(x.sel));
    assert(open.length, "an expanded-state rule exists for the header");
    const body = open.map((x) => x.body).join(" ");
    assert(/width:\s*100%/.test(body), "it takes the full width");
    assert(/border:\s*none/.test(body), "dropping the box border");
    assert(/background:\s*none/.test(body), "and the tinted background");
  });

  test("the header is still the one collapse control", () => {
    const r = mk();
    const g = goalOf(oppAt("select-trade"));
    const row = () => rowIn(cardFor(r, g));
    eq(row().props["aria-expanded"], false, "collapsed to begin with");
    click(row());
    eq(row().props["aria-expanded"], true, "reports expanded");
    click(row());
    eq(cls(cardFor(r, g), "idf-work").length, 0, "and the same row closes it");
  });
});

describe("C. Only the work area has three columns", () => {
  STAGES.forEach((stage) => {
    test(stage + ": exactly three grid children, in order", () => {
      const r = mk();
      const card = expand(r, goalOf(oppAt(stage)));
      const kids = kidsOf(cls(card, "idf-work")[0]);
      eq(kids.length, stage === "agree-price" ? 2 : 3, "no extra grid child");
      assert(/idf-task/.test(kids[0]), "task first");
      assert(/idf-side/.test(kids[kids.length - 1]), "conversation last");
    });
  });

  test("all three tracks can shrink and align to the top", () => {
    assert(/\.idf-task, \.idf-mid, \.idf-side \{[^}]*min-width: 0/.test(SRC),
      "every region may shrink below its content width");
    const wide = SRC.slice(SRC.indexOf("@container deal (min-width: 980px)"));
    assert(/align-items: start/.test(SRC.slice(SRC.indexOf(".idf-work { display: grid"))),
      "columns begin on the same line");
    assert(/grid-column: auto/.test(wide), "and auto-place into their tracks");
  });

  test("the lower rows stay full width, outside the grid", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    const work = cls(card, "idf-work")[0];
    eq(cls(work, "rc-wrap").length, 0, "the receipt is not a grid child");
    eq(cls(work, "goal-holders").length, 0, "nor are the partner alternatives");
    eq(cls(card, "rc-wrap").length, 1, "one receipt, below");
  });
});

describe("D. Conversation: one heading, and nothing escapes the column", () => {
  test("exactly one Conversation heading, semantically not just visually", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    eq((txt(card).match(/Conversation/gi) || []).length, 1,
      "one heading in the rendered card");
    /* The column owns it; DealChat is told to render none. */
    eq(cls(cls(card, "idf-side")[0], "idf-h").length >= 1, true, "the column heads itself");
    eq(cls(card, "sec-h").filter((n) => /Conversation/.test(txt(n))).length, 0,
      "and DealChat prints no second one");
    assert(/!bare && !headless/.test(SRC),
      "the suppression is a real condition, not a CSS hide");
  });

  test("the standalone page still gets its own heading", () => {
    /* headless is opt-in, so nothing else lost its title. */
    assert(/embedded headless/.test(SRC), "only the inline column opts out");
    const uses = [...SRC.matchAll(/<DealChat[^>]*>/g)].map((m) => m[0]);
    eq(uses.filter((u) => /headless/.test(u)).length, 1,
      "exactly one call site suppresses the heading");
  });

  test("the composer is inside the conversation column and can shrink", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    const side = cls(card, "idf-side")[0];
    eq(side.findAllByType("textarea").length, 1, "the composer lives in the column");
    eq(cls(card, "idf-task")[0].findAllByType("textarea").length, 0, "and nowhere else");
    const send = side.findAllByType("button").find((b) => txt(b).trim() === "Send");
    assert(send, "with its send control in the same column");
  });

  test("every wrapper between track and textarea may shrink", () => {
    /* A grid item's default min-width is auto — its min-content width — which is
       what let the composer push the column past the card's right edge. */
    const rule = /\.idf-side,[^{]*\{([^}]*)\}/.exec(SRC);
    assert(rule && /min-width: 0/.test(rule[1]), "the wrappers are floored at zero");
    assert(/max-width: 100%/.test(rule[1]), "and capped at the track width");
    assert(/\.idf-side \.inp \{[^}]*box-sizing: border-box/.test(SRC),
      "the control counts its own padding in its width");
    assert(/\.idf-side \.inp \{[^}]*min-width: 0/.test(SRC),
      "and has no intrinsic minimum of its own");
  });

  test("no region is allowed to overflow the card", () => {
    ["idf-side", "idf-task", "idf-mid"].forEach((k) => {
      rulesFor("." + k).forEach((x) => {
        assert(!/position:\s*absolute|position:\s*fixed/.test(x.body),
          k + " is not positioned out of flow");
        assert(!/margin-right:\s*-|margin-left:\s*-/.test(x.body),
          k + " uses no negative margins");
        assert(!/width:\s*\d+px/.test(x.body), k + " has no fixed pixel width");
      });
    });
  });
});

describe("E. Nothing canonical moved", () => {
  STAGES.forEach((stage) => {
    test(stage + ": one action, one conversation, details intact", () => {
      const r = mk();
      const card = expand(r, goalOf(oppAt(stage)));
      eq(cls(card, "idf-action").length, 1, "one action area");
      eq(cls(card, "chat-embed").length, 1, "one conversation");
      const wantsDetails = stage !== "agree-price";
      eq(cls(card, "idf-det").length, wantsDetails ? 1 : 0,
        wantsDetails ? "the details column survives" : "Agree on Price shows no details");
      if (wantsDetails) assert(cls(card, "idf-det-k").length > 0, "with canonical fields");
      const seen = {};
      card.findAllByType("button").map((b) => txt(b).trim()).filter(Boolean)
        .forEach((l) => { seen[l] = (seen[l] || 0) + 1; });
      eq(Object.entries(seen).filter(([, v]) => v > 1).length, 0, "no duplicate control");
    });
  });

  test("width, container-awareness and light theme are untouched", () => {
    const r = mk();
    const g = goalOf(oppAt("select-trade"));
    assert(!/pg-wide/.test(cls(r, "pg")[0].props.className), "narrow while browsing");
    const card = expand(r, g);
    assert(/pg-wide/.test(cls(r, "pg")[0].props.className), "wide while open");
    assert(/deal-open/.test(card.props.className), "on the light surface");
    assert(/\.goal\.deal-open \{[^}]*container-type: inline-size/.test(SRC),
      "still the query container");
  });

  test("sending still changes no stage or turn", () => {
    const r = mk();
    const o = oppAt("select-trade");
    const g = goalOf(o);
    const card = expand(r, g);
    const stage = o.stage, actor = D.nextActor(o).actor;
    const ta = cls(card, "idf-side")[0].findAllByType("textarea")[0];
    TR.act(() => { ta.props.onChange({ target: { value: "still fine?" } }); });
    click(cls(cardFor(r, g), "idf-side")[0].findAllByType("button")
      .find((b) => txt(b).trim() === "Send"));
    const now = D.activeOppForGoal(g.id, S().opportunities);
    eq(now.stage, stage, "stage unchanged");
    eq(D.nextActor(now).actor, actor, "nextActor unchanged");
  });
});

require("./run.cjs").run();
