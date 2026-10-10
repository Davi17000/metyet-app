#!/usr/bin/env node
/* ============================================================================
   PHASE 6 — VISUAL FIDELITY HARNESS (P6-F1). `npm run review:fidelity`

   Puts the FROZEN Phase 6 prototype (phase6-prototype-01 @ fca2c61) and the
   production-connected Collector app side by side, on the same emulated phone,
   with the same Collector's data — and measures where they differ.

   WHAT MAKES THE COMPARISON FAIR
     Same phone      both run in Chrome emulating a 390 × 844 iPhone at 3×,
                     with touch (harness/phase6-world.cjs PHONE).
     Same framing    the prototype draws its own 390 × 820 phone with a 10px
                     bezel, so its SCREEN is the 370 × 800 inside it. Production
                     IS the screen: 390 × 844. Each side is captured as its
                     screen, aligned at the top, at 1 CSS px = 1 px; every
                     measurement is taken from the top of that screen.
     Same data       the prototype's "Returning Collector" preset is read from
                     the running prototype (window.__world) and rebuilt in a
                     fresh production world THROUGH THE REAL COMMANDS — same
                     binders (and put-away state), Goals with their tiers and
                     wanted grades, copies with their grades and PC / Trade /
                     Sell, every binder home, in the same order. Card identity
                     (name, set, number, version) comes from the dataset the
                     prototype itself loaded.
     Same front door production is signed in through the real <SignIn/> and
                     every production binding (phase6-world /app). Nothing on
                     the production side is hidden, restyled or injected.

   WHAT CANNOT BE THE SAME, AND IS RECORDED IN THE REPORT
     Artwork         production has no approved image source; the prototype
                     loads provider images. Each prototype screen is captured
                     as it is AND with its card images blocked at the network
                     (it then draws its own placeholders) — the like-for-like.
     Placeholder hue derived from each app's own card id, so colours differ.
     Width           370 vs 390 px of screen; tiles differ by that ratio.
     Tabs            two (prototype) vs four (approved production deviation).

   OPTIONS
     --proto URL     use an already-running prototype (default: start one from
                     fca2c61 in a temporary worktree, and remove it after)
     --out DIR       where to write (default artifacts/fidelity/<timestamp>,
                     gitignored)
     --strict        exit 1 if the first card is more than 16px from the
                     prototype's, or production scrolls sideways

   Prototype full-page captures let the prototype's fixed-height phone grow to
   its content; that changes the PROTOTYPE's frame only, and only for the
   full-page image. Needs Google Chrome (Playwright's "chrome" channel).
   ========================================================================== */
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const { spawn, execFileSync } = require("child_process");
const { serve, PHONE, signIn, ROOT } = require("./phase6-world.cjs");

