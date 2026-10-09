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
const path = require("path");
const http = require("http");
const esbuild = require("esbuild");
const { describe, test, assert, eq, run } = require("../tests/run.cjs");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { createApp } = require("../server/app.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const RT = require("../domain/metyet-runtime.js");

let chromium = null;
try { ({ chromium } = require("playwright")); } catch (e) { chromium = null; }
const ROOT = path.join(__dirname, "..");

/* The page: the real shell, store, API client and command factories. */
const ENTRY = `
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createApiClient } from "./client/api.js";
import { createProductionStore } from "./client/production-store.js";
import * as C from "./client/commands.js";
import ProductionApp from "./client/production-app.jsx";
const store = createProductionStore({ api: createApiClient({ baseUrl: location.origin, getToken: async () => "casey" }) });
function Seat() {
  const [state, setState] = useState(store.get());
  useEffect(() => { const off = store.sub(setState); store.load(); return off; }, []);
  const bind = useMemo(() => ({ onBrowseCards: C.browseCards(store), onRefresh: C.refreshView(store),
    /* The panel only has to open here; what it saves is phase5-c33's subject. */
    onSpecify: async () => ({ ok: true }), onCreateBinder: C.createBinder(store), onRenameBinder: C.renameBinder(store),
    onArchiveBinder: C.setBinderArchived(store), onFileObject: C.fileObjectInBinder(store),
    onUnfileObject: C.unfileObjectFromBinder(store), onAddGoal: C.addCollectorGoal(store) }), []);
  return state ? <ProductionApp state={state} onSignOut={() => {}} {...bind} /> : <p>Loading</p>;
}
createRoot(document.getElementById("root")).render(<Seat />);
`;

async function serve() {
  const db = fromPGlite(new PGlite());
  await migrate(db);
  const runtime = RT.systemRuntime();
  const repository = createWorldRepository(db);
  const catalog = createCatalogRepository(db, { newId: runtime.newId });
  await repository.saveWorld({ catalog: [], collectors: [{ id: "c1", name: "Casey" }], partners: [], relationships: [],
    invitations: [], goals: [], inventory: [], collectorCopies: [], binders: [], binderEntries: [], interests: [],
    opportunities: [], conversations: [], photoRequests: [], copyReviews: [] });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: "sub-casey", role: "collector", collectorId: "c1" });
  const verifier = { verify: async (t) => { if (t !== "casey") throw Object.assign(new Error("no"), { reason: "x" }); return { subject: "sub-casey", email: "c@x.invalid", emailVerified: true }; } };
  const app = createApp({ repository, catalog, accounts, verifier, runtime });
  await app.ready();
  const { expansionId } = await catalog.putExpansion({ game: "pokemon", code: "b1", name: "Base Set", printedTotal: 102 });
  const card = async (n, name, finish) => (await catalog.putCanonicalCard({ finish,
    cardContextId: (await catalog.putCardContext({ game: "pokemon", expansionId, collectorNumber: n, cardName: name, artist: "A", rarity: "Rare" })).cardContextId })).canonicalCardId;
  const char = await card("4", "Charizard", "holofoil");
  const blas = await card("2", "Blastoise", "holofoil");
  const post = async (command, payload) => {
    const res = await app.inject({ method: "POST", url: "/api/commands", headers: { authorization: "Bearer casey" }, payload: { command, payload } });
    if (res.statusCode !== 200) throw new Error(`${command}: ${res.body}`);
    return res.json().value;
  };
  const gen1 = await post("createBinder", { name: "Gen 1" });
  const mud = await post("createBinder", { name: "Favourites" });
  const goal = await post("addGoal", { canonicalCardId: char, tier: "primary", desired: { grade: "PSA 9" } });
  await post("fileObject", { binderId: gen1, goalId: goal });
  const copy = await post("addCollectorCopy", { copy: { canonicalCardId: blas, grade: "PSA 8", keeping: true } });
  const bundle = (await esbuild.build({ stdin: { contents: ENTRY, resolveDir: ROOT, loader: "jsx" }, bundle: true,
    write: false, format: "iife", jsx: "automatic", logLevel: "silent", define: { "process.env.NODE_ENV": '"production"' } })).outputFiles[0].text;
  const page = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div><script src="/main.js"></script></body></html>';
  const server = http.createServer(async (req, res) => {
    if (req.url.startsWith("/api/")) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const out = await app.inject({ method: req.method, url: req.url, headers: req.headers, ...(body.length ? { payload: body } : {}) });
      res.writeHead(out.statusCode, { "content-type": "application/json" }); return res.end(out.body);
    }
    if (req.url.startsWith("/main.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle); }
    res.writeHead(200, { "content-type": "text/html" }); res.end(page);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const memberships = async () => (await repository.loadWorld()).binderMemberships || [];
  return { url: `http://127.0.0.1:${server.address().port}/`, server, memberships, ids: { gen1, mud, goal, copy } };
}

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
    assert(await page.locator("text=Are you looking for it?").count(), "the card did not open");
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

if (!chromium) {
  console.log("SKIPPED: Playwright is not installed.");
} else {
  run().finally(async () => { if (browser) await browser.close(); if (ctx) ctx.server.close(); });
}
