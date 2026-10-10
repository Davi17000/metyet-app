/* ============================================================================
   PHASE 6 P6-F1 — THE PHONE, RESTORED TO THE APPROVED PROTOTYPE
   Reference: phase6-prototype-01 @ fca2c61; deviations in
   docs/PHASE6_APPROVED_DEVIATIONS.md. Real-browser layout at 390 × 844 is
   checked in harness/phase6-filing-browser.cjs ("mobile shell") and measured
   against the prototype by `npm run review:fidelity`.
     A. the shell      no account bar or banner on a phone; white panel;
                       prototype hierarchy; four one-line tabs; desktop unchanged
     B. the account    one button, one sheet: who, what works today, Sign out
     C. the notice     its wording kept; said where it is true
     D. placeholders   the prototype's drawn card; catalogue images still win
     E. the launcher   a busy port is an answer, never a stack trace
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { execFile } = require("child_process");
const esbuild = require("esbuild");
const React = require("react");
const TR = require("react-test-renderer");

const ROOT = path.join(__dirname, "..");
const load = (rel) => {
  const out = esbuild.buildSync({ entryPoints: [path.join(ROOT, rel)], bundle: true, format: "cjs",
    write: false, logLevel: "silent", jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"], define: { "process.env.NODE_ENV": '"production"' } });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};
const Shell = load("client/collector/CollectorShell.jsx").default;
const CardArt = load("client/card-art.jsx").default;
const json = (v) => JSON.stringify(v);
const textOf = (n) => (typeof n === "string" ? n : !n || !n.children || n.type === "style" ? "" : n.children.map(textOf).join(" "));
const flat = (n) => textOf(n).replace(/\s+/g, " ").trim();

const ME = "c-1";
const VIEW = Object.freeze({
  actor: { seat: "collector", collectorId: ME }, collectors: [{ id: ME, name: "Casey Lin" }],
  partners: [{ id: "p-1", name: "Northline Cards" }], relationships: [], goals: [], collectorCopies: [],
  binders: [{ id: "bd1", collectorId: ME, name: "Mudkip", createdAt: "2030-01-01T00:00:00.000Z", archivedAt: null }],
  binderEntries: [], binderMemberships: [], inventory: [], opportunities: [], discoveries: [],
  catalog: [], counterparties: [], copyReviews: [], photoRequests: [], interests: [], conversations: [],
});
const LIVE = { onAddGoal: () => {}, onOpenOffer: () => {} };
const render = (props = {}) => { let r; TR.act(() => { r = TR.create(React.createElement(Shell, { state: VIEW, onSignOut: () => {}, ...props })); }); return r; };
const css = () => render().root.findAll((n) => n.type === "style").map((n) => n.children.join("")).join("\n");
/* The phone layer: the LAST max-width:859px block (P6-F1). */
const phone = () => { const c = css(); const i = c.lastIndexOf("@media (max-width:859px) {"); return c.slice(i, c.indexOf("\n}", i)); };
const desktop = () => { const c = css(); const i = c.lastIndexOf("@media (min-width:860px) {"); return c.slice(i, c.indexOf("\n}", i)); };
const go = (r, label) => { const b = r.root.findAll((n) => n.type === "nav")[0].findAll((n) => n.type === "button").find((x) => flat(x).includes(label)); TR.act(() => { b.props.onClick(); }); };
const account = (r) => r.root.findAll((n) => n.type === "button" && /^Account: /.test(String(n.props["aria-label"] || "")))[0] || null;
const dialog = (r) => r.root.findAll((n) => n.props && n.props.role === "dialog" && n.props["aria-label"] === "Account")[0] || null;
const scope = (r) => r.root.findAll((n) => n.type === "p" && n.props.className === "mcs-scope")[0] || null;

