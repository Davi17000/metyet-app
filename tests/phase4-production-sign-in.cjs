/* ============================================================================
   PHASE 4 BATCH 3 — THE PRODUCTION ENTRANCE

   Batch 1 built the boundary, Batch 2 built the session, and neither was wired
   to anything a person could look at. This is the entrance: type an address,
   receive a code, type it, and see what the server says you are.

   Everything below drives the REAL modules — the real Supabase auth, the real
   session, the real api client, the real production store, and the real React
   component — with one recorded fetch standing in for the network and nothing
   else replaced. A parallel fake implementation would prove that the fake
   works, which is the mistake Batch 1 made and had to fix.

     A  the browser's public configuration, and what it refuses
     B  the seven states, through the real modules
     C  identity comes only from the server, and failures fail closed
     D  no credential is rendered, logged or thrown
     E  the server serves the client, and only the client
     F  the demo is still a different thing entirely
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const React = require("react");
const TR = require("react-test-renderer");

const ROOT = path.join(__dirname, "..");
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (rel) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const load = (rel, define = {}) => {
  const out = esbuild.buildSync({
    entryPoints: [path.join(ROOT, rel)],
    bundle: true, format: "cjs", write: false, logLevel: "silent", jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
    define: { "process.env.NODE_ENV": '"production"', ...define },
  });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};

const CONFIG = load("client/production-config.js");
const AUTH = load("client/supabase-auth.js");
const SESSION = load("client/supabase-session.js");
const API = load("client/api.js");
const STORE = load("client/production-store.js");
const SIGNIN = load("client/sign-in/SignIn.jsx");

const PROJECT = "https://projectref.supabase.co";
const KEY = "sb_publishable_example";
const APP = "https://app.metyet.io";
const EMAIL = "owner@northline.example";
const OTP = "24681357";
const ACCESS = "eyJaccess.token.production";
const REFRESH = "refresh-token-production";
const PARTNER = "tp_9k2m";

const nowSeconds = () => Math.floor(Date.now() / 1000);
const sessionBody = (inSeconds = 3600) => ({ access_token: ACCESS, refresh_token: REFRESH,
  token_type: "bearer", expires_in: inSeconds, expires_at: nowSeconds() + inSeconds,
  user: { id: "sub-1", email: EMAIL } });
/* The projection as the DOMAIN shapes it: a seat, and the id under that seat's
   own field. There is no `actor.id`, which is the bug Batch 1 had to fix. */
const PROJECTION = { actor: { seat: "tp", partnerId: PARTNER },
  catalog: [], collectors: [], partners: [{ id: PARTNER, name: "Northline Cards", tradeRate: 0.8 }],
  relationships: [], goals: [], inventory: [], collectorCopies: [], opportunities: [] };

/* One recorder for both hosts. Every module below is the real one. */
function wire({ otp = { status: 200, body: {} }, verify = { status: 200, body: sessionBody() },
  view = { status: 200, body: { version: 7, state: PROJECTION } }, logout = { status: 204, body: {} } } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, method: (init && init.method) || "GET", headers: (init && init.headers) || {},
      body: init && init.body ? JSON.parse(init.body) : undefined });
    const reply = url.includes("/auth/v1/otp") ? otp
      : url.includes("/auth/v1/verify") ? verify
        : url.includes("/auth/v1/logout") ? logout
          : url.includes("/auth/v1/token") ? verify
            : view;
    if (reply instanceof Error) throw reply;
    return { status: reply.status, async json() {
      if (reply.body instanceof Error) throw reply.body;
      return reply.body;
    } };
  };
  const auth = AUTH.createSupabaseAuth({ supabaseUrl: PROJECT, publishableKey: KEY, fetchImpl: impl });
  const session = SESSION.createSupabaseSession({ auth });
  const api = API.createApiClient({ baseUrl: APP, getToken: () => session.token(), fetchImpl: impl });
  const store = STORE.createProductionStore({ api });
  return { calls, session, store,
    apiCalls: () => calls.filter((c) => c.url.startsWith(APP)),
    authCalls: () => calls.filter((c) => c.url.startsWith(PROJECT)) };
}

