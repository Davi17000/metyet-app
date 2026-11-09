/* ============================================================================
   THE COMMAND LAYER — ONE AUTHORITATIVE MUTATION BOUNDARY (Phase 1)

     execute(state, actor, command, payload, runtime)
       -> { ok, state, value } | { ok:false, refused }

   Every product mutation in MetYet is one of the commands below. Each is a pure
   function of (current state, actor, payload, runtime context): it validates
   first and returns either the complete next state or a refusal, so a refused
   command changes nothing — refusal is atomic by construction.

   THE RUNTIME OWNS TIME AND IDENTIFIERS (Phase 3). Every authoritative
   timestamp a command writes is `ctx.at` / `ctx.now()`, and every record id it
   mints is `ctx.id(prefix)` — see metyet-runtime.js. The payload's `at` is
   removed before dispatch, so no command can read a caller's clock. A server
   injects an authoritative runtime and every caller proposal (a time, an id) is
   ignored; the in-process prototype store injects the explicit prototype
   adapter, which honours them.

   THE ACTOR IS THE ONLY SOURCE OF IDENTITY. The seat (Trusted Partner or
   Collector) is derived from the actor's id and its existence in state. Nothing
   a caller puts in the payload — `by`, `partnerId`, `collectorId`, a seat, an
   owner — is trusted for authority. In production the actor comes from an
   authenticated session; in this in-process prototype the persona shell mints
   it. That, and which runtime is injected, are the only differences Phase 3
   needs to make.

   Rules enforced here, per METYET-DOMAIN-CONTRACT.md:
     participant / ownership / Relationship · lifecycle stage · active vs
     terminal · canonical turn owner (D.nextActor, D.cardOwner) · Goal locks ·
     InventoryCopy commitment · BinderCopy reservation / commitment · final
     agreement belongs to the current economic state · cancellation / completion.

   Refusals name the rule, never another collector, deal or price.
   ========================================================================== */

const D = require("./metyet-domain.js");
const RT = require("./metyet-runtime.js");
const R = D.REFUSE;

/* ------------------------------------------------------------------ helpers */
const refuse = (code) => ({ ok: false, refused: code });
const done = (state, value) => ({ ok: true, state, value });
const list = (xs) => xs || [];

/* EXACTLY ONE OBJECT, OR NOTHING (Batch 3A). A Binder membership names one Goal
   or one CollectorCopy. Both is a contradiction, neither is silence, and a
   blank is neither wearing an id's clothes — `isId` does not trim anywhere in
   this repository, so a whitespace id would otherwise travel all the way to a
   foreign key and come back as a database error instead of a refusal. */
const idText = (v) => (typeof v === "string" && v.trim() ? v : null);
const oneTarget = (goalId, collectorCopyId) => {
  const goal = idText(goalId);
  const copy = idText(collectorCopyId);
  if (goal && copy) return null;
  if (goal) return { kind: "goal", id: goal };
  if (copy) return { kind: "copy", id: copy };
  return null;
};

/* THE ONE PLACE A COPY'S DISPOSITION IS WRITTEN, AND THE TWO FIELDS ARE NOT
   ALIKE.

   `offered` is a field every copy has carried since C2, and `false` is its
   honest resting value. `keeping` is not: the ABSENCE of the key is what "I
   have not decided" looks like, it is what every copy written before PC existed
   looks like, and the two must stay indistinguishable — otherwise MetYet is
   storing a decision nobody made.

   So a keep that is withdrawn, or cleared because an offer contradicted it,
   REMOVES the key rather than writing `false`. Writing `false` everywhere would
   dress "unstated" up as a decision, and migration 0012 exists because exactly
   that confusion once cost a Collector their visible supply. */
const withDisposition = (copy, offered, keeping, at) => {
  const { keeping: _withdrawn, ...rest } = copy;
  return { ...rest, offered: offered === true,
    ...(keeping === true ? { keeping: true } : {}),
    ...(at ? { updatedAt: at } : {}) };
};

/* Derive the seat from identity. An actor names exactly one of partnerId or
   collectorId, and that record must exist. Any `seat` the caller supplies is
   ignored. */
function resolveActor(state, actor) {
  if (!actor || typeof actor !== "object") return null;
  const hasP = actor.partnerId != null && actor.partnerId !== "";
  const hasC = actor.collectorId != null && actor.collectorId !== "";
  if (hasP === hasC) return null;
  if (hasP) {
    return list(state.partners).some((p) => p.id === actor.partnerId)
      ? Object.freeze({ seat: "tp", partnerId: actor.partnerId }) : null;
  }
  return list(state.collectors).some((c) => c.id === actor.collectorId)
    ? Object.freeze({ seat: "collector", collectorId: actor.collectorId }) : null;
}

const isRelated = (state, partnerId, collectorId) => list(state.relationships)
  .some((r) => r.partnerId === partnerId && r.collectorId === collectorId
    && (r.status == null || r.status === "accepted"));

/* NO NEW COMMITMENT OUTSIDE A TRUSTED RELATIONSHIP (M3B B2.5, founder-approved).
   Starting a deal and choosing or holding a Collector's cards have always
   needed a current relationship; every later step that makes or changes a
   commitment — a price, a trade value, a percentage, cash only, the final
   balance, final agreement, and a shop marking its card pending for the deal —
   now asks the same question of the deal's own two parties and refuses with
   `no-relationship` when the answer is no.

   WAYS OUT STAY OPEN, ON PURPOSE. Withdrawing a card, declining one,
   deselecting, holding, ending the deal or declining the offer, releasing a
   pending mark, deal messages and marking a deal viewed are not commitments:
   they are how either person releases themselves — and the Collector their
   cards — from a negotiation that can no longer finish. A deal already finally
   agreed is an obligation made while the trust held, so Fulfillment and
   handoff are untouched. Nothing here ends a deal or releases a hold by
   itself. */
const pairTrusted = (state, o) => isRelated(state, o.partnerId, o.collectorId);

const cardById = (state, id) => list(state.catalog).find((c) => c.id === id) || null;
const oppById = (state, id) => list(state.opportunities).find((o) => o.id === id) || null;
const seatOf = (a) => a.seat;
const isParticipant = (a, o) => (a.seat === "tp" ? o.partnerId === a.partnerId
  : o.collectorId === a.collectorId);
const myTurn = (a, o) => D.seatOfActor(D.nextActor(o).actor) === a.seat;
/* The actor owns the turn AND the turn is for this kind of move. Owning the
   turn is not enough: the collector owns the turn to confirm a plan, which is
   not a turn to confirm receipt. */
const turnFor = (a, o, ...reasons) => myTurn(a, o) && reasons.includes(D.nextActor(o).reason);
const withOpp = (state, oppId, fn) => ({ ...state,
  opportunities: list(state.opportunities).map((o) => (o.id === oppId ? fn(o) : o)) });
const stamp = (o, at) => (at ? { ...o, updated: at } : o);
/* Two lists naming the same ids, in any order — how a caller's `expect` is
   compared with the deal as it stands now. */
const sameIdSet = (xs, ys) => {
  const a = new Set(list(xs)); const b = new Set(list(ys));
  return a.size === b.size && list(xs).length === a.size && [...a].every((x) => b.has(x));
};
const validMoney = (n) => typeof n === "number" && isFinite(n);
/* A price in MetYet's terms: a whole number of dollars above zero (Batch 2.1). */
const wholeDollars = (n) => Number.isSafeInteger(n) && n > 0;
/* A partner's note on a declined card (M3B D7): one short line, optional. */
const DECLINE_NOTE_MAX = 140;
/* A trade percentage in MetYet's terms (M3B D1): a fraction whose percentage is
   a whole number from 1 to 100. */
const wholePercent = (p) => {
  if (!validMoney(p)) return false;
  const pct = Math.round(p * 100);
  return pct >= 1 && pct <= 100 && Math.abs(p * 100 - pct) < 1e-9;
};

/* A label a person typed, or nothing. Trimmed to one line and capped, because a
   hint is for recognising an invitation in a list — not a place to put a
   paragraph. Empty becomes null: a missing hint is missing, not "". */
const HINT_MAX = 120;
const hint = (value) => {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, HINT_MAX) : null;
};

/* CAN THIS OPPORTUNITY STILL TALK ABOUT THIS PHYSICAL CARD? (Option B, Item 0)

   Deliberately NOT `status !== "available" → refuse`. Availability is a fact
   about the card and this is a question about one conversation, and the two
   differ in exactly the cases that matter: a card that is pending for YOUR
   deal, or committed to YOUR deal, is unavailable to the world and perfectly
   fine for you to keep working on. A flat availability check would stop the
   winning deal along with the losing ones.

   So this asks, for one opportunity: is the card gone, or is somebody else's
   claim on it standing in the way of mine?

     archived / sold          -> copy-unavailable   the card is not there
     pending for another deal -> copy-pending       the partner is working on it
     committed to another     -> copy-committed     two people agreed a deal
     anything else            -> null               carry on

   Returns a refusal reason, or null. It names no ids: a collector learns that
   the shop is working on this card with somebody, never who.

   AND NAMING NO IDS WAS NOT ENOUGH. Three distinct answers are themselves the
   disclosure: a collector who may send a command may send it repeatedly, and
   pending / committed / unavailable read back as a rival negotiation's stage,
   polled as often as they like. The projection had held this line from the
   start — a copy held by somebody else's deal reads `unavailable` throughout —
   and the command layer quietly undid it. So the distinctions stay in the
   DOMAIN, where they are three different things, and are shaped on the way out
   to the seat asking. See `publicCopyRefusal`. */
function copyBlockedFor(state, o, a) {
  const invId = o && o.invId;
  if (invId == null) return null;
  const copy = list(state.inventory).find((i) => i.invId === invId);
  if (!copy || copy.archived) return shapeCopyRefusal(R.copyUnavailable, copy, a);
  if (D.soldInventoryIds(state.opportunities).has(invId)) return shapeCopyRefusal(R.copyUnavailable, copy, a);
  const pendingFor = D.INVARIANTS.copyPendingFor(invId, state.inventory, state.opportunities);
  if (pendingFor && pendingFor !== o.id) return shapeCopyRefusal(R.copyPending, copy, a);
  if (D.INVARIANTS.copyCommittedTo(invId, state.opportunities, o.id)) return shapeCopyRefusal(R.copyCommitted, copy, a);
  return null;
}

/* WHAT A REFUSAL ABOUT SOMEBODY ELSE'S CARD MAY SAY, AND TO WHOM.
   One public answer for everyone who does not own the card:

     copy-unavailable    this copy is not available for you to progress.

   That is the whole of what a collector needs. Whether the shop has pencilled
   it in for another conversation, shaken hands on one, or already handed the
   card over changes nothing they can do about it, and each of those answers
   would be a fact about a person they are not owed.

   THE PARTNER WHO OWNS THE CARD KEEPS THE TRUTH, because it is theirs and
   because they act on it: "you already promised this" (cancel that deal first)
   and "you already pencilled it in" (release it, then re-mark) are different
   instructions, and `setCopyPending` exists to be answered precisely. Nothing
   is disclosed to them that is not already on their own inventory row, which
   carries the derived status and `pendingFor` outright.

   THE COLLECTOR WHOSE OWN DEAL HOLDS THE CARD loses nothing here, and this is
   worth stating because it looks like the risky case and is not: `copyBlockedFor`
   exempts their own opportunity, so they never receive any of these three
   reasons about the copy they control. What they are told — not-your-turn,
   wrong-stage, terminal — comes from the turn and stage rules, and their status
   comes from their own projected row. Verified by probe across all four states
   before this was written. */
const shapeCopyRefusal = (reason, copy, a) =>
  (a && a.seat === "tp" && copy && copy.partnerId === a.partnerId ? reason : R.copyUnavailable);

/* WHEN THE PARTNER MAY STILL RESTATE WHAT THE CARD IS.

   The protected window is `copyInLiveDeal` OR sold — the same two halves the
   certificate lock already used, and deliberately NOT the availability
   boundary. Option B separated those on purpose: "may somebody else pursue
   this?" moved to final agreement, "may the partner still CHANGE this?" did
   not. From the moment a value is settled somebody is reasoning about this
   exact slab; after completion somebody owns it and the record is what they
   bought.

   PROTECTED: cert, grade, condition — the facts that say what the object IS.
   NOT PROTECTED: ask, cost, acquired, note — the shop's own bookkeeping.

   PHOTOGRAPHS ARE THE INTERESTING ONE, because a Collector can ASK for them and
   fulfilling that request is a good thing to allow. The architecture settles it
   without needing a new subsystem, once you read what a photo actually is here:
   `copyPhotographed` is `front && back`, so a copy has exactly two named slots,
   not a growing collection — and `requestPhotos` returns early once both are
   filled, so a photo request can only ever EXIST for an empty slot. Fulfilling
   one therefore always means filling an empty slot, and never means changing a
   filled one. That is the whole distinction, and it is already in the code:

     empty -> a photograph      evidence arriving.      allowed
     a photograph -> another    evidence rewritten.     refused
     a photograph -> empty      evidence withdrawn.     refused

   So the Collector who asked to see the back of the card still gets it, in the
   winning deal or any other, and nobody can quietly restage the picture the
   deal was agreed on. */
const PROTECTED_COPY_FACTS = ["cert", "grade", "condition"];
const copyEditProtected = (state, invId) =>
  !!(D.INVARIANTS.copyInLiveDeal(invId, state.opportunities)
    || D.soldInventoryIds(state.opportunities).has(invId));

/* THE GUARD IS GIVEN THE PHOTOGRAPHS THAT WILL EXIST AFTERWARDS, NOT THE PATCH.

   The first version of this read the patch slot by slot and treated a slot the
   patch did not mention as "unchanged". `updateInventoryCopy` does not merge —
   it assigns `photos` wholesale — so a slot the patch did not mention is
   DELETED. Guard and write disagreed about what a patch means, and the gap was
   the whole protection: `{photos: {}}` mentioned no slot, so the guard saw no
   rewrite, and the write emptied both. Then refilling them was the
   deliberately-allowed empty-slot case. Two calls, on the exposed command, and
   the photographs on a sold card were somebody else's.

   So each caller now computes the photographs its own write will produce and
   hands those over. There is no way to describe an edit the guard will not see,
   because it is no longer reading a description. */
/* A PHOTOGRAPH REFERENCE IS A STRING. `photoSlot` below answers "does this slot
   hold something", which the guard compares; this answers the narrower question
   "is what it holds a usable reference", and it is what NORMALISATION stores. An
   adversarial run found `{ front: {}, back: {} }` satisfying `copyPhotographed`,
   so a copy with no evidence at all read as fully photographed and the Collector
   was refused the chance to ask for any. */
const photoRef = (v) => (typeof v === "string" && v !== "" ? v : null);
/* WHAT A SHOP MAY SAY ABOUT A FACE. A reference, or `null` to say there is
   none. Anything else is input nobody can store, and the answer to that is a
   refusal — NOT a coercion. An adversarial run caught the coercion: it turned
   `front: {}` from "junk masquerading as evidence" into "junk deleting
   evidence", erasing a real photograph on a success. The length bound is here
   because this is a newly exposed door and a reference is an address, not a
   payload; `updateInventoryCopy` still has none, which is written down as debt
   rather than fixed inconsistently in one place. */
const FACE_MAX = 2048;
const unusableFace = (v) => v !== undefined && v !== null
  && !(typeof v === "string" && v !== "" && v.length <= FACE_MAX);
const photographs = (value) => ({ front: photoRef(value && value.front),
  back: photoRef(value && value.back) });

const photoSlot = (photos, slot) => {
  const v = photos && typeof photos === "object" ? photos[slot] : undefined;
  return v === undefined || v === null || v === "" ? null : v;
};
const photographsRewritten = (before, after) => ["front", "back"].some((slot) => {
  const had = photoSlot(before, slot);
  return had !== null && photoSlot(after, slot) !== had;
});
function protectedCopyEdit(state, invId, copy, facts, nextPhotos) {
  if (!copyEditProtected(state, invId)) return false;
  const p = facts || {};
  for (const k of PROTECTED_COPY_FACTS) if (k in p && p[k] !== copy[k]) return true;
  if (nextPhotos !== undefined && photographsRewritten(copy.photos, nextPhotos)) return true;
  return false;
}

/* Standard gate for a command on an existing opportunity: it must exist, the
   actor must be a participant, and it must still be active. */
function oppGate(state, a, oppId) {
  const o = oppById(state, oppId);
  if (!o) return { refused: R.notFound };
  if (!isParticipant(a, o)) return { refused: R.notParticipant };
  if (!D.isActive(o)) return { refused: R.terminal };
  return { o };
}

/* IS THE CALLER LOOKING AT THE DEAL AS IT STANDS? (M3A A1). `expect` is
   optional — a caller that sends none keeps today's behaviour — but a caller
   that sends it is saying "this balance, these cards", and if either has moved
   the command must not act on a deal the person never saw. */
function termsChanged(o, expect) {
  if (expect == null) return false;
  if (typeof expect !== "object" || Array.isArray(expect)) return true;
  if ("balance" in expect && expect.balance !== D.currentCashFigure(o)) return true;
  if ("tradeCardIds" in expect
    && !(Array.isArray(expect.tradeCardIds)
      && sameIdSet(expect.tradeCardIds, D.TRADE.liveTradeRows(o).map((c) => c.id)))) return true;
  return false;
}

/* THE SHOP'S CARD IS NO LONGER AVAILABLE TO THESE DEALS (M3A A1).

   Ends every active deal on `invId` except `exceptOppId`, with the ordinary
   ending fields and `outcome: "card-unavailable"`. Called by the command that
   made the card unavailable, inside the same write, so there is no moment at
   which a deal is apparently active over a card it can never have:
     acceptDeal           another deal reached final agreement on the copy
     removeInventoryCopy  the partner took the copy off the shelf

   `endedBy` is null because no participant ended it; the event did. History is
   untouched — threads, trade rows, snapshots, messages — and because an ended
   deal holds nothing, its Goal is free, its trade cards are released and every
   later command on it is refused as terminal. A temporary hold (`pendingFor`)
   never calls this. */
function endUnavailable(state, invId, exceptOppId, at) {
  if (invId == null) return state;
  return { ...state, opportunities: list(state.opportunities).map((o) =>
    (o.invId === invId && o.id !== exceptOppId && D.isActive(o)
      ? { ...o, declined: true, endedBy: null, endedAt: at || null, endedStage: o.stage,
        endedReason: null, outcome: "card-unavailable", ...(at ? { updated: at } : {}) }
      : o)) };
}

