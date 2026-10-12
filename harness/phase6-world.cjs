/* ============================================================================
   PHASE 6 — A REAL MOBILE-REVIEWABLE WORLD (P6-4)
   One seeded MetYet: the real server (createApp — auth, allow-list, command
   transaction, domain) over in-process PGlite with every migration, serving
   two pages built from the real client:
     /      the Collector shell bound to the real store and command factories
            (P6-3's filing checks)
     /app   the real <SignIn/> — the production front door and EVERY binding
            it makes, including the Card Specification's step dispatcher —
            with only the email-code session stubbed (any address, any code)
   Used by harness/phase6-filing-browser.cjs and harness/phase6-mobile-review.cjs.
   ========================================================================== */
const path = require("path");
const http = require("http");
const esbuild = require("esbuild");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { createApp } = require("../server/app.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const RT = require("../domain/metyet-runtime.js");

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

/* The real front door. Only the email-code session is stood in for: the
   person still types an address and a code, and everything after that —
   the store, the bindings, the shell — is production's own. */
const APP_ENTRY = `
import React from "react";
import { createRoot } from "react-dom/client";
import { createApiClient } from "./client/api.js";
import { createProductionStore } from "./client/production-store.js";
import SignIn from "./client/sign-in/SignIn.jsx";
let signedIn = false;
const session = { status: () => (signedIn ? "present" : "absent"),
  requestCode: async () => {}, verifyCode: async () => { signedIn = true; }, signOut: async () => { signedIn = false; } };
const store = createProductionStore({ api: createApiClient({ baseUrl: location.origin, getToken: async () => "casey" }) });
createRoot(document.getElementById("root")).render(<SignIn session={session} store={store} />);
`;

/* ============================================================================
   REVIEW-ONLY ARTWORK EXCEPTION (founder-approved, P6-F3A Stage 1)
   The frozen Phase 6 prototype shows real card pictures from runtime URLs; its
   README calls that a prototype-only exception with no rights established.
   For LOCAL VISUAL REVIEW ONLY, the same picture of ONE card — Mudkip, Ruby &
   Sapphire #60, the prototype's own URLs — is written into that card's
   existing image fields in THIS FILE'S THROWAWAY, IN-MEMORY review database.
   It lives here and nowhere else: not in client/, server/, persistence/,
   domain/ or app-src/; not in the catalogue importer; not in any build
   (tests/phase6-f3a-card-detail.cjs fails if that changes). No commercial-use
   permission is assumed, nothing is downloaded, cached, proxied or bundled.
   ========================================================================== */
const REVIEW_ARTWORK = Object.freeze([
  { set: "Ruby & Sapphire", number: "60",
    imageSmall: "https://assets.tcgdex.net/en/ex/ex1/60/low.webp",
    imageLarge: "https://assets.tcgdex.net/en/ex/ex1/60/high.webp" },
]);
async function applyReviewArtwork(db) {
  await db.transaction(async (tx) => {
    for (const a of REVIEW_ARTWORK) {
      await tx.query(`update metyet_catalog.canonical_cards k set image_small = $1, image_large = $2
        from metyet_catalog.card_contexts c join metyet_catalog.expansions e on e.expansion_id = c.expansion_id
        where k.card_context_id = c.card_context_id and e.name = $3 and c.collector_number = $4`,
      [a.imageSmall, a.imageLarge, a.set, a.number]);
    }
  });
}

/* THE REVIEW STORY used by the P6-3 / P6-4 checks and `review:mobile`:
   two binders, two Goals, two copies. A different story (the fidelity
   harness's copy of the prototype's own preset) is passed as `seed`. */
async function reviewSeed({ card, post, postAs, catalog, expansion }) {
  const BASE = { code: "b1", name: "Base Set", printedTotal: 102 };
  const char = await card("4", "Charizard", "holofoil", BASE, [6]);
  const blas = await card("2", "Blastoise", "holofoil", BASE, [9]);
  const gen1 = await post("createBinder", { name: "Gen 1" });
  const mud = await post("createBinder", { name: "Favourites" });
  const goal = await post("addGoal", { canonicalCardId: char, tier: "primary", desired: { grade: "PSA 9" } });
  await post("fileObject", { binderId: gen1, goalId: goal });
  const copy = await post("addCollectorCopy", { copy: { canonicalCardId: blas, grade: "PSA 8", keeping: true } });
  /* P6-4: a Secondary Goal (Unfiled) and a Trade / Sell copy (in Favourites). */
  const ven = await card("15", "Venusaur", "holofoil", BASE, [3]);
  const pika = await card("58", "Pikachu", "non_holo", BASE, [25]);
  /* P6-F2: a second set, so Browse has more than one of anything */
  await card("25", "Pikachu", "non_holo", { code: "jungle", name: "Jungle", printedTotal: 64 }, [25]);
  /* P6-F3A: Mudkip, Ruby & Sapphire #60 — the prototype's Stage 1 reference
     card, with its two real printings (Normal, Reverse Holo) — and #59 beside
     it, so the card's ‹ › have somewhere to go. Pictures: REVIEW_ARTWORK. */
  const RS = { code: "ex1", name: "Ruby & Sapphire", printedTotal: 109 };
  for (const [n, artist] of [["59", "Atsuko Nishida"], ["60", "Ken Sugimori"]]) {
    const { cardContextId } = await catalog.putCardContext({ game: "pokemon", expansionId: await expansion(RS.code, RS.name, RS.printedTotal),
      collectorNumber: n, cardName: "Mudkip", artist, rarity: "Common", pokedexNumbers: [258] });
    for (const finish of ["non_holo", "reverse_holofoil"]) await catalog.putCanonicalCard({ cardContextId, finish });
  }
  /* and a long set name, which is what pushes a two-column grid sideways */
  await card("4", "Charizard", "holofoil", { code: "mcd15", name: "McDonald's Collection 2015 Anniversary Edition", printedTotal: 12 }, [6]);
  const goal2 = await post("addGoal", { canonicalCardId: ven, tier: "secondary", desired: { grade: "PSA 9" } });
  const copy2 = await post("addCollectorCopy", { copy: { canonicalCardId: pika, grade: "PSA 7", offered: true } });
  await post("fileObject", { binderId: mud, collectorCopyId: copy2 });
  /* P6-F5A: what the shops have. Northline (connected): two Mudkip #60
     printings and a Charizard; a copy it took off its shelf (archived).
     Faraway (not connected): a Mudkip #60 and a Jungle Pikachu that Casey must
     never see. Prices are whole dollars, as the domain requires. */
  const shops = {};
  if (postAs) {
    const ctxOf = async (n) => (await catalog.findCardContexts({ number: n, pokedex: 258 })).contexts[0];
    const rs60 = await ctxOf("60");
    const rs60cards = (await catalog.readCardContext(rs60.cardContextId)).canonicalCards;
    const normal60 = rs60cards.find((k) => k.finish === "non_holo").canonicalCardId;
    const reverse60 = rs60cards.find((k) => k.finish === "reverse_holofoil").canonicalCardId;
    const jungle = (await catalog.findCardContexts({ number: "25", pokedex: 25 })).contexts.find((c) => c.expansionName === "Jungle");
    const pikaJ = (await catalog.readCardContext(jungle.cardContextId)).canonicalCards[0].canonicalCardId;
    const inv = (who, copy) => postAs(who, "addInventoryCopy", { copy });
    shops.n1 = await inv("north", { canonicalCardId: normal60, grade: "Raw", condition: "Near Mint", ask: 12, cost: 6 });
    shops.n2 = await inv("north", { canonicalCardId: reverse60, grade: "PSA 9", ask: 85, cost: 50, firmOnPrice: true });
    shops.n3 = await inv("north", { canonicalCardId: char, grade: "PSA 8", ask: 1200, cost: 900 });
    shops.gone = await inv("north", { canonicalCardId: blas, grade: "PSA 9", ask: 400, cost: 300 });
    await postAs("north", "removeInventoryCopy", { invId: shops.gone });
    shops.f1 = await inv("far", { canonicalCardId: normal60, grade: "PSA 10", ask: 300, cost: 200 });
    shops.f2 = await inv("far", { canonicalCardId: pikaJ, grade: "PSA 10", ask: 500, cost: 300 });
  }
  return { gen1, mud, goal, copy, goal2, copy2, shops };
}

/* What build a running review server is serving, so a second launcher can say
   so instead of colliding with it (P6-F1). */
const buildOf = () => {
  const { execFileSync } = require("child_process");
  const git = (...a) => { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch (e) { return null; } };
  const dirty = git("status", "--porcelain", "--untracked-files=no");
  return { commit: git("rev-parse", "--short", "HEAD"), dirty: !!dirty };
};

async function serve({ port = 0, seed = reviewSeed, collectorName = "Casey" } = {}) {
  const db = fromPGlite(new PGlite());
  await migrate(db);
  const runtime = RT.systemRuntime();
  const repository = createWorldRepository(db);
  const catalog = createCatalogRepository(db, { newId: runtime.newId });
  /* TWO SHOPS (P6-F5A): Northline is one of Casey's Trusted Partners;
     Faraway is not — its inventory must never reach Casey. */
  await repository.saveWorld({ catalog: [], collectors: [{ id: "c1", name: collectorName }],
    partners: [{ id: "p-north", name: "Northline Cards", city: "Portland", tradeRate: 0.7 },
      { id: "p-far", name: "Faraway Games", city: "Elsewhere", tradeRate: 0.7 }],
    relationships: [{ partnerId: "p-north", collectorId: "c1", status: "accepted", at: "2026-01-01T00:00:00.000Z" }],
    invitations: [], goals: [], inventory: [], collectorCopies: [], binders: [], binderEntries: [], interests: [],
    opportunities: [], conversations: [], photoRequests: [], copyReviews: [] });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: "sub-casey", role: "collector", collectorId: "c1" });
  await accounts.linkAccount({ subject: "sub-north", role: "tp", partnerId: "p-north" });
  await accounts.linkAccount({ subject: "sub-far", role: "tp", partnerId: "p-far" });
  const TOKENS = { casey: "sub-casey", north: "sub-north", far: "sub-far" };
  const verifier = { verify: async (t) => { if (!TOKENS[t]) throw Object.assign(new Error("no"), { reason: "x" }); return { subject: TOKENS[t], email: `${t}@x.invalid`, emailVerified: true }; } };
  const app = createApp({ repository, catalog, accounts, verifier, runtime });
  await app.ready();
  /* The catalogue the seed may name. Every card is real catalogue data (an
     expansion, a context, a canonical printing), with no image: production
     shows only what an approved import stored, and these imported nothing. */
  const expansions = new Map();
  const expansion = async (code, name, printedTotal = null) => {
    if (!expansions.has(code)) expansions.set(code, (await catalog.putExpansion({ game: "pokemon", code, name, printedTotal })).expansionId);
    return expansions.get(code);
  };
  await expansion("b1", "Base Set", 102);
  const card = async (n, name, finish, set = { code: "b1", name: "Base Set", printedTotal: 102 }, dex = []) => (await catalog.putCanonicalCard({ finish,
    cardContextId: (await catalog.putCardContext({ game: "pokemon", expansionId: await expansion(set.code, set.name, set.printedTotal),
      collectorNumber: n, cardName: name, artist: "Ken Sugimori", rarity: "Rare", pokedexNumbers: dex })).cardContextId })).canonicalCardId;
  const postAs = async (who, command, payload) => {
    const res = await app.inject({ method: "POST", url: "/api/commands", headers: { authorization: `Bearer ${who}` }, payload: { command, payload } });
    if (res.statusCode !== 200) throw new Error(`${who} ${command}: ${res.body}`);
    return res.json().value;
  };
  const post = async (command, payload) => {
    const res = await app.inject({ method: "POST", url: "/api/commands", headers: { authorization: "Bearer casey" }, payload: { command, payload } });
    if (res.statusCode !== 200) throw new Error(`${command}: ${res.body}`);
    return res.json().value;
  };
  const ids = await seed({ card, post, postAs, catalog, db, expansion });
  await applyReviewArtwork(db);
  const build = async (contents) => (await esbuild.build({ stdin: { contents, resolveDir: ROOT, loader: "jsx" }, bundle: true,
    write: false, format: "iife", jsx: "automatic", logLevel: "silent", define: { "process.env.NODE_ENV": '"production"' } })).outputFiles[0].text;
  const bundle = await build(ENTRY);
  const appBundle = await build(APP_ENTRY);
  const page = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div><script src="/main.js"></script></body></html>';
  const appPage = page.replace("/main.js", "/app.js");
  /* THE PHONE IN ANY BROWSER (P6-F1 review fix). Opened in an ordinary
     desktop window, /app is — correctly — the desktop layout. /phone frames
     the very same /app at 390 × 844, so the layout is the phone's in any
     browser. It is a frame around the product, not a change to it: no touch
     emulation (the mouse stands in for a finger) — the launcher's window is
     the emulated one. */
  const phonePage = `<!doctype html><html><head><meta charset="utf-8"><title>MetYet — phone review</title>
<style>body{margin:0;background:#E4E8EC;font:13px system-ui;color:#3A4450;display:flex;flex-direction:column;align-items:center;gap:10px;padding:18px}
.f{width:390px;height:844px;border:0;border-radius:28px;background:#fff;box-shadow:0 0 0 10px #0A1014,0 20px 50px rgba(10,16,20,.25)}
p{margin:0;max-width:430px;text-align:center}</style></head><body>
<p><b>MetYet — phone review</b> · 390 × 844 · production-connected</p>
<iframe class="f" src="/app" title="MetYet at phone size"></iframe>
<p>A phone-sized frame in a desktop browser: the layout is the phone's; the mouse stands in for a finger. For touch emulation use the window opened by <code>npm run review:mobile</code>. Neither is Safari on a real iPhone.</p>
</body></html>`;
  /* What the launcher's own emulated window can report about itself. */
  const hooks = {};
  const build_ = { ...buildOf(), startedAt: new Date().toISOString() };
  const server = http.createServer(async (req, res) => {
    if (req.url === "/__review") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ kind: "metyet-mobile-review", ...build_ }));
    }
    if (req.url === "/__review/session" || req.url === "/__review/screenshot.png") {
      const fn = req.url.endsWith(".png") ? hooks.screenshot : hooks.session;
      if (!fn) { res.writeHead(404, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: "no emulated window is attached to this server" })); }
      try {
        const out = await fn();
        res.writeHead(200, { "content-type": req.url.endsWith(".png") ? "image/png" : "application/json" });
        return res.end(req.url.endsWith(".png") ? out : JSON.stringify(out, null, 2));
      } catch (e) { res.writeHead(500, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: e.message })); }
    }
    if (req.url === "/phone" || req.url.startsWith("/phone?")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(phonePage); }
    if (req.url.startsWith("/api/")) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const out = await app.inject({ method: req.method, url: req.url, headers: req.headers, ...(body.length ? { payload: body } : {}) });
      res.writeHead(out.statusCode, { "content-type": "application/json" }); return res.end(out.body);
    }
    if (req.url.startsWith("/main.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle); }
    if (req.url.startsWith("/app.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(appBundle); }
    res.writeHead(200, { "content-type": "text/html" }); res.end(req.url.startsWith("/app") ? appPage : page);
  });
  /* A busy port is an answer, not a crash: the caller decides what to say. */
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const memberships = async () => (await repository.loadWorld()).binderMemberships || [];
  const world = async () => repository.loadWorld();
  return { url: `http://127.0.0.1:${server.address().port}/`, server, memberships, world, post, postAs,
    ids, build: build_, hooks };
}


/* A phone, as far as a desktop Chrome can be one: a 390 × 844 viewport at 3×,
   touch input, the mobile flag, and an iPhone's user agent. It is NOT a real
   phone — no real touchscreen, Safari engine, or home-indicator — and is
   reported as an emulation wherever it is used. */
const PHONE = Object.freeze({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });

/* Through the real front door: any address, any code. */
async function signIn(page, url) {
  await page.goto(`${url}app`);
  await page.fill("#metyet-email", "casey@example.invalid");
  await page.click("button[type=submit]");
  await page.fill("#metyet-code", "123456");
  await page.click("button[type=submit]");
  await page.waitForSelector("nav[aria-label=Collector]");
}

module.exports = { serve, reviewSeed, PHONE, signIn, ROOT, REVIEW_ARTWORK };
