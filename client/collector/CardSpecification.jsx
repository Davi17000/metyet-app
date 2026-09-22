/* ============================================================================
   CARD SPECIFICATION — ONE CARD, FOUR INDEPENDENT FACTS (Phase 5 C3.3)

   A Collector presses a card in Browse and says everything they have to say
   about it, in one place, and then presses one button.

   THE FOUR FACTS, AND WHY THEY ARE NOT A STATE MACHINE.

     Binder        this card belongs here        (C3.1)
     Goal          I want this card, this hard   (Batch 7)
     CollectorCopy I own this physical copy      (C2)
     offered       I would part with that copy   (C2)

   They are independent, and this panel's whole job is to let a person say them
   together without the product pretending they are one thing. Somebody can be
   actively hunting a Charizard, own two of them already, be willing to trade
   one, and keep the card filed in two binders — all at once, and that is an
   ordinary collection rather than an edge case. A four-valued "intent" would
   have to pick one of those and would be wrong about a real person on their
   first day.

   NOTHING IS WRITTEN UNTIL THE LAST BUTTON. Opening this writes nothing.
   Ticking a binder writes nothing. Choosing a want, typing a grade, adding a
   copy, changing your mind and pressing Cancel all write nothing. There is no
   draft, no bookmark, no queue, and no record anywhere of a card somebody
   looked at. That is C1's rule and this panel is a bigger surface to keep it
   on, not a reason to relax it.

   WHAT IT KNOWS IT IS CHANGING. This holds the person's ANSWERS, and the
   projection holds the truth. What Commit sends is the difference between the
   two, computed at the moment it is pressed. That one decision is what makes
   the hard parts easy: a partial commit leaves the projection further along,
   so recomputing the difference against the projection the server just returned
   drops everything that already succeeded. Pressing Commit again sends only
   what is left — which is how a retry can be safe even though creating a binder
   and creating a physical copy both mint identity and cannot be retried blind.

   IT IS COMPOSITION, NOT AN AGGREGATE. There is no `saveCardSpecification`
   command, no new record, and no new table. Every button below ends in a
   command that already existed, and the order they run in is the only thing
   this file adds to the domain.

   IT DOES NOT KNOW WHO IS LOOKING. No actor, no seat, no store, no api, no
   domain import. Handed a projection and some callbacks, it renders.
   ========================================================================== */

import React, { useMemo, useState } from "react";
import { rows, text, money, gradeLine, gradeProblem, gradeConflictLine,
  statusLabel } from "./present.js";

/* The vocabulary the domain already has. Not a list this screen invented, and
   deliberately not widened here: another grading company is a product decision,
   not a dropdown. The same two lists the Trusted Partner's shelf offers, because
   a PSA 9 is a PSA 9 whoever is holding it. */
const GRADES = ["Raw", "PSA 1", "PSA 2", "PSA 3", "PSA 4", "PSA 5", "PSA 6",
  "PSA 7", "PSA 8", "PSA 9", "PSA 10"];
const CONDITIONS = ["Near Mint", "Lightly Played", "Moderately Played",
  "Heavily Played", "Damaged"];

const WANTS = [
  { id: "none", label: "Not looking" },
  { id: "secondary", label: "Keeping an eye out" },
  { id: "primary", label: "Actively hunting" },
];

const isRaw = (grade) => /^raw$/i.test(text(grade) || "");
/* The one rule, asked before the request. The domain decides this and refuses a
   record that breaks it; asking here means a person is told which control to
   fix instead of being told no after a round trip. A courtesy, never the
   authority — and deliberately not a copy of the domain's vocabulary check,
   which would drift. */
const incoherent = (facts) => {
  const grade = text(facts.grade);
  const condition = text(facts.condition);
  if (isRaw(grade) && !condition) return "A raw card needs a condition.";
  if (grade && !isRaw(grade) && condition) return "A graded card does not also carry a raw condition.";
  return null;
};

