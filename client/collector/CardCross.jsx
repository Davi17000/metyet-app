/* ============================================================================
   CARD CROSS — FROM A GOAL TO A COPY, OR A COPY TO A GOAL (P6-F4 Batch 4)

   The four states describe collecting intent. Goals and owned copies remain
   distinct production records. So choosing PC or Trade / Sell on a Goal — or
   Primary or Secondary on a copy — is not an edit: it ADDS the other record,
   through the commands Browse already uses, and asks what should happen to
   the one already there. Nothing is sent until the Collector confirms.

     Goal → owned    "Do you own this card now?"
       record-copy   addCollectorCopy, on the Goal's exact printing; the
                     Goal's wanted grade is offered, never assumed
       file-object   the copy the create returned, into the chosen binder
       stop-looking  removeGoal — only if asked, and only after the copy is
                     confirmed; a refusal (an active deal) keeps the Goal
     owned → Goal    "Looking for another copy?"
       start-looking addGoal, on the copy's exact printing
       file-object   the Goal the create returned
       — and if a Goal for this version exists, none is made: the Collector
         may open it, or change ITS priority (how-hard → updateGoalTier)

   Each step is its own command and is reported as its own result. A create
   whose answer was lost is looked up (re-read), never resent; Retry filing
   files the same id and never re-creates; nothing is replayed blindly.
   ========================================================================== */
import React, { useEffect, useRef, useState } from "react";
import { text } from "./present.js";
import { explain } from "./CardSpecification.jsx";
import { GRADES, CONDITIONS, Choice, Section } from "./CardDetail.jsx";
import { STATE_STYLE, StateChip } from "./states.jsx";
import { savedOf } from "./CardEdit.jsx";

const rows = (x) => (Array.isArray(x) ? x : []);
const ADD_WORDS = { pc: "Add to Personal Collection", trade: "Add to Trade / Sell",
  primary: "Create Primary Goal", secondary: "Create Secondary Goal" };
const DONE_WORDS = { pc: "Added to Personal Collection", trade: "Added to Trade / Sell",
  primary: "Primary Goal created", secondary: "Secondary Goal created" };
const physicalLine = (x) => (x.kind === "raw" ? `Raw · ${x.condition}` : x.kind === "graded" ? x.grade : null);
const LIVE_TO = (ms) => new Promise((d) => setTimeout(d, ms));

