/* ============================================================================
   INLINE DEAL FLOW — VISUAL HIERARCHY

   The Primary Goal card IS the Deal Flow surface when expanded. What used to
   happen was a page shell mounted inside a card: nested borders, the partner
   named in three places, the stage named in three controls, two receipts, and a
   second full-width button whose only job was to close what the summary row had
   opened.

   These tests hold the structure, not the styling: how many containers, how many
   rails, how many times one fact is stated, and in what order the bands appear.
   Nothing here touches lifecycle, stage semantics or conversation state.
   ========================================================================= */

process.env.METYET_DEV = "1";                 // review harness fixtures

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const D = require("../domain/metyet-domain.js");
const App = require("../dist/Collector.cjs").default;
const { __store } = require("../dist/Collector.cjs");
const { buildCanonicalSeed } = require("../dist/MetYet.cjs");

const readSrc = (rel) => require("fs").readFileSync(require("path").join(__dirname, "..", rel), "utf8");
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
  opps: S().opportunities.map((o) => [o.id, o.stage, o.agreedPrice, o.completedAt, o.declined,
    JSON.stringify(o.trade), JSON.stringify(o.deal), D.nextActor(o).actor]),
  goals: S().goals.map((g) => [g.id, g.tier]),
  convs: S().conversations.map((t) => [t.key, t.entries.length]) });

/* The order the bands must appear in, top to bottom, on mobile. */
const BANDS = ["goal-rail", "goal-deal", "idf-stage", "idf-action",
  "chat-embed", "rc-wrap", "goal-holders"];
const bandOrder = (node) => {
  const seen = [];
  node.findAll((n) => typeof n.type === "string").forEach((n) => {
    String(n.props.className || "").split(/\s+/).forEach((k) => {
      if (BANDS.includes(k) && !seen.includes(k)) seen.push(k);
    });
  });
  return seen;
};

describe("A. One surface, not a card inside a card", () => {
  test("the workspace mounts inline, without page-level shell", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    assert(cls(card, "idf")[0], "the workspace is in its dedicated inline form");
    eq(cls(card, "dw-ctx").length, 0, "no page context header");
    eq(cls(card, "dw-prog").length, 0, "no second progress panel");
    assert(!card.findAllByType("button").some((b) => /← Goals/.test(txt(b))),
      "and no page back-link");
  });

  test("nested panels are flattened rather than merely restyled", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    const css = src.slice(src.indexOf(".idf-stage > .card"), src.indexOf(".idf-stage > .card") + 400);
    assert(/border: none/.test(css), "inline sections drop their borders");
    assert(/background: none/.test(css), "and their backgrounds");
  });

  test("the partner is named once in the Goal's own chrome", () => {
    const r = mk();
    const o = oppAt("select-trade");
    const g = goalOf(o);
    const partner = S().partners.find((p) => p.id === o.partnerId);

    const collapsed = cardFor(r, g);
    eq(txt(collapsed).split(partner.name).length - 1, 1,
      "collapsed, the partner appears exactly once");
    eq(cls(collapsed, "goal-with").length, 0, "the NEGOTIATING WITH block is gone");

    const card = expand(r, g);
    eq(cls(card, "goal-with").length, 0, "and does not come back on expansion");
    /* Expanded, further mentions are legitimate: conversation attribution, and
       the dev-only TP simulator, which does not exist in a normal build. */
    let chrome = txt(cls(card, "goal-live")[0]);
    [cls(card, "chat-embed")[0], cls(card, "sim")[0]].forEach((n) => {
      if (n) chrome = chrome.replace(txt(n), "");
    });
    eq(chrome.split(partner.name).length - 1, 1,
      "the partner is stated once in the product chrome");
  });

  test("the stage is named once in the chrome, plus the rail", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    eq(cls(card, "goal-live-stage").length, 0, "no separate stage label block");
    eq(cls(card, "goal-deal-s").length, 1, "the summary row names the stage once");
    assert(/^Deal Flow · /.test(txt(cls(card, "goal-deal-s")[0])), "and labels it");
  });

  test("exactly one canonical stage rail, and one receipt", () => {
    const r = mk();
    const g = goalOf(oppAt("select-trade"));
    eq(cls(cardFor(r, g), "rail-s").length, 5, "collapsed: one rail");
    const card = expand(r, g);
    eq(cls(card, "rail-s").length, 5, "expanded: still exactly one rail");
    eq(cls(card, "dw-flow").length, 0, "the workspace does not repeat the receipt");
    eq(cls(card, "rc-wrap").length, 1, "the Goal carries it, once");
  });

  test("the canonical stage and conversation components are still shared", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    const card = src.slice(src.indexOf("function GoalCard"), src.indexOf("function SimulateTP"));
    assert(/<InlineDeal o=\{live\} st=\{st\}/.test(card), "the Goal mounts the dedicated wrapper");
    ["AgreePrice", "SelectTrade", "ValueTrade", "Fulfillment", "DealChat"].forEach((c) =>
      assert(!new RegExp("<" + c + "\\b").test(card), c + " is not re-implemented"));
  });
});

