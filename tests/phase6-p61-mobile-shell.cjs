/* ============================================================================
   PHASE 6 P6-1 — THE MOBILE SHELL AND VISUAL FOUNDATION
   The frozen Phase 6 prototype (phase6-prototype-01 @ fca2c61) is the visual
   reference; this batch brings its shell into the production Collector app
   WITHOUT changing what any screen does. So this suite checks two things:
     A. the shell     order, the screen header and its count, the tab bar
     B. the styles    one intact stylesheet, defined tokens, the primitives
     C. nothing else  no section changed what it is handed, no command moved
   Real-browser layout (390px and 1280px) was reviewed with screenshots; the
   assertions here are the ones a test runner can hold.
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const React = require("react");
const TR = require("react-test-renderer");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const load = (rel) => {
  const out = esbuild.buildSync({ entryPoints: [path.join(ROOT, rel)], bundle: true, format: "cjs",
    write: false, logLevel: "silent", jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"], define: { "process.env.NODE_ENV": '"production"' } });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};
const SHELL_MOD = load("client/collector/CollectorShell.jsx");
const Shell = SHELL_MOD.default;
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");

const ME = "c-1";
const VIEW = Object.freeze({
  actor: { seat: "collector", collectorId: ME },
  collectors: [{ id: ME, name: "Casey Lin" }],
  partners: [{ id: "p-1", name: "Northline Cards" }, { id: "p-2", name: "Silver Vale" }],
  relationships: [], goals: [], collectorCopies: [], binders: [{ id: "bd1", collectorId: ME, name: "Mudkip",
    createdAt: "2030-01-01T00:00:00.000Z", archivedAt: null }],
  binderEntries: [], binderMemberships: [], inventory: [], opportunities: [], discoveries: [],
  catalog: [], counterparties: [], copyReviews: [], photoRequests: [], interests: [], conversations: [],
});
const render = (props = {}) => {
  let r;
  TR.act(() => { r = TR.create(React.createElement(Shell, { state: VIEW, onSignOut: () => {}, ...props })); });
  return r;
};
const textOf = (n) => (typeof n === "string" ? n : !n || !n.children ? "" : n.children.map(textOf).join(" "));
const navButtons = (r) => r.root.findAll((n) => n.type === "nav")[0].findAll((n) => n.type === "button");
const go = (r, label) => {
  const b = navButtons(r).find((n) => textOf(n).includes(label));
  assert(b, `no tab ${label}`);
  TR.act(() => { b.props.onClick(); });
};
const header = (r) => r.root.findAll((n) => n.type === "header" && n.props.className === "mcs-hd")[0] || null;
const styleText = (r) => r.root.findAll((n) => n.type === "style").map((n) => n.children.join("")).join("\n");

/* ============================================================== A */
describe("A. the shell", () => {
  test("the four tabs, in the approved order", () => {
    eq(SHELL_MOD.SECTIONS.map((s) => s.label).join(" · "), "Browse · Binders · Deal Flow · Trusted Partners", "order");
    const r = render();
    eq(navButtons(r).map((b) => textOf(b).replace(/[0-9]/g, "").replace(/\s+/g, " ").trim()).join(" · "),
      "Browse · Binders · Deal Flow · Trusted Partners", "rendered in that order");
    eq(navButtons(r).filter((b) => b.props["aria-current"] === "page").length, 1, "exactly one current tab");
  });
  test("each screen has a header holding its title; counted screens say their count in words", () => {
    const r = render();
    for (const [tab, count] of [["Browse", null], ["Binders", "1 binder"], ["Deal Flow", null], ["Trusted Partners", "2 partners"]]) {
      go(r, tab);
      const h = header(r);
      assert(h, `${tab} has no screen header`);
      const h1 = h.findAll((n) => n.type === "h1");
      eq(h1.length === 1 && textOf(h1[0]).trim(), tab, `${tab}: the title is in the header`);
      const c = h.findAll((n) => n.props && n.props.className === "mcs-hd-count");
      eq(c.length ? textOf(c[0]).trim() : null, count, `${tab}: count`);
    }
  });
  test("the tab counts are still in the markup (shown in the sidebar, moved to the header on a phone)", () => {
    const r = render();
    const counts = navButtons(r).map((b) => b.findAll((n) => n.props && n.props.className === "c").map(textOf).join(""));
    eq(json(counts), json(["", "1", "", "2"]), "binders and partners carry their counts");
  });
});

