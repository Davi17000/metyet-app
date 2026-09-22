/* ============================================================================
   PHASE 5 BATCH 8.1 — PLUMBING CORRECTIONS

   Five small things the Product Architecture & UX Plumbing Checkpoint found.
   None of them is a feature and none of them changes a product concept.

   A. the door          the browser cannot mint card identity, by any route
   B. a goal's birthday an immutable createdAt, and a lifecycle that leaves it alone
   C. what happened     one log line per success, and a count of discoveries
   D. what is not said  the things that must never reach a log
   E. Your Cards (the Trade Binder until C2) is not a place a Collector can go
   F. the map           domain/README.md says what is production and what is not
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { createApp } = require("../server/app.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { EXPOSED_COMMANDS, isExposed } = require("../server/exposed-commands.js");
const { COMMAND_NAMES } = require("../domain/metyet-commands.js");
const { FIELD_RULES } = require("../domain/metyet-projection.js");
const RT = require("../domain/metyet-runtime.js");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const json = (v) => JSON.stringify(v);

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

const SUBJECT = { north: "sub-north", casey: "sub-casey" };

/* A logger with pino's shape that keeps what it was told. Fastify's own
   request/response lines come through it too, so every assertion below filters
   by the message this batch writes rather than by position. */
function capturingLogger() {
  const lines = [];
  const record = (level) => (a, b) => {
    const [fields, message] = typeof a === "string" ? [{}, a] : [a || {}, b];
    lines.push({ level, message, fields });
  };
  const logger = {
    lines,
    level: "info",
    fatal: record("fatal"), error: record("error"), warn: record("warn"),
    info: record("info"), debug: record("debug"), trace: record("trace"),
    silent() {},
    child() { return logger; },
  };
  return logger;
}
const said = (logger, message) => logger.lines.filter((l) => l.message === message);

async function world() {
  const pg = database();
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  const runtime = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 1000 });
  const repository = createWorldRepository(db);
  const catalog = createCatalogRepository(db, { newId: runtime.newId });
  await repository.saveWorld({
    catalog: [],
    collectors: [{ id: "c1", name: "Casey" }],
    partners: [{ id: "p1", name: "Northline" }],
    relationships: [{ partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" }],
    invitations: [], goals: [], inventory: [], collectorCopies: [], binders: [], binderEntries: [], interests: [],
    opportunities: [], conversations: [], photoRequests: [], copyReviews: [],
  });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: SUBJECT.north, role: "tp", partnerId: "p1" });
  await accounts.linkAccount({ subject: SUBJECT.casey, role: "collector", collectorId: "c1" });
  const verifier = { verify: async (token) => {
    const subject = SUBJECT[token];
    if (!subject) throw Object.assign(new Error("no"), { reason: "bad token" });
    return { subject, email: `${token}@example.invalid`, emailVerified: true };
  } };
  const logger = capturingLogger();
  return { pg, db, runtime, repository, catalog, logger,
    app: createApp({ repository, catalog, accounts, verifier, runtime, logger }) };
}

async function charizard(ctx) {
  const { expansionId } = await ctx.catalog.putExpansion(
    { game: "pokemon", code: "base1", name: "Base", printedTotal: 102 });
  const { cardContextId } = await ctx.catalog.putCardContext({ game: "pokemon", expansionId,
    collectorNumber: "4", cardName: "Charizard", artist: "Mitsuhiro Arita" });
  return (await ctx.catalog.putCanonicalCard(
    { cardContextId, printRun: "unlimited", finish: "holofoil" })).canonicalCardId;
}

const post = (app, token, command, payload) => app.inject({ method: "POST", url: "/api/commands",
  headers: { authorization: `Bearer ${token}` }, payload: { command, payload } });
const get = (app, token, url = "/api/view") => app.inject({ method: "GET", url,
  headers: { authorization: `Bearer ${token}` } });

const INVENTED = { name: "TOTALLY INVENTED CARD", set: "Nowhere", num: "999",
  print: "Holo", edition: "1st", language: "EN", grade: "Raw", condition: "NM" };

