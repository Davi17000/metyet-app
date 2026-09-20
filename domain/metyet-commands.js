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
     for anybody else. Not a grade or a condition: those describe a physical
     copy, and demand is for a printing. */
  addGoal(state, a, { cardId, canonicalCardId, tier, note }, ctx) {
    if (a.seat !== "collector") return refuse(R.notOwner);
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
    const goal = { id, collectorId: a.collectorId,
      ...(canonical ? { canonicalCardId: canonical } : { cardId }),
      tier: tier === "primary" ? "primary" : "secondary", since: ctx.at, note: note || "" };
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
    if (copy.grade && !D.GRADED_VALUES.includes(copy.grade)) return refuse(R.notFound);
    if (copy.condition && !D.CONDITION_VALUES.includes(copy.condition)) return refuse(R.notFound);
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
    if (clean.grade && !D.GRADED_VALUES.includes(clean.grade)) return refuse(R.notFound);
    if (clean.condition && !D.CONDITION_VALUES.includes(clean.condition)) return refuse(R.notFound);
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

  /* ------------------------------------------------------------ binder */
  addBinderCopy(state, a, { copy }, ctx) {
    if (a.seat !== "collector") return refuse(R.notOwner);
    if (!copy || !cardById(state, copy.cardId)) return refuse(R.notFound);
    if (!D.INVARIANTS.binderCopyPhotographed(copy.photos)) return refuse(R.photosRequired);
    if (copy.market != null && !(Number(copy.market) >= 0)) return refuse(R.invalidAmount);
    const { id: askedId, addedAt: askedAt, updatedAt, ...facts } = copy;
    const id = ctx.id("b", askedId);
    if (list(state.binder).some((b) => b.id === id)) return refuse(R.copyInUse);
    const addedAt = ctx.time(askedAt);
    const row = { ...facts, id, collectorId: a.collectorId, ...(addedAt ? { addedAt } : {}) };
    return done({ ...state, binder: [...list(state.binder), row] }, id);
  },

  updateBinderCopy(state, a, { binderId, patch }, ctx) {
    const at = ctx.at;
    const copy = list(state.binder).find((b) => b.id === binderId);
    if (!copy) return refuse(R.copyUnavailable);
    if (a.seat !== "collector" || copy.collectorId !== a.collectorId) return refuse(R.notOwner);
    /* addedAt and updatedAt are the command's, never the patch's. */
    const { addedAt, updatedAt, ...p } = patch || {};
    if ("cardId" in p || "id" in p || "collectorId" in p) return refuse(R.identityImmutable);
    const status = D.binderCopyStatus(binderId, state.opportunities);
    if ("cert" in p && p.cert !== copy.cert && (status === "committed" || status === "traded")) {
      return refuse(R.copyCommitted);
    }
    const next = { ...copy, ...p, id: copy.id, cardId: copy.cardId, collectorId: copy.collectorId };
    if (!D.INVARIANTS.binderCopyPhotographed(next.photos)) return refuse(R.photosRequired);
    if (next.market != null && !(Number(next.market) >= 0)) return refuse(R.invalidAmount);
    return done({ ...state, binder: list(state.binder).map((b) => (b.id === binderId
      ? { ...next, updatedAt: at || b.updatedAt } : b)) }, binderId);
  },

  /* A copy any deal references is part of that deal's record: while reserved
     or committed it holds the deal together, and afterwards it is history.
     Only a copy no opportunity has ever held can be removed. */
  removeBinderCopy(state, a, { binderId }, ctx) {
    const copy = list(state.binder).find((b) => b.id === binderId);
    if (!copy) return refuse(R.notFound);
    if (a.seat !== "collector" || copy.collectorId !== a.collectorId) return refuse(R.notOwner);
    const status = D.binderCopyStatus(binderId, state.opportunities);
    if (status === "committed" || status === "traded") return refuse(R.copyCommitted);
    if (status === "reserved") return refuse(R.copyReserved);
    if (list(state.opportunities).some((o) => (o.trade && o.trade.cards || [])
      .some((c) => c.binderId === binderId))) return refuse(R.copyInUse);
    return done({ ...state, binder: list(state.binder).filter((b) => b.id !== binderId),
      interests: list(state.interests).filter((i) => i.binderId !== binderId) }, true);
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

  /* TPInterest references an exact BinderCopy in the partner's network. */
  setInterest(state, a, { binderId, on }, ctx) {
    const at = ctx.at;
    if (a.seat !== "tp") return refuse(R.notOwner);
    const copy = list(state.binder).find((b) => b.id === binderId);
    if (!copy) return refuse(R.notFound);
    if (!isRelated(state, a.partnerId, copy.collectorId)) return refuse(R.noRelationship);
    const has = list(state.interests).some((i) => i.partnerId === a.partnerId && i.binderId === binderId);
    if (!!on === has) return done(state, has);
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
     empty package is the cash-only choice. */
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
      const b = list(state.binder).find((x) => x.id === bid);
      if (!b) return refuse(R.notFound);
      if (b.collectorId !== a.collectorId) return refuse(R.notOwner);
      const status = D.binderCopyStatus(bid, state.opportunities, oppId);
      if (status === "reserved") return refuse(R.copyReserved);
      if (status === "committed") return refuse(R.copyCommitted);
      if (status === "traded") return refuse(R.copyUnavailable);
      rows.push({ ...D.emptyTradeCard(b.cardId, b.photos, b.cert, bid), id: ctx.id("tc" + b.cardId + "-") });
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
