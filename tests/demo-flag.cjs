/* ============================================================================
   TWO AUDIENCES, TWO SWITCHES

   A vendor trying the pilot needs to jump a deal to Value Trade and put it back
   afterwards — not to debug anything, but because that is the only way to see a
   six-stage flow without spending an afternoon reaching it. An engineer needs
   tools that fabricate the other side's moves, which is exactly what a demo
   must NOT do when the person can switch persona and make the move for real.

   One flag could not serve both: the pilot either exposed engineering tooling
   or hid the scenario controls that make it worth visiting. So:

     DEMO   intentional, tester-facing scenario controls
     DEV    engineering tooling

   DEV implies DEMO, decided once in the flag module rather than at each call
   site. Both default to off, so a future customer build that defines neither
   ships with both surfaces absent by default rather than by remembering.
   ========================================================================= */

const { describe, test, assert, eq } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const DEV_SRC = readSrc("shared/dev-flag.js");
const DEMO_SRC = readSrc("shared/demo-flag.js");
const SHELL = readSrc("shell/MetYetPrototype.jsx");
const COL = readSrc("collector/MetYetCollector.jsx");

/* Evaluate a flag module exactly as a bundler would hand it to a browser. */
const browserFlag = (entry, defines) => {
  const out = esbuild.buildSync({
    entryPoints: [path.join(ROOT, entry)],
    bundle: true, format: "cjs", write: false, logLevel: "silent",
    define: { "process.env.NODE_ENV": '"production"', ...defines },
  });
  const mod = {};
  new Function("module", "exports", out.outputFiles[0].text)(mod, (mod.exports = {}));
  return mod.exports;
};
const browser = (dev, demo) => {
  const d = {};
  if (dev !== null) d.__METYET_DEV__ = String(dev);
  if (demo !== null) d.__METYET_DEMO__ = String(demo);
  return {
    DEV: browserFlag("shared/dev-flag.js", d).DEV,
    DEMO: browserFlag("shared/demo-flag.js", d).DEMO,
  };
};

describe("A. One definition each", () => {
  test("there is exactly one DEV flag and one DEMO flag", () => {
    assert(fs.existsSync(path.join(ROOT, "shared", "dev-flag.js")), "the dev module");
    assert(fs.existsSync(path.join(ROOT, "shared", "demo-flag.js")), "the demo module");
    eq((DEV_SRC.match(/export const DEV\b/g) || []).length, 1, "DEV declared once");
    eq((DEMO_SRC.match(/export const DEMO\b/g) || []).length, 1, "DEMO declared once");
  });

  test("callers import them rather than re-deriving the environment", () => {
    [["shell/MetYetPrototype.jsx", SHELL], ["collector/MetYetCollector.jsx", COL]]
      .forEach(([name, src]) => {
        assert(/from "\.\.\/shared\/dev-flag\.js"/.test(src), name + " imports DEV");
        assert(/from "\.\.\/shared\/demo-flag\.js"/.test(src), name + " imports DEMO");
        assert(!/process\.env\.METYET/.test(src),
          name + " never reads the environment itself");
      });
  });

  test("neither flag makes the browser depend on process.env", () => {
    [DEV_SRC, DEMO_SRC].forEach((src) => {
      /* The environment is a fallback for Node, reached only when no build-time
         literal was substituted — never the browser's path. */
      const guard = /typeof __METYET_(DEV|DEMO)__ !== "undefined"/.test(src);
      assert(guard, "a build-time literal is checked first");
      assert(!/\.\.\.\s*process\.env|process\.env\s*\}/.test(src),
        "and no environment object is passed through");
    });
  });

  test("the relationship between them lives in the flag layer, not at call sites", () => {
    assert(/resolve\(\) \|\| DEV/.test(DEMO_SRC), "DEV implies DEMO, decided once");
    [SHELL, COL].forEach((src) =>
      assert(!/DEMO \|\| DEV|DEV \|\| DEMO/.test(src),
        "no component restates the relationship"));
  });
});

