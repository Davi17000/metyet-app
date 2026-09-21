/* ============================================================================
   PHASE 4 BATCH 2 — SIGNING IN FROM A BROWSER

   Batch 1 built the boundary and left a token-shaped hole in it: the session
   held whatever something else produced, and nothing produced anything. This
   is that something.

   It is not a second authentication system. Supabase remains the only
   authority; these are its own REST endpoints, and two of the three are the
   exact calls `server/auth-signin.js` already makes against the real project.
   Section A asserts that rather than asserting a shape I invented — which is
   the lesson from Batch 1, where a hand-written fixture agreed with a bug
   instead of with the domain.

     A  the provider calls, checked against the flow already proven
     B  a session: signing in, renewing, and failing closed
     C  it composes with the REAL api client and production store
     D  nothing is decoded, stored or logged that should not be
     E  the demo is still somewhere else entirely
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (rel) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const load = (rel) => {
  const out = esbuild.buildSync({
    entryPoints: [path.join(ROOT, rel)],
    bundle: true, format: "cjs", write: false, logLevel: "silent",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const mod = {};
  new Function("module", "exports", out.outputFiles[0].text)(mod, (mod.exports = {}));
  return mod.exports;
};

const AUTH = load("client/supabase-auth.js");
const SESSION = load("client/supabase-session.js");
/* The REAL ones, not stand-ins: what this batch has to prove is that the new
   session composes with what Batch 1 shipped. */
const API = load("client/api.js");
const STORE = load("client/production-store.js");
/* And the operator flow that is already proven against the real project. */
const OPERATOR = src("server/auth-signin.js");

const PROJECT = "https://projectref.supabase.co";
const KEY = "sb_publishable_example";
const EMAIL = "owner@northline.example";
const CODE = "24681357";
const ACCESS = "eyJaccess.token.one";
const ACCESS2 = "eyJaccess.token.two";
const REFRESH = "refresh-token-one";
const REFRESH2 = "refresh-token-two";

const nowSeconds = () => Math.floor(Date.now() / 1000);
const sessionBody = (access = ACCESS, refresh = REFRESH, inSeconds = 3600) =>
  ({ access_token: access, refresh_token: refresh, token_type: "bearer",
    expires_in: inSeconds, expires_at: nowSeconds() + inSeconds,
    user: { id: "sub-1", email: EMAIL, email_confirmed_at: "2026-09-10T00:00:00Z" } });

/* A provider, recorded. Nothing here reaches a network. */
const provider = (replies) => {
  const calls = [];
  const queue = Array.isArray(replies) ? [...replies] : [replies];
  const impl = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers,
      body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    const { status = 200, body = sessionBody() } = next;
    return { status, async json() { return body; } };
  };
  return { impl, calls };
};

const authWith = (replies, overrides = {}) => {
  const { impl, calls } = provider(replies);
  return { calls, auth: AUTH.createSupabaseAuth({ supabaseUrl: PROJECT, publishableKey: KEY, fetchImpl: impl, ...overrides }) };
};

