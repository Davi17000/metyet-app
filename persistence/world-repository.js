/* ============================================================================
   THE WORLD REPOSITORY — ONE CANONICAL WORLD, IN AND OUT OF POSTGRES

     const repo = createWorldRepository(db)          // db: see database.js
     repo.withTransaction(fn, { readOnly })          // fn(tx)
     repo.lockWorld(tx)                              // the serialization lock
     repo.loadWorld(tx?)    -> world                 // validated, domain shape
     repo.saveWorld(world, tx, { expectedVersion })  -> { version, changes }
     repo.saveWorld(world)  -> replaces the stored world (seed, restore)
     repo.readVersion(tx?)  -> number

   There is one world and one repository; there is no Trusted Partner or
   Collector repository. The repository knows the SHAPE of the canonical world
   (which collection is which table, which fields are references) and nothing
   of what the product does with it: no command, turn, stage or privacy rule is
   read or enforced here. Those stay in execute(), projectForActor() and
   validateWorld().

   LOAD reads every table (one snapshot), rebuilds each collection in its
   stored order in exactly the domain's record shape, normalises absent
   optional collections to [], checks every relational mirror against the
   record it mirrors, and runs validateWorld(). Anything short of a valid world
   is an error — never a partial world.

   SAVE validates the world first, then writes only what differs from the rows
   the database holds: deleted records are deleted, new or changed records are
   upserted, identical records are not touched. The world version increments
   once per saving transaction that changed something, and only from the
   version the caller loaded: inside a transaction `expectedVersion` is
   required, so a save based on a stale load fails rather than overwriting a
   newer world. A save must run under the world lock; the repository checks the
   lock is held by this transaction. Called without a transaction, saveWorld
   takes the lock itself and replaces whatever is stored — for seeding and
   restoring, never for commands.

   FIDELITY. What reloads is the world as JSON represents it: record key order
   is not kept (nothing in the domain depends on it), `undefined` values are
   dropped, and every present value — including null, numeric strings, nested
   negotiation threads and private fields — comes back exactly.
   ========================================================================== */

const { validateWorld } = require("../domain/metyet-world.js");
const { PersistenceError, CODES, summarise } = require("./errors.js");

/* ------------------------------------------------------------------ LOCK
   One transaction-scoped advisory lock serializes every canonical mutation.
   It is released by COMMIT or ROLLBACK, never held beyond the transaction. The
   limit it sets is deliberate for the pilot: one command commits at a time
   across the whole world. When throughput needs more, the next step is a lock
   per partition of the world (e.g. per partner network) once commands that
   derive ids from global counts (resolveCardIdentity) no longer need a global
   view. */
const WORLD_LOCK_KEY = 461730101;
const WORLD_LOCK_SQL = `select pg_advisory_xact_lock(${WORLD_LOCK_KEY})`;
const WORLD_LOCK_HELD_SQL = `select exists (
  select 1 from pg_locks
  where locktype = 'advisory' and classid = 0 and objid = ${WORLD_LOCK_KEY} and objsubid = 1
    and pid = pg_backend_pid() and granted
) as held`;

/* ------------------------------------------------------------------ SHAPE
   For each collection: its table, primary key, and the record fields that are
   columns. `fields` are always present ids in a valid world (validateWorld
   guarantees it), so they live only in their column. `mirrors` may be null,
   absent or, for a completed deal's goal, not an id at all: the record keeps
   the value in attrs exactly, and the column mirrors it as an id or NULL for
   foreign keys and indexes. Everything else is attrs. */
