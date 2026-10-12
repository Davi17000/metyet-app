/* ============================================================================
   CARD EDIT — A SAVED GOAL OR COPY, FULL SCREEN (P6-F4 Batch 2B)

   Add once. Refine effortlessly. Opened from Binders on ONE record — a Goal or
   an owned copy, by its own id — this is the Phase 6 card (CardDetail's
   structure and styles) showing that record's SAVED answers, already chosen:

     the version          fixed: a record's printing is its identity, and no
                          existing command changes it (updateCollectorCopy
                          refuses canonicalCardId; Goals have no such field
                          to change). To record a different version, Browse.
     raw or graded        preselected; editable
     condition / grade    preselected; editable (PSA, the domain's only company)
     what it is to you    all four states (P6-F4 B4), chosen as a DRAFT (B4.1),
                          sent as ONE command (B5): changeCollectingState. The
                          record's own pair is the same record; across the pair
                          the server re-makes it as the other kind in one
                          commit — same printing, same binder, its history kept
                          in `formerly` — and this page opens the record that
                          now exists. No sheet, no questions, no second card.
     binder               where it lives, and Batch 2A's one Move
     copy details         certificate and reference value (editable), when it
                          was added, photos and status (as recorded)

   SUBMIT UPDATE (B4.1; was Save changes) is live only while the draft differs
   from the saved record — compared field by field, so a change undone is no
   change. For the record's own fields it sends only what changed, through the existing steps the
   Collector's entrance maps (client/sign-in/SignIn.jsx):
     Goal   wanted-copy → updateGoalCriteria · how-hard → updateGoalTier
     copy   correct-copy → updateCollectorCopy (grade, condition, cert, value
            in ONE patch) · keeping / offering → setCollectorCopyKept / Offered
   one at a time, stopping at the first refusal, and says exactly what was
   saved and what was not. Nothing is claimed before the server answers.

   Changing one answer clears only what can no longer be true: Raw ↔ Graded
   clears the condition or grade — never the state, never the binder.

   Stop looking / I no longer own this: a quiet link, then a confirmation, then
   removeGoal / removeCollectorCopy (stop-looking / forget-copy).
   ========================================================================== */
import React, { useEffect, useRef, useState } from "react";
import CardArt from "../card-art.jsx";
import { text, day, photoNote, statusLabel, isGraded, gradeConflictLine } from "./present.js";
import { explain } from "./CardSpecification.jsx";
import { versionLabel, GRADES, CONDITIONS, Choice, Section } from "./CardDetail.jsx";
import { STATE_STYLE } from "./states.jsx";

/* WHAT IS SAVED, read off the record — never inferred from the card. */
export function savedOf(kind, thing) {
  const t = thing || {};
  const grading = kind === "goal" ? (t.desired || {}) : t;
  const grade = typeof grading.grade === "string" && grading.grade ? grading.grade : null;
  return {
    kind: grade === "Raw" ? "raw" : grade ? "graded" : null,
    condition: grade === "Raw" && grading.condition ? grading.condition : null,
    grade: grade && grade !== "Raw" ? grade : null,
    tier: kind === "goal" ? (t.tier === "primary" || t.tier === "secondary" ? t.tier : null) : null,
    disposition: kind === "copy" ? (t.offered === true ? "trade" : t.keeping === true ? "pc" : null) : null,
    cert: kind === "copy" ? (t.cert == null ? "" : String(t.cert)) : "",
    market: kind === "copy" ? (t.market == null ? "" : String(t.market)) : "",
  };
}

