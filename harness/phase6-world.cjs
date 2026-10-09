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

async function serve({ port = 0 } = {}) {
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
  /* P6-4: a Secondary Goal (Unfiled) and a Trade / Sell copy (in Favourites). */
  const ven = await card("15", "Venusaur", "holofoil");
  const pika = await card("58", "Pikachu", "non_holo");
  const goal2 = await post("addGoal", { canonicalCardId: ven, tier: "secondary", desired: { grade: "PSA 9" } });
  const copy2 = await post("addCollectorCopy", { copy: { canonicalCardId: pika, grade: "PSA 7", offered: true } });
  await post("fileObject", { binderId: mud, collectorCopyId: copy2 });
  const build = async (contents) => (await esbuild.build({ stdin: { contents, resolveDir: ROOT, loader: "jsx" }, bundle: true,
    write: false, format: "iife", jsx: "automatic", logLevel: "silent", define: { "process.env.NODE_ENV": '"production"' } })).outputFiles[0].text;
  const bundle = await build(ENTRY);
  const appBundle = await build(APP_ENTRY);
  const page = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div><script src="/main.js"></script></body></html>';
  const appPage = page.replace("/main.js", "/app.js");
  const server = http.createServer(async (req, res) => {
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
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const memberships = async () => (await repository.loadWorld()).binderMemberships || [];
  const world = async () => repository.loadWorld();
  return { url: `http://127.0.0.1:${server.address().port}/`, server, memberships, world, post,
    ids: { gen1, mud, goal, copy, goal2, copy2 } };
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

module.exports = { serve, PHONE, signIn, ROOT };
