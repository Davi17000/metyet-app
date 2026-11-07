/* ============================================================================
   M3A A3 — SELECT TRADE IN A REAL BROWSER, TWO ROLES, ONE WORLD
   Google Chrome (Playwright) on the real production app — the real <SignIn/>
   front door, store, API client and shells — talking to the real server
   (createApp: auth verifier, allow-list, command transaction, domain) over
   in-process PGlite with every migration (harness/phase6-world.cjs). Every
   outcome is checked in the database as well as on screen.

   THREE SEATS, NO PERSON SWITCHING THEM. Casey on a phone; Northline and
   Silver Vale, both connected to Casey, at a desk. The review world's page
   signs in with the fixed token "casey"; a shop's page is the same page with
   its bearer rewritten in the browser to that shop's token. That changes WHO
   the server is told is asking — it verifies the token, finds the account and
   applies the same allow-list and permissions as for anyone — and nothing
   else: no route, check or command is bypassed.

     1  Northline chooses two copies of one printing — on screen, "Not sent
        yet" — and sends them in one command; Silver Vale chooses one of them too
     2  Casey sees the exact copies, takes one out (after a confirmation), and
        says she's ready
     3  Northline starts valuing after a confirmation: held, Value Trade honest
     4  Silver Vale's chosen copy is now held elsewhere: marked before it presses
        anything; its close is refused naming its own row; it removes it
     5  Casey tries to make a held card PC: refused, and told why
   Screenshots: artifacts/a3-select-trade/. Run with `npm run ux:select-trade-browser`.
   ========================================================================== */
const fs = require("fs");
const path = require("path");
const { describe, test, assert, eq, run } = require("../tests/run.cjs");

let chromium = null;
try { ({ chromium } = require("playwright")); } catch (e) { chromium = null; }
const { serve, PHONE, signIn, ROOT } = require("./phase6-world.cjs");
const D = require("../domain/metyet-domain.js");
const json = (v) => JSON.stringify(v);
const OUT = path.join(ROOT, "artifacts", "a3-select-trade");

/* Casey's shelf and two deals at an agreed price, through production's doors. */
async function selectTradeSeed({ card, post, postAs }) {
  const char = await card("4", "Charizard", "holofoil");
  const blas = await card("2", "Blastoise", "holofoil");
  const mud = await card("60", "Mudkip", "non_holo", { code: "ex1", name: "Ruby & Sapphire", printedTotal: 109 });
  const pika = await card("58", "Pikachu", "non_holo");
  const ids = {};
  ids.a = await post("addCollectorCopy", { copy: { canonicalCardId: char, grade: "PSA 9", cert: "CERT-AAA", photos: { front: "x:f", back: "x:b" }, offered: true } });
  ids.b = await post("addCollectorCopy", { copy: { canonicalCardId: char, grade: "PSA 7", cert: "CERT-BBB", offered: true } });
  ids.blas = await post("addCollectorCopy", { copy: { canonicalCardId: blas, grade: "Raw", condition: "Near Mint", offered: true } });
  ids.pc = await post("addCollectorCopy", { copy: { canonicalCardId: char, grade: "PSA 10", cert: "CERT-KEEP", keeping: true } });
  const g1 = await post("addGoal", { canonicalCardId: mud, tier: "primary", desired: { grade: "PSA 9" } });
  const g2 = await post("addGoal", { canonicalCardId: pika, tier: "primary", desired: { grade: "PSA 9" } });
  const i1 = await postAs("north", "addInventoryCopy", { copy: { canonicalCardId: mud, grade: "PSA 9", ask: 300 } });
  const i2 = await postAs("silver", "addInventoryCopy", { copy: { canonicalCardId: pika, grade: "PSA 9", ask: 200 } });
  ids.nl = await post("startOpportunity", { goalId: g1, invId: i1, amount: 300 });
  await postAs("north", "acceptPrice", { oppId: ids.nl });
  ids.sv = await post("startOpportunity", { goalId: g2, invId: i2, amount: 200 });
  await postAs("silver", "acceptPrice", { oppId: ids.sv });
  return ids;
}

let ctx = null; let browser = null;
const errors = [];
const before = async () => {
  if (!ctx) ctx = await serve({ seed: selectTradeSeed, label: "a3-select-trade",
    morePartners: [{ id: "p-silver", name: "Silver Vale", token: "silver" }] });
  if (!browser) browser = await chromium.launch({ channel: "chrome" });
  fs.mkdirSync(OUT, { recursive: true });
};
const shot = async (page, name) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true }); };

