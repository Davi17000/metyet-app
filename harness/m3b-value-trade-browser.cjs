/* ============================================================================
   M3B B4 — VALUE TRADE IN A REAL BROWSER, BOTH SEATS, ONE WORLD
   Google Chrome (Playwright) on the real production app — the real <SignIn/>
   front door, store, API client and shells — talking to the real server over
   in-process PGlite with every migration (harness/phase6-world.cjs), on a port
   of its own. Casey on an emulated phone (390 × 844 — an emulation, not a real
   iPhone); Northline at a desk, its page's bearer rewritten to Northline's
   token (the server verifies it like any other; nothing is bypassed).

     1  the cards are held: Casey's Value Trade and Deal Summary, nothing valued
     2  Casey opens both market values on her phone
     3  Northline accepts one, counters the other, opens a %
     4  Casey accepts the counter, counters the %: the amounts may change
     5  every card agreed: values read-only, "You Owe" / "You Receive" settled
   Every step is checked in the database as well as on screen.

   THEN THE DEAL SUMMARY, SIDE BY SIDE (M3B B4 refinement). A second world with
   four deals — Casey owes the shop, the shop owes Casey, an even trade, and
   one still being valued — each summary photographed on BOTH seats at phone
   width (390 × 844), so the two perspectives can be compared directly. The
   one featured card with catalogue artwork in the review world (Mudkip, the
   review-only artwork exception in phase6-world.cjs) shows the picture; the
   others show the neutral plate.
   Screenshots: artifacts/m3b-value-trade/. Run: `node harness/m3b-value-trade-browser.cjs`.
   ========================================================================== */
const fs = require("fs");
const path = require("path");
const { describe, test, assert, eq, run } = require("../tests/run.cjs");

let chromium = null;
try { ({ chromium } = require("playwright")); } catch (e) { chromium = null; }
const { serve, PHONE, signIn, ROOT } = require("./phase6-world.cjs");
const D = require("../domain/metyet-domain.js");
const json = (v) => JSON.stringify(v);
const OUT = path.join(ROOT, "artifacts", "m3b-value-trade");

async function seed({ card, post, postAs }) {
  const char = await card("4", "Charizard", "holofoil");
  const pika = await card("58", "Pikachu", "non_holo");
  const blas = await card("2", "Blastoise", "holofoil");
  const ids = {};
  ids.char = await post("addCollectorCopy", { copy: { canonicalCardId: char, grade: "PSA 9", cert: "CERT-AAA", offered: true } });
  ids.pika = await post("addCollectorCopy", { copy: { canonicalCardId: pika, grade: "Raw", condition: "Near Mint", offered: true } });
  const g = await post("addGoal", { canonicalCardId: blas, tier: "primary", desired: { grade: "PSA 8" } });
  const inv = await postAs("north", "addInventoryCopy", { copy: { canonicalCardId: blas, grade: "PSA 8", cert: "NL-0001", ask: 545 } });
  ids.nl = await post("startOpportunity", { goalId: g, invId: inv, amount: 545 });
  await postAs("north", "acceptPrice", { oppId: ids.nl });
  await postAs("north", "selectTradeCards", { oppId: ids.nl, copyIds: [ids.char, ids.pika] });
  await post("continueTradeSelection", { oppId: ids.nl });
  await postAs("north", "closeTradeSelection", { oppId: ids.nl });
  return ids;
}

let ctx = null; let browser = null;
const errors = [];
const shot = async (page, name) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true }); };
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ");
const deal = async () => (await ctx.world()).opportunities.find((o) => o.id === ctx.ids.nl);
const rowFor = async (copyId) => (await deal()).trade.cards.find((r) => r.binderId === copyId && r.inclusion === "accepted" && !r.withdrawn);

async function shop({ phone = false } = {}) {
  const context = await browser.newContext(phone ? { ...PHONE } : { viewport: { width: 1280, height: 900 } });
  await context.route("**/api/**", (route) => {
    const headers = { ...route.request().headers() };
    if (headers.authorization) headers.authorization = "Bearer north";
    route.continue({ headers });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`north: ${e.message}`));
  const open = async () => {
    await page.goto(`${ctx.url}app`);
    await page.fill("#metyet-email", "north@example.invalid"); await page.click("button[type=submit]");
    await page.fill("#metyet-code", "123456"); await page.click("button[type=submit]");
    await page.waitForSelector("nav[aria-label='Trusted Partner']");
    await page.click("nav[aria-label='Trusted Partner'] button:has-text('Opportunities')");
    await page.waitForTimeout(500);
  };
  await open();
  return { page, reload: open, panel: () => page.locator(`section[data-value='${ctx.ids.nl}']`),
    summary: (id = ctx.ids.nl) => page.locator(`section[data-summary='${id}']`) };
}
async function collector(deal = () => ctx.ids.nl) {
  const context = await browser.newContext({ ...PHONE });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`casey: ${e.message}`));
  let id = deal();
  const open = async (next = id) => {
    id = next;
    await signIn(page, ctx.url);
    await page.tap("nav[aria-label=Collector] button:has-text('Deal Flow')"); await page.waitForTimeout(500);
    const cta = page.locator(`.mcs-dg-deal[data-opp='${id}'] button.mcs-dg-cta`);
    await cta.scrollIntoViewIfNeeded(); await cta.tap(); await page.waitForTimeout(600);
  };
  await open();
  return { page, reload: open, panel: () => page.locator(`section[data-value='${id}']`),
    summary: () => page.locator(`section[data-summary='${id}']`) };
}

