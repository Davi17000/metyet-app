/* ============================================================================
   PROTOTYPE HEADER — DEMO STAGE SELECTOR

   The five-stage fixture loader already existed and was tested; it simply was
   not reachable in the running prototype. This exposes it in the prototype bar
   beside Switch persona and Reset demo.

   Nothing new was built underneath. The header calls `demoDealFixture` — the
   SAME function the Collector's review panel calls, hoisted so the two cannot
   drift apart. No stage is written; the requested stage is derived by buildOpps
   from a rebuilt seed row, as it is at hydration.

   These tests hold three things: that the control is development-only and
   Collector-only, that each option really loads that canonical stage, and that
   nothing about the demo world or production behaviour changed.
   ========================================================================= */

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const D = require("../domain/metyet-domain.js");

const readSrc = (rel) => require("fs").readFileSync(require("path").join(__dirname, "..", rel), "utf8");
const SHELL = readSrc("shell/MetYetPrototype.jsx");
const SEED_SRC = readSrc("src/MetYet.jsx");
const COL_SRC = readSrc("collector/MetYetCollector.jsx");

const txt = (n) => {
  if (!n) return "";
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ");
};
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));

const STAGES = ["agree-price", "select-trade", "value-trade", "deal", "fulfillment"];
const LABELS = ["Agree on Price", "Select Trade", "Value Trade", "Deal", "Fulfillment"];
const ME = "c12";

/* The bundle reads METYET_DEV once at module load, so each mode needs its own
   module registry — the only honest way to test a dev-gated control. */
const load = (dev) => {
  const before = process.env.METYET_DEV;
  if (dev) process.env.METYET_DEV = "1"; else delete process.env.METYET_DEV;
  Object.keys(require.cache).filter((k) => /dist\/(Prototype|Collector|MetYet)\.cjs$/.test(k))
    .forEach((k) => delete require.cache[k]);
  const mod = require("../dist/Prototype.cjs");
  const seed = require("../dist/MetYet.cjs");
  if (before === undefined) delete process.env.METYET_DEV; else process.env.METYET_DEV = before;
  return { App: mod.default, buildCanonicalSeed: seed.buildCanonicalSeed,
    demoDealStage: seed.demoDealStage };
};

const mount = (mod) => { let r; TR.act(() => { r = TR.create(React.createElement(mod.App)); }); return r; };
const asCollector = (r) => { click(cls(r, "myp-card")[1]); return r; };
const asTP = (r) => { click(cls(r, "myp-card")[0]); return r; };
const selectorIn = (r) => r.root.findAllByType("select")
  .find((s) => /Demo stage/.test(String(s.props["aria-label"] || "")));
const choose = (r, stage) => TR.act(() => selectorIn(r).props.onChange({ target: { value: stage } }));

