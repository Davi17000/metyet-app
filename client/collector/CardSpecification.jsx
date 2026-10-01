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

import React, { useMemo, useRef, useState } from "react";
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

/* NOT ONE OF THE ANSWERS: THE ABSENCE OF ONE.

   A draft may be half-filled — that is what a draft is — so a new copy starts
   with neither button pressed and this is what that looks like in state. It is
   deliberately NOT the word the domain uses: `D.copyDisposition` returns
   "unstated" for a copy that really is stored saying nothing, and
   `gradingOf(copy).state` is "unstated" for a copy whose GRADE nobody has
   stated, which is a third and unrelated thing. One word meaning three things across three layers is how
   a reader comes to believe a draft and a durable record are the same kind of
   claim. They are not: a draft may be unanswered, a durable copy may not. */
const UNANSWERED = "unanswered";

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
  /* A STORED COPY THAT SAYS NOTHING OPENS WITH NEITHER BUTTON PRESSED, and is
     not given an answer by being looked at. Copies recorded before the
     disposition was required are in that state honestly; the panel shows it as
     the absence it is and asks for a decision only when one is being made. */
  disposition: copy.offered === true ? "offered"
    : copy.keeping === true ? "keeping" : UNANSWERED,
  removed: false,
  /* Carried so the row can show what the server says about it without this
     file working any of it out. */
  status: copy.status,
  grading: copy.grading,
});

/* THE TWO THINGS A PERSON CAN MEAN ABOUT ONE COPY THEY OWN. Per COPY, so two
   copies of one card can truthfully disagree.

   "Haven't decided" used to be a third button here and it is gone. A copy that
   says nothing is one MetYet cannot act on — barred from every trade package,
   never shown to a partner — so offering it as a choice was offering a dead
   end. The domain now refuses to create one. */
const DISPOSITIONS = Object.freeze([
  { id: "offered", label: "I'd trade or sell this one" },
  { id: "keeping", label: "I'm keeping this one" },
]);

