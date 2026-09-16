/* ============================================================================
   PHASE 4 BATCH 6 — THE AUTHENTICATED CLIENT COMMAND BOUNDARY

   Batches 1–5 built a client that can read. This is the one that can ask for
   something to happen, and these tests are about the six ways a mutation
   boundary lies:

     by deciding who is asking,
     by showing the answer before the server has given one,
     by turning "no" into "yes",
     by turning "the world moved" into "yes",
     by sending the same mutation twice,
     and by throwing away a good projection because a command failed.

   Everything below drives the REAL modules — the real api client, the real
   production store, and for the round trip, the REAL FASTIFY SERVER with the
   real domain and an in-memory repository. A test that invents a server proves
   the invention works. The server half is the same harness `phase3-server.cjs`
   uses, so the contract under test is the contract that ships.

     A  the contract, against the real server
     B  identity is the token's, and cannot be smuggled
     C  pending: the projection does not move before the answer does
     D  refusal, auth failure and network failure
     E  conflict: not success, not replayed, recovered by re-reading
     F  one command at a time
     G  import boundary, and the demo
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
    bundle: true, format: "cjs", write: false, logLevel: "silent", jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};

const API = load("client/api.js");
const STORE = load("client/production-store.js");

const BASE = "https://app.metyet.io";
const TOKEN = "eyJreal.access.token";

/* ------------------------------------------------------------ a recorder

   One fetch, one script of replies. Every request it saw is kept, because half
   of what this file proves is about what was SENT. */
function recorder(replies) {
  const calls = [];
  const queue = [...replies];
  const impl = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", headers: init.headers || {},
      body: init.body ? JSON.parse(init.body) : undefined });
    const reply = queue.length > 1 ? queue.shift() : queue[0];
    if (reply instanceof Error) throw reply;
    return { status: reply.status, async json() {
      if (reply.body instanceof Error) throw reply.body;
      return reply.body;
    } };
  };
  return { calls, impl };
}

const PROJECTION = (partner = "Northline Cards", extra = {}) => ({
  actor: { seat: "tp", partnerId: "p-9k2m" },
  partners: [{ id: "p-9k2m", name: partner }],
  collectors: [], inventory: [], opportunities: [], goals: [], catalog: [],
  ...extra,
});

const viewReply = (version = 1, partner = "Northline Cards") =>
  ({ status: 200, body: { version, state: PROJECTION(partner) } });
const okReply = (version = 2, partner = "Northline Cards", value = null) =>
  ({ status: 200, body: { ok: true, version, value, state: PROJECTION(partner) } });
const refusalReply = (refused, version = 1) =>
  ({ status: 409, body: { error: { code: "command_refused", message: "no", refused, requestId: "r1" }, version } });
/* The server's own conflict body: a 409 with NO `refused`, exactly as
   server/errors.js builds it from a persistence version conflict. */
const conflictReply = () =>
  ({ status: 409, body: { error: { code: "state_changed", message: "Something else changed first. Try again.", requestId: "r2" } } });
const authReply = () =>
  ({ status: 401, body: { error: { code: "unauthenticated", message: "Sign in to continue.", requestId: "r3" } } });

const wired = (replies, { token = TOKEN } = {}) => {
  const { calls, impl } = recorder(replies);
  const api = API.createApiClient({ baseUrl: BASE, getToken: async () => token, fetchImpl: impl });
  const store = STORE.createProductionStore({ api });
  return { calls, api, store };
};

const caught = async (fn) => {
  try { await fn(); return null; } catch (error) { return error; }
};

