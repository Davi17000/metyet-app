/* ============================================================================
   INVENTORY — WHAT YOU HAVE, COPY BY PHYSICAL COPY

   Every row here is one InventoryCopy: one physical card, with its own `invId`,
   its own certificate, its own acquisition cost and its own status. That is the
   whole design of this screen, and the reason it is not a list of CARDS with
   quantities.

   ACQUISITION COST BELONGS TO THE COPY, AND ONLY TO THE COPY. It is read as
   `copy.cost` from the row being rendered — never looked up by `cardId`, never
   averaged, never taken from another copy of the same card. Three PSA 9
   Charizards bought at £3,100, £3,276 and £3,400 are three different numbers
   against three different rows, and a screen that showed one of them three
   times would be lying about money. A test holds exactly that case.

   It is also TP-private. It reaches this browser because the server projects a
   partner's OWN inventory rows in full (INVENTORY_FOR_COLLECTOR strips `cost`
   and `acquired` for everybody else). It is labelled as yours, and it is never
   combined with the ask into a margin: this product does not compute profit,
   and a number nobody sent is not a number to show. The catalogue's own `value`
   field is deliberately not rendered either — its meaning is not established as
   a market price, and presenting it as one would be inventing pricing.

   STATUS IS THE SERVER'S ANSWER. Available, committed, reserved, sold, traded —
   the server derives it from every opportunity under the domain's rules, and
   the row carries the result. This file does not look at opportunities and work
   it out. A second implementation of a rule is a second answer to it.

   AND SINCE C5, A SHELF CAN BE PUT RIGHT. Every live copy carries two controls:
   correct what is true about it, and take it off the shelf. Before this batch
   a copy could only ever be added — a typo was permanent and a card sold over
   the counter went on telling a Collector that this shop had it, because a copy
   leaves supply only by being archived and nothing production could reach set
   that. Both commands existed, seat-checked and tested, since Batch 6; what was
   missing was a screen, and this is it.

   REMOVE IS ARCHIVE. `removeInventoryCopy` sets `archived` and keeps the row:
   MetYet does not delete a copy, here or anywhere. What ends is the claim to
   have the card — which is what a Collector is actually told — and the history
   of having had it stays. The wording says so without teaching anybody the word
   "archived".

   RAW OR GRADED IS THE CATALOGUE'S ANSWER, TOO. `grade` carries a grading label
   or the word "Raw"; `condition` qualifies a raw copy and is null for a graded
   one. Both are shown when present and neither is inferred from the other — a
   copy whose catalogue entry did not arrive still renders, because it is still
   a copy you own.

   TWO VIEWS, ONE WORKSPACE. What you hold, and the shop a collector sees you
   as. They belong together: the profile is what makes a shelf of copies mean
   something to somebody in your network, which is why it is reached from here
   rather than from a settings destination of its own. `View shop` moves between
   them and changes nothing.

   THE SHOP VIEW IS THE SAME COMPONENT AS EVER. This file renders `<Profile/>`
   and hands it the callback it was given; it does not reimplement a profile, a
   form, or a way to save one. There is one profile implementation in this
   product and this is not a second. Nothing here reaches a store, names a
   command or goes to the network — the callback arrived as a prop.
   ========================================================================== */

import React, { useEffect, useMemo, useState } from "react";
import { Panel, Record, Fact, Tag } from "../parts.jsx";
import CardBrowser, { EMPTY_SESSION } from "../../browse/CardBrowser.jsx";
import { rows, indexById, text, day, money, plural, cardTitle, cardSetLine,
  gradeLine, isGraded, gradeConflictLine, cardMarks, statusLabel, byRecency } from "../present.js";
import Profile from "./Profile.jsx";

