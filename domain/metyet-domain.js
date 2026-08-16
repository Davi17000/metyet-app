/* ============================================================================
   THE METYET DOMAIN

   One source of truth. The Trusted Partner workspace and the Collector app are
   two projections over the state below — not two applications that synchronise.

   The governing rule everything here serves:
     one mutation -> one canonical state change -> two perspectives -> no sync.

   Nothing in this file knows about React, layout, or either persona's screens.
   Persona-specific presentation lives in the two UI layers; persona-specific
   VISIBILITY lives here, because visibility is a domain rule.
   ========================================================================== */

/* ---------------------------------------------------------------- IDENTITY */

/* A card identity is exact. These eight dimensions are the whole of it, and the
   same key decides goal matching, inventory matching and demand everywhere. A
   PSA 9 Base Set Charizard is a different card from a PSA 8 one. */
const identityKey = (c) => !c ? "" : [
  c.name, c.set, c.num, c.print, c.edition, c.language,
  c.grade, c.grade === "Raw" ? (c.condition || "") : "",
].join("|").toLowerCase();

const isRaw = (c) => c && c.grade === "Raw";
const sameIdentity = (a, b) => identityKey(a) === identityKey(b);

/* ------------------------------------------------------------- LIFECYCLE */

const STAGES = [
  { id: "secondary", label: "Secondary Goal", group: "intent" },
  { id: "primary", label: "Primary Goal", group: "intent" },
  { id: "agree-price", label: "Agree on Price", group: "deal" },
  { id: "select-trade", label: "Select Trade", group: "deal" },
  { id: "value-trade", label: "Value Trade", group: "deal" },
  { id: "deal", label: "Deal", group: "deal" },
  { id: "fulfillment", label: "Fulfillment", group: "deal" },
  { id: "completed", label: "Completed", group: "closed" },
];
const STAGE_IX = Object.fromEntries(STAGES.map((s, i) => [s.id, i]));
const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.id, s.label]));

/* Terminal means the opportunity is finished, one way or the other. An ended
   opportunity is NOT deleted: it keeps every agreed term as history. */
const isEnded = (o) => !!o.declined;
const isCompleted = (o) => o.stage === "completed";
const isTerminal = (o) => isCompleted(o) || isEnded(o);
const isActive = (o) => !isTerminal(o);
/* Structured negotiation = past the intent stages. A goal at Primary Goal is
   not being negotiated; it is merely wanted. */
const isNegotiating = (o) => isActive(o) && STAGE_IX[o.stage] >= STAGE_IX["agree-price"];

/* ------------------------------------------------------- GOAL STATE (DERIVED)

   Never stored. Seeking / Negotiating / Satisfied describe what the
   opportunities actually say, so they cannot drift from reality, and ending a
   negotiation returns a goal to Seeking with no mutation at all. */
const activeOppForGoal = (goalId, opps) =>
  opps.find((o) => o.goalId === goalId && isNegotiating(o)) || null;

const goalState = (goalId, opps) => {
  const mine = opps.filter((o) => o.goalId === goalId);
  if (mine.some(isCompleted)) return "satisfied";
  if (mine.some(isNegotiating)) return "negotiating";
  return "seeking";
};

/* ------------------------------------------------------------- SETTLEMENT

   One arithmetic, used by both personas. Trade value needs BOTH terms agreed;
   there is no partial credit. */
const acceptedTradeCards = (o) =>
  ((o.trade && o.trade.cards) || []).filter((c) => c.inclusion === "accepted" && !c.withdrawn);
const cardSettled = (c) => c.agreedMarket != null && c.agreedPercent != null;
const tradeValueOf = (c) => (cardSettled(c) ? Math.round(c.agreedMarket * c.agreedPercent) : null);
const totalTradeValue = (o) => acceptedTradeCards(o).reduce((a, c) => a + (tradeValueOf(c) || 0), 0);

/* Positive = the collector pays the partner. Negative = the partner pays the
   collector. One directionality, expressed differently by each persona. */
const calculatedBalance = (o) =>
  (o.agreedPrice == null ? null : o.agreedPrice - totalTradeValue(o));
const finalBalance = (o) =>
  (o.deal && o.deal.agreedAdj != null ? o.deal.agreedAdj : calculatedBalance(o));

/* --------------------------------------------------------- TURN OWNERSHIP

   ONE ownership truth: which actor must move. The persona-relative words
   ("Your move" / "Waiting on them") are chosen by each UI from this actor —
   they are never stored. */
const lastEntry = (t) => (t && t.length ? t[t.length - 1] : null);

function nextActor(o) {
  if (isEnded(o)) return { actor: null, reason: "ended" };
  switch (o.stage) {
    case "secondary": case "primary":
      return { actor: "collector", reason: "offer" };
    case "agree-price": {
      const last = lastEntry(o.priceThread);
      if (!last) return { actor: "collector", reason: "offer" };
      return last.by === "collector"
        ? { actor: "partner", reason: "price", amount: last.amount }
        : { actor: "collector", reason: "price", amount: last.amount };
    }
    case "select-trade":
      if (!o.trade || !o.trade.submitted) return { actor: "collector", reason: "choose-trade" };
      return ((o.trade.cards || []).some((c) => c.inclusion === "proposed"))
        ? { actor: "partner", reason: "review-trade" }
        : { actor: "collector", reason: "trade-reviewed" };
    case "value-trade": {
      const open = acceptedTradeCards(o).filter((c) => !cardSettled(c));
      if (!open.length) return { actor: "collector", reason: "values-settled" };
      const waiting = open.every((c) => (c.agreedMarket != null
        ? c.collectorPercent != null : c.collectorMarket != null));
      return waiting
        ? { actor: "partner", reason: "value", count: open.length }
        : { actor: "collector", reason: "value", count: open.length };
    }
    case "deal": {
      const d = o.deal || {};
      if (d.tpAgreed && d.collectorAgreed) return { actor: null, reason: "agreed" };
      if (d.proposedBy && d.proposedBy !== "collector") return { actor: "collector", reason: "final" };
      if (d.proposedBy === "collector") return { actor: "partner", reason: "final" };
      return { actor: "collector", reason: "final" };
    }
    case "fulfillment": {
      const f = o.fulfillment || {};
      return f.collectorDone ? { actor: "partner", reason: "handoff" }
        : { actor: "collector", reason: "handoff" };
    }
    default:
      return { actor: null, reason: "done" };
  }
}

/* ------------------------------------------------------------- INVARIANTS

   Enforced HERE, in the domain, so no UI entry point on either persona can
   route around them. */
const INVARIANTS = {
  /* A collector may pursue one structured negotiation per goal at a time.
     Alternatives stay visible and reachable — only the offer is limited. */
  oneNegotiationPerGoal: (goalId, opps) => activeOppForGoal(goalId, opps) == null,
  /* A binder copy is a physical thing a partner must be able to evaluate.
     Both faces or it does not exist. */
  binderCopyPhotographed: (photos) => !!(photos && photos.front && photos.back),
};

module.exports = {
  identityKey, isRaw, sameIdentity,
  STAGES, STAGE_IX, STAGE_LABEL,
  isEnded, isCompleted, isTerminal, isActive, isNegotiating,
  activeOppForGoal, goalState,
  acceptedTradeCards, cardSettled, tradeValueOf, totalTradeValue,
  calculatedBalance, finalBalance,
  lastEntry, nextActor,
  INVARIANTS,
};