/* Rendering the real component. `flush` drains the promises a click starts. */
const render = (props) => {
  let r;
  TR.act(() => { r = TR.create(React.createElement(SIGNIN.default, props)); });
  return r;
};
const flush = async (r) => { await TR.act(async () => { await new Promise((res) => setTimeout(res, 0)); }); return r; };
const texts = (r) => {
  const out = [];
  const walk = (n) => { for (const c of (n && n.children) || []) {
    if (typeof c === "string" || typeof c === "number") out.push(String(c)); else walk(c); } };
  walk(r.toJSON());
  return out.join(" ");
};
const find = (r, type, pred = () => true) => r.root.findAll((n) => n.type === type && pred(n))[0] || null;
const typeInto = (r, id, value) => {
  const input = r.root.findAll((n) => n.type === "input" && n.props.id === id)[0];
  assert(input, `no input ${id}`);
  TR.act(() => { input.props.onChange({ target: { value } }); });
};
const submit = (r) => {
  const form = find(r, "form");
  assert(form, "no form to submit");
  TR.act(() => { form.props.onSubmit({ preventDefault() {} }); });
};
/* The text a rendered node actually shows. `props.children` was enough while
   every button's child was a string; Batch 4's shell nests them in spans, and
   JSON.stringify on a React element walks into the fiber and never returns. */
