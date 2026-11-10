/* ============================================================================
   THE ONE PLACE THE PRODUCTION CLIENT KEEPS ANYTHING IN THE BROWSER (B1)

     const storage = createTabSessionStorage()
     createSupabaseSession({ auth, storage })

   Founder decision H3: a sign-in survives a page reload within the same tab.
   This is the adapter that makes it so, and it is the only file in the client
   allowed to name browser storage — a test holds every other file to that.

   sessionStorage AND NEVER localStorage. sessionStorage belongs to one tab: a
   reload keeps it, a new tab starts empty, and the browser drops it when the
   tab closes. localStorage would outlive all three, which is not what was
   approved.

   WHAT IS KEPT: the session exactly as client/supabase-session.js saves it —
   an access token, a refresh token, and when the provider said the first one
   expires. Nothing else: no email, no name, no projection, and never an
   invitation code (<SignIn/> holds that in memory and nowhere else).

   WHAT IT IS NOT. It is not a security boundary: script on the page can read
   sessionStorage as easily as memory. And dropping it is not a revocation —
   a tab that closes forgets the session in this browser, but only signing out
   ends the refresh token at the provider.

   NOTHING HERE MAY BREAK SIGNING IN. A browser that blocks storage, a private
   window with a zero quota, damaged JSON: every read answers null and every
   write is skipped, so the worst case is the old behaviour — a reload signs
   you out.
   ========================================================================== */

import { isStoredSession } from "./supabase-session.js";

export const SESSION_KEY = "metyet.session";

const browserSessionStorage = () => {
  try {
    return typeof globalThis !== "undefined" && globalThis.sessionStorage ? globalThis.sessionStorage : null;
  } catch (error) { return null; }       // some browsers throw on the bare property read
};

export function createTabSessionStorage({ storage = browserSessionStorage(), key = SESSION_KEY } = {}) {
  const usable = storage && typeof storage.getItem === "function"
    && typeof storage.setItem === "function" && typeof storage.removeItem === "function";

  const clear = () => {
    if (!usable) return;
    try { storage.removeItem(key); } catch (error) { /* blocked */ }
  };

  return {
    load() {
      if (!usable) return null;
      let raw;
      try { raw = storage.getItem(key); } catch (error) { return null; }
      if (typeof raw !== "string" || !raw) return null;
      try { return JSON.parse(raw); } catch (error) { return { damaged: true }; }   // the session clears it
    },

    save(session) {
      if (!usable) return;
      /* Only the three fields, whatever else the object carries. */
      const kept = session && { accessToken: session.accessToken,
        refreshToken: session.refreshToken === undefined ? null : session.refreshToken,
        expiresAt: session.expiresAt };
      if (!isStoredSession(kept)) { clear(); return; }
      try { storage.setItem(key, JSON.stringify(kept)); } catch (error) { /* full or blocked */ }
    },

    clear,
  };
}
