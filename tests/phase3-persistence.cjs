/* ============================================================================
   PHASE 3 BATCH 2 — PERSISTENCE FOUNDATION

   The canonical world in Postgres: migrate, save, reload, and run domain
   commands transactionally. The database is PGlite — PostgreSQL compiled to
   WebAssembly, in process — so the SQL, constraints, JSONB, deferred checks and
   advisory locks under test are PostgreSQL's own. What PGlite cannot show is
   two connections contending: it runs one session and queues transactions. The
   serialization section says exactly what is and is not exercised here.

     A  migrations and schema
     B  round-trip fidelity
     C  durable commands
     D  refusals write nothing
     E  failures roll everything back
     F  validation at the boundary
     G  serialization and locking
     H  adapters
     I  boundaries
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const C = require("../domain/metyet-commands.js");
const RT = require("../domain/metyet-runtime.js");
const { createStore } = require("../domain/metyet-store.js");
const { projectForActor } = require("../domain/metyet-projection.js");
const { validateWorld } = require("../domain/metyet-world.js");
const { fromPGlite, fromPgPool, READ_ONLY_SNAPSHOT } = require("../persistence/database.js");
const { migrate, readMigrations, MIGRATION_LOCK_SQL } = require("../persistence/migrate.js");
const { createWorldRepository, TABLES, CHILD_TABLES, WORLD_LOCK_SQL } = require("../persistence/world-repository.js");
const { executeCommand } = require("../persistence/command-transaction.js");
const { CODES } = require("../persistence/errors.js");
const M = require("../dist/MetYet.cjs");
const { unrelatedWorld } = require("./fixture-unrelated.cjs");

const ROOT = path.join(__dirname, "..");
const FORGED_AT = "1999-12-31T23:59:59.000Z";
const ALL_TABLES = [...TABLES.map((t) => t.table), ...CHILD_TABLES.map((t) => t.table)];

/* ------------------------------------------------------------------ HARNESS */
let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

/* A migrated, empty database. Every schema the migrations own goes, so each
   test starts from nothing (Batch 3 added metyet_auth for accounts). */
async function fresh() {
  const pg = database();
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  return { pg, db, repo: createWorldRepository(db) };
}

/* Every stored row of every table plus the version, order-independent. */
async function dump(pg) {
  const out = {};
  for (const t of [...ALL_TABLES, "world_meta"]) {
    out[t] = (await pg.query(`select to_jsonb(t) as r from metyet.${t} t`)).rows.map((r) => stable(r.r)).sort();
  }
  return stable(out);
}

function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  return JSON.stringify(v === undefined ? null : v);
}
/* The world as JSON represents it, with optional collections as lists. */
const asJson = (w) => ({ ...JSON.parse(JSON.stringify(w)), preferences: w.preferences || [], activity: w.activity || [] });
const canonical = (w) => stable(asJson(w));
/* Equal worlds, or a failure naming the first path that differs. */
function sameWorld(actual, expected, msg) {
  const diff = (a, b, at) => {
    if (stable(a) === stable(b)) return null;
    if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
      if (Array.isArray(a) && a.length !== b.length) return `${at}: length ${a.length} vs ${b.length}`;
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const d = diff(a[k], b[k], `${at}.${k}`);
        if (d) return d;
      }
    }
    return `${at}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`.slice(0, 300);
  };
  const d = diff(asJson(actual), asJson(expected), "world");
  if (d) throw new Error(`${msg || "worlds differ"} — first difference at ${d}`);
}

/* A PGlite stand-in that records every statement and how each transaction ended,
   and can fail on demand. */
function instrumented(pg, { failWhen } = {}) {
  const log = [];
  let n = 0;
  const wrapped = {
    transaction: (fn) => {
      log.push({ event: "begin" });
      return pg.transaction(async (tx) => fn({
        query: async (sql, params) => {
          n += 1;
          log.push({ event: "query", sql: sql.trim() });
          if (failWhen && failWhen(sql.trim(), n)) throw new Error("injected connection failure");
          return tx.query(sql, params);
        },
        exec: (sql) => { log.push({ event: "exec", sql: sql.trim() }); return tx.exec(sql); },
      })).then((v) => { log.push({ event: "commit" }); return v; },
        (e) => { log.push({ event: "rollback" }); throw e; });
    },
  };
  const db = fromPGlite(wrapped);
  return { db, repo: createWorldRepository(db), log };
}
const writes = (log) => log.filter((e) => e.event === "query" && /^(insert|update|delete)\b/i.test(e.sql));

const rejects = async (promise, code, msg) => {
  try { await promise; } catch (e) {
    if (code) eq(e.code, code, (msg || "error code") + " — " + e.message);
    return e;
  }
  throw new Error((msg || "expected a rejection") + " — it resolved");
};

/* ------------------------------------------------------------------ WORLDS */
const card = (id, o = {}) => ({ id, name: o.name || "Charizard", set: "Base Set", num: o.num || "4/102",
  print: "Holo", edition: "Unlimited", language: "English", grade: o.grade || "PSA 9", condition: null, tags: [] });
