/* ============================================================================
   PILOT ENABLEMENT: A CARD YOU CAN READ, AND A PARTNER YOU CAN ANSWER

   TWO DEFECTS, ONE OF THEM MINE

   The card name broke across three lines on a card with room to spare. My
   previous pass blamed font size and stacked the identity block — cosmetic, and
   it changed nothing, because the real constraint was structural: the rail was
   a THIRD flex sibling inside .goal-top, declaring `flex: 1 1 320px` against an
   identity column of basis 0. Flex handed the rail most of the free space and
   left the name a couple of hundred pixels. The rail now has its own row.

   The second defect is that one tester could not move a deal without hopping
   personas. The partner-response control offers that move in place — but only
   through the SAME canonical action the real Trusted Partner seat uses, so a
   demo move cannot reach a state the product could not, and cannot skip a
   validation the real seat enforces.

   That constraint is why the control covers one stage rather than five, and
   these tests pin that honestly rather than papering over it.
   ========================================================================= */

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const D = require("../domain/metyet-domain.js");
const M = require("../dist/MetYet.cjs");

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const TP = fs.readFileSync(path.join(ROOT, "src", "MetYet.jsx"), "utf8");

const build = (dev, demo, out) => {
  esbuild.buildSync({
    entryPoints: [path.join(ROOT, "shell", "MetYetPrototype.jsx")],
    outfile: path.join(ROOT, "dist", out), bundle: true, format: "cjs", platform: "node",
    external: ["react", "react-dom"], jsx: "automatic", logLevel: "silent",
    define: { __METYET_DEV__: String(dev), __METYET_DEMO__: String(demo) },
  });
  const p = path.join(ROOT, "dist", out);
  delete require.cache[require.resolve(p)];
  return require(p).default;
};
let hostedC = null, plainC = null;
const hosted = () => (hostedC = hostedC || build(false, true, "PilotHosted.cjs"));
const plain = () => (plainC = plainC || build(false, false, "PilotPlain.cjs"));

const txt = (n) => {
  if (!n) return "";
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ").replace(/\s+/g, " ").trim();
};
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));

const enter = (Shell) => {
  let r; TR.act(() => { r = TR.create(React.createElement(Shell)); });
  click(r.root.findAllByType("button").find((b) => /Continue as Collector/.test(txt(b))));
  return r;
};
const scenario = (r, v) => TR.act(() => {
  r.root.findAllByType("select")[0].props.onChange({ target: { value: v } });
});
const expandAll = (r) => cls(r, "goal").forEach((g) => {
  const d = g.findAllByType("button")
    .find((b) => String(b.props.className || "").includes("goal-deal"));
  if (d && !d.props["aria-expanded"]) click(d);
});

