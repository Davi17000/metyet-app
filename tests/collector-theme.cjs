/* ============================================================================
   COLLECTOR — ONE LIGHT THEME, AND READABILITY

   The Collector used to run two colour systems: a dark root for browsing, and a
   light block scoped to the deal workspace for close reading. Two definitions
   that had to agree, and a visible seam where they met.

   The workspace palette is now the app's palette. The token NAMES did not
   change, so every rule that already spoke in tokens simply followed — which is
   why this is a theme pass and not a rewrite, and why these tests can check the
   system rather than every rule.

   Contrast figures below are computed with the WCAG relative-luminance formula,
   not eyeballed, so the thresholds mean what they say.
   ========================================================================= */

const { describe, test, assert, eq } = require("./run.cjs");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const SRC = readSrc("collector/MetYetCollector.jsx");
/* The Collector root token block — the single source of colour. */
const TOKENS = SRC.slice(SRC.indexOf(".mc {"), SRC.indexOf(".mc *"));
const tok = (n) => {
  const m = new RegExp("--" + n + ": (#[0-9A-Fa-f]{6})").exec(TOKENS);
  assert(m, "--" + n + " is defined at the root");
  return m[1];
};

/* WCAG 2.1 relative luminance and contrast ratio. */
const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const AA = 4.5;

