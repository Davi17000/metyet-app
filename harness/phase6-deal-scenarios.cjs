#!/usr/bin/env node
/* ============================================================================
   PHASE 6 — COLLECTOR DEAL FLOW REVIEW SCENARIOS (Milestone 2A)

   Three moments of Market Validation, each on its own fresh, disposable,
   production-connected review world (harness/phase6-world.cjs: the real
   server, auth, allow-list, command transaction and domain over in-process
   PGlite). Nothing here writes a state by hand. Each scenario is the review
   story (`reviewSeed`) followed by the real commands two real people would
   send, through POST /api/commands, each under its own seat:

     a  Opening offer submitted   Casey: addGoal → startOpportunity $10
     b  Counteroffer received     … then Northline: proposePrice $11
     c  Agreed Market Price       … then Casey: acceptPrice
     d  Three Primary Goals       c, and (Milestone 2C.1) Charizard matched
                                  by two connected Trusted Partners, and a
                                  Pikachu nobody connected has

   The card is Mudkip, Ruby & Sapphire #60 (Normal), the copy Northline Cards'
   Raw · Near Mint at a Proposed Market Price of $12, Open to Offers — the
   review world's own `shops.n1`. Faraway Games is not connected to Casey and
   must never see or touch the deal.

   Used three ways:
     npm run review:mobile -- --scenario b     a phone window onto scenario b
     npm run review:deal-scenarios             headless: verify all three and
                                               photograph them at 390 × 844
                                               (artifacts/deal-scenarios/)
     tests/review-deal-scenarios.cjs           the same verification, no browser

   It invents no product behaviour: opening a deal reserves nothing (B44), and
   after agreement the screen says the next stage in words, because no later
   step is shipped. What a screen shows is checked against what the server
   holds, and what the server holds is checked against what was sent.
   ========================================================================== */
const fs = require("fs");
const path = require("path");
const { serve, reviewSeed, PHONE, signIn, ROOT } = require("./phase6-world.cjs");

const COLLECTOR = Object.freeze({ token: "casey", id: "c1", name: "Casey" });
const PARTNER = Object.freeze({ token: "north", id: "p-north", name: "Northline Cards" });
const STRANGER = Object.freeze({ token: "far", id: "p-far", name: "Faraway Games" });
const OFFER = 10;
const COUNTER = 11;
const LISTED = 12;

const SCENARIOS = Object.freeze({
  a: { key: "a", title: "Opening offer submitted",
    story: "Casey made a Primary Goal for the exact copy Northline has, and offered $10 against its Proposed Market Price of $12.",
    next: "Northline answers: Accept, Counter or Decline. Casey waits, and may withdraw." },
  b: { key: "b", title: "TP counteroffer received",
    story: "Casey offered $10; Northline countered $11. Casey has not answered.",
    next: "Casey answers: Accept $11, Counter, or Withdraw offer." },
  c: { key: "c", title: "Agreed Market Price",
    story: "Casey offered $10; Northline countered $11; Casey accepted. The Agreed Market Price is $11.",
    next: "Choosing what to trade (Select Trade) — named in words only; no later deal step is shipped." },
  d: { key: "d", base: "c", title: "Three Primary Goals",
    story: "Scenario c's agreed Mudkip deal, beside a Charizard Goal that Northline Cards and Harbor Card Exchange "
      + "both match (no deal yet) and a Jungle Pikachu Goal that only Faraway Games — not connected to Casey — has.",
    next: "Mudkip: View Agreement. Charizard: View Matches, then Make an offer if Casey chooses. Pikachu: nothing to do yet." },
});
/* Milestone 2C.1's second connected Trusted Partner, for scenario d. */
const HARBOR = Object.freeze({ token: "harbor", id: "p-harbor", name: "Harbor Card Exchange" });
/* What serve() needs for a scenario: its seed, its label, and any further
   connected Trusted Partners its story names. */
const serveOptions = (key) => ({ seed: dealSeed(key), label: `deal-${scenarioOf(key).key}`,
  morePartners: scenarioOf(key).key === "d" ? [{ ...HARBOR, city: "Seattle" }] : [] });
const scenarioOf = (key) => {
  const s = SCENARIOS[String(key || "").toLowerCase()];
  if (!s) throw new Error(`unknown scenario "${key}" — choose ${Object.keys(SCENARIOS).join(", ")}`);
  return s;
};

/* ------------------------------------------------------------------ SEEDING
   A `seed` for serve(): the review story, then the deal, each step a real
   command under its own seat. Returns the review story's ids plus `deal`. */
function dealSeed(key) {
  const s = scenarioOf(key);
  return async (kit) => {
    const ids = await reviewSeed(kit);
    const { post, postAs, catalog } = kit;
    /* the exact printing of Northline's copy, read from the catalogue as the
       review story itself does */
    const rs60 = (await catalog.findCardContexts({ number: "60", pokedex: 258 })).contexts[0];
    const normal60 = (await catalog.readCardContext(rs60.cardContextId)).canonicalCards
      .find((k) => k.finish === "non_holo").canonicalCardId;
    const invId = ids.shops.n1;
    const goalId = await post("addGoal", { canonicalCardId: normal60, tier: "primary",
      desired: { grade: "Raw", condition: "Near Mint" } });
    const oppId = await post("startOpportunity", { goalId, invId, amount: OFFER });
    const k = s.base || s.key;
    if (k === "b" || k === "c") await postAs(PARTNER.token, "proposePrice", { oppId, amount: COUNTER });
    if (k === "c") await post("acceptPrice", { oppId });
    let more = null;
    if (s.key === "d") {
      /* Charizard, Base Set #4 — the review story's own Primary Goal, PSA 9 —
         now matched at Northline (beside its PSA 8, which is not a match) and
         at Harbor; and a Primary Goal for Jungle Pikachu PSA 10, which only
         Faraway has — and Faraway is not connected to Casey. */
      const printing = async (number, pokedex, set) => {
        const ctxs = (await catalog.findCardContexts({ number, pokedex })).contexts;
        const c = ctxs.find((x) => x.expansionName === set);
        return (await catalog.readCardContext(c.cardContextId)).canonicalCards[0].canonicalCardId;
      };
      const charizard = await printing("4", 6, "Base Set");
      const pikachu = await printing("25", 25, "Jungle");
      const c1 = await postAs(PARTNER.token, "addInventoryCopy", { copy: { canonicalCardId: charizard, grade: "PSA 9", ask: 1250, cost: 900 } });
      const c2 = await postAs(HARBOR.token, "addInventoryCopy", { copy: { canonicalCardId: charizard, grade: "PSA 9", ask: 1180, cost: 850, firmOnPrice: true } });
      const pikaGoal = await post("addGoal", { canonicalCardId: pikachu, tier: "primary", desired: { grade: "PSA 10" } });
      /* Milestone 2C.2: a Primary Goal for the Reverse Holo Mudkip #60 — the
         review artwork's card, so its catalog image shows — which Northline's
         Firm on Price PSA 9 matches. And Casey asks Harbor for photos of its
         Charizard, which Harbor answers through its own Add requested photos
         (references, as the domain stores them; said in words, never drawn). */
      const reverse60 = (await catalog.readCardContext(rs60.cardContextId)).canonicalCards
        .find((k) => k.finish === "reverse_holofoil").canonicalCardId;
      const reverseGoal = await post("addGoal", { canonicalCardId: reverse60, tier: "primary", desired: { grade: "PSA 9" } });
      await post("requestPhotos", { invId: c2 });
      /* Milestone 2C.3: two legacy states. An inspection Casey opened, before
         Inspect left the screen, on Northline's PSA 8 Charizard (on the shelf,
         not a match for her PSA 9 Goal); and a photo request still pending on
         Northline's PSA 9. */
      const legacyReview = await post("reviewCopy", { invId: ids.shops.n3 });
      await post("requestPhotos", { invId: c1 });
      await postAs(HARBOR.token, "addCopyPhotos", { invId: c2, front: "harbor-photos/charizard-front.jpg", back: "harbor-photos/charizard-back.jpg" });
      more = { charizardGoal: ids.goal, pikachuGoal: pikaGoal, reverseGoal, charizardCopies: [c1, c2], mudkipGoal: goalId,
        reverseCopy: ids.shops.n2, legacyCopy: ids.shops.n3, legacyReview };
    }
    return { ...ids, deal: { scenario: s.key, goalId, oppId, invId, canonicalCardId: normal60 }, more };
  };
}