/* ============================================================== A */
describe("A. the contract, against the real server", () => {
  /* The same in-memory harness phase3-server.cjs uses. If this file drifts from
     the shipped contract, it drifts here first and loudly. */
  const serverHarness = () => {
    const { createApp } = require(path.join(ROOT, "server", "app.js"));
    return createApp;
  };

  test("client/api.js and the server agree about the command body", () => {
    const server = code("server/app.js");
    const keys = (server.match(/const BODY_KEYS = \[([^\]]+)\]/) || [])[1];
    eq(keys.replace(/[\s"']/g, ""), "command,payload", "the server takes exactly two fields");
    /* And the client sends exactly those two. */
    const client = code("client/api.js");
    assert(/body:\s*\{\s*command,\s*payload\s*\}/.test(client),
      "the client sends something other than { command, payload }");
  });

  test("every field the server forbids in a payload is one the client cannot send", () => {
    const forbidden = (code("server/app.js").match(/FORBIDDEN_PAYLOAD_KEYS = \[([^\]]+)\]/) || [])[1]
      .split(",").map((s) => s.replace(/[\s"']/g, "")).filter(Boolean);
    assert(forbidden.includes("actor") && forbidden.includes("seat") && forbidden.includes("subject"),
      "the server's forbidden list is not what this test assumed: " + forbidden.join(","));
    /* The client has no parameter to put any of them in: `command(name, payload)`
       and a token. Anything in `payload` is the caller's, and the server
       rejects these outright — proven end to end in B. */
    const signature = (code("client/api.js").match(/async command\(([^)]*)\)/) || [])[1];
    eq(signature.replace(/\s/g, ""), "command,payload={}", "api.command takes a name and a payload only");
  });

  test("the conflict code the client branches on is the code the server sends", () => {
    assert(/state_changed:\s*\{\s*status:\s*409/.test(code("server/errors.js")),
      "the server's state_changed is not a 409");
    assert(/versionConflict\]:\s*"state_changed"/.test(code("server/errors.js")),
      "a persistence version conflict no longer becomes state_changed");
    assert(/status === 409 && code === "state_changed"/.test(code("client/api.js")),
      "the client does not recognise the server's conflict code");
    /* And the server never puts `refused` on it, which is why the client cannot
       find a conflict by looking for a refusal. */
    assert(/\.\.\.\(error\.refused !== undefined \? \{ refused: error\.refused \} : \{\}\)/.test(code("server/errors.js")),
      "the error body no longer gates `refused`");
  });

  test("a real round trip through the real server returns the server's projection", async () => {
    const createApp = serverHarness();
    const harness = require("./helpers/command-server.cjs");
    const { app, close } = await harness.serve(createApp);
    try {
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => harness.TOKEN,
        fetchImpl: harness.fetchFor(app) });
      const store = STORE.createProductionStore({ api });
      await store.load();
      const before = JSON.stringify(store.get());
      assert(store.get().actor, "the server named an actor");

      const result = await store.execute(harness.COMMAND, harness.PAYLOAD);
      assert(result.ok, "the real server refused: " + JSON.stringify(result));
      assert(JSON.stringify(store.get()) !== before, "the projection did not move");
      eq(JSON.stringify(store.get()), JSON.stringify(result.state),
        "the store holds exactly what the server returned");
      assert(typeof result.version === "number", "and the server's version");
      eq(store.status(), STORE.STATUS.ready);
    } finally { await close(); }
  });

  test("the real server rejects a payload that tries to carry authority", async () => {
    const createApp = serverHarness();
    const harness = require("./helpers/command-server.cjs");
    const { app, close } = await harness.serve(createApp);
    try {
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => harness.TOKEN,
        fetchImpl: harness.fetchFor(app) });
      for (const key of ["actor", "seat", "subject", "partnerId2"]) {
        const payload = { ...harness.PAYLOAD, [key]: "p-somebody-else" };
        const error = await caught(() => api.command(harness.COMMAND, payload));
        if (key === "partnerId2") continue;               // not on the forbidden list; the domain ignores it
        assert(error, `the server accepted a payload carrying "${key}"`);
        eq(error.status, 400, `"${key}" was not a 400`);
      }
    } finally { await close(); }
  });
});