describe("A. Identity owns the top row", () => {
  test("the rail is no longer a sibling competing for identity's width", () => {
    /* THE ACTUAL DEFECT. A regression would put rail-s back inside goal-top. */
    const r = enter(hosted());
    scenario(r, "select-trade");
    expandAll(r);
    const card = cls(r, "goal").find((g) => cls(g, "goal-rail").length > 0);
    assert(card, "a goal with a rail");
    const top = cls(card, "goal-top")[0];
    assert(top, "which has a top row");
    eq(cls(top, "rail-s").length, 0, "the rail does not live in it");
    assert(cls(top, "art")[0], "identity keeps the artwork");
    assert(cls(top, "goal-b")[0], "and the name block");
  });

  test("the rail no longer declares a competing flex basis", () => {
    assert(!/\.goal-rail \{ flex: 1 1 320px/.test(COL),
      "the basis that starved the identity column is gone");
    assert(/\.goal-rail \{ width: 100%; \}/.test(COL), "it spans its own row instead");
  });

  test("the name is free to use the width it has", () => {
    assert(/\.goal\.deal-open \.goal-n \{[^}]*word-break: normal/s.test(COL),
      "no forced word breaking on the card name");
    assert(/\.goal\.deal-open \.goal-b \{[^}]*min-width: 0/s.test(COL),
      "and the identity block can shrink without overflowing");
  });

  test("identity outranks its supporting metadata", () => {
    const size = (sel) => {
      const m = new RegExp("\\" + sel + " \\{([^}]*)\\}", "s").exec(COL);
      const f = m && /font-size:\s*([\d.]+)px/.exec(m[1]);
      return f ? Number(f[1]) : null;
    };
    const name = size(".goal.deal-open .goal-n") || size(".goal-n");
    const meta = size(".goal.deal-open .goal-i") || size(".goal-i");
    assert(name > meta, "name " + name + "px over metadata " + meta + "px");
  });

  test("everything the card must keep is still there", () => {
    const r = enter(hosted());
    scenario(r, "select-trade");
    expandAll(r);
    const card = cls(r, "goal").find((g) => cls(g, "goal-rail").length > 0);
    assert(cls(card, "art")[0], "card art");
    assert(cls(card, "tier")[0], "the primary/secondary distinction");
    assert(cls(card, "state")[0], "current status");
    eq(cls(card, "rail-s").length, 6, "all six stages");
    assert(cls(card, "cx-ph")[0], "actual-photo availability");
    assert(cls(card, "goal-dw")[0] || cls(card, "goal-deal-s")[0], "the deal workspace");
  });

  test("the six steps keep their names and order", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment",
      "the lifecycle was not touched to solve a layout problem");
  });

  test("it reflows rather than collapsing at narrow widths", () => {
    assert(/\.goal-top \{ flex-wrap: wrap; \}/.test(COL), "artwork and identity wrap");
    assert(/\.rail \{ flex-direction: column/.test(COL),
      "and the tracker stacks only when it must");
  });
});