const FROZEN = "fca2c61";
const PROTO_DIR = "prototypes/phase6-01-browse-add";
const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
const freePort = () => new Promise((r) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------- the prototype */
async function startPrototype() {
  const given = arg("--proto");
  if (given) return { url: given.replace(/\/?$/, "/"), stop: async () => {} };
  const head = git("rev-parse", "--short", "phase6-prototype-01");
  if (head !== FROZEN) throw new Error(`phase6-prototype-01 is at ${head}, not the frozen ${FROZEN}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metyet-proto-"));
  git("worktree", "add", "--detach", dir, FROZEN);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(dir, PROTO_DIR, "serve.mjs")], { cwd: dir, env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  const url = `http://localhost:${port}/`;
  for (let i = 0; i < 120; i += 1) {
    try { const r = await fetch(url); if (r.ok) break; } catch (e) { /* not yet */ }
    await sleep(250);
  }
  return { url, stop: async () => { child.kill(); try { git("worktree", "remove", "--force", dir); } catch (e) { /* already gone */ } } };
}

/* The dataset the prototype actually loaded: the exhaustive local snapshot if
   its server serves one, otherwise the bounded fixture committed at fca2c61. */
async function prototypeData(url) {
  try { const r = await fetch(`${url}tcgdex-exhaustive.json`); if (r.ok) return { source: "exhaustive snapshot", data: await r.json() }; } catch (e) { /* none */ }
  return { source: "bounded fixture @ fca2c61",
    data: JSON.parse(execFileSync("git", ["show", `${FROZEN}:${PROTO_DIR}/data/tcgdex-fixture.json`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 })) };
}

/* ----------------------------------- the prototype's catalogue, in production
   The SAME cards the prototype browses — its sets, card contexts (name, number,
   artist, Pokédex numbers) and printings — written straight into the review
   database's catalogue tables, WITHOUT images (production has no approved
   source). Ids are the prototype's own, so its preset can name them. This is a
   review fixture in a throwaway database; production's catalogue arrives only
   through `catalog:import`. */
async function importCatalogue(db, data, notes) {
  const sets = data.sets.map((x) => ({ id: x.code, code: x.code, name: x.name, series: x.series || null, release: x.releaseDate || null, total: x.printedTotal || null }));
  const contexts = data.contexts.map((c) => ({ id: c.id, set: c.setCode, n: String(c.number), name: c.name, artist: c.artist || null, rarity: c.rarity || null, dex: c.dexId || [] }));
  const printings = data.printings.map((p) => ({ id: p.id, ctx: p.contextId, finish: (p.dims && p.dims.finish) || "non_holo" }));
  await db.transaction(async (tx) => {
    await tx.query(`insert into metyet_catalog.expansions (expansion_id, game, code, natural_key, name, series, release_date, printed_total)
      select id, 'pokemon', code, 'proto:' || id, name, series, release, total from jsonb_to_recordset($1::jsonb)
      as x(id text, code text, name text, series text, release text, total int) on conflict do nothing`, [JSON.stringify(sets)]);
    await tx.query(`insert into metyet_catalog.card_contexts (card_context_id, expansion_id, collector_number, card_name, natural_key, artist, rarity, pokedex_numbers)
      select id, "set", n, name, 'proto:' || id, artist, rarity, dex from jsonb_to_recordset($1::jsonb)
      as x(id text, "set" text, n text, name text, artist text, rarity text, dex jsonb)
      where exists (select 1 from metyet_catalog.expansions e where e.expansion_id = x."set") on conflict do nothing`, [JSON.stringify(contexts)]);
    await tx.query(`insert into metyet_catalog.canonical_cards (canonical_card_id, card_context_id, print_run, finish, language, natural_key)
      select id, ctx, 'unlimited', finish, 'en', 'proto:' || id from jsonb_to_recordset($1::jsonb) as x(id text, ctx text, finish text)
      where exists (select 1 from metyet_catalog.card_contexts c where c.card_context_id = x.ctx) on conflict do nothing`, [JSON.stringify(printings)]);
  });
  notes.push(`catalogue: the prototype's own ${sets.length.toLocaleString()} sets, ${contexts.length.toLocaleString()} cards, ${printings.length.toLocaleString()} printings — loaded into the review database without images`);
}

/* ------------------------------------------ the prototype's preset, in production */
function seedFrom(world, data, notes) {
  const printing = new Map(data.printings.map((p) => [p.id, p]));
  const context = new Map(data.contexts.map((c) => [c.id, c]));
  const set = new Map(data.sets.map((s) => [s.code, s]));
  const identity = (cp) => {
    const p = printing.get(cp); const c = p && context.get(p.contextId); const s = c && set.get(c.setCode);
    if (!p || !c || !s) { notes.push(`unresolved printing ${cp}`); return null; }
    return { name: c.name, number: c.number, finish: p.dims.finish, set: { code: s.code, name: s.name, printedTotal: s.printedTotal || null } };
  };
  return async ({ post, db }) => {
    await importCatalogue(db, data, notes);
    /* the preset names printings by the prototype's ids, which are now the catalogue's */
    const canonical = async (cp) => (identity(cp) ? cp : null);
    const byTime = (a, b) => String(a.at).localeCompare(String(b.at));
    const binderId = new Map();
    for (const b of [...world.binders].map((x) => ({ ...x, at: x.createdAt })).sort(byTime)) {
      binderId.set(b.id, await post("createBinder", { name: b.name }));
    }
    const things = [
      ...world.goals.map((g) => ({ kind: "goal", row: g, at: g.createdAt })),
      ...world.collectorCopies.map((c) => ({ kind: "copy", row: c, at: c.addedAt })),
    ].sort(byTime);
    const objectId = new Map();
    for (const t of things) {
      const cc = await canonical(t.row.canonicalCardId);
      if (!cc) continue;
      if (t.kind === "goal") {
        objectId.set(`g:${t.row.id}`, await post("addGoal", { canonicalCardId: cc, tier: t.row.tier, ...(t.row.desired ? { desired: t.row.desired } : {}) }));
      } else {
        const c = t.row;
        objectId.set(`c:${c.id}`, await post("addCollectorCopy", { copy: { canonicalCardId: cc, grade: c.grade, condition: c.condition || undefined,
          ...(c.offered === true ? { offered: true } : c.keeping === true ? { keeping: true } : {}) } }));
      }
    }
    for (const m of world.binderMemberships) {
      const key = m.goalId ? `g:${m.goalId}` : `c:${m.collectorCopyId}`;
      if (!objectId.has(key) || !binderId.has(m.binderId)) { notes.push(`membership ${m.id} not carried (its object or binder is missing)`); continue; }
      await post("fileObject", { binderId: binderId.get(m.binderId), ...(m.goalId ? { goalId: objectId.get(key) } : { collectorCopyId: objectId.get(key) }) });
    }
    for (const b of world.binders) if (b.archivedAt) await post("setBinderArchived", { binderId: binderId.get(b.id), archived: true });
    return { binderNames: world.binders.filter((b) => !b.archivedAt).map((b) => b.name) };
  };
}

/* ------------------------------------------------------------- capture */
const touch = (cdp, type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
const centre = async (l) => { const b = await l.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

/* Each side, described once: how to reach a screen, where its screen is, and
   which element is which, so one walk and one measure serve both. */
const SIDES = {
  proto: {
    label: "Frozen prototype @ fca2c61",
    screen: async (p) => { const b = await p.locator(".phone").boundingBox(); return { x: b.x + 10, y: b.y + 10, width: b.width - 20, height: b.height - 20 }; },
    sel: { title: ".phone .hd h1", search: ".phone .narrow input", lenses: ".phone .lenses", binders: ".phone button.sechead", unfiled: ".phone .unfhead",
      yourCards: ".phone .rhead", firstCard: ".phone .results .otile", art: ".phone .results .otile .art", nav: ".phone .tabbar", navLabel: ".phone .tabbar button",
      scroller: ".phone .screen" },
    tab: (p, name) => p.locator(".phone .tabbar button", { hasText: name }),
    sechead: (p) => p.locator(".phone button.sechead").first(),
    binder: (p, name) => p.locator(".phone button.bhead", { hasText: name }).first(),
    tile: (p, state) => p.locator(".phone .results .otile").filter({ has: p.locator(`.mk.t-${{ primary: "pri", trade: "trade" }[state]}`) }).locator("button.otap").first(),
    open: async (p, tileLoc) => { await tileLoc.tap(); },
    dest: (p) => p.locator(".phone [data-dest]:not(.off)").filter({ hasNotText: /Cancel|Unfiled|New binder/ }).first(),
  },
  prod: {
    label: "Production (real front door)",
    screen: async (p) => ({ x: 0, y: 0, width: 390, height: 844 }),
    sel: { title: ".mcs-hd h1", search: ".mcs-bcontrols input", lenses: ".mcs-lenses", binders: "button.mcs-sechead", unfiled: ".mcs-unfiled button.mcs-sechead",
      yourCards: ".mcs-rhead", firstCard: "section[aria-label='Your Cards'] li.mcs-otile", art: "section[aria-label='Your Cards'] .mcs-otile-art", nav: "nav[aria-label=Collector]",
      navLabel: "nav[aria-label=Collector] button .l", scroller: null },
    tab: (p, name) => p.locator("nav[aria-label=Collector] button", { hasText: name }),
    sechead: (p) => p.locator("button.mcs-sechead", { hasText: /^Binders/ }).first(),
    binder: (p, name) => p.locator("button.mcs-bhead", { hasText: name }).first(),
    tile: (p, state) => p.locator("section[aria-label='Your Cards'] li.mcs-otile").filter({ has: p.locator(`.mcs-mk-${state}`) }).locator("button.mcs-otap").first(),
    open: async (p, tileLoc) => { await tileLoc.tap(); },
    dest: (p) => p.locator("[data-dest^='b:']:not(.off)").first(),
  },
};

const BROWSE = {
  proto: { tabs: ".phone .tabs button", gen: ".phone .filters.gens button", tile: ".phone .tile", cell: ".phone .grid .cell",
    clearAll: ".phone .chips .clearall", search: ".phone .narrow.unified input", suggestion: ".phone .suggestions button",
    m: { title: ".phone .hd h1", search: ".phone .narrow.unified input", tabs: ".phone .tabs", gens: ".phone .filters.gens",
      firstTile: ".phone .tiles .tile", tileArt: ".phone .tiles .tile .art", firstCell: ".phone .grid .cell", cellArt: ".phone .grid .cell .art" } },
  prod: { tabs: ".mcs-dtabs button", gen: ".mcs-dgens button", tile: ".mcs-dtile", cell: ".mcs-dcell",
    clearAll: ".mcs-dchip.clearall", search: ".mcs-dsearch-in", suggestion: ".mcs-dsugg button",
    m: { title: ".mcs-hd h1", search: ".mcs-dsearch-in", tabs: ".mcs-dtabs", gens: ".mcs-dgens",
      firstTile: ".mcs-dtile", tileArt: ".mcs-dtile-art", firstCell: ".mcs-dcell", cellArt: ".mcs-dcell-art" } },
};
async function measureBrowse(page, side) {
  const screen = await SIDES[side].screen(page);
  return page.evaluate(({ sel, screen }) => {
    const out = {};
    for (const [k, q] of Object.entries(sel)) {
      const e = document.querySelector(q); if (!e) { out[k] = null; continue; }
      const b = e.getBoundingClientRect(); out[k] = { top: Math.round(b.top - screen.y), w: Math.round(b.width), h: Math.round(b.height) };
    }
    out.overflowX = document.documentElement.scrollWidth > window.innerWidth;
    return out;
  }, { sel: BROWSE[side].m, screen });
}

async function measure(page, side) {
  const s = SIDES[side];
  const screen = await s.screen(page);
  return page.evaluate(({ sel, screen }) => {
    const box = (q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect();
      return { top: Math.round(b.top - screen.y), left: Math.round(b.left - screen.x), w: Math.round(b.width), h: Math.round(b.height) }; };
    const out = {};
    for (const [k, q] of Object.entries(sel)) if (k !== "navLabel" && k !== "scroller" && q) out[k] = box(q);
    /* every tab label on ONE line: its height is no more than ~1.4 lines */
    out.navLabels = [...document.querySelectorAll(sel.navLabel)].map((e) => {
      /* the rendered LINE BOXES of the label's text, not the button's height */
      const r = document.createRange(); r.selectNodeContents(e);
      const tops = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)));
      return { text: e.textContent.trim(), lines: tops.size, w: Math.round(e.getBoundingClientRect().width) };
    });
    out.screen = { w: Math.round(screen.width), h: Math.round(screen.height) };
    out.overflowX = document.documentElement.scrollWidth > window.innerWidth;
    out.viewport = [window.innerWidth, window.innerHeight, window.devicePixelRatio];
    return out;
  }, { sel: s.sel, screen });
}

async function run() {
  const { chromium } = require("playwright");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const OUT = path.resolve(arg("--out") || path.join(ROOT, "artifacts", "fidelity", stamp));
  fs.mkdirSync(OUT, { recursive: true });
  const notes = [];
  const proto = await startPrototype();
  let prod = null; let browser = null;
  try {
    browser = await chromium.launch({ channel: "chrome" });
    /* 1. the prototype's own preset, as data */
    const look = await browser.newContext({ ...PHONE }); const lp = await look.newPage();
    await lp.goto(proto.url); await lp.waitForSelector(".phone");
    await lp.locator(".controls button", { hasText: /^Returning Collector$/ }).click(); await sleep(400);
    const world = await lp.evaluate(() => window.__world);
    await look.close();
    const { source, data } = await prototypeData(proto.url);
    notes.push(`prototype dataset: ${source}`);
    notes.push(`fixture: ${world.binders.length} binders (${world.binders.filter((b) => b.archivedAt).length} put away), ${world.goals.length} Goals, ${world.collectorCopies.length} copies, ${world.binderMemberships.length} homes — rebuilt in production through createBinder / addGoal / addCollectorCopy / fileObject / setBinderArchived`);
    /* 2. the same Collector, in production */
    const seed = seedFrom(world, data, notes);
    let names = null;
    prod = await serve({ collectorName: world.collectors[0].name, seed: async (api) => { const r = await seed(api); names = r.binderNames; return r; } });
    const firstBinder = names[0];

    const results = {};
    for (const [side, variant] of [["proto", "art"], ["proto", "placeholders"], ["prod", "app"]]) {
      const S = SIDES[side];
      const context = await browser.newContext({ ...PHONE });
      if (variant === "placeholders") {
        /* card images only, at the network: the prototype then draws its own placeholders */
        await context.route((u) => !u.href.startsWith(proto.url), (r) => r.abort());
      }
      const page = await context.newPage(); const cdp = await context.newCDPSession(page);
      const errors = []; page.on("pageerror", (e) => errors.push(e.message));
      const tag = side === "prod" ? "prod" : `proto-${variant}`;
      const shot = async (name, full = false) => {
        const clip = await S.screen(page);
        await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`), clip });
        if (!full) return;
        if (side === "prod") { await page.screenshot({ path: path.join(OUT, `${tag}-${name}-full.png`), fullPage: true }); return; }
        await page.evaluate(() => { const ph = document.querySelector(".phone"); const sc = ph.querySelector(".screen");
          window.__saved = [ph.style.height, sc && sc.style.height]; ph.style.height = "auto"; if (sc) sc.style.height = "auto"; ph.querySelector(".pbody").style.overflow = "visible"; });
        await page.locator(".phone").screenshot({ path: path.join(OUT, `${tag}-${name}-full.png`) });
        await page.evaluate(() => { const ph = document.querySelector(".phone"); const sc = ph.querySelector(".screen");
          ph.style.height = window.__saved[0]; if (sc) sc.style.height = window.__saved[1]; ph.querySelector(".pbody").style.overflow = ""; });
      };
      if (side === "prod") await signIn(page, prod.url);
      else { await page.goto(proto.url); await page.waitForSelector(".phone"); await page.locator(".controls button", { hasText: /^Returning Collector$/ }).click(); await sleep(300); }
      const top = async () => { if (S.sel.scroller) await page.evaluate((q) => { const e = document.querySelector(q); if (e) e.scrollTop = 0; }, S.sel.scroller); await page.evaluate(() => window.scrollTo(0, 0)); await page.locator(side === "prod" ? "body" : ".phone").scrollIntoViewIfNeeded(); };
      const m = {};
      await S.tab(page, "Browse").tap(); await sleep(500); await top();
      await shot("01-browse", true);
      await S.tab(page, "Binders").tap(); await sleep(600); await top();
      await shot("02-binders-home", true);
      m.bindersHome = await measure(page, side);
      await S.sechead(page).tap(); await sleep(250);
      await S.binder(page, firstBinder).tap(); await sleep(450);
      await shot("03-expanded-binder", true);
      await S.binder(page, firstBinder).tap(); await sleep(250);
      await S.sechead(page).tap(); await sleep(250); await top();
      const yc = page.locator(S.sel.yourCards); await yc.scrollIntoViewIfNeeded(); await sleep(200);
      await shot("04-tiles");
      const goal = S.tile(page, "primary"); await goal.scrollIntoViewIfNeeded(); await S.open(page, goal); await sleep(600);
      await shot("05-card-detail");
      await page.keyboard.press("Escape"); await sleep(200);
      if (side === "proto") { const back = page.locator(".phone button.back").first(); if (await back.count()) { await back.tap(); await sleep(300); } }
      else { const close = page.locator("[role=dialog] button[aria-label=Close]"); if (await close.count()) { await close.tap(); await sleep(300); } }
      const trade = S.tile(page, "trade"); await trade.scrollIntoViewIfNeeded(); await sleep(150);
      const f = await centre(trade);
      await touch(cdp, "touchStart", f.x, f.y); await sleep(650);
      const dl = S.dest(page);
      if (await dl.count()) {
        const d = await centre(dl);
        for (let i = 1; i <= 6; i += 1) await touch(cdp, "touchMove", f.x + ((d.x - f.x) * i) / 6, f.y + ((d.y - f.y) * i) / 6);
        await sleep(200); await shot("06-filing-chooser");
        await touch(cdp, "touchEnd", d.x, d.y); await sleep(900);
        await shot("07-filing-confirmation");
      } else { notes.push(`${tag}: a hold did not open the filing chooser`); await touch(cdp, "touchEnd", f.x, f.y); }
      results[tag] = { metrics: m, errors };
      await context.close();
    }

    /* 2b. BROWSE, every journey (P6-F2) — the same catalogue on both sides */
    for (const [side, variant] of [["proto", "placeholders"], ["proto", "art"], ["prod", "app"]]) {
      const S = SIDES[side];
      const context = await browser.newContext({ ...PHONE });
      if (variant === "placeholders") await context.route((u) => !u.href.startsWith(proto.url), (r) => r.abort());
      const page = await context.newPage();
      const errors = []; page.on("pageerror", (e) => errors.push(e.message));
      const tag = side === "prod" ? "prod" : `proto-${variant}`;
      const B = BROWSE[side];
      const shot = async (name) => { await sleep(350); await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`), clip: await S.screen(page) }); };
      if (side === "prod") await signIn(page, prod.url);
      else { await page.goto(proto.url); await page.waitForSelector(".phone"); await page.locator(".controls button", { hasText: /^Returning Collector$/ }).click(); await sleep(300); }
      await S.tab(page, "Browse").tap(); await sleep(700);
      await shot("b01-landing");
      const bm = { landing: await measureBrowse(page, side) };
      await page.locator(B.gen, { hasText: "Gen 3" }).first().tap(); await sleep(500);
      await shot("b02-gen3");
      const dex = page.locator(`${B.tile}[data-dex='258']`); await dex.scrollIntoViewIfNeeded(); await dex.tap(); await sleep(800);
      await shot("b03-pokemon-cards");
      bm.results = await measureBrowse(page, side);
      await page.locator(B.cell).first().tap(); await sleep(900);
      await shot("b04-card-selected");
      /* both sides now close the card the prototype's way (P6-F3A) */
      await page.locator(side === "prod" ? ".mcs-cd-back" : ".phone .detail button.back").tap();
      await sleep(500);
      await shot("b05-back");
      await page.locator(B.clearAll).tap(); await sleep(300);
      await page.locator(B.tabs, { hasText: "Sets" }).tap(); await sleep(700);
      await shot("b06-sets");
      await page.locator(B.search).fill("ruby"); await sleep(900);
      await shot("b07-suggestions");
      await page.locator(B.suggestion, { hasText: "Ruby & Sapphire" }).first().tap(); await sleep(900);
      await shot("b08-set-cards");
      await page.locator(B.clearAll).tap(); await sleep(300);
      await page.locator(B.tabs, { hasText: "Artists" }).tap(); await sleep(700);
      await shot("b09-artists");
      await page.locator(B.search).fill("nishida"); await sleep(900);
      await page.locator(B.suggestion, { hasText: "Nishida" }).first().tap(); await sleep(900);
      await shot("b10-artist-cards");
      await page.locator(B.clearAll).tap(); await sleep(300);
      await page.locator(B.search).fill("zzzzq"); await sleep(900);
      await shot("b11-empty");
      results[tag] = { ...(results[tag] || {}), browse: bm, browseErrors: errors };
      await context.close();
    }
    /* 2c. THE CARD (P6-F3A): Mudkip, Ruby & Sapphire #60 — WITH its picture on
       both sides (the prototype as shipped; production through the review-only
       artwork exception in phase6-world.cjs). */
    const CARD = {
      proto: { cell: () => ".phone .grid .cell", scroll: ".phone .detail-scroll", choice: ".phone .detail .choice", back: ".phone .detail button.back",
        m: { header: ".phone .detail .hd", back: ".phone .detail .back", hero: ".phone .detail .hero .art", ident: ".phone .detail .ident", h2: ".phone .detail .ident h2",
          versions: ".phone .detail .q", dock: ".phone .detail .dock", add: ".phone .detail .add" } },
      prod: { cell: () => "button.mcs-dcell", scroll: ".mcs-cd-scroll", choice: ".mcs-cd-choice", back: ".mcs-cd-back",
        m: { header: ".mcs-cd-hd", back: ".mcs-cd-back", hero: ".mcs-cd-art.hero", ident: ".mcs-cd-ident", h2: ".mcs-cd-ident h2",
          versions: ".mcs-cd-q", dock: ".mcs-cd-dock", add: ".mcs-cd-add" } },
    };
    for (const [side, tag] of [["proto", "proto-art"], ["prod", "prod"]]) {
      const S = SIDES[side]; const C = CARD[side];
      const context = await browser.newContext({ ...PHONE }); const page = await context.newPage();
      const errors = []; page.on("pageerror", (e) => errors.push(e.message));
      const shot = async (name) => { await sleep(450); await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`), clip: await S.screen(page) }); };
      if (side === "prod") await signIn(page, prod.url);
      else { await page.goto(proto.url); await page.waitForSelector(".phone"); await page.locator(".controls button", { hasText: /^Returning Collector$/ }).click(); await sleep(300); }
      await S.tab(page, "Browse").tap(); await sleep(600);
      const dex = page.locator(`${BROWSE[side].tile}[data-dex='258']`); await dex.scrollIntoViewIfNeeded(); await dex.tap(); await sleep(900);
      const cell = page.locator(C.cell()).filter({ hasText: side === "prod" ? undefined : "#60" })
        .filter(side === "prod" ? { has: page.locator("img") } : { hasText: "Ruby & Sapphire" }).first();
      const target = side === "prod" ? page.locator("button.mcs-dcell[aria-label='Mudkip, Ruby & Sapphire #60']") : cell;
      await target.scrollIntoViewIfNeeded(); await sleep(300);
      await shot("c00-browse-before");
      const browseY = await page.evaluate(() => [window.scrollY, (document.querySelector(".phone .screen") || {}).scrollTop || 0]);
      await target.tap(); await sleep(1200);
      await shot("c01-open");
      const loaded = await page.evaluate(() => [...document.querySelectorAll("img")].filter((i) => /ex1\/60/.test(i.currentSrc || i.src))
        .map((i) => ({ src: i.currentSrc || i.src, ok: i.complete && i.naturalWidth > 0, w: i.naturalWidth })));
      const cm = await page.evaluate(({ sel, screen }) => { const o = {}; for (const [k, q] of Object.entries(sel)) { const e = document.querySelector(q); if (!e) { o[k] = null; continue; }
        const b = e.getBoundingClientRect(); o[k] = { top: Math.round(b.top - screen.y), left: Math.round(b.left - screen.x), w: Math.round(b.width), h: Math.round(b.height),
          font: getComputedStyle(e).fontSize }; } return o; }, { sel: C.m, screen: await S.screen(page) });
      const rev = page.locator(C.choice, { hasText: "Reverse Holo" }).first();
      if (await rev.count()) { await rev.scrollIntoViewIfNeeded(); await rev.tap(); } await shot("c03-version-chosen");
      /* the header carries the card once the picture scrolls away — when the page is long enough to scroll */
      await page.locator(C.scroll).evaluate((e) => e.scrollTo(0, e.scrollHeight)); await shot("c02-scrolled-collapsed");
      await page.locator(C.scroll).evaluate((e) => e.scrollTo(0, 0)); await sleep(200);
      await page.locator("[aria-label='Next card']").tap(); await sleep(1100); await shot("c04-next");
      await page.locator("[aria-label='Previous card']").tap(); await sleep(1100); await shot("c05-previous");
      await page.locator(C.back).tap(); await sleep(700); await shot("c06-back-to-browse");
      const browseYAfter = await page.evaluate(() => [window.scrollY, (document.querySelector(".phone .screen") || {}).scrollTop || 0]);
      results[tag] = { ...(results[tag] || {}), card: { measures: cm, images: loaded, scrollBefore: browseY, scrollAfter: browseYAfter }, cardErrors: errors };
      await context.close();
    }

    /* 2e. STAGE 2 (P6-F3A): the guided questions on Mudkip R&S #60, the same
       taps on both sides, each shot with the newest question scrolled into
       view. s12 (a refused save) has no prototype reference: the prototype
       cannot be refused — it alerts a defect — so it is production only. */
    /* Stage 2.1 order: version → raw or graded → condition or grade → what it
       means → tier or disposition. The PROTOTYPE asks in its own (earlier)
       order, so its shots follow the same taps in its order and show the
       nearest state it has — compared for styling, not for sequence. */
    const FLOW = [
      ["s01-open", []], ["s02-versions", ["__scroll-versions"]], ["s03-version-raw-graded", ["Reverse Holo"]],
      ["s04-raw-condition", ["Raw", "Near Mint"]], ["s05-graded-grades", ["Graded"]],
      ["s06-meaning", ["PSA 9"]], ["s07-looking-tier", ["I'm looking for it", "Primary"]], ["s07b-secondary", ["Secondary"]],
      ["s08-own-disposition", ["I own it", "Trade / Sell"]], ["s09-ready", ["Personal collection"]],
    ];
    /* the prototype's order for the same answers */
    const PROTO_TAPS = { "Raw": ["I'm looking for it", "Raw"], "Graded": ["Graded"], "PSA 9": ["PSA 9"], "I'm looking for it": [],
      "I own it": ["I own it", "Personal collection", "Graded", "PSA 9"], "Personal collection": ["Personal collection"] };
    const DETAIL = { proto: { root: ".phone .detail", scroll: ".phone .detail-scroll", choice: ".phone .detail .choice", add: ".phone .detail .add", back: ".phone .detail button.back",
        remembered: ".phone .detail .remembered" },
      prod: { root: ".mcs-cd", scroll: ".mcs-cd-scroll", choice: ".mcs-cd-choice", add: ".mcs-cd-add", back: ".mcs-cd-back", remembered: ".mcs-cd-remembered" } };
    results.stage2 = {};
    for (const [side, tag] of [["proto", "proto-art"], ["prod", "prod"]]) {
      const S = SIDES[side]; const D = DETAIL[side];
      const context = await browser.newContext({ ...PHONE }); const page = await context.newPage();
      const errors = []; page.on("pageerror", (e) => errors.push(e.message));
      page.on("dialog", (d) => { errors.push(`dialog: ${d.message()}`); d.dismiss(); });
      const shot = async (name, where = "bottom") => {
        await sleep(350);
        /* tapping a choice into view can scroll the prototype's drawn phone itself; put it back */
        await page.evaluate(({ root, y }) => { for (let e = document.querySelector(root); e && e.closest(".phone"); e = e.parentElement) e.scrollTop = 0;
          window.scrollTo(0, y); }, { root: D.root, y: windowY });
        if (where === "bottom") await page.locator(D.scroll).evaluate((e) => e.scrollTo(0, e.scrollHeight));
        else if (where === "top") await page.locator(D.scroll).evaluate((e) => e.scrollTo(0, 0));
        else if (where === "versions") await page.locator(D.scroll).evaluate((e) => e.scrollTo(0, 260));
        await sleep(350);
        await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`), clip: await S.screen(page) });
      };
      const choose = async (t) => {
        const c = page.locator(D.choice, { has: page.locator("b", { hasText: new RegExp(`^${t.replace(/[/]/g, "\\/")}$`) }) }).first();
        await c.scrollIntoViewIfNeeded(); await c.tap(); await sleep(150);
      };
      let windowY = 0;
      const openSixty = async () => {
        const t = side === "prod" ? page.locator("button.mcs-dcell[aria-label='Mudkip, Ruby & Sapphire #60']")
          : page.locator(".phone .grid .cell").filter({ hasText: "#60" }).filter({ hasText: "Ruby & Sapphire" }).first();
        await t.scrollIntoViewIfNeeded(); await t.tap(); await sleep(1200);
        windowY = await page.evaluate(() => window.scrollY);
      };
      if (side === "prod") await signIn(page, prod.url);
      else { await page.goto(proto.url); await page.waitForSelector(".phone"); await page.locator(".controls button", { hasText: /^Returning Collector$/ }).click(); await sleep(300); }
      await S.tab(page, "Browse").tap(); await sleep(600);
      const dex = page.locator(`${BROWSE[side].tile}[data-dex='258']`); await dex.scrollIntoViewIfNeeded(); await dex.tap(); await sleep(900);
      await openSixty();
      for (const [name, taps] of FLOW) {
        for (const t of taps) {
          if (t === "__scroll-versions") continue;
          for (const u of side === "proto" && PROTO_TAPS[t] ? PROTO_TAPS[t] : [t]) await choose(u);
        }
        await shot(name, name === "s02-versions" ? "versions" : "bottom");
      }
      await shot("s09b-ready-top", "top");
      /* 11. the save */
      await page.locator(D.add).tap(); await sleep(250);
      await page.evaluate((y) => window.scrollTo(0, y), windowY); await page.screenshot({ path: path.join(OUT, `${tag}-s10-saved-on-card.png`), clip: await S.screen(page) });
      await sleep(1400);
      await page.evaluate((y) => window.scrollTo(0, y), windowY); await page.screenshot({ path: path.join(OUT, `${tag}-s10b-saved-back-in-browse.png`), clip: await S.screen(page) });
      /* 13. reopened: remembered */
      await openSixty();
      const remembered = await page.locator(D.remembered).innerText().catch(() => "");
      await shot("s11-reopened-remembers", "top");
      /* 12. production only: a genuine server refusal — the same Goal arrives from elsewhere */
      if (side === "prod") {
        await choose("Normal"); await choose("Graded"); await choose("PSA 10"); await choose("I'm looking for it"); await choose("Primary");
        const r60 = (await (await fetch(prod.url + "api/card-contexts?pokedex=258", { headers: { authorization: "Bearer casey" } })).json()).contexts.find((c) => c.collectorNumber === "60" && c.expansionName === "Ruby & Sapphire");
        const normal = (await (await fetch(prod.url + `api/card-contexts/${r60.cardContextId}`, { headers: { authorization: "Bearer casey" } })).json()).canonicalCards.find((c) => c.finish === "non_holo").canonicalCardId;
        await prod.post("addGoal", { canonicalCardId: normal, tier: "secondary", desired: { grade: "PSA 9" } });
        await page.locator(D.add).tap(); await sleep(800);
        await page.evaluate((y) => window.scrollTo(0, y), windowY); await page.screenshot({ path: path.join(OUT, `${tag}-s13-refused.png`), clip: await S.screen(page) });
      }
      /* 14. back to the same Browse */
      await page.locator(D.back).tap(); await sleep(700);
      await page.evaluate((y) => window.scrollTo(0, y), windowY); await page.screenshot({ path: path.join(OUT, `${tag}-s12-back-to-browse.png`), clip: await S.screen(page) });
      results.stage2[tag] = { remembered, errors };
      await context.close();
    }

    /* 2d. production only: the collapsing header. Until Stage 2's questions
       are drawn, Mudkip's page fits an 844-pt screen and never scrolls, so the
       header is shown doing it on a SHORTER window (390 × 460) — labelled so. */
    {
      const context = await browser.newContext({ ...PHONE, viewport: { width: 390, height: 460 } }); const page = await context.newPage();
      await signIn(page, prod.url);
      await page.locator("nav button", { hasText: /^Browse$/ }).first().tap().catch(async () => { await SIDES.prod.tab(page, "Browse").tap(); }); await sleep(600);
      const dex = page.locator(`${BROWSE.prod.tile}[data-dex='258']`); await dex.scrollIntoViewIfNeeded(); await dex.tap(); await sleep(900);
      const t = page.locator("button.mcs-dcell[aria-label='Mudkip, Ruby & Sapphire #60']"); await t.scrollIntoViewIfNeeded(); await t.tap(); await sleep(1200);
      const before = await page.locator(".mcs-cd-mini").count();
      await page.locator(".mcs-cd-scroll").evaluate((e) => e.scrollTo(0, e.scrollHeight)); await sleep(500);
      const after = await page.locator(".mcs-cd-mini").count();
      await page.screenshot({ path: path.join(OUT, "prod-c02b-collapsed-short-phone.png") });
      results.prod = { ...(results.prod || {}), collapse: { before, after } };
      await context.close();
    }

    /* production only: a slow catalogue, then an unreachable one */
    for (const [name, handler] of [["b12-loading", async (r) => { await sleep(4000); r.continue(); }], ["b13-error", (r) => r.abort()]]) {
      const context = await browser.newContext({ ...PHONE }); const page = await context.newPage();
      await signIn(page, prod.url);
      await context.route((u) => /\/api\/(pokemon|card-contexts|expansions|artists)/.test(u.href), handler);
      await SIDES.prod.tab(page, "Browse").tap(); await sleep(400);
      await page.locator(BROWSE.prod.search).fill("mudkip"); await sleep(name === "b12-loading" ? 600 : 1500);
      await page.screenshot({ path: path.join(OUT, `prod-${name}.png`) });
      await context.close();
    }

    /* 3. side by side, 1 CSS px = 1 px, aligned at the top of each screen */
    const SCREENS = [["c00-browse-before", "Card — Browse, Pokémon: Mudkip, before opening"], ["c01-open", "Card — Mudkip R&S #60, just opened"],
      ["c02-scrolled-collapsed", "Card — scrolled: the header carries the card"], ["c03-version-chosen", "Card — Reverse Holo chosen"],
      ["c04-next", "Card — next ›"], ["c05-previous", "Card — ‹ previous"], ["c06-back-to-browse", "Card — back to the same Browse"],
      ["b01-landing", "Browse — landing (Pokédex)"], ["b02-gen3", "Browse — Gen 3"], ["b03-pokemon-cards", "Browse — Pokémon: Mudkip"],
      ["b04-card-selected", "Browse — card selected (the Phase 6 card, P6-F3A)"], ["b05-back", "Browse — back"],
      ["b06-sets", "Browse — Sets"], ["b07-suggestions", "Browse — search suggestions"], ["b08-set-cards", "Browse — a set's cards"],
      ["b09-artists", "Browse — Artists"], ["b10-artist-cards", "Browse — an artist's cards"], ["b11-empty", "Browse — nothing matches"],
      ["b12-loading", "Browse — loading (production only)"], ["b13-error", "Browse — catalogue unreachable (production only)"],
      ["02-binders-home", "Binders home", true],
      ["03-expanded-binder", "Expanded binder", true], ["04-tiles", "Card tiles and placeholders"], ["05-card-detail", "Card detail"],
      ["06-filing-chooser", "Filing chooser"], ["07-filing-confirmation", "Filing confirmation"]];
    const P = results["proto-placeholders"].metrics.bindersHome; const Q = results.prod.metrics.bindersHome;
    const rows = [["Screen (W × H)", `${P.screen.w} × ${P.screen.h}`, `${Q.screen.w} × ${Q.screen.h}`],
      ...["title", "search", "lenses", "binders", "unfiled", "yourCards", "firstCard"].map((k) => [`${k} top`, P[k] && P[k].top, Q[k] && Q[k].top]),
      ["first card width", P.firstCard && P.firstCard.w, Q.firstCard && Q.firstCard.w], ["card art w × h", P.art && `${P.art.w} × ${P.art.h}`, Q.art && `${Q.art.w} × ${Q.art.h}`],
      ["tab bar height", P.nav && P.nav.h, Q.nav && Q.nav.h], ["tab labels on one line", P.navLabels.every((l) => l.lines <= 1), Q.navLabels.every((l) => l.lines <= 1)],
      ["sideways scroll", P.overflowX, Q.overflowX]];
    const delta = Q.firstCard && P.firstCard ? Q.firstCard.top - P.firstCard.top : null;
    const PB = results["proto-placeholders"].browse; const QB = results.prod.browse;
    const bRows = PB && QB ? [
      ...["title", "search", "tabs", "gens", "firstTile"].map((k) => [`landing ${k} top`, PB.landing[k] && PB.landing[k].top, QB.landing[k] && QB.landing[k].top]),
      ["landing tile art w × h", PB.landing.tileArt && `${PB.landing.tileArt.w} × ${PB.landing.tileArt.h}`, QB.landing.tileArt && `${QB.landing.tileArt.w} × ${QB.landing.tileArt.h}`],
      ["results first card top", PB.results.firstCell && PB.results.firstCell.top, QB.results.firstCell && QB.results.firstCell.top],
      ["results card art w × h", PB.results.cellArt && `${PB.results.cellArt.w} × ${PB.results.cellArt.h}`, QB.results.cellArt && `${QB.results.cellArt.w} × ${QB.results.cellArt.h}`],
      ["sideways scroll", PB.landing.overflowX || PB.results.overflowX, QB.landing.overflowX || QB.results.overflowX]] : [];
    const html = `<!doctype html><meta charset="utf-8"><title>Phase 6 fidelity — ${stamp}</title>
<body style="font:14px system-ui;margin:20px;color:#131922">
<h1 style="margin:0 0 6px">Phase 6 fidelity — prototype ${FROZEN} vs production ${prod.build.commit}${prod.build.dirty ? " (uncommitted changes)" : ""}</h1>
<p>Emulated iPhone 390 × 844 @3×, touch. Each side is its own screen (prototype 370 × 800 inside its bezel; production 390 × 844), aligned at the top, 1 CSS px = 1 px.</p>
<h2>Binders home, measured from the top of each screen</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse"><tr><th></th><th>Prototype (placeholders)</th><th>Production</th></tr>
${rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("")}</table>
<p><b>First card: production ${delta == null ? "n/a" : `${delta >= 0 ? "+" : ""}${delta}px`} from the prototype.</b></p>
<h2>Browse, measured from the top of each screen</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse"><tr><th></th><th>Prototype (placeholders)</th><th>Production</th></tr>
${bRows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("")}</table>
<h2>Recorded differences</h2><ul>${notes.map((n) => `<li>${n}</li>`).join("")}
<li>Card artwork: production has no approved image source; "prototype (art)" is the frozen prototype as shipped, "prototype (placeholders)" blocks its card images at the network so it draws its own placeholders — the like-for-like.</li>
<li>Placeholder colours come from each app's own card ids, so the same card is a different hue in each.</li>
<li>Production has four tabs (approved deviation); the prototype two.</li>
<li>Page errors — prototype: ${results["proto-art"].errors.length + results["proto-placeholders"].errors.length}; production: ${results.prod.errors.length}</li></ul>
${SCREENS.map(([k, t, full]) => `<h2>${t}</h2><div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
${["proto-art", "proto-placeholders", "prod"].filter((tg) => fs.existsSync(path.join(OUT, `${tg}-${k}.png`))).map((tg) => `<figure style="margin:0"><figcaption><b>${{ "proto-art": "Prototype (as shipped)", "proto-placeholders": "Prototype (placeholders)", prod: "Production" }[tg]}</b></figcaption>
<img src="${tg}-${k}.png" style="width:${tg === "prod" ? 390 : 370}px;border:1px solid #ccc"></figure>`).join("")}</div>
${full ? `<details><summary>Full page</summary><div style="display:flex;gap:18px;align-items:flex-start">${["proto-placeholders", "prod"].map((tg) => `<img src="${tg}-${k}-full.png" style="width:${tg === "prod" ? 390 : 390}px;border:1px solid #ccc">`).join("")}</div></details>` : ""}`).join("\n")}
</body>`;
    fs.writeFileSync(path.join(OUT, "index.html"), html);
    fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify({ prototype: FROZEN, production: prod.build, notes, results: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.metrics])) }, null, 2));
    console.log(`\nPhase 6 fidelity — prototype ${FROZEN} vs production ${prod.build.commit}${prod.build.dirty ? "+changes" : ""}`);
    for (const r of rows) console.log(`  ${String(r[0]).padEnd(24)} ${String(r[1]).padEnd(14)} ${r[2]}`);
    const PC = results["proto-art"].card; const QC = results.prod.card;
    if (PC && QC) {
      console.log("  — Card (Mudkip R&S #60) —");
      for (const k of Object.keys(PC.measures)) {
        const f = (m) => (m ? `${m.top}/${m.left} ${m.w}×${m.h} ${m.font}` : "—");
        console.log(`  ${k.padEnd(24)} ${f(PC.measures[k]).padEnd(26)} ${f(QC.measures[k])}`);
      }
      console.log(`  picture loaded            ${JSON.stringify(PC.images.map((i) => i.ok))}  ${JSON.stringify(QC.images.map((i) => i.ok))}`);
      if (results.stage2) for (const [k, v] of Object.entries(results.stage2)) console.log(`  stage 2 ${k.padEnd(10)} remembered: ${JSON.stringify(v.remembered)} errors: ${JSON.stringify(v.errors)}`);
      console.log(`  header collapse (prod, 390×460): mini-card ${JSON.stringify(results.prod.collapse)}`);
      console.log(`  browse scroll kept        ${JSON.stringify(PC.scrollBefore)}→${JSON.stringify(PC.scrollAfter)}  ${JSON.stringify(QC.scrollBefore)}→${JSON.stringify(QC.scrollAfter)}`);
    }
    if (bRows.length) { console.log("  — Browse —"); for (const r of bRows) console.log(`  ${String(r[0]).padEnd(24)} ${String(r[1]).padEnd(14)} ${r[2]}`); }
    console.log(`  first card: production ${delta == null ? "n/a" : `${delta >= 0 ? "+" : ""}${delta}px`} from the prototype`);
    console.log(`\n  open file://${path.join(OUT, "index.html")}`);
    if (process.argv.includes("--strict") && (delta == null || Math.abs(delta) > 16 || Q.overflowX)) process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (prod) prod.server.close();
    await proto.stop();
  }
}

if (require.main === module) run().catch((e) => {
  console.error(`fidelity harness failed: ${e.message.split("\n")[0]}`);
  const at = String(e.stack || "").split("\n").find((l) => /phase6-(fidelity|world)\.cjs/.test(l));
  if (at) console.error(`  at ${at.trim()}`);
  process.exit(1);
});

module.exports = { seedFrom, prototypeData, startPrototype };
