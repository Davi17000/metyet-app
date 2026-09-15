/* ============================================================================
   WHERE THE BEARER LIVES, AND NOTHING ELSE

     const session = createSession()
     session.set(token)          a sign-in produced this
     session.clear()             signed out, or the server stopped taking it
     await session.token()       what the API client asks for, per request
     session.status()            "anonymous" | "present"
     session.subscribe(fn)       tell me when that changes

   WHAT THIS DOES NOT DO, AND WHY EACH ONE IS DELIBERATE.

   IT DOES NOT SIGN ANYBODY IN. There is no sign-in screen yet, and the choice
   between the provider's client library and two fetch calls of our own is a
   real dependency decision that has not been made. So this holds a token that
   something else produced, and the sign-in batch decides what that something
   is without this module having to change.

   IT DOES NOT CHOOSE STORAGE. In memory for the life of the tab, because that
   is the only option that is safe by default: a token in localStorage is
   readable by anything that runs on the page. Keeping somebody signed in
   across a refresh is worth having and is a decision with a cost, so it is
   made deliberately in the batch that adds refresh — not inherited from a line
   written here. Nothing in this file touches localStorage, sessionStorage or a
   cookie; a test asserts that.

   IT DOES NOT DECODE THE TOKEN. Not to find a subject, not to find an email,
   not to check the expiry. The client authors no identity: who you are is what
   the server says when it answers, and a client that read the token's claims
   would be deciding for itself who it is talking about — which is the exact
   mistake that `user_metadata.email_verified` was on the server side. The token
   is an opaque string here, and it is treated as one.

   IT DOES NOT KNOW WHO YOU ARE. There is no `subject`, no `seat`, no `actor`,
   no `partnerId`. Ask the server: that is what `/api/view` is.
   ========================================================================== */

export const ANONYMOUS = "anonymous";
export const PRESENT = "present";

export function createSession({ initialToken = null } = {}) {
  /* A closure, not a module-level variable: two sessions in one process (a
     test, a future second tab-like context) must not share a token. */
  let token = typeof initialToken === "string" && initialToken ? initialToken : null;
  const subscribers = new Set();

  const announce = () => {
    /* The STATUS is published, never the token. A subscriber wanting to render
       "signed in" gets what it needs; one wanting the token has to ask, which
       is the call that shows up when you go looking for who holds it. */
    const status = token ? PRESENT : ANONYMOUS;
    subscribers.forEach((fn) => { try { fn(status); } catch (error) { /* a listener's fault, not ours */ } });
  };

  return {
    set(next) {
      if (typeof next !== "string" || !next) {
        throw new TypeError("session.set: a token is a non-empty string. Use clear() to sign out.");
      }
      const changed = next !== token;
      token = next;
      if (changed) announce();
    },

    clear() {
      const changed = token !== null;
      token = null;
      if (changed) announce();
    },

    /* Async because a later sign-in may have to refresh before answering, and
       every caller already awaits it. The shape does not change then. */
    async token() { return token; },

    status() { return token ? PRESENT : ANONYMOUS; },

    subscribe(fn) {
      if (typeof fn !== "function") throw new TypeError("session.subscribe: a function is required");
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}
