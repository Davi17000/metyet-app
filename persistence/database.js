/* ============================================================================
   DATABASE ADAPTERS — THE ONLY SHAPE THE PERSISTENCE LAYER NEEDS

     db.transaction(fn, { readOnly }) -> Promise<fn's result>
       fn(tx): tx.query(sql, params) -> { rows }
               tx.exec(sql)          -> runs a multi-statement script

   A transaction commits when fn resolves and rolls back when it throws. The
   repository never sees a driver, so it runs unchanged on:

     fromPGlite(pglite)  the in-process Postgres (WebAssembly build) the test
                         suite uses — a devDependency, never loaded in product
                         code;
     fromPgPool(pool)    any node-postgres-compatible pool (`pg.Pool`), which the
                         future service will pass in. No driver is imported here.

   ISOLATION. Write transactions use the server default, READ COMMITTED, on
   purpose: the command transaction takes the world lock as its first
   statement, and under READ COMMITTED every later statement sees everything
   committed before the lock was granted. (Under REPEATABLE READ the snapshot
   would be taken by the lock statement itself — before the wait — and a queued
   command would load a stale world.) Read-only transactions use REPEATABLE
   READ so every table of one load comes from one snapshot.
   ========================================================================== */

const READ_ONLY_SNAPSHOT = "set transaction isolation level repeatable read, read only";

function fromPGlite(pglite) {
  const wrap = (tx) => ({
    query: (sql, params) => tx.query(sql, params),
    exec: (sql) => tx.exec(sql),
  });
  return {
    kind: "pglite",
    transaction: (fn, { readOnly = false } = {}) => pglite.transaction(async (tx) => {
      if (readOnly) await tx.query(READ_ONLY_SNAPSHOT);
      return fn(wrap(tx));
    }),
  };
}

function fromPgPool(pool) {
  return {
    kind: "pg-pool",
    transaction: async (fn, { readOnly = false } = {}) => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        if (readOnly) await client.query(READ_ONLY_SNAPSHOT);
        const tx = { query: (sql, params) => client.query(sql, params), exec: (sql) => client.query(sql) };
        const result = await fn(tx);
        await client.query("commit");
        return result;
      } catch (error) {
        try { await client.query("rollback"); } catch (rollbackError) { /* the connection is gone; the server aborts the transaction */ }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

module.exports = { fromPGlite, fromPgPool, READ_ONLY_SNAPSHOT };