describe("B. The summary row is the only disclosure", () => {
  test("collapsed by default, with correct accessibility semantics", () => {
    const r = mk();
    const row = rowIn(cardFor(r, goalOf(oppAt("select-trade"))));
    eq(row.props["aria-expanded"], false, "aria-expanded is false");
    assert(/Show Deal Flow with/.test(row.props["aria-label"] || ""), "with a clear label");
    assert(cls(row, "goal-deal-c")[0], "and a visible chevron");
  });

  test("the same row expands and collapses, and reports its state", () => {
    const r = mk();
    const g = goalOf(oppAt("select-trade"));
    const row = () => rowIn(cardFor(r, g));

    click(row());
    eq(row().props["aria-expanded"], true, "the row reports expanded");
    assert(/Hide Deal Flow with/.test(row().props["aria-label"] || ""), "and offers to hide");
    assert(cls(cardFor(r, g), "goal-dw")[0], "the workspace opened");
    assert(String(cls(row(), "goal-deal-c")[0].props.className).includes("on"),
      "the chevron flipped");

    click(row());
    eq(cls(cardFor(r, g), "goal-dw").length, 0, "the same row closed it");
    eq(row().props["aria-expanded"], false, "and reports collapsed again");
  });

  test("no separate Hide Deal Flow button exists", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    ["Hide Deal Flow", "View Deal Flow", "Continue Deal Flow"].forEach((label) =>
      eq(card.findAllByType("button").filter((b) => txt(b).trim() === label).length, 0,
        "no standalone " + label + " control"));
    eq(cls(card, "goal-live-view").length, 0, "and the old full-width button is gone");
  });

  test("the collapse control stays at the top of the expanded Goal", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    const order = bandOrder(card);
    /* The rail shares the top row with the identity; the disclosure sits
       directly beneath, still above all the working columns. */
    assert(order.indexOf("goal-deal") < order.indexOf("idf-stage"),
      "the disclosure is above the stage work, so it is never scrolled past");
    assert(order.indexOf("goal-deal") <= 1, "and stays near the top: " + order.join(" → "));
  });

  test("expanding, collapsing and switching mutate nothing", () => {
    const r = mk();
    const a = goalOf(oppAt("select-trade"));
    const b = goalOf(oppAt("value-trade"));
    const before = worldShape();

    expand(r, a);
    eq(worldShape(), before, "expanding mutated nothing");
    expand(r, b);
    eq(cls(cardFor(r, a), "goal-dw").length, 0, "the first collapsed");
    eq(cls(r, "goal-dw").length, 1, "one open at a time");
    eq(worldShape(), before, "switching mutated nothing");
    click(rowIn(cardFor(r, b)));
    eq(worldShape(), before, "collapsing mutated nothing");
  });
});

describe("C. Mobile vertical flow", () => {
  test("the bands appear top to bottom in the intended order", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    const order = bandOrder(card);
    /* The rail moved up to share the top row with the card identity, so it now
       precedes the Deal Flow disclosure. */
    const expected = ["goal-rail", "goal-deal", "idf-stage", "idf-action",
      "chat-embed", "rc-wrap"];
    eq(order.filter((k) => expected.includes(k)).join(" → "), expected.join(" → "),
      "summary, rail, guidance, stage, action, conversation, details");
  });

  test("the stage action sits with the stage, above the conversation", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    const order = bandOrder(card);
    assert(order.indexOf("idf-action") > order.indexOf("idf-stage"), "action follows the stage");
    assert(order.indexOf("idf-action") < order.indexOf("chat-embed"),
      "and precedes the conversation, so it is never scrolled past");
  });

  test("no fixed bar and no nested scroller inside the Goal", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    assert(!/\.idf[^{]*\{[^}]*position: fixed/.test(src),
      "nothing inside the inline deal is pinned to the viewport");
    assert(/\.idf \.chat-embed \.chat-scroll[^}]*max-height: none/.test(src),
      "the conversation does not scroll inside its own box");
    assert(/overflow: visible/.test(src), "one natural page scroll");
  });

  test("partner discovery stays available but subordinate", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    const order = bandOrder(card);
    if (order.includes("goal-holders")) {
      assert(order.indexOf("goal-holders") > order.indexOf("idf-action"),
        "alternatives sit below the stage action, not beside it");
    }
    /* End/cancel is never adjacent to the primary action. */
    const bar = cls(card, "idf-action")[0];
    assert(!/Stop negotiation|Cancel agreed deal/.test(txt(bar)),
      "stopping is not offered beside the stage action");
  });
});