/* ----------------------------------------------------------------- commands */
const COMMANDS = {

  /* ------------------------------------------------------------ catalog */
  /* Resolve an exact identity to one canonical catalog record, creating it
     once when that printing/grade combination has never been recorded. */
  resolveCardIdentity(state, a, { identity }) {
    if (!identity || !identity.name) return refuse(R.notFound);
    const key = D.identityKey(identity);
    const hit = list(state.catalog).find((c) => D.identityKey(c) === key);
    if (hit) return done(state, { id: hit.id, card: hit });
    let id = "c" + key.replace(/[^a-z0-9]+/g, "").slice(0, 24) + "-" + list(state.catalog).length;
    while (list(state.catalog).some((c) => c.id === id)) id += "x";
    const card = { ...identity, id };
    delete card.variants;
    return done({ ...state, catalog: [...list(state.catalog), card] }, { id, card });
  },

  /* ------------------------------------------------------------ goals */
  /* EXPLICIT DEMAND FOR ONE EXACT CARD (Phase 5 Batch 7).

     A Goal is a Collector saying they want this card and want their Trusted
     Partner to know it. It is never inferred: nothing searched, filtered,
     viewed or clicked produces one, and there is no path into this command but
     a person choosing.

     TWO WAYS TO NAME THE CARD, as with an inventory copy since Batch 6.
     `canonicalCardId` is the production way — an opaque catalog id the server
     resolves and refuses when unknown or withdrawn, before this runs.
     `cardId` is the demo's, resolved against the world's own catalogue here.

     ONE GOAL PER COLLECTOR PER EXACT CARD, which is the rule this command has
     always had; Batch 7 makes the test exact canonical identity rather than a
     description. Different printings are different canonical cards and are not
     duplicates: wanting the 1st Edition and wanting the Unlimited are two
     different things to want.

     WHAT THE CALLER MAY NOT NAME. Not the collector — ownership comes from the
     authenticated actor. Not a partner, not a relationship: a Goal is addressed
     to a Collector's whole network by being theirs, and there is no field here
     for anybody else.

     WHAT A GOAL MAY NOW SAY, AND WHY IT IS CALLED `desired` (Phase 5 C3.2).

     Until C3.2 the comment above ended "Not a grade or a condition: those
     describe a physical copy, and demand is for a printing." Half of that is
     still true and half of it was never the whole story. Which CARD somebody
     wants is a printing — that has not changed. But WHICH COPY OF IT they are
     trying to get is a real part of what they are asking their partners for,
     and a Collector hunting a Raw Near Mint is not asking for the same thing as
     one hunting a PSA 10.

     So a Goal may carry `desired: { grade, condition }`, and the name is doing
     work. `goal.grade` and `copy.grade` would read alike and mean "hoped for"
     and "is" — the kind of collision that produces a bug nobody sees in review.
     `desired` cannot be mistaken for a fact about an object.

     IT IS PREFERENCE, NOT A FILTER. Discovery matches on the exact canonical
     card and reads none of this (metyet-discovery.js). A partner holding a
     PSA 8 of the card somebody wants Raw still surfaces, and the criteria tell
     them how close it is. Narrowing demand to an exact grade would hide
     conversations both people wanted to have.

     AND IT IS OPTIONAL, FOR NOW. A Collector's live way to say "I'm looking for
     this" is Browse, which has no grade control — that control is C3.3's Card
     Specification surface. Requiring a grade here before that exists would make
     the shipped app's primary action fail for everybody, so the requirement
     lands in the batch that ships the means to satisfy it. What IS enforced
     from today is that criteria, WHEN GIVEN, must be sayable: `gradingProblem`
     is the same one rule a physical copy answers.

     A BARE `grade` OR `condition` IS REFUSED RATHER THAN DROPPED. It used to be
     silently discarded — the caller got a 200 and lost the data, which is worse
     than a refusal because nothing said so. */
  addGoal(state, a, { cardId, canonicalCardId, tier, note, desired, grade, condition }, ctx) {
    if (a.seat !== "collector") return refuse(R.notOwner);
    /* A TIER IS CHOSEN, NOT DEFAULTED.

       The goal row below used to read `tier === "primary" ? "primary" :
       "secondary"`, which is not a validation — it is an answer invented on the
       caller's behalf. `undefined`, `null`, `""`, `"Primary"`, `"PRIMARY"`,
       `"banana"`, `1` and `{}` all became a Secondary Goal, were stored, and
       came back 200. The Collector was never told, and the tier is what
       `startOpportunity` reads to decide whether this Goal may begin a deal, so
       a fumbled field quietly closed the door the Goal exists to open.

       PLACED HERE, WITH THE OTHER QUESTIONS ABOUT THE REQUEST ITSELF. The seat
       check comes first because who is asking precedes what they asked; after
       that, everything this command can answer without reading the world is
       answered before anything that reads it. That is the same order
       `updateGoalTier` keeps, and it is what makes the answer stable: a
       malformed tier gets the same refusal whether or not the Collector
       happens to already have a Goal for that card.

       It is also before `ctx.id("g")` below, which advances the runtime's id
       sequence the moment it is called. A refusal here consumes nothing. */
    if (!D.GOAL_TIERS.includes(tier)) return refuse(R.invalidTier);
    if (grade !== undefined || condition !== undefined) return refuse(R.gradingIncoherent);
    if (desired !== undefined && (desired === null || typeof desired !== "object" || Array.isArray(desired))) {
      return refuse(R.gradingIncoherent);
    }
    if (desired && Object.keys(desired).some((k) => k !== "grade" && k !== "condition")) {
      return refuse(R.gradingIncoherent);
    }
    /* A NON-STRING IS REFUSED, NOT IGNORED. `gradingProblem` reads anything
       that is not a string as "not stated", which is right for a record but
       wrong for a request: `{ grade: 9 }` would then fall through and be
       written as no criteria at all — the same silent drop this batch exists
       to remove, wearing a different hat. */
    if (desired && ["grade", "condition"].some((k) => k in desired
      && desired[k] !== null && typeof desired[k] !== "string")) {
      return refuse(R.gradingIncoherent);
    }
    if (desired && D.gradingProblem(desired)) return refuse(R.gradingIncoherent);
    const canonical = typeof canonicalCardId === "string" && canonicalCardId;
    if (canonical && cardId) return refuse(R.notFound);
    const card = canonical ? null : cardById(state, cardId);
    if (!canonical && !card) return refuse(R.notFound);
    const mine = list(state.goals).filter((g) => g.collectorId === a.collectorId);
    const duplicate = canonical
      ? mine.some((g) => g.canonicalCardId === canonical)
      : mine.some((g) => g.cardId === cardId
        || (g.cardId && D.identityKey(cardById(state, g.cardId)) === D.identityKey(card)));
    if (duplicate) return refuse(R.duplicateGoal);
    const id = ctx.id("g");
    /* TWO DATES, AND THEY ANSWER DIFFERENT QUESTIONS (Phase 5 Batch 8.1).

       `since` has always meant "in this tier since", and `updateGoalTier`
       overwrites it every time somebody changes their mind — correctly, because
       what a partner wants to know is how long this has been the hunt, not how
       long the card has been on a list somewhere.

       But that made the moment the Goal was CREATED unrecoverable the first
       time anybody promoted or demoted one, and the moment a Goal was created
       is the first step of the only funnel this product has. `createdAt` is
       that moment, it is written once, and nothing else in the lifecycle
       touches it. It was already in the partner-facing allow-list and already
       read by the Collector's own list — the projection and the screen have
       been waiting for a writer since Batch 7. */
    /* Criteria are written only when the Collector actually stated something.
       An absent `desired` means UNSPECIFIED and stays absent — it must not
       become `{ grade: null, condition: null }`, which would look like an
       answer, nor "Raw / Near Mint", which would be MetYet inventing a
       preference. Unspecified is what every Goal written before C3.2 is, and
       what every Goal from today's Browse still is. */
    const stated = desired
      ? Object.fromEntries(["grade", "condition"]
        .filter((k) => typeof desired[k] === "string" && desired[k].trim())
        .map((k) => [k, desired[k].trim()]))
      : null;
    /* AND A CANONICAL GOAL MUST STATE THEM (Phase 5 C3.3).
       C3.2 left this optional and said why: Browse sent `{ canonicalCardId,
       tier }` and nothing else, so requiring criteria would have made the
       shipped product's primary action fail for every user. C3.3 is the batch
       that ships the control, so the requirement arrives with the means to
       satisfy it.

       SCOPED TO THE CANONICAL PATH, deliberately. `canonicalCardId` is the
       production way to name a card and the only way the Collector app can;
       `cardId` is the demo prototype's, resolved against the world's own
       catalogue, with three call sites and no grade control anywhere near
       them. Requiring criteria globally would break those, and forty-three
       test suites, to enforce a rule about a surface neither of them has.
       Rewriting the demo is a much larger batch wearing this one's name. */
    if (canonical && !(stated && Object.keys(stated).length)) return refuse(R.criteriaRequired);
    const goal = { id, collectorId: a.collectorId,
      ...(canonical ? { canonicalCardId: canonical } : { cardId }),
      tier,
      createdAt: ctx.at, since: ctx.at, note: note || "",
      ...(stated && Object.keys(stated).length ? { desired: stated } : {}) };
    return done({ ...state, goals: [...list(state.goals), goal] }, id);
  },

  updateGoalTier(state, a, { goalId, tier }, ctx) {
    const at = ctx.at;
    const g = list(state.goals).find((x) => x.id === goalId);
    if (!g) return refuse(R.notFound);
    if (a.seat !== "collector" || g.collectorId !== a.collectorId) return refuse(R.notOwner);
    /* WHICH REFUSAL WINS, AND WHY IT IS THIS ONE.

       The tier is checked after `not-found` and `not-owner` — which settle
       whether this caller may address this Goal at all — and before both the
       idempotent no-op and the demotion lock.

       Before the lock is the load-bearing half, and it is observable: a Primary
       Goal held by an active Opportunity, asked to become `"banana"` or
       `"Secondary"`, used to coerce to "secondary", hit the lock, and answer
       `goal-locked`. That is a claim about the world — "this Goal is in a live
       deal, so it may not be demoted" — made about a request that named no tier
       and therefore asked for no demotion. It sent the caller to end its deal
       when what it had to fix was its payload, and it was unstable: the same
       malformed request answered differently depending on whether a partner
       happened to have an Opportunity open, which is not a fact about the
       request.

       Before the no-op is not observable either way, and is not claimed to be.
       `next` is now the caller's own value, so a malformed tier can never equal
       a stored one — the no-op simply falls through to the gate. It sits first
       because the two belong together: what the request said, then what the
       world says about it. */
    if (!D.GOAL_TIERS.includes(tier)) return refuse(R.invalidTier);
    const next = tier;
    if (next === g.tier) return done(state, goalId);
    /* An active Opportunity locks its Goal at Primary. */
    if (next === "secondary" && D.goalLocked(goalId, state.opportunities)) return refuse(R.goalLocked);
    const patch = { tier: next };
    if (at) {
      patch.since = at;
      if (next === "primary") { patch.secondarySince = g.secondarySince || g.since || null; patch.confirmedAt = at; }
    }
    return done({ ...state, goals: list(state.goals).map((x) => (x.id === goalId ? { ...x, ...patch } : x)) }, goalId);
  },

  /* WHICH COPY THEY ARE AFTER, CHANGED WITHOUT LOSING THE GOAL (Phase 5 C3.3).

     C3.2 added `desired` and deliberately added no way to edit it, because no
     surface asked. C3.3's Card Specification does, and the alternative — remove
     the Goal and create a new one — is not a workaround here, it is a defect:

       it is IMPOSSIBLE exactly when it matters most. `removeGoal` refuses
       `goal-locked` while an Opportunity is active, so a Collector mid
       negotiation could never correct the criteria their partner is working
       from — the one moment being precise about the copy actually matters.

       it is DESTRUCTIVE. `createdAt` is the first step of the only funnel this
       product has, and Batch 8.1 added it precisely because overwriting it had
       made that moment unrecoverable. `since`, `confirmedAt` and
       `secondarySince` would go the same way.

       it is VISIBLE TO THE OTHER SEAT. A partner's screen would show the
       demand disappear and come back as new, which is a lie about what
       happened.

     AND IT WAS DELIBERATELY NOT BLOCKED BY AN ACTIVE OPPORTUNITY — UNTIL NOW.
     That decision is reversed here, and the argument it replaces is worth
     keeping rather than deleting, because it was a good one: the criteria are
     hers, correcting them is the honest act, the deal she opened remains hers
     to finish or to cancel, and mid-negotiation is the one moment being precise
     about the copy actually matters.

     WHAT CHANGED THE ANSWER. `startOpportunity` admits a copy by asking
     `meetsGoalCriteria(goal.desired, copy)`, and nothing snapshots the answer.
     So an edit mid-deal does not merely change what she is looking for; it
     leaves a shared record whose own admission gate can no longer be
     reproduced — the shop and the Collector negotiating over a copy that, read
     back, never qualified. An object-identity audit found this command was the
     only Goal mutation with no lock while `removeGoal` and `updateGoalTier`
     both had one, and the product's answer is that the record holds still.

     THE COST IS REAL AND IS NOT PAID BY ACCIDENT. A Collector mid-deal cannot
     now sharpen her criteria at all; the way through is to cancel the deal, or
     to finish it. The alternative that would preserve both — carrying `desired`
     onto the Opportunity at `startOpportunity`, so the deal keeps its own gate
     and she keeps her Goal — was considered and explicitly deferred: it adds a
     durable field and is a larger decision than closing the hole.

     IT CHANGES ONE FIELD. Not the tier, not the card, not a timestamp — those
     each have their own command, or belong to nobody. */
  updateGoalCriteria(state, a, { goalId, desired }, ctx) {
    const g = list(state.goals).find((x) => x.id === goalId);
    if (!g) return refuse(R.notFound);
    if (a.seat !== "collector" || g.collectorId !== a.collectorId) return refuse(R.notOwner);
    /* A LIVE DEAL HOLDS THE CRITERIA STILL, FOR THE REASON IT HOLDS THE GOAL.

       `startOpportunity` admits a copy by asking `meetsGoalCriteria(goal.desired,
       copy)` — the deal's whole justification for existing. Nothing snapshots
       that answer, so rewriting `desired` while the deal is live leaves a record
       whose own admission gate can no longer be reproduced from stored state:
       the shop and the Collector are negotiating over a copy that, read back,
       never qualified. An audit found this command was the only Goal mutation
       with no such guard, while `removeGoal` and `updateGoalTier` both had one.

       THE SAME PREDICATE AS `removeGoal`, DELIBERATELY. `goalLocked` is narrower
       — negotiating, and not transactionally lost — because it answers a
       different question, whether a Goal may be DEMOTED from Primary, and
       Option B carved out the dead deal on purpose. This question is whether the
       record may be rewritten underneath a live one, and that harm lasts as long
       as the Opportunity does, fulfilment included. So `goalNamedByActive`, and
       `goal-locked` as the answer, which is what a person already sees when they
       try to stop looking.

       NOTHING IS SNAPSHOTTED AND `goalLocked` IS NOT REDEFINED. Carrying the
       criteria onto the Opportunity would be more faithful still and is a
       larger, separate decision; this closes the hole without taking it. */
    if (D.goalNamedByActive(goalId, state.opportunities)) return refuse(R.goalLocked);
    /* The same shape checks `addGoal` makes, for the same reasons — including
       the non-string one, which is there because `gradingProblem` reads a
       number as "not stated" and would have written `{ grade: 9 }` as no
       criteria at all. */
    if (desired !== undefined && desired !== null
      && (typeof desired !== "object" || Array.isArray(desired))) return refuse(R.gradingIncoherent);
    if (desired && Object.keys(desired).some((k) => k !== "grade" && k !== "condition")) {
      return refuse(R.gradingIncoherent);
    }
    if (desired && ["grade", "condition"].some((k) => k in desired
      && desired[k] !== null && typeof desired[k] !== "string")) {
      return refuse(R.gradingIncoherent);
    }
    if (desired && D.gradingProblem(desired)) return refuse(R.gradingIncoherent);
    const stated = desired
      ? Object.fromEntries(["grade", "condition"]
        .filter((k) => typeof desired[k] === "string" && desired[k].trim())
        .map((k) => [k, desired[k].trim()]))
      : null;
    const any = !!(stated && Object.keys(stated).length);
    /* CLEARING IS ALLOWED ONLY WHERE A GOAL MAY EXIST WITHOUT CRITERIA. A
       canonical Goal states which copy it wants — that is C3.3's rule, and a
       command that let one be emptied afterwards would be a way back to a
       state the product no longer creates. A legacy `cardId` Goal has no such
       rule and may be cleared, because the prototype never had criteria to
       state. Historical canonical Goals written before this batch stay valid
       either way: this refuses a NEW absence, it does not invalidate an old
       one. */
    if (!any && g.canonicalCardId) return refuse(R.criteriaRequired);
    const next = any ? { ...g, desired: stated } : (() => {
      const { desired: gone, ...rest } = g;
      return rest;
    })();
    /* Idempotent: stating what is already stated is not a change, and a retry
       after a partial commit must not look like one. */
    const same = any
      ? (g.desired && g.desired.grade === stated.grade && g.desired.condition === stated.condition)
      : !("desired" in g);
    if (same) return done(state, goalId);
    return done({ ...state, goals: list(state.goals).map((x) => (x.id === goalId ? next : x)) }, goalId);
  },

  /* "This is still accurate." Changes only confirmedAt. */
  confirmGoal(state, a, { goalId }, ctx) {
    const at = ctx.at;
    const g = list(state.goals).find((x) => x.id === goalId);
    if (!g) return refuse(R.notFound);
    if (a.seat !== "collector" || g.collectorId !== a.collectorId) return refuse(R.notOwner);
    return done({ ...state, goals: list(state.goals).map((x) => (x.id === goalId ? { ...x, confirmedAt: at || x.confirmedAt } : x)) }, goalId);
  },

  removeGoal(state, a, { goalId }, ctx) {
    const g = list(state.goals).find((x) => x.id === goalId);
    if (!g) return refuse(R.notFound);
    if (a.seat !== "collector" || g.collectorId !== a.collectorId) return refuse(R.notOwner);
    /* NOT `goalLocked`, WHICH THIS BATCH RELEASED. A negotiation that can never
       conclude stops holding the Goal for demotion and for pursuing the card
       elsewhere — but it still NAMES the Goal, and `validateWorld` requires an
       active Opportunity's Goal to exist. Deleting it here would hand the
       persistence layer a world it refuses. Cancelling the dead deal is the way
       through, and it is one command away. */
    if (D.goalNamedByActive(goalId, state.opportunities)) return refuse(R.goalLocked);
    /* ORGANISATION IS NOT A CONSEQUENCE OF THIS, AND THE OBJECT'S OWN HOME IS
       NOT ORGANISATION ABOUT SOMETHING ELSE.

       Dropping a Goal says the Collector has stopped looking. It still says
       nothing about where they had filed the CARD — that row stays exactly
       where it is, and the binder is theirs to reorganise. What goes with the
       Goal is the Goal's own membership, because a membership is where THIS
       GOAL lives and there is no longer a Goal to live anywhere.

       That is not the rule the salvage batch withdrew. `pruneOrphanedMemberships`
       asked "does this CARD still mean anything to this Collector?" and took
       curation away when the answer turned no — organisation as a consequence
       of a STATE CHANGE. Deleting the subject is not a state change, and
       `interests` is cascaded by `removeCollectorCopy` for exactly this reason:
       a row that NAMES the thing goes when the thing goes. */
    return done({ ...state, goals: list(state.goals).filter((x) => x.id !== goalId),
      binderMemberships: list(state.binderMemberships).filter((m) => m.goalId !== goalId) }, true);
  },

  /* ------------------------------------------------------------ inventory */
  /* A PHYSICAL COPY, AND WHICH CARD IT IS A COPY OF (Phase 5 Batch 6).

     TWO WAYS TO NAME THE CARD, and a copy uses one. `canonicalCardId` is the
     production way: an opaque id from the catalog, which this command cannot
     check because the domain has no database — the server resolves it and
     refuses an unknown or withdrawn one BEFORE executing, and a foreign key is
     the backstop. `cardId` is the demo's way, resolved against the world's own
     catalogue here as it always was.

     WHAT THE CALLER MAY NOT NAME. Not the partner — ownership comes from the
     authenticated actor and a payload that carried one would be ignored anyway.
     Not the card's name, set, number, finish or language: a copy REFERS to a
     card, it does not describe one, and a browser that could describe one could
     invent one.

     GRADE AND CONDITION ARE COPY FACTS, since Batch 5 took them out of card
     identity. Two copies of one printing at PSA 9 and PSA 10 are one canonical
     card and two rows here. */
  addInventoryCopy(state, a, { copy }, ctx) {
    if (a.seat !== "tp") return refuse(R.notOwner);
    if (!copy) return refuse(R.notFound);
    const canonical = typeof copy.canonicalCardId === "string" && copy.canonicalCardId;
    /* Exactly one: a copy of two cards is a copy of neither. */
    if (canonical && copy.cardId) return refuse(R.notFound);
    if (!canonical && !cardById(state, copy.cardId)) return refuse(R.notFound);
    /* Stated or not stated — an empty string is not stated, and always was. */
    /* ONE GRADING RULE, ASKED ONCE (Phase 5 C3.2). This used to be two
       half-checks — is the grade in the list, is the condition in the list —
       and neither asked whether the two could both be true. `gradingProblem`
       is that question, and a partner's shelf answers it exactly as a
       Collector's does. */
    if (D.gradingProblem(copy)) return refuse(R.gradingIncoherent);
    for (const k of ["ask", "cost"]) {
      if (copy[k] != null && !(validMoney(Number(copy[k])) && Number(copy[k]) >= 0)) return refuse(R.invalidAmount);
    }
    /* THE PROPOSED MARKET PRICE IS WHOLE DOLLARS (Batch 2.1). MetYet does not
       price in cents, and a new copy's price — when it has one — is a whole
       number of dollars above zero. Refused, never rounded. `cost` is the
       shop's own bookkeeping, not a price anybody negotiates, and keeps its
       rule above. */
    if (copy.ask != null && !wholeDollars(Number(copy.ask))) return refuse(R.invalidAmount);
    /* FIRM ON PRICE, OR OPEN TO OFFERS (Market Validation, Batch 1). `ask` is
       the partner's Proposed Market Price — a starting point, not a binding
       price — and `firmOnPrice` says whether a Collector may open at anything
       else. Absent means Open to Offers; when stated it must be a boolean.
       Checked here, before `ctx.id` below, so a refusal consumes no id. */
    if ("firmOnPrice" in copy && typeof copy.firmOnPrice !== "boolean") return refuse(R.invalidPricingPreference);
    /* `pendingFor` IS NOT A FACT ABOUT A NEW CARD (Option B). This spread is
       deliberately open — a shop's own description of a copy is theirs — but
       availability is not a description, and a copy nobody has ever dealt over
       cannot honestly be pending for a deal. It has one door, `setCopyPending`,
       and this is the other place that door could have been walked around. */
    const { invId: askedId, addedAt: askedAt, updatedAt, pendingFor: notYours, ...facts } = copy;
    const invId = ctx.id("inv" + (canonical || copy.cardId) + "-", askedId);
    if (list(state.inventory).some((i) => i.invId === invId)) return refuse(R.copyInUse);
    /* NORMALISED ON THE WAY IN, for the reason `updateInventoryCopy` gives: a
       copy created with a photographs field of any other shape is a copy every
       later reader has to cope with, and one created with `{front:{},back:{}}`
       read as fully photographed while holding no evidence at all. */
    const born = { ...facts, photos: photographs(facts && facts.photos) };
    const row = { archived: false, firmOnPrice: false, ...born, invId,
      partnerId: a.partnerId, ...(ctx.time(askedAt) ? { addedAt: ctx.time(askedAt) } : {}) };
    return done({ ...state, inventory: [...list(state.inventory), row] }, invId);
  },

  /* Copy-level facts only. Card identity and ownership are never editable;
     certification is locked while the copy is committed to a live deal. */
  updateInventoryCopy(state, a, { invId, patch }, ctx) {
    const at = ctx.at;
    const copy = list(state.inventory).find((i) => i.invId === invId);
    if (!copy) return refuse(R.notFound);
    if (a.seat !== "tp" || copy.partnerId !== a.partnerId) return refuse(R.notOwner);
    /* A patch that is not an object used to reach `"cardId" in p` and throw a
       TypeError — a 500 on an exposed command where a refusal was meant. */
    if (patch != null && (typeof patch !== "object" || Array.isArray(patch))) return refuse(R.notFound);
    const p = patch || {};
    /* WHICH CARD THIS IS, AND WHOSE IT IS, ARE NOT EDITS. `canonicalCardId`
       joined the list in Batch 6 for the same reason `cardId` was always on it:
       a copy that could be re-pointed at another card is a way to make a
       Collector's match mean something it did not mean when it was made. */
    if ("cardId" in p || "canonicalCardId" in p || "invId" in p || "partnerId" in p) {
      return refuse(R.identityImmutable);
    }
    /* THE CERTIFICATE LOCK KEEPS THE OLDER, WIDER WINDOW (Option B, Item 2).
       It deliberately does NOT follow the availability boundary to final
       agreement. From the moment a market value is settled a Collector is
       reasoning about this exact slab — pricing a trade package against its
       certificate — and re-certifying it underneath them is a different harm
       from letting somebody else pursue it. `copyInLiveDeal` is that wider
       window, and its comment in the domain says why it is separate.

       AND SOLD IS THE OTHER HALF OF IT. The old guard asked
       `status !== "available"`, which covered a sold copy as well as a live
       deal; an adversarial pass caught that keying on `copyInLiveDeal` alone
       had quietly let a partner re-certify a card they had already handed over,
       rewriting the record of what somebody bought. Both halves, explicitly. */
    /* AND THE LOCK WAS NEVER ONLY ABOUT THE CERTIFICATE. The reason written
       above — a Collector is pricing a trade package against this exact slab —
       is a reason about what the object is UNDERSTOOD TO BE, and the
       certificate is only one of the facts carrying that. `copyInLiveDeal`'s
       own comment says "pricing around its grade" in as many words, and grade
       reaches further than cert does: it feeds the Discovery search text, the
       card specification's resolution, and the copy's printed label. Condition
       does the same for a Raw copy. Leaving those two editable meant a partner
       could agree a deal on a PSA 9 and quietly restate it as Damaged, which is
       the same harm the cert lock exists to prevent, by an easier route.

       WHAT IS DELIBERATELY NOT HERE: `ask`, `cost`, `acquired` and `note`.
       Those are the shop's own operational metadata. None of them changes what
       the physical object IS, and freezing a price the partner may still want
       to correct would be a cost with no integrity behind it. */
    /* `photos` is ASSIGNED, not merged (see `clean` below), so the photographs
       after this write are exactly what the patch carries — or the existing
       ones when it does not mention them at all. */
    /* NORMALISED FIRST, SO THE GUARD IS HANDED WHAT THE WRITE WILL PRODUCE.
       That is the whole contract of `protectedCopyEdit` (see its comment), and
       computing the final photographs after asking the guard about the raw patch
       would be the same shape of mistake the guard was written to fix. */
    const nextPhotos = "photos" in p
      ? photographs(p.photos && typeof p.photos === "object" ? p.photos : null)
      : undefined;
    if (protectedCopyEdit(state, invId, copy, p, nextPhotos)) return refuse(R.copyCommitted);
    /* Grade and condition are here because a raw copy that comes back from a
       grader is the same physical card with a new fact about it — not a new
       copy, and certainly not a new CARD (Phase 5 Batch 6). Whether that
       restatement is ALLOWED NOW is the guard above; this list is only about
       which fields the command understands at all. */
    /* `firmOnPrice` (Market Validation, Batch 1) is the partner's own pricing
       preference, not a fact about the card, so it is not a protected fact and
       may change while a deal is live; a live negotiation reads the snapshot it
       began with, not the shelf. When named it must be a boolean. */
    if ("firmOnPrice" in p && typeof p.firmOnPrice !== "boolean") return refuse(R.invalidPricingPreference);
    const allowed = ["ask", "cost", "acquired", "cert", "note", "photos", "grade", "condition", "firmOnPrice"];
    const clean = {};
    for (const k of allowed) if (k in p) clean[k] = p[k];
    /* PHOTOGRAPHS ARE STORED IN THE ONLY SHAPE THE GUARD CAN READ.

       An adversarial run found the protection defeatable in two legal steps.
       Nothing checked the SHAPE of this field, so a partner could write
       `photos: "gotcha"` (or a number, or an array) while the copy was still
       available — allowed, because photo edits are legal then — and from that
       moment `photoSlot` read every slot of a non-object as `null`. The guard's
       whole question is "did a slot that HELD something stop holding it", so a
       copy whose photos were a string looked permanently empty to it: once the
       copy entered a live deal, fresh evidence could be written over the old
       freely, which is exactly the rewrite the guard exists to refuse.

       Normalising here means the field is always `{ front, back }` with string
       or null in each slot afterwards, so the guard is never blind and a caller
       sending a well-formed patch is unaffected.

       IT IS NOT THE ONLY DOOR, and an adversarial run corrected an earlier
       version of this comment that said it was. `addInventoryCopy` also writes
       this field, spreads the caller's facts over its default, and is on the
       production allow-list; it normalises too, just below. */
    if (nextPhotos !== undefined) clean.photos = nextPhotos;
    /* A PRICE THAT IS BEING CHANGED IS WHOLE DOLLARS (Batch 2.1). A copy priced
       in cents before this rule keeps its price, and a correction of anything
       else — or a form that sends the stored price back untouched — still
       lands: only a NEW price has to be whole dollars above zero. */
    if ("ask" in clean && clean.ask != null && clean.ask !== copy.ask && !wholeDollars(Number(clean.ask))) return refuse(R.invalidAmount);
    for (const k of ["ask", "cost"]) {
      if (clean[k] != null && !(validMoney(Number(clean[k])) && Number(clean[k]) >= 0)) return refuse(R.invalidAmount);
    }
    /* CHECKED AGAINST THE MERGED RECORD, not the patch. A Raw / Near Mint copy
       patched to `grade: "PSA 9"` sends no condition — but the copy still has
       one, and the result would be the contradiction this batch exists to
       remove. What has to be sayable is the card as it will be afterwards. */
    const merged = { ...copy, ...clean };
    if (D.gradingProblem(merged)) return refuse(R.gradingIncoherent);
    return done({ ...state, inventory: list(state.inventory).map((i) => (i.invId === invId
      ? { ...i, ...clean, ...(at ? { updatedAt: at } : {}) } : i)) }, invId);
  },

  removeInventoryCopy(state, a, { invId }, ctx) {
    const copy = list(state.inventory).find((i) => i.invId === invId);
    if (!copy) return refuse(R.notFound);
    if (a.seat !== "tp" || copy.partnerId !== a.partnerId) return refuse(R.notOwner);
    /* AND SO DOES THE ARCHIVE GUARD, for the same reason: a partner must not be
       able to take a card off the shelf while somebody is mid-deal over it, and
       "mid-deal" starts at the settled value rather than at final agreement.

       A SOLD COPY IS THE EXCEPTION, and was before this batch too: once the
       card has been handed over, taking it off the shelf is tidying up. Without
       this line a losing deal that still holds an agreed value would pin a card
       the shop no longer owns to its inventory for ever. */
    if (!D.soldInventoryIds(state.opportunities).has(invId)
      && D.INVARIANTS.copyInLiveDeal(invId, state.opportunities)) return refuse(R.copyCommitted);
    /* THE DEALS STILL AGREEING A PRICE ON IT END WITH IT (M3A A1). The guard
       above means only deals before a settled price can be here, and a card
       that is off the shelf can never be theirs, so each is ended explicitly as
       `card-unavailable` in the same write rather than left active. */
    const archived = { ...state, inventory: list(state.inventory).map((i) => (i.invId === invId
      ? { ...i, archived: true } : i)) };
    return done(endUnavailable(archived, invId, null, ctx && ctx.at), invId);
  },

  /* ------------------------------------------------------- pending a copy */
  /* THE PARTNER SAYS "I'M WORKING ON THIS ONE" (Option B, Item 1).

     The only availability fact in MetYet that somebody DECIDES. Everything else
     — sold, committed, available — is derived from what has happened; this is
     derived from what a partner chose, and they can unchoose it.

     IT NAMES THE DEAL, AND THAT IS THE WHOLE DESIGN. A bare "pending" flag
     could not tell the Collector on the other side of that deal that it is
     pending for THEM, which is the one thing worth saying. So the field holds
     an opportunity id and the checks below make sure it is a real one: the
     partner's own, on this exact copy, still running.

     ONE COMMAND BOTH WAYS. `oppId: null` releases. Two commands would be two
     places for the rule to live, and `setCollectorCopyOffered` and
     `setBinderArchived` already establish the shape for an owner-controlled
     two-way setter.

     NOT A HOLD, A QUEUE, OR A TIMER. Nothing expires it, nothing renews it,
     nothing is promised by it, and releasing it costs nobody anything. It
     stops new pursuits; it erases no work that already exists.

     AND NOT REACHABLE THROUGH `updateInventoryCopy`. That command's allow-list
     is the shop's own description of its card — price, grade, certificate,
     notes. Availability is a different kind of statement and gets a different
     door, which is also where an external inventory system's authority would
     one day have to be checked. */
  setCopyPending(state, a, { invId, oppId }, ctx) {
    const at = ctx.at;
    const copy = list(state.inventory).find((i) => i.invId === invId);
    if (!copy) return refuse(R.notFound);
    if (a.seat !== "tp" || copy.partnerId !== a.partnerId) return refuse(R.notOwner);
    const set = (value) => done({ ...state, inventory: list(state.inventory).map((i) => (i.invId === invId
      ? { ...i, pendingFor: value, ...(at ? { updatedAt: at } : {}) } : i)) }, invId);
    /* RELEASING IS ALWAYS ALLOWED, and it is asked FIRST. It was asked after
       the archived check, which meant archiving a pending copy stranded the
       note on it with no command left that could clear it — a partner taking
       their own mark off their own card cannot harm anybody, whatever else is
       true of the card. */
    if (oppId === null || oppId === undefined) {
      return copy.pendingFor == null ? done(state, invId) : set(null);
    }
    /* AND ANYTHING THAT IS NOT AN ID IS A MISTAKE, NOT A RELEASE. This read
       `typeof oppId === "string" && oppId ? oppId : null`, which collapsed a
       number, an object or a boolean into the release branch — so a malformed
       call un-reserved the shop's card and reported success. Only `null` means
       release. */
    if (typeof oppId !== "string" || !oppId) return refuse(R.notFound);
    const wanted = oppId;
    if (copy.archived) return refuse(R.copyUnavailable);
    if (D.soldInventoryIds(state.opportunities).has(invId)) return refuse(R.copyUnavailable);
    /* AND NOT ONCE THE CARD HAS BEEN PROMISED TO SOMEBODY. Without this a
       partner could mark the copy pending for the deal that LOST it, and the
       losing Collector's screen would read "Pending for your deal" about a card
       already promised to somebody else — the one sentence in this feature that
       must never be a lie. */
    if (D.INVARIANTS.copyCommittedTo(invId, state.opportunities, wanted)) return refuse(R.copyCommitted);
    /* Somebody else's deal already holds it. Said with the same word a
       Collector would hear, because the partner is in the same position: this
       copy is spoken for by a conversation that is not this one. */
    const held = D.INVARIANTS.copyPendingFor(invId, state.inventory, state.opportunities);
    if (held && held !== wanted) return refuse(R.copyPending);
    const o = oppById(state, wanted);
    if (!o) return refuse(R.notFound);
    if (o.partnerId !== a.partnerId) return refuse(R.notParticipant);
    if (o.invId !== invId) return refuse(R.identityMismatch);
    if (!D.isActive(o)) return refuse(R.terminal);
    if (!pairTrusted(state, o)) return refuse(R.noRelationship);
    return copy.pendingFor === wanted ? done(state, invId) : set(wanted);
  },

  addCopyPhotos(state, a, { invId, front, back }, ctx) {
    const at = ctx.at;
    const copy = list(state.inventory).find((i) => i.invId === invId);
    /* ONE ANSWER FOR "NOT A COPY OF YOURS", whether it belongs to another shop
       or to nobody. The missing-copy check used to come FIRST and answer
       `not-found`, so a shop could tell an id that exists somewhere from one
       that exists nowhere — harmless while this command had no surface, and a
       real leak the moment it got one. */
    if (a.seat !== "tp") return refuse(R.notOwner);
    if (!copy || copy.partnerId !== a.partnerId) return refuse(R.notOwner);
    /* A CARD THE SHOP HAS TAKEN OFF ITS SHELF IS NOT ONE IT CAN ANSWER ABOUT.
       `reviewCopy`, `requestPhotos`, `updateInventoryCopy` and
       `removeInventoryCopy` all refuse an archived copy and this did not, so a
       shop could mark every outstanding request FULFILLED on a card it had
       withdrawn — and the requester, for whom an archived copy is not visible
       at all, would never see the evidence the record now claims arrived. The
       request staying open is the honest outcome. */
    if (copy.archived) return refuse(R.copyUnavailable);
    /* THIS COMMAND IS NAMED "ADD" AND WAS NOT ONE. It merges by slot, so
       `front` given for a copy that already has a front REPLACES it, and
       `front: null` erases it — and until now it carried no deal guard at all,
       not even the certificate lock's. It was the easier of the two doors onto
       the same harm: the photographs are the only evidence of a copy's
       condition, and restaging them under a live deal, or after handover,
       rewrites what was agreed. It now asks exactly what `updateInventoryCopy`
       asks, so fulfilling a Collector's photo request still works — that always
       fills an empty slot — while rewriting or erasing one does not. */
    /* WHAT IS SUPPLIED IS CHECKED; WHAT IS STORED IS LEFT ALONE.

       Three separate jobs, and an adversarial run proved that doing them with
       one expression gets two of them wrong.

       CHECKED: a face this call names must be a reference or an explicit null.
       Junk is refused outright, because the alternative — quietly coercing it —
       erases whatever was there.

       LEFT ALONE: a face this call does not name is carried across EXACTLY as
       stored, junk included. Normalising the merged value silently deleted a
       legacy non-string photograph while filling the other face, and that is
       destroying data to tidy a field.

       AND JUDGED SEPARATELY: whether the copy now counts as photographed, and
       whether the guard sees a rewrite, are both asked of the NORMALISED view.
       So a legacy junk face never closes a Collector's request by pretending to
       be evidence, and never freezes the copy by reading as a rewrite of
       itself — which is what it did before, leaving a request that could not be
       answered at all. */
    if (unusableFace(front) || unusableFace(back)) return refuse(R.photoUnusable);
    const photos = {
      front: front !== undefined ? front : (copy.photos || {}).front,
      back: back !== undefined ? back : (copy.photos || {}).back,
    };
    if (protectedCopyEdit(state, invId, { ...copy, photos: photographs(copy.photos) },
      {}, photographs(photos))) return refuse(R.copyCommitted);
    const complete = D.INVARIANTS.copyPhotographed(photographs(photos));
    return done({ ...state,
      inventory: list(state.inventory).map((i) => (i.invId === invId ? { ...i, photos } : i)),
      photoRequests: list(state.photoRequests).map((r) => (r.invId === invId && !r.fulfilledAt
        && complete ? { ...r, fulfilledAt: at || null } : r)) }, complete);
  },

  /* ------------------------------------------- a Collector's own cards (C2)

     THIS WAS CALLED A BINDER AND IT WAS NEVER ONE. It is a Collector's own
     physical card — the mirror image of a Trusted Partner's InventoryCopy,
     owned by the other seat. The word "Binder" now belongs to the named
     organisational grouping C3 will add, and keeping it here would have left
     two different things wearing it.

     OWNING AND OFFERING ARE DIFFERENT FACTS, and separating them is the whole
     point of this batch. Until now the only way to stop offering a card was to
     delete the record that you owned it, which lost a true thing to express a
     different one. `offered` is the owner's willingness; the status beside it
     — available, reserved, committed, traded — is derived from the deals and
     is never stored.

     AND A PHOTOGRAPH IS NO LONGER THE PRICE OF ADMISSION. Both faces used to be
     required to record that you own a card at all. The reason for that rule is
     real — somebody has to be able to evaluate a specific physical card before
     trading for it — but the moment it applies is when the copy enters a trade
     package, not when its owner writes it down. The requirement moved to
     `proposeTradeSelection`, which is where the evaluation happens. */
  addCollectorCopy(state, a, { copy }, ctx) {
    if (a.seat !== "collector") return refuse(R.notOwner);
    if (!copy) return refuse(R.notFound);
    const canonical = typeof copy.canonicalCardId === "string" && copy.canonicalCardId;
    if (canonical && copy.cardId) return refuse(R.notFound);
    if (!canonical && !cardById(state, copy.cardId)) return refuse(R.notFound);
    /* Stated or not stated — an empty string is not stated. The vocabulary is
       the domain's, shared with a Trusted Partner's shelf, because a PSA 9 is
       a PSA 9 whoever is holding it. */
    /* The same one rule the other seat's shelf answers (Phase 5 C3.2): a Raw
       card says what state it is in, a graded card does not carry a second
       contradicting assessment, and an unstated card is a real answer. */
    if (D.gradingProblem(copy)) return refuse(R.gradingIncoherent);
    if (copy.market != null && !(Number(copy.market) >= 0)) return refuse(R.invalidAmount);
    const { id: askedId, addedAt: askedAt, updatedAt, offered, keeping, ...facts } = copy;
    /* BOTH AT ONCE IS NOT A THING SOMEBODY MEANT. Refused rather than resolved:
       the domain does not get to pick which half of a contradiction was the
       intention. */
    if (offered === true && keeping === true) return refuse(R.dispositionConflict);
    /* AND NEITHER AT ONCE IS NOT A THING SOMEBODY MEANT EITHER.

       A new copy used to be born saying nothing: `offered: offered === true`
       took anything that was not literally `true` — `undefined`, `false`,
       `"yes"`, `null` — and wrote a copy with no disposition, 200, silently.
       `offered: "yes"` is somebody trying to offer a card, and it produced a
       copy that is barred from every trade package and never reaches a
       partner. The same `"yes"` on `setCollectorCopyOffered` has always been
       refused, so one field answered two ways at two boundaries.

       Owning a card and meaning something by it are still separate facts —
       that is C2 and it stands. What changed is that the second one is no
       longer optional at birth: a copy MetYet cannot act on is not a record
       worth keeping, and the Collector is the only one who may say which it
       is. Copies recorded before this rule keep their silence; `validateWorld`
       is deliberately NOT given this opinion, because it runs on load and
       would turn every one of them into a 500 on the next read.

       TWO CHECKS, BECAUSE ONE WAS NOT ENOUGH. The first draft of this gate
       refused only when BOTH flags failed to be `true`, which left the original
       defect alive in a narrower form: `{ offered: "yes", keeping: true }` was
       accepted, the `"yes"` was coerced to `false`, and the copy was stored as
       PC — somebody trying to offer a card got the opposite answer with a 200.
       A flag that is present and is not a boolean is a request the domain
       cannot read, and it says so before asking which answer was given.

       `false` on the OTHER flag stays legal, deliberately: the panel composes
       `{ offered: true, keeping: false }` for Trade/Sell and the mirror for PC,
       and those are complete, unambiguous answers.

       PLACED HERE, one line below the contradiction it mirrors and above
       `ctx.id`, which advances the runtime's id sequence the moment it is
       called — so no refusal about a disposition consumes an id. (`copy-in-use`
       below sits after the mint and would, but it answers an id collision the
       runtime itself just produced, which is unreachable in practice.) */
    if ((offered !== undefined && typeof offered !== "boolean")
      || (keeping !== undefined && typeof keeping !== "boolean")) {
      return refuse(R.invalidDisposition);
    }
    if (!(offered === true) && !(keeping === true)) return refuse(R.invalidDisposition);
    const id = ctx.id("b", askedId);
    if (list(state.collectorCopies).some((b) => b.id === id)) return refuse(R.copyInUse);
    const addedAt = ctx.time(askedAt);
    /* A NEW COPY IS NOT OFFERED UNLESS ITS OWNER SAYS SO, and it is not being
       kept unless they say that either. Recording that you own a card is the
       base fact; what you mean to do with it is a decision, and the gate above
       is what makes the Collector the one who makes it.

       `keeping` IS WRITTEN ONLY FOR `true`, AND THAT STILL MATTERS. Writing
       `keeping: false` would dress a PC-less copy up as a decision not to keep
       it, and absence is what "no keep stated" looks like — the confusion
       migration 0012 exists to remember. This command can no longer create a
       copy that is silent on both counts, so the shape it protects now belongs
       to the copies recorded BEFORE that rule: they carry no `keeping` key, and
       they must stay indistinguishable from each other and distinguishable from
       a stated PC. */
    const row = { ...facts, id, collectorId: a.collectorId, offered: offered === true,
      ...(keeping === true ? { keeping: true } : {}),
      ...(addedAt ? { addedAt } : {}) };
    return done({ ...state, collectorCopies: [...list(state.collectorCopies), row] }, id);
  },

  updateCollectorCopy(state, a, { copyId, patch }, ctx) {
    const at = ctx.at;
    const copy = list(state.collectorCopies).find((b) => b.id === copyId);
    if (!copy) return refuse(R.copyUnavailable);
    if (a.seat !== "collector" || copy.collectorId !== a.collectorId) return refuse(R.notOwner);
    /* addedAt and updatedAt are the command's, never the patch's. */
    const { addedAt, updatedAt, ...p } = patch || {};
    if ("cardId" in p || "canonicalCardId" in p || "id" in p || "collectorId" in p) {
      return refuse(R.identityImmutable);
    }
    /* Willingness has its own command, so that "I am not selling this" and "I
       was wrong about the certificate" are never the same edit. */
    if ("offered" in p || "keeping" in p) return refuse(R.identityImmutable);
    /* THE SPECIFICATION LOCK (M3A A1). From the moment a partner selects this
       copy until every deal that selected it has let it go, the facts that say
       what the object IS cannot be restated: grade, condition, certificate, and
       the photographs already on it. Somebody is reasoning about exactly this
       object. Filling an EMPTY photo slot is still allowed — evidence arriving
       — but replacing or removing one is not, which is the same line the shop's
       own copies draw (`photographsRewritten`). The Collector's private value
       and notes are their own bookkeeping and stay editable. */
    if (D.copySpecLocked(copyId, state.opportunities)) {
      for (const k of ["grade", "condition", "cert"]) {
        if (k in p && p[k] !== copy[k]) return refuse(R.copyInDeal);
      }
      if ("photos" in p && photographsRewritten(copy.photos, p.photos)) return refuse(R.copyInDeal);
    }
    const next = { ...copy, ...p, id: copy.id, cardId: copy.cardId,
      canonicalCardId: copy.canonicalCardId, collectorId: copy.collectorId,
      offered: copy.offered === true };
    /* CHECKED AGAINST THE MERGED RECORD (C3.2) — see updateInventoryCopy. A
       patch that names only a grade still has to leave a sayable card behind.

       A copy that was ALREADY contradictory (written before C3.2, when the
       door was open) cannot be edited into anything else while it stays
       contradictory — which is right: the correction is to state a coherent
       pair, and that is one patch away. */
    if (D.gradingProblem(next)) return refuse(R.gradingIncoherent);
    if (next.market != null && !(Number(next.market) >= 0)) return refuse(R.invalidAmount);
    return done({ ...state, collectorCopies: list(state.collectorCopies).map((b) => (b.id === copyId
      ? { ...next, updatedAt: at || b.updatedAt } : b)) }, copyId);
  },

  /* WILLINGNESS, AND NOTHING ELSE (C2). Saying this leaves the copy, its card,
     its grade, its certificate and its photographs exactly where they were —
     the Collector still owns it, and says so. Saying it again after a spell as
     PC is the same record becoming supply again, not a new one.

     THERE IS NO LONGER AN "OFF" (the disposition batch). This used to take
     `false` and return the copy to saying nothing, which produced a record
     barred from every trade package and invisible to every partner. Ending an
     offer is now `setCollectorCopyKept`, which clears it in the same step.

     A deal that has already taken the copy is untouched: a committed or traded
     copy keeps its history whatever its owner now says about offering it, and
     the derived status is what the trade model reads. */
  setCollectorCopyOffered(state, a, { copyId, offered }, ctx) {
    const at = ctx.at;
    const copy = list(state.collectorCopies).find((b) => b.id === copyId);
    if (!copy) return refuse(R.notFound);
    if (a.seat !== "collector" || copy.collectorId !== a.collectorId) return refuse(R.notOwner);
    /* `true` AND NOTHING ELSE. `false` used to mean "I take it back", which
       returned the copy to saying nothing — a durable state the product no
       longer creates. A non-boolean used to answer `not-found`, which told a
       caller its copy did not exist. Both now say what is actually wrong, and
       a copy that really is missing still answers `not-found` above. */
    if (offered !== true) return refuse(R.invalidDisposition);
    /* OFFERING A COPY WITHDRAWS ANY INTENTION TO KEEP IT, because those are two
       contradictory statements about one object and the person has just made
       the second one. The pair is cleared here rather than refused: saying
       "actually, I would part with this" is a change of mind, not an error,
       and clearing it here is what makes the switch one step instead of two.

       `keeping` is therefore passed as `false`, flatly, and `withDisposition`
       REMOVES the key rather than writing it — the shape has not changed. It
       used to read `offered ? false : D.copyKept(b)`, where the second branch
       preserved an existing keep through a withdrawal. Withdrawal is refused
       above, so that branch is unreachable and saying it is reachable would be
       a lie about what this command can do. */
    if (copy.offered === true && !D.copyKept(copy)) return done(state, copyId);
    return done({ ...state, collectorCopies: list(state.collectorCopies).map((b) => (b.id === copyId
      ? withDisposition(b, true, false, at)
      : b)) }, copyId);
  },

  /* PERSONAL COLLECTION — "I own this physical copy and intend to keep it."

     A POSITIVE STATEMENT, WITH ITS OWN DOOR, FOR THE SAME REASON `offered` HAS
     ONE. Willingness to part with a card is not a correctable typo and neither
     is the decision to keep one, so neither travels inside a patch: this and
     `setCollectorCopyOffered` are the only two writers of a copy's disposition,
     and `updateInventoryCopy`-style corrections cannot touch either.

     IT CLEARS THE OFFER, AND ITS SIBLING NOW CLEARS THE KEEP. Keeping a copy
     that was on offer withdraws the offer, because the person has just said the
     opposite thing; offering one that was kept does the mirror. The two are
     symmetric because a copy has exactly two answers and changing one's mind is
     choosing the other.

     THE ASYMMETRY THAT USED TO LIVE HERE IS GONE WITH THE ACT THAT NEEDED IT.
     It read: withdrawing an offer does not make a copy kept, because `offered:
     false` has meant "no offer stated" since C2. That is still what `offered:
     false` means on a row — it is what a PC copy and a pre-rule copy both
     carry, and nothing reads a decision into it. What is gone is the
     withdrawal: there is no command that leaves a copy saying nothing, so
     there is no longer an inference to refuse. */
  setCollectorCopyKept(state, a, { copyId, keeping }, ctx) {
    const at = ctx.at;
    const copy = list(state.collectorCopies).find((b) => b.id === copyId);
    if (!copy) return refuse(R.notFound);
    if (a.seat !== "collector" || copy.collectorId !== a.collectorId) return refuse(R.notOwner);
    if (keeping !== true) return refuse(R.invalidDisposition);
    /* The mirror of the block above, and dead branch removed for the same
       reason: `D.copyOffered(b)` could only have been reached by withdrawing
       a keep, which no longer happens. */
    if (D.copyKept(copy) && !D.copyOffered(copy)) return done(state, copyId);
    /* NOT WHILE A DEAL IS CONSIDERING IT (M3A A1). Keeping a card a partner has
       selected, or that a deal holds, would leave a "keep" copy inside a trade
       — the Collector's own two statements contradicting each other. They
       withdraw it from the deal first; then this is theirs to say. */
    if (D.copySpecLocked(copyId, state.opportunities)) return refuse(R.copyInDeal);
    return done({ ...state, collectorCopies: list(state.collectorCopies).map((b) => (b.id === copyId
      ? withDisposition(b, false, true, at)
      : b)) }, copyId);
  },

  /* A copy any deal references is part of that deal's record: while reserved
     or committed it holds the deal together, and afterwards it is history.
     Only a copy no opportunity has ever held can be removed.

     THIS IS NOT HOW YOU STOP SELLING SOMETHING (C2). Removing the record says
     the Collector does not own the card — it was bought, lost, or was never
     theirs. `setCollectorCopyOffered` is for changing their mind about parting
     with one they still have. */
  removeCollectorCopy(state, a, { copyId }, ctx) {
    const copy = list(state.collectorCopies).find((b) => b.id === copyId);
    if (!copy) return refuse(R.notFound);
    if (a.seat !== "collector" || copy.collectorId !== a.collectorId) return refuse(R.notOwner);
    const status = D.collectorCopyStatus(copyId, state.opportunities);
    if (status === "committed" || status === "traded") return refuse(R.copyCommitted);
    if (status === "reserved") return refuse(R.copyReserved);
    if (list(state.opportunities).some((o) => (o.trade && o.trade.cards || [])
      .some((c) => c.binderId === copyId))) return refuse(R.copyInUse);
    /* WHAT NAMES THIS COPY GOES WITH IT, AND WHAT NAMES ITS CARD DOES NOT.

       Interests cascade because they NAME this copy — `interests.binderId` is a
       CollectorCopy id, legacy naming and written down as such. A binder
       MEMBERSHIP names it too, and is this copy's home, so it goes the same
       way: selling a card is not a reorganisation of the shelf, it is the thing
       leaving the shelf. A binder ENTRY names a CARD rather than this copy, and
       is not touched — the card may still be wanted, and other copies of it may
       still be owned. */
    return done({ ...state, collectorCopies: list(state.collectorCopies).filter((b) => b.id !== copyId),
      binderMemberships: list(state.binderMemberships).filter((m) => m.collectorCopyId !== copyId),
      interests: list(state.interests).filter((i) => i.binderId !== copyId) }, true);
  },

  /* ------------------------------------------- where a card belongs (C3.1)

     A Binder is a Collector's own named grouping of canonical cards. It is the
     fourth durable fact in this family and the first that is about how a person
     THINKS about their cards rather than what they want, own or will part with:

       Binder        this card belongs here
       Goal          I want this card
       CollectorCopy I own this physical copy
       offered       I am willing to trade or sell that copy

     THEY ARE INDEPENDENT, IN EVERY DIRECTION, AND THE EXCEPTION THAT WAS HERE
     HAS BEEN REMOVED. Filing a card says nothing about wanting it — a Binder
     that implied demand would be a second, silent way of saying "I'm looking
     for this", which nobody said — and nothing below creates, changes or READS
     a Goal or a copy.

     WHAT WAS TRIED AND WITHDRAWN. For one batch, filing required the card to be
     in one of the four states, and losing the last of them took the membership
     away. Both rules asked the same question — "what does this canonical card
     currently mean to this Collector?" — and that question is the wrong one: a
     Collector's actionable objects are a specific sought copy and a specific
     owned copy, never an aggregate of a card. Deriving whether organisation may
     exist from an aggregate made curation a consequence of state, and losing it
     silently was the cost. The product's rule is the plain one:

       Binder organisation must not determine whether a Goal or CollectorCopy is
       meaningful, and state changes must not silently destroy organisation.

     MEMBERSHIP NAMES THE CANONICAL CARD, AND THAT IS TRANSITIONAL. Not a Goal,
     not a copy — so selling a copy does not un-file a card the Collector still
     wants, satisfying a goal does not un-file a card they still keep a copy of,
     and owning three physical copies of one card does not mean three places it
     belongs. That last one is the tell: three actionable objects share one row,
     which is why the row is on its way to naming the object instead. Until it
     does, nothing here pretends it already names one.

     AND NOBODY ELSE EVER SEES IT. Binders are projected to the owning Collector
     and to no one else — see metyet-projection.js. A Trusted Partner receives
     no name, no id, no membership and no count, because how somebody organises
     their collection is not a fact about a trade. */
  /* ==========================================================================
     CHANGING WHAT A CARD MEANS (P6-F4 Batch 5) — ONE COMMAND, ONE COMMIT.

     A Collector sees four states on one card: Primary, Secondary, PC, Trade /
     Sell. Underneath, the first two are a Goal and the last two an owned
     CollectorCopy, and that distinction stays (engineering context §2). So:

       SAME TYPE    Primary ↔ Secondary, PC ↔ Trade / Sell: exactly what
                    updateGoalTier / setCollectorCopyKept / setCollectorCopyOffered
                    do, on the same record, under their rules. The id stays.
       CROSS TYPE   one commit that (1) writes the other kind of record on the
                    SAME canonical printing, (2) re-points the record's binder
                    membership at it — the same membership row, binder and
                    filing, archived binder included — and (3) removes the
                    source. THE RECORD ID CHANGES; the new one is returned.

     NOTHING IS DISCARDED. The new record carries `formerly`: the source's
     lineage plus one entry for the source — { kind, id, at, facts } — where
     `facts` is everything the source held beyond its identity (a copy's
     grade, condition, certificate, value, photos, dates, disposition; a Goal's
     tier, wanted grade, note and dates). The lineage is append-only and
     bounded (D.COLLECTING_LINEAGE_MAX), so repeated crossings keep every
     earlier snapshot; at the bound the change is refused, never truncated.
     It is the Collector's alone: no partner allow-list names it.

     THE CONFIGURATION TRAVELS (P6-F4 B5.2, founder-approved: "changing
     collecting state changes only collecting state"). A copy made from a Goal
     carries the Goal's saved grade and condition — Raw and its condition, or
     the graded grade — exactly as saved, and nothing that was not saved. That
     is the Collector reusing what they entered, by their own explicit action;
     it is not MetYet verifying a physical card, and nothing here says it is.
     A Goal made from a copy wants what the copy is. Either way the configuration
     can be edited afterwards like any other, and the lineage keeps what was.

     REFUSED, CHANGING NOTHING, WHEN:
       the record is not the asker's (not-owner) or no longer exists — unless a
         record's lineage shows this very change already happened, which is
         answered as done (a retry, or a lost answer), never done twice
       `to` / `from` is not one of the four (invalid-state)
       the record is not in `from` any more (state-changed)
       cross type, and the record names no canonical printing
         (state-change-unsupported), or its lineage is full (lineage-full)
       Goal → copy while an active opportunity names the Goal (goal-locked)
       copy → Goal while a deal holds the copy (copy-reserved, copy-committed),
         or any deal's trade package has ever named it (copy-in-use), or a
         Trusted Partner has marked interest in it (partner-interest), or a
         Goal for this printing already exists (duplicate-goal — never merged),
         or the copy states no grade, or is Raw with no condition
         (criteria-required), or its grading contradicts itself
         (grading-incoherent)
     and the same-type refusals are those of the commands it shares rules with.
     ========================================================================== */
  changeCollectingState(state, a, { goalId, collectorCopyId, from, to }, ctx) {
    if (a.seat !== "collector") return refuse(R.notOwner);
    const S = D.COLLECTING_STATES;
    if (!S.includes(to) || !(from === null || S.includes(from))) return refuse(R.invalidState);
    const isGoal = typeof goalId === "string" && goalId !== "";
    const isCopy = typeof collectorCopyId === "string" && collectorCopyId !== "";
    if (isGoal === isCopy) return refuse(R.notFound);
    const sourceId = isGoal ? goalId : collectorCopyId;
    const kind = isGoal ? "goal" : "copy";
    const src = isGoal ? list(state.goals).find((g) => g.id === goalId)
      : list(state.collectorCopies).find((c) => c.id === collectorCopyId);
    const stateOf = (k, r) => (k === "goal" ? r.tier : r.offered === true ? "trade" : r.keeping === true ? "pc" : null);
    if (!src) {
      /* ALREADY DONE? A record of theirs that came from this one, and is now
         in the state asked for, is this change having happened. */
      const heir = [...list(state.goals).map((g) => ["goal", g]), ...list(state.collectorCopies).map((c) => ["copy", c])]
        .find(([, r]) => r.collectorId === a.collectorId && Array.isArray(r.formerly)
          && r.formerly.some((f) => f && f.kind === kind && f.id === sourceId));
      if (!heir) return refuse(R.notFound);
      if (stateOf(heir[0], heir[1]) === to) return done(state, { id: heir[1].id, kind: heir[0], state: to, already: true });
      return refuse(R.stateChanged);
    }
    if (src.collectorId !== a.collectorId) return refuse(R.notOwner);
    const now = stateOf(kind, src);
    /* A REPEAT of a change that has landed is answered as done; a record
       that moved somewhere else in the meantime is not guessed at. */
    if (now !== from) return now === to ? done(state, { id: src.id, kind, state: to, already: true }) : refuse(R.stateChanged);
    const answer = (r, k) => (r.ok ? { ...r, value: { id: src.id, kind: k, state: to } } : r);
    if (now === to) return done(state, { id: src.id, kind, state: to });
    const toGoal = to === "primary" || to === "secondary";

    /* SAME TYPE: the existing command, its rules, the same record. */
    if (toGoal === isGoal) {
      if (isGoal) return answer(COMMANDS.updateGoalTier(state, a, { goalId, tier: to }, ctx), "goal");
      return answer(to === "trade"
        ? COMMANDS.setCollectorCopyOffered(state, a, { copyId: collectorCopyId, offered: true }, ctx)
        : COMMANDS.setCollectorCopyKept(state, a, { copyId: collectorCopyId, keeping: true }, ctx), "copy");
    }

    /* CROSS TYPE */
    const canonical = typeof src.canonicalCardId === "string" && src.canonicalCardId ? src.canonicalCardId : null;
    if (!canonical || src.cardId) return refuse(R.stateChangeUnsupported);
    const lineage = Array.isArray(src.formerly) ? src.formerly : [];
    if (lineage.length >= D.COLLECTING_LINEAGE_MAX) return refuse(R.lineageFull);
    const opps = list(state.opportunities);
    if (isGoal) {
      if (D.goalNamedByActive(goalId, opps)) return refuse(R.goalLocked);
    } else {
      const status = D.collectorCopyStatus(collectorCopyId, opps);
      if (status === "committed" || status === "traded") return refuse(R.copyCommitted);
      if (status === "reserved") return refuse(R.copyReserved);
      if (opps.some((o) => (o.trade && o.trade.cards || []).some((c) => c.binderId === collectorCopyId))) return refuse(R.copyInUse);
      if (list(state.interests).some((i) => i.binderId === collectorCopyId)) return refuse(R.partnerInterest);
      if (list(state.goals).some((g) => g.collectorId === a.collectorId && g.canonicalCardId === canonical)) return refuse(R.duplicateGoal);
      /* what is MISSING first — the Collector can act on it — then what contradicts */
      const grade = typeof src.grade === "string" ? src.grade.trim() : "";
      const condition = typeof src.condition === "string" ? src.condition.trim() : "";
      if (!grade || (grade === "Raw" && !condition)) return refuse(R.criteriaRequired);
      if (D.gradingProblem(src)) return refuse(R.gradingIncoherent);
    }

    const at = ctx.at;
    const { id: _id, collectorId: _c, canonicalCardId: _k, cardId: _l, formerly: _f, ...facts } = src;
    const formerly = [...lineage, { kind, id: src.id, at, facts: JSON.parse(JSON.stringify(facts)) }];
    let next;
    let newId;
    if (isGoal) {
      newId = ctx.id("b");
      /* the Goal's saved configuration, as saved: Raw + condition, or a grade */
      const want = src.desired && typeof src.desired === "object" ? src.desired : {};
      const wg = typeof want.grade === "string" ? want.grade.trim() : "";
      const wc = typeof want.condition === "string" ? want.condition.trim() : "";
      const config = wg === "Raw" ? (wc ? { grade: "Raw", condition: wc } : {}) : wg ? { grade: wg } : {};
      const copy = withDisposition({ id: newId, collectorId: a.collectorId, canonicalCardId: canonical, ...config, addedAt: at, formerly },
        to === "trade", to === "pc", null);
      if (D.gradingProblem(copy)) return refuse(R.gradingIncoherent);
      next = { ...state,
        goals: list(state.goals).filter((g) => g.id !== src.id),
        collectorCopies: [...list(state.collectorCopies), copy] };
    } else {
      newId = ctx.id("g");
      const desired = src.grade.trim() === "Raw" ? { grade: "Raw", condition: src.condition.trim() } : { grade: src.grade.trim() };
      const goal = { id: newId, collectorId: a.collectorId, canonicalCardId: canonical, tier: to,
        createdAt: at, since: at, note: "", desired, formerly };
      next = { ...state,
        collectorCopies: list(state.collectorCopies).filter((c) => c.id !== src.id),
        goals: [...list(state.goals), goal] };
    }
    /* THE SAME HOME: the membership row is re-pointed, never re-made. */
    next = { ...next, binderMemberships: list(state.binderMemberships).map((m) => {
      if ((isGoal ? m.goalId : m.collectorCopyId) !== src.id) return m;
      const { goalId: _g, collectorCopyId: _cc, ...rest } = m;
      return { ...rest, ...(isGoal ? { collectorCopyId: newId } : { goalId: newId }) };
    }) };
    return done(next, { id: newId, kind: isGoal ? "copy" : "goal", state: to, from: { kind, id: src.id } });
  },

  createBinder(state, a, { name }, ctx) {
    if (a.seat !== "collector") return refuse(R.notOwner);
    const clean = typeof name === "string" ? name.trim() : "";
    if (!clean) return refuse(R.nameRequired);
    const id = ctx.id("bd");
    return done({ ...state, binders: [...list(state.binders),
      { id, collectorId: a.collectorId, name: clean, createdAt: ctx.at, archivedAt: null }] }, id);
  },

  renameBinder(state, a, { binderId, name }, ctx) {
    const binder = list(state.binders).find((b) => b.id === binderId);
    if (!binder) return refuse(R.notFound);
    if (a.seat !== "collector" || binder.collectorId !== a.collectorId) return refuse(R.notOwner);
    const clean = typeof name === "string" ? name.trim() : "";
    if (!clean) return refuse(R.nameRequired);
    /* A rename changes the name. It does not change the owner, and it does not
       touch membership — the cards in a binder have nothing to do with what it
       is called. */
    return done({ ...state, binders: list(state.binders)
      .map((b) => (b.id === binderId ? { ...b, name: clean } : b)) }, binderId);
  },

  /* PUTTING A BINDER AWAY IS REVERSIBLE, WHICH IS WHY THIS IS A `set` AND NOT
     AN `archive`. The C3 checkpoint proposed `archiveBinder`; the repository's
     own vocabulary answers otherwise. `setCollectorCopyOffered` established the
     shape for a reversible state a person controls — one command, a boolean,
     idempotent — and a one-way `archiveBinder` would need a second command to
     undo it, which is two names for one decision. The durable form is a
     TIMESTAMP (`archivedAt`), because "when did I put this away" is worth
     knowing and a boolean cannot say it; null means active.

     IT TOUCHES NOTHING ELSE. Not the entries — an archived binder still holds
     its cards, or unarchiving would be a different binder. Not Goals, not
     copies, not `offered`. There is no permanent deletion here at all: a
     Collector who wants a binder gone can empty it and put it away, and whether
     the product should ever really delete one is a decision pilot evidence has
     not been asked for yet. */
  setBinderArchived(state, a, { binderId, archived }, ctx) {
    const binder = list(state.binders).find((b) => b.id === binderId);
    if (!binder) return refuse(R.notFound);
    if (a.seat !== "collector" || binder.collectorId !== a.collectorId) return refuse(R.notOwner);
    if (typeof archived !== "boolean") return refuse(R.notFound);
    const now = !!binder.archivedAt;
    if (now === archived) return done(state, binderId);
    return done({ ...state, binders: list(state.binders).map((b) => (b.id === binderId
      ? { ...b, archivedAt: archived ? ctx.at : null } : b)) }, binderId);
  },

  /* FILING A CARD. The canonical card is named by an id the server minted and
     the caller merely received; whether it EXISTS is the catalog's answer, asked
     by the server before this runs (server/app.js) and enforced underneath by a
     foreign key — the same boundary a Goal and a copy each cross, and
     deliberately not a second mechanism.

     IDEMPOTENT, because a binder is a set. Filing a card you already filed is
     not a mistake worth a refusal; it is a person doing the thing they meant to
     have done. The first `addedAt` stands — re-filing does not restamp it, or
     "when did this go in the binder" would quietly become "when did I last
     click it". */
  addBinderEntry(state, a, { binderId, canonicalCardId }, ctx) {
    const binder = list(state.binders).find((b) => b.id === binderId);
    if (!binder) return refuse(R.notFound);
    if (a.seat !== "collector" || binder.collectorId !== a.collectorId) return refuse(R.notOwner);
    /* A BLANK IS NOT AN ID. The withdrawn state guard used to refuse whitespace
       incidentally — a card of spaces has no Goal and no copy — so removing it
       left this door a shade wider than it was. Unreachable from production
       (the server asks the catalog first) and refused by the foreign key
       underneath, but a door should say no for its own reasons. */
    if (typeof canonicalCardId !== "string" || !canonicalCardId.trim()) return refuse(R.notFound);
    const already = list(state.binderEntries)
      .some((e) => e.binderId === binderId && e.canonicalCardId === canonicalCardId);
    if (already) return done(state, true);
    return done({ ...state, binderEntries: [...list(state.binderEntries),
      { binderId, canonicalCardId, addedAt: ctx.at }] }, true);
  },

  /* UNFILING A CARD REMOVES ORGANISATION AND NOTHING ELSE. The Collector still
     wants whatever they wanted and still owns whatever they owned; a card can
     be taken out of "Mudkip Collection" without any of that changing. */
  removeBinderEntry(state, a, { binderId, canonicalCardId }, ctx) {
    const binder = list(state.binders).find((b) => b.id === binderId);
    if (!binder) return refuse(R.notFound);
    if (a.seat !== "collector" || binder.collectorId !== a.collectorId) return refuse(R.notOwner);
    const has = list(state.binderEntries)
      .some((e) => e.binderId === binderId && e.canonicalCardId === canonicalCardId);
    if (!has) return done(state, false);
    return done({ ...state, binderEntries: list(state.binderEntries)
      .filter((e) => !(e.binderId === binderId && e.canonicalCardId === canonicalCardId)) }, true);
  },

  /* ======================================================= OBJECT MEMBERSHIP

     WHERE A GOAL OR A COPY BELONGS (Batch 3A).

     `addBinderEntry` above files a CARD, and that is the shape 0013 shipped and
     the shape the Collector's screens still send. These two file an OBJECT: one
     Goal, or one CollectorCopy, in one Binder. The difference is the whole
     batch. A Collector who hunts a card, keeps one copy of it and would part
     with another has three things that can belong in three different places,
     and a row naming the card could not say so — "three actionable objects
     share one row, which is why the row is on its way to naming the object
     instead", as the note above `addBinderEntry` has said since the salvage.

     NOTHING HERE READS A CARD-LEVEL ROW, AND NOTHING HERE WRITES ONE. The two
     representations stand side by side while the screens move across, and a
     legacy row is never an answer to "which Binder is this Goal in" — if no
     membership names the object, the object is unfiled. A legacy row records an
     act of filing a card; nothing on it records what caused it, so reading one
     as a Goal's home would be inventing the one thing nobody wrote down.

     AT MOST ONE HOME, WHICH IS WHY THERE IS NO `moveObject`. An object belongs
     in one place or in none, so filing it somewhere else IS the move: one
     command, one row, updated in place. Remove-then-add would pass through a
     state where the object belongs nowhere, and across two transactions it
     could stop there. */

  fileObject(state, a, { binderId, goalId, collectorCopyId }, ctx) {
    const at = ctx.at;
    const target = oneTarget(goalId, collectorCopyId);
    if (!target) return refuse(R.invalidTarget);
    const binder = list(state.binders).find((b) => b.id === binderId);
    if (!binder) return refuse(R.notFound);
    if (a.seat !== "collector" || binder.collectorId !== a.collectorId) return refuse(R.notOwner);
    const object = target.kind === "goal"
      ? list(state.goals).find((g) => g.id === target.id)
      : list(state.collectorCopies).find((b) => b.id === target.id);
    if (!object) return refuse(R.notFound);
    /* BOTH SIDES, NOT ONE. Owning the binder is not enough: a membership names
       an object, and a row pairing this Collector's binder with somebody else's
       Goal would put another person's object id into this Collector's own view,
       which the projection scopes by the binder alone. */
    if (object.collectorId !== a.collectorId) return refuse(R.notOwner);
    const key = target.kind === "goal" ? "goalId" : "collectorCopyId";
    const existing = list(state.binderMemberships).find((m) => m[key] === target.id);
    /* Already there: the same answer, said twice. The row keeps its id and the
       moment it was filed, because neither changed. */
    if (existing && existing.binderId === binderId) return done(state, existing.id);
    /* AND THE ARCHIVE GATE IS BELOW THAT, ON PURPOSE. It was above it first,
       which refused a re-statement of a home the Collector already has in a
       binder they have since archived — a no-op answered with an error, which
       `addBinderEntry` does not do either. An archived binder is a bar on
       filing something NEW into it, not on the truth staying true. */
    if (binder.archivedAt) return refuse(R.binderArchived);
    /* Somewhere else: the SAME row moves. Updated in place, never removed and
       re-added — the membership's id is the handle everything else uses, and
       `binderMemberships` must not be reordered by a move either. */
    if (existing) {
      return done({ ...state, binderMemberships: list(state.binderMemberships)
        .map((m) => (m.id === existing.id ? { ...m, binderId, filedAt: at } : m)) }, existing.id);
    }
    const id = ctx.id("bm");
    return done({ ...state, binderMemberships: [...list(state.binderMemberships),
      { id, binderId, [key]: target.id, filedAt: at }] }, id);
  },

  /* NO HOME, WHICH IS NOT THE SAME AS NO MEANING. The Goal is still the hunt it
     was and the copy is still owned, kept or offered exactly as before; they
     are simply not in a binder. It names no binder because an object has one
     home or none, and naming the one being left would be a fact a caller could
     get wrong for no gain. */
  unfileObject(state, a, { goalId, collectorCopyId }, ctx) {
    const target = oneTarget(goalId, collectorCopyId);
    if (!target) return refuse(R.invalidTarget);
    /* THE SEAT BEFORE THE LOOKUP, AND THIS ORDER IS THE WHOLE REASON THE LINE
       IS SPLIT IN TWO. It was one line below the lookup, which answered
       `not-found` for an id that does not exist and `not-owner` for one that
       does — to ANY authenticated caller, including a Trusted Partner with no
       relationship to the owner. The difference between those two answers is a
       fact about somebody else's collection, and a partner holding a copy id
       could use it to learn whether that copy still exists. `fileObject` never
       had the problem because it reaches the binder first and a non-owner stops
       there; the other commands in this file that probe before checking probe
       BINDER ids, which a partner is never given. This is the first that
       probes an object, so it asks about the seat first. */
    if (a.seat !== "collector") return refuse(R.notOwner);
    const object = target.kind === "goal"
      ? list(state.goals).find((g) => g.id === target.id)
      : list(state.collectorCopies).find((b) => b.id === target.id);
    if (!object) return refuse(R.notFound);
    if (object.collectorId !== a.collectorId) return refuse(R.notOwner);
    const key = target.kind === "goal" ? "goalId" : "collectorCopyId";
    const existing = list(state.binderMemberships).find((m) => m[key] === target.id);
    /* Unfiled already: nothing to do, and that is a success. An archived binder
       is no bar here — a Collector must always be able to take a thing out. */
    if (!existing) return done(state, false);
    return done({ ...state, binderMemberships: list(state.binderMemberships)
      .filter((m) => m.id !== existing.id) }, true);
  },

  /* ------------------------------------------------------------ relationships & profile */
  /* AN INVITATION NAMES NOBODY (Phase 5 Batch 2).

     It used to mint a Collector record and bind itself to it. That could not
     survive a decision the product had already made — a Collector may belong to
     any number of Collector Networks (contract §2) — because two partners
     inviting one person produced two Collector identities, and the account
     directory permits one active account per subject and one per collector. The
     person could only ever be one of them, so the second partner's invitation
     was unredeemable by the person it was for.

     So this creates one thing: the offer. Who made it, when, until when, and
     who it was meant for as a HINT. The Collector actor is resolved — or
     created for the first time — when the invited human authenticates and
     redeems, which is Batch 3's work and is deliberately not here. Nothing in
     this command writes a Collector or a Relationship, and a test asserts both
     counts are unchanged.

     THE RECIPIENT IS A LABEL, NOT AUTHORITY. It is how the partner recognises
     which invitation is which; it decides nothing about who may redeem one.
     Possession of the credential, plus an authenticated identity, is what will
     establish that — so a typo here costs a re-issue rather than locking the
     right person out.

     PHASE 2 (D-1): a note typed at invitation belongs to the inviting partner,
     so it travels on that partner's own Invitation and never on a shared
     record. Relationship dates do not exist until a Relationship does. */
  inviteCollector(state, a, { recipient, note }, ctx) {
    if (a.seat !== "tp") return refuse(R.notOwner);
    const at = ctx.at;
    if (!at) return refuse(R.notFound);
    const id = ctx.id("inv-");
    return done({ ...state,
      invitations: [...list(state.invitations), {
        id,
        partnerId: a.partnerId,
        /* Unresolved. Batch 3 fills it in at redemption, and until then this
           invitation belongs to nobody. */
        collectorId: null,
        at,
        expiresAt: D.invitationExpiry(at),
        acceptedAt: null,
        revokedAt: null,
        recipient: hint(recipient),
        note: hint(note),
      }] }, id);
  },

  /* WITHDRAWING ONE, AND IT IS ONE-WAY. Nothing is deleted: a revoked
     invitation is still what happened, and reading it back is how a partner
     answers "what did I send that person?". To let somebody in after this,
     invite them again — a new invitation with a new credential — so what became
     of the old one stays readable.

     Re-revoking changes nothing and succeeds. That is deliberate: a partner
     whose first attempt ended in an unknown outcome can press it again without
     the second press failing for a reason that is not about the invitation. */
  revokeCollectorInvitation(state, a, { invitationId }, ctx) {
    if (a.seat !== "tp") return refuse(R.notOwner);
    const inv = list(state.invitations).find((i) => i.id === invitationId);
    if (!inv) return refuse(R.notFound);
    if (inv.partnerId !== a.partnerId) return refuse(R.notOwner);
    /* An accepted invitation produced a Relationship; ending that is a
       different act, and not this one. */
    if (inv.acceptedAt) return refuse(R.terminal);
    if (inv.revokedAt) return done(state, invitationId);
    return done({ ...state, invitations: list(state.invitations).map((i) => (i.id === invitationId
      ? { ...i, revokedAt: ctx.at } : i)) }, invitationId);
  },

  updatePartnerProfile(state, a, { patch }, ctx) {
    if (a.seat !== "tp") return refuse(R.notOwner);
    const p = list(state.partners).find((x) => x.id === a.partnerId);
    if (!p) return refuse(R.notFound);
    const allowed = ["about", "specialties", "website", "instagram", "email", "phone"];
    const clean = {};
    allowed.forEach((k) => { if (patch && k in patch) clean[k] = patch[k]; });
    if ("specialties" in clean && !Array.isArray(clean.specialties)) return refuse(R.invalidAmount);
    return done({ ...state, partners: list(state.partners).map((x) => (x.id === a.partnerId
      ? { ...x, ...clean } : x)) }, a.partnerId);
  },

  /* Opening a collector's profile is the partner's binder review. The timestamp
     is that partner's (D-1), so it lives on THEIR Relationship with the
     collector — never on the shared Collector record, where every other partner
     related to the same collector would read it. */
  markBinderReviewed(state, a, { collectorId }, ctx) {
    if (a.seat !== "tp") return refuse(R.notOwner);
    if (!isRelated(state, a.partnerId, collectorId)) return refuse(R.noRelationship);
    const mine = (r) => r.partnerId === a.partnerId && r.collectorId === collectorId
      && (r.status == null || r.status === "accepted");
    return done({ ...state, relationships: list(state.relationships).map((r) => (mine(r)
      ? { ...r, binderReviewedAt: ctx.at } : r)) }, collectorId);
  },

  /* TPInterest references an exact CollectorCopy in the partner's network.

     `binderId` is the parameter name and `interests.binderId` is the stored
     field; both are legacy naming debt, written down in domain/README.md. They
     name a collector copy and always did. Renaming them touches the interest
     model and the trade package, which is not this batch's work.

     INTEREST IS IN SOMETHING OFFERED (C2). A partner may only mark interest in
     a copy that its owner is offering — the same copies the projection gives
     them. Without this, a partner who learned an id could register interest in
     a card the Collector has withdrawn, and the Collector would see interest in
     something they are not offering. `notFound`, not a distinct refusal: a copy
     the partner may not see does not exist for them, and a refusal that told
     them apart would be the leak.

     BUT PUTTING A CARD DOWN IS NOT THE SAME ACT AS PICKING IT UP (C2.1), and
     C2 gated both on the same condition, which was a mistake. Interest is a
     partner pulling an offered card aside to think about; it reserves nothing
     and promises nothing. When the Collector then withdraws the offer, the
     partner was left holding a signal they could not put down: `on: false` was
     refused along with `on: true`, so the Collector went on seeing interest in
     a card they had taken off the table, and the only way to clear it was for
     them to re-offer the card they had just decided not to offer.

     So the gates below apply to CREATING interest only. Withdrawal needs the
     copy to exist and the relationship to be current, and nothing else — it
     removes a signal rather than making one, and a partner whose needs have
     changed is allowed to say so.

     AND A COPY A DEAL IS HOLDING TAKES NO NEW INTEREST (C2.1). Interest does
     not reserve a copy and this does not make it reserve one; it is the other
     direction. Once a specific physical card is reserved or committed inside an
     active deal — or has already been traded away — it cannot participate in
     another acquisition, so inviting a second partner to line up behind it
     would be recording a signal the product cannot honour. The status is the
     one the rest of the domain derives from the opportunities
     (`collectorCopyStatus`); nothing new is stored and there is no second
     source of truth. Existing interest in such a copy stays withdrawable, for
     the same reason as above. */
  setInterest(state, a, { binderId, on }, ctx) {
    const at = ctx.at;
    if (a.seat !== "tp") return refuse(R.notOwner);
    const copy = list(state.collectorCopies).find((b) => b.id === binderId);
    if (!copy) return refuse(R.notFound);
    if (on && copy.offered !== true) return refuse(R.notFound);
    if (!isRelated(state, a.partnerId, copy.collectorId)) return refuse(R.noRelationship);
    const has = list(state.interests).some((i) => i.partnerId === a.partnerId && i.binderId === binderId);
    if (!!on === has) return done(state, has);
    /* Selected is not held (M3A A1): a copy other partners are merely
       considering is still somebody's to be interested in. */
    if (on && D.copyExclusive(binderId, list(state.opportunities))) {
      return refuse(R.copyUnavailable);
    }
    return done({ ...state, interests: on
      ? [...list(state.interests), { partnerId: a.partnerId, binderId, at }]
      : list(state.interests).filter((i) => !(i.partnerId === a.partnerId && i.binderId === binderId)) }, !!on);
  },

  /* ------------------------------------------------------------ conversation */
  /* One thread per collector + partner + card identity. Reach out and messages
     never create an Opportunity. */
  sendMessage(state, a, { collectorId, partnerId, cardId, text, oppId, event }, ctx) {
    const pid = a.seat === "tp" ? a.partnerId : partnerId;
    const cid = a.seat === "collector" ? a.collectorId : collectorId;
    const card = cardById(state, cardId);
    if (!card || !pid || !cid) return refuse(R.notFound);
    if (!isRelated(state, pid, cid)) return refuse(R.noRelationship);
    const clean = typeof text === "string" ? text.trim() : "";
    if (!clean && !event) return refuse(R.notFound);
    if (oppId != null) {
      const o = oppById(state, oppId);
      if (!o || o.partnerId !== pid || o.collectorId !== cid) oppId = undefined;
    }
    const entry = clean ? { kind: "message", by: a.seat, text: clean }
      : { kind: "event", by: "system", text: "Reached out" };
    return done({ ...state, conversations: D.appendThreadEntry(state.conversations, {
      collectorId: cid, partnerId: pid, card, cardId, oppId, entry, at: ctx.now(), id: ctx.id("e") }) },
      D.threadKey(cid, pid, card));
  },

  /* ------------------------------------------------------------ a deal's conversation
     (Milestone 2D.1). One thread per canonical opportunity, between that
     deal's two participants and nobody else.

     WHO. The sender is the authenticated actor and nothing else: the payload
     names only the deal, the words and a nonce. The participants are read off
     the deal, so a client cannot address a message to anybody, or forge who
     sent it. Not found and not-a-participant answer as every deal command
     does (`oppGate`'s order).

     WHAT IT CHANGES: one entry in one thread. Never the opportunity — not its
     price thread, turn, stage, terms or agreement — and never inventory, Goals
     or any other deal. "I accept your $11 offer" is stored as those words;
     only Accept accepts. The text is kept as plain text, trimmed, 1 to
     DEAL_MESSAGE_MAX characters.

     WHEN. Readable for as long as the participants can see the deal; sent
     only while the deal is active — refused as `terminal` once it is ended
     (withdrawn, cancelled, declined) or completed, as every deal command is.
     A message never reopens anything.

     A RETRY IS NOT A SECOND MESSAGE. The client composes each message with a
     fresh nonce. The same sender, deal, nonce and words again — a press whose
     answer was lost — returns the message already stored, even if the deal
     has since closed; the same nonce with different words is refused. The
     nonce lives on the entry, so this survives a reload and a restart. Each
     sender's nonces are their own. */
  sendDealMessage(state, a, { oppId, text, nonce }, ctx) {
    const o = oppById(state, oppId);
    if (!o) return refuse(R.notFound);
    if (!isParticipant(a, o)) return refuse(R.notParticipant);
    const clean = typeof text === "string" ? text.trim() : "";
    if (!clean) return refuse(R.messageEmpty);
    if ([...clean].length > D.DEAL_MESSAGE_MAX) return refuse(R.messageTooLong);
    if (typeof nonce !== "string" || !nonce.trim() || nonce.length > 128) return refuse(R.nonceRequired);
    const thread = D.findDealThread(state.conversations, o.id);
    const before = thread ? thread.entries.find((e) => e.kind === "message" && e.by === a.seat && e.nonce === nonce) : null;
    if (before) return before.text === clean ? done(state, before.id) : refuse(R.nonceConflict);
    if (!D.isActive(o)) return refuse(R.terminal);
    const id = ctx.id("m");
    const entry = { id, at: ctx.now(), kind: "message", by: a.seat,
      senderId: a.seat === "tp" ? a.partnerId : a.collectorId, text: clean, nonce };
    const key = D.dealThreadKey(o.id);
    const conversations = thread
      ? list(state.conversations).map((t) => (t.key === key ? { ...t, entries: [...t.entries, entry] } : t))
      : [...list(state.conversations), { id: "t" + key, key, collectorId: o.collectorId, partnerId: o.partnerId,
        cardId: null, oppId: o.id, entries: [entry] }];
    return done({ ...state, conversations }, id);
  },

  /* A lifecycle note: an entry in the participants' own thread and/or the
     partner's activity feed. Records reading of what happened; changes no term.
     The activity row is stamped with the acting partner (D-4): it is that
     partner's feed, and a row without an owner is projected to nobody. */
  recordNote(state, a, { collectorId, cardId, oppId, milestone, activity }, ctx) {
    const pid = a.seat === "tp" ? a.partnerId : null;
    const cid = a.seat === "collector" ? a.collectorId : collectorId;
    if (a.seat !== "tp") return refuse(R.notOwner);
    if (!cid) return refuse(R.notFound);
    const known = list(state.collectors).some((c) => c.id === cid);
    if (!known) return refuse(R.notFound);
    const pendingInvite = list(state.invitations).some((i) => i.partnerId === pid && i.collectorId === cid);
    if (!isRelated(state, pid, cid) && !pendingInvite) return refuse(R.noRelationship);
    let next = state;
    if (milestone) {
      const card = cardById(state, cardId);
      if (card) {
        next = { ...next, conversations: D.appendThreadEntry(next.conversations, {
          collectorId: cid, partnerId: pid, card, cardId, oppId,
          entry: { kind: "event", by: "system", text: milestone }, at: ctx.now(), id: ctx.id("e") }) };
      }
    }
    if (activity && activity.text) {
      next = { ...next, activity: [{ id: ctx.id("a"), partnerId: pid, collectorId: cid, type: activity.type || "stage",
        text: activity.text, date: ctx.time(activity.date) || null }, ...list(next.activity)] };
    }
    return done(next, true);
  },

  /* Reading position only. Allowed on any opportunity the actor is part of,
     terminal ones included — reading is not acting, and no term changes. */
  markDealViewed(state, a, { oppId, surface }, ctx) {
    const o = oppById(state, oppId);
    if (!o) return refuse(R.notFound);
    if (!isParticipant(a, o)) return refuse(R.notParticipant);
    const where = surface === "messages" ? "messages" : "timeline";
    return done(withOpp(state, oppId, (x) => {
      const prev = x.viewedAt || {};
      return { ...x, viewedAt: { ...prev, [a.seat]: { ...(prev[a.seat] || {}), [where]: ctx.at } } };
    }), oppId);
  },

  /* ------------------------------------------------------------ review card */
  reviewCopy(state, a, { invId }, ctx) {
    const at = ctx.at;
    if (a.seat !== "collector") return refuse(R.notOwner);
    const copy = list(state.inventory).find((i) => i.invId === invId);
    if (!copy) return refuse(R.copyUnavailable);
    /* RELATIONSHIP FIRST, for the reason spelled out in `startOpportunity`: a
       collector with no connection to this shop should not be able to read a
       copy's state out of an id, and answering `copy-unavailable` for a sold
       card before asking whether they know the shop at all did exactly that. */
    if (!isRelated(state, copy.partnerId, a.collectorId)) return refuse(R.noRelationship);
    if (copy.archived) return refuse(R.copyUnavailable);
    /* THE DOOR. A copy that is pending for, or promised to, somebody else's deal
       is closed to a collector who has not already started looking at it — and
       it is closed with the SAME answer a sold copy gives. That sameness is the
       point: this check used to refuse only `sold`, so the difference between
       "refused" and "allowed" told a rival exactly when another collector's deal
       reached final agreement. One answer for every closed state, and the reason
       stays where it belongs, which is with the two people in the deal. */
    /* ALREADY IN THE ROOM, AND ASKED FIRST. An open review is answered with
       itself, so a collector mid-inspection is never told their own copy is
       unavailable — and `reviewCopy` stays idempotent, which is what makes a
       retry safe after a press whose answer was lost. An adversarial run caught
       this check sitting BELOW the door, doing the opposite of what the comment
       beside it claimed. */
    const open = list(state.copyReviews)
      .find((r) => r.collectorId === a.collectorId && r.invId === invId && !r.endedAt);
    if (open) return done(state, open.id);
    if (!D.openToNewQualification(invId, state.opportunities, state.inventory)
      && !D.holdingCopy(invId, a.collectorId, state.opportunities, state.inventory)) {
      return refuse(R.copyUnavailable);
    }
    const id = ctx.id("rv");
    return done({ ...state, copyReviews: [...list(state.copyReviews),
      { id, collectorId: a.collectorId, partnerId: copy.partnerId, invId, at, endedAt: null }] }, id);
  },

  endReview(state, a, { reviewId }, ctx) {
    const at = ctx.at;
    const r = list(state.copyReviews).find((x) => x.id === reviewId);
    if (!r) return refuse(R.notFound);
    if (a.seat !== "collector" || r.collectorId !== a.collectorId) return refuse(R.notOwner);
    return done({ ...state, copyReviews: list(state.copyReviews).map((x) =>
      (x.id === reviewId && !x.endedAt ? { ...x, endedAt: at || null } : x)) }, reviewId);
  },

  requestPhotos(state, a, { invId }, ctx) {
    const at = ctx.at;
    if (a.seat !== "collector") return refuse(R.notOwner);
    const copy = list(state.inventory).find((i) => i.invId === invId);
    if (!copy) return refuse(R.copyUnavailable);
    if (!isRelated(state, copy.partnerId, a.collectorId)) return refuse(R.noRelationship);
    if (copy.archived) return refuse(R.copyUnavailable);
    /* ASKING FOR PHOTOGRAPHS OF A CARD THAT IS GONE (Option B, Item 0).
       `reviewCopy` has always refused a sold copy and this did not, which meant
       a Collector could ask a partner to photograph a card they no longer own.
       The two commands exist for one purpose — looking properly at a copy — and
       they now answer the same way. */
    /* THE SAME DOOR, AND THE SAME ANSWER (see `reviewCopy`). An open request of
       their own answers first, so somebody who already asked is never told the
       copy is unavailable; anyone else is refused identically whether the copy
       is pending, promised or gone.

       ASKING FOR EVIDENCE IS ITS OWN INTERACTION. An open REVIEW does not open
       this door. A collector inspecting a copy that then closes may finish
       looking and may end their review, but putting a NEW job on the partner's
       shelf for a card that is already promised to somebody else is starting
       something, not completing it — and the narrow reading is the one that
       keeps "retains only the access necessary" honest. */
    const asked = list(state.photoRequests)
      .some((r) => r.collectorId === a.collectorId && r.invId === invId && !r.fulfilledAt);
    if (asked) return done(state, null);
    if (!D.openToNewQualification(invId, state.opportunities, state.inventory)
      && !D.holdingCopy(invId, a.collectorId, state.opportunities, state.inventory)) {
      return refuse(R.copyUnavailable);
    }
    /* AFTER the door, so a bystander cannot tell a closed photographed copy
       (nothing to ask for) from a closed unphotographed one. */
    if (D.INVARIANTS.copyPhotographed(copy.photos)) return done(state, null);
    const id = ctx.id("pr");
    const reviewing = list(state.copyReviews).some((r) => r.collectorId === a.collectorId && r.invId === invId && !r.endedAt);
    return done({ ...state,
      photoRequests: [...list(state.photoRequests),
        { id, collectorId: a.collectorId, partnerId: copy.partnerId, invId, at, fulfilledAt: null }],
      copyReviews: reviewing ? list(state.copyReviews) : [...list(state.copyReviews),
        { id: "rv" + id, collectorId: a.collectorId, partnerId: copy.partnerId, invId, at, endedAt: null }] }, id);
  },

  /* ------------------------------------------------------------ agree on price */
  /* Only the collector opens a negotiation, only from a Primary Goal, only with
     a related partner, and only on the exact copy the goal names. The partner,
     card and listed price come from the canonical records — never the caller.

     THE EXACT COPY THE GOAL NAMES (Phase 5 Batch 8). Two records name a card
     and this proves they name the SAME card. From Batch 7 either of them may
     name it canonically, so there are two ways to ask and the answer must never
     be assembled from one of each: a canonical Goal and a legacy Copy have said
     nothing comparable to each other, and treating that as a match would let a
     deal begin over two different cards. Canonical identity is an equality on an
     opaque id; legacy identity is the demo's eight-dimension key. Mixed refuses.

     This closes a real hole rather than tidying one. Until now the legacy key
     was the only comparison, and it reads an absent card as the empty string —
     so two canonical records, holding no legacy card between them, compared
     equal, and any canonical copy would have satisfied any canonical Goal. */
  startOpportunity(state, a, { goalId, invId, amount, percent }, ctx) {
    const at = ctx.at;
    if (a.seat !== "collector") return refuse(R.notOwner);
    const g = list(state.goals).find((x) => x.id === goalId);
    if (!g) return refuse(R.noGoal);
    if (g.collectorId !== a.collectorId) return refuse(R.notOwner);
    if (!D.INVARIANTS.goalIsPursued(goalId, state.goals)) return refuse(R.notPrimary);
    if (!D.INVARIANTS.oneNegotiationPerGoal(goalId, state.opportunities)) return refuse(R.alreadyNegotiating);
    const copy = list(state.inventory).find((i) => i.invId === invId);
    /* An id that names nothing cannot be checked against a relationship, so it
       answers here; everything that depends on the copy's STATE — archived
       included — waits until the two questions below have been asked. This line
       used to carry `copy.archived` too, which meant a collector with no
       connection to the shop watched a copy flip to unavailable the moment the
       partner tidied it off the shelf. */
    if (!copy) return refuse(R.copyUnavailable);
    const wanted = typeof g.canonicalCardId === "string" && g.canonicalCardId;
    const held = typeof copy.canonicalCardId === "string" && copy.canonicalCardId;
    if (wanted || held) {
      if (!(wanted && held && wanted === held)) return refuse(R.identityMismatch);
    } else if (!D.sameIdentity(cardById(state, copy.cardId), cardById(state, g.cardId))) {
      return refuse(R.identityMismatch);
    }
    if (!isRelated(state, copy.partnerId, a.collectorId)) return refuse(R.noRelationship);
    /* ONE ACTIVE OFFER PER EXACT CARD (Market Validation, Batch 2), whichever
       shop holds it. Asked only of this Collector's own deals, so it says
       nothing about anybody else's. */
    const sameCard = (o) => (wanted ? o.canonicalCardId === wanted
      : !o.canonicalCardId && (o.cardId === g.cardId
        || D.sameIdentity(cardById(state, o.cardId), cardById(state, g.cardId))));
    if (!D.INVARIANTS.oneActiveOfferPerCard(a.collectorId, sameCard, state.opportunities)) return refuse(R.alreadyNegotiating);
    /* THE SAME QUESTION DISCOVERY ASKS, ASKED BY THE SAME FUNCTION. A Collector
       must not be able to reach past a surface that correctly declined to offer
       them this copy; and a pair Discovery DOES offer must never be refused
       here. One predicate, two callers, so the two cannot drift apart. */
    if (!D.meetsGoalCriteria(g.desired, copy)) return refuse(R.criteriaMismatch);
    /* WHICH COPIES A NEW PURSUIT MAY BEGIN ON (Option B), AND HOW LITTLE IT MAY
       SAY ABOUT WHY NOT. Every answer but `available` refuses, in one word.

       This used to refuse in three different words, on the reasoning that a
       Collector told "the shop is working on this one" and a Collector told
       "it's sold" are owed different next moves. They would be — but the
       sentence is about somebody else's negotiation, and it was readable by
       anyone: a new pursuit needs no prior connection to the card, so these
       three answers were a public oracle on a rival deal's stage, pollable with
       one goal and an id. A collector opening a pursuit needs to know the copy
       is not one they can pursue. That is all of it.

       AND THE ORDER MATTERS AS MUCH AS THE WORD. This gate used to run before
       the card-identity and relationship checks above, so a collector with no
       relationship to the shop, holding a goal for an entirely different card,
       still read any copy's exact lifecycle stage out of an arbitrary invId.
       Asking "is this even your shop, and even your card?" first means a
       stranger never reaches the availability answer at all.

       An agreed market value is not among the reasons, and did not become one:
       two people may still both find out what a card is worth. */
    if (copy.archived) return refuse(R.copyUnavailable);
    const status = D.inventoryCopyStatus(invId, state.opportunities, state.inventory);
    if (status !== "available") return refuse(R.copyUnavailable);
    /* THE OPENING OFFER (Market Validation, Batch 2). Whole dollars, or a share
       of the Proposed Market Price rounded to the whole dollar — see
       `priceProposal`. The partner's price and Firm on Price are CAPTURED here
       — `listedPrice` and `firmOnPrice` on the opportunity — so a later edit to
       the shelf cannot move a negotiation already under way, and every
       percentage in it is measured against that captured price. Firm means the
       opening must equal the captured price in whole dollars; it never means
       the deal is agreed: every opening still waits for the partner. */
    const opening = D.priceProposal(copy.ask, { amount, percent });
    if (opening.refused) return refuse(opening.refused);
    const firm = copy.firmOnPrice === true;
    if (firm && opening.amount !== D.wholeDollarPrice(copy.ask)) return refuse(R.firmOnPrice);
    const partner = list(state.partners).find((p) => p.id === copy.partnerId) || {};
    const id = ctx.id("o");
    const opp = { id, goalId, collectorId: a.collectorId, partnerId: copy.partnerId,
      ...(wanted ? { canonicalCardId: wanted } : { cardId: g.cardId }),
      invId, stage: "agree-price", listedPrice: copy.ask, firmOnPrice: firm,
      agreedPrice: null, priceThread: [{ by: "collector", type: "offer", amount: opening.amount, at,
        ...(opening.basis ? { basis: opening.basis } : {}) }],
      trade: { submitted: false, cards: [] },
      tradeRate: partner.tradeRate != null ? partner.tradeRate : null,
      deal: D.emptyDeal(), fulfillment: D.emptyFulfillment(),
      declined: false, completedAt: null, updated: at };
    return done({ ...state, opportunities: [...list(state.opportunities), opp] }, id);
  },

  /* A counter. The actor must own the turn, which also means nobody can
     counter their own standing figure. */
  proposePrice(state, a, { oppId, amount, percent }, ctx) {
    const at = ctx.at;
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (!pairTrusted(state, o)) return refuse(R.noRelationship);
    if (o.stage !== "agree-price") return refuse(R.wrongStage);
    /* THE CARD HAS TO STILL BE THERE (Option B, Item 0). Until now two people
       could go on proposing figures for a card that had been sold and handed
       over weeks earlier, because only ACCEPTING a price was checked. A price
       is a statement about a thing; when the thing is gone the statement is
       not merely unenforceable, it is untrue. */
    const blocked = copyBlockedFor(state, o, a);
    if (blocked) return refuse(blocked);
    if (!turnFor(a, o, "price", "offer")) return refuse(R.notYourTurn);
    /* WHOLE DOLLARS, OR A SHARE OF THE PRICE CAPTURED AT THE OPENING (Market
       Validation, Batch 2) — the same rule as the opening, for either side. */
    const proposal = D.priceProposal(o.listedPrice, { amount, percent });
    if (proposal.refused) return refuse(proposal.refused);
    const type = (o.priceThread || []).length ? "counter" : "offer";
    return done(withOpp(state, oppId, (x) => stamp({ ...x,
      priceThread: [...(x.priceThread || []), { by: a.seat, type, amount: proposal.amount, at,
        ...(proposal.basis ? { basis: proposal.basis } : {}) }] }, at)), oppId);
  },

  /* Accepting the OTHER side's standing figure — never your own. The agreed
     figure is the thread's, never the payload's: any `amount` a caller sends is
     ignored.

     AND SETTLING A PRICE DOES NOT COMMIT THE COPY — CORRECTED. This header used
     to say that it did, and that "a copy already committed to another live deal
     cannot be settled again". Option B moved the availability boundary to final
     agreement and left both sentences behind; the comment inside this function
     already said so, seventeen lines below, and the two contradicted each other.
     Two Collectors may both settle a price on one copy and neither is owed it —
     `copyCommittedTo` and `validateWorld` were both moved off `agreedPrice`, and
     only this header was not.

     What `agreedPrice` DOES open is the MUTATION window (`copyInLiveDeal`): from
     here the partner may no longer re-certify, re-grade or archive the copy,
     because a Collector is now reasoning about that exact physical card.
     Availability is a different question with a different answer — see
     `INVARIANTS.copyCommittedTo`. Comment corrected; behaviour untouched. */
  acceptPrice(state, a, { oppId }, ctx) {
    const at = ctx.at;
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (!pairTrusted(state, o)) return refuse(R.noRelationship);
    if (o.stage !== "agree-price") return refuse(R.wrongStage);
    /* THE CARD HAS TO STILL BE PURSUABLE BY THIS DEAL — and, since Option B,
       that no longer means "nobody else has agreed a value on it". Two
       collectors may both agree what this card is worth; neither is owed it.
       What stops this acceptance is the card being gone, the partner having
       marked it pending for somebody else, or somebody else having reached a
       final agreement on it. Same question `proposePrice` asks, same answers. */
    const blocked = copyBlockedFor(state, o, a);
    if (blocked) return refuse(blocked);
    const last = D.lastEntry(o.priceThread);
    if (!last || last.by === a.seat) return refuse(R.notYourTurn);
    if (!turnFor(a, o, "price")) return refuse(R.notYourTurn);
    return done(withOpp(state, oppId, (x) => stamp({ ...x, agreedPrice: last.amount, stage: "select-trade",
      /* No trade-or-cash intent is recorded by agreeing a price; the
         collector's package (or cash-only choice) records it. */
      trade: x.trade || { submitted: false, cards: [] },
      priceThread: [...(x.priceThread || []), { by: a.seat, type: "accept", amount: last.amount, at }] }, at)), oppId);
  },

  /* ------------------------------------------------------------ select trade */
  /* TP-LED TRADE SELECTION (M3A A1).

     The partner chooses specific physical copies from the Collector's Trade/Sell
     supply — the copies the Collector has offered in Browse, which every
     connected partner already sees. The Collector never submits cards to a
     deal and cannot force one into it. What the Collector CAN do is ask for
     time ("hold on, I'm adding more cards", as often as they like), offer more
     copies through Browse, say when they are ready, and withdraw any selected
     card from this deal.

     SELECTION IS NOT RESERVATION. A selected copy's material specification is
     locked at once (`D.copySpecLocked`) and a snapshot rides on the row, but
     the copy stays selectable in other deals — with other partners or with this
     one — until a deal enters valuation. `closeTradeSelection` is that moment,
     and it is atomic: every live row is re-checked under the world lock and
     either all of them become reserved for this deal and the stage moves to
     Value Trade, or nothing changes at all.

     NO PHOTOGRAPHS ARE REQUIRED. The rule that a copy needed both faces before
     it could be valued was retired for the pilot; photographs that exist are
     snapshotted and locked, and photographs that do not are not asked for.

     SELECTING NEVER WRITES `offered` OR `keeping`. Trade/Sell is a fact about the
     copy, said by its owner; being considered in a deal is a fact about the
     deal. */
  selectTradeCards(state, a, { oppId, copyIds }, ctx) {
    const at = ctx.at;
    if (a.seat !== "tp") return refuse(R.notOwner);
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (o.stage !== "select-trade") return refuse(R.wrongStage);
    const gone = copyBlockedFor(state, o, a);
    if (gone) return refuse(gone);
    if (!turnFor(a, o, "select-trade", "close-selection")) return refuse(R.notYourTurn);
    if (!Array.isArray(copyIds)) return refuse(R.notFound);
    const sending = D.nextActor(o).reason === "select-trade";
    /* An empty SEND is a real message — "nothing yet; have you got more?" — and
       hands the Collector their look. An empty selection during the final
       review says nothing at all. */
    if (!copyIds.length && !sending) return refuse(R.nothingToAccept);
    if (new Set(copyIds).size !== copyIds.length) return refuse(R.copyInUse);
    if (!isRelated(state, a.partnerId, o.collectorId)) return refuse(R.noRelationship);
    const live = new Set(D.TRADE.liveTradeRows(o).map((c) => c.binderId));
    const rows = [];
    for (const bid of copyIds) {
      const b = list(state.collectorCopies).find((x) => x.id === bid);
      /* Somebody else's copy, or no copy: the same answer, so a partner cannot
         probe ids for the existence of cards they were never shown. */
      if (!b || b.collectorId !== o.collectorId) return refuse(R.notFound);
      /* NOT OFFERED, OR HELD EXCLUSIVELY BY ANOTHER DEAL: one public answer.
         A partner only ever sees offered copies, so "not offered" and "taken"
         are both just "you cannot have this one", and saying which would tell
         them about a PC decision or a rival deal they are not owed. */
      if (!D.copyOffered(b)) return refuse(R.copyUnavailable);
      if (D.copyExclusive(bid, state.opportunities, oppId)) return refuse(R.copyUnavailable);
      if (live.has(bid)) return refuse(R.copyInUse);
      /* A copy the Collector withdrew from THIS deal may be selected again: a
         new row, a new snapshot, fresh valuation. The withdrawn row stays as
         history. Reconsideration uses the ordinary process; nothing reopens. */
      rows.push({ ...D.emptyTradeCard(b.cardId, b.photos, b.cert, bid, b.canonicalCardId,
        { grade: b.grade, condition: b.condition }),
        id: ctx.id("tc" + (b.canonicalCardId || b.cardId) + "-"),
        inclusion: "accepted", by: "tp", selectedAt: at || null, reviewedAt: at || null });
    }
    return done(withOpp(state, oppId, (x) => {
      const sel = D.TRADE.selectionOf(x);
      const selection = sending
        ? { ...sel, sentAt: at || true, readyAt: null, closedEmptyAt: null, adding: false }
        : sel;
      return stamp({ ...x, trade: { ...(x.trade || {}),
        ...(rows.length ? { mode: "trade" } : {}),
        cards: [...((x.trade && x.trade.cards) || []), ...rows], selection } }, at);
    }), rows.map((r) => r.id));
  },

  /* The partner takes back one of its own selections before valuation. The row
     stays, marked `rejected`, because "they looked at this one and passed" is
     part of what happened; the copy stops being selected by this deal. */
  deselectTradeCard(state, a, { oppId, tradeCardId }, ctx) {
    const at = ctx.at;
    if (a.seat !== "tp") return refuse(R.notOwner);
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (o.stage !== "select-trade") return refuse(R.wrongStage);
    if (!turnFor(a, o, "select-trade", "close-selection")) return refuse(R.notYourTurn);
    const row = D.TRADE.liveTradeRows(o).find((c) => c.id === tradeCardId);
    if (!row) return refuse(R.notFound);
    return done(withOpp(state, oppId, (x) => stamp({ ...x, trade: { ...x.trade,
      cards: x.trade.cards.map((c) => (c.id === tradeCardId
        ? { ...c, inclusion: "rejected", reviewedAt: at || null, deselectedAt: at || null } : c)) } }, at)), tradeCardId);
  },

  /* "HOLD ON, I'M ADDING MORE CARDS." The Collector may say it at any point in
     Select Trade and as many times as they need; nothing expires it. The
     partner waits until the Collector says they are ready. A hold also cancels
     an earlier "ready" and an empty close, because both were said about a
     supply the Collector is now changing. */
  holdTradeSelection(state, a, { oppId }, ctx) {
    const at = ctx.at;
    if (a.seat !== "collector") return refuse(R.notOwner);
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (o.stage !== "select-trade") return refuse(R.wrongStage);
    const sel = D.TRADE.selectionOf(o);
    if (sel.adding) return done(state, oppId);
    return done(withOpp(state, oppId, (x) => stamp({ ...x, trade: { ...(x.trade || {}),
      selection: { ...sel, adding: true, heldAt: at || null, readyAt: null, closedEmptyAt: null } } }, at)), oppId);
  },

  /* "I'M READY — CARRY ON." Ends a hold, or answers a selection the partner
     sent. The partner may then select more and close. */
  continueTradeSelection(state, a, { oppId }, ctx) {
    const at = ctx.at;
    if (a.seat !== "collector") return refuse(R.notOwner);
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (o.stage !== "select-trade") return refuse(R.wrongStage);
    if (!turnFor(a, o, "more-cards", "adding-cards")) return refuse(R.notYourTurn);
    const sel = D.TRADE.selectionOf(o);
    return done(withOpp(state, oppId, (x) => stamp({ ...x, trade: { ...(x.trade || {}),
      selection: { ...sel, adding: false, readyAt: at || true } } }, at)), oppId);
  },

  /* ENTERING VALUATION, ATOMICALLY. Every live row is re-checked against the
     world as it is NOW — the copy still the deal Collector's, still offered,
     not held exclusively by any other deal — and then either every row is
     reserved for this deal and the stage becomes Value Trade, or the command is
     refused and NOTHING changes: no partial reservation, no dropped card, no
     stage move. A conflict names this deal's own rows (`detail.tradeCardIds`)
     so the partner can deselect them or the Collector can withdraw them; it
     says nothing about the deal that holds them.

     `expect.tradeCardIds`, when sent, is the selection the partner is looking
     at. If a card was withdrawn since, the screen is stale and the answer is
     `terms-changed`, not a reservation of something other than what was shown.

     Closing with nothing live does not choose cash. It hands the Collector the
     decision: hold and add more, cash only, or end the deal. */
  closeTradeSelection(state, a, { oppId, expect }, ctx) {
    const at = ctx.at;
    if (a.seat !== "tp") return refuse(R.notOwner);
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (o.stage !== "select-trade") return refuse(R.wrongStage);
    const gone = copyBlockedFor(state, o, a);
    if (gone) return refuse(gone);
    if (!turnFor(a, o, "close-selection")) return refuse(R.notYourTurn);
    const live = D.TRADE.liveTradeRows(o);
    if (expect != null) {
      const ids = expect && Array.isArray(expect.tradeCardIds) ? expect.tradeCardIds : null;
      if (!ids || !sameIdSet(ids, live.map((c) => c.id))) return refuse(R.termsChanged);
    }
    if (live.length && !isRelated(state, a.partnerId, o.collectorId)) return refuse(R.noRelationship);
    const conflicts = live.filter((row) => {
      const b = list(state.collectorCopies).find((x) => x.id === row.binderId);
      return !b || b.collectorId !== o.collectorId || !D.copyOffered(b)
        || D.copyExclusive(row.binderId, state.opportunities, oppId);
    }).map((row) => row.id);
    if (conflicts.length) return { ok: false, refused: R.copyUnavailable, detail: { tradeCardIds: conflicts } };
    if (!live.length) {
      return done(withOpp(state, oppId, (x) => stamp({ ...x, trade: { ...(x.trade || {}),
        selection: { ...D.TRADE.selectionOf(x), closedEmptyAt: at || true } } }, at)), oppId);
    }
    const ids = new Set(live.map((c) => c.id));
    return done(withOpp(state, oppId, (x) => stamp({ ...x, stage: "value-trade",
      trade: { ...x.trade, mode: "trade",
        cards: x.trade.cards.map((c) => (ids.has(c.id) ? { ...c, reservedAt: at || null } : c)) } }, at)), oppId);
  },

  /* RETIRED (M3A A1): the Collector-proposes / partner-accepts selection. The
     partner selects now (`selectTradeCards`). Kept as names only, so a caller
     still wired to them is told why rather than told the command is unknown. */
  proposeTradeSelection() { return refuse(R.commandRetired); },
  reviewTradeCard() { return refuse(R.commandRetired); },

  /* WITHDRAWING ONE CARD FROM ONE DEAL (M3A A1). The Collector may take any
     selected card out of this deal until both parties have given final
     agreement — in Select Trade, or in Value Trade or Deal when the value on
     the table is not worth it to them. It is a retraction, so it does not wait
     for their turn.

     What it changes, by stage:
       select-trade   the row stops being live; nothing else depends on it
       value-trade    its reservation is released and its valuation stops
                      counting; every OTHER card's agreements stand, and if
                      what is left is all settled the deal moves on to Deal
       deal           as above, and the balance has changed, so `dealReset`
                      voids every standing figure and both confirmations

     If it was the last live card, the deal returns to Select Trade, where the
     partner may select again and the Collector may hold, choose cash only or
     end the deal. Cash is never chosen for them.

     It never touches the copy: Trade/Sell stays as the Collector said it, and
     the specification lock lifts only when no other deal still selects it. */
  withdrawTradeCard(state, a, { oppId, tradeCardId }, ctx) {
    const at = ctx.at;
    if (a.seat !== "collector") return refuse(R.notOwner);
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    const row = (o.trade && o.trade.cards || []).find((c) => c.id === tradeCardId);
    if (!row) return refuse(R.notFound);
    if (D.finalAgreementGiven(o)) return refuse(R.copyCommitted);
    if (!["select-trade", "value-trade", "deal"].includes(o.stage)) return refuse(R.wrongStage);
    if (!D.TRADE.liveRow(row)) return refuse(R.nothingToAccept);
    return done(withOpp(state, oppId, (x) => {
      let next = { ...x, trade: { ...x.trade,
        cards: x.trade.cards.map((c) => (c.id === tradeCardId ? D.TRADE.withdraw(c, at, x.stage) : c)) } };
      const remaining = D.TRADE.liveTradeRows(next).length;
      if (x.stage === "deal") next = { ...next, deal: D.TRADE.dealReset(next.deal, at, "card-withdrawn") };
      if (!remaining && x.stage !== "select-trade") next = D.TRADE.reopenSelection(next, at);
      else if (x.stage === "value-trade") next = D.TRADE.closeValuation(next);
      return stamp(next, at);
    }), tradeCardId);
  },

  /* THE PARTNER DECLINES ONE CARD DURING VALUE TRADE (M3B D2, D7, D8).

     Choosing a card to consider is not an obligation to take it. Having looked
     at its condition, its value or anything else, the partner may decline it —
     about the card, never about the Collector. The row is marked "rejected", as
     a deselect in Select Trade is ("they looked at this one and passed"), with
     WHEN and AT WHICH STAGE it was declined and an optional short note, so a
     decline reads apart from a deselect AND from a Collector's withdrawal (which
     sets `withdrawn`, not `inclusion`). Everything the row recorded — both
     negotiation threads, any agreed market value or percentage — stays on it as
     history.

     WHAT FOLLOWS IS DERIVED, NOT WRITTEN. A rejected row is not live, so it
     holds no reservation (`binderRowState`), owns no turn (`cardOwner`) and
     earns no credit (`totalTradeValue`): the cash difference is recalculated
     from the cards that remain, and nothing is written to the copy, its
     Trade/Sell disposition or the shop's inventory. If no card remains the deal
     returns to Select Trade, exactly as when the Collector withdraws the last
     card; otherwise Value Trade closes the moment every remaining card is
     settled, as it always has.

     At any turn — like a withdrawal, it is a retraction, not a move — and in
     Value Trade only. A repeat of a decline that landed answers as done and
     changes nothing, so a lost answer can be retried; a row that is already out
     of the deal some other way is refused. */
  declineTradeCard(state, a, { oppId, tradeCardId, note }, ctx) {
    const at = ctx.at;
    if (a.seat !== "tp") return refuse(R.notOwner);
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    const row = (o.trade && o.trade.cards || []).find((c) => c.id === tradeCardId);
    if (!row) return refuse(R.notFound);
    if (row.inclusion === "rejected" && row.declinedStage === "value-trade") return done(state, tradeCardId);
    if (o.stage !== "value-trade") return refuse(R.wrongStage);
    if (!D.TRADE.liveRow(row)) return refuse(R.nothingToAccept);
    /* The note is optional: absent or blank is no note. One that is not text
       says nothing; one over the limit is refused, never cut (as a deal
       message is, counted in characters a person sees). */
    if (note != null && typeof note !== "string") return refuse(R.messageEmpty);
    const said = typeof note === "string" ? note.replace(/\s+/g, " ").trim() : "";
    if ([...said].length > DECLINE_NOTE_MAX) return refuse(R.messageTooLong);
    return done(withOpp(state, oppId, (x) => {
      let next = { ...x, trade: { ...x.trade,
        cards: x.trade.cards.map((c) => (c.id === tradeCardId
          ? { ...c, inclusion: "rejected", declinedAt: at || null, declinedStage: x.stage, ...(said ? { declineNote: said } : {}) }
          : c)) } };
      next = D.TRADE.liveTradeRows(next).length ? D.TRADE.closeValuation(next) : D.TRADE.reopenSelection(next, at);
      return stamp(next, at);
    }), tradeCardId);
  },

  /* ------------------------------------------------------------ value trade */
  proposeMarketValue(state, a, p, ctx) { return valueStep(state, a, p, ctx, "market", "propose"); },
  acceptMarketValue(state, a, p, ctx) { return valueStep(state, a, p, ctx, "market", "accept"); },
  proposeTradePercent(state, a, p, ctx) { return valueStep(state, a, p, ctx, "percent", "propose"); },
  acceptTradePercent(state, a, p, ctx) { return valueStep(state, a, p, ctx, "percent", "accept"); },

  /* ------------------------------------------------------------ deal */
  /* A new final cash figure. It supersedes the current economic state and
     clears every final agreement already given; confirmation restarts with the
     partner. Only the seat whose turn it is may change the figure. */
  proposeFinalBalance(state, a, { oppId, amount, expect }, ctx) {
    const at = ctx.at;
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (!pairTrusted(state, o)) return refuse(R.noRelationship);
    if (o.stage !== "deal") return refuse(R.wrongStage);
    if (termsChanged(o, expect)) return refuse(R.termsChanged);
    /* The FINAL cash figure is the strongest statement either side makes about
       this copy, so it is the last place that should still be reachable once
       the copy is gone. proposePrice's reason applies with more force here: a
       price is a statement about a thing, and when the thing is promised away
       the statement is not merely unenforceable, it is untrue. */
    const gone = copyBlockedFor(state, o, a);
    if (gone) return refuse(gone);
    if (!turnFor(a, o, "final")) return refuse(R.notYourTurn);
    /* WHOLE DOLLARS (Batch 2.1). The final balance keeps its sign convention —
       positive the Collector pays, negative the partner pays, zero is even —
       and is now a whole number of dollars. Agreements already recorded keep
       whatever they recorded. */
    if (!Number.isSafeInteger(amount)) return refuse(R.invalidAmount);
    const deal = { ...D.emptyDeal(), ...(o.deal || {}), adjThread: (o.deal && o.deal.adjThread) || [] };
    if (deal.agreedAdj != null) return refuse(R.terminal);
    if (D.TRADE.dealAdjStanding(deal) === a.seat) return refuse(R.notYourTurn);
    const next = D.TRADE.applyDealAdjustment(deal, a.seat, "propose", amount, at);
    if (next === deal) return refuse(R.invalidAmount);
    return done(withOpp(state, oppId, (x) => stamp({ ...x,
      deal: { ...next, tpAgreed: false, collectorAgreed: false } }, at)), oppId);
  },

  /* Final agreement to the CURRENT economic state. The partner confirms first,
     the collector second; the collector's confirmation advances to Fulfillment
     and records the agreed final figure. */
  acceptDeal(state, a, { oppId, expect }, ctx) {
    const at = ctx.at;
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (!pairTrusted(state, o)) return refuse(R.noRelationship);
    if (o.stage !== "deal") return refuse(R.wrongStage);
    if (!turnFor(a, o, "final")) return refuse(R.notYourTurn);
    /* AGREEMENT IS TO WHAT THE CALLER SAW (M3A A1). A screen that sends
       `expect` is agreeing to that balance and those cards; if a card was
       withdrawn or a figure moved since, nothing is written. */
    if (termsChanged(o, expect)) return refuse(R.termsChanged);
    /* AND THE COLLECTOR'S CARDS ARE STILL THIS DEAL'S ALONE. Reservation made
       them exclusive on entering valuation and nothing since can have taken
       them; this is the assertion that it held. */
    if (D.TRADE.liveTradeRows(o).some((row) => D.copyExclusive(row.binderId, state.opportunities, o.id))) {
      return refuse(R.copyUnavailable);
    }
    /* THE ONE PLACE A PHYSICAL CARD CAN BE PROMISED TWICE (Option B, Item 2).

       This used to be safe by accident. Agreeing a market value committed the
       copy, so a second deal could never reach this stage, and nothing below
       this line re-checked the card — not fulfilment, not the handoff. A
       read-only pass proved it by seeding the state the old gate made
       unreachable: two agreed deals on one copy both ran to completion with
       every command allowed.

       Moving the boundary to final agreement makes that state reachable, so the
       guard has to move with it. This is now the commitment boundary in the
       literal sense: past it, one collector has been promised this exact card,
       and the promise is what the refusal protects. Pending for THIS deal is
       fine — that is the partner holding it for the person they are about to
       promise it to. */
    const blocked = copyBlockedFor(state, o, a);
    if (blocked) return refuse(blocked);
    const d = { ...D.emptyDeal(), ...(o.deal || {}), adjThread: (o.deal && o.deal.adjThread) || [] };
    if (a.seat === "tp") {
      return done(withOpp(state, oppId, (x) => stamp({ ...x, deal: { ...d, tpAgreed: true } }, at)), oppId);
    }
    if (!d.tpAgreed) return refuse(R.notYourTurn);
    const standing = D.TRADE.dealAdjStanding(d);
    const figure = standing ? D.currentCashFigure({ ...o, deal: d }) : d.agreedAdj;
    const agreed = { ...d, collectorAgreed: true,
      agreedAdj: standing ? figure : d.agreedAdj,
      adjThread: standing ? [...d.adjThread, { by: "collector", type: "accept", amount: figure, at }] : d.adjThread };
    /* FINAL AGREEMENT PROMISES THE SHOP'S CARD, SO EVERY RIVAL DEAL ON IT ENDS
       HERE, in the same write (M3A A1). Before A1 they were left active and
       silently excluded from the one-deal-per-Goal rule; now each is ended,
       explicitly, as `card-unavailable`. */
    const agreedState = withOpp(state, oppId, (x) => stamp({ ...x, deal: agreed, stage: "fulfillment",
      fulfillment: { ...D.emptyFulfillment(), ...(x.fulfillment || {}) }, at: at || x.at }, at));
    return done(endUnavailable(agreedState, o.invId, o.id, at), oppId);
  },

  /* ------------------------------------------------------------ fulfillment */
  proposeFulfillment(state, a, { oppId, plan }, ctx) {
    const at = ctx.at;
    if (a.seat !== "tp") return refuse(R.notOwner);
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (o.stage !== "fulfillment") return refuse(R.wrongStage);
    if (!turnFor(a, o, "plan")) return refuse(R.notYourTurn);
    if (!plan || !plan.method) return refuse(R.planIncomplete);
    /* The plan's meeting date and time are what the partner proposed; when it was
       proposed and confirmed are the commands' own timestamps. */
    const { proposedAt, confirmedAt, collectorConfirmedPlan, revisionRequested, tpHandoff, collectorReceipt, ...terms } = plan;
    return done(withOpp(state, oppId, (x) => stamp({ ...x, fulfillment: { ...D.emptyFulfillment(),
      ...(x.fulfillment || {}), ...terms, proposedAt: at || "proposed", revisionRequested: null,
      collectorConfirmedPlan: false } }, at)), oppId);
  },

  confirmFulfillmentPlan(state, a, { oppId }, ctx) {
    const at = ctx.at;
    if (a.seat !== "collector") return refuse(R.notOwner);
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (o.stage !== "fulfillment") return refuse(R.wrongStage);
    if (!turnFor(a, o, "confirm-plan")) return refuse(R.notYourTurn);
    return done(withOpp(state, oppId, (x) => stamp({ ...x, fulfillment: { ...x.fulfillment,
      collectorConfirmedPlan: true, confirmedAt: at } }, at)), oppId);
  },

  requestFulfillmentRevision(state, a, { oppId, note }, ctx) {
    const at = ctx.at;
    if (a.seat !== "collector") return refuse(R.notOwner);
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (o.stage !== "fulfillment") return refuse(R.wrongStage);
    if (!turnFor(a, o, "confirm-plan")) return refuse(R.notYourTurn);
    return done(withOpp(state, oppId, (x) => stamp({ ...x, fulfillment: { ...x.fulfillment,
      collectorConfirmedPlan: false, revisionRequested: { note: note || "", at } } }, at)), oppId);
  },

  /* The partner confirms the physical handoff first; the collector's receipt
     completes the Opportunity. */
  confirmHandoff(state, a, { oppId }, ctx) {
    const at = ctx.at;
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (o.stage !== "fulfillment") return refuse(R.wrongStage);
    if (!turnFor(a, o, a.seat === "tp" ? "handoff" : "receipt")) return refuse(R.notYourTurn);
    if (a.seat === "tp") {
      return done(withOpp(state, oppId, (x) => stamp({ ...x, fulfillment: { ...x.fulfillment, tpHandoff: true } }, at)), oppId);
    }
    return done(withOpp(state, oppId, (x) => stamp({ ...x, fulfillment: { ...x.fulfillment, collectorReceipt: true },
      stage: "completed", completedAt: at || x.completedAt || "completed" }, at)), oppId);
  },

  /* ------------------------------------------------------------ cancellation */
  /* ENDING A DEAL, BY WHO AND WHEN (Market Validation Batch 3B.1). Nothing is
     deleted and no term is rewritten; who ended it, when, at which stage and
     why are recorded beside it.
       While the price is unresolved — Agree on Price, nothing agreed — this is
         the COLLECTOR WITHDRAWING an offer, and needs no reason. The partner's
         "no" at that point is `declineOffer`, a distinct outcome, so a partner
         is refused here (`not-owner`, as `declineOffer` refuses a Collector).
       Once a price is agreed, either participant may end the deal, and must
         say why: a non-blank string reason, or `reason-required`.
       After both final agreements the same holds, and the outcome is
         "cancelled" rather than "ended", exactly as before.
     A deal from before Market Validation that never reached a price keeps its
     old rule: either participant, no reason. */
  cancelOpportunity(state, a, { oppId, reason }, ctx) {
    const at = ctx.at;
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (D.priceUnresolved(o) && a.seat === "tp") return refuse(R.notOwner);
    const why = typeof reason === "string" ? reason.trim() : "";
    const priceAgreed = typeof o.agreedPrice === "number";
    if (priceAgreed && !why) return refuse(R.reasonRequired);
    const agreed = D.finalAgreementGiven(o);
    if (agreed && !why) return refuse(R.reasonRequired);
    return done(withOpp(state, oppId, (x) => ({ ...x, declined: true, endedBy: a.seat,
      endedAt: at || null, endedStage: x.stage, endedReason: why || null,
      outcome: agreed ? "cancelled" : "ended", ...(at ? { updated: at } : {}) })), oppId);
  },

  /* THE PARTNER SAYS NO (Market Validation, Batch 2). While the market value is
     still unresolved — Agree on Price — the partner may decline the
     negotiation outright, whoever's turn it is. Distinct from ending: the
     outcome is "declined", recorded beside who and when, and the price thread
     is left exactly as it was, so the history of what was offered survives.
     A declined opportunity is ended, which frees the Collector's offer slot.
     Once a value is agreed this is no longer the door — `cancelOpportunity`
     and its rules are. */
  declineOffer(state, a, { oppId, reason }, ctx) {
    const at = ctx.at;
    if (a.seat !== "tp") return refuse(R.notOwner);
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (o.stage !== "agree-price" || o.agreedPrice != null) return refuse(R.wrongStage);
    const why = typeof reason === "string" ? reason.trim() : "";
    return done(withOpp(state, oppId, (x) => ({ ...x, declined: true, endedBy: a.seat,
      endedAt: at || null, endedStage: x.stage, endedReason: why || null,
      outcome: "declined", ...(at ? { updated: at } : {}) })), oppId);
  },
};

