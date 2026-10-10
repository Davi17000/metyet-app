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
  return async ({ card, post }) => {
    const made = new Map();
    const canonical = async (cp) => {
      if (!made.has(cp)) { const id = identity(cp); made.set(cp, id ? await card(id.number, id.name, id.finish, id.set) : null); }
      return made.get(cp);
    };
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

    /* 3. side by side, 1 CSS px = 1 px, aligned at the top of each screen */
    const SCREENS = [["01-browse", "Browse (baseline — P6-5 not implemented)", true], ["02-binders-home", "Binders home", true],
      ["03-expanded-binder", "Expanded binder", true], ["04-tiles", "Card tiles and placeholders"], ["05-card-detail", "Card detail"],
      ["06-filing-chooser", "Filing chooser"], ["07-filing-confirmation", "Filing confirmation"]];
    const P = results["proto-placeholders"].metrics.bindersHome; const Q = results.prod.metrics.bindersHome;
    const rows = [["Screen (W × H)", `${P.screen.w} × ${P.screen.h}`, `${Q.screen.w} × ${Q.screen.h}`],
      ...["title", "search", "lenses", "binders", "unfiled", "yourCards", "firstCard"].map((k) => [`${k} top`, P[k] && P[k].top, Q[k] && Q[k].top]),
      ["first card width", P.firstCard && P.firstCard.w, Q.firstCard && Q.firstCard.w], ["card art w × h", P.art && `${P.art.w} × ${P.art.h}`, Q.art && `${Q.art.w} × ${Q.art.h}`],
      ["tab bar height", P.nav && P.nav.h, Q.nav && Q.nav.h], ["tab labels on one line", P.navLabels.every((l) => l.lines <= 1), Q.navLabels.every((l) => l.lines <= 1)],
      ["sideways scroll", P.overflowX, Q.overflowX]];
    const delta = Q.firstCard && P.firstCard ? Q.firstCard.top - P.firstCard.top : null;
    const html = `<!doctype html><meta charset="utf-8"><title>Phase 6 fidelity — ${stamp}</title>
<body style="font:14px system-ui;margin:20px;color:#131922">
<h1 style="margin:0 0 6px">Phase 6 fidelity — prototype ${FROZEN} vs production ${prod.build.commit}${prod.build.dirty ? " (uncommitted changes)" : ""}</h1>
<p>Emulated iPhone 390 × 844 @3×, touch. Each side is its own screen (prototype 370 × 800 inside its bezel; production 390 × 844), aligned at the top, 1 CSS px = 1 px.</p>
<h2>Binders home, measured from the top of each screen</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse"><tr><th></th><th>Prototype (placeholders)</th><th>Production</th></tr>
${rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("")}</table>
<p><b>First card: production ${delta == null ? "n/a" : `${delta >= 0 ? "+" : ""}${delta}px`} from the prototype.</b></p>
<h2>Recorded differences</h2><ul>${notes.map((n) => `<li>${n}</li>`).join("")}
<li>Card artwork: production has no approved image source; "prototype (art)" is the frozen prototype as shipped, "prototype (placeholders)" blocks its card images at the network so it draws its own placeholders — the like-for-like.</li>
<li>Placeholder colours come from each app's own card ids, so the same card is a different hue in each.</li>
<li>Production has four tabs (approved deviation); the prototype two.</li>
<li>Page errors — prototype: ${results["proto-art"].errors.length + results["proto-placeholders"].errors.length}; production: ${results.prod.errors.length}</li></ul>
${SCREENS.map(([k, t, full]) => `<h2>${t}</h2><div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
${["proto-art", "proto-placeholders", "prod"].map((tg) => `<figure style="margin:0"><figcaption><b>${{ "proto-art": "Prototype (as shipped)", "proto-placeholders": "Prototype (placeholders)", prod: "Production" }[tg]}</b></figcaption>
<img src="${tg}-${k}.png" style="width:${tg === "prod" ? 390 : 370}px;border:1px solid #ccc"></figure>`).join("")}</div>
${full ? `<details><summary>Full page</summary><div style="display:flex;gap:18px;align-items:flex-start">${["proto-placeholders", "prod"].map((tg) => `<img src="${tg}-${k}-full.png" style="width:${tg === "prod" ? 390 : 390}px;border:1px solid #ccc">`).join("")}</div></details>` : ""}`).join("\n")}
</body>`;
    fs.writeFileSync(path.join(OUT, "index.html"), html);
    fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify({ prototype: FROZEN, production: prod.build, notes, results: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.metrics])) }, null, 2));
    console.log(`\nPhase 6 fidelity — prototype ${FROZEN} vs production ${prod.build.commit}${prod.build.dirty ? "+changes" : ""}`);
    for (const r of rows) console.log(`  ${String(r[0]).padEnd(24)} ${String(r[1]).padEnd(14)} ${r[2]}`);
    console.log(`  first card: production ${delta == null ? "n/a" : `${delta >= 0 ? "+" : ""}${delta}px`} from the prototype`);
    console.log(`\n  open file://${path.join(OUT, "index.html")}`);
    if (process.argv.includes("--strict") && (delta == null || Math.abs(delta) > 16 || Q.overflowX)) process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (prod) prod.server.close();
    await proto.stop();
  }
}

run().catch((e) => { console.error(`fidelity harness failed: ${e.message.split("\n")[0]}`); process.exit(1); });