/* A shop's page: the same front door, its bearer rewritten to the shop's. */
async function shop(token, width = 1280) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const commands = [];
  await context.route("**/api/**", (route) => {
    const headers = { ...route.request().headers() };
    if (headers.authorization) headers.authorization = `Bearer ${token}`;
    if (route.request().method() === "POST" && /\/api\/commands$/.test(route.request().url())) {
      commands.push(JSON.parse(route.request().postData() || "{}").command);
    }
    route.continue({ headers });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${token}: ${e.message}`));
  const open = async () => {
    await page.goto(`${ctx.url}app`);
    await page.fill("#metyet-email", `${token}@example.invalid`); await page.click("button[type=submit]");
    await page.fill("#metyet-code", "123456"); await page.click("button[type=submit]");
    await page.waitForSelector("nav[aria-label='Trusted Partner']");
    await page.click("nav[aria-label='Trusted Partner'] button:has-text('Opportunities')");
    await page.waitForTimeout(500);
  };
  await open();
  return { page, context, commands, reload: open };
}
async function collector() {
  const context = await browser.newContext({ ...PHONE });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`casey: ${e.message}`));
  const commands = []; page.on("request", (r) => { if (/\/api\/commands$/.test(r.url())) commands.push(JSON.parse(r.postData() || "{}").command); });
  await signIn(page, ctx.url);
  /* Coming back to the app: a fresh sign-in reads the server again. */
  const reload = async () => { await signIn(page, ctx.url); };
  const openDeal = async (oppId) => {
    if (await page.locator(`.mcs-ws[data-opp='${oppId}']`).count()) return;
    if (await page.locator(".mcs-ws-back").count()) { await page.tap(".mcs-ws-back"); await page.waitForTimeout(300); }
    await page.tap("nav[aria-label=Collector] button:has-text('Deal Flow')"); await page.waitForTimeout(500);
    const cta = page.locator(`.mcs-dg-deal[data-opp='${oppId}'] button.mcs-dg-cta`);
    await cta.scrollIntoViewIfNeeded(); await cta.tap(); await page.waitForTimeout(500);
  };
  return { page, context, commands, openDeal, reload };
}
const panelOf = (page, oppId) => page.locator(`section[data-select='${oppId}']`);
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ");
const deal = async (id) => (await ctx.world()).opportunities.find((o) => o.id === id);
const live = async (id) => D.TRADE.liveTradeRows(await deal(id)).map((r) => r.binderId).sort();

describe("Select Trade, two roles, one world (M3A A3)", () => {
  test("choose → take one out → ready → confirm → held; a rival is told; a held card stays Trade/Sell", async () => {
    await before();
    const { ids } = ctx;
    const north = await shop("north");
    const silver = await shop("silver");
    const casey = await collector();

    /* 1. Northline gathers two copies of one printing, then sends once. */
    let p = panelOf(north.page, ids.nl);
    assert(/Choose the cards you'd consider from Casey's Trade\/Sell cards/.test(await text(p)), await text(p));
    await p.locator(`li[data-copy='${ids.a}'] button:has-text('Choose')`).click();
    await p.locator(`li[data-copy='${ids.b}'] button:has-text('Choose')`).click();
    assert(/2 cards chosen · Not sent yet/.test(await text(p)), "not labelled unsent");
    eq(north.commands.length, 0, "a choice sent a command");
    await shot(north.page, "01-tp-draft-not-sent");
    await p.locator("button:has-text('Send 2 cards to Casey')").click(); await north.page.waitForTimeout(600);
    eq(json(north.commands), json(["selectTradeCards"]), "one command for the first choice");
    eq(json(await live(ids.nl)), json([ids.a, ids.b].sort()), "the exact copies, server-side");
    assert(/Waiting for Casey/.test(await text(panelOf(north.page, ids.nl))));
    await shot(north.page, "02-tp-sent-waiting");
    /* Silver Vale chooses one of the same copies: allowed, and invisible to Northline. */
    const sp = panelOf(silver.page, ids.sv);
    await sp.locator(`li[data-copy='${ids.a}'] button:has-text('Choose')`).click();
    await sp.locator("button:has-text('Send 1 card to Casey')").click(); await silver.page.waitForTimeout(600);
    eq(json(await live(ids.sv)), json([ids.a]), "both shops have chosen it");

    /* 2. Casey comes back to the app, sees the exact copies, takes one out
       after a confirmation, and says she's ready. */
    await casey.reload();
    await casey.openDeal(ids.nl);
    const area = panelOf(casey.page, ids.nl);
    assert(/Northline Cards chose 2 cards to consider/.test(await text(area)), await text(area));
    assert(/CERT-AAA/.test(await text(area)) && /CERT-BBB/.test(await text(area)), "the two copies told apart");
    await shot(casey.page, "03-collector-chosen");
    const rowB = D.TRADE.liveTradeRows(await deal(ids.nl)).find((r) => r.binderId === ids.b).id;
    await area.locator(`li[data-row='${rowB}'] button:has-text('Take out of this deal')`).tap();
    assert(/It stays in your Trade\/Sell cards/.test(await text(area)), "the confirmation says what it means");
    await shot(casey.page, "04-collector-take-out-confirm");
    await area.locator("button:has-text('Take it out')").tap(); await casey.page.waitForTimeout(600);
    eq(json(await live(ids.nl)), json([ids.a]), "only that card left");
    eq((await ctx.world()).collectorCopies.find((b) => b.id === ids.b).offered, true, "still Trade/Sell");
    await area.locator("button:has-text(\"I'm ready\")").tap(); await casey.page.waitForTimeout(600);
    eq(D.nextActor(await deal(ids.nl)).reason, "close-selection");
    await casey.openDeal(ids.sv);
    await panelOf(casey.page, ids.sv).locator("button:has-text(\"I'm ready\")").tap(); await casey.page.waitForTimeout(600);
    await shot(casey.page, "05-collector-ready");

    /* 3. Northline starts valuing, after a confirmation: held, and Value Trade honest. */
    await north.reload(); p = panelOf(north.page, ids.nl);
    await p.locator("button:has-text('Start valuing 1 card')").click();
    assert(/held for this deal and can't be chosen in another one/.test(await text(p)), await text(p));
    await shot(north.page, "06-tp-confirm-close");
    await p.locator(".tps-sel-confirm button:has-text('Start valuing')").click(); await north.page.waitForTimeout(700);
    eq((await deal(ids.nl)).stage, "value-trade");
    eq(D.collectorCopyStatus(ids.a, (await ctx.world()).opportunities), "reserved", "held");
    assert(/These cards are now held for this deal\./.test(await text(p)) && /Value Trade isn't available in MetYet yet/.test(await text(p)), await text(p));
    await shot(north.page, "07-tp-held-value-trade-honest");
    await casey.reload();
    await casey.openDeal(ids.nl);
    assert(/Value Trade isn't available in MetYet yet/.test(await text(panelOf(casey.page, ids.nl))));
    await shot(casey.page, "08-collector-held");

    /* 4. Silver Vale: its chosen copy is held elsewhere — marked, refused, recovered. */
    await silver.reload();
    const sp2 = panelOf(silver.page, ids.sv);
    assert(/No longer available — remove it to continue/.test(await text(sp2)), await text(sp2));
    assert(!/Northline/.test(await text(sp2)), "the rival shop is named");
    await sp2.locator("button:has-text('Start valuing 1 card')").click();
    await sp2.locator(".tps-sel-confirm button:has-text('Start valuing')").click(); await silver.page.waitForTimeout(700);
    eq((await deal(ids.sv)).stage, "select-trade", "a refused close moved the deal");
    assert(/isn't available for this deal any more/.test(await text(sp2)), await text(sp2));
    await shot(silver.page, "09-rival-refused-named-row");
    const svRow = D.TRADE.liveTradeRows(await deal(ids.sv))[0].id;
    await sp2.locator(`li[data-row='${svRow}'] button:has-text('Remove')`).click(); await silver.page.waitForTimeout(600);
    eq((await live(ids.sv)).length, 0, "removed");
    await shot(silver.page, "10-rival-recovered");

    /* 5. Casey tries to make the held card PC from her Binders: refused, told why. */
    await casey.page.tap(".mcs-ws-back"); await casey.page.waitForTimeout(300);
    await casey.page.tap("nav[aria-label=Collector] button:has-text('Binders')"); await casey.page.waitForTimeout(500);
    const tile = casey.page.locator(`section[aria-label='Your Cards'] li.mcs-otile[data-key='c:${ids.a}'] button.mcs-otap`);
    await tile.scrollIntoViewIfNeeded(); await tile.tap(); await casey.page.locator("[role=dialog].mcs-ce").waitFor();
    await casey.page.locator("[role=dialog].mcs-ce [data-q=state] button[data-st=pc]").tap();
    await casey.page.locator("[role=dialog].mcs-ce button.mcs-cd-add").tap(); await casey.page.waitForTimeout(700);
    const said = await text(casey.page.locator("[role=dialog].mcs-ce"));
    assert(/part of a deal|chosen this copy for a deal/.test(said), said.slice(0, 500));
    eq((await ctx.world()).collectorCopies.find((b) => b.id === ids.a).offered, true, "still Trade/Sell");
    await shot(casey.page, "11-collector-pc-refused");

    /* Phone width for the shop's panel: nothing runs off the side. */
    await north.page.setViewportSize({ width: 390, height: 844 }); await north.page.waitForTimeout(300);
    const wide = await north.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(wide <= 0, `the shop's page scrolls sideways at 390px (${wide})`);
    await shot(north.page, "12-tp-390");

    eq(json(silver.commands), json(["selectTradeCards", "closeTradeSelection", "deselectTradeCard"]), "Silver Vale sent only what it pressed");
    eq(json(casey.commands), json(["withdrawTradeCard", "continueTradeSelection", "continueTradeSelection", "changeCollectingState"]),
      "Casey sent only what she pressed");
    eq(errors.length, 0, errors.join(" | "));
    for (const c of [north, silver, casey]) await c.context.close();
  });
});