/* ============================================================== A */
describe("A. the browser cannot mint card identity, by any route", () => {

  test("THE HOLE THE CHECKPOINT FOUND, closed: a Collector cannot invent a card", async () => {
    const ctx = await world();
    const res = await post(ctx.app, "casey", "resolveCardIdentity", { identity: INVENTED });
    eq(res.statusCode, 409, res.body);
    eq(res.json().error.refused, "command-unavailable");
    eq((await ctx.repository.loadWorld()).catalog.length, 0, "and the catalogue is untouched");
  });

  test("nor can a Trusted Partner", async () => {
    const ctx = await world();
    const res = await post(ctx.app, "north", "resolveCardIdentity", { identity: INVENTED });
    eq(res.statusCode, 409, res.body);
    eq(res.json().error.refused, "command-unavailable");
    eq((await ctx.repository.loadWorld()).catalog.length, 0, "and the catalogue is untouched");
  });

  test("and so the second half of that hole is shut too", async () => {
    const ctx = await world();
    /* The checkpoint's reproduction was two steps: mint a card, then make a
       Goal for it. With no way to mint, the legacy Goal has nothing to name —
       and the canonical door was already guarded. */
    await post(ctx.app, "casey", "resolveCardIdentity", { identity: INVENTED });
    const legacy = await post(ctx.app, "casey", "addGoal",
      { cardId: "ctotallyinventedcardnowhe-0", tier: "primary" });
    eq(legacy.statusCode, 409, legacy.body);
    const canonical = await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: "i-made-this-up", tier: "primary", desired: { grade: "PSA 9" } });
    eq(canonical.statusCode, 409, canonical.body);
    eq(canonical.json().error.refused, "card-unavailable", "the canonical guard is as it was");
    eq((await ctx.repository.loadWorld()).goals.length, 0, "no demand was invented");
  });

  test("an unexposed command and a command that does not exist are one answer", async () => {
    const ctx = await world();
    const unknown = await post(ctx.app, "casey", "dropEverything", {});
    const unexposed = await post(ctx.app, "casey", "startOpportunity", {});
    eq(unknown.statusCode, 409);
    eq(unexposed.statusCode, unknown.statusCode);
    const strip = (r) => json({ ...r.json().error, requestId: null });
    eq(strip(unexposed), strip(unknown), "existence is not observable from outside");
  });

  test("the refusal says nothing about the domain, the payload or the world", async () => {
    const ctx = await world();
    const res = await post(ctx.app, "north", "recordNote",
      { collectorId: "c1", activity: { type: "manual", text: "PRIVATE-NOTE-TEXT" } });
    const body = res.body;
    eq(res.statusCode, 409);
    assert(!body.includes("PRIVATE-NOTE-TEXT"), "the payload came back: " + body);
    assert(!body.includes("recordNote"), "the command name came back: " + body);
    for (const name of COMMAND_NAMES) assert(!body.includes(name), `${name} leaked: ` + body);
    assert(!/p1|c1|collectorId|partnerId/.test(body), "an id or a field name leaked: " + body);
  });

  test("every command the product offers still reaches its own rules", async () => {
    const ctx = await world();
    const card = await charizard(ctx);
    /* The two seats' real work, end to end, through the door. */
    const goal = await post(ctx.app, "casey", "addGoal", { canonicalCardId: card, tier: "primary", desired: { grade: "PSA 9" } });
    eq(goal.statusCode, 200, goal.body);
    eq((await post(ctx.app, "casey", "updateGoalTier",
      { goalId: goal.json().value, tier: "secondary" })).statusCode, 200);
    eq((await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: card, ask: 900 } })).statusCode, 200);
    eq((await post(ctx.app, "north", "updatePartnerProfile",
      { patch: { about: "Vintage and raw." } })).statusCode, 200);
    eq((await post(ctx.app, "casey", "removeGoal", { goalId: goal.json().value })).statusCode, 200);
    /* And a rule the door did not replace: the seat is still the command's. */
    const wrongSeat = await post(ctx.app, "north", "addGoal",
      { canonicalCardId: card, tier: "primary", desired: { grade: "PSA 9" } });
    eq(wrongSeat.statusCode, 409);
    eq(wrongSeat.json().error.refused, "not-owner", "authorization is still the domain's");
  });

  test("the list names only real commands, and only ones the client sends", () => {
    for (const name of EXPOSED_COMMANDS) {
      assert(COMMAND_NAMES.includes(name), `${name} is exposed but is not a command`);
    }
    eq(new Set(EXPOSED_COMMANDS).size, EXPOSED_COMMANDS.length, "a command is listed twice");
    /* THE LIST IS THE CLIENT'S, MEASURED. Every command `client/commands.js`
       can send must be offered, or a working screen is broken; and nothing may
       be offered that no screen sends, or the door is decorative. */
    const client = read("client/commands.js");
    const sent = new Set();
    for (const m of client.matchAll(/execute\(\s*"([A-Za-z]+)"/g)) sent.add(m[1]);
    for (const m of client.matchAll(/^export const [A-Z_]+ = "([A-Za-z]+)";$/gm)) sent.add(m[1]);
    eq(json([...sent].sort()), json([...EXPOSED_COMMANDS].sort()),
      "the door and the client disagree about what the product offers");
  });

  test("the guard runs before the world is touched at all", () => {
    const app = read("server/app.js");
    const door = app.indexOf("if (!isExposed(command))");
    assert(door > 0, "the guard is not in the command route");
    assert(door < app.indexOf("executeCommand(repository"), "the guard runs after the transaction");
    assert(door < app.indexOf("findSelectableCanonicalCard"), "the guard runs after the catalog read");
    const list = read("server/exposed-commands.js");
    assert(!/require\(/.test(list), "the list grew a dependency and can now decide things");
    assert(!/state|world|actor|seat/.test(list.replace(/\/\*[\s\S]*?\*\//g, "")),
      "the list reads something other than a command name");
  });
});

/* ============================================================== B */
describe("B. a goal's birthday, and a lifecycle that leaves it alone", () => {

  const madeGoal = async (ctx, tier = "primary") => {
    const card = await charizard(ctx);
    const res = await post(ctx.app, "casey", "addGoal", { canonicalCardId: card, tier, desired: { grade: "PSA 9" } });
    eq(res.statusCode, 200, res.body);
    return res.json().value;
  };
  const goalNow = async (ctx, id) => (await ctx.repository.loadWorld()).goals.find((g) => g.id === id);

  test("a new Goal is stamped when it was created", async () => {
    const ctx = await world();
    const goal = await goalNow(ctx, await madeGoal(ctx));
    assert(goal.createdAt, "a goal arrived with no creation time");
    assert(/^2030-/.test(goal.createdAt), "the time is not the runtime's: " + goal.createdAt);
    eq(goal.createdAt, goal.since, "one command, one reading of the clock");
  });

  test("changing your mind does not change when you first said it", async () => {
    const ctx = await world();
    const id = await madeGoal(ctx, "primary");
    const born = (await goalNow(ctx, id)).createdAt;
    for (const tier of ["secondary", "primary", "secondary"]) {
      eq((await post(ctx.app, "casey", "updateGoalTier", { goalId: id, tier })).statusCode, 200);
      eq((await goalNow(ctx, id)).createdAt, born, `createdAt moved on the way to ${tier}`);
    }
    const after = await goalNow(ctx, id);
    assert(after.since !== born, "`since` still means in-this-tier-since, and still moved");
    eq(after.tier, "secondary", "and the tier is where it was left");
  });

  test("confirming does not change it either", async () => {
    const ctx = await world();
    const id = await madeGoal(ctx);
    const born = (await goalNow(ctx, id)).createdAt;
    /* `confirmGoal` is built and unexposed; the property is the domain's. */
    const { executeCommand } = require("../persistence/command-transaction.js");
    const done = await executeCommand(ctx.repository, { actor: { collectorId: "c1" },
      command: "confirmGoal", payload: { goalId: id }, runtime: ctx.runtime });
    eq(done.ok, true, json(done.refused));
    const after = await goalNow(ctx, id);
    eq(after.createdAt, born, "createdAt moved when the goal was confirmed");
    assert(after.confirmedAt, "and confirmedAt is still written");
  });

  test("both seats receive it, on the terms they already had", async () => {
    const ctx = await world();
    const id = await madeGoal(ctx);
    assert(FIELD_RULES.GOAL_FOR_PARTNER.includes("createdAt"),
      "the partner's allow-list no longer names it");
    const mine = (await get(ctx.app, "casey")).json().state.goals[0];
    const theirs = (await get(ctx.app, "north")).json().state.goals[0];
    eq(mine.id, id);
    assert(mine.createdAt && theirs.createdAt, "a seat did not receive it");
    eq(mine.createdAt, theirs.createdAt, "and it is the same moment for both");
    /* Nothing else about a Goal moved.

       RESTATED IN C3.3, and not loosened. `desired` is on the list because a
       canonical Goal now states which copy it wants — C3.2 added the field and
       C3.3 made it required on this path, so the seed above states one and it
       travels to the partner exactly as far as the Goal does. This is still an
       EXACT list rather than a subset check, so the next field to appear on a
       Goal still has to be written down here by whoever adds it. */
    eq(json(Object.keys(theirs).sort()),
      json(["canonicalCardId", "collectorId", "createdAt", "desired", "id", "note",
        "since", "tier"]),
      "a Goal grew or lost a field");
  });

  /* RESTATED IN C1, which added 0010 — three indexes so the catalog can be
     browsed. The property this test is named for is about `createdAt`, and it
     is unchanged and now stated directly: no migration anywhere gave a Goal a
     creation-time column, because a Goal's fields live in attrs. */
  test("no migration was needed, and none was written", () => {
    const names = fs.readdirSync(path.join(ROOT, "persistence", "migrations")).sort();
    for (const name of names) {
      const sql = read(path.join("persistence", "migrations", name));
      assert(!/alter table metyet\.goals[\s\S]{0,120}created_at/i.test(sql),
        `${name} gave a Goal a creation-time column`);
    }
    /* Which is the point: a Goal's fields live in `attrs`, so a new one costs
       no schema — the repository stores what the record has. */
    const spec = read("persistence/world-repository.js");
    assert(/collection: "goals"/.test(spec), "the goals spec is still there");
    assert(!/created_at/.test(spec), "createdAt became a column it did not need to be");
  });
});

/* ============================================================== C */
describe("C. what happened, said once", () => {

  test("a command that succeeded is written down, with who and what", async () => {
    const ctx = await world();
    const card = await charizard(ctx);
    const res = await post(ctx.app, "casey", "addGoal", { canonicalCardId: card, tier: "primary", desired: { grade: "PSA 9" } });
    eq(res.statusCode, 200, res.body);

    const lines = said(ctx.logger, "command");
    eq(lines.length, 1, "one line per command, no more and no fewer");
    const { fields } = lines[0];
    eq(fields.command, "addGoal", "the command that ran");
    eq(fields.seat, "collector", "the seat that ran it");
    eq(fields.collectorId, "c1", "and which one");
    eq(fields.value, res.json().value, "and the id it produced");
  });

  test("a Trusted Partner's command says the partner, not a collector", async () => {
    const ctx = await world();
    const card = await charizard(ctx);
    await post(ctx.app, "north", "addInventoryCopy", { copy: { canonicalCardId: card, ask: 900 } });
    const { fields } = said(ctx.logger, "command")[0];
    eq(fields.seat, "tp");
    eq(fields.partnerId, "p1");
    assert(!("collectorId" in fields), "a partner's line named a collector");
  });

  test("a refusal is never written down as a success", async () => {
    const ctx = await world();
    /* One of each kind of refusal: the door, the catalog guard, the domain. */
    await post(ctx.app, "casey", "resolveCardIdentity", { identity: INVENTED });
    await post(ctx.app, "casey", "addGoal", { canonicalCardId: "nope", tier: "primary", desired: { grade: "PSA 9" } });
    await post(ctx.app, "north", "addGoal", { canonicalCardId: "nope", tier: "primary", desired: { grade: "PSA 9" } });
    eq(said(ctx.logger, "command").length, 0, "something that failed was logged as done");
    assert(said(ctx.logger, "command refused: command-unavailable").length === 1, "the door still says so");
    assert(said(ctx.logger, "command refused: card-unavailable").length >= 1, "and so does the catalog guard");
  });

  test("a read says how much overlap the product had to show", async () => {
    const ctx = await world();
    const card = await charizard(ctx);
    await post(ctx.app, "casey", "addGoal", { canonicalCardId: card, tier: "primary", desired: { grade: "PSA 9" } });
    await get(ctx.app, "casey");
    eq(said(ctx.logger, "view").pop().fields.discoveries, 0, "nothing overlapped yet");

    await post(ctx.app, "north", "addInventoryCopy", { copy: { canonicalCardId: card, ask: 900 } });
    for (const token of ["casey", "north"]) {
      const res = await get(ctx.app, token);
      eq(res.statusCode, 200);
      const line = said(ctx.logger, "view").pop();
      eq(line.fields.discoveries, 1, `${token} was shown an overlap and it was not counted`);
      eq(line.fields.discoveries, res.json().state.discoveries.length,
        "the count is not the one the seat was actually sent");
    }
  });

  test("the count is the authorized projection's, never the world's", async () => {
    const ctx = await world();
    const card = await charizard(ctx);
    await post(ctx.app, "casey", "addGoal", { canonicalCardId: card, tier: "primary", desired: { grade: "PSA 9" } });
    await post(ctx.app, "north", "addInventoryCopy", { copy: { canonicalCardId: card, ask: 900 } });
    /* End the relationship: the overlap in the WORLD is unchanged, and neither
       seat may see it any more. */
    const state = await ctx.repository.loadWorld();
    await ctx.repository.saveWorld({ ...state,
      relationships: state.relationships.map((r) => ({ ...r, status: "ended" })) });
    await get(ctx.app, "casey");
    eq(said(ctx.logger, "view").pop().fields.discoveries, 0,
      "the count survived a relationship that did not");
  });

  test("nothing in the seam is stored, and Discovery did not become an event", async () => {
    const ctx = await world();
    const { rows } = await ctx.db.transaction((tx) => tx.query(
      "select table_name from information_schema.tables where table_schema in ('metyet','metyet_auth')"),
    { readOnly: true });
    const named = rows.map((r) => r.table_name)
      .filter((n) => /(^|_)(events?|analytics|discoveries|audit|logs?|metrics)(_|$)/i.test(n));
    eq(json(named), json([]), "an observability table appeared: " + named.join(", "));
    const app = read("server/app.js");
    assert(!/require\(["'](?!\.|fastify)/.test(app.replace(/\/\*[\s\S]*?\*\//g, "")),
      "the server grew a third-party dependency");
    const discovery = read("domain/metyet-discovery.js");
    assert(!/log|emit|event|count\b/i.test(discovery.replace(/\/\*[\s\S]*?\*\//g, "")),
      "the derivation learned about logging");
  });
});

/* ============================================================== D */
describe("D. what is deliberately not said", () => {

  test("no payload, no secret and no private field reaches this batch's log lines", async () => {
    const ctx = await world();
    const card = await charizard(ctx);
    await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: card, tier: "primary", note: "CASEY-PRIVATE-REASON", desired: { grade: "PSA 9" } });
    await post(ctx.app, "north", "addInventoryCopy", { copy: { canonicalCardId: card, ask: 900,
      cost: 5551212, acquired: "2029-09-09", note: "NORTHLINE-PRIVATE-NOTE",
      photos: { front: "SECRET-PHOTO-URL", back: null } } });
    await post(ctx.app, "north", "updatePartnerProfile", { patch: { email: "owner@northline.invalid" } });
    await get(ctx.app, "casey");

    /* SCOPED TO THE LINES THIS BATCH WRITES, and deliberately. Fastify's own
       "incoming request" line is handed the raw request object and relies on
       pino's `req` serializer to reduce it to method, url and status — a
       serializer the capturing logger above does not have, and which a real
       deployment does, because production passes logger CONFIGURATION and
       Fastify builds pino with its own serializers. Asserting over that line
       here would be testing this test's stub. What must hold, and what is
       asserted, is that the two lines this batch added carry nothing but the
       fields it chose. */
    const ours = [...said(ctx.logger, "command"), ...said(ctx.logger, "view")];
    eq(ours.length, 4, "the seam did not write what it should have");
    const everything = json(ours);
    for (const secret of ["CASEY-PRIVATE-REASON", "NORTHLINE-PRIVATE-NOTE", "SECRET-PHOTO-URL",
      "5551212", "2029-09-09", "owner@northline.invalid", "sub-casey", "sub-north", "Bearer",
      "patch", "copy", "payload", "note"]) {
      assert(!everything.includes(secret), `"${secret}" reached the log`);
    }
    /* And the field set is exactly the chosen one, so a future field cannot
       arrive unnoticed. */
    for (const line of said(ctx.logger, "command")) {
      const keys = Object.keys(line.fields).sort().join(",");
      assert(keys === "collectorId,command,seat,value" || keys === "command,partnerId,seat,value",
        "a command line grew a field: " + keys);
    }
    for (const line of said(ctx.logger, "view")) {
      const keys = Object.keys(line.fields).sort().join(",");
      assert(keys === "collectorId,discoveries,seat" || keys === "discoveries,partnerId,seat",
        "a view line grew a field: " + keys);
    }
  });

  test("a value that is not a plain id is not logged at all", () => {
    const app = read("server/app.js");
    assert(/loggableValue\(result\.value\)/.test(app), "the returned value is logged raw");
    assert(/const loggableValue = \(value\) => \(typeof value === "string" \? value : null\)/.test(app),
      "loggableValue no longer narrows to a string");
  });

  test("the log seam is in the route and nowhere else", () => {
    for (const rel of ["domain/metyet-commands.js", "domain/metyet-projection.js",
      "domain/metyet-discovery.js", "domain/metyet-world.js", "persistence/world-repository.js",
      "persistence/command-transaction.js"]) {
      const body = read(rel).replace(/\/\*[\s\S]*?\*\//g, "");
      assert(!/\.log\.|console\.|logger/.test(body), `${rel} learned to log`);
    }
  });
});

/* ============================================================== E */
describe("E. Your Cards is not a place a Collector can go", () => {

  const SHELL = read("client/collector/CollectorShell.jsx");

  test("it is not in the navigation, and it is not deleted either", () => {
    const shell = require("esbuild").buildSync({
      entryPoints: [path.join(ROOT, "client", "collector", "CollectorShell.jsx")],
      bundle: true, format: "cjs", write: false, logLevel: "silent", jsx: "automatic",
      external: ["react", "react-dom", "react/jsx-runtime"],
      define: { "process.env.NODE_ENV": '"production"' },
    }).outputFiles[0].text;
    const mod = { exports: {} };
    new Function("module", "exports", "require", shell)(mod, mod.exports, require);
    /* SUPERSEDED AND RESTATED (Phase 5 C3.4).

       What this protected: that Batch 8.1 DEFERRED Your Cards rather than
       deleting it — the entry, and its component, stayed live and correct in a
       declared waiting place instead of being removed and rebuilt later.

       Why it is no longer correct: the waiting is over. The reasons expired one
       at a time — C2 gave a copy a canonical card, C3.3 gave a person a way to
       record one, C3.4 fixed the screen's own canonical naming — and C3.4 moved
       the entry up.

       What replaces it, and why it is stricter: the property this test is
       really about is that deferring never quietly became deleting, and that is
       now provable in the strongest possible way — the section is in the
       product, with the same component file Batch 8.1 declined to delete. The
       deferral list survives, empty, so the convention is still there for the
       next section that needs it.

       SUPERSEDED AGAIN AND RESTATED (Phase 5 C3.4b). The next section that
       needed it arrived immediately: C3.4b took Goals out of the top level,
       because a binder expresses coherence and a goal expresses priority, which
       belongs inside a card experience rather than beside it — and it put Goals
       in the same declared waiting place instead of deleting `Goals.jsx`. So
       the list is not empty, and the convention has now been used in BOTH
       directions, which is the proof it is a real place and not a one-off.
       The claim is unchanged and is asserted the same way: every id in the list
       still has a live component, and Your Cards is still promoted. */
    eq(mod.exports.SECTIONS.map((s) => s.id).join(","), "browse,binder,my-cards,partners");
    eq(mod.exports.DEFERRED_SECTIONS.map((s) => s.id).join(","), "goals",
      "something else is waiting — say so here");
    for (const waiting of mod.exports.DEFERRED_SECTIONS) {
      assert(typeof waiting.view === "function",
        `the deferred section ${waiting.id} has no component: deferring became deleting`);
    }
    const promoted = mod.exports.SECTIONS.find((s) => s.id === "my-cards");
    assert(promoted && typeof promoted.view === "function",
      "the section component was deleted rather than promoted");
    eq(promoted.count, "collectorCopies", "it counts something other than its own collection");
  });

  test("the domain, the table and the projection are untouched", () => {
    const commands = read("domain/metyet-commands.js");
    for (const name of ["addCollectorCopy", "updateCollectorCopy", "removeCollectorCopy", "setInterest"]) {
      assert(commands.includes(`${name}(state, a,`), `${name} was removed`);
    }
    assert(FIELD_RULES.COLLECTOR_COPY_FOR_PARTNER.length > 0, "the binder projection rule was removed");
    /* The file is MyCards.jsx since C2 — the section was renamed, not deleted,
       which is what this assertion has always been about: deferring a section
       must not quietly become removing it. */
    assert(fs.existsSync(path.join(ROOT, "client", "collector", "sections", "MyCards.jsx")),
      "the section file was deleted");
    assert(!fs.existsSync(path.join(ROOT, "client", "collector", "sections", "TradeBinder.jsx")),
      "the old name is still there too — one concept, one file");
  });

  test("and the batch that makes it real moves one entry", () => {
    assert(/DEFERRED_SECTIONS/.test(SHELL), "there is no declared place to move it back from");
    assert(/const \[section, setSection\] = useState\(joined \? "partners" : SECTIONS\[0\]\.id\)/.test(SHELL),
      "the opening section is chosen from something other than SECTIONS");
    assert(/SECTIONS\.find\(\(s\) => s\.id === section\)/.test(SHELL),
      "a section could be routed to from outside SECTIONS");
  });
});

/* ============================================================== F */
describe("F. the map a new engineer reads first", () => {

  const README = read("domain/README.md");

  test("it says which modules are production and which are the prototype", () => {
    for (const production of ["metyet-commands.js", "metyet-projection.js", "metyet-discovery.js",
      "metyet-world.js", "card-identity.js"]) {
      assert(README.includes(production), `${production} is not in the map`);
    }
    for (const demo of ["collector-view.js", "metyet-store.js", "metyet-entities.js"]) {
      assert(README.includes(demo), `${demo} is not named as the prototype's`);
    }
  });

  test("and it is true: the prototype modules really are unreachable from production", () => {
    const surfaces = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(dir, entry.name));
        else if (/\.(js|jsx)$/.test(entry.name)) surfaces.push(path.join(dir, entry.name));
      }
    };
    walk("client");
    walk("server");
    const body = surfaces.map((f) => read(f).replace(/\/\*[\s\S]*?\*\//g, "")).join("\n");
    for (const demo of ["collector-view", "metyet-store", "metyet-entities"]) {
      assert(!body.includes(demo), `${demo} is reachable from production, so the map lies`);
    }
  });

  test("it states the four things that are easiest to get wrong", () => {
    assert(/Discovery is computed; Opportunity is persisted/.test(README), "the two Opportunities");
    assert(/Canonical card identity is server-owned/.test(README), "who owns identity");
    assert(/projection is the privacy boundary/i.test(README), "where privacy lives");
    assert(/Derive it, don't store it/.test(README), "the derivation rule");
  });

  test("it documents what is, not what is hoped for", () => {
    /* Two claims that would be false today if anybody wrote them. */
    assert(!/Scrydex|TCGdex|pokemontcg/i.test(README), "it names a provider that is not integrated");
    assert(!/card search|image-forward|browse by/i.test(README),
      "it describes a card search that does not exist");
    assert(/legacy `card_id`/.test(README), "it hides the legacy references that remain");
  });
});

run();
