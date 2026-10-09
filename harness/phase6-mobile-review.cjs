#!/usr/bin/env node
/* ============================================================================
   PHASE 6 — MOBILE REVIEW (P6-4). `npm run review:mobile`

   Starts the seeded, production-connected world (harness/phase6-world.cjs:
   the real server and database, the real <SignIn/> front door) and opens
   Google Chrome as a phone — 390 × 844 at 3×, touch input, the mobile flag.
   Sign in with any address and any code. Close the window or press Ctrl-C to
   stop.

     --port N        serve on N (default 8790); the URL is printed either way
     --no-browser    serve only — open http://127.0.0.1:N/app yourself, e.g.
                     in Chrome DevTools' device mode, or on a phone on the
                     same network after changing the bind address
     --shots DIR     headless: walk the P6-4 scenarios at 390px (and the
                     desktop regression at 1280px), save screenshots to DIR,
                     and exit

   This is Chrome EMULATING a phone. It is not Safari, not a real touchscreen,
   and has no real safe-area insets; a check on a physical device is separate.
   ========================================================================== */
const fs = require("fs");
const path = require("path");
const { serve, PHONE, signIn } = require("./phase6-world.cjs");

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1] || true; };
const port = Number(arg("--port")) || 8790;
const shots = arg("--shots");

(async () => {
  let chromium = null;
  try { ({ chromium } = require("playwright")); } catch (e) { chromium = null; }
  const ctx = await serve({ port: shots ? 0 : port });
  const url = `${ctx.url}app`;
  console.log(`MetYet mobile review: ${url}  (sign in with any address and any code)`);

  if (shots) {
    if (!chromium) throw new Error("Playwright is not installed");
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
    return;
  }

  if (process.argv.includes("--no-browser") || !chromium) {
    if (!chromium) console.log("Playwright is not installed: open the URL in a browser's device mode.");
    return;  // keep serving
  }
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  const context = await browser.newContext({ ...PHONE });
  const page = await context.newPage();
  await page.goto(url);
  browser.on("disconnected", () => { ctx.server.close(); process.exit(0); });
})().catch((e) => { console.error(e.message); process.exit(1); });
