/* ============================================================================
   PHASE 6 P6-3 — FILING IN A REAL BROWSER
   The same gestures as phase6-p63-filing.cjs, performed by Google Chrome
   (driven by Playwright) on the real Collector shell, talking to the real
   server (createApp: auth, allow-list, command transaction, domain) over
   in-process PGlite with every migration — and every outcome is checked in
   the database, not on the screen alone.
     mouse   a click opens; press-and-drag files; Cancel / Escape / letting go
             over nothing write nothing
     touch   a 450ms hold then a drag files; a quick swipe is a scroll
     layout  at 390px every destination sits above the tab bar
   Needs Google Chrome installed (Playwright's "chrome" channel). Run with
   `npm run ux:filing-browser`. It lives in harness/, beside the other
   browser-driven review tooling, because tests/all.cjs must not depend on a
   browser being installed — and every file in tests/ must run there.
   ========================================================================== */
const { describe, test, assert, eq, run } = require("../tests/run.cjs");

let chromium = null;
try { ({ chromium } = require("playwright")); } catch (e) { chromium = null; }
const { serve, PHONE, signIn } = require("./phase6-world.cjs");

let ctx = null; let browser = null;
const before = async () => {
  if (!ctx) ctx = await serve();
  if (!browser) browser = await chromium.launch({ channel: "chrome" });
};
async function open({ width = 1280, height = 900, touch = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(ctx.url); await page.waitForTimeout(800);
  await page.locator("nav[aria-label=Collector] button", { hasText: "Binders" }).click();
  await page.waitForTimeout(600);
  return { page, context, errors };
}
const tileArt = (page, re) => page.locator("section[aria-label='Your Cards'] li.mcs-otile").filter({ hasText: re }).locator("button.mcs-otap");
const centre = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const homeOf = async (key, id) => ((await ctx.memberships()).find((m) => m[key] === id) || {}).binderId || null;

describe("mouse", () => {
  test("a click opens the card and files nothing", async () => {
    await before();
    const { page, context, errors } = await open();
    const was = await homeOf("goalId", ctx.ids.goal);
    await tileArt(page, /Charizard/).click();
    await page.waitForTimeout(500);
    /* RESTATED (P6-4): the card's own sheet. */
    assert(await page.locator("[role=dialog][aria-label='Card: Charizard']").count(), "the card did not open");
    eq(await page.locator("[aria-label='Where should this go?']").count(), 0, "a click started filing");
    eq(await homeOf("goalId", ctx.ids.goal), was, "a click filed something");
    eq(errors.length, 0, errors.join(" | ")); await context.close();
  });
  test("press, drag to a binder, release: filed — in the database", async () => {
    await before();
    const { page, context, errors } = await open();
    const from = await centre(tileArt(page, /Blastoise/));
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(from.x + 30, from.y + 10, { steps: 4 });
    const dest = page.locator("[data-dest]").filter({ hasText: "Gen 1" });
    assert(await dest.count(), "no filing layer");
    const to = await centre(dest);
    await page.mouse.move(to.x, to.y, { steps: 8 });
    assert(/over/.test(await dest.getAttribute("class")), "the destination was not marked");
    await page.mouse.up(); await page.waitForTimeout(900);
    eq(await homeOf("collectorCopyId", ctx.ids.copy), ctx.ids.gen1, "not filed");
    assert(await page.locator("text=Blastoise is filed in Gen 1.").count(), "no confirmation");
    eq(errors.length, 0, errors.join(" | ")); await context.close();
  });
  for (const [label, finish] of [
    ["released on Cancel", async (page) => { const c = await centre(page.locator("[data-dest=cancel]")); await page.mouse.move(c.x, c.y, { steps: 6 }); await page.mouse.up(); }],
    ["Escape", async (page) => { await page.keyboard.press("Escape"); await page.mouse.up(); }],
    ["released over nothing", async (page) => { await page.mouse.move(5, 5, { steps: 6 }); await page.mouse.up(); }],
  ]) {
    test(`a drag ${label} writes nothing`, async () => {
      await before();
      const { page, context } = await open();
      const was = await homeOf("goalId", ctx.ids.goal);
      const n = (await ctx.memberships()).length;
      const from = await centre(tileArt(page, /Charizard/));
      await page.mouse.move(from.x, from.y); await page.mouse.down();
      await page.mouse.move(from.x + 30, from.y + 10, { steps: 4 });
      assert(await page.locator("[aria-label='Where should this go?']").count(), "no filing layer");
      await finish(page); await page.waitForTimeout(600);
      eq(await page.locator("[aria-label='Where should this go?']").count(), 0, "the layer stayed");
      eq(await homeOf("goalId", ctx.ids.goal), was, "membership moved");
      eq((await ctx.memberships()).length, n, "a membership appeared");
      await context.close();
    });
  }
});

describe("touch, at phone width", () => {
  const touchAt = async (cdp, type, x, y) => cdp.send("Input.dispatchTouchEvent",
    { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  test("hold, then drag to Unfiled: unfiled — in the database", async () => {
    await before();
    const { page, context, errors } = await open({ width: 390, height: 844, touch: true });
    const cdp = await context.newCDPSession(page);
    assert(await homeOf("goalId", ctx.ids.goal), "the fixture's Goal is not filed");
    await tileArt(page, /Charizard/).scrollIntoViewIfNeeded();
    const from = await centre(tileArt(page, /Charizard/));
    await touchAt(cdp, "touchStart", from.x, from.y);
    await page.waitForTimeout(650);
    assert(await page.locator("[aria-label='Where should this go?']").count(), "the hold did not pick it up");
    const to = await centre(page.locator("[data-dest=unfiled]"));
    for (let i = 1; i <= 8; i += 1) {
      await touchAt(cdp, "touchMove", from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
    }
    await touchAt(cdp, "touchEnd", to.x, to.y); await page.waitForTimeout(900);
    eq(await homeOf("goalId", ctx.ids.goal), null, "not unfiled");
    eq(errors.length, 0, errors.join(" | ")); await context.close();
  });
  test("a quick swipe is a scroll, not a pick-up", async () => {
    await before();
    const { page, context } = await open({ width: 390, height: 844, touch: true });
    const cdp = await context.newCDPSession(page);
    const from = await centre(tileArt(page, /Blastoise/));
    await touchAt(cdp, "touchStart", from.x, from.y);
    for (let i = 1; i <= 6; i += 1) await touchAt(cdp, "touchMove", from.x, from.y - i * 15);
    await page.waitForTimeout(650);
    eq(await page.locator("[aria-label='Where should this go?']").count(), 0, "a swipe picked up a card");
    await touchAt(cdp, "touchEnd", from.x, from.y - 90);
    await context.close();
  });
  test("every destination is above the tab bar and reachable", async () => {
    await before();
    const { page, context } = await open({ width: 390, height: 844 });
    const from = await centre(tileArt(page, /Blastoise/));
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y, { steps: 3 });
    for (const d of await page.locator("[data-dest]").all()) {
      const c = await centre(d);
      const top = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return el && el.closest("[data-dest]") ? el.closest("[data-dest]").getAttribute("data-dest") : null; }, c);
      eq(top, await d.getAttribute("data-dest"), "a destination is covered");
    }
    await page.keyboard.press("Escape"); await page.mouse.up();
    await context.close();
  });
});

/* P6-3.1: a binder opens IN PLACE, and its cards are the same cards — the
   same size as everywhere else, held and dropped the same way. */
describe("an expanded binder (P6-3.1)", () => {
  const expand = async (page, name) => {
    const sec = page.locator("button.mcs-sechead", { hasText: /^Binders/ });
    if ((await sec.getAttribute("aria-expanded")) === "false") await sec.click();
    const row = page.locator("button.mcs-bhead", { hasText: name });
    if ((await row.getAttribute("aria-expanded")) === "false") await row.click();
    await page.waitForTimeout(400);
    return page.locator(".mcs-bcover.open");
  };
  test("a card dragged out of an expanded binder files — in the database", async () => {
    await before();
    const { page, context, errors } = await open();
    const open1 = await expand(page, "Gen 1");
    eq(await page.locator("button", { hasText: /^Open Gen 1/ }).count(), 0, "a second step to open it");
    /* By now the mouse tests have filed Blastoise in Gen 1 (and the touch
       test has taken Charizard out). */
    eq(await homeOf("collectorCopyId", ctx.ids.copy), ctx.ids.gen1, "the fixture's copy is not in Gen 1");
    const art = open1.locator("li.mcs-otile").filter({ hasText: /Blastoise/ }).locator("button.mcs-otap");
    eq(await art.count(), 1, "its card is not there at once");
    const from = await centre(art);
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(from.x + 30, from.y + 10, { steps: 4 });
    const to = await centre(page.locator("[data-dest]").filter({ hasText: "Favourites" }));
    await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(900);
    eq(await homeOf("collectorCopyId", ctx.ids.copy), ctx.ids.mud, "not filed");
    assert(await page.locator("text=Blastoise is filed in Favourites.").count(), "no confirmation");
    eq(errors.length, 0, errors.join(" | ")); await context.close();
  });
  for (const [width, height] of [[390, 844], [768, 1024], [1280, 860], [1920, 1080]]) {
    test(`at ${width}px: one card size, no stretching, no sideways scroll`, async () => {
      await before();
      const { page, context, errors } = await open({ width, height });
      const opened = await expand(page, "Favourites");
      const inBinder = await opened.locator("li.mcs-otile").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
      const inCards = await page.locator("section[aria-label='Your Cards'] li.mcs-otile").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
      assert(inBinder.length >= 1, "the binder's cards are not shown");
      const all = [...inBinder, ...inCards];
      assert(Math.max(...all) - Math.min(...all) <= 1, `card sizes differ: ${all}`);
      if (width >= 768) assert(Math.max(...all) <= 152, `a card was stretched to ${Math.max(...all)}px`);
      const art = await opened.locator("li.mcs-otile .mcs-otile-art").first().boundingBox();
      assert(art.height > art.width, "the artwork is not the tile's dominant, card-shaped part");
      eq(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "sideways scroll");
      eq(errors.length, 0, errors.join(" | ")); await context.close();
    });
  }
  test("the card sheet at phone width: its binder choice and Close in reach", async () => {
    /* RESTATED (P6-4): a tap opens the card's sheet; Details is gone. */
    await before();
    const { page, context } = await open({ width: 390, height: 844 });
    const opened = await expand(page, "Favourites");
    await opened.locator("li.mcs-otile button.mcs-otap").first().click(); await page.waitForTimeout(300);
    for (const loc of [page.locator("[role=dialog] button", { hasText: /^(Move to another binder|Put in a binder)$/ }),
      page.locator("[role=dialog] button[aria-label=Close]")]) {
      await loc.scrollIntoViewIfNeeded();
      const c = await centre(loc);
      assert(c.y < 844, "out of reach below the screen");
      eq(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y).closest("[role=dialog]"), c), true, "covered");
    }
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    eq(await page.locator("[role=dialog]").count(), 0, "Escape did not close it");
    await context.close();
  });
});

