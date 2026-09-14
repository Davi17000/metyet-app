/* ============================================================================
   THE POSTGRES POOL — ONE WAY TO OPEN THE DATABASE

     createPool(databaseConfig, { applicationName })  -> pg.Pool
     withDatabase(fn, { env, applicationName })       -> fn({ pool, db, repository, accounts })

   The server and every operator command open the database the same way, so
   what is true of one is true of the others: TLS as configured, a bounded pool,
   and two timeouts set on each connection.

   WHY THE TIMEOUTS. A canonical command holds one global advisory lock for its
   transaction. A statement that hangs — a network blip to a hosted database, a
   pathological query — would hold that lock with it and stall every other
   write. `statement_timeout` bounds any single statement and
   `idle_in_transaction_session_timeout` bounds a transaction that stops making
   progress; either way Postgres aborts the transaction, the lock is released,
   and the command fails cleanly rather than wedging the pilot.

   This is the only file besides the bootstrap that knows a driver exists.
   ========================================================================== */

const { Pool } = require("pg");
const { fromPgPool } = require("../persistence/database.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createAccountDirectory } = require("./auth/accounts.js");
const { createInvitationDirectory } = require("./auth/invitations.js");
const { loadDatabaseConfig } = require("./config.js");

function createPool(database, { applicationName = "metyet" } = {}) {
  const pool = new Pool({
    connectionString: database.connectionString,
    ssl: database.ssl,
    max: database.poolMax,
    application_name: applicationName,
  });
  pool.on("connect", (client) => {
    client.query(`set statement_timeout = ${Number(database.statementTimeoutMs)};
      set idle_in_transaction_session_timeout = ${Number(database.idleTransactionTimeoutMs)}`)
      .catch(() => { /* the pool reports the failure on first use */ });
  });
  /* An idle client that errors (a hosted database recycling connections) must
     not take the process down. */
  pool.on("error", () => {});
  return pool;
}

/* Everything an operator command needs, torn down when it is done. */
async function withDatabase(fn, { env = process.env, applicationName = "metyet-admin" } = {}) {
  const database = loadDatabaseConfig(env);
  const pool = createPool(database, { applicationName });
  const db = fromPgPool(pool);
  try {
    return await fn({ pool, db, repository: createWorldRepository(db),
      accounts: createAccountDirectory(db), invitations: createInvitationDirectory(db) });
  } finally {
    await pool.end();
  }
}

module.exports = { createPool, withDatabase };
