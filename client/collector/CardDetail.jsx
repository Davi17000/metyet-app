/* ============================================================================
   CARD DETAIL — THE PHASE 6 CARD, FROM BROWSE (P6-F3A)

   A port of the frozen prototype's `CardDetail` (phase6-prototype-01 @ fca2c61,
   prototypes/phase6-01-browse-add/main.jsx L341–627: blankAnswers, planFor,
   nextUnanswered, Choice, Section, Remembered, CardDetail, ackFor; styles
   index.html L31–36, 78–106, 136, 155–173, 189), on production data:

     header      "‹ <where you came from>" · the quiet ‹ › stepper through the
                 Browse results · once the picture scrolls away, a small copy
                 of the card rides in the header (prototype: scrollTop > 300)
     hero        the card's picture at 72% width
     identity    name; set · number · artist
     remembers   what this Collector already wants or owns of this card
     questions   Which version? → What does this card mean to you? → then, for
                 a Goal: Raw or graded? · condition or grade · how important;
                 for a copy: PC or Trade / Sell · raw or graded · condition or
                 grade. Each appears only once the one before it is answered,
                 and changing an answer clears what depended on it.
     dock        "Add to MetYet", pinned; it wakes when every answer is given

   ONE ADD IS ONE COMMAND (Stage 2), the same two the prototype planned:
   a Goal is `start-looking` (addGoal), a copy is `record-copy`
   (addCollectorCopy) — the steps the Collector's entrance already maps
   (client/sign-in/SignIn.jsx). Nothing is written before Add; nothing is
   claimed until the server has answered; a second tap while one is in flight
   sends nothing. NO BINDER HERE (prototype Iteration 2): where a card belongs
   is a separate job, done in Binders.

   A card picture is only what the catalogue holds for a printing (C7.1): this
   file names no provider, builds no URL, and draws through CardArt.
   ========================================================================== */
import React, { useEffect, useRef, useState } from "react";
import CardArt from "../card-art.jsx";
import { rows, text, gradeLine, criteriaLine } from "./present.js";
import { explain } from "./CardSpecification.jsx";

/* The prototype's version words (fixtures.js FINISH_NAMES), plus what else
   makes a production printing different, said only when it is not the usual. */
const FINISH_NAMES = { non_holo: "Normal", holofoil: "Holo", reverse_holofoil: "Reverse Holo", cosmos_holofoil: "Cosmos Holo" };
const titled = (s) => String(s).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
export const versionLabel = (card) => [
  FINISH_NAMES[card.finish] || titled(card.finish || "Version"),
  card.printRun && !["unlimited", "not_applicable"].includes(card.printRun) ? titled(card.printRun) : null,
  card.stamp && card.stamp !== "none" ? `${titled(card.stamp)} stamp` : null,
  card.printVariation && card.printVariation !== "standard" ? titled(card.printVariation) : null,
  card.language && card.language !== "en" ? card.language.toUpperCase() : null,
].filter(Boolean).join(" · ");
const TIER = { primary: "Primary", secondary: "Secondary" };

/* The vocabulary the domain already has (D.GRADED_VALUES, D.CONDITION_VALUES),
   in the prototype's order: PSA 10 first. Not widened here — another grading
   company is a product decision, not a button. A test holds these to the
   domain's lists. */
export const GRADES = ["PSA 10", "PSA 9", "PSA 8", "PSA 7", "PSA 6", "PSA 5", "PSA 4", "PSA 3", "PSA 2", "PSA 1"];
export const CONDITIONS = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];

/* The prototype's qualText. */
const qualText = (d) => (!d ? "" : d.grade && d.grade !== "Raw" ? d.grade
  : d.condition ? `Raw · ${d.condition}` : d.grade === "Raw" ? "Raw" : "");

/* What MetYet knows about one printing (prototype knownFor), from this
   Collector's own projection. A binder is told apart by its id, never by its
   name: two binders may share one. */
function knownFor(state, canonicalCardId) {
  const binders = rows(state && state.binders);
  const memberships = rows(state && state.binderMemberships);
  const binderOf = (key, id) => {
    const m = memberships.find((x) => x[key] === id);
    return (m && binders.find((x) => x.id === m.binderId)) || null;
  };
  const goal = rows(state && state.goals).find((g) => g.canonicalCardId === canonicalCardId) || null;
  const goalHome = goal ? binderOf("goalId", goal.id) : null;
  return {
    goal: goal && { tier: goal.tier, desired: goal.desired || {}, home: goalHome ? text(goalHome.name) : null },
    copies: rows(state && state.collectorCopies).filter((c) => c.canonicalCardId === canonicalCardId).map((c) => {
      const home = binderOf("collectorCopyId", c.id);
      return { what: c.offered === true ? "Trade / Sell" : c.keeping === true ? "Personal collection" : "Owned",
        facts: gradeLine(c), binderId: home && home.id, home: home ? text(home.name) : null };
    }),
  };
}

