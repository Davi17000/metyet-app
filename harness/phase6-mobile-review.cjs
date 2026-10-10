#!/usr/bin/env node
/* ============================================================================
   PHASE 6 — MOBILE REVIEW. `npm run review:mobile`

   Starts the seeded, production-connected world (harness/phase6-world.cjs:
   the real server and database, the real <SignIn/> front door) and opens a
   phone-sized Google Chrome window onto it, already emulating an iPhone:
   390 × 844 at 3×, touch input, the mobile flag. No DevTools needed. Sign in
   with any address and any code. Close the window or press Ctrl-C to stop.

     --port N        serve on N (default 8790)
     --no-browser    serve only, and print the address
     --shots DIR     headless: walk the P6-4 scenarios at 390px (and 1280px),
                     save screenshots to DIR, and exit

   A PORT THAT IS ALREADY TAKEN IS AN ANSWER, NOT A CRASH (P6-F1). Before
   starting, this asks the port who is there:
     this review, same build     → opens another phone window onto it
     this review, another build  → says which, and how to stop it or move
     anything else               → says the port is busy, and how to move

   This is Chrome EMULATING a phone. It is not Safari, not a real touchscreen,
   and has no real safe-area insets; a check on a physical iPhone is separate.
   ========================================================================== */
const fs = require("fs");
const path = require("path");
const net = require("net");
const http = require("http");
const { execFileSync } = require("child_process");
const { serve, PHONE, signIn, ROOT } = require("./phase6-world.cjs");

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1] || true; };
const port = Number(arg("--port")) || 8790;
const shots = arg("--shots");
const noBrowser = process.argv.includes("--no-browser");
const say = (lines) => console.log(lines.join("\n"));