/* Value Trade: one card, one phase, one move. The actor must own the
   opportunity's turn AND the card's turn. */
function valueStep(state, a, { oppId, tradeCardId, amount, percent }, ctx, phase, action) {
  const at = ctx.at;
  const { o, refused } = oppGate(state, a, oppId);
  if (refused) return refuse(refused);
  if (!pairTrusted(state, o)) return refuse(R.noRelationship);
  if (o.stage !== "value-trade") return refuse(R.wrongStage);
  /* NO NEW ECONOMIC STATEMENTS ABOUT A CARD THAT IS GONE. The same argument
     `proposePrice` makes: valuing a trade card is valuing it AGAINST the
     partner's copy, and when that copy has been sold or promised to somebody
     else the number means nothing. */
  const gone = copyBlockedFor(state, o, a);
  if (gone) return refuse(gone);
  const row = (o.trade && o.trade.cards || []).find((c) => c.id === tradeCardId);
  if (!row || row.inclusion !== "accepted" || row.withdrawn) return refuse(R.notFound);
  if (!turnFor(a, o, "value") || D.cardOwner(row) !== a.seat) return refuse(R.notYourTurn);
  if (phase === "market" && row.agreedMarket != null) return refuse(R.wrongStage);
  if (phase === "percent" && (row.agreedMarket == null || row.agreedPercent != null)) return refuse(R.wrongStage);
  /* WHOLE DOLLARS AND WHOLE PERCENTAGES (M3B D1, founder-approved), as Agree on
     Price already is: MetYet does not negotiate in cents or in fractions of a
     percent. A trade percentage is still STORED as the fraction it always was
     (0.8 = 80%) — only what may be proposed is narrowed, to 1%–100% in whole
     steps. The check is on the fraction × 100 within a rounding tolerance, so
     a value such as 0.29 (28.999999999999996 × 100 in binary) is the whole 29%
     it means, and 0.295 is refused. Accepting proposes nothing new, so it is
     untouched: an agreed value is still only ever the other side's standing
     proposal. */
  let next;
  if (phase === "market") {
    if (action === "propose" && !wholeDollars(amount)) return refuse(R.invalidAmount);
    next = D.TRADE.applyMarket(row, a.seat, action, amount, at);
  } else {
    if (action === "propose" && !wholePercent(percent)) return refuse(R.invalidAmount);
    next = D.TRADE.applyPercent(row, a.seat, action, percent, at);
  }
  if (next === row) return refuse(action === "accept" ? R.nothingToAccept : R.notYourTurn);
  /* Order the move so the turn can follow the last mover (D.nextActor). */
  const key = phase === "market" ? "valueThread" : "percentThread";
  const seq = D.nextValueSeq(o);
  next = { ...next, [key]: next[key].map((e, i, arr) => (i === arr.length - 1 ? { ...e, seq } : e)) };
  return done(withOpp(state, oppId, (x) => stamp(D.TRADE.closeValuation({ ...x,
    trade: { ...x.trade, cards: x.trade.cards.map((c) => (c.id === tradeCardId ? next : c)) } }), at)), oppId);
}

