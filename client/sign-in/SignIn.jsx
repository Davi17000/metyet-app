/* ============================================================================
   THE PRODUCTION ENTRANCE — SEVEN STATES, AND NOTHING THE SERVER DID NOT SAY

     <SignIn session={...} store={...} />

   The smallest honest way into MetYet production: type an address, receive a
   code, type it, and see what the server says you are. That is the whole of it,
   and everything it shows came back in a response.

   THE SEVEN STATES, which are the whole component:

     signedOut    an address to type
     codeSent     a code to type; the address is shown so a typo is visible
     verifying    the code is with the provider
     loading      signed in, asking the server who this is
     ready        the application, handed the server's projection
     failed       something went wrong, said in a way a person can act on
     (signing out returns to signedOut)

   THE LAST STATE IS NOW A DOOR, NOT A DESTINATION. Batch 3 rendered the
   projection's collection counts here to prove the round trip; Batch 4 hands
   the projection to <ProductionApp/>, which reads the seat and renders the
   application for it. This file's job stops at "signed in, and here is what
   arrived" — it does not know what a Trusted Partner is.

   WHAT IT DOES NOT DO, AND WHY EACH MATTERS.

   It does not decide who you are. There is no `partnerId`, no seat, no subject
   anywhere in this file. After `verifyCode` it asks the API, and what comes
   back is the answer — read by client/actor.js the way the domain writes it
   (`{ seat, partnerId }`), never invented.

   It does not hold canonical state. `store.get()` is the server's projection
   for one seat. There is no second world here, no seed, no local mutation.

   It does not show a credential. Not the token, not the code after it is
   submitted, not a provider message. Failures are translated into sentences of
   ours, because a provider's 400 can quote back the code that was sent to it.

   It does not let a failed sign-in become an anonymous request. `store.load()`
   is reached only from `verified`, and the session answers null when it has
   nothing — at which point api.js refuses to leave the browser at all.
   ========================================================================== */

import React, { useCallback, useEffect, useState } from "react";
import ProductionApp from "../production-app.jsx";

/* Identity is read in exactly one place — client/actor.js — and re-exported
   here because this module's own tests have always asked it that question.
   Two copies of "who did the server say you are" is two answers waiting to
   disagree, which is the whole reason it moved. */
export { describeActor, SEATS } from "../actor.js";

export const STATES = Object.freeze({
  signedOut: "signedOut",
  codeSent: "codeSent",
  verifying: "verifying",
  loading: "loading",
  ready: "ready",
  failed: "failed",
});

/* A person can act on each of these. None of them is the provider's words. */
const MESSAGES = Object.freeze({
  "rate-limited": "Too many sign-in emails too quickly. Wait a minute and try again.",
  rejected: "That code did not work. It may have expired, or already been used — each one works once.",
  disabled: "Sign-in is not available for this project right now.",
  unavailable: "MetYet could not be reached. Check your connection and try again.",
  unexpected: "Something went wrong that we did not expect. Try again.",
  unauthenticated: "Your session has ended. Sign in again.",
  "not-provisioned": "You are signed in, but this address is not a MetYet account yet. "
    + "An invitation is what creates one — check with whoever invited you.",
});
const say = (failure) => MESSAGES[failure] || MESSAGES.unexpected;

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const S = {
  page: { minHeight: "100vh", background: "#F1F3F6", color: "#131922", display: "flex",
    alignItems: "center", justifyContent: "center", padding: "24px",
    fontFamily: "'Public Sans', system-ui, sans-serif", fontSize: 14, lineHeight: 1.45 },
  card: { width: "100%", maxWidth: 420, background: "#FFFFFF", border: "1px solid #DFE4EA",
    borderRadius: 10, padding: "28px 24px" },
  brand: { fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 4 },
  lead: { color: "#616B7A", marginBottom: 20 },
  label: { display: "block", fontSize: 12, color: "#616B7A", marginBottom: 6 },
  input: { width: "100%", padding: "10px 12px", border: "1px solid #DFE4EA", borderRadius: 6,
    fontSize: 15, fontFamily: "inherit", color: "#131922", background: "#FFFFFF" },
  button: { width: "100%", marginTop: 14, padding: "11px 12px", border: "1px solid #0B5D66",
    borderRadius: 6, background: "#0B5D66", color: "#FFFFFF", fontSize: 14, fontWeight: 600,
    fontFamily: "inherit", cursor: "pointer" },
  quiet: { width: "100%", marginTop: 10, padding: "9px 12px", border: "1px solid #DFE4EA",
    borderRadius: 6, background: "#FFFFFF", color: "#616B7A", fontSize: 13,
    fontFamily: "inherit", cursor: "pointer" },
  problem: { marginTop: 16, padding: "10px 12px", background: "#FBEDEC", border: "1px solid #EBD9B4",
    borderRadius: 6, color: "#98302C" },
  muted: { color: "#616B7A", fontSize: 13 },
};

