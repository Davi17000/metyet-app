#!/usr/bin/env node
/* ============================================================================
   MILESTONE 2D.2 — ONE DEAL'S CONVERSATION, BOTH SIDES, IN A REAL BROWSER

   Scenario b's world (harness/phase6-deal-scenarios.cjs: Casey offered $10,
   Northline countered $11, Casey has not answered) on the real server, auth,
   allow-list, command transaction and domain over in-process PGlite. Two
   browser contexts, two people:

     Casey            the real front door, Deal Flow → the Deal Workspace
     Northline Cards  the same front door; its context's requests carry
                      Northline's token, so the SERVER makes it the shop —
                      nothing in the page is told who it is

   What is checked, against the server and the screen:
     1. the empty thread and its composer; Send disabled until there is text
     2. Casey writes "I accept $11 …" — one message; the deal is untouched
        and Accept $11 is still the only way to agree
     3. Northline opens the deal's conversation, sees Casey's message as
        Casey's, and replies
     4. Casey's Refresh messages shows the reply as Northline's
     5. a reply lost after the server saved it: never drawn as sent, and
        recognised as delivered by the next read — one message
     6. a send that never arrived: the text stays, Retry sends the SAME nonce
        — one message
     7. a reload and signing in again: the same history, in order
     8. Faraway Games (not in the deal) is told nothing
     9. 390 × 844 and 320 × 568 for both seats: nothing scrolls sideways and
        Send stays on screen

     npm run review:deal-messaging     (artifacts/deal-messaging/)
   ========================================================================== */
const fs = require("fs");
const path = require("path");
const { serve, PHONE, signIn, ROOT } = require("./phase6-world.cjs");
const { dealSeed, PARTNER, STRANGER } = require("./phase6-deal-scenarios.cjs");

const json = (v) => JSON.stringify(v);
const SMALL = { ...PHONE, viewport: { width: 320, height: 568 } };
const saidOf = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
const fitsOf = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const settleFor = (page) => async () => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(250);
};
const onScreen = (loc) => loc.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight;
});

/* A context whose every API request carries `token` — the server derives the
   seat from it. Commands the page sends are recorded. */
async function person(browser, token, options = PHONE) {
  const context = await browser.newContext({ ...options });
  if (token !== "casey") {
    await context.route("**/api/**", (route) => route.continue({
      headers: { ...route.request().headers(), authorization: `Bearer ${token}` } }));
  }
  const page = await context.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const commands = [];
  page.on("request", (r) => { if (r.url().includes("/api/commands")) commands.push(JSON.parse(r.postData() || "{}")); });
  return { context, page, errors, commands };
}
async function frontDoor(page, url, seat) {
  if (seat === "Collector") return signIn(page, url);
  await page.goto(`${url}app`);
  await page.fill("#metyet-email", "north@example.invalid");
  await page.click("button[type=submit]");
  await page.fill("#metyet-code", "123456");
  await page.click("button[type=submit]");
  await page.waitForSelector("nav[aria-label='Trusted Partner']");
}
async function openDeal(page, goalId) {
  await page.tap("nav[aria-label=Collector] button:has-text('Deal Flow')");
  const goal = page.locator(`article[data-goal='${goalId}']`);
  await goal.waitFor({ timeout: 8000 });
  await goal.locator("button.mcs-dg-cta").tap();
  await page.locator(".mcs-ws").waitFor({ timeout: 4000 });
}
async function openShopThread(page, oppId) {
  await page.locator("nav[aria-label='Trusted Partner'] button", { hasText: "Opportunities" }).click();
  const talk = page.locator(".tps-talk", { has: page.locator(`.tps-msg[data-thread='${oppId}']`) });
  await talk.waitFor({ timeout: 6000 });
  const toggle = talk.locator(".tps-talk-toggle");
  const label = (await toggle.innerText()).trim();
  await toggle.click();
  await page.locator(`.tps-msg[data-thread='${oppId}']`).waitFor({ state: "visible", timeout: 4000 });
  return { label, thread: page.locator(`.tps-msg[data-thread='${oppId}']`) };
}
const bubblesOf = async (thread) => {
  const items = thread.locator("li");
  const out = [];
  for (let i = 0; i < await items.count(); i += 1) {
    const li = items.nth(i);
    out.push({ who: (await li.locator("[class$='-msg-who']").innerText()).trim(),
      text: (await li.locator("[class$='-msg-text']").innerText()).trim(),
      mine: /\bmine\b/.test(await li.getAttribute("class")), time: await li.locator("time").count() });
  }
  return out;
};