const photos = (id) => ({ front: id + ":front", back: id + ":back" });
function seed() {
  return {
    catalog: [card("k1"), card("k2", { name: "Blastoise", num: "2/102" }), card("k5", { name: "Venusaur", num: "15/102" })],
    collectors: [{ id: "c1", name: "Casey" }, { id: "c2", name: "Dana" }],
    partners: [{ id: "p1", name: "Northline", tradeRate: 0.8 }, { id: "p2", name: "Second", tradeRate: 0.75 }],
    relationships: [{ partnerId: "p1", collectorId: "c1" }, { partnerId: "p1", collectorId: "c2" },
      { partnerId: "p2", collectorId: "c1", status: "accepted", note: "P2-PRIVATE-NOTE" }],
    invitations: [],
    goals: [{ id: "g1", collectorId: "c1", cardId: "k1", tier: "primary" },
      { id: "g2", collectorId: "c2", cardId: "k1", tier: "primary" },
      { id: "g3", collectorId: "c1", cardId: "k5", tier: "secondary" }],
    inventory: [
      { invId: "i1", partnerId: "p1", cardId: "k1", ask: 1000, cost: 3131.31, acquired: "2020-05-05", archived: false, photos: photos("i1") },
      { invId: "i2", partnerId: "p1", cardId: "k1", ask: "1100", cost: 800, archived: false, photos: photos("i2") },
      { invId: "i3", partnerId: "p2", cardId: "k1", ask: 1200, cost: 900, archived: false, photos: { front: null, back: null } },
    ],
    binder: [{ id: "b1", collectorId: "c1", cardId: "k2", market: 350, cert: null, photos: photos("b1") },
      { id: "b2", collectorId: "c2", cardId: "k5", market: 222, cert: null, photos: photos("b2") }],
    interests: [], conversations: [], opportunities: [], photoRequests: [], copyReviews: [],
  };
}
const TP1 = { partnerId: "p1" }, TP2 = { partnerId: "p2" }, C1 = { collectorId: "c1" }, C2 = { collectorId: "c2" };
const PLAN = { method: "meetup", date: "2026-09-20", time: "18:00", location: "Card shop" };
const runtime = () => RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 60000 });

/* A full deal and the commands around it. Each step names its actor, command and
   a payload built from the current world (trade row ids are minted mid-deal). */
const opp = (w) => w.opportunities.find((o) => o.goalId === "g1");
const row = (w) => opp(w).trade.cards[0].id;
const DEAL = [
  [C1, "sendMessage", () => ({ partnerId: "p1", cardId: "k1", text: "Is i1 still here?" })],
  [C1, "startOpportunity", () => ({ goalId: "g1", invId: "i1", amount: 900 })],
  [TP1, "proposePrice", (w) => ({ oppId: opp(w).id, amount: 980 })],
  [C1, "acceptPrice", (w) => ({ oppId: opp(w).id })],
  [C1, "proposeTradeSelection", (w) => ({ oppId: opp(w).id, binderIds: ["b1"] })],
  [TP1, "reviewTradeCard", (w) => ({ oppId: opp(w).id, decision: "accepted" })],
  [C1, "proposeMarketValue", (w) => ({ oppId: opp(w).id, tradeCardId: row(w), amount: 300 })],
  [TP1, "acceptMarketValue", (w) => ({ oppId: opp(w).id, tradeCardId: row(w) })],
  [TP1, "proposeTradePercent", (w) => ({ oppId: opp(w).id, tradeCardId: row(w), percent: 0.8 })],
  [C1, "acceptTradePercent", (w) => ({ oppId: opp(w).id, tradeCardId: row(w) })],
  [TP1, "acceptDeal", (w) => ({ oppId: opp(w).id })],
  [C1, "proposeFinalBalance", (w) => ({ oppId: opp(w).id, amount: 450 })],
  [TP1, "acceptDeal", (w) => ({ oppId: opp(w).id })],
  [C1, "acceptDeal", (w) => ({ oppId: opp(w).id })],
  [TP1, "proposeFulfillment", (w) => ({ oppId: opp(w).id, plan: PLAN })],
  [C1, "confirmFulfillmentPlan", (w) => ({ oppId: opp(w).id })],
  [TP1, "confirmHandoff", (w) => ({ oppId: opp(w).id })],
  [C1, "confirmHandoff", (w) => ({ oppId: opp(w).id })],
  [C1, "markDealViewed", (w) => ({ oppId: opp(w).id, surface: "messages" })],
  [TP1, "markDealViewed", (w) => ({ oppId: opp(w).id, surface: "timeline" })],
  [TP1, "inviteCollector", () => ({ email: "new@example.test", note: "met at a show", collector: { name: "New Person" } })],
  [TP1, "recordNote", () => ({ collectorId: "c2", cardId: "k1", milestone: "Called Dana", activity: { type: "manual", text: "Called Dana" } })],
  [C1, "requestPhotos", () => ({ invId: "i3" })],
  [TP2, "setInterest", () => ({ binderId: "b1", on: true })],
  [TP1, "updateInventoryCopy", () => ({ invId: "i2", patch: { ask: "1150" } })],
];

/* Runs steps through executeCommand and, alongside, through execute() in memory
   with an identical runtime script: the persisted world must equal the mirror. */
async function drive(repo, steps, { from = seed() } = {}) {
  const persistedRuntime = runtime(), mirrorRuntime = runtime();
  let mirror = from;
  const results = [];
  for (const [actor, command, build] of steps) {
    const payload = { ...build(mirror), at: FORGED_AT };
    const r = await executeCommand(repo, { actor, command, payload, runtime: persistedRuntime });
    const m = C.execute(mirror, actor, command, payload, mirrorRuntime);
    assert(r.ok === m.ok, `${command}: persisted ${r.ok} vs mirror ${m.ok} (${r.refused || m.refused})`);
    assert(r.ok, `${command} refused: ${r.refused}`);
    mirror = m.state;
    results.push({ command, ...r });
  }
  return { mirror, results };
}

