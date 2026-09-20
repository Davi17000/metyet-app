/* ============================================================================
   SEAT ROUTING — THE ONE PLACE THE ANSWER "WHICH PRODUCT" IS READ

     <ProductionApp state={projection} onSignOut={fn} />

   Between a successful sign-in and a product surface there is exactly one
   decision: which seat did the server say this is. This file is that decision
   and nothing else, which is why it is short enough to read in one sitting and
   why every path out of it is visible at once.

   THE ANSWER COMES FROM ONE PLACE. `state.actor`, through `describeActor`.
   Not from the email that was typed — an address is how a code was delivered,
   not who somebody is. Not from the URL, not from a build value, not from
   anything stored. There is no parameter, prop or configuration on this
   component that could carry an identity in from the side.

   EVERY UNKNOWN FAILS CLOSED. A missing actor, a seat this build does not
   recognise, a seat with no id under its own field — each renders a refusal
   with a way to sign out, and no product surface at all. The default branch
   is the refusal, so a seat added to the domain later cannot silently fall
   into somebody else's application by being forgotten here.

   TWO SEATS, TWO APPLICATIONS, AND NEITHER CAN REACH THE OTHER'S. A Trusted
   Partner gets the Trusted Partner workspace; a Collector gets the Collector
   app. They are different products for different people, they are chosen here
   and nowhere else.

   WHAT EACH IS HANDED. The projection, sign-out, and — for the Trusted Partner
   only — `onSaveProfile`, the narrow callback Phase 5 Batch 1 introduced. It is
   a function of one argument, built outside every product surface
   (client/commands.js) and passed straight through: this file does not create
   it, does not name the command behind it, and does not call it. A Collector is
   not handed it, because editing a Trusted Partner's shop is not a thing a
   Collector does. Neither seat receives a session, a store, or any way to ask
   for more than it was given.
   ========================================================================== */

import React from "react";
import { describeActor, isIdentified } from "./actor.js";
import TrustedPartnerShell from "./tp/TrustedPartnerShell.jsx";
import CollectorShell from "./collector/CollectorShell.jsx";

const S = {
  page: { minHeight: "100vh", background: "#F1F3F6", color: "#131922", display: "flex",
    alignItems: "center", justifyContent: "center", padding: "24px",
    fontFamily: "'Public Sans', system-ui, sans-serif", fontSize: 14, lineHeight: 1.45 },
  card: { width: "100%", maxWidth: 460, background: "#FFFFFF", border: "1px solid #DFE4EA",
    borderRadius: 10, padding: "28px 24px" },
  brand: { fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 10 },
  lead: { color: "#616B7A", marginBottom: 18 },
  quiet: { width: "100%", padding: "9px 12px", border: "1px solid #DFE4EA", borderRadius: 6,
    background: "#FFFFFF", color: "#616B7A", fontSize: 13, fontFamily: "inherit", cursor: "pointer" },
};

/* One frame for both non-product answers, so neither can accidentally acquire a
   product surface by growing its own markup. */
function Plain({ lead, onSignOut }) {
  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.brand}>MetYet</div>
        <div style={S.lead}>{lead}</div>
        <button style={S.quiet} type="button" onClick={onSignOut}>Sign out</button>
      </div>
    </div>
  );
}

export default function ProductionApp({ state, onSignOut, onSaveProfile = null,
  onAddCopy = null, onBrowseCards = null,
  onAddGoal = null, onSetPriority = null, onRemoveGoal = null,
  onInvite = null, onRevokeInvite = null, onRefresh = null,
  joined = null, onDismissJoined = null }) {
  const who = describeActor(state);

  /* Not identified: the server did not say who this is, or said something this
     build cannot read. Either way nothing is rendered that assumes an answer. */
  if (!isIdentified(who)) {
    return (
      <Plain onSignOut={onSignOut}
        lead={"You're signed in, but MetYet couldn't tell which account this is. "
          + "Nothing has been changed. Sign out and try again, and if it keeps happening, "
          + "tell whoever invited you."} />
    );
  }

  if (who.seat === "tp") {
    return <TrustedPartnerShell state={state} onSignOut={onSignOut} onSaveProfile={onSaveProfile}
      onAddCopy={onAddCopy} onBrowseCards={onBrowseCards}
      onInvite={onInvite} onRevokeInvite={onRevokeInvite} onRefresh={onRefresh} />;
  }

  if (who.seat === "collector") {
    return <CollectorShell state={state} onSignOut={onSignOut}
      onAddGoal={onAddGoal} onSetPriority={onSetPriority} onRemoveGoal={onRemoveGoal}
      onBrowseCards={onBrowseCards}
      joined={joined} onDismissJoined={onDismissJoined} />;
  }

  /* A seat the domain has and this build does not. The refusal is the default
     branch on purpose: forgetting to add a case here cannot route anybody into
     a product that was not built for them. */
  return (
    <Plain onSignOut={onSignOut}
      lead={"You're signed in, but this version of MetYet doesn't have the application "
        + "for your account yet. Nothing has been changed."} />
  );
}