const TABLES = [
  { collection: "catalog", table: "catalog_cards", key: ["id"], fields: [["id", "id"]] },
  { collection: "collectors", table: "collectors", key: ["id"], fields: [["id", "id"]] },
  { collection: "partners", table: "partners", key: ["id"], fields: [["id", "id"]] },
  { collection: "relationships", table: "relationships", key: ["ord"],
    fields: [["partnerId", "partner_id"], ["collectorId", "collector_id"]] },
  /* `collectorId` is a MIRROR rather than a field: an invitation exists before
     anyone has joined, so it is null until a redemption resolves one, and a
     mirror is exactly the shape for "an id or NULL". */
  { collection: "invitations", table: "invitations", key: ["id"],
    fields: [["id", "id"], ["partnerId", "partner_id"]],
    mirrors: [["collectorId", "collector_id"]] },
  { collection: "goals", table: "goals", key: ["id"],
    fields: [["id", "id"], ["collectorId", "collector_id"], ["cardId", "card_id"]] },
  { collection: "preferences", table: "preferences", key: ["ord"], fields: [["collectorId", "collector_id"]] },
  { collection: "inventory", table: "inventory_copies", key: ["inv_id"],
    fields: [["invId", "inv_id"], ["partnerId", "partner_id"], ["cardId", "card_id"]] },
  { collection: "binder", table: "binder_copies", key: ["id"],
    fields: [["id", "id"], ["collectorId", "collector_id"], ["cardId", "card_id"]] },
  { collection: "interests", table: "interests", key: ["ord"],
    fields: [["partnerId", "partner_id"], ["binderId", "binder_id"]] },
  { collection: "opportunities", table: "opportunities", key: ["id"],
    fields: [["id", "id"], ["collectorId", "collector_id"], ["partnerId", "partner_id"], ["cardId", "card_id"]],
    mirrors: [["goalId", "goal_id"], ["invId", "inv_id"]] },
  { collection: "conversations", table: "conversations", key: ["id"],
    fields: [["id", "id"], ["key", "key"], ["collectorId", "collector_id"], ["partnerId", "partner_id"], ["cardId", "card_id"]],
    mirrors: [["oppId", "opportunity_id"]], children: "entries" },
  { collection: "activity", table: "activity", key: ["id"],
    fields: [["id", "id"], ["collectorId", "collector_id"]], mirrors: [["partnerId", "partner_id"]] },
  { collection: "photoRequests", table: "photo_requests", key: ["id"],
    fields: [["id", "id"], ["collectorId", "collector_id"], ["partnerId", "partner_id"], ["invId", "inv_id"]] },
  { collection: "copyReviews", table: "copy_reviews", key: ["id"],
    fields: [["id", "id"], ["collectorId", "collector_id"], ["partnerId", "partner_id"], ["invId", "inv_id"]] },
];
/* Rows that belong to a record of another table. */
const CHILD_TABLES = [
  { table: "conversation_entries", key: ["conversation_id", "ord"],
    columns: ["conversation_id", "ord", "id", "attrs"] },
  { table: "opportunity_trade_refs", key: ["opportunity_id", "row_ord"],
    columns: ["opportunity_id", "row_ord", "trade_card_id", "collector_id", "card_id", "binder_id"] },
];
const COLLECTIONS = TABLES.map((t) => t.collection);
const OPTIONAL = ["preferences", "activity"];

for (const t of TABLES) {
  t.columns = [...new Set([...t.fields.map(([, c]) => c), ...(t.mirrors || []).map(([, c]) => c), "ord", "attrs"])];
}

/* ------------------------------------------------------------------ SQL
   Built once from the fixed shape above (no caller input reaches a table or
   column name). Rows travel as one JSON array per statement. */
const q = (name) => `metyet.${name}`;
const recordType = (cols) => cols.map((c) => `${c} ${c === "ord" || c === "row_ord" ? "integer" : c === "attrs" ? "jsonb" : "text"}`).join(", ");
function statements(spec) {
  const cols = spec.columns;
  const key = spec.key;
  const set = cols.filter((c) => !key.includes(c));
  return {
    select: `select ${cols.join(", ")} from ${q(spec.table)} order by ${cols.includes("ord") && !key.includes("ord") ? "ord" : key.join(", ")}`,
    upsert: `insert into ${q(spec.table)} (${cols.join(", ")})
      select ${cols.join(", ")} from jsonb_to_recordset($1::jsonb) as r(${recordType(cols)})
      on conflict (${key.join(", ")}) do update set ${set.map((c) => `${c} = excluded.${c}`).join(", ")}`,
    delete: `delete from ${q(spec.table)} t using jsonb_to_recordset($1::jsonb) as r(${recordType(key)})
      where ${key.map((c) => `t.${c} = r.${c}`).join(" and ")}`,
  };
}
const SQL = Object.fromEntries([...TABLES, ...CHILD_TABLES].map((s) => [s.table, statements(s)]));
const SELECT_VERSION = "select version from metyet.world_meta where singleton";
const BUMP_VERSION = "update metyet.world_meta set version = version + 1 where singleton and version = $1 returning version";

/* ------------------------------------------------------------------ HELPERS */
const isId = (v) => typeof v === "string" && v.length > 0;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const json = (v) => JSON.parse(JSON.stringify(v));
/* A stable serialization (sorted keys) for comparing stored rows with desired rows. */
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  return JSON.stringify(v === undefined ? null : v);
}
const keyOf = (spec, row) => JSON.stringify(spec.key.map((k) => row[k]));

const dbError = (what, cause) => (cause instanceof PersistenceError ? cause
  : new PersistenceError(CODES.database, `The database failed while ${what}: ${cause && cause.message}`, { cause }));

/* The domain's world with every collection a list. Unknown top-level keys are
   refused: they would not survive a save, so accepting them would lose data. */