describe("Value Trade, both seats, one world (M3B B4)", () => {
  test("open → counter → agree card by card; the Deal Summary follows on the phone", async () => {
    if (!chromium) { console.log("  (Playwright is not installed — skipped)"); return; }
    ctx = await serve({ seed, label: "m3b-value-trade" });
    browser = await chromium.launch({ channel: "chrome" });
    fs.mkdirSync(OUT, { recursive: true });
    const { ids } = ctx;
    const r1 = (await rowFor(ids.char)).id; const r2 = (await rowFor(ids.pika)).id;

    /* 1. Held: Casey's move on both cards; the summary shows nothing valued. */
    const casey = await collector();
    assert(/Your move — 2 cards waiting on you\./.test(await text(casey.panel())), await text(casey.panel()));
    assert(/You Owe \$545 You Receive \$0/.test(await text(casey.summary())) && /Current amounts These amounts may change until all trade-in values are agreed\./i.test(await text(casey.summary())));
    await shot(casey.page, "01-collector-held");

    /* 2. She opens both market values on her phone. */
    for (const [r, v] of [[r1, "400"], [r2, "160"]]) {
      const li = casey.panel().locator(`li[data-row='${r}']`);
      await li.locator("button:has-text('Propose a market value')").tap();
      await li.locator("input").fill(v);
      await li.locator("button[type=submit]").tap(); await casey.page.waitForTimeout(500);
    }
    eq(json([(await rowFor(ids.char)).collectorMarket, (await rowFor(ids.pika)).collectorMarket]), json([400, 160]), "her figures, on the server");
    await shot(casey.page, "02-collector-proposed");

    /* 3. Northline: accept Charizard's, counter Pikachu's, open Charizard's %. */
    const north = await shop();
    assert(/Your move — 2 cards waiting on you\./.test(await text(north.panel())), await text(north.panel()));
    await north.panel().locator(`li[data-row='${r1}'] button:has-text('Accept $400')`).click(); await north.page.waitForTimeout(500);
    let li = north.panel().locator(`li[data-row='${r2}']`);
    await li.locator("button:has-text('Counter')").click(); await li.locator("input").fill("140");
    await li.locator("button[type=submit]").click(); await north.page.waitForTimeout(500);
    li = north.panel().locator(`li[data-row='${r1}']`);
    await li.locator("button:has-text('Propose a %')").click(); await li.locator("input").fill("80");
    await li.locator("button[type=submit]").click(); await north.page.waitForTimeout(500);
    await shot(north.page, "03-tp-answered");

    /* 4. Casey: accept the $140 counter, counter the % at 85. */
    await casey.reload();
    await casey.panel().locator(`li[data-row='${r2}'] button:has-text('Accept $140')`).tap(); await casey.page.waitForTimeout(500);
    li = casey.panel().locator(`li[data-row='${r1}']`);
    await li.locator("button:has-text('Counter')").tap(); await li.locator("input").fill("85");
    await li.locator("button[type=submit]").tap(); await casey.page.waitForTimeout(500);
    eq((await rowFor(ids.char)).collectorPercent, 0.85);
    await shot(casey.page, "04-collector-provisional");

    /* 5. Northline accepts 85% and opens Pikachu's at 75%; Casey accepts: every card agreed. */
    await north.reload();
    await north.panel().locator(`li[data-row='${r1}'] button:has-text('Accept 85%')`).click(); await north.page.waitForTimeout(500);
    li = north.panel().locator(`li[data-row='${r2}']`);
    await li.locator("button:has-text('Propose a %')").click(); await li.locator("input").fill("75");
    await li.locator("button[type=submit]").click(); await north.page.waitForTimeout(500);
    await casey.reload();
    await casey.panel().locator(`li[data-row='${r2}'] button:has-text('Accept 75%')`).tap(); await casey.page.waitForTimeout(600);
    const d = await deal();
    eq(d.stage, "deal", "every card valued");
    eq(D.calculatedBalance(d), 545 - 340 - 105, "the domain's balance");
    const sum = await text(casey.summary());
    assert(/\$400 × 85% = −\$340/.test(sum) && /\$140 × 75% = −\$105/.test(sum) && /You Owe \$100 You Receive \$0/.test(sum), sum);
    eq(await casey.panel().locator("button").count(), 0, "a control once every card is agreed");
    await shot(casey.page, "05-collector-values-agreed");
    await north.reload();
    assert(/You Owe \$0 You Receive \$100/.test(await text(north.summary())), await text(north.summary()));
    await shot(north.page, "06-tp-values-agreed");
    eq(json(errors), json([]), "a page error");
  });
});

