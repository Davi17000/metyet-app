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
    /* Collector is looking at ONE physical copy with a view to pursuing it.
       Deliberately separate from photoRequests: asking a partner to photograph
       a card is work they must do, and the partner's inventory reads open
       requests as demand. Merely deciding to look at a copy must not appear on
       their shelf as a job. Non-financial, copy-specific, and it creates
       nothing else. */
    copyReviews: seed.copyReviews || [],
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

    /* SETTLING THE PRICE — the partner's point of commitment.

       Enforced here rather than in either app, because this is the moment the
       physical copy stops being available to anyone else and both personas can
       reach it. If another live deal settled this copy first, this one cannot
       also settle it: the card exists once. */
    agreePrice({ oppId, amount, by, at }) {
      const o = (s.opportunities || []).find((x) => x.id === oppId);
      if (!o) return { refused: D.REFUSE.noGoal };
      const taken = D.INVARIANTS.copyCommittedTo(o.invId, s.opportunities, o.id);
      if (taken) return { refused: D.REFUSE.copyCommitted };
      set({ ...s, opportunities: s.opportunities.map((x) => (x.id === oppId ? { ...x,
        agreedPrice: amount, stage: "select-trade",
        /* Entering Select Trade means opening an empty trade package. */
        trade: x.trade || { mode: "trade", submitted: false, cards: [] },
        priceThread: [...x.priceThread,
          { by: by || "collector", type: "accept", amount, at }] } : x)) });
      return oppId;
    },

    /* ---- REVIEWING A SPECIFIC COPY ---------------------------------------
       Choosing which copy to pursue. This is the moment the Goal acquires a
       partner, and it is the whole of what Review Card needs to exist — no
       offer, no price, no obligation, and nothing the partner has to act on. */
    reviewCopy({ collectorId, partnerId, invId, at }) {
      const copy = (s.inventory || []).find((i) => i.invId === invId);
      if (!copy || copy.archived) return { refused: D.REFUSE.copyUnavailable };
      const open = (s.copyReviews || []).find((r) => r.collectorId === collectorId
        && r.invId === invId && !r.endedAt);
      if (open) return open.id;                  // already looking at it
      const id = "rv" + Math.random().toString(36).slice(2, 9);
      set({ ...s, copyReviews: [...(s.copyReviews || []),
        { id, collectorId, partnerId: partnerId || copy.partnerId, invId, at, endedAt: null }] });
      return id;
    },
    /* Walking away before any offer. Ends the looking, nothing else. */
    endReview(id, at) {
      set({ ...s, copyReviews: (s.copyReviews || []).map((r) =>
        (r.id === id && !r.endedAt ? { ...r, endedAt: at || null } : r)) });
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
      /* Asking to see a copy IS reviewing it, so record that too when the
         collector arrived by that route rather than by selecting first. */
      const reviewing = (s.copyReviews || []).some((r) => r.collectorId === collectorId
        && r.invId === invId && !r.endedAt);
      set({ ...s,
        photoRequests: [...(s.photoRequests || []),
          { id, collectorId, partnerId: partnerId || copy.partnerId, invId, at, fulfilledAt: null }],
        copyReviews: reviewing ? (s.copyReviews || []) : [...(s.copyReviews || []),
          { id: "rv" + id, collectorId, partnerId: partnerId || copy.partnerId,
            invId, at, endedAt: null }] });
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
      /* CONTRACT CHANGE. Actual photos used to be an absolute requirement here.
         They are no longer: a graded card carries much of its condition in the
         grade itself, and a collector who understands what they cannot see is
         entitled to price accordingly. Seeing the card is now strongly
         encouraged by the interface — with a confirmation when it is skipped —
         rather than forbidden by the domain.

         What remains absolute is the copy: a deal names one physical card, and
         that card has to exist and still be available. */
      if (invId != null) {
        const copy = (s.inventory || []).find((i) => i.invId === invId);
        if (!copy || copy.archived) return { refused: D.REFUSE.copyUnavailable };
        /* Somebody has already settled a price on this exact copy. Offering on
           it now could only end in disappointment, so it is refused here rather
           than allowed to run and fail later. */
        if (D.INVARIANTS.copyCommittedTo(invId, s.opportunities))
          return { refused: D.REFUSE.copyCommitted };
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
    /* ---- STAGE 4-6: one action per business event, called by BOTH seats.

       Each is a thin canonical wrapper over the shared rule in D.TRADE or over
       a single agreement bit. They exist so that neither React component owns a
       business rule, and — critically — so that no seat can assert the other
       seat's agreement: `by` names who is acting, and only that side's fields
       move. */
    tradeMarketRespond({ oppId, tradeCardId, by, action, amount, at }) {
      return this.patchOpportunity(oppId, (o) => ({ ...o,
        trade: { ...o.trade, cards: (o.trade?.cards || []).map((c) => (c.id !== tradeCardId
          ? c : D.TRADE.applyMarket(c, by, action, amount, at))) } }));
    },

    tradePercentRespond({ oppId, tradeCardId, by, action, percent, at }) {
      return this.patchOpportunity(oppId, (o) => ({ ...o,
        trade: { ...o.trade, cards: (o.trade?.cards || []).map((c) => (c.id !== tradeCardId
          ? c : D.TRADE.applyPercent(c, by, action, percent, at))) } }));
    },

    dealAdjustRespond({ oppId, by, action, amount, at }) {
      return this.patchOpportunity(oppId, (o) => ({ ...o,
        deal: D.TRADE.applyDealAdjustment(o.deal || { adjThread: [] }, by, action, amount, at) }));
    },

    /* AGREEMENT IS PER SEAT. One bit, belonging to whoever acted. The deal
       becomes mutually agreed only because both bits are true — never because
       one action set both. */
    dealAgree({ oppId, by, at }) {
      return this.patchOpportunity(oppId, (o) => {
        if (o.stage !== "deal") return o;
        const deal = { ...(o.deal || {}),
          [by === "tp" ? "tpAgreed" : "collectorAgreed"]: true };
        const both = !!deal.tpAgreed && !!deal.collectorAgreed;
        /* Entering Fulfillment creates a fulfillment record with UNSET terms.
           Anything else would put words in the partner's mouth: a plan nobody
           proposed, presented to the collector as if they had. */
        return { ...o, deal, stage: both ? "fulfillment" : o.stage,
          fulfillment: both
            ? (o.fulfillment || { method: null, where: null, when: null,
                proposedAt: null, collectorConfirmedPlan: false,
                revisionRequested: null, tpHandoff: false, collectorReceipt: false })
            : o.fulfillment,
          ...(both ? { at } : {}) };
      });
    },

    /* The partner proposes how the exchange happens; the collector answers. */
    proposeFulfillment({ oppId, plan, at }) {
      return this.patchOpportunity(oppId, (o) => ({ ...o,
        fulfillment: { ...(o.fulfillment || {}), ...plan, proposedAt: at,
          revisionRequested: null, collectorConfirmedPlan: false } }));
    },

    confirmFulfillmentPlan({ oppId, at }) {
      return this.patchOpportunity(oppId, (o) => {
        const f = o.fulfillment || {};
        if (!f.proposedAt || f.revisionRequested) return o;   // nothing to confirm
        return { ...o, fulfillment: { ...f, collectorConfirmedPlan: true, confirmedAt: at } };
      });
    },

    requestFulfillmentRevision({ oppId, note, at }) {
      return this.patchOpportunity(oppId, (o) => ({ ...o,
        fulfillment: { ...(o.fulfillment || {}), collectorConfirmedPlan: false,
          revisionRequested: { note, at } } }));
    },

    /* COMPLETION IS TWO EVENTS. Handing the card over and confirming receipt are
       different acts by different people; one action never sets both. */
    confirmHandoff({ oppId, by, at }) {
      return this.patchOpportunity(oppId, (o) => {
        const f = o.fulfillment || {};
        const planAgreed = !!f.proposedAt && !f.revisionRequested && !!f.collectorConfirmedPlan;
        if (!planAgreed) return o;      // cannot complete what was never agreed
        const next = { ...f, [by === "tp" ? "tpHandoff" : "collectorReceipt"]: true };
        const done = D.FULFILLMENT.handedOff(next) && D.FULFILLMENT.received(next);
        return { ...o, fulfillment: next,
          stage: done ? "completed" : o.stage,
          completedAt: done ? at : o.completedAt };
      });
    },

    /* Either seat may take a card out of the trade; the rule is the same one. */
    /* The partner's Select Trade decision. Omitting tradeCardId decides every
       still-undecided row, which is what "accept these cards" means. */
    reviewTradeCards({ oppId, tradeCardId, decision, at }) {
      return this.patchOpportunity(oppId, (o) => ({ ...o,
        trade: { ...o.trade, cards: (o.trade?.cards || []).map((c) => (
          (tradeCardId && c.id !== tradeCardId) ? c : D.TRADE.decide(c, decision, at))) } }));
    },

    withdrawTradeCard({ oppId, tradeCardId, at }) {
      return this.patchOpportunity(oppId, (o) => ({ ...o,
        trade: { ...o.trade, cards: (o.trade?.cards || []).map((c) => (c.id !== tradeCardId
          ? c : D.TRADE.withdraw(c, at))) } }));
    },

    chooseCashOnly({ oppId, at }) {
      return this.patchOpportunity(oppId, (o) => (
        !["select-trade", "value-trade"].includes(o.stage) ? o
          : { ...o, trade: { ...(o.trade || {}), mode: "cash", submitted: true,
              cards: o.trade?.cards || [], cashOnlyAt: at }, stage: "deal" }));
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
