/* ============================================================================
   MIGRATIONS — FORWARD-ONLY, IN ORDER, ONCE, VERIFIED

     migrate(db)  -> { applied: [versions newly applied], current: [all applied] }

   Migrations are the SQL files in ./migrations, applied in filename order. Each
   applied file is recorded in metyet.schema_migrations with the SHA-256 of its
   contents, so a migration that has been edited after it ran is refused rather
   than silently diverging from what the database holds. To change the schema,
   add a new file; to undo one, add a new file that reverses it (or restore a
   backup). The whole run is one transaction under its own advisory lock, so
   two processes starting together cannot apply the same migration twice, and a
   failing file leaves the database exactly as it was.

   The files are plain PostgreSQL: they can equally be applied by a hosted
   provider's migration tooling later, provided the bookkeeping table agrees.
   ========================================================================== */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PersistenceError, CODES } = require("./errors.js");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");
/* Distinct from the world lock (world-repository.js). */
const MIGRATION_LOCK_SQL = "select pg_advisory_xact_lock(461730100)";

const checksum = (sql) => crypto.createHash("sha256").update(sql, "utf8").digest("hex");

function readMigrations(dir = MIGRATIONS_DIR) {
  return fs.readdirSync(dir).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort()
    .map((file) => {
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      return { version: file.replace(/\.sql$/, ""), sql, checksum: checksum(sql) };
    });
}

async function migrate(db, { migrations = readMigrations() } = {}) {
  return db.transaction(async (tx) => {
    await tx.query(MIGRATION_LOCK_SQL);
    await tx.exec(`create schema if not exists metyet;
      create table if not exists metyet.schema_migrations (
        version    text        primary key,
        checksum   text        not null,
        applied_at timestamptz not null default now()
      );`);
    const done = new Map((await tx.query("select version, checksum from metyet.schema_migrations")).rows
      .map((r) => [r.version, r.checksum]));
    const applied = [];
    for (const m of migrations) {
      if (done.has(m.version)) {
        if (done.get(m.version) !== m.checksum) {
          throw new PersistenceError(CODES.migrationChanged,
            `Migration ${m.version} has changed since it was applied. Restore the original file and add a new migration instead.`,
            { details: { version: m.version, applied: done.get(m.version), current: m.checksum } });
        }
        continue;
      }
      await tx.exec(m.sql);
      await tx.query("insert into metyet.schema_migrations (version, checksum) values ($1, $2)", [m.version, m.checksum]);
      applied.push(m.version);
    }
    return { applied, current: [...done.keys(), ...applied].sort() };
  });
}

/* The only database errors that mean "this database has never been migrated":
   the bookkeeping table, or the schema holding it, does not exist. Every other
   failure — a refused connection, a TLS problem, a password, a permission, a
   driver fault — means something else entirely and must not be dressed up as a
   missing migration. PostgreSQL's SQLSTATE says which is which; the message
   text does not, and is not consulted. */
const NEVER_MIGRATED = new Set([
  "42P01", // undefined_table       — metyet.schema_migrations is not there
  "3F000", // invalid_schema_name   — the metyet schema is not there
]);

/* What is applied, what is pending, and whether what was applied is still what
   this build contains — without applying anything. The server uses this for
   readiness, so its three answers have to stay distinguishable:

     migrated: false          nothing has been migrated yet          -> unready
     pending:  [...]          the schema is behind this build        -> unready
     changed:  [...]          an applied migration's file has since
                              been edited, so the database and the
                              code no longer agree about the schema  -> unready

   Anything else that goes wrong THROWS, so a database that cannot be reached is
   reported as a database that cannot be reached. */
async function migrationStatus(db, { migrations = readMigrations() } = {}) {
  const all = migrations.map((m) => m.version);
  const expected = new Map(migrations.map((m) => [m.version, m.checksum]));
  let rows;
  try {
    rows = await db.transaction(async (tx) =>
      (await tx.query("select version, checksum from metyet.schema_migrations order by version")).rows,
    { readOnly: true });
  } catch (error) {
    if (!NEVER_MIGRATED.has(error && error.code)) throw error;
    return { migrated: false, applied: [], pending: all, changed: [] };
  }
  const applied = rows.map((r) => r.version);
  /* Only a version this build also has can have drifted. One the build does not
     have at all is a database ahead of the code — a different situation, and not
     one this check invents an answer for. */
  const changed = rows.filter((r) => expected.has(r.version) && expected.get(r.version) !== r.checksum)
    .map((r) => r.version);
  return { migrated: true, applied, pending: all.filter((v) => !applied.includes(v)), changed };
}

module.exports = { migrate, migrationStatus, readMigrations, checksum, MIGRATIONS_DIR, MIGRATION_LOCK_SQL, NEVER_MIGRATED };
