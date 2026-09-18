/* ============================================================================
   THE PRODUCTION CLIENT'S ONE ENTRY POINT

   Built by app.build.mjs, served by the API server at app.metyet.io. It wires
   the four pieces the last two batches built and adds nothing of its own:

     production config  ->  supabase auth  ->  session
                                                 |
                                            api client  ->  production store
                                                 |
                                              <SignIn />

   If the build was configured wrongly — a missing value, a plaintext address, a
   secret key — that is discovered HERE, at boot, and shown as one clear message
   rather than as a different failure on each screen.

   AND IT IS THE ONE PLACE THAT READS THE ADDRESS BAR (Phase 5 Batch 3B-1).

   A Collector invited by link arrives at `/join#<credential>`. The credential is
   in the FRAGMENT, which browsers never put in an HTTP request: it reaches no
   server log, no `Referer`, and nothing rendered anywhere. It is read here,
   once, removed from the address bar before anything renders, and handed to
   <SignIn/> as an ordinary value — indistinguishable, from there on, from a code
   somebody typed.

   WHY HERE AND NOT IN <SignIn/>. That component holds the code in memory and is
   held by a test to knowing nothing about URLs. Reading the fragment at the
   boundary keeps that true: one file in the product reads `location`, and it is
   the file that already did (for the API origin). A screen that learned to read
   the address bar would be a screen that could be told anything by a link.

   WHAT IS NOT READ, ON PURPOSE. Not the query string — it IS sent to servers,
   and lands in logs and `Referer`. Not the path. And nothing about WHO invited
   you: a link that could name the shop could name the wrong shop, and MetYet
   would be repeating an attacker's claim to somebody about to accept it. The
   shop is named by the email that carried the link, and by the server's own
   answer once acceptance succeeds.
   ========================================================================== */
import React from "react";
import { createRoot } from "react-dom/client";
import { readProductionConfig, ProductionConfigError } from "../client/production-config.js";
import { createSupabaseAuth } from "../client/supabase-auth.js";
import { createSupabaseSession } from "../client/supabase-session.js";
import { createApiClient } from "../client/api.js";
import { createProductionStore } from "../client/production-store.js";
import SignIn from "../client/sign-in/SignIn.jsx";

const problemScreen = (lines) => React.createElement("div",
  { style: { minHeight: "100vh", background: "#F1F3F6", color: "#98302C", padding: 32,
    fontFamily: "'Public Sans', system-ui, sans-serif", fontSize: 14 } },
  React.createElement("div", { style: { fontWeight: 600, marginBottom: 8 } },
    "MetYet cannot start"),
  lines.map((line, i) => React.createElement("div", { key: i }, line)));

/* WHAT COUNTS AS A CREDENTIAL. The runtime mints 32 symbols from an alphabet
   with no look-alikes (domain/metyet-runtime.js). This does not re-state that
   alphabet — coupling the front door to the mint would break both the day one
   changes — but it does refuse anything that is obviously not a credential, so
   that a fragment carrying a word, a URL or a fragment of markup becomes
   nothing at all rather than becoming "an invitation" the person is then asked
   about. It decides nothing else: whether the code is real is the server's
   answer, and this cannot tell. */
const LOOKS_LIKE_CREDENTIAL = /^[0-9a-z]{16,64}$/;

/* Read it once, then take it out of the address bar.

   `replaceState` rewrites the entry the browser is on, so the credential stops
   being visible, stops being copied when somebody copies the URL, and stops
   being restored by a reload. What it cannot reach is the record the mail
   client or the operating system kept of the link that was clicked — which is
   true of any secret sent in a link, and is why this one works once and expires.

   Everything is guarded: a page can be opened where `history` is missing or
   `replaceState` throws, and a front door that dies there is worse than one
   that simply carries no invitation. */
export function takeInvitationFromUrl(loc, hist) {
  let raw = "";
  try {
    raw = loc && typeof loc.hash === "string" ? loc.hash : "";
  } catch (error) { return null; }
  const candidate = decodeURIComponent(String(raw).replace(/^#/, "")).trim().toLowerCase();

  /* The fragment goes whether or not it held a credential: something unreadable
     in the address bar is still something in the address bar. */
  if (raw) {
    try {
      if (hist && typeof hist.replaceState === "function") {
        const rest = `${(loc && loc.pathname) || "/"}${(loc && loc.search) || ""}`;
        hist.replaceState(null, "", rest || "/");
      }
    } catch (error) { /* an address bar we cannot rewrite is not a reason to stop */ }
  }

  return LOOKS_LIKE_CREDENTIAL.test(candidate) ? candidate : null;
}

function mount() {
  const root = createRoot(document.getElementById("root"));

  let config;
  try {
    config = readProductionConfig();
  } catch (error) {
    /* The NAMES of what is wrong, never the values. */
    root.render(problemScreen(error instanceof ProductionConfigError ? error.problems : ["configuration could not be read"]));
    return;
  }

  const auth = createSupabaseAuth({ supabaseUrl: config.supabaseUrl, publishableKey: config.publishableKey });
  const session = createSupabaseSession({ auth });
  const api = createApiClient({ baseUrl: config.apiUrl, getToken: () => session.token() });
  const store = createProductionStore({ api });

  /* Before the first paint, so the credential is never on screen in the address
     bar, and never survives into a second render. */
  const arrivedWith = takeInvitationFromUrl(
    typeof location === "object" ? location : null,
    typeof history === "object" ? history : null);

  root.render(React.createElement(SignIn, { session, store, arrivedWith }));
}

/* Imported without a document — by a test asking what the front door does with a
   URL — this file defines its functions and mounts nothing. */
if (typeof document !== "undefined" && document && typeof document.getElementById === "function") {
  mount();
}
