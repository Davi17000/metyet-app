/* ============================================================================
   CONFIGURATION — FROM THE ENVIRONMENT, NEVER FROM THE REPOSITORY

     loadServerConfig(env)  ->  { port, host, logLevel, database, auth }

   Every value the server needs comes from environment variables. Nothing here
   has a production default that would work by accident, no secret is written
   down in this repository, and a missing or malformed setting stops the server
   at startup with the NAMES of what is missing — never their values.

     DATABASE_URL          the Postgres connection string (Supabase's pooler in
                           production: session mode, since the host is IPv4-only)
     DATABASE_SSL          require (default) · no-verify · disable
     DATABASE_CA_CERT      optional PEM, when a provider's CA must be pinned
     DATABASE_POOL_MAX     optional, default 10

     SUPABASE_URL          e.g. https://<project>.supabase.co — the JWKS URL and
                           issuer are derived from it
     SUPABASE_JWKS_URL     optional override
     SUPABASE_JWT_ISSUER   optional override
     SUPABASE_JWT_AUDIENCE optional, default "authenticated"

     PORT, HOST, LOG_LEVEL  optional

   No vendor is contacted here and nothing is provisioned: this only reads what
   an operator set.
   ========================================================================== */

const SSL_MODES = ["require", "no-verify", "disable"];

class ConfigError extends Error {
  constructor(problems) {
    super(`The server configuration is incomplete: ${problems.join("; ")}`);
    this.name = "ConfigError";
    this.code = "config.invalid";
    this.problems = problems;
  }
}

const trimmed = (v) => (typeof v === "string" ? v.trim() : "");

function loadServerConfig(env = process.env) {
  const problems = [];
  const need = (name) => {
    const value = trimmed(env[name]);
    if (!value) problems.push(`${name} is not set`);
    return value;
  };

  const connectionString = need("DATABASE_URL");
  const sslMode = trimmed(env.DATABASE_SSL) || "require";
  if (!SSL_MODES.includes(sslMode)) problems.push(`DATABASE_SSL must be one of ${SSL_MODES.join(", ")}`);

  const supabaseUrl = trimmed(env.SUPABASE_URL).replace(/\/+$/, "");
  const jwksUrl = trimmed(env.SUPABASE_JWKS_URL) || (supabaseUrl && `${supabaseUrl}/auth/v1/.well-known/jwks.json`);
  const issuer = trimmed(env.SUPABASE_JWT_ISSUER) || (supabaseUrl && `${supabaseUrl}/auth/v1`);
  if (!jwksUrl) problems.push("SUPABASE_URL (or SUPABASE_JWKS_URL) is not set");
  if (!issuer) problems.push("SUPABASE_URL (or SUPABASE_JWT_ISSUER) is not set");
  if (jwksUrl && !/^https:\/\//.test(jwksUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(jwksUrl)) {
    problems.push("the JWKS URL must be https");
  }

  const port = Number(trimmed(env.PORT) || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push("PORT must be a port number");
  const poolMax = Number(trimmed(env.DATABASE_POOL_MAX) || 10);
  if (!Number.isInteger(poolMax) || poolMax < 1) problems.push("DATABASE_POOL_MAX must be a positive whole number");

  if (problems.length) throw new ConfigError(problems);

  const ca = trimmed(env.DATABASE_CA_CERT);
  return {
    port,
    host: trimmed(env.HOST) || "0.0.0.0",
    logLevel: trimmed(env.LOG_LEVEL) || "info",
    database: {
      connectionString,
      poolMax,
      /* A hosted database is reached over TLS. "no-verify" exists for providers
         whose chain a container does not carry; "disable" is for a local
         database only. */
      ssl: sslMode === "disable" ? false
        : { rejectUnauthorized: sslMode === "require", ...(ca ? { ca } : {}) },
      sslMode,
    },
    auth: {
      jwksUrl,
      issuer,
      audience: trimmed(env.SUPABASE_JWT_AUDIENCE) || "authenticated",
    },
  };
}

/* What may be logged at startup: settings, never secrets. */
const describeConfig = (config) => ({
  port: config.port,
  host: config.host,
  logLevel: config.logLevel,
  databaseSsl: config.database.sslMode,
  databasePoolMax: config.database.poolMax,
  jwksHost: (() => { try { return new URL(config.auth.jwksUrl).host; } catch { return "invalid"; } })(),
  audience: config.auth.audience,
});

module.exports = { loadServerConfig, describeConfig, ConfigError, SSL_MODES };