/* ------------------------------------------------------------------ READING */
const json = (v) => JSON.stringify(v);
async function send(ctx, who, command, payload) {
  const r = await fetch(ctx.url + "api/commands", { method: "POST",
    headers: { authorization: `Bearer ${who}`, "content-type": "application/json" }, body: json({ command, payload }) });
  const body = await r.json();
  return r.status === 200 ? { ok: true, value: body.value } : { ok: false, status: r.status, refused: body.error && body.error.refused };
}
async function view(ctx, who) {
  return (await (await fetch(ctx.url + "api/view", { headers: { authorization: `Bearer ${who}` } })).json()).state;
}

/* The production words for a deal, from the production modules that render
   them — so a report says what each screen says, not a paraphrase of it. */
const loaded = new Map();
function loadClient(rel) {
  if (loaded.has(rel)) return loaded.get(rel);
  const esbuild = require("esbuild");
  const out = esbuild.buildSync({ entryPoints: [path.join(ROOT, rel)], bundle: true, format: "cjs",
    write: false, logLevel: "silent", jsx: "automatic", platform: "node",
    external: ["react", "react-dom", "react/jsx-runtime"], define: { "process.env.NODE_ENV": '"production"' } });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  loaded.set(rel, mod.exports);
  return mod.exports;
}

/* ------------------------------------------------------------------ VERIFYING
   Everything the brief asks of a scenario, against the server. Throws on the
   first thing that is not so; returns the facts for the report. Every
   deliberate wrong move is refused, and the world is unchanged afterwards. */