/* THE STEPS FOR WHAT CHANGED — and nothing else. */
export function changesFor(kind, thing, a) {
  const was = savedOf(kind, thing);
  const steps = [];
  const physical = (x) => (x.kind === "raw" ? { grade: "Raw", condition: x.condition }
    : x.kind === "graded" ? { grade: x.grade, condition: null } : null);
  const physChanged = a.kind !== was.kind || a.condition !== was.condition || a.grade !== was.grade;
  if (kind === "goal") {
    if (physChanged && physical(a)) {
      const p = physical(a);
      steps.push({ kind: "wanted-copy", goalId: thing.id, desired: p.grade === "Raw" ? p : { grade: p.grade } });
    }
    if (a.tier && a.tier !== was.tier) steps.push({ kind: "how-hard", goalId: thing.id, tier: a.tier });
  } else {
    const patch = {};
    if (physChanged && physical(a)) Object.assign(patch, physical(a));
    if (text(a.cert) !== text(was.cert)) patch.cert = text(a.cert) || null;
    if (text(a.market) !== text(was.market)) patch.market = text(a.market) == null ? null : Number(text(a.market));
    if (Object.keys(patch).length) steps.push({ kind: "correct-copy", copyId: thing.id, patch });
    if (a.disposition && a.disposition !== was.disposition) {
      steps.push(a.disposition === "pc" ? { kind: "keeping", copyId: thing.id, keeping: true }
        : { kind: "offering", copyId: thing.id, offered: true });
    }
  }
  return steps;
}

/* What a change can no longer leave true (Raw ↔ Graded clears the other
   one's detail) — and only that. */
const EDIT_CLEARS = { kind: { condition: null, grade: null } };

const STALE = new Set(["not-found", "copy-unavailable", "binder-archived"]);
const SAVED_WORDS = {
  "wanted-copy": "what you're looking for", "how-hard": "how important it is",
  "correct-copy": "this copy's details", keeping: "Personal collection", offering: "Trade / Sell",
  "change-state": "what it means to you",
};
/* WHY A STATE CHANGE WAS REFUSED (P6-F4 B5), in the Collector's words. The
   card goes back to its saved state; nothing changed. */
const STATE_WHY = {
  "goal-locked": "This card is part of an active deal, so it stays as it is until the deal ends.",
  "copy-reserved": "This copy is part of a deal, so it stays in your collection.",
  "copy-committed": "This copy is part of a deal, so it stays in your collection.",
  "copy-in-use": "This copy is part of a deal's record, so MetYet keeps it as a copy.",
  "partner-interest": "A Trusted Partner is interested in this copy, so MetYet won't turn it into a Goal. It can be PC or Trade / Sell.",
  "duplicate-goal": "You already have a Goal for this version, so MetYet won't make a second one.",
  "criteria-required": "Add this copy's grade first (and its condition, if it's Raw), so the Goal knows what to look for.",
  "grading-incoherent": "This copy's grade and condition disagree. Correct them first.",
  "state-changed": "This card was updated elsewhere. The latest is shown — choose again.",
  "not-found": "This card changed elsewhere. The latest is shown.",
  "state-change-unsupported": "MetYet can't change this older card's state yet.",
  "lineage-full": "This card's history is full, so MetYet won't change its state again.",
};
const STATE_STALE = new Set(["state-changed", "not-found"]);