/* ============================================================== B */
describe("B. identity is the token's, and cannot be smuggled", () => {
  test("nothing but the bearer and the command's own payload is sent", async () => {
    const { calls, store } = wired([viewReply(), okReply()]);
    await store.load();
    await store.execute("acceptPrice", { oppId: "o1" });
    const post = calls.find((c) => c.method === "POST");
    eq(post.url, `${BASE}/api/commands`);
    eq(post.headers.authorization, `Bearer ${TOKEN}`);
    eq(JSON.stringify(post.body), JSON.stringify({ command: "acceptPrice", payload: { oppId: "o1" } }),
      "something other than the command and its payload was sent");
    const whole = JSON.stringify(calls);
    ["\"actor\"", "\"seat\"", "\"partnerId\"", "\"collectorId\"", "\"subject\"", "\"role\"", "\"accountId\""]
      .forEach((field) => assert(!whole.includes(field), `a request carried ${field}`));
  });

  test("there is nowhere in the client to put an acting identity", () => {
    for (const rel of ["client/api.js", "client/production-store.js"]) {
      const bare = code(rel);
      assert(!/(actor|seat|partnerId|collectorId|subject|role)\s*[:=]\s*["'`]/.test(bare),
        `${rel} assigns a literal identity`);
      assert(!/localStorage|sessionStorage|document\.cookie|location\.(search|hash|pathname)/.test(bare),
        `${rel} reads identity from storage or the URL`);
    }
    /* `execute(command, payload = {})` — the demo store's first parameter is an
       actor, and this one has no such parameter at all. */
    const signature = (code("client/production-store.js").match(/async execute\(([^)]*)\)/) || [])[1];
    eq(signature, "command, payload = {}", "execute grew somewhere to put an identity");
  });

  test("a caller that smuggles identity into the payload does not become authority", async () => {
    /* The client will pass a payload through — it is the caller's data and this
       module does not inspect it. What matters is that it is PAYLOAD, in the
       payload field, where the server's own guard rejects it (proven in A), and
       that the client never promotes it to a header, a query or a body field. */
    const { calls, store } = wired([viewReply(), okReply()]);
    await store.load();
    await store.execute("acceptPrice", { actorIdea: "p-somebody-else" });
    const post = calls.find((c) => c.method === "POST");
    eq(Object.keys(post.body).sort().join(","), "command,payload", "a third field appeared in the body");
    eq(post.headers.authorization, `Bearer ${TOKEN}`, "the bearer was replaced");
    assert(!String(post.url).includes("p-somebody-else"), "identity reached the URL");
  });

  test("the store adopts what the SERVER returned, not what was asked for", async () => {
    /* The server answers with a projection for somebody the caller never named.
       The store's job is to believe the server, not to reconcile. */
    const { store } = wired([viewReply(1, "Northline Cards"), okReply(2, "Whoever The Server Says")]);
    await store.load();
    const result = await store.execute("acceptPrice", {});
    eq(store.get().partners[0].name, "Whoever The Server Says");
    eq(JSON.stringify(store.get()), JSON.stringify(result.state));
  });
});