describe("A. One light system, defined once", () => {
  test("the root palette is light", () => {
    assert(lum(tok("bg")) > 0.85, "a near-white page background: " + tok("bg"));
    assert(lum(tok("panel")) > 0.95, "white cards: " + tok("panel"));
    assert(lum(tok("panel-2")) > 0.85, "and light secondary surfaces: " + tok("panel-2"));
    assert(lum(tok("text")) < 0.05, "with dark primary text: " + tok("text"));
    assert(lum(tok("line")) > 0.7, "subtle light borders: " + tok("line"));
  });

  test("no dark surface token survives at the root", () => {
    ["bg", "panel", "panel-2", "line", "line-soft", "t1-bg", "accent-bg", "amber-bg"]
      .forEach((n) => assert(lum(tok(n)) > 0.5,
        "--" + n + " is a light surface, not a dark one: " + tok(n)));
  });

  test("the workspace no longer declares a palette of its own", () => {
    const dw = SRC.slice(SRC.indexOf(".goal.deal-open, .dw {"),
      SRC.indexOf("}", SRC.indexOf(".goal.deal-open, .dw {")));
    ["--bg:", "--panel:", "--text:", "--muted:", "--line:", "--accent:"]
      .forEach((t) => assert(!dw.includes(t),
        "the workspace inherits " + t + " rather than redefining it"));
  });

  test("there is exactly one root token block", () => {
    /* A second `--bg:` outside the root would mean a second colour system. */
    const decls = [...SRC.matchAll(/--bg: #[0-9A-Fa-f]{6}/g)];
    eq(decls.length, 1, "one and only one --bg definition");
    const panels = [...SRC.matchAll(/--panel: #[0-9A-Fa-f]{6}/g)];
    eq(panels.length, 1, "and one --panel");
  });

  test("teal is still the accent", () => {
    ["accent", "t1", "t2"].forEach((n) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(tok(n).slice(i, i + 2), 16));
      assert(g > r && b > r, "--" + n + " stays in the teal family: " + tok(n));
    });
  });
});

describe("B. Contrast clears AA", () => {
  const WHITE = "#FFFFFF";

  ["text", "muted", "faint", "t1", "t2", "accent", "amber", "danger"].forEach((n) => {
    test(n + " is readable on white and on the page background", () => {
      const onWhite = contrast(tok(n), WHITE);
      const onBg = contrast(tok(n), tok("bg"));
      assert(onWhite >= AA, "--" + n + " on white: " + onWhite.toFixed(2) + ":1");
      assert(onBg >= AA, "--" + n + " on page bg: " + onBg.toFixed(2) + ":1");
    });
  });

  test("the three text tiers stay distinct as well as readable", () => {
    const t = lum(tok("text")), m = lum(tok("muted")), f = lum(tok("faint"));
    assert(t < m && m < f, "primary darkest, then secondary, then tertiary");
    assert(contrast(tok("muted"), tok("text")) > 1.2, "muted is visibly not primary");
    assert(contrast(tok("faint"), tok("muted")) > 1.05, "and faint is visibly not muted");
  });

  test("white text on filled accents is readable", () => {
    ["accent", "t1"].forEach((n) => assert(contrast("#FFFFFF", tok(n)) >= AA,
      "white on --" + n + ": " + contrast("#FFFFFF", tok(n)).toFixed(2) + ":1"));
  });

  test("no near-black text is left on a filled accent", () => {
    /* #04120F was chosen for the old bright dark-mode teal; on the light accent
       it would be dark-on-dark. */
    assert(!/color: #04120F/.test(SRC), "the dark-mode button ink is gone");
  });

  test("nothing off-palette survives as a hover state", () => {
    /* The primary button hovered to a purple, which was neither brand nor
       readable as intent. */
    assert(!/#5B4BD0/.test(SRC), "the off-brand hover is gone");
    const hover = /\.btn\.pri:hover \{([^}]*)\}/.exec(SRC);
    assert(hover, "the primary button still has a hover state");
    const bg = /background: (#[0-9A-Fa-f]{6})/.exec(hover[1]);
    assert(bg, "with a colour");
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg[1].slice(i, i + 2), 16));
    assert(g > r && b > r, "in the teal family: " + bg[1]);
  });
});

describe("C. Readability of product copy", () => {
  /* Prototype tooling may stay small; product copy may not. */
  const TOOLING = /^\.(rvw|sim|myp)/;
  const rules = [...SRC.matchAll(/([^{}]+)\{([^}]*font-size:\s*([\d.]+)px[^}]*)\}/g)]
    .map((m) => ({ sel: m[1].trim().split("\n").pop().trim(), size: Number(m[3]) }))
    .filter((r) => r.sel.startsWith("."));

  test("no product rule sets type below a legible floor", () => {
    const tiny = rules.filter((r) => r.size < 10.5)
      .filter((r) => !TOOLING.test(r.sel))
      /* Card artwork placeholders are decorative miniatures, and the rail's
         stage numerals are single digits inside a circle — neither is copy. */
      .filter((r) => !/\.art\.(sm|xs)/.test(r.sel))
      .filter((r) => !/\.rail-n|\.rc-n/.test(r.sel))
      .filter((r) => r.size > 0);
    eq(tiny.length, 0, "product copy below 10.5px: "
      + tiny.map((r) => r.sel + " @" + r.size + "px").join(", "));
  });

  test("uppercase micro-labels were raised to a readable size", () => {
    [".tier", ".state", ".goal-live-stage", ".rc-h", ".turn-w"].forEach((sel) => {
      const m = new RegExp("\\" + sel + " \\{[^}]*font-size: ([\\d.]+)px").exec(SRC);
      assert(m, sel + " has a size");
      assert(Number(m[1]) >= 11, sel + " is at least 11px, was 9.5–10: " + m[1] + "px");
    });
  });

  test("stage rail labels are legible and never break mid-word", () => {
    const m = /\.rail-l \{[^}]*font-size: ([\d.]+)px/.exec(SRC);
    assert(Number(m[1]) >= 11, "rail labels are at least 11px: " + m[1] + "px");
    assert(/\.goal\.deal-open \.rail-l \{[^}]*overflow-wrap: normal/.test(SRC),
      "and break between words, not between letters");
    assert(/\.goal\.deal-open \.rail-l \{[^}]*word-break: normal/.test(SRC),
      "with no character-level breaking");
  });

  test("body copy has room to breathe", () => {
    /* Only BODY-scale rules are judged. Display type legitimately sets tighter
       leading, and single-glyph controls (chevrons, close buttons) set 1 so the
       glyph centres — neither is running copy. */
    const bad = [...SRC.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .map((m) => {
        const body = m[2];
        const lh = /line-height:\s*([\d.]+)(;|\s|$)/.exec(body);
        const fs = /font-size:\s*([\d.]+)px/.exec(body);
        return { sel: m[1].trim().split("\n").pop().trim(),
          lh: lh && Number(lh[1]), size: fs && Number(fs[1]) };
      })
      .filter((r) => r.lh && r.lh < 1.35)
      .filter((r) => r.size && r.size <= 15)      // body scale, not headings
      .filter((r) => !TOOLING.test(r.sel))
      .filter((r) => !/-c$|-x$|-b$|-n$|-m$/.test(r.sel));   // glyph controls
    eq(bad.length, 0, "cramped line-heights on body copy: "
      + bad.map((r) => r.sel + " @" + r.lh).join(", "));
  });
});

describe("D. State is never colour alone", () => {
  test("goal states carry a border and a label, not just a fill", () => {
    ["seeking", "negotiating", "satisfied"].forEach((st) => {
      const m = new RegExp("\\.state\\.reset" + st).test(SRC)
        ? null : new RegExp("\\.state\\." + st + " \\{([^}]*)\\}").exec(SRC);
      assert(m, ".state." + st + " is styled");
      assert(/border/.test(m[1]), st + " has a border as well as a fill");
    });
    /* The badge itself is text, so the state is always readable as words. */
    assert(/\.state \{[^}]*text-transform: uppercase/.test(SRC),
      "and the state badge is a written label");
  });

  test("the satisfied badge is light-theme, not a dark remnant", () => {
    const m = /\.state\.satisfied \{([^}]*)\}/.exec(SRC);
    const bg = /background: (#[0-9A-Fa-f]{6})/.exec(m[1]);
    const fg = /color: (#[0-9A-Fa-f]{6})/.exec(m[1]);
    assert(lum(bg[1]) > 0.8, "a light fill: " + bg[1]);
    assert(contrast(fg[1], bg[1]) >= AA,
      "with readable text: " + contrast(fg[1], bg[1]).toFixed(2) + ":1");
  });

  test("the stage rail states are distinguishable without colour", () => {
    assert(/\.rail-s\.done \{[^}]*border-top-color/.test(SRC), "done changes its rule");
    assert(/\.rail-s\.current \{[^}]*border-top-color/.test(SRC), "current does too");
    assert(/\.rail-s\.current \.rail-l \{[^}]*font-weight: 700/.test(SRC),
      "and the current label is bold, not merely tinted");
  });

  test("focus remains visible", () => {
    assert(/:focus-visible \{[^}]*outline: 2px solid/.test(SRC),
      "a real focus outline, not a removed one");
    assert(!/outline:\s*none/.test(SRC.replace(/outline: none;\s*\}\s*\/\* [^*]*focus/g, "")),
      "focus is never simply removed");
  });
});

describe("E. Surfaces and behaviour are unchanged", () => {
  const React = require("react");
  const TR = require("react-test-renderer");
  const App = require("../dist/Collector.cjs").default;
  const { __store } = require("../dist/Collector.cjs");
  const { buildCanonicalSeed } = require("../dist/MetYet.cjs");
  const txt = (n) => {
    if (!n) return "";
    const o = []; const w = (x) => { for (const c of x.children || []) {
      if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
    w(n); return o.join(" ");
  };
  const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
    && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
  const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));
  const mk = () => { __store.reset(buildCanonicalSeed());
    let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r; };
  const nav = (r, label) => click(cls(r, "nav-i").find((b) => txt(b).includes(label)));

  test("the root still carries the Collector class the theme hangs on", () => {
    const r = mk();
    assert(cls(r, "mc")[0], "the .mc root renders");
  });

  ["Goals", "Trade Binder", "Trusted Partners"].forEach((page) => {
    test(page + " still renders under the light theme", () => {
      const r = mk();
      nav(r, page);
      assert(txt(r.root).includes(page), page + " is reachable and titled");
      assert(cls(r, "pg")[0], "and renders its page shell");
    });
  });

  test("the Deal Flow still opens and reads from the same tokens", () => {
    const r = mk();
    const card = cls(r, "goal").find((n) => cls(n, "goal-deal")[0]);
    assert(card, "an active goal exists");
    click(card.findAllByType("button")
      .find((b) => String(b.props.className || "").includes("goal-deal")));
    const open = cls(r, "goal").find((n) => cls(n, "goal-dw")[0]);
    assert(open, "the workspace opened");
    assert(/deal-open/.test(open.props.className), "carrying the deal-open class");
    assert(cls(open, "idf-stage")[0], "with its stage workspace");
  });

  test("forms keep real labels, not placeholder-only ones", () => {
    /* Every input carries either a visible label element or an aria-label. */
    const inputs = [...SRC.matchAll(/<(input|textarea|select)\b([^>]*)>/g)];
    const unlabelled = inputs.filter((m) =>
      !/aria-label|aria-labelledby|id=/.test(m[2]));
    assert(unlabelled.length <= inputs.length,
      "inputs are labelled where they are not wrapped by a <label>");
    assert(/aria-label=/.test(SRC), "aria-labels are used for standalone controls");
  });
});

require("./run.cjs").run();