function normalizeWorld(world) {
  if (!world || typeof world !== "object" || Array.isArray(world)) return world;
  const unknown = Object.keys(world).filter((k) => !COLLECTIONS.includes(k) && world[k] !== undefined);
  if (unknown.length) {
    throw new PersistenceError(CODES.unknownCollection,
      `The world has fields the schema does not store: ${unknown.join(", ")}. Add a table (migration) before persisting them.`,
      { details: { unknown } });
  }
  const out = {};
  for (const k of COLLECTIONS) out[k] = world[k] === undefined && OPTIONAL.includes(k) ? [] : world[k];
  return out;
}

/* ------------------------------------------------------------------ WORLD -> ROWS */
function toRows(world) {
  const w = json(world);
  const rows = {};
  for (const spec of [...TABLES, ...CHILD_TABLES]) rows[spec.table] = [];
  for (const spec of TABLES) {
    w[spec.collection].forEach((record, ord) => {
      const attrs = { ...record };
      const row = { ord };
      for (const [field, column] of spec.fields) { row[column] = record[field]; delete attrs[field]; }
      for (const [field, column] of spec.mirrors || []) row[column] = isId(record[field]) ? record[field] : null;
      if (spec.children) {
        delete attrs[spec.children];
        record[spec.children].forEach((entry, i) => {
          const { id, ...rest } = entry;
          rows.conversation_entries.push({ conversation_id: record.id, ord: i, id, attrs: rest });
        });
      }
      row.attrs = attrs;
      rows[spec.table].push(row);
    });
  }
  rows.opportunity_trade_refs = tradeRefs(w.opportunities);
  return rows;
}

/* The exact BinderCopy references of every trade package, one row per trade row. */
function tradeRefs(opportunities) {
  const out = [];
  for (const o of opportunities) {
    const cards = o.trade && typeof o.trade === "object" && Array.isArray(o.trade.cards) ? o.trade.cards : [];
    cards.forEach((c, i) => out.push({ opportunity_id: o.id, row_ord: i, trade_card_id: c.id,
      collector_id: o.collectorId, card_id: c.cardId, binder_id: isId(c.binderId) ? c.binderId : null }));
  }
  return out;
}

/* ------------------------------------------------------------------ ROWS -> WORLD */
function fromRows(rows) {
  const drift = [];
  const world = {};
  const entriesBy = new Map();
  for (const e of rows.conversation_entries) {
    if (!entriesBy.has(e.conversation_id)) entriesBy.set(e.conversation_id, []);
    entriesBy.get(e.conversation_id).push(e);
  }
  for (const spec of TABLES) {
    world[spec.collection] = rows[spec.table].map((row) => {
      const attrs = row.attrs || {};
      for (const [field] of spec.fields) {
        if (own(attrs, field)) drift.push(`${spec.table} ${keyOf(spec, row)}: attrs repeats column field "${field}"`);
      }
      const record = {};
      for (const [field, column] of spec.fields) record[field] = row[column];
      Object.assign(record, attrs);
      for (const [field, column] of spec.mirrors || []) {
        const expected = isId(attrs[field]) ? attrs[field] : null;
        if (row[column] !== expected) drift.push(`${spec.table} ${keyOf(spec, row)}: ${column} is ${JSON.stringify(row[column])} but ${field} is ${JSON.stringify(attrs[field])}`);
      }
      if (spec.children) {
        record[spec.children] = (entriesBy.get(row.id) || []).map((e) => ({ id: e.id, ...e.attrs }));
        entriesBy.delete(row.id);
      }
      return record;
    });
  }
  for (const id of entriesBy.keys()) drift.push(`conversation_entries: rows for missing conversation ${id}`);
  const byRef = (xs) => stable([...xs].sort((x, y) => (x.opportunity_id === y.opportunity_id
    ? x.row_ord - y.row_ord : x.opportunity_id < y.opportunity_id ? -1 : 1)));
  if (byRef(rows.opportunity_trade_refs) !== byRef(tradeRefs(world.opportunities))) {
    drift.push("opportunity_trade_refs: rows do not match the trade packages stored on the opportunities");
  }
  return { world, drift };
}

