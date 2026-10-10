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
const json = (v) => JSON.stringify(v);

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
      /* RESTATED (P6-F4 B1, founder decision 2026-10-10): on a phone, cards
         inside a binder's cover are the cover's width narrower than cards on
         the page, exactly as in the prototype — "follow the prototype" over
         P6-3.1's one size everywhere. Within each place, still one size; the
         cover costs exactly its own inset (1px border + 10px padding a side)
         and no more. From tablet up, one size everywhere, as before. */
      const same = (xs) => Math.max(...xs) - Math.min(...xs) <= 1;
      if (width < 600) {
        assert(same(inBinder) && same(inCards), `card sizes differ within a place: ${inBinder} | ${inCards}`);
        const cost = Math.max(...inCards) - Math.max(...inBinder);
        assert(cost >= 0 && cost <= 8, `the cover shrinks its cards by ${cost}px, more than its own inset: ${all}`);
      } else assert(same(all), `card sizes differ: ${all}`);
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

/* P6-F1: THE PHONE IS THE PROTOTYPE'S PHONE — through the real front door, on
   an emulated iPhone. Positions are measured from the top of the screen; the
   prototype's own numbers come from `npm run review:fidelity`. */
describe("mobile shell (P6-F1)", () => {
  const phone = async () => {
    const context = await browser.newContext({ ...PHONE });
    const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await signIn(page, ctx.url);
    await page.locator("nav[aria-label=Collector] button", { hasText: "Binders" }).tap();
    await page.waitForTimeout(500);
    return { page, context, errors };
  };
  const box = (page, q) => page.locator(q).first().boundingBox();
  test("the viewport is the phone: 390 × 844 at 3×, touch", async () => {
    await before();
    const { page, context } = await phone();
    eq(json(await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio, navigator.maxTouchPoints > 0])), json([390, 844, 3, true]));
    await context.close();
  });
  test("no account bar and no banner above the collection; the title is at the top", async () => {
    await before();
    const { page, context, errors } = await phone();
    eq(await page.locator(".mcs-top").isVisible(), false, "the account bar is on the phone");
    eq(await page.locator(".mcs-ro").isVisible(), false, "the banner is on the phone");
    eq(await page.evaluate(() => getComputedStyle(document.querySelector(".mcs")).backgroundColor), "rgb(255, 255, 255)", "the phone is not the prototype's white panel");
    const title = await box(page, ".mcs-hd h1");
    assert(title.y <= 24, `the title starts ${title.y}px down`);
    /* nothing tall sits between the top of the screen and the search box */
    const search = await box(page, ".mcs-bcontrols input");
    assert(search.y <= 60, `the search box starts ${search.y}px down (prototype: 54)`);
    eq(errors.length, 0, errors.join(" | ")); await context.close();
  });
  test("the collection is immediately visible: the first card is on screen, above the tab bar", async () => {
    await before();
    const { page, context } = await phone();
    const card = await box(page, "section[aria-label='Your Cards'] li.mcs-otile");
    const nav = await box(page, "nav[aria-label=Collector]");
    assert(card.y <= 300, `the first card starts at ${card.y}px (prototype: 268)`);
    assert(card.y + 60 < nav.y, "the first card is hidden behind the tab bar");
    await context.close();
  });
  test("four tabs on one line each, at least 44px tall, fixed to the bottom", async () => {
    await before();
    const { page, context } = await phone();
    const tabs = await page.locator("nav[aria-label=Collector] button").evaluateAll((els) => els.map((e) => {
      const l = e.querySelector(".l"); const r = document.createRange(); r.selectNodeContents(l);
      const lines = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size;
      const b = e.getBoundingClientRect(); return { text: l.textContent, lines, h: Math.round(b.height), clipped: l.scrollWidth > l.clientWidth + 1 };
    }));
    eq(tabs.map((t) => t.text).join(" · "), "Browse · Binders · Deal Flow · Trusted Partners");
    for (const t of tabs) { eq(t.lines, 1, `${t.text} wraps`); assert(t.h >= 44, `${t.text} is ${t.h}px tall`); eq(t.clipped, false, `${t.text} is clipped`); }
    const nav = await box(page, "nav[aria-label=Collector]");
    eq(Math.round(nav.y + nav.height), 844, "the tab bar is not at the bottom");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(200);
    const nav2 = await box(page, "nav[aria-label=Collector]");
    eq(Math.round(nav2.y), Math.round(nav.y), "the tab bar scrolled away");
    await context.close();
  });
  test("nothing is hidden behind the tab bar, and nothing scrolls sideways", async () => {
    await before();
    const { page, context } = await phone();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(250);
    const last = await page.locator("section[aria-label='Your Cards'] li.mcs-otile").last().boundingBox();
    const nav = await box(page, "nav[aria-label=Collector]");
    assert(last.y + last.height <= nav.y, `the last card ends at ${last.y + last.height}, under the tab bar at ${nav.y}`);
    eq(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "sideways scroll");
    await context.close();
  });
  test("every card without an approved picture is the prototype's drawn card", async () => {
    await before();
    const { page, context } = await phone();
    const tiles = await page.locator("section[aria-label='Your Cards'] li.mcs-otile").count();
    eq(await page.locator("section[aria-label='Your Cards'] li.mcs-otile .mcs-cardph").count(), tiles, "a tile is not the drawn card");
    const art = await box(page, "section[aria-label='Your Cards'] .mcs-cardph");
    assert(Math.abs(art.height / art.width - 88 / 63) < 0.03, "not card-shaped");
    eq(await page.evaluate(() => getComputedStyle(document.querySelector(".mcs-cardph")).backgroundImage.startsWith("linear-gradient")), true, "not the coloured card face");
    await context.close();
  });
  test("panel heads stay panel heads — Browse, Deal Flow and Trusted Partners (P6-F1 review fix)", async () => {
    await before();
    for (const opts of [{ ...PHONE }, { viewport: { width: 1280, height: 860 } }]) {
      const context = await browser.newContext(opts);
      const page = await context.newPage();
      await signIn(page, ctx.url);
      for (const tab of ["Browse", "Deal Flow", "Trusted Partners"]) {
        await page.locator("nav[aria-label=Collector] button", { hasText: tab }).click(); await page.waitForTimeout(300);
        for (const h of await page.locator("header.mcs-ph").all()) {
          const b = await h.boundingBox();
          const bg = await h.evaluate((e) => getComputedStyle(e).backgroundImage);
          assert(b.height < 80, `${tab} at ${opts.viewport.width}px: a panel head is ${Math.round(b.height)}px tall`);
          assert(!/gradient/.test(bg), `${tab} at ${opts.viewport.width}px: a panel head wears the card face`);
        }
      }
      await context.close();
    }
  });
  test("the notice: none on Binders; one line on Deal Flow; the account sheet has it all, and Sign out signs out", async () => {
    await before();
    const { page, context } = await phone();
    eq(await page.locator(".mcs-scope").count(), 0, "Binders carries a notice");
    await page.locator("nav[aria-label=Collector] button", { hasText: "Deal Flow" }).tap(); await page.waitForTimeout(300);
    const line = await box(page, ".mcs-scope");
    assert(line && line.height <= 40, "the Deal Flow notice is not one compact line");
    await page.locator("button.mcs-acct").tap();
    const sheet = page.locator("[role=dialog][aria-label=Account]");
    assert(/Casey/.test(await sheet.innerText()) && /trades and messages arrive later/.test(await sheet.innerText()), "the account sheet");
    await sheet.locator("button", { hasText: /^Sign out$/ }).tap();
    await page.locator("#metyet-email").waitFor({ timeout: 4000 });
    await context.close();
  });
  test("desktop is unchanged: the account bar and the banner are still there", async () => {
    await before();
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await context.newPage();
    await signIn(page, ctx.url);
    eq(await page.locator(".mcs-top").isVisible(), true);
    eq(await page.locator(".mcs-ro").isVisible(), true);
    eq(await page.locator("button.mcs-acct").isVisible(), false);
    await context.close();
  });
});