/* ------------------------------------------------- who is on the port? */
const portOpen = (p) => new Promise((resolve) => {
  const s = net.connect({ port: p, host: "127.0.0.1" });
  s.once("connect", () => { s.destroy(); resolve(true); });
  s.once("error", () => resolve(false));
  s.setTimeout(800, () => { s.destroy(); resolve(false); });
});
const get = (url) => new Promise((resolve) => {
  const req = http.get(url, { timeout: 1500 }, (res) => {
    let body = ""; res.on("data", (d) => { body += d; });
    res.on("end", () => resolve({ status: res.statusCode, type: res.headers["content-type"] || "", body }));
  });
  req.on("error", () => resolve(null)); req.on("timeout", () => { req.destroy(); resolve(null); });
});
async function whoIsOn(p) {
  if (!(await portOpen(p))) return { kind: "free" };
  const r = await get(`http://127.0.0.1:${p}/__review`);
  if (r && /json/.test(r.type)) {
    try { const j = JSON.parse(r.body); if (j.kind === "metyet-mobile-review") return { ...j, kind: "review" }; } catch (e) { /* not ours */ }
  }
  /* a review from before it could name its build still serves the app page */
  const app = await get(`http://127.0.0.1:${p}/app`);
  if (app && /\/app\.js/.test(app.body)) return { kind: "review", commit: null };
  return { kind: "other" };
}
const here = () => {
  try { return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch (e) { return null; }
};

/* ------------------------------------------------- a phone window */
/* The emulated window is a second instance of the SAME Google Chrome app the
   reviewer uses every day — same name, same Dock icon — so it can open behind
   their own windows (P6-F1 review: exactly what happened). Bring THAT process
   forward, by its process id; macOS may refuse, and that is said, not hidden. */
function bringForward(browserPid) {
  if (process.platform !== "darwin" || !browserPid) return false;
  try {
    execFileSync("osascript", ["-e", `tell application "System Events" to set frontmost of (first process whose unix id is ${browserPid}) to true`], { stdio: "ignore", timeout: 4000 });
    return true;
  } catch (e) { return false; }
}
const chromePidUnder = (parent) => {
  try {
    return execFileSync("ps", ["-axo", "pid=,ppid=,comm="], { encoding: "utf8" }).split("\n").map((l) => l.trim().split(/\s+/))
      .filter(([pid, ppid, ...c]) => Number(ppid) === parent && /Google Chrome$/.test(c.join(" "))).map(([pid]) => Number(pid))[0] || null;
  } catch (e) { return null; }
};
async function openPhone(url, hooks = null) {
  let chromium = null;
  try { ({ chromium } = require("playwright")); } catch (e) { chromium = null; }
  if (!chromium) { say(["", "Playwright is not installed, so no phone window can be opened.", `Open ${url} in a browser's device mode instead.`]); return null; }
  /* The window is sized to the phone, so what you see is the phone. */
  const browser = await chromium.launch({ channel: "chrome", headless: false, args: ["--window-size=430,960", "--window-position=60,40"] });
  const context = await browser.newContext({ ...PHONE });
  const page = await context.newPage();
  await page.goto(url);
  await page.bringToFront();
  const forward = bringForward(chromePidUnder(process.pid));
  /* The window reports on itself, through the review server, so what it is
     actually doing can be checked — and photographed — from outside. */
  if (hooks) {
    hooks.session = async () => ({ url: page.url(), ...(await page.evaluate(() => ({ innerWidth, innerHeight, devicePixelRatio,
      maxTouchPoints: navigator.maxTouchPoints, pointerCoarse: matchMedia("(pointer: coarse)").matches,
      phoneLayout: !matchMedia("(min-width:860px)").matches, userAgent: navigator.userAgent }))), broughtForward: forward });
    hooks.screenshot = () => page.screenshot();
  }
  return { browser, forward };
}

function tellWindow(forward) {
  say(["  A phone-sized Chrome window is open, emulating an iPhone (390 × 844, touch). It is not Safari on a real iPhone.",
    forward ? "  It has been brought to the front."
      : "  It may be BEHIND your other windows: it is a second Google Chrome — look for a second Chrome icon in the Dock, or use the phone address above.",
    "  Close that window, or press Ctrl-C here, to stop.", ""]);
}

async function main() {
  if (shots) return runShots();
  const url = `http://127.0.0.1:${port}/app`;
  const there = await whoIsOn(port);
  if (there.kind === "review") {
    const mine = here();
    if (there.commit && there.commit === mine) {
      say([`A MetYet mobile review is already running at ${url} (build ${there.commit}, started ${there.startedAt}).`,
        `In any browser, the phone layout:   http://127.0.0.1:${port}/phone`,
        noBrowser ? "Or run without --no-browser for an emulated phone window onto it." : "Opening another emulated phone window onto it."]);
      if (!noBrowser) { const o = await openPhone(url); if (o) { tellWindow(o.forward); o.browser.on("disconnected", () => process.exit(0)); } }
      return;
    }
    say([`Port ${port} already has a MetYet mobile review running, from ${there.commit ? `build ${there.commit}` : "an older build"} — this checkout is ${mine || "unknown"}.`,
      "To review this checkout, stop that one (press Ctrl-C in the terminal that started it) and run this again,",
      `or run this one beside it:   npm run review:mobile -- --port ${port + 1}`]);
    process.exitCode = 2; return;
  }
  if (there.kind === "other") {
    say([`Port ${port} is in use by another program.`, `Run the review on another port:   npm run review:mobile -- --port ${port + 1}`]);
    process.exitCode = 2; return;
  }
  let ctx;
  try { ctx = await serve({ port }); } catch (e) {
    if (e && e.code === "EADDRINUSE") {
      say([`Port ${port} was taken a moment ago by something else.`, `Run the review on another port:   npm run review:mobile -- --port ${port + 1}`]);
      process.exitCode = 2; return;
    }
    throw e;
  }
  const phoneUrl = `http://127.0.0.1:${port}/phone`;
  say(["", "MetYet mobile review — build " + (ctx.build.commit || "unknown") + (ctx.build.dirty ? " (with uncommitted changes)" : ""),
    "  Sign in with any email address and any code.",
    `  In any browser, the phone layout:   ${phoneUrl}`,
    `  (Don't open ${url} in your everyday browser window — at desktop width that is, correctly, the desktop layout.)`, ""]);
  if (noBrowser) return;  // keep serving
  const opened = await openPhone(url, ctx.hooks);
  if (opened) { tellWindow(opened.forward); opened.browser.on("disconnected", () => { ctx.server.close(); process.exit(0); }); }
}

/* ------------------------------------------------- --shots */
async function runShots() {
  const { chromium } = require("playwright");
  const ctx = await serve({ port: 0 });
  console.log(`MetYet mobile review (shots): ${ctx.url}app`);
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  const shoot = async (page, name) => { await page.screenshot({ path: path.join(shots, `${name}.png`) }); console.log(`  ${name}.png`); };
  const walk = async (label, contextOptions) => {
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    const tap = (loc) => (contextOptions.hasTouch ? loc.tap() : loc.click());
    await signIn(page, ctx.url);
    await tap(page.locator("nav[aria-label=Collector] button", { hasText: "Binders" })); await page.waitForTimeout(600);
    await shoot(page, `${label}-1-binders`);
    const cardOf = (re) => page.locator("section[aria-label='Your Cards'] li.mcs-otile").filter({ hasText: re }).locator("button.mcs-otap");
    await cardOf(/Venusaur/).scrollIntoViewIfNeeded(); await tap(cardOf(/Venusaur/)); await page.waitForTimeout(400);
    await shoot(page, `${label}-2-goal-sheet`);
    await tap(page.locator("[role=dialog] button[data-meaning=primary]"));
    await page.locator("text=✓ Now Primary").waitFor({ timeout: 4000 });
    await shoot(page, `${label}-3-goal-now-primary`);
    /* aria-disabled, not disabled: a person can still tap it, and the tap is what explains */
    const across = page.locator("[role=dialog] button[data-meaning=pc]");
    await (contextOptions.hasTouch ? across.tap({ force: true }) : across.click({ force: true })); await page.waitForTimeout(300);
    await shoot(page, `${label}-4-goal-across-explained`);
    await tap(page.locator("[role=dialog] button[aria-label=Close]")); await page.waitForTimeout(300);
    await cardOf(/Pikachu/).scrollIntoViewIfNeeded(); await tap(cardOf(/Pikachu/)); await page.waitForTimeout(400);
    await shoot(page, `${label}-5-copy-sheet`);
    await tap(page.locator("[role=dialog] button[data-meaning=pc]"));
    await page.locator("text=✓ Now PC").waitFor({ timeout: 4000 });
    await tap(page.locator("[role=dialog] button", { hasText: /^Move to another binder$/ })); await page.waitForTimeout(250);
    await shoot(page, `${label}-6-copy-move`);
    await tap(page.locator("[role=dialog] button.mcs-ochoice", { hasText: /^Gen 1$/ }));
    await page.locator(".mcs-snack", { hasText: "Pikachu is filed in Gen 1." }).waitFor({ timeout: 4000 });
    await shoot(page, `${label}-7-filed-bar-over-sheet`);
    await tap(page.locator("[role=dialog] button.mcs-omore")); await page.locator("[role=dialog] .mcs-detail-facts").scrollIntoViewIfNeeded();
    await shoot(page, `${label}-8-copy-details`);
    await tap(page.locator("[role=dialog] button[aria-label=Close]")); await page.waitForTimeout(300);
    await shoot(page, `${label}-9-bar-with-undo`);
    await tap(page.locator(".mcs-snack button.mcs-undo"));
    await page.locator(".mcs-snack", { hasText: "Put back" }).waitFor({ timeout: 4000 });
    await shoot(page, `${label}-10-undone`);
    console.log(`  ${label}: page errors ${errors.length ? errors.join(" | ") : "none"}`);
    await context.close();
  };
  await walk("p64-mobile-390", PHONE);
  /* scenario changes above are saved; reverse them so the desktop walk starts from the same story */
  await ctx.post("updateGoalTier", { goalId: ctx.ids.goal2, tier: "secondary" });
  await ctx.post("setCollectorCopyOffered", { copyId: ctx.ids.copy2, offered: true });
  await walk("p64-desktop-1280", { viewport: { width: 1280, height: 860 } });
  await browser.close(); ctx.server.close();
}

if (require.main === module) {
  main().catch((e) => { console.error(`MetYet mobile review could not start: ${e.message.split("\n")[0]}`); process.exit(1); });
}
module.exports = { whoIsOn };