describe("A. Development only, Collector only", () => {
  test("the selector does not exist without METYET_DEV", () => {
    const prod = load(false);
    const r = asCollector(mount(prod));
    eq(r.root.findAllByType("select").length, 0, "no selector anywhere");
    assert(!/Demo stage/.test(txt(cls(r, "myp-bar")[0])), "and no label for one");
  });

  test("it appears in the prototype bar in dev, viewing as Collector", () => {
    const dev = load(true);
    const r = asCollector(mount(dev));
    const bar = cls(r, "myp-bar")[0];
    assert(selectorIn(r), "the selector exists");
    assert(cls(bar, "myp-stage")[0], "and it lives inside the prototype bar");
    assert(/Demo stage/.test(txt(bar)), "labelled as demo tooling");
    /* Beside the existing controls, not replacing them. */
    assert(/Switch persona/.test(txt(bar)), "Switch persona is untouched");
    assert(/Reset demo/.test(txt(bar)), "and so is Reset demo");
  });

  test("it is hidden while the Trusted Partner product is on screen", () => {
    const dev = load(true);
    const r = asTP(mount(dev));
    eq(r.root.findAllByType("select").length, 0,
      "a Collector-only fixture control has no place in the TP UI");
    assert(!/Demo stage/.test(txt(cls(r, "myp-bar")[0])), "not even its label");
  });

  test("it is not inside the product content", () => {
    const dev = load(true);
    const r = asCollector(mount(dev));
    const body = cls(r, "myp-body")[0];
    eq(body.findAllByType("select").filter((s) =>
      /Demo stage/.test(String(s.props["aria-label"] || ""))).length, 0,
      "the selector is not inside the Collector app");
    eq(cls(body, "myp-stage").length, 0, "nor anywhere in the product body");
    /* And specifically not inside a Goal card or Deal Flow. */
    cls(r, "goal").forEach((g) => eq(cls(g, "myp-stage").length, 0,
      "no prototype tooling inside a Goal"));
  });

  test("the gate is in source, not styling", () => {
    assert(/const DEV = SHARED_DEV;/.test(SHELL),
      "the shell uses the canonical dev flag");
    assert(/import \{ DEV as SHARED_DEV \} from "\.\.\/shared\/dev-flag\.js"/.test(SHELL),
      "imported from the single definition, not re-derived");
    assert(/\{DEV && persona === "collector" && \(/.test(SHELL),
      "and gates the control on dev AND the Collector persona");
  });
});

describe("B. Exactly the five canonical stages, in order", () => {
  test("five options, canonical order and labels", () => {
    const dev = load(true);
    const r = asCollector(mount(dev));
    const opts = selectorIn(r).children.filter((c) => typeof c !== "string");
    eq(opts.length, 5, "five options");
    eq(opts.map((o) => o.props.value).join(","), STAGES.join(","), "canonical order");
    eq(opts.map((o) => txt(o)).join(","), LABELS.join(","), "with the product's labels");
  });

  test("the list is derived from one declared set", () => {
    assert(/const DEMO_STAGES = \[/.test(SHELL), "a single declared list");
    assert(/DEMO_STAGES\.map/.test(SHELL), "which the control renders from");
    STAGES.forEach((id) => assert(new RegExp('id: "' + id + '"').test(SHELL),
      id + " is offered"));
    assert(!/"completed"/.test(SHELL.slice(SHELL.indexOf("const DEMO_STAGES"),
      SHELL.indexOf("];", SHELL.indexOf("const DEMO_STAGES")))),
      "and no terminal stage is offered as a demo target");
  });
});

describe("C. Selecting a stage loads that canonical stage", () => {
  STAGES.forEach((stage, i) => {
    test(LABELS[i] + ": loads and is reflected in the control", () => {
      const dev = load(true);
      const r = asCollector(mount(dev));
      choose(r, stage);
      eq(selectorIn(r).props.value, stage, "the control shows what is loaded");

      /* And the Collector's Goals screen really is at that stage. */
      const goal = cls(r, "goal").find((n) => /Deal Flow/.test(txt(n))
        && new RegExp(LABELS[i]).test(txt(cls(n, "goal-deal-s")[0] || { children: [] })));
      assert(goal, LABELS[i] + ": a goal on the Goals screen shows that stage");
    });
  });

  test("the loaded fixture is canonically valid at every stage", () => {
    const dev = load(true);
    STAGES.forEach((stage) => {
      const s = dev.buildCanonicalSeed({ review: true, demoStage: stage });
      const g = s.goals.find((x) => x.collectorId === ME && /^Review deal/.test(x.note || ""));
      const o = D.activeOppForGoal(g.id, s.opportunities);
      eq(o.stage, stage, stage + ": loaded at the requested stage");
      if (stage === "agree-price") eq(o.agreedPrice, null, "no settled price yet");
      else assert(o.agreedPrice != null, stage + ": price settled upstream");
      if (["value-trade", "deal", "fulfillment"].includes(stage)) {
        assert(D.acceptedTradeCards(o).length >= 1, stage + ": has cards to work with");
      }
      const owned = new Set(s.binder.filter((b) => b.collectorId === ME).map((b) => b.id));
      ((o.trade && o.trade.cards) || []).forEach((c) => assert(owned.has(c.binderId),
        stage + ": every trade term names a real BinderCopy"));
    });
  });

  test("switching stages keeps one deal, one card, one partner", () => {
    const dev = load(true);
    const r = asCollector(mount(dev));
    const ids = new Set();
    STAGES.forEach((stage) => {
      choose(r, stage);
      const s = dev.buildCanonicalSeed({ review: true, demoStage: stage });
      const g = s.goals.find((x) => x.collectorId === ME && /^Review deal/.test(x.note || ""));
      const o = D.activeOppForGoal(g.id, s.opportunities);
      ids.add([o.collectorId, o.partnerId, o.cardId].join("|"));
      eq(s.opportunities.filter((x) => x.goalId === g.id && D.isActive(x)).length, 1,
        stage + ": exactly one active deal on the demo goal");
    });
    eq(ids.size, 1, "the same collector, partner and card throughout");
  });
});

describe("D. It wires to the existing loader, and nothing else", () => {
  test("the header calls the shared fixture loader", () => {
    assert(/demoDealFixture\(store\.get\(\),\s*\{ collectorId: SELF_COLLECTOR, demoStage:/
      .test(SHELL), "the header calls demoDealFixture");
    assert(/import MetYet, \{[^}]*demoDealFixture[^}]*\} from "\.\.\/src\/MetYet\.jsx"/.test(SHELL),
      "imported from the one place it is defined");
  });

  test("the Collector review panel calls the same function", () => {
    assert(/demoDealFixture\(store\.get\(\), \{ collectorId, demoStage \}\)/.test(COL_SRC),
      "the review panel delegates to the same loader");
    /* One definition, two callers — no second fixture mechanism. */
    eq((SEED_SRC.match(/export function demoDealFixture/g) || []).length, 1,
      "defined exactly once");
  });

  test("no stage setter was introduced anywhere", () => {
    [SHELL, SEED_SRC, COL_SRC].forEach((src) => {
      assert(!/setStage\s*[(:]|jumpStage|forceStage|stageOverride|gotoStage/i.test(src),
        "no stage setter");
    });
    const ctrl = SHELL.slice(SHELL.indexOf('className="myp-stage"'),
      SHELL.indexOf("Reset demo</button>"));
    assert(!/patchOpportunity|agreedPrice|priceThread|\.stage\s*=/.test(ctrl),
      "the control mutates no opportunity directly");
  });

  test("the displayed stage is derived, never stored", () => {
    assert(/demoDealStage\(store\.get\(\), SELF_COLLECTOR\)/.test(SHELL),
      "the header derives the current stage from the live store");
    const fn = SEED_SRC.slice(SEED_SRC.indexOf("export function demoDealStage"),
      SEED_SRC.indexOf("export function buildCanonicalSeed"));
    assert(/isActive/.test(fn), "reading the active opportunity");
    assert(!/useState|localStorage/.test(fn), "holding no state of its own");
  });
});

describe("E. Nothing else changed", () => {
  test("the production seed is untouched", () => {
    const prod = load(false);
    const d = prod.buildCanonicalSeed();
    eq(d.goals.length, 76, "canonical goal count");
    eq(d.opportunities.length, 38, "canonical opportunity count");
    assert(!d.goals.some((g) => /^Review /.test(g.note || "")), "no review goal leaks");
  });

  test("Reset demo still restores the default world", () => {
    const dev = load(true);
    const r = asCollector(mount(dev));
    choose(r, "fulfillment");
    eq(selectorIn(r).props.value, "fulfillment", "moved away from the default");
    click(cls(r, "myp-btn")[1]);                 // Reset demo
    eq(selectorIn(r).props.value, "agree-price",
      "reset returns the demo deal, and the control reflects it");
  });

  test("there is still one reset, and Switch persona is unchanged", () => {
    eq((SHELL.match(/Reset demo/g) || []).length, 1, "a single reset control");
    assert(/aria-haspopup="menu"/.test(SHELL), "the persona menu is intact");
    const dev = load(true);
    const r = asCollector(mount(dev));
    click(cls(r, "myp-btn")[0]);
    assert(cls(r, "myp-item").length >= 2, "and still lists the personas");
  });

  test("the progression deal and promotion scenario still exist", () => {
    const dev = load(true);
    const s = dev.buildCanonicalSeed({ review: true });
    assert(s.goals.some((g) => /^Review deal/.test(g.note || "")), "the progression deal");
    assert(s.goals.some((g) => /^Review promotion/.test(g.note || "")), "and the promotion goal");
    const pg = s.goals.find((g) => /^Review promotion/.test(g.note || ""));
    eq(pg.tier, "secondary", "still starting Secondary");
  });

  test("the control is styled as tooling, not a product CTA", () => {
    const css = SHELL.slice(SHELL.indexOf(".myp-stage {"), SHELL.indexOf(".myp-btn {"));
    assert(/font-size: 12px/.test(css), "small, like the buttons beside it");
    assert(!/background: var\(--t1\)|btn pri/.test(css), "no primary-action treatment");
    const dev = load(true);
    const r = asCollector(mount(dev));
    assert(!/pri/.test(String(selectorIn(r).props.className || "")),
      "and it carries no product button class");
  });
});

require("./run.cjs").run();