describe("B. Every mode resolves as intended", () => {
  const cases = [
    ["future customer production", false, false, { DEV: false, DEMO: false }],
    ["app.metyet.io pilot", false, true, { DEV: false, DEMO: true }],
    ["local engineering", true, false, { DEV: true, DEMO: true }],
    ["engineering asking for both", true, true, { DEV: true, DEMO: true }],
  ];
  cases.forEach(([name, dev, demo, want]) => {
    test(name + ": DEV=" + want.DEV + ", DEMO=" + want.DEMO, () => {
      const got = browser(dev, demo);
      eq(got.DEV, want.DEV, "DEV");
      eq(got.DEMO, want.DEMO, "DEMO");
    });
  });

  test("a build that defines neither flag ships both off", () => {
    const got = browser(null, null);
    eq(got.DEV, false, "nothing is enabled by default");
    eq(got.DEMO, false, "in either dimension");
  });

  test("the Node side answers the same way for local commands", () => {
    const before = { d: process.env.METYET_DEV, m: process.env.METYET_DEMO };
    const read = () => {
      /* Fresh evaluation, because the exported constants latch at load. */
      const out = esbuild.buildSync({
        entryPoints: [path.join(ROOT, "shared", "demo-flag.js")],
        bundle: true, format: "cjs", write: false, logLevel: "silent",
      });
      const mod = {};
      new Function("module", "exports", out.outputFiles[0].text)(mod, (mod.exports = {}));
      return { DEV: mod.exports.isDemo, demo: mod.exports.isDemo() };
    };
    try {
      delete process.env.METYET_DEV; delete process.env.METYET_DEMO;
      eq(read().demo, false, "npm run dev: no tooling");
      process.env.METYET_DEMO = "1";
      eq(read().demo, true, "METYET_DEMO=1: scenario controls");
      delete process.env.METYET_DEMO; process.env.METYET_DEV = "1";
      eq(read().demo, true, "METYET_DEV=1: engineering implies demo");
    } finally {
      if (before.d === undefined) delete process.env.METYET_DEV;
      else process.env.METYET_DEV = before.d;
      if (before.m === undefined) delete process.env.METYET_DEMO;
      else process.env.METYET_DEMO = before.m;
    }
  });
});