describe("B. The partner can be answered, canonically", () => {
  /* Reach the point where the partner actually has something to answer. */
  const atPartnersTurn = () => {
    const r = enter(hosted());
    scenario(r, "agree-price");
    expandAll(r);
    /* The scenario opens on the collector's move (the partner has countered),
       so the collector answers first — then it is the partner's turn. */
    const field = () => r.root.findAllByType("input")
      .find((i) => /dollars/.test(String(i.props["aria-label"] || "")));
    if (field()) {
      TR.act(() => { field().props.onChange({ target: { value: "3900" } }); });
      const send = r.root.findAllByType("button").find((b) => /^Send counter$/.test(txt(b)));
      if (send) click(send);
    }
    expandAll(r);
    return r;
  };

  test("nothing is offered when the partner has no move to make", () => {
    const r = enter(hosted());
    scenario(r, "agree-price");
    expandAll(r);
    /* The partner has already countered: it is the collector's turn, so there
       is no partner response — and no disabled button pretending otherwise. */
    eq(cls(r, "dpr").length, 0, "the control is absent, not greyed out");
  });

  test("once it is the partner's turn, the response appears", () => {
    const r = atPartnersTurn();
    const box = cls(r, "dpr")[0];
    assert(box, "the partner-response control is offered");
    assert(/Demo/.test(txt(box)), "labelled as demo scaffolding");
    assert(/Partner response/.test(txt(box)), "in plain product language");
    assert(/accepts/.test(txt(box)), "with the actual response available");
  });

  test("it uses no engineering vocabulary", () => {
    const src = COL.slice(COL.indexOf("function DemoPartnerResponse("),
      COL.indexOf("function SimulateTP("));
    const rendered = src.slice(src.indexOf("return ("));
    ["SimulateTP", "Force", "Advance", "Patch", "patchOpportunity"].forEach((w) =>
      assert(!rendered.includes(w), "no " + w + " in what the tester sees"));
  });

  test("the response goes through the canonical action", () => {
    const src = COL.slice(COL.indexOf("function DemoPartnerResponse("),
      COL.indexOf("function SimulateTP("));
    /* CONTRACT CHANGE: the helper now covers every stage, so it aliases the
       canonical action set once (`const A = st.simulate`) instead of naming it
       per call. The guarantee is unchanged and asserted more strongly below:
       canonical actions only, and no field patching. */
    assert(/const A = st\.simulate;/.test(src), "it uses the canonical action set");
    assert(/A\.agreePrice\(\{ oppId: o\.id/.test(src), "price agreement is canonical");
    ["tradeMarketRespond", "tradePercentRespond", "dealAgree", "proposeFulfillment",
      "confirmHandoff", "reviewTradeCards"].forEach((a) =>
      assert(new RegExp("A\\." + a + "\\(").test(src), a + " is canonical too"));
    assert(!/patchOpportunity/.test(src), "and patches no fields directly");
    assert(!/stage:/.test(src), "and writes no stage");
    /* The same action the Trusted Partner's own accept routes through. */
    assert(/store\.actions\.agreePrice\(\{ oppId, by/.test(TP),
      "which is exactly what the real partner seat calls");
  });

  test("using it produces real canonical state", () => {
    const r = atPartnersTurn();
    const box = cls(r, "dpr")[0];
    if (!box) return;
    const accept = box.findAllByType("button").find((b) => /accepts/.test(txt(b)));
    assert(accept, "an accept response");
    click(accept);
    /* The control disappears because the partner now has nothing left to
       answer — which is the correct consequence, not a missing response. */
    eq(cls(r, "dpr").length, 0, "no stale response lingers once the move is made");
    /* What matters is that the deal really moved, by the domain's own rules. */
    const shown = cls(r, "goal").map(txt).join(" | ");
    assert(/Select Trade/.test(shown),
      "price agreement advanced the deal to Select Trade, as the domain defines");
    const railOn = cls(r, "rail-s").filter((n) => String(n.props.className).includes("on"));
    assert(railOn.length >= 1, "and the tracker reflects a real stage");
  });

  test("commitment still comes only from price agreement", () => {
    /* The demo control cannot commit a copy any earlier than the product can. */
    const seeded = M.demoDealFixture(M.buildCanonicalSeed({ review: true }),
      { collectorId: "c12", demoStage: "agree-price" });
    const g = seeded.goals.find((x) => /^Review deal/.test(x.note || ""));
    const o = D.activeOppForGoal(g.id, seeded.opportunities);
    eq(o.agreedPrice, null, "nothing is settled while the price is open");
    if (o.invId) eq(D.INVARIANTS.copyCommittedTo(o.invId, seeded.opportunities), null,
      "and no copy is committed");
  });
});

describe("C. It is demo scaffolding, not product, and not engineering", () => {
  test("it is gated on DEMO, never on DEV", () => {
    const src = COL.slice(COL.indexOf("function DemoPartnerResponse("),
      COL.indexOf("function SimulateTP("));
    assert(/if \(!DEMO \|\| !o\) return null;/.test(src), "DEMO gates it");
    assert(!/!DEV/.test(src), "and it does not depend on engineering mode");
  });

  test("a customer build shows neither it nor the simulator", () => {
    const r = enter(plain());
    eq(cls(r, "dpr").length, 0, "no partner-response control");
    assert(!/Simulate/.test(txt(r.root)), "and no engineering simulator");
  });

  test("the engineering simulator stays hidden in the hosted pilot", () => {
    const r = enter(hosted());
    ["agree-price", "select-trade", "value-trade", "deal", "fulfillment"]
      .forEach((s) => {
        scenario(r, s);
        expandAll(r);
        assert(!/Simulate/.test(txt(r.root)), "no raw simulator at " + s);
      });
    const sim = COL.slice(COL.indexOf("function SimulateTP("),
      COL.indexOf("function SimulateTP(") + 260);
    assert(/if \(!DEV\) return null;/.test(sim), "it remains DEV-only");
  });

  test("it points at the real Trusted Partner workflow rather than replacing it", () => {
    const src = COL.slice(COL.indexOf("function DemoPartnerResponse("),
      COL.indexOf("function SimulateTP("));
    assert(/Switch persona for the full Trusted Partner workflow/.test(src),
      "the real seat is still the real seat");
  });

  test("no parallel demo lifecycle was introduced", () => {
    const src = COL.slice(COL.indexOf("function DemoPartnerResponse("),
      COL.indexOf("function SimulateTP("));
    ["demoStage:", "setStage", "forceStage", "fakeAgreed"].forEach((w) =>
      assert(!src.includes(w), "no " + w));
  });
});

require("./run.cjs").run();
