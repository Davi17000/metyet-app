/* ============================================================================
   B1 — OPEN COLLECTOR REGISTRATION IN A REAL BROWSER, AT 390 AND 320 PX

   Google Chrome (Playwright) on the REAL production entry, app-src/main.jsx,
   built exactly as app.build.mjs builds it — the real <SignIn/>, Supabase auth
   adapter, session, tab storage (sessionStorage), API client, store and
   shells — against the real server over in-process PGlite with every
   migration. The one stand-in is Supabase itself: a local endpoint that
   issues each one-time code once, and answers GET /auth/v1/user for the
   server's confirmed-email check.

     1  a new person: entrance → code → Welcome to MetYet → name → workspace
     2  reload in the same tab: still signed in, no new code
     3  a new tab: signed out
     4  sign out: the entrance, and a reload stays signed out
     5  a used code is refused
     6  a returning Collector and a Trusted Partner never see the create screen
   At each width: no horizontal overflow, no page errors, sessionStorage holds
   only the session and localStorage nothing.

   Screenshots: artifacts/b1-collector-registration/.
   Run: `node harness/b1-collector-registration-browser.cjs`.
   ========================================================================== */
const fs = require("fs");
const http = require("http");
const path = require("path");
const esbuild = require("esbuild");
const { describe, test, assert, eq, run } = require("../tests/run.cjs");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { createIdentityDirectory } = require("../server/auth/identity.js");
const { createApp } = require("../server/app.js");
const RT = require("../domain/metyet-runtime.js");

let chromium = null;
try { ({ chromium } = require("playwright")); } catch (e) { chromium = null; }

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "artifacts", "b1-collector-registration");
/* Each request issues a fresh 8-digit code, as the project does; the harness
   reads the latest one the way a person reads their email. */
const KEY = "sb_publishable_localreview";