/* ============================================================== A */
describe("A. migrations and schema", () => {
  test("the migration applies to an empty database and yields an empty, valid world at version 0", async () => {
    const pg = database();
    await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
    const result = await migrate(fromPGlite(pg));
    eq(result.applied.join(), readMigrations().map((m) => m.version).join(), "every migration applied, in order");
    assert(result.applied[0] === "0001_canonical_world", "starting with the canonical world");
    const tables = (await pg.query("select table_name from information_schema.tables where table_schema = 'metyet' order by 1")).rows.map((r) => r.table_name);
    eq(tables.join(), [...ALL_TABLES, "schema_migrations", "world_meta"].sort().join(), "tables");
    const repo = createWorldRepository(fromPGlite(pg));
    eq(await repo.readVersion(), 0, "version");
    const world = await repo.loadWorld();
    assert(validateWorld(world).ok, "empty world is valid");
    Object.values(world).forEach((xs) => eq(xs.length, 0, "empty collection"));
    const publicTables = (await pg.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'")).rows[0].n;
    eq(publicTables, 0, "nothing in public");
  });

  test("re-running applies nothing; each applied file is recorded with its checksum", async () => {
    const { db, pg } = await fresh();
    eq((await migrate(db)).applied.length, 0, "no-op");
    const recorded = (await pg.query("select version, checksum from metyet.schema_migrations")).rows;
    eq(recorded.length, readMigrations().length, "one row per file");
    eq(recorded[0].checksum, readMigrations()[0].checksum, "checksum matches the file");
  });

  test("an edited migration is refused, and the database is untouched", async () => {
    const { db, pg } = await fresh();
    const before = await dump(pg);
    const [first] = readMigrations();
    await rejects(migrate(db, { migrations: [{ ...first, sql: first.sql + "\n-- edited", checksum: "different" }] }), CODES.migrationChanged);
    eq(await dump(pg), before, "unchanged");
  });

  test("a failing migration rolls back entirely", async () => {
    const { db, pg } = await fresh();
    const broken = { version: "0002_broken", checksum: "x",
      sql: "create table metyet.half_done (id text primary key); select no_such_function();" };
    await rejects(migrate(db, { migrations: [...readMigrations(), broken] }));
    eq((await pg.query("select count(*)::int as n from metyet.schema_migrations where version = '0002_broken'")).rows[0].n, 0, "not recorded");
    eq((await pg.query("select to_regclass('metyet.half_done') is null as gone")).rows[0].gone, true, "no partial table");
  });

  test("constraints are structural and deferred; history-bearing references stay unconstrained", async () => {
    const { pg } = await fresh();
    const cons = (await pg.query(`select conname, contype, condeferrable, condeferred, conrelid::regclass::text as tbl
      from pg_constraint where connamespace = 'metyet'::regnamespace and contype in ('f', 'u', 'x')`)).rows;
    assert(cons.length > 30, "constraints found");
    cons.forEach((c) => assert(c.condeferrable && c.condeferred || c.conname === "inventory_copies_owner_key"
      || c.conname === "binder_copies_owner_key" || /_participants_key|_collector_key$/.test(c.conname),
      `${c.conname} is deferred (or a referenced key)`));
    const fkCols = (await pg.query(`select a.attname as col from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.conrelid = 'metyet.opportunities'::regclass and c.contype = 'f'`)).rows.map((r) => r.col);
    assert(!fkCols.includes("goal_id"), "no foreign key on opportunities.goal_id (history outlives Goals)");
    const binderUnique = (await pg.query(`select count(*)::int as n from pg_indexes where schemaname = 'metyet'
      and tablename = 'opportunity_trade_refs' and indexdef ilike '%unique%binder_id%'`)).rows[0].n;
    eq(binderUnique, 0, "no uniqueness on a binder copy across deals");
  });

  test("migration files are deterministic, plain SQL in the metyet schema", () => {
    const files = fs.readdirSync(path.join(ROOT, "persistence", "migrations"));
    files.forEach((f) => assert(/^\d{4}_[a-z0-9_]+\.sql$/.test(f), "named " + f));
    const sql = readMigrations()[0].sql;
    assert(!/\bpublic\./.test(sql), "no public schema objects");
    assert(!/now\(\)|random\(|gen_random_uuid|nextval|serial\b/i.test(sql.replace(/--.*$/gm, "")), "no clock, randomness or sequences in the schema");
    assert(!/create\s+(or\s+replace\s+)?(function|trigger)/i.test(sql), "no triggers or functions: no rules in SQL");
  });
});

/* ============================================================== B */
describe("B. round-trip fidelity", () => {
  test("the product seed, as the store holds it, reloads exactly — optional preferences become []", async () => {
    const { repo } = await fresh();
    const world = createStore(M.buildCanonicalSeed()).get();
    eq(world.preferences, undefined, "the product seed has no preferences");
    const saved = await repo.saveWorld(world);
    eq(saved.version, 1, "first save is version 1");
    const back = await repo.loadWorld();
    sameWorld(back, world, "same world");
    assert(Array.isArray(back.preferences) && back.preferences.length === 0, "preferences normalized to []");
    assert(validateWorld(back).ok, "valid");
  });

  test("the review seed and every demo stage reload exactly", async () => {
    const seeds = [["review", { review: true }], ...["pre-deal", "agree-price", "select-trade", "value-trade", "deal",
      "fulfillment", "completed"].map((s) => [s, { review: true, demoStage: s }])];
    for (const [name, opts] of seeds) {
      const { repo } = await fresh();
      const world = createStore(M.buildCanonicalSeed(opts)).get();
      await repo.saveWorld(world);
      sameWorld(await repo.loadWorld(), world, name);
    }
  });

  test("the multi-party visibility fixture reloads exactly and projects identically for every actor", async () => {
    const { repo } = await fresh();
    const w = unrelatedWorld();
    const world = w.store.get();
    await repo.saveWorld(world);
    const back = await repo.loadWorld();
    sameWorld(back, world, "same world");
    for (const [name, actor] of Object.entries(w.actors)) {
      eq(stable(projectForActor(back, actor)), stable(projectForActor(world, actor)), "projection for " + name);
    }
  });

  test("a command-built world reloads exactly", async () => {
    const { repo } = await fresh();
    await repo.saveWorld(seed());
    const { mirror } = await drive(repo, DEAL);
    sameWorld(await repo.loadWorld(), mirror, "persisted = in-memory");
  });

  test("worlds without preferences or activity load with both as []", async () => {
    const { repo } = await fresh();
    const world = seed();
    assert(!("preferences" in world) && !("activity" in world), "both omitted");
    await repo.saveWorld(world);
    const back = await repo.loadWorld();
    eq(JSON.stringify([back.preferences, back.activity]), "[[],[]]", "normalized");
  });

  test("private canonical data is stored and reloaded, not dropped because projection hides it", async () => {
    const { repo, pg } = await fresh();
    const w = unrelatedWorld();
    await repo.saveWorld(seed());
    const { mirror } = await drive(repo, DEAL);
    const back = await repo.loadWorld();
    const i1 = back.inventory.find((i) => i.invId === "i1");
    eq(i1.cost, 3131.31, "acquisition cost"); eq(i1.acquired, "2020-05-05", "acquisition date");
    eq(back.partners.find((p) => p.id === "p1").tradeRate, 0.8, "default trade %");
    eq(back.binder.find((b) => b.id === "b1").market, 350, "binder reference value");
    eq(back.relationships[2].note, "P2-PRIVATE-NOTE", "relationship note");
    const viewed = back.opportunities.find((o) => o.goalId === "g1").viewedAt;
    assert(viewed.tp && viewed.collector, "both seats' reading positions");
    assert(back.activity.some((a) => a.partnerId === "p1"), "partner-private activity");
    sameWorld(back, mirror);
    const dbText = (await pg.query("select string_agg(attrs::text, ' ') as t from metyet.inventory_copies")).rows[0].t;
    assert(dbText.includes("3131.31"), "cost is in the database");
    const { repo: r2 } = await fresh();
    await r2.saveWorld(w.store.get());
    const legacy = (await r2.loadWorld());
    assert(legacy.partners.find((p) => p.id === "pB").internal, "an unclassified partner field survives");
    const ownerless = legacy.activity.find((a) => !("partnerId" in a));
    const ownerlessBefore = w.store.get().activity.find((a) => !("partnerId" in a));
    eq(!!ownerless, !!ownerlessBefore, "an ownerless legacy activity row keeps having no partnerId key");
  });

  test("order, null and absence are kept; amounts keep their exact type", async () => {
    const { repo } = await fresh();
    const world = createStore(M.buildCanonicalSeed()).get();
    await repo.saveWorld(world);
    const back = await repo.loadWorld();
    eq(back.catalog.map((c) => c.id).join(), world.catalog.map((c) => c.id).join(), "catalog order");
    eq(back.activity.map((a) => a.id).join(), world.activity.map((a) => a.id).join(), "activity order (newest first)");
    const done = back.opportunities.filter((o) => o.goalId === null);
    eq(done.length, world.opportunities.filter((o) => o.goalId === null).length, "null goal ids stay null");
    assert(back.opportunities.every((o) => o.invId === null), "null invIds stay null");
    const { repo: r2 } = await fresh();
    await r2.saveWorld(seed());
    const s = await r2.loadWorld();
    eq(s.inventory[1].ask, "1100", "a numeric-string amount stays a string");
    eq(s.inventory[0].ask, 1000, "a number stays a number");
    assert(!("status" in s.relationships[0]) && s.relationships[2].status === "accepted", "absent stays absent");
    eq(s.inventory[2].photos.front, null, "nested null");
  });

  test("exact-copy references are relational rows; the demo world's shared binder copies persist", async () => {
    const { repo, pg } = await fresh();
    const world = createStore(M.buildCanonicalSeed()).get();
    await repo.saveWorld(world);
    const refs = (await pg.query("select opportunity_id, binder_id from metyet.opportunity_trade_refs")).rows;
    const tradeRows = world.opportunities.flatMap((o) => (o.trade && o.trade.cards) || []);
    eq(refs.length, tradeRows.length, "one ref row per trade row");
    const shared = (await pg.query(`select binder_id, count(distinct opportunity_id)::int as deals
      from metyet.opportunity_trade_refs group by binder_id having count(distinct opportunity_id) > 1`)).rows;
    assert(shared.length >= 5, "binder copies referenced by several deals persisted: " + shared.length);
    const { repo: r2, pg: pg2 } = await fresh();
    await r2.saveWorld(seed());
    await drive(r2, DEAL.slice(0, 5));
    const o = (await pg2.query("select inv_id, partner_id from metyet.opportunities")).rows[0];
    eq(`${o.inv_id}/${o.partner_id}`, "i1/p1", "the exact InventoryCopy and its owner");
  });

  test("saving an unchanged world writes nothing and keeps the version", async () => {
    const { repo, pg } = await fresh();
    await repo.saveWorld(seed());
    const before = await dump(pg);
    const again = await repo.saveWorld(await repo.loadWorld());
    eq(again.rowsWritten, 0, "no rows"); eq(again.version, 1, "same version");
    eq(await dump(pg), before, "database unchanged");
  });
});

/* ============================================================== C */
describe("C. durable commands", () => {
  test("load → execute → persist → reload: a new Goal with the runtime's id and time", async () => {
    const { repo } = await fresh();
    await repo.saveWorld(seed());
    const r = await executeCommand(repo, { actor: C2, command: "addGoal",
      payload: { cardId: "k2", tier: "primary", at: FORGED_AT }, runtime: runtime() });
    assert(r.ok, "ok");
    eq(r.value, "g000001", "runtime id");
    eq(r.version, 2, "version advanced");
    eq(JSON.stringify(r.changes), JSON.stringify({ goals: { inserted: 1, updated: 0, deleted: 0 } }), "one row written");
    const goal = (await repo.loadWorld()).goals.find((g) => g.id === "g000001");
    eq(goal.since, "2030-01-01T00:00:00.000Z", "runtime time survives reload");
    eq(goal.collectorId, "c2", "owner");
  });

  test("a full deal, step by step, persists exactly what execute() produced at every step", async () => {
    const { repo } = await fresh();
    await repo.saveWorld(seed());
    const persistedRuntime = runtime(), mirrorRuntime = runtime();
    let mirror = seed();
    for (const [actor, command, build] of DEAL) {
      const payload = build(mirror);
      const r = await executeCommand(repo, { actor, command, payload, runtime: persistedRuntime });
      const m = C.execute(mirror, actor, command, payload, mirrorRuntime);
      assert(r.ok && m.ok, command);
      mirror = m.state;
      sameWorld(await repo.loadWorld(), mirror, "after " + command);
    }
    const done = (await repo.loadWorld()).opportunities.find((o) => o.goalId === "g1");
    eq(done.stage, "completed", "completed");
    eq(done.id, "o000002", "the opportunity id minted by the runtime");
    assert(/^tck2-\d{6}$/.test(done.trade.cards[0].id), "the trade row id minted at submission");
    eq(done.completedAt, opp(mirror).completedAt, "completion time");
  });

  test("generated ids and authoritative times survive; no caller clock reaches the database", async () => {
    const { repo, pg } = await fresh();
    await repo.saveWorld(seed());
    const { mirror } = await drive(repo, DEAL);
    const text = await dump(pg);
    assert(!text.includes(FORGED_AT) && !text.includes("1999-"), "a forged time was stored");
    const back = await repo.loadWorld();
    const entry = back.conversations[0].entries[0];
    eq(entry.id, mirror.conversations[0].entries[0].id, "entry id"); assert(/^e\d{6}$/.test(entry.id), "runtime entry id");
    eq(entry.at, "2030-01-01T00:00:00.000Z", "entry time is the first runtime reading");
    const invitation = back.invitations[0];
    assert(/^inv-\d{6}$/.test(invitation.id) && /^2030-01-01T/.test(invitation.at), "invitation id and time");
    eq(back.inventory[1].ask, "1150", "an amount updated as a string stays a string");
    eq((await pg.query("select count(*)::int as n from metyet.conversation_entries")).rows[0].n,
      back.conversations.reduce((n, c) => n + c.entries.length, 0), "entries are rows");
  });

  test("history persists: a completed deal keeps the id of a Goal removed afterwards", async () => {
    const { repo, pg } = await fresh();
    await repo.saveWorld(seed());
    await drive(repo, DEAL.slice(0, 18));
    const r = await executeCommand(repo, { actor: C1, command: "removeGoal", payload: { goalId: "g1" }, runtime: runtime() });
    assert(r.ok, "a satisfied Goal can be removed: " + r.refused);
    const back = await repo.loadWorld();
    assert(!back.goals.some((g) => g.id === "g1"), "the Goal is gone");
    eq(back.opportunities[0].goalId, "g1", "the completed deal still names it");
    eq((await pg.query("select goal_id from metyet.opportunities")).rows[0].goal_id, "g1", "and so does its column");
  });

  test("every successful save advances the version once; a no-op command writes nothing", async () => {
    const { repo, pg } = await fresh();
    await repo.saveWorld(seed());
    const { results } = await drive(repo, DEAL.slice(0, 3));
    eq(results.map((r) => r.version).join(), "2,3,4", "one version per command");
    const before = await dump(pg);
    const r = await executeCommand(repo, { actor: TP2, command: "setInterest", payload: { binderId: "b1", on: false }, runtime: runtime() });
    assert(r.ok, "accepted");
    eq(r.version, 4, "no version bump"); eq(JSON.stringify(r.changes), "{}", "no changes");
    eq(await dump(pg), before, "database unchanged");
  });

  test("the prototype runtime is refused before any transaction opens", async () => {
    const { pg } = await fresh();
    const spy = instrumented(pg);
    await rejects(executeCommand(spy.repo, { actor: C1, command: "addGoal", payload: { cardId: "k2" }, runtime: RT.prototypeRuntime() }),
      CODES.runtimeNotAuthoritative);
    await rejects(executeCommand(spy.repo, { actor: C1, command: "addGoal", payload: { cardId: "k2" } }), CODES.runtimeNotAuthoritative);
    eq(spy.log.length, 0, "no transaction");
  });
});

/* ============================================================== D */
describe("D. refused commands write nothing", () => {
  test("a refusal returns the domain's code and leaves every row and the version identical", async () => {
    const { pg } = await fresh();
    await createWorldRepository(fromPGlite(pg)).saveWorld(seed());
    const before = await dump(pg);
    const spy = instrumented(pg);
    const r = await executeCommand(spy.repo, { actor: TP1, command: "startOpportunity",
      payload: { goalId: "g1", invId: "i1", amount: 900 }, runtime: runtime() });
    eq(r.ok, false); eq(r.refused, "not-owner", "the domain's refusal"); eq(r.version, 1, "version reported");
    eq(await dump(pg), before, "database identical");
    eq(writes(spy.log).length, 0, "no insert, update or delete was issued");
    eq(spy.log[spy.log.length - 1].event, "rollback", "the transaction rolled back");
  });

  test("refusals of every kind leave the database identical", async () => {
    const { pg, repo } = await fresh();
    await repo.saveWorld(seed());
    await drive(repo, DEAL.slice(0, 3));
    const before = await dump(pg);
    const o = (await repo.loadWorld()).opportunities[0].id;
    const cases = [
      [{ partnerId: "p404" }, "addGoal", { cardId: "k2" }, "unknown-actor"],
      [C2, "acceptPrice", { oppId: o }, "not-participant"],
      [TP1, "proposePrice", { oppId: o, amount: 990 }, "not-your-turn"],
      [C1, "chooseCashOnly", { oppId: o }, "wrong-stage"],
      [C1, "removeGoal", { goalId: "g1" }, "goal-locked"],
      [C1, "noSuchCommand", {}, "unknown-command"],
    ];
    for (const [actor, command, payload, code] of cases) {
      const r = await executeCommand(repo, { actor, command, payload, runtime: runtime() });
      eq(r.refused, code, command);
      eq(await dump(pg), before, command + ": identical");
    }
  });
});

/* ============================================================== E */
describe("E. failures roll everything back", () => {
  test("a failure after the first write rolls back every write of the command", async () => {
    const { pg, repo } = await fresh();
    await repo.saveWorld(seed());
    const before = await dump(pg);
    const original = await repo.loadWorld();
    let writesSeen = 0;
    const faulty = instrumented(pg, { failWhen: (sql) => /^(insert|delete)\b/i.test(sql) && ++writesSeen === 2 });
    const e = await rejects(executeCommand(faulty.repo, { actor: TP1, command: "recordNote",
      payload: { collectorId: "c2", cardId: "k1", milestone: "Called", activity: { type: "manual", text: "Called" } }, runtime: runtime() }),
      CODES.database);
    assert(/injected/.test(e.cause.message), "the underlying cause is kept");
    assert(writes(faulty.log).length >= 2, "a write had already been issued");
    eq(faulty.log[faulty.log.length - 1].event, "rollback", "rolled back");
    eq(await dump(pg), before, "database identical");
    sameWorld(await repo.loadWorld(), original, "the original world reloads");
  });

  test("a failure at COMMIT, after every write succeeded, leaves nothing behind", async () => {
    const { pg, repo } = await fresh();
    await repo.saveWorld(seed());
    /* Test-only: a deferred trigger that fails when the transaction commits. */
    await pg.exec(`create function metyet.test_fail_at_commit() returns trigger language plpgsql as
      $$ begin raise exception 'injected commit-time failure'; end $$;
      create constraint trigger test_fail_at_commit after insert on metyet.activity
      deferrable initially deferred for each row execute function metyet.test_fail_at_commit();`);
    const before = await dump(pg);
    await rejects(executeCommand(repo, { actor: TP1, command: "recordNote",
      payload: { collectorId: "c2", cardId: "k1", milestone: "Called", activity: { type: "manual", text: "Called" } }, runtime: runtime() }));
    eq(await dump(pg), before, "the thread, its entry and the activity row were all rolled back");
    eq((await repo.loadWorld()).conversations.length, 0, "no thread");
  });

  test("a save based on a stale version is refused and rolled back", async () => {
    const { pg, repo } = await fresh();
    await repo.saveWorld(seed());
    const before = await dump(pg);
    await rejects(repo.withTransaction(async (tx) => {
      await repo.lockWorld(tx);
      const world = await repo.loadWorld(tx);
      const next = C.execute(world, C2, "addGoal", { cardId: "k2" }, runtime()).state;
      return repo.saveWorld(next, tx, { expectedVersion: 0 });
    }), CODES.versionConflict);
    eq(await dump(pg), before, "unchanged");
  });
});

/* ============================================================== F */
describe("F. validation at the boundary", () => {
  test("an invalid stored world is rejected on load, with validateWorld's diagnostics, before any command runs", async () => {
    const { pg, repo } = await fresh();
    await repo.saveWorld(seed());
    await drive(repo, DEAL.slice(0, 2));
    await pg.query("delete from metyet.goals where id = 'g1'");            // the live deal's Goal
    const before = await dump(pg);
    const e = await rejects(repo.loadWorld(), CODES.invalidWorld);
    assert(e.details.errors.some((x) => x.code === "ref.unknown" && /goalId/.test(x.path)), "names the dangling Goal");
    await rejects(executeCommand(repo, { actor: C1, command: "addGoal", payload: { cardId: "k2" }, runtime: runtime() }), CODES.invalidWorld);
    eq(await dump(pg), before, "nothing written");
  });

  test("an invalid next world is not committed", async () => {
    const { pg, repo } = await fresh();
    await repo.saveWorld(seed());
    const before = await dump(pg);
    /* A faulty runtime whose ids collide with existing records. */
    const colliding = RT.createRuntime({ now: () => "2030-01-01T00:00:00.000Z", newId: (p) => (p === "g" ? "g1" : p + "1") });
    const e = await rejects(executeCommand(repo, { actor: C2, command: "addGoal", payload: { cardId: "k2" }, runtime: colliding }),
      CODES.invalidNextWorld);
    assert(e.details.errors.some((x) => x.code === "id.duplicate"), "the duplicate id is named");
    eq(await dump(pg), before, "nothing written");
  });

  test("saveWorld refuses an invalid or unknown-shaped world before issuing a single statement", async () => {
    const { pg } = await fresh();
    const spy = instrumented(pg);
    const broken = seed(); broken.goals[0].cardId = "k404";
    const e = await rejects(spy.repo.saveWorld(broken), CODES.invalidInput);
    assert(e.details.errors[0].path === "goals[0].cardId", "diagnostic path");
    const dangling = seed();
    dangling.opportunities.push({ id: "o9", collectorId: "c1", partnerId: "p1", cardId: "k1", goalId: null, stage: "completed",
      trade: { submitted: true, cards: [{ id: "tc9", cardId: "k2", binderId: "b-missing" }] } });
    await rejects(spy.repo.saveWorld(dangling), CODES.invalidInput, "a synthetic fixture with a dangling binder copy");
    await rejects(spy.repo.saveWorld({ ...seed(), somethingNew: [] }), CODES.unknownCollection);
    eq(spy.log.length, 0, "no transaction was opened");
  });

  test("a relational mirror that disagrees with its record is reported, not trusted", async () => {
    const { pg, repo } = await fresh();
    await repo.saveWorld(seed());
    await drive(repo, DEAL.slice(0, 6));
    await pg.query("update metyet.opportunity_trade_refs set binder_id = null");
    await rejects(repo.loadWorld(), CODES.referenceDrift, "trade refs");
    await pg.query(`update metyet.opportunity_trade_refs r set binder_id = 'b1'`);
    assert((await repo.loadWorld()).opportunities.length === 1, "restored");
    await pg.query("update metyet.opportunities set attrs = attrs || '{\"invId\": \"i2\"}'");
    await rejects(repo.loadWorld(), CODES.referenceDrift, "inv_id mirror");
  });

  test("the schema itself refuses structural corruption written around the repository", async () => {
    const { pg, repo } = await fresh();
    await repo.saveWorld(seed());
    await rejects(pg.transaction(async (tx) => {
      await tx.query(`insert into metyet.opportunities (id, ord, collector_id, partner_id, card_id, inv_id, attrs)
        values ('o-bad', 9, 'c1', 'p1', 'k1', 'i3', '{}')`);                 // i3 belongs to p2
    }), null, "a copy owned by another partner");
    await rejects(pg.transaction(async (tx) => {
      await tx.query(`insert into metyet.relationships (ord, partner_id, collector_id, attrs) values (9, 'p1', 'c1', '{}')`);
    }), null, "a second current relationship for one pair");
    await rejects(pg.query(`insert into metyet.goals (id, ord, collector_id, card_id, attrs) values ('g9', 9, 'c404', 'k1', '{}')`),
      null, "a Goal for an unknown collector");
    assert((await repo.loadWorld()).goals.length === 3, "the world is intact");
  });
});

/* ============================================================== G */
describe("G. serialization and locking", () => {
  test("the world lock is transaction-scoped, fixed, and distinct from the migration lock", () => {
    assert(/^select pg_advisory_xact_lock\(\d+\)$/.test(WORLD_LOCK_SQL), "pg_advisory_xact_lock with a constant key");
    assert(!/pg_advisory_lock\(/.test(fs.readFileSync(path.join(ROOT, "persistence", "world-repository.js"), "utf8")), "never a session lock");
    assert(WORLD_LOCK_SQL !== MIGRATION_LOCK_SQL, "separate locks");
  });

  test("a command transaction takes the lock first, at READ COMMITTED, then loads", async () => {
    const { pg } = await fresh();
    await createWorldRepository(fromPGlite(pg)).saveWorld(seed());
    const spy = instrumented(pg);
    await executeCommand(spy.repo, { actor: C2, command: "addGoal", payload: { cardId: "k2" }, runtime: runtime() });
    const queries = spy.log.filter((e) => e.event === "query").map((e) => e.sql);
    eq(queries[0], WORLD_LOCK_SQL, "lock is the first statement");
    assert(!queries.some((s) => /isolation level/i.test(s)), "no isolation change: READ COMMITTED sees commits made while waiting");
    assert(queries.indexOf(queries.find((s) => /from metyet\.goals/.test(s))) > 0, "load after the lock");
    eq(spy.log[spy.log.length - 1].event, "commit");
  });

  test("a read-only load reads one snapshot", async () => {
    const { pg } = await fresh();
    const spy = instrumented(pg);
    await spy.repo.loadWorld();
    eq(spy.log[1].sql, READ_ONLY_SNAPSHOT, "REPEATABLE READ, READ ONLY first");
  });

  test("saving without holding the world lock is refused by Postgres' own lock table", async () => {
    const { pg, repo } = await fresh();
    await repo.saveWorld(seed());
    const before = await dump(pg);
    await rejects(repo.withTransaction(async (tx) => {
      const version = await repo.readVersion(tx);
      const world = await repo.loadWorld(tx);
      return repo.saveWorld(C.execute(world, C2, "addGoal", { cardId: "k2" }, runtime()).state, tx, { expectedVersion: version });
    }), CODES.lockNotHeld);
    eq(await dump(pg), before, "nothing written");
  });

  test("an in-transaction save must name the version it loaded", async () => {
    const { pg, repo } = await fresh();
    await repo.saveWorld(seed());
    const before = await dump(pg);
    await rejects(repo.withTransaction(async (tx) => {
      await repo.lockWorld(tx);
      const world = await repo.loadWorld(tx);
      return repo.saveWorld(C.execute(world, C2, "addGoal", { cardId: "k2" }, runtime()).state, tx);
    }), CODES.versionRequired);
    eq(await dump(pg), before, "nothing written");
  });

  test("a world that moves after the command loaded it is not overwritten", async () => {
    const { pg, repo } = await fresh();
    await repo.saveWorld(seed());
    /* Stand-in for a writer that got past the lock: the version moves between
       this command's load and its save. */
    const moved = { ...repo, loadWorld: async (tx) => {
      const world = await repo.loadWorld(tx);
      await tx.query("update metyet.world_meta set version = version + 1");
      return world;
    } };
    const before = await dump(pg);
    await rejects(executeCommand(moved, { actor: C2, command: "addGoal", payload: { cardId: "k2" }, runtime: runtime() }),
      CODES.versionConflict);
    eq(await dump(pg), before, "rolled back, including the moved version");
  });

  test("the lock is released by commit, by refusal and by failure", async () => {
    const { pg, repo } = await fresh();
    await repo.saveWorld(seed());
    const held = async () => (await pg.query("select count(*)::int as n from pg_locks where locktype = 'advisory'")).rows[0].n;
    await executeCommand(repo, { actor: C2, command: "addGoal", payload: { cardId: "k2" }, runtime: runtime() });
    eq(await held(), 0, "after commit");
    await executeCommand(repo, { actor: TP1, command: "addGoal", payload: { cardId: "k2" }, runtime: runtime() });
    eq(await held(), 0, "after refusal");
    const faulty = instrumented(pg, { failWhen: (sql) => /^insert/i.test(sql) });
    await rejects(executeCommand(faulty.repo, { actor: C2, command: "addGoal", payload: { cardId: "k5" }, runtime: runtime() }));
    eq(await held(), 0, "after failure");
  });

  test("two racing commands on one Goal: one negotiation commits, the other is refused on the committed world", async () => {
    const { repo } = await fresh();
    await repo.saveWorld(seed());
    const rt = runtime();
    const race = await Promise.all(["i1", "i2"].map((invId) => executeCommand(repo, { actor: C1, command: "startOpportunity",
      payload: { goalId: "g1", invId, amount: 900 }, runtime: rt })));
    eq(race.filter((r) => r.ok).length, 1, "exactly one succeeds");
    eq(race.find((r) => !r.ok).refused, "already-negotiating", "the other sees the first");
    const world = await repo.loadWorld();
    eq(world.opportunities.length, 1, "no divergent successor");
    assert(validateWorld(world).ok, "valid");
    eq(await repo.readVersion(), 2, "one version step");
  });

  test("concurrent commands from different actors are all kept — no lost update", async () => {
    const { repo } = await fresh();
    await repo.saveWorld(seed());
    const rt = runtime();
    const jobs = [[C1, "k2"], [C2, "k2"], [C2, "k5"], [TP1, null]].map(([actor, cardId]) => (cardId
      ? executeCommand(repo, { actor, command: "addGoal", payload: { cardId }, runtime: rt })
      : executeCommand(repo, { actor, command: "updatePartnerProfile", payload: { patch: { about: "Vintage" } }, runtime: rt })));
    const results = await Promise.all(jobs);
    assert(results.every((r) => r.ok), "all accepted");
    eq(results.map((r) => r.version).sort().join(), "2,3,4,5", "each committed on its own version");
    const world = await repo.loadWorld();
    eq(world.goals.length, 6, "three new Goals");
    eq(world.partners.find((p) => p.id === "p1").about, "Vintage", "and the profile change");
  });
});

/* ============================================================== H */
describe("H. adapters", () => {
  const fakePool = ({ failOn } = {}) => {
    const log = [];
    const client = {
      query: async (sql) => { log.push(sql); if (failOn && sql === failOn) throw new Error("boom"); return { rows: [] }; },
      release: () => log.push("release"),
    };
    return { log, pool: { connect: async () => client } };
  };

  test("a node-postgres pool: begin, work, commit, release", async () => {
    const { log, pool } = fakePool();
    const out = await fromPgPool(pool).transaction(async (tx) => { await tx.query("select 1"); return 7; });
    eq(out, 7);
    eq(log.join("|"), "begin|select 1|commit|release");
  });

  test("a node-postgres pool: an error rolls back, releases and rethrows", async () => {
    const { log, pool } = fakePool({ failOn: "select 1" });
    await rejects(fromPgPool(pool).transaction(async (tx) => { await tx.query("select 1"); }));
    eq(log.join("|"), "begin|select 1|rollback|release");
  });

  test("a node-postgres pool: read-only transactions take one snapshot", async () => {
    const { log, pool } = fakePool();
    await fromPgPool(pool).transaction(async () => null, { readOnly: true });
    eq(log.join("|"), `begin|${READ_ONLY_SNAPSHOT}|commit|release`);
  });
});

/* ============================================================== I */
describe("I. boundaries", () => {
  const source = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => /\.(js|jsx|cjs|mjs)$/.test(f))
    .map((f) => [f, fs.readFileSync(path.join(ROOT, dir, f), "utf8")]);

  test("the domain and the apps never import persistence or a database library", () => {
    for (const dir of ["domain", "src", "collector", "shell"]) {
      for (const [f, text] of source(dir)) {
        assert(!/persistence\/|@electric-sql|require\(["']pg["']\)|from ["']pg["']/.test(text), `${dir}/${f} imports persistence or a driver`);
      }
    }
  });

  test("persistence holds no product rule and no prototype mechanic", () => {
    for (const [f, raw] of source("persistence")) {
      const text = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      assert(!/react|createStore|prototypeRuntime\(|buildCanonicalSeed|@electric-sql/.test(text), `${f} reaches into UI, the prototype or the test engine`);
      assert(!/COMMANDS\.|isRelated|nextActor|projectForActor/.test(text), `${f} reimplements or reads a domain rule`);
    }
  });

  test("PGlite is a development dependency only, and no ORM was added", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    assert(pkg.devDependencies["@electric-sql/pglite"], "devDependency");
    assert(!pkg.dependencies["@electric-sql/pglite"], "the test engine never ships");
    const orms = ["prisma", "@prisma/client", "drizzle-orm", "sequelize", "typeorm", "knex", "mongoose", "objection"];
    orms.forEach((name) => assert(!pkg.dependencies[name] && !pkg.devDependencies[name], name + " was added"));
  });

  test("the in-memory prototype store still works as before", () => {
    const store = createStore(seed());
    const g = store.execute(C2, "addGoal", { cardId: "k2", at: "2026-08-14" });
    assert(g.ok, "prototype command ok");
    eq(store.get().goals.find((x) => x.id === g.value).since, "2026-08-14", "demo clock honoured");
  });
});

run();
