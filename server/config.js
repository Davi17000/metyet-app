/* ============================================================================
   CONFIGURATION — FROM THE ENVIRONMENT, NEVER FROM THE REPOSITORY

     loadDatabaseConfig(env) ->  { connectionString, poolMax, ssl, … }
     loadAuthConfig(env)     ->  { jwksUrl, issuer, audience, userUrl, apiKey }
     loadServerConfig(env)   ->  { port, host, logLevel, database, auth }

   Every value the server needs comes from environment variables. Nothing here
   has a production default that would work by accident, no secret is written
   down in this repository, and a missing or malformed setting stops the process
   at startup with the NAMES of what is missing — never their values.

   The three loaders are separate because the operator commands are: applying a
   migration or provisioning an account needs the database and nothing else, and
   should not demand an identity provider that it will never call.

     DATABASE_URL          the Postgres connection string. On Supabase use the
                           SESSION pooler URI (port 5432): the host is IPv4-only,
                           and session pooling keeps a transaction — and its
                           advisory lock — on one connection.
     DATABASE_SSL          require (default) · no-verify · disable
     DATABASE_CA_CERT      optional PEM, when a provider's CA must be pinned
     DATABASE_POOL_MAX     optional, default 10
     DATABASE_STATEMENT_TIMEOUT_MS       optional, default 15000
     DATABASE_IDLE_TX_TIMEOUT_MS         optional, default 20000
                           A command holds one global lock; a statement that
                           hangs would hold it with them. These bound both.

     SUPABASE_URL          e.g. https://<project-ref>.supabase.co — the JWKS URL,
                           the issuer and the user endpoint are derived from it
     SUPABASE_PUBLISHABLE_KEY  the project's PUBLISHABLE (anon) key — or
                           SUPABASE_ANON_KEY, its older name. Required: it is the
                           `apikey` header the provider's gateway wants when
                           registration asks whether an address was confirmed
                           (server/auth/identity.js). It is safe to hold — it
                           grants nothing by itself — and a SECRET or
                           service-role key here is REFUSED, not used.
     SUPABASE_JWKS_URL     optional override
     SUPABASE_JWT_ISSUER   optional override
     SUPABASE_USER_URL     optional override
     SUPABASE_JWT_AUDIENCE optional, default "authenticated"

     PORT, HOST, LOG_LEVEL  optional (Render sets PORT)

   No vendor is contacted here and nothing is provisioned: this only reads what
   an operator set.
   ========================================================================== */

const { isSecretKey, isSafeProviderUrl } = require("./auth/identity.js");

const SSL_MODES = ["require", "no-verify", "disable"];

class ConfigError extends Error {
  constructor(problems) {
    super(`The configuration is incomplete: ${problems.join("; ")}`);
    this.name = "ConfigError";
    this.code = "config.invalid";
    this.problems = problems;
  }
}

const trimmed = (v) => (typeof v === "string" ? v.trim() : "");
const collect = (problems) => ({
  need: (name, env) => {
    const value = trimmed(env[name]);
    if (!value) problems.push(`${name} is not set`);
    return value;
  },
  whole: (name, env, fallback, min = 1) => {
    const value = Number(trimmed(env[name]) || fallback);
    if (!Number.isInteger(value) || value < min) problems.push(`${name} must be a whole number of at least ${min}`);
    return value;
  },
});

function databaseSettings(env, problems) {
  const { need, whole } = collect(problems);
  const connectionString = need("DATABASE_URL", env);
  const sslMode = trimmed(env.DATABASE_SSL) || "require";
  if (!SSL_MODES.includes(sslMode)) problems.push(`DATABASE_SSL must be one of ${SSL_MODES.join(", ")}`);
  const ca = trimmed(env.DATABASE_CA_CERT);
  return {
    connectionString,
    poolMax: whole("DATABASE_POOL_MAX", env, 10),
    statementTimeoutMs: whole("DATABASE_STATEMENT_TIMEOUT_MS", env, 15000, 1000),
    idleTransactionTimeoutMs: whole("DATABASE_IDLE_TX_TIMEOUT_MS", env, 20000, 1000),
    /* A hosted database is reached over TLS. "no-verify" exists for providers
       whose chain a container does not carry; "disable" is for a local
       database only. */
    ssl: sslMode === "disable" ? false
      : { rejectUnauthorized: sslMode === "require", ...(ca ? { ca } : {}) },
    sslMode,
  };
}

