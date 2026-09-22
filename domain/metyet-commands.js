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
const validMoney = (n) => typeof n === "number" && isFinite(n);

/* A label a person typed, or nothing. Trimmed to one line and capped, because a
   hint is for recognising an invitation in a list — not a place to put a
   paragraph. Empty becomes null: a missing hint is missing, not "". */
const HINT_MAX = 120;
const hint = (value) => {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, HINT_MAX) : null;
};

/* Standard gate for a command on an existing opportunity: it must exist, the
   actor must be a participant, and it must still be active. */
function oppGate(state, a, oppId) {
  const o = oppById(state, oppId);
  if (!o) return { refused: R.notFound };
  if (!isParticipant(a, o)) return { refused: R.notParticipant };
  if (!D.isActive(o)) return { refused: R.terminal };
  return { o };
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
      tier: tier === "primary" ? "primary" : "secondary",
      createdAt: ctx.at, since: ctx.at, note: note || "",
      ...(stated && Object.keys(stated).length ? { desired: stated } : {}) };
    return done({ ...state, goals: [...list(state.goals), goal] }, id);
  },

  updateGoalTier(state, a, { goalId, tier }, ctx) {
    const at = ctx.at;
    const g = list(state.goals).find((x) => x.id === goalId);
    if (!g) return refuse(R.notFound);
    if (a.seat !== "collector" || g.collectorId !== a.collectorId) return refuse(R.notOwner);
    const next = tier === "primary" ? "primary" : "secondary";
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

     SO IT IS NOT BLOCKED BY AN ACTIVE OPPORTUNITY. Nothing derives from
     `desired`: Discovery reads none of it (asserted against the source since
     C3.2), no status depends on it, and no deal references it. It is context a
     person is allowed to correct, not deal identity.

     IT CHANGES ONE FIELD. Not the tier, not the card, not a timestamp — those
     each have their own command, or belong to nobody. */
  updateGoalCriteria(state, a, { goalId, desired }, ctx) {
    const g = list(state.goals).find((x) => x.id === goalId);
    if (!g) return refuse(R.notFound);
    if (a.seat !== "collector" || g.collectorId !== a.collectorId) return refuse(R.notOwner);
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
    if (D.goalLocked(goalId, state.opportunities)) return refuse(R.goalLocked);
    return done({ ...state, goals: list(state.goals).filter((x) => x.id !== goalId) }, true);
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
    const { invId: askedId, addedAt: askedAt, updatedAt, ...facts } = copy;
    const invId = ctx.id("inv" + (canonical || copy.cardId) + "-", askedId);
    if (list(state.inventory).some((i) => i.invId === invId)) return refuse(R.copyInUse);
    const row = { photos: { front: null, back: null }, archived: false, ...facts, invId,
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
    const p = patch || {};
    /* WHICH CARD THIS IS, AND WHOSE IT IS, ARE NOT EDITS. `canonicalCardId`
       joined the list in Batch 6 for the same reason `cardId` was always on it:
       a copy that could be re-pointed at another card is a way to make a
       Collector's match mean something it did not mean when it was made. */
    if ("cardId" in p || "canonicalCardId" in p || "invId" in p || "partnerId" in p) {
      return refuse(R.identityImmutable);
    }
    const status = D.inventoryCopyStatus(invId, state.opportunities);
    if ("cert" in p && p.cert !== copy.cert && status !== "available") return refuse(R.copyCommitted);
    /* Grade and condition are here because a raw copy that comes back from a
       grader is the same physical card with a new fact about it — not a new
       copy, and certainly not a new CARD (Phase 5 Batch 6). */
    const allowed = ["ask", "cost", "acquired", "cert", "note", "photos", "grade", "condition"];
    const clean = {};
    for (const k of allowed) if (k in p) clean[k] = p[k];
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
    if (D.inventoryCopyStatus(invId, state.opportunities) === "committed") return refuse(R.copyCommitted);
    return done({ ...state, inventory: list(state.inventory).map((i) => (i.invId === invId
      ? { ...i, archived: true } : i)) }, invId);
  },

  addCopyPhotos(state, a, { invId, front, back }, ctx) {
    const at = ctx.at;
    const copy = list(state.inventory).find((i) => i.invId === invId);
    if (!copy) return refuse(R.notFound);
    if (a.seat !== "tp" || copy.partnerId !== a.partnerId) return refuse(R.notOwner);
    const photos = { front: front !== undefined ? front : (copy.photos || {}).front,
      back: back !== undefined ? back : (copy.photos || {}).back };
    const complete = D.INVARIANTS.copyPhotographed(photos);
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
    const { id: askedId, addedAt: askedAt, updatedAt, offered, ...facts } = copy;
    const id = ctx.id("b", askedId);
    if (list(state.collectorCopies).some((b) => b.id === id)) return refuse(R.copyInUse);
    const addedAt = ctx.time(askedAt);
    /* A NEW COPY IS NOT OFFERED UNLESS ITS OWNER SAYS SO. Recording that you
       own a card is the base fact; parting with it is a decision, and a
       decision nobody made is not one to assume. */
    const row = { ...facts, id, collectorId: a.collectorId, offered: offered === true,
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
    if ("offered" in p) return refuse(R.identityImmutable);
    const status = D.collectorCopyStatus(copyId, state.opportunities);
    if ("cert" in p && p.cert !== copy.cert && (status === "committed" || status === "traded")) {
      return refuse(R.copyCommitted);
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

  /* WILLINGNESS, AND NOTHING ELSE (C2). Turning this off leaves the copy, its
     card, its grade, its certificate and its photographs exactly where they
     were — the Collector still owns it, and says so. Turning it back on is the
     same record becoming supply again, not a new one.

     A deal that has already taken the copy is untouched: a committed or traded
     copy keeps its history whatever its owner now says about offering it, and
     the derived status is what the trade model reads. */
  setCollectorCopyOffered(state, a, { copyId, offered }, ctx) {
    const at = ctx.at;
    const copy = list(state.collectorCopies).find((b) => b.id === copyId);
    if (!copy) return refuse(R.notFound);
    if (a.seat !== "collector" || copy.collectorId !== a.collectorId) return refuse(R.notOwner);
    if (typeof offered !== "boolean") return refuse(R.notFound);
    if (copy.offered === offered) return done(state, copyId);
    return done({ ...state, collectorCopies: list(state.collectorCopies).map((b) => (b.id === copyId
      ? { ...b, offered, ...(at ? { updatedAt: at } : {}) } : b)) }, copyId);
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
    return done({ ...state, collectorCopies: list(state.collectorCopies).filter((b) => b.id !== copyId),
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

     THEY ARE INDEPENDENT, AND KEEPING THEM SO IS THE POINT. Nothing below
     creates a Goal, creates a copy, reads one, or changes one. Filing a card
     says nothing about wanting it; a Binder holding a card the Collector
     neither wants nor owns is valid curation, and is the state most binders
     start in. A Binder that implied demand would be a second, silent way of
     saying "I'm looking for this" — which nobody said.

     MEMBERSHIP NAMES THE CANONICAL CARD. Not a Goal, not a copy. Selling a card
     must not un-file it, satisfying a goal must not un-file it, and owning
     three physical copies of one card must not mean three places it belongs.
     The canonical card is the only reference that survives all of those.

     AND NOBODY ELSE EVER SEES IT. Binders are projected to the owning Collector
     and to no one else — see metyet-projection.js. A Trusted Partner receives
     no name, no id, no membership and no count, because how somebody organises
     their collection is not a fact about a trade. */
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
    if (typeof canonicalCardId !== "string" || !canonicalCardId) return refuse(R.notFound);
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
    if (on && D.collectorCopyStatus(binderId, list(state.opportunities)) !== "available") {
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
    if (!copy || copy.archived || D.soldInventoryIds(state.opportunities).has(invId)) return refuse(R.copyUnavailable);
    if (!isRelated(state, copy.partnerId, a.collectorId)) return refuse(R.noRelationship);
    const open = list(state.copyReviews).find((r) => r.collectorId === a.collectorId && r.invId === invId && !r.endedAt);
    if (open) return done(state, open.id);
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
    if (!copy || copy.archived) return refuse(R.copyUnavailable);
    if (!isRelated(state, copy.partnerId, a.collectorId)) return refuse(R.noRelationship);
    if (D.INVARIANTS.copyPhotographed(copy.photos)) return done(state, null);
    if (list(state.photoRequests).some((r) => r.collectorId === a.collectorId && r.invId === invId && !r.fulfilledAt)) {
      return done(state, null);
    }
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
  startOpportunity(state, a, { goalId, invId, amount }, ctx) {
    const at = ctx.at;
    if (a.seat !== "collector") return refuse(R.notOwner);
    const g = list(state.goals).find((x) => x.id === goalId);
    if (!g) return refuse(R.noGoal);
    if (g.collectorId !== a.collectorId) return refuse(R.notOwner);
    if (!D.INVARIANTS.goalIsPursued(goalId, state.goals)) return refuse(R.notPrimary);
    if (!D.INVARIANTS.oneNegotiationPerGoal(goalId, state.opportunities)) return refuse(R.alreadyNegotiating);
    const copy = list(state.inventory).find((i) => i.invId === invId);
    if (!copy || copy.archived) return refuse(R.copyUnavailable);
    const status = D.inventoryCopyStatus(invId, state.opportunities);
    if (status === "sold") return refuse(R.copyUnavailable);
    if (status === "committed") return refuse(R.copyCommitted);
    const wanted = typeof g.canonicalCardId === "string" && g.canonicalCardId;
    const held = typeof copy.canonicalCardId === "string" && copy.canonicalCardId;
    if (wanted || held) {
      if (!(wanted && held && wanted === held)) return refuse(R.identityMismatch);
    } else if (!D.sameIdentity(cardById(state, copy.cardId), cardById(state, g.cardId))) {
      return refuse(R.identityMismatch);
    }
    if (!isRelated(state, copy.partnerId, a.collectorId)) return refuse(R.noRelationship);
    if (!(validMoney(amount) && amount > 0)) return refuse(R.invalidAmount);
    const partner = list(state.partners).find((p) => p.id === copy.partnerId) || {};
    const id = ctx.id("o");
    const opp = { id, goalId, collectorId: a.collectorId, partnerId: copy.partnerId,
      ...(wanted ? { canonicalCardId: wanted } : { cardId: g.cardId }),
      invId, stage: "agree-price", listedPrice: copy.ask,
      agreedPrice: null, priceThread: [{ by: "collector", type: "offer", amount, at }],
      trade: { submitted: false, cards: [] },
      tradeRate: partner.tradeRate != null ? partner.tradeRate : null,
      deal: D.emptyDeal(), fulfillment: D.emptyFulfillment(),
      declined: false, completedAt: null, updated: at };
    return done({ ...state, opportunities: [...list(state.opportunities), opp] }, id);
  },

  /* A counter. The actor must own the turn, which also means nobody can
     counter their own standing figure. */
  proposePrice(state, a, { oppId, amount }, ctx) {
    const at = ctx.at;
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (o.stage !== "agree-price") return refuse(R.wrongStage);
    if (!turnFor(a, o, "price", "offer")) return refuse(R.notYourTurn);
    if (!(validMoney(amount) && amount > 0)) return refuse(R.invalidAmount);
    const type = (o.priceThread || []).length ? "counter" : "offer";
    return done(withOpp(state, oppId, (x) => stamp({ ...x,
      priceThread: [...(x.priceThread || []), { by: a.seat, type, amount, at }] }, at)), oppId);
  },

  /* Accepting the OTHER side's standing figure — never your own. Settling the
     price commits the exact InventoryCopy, so a copy already committed to
     another live deal cannot be settled again. */
  acceptPrice(state, a, { oppId }, ctx) {
    const at = ctx.at;
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (o.stage !== "agree-price") return refuse(R.wrongStage);
    const last = D.lastEntry(o.priceThread);
    if (!last || last.by === a.seat) return refuse(R.notYourTurn);
    if (!turnFor(a, o, "price")) return refuse(R.notYourTurn);
    if (o.invId != null) {
      const copy = list(state.inventory).find((i) => i.invId === o.invId);
      if (!copy || copy.archived) return refuse(R.copyUnavailable);
      if (D.INVARIANTS.copyCommittedTo(o.invId, state.opportunities, o.id)) return refuse(R.copyCommitted);
      if (D.soldInventoryIds(state.opportunities).has(o.invId)) return refuse(R.copyUnavailable);
    }
    return done(withOpp(state, oppId, (x) => stamp({ ...x, agreedPrice: last.amount, stage: "select-trade",
      /* No trade-or-cash intent is recorded by agreeing a price; the
         collector's package (or cash-only choice) records it. */
      trade: x.trade || { submitted: false, cards: [] },
      priceThread: [...(x.priceThread || []), { by: a.seat, type: "accept", amount: last.amount, at }] }, at)), oppId);
  },

  /* ------------------------------------------------------------ select trade */
  /* Submitting the package. Draft selection lived in the collector's own UI
     until now and reserved nothing; submission reserves each exact copy. An
     empty package is the cash-only choice.

     THIS IS WHERE THE PHOTOGRAPH REQUIREMENT LIVES NOW (Phase 5 C2).

     It used to live at the door: `addBinderCopy` refused a copy without both
     faces, so a Collector could not record owning a card they had not yet
     photographed. That put an evaluation rule in front of an ownership fact,
     and it cost the product the thing the rule was for — a Collector with a
     shoebox and no lightbox could record nothing, so there was nothing to
     photograph later and no prompt to do it.

     Evaluation actually happens HERE: this is the first moment a specific
     physical copy is handed to somebody else to put a value on. `binderIds` is
     legacy naming (see setInterest); these are collector copy ids. A copy
     entering a submitted package without both faces would ask a partner to
     price a card they cannot see, which is exactly what `copyPhotographed`
     exists to prevent — and it is the same standard `startOpportunity` already
     applies to the partner's own copy on the other side of the deal.

     The requirement did not weaken; it moved to where it bites. Owning is now
     free, offering is free, and the photographs are required at the point where
     their absence would actually harm somebody. */
  proposeTradeSelection(state, a, { oppId, binderIds }, ctx) {
    const at = ctx.at;
    if (a.seat !== "collector") return refuse(R.notOwner);
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (o.stage !== "select-trade") return refuse(R.wrongStage);
    if (o.trade && o.trade.submitted) return refuse(R.alreadySubmitted);
    if (!turnFor(a, o, "choose-trade")) return refuse(R.notYourTurn);
    const ids = list(binderIds);
    if (new Set(ids).size !== ids.length) return refuse(R.copyInUse);
    const rows = [];
    for (const bid of ids) {
      const b = list(state.collectorCopies).find((x) => x.id === bid);
      if (!b) return refuse(R.notFound);
      if (b.collectorId !== a.collectorId) return refuse(R.notOwner);
      if (!D.INVARIANTS.copyPhotographed(b.photos)) return refuse(R.photosRequired);
      const status = D.collectorCopyStatus(bid, state.opportunities, oppId);
      if (status === "reserved") return refuse(R.copyReserved);
      if (status === "committed") return refuse(R.copyCommitted);
      if (status === "traded") return refuse(R.copyUnavailable);
      /* The row names the card the COPY names, whichever way the copy names it
         (C2). A Collector's copy recorded in production has a canonical card
         and no legacy one; the demo's copies have the reverse. */
      rows.push({ ...D.emptyTradeCard(b.cardId, b.photos, b.cert, bid, b.canonicalCardId),
        id: ctx.id("tc" + (b.canonicalCardId || b.cardId) + "-") });
    }
    if (!rows.length) {
      return done(withOpp(state, oppId, (x) => stamp({ ...x, stage: "deal",
        trade: { ...(x.trade || {}), mode: "cash", submitted: true, cards: [], cashOnlyAt: at },
        deal: { ...D.emptyDeal(), ...(x.deal || {}), adjThread: (x.deal && x.deal.adjThread) || [] } }, at)), oppId);
    }
    return done(withOpp(state, oppId, (x) => stamp({ ...x,
      trade: { ...(x.trade || {}), mode: "trade", submitted: true, cards: rows } }, at)), oppId);
  },

  /* The partner's inclusion decision. Omitting tradeCardId decides every
     still-undecided row. Acceptance commits the exact copy. */
  reviewTradeCard(state, a, { oppId, tradeCardId, decision }, ctx) {
    const at = ctx.at;
    if (a.seat !== "tp") return refuse(R.notOwner);
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (o.stage !== "select-trade") return refuse(R.wrongStage);
    if (!turnFor(a, o, "review-trade")) return refuse(R.notYourTurn);
    const verdict = decision === "accepted" || decision === "accept" ? "accepted"
      : decision === "rejected" || decision === "reject" ? "rejected" : null;
    if (!verdict) return refuse(R.notFound);
    const rows = D.TRADE.liveTradeRows(o).filter((c) => c.inclusion === "proposed");
    const target = tradeCardId ? rows.filter((c) => c.id === tradeCardId) : rows;
    if (!target.length) return refuse(R.nothingToAccept);
    const ids = new Set(target.map((c) => c.id));
    return done(withOpp(state, oppId, (x) => stamp(D.TRADE.closeSelection({ ...x,
      trade: { ...x.trade, cards: x.trade.cards.map((c) => (ids.has(c.id) ? D.TRADE.decide(c, verdict, at) : c)) } }), at)), oppId);
  },

  /* Withdrawal is valid only for a RESERVED copy — submitted, not yet accepted.
     It is a retraction, so it does not wait for the collector's turn. A
     committed copy cannot be withdrawn unilaterally. */
  withdrawTradeCard(state, a, { oppId, tradeCardId }, ctx) {
    const at = ctx.at;
    if (a.seat !== "collector") return refuse(R.notOwner);
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    const row = (o.trade && o.trade.cards || []).find((c) => c.id === tradeCardId);
    if (!row) return refuse(R.notFound);
    if (row.inclusion === "accepted" && !row.withdrawn) return refuse(R.copyCommitted);
    if (o.stage !== "select-trade" || !(o.trade && o.trade.submitted)) return refuse(R.wrongStage);
    if (row.inclusion !== "proposed" || row.withdrawn) return refuse(R.nothingToAccept);
    return done(withOpp(state, oppId, (x) => stamp(D.TRADE.closeSelection({ ...x,
      trade: { ...x.trade, cards: x.trade.cards.map((c) => (c.id === tradeCardId ? D.TRADE.withdraw(c, at) : c)) } }), at)), oppId);
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
  proposeFinalBalance(state, a, { oppId, amount }, ctx) {
    const at = ctx.at;
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (o.stage !== "deal") return refuse(R.wrongStage);
    if (!turnFor(a, o, "final")) return refuse(R.notYourTurn);
    if (!validMoney(amount)) return refuse(R.invalidAmount);
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
  acceptDeal(state, a, { oppId }, ctx) {
    const at = ctx.at;
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    if (o.stage !== "deal") return refuse(R.wrongStage);
    if (!turnFor(a, o, "final")) return refuse(R.notYourTurn);
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
    return done(withOpp(state, oppId, (x) => stamp({ ...x, deal: agreed, stage: "fulfillment",
      fulfillment: { ...D.emptyFulfillment(), ...(x.fulfillment || {}) }, at: at || x.at }, at)), oppId);
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
  /* Either participant, before Completed. After both final agreements a reason
     is required. Nothing is deleted and no term is rewritten. */
  cancelOpportunity(state, a, { oppId, reason }, ctx) {
    const at = ctx.at;
    const { o, refused } = oppGate(state, a, oppId);
    if (refused) return refuse(refused);
    const why = typeof reason === "string" ? reason.trim() : "";
    const agreed = D.finalAgreementGiven(o);
    if (agreed && !why) return refuse(R.reasonRequired);
    return done(withOpp(state, oppId, (x) => ({ ...x, declined: true, endedBy: a.seat,
      endedAt: at || null, endedStage: x.stage, endedReason: why || null,
      outcome: agreed ? "cancelled" : "ended", ...(at ? { updated: at } : {}) })), oppId);
  },
};

/* Value Trade: one card, one phase, one move. The actor must own the
   opportunity's turn AND the card's turn. */
function valueStep(state, a, { oppId, tradeCardId, amount, percent }, ctx, phase, action) {
  const at = ctx.at;
  const { o, refused } = oppGate(state, a, oppId);
  if (refused) return refuse(refused);
  if (o.stage !== "value-trade") return refuse(R.wrongStage);
  const row = (o.trade && o.trade.cards || []).find((c) => c.id === tradeCardId);
  if (!row || row.inclusion !== "accepted" || row.withdrawn) return refuse(R.notFound);
  if (!turnFor(a, o, "value") || D.cardOwner(row) !== a.seat) return refuse(R.notYourTurn);
  if (phase === "market" && row.agreedMarket != null) return refuse(R.wrongStage);
  if (phase === "percent" && (row.agreedMarket == null || row.agreedPercent != null)) return refuse(R.wrongStage);
  let next;
  if (phase === "market") {
    if (action === "propose" && !(validMoney(amount) && amount > 0)) return refuse(R.invalidAmount);
    next = D.TRADE.applyMarket(row, a.seat, action, amount, at);
  } else {
    if (action === "propose" && !(validMoney(percent) && percent > 0 && percent <= 1)) return refuse(R.invalidAmount);
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
/* CASH-ONLY MEANS NO CARDS ARE GOING IN. Refused while any card is still in the
   package (proposed/reserved or accepted/committed); rejected and withdrawn rows
   are already out. */
COMMANDS.chooseCashOnly = (state, a, { oppId }, ctx) => {
  const at = ctx.at;
  if (a.seat !== "collector") return refuse(R.notOwner);
  const { o, refused } = oppGate(state, a, oppId);
  if (refused) return refuse(refused);
  if (o.stage !== "select-trade") return refuse(R.wrongStage);
  if (D.TRADE.liveTradeRows(o).length > 0) return refuse(R.tradeCardsSelected);
  if (!turnFor(a, o, "choose-trade", "trade-reviewed")) return refuse(R.notYourTurn);
  return done(withOpp(state, oppId, (x) => stamp({ ...x, stage: "deal",
    trade: { ...(x.trade || {}), mode: "cash", submitted: true, cards: (x.trade && x.trade.cards) || [], cashOnlyAt: at },
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
  return result && result.ok ? result : refuse((result && result.refused) || R.notFound);
}

module.exports = { execute, resolveActor, isRelated, COMMANDS, COMMAND_NAMES: Object.keys(COMMANDS) };