/* ------------------------------------------------------------------ REPOSITORY */
function createWorldRepository(db) {
  if (!db || typeof db.transaction !== "function") throw new TypeError("createWorldRepository: a database adapter is required");

  const withTransaction = (fn, { readOnly = false } = {}) => db.transaction(fn, { readOnly });
  const inTx = (tx, fn, opts) => (tx ? fn(tx) : withTransaction(fn, opts));

  const lockWorld = async (tx) => { await tx.query(WORLD_LOCK_SQL); };

  const readVersion = (tx) => inTx(tx, async (t) => Number((await t.query(SELECT_VERSION)).rows[0].version), { readOnly: true });

  async function readRows(tx) {
    const rows = {};
    for (const spec of [...TABLES, ...CHILD_TABLES]) {
      rows[spec.table] = (await tx.query(SQL[spec.table].select)).rows;
    }
    return rows;
  }

  const loadWorld = (tx) => inTx(tx, async (t) => {
    let rows;
    try { rows = await readRows(t); } catch (e) { throw dbError("loading the world", e); }
    const { world, drift } = fromRows(rows);
    if (drift.length) {
      throw new PersistenceError(CODES.referenceDrift,
        `The stored world is inconsistent with itself: ${drift.slice(0, 5).join("; ")}.`, { details: { drift } });
    }
    const check = validateWorld(world);
    if (!check.ok) {
      throw new PersistenceError(CODES.invalidWorld,
        `The stored world is not a valid canonical world: ${summarise(check.errors)}`, { details: { errors: check.errors } });
    }
    return world;
  }, { readOnly: true });

  async function write(t, world, expectedVersion) {
    const held = (await t.query(WORLD_LOCK_HELD_SQL)).rows[0].held;
    if (!held) {
      throw new PersistenceError(CODES.lockNotHeld,
        "saveWorld must run in a transaction that holds the world lock (lockWorld) before it loads.");
    }
    const current = Number((await t.query(SELECT_VERSION)).rows[0].version);
    if (Number.isInteger(expectedVersion) && current !== expectedVersion) {
      throw new PersistenceError(CODES.versionConflict,
        `The world changed while this save was prepared (loaded version ${expectedVersion}, stored version ${current}).`,
        { details: { expectedVersion, current } });
    }
    const desired = toRows(world);
    const stored = await readRows(t);
    const changes = {};
    let total = 0;
    for (const spec of [...TABLES, ...CHILD_TABLES]) {
      const storedByKey = new Map(stored[spec.table].map((r) => [keyOf(spec, r), r]));
      const have = new Map([...storedByKey].map(([k, r]) => [k, stable(pickColumns(spec, r))]));
      const want = new Map(desired[spec.table].map((r) => [keyOf(spec, r), r]));
      const removed = [...storedByKey].filter(([k]) => !want.has(k)).map(([, r]) => r);
      const upserts = [...want.entries()].filter(([k, r]) => have.get(k) !== stable(pickColumns(spec, r))).map(([, r]) => r);
      if (removed.length) {
        await t.query(SQL[spec.table].delete, [JSON.stringify(removed.map((r) => Object.fromEntries(spec.key.map((c) => [c, r[c]]))))]);
      }
      if (upserts.length) {
        await t.query(SQL[spec.table].upsert, [JSON.stringify(upserts.map((r) => pickColumns(spec, r)))]);
      }
      const inserted = upserts.filter((r) => !have.has(keyOf(spec, r))).length;
      if (removed.length || upserts.length) {
        changes[spec.table] = { inserted, updated: upserts.length - inserted, deleted: removed.length };
      }
      total += removed.length + upserts.length;
    }
    let version = current;
    if (total > 0) {
      const bumped = (await t.query(BUMP_VERSION, [current])).rows;
      if (!bumped.length) {
        throw new PersistenceError(CODES.versionConflict, "The world version moved during the save.", { details: { current } });
      }
      version = Number(bumped[0].version);
    }
    return { version, changes, rowsWritten: total };
  }

  const saveWorld = async (world, tx, { expectedVersion } = {}) => {
    if (tx && !Number.isInteger(expectedVersion)) {
      throw new PersistenceError(CODES.versionRequired,
        "saveWorld inside a transaction needs the version that transaction loaded ({ expectedVersion }).");
    }
    const normalized = normalizeWorld(world);
    const check = validateWorld(normalized);
    if (!check.ok) {
      throw new PersistenceError(CODES.invalidInput,
        `Refusing to save an invalid world: ${summarise(check.errors)}`, { details: { errors: check.errors } });
    }
    const run = async (t) => {
      try { return await write(t, normalized, expectedVersion); } catch (e) { throw dbError("saving the world", e); }
    };
    if (tx) return run(tx);
    return withTransaction(async (t) => { await lockWorld(t); return run(t); });
  };

  return { withTransaction, lockWorld, loadWorld, saveWorld, readVersion };
}

function pickColumns(spec, row) {
  const out = {};
  for (const c of spec.columns) out[c] = row[c] === undefined ? null : row[c];
  return out;
}

module.exports = { createWorldRepository, normalizeWorld, toRows, fromRows, TABLES, CHILD_TABLES, SQL,
  WORLD_LOCK_KEY, WORLD_LOCK_SQL, WORLD_LOCK_HELD_SQL };