/* ============================================================== A */
describe("A. the shell on a phone", () => {
  test("the phone panel is white — #EEF1F4 was the prototype's stage, not its phone", () => {
    assert(/\.mcs \{ --bg:#FFF; --tabbar-h:47px; \}/.test(phone()), "the phone background or tab height");
    assert(!/--bg:#FFF/.test(desktop()), "the desktop background changed");
  });
  test("no account bar and no banner above the collection on a phone; both stay on desktop", () => {
    assert(/\.mcs-top, \.mcs-ro \{ display:none; \}/.test(phone()), "the account bar or banner is still on the phone");
    assert(!/\.mcs-top[^{]*\{ display:none/.test(desktop()), "the desktop lost its account bar");
    const r = render(LIVE);
    eq(r.root.findAll((n) => n.props && n.props.className === "mcs-top").length, 1, "the bar is still in the markup for desktop");
    eq(r.root.findAll((n) => n.props && n.props.className === "mcs-ro").length, 1, "the banner is still in the markup for desktop");
  });
  test("the screen hierarchy is the prototype's: title, search, filters, disclosures", () => {
    const p = phone();
    for (const rule of [
      /\.mcs-at-browse > \.mcs-sub, \.mcs-at-binder > \.mcs-sub \{ display:none; \}/,
      /\.mcs-bcontrols \.mcs-in \{ background:#F7F9FA; border:1px solid var\(--line\); border-radius:12px;/,
      /\.mcs-lenses \.mcs-view \{ padding:5px 10px; font-size:12px; \}/,
      /\.mcs-sechead \{ padding:4px 0 10px 18px; font-family:inherit; font-size:11px; font-weight:600; letter-spacing:\.06em; \}/,
      /\.mcs-ogrid \{ gap:10px 8px; \}/,
    ]) assert(rule.test(p), `missing: ${rule}`);
    const r = render(LIVE);
    go(r, "Binders");
    assert(/mcs-at-binder/.test(r.root.findAll((n) => n.type === "main")[0].props.className), "the screen does not say which it is");
  });
  test("four tabs, each label on one line, the prototype's 47px bar", () => {
    const p = phone();
    assert(/\.mcs-i \{ flex:1 1 auto; min-height:0; padding:12px 4px 14px; \}/.test(p), "tab sizing");
    assert(/\.mcs-i \.l \{ font-size:13px; line-height:20px; white-space:nowrap; \}/.test(p), "labels can wrap");
    eq(render().root.findAll((n) => n.type === "nav")[0].findAll((n) => n.type === "button").length, 4, "four destinations");
  });
});

/* ============================================================== B */
describe("B. the account, one tap away", () => {
  test("a button in the screen header names who is signed in", () => {
    const r = render(LIVE);
    const b = account(r);
    assert(b, "no account button");
    eq(b.props["aria-label"], "Account: Casey Lin");
    eq(b.props["aria-haspopup"], "dialog");
    assert(r.root.findAll((n) => n.type === "header" && n.props.className === "mcs-hd")[0].findAll((n) => n === b).length === 1, "not in the screen header");
    assert(/\.mcs-acct \{ flex:0 0 auto; width:44px; height:44px;/.test(css()), "smaller than a thumb");
  });
  test("its sheet: who, role, what works today, and Sign out — which signs out", () => {
    let out = 0;
    const r = render({ ...LIVE, onSignOut: () => { out += 1; } });
    TR.act(() => { account(r).props.onClick(); });
    const d = dialog(r);
    assert(d && d.props["aria-modal"] === "true", "no modal account sheet");
    const t = flat(d);
    for (const s of ["Casey Lin", "Collector", "What works today", "Your goals are yours to change", "trades and messages arrive later"]) assert(t.includes(s), `missing "${s}": ${t}`);
    TR.act(() => { d.findAll((n) => n.type === "button" && flat(n) === "Sign out")[0].props.onClick(); });
    eq(out, 1, "Sign out did not sign out");
  });
  test("Close and Escape close it", () => {
    const r = render(LIVE);
    TR.act(() => { account(r).props.onClick(); });
    TR.act(() => { dialog(r).findAll((n) => n.type === "button" && flat(n) === "Close")[0].props.onClick(); });
    eq(dialog(r), null);
    TR.act(() => { account(r).props.onClick(); });
    TR.act(() => { dialog(r).props.onKeyDown({ key: "Escape" }); });
    eq(dialog(r), null);
  });
});

/* ============================================================== C */
describe("C. the release notice: its words kept, said where they are true", () => {
  test("Binders and Browse carry no line when Goals can be changed — everything there works", () => {
    const r = render(LIVE);
    for (const tab of ["Browse", "Binders"]) { go(r, tab); eq(scope(r), null, `${tab} carries a notice line`); }
  });
  test("Deal Flow and Trusted Partners say trades and messages arrive later", () => {
    const r = render(LIVE);
    for (const tab of ["Deal Flow", "Trusted Partners"]) {
      go(r, tab);
      assert(scope(r) && /^Trades and messages arrive later\. What works today$/.test(flat(scope(r))), `${tab}: ${scope(r) && flat(scope(r))}`);
    }
  });
  test("a shell that can change nothing says so on every screen", () => {
    const r = render();
    for (const tab of ["Browse", "Binders", "Deal Flow", "Trusted Partners"]) {
      go(r, tab);
      assert(scope(r) && /Read-only for now/.test(flat(scope(r))), `${tab} hides that it is read-only`);
    }
  });
  test("the wording is the banner's own, one source for every place it appears", () => {
    const src = fs.readFileSync(path.join(ROOT, "client/collector/CollectorShell.jsx"), "utf8");
    eq((src.match(/Offers are yours to make and answer in Deal Flow\. Everything else here is read-only for now: trades and messages arrive later\./g) || []).length, 1, "the notice was copied, and can drift");
    const r = render(LIVE);
    eq(flat(r.root.findAll((n) => n.props && n.props.className === "mcs-ro")[0]),
      "Your goals are yours to change — say what you're looking for and how hard. Offers are yours to make and answer in Deal Flow. Everything else here is read-only for now: trades and messages arrive later.", "the desktop banner changed");
  });
});

/* ============================================================== D */
describe("D. the prototype's placeholder, in the shared card picture", () => {
  const draw = (props) => { let r; TR.act(() => { r = TR.create(React.createElement(CardArt, { wrap: "w", plate: "p", ...props })); }); return r; };
  test("no picture: a drawn card — name, figure, set, number, 'No picture yet'", () => {
    const r = draw({ name: "Mudkip", card: { key: "cc-1", set: "Ruby & Sapphire", number: "60" } });
    const root = r.root.findAll((n) => n.props && String(n.props.className || "").split(" ").includes("mcs-ph"))[0];
    assert(root && /^w mcs-ph$/.test(root.props.className), "not the card-shaped placeholder");
    eq(flat(root), "Mudkip ◆ Ruby & Sapphire 60 No picture yet");
    assert(root.findAll((n) => n.type === "svg").length === 1, "no figure");
    eq(root.props.role, "img"); eq(root.props["aria-label"], "Mudkip");
  });
  test("its colour and pose come from the card, the prototype's way, and never change", () => {
    const a = draw({ name: "Mudkip", card: { key: "cc-1" } }).root.findAll((n) => n.props && n.props.style)[0].props.style;
    const b = draw({ name: "Other", card: { key: "cc-1" } }).root.findAll((n) => n.props && n.props.style)[0].props.style;
    eq(json(a), json(b), "the same card drew differently");
    let h = 0; for (const ch of "cc-1") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    eq(json(a), json({ "--h": h % 360, "--h2": (h >> 9) % 360 }), "not the prototype's hash");
  });
  test("what is not known is left blank, never guessed", () => {
    const t = flat(draw({ name: "", card: { key: "x" } }).root);
    eq(t, "◆ No picture yet");
  });
  test("a catalogue image still wins; a broken one falls back to the drawing", () => {
    const r = draw({ src: "/img/mudkip.png", name: "Mudkip", card: { key: "cc-1" } });
    const img = r.root.findAll((n) => n.type === "img")[0];
    assert(img, "the approved image was replaced");
    TR.act(() => { img.props.onError(); });
    assert(r.root.findAll((n) => n.props && String(n.props.className || "").split(" ").includes("mcs-ph")).length === 1, "a broken image left nothing");
  });
  test("without `card`, every other surface draws exactly as before", () => {
    eq(flat(draw({ name: "Mudkip" }).root), "Mudkip");
    assert(!draw({ name: "Mudkip" }).root.findAll((n) => n.props && /mcs-ph/.test(String(n.props.className || ""))).length);
  });
  test("the Binders tiles, the card sheet and the lifted card all ask for it", () => {
    const src = fs.readFileSync(path.join(ROOT, "client/collector/sections/Binder.jsx"), "utf8");
    eq((src.match(/card=\{phOf\(/g) || []).length, 3);
    assert(/\.mcs \.mcs-ph \{ --h:200; --h2:180;[^}]*inset 0 0 0 3px hsl\(48 70% 72%\)/.test(css()), "not the prototype's card face");
  });
});

/* ============================================================== E */
describe("E. the launcher: a busy port is an answer", () => {
  const LAUNCHER = path.join(ROOT, "harness/phase6-mobile-review.cjs");
  const launch = (port) => new Promise((resolve) => {
    execFile(process.execPath, [LAUNCHER, "--no-browser", "--port", String(port)], { timeout: 60000 },
      (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: stdout, err: stderr }));
  });
  const listen = (server) => new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port)));
  test("another program on the port: said plainly, exit 2, no stack trace", async () => {
    const other = net.createServer();
    const port = await listen(other);
    const r = await launch(port);
    other.close();
    eq(r.code, 2);
    assert(new RegExp(`Port ${port} is in use by another program`).test(r.out), r.out);
    assert(new RegExp(`--port ${port + 1}`).test(r.out), "no way forward offered");
    assert(!/EADDRINUSE|\n\s+at /.test(r.out + r.err), "a stack trace: " + r.err);
  });
  test("this review already running: recognised, and pointed at — never a second server", async () => {
    const { serve } = require("../harness/phase6-world.cjs");
    const ctx = await serve({ port: 0 });
    const port = Number(new URL(ctx.url).port);
    const r = await launch(port);
    ctx.server.close();
    eq(r.code, 0, r.out + r.err);
    assert(/A MetYet mobile review is already running at http:\/\/127\.0\.0\.1:\d+\/app \(build /.test(r.out), r.out);
    assert(!/EADDRINUSE|\n\s+at /.test(r.out + r.err), "a stack trace: " + r.err);
  });
});

run();