const BLANK_COPY = { id: null, grade: "", condition: "", cert: "", market: "",
  disposition: UNANSWERED, removed: false, status: null, grading: null };

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
  /* Statements a live DEAL can refuse, held back behind everything it could
     otherwise cost, and statements being TAKEN BACK, held back further still. */
  const corrections = [];

  /* 1. THE CONTAINERS, which name no card and so cannot fail for anything a
     later step says. */
  for (const name of answers.newBinders) steps.push({ kind: "make-binder", name });

  /* 2. WHAT CAN ONLY BE REFUSED FOR WHAT IT SAYS, AND THAT IS THE WHOLE ORDER.

     `commit` stops at the first refusal, because a later step might depend on an
     earlier one. So the order decides what a person LOSES when one statement is
     refused, and the rule is: every step that can only fail on its own terms
     runs before every step a live DEAL can refuse.

     Three commands can be refused for something that is not about what they say:
     `updateGoalCriteria` and `updateGoalTier` answer `goal-locked`, and
     `updateCollectorCopy` answers `copy-committed` when a deal has taken the
     copy. Everything else — recording a copy, saying what you would do with it,
     starting a goal, filing, unfiling — can be refused only for itself.

     THE FIRST ATTEMPT AT THIS GOT IT WRONG, and the correction is the point.
     Demand used to run first, so a Goal held by a deal cost a person the card
     they had just bought. Moving ALL ownership ahead of it mirrored the bug:
     `correct-copy` is deal-refusable too, so a mistyped certificate on a traded
     copy then cost them the tier change. The line is not ownership versus
     demand; it is refusable-for-itself versus refusable-for-a-deal, and the
     corrections below are held back with the criteria for exactly that reason.

     A duplicate physical copy is a legitimate thing to own, so nothing
     downstream can tell an accidental second send from a real second copy, which
     is why creating one still has the least behind it if the sequence stops. */
  for (const draft of answers.copies) {
    const before = draft.id ? byId.get(draft.id) : null;
    if (draft.id && !before) continue;                 // already gone; nothing to do
    if (draft.removed) continue;                       // removals are last; see below
    if (!draft.id) continue;                           // a new copy: handled below
    const patch = {};
    const facts = { grade: draft.grade || null, condition: isRaw(draft.grade) ? (draft.condition || null) : null,
      cert: draft.cert || null, market: draft.market === "" ? null : Number(draft.market) };
    for (const [k, v] of Object.entries(facts)) {
      const was = before[k] === undefined ? null : before[k];
      if (json(v) !== json(was)) patch[k] = v;
    }
    if (Object.keys(patch).length) corrections.push({ kind: "correct-copy", copyId: draft.id, patch });
    /* A CHANGE OF DISPOSITION IS ONE POSITIVE STATEMENT, and it is sent as
       one command. The two setters clear each other in the domain, so a swap
       is a single step: there is no withdraw-then-set, which would pass
       through a state the product does not have.

       AND THERE IS NO STEP FOR GOING BACK TO SAYING NOTHING. Two branches used
       to live here pushing `offered: false` and `keeping: false` onto the
       `withdrawals` list; both are gone with the button that produced them, and
       both setters refuse `false`. So the test below selects one of the two
       positive steps — or, if a draft that HAD an answer is ever set back to
       the sentinel, nothing at all. No control does that today; the panel
       offers two buttons and neither deselects. If one is ever added, silently
       dropping the change is the wrong answer and this is where it would be
       caught.

       A COPY STORED SAYING NOTHING, LEFT ALONE, EMITS NOTHING. Both sides of
       the comparison read `UNANSWERED` for that case, so opening such a copy
       to fix its grade does not ask its owner to decide something else. */
    const was = before.offered === true ? "offered"
      : before.keeping === true ? "keeping" : UNANSWERED;
    if (was !== draft.disposition) {
      if (draft.disposition === "offered") {
        steps.push({ kind: "offering", copyId: draft.id, offered: true });
      } else if (draft.disposition === "keeping") {
        steps.push({ kind: "keeping", copyId: draft.id, keeping: true });
      }
    }
  }
  for (const draft of answers.copies) {
    if (draft.id || draft.removed) continue;
    /* AN UNANSWERED DRAFT IS NOT A STEP.

       Save is already disabled while one exists, so this is not how the person
       is told — but without it the plan still COMPOSES `{ offered: false,
       keeping: false }`, which the domain refuses, and the invariant would live
       in one `if` in the view rather than in the thing that decides what gets
       sent. A plan that cannot express the refused shape is the stronger
       statement, and it is what the tests drive directly. */
    if (draft.disposition === UNANSWERED) continue;
    steps.push({ kind: "record-copy", copy: {
      grade: draft.grade || null,
      condition: isRaw(draft.grade) ? (draft.condition || null) : null,
      cert: draft.cert || null,
      market: draft.market === "" ? null : Number(draft.market),
      offered: draft.disposition === "offered",
      keeping: draft.disposition === "keeping",
    /* `draftId`, because it IS one: the client-side identity of a copy that
       does not have a durable one yet, and the handle the minted id is bound
       back to. The Collector surface's own rule is that every map it builds is
       keyed on an id, and this map is no exception. */
    }, draftId: draft.key });
  }

  /* A NEW Goal belongs up here too: `addGoal` answers only for itself. It is
     `updateGoalCriteria` and `updateGoalTier` — the two that touch a Goal a
     negotiation may already be working from — that wait. */
  const stated = (answers.desired.grade || answers.desired.condition)
    ? { grade: answers.desired.grade || null,
      condition: isRaw(answers.desired.grade) ? (answers.desired.condition || null) : null }
    : null;
  const sameCriteria = (a, b) => (text(a && a.grade) || null) === (text(b && b.grade) || null)
    && (text(a && a.condition) || null) === (text(b && b.condition) || null);
  if (!goal && answers.want !== "none") {
    steps.push({ kind: "start-looking", tier: answers.want, desired: stated });
  }

  /* 3. FILING, WHICH DEPENDS ON NOTHING AND CAN BE REFUSED BY NOTHING BUT A
     BINDER THAT IS NOT YOURS.

     For one batch a card had to be in one of the four states before it could be
     filed, so this block had to follow the ones that put it there. That rule is
     withdrawn: organisation does not decide whether a Goal or a copy is
     meaningful. So filing joins the steps that can only fail on their own terms,
     and a ticked binder is no longer lost to a locked Goal.

     Unfiling comes after filing for the reason it always did — a binder swap
     should not pass through a moment of belonging nowhere. */
  for (const id of answers.binders) {
    if (!filedNow.has(id)) steps.push({ kind: "file", binderId: id });
  }
  for (const id of filedNow) {
    if (!answers.binders.has(id)) steps.push({ kind: "unfile", binderId: id });
  }

  /* 4. AND WHAT A DEAL CAN REFUSE, HELD BACK TO HERE. A correction to a copy a
     shop has taken, and a Goal a negotiation is working from, are the three
     commands that answer for something other than themselves. Nothing above
     them is lost when one of them is. */
  for (const c of corrections) steps.push(c);
  if (goal && answers.want !== "none") {
    if (stated && !sameCriteria(goal.desired, stated)) {
      steps.push({ kind: "wanted-copy", goalId: goal.id, desired: stated });
    }
    if (goal.tier !== answers.want) {
      steps.push({ kind: "how-hard", goalId: goal.id, tier: answers.want });
    }
  }

  /* 5. AND TAKING THINGS AWAY, AFTER EVERYTHING ELSE — INCLUDING WITHDRAWALS.

     A sequence that stops should leave a person with MORE said about their card
     than they started with, never less. Stopping looking, forgetting a copy and
     withdrawing a disposition are all the same kind of act, so they all wait
     until every addition has landed.

     This block also used to carry a second reason, and that one is gone: while
     the domain pruned binder memberships when a card lost its last state, a
     withdrawal sitting earlier in the plan could take a binder's card away in
     the middle of a Save that ended perfectly legal. No prune, no hazard. The
     ordering survives on the first reason alone, which is the one it had before
     the second one existed.

     AND THE `withdrawals` LIST ITSELF IS GONE, with the two disposition
     branches that were its only producers. What is left here is what the
     ordering was always for: giving up a Goal, and letting go of a copy. */
  if (goal && answers.want === "none") steps.push({ kind: "stop-looking", goalId: goal.id });
  for (const draft of answers.copies) {
    if (draft.removed && draft.id && byId.get(draft.id)) {
      steps.push({ kind: "forget-copy", copyId: draft.id });
    }
  }

  /* `steps` is the work; `goal` is read by the panel. `copiesNow`, `myBinders`
     and `filedNow` became unread when the pre-send state check and the
     destruction warning went, and they are kept because they describe the plan's
     own inputs and cost nothing — a caller reasoning about a plan wants them.
     If that stops being true they should go. */
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
  onCommit, onClose, preselectBinder = null }) {
  const canonicalCardId = card && card.canonicalCardId;
  /* A BINDER TICKED BECAUSE OF WHERE SOMEBODY CAME FROM (Phase 5 C3.4). Adding
     cards to a binder opens this with that binder already chosen — which is an
     ANSWER, not a fact: it is a tick in the list the person can undo, it writes
     nothing until Save, and Cancel forgets it like every other answer here.
     Only a binder that exists and is theirs can be preselected, because the
     tick has to correspond to a real checkbox. */
  const [answers, setAnswers] = useState(() => {
    const start = initialAnswers(state, canonicalCardId);
    const real = preselectBinder
      && rows(state && state.binders).some((b) => b.id === preselectBinder && !b.archivedAt);
    if (!real) return start;
    const binders = new Set(start.binders);
    binders.add(preselectBinder);
    return { ...start, binders };
  });
  const [newBinderName, setNewBinderName] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(null);
  const [done, setDone] = useState(null);
  /* One sentence after a new goal is saved, and nothing else ever sets it
     (Phase 5 C5). Presentation only: it is gone when the panel closes. */
  const [saved, setSaved] = useState(null);
  /* THE PANEL STOPS TAKING ANSWERS ONCE IT HAS SAID SOMETHING LANDED.
     Before C5 a successful commit closed the panel, so this state did not
     exist. With a confirmation held open, leaving the controls live would have
     let somebody tick another binder or add a copy after the sentence, press
     "Done", and lose it silently — the panel would close without a second
     commit and nothing would say so. Frozen, the sentence is the end of the
     interaction, which is what it reads as. */
  const locked = saving || !!saved;
  /* How many shops this Collector deals with, from the projection they already
     received. Used for one thing — deciding which of two true sentences to say
     above — and it names nobody. */
  const partnerCount = rows(state && state.partners).length;
  /* A DRAFT'S IDENTITY, MINTED SYNCHRONOUSLY. This was `useState`, read from
     the render closure while the list itself was updated functionally — so two
     "I own one of these" in one batched render both produced `new-1`. That was
     survivable while nothing read the key; it stopped being survivable the
     moment the minted copy id is bound back by it, because one id would bind to
     two drafts and a later "I no longer own this" would remove the wrong copy.
     A ref is incremented at the moment of the click, batching or not. */
  const nextKey = useRef(1);

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
    const key = `new-${nextKey.current}`;
    nextKey.current += 1;
    setAnswers((a) => ({ ...a, copies: [...a.copies, { ...BLANK_COPY, key }] }));
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
      /* A NEW COPY HAS TO SAY WHICH, AND AN EXISTING ONE DOES NOT.

         The domain refuses to create a copy with no disposition, so without
         this check Save would be enabled over a guaranteed refusal — the exact
         defect the four-state batch shipped with "Add cards to this binder".
         It is the same shape as the Goal's requirement three lines above.

         `draft.id` is the whole test. A copy already recorded saying nothing is
         in a state the product no longer creates but does still hold, and
         demanding a decision before its owner may correct a grade would make
         this batch's rule retroactive through the back door. */
      if (!draft.id && draft.disposition === UNANSWERED) {
        return "Say whether you'd part with that copy or you're keeping it.";
      }
    }
    return null;
  })();

  /* THE COPY THE SERVER JUST MINTED, BOUND TO THE DRAFT THAT ASKED FOR IT.

     A retry is the whole reason this panel recomputes its plan instead of
     replaying it, and for every other step it works: a Goal that exists is not
     created twice, a binder entry is idempotent. A NEW COPY was the exception,
     because the draft that produced it carried `id: null` and nothing ever
     filled that in — the step's draft id was written and read by nothing. So a
     Save where `record-copy` succeeded and a later step failed left the person
     holding the panel's own promise — "pressing Save again sends only what is
     left" — over a button that would record a SECOND physical copy.

     THE FIX IS THE ID THE SERVER ALREADY RETURNS, not a comparison of contents.
     Two genuinely identical copies are a legitimate thing to own, so nothing
     here may de-duplicate by grade, cert or card: the only safe handle is the
     durable id `addCollectorCopy` mints, which `execute` already hands back as
     `value` and which this file was simply discarding. Each draft is bound by
     its own `draftId`, so two new copies in one Save keep two distinct ids and
     a failure after the first leaves exactly one bound.

     ADOPTED ON EVERY EXIT, including the refusal and the lost-contact paths,
     because those are precisely the paths a retry follows. */
  const adopt = (minted) => {
    if (!minted.size) return;
    setAnswers((a) => ({ ...a, copies: a.copies.map((d) => (d.id == null && minted.has(d.key)
      ? { ...d, id: minted.get(d.key) } : d)) }));
  };

  const commit = async () => {
    if (saving || localProblem) return;
    setSaving(true); setProblem(null); setDone(null); setSaved(null);
    /* The difference, recomputed from whatever the server last said — which on
       a second press is the state the first press left behind. */
    const { steps } = planFrom(state, canonicalCardId, answers);
    const finished = [];
    const minted = new Map();
    try {
      for (const step of steps) {
        const answer = await onCommit(step, canonicalCardId);
        if (answer && answer.ok === false) {
          /* STOP. A later step may depend on this one — the Goal that criteria
             would change, the binder an entry would name — and continuing past
             a refusal is how a person ends up with a commit that half means
             something else. */
          adopt(minted);
          setDone(finished);
          setProblem(explain(step, answer.refused, finished));
          setSaving(false);
          return;
        }
        if (step.kind === "record-copy" && step.draftId
          && answer && typeof answer.value === "string" && answer.value) {
          minted.set(step.draftId, answer.value);
        }
        finished.push(step);
      }
      adopt(minted);
      /* SAYING WHERE A NEW GOAL WENT (Phase 5 C5). Everything else this panel
         does is visible the moment it closes — a binder gains a card, Your
         Cards gains a copy, a tier changes in front of you. A GOAL is the one
         durable thing whose point is somebody ELSE seeing it, and until now the
         panel closed on it in silence: a person said what they were hunting and
         was told nothing about where it had gone.

         So one sentence, on the one step that earns it, using a fact this panel
         already holds. It is not a confirmation screen: the panel is already
         open, the row of buttons it replaces is the same row, and nothing is
         stored, queued or announced. It does not name a shop and it does not
         claim anybody has looked — only that the goal is now something the
         Collector's Trusted Partners can see, which is what the projection
         does. When there is no partner yet it says the true version of that
         instead, because "your Trusted Partners can see it" is a promise to
         nobody when the network is empty. */
      if (finished.some((s) => s.kind === "start-looking")) {
        setSaved(
          partnerCount > 0
            ? "Saved. Your Trusted Partners can see this goal, so they know to look out for it."
            : "Saved. When you join a shop's Collector Network, they'll see what you're looking for.");
        setSaving(false);
        return;
      }
      onClose();
    } catch (error) {
      adopt(minted);
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
          {/* CLOSING IS ALWAYS ALLOWED, except mid-request. Every other control
              freezes once something has been saved; this one must not, or a
              confirmation would be a panel a person cannot leave from the top.
              It says "Done" then, because there is nothing left to cancel. */}
          <button className="mcs-go quiet" type="button" onClick={onClose} disabled={saving}>
            {saved ? "Done" : "Cancel"}
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
                      disabled={locked} onChange={() => toggleBinder(b.id)} />
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
              aria-label="New binder name" disabled={locked}
              onChange={(e) => setNewBinderName(e.target.value)} />
            <button className="mcs-go quiet" type="button" disabled={locked || !newBinderName.trim()}
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
                disabled={locked}
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
                <select value={answers.desired.grade} disabled={locked}
                  onChange={(e) => patch({ desired: { grade: e.target.value,
                    condition: isRaw(e.target.value) ? answers.desired.condition : "" } })}>
                  <option value="" disabled>Choose a grade</option>
                  {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              {isRaw(answers.desired.grade) ? (
                <label className="mcs-field">
                  <span>Condition wanted</span>
                  <select value={answers.desired.condition} disabled={locked}
                    onChange={(e) => patch({ desired: { ...answers.desired, condition: e.target.value } })}>
                    <option value="" disabled>Choose a condition</option>
                    {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              ) : null}
            </>
          ) : null}

          {/* WHAT IS DELIBERATELY NOT HERE (Phase 5 C5): a count of how many of
              your Trusted Partners have this card.

              It said "2 of your Trusted Partners have this" and named neither.
              Three things were wrong with it. It was anonymous on a screen
              whose whole argument is that MetYet answers with names — the
              Trusted Partners section says "Northline has a card you're looking
              for", and a bare number beside it is a weaker answer to a question
              nobody asked. It appeared only when this panel was opened from
              Browse, because that is the only caller that passed the count, so
              the same card told a person two different things depending on the
              door they came through. And it answered "who has it" while every
              other named answer in the product answers "who has something you
              asked for", which needs a Goal — so the two could disagree without
              either being wrong.

              Nothing depended on it: it was presentation, computed in Browse
              from rows the server had already sent, and no command, step or
              stored fact ever read it. Specifying a card is saying which copy
              you want and how hard you are looking; who happens to hold one is
              a different question, answered properly elsewhere. */}
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
                        <button className="mcs-linkish" type="button" disabled={locked}
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
                          <select value={draft.grade} disabled={locked}
                            onChange={(e) => setCopy(key, { grade: e.target.value,
                              condition: isRaw(e.target.value) ? draft.condition : "" })}>
                            <option value="">Not stated</option>
                            {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </label>
                        {isRaw(draft.grade) ? (
                          <label className="mcs-field">
                            <span>Condition</span>
                            <select value={draft.condition} disabled={locked}
                              onChange={(e) => setCopy(key, { condition: e.target.value })}>
                              <option value="" disabled>Choose a condition</option>
                              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </label>
                        ) : null}
                        <label className="mcs-field">
                          <span>Certificate</span>
                          <input value={draft.cert} inputMode="numeric" disabled={locked}
                            onChange={(e) => setCopy(key, { cert: e.target.value })} />
                        </label>
                        <label className="mcs-field">
                          <span>Your reference value</span>
                          <input value={draft.market} inputMode="decimal" disabled={locked}
                            onChange={(e) => setCopy(key, { market: e.target.value })} />
                        </label>
                        {/* OWNING IS THE ROW; WHAT YOU MEAN TO DO WITH IT IS
                            THIS. Two answers, and neither of them pressed until
                            the person presses one — parting with a card and
                            committing to keep one are both decisions, and a
                            decision nobody made is still not one to assume.
                            What changed is where the silence may live: a draft
                            may sit unanswered, a recorded copy may not, so a
                            new copy cannot be saved until this is answered and
                            an old one that never answered is left as it is. */}
                        <p className="mcs-disp" role="group"
                          aria-label="What you mean to do with this copy">
                          {DISPOSITIONS.map((d) => (
                            <button key={d.id} type="button" disabled={locked}
                              className={`mcs-go${draft.disposition === d.id ? "" : " quiet"}`}
                              aria-pressed={draft.disposition === d.id}
                              onClick={() => setCopy(key, { disposition: d.id })}>
                              {d.label}
                            </button>
                          ))}
                        </p>
                        {draft.id ? (
                          <p>
                            <button className="mcs-linkish" type="button" disabled={locked}
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
            <button className="mcs-go quiet" type="button" disabled={locked} onClick={addCopy}>
              I own one of these
            </button>
          </p>
        </section>

        {problem ? <p className="mcs-add-problem" role="alert">{problem}</p> : null}
        {!problem && localProblem ? <p className="mcs-dim">{localProblem}</p> : null}
        {saved ? <p className="mcs-spec-saved" role="status">{saved}</p> : null}

        <p className="mcs-goal-do">
          {saved ? (
            <button className="mcs-go" type="button" onClick={onClose}>Done</button>
          ) : (
            <>
              <button className="mcs-go" type="button" disabled={locked || !!localProblem || !shown}
                onClick={commit}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button className="mcs-go quiet" type="button" onClick={onClose} disabled={locked}>
                Cancel
              </button>
            </>
          )}
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
  "keeping": "what you're keeping was saved",
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
  "keeping": "what you're keeping could not be saved",
  "forget-copy": "that copy could not be removed",
  "record-copy": "that copy could not be recorded",
};
const WHY = {
  /* A COPY, NOT A CARD. `gradingProblem` is about one physical object — or
     about a Goal's criteria for one — and never about a card in the abstract. */
  "grading-incoherent": "A copy cannot be both graded and in a raw condition.",
  "criteria-required": "A goal has to say which copy you're after.",
  "duplicate-goal": "That card is already on your list.",
  "goal-locked": "This card is part of an active deal.",
  "copy-committed": "That copy is committed to a deal.",
  "copy-reserved": "That copy is reserved for a deal.",
  "copy-in-use": "That copy is part of a deal.",
  "name-required": "A binder needs a name.",
  "card-unavailable": "MetYet can no longer use that version of the card.",
  "invalid-amount": "A reference value has to be a number, and not a negative one.",
  /* This panel offers three buttons and can only send one of two tiers, so
     nothing here reaches it today. It is written anyway: the domain now refuses
     a tier it was never given, and a refusal with no sentence behind it reaches
     a Collector as a blank. */
  "invalid-tier": "A goal has to say whether you're hunting it or keeping an eye out.",
  "identity-immutable": "That part of a copy cannot be changed.",
  "disposition-conflict": "A copy is either one you'd part with or one you're "
    + "keeping — not both.",
  /* AND THE OPPOSITE FAILURE, WHICH IS THE NEW ONE. Two things keep this off
     this screen: Save is disabled while a new copy has no answer, and `planFrom`
     emits no step for one. But `addCollectorCopy` and both setters are on the
     exposed command list, and a refusal with no sentence behind it reaches a
     Collector as a blank. */
  "invalid-disposition": "A copy has to say whether you'd part with it or "
    + "you're keeping it.",
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
