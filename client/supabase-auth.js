/* ============================================================================
   THE THREE CALLS A BROWSER MAKES TO SUPABASE, AND NOTHING ELSE

     const auth = createSupabaseAuth({ supabaseUrl, publishableKey })
     await auth.requestCode(email)            an email goes out
     await auth.verifyCode(email, code)       -> a session
     await auth.refresh(refreshToken)         -> a newer session
     await auth.signOut(accessToken)          the refresh token dies at source

   WHY NOT @supabase/supabase-js. This is not a second authentication system —
   Supabase remains the only authority, and these are its own documented REST
   endpoints. Two of them are the exact calls `server/auth-signin.js` already
   makes, proven against the real project. The library would bring a default
   that matters more than the code it saves: it persists the session to
   localStorage and refreshes on a timer, so to decide storage for ourselves we
   would have to replace its adapter anyway — the same surface, plus a
   dependency, in a client that has none beyond React.

   THIS MODULE HOLDS NOTHING. No token, no session, no timer, no state at all.
   It turns arguments into requests and responses into plain objects. Where a
   session lives and when it refreshes is supabase-session.js, one decision in
   one place.

   NO JWT IS EVER DECODED. The expiry is not read out of the token: GoTrue
   returns `expires_at` and `expires_in` in the body, beside it. That is how a
   session can refresh before it lapses without the browser ever parsing a
   credential or deciding for itself what a token says.

   NOTHING IS LOGGED. Not the code, not the tokens, not the email. A failure
   carries a status and a word of our own — never the provider's body, which on
   a bad request can quote back what was sent to it.
   ========================================================================== */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/* A one-time code and a session may not cross a plaintext connection to
   anywhere but this machine. The same rule the server holds its provider
   endpoints to; stated here because this file is the browser's own boundary. */
export function isSafeProviderUrl(value) {
  if (typeof value !== "string" || !value) return false;
  let url;
  try { url = new URL(value); } catch (error) { return false; }
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOOPBACK.has(url.hostname);
}

export const AUTH_FAILURES = Object.freeze({
  rejected: "rejected",         // the code is wrong, used, or expired
  rateLimited: "rate-limited",  // too many emails, too quickly
  disabled: "disabled",         // email sign-in is off for this project
  unavailable: "unavailable",   // unreachable, timed out, or 5xx
  unexpected: "unexpected",     // a shape this client does not understand
});

export class AuthError extends Error {
  constructor(failure, { status = null } = {}) {
    super(failure);
    this.name = "AuthError";
    this.failure = failure;
    this.status = status;
  }
}

const DEFAULT_TIMEOUT_MS = 15000;

const failureFor = (status) => {
  if (status === 400 || status === 401 || status === 403) return AUTH_FAILURES.rejected;
  if (status === 422) return AUTH_FAILURES.disabled;
  if (status === 429) return AUTH_FAILURES.rateLimited;
  if (status >= 500) return AUTH_FAILURES.unavailable;
  return AUTH_FAILURES.unexpected;
};

/* What a session IS, as far as this client is concerned: an opaque access
   token, an opaque refresh token, and when the provider says the first stops
   working. Nothing is derived from any of them. */
const sessionFrom = (body) => {
  const accessToken = body && typeof body.access_token === "string" ? body.access_token : "";
  if (!accessToken) throw new AuthError(AUTH_FAILURES.unexpected);
  /* `expires_at` is unix seconds. If the provider sends only `expires_in`, it
     is computed here from this clock; if it sends neither, the session is
     treated as already due for refresh rather than as lasting for ever. */
  const expiresAt = typeof body.expires_at === "number" ? body.expires_at
    : (typeof body.expires_in === "number" ? Math.floor(Date.now() / 1000) + body.expires_in : 0);
  return {
    accessToken,
    refreshToken: typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : null,
    expiresAt,
  };
};

export function createSupabaseAuth({ supabaseUrl, publishableKey, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = {}) {
  const base = `${String(supabaseUrl || "").replace(/\/+$/, "")}/auth/v1`;
  if (!isSafeProviderUrl(base)) {
    throw new TypeError("createSupabaseAuth: the project URL must be https (http only for this machine). "
      + "These requests carry a one-time code and return a session.");
  }
  if (typeof publishableKey !== "string" || !publishableKey) {
    throw new TypeError("createSupabaseAuth: the project's publishable key is required — it is the apikey "
      + "header the provider's gateway wants, and it grants nothing by itself.");
  }
  /* A secret or service-role key in a browser bundle is the whole database in
     everyone's hands. Refused here as it is refused on the server. */
  if (/^sb_secret_/.test(publishableKey)) {
    throw new TypeError("createSupabaseAuth: that is a secret key, and this runs in a browser. "
      + "Use the project's publishable (anon) key.");
  }

  async function post(path, body, { bearer } = {}) {
    let response;
    try {
      response = await (fetchImpl || fetch)(`${base}${path}`, {
        method: "POST",
        headers: {
          apikey: publishableKey,
          /* The publishable key unless a real session is the point of the call
             (sign-out), which is the only one that acts as a person. */
          authorization: `Bearer ${bearer || publishableKey}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new AuthError(AUTH_FAILURES.unavailable);
    }
    if (!response || typeof response.status !== "number") throw new AuthError(AUTH_FAILURES.unexpected);
    if (response.status < 200 || response.status >= 300) {
      /* The status, and nothing out of the body: a 400 from GoTrue can quote
         back what was sent, which here is a one-time code. */
      throw new AuthError(failureFor(response.status), { status: response.status });
    }
    try { return await response.json(); } catch (error) { return null; }
  }

  return {
    /* The address and nothing else — no `create_user`, so the project's own
       signup policy decides whether a first-time invited address may be
       created, exactly as the operator command leaves it. */
    async requestCode(email) {
      if (typeof email !== "string" || !email.trim()) throw new TypeError("requestCode: an address is required");
      await post("/otp", { email: email.trim().toLowerCase() });
      return true;
    },

    /* type "email" is the one that checks BOTH the confirmation and the
       recovery token, which is what makes a code from either template work. */
    async verifyCode(email, code) {
      if (typeof email !== "string" || !email.trim()) throw new TypeError("verifyCode: an address is required");
      if (typeof code !== "string" || !code.trim()) throw new TypeError("verifyCode: a code is required");
      return sessionFrom(await post("/verify", { type: "email", email: email.trim().toLowerCase(), token: code.trim() }));
    },

    async refresh(refreshToken) {
      if (typeof refreshToken !== "string" || !refreshToken) {
        throw new AuthError(AUTH_FAILURES.rejected);
      }
      return sessionFrom(await post("/token?grant_type=refresh_token", { refresh_token: refreshToken }));
    },

    /* Revoking at the source, so a refresh token does not outlive a sign-out.
       Acting as the person, which is the one call here that does. */
    async signOut(accessToken) {
      if (typeof accessToken !== "string" || !accessToken) return false;
      await post("/logout", {}, { bearer: accessToken });
      return true;
    },
  };
}
