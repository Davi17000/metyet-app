/* ============================================================================
   THE SHARED STORE

   One set of records. Both personas read HERE, and every product mutation goes
   through ONE boundary:

     store.execute(actor, command, payload)  ->  { ok, value } | { ok:false, refused }

   The command layer (metyet-commands.js) derives the seat from the actor,
   validates participant, ownership, Relationship, stage, terminal state, turn,
   Goal locks and physical-copy rules, and either applies one complete state
   change or refuses without changing anything.

   PRODUCT SURFACE:  get · sub · execute · actorFor · cardById
   TEST / FIXTURE SURFACE (never used by product code; a guard test enforces
   it):  fixture.set · fixture.reset · fixture.patchOpportunity, and the legacy
   `actions` facade below. The facade exists so the established test suites can
   keep describing moves in their original vocabulary; every facade call still
   runs through the same command layer and the same guards.
   ========================================================================== */

const D = require("./metyet-domain.js");
const C = require("./metyet-commands.js");

function createStore(seed) {
  let s = {
    ...seed,
    catalog: seed.catalog,
    collectors: seed.collectors,
    partners: seed.partners,
    goals: seed.goals,
    inventory: seed.inventory,
    binder: seed.binder,
    interests: seed.interests,
    conversations: seed.conversations,
    photoRequests: seed.photoRequests || [],
    copyReviews: seed.copyReviews || [],
    opportunities: seed.opportunities,
    preferences: seed.preferences,
    /* The Relationship is the network boundary (contract §2). */
    relationships: seed.relationships || [],
    invitations: seed.invitations || [],
  };
  const subs = new Set();
  const get = () => s;
  const set = (next) => { s = next; subs.forEach((f) => f(s)); };
  const sub = (f) => { subs.add(f); return () => subs.delete(f); };
  const cardById = (id) => s.catalog.find((c) => c.id === id);

  /* ------------------------------------------------ THE AUTHORITATIVE BOUNDARY */
  const execute = (actor, command, payload) => {
    const r = C.execute(s, actor, command, payload);
    if (!r.ok) return { ok: false, refused: r.refused };
    if (r.state !== s) set(r.state);
    return { ok: true, value: r.value };
  };
  /* An actor handle for a seat. Product shells mint these from identity; the
     command layer re-derives the seat on every call regardless. */
  const actorFor = (identity) => {
    const a = C.resolveActor(s, identity);
    return a ? (a.seat === "tp" ? { partnerId: a.partnerId } : { collectorId: a.collectorId }) : null;
  };

  /* ------------------------------------------------ TEST / FIXTURE ONLY */
  const patchOpportunity = (oppId, fn) => {
    set({ ...s, opportunities: s.opportunities.map((o) => (o.id === oppId ? fn(o) : o)) });
  };
  const reset = (nextSeed) => set({ relationships: [], invitations: [], photoRequests: [],
    copyReviews: [], ...(nextSeed || seed) });
  const fixture = { set, reset, patchOpportunity };

  /* LEGACY ACTION FACADE — test vocabulary only. The seat each call acts as is
     read from the old argument shape (a `by`, or the record's owner), then the
     call is handed to execute() like any other. It grants no authority the
     command layer would not: every refusal still applies. */
  const opp = (id) => s.opportunities.find((o) => o.id === id) || {};
  const seatActor = (o, by) => (by === "tp" || by === "partner"
    ? { partnerId: o.partnerId } : { collectorId: o.collectorId });
  const legacy = (actor, command, payload, shape) => {
    const r = execute(actor, command, payload);
    if (shape === "raw") return r;
    if (!r.ok) return shape === "id" ? null : shape === "bool" ? false : { refused: r.refused };
    return shape === "id" || shape === "bool" ? r.value : (r.value === undefined ? true : r.value);
  };

  const actions = {
    addGoal: ({ collectorId, cardId, tier, at, note }) =>
      legacy({ collectorId }, "addGoal", { cardId, tier, at, note }, "id"),
    updateGoalTier: (goalId, tier, at) => {
      const g = s.goals.find((x) => x.id === goalId) || {};
      return legacy({ collectorId: g.collectorId }, "updateGoalTier", { goalId, tier, at });
    },
    removeGoal: (goalId) => {
      const g = s.goals.find((x) => x.id === goalId) || {};
      return legacy({ collectorId: g.collectorId }, "removeGoal", { goalId }, "bool");
    },
    addInventoryCopy: (copy, at) => legacy({ partnerId: copy.partnerId }, "addInventoryCopy", { copy, at }, "id"),
    updateInventoryCopy: ({ invId, patch, at }) => {
      const i = s.inventory.find((x) => x.invId === invId) || {};
      return legacy({ partnerId: i.partnerId }, "updateInventoryCopy", { invId, patch, at });
    },
    removeInventoryCopy: (invId) => {
      const i = s.inventory.find((x) => x.invId === invId) || {};
      return legacy({ partnerId: i.partnerId }, "removeInventoryCopy", { invId });
    },
    addBinderCopy: (copy) => legacy({ collectorId: copy.collectorId }, "addBinderCopy", { copy }, "id"),
    updateBinderCopy: ({ binderId, patch, at }) => {
      const b = s.binder.find((x) => x.id === binderId) || {};
      const r = execute({ collectorId: b.collectorId }, "updateBinderCopy", { binderId, patch, at });
      return r.ok ? r.value : { refused: r.refused === D.REFUSE.unknownActor ? D.REFUSE.copyUnavailable : r.refused };
    },
    removeBinderCopy: (binderId) => {
      const b = s.binder.find((x) => x.id === binderId) || {};
      return legacy({ collectorId: b.collectorId }, "removeBinderCopy", { binderId });
    },
    updatePartnerProfile: ({ partnerId, patch }) => legacy({ partnerId }, "updatePartnerProfile", { patch }, "id"),
    markDealViewed: ({ oppId, by, surface, at }) =>
      legacy(seatActor(opp(oppId), by), "markDealViewed", { oppId, surface, at }),
    setInterest: (partnerId, binderId, on, at) => legacy({ partnerId }, "setInterest", { binderId, on, at }),
    agreePrice: ({ oppId, by, at }) => legacy(seatActor(opp(oppId), by || "collector"), "acceptPrice", { oppId, at }),
    reviewCopy: ({ collectorId, invId, at }) => legacy({ collectorId }, "reviewCopy", { invId, at }),
    endReview: (reviewId, at) => {
      const r = (s.copyReviews || []).find((x) => x.id === reviewId) || {};
      return legacy({ collectorId: r.collectorId }, "endReview", { reviewId, at });
    },
    requestPhotos: ({ collectorId, invId, at }) => {
      const r = execute({ collectorId }, "requestPhotos", { invId, at });
      return r.ok ? r.value : { refused: r.refused };
    },
    addCopyPhotos: ({ invId, front, back, at }) => {
      const i = s.inventory.find((x) => x.invId === invId) || {};
      const r = execute({ partnerId: i.partnerId }, "addCopyPhotos", { invId, front, back, at });
      return r.ok ? r.value : { refused: r.refused === D.REFUSE.unknownActor ? D.REFUSE.copyUnavailable : r.refused };
    },
    reachOut: ({ collectorId, partnerId, cardId, oppId, text, at, by = "collector" }) =>
      legacy(by === "tp" ? { partnerId } : { collectorId }, "reachOut",
        { collectorId, partnerId, cardId, oppId, text, at }, "id"),
    sendMessage: ({ collectorId, partnerId, cardId, by, text, oppId, at }) =>
      legacy(by === "tp" ? { partnerId } : { collectorId }, "sendMessage",
        { collectorId, partnerId, cardId, text, oppId, at }, "id"),
    logMilestone: ({ collectorId, partnerId, cardId, text, oppId, at }) =>
      legacy({ partnerId }, "recordNote", { collectorId, cardId, oppId, milestone: text, at }),
    startOpportunity: ({ goalId, collectorId, invId, amount, at }) => {
      const r = execute({ collectorId }, "startOpportunity", { goalId, invId, amount, at });
      return r.ok ? r.value : { refused: r.refused };
    },
    proposePrice: ({ oppId, by, amount, at }) => legacy(seatActor(opp(oppId), by), "proposePrice", { oppId, amount, at }),
    tradeMarketRespond: ({ oppId, tradeCardId, by, action, amount, at }) =>
      legacy(seatActor(opp(oppId), by), action === "accept" ? "acceptMarketValue" : "proposeMarketValue",
        { oppId, tradeCardId, amount, at }),
    tradePercentRespond: ({ oppId, tradeCardId, by, action, percent, at }) =>
      legacy(seatActor(opp(oppId), by), action === "accept" ? "acceptTradePercent" : "proposeTradePercent",
        { oppId, tradeCardId, percent, at }),
    /* Contract §4: there is no separate "accept the figure" step any more. A
       standing figure is answered by final agreement (acceptDeal) or a new
       figure; the old accept maps to final agreement. */
    dealAdjustRespond: ({ oppId, by, action, amount, at }) =>
      legacy(seatActor(opp(oppId), by), action === "accept" ? "acceptDeal" : "proposeFinalBalance",
        { oppId, amount, at }),
    dealAgree: ({ oppId, by, at }) => legacy(seatActor(opp(oppId), by), "acceptDeal", { oppId, at }),
    proposeFulfillment: ({ oppId, plan, at }) => legacy(seatActor(opp(oppId), "tp"), "proposeFulfillment", { oppId, plan, at }),
    confirmFulfillmentPlan: ({ oppId, at }) => legacy(seatActor(opp(oppId), "collector"), "confirmFulfillmentPlan", { oppId, at }),
    requestFulfillmentRevision: ({ oppId, note, at }) =>
      legacy(seatActor(opp(oppId), "collector"), "requestFulfillmentRevision", { oppId, note, at }),
    confirmHandoff: ({ oppId, by, at }) => legacy(seatActor(opp(oppId), by), "confirmHandoff", { oppId, at }),
    reviewTradeCards: ({ oppId, tradeCardId, decision, at }) =>
      legacy(seatActor(opp(oppId), "tp"), "reviewTradeCard", { oppId, tradeCardId, decision, at }),
    proposeTradeSelection: ({ oppId, binderIds, at }) =>
      legacy(seatActor(opp(oppId), "collector"), "proposeTradeSelection", { oppId, binderIds, at }),
    withdrawTradeCard: ({ oppId, tradeCardId, at }) =>
      legacy(seatActor(opp(oppId), "collector"), "withdrawTradeCard", { oppId, tradeCardId, at }),
    chooseCashOnly: ({ oppId, at }) => legacy(seatActor(opp(oppId), "collector"), "chooseCashOnly", { oppId, at }),
    endOpportunity: (oppId, by, at, reason) =>
      legacy(seatActor(opp(oppId), by), "cancelOpportunity", { oppId, at, reason }),
    /* Raw state edits for fixtures. Not a product action. */
    patchOpportunity,
  };

  return { get, sub, execute, actorFor, cardById, fixture, actions };
}

module.exports = { createStore };
