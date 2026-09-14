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
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { checkAuth, describeKeys, verdict } = require("../server/auth-check.js");
const { DEFAULT_ALGORITHMS } = require("../server/auth/token-verifier.js");
const { runCommand, USAGE } = require("../server/cli.js");
const { REQUIRED_SERVER_ENV, loadServerConfig } = require("../server/config.js");

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

run();
