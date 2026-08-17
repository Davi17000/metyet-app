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

    /* ---- conversation: ONE thread per collector + card identity, shared with
       the Trusted Partner. Reaching out creates NO opportunity, ever. ---- */
    reachOut({ collectorId, cardId, oppId, text, at, by = "collector" }) {
      const card = cardById(cardId);
      if (!card) return null;
      const entry = text
        ? { kind: "message", by, text }
        : { kind: "event", by: "system", text: "Reached out" };
      set({ ...s, conversations: D.appendThreadEntry(s.conversations, {
        collectorId, card, cardId, oppId, entry, at }) });
      return D.threadKey(collectorId, card);
    },
    sendMessage({ collectorId, cardId, by, text, oppId, at }) {
      const card = cardById(cardId);
      if (!card || !text || !text.trim()) return null;
      set({ ...s, conversations: D.appendThreadEntry(s.conversations, {
        collectorId, card, cardId, oppId, entry: { kind: "message", by, text: text.trim() }, at }) });
      return D.threadKey(collectorId, card);
    },
    /* Lifecycle events land in the same thread, chronologically. */
    logMilestone({ collectorId, cardId, text, oppId, at }) {
      const card = cardById(cardId);
      if (!card) return null;
      set({ ...s, conversations: D.appendThreadEntry(s.conversations, {
        collectorId, card, cardId, oppId, entry: { kind: "event", by: "system", text }, at }) });
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
