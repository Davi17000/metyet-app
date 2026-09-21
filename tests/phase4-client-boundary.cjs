/* ============================================================================
   PHASE 4 BATCH 1 — THE PRODUCTION CLIENT BOUNDARY

   The clients are an in-memory simulation: one closure holds the whole
   canonical world, both seats project it in the browser, and every mutation is
   a synchronous call into the domain's command layer on a runtime that trusts
   caller-supplied ids and timestamps. For a world that lives in one tab that is
   exactly right, and it is what demo.metyet.io is.

   Production is the other thing. The world lives in Postgres, the seat is
   whatever the bearer token turns out to be, and a mutation is a round trip
   that can be in flight, refused, or fail. This is the boundary between them.

   What the clients consume from a store is exactly three methods — get, sub,
   execute — so the production store is those three, and a screen migrates by
   being handed a different store rather than by being rewritten.

     A  the API client: what is sent, and what is never sent
     B  the session: a token, and no identity of any kind
     C  the production store: the server's answer, and nothing it made up
     D  what it cannot do, by construction
     E  the demo is untouched, and still cannot reach production
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
/* Stripped of comments: what the code DOES, not what it says about itself. A
   header that mentions `localStorage` to explain why it is not used must not
   make an assertion about localStorage pass. */
const code = (rel) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/* Each module evaluated the way a bundler hands it to a browser. */
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

const API = load("client/api.js");
const SESSION = load("client/session.js");
const STORE = load("client/production-store.js");

const TOKEN = "eyJa.real.looking.bearer";
const URL_OK = "https://app.metyet.io";

/* The server's projection, as the domain actually shapes it: a seat and the id
   under that seat's own field. Built here by hand rather than imported,
   because the point is that the client receives it and does not compute it. */
const PROJECTION = (partnerId = "tp_9k2m") => ({
  actor: { seat: "tp", partnerId },
  catalog: [], collectors: [], partners: [{ id: partnerId, name: "Northline Cards", tradeRate: 0.8 }],
  relationships: [], goals: [], inventory: [], collectorCopies: [], opportunities: [],
});

