/* ============================================================================
   IS THE IDENTITY PROVIDER SET UP THE WAY THIS SERVER REQUIRES?

     npm run auth:check
     npm run auth:check -- --token-file=<path to a file holding one access token>

   `db:status` answers that question for the database half. This answers it for
   the other half, and for the same reason: an operator configuring a hosted
   environment should be able to find out that it is wrong BEFORE a real person
   tries to sign in and gets a 401 with nothing to go on.

   WITHOUT A TOKEN it reads the configuration (which enforces the https rules and
   refuses a secret key), then fetches the project's published JWKS and reports
   what is there. It FAILS unless at least one published key uses an algorithm
   THE PRODUCTION VERIFIER ACCEPTS — its own allowlist, imported rather than
   restated. "Asymmetric" is not the bar: a project publishing only ES384 or
   PS256 has perfectly real asymmetric keys and every one of its tokens would be
   refused, so certifying that would be the most misleading green available.

   WITH A TOKEN it does what a request does: verifies the signature against that
   JWKS, checks the issuer, the audience and the expiry, and then asks the Auth
   server about the subject exactly as registration does — including whether the
   address is CONFIRMED. That is the whole authentication path, end to end,
   runnable on demand.

   THE TOKEN IS READ FROM A FILE, NOT AN ARGUMENT. An access token on a command
   line ends up in shell history and in `ps` output for every other process on
   the machine. A file can be made unreadable and deleted.

   NOTHING SECRET IS EVER PRINTED: not the token, not the key, not a key's
   private half (the JWKS has none), not a connection string. The address is
   printed, because identifying who the token belongs to is the point.
   ========================================================================== */

const fs = require("fs");
const { loadAuthConfig } = require("./config.js");
const { createTokenVerifier, DEFAULT_ALGORITHMS } = require("./auth/token-verifier.js");
const { createIdentityDirectory } = require("./auth/identity.js");

/* Symmetric, or otherwise never a signature this server would accept. Used only
   to tell an operator WHY a key is unusable; what makes a key usable is the
   allowlist below, never this. */
const SYMMETRIC = /^(HS|none$)/i;

/* A JWKS as the provider publishes it, reduced to what an operator needs to
   see. A public key's own material is not printed even though it is public:
   nothing here is made clearer by a page of base64.

   THE ONLY THING THAT MAKES A KEY "SUPPORTED" IS THE VERIFIER'S OWN ALLOWLIST.
   A readiness check that certified a broader idea of "asymmetric" would pass a
   project publishing only ES384 or PS256 — genuinely asymmetric, and refused by
   every real request, which is the most misleading kind of green there is. So
   `algorithms` comes from token-verifier.js and the comparison is exact.

   Three states, because an operator needs to tell them apart: symmetric (the
   legacy shared secret — migrate the project), asymmetric but not on the
   allowlist (a real key this server does not accept — change the key's
   algorithm, or change the server deliberately), and supported. A key with no
   readable `alg` is never supported: it is described, and it counts for
   nothing. */
const describeKeys = (jwks, { algorithms = DEFAULT_ALGORITHMS } = {}) =>
  (jwks && Array.isArray(jwks.keys) ? jwks.keys : []).map((key) => {
    const alg = typeof key.alg === "string" && key.alg ? key.alg : null;
    const supported = alg !== null && algorithms.includes(alg);
    return {
      kid: typeof key.kid === "string" && key.kid ? key.kid : "(none)",
      alg: alg || (typeof key.kty === "string" ? `(kty ${key.kty}, no alg)` : "(unknown)"),
      kty: key.kty,
      supported,
      /* Only meaningful when it is not supported, and only as an explanation. */
      symmetric: alg === null ? key.kty === "oct" : SYMMETRIC.test(alg),
    };
  });

/* What an operator is told about one key, in the order that matters: is it
   usable, and if not, which kind of not-usable is it? */
const verdict = (key) => {
  if (key.supported) return "supported";
  if (key.symmetric) return "SYMMETRIC — never accepted";
  return "asymmetric, but NOT accepted by this server";
};

async function fetchJwksOnce(url, { timeoutMs = 5000, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, { headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs) });
  if (!response || response.status !== 200) {
    throw new Error(`the JWKS endpoint answered ${response && response.status}`);
  }
  return response.json();
}

/* `deps` is injected by the tests; production passes nothing and uses the real
   verifier, the real identity directory and the platform's fetch. */