/* Aliases kept so screens can say what they mean without a second path. */
/* CASH-ONLY MEANS NO CARDS ARE GOING IN. Refused while any card is still
   selected; deselected and withdrawn rows are already out. */
COMMANDS.chooseCashOnly = (state, a, { oppId }, ctx) => {
  const at = ctx.at;
  if (a.seat !== "collector") return refuse(R.notOwner);
  const { o, refused } = oppGate(state, a, oppId);
  if (refused) return refuse(refused);
  if (!pairTrusted(state, o)) return refuse(R.noRelationship);
  if (o.stage !== "select-trade") return refuse(R.wrongStage);
  const gone = copyBlockedFor(state, o, a);
  if (gone) return refuse(gone);
  if (D.TRADE.liveTradeRows(o).length > 0) return refuse(R.tradeCardsSelected);
  /* AN EXPLICIT DECISION, AVAILABLE WHENEVER NOTHING IS SELECTED (M3A A1). It
     no longer waits for a particular turn: the partner leads selection, and a
     Collector who has decided to pay cash should not have to wait for a review
     of cards they do not want to trade. It is never taken automatically —
     every path into it is this command. */
  return done(withOpp(state, oppId, (x) => stamp({ ...x, stage: "deal",
    trade: { ...(x.trade || {}), mode: "cash", cards: (x.trade && x.trade.cards) || [], cashOnlyAt: at },
    deal: { ...D.emptyDeal(), ...(x.deal || {}), adjThread: (x.deal && x.deal.adjThread) || [] } }, at)), oppId);
};
COMMANDS.reachOut = (state, a, p, ctx) => COMMANDS.sendMessage(state, a, { ...p, event: !p.text }, ctx);

/* ------------------------------------------------------------------ execute */
/* The runtime is required. A missing one is a wiring error, not a refusal: it
   throws before anything is read, so no command can run on an implicit clock.
   The caller's `at` is consumed here — by the prototype adapter's context, and
   by nobody under an authoritative runtime — and never reaches the command. */
function execute(state, actor, command, payload, runtime) {
  const ctx = RT.callContext(runtime, payload);
  const a = resolveActor(state, actor);
  if (!a) return refuse(R.unknownActor);
  const fn = Object.prototype.hasOwnProperty.call(COMMANDS, command) ? COMMANDS[command] : null;
  if (!fn) return refuse(R.unknownCommand);
  const { at, ...args } = payload || {};
  const result = fn(state, a, args, ctx);
  if (result && result.ok) return result;
  /* A refusal may carry `detail` — today only `closeTradeSelection`'s list of
     the caller's OWN conflicting rows. Nothing else a command returns survives. */
  const out = refuse((result && result.refused) || R.notFound);
  return result && result.detail ? { ...out, detail: result.detail } : out;
}

module.exports = { execute, resolveActor, isRelated, COMMANDS, COMMAND_NAMES: Object.keys(COMMANDS) };