/* ============================================================== C */
describe("C. pending — the projection does not move before the answer does", () => {
  test("while a command is in flight the prior projection is untouched", async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const { impl, calls } = recorder([viewReply(1, "Before")]);
    const api = {
      view: async () => { await impl(`${BASE}/api/view`); return { version: 1, state: PROJECTION("Before") }; },
      command: async () => { await gate; return { ok: true, version: 2, value: null, state: PROJECTION("After") }; },
    };
    const store = STORE.createProductionStore({ api });
    await store.load();
    const before = JSON.stringify(store.get());

    const seen = [];
    store.sub((next) => seen.push(JSON.stringify(next)));
    const pending = store.execute("acceptPrice", {});

    eq(store.status(), STORE.STATUS.saving, "the status does not say a command is in flight");
    eq(store.pending(), "acceptPrice", "and does not name it");
    eq(JSON.stringify(store.get()), before, "the projection moved before the server answered");
    assert(seen.every((s) => s === before), "a subscriber was told about a change that had not happened");
    assert(!JSON.stringify(store.get()).includes("After"), "the answer appeared before it arrived");

    release();
    await pending;
    eq(store.get().partners[0].name, "After", "and then the server's answer");
    eq(store.status(), STORE.STATUS.ready);
    eq(store.pending(), null);
    eq(calls.length, 1);
  });

  test("success is the server's projection, never a local prediction", async () => {
    /* The payload asks for one thing and the server answers with another. A
       store that predicted would show the request; this one shows the answer. */
    const { store } = wired([viewReply(1, "Before"), okReply(9, "What The Server Actually Did", { id: "x" })]);
    await store.load();
    const result = await store.execute("renamePartner", { name: "What The Caller Asked For" });
    assert(result.ok);
    assert(!JSON.stringify(store.get()).includes("What The Caller Asked For"),
      "the request was rendered as though it had happened");
    eq(store.get().partners[0].name, "What The Server Actually Did");
    eq(store.version(), 9, "and the server's version");
  });

  test("there is exactly one line in the store that assigns state", () => {
    const bare = code("client/production-store.js");
    const assignments = bare.split("\n").filter((l) => /^\s*state\s*=/.test(l));
    eq(assignments.length, 1, "state is assigned in more than one place: " + assignments.join(" | "));
    assert(/answer\.state/.test(assignments[0]), "and it does not assign a response: " + assignments[0]);
    /* No merge, no patch, no spread of the old state into the new. */
    assert(!/\.\.\.state\b|Object\.assign\(state|state\[/.test(bare), "the store merges or patches state");
  });
});

/* ============================================================== D */
describe("D. refusal, auth failure and network failure", () => {
  test("a refusal is an answer: nothing changes, and the rule is named", async () => {
    const { store } = wired([viewReply(1, "Mine"), refusalReply("not-your-deal", 4)]);
    await store.load();
    const before = JSON.stringify(store.get());
    const result = await store.execute("acceptPrice", { oppId: "o1" });

    eq(JSON.stringify(result), JSON.stringify({ ok: false, refused: "not-your-deal" }),
      "a refusal was thrown, or dressed up as something else");
    eq(JSON.stringify(store.get()), before, "a refusal changed the projection");
    eq(store.status(), STORE.STATUS.ready, "and the screen is usable again");
    eq(store.lastRefusal(), "not-your-deal", "the domain's own word is available to a screen");
    eq(store.lastError(), null, "a refusal is not an error");
    eq(store.version(), 4, "the server's version is still taken");
  });

  test("a refusal carrying a projection cannot swap the screen out", async () => {
    const sneaky = { status: 409, body: { error: { code: "command_refused", refused: "nope" },
      version: 3, state: PROJECTION("SOMEBODY ELSE") } };
    const { store } = wired([viewReply(1, "Mine"), sneaky]);
    await store.load();
    const mine = JSON.stringify(store.get());
    await store.execute("acceptPrice", {});
    eq(JSON.stringify(store.get()), mine, "a refusal replaced the projection");
    assert(!JSON.stringify(store.get()).includes("SOMEBODY ELSE"));
  });

  test("the next success clears the refusal, so a stale one is never shown", async () => {
    const { store } = wired([viewReply(), refusalReply("not-yet"), okReply(5)]);
    await store.load();
    await store.execute("a", {});
    eq(store.lastRefusal(), "not-yet");
    await store.execute("b", {});
    eq(store.lastRefusal(), null, "a refusal survived a success");
  });

  test("an auth failure is an auth failure, and no identity is substituted", async () => {
    const { store } = wired([viewReply(1, "Mine"), authReply()]);
    await store.load();
    const good = JSON.stringify(store.get());
    const error = await caught(() => store.execute("acceptPrice", {}));
    assert(error, "the caller was not told");
    eq(error.failure, API.FAILURES.unauthenticated);
    eq(store.status(), STORE.STATUS.error);
    eq(store.lastError(), API.FAILURES.unauthenticated, "and what kind of wrong it was");
    eq(JSON.stringify(store.get()), good, "the projection was blanked");
    /* Ending the session is the session's job, and the store does not reach
       for it — there is no import and no call. */
    assert(!/signOut|forget|clear\(\)/.test(code("client/production-store.js")),
      "the store ends sessions on its own");
  });

  test("a client with no token never reaches the network", async () => {
    const { calls, store } = wired([viewReply()], { token: null });
    const error = await caught(() => store.execute("acceptPrice", {}));
    eq(error.failure, API.FAILURES.unauthenticated);
    eq(calls.length, 0, "a request left the browser without a token");
  });

  test("a network failure keeps the last good projection and says so", async () => {
    const { store } = wired([viewReply(1, "Mine"), new Error("offline")]);
    await store.load();
    const good = JSON.stringify(store.get());
    const error = await caught(() => store.execute("acceptPrice", {}));
    eq(error.failure, API.FAILURES.unavailable);
    eq(store.status(), STORE.STATUS.error);
    eq(store.lastError(), API.FAILURES.unavailable);
    eq(JSON.stringify(store.get()), good, "the screen was blanked because the network failed");
    eq(store.pending(), null, "and the store is not stuck thinking a command is in flight");
  });

  test("a 200 with no state is not success", async () => {
    const { store } = wired([viewReply(), { status: 200, body: { ok: true, version: 2 } }]);
    await store.load();
    const before = JSON.stringify(store.get());
    const error = await caught(() => store.execute("acceptPrice", {}));
    eq(error.failure, API.FAILURES.unexpected);
    eq(JSON.stringify(store.get()), before);
  });
});

/* ============================================================== E */
describe("E. conflict — not success, not replayed, recovered by re-reading", () => {
  test("the server's conflict body is recognised as a conflict, not as unexpected", async () => {
    const { api } = wired([conflictReply()]);
    const error = await caught(() => api.command("acceptPrice", {}));
    eq(error.failure, API.FAILURES.conflict, "a version conflict is indistinguishable from a broken reply");
    eq(error.status, 409);
  });

  test("a conflict is not success, and the store says conflict", async () => {
    const { store } = wired([viewReply(1, "Mine"), conflictReply(), viewReply(7, "Fresh")]);
    await store.load();
    const error = await caught(() => store.execute("acceptPrice", {}));
    assert(error, "a conflict resolved instead of throwing");
    eq(error.failure, API.FAILURES.conflict);
    eq(store.status(), STORE.STATUS.conflict, "the status does not distinguish a conflict");
    eq(store.lastError(), API.FAILURES.conflict);
    eq(store.lastRefusal(), null, "a conflict is not a refusal");
  });

  test("recovery is a re-read, and it produces the authoritative projection", async () => {
    const { calls, store } = wired([viewReply(1, "Mine"), conflictReply(), viewReply(7, "Fresh")]);
    await store.load();
    await caught(() => store.execute("acceptPrice", {}));
    eq(store.get().partners[0].name, "Fresh", "the store did not recover to the server's truth");
    eq(store.version(), 7);
    eq(store.stale(), false, "the recovery read succeeded, so nothing is stale");
    const posts = calls.filter((c) => c.method === "POST");
    eq(posts.length, 1, "the command was sent more than once");
    const gets = calls.filter((c) => c.method === "GET");
    eq(gets.length, 2, "the recovery was not a plain re-read");
  });

  test("the conflicted command is never replayed, by the store or by the client", async () => {
    const { calls, store } = wired([viewReply(), conflictReply(), conflictReply(), viewReply(7)]);
    await store.load();
    await caught(() => store.execute("acceptPrice", { oppId: "o1" }));
    const posts = calls.filter((c) => c.method === "POST");
    eq(posts.length, 1, `the command was sent ${posts.length} times`);
    /* And nothing in either file loops, sleeps or schedules one. */
    for (const rel of ["client/api.js", "client/production-store.js"]) {
      const bare = code(rel);
      assert(!/setTimeout|setInterval|requestAnimationFrame|queueMicrotask/.test(bare),
        `${rel} schedules something`);
      assert(!/\bfor\s*\(|\bwhile\s*\(|retry|attempts?\b/i.test(bare), `${rel} retries`);
    }
  });

  test("a conflict whose recovery read also fails keeps the old projection and admits it is behind", async () => {
    const { store } = wired([viewReply(1, "Mine"), conflictReply(), new Error("offline")]);
    await store.load();
    const good = JSON.stringify(store.get());
    const error = await caught(() => store.execute("acceptPrice", {}));
    eq(error.failure, API.FAILURES.conflict, "the conflict was replaced by the read's failure");
    eq(JSON.stringify(store.get()), good, "the screen was blanked");
    eq(store.status(), STORE.STATUS.conflict);
    eq(store.stale(), true, "the screen does not know it may be behind");
  });

  test("a later success clears the conflict entirely", async () => {
    const { store } = wired([viewReply(), conflictReply(), viewReply(7), okReply(8, "Done")]);
    await store.load();
    await caught(() => store.execute("a", {}));
    eq(store.status(), STORE.STATUS.conflict);
    const result = await store.execute("a", {});
    assert(result.ok);
    eq(store.status(), STORE.STATUS.ready);
    eq(store.lastError(), null);
    eq(store.stale(), false);
  });

  test("no merge happens anywhere — recovery replaces, it does not reconcile", () => {
    const bare = code("client/production-store.js");
    assert(!/merge|reconcile|patch|diff/i.test(bare), "the store merges");
    assert(!/\.\.\.state\b|\.\.\.answer\.state\b/.test(bare), "the store spreads a projection into another");
  });
});

/* ============================================================== F */
describe("F. one command at a time", () => {
  test("a second command while one is in flight is refused locally, not sent", async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let sent = 0;
    const api = {
      view: async () => ({ version: 1, state: PROJECTION() }),
      command: async () => { sent += 1; await gate; return { ok: true, version: 2, value: null, state: PROJECTION() }; },
    };
    const store = STORE.createProductionStore({ api });
    await store.load();

    const first = store.execute("acceptPrice", { oppId: "o1" });
    const second = store.execute("acceptPrice", { oppId: "o1" });

    /* RACED AGAINST A TIMER, and the timer is the point. `execute` is async, so
       a store that had NO gate would send the duplicate and leave this promise
       waiting on the network — and a bare `await` on it would never resolve.
       An unresolved promise keeps nothing alive, so node would simply exit 0,
       the remaining assertions would never run, and the suite would report
       success while the property was broken. A break injection walked straight
       through exactly that. The timer keeps the loop alive so a hang is a
       FAILURE rather than a silent pass. */
    const outcome = await Promise.race([
      second.then(() => "RESOLVED", (error) => error),
      new Promise((resolve) => setTimeout(() => resolve("HUNG"), 100)),
    ]);
    assert(outcome !== "HUNG", "the duplicate was sent and is waiting on the server");
    assert(outcome !== "RESOLVED", "the duplicate was accepted and succeeded");
    assert(outcome instanceof Error, "a second command was accepted while one was in flight");
    eq(outcome.name, "CommandInFlightError");
    eq(outcome.code, "store.command-in-flight");
    eq(outcome.running, "acceptPrice", "and does not say what is running");
    eq(sent, 1, "the duplicate reached the server");

    release();
    await first;
    eq(sent, 1);
    eq(store.pending(), null, "and the gate reopens");
  });

  test("the gate reopens after a refusal, a conflict and a failure alike", async () => {
    const after = async (reply, extra = []) => {
      const { store } = wired([viewReply(), reply, ...extra]);
      await store.load();
      await caught(() => store.execute("a", {}));
      return store.pending();
    };
    eq(await after(refusalReply("nope")), null, "stuck after a refusal");
    eq(await after(conflictReply(), [viewReply(7)]), null, "stuck after a conflict");
    eq(await after(new Error("offline")), null, "stuck after a network failure");
    eq(await after(authReply()), null, "stuck after an auth failure");
  });

  test("a control can ask before it asks, and never has to catch", async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const api = {
      view: async () => ({ version: 1, state: PROJECTION() }),
      command: async () => { await gate; return { ok: true, version: 2, value: null, state: PROJECTION() }; },
    };
    const store = STORE.createProductionStore({ api });
    await store.load();
    eq(store.pending(), null);
    const first = store.execute("acceptPrice", {});
    eq(store.pending(), "acceptPrice");
    release(); await first;
    eq(store.pending(), null);
  });

  test("a read during a command is still allowed — only mutations are gated", async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const api = {
      view: async () => ({ version: 3, state: PROJECTION("Read") }),
      command: async () => { await gate; return { ok: true, version: 4, value: null, state: PROJECTION("Wrote") }; },
    };
    const store = STORE.createProductionStore({ api });
    await store.load();
    const first = store.execute("acceptPrice", {});
    const read = await store.load();                       // a GET is safe to repeat
    assert(read, "a read was blocked by a command in flight");
    release();
    await first;
  });
});

