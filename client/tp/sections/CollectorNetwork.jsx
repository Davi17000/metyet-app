/* ============================================================================
   COLLECTOR NETWORK — WHO YOU'RE SERVING, AND WHAT YOU KNOW ABOUT THEM

   MetYet is a relationship network, not a marketplace, so this section is the
   one that says what the network IS. Every collector on it is in the
   projection's `collectors` collection, which the server filled by walking this
   Trusted Partner's own accepted Relationships. There is no other list, no
   directory and no search: a collector who is not related to you does not
   appear here because the server never sent them.

   THE JOIN IS BY IDENTIFIER, NEVER BY POSITION. A collector's relationship,
   goals and offered copies are found by matching `collectorId` — not by taking
   the row at the same index, and not by taking the first one. Row order is not
   a fact the server promised, and a screen that depends on it is a screen that
   silently shows one person's data against another's name.

   WHAT IS SHOWN, AND WHY EACH IS LEGITIMATE.

   Identity — `name`, `short`, `city` — is COLLECTOR_FOR_PARTNER: what a related
   partner may see. Preference tags are the same rule (D-2), and they are the
   matching profile this product runs on, so they belong on the card.

   The relationship's start, your own last contact, your own card review time
   and your own note are RELATIONSHIP_PARTNER_PRIVATE: they are yours, about
   your relationship, and only you receive them. Another Trusted Partner's notes
   about the same collector are not in this projection and there is no code path
   here that could ask for them.

   Goals are GOAL_FOR_PARTNER, scoped by the server to collectors in your
   network. They are demand — the thing this product exists to serve — so each
   collector's own goals are listed under them with the tier the server set.

   NOTHING MISSING IS INVENTED. A relationship with no recorded last contact
   shows no last-contact line, rather than "never" or a date derived from
   something else. A collector with no goals shows no goals. Absence is
   rendered as absence.

   AND NOW IT IS ALSO WHERE A NETWORK STARTS (Phase 5 Batch 2). Inviting
   somebody belongs here because an invitation is what a Collector Network grows
   from — not in a settings page, and not as a destination of its own.

   THE SECRET IS SHOWN ONCE, AND THIS FILE KNOWS WHY. A credential comes back
   from the one reply that will ever carry it; it is held in a local variable
   for as long as the partner is looking at it and is never written into
   anything that is read again. There is no way to ask for it a second time,
   deliberately: a credential that can be re-read is not a credential handed
   over once. If it is lost, the invitation is revoked and a new one is sent.

   THIS FILE STILL CANNOT REACH ANYTHING. `onInvite`, `onRevokeInvite` and
   `onRefresh` are functions handed in from outside. No store, no command name,
   no network, and the projection is passed on exactly as it arrived.
   ========================================================================== */

import React, { useCallback, useEffect, useState } from "react";
import Qr from "../../qr/Qr.jsx";
import { Panel, Record, Fact, Tag } from "../parts.jsx";
import { rows, indexById, groupBy, text, day, plural, cardTitle, cardSetLine,
  gradeLine, tierLabel, byRecency , demandLine, desiredLine } from "../present.js";

/* The domain's word for why, in ours. A rule this build has not met is shown as
   itself rather than as the nearest one we know. */
const REFUSALS = Object.freeze({
  "not-owner": "That invitation belongs to a different Trusted Partner.",
  "not-found": "MetYet could not find that invitation.",
  terminal: "That invitation has already been accepted, so it cannot be withdrawn.",
});
const whyRefused = (refused) => REFUSALS[refused]
  || `MetYet declined that (${refused || "no reason given"}).`;

/* ANSWERS, AND NON-ANSWERS. A conflict, an ended session and an unprovisioned
   account are answers: the server considered it and declined, so nothing
   happened and saying so is a fact. Losing contact is not an answer — the
   request may have arrived and committed with only its reply lost — and here
   that matters more than anywhere else in the product, because the reply is the
   only copy of the credential. So it says what it knows: an invitation may now
   exist, its secret is already unrecoverable, and the honest next move is to
   look at the list and withdraw anything unexpected. */