export default function Inventory({ state, onSaveProfile = null,
  onAddCopy = null, onEditCopy = null, onRetireCopy = null, onBrowseCards = null }) {
  /* Local to this screen, and nothing else's business. It is not a route, not a
     section id, and nothing outside this file can be pointed at it. */
  const [viewing, setViewing] = useState("copies");

  const inventory = rows(state && state.inventory);
  const catalog = indexById(state && state.catalog);

  const live = byRecency(inventory.filter((i) => !i.archived), "addedAt", "acquired");
  const archived = inventory.length - live.length;

  /* WHICH CARD EACH COPY IS (Batch 6). A copy stores one thing about its card:
     the id the server minted. Everything a person reads — the name, the
     release, the number, the finish — is asked for in ONE request for the ids
     this screen already holds, never one per row and never the catalogue. A
     copy whose description has not arrived still renders: it is still a copy
     you own, and an id is not a name. */
  const canonicalIds = useMemo(() => [...new Set(live.map((i) => i.canonicalCardId).filter(Boolean))],
    [live.map((i) => i.canonicalCardId).join(",")]);
  const [described, setDescribed] = useState({});
  useEffect(() => {
    if (!onBrowseCards || !canonicalIds.length) return undefined;
    let current = true;
    (async () => {
      try {
        const answer = await onBrowseCards.describe(canonicalIds);
        if (!current) return;
        const next = {};
        for (const card of rows(answer && answer.cards)) next[card.canonicalCardId] = card;
        setDescribed((held) => ({ ...held, ...next }));
      } catch (error) { /* a shelf without captions is still a shelf */ }
    })();
    return () => { current = false; };
  }, [canonicalIds.join(","), onBrowseCards]);

  /* THE ADD FLOW, as small as it can be and still be honest: find a checklist
     entry, choose the exact printing when there is a choice, say what is true
     about the physical card, save. `null` means the flow is closed. */
  const [adding, setAdding] = useState(null);
  const closeAdd = () => setAdding(null);

  /* WHICH COPY IS BEING WORKED ON, IF ONE IS (Phase 5 C5). One `invId` at a
     time for each: a shop correcting a certificate is not also retiring a
     different card, and two open forms would be two unsaved intentions on one
     screen. Opening either closes the other and closes the add flow, so there
     is never more than one thing on this screen asking to be finished.

     NEITHER IS DURABLE, and neither is a route. Closing the tab forgets both,
     which is what an unfinished correction should be. */
  const [editing, setEditing] = useState(null);
  const [retiring, setRetiring] = useState(null);
  const openEdit = (invId) => { setRetiring(null); setAdding(null); setEditing(invId); };
  const openRetire = (invId) => { setEditing(null); setAdding(null); setRetiring(invId); };

  if (viewing === "shop") {
    return (
      <>
        <p className="tps-crumb">
          <button className="tps-back" type="button" onClick={() => setViewing("copies")}>
            ← Back to inventory
          </button>
        </p>
        <Profile state={state} onSave={onSaveProfile} />
      </>
    );
  }

  return (
    <Panel
      title="Your copies"
      note={live.length ? plural(live.length, "copy", "copies") : null}
      action={
        <>
          {onAddCopy && onBrowseCards && !adding ? (
            <button className="tps-edit" type="button"
              onClick={() => { setEditing(null); setRetiring(null); setAdding({}); }}>Add cards</button>
          ) : null}
          <button className="tps-edit" type="button" onClick={() => setViewing("shop")}>View shop</button>
        </>}
      /* AND THE EMPTY SENTENCE STANDS ASIDE WHILE SOMEBODY IS ADDING (C3.3).
         `Panel` renders its empty sentence INSTEAD of its children, so a
         partner whose shelf was empty pressed "Add cards" and watched nothing
         happen — the panel was mounted underneath a line saying there was
         nothing here. Which was also the first copy they would ever add.

         The sentence itself was out of date too: adding a copy has been part
         of this release since C1. */
      empty={live.length || adding ? null
        : (archived
          ? "Nothing on your shelf right now — every copy you've recorded is archived."
          : "Nothing in your inventory yet — “Add cards” puts the first copy on your shelf.")}
    >
      {adding ? (
        <AddCopy
          browse={onBrowseCards}
          onAdd={onAddCopy}
          onDone={closeAdd}
        />
      ) : null}
      {live.map((copy) => {
        /* A copy names its card one way or the other. A canonical one is
           described by the server; a legacy one is the demo catalogue's. */
        const known = copy.canonicalCardId ? described[copy.canonicalCardId] : null;
        const card = copy.canonicalCardId ? null : (catalog.get(copy.cardId) || null);
        /* Grade and condition belong to the COPY since Batch 5 — a PSA 9 and a
           PSA 10 of one printing are one card and two copies.

           AND WHAT THEY MEAN IS THE SERVER'S ANSWER (Phase 5 C3.3). This was a
           third implementation of the grading rule, written out inline with its
           own `/^raw$/i` — and like the other two it read a copy saying both
           `PSA 9` and `Damaged` as a clean "PSA 9". The projection carries the
           domain's reading now; a copy with no reading of its own falls back to
           its legacy catalogue row, which carries one too. */
        const graded = isGraded(copy) || (!copy.grading && isGraded(card));
        const shown = gradeLine(copy) || gradeLine(card);
        const conflict = gradeConflictLine(copy);
        const title = (known && known.cardName) || cardTitle(card)
          || (copy.canonicalCardId ? "Loading this card…" : "A card not in your catalogue");
        const where = known
          ? [known.expansionName, known.collectorNumber ? `#${known.collectorNumber}` : null]
            .filter(Boolean).join(" · ") || null
          : cardSetLine(card);
        return (
          <Record
            key={copy.invId}
            title={title}
            subtitle={where}
            marks={known
              ? [known.finish, known.printRun, known.language].filter(Boolean)
              : cardMarks(card)}
            tags={
              <>
                <Tag>{shown}</Tag>
                {/* A copy that disagrees with itself says so, rather than
                    being priced as the half that happens to read first. */}
                {conflict ? <Tag tone="unknown">{`Says ${conflict}`}</Tag> : null}
                <Tag tone={copy.status === "available" ? null : "strong"}>{statusLabel(copy.status)}</Tag>
              </>
            }
            facts={
              <>
                {/* The certificate is the copy's, not the card's. */}
                <Fact label={graded ? "Cert" : "Serial"} value={text(copy.cert)} mono />
                <Fact label="Ask" value={money(copy.ask)} mono />
                {/* THIS copy's cost. Read from this row, by construction. */}
                <Fact label="Your cost" value={money(copy.cost)} mono />
                <Fact label="Acquired" value={day(copy.acquired)} mono />
                <Fact label="Added" value={day(copy.addedAt)} mono />
              </>
            }
          >
            {/* KEEPING THE SHELF TRUE (Phase 5 C5). Two controls, and each is
                rendered only when this screen was handed the callback behind
                it: a button that cannot do what it says is worse than no
                button, and the convention everywhere else in this product is
                to render nothing rather than something disabled.

                CORRECTING AND RETIRING ARE NOT THE SAME SHAPE ON PURPOSE.
                Correcting opens a form. Retiring asks one question with the
                card's name in it, because it is the only thing on this screen
                that changes what a Collector is told, and a person should have
                to mean it. */}
            {editing === copy.invId ? (
              <EditCopy copy={copy} title={title} where={where}
                onSave={onEditCopy} onDone={() => setEditing(null)} />
            ) : retiring === copy.invId ? (
              <RetireCopy copy={copy} title={title} where={where}
                onRetire={onRetireCopy} onDone={() => setRetiring(null)} />
            ) : (
              <p className="tps-rec-do">
                {onEditCopy ? (
                  <button className="tps-edit" type="button"
                    onClick={() => openEdit(copy.invId)}>Edit</button>
                ) : null}
                {onRetireCopy ? (
                  <button className="tps-edit" type="button"
                    onClick={() => openRetire(copy.invId)}>Remove from inventory</button>
                ) : null}
              </p>
            )}
          </Record>
        );
      })}
      {archived ? (
        <p className="tps-foot-note">
          {plural(archived, "archived copy is", "archived copies are")} not shown.
        </p>
      ) : null}
    </Panel>
  );
}

