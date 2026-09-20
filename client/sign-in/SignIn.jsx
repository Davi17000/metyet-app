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

import React, { useCallback, useEffect, useMemo, useState } from "react";
import ProductionApp from "../production-app.jsx";
import { savePartnerProfile, openCollectorInvitation, revokeCollectorInvitation,
  acceptCollectorInvitation, describeCollectorInvitation, addInventoryCopy,
  browseCards, refreshView } from "../commands.js";

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
  /* Phase 5 Batch 3A. Signed in, holding an invitation code, and not yet in
     anybody's network — the one screen in the product where a person agrees to
     be seen. It exists because accepting is a decision, not a side effect of
     arriving. */
  invited: "invited",
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

/* WHY AN INVITATION WOULD NOT WORK, IN AS FEW WORDS AS ARE TRUE (Batch 3A).

   The first of these covers six causes — no such code, mistyped, expired,
   withdrawn, already used by somebody else, already accepted. They are one
   sentence because the server gives one answer, and the server gives one answer
   because telling them apart would let somebody with a list of guesses learn
   which codes are real. So the sentence has to carry a person all the way to
   the remedy without knowing which of the six happened, and the remedy is the
   same for all six: ask for another one. */
const REFUSALS = Object.freeze({
  "invitation-unusable": "That code will not work. It may have been mistyped, expired, been "
    + "withdrawn, or already been used. Ask the shop for a new one.",
  "already-a-partner": "You are signed in as a Trusted Partner. A MetYet sign-in is one or the "
    + "other, so to join a shop as a collector, sign in with a different address.",
  "already-linked": "This sign-in is already connected to a different MetYet account.",
});
const whyRefused = (refused) => REFUSALS[refused]
  || "MetYet could not accept that invitation.";

/* CERTAIN, AND NOT. A refusal and a conflict are answers: the server considered
   it and nothing happened. Losing contact is not — the invitation may have been
   accepted with only the reply lost.

   AND HERE, UNIQUELY IN THIS PRODUCT, THE HONEST ADVICE IS TO TRY AGAIN. Every
   other ambiguous write in MetYet must not be replayed, because a mutation sent
   twice is two mutations. This one is not: the server records who spent a code,
   so the same person submitting it again converges on the same answer instead
   of creating a second anything. That is what `claimed_by` is for. */
export const ACCEPT_AMBIGUOUS = Object.freeze({
  unavailable: "MetYet lost contact, so it cannot tell whether that invitation was accepted. "
    + "Try again — using the same code twice is safe.",
  unexpected: "MetYet got an answer it could not read, so it cannot tell whether that invitation "
    + "was accepted. Try again — using the same code twice is safe.",
});

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* WHO THEY JUST JOINED, READ FROM THE SERVER'S OWN ANSWER (Batch 3A).

   Not from the code, not from anything typed, and not from anything this
   browser decided — the projection's `partners` collection is exactly the shops
   this person now has an accepted Relationship with, so for somebody who just
   accepted their first invitation it holds one. If the server sent no name
   there is no name, and the screen says something true without one. */
const nameOfFirstPartner = (state) => {
  const partners = state && Array.isArray(state.partners) ? state.partners : [];
  const named = partners.find((p) => p && typeof p.name === "string" && p.name.trim());
  return named ? named.name.trim() : null;
};

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
  note: { marginTop: 16, padding: "12px 13px", background: "#F7F8FA", border: "1px solid #DFE4EA",
    borderRadius: 6, color: "#3C4655", fontSize: 13, lineHeight: 1.5 },
  /* The shop, above everything, when MetYet can name it (Batch 3D). */
  invited: { marginBottom: 18 },
  invitedBy: { fontFamily: "'Archivo', system-ui, sans-serif", fontSize: 19, fontWeight: 600,
    letterSpacing: "-0.01em", lineHeight: 1.25, color: "#131922" },
  invitedWhy: { marginTop: 6, color: "#3C4655", fontSize: 13.5, lineHeight: 1.5 },
  link: { marginTop: 14, background: "none", border: 0, padding: 0, color: "#0B5D66",
    fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
};

