/* ============================================================================
   PRODUCTION BOOTSTRAP — THE ONLY PLACE THAT TOUCHES THE OUTSIDE WORLD

     npm start        (node server/index.js)

   Reads the environment (config.js), opens a Postgres pool (db-pool.js), builds
   the Batch 2 repository over it, builds the account directory and the token
   verifier, and starts the Fastify app (app.js). Nothing else in the server
   knows a driver, a URL or a key.

   It imports no demo seed and no client bundle: production starts against
   whatever the database holds, and the prototype's seeded world is a separate
   concern (demo.metyet.io), not something this process can accidentally serve.

   IT DOES NOT MIGRATE. Applying a migration is an operator's decision
   (`npm run db:migrate`); a process that migrated as it booted would let a
   rolling restart run two migrations at once against a live database. What this
   process does instead is REPORT: readiness is unready while the schema is
   behind, so a deploy that forgot the migration step is visible immediately and
   serves nothing.
   ========================================================================== */

const { loadServerConfig, describeConfig } = require("./config.js");
const { createPool } = require("./db-pool.js");
const { fromPgPool } = require("../persistence/database.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { migrationStatus } = require("../persistence/migrate.js");
const { createAccountDirectory } = require("./auth/accounts.js");
const { createInvitationDirectory } = require("./auth/invitations.js");
const { createCollectorCredentials } = require("./auth/collector-invitations.js");
const { createTokenVerifier } = require("./auth/token-verifier.js");
const { createIdentityDirectory } = require("./auth/identity.js");
const { createResendMailer } = require("./mail/resend.js");
const { systemRuntime } = require("../domain/metyet-runtime.js");
const { createApp } = require("./app.js");
const fs = require("fs");
const path = require("path");

/* The built production client, if this deployment has one. `npm run build:app`
   writes it; a deployment that skipped that step serves the API alone and says
   so once at startup rather than 404-ing every page silently. Read at boot, so
   a request never touches the filesystem. */
function loadClient(dir = path.join(__dirname, "..", "app")) {
  try {
    return {
      page: fs.readFileSync(path.join(dir, "index.html"), "utf8"),
      script: fs.readFileSync(path.join(dir, "main.js"), "utf8"),
    };
  } catch (error) { return null; }
}

async function main() {
  const config = loadServerConfig(process.env);
  const client = loadClient();
  const pool = createPool(config.database, { applicationName: "metyet-server" });
  const db = fromPgPool(pool);
  /* Sending is a capability, not a requirement: with no mail settings this is
     null, the invitation route never offers a delivery address, and a Trusted
     Partner hands the credential over themselves exactly as in Batch 2. The
     origin travels beside the mailer because it belongs to the same decision —
     a link can only be written by a server that was told where it points. */
  const mailer = config.mail
    ? createResendMailer({ apiKey: config.mail.apiKey, from: config.mail.from })
    : null;
  /* Where this MetYet lives, when an operator said. It is what any link the
     server writes is built from — in an email, or in the reply a Trusted
     Partner reads off their own screen — and it never comes from a request. */
  const app = createApp({
    repository: createWorldRepository(db),
    accounts: createAccountDirectory(db),
    invitations: createInvitationDirectory(db),
    collectorCredentials: createCollectorCredentials(db),
    verifier: createTokenVerifier(config.auth),
    identity: createIdentityDirectory(config.auth),
    checkSchema: () => migrationStatus(db),
    runtime: systemRuntime(),
    mailer,
    appUrl: config.appUrl,
    client,
    logger: { level: config.logLevel },
    trustProxy: true,
  });

  app.log.info({ ...describeConfig(config), clientBundle: Boolean(client) }, "starting MetYet server");
  if (!client) app.log.warn("no built client in app/ — serving the API only (npm run build:app)");

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