async function verifyScenario(ctx, key) {
  const s = scenarioOf(key);
  /* the deal's own moment: scenario d's Mudkip deal is scenario c's */
  const k = s.base || s.key;
  const { deal } = ctx.ids;
  const fail = (msg) => { throw new Error(`scenario ${s.key}: ${msg}`); };
  const must = (cond, msg) => { if (!cond) fail(msg); };
  const same = (a, b, msg) => { if (json(a) !== json(b)) fail(`${msg} — expected ${json(b)}, got ${json(a)}`); };

  const w0 = await ctx.world();
  /* one opportunity, the one this scenario made */
  same(w0.opportunities.length, 1, "opportunities in the world");
  const opp = w0.opportunities[0];
  same([opp.id, opp.goalId, opp.invId, opp.collectorId, opp.partnerId],
    [deal.oppId, deal.goalId, deal.invId, COLLECTOR.id, PARTNER.id], "who and what the deal names");
  /* the pricing snapshot: captured at opening, never moved */
  const copy = w0.inventory.find((i) => i.invId === deal.invId);
  same([copy.ask, copy.firmOnPrice, opp.listedPrice, opp.firmOnPrice], [LISTED, false, LISTED, false], "Proposed Market Price snapshot");
  const thread = { a: [["collector", "offer", OFFER]], b: [["collector", "offer", OFFER], ["tp", "counter", COUNTER]],
    c: [["collector", "offer", OFFER], ["tp", "counter", COUNTER], ["collector", "accept", COUNTER]] }[k];
  same(opp.priceThread.map((p) => [p.by, p.type, p.amount]), thread, "price history");
  same(opp.agreedPrice, k === "c" ? COUNTER : null, "Agreed Market Price");
  same(opp.stage, k === "c" ? "select-trade" : "agree-price", "stage");
  /* nothing past agreement: no trade, no balance, no plan, not complete */
  same([opp.trade.cards.length, opp.trade.submitted, opp.deal.agreedAdj, opp.deal.tpAgreed, opp.deal.collectorAgreed,
    opp.fulfillment.method, opp.completedAt, opp.declined], [0, false, null, false, false, null, null, false], "nothing past the price");
  /* no reservation merely because an offer exists */
  same(copy.archived, false, "the copy was taken off the shelf");

  /* ---- the Collector's view */
  const cv = await view(ctx, COLLECTOR.token);
  const cOpps = cv.opportunities.filter((o) => o.goalId === deal.goalId);
  same(cOpps.length, 1, "Collector's deals on the Goal");
  const co = cOpps[0];
  same([co.listedPrice, co.agreedPrice, co.priceThread.length], [LISTED, opp.agreedPrice, thread.length], "Collector's deal");
  const turn = { a: ["tp", true], b: ["collector", true], c: [co.turn.seat, false] }[k];
  same([co.turn.seat, co.turn.priceOpen, co.turn.active], [...turn, true], "Collector's turn");
  const cCopy = cv.inventory.find((i) => i.invId === deal.invId);
  same(cCopy && cCopy.status, "available", "the copy's status for the Collector");
  must(!cv.inventory.some((i) => "cost" in i || "acquiredAt" in i), "a partner's cost reached the Collector");
  must(!cv.opportunities.some((o) => "tradeRate" in o), "a partner's trade rate reached the Collector");
  must(!cv.inventory.some((i) => i.partnerId === STRANGER.id), "Faraway's shelf reached the Collector");
  must(cv.goals.find((g) => g.id === deal.goalId).tier === "primary", "the Goal is not Primary");

  /* ---- the Trusted Partner's view, at the same moment */
  const tv = await view(ctx, PARTNER.token);
  const tOpps = tv.opportunities.filter((o) => o.id === deal.oppId);
  same(tOpps.length, 1, "Northline sees the deal");
  const to = tOpps[0];
  same([to.listedPrice, to.agreedPrice, to.priceThread.length, to.stage, to.turn.seat, to.turn.priceOpen],
    [LISTED, opp.agreedPrice, thread.length, opp.stage, co.turn.seat, co.turn.priceOpen], "Northline's deal");

  /* ---- a stranger sees nothing of it */
  const fv = await view(ctx, STRANGER.token);
  same(fv.opportunities.length, 0, "Faraway sees a deal");
  must(!fv.goals.some((g) => g.id === deal.goalId), "Faraway sees Casey's Goal");

  /* ---- wrong moves: each refused, none changes anything */
  const refusals = [];
  const refuse = async (who, command, payload, code) => {
    const r = await send(ctx, who, command, payload);
    if (r.ok) fail(`${who} ${command} was accepted`);
    if (code && r.refused !== code) fail(`${who} ${command} refused as ${r.refused}, expected ${code}`);
    refusals.push(`${who} ${command} → ${r.refused}`);
  };
  const oppId = deal.oppId;
  /* not a participant, in any stage */
  await refuse(STRANGER.token, "proposePrice", { oppId, amount: 9 });
  await refuse(STRANGER.token, "acceptPrice", { oppId });
  /* nobody answers a price out of turn */
  if (k === "a") {
    await refuse(COLLECTOR.token, "acceptPrice", { oppId }, "not-your-turn");
    await refuse(COLLECTOR.token, "proposePrice", { oppId, amount: 11 }, "not-your-turn");
  }
  if (k === "b") {
    await refuse(PARTNER.token, "acceptPrice", { oppId }, "not-your-turn");
    await refuse(PARTNER.token, "proposePrice", { oppId, amount: 12 }, "not-your-turn");
  }
  if (k === "c") {
    await refuse(COLLECTOR.token, "proposePrice", { oppId, amount: 10 });
    await refuse(PARTNER.token, "acceptPrice", { oppId });
    /* the next stage is not shipped: its command does not pass the door */
    await refuse(COLLECTOR.token, "proposeTradeSelection", { oppId, binderIds: [] }, "command-unavailable");
    await refuse(PARTNER.token, "proposeFinalBalance", { oppId, amount: 0 }, "command-unavailable");
  }
  /* one live deal per card: a second opening is refused */
  await refuse(COLLECTOR.token, "startOpportunity", { goalId: deal.goalId, invId: deal.invId, amount: 10 });
  const w1 = await ctx.world();
  same(json(w1.opportunities), json(w0.opportunities), "a refused move changed a deal");
  same(json(w1.inventory), json(w0.inventory), "a refused move changed a shelf");
  same(json(w1.goals), json(w0.goals), "a refused move changed a Goal");

  /* ---- scenario d: three Primary Goals, each its own (Milestone 2C.1) */
  let goals = null;
  if (s.key === "d") {
    const { more } = ctx.ids;
    const DFL = loadClient("client/collector/sections/DealFlow.jsx");
    const shown = DFL.dealFlowGoals(cv);
    const of = (id) => shown.find((g) => g.goal.id === id);
    const char = of(more.charizardGoal); const mud = of(more.mudkipGoal); const pika = of(more.pikachuGoal);
    must(char && mud && pika, "a Goal is missing from Deal Flow");
    same([char.partnerCount, char.copyCount, !!char.live], [2, 2, false], "Charizard: two Trusted Partners, no deal");
    same([mud.partnerCount, mud.live && mud.live.id], [1, deal.oppId], "Mudkip: one Trusted Partner, the agreed deal");
    same([pika.partnerCount, pika.copyCount, !!pika.live], [0, 0, false], "Pikachu: nobody connected has it");
    must(!cv.inventory.some((i) => i.partnerId === STRANGER.id), "Faraway's Pikachu reached Casey");
    const hv = await view(ctx, HARBOR.token);
    same(hv.opportunities.length, 0, "Harbor sees a deal it is not in");
    const rev = of(more.reverseGoal);
    same([rev && rev.partnerCount, rev && !!rev.live], [1, false], "Mudkip Reverse Holo: one Trusted Partner, no deal");
    const hc = cv.inventory.find((i) => i.invId === more.charizardCopies[1]);
    same([hc.photos.front, hc.photos.back], ["harbor-photos/charizard-front.jpg", "harbor-photos/charizard-back.jpg"], "Harbor's answered photos");
    goals = { charizard: `${char.partnerCount} Trusted Partners · ${char.copyCount} copies`, mudkip: "agreed", pikachu: "no match",
      reverse: "1 Trusted Partner · Firm on Price" };
  }

  const W = loadClient("client/negotiation.jsx");
  const DF = loadClient("client/collector/deal-parts.jsx");
  const P = loadClient("client/collector/deal-progress.js");
  const T = loadClient("client/tp/present.js");
  const glance = DF.dealGlance(co, "collector", PARTNER.name);
  const progress = P.dealProgress(co);
  return {
    scenario: s.key, title: s.title, story: s.story, next: s.next,
    collector: `${COLLECTOR.name} (${COLLECTOR.id})`, partner: `${PARTNER.name} (${PARTNER.id})`,
    card: "Mudkip · Ruby & Sapphire #60 · Normal (non-holo), English",
    copy: `${deal.invId} — Raw · Near Mint, Open to Offers`,
    proposedMarketPrice: LISTED, onTable: co.turn.priceOpen ? co.turn.amount : null, agreedMarketPrice: opp.agreedPrice,
    stage: opp.stage, turn: co.turn.priceOpen ? co.turn.seat : null,
    /* exactly as DealFlow.jsx (Milestone 2B) and Opportunities.jsx call them */
    collectorSays: glance.status,
    collectorAction: glance.cta,
    collectorProgress: progress.finished
      ? `${progress.finished} · Next: ${progress.label}${progress.available ? "" : " — not yet available"}` : progress.label,
    partnerSees: {
      panel: to.turn.priceOpen && to.turn.seat === "tp" ? "Ready to coordinate" : "In progress",
      stageTag: T.stageLabel(to.stage),
      turnTag: to.turn.seat === "tp" ? "Your move" : `Waiting for ${COLLECTOR.name}`,
      facts: { Listed: to.listedPrice, Agreed: to.agreedPrice },
      priceBlock: W.isUnresolved(to) ? { terms: W.termsLine(to), says: W.statusLine(to, "tp", COLLECTOR.name),
        controls: to.turn.seat === "tp" ? ["Accept", "Counter", "Decline"] : [] } : null,
    },
    copyStatusForCollector: cCopy.status, refusals, goals,
  };
}
/* ------------------------------------------------------------------ PHOTOGRAPHING
   The real Collector front door at 390 × 844, Deal Flow's Goal cards
   (Milestone 2C.1) and the Deal Workspace. Looking sends nothing: any command
   leaving the page fails the run. */
