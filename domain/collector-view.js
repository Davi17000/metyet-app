/* ============================================================================
   COLLECTOR PERSONA SELECTORS

   Presentation adapters, not a business model. Everything here either filters
   canonical state to what this collector may see, or re-words a canonical
   derivation for a consumer audience. No matching, no lifecycle, no settlement
   is reimplemented — those come from metyet-domain.js.

   If a function here started deciding something rather than presenting it, it
   would belong in the domain instead.
   ========================================================================== */

const D = require("./metyet-domain.js");
const E = require("./metyet-entities.js");

function collectorView(state, meId) {
  const cardById = (id) => state.catalog.find((c) => c.id === id);
  const partnerById = (id) => state.partners.find((p) => p.id === id);

  const myGoals = () => state.goals.filter((g) => g.collectorId === meId);
  const myBinder = () => state.binder.filter((b) => b.collectorId === meId)
    .map(E.binderCopyForOwner);                      // the owner sees their own value
  const myOpps = () => state.opportunities.filter((o) => o.collectorId === meId);
  /* Preferences are stated by the collector, so they live on the collector
     record. A separate preferences table is read too, if a deployment keeps one. */
  const myPrefs = () => {
    const me = state.collectors.find((c) => c.id === meId);
    if (me && Array.isArray(me.prefs)) return me.prefs;
    const row = (state.preferences || []).find((p) => p.collectorId === meId);
    return row ? row.tags : [];
  };

  /* Which partners hold the exact identity a goal names. Canonical match. */
  /* ONE IMAGE-SOURCE RULE for a specific physical copy:
       actual front/back photos  ->  stock/reference image  ->  identity plate
     A stock image says WHICH CARD this is; actual photos say what THIS COPY
     looks like, which is what a price is a judgement about. */
  const inventoryCopy = (invId) => (state.inventory || []).find((i) => i.invId === invId) || null;

  const copyPhotos = (inv) => (inv && D.INVARIANTS.copyPhotographed(inv.photos)
    ? { actual: true, front: inv.photos.front, back: inv.photos.back }
    : { actual: false, front: null, back: null });

  /* An open ask by THIS collector for THIS exact copy. */
  const photoRequestFor = (invId) => (state.photoRequests || []).find((r) =>
    r.collectorId === meId && r.invId === invId && !r.fulfilledAt) || null;

  /* What the collector can do about this copy right now. Derived, never stored. */
  const photoState = (inv) => {
    if (!inv) return "none";
    if (D.INVARIANTS.copyPhotographed(inv.photos)) return "ready";
    return photoRequestFor(inv.invId) ? "requested" : "stock";
  };

  /* THE PURSUIT OF A SPECIFIC COPY, as one continuous thing.

     Before an offer, the collector is reviewing a copy — that state already
     exists as the photo request, so it is projected here rather than stored
     twice. After an offer, the opportunity is the pursuit. Both read as the
     same workspace on the Goal; only one of them is a negotiation. */
  const pursuitFor = (goalId) => {
    const g = state.goals.find((x) => x.id === goalId);
    if (!g) return null;
    const opp = D.activeOppForGoal(goalId, state.opportunities);
    if (opp) return { kind: "deal", step: opp.stage, opp, invId: opp.invId,
      partnerId: opp.partnerId };
    /* No deal yet: having asked to see a copy of this card IS the pursuit, and
       it continues once the photos arrive — that is the moment the collector
       has something to review and a decision to make. It ends when they make an
       offer (a deal takes over) and not before. */
    const req = (state.photoRequests || []).find((r) => r.collectorId === meId
      && (state.inventory || [])
        .some((i) => i.invId === r.invId && i.cardId === g.cardId && !i.archived));
    if (!req) return null;
    const copy = (state.inventory || []).find((i) => i.invId === req.invId);
    const ready = D.INVARIANTS.copyPhotographed(copy && copy.photos);
    return { kind: "review", step: "review-card", request: req,
      invId: req.invId, partnerId: req.partnerId, copy, ready,
      /* Whose move: theirs until the card can be seen, then the collector's. */
      who: ready ? "me" : "partner" };
  };

  /* Where the pursuit stands on the six-step rail, and whose move it is. */
  const pursuitStep = (goalId) => {
    const p = pursuitFor(goalId);
    return p ? p.step : null;
  };

  const partnersWith = (cardId) => {
    const c = cardById(cardId);
    /* A partner may hold several physical copies of one identity. The collector
       asks "who has this", so the answer is one entry per PARTNER, showing their
       best (lowest) ask. The exact copy is still carried for the offer. */
    const best = new Map();
    E.partnersHolding(state.inventory, c, cardById).forEach((inv) => {
      const cur = best.get(inv.partnerId);
      /* Prefer a copy the collector can actually judge: a price is a judgement
         about a specific physical card, and a stock image cannot support one.
         Among photographed copies take the cheapest; fall back to a stock-only
         copy so the card is still discoverable and photos can be asked for. */
      const shot = D.INVARIANTS.copyPhotographed(inv.photos);
      const better = !cur || (shot && !cur.shot) || (shot === cur.shot && inv.ask < cur.ask);
      if (better) best.set(inv.partnerId, { partner: partnerById(inv.partnerId), inv, ask: inv.ask, shot });
    });
    return [...best.values()].filter((x) => x.partner);
  };

  /* Which partners would consider an exact binder copy. Canonical relationship. */
  const interestIn = (binderId) => state.interests
    .filter((i) => i.binderId === binderId)
    .map((i) => ({ ...i, partner: partnerById(i.partnerId) }))
    .filter((x) => x.partner);

  const interestCountFrom = (partnerId) =>
    E.binderCopiesInterestedBy(state.interests, partnerId)
      .filter((bid) => state.binder.some((b) => b.id === bid && b.collectorId === meId)).length;

  /* FOR YOU — an explicit preference filter, never a recommendation. Cards
     already on the goal list are excluded so the categories stay distinct. */
  const forYou = (partnerId) => {
    const prefs = myPrefs();
    const onList = new Set(myGoals().map((g) => g.cardId));
    return E.inventoryOf(state.inventory, partnerId)
      .filter((inv) => !onList.has(inv.cardId))
      .map((inv) => ({ ...inv, ask: inv.ask,
        why: (cardById(inv.cardId).tags || []).filter((t) => prefs.includes(t)) }))
      .filter((x) => x.why.length > 0);
  };

  const partnerProfile = (pid) => {
    const stock = E.inventoryOf(state.inventory, pid);
    const held = new Set(stock.map((s) => s.cardId));
    return {
      partner: partnerById(pid),
      deals: state.opportunities.filter((o) => o.partnerId === pid
        && o.collectorId === meId && D.isCompleted(o)).length,
      stock,
      primary: myGoals().filter((g) => g.tier === "primary" && held.has(g.cardId)).length,
      secondary: myGoals().filter((g) => g.tier === "secondary" && held.has(g.cardId)).length,
      interested: interestCountFrom(pid),
    };
  };

  /* Canonical derivations, surfaced unchanged. */
  const stateOf = (goalId) => D.goalState(goalId, state.opportunities);
  const openOppForGoal = (goalId) => D.activeOppForGoal(goalId, state.opportunities);
  const goalFor = (cardId) => myGoals().find((g) => g.cardId === cardId);
  /* ONE thread per collector + PARTNER + card identity. A conversation is with
     somebody, so the partner is part of its identity; the card identity is what
     lets one thread survive promotion and be inherited by the opportunity.

     The collector may hold several such threads for one card — one per partner
     they have talked to — which is what makes alternative-partner chat possible
     without a second chat model. */
  const threadWith = (partnerId, cardId) =>
    (partnerId ? D.findThread(state.conversations, meId, partnerId, cardById(cardId)) : null);
  /* Every partner thread about one identity, newest-agnostic order preserved. */
  const threadsForCard = (cardId) =>
    D.threadsForCard(state.conversations, meId, cardById(cardId));
  const partnersTalkedTo = (cardId) =>
    D.partnersInConversation(state.conversations, meId, cardById(cardId));

  /* A goal names a card, not a partner. Where a negotiation is under way the
     goal's "current" thread is the one with that deal's partner; otherwise
     there is no single answer, and callers should ask per partner. */
  const threadForGoal = (goalId) => {
    const g = state.goals.find((x) => x.id === goalId);
    if (!g) return null;
    const opp = D.activeOppForGoal(goalId, state.opportunities);
    return opp ? threadWith(opp.partnerId, g.cardId) : null;
  };
  /* Two honest questions, deliberately different:
       hasThreadAbout  — has contact been made at all (an event counts)
       hasTalkedAbout  — has anyone actually said something (the TP's contract)
     Both answer for a specific partner when given one, and "anyone" when not. */
  const hasThreadAbout = (cardId, partnerId) => (partnerId
    ? !!threadWith(partnerId, cardId)
    : threadsForCard(cardId).length > 0);
  const hasTalkedAbout = (cardId, partnerId) => (partnerId
    ? D.hasConversation(state.conversations, meId, partnerId, cardById(cardId))
    : threadsForCard(cardId).some((t) => t.entries.some((e) => e.kind === "message")));
  /* Scoped to a partner when asked; otherwise every partner thread on the goal. */
  const conversationsFor = (goalId, partnerId) => {
    const g = goalId ? state.goals.find((x) => x.id === goalId) : null;
    if (!g) return [];
    if (partnerId) { const t = threadWith(partnerId, g.cardId); return t ? [t] : []; }
    return threadsForCard(g.cardId);
  };

  /* Select Trade eligibility: EVERY copy is eligible. Partner interest orders
     the two groups; it never gates them. */
  const tradeGroups = (partnerId, opp) => {
    const used = new Set(((opp.trade && opp.trade.cards) || []).map((c) => c.binderId));
    const open = myBinder().filter((b) => !used.has(b.id));
    const keen = (b) => E.hasInterest(state.interests, partnerId, b.id);
    return { interested: open.filter(keen), other: open.filter((b) => !keen(b)) };
  };

  /* Turn ownership, worded for this persona. The ACTOR is canonical; only the
     phrasing is chosen here. */
  const turnFor = (o) => {
    const t = D.nextActor(o);
    if (!t.actor) return { who: null, what: t.reason === "ended" ? "This deal was stopped." : "Nothing to do." };
    const them = (partnerById(o.partnerId) || {}).name || "them";
    const mine = t.actor === "collector";
    switch (t.reason) {
      case "offer": return { who: "me", what: "Make an offer when you're ready — only you can start a negotiation." };
      case "price": return mine
        ? { who: "me", what: `Accept $${t.amount.toLocaleString()} or send a counter.` }
        : { who: "partner", what: `Waiting on ${them} to reply to your $${t.amount.toLocaleString()}.` };
      case "choose-trade": return { who: "me", what: "Choose which of your cards to put toward this, then send them over." };
      case "review-trade": return { who: "partner", what: `Waiting while ${them} reviews your cards.` };
      case "trade-reviewed": return { who: "me", what: "They've finished reviewing. Move on to agreeing values." };
      case "value": return mine
        ? { who: "me", what: `${t.count} card${t.count === 1 ? " needs" : "s need"} a value agreed.` }
        : { who: "partner", what: `Waiting on ${them} for ${t.count} card${t.count === 1 ? "" : "s"}.` };
      case "values-settled": return { who: "me", what: "Every card is settled. Time to look at the balance." };
      case "final": return mine
        ? { who: "me", what: "Agree to the balance, or propose a final figure." }
        : { who: "partner", what: `Waiting on ${them} to answer your figure.` };
      case "handoff": return mine
        ? { who: "me", what: "Confirm once you've got the card and they've got yours." }
        : { who: "partner", what: `You've confirmed. Waiting on ${them}.` };
      default: return { who: null, what: "" };
    }
  };

  return {
    meId, cardById, partnerById, catalog: state.catalog,
    myGoals, myBinder, myOpps, myPrefs,
    partnersWith, interestIn, interestCountFrom, forYou, partnerProfile,
    copyPhotos, photoState, photoRequestFor, inventoryCopy, pursuitFor, pursuitStep,
    stateOf, openOppForGoal, goalFor, conversationsFor, tradeGroups, turnFor,
    threadWith, threadsForCard, partnersTalkedTo,
    threadForGoal, hasTalkedAbout, hasThreadAbout,
  };
}

module.exports = { collectorView };