export default function SignIn({ session, store, onConfigProblem = null, arrivedWith = null }) {
  const [phase, setPhase] = useState(STATES.signedOut);
  const [email, setEmail] = useState("");
  const [codeValue, setCodeValue] = useState("");
  const [problem, setProblem] = useState(null);
  /* The projection, held only so a render can read it; it is whatever the
     store last received and is never edited here. */
  const [projection, setProjection] = useState(null);

  useEffect(() => (store ? store.sub((next) => setProjection(next)) : undefined), [store]);

  /* The one command callback this release has (Phase 5 Batch 1). It is bound
     here because this is where the store is, and it is bound through
     client/commands.js so that no product surface ever names a command. What
     crosses into the application is a function of one argument — not the store,
     and not a way to send anything else. */
  const onSaveProfile = useMemo(() => (store ? savePartnerProfile(store) : null), [store]);
  /* Adding a copy, and looking for the card it is a copy of (Batch 6). Bound
     the same way as everything else: the shell receives functions, never a
     store, so a screen that can add a copy can do that and nothing more. */
  const onAddCopy = useMemo(() => (store ? addInventoryCopy(store) : null), [store]);
  const onBrowseCards = useMemo(() => (store ? browseCards(store) : null), [store]);
  /* Phase 5 Batch 2. Bound the same way and for the same reason: a product
     surface is handed a function, never the store. */
  const onInvite = useMemo(() => (store ? openCollectorInvitation(store) : null), [store]);
  const onRevokeInvite = useMemo(() => (store ? revokeCollectorInvitation(store) : null), [store]);
  const onRefresh = useMemo(() => (store ? refreshView(store) : null), [store]);
  /* Phase 5 Batch 3A. Not a command — there is no command to name, because the
     person calling it has no seat yet. Bound here anyway, for the same reason
     as the rest: the screen gets a function, never the store. */
  const onAccept = useMemo(() => (store ? acceptCollectorInvitation(store) : null), [store]);
  /* Phase 5 Batch 3D. Also not a command, and bound the same way. */
  const onDescribe = useMemo(() => (store ? describeCollectorInvitation(store) : null), [store]);

  /* THE INVITATION CODE LIVES HERE AND NOWHERE ELSE.

     In a React state variable, for as long as this page is open. Not in
     localStorage, not in sessionStorage, not in a cookie, not in the URL — a
     credential that can be read again after the tab closes is a credential
     somebody else can read. A reload loses it and the person types it again,
     which is the right trade.

     IT SURVIVES THE SIGN-IN because sign-in happens in this tab: the code is
     typed, then the email, then the code from the email, and this component
     never unmounts. That is a real constraint on the product, not an accident —
     a magic link that opened a NEW tab would lose it.

     ARRIVING WITH ONE (Phase 5 Batch 3B-1). A Collector who followed an
     invitation link is handed the code by the entry point, which read it out of
     the URL fragment and took it back out of the address bar before anything
     rendered. From here it is the same value a person could have typed, and
     this file still knows nothing about URLs.

     IT IS AN INITIAL VALUE, NOT A BINDING. `useState` reads the prop once. So
     signing out clears the code and NOTHING puts it back — no effect watching
     the prop, no second read. An invitation is something you arrived with, not
     something the page keeps handing you. */
  const [invitation, setInvitation] = useState(arrivedWith || null);
  /* THE NAME OF THE SHOP THAT INVITED THEM (Phase 5 Batch 3D).

     The server's answer, or null. Null means one of two things and the screen
     does not care which: MetYet has not asked yet, or the invitation is not
     live. Either way the entrance says what it said before this existed, and
     the invitation is still spent — or refused — by the one path that does
     that. Nothing here decides whether a code is good.

     It is state, not a prop, and it is dropped whenever the invitation is. */
  const [invitedBy, setInvitedBy] = useState(null);
  const [entering, setEntering] = useState(false);
  const [codeDraft, setCodeDraft] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [joined, setJoined] = useState(null);

  const fail = useCallback((error) => {
    setProblem(say(error && (error.failure || error.code)));
    setPhase(STATES.failed);
  }, []);

  /* ASK WHO INVITED THEM, AS SOON AS THERE IS SOMETHING TO ASK ABOUT.

     Whether they arrived by link, by QR or by typing the code, the moment the
     entrance is holding one it asks the server whose invitation it is. The
     answer changes what is on screen and nothing else: no authority, no
     session, no claim on the invitation.

     IT FAILS SILENTLY, ON PURPOSE. A refusal, an unreachable server, an answer
     this cannot read — all leave `invitedBy` null and the entrance exactly as
     Batch 3A left it. Somebody holding a genuine invitation must not be stopped
     at the door because a nicety could not be fetched. */
  useEffect(() => {
    if (!invitation || !onDescribe) return undefined;
    let current = true;
    (async () => {
      try {
        const answer = await onDescribe(invitation);
        if (current && answer && answer.ok) setInvitedBy(answer.partnerName);
      } catch (error) { /* the entrance carries on unnamed */ }
    })();
    return () => { current = false; };
  }, [invitation, onDescribe]);

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
    setCodeValue("");
    /* SIGNED IN — AND NOW ONE OF TWO THINGS.

       Holding an invitation means this person may well be nobody in MetYet yet,
       and asking "who am I" would answer `not-provisioned`, which is true and
       useless. So the invitation comes first: accepting is what makes them
       somebody, and the reply to it is the projection a load would have
       fetched. */
    if (invitation) { setPhase(STATES.invited); return; }
    /* Otherwise ask the server who this is — the only source of identity. */
    setPhase(STATES.loading);
    try {
      await store.load();
      setPhase(STATES.ready);
    } catch (error) { fail(error); }
  }, [codeValue, email, session, store, fail, invitation]);

  /* ACCEPTING — THE ONE IRREVERSIBLE THING A NEW COLLECTOR DOES.

     Explicit, because it is a disclosure: from here the shop can see the goals
     this person sets and the cards in their binder. Nothing about arriving,
     holding a code, or signing in does this; pressing the button does. */
  const acceptInvitation = useCallback(async () => {
    if (accepting || !invitation || !onAccept) return;
    setAccepting(true);
    setProblem(null);
    let answer;
    try {
      answer = await onAccept(invitation);
    } catch (error) {
      setAccepting(false);
      const failure = (error && (error.failure || error.code)) || "unexpected";
      if (failure === "conflict") {
        setProblem("Something else changed while that was saving, so nothing happened. Try again.");
        return;
      }
      if (failure === "unauthenticated") { setProblem(say(failure)); return; }
      setProblem(ACCEPT_AMBIGUOUS[failure] || ACCEPT_AMBIGUOUS.unexpected);
      return;
    }
    setAccepting(false);
    if (!answer || answer.ok !== true) { setProblem(whyRefused(answer && answer.refused)); return; }
    /* In. The code has done its one job and is dropped — there is nothing left
       it could be used for, and nothing that should still be holding it. */
    setInvitation(null);
    setInvitedBy(null);
    setJoined(nameOfFirstPartner(answer.state));
    setPhase(STATES.ready);
  }, [accepting, invitation, onAccept]);

  /* Declining is not a refusal of anything — nothing was sent, so there is
     nothing to undo. The code is dropped and they are signed in as themselves,
     which for somebody with no account means the entrance says so. */
  const declineInvitation = useCallback(async () => {
    setInvitation(null);
    setInvitedBy(null);
    setProblem(null);
    setPhase(STATES.loading);
    try {
      await store.load();
      setPhase(STATES.ready);
    } catch (error) { fail(error); }
  }, [store, fail]);

  const signOut = useCallback(async () => {
    /* The session clears whether or not revocation succeeds, so this cannot
       leave the screen showing a session that is over. */
    try { await session.signOut(); } catch (error) { /* already cleared */ }
    setProjection(null);
    setCodeValue("");
    setProblem(null);
    /* Nothing about the last person survives, the invitation code least of
       all. */
    setInvitation(null);
    setInvitedBy(null);
    setCodeDraft("");
    setEntering(false);
    setJoined(null);
    setPhase(STATES.signedOut);
  }, [session]);

  /* TWO THINGS THAT WERE ONE BUTTON (Phase 5 Batch 3B-1).

     "Use a different address" and "Sign out" both called `signOut`, and until
     this batch that was harmless: whoever mistyped their email retyped their
     invitation code too.

     IT STOPPED BEING HARMLESS THE MOMENT A LINK COULD CARRY THE CODE. The
     fragment is taken out of the address bar before anything renders — which is
     the point — so a person who arrived by link CANNOT GET IT BACK. Clearing
     their invitation because they mistyped an email address would end their
     journey, with nothing on screen to recover it from.

     So the two acts are separated by what they mean. Signing out ends a session
     and takes everything with it, the invitation included. Correcting an
     address begins nothing and ends nothing: it drops the address and the code
     that was sent to it, and keeps what the person arrived holding. */
  const useDifferentAddress = useCallback(async () => {
    try { await session.signOut(); } catch (error) { /* nothing had begun */ }
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

  /* ENTERING THE CODE — BEFORE SIGNING IN, AND DELIBERATELY SO.

     A person invited to MetYet has a code and no account. Asking them to sign
     in first would send them to an entrance that tells them they are nobody
     here, which is true and unhelpful. So the code is taken first, held in
     memory, and spent after they have proved who they are. */
  if (phase === STATES.signedOut && entering) {
    const takeCode = (event) => {
      if (event && event.preventDefault) event.preventDefault();
      const typed = String(codeDraft).trim();
      if (!typed) { setProblem("Enter the code the shop gave you."); return; }
      setProblem(null);
      setInvitation(typed);
      setCodeDraft("");
      setEntering(false);
    };
    return shell(React.createElement(React.Fragment, null,
      React.createElement("div", { style: S.lead },
        "Enter the invitation code a shop gave you. You will sign in next, and confirm "
        + "before you join."),
      React.createElement("form", { onSubmit: takeCode },
        React.createElement("label", { style: S.label, htmlFor: "metyet-invitation" },
          "Invitation code"),
        React.createElement("input", { id: "metyet-invitation", style: S.input, type: "text",
          autoComplete: "off", spellCheck: false, value: codeDraft,
          onChange: (e) => setCodeDraft(e.target.value) }),
        React.createElement("button", { style: S.button, type: "submit" }, "Continue")),
      React.createElement("button", { style: S.quiet, type: "button",
        onClick: () => { setEntering(false); setProblem(null); } }, "Back to sign in"),
      problemBlock));
  }

  if (phase === STATES.signedOut) {
    return shell(React.createElement(React.Fragment, null,
      /* WHO INVITED ME → WHY AM I HERE → WHAT NOW (Batch 3D).

         That is the order a person actually needs, and until this batch the
         entrance answered only the third question. A shop's name at the top
         turns a stranger's login form into the continuation of a conversation
         that started across a counter a minute ago.

         When MetYet cannot name the shop — no invitation, or one that is not
         live — the screen is the one Batch 3C left, which asks for the address
         and says what happens next in a line. The address field already carries
         `autoComplete="email"`, so on the phone that just scanned it is one
         tap. */
      invitedBy
        ? React.createElement("div", { style: S.invited },
          React.createElement("div", { style: S.invitedBy },
            `${invitedBy} invited you to MetYet.`),
          React.createElement("div", { style: S.invitedWhy },
            "Join their Collector Network so they can start keeping an eye out for you."))
        : null,
      React.createElement("div", { style: S.lead },
        invitedBy
          ? "Enter your email to continue."
          : invitation
            ? "Sign in, then confirm — that's it."
            : "Sign in with the address you were invited at."),
      React.createElement("form", { onSubmit: submitEmail },
        React.createElement("label", { style: S.label, htmlFor: "metyet-email" }, "Email address"),
        React.createElement("input", { id: "metyet-email", style: S.input, type: "email",
          autoComplete: "email", value: email, placeholder: "you@yourshop.com",
          onChange: (e) => setEmail(e.target.value) }),
        React.createElement("button", { style: S.button, type: "submit" }, "Email me a code")),
      /* THE ADDRESS IS NOT THE INVITATION, and this is where the product says
         so out loud. A collector may have been invited at one address and sign
         in at another; the code is what the shop gave them and the sign-in is
         how they prove who they are. Nothing compares the two. */
      invitation
        ? React.createElement("div", { style: S.note },
          "Your invitation is ready. Use any address you can receive mail at — it does not ",
          "have to be the one the shop wrote down.")
        : React.createElement("button", { style: S.link, type: "button",
          onClick: () => { setCodeDraft(""); setProblem(null); setEntering(true); } },
          "I have an invitation code"),
      problemBlock));
  }

  if (phase === STATES.codeSent) {
    return shell(React.createElement(React.Fragment, null,
      React.createElement("div", { style: S.lead },
        "We sent a code to ", React.createElement("strong", null, String(email).trim()), ".",
        /* The shop stays named while they fetch the code, so the reason they
           are doing this does not vanish behind a six-word instruction. */
        invitedBy ? ` You'll join ${invitedBy}'s Collector Network next.` : ""),
      React.createElement("form", { onSubmit: submitCode },
        React.createElement("label", { style: S.label, htmlFor: "metyet-code" }, "Code from the email"),
        React.createElement("input", { id: "metyet-code", style: S.input, type: "text",
          inputMode: "numeric", autoComplete: "one-time-code", value: codeValue,
          onChange: (e) => setCodeValue(e.target.value) }),
        React.createElement("button", { style: S.button, type: "submit" }, "Sign in")),
      React.createElement("button", { style: S.quiet, type: "button", onClick: useDifferentAddress },
        "Use a different address"),
      problemBlock));
  }

  if (phase === STATES.verifying) {
    return shell(React.createElement("div", { style: S.muted }, "Checking that code…"));
  }

  if (phase === STATES.loading) {
    return shell(React.createElement("div", { style: S.muted }, "Signed in. Loading your shop…"));
  }

  /* THE CONFIRM SCREEN — SIGNED IN, HOLDING A CODE, NOT YET IN ANY NETWORK.

     WHAT IT CAN AND CANNOT SAY, AND WHY. It does not name the shop, and that is
     a consequence of a rule worth more than the nicety: the only way the server
     could name it is to look the code up, and a route that describes an
     invitation to anyone who submits a string is a route that tells a guesser
     which strings are real. So MetYet says what accepting MEANS — which is the
     part that actually needs consent — and names the shop the moment it can
     honestly do so, which is in the answer.

     The person is not in the dark: somebody handed them this code. When Batch
     3B delivers invitations by email, the email names the shop, and the
     question disappears rather than being answered by a new endpoint. */
  if (phase === STATES.invited) {
    return shell(React.createElement(React.Fragment, null,
      /* AND NOW IT CAN NAME THE SHOP (Batch 3D). The paragraph above described
         the endpoint this screen did without; it exists, it is read-only, and
         it named the shop before this person typed an address. So the question
         is asked properly — the name is the server's, from canonical state, and
         when there is none the wording is exactly what Batch 3A wrote. */
      React.createElement("div", { style: S.lead },
        invitedBy ? `Join ${invitedBy}'s Collector Network?`
          : "You're signed in. One thing to confirm."),
      React.createElement("div", { style: S.note },
        invitedBy
          ? `Accepting adds you to ${invitedBy}'s Collector Network. From then on they can see the `
          : "Accepting adds you to a shop's Collector Network. From then on they can see the ",
        "goals you set and the cards in your Trade Binder, so they know what to look out ",
        "for. Nothing else about you is shared, and nothing is shared with any other shop."),
      React.createElement("button", { style: S.button, type: "button",
        disabled: accepting, onClick: acceptInvitation },
        accepting ? "Joining…" : "Accept invitation"),
      React.createElement("button", { style: S.quiet, type: "button",
        disabled: accepting, onClick: declineInvitation }, "Not now"),
      problemBlock));
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
     on its own, or fetch. What it can do is render what arrived, call the
     sign-out this component already owns, and — since Phase 5 Batch 1 — call
     one bound callback that saves a Trusted Partner's own profile. */
  return React.createElement(ProductionApp,
    { state: projection, onSignOut: signOut, onSaveProfile, onInvite, onRevokeInvite, onRefresh,
      onAddCopy, onBrowseCards,
      /* Phase 5 Batch 3A. Who they just joined, so the shell can greet them by
         it once. It is read from the server's own reply, it is cleared the
         moment they do anything else, and it grants nothing. */
      joined, onDismissJoined: () => setJoined(null) });
}