describe("C. Each surface sits behind the flag matching its audience", () => {
  test("scenario controls are tester-facing", () => {
    assert(/const demoStage = DEMO \? /.test(SHELL), "the scenario reflects DEMO");
    assert(/\{DEMO && persona === "collector" && \(/.test(SHELL),
      "and the picker is gated on it");
    const panel = COL.slice(COL.indexOf("function ReviewPanel"), COL.indexOf("function Goals("));
    assert(/if \(!DEMO\) return null;/.test(panel), "the review scenarios panel too");
    const reset = COL.slice(COL.indexOf("resetReviewDeal:"), COL.indexOf("dealAgreed:"));
    assert(/if \(!DEMO\) return null;/.test(reset), "and the reset the picker depends on");
  });

  test("simulating the counterparty stays engineering-only", () => {
    /* The unified shell already lets a tester switch persona and make the
       partner's move for real. A control that fabricates it instead is a
       debugging tool, and would misrepresent the product in a demo. */
    const sim = COL.slice(COL.indexOf("function SimulateTP("),
      COL.indexOf("function SimulateTP(") + 300);
    assert(/if \(!DEV\) return null;/.test(sim), "it is gated on DEV");
    assert(!/DEMO/.test(sim), "and not on DEMO");
  });

  test("demo mode alone does not open the engineering tooling", () => {
    const got = browser(false, true);
    eq(got.DEMO, true, "the pilot has scenario controls");
    eq(got.DEV, false, "and no engineering tooling");
  });

  test("demo controls stay outside both products' navigation", () => {
    /* They live in the outer prototype bar, not in the TP sidebar or the
       Collector's tabs. */
    const bar = SHELL.slice(SHELL.indexOf('className="myp-bar"'),
      SHELL.indexOf('className="myp-bar"') + 2000);
    assert(/DEMO && persona === "collector"/.test(bar), "the picker is in the prototype bar");
    assert(/myp-stage/.test(bar), "with its own scaffolding class");
  });

  test("the label reads for a tester", () => {
    assert(/<span className="myp-stage-l">Scenario<\/span>/.test(SHELL),
      "named Scenario, not an internal term");
    assert(/aria-label="Scenario"/.test(SHELL), "and announced the same way");
  });
});

describe("D. Scenarios still run on the canonical machinery", () => {
  test("loading a scenario rebuilds the canonical fixture", () => {
    const reset = COL.slice(COL.indexOf("resetReviewDeal:"), COL.indexOf("dealAgreed:"));
    assert(/demoDealFixture\(store\.get\(\), \{ collectorId, demoStage \}\)/.test(reset),
      "it delegates to the one shared loader");
    assert(!/stage:\s*demoStage|\.stage =/.test(reset), "and writes no stage field");
    const shellPick = SHELL.slice(SHELL.indexOf("const next = demoDealFixture"),
      SHELL.indexOf("const next = demoDealFixture") + 300);
    assert(/demoDealFixture\(store\.get\(\)/.test(shellPick),
      "the picker uses the same loader, so the two cannot drift");
  });

  test("no second lifecycle or store-rewriting shortcut was added", () => {
    const tp = readSrc("src/MetYet.jsx");
    eq((tp.match(/export function demoDealFixture/g) || []).length, 1,
      "one fixture loader");
    assert(/buildCanonicalSeed\(\{ review: true, demoStage:/.test(tp),
      "built from the canonical seed builder");
    [SHELL, COL].forEach((src) => assert(!/setStage\(|forceStage|__setStage/.test(src),
      "no arbitrary stage mutation helper"));
  });
});

describe("E. The hosted pilot is configured, not special-cased", () => {
  test("the pilot build enables demo and disables engineering", () => {
    const site = readSrc("site.build.mjs");
    assert(/__METYET_DEV__: "false"/.test(site), "DEV false");
    assert(/__METYET_DEMO__: "true"/.test(site), "DEMO true");
  });

  test("a customer build needs no source change", () => {
    /* Both flags default off, so shipping the real product means defining them
       false — or not at all — rather than editing components. */
    [SHELL, COL].forEach((src) => {
      assert(!/DEMO = true|DEV = true/.test(src), "nothing hardwires a flag on");
    });
    eq(browser(false, false).DEMO, false, "and false stays false");
  });

  test("the library build stays free of both", () => {
    const prod = readSrc("prod.build.mjs");
    assert(/__METYET_DEV__: "false"/.test(prod), "DEV false");
    assert(/__METYET_DEMO__: "false"/.test(prod), "DEMO false");
  });

  test("the dev server passes through what was asked for, and no policy", () => {
    const dev = readSrc("dev-server.mjs");
    assert(/__METYET_DEV__: JSON\.stringify\(process\.env\.METYET_DEV === "1"\)/.test(dev),
      "DEV from the environment");
    assert(/__METYET_DEMO__: JSON\.stringify\(process\.env\.METYET_DEMO === "1"\)/.test(dev),
      "DEMO from the environment");
    assert(!/METYET_DEV === "1" \|\|/.test(dev),
      "the DEV-implies-DEMO rule is not restated here");
  });

  test("the shipped pilot bundle carries no unsubstituted flag", () => {
    const js = path.join(ROOT, "site", "main.js");
    if (!fs.existsSync(js)) return;   /* built by tests/site-build.cjs */
    const src = fs.readFileSync(js, "utf8");
    assert(!/__METYET_DEV__|__METYET_DEMO__/.test(src), "both were substituted");
    assert(!/METYET_DEV|METYET_DEMO/.test(src), "and no environment lookup remains");
  });
});

require("./run.cjs").run();
