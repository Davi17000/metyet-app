/* ============================================================================
   YOUR SHOP — THE FIRST THING IN PRODUCTION THAT CHANGES ANYTHING

     <Profile state={projection} onSave={fn} />

   Reached from Inventory's "View shop", because a profile is context for the
   shop rather than a workspace of its own: Collector Network, Inventory and
   Opportunities are recurring work, and this is what makes them mean something
   to a collector. It is the same component wherever it is rendered, and there
   is exactly one of it.

   Six fields a Trusted Partner can edit about their own shop, saved through the
   authenticated mutation boundary Phase 4 built and left uncalled. It is the
   smallest write the domain has: one record, the actor's own, no counterparty,
   no card, no money, no turn, no stage.

   WHAT ARRIVES, AND WHAT LEAVES. What arrives is the projection, exactly as
   every other section receives it. What leaves is `onSave(patch)` — a function
   of one argument, handed in as a prop. This file cannot reach a store, cannot
   name a command, cannot say who is signed in, and cannot send anything else.

   NOTHING IS PREDICTED. On success this leaves edit mode and renders from the
   projection again — which by then is the one the server returned. There is no
   line here that copies a draft into the displayed values, so "saved" and "what
   the server holds" cannot come apart. A refusal keeps the form open with the
   draft still in it, and the shop below is still the server's; a conflict drops
   back to the values the re-read brought in, because the copy being edited is
   the one that turned out to be stale.

   NOTHING IS RETRIED. A refusal, a conflict and an unreachable server all end
   with the person deciding whether to press Save again. This sends one command
   per press and refuses to send a second while one is in flight.

   AND NOTHING CLAIMS AN OUTCOME IT CANNOT KNOW. A refusal and a conflict are
   answers, so they say nothing was saved. Losing contact is not an answer —
   the command may have arrived and committed with its reply lost on the way
   back — so that case says exactly that, and asks the person to look before
   saving again. Telling somebody their change was not saved when it may have
   been is the one failure message that can cause the damage it describes.

   SIX FIELDS AND NOT A SEVENTH. These are precisely what the domain command
   accepts. The shop's NAME is not among them — MetYet set it when it issued the
   invitation — and neither is the default Trade %, which is private
   configuration a Collector never sees. Neither is added here to round the form
   out; a field this screen offered that the domain did not accept would be a
   control that silently does nothing.
   ========================================================================== */

import React, { useCallback, useMemo, useState } from "react";
import { describeActor } from "../../actor.js";
import { rows, text } from "../present.js";
import { Panel, Record, Fact, Tag } from "../parts.jsx";

/* The domain's six, with the label each one carries on screen and whether it is
   prose. Order is the command's own. */