/* A copy as this panel edits it: the projected row, plus the answers so far. */
const asDraft = (copy) => ({
  id: copy.id,
  grade: text(copy.grade) || "",
  condition: text(copy.condition) || "",
  cert: text(copy.cert) || "",
  market: copy.market == null ? "" : String(copy.market),
  offered: copy.offered === true,
  removed: false,
  /* Carried so the row can show what the server says about it without this
     file working any of it out. */
  status: copy.status,
  grading: copy.grading,
});

const BLANK_COPY = { id: null, grade: "", condition: "", cert: "", market: "",
  offered: false, removed: false, status: null, grading: null };

/* WHAT THE PERSON WOULD BE CHANGING, against what the server currently says.
   Pure, and computed fresh every time Commit is pressed — including the second
   time, which is what makes a retry send only what is left. */
export function planFrom(state, canonicalCardId, answers) {
  const myBinders = rows(state && state.binders);
  const entries = rows(state && state.binderEntries)
    .filter((e) => e.canonicalCardId === canonicalCardId);
  const filedNow = new Set(entries.map((e) => e.binderId));
  const goal = rows(state && state.goals).find((g) => g.canonicalCardId === canonicalCardId) || null;
  const copiesNow = rows(state && state.collectorCopies)
    .filter((b) => b.canonicalCardId === canonicalCardId);
  const byId = new Map(copiesNow.map((b) => [b.id, b]));

  const steps = [];

  /* 1–3. ORGANISATION FIRST, because it is the most reversible thing here and
     the least entangled: filing a card changes nothing about wanting or owning
     it, so a failure later leaves a person with a correctly filed card rather
     than with half a decision. */
  for (const name of answers.newBinders) steps.push({ kind: "make-binder", name });
  for (const id of answers.binders) {
    if (!filedNow.has(id)) steps.push({ kind: "file", binderId: id });
  }
  for (const id of filedNow) {
    if (!answers.binders.has(id)) steps.push({ kind: "unfile", binderId: id });
  }

  /* 4–7. DEMAND. Criteria before tier, so that a Goal a partner is already
     working from becomes MORE precise before it becomes more urgent. */
  const stated = (answers.desired.grade || answers.desired.condition)
    ? { grade: answers.desired.grade || null,
      condition: isRaw(answers.desired.grade) ? (answers.desired.condition || null) : null }
    : null;
  const sameCriteria = (a, b) => (text(a && a.grade) || null) === (text(b && b.grade) || null)
    && (text(a && a.condition) || null) === (text(b && b.condition) || null);
  if (goal && answers.want !== "none") {
    if (stated && !sameCriteria(goal.desired, stated)) {
      steps.push({ kind: "wanted-copy", goalId: goal.id, desired: stated });
    }
    if (goal.tier !== answers.want) {
      steps.push({ kind: "how-hard", goalId: goal.id, tier: answers.want });
    }
  }
  if (goal && answers.want === "none") steps.push({ kind: "stop-looking", goalId: goal.id });
  if (!goal && answers.want !== "none") {
    steps.push({ kind: "start-looking", tier: answers.want, desired: stated });
  }

  /* 8–11. OWNERSHIP LAST, and new copies last of all. A duplicate physical copy
     is a legitimate thing to own, so nothing downstream can tell an accidental
     second send from a real second copy — which means creating one must be the
     step with the least behind it if the sequence stops. */
  for (const draft of answers.copies) {
    const before = draft.id ? byId.get(draft.id) : null;
    if (draft.id && !before) continue;                 // already gone; nothing to do
    if (draft.removed) { if (before) steps.push({ kind: "forget-copy", copyId: draft.id }); continue; }
    if (!draft.id) continue;                           // a new copy: handled below
    const patch = {};
    const facts = { grade: draft.grade || null, condition: isRaw(draft.grade) ? (draft.condition || null) : null,
      cert: draft.cert || null, market: draft.market === "" ? null : Number(draft.market) };
    for (const [k, v] of Object.entries(facts)) {
      const was = before[k] === undefined ? null : before[k];
      if (json(v) !== json(was)) patch[k] = v;
    }
    if (Object.keys(patch).length) steps.push({ kind: "correct-copy", copyId: draft.id, patch });
    if (before.offered !== draft.offered) {
      steps.push({ kind: "offering", copyId: draft.id, offered: draft.offered });
    }
  }
  for (const draft of answers.copies) {
    if (draft.id || draft.removed) continue;
    steps.push({ kind: "record-copy", copy: {
      grade: draft.grade || null,
      condition: isRaw(draft.grade) ? (draft.condition || null) : null,
      cert: draft.cert || null,
      market: draft.market === "" ? null : Number(draft.market),
      offered: draft.offered === true,
    }, draftKey: draft.key });
  }

  return { steps, goal, copiesNow, myBinders, filedNow };
}