/* FRESHNESS (M3A A3): both pages stay open — nobody reloads — and each sees
   the other's move from the 15-second check, told what happened. A page that
   loses its connection says so and pauses its moves until Refresh succeeds.
   An unsent choice that becomes unavailable is kept and marked, not dropped. */
describe("Freshness, both pages open, real clock (M3A A3)", () => {
  test("Casey sees Northline's send, Northline sees Casey's ready — no reload; offline pauses; a lost draft card is marked", async () => {
    await before();
    const own = await serve({ seed: selectTradeSeed, label: "a3-freshness", morePartners: [{ id: "p-silver", name: "Silver Vale", token: "silver" }] });
    const saved = ctx; ctx = own;
    try {
      const { ids } = own;
      const north = await shop("north");
      const casey = await collector();
      await casey.openDeal(ids.nl);
      const waitFor = async (pg, fn, what, ms = 25000) => {
        const end = Date.now() + ms;
        while (Date.now() < end) { if (await fn()) return; await pg.waitForTimeout(500); }
        throw new Error("waited 25s for: " + what);
      };
      /* Northline gathers three, while Silver Vale takes one of them. */
      const p = panelOf(north.page, ids.nl);
      for (const id of [ids.a, ids.b, ids.blas]) await p.locator(`li[data-copy='${id}'] button:has-text('Choose')`).click();
      await own.postAs("silver", "selectTradeCards", { oppId: ids.sv, copyIds: [ids.a] });
      await own.post("continueTradeSelection", { oppId: ids.sv });
      await own.postAs("silver", "closeTradeSelection", { oppId: ids.sv });
      const t0 = Date.now();
      await waitFor(north.page, async () => /No longer available to choose/.test(await text(p)), "the draft card to be marked");
      assert(/2 cards chosen · Not sent yet/.test(await text(p)), await text(p));
      await shot(north.page, "13-fresh-draft-marked");
      await p.locator("button:has-text('Send 2 cards to Casey')").click(); await north.page.waitForTimeout(600);
      eq(json(await live(ids.nl)), json([ids.b, ids.blas].sort()), "exactly the eligible two were sent");
      /* Casey's open deal shows the send, without a reload, and says what happened. */
      const area = panelOf(casey.page, ids.nl);
      await waitFor(casey.page, async () => (await area.locator("button:has-text(\"I'm ready\")").count()) > 0, "Casey's turn to arrive");
      assert(/Updated — Northline Cards chose cards\./.test(await text(casey.page.locator(".mcs-ws"))), await text(casey.page.locator(".mcs-ws-hd")));
      await shot(casey.page, "14-fresh-collector-updated");
      await area.locator("button:has-text(\"I'm ready\")").tap();
      await waitFor(north.page, async () => (await p.locator("button:has-text('Start valuing 2 cards')").count()) > 0, "the shop's turn to arrive");
      assert(/Updated — Casey is ready\./.test(await text(north.page.locator(".tps-main"))), "the shop was not told");
      await shot(north.page, "15-fresh-tp-updated");
      const took = Date.now() - t0;
      /* Offline: the next check fails, the moves pause, Refresh recovers. */
      await north.context.setOffline(true);
      await waitFor(north.page, async () => /Couldn't check for updates/.test(await text(north.page.locator(".tps-main"))), "the failure to be said");
      assert(await p.locator("button:has-text('Start valuing 2 cards')").isDisabled(), "Start valuing stayed live while offline");
      await shot(north.page, "16-fresh-offline-paused");
      await north.context.setOffline(false);
      await north.page.locator("button:has-text('Refresh deals')").click(); await north.page.waitForTimeout(800);
      assert(!/Couldn't check for updates/.test(await text(north.page.locator(".tps-main"))), "still says it couldn't check");
      assert(!(await p.locator("button:has-text('Start valuing 2 cards')").isDisabled()), "the moves stayed paused");
      await shot(north.page, "17-fresh-recovered");
      eq(json(north.commands), json(["selectTradeCards"]), "the shop sent only what it pressed");
      eq(json(casey.commands), json(["continueTradeSelection"]), "Casey sent only what she pressed");
      console.log(`    (the whole exchange, through real 15s checks: ${Math.round(took / 1000)}s)`);
      for (const c of [north, casey]) await c.context.close();
    } finally { ctx = saved; own.server.close(); }
  });
});

if (!chromium) {
  console.log("SKIPPED: Playwright is not installed.");
} else {
  run().finally(async () => { if (browser) await browser.close(); if (ctx) ctx.server.close(); });
}