export default function SignIn({ session, store, onConfigProblem = null }) {
  const [phase, setPhase] = useState(STATES.signedOut);
  const [email, setEmail] = useState("");
  const [codeValue, setCodeValue] = useState("");
  const [problem, setProblem] = useState(null);
  /* The projection, held only so a render can read it; it is whatever the
     store last received and is never edited here. */
  const [projection, setProjection] = useState(null);

  useEffect(() => (store ? store.sub((next) => setProjection(next)) : undefined), [store]);

  const fail = useCallback((error) => {
    setProblem(say(error && (error.failure || error.code)));
    setPhase(STATES.failed);
  }, []);

  const submitEmail = useCallback(async (event) => {
    if (event && event.preventDefault) event.preventDefault();
    const address = String(email).trim();
    if (!LOOKS_LIKE_EMAIL.test(address)) {
      setProblem("That does not look like an email address.");
      return;
    }
    setProblem(null);
    try {
      await session.requestCode(address);
      setCodeValue("");
      setPhase(STATES.codeSent);
    } catch (error) { fail(error); }
  }, [email, session, fail]);

  const submitCode = useCallback(async (event) => {
    if (event && event.preventDefault) event.preventDefault();
    const typed = String(codeValue).trim();
    if (!typed) { setProblem("Enter the code from the email."); return; }
    setProblem(null);
    setPhase(STATES.verifying);
    try {
      await session.verifyCode(String(email).trim(), typed);
    } catch (error) {
      /* The code never survives a failure: a retype is a fresh one. */
      setCodeValue("");
      setPhase(STATES.codeSent);
      setProblem(say(error && error.failure));
      return;
    }
    /* Signed in. Now ask the server who that is — the only source of identity. */
    setCodeValue("");
    setPhase(STATES.loading);
    try {
      await store.load();
      setPhase(STATES.ready);
    } catch (error) { fail(error); }
  }, [codeValue, email, session, store, fail]);

  const signOut = useCallback(async () => {
    /* The session clears whether or not revocation succeeds, so this cannot
       leave the screen showing a session that is over. */
    try { await session.signOut(); } catch (error) { /* already cleared */ }
    setProjection(null);
    setCodeValue("");
    setProblem(null);
    setPhase(STATES.signedOut);
  }, [session]);

  const retry = useCallback(async () => {
    setProblem(null);
    if (session.status() !== "present") { setPhase(STATES.signedOut); return; }
    setPhase(STATES.loading);
    try {
      await store.load();
      setPhase(STATES.ready);
    } catch (error) { fail(error); }
  }, [session, store, fail]);

  if (onConfigProblem) return onConfigProblem;

  const shell = (children) => React.createElement("div", { style: S.page },
    React.createElement("div", { style: S.card },
      React.createElement("div", { style: S.brand }, "MetYet"),
      children));

  const problemBlock = problem ? React.createElement("div", { style: S.problem, role: "alert" }, problem) : null;

  if (phase === STATES.signedOut) {
    return shell(React.createElement(React.Fragment, null,
      React.createElement("div", { style: S.lead }, "Sign in with the address you were invited at."),
      React.createElement("form", { onSubmit: submitEmail },
        React.createElement("label", { style: S.label, htmlFor: "metyet-email" }, "Email address"),
        React.createElement("input", { id: "metyet-email", style: S.input, type: "email",
          autoComplete: "email", value: email, placeholder: "you@yourshop.com",
          onChange: (e) => setEmail(e.target.value) }),
        React.createElement("button", { style: S.button, type: "submit" }, "Email me a code")),
      problemBlock));
  }

  if (phase === STATES.codeSent) {
    return shell(React.createElement(React.Fragment, null,
      React.createElement("div", { style: S.lead },
        "We sent a code to ", React.createElement("strong", null, String(email).trim()), "."),
      React.createElement("form", { onSubmit: submitCode },
        React.createElement("label", { style: S.label, htmlFor: "metyet-code" }, "Code from the email"),
        React.createElement("input", { id: "metyet-code", style: S.input, type: "text",
          inputMode: "numeric", autoComplete: "one-time-code", value: codeValue,
          onChange: (e) => setCodeValue(e.target.value) }),
        React.createElement("button", { style: S.button, type: "submit" }, "Sign in")),
      React.createElement("button", { style: S.quiet, type: "button", onClick: signOut },
        "Use a different address"),
      problemBlock));
  }

  if (phase === STATES.verifying) {
    return shell(React.createElement("div", { style: S.muted }, "Checking that code…"));
  }

  if (phase === STATES.loading) {
    return shell(React.createElement("div", { style: S.muted }, "Signed in. Loading your shop…"));
  }

  if (phase === STATES.failed) {
    return shell(React.createElement(React.Fragment, null,
      problemBlock,
      React.createElement("button", { style: S.button, type: "button", onClick: retry }, "Try again"),
      React.createElement("button", { style: S.quiet, type: "button", onClick: signOut }, "Sign out")));
  }

  /* ready — and from here it is the product, not the entrance.

     Batch 3 rendered the projection's collection counts here, which proved the
     round trip and was never meant to be looked at twice. The application is
     handed the projection and nothing else: no session, no store, no api
     client, no way to ask for more. It cannot sign anyone in, sign anyone out
     on its own, or fetch. What it can do is render what arrived, and call the
     sign-out this component already owns. */
  return React.createElement(ProductionApp, { state: projection, onSignOut: signOut });
}
