#!/usr/bin/env node
/* ============================================================================
   MILESTONE 2D.3 — ONE DEAL, BEGINNING TO END, BOTH PEOPLE, A REAL BROWSER

   A validation run, not a feature: the real server, auth, allow-list, command
   transaction and domain over in-process PGlite, a fresh world for every run,
   and two people at the same time — Casey through the real front door, and
   Northline Cards through the same door with its own token on every request,
   so the SERVER decides who each one is.

   THE JOURNEY (each step checked on screen AND against the server)
     1  Casey opens View Matches for a Primary Goal Northline can fill
     2  Casey looks at the exact card in the viewer
     3  Casey sends a $10 offer; the deal opens
     4  Northline finds it under Opportunities, with Your move
     5  Northline counters $11
     6  Casey re-reads: $12 asking, $10 offer, $11 counter (Latest), and
        Accept $11 · Counter · Withdraw offer
     7  messages both ways — one of Casey's replies is lost after the server
        saved it, and must end up exactly once
     8  both reload and sign in again: the same history
     9  none of the messages changed the deal
     10 Casey presses Accept $11
     11 both see the agreed price and what comes next
     12 the conversation's read-only state, through the two ways production
        ends a deal: Casey withdraws (journey "withdraw"), Northline declines
        (journey "decline")
   PERMISSIONS: Faraway Games (not in the deal) sees nothing and cannot write;
   Casey cannot accept her own offer.

   Both sizes: 390 × 844 and 320 × 568. Screenshots and a report in
   artifacts/deal-journey/.

     node harness/phase6-deal-journey.cjs
   ========================================================================== */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { serve, reviewSeed, PHONE, signIn, ROOT } = require("./phase6-world.cjs");

const json = (v) => JSON.stringify(v);
const SIZES = { 390: PHONE, 320: { ...PHONE, viewport: { width: 320, height: 568 } } };
const said = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();

/* The review story, plus a Primary Goal for the exact copy Northline has
   (Mudkip #60, Normal, Raw · Near Mint, $12, Open to Offers) — and no deal. */
async function journeySeed(kit) {
  const ids = await reviewSeed(kit);
  const { post, catalog } = kit;
  const rs60 = (await catalog.findCardContexts({ number: "60", pokedex: 258 })).contexts[0];
  const normal60 = (await catalog.readCardContext(rs60.cardContextId)).canonicalCards.find((k) => k.finish === "non_holo").canonicalCardId;
  const goalId = await post("addGoal", { canonicalCardId: normal60, tier: "primary", desired: { grade: "Raw", condition: "Near Mint" } });
  return { ...ids, journey: { goalId, invId: ids.shops.n1 } };
}

/* A raw API call as `token`, for the permission checks. */
const api = (url, token, method, route, body = null) => new Promise((resolve) => {
  const u = new URL(route, url);
  const data = body ? JSON.stringify(body) : null;
  const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method,
    headers: { authorization: `Bearer ${token}`, ...(data ? { "content-type": "application/json" } : {}) } }, (res) => {
    let s = ""; res.on("data", (c) => { s += c; }); res.on("end", () => { let j = null; try { j = JSON.parse(s); } catch (e) { /* */ } resolve({ status: res.statusCode, body: j }); });
  });
  if (data) req.write(data); req.end();
});

async function person(browser, token, width) {
  const context = await browser.newContext({ ...SIZES[width] });
  const hooks = { loseNextMessage: false };
  await context.route("**/api/**", async (route) => {
    const req = route.request();
    const headers = token === "casey" ? req.headers() : { ...req.headers(), authorization: `Bearer ${token}` };
    let body = null; try { body = JSON.parse(req.postData() || "null"); } catch (e) { /* */ }
    if (hooks.loseNextMessage && body && body.command === "sendDealMessage") {
      /* the server receives and saves it; the reply never arrives */
      hooks.loseNextMessage = false;
      await route.fetch({ headers });
      return route.abort("failed");
    }
    return route.continue({ headers });
  });
  const page = await context.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const commands = [];
  page.on("request", (r) => { if (r.url().includes("/api/commands")) { try { commands.push(JSON.parse(r.postData() || "{}").command); } catch (e) { /* */ } } });
  return { context, page, errors, commands, hooks };
}
async function shopDoor(page, url) {
  await page.goto(`${url}app`);
  await page.fill("#metyet-email", "north@example.invalid");
  await page.click("button[type=submit]");
  await page.fill("#metyet-code", "123456");
  await page.click("button[type=submit]");
  await page.waitForSelector("nav[aria-label='Trusted Partner']");
}
const settle = async (page) => { await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForTimeout(250); };

