/* ============================================================================
   TOKEN VERIFICATION — A SIGNATURE, OR NOTHING

     const verifier = createTokenVerifier({ jwksUrl, issuer, audience })
     await verifier.verify(token)  ->  { subject, expiresAt, email? }

   The server's only source of authenticated identity. A bearer token is
   accepted when, and only when:

     - it is a well-formed compact JWS;
     - its signature verifies against a key from the provider's published JWKS,
       fetched over HTTPS and cached;
     - its algorithm is one of the asymmetric algorithms configured here (never
       "none", and never a symmetric algorithm — which is how a public key gets
       turned into a shared secret);
     - the issuer and audience are the configured ones;
     - it carries an expiry and is inside it (with a small clock tolerance).

   Nothing is ever decoded "just to read a claim": there is no code path that
   returns anything from an unverified token. Which MetYet actor a subject may
   act as is the account directory's answer, not the token's, so a provider that
   starts issuing extra claims cannot grant authority here.

   ONE CLAIM BESIDES THE SUBJECT, AND ONLY WHEN THE PROVIDER VOUCHES FOR IT.
   `email` is returned only if the token also says the provider verified that
   address (Supabase puts `email_verified` in `user_metadata`; a top-level claim
   is accepted too). An unverified address is dropped entirely rather than
   passed on with a flag, so nothing downstream can use one by mistake. It is
   still not authority: it is used in exactly one place — checking that the
   person redeeming an invitation is the person it was addressed to (Batch 5) —
   and never to find, choose or create an account.

   The verification itself is `jose` (audited, no dependencies of its own),
   loaded with a dynamic import so this CommonJS server runs it on any
   supported Node. Key rotation is handled by re-fetching the JWKS once when a
   token names a key the cache does not have, no more often than the cooldown.

   Tests inject their own verifier (any object with verify()) into the app, and
   this implementation is itself tested against locally minted keys with an
   injected JWKS fetch — no network, no provider account.
   ========================================================================== */

const DEFAULT_ALGORITHMS = ["ES256", "RS256"];
const DEFAULT_AUDIENCE = "authenticated";
const DEFAULT_CACHE_MS = 10 * 60 * 1000;
const DEFAULT_REFRESH_COOLDOWN_MS = 30 * 1000;
const DEFAULT_TIMEOUT_MS = 5000;

class TokenError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = "TokenError";
    this.code = "token.invalid";
    this.reason = reason;                       // for the server's log, never for the client
  }
}

let josePromise = null;
const jose = () => (josePromise || (josePromise = import("jose")));

const REASONS = {
  ERR_JWT_EXPIRED: "expired",
  ERR_JWT_CLAIM_VALIDATION_FAILED: "claims",
  ERR_JWS_SIGNATURE_VERIFICATION_FAILED: "signature",
  ERR_JOSE_ALG_NOT_ALLOWED: "algorithm",
  ERR_JWKS_NO_MATCHING_KEY: "unknown-key",
  ERR_JWS_INVALID: "malformed",
  ERR_JWT_INVALID: "malformed",
};

/* The address the PROVIDER says it verified, normalized, or nothing. A claim
   the provider has not vouched for is not returned at all: half an answer here
   would eventually be treated as a whole one somewhere else. */
const isTrue = (v) => v === true || v === "true";
function verifiedEmail(payload) {
  const address = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return null;
  const meta = payload.user_metadata && typeof payload.user_metadata === "object" ? payload.user_metadata : {};
  return isTrue(payload.email_verified) || isTrue(meta.email_verified) ? address : null;
}

function createTokenVerifier({
  jwksUrl,
  issuer,
  audience = DEFAULT_AUDIENCE,
  algorithms = DEFAULT_ALGORITHMS,
  clockToleranceSec = 5,
  cacheMs = DEFAULT_CACHE_MS,
  refreshCooldownMs = DEFAULT_REFRESH_COOLDOWN_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchJwks,
} = {}) {
  if (typeof jwksUrl !== "string" || !/^https?:\/\//.test(jwksUrl)) {
    throw new TypeError("createTokenVerifier: jwksUrl (the provider's JWKS endpoint) is required");
  }
  if (typeof issuer !== "string" || !issuer) throw new TypeError("createTokenVerifier: issuer is required");
  if (algorithms.some((a) => /^HS/.test(a) || a === "none")) {
    throw new TypeError("createTokenVerifier: only asymmetric algorithms may verify a bearer token");
  }

  const download = fetchJwks || (async () => {
    const response = await fetch(jwksUrl, { headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`JWKS request failed with status ${response.status}`);
    return response.json();
  });

  let cached = null;            // { keys, fetchedAt }
  let inflight = null;
  let lastRefresh = 0;

  async function keySet({ force = false } = {}) {
    const now = Date.now();
    if (!force && cached && now - cached.fetchedAt < cacheMs) return cached.keys;
    if (!inflight) {
      inflight = (async () => {
        const { createLocalJWKSet } = await jose();
        const jwks = await download();
        if (!jwks || !Array.isArray(jwks.keys)) throw new Error("the JWKS endpoint returned no keys");
        const keys = createLocalJWKSet(jwks);
        cached = { keys, fetchedAt: Date.now() };
        lastRefresh = cached.fetchedAt;
        return keys;
      })().finally(() => { inflight = null; });
    }
    return inflight;
  }

  const fail = (error) => {
    const reason = REASONS[error && error.code] || "invalid";
    const wrapped = new TokenError(reason, `the bearer token was not accepted (${reason})`);
    wrapped.cause = error;
    return wrapped;
  };

  return {
    /* Pre-warm the key cache (readiness checks, startup). */
    async warm() { await keySet(); return true; },

    async verify(token) {
      if (typeof token !== "string" || token.split(".").length !== 3) {
        throw new TokenError("malformed", "the bearer token is not a JWT");
      }
      const { jwtVerify } = await jose();
      const options = { issuer, audience, algorithms, clockTolerance: clockToleranceSec };
      let result;
      try {
        result = await jwtVerify(token, await keySet(), options);
      } catch (error) {
        const rotated = error && error.code === "ERR_JWKS_NO_MATCHING_KEY"
          && Date.now() - lastRefresh >= refreshCooldownMs;
        if (!rotated) throw fail(error);
        try {
          result = await jwtVerify(token, await keySet({ force: true }), options);
        } catch (retryError) { throw fail(retryError); }
      }
      const { sub, exp } = result.payload;
      if (typeof sub !== "string" || !sub) throw new TokenError("no-subject", "the bearer token names no subject");
      if (typeof exp !== "number") throw new TokenError("no-expiry", "the bearer token has no expiry");
      const email = verifiedEmail(result.payload);
      return { subject: sub, expiresAt: exp, ...(email ? { email } : {}) };
    },
  };
}

module.exports = { createTokenVerifier, TokenError, verifiedEmail, DEFAULT_ALGORITHMS, DEFAULT_AUDIENCE };
