#!/usr/bin/env node
/* ============================================================================
   MILESTONE 2D.2 REFINEMENT — THE CARD, THE NEGOTIATION, THE NEXT ACTION,
   IN A REAL BROWSER

   Scenario a's world (harness/phase6-deal-scenarios.cjs: Northline asks $12,
   Casey offered $10) on the real server, auth, allow-list, command
   transaction and domain over in-process PGlite — a fresh world for each
   phone size, so nothing earlier can colour it. Casey goes through the real
   front door; Northline's counter is Northline's own command, under its own
   token.

     1. Northline asks $12; Casey offered $10 — before any counter
     2. Northline counters $11; Casey re-reads and sees all three figures, the
        counter marked Latest, and Accept $11 · Counter · Withdraw offer
     3. Casey opens the card viewer from the workspace picture: the catalog
        front, labelled as the printing, and no back image; Escape closes it
        and focus returns to the picture
     4. Casey writes "I accept $11." — one message; the deal is untouched
     5. Casey presses Accept $11: the agreed price is the server's, once
     6. after acceptance the viewer still opens, and Close closes it

   Run at 390 × 844 and 320 × 568. Screenshots: artifacts/deal-refinement/.

     node harness/phase6-deal-refinement.cjs
   ========================================================================== */
const fs = require("fs");
const path = require("path");
const { serve, PHONE, signIn, ROOT, REVIEW_ARTWORK } = require("./phase6-world.cjs");
const { dealSeed, PARTNER } = require("./phase6-deal-scenarios.cjs");

const json = (v) => JSON.stringify(v);
const SIZES = { 390: PHONE, 320: { ...PHONE, viewport: { width: 320, height: 568 } } };
const said = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
const ALLOWED = new Set(REVIEW_ARTWORK.flatMap((a) => [a.imageSmall, a.imageLarge]));