const settleFor = (page) => async () => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
};
const saidOf = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
const fitsOf = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
/* Where the focused element is: its Goal card and its class. */
const focusOf = (page) => page.evaluate(() => {
  const a = document.activeElement;
  const card = a && a.closest("[data-goal]");
  return { goal: card ? card.getAttribute("data-goal") : null, cls: a ? String(a.className || "") : null,
    text: a ? a.innerText.trim() : null };
});
/* A Goal card as the Collector sees it: its lines, its bar, its buttons. */
const cardOf = async (page, goalId) => {
  const card = page.locator(`article[data-goal='${goalId}']`);
  return { text: await saidOf(card), bars: await card.locator("[role=progressbar]").count(),
    buttons: (await card.locator("button").allInnerTexts()).map((t) => t.trim()),
    progress: (await card.locator(".mcs-dg-progress").count())
      ? await card.locator(".mcs-dg-progress > p").allInnerTexts() : [],
    accordion: await card.locator("[aria-expanded], [aria-controls], [hidden]").count(),
    nested: await card.locator("li, input, form, dl, details").count(),
    height: Math.round((await card.boundingBox()).height) };
};

async function photograph(ctx, key, dir, browser) {
  const s = scenarioOf(key);
  if (s.key === "d") return photographGoals(ctx, s, dir, browser);
  const { goalId, oppId } = ctx.ids.deal;
  const context = await browser.newContext({ ...PHONE });
  const page = await context.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const commands = []; page.on("request", (r) => { if (r.url().includes("/api/commands")) commands.push(r.postData()); });
  await signIn(page, ctx.url);
  await page.tap("nav[aria-label=Collector] button:has-text('Deal Flow')");
  const goal = page.locator(`article[data-goal='${goalId}']`);
  await goal.waitFor({ timeout: 8000 });
  const settle = settleFor(page);
  const base = path.join(dir, `deal-${s.key}-${s.title.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-$/, "")}`);
  const files = {};
  const ws = page.locator(".mcs-ws");

  /* 1. Deal Flow: the Goal's card, whole — no accordion to open */
  await settle();
  await goal.scrollIntoViewIfNeeded();
  const landing = { ...(await cardOf(page, goalId)), fits: await fitsOf(page) };
  files.landing = `${base}-1-deal-flow.png`;
  await page.screenshot({ path: files.landing });

  /* 2. the card's one action, by keyboard, opens the workspace on this exact deal */
  const cta = goal.locator("button.mcs-dg-cta");
  await cta.focus();
  await page.keyboard.press("Enter");
  await ws.waitFor({ timeout: 4000 });
  await settle();
  const workspace = { opp: await ws.getAttribute("data-opp"),
    header: await saidOf(page.locator(".mcs-ws-hd")), stage: await saidOf(page.locator(".mcs-ws-stage")),
    /* (Milestone 2D.2: the conversation is the deal's real thread, with its
       own composer — the one box drawn before anything is pressed) */
    talk: await saidOf(page.locator(".mcs-msg")),
    composer: await page.locator(".mcs-msg textarea").count(),
    buttons: (await page.locator(".mcs-ws-stage button").allInnerTexts()).map((b) => b.trim()),
    inputs: await page.locator(".mcs-ws input, .mcs-ws textarea").count() - await page.locator(".mcs-msg textarea").count(),
    nav: await page.locator("nav[aria-label=Collector]").count(),
    focused: (await focusOf(page)).cls, fits: await fitsOf(page) };
  files.workspace = `${base}-2-workspace.png`;
  await page.screenshot({ path: files.workspace });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  workspace.headerTop = await page.locator(".mcs-ws-hd").evaluate((el) => Math.round(el.getBoundingClientRect().top));

  /* 3. Back returns to the same Goal's card, focus on its action */
  await page.locator(".mcs-ws-back").tap();
  await goal.waitFor({ timeout: 4000 });
  await page.waitForTimeout(300);
  const returned = { focus: await focusOf(page), inView: await goal.evaluate((el) => {
    const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight; }), fits: await fitsOf(page) };
  files.returned = `${base}-3-back-to-goal.png`;
  await page.screenshot({ path: files.returned });

  /* 4. a reload signs out (the session is never stored, and the workspace is
        not in the address bar): signing back in lands on the first screen,
        and nothing about the deal changed */
  await goal.locator("button.mcs-dg-cta").tap();
  await ws.waitFor({ timeout: 4000 });
  const beforeReload = json(await ctx.world().then((w) => w.opportunities));
  await page.reload();
  await page.fill("#metyet-email", "casey@example.invalid");
  await page.click("button[type=submit]");
  await page.fill("#metyet-code", "123456");
  await page.click("button[type=submit]");
  await page.waitForSelector("nav[aria-label=Collector]");
  const reload = { workspace: await ws.count(), unchanged: json(await ctx.world().then((w) => w.opportunities)) === beforeReload };

  /* 5. scenario B: Accept from the workspace; the workspace, then the card,
        show what the server now says */
  let acted = null;
  const lookedOnly = commands.length;
  if (s.key === "b") {
    await page.tap("nav[aria-label=Collector] button:has-text('Deal Flow')");
    await goal.locator("button.mcs-dg-cta").tap();
    await ws.waitFor({ timeout: 4000 });
    await page.locator(".mcs-ws-stage button", { hasText: /^Accept \$11$/ }).tap();
    await page.locator(".mcs-ws-prices .agreed").waitFor({ timeout: 6000 });
    await settle();
    acted = { header: await saidOf(page.locator(".mcs-ws-hd")), stage: await saidOf(page.locator(".mcs-ws-stage")),
      buttons: (await page.locator(".mcs-ws-stage button").allInnerTexts()).map((b) => b.trim()), commands: commands.length - lookedOnly };
    files.acted = `${base}-4-after-accept.png`;
    await page.screenshot({ path: files.acted });
    await page.locator(".mcs-ws-back").tap();
    await goal.waitFor({ timeout: 4000 });
    acted.card = await cardOf(page, goalId);
  }
  await context.close();
  return { files, landing, workspace, returned, reload, acted, errors,
    commands: commands.slice(0, lookedOnly), oppId, goalId };
}

/* SCENARIO D (Milestone 2C.1): the visual deliverables — Deal Flow with three
   Primary Goals, each card on its own, View Matches, the Mudkip workspace and
   the way back; and the landing page at 320 × 568. */