async function run(dir, browser) {
  const ctx = await serve({ port: 0, seed: dealSeed("b"), label: "deal-messaging" });
  const files = {};
  const shot = async (page, name, loc = null) => {
    files[name] = path.join(dir, `msg-${name}.png`);
    if (loc) await loc.scrollIntoViewIfNeeded();
    await page.screenshot({ path: files[name] });
  };
  const fail = (msg) => { throw new Error(msg); };
  const must = (cond, msg) => { if (!cond) fail(msg); };
  try {
    const { goalId, oppId } = ctx.ids.deal;
    const threadOf = async () => ((await ctx.world()).conversations || []).filter((t) => t.oppId === oppId && t.key === `opp::${oppId}`);
    const entries = async () => (await threadOf()).flatMap((t) => t.entries || []);
    const dealNow = async () => json((await ctx.world()).opportunities.find((o) => o.id === oppId));
    const before = await dealNow();
    const facts = {};

    /* ---- 1. Casey: the empty thread ---- */
    const casey = await person(browser, "casey");
    const cp = casey.page;
    const settleC = settleFor(cp);
    await frontDoor(cp, ctx.url, "Collector");
    await openDeal(cp, goalId);
    await settleC();
    const cTalk = cp.locator(".mcs-msg");
    const cBox = cTalk.locator("textarea");
    const cSend = cTalk.locator("button[type=submit]");
    facts.empty = { said: await saidOf(cTalk), sendDisabled: await cSend.isDisabled(), fits: await fitsOf(cp) };
    must(/No messages yet/.test(facts.empty.said) && facts.empty.sendDisabled, `1. the empty thread: ${json(facts.empty)}`);
    await cBox.tap();
    await shot(cp, "1-collector-empty-390", cTalk);
    facts.empty.sendOnScreen = await onScreen(cSend);

    /* ---- 2. Casey: "I accept $11 …" is a message ---- */
    const first = "I accept $11 — could I pick it up Saturday morning?";
    await cBox.fill(first);
    await cSend.tap();
    await cTalk.locator("li").first().waitFor({ timeout: 6000 });
    await settleC();
    facts.sent = { bubbles: await bubblesOf(cTalk), box: await cBox.inputValue(),
      stageButtons: (await cp.locator(".mcs-ws-stage button").allInnerTexts()).map((b) => b.trim()),
      header: await saidOf(cp.locator(".mcs-ws-hd")), dealUnchanged: (await dealNow()) === before,
      server: (await entries()).map((e) => `${e.by}:${e.text}`) };
    must(json(facts.sent.server) === json([`collector:${first}`]), `2. the server holds ${json(facts.sent.server)}`);
    must(facts.sent.dealUnchanged, "2. a message changed the deal");
    must(json(facts.sent.stageButtons) === json(["Accept $11", "Counter", "Withdraw offer"]), `2. stage buttons ${json(facts.sent.stageButtons)}`);
    must(/Your turn · Review counteroffer/.test(facts.sent.header), "2. the turn moved");
    must(facts.sent.bubbles.length === 1 && facts.sent.bubbles[0].who === "You" && facts.sent.bubbles[0].mine
      && facts.sent.bubbles[0].time === 1 && facts.sent.box === "", `2. the thread ${json(facts.sent)}`);
    await shot(cp, "2-collector-sent-390", cTalk);

    /* ---- 3. Northline: the same thread, from the shop's side ---- */
    const north = await person(browser, PARTNER.token);
    const np = north.page;
    await frontDoor(np, ctx.url, "Trusted Partner");
    const { label, thread: nTalk } = await openShopThread(np, oppId);
    await settleFor(np)();
    facts.shop = { label, bubbles: await bubblesOf(nTalk), fits: await fitsOf(np) };
    must(label === "Conversation · 1 message", `3. the shop's control says "${label}"`);
    must(json(facts.shop.bubbles.map((b) => [b.who, b.text, b.mine])) === json([["Casey", first, false]]), `3. ${json(facts.shop.bubbles)}`);
    const reply = "Saturday works — we open at 10. See you then.";
    await nTalk.locator("textarea").fill(reply);
    await nTalk.locator("button[type=submit]").click();
    await nTalk.locator("li").nth(1).waitFor({ timeout: 6000 });
    facts.shop.after = await bubblesOf(nTalk);
    must(json(facts.shop.after.map((b) => b.who)) === json(["Casey", "You"]), `3. after replying ${json(facts.shop.after)}`);
    await shot(np, "3-tp-thread-390", nTalk);
    must((await dealNow()) === before, "3. the shop's message changed the deal");

    /* ---- 4. Casey: Refresh messages ---- */
    await cTalk.locator("button", { hasText: "Refresh messages" }).tap();
    await cTalk.locator("li").nth(1).waitFor({ timeout: 6000 });
    facts.check = await bubblesOf(cTalk);
    must(json(facts.check.map((b) => `${b.who}:${b.text}`)) === json([`You:${first}`, `Northline Cards:${reply}`]), `4. ${json(facts.check)}`);
    await shot(cp, "4-collector-reply-390", cTalk);

    /* ---- 5. a reply lost after the server saved it ---- */
    const lost = "Should I bring the PSA slab sleeve?";
    await cp.route("**/api/commands", async (route) => { await route.fetch(); await route.abort("failed"); }, { times: 1 });
    await cBox.fill(lost);
    await cSend.tap();
    await cTalk.locator("li").nth(2).waitFor({ timeout: 6000 });
    await settleC();
    facts.lost = { bubbles: (await bubblesOf(cTalk)).length, said: await saidOf(cTalk), box: await cBox.inputValue(),
      server: (await entries()).filter((e) => e.text === lost).length };
    must(facts.lost.server === 1 && facts.lost.bubbles === 3 && facts.lost.box === "" && !/couldn't confirm/.test(facts.lost.said),
      `5. a lost reply: ${json(facts.lost)}`);

    /* ---- 6. a send that never arrived; Retry with the same nonce ---- */
    const never = "Also — is the price firm if I pay cash?";
    await cp.route("**/api/commands", (route) => route.abort("failed"), { times: 1 });
    await cBox.fill(never);
    await cSend.tap();
    await cTalk.locator(".mcs-msg-trouble").waitFor({ timeout: 6000 });
    await settleC();
    facts.retry = { said: await saidOf(cTalk), button: (await cSend.innerText()).trim(), box: await cBox.inputValue(),
      bubbles: (await bubblesOf(cTalk)).length, server: (await entries()).filter((e) => e.text === never).length };
    must(/couldn't confirm your message was sent/.test(facts.retry.said) && facts.retry.button === "Retry"
      && facts.retry.box === never && facts.retry.bubbles === 3 && facts.retry.server === 0, `6. before retry: ${json(facts.retry)}`);
    await shot(cp, "5-collector-retry-390", cTalk);
    await cSend.tap();
    await cTalk.locator("li").nth(3).waitFor({ timeout: 6000 });
    const tries = casey.commands.filter((c) => c.payload && c.payload.text === never).map((c) => c.payload.nonce);
    facts.retry.nonces = tries;
    facts.retry.after = (await entries()).filter((e) => e.text === never).length;
    must(tries.length === 2 && tries[0] === tries[1] && facts.retry.after === 1, `6. the retry: ${json(facts.retry)}`);
    must(casey.commands.every((c) => c.command === "sendDealMessage"), `Casey sent ${json(casey.commands.map((c) => c.command))}`);
    must(north.commands.every((c) => c.command === "sendDealMessage"), "Northline sent a structured command");
    must((await dealNow()) === before, "messages changed the deal");

    /* ---- 7. a reload and signing in again ---- */
    await cp.reload();
    await frontDoor(cp, ctx.url, "Collector");
    await openDeal(cp, goalId);
    await settleC();
    facts.reload = (await bubblesOf(cp.locator(".mcs-msg"))).map((b) => `${b.who}:${b.text}`);
    must(json(facts.reload) === json([`You:${first}`, `Northline Cards:${reply}`, `You:${lost}`, `You:${never}`]), `7. ${json(facts.reload)}`);

    /* ---- 8. a stranger ---- */
    const far = await (await fetch(ctx.url + "api/view", { headers: { authorization: `Bearer ${STRANGER.token}` } })).json();
    facts.stranger = { threads: (far.state.conversations || []).length, leaked: JSON.stringify(far).includes("Saturday") };
    must(facts.stranger.threads === 0 && !facts.stranger.leaked, `8. Faraway: ${json(facts.stranger)}`);
    const nView = await (await fetch(ctx.url + "api/view", { headers: { authorization: `Bearer ${PARTNER.token}` } })).json();
    must(!JSON.stringify(nView).includes(tries[0]), "8. Casey's nonce reached the shop");

    /* ---- 9. 320 × 568, both seats ---- */
    const smallC = await person(browser, "casey", SMALL);
    await frontDoor(smallC.page, ctx.url, "Collector");
    await openDeal(smallC.page, goalId);
    await settleFor(smallC.page)();
    const sTalk = smallC.page.locator(".mcs-msg");
    await sTalk.locator("textarea").tap();
    await sTalk.locator("textarea").fill("Thanks!");
    await sTalk.locator("button[type=submit]").scrollIntoViewIfNeeded();
    facts.small = { collectorFits: await fitsOf(smallC.page), collectorSend: await onScreen(sTalk.locator("button[type=submit]")) };
    await shot(smallC.page, "6-collector-320", sTalk.locator("form"));
    const smallN = await person(browser, PARTNER.token, SMALL);
    await frontDoor(smallN.page, ctx.url, "Trusted Partner");
    const { thread: snTalk } = await openShopThread(smallN.page, oppId);
    await settleFor(smallN.page)();
    await snTalk.locator("button[type=submit]").scrollIntoViewIfNeeded();
    facts.small.shopFits = await fitsOf(smallN.page);
    facts.small.shopSend = await onScreen(snTalk.locator("button[type=submit]"));
    await shot(smallN.page, "7-tp-320", snTalk.locator("form"));
    /* and the shop's thread at 390 after everything */
    await np.reload();
    await frontDoor(np, ctx.url, "Trusted Partner");
    const { thread: nAgain } = await openShopThread(np, oppId);
    await shot(np, "8-tp-history-390", nAgain.locator("form"));
    facts.small.shop390Fits = await fitsOf(np);
    must(Object.values(facts.small).every(Boolean) && facts.empty.fits && facts.shop.fits && facts.empty.sendOnScreen,
      `9. layout: ${json({ small: facts.small, empty: facts.empty, shop: facts.shop.fits })}`);
    must(smallC.commands.length === 0 && smallN.commands.length === 0, "looking at 320 sent a command");

    const errors = [...casey.errors, ...north.errors, ...smallC.errors, ...smallN.errors];
    must(!errors.length, `page errors: ${errors.join(" | ")}`);
    for (const p of [casey, north, smallC, smallN]) await p.context.close();
    return { facts, files: Object.fromEntries(Object.entries(files).map(([k, f]) => [k, path.relative(ROOT, f)])) };
  } finally {
    ctx.server.close();
  }
}

async function main() {
  const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1] || true; };
  const dir = path.resolve(ROOT, typeof arg("--shots") === "string" ? arg("--shots") : "artifacts/deal-messaging");
  let chromium = null;
  try { ({ chromium } = require("playwright")); } catch (e) { chromium = null; }
  if (!chromium) { console.log("Playwright is not installed: this run needs a browser."); process.exit(1); }
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const out = await run(dir, browser);
    fs.writeFileSync(path.join(dir, "messaging.json"), JSON.stringify(out, null, 2));
    console.log(`ok   two-sided deal messaging — ${Object.keys(out.files).length} screenshots`);
    for (const f of Object.values(out.files)) console.log(`     ${f}`);
    console.log(`\n1 passed, 0 failed — report: ${path.relative(ROOT, path.join(dir, "messaging.json"))}`);
  } catch (e) {
    console.log(`FAIL two-sided deal messaging — ${e.message}`);
    console.log("\n0 passed, 1 failed");
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(`Deal messaging could not run: ${e.message.split("\n")[0]}`); process.exit(1); });
}
module.exports = { run };
