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
  const partnersWith = (cardId) => {
    const c = cardById(cardId);
    /* A partner may hold several physical copies of one identity. The collector
       asks "who has this", so the answer is one entry per PARTNER, showing their
       best (lowest) ask. The exact copy is still carried for the offer. */
    const best = new Map();
    E.partnersHolding(state.inventory, c, cardById).forEach((inv) => {
      const cur = best.get(inv.partnerId);
      if (!cur || inv.ask < cur.ask) best.set(inv.partnerId, { partner: partnerById(inv.partnerId), inv, ask: inv.ask });
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
  /* ONE thread per collector + card identity, shared with the Trusted Partner.
     A goal identifies the card, so a goal's conversation IS that card's thread —
     which is why it survives promotion and is inherited by the opportunity. */
  const threadForCard = (cardId) => D.findThread(state.conversations, meId, cardById(cardId));
  const threadForGoal = (goalId) => {
    const g = state.goals.find((x) => x.id === goalId);
    return g ? threadForCard(g.cardId) : null;
  };
  /* Two honest questions, deliberately different:
       hasThreadAbout  — has contact been made at all (an event counts)
       hasTalkedAbout  — has anyone actually said something (the TP's contract) */
  const hasThreadAbout = (cardId) => !!threadForCard(cardId);
  const hasTalkedAbout = (cardId) => D.hasConversation(state.conversations, meId, cardById(cardId));
  const conversationsFor = (goalId) => {
    const t = goalId ? threadForGoal(goalId) : null;
    return t ? [t] : [];
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
    stateOf, openOppForGoal, goalFor, conversationsFor, tradeGroups, turnFor,
    threadForCard, threadForGoal, hasTalkedAbout, hasThreadAbout,
  };
}

module.exports = { collectorView };