export default function CardEdit({ kind, thing, known, homeName = null, homeAway = false, onClose,
  onSave = null, onMove = null, busy = false, onRemoved = null, onRefresh = null,
  state = null, onOpenRecord = null, onHold = null, arrived = null }) {
  const saved = savedOf(kind, thing);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const [ack, setAck] = useState(arrived);        // what the server just confirmed (a state change lands here)
  const [problem, setProblem] = useState(null);
  const [removing, setRemoving] = useState(false); // the confirmation is open
  const sending = useRef(false);
  const alive = useRef(true);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => {
    if (typeof window === "undefined" || !window.addEventListener) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const a = { ...saved, ...edits };
  const set = (field, value) => {
    if (a[field] === value) return;
    setProblem(null); setAck(null);
    setEdits((x) => ({ ...x, [field]: value, ...(EDIT_CLEARS[field] || {}) }));
  };
  /* THE STEPS: the record's own fields as before (never its state), then —
     last — the state, as one changeCollectingState. */
  const savedState = kind === "goal" ? saved.tier : saved.disposition;
  const meaning = a.meaning || savedState;
  const recordSteps = changesFor(kind, thing, { ...a, tier: saved.tier, disposition: saved.disposition });
  const stateStep = meaning && meaning !== savedState
    ? { kind: "change-state", ...(kind === "goal" ? { goalId: thing.id } : { collectorCopyId: thing.id }), from: savedState, to: meaning }
    : null;
  const steps = stateStep ? [...recordSteps, stateStep] : recordSteps;
  const crossing = Boolean(stateStep) && ((meaning === "primary" || meaning === "secondary") !== (kind === "goal"));
  const physicalMissing = (a.kind === "raw" && !a.condition && (a.kind !== saved.kind || "condition" in edits))
    || (a.kind === "graded" && !a.grade && (a.kind !== saved.kind || "grade" in edits));
  const marketBad = kind === "copy" && text(a.market) !== "" && text(a.market) != null && !(Number(text(a.market)) >= 0);
  const ready = Boolean(onSave) && !saving && !busy && steps.length > 0 && !physicalMissing && !marketBad;
  /* Choosing the saved state again is no change at all. */
  const choose = (m) => {
    setProblem(null); setAck(null);
    setEdits((x) => { const { meaning: _m, ...rest } = x; return m === savedState ? rest : { ...rest, meaning: m }; });
  };
  const keyOf = (v) => `${v.kind === "goal" ? "g" : "c"}:${v.id}`;
  /* ONE QUIET ACKNOWLEDGEMENT, whichever kind of record the state lives on (B5.2) */
  const STATE_SAID = (to) => `Saved — ${STATE_STYLE[to] ? STATE_STYLE[to].label : to}.`;
  /* After a lost answer: did the change land? The record itself, or the one
     whose lineage names it, in the state asked for. */
  const landed = (step) => {
    const w = stateRef.current || {};
    const all = [...(w.goals || []).map((g) => ["goal", g]), ...(w.collectorCopies || []).map((c) => ["copy", c])];
    const st = (k, r) => (k === "goal" ? r.tier : r.offered === true ? "trade" : r.keeping === true ? "pc" : null);
    const self = all.find(([k, r]) => k === kind && r.id === thing.id);
    if (self) return st(self[0], self[1]) === step.to ? { id: thing.id, kind } : null;
    const heir = all.find(([, r]) => Array.isArray(r.formerly) && r.formerly.some((f) => f && f.kind === kind && f.id === thing.id));
    return heir && st(heir[0], heir[1]) === step.to ? { id: heir[1].id, kind: heir[0] } : null;
  };
  const arrive = async (v, step) => {
    /* the same record: said here. Another record: re-read, then open it. */
    if (v.id === thing.id) { setEdits({}); setAck(STATE_SAID(step.to)); return; }
    if (onRefresh) { try { await onRefresh(); } catch (e) { /* the page opens on what it has */ } }
    if (onOpenRecord) onOpenRecord(keyOf(v), STATE_SAID(step.to));
  };
  const sendState = async (step, finished) => {
    if (crossing && onHold) onHold(true);   // this page stays while its record is re-made
    let answer;
    try { answer = await onSave(step, thing.canonicalCardId || null); }
    catch (error) {
      if (onRefresh) { try { await onRefresh(); } catch (e) { /* said below */ } }
      await new Promise((d) => setTimeout(d, 0));
      if (!alive.current) return;
      const got = landed(step);
      if (got) { await arrive(got, step); return; }
      if (onHold) onHold(false);
      setEdits((x) => { const { meaning: _m, ...rest } = x; return finished.length ? {} : rest; });
      setProblem("MetYet lost contact, and the change didn't happen. The latest is shown.");
      return;
    }
    if (!alive.current) return;
    if (answer && answer.ok === false) {
      if (onHold) onHold(false);
      setEdits((x) => { const { meaning: _m, ...rest } = x; return finished.length ? {} : rest; });
      setProblem(`${finished.length ? `${finished.map((s) => SAVED_WORDS[s.kind]).join(", ")} saved. ` : ""}${STATE_WHY[answer.refused] || "MetYet would not change it."}`);
      if (STATE_STALE.has(answer.refused) && onRefresh) { try { await onRefresh(); } catch (e) { /* said already */ } }
      return;
    }
    const v = answer && answer.value && typeof answer.value === "object" ? answer.value : { id: thing.id, kind };
    await arrive(v, step);
  };
  const submit = () => save();

  const save = async () => {
    if (!ready || sending.current) return;
    sending.current = true; setSaving(true); setProblem(null); setAck(null);
    const finished = [];
    try {
      for (const step of steps) {
        if (step.kind === "change-state") { await sendState(step, finished); return; }
        const answer = await onSave(step, thing.canonicalCardId || null);
        if (!alive.current) return;
        if (answer && answer.ok === false) {
          setProblem(explain(step, answer.refused, finished));
          if (finished.length) setEdits({});
          /* the screen may be out of date: look again (as the sheet did) */
          if (STALE.has(answer.refused) && onRefresh) { try { await onRefresh(); } catch (e) { /* said already */ } }
          return;
        }
        finished.push(step);
      }
      setEdits({});
      setAck(`Saved — ${finished.map((s) => SAVED_WORDS[s.kind]).filter((v, i, all) => all.indexOf(v) === i).join(", ")}.`);
    } catch (error) {
      if (!alive.current) return;
      setProblem(finished.length
        ? `MetYet lost contact partway: ${finished.map((s) => SAVED_WORDS[s.kind]).join(", ")} saved; the rest may not have been. The latest is shown — check before trying again.`
        : "MetYet lost contact, so it can't tell whether that saved. The latest is shown — check before trying again.");
      setEdits({});
      if (onRefresh) { try { await onRefresh(); } catch (e) { /* said already */ } }
    } finally {
      sending.current = false;
      if (alive.current) setSaving(false);
    }
  };

  const remove = async () => {
    if (!onSave || sending.current) return;
    sending.current = true; setSaving(true); setProblem(null);
    const step = kind === "goal" ? { kind: "stop-looking", goalId: thing.id } : { kind: "forget-copy", copyId: thing.id };
    try {
      const answer = await onSave(step, thing.canonicalCardId || null);
      if (!alive.current) return;
      if (answer && answer.ok === false) { setProblem(explain(step, answer.refused, [])); setRemoving(false); return; }
      if (onRemoved) onRemoved(kind === "goal" ? `Stopped looking for ${name}.` : `Removed this copy of ${name}.`);
    } catch (error) {
      if (alive.current) setProblem("MetYet lost contact, so it can't tell whether that was removed. The latest is shown.");
      if (onRefresh) { try { await onRefresh(); } catch (e) { /* said already */ } }
    } finally {
      sending.current = false;
      if (alive.current) setSaving(false);
    }
  };

  const name = text(known && known.cardName) || "This card";
  const number = text(known && known.collectorNumber);
  const ident = [text(known && known.expansionName), number, text(known && known.artist)].filter(Boolean).join(" · ");
  const version = known && known.finish ? versionLabel(known) : null;
  const imageShown = known ? known.imageLarge || known.imageSmall || null : null;
  const FOUR = ["primary", "secondary", "pc", "trade"];
  /* The shared language (states.jsx): its labels; its messages, with the
     Secondary sentence the founder approved for this page. */
  const TITLE = Object.fromEntries(Object.entries(STATE_STYLE).map(([k, st]) => [k, st.label]));
  const SUB = { ...Object.fromEntries(Object.entries(STATE_STYLE).map(([k, st]) => [k, st.message])),
    secondary: "I'm interested in this card." };
  const copy = kind === "copy" ? thing : null;
  /* ITS HISTORY (P6-F4 B5; B5.2). A state change carries the grade and
     condition, so nothing is asked after one. What a Goal cannot hold — an
     earlier copy's certificate and reference value — stays in the lineage
     and is offered quietly where those fields live: in Copy details, as a
     recovery, filling the draft only. */
  const lineage = Array.isArray(thing && thing.formerly) ? thing.formerly : [];
  const lastOf = (k) => [...lineage].reverse().find((f) => f && f.kind === k && f.facts) || null;
  const wasCopy = lastOf("copy");
  const earlier = wasCopy ? wasCopy.facts : null;
  const keptLine = earlier ? [earlier.cert ? `Cert ${earlier.cert}` : null,
    earlier.market != null ? `$${earlier.market}` : null, photoNote(earlier.photos)].filter(Boolean).join(" · ") : "";
  const restorable = kind === "copy" && earlier && ((earlier.cert && !text(saved.cert)) || (earlier.market != null && !text(saved.market)));
  const restore = () => {
    setProblem(null); setAck(null);
    setEdits((x) => ({ ...x, ...(earlier.cert && !text(saved.cert) ? { cert: String(earlier.cert) } : {}),
      ...(earlier.market != null && !text(saved.market) ? { market: String(earlier.market) } : {}) }));
  };

  return (
    <div className="mcs-cd mcs-ce" role="dialog" aria-modal="true" aria-label={`Your ${kind === "goal" ? "Goal" : "copy"}: ${name}`}>
      <header className="mcs-cd-hd">
        <button type="button" className="mcs-cd-back" onClick={onClose}>‹ Binders</button>
      </header>
      <div className="mcs-cd-scroll">
        <div className="mcs-cd-hero">
          <span className="mcs-cd-frame">
            <CardArt src={imageShown} name={name} wrap="mcs-cd-art hero" plate="mcs-art-plate" decorative
              card={{ key: known && known.cardContextId, set: known && known.expansionName, number }} />
          </span>
        </div>
        <div className="mcs-cd-ident">
          <h2>{name}</h2>
          {ident ? <p>{ident}</p> : null}
        </div>

        {/* WHAT IT MEANS — FIRST, AND IN REACH (P6-F4 B2B.1). On a phone this sat
            below the version and a ten-button grade grid, beneath the fold
            (y 848 on an 844-pt screen); it is the change a Collector makes most,
            so it comes straight after the card, both choices side by side. */}
        <Section id="state" title="What does this card mean to you?">
          <div className="mcs-ce-pair mcs-ce-four" role="group" aria-label="What does this card mean to you?">
            {FOUR.map((m) => (
              <Choice key={m} st={m} on={meaning === m} title={TITLE[m]} sub={SUB[m]} disabled={saving} onClick={() => choose(m)} />))}
          </div>
        </Section>

        <Section id="print" title="Version">
          <p className="mcs-cd-established">{version ? `${version} — the version you saved.` : "The version you saved."}
            {" "}To record a different version, add it from Browse.</p>
        </Section>

        <Section id="kind" title="Raw or graded?">
          <div className="mcs-cd-row">
            <Choice on={a.kind === "raw"} title="Raw" onClick={() => set("kind", "raw")} disabled={saving} />
            <Choice on={a.kind === "graded"} title="Graded" onClick={() => set("kind", "graded")} disabled={saving} />
          </div>
        </Section>
        {/* A COPY THAT DISAGREES WITH ITSELF SAYS SO (C3.3) — kept from the sheet */}
        {copy && gradeConflictLine(copy) && !edits.kind ? <p className="mcs-oconflict">{`Says ${gradeConflictLine(copy)}`}</p> : null}
        {a.kind === "raw" ? (
          <Section id="condition" title="In what condition?">
            <div className="mcs-cd-wrap">{CONDITIONS.map((c) => <Choice key={c} on={a.condition === c} title={c} disabled={saving} onClick={() => set("condition", c)} />)}</div>
          </Section>
        ) : null}
        {a.kind === "graded" ? (
          <Section id="grade" title="Which grade?">
            <div className="mcs-cd-wrap">{GRADES.map((g) => <Choice key={g} on={a.grade === g} title={g} disabled={saving} onClick={() => set("grade", g)} />)}</div>
          </Section>
        ) : null}

        <Section id="home" title="Binder">
          <div className="mcs-ce-home">
            <b>{homeName ? `In ${homeName}${homeAway ? " (put away)" : ""}` : "Unfiled"}</b>
            {onMove ? <button type="button" className="mcs-go" disabled={saving || busy} aria-haspopup="dialog" onClick={onMove}>Move</button> : null}
          </div>
        </Section>

        {kind === "goal" && keptLine ? (
          <p className="mcs-ce-history">{`From your copy: ${keptLine} — kept with this card.`}</p>
        ) : null}
        {copy ? (
          <Section id="details" title="Copy details">
            <label className="mcs-ce-field"><span>{isGraded(copy) ? "Certificate" : "Serial"}</span>
              <input className="mcs-in" value={a.cert} disabled={saving} onChange={(e) => set("cert", e.target.value)} /></label>
            <label className="mcs-ce-field"><span>Your reference value</span>
              <input className="mcs-in" inputMode="decimal" value={a.market} disabled={saving} onChange={(e) => set("market", e.target.value)} /></label>
            {marketBad ? <p className="mcs-add-problem">A reference value has to be a number, and not a negative one.</p> : null}
            {restorable ? (
              <p className="mcs-ce-restore"><span>{`From this card's history: ${keptLine}.`}</span>
                <button type="button" className="mcs-linkish" disabled={saving} onClick={restore}>Restore</button></p>
            ) : null}
            <p className="mcs-ce-facts">
              {[copy.addedAt ? `Added ${day(copy.addedAt)}` : null, photoNote(copy.photos), statusLabel(copy.status)].filter(Boolean).join(" · ")}
            </p>
          </Section>
        ) : null}

        <div className="mcs-ce-remove">
          {!removing ? (
            <button type="button" className="mcs-linkish" disabled={saving} onClick={() => setRemoving(true)}>
              {kind === "goal" ? "Stop looking for this" : "I no longer own this"}</button>
          ) : (
            <div className="mcs-ce-confirm" role="group" aria-label="Are you sure?">
              <p>{kind === "goal" ? `Stop looking for ${name}? Your Trusted Partners will no longer see it.` : `Remove this copy of ${name} from MetYet?`}</p>
              <button type="button" className="mcs-go" disabled={saving} onClick={remove}>{kind === "goal" ? "Stop looking" : "Remove it"}</button>
              <button type="button" className="mcs-go quiet" disabled={saving} onClick={() => setRemoving(false)}>Keep it</button>
            </div>
          )}
        </div>
        <div className="mcs-cd-spacer" />
      </div>

      <div className="mcs-cd-dock">
        {problem ? <p className="mcs-cd-hint problem" role="alert">{problem}</p>
          : ack ? <p className="mcs-cd-hint ack" role="status">{`✓ ${ack}`}</p>
            : physicalMissing ? <p className="mcs-cd-hint">{a.kind === "raw" ? "What condition is it?" : "Which grade is it?"}</p>
                  : !steps.length ? <p className="mcs-cd-hint quiet">Change anything above, then submit.</p> : null}
        <button type="button" className={`mcs-cd-add${ready ? " ready" : ""}`} aria-disabled={!ready} aria-busy={saving}
          onClick={submit}>{saving ? "Saving…" : "Submit update"}</button>
      </div>
    </div>
  );
}

