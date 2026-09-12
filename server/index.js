/* ============================================================================
   PRODUCTION BOOTSTRAP — THE ONLY PLACE THAT TOUCHES THE OUTSIDE WORLD

     node server/index.js

   Reads the environment (config.js), opens a Postgres pool, builds the Batch 2
   repository over it, builds the account directory and the token verifier, and
   starts the Fastify app (app.js). Nothing else in the server knows a driver, a
   URL or a key.

   It imports no demo seed and no client bundle: production starts against
   whatever the database holds, and the prototype's seeded world is a separate
   concern (demo.metyet.io), not something this process can accidentally serve.

   Migrations are NOT run here. They are applied deliberately, by an operator
   (`node -e "require('./persistence/migrate.js').migrate(...)"` or the same
   runner from a deploy step), so a rolling restart can never half-migrate a
   live database.
   ========================================================================== */

const { Pool } = require("pg");
const { loadServerConfig, describeConfig } = require("./config.js");
const { fromPgPool } = require("../persistence/database.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createAccountDirectory } = require("./auth/accounts.js");
const { createTokenVerifier } = require("./auth/token-verifier.js");
const { systemRuntime } = require("../domain/metyet-runtime.js");
const { createApp } = require("./app.js");

async function main() {
  const config = loadServerConfig(process.env);
  const pool = new Pool({
    connectionString: config.database.connectionString,
    ssl: config.database.ssl,
    max: config.database.poolMax,
    application_name: "metyet-server",
  });
  const db = fromPgPool(pool);
  const app = createApp({
    repository: createWorldRepository(db),
    accounts: createAccountDirectory(db),
    verifier: createTokenVerifier(config.auth),
    runtime: systemRuntime(),
    logger: { level: config.logLevel },
    trustProxy: true,
  });

  app.log.info(describeConfig(config), "starting MetYet server");

  const stop = async (signal) => {
    app.log.info({ signal }, "shutting down");
    try { await app.close(); } finally { await pool.end(); }
    process.exit(0);
  };
  process.on("SIGTERM", () => { stop("SIGTERM"); });
  process.on("SIGINT", () => { stop("SIGINT"); });

  await app.listen({ port: config.port, host: config.host });
}

if (require.main === module) {
  main().catch((error) => {
    /* Configuration problems name what is missing, never what it was set to. */
    console.error(error && error.code === "config.invalid" ? error.message : `MetYet server failed to start: ${error && error.message}`);
    process.exit(1);
  });
}

module.exports = { main };