async function run(dir, browser, width) {
  const ctx = await serve({ port: 0, seed: dealSeed("a"), label: "deal-refinement" });
  const files = [];
  const fail = (msg) => { throw new Error(`${width}: ${msg}`); };
  const must = (cond, msg) => { if (!cond) fail(msg); };
  const facts = {};
  try {
    const { goalId, oppId } = ctx.ids.deal;
    const deal = async () => (await ctx.world()).opportunities.find((o) => o.id === oppId);
    const context = await browser.newContext({ ...SIZES[width] });
    const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    const commands = [];
    page.on("request", (r) => { if (r.url().includes("/api/commands")) commands.push(JSON.parse(r.postData() || "{}").command); });
    const settle = async () => { await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForTimeout(250); };
    const shot = async (name, loc = null) => {
      const f = path.join(dir, `ref-${width}-${name}.png`);
      if (loc) await loc.scrollIntoViewIfNeeded(); else await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: f }); files.push(f);
    };
    const ws = page.locator(".mcs-ws");
    const stage = ws.locator(".mcs-ws-stage");
    const rows = async () => (await stage.locator("dl > div").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
    const buttons = async () => (await stage.locator("button").allInnerTexts()).map((t) => t.trim());
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

    /* ---- 1. before any counter ---- */
    await signIn(page, ctx.url);
    await page.tap("nav[aria-label=Collector] button:has-text('Deal Flow')");
    await page.locator(`article[data-goal='${goalId}'] button.mcs-dg-cta`).tap();
    await ws.waitFor({ timeout: 4000 }); await settle();
    facts.before = { rows: await rows(), buttons: await buttons(), turn: await said(ws.locator(".mcs-ws-turn")), fits: await fits() };
    must(json(facts.before.rows) === json(["Northline Cards' asking price $12", "Your offer LATEST $10"]), `1. rows ${json(facts.before.rows)}`);
    must(json(facts.before.buttons) === json(["Withdraw offer"]), `1. buttons ${json(facts.before.buttons)}`);
    must(facts.before.turn === "Waiting for Northline Cards", `1. turn ${facts.before.turn}`);
    await shot("1-before-counter");

    /* ---- 2. Northline counters $11, by its own command; Casey re-reads ---- */
    await ctx.postAs(PARTNER.token, "proposePrice", { oppId, amount: 11 });
    await ws.locator(".mcs-msg button", { hasText: "Refresh messages" }).tap();
    await page.locator(".mcs-ws-stage dl > div.latest", { hasText: "counter" }).waitFor({ timeout: 4000 });
    facts.countered = { rows: await rows(), buttons: await buttons(), turn: await said(ws.locator(".mcs-ws-turn")), fits: await fits() };
    must(json(facts.countered.rows) === json(["Northline Cards' asking price $12", "Your offer $10", "Northline Cards' counter LATEST $11"]),
      `2. rows ${json(facts.countered.rows)}`);
    must(json(facts.countered.buttons) === json(["Accept $11", "Counter", "Withdraw offer"]), `2. buttons ${json(facts.countered.buttons)}`);
    must(facts.countered.turn === "Your turn · Review counteroffer", `2. turn ${facts.countered.turn}`);
    must(facts.countered.fits, "2. the page scrolls sideways");
    await shot("2-after-counter");

    /* ---- 3. the card viewer ---- */
    const thumb = ws.locator(".mcs-ws-artbtn");
    const box = await thumb.boundingBox();
    must(box && box.width >= 44 && box.height >= 44, `3. the picture is a ${box && box.width}×${box && box.height} target`);
    await thumb.tap();
    const dialog = page.locator("[role=dialog]");
    await dialog.waitFor({ timeout: 3000 });
    const srcs = await page.locator("img").evaluateAll((els) => els.map((e) => e.getAttribute("src")));
    facts.viewer = { text: await said(dialog), imgs: await dialog.locator("img").evaluateAll((els) => els.map((e) => e.getAttribute("src"))),
      everyImg: srcs, focus: await page.evaluate(() => document.activeElement && document.activeElement.textContent) };
    must(/Mudkip/.test(facts.viewer.text) && /Raw · Near Mint/.test(facts.viewer.text) && /Northline Cards/.test(facts.viewer.text), `3. identity ${facts.viewer.text}`);
    must(/Catalog image — it shows the printing, not this copy's condition\./.test(facts.viewer.text), "3. the image is not named as the catalog's");
    must(/No back image\./.test(facts.viewer.text), "3. the missing back is not said");
    must(json(facts.viewer.imgs) === json([REVIEW_ARTWORK[0].imageLarge]), `3. viewer images ${json(facts.viewer.imgs)}`);
    must(facts.viewer.everyImg.every((s) => ALLOWED.has(s)), `3. an image outside the catalogue ${json(facts.viewer.everyImg)}`);
    must(facts.viewer.focus === "Close", `3. focus starts on ${facts.viewer.focus}`);
    /* The catalogue's large image is remote; wait for it (or its failure)
       so the photograph shows what a Collector sees once it arrives. */
    facts.viewer.loaded = await dialog.locator("img").evaluate((img) => new Promise((done) => {
      if (img.complete) return done(img.naturalWidth > 0);
      img.addEventListener("load", () => done(true)); img.addEventListener("error", () => done(false));
      setTimeout(() => done(false), 8000);
    })).catch(() => false);
    await shot("3-viewer-open");
    await dialog.locator(".mcs-pv-back").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(dir, `ref-${width}-4-viewer-no-back.png`) }); files.push(path.join(dir, `ref-${width}-4-viewer-no-back.png`));
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached", timeout: 3000 });
    must(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains("mcs-ws-artbtn")), "3. focus did not return to the picture");

    /* ---- 4. "I accept $11." in chat changes nothing ---- */
    const before = json(await deal());
    const talk = ws.locator(".mcs-msg");
    await talk.locator("textarea").fill("I accept $11.");
    await talk.locator("button[type=submit]").tap();
    await talk.locator("li", { hasText: "I accept $11." }).waitFor({ timeout: 4000 });
    await settle();
    must(json(await deal()) === before, "4. a chat message changed the deal");
    facts.chatted = { rows: await rows(), buttons: await buttons(), agreed: (await deal()).agreedPrice };
    must(json(facts.chatted.buttons) === json(["Accept $11", "Counter", "Withdraw offer"]), `4. buttons ${json(facts.chatted.buttons)}`);
    must(!facts.chatted.rows.some((r) => /Agreed/.test(r)) && facts.chatted.agreed === null, "4. an agreement after a chat message");
    await shot("5-chat-beneath-negotiation", talk);

    /* ---- 5. explicit acceptance ---- */
    const sent = commands.length;
    await stage.locator("button", { hasText: "Accept $11" }).tap();
    await page.locator(".mcs-ws-stage dl > div.agreed").waitFor({ timeout: 4000 });
    await settle();
    const o = await deal();
    facts.accepted = { rows: await rows(), buttons: await buttons(), turn: await said(ws.locator(".mcs-ws-turn")),
      commands: commands.slice(sent), stored: [o.listedPrice, o.agreedPrice, o.stage] };
    must(json(facts.accepted.commands) === json(["acceptPrice"]), `5. sent ${json(facts.accepted.commands)}`);
    must(json(facts.accepted.stored) === json([12, 11, "select-trade"]), `5. stored ${json(facts.accepted.stored)}`);
    must(json(facts.accepted.rows) === json(["Northline Cards' asking price $12", "Your offer $10", "Northline Cards' counter $11", "Agreed price $11"]),
      `5. rows ${json(facts.accepted.rows)}`);
    must(facts.accepted.buttons.length === 0, `5. buttons ${json(facts.accepted.buttons)}`);
    must(facts.accepted.turn === "Market price agreed", `5. turn ${facts.accepted.turn}`);
    await shot("6-after-acceptance");

    /* ---- 6. the viewer after acceptance ---- */
    await thumb.tap();
    await dialog.waitFor({ timeout: 3000 });
    await dialog.locator("img").evaluate((img) => img.complete || new Promise((done) => {
      img.addEventListener("load", done); img.addEventListener("error", done); setTimeout(done, 8000); })).catch(() => {});
    await shot("7-viewer-after-acceptance");
    await dialog.locator("button", { hasText: "Close" }).tap();
    await dialog.waitFor({ state: "detached", timeout: 3000 });
    facts.fits = await fits();
    must(facts.fits, "the page scrolls sideways");
    must(errors.length === 0, `page errors: ${errors.join("; ")}`);
    await context.close();
    return { ok: true, facts, files };
  } catch (e) {
    return { ok: false, error: e.message, facts, files };
  } finally {
    ctx.server.close();
  }
}

if (require.main === module) {
  (async () => {
    const dir = path.join(ROOT, "artifacts", "deal-refinement");
    fs.mkdirSync(dir, { recursive: true });
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ channel: "chrome" });
    const out = {};
    for (const width of [390, 320]) {
      out[width] = await run(dir, browser, width);
      console.log(`${out[width].ok ? "ok  " : "FAIL"} ${width}${out[width].ok ? "" : ` — ${out[width].error}`}`);
      for (const f of out[width].files) console.log(`     ${path.relative(ROOT, f)}`);
    }
    await browser.close();
    fs.writeFileSync(path.join(dir, "refinement.json"), JSON.stringify(out, null, 2));
    const bad = Object.values(out).filter((r) => !r.ok).length;
    console.log(`\n${2 - bad} passed, ${bad} failed — report: artifacts/deal-refinement/refinement.json`);
    process.exitCode = bad ? 1 : 0;
  })();
}