/* email → subject. Casey and Northline exist; anybody else is new. */
const subjectOf = (email) => `sub-${String(email).toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

async function serve() {
  const db = fromPGlite(new PGlite());
  await migrate(db);
  const repository = createWorldRepository(db);
  await repository.saveWorld({ catalog: [], collectors: [{ id: "c1", name: "Casey" }],
    partners: [{ id: "p-north", name: "Northline Cards", city: "Portland", tradeRate: 0.7 }],
    relationships: [{ partnerId: "p-north", collectorId: "c1", status: "accepted", at: "2026-01-01T00:00:00.000Z" }],
    invitations: [], goals: [], inventory: [], collectorCopies: [], binders: [], binderEntries: [], interests: [],
    opportunities: [], conversations: [], photoRequests: [], copyReviews: [] });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: subjectOf("casey@example.test"), role: "collector", collectorId: "c1" });
  await accounts.linkAccount({ subject: subjectOf("owner@northline.example"), role: "tp", partnerId: "p-north" });

  const tokens = new Map();           // access token → { subject, email }
  const codes = new Map();            // email → { code, used }
  let issued = 0;
  let n = 0;
  const mint = (email) => {
    n += 1;
    const access = `at-${n}-${subjectOf(email)}`;
    tokens.set(access, { subject: subjectOf(email), email });
    tokens.set(`rt-${n}`, { subject: subjectOf(email), email, refresh: true });
    return { access_token: access, refresh_token: `rt-${n}`, token_type: "bearer", expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600 };
  };
  const verifier = { verify: async (t) => {
    const who = tokens.get(t);
    if (!who || who.refresh) throw Object.assign(new Error("no"), { reason: "signature" });
    return { subject: who.subject };
  } };
  const identity = createIdentityDirectory({ userUrl: "http://127.0.0.1/auth/v1/user", apiKey: KEY,
    fetchUser: async (t) => { const who = tokens.get(t);
      return who ? { status: 200, json: async () => ({ id: who.subject, email: who.email, email_confirmed_at: "2026-11-09T00:00:00Z" }) }
        : { status: 401, json: async () => ({}) }; } });
  const runtime = RT.systemRuntime();
  const catalog = createCatalogRepository(db, { newId: runtime.newId });
  const app = createApp({ repository, catalog, accounts, verifier, identity, runtime });
  await app.ready();

  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    const send = (status, body, type = "application/json") => { res.writeHead(status, { "content-type": type,
      "access-control-allow-origin": "*", "access-control-allow-headers": "*" }); res.end(typeof body === "string" ? body : JSON.stringify(body)); };
    if (req.method === "OPTIONS") return send(204, "");
    /* ---- the Supabase stand-in */
    if (req.url.startsWith("/sb/auth/v1/")) {
      const body = raw.length ? JSON.parse(raw) : {};
      if (req.url.startsWith("/sb/auth/v1/otp")) {
        issued += 1;
        codes.set(body.email, { code: String(24681357 + issued * 1111), used: false });
        return send(200, {});
      }
      if (req.url.startsWith("/sb/auth/v1/verify")) {
        const current = codes.get(body.email);
        if (!current || current.used || body.token !== current.code) return send(403, { msg: "Token has expired or is invalid" });
        current.used = true;
        return send(200, mint(body.email));
      }
      if (req.url.startsWith("/sb/auth/v1/token")) {
        const who = tokens.get(body.refresh_token);
        if (!who || !who.refresh) return send(400, {});
        tokens.delete(body.refresh_token);
        return send(200, mint(who.email));
      }
      if (req.url.startsWith("/sb/auth/v1/logout")) return send(204, "");
      return send(404, {});
    }
    /* ---- MetYet */
    if (req.url.startsWith("/api/")) {
      const out = await app.inject({ method: req.method, url: req.url, headers: req.headers, ...(raw.length ? { payload: raw } : {}) });
      res.writeHead(out.statusCode, { "content-type": "application/json" }); return res.end(out.body);
    }
    if (req.url.startsWith("/main.js")) return send(200, bundle, "text/javascript");
    return send(200, '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MetYet</title></head><body style="margin:0"><div id="root"></div><script type="module" src="/main.js"></script></body></html>', "text/html");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  /* Built as app.build.mjs builds it, with this server's addresses. */
  const bundle = (await esbuild.build({ entryPoints: [path.join(ROOT, "app-src/main.jsx")], bundle: true, format: "esm",
    write: false, jsx: "automatic", minify: true, target: ["es2020"], logLevel: "silent",
    define: { "process.env.NODE_ENV": '"production"', __METYET_API_URL__: JSON.stringify(origin),
      __METYET_SUPABASE_URL__: JSON.stringify(`${origin}/sb`), __METYET_SUPABASE_KEY__: JSON.stringify(KEY),
      __METYET_DEV__: "false", __METYET_DEMO__: "false" } })).outputFiles[0].text;
  return { origin, server, repository, accounts, codeFor: (email) => (codes.get(email) || {}).code };
}

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const phone = (width) => ({ viewport: { width, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA });

const checks = [];
const check = (ok, what) => { checks.push({ ok: Boolean(ok), what }); assert(ok, what); };

async function noOverflow(page, where) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  check(sw <= iw, `${where}: no horizontal overflow (${sw} ≤ ${iw})`);
}
async function storageIsOnlyTheSession(page, where) {
  const s = await page.evaluate(() => ({ session: Object.keys(sessionStorage), local: Object.keys(localStorage) }));
  check(s.local.length === 0, `${where}: localStorage is empty (${s.local.join(",")})`);
  check(s.session.every((k) => k === "metyet.session"), `${where}: sessionStorage holds only the session (${s.session.join(",")})`);
}
async function enterCode(ctx, page, email) {
  await page.fill("#metyet-email", email);
  await page.click("button[type=submit]");
  await page.waitForSelector("#metyet-code");
  const code = ctx.codeFor(email);
  await page.fill("#metyet-code", code);
  await page.click("button[type=submit]");
  return code;
}
/* On a phone the Collector's Sign out lives in the account sheet. */
async function signOut(page) {
  const inline = page.locator("button.mcs-out, button.tps-out");
  if (await inline.first().isVisible().catch(() => false)) { await inline.first().click(); return; }
  await page.locator("button.mcs-acct").first().click();
  await page.locator("button:has-text('Sign out')").last().click();
}

describe("B1 — open Collector registration in Chrome, 390 and 320 px", () => {
  for (const width of [390, 320]) {
    test(`at ${width}px: register, reload, new tab, sign out, replay, returning seats`, async () => {
      if (!chromium) { console.log("  (Playwright is not installed — skipped)"); return; }
      const ctx = await serve();
      const browser = await chromium.launch({ channel: "chrome" });
      const errors = [];
      fs.mkdirSync(OUT, { recursive: true });
      const shot = async (page, name) => { await page.waitForTimeout(250); await page.screenshot({ path: path.join(OUT, `${width}-${name}.png`), fullPage: true }); };
      try {
        const context = await browser.newContext(phone(width));
        const page = await context.newPage();
        page.on("pageerror", (e) => errors.push(e.message));

        /* 1. The entrance, with nothing about invitations required. */
        await page.goto(`${ctx.origin}/`);
        await page.waitForSelector("#metyet-email");
        const entrance = await page.innerText("body");
        check(/New to MetYet\? The same code creates your account\./.test(entrance), `${width}: entrance says the code creates an account`);
        check(!/invited at|An invitation is what creates/i.test(entrance), `${width}: entrance does not require an invitation`);
        await noOverflow(page, `${width} entrance`);
        await shot(page, "01-entrance");

        const email = `dana.${width}@example.test`;
        const firstCode = await enterCode(ctx, page, email);
        check(/^\d{8}$/.test(firstCode), `${width}: the code is 8 digits, as the project issues`);
        await page.waitForSelector("#metyet-name");
        const create = await page.innerText("body");
        check(/Welcome to MetYet/.test(create), `${width}: Welcome to MetYet`);
        check(create.includes(`You're signed in as ${email}. Create your collector account to start tracking your Goals, Binders, and cards.`), `${width}: the approved create-account sentence`);
        check(/Your name/.test(create) && /Create my account/.test(create), `${width}: name field and button`);
        await noOverflow(page, `${width} create`);
        const fits = await page.evaluate(() => {
          const card = document.querySelector("#metyet-name").closest("form").parentElement.getBoundingClientRect();
          const field = document.querySelector("#metyet-name").getBoundingClientRect();
          return field.right <= card.right - 1;
        });
        check(fits, `${width}: the name field stays inside the card`);
        const button = await page.locator("button[type=submit]").boundingBox();
        check(button && button.height >= 44, `${width}: the create button meets the 44px touch target (${button && Math.round(button.height)}px)`);
        const signOutBox = await page.locator("button", { hasText: "Not you? Sign out" }).boundingBox();
        check(signOutBox && signOutBox.height >= 44, `${width}: the sign-out button meets the 44px touch target (${signOutBox && Math.round(signOutBox.height)}px)`);
        await shot(page, "02-create-account");

        await page.click("button[type=submit]");
        await page.waitForTimeout(200);
        check(/Enter your name\./.test(await page.innerText("body")), `${width}: an empty name is caught on the page`);
        await page.fill("#metyet-name", `Dana ${width}`);
        await page.click("button[type=submit]");
        await page.waitForSelector("nav[aria-label=Collector]");
        const w = await ctx.repository.loadWorld();
        const made = w.collectors.filter((c) => c.id !== "c1");
        check(made.length === 1 && made[0].name === `Dana ${width}`, `${width}: exactly one Collector, named as typed`);
        check(w.relationships.length === 1, `${width}: no relationship was created`);
        await noOverflow(page, `${width} workspace`);
        await storageIsOnlyTheSession(page, `${width} after registering`);
        await shot(page, "03-new-workspace");

        /* 2. Reload in the same tab. */
        await page.reload();
        await page.waitForSelector("nav[aria-label=Collector]", { timeout: 10000 });
        check(true, `${width}: a reload keeps the Collector signed in, with no new code`);
        await shot(page, "04-after-reload");

        /* 3. A new tab starts signed out. */
        const other = await context.newPage();
        other.on("pageerror", (e) => errors.push(e.message));
        await other.goto(`${ctx.origin}/`);
        await other.waitForSelector("#metyet-email");
        check(true, `${width}: a new tab starts signed out`);
        await other.close();

        /* 4. Sign out, then reload: still signed out. */
        await signOut(page);
        await page.waitForSelector("#metyet-email");
        check((await page.evaluate(() => Object.keys(sessionStorage).length)) === 0, `${width}: sign-out cleared sessionStorage`);
        await page.reload();
        await page.waitForSelector("#metyet-email");
        check(true, `${width}: a reload after sign-out stays signed out`);
        await shot(page, "05-signed-out");

        /* 5. A code that was already used is refused. Ask for a code and use
           it; sign out; ask again, and type the OLD code. */
        const spent = await enterCode(ctx, page, email);
        await page.waitForSelector("nav[aria-label=Collector]");
        check(!/Create my account/.test(await page.innerText("body")), `${width}: the new Collector is a returning Collector now`);
        await signOut(page);
        await page.waitForSelector("#metyet-email");
        await page.fill("#metyet-email", email);
        await page.click("button[type=submit]");
        await page.waitForSelector("#metyet-code");
        await page.fill("#metyet-code", spent);
        await page.click("button[type=submit]");
        await page.waitForSelector("text=That code did not work");
        check(await page.locator("#metyet-code").isVisible(), `${width}: a used code is refused, and the person can try again`);
        check((await page.evaluate(() => Object.keys(sessionStorage).length)) === 0, `${width}: a refused code stored nothing`);
        await shot(page, "06-used-code-refused");

        /* 6. Returning seats never see the create screen. */
        const casey = await (await browser.newContext(phone(width))).newPage();
        casey.on("pageerror", (e) => errors.push(e.message));
        await casey.goto(`${ctx.origin}/`); await casey.waitForSelector("#metyet-email");
        await enterCode(ctx, casey, "casey@example.test");
        await casey.waitForSelector("nav[aria-label=Collector]");
        check(!/Create my account/.test(await casey.innerText("body")), `${width}: a returning Collector goes straight in`);
        await shot(casey, "07-returning-collector");
        const north = await (await browser.newContext(phone(width))).newPage();
        north.on("pageerror", (e) => errors.push(e.message));
        await north.goto(`${ctx.origin}/`); await north.waitForSelector("#metyet-email");
        await enterCode(ctx, north, "owner@northline.example");
        await north.waitForSelector("nav[aria-label='Trusted Partner']");
        check(!/Create my account/.test(await north.innerText("body")), `${width}: a Trusted Partner goes straight in`);
        await shot(north, "08-returning-trusted-partner");

        eq(errors.length, 0, `${width}: page errors: ${errors.join(" | ")}`);
        check(errors.length === 0, `${width}: no page errors`);
      } finally {
        await browser.close();
        ctx.server.close();
        fs.mkdirSync(OUT, { recursive: true });
        fs.writeFileSync(path.join(OUT, "_checks.txt"), checks.map((c) => `${c.ok ? "ok  " : "FAIL"} ${c.what}`).join("\n")
          + `\n\n${checks.filter((c) => c.ok).length}/${checks.length} checks passed\n`);
      }
    });
  }
});

run();
