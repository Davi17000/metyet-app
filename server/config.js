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
     DATABASE_SSL          verify-full (default) · no-verify · disable
                           Named as libpq names them. "require" is refused: it
                           means "do not verify" in libpq and meant "verify"
                           here, and guessing which one somebody meant is how a
                           production connection quietly stops being checked.
     DATABASE_CA_CERT      the provider's CA, as PEM text
     DATABASE_CA_CERT_FILE the same, as a path to the .crt you downloaded
                           Needed whenever a provider signs with its own root
                           rather than one in Node's trust store. Supabase does:
                           without it, verify-full fails with
                           SELF_SIGNED_CERT_IN_CHAIN, which is the check working.
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

     APP_URL               optional — where this MetYet lives, e.g.
                           https://app.metyet.io. It is what an invitation link
                           is built from, and it is CONFIGURATION: never the
                           request's `Host`, which a caller chooses.
     RESEND_API_KEY        optional — with MAIL_FROM and APP_URL, MetYet can
     MAIL_FROM             send a Collector invitation itself. Without them it
                           still opens invitations; the partner hands the code
                           or the link over.

     PORT, HOST, LOG_LEVEL  optional (Render sets PORT)

   No vendor is contacted here and nothing is provisioned: this only reads what
   an operator set.
   ========================================================================== */

const { isSecretKey, isSafeProviderUrl } = require("./auth/identity.js");

/* HOW THE DATABASE CONNECTION IS PROTECTED, NAMED THE WAY POSTGRES NAMES IT.

   These used to be `require` / `no-verify` / `disable`, and `require` performed
   FULL certificate and hostname verification. That is a trap: to anyone who
   knows libpq, `sslmode=require` means "encrypt, and do not check who you are
   talking to" — the opposite of what it did here. The behaviour was the safe
   one; the name promised the unsafe one, which is the wrong way round for a
   setting somebody reads in a deployment file at two in the morning.

   So the modes now say what they do, in libpq's vocabulary:

     verify-full  (default) encrypt, verify the certificate chain against a CA,
                  and verify that the certificate is for this host
     no-verify    encrypt, and verify nothing — a wiretapper who can answer as
                  the host reads and rewrites everything. Only when a provider's
                  CA genuinely cannot be obtained.
     disable      no TLS at all. A local database only.

   `require` is REFUSED rather than reinterpreted, because either reading of it
   would be somebody's reasonable expectation and silently choosing one of them
   is how a deployment ends up unverified without anyone deciding that.

   Verification is Node's, through node-postgres, which sets `servername` from
   the host — so `rejectUnauthorized` genuinely checks the name as well as the
   chain, and "verify-full" is an accurate description rather than an ambition. */
const fs = require("fs");