const CERTAIN = Object.freeze({
  conflict: "Something else changed while that was saving, so nothing was created. Try again.",
  unauthenticated: "Your session ended before that could be saved, so nothing was created. "
    + "Sign in again and retry.",
  "not-provisioned": "This sign-in is not a MetYet account, so nothing was created.",
});
const AMBIGUOUS = Object.freeze({
  unavailable: "MetYet lost contact while creating that, so it cannot tell whether the invitation "
    + "was created. It has not been sent again. Check the list below — if one appeared, its code "
    + "cannot be shown, so withdraw it and invite again.",
  unexpected: "MetYet got an answer it could not read, so it cannot tell whether the invitation was "
    + "created. It has not been sent again. Check the list below — if one appeared, its code cannot "
    + "be shown, so withdraw it and invite again.",
});
const whyFailed = (failure) => CERTAIN[failure] || AMBIGUOUS[failure] || AMBIGUOUS.unexpected;
export { CERTAIN, AMBIGUOUS };

/* ------------------------------------------------- SENDING IT (Phase 5 B3B-2)

   AN ADDRESS IS A DESTINATION AND THE COPY HAS TO SAY SO. A person looking at a
   form with a name field and an email field will assume the email is the person,
   because everywhere else it is. Here it is not: whoever opens the link and
   signs in is who accepts, with any address they can receive mail at, and MetYet
   never compares the two. The help text under the field is the only place that
   misunderstanding gets corrected, so it is not shortened.

   SHAPE ONLY, AND CHECKED HERE SO THE ANSWER IS IMMEDIATE. The server checks the
   same shape and is the one that decides; this spares a round trip for a typo.
   Neither check is an identity check, and there is nothing for either of them to
   compare an address against. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* WHAT MetYet KNOWS ABOUT ONE SEND, in the words a shop owner would use. Only
   what the server said about a send it performed; nothing is inferred from the
   fact that an address was typed, and an invitation this screen was not told
   about says nothing at all rather than "not emailed". */
const DELIVERY_SAID = Object.freeze({
  sent: (to) => `Emailed to ${to}.`,
  /* Two different problems, and telling them apart is what makes the line
     useful: an address the provider would not accept is something a person can
     correct, and a provider that would not take anything just now is not. */
  failed: (to, failure) => (failure === "rejected"
    ? `The email to ${to} was refused. Check the address, then replace this invitation.`
    : `MetYet could not send the email to ${to} just now. Replace this invitation to try again.`),
  unconfirmed: () => "MetYet could not confirm the email was sent. Replace this invitation, "
    + "or share the code yourself.",
  none: () => "Not emailed — share the code or the link yourself.",
});
const deliverySaid = (said) => (DELIVERY_SAID[said.state] || DELIVERY_SAID.unconfirmed)(
  said.to, said.failure);
/* Two of the four are a problem a partner can do something about. */
const NEEDS_REPLACING = Object.freeze(["failed", "unconfirmed"]);

/* THE LINK IS THE SERVER'S, AND THIS SCREEN DOES NOT BUILD ONE. It arrives in
   the same reply as the credential, built from configured APP_URL — not from
   the address bar, which exactly one file in this product reads and which this
   is not. A server with no origin configured sends no link, and then the code
   is what gets handed over, as it was in Batch 2. */