/* P6-4: THE MOBILE ACCEPTANCE SCENARIOS, through the real front door (<SignIn/>
   and every production binding) on an emulated phone — touch input, 390 × 844
   at 3×, the mobile flag. Every outcome is read back from the database. This
   is Chrome emulating a phone, not a phone. */
describe("mobile, through the real front door (P6-4)", () => {
  const phone = async () => {
    const context = await browser.newContext({ ...PHONE });
    const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await signIn(page, ctx.url);
    await page.tap("nav[aria-label=Collector] button:has-text('Binders')");
    await page.waitForTimeout(500);
    return { page, context, errors, cdp: await context.newCDPSession(page) };
  };
  const card = (page, re) => page.locator("section[aria-label='Your Cards'] li.mcs-otile").filter({ hasText: re }).locator("button.mcs-otap");
  const tapCard = async (page, re) => { await card(page, re).scrollIntoViewIfNeeded(); await card(page, re).tap(); await page.waitForTimeout(350); };
  const state = (page, m) => page.locator(`[role=dialog] button[data-meaning=${m}]`);
  const goalOf = async (id) => (await ctx.world()).goals.find((g) => g.id === id) || null;
  const copyOf = async (id) => (await ctx.world()).collectorCopies.find((c) => c.id === id) || null;
  const touch = (cdp, type, x, y) => cdp.send("Input.dispatchTouchEvent",
    { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });

  test("A. a Goal: tap opens it, Secondary → Primary, confirmed and saved", async () => {
    await before();
    const { page, context, errors } = await phone();
    await tapCard(page, /Venusaur/);
    assert(await page.locator("[role=dialog][aria-label='Card: Venusaur']").count(), "a tap did not open the card");
    eq(await page.locator("[aria-label='Where should this go?']").count(), 0, "a tap started filing");
    eq(await state(page, "secondary").getAttribute("aria-pressed"), "true", "it did not open on its tier");
    const home = await homeOf("goalId", ctx.ids.goal2);
    await state(page, "primary").tap();
    await page.locator("text=✓ Now Primary").waitFor({ timeout: 4000 });
    eq((await goalOf(ctx.ids.goal2)).tier, "primary", "not saved");
    eq(await homeOf("goalId", ctx.ids.goal2), home, "its binder moved");
    eq(await state(page, "primary").getAttribute("aria-pressed"), "true");
    eq(errors.length, 0, errors.join(" | ")); await context.close();
  });
  test("B. an owned copy: Trade / Sell → PC, confirmed and saved", async () => {
    await before();
    const { page, context, errors } = await phone();
    await tapCard(page, /Pikachu/);
    eq(await state(page, "trade").getAttribute("aria-pressed"), "true");
    await state(page, "pc").tap();
    await page.locator("text=✓ Now PC").waitFor({ timeout: 4000 });
    const c = await copyOf(ctx.ids.copy2);
    eq([c.keeping === true, c.offered === true].join(), "true,false", "not saved as PC");
    eq(errors.length, 0, errors.join(" | ")); await context.close();
  });
  test("C. binder independence: state changes keep the binder; a move keeps the state", async () => {
    await before();
    const { page, context, errors } = await phone();
    await tapCard(page, /Pikachu/);
    await state(page, "trade").tap();
    await page.locator("text=✓ Now Trade / Sell").waitFor({ timeout: 4000 });
    eq(await homeOf("collectorCopyId", ctx.ids.copy2), ctx.ids.mud, "the state change moved its binder");
    await page.locator("[role=dialog] button", { hasText: /^Move to another binder$/ }).tap();
    await page.locator("[role=dialog] button.mcs-ochoice", { hasText: /^Gen 1$/ }).tap();
    await page.waitForTimeout(900);
    eq(await homeOf("collectorCopyId", ctx.ids.copy2), ctx.ids.gen1, "not moved");
    eq((await copyOf(ctx.ids.copy2)).offered, true, "the move changed its state");
    assert(await page.locator("[role=dialog] .mcs-ohome", { hasText: "In Gen 1" }).count(), "the sheet did not follow");
    eq(errors.length, 0, errors.join(" | ")); await context.close();
  });
  test("D. hold, drag, release; the bar confirms above the tab bar; Undo without opening the card", async () => {
    await before();
    const { page, context, errors, cdp } = await phone();
    const from0 = await homeOf("collectorCopyId", ctx.ids.copy2);
    await card(page, /Pikachu/).scrollIntoViewIfNeeded();
    const from = await centre(card(page, /Pikachu/));
    await touch(cdp, "touchStart", from.x, from.y);
    await page.waitForTimeout(650);
    assert(await page.locator("[aria-label='Where should this go?']").count(), "the hold did not pick it up");
    const to = await centre(page.locator("[data-dest]").filter({ hasText: "Favourites" }));
    for (let i = 1; i <= 8; i += 1) await touch(cdp, "touchMove", from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
    await touch(cdp, "touchEnd", to.x, to.y);
    await page.locator(".mcs-snack", { hasText: "Pikachu is filed in Favourites." }).waitFor({ timeout: 4000 });
    eq(await homeOf("collectorCopyId", ctx.ids.copy2), ctx.ids.mud, "not filed");
    eq(await page.locator("[role=dialog]").count(), 0, "a sheet was opened");
    const bar = await page.locator(".mcs-snack").boundingBox();
    const nav = await page.locator("nav[aria-label=Collector]").boundingBox();
    assert(bar.y + bar.height <= nav.y, `the bar overlaps the tab bar (${bar.y + bar.height} > ${nav.y})`);
    const navHit = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y).closest("nav"), { x: nav.x + nav.width / 2, y: nav.y + nav.height / 2 });
    eq(navHit, true, "the bar blocks the tab bar");
    await page.locator(".mcs-snack button.mcs-undo").tap();
    await page.locator(".mcs-snack", { hasText: "Put back" }).waitFor({ timeout: 4000 });
    eq(await homeOf("collectorCopyId", ctx.ids.copy2), from0, "Undo did not put it back");
    eq(errors.length, 0, errors.join(" | ")); await context.close();
  });
  test("E. a stale card: refused, said, never shown as done", async () => {
    await before();
    const { page, context, errors } = await phone();
    await tapCard(page, /Venusaur/);
    await ctx.post("removeGoal", { goalId: ctx.ids.goal2 });   // changed elsewhere, behind the open sheet
    await state(page, "secondary").tap();
    await page.waitForTimeout(1200);
    eq(await page.locator("text=✓ Now Secondary").count(), 0, "success shown for a refused change");
    eq(await goalOf(ctx.ids.goal2), null);
    eq(await page.locator("[role=dialog][aria-label='Card: Venusaur']").count(), 0, "the sheet still shows a Goal the server no longer has");
    assert(await page.locator(".mcs-snack.warn", { hasText: "changed since the screen was drawn" }).count(), "the refusal was not said");
    eq(await page.locator("section[aria-label='Your Cards'] li.mcs-otile").filter({ hasText: /Venusaur/ }).count(), 0, "the screen was not re-read");
    eq(errors.length, 0, errors.join(" | ")); await context.close();
  });
});

if (!chromium) {
  console.log("SKIPPED: Playwright is not installed.");
} else {
  run().finally(async () => { if (browser) await browser.close(); if (ctx) ctx.server.close(); });
}