export default function CardCross({ from, thing, target, name, ident, version, art = null, homeId = null, homeName = null,
  homeAway = false, state, onSave, onRefresh = null, onBack, onClose, onOpenRecord = null, onHold = null }) {
  const toCopy = from === "goal";
  const canonical = thing.canonicalCardId || null;
  const saved = savedOf(from, thing);
  const [a, setA] = useState({ kind: saved.kind, condition: saved.condition, grade: saved.grade, target,
    dest: homeId && !homeAway ? homeId : null, keepGoal: true });
  const [made, setMade] = useState(null);         // { id, before } — confirmed by the server
  const [filed, setFiled] = useState(null);       // true · "skipped" · { failed }
  const [goalEnd, setGoalEnd] = useState(null);   // "kept" · "removed" · { refused }
  const [problem, setProblem] = useState(null);
  const [working, setWorking] = useState(false);
  const [retiered, setRetiered] = useState(null); // an existing Goal's priority, changed on purpose
  const sending = useRef(false);
  const alive = useRef(true);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => () => { alive.current = false; }, []);

  /* A GOAL FOR THIS VERSION ALREADY? Then none is made (duplicate-goal). */
  const existing = !toCopy && canonical
    ? rows(state && state.goals).find((g) => g.canonicalCardId === canonical) || null : null;
  const destName = a.dest ? homeName : null;
  const physical = physicalLine(a);
  const ready = Boolean(onSave) && Boolean(canonical) && Boolean(physical) && !working && !made;
  const done = made && (filed === true || filed === "skipped") && (toCopy ? goalEnd !== null : true);
  const what = toCopy ? "copy" : "Goal";
  const set = (field, value) => { if (made) return; setProblem(null);
    setA((x) => ({ ...x, [field]: value, ...(field === "kind" ? { condition: null, grade: null } : {}) })); };

  const step = () => {
    if (toCopy) {
      const facts = a.kind === "raw" ? { grade: "Raw", condition: a.condition } : { grade: a.grade, condition: null };
      return { kind: "record-copy", copy: { ...facts, offered: a.target === "trade", keeping: a.target === "pc" } };
    }
    return { kind: "start-looking", tier: a.target,
      desired: a.kind === "raw" ? { grade: "Raw", condition: a.condition } : { grade: a.grade } };
  };
  const refresh = async () => { if (onRefresh) { try { await onRefresh(); } catch (e) { /* said below */ } await LIVE_TO(0); } };
  /* A LOST ANSWER: the record this create would have made, if exactly one appeared. */
  const lookUp = (before) => {
    const key = toCopy ? "collectorCopies" : "goals";
    const was = new Set(rows(before && before[key]).map((x) => x.id));
    const now = rows(stateRef.current && stateRef.current[key]).filter((x) => x.canonicalCardId === canonical && !was.has(x.id));
    return now.length === 1 ? { id: now[0].id } : now.length > 1 ? { many: true } : null;
  };
  const homeOf = (id) => rows(stateRef.current && stateRef.current.binderMemberships)
    .find((m) => (toCopy ? m.collectorCopyId : m.goalId) === id) || null;

  const fileIt = async (id) => {
    if (!a.dest) { setFiled("skipped"); return true; }
    const fileStep = { kind: "file-object", binderId: a.dest, ...(toCopy ? { collectorCopyId: id } : { goalId: id }) };
    let answer;
    try { answer = await onSave(fileStep, canonical); } catch (e) { answer = { ok: false, refused: "lost-contact" }; }
    if (!alive.current) return false;
    if (answer && answer.ok === false) {
      setFiled({ failed: answer.refused });
      setProblem(`Your new ${what} is saved — but it couldn't go into ${destName}: `
        + (answer.refused === "lost-contact" ? "MetYet lost contact. It may be there already; Retry filing checks."
          : answer.refused === "binder-archived" ? "that binder has been put away. It's Unfiled."
            : "MetYet would not file it. It's Unfiled."));
      return false;
    }
    setFiled(true);
    return true;
  };
  const endGoal = async () => {
    if (!toCopy) return;
    if (a.keepGoal) { setGoalEnd("kept"); return; }
    const stop = { kind: "stop-looking", goalId: thing.id };
    if (onHold) onHold(true);   // this page stays while its Goal goes
    let answer;
    try { answer = await onSave(stop, canonical); }
    catch (e) {
      /* NOT KNOWN: look, don't resend */
      await refresh();
      if (!alive.current) return;
      const still = rows(stateRef.current && stateRef.current.goals).some((g) => g.id === thing.id);
      setGoalEnd(still ? { refused: "lost-contact" } : "removed");
      return;
    }
    if (!alive.current) return;
    setGoalEnd(answer && answer.ok === false ? { refused: answer.refused } : "removed");
  };

  /* ONE CONFIRM: create → file → (stop looking). Each result as it is. */
  const go = async () => {
    if (!ready || sending.current) return;
    sending.current = true; setWorking(true); setProblem(null);
    const before = stateRef.current;
    const s = step();
    try {
      let answer;
      try { answer = await onSave(s, canonical); }
      catch (error) {
        await refresh();
        if (!alive.current) return;
        const found = lookUp(before);
        if (!found || found.many) {
          setProblem(found ? "MetYet lost contact. Check Binders before trying again — this may have been saved."
            : "MetYet lost contact, and nothing was saved. Your answers are still here.");
          return;
        }
        answer = { ok: true, value: found.id };
      }
      if (!alive.current) return;
      if (answer && answer.ok === false) {
        setProblem(explain(s, answer.refused, []));
        if (answer.refused === "duplicate-goal") await refresh();
        return;
      }
      let id = answer && typeof answer.value === "string" && answer.value ? answer.value : null;
      if (!id) { await refresh(); const found = lookUp(before); id = found && found.id ? found.id : null; }
      if (!id) { setProblem(`Your new ${what} is saved, but MetYet can't tell which one it is — check Binders before filing it.`); setMade({ id: null, before }); setFiled("skipped"); setGoalEnd("kept"); return; }
      setMade({ id, before });
      if (await fileIt(id)) await endGoal();
    } finally {
      sending.current = false;
      if (alive.current) setWorking(false);
    }
  };
  /* RETRY FILING: the same record, the filing only — never the create. */
  const retryFiling = async () => {
    if (!made || !made.id || sending.current) return;
    sending.current = true; setWorking(true); setProblem(null);
    try {
      await refresh();
      if (!alive.current) return;
      const home = homeOf(made.id);
      const ok = home && home.binderId === a.dest ? (setFiled(true), true) : await fileIt(made.id);
      if (ok) await endGoal();
    } finally {
      sending.current = false;
      if (alive.current) setWorking(false);
    }
  };
  const leaveUnfiled = async () => {
    if (sending.current) return;
    sending.current = true; setWorking(true); setProblem(null); setFiled("skipped");
    try { await endGoal(); } finally { sending.current = false; if (alive.current) setWorking(false); }
  };
  /* AN EXISTING GOAL'S PRIORITY — only when the Collector asks for it. */
  const retier = async () => {
    if (!existing || sending.current || !onSave) return;
    sending.current = true; setWorking(true); setProblem(null);
    const s = { kind: "how-hard", goalId: existing.id, tier: a.target };
    try {
      const answer = await onSave(s, canonical);
      if (!alive.current) return;
      if (answer && answer.ok === false) { setProblem(explain(s, answer.refused, [])); return; }
      setRetiered(a.target);
    } catch (e) {
      if (alive.current) setProblem("MetYet lost contact, so it can't tell whether that saved. The latest is shown.");
      await refresh();
    } finally { sending.current = false; if (alive.current) setWorking(false); }
  };

  const STATES = toCopy ? ["pc", "trade"] : ["primary", "secondary"];
  const head = toCopy ? "Do you own this card now?" : existing && !made ? "You already have a Goal for this version" : "Looking for another copy?";
  const newLine = [physical, version, made && filed === true ? `in ${destName}` : made ? "Unfiled" : null].filter(Boolean).join(" · ");

  const sourceLine = () => {
    if (!toCopy) return "Your copy stays in your collection.";
    if (goalEnd === "removed") return "You've stopped looking for this card.";
    if (goalEnd && goalEnd.refused) return goalEnd.refused === "lost-contact"
      ? "MetYet lost contact while stopping your Goal. It's still there — you can stop looking from its page."
      : `Your Goal stays: ${explain({ kind: "stop-looking" }, goalEnd.refused, []).replace(/^Nothing was saved: the goal could not be removed — /, "")}`;
    return "Your Goal stays — you're still looking for another copy.";
  };

  /* ----------------------------------------------------------- the view */
  let body;
  if (done) {
    body = (
      <div className="mcs-cx-done" role="status">
        <p className="mcs-cx-ok"><StateChip kind={a.target} label={STATE_STYLE[a.target].label} /> <b>{`✓ ${DONE_WORDS[a.target]}`}</b></p>
        <p className="mcs-cx-line">{`${name} · ${newLine}`}</p>
        <p className={`mcs-cx-line${goalEnd && goalEnd.refused ? " warn" : ""}`}>{sourceLine()}</p>
        <div className="mcs-cx-acts">
          {made.id && onOpenRecord ? <button type="button" className="mcs-go" onClick={() => onOpenRecord(`${toCopy ? "c" : "g"}:${made.id}`)}>{`Open the new ${what}`}</button> : null}
          {goalEnd !== "removed" ? <button type="button" className="mcs-go quiet" onClick={onBack}>{`Back to the ${toCopy ? "Goal" : "copy"}`}</button> : null}
          <button type="button" className="mcs-linkish" onClick={onClose}>{homeName ? `Back to ${homeName}` : "Back to Binders"}</button>
        </div>
      </div>
    );
  } else if (existing && !made) {
    const tier = retiered || existing.tier;
    body = (
      <>
        <p className="mcs-cx-lede">{`You're already looking for this version of ${name}, so MetYet won't start a second Goal. Your copy stays in your collection.`}</p>
        <div className="mcs-cx-rec">
          <StateChip kind={tier} label={STATE_STYLE[tier] ? STATE_STYLE[tier].label : "Goal"} />
          <span>{[physicalLine(savedOf("goal", existing)), version].filter(Boolean).join(" · ") || version}</span>
        </div>
        {retiered ? <p className="mcs-cx-line" role="status">{`✓ Your Goal is now ${STATE_STYLE[retiered].label}.`}</p> : null}
        <div className="mcs-cx-acts">
          {onOpenRecord ? <button type="button" className="mcs-go" onClick={() => onOpenRecord(`g:${existing.id}`)}>Open that Goal</button> : null}
          {tier !== a.target && STATE_STYLE[a.target] ? (
            <button type="button" className="mcs-go quiet" disabled={working} onClick={retier}>{`Make it ${STATE_STYLE[a.target].label}`}</button>
          ) : null}
        </div>
      </>
    );
  } else {
    body = (
      <>
        <p className="mcs-cx-lede">{toCopy ? "MetYet will add an owned copy using this card's saved version and configuration."
          : "MetYet will create a collecting Goal for this card. Your owned copy will stay in your collection."}</p>
        <div className="mcs-cx-rec"><span className="mcs-cx-k">Version</span><span>{version || "The version you saved"} — the same printing</span></div>
        <Section id="cx-state" title={toCopy ? "Add it as" : "How important is it?"}>
          <div className="mcs-cd-row" role="group" aria-label={toCopy ? "Add it as" : "How important is it?"}>
            {STATES.map((m) => <Choice key={m} st={m} on={a.target === m} title={STATE_STYLE[m].label} disabled={working || !!made} onClick={() => set("target", m)} />)}
          </div>
        </Section>
        <Section id="cx-kind" title={toCopy ? "The copy you have: raw or graded?" : "The copy you want: raw or graded?"}>
          {toCopy && saved.kind ? <p className="mcs-cx-hint">From what you were looking for — change it to match the copy you have.</p> : null}
          <div className="mcs-cd-row">
            <Choice on={a.kind === "raw"} title="Raw" disabled={working || !!made} onClick={() => set("kind", "raw")} />
            <Choice on={a.kind === "graded"} title="Graded" disabled={working || !!made} onClick={() => set("kind", "graded")} />
          </div>
        </Section>
        {a.kind === "raw" ? (
          <Section id="cx-condition" title="In what condition?">
            <div className="mcs-cd-wrap">{CONDITIONS.map((c) => <Choice key={c} on={a.condition === c} title={c} disabled={working || !!made} onClick={() => set("condition", c)} />)}</div>
          </Section>
        ) : null}
        {a.kind === "graded" ? (
          <Section id="cx-grade" title="Which grade?">
            <div className="mcs-cd-wrap">{GRADES.map((g) => <Choice key={g} on={a.grade === g} title={g} disabled={working || !!made} onClick={() => set("grade", g)} />)}</div>
          </Section>
        ) : null}
        <Section id="cx-dest" title={`Where the new ${what} goes`}>
          <div className="mcs-cd-row">
            {homeId && !homeAway ? <Choice on={a.dest === homeId} title={homeName} sub="Same binder" disabled={working || !!made} onClick={() => set("dest", homeId)} /> : null}
            <Choice on={!a.dest} title="Unfiled" sub="File it later" disabled={working || !!made} onClick={() => set("dest", null)} />
          </div>
          <p className="mcs-cx-hint">{`This ${toCopy ? "Goal" : "copy"} stays ${homeName ? `in ${homeName}` : "where it is"}.`}</p>
        </Section>
        {toCopy ? (
          <Section id="cx-goal" title="And this Goal?">
            <div className="mcs-cd-row mcs-cx-goal">
              <Choice on={a.keepGoal} title="Keep this Goal" sub="I'm still looking for another copy." disabled={working || !!made} onClick={() => set("keepGoal", true)} />
              <Choice on={!a.keepGoal} title="Stop looking for this card" sub="I've found what I wanted." disabled={working || !!made} onClick={() => set("keepGoal", false)} />
            </div>
          </Section>
        ) : null}
        <div className="mcs-cd-spacer" />
      </>
    );
  }

  const unfiledNow = filed && filed.failed;
  return (
    <div className="mcs-cd mcs-ce mcs-cx" role="dialog" aria-modal="true" aria-label={head}>
      <header className="mcs-cd-hd">
        <button type="button" className="mcs-cd-back" disabled={working} onClick={made ? onClose : onBack}>{made ? "‹ Binders" : "‹ Back"}</button>
      </header>
      <div className="mcs-cd-scroll">
        <div className={`mcs-cx-hd${done ? " done" : ""}`}>
          {art ? <span className="mcs-cx-art">{art}</span> : null}
          <div className="mcs-cd-ident">
            <h2>{done ? name : head}</h2>
            <p>{(done ? [ident] : [name, ident]).filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        {body}
      </div>
      {!done && !(existing && !made) ? (
        <div className="mcs-cd-dock">
          {problem ? <p className="mcs-cd-hint problem" role="alert">{problem}</p>
            : !physical ? <p className="mcs-cd-hint">{!a.kind ? "Raw or graded?" : a.kind === "raw" ? "What condition is it?" : "Which grade is it?"}</p>
              : !canonical ? <p className="mcs-cd-hint">MetYet can't add this card from here.</p>
                : <p className="mcs-cd-hint quiet">{`${STATE_STYLE[a.target].label} · ${physical} · ${destName ? `into ${destName}` : "Unfiled"}${toCopy ? (a.keepGoal ? " · Goal kept" : " · stop looking") : ""}`}</p>}
          {unfiledNow ? (
            <div className="mcs-cx-acts">
              <button type="button" className="mcs-cd-add ready" aria-busy={working} onClick={retryFiling}>{working ? "Filing…" : "Retry filing"}</button>
              <button type="button" className="mcs-linkish" disabled={working} onClick={leaveUnfiled}>Leave it Unfiled</button>
            </div>
          ) : (
            <button type="button" className={`mcs-cd-add${ready ? " ready" : ""}`} aria-disabled={!ready} aria-busy={working}
              onClick={go}>{working ? "Saving…" : ADD_WORDS[a.target]}</button>
          )}
        </div>
      ) : null}
      {existing && !made && problem ? <div className="mcs-cd-dock"><p className="mcs-cd-hint problem" role="alert">{problem}</p></div> : null}
    </div>
  );
}