export default function CollectorNetwork({ state, onInvite = null, onRevokeInvite = null,
  onRefresh = null, onBrowseCards = null }) {
  const collectors = rows(state && state.collectors);
  const relationships = rows(state && state.relationships);
  const invitations = rows(state && state.invitations);
  const catalog = indexById(state && state.catalog);

  /* Explicit identifiers, every one of them. */
  const relationshipOf = new Map();
  for (const r of relationships) if (r.collectorId != null) relationshipOf.set(r.collectorId, r);
  const goalsOf = groupBy(state && state.goals, "collectorId");
  /* WHICH CARDS THEY WANT (Batch 7). The ids are in this projection already,
     because the server decided this partner may see them; the names are asked
     for once, for the set. Never one request per goal, and never the catalogue.
     This is demand made legible, not a match: nothing here looks at inventory,
     and no opportunity is created by reading it. */
  const wantedIds = [...new Set(rows(state && state.goals)
    .map((g) => g.canonicalCardId).filter(Boolean))];
  const [wanted, setWanted] = useState({});
  useEffect(() => {
    if (!onBrowseCards || !wantedIds.length) return undefined;
    let current = true;
    (async () => {
      try {
        const answer = await onBrowseCards.describe(wantedIds);
        if (!current) return;
        const next = {};
        for (const card of rows(answer && answer.cards)) next[card.canonicalCardId] = card;
        setWanted((held) => ({ ...held, ...next }));
      } catch (error) { /* a name that did not arrive is not a reason to hide demand */ }
    })();
    return () => { current = false; };
  }, [wantedIds.join(","), onBrowseCards]);
  const copiesOf = groupBy(state && state.collectorCopies, "collectorId");
  const oppsOf = groupBy(state && state.opportunities, "collectorId");

  /* Most recently in contact first, when that is known; the rest keep the
     order the server sent them in. */
  const ordered = byRecency(
    collectors.map((c) => ({ ...c, __at: (relationshipOf.get(c.id) || {}).last })),
    "__at",
  );

  /* Outstanding means: nobody has accepted it and it has not been withdrawn.
     An expired one is still outstanding to a person — it is a thing they sent
     that came to nothing — so it stays listed and says so. */
  const pending = invitations.filter((i) => !i.acceptedAt && !i.revokedAt);
  const withdrawn = invitations.filter((i) => !i.acceptedAt && i.revokedAt);

  /* WHAT TO CALL SOMEBODY WHO HAS NOT NAMED THEMSELVES (Phase 5 Batch 3A).

     A Collector created by accepting an invitation is an id and nothing else
     until they fill in a profile — deliberately, because the only other name
     available would be the hint THIS partner typed, and a hint that became
     somebody's name would be a hint that decided something.

     But this partner may still call them by their own note. The accepted
     invitation is in this projection, it carries the hint they wrote, and it
     now names the Collector it produced — so the join needs nothing new. The
     label never leaves this screen: `INVITATION_FOR_INVITEE` does not include
     `recipient`, so no collector ever receives the words their shop wrote about
     them. It is a fallback only: a real name always wins. */
  const hintFor = new Map();
  for (const i of invitations) {
    if (i.acceptedAt && i.collectorId && text(i.recipient)) hintFor.set(i.collectorId, text(i.recipient));
  }
  const nameOf = (c) => text(c.name) || text(c.short) || hintFor.get(c.id) || "Collector";

  /* ---------------------------------------------------------- inviting */
  const [inviting, setInviting] = useState(false);
  const [draft, setDraft] = useState({ recipient: "", note: "", email: "" });
  const [busy, setBusy] = useState(null);       // what is in flight, or null
  const [problem, setProblem] = useState(null);
  /* The credential, for exactly as long as it is on screen. It is never put
     anywhere that is read again, and there is no way to ask for it twice. */
  const [issued, setIssued] = useState(null);
  /* WHAT THE SERVER SAID ABOUT SENDS IT PERFORMED WHILE THIS SCREEN WAS OPEN,
     by invitation id. It is memory and nothing more: a reload empties it, and an
     invitation it has no entry for shows no delivery line — which is honest,
     because delivery is not product state and the projection has never carried
     it. Nothing here is written anywhere that survives the tab. */
  const [delivered, setDelivered] = useState({});
  /* The invitation this form will withdraw before it creates the new one, or
     null for an ordinary invitation. */
  const [replacing, setReplacing] = useState(null);
  const remember = useCallback((invitationId, delivery) => {
    if (!invitationId || !delivery) return;
    const said = delivery.requested ? (delivery.state || "unconfirmed") : "none";
    setDelivered((seen) => ({ ...seen,
      [invitationId]: { state: said, to: delivery.to || null, failure: delivery.failure || null } }));
  }, []);
  /* Folded away by default; the rows are kept, not dropped. */
  const [showWithdrawn, setShowWithdrawn] = useState(false);

  const writable = typeof onInvite === "function";
  /* An address in the draft is the whole of the difference between creating an
     invitation and sending one, so the screen reads it from there rather than
     keeping a second flag that could disagree with the field. */
  const sending = Boolean(draft.email.trim());

  const begin = useCallback(() => {
    setDraft({ recipient: "", note: "", email: "" });
    setProblem(null);
    setIssued(null);
    setReplacing(null);
    setInviting(true);
  }, []);

  /* AGAIN, FOR SOMEBODY THIS PARTNER ALREADY DESCRIBED. The labels they wrote
     are theirs and are worth keeping; the address is only offered back when
     this screen was the one that sent it, because it is not in the projection
     and never will be. `targeting` is what makes this a replacement rather than
     a second invitation: given an id, the form withdraws that one first. */
  const again = useCallback((invitation, targeting = null) => {
    const known = (invitation && delivered[invitation.id]) || null;
    setDraft({
      recipient: text(invitation && invitation.recipient) || "",
      note: text(invitation && invitation.note) || "",
      email: (known && known.to) || "",
    });
    setProblem(null);
    setIssued(null);
    setReplacing(targeting);
    setInviting(true);
  }, [delivered]);

  const cancel = useCallback(() => {
    /* No command, no request, nothing written. */
    setInviting(false);
    setReplacing(null);
    setProblem(null);
  }, []);

  const create = useCallback(async (event) => {
    if (event && event.preventDefault) event.preventDefault();
    if (busy || !writable) return;
    const email = draft.email.trim();
    if (email && !LOOKS_LIKE_EMAIL.test(email)) {
      /* Nothing is sent, so nothing has to be undone. */
      setProblem("That does not look like an email address. Correct it, or clear it and share "
        + "the code yourself.");
      return;
    }
    setBusy("invite");
    setProblem(null);

    /* REPLACING IS WITHDRAW-THEN-CREATE, IN THAT ORDER, AND THE ORDER IS THE
       GUARANTEE. There is no resend: MetYet keeps a digest and never the code,
       so the only way to reach somebody again is a NEW invitation with a NEW
       secret. Withdrawing first means the worst interruption leaves no valid
       invitation rather than two — and the code that went to the wrong address
       stops working immediately, which is the point rather than a consolation.

       If the withdrawal is refused, nothing is created: the old invitation is
       still the live one and a second live one would be the one thing this must
       not produce. */
    if (replacing) {
      let withdrawn;
      try {
        withdrawn = await onRevokeInvite(replacing);
      } catch (error) {
        setBusy(null);
        const failure = (error && (error.failure || error.code)) || "unexpected";
        setProblem(CERTAIN[failure]
          || "MetYet lost contact while withdrawing the old invitation, so nothing was replaced. "
            + "Check the list.");
        if (!CERTAIN[failure] && typeof onRefresh === "function") {
          try { await onRefresh(); } catch (again) { /* the list stays as it was */ }
        }
        return;
      }
      if (!withdrawn || withdrawn.ok !== true) {
        setBusy(null);
        setProblem(`${whyRefused(withdrawn && withdrawn.refused)} The old invitation is still the `
          + "live one, so nothing new was created.");
        return;
      }
    }

    let result;
    try {
      result = await onInvite({ recipient: draft.recipient, note: draft.note, email });
    } catch (error) {
      setBusy(null);
      const failure = (error && (error.failure || error.code)) || "unexpected";
      /* A REQUEST THIS SERVER WOULD NOT TAKE IS NOT AN AMBIGUOUS ONE. It was
         refused before anything happened, and with an address in hand the
         reason is almost always that this deployment cannot send email at all —
         which is a supported configuration, not a fault. Creating without one
         still works, and saying so is more use than "MetYet cannot tell". */
      setProblem(email && failure === "unexpected" && error && error.detail === "invalid_request"
        ? "This MetYet cannot send email, so nothing was created. Clear the email address to "
          + "create an invitation you hand over yourself."
        : whyFailed(failure));
      /* A READ IS NOT A REPLAY. The command is never sent again — but asking
         what exists now is a GET with no side effects, and it is the only way a
         person can find out whether the thing they could not see the answer to
         actually happened. */
      if (AMBIGUOUS[failure] && typeof onRefresh === "function") {
        try { await onRefresh(); } catch (again) { /* the list stays as it was */ }
      }
      return;
    }
    setBusy(null);
    if (!result || result.ok !== true) {
      setProblem(whyRefused(result && result.refused));
      return;
    }
    /* Saved. The form closes, and the one copy of the credential goes on screen
       until the partner has done something else. */
    setInviting(false);
    setReplacing(null);
    remember(result.invitationId, result.delivery);
    setIssued({
      credential: result.credential,
      recipient: draft.recipient.trim() || null,
      /* So that a partner whose email did not arrive — or who never asked for
         one — has the same thing to hand over that the email would carry. */
      link: result.joinUrl || null,
      delivery: result.delivery && result.delivery.requested
        ? { state: result.delivery.state || "unconfirmed", to: result.delivery.to || email,
          failure: result.delivery.failure || null }
        : null,
    });
  }, [busy, draft, onInvite, onRefresh, onRevokeInvite, remember, replacing, writable]);

  const revoke = useCallback(async (invitationId) => {
    if (busy || typeof onRevokeInvite !== "function") return;
    setBusy(invitationId);
    setProblem(null);
    let result;
    try {
      result = await onRevokeInvite(invitationId);
    } catch (error) {
      setBusy(null);
      const failure = (error && (error.failure || error.code)) || "unexpected";
      setProblem(CERTAIN[failure]
        || "MetYet lost contact while withdrawing that, so it cannot tell whether it was "
          + "withdrawn. It has not been sent again — check the list.");
      if (!CERTAIN[failure] && typeof onRefresh === "function") {
        try { await onRefresh(); } catch (again) { /* the list stays as it was */ }
      }
      return;
    }
    setBusy(null);
    if (!result || result.ok !== true) setProblem(whyRefused(result && result.refused));
  }, [busy, onRevokeInvite, onRefresh]);

  return (
    <>
      {/* ------------------------------------------- THE HANDOFF (Batch 3C)

          ONE INVITATION, AND THE PANEL HAS TO SAY SO. A QR, a link and a code
          are not three invitations — they are three ways to pass the same
          secret across a counter, and a partner who believed otherwise would
          withdraw one thinking the others survived.

          THE QR LEADS BECAUSE THE FAST PATH IS IN PERSON. Somebody standing at
          the counter holds up a screen and it is done: no address to type, no
          code to read aloud, no name to invent. The link is for a message, and
          the code is what still works when a camera will not focus.

          AND THIS IS STILL THE ONLY PLACE ANY OF IT EXISTS. The credential
          arrived in one reply and is held in a local variable; the QR is
          computed from it here, in this browser, and is gone with the panel.
          There is no second token, nothing is stored, and nothing is fetched —
          a QR built by somebody else's service would be this secret handed to
          whoever answered. */}
      {issued ? (
        <Panel title="Hand this over" note="One invitation · three ways"
          action={<button className="tps-edit" type="button" onClick={() => setIssued(null)}>Done</button>}>
          <div className="tps-secret tps-handoff">
            {issued.link ? (
              <div className="tps-handoff-scan">
                <Qr value={issued.link} size={228}
                  label="Scan to open this invitation" />
                <p className="tps-aside">Have them scan this.</p>
              </div>
            ) : null}
            <div className="tps-handoff-rest">
              {issued.link ? (
                <p className="tps-aside">
                  Or send the link: <span className="mono tps-linktext">{issued.link}</span>
                </p>
              ) : null}
              <p className="tps-aside">Or read out the code:</p>
              {/* The credential stays the one <code> on this screen. */}
              <code className="tps-code mono">{issued.credential}</code>
              {issued.delivery ? <p className="tps-aside">{deliverySaid(issued.delivery)}</p> : null}
              <p className="tps-aside">
                {issued.recipient ? `This is ${issued.recipient}'s invitation. ` : ""}
                However it travels it is the same invitation: it works once, it lasts two weeks,
                and MetYet will not show it again. If it goes astray, replace it below.
              </p>
            </div>
          </div>
        </Panel>
      ) : null}

      {inviting ? (
        <form className="tps-form" onSubmit={create} noValidate>
          <Panel title={replacing ? "Replace invitation" : "Invite a collector"}
            note={busy === "invite" ? (sending ? "Sending…" : "Creating…") : "Not created yet"}>
            {/* EVERY FIELD HERE IS OPTIONAL, AND THE FORM HAS TO LOOK IT.
                Somebody at the counter should be able to press one button and
                hold up a QR. A form that reads as a form invites a shop to
                invent a name for a person standing in front of them — and a
                name invented here would be the one thing this batch must not
                let near a Collector's identity. */}
            <p className="tps-aside tps-invite-lead">
              Nothing below is required. Create it now and show them the QR, or add an address and
              MetYet will send it.
            </p>
            <div className="tps-fields">
              <label className="tps-field wide">
                <span className="tps-field-l">Who is this for (optional)</span>
                <input className="tps-input" type="text" value={draft.recipient}
                  disabled={busy === "invite"}
                  onChange={(e) => setDraft((d) => ({ ...d, recipient: e.target.value }))} />
                <span className="tps-field-h">
                  A private memory aid, so you can tell your own invitations apart. A collector
                  never sees it, and it does not become their name in MetYet — they say who they
                  are themselves.
                </span>
              </label>
              <label className="tps-field wide">
                <span className="tps-field-l">Email (optional)</span>
                <input className="tps-input" type="email" value={draft.email}
                  disabled={busy === "invite"}
                  onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} />
                <span className="tps-field-h">
                  Where MetYet sends the invitation. It does not decide who can accept it — whoever
                  opens the link and signs in does, with any address they can receive mail at.
                  Leave it blank to hand it over in person.
                </span>
              </label>
              <label className="tps-field wide">
                <span className="tps-field-l">Note (optional)</span>
                <input className="tps-input" type="text" value={draft.note}
                  disabled={busy === "invite"}
                  onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
                <span className="tps-field-h">Yours only. A collector never sees it.</span>
              </label>
            </div>
            {problem ? <p className="tps-problem" role="alert">{problem}</p> : null}
            <div className="tps-actions">
              {/* WHAT THE BUTTON PROMISES IS WHAT WILL HAPPEN. With an address
                  MetYet sends the invitation, so it says so; without one it
                  creates an invitation the partner hands over, so it says that
                  instead. And a replacement says "replace", never "send again"
                  or "retry" — the old code dies and a new one is issued, and a
                  word that hid that would be hiding the only thing that matters
                  about it. */}
              <button className="tps-save" type="submit" disabled={busy === "invite"}>
                {busy === "invite" ? (sending ? "Sending…" : "Creating…")
                  : replacing ? "Replace invitation"
                  : sending ? "Send invitation" : "Create invitation"}
              </button>
              <button className="tps-cancel" type="button" onClick={cancel} disabled={busy === "invite"}>
                Cancel
              </button>
            </div>
          </Panel>
        </form>
      ) : null}

      {problem && !inviting ? <p className="tps-problem" role="alert">{problem}</p> : null}

      <Panel
        title="Collectors"
        note={collectors.length ? plural(collectors.length, "collector", "collectors") : null}
        action={writable && !inviting
          ? <button className="tps-edit" type="button" onClick={begin}>Invite a collector</button>
          : null}
        empty={collectors.length ? null
          : "No collectors in your network yet. Invite someone, hand them the code, and they join "
            + "when they accept it."}
      >
        {ordered.map((c) => {
          const rel = relationshipOf.get(c.id) || null;
          const goals = goalsOf.get(c.id) || [];
          /* Only the copies this Collector is OFFERING reach a partner at all
             (C2) — the projection dropped the rest, so this is a count of
             supply, not of what they own. */
          const offeredCopies = copiesOf.get(c.id) || [];
          const live = (oppsOf.get(c.id) || []).filter((o) => o.stage !== "completed");
          const prefs = rows(c.prefs).map(text).filter(Boolean);

          return (
            <Record
              key={c.id}
              title={nameOf(c)}
              subtitle={text(c.city)}
              tags={rel && text(rel.status) ? <Tag>{text(rel.status)}</Tag> : null}
              note={text(rel && rel.note)}
              noteLabel="Your note"
              facts={
                <>
                  <Fact label="In your network since" value={day(rel && rel.at)} mono />
                  <Fact label="Last contact" value={day(rel && rel.last)} mono />
                  <Fact label="Cards reviewed" value={day(rel && rel.binderReviewedAt)} mono />
                  <Fact label="Goals" value={goals.length ? String(goals.length) : null} mono />
                  <Fact label="Cards offered" value={offeredCopies.length ? String(offeredCopies.length) : null} mono />
                  <Fact label="In progress" value={live.length ? String(live.length) : null} mono />
                </>
              }
            >
              {prefs.length ? (
                <div className="tps-marks tps-prefs">
                  {prefs.map((t) => <span key={t} className="tps-mark">{t}</span>)}
                </div>
              ) : null}

              {goals.length ? (
                <ul className="tps-sub">
                  {goals.map((g) => {
                    /* A goal names its card one way or the other. */
                    const known = g.canonicalCardId ? wanted[g.canonicalCardId] : null;
                    const card = g.canonicalCardId ? null : (catalog.get(g.cardId) || null);
                    const where = known
                      ? [known.expansionName, known.collectorNumber ? `#${known.collectorNumber}` : null,
                        known.finish, known.printRun].filter(Boolean).join(" · ")
                      : [cardSetLine(card), gradeLine(card)].filter(Boolean).join(" · ");
                    return (
                      <li key={g.id || `${g.collectorId}:${g.cardId || g.canonicalCardId}`}>
                        <span className="tps-sub-t">
                          {(known && known.cardName) || cardTitle(card)
                            || (g.canonicalCardId ? "A card MetYet is still describing" : "A card you don't have listed")}
                        </span>
                        {where ? <span className="tps-sub-s">{where}</span> : null}
                        <Tag tone={g.tier === "primary" ? "strong" : null}>{tierLabel(g.tier)}</Tag>
                        {/* The distinction said in words, because "Primary" is
                            the domain's name for it and not a sentence. */}
                        <span className="tps-sub-n">{demandLine(nameOf(c), g.tier)}</span>
                        {/* WHICH COPY, kept as its own sentence (Phase 5 C3.5).
                            The tier above says how hard they are looking; this
                            says what would answer it. A goal that named no copy
                            renders nothing at all rather than "any condition" —
                            see `desiredLine`. */}
                        {desiredLine(g.desired) ? (
                          <span className="tps-sub-n">{desiredLine(g.desired)}</span>
                        ) : null}
                        {text(g.note) ? <span className="tps-sub-n">{text(g.note)}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </Record>
          );
        })}
      </Panel>

      {pending.length ? (
        <Panel title="Invitations outstanding" note={plural(pending.length, "invitation", "invitations")}>
          {pending.map((i) => {
            /* Only what MetYet was told about a send it performed. An
               invitation this screen has no answer for shows no line at all —
               silence is the truth there, and "not emailed" would not be. */
            const said = delivered[i.id] || null;
            const troubled = said && NEEDS_REPLACING.includes(said.state);
            return (
              <Record
                key={i.id}
                /* RECOGNISING ONE THE PARTNER DID NOT LABEL (Batch 3C). Now
                   that a name is plainly optional, more rows will have none —
                   so the row falls back to what this partner already knows:
                   the address MetYet was asked to send it to, from this
                   session's own answer, or the fact that it was handed over
                   rather than sent. Nothing here comes from a projection that
                   did not already carry it, and nothing is invented. */
                title={text(i.recipient) || (said && said.to)
                  || (said && said.state === "none" ? "Handed over in person" : "Someone you invited")}
                /* The code is not here, and there is nowhere it could be: the
                   projection never carried one. */
                facts={
                  <>
                    <Fact label="Sent" value={day(i.at)} mono />
                    <Fact label="Expires" value={day(i.expiresAt)} mono />
                  </>
                }
                note={text(i.note)}
                noteLabel="Your note"
                tags={typeof onRevokeInvite === "function" ? (
                  <>
                    {troubled && writable ? (
                      <button className="tps-edit" type="button" disabled={busy === i.id}
                        onClick={() => again(i, i.id)}>
                        Replace invitation
                      </button>
                    ) : null}
                    <button className="tps-edit" type="button" disabled={busy === i.id}
                      onClick={() => revoke(i.id)}>
                      {busy === i.id ? "Withdrawing…" : "Withdraw"}
                    </button>
                  </>
                ) : null}
              >
                {said ? <p className="tps-aside">{deliverySaid(said)}</p> : null}
              </Record>
            );
          })}
        </Panel>
      ) : null}

      {/* WITHDRAWN INVITATIONS ARE HISTORY, NOT WORK (Phase 5 Batch 3A). Hosted
          Batch 2 showed a permanent panel of equal weight to the network
          itself, accumulating for ever. The rows are real and are kept — they
          are simply folded away until somebody asks, because what a partner
          opens this screen to do is never in them. */}
      {withdrawn.length ? (
        <Panel title="Withdrawn" note={plural(withdrawn.length, "invitation", "invitations")}
          action={<button className="tps-edit" type="button"
            onClick={() => setShowWithdrawn((on) => !on)}>
            {showWithdrawn ? "Hide" : "Show"}
          </button>}>
          {showWithdrawn ? withdrawn.map((i) => (
            <Record
              key={i.id}
              title={text(i.recipient) || "Someone you invited"}
              facts={
                <>
                  <Fact label="Sent" value={day(i.at)} mono />
                  <Fact label="Withdrawn" value={day(i.revokedAt)} mono />
                </>
              }
              note={text(i.note)}
              noteLabel="Your note"
              /* NOT "replace": there is nothing live to withdraw here, so this
                 creates an invitation and nothing else. The words are kept
                 apart because the actions are. */
              tags={writable ? (
                <button className="tps-edit" type="button" onClick={() => again(i, null)}>
                  Invite again
                </button>
              ) : null}
            />
          )) : null}
        </Panel>
      ) : null}
    </>
  );
}