async function photographGoals(ctx, s, dir, browser) {
  const { more, deal } = ctx.ids;
  const ids = { charizard: more.charizardGoal, mudkip: more.mudkipGoal, pikachu: more.pikachuGoal, reverse: more.reverseGoal };
  const base = path.join(dir, "deal-d-three-goals");
  const files = {};
  const errors = [];
  const commands = [];
  const open = async (opts) => {
    const context = await browser.newContext(opts);
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => { if (r.url().includes("/api/commands")) commands.push(r.postData()); });
    await signIn(page, ctx.url);
    await page.tap("nav[aria-label=Collector] button:has-text('Deal Flow')");
    await page.locator(`article[data-goal='${ids.pikachu}']`).waitFor({ timeout: 8000 });
    await settleFor(page)();
    return { context, page };
  };
  const { context, page } = await open({ ...PHONE });
  const settle = settleFor(page);
  const visible = async () => page.evaluate(() => [...document.querySelectorAll("article[data-goal]")].map((a) => {
    const r = a.getBoundingClientRect(); return { goal: a.getAttribute("data-goal"), top: Math.round(r.top), bottom: Math.round(r.bottom) }; }));
  const toMatches = async (goal) => {
    await page.locator(`article[data-goal='${goal}'] button.mcs-dg-cta`).tap();
    await page.locator(".mcs-gm").waitFor({ timeout: 4000 });
    await settle();
  };
  const back = async (goal) => { await page.locator(".mcs-ws-back").tap(); await page.locator(`article[data-goal='${goal}']`).waitFor(); await page.waitForTimeout(300); };
  const row = (inv) => page.locator(`.mcs-gm li.mcs-df-copy[data-inv='${inv}']`);

  /* 1. Deal Flow, Primary Goals only — the primary acceptance screenshot */
  files.landing = `${base}-1-deal-flow.png`;
  await page.screenshot({ path: files.landing });
  const landing = { order: await page.locator("article[data-goal]").evaluateAll((as) => as.map((a) => a.getAttribute("data-goal"))),
    positions: await visible(), sub: await saidOf(page.locator(".mcs-sub")), scope: await page.locator(".mcs-scope").count(),
    main: await saidOf(page.locator("main")),
    cards: { mudkip: await cardOf(page, ids.mudkip), charizard: await cardOf(page, ids.charizard), pikachu: await cardOf(page, ids.pikachu),
      reverse: await cardOf(page, ids.reverse) },
    fits: await fitsOf(page) };
  /* 2–4. each card on its own; 2 is the active Goal with its progress bar */
  for (const [n, name] of [[2, "mudkip"], [3, "charizard"], [4, "pikachu"]]) {
    files[name] = `${base}-${n}-${name}-card.png`;
    await page.locator(`article[data-goal='${ids[name]}']`).screenshot({ path: files[name] });
  }

  /* 15. the two Mudkip #60 Goals together — Normal and Reverse Holo */
  await page.locator(`article[data-goal='${ids.mudkip}']`).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  const twins = { normal: await saidOf(page.locator(`article[data-goal='${ids.mudkip}'] .mcs-dg-set`)),
    reverse: await saidOf(page.locator(`article[data-goal='${ids.reverse}'] .mcs-dg-set`)),
    bothInView: await page.evaluate((gs) => gs.every((g) => { const r = document.querySelector(`article[data-goal='${g}']`).getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight; }), [ids.mudkip, ids.reverse]) };
  files.twins = `${base}-15-two-mudkip-goals.png`;
  await page.screenshot({ path: files.twins });
  await page.evaluate(() => window.scrollTo(0, 0));

  /* 5–6. View Matches with a catalog image and Request actual photos; the
          picture, enlarged. Looking sends nothing. */
  await toMatches(ids.reverse);
  const rev = row(more.reverseCopy);
  const catalogRow = { text: await saidOf(rev), buttons: (await rev.locator("button").allInnerTexts()).map((t) => t.trim()),
    img: await rev.locator(".mcs-pv-thumb img").count() };
  files.catalog = `${base}-5-view-matches-catalog.png`;
  await page.screenshot({ path: files.catalog });
  await rev.locator(".mcs-pv-thumb").tap();
  const dialog = page.locator("[role=dialog]");
  await dialog.waitFor({ timeout: 4000 });
  await settle();
  const viewer = { text: await saidOf(dialog), img: await dialog.locator("img").count(),
    focus: (await focusOf(page)).text, fits: await fitsOf(page) };
  files.viewer = `${base}-6-photo-viewer.png`;
  await page.screenshot({ path: files.viewer });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached", timeout: 4000 });
  await page.waitForTimeout(200);   // focus returns on the next tick
  viewer.back = await page.evaluate(() => { const a = document.activeElement; const li = a && a.closest("li[data-inv]");
    return { inv: li ? li.getAttribute("data-inv") : null, cls: a ? String(a.className) : null }; });
  /* 9. Firm on Price: the same copy's opening */
  await rev.locator("button", { hasText: /^Make an offer$/ }).tap();
  const firmBox = rev.locator(".mcs-oo");
  await firmBox.waitFor();
  const firm = { text: await saidOf(firmBox), inputs: await firmBox.locator("input").count(),
    buttons: (await firmBox.locator("button").allInnerTexts()).map((t) => t.trim()) };
  await firmBox.scrollIntoViewIfNeeded();
  files.firm = `${base}-9-firm-on-price.png`;
  await page.screenshot({ path: files.firm });
  await firmBox.locator("button", { hasText: /^Cancel$/ }).tap();
  await back(ids.reverse);

  /* 7–8. Open to Offers: Dollar Amount, then Percentage, on Northline's Charizard */
  await toMatches(ids.charizard);
  const north = page.locator(".mcs-gm-partner", { hasText: "Northline Cards" }).locator("li.mcs-df-copy").first();
  const harbor = page.locator(".mcs-gm-partner", { hasText: "Harbor Card Exchange" }).locator("li.mcs-df-copy").first();
  const photosSaid = await saidOf(harbor);
  /* 17. the Charizard PSA 9 matches: Harbor's and Northline's PSA 9 only, and
         — apart, below — the PSA 8 Casey inspected before */
  const matchSet = { partners: (await page.locator(".mcs-gm-partner h2").allInnerTexts()).map((t) => t.trim()),
    matches: await page.locator(".mcs-gm-partner li.mcs-df-copy").evaluateAll((ls) => ls.map((l) => l.getAttribute("data-inv"))),
    held: await page.locator(".mcs-gm-held li.mcs-df-copy").evaluateAll((ls) => ls.map((l) => l.getAttribute("data-inv"))),
    header: await saidOf(page.locator(".mcs-gm .mcs-ws-hd")),
    heldTop: await page.locator(".mcs-gm-held").evaluate((el) => Math.round(el.getBoundingClientRect().top)) };
  files.charizardMatches = `${base}-17-charizard-psa9-matches.png`;
  await page.screenshot({ path: files.charizardMatches });
  /* 16. the legacy states, as they are now said */
  const legacy = row(more.legacyCopy);
  const legacyRow = { text: await saidOf(legacy), buttons: (await legacy.locator("button").allInnerTexts()).map((t) => t.trim()) };
  const pendingRow = { text: await saidOf(north), buttons: (await north.locator("button").allInnerTexts()).map((t) => t.trim()) };
  files.legacy = `${base}-16-legacy-inspection-and-request.png`;
  await page.screenshot({ path: files.legacy, fullPage: true });
  await north.locator("button", { hasText: /^Make an offer$/ }).tap();
  const box = north.locator(".mcs-oo");
  await box.waitFor();
  const empty = { value: await box.locator("input").inputValue(), placeholder: await box.locator("input").getAttribute("placeholder"),
    send: await box.locator("button[type=submit]").isDisabled() };
  await box.locator("input").fill("1100");
  const dollar = { text: await saidOf(box) };
  await north.scrollIntoViewIfNeeded();
  await box.scrollIntoViewIfNeeded();
  files.dollar = `${base}-7-offer-dollar.png`;
  await page.screenshot({ path: files.dollar });
  await box.locator("button", { hasText: /^Percentage$/ }).tap();
  await box.locator("input").fill("90");
  const percent = { text: await saidOf(box) };
  files.percent = `${base}-8-offer-percentage.png`;
  await page.screenshot({ path: files.percent });
  await box.locator("button", { hasText: /^Cancel$/ }).tap();
  await back(ids.charizard);

  /* 10–11. the Mudkip workspace (no Price History), and back to its card */
  const mudCta = page.locator(`article[data-goal='${ids.mudkip}'] button.mcs-dg-cta`);
  await mudCta.focus();
  await page.keyboard.press("Enter");
  const ws = page.locator(".mcs-ws[data-opp]");
  await ws.waitFor({ timeout: 4000 });
  await settle();
  const workspace = { opp: await ws.getAttribute("data-opp"), header: await saidOf(page.locator(".mcs-ws-hd")),
    stage: await saidOf(page.locator(".mcs-ws-stage")), history: await page.locator(".mcs-ws details, .mcs-ws summary").count(),
    fits: await fitsOf(page) };
  files.workspace = `${base}-10-mudkip-workspace.png`;
  await page.screenshot({ path: files.workspace });
  await back(ids.mudkip);
  const returned = { focus: await focusOf(page), inView: await page.locator(`article[data-goal='${ids.mudkip}']`).evaluate((el) => {
    const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }), fits: await fitsOf(page) };
  files.returned = `${base}-11-back-to-goal.png`;
  await page.screenshot({ path: files.returned });
  await context.close();

  /* 12–14. 320 × 568: the landing page, the percentage composer, the viewer */
  const small = await open({ ...PHONE, viewport: { width: 320, height: 568 } });
  files.small = `${base}-12-deal-flow-320.png`;
  await small.page.screenshot({ path: files.small });
  const narrow = { fits: await fitsOf(small.page) };
  await small.page.locator(`article[data-goal='${ids.charizard}'] button.mcs-dg-cta`).tap();
  await small.page.locator(".mcs-gm").waitFor();
  const sn = small.page.locator(".mcs-gm-partner", { hasText: "Northline Cards" }).locator("li.mcs-df-copy").first();
  await sn.locator("button", { hasText: /^Make an offer$/ }).tap();
  await sn.locator(".mcs-oo button", { hasText: /^Percentage$/ }).tap();
  await sn.locator(".mcs-oo input").fill("90");
  await sn.locator(".mcs-oo button[type=submit]").scrollIntoViewIfNeeded();
  const sendBox = await sn.locator(".mcs-oo button[type=submit]").boundingBox();
  narrow.composerFits = await fitsOf(small.page);
  narrow.sendVisible = sendBox && sendBox.y >= 0 && sendBox.y + sendBox.height <= 568;
  files.smallOffer = `${base}-13-offer-percentage-320.png`;
  await small.page.screenshot({ path: files.smallOffer });
  await sn.locator(".mcs-pv-thumb").tap();
  await small.page.locator("[role=dialog]").waitFor();
  await settleFor(small.page)();
  narrow.viewerFits = await fitsOf(small.page);
  const close = await small.page.locator("[role=dialog] button", { hasText: /^Close$/ }).boundingBox();
  narrow.closeVisible = close && close.y >= 0 && close.y + close.height <= 568;
  files.smallViewer = `${base}-14-photo-viewer-320.png`;
  await small.page.screenshot({ path: files.smallViewer });
  await small.context.close();
  return { scenario: "d", files, landing, catalogRow, viewer, firm, photosSaid, empty, dollar, percent, workspace, returned, twins, legacyRow, pendingRow, matchSet,
    narrow, errors, commands, ids, oppId: deal.oppId, reverseCopy: more.reverseCopy,
    charizardCopies: more.charizardCopies, legacyCopy: more.legacyCopy };
}