function authSettings(env, problems) {
  const supabaseUrl = trimmed(env.SUPABASE_URL).replace(/\/+$/, "");
  const jwksUrl = trimmed(env.SUPABASE_JWKS_URL) || (supabaseUrl && `${supabaseUrl}/auth/v1/.well-known/jwks.json`);
  const issuer = trimmed(env.SUPABASE_JWT_ISSUER) || (supabaseUrl && `${supabaseUrl}/auth/v1`);
  if (!jwksUrl) problems.push("SUPABASE_URL (or SUPABASE_JWKS_URL) is not set");
  if (!issuer) problems.push("SUPABASE_URL (or SUPABASE_JWT_ISSUER) is not set");
  /* Both provider endpoints carry something that must not cross a plaintext
     connection — the JWKS is the keys every session is trusted against, and the
     user endpoint carries the person's own bearer token — so both are held to
     the same rule, defined once in auth/identity.js. */
  if (jwksUrl && !isSafeProviderUrl(jwksUrl)) {
    problems.push("the JWKS URL must be https (http is accepted only for localhost)");
  }
  /* Registration asks the Auth server itself whether an address was confirmed
     (server/auth/identity.js), because no token claim answers that. The gateway
     requires an apikey header on the way; the PUBLISHABLE (anon) key is what
     belongs there, and it is not authority — the user's own verified token is.
     A secret key is refused rather than used. */
  const userUrl = trimmed(env.SUPABASE_USER_URL) || (supabaseUrl && `${supabaseUrl}/auth/v1/user`);
  const apiKey = trimmed(env.SUPABASE_PUBLISHABLE_KEY) || trimmed(env.SUPABASE_ANON_KEY);
  if (!apiKey) problems.push("SUPABASE_PUBLISHABLE_KEY (the project's publishable/anon key) is not set");
  else if (isSecretKey(apiKey)) problems.push("SUPABASE_PUBLISHABLE_KEY must be the publishable (anon) key, not a secret or service-role key");
  if (!userUrl) problems.push("SUPABASE_URL (or SUPABASE_USER_URL) is not set");
  else if (!isSafeProviderUrl(userUrl)) {
    problems.push("the identity user URL must be https (http is accepted only for localhost)");
  }

  return { jwksUrl, issuer, audience: trimmed(env.SUPABASE_JWT_AUDIENCE) || "authenticated", userUrl, apiKey };
}

const finish = (problems, value) => {
  if (problems.length) throw new ConfigError(problems);
  return value;
};

/* What an operator command needs: a database, and nothing else. */
function loadDatabaseConfig(env = process.env) {
  const problems = [];
  return finish(problems, databaseSettings(env, problems));
}

function loadAuthConfig(env = process.env) {
  const problems = [];
  return finish(problems, authSettings(env, problems));
}

function loadServerConfig(env = process.env) {
  const problems = [];
  const { whole } = collect(problems);
  const database = databaseSettings(env, problems);
  const auth = authSettings(env, problems);
  const port = whole("PORT", env, 8080);
  if (port > 65535) problems.push("PORT must be a port number");
  return finish(problems, {
    port,
    host: trimmed(env.HOST) || "0.0.0.0",
    logLevel: trimmed(env.LOG_LEVEL) || "info",
    database,
    auth,
  });
}

/* What may be logged at startup: settings, never secrets. */
const describeConfig = (config) => ({
  port: config.port,
  host: config.host,
  logLevel: config.logLevel,
  databaseSsl: config.database.sslMode,
  databasePoolMax: config.database.poolMax,
  databaseStatementTimeoutMs: config.database.statementTimeoutMs,
  jwksHost: (() => { try { return new URL(config.auth.jwksUrl).host; } catch { return "invalid"; } })(),
  audience: config.auth.audience,
  /* That a key is configured, never which one, and never any part of it. */
  identityKeyConfigured: Boolean(config.auth.apiKey),
});

module.exports = { loadServerConfig, loadDatabaseConfig, loadAuthConfig, describeConfig, ConfigError, SSL_MODES };