describe("D. Conversation as part of the same surface", () => {
  test("it renders inline, with composer, and no drawer returns", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    const panel = cls(card, "chat-embed")[0];
    assert(panel, "the conversation is a band of the deal");
    eq(panel.findAllByType("textarea").length, 1, "with its composer");
    eq(cls(r, "dw-chat").length, 0, "and no drawer or modal");
  });

  test("events stay visually distinct from messages", () => {
    const r0 = mk();
    const o = oppAt("select-trade");
    TR.act(() => { acts().sendMessage({ collectorId: ME, partnerId: o.partnerId,
      cardId: o.cardId, by: "collector", text: "MINE", at: "2026-08-17" }); });
    TR.act(() => { acts().logMilestone({ collectorId: ME, partnerId: o.partnerId,
      cardId: o.cardId, text: "Price agreed", oppId: o.id, at: "2026-08-17" }); });
    let r; TR.act(() => { r = TR.create(React.createElement(App)); });
    const panel = cls(expand(r, goalOf(o)), "chat-embed")[0];
    assert(cls(panel, "chat-ev").length >= 1, "the event has its own row treatment");
    assert(cls(panel, "chat-m").length >= 1, "and messages are bubbles");
  });

  test("sending from the inline surface changes no stage or turn", () => {
    const r = mk();
    const o = oppAt("select-trade");
    const g = goalOf(o);
    const card = expand(r, g);
    const before = worldShape();
    const ta = cls(card, "chat-embed")[0].findAllByType("textarea")[0];
    TR.act(() => { ta.props.onChange({ target: { value: "any news?" } }); });
    click(cls(cardFor(r, g), "chat-embed")[0].findAllByType("button")
      .find((b) => txt(b).trim() === "Send"));

    const now = D.activeOppForGoal(g.id, S().opportunities);
    const was = JSON.parse(before).opps.find((x) => x[0] === o.id);
    eq(now.stage, was[1], "stage unchanged");
    eq(D.nextActor(now).actor, was[7], "nextActor unchanged");
  });
});

describe("E. All five stages, collapsed and expanded", () => {
  ["agree-price", "select-trade", "value-trade", "deal", "fulfillment"].forEach((stage) => {
    test(stage + " collapses compactly and expands as one surface", () => {
      const r = mk();
      const o = oppAt(stage);
      const g = goalOf(o);

      /* Collapsed: identity, stage, partner, turn, rail, disclosure — no more. */
      const collapsed = cardFor(r, g);
      eq(cls(collapsed, "goal-dw").length, 0, stage + ": no workspace while collapsed");
      eq(cls(collapsed, "chat-embed").length, 0, stage + ": no conversation while collapsed");
      eq(cls(collapsed, "dw-bar").length, 0, stage + ": no action bar while collapsed");
      eq(cls(collapsed, "rail-s").length, 5, stage + ": compact progress");
      assert(rowIn(collapsed), stage + ": a disclosure");

      /* Expanded: one surface, one rail, correct order. */
      const card = expand(r, g);
      assert(cls(card, "idf-stage")[0], stage + ": the stage workspace");
      assert(cls(card, "chat-embed")[0], stage + ": the conversation");
      eq(cls(card, "rail-s").length, 5, stage + ": still one rail");
      eq(cls(card, "dw-ctx").length, 0, stage + ": no nested page header");
      eq(cls(card, "goal-with").length, 0, stage + ": no duplicated partner block");
      assert(bandOrder(card).indexOf("goal-deal") <= 1,
        stage + ": disclosure stays near the top");

      /* And collapses back to compact from the same row. */
      click(rowIn(cardFor(r, g)));
      const again = cardFor(r, g);
      eq(cls(again, "goal-dw").length, 0, stage + ": collapsed again");
      eq(cls(again, "chat-embed").length, 0, stage + ": leaving no conversation behind");
      eq(cls(again, "rc-s").length, 0, stage + ": and no expanded receipt");
    });
  });

  test("Value Trade still resolves real BinderCopies", () => {
    const r = mk();
    const o = oppAt("value-trade");
    const card = expand(r, goalOf(o));
    assert(cls(card, "idf-stage")[0], "it renders");
    const owned = new Set(S().binder.filter((b) => b.collectorId === ME).map((b) => b.id));
    D.acceptedTradeCards(o).forEach((tc) => assert(owned.has(tc.binderId),
      "every trade term names a copy the collector owns"));
  });
});

require("./run.cjs").run();