/* ------------------------------------------- THE DEAL SUMMARY, SIDE BY SIDE */
const MUDKIP = { code: "ex1", name: "Ruby & Sapphire", printedTotal: 109 };
const JUNGLE = { code: "ju", name: "Jungle", printedTotal: 64 };
const PROMO = { code: "bsp", name: "Black Star Promos", printedTotal: null };
async function seedSummaries({ card, post, postAs }) {
  const ids = {};
  const deal = async (key, { featured, grade, condition = null, cert = null, ask, trade }) => {
    const desired = grade === "Raw" ? { grade, condition } : { grade };
    const g = await post("addGoal", { canonicalCardId: featured, tier: "primary", desired });
    const inv = await postAs("north", "addInventoryCopy", { copy: { canonicalCardId: featured, grade, ...(condition ? { condition } : {}), ...(cert ? { cert } : {}), ask } });
    const copies = [];
    for (const t of trade) copies.push(await post("addCollectorCopy", { copy: { ...t, offered: true } }));
    const opp = await post("startOpportunity", { goalId: g, invId: inv, amount: ask });
    await postAs("north", "acceptPrice", { oppId: opp });
    await postAs("north", "selectTradeCards", { oppId: opp, copyIds: copies });
    await post("continueTradeSelection", { oppId: opp });
    await postAs("north", "closeTradeSelection", { oppId: opp });
    ids[key] = opp; ids[`${key}Copies`] = copies;
  };
  /* A — Casey owes: a $650 Mudkip (catalogue art), a graded Charizard at $530 × 50% = $265. */
  await deal("owe", { featured: await card("60", "Mudkip", "non_holo", MUDKIP), grade: "PSA 9", cert: "NL-A9", ask: 650,
    trade: [{ canonicalCardId: await card("4", "Charizard", "holofoil"), grade: "PSA 9", cert: "CERT-AAA" }] });
  /* B — the shop owes: a $300 raw Venusaur, a raw Blastoise at $500 × 90% = $450. */
  await deal("receive", { featured: await card("15", "Venusaur", "holofoil"), grade: "Raw", condition: "Near Mint", ask: 300,
    trade: [{ canonicalCardId: await card("2", "Blastoise", "holofoil"), grade: "Raw", condition: "Lightly Played" }] });
  /* C — even: a $300 Mewtwo, a raw Jungle Pikachu at $375 × 80% = $300. */
  await deal("even", { featured: await card("10", "Mewtwo", "holofoil"), grade: "PSA 8", cert: "NL-M8", ask: 300,
    trade: [{ canonicalCardId: await card("60", "Pikachu", "non_holo", JUNGLE), grade: "Raw", condition: "Near Mint" }] });
  /* D — still being valued: a $400 promo Dragonite (no printed total), a graded Gengar and a raw Snorlax. */
  await deal("open", { featured: await card("4", "Dragonite", "holofoil", PROMO), grade: "PSA 10", cert: "NL-D10", ask: 400,
    trade: [{ canonicalCardId: await card("5", "Gengar", "holofoil", { code: "fo", name: "Fossil", printedTotal: 62 }), grade: "PSA 10", cert: "CERT-GGG" },
      { canonicalCardId: await card("27", "Snorlax", "non_holo", JUNGLE), grade: "Raw", condition: "Moderately Played" }] });
  return ids;
}

/* A picture is photographed once it has arrived (or failed), not mid-load. */
const loaded = async (loc) => { await loc.scrollIntoViewIfNeeded();
  await loc.locator("img").evaluateAll((imgs) => Promise.all(imgs.map((i) => (i.complete ? 0
    : new Promise((r) => { i.addEventListener("load", r); i.addEventListener("error", r); setTimeout(r, 5000); }))))); };
