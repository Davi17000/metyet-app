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
    /* RESTATED (P6-4, then P6-F4 B2B): the saved card's own page. */
    assert(await page.locator("[role=dialog][aria-label='Your Goal: Charizard']").count(), "the card did not open");
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
  /* RESTATED (P6-4, then P6-F4 B2B): the saved card's full-screen page — Move and ‹ Binders in reach */
  test("the card page at phone width: Move and ‹ Binders in reach; Escape closes", async () => {
    await before();
    const { page, context } = await open({ width: 390, height: 844 });
    const opened = await expand(page, "Favourites");
    await opened.locator("li.mcs-otile button.mcs-otap").first().click(); await page.waitForTimeout(300);
    for (const loc of [page.locator("[role=dialog] button", { hasText: /^Move$/ }),
      page.locator("[role=dialog] button.mcs-cd-back")]) {
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
  /* RESTATED (P6-F4 B2B): the page's state choices, saved with Save changes */
  const state = (page, m) => page.locator(`[role=dialog] button[data-st=${m}]`);
  const saveChanges = async (page) => { await page.locator("[role=dialog] button.mcs-cd-add").tap(); await page.locator("[role=dialog] .mcs-cd-hint.ack").waitFor({ timeout: 4000 }); };
  const goalOf = async (id) => (await ctx.world()).goals.find((g) => g.id === id) || null;
  const copyOf = async (id) => (await ctx.world()).collectorCopies.find((c) => c.id === id) || null;
  const touch = (cdp, type, x, y) => cdp.send("Input.dispatchTouchEvent",
    { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });

  test("A. a Goal: tap opens it, Secondary → Primary, confirmed and saved", async () => {
    await before();
    const { page, context, errors } = await phone();
    await tapCard(page, /Venusaur/);
    assert(await page.locator("[role=dialog][aria-label='Your Goal: Venusaur']").count(), "a tap did not open the card");
    eq(await page.locator("[aria-label='Where should this go?']").count(), 0, "a tap started filing");
    eq(await state(page, "secondary").getAttribute("aria-pressed"), "true", "it did not open on its tier");
    const home = await homeOf("goalId", ctx.ids.goal2);
    await state(page, "primary").tap();
    eq(await page.locator("[role=dialog] button.mcs-cd-add").getAttribute("aria-disabled"), "false");
    eq((await goalOf(ctx.ids.goal2)).tier, "secondary", "choosing saved something before Save");
    await saveChanges(page);
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
    await saveChanges(page);
    const c = await copyOf(ctx.ids.copy2);
    eq([c.keeping === true, c.offered === true].join(), "true,false", "not saved as PC");
    eq(errors.length, 0, errors.join(" | ")); await context.close();
  });
  test("C. binder independence: state changes keep the binder; a move keeps the state", async () => {
    await before();
    const { page, context, errors } = await phone();
    await tapCard(page, /Pikachu/);
    await state(page, "trade").tap();
    await saveChanges(page);
    eq(await homeOf("collectorCopyId", ctx.ids.copy2), ctx.ids.mud, "the state change moved its binder");
    /* RESTATED (P6-F4 B2A): Move, then the destination in its chooser */
    await page.locator("[role=dialog] button", { hasText: /^Move$/ }).tap();
    await page.locator("[role=dialog][aria-label='Where should this go?'] button.mcs-dest", { hasText: /^Gen 1$/ }).tap();
    await page.waitForTimeout(900);
    eq(await homeOf("collectorCopyId", ctx.ids.copy2), ctx.ids.gen1, "not moved");
    eq((await copyOf(ctx.ids.copy2)).offered, true, "the move changed its state");
    assert(await page.locator("[role=dialog] .mcs-ce-home", { hasText: "In Gen 1" }).count(), "the page did not follow");
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
    await ctx.post("removeGoal", { goalId: ctx.ids.goal2 });   // changed elsewhere, behind the open page
    /* RESTATED (P6-F4 B2B): chosen, then Save changes; the refusal re-reads, and a Goal that is gone takes its page with it */
    await state(page, "secondary").tap();
    await page.locator("[role=dialog] button.mcs-cd-add").tap();
    await page.waitForTimeout(1200);
    eq(await page.locator("text=✓ Saved").count(), 0, "success shown for a refused change");
    eq(await goalOf(ctx.ids.goal2), null);
    eq(await page.locator("[role=dialog][aria-label='Your Goal: Venusaur']").count(), 0, "the page still shows a Goal the server no longer has");
    assert(await page.locator(".mcs-snack.warn", { hasText: "changed elsewhere and is no longer here" }).count(), "the refusal was not said");
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

/* P6-F4 BATCH 2A — LAST, BECAUSE IT WRITES. Move, through the real front
   door, server and database: into a binder; then + New binder, whose first
   filing the REAL server refuses (the request is pointed at a binder that does
   not exist), so the made binder is kept and "Try moving again" completes it. */
describe("Move and + New binder through production (P6-F4 B2A)", () => {
  test("Move into a binder; + New binder with a refused move, kept, and Try moving again — one binder, filed once", async () => {
    await before();
    const context = await browser.newContext({ ...PHONE }); const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    const commands = []; page.on("request", (r) => { if (r.url().includes("/api/commands")) commands.push(JSON.parse(r.postData() || "{}").command); });
    await signIn(page, ctx.url);
    await page.tap("nav[aria-label=Collector] button:has-text('Binders')"); await page.waitForTimeout(500);
    const tile = page.locator("section[aria-label='Your Cards'] li.mcs-otile").filter({ hasText: /Charizard/ }).first().locator("button.mcs-otap");
    const goal = (await ctx.world()).goals.find((g) => g.canonicalCardId) ;
    const homeOfGoal = async () => ((await ctx.memberships()).find((m) => m.goalId === goal.id) || {}).binderId || null;
    const w0 = await ctx.world();
    /* 1. Move: one obvious button, its chooser, a binder */
    await tile.scrollIntoViewIfNeeded(); await tile.tap(); await page.waitForTimeout(350);
    await page.locator("[role=dialog] button", { hasText: /^Move$/ }).tap();
    const chooser = page.locator("[role=dialog][aria-label='Where should this go?']");
    await chooser.waitFor();
    eq(commands.length, 0, "opening the chooser wrote something");
    const from = await homeOfGoal();
    const target = w0.binders.find((b) => !b.archivedAt && b.id !== from);
    await page.screenshot({ path: "artifacts/f4-b2a-move-chooser.png" }).catch(() => {});
    await chooser.locator("button.mcs-dest", { hasText: new RegExp(`^${target.name}$`) }).tap();
    await page.locator(".mcs-snack", { hasText: `is filed in ${target.name}` }).waitFor();
    eq(await homeOfGoal(), target.id, "not moved");
    eq(await page.locator(`.mcs-bcover.open[data-binder='${target.id}']`).count(), 1, "the destination is not open");
    /* 2. + New binder, the first filing refused by the real server */
    let pointed = false;
    await page.route("**/api/commands", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      if (body.command === "fileObject" && !pointed) {
        pointed = true;
        return route.continue({ postData: JSON.stringify({ ...body, payload: { ...body.payload, binderId: "b-does-not-exist" } }) });
      }
      return route.continue();
    });
    await page.locator("[role=dialog] button", { hasText: /^Move$/ }).tap();
    await chooser.locator("button.mcs-dest", { hasText: /^\+ New binder$/ }).tap();
    await page.locator("[role=dialog][aria-label='New binder'] input").fill("Keepers");
    await page.screenshot({ path: "artifacts/f4-b2a-new-binder-name.png" }).catch(() => {});
    await page.locator("[role=dialog][aria-label='New binder'] button", { hasText: /^Create & move$/ }).tap();
    await page.locator(".mcs-snack.warn", { hasText: /Made “Keepers”, but Charizard couldn't be moved into it/ }).waitFor();
    await page.screenshot({ path: "artifacts/f4-b2a-partial-success.png" }).catch(() => {});
    let w = await ctx.world();
    const keepers = w.binders.filter((b) => b.name === "Keepers");
    eq(keepers.length, 1, "the made binder was not kept");
    eq(await homeOfGoal(), target.id, "a refused move moved it");
    eq(await page.locator(".mcs-snack", { hasText: /is filed in Keepers/ }).count(), 0, "success claimed after a refusal");
    /* 3. Try moving again: only the move, into the binder already made */
    await page.locator(".mcs-snack button", { hasText: /^Try moving again$/ }).tap();
    await page.locator(".mcs-snack", { hasText: /Charizard is filed in Keepers/ }).waitFor();
    await page.screenshot({ path: "artifacts/f4-b2a-retried.png" }).catch(() => {});
    w = await ctx.world();
    eq(w.binders.filter((b) => b.name === "Keepers").length, 1, "Try moving again made a second binder");
    eq(await homeOfGoal(), keepers[0].id, "not moved into the made binder");
    eq(json(commands), json(["fileObject", "createBinder", "fileObject", "fileObject"]), "unexpected commands: " + json(commands));
    eq(w.goals.length, w0.goals.length, "a move made or removed a Goal");
    eq(w.collectorCopies.length, w0.collectorCopies.length, "a move made or removed a copy");
    eq(json(w.goals.find((g) => g.id === goal.id).tier), json(goal.tier), "a move changed the Goal's tier");
    /* 4. Undo, after the confirmed move */
    await page.locator(".mcs-snack button.mcs-undo").tap();
    await page.locator(".mcs-snack", { hasText: /Put back/ }).waitFor();
    eq(await homeOfGoal(), target.id, "Undo did not put it back");
    eq((await ctx.world()).binders.filter((b) => b.name === "Keepers").length, 1, "Undo removed the binder");
    eq(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "sideways scroll");
    eq(errors.length, 0, errors.join(" | "));
    await context.close();
  });
});

/* P6-F4 BATCH 2B — LAST, BECAUSE IT WRITES. A saved card edited in place,
   through the real front door, server and database. */
describe("a saved card, edited in place (P6-F4 B2B)", () => {
  /* (a Goal's tier, edited and saved through the real server: "A. a Goal" above) */
  test("a copy's condition and certificate: only those change; the same record, the same binder", async () => {
    await before();
    const api = async (u) => (await fetch(ctx.url + u, { headers: { authorization: "Bearer casey" } })).json();
    const rs60 = (await api("api/card-contexts?pokedex=258")).contexts.find((c) => c.collectorNumber === "60");
    const normal = (await api(`api/card-contexts/${rs60.cardContextId}`)).canonicalCards.find((c) => c.finish === "non_holo").canonicalCardId;
    const copyId = await ctx.post("addCollectorCopy", { copy: { canonicalCardId: normal, grade: "Raw", condition: "Near Mint", keeping: true, cert: "OLD-1" } });
    const binder = (await ctx.world()).binders.find((b) => !b.archivedAt);
    await ctx.post("fileObject", { binderId: binder.id, collectorCopyId: copyId });
    const before0 = (await ctx.world()).collectorCopies.find((c) => c.id === copyId);
    const context = await browser.newContext({ ...PHONE }); const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    const commands = []; page.on("request", (r) => { if (r.url().includes("/api/commands")) commands.push(JSON.parse(r.postData() || "{}").command); });
    await signIn(page, ctx.url);
    await page.tap("nav[aria-label=Collector] button:has-text('Binders')"); await page.waitForTimeout(500);
    const tile = page.locator("section[aria-label='Your Cards'] li.mcs-otile").filter({ hasText: /Mudkip #60 · Normal · Raw · Near Mint/ }).filter({ hasText: /^PC/ }).first().locator("button.mcs-otap");
    await tile.scrollIntoViewIfNeeded(); await tile.tap(); await page.waitForTimeout(500);
    const dlg = page.locator("[role=dialog][aria-label='Your copy: Mudkip']");
    await dlg.waitFor();
    const pressedNow = async () => dlg.locator("button[aria-pressed=true] b").allInnerTexts();
    eq(JSON.stringify(await pressedNow()), JSON.stringify(["PC", "Raw", "Near Mint"]), "not preselected from the record");
    eq(await dlg.locator("button.mcs-cd-add").getAttribute("aria-disabled"), "true", "Save offered with nothing changed");
    await dlg.locator("button.mcs-cd-choice", { has: page.locator("b", { hasText: /^Lightly Played$/ }) }).tap();
    await dlg.locator("input").first().fill("NEW-2");
    await dlg.locator("button.mcs-cd-add").tap();
    await dlg.locator(".mcs-cd-hint.ack").waitFor({ timeout: 4000 });
    const after = (await ctx.world()).collectorCopies.find((c) => c.id === copyId);
    eq(JSON.stringify([after.id, after.canonicalCardId, after.grade, after.condition, after.cert, after.keeping, after.offered === true]),
      JSON.stringify([copyId, normal, "Raw", "Lightly Played", "NEW-2", true, false]), "not saved as asked");
    eq(after.addedAt, before0.addedAt, "the record was replaced");
    eq(((await ctx.memberships()).find((m) => m.collectorCopyId === copyId) || {}).binderId, binder.id, "the binder moved");
    eq(JSON.stringify(commands), JSON.stringify(["updateCollectorCopy"]), "unexpected commands: " + JSON.stringify(commands));
    eq(JSON.stringify(await pressedNow()), JSON.stringify(["PC", "Raw", "Lightly Played"]), "the page did not refresh from the projection");
    eq(errors.length, 0, errors.join(" | "));
    await context.close();
  });
});

/* P6-F4 BATCH 2B.1 — LAST, BECAUSE IT WRITES. An owned copy's PC ↔ Trade / Sell,
   in reach on a phone, both ways, saved and reopened. */
describe("an owned copy's state, both ways, in reach (P6-F4 B2B.1)", () => {
  test("PC → Trade / Sell and back: both choices on screen at 390 × 844; saved; reopened selected; nothing else changes", async () => {
    await before();
    const copyId = ctx.ids.copy;
    const context = await browser.newContext({ ...PHONE }); const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    const commands = []; page.on("request", (r) => { if (r.url().includes("/api/commands")) commands.push(JSON.parse(r.postData() || "{}").command); });
    await signIn(page, ctx.url);
    await page.tap("nav[aria-label=Collector] button:has-text('Binders')"); await page.waitForTimeout(500);
    const was = (await ctx.world()).collectorCopies.find((c) => c.id === copyId);
    const home = ((await ctx.memberships()).find((m) => m.collectorCopyId === copyId) || {}).binderId || null;
    const openIt = async () => {
      const t = page.locator(`section[aria-label='Your Cards'] li.mcs-otile[data-key='c:${copyId}'] button.mcs-otap`);
      await t.scrollIntoViewIfNeeded(); await t.tap(); await page.locator("[role=dialog].mcs-ce").waitFor(); await page.waitForTimeout(400);
    };
    const pressedNow = () => page.locator("[role=dialog].mcs-ce [data-q=state] button[aria-pressed=true]").getAttribute("data-st");
    const flip = async (to) => {
      await openIt();
      /* both choices in view, above the dock, with no scrolling */
      const dock = await page.locator("[role=dialog].mcs-ce .mcs-cd-dock").boundingBox();
      for (const st of ["pc", "trade"]) {
        const b = await page.locator(`[role=dialog].mcs-ce [data-q=state] button[data-st=${st}]`).boundingBox();
        assert(b.y >= 0 && b.y + b.height <= dock.y, `${st} is not on screen above the dock (${Math.round(b.y)}–${Math.round(b.y + b.height)}, dock at ${Math.round(dock.y)})`);
      }
      await page.screenshot({ path: `artifacts/f4-b2b1-before-${to}.png` }).catch(() => {});
      await page.locator(`[role=dialog].mcs-ce [data-q=state] button[data-st=${to}]`).tap();
      await page.locator("[role=dialog].mcs-ce button.mcs-cd-add").tap();
      await page.locator("[role=dialog].mcs-ce .mcs-cd-hint.ack").waitFor({ timeout: 4000 });
      await page.locator("[role=dialog].mcs-ce .mcs-cd-back").tap(); await page.waitForTimeout(400);
      await openIt();
      eq(await pressedNow(), to, `reopened, ${to} is not selected`);
      await page.screenshot({ path: `artifacts/f4-b2b1-reopened-${to}.png` }).catch(() => {});
      await page.locator("[role=dialog].mcs-ce .mcs-cd-back").tap(); await page.waitForTimeout(300);
    };
    eq(was.keeping === true ? "pc" : "trade", "pc", "the fixture copy is not PC");
    await flip("trade");
    let c = (await ctx.world()).collectorCopies.find((x) => x.id === copyId);
    eq(JSON.stringify([c.offered === true, c.keeping === true, c.grade, c.condition || null, c.cert || null, c.canonicalCardId]),
      JSON.stringify([true, false, was.grade, was.condition || null, was.cert || null, was.canonicalCardId]), "not saved as Trade / Sell alone");
    await flip("pc");
    c = (await ctx.world()).collectorCopies.find((x) => x.id === copyId);
    eq(JSON.stringify([c.offered === true, c.keeping === true]), JSON.stringify([false, true]), "not saved as PC");
    eq(((await ctx.memberships()).find((m) => m.collectorCopyId === copyId) || {}).binderId || null, home, "the binder moved");
    /* RESTATED (P6-F4 B5): every state change is one changeCollectingState */
    eq(JSON.stringify(commands), JSON.stringify(["changeCollectingState", "changeCollectingState"]), "unexpected commands: " + JSON.stringify(commands));
    eq(errors.length, 0, errors.join(" | "));
    await context.close();
  });
});

/* P6-F4 BATCH 3 — LAST, BECAUSE IT WRITES. + Add cards: one of their own
   cards, then a new card made on the Phase 6 card and filed into the binder —
   its first filing refused by the real server, then Retry filing. */
describe("+ Add cards to a binder, through production (P6-F4 B3)", () => {
  test("My Cards files the exact record; Browse new cards makes one and files THAT one; Retry filing never re-creates; Back to the binder", async () => {
    await before();
    const context = await browser.newContext({ ...PHONE }); const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    const commands = []; page.on("request", (r) => { if (r.url().includes("/api/commands")) commands.push(JSON.parse(r.postData() || "{}").command); });
    const binder = (await ctx.world()).binders.find((b) => !b.archivedAt && b.name === "Favourites") || (await ctx.world()).binders.find((b) => !b.archivedAt);
    const w0 = await ctx.world();
    const unfiled = w0.collectorCopies.find((c) => !(w0.binderMemberships || []).some((m) => m.collectorCopyId === c.id));
    assert(unfiled, "the fixture has no unfiled copy");
    await signIn(page, ctx.url);
    await page.tap("nav[aria-label=Collector] button:has-text('Binders')"); await page.waitForTimeout(500);
    const sec = page.locator("button.mcs-sechead", { hasText: /^Binders/ }).first();
    if ((await sec.getAttribute("aria-expanded")) !== "true") await sec.tap();
    const row = page.locator(`.mcs-bcover[data-binder='${binder.id}'] button.mcs-bhead`);
    if ((await row.getAttribute("aria-expanded")) !== "true") await row.tap();
    await page.locator(`.mcs-bcover[data-binder='${binder.id}'] button.mcs-badd`).tap();
    await page.screenshot({ path: "artifacts/f4-b3-chooser.png" }).catch(() => {});
    eq(commands.length, 0, "the chooser wrote something");
    /* 1. My Cards */
    await page.locator("[role=dialog] button", { hasText: /^Add from My Cards/ }).tap();
    const pick = page.locator(`[role=dialog].mcs-pick li[data-key='c:${unfiled.id}'] button.mcs-otap`);
    await pick.scrollIntoViewIfNeeded(); await pick.tap();
    await page.screenshot({ path: "artifacts/f4-b3-picker.png" }).catch(() => {});
    await page.locator("[role=dialog].mcs-pick button.mcs-cd-add").tap();
    await page.locator(".mcs-snack", { hasText: /1 added to/ }).waitFor();
    eq(((await ctx.memberships()).find((m) => m.collectorCopyId === unfiled.id) || {}).binderId, binder.id, "not filed");
    await page.screenshot({ path: "artifacts/f4-b3-picker-filed.png" }).catch(() => {});
    /* 2. Browse new cards; the first filing pointed at a binder that does not exist */
    await page.locator(`.mcs-bcover[data-binder='${binder.id}'] button.mcs-badd`).tap();
    await page.locator("[role=dialog] button", { hasText: /^Browse new cards/ }).tap();
    await page.locator(".mcs-filling").waitFor();
    await page.screenshot({ path: "artifacts/f4-b3-browse-from-binder.png" }).catch(() => {});
    let pointed = false;
    await page.route("**/api/commands", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      if (body.command === "fileObject" && !pointed) { pointed = true; return route.continue({ postData: JSON.stringify({ ...body, payload: { ...body.payload, binderId: "b-does-not-exist" } }) }); }
      return route.continue();
    });
    await page.locator(".mcs-dtile[data-dex='258']").tap(); await page.waitForTimeout(800);
    const cell = page.locator("button.mcs-dcell[aria-label='Mudkip, Ruby & Sapphire #60']"); await cell.scrollIntoViewIfNeeded(); await cell.tap();
    await page.locator(".mcs-cd").waitFor(); await page.waitForTimeout(400);
    for (const t of ["Normal", "Graded", "PSA 6", "I own (it|another one)", "Trade \\/ Sell"]) {
      const c = page.locator(".mcs-cd-choice", { has: page.locator("b", { hasText: new RegExp(`^${t}$`) }) }).first(); await c.scrollIntoViewIfNeeded(); await c.tap(); await page.waitForTimeout(120);
    }
    await page.screenshot({ path: "artifacts/f4-b3-create-with-binder.png" }).catch(() => {});
    const before1 = (await ctx.world()).collectorCopies.map((c) => c.id);
    await page.locator(".mcs-cd-add").tap();
    await page.locator(".mcs-cd-hint.problem", { hasText: /couldn't go into/ }).waitFor();
    await page.screenshot({ path: "artifacts/f4-b3-partial-retry.png" }).catch(() => {});
    let w = await ctx.world();
    const made = w.collectorCopies.filter((c) => !before1.includes(c.id));
    eq(made.length, 1, "not exactly one new copy");
    eq(((await ctx.memberships()).find((m) => m.collectorCopyId === made[0].id) || null), null, "a refused filing filed it");
    await page.locator(".mcs-cd-add", { hasText: "Retry filing" }).tap();
    await page.locator(".mcs-cd-add.added").waitFor();
    w = await ctx.world();
    eq(w.collectorCopies.filter((c) => !before1.includes(c.id)).length, 1, "Retry filing made another copy");
    eq(((await ctx.memberships()).find((m) => m.collectorCopyId === made[0].id) || {}).binderId, binder.id, "the new copy is not in the binder");
    eq(JSON.stringify([made[0].offered === true, made[0].grade]), JSON.stringify([true, "PSA 6"]), "the copy is not what was said");
    await page.locator(".mcs-d-ack").waitFor();
    await page.screenshot({ path: "artifacts/f4-b3-created-filed.png" }).catch(() => {});
    /* 3. back to the binder, open */
    await page.locator(".mcs-d-ack button", { hasText: `Back to ${binder.name}` }).tap(); await page.waitForTimeout(600);
    eq(await page.locator(`.mcs-bcover.open[data-binder='${binder.id}']`).count(), 1, "the binder is not open on return");
    assert(await page.locator(`.mcs-bcover[data-binder='${binder.id}'] li.mcs-otile[data-key='c:${made[0].id}']`).count(), "the new card is not in the binder");
    await page.screenshot({ path: "artifacts/f4-b3-back-to-binder.png" }).catch(() => {});
    eq(JSON.stringify(commands), JSON.stringify(["fileObject", "addCollectorCopy", "fileObject", "fileObject"]), "unexpected commands: " + JSON.stringify(commands));
    eq(errors.length, 0, errors.join(" | "));
    await context.close();
  });
});

/* P6-F4 BATCH 5 / 5.2 — LAST, BECAUSE IT WRITES. Select a state → Submit
   Update → the server confirms → the card is in its new state, with its
   grade and condition exactly as they were (B5.2): one changeCollectingState
   each time, on the real server and Postgres, the editor never closed. */
describe("Four states, one Submit, configuration kept, through production (P6-F4 B5 / B5.2)", () => {
  test("Charizard Primary PSA 9 → Trade / Sell PSA 9 → reopened → Secondary PSA 9 → Primary → PC; a PC copy → Primary → Trade / Sell; no question asked", async () => {
    await before();
    const context = await browser.newContext({ ...PHONE }); const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    const commands = []; page.on("request", (r) => { if (r.url().includes("/api/commands")) commands.push(JSON.parse(r.postData() || "{}").command); });
    const DIR = "artifacts/fidelity/f4-b5-2";
    require("fs").mkdirSync(DIR, { recursive: true });
    const shot = async (n) => { await page.waitForTimeout(400); await page.screenshot({ path: `${DIR}/${n}.png` }).catch(() => {}); };
    let w = await ctx.world();
    const goal = w.goals.find((g) => g.id === ctx.ids.goal);
    const gen1 = w.binders.find((b) => b.id === ctx.ids.gen1);
    const home0 = (w.binderMemberships || []).find((m) => m.goalId === goal.id);
    assert(goal && home0 && home0.binderId === gen1.id && goal.desired.grade === "PSA 9", "the seed's Charizard Primary PSA 9 Goal is not in Gen 1");
    const recs = (world, canon) => [...world.goals.filter((g) => g.canonicalCardId === canon).map((g) => ({ kind: "goal", r: g })),
      ...world.collectorCopies.filter((c) => c.canonicalCardId === canon).map((c) => ({ kind: "copy", r: c }))];
    const n0 = recs(w, goal.canonicalCardId).length;
    let lastId = goal.id;
    /* the record this card now is, on the server: kind, state, grading, binder row, lineage */
    const server = async () => {
      const wd = await ctx.world(); const all = recs(wd, goal.canonicalCardId);
      eq(all.length, n0, "a second record of this card appeared");
      const one = all.find((x) => x.r.id === lastId || (x.r.formerly || []).some((f) => f.id === lastId));
      assert(one, "the record is gone");
      const { kind, r } = one;
      return { id: r.id, kind, state: kind === "goal" ? r.tier : r.offered ? "trade" : r.keeping ? "pc" : null,
        grading: kind === "goal" ? JSON.stringify(r.desired) : JSON.stringify({ grade: r.grade, ...(r.condition ? { condition: r.condition } : {}) }),
        home: ((wd.binderMemberships || []).find((m) => m.goalId === r.id || m.collectorCopyId === r.id) || {}).id || null, lineage: (r.formerly || []).length };
    };
    await signIn(page, ctx.url);
    await page.tap("nav[aria-label=Collector] button:has-text('Binders')"); await page.waitForTimeout(500);
    const sec = page.locator("button.mcs-sechead", { hasText: /^Binders/ }).first();
    if ((await sec.getAttribute("aria-expanded")) !== "true") await sec.tap();
    const row = page.locator(`.mcs-bcover[data-binder='${gen1.id}'] button.mcs-bhead`);
    if ((await row.getAttribute("aria-expanded")) !== "true") await row.tap();
    const openTile = async (key) => { const t = page.locator(`li.mcs-otile[data-key='${key}'] button.mcs-otap`).first(); await t.scrollIntoViewIfNeeded(); await t.tap(); await page.locator(".mcs-ce").first().waitFor(); await page.waitForTimeout(300); };
    const choose = async (t) => { const c = page.locator(".mcs-ce .mcs-cd-choice", { has: page.locator("b", { hasText: new RegExp(`^${t}$`) }) }).first(); await c.scrollIntoViewIfNeeded(); await c.tap(); await page.waitForTimeout(150); };
    const toGrades = () => page.evaluate(() => { const sc = document.querySelector(".mcs-cd-scroll"); const q = document.querySelector(".mcs-ce .mcs-cd-ident"); if (sc && q) sc.scrollTop = q.offsetTop - 64; });
    const submit = page.locator(".mcs-ce .mcs-cd-dock .mcs-cd-add");
    const live = async () => (await submit.getAttribute("aria-disabled")) === "false";
    const on = async () => (await page.locator(".mcs-ce [data-q='state'] .mcs-cd-choice[aria-pressed='true']").getAttribute("data-st"));
    const grade = async () => (await page.locator(".mcs-ce [data-q='grade'] .mcs-cd-choice[aria-pressed='true']").textContent()).trim();
    const saved = async (label) => { await page.locator(".mcs-ce .mcs-cd-hint.ack", { hasText: `Saved — ${label}.` }).waitFor(); };
    const noQuestion = async () => eq(await page.locator(".mcs-ce").getByText(/You were looking for|is this one/).count(), 0, "a reconfirmation question appeared");
    const close = async () => { await page.locator(".mcs-ce .mcs-cd-back").tap(); await page.waitForTimeout(400); };
    const expect = async (kind, state, grading, lineage, why) => {
      const r = await server(); lastId = r.id;
      eq(JSON.stringify([r.kind, r.state, r.grading, r.home, r.lineage]), JSON.stringify([kind, state, JSON.stringify(grading), home0.id, lineage]), why);
      return r;
    };

    /* 1. Charizard Primary PSA 9 → Trade / Sell PSA 9 */
    await openTile(`g:${goal.id}`);
    eq(await on(), "primary"); eq(await grade(), "PSA 9"); eq(await live(), false);
    await toGrades(); await shot("b52-01-primary-psa9-before");
    await choose("Trade \\/ Sell"); eq(await live(), true); eq(commands.length, 0, "a selection wrote something");
    await toGrades(); await shot("b52-02-trade-selected-submit-active");
    await submit.tap(); await saved("Trade / Sell"); await noQuestion();
    eq(await on(), "trade"); eq(await grade(), "PSA 9"); eq(await live(), false);
    const asCopy = await expect("copy", "trade", { grade: "PSA 9" }, 1, "Trade / Sell on the server");
    await toGrades(); await shot("b52-03-saved-trade-psa9");
    /* reopened */
    await close(); await openTile(`c:${asCopy.id}`);
    eq(await on(), "trade"); eq(await grade(), "PSA 9"); eq(await live(), false);
    await toGrades(); await shot("b52-04-reopened-trade-psa9");
    /* 2. and on, without closing: Secondary, Primary, PC — PSA 9 at every step */
    await choose("Secondary"); await submit.tap(); await saved("Secondary"); await noQuestion();
    const asGoal = await expect("goal", "secondary", { grade: "PSA 9" }, 2, "Secondary on the server");
    eq(await grade(), "PSA 9");
    await toGrades(); await shot("b52-05-then-secondary-psa9");
    await choose("Primary"); await submit.tap(); await saved("Primary");
    eq((await expect("goal", "primary", { grade: "PSA 9" }, 2, "Primary on the server")).id, asGoal.id, "Primary ↔ Secondary is not the same record");
    await choose("PC"); await submit.tap(); await saved("PC"); await noQuestion();
    await expect("copy", "pc", { grade: "PSA 9" }, 3, "PC on the server");
    eq(await grade(), "PSA 9");
    await close();

    /* 3. a PC copy (PSA 8) → Primary → Trade / Sell: PSA 8 throughout */
    const blas = w.collectorCopies.find((c) => c.id === ctx.ids.copy);
    await openTile(`c:${blas.id}`);
    await choose("Primary"); await submit.tap(); await saved("Primary"); await noQuestion();
    w = await ctx.world();
    const g3 = w.goals.find((g) => g.formerly && g.formerly.some((f) => f.id === blas.id));
    eq(JSON.stringify([g3.tier, g3.desired]), JSON.stringify(["primary", { grade: "PSA 8" }]));
    await choose("Trade \\/ Sell"); await submit.tap(); await saved("Trade / Sell"); await noQuestion();
    w = await ctx.world();
    const k3 = w.collectorCopies.find((c) => c.formerly && c.formerly.some((f) => f.id === g3.id));
    eq(JSON.stringify([k3.offered, k3.grade, k3.formerly.length]), JSON.stringify([true, "PSA 8", 2]));
    eq(w.collectorCopies.filter((c) => c.canonicalCardId === blas.canonicalCardId).length + w.goals.filter((g) => g.canonicalCardId === blas.canonicalCardId).length, 1, "a second Blastoise appeared");

    eq(JSON.stringify(commands), JSON.stringify(Array(6).fill("changeCollectingState")), "unexpected commands: " + JSON.stringify(commands));
    eq(errors.length, 0, errors.join(" | "));
    await context.close();
  });
});

/* P6-F4 BATCH 5.1 — SEQUENTIAL EDITING ON ONE OPEN EDITOR. The founder saw
   a card stop accepting updates after its first. Every save here is followed
   by another on the SAME open page — no close, no reopen, no reload — and
   each is checked against the server: the record, its state, its grading,
   the editor's selection, and that Submit Update is off after a save and on
   again for the next change. Same-record and cross-type (new id) alike. */
describe("Sequential edits on one open editor, through production (P6-F4 B5.1)", () => {
  test("state ↔ state, grade → grade → grade, condition → condition, state then grade, grade then state, and across the pair — each save leaves the editor ready for the next", async () => {
    await before();
    const api = async (u) => (await fetch(ctx.url + u, { headers: { authorization: "Bearer casey" } })).json();
    const jungle = (await api("api/card-contexts?pokedex=25")).contexts.find((c) => c.collectorNumber === "25");
    const pikaJ = (await api(`api/card-contexts/${jungle.cardContextId}`)).canonicalCards[0].canonicalCardId;
    const rs59 = (await api("api/card-contexts?pokedex=258")).contexts.find((c) => c.collectorNumber === "59");
    const mud59 = (await api(`api/card-contexts/${rs59.cardContextId}`)).canonicalCards.find((k) => k.finish === "non_holo").canonicalCardId;
    const goalId = await ctx.post("addGoal", { canonicalCardId: pikaJ, tier: "primary", desired: { grade: "PSA 8" } });
    await ctx.post("fileObject", { binderId: ctx.ids.gen1, goalId });
    const copyId = await ctx.post("addCollectorCopy", { copy: { canonicalCardId: mud59, grade: "Raw", condition: "Near Mint", keeping: true } });
    await ctx.post("fileObject", { binderId: ctx.ids.mud, collectorCopyId: copyId });

    const context = await browser.newContext({ ...PHONE }); const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    const sent = []; page.on("request", (r) => { if (r.url().includes("/api/commands")) sent.push(JSON.parse(r.postData() || "{}")); });
    await signIn(page, ctx.url);
    await page.tap("nav[aria-label=Collector] button:has-text('Binders')"); await page.waitForTimeout(500);
    const sec = page.locator("button.mcs-sechead", { hasText: /^Binders/ }).first();
    if ((await sec.getAttribute("aria-expanded")) !== "true") await sec.tap();
    const submit = page.locator(".mcs-ce .mcs-cd-dock .mcs-cd-add");
    const off = async () => (await submit.getAttribute("aria-disabled")) === "true";
    const shown = () => page.locator(".mcs-ce [data-q='state'] .mcs-cd-choice[aria-pressed='true']").getAttribute("data-st");
    const choose = async (t) => { const c = page.locator(".mcs-ce .mcs-cd-choice", { has: page.locator("b", { hasText: new RegExp(`^${t}$`) }) }).first(); await c.scrollIntoViewIfNeeded(); await c.tap(); await page.waitForTimeout(120); };
    const record = async (canon) => { const w = await ctx.world();
      const g = w.goals.filter((x) => x.canonicalCardId === canon); const c = w.collectorCopies.filter((x) => x.canonicalCardId === canon);
      eq(g.length + c.length, 1, "not exactly one record of this card");
      const r = g[0] || c[0];
      return { id: r.id, kind: g[0] ? "goal" : "copy", state: g[0] ? r.tier : r.offered ? "trade" : r.keeping ? "pc" : null,
        grading: g[0] ? JSON.stringify(r.desired || null) : JSON.stringify([r.grade || null, r.condition || null]),
        home: ((w.binderMemberships || []).find((m) => m.goalId === r.id || m.collectorCopyId === r.id) || {}).binderId || null }; };
    /* one save: choose, Submit on, submit, the server's answer, the editor after */
    const step = async (canon, picks, expect) => {
      assert(await off(), "Submit is on before anything was changed");
      for (const t of picks) await choose(t);
      assert(!(await off()), `Submit is off after choosing ${picks.join(" + ")}`);
      const n = sent.length;
      await submit.tap();
      await page.locator(".mcs-ce .mcs-cd-hint.ack").waitFor({ timeout: 8000 });
      await page.waitForTimeout(200);
      eq(sent.length - n, expect.commands, `${picks.join(" + ")}: commands sent`);
      const r = await record(canon);
      eq(JSON.stringify([r.state, r.grading]), JSON.stringify([expect.state, expect.grading]), `${picks.join(" + ")}: the server`);
      eq(await shown(), expect.state, `${picks.join(" + ")}: the editor shows another state`);
      assert(await off(), `${picks.join(" + ")}: Submit stays on after the save`);
      return r;
    };
    const openTile = async (key) => { const t = page.locator(`li.mcs-otile[data-key='${key}'] button.mcs-otap`).first(); await t.scrollIntoViewIfNeeded(); await t.tap(); await page.locator(".mcs-ce").waitFor(); await page.waitForTimeout(300); };

    /* A Goal, one open page: Primary → Secondary → Primary; PSA 8 → 9 → 10;
       state then grade; grade then state; then across: PC → Trade / Sell */
    const row = page.locator(`.mcs-bcover[data-binder='${ctx.ids.gen1}'] button.mcs-bhead`);
    if ((await row.getAttribute("aria-expanded")) !== "true") await row.tap();
    await openTile(`g:${goalId}`);
    const G = (state, grade) => ({ state, grading: JSON.stringify({ grade }), commands: 1 });
    await step(pikaJ, ["Secondary"], G("secondary", "PSA 8"));
    await step(pikaJ, ["Primary"], G("primary", "PSA 8"));
    await step(pikaJ, ["PSA 9"], G("primary", "PSA 9"));
    await step(pikaJ, ["PSA 10"], G("primary", "PSA 10"));
    await step(pikaJ, ["Secondary"], G("secondary", "PSA 10"));
    await step(pikaJ, ["PSA 9"], G("secondary", "PSA 9"));
    await step(pikaJ, ["PSA 8", "Primary"], { ...G("primary", "PSA 8"), commands: 2 });
    const start = await record(pikaJ);
    /* RESTATED (B5.2): the configuration travels across the pair */
    const asCopy = await step(pikaJ, ["PC"], { state: "pc", grading: JSON.stringify(["PSA 8", null]), commands: 1 });
    assert(asCopy.id !== start.id && asCopy.kind === "copy" && asCopy.home === start.home, "the cross-type change is not one re-made record in the same binder");
    await step(pikaJ, ["Trade \\/ Sell"], { state: "trade", grading: JSON.stringify(["PSA 8", null]), commands: 1 });
    await step(pikaJ, ["PC"], { state: "pc", grading: JSON.stringify(["PSA 8", null]), commands: 1 });
    await step(pikaJ, ["PSA 9"], { state: "pc", grading: JSON.stringify(["PSA 9", null]), commands: 1 });
    const back = await step(pikaJ, ["Primary"], { state: "primary", grading: JSON.stringify({ grade: "PSA 9" }), commands: 1 });
    assert(back.kind === "goal" && back.id !== asCopy.id && back.home === start.home, "back across the pair is not one re-made record");
    await step(pikaJ, ["Secondary"], G("secondary", "PSA 9"));
    await page.locator(".mcs-ce .mcs-cd-back").tap(); await page.waitForTimeout(300);

    /* A copy, one open page: Raw Near Mint → Lightly Played → Near Mint;
       PC → Trade / Sell → PC; Primary → Trade / Sell across the pair */
    const mrow = page.locator(`.mcs-bcover[data-binder='${ctx.ids.mud}'] button.mcs-bhead`);
    if ((await mrow.getAttribute("aria-expanded")) !== "true") await mrow.tap();
    await openTile(`c:${copyId}`);
    const K = (state, g, c) => ({ state, grading: JSON.stringify([g, c]), commands: 1 });
    await step(mud59, ["Lightly Played"], K("pc", "Raw", "Lightly Played"));
    await step(mud59, ["Near Mint"], K("pc", "Raw", "Near Mint"));
    await step(mud59, ["Trade \\/ Sell"], K("trade", "Raw", "Near Mint"));
    await step(mud59, ["PC"], K("pc", "Raw", "Near Mint"));
    await step(mud59, ["Primary"], { state: "primary", grading: JSON.stringify({ grade: "Raw", condition: "Near Mint" }), commands: 1 });
    await step(mud59, ["Trade \\/ Sell"], { state: "trade", grading: JSON.stringify(["Raw", "Near Mint"]), commands: 1 });
    eq(errors.length, 0, errors.join(" | "));
    await context.close();
  });
});

/* P6-F5A / F5A.1 — TRUSTED-NETWORK INVENTORY IN BROWSE, through production.
   Casey is connected to Northline Cards (two Mudkip #60 printings, a
   Charizard) and not to Faraway Games (a Mudkip #60 PSA 10, a Jungle
   Pikachu). Browse has two scopes — All Cards | Trusted Partners — and
   looking writes nothing. */
describe("All Cards | Trusted Partners, through production (P6-F5A / F5A.1)", () => {
  test("the grid marks only cards a connected partner has available; the card lists them by partner; the scope filters on the server and keeps the search; nothing from Faraway; nothing written", async () => {
    await before();
    const context = await browser.newContext({ ...PHONE }); const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    const commands = []; page.on("request", (r) => { if (r.url().includes("/api/commands")) commands.push(r.url()); });
    const finds = []; page.on("request", (r) => { if (r.url().includes("/api/card-contexts?")) finds.push(r.url()); });
    const DIR = "artifacts/fidelity/f5a1";
    require("fs").mkdirSync(DIR, { recursive: true });
    const shot = async (n) => { await page.waitForTimeout(400); await page.screenshot({ path: `${DIR}/${n}.png` }).catch(() => {}); };
    const viewOf = async () => (await (await fetch(ctx.url + "api/view", { headers: { authorization: "Bearer casey" } })).json());
    const v0 = await viewOf();
    const body = () => page.locator("body").innerText();
    const noFaraway = async (where) => { const t = await body(); assert(!/Faraway|\$300|\$500/.test(t), `the unconnected partner reached ${where}`); };
    const scopeOn = async () => page.locator(".mcs-dscope [role=radio][aria-checked=true]").getAttribute("data-scope");
    const setScope = async (id) => { await page.locator(`.mcs-dscope [data-scope='${id}']`).tap(); await page.waitForTimeout(900); };

    await signIn(page, ctx.url);
    eq(await scopeOn(), "all", "All Cards is not the default");
    /* the order: search, scope, doorways */
    const tops = await page.evaluate(() => [".mcs-dsearch", ".mcs-dscope", ".mcs-dtabs"].map((q) => document.querySelector(q).getBoundingClientRect().top));
    assert(tops[0] < tops[1] && tops[1] < tops[2], "search, scope and doorways are out of order: " + tops);
    const w = await page.evaluate(() => document.querySelector(".mcs-dscope").getBoundingClientRect().width);
    assert(w <= 390 - 24, "the scope does not fit a phone: " + w);
    /* 1. All Cards, Mudkip: #60 is with a Trusted Partner, #59 is not */
    await page.locator(".mcs-dtile[data-dex='258']").tap(); await page.waitForTimeout(900);
    const c60 = page.locator("button.mcs-dcell[aria-label='Mudkip, Ruby & Sapphire #60']");
    const c59 = page.locator("button.mcs-dcell[aria-label='Mudkip, Ruby & Sapphire #59']");
    await c60.waitFor();
    eq((await c60.locator(".mcs-dshop").innerText()).trim(), "With a Trusted Partner");
    eq(await c59.locator(".mcs-dshop").count(), 0, "#59 is marked with nothing available");
    assert(!/At your shops|At my shops/.test(await body()), "the old storefront words remain");
    await shot("f5a1-01-all-cards");
    /* 2. the card: Northline's two copies, under its name */
    await c60.tap(); await page.locator(".mcs-cd-shops").waitFor();
    const shop = await page.locator(".mcs-cd-shops").innerText();
    assert(/^Available from your Trusted Partners/.test(shop.trim()) && /Northline Cards/.test(shop) && /Normal · Raw · Near Mint/.test(shop)
      && /Proposed Market Price \$12 · Open to Offers/.test(shop) && /Reverse Holo · PSA 9/.test(shop) && /Proposed Market Price \$85 · Firm on Price/.test(shop), shop);
    await noFaraway("the card");
    await page.evaluate(() => { const sc = document.querySelector(".mcs-cd-scroll"); const q = document.querySelector(".mcs-cd-ident"); if (sc && q) sc.scrollTop = q.offsetTop - 64; });
    await shot("f5a1-05-card-available-from-partners");
    await page.locator(".mcs-cd-back").tap(); await page.waitForTimeout(500);
    await c59.tap(); await page.locator(".mcs-cd-noshop", { hasText: "None of your Trusted Partners has this card available right now." }).waitFor();
    await page.locator(".mcs-cd-back").tap(); await page.waitForTimeout(500);
    /* 3. Trusted Partners, Mudkip kept: only #60 — asked of the server */
    await setScope("partners");
    eq(await scopeOn(), "partners");
    assert(/atMyShops=1/.test(finds[finds.length - 1]) && /pokedex=258/.test(finds[finds.length - 1]), finds[finds.length - 1]);
    eq(await page.locator("button.mcs-dcell").count(), 1);
    assert(/Pokémon: Mudkip/.test(await body()), "the Pokémon chosen was lost");
    await shot("f5a1-02-trusted-partners");
    /* 4. a matching search across Trusted Partners: Charizard, kept when switching scope */
    await page.locator(".mcs-dchip", { hasText: "Pokémon: Mudkip" }).tap(); await page.waitForTimeout(600);
    await page.locator(".mcs-dsearch-in").fill("charizard"); await page.waitForTimeout(1200);
    const labels = await page.locator("button.mcs-dcell").evaluateAll((xs) => xs.map((x) => x.getAttribute("aria-label")));
    eq(JSON.stringify(labels), JSON.stringify(["Charizard, Base Set #4"]), "the matching search");
    assert(/atMyShops=1/.test(finds[finds.length - 1]) && /query=charizard/.test(finds[finds.length - 1]), finds[finds.length - 1]);
    await page.locator(".mcs-dsearch-in").blur();
    await shot("f5a1-03-matching-search");
    /* 5. an empty Trusted Partners result: Pikachu (only Faraway has one) */
    await page.locator(".mcs-dsearch-in").fill(""); await page.waitForTimeout(400);
    await setScope("all");
    await page.locator(".mcs-dtile[data-dex='25']").tap(); await page.waitForTimeout(900);
    eq(await page.locator("button.mcs-dcell .mcs-dshop").count(), 0, "a Pikachu is marked though only an unconnected partner has one");
    await setScope("partners");
    await page.locator(".mcs-dempty", { hasText: "No matching cards are available from your Trusted Partners right now." }).waitFor();
    await noFaraway("Pikachu");
    await shot("f5a1-04-empty-trusted-partners");
    await page.locator(".mcs-dempty button", { hasText: "Browse all cards" }).tap(); await page.waitForTimeout(900);
    eq(await scopeOn(), "all"); assert(/Pokémon: Pikachu/.test(await body()), "Browse all cards lost the Pokémon chosen");
    assert(await page.locator("button.mcs-dcell").count() >= 2, "All Cards did not come back");
    /* 6. nothing written */
    const v1 = await viewOf();
    eq(JSON.stringify([v1.version, v1.state.goals.length, (v1.state.opportunities || []).length, v1.state.inventory.length]),
      JSON.stringify([v0.version, v0.state.goals.length, (v0.state.opportunities || []).length, v0.state.inventory.length]), "browsing wrote something");
    eq(commands.length, 0, "a command was sent: " + commands.join(" "));
    eq(errors.length, 0, errors.join(" | "));
    await context.close();
  });
});

/* P6-F5B — DISCOVERY TO MARKET VALIDATION, through production, on a FRESH
   review world (so earlier journeys' Goals do not decide the next step).
   Discover → Add as Primary Goal → Make an Offer → Deal Flow → the partner
   counters → the Collector accepts. Every step is the Collector's own. */
describe("From a Trusted Partner's copy to Market Validation, through production (P6-F5B)", () => {
  test("Add as Primary Goal (card stays open) → Make an Offer (composer on that copy) → $10 sent → counter $11 → accept → agreed $11, Proposed Market Price $12 kept; Secondary → Make it Primary; a grade mismatch routes to Binders", async () => {
    await before();
    const own = await serve();
    const context = await browser.newContext({ ...PHONE }); const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    const commands = []; page.on("request", (r) => { if (r.url().includes("/api/commands")) commands.push(JSON.parse(r.postData() || "{}").command); });
    const DIR = "artifacts/fidelity/f5b";
    require("fs").mkdirSync(DIR, { recursive: true });
    const shot = async (n) => { await page.waitForTimeout(400); await page.screenshot({ path: `${DIR}/${n}.png` }).catch(() => {}); };
    const W = () => own.world();
    const body = () => page.locator("body").innerText();
    const toShops = () => page.evaluate(() => { const sc = document.querySelector(".mcs-cd-scroll"); const q = document.querySelector(".mcs-cd-shops"); if (sc && q) sc.scrollTop = q.offsetTop - 180; });
    const n1 = own.ids.shops.n1; const n2 = own.ids.shops.n2;
    const row = (inv) => page.locator(`.mcs-cd-shops li[data-inv='${inv}']`);
    const openMudkip60 = async () => {
      await page.tap("nav[aria-label=Collector] button:has-text('Browse')"); await page.waitForTimeout(500);
      if (await page.locator(".mcs-dtile[data-dex='258']").count()) { await page.locator(".mcs-dtile[data-dex='258']").tap(); await page.waitForTimeout(900); }
      await page.locator("button.mcs-dcell[aria-label='Mudkip, Ruby & Sapphire #60']").tap();
      await page.locator(".mcs-cd-shops").waitFor(); await page.waitForTimeout(300);
    };
    const w0 = await W();

    await signIn(page, own.url);
    /* 1. the card: two Northline copies, no Goal → Add as Primary Goal on each */
    await openMudkip60();
    assert(await row(n1).locator("button", { hasText: /^Add as Primary Goal$/ }).count() === 1, await row(n1).innerText());
    assert(!/Faraway/.test(await body()), "an unconnected partner reached the card");
    await toShops(); await shot("f5b-01-card-copies-next-steps");
    eq(commands.length, 0, "browsing sent something");
    /* 2. Add as Primary Goal on the Normal Raw Near Mint copy: answers filled, nothing sent */
    await row(n1).locator("button", { hasText: /^Add as Primary Goal$/ }).tap(); await page.waitForTimeout(300);
    eq(commands.length, 0, "the prefill sent something");
    await shot("f5b-02-add-as-primary-goal-prefilled");
    await page.locator(".mcs-cd-add").tap();
    await page.locator(".mcs-cd-add.added, .mcs-cd-hint.ack, .mcs-cd-add", { hasText: /✓|Primary/ }).first().waitFor();
    await page.waitForTimeout(1500);
    assert(await page.locator(".mcs-cd").count() === 1, "the card closed after Add as Primary Goal");
    await row(n1).locator("button.mcs-cd-offer", { hasText: /^Make an Offer$/ }).waitFor();
    let w = await W();
    const goal = w.goals.find((g) => g.canonicalCardId === w.inventory.find((i) => i.invId === n1).canonicalCardId);
    eq(JSON.stringify([goal.tier, goal.desired]), JSON.stringify(["primary", { grade: "Raw", condition: "Near Mint" }]));
    eq(w.opportunities.length, w0.opportunities.length, "an opportunity was started automatically");
    await toShops(); await shot("f5b-03-make-an-offer-available");
    /* 3. Make an Offer → Deal Flow, composer open on that exact copy; nothing sent */
    const before3 = commands.length;
    await row(n1).locator("button.mcs-cd-offer").tap();
    await page.locator(`li.mcs-df-copy[data-inv='${n1}'] .mcs-offer`).waitFor();
    eq(commands.length, before3, "arriving in Deal Flow sent something");
    assert(/Northline Cards · Proposed Market Price \$12 · Open to Offers/.test(await page.locator(`li.mcs-df-copy[data-inv='${n1}']`).innerText()));
    await shot("f5b-04-deal-flow-composer");
    /* 4. the Collector's own opening: $10 */
    await page.locator(`li.mcs-df-copy[data-inv='${n1}'] input[aria-label='Offer, in whole dollars']`).fill("10");
    await page.locator(`li.mcs-df-copy[data-inv='${n1}'] button[type=submit]`).tap();
    await page.waitForTimeout(1200);
    w = await W();
    let opp = w.opportunities.find((o) => o.goalId === goal.id);
    eq(JSON.stringify([opp.invId, opp.listedPrice, opp.agreedPrice, opp.priceThread.map((p) => [p.by, p.type, p.amount])]),
      JSON.stringify([n1, 12, null, [["collector", "offer", 10]]]), "the opening");
    await shot("f5b-05-offer-sent");
    /* 5. the partner counters $11; the Collector sees it and accepts — explicitly */
    await own.postAs("north", "proposePrice", { oppId: opp.id, amount: 11 });
    await signIn(page, own.url);
    await page.tap("nav[aria-label=Collector] button:has-text('Deal Flow')"); await page.waitForTimeout(800);
    const accept = page.locator("button", { hasText: /^Accept \$11$/ });
    await accept.waitFor();
    w = await W(); eq(w.opportunities.find((o) => o.id === opp.id).agreedPrice, null, "a counter was taken as agreement");
    await shot("f5b-06-partner-counter");
    await accept.tap(); await page.waitForTimeout(1200);
    w = await W(); opp = w.opportunities.find((o) => o.id === opp.id);
    eq(JSON.stringify([opp.listedPrice, opp.agreedPrice]), JSON.stringify([12, 11]), "agreed price not stored apart from the Proposed Market Price");
    await shot("f5b-07-agreed-market-price");
    /* the copy is not reserved merely because a deal started */
    eq(w.inventory.find((i) => i.invId === n1).archived === true, false);
    /* 6. back on the card: under way, Open in Deal Flow (a link) */
    await openMudkip60();
    assert(/Your offer for this card is under way with Northline Cards\./.test(await row(n1).innerText()) || /under way/.test(await body()), await body());
    /* 7. Secondary → Make it Primary on the Reverse Holo copy */
    const rev = w.inventory.find((i) => i.invId === n2).canonicalCardId;
    await own.post("addGoal", { canonicalCardId: rev, tier: "secondary", desired: { grade: "PSA 9" } });
    await signIn(page, own.url); await openMudkip60();
    await row(n2).locator("button", { hasText: /^Make it Primary$/ }).waitFor();
    await toShops(); await shot("f5b-08-secondary-make-it-primary");
    await row(n2).locator("button", { hasText: /^Make it Primary$/ }).tap();
    await row(n2).locator("button.mcs-cd-offer", { hasText: /^Make an Offer$/ }).waitFor();
    w = await W(); eq(w.goals.filter((g) => g.canonicalCardId === rev).map((g) => g.tier).join(), "primary", "not one Goal, now Primary");
    await toShops(); await shot("f5b-09-primary-make-an-offer");
    /* 8. a grade mismatch (Charizard: Goal PSA 9, Northline PSA 8) → Edit your Goal in Binders */
    await page.locator(".mcs-cd-back").tap(); await page.waitForTimeout(400);
    if (await page.locator(".mcs-dchip.clearall").count()) { await page.locator(".mcs-dchip.clearall").tap(); await page.waitForTimeout(400); }
    await page.locator(".mcs-dsearch-in").fill("charizard"); await page.waitForTimeout(1200);
    await page.locator("button.mcs-dcell[aria-label='Charizard, Base Set #4']").tap(); await page.locator(".mcs-cd-shops").waitFor();
    const charRow = page.locator(`.mcs-cd-shops li[data-inv='${own.ids.shops.n3}']`);
    assert(/Your Goal is for PSA 9; this copy is PSA 8\./.test(await charRow.innerText()), await charRow.innerText());
    await toShops(); await shot("f5b-10-grade-mismatch");
    await charRow.locator("button", { hasText: /^Edit your Goal in Binders$/ }).tap(); await page.waitForTimeout(800);
    assert(/^Your Goal: Charizard/.test(await page.locator(".mcs-ce").getAttribute("aria-label")), "Binders did not open the Goal");
    eq((await W()).goals.find((g) => g.id === own.ids.goal).desired.grade, "PSA 9", "the Goal was changed for them");
    /* every command was one the Collector pressed for */
    eq(JSON.stringify(commands), JSON.stringify(["addGoal", "startOpportunity", "acceptPrice", "changeCollectingState"]), "unexpected commands: " + JSON.stringify(commands));
    eq(errors.length, 0, errors.join(" | "));
    await context.close(); own.server.close();
  });
});

if (!chromium) {
  console.log("SKIPPED: Playwright is not installed.");
} else {
  run().finally(async () => { if (browser) await browser.close(); if (ctx) ctx.server.close(); });
}
