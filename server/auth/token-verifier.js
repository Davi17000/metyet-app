/* ============================================================================
   TOKEN VERIFICATION — A SIGNATURE, OR NOTHING

     const verifier = createTokenVerifier({ jwksUrl, issuer, audience })
     await verifier.verify(token)  ->  { subject, expiresAt }

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
   returns anything from an unverified token. What comes back is the provider's
   stable subject and nothing else — no email, no name, no role. Which MetYet
   actor that subject may act as is the account directory's answer, not the
   token's, so a provider that starts issuing extra claims cannot grant
   authority here.

   WHY NOT THE EMAIL CLAIM. A Supabase access token does carry `email`, and it
   is tempting: registration has to know whether the person redeeming an
   invitation is the person it was addressed to. But the token says only what
   the address IS, never that the provider confirmed it — Supabase's documented
   claim set has no `email_verified` at any level. The `email_verified` that
   appears in practice sits inside `user_metadata`, and GoTrue lets any signed-in
   user write arbitrary keys there with PUT /user. Reading it would therefore let
   anyone with any sign-in claim any invited address.

   So this module returns no address at all, and registration asks the Auth
   server itself instead (server/auth/identity.js). The rule that a claim is
   worth only what its issuer controls is easier to keep when the tempting claim
   is simply not in the return value.

   The verification itself is `jose` (audited, no dependencies of its own),
   loaded with a dynamic import so this CommonJS server runs it on any
   supported Node. Key rotation is handled by re-fetching the JWKS once when a
   token names a key the cache does not have, no more often than the cooldown.

   Tests inject their own verifier (any object with verify()) into the app, and
   this implementation is itself tested against locally minted keys with an
   injected JWKS fetch — no network, no provider account.
   ========================================================================== */

const { isSafeProviderUrl } = require("./identity.js");

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
  if (typeof jwksUrl !== "string" || !jwksUrl) {
    throw new TypeError("createTokenVerifier: jwksUrl (the provider's JWKS endpoint) is required");
  }
  /* The same rule the identity endpoint is held to, and for a stronger reason:
     these are the keys every request is trusted against, so a key set fetched
     over plaintext is every session at once. http for loopback only. */
  if (!isSafeProviderUrl(jwksUrl)) {
    throw new TypeError("createTokenVerifier: the JWKS endpoint must be https "
      + "(http is accepted only for localhost). These are the keys every token is verified against.");
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
      return { subject: sub, expiresAt: exp };
    },
  };
}

module.exports = { createTokenVerifier, TokenError, DEFAULT_ALGORITHMS, DEFAULT_AUDIENCE };
