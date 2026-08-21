/* ============================================================================
   THE PERSONA SWITCHER, AND WHAT DEPENDED ON IT

   The pilot's switcher looked fine and did nothing. Both the menu and the
   transparent veil behind it are positioned children of .myp-bar's stacking
   context; the veil claimed z-index 55 and the menu claimed none, so the veil
   painted ON TOP of the menu. Every click on a persona landed on the veil,
   whose handler closes the menu — visible, and inert.

   That one defect explained a second symptom. The scenario controls are gated
   on `DEMO && persona === "collector"` and Review scenarios lives inside the
   Collector app, so both are correctly absent on the Trusted Partner persona.
   With the switcher stuck, a tester who entered as Trusted Partner could never
   reach them and reasonably concluded the demo tooling was missing.

   Two layers of protection, because neither alone is enough:

     CSS INVARIANT   menu must paint above veil. A React renderer performs no
                     layout and no hit-testing — it calls onClick on whatever
                     node the test selects, so it CANNOT see one element
                     covering another. Only this assertion protects the pointer
                     path that actually broke.

     RENDERED PATH   state and events under the real hosted defines, proving a
                     tester can get from either entry persona to the demo
                     controls.
   ========================================================================= */

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
const SHELL = fs.readFileSync(path.join(ROOT, "shell", "MetYetPrototype.jsx"), "utf8");

/* Build the shell exactly as the hosted pilot does — literal substitution, not
   the environment path the other suites exercise. */
const HOSTED = path.join(ROOT, "dist", "HostedPrototype.cjs");
let builtOnce = false;
const hostedShell = () => {
  if (!builtOnce) {
    esbuild.buildSync({
      entryPoints: [path.join(ROOT, "shell", "MetYetPrototype.jsx")],
      outfile: HOSTED, bundle: true, format: "cjs", platform: "node",
      external: ["react", "react-dom"], jsx: "automatic", logLevel: "silent",
      define: { __METYET_DEV__: "false", __METYET_DEMO__: "true" },
    });
    builtOnce = true;
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

/* Enter the pilot the way a tester does: choose a persona on the entry screen. */
const enterAs = (who) => {
  const P = hostedShell();
  let r; TR.act(() => { r = TR.create(React.createElement(P)); });
  const cta = r.root.findAllByType("button")
    .find((b) => new RegExp("Continue as " + who).test(txt(b)));
  assert(cta, "the entry screen offers " + who);
  click(cta);
  return r;
};
const viewing = (r) => txt(cls(r, "myp-viewing")[0]);
const bar = (r) => cls(r, "myp-bar")[0];
const switcher = (r) => bar(r).findAllByType("button")
  .find((b) => txt(b) === "Switch persona");
/* Open the menu and choose a persona by name. */
const switchTo = (r, who) => {
  click(switcher(r));
  const menu = cls(r, "myp-menu")[0];
  assert(menu, "the menu opened");
  const item = menu.findAllByType("button").find((b) => new RegExp(who).test(txt(b)));
  assert(item, who + " is offered: " + menu.findAllByType("button").map(txt).join("|"));
  click(item);
};

/* Read a declared z-index out of the shell's stylesheet. `null` means the rule
   declares none, which is what the bug was. */
const zIndexOf = (selector) => {
  const re = new RegExp("\\" + selector + " \\{([^}]*)\\}", "s");
  const m = re.exec(SHELL);
  assert(m, selector + " is declared");
  const z = /z-index:\s*(-?\d+|auto)/.exec(m[1]);
  return z ? (z[1] === "auto" ? null : Number(z[1])) : null;
};

describe("A. The menu paints above the veil", () => {
  test("both are positioned children of the same stacking context", () => {
    /* The invariant only means anything inside one context, so pin that too. */
    const barRule = /\.myp-bar \{([^}]*)\}/s.exec(SHELL);
    assert(/position: relative/.test(barRule[1]), ".myp-bar is positioned");
    assert(/z-index: \d+/.test(barRule[1]), "and carries a z-index, forming a context");
    assert(/\.myp-menu \{[^}]*position: absolute/s.test(SHELL), "the menu is positioned");
    assert(/\.myp-veil \{[^}]*position: fixed/s.test(SHELL), "and so is the veil");
    const src = SHELL.slice(SHELL.indexOf('className="myp-veil"'));
    assert(src.indexOf('className="myp-menu"') < 400,
      "and they are siblings, the veil first in document order");
  });

  test("the menu's z-index is greater than the veil's", () => {
    /* THE ASSERTION THAT PROTECTS THE ACTUAL DEFECT. Semantic, not literal: any
       value above the veil passes, and removing the declaration fails. */
    const menu = zIndexOf(".myp-menu");
    const veil = zIndexOf(".myp-veil");
    assert(veil !== null, "the veil declares a stacking position: " + veil);
    assert(menu !== null,
      "the menu must declare one too — with z-index auto the positive-z veil "
      + "paints over it and swallows every click");
    assert(menu > veil,
      "menu (" + menu + ") must paint above veil (" + veil + ")");
  });

  test("the veil still covers the page beneath, so outside clicks dismiss", () => {
    /* Raising the menu must not stop the veil doing its one job. */
    const veilRule = /\.myp-veil \{([^}]*)\}/s.exec(SHELL)[1];
    assert(/inset: 0/.test(veilRule), "it still spans the viewport");
    assert(zIndexOf(".myp-veil") > 0, "and still sits above ordinary content");
    assert(/<span className="myp-veil" onClick=\{\(\) => setMenu\(false\)\} \/>/.test(SHELL),
      "with its dismiss handler unchanged");
  });

  test("nothing else in the bar competes for that band", () => {
    const others = [...SHELL.matchAll(/\.myp-([a-z-]+) \{([^}]*)\}/gs)]
      .map(([, name, body]) => {
        const z = /z-index:\s*(-?\d+)/.exec(body);
        return z ? { name: "myp-" + name, z: Number(z[1]) } : null;
      })
      .filter(Boolean)
      .filter((x) => x.name !== "myp-menu" && x.name !== "myp-veil");
    /* The bar itself is the context, so it is expected to sit above both. */
    others.forEach((x) => assert(x.name === "myp-bar",
      "unexpected stacking claim: " + x.name + " at " + x.z));
  });
});