/* P6-F2: BROWSE, the Phase 6 discovery screen, through the real front door and
   the real catalogue, at four widths. Nothing it does may send a command. */
describe("Browse (P6-F2)", () => {
  const SIZES = [["390 (phone)", { ...PHONE }], ["360 (narrow phone)", { ...PHONE, viewport: { width: 360, height: 780 } }],
    ["768 (tablet)", { viewport: { width: 768, height: 1024 }, hasTouch: true }], ["1280 (desktop)", { viewport: { width: 1280, height: 860 } }]];
  for (const [label, opts] of SIZES) {
    test(`at ${label}: Pokédex → a Pokémon's cards → a card → back; a set; artists; search by name and number`, async () => {
      await before();
      const context = await browser.newContext(opts);
      const page = await context.newPage();
      const errors = []; page.on("pageerror", (e) => errors.push(e.message));
      const commands = []; page.on("request", (r) => { if (r.url().includes("/api/commands")) commands.push(r.url()); });
      await signIn(page, ctx.url);
      const tap = (loc) => (opts.hasTouch ? loc.tap() : loc.click());
      const wide = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      /* the landing: the Pokédex */
      await page.locator(".mcs-dtile").first().waitFor();
      /* 5 since P6-F3A: the review world also holds Mudkip (#258), the Stage 1 reference card */
      eq(await page.locator(".mcs-dtile").count(), 5, "the Pokédex");
      eq(await wide(), true, "sideways scroll on the landing");
      const tabs = await page.locator("nav[aria-label=Collector] button").evaluateAll((els) => els.map((e) => e.textContent.trim()));
      assert(tabs.join(" ").includes("Browse") && tabs.length === 4, "four tabs: " + tabs);
      /* a Pokémon → its cards */
      await tap(page.locator(".mcs-dtile[data-dex='25']"));
      await page.locator(".mcs-dchip", { hasText: "Pokémon: Pikachu" }).waitFor();
      await page.locator(".mcs-dcell").first().waitFor();
      eq(await page.locator(".mcs-dcell").count(), 2, "Pikachu's two cards");
      eq(await wide(), true, "sideways scroll on results");
      /* a card → the Phase 6 card, full screen (P6-F3A) → ‹ back to the same cards */
      await tap(page.locator(".mcs-dcell", { has: page.locator("text=Jungle") }).first());
      await page.locator(".mcs-cd").waitFor({ timeout: 4000 });
      await page.waitForTimeout(400); /* the prototype's .22s rise */
      const box = await page.locator(".mcs-cd").boundingBox();
      const vp = page.viewportSize();
      eq(json([Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)]), json([0, 0, vp.width, vp.height]), "the card is not full screen");
      eq((await page.locator(".mcs-cd-back").textContent()).trim(), "‹ Pikachu", "the card does not name where it came from");
      eq(await wide(), true, "sideways scroll on the card");
      await tap(page.locator(".mcs-cd-back"));
      await page.waitForTimeout(300);
      eq(await page.locator(".mcs-dchip", { hasText: "Pokémon: Pikachu" }).count(), 1, "the context was lost");
      eq(await page.locator(".mcs-dcell").count(), 2, "the cards were lost");
      /* a long set name in a two-column grid stays inside the screen */
      await tap(page.locator(".mcs-dchip.clearall"));
      await tap(page.locator(".mcs-dtile[data-dex='6']"));
      await page.locator(".mcs-dcell", { has: page.locator("text=Anniversary") }).first().waitFor();
      eq(await wide(), true, "a long set name pushed the grid sideways");
      /* a set */
      await tap(page.locator(".mcs-dchip.clearall"));
      await tap(page.locator(".mcs-dtabs button", { hasText: "Sets" }));
      await page.locator(".mcs-drow").first().waitFor();
      await tap(page.locator(".mcs-drow", { hasText: "Jungle" }));
      await page.locator(".mcs-dchip", { hasText: "Set: Jungle" }).waitFor();
      await page.locator(".mcs-dcell").first().waitFor();
      eq(await page.locator(".mcs-dcell").count(), 1);
      /* artists */
      await tap(page.locator(".mcs-dchip.clearall"));
      await tap(page.locator(".mcs-dtabs button", { hasText: "Artists" }));
      await page.locator(".mcs-drow", { hasText: "Ken Sugimori" }).waitFor();
      /* search: a name, then a number */
      await page.locator(".mcs-dsearch-in").fill("pika");
      await page.locator(".mcs-dsugg", { hasText: "Pikachu" }).waitFor();
      await page.locator(".mcs-dcell").first().waitFor();
      eq(await page.locator(".mcs-dcell").count(), 2, "name search");
      await page.locator(".mcs-dsearch-in").fill("25");
      await page.waitForTimeout(600);
      eq(json(await page.locator(".mcs-dcell").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))), json(["Pikachu, Jungle #25"]));
      eq(commands.length, 0, "browsing sent a command");
      eq(errors.length, 0, errors.join(" | "));
      await context.close();
    });
  }
  test("all four tabs still render after Browse's styles (phone)", async () => {
    await before();
    const context = await browser.newContext({ ...PHONE }); const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await signIn(page, ctx.url);
    for (const tab of ["Browse", "Binders", "Deal Flow", "Trusted Partners"]) {
      await page.locator("nav[aria-label=Collector] button", { hasText: tab }).tap(); await page.waitForTimeout(300);
      eq(await page.locator(".mcs-hd h1").innerText(), tab);
      eq(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${tab} scrolls sideways`);
      const acct = await page.locator("button.mcs-acct").boundingBox();
      assert(acct.x + acct.width >= 390 - 20, `${tab}: the account button is not at the right edge (${acct.x})`);
    }
    eq(errors.length, 0, errors.join(" | "));
    await context.close();
  });
});

/* P6-F3A STAGE 2 — LAST, BECAUSE IT WRITES. The Phase 6 card's own questions,
   through the real sign-in, store, server, commands and projection. */
describe("the Phase 6 card saves through production (P6-F3A Stage 2)", () => {
  test("a PC copy and a Primary Goal on Mudkip R&S #60: exact printing, no binder, remembered on reopening; a refusal claims nothing", async () => {
    await before();
    const context = await browser.newContext({ ...PHONE }); const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    const commands = []; page.on("request", (r) => { if (r.url().includes("/api/commands")) commands.push(JSON.parse(r.postData() || "{}").command); });
    await signIn(page, ctx.url);
    /* the two printings, by the catalogue's own ids */
    const api = async (u) => (await fetch(ctx.url + u, { headers: { authorization: "Bearer casey" } })).json();
    const rs60 = (await api("api/card-contexts?pokedex=258")).contexts.find((c) => c.collectorNumber === "60");
    const printings = (await api(`api/card-contexts/${rs60.cardContextId}`)).canonicalCards;
    const normal = printings.find((c) => c.finish === "non_holo").canonicalCardId;
    const reverse = printings.find((c) => c.finish === "reverse_holofoil").canonicalCardId;
    const w0 = await ctx.world();
    const choose = async (...titles) => { for (const t of titles) {
      await page.locator(".mcs-cd-choice", { has: page.locator("b", { hasText: new RegExp(`^${t.replace(/[/]/g, "\\/")}$`) }) }).first().tap();
      await page.waitForTimeout(120);
    } };
    const openSixty = async () => {
      const cell = page.locator("button.mcs-dcell[aria-label='Mudkip, Ruby & Sapphire #60']");
      await cell.scrollIntoViewIfNeeded(); await cell.tap(); await page.locator(".mcs-cd").waitFor(); await page.waitForTimeout(400);
    };
    await page.locator("nav[aria-label=Collector] button", { hasText: "Browse" }).tap();
    await page.locator(".mcs-dtile[data-dex='258']").tap();
    await page.locator(".mcs-dchip", { hasText: "Pokémon: Mudkip" }).waitFor();

    /* 1. Reverse Holo · Raw · Near Mint · I own it · PC (Stage 2.1 order) */
    await openSixty();
    await choose("Reverse Holo", "Raw", "Near Mint");
    eq(await page.locator(".mcs-cd-q[data-q=intent]").count(), 1, "the collecting state did not follow the physical card");
    await choose("I own it", "Personal collection");
    eq(commands.length, 0, "answering wrote something");
    const dock = await page.locator(".mcs-cd-dock").boundingBox();
    eq(Math.round(dock.y + dock.height), 844, "the dock is not pinned to the bottom");
    await page.locator(".mcs-cd-add").tap();
    await page.locator(".mcs-cd-add.added").waitFor();
    eq((await page.locator(".mcs-cd-hint.ack").innerText()).trim(), "Personal collection ✓ · Raw · Near Mint · Reverse Holo");
    await page.locator(".mcs-d-ack").waitFor();
    eq(await page.locator(".mcs-cd").count(), 0, "the card did not return to Browse");
    eq(await page.locator(".mcs-dchip", { hasText: "Pokémon: Mudkip" }).count(), 1, "the Browse context was lost");
    let w = await ctx.world();
    const copy = w.collectorCopies.filter((c) => !w0.collectorCopies.some((x) => x.id === c.id));
    eq(copy.length, 1, "not exactly one new copy");
    eq(json([copy[0].canonicalCardId, copy[0].grade, copy[0].condition, copy[0].keeping, copy[0].offered]), json([reverse, "Raw", "Near Mint", true, false]));
    eq(w.goals.length, w0.goals.length, "a copy made a Goal");
    eq(w.binderMemberships.some((m) => m.collectorCopyId === copy[0].id), false, "the copy was filed");

    /* 2. reopened: the projection has it */
    await openSixty();
    assert((await page.locator(".mcs-cd-remembered").innerText()).includes("Reverse Holo · You own it · Personal collection · Raw · Near Mint"),
      await page.locator(".mcs-cd-remembered").innerText());
    await page.screenshot({ path: "artifacts/f3a-stage2-remembered.png" }).catch(() => {});

    /* 3. Normal · Graded · PSA 10 · I'm looking for it · Primary */
    await choose("Normal", "Graded", "PSA 10", "I'm looking for it", "Primary");
    await page.locator(".mcs-cd-add").tap();
    await page.locator(".mcs-d-ack").waitFor();
    w = await ctx.world();
    const goal = w.goals.filter((g) => !w0.goals.some((x) => x.id === g.id));
    eq(goal.length, 1, "not exactly one new Goal");
    eq(json([goal[0].canonicalCardId, goal[0].tier, goal[0].desired]), json([normal, "primary", { grade: "PSA 10" }]));
    eq(w.collectorCopies.length, w0.collectorCopies.length + 1, "a Goal made a copy");
    eq(w.binderMemberships.some((m) => m.goalId === goal[0].id), false, "the Goal was filed");

    /* 4. a genuine refusal: the same Goal arrives from elsewhere while the card is open */
    await openSixty();
    await choose("Reverse Holo", "Raw", "Lightly Played", "I'm looking for it", "Secondary");
    await ctx.post("addGoal", { canonicalCardId: reverse, tier: "primary", desired: { grade: "PSA 9" } });
    await page.locator(".mcs-cd-add").tap();
    await page.locator(".mcs-cd-hint.problem").waitFor();
    eq((await page.locator(".mcs-cd-hint.problem").innerText()).trim(), "Nothing was saved: the goal could not be saved — That card is already on your list.");
    eq(await page.locator(".mcs-cd-add.added").count(), 0, "a refusal was shown as success");
    await page.waitForTimeout(1200);
    eq(await page.locator(".mcs-cd").count(), 1, "a refused card left as if added");
    w = await ctx.world();
    eq(w.goals.filter((g) => g.canonicalCardId === reverse).length, 1, "the refused Goal was written");
    eq(json(commands), json(["addCollectorCopy", "addGoal", "addGoal"]), "unexpected commands: " + json(commands));
    eq(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "sideways scroll");
    eq(errors.length, 0, errors.join(" | "));
    await context.close();
  });
});

if (!chromium) {
  console.log("SKIPPED: Playwright is not installed.");
} else {
  run().finally(async () => { if (browser) await browser.close(); if (ctx) ctx.server.close(); });
}
