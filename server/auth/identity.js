/* ============================================================================
   THE AUTHORITATIVE IDENTITY CHECK — ASK THE PROVIDER, DO NOT READ THE TOKEN

     const identity = createIdentityDirectory({ userUrl, apiKey })
     await identity.confirmedEmail(bearerToken, { subject })
       -> { email }                          the provider confirmed this address
        | { unconfirmed: true }              there is no confirmed address
        (throws IdentityError)               the provider could not be asked

   WHY THIS EXISTS. Registration has to know one thing that a signed token
   cannot tell it: whether the provider CONFIRMED the address, not merely what
   the address says it is. Supabase's documented access-token claims contain no
   `email_verified` at any level. The one that turns up in practice lives inside
   `user_metadata`, and GoTrue lets any signed-in user write arbitrary keys there
   through PUT /user — so believing it would let anyone holding any sign-in claim
   any invited address and register as that Trusted Partner. It is user input
   wearing a provider's envelope.

   So the question goes to the Auth server: GET /auth/v1/user, with the person's
   own already-verified bearer token. What comes back is the row GoTrue owns.
   `email_confirmed_at` is set by GoTrue when an address is actually confirmed —
   by the OTP or the magic link the person had to receive at that address — and
   PUT /user cannot write it; changing the address requires confirming the new
   one first, so `email` and `email_confirmed_at` always describe each other.
   That is the difference that matters: the claim is controlled by the issuer,
   not by the holder.

   THE apikey IS NOT AUTHORITY. Supabase's gateway requires an `apikey` header on
   every request; the PUBLISHABLE (anon) key is what belongs here. It grants
   nothing by itself — the authority in this call is the user's own token — and
   configuration refuses a secret or service-role key outright, because one here
   would be both unnecessary and catastrophic if it leaked.

   NOTHING IS TRUSTED TWICE. The response must be for the same subject the token
   was verified as; a reply about somebody else is a failure, not an answer.

   WHAT FAILURE MEANS. Unreachable, slow, non-200, or a body that does not parse:
   this module throws and registration refuses. It never falls back to the token's
   own claims and never assumes confirmation — an outage makes registration wait,
   it does not make it permissive. No response body, status line, URL or key ever
   reaches the caller or the log.
   ========================================================================== */

const DEFAULT_TIMEOUT_MS = 5000;
/* Addresses are compared, never parsed: the same rule the invitation uses. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class IdentityError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = "IdentityError";
    this.code = "identity.unavailable";
    this.reason = reason;                     // for the server's log, never for the client
  }
}

const normalizeEmail = (v) => (typeof v === "string" ? v.trim().toLowerCase() : "");
/* A confirmation timestamp GoTrue actually set: present, and a real time. */
const confirmedAt = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const when = new Date(value);
  return isNaN(when.getTime()) ? null : when;
};

/* A secret key must never be configured here. Both spellings are refused: the
   current `sb_secret_…` and the legacy service-role JWT, whose payload names
   its own role. */
function isSecretKey(key) {
  if (typeof key !== "string") return false;
  if (/^sb_secret_/.test(key)) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload && payload.role === "service_role";
  } catch (error) { return false; }
}

function createIdentityDirectory({ userUrl, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS, fetchUser } = {}) {
  if (typeof userUrl !== "string" || !/^https?:\/\//.test(userUrl)) {
    throw new TypeError("createIdentityDirectory: userUrl (the provider's user endpoint) is required");
  }
  if (!fetchUser && (typeof apiKey !== "string" || !apiKey)) {
    throw new TypeError("createIdentityDirectory: apiKey (the project's publishable key) is required");
  }
  if (isSecretKey(apiKey)) {
    throw new TypeError("createIdentityDirectory: that is a secret key. Use the project's publishable (anon) key; "
      + "this call's authority is the user's own token, not the key.");
  }

  /* Injected by the tests; production uses the platform's fetch. */
  const ask = fetchUser || (async (token) => fetch(userUrl, {
    headers: { authorization: `Bearer ${token}`, apikey: apiKey, accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  }));

  return {
    async confirmedEmail(token, { subject } = {}) {
      if (typeof token !== "string" || !token) throw new IdentityError("no-token", "no bearer token to ask about");

      let response;
      try {
        response = await ask(token);
      } catch (error) {
        /* A timeout, a DNS failure, a refused connection. The cause is logged
           by the caller as a reason word; nothing of it travels further. */
        throw new IdentityError("unreachable", "the identity provider could not be reached");
      }
      if (!response || typeof response.status !== "number") {
        throw new IdentityError("malformed", "the identity provider answered with something unreadable");
      }
      if (response.status !== 200) {
        throw new IdentityError(`status-${response.status}`, "the identity provider refused the request");
      }

      let user;
      try {
        user = await response.json();
      } catch (error) {
        throw new IdentityError("malformed", "the identity provider's answer could not be read");
      }
      if (!user || typeof user !== "object" || Array.isArray(user)) {
        throw new IdentityError("malformed", "the identity provider's answer was not a user");
      }
      /* An answer about somebody else is not an answer. */
      if (subject !== undefined && user.id !== subject) {
        throw new IdentityError("subject-mismatch", "the identity provider answered about a different person");
      }

      const email = normalizeEmail(user.email);
      if (!email || !LOOKS_LIKE_EMAIL.test(email)) return { unconfirmed: true };
      return confirmedAt(user.email_confirmed_at) ? { email } : { unconfirmed: true };
    },
  };
}

module.exports = { createIdentityDirectory, IdentityError, isSecretKey, DEFAULT_TIMEOUT_MS };