/* ============================================================================
   ADDING A COPY

   FOUR STEPS, AND THE THIRD ONE DISAPPEARS WHEN IT HAS NOTHING TO ASK. Find a
   checklist entry; choose the exact printing IF the entry has more than one;
   say what is true about the physical card; save. A context with a single
   selectable card goes straight to the details, because a chooser with one
   option is a question nobody asked.

   THE BROWSER NAMES A CARD, IT NEVER DESCRIBES ONE. What leaves here is a
   `canonicalCardId` the server minted and this screen merely received, plus
   facts about an object on a shelf. There is no field for a card's name, set,
   number or finish, and no field for a partner: ownership comes from the
   authenticated actor and a payload that carried one would be ignored.

   EVERY WAY THIS CAN FAIL SAYS SO. A search that finds nothing, a context with
   nothing selectable, a catalogue that cannot be reached, a card withdrawn
   between choosing it and saving, and a refusal from the domain are five
   different sentences, because they are five different situations and only
   some of them are the person's to fix. */
/* ADD CARDS — THE SAME BROWSER THE COLLECTOR USES (Phase 5 C1).

   The picker that used to live here was a text box and a flat list, and it was
   a hundred and ten lines identical to the one on the Collector's side. Both
   are now `client/browse/CardBrowser.jsx`: the same three doorways, the same
   grid, the same paging.

   WHAT STAYS DIFFERENT IS EVERYTHING AFTER THE CARD. A Collector is saying
   what they are looking for; a Trusted Partner is saying what is on the shelf,
   which means a grade, a condition, a certificate and two amounts. Shared
   plumbing, different meaning — and no `+` here, because there is no fast path
   to a copy whose facts nobody has entered yet.

   CANCEL STILL CREATES NOTHING, and neither does browsing: this panel asks the
   catalogue questions and writes nothing until "Add this copy".

   AND IT NOW ASKS THE ONE GRADING RULE BEFORE THE SERVER DOES (Phase 5 C3.3).
   C3.2 made "a raw card says what state it is in" authoritative in the domain,
   which was right — and left this screen able to send a copy the domain would
   refuse: Grade "Raw" with Condition still on "Not stated" was two clicks away,
   and came back as "check the details" without saying which. The condition is
   now required whenever Raw is chosen, changing the grade drops a condition
   that no longer applies, and the refusal — if it still arrives — names the
   field. None of that moves the decision: the domain refuses the same payload
   it always would, and this is the screen agreeing with it out loud. */