async function checkAuth({ env = process.env, say = console.log, tokenFile, deps = {} } = {}) {
  const config = loadAuthConfig(env);
  const host = (() => { try { return new URL(config.jwksUrl).host; } catch (error) { return "(unreadable)"; } })();
  /* The verifier's own list, not a second opinion about it. If a configuration
     ever carries one, this certifies that one — the two cannot disagree. */
  const algorithms = config.algorithms || DEFAULT_ALGORITHMS;

  say(`project:     ${host}`);
  say(`issuer:      ${config.issuer}`);
  say(`audience:    ${config.audience}`);
  say(`algorithms:  ${algorithms.join(", ")} — a key on any other algorithm is refused`);
  say(`jwks:        ${config.jwksUrl}`);
  say(`user:        ${config.userUrl}`);
  say("key:         configured (a publishable key; a secret one would have been refused)");

  /* ---------------------------------------------------------------- JWKS */
  let keys;
  try {
    keys = describeKeys(await (deps.fetchJwks || fetchJwksOnce)(config.jwksUrl), { algorithms });
  } catch (error) {
    say("");
    say(`FAILED:      the JWKS could not be read (${error && error.message})`);
    say("             Check SUPABASE_URL, and that the project is reachable.");
    return 1;
  }

  say("");
  if (!keys.length) {
    say("FAILED:      the key set is empty.");
    say("             The project has no published signing key, so no token can verify.");
    return 1;
  }
  keys.forEach((key) => say(`signing key: ${key.alg.padEnd(18)} ${verdict(key)}  kid ${key.kid}`));
  const usable = keys.filter((key) => key.supported);
  if (!usable.length) {
    const asymmetricButUnsupported = keys.filter((key) => !key.symmetric);
    say("");
    if (asymmetricButUnsupported.length) {
      /* The dangerous case, and the reason this check compares exactly: these
         are real asymmetric keys, and every token signed with one is refused. */
      say("FAILED:      no published key uses an algorithm this server accepts.");
      say(`             It accepts ${algorithms.join(" and ")}, and nothing else. An asymmetric key is`);
      say("             not enough on its own — these are asymmetric, and would still be");
      say(`             refused: ${asymmetricButUnsupported.map((key) => key.alg).join(", ")}.`);
      say("             Give the project a signing key on one of the accepted algorithms.");
    } else {
      say("FAILED:      every published key is symmetric.");
      say("             The project is still signing with the legacy shared secret. Migrate to");
      say("             asymmetric JWT signing keys (see docs/DEPLOYMENT.md, step 2.3); until");
      say("             then every request will be refused, deliberately.");
    }
    return 1;
  }
  say(`ok:          ${usable.length} key${usable.length === 1 ? "" : "s"} on an accepted algorithm (${algorithms.join(", ")})`);

  if (!tokenFile) {
    say("");
    say("The signing side is right. To check a real sign-in end to end, put one access");
    say("token in a file and run: npm run auth:check -- --token-file=<path>");
    return 0;
  }

  /* --------------------------------------------------------------- A TOKEN */
  let token;
  try {
    token = fs.readFileSync(tokenFile, "utf8").trim();
  } catch (error) {
    say("");
    say(`FAILED:      the token file could not be read (${error && error.code})`);
    return 1;
  }
  if (!token) { say(""); say("FAILED:      the token file is empty"); return 1; }

  const verifier = deps.verifier || createTokenVerifier(config);
  let verified;
  try {
    verified = await verifier.verify(token);
  } catch (error) {
    say("");
    say(`FAILED:      the token did not verify (${(error && error.reason) || "invalid"})`);
    say("             That reason is the server's own vocabulary: expired, signature, claims");
    say("             (issuer or audience), algorithm, unknown-key, malformed.");
    return 1;
  }
  say("");
  say(`verified:    subject ${verified.subject}`);
  say(`expires:     ${new Date(verified.expiresAt * 1000).toISOString()}`);

  const identity = deps.identity || createIdentityDirectory(config);
  let answer;
  try {
    answer = await identity.confirmedEmail(token, { subject: verified.subject });
  } catch (error) {
    say("");
    say(`FAILED:      the Auth server could not be asked about this person (${(error && error.reason) || "unavailable"})`);
    say("             Registration fails closed on this, so it would refuse rather than guess.");
    return 1;
  }
  if (!answer.email) {
    say("");
    say("unconfirmed: the provider reports no confirmed address for this sign-in.");
    say("             An invitation cannot be redeemed by it — deliberately. The address is");
    say("             confirmed by signing in through the emailed code or link.");
    return 1;
  }
  say(`confirmed:   ${answer.email}`);
  say("");
  say("That is the whole authentication path: a signature this server trusts, an issuer");
  say("and audience it requires, and an address the provider itself vouches for. An");
  say("invitation to that address can be redeemed by this sign-in.");
  return 0;
}

module.exports = { checkAuth, describeKeys, verdict, fetchJwksOnce };
