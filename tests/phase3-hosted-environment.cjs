/* ============================================================================
   PHASE 3 BATCH 6 — THE HOSTED ENVIRONMENT, CHECKABLE BEFORE ANYONE SIGNS IN

   Batch 4 gave the database half of a hosted environment an operator command
   that says whether it is right (`db:status`). The identity half had none: a
   project still signing with the legacy shared secret, or a URL pointing at the
   wrong project, looked perfectly healthy until a real person tried to sign in
   and got a 401 with nothing to act on.

   It also turned out that render.yaml had quietly fallen behind the server's own
   configuration contract — applying the blueprint would have produced a service
   that refused to start. That is the first thing here, because it is the kind of
   drift a test should make impossible rather than catch twice.

     A  the deployment description carries the whole contract
     B  auth-check, without a token
     C  auth-check, with one
     D  nothing secret is printed, and nothing is changed
     E  sign-in: getting one real token, without it ever being visible
     F  register-partner and view: accepting an invitation, and seeing what it made
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { checkAuth, describeKeys, verdict } = require("../server/auth-check.js");
const { signIn, CODE_DIGITS } = require("../server/auth-signin.js");
const PR = require("../server/partner-register.js");
const { askSecret } = require("../server/secret-prompt.js");
const { DEFAULT_ALGORITHMS } = require("../server/auth/token-verifier.js");
const { runCommand, USAGE, connectionAdvice, TLS_TRUST_CODES, AUTH_FAILED_CODE } = require("../server/cli.js");
const { REQUIRED_SERVER_ENV, loadServerConfig, loadDatabaseConfig } = require("../server/config.js");

const ROOT = path.join(__dirname, "..");
const render = fs.readFileSync(path.join(ROOT, "render.yaml"), "utf8");
const runbook = fs.readFileSync(path.join(ROOT, "docs", "DEPLOYMENT.md"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

const ENV = {
  SUPABASE_URL: "https://projectref.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
};
const KEY = (alg, kid = "k1") => ({ kid, alg, kty: alg.startsWith("ES") ? "EC" : (alg.startsWith("HS") ? "oct" : "RSA") });
const jwks = (...keys) => async () => ({ keys });

/* auth-check with everything injected: no network, no provider, no clock. */
async function check(options = {}) {
  const lines = [];
  const code = await checkAuth({ env: { ...ENV, ...(options.env || {}) }, say: (l) => lines.push(String(l)),
    tokenFile: options.tokenFile,
    deps: { fetchJwks: options.fetchJwks || jwks(KEY("ES256")), verifier: options.verifier, identity: options.identity } });
  return { code, out: lines.join("\n") };
}

const verifierFor = (result) => ({ async verify() {
  if (result instanceof Error) throw result;
  return result;
} });
const identityFor = (result) => ({ async confirmedEmail() {
  if (result instanceof Error) throw result;
  return result;
} });
const tokenError = (reason) => Object.assign(new Error("no"), { code: "token.invalid", reason });

/* A token on disk, the way the command wants it — never on a command line. */
function tokenFile(contents) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "metyet-auth-check-")), "token");
  fs.writeFileSync(file, contents);
  return file;
}
const TOKEN = "header.payload.signature-that-never-reaches-anything";
const SUBJECT = "11111111-2222-3333-4444-555555555555";
const EMAIL = "owner@northline.example";