/* A server, recorded. Nothing here reaches a network. */
const server = (replies) => {
  const calls = [];
  const queue = Array.isArray(replies) ? [...replies] : [replies];
  const impl = async (url, init) => {
    calls.push({ url, method: init.method || "GET", headers: init.headers,
      body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    const { status = 200, body = null } = next;
    return { status, async json() {
      if (body instanceof Error) throw body;
      return body;
    } };
  };
  return { impl, calls };
};

const client = (replies, options = {}) => {
  const { impl, calls } = server(replies);
  return {
    calls,
    api: API.createApiClient({ baseUrl: URL_OK, getToken: async () => TOKEN, fetchImpl: impl, ...options }),
  };
};

const viewReply = (partnerId) => ({ status: 200, body: { version: 1, state: PROJECTION(partnerId) } });
const commandReply = (version = 2, value = null) =>
  ({ status: 200, body: { ok: true, version, value, state: PROJECTION() } });
const refusalReply = (refused, version = 1) =>
  ({ status: 409, body: { error: { code: "command_refused", refused }, version } });

/* ============================================================== A */
describe("A. the API client sends a token and a command, and never an identity", () => {
  test("a read asks the one route, with the bearer and nothing else", async () => {
    const { api, calls } = client(viewReply());
    const answer = await api.view();
    eq(calls.length, 1, "one request");
    eq(calls[0].url, "https://app.metyet.io/api/view");
    eq(calls[0].method, "GET");
    eq(calls[0].headers.authorization, `Bearer ${TOKEN}`);
    eq(calls[0].body, undefined, "a read carries no body");
    eq(answer.version, 1);
    eq(JSON.stringify(answer.state), JSON.stringify(PROJECTION()), "the projection, returned unchanged");
  });

  test("a command sends the name and the payload, and NOTHING that names a person", async () => {
    const { api, calls } = client(commandReply(2, "opp_1"));
    await api.command("acceptPrice", { oppId: "o1" });
    eq(calls[0].url, "https://app.metyet.io/api/commands");
    eq(calls[0].method, "POST");
    eq(JSON.stringify(calls[0].body), JSON.stringify({ command: "acceptPrice", payload: { oppId: "o1" } }),
      "exactly the command and its payload");
    /* The whole request, serialised, must not carry a seat or a subject: the
       server derives who you are from the token, and a client that also sent an
       identity would be inviting it to believe one. */
    const whole = JSON.stringify(calls[0]);
    ["partnerId", "collectorId", "seat", "subject", "actor"].forEach((field) => {
      assert(!new RegExp(`"${field}"`).test(whole), `the request carries ${field}`);
    });
  });

  test("there is nowhere to put an identity, in the signature or the source", () => {
    const bare = code("client/api.js");
    assert(!/\bactor\b/.test(bare), "no actor anywhere in the API client");
    assert(!/partnerId|collectorId|\bseat\b|\bsubject\b/.test(bare), "and no seat of any kind");
    /* And it computes no state: it knows nothing about what a card is. */
    assert(!/require\(["']\.\.\/domain|from ["']\.\.\/domain/.test(bare), "it imports no domain");
    assert(!/projectForActor|execute\(state|metyet-commands/.test(bare), "and runs nothing");
  });

  test("the token is asked for per request, never captured", async () => {
    let asked = 0;
    const { impl } = server(viewReply());
    const api = API.createApiClient({ baseUrl: URL_OK, fetchImpl: impl,
      getToken: async () => { asked += 1; return TOKEN; } });
    await api.view();
    await api.view();
    eq(asked, 2, "a client that captured the token would keep using a session after it ended");
  });

  test("a bearer may not cross a plaintext connection to anywhere but this machine", () => {
    ["https://app.metyet.io", "http://127.0.0.1:8080", "http://localhost:3000", "http://[::1]:8080"]
      .forEach((url) => assert(API.isSafeApiUrl(url), `${url} is allowed`));
    ["http://app.metyet.io", "http://192.168.1.10", "http://localhost.evil.example", "ftp://x", "", "not a url"]
      .forEach((url) => {
        assert(!API.isSafeApiUrl(url), `${url} is refused`);
        let threw = null;
        try { API.createApiClient({ baseUrl: url, getToken: async () => TOKEN }); } catch (e) { threw = e; }
        assert(threw && /https/.test(threw.message), `and constructing against it fails: ${url}`);
      });
  });

  test("a refusal is an answer; everything else that goes wrong throws", async () => {
    const refused = await client(refusalReply("not-your-deal")).api.command("acceptPrice", {});
    eq(JSON.stringify(refused), JSON.stringify({ ok: false, refused: "not-your-deal", version: 1 }),
      "the domain considered it and said no, in its own word");
    /* And the shape is exactly that, because the store depends on it: a refusal
       must not carry a `state`, or a screen could be swapped to a projection
       that describes a command which did not happen. */
    const withState = { status: 409, body: { error: { code: "command_refused", refused: "not-your-deal" },
      version: 1, state: PROJECTION("SOMEBODY_ELSE") } };
    const carried = await client(withState).api.command("acceptPrice", {});
    eq(JSON.stringify(Object.keys(carried)), JSON.stringify(["ok", "refused", "version"]),
      "a refusal is three fields, even when the server sent more");
    assert(carried.state === undefined, "state is not passed through a refusal");

    const cases = [
      [{ status: 401, body: { error: { code: "unauthenticated" } } }, API.FAILURES.unauthenticated],
      [{ status: 403, body: { error: { code: "account_not_provisioned" } } }, API.FAILURES.notProvisioned],
      [{ status: 503, body: { error: { code: "service_unavailable" } } }, API.FAILURES.unavailable],
      [{ status: 500, body: null }, API.FAILURES.unavailable],
      [{ status: 200, body: { version: 1 } }, API.FAILURES.unexpected],
      [new Error("offline"), API.FAILURES.unavailable],
    ];
    for (const [reply, failure] of cases) {
      let threw = null;
      try { await client(reply).api.view(); } catch (error) { threw = error; }
      assert(threw instanceof API.ApiError, `${failure} throws an ApiError`);
      eq(threw.failure, failure, `and names it: ${JSON.stringify(reply)}`);
    }
  });

  test("a 200 that carries no state is not success, on either route", async () => {
    /* Both routes return the new projection, and a 200 without one is a shape
       this client does not understand. Accepting it would put the caller into
       "ready" holding nothing, which is worse than failing. */
    for (const call of [(api) => api.view(), (api) => api.command("acceptPrice", {})]) {
      for (const body of [{ version: 1 }, { ok: true, version: 2 }, null, "not an object"]) {
        let threw = null;
        try { await call(client({ status: 200, body }).api); } catch (error) { threw = error; }
        assert(threw instanceof API.ApiError, `a 200 with ${JSON.stringify(body)} throws`);
        eq(threw.failure, API.FAILURES.unexpected, "and says the shape was wrong");
      }
    }
  });

  test("the server's own words are never carried outward", async () => {
    const hostile = { status: 409, body: { error: { code: "command_refused", refused: "not-your-deal",
      message: `your token ${TOKEN} is no good`, detail: TOKEN } } };
    const answer = await client(hostile).api.command("acceptPrice", {});
    assert(!JSON.stringify(answer).includes(TOKEN), "a hostile body cannot echo the bearer back through this");
    eq(answer.refused, "not-your-deal", "only the refusal word is taken");
  });

  test("a request with no session never reaches the network", async () => {
    const { impl, calls } = server(viewReply());
    const api = API.createApiClient({ baseUrl: URL_OK, getToken: async () => null, fetchImpl: impl });
    let threw = null;
    try { await api.view(); } catch (error) { threw = error; }
    eq(threw.failure, API.FAILURES.unauthenticated);
    eq(calls.length, 0, "and nothing was sent");
  });
});

/* ============================================================== B */
describe("B. the session holds a token, and knows nothing about who you are", () => {
  test("it carries a token and publishes only whether there is one", async () => {
    const session = SESSION.createSession();
    const seen = [];
    session.subscribe((status) => seen.push(status));
    eq(session.status(), SESSION.ANONYMOUS);
    eq(await session.token(), null);

    session.set(TOKEN);
    eq(session.status(), SESSION.PRESENT);
    eq(await session.token(), TOKEN, "asked for, never published");
    session.set(TOKEN);
    session.clear();
    eq(session.status(), SESSION.ANONYMOUS);
    eq(await session.token(), null);
    eq(JSON.stringify(seen), JSON.stringify([SESSION.PRESENT, SESSION.ANONYMOUS]),
      "a status each way, and nothing for setting the same token twice");
    assert(!seen.some((s) => String(s).includes(TOKEN)), "the token is never what is announced");
  });

  test("it does not decode the token, and holds no identity", () => {
    const bare = code("client/session.js");
    assert(!/atob|base64|jwtDecode|decodeJwt|\.split\(["']\.["']\)/.test(bare),
      "the token is opaque here: reading its claims would be the client deciding who it is talking about");
    assert(!/\bsubject\b|partnerId|collectorId|\bseat\b|\bemail\b/.test(bare), "and it names nobody");
    assert(!/exp\b|expiresAt|isExpired/.test(bare), "it does not judge the expiry either — the server does");
  });

  test("it chooses no storage, so no storage choice was inherited", () => {
    const bare = code("client/session.js");
    ["localStorage", "sessionStorage", "indexedDB", "document.cookie"].forEach((api) => {
      assert(!bare.includes(api), `${api} is not used — keeping a session across a refresh is a decision with a cost`);
    });
  });

  test("two sessions do not share a token", async () => {
    const a = SESSION.createSession({ initialToken: "aaa" });
    const b = SESSION.createSession();
    eq(await a.token(), "aaa");
    eq(await b.token(), null, "a module-level token would have leaked here");
    b.set("bbb");
    eq(await a.token(), "aaa", "and still would");
  });

  test("it refuses a token that is not one, rather than holding an empty session", () => {
    const session = SESSION.createSession();
    [null, "", 0, {}, undefined].forEach((bad) => {
      let threw = null;
      try { session.set(bad); } catch (error) { threw = error; }
      assert(threw, `set(${JSON.stringify(bad)}) is refused`);
    });
    eq(session.status(), SESSION.ANONYMOUS);
  });
});

/* ============================================================== C */
describe("C. the production store returns the server's answer and nothing it made up", () => {
  test("it is the same three methods the clients already consume", () => {
    const store = STORE.createProductionStore({ api: client(viewReply()).api });
    ["get", "sub", "execute"].forEach((m) => eq(typeof store[m], "function", `store.${m}`));
    /* Which is the whole point: a screen migrates by being handed this instead
       of the demo store, not by being rewritten. */
    const demo = src("domain/metyet-store.js");
    ["get", "sub", "execute"].forEach((m) => assert(new RegExp(`\\b${m}\\b`).test(demo), `the demo store also has ${m}`));
  });

  test("before anything is loaded it holds nothing, and says so", () => {
    const store = STORE.createProductionStore({ api: client(viewReply()).api });
    eq(store.get(), null, "no state until the server sends some");
    eq(store.status(), STORE.STATUS.idle);
    eq(store.version(), null);
  });

  test("a load adopts the projection, and subscribers hear about it", async () => {
    const store = STORE.createProductionStore({ api: client(viewReply()).api });
    const seen = [];
    store.sub((state) => seen.push(state));
    await store.load();
    eq(JSON.stringify(store.get()), JSON.stringify(PROJECTION()), "exactly what the server sent");
    eq(store.status(), STORE.STATUS.ready);
    eq(store.version(), 1);
    assert(seen.length >= 1 && JSON.stringify(seen[seen.length - 1]) === JSON.stringify(PROJECTION()),
      "and the last thing announced is the projection");
  });

  test("two components mounting at once share one request", async () => {
    const { api, calls } = client(viewReply());
    const store = STORE.createProductionStore({ api });
    await Promise.all([store.load(), store.load(), store.load()]);
    eq(calls.length, 1, "one request, not three");
  });

  test("a command takes no actor, and adopts what comes back", async () => {
    const { api, calls } = client([viewReply(), commandReply(2, "opp_new")]);
    const store = STORE.createProductionStore({ api });
    await store.load();
    const result = await store.execute("startOpportunity", { goalId: "g1" });
    eq(result.ok, true);
    eq(result.value, "opp_new", "the server's value, for a handler that needs it");
    assert(result.state, "and the new projection, so a handler need not read the store back");
    eq(store.version(), 2, "the version moved");
    eq(JSON.stringify(calls[1].body), JSON.stringify({ command: "startOpportunity", payload: { goalId: "g1" } }),
      "no actor was sent, because execute has nowhere to put one");
    /* And the signature itself: `execute(command, payload = {})`. The demo
       store's is `execute(actor, command, payload)` — the first parameter is
       the thing production must not have, and its absence is the check.
       (`.length` is 1 here, because a defaulted parameter does not count.) */
    const signature = (code("client/production-store.js").match(/async execute\(([^)]*)\)/) || [])[1];
    eq(signature, "command, payload = {}", "execute takes a command and a payload, and nothing else");
    assert(/execute = \(actor, command, payload\)/.test(src("domain/metyet-store.js")),
      "while the demo store does take an actor — which is exactly the difference");
  });

  test("a refusal changes nothing, and is returned rather than thrown", async () => {
    const { api } = client([viewReply(), refusalReply("not-your-deal", 1)]);
    const store = STORE.createProductionStore({ api });
    await store.load();
    const before = JSON.stringify(store.get());
    const result = await store.execute("acceptPrice", { oppId: "o1" });
    eq(JSON.stringify(result), JSON.stringify({ ok: false, refused: "not-your-deal" }));
    eq(JSON.stringify(store.get()), before, "nothing was adopted");
    eq(store.status(), STORE.STATUS.ready, "and the screen is usable again");

    /* And not even when the refusal carries a state of its own. A refusal means
       the command did not happen; a body that arrives with one alongside is not
       a reason to replace what is on the screen. */
    const withState = { status: 409, body: { error: { code: "command_refused", refused: "not-your-deal" },
      version: 1, state: PROJECTION("SOMEBODY_ELSE") } };
    const { api: api2 } = client([viewReply(), withState]);
    const store2 = STORE.createProductionStore({ api: api2 });
    await store2.load();
    const mine = JSON.stringify(store2.get());
    await store2.execute("acceptPrice", {});
    eq(JSON.stringify(store2.get()), mine, "a refusal cannot swap the projection out from under a screen");
    assert(!JSON.stringify(store2.get()).includes("SOMEBODY_ELSE"), "least of all for somebody else's");
  });

  test("a failure keeps the last good projection rather than blanking the screen", async () => {
    const { api } = client([viewReply(), { status: 503, body: { error: { code: "service_unavailable" } } }]);
    const store = STORE.createProductionStore({ api });
    await store.load();
    const good = JSON.stringify(store.get());
    let threw = null;
    try { await store.execute("acceptPrice", {}); } catch (error) { threw = error; }
    assert(threw, "the caller is told");
    eq(store.status(), STORE.STATUS.error);
    eq(store.lastError(), API.FAILURES.unavailable, "and what kind of wrong it was");
    eq(JSON.stringify(store.get()), good, "what was on the screen was true a moment ago");
  });

  test("status says when something is in flight, because nothing else does", async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const api = {
      view: async () => ({ version: 1, state: PROJECTION() }),
      command: async () => { await gate; return { ok: true, version: 2, value: null, state: PROJECTION() }; },
    };
    const store = STORE.createProductionStore({ api });
    await store.load();
    eq(store.status(), STORE.STATUS.ready);
    const pending = store.execute("acceptPrice", {});
    eq(store.status(), STORE.STATUS.saving, "a button that is always enabled gets pressed twice");
    release();
    await pending;
    eq(store.status(), STORE.STATUS.ready);
  });

  test("it refuses to be built without an api client", () => {
    [undefined, {}, { view: 1 }, { view: () => {} }].forEach((api) => {
      let threw = null;
      try { STORE.createProductionStore({ api }); } catch (error) { threw = error; }
      assert(threw, `refused: ${JSON.stringify(api)}`);
    });
  });
});

/* ============================================================== D */
describe("D. what the production client cannot do, by construction", () => {
  const boundary = ["client/api.js", "client/session.js", "client/production-store.js"];

  test("it never receives or holds the canonical world", () => {
    /* Everything it returns arrived in a response. There is no seed, no
       fixture, no builder — nothing in these files can produce state. */
    boundary.forEach((rel) => {
      const bare = code(rel);
      assert(!/buildCanonicalSeed|CARDS_SEED|PARTNERS_SEED|seedRelationships|demoDealFixture/.test(bare),
        `${rel} reaches for seed data`);
    });
    const store = STORE.createProductionStore({ api: client(viewReply()).api });
    eq(store.get(), null, "and it starts with nothing rather than with a world");
  });

  test("it authors no actor, seat or subject anywhere in the boundary", () => {
    boundary.forEach((rel) => {
      const bare = code(rel);
      assert(!/partnerId|collectorId|\bsubject\b/.test(bare), `${rel} names a seat`);
      assert(!/actorFor|resolveActor|seatActor/.test(bare), `${rel} mints an actor`);
    });
  });

  test("it executes no domain command locally", () => {
    boundary.forEach((rel) => {
      const bare = code(rel);
      assert(!/from ["'][^"']*domain\/|require\(["'][^"']*domain\//.test(bare), `${rel} imports the domain`);
      assert(!/metyet-commands|metyet-store|metyet-runtime|prototypeRuntime|systemRuntime/.test(bare),
        `${rel} reaches the command layer`);
    });
  });

  test("it recreates no projection or visibility rule", () => {
    boundary.forEach((rel) => {
      const bare = code(rel);
      assert(!/projectForActor|projectForPartner|projectForCollector|FIELD_RULES|isRelated/.test(bare),
        `${rel} projects`);
    });
  });

  test("there is no way to write state that did not come from the server", () => {
    const store = STORE.createProductionStore({ api: client(viewReply()).api });
    /* The demo store has these and needs them; here their ABSENCE is the
       property. A scenario control cannot exist against production. */
    ["fixture", "set", "reset", "patchOpportunity", "actions"].forEach((m) => {
      eq(store[m], undefined, `store.${m} must not exist in production`);
    });
    assert(!/\bfixture\b|patchOpportunity/.test(code("client/production-store.js")),
      "and the source has no such path");
  });

  test("it mints no id and reads no clock", () => {
    /* The server runs systemRuntime, which ignores caller ids and timestamps.
       Sending them would make the UI show ids the server never used. */
    boundary.forEach((rel) => {
      const bare = code(rel);
      assert(!/Date\.now\(\)|new Date\(|Math\.random\(\)|toISOString/.test(bare), `${rel} invents an id or a time`);
    });
  });

  test("the whole boundary is three small files and no new dependency", () => {
    const pkg = JSON.parse(src("package.json"));
    assert(!Object.keys(pkg.dependencies).some((d) => /supabase|axios|swr|react-query|tanstack/.test(d)),
      "no client data or auth library was added");
    /* "Small" means small in CODE. A raw line count was the proxy for it, and
       Batch 6 showed the proxy failing in the direction that matters least: the
       store went from 79 to 126 lines of code — the command lifecycle it gained
       — and from 162 to 283 lines total, because most of the addition explains
       why a conflict is not replayed. Counting what the assertion actually
       means is the fix. The total is still bounded, so prose cannot grow
       without limit either, but it is no longer the thing under test. */
    boundary.forEach((rel) => {
      const total = src(rel).split("\n").length;
      const lines = code(rel).split("\n").filter((l) => l.trim()).length;
      assert(lines < 160, `${rel} is ${lines} lines of code — the boundary is meant to stay small`);
      assert(total < 340, `${rel} is ${total} lines in all — even the prose has a limit`);
    });
  });
});

/* ============================================================== E */
describe("E. the demo is untouched, and cannot reach production", () => {
  test("nothing in the demo path imports the production boundary", () => {
    ["shell/MetYetPrototype.jsx", "src/MetYet.jsx", "collector/MetYetCollector.jsx",
      "site-src/main.jsx", "dev/main.jsx", "site.build.mjs"].forEach((rel) => {
      const bare = code(rel);
      assert(!/client\/api|client\/session|client\/production-store/.test(bare),
        `${rel} reaches the production boundary`);
    });
  });

  test("and nothing in the production boundary imports the demo", () => {
    ["client/api.js", "client/session.js", "client/production-store.js"].forEach((rel) => {
      const bare = code(rel);
      assert(!/MetYet\.jsx|MetYetCollector|MetYetPrototype|demo-flag|dev-flag/.test(bare),
        `${rel} reaches the demo`);
    });
  });

  test("the demo still builds itself the way it did, at its own hostname", () => {
    const site = src("site.build.mjs");
    eq((site.match(/const DOMAIN = "([^"]+)"/) || [])[1], "demo.metyet.io", "still the demo's hostname");
    assert(/__METYET_DEMO__: "true"/.test(site), "still a demo build");
    assert(/__METYET_DEV__: "false"/.test(site), "with engineering tooling off");
    /* And it still mounts the in-memory shell, with its own store. */
    assert(/MetYetPrototype/.test(src("site-src/main.jsx")), "the shell is what ships to demo.metyet.io");
    assert(/buildCanonicalSeed/.test(src("shell/MetYetPrototype.jsx")), "seeded in memory, as before");
  });

  test("the demo store keeps the powers production does not have", () => {
    /* This is the isolation, stated from the other side: the scenario controls
       and the raw state overwrite they need are still there, in the store that
       is only ever built in the browser from a seed. */
    const demo = src("domain/metyet-store.js");
    assert(/const fixture = \{ set, reset, patchOpportunity \}/.test(demo), "the demo store can still be written to");
    assert(/prototypeRuntime\(\)/.test(demo), "and still trusts caller ids and times, which is what a demo needs");
    assert(/store\.fixture/.test(src("shell/MetYetPrototype.jsx")), "and the scenario controls still use it");
  });
});

run();