function AddCopy({ browse, onAdd, onDone }) {
  const [session, setSession] = useState(EMPTY_SESSION);
  const [looking, setLooking] = useState(false);
  const [context, setContext] = useState(null);
  const [chosen, setChosen] = useState(null);
  const { facts, set, setGrade, rawNeedsCondition, payload } = useCopyFacts(BLANK_FACTS);
  const [problem, setProblem] = useState(null);
  const [saving, setSaving] = useState(false);

  const open = async (row) => {
    setProblem(null); setLooking(true);
    try {
      const answer = await browse.read(row.cardContextId);
      const cards = rows(answer && answer.canonicalCards);
      setContext({ ...row, cards });
      /* One version is not a choice. */
      setChosen(cards.length === 1 ? cards[0] : null);
      if (!cards.length) setProblem("MetYet has no version of this card to add yet.");
    } catch (error) {
      setProblem("That card could not be read. Try again in a moment.");
    } finally { setLooking(false); }
  };

  const save = async () => {
    if (!chosen || saving || rawNeedsCondition) return;
    setSaving(true); setProblem(null);
    try {
      const answer = await onAdd({ canonicalCardId: chosen.canonicalCardId, ...payload() });
      if (answer && answer.ok === false) {
        setProblem(refusalSentence(answer.refused, facts.grade, "add"));
        setSaving(false);
        return;
      }
      onDone();
    } catch (error) {
      setProblem("MetYet lost contact, so it cannot tell whether that copy was added. Re-open your inventory before trying again.");
      setSaving(false);
    }
  };

  return (
    <div className="tps-add">
      <div className="tps-add-head">
        <strong>Add cards</strong>
        <button className="tps-edit" type="button" onClick={onDone}>Cancel</button>
      </div>

      {!context ? (
        <CardBrowser browse={browse} prefix="tps" session={session} onSession={setSession}
          onChoose={open} busy={looking} fastAdd={false} />
      ) : (
        <>
          <p className="tps-add-card">
            <strong>{context.cardName}</strong>
            <span className="tps-dim">
              {[context.expansionName, context.collectorNumber ? `#${context.collectorNumber}` : null]
                .filter(Boolean).join(" · ")}
            </span>
            <button className="tps-edit" type="button"
              onClick={() => { setContext(null); setChosen(null); setProblem(null); }}>
              Choose a different card
            </button>
          </p>

          {context.cards.length > 1 ? (
            <div className="tps-add-versions">
              <span>Which version?</span>
              {context.cards.map((card) => (
                <button key={card.canonicalCardId} type="button"
                  className={"tps-add-row" + (chosen && chosen.canonicalCardId === card.canonicalCardId ? " on" : "")}
                  onClick={() => setChosen(card)}>
                  {[card.finish, card.printRun, card.language].filter(Boolean).join(" · ")}
                </button>
              ))}
            </div>
          ) : null}

          {chosen ? (
            <>
              <CopyFactFields facts={facts} set={set} setGrade={setGrade} disabled={saving} />
              {rawNeedsCondition ? (
                <p className="tps-dim">A raw copy needs a condition before it can go on the shelf.</p>
              ) : null}
              <button className="tps-edit" type="button" disabled={saving || rawNeedsCondition}
                onClick={save}>
                {saving ? "Adding…" : "Add this copy"}
              </button>
            </>
          ) : null}
        </>
      )}

      {problem ? <p className="tps-add-problem" role="alert">{problem}</p> : null}
    </div>
  );
}