/* ============================================================== A */
describe("A. the provider calls, checked against the flow already proven", () => {
  test("sign-in sends the address and nothing else, to the project's own endpoint", async () => {
    const { auth, calls } = authWith({ status: 200, body: {} });
    await auth.requestCode(" Owner@Northline.Example ");
    eq(calls.length, 1);
    eq(calls[0].url, "https://projectref.supabase.co/auth/v1/otp");
    eq(calls[0].method, "POST");
    eq(JSON.stringify(calls[0].body), JSON.stringify({ email: EMAIL }),
      "the address, normalised, and NOT create_user — the project's own signup policy decides");
    eq(calls[0].headers.apikey, KEY, "the publishable key, as the gateway wants");
  });

  test("the browser sends the same two requests the proven operator flow sends", () => {
    /* server/auth-signin.js is what actually signed Matt in against the real
       project. If the browser's requests differ from it, one of them is wrong,
       and a fixture written here could not tell us which. */
    const browser = code("client/supabase-auth.js");
    assert(/\{ email: email\.trim\(\)\.toLowerCase\(\) \}/.test(browser)
      && /\{ email: address \}/.test(code("server/auth-signin.js")),
      "both send exactly an address to /otp");
    assert(!/create_user/.test(browser) && !/create_user/.test(code("server/auth-signin.js")),
      "and neither asserts a signup policy");
    assert(/type: "email"/.test(browser) && /type: "email"/.test(code("server/auth-signin.js")),
      "both verify with type \"email\" — the one that checks both token columns");
    assert(/\/otp/.test(OPERATOR) && /\/verify/.test(OPERATOR), "and the operator flow names the same two paths");
  });

  test("verifying a code returns a session, and nothing is read out of the token", async () => {
    const { auth, calls } = authWith({ status: 200, body: sessionBody() });
    const session = await auth.verifyCode(EMAIL, CODE);
    eq(calls[0].url, "https://projectref.supabase.co/auth/v1/verify");
    eq(JSON.stringify(calls[0].body), JSON.stringify({ type: "email", email: EMAIL, token: CODE }));
    eq(session.accessToken, ACCESS);
    eq(session.refreshToken, REFRESH);
    assert(session.expiresAt > nowSeconds(), "the expiry came from the provider's own field");
    eq(Object.keys(session).sort().join(), "accessToken,expiresAt,refreshToken",
      "a session is three things; nothing about the person is kept");
  });

  test("an expiry is taken from the body, never computed from the token", () => {
    const bare = code("client/supabase-auth.js") + code("client/supabase-session.js");
    assert(!/atob|base64|decodeJwt|jwtDecode|JSON\.parse\([^)]*split\(/.test(bare),
      "no JWT is parsed: the browser does not decide for itself what a token says");
    assert(/expires_at/.test(code("client/supabase-auth.js")), "the provider's own field is what is read");
  });

  test("refresh and sign-out use the endpoints and shapes the provider documents", async () => {
    const { auth, calls } = authWith({ status: 200, body: sessionBody(ACCESS2, REFRESH2) });
    const next = await auth.refresh(REFRESH);
    eq(calls[0].url, "https://projectref.supabase.co/auth/v1/token?grant_type=refresh_token");
    eq(JSON.stringify(calls[0].body), JSON.stringify({ refresh_token: REFRESH }));
    eq(next.accessToken, ACCESS2);
    eq(next.refreshToken, REFRESH2, "the refresh token rotates, and the new one is what is kept");

    const out = authWith({ status: 204, body: {} });
    await out.auth.signOut(ACCESS);
    eq(out.calls[0].url, "https://projectref.supabase.co/auth/v1/logout");
    eq(out.calls[0].headers.authorization, `Bearer ${ACCESS}`,
      "the one call that acts as the person, so the refresh token dies at source");
  });

  test("a code or a session may not cross a plaintext connection to a stranger", () => {
    ["https://projectref.supabase.co/auth/v1", "http://127.0.0.1:54321/auth/v1", "http://localhost:9999/auth/v1"]
      .forEach((url) => assert(AUTH.isSafeProviderUrl(url), `${url} is allowed`));
    ["http://projectref.supabase.co", "http://localhost.evil.example", "ftp://x", ""]
      .forEach((url) => assert(!AUTH.isSafeProviderUrl(url), `${url} is refused`));
    let threw = null;
    try { AUTH.createSupabaseAuth({ supabaseUrl: "http://projectref.supabase.co", publishableKey: KEY }); }
    catch (error) { threw = error; }
    assert(threw && /https/.test(threw.message), "and constructing against one fails");
  });

  test("a secret key in a browser bundle is refused outright", () => {
    let threw = null;
    try { AUTH.createSupabaseAuth({ supabaseUrl: PROJECT, publishableKey: "sb_secret_abcdef" }); }
    catch (error) { threw = error; }
    assert(threw && /secret key/.test(threw.message), "that would be the whole database in everyone's hands");
    /* And a missing key is refused too, rather than producing requests the
       gateway will reject one at a time. */
    let missing = null;
    try { AUTH.createSupabaseAuth({ supabaseUrl: PROJECT }); } catch (error) { missing = error; }
    assert(missing, "a key is required");
  });

  test("every provider failure is a word of ours, never the provider's body", async () => {
    const cases = [
      [{ status: 403, body: { msg: `code ${CODE} is invalid` } }, AUTH.AUTH_FAILURES.rejected],
      [{ status: 400, body: { error_description: CODE } }, AUTH.AUTH_FAILURES.rejected],
      [{ status: 422, body: {} }, AUTH.AUTH_FAILURES.disabled],
      [{ status: 429, body: {} }, AUTH.AUTH_FAILURES.rateLimited],
      [{ status: 500, body: {} }, AUTH.AUTH_FAILURES.unavailable],
      [new Error("offline"), AUTH.AUTH_FAILURES.unavailable],
    ];
    for (const [reply, failure] of cases) {
      let threw = null;
      try { await authWith(reply).auth.verifyCode(EMAIL, CODE); } catch (error) { threw = error; }
      assert(threw instanceof AUTH.AuthError, `${failure} is an AuthError`);
      eq(threw.failure, failure, `and named: ${JSON.stringify(reply)}`);
      const whole = `${threw.message} ${threw.stack || ""}`;
      assert(!whole.includes(CODE), "and a body that quotes the code back cannot carry it outward");
    }
  });
});

/* ============================================================== B */
describe("B. a session: signing in, renewing, and failing closed", () => {
  const sessionWith = (replies, options = {}) => {
    const { auth, calls } = authWith(replies);
    return { calls, session: SESSION.createSupabaseSession({ auth, ...options }) };
  };

  test("it answers the same four members the injected session does", () => {
    const { session } = sessionWith({ status: 200, body: sessionBody() });
    const plain = load("client/session.js").createSession();
    ["token", "status", "subscribe", "clear"].forEach((m) => {
      eq(typeof session[m], "function", `supabase session has ${m}`);
      eq(typeof plain[m], "function", `and so does the injected one — api.js takes either`);
    });
  });

  test("signing in makes a session, and only the status is announced", async () => {
    const { session } = sessionWith({ status: 200, body: sessionBody() });
    const seen = [];
    session.subscribe((status) => seen.push(status));
    eq(session.status(), SESSION.ANONYMOUS);
    eq(await session.token(), null, "nothing to give before signing in");

    eq(await session.verifyCode(EMAIL, CODE), SESSION.PRESENT);
    eq(await session.token(), ACCESS);
    eq(JSON.stringify(seen), JSON.stringify([SESSION.PRESENT]));
    assert(!seen.some((s) => String(s).includes(ACCESS)), "the token is never what is published");
  });

  test("a token nearly due is renewed before it is handed out", async () => {
    /* Thirty seconds left: inside the renewal window, so asking for a token
       renews rather than handing back one that may lapse mid-request. */
    const { session, calls } = sessionWith([
      { status: 200, body: sessionBody(ACCESS, REFRESH, 30) },
      { status: 200, body: sessionBody(ACCESS2, REFRESH2, 3600) },
    ]);
    await session.verifyCode(EMAIL, CODE);
    eq(await session.token(), ACCESS2, "a fresh token, not the nearly-dead one");
    eq(calls[1].url, "https://projectref.supabase.co/auth/v1/token?grant_type=refresh_token");
    eq(JSON.stringify(calls[1].body), JSON.stringify({ refresh_token: REFRESH }));
    eq(await session.token(), ACCESS2, "and the new one is not renewed again");
    eq(calls.length, 2, "so there is no renewal per call");
  });

  test("several callers asking at once produce ONE renewal", async () => {
    /* A refresh token rotates: a second concurrent request would present one
       the provider has just retired. */
    const { session, calls } = sessionWith([
      { status: 200, body: sessionBody(ACCESS, REFRESH, 10) },
      { status: 200, body: sessionBody(ACCESS2, REFRESH2, 3600) },
    ]);
    await session.verifyCode(EMAIL, CODE);
    const tokens = await Promise.all([session.token(), session.token(), session.token(), session.token()]);
    eq(JSON.stringify(tokens), JSON.stringify([ACCESS2, ACCESS2, ACCESS2, ACCESS2]));
    eq(calls.length, 2, "one sign-in and one renewal, however many asked");
  });

  test("a renewal that fails ends the session rather than leaving a stale one", async () => {
    const { session } = sessionWith([
      { status: 200, body: sessionBody(ACCESS, REFRESH, 10) },
      { status: 401, body: {} },
    ]);
    await session.verifyCode(EMAIL, CODE);
    eq(session.status(), SESSION.PRESENT);
    eq(await session.token(), null, "no token rather than an expired one");
    eq(session.status(), SESSION.ANONYMOUS, "and the session is over, so a screen can say so");
  });

  test("a session with no refresh token simply ends when it is due", async () => {
    const { session } = sessionWith({ status: 200,
      body: { access_token: ACCESS, expires_in: 5, expires_at: nowSeconds() + 5 } });
    await session.verifyCode(EMAIL, CODE);
    eq(await session.token(), null);
    eq(session.status(), SESSION.ANONYMOUS);
  });

  test("a provider that states no expiry is treated as due, not as eternal", async () => {
    const { session, calls } = sessionWith([
      { status: 200, body: { access_token: ACCESS, refresh_token: REFRESH } },
      { status: 200, body: sessionBody(ACCESS2, REFRESH2, 3600) },
    ]);
    await session.verifyCode(EMAIL, CODE);
    eq(await session.token(), ACCESS2, "it renewed rather than assuming the token lasts for ever");
    eq(calls.length, 2);
  });

  test("signing out revokes at the source, and clears even if that fails", async () => {
    const ok = sessionWith([{ status: 200, body: sessionBody() }, { status: 204, body: {} }]);
    await ok.session.verifyCode(EMAIL, CODE);
    eq(await ok.session.signOut(), SESSION.ANONYMOUS);
    eq(ok.calls[1].url, "https://projectref.supabase.co/auth/v1/logout", "the refresh token dies at source");
    eq(await ok.session.token(), null);

    /* And the network cannot refuse a sign-out. */
    const bad = sessionWith([{ status: 200, body: sessionBody() }, new Error("offline")]);
    await bad.session.verifyCode(EMAIL, CODE);
    eq(await bad.session.signOut(), SESSION.ANONYMOUS);
    eq(await bad.session.token(), null, "cleared regardless");
    eq(bad.session.status(), SESSION.ANONYMOUS);
  });

  test("a failed sign-in leaves no session at all", async () => {
    const { session } = sessionWith({ status: 403, body: {} });
    let threw = null;
    try { await session.verifyCode(EMAIL, "00000000"); } catch (error) { threw = error; }
    assert(threw, "the caller is told");
    eq(session.status(), SESSION.ANONYMOUS);
    eq(await session.token(), null);
  });
});

/* ============================================================== C */
describe("C. it composes with the real api client and production store", () => {
  /* Not stand-ins. What this batch has to prove is that the session Batch 1
     left a hole for actually fits it. */
  const PROJECTION = { actor: { seat: "tp", partnerId: "tp_9k2m" },
    catalog: [], collectors: [], partners: [{ id: "tp_9k2m", name: "Northline Cards" }],
    relationships: [], goals: [], inventory: [], collectorCopies: [], binders: [], binderEntries: [], opportunities: [] };

  /* One recorder for both hosts: the provider and the MetYet API. */
  const world = (apiReplies) => {
    const calls = [];
    const providerQueue = [{ status: 200, body: sessionBody(ACCESS, REFRESH, 10) },
      { status: 200, body: sessionBody(ACCESS2, REFRESH2, 3600) }];
    const apiQueue = [...apiReplies];
    const impl = async (url, init) => {
      calls.push({ url, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
      const queue = url.startsWith(PROJECT) ? providerQueue : apiQueue;
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (next instanceof Error) throw next;
      return { status: next.status, async json() { return next.body; } };
    };
    const auth = AUTH.createSupabaseAuth({ supabaseUrl: PROJECT, publishableKey: KEY, fetchImpl: impl });
    const session = SESSION.createSupabaseSession({ auth });
    const api = API.createApiClient({ baseUrl: "https://app.metyet.io", getToken: () => session.token(), fetchImpl: impl });
    return { calls, session, api, store: STORE.createProductionStore({ api }) };
  };

  test("a real session drives the real api client and store, end to end", async () => {
    const { session, store, calls } = world([{ status: 200, body: { version: 1, state: PROJECTION } }]);
    await session.verifyCode(EMAIL, CODE);
    await store.load();
    eq(JSON.stringify(store.get()), JSON.stringify(PROJECTION), "the server's projection, through the real store");
    eq(store.status(), "ready");
    const apiCall = calls.find((c) => c.url.includes("/api/view"));
    assert(apiCall, "the API was reached");
    eq(apiCall.headers.authorization, `Bearer ${ACCESS2}`, "carrying the renewed token");
    /* And still no identity: the server derives the seat from the bearer. */
    assert(!/"partnerId"|"collectorId"|"subject"|"seat"/.test(JSON.stringify(apiCall)),
      "the API request names nobody");
  });

  test("when the session renews, later API calls carry the NEW token", async () => {
    const { session, api, calls } = world([{ status: 200, body: { version: 1, state: PROJECTION } }]);
    await session.verifyCode(EMAIL, CODE);
    await api.view();
    const first = calls.filter((c) => c.url.includes("/api/view")).pop();
    eq(first.headers.authorization, `Bearer ${ACCESS2}`, "renewed on the way out");
    await api.view();
    const second = calls.filter((c) => c.url.includes("/api/view")).pop();
    eq(second.headers.authorization, `Bearer ${ACCESS2}`,
      "and every later call uses the current one, because api.js asks per request");
  });

  test("an ended session makes the API refuse before it reaches the network", async () => {
    const { session, api, calls } = world([{ status: 200, body: { version: 1, state: PROJECTION } }]);
    await session.verifyCode(EMAIL, CODE);
    await session.signOut();
    const before = calls.filter((c) => c.url.includes("/api/")).length;
    let threw = null;
    try { await api.view(); } catch (error) { threw = error; }
    eq(threw.failure, API.FAILURES.unauthenticated, "it fails closed");
    eq(calls.filter((c) => c.url.includes("/api/")).length, before,
      "and nothing left the browser — an expired session cannot become an anonymous-looking request");
  });
});

/* ============================================================== D */
describe("D. nothing is decoded, stored or logged that should not be", () => {
  const boundary = ["client/supabase-auth.js", "client/supabase-session.js"];

  test("no browser storage is chosen, so none was inherited", () => {
    boundary.forEach((rel) => {
      const bare = code(rel);
      ["localStorage", "sessionStorage", "indexedDB", "document.cookie"].forEach((api) => {
        assert(!bare.includes(api), `${rel} reaches for ${api}`);
      });
    });
    /* Storage is an adapter, defaulting to none — a decision somebody made, in
       one place, reversible in one argument. "Remembers nothing" means nothing
       comes back AFTER something was put in; an empty store answering null
       proves only that it is empty. */
    SESSION.NO_STORAGE.save({ accessToken: ACCESS, refreshToken: REFRESH, expiresAt: nowSeconds() + 3600 });
    eq(SESSION.NO_STORAGE.load(), null, "the default adapter keeps nothing it is given");
  });

  test("a session signed in under the default adapter is not picked up by the next one", async () => {
    /* The property memory-only actually buys: another tab, or a later visit,
       starts signed out. Asserted by signing in for real and then building a
       second session the same way. */
    const first = SESSION.createSupabaseSession({ auth: authWith({ status: 200, body: sessionBody() }).auth });
    await first.verifyCode(EMAIL, CODE);
    eq(first.status(), SESSION.PRESENT);
    const second = SESSION.createSupabaseSession({ auth: authWith({ status: 200, body: sessionBody() }).auth });
    eq(second.status(), SESSION.ANONYMOUS, "nothing was left behind for it to find");
    eq(await second.token(), null);
    /* And the first is untouched by the second existing. Both halves matter:
       state held at module level would make the new session look anonymous
       (passing the check above) while quietly signing the first one out. */
    eq(first.status(), SESSION.PRESENT, "a second session does not end the first");
    eq(await first.token(), ACCESS, "which is what a shared variable would have done");
  });

  test("an injected adapter is used, which is how the default is a choice", async () => {
    const box = {};
    const storage = { load: () => box.v || null, save: (s) => { box.v = s; }, clear: () => { delete box.v; } };
    const first = authWith({ status: 200, body: sessionBody() });
    const a = SESSION.createSupabaseSession({ auth: first.auth, storage });
    await a.verifyCode(EMAIL, CODE);
    assert(box.v && box.v.accessToken === ACCESS, "it was saved");
    const b = SESSION.createSupabaseSession({ auth: authWith({ status: 200, body: sessionBody() }).auth, storage });
    eq(b.status(), SESSION.PRESENT, "and restored — which is exactly what memory-only declines to do");
    await a.signOut();
    eq(box.v, undefined, "and a sign-out clears the store too");
  });

  test("no token, code or address is ever thrown, logged or announced", async () => {
    const { session } = (() => {
      const { auth } = authWith({ status: 200, body: sessionBody() });
      return { session: SESSION.createSupabaseSession({ auth }) };
    })();
    const announced = [];
    session.subscribe((s) => announced.push(s));
    await session.verifyCode(EMAIL, CODE);
    const whole = JSON.stringify(announced);
    [ACCESS, REFRESH, CODE, EMAIL].forEach((secret) => {
      assert(!whole.includes(secret), `a subscriber was told ${secret.slice(0, 6)}…`);
    });
    boundary.forEach((rel) => {
      const bare = code(rel);
      assert(!/console\.(log|warn|error|info)/.test(bare), `${rel} logs`);
    });
  });

  test("it authors no MetYet identity, and runs no domain code", () => {
    boundary.forEach((rel) => {
      const bare = code(rel);
      assert(!/partnerId|collectorId|\bseat\b|\bactor\b/.test(bare), `${rel} names a MetYet seat`);
      assert(!/from ["'][^"']*domain\/|require\(["'][^"']*domain\//.test(bare), `${rel} imports the domain`);
      assert(!/projectForActor|metyet-commands|metyet-store|prototypeRuntime|buildCanonicalSeed/.test(bare),
        `${rel} reaches the domain or the seed`);
    });
    /* The provider's `user` object comes back on sign-in and is deliberately
       dropped: who you are in MetYet is what /api/view answers. */
    assert(!/\buser\b/.test(code("client/supabase-session.js")), "the provider's user record is not kept");
  });

  test("the session holds three things, and none of them describes a person", async () => {
    const { auth } = authWith({ status: 200, body: sessionBody() });
    const session = SESSION.createSupabaseSession({ auth });
    await session.verifyCode(EMAIL, CODE);
    /* Everything it exposes, checked: a token when asked, a status, an expiry. */
    eq(typeof session.expiresAt(), "number");
    ["email", "subject", "userId", "id", "name", "role"].forEach((field) => {
      eq(session[field], undefined, `session.${field} must not exist`);
    });
  });
});

/* ============================================================== E */
describe("E. the demo is still somewhere else entirely", () => {
  test("nothing in the demo path imports the browser auth boundary", () => {
    ["shell/MetYetPrototype.jsx", "src/MetYet.jsx", "collector/MetYetCollector.jsx",
      "site-src/main.jsx", "dev/main.jsx", "site.build.mjs"].forEach((rel) => {
      assert(!/supabase-auth|supabase-session|client\//.test(code(rel)), `${rel} reaches production auth`);
    });
  });

  test("and the browser auth boundary imports nothing of the demo", () => {
    ["client/supabase-auth.js", "client/supabase-session.js"].forEach((rel) => {
      assert(!/MetYet\.jsx|MetYetCollector|MetYetPrototype|demo-flag|dev-flag/.test(code(rel)),
        `${rel} reaches the demo`);
    });
  });

  test("the demo build is unchanged, at its own hostname, with no auth in it", () => {
    const site = src("site.build.mjs");
    eq((site.match(/const DOMAIN = "([^"]+)"/) || [])[1], "demo.metyet.io");
    assert(/__METYET_DEMO__: "true"/.test(site) && /__METYET_DEV__: "false"/.test(site));
    /* The bundle the demo actually ships, built the way it ships: no provider
       host, no token, no sign-in. */
    const bundle = esbuild.buildSync({
      entryPoints: [path.join(ROOT, "site-src", "main.jsx")],
      bundle: true, format: "esm", write: false, logLevel: "silent",
      define: { "process.env.NODE_ENV": '"production"', __METYET_DEV__: "false", __METYET_DEMO__: "true" },
    }).outputFiles[0].text;
    ["supabase", "auth/v1", "Bearer ", "refresh_token", "/api/view", "/api/commands"].forEach((needle) => {
      assert(!bundle.includes(needle), `the demo bundle contains "${needle}"`);
    });
  });

  test("no new dependency reached the client", () => {
    const pkg = JSON.parse(src("package.json"));
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    assert(!Object.keys(all).some((d) => /supabase|gotrue|jwt|jose/.test(d) && d !== "jose"),
      "no auth library was added to the client");
    assert(!Object.keys(all).some((d) => /supabase/.test(d)), "and no supabase package at all");
  });
});

run();
