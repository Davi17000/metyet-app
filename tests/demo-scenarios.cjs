/* ============================================================================
   A SCENARIO MUST ACTUALLY CHANGE SOMETHING

   The hosted picker offered seven scenarios and every one of them did nothing.
   Not visibly nothing — literally nothing: `demoDealFixture` rebuilds the
   canonical review fixture and swaps it onto the collector's matching goal, and
   the hosted world was seeded WITHOUT `review`, so that goal did not exist. The
   loader found nothing to swap, returned null, and the `if (next)` guard
   silently skipped. A tester saw an interactive control with no consequence.

   The fix is at the seed, not the UI: the demo world is built the way the
   scenarios expect. Nothing invents a stage label, and no parallel demo state
   model exists — every scenario still resolves through the one canonical
   fixture builder.

   These tests exist because "the control renders" was never the interesting
   claim. What matters is that selecting Select Trade puts the deal AT Select
   Trade, and that a build with DEMO off is completely unaffected.
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
const SHELL = fs.readFileSync(path.join(ROOT, "shell", "MetYetPrototype.jsx"), "utf8");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");

/* The shell as the pilot ships it: literal substitution, not the env path. */
const HOSTED = path.join(ROOT, "dist", "HostedScenarios.cjs");
let built = false;
const hostedShell = () => {
  if (!built) {
    esbuild.buildSync({
      entryPoints: [path.join(ROOT, "shell", "MetYetPrototype.jsx")],
      outfile: HOSTED, bundle: true, format: "cjs", platform: "node",
      external: ["react", "react-dom"], jsx: "automatic", logLevel: "silent",
      define: { __METYET_DEV__: "false", __METYET_DEMO__: "true" },
    });
    built = true;
  }
  delete require.cache[require.resolve(HOSTED)];
  return require(HOSTED).default;
};

const txt = (n) => {
  if (!n) return "";
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ").replace(/\s+/g, " ").trim();
};
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));

const ME = "c12";
const SCENARIOS = ["pre-deal", "pre-deal-ready", "agree-price", "select-trade",
  "value-trade", "deal", "fulfillment"];
const DEAL_STAGES = ["agree-price", "select-trade", "value-trade", "deal", "fulfillment"];

const enterCollector = () => {
  const P = hostedShell();
  let r; TR.act(() => { r = TR.create(React.createElement(P)); });
  click(r.root.findAllByType("button").find((b) => /Continue as Collector/.test(txt(b))));
  return r;
};
const picker = (r) => r.root.findAllByType("select")[0];
const choose = (r, value) => TR.act(() => { picker(r).props.onChange({ target: { value } }); });

