/* ============================================================================
   COLLECTOR NETWORK — WHO YOU'RE SERVING, AND WHAT YOU KNOW ABOUT THEM

   MetYet is a relationship network, not a marketplace, so this section is the
   one that says what the network IS. Every collector on it is in the
   projection's `collectors` collection, which the server filled by walking this
   Trusted Partner's own accepted Relationships. There is no other list, no
   directory and no search: a collector who is not related to you does not
   appear here because the server never sent them.

   THE JOIN IS BY IDENTIFIER, NEVER BY POSITION. A collector's relationship,
   goals and binder copies are found by matching `collectorId` — not by taking
   the row at the same index, and not by taking the first one. Row order is not
   a fact the server promised, and a screen that depends on it is a screen that
   silently shows one person's data against another's name.

   WHAT IS SHOWN, AND WHY EACH IS LEGITIMATE.

   Identity — `name`, `short`, `city` — is COLLECTOR_FOR_PARTNER: what a related
   partner may see. Preference tags are the same rule (D-2), and they are the
   matching profile this product runs on, so they belong on the card.

   The relationship's start, your own last contact, your own binder review time
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

import React, { useCallback, useState } from "react";
import { Panel, Record, Fact, Tag } from "../parts.jsx";
import { rows, indexById, groupBy, text, day, plural, cardTitle, cardSetLine,
  gradeLine, tierLabel, byRecency } from "../present.js";

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

export default function CollectorNetwork({ state, onInvite = null, onRevokeInvite = null,
  onRefresh = null }) {
  const collectors = rows(state && state.collectors);
  const relationships = rows(state && state.relationships);
  const invitations = rows(state && state.invitations);
  const catalog = indexById(state && state.catalog);

  /* Explicit identifiers, every one of them. */
  const relationshipOf = new Map();
  for (const r of relationships) if (r.collectorId != null) relationshipOf.set(r.collectorId, r);
  const goalsOf = groupBy(state && state.goals, "collectorId");
  const binderOf = groupBy(state && state.binder, "collectorId");
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

  /* ---------------------------------------------------------- inviting */
  const [inviting, setInviting] = useState(false);
  const [draft, setDraft] = useState({ recipient: "", note: "" });
  const [busy, setBusy] = useState(null);       // what is in flight, or null
  const [problem, setProblem] = useState(null);
  /* The credential, for exactly as long as it is on screen. It is never put
     anywhere that is read again, and there is no way to ask for it twice. */
  const [issued, setIssued] = useState(null);

  const writable = typeof onInvite === "function";

  const begin = useCallback(() => {
    setDraft({ recipient: "", note: "" });
    setProblem(null);
    setIssued(null);
    setInviting(true);
  }, []);

  const cancel = useCallback(() => {
    /* No command, no request, nothing written. */
    setInviting(false);
    setProblem(null);
  }, []);

  const create = useCallback(async (event) => {
    if (event && event.preventDefault) event.preventDefault();
    if (busy || !writable) return;
    setBusy("invite");
    setProblem(null);
    let result;
    try {
      result = await onInvite({ recipient: draft.recipient, note: draft.note });
    } catch (error) {
      setBusy(null);
      const failure = (error && (error.failure || error.code)) || "unexpected";
      setProblem(whyFailed(failure));
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
    setIssued({ credential: result.credential, recipient: draft.recipient.trim() || null });
  }, [busy, draft, onInvite, onRefresh, writable]);

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
      {issued ? (
        <Panel title="Hand this to them"
          action={<button className="tps-edit" type="button" onClick={() => setIssued(null)}>Done</button>}>
          <div className="tps-secret">
            <code className="tps-code mono">{issued.credential}</code>
            <p className="tps-aside">
              {issued.recipient ? `This is ${issued.recipient}'s code. ` : ""}
              It works once, it lasts two weeks, and MetYet will not show it again — give it to them
              now. If it goes astray, withdraw the invitation below and send a new one.
            </p>
          </div>
        </Panel>
      ) : null}

      {inviting ? (
        <form className="tps-form" onSubmit={create} noValidate>
          <Panel title="Invite a collector" note={busy === "invite" ? "Creating…" : "Not created yet"}>
            <div className="tps-fields">
              <label className="tps-field wide">
                <span className="tps-field-l">Who is this for</span>
                <input className="tps-input" type="text" value={draft.recipient}
                  disabled={busy === "invite"}
                  onChange={(e) => setDraft((d) => ({ ...d, recipient: e.target.value }))} />
                <span className="tps-field-h">
                  So you can tell your invitations apart. It does not decide who can use the code.
                </span>
              </label>
              <label className="tps-field wide">
                <span className="tps-field-l">Note</span>
                <input className="tps-input" type="text" value={draft.note}
                  disabled={busy === "invite"}
                  onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
                <span className="tps-field-h">Yours only. A collector never sees it.</span>
              </label>
            </div>
            {problem ? <p className="tps-problem" role="alert">{problem}</p> : null}
            <div className="tps-actions">
              <button className="tps-save" type="submit" disabled={busy === "invite"}>
                {busy === "invite" ? "Creating…" : "Create invitation"}
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
          const binder = binderOf.get(c.id) || [];
          const live = (oppsOf.get(c.id) || []).filter((o) => o.stage !== "completed");
          const prefs = rows(c.prefs).map(text).filter(Boolean);

          return (
            <Record
              key={c.id}
              title={text(c.name) || text(c.short) || "Collector"}
              subtitle={text(c.city)}
              tags={rel && text(rel.status) ? <Tag>{text(rel.status)}</Tag> : null}
              note={text(rel && rel.note)}
              noteLabel="Your note"
              facts={
                <>
                  <Fact label="In your network since" value={day(rel && rel.at)} mono />
                  <Fact label="Last contact" value={day(rel && rel.last)} mono />
                  <Fact label="Binder reviewed" value={day(rel && rel.binderReviewedAt)} mono />
                  <Fact label="Goals" value={goals.length ? String(goals.length) : null} mono />
                  <Fact label="Binder copies" value={binder.length ? String(binder.length) : null} mono />
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
                    const card = catalog.get(g.cardId) || null;
                    const grade = gradeLine(card);
                    const where = [cardSetLine(card), grade].filter(Boolean).join(" · ");
                    return (
                      <li key={g.id || `${g.collectorId}:${g.cardId}`}>
                        <span className="tps-sub-t">{cardTitle(card) || "A card you don't have listed"}</span>
                        {where ? <span className="tps-sub-s">{where}</span> : null}
                        <Tag tone={g.tier === "primary" ? "strong" : null}>{tierLabel(g.tier)}</Tag>
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
          {pending.map((i) => (
            <Record
              key={i.id}
              title={text(i.recipient) || "Someone you invited"}
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
                <button className="tps-edit" type="button" disabled={busy === i.id}
                  onClick={() => revoke(i.id)}>
                  {busy === i.id ? "Withdrawing…" : "Withdraw"}
                </button>
              ) : null}
            />
          ))}
        </Panel>
      ) : null}

      {withdrawn.length ? (
        <Panel title="Withdrawn" note={plural(withdrawn.length, "invitation", "invitations")}>
          {withdrawn.map((i) => (
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
            />
          ))}
        </Panel>
      ) : null}
    </>
  );
}