const SSL_MODES = ["verify-full", "no-verify", "disable"];
const AMBIGUOUS_SSL_MODES = ["require", "prefer", "allow", "verify-ca"];

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
  const sslMode = trimmed(env.DATABASE_SSL) || "verify-full";
  if (AMBIGUOUS_SSL_MODES.includes(sslMode)) {
    problems.push(`DATABASE_SSL="${sslMode}" is ambiguous here: in libpq it means something different `
      + `from what it used to mean in MetYet. Say which you want: "verify-full" (encrypt and verify `
      + `the certificate and host) or "no-verify" (encrypt only)`);
  } else if (!SSL_MODES.includes(sslMode)) {
    problems.push(`DATABASE_SSL must be one of ${SSL_MODES.join(", ")}`);
  }
  /* The certificate authority to verify against, as PEM text or as a file — a
     provider hands you a .crt to download, so pointing at it is the natural
     thing to do on a laptop, and pasting the text is the natural thing to do in
     a host's environment editor. Both, rather than making one of them awkward. */
  const caFile = trimmed(env.DATABASE_CA_CERT_FILE);
  let ca = trimmed(env.DATABASE_CA_CERT);
  if (caFile && ca) problems.push("set DATABASE_CA_CERT or DATABASE_CA_CERT_FILE, not both");
  if (caFile && !ca) {
    try {
      ca = fs.readFileSync(caFile, "utf8").trim();
    } catch (error) {
      /* The path, never the contents of anything, and never why the filesystem
         said no beyond its own code. */
      problems.push(`DATABASE_CA_CERT_FILE could not be read (${error && error.code})`);
    }
  }
  if (ca && !/^-----BEGIN CERTIFICATE-----/.test(ca)) {
    problems.push("the CA certificate must be PEM text beginning \"-----BEGIN CERTIFICATE-----\"");
  }
  return {
    connectionString,
    poolMax: whole("DATABASE_POOL_MAX", env, 10),
    statementTimeoutMs: whole("DATABASE_STATEMENT_TIMEOUT_MS", env, 15000, 1000),
    idleTransactionTimeoutMs: whole("DATABASE_IDLE_TX_TIMEOUT_MS", env, 20000, 1000),
    /* A hosted database is reached over TLS, and by default its certificate is
       checked against a CA and against the host name. `ca` is what makes that
       possible for a provider that signs with its own root — Supabase does, and
       publishes the certificate to download. Without it, Node has only its
       built-in roots and the connection fails closed, which is correct. */
    ssl: sslMode === "disable" ? false
      : { rejectUnauthorized: sslMode === "verify-full", ...(ca ? { ca } : {}) },
    sslMode,
    /* Whether a CA was supplied — never which one, and never its contents. */
    caConfigured: Boolean(ca),
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

/* ---------------------------------------------------- SENDING AN INVITATION

   OPTIONAL, AND OFF WHEN IT IS INCOMPLETE (Phase 5 Batch 3B-2).

   A MetYet that cannot send email is not a broken MetYet. Invitations still
   work: the credential and its link appear once on the Trusted Partner's
   screen, and they hand it over themselves. So these three names are NOT in
   REQUIRED_SERVER_ENV, the server starts without them, and what turns off is
   one capability rather than the product — the same shape as the routes that
   mount only when their directory is wired in.

   ALL THREE OR NONE. Two out of three is a configuration somebody meant to
   finish, and a server that half-sends is worse than one that does not send:
   it would build links from a default nobody chose. Partial configuration is
   reported as a problem rather than silently ignored.

   APP_URL IS CONFIGURATION AND COULD NOT BE ANYTHING ELSE. It is the origin
   written into a link inside an email, and the alternative — deriving it from
   the request that asked for the send — means a forged `Host` header puts
   somebody else's domain in MetYet's invitation. `trustProxy` is on in
   production, so that header is exactly the thing not to trust here.

   AND IT IS NOT ONLY MAIL'S. `APP_URL` is where this MetYet lives, which is
   also what a Trusted Partner needs when they are going to hand the link over
   themselves. So it stands alone: set it, and the server can write its own
   links; add a key and a sender, and it can also send them. */
function siteSettings(env, problems) {
  const appUrl = trimmed(env.APP_URL).replace(/\/+$/, "");
  if (!appUrl) return null;
  if (!isSafeProviderUrl(appUrl)) {
    problems.push("APP_URL must be https (http is accepted only for localhost): it is the origin "
      + "written into an invitation link");
  }
  return appUrl;
}

/* BOTH OR NEITHER, AND NOWHERE TO SEND FROM WITHOUT AN ORIGIN. A key without a
   sender is a configuration somebody meant to finish, and a server that
   half-sends is worse than one that does not send at all. */
function mailSettings(env, problems, appUrl) {
  const apiKey = trimmed(env.RESEND_API_KEY);
  const from = trimmed(env.MAIL_FROM);
  if (!apiKey && !from) return null;                 /* delivery is simply off */
  if (!apiKey) problems.push("RESEND_API_KEY is not set, and MAIL_FROM is");
  if (!from) problems.push("MAIL_FROM is not set, and RESEND_API_KEY is");
  if (!appUrl) {
    problems.push("APP_URL is not set, and mail is configured: an invitation email carries a link, "
      + "and the origin for it is configuration rather than anything a request may say");
  }
  return apiKey && from && appUrl ? { apiKey, from } : null;
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
  const appUrl = siteSettings(env, problems);
  return finish(problems, {
    port,
    host: trimmed(env.HOST) || "0.0.0.0",
    logLevel: trimmed(env.LOG_LEVEL) || "info",
    database,
    auth,
    /* Both null when nothing was configured: writing a link and sending one are
       capabilities, not requirements. */
    appUrl,
    mail: mailSettings(env, problems, appUrl),
  });
}

/* What may be logged at startup: settings, never secrets. */
const describeConfig = (config) => ({
  port: config.port,
  host: config.host,
  logLevel: config.logLevel,
  databaseSsl: config.database.sslMode,
  databaseCaConfigured: config.database.caConfigured,
  databasePoolMax: config.database.poolMax,
  databaseStatementTimeoutMs: config.database.statementTimeoutMs,
  jwksHost: (() => { try { return new URL(config.auth.jwksUrl).host; } catch { return "invalid"; } })(),
  audience: config.auth.audience,
  /* That a key is configured, never which one, and never any part of it. */
  identityKeyConfigured: Boolean(config.auth.apiKey),
  /* Whether MetYet can send an invitation, and where its links point. The
     sender and the key are never described beyond existing. */
  mailConfigured: Boolean(config.mail),
  appUrl: config.appUrl || null,
});

/* What the server refuses to start without, and therefore what any deployment
   description has to carry. Declared here, beside the loaders that enforce it,
   so a blueprint cannot quietly fall behind the contract — which is exactly what
   happened when registration began requiring a publishable key and render.yaml
   still listed two variables. A test holds the blueprint to this list. */
const REQUIRED_SERVER_ENV = Object.freeze(["DATABASE_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"]);

module.exports = { loadServerConfig, loadDatabaseConfig, loadAuthConfig, describeConfig,
  ConfigError, SSL_MODES, REQUIRED_SERVER_ENV };