/* ============================================================================
   THE FIVE FACTS A SHOP STATES ABOUT A PHYSICAL COPY (Phase 5 C5)

   Adding one and correcting one ask the same five questions, so they ask them
   with the same code. That is not tidiness: the grading courtesy below had
   already been written three times in this repository by C3.3, and every copy
   of it read a card saying both "PSA 9" and "Damaged" as a clean PSA 9. A
   fourth implementation on the correction screen would have been the same bug
   with a new address.

   WHY FIVE AND NOT EIGHT. `updateInventoryCopy` will accept `ask`, `cost`,
   `acquired`, `cert`, `note`, `photos`, `grade` and `condition`. The five here
   are exactly the ones the ADD flow can state, and correction covers what
   adding can say — no more. `note` and `photos` have no control anywhere in
   this product, and `acquired` has a rendered home but no input: giving any of
   them an edit-only control would mean inventing a workflow in the batch whose
   whole point is that a shop can fix what it already typed. They are left
   alone, and left alone means untouched — a patch carries only the keys it
   names, so a copy's note, photographs and acquisition date survive a
   correction exactly as they were.

   THE PAYLOAD IS BUILT IN ONE PLACE for the same reason: "a graded copy sends
   no condition" is a sentence about what MetYet means, and two spellings of it
   is two chances to disagree. */
const BLANK_FACTS = Object.freeze({ grade: "", condition: "", ask: "", cost: "", cert: "" });