describe("The Deal Summary on both seats, side by side (M3B B4 refinement)", () => {
  test("owe / receive / even / still valuing: the same summary, mirrored amounts, on two phones", async () => {
    if (!chromium) { console.log("  (Playwright is not installed — skipped)"); return; }
    if (ctx) ctx.server.close();
    ctx = await serve({ seed: seedSummaries, label: "m3b-deal-summary" });
    const { ids } = ctx;
    const rowsOf = async (opp) => (await ctx.world()).opportunities.find((o) => o.id === opp).trade.cards
      .filter((r) => r.inclusion === "accepted" && !r.withdrawn).map((r) => r.id);
    const as = (who) => (who === "casey" ? ctx.post : (c, p) => ctx.postAs("north", c, p));
    const settle = async (opp, m, p) => {
      const [r] = await rowsOf(opp);
      await as("casey")("proposeMarketValue", { oppId: opp, tradeCardId: r, amount: m });
      await as("north")("acceptMarketValue", { oppId: opp, tradeCardId: r });
      await as("north")("proposeTradePercent", { oppId: opp, tradeCardId: r, percent: p });
      await as("casey")("acceptTradePercent", { oppId: opp, tradeCardId: r });
    };
    await settle(ids.owe, 530, 0.5); await settle(ids.receive, 500, 0.9); await settle(ids.even, 375, 0.8);
    const [g, sn] = await rowsOf(ids.open);
    await as("casey")("proposeMarketValue", { oppId: ids.open, tradeCardId: g, amount: 200 });
    await as("casey")("proposeMarketValue", { oppId: ids.open, tradeCardId: sn, amount: 90 });
    await as("north")("acceptMarketValue", { oppId: ids.open, tradeCardId: g });
    await as("north")("proposeTradePercent", { oppId: ids.open, tradeCardId: g, percent: 0.7 });
    const worldNow = await ctx.world();
    const balance = (opp) => D.calculatedBalance(worldNow.opportunities.find((o) => o.id === opp));
    eq(json([balance(ids.owe), balance(ids.receive), balance(ids.even), balance(ids.open)]), json([385, -150, 0, 400]), "the domain's balances");

    const casey = await collector(() => ids.owe);
    const north = await shop({ phone: true });
    const facts = (t) => t.replace(/You Owe \S+ You Receive \S+/, "<pay>");
    const expect = { owe: ["$385", "$0", "$0", "$385"], receive: ["$0", "$150", "$150", "$0"], even: ["$0", "$0", "$0", "$0"], open: ["$400", "$0", "$0", "$400"] };
    for (const [key, n] of [["owe", "07"], ["receive", "09"], ["even", "11"], ["open", "12"]]) {
      if (key !== "owe") await casey.reload(ids[key]);
      const mine = await text(casey.summary());
      const sum = north.summary(ids[key]);
      await sum.scrollIntoViewIfNeeded();
      const theirs = await text(sum);
      eq(facts(theirs), facts(mine), `${key}: the two seats' summaries differ`);
      const [co, cr, to, tr] = expect[key];
      assert(mine.includes(`You Owe ${co} You Receive ${cr}`), `${key} collector: ${mine}`);
      assert(theirs.includes(`You Owe ${to} You Receive ${tr}`), `${key} shop: ${theirs}`);
      assert(/Current amounts These amounts may change until all trade-in values are agreed\./i.test(mine) === (key === "open"), `${key}: the may-change note`);
      for (const loc of [casey.summary(), sum]) await loaded(loc);
      await casey.summary().screenshot({ path: path.join(OUT, `${n}a-collector-summary-${key}.png`) });
      await sum.screenshot({ path: path.join(OUT, `${n}b-tp-summary-${key}.png`) });
    }
    /* The identification, on the phone: the printed total, the fallback, a graded trade-in. */
    await casey.reload(ids.owe);
    const owe = await text(casey.summary());
    assert(/Mudkip Ruby & Sapphire · 60\/109 English · Normal PSA 9 · Cert NL-A9 Agreed price \$650/i.test(owe), owe);
    assert(/Charizard · Base Set · 4\/102 English · Holo · PSA 9 · Cert CERT-AAA \$530 × 50% = −\$265/.test(owe), owe);
    const art = casey.summary().locator("img");
    if (await art.count()) assert(/tcgdex/.test(await art.first().getAttribute("src")) && /Catalogue image/.test(owe), "the catalogue picture");
    await shot(casey.page, "08-collector-workspace-owe");
    await casey.reload(ids.open);
    const open = await text(casey.summary());
    assert(/Dragonite Black Star Promos · #4 /.test(open) && /Gengar · Fossil · 5\/62 English · Holo · PSA 10 · Cert CERT-GGG/.test(open), open);
    assert(/Snorlax · Jungle · 27\/64 English · Normal · Moderately Played · Ungraded/.test(open), open);
    await north.page.screenshot({ path: path.join(OUT, "13-tp-opportunities-phone.png"), fullPage: true });
    eq(json(errors), json([]), "a page error");
  });
});

run().finally(async () => { if (browser) await browser.close(); if (ctx) ctx.server.close(); });