/* "MetYet remembers" (prototype Remembered): per version, the Goal and the
   copies, alike copies counted. */
function remembered(state, cards) {
  const lines = [];
  for (const card of cards) {
    const label = versionLabel(card);
    const k = knownFor(state, card.canonicalCardId);
    if (k.goal) {
      lines.push([label, "Looking for it", TIER[k.goal.tier] || null, criteriaLine(k.goal.desired) || null, k.goal.home]
        .filter(Boolean).join(" · "));
    }
    const groups = [];
    for (const c of k.copies) {
      const g = groups.find((x) => x.what === c.what && x.facts === c.facts && x.binderId === c.binderId);
      if (g) g.n += 1; else groups.push({ ...c, n: 1 });
    }
    for (const g of groups) {
      lines.push([label, g.n > 1 ? `${g.n} copies` : "You own it", g.what, g.facts || null, g.home].filter(Boolean).join(" · "));
    }
  }
  return lines;
}

/* THE ANSWERS (prototype blankAnswers). One printing is not a choice. */
const blankAnswers = (cards) => ({
  printing: cards.length === 1 ? cards[0].canonicalCardId : null,
  intent: null, kind: null, grade: null, condition: null, priority: null, disposition: null, facts: null,
});

/* THE ONE STEP THE ANSWERS DESCRIBE (prototype planFor), in the words the
   Collector's entrance turns into a command. */
export function stepFor(a) {
  if (!a.printing || !a.intent) return null;
  if (a.intent === "looking") {
    const desired = a.kind === "graded" ? { grade: a.grade } : { grade: "Raw", condition: a.condition };
    return { kind: "start-looking", tier: a.priority, desired };
  }
  const facts = a.facts === "raw" ? { grade: "Raw", condition: a.condition } : { grade: a.grade, condition: null };
  return { kind: "record-copy", copy: { ...facts, offered: a.disposition === "trade", keeping: a.disposition === "pc" } };
}

/* The next thing not yet answered (prototype nextUnanswered) — what a tap on
   the muted button points at. Every one of them is required. */
export function nextUnanswered(cards, a, existingGoal) {
  if (!cards.length) return ["print", "MetYet can't record this card yet."];
  if (!a.printing) return ["print", "Which version is it?"];
  if (!a.intent) return ["intent", "What does this card mean to you?"];
  if (a.intent === "looking") {
    if (existingGoal) return ["intent", "You're already looking for this version."];
    if (!a.kind) return ["kind", "Raw or graded?"];
    if (a.kind === "graded" && !a.grade) return ["grade", "Which grade are you after?"];
    if (a.kind === "raw" && !a.condition) return ["condition", "What condition are you after?"];
    if (!a.priority) return ["priority", "How important is this one?"];
  } else {
    if (!a.disposition) return ["disposition", "What's this card to you?"];
    if (!a.facts) return ["facts", "Is your copy raw or graded?"];
    if (a.facts === "raw" && !a.condition) return ["condition", "What condition is it in?"];
    if (a.facts === "graded" && !a.grade) return ["grade", "What's it graded?"];
  }
  return null;
}

/* The prototype's acknowledgement (ackFor): the meaning, its value, then Browse. */
export function ackFor(card, a) {
  const print = versionLabel(card);
  const physical = a.facts === "raw" ? `Raw · ${a.condition}` : a.facts === "graded" ? a.grade : null;
  if (a.intent === "looking") return { head: `${TIER[a.priority]} goal ✓`,
    facts: `${a.kind === "graded" ? a.grade : `Raw · ${a.condition}`} · ${print}`,
    value: "Your Trusted Partners can now see what you're looking for." };
  if (a.disposition === "trade") return { head: "Trade / Sell ✓", facts: [physical, print].filter(Boolean).join(" · "),
    value: "Your Trusted Partners can now see you'd move this one." };
  return { head: "Personal collection ✓", facts: [physical, print].filter(Boolean).join(" · "),
    value: "MetYet remembered this one. Only you can see it." };
}