/* ============================================================== G */
describe("G. the import boundary, and the demo", () => {
  test("the command path imports no domain, no store, no seed and no prototype", () => {
    for (const rel of ["client/api.js", "client/production-store.js", "client/session.js",
      "client/supabase-session.js", "client/production-app.jsx"]) {
      const bare = code(rel);
      assert(!/from ["'][^"']*domain\/|require\(["'][^"']*domain\//.test(bare), `${rel} imports domain`);
      assert(!/\bexecute\(\s*(world|state)\b|metyet-commands|metyet-store|projectForActor|buildCanonicalSeed/.test(bare),
        `${rel} reaches a domain executor, a canonical store or a projection`);
      assert(!/MetYetPrototype|MetYetCollector|demo-flag|dev-flag|src\/MetYet/.test(bare),
        `${rel} reaches the demo or the prototype`);
    }
  });

  test("the production bundle carries no domain executor and no seed", () => {
    const bundle = esbuild.buildSync({
      entryPoints: [path.join(ROOT, "app-src", "main.jsx")],
      bundle: true, format: "esm", write: false, logLevel: "silent", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"', __METYET_DEV__: "false", __METYET_DEMO__: "false",
        __METYET_API_URL__: '""', __METYET_SUPABASE_URL__: '""', __METYET_SUPABASE_KEY__: '""' },
    }).outputFiles[0].text;
    ["buildCanonicalSeed", "prototypeRuntime", "systemRuntime", "projectForActor", "validateWorld",
      "metyet-commands", "CARDS_SEED", "Switch persona", "Reset demo"]
      .forEach((needle) => assert(!bundle.includes(needle), `the production bundle contains "${needle}"`));
  });

  test("the demo bundle is unchanged by any of this", () => {
    ["shell/MetYetPrototype.jsx", "src/MetYet.jsx", "collector/MetYetCollector.jsx", "site-src/main.jsx"]
      .forEach((rel) => assert(!/client\/api|client\/production-store|client\/session|app-src/.test(code(rel)),
        `${rel} reaches the production boundary`));
    const bundle = esbuild.buildSync({
      entryPoints: [path.join(ROOT, "site-src", "main.jsx")],
      bundle: true, format: "esm", write: false, logLevel: "silent", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"', __METYET_DEV__: "false", __METYET_DEMO__: "true" },
    }).outputFiles[0].text;
    ["/api/commands", "/api/view", "Bearer ", "state_changed", "CommandInFlightError"]
      .forEach((needle) => assert(!bundle.includes(needle), `the demo bundle contains "${needle}"`));
  });

  test("the TP surface still holds no store, so no control can have grown one", () => {
    const tp = fs.readdirSync(path.join(ROOT, "client", "tp"), { withFileTypes: true })
      .flatMap((e) => (e.isDirectory()
        ? fs.readdirSync(path.join(ROOT, "client", "tp", e.name)).map((f) => `client/tp/${e.name}/${f}`)
        : [`client/tp/${e.name}`]));
    for (const rel of tp) {
      const bare = code(rel);
      assert(!/store\.|execute\s*\(|\.command\s*\(/.test(bare), `${rel} gained a command path`);
    }
  });

  test("no dependency was added", () => {
    const pkg = JSON.parse(src("package.json"));
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    assert(!Object.keys(all).some((d) => /supabase|axios|swr|react-query|tanstack|router|redux|zustand/.test(d)),
      "a client library was added");
  });
});

run();