const json = (v) => JSON.stringify(v === undefined ? null : v);

/* What the controls should say when the panel opens: the truth, and only the
   truth. A Goal with no criteria opens EMPTY — never Raw / Near Mint, which
   would be MetYet inventing a preference nobody expressed — and a card with no
   copies opens with no copy rows, not one blank one, because a pre-filled form
   is the product answering "how many do you own" with "one". */
export function initialAnswers(state, canonicalCardId) {
  const entries = rows(state && state.binderEntries)
    .filter((e) => e.canonicalCardId === canonicalCardId);
  const goal = rows(state && state.goals).find((g) => g.canonicalCardId === canonicalCardId) || null;
  const copies = rows(state && state.collectorCopies)
    .filter((b) => b.canonicalCardId === canonicalCardId);
  return {
    binders: new Set(entries.map((e) => e.binderId)),
    newBinders: [],
    want: goal ? goal.tier : "none",
    desired: { grade: text(goal && goal.desired && goal.desired.grade) || "",
      condition: text(goal && goal.desired && goal.desired.condition) || "" },
    copies: copies.map(asDraft),
  };
}

export default function CardSpecification({ card, context = null, state,
  onCommit, onClose, holders = 0 }) {
  const canonicalCardId = card && card.canonicalCardId;
  const [answers, setAnswers] = useState(() => initialAnswers(state, canonicalCardId));
  const [newBinderName, setNewBinderName] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(null);
  const [done, setDone] = useState(null);
  const [nextKey, setNextKey] = useState(1);

  const binders = rows(state && state.binders).filter((b) => !b.archivedAt);
  const plan = useMemo(() => planFrom(state, canonicalCardId, answers),
    [state, canonicalCardId, answers]);
  const goal = plan.goal;

  const patch = (next) => setAnswers((a) => ({ ...a, ...next }));
  const setCopy = (key, next) => setAnswers((a) => ({ ...a,
    copies: a.copies.map((c) => ((c.id || c.key) === key ? { ...c, ...next } : c)) }));

  const toggleBinder = (id) => setAnswers((a) => {
    const binders2 = new Set(a.binders);
    if (binders2.has(id)) binders2.delete(id); else binders2.add(id);
    return { ...a, binders: binders2 };
  });

  const addBinder = () => {
    const name = newBinderName.trim();
    if (!name) return;
    setAnswers((a) => ({ ...a, newBinders: [...a.newBinders, name] }));
    setNewBinderName("");
  };

  const addCopy = () => {
    setAnswers((a) => ({ ...a, copies: [...a.copies, { ...BLANK_COPY, key: `new-${nextKey}` }] }));
    setNextKey((n) => n + 1);
  };

  /* AN ACTIVE DEAL LOCKS THE GOAL — AND WHETHER ONE IS ACTIVE IS NOT THIS
     FILE'S JUDGEMENT. The first version of this compared `o.stage` to
     "completed" to grey the control out in advance, which is a second
     implementation of a lifecycle rule the server already owns; the Collector
     surface is held to not doing that, and rightly, because the two would
     disagree on exactly the deals that matter.

     So "Not looking" is always offered, `removeGoal` refuses `goal-locked` if a
     deal holds the Goal, and the refusal is shown as a sentence a person can
     act on — "This card is part of an active deal." The option is visible, it
     is never silently hidden, and nothing here decides what "active" means. */

  /* Everything the person would have to fix before this can be sent. Asked of
     the answers, never of the server's refusals. */
  const localProblem = (() => {
    if (answers.want !== "none") {
      if (!answers.desired.grade) return "Say which copy you're looking for.";
      const bad = incoherent(answers.desired);
      if (bad) return bad;
    }
    for (const draft of answers.copies) {
      if (draft.removed) continue;
      const bad = incoherent(draft);
      if (bad) return bad;
      if (draft.market !== "" && !(Number(draft.market) >= 0)) {
        return "A reference value has to be a number, and not a negative one.";
      }
    }
    return null;
  })();

  const commit = async () => {
    if (saving || localProblem) return;
    setSaving(true); setProblem(null); setDone(null);
    /* The difference, recomputed from whatever the server last said — which on
       a second press is the state the first press left behind. */
    const { steps } = planFrom(state, canonicalCardId, answers);
    const finished = [];
    try {
      for (const step of steps) {
        const answer = await onCommit(step, canonicalCardId);
        if (answer && answer.ok === false) {
          /* STOP. A later step may depend on this one — the Goal that criteria
             would change, the binder an entry would name — and continuing past
             a refusal is how a person ends up with a commit that half means
             something else. */
          setDone(finished);
          setProblem(explain(step, answer.refused, finished));
          setSaving(false);
          return;
        }
        finished.push(step);
      }
      onClose();
    } catch (error) {
      setDone(finished);
      setProblem(finished.length
        ? `MetYet lost contact partway. ${said(finished)} The rest was not saved — `
          + "your answers are still here, and pressing Save again sends only what is left."
        : "MetYet lost contact, so nothing was saved. Your answers are still here.");
      setSaving(false);
    }
  };

  const shown = plan.steps.length;

  return (
    <div className="mcs-spec-sheet" role="dialog" aria-label="Card specification">
      <div className="mcs-spec-panel">
        <div className="mcs-spec-head">
          <div>
            <strong>{text(card && card.cardName) || text(context && context.cardName) || "This card"}</strong>
            <p className="mcs-spec-sub">
              {[text(context && context.expansionName),
                context && context.collectorNumber ? `#${context.collectorNumber}` : null,
                [card && card.printRun, card && card.finish, card && card.language]
                  .filter(Boolean).join(" · ") || null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button className="mcs-go quiet" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </div>

        {/* ------------------------------------------------- ORGANISATION */}
        <section className="mcs-spec-part">
          <h3 className="mcs-spec-ask">Which binders does this card belong in?</h3>
          {binders.length || answers.newBinders.length ? (
            <ul className="mcs-spec-binders">
              {binders.map((b) => (
                <li key={b.id}>
                  <label className="mcs-check">
                    <input type="checkbox" checked={answers.binders.has(b.id)}
                      disabled={saving} onChange={() => toggleBinder(b.id)} />
                    <span>{text(b.name) || "A binder"}</span>
                  </label>
                </li>
              ))}
              {/* A binder named in this session and not yet created. It is an
                  answer, not a record: Cancel forgets it like everything else. */}
              {answers.newBinders.map((name) => (
                <li key={`new:${name}`}>
                  <label className="mcs-check">
                    <input type="checkbox" checked readOnly disabled />
                    <span>{name} <span className="mcs-dim">— new</span></span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mcs-dim">
              You haven&rsquo;t made any binders yet. A binder is your own grouping — it says
              where a card belongs, not that you want it or own it.
            </p>
          )}
          <p className="mcs-spec-new">
            <input className="mcs-in" value={newBinderName} placeholder="New binder…"
              aria-label="New binder name" disabled={saving}
              onChange={(e) => setNewBinderName(e.target.value)} />
            <button className="mcs-go quiet" type="button" disabled={saving || !newBinderName.trim()}
              onClick={addBinder}>Add binder</button>
          </p>
        </section>

        {/* -------------------------------------------------------- WANT */}
        <section className="mcs-spec-part">
          <h3 className="mcs-spec-ask">Are you looking for it?</h3>
          <p className="mcs-spec-wants">
            {WANTS.map((w) => (
              <button key={w.id} type="button"
                className={`mcs-go${answers.want === w.id ? "" : " quiet"}`}
                aria-pressed={answers.want === w.id}
                disabled={saving}
                onClick={() => patch({ want: w.id })}>{w.label}</button>
            ))}
          </p>

          {answers.want !== "none" ? (
            <>
              <p className="mcs-dim">
                {goal && !goal.desired
                  ? "You haven't said which copy you're after."
                  : "Which copy are you after? Your Trusted Partners see this."}
              </p>
              <label className="mcs-field">
                <span>Grade wanted</span>
                <select value={answers.desired.grade} disabled={saving}
                  onChange={(e) => patch({ desired: { grade: e.target.value,
                    condition: isRaw(e.target.value) ? answers.desired.condition : "" } })}>
                  <option value="" disabled>Choose a grade</option>
                  {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              {isRaw(answers.desired.grade) ? (
                <label className="mcs-field">
                  <span>Condition wanted</span>
                  <select value={answers.desired.condition} disabled={saving}
                    onChange={(e) => patch({ desired: { ...answers.desired, condition: e.target.value } })}>
                    <option value="" disabled>Choose a condition</option>
                    {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              ) : null}
            </>
          ) : null}

          {holders ? (
            <p className="mcs-spec-net">
              {holders === 1 ? "1 of your Trusted Partners has this."
                : `${holders} of your Trusted Partners have this.`}
            </p>
          ) : null}
        </section>

        {/* --------------------------------------------------------- OWN */}
        <section className="mcs-spec-part">
          <h3 className="mcs-spec-ask">Do you have one?</h3>
          {answers.copies.length ? (
            <ul className="mcs-spec-copies">
              {answers.copies.map((draft) => {
                const key = draft.id || draft.key;
                const conflict = gradeConflictLine(draft);
                return (
                  <li key={key} className={draft.removed ? "gone" : null}>
                    {draft.removed ? (
                      <p className="mcs-dim">
                        This copy will be removed when you save.
                        {" "}
                        <button className="mcs-linkish" type="button" disabled={saving}
                          onClick={() => setCopy(key, { removed: false })}>Keep it</button>
                      </p>
                    ) : (
                      <>
                        {/* A COPY THAT DISAGREES WITH ITSELF SAYS SO, and cannot
                            be saved until it stops — the server refuses it, and
                            saying which half is true is not something anybody
                            here can know. Both halves are shown; neither is
                            pre-chosen as the survivor. */}
                        {conflict ? (
                          <p className="mcs-spec-conflict" role="note">
                            This copy says {conflict}. Only one of those can be true — choose which.
                          </p>
                        ) : null}
                        {draft.status ? (
                          <p className="mcs-dim">{statusLabel(draft.status)}</p>
                        ) : null}
                        <label className="mcs-field">
                          <span>Grade</span>
                          <select value={draft.grade} disabled={saving}
                            onChange={(e) => setCopy(key, { grade: e.target.value,
                              condition: isRaw(e.target.value) ? draft.condition : "" })}>
                            <option value="">Not stated</option>
                            {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </label>
                        {isRaw(draft.grade) ? (
                          <label className="mcs-field">
                            <span>Condition</span>
                            <select value={draft.condition} disabled={saving}
                              onChange={(e) => setCopy(key, { condition: e.target.value })}>
                              <option value="" disabled>Choose a condition</option>
                              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </label>
                        ) : null}
                        <label className="mcs-field">
                          <span>Certificate</span>
                          <input value={draft.cert} inputMode="numeric" disabled={saving}
                            onChange={(e) => setCopy(key, { cert: e.target.value })} />
                        </label>
                        <label className="mcs-field">
                          <span>Your reference value</span>
                          <input value={draft.market} inputMode="decimal" disabled={saving}
                            onChange={(e) => setCopy(key, { market: e.target.value })} />
                        </label>
                        {/* OWNING IS THE ROW; OFFERING IS THIS BOX. A new copy
                            starts unoffered whatever the others say: parting
                            with a card is a decision, and a decision nobody
                            made is not one to assume. */}
                        <label className="mcs-check">
                          <input type="checkbox" checked={draft.offered} disabled={saving}
                            onChange={(e) => setCopy(key, { offered: e.target.checked })} />
                          <span>I&rsquo;d trade or sell this one</span>
                        </label>
                        {draft.id ? (
                          <p>
                            <button className="mcs-linkish" type="button" disabled={saving}
                              onClick={() => setCopy(key, { removed: true })}>
                              I no longer own this
                            </button>
                          </p>
                        ) : null}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mcs-dim">You haven&rsquo;t recorded a copy of this card.</p>
          )}
          <p>
            <button className="mcs-go quiet" type="button" disabled={saving} onClick={addCopy}>
              I own one of these
            </button>
          </p>
        </section>

        {problem ? <p className="mcs-add-problem" role="alert">{problem}</p> : null}
        {!problem && localProblem ? <p className="mcs-dim">{localProblem}</p> : null}

        <p className="mcs-goal-do">
          <button className="mcs-go" type="button" disabled={saving || !!localProblem || !shown}
            onClick={commit}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="mcs-go quiet" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </p>
      </div>
    </div>
  );
}

/* WHAT HAPPENED, IN BOTH HALVES. A commit that partly worked must never report
   success, and must never report a bare failure either: the person needs to
   know what stands and what does not, because what stands is what they will not
   have to do again. */
const NAMES = {
  "make-binder": "a new binder was made",
  "file": "the card was filed",
  "unfile": "the card was unfiled",
  "wanted-copy": "which copy you want was saved",
  "how-hard": "how hard you're looking was saved",
  "stop-looking": "the goal was removed",
  "start-looking": "the goal was saved",
  "correct-copy": "a copy was corrected",
  "offering": "what you're offering was saved",
  "forget-copy": "a copy was removed",
  "record-copy": "a copy was recorded",
};
const FAILED = {
  "make-binder": "the new binder could not be made",
  "file": "the card could not be filed",
  "unfile": "the card could not be unfiled",
  "wanted-copy": "which copy you want could not be saved",
  "how-hard": "how hard you're looking could not be saved",
  "stop-looking": "the goal could not be removed",
  "start-looking": "the goal could not be saved",
  "correct-copy": "that copy could not be corrected",
  "offering": "what you're offering could not be saved",
  "forget-copy": "that copy could not be removed",
  "record-copy": "that copy could not be recorded",
};
const WHY = {
  "grading-incoherent": "A card cannot be both graded and in a raw condition.",
  "criteria-required": "A goal has to say which copy you're after.",
  "duplicate-goal": "That card is already on your list.",
  "goal-locked": "This card is part of an active deal.",
  "copy-committed": "That copy is committed to a deal.",
  "copy-reserved": "That copy is reserved for a deal.",
  "copy-in-use": "That copy is part of a deal.",
  "name-required": "A binder needs a name.",
  "card-unavailable": "MetYet can no longer use that version of the card.",
  "invalid-amount": "A reference value has to be a number, and not a negative one.",
  "identity-immutable": "That part of a copy cannot be changed.",
};
const said = (finished) => (finished.length
  ? `${finished.map((s) => NAMES[s.kind] || "something was saved")
    .filter((v, i, all) => all.indexOf(v) === i).join(", ")}.`
  : "");
export function explain(step, refused, finished) {
  const why = WHY[refused] || "MetYet would not accept it.";
  const failed = `${FAILED[step.kind] || "something could not be saved"} — ${why}`;
  if (!finished.length) return `Nothing was saved: ${failed}`;
  return `${said(finished)} But ${failed} Your answers are still here, and `
    + "pressing Save again sends only what is left.";
}