/* A copy's stored facts as this form's answers. A number that is absent is an
   empty box, never a zero: `0` and "nobody said" are different claims about an
   ask, and `money(0)` would print one as the other.

   EVERY STORED VALUE COMES BACK AS ITSELF, whatever its type. `text()` answers
   null for anything that is not a string, so reading a certificate through it
   turned a numeric one — which the API accepts — into an empty box, and Save
   would then have written the emptiness back. A form pre-filled from a record
   must be able to represent everything that record can hold, or it is a way to
   lose data by opening it. */
const asText = (v) => (v === null || v === undefined || v === "" ? "" : String(v));
const factsOf = (copy) => ({
  grade: asText(copy && copy.grade),
  condition: asText(copy && copy.condition),
  ask: asText(copy && copy.ask),
  cost: asText(copy && copy.cost),
  cert: asText(copy && copy.cert),
});

function useCopyFacts(initial) {
  const [facts, setFacts] = useState(initial);
  const set = (k, v) => setFacts((f) => ({ ...f, [k]: v }));
  /* CHANGING THE GRADE DROPS A CONDITION THAT NO LONGER APPLIES (Phase 5 C3.3).
     A partner who picks Raw, chooses Heavily Played, then changes their mind to
     PSA 9 has not said the card is heavily played — they have said it is a
     PSA 9. Keeping the old answer hidden in state would leave the screen
     disagreeing with itself even though the payload happens not to send it. */
  const setGrade = (value) => setFacts((f) => ({ ...f, grade: value,
    condition: value === "Raw" ? f.condition : "" }));
  /* THE ONE RULE, ASKED BEFORE THE REQUEST (Phase 5 C3.3). The domain decides
     this and refuses a copy that breaks it; the screen asks the same question
     first so a partner is told which control to fix instead of being told no
     after the round trip. It is a courtesy, never the authority — the same
     payload is refused by the same rule whether or not this line exists. */
  const rawNeedsCondition = facts.grade === "Raw" && !facts.condition;
  /* WHAT THE FORM IS ENTITLED TO SAY ABOUT `condition`, WHICH IS NOT ALWAYS.

     Three cases, and the third is the one that bit. Raw: the condition is
     required and is sent. A real grade: the domain refuses a graded copy that
     also carries a raw condition, so `null` is not this form guessing — it is
     the only value the merged record could take, and sending it is how the
     grade change is allowed to land. Grade NOT STATED: the form shows no
     condition control at all, so it has no opinion, and a copy may legitimately
     hold `{ grade: null, condition: "Near Mint" }` — the domain accepts it and
     the shelf renders it. Sending `condition: null` there was the form
     asserting an absence it had never asked about, and a Save that changed
     nothing else deleted the one fact the copy had.

     So the key is OMITTED in that case. A patch carries only the keys it names,
     which is the same reason `note`, `acquired` and `photos` survive. */
  const payload = () => ({
    grade: facts.grade || null,
    ...(facts.grade
      ? { condition: facts.grade === "Raw" ? (facts.condition || null) : null }
      : {}),
    ask: facts.ask === "" ? null : Number(facts.ask),
    cost: facts.cost === "" ? null : Number(facts.cost),
    cert: facts.cert || null,
  });
  return { facts, set, setGrade, rawNeedsCondition, payload };
}