describe("A. The demo world contains what the scenarios address", () => {
  test("the hosted seed carries the review goal", () => {
    /* THE ROOT CAUSE. Without `review` the goal every scenario targets is
       absent, and the loader has nothing to swap onto. */
    const seeded = M.buildCanonicalSeed({ review: true });
    const bare = M.buildCanonicalSeed();
    const RE = /^Review deal/;
    assert(seeded.goals.some((g) => RE.test(g.note || "")), "the review goal exists when asked for");
    assert(!bare.goals.some((g) => RE.test(g.note || "")), "and not otherwise");
    assert(/createStore\(buildCanonicalSeed\(\{ review: DEMO \}\)\)/.test(SHELL),
      "so the shell seeds it in demo mode");
  });

  test("without it, every scenario is a silent no-op", () => {
    /* Reproduces the original defect exactly, so a regression cannot hide. */
    const bare = M.buildCanonicalSeed();
    SCENARIOS.forEach((s) => eq(M.demoDealFixture(bare, { collectorId: ME, demoStage: s }), null,
      s + " has nothing to load onto"));
  });

  test("with it, every scenario loads", () => {
    const seeded = M.buildCanonicalSeed({ review: true });
    SCENARIOS.forEach((s) => assert(
      M.demoDealFixture(seeded, { collectorId: ME, demoStage: s }),
      s + " resolves to a real world"));
  });

  test("a build with demo off is unaffected", () => {
    /* The seed follows the flag, so a customer build is exactly as before. */
    assert(/buildCanonicalSeed\(\{ review: DEMO \}\)/.test(SHELL),
      "seeding follows the flag rather than hardwiring the demo world");
    eq((SHELL.match(/createStore\(/g) || []).length, 1, "one creation site");
    eq((SHELL.match(/store\.reset\(/g) || []).length, 1, "one reset site");
  });
});

describe("B. Each scenario produces its own real stage", () => {
  const seeded = () => M.buildCanonicalSeed({ review: true });
  const load = (s) => M.demoDealFixture(seeded(), { collectorId: ME, demoStage: s });
  const reviewGoal = (w) => w.goals.find((g) => /^Review deal/.test(g.note || ""));

  DEAL_STAGES.forEach((stage) => {
    test(stage + " puts the deal at " + stage, () => {
      const w = load(stage);
      const o = D.activeOppForGoal(reviewGoal(w).id, w.opportunities);
      assert(o, "an opportunity exists");
      eq(o.stage, stage, "at the stage the tester asked for");
    });
  });

  ["pre-deal", "pre-deal-ready"].forEach((stage) => {
    test(stage + " precedes any negotiation", () => {
      const w = load(stage);
      const o = D.activeOppForGoal(reviewGoal(w).id, w.opportunities);
      assert(!o, "no opportunity is fabricated before the collector makes one");
    });
  });

  test("photos-ready differs from awaiting-photos on the exact copy", () => {
    const goalCard = (w) => reviewGoal(w).cardId;
    const ready = load("pre-deal-ready");
    const waiting = load("pre-deal");
    const photographed = (w) => w.inventory
      .filter((i) => i.cardId === goalCard(w))
      .some((i) => D.INVARIANTS.copyPhotographed(i.photos));
    assert(photographed(ready), "the ready scenario has actual photos on file");
    assert(!photographed(waiting), "and the awaiting scenario does not");
  });

  test("the reported scenario matches what was loaded", () => {
    /* The picker reflects live state, so it cannot drift from the world. */
    SCENARIOS.forEach((s) => eq(M.demoDealStage(load(s), ME), s,
      s + " reads back as itself"));
  });
});

describe("C. Selecting one in the hosted app changes the app", () => {
  test("the picker reflects the selection instead of resetting", () => {
    const r = enterCollector();
    assert(picker(r), "the picker is present for a collector");
    SCENARIOS.forEach((s) => {
      choose(r, s);
      eq(picker(r).props.value, s, s + " stays selected — the defining symptom was that it did not");
    });
  });

  test("selection is not a no-op: the world actually moves", () => {
    const r = enterCollector();
    const shot = () => JSON.stringify(cls(r, "goal").map((n) => txt(n)));
    choose(r, "pre-deal");
    const atPreDeal = shot();
    choose(r, "fulfillment");
    assert(shot() !== atPreDeal, "the rendered goals differ between scenarios");
  });

  test("every deal stage becomes visible on the goal", () => {
    const r = enterCollector();
    DEAL_STAGES.forEach((stage) => {
      choose(r, stage);
      const label = D.PURSUIT_STEPS.find((s) => s.id === stage);
      assert(label, stage + " is a canonical step");
      const shown = cls(r, "goal").map(txt).join(" | ");
      assert(shown.includes(label.label),
        stage + " is presented as " + label.label + " somewhere on the goals");
    });
  });

  test("Reset demo returns to the canonical baseline", () => {
    const r = enterCollector();
    choose(r, "fulfillment");
    const reset = cls(r, "myp-bar")[0].findAllByType("button")
      .find((b) => txt(b) === "Reset demo");
    assert(reset, "the control exists");
    click(reset);
    /* Back to the demo baseline, which still contains the review goal — a reset
       into a world the scenarios cannot address would be its own bug. */
    assert(picker(r), "the picker survives the reset");
    eq(picker(r).props.value, M.demoDealStage(
      M.buildCanonicalSeed({ review: true }), ME) || "",
      "showing the baseline scenario, not the one that was loaded");
  });

  test("a loaded scenario survives a round trip through the partner", () => {
    const r = enterCollector();
    choose(r, "value-trade");
    const before = picker(r).props.value;
    const bar = () => cls(r, "myp-bar")[0];
    const switchTo = (who) => {
      click(bar().findAllByType("button").find((b) => txt(b) === "Switch persona"));
      click(cls(r, "myp-menu")[0].findAllByType("button")
        .find((b) => new RegExp(who).test(txt(b))));
    };
    switchTo("Trusted Partner");
    switchTo("Collector");
    eq(picker(r).props.value, before,
      "one world, two windows onto it — switching does not discard the scenario");
  });

  test("engineering tooling stays absent throughout", () => {
    const r = enterCollector();
    SCENARIOS.forEach((s) => {
      choose(r, s);
      assert(!/Simulate/.test(txt(r.root)), "no simulator at " + s);
    });
  });
});

describe("D. The goal card has a readable hierarchy", () => {
  test("the identity gets the width, not a squeezed column", () => {
    /* The name shared a row with the six-step rail and both lost: names broke
       to three lines while stage labels shrank to unreadable columns. */
    assert(/\.goal\.deal-open \.goal-b \{ display: flex; flex-direction: column/.test(COL),
      "identity and rail stack rather than compete");
    assert(/\.goal\.deal-open \.goal-n \{[^}]*word-break: normal/s.test(COL),
      "and a long name is not broken mid-word");
  });

  test("the name is the largest text on the card", () => {
    const size = (sel) => {
      const m = new RegExp("\\" + sel + " \\{([^}]*)\\}", "s").exec(COL);
      const f = m && /font-size:\s*([\d.]+)px/.exec(m[1]);
      return f ? Number(f[1]) : null;
    };
    const name = size(".goal.deal-open .goal-n") || size(".goal-n");
    const meta = size(".goal.deal-open .goal-i") || size(".goal-i");
    assert(name && meta, "both are declared");
    assert(name > meta, "the name (" + name + ") outranks its metadata (" + meta + ")");
  });

  test("all six steps survive, in order, with the current one identifiable", () => {
    /* Layout must never cost the lifecycle. */
    eq(D.PURSUIT_STEPS.length, 6, "six steps");
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "in order");
    const r = enterCollector();
    choose(r, "select-trade");
    const rail = cls(r, "rail-s");
    assert(rail.length >= 6, "the tracker renders every step: " + rail.length);
    const current = rail.filter((n) => String(n.props.className).includes("on"));
    assert(current.length >= 1, "and marks where the deal is");
  });

  test("the workspace stays a distinct region below the identity", () => {
    const r = enterCollector();
    choose(r, "select-trade");
    assert(cls(r, "goal-dw")[0] || cls(r, "goal-deal-s")[0],
      "the deal workspace is present and separately marked");
    assert(/\.goal-rail \{[^}]*border-top/s.test(COL),
      "with the rail visually separated from what precedes it");
  });

  test("no stage or status was invented to satisfy the layout", () => {
    const r = enterCollector();
    choose(r, "select-trade");
    const labels = cls(r, "rail-l").map(txt).filter(Boolean);
    const canonical = D.PURSUIT_STEPS.map((s) => s.label);
    labels.forEach((l) => assert(canonical.includes(l),
      l + " is a canonical step name, not a decorative addition"));
    assert(!/Continue\b/.test(txt(cls(r, "goal")[0] || null)),
      "and no generic Continue button replaced the stage's real action");
  });

  test("it still reflows rather than crushing on a narrow container", () => {
    assert(/@media[^{]*\{\s*\n?\s*\.goal-top \{ flex-wrap: wrap; \}/.test(COL)
      || /\.goal-top \{ flex-wrap: wrap; \}/.test(COL),
      "the identity row wraps instead of compressing");
    assert(/\.rail \{ flex-direction: column/.test(COL),
      "and the tracker becomes a list rather than shrinking to columns");
  });
});

require("./run.cjs").run();