/* ============================================================== B */
describe("B. the styles", () => {
  test("the stylesheet is one intact string — a stray backtick cannot split it", () => {
    const src = read("client/collector/CollectorShell.jsx");
    const start = src.indexOf("const CSS = `") + "const CSS = `".length;
    const body = src.slice(start, src.indexOf("\n`;", start));
    eq((body.match(/`/g) || []).length, 0, "a backtick inside the CSS ends the template literal");
    const css = styleText(render());
    assert(css.includes(".mcs { --bg:#F7F9FA") && css.includes("PHASE 6 VISUAL FOUNDATION")
      && /\.mcs-spec-panel::before, \.mcs-sheet::before \{ display:none; \}/.test(css), "first rule to last, all delivered");
  });
  test("every token the rules use is defined, and the display face falls back to the system", () => {
    const css = styleText(render());
    const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
    const defined = new Set([...css.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]));
    const missing = [...used].filter((t) => !defined.has(t));
    eq(json(missing), json([]), "tokens used but never defined");
    assert(!/font-family:'Archivo'\s*[;}]/.test(css), "a bare 'Archivo' falls back to serif — production loads no web font");
    assert(/--font-display:'Archivo',system-ui/.test(css) && /--font-ui:'Public Sans',system-ui/.test(css), "the stacks");
  });
  test("the screen header sticks; the phone tab bar is light, labels only, clear of the home indicator", () => {
    const css = styleText(render());
    assert(/\.mcs-hd \{ position:sticky; top:0;/.test(css), "sticky header");
    assert(/\.mcs-nav \{ background:#FFF;[^}]*padding-bottom:env\(safe-area-inset-bottom/.test(css), "light, safe-area aware");
    assert(/\.mcs-i\.on \{ color:var\(--t1\); box-shadow:inset 0 2px 0 var\(--t1\); \}/.test(css), "a rule over the current tab");
    assert(/\.mcs-i \.c \{ display:none;/.test(css), "no counts in the phone tab bar");
    const wide = css.slice(css.lastIndexOf("@media (min-width:860px)"));
    assert(/\.mcs-i \.c \{ display:inline-block; \}/.test(wide), "counts return in the sidebar");
    assert(/\.mcs-body \{ flex-direction:row; \}/.test(wide), "the sidebar sits on the left");
    assert(/\.mcs-main \{ padding:0 16px calc\(var\(--tabbar-h\)/.test(css), "content clears the tab bar");
  });
  test("one pill control, one grid, one sheet, one acknowledgement — shared by the screens that exist", () => {
    const css = styleText(render());
    assert(css.includes(".mcs-br-door.on, .mcs-view[aria-pressed=\"true\"], .mcs-chip.on { background:var(--text);"), "pressed pills");
    assert(/\.mcs-br-grid \{ grid-template-columns:1fr 1fr;/.test(css), "two up on a phone");
    assert(css.includes(".mcs-spec-panel, .mcs-sheet { border-top:0; border-radius:var(--r-sheet) var(--r-sheet) 0 0;"),
      "the sheet primitive is the Card Specification sheet's own rule");
    assert(css.includes(".mcs-toast, .mcs-spec-saved, .mcs-filling {"), "acknowledgements share one note");
  });
});

/* ============================================================== C */
describe("C. nothing else moved", () => {
  test("each section is handed exactly what it was handed before", () => {
    const src = read("client/collector/CollectorShell.jsx");
    for (const line of ["? { onAddGoal, onSetPriority, onRemoveGoal, onBrowseCards }",
      "? { onSpecify, onBrowseCards, session: browseSession, onSession: setBrowseSession,",
      "? { onSpecify, onBrowseCards, onCreateBinder, onRenameBinder,",
      "? { onBrowseCards }",
      /* RESTATED (P6-F5B): Deal Flow keeps every prop it had and gains only
         `focus` / `onFocusUsed` — the copy it was sent to from Browse */
      /* RESTATED (Milestone 2C): the price moves go to the Deal Workspace,
         where the deal is conducted; Deal Flow gains the way to open it */
      /* RESTATED (Milestone 2C.1): Deal Flow's landing page sends nothing.
         Its cards open the Deal Workspace or View Matches, and the commands
         go to those two full-screen views, each exactly the ones it uses. */
      "? { onBrowseCards,",
      "onOpenDeal: (oppId) => openDeal(oppId),",
      "onOpenMatches: (goalId) => openMatches(goalId),",
      "onCounterOffer={onCounterOffer} onAcceptOffer={onAcceptOffer} onWithdrawOffer={onWithdrawOffer}",
      /* RESTATED (Milestone 2C.2): Inspect left View Matches; looking is the picture */
      "onEndInspection={onEndInspection} onRequestPhotos={onRequestPhotos}",
      "onFindCards: () => setSection(\"browse\"),",
      "onOpenOffer={onOpenOffer} onOpenDeal={(oppId) => openDeal(oppId)} onRefresh={onRefresh} />",
      "focus: dealFocus, onFocusUsed: () => setDealFocus(null) }"]) {
      assert(src.includes(line), `a section's props changed: ${line}`);
    }
  });
  test("no command, no section file and no shared component changed in this batch", () => {
    /* P6-F4 B5: + changeCollectingState; M2D.1: + sendDealMessage; M3A A3: + Select Trade's six — each founder-approved */ eq(EXPOSED_COMMANDS.length, 37, "the production door");
    const { execFileSync } = require("child_process");
    /* Measured over P6-1's own commit, not against the working tree — a later
       batch is allowed to change sections; P6-1 was not. */
    const changed = execFileSync("git", ["diff", "--name-only", "79db6b5", "309ff7e", "--", "client", "server", "domain", "persistence"],
      { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
    eq(json(changed), json(["client/collector/CollectorShell.jsx"]), "only the shell");
  });
  test("handed no callbacks, the shell still offers nothing to change", () => {
    const r = render();
    assert(textOf(r.root).includes("Read-only for now"), "the read-only note is still said");
  });
});

function json(v) { return JSON.stringify(v); }
run();
