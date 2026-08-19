/* ============================================================================
   THE SHARED STORE

   One set of records, one set of actions. Both personas read and write HERE.
   There is no TP copy and no Collector copy of anything below, and no sync
   step: a mutation lands once and both projections re-derive from it.

   This is deliberately a plain object graph with explicit actions rather than
   a state-management framework. The point is to pin down the product contract,
   not to choose David's production architecture.
   ========================================================================== */

const D = require("./metyet-domain.js");
const E = require("./metyet-entities.js");

/* ------------------------------------------------------------ THE ACTIONS

   Every shared mutation has exactly one path. Persona permission is a wrapper
   around these, never a second implementation. */

function createStore(seed) {
  let s = {
    /* Spread first so a persona's canonical collections are never silently
       dropped by this whitelist; the named keys below document the core set. */
    ...seed,
    catalog: seed.catalog,                 // card identities
    collectors: seed.collectors,
    partners: seed.partners,
    goals: seed.goals,                     // {id, collectorId, cardId, tier, since, note}
    inventory: seed.inventory,             // {invId, partnerId, cardId, ask, cost, ...}
    binder: seed.binder,                   // {id, collectorId, cardId, market, photos, cert, addedAt}
    interests: seed.interests,             // {partnerId, binderId, at}
    conversations: seed.conversations,     // shared threads; see domain.appendThreadEntry
    /* Collector asks to see a specific physical copy. Not a deal. */
    photoRequests: seed.photoRequests || [],
    opportunities: seed.opportunities,
    preferences: seed.preferences,         // {collectorId, tags[]}
  };
  const subs = new Set();
  const get = () => s;
  const set = (next) => { s = next; subs.forEach((f) => f(s)); };
  const sub = (f) => { subs.add(f); return () => subs.delete(f); };
  const cardById = (id) => s.catalog.find((c) => c.id === id);

  const actions = {
    /* ---- goals: what a collector wants. Only the collector creates one. ---- */
    addGoal({ collectorId, cardId, tier, at }) {
      if (s.goals.some((g) => g.collectorId === collectorId && g.cardId === cardId)) return null;
      const id = "g" + Math.random().toString(36).slice(2, 9);
      set({ ...s, goals: [...s.goals, { id, collectorId, cardId,
        tier: tier === "primary" ? "primary" : "secondary", since: at, note: "" }] });
      return id;
    },
    updateGoalTier(goalId, tier) {
      set({ ...s, goals: s.goals.map((g) => (g.id === goalId
        ? { ...g, tier: tier === "primary" ? "primary" : "secondary" } : g)) });
    },
    removeGoal(goalId) {
      /* A goal under negotiation cannot vanish and orphan the deal. */
      if (D.activeOppForGoal(goalId, s.opportunities)) return false;
      set({ ...s, goals: s.goals.filter((g) => g.id !== goalId) });
      return true;
    },

    /* ---- inventory: what a partner holds ---- */
    addInventoryCopy(copy) { set({ ...s, inventory: [...s.inventory, copy] }); return copy.invId; },
    removeInventoryCopy(invId) {
      set({ ...s, inventory: s.inventory.map((i) =>
        (i.invId === invId ? { ...i, archived: true } : i)) });
    },

    /* ---- binder: what a collector will trade ---- */
    addBinderCopy(copy) {
      /* THE BINDER INVARIANT. Both faces or the copy does not exist. */
      if (!D.INVARIANTS.binderCopyPhotographed(copy.photos)) return null;
      set({ ...s, binder: [...s.binder, copy] });
      return copy.id;
    },
    removeBinderCopy(binderId) {
      set({ ...s, binder: s.binder.filter((b) => b.id !== binderId),
        interests: s.interests.filter((i) => i.binderId !== binderId) });
    },

    /* ---- interest: a partner would consider an exact copy ---- */
    setInterest(partnerId, binderId, on, at) {
      const has = E.hasInterest(s.interests, partnerId, binderId);
      if (on === has) return;
      set({ ...s, interests: on
        ? [...s.interests, { partnerId, binderId, at }]
        : s.interests.filter((i) => !(i.partnerId === partnerId && i.binderId === binderId)) });
    },

    /* ---- ACTUAL CARD PHOTOS ------------------------------------------------
       A request is a low-commitment signal about one physical copy: "I want to
       see this before I talk price." It is not a deal, so it creates no
       opportunity, touches no goal, and consumes no negotiation slot.

       It is its own small relationship rather than a conversation entry because
       conversations are keyed on CARD IDENTITY, and this is about one exact
       copy — a partner holding three of the same Charizard must be able to tell
       which one was asked about. */
    requestPhotos({ collectorId, partnerId, invId, at }) {
      const copy = (s.inventory || []).find((i) => i.invId === invId);
      if (!copy || copy.archived) return { refused: D.REFUSE.copyUnavailable };
      /* Nothing to ask for, and repeated clicks must not pile up. */
      if (D.INVARIANTS.copyPhotographed(copy.photos)) return null;
      const already = (s.photoRequests || []).some((r) => r.collectorId === collectorId
        && r.invId === invId && !r.fulfilledAt);
      if (already) return null;
      const id = "pr" + Math.random().toString(36).slice(2, 9);
      set({ ...s, photoRequests: [...(s.photoRequests || []),
        { id, collectorId, partnerId: partnerId || copy.partnerId, invId, at, fulfilledAt: null }] });
      return id;
    },
    /* The partner photographs the copy. This enriches the inventory record
       permanently — it is not tied to whoever asked, so every later collector
       benefits from the one piece of work. */
    addCopyPhotos({ invId, front, back, at }) {
      const copy = (s.inventory || []).find((i) => i.invId === invId);
      if (!copy) return { refused: D.REFUSE.copyUnavailable };
      const photos = { front: front !== undefined ? front : (copy.photos || {}).front,
        back: back !== undefined ? back : (copy.photos || {}).back };
      const complete = D.INVARIANTS.copyPhotographed(photos);
      set({ ...s,
        inventory: s.inventory.map((i) => (i.invId === invId ? { ...i, photos } : i)),
        /* One face does not resolve the ask; the request stays open until the
           collector can actually see the card. */
        photoRequests: (s.photoRequests || []).map((r) => (r.invId === invId && !r.fulfilledAt
          && complete ? { ...r, fulfilledAt: at || null } : r)) });
      return complete;
    },

    /* ---- conversation: ONE thread per collector + partner + card identity,
       shared with that Trusted Partner and no other. Reaching out creates NO
       opportunity, ever — conversation and negotiation are different acts. ---- */
    reachOut({ collectorId, partnerId, cardId, oppId, text, at, by = "collector" }) {
      const card = cardById(cardId);
      if (!card || !partnerId) return null;
      const entry = text
        ? { kind: "message", by, text }
        : { kind: "event", by: "system", text: "Reached out" };
      set({ ...s, conversations: D.appendThreadEntry(s.conversations, {
        collectorId, partnerId, card, cardId, oppId, entry, at }) });
      return D.threadKey(collectorId, partnerId, card);
    },
    sendMessage({ collectorId, partnerId, cardId, by, text, oppId, at }) {
      const card = cardById(cardId);
      if (!card || !partnerId || !text || !text.trim()) return null;
      set({ ...s, conversations: D.appendThreadEntry(s.conversations, {
        collectorId, partnerId, card, cardId, oppId,
        entry: { kind: "message", by, text: text.trim() }, at }) });
      return D.threadKey(collectorId, partnerId, card);
    },
    /* Lifecycle events land in the same thread, chronologically. A milestone
       belongs to the partner the deal is with, so it never leaks to another. */
    logMilestone({ collectorId, partnerId, cardId, text, oppId, at }) {
      const card = cardById(cardId);
      if (!card || !partnerId) return null;
      set({ ...s, conversations: D.appendThreadEntry(s.conversations, {
        collectorId, partnerId, card, cardId, oppId,
        entry: { kind: "event", by: "system", text }, at }) });
    },

    /* ---- opportunity: the one structured negotiation ---- */
    /* Returns the new opportunity id, or a refusal a caller can act on. Both
       invariants live HERE so no persona, route or direct caller can bypass
       them — the UI explains the refusal, it does not enforce it. */
    startOpportunity({ goalId, collectorId, partnerId, cardId, invId, listedPrice, amount, at }) {
      if (!s.goals.some((g) => g.id === goalId)) return { refused: D.REFUSE.noGoal };
      /* A deal is evidence of active pursuit, so the goal must be Primary. */
      if (!D.INVARIANTS.goalIsPursued(goalId, s.goals)) return { refused: D.REFUSE.notPrimary };
      if (!D.INVARIANTS.oneNegotiationPerGoal(goalId, s.opportunities))
        return { refused: D.REFUSE.alreadyNegotiating };
      /* A price is a judgement about a specific physical card, so the collector
         must have been able to see that card. Discovery runs on the stock
         image; negotiation does not. Enforced here rather than in the UI, so no
         surface can route around it. */
      if (invId != null) {
        const copy = (s.inventory || []).find((i) => i.invId === invId);
        if (!copy || copy.archived) return { refused: D.REFUSE.copyUnavailable };
        if (!D.INVARIANTS.copyPhotographed(copy.photos))
          return { refused: D.REFUSE.photosNeeded };
      }
      const id = "o" + Math.random().toString(36).slice(2, 9);
      const opp = {
        id, goalId, collectorId, partnerId, cardId, invId,
        stage: "agree-price", listedPrice, agreedPrice: null,
        priceThread: [{ by: "collector", type: "offer", amount, at }],
        trade: { submitted: false, cards: [] },
        deal: {}, fulfillment: {}, declined: false, completedAt: null, updated: at,
      };
      set({ ...s, opportunities: [...s.opportunities, opp] });
      return id;
    },
    patchOpportunity(oppId, fn) {
      set({ ...s, opportunities: s.opportunities.map((o) => (o.id === oppId ? fn(o) : o)) });
    },
    endOpportunity(oppId, by, at) {
      actions.patchOpportunity(oppId, (o) => (D.isActive(o)
        ? { ...o, declined: true, endedBy: by, endedAt: at, endedStage: o.stage } : o));
    },
  };

  /* Test/demo isolation only. Production would create a store per session
     rather than resetting a module-level one. */
  const reset = (nextSeed) => set({ ...(nextSeed || seed) });

  return { get, set, sub, actions, cardById, reset };
}

module.exports = { createStore };
