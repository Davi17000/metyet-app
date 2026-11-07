/* ============================================================================
   M3A A3 F1 — AN ANSWER NEVER UNDOES A NEWER ONE

   Found by PR #82's integration audit: a read that left at world version 10
   could arrive after the person's own command had moved the store to 11, and
   put 10 back on screen. Freshness (a read on arrival, on return and every
   15 seconds) made that likelier.

   The rule, in client/production-store.js: every request notes how many
   answers the store had adopted when it left (`since`). When its answer
   arrives, if something was adopted after it left AND its version is no newer
   than what is held, it is dropped. The world's version orders answers; the
   adoption count is what keeps a world that was reset (versions from 0 again)
   from being refused for ever. `load()` resolves `null` when its answer was
   dropped, so a freshness check knows it learned nothing.

   These are the REAL production store's own lines, bundled from source,
   driven by a stub API whose answers are released in a chosen order — the
   only way to force an ordering a network produces by chance. The same race
   through the real server and screens is in tests/milestone3a3-freshness.cjs.
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const path = require("path");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
const load = (rel) => {
  const out = esbuild.buildSync({ entryPoints: [path.join(ROOT, rel)], bundle: true, format: "cjs", write: false, logLevel: "silent" });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};
const STORE = load("client/production-store.js");
const API = load("client/api.js");

/* A stub API whose answers are held until released, in any order. */
function stub() {
  const views = []; const commands = []; let calls = 0;
  const pending = (queue) => new Promise((resolve, reject) => queue.push({ resolve, reject }));
  return {
    api: { view: () => { calls += 1; return pending(views); }, command: () => pending(commands) },
    view: (version, tag = `v${version}`) => views.shift().resolve({ version, state: { actor: { seat: "tp" }, tag } }),
    viewFails: (error) => views.shift().reject(error),
    command: (version, tag = `cmd${version}`) => commands.shift().resolve({ ok: true, version, value: "the value", state: { actor: { seat: "tp" }, tag } }),
    refuse: (version) => commands.shift().resolve({ ok: false, refused: "terms-changed", version }),
    calls: () => calls,
  };
}
const flush = () => new Promise((r) => setImmediate(r));
async function at10() {
  const s = stub(); const store = STORE.createProductionStore({ api: s.api });
  const announced = []; store.sub((x) => announced.push(x && x.tag));
  const first = store.load(); s.view(10); await first;
  announced.length = 0;
  return { s, store, announced };
}

describe("F1. A late answer cannot put an older deal back on screen", () => {
  test("the audit's race: a read leaves at 10, the person's command lands at 11, the read arrives — 11 stays", async () => {
    const { s, store, announced } = await at10();
    const read = store.load();                         // a freshness check leaves at 10…
    const cmd = store.execute("selectTradeCards", {}); // …the person's own command
    await flush(); s.command(11);
    const answer = await cmd;
    eq([store.get().tag, store.version()].join(), "cmd11,11", "after the command");
    const since11 = announced.length;
    s.view(10);                                        // …then the old read arrives
    eq(await read, null, "load says its answer was dropped");
    eq([store.get().tag, store.version()].join(), "cmd11,11", "the older answer put 10 back");
    eq(store.status(), "ready"); eq(store.lastError(), null);
    eq(answer.value, "the value", "the command's own answer still reached its caller");
    eq(announced.slice(since11).filter((t) => t !== "cmd11").length, 0, "an older state was announced after 11");
  });
  test("the other order: a newer read lands first, then the command's older answer — the newer world stays", async () => {
    const { s, store } = await at10();
    const cmd = store.execute("acceptPrice", {});      // leaves at 10; commits at 11 on the server
    const read = store.load();                         // a read that sees 12 (someone else, after)
    await flush(); s.view(12);
    eq(await read, store.get(), "the newer read was adopted");
    s.command(11);
    const answer = await cmd;
    eq(answer.ok, true, "the command still succeeded for its caller");
    eq([store.get().tag, store.version()].join(), "v12,12", "the command's older answer replaced a newer world");
  });
  test("reads never overlap: a second load while one is out shares it — one request, one answer", async () => {
    const { s, store } = await at10();
    const a = store.load(); const b = store.load();
    eq(s.calls(), 2, "a second view request was sent");
    s.view(11);
    eq(await a, await b, "two answers for one read");
    eq(store.version(), 11);
  });
  test("an equal version after a newer adoption is the same world — dropped, nothing announced", async () => {
    const { s, store, announced } = await at10();
    const read = store.load();
    const cmd = store.execute("holdTradeSelection", {}); await flush(); s.command(11); await cmd;
    const n = announced.length;
    s.view(11, "same-world-again");
    eq(await read, null, "dropped");
    eq(store.get().tag, "cmd11", "replaced by an identical world");
    eq(announced.length - n, 1, "more than the one status announcement");
    eq(announced.slice(-1)[0], "cmd11", "a different state was announced");
  });
  test("with nothing adopted in between, an equal version is adopted as usual (a plain refresh)", async () => {
    const { s, store } = await at10();
    const read = store.load(); s.view(10, "refreshed");
    eq((await read).tag, "refreshed");
  });
  test("a genuinely newer world — another person's move — is always adopted", async () => {
    const { s, store } = await at10();
    const read = store.load();
    const cmd = store.execute("selectTradeCards", {}); await flush(); s.command(11); await cmd;
    s.view(12, "their-move");
    eq((await read).tag, "their-move");
    eq(store.version(), 12);
  });
  test("a world that was reset (versions from 0 again) is not refused", async () => {
    const { s, store } = await at10();
    const read = store.load(); s.view(3, "after-reset");
    eq((await read).tag, "after-reset", "a lower version with nothing in between was refused");
    eq(store.version(), 3);
  });
});

describe("F1. Failure, recovery and an ended session behave as before", () => {
  test("a failed read keeps the last good state and says so; the next read recovers", async () => {
    const { s, store } = await at10();
    const bad = store.load();
    s.viewFails(new API.ApiError("unavailable"));
    let threw = null; try { await bad; } catch (e) { threw = e; }
    assert(threw, "a failure resolved");
    eq([store.status(), store.lastError(), store.get().tag].join(), "error,unavailable,v10");
    const good = store.load(); s.view(11);
    eq((await good).tag, "v11"); eq([store.status(), store.lastError()].join(), "ready,");
  });
  test("an ended session is reported as before and the screen keeps what it had", async () => {
    const { s, store } = await at10();
    const read = store.load();
    s.viewFails(new API.ApiError("unauthenticated"));
    let threw = null; try { await read; } catch (e) { threw = e; }
    eq(threw && threw.failure, "unauthenticated");
    eq([store.status(), store.lastError(), store.get().tag].join(), "error,unauthenticated,v10");
  });
  test("a refusal adopts nothing, so a read that left before it is still adopted", async () => {
    const { s, store } = await at10();
    const read = store.load();
    const cmd = store.execute("closeTradeSelection", {}); await flush();
    s.refuse(10);
    eq((await cmd).refused, "terms-changed");
    s.view(11, "their-move");
    eq((await read).tag, "their-move", "a refusal made a later read look stale");
  });
});

run();