const instText = (node) => {
  const out = [];
  const walk = (n) => {
    if (typeof n === "string" || typeof n === "number") { out.push(String(n)); return; }
    if (!n || !Array.isArray(n.children)) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out.join(" ");
};
const clickText = (r, label) => {
  const button = r.root.findAll((n) => n.type === "button").find((n) => instText(n).includes(label));
  assert(button, `no button "${label}"`);
  TR.act(() => { button.props.onClick(); });
};

/* ============================================================== A */
describe("A. the browser's public configuration, and what it refuses", () => {
  const good = { apiUrl: APP, supabaseUrl: PROJECT, publishableKey: KEY };

  test("three public values, none of them a secret, normalised", () => {
    const config = CONFIG.readProductionConfig({ ...good, apiUrl: `${APP}/` });
    eq(config.apiUrl, APP, "a trailing slash is not part of an origin");
    eq(config.supabaseUrl, PROJECT);
    eq(config.publishableKey, KEY);
  });

  test("a missing value is refused at boot, and named without being shown", () => {
    for (const missing of ["supabaseUrl", "publishableKey"]) {
      const broken = { ...good, [missing]: "" };
      let threw = null;
      try { CONFIG.readProductionConfig(broken); } catch (error) { threw = error; }
      assert(threw && threw.code === "config.invalid", `${missing} is required`);
      assert(threw.problems.some((p) => /SUPABASE/.test(p)), `and named: ${threw.message}`);
      assert(!threw.message.includes(KEY), "and no value is in the message");
    }
  });

  test("a bearer may not cross a plaintext connection to anywhere but this machine", () => {
    ["http://app.metyet.io", "http://192.168.1.10", "http://localhost.evil.example"].forEach((bad) => {
      let threw = null;
      try { CONFIG.readProductionConfig({ ...good, apiUrl: bad }); } catch (error) { threw = error; }
      assert(threw, `${bad} is refused as the API`);
      let alsoThrew = null;
      try { CONFIG.readProductionConfig({ ...good, supabaseUrl: bad }); } catch (error) { alsoThrew = error; }
      assert(alsoThrew, `${bad} is refused as the project`);
    });
    assert(CONFIG.readProductionConfig({ ...good, apiUrl: "http://localhost:8080" }), "but this machine is fine");
  });

  test("a secret or service-role key in a browser bundle is refused", () => {
    const serviceRole = `x.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.y`;
    ["sb_secret_abcdef", serviceRole].forEach((key) => {
      let threw = null;
      try { CONFIG.readProductionConfig({ ...good, publishableKey: key }); } catch (error) { threw = error; }
      assert(threw && /secret or service-role/.test(threw.message), `${key.slice(0, 12)}… is refused`);
      assert(!threw.message.includes(key), "and the key is not repeated back");
    });
    /* And a normal publishable key is not mistaken for one. */
    assert(CONFIG.readProductionConfig({ ...good, publishableKey: "sb_publishable_realish" }));
    assert(CONFIG.readProductionConfig({ ...good,
      publishableKey: `x.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.y` }));
  });

  test("what may be shown about the configuration is presence, not values", () => {
    const shown = JSON.stringify(CONFIG.describeConfig(CONFIG.readProductionConfig(good)));
    assert(!shown.includes(KEY), "never the key");
    assert(shown.includes(APP), "the API host, which is in the person's own URL bar");
  });

  test("the build refuses to ship a bundle that could not start", () => {
    const build = code("app.build.mjs");
    assert(/readProductionConfig/.test(build), "the build makes the same check the browser makes");
    /* And the exit is in THAT branch. `process.exit(1)` appears elsewhere in
       this file too, so merely finding one proves nothing about what happens
       when the configuration is wrong. */
    const branch = (build.match(/catch \(error\) \{[\s\S]*?\n\}/) || [])[0] || "";
    assert(/readProductionConfig/.test(build.slice(0, build.indexOf(branch))), "the catch follows the check");
    assert(/process\.exit\(1\)/.test(branch),
      "a bundle that could not start is not shipped: " + branch.slice(0, 120));
    /* And the values come from the environment, never from the repository. */
    assert(!/sb_publishable_[A-Za-z0-9]{8,}|https:\/\/[a-z0-9]{15,}\.supabase\.co/.test(src("app.build.mjs")),
      "no real project value is written into the build file");
  });
});

/* ============================================================== B */
describe("B. the seven states, through the real modules", () => {
  test("signed out: an address, and nothing has been asked of anyone", async () => {
    const { session, store, calls } = wire();
    const r = render({ session, store });
    assert(/Sign in with the address you were invited at/.test(texts(r)));
    eq(calls.length, 0, "nothing is requested before a person asks for it");
    eq(session.status(), SESSION.ANONYMOUS);
  });

  test("an address that is not one is refused before the provider is asked", async () => {
    const { session, store, calls } = wire();
    const r = render({ session, store });
    typeInto(r, "metyet-email", "not-an-address");
    submit(r);
    await flush(r);
    assert(/does not look like an email address/.test(texts(r)), texts(r));
    eq(calls.length, 0, "and no email was sent");
  });

  test("code requested: the real auth boundary is called, with the address alone", async () => {
    const { session, store, authCalls } = wire();
    const r = render({ session, store });
    typeInto(r, "metyet-email", `  ${EMAIL}  `);
    submit(r);
    await flush(r);
    eq(authCalls().length, 1, "one request");
    eq(authCalls()[0].url, `${PROJECT}/auth/v1/otp`);
    eq(JSON.stringify(authCalls()[0].body), JSON.stringify({ email: EMAIL }),
      "the address, normalised, and no create_user — the project's signup policy decides");
    assert(/We sent a code to/.test(texts(r)) && texts(r).includes(EMAIL), "and the address is shown, so a typo is visible");
  });

  test("verified: the code goes to the provider and becomes a real session", async () => {
    const { session, store, authCalls } = wire();
    const r = render({ session, store });
    typeInto(r, "metyet-email", EMAIL);
    submit(r);
    await flush(r);
    typeInto(r, "metyet-code", OTP);
    submit(r);
    await flush(r);
    const verify = authCalls().find((c) => c.url.includes("/verify"));
    assert(verify, "the provider was asked");
    eq(JSON.stringify(verify.body), JSON.stringify({ type: "email", email: EMAIL, token: OTP }),
      "type \"email\" — the one that checks both token columns");
    eq(session.status(), SESSION.PRESENT, "and the session contract now holds a session");
  });

  test("authenticated: the projection arrives through the real API and store", async () => {
    const { session, store, apiCalls } = wire();
    const r = render({ session, store });
    typeInto(r, "metyet-email", EMAIL);
    submit(r); await flush(r);
    typeInto(r, "metyet-code", OTP);
    submit(r); await flush(r);

    eq(apiCalls().length, 1, "one API request, after signing in and not before");
    eq(apiCalls()[0].url, `${APP}/api/view`);
    eq(apiCalls()[0].headers.authorization, `Bearer ${ACCESS}`, "carrying the session's token");
    eq(JSON.stringify(store.get()), JSON.stringify(PROJECTION), "the store holds the server's answer");
    eq(store.status(), "ready");

    /* BATCH 4 CHANGED WHAT IS ON THIS SCREEN, and three assertions with it.
       Batch 3 rendered the raw partner id, the world version and the
       projection's collection counts — a diagnostic that proved the round trip
       and was explicitly meant to be replaced. What stands in their place is
       stronger, not weaker: the shop's name is resolved BY the actor's id (and
       tests/phase4-tp-production-shell.cjs proves a decoy record cannot be used
       instead), and the product's own navigation is what arrives. */
    const shown = texts(r);
    assert(shown.includes("Northline Cards"), "the name from the projection's own record: " + shown);
    assert(!shown.includes(PARTNER), "the internal id is not the person's identity: " + shown);
    ["Collector Network", "Inventory", "Opportunities"].forEach((label) => {
      assert(shown.includes(label), `the product's navigation is missing ${label}: ` + shown);
    });
  });

  test("sign-out returns to signed out, and clears the session", async () => {
    const { session, store, authCalls } = wire();
    const r = render({ session, store });
    typeInto(r, "metyet-email", EMAIL); submit(r); await flush(r);
    typeInto(r, "metyet-code", OTP); submit(r); await flush(r);
    eq(session.status(), SESSION.PRESENT);

    clickText(r, "Sign out");
    await flush(r);
    eq(session.status(), SESSION.ANONYMOUS, "the session is over");
    eq(await session.token(), null);
    assert(authCalls().some((c) => c.url.includes("/logout")), "revoked at the source");
    assert(/Sign in with the address/.test(texts(r)), "and the screen is the entrance again");
    assert(!texts(r).includes("Northline Cards"), "with none of the last person's shop still on it");
  });

  test("after signing out, the last person's shop cannot reappear", async () => {
    /* Signing out clears what was on the screen. The check that matters is the
       NEXT sign-in through the SAME component: if that one fails to load, the
       previous person's projection must not still be there to be rendered. */
    const failing = { status: 503, body: { error: { code: "service_unavailable" } } };
    let viewReply = { status: 200, body: { version: 7, state: PROJECTION } };
    const calls = [];
    const impl = async (url, init) => {
      calls.push({ url });
      const reply = url.includes("/auth/v1/otp") ? { status: 200, body: {} }
        : url.includes("/auth/v1/verify") ? { status: 200, body: sessionBody() }
          : url.includes("/auth/v1/logout") ? { status: 204, body: {} }
            : viewReply;
      return { status: reply.status, async json() { return reply.body; } };
    };
    const auth = AUTH.createSupabaseAuth({ supabaseUrl: PROJECT, publishableKey: KEY, fetchImpl: impl });
    const session = SESSION.createSupabaseSession({ auth });
    const api = API.createApiClient({ baseUrl: APP, getToken: () => session.token(), fetchImpl: impl });
    const store = STORE.createProductionStore({ api });

    const r = render({ session, store });
    typeInto(r, "metyet-email", EMAIL); submit(r); await flush(r);
    typeInto(r, "metyet-code", OTP); submit(r); await flush(r);
    assert(texts(r).includes("Northline Cards"), "signed in as somebody");

    clickText(r, "Sign out"); await flush(r);
    assert(!texts(r).includes("Northline Cards"), "the shop left with the sign-out");

    /* Sign in again, and let it fail on the way to the projection. */
    viewReply = failing;
    typeInto(r, "metyet-email", "someone.else@example.com"); submit(r); await flush(r);
    typeInto(r, "metyet-code", OTP); submit(r); await flush(r);
    const shown = texts(r);
    assert(!shown.includes("Northline Cards"), "the previous shop reappeared: " + shown);
    /* The id is no longer rendered anywhere, so asserting its absence would
       pass whatever happened. The navigation is the thing that would still be
       on screen if a stale projection survived. */
    assert(!/Collector Network/.test(shown), "and so did the previous product surface: " + shown);
  });

  test("sign-out still returns to signed out when revocation fails", async () => {
    const { session, store } = wire({ logout: new Error("offline") });
    const r = render({ session, store });
    typeInto(r, "metyet-email", EMAIL); submit(r); await flush(r);
    typeInto(r, "metyet-code", OTP); submit(r); await flush(r);
    clickText(r, "Sign out");
    await flush(r);
    eq(session.status(), SESSION.ANONYMOUS, "sign-out is not something the network can refuse");
    assert(/Sign in with the address/.test(texts(r)));
  });
});

/* ============================================================== C */
describe("C. identity comes only from the server, and failure fails closed", () => {
  test("no client-supplied identity is ever sent, to either host", async () => {
    const { session, store, calls } = wire();
    const r = render({ session, store });
    typeInto(r, "metyet-email", EMAIL); submit(r); await flush(r);
    typeInto(r, "metyet-code", OTP); submit(r); await flush(r);
    const whole = JSON.stringify(calls);
    ["partnerId", "collectorId", "\"seat\"", "subject", "\"actor\""].forEach((field) => {
      assert(!whole.includes(field), `a request carried ${field}`);
    });
    /* And the component cannot author one: the words are not in it. */
    const bare = code("client/sign-in/SignIn.jsx");
    /* READING the seat the server sent is the whole point — `describeActor`
       does exactly that. What must not happen is the component MINTING one: a
       literal id or seat assigned anywhere, which is what would let the browser
       decide who it is talking about. */
    assert(!/(partnerId|collectorId|seat)\s*:\s*["'`]/.test(bare),
      "the component assigns a literal seat or id");
    /* Batch 4 moved that reading into client/actor.js, so there is ONE answer
       to "who did the server say you are" rather than one per screen. The
       assertion follows the code rather than being dropped. */
    const identity = code("client/actor.js");
    assert(/actor\[seat\.id\]/.test(identity), "it reads the id under the seat's own field, as the domain writes it");
    assert(!/(partnerId|collectorId)\s*:\s*["'`]/.test(identity), "and mints no id of its own");
    assert(!/state\.actor\s*=|actor\.seat\s*=/.test(bare + identity), "and writes nothing back onto the projection");
    assert(!/from ["'][^"']*domain\/|require\(["'][^"']*domain\//.test(bare), "and imports no domain");
    assert(!/projectForActor|buildCanonicalSeed|createStore|prototypeRuntime/.test(bare),
      "and neither projects nor seeds nor executes");
  });

  test("an actor the server did not name is not given a name here", async () => {
    /* The projection is the only source of who you are. When it names nobody —
       which is what an unprovisioned or unusual answer looks like — the screen
       must say nothing rather than fall back to a plausible id. */
    const nameless = { ...PROJECTION, actor: { seat: "tp" }, partners: [] };
    const { session, store } = wire({ view: { status: 200, body: { version: 2, state: nameless } } });
    const r = render({ session, store });
    typeInto(r, "metyet-email", EMAIL); submit(r); await flush(r);
    typeInto(r, "metyet-code", OTP); submit(r); await flush(r);
    const shown = texts(r);
    assert(!/tp_/.test(shown), "an id was invented: " + shown);
    assert(!shown.includes("Northline"), "and so was a name");
    /* And read directly, so the fallback has nowhere to hide. */
    eq(JSON.stringify(SIGNIN.describeActor(nameless)),
      JSON.stringify({ id: null, name: null, seat: "tp" }), "nothing is substituted for a missing id");
    eq(SIGNIN.describeActor({ actor: null }).id, null, "nor for a missing actor");
    eq(SIGNIN.describeActor({}).seat, null, "nor for a missing projection");
  });

  test("a rejected code does not become an anonymous application request", async () => {
    const { session, store, apiCalls } = wire({ verify: { status: 403, body: { msg: `code ${OTP} invalid` } } });
    const r = render({ session, store });
    typeInto(r, "metyet-email", EMAIL); submit(r); await flush(r);
    typeInto(r, "metyet-code", "00000000"); submit(r); await flush(r);

    eq(apiCalls().length, 0, "the API was never reached");
    eq(session.status(), SESSION.ANONYMOUS, "and there is no session");
    eq(store.get(), null, "and nothing is on the screen that could look like success");
    assert(/That code did not work/.test(texts(r)), texts(r));
    assert(/Code from the email/.test(texts(r)), "and the person can try again");
  });

  test("an API failure is a failure, not stale or synthetic success", async () => {
    const { session, store } = wire({ view: { status: 503, body: { error: { code: "service_unavailable" } } } });
    const r = render({ session, store });
    typeInto(r, "metyet-email", EMAIL); submit(r); await flush(r);
    typeInto(r, "metyet-code", OTP); submit(r); await flush(r);

    eq(store.get(), null, "no projection was invented");
    eq(store.status(), "error");
    const shown = texts(r);
    assert(/could not be reached|did not expect/.test(shown), shown);
    assert(!shown.includes("Northline Cards") && !shown.includes(PARTNER), "and nobody's shop is rendered");
  });

  test("a verified sign-in that is nobody in MetYet says so, and offers no shop", async () => {
    const { session, store } = wire({ view: { status: 403, body: { error: { code: "account_not_provisioned" } } } });
    const r = render({ session, store });
    typeInto(r, "metyet-email", EMAIL); submit(r); await flush(r);
    typeInto(r, "metyet-code", OTP); submit(r); await flush(r);
    const shown = texts(r);
    assert(/not a MetYet account yet/.test(shown), shown);
    assert(/invitation/.test(shown), "and what makes one");
    eq(store.get(), null);
  });

  test("an ended session cannot produce a request that looks anonymous", async () => {
    const { session, store, apiCalls } = wire();
    const r = render({ session, store });
    typeInto(r, "metyet-email", EMAIL); submit(r); await flush(r);
    typeInto(r, "metyet-code", OTP); submit(r); await flush(r);
    const before = apiCalls().length;
    session.clear();
    let threw = null;
    try { await store.load(); } catch (error) { threw = error; }
    eq(threw.failure, API.FAILURES.unauthenticated, "it fails closed");
    eq(apiCalls().length, before, "and nothing left the browser without a token");
  });

  test("Batch 2's renewal behaviour is not regressed by any of this", async () => {
    /* A session that arrives nearly due renews on the way out, and the API call
       carries the renewed token — the property Batch 2 established, asserted
       here through the component's own path. */
    const { session, store, apiCalls, authCalls } = wire({ verify: { status: 200, body: sessionBody(10) } });
    const r = render({ session, store });
    typeInto(r, "metyet-email", EMAIL); submit(r); await flush(r);
    typeInto(r, "metyet-code", OTP); submit(r); await flush(r);
    assert(authCalls().some((c) => c.url.includes("grant_type=refresh_token")), "it renewed");
    eq(apiCalls()[0].headers.authorization, `Bearer ${ACCESS}`, "and the API carried a current token");
  });
});

/* ============================================================== D */
describe("D. no credential is rendered, logged or thrown", () => {
  test("nothing secret reaches the screen, on any of the seven states", async () => {
    const scenarios = [
      {},
      { verify: { status: 403, body: { msg: `the code ${OTP} is wrong`, token: ACCESS } } },
      { view: { status: 401, body: { error: { code: "unauthenticated", detail: ACCESS } } } },
      { view: { status: 500, body: { error: { code: "boom", message: ACCESS } } } },
      { otp: { status: 429, body: {} } },
    ];
    for (const scenario of scenarios) {
      const { session, store } = wire(scenario);
      const r = render({ session, store });
      typeInto(r, "metyet-email", EMAIL); submit(r); await flush(r);
      if (find(r, "input", (n) => n.props.id === "metyet-code")) {
        typeInto(r, "metyet-code", OTP); submit(r); await flush(r);
      }
      const shown = texts(r) + JSON.stringify(r.toJSON());
      [ACCESS, REFRESH, "Bearer "].forEach((secret) => {
        assert(!shown.includes(secret), `"${secret.slice(0, 10)}…" reached the screen`);
      });
      /* And the provider's own words never do either. */
      assert(!/is wrong|boom/.test(shown), "a provider message was rendered: " + shown.slice(0, 200));
    }
  });

  test("the code is cleared after it is submitted, and never re-rendered", async () => {
    const { session, store } = wire({ verify: { status: 403, body: {} } });
    const r = render({ session, store });
    typeInto(r, "metyet-email", EMAIL); submit(r); await flush(r);
    typeInto(r, "metyet-code", OTP); submit(r); await flush(r);
    const input = r.root.findAll((n) => n.type === "input" && n.props.id === "metyet-code")[0];
    eq(input.props.value, "", "a retype is a fresh code, not a re-send of a spent one");
    assert(!JSON.stringify(r.toJSON()).includes(OTP), "and the spent code is not on the screen");
  });

  test("nothing in the production client logs", () => {
    ["client/sign-in/SignIn.jsx", "client/production-config.js", "app-src/main.jsx"].forEach((rel) => {
      assert(!/console\.(log|warn|info|debug)/.test(code(rel)), `${rel} logs`);
    });
  });

  test("a configuration problem shows the names of what is wrong, not the values", () => {
    const entry = code("app-src/main.jsx");
    assert(/error\.problems/.test(entry), "the problem list is what is rendered");
    assert(!/config\.publishableKey\b[^)]*render|render[^)]*publishableKey/.test(entry), "never a value");
  });
});

/* ============================================================== E */
describe("E. the server serves the client, and only the client", () => {
  const { createApp } = require("../server/app.js");
  const RT = require("../domain/metyet-runtime.js");
  const stub = {
    repository: { loadWorld: async () => ({}), readVersion: async () => 1, withTransaction: async (fn) => fn() },
    accounts: { findActiveBySubject: async () => null },
    verifier: { verify: async () => { throw Object.assign(new Error("no"), { reason: "invalid" }); } },
    runtime: RT.systemRuntime(),
  };
  const CLIENT = { page: "<!DOCTYPE html><title>MetYet</title>", script: "console.log(1)" };
  const app = (client) => createApp({ ...stub, client });

  test("a page request becomes the client, and a deep link does too", async () => {
    const a = app(CLIENT);
    for (const url of ["/", "/anything", "/deep/link?x=1"]) {
      const res = await a.inject({ method: "GET", url });
      eq(res.statusCode, 200, url);
      assert(res.headers["content-type"].includes("text/html"), url);
      eq(res.body, CLIENT.page, "the built page, byte for byte");
    }
    const js = await a.inject({ method: "GET", url: "/main.js" });
    eq(js.statusCode, 200);
    assert(js.headers["content-type"].includes("javascript"));
    eq(js.body, CLIENT.script);
  });

  test("an unknown API path stays an API error, and never becomes HTML", async () => {
    const a = app(CLIENT);
    for (const url of ["/api/nope", "/api/", "/api/view/extra"]) {
      const res = await a.inject({ method: "GET", url });
      eq(res.statusCode, 404, url);
      assert(res.headers["content-type"].includes("json"), `${url} answered HTML`);
      assert(!res.body.includes("DOCTYPE"), url);
    }
  });

  test("there is no directory to walk: two names, and nothing else exists", async () => {
    const a = app(CLIENT);
    /* Every one of these is answered with the page, because the page is the
       only thing a non-/main.js path can be. Nothing is read from disk per
       request, so there is no traversal to attempt. */
    for (const url of ["/../server/config.js", "/main.js/../../package.json", "/.env", "/app/main.js"]) {
      const res = await a.inject({ method: "GET", url });
      assert(res.statusCode === 200 || res.statusCode === 400, url);
      if (res.statusCode === 200) assert(res.body === CLIENT.page || res.body === CLIENT.script, `${url} served something else`);
    }
    const bare = code("server/app.js");
    assert(!/readFileSync|createReadStream|path\.join|sendFile/.test(bare),
      "the request path never touches a filesystem");
    /* And app.js does not even have one to reach for: the bootstrap is the
       only place that knows a disk exists. */
    assert(!/require\(["']fs["']\)|require\(["']path["']\)|from ["'](fs|path)["']/.test(bare),
      "server/app.js imports a filesystem module");
  });

  test("a deployment with no built client serves the API alone, as before", async () => {
    const a = app(null);
    const res = await a.inject({ method: "GET", url: "/" });
    eq(res.statusCode, 404);
    assert(res.headers["content-type"].includes("json"), "the old behaviour, unchanged");
  });

  test("serving the client changed no route and no authentication", async () => {
    const a = app(CLIENT);
    /* The API still refuses an unauthenticated request rather than serving a
       page in its place. */
    const view = await a.inject({ method: "GET", url: "/api/view" });
    eq(view.statusCode, 401, "still authenticated");
    assert(view.headers["content-type"].includes("json"));
    const live = await a.inject({ method: "GET", url: "/api/health/live" });
    eq(live.statusCode, 200);
    eq(JSON.parse(live.body).status, "ok");
    /* And a POST to an unknown path is not answered with a page. */
    const post = await a.inject({ method: "POST", url: "/whatever" });
    eq(post.statusCode, 404);
  });

  test("the bootstrap reads the bundle once, at boot, and says whether it found one", () => {
    const boot = code("server/index.js");
    assert(/loadClient/.test(boot), "the bootstrap is the only place that touches a filesystem");
    assert(/clientBundle/.test(boot), "and startup says whether a client is being served");
    assert(/app\.log\.warn/.test(boot), "and warns when there is none, rather than 404-ing silently");
  });
});

/* ============================================================== F */
describe("F. the demo is still a different thing entirely", () => {
  test("the production bundle has no seed, no persona switcher, no domain commands", () => {
    const bundle = esbuild.buildSync({
      entryPoints: [path.join(ROOT, "app-src", "main.jsx")],
      bundle: true, format: "esm", write: false, logLevel: "silent", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"', __METYET_DEV__: "false", __METYET_DEMO__: "false",
        __METYET_API_URL__: '""', __METYET_SUPABASE_URL__: '""', __METYET_SUPABASE_KEY__: '""' },
    }).outputFiles[0].text;
    ["buildCanonicalSeed", "CARDS_SEED", "PARTNERS_SEED", "prototypeRuntime", "projectForActor",
      "Switch persona", "Reset demo", "demoDealFixture"].forEach((needle) => {
      assert(!bundle.includes(needle), `the production bundle contains "${needle}"`);
    });
  });

  test("the demo bundle still has no Supabase, no bearer and no API", () => {
    const bundle = esbuild.buildSync({
      entryPoints: [path.join(ROOT, "site-src", "main.jsx")],
      bundle: true, format: "esm", write: false, logLevel: "silent", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"', __METYET_DEV__: "false", __METYET_DEMO__: "true" },
    }).outputFiles[0].text;
    ["supabase", "auth/v1", "Bearer ", "refresh_token", "/api/view", "/api/commands", "metyet-email"]
      .forEach((needle) => assert(!bundle.includes(needle), `the demo bundle contains "${needle}"`));
  });

  test("the two builds are separate files, to separate places", () => {
    eq(JSON.parse(src("package.json")).scripts["build:app"], "node app.build.mjs");
    eq(JSON.parse(src("package.json")).scripts["build:site"], "node site.build.mjs");
    eq((src("site.build.mjs").match(/const DOMAIN = "([^"]+)"/) || [])[1], "demo.metyet.io");
    eq((src("app.build.mjs").match(/const OUT = "([^"]+)"/) || [])[1], "app");
    eq((src("site.build.mjs").match(/const OUT = "([^"]+)"/) || [])[1], "site");
    /* Neither build output is committed: each carries one deployment's
       configuration and must not be mistaken for another's. */
    const ignored = src(".gitignore").split("\n").map((l) => l.trim());
    assert(ignored.includes("app/") && ignored.includes("site/"), "neither build output is committed");
  });

  test("nothing in the demo path reaches the production client, or the reverse", () => {
    ["shell/MetYetPrototype.jsx", "src/MetYet.jsx", "collector/MetYetCollector.jsx", "site-src/main.jsx"]
      .forEach((rel) => assert(!/client\/|app-src/.test(code(rel)), `${rel} reaches production`));
    ["client/sign-in/SignIn.jsx", "app-src/main.jsx"].forEach((rel) => {
      assert(!/MetYetPrototype|MetYetCollector|demo-flag|dev-flag|site-src/.test(code(rel)),
        `${rel} reaches the demo`);
      assert(!/src\/MetYet/.test(code(rel)), `${rel} imports the prototype`);
    });
  });

  test("no new dependency, and no React beyond what was already here", () => {
    const pkg = JSON.parse(src("package.json"));
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    assert(!Object.keys(all).some((d) => /supabase|axios|swr|react-query|tanstack|router/.test(d)),
      "no client library was added");
    assert(all.react && all["react-dom"], "React was already a dependency");
  });
});

run();