/* What a phone screen owes its reader, measured. */
async function usable(page) {
  return page.evaluate(() => {
    const small = [...document.querySelectorAll("button, textarea, input")]
      .filter((el) => el.offsetParent !== null && !el.closest("[hidden]"))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ el, r }) => r.width > 0 && (r.height < 40) && !el.classList.contains("mcs-msg-check") && !el.classList.contains("tps-msg-check"))
      .map(({ el, r }) => `${(el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    return { fits: document.documentElement.scrollWidth <= window.innerWidth, small };
  });
}

/* ------------------------------------------------------------------ THE JOURNEY */
async function journey(dir, browser, width) {
  const ctx = await serve({ port: 0, seed: journeySeed, label: "deal-journey" });
  const facts = { steps: {} };
  const files = [];
  const fail = (msg) => { throw new Error(msg); };
  const must = (cond, msg) => { if (!cond) fail(msg); };
  let C = null; let T = null;
  try {
    const { goalId, invId } = ctx.ids.journey;
    const world = () => ctx.world();
    const oppOf = async () => (await world()).opportunities.find((o) => o.goalId === goalId && o.invId === invId) || null;
    const entries = async (oppId) => ((await world()).conversations || []).filter((t) => t.oppId === oppId && t.key === `opp::${oppId}`)
      .flatMap((t) => t.entries || []).filter((e) => e.kind === "message");
    const shot = async (who, page, name, loc = null) => {
      const f = path.join(dir, `j-${width}-${name}.png`);
      if (loc) await loc.scrollIntoViewIfNeeded(); else await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: f }); files.push(path.relative(ROOT, f));
      facts.usable = facts.usable || {};
      facts.usable[name] = await usable(page);
    };

    /* ---- 1. Casey: View Matches ---- */
    C = await person(browser, "casey", width);
    const cp = C.page;
    await signIn(cp, ctx.url);
    await cp.tap("nav[aria-label=Collector] button:has-text('Deal Flow')");
    const goalCard = cp.locator(`article[data-goal='${goalId}']`);
    await goalCard.waitFor({ timeout: 8000 });
    facts.steps[1] = { card: await said(goalCard) };
    await shot("C", cp, "01-collector-goal-card", goalCard);
    await goalCard.locator("button.mcs-dg-cta").tap();
    const row = cp.locator(`li.mcs-df-copy[data-inv='${invId}']`);
    await row.waitFor({ timeout: 5000 });
    facts.steps[1].row = await said(row);
    must(/Raw · Near Mint/.test(facts.steps[1].row) && /\$12/.test(facts.steps[1].row), `1. the match row: ${facts.steps[1].row}`);
    await shot("C", cp, "02-collector-matches", row);

    /* ---- 2. the exact card ---- */
    await row.locator(".mcs-pv-thumb").tap();
    const dialog = cp.locator("[role=dialog]");
    await dialog.waitFor({ timeout: 3000 });
    await dialog.locator("img").evaluate((img) => img.complete || new Promise((d) => { img.onload = d; img.onerror = d; setTimeout(d, 8000); })).catch(() => {});
    facts.steps[2] = { viewer: await said(dialog) };
    must(/Mudkip/.test(facts.steps[2].viewer) && /Catalog image/.test(facts.steps[2].viewer), `2. viewer: ${facts.steps[2].viewer}`);
    await shot("C", cp, "03-collector-card-viewer");
    await dialog.locator("button", { hasText: "Close" }).tap();
    await dialog.waitFor({ state: "detached" });

    /* ---- 3. the offer ---- */
    await row.locator("button", { hasText: "Make an offer" }).tap();
    await row.locator("input[aria-label='Offer, in whole dollars']").fill("10");
    await shot("C", cp, "04-collector-offer-entry", row.locator(".mcs-oo"));
    await row.locator(".mcs-oo button[type=submit]").tap();
    const ws = cp.locator(".mcs-ws[data-opp]");
    await ws.waitFor({ timeout: 6000 });
    await settle(cp);
    const opp0 = await oppOf();
    must(opp0 && json(opp0.priceThread.map((e) => [e.by, e.type, e.amount])) === json([["collector", "offer", 10]]), `3. stored ${json(opp0 && opp0.priceThread)}`);
    const oppId = opp0.id;
    const stage = ws.locator(".mcs-ws-stage");
    const rows = async () => (await stage.locator("dl > div").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
    const buttons = async () => (await stage.locator("button").allInnerTexts()).map((t) => t.trim());
    facts.steps[3] = { rows: await rows(), buttons: await buttons(), turn: await said(ws.locator(".mcs-ws-turn")) };
    must(json(facts.steps[3].rows) === json(["Northline Cards' asking price $12", "Your offer LATEST $10"]), `3. rows ${json(facts.steps[3].rows)}`);
    must(facts.steps[3].turn === "Waiting for Northline Cards", `3. turn ${facts.steps[3].turn}`);
    await shot("C", cp, "05-collector-offer-sent");
    /* out of turn: Casey cannot accept her own standing offer */
    const selfAccept = await api(ctx.url, "casey", "POST", "/api/commands", { command: "acceptPrice", payload: { oppId } });
    facts.outOfTurnAccept = { status: selfAccept.status, refused: selfAccept.body && selfAccept.body.refused };
    must(selfAccept.status !== 200 && (await oppOf()).agreedPrice == null, `3. Casey accepted her own offer ${json(facts.outOfTurnAccept)}`);

    /* ---- 4. Northline: Opportunities ---- */
    T = await person(browser, "north", width);
    const tp = T.page;
    await shopDoor(tp, ctx.url);
    await tp.locator("nav[aria-label='Trusted Partner'] button", { hasText: "Opportunities" }).click();
    const rec = tp.locator(".tps-rec", { has: tp.locator(`.tps-msg[data-thread='${oppId}']`) });
    await rec.waitFor({ timeout: 6000 });
    await rec.locator(".tps-rec-s", { hasText: "Normal" }).waitFor({ timeout: 5000 });
    facts.steps[4] = { record: await said(rec), panel: await said(tp.locator(".tps-panel", { has: rec }).locator(".tps-ph h2")) };
    must(/Casey/.test(facts.steps[4].record) && /Your move/i.test(facts.steps[4].record) && /\$10/.test(facts.steps[4].record),
      `4. record ${facts.steps[4].record}`);
    /* M2D.3 correction: the printing in words, never the catalogue's codes */
    must(/Mudkip · Ruby & Sapphire · #60 · Normal · Raw · Near Mint/.test(facts.steps[4].record)
      && !/non_holo|not_applicable/.test(facts.steps[4].record), `4. the card is not named in words: ${facts.steps[4].record}`);
    await shot("T", tp, "06-tp-offer-received", rec);

    /* ---- 5. Northline counters $11 ---- */
    await rec.locator("button", { hasText: /^Counter$/ }).click();
    await rec.locator(".tps-offer-entry input[type=text]").fill("11");
    await rec.locator(".tps-offer-entry button", { hasText: "Send counter" }).click();
    await tp.locator(".tps-rec", { has: tp.locator(`.tps-msg[data-thread='${oppId}']`) }).locator("text=/Waiting for Casey/").first().waitFor({ timeout: 5000 });
    const opp1 = await oppOf();
    must(json(opp1.priceThread.map((e) => [e.by, e.type, e.amount])) === json([["collector", "offer", 10], ["tp", "counter", 11]]), `5. stored ${json(opp1.priceThread)}`);
    facts.steps[5] = { record: await said(rec), tpCommands: T.commands.slice() };
    await shot("T", tp, "07-tp-countered", rec);

    /* ---- 6. Casey re-reads ---- */
    await ws.locator(".mcs-msg button", { hasText: "Refresh messages" }).tap();
    await cp.locator(".mcs-ws-stage dl > div.latest", { hasText: "counter" }).waitFor({ timeout: 5000 });
    facts.steps[6] = { rows: await rows(), buttons: await buttons(), turn: await said(ws.locator(".mcs-ws-turn")) };
    must(json(facts.steps[6].rows) === json(["Northline Cards' asking price $12", "Your offer $10", "Northline Cards' counter LATEST $11"]), `6. rows ${json(facts.steps[6].rows)}`);
    must(json(facts.steps[6].buttons) === json(["Accept $11", "Counter", "Withdraw offer"]), `6. buttons ${json(facts.steps[6].buttons)}`);
    must(facts.steps[6].turn === "Your turn · Review counteroffer", `6. turn ${facts.steps[6].turn}`);
    await shot("C", cp, "08-collector-counter-received");

    /* ---- 7. messages, both ways ---- */
    const dealBefore = json(await oppOf());
    const cTalk = ws.locator(".mcs-msg");
    const cSend = async (text) => {
      await cTalk.locator("textarea").fill(text);
      await cTalk.locator("button[type=submit]").tap();
    };
    await cSend("Is the back near mint too? Any whitening?");
    await cTalk.locator("li", { hasText: "Any whitening?" }).waitFor({ timeout: 4000 });
    const toggle = rec.locator(".tps-talk-toggle");
    await toggle.click();
    const tTalk = tp.locator(`.tps-msg[data-thread='${oppId}']`);
    await tTalk.waitFor({ state: "visible" });
    await tTalk.locator("button", { hasText: "Refresh messages" }).click();
    await tTalk.locator("li", { hasText: "Any whitening?" }).waitFor({ timeout: 4000 });
    await tTalk.locator("textarea").fill("Clean back, no whitening. I can meet Saturday at the shop.");
    await tTalk.locator("button[type=submit]").click();
    await tTalk.locator("li", { hasText: "meet Saturday" }).waitFor({ timeout: 4000 });
    await shot("T", tp, "09-tp-conversation", tTalk);
    await cTalk.locator("button", { hasText: "Refresh messages" }).tap();
    await cTalk.locator("li", { hasText: "meet Saturday" }).waitFor({ timeout: 4000 });
    /* a reply lost after the server saved it */
    C.hooks.loseNextMessage = true;
    await cSend("Saturday works. I accept $11.");
    await cTalk.locator("li", { hasText: "Saturday works." }).waitFor({ timeout: 6000 });
    await settle(cp);
    const saturday = (await entries(oppId)).filter((e) => e.text === "Saturday works. I accept $11.");
    facts.steps[7] = { lostReplyStored: saturday.length, collectorThread: await said(cTalk.locator("ol")), trouble: await cTalk.locator("[class$='-msg-trouble']").count(),
      draft: await cTalk.locator("textarea").inputValue() };
    must(saturday.length === 1, `7. the lost reply was stored ${saturday.length} times`);
    must(facts.steps[7].draft === "", `7. the delivered draft was kept: ${facts.steps[7].draft}`);
    await shot("C", cp, "10-collector-conversation", cTalk);

    /* ---- 8. reload, sign in again ---- */
    await signIn(cp, ctx.url);
    await cp.tap("nav[aria-label=Collector] button:has-text('Deal Flow')");
    await cp.locator(`article[data-goal='${goalId}'] button.mcs-dg-cta`).tap();
    await ws.waitFor({ timeout: 5000 });
    await shopDoor(tp, ctx.url);
    await tp.locator("nav[aria-label='Trusted Partner'] button", { hasText: "Opportunities" }).click();
    await rec.waitFor({ timeout: 6000 });
    const toggleLabel = await said(rec.locator(".tps-talk-toggle"));
    await rec.locator(".tps-talk-toggle").click();
    const order = async (talk) => (await talk.locator("li [class$='-msg-text']").allInnerTexts()).map((t) => t.trim());
    const want = ["Is the back near mint too? Any whitening?", "Clean back, no whitening. I can meet Saturday at the shop.", "Saturday works. I accept $11."];
    facts.steps[8] = { collector: await order(cTalk), tp: await order(tTalk), toggleLabel,
      who: await cTalk.locator("li [class$='-msg-who']").allInnerTexts(), tpWho: await tTalk.locator("li [class$='-msg-who']").allInnerTexts() };
    must(json(facts.steps[8].collector) === json(want) && json(facts.steps[8].tp) === json(want), `8. history ${json(facts.steps[8])}`);
    must(json(facts.steps[8].who.map((w) => w.trim())) === json(["You", "Northline Cards", "You"]), `8. collector attribution ${json(facts.steps[8].who)}`);
    must(json(facts.steps[8].tpWho.map((w) => w.trim())) === json(["Casey", "You", "Casey"]), `8. shop attribution ${json(facts.steps[8].tpWho)}`);
    await shot("C", cp, "11-collector-after-reload", cTalk);
    await shot("T", tp, "12-tp-after-reload", tTalk);

    /* ---- 9. the messages changed nothing ---- */
    facts.steps[9] = { unchanged: json(await oppOf()) === dealBefore, buttons: await buttons() };
    must(facts.steps[9].unchanged, "9. a message changed the deal");
    must(json(facts.steps[9].buttons) === json(["Accept $11", "Counter", "Withdraw offer"]), `9. buttons ${json(facts.steps[9].buttons)}`);

    /* ---- permissions ---- */
    const farView = await api(ctx.url, "far", "GET", "/api/view");
    const farState = farView.body && farView.body.state;
    const farWrite = await api(ctx.url, "far", "POST", "/api/commands", { command: "sendDealMessage", payload: { oppId, text: "hello", nonce: "far-1" } });
    facts.permissions = {
      farSeesDeal: !!(farState && (farState.opportunities || []).some((o) => o.id === oppId)),
      farSeesThread: !!(farState && (farState.conversations || []).some((t) => t.oppId === oppId)),
      farWrite: { status: farWrite.status, refused: farWrite.body && (farWrite.body.refused || farWrite.body.error || null) },
      stored: (await entries(oppId)).length,
    };
    must(!facts.permissions.farSeesDeal && !facts.permissions.farSeesThread, "a stranger sees the deal or its thread");
    must(facts.permissions.stored === 3, "a stranger's message was stored");

    /* ---- 10. explicit acceptance ---- */
    const before10 = C.commands.length;
    must((await oppOf()).agreedPrice == null, "10. the deal was agreed before Casey pressed Accept");
    const reply = cp.waitForResponse((r) => r.url().includes("/api/commands") && /acceptPrice/.test(r.request().postData() || ""));
    await stage.locator("button", { hasText: "Accept $11" }).tap();
    const accepted = await reply;
    facts.acceptReply = { status: accepted.status() };
    must(accepted.status() === 200, `10. the on-screen Accept was answered ${accepted.status()}`);
    await cp.locator(".mcs-ws-stage dl > div.agreed").waitFor({ timeout: 5000 });
    await settle(cp);
    const opp2 = await oppOf();
    facts.steps[10] = { commands: C.commands.slice(before10), stored: [opp2.listedPrice, opp2.agreedPrice, opp2.stage] };
    must(json(facts.steps[10].commands) === json(["acceptPrice"]), `10. sent ${json(facts.steps[10].commands)}`);
    must(json(facts.steps[10].stored) === json([12, 11, "select-trade"]), `10. stored ${json(facts.steps[10].stored)}`);
    const again = await api(ctx.url, "casey", "POST", "/api/commands", { command: "acceptPrice", payload: { oppId } });
    facts.permissions.secondAccept = { status: again.status, body: again.body && (again.body.refused || again.body.error || again.body.ok) };
    must((await oppOf()).priceThread.length === 3, "a second acceptance was recorded");

    /* ---- 11. both see the agreement ---- */
    facts.steps[11] = { collector: { rows: await rows(), buttons: await buttons(), header: await said(ws.locator(".mcs-ws-hd")),
      say: await said(stage.locator(".mcs-ws-say")), messaging: await cTalk.getAttribute("data-messaging") } };
    must(json(facts.steps[11].collector.rows) === json(["Northline Cards' asking price $12", "Your offer $10", "Northline Cards' counter $11", "Agreed price $11"]),
      `11. collector rows ${json(facts.steps[11].collector.rows)}`);
    await shot("C", cp, "13-collector-agreed");
    await tTalk.locator("button", { hasText: "Refresh messages" }).click();
    await settle(tp);
    const recNow = tp.locator(".tps-rec", { has: tp.locator(`.tps-msg[data-thread='${oppId}']`) });
    facts.steps[11].tp = { record: await said(recNow), panel: await said(tp.locator(".tps-panel", { has: recNow }).locator(".tps-ph h2")),
      messaging: await tTalk.getAttribute("data-messaging") };
    /* the agreed price is said once, in the summary (M2D.3 polish) */
    must(/Agreed price \$11/.test(facts.steps[11].tp.record) && !/AGREED \$11/.test(facts.steps[11].tp.record),
      `11. tp record ${facts.steps[11].tp.record}`);
    /* M2D.3 correction: the shop is told the price is agreed and what comes
       next — not to wait on Casey — and both sides say the same price */
    facts.steps[11].tp.tags = (await recNow.locator(".tps-rec-tags .tps-tag").allInnerTexts()).map((t) => t.trim());
    facts.steps[11].tp.agreed = await said(recNow.locator(".tps-agreed-row"));
    must(facts.steps[11].tp.tags.some((t) => /^Price agreed · Select Trade coming soon$/i.test(t)), `11. tp tags ${json(facts.steps[11].tp.tags)}`);
    must(!/Waiting for Casey|Your move/i.test(facts.steps[11].tp.record), "11. the shop is still told to wait on Casey");
    must(facts.steps[11].tp.agreed === "Agreed price $11" && facts.steps[11].collector.rows.includes(facts.steps[11].tp.agreed),
      `11. the two sides disagree: ${facts.steps[11].tp.agreed} / ${json(facts.steps[11].collector.rows)}`);
    await shot("T", tp, "14-tp-agreed", recNow);
    await shot("T", tp, "14b-tp-agreed-price", recNow.locator(".tps-agreed"));
    facts.errors = [...C.errors, ...T.errors];
    must(facts.errors.length === 0, `page errors: ${facts.errors.join("; ")}`);
    return { ok: true, facts, files };
  } catch (e) {
    return { ok: false, error: e.message, facts, files };
  } finally {
    if (C) await C.context.close();
    if (T) await T.context.close();
    ctx.server.close();
  }
}

/* ------------------------------------------------------------------ ENDINGS
   12. The two ways production ends a deal before agreement, each on a fresh
   world: Casey withdraws, or Northline declines. The offer and two messages
   are sent as the people's own commands; the ending is pressed on screen. */
async function ending(dir, browser, width, how) {
  const ctx = await serve({ port: 0, seed: journeySeed, label: `deal-journey-${how}` });
  const facts = {}; const files = [];
  const fail = (msg) => { throw new Error(msg); };
  const must = (cond, msg) => { if (!cond) fail(msg); };
  let C = null; let T = null;
  try {
    const { goalId, invId } = ctx.ids.journey;
    const oppId = await ctx.post("startOpportunity", { goalId, invId, amount: 10 });
    await ctx.postAs("casey", "sendDealMessage", { oppId, text: "Would you take $10?", nonce: `${how}-c1` });
    await ctx.postAs("north", "sendDealMessage", { oppId, text: "Let me check with the owner.", nonce: `${how}-n1` });
    const shot = async (page, name, loc = null) => {
      const f = path.join(dir, `j-${width}-${name}.png`);
      if (loc) await loc.scrollIntoViewIfNeeded(); else await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: f }); files.push(path.relative(ROOT, f));
    };
    C = await person(browser, "casey", width); T = await person(browser, "north", width);
    const cp = C.page; const tp = T.page;
    await signIn(cp, ctx.url);
    await cp.tap("nav[aria-label=Collector] button:has-text('Deal Flow')");
    await cp.locator(`article[data-goal='${goalId}'] button.mcs-dg-cta`).tap();
    const ws = cp.locator(".mcs-ws[data-opp]");
    await ws.waitFor({ timeout: 5000 });
    await shopDoor(tp, ctx.url);
    await tp.locator("nav[aria-label='Trusted Partner'] button", { hasText: "Opportunities" }).click();
    const rec = () => tp.locator(".tps-rec", { has: tp.locator(`.tps-msg[data-thread='${oppId}']`) });
    await rec().waitFor({ timeout: 6000 });
    if (how === "withdraw") {
      await ws.locator(".mcs-ws-stage button", { hasText: "Withdraw offer" }).tap();
      await ws.locator(".mcs-msg[data-messaging='read-only']").waitFor({ timeout: 5000 });
      await settle(cp);
    } else {
      await rec().locator("button", { hasText: "Decline" }).click();
      await settle(tp);
      await ws.locator(".mcs-msg button", { hasText: "Refresh messages" }).tap();
      await settle(cp);
    }
    const cTalk = ws.locator(".mcs-msg");
    facts.collector = { turn: await said(ws.locator(".mcs-ws-turn")), messaging: await cTalk.getAttribute("data-messaging"),
      thread: await said(cTalk), composer: await cTalk.locator("textarea").count(), buttons: await ws.locator(".mcs-ws-stage button").count() };
    await shot(cp, `${how === "withdraw" ? "15" : "17"}-collector-${how}n-read-only`, cTalk);
    /* the Collector's way back to it: the Goal's View Matches */
    await ws.locator("button[aria-label='Back to Deal Flow']").tap();
    const card = cp.locator(`article[data-goal='${goalId}']`);
    await card.waitFor({ timeout: 4000 });
    facts.collector.goalCard = await said(card);
    facts.collector.goalCta = await said(card.locator("button.mcs-dg-cta"));
    await tp.reload(); await shopDoor(tp, ctx.url);
    await tp.locator("nav[aria-label='Trusted Partner'] button", { hasText: "Opportunities" }).click();
    await rec().waitFor({ timeout: 6000 });
    await rec().locator(".tps-talk-toggle").click();
    const tTalk = tp.locator(`.tps-msg[data-thread='${oppId}']`);
    facts.tp = { record: await said(rec()), panel: await said(tp.locator(".tps-panel", { has: rec() }).locator(".tps-ph h2")),
      messaging: await tTalk.getAttribute("data-messaging"), composer: await tTalk.locator("textarea").count(), thread: await said(tTalk) };
    await shot(tp, `${how === "withdraw" ? "16" : "18"}-tp-${how}n-read-only`, tTalk);
    const late = await api(ctx.url, "north", "POST", "/api/commands", { command: "sendDealMessage", payload: { oppId, text: "Still there?", nonce: `${how}-late` } });
    facts.lateSend = { status: late.status, refused: late.body && (late.body.refused || late.body.error || null) };
    const stored = ((await ctx.world()).conversations || []).filter((t) => t.oppId === oppId).flatMap((t) => t.entries || []).filter((e) => e.kind === "message");
    facts.stored = stored.map((e) => e.text);
    must(facts.collector.messaging === "read-only" && facts.collector.composer === 0, `collector not read-only ${json(facts.collector)}`);
    must(facts.tp.messaging === "read-only" && facts.tp.composer === 0, `tp not read-only ${json(facts.tp)}`);
    must(/Would you take \$10\?/.test(facts.collector.thread) && /Let me check/.test(facts.tp.thread), "the history was lost");
    must(json(facts.stored) === json(["Would you take $10?", "Let me check with the owner."]), `a message after the end was stored ${json(facts.stored)}`);
    must(facts.collector.buttons === 0, "deal actions after the end");
    return { ok: true, facts, files };
  } catch (e) {
    return { ok: false, error: e.message, facts, files };
  } finally {
    if (C) await C.context.close();
    if (T) await T.context.close();
    ctx.server.close();
  }
}

if (require.main === module) {
  (async () => {
    const dir = path.join(ROOT, "artifacts", "deal-journey");
    fs.mkdirSync(dir, { recursive: true });
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ channel: "chrome" });
    const out = {};
    for (const width of [390, 320]) {
      for (const [name, fn] of [["journey", () => journey(dir, browser, width)],
        ["withdraw", () => ending(dir, browser, width, "withdraw")], ["decline", () => ending(dir, browser, width, "decline")]]) {
        const key = `${name}-${width}`;
        out[key] = await fn();
        console.log(`${out[key].ok ? "ok  " : "FAIL"} ${key}${out[key].ok ? "" : ` — ${out[key].error}`}`);
      }
    }
    await browser.close();
    fs.writeFileSync(path.join(dir, "journey.json"), JSON.stringify(out, null, 2));
    const bad = Object.values(out).filter((r) => !r.ok).length;
    console.log(`\n${Object.keys(out).length - bad} passed, ${bad} failed — report: artifacts/deal-journey/journey.json`);
    process.exitCode = bad ? 1 : 0;
  })();
}