describe("B. Switching works in the hosted pilot", () => {
  test("a Trusted Partner can reach the Collector", () => {
    const r = enterAs("Trusted Partner");
    eq(viewing(r), "Trusted Partner", "entered as the partner");
    assert(switcher(r), "the switcher is offered");
    switchTo(r, "Collector");
    eq(viewing(r), "Collector", "and one switch gets there");
  });

  test("and back again", () => {
    const r = enterAs("Trusted Partner");
    switchTo(r, "Collector");
    switchTo(r, "Trusted Partner");
    eq(viewing(r), "Trusted Partner", "the switch works in both directions");
  });

  test("a Collector can reach the Trusted Partner", () => {
    const r = enterAs("Collector");
    eq(viewing(r), "Collector", "entered as the collector");
    switchTo(r, "Trusted Partner");
    eq(viewing(r), "Trusted Partner", "either entry point works");
  });

  test("choosing dismisses the menu", () => {
    const r = enterAs("Trusted Partner");
    click(switcher(r));
    eq(cls(r, "myp-menu").length, 1, "the menu is open");
    eq(cls(r, "myp-veil").length, 1, "with its veil behind it");
    /* Choose from the already-open menu rather than reopening it. */
    const item = cls(r, "myp-menu")[0].findAllByType("button")
      .find((b) => /Collector/.test(txt(b)));
    click(item);
    eq(cls(r, "myp-menu").length, 0, "and closes once a persona is chosen");
    eq(cls(r, "myp-veil").length, 0, "taking the veil with it");
    eq(viewing(r), "Collector", "having actually switched");
  });

  test("the menu marks which persona is current", () => {
    const r = enterAs("Trusted Partner");
    click(switcher(r));
    const on = cls(r, "myp-menu")[0].findAllByType("button")
      .filter((b) => String(b.props.className || "").includes("on"));
    eq(on.length, 1, "exactly one is marked current");
    assert(/Trusted Partner/.test(txt(on[0])), "and it is the one being viewed");
  });
});

describe("C. The demo controls are reachable from either entry", () => {
  const scenarioSelect = (r) => cls(r, "myp-stage")[0];

  test("entering as Trusted Partner, one switch reaches the scenario picker", () => {
    /* THE PILOT REQUIREMENT. This is what the broken switcher actually cost:
       not a cosmetic glitch, but a tester who could never see the demo. */
    const r = enterAs("Trusted Partner");
    assert(!scenarioSelect(r),
      "correctly absent on the partner persona — it loads a Collector fixture");
    switchTo(r, "Collector");
    assert(scenarioSelect(r), "and present once the collector is on screen");
    assert(r.root.findAllByType("select").length >= 1, "with a real control to use");
  });

  test("the picker offers the pre-deal scenarios and every deal stage", () => {
    const r = enterAs("Trusted Partner");
    switchTo(r, "Collector");
    const sel = r.root.findAllByType("select")[0];
    const groups = sel.findAllByType("optgroup").map((g) => g.props.label);
    assert(groups.includes("Review Card"), "the pre-deal group");
    assert(groups.includes("Deal stage"), "and the deal stages");
    const options = sel.findAllByType("option");
    assert(options.length >= 6, "enough scenarios to exercise the flow: "
      + options.length);
  });

  test("Reset demo is available throughout", () => {
    const r = enterAs("Trusted Partner");
    const reset = () => bar(r).findAllByType("button").find((b) => txt(b) === "Reset demo");
    assert(reset(), "on the partner persona");
    switchTo(r, "Collector");
    assert(reset(), "and on the collector");
  });

  test("engineering tooling stays hidden on both personas", () => {
    const r = enterAs("Trusted Partner");
    assert(!/Simulate/.test(txt(r.root)), "no simulator for the partner");
    switchTo(r, "Collector");
    assert(!/Simulate/.test(txt(r.root)),
      "nor the collector — DEV is false in the hosted pilot");
  });

  test("switching persona does not reset the demo world", () => {
    /* Both personas read one store, so a scenario loaded before a switch must
       still be loaded after it. */
    const r = enterAs("Collector");
    const sel = r.root.findAllByType("select")[0];
    const target = sel.findAllByType("option")
      .map((o) => o.props.value).find((v) => /select-trade/.test(v));
    if (!target) return;
    TR.act(() => { sel.props.onChange({ target: { value: target } }); });
    const after = r.root.findAllByType("select")[0].props.value;
    switchTo(r, "Trusted Partner");
    switchTo(r, "Collector");
    eq(r.root.findAllByType("select")[0].props.value, after,
      "the loaded scenario survives a round trip through the other persona");
  });
});

require("./run.cjs").run();