/* What each state must say and offer, per scenario. */
function checkScreen(key, shot) {
  const s = scenarioOf(key);
  if (s.key === "d") return checkGoals(shot);
  const fail = (msg) => { throw new Error(`scenario ${s.key} screen: ${msg}\n  saw: ${json({ l: shot.landing, w: shot.workspace, r: shot.returned })}`); };
  if (shot.errors.length) fail(`page errors: ${shot.errors.join(" | ")}`);
  if (shot.commands.length) fail(`looking sent ${shot.commands.length} command(s)`);
  const { landing: l, workspace: w, returned: r } = shot;
  const everything = [l.text, w.header, w.stage, w.talk].join(" ");
  /* the Goal card */
  for (const part of ["Mudkip", "Ruby & Sapphire · #60", "Raw · Near Mint", "Primary Goal", "1 Trusted Partner matches"]) {
    if (!l.text.includes(part)) fail(`the Goal card does not say "${part}"`);
  }
  if (/not_applicable|non_holo|\ben\b/.test(everything)) fail("an internal printing identifier is shown");
  if (/shop/i.test(everything)) fail("storefront wording is shown");
  if (/s's\b/.test(everything)) fail("an awkward possessive is shown");
  if (/Market Value|Sale Price|Listed Price/.test(everything)) fail("the partner's price is misnamed");
  if (l.accordion || l.nested) fail("the card has accordion or nested content");
  if (/Proposed Market Price|\$\d|Make an offer|Inspect/.test(l.text)) fail("the card shows copy, price or offer detail");
  if (l.bars !== 1) fail(`the card has ${l.bars} progress bars`);
  const expect = {
    a: { lines: ["Market Validation", "Waiting for Northline Cards"], cta: "View Deal", turn: "Waiting for Northline Cards",
      /* RESTATED (Milestone 2D.2 refinement): the shorter price words; the
         figure on the table marked Latest (drawn upper-case). */
      stage: [/Northline Cards' asking price\s+\$12/, /Your offer\s*Latest\s+\$10/i, /Northline Cards can accept, counter or decline/],
      buttons: ["Withdraw offer"] },
    b: { lines: ["Market Validation", "Your turn · Review counteroffer"], cta: "Review Counteroffer", turn: "Your turn · Review counteroffer",
      stage: [/Northline Cards' asking price\s+\$12/, /Your offer\s+\$10/, /Northline Cards' counter\s*Latest\s+\$11/i],
      buttons: ["Accept $11", "Counter", "Withdraw offer"] },
    c: { lines: ["Market price agreed", "Select Trade not yet available"], cta: "View Agreement", turn: "Market price agreed",
      stage: [/Northline Cards' asking price\s+\$12/, /Your offer\s+\$10/, /Northline Cards' counter\s+\$11/, /Agreed price\s+\$11/,
        /doesn't complete the deal/, /Select Trade comes next, and isn't available in MetYet yet/], buttons: [] },
  }[s.key];
  if (json(l.progress) !== json(expect.lines)) fail(`the card's stage and status are ${json(l.progress)}`);
  if (json(l.buttons) !== json([expect.cta])) fail(`the card's actions are ${json(l.buttons)}`);
  /* workspace */
  if (w.opp !== shot.oppId) fail("the workspace is not on this exact deal");
  if (w.nav !== 0) fail("the workspace is not full screen: the tab bar is still there");
  for (const part of ["Mudkip", "Ruby & Sapphire · #60", "with Northline Cards", expect.turn]) {
    if (!w.header.includes(part)) fail(`the workspace header does not say "${part}"`);
  }
  if (s.key === "c" ? !/Market Validation complete/.test(w.header) || !/Next: Step 2 of 10 · Select Trade — not yet available/.test(w.header)
    : !/Step 1 of 10 · Market Validation/.test(w.header)) fail("the workspace progress differs from the dashboard");
  for (const re of expect.stage) if (!re.test(w.stage)) fail(`the stage area does not say ${re}`);
  if (json(w.buttons) !== json(expect.buttons)) fail(`stage buttons are ${json(w.buttons)}`);
  /* Milestone 2C.2: no Price History, and no amount recited twice */
  if (/Price history|offered \$|countered with/i.test(w.stage)) fail("the workspace recites the price history");
  /* RESTATED (Milestone 2D.2 refinement): the Collector's $10 now stays
     beside the counter by design; what must not happen is the wrong figure
     being marked as the one on the table. */
  if (s.key === "b" && /Your offer\s*Latest/i.test(w.stage)) fail("the superseded offer is marked as the one on the table");
  if (s.key === "c" && /Latest/i.test(w.stage)) fail("a figure is still marked on the table after agreement");
  if (s.key === "c" && /balance|cash difference|completed|paid|Continue/i.test(w.stage)) fail("something past the price is implied");
  if (w.inputs !== 0) fail("an input is drawn before anything was pressed (a composer?)");
  /* RESTATED (Milestone 2D.2): the conversation is live — an empty thread
     and its composer, which says messages don't change the deal. Two-sided
     messaging has its own run: harness/phase6-deal-messaging.cjs. */
  if (!/Conversation with Northline Cards/i.test(w.talk) || !/No messages yet/.test(w.talk)
    || !/Chat doesn't confirm a deal/.test(w.talk) || w.composer !== 1) fail("the conversation area is not the deal's empty thread and composer");
  if (!/mcs-ws-title/.test(w.focused || "")) fail("focus did not move to the workspace title");
  if (w.headerTop !== 0) fail(`the header scrolled away (top ${w.headerTop})`);
  /* back */
  if (r.focus.goal !== shot.goalId || !/mcs-dg-cta/.test(r.focus.cls || "") || !r.inView) fail("Back did not return to the same Goal's card, focused on its action");
  if (shot.reload.workspace !== 0 || !shot.reload.unchanged) fail("a reload reopened a workspace or changed the deal");
  if (![l.fits, w.fits, r.fits].every(Boolean)) fail("the page scrolls sideways at 390");
  if (s.key === "b") {
    const a = shot.acted;
    if (a.commands !== 1) fail(`Accept sent ${a.commands} commands`);
    if (!/Market price agreed/.test(a.header) || !/Agreed price\s+\$11/.test(a.stage) || !/asking price\s+\$12/.test(a.stage)) fail("the workspace did not show the server's new state");
    if (a.buttons.some((b) => /Accept|Counter|Withdraw/.test(b))) fail("negotiation actions remain after agreement");
    if (json(a.card.progress) !== json(["Market price agreed", "Select Trade not yet available"]) || json(a.card.buttons) !== json(["View Agreement"])) {
      fail(`the card did not follow the server: ${json(a.card)}`);
    }
  }
}

function checkGoals(shot) {
  const fail = (msg) => { throw new Error(`scenario d screen: ${msg}\n  saw: ${json({ l: shot.landing, c: shot.catalogRow, v: shot.viewer, f: shot.firm, e: shot.empty, d: shot.dollar, p: shot.percent, w: shot.workspace, r: shot.returned, n: shot.narrow })}`); };
  if (shot.errors.length) fail(`page errors: ${shot.errors.join(" | ")}`);
  if (shot.commands.length) fail(`looking, opening a composer or typing sent ${shot.commands.length} command(s)`);
  const { landing: l, ids } = shot;
  /* Primary Goals only, in the server's order */
  if (json(l.order) !== json([ids.charizard, ids.mudkip, ids.pikachu, ids.reverse])) fail(`the Goals shown are ${json(l.order)}`);
  if (/Secondary|Venusaur/.test(l.main)) fail("a Secondary Goal is in Deal Flow");
  if (l.sub !== "Your collecting goals and where they stand." || l.scope !== 0) fail("the page's introduction is not the brief's");
  const { mudkip: mu, charizard: ch, pikachu: pk, reverse: rv } = l.cards;
  for (const [c, name] of [[mu, "Mudkip"], [ch, "Charizard"], [pk, "Pikachu"], [rv, "Mudkip"]]) {
    if (!c.text.startsWith(name) || !/Primary Goal/.test(c.text)) fail(`${name}'s card`);
    if (c.accordion || c.nested) fail(`${name}'s card has accordion or nested content`);
    if (/Proposed Market Price|\$\d|Make an offer|Inspect/.test(c.text)) fail(`${name}'s card shows copy, price or offer detail`);
  }
  if (mu.bars !== 1 || json(mu.progress) !== json(["Market price agreed", "Select Trade not yet available"])
    || json(mu.buttons) !== json(["View Agreement"])) fail("Mudkip's card lost its progress or its action");
  if (ch.bars !== 0 || json(ch.buttons) !== json(["View Matches"]) || !/2 Trusted Partners match/.test(ch.text)) fail("Charizard's card");
  if (pk.bars !== 0 || pk.buttons.length !== 0 || !/No Trusted Partner matches yet/.test(pk.text)) fail("Pikachu's card");
  if (rv.bars !== 0 || json(rv.buttons) !== json(["View Matches"])) fail("Mudkip Reverse Holo's card");
  if (l.positions.filter((p) => p.top >= 0 && p.top < 844).length < 2) fail("fewer than two Goal cards start on the first screen");
  if (!l.fits) fail("the landing page scrolls sideways at 390");
  /* image first */
  const c = shot.catalogRow;
  if (c.img !== 1 || !/catalog/i.test(c.text) || /Inspect/.test(c.buttons.join())) fail("the copy's catalog picture, or Inspect remains");
  if (!c.buttons.includes("Request actual photos") || !c.buttons.includes("Make an offer")) fail(`the row's actions: ${json(c.buttons)}`);
  const v = shot.viewer;
  if (v.img !== 1 || !/Catalog image — it shows the printing, not this copy's condition\./.test(v.text)) fail("the viewer does not say what the picture is");
  if (!/Request actual photos/.test(v.text) || v.focus !== "Close") fail("the viewer's request, or its focus");
  if (v.back.inv !== shot.reverseCopy || !/mcs-pv-thumb/.test(v.back.cls || "")) fail("closing the viewer did not return to the same copy");
  if (!/Partner photos: Front and back/.test(shot.photosSaid)) fail("Harbor's answered photos are not said");
  /* opening offers */
  if (shot.empty.value !== "" || shot.empty.placeholder || !shot.empty.send) fail("the composer opened pre-filled or sendable");
  if (!/Proposed Market Price from Northline Cards \$1,250/.test(shot.dollar.text) || !/Your opening offer \$1,100/.test(shot.dollar.text)
    || !/Send offer · \$1,100/.test(shot.dollar.text)) fail("Dollar Amount");
  if (!/A percentage of the \$1,250 Proposed Market Price\./.test(shot.percent.text)
    || !/Your opening offer · 90% of \$1,250 \$1,125/.test(shot.percent.text) || !/Send offer · \$1,125/.test(shot.percent.text)) fail("Percentage");
  if (shot.firm.inputs !== 0 || json(shot.firm.buttons) !== json(["Send offer at $85", "Cancel"])
    || !/Northline Cards is Firm on Price, so an opening offer is the Proposed Market Price\./.test(shot.firm.text)) fail("Firm on Price");
  /* the workspace */
  const w = shot.workspace;
  if (w.opp !== shot.oppId || !/Agreed price\s+\$11/.test(w.stage) || w.history !== 0 || /Price history|offered \$|countered with/i.test(w.stage)) fail("the Mudkip workspace");
  const r = shot.returned;
  if (r.focus.goal !== ids.mudkip || !/mcs-dg-cta/.test(r.focus.cls || "") || !r.inView) fail("Back did not return to Mudkip's card, focused on its action");
  /* Milestone 2C.3: two printings never read alike; the legacy states */
  if (shot.twins.normal !== "Ruby & Sapphire · #60 · Normal" || shot.twins.reverse !== "Ruby & Sapphire · #60 · Reverse Holo") fail(`the two Mudkips read ${json(shot.twins)}`);
  if (!shot.twins.bothInView) fail("the two Mudkip Goals are not both in view for their screenshot");
  if (!/Reverse Holo/.test(shot.viewer.text)) fail("the viewer does not name the version");
  if (!/Ruby & Sapphire · #60 · Normal · with Northline Cards/.test(w.header)) fail("the workspace does not name the version");
  if (!/PSA 8/.test(shot.legacyRow.text) || !/No longer matches your Goal/.test(shot.legacyRow.text)
    || json(shot.legacyRow.buttons.filter((b) => !/catalog|picture/i.test(b))) !== json(["Remove from list"])) fail(`the legacy inspection row: ${json(shot.legacyRow)}`);
  if (!/Photos requested/.test(shot.pendingRow.text) || shot.pendingRow.buttons.includes("Request actual photos")) fail("the pending photo request");
  /* the matching regression (2C.3): the PSA 8 is held, never matched */
  const m = shot.matchSet;
  if (json([...m.partners].sort()) !== json(["Harbor Card Exchange", "Northline Cards"]) || !/2 Trusted Partners match/.test(m.header)) fail(`Charizard's matching partners: ${json(m)}`);
  if (json([...m.matches].sort()) !== json([...shot.charizardCopies].sort())) fail(`Charizard's matches are ${json(m.matches)}`);
  if (json(m.held) !== json([shot.legacyCopy])) fail(`the held list is ${json(m.held)}`);
  /* 320 × 568 */
  const n = shot.narrow;
  if (!n.fits || !n.composerFits || !n.viewerFits) fail("the page scrolls sideways at 320");
  if (!n.sendVisible || !n.closeVisible) fail("a control is off-screen at 320");
}

/* ------------------------------------------------------------------ RUNNING (headless) */
async function main() {
  const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1] || true; };
  const dir = path.resolve(ROOT, typeof arg("--shots") === "string" ? arg("--shots") : "artifacts/deal-scenarios");
  const only = typeof arg("--scenario") === "string" ? [scenarioOf(arg("--scenario")).key] : Object.keys(SCENARIOS);
  let chromium = null;
  try { ({ chromium } = require("playwright")); } catch (e) { chromium = null; }
  fs.mkdirSync(dir, { recursive: true });
  const browser = chromium ? await chromium.launch({ channel: "chrome" }) : null;
  if (!browser) console.log("Playwright is not installed: verifying the server only, no screenshots.");
  const report = [];
  let failed = 0;
  for (const key of only) {
    const ctx = await serve({ port: 0, ...serveOptions(key) });
    try {
      const facts = await verifyScenario(ctx, key);
      let screen = null;
      if (browser) {
        const shot = await photograph(ctx, key, dir, browser);
        checkScreen(key, shot);
        screen = { screenshots: Object.fromEntries(Object.entries(shot.files).map(([k, f]) => [k, path.relative(ROOT, f)])),
          ...(shot.scenario === "d" ? { landing: shot.landing.cards, catalogRow: shot.catalogRow, viewer: shot.viewer,
            offer: { dollar: shot.dollar.text, percent: shot.percent.text, firm: shot.firm.text }, workspace: shot.workspace,
            narrow: shot.narrow } : { card: shot.landing.text, action: shot.landing.buttons[0],
            workspace: { header: shot.workspace.header, stage: shot.workspace.stage, controls: shot.workspace.buttons,
              conversation: shot.workspace.talk }, afterAccept: shot.acted }) };
      }
      report.push({ ...facts, screen });
      console.log(`ok   ${key}  ${facts.title} — ${facts.collectorSays}${screen ? `  [${Object.keys(screen.screenshots).length} screenshots]` : ""}`);
    } catch (e) {
      failed += 1;
      console.log(`FAIL ${key}  ${e.message}`);
    } finally {
      ctx.server.close();
    }
  }
  if (browser) await browser.close();
  fs.writeFileSync(path.join(dir, "scenarios.json"), JSON.stringify(report, null, 2));
  console.log(`\n${only.length - failed} passed, ${failed} failed — report: ${path.relative(ROOT, path.join(dir, "scenarios.json"))}`);
  process.exit(failed ? 1 : 0);
}

if (require.main === module) {
  main().catch((e) => { console.error(`Deal scenarios could not run: ${e.message.split("\n")[0]}`); process.exit(1); });
}
module.exports = { SCENARIOS, scenarioOf, dealSeed, serveOptions, verifyScenario, COLLECTOR, PARTNER, STRANGER, HARBOR };