export const FIELDS = Object.freeze([
  { key: "about", label: "About", long: true,
    hint: "What a collector should know about your shop." },
  { key: "specialties", label: "Specialties", list: true,
    hint: "Separate with commas — vintage, graded, sealed." },
  { key: "website", label: "Website" },
  { key: "instagram", label: "Instagram" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
]);

/* A list the server holds as an array, shown and typed as one line. Splitting a
   line into terms is presentation; what is sent is the array the domain
   expects, and it refuses anything else. */
const listToLine = (value) => (Array.isArray(value) ? value.filter(Boolean).join(", ") : "");
const lineToList = (value) => String(value || "").split(",").map((s) => s.trim()).filter(Boolean);

const draftFrom = (partner) => {
  const out = {};
  for (const f of FIELDS) {
    const held = partner ? partner[f.key] : null;
    out[f.key] = f.list ? listToLine(held) : (typeof held === "string" ? held : "");
  }
  return out;
};

const patchFrom = (draft) => {
  const out = {};
  for (const f of FIELDS) out[f.key] = f.list ? lineToList(draft[f.key]) : String(draft[f.key] || "").trim();
  return out;
};

/* The domain's word for why, in ours. A rule this build has not met is shown as
   itself rather than as the nearest one we know — the same rule the read
   experiences follow for a stage. */
const REFUSALS = Object.freeze({
  "not-owner": "Only the Trusted Partner this shop belongs to can change it.",
  "not-found": "MetYet could not find this shop to change it.",
  "invalid-amount": "Specialties could not be read as a list. Separate them with commas.",
});
const whyRefused = (refused) => REFUSALS[refused]
  || `MetYet declined that change (${refused || "no reason given"}).`;

/* TWO KINDS OF FAILURE, AND THE DIFFERENCE MATTERS MORE THAN THE WORDING.

   A conflict, an ended session and an unprovisioned account are ANSWERS. The
   server considered the request and declined it — a 409 whose transaction
   rolled back, a 401, a 403 — so the command did not run, and saying nothing
   was saved is a fact.

   LOSING CONTACT IS NOT AN ANSWER. `unavailable` is unreachable, timed out OR a
   5xx; `unexpected` includes a reply this client could not read, which covers a
   200 whose body was unreadable — a command that DID commit. Any of those may
   have arrived, committed, and had its reply lost on the way back.
   docs/CLIENT-BOUNDARY.md puts it plainly: a command whose response is lost may
   or may not have run, and no amount of client code can tell.

   So these two say what is known and nothing more. They do not claim the change
   was saved and they do not claim it was not; they say the command was not sent
   again, and they leave the next move to the person — because the only safe
   thing to do with an unknown write is look before repeating it. */
export const CERTAIN = Object.freeze({
  conflict: "Someone else changed this shop while you were editing, so nothing was saved. "
    + "The current values are below — make your changes again if you still want them.",
  unauthenticated: "Your session ended before that could be saved, so nothing was saved. "
    + "Sign in again and retry.",
  "not-provisioned": "This sign-in is not a MetYet account, so nothing was saved.",
});
export const AMBIGUOUS = Object.freeze({
  unavailable: "MetYet lost contact while saving, so it cannot tell whether the change went "
    + "through. It has not been sent again — check your profile before saving a second time.",
  unexpected: "MetYet got an answer it could not read, so it cannot tell whether the change "
    + "went through. It has not been sent again — check your profile before saving a second time.",
});
const whyFailed = (failure) => CERTAIN[failure] || AMBIGUOUS[failure] || AMBIGUOUS.unexpected;

export default function Profile({ state, onSave = null }) {
  const who = describeActor(state);
  const me = useMemo(
    () => rows(state && state.partners).find((p) => p.id === who.id) || null,
    [state, who.id],
  );

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => draftFrom(me));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  const begin = useCallback(() => {
    /* Edit mode always starts from the projection, never from a draft left over
       from a previous attempt. */
    setDraft(draftFrom(me));
    setProblem(null);
    setEditing(true);
  }, [me]);

  const cancel = useCallback(() => {
    /* No command, no request, nothing written. */
    setEditing(false);
    setProblem(null);
  }, []);

  const change = useCallback((key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const submit = useCallback(async (event) => {
    if (event && event.preventDefault) event.preventDefault();
    /* One at a time, decided here so the boundary's own refusal is a backstop
       rather than something a person can reach by pressing twice. */
    if (busy || typeof onSave !== "function") return;
    setBusy(true);
    setProblem(null);
    let result;
    try {
      result = await onSave(patchFrom(draft));
    } catch (error) {
      setBusy(false);
      const failure = (error && (error.failure || error.code)) || "unexpected";
      setProblem(whyFailed(failure));
      /* A conflict means the world moved and a re-read has already brought the
         current values in. The draft was written against values that turned out
         to be stale, so the form closes and the shop below is what is true now. */
      if (failure === "conflict") setEditing(false);
      return;
    }
    setBusy(false);
    if (!result || result.ok !== true) {
      /* Refused. Nothing changed, the form stays open with what was typed, and
         the shop below is still the server's. */
      setProblem(whyRefused(result && result.refused));
      return;
    }
    /* Saved. Leaving edit mode is the whole of it: what renders next is the
       projection the server returned, which arrived as a new `state` prop. */
    setEditing(false);
  }, [busy, draft, onSave]);

  const writable = typeof onSave === "function";
  const specialties = Array.isArray(me && me.specialties) ? me.specialties.filter(Boolean) : [];
  const anything = FIELDS.some((f) => (f.list ? specialties.length : text(me && me[f.key])));

  if (editing) {
    return (
      <form className="tps-form" onSubmit={submit} noValidate>
        <Panel title="Editing shop profile" note={busy ? "Saving…" : "Not saved yet"}>
          <div className="tps-fields">
            {FIELDS.map((f) => (
              <label key={f.key} className={"tps-field" + (f.long ? " wide" : "")}>
                <span className="tps-field-l">{f.label}</span>
                {f.long ? (
                  <textarea className="tps-input" rows={4} value={draft[f.key]} disabled={busy}
                    onChange={(e) => change(f.key, e.target.value)} />
                ) : (
                  <input className="tps-input" type="text" value={draft[f.key]} disabled={busy}
                    onChange={(e) => change(f.key, e.target.value)} />
                )}
                {f.hint ? <span className="tps-field-h">{f.hint}</span> : null}
              </label>
            ))}
          </div>
          {problem ? <p className="tps-problem" role="alert">{problem}</p> : null}
          <div className="tps-actions">
            <button className="tps-save" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button className="tps-cancel" type="button" onClick={cancel} disabled={busy}>Cancel</button>
          </div>
        </Panel>
      </form>
    );
  }

  return (
    <>
      <Panel title="Your shop"
        action={writable
          ? <button className="tps-edit" type="button" onClick={begin}>Edit profile</button>
          : null}
        empty={anything ? null
          : "Nothing here yet. Your collectors see this profile when they look you up — "
            + "what you specialise in, and how to reach you."}>
        <Record
          title={text(me && me.name) || "Your workspace"}
          tags={specialties.length ? specialties.map((s) => <Tag key={s}>{s}</Tag>) : null}
          facts={(
            <>
              <Fact label="Website" value={text(me && me.website)} />
              <Fact label="Instagram" value={text(me && me.instagram)} />
              <Fact label="Email" value={text(me && me.email)} />
              <Fact label="Phone" value={text(me && me.phone)} />
            </>
          )}
          note={text(me && me.about)}
          noteLabel="About" />
      </Panel>
      {problem ? <p className="tps-problem" role="alert">{problem}</p> : null}
      <p className="tps-aside">
        Your shop&rsquo;s name was set when MetYet invited you, and is not edited here.
        Everything above is what a collector in your network sees.
      </p>
    </>
  );
}