/* ============================================================== A */
describe("A. the deployment description carries the whole contract", () => {
  test("every variable the server refuses to start without is in the blueprint", () => {
    /* The list lives beside the loaders that enforce it, so this cannot be a
       snapshot of what the blueprint happened to say on the day. */
    const declared = [...render.matchAll(/- key: (\w+)/g)].map((m) => m[1]);
    REQUIRED_SERVER_ENV.forEach((name) => {
      assert(declared.includes(name), `${name} is required to start but is not in render.yaml`);
    });
    /* And each of them is set by hand, never given a value in a committed file. */
    const byHand = [...render.matchAll(/- key: (\w+)\n\s+sync: false/g)].map((m) => m[1]);
    REQUIRED_SERVER_ENV.forEach((name) => {
      assert(byHand.includes(name), `${name} must be sync: false — an operator sets it, the file never carries it`);
    });
  });

  test("the contract is what the loaders actually enforce", () => {
    const complete = { ...ENV, DATABASE_URL: "postgresql://user:pw@db.example:5432/metyet" };
    assert(loadServerConfig(complete), "a complete environment starts");
    /* Removing any one of them stops the server, and the message names it. */
    REQUIRED_SERVER_ENV.forEach((name) => {
      const missing = { ...complete };
      delete missing[name];
      let threw = null;
      try { loadServerConfig(missing); } catch (e) { threw = e; }
      assert(threw && threw.code === "config.invalid", `${name} is genuinely required`);
      assert(new RegExp(name).test(threw.message), `and the failure names it: ${threw && threw.message}`);
    });
  });

  test("the blueprint still carries no secret, and the runbook still explains the key", () => {
    const withValues = [...render.matchAll(/- key: (\w+)\n\s+value: (.*)/g)].map((m) => [m[1], m[2].replace(/"/g, "")]);
    withValues.forEach(([key, value]) => {
      assert(!/SECRET|PASSWORD|TOKEN/i.test(key), `${key} has a value in the file`);
      assert(!/sb_(secret|publishable)_\w{10,}|eyJ[A-Za-z0-9_-]{20,}/.test(value), `${key} looks like a credential`);
    });
    assert(/SUPABASE_PUBLISHABLE_KEY/.test(runbook), "the runbook names the key");
    assert(/publishable/i.test(render) && /secret or service-role key here is refused|A SECRET or service-role key/i.test(render),
      "and the blueprint says which key, and which one is refused");
  });

  test("the check is a script the runbook names", () => {
    eq(pkg.scripts["auth:check"], "node server/cli.js auth-check");
    assert(runbook.includes("auth:check"), "the runbook tells an operator to run it");
    assert(USAGE.includes("auth-check"), "and the command lists itself");
  });
});

/* ==============================================================  A2
   HOW THE DATABASE CONNECTION IS PROTECTED.

   The first real Supabase project met `SELF_SIGNED_CERT_IN_CHAIN` from
   `db:status`. That was verification working — Supabase signs its database
   certificate with its own root, which is not in Node's trust store — but two
   things about it were MetYet's fault: the mode that performed full verification
   was called `require`, which in libpq means the opposite, and the failure said
   only what the TLS library said, which sends an operator hunting for a fault
   in their connection string or for a way to switch verification off.
   ========================================================================== */
describe("A2. the database connection is verified, and says so accurately", () => {
  const DB = { DATABASE_URL: "postgresql://metyet:pw@aws-0-ca-central-1.pooler.supabase.com:5432/postgres" };
  const PEM = "-----BEGIN CERTIFICATE-----\nMIIfake\n-----END CERTIFICATE-----";

  test("the default verifies the certificate and the host", () => {
    const db = loadDatabaseConfig(DB);
    eq(db.sslMode, "verify-full", "and it is called what it does");
    eq(db.ssl.rejectUnauthorized, true);
    /* node-postgres sets `servername` from the host, so rejectUnauthorized
       checks the NAME as well as the chain — "verify-full" is accurate. */
    const pg = fs.readFileSync(path.join(ROOT, "node_modules", "pg", "lib", "connection.js"), "utf8");
    assert(/options\.servername = host/.test(pg), "the driver still names the host it expects");
  });

  test("`require` is refused rather than guessed at", () => {
    /* In libpq it means "encrypt, do not verify". Here it used to mean
       "verify". Either reading is somebody's reasonable expectation, and
       choosing one silently is how a production connection stops being checked
       without anyone deciding that. */
    for (const mode of ["require", "prefer", "allow", "verify-ca"]) {
      let threw = null;
      try { loadDatabaseConfig({ ...DB, DATABASE_SSL: mode }); } catch (e) { threw = e; }
      assert(threw && threw.code === "config.invalid", mode + " is refused");
      assert(/ambiguous/.test(threw.message), mode + " says why: " + threw.message);
      assert(/verify-full/.test(threw.message) && /no-verify/.test(threw.message),
        "and offers both readings by name");
    }
  });

  test("the three modes mean three different things", () => {
    eq(JSON.stringify(loadDatabaseConfig({ ...DB, DATABASE_SSL: "verify-full" }).ssl),
      JSON.stringify({ rejectUnauthorized: true }), "encrypt and verify");
    eq(JSON.stringify(loadDatabaseConfig({ ...DB, DATABASE_SSL: "no-verify" }).ssl),
      JSON.stringify({ rejectUnauthorized: false }), "encrypt only");
    eq(loadDatabaseConfig({ ...DB, DATABASE_SSL: "disable" }).ssl, false, "neither");
    let threw = null;
    try { loadDatabaseConfig({ ...DB, DATABASE_SSL: "maybe" }); } catch (e) { threw = e; }
    assert(threw && /must be one of verify-full, no-verify, disable/.test(threw.message), threw.message);
  });

  test("a provider's own root can be supplied as text or as a file", () => {
    eq(loadDatabaseConfig({ ...DB, DATABASE_CA_CERT: PEM }).ssl.ca, PEM, "as text, for a host's environment editor");
    eq(loadDatabaseConfig({ ...DB, DATABASE_CA_CERT: PEM }).caConfigured, true);

    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "metyet-ca-")), "prod-ca.crt");
    fs.writeFileSync(file, PEM + "\n");
    eq(loadDatabaseConfig({ ...DB, DATABASE_CA_CERT_FILE: file }).ssl.ca, PEM, "as a path, for the file you downloaded");

    /* And it is still verification that is doing the work: a CA without
       verification would be decoration. */
    eq(loadDatabaseConfig({ ...DB, DATABASE_CA_CERT_FILE: file }).ssl.rejectUnauthorized, true);
    eq(loadDatabaseConfig(DB).caConfigured, false, "and none configured is reported as none");
  });

  test("a CA that cannot be read, or is not a certificate, stops the process", () => {
    const bad = [
      [{ DATABASE_CA_CERT_FILE: "/nonexistent/metyet/ca.crt" }, /could not be read \(ENOENT\)/],
      [{ DATABASE_CA_CERT: "not a certificate" }, /must be PEM text/],
      [{ DATABASE_CA_CERT: PEM, DATABASE_CA_CERT_FILE: "/tmp/x.crt" }, /not both/],
    ];
    for (const [env, expected] of bad) {
      let threw = null;
      try { loadDatabaseConfig({ ...DB, ...env }); } catch (e) { threw = e; }
      assert(threw && threw.code === "config.invalid", JSON.stringify(env));
      assert(expected.test(threw.message), threw.message);
      assert(!threw.message.includes(PEM), "and no certificate content in the message");
    }
  });

  test("a trust failure explains itself, and points at the secure fix", () => {
    for (const code of [...TLS_TRUST_CODES]) {
      const lines = [];
      assert(connectionAdvice(Object.assign(new Error("self-signed certificate in certificate chain"), { code }),
        (l) => lines.push(l)), code + " is recognised");
      const said = lines.join("\n");
      assert(/verification working/.test(said), "it says the check is doing its job: " + said);
      assert(/DATABASE_CA_CERT_FILE/.test(said), "and names the setting that fixes it");
      assert(/SSL Configuration/.test(said), "and where the certificate comes from");
      assert(/Do not turn verification off/.test(said), "and warns against the tempting shortcut");
    }
    /* A name mismatch is a different problem and gets a different sentence. */
    const altname = [];
    assert(connectionAdvice({ code: "ERR_TLS_CERT_ALTNAME_INVALID" }, (l) => altname.push(l)));
    assert(/not for this host/.test(altname.join("\n")), altname.join("\n"));
    /* And an ordinary failure is left alone. */
    eq(connectionAdvice(new Error("something else"), () => { throw new Error("should not speak"); }), false);
    eq(connectionAdvice({ code: "42P01" }, () => { throw new Error("should not speak"); }), false,
      "an ordinary database error is left alone");
  });

  test("the advice reaches an operator running the real command", async () => {
    const lines = [];
    const broken = { transaction: async () => { throw Object.assign(new Error("self-signed certificate in certificate chain"),
      { code: "SELF_SIGNED_CERT_IN_CHAIN" }); } };
    const code = await runCommand(["status"], { say: (l) => lines.push(String(l)), env: {},
      database: { db: broken, repository: { loadWorld: async () => ({}), readVersion: async () => 0 } } });
    eq(code, 1);
    const said = lines.join("\n");
    assert(/SELF_SIGNED_CERT_IN_CHAIN/.test(said), "the code is still reported");
    assert(/DATABASE_CA_CERT_FILE/.test(said), "and now so is what to do: " + said);
  });

  /* An intermittent authentication failure against a hosted pooler is not a
     wrong password, and the instinct it provokes — reset the database password —
     is the one action that opens the provider's documented stale-cache window
     rather than closing it. */
  test("an authentication failure says what to check before changing anything", () => {
    const lines = [];
    assert(connectionAdvice({ code: AUTH_FAILED_CODE }, (l) => lines.push(l)), "28P01 is recognised");
    const said = lines.join("\n");
    assert(/the password is not wrong/.test(said), "it says what intermittency means: " + said);
    assert(/db:status/.test(said), "it names a read-only way to find out");
    assert(/postgres\.<project-ref>/.test(said), "and the shared pooler's username format");
    assert(/percent-encoded/.test(said), "and the reserved-character trap");
    assert(/[Rr]esetting the password is the last thing to try/.test(said.replace(/\s+/g, " ")),
      "and warns off the action that makes it worse");
  });

  /* WHY THIS EXISTS. `db:status` authenticated, `db:migrate` got 28P01, and
     `db:status` authenticated again — same terminal, same environment, seconds
     apart. The first question was whether the two commands could possibly be
     using different credentials or different connection behaviour. They cannot,
     and this keeps it that way: one loader, one pool, one connection each. */
  test("status and migrate open the database in exactly the same way", async () => {
    const pools = [];
    const pg = require("pg");
    const RealPool = pg.Pool;
    class SpyPool extends RealPool {
      constructor(options) { pools.push(JSON.parse(JSON.stringify(options))); super(options); }
    }
    /* db-pool.js destructures Pool when it loads, so the substitution has to be
       in place before it does — hence the cache clear on both sides. */
    const dbPoolPath = require.resolve("../server/db-pool.js");
    const cliPath = require.resolve("../server/cli.js");
    const reload = () => { delete require.cache[dbPoolPath]; delete require.cache[cliPath]; };
    const env = { DATABASE_URL: "postgresql://someone:secret@db.example.supabase.com:5432/postgres",
      DATABASE_SSL: "no-verify" };
    reload();
    pg.Pool = SpyPool;
    try {
      const isolated = require(cliPath).runCommand;
      /* Neither can connect — nothing is listening — which is the point: what is
         compared is what they ASK for, before any network exists. */
      await isolated(["status"], { env, say: () => {} });
      await isolated(["migrate"], { env, say: () => {} });
    } finally {
      pg.Pool = RealPool;
      reload();
      require(cliPath);
    }
    eq(pools.length, 2, "one pool each, neither command opening a second");
    eq(JSON.stringify(pools[0]), JSON.stringify(pools[1]),
      "and identical options: the same connection string, TLS, pool size and application name");
    assert(!("user" in pools[0]) && !("password" in pools[0]),
      "the credential is never taken apart and reassembled — it is the string as given");

    /* And the source says so too: one loader, called in one place. */
    const dbPool = fs.readFileSync(path.join(ROOT, "server", "db-pool.js"), "utf8");
    eq((dbPool.match(/loadDatabaseConfig\(/g) || []).length, 1, "one place reads the environment");
    eq((dbPool.match(/new Pool\(/g) || []).length, 1, "and one place opens a pool");
    const cli = fs.readFileSync(path.join(ROOT, "server", "cli.js"), "utf8");
    assert(!/new Pool|connectionString|DATABASE_URL\s*[,)]/.test(cli.replace(/\/\*[\s\S]*?\*\//g, "")),
      "and no command builds a connection of its own");
  });

  test("the blueprint verifies, and carries the certificate as environment", () => {
    assert(/- key: DATABASE_SSL\n\s+value: verify-full/.test(render), "Render verifies the certificate");
    assert(/- key: DATABASE_CA_CERT\n\s+sync: false/.test(render), "and the CA is set by hand, not committed");
    assert(!/BEGIN CERTIFICATE/.test(render), "no certificate material in the file");
    const prose = runbook.replace(/\s+/g, " ");
    assert(/verify-full/.test(prose) && /SSL Configuration/.test(prose), "and the runbook says where it comes from");
    assert(/SELF_SIGNED_CERT_IN_CHAIN/.test(runbook), "and what that error means when it happens");
  });
});

/* ============================================================== B */
describe("B. auth-check, without a token", () => {
  test("it says what this server will require of the project", async () => {
    const result = await check();
    eq(result.code, 0, result.out);
    assert(/project: *projectref\.supabase\.co/.test(result.out), result.out);
    assert(/issuer: *https:\/\/projectref\.supabase\.co\/auth\/v1/.test(result.out), "the issuer it requires");
    assert(/audience: *authenticated/.test(result.out), "the audience it requires");
    assert(/user: *https:\/\/projectref\.supabase\.co\/auth\/v1\/user/.test(result.out), "where it asks about a person");
    assert(/algorithms: *ES256, RS256/.test(result.out), "the algorithms it accepts, stated up front");
    assert(/accepted algorithm/.test(result.out), "and what it found");
  });

  test("a project still signing with the legacy shared secret fails, and says so", async () => {
    const result = await check({ fetchJwks: jwks(KEY("HS256", "legacy")) });
    eq(result.code, 1);
    assert(/SYMMETRIC/.test(result.out), "the key is named as the problem");
    assert(/legacy shared secret/.test(result.out) && /asymmetric JWT signing keys/.test(result.out),
      "and the fix is named: " + result.out);
  });

  /* THE CHECK CERTIFIES THE VERIFIER'S CONTRACT, NOT A BROADER IDEA OF IT.
     ES384, PS256 and EdDSA are genuinely asymmetric and every token signed with
     one is refused by the real server, so a check that passed them would be
     green about an environment where nobody can sign in. */
  test("every algorithm the verifier accepts passes, and only those", async () => {
    for (const alg of DEFAULT_ALGORITHMS) {
      const result = await check({ fetchJwks: jwks(KEY(alg)) });
      eq(result.code, 0, `${alg} is accepted: ${result.out}`);
      assert(result.out.includes("supported"), alg + " is called supported");
    }
    eq(DEFAULT_ALGORITHMS.join(), "ES256,RS256", "and this is the list being certified");
  });

  test("an asymmetric key on an algorithm this server does not accept fails", async () => {
    for (const alg of ["ES384", "ES512", "PS256", "PS384", "RS384", "RS512", "EdDSA"]) {
      const result = await check({ fetchJwks: jwks(KEY(alg, "modern")) });
      eq(result.code, 1, `${alg} must not pass: ${result.out}`);
      assert(/asymmetric, but NOT accepted by this server/.test(result.out), alg + " is classified honestly");
      /* The sentence an operator needs, wrapped across lines in the output. */
      assert(/An asymmetric key is\s+not enough on its own/.test(result.out.replace(/\s+/g, " ")),
        "and the output explains that asymmetric is not the bar: " + result.out);
      assert(result.out.includes(alg), "naming the algorithm that would be refused");
      assert(!/legacy shared secret/.test(result.out), "this is not the symmetric problem, and is not described as one");
    }
  });

  test("a key set passes only when one of its keys is on an accepted algorithm", async () => {
    const mixedUnsupported = await check({ fetchJwks: jwks(KEY("HS256", "legacy"), KEY("ES384", "modern")) });
    eq(mixedUnsupported.code, 1, "symmetric plus unsupported-asymmetric is still no");
    assert(/SYMMETRIC/.test(mixedUnsupported.out) && /NOT accepted/.test(mixedUnsupported.out),
      "and each key is explained on its own terms: " + mixedUnsupported.out);

    const mixedSupported = await check({ fetchJwks: jwks(KEY("HS256", "legacy"), KEY("ES384", "modern"), KEY("RS256", "current")) });
    eq(mixedSupported.code, 0, "one accepted key is enough: " + mixedSupported.out);
    assert(/1 key on an accepted algorithm \(ES256, RS256\)/.test(mixedSupported.out), mixedSupported.out);
  });

  test("a key with no readable algorithm is never counted as supported", async () => {
    const noAlg = await check({ fetchJwks: async () => ({ keys: [{ kid: "x", kty: "EC" }] }) });
    eq(noAlg.code, 1, "an EC key with no alg is not a supported signing key");
    assert(/no alg/.test(noAlg.out), "it is described: " + noAlg.out);
    const blank = await check({ fetchJwks: async () => ({ keys: [{ kid: "x", kty: "RSA", alg: "" }] }) });
    eq(blank.code, 1, "and neither is a blank one");
  });

  test("the check reads the verifier's list rather than keeping its own", () => {
    const source = fs.readFileSync(path.join(ROOT, "server", "auth-check.js"), "utf8");
    const body = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert(/DEFAULT_ALGORITHMS[^\n]*require\("\.\/auth\/token-verifier\.js"\)/.test(body),
      "the allowlist is imported from the verifier");
    /* A second copy is the whole defect this fixes: it would go on agreeing
       with the verifier right up until one of them changed. */
    assert(!/["']ES256["']|["']RS256["']/.test(body), "and not restated here, where it could drift");
  });

  test("an empty key set fails rather than passing quietly", async () => {
    const empty = await check({ fetchJwks: jwks() });
    eq(empty.code, 1);
    assert(/key set is empty/.test(empty.out));
    const nothing = await check({ fetchJwks: async () => ({}) });
    eq(nothing.code, 1, "and so does an answer with no keys at all");
  });

  test("a mixed key set passes on the supported ones", async () => {
    const result = await check({ fetchJwks: jwks(KEY("HS256", "legacy"), KEY("ES256", "current")) });
    eq(result.code, 0, result.out);
    assert(/1 key on an accepted algorithm/.test(result.out), result.out);
    assert(/SYMMETRIC/.test(result.out), "and the legacy one is still shown, because it is still there");
  });

  test("a provider that cannot be reached fails, and points at the setting", async () => {
    const result = await check({ fetchJwks: async () => { throw new Error("getaddrinfo ENOTFOUND projectref.supabase.co"); } });
    eq(result.code, 1);
    assert(/JWKS could not be read/.test(result.out) && /SUPABASE_URL/.test(result.out), result.out);
  });

  test("a misconfigured environment is refused before anything is fetched", async () => {
    for (const [env, what] of [
      [{ SUPABASE_URL: "" }, "no project"],
      [{ SUPABASE_PUBLISHABLE_KEY: "" }, "no key"],
      [{ SUPABASE_PUBLISHABLE_KEY: "sb_secret_abc123" }, "a secret key"],
      [{ SUPABASE_URL: "http://projectref.supabase.co" }, "a plaintext project"],
    ]) {
      let threw = null;
      try { await check({ env, fetchJwks: async () => { throw new Error("should not be reached"); } }); } catch (e) { threw = e; }
      assert(threw && threw.code === "config.invalid", what + " is refused by configuration: " + (threw && threw.message));
    }
  });

  test("the key check describes what is published, and nothing more", () => {
    const described = describeKeys({ keys: [
      { kid: "a", alg: "ES256", kty: "EC", x: "PUBLIC-X", y: "PUBLIC-Y" },
      { kid: "b", alg: "RS256", kty: "RSA", n: "PUBLIC-N", e: "AQAB" },
      { kid: "c", alg: "HS256", kty: "oct" },
      { kid: "d", alg: "ES384", kty: "EC" },
      { kty: "EC" },
    ] });
    eq(described.map((k) => `${k.kid}:${k.alg}:${k.supported}`).join(),
      "a:ES256:true,b:RS256:true,c:HS256:false,d:ES384:false,(none):(kty EC, no alg):false");
    eq(described.map(verdict).join(" | "),
      "supported | supported | SYMMETRIC — never accepted | asymmetric, but NOT accepted by this server"
      + " | asymmetric, but NOT accepted by this server",
      "three states, told apart");
    assert(!JSON.stringify(described).includes("PUBLIC-X"), "no key material, even public key material");
  });
});

/* ============================================================== C */
describe("C. auth-check, with a token", () => {
  test("it verifies the token and then asks the provider who that is", async () => {
    const result = await check({ tokenFile: tokenFile(TOKEN + "\n"),
      verifier: verifierFor({ subject: SUBJECT, expiresAt: 1789000000 }),
      identity: identityFor({ email: EMAIL }) });
    eq(result.code, 0, result.out);
    assert(result.out.includes(`verified:    subject ${SUBJECT}`), result.out);
    assert(result.out.includes(`confirmed:   ${EMAIL}`), "and the address the provider vouches for");
    assert(/An\s*\n?invitation to that address can be redeemed/.test(result.out), "what that means");
  });

  test("a token that does not verify fails with the server's own reason", async () => {
    for (const reason of ["expired", "signature", "claims", "algorithm", "unknown-key", "malformed"]) {
      const result = await check({ tokenFile: tokenFile(TOKEN), verifier: verifierFor(tokenError(reason)) });
      eq(result.code, 1, reason);
      assert(result.out.includes(`did not verify (${reason})`), result.out);
    }
  });

  test("an address the provider has not confirmed fails closed", async () => {
    const result = await check({ tokenFile: tokenFile(TOKEN),
      verifier: verifierFor({ subject: SUBJECT, expiresAt: 1789000000 }),
      identity: identityFor({ unconfirmed: true }) });
    eq(result.code, 1);
    assert(/no confirmed address/.test(result.out), result.out);
    assert(/cannot be redeemed by it/.test(result.out), "and says what that costs");
  });

  test("a provider that cannot be asked fails closed too", async () => {
    const result = await check({ tokenFile: tokenFile(TOKEN),
      verifier: verifierFor({ subject: SUBJECT, expiresAt: 1789000000 }),
      identity: identityFor(Object.assign(new Error("no"), { code: "identity.unavailable", reason: "unreachable" })) });
    eq(result.code, 1);
    assert(/could not be asked about this person \(unreachable\)/.test(result.out), result.out);
    assert(/fails closed/.test(result.out), "and names the behaviour that follows from it");
  });

  test("a missing or empty token file is an error, not an empty verification", async () => {
    const missing = await check({ tokenFile: "/nonexistent/metyet/token" });
    eq(missing.code, 1);
    assert(/token file could not be read/.test(missing.out), missing.out);
    const empty = await check({ tokenFile: tokenFile("   \n") });
    eq(empty.code, 1);
    assert(/token file is empty/.test(empty.out), empty.out);
  });
});

/* ============================================================== D */
describe("D. nothing secret is printed, and nothing is changed", () => {
  test("the token never appears in the output, however the check ends", async () => {
    const file = tokenFile(TOKEN);
    const runs = [
      await check({ tokenFile: file, verifier: verifierFor({ subject: SUBJECT, expiresAt: 1789000000 }),
        identity: identityFor({ email: EMAIL }) }),
      await check({ tokenFile: file, verifier: verifierFor(tokenError("expired")) }),
      await check({ tokenFile: file, verifier: verifierFor({ subject: SUBJECT, expiresAt: 1789000000 }),
        identity: identityFor({ unconfirmed: true }) }),
    ];
    runs.forEach((result) => {
      assert(!result.out.includes(TOKEN), "no token");
      assert(!result.out.includes("sb_publishable_example"), "no key, not even the publishable one");
      assert(!result.out.includes(file), "and not the path it was read from");
    });
  });

  test("it reports that a key is configured without saying which", async () => {
    const result = await check();
    assert(/key: *configured/.test(result.out), result.out);
    assert(!/sb_publishable/.test(result.out), "the key itself stays out");
  });

  test("it needs no database, and reaches none", async () => {
    /* An operator configuring Supabase has not necessarily configured Postgres
       yet, and should not have to in order to find out whether Auth is right. */
    const lines = [];
    const code = await runCommand(["auth-check"], { env: ENV, say: (l) => lines.push(String(l)) });
    assert(code === 0 || code === 1, "it ran without DATABASE_URL");
    assert(!lines.join("\n").includes("DATABASE_URL"), "and never asked for one: " + lines.join("\n"));
  });

  test("it is a question, not a change", () => {
    const source = fs.readFileSync(path.join(ROOT, "server", "auth-check.js"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert(!/method:\s*["'](POST|PUT|PATCH|DELETE)/i.test(source), "it never writes to the provider");
    assert(!/saveWorld|linkAccount|migrate\(|createInvitation/.test(source), "and changes nothing here either");
    assert(!/writeFile|unlink/.test(source), "it does not touch the token file it was given");
  });
});

/* ============================================================== E

   `auth:check --token-file` could verify a real token the whole way through and
   had no way to GET one — so proving the hosted environment meant pasting a
   session out of a browser console, which is how an access token ends up in a
   clipboard and a screenshot. `sign-in` closes that, and everything below is
   about it closing it without becoming a second way in.

   The provider is never contacted here: every request is injected. */
/* EIGHT digits, because this project's Email OTP length is set to 8 and the
   first version of this harness hard-coded six — refusing a real, correct code
   before it ever reached the provider. The fixture is the shape that broke it. */
const CODE = "24681357";
const SESSION = {
  access_token: "eyJreal.looking.token", refresh_token: "refresh-that-outlives-everything",
  expires_in: 3600, user: { id: SUBJECT, email: EMAIL, email_confirmed_at: "2026-09-10T09:00:00.000Z" },
};
const replies = (...statuses) => {
  const queue = [...statuses];
  return async (url, options) => {
    const next = queue.shift();
    const status = typeof next === "number" ? next : next.status;
    const body = typeof next === "number" ? SESSION : next.body;
    return { status, url, options, async json() {
      if (body instanceof Error) throw body;
      return body;
    } };
  };
};

/* A provider that answers the first call and then falls over on the nth, so a
   failure on one leg cannot be reported as a failure on the other. */
const failOnCall = (n) => {
  let call = 0;
  return async (url, opts) => {
    if (++call === n) throw new Error("network");
    return replies(200)(url, opts);
  };
};

/* One sign-in with everything injected: no provider, no terminal, no disk. */
async function signin(options = {}) {
  const lines = [];
  const asked = [];
  const written = [];
  const code = await signIn({
    env: { ...ENV, ...(options.env || {}) },
    say: (l) => lines.push(String(l)),
    email: "email" in options ? options.email : EMAIL,
    ...(options.out === undefined ? {} : { out: options.out }),
    deps: {
      fetchImpl: options.fetchImpl || (async (url, opts) => {
        asked.push({ url, body: JSON.parse(opts.body), headers: opts.headers, method: opts.method });
        return (options.replies || replies(200, 200))(url, opts);
      }),
      askForCode: options.askForCode || (async () => CODE),
      writeSecret: options.writeSecret || ((file, contents) => written.push({ file, contents })),
      mustBeIgnored: options.mustBeIgnored || (() => {}),
    },
  });
  return { code, out: lines.join("\n"), asked, written };
}

describe("E. one real sign-in, without the token ever being visible", () => {
  test("it asks the configured project, and only the configured project", async () => {
    const result = await signin();
    eq(result.code, 0, result.out);
    eq(result.asked.length, 2, "one request to send the email, one to verify the code");
    eq(result.asked[0].url, "https://projectref.supabase.co/auth/v1/otp", "the project's own otp endpoint");
    eq(result.asked[1].url, "https://projectref.supabase.co/auth/v1/verify", "and its own verify endpoint");
    /* Both endpoints come from the issuer the rest of the server derives, so an
       override cannot point the sign-in at one project and the check at another. */
    const source = fs.readFileSync(path.join(ROOT, "server", "auth-signin.js"), "utf8");
    assert(!/supabase\.co|https:\/\/[a-z]/.test(source.replace(/\/\*[\s\S]*?\*\//g, "")),
      "no provider host is written into the code");
    result.asked.forEach((call) => eq(call.headers.apikey, "sb_publishable_example", "the publishable key, as the gateway wants"));
  });

  test("the sign-in request carries the address and nothing else", async () => {
    /* An invited first-time address has no auth user yet. Sending create_user
       either way would be this file having an opinion about signup policy; it
       must not. GoTrue's own default decides, exactly as the browser client's
       signInWithOtp leaves it. */
    const result = await signin();
    eq(JSON.stringify(result.asked[0].body), JSON.stringify({ email: EMAIL }),
      "no create_user, no shouldCreateUser, no data — just the address");
  });

  test("the code is verified with the semantics that make one email carry both doors", async () => {
    const result = await signin();
    eq(result.asked[1].body.type, "email",
      "type \"email\" — the one that checks BOTH the confirmation and recovery token");
    eq(result.asked[1].body.token, CODE, "the typed code, exactly as typed");
    eq(result.asked[1].body.email, EMAIL, "against the address it was sent to");
    assert(!("token_hash" in result.asked[1].body), "a token and a token_hash together is refused by the provider");
    assert(/two doors to the same credential/.test(result.out), "and the operator is told what that means: " + result.out);
  });

  /* THE CODE'S LENGTH IS THE PROVIDER'S, NOT OURS.

     The first version of this harness required exactly six digits, because
     Supabase's passwordless guide says "six-digit code". The real project emits
     EIGHT, and a real correct code was refused locally with "that is not a
     six-digit code" — the request never reached the provider. The length is a
     per-project setting (Email OTP length, 6 to 10, default 6), so the rule is
     the provider's documented range rather than any one project's value. */
  test("a code of any length the provider can issue is accepted, and sent unchanged", async () => {
    eq(CODE.length, 8, "the fixture is the eight-digit shape that broke this");
    for (const digits of [6, 7, 8, 9, 10]) {
      const typed = "1234567890".slice(0, digits);
      const result = await signin({ askForCode: async () => typed });
      eq(result.code, 0, `${digits} digits is a code the provider could have issued: ${result.out}`);
      eq(result.asked[1].body.token, typed, "and it goes out exactly as typed, unpadded and untrimmed");
      eq(result.written.length, 1, "and the sign-in completes");
    }
    eq(CODE_DIGITS.min, 6, "the documented minimum");
    eq(CODE_DIGITS.max, 10, "and the documented maximum");
  });

  test("anything that is not such a code is refused before the provider is asked", async () => {
    const bad = ["12345", "12345678901", "abcdefgh", "1234 5678", "1234-5678", "", "  ", "12345678\n9",
      "١٢٣٤٥٦٧٨", "1e7", "+1234567", "0x123456"];
    for (const typed of bad) {
      const result = await signin({ askForCode: async () => typed });
      eq(result.code, 1, `"${typed.replace(/\s/g, "·")}" is refused: ${result.out}`);
      eq(result.asked.length, 1, "and the verify request is never made — only the email was sent");
      eq(result.written.length, 0, "and nothing is written");
      assert(/digits only/.test(result.out), "and it says what a code looks like: " + result.out);
    }
  });

  test("the refusal says what was wrong without repeating the code back", async () => {
    const result = await signin({ askForCode: async () => "9876" });
    assert(/digits only/.test(result.out) && /6 to 10/.test(result.out), "the shape: " + result.out);
    assert(/you typed 4 characters/.test(result.out), "and what was typed, as a length: " + result.out);
    assert(!result.out.includes("9876"), "never the characters themselves — a near-miss is still a credential");
    assert(/Authentication → Email provider/.test(result.out), "and where the setting lives");
  });

  test("no six-digit claim survives anywhere an operator can read one", () => {
    const stale = /six[- ]digit|6[- ]digit/i;
    const signinSource = fs.readFileSync(path.join(ROOT, "server", "auth-signin.js"), "utf8");
    const cliSource = fs.readFileSync(path.join(ROOT, "server", "cli.js"), "utf8");
    /* The implementation may DISCUSS the old assumption — that is how the next
       person learns why the range is the range — but it may not ASSERT it. */
    const claims = signinSource.split("\n")
      .filter((line) => stale.test(line) && !/^\s*(\*|\/\*|\s*$)/.test(line) && !/hard-coded six|not six digits|says "six-digit"/.test(line));
    eq(claims.length, 0, "stale six-digit claims in auth-signin.js: " + claims.join(" | "));
    assert(!stale.test(cliSource), "and none in the CLI");
    /* The runbook may only mention six as the provider's DEFAULT, never as the
       length of the code the operator is about to type. */
    runbook.split("\n").filter((line) => stale.test(line)).forEach((line) => {
      /* Mentioning six is fine where the line CORRECTS the assumption — says it
         is the default, says it is not the length, or quotes somebody saying
         so. What is not fine is a line that tells the operator their code is
         six digits long. */
      assert(/\bnot\b|\bdefault\b|\bsays\b|6 to 10|between 6 and 10/.test(line),
        "stale runbook claim: " + line);
    });
    assert(/6 to 10|between 6 and 10/.test(runbook), "and the runbook states the real range");
    /* The other stale assumption the real run exposed: `/otp` sends CONFIRM
       SIGNUP, not Magic Link, to an address that is not yet a confirmed user —
       which is every Trusted Partner's first sign-in, the one that matters. A
       runbook naming only one template sends the first code out without a code
       in it. Both must be named, and named as both. */
    const prose = runbook.replace(/\s+/g, " ");
    assert(/Two templates, not one/.test(prose), "the runbook insists on both templates");
    assert(/Magic Link\*\* \*and\* in \*\*Confirm signup|Magic Link.{0,20}and.{0,10}Confirm signup/.test(prose),
      "and says to put the placeholders in both");
    assert(/not yet a confirmed user|does not[^.]*it signs them up|hasn't completed|If it does not/.test(prose),
      "and says why: a first-time address is signed up rather than magic-linked");
  });

  test("the access token is written, and the refresh token is not kept at all", async () => {
    const result = await signin();
    eq(result.written.length, 1, "one file");
    eq(result.written[0].contents, SESSION.access_token, "holding exactly the access token, nothing around it");
    assert(!result.written[0].contents.includes(SESSION.refresh_token),
      "the refresh token outlives the access token by a long way and is dropped on the floor");
  });

  test("nothing secret is printed, on any path", async () => {
    const runs = [
      await signin(),
      await signin({ replies: replies(200, 403) }),
      await signin({ replies: replies(429) }),
      await signin({ askForCode: async () => "12345" }),
      await signin({ email: "not-an-address" }),
    ];
    runs.forEach((result) => {
      assert(!result.out.includes(SESSION.access_token), "no access token: " + result.out);
      assert(!result.out.includes(SESSION.refresh_token), "no refresh token");
      assert(!result.out.includes(CODE), "not even the one-time code");
      assert(!result.out.includes("sb_publishable_example"), "and not the key");
    });
  });

  test("a token is never accepted as an argument, and a code is never read from a pipe", () => {
    const source = fs.readFileSync(path.join(ROOT, "server", "auth-signin.js"), "utf8");
    const cli = fs.readFileSync(path.join(ROOT, "server", "cli.js"), "utf8");
    const bare = source.replace(/\/\*[\s\S]*?\*\//g, "");
    assert(!/flags\.(token|code)|--token=|--code=/.test(bare + cli.replace(/\/\*[\s\S]*?\*\//g, "")),
      "no flag carries a token or a code — they would be in shell history and in ps output");
    /* The prompt itself lives in secret-prompt.js, shared with the invitation
       credential — two commands reading a secret slightly differently is how
       one of them ends up echoing. The guarantees are asserted where they are. */
    assert(/askSecret/.test(bare), "the code comes from the shared hidden prompt");
    const prompt = fs.readFileSync(path.join(ROOT, "server", "secret-prompt.js"), "utf8");
    assert(/isTTY/.test(prompt), "which requires a terminal");
    /* Piping it in means it came from a file or a command line, which is the
       thing being avoided — so that fails rather than quietly working. */
    assert(/output:\s*muted/.test(prompt), "and does not echo");
    const { askForCode } = require("../server/auth-signin.js");
    return askForCode({ input: { isTTY: false }, output: { write() {} } }).then(
      () => { throw new Error("a non-terminal input should have been refused"); },
      (error) => assert(/terminal/.test(error.message), error.message));
  });

  test("it refuses to write anywhere git would commit", () => {
    const { mustBeIgnored, DEFAULT_OUT } = require("../server/auth-signin.js");
    const status = (code) => ({ run: () => ({ status: code }) });
    assert(mustBeIgnored("x", status(0)) === undefined, "an ignored path is fine");
    assert(mustBeIgnored("x", status(128)) === undefined, "and so is anywhere outside a repository");
    assert(mustBeIgnored("x", { run: () => ({ error: new Error("no git") }) }) === undefined, "and a machine without git");
    let threw = null;
    try { mustBeIgnored("committable.txt", status(1)); } catch (error) { threw = error; }
    assert(threw && /does not ignore/.test(threw.message), "but a tracked path is refused: " + (threw && threw.message));
    /* And the default really is ignored — by this repository's own rules. */
    assert(fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8").split("\n").map((l) => l.trim())
      .includes(".secrets/"), ".secrets/ is ignored, which is where the default lives");
    assert(DEFAULT_OUT.startsWith(".secrets/"), "and the default is inside it");
  });

  test("the file it writes is readable only by the person who ran it", () => {
    const { writeSecret } = require("../server/auth-signin.js");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metyet-signin-"));
    const file = path.join(dir, "nested", "access-token");
    writeSecret(file, "first");
    eq(fs.readFileSync(file, "utf8"), "first", "it writes");
    /* The mode argument only applies when the file is NEW, so re-using a
       world-readable file from yesterday is the case worth covering. */
    fs.chmodSync(file, 0o644);
    writeSecret(file, "second");
    eq(fs.readFileSync(file, "utf8"), "second", "it overwrites");
    if (process.platform !== "win32") {
      eq(fs.statSync(file).mode & 0o777, 0o600, "and it is 0600 either way");
    }
    /* The mode is on the open, not only on the chmod after it. Creating the
       file permissively and tightening it a moment later leaves a window in
       which anyone on the machine can read a live access token. */
    const source = fs.readFileSync(path.join(ROOT, "server", "auth-signin.js"), "utf8");
    assert(/openSync\([^)]*0o600\)/.test(source), "the file is created 0600, not created open and narrowed afterwards");
  });

  test("every failure is explicit, and stops", async () => {
    const cases = [
      [await signin({ email: "" }), 2, /--email/],
      [await signin({ email: "nonsense" }), 2, /look like an address/],
      [await signin({ replies: replies(429) }), 1, /rate-limits/],
      [await signin({ replies: replies(401) }), 1, /publishable key/],
      [await signin({ replies: replies(422) }), 1, /disabled|signups/],
      [await signin({ replies: replies(200, 403) }), 1, /single-use|wrong, already used, or expired/],
      [await signin({ askForCode: async () => "abcdefgh" }), 1, /digits only/],
      [await signin({ askForCode: async () => "12345" }), 1, /digits only/],
      [await signin({ askForCode: async () => "12345678901" }), 1, /digits only/],
      [await signin({ askForCode: async () => "" }), 1, /digits only/],
      [await signin({ askForCode: async () => "1234 5678" }), 1, /digits only/],
      [await signin({ replies: replies(200, { status: 200, body: new Error("not json") }) }), 1, /could not be read/],
      [await signin({ replies: replies(200, { status: 200, body: {} }) }), 1, /no access token/],
      /* Each leg is named separately, so a failure on the way out cannot be
         swallowed and then reported as a failure on the way back. */
      [await signin({ fetchImpl: async () => { throw new Error("network"); } }), 1, /reached to send the email/],
      [await signin({ fetchImpl: failOnCall(2) }), 1, /reached to verify the code/],
      [await signin({ mustBeIgnored: () => { throw new Error("git does not ignore that"); } }), 1, /does not ignore/],
      [await signin({ writeSecret: () => { throw Object.assign(new Error("no"), { code: "EACCES" }); } }), 1, /EACCES/],
    ];
    cases.forEach(([result, code, pattern], index) => {
      eq(result.code, code, `case ${index} exits non-zero: ${result.out}`);
      assert(pattern.test(result.out), `case ${index} says why: ${result.out}`);
      assert(!result.written.length, `case ${index} wrote nothing`);
    });
  });

  test("a refused verification never writes a file, and never claims a sign-in", async () => {
    const result = await signin({ replies: replies(200, 403) });
    eq(result.code, 1, result.out);
    assert(!/signed in/.test(result.out), "it does not report a session it did not get");
    eq(result.written.length, 0, "and leaves nothing behind");
  });

  test("it says plainly when the provider has not confirmed the address", async () => {
    const unconfirmed = { ...SESSION, user: { ...SESSION.user, email_confirmed_at: null } };
    const result = await signin({ replies: replies(200, { status: 200, body: unconfirmed }) });
    eq(result.code, 0, "a session is still a session");
    assert(/NOT YET/.test(result.out), "but it is not dressed up as confirmation: " + result.out);
    /* And the authority is still auth-check asking the provider — this line is
       a courtesy, never the thing registration believes. */
    assert(/auth:check -- --token-file/.test(result.out), "which is what it points at");
  });

  test("it creates no actor, touches no database, and has no route", async () => {
    const source = fs.readFileSync(path.join(ROOT, "server", "auth-signin.js"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert(!/registerPartner|redeem|createInvitation|saveWorld|linkAccount|withDatabase|DATABASE_URL/.test(source),
      "a Supabase auth user is not a MetYet actor, and nothing here pretends otherwise");
    assert(!/fastify|route|app\.(get|post)/i.test(source), "and nothing serves it");
    /* It needs no database, and asks for none. */
    const lines = [];
    const code = await runCommand(["sign-in"], { env: ENV, say: (l) => lines.push(String(l)) });
    eq(code, 2, "it ran without DATABASE_URL and refused for its own reason");
    assert(!lines.join("\n").includes("DATABASE_URL"), "never asking for one: " + lines.join("\n"));
    /* And the usage says what it is, so nobody has to read the source to find out. */
    assert(/sign-in --email/.test(USAGE), "the usage names it");
    eq(pkg.scripts["auth:sign-in"], "node server/cli.js sign-in", "and npm runs it");
  });
});


/* ============================================================== F

   `POST /api/registration/partner` had only ever been called by tests, in
   process. Proving it for real means one HTTP request carrying TWO credentials
   — a bearer token and a single-use invitation credential — and the obvious
   ways to make that request (curl, a browser console) put both into shell
   history or a scrollback buffer, which are the two worst places for either.

   So the command composes the request out of a file and a hidden prompt, and
   decides nothing: every rule about who may redeem what is on the server. What
   is tested here is the composing and the secrecy, plus that nothing in it can
   reach around the server to make a partner some other way. */
const CREDENTIAL = "abcdefghjkmnpqrstvwxyz0123456789";     // 32 symbols, the shape createInvitation makes
const BEARER = "eyJbearer.that.must.never.be.printed";
const REGISTERED = {
  ok: true, version: 3,
  state: { actor: { id: "tp_9k2m", name: "Northline Cards" }, cards: [], deals: [], preferences: {} },
};
const VIEWED = { version: 3, state: { actor: { id: "tp_9k2m", name: "Northline Cards" }, cards: [], deals: [] } };

const bearerFile = (contents = BEARER) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "metyet-register-")), "access-token");
  fs.writeFileSync(file, `${contents}\n`);
  return file;
};

const answers = (...replies) => {
  const queue = [...replies];
  return async () => {
    const next = queue.shift();
    if (next instanceof Error) throw next;
    const { status = 200, body = REGISTERED } = typeof next === "number" ? { status: next } : next;
    return { status, async json() {
      if (body instanceof Error) throw body;
      return body;
    } };
  };
};

/* One redemption with everything injected: no server, no terminal, no network. */
async function register(options = {}) {
  const lines = [];
  const sent = [];
  const code = await PR.registerPartner({
    say: (l) => lines.push(String(l)),
    url: "url" in options ? options.url : "http://127.0.0.1:8080",
    tokenFile: options.tokenFile || bearerFile(),
    deps: {
      askSecret: options.askSecret || (async () => CREDENTIAL),
      fetchImpl: async (url, init) => {
        sent.push({ url, method: init.method || "GET", headers: init.headers,
          body: init.body === undefined ? undefined : JSON.parse(init.body) });
        return (options.replies || answers(200))(url, init);
      },
    },
  });
  return { code, out: lines.join("\n"), sent };
}

async function viewAs(options = {}) {
  const lines = [];
  const sent = [];
  const code = await PR.view({
    say: (l) => lines.push(String(l)),
    url: "url" in options ? options.url : "http://127.0.0.1:8080",
    tokenFile: options.tokenFile || bearerFile(),
    deps: {
      fetchImpl: async (url, init) => {
        sent.push({ url, method: init.method || "GET", headers: init.headers, body: init.body });
        return (options.replies || answers({ status: 200, body: VIEWED }))(url, init);
      },
    },
  });
  return { code, out: lines.join("\n"), sent };
}

describe("F. accepting an invitation, with neither credential ever visible", () => {
  test("it sends exactly one request, to the registration route, with exactly one field", async () => {
    const result = await register();
    eq(result.code, 0, result.out);
    eq(result.sent.length, 1, "one request");
    eq(result.sent[0].url, "http://127.0.0.1:8080/api/registration/partner", "the canonical route");
    eq(result.sent[0].method, "POST");
    eq(JSON.stringify(result.sent[0].body), JSON.stringify({ token: CREDENTIAL }),
      "exactly { token } — the route refuses any other field, and so does this");
    eq(result.sent[0].headers.authorization, `Bearer ${BEARER}`, "the bearer, from the file");
  });

  test("neither credential is printed, on any path", async () => {
    const runs = [
      await register(),
      await register({ replies: answers({ status: 409, body: { error: { code: "command_refused", refused: "invitation-unusable" } } }) }),
      await register({ replies: answers({ status: 503, body: { error: { code: "service_unavailable" } } }) }),
      await register({ askSecret: async () => "" }),
      await register({ askSecret: async () => `${CREDENTIAL} ` === CREDENTIAL ? CREDENTIAL : "has space here" }),
      await register({ replies: answers(new Error("refused")) }),
      await viewAs(),
      await viewAs({ replies: answers({ status: 403, body: { error: { code: "account_not_provisioned" } } }) }),
    ];
    runs.forEach((result, index) => {
      assert(!result.out.includes(CREDENTIAL), `run ${index} leaked the credential: ${result.out}`);
      assert(!result.out.includes(BEARER), `run ${index} leaked the bearer`);
      assert(!/eyJ/.test(result.out), `run ${index} printed something token-shaped`);
    });
  });

  test("the credential is never an argument, and the bearer is only ever a file", () => {
    const source = fs.readFileSync(path.join(ROOT, "server", "partner-register.js"), "utf8");
    const cli = fs.readFileSync(path.join(ROOT, "server", "cli.js"), "utf8");
    const bare = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert(!/flags\.(token|credential|bearer|invitation)\b|--credential|--bearer/.test(bare(source) + bare(cli)),
      "no flag carries either credential — an argument is in shell history and in ps output");
    /* The bearer has exactly one source, and it is a file read. */
    eq((bare(source).match(/readFileSync/g) || []).length, 1, "one place reads the bearer");
    assert(!/process\.env\.\w*(TOKEN|BEARER|CREDENTIAL)/i.test(bare(source)),
      "and it is not taken from the environment either, where a child process would inherit it");
  });

  test("the credential is typed at a terminal, and refused if it is piped", () => {
    const source = fs.readFileSync(path.join(ROOT, "server", "partner-register.js"), "utf8");
    assert(/askSecret/.test(source), "it uses the shared hidden prompt");
    const prompt = fs.readFileSync(path.join(ROOT, "server", "secret-prompt.js"), "utf8");
    assert(/isTTY/.test(prompt) && /output: muted/.test(prompt), "which is TTY-only and not echoed");
    return askSecret("x", { input: { isTTY: false }, output: { write() {} } }).then(
      () => { throw new Error("a non-terminal input should have been refused"); },
      (error) => assert(/terminal/.test(error.message), error.message));
  });

  test("an obvious paste of the wrong secret is caught before it is sent", async () => {
    /* The check is deliberately not a shape regex — see the source. It catches
       the mistake a person makes at a hidden prompt, and nothing else. */
    eq(PR.credentialProblem("", BEARER), "nothing was typed");
    assert(/space or a line break/.test(PR.credentialProblem("two words", BEARER)));
    assert(/space or a line break/.test(PR.credentialProblem("wrapped\nline", BEARER)));
    assert(/access token, not the invitation/.test(PR.credentialProblem(BEARER, BEARER)),
      "the access token pasted in by mistake is refused rather than sent as a credential");
    eq(PR.credentialProblem(CREDENTIAL, BEARER), null, "and a real credential is not second-guessed");
    /* And a caught paste never reaches the network. */
    const result = await register({ askSecret: async () => BEARER });
    eq(result.code, 1, result.out);
    eq(result.sent.length, 0, "nothing was sent");
  });

  test("both credentials may only cross a connection that is encrypted or local", async () => {
    for (const bad of ["http://metyet.example", "http://192.168.1.10:8080", "http://localhost.evil.example", "ftp://x", "not a url", ""]) {
      const result = await register({ url: bad });
      eq(result.code, 1, `${bad} is refused: ${result.out}`);
      eq(result.sent.length, 0, "and nothing is sent");
      assert(/must be https/.test(result.out), result.out);
    }
    for (const fine of ["https://metyet.example", "http://127.0.0.1:8080", "http://localhost:3000", "http://[::1]:8080"]) {
      eq(PR.checkUrl(fine), fine.replace(/\/+$/, ""), `${fine} is allowed`);
    }
  });

  test("every refusal is explicit, stops, and says nothing was spent", async () => {
    const refusal = (refused) => answers({ status: 409, body: { error: { code: "command_refused", refused } } });
    const cases = [
      [await register({ replies: refusal("invitation-unusable") }), /unknown, expired, revoked/],
      [await register({ replies: refusal("wrong-recipient") }), /different address/],
      [await register({ replies: refusal("email-unverified") }), /no confirmed address/],
      [await register({ replies: refusal("already-linked") }), /already bound to somebody/],
      [await register({ replies: answers({ status: 503, body: { error: { code: "service_unavailable" } } }) }), /Nothing was spent/],
      [await register({ replies: answers(401) }), /did not accept the bearer/],
      [await register({ replies: answers(404) }), /no registration route/],
      [await register({ replies: answers({ status: 200, body: new Error("not json") }) }), /registered:/],
      [await register({ replies: answers(new Error("ECONNREFUSED")) }), /could not be reached/],
      [await register({ tokenFile: "/nonexistent/path/token" }), /token file could not be read/],
      [await register({ tokenFile: bearerFile("") }), /is empty/],
    ];
    cases.forEach(([result, pattern], index) => {
      assert(pattern.test(result.out), `case ${index}: ${result.out}`);
    });
    /* A refused redemption always exits non-zero and always says so. */
    const refused = await register({ replies: refusal("invitation-unusable") });
    eq(refused.code, 1);
    assert(/Nothing was created and the invitation was not spent/.test(refused.out), refused.out);
    assert(!/registered:/.test(refused.out), "it never claims a registration it did not get");
  });

  test("a server message is never echoed back, only our own vocabulary", async () => {
    /* A 4xx from something that is not MetYet can put anything in its body,
       including what was sent to it. Only `refused` is read. */
    const hostile = answers({ status: 409, body: { error: { code: "command_refused",
      refused: "invitation-unusable", message: `your credential ${CREDENTIAL} was rejected`,
      detail: `bearer ${BEARER}` } } });
    const result = await register({ replies: hostile });
    assert(!result.out.includes(CREDENTIAL) && !result.out.includes(BEARER), result.out);
    assert(!/was rejected/.test(result.out), "the server's own words are not repeated: " + result.out);
  });

  test("it decides nothing: no database, no domain, no invitation directory", () => {
    const source = fs.readFileSync(path.join(ROOT, "server", "partner-register.js"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert(!/withDatabase|createInvitationDirectory|createAccountDirectory|createWorldRepository|redeemPartnerInvitation/.test(source),
      "it cannot reach around the route to redeem, link or register anything itself");
    assert(!/registerPartner\(world|saveWorld|linkAccount|claim\(/.test(source), "and it authors nothing");
    assert(!/DATABASE_URL|loadDatabaseConfig|require\("pg"\)/.test(source), "and it opens no database");
    /* Single use is the server's guarantee, and this cannot weaken it: there is
       no retry, no loop, and exactly one request per run. */
    assert(!/for \(|while \(|retry|attempt/i.test(source.replace(/\bawait\b/g, "")),
      "no retry loop — a second attempt is the operator's decision, not the command's");
  });

  test("view proves the binding with the same bearer and no credential at all", async () => {
    const result = await viewAs();
    eq(result.code, 0, result.out);
    eq(result.sent.length, 1);
    eq(result.sent[0].url, "http://127.0.0.1:8080/api/view");
    eq(result.sent[0].method, "GET");
    eq(result.sent[0].body, undefined, "no body, and no credential of any kind");
    eq(result.sent[0].headers.authorization, `Bearer ${BEARER}`);
    assert(/tp_9k2m/.test(result.out) && /Northline Cards/.test(result.out), result.out);
    assert(/cards: 0, deals: 0/.test(result.out), "and what the projection holds, as counts: " + result.out);
  });

  test("view says plainly when the sign-in is nobody yet", async () => {
    const result = await viewAs({ replies: answers({ status: 403,
      body: { error: { code: "account_not_provisioned" } } }) });
    eq(result.code, 1, result.out);
    assert(/not anybody in MetYet yet/.test(result.out), result.out);
    assert(/partner:register/.test(result.out), "and what makes one: " + result.out);
  });

  test("both are operator commands the runbook and package name", () => {
    eq(pkg.scripts["partner:register"], "node server/cli.js register-partner");
    eq(pkg.scripts["api:view"], "node server/cli.js view");
    assert(/register-partner/.test(USAGE) && /view \[--url/.test(USAGE), "the usage lists them");
    assert(/partner:register/.test(runbook) && /api:view/.test(runbook), "and the runbook tells an operator to run them");
    /* The runbook has to send the operator through the checks that make the
       proof a proof — above all the second attempt, because single use is the
       rule most worth seeing refused with your own eyes rather than trusting. */
    const prose = runbook.replace(/\s+/g, " ");
    assert(/partner:register\s+refused — single use/.test(runbook),
      "including running it a second time and watching it be refused");
    assert(/partner:invitations[^\n]*accepted/.test(runbook), "and checking the invitation reads accepted");
    assert(/account:list[^\n]*(active|bound)/.test(runbook), "and that one account is bound to the subject");
    /* And that none of this needs Render: the same server runs locally against
       the hosted database and the hosted provider. */
    assert(/Render is not required/.test(prose), "and that Render is not required for it");
    /* Neither needs a database, and neither asks for one. */
    return Promise.all([
      runCommand(["register-partner", "--url=http://198.51.100.1"], { env: {}, say: () => {} }),
      runCommand(["view", "--url=http://198.51.100.1"], { env: {}, say: () => {} }),
    ]).then(([a, b]) => {
      eq(a, 1, "register-partner ran without DATABASE_URL and refused for its own reason");
      eq(b, 1, "and so did view");
    });
  });
});

run();