function Choice({ on, onClick, title, sub, disabled, extra }) {
  return (
    <button type="button" className={`mcs-cd-choice${on ? " on" : ""}${extra ? ` ${extra}` : ""}`} aria-pressed={!!on}
      disabled={disabled} onClick={onClick}>
      <b>{title}</b>{sub ? <span>{sub}</span> : null}
    </button>
  );
}
function Section({ id, title, focus, children }) {
  return (
    <section className={`mcs-cd-q mcs-cd-reveal${focus === id ? " nudge" : ""}`} data-q={id}>
      {title ? <h3>{title}</h3> : null}
      {children}
    </section>
  );
}

/* THE HOLD (prototype commit): a short, perceptible beat on the card after the
   server has said yes, then Browse. */
const HOLD_MS = 900;

export default function CardDetail({ context, state, backLabel = "Browse", position = 0, total = 1,
  onStep = null, onClose, onSave = null, onAdded = null, wakeHint = true, onForm = null }) {
  /* FILLING A BINDER (Browse's "Adding to …" mode) keeps Stage 1's behaviour
     until the founder decides it: no questions here, and Add opens the existing
     Card Specification, which ticks that binder. See sections/Browse.jsx. */
  const formMode = Boolean(onForm);
  const cards = rows(context && context.cards);
  const [a, setA] = useState(() => blankAnswers(cards));
  const [focus, setFocus] = useState(null);
  const [hint, setHint] = useState(null);
  const [justReady, setJustReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);       // acknowledgement, once the server said yes
  const [problem, setProblem] = useState(null);   // the server's refusal, in words
  const [compact, setCompact] = useState(false);
  const scroller = useRef(null);
  const sending = useRef(false);                  // one Add, however many taps
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("keydown", onKey);
    return () => { if (typeof window !== "undefined" && window.removeEventListener) window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const set = (patch) => { setHint(null); setFocus(null); setProblem(null); setA((x) => ({ ...x, ...patch })); };
  /* CHANGE AN ANSWER, LOSE WHAT DEPENDED ON IT (prototype Iteration 3). */
  const choose = (field, value, clears) => { if (a[field] !== value) set({ [field]: value, ...clears }); };
  const AFTER_INTENT = { kind: null, grade: null, condition: null, priority: null, disposition: null, facts: null };

  /* THE CARD HOLDS STILL DURING ITS ACKNOWLEDGEMENT: the projection has already
     changed; the card keeps showing what was just given until Browse returns. */
  const world = saved ? saved.before : state;
  const chosen = cards.find((c) => c.canonicalCardId === a.printing) || null;
  const known = chosen ? knownFor(world, chosen.canonicalCardId) : { goal: null, copies: [] };
  const existingGoal = known.goal;
  const missing = nextUnanswered(cards, a, existingGoal);
  const step = stepFor(a);
  const ready = formMode ? Boolean(chosen) : Boolean(onSave) && !missing && Boolean(step) && !saved && !saving;

  const wasReady = useRef(false);
  useEffect(() => {
    let t = null;
    if (ready && !wasReady.current) { setJustReady(true); t = setTimeout(() => { if (alive.current) setJustReady(false); }, 700); }
    wasReady.current = ready;
    return () => { if (t) clearTimeout(t); };
  }, [ready]);

  const nudge = () => {
    if (!missing) return;
    setFocus(missing[0]); setHint(missing[1]);
    const el = scroller.current && scroller.current.querySelector && scroller.current.querySelector(`[data-q="${missing[0]}"]`);
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const add = async () => {
    if (formMode) { if (chosen) onForm(chosen); else nudge(); return; }
    if (saved || sending.current || !onSave) return;
    if (!ready) { nudge(); return; }
    sending.current = true; setSaving(true); setProblem(null);
    const before = state;
    const ack = ackFor(chosen, a);
    try {
      const answer = await onSave(step, chosen.canonicalCardId);
      if (!alive.current) return;
      if (answer && answer.ok === false) { setProblem(explain(step, answer.refused, [])); return; }
      setSaved({ ...ack, before });
      setTimeout(() => { if (alive.current && onAdded) onAdded(ack, chosen); }, HOLD_MS);
    } catch (error) {
      if (alive.current) setProblem("MetYet lost contact, so nothing was saved. Your answers are still here.");
    } finally {
      sending.current = false;
      if (alive.current) setSaving(false);
    }
  };

  /* The picture: the chosen version's, else the card's. A version whose
     picture is the same as another version's is the CARD's picture, and says
     so (prototype: "Card picture — this version may look different."). */
  const pictureOf = (c) => (c ? c.imageLarge || c.imageSmall || null : null);
  const cardPicture = (context && (context.imageLarge || context.imageSmall)) || pictureOf(cards.find(pictureOf)) || null;
  const imageShown = (chosen && pictureOf(chosen)) || cardPicture;
  const shared = chosen && cards.length > 1 && (!pictureOf(chosen)
    || cards.some((c) => c !== chosen && pictureOf(c) === pictureOf(chosen)));
  /* THE FINISH, SHOWN ON THE CARD'S OWN PICTURE (prototype CardArt `fx`). */
  const fx = !chosen || !shared ? "" : chosen.finish === "reverse_holofoil" ? " rev"
    : chosen.finish === "holofoil" || chosen.finish === "cosmos_holofoil" ? " holo" : "";
  const name = text(context && context.cardName) || "This card";
  const number = text(context && context.collectorNumber);
  const ident = [text(context && context.expansionName), number, text(context && context.artist)].filter(Boolean).join(" · ");
  const lines = remembered(world, cards);
  const art = (size) => (
    <CardArt src={imageShown} name={name} wrap={`mcs-cd-art ${size}`} plate="mcs-art-plate" decorative
      card={{ key: context && context.cardContextId, set: context && context.expansionName, number }} />
  );

  return (
    <div className="mcs-cd" role="dialog" aria-modal="true" aria-label={`${name}${ident ? `, ${ident}` : ""}`}>
      <header className="mcs-cd-hd">
        <button type="button" className="mcs-cd-back" onClick={onClose}>‹ {backLabel}</button>
        {compact ? (
          <span className="mcs-cd-mini">{art("mini")}<b>{name}</b><span>{chosen ? versionLabel(chosen) : number ? `#${number}` : ""}</span></span>
        ) : null}
        {/* ONE CARD IS THE SUBJECT (prototype): no "3 of 9"; the arrows stay, quiet. */}
        <span className="mcs-cd-step">
          <button type="button" aria-label="Previous card" disabled={!onStep || position <= 0} onClick={() => onStep(-1)}>‹</button>
          <button type="button" aria-label="Next card" disabled={!onStep || position >= total - 1} onClick={() => onStep(1)}>›</button>
        </span>
      </header>
      <div className="mcs-cd-scroll" ref={scroller} onScroll={(e) => setCompact(e.currentTarget.scrollTop > 300)}>
        <div className="mcs-cd-hero">
          <span className={`mcs-cd-frame${fx}`}>{art("hero")}{fx ? <span className="mcs-cd-sheen" aria-hidden="true" /> : null}</span>
        </div>
        {shared ? <p className="mcs-cd-imgnote">Card picture — this version may look different.</p> : null}
        <div className="mcs-cd-ident">
          <h2>{name}</h2>
          {ident ? <p>{ident}</p> : null}
        </div>
        {lines.length ? (
          <div className="mcs-cd-remembered">
            <h4>MetYet remembers</h4>
            <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        ) : null}

        {!cards.length ? (
          <Section id="print" title="Which version?" focus={focus}>
            <p className="mcs-cd-cannot">MetYet can&apos;t record this card yet.</p>
          </Section>
        ) : cards.length > 1 ? (
          <Section id="print" title="Which version?" focus={focus}>
            <div className="mcs-cd-wrap" role="group" aria-label="Which version?">
              {cards.map((c) => (
                <Choice key={c.canonicalCardId} on={a.printing === c.canonicalCardId} title={versionLabel(c)}
                  onClick={() => a.printing !== c.canonicalCardId && set({ ...blankAnswers(cards), printing: c.canonicalCardId })} />
              ))}
            </div>
          </Section>
        ) : (
          <p className="mcs-cd-established">{versionLabel(cards[0])} — the only version of this card.</p>
        )}

        {chosen && !formMode ? (
          <Section id="intent" title="What does this card mean to you?" focus={focus}>
            <div className="mcs-cd-col">
              {existingGoal ? (
                <div className="mcs-cd-choice known">
                  <b>You&apos;re looking for it</b>
                  <span>{[TIER[existingGoal.tier], qualText(existingGoal.desired) || null].filter(Boolean).join(" · ")}
                    {existingGoal.home ? ` · ${existingGoal.home}` : " · Not in a binder"}</span>
                </div>
              ) : (
                <Choice on={a.intent === "looking"} title="I'm looking for it" sub="Help my Trusted Partners know what I want."
                  onClick={() => choose("intent", "looking", AFTER_INTENT)} />
              )}
              <Choice on={a.intent === "own"} title={known.copies.length ? "I own another one" : "I own it"}
                sub="Keep track of my copy." onClick={() => choose("intent", "own", AFTER_INTENT)} />
            </div>
          </Section>
        ) : null}

        {a.intent === "looking" && !existingGoal ? (<>
          <Section id="kind" title="Raw or graded?" focus={focus}>
            <div className="mcs-cd-row">
              <Choice on={a.kind === "raw"} title="Raw" onClick={() => choose("kind", "raw", { grade: null, condition: null, priority: null })} />
              <Choice on={a.kind === "graded"} title="Graded" onClick={() => choose("kind", "graded", { grade: null, condition: null, priority: null })} />
            </div>
          </Section>
          {a.kind === "raw" ? (
            <Section id="condition" title="In what condition?" focus={focus}>
              <div className="mcs-cd-wrap">{CONDITIONS.map((c) => <Choice key={c} on={a.condition === c} title={c} onClick={() => set({ condition: c })} />)}</div>
            </Section>
          ) : null}
          {a.kind === "graded" ? (
            <Section id="grade" title="Which grade?" focus={focus}>
              <div className="mcs-cd-wrap">{GRADES.map((g) => <Choice key={g} on={a.grade === g} title={g} onClick={() => set({ grade: g })} />)}</div>
            </Section>
          ) : null}
          {(a.kind === "raw" && a.condition) || (a.kind === "graded" && a.grade) ? (
            <Section id="priority" title="How important is this one?" focus={focus}>
              <div className="mcs-cd-col">
                <Choice on={a.priority === "primary"} title="Primary" sub="I'm actively looking for this." onClick={() => set({ priority: "primary" })} />
                <Choice on={a.priority === "secondary"} title="Secondary" sub="I'd act on the right opportunity." onClick={() => set({ priority: "secondary" })} />
              </div>
            </Section>
          ) : null}
        </>) : null}

        {a.intent === "own" ? (<>
          <Section id="disposition" title="What's this card to you?" focus={focus}>
            <div className="mcs-cd-col">
              <Choice on={a.disposition === "pc"} title="Personal collection" sub="I'm keeping this one." onClick={() => set({ disposition: "pc" })} />
              <Choice on={a.disposition === "trade"} title="Trade / Sell" sub="I'd consider moving it." onClick={() => set({ disposition: "trade" })} />
            </div>
          </Section>
          {a.disposition ? (
            <Section id="facts" title="Is your copy raw or graded?" focus={focus}>
              <div className="mcs-cd-row">
                <Choice on={a.facts === "raw"} title="Raw" onClick={() => choose("facts", "raw", { grade: null, condition: null })} />
                <Choice on={a.facts === "graded"} title="Graded" onClick={() => choose("facts", "graded", { grade: null, condition: null })} />
              </div>
            </Section>
          ) : null}
          {a.facts === "raw" ? (
            <Section id="condition" title="What condition is it in?" focus={focus}>
              <div className="mcs-cd-wrap">{CONDITIONS.map((c) => <Choice key={c} on={a.condition === c} title={c} onClick={() => set({ condition: c })} />)}</div>
            </Section>
          ) : null}
          {a.facts === "graded" ? (
            <Section id="grade" title="What's it graded?" focus={focus}>
              <div className="mcs-cd-wrap">{GRADES.map((g) => <Choice key={g} on={a.grade === g} title={g} onClick={() => set({ grade: g })} />)}</div>
            </Section>
          ) : null}
        </>) : null}

        <div className="mcs-cd-spacer" />
      </div>

      <div className="mcs-cd-dock">
        {formMode && chosen ? <p className="mcs-cd-hint quiet">For now, Add opens MetYet&apos;s current card form.</p> : null}
        {problem ? <p className="mcs-cd-hint problem" role="alert">{problem}</p>
          : hint && !saved ? <p className="mcs-cd-hint">{hint}</p>
            : !ready && !saved && !saving && wakeHint && cards.length > 0 && onSave
              ? <p className="mcs-cd-hint quiet">Add to MetYet wakes up as you answer.</p> : null}
        {saved ? <p className="mcs-cd-hint ack" role="status">{saved.head}{saved.facts ? ` · ${saved.facts}` : ""}</p> : null}
        <button type="button" className={`mcs-cd-add${ready || saving ? " ready" : ""}${justReady ? " pop" : ""}${saved ? " added" : ""}`}
          aria-disabled={!ready} aria-busy={saving} onClick={add}>
          {saved ? "✓ Added to MetYet" : "Add to MetYet"}
        </button>
      </div>
    </div>
  );
}