function CopyFactFields({ facts, set, setGrade, disabled = false }) {
  const field = (label, key, extra = {}) => (
    <label className="tps-field">
      <span>{label}</span>
      <input value={facts[key]} disabled={disabled}
        onChange={(e) => set(key, e.target.value)} {...extra} />
    </label>
  );
  return (
    <>
      <label className="tps-field">
        <span>Grade</span>
        <select value={facts.grade} disabled={disabled}
          onChange={(e) => setGrade(e.target.value)}>
          <option value="">Not stated</option>
          {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </label>
      {/* RAW IS HALF A SENTENCE UNTIL THE CONDITION IS SAID (C3.3).
          "Not stated" is a real answer for a copy nobody has described, which
          is why it stays on the Grade control — but it is not an answer once
          somebody has said the card is raw, so it is not offered here. */}
      {facts.grade === "Raw" ? (
        <label className="tps-field">
          <span>Condition</span>
          <select value={facts.condition} disabled={disabled}
            onChange={(e) => set("condition", e.target.value)}>
            {/* A PROMPT, NOT AN ANSWER. It is `disabled`, so it can be read but
                not chosen. */}
            <option value="" disabled>Choose a condition</option>
            {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      ) : null}
      {field("Certificate", "cert", { inputMode: "numeric" })}
      {field("Ask", "ask", { inputMode: "decimal" })}
      {field("What it cost you", "cost", { inputMode: "decimal" })}
    </>
  );
}

/* ONE REFUSAL, SAID IN THE WORDS OF THE CONTROL THAT CAUSED IT. The domain is
   the authority and this only translates; `verb` is here because "MetYet would
   not accept that copy" and "…would not save that correction" are the same
   refusal about two different acts. */
const refusalSentence = (refused, grade, verb) => {
  if (refused === "card-unavailable") {
    return "That version is no longer one MetYet can add. Choose another.";
  }
  if (refused === "invalid-amount") return "An amount has to be a number, and not a negative one.";
  if (refused === "grading-incoherent") {
    return grade === "Raw"
      ? "A raw copy needs a condition. Choose one."
      : "A graded copy already carries its assessment, so it cannot also have a raw condition.";
  }
  /* Two the correction path can meet and the add path cannot. Neither should
     ever reach a person — the screen only offers these controls on rows the
     server sent to this partner — so they say what happened rather than what
     to do about it. */
  if (refused === "not-owner") return "That copy is not one this shop can change.";
  if (refused === "identity-immutable") return "A copy cannot be moved to a different card.";
  if (refused === "copy-committed") return "That copy is committed to a live deal, so it cannot be changed right now.";
  if (refused === "not-found") return "MetYet no longer has that copy. Re-open your inventory.";
  return verb === "add"
    ? "MetYet would not accept that copy. Check the details and try again."
    : "MetYet would not save that correction. Check the details and try again.";
};

/* ============================================================================
   CORRECTING A COPY (Phase 5 C5)

   The same five questions the add flow asks, answered in advance with what the
   copy already says. Which is the whole point: a shop fixing a certificate
   should not have to retype an ask, and a form that opened blank would turn
   every correction into a chance to lose four other facts.

   WHAT IT CANNOT DO. It cannot change which card this is — `canonicalCardId`,
   `cardId`, `invId` and `partnerId` are refused inside a patch by the domain,
   and none of them is in the payload this builds. It cannot reach a copy
   belonging to another shop: the rows it renders are the ones the server sent
   this partner, and the command checks ownership again regardless. And it
   cannot archive anything — retiring a copy is the control next to this one,
   for the same reason offering is separate from owning on the Collector's
   side.

   CANCEL WRITES NOTHING. There is one `await` in this component and it is
   behind "Save changes". */
function EditCopy({ copy, title, where, onSave, onDone }) {
  const { facts, set, setGrade, rawNeedsCondition, payload } = useCopyFacts(factsOf(copy));
  const [problem, setProblem] = useState(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving || rawNeedsCondition || !onSave) return;
    setSaving(true); setProblem(null);
    try {
      const answer = await onSave(copy.invId, payload());
      if (answer && answer.ok === false) {
        setProblem(refusalSentence(answer.refused, facts.grade, "correct"));
        setSaving(false);
        return;
      }
      onDone();
    } catch (error) {
      setProblem("MetYet lost contact, so it cannot tell whether that correction was saved. Re-open your inventory before trying again.");
      setSaving(false);
    }
  };

  return (
    <div className="tps-add">
      <div className="tps-add-head">
        <strong>Correct this copy</strong>
        <button className="tps-edit" type="button" disabled={saving} onClick={onDone}>Cancel</button>
      </div>
      <p className="tps-add-card">
        <strong>{title}</strong>
        {where ? <span className="tps-dim">{where}</span> : null}
        {/* THE CARD IS SHOWN AND CANNOT BE CHANGED, which is the sentence this
            form makes by having no control for it. */}
        <span className="tps-dim">This stays the same card. Correct what is true about your copy of it.</span>
      </p>
      <CopyFactFields facts={facts} set={set} setGrade={setGrade} disabled={saving} />
      {rawNeedsCondition ? (
        <p className="tps-dim">A raw copy needs a condition.</p>
      ) : null}
      <button className="tps-edit" type="button" disabled={saving || rawNeedsCondition}
        onClick={save}>
        {saving ? "Saving…" : "Save changes"}
      </button>
      {problem ? <p className="tps-add-problem" role="alert">{problem}</p> : null}
    </div>
  );
}

/* ============================================================================
   TAKING A COPY OFF THE SHELF (Phase 5 C5)

   "Remove from inventory" is the shop's sentence; `archived` is the database's,
   and this screen says the first one. The record is kept — every copy MetYet
   has ever been told about is still there — and what stops is the claim to
   have the card.

   WHY IT ASKS. This is the only control on this screen that changes what
   somebody ELSE is told: a Collector with a Goal for this card is being shown
   "Northline has a card you're looking for", and pressing this is what takes
   that away. So the question names the card, says who stops seeing it, and
   makes the confirming press a different press from the opening one. There is
   no undo, because there is no un-archive command in the domain and inventing
   a half of one here would be worse than the honest absence — a shop that
   retires a copy by accident adds it again. */
function RetireCopy({ copy, title, where, onRetire, onDone }) {
  const [problem, setProblem] = useState(null);
  const [working, setWorking] = useState(false);

  const retire = async () => {
    if (working || !onRetire) return;
    setWorking(true); setProblem(null);
    try {
      const answer = await onRetire(copy.invId);
      if (answer && answer.ok === false) {
        setProblem(refusalSentence(answer.refused, null, "remove"));
        setWorking(false);
        return;
      }
      onDone();
    } catch (error) {
      setProblem("MetYet lost contact, so it cannot tell whether that copy was removed. Re-open your inventory before trying again.");
      setWorking(false);
    }
  };

  return (
    <div className="tps-add">
      <div className="tps-add-head">
        <strong>Remove this copy from your inventory?</strong>
      </div>
      <p className="tps-add-card">
        <strong>{title}</strong>
        {where ? <span className="tps-dim">{where}</span> : null}
      </p>
      <p className="tps-dim">
        Collectors in your network will stop being told you have this one. MetYet keeps the
        record — it just stops counting as a card on your shelf. If you get another, add it
        again.
      </p>
      <p className="tps-rec-do">
        <button className="tps-edit" type="button" disabled={working} onClick={retire}>
          {working ? "Removing…" : "Remove it"}
        </button>
        <button className="tps-edit" type="button" disabled={working} onClick={onDone}>
          Keep it
        </button>
      </p>
      {problem ? <p className="tps-add-problem" role="alert">{problem}</p> : null}
    </div>
  );
}

/* The grading vocabulary the domain already has. Not a list this screen
   invented, and deliberately not widened here: another grading company is a
   product decision, not a dropdown. */
const GRADES = ["Raw", "PSA 1", "PSA 2", "PSA 3", "PSA 4", "PSA 5", "PSA 6",
  "PSA 7", "PSA 8", "PSA 9", "PSA 10"];
const CONDITIONS = ["Near Mint", "Lightly Played", "Moderately Played",
  "Heavily Played", "Damaged"];
