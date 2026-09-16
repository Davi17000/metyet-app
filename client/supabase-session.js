/* ============================================================================
   A REAL SESSION, BEHIND THE SAME CONTRACT AS THE PLAIN ONE

     const session = createSupabaseSession({ auth })
     await session.requestCode(email)     an email goes out
     await session.verifyCode(email, code)   now signed in
     await session.token()                what api.js asks for, per request
     await session.signOut()

     session.status()     "anonymous" | "present"
     session.subscribe(fn)

   `client/session.js` holds a token something else produced. This holds a real
   Supabase session and knows how to keep it alive — and exposes the SAME four
   members, so `createApiClient({ getToken: session.token })` takes either. A
   test uses the injected one; production uses this; api.js cannot tell.

   WHERE IT LIVES: IN MEMORY, AND THAT IS A DECISION.

   Nothing in a browser makes a bearer token immune to XSS — script running on
   the page can read a closure variable as easily as localStorage, or simply
   call the API as you. So the choice is not "safe versus unsafe"; it is
   PERSISTENCE. In memory, a session cannot be picked up by a later visit or
   another tab, and nothing is left at rest when the tab closes. The cost is
   real and is the whole cost: a page refresh signs you out.

   Storage is an injectable adapter, defaulting to none, so reversing that is
   one argument and a test rather than a rewrite — and so the decision stays
   visible instead of being inherited from a library's default.

   WHY IT REFRESHES. An access token lasts an hour. A Trusted Partner working
   through a trade should not be stopped mid-way, and holding the refresh token
   in memory beside the access token is no worse than holding the access token
   there. So `token()` renews when the provider's own `expires_at` says it is
   nearly due — never by decoding the token, which this never does.

   ONE REFRESH AT A TIME. Several components asking for a token at once must
   produce one request, not several: a refresh token rotates, so the second
   request would be presenting one the provider has just retired.

   FAILING CLOSED. A refresh that fails clears the session. `token()` then
   answers null, and api.js refuses to reach the network at all — so an expired
   session cannot become a request that looks anonymous to the server.
   ========================================================================== */

export const ANONYMOUS = "anonymous";
export const PRESENT = "present";

/* How long before the stated expiry a token is treated as due. Long enough to
   cover a request in flight and a slow network; short enough that a session is
   not renewed on every call. */
const RENEW_WITHIN_SECONDS = 60;

/* No storage. Named rather than absent, so the default is a choice somebody
   made and a test can assert it is still the choice. */
export const NO_STORAGE = Object.freeze({
  load: () => null,
  save: () => {},
  clear: () => {},
});

export function createSupabaseSession({ auth, storage = NO_STORAGE, now = () => Date.now() } = {}) {
  if (!auth || typeof auth.verifyCode !== "function" || typeof auth.refresh !== "function") {
    throw new TypeError("createSupabaseSession: an auth client (client/supabase-auth.js) is required");
  }

  let session = null;          // { accessToken, refreshToken, expiresAt }
  let refreshing = null;       // the one in-flight renewal
  const subscribers = new Set();

  const announce = () => {
    /* The STATUS, never the token. A component rendering "signed in" gets what
       it needs; one that wants the token has to ask, which is the call that
       shows up when you go looking for who holds it. */
    const status = session ? PRESENT : ANONYMOUS;
    subscribers.forEach((fn) => { try { fn(status); } catch (error) { /* a listener's fault */ } });
  };

  const adopt = (next) => {
    session = next;
    try { storage.save(next); } catch (error) { /* a full or blocked store is not a sign-in failure */ }
    announce();
  };

  const forget = () => {
    const had = session !== null;
    session = null;
    try { storage.clear(); } catch (error) { /* same */ }
    if (had) announce();
  };

  /* Restored only if an adapter was supplied; NO_STORAGE answers null. */
  try {
    const restored = storage.load();
    if (restored && typeof restored.accessToken === "string" && restored.accessToken) session = restored;
  } catch (error) { session = null; }

  const due = () => !session || !session.expiresAt
    || session.expiresAt - Math.floor(now() / 1000) <= RENEW_WITHIN_SECONDS;

  async function renew() {
    /* Share one renewal. A refresh token rotates, so a second concurrent
       request would be presenting one the provider has just retired. */
    if (refreshing) return refreshing;
    const token = session && session.refreshToken;
    if (!token) { forget(); return null; }
    refreshing = (async () => {
      try {
        adopt(await auth.refresh(token));
        return session.accessToken;
      } catch (error) {
        /* A refresh that fails is a session that is over. Clearing is what
           makes the next request refuse to leave the browser. */
        forget();
        return null;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  return {
    /* ------------------------------------------------ THE SESSION CONTRACT */

    /* What api.js calls, per request. Renews first if the provider's own
       expiry says it is nearly due; answers null rather than an expired token,
       because api.js refuses to send a request without one. */
    async token() {
      if (!session) return null;
      if (!due()) return session.accessToken;
      return renew();
    },

    status: () => (session ? PRESENT : ANONYMOUS),

    subscribe(fn) {
      if (typeof fn !== "function") throw new TypeError("subscribe: a function is required");
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },

    clear() { forget(); },

    /* ------------------------------------------------ SIGNING IN AND OUT */

    async requestCode(email) { return auth.requestCode(email); },

    async verifyCode(email, code) {
      adopt(await auth.verifyCode(email, code));
      return this.status();
    },

    /* Revoke at the source first, so a refresh token does not outlive this —
       then clear, WHETHER OR NOT that succeeded. Sign-out must not be
       something the network can refuse. */
    async signOut() {
      const token = session && session.accessToken;
      try {
        if (token) await auth.signOut(token);
      } catch (error) { /* deliberately swallowed; see above */ }
      forget();
      return ANONYMOUS;
    },

    /* When the provider says this access token stops working. Unix seconds, as
       the provider stated it — not read out of the token. For a screen that
       wants to warn somebody, and for tests. */
    expiresAt: () => (session ? session.expiresAt : null),
  };
}
