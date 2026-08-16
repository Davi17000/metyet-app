/* ============================================================================
   SHARED ENTITIES, RELATIONSHIPS AND PROJECTIONS

   Three things the migration establishes that neither prototype had alone:

   1. TRUSTED PARTNERS are first-class. The old TP prototype had a `PARTNER`
      singleton because it only ever showed one; that was an implementation
      detail, not the domain. Every inventory copy now names its owner, and the
      logged-in partner is simply `p-self`.

   2. INTEREST IS A RELATIONSHIP, not a boolean. `tpInterest: true` on a binder
      copy could only ever mean "the one partner". The canonical form is
      TrustedPartner -> exact BinderCopy, which is what lets a collector see
      WHICH partners would consider a given copy.

   3. CONVERSATIONS are a real model. Neither prototype had one: the TP had a
      price thread inside an opportunity plus an activity log, the Collector had
      a bare contact record. Reach out needs a context that can name a collector,
      a partner, and optionally a goal, an inventory copy, a binder copy or an
      opportunity — without requiring any of them.
   ========================================================================== */

const D = require("./metyet-domain.js");

const SELF = "p-self";          // the Trusted Partner using the TP workspace

/* ------------------------------------------------------------ CONVERSATION */

/* One contextual thread. Every field beyond the two participants is optional,
   because a conversation may be about a goal, a specific copy, a live deal, or
   simply about nothing in particular. Reaching out NEVER creates an
   opportunity — that is the whole point of the distinction. */
const newConversation = ({ collectorId, partnerId, goalId, invId, binderId, oppId, at }) => ({
  id: "cv" + Math.random().toString(36).slice(2, 9),
  collectorId, partnerId,
  goalId: goalId || null,
  invId: invId || null,
  binderId: binderId || null,
  oppId: oppId || null,
  openedAt: at,
  messages: [],
});
const newMessage = (by, text, at) => ({ by, text, at });   // by: 'collector' | 'partner'

/* ---------------------------------------------------------------- INTEREST */

/* TrustedPartner would consider this exact BinderCopy in a trade. Not an offer,
   not a reservation, not a valuation, not demand. */
const interestKey = (partnerId, binderId) => partnerId + "::" + binderId;
const hasInterest = (interests, partnerId, binderId) =>
  interests.some((i) => i.partnerId === partnerId && i.binderId === binderId);
const partnersInterestedIn = (interests, binderId) =>
  interests.filter((i) => i.binderId === binderId).map((i) => i.partnerId);
const binderCopiesInterestedBy = (interests, partnerId) =>
  interests.filter((i) => i.partnerId === partnerId).map((i) => i.binderId);

/* -------------------------------------------------------------- SELECTORS */

/* Inventory is owned. A partner sees theirs; a collector sees a partner's. */
const inventoryOf = (inventory, partnerId) =>
  inventory.filter((i) => i.partnerId === partnerId && !i.archived);

/* Which partners hold the exact identity a goal names. This is the single
   matching path: the collector's "who has this" and the partner's "who wants
   what I hold" are the same computation read from opposite ends. */
const partnersHolding = (inventory, card, cardById) =>
  inventory.filter((i) => !i.archived && D.sameIdentity(cardById(i.cardId), card));

const goalsMatchingCard = (goals, card, cardById) =>
  goals.filter((g) => D.sameIdentity(cardById(g.cardId), card));

/* Network demand for a partner: what collectors want, excluding the owner of
   the copy in question so "somebody else wants this" stays true. */
const demandForIdentity = (goals, card, cardById, excludeCollectorId) =>
  goalsMatchingCard(goals, card, cardById)
    .filter((g) => g.collectorId !== excludeCollectorId);

/* ------------------------------------------------------------ PROJECTIONS

   VISIBILITY IS A DOMAIN RULE, not a UI convention. A binder copy carries the
   collector's private reference value; the partner-facing projection removes
   it at the domain boundary so it cannot reach a TP surface even by accident.
   Everything a TP may legitimately see about a copy survives. */

const binderCopyForPartner = (cc) => {
  if (!cc) return null;
  const { market, ...visible } = cc;      // `market` is the collector's own number
  return visible;
};
const binderCopiesForPartner = (ccs) => ccs.map(binderCopyForPartner);

/* The collector sees their own copy whole, including their private value. */
const binderCopyForOwner = (cc) => cc;

/* A negotiation value only becomes shared when it is intentionally submitted.
   Draft input lives in component state on either side and never reaches here. */
const submittedMarketOf = (tc, by) =>
  (by === "collector" ? tc.collectorMarket : tc.tpMarket);

module.exports = {
  SELF,
  newConversation, newMessage,
  interestKey, hasInterest, partnersInterestedIn, binderCopiesInterestedBy,
  inventoryOf, partnersHolding, goalsMatchingCard, demandForIdentity,
  binderCopyForPartner, binderCopiesForPartner, binderCopyForOwner,
  submittedMarketOf,
};
