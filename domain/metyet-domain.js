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

/* ------------------------------------------------------- CARD IDENTITY SEARCH

   How MetYet decides WHICH card someone means. Shared, because the answer must
   not depend on who is asking: a Trusted Partner adding an inventory copy and a
   collector stating a goal are describing the same thing, and must describe it
   the same way.

   The persona changes what happens AFTER a card is chosen. It must not change
   how the card is defined. */

const GRADED_VALUES = ["Raw", "PSA 1", "PSA 2", "PSA 3", "PSA 4", "PSA 5",
  "PSA 6", "PSA 7", "PSA 8", "PSA 9", "PSA 10"];
const CONDITION_VALUES = ["Near Mint", "Lightly Played", "Moderately Played",
  "Heavily Played", "Damaged"];

/* Free-text search over the canonical catalog. Every term must appear somewhere
   in the record; name matches rank above set matches. */
function searchCards(cards, query) {
  const terms = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored = [];
  for (const c of cards) {
    const name = String(c.name).toLowerCase();
    const hay = [c.name, c.set, c.num, c.year, c.grade, c.edition, c.print, c.language]
      .filter(Boolean).join(" ").toLowerCase();
    if (!terms.every((t) => hay.includes(t))) continue;
    const inName = terms.filter((t) => name.includes(t)).length;
    scored.push({ c, inName, pos: name.indexOf(terms[0]) });
  }
  return scored
    .sort((a, b) => b.inName - a.inName
      || (a.pos < 0 ? 99 : a.pos) - (b.pos < 0 ? 99 : b.pos)
      || a.c.name.localeCompare(b.c.name)
      || a.c.set.localeCompare(b.c.set))
    .map((x) => x.c);
}

/* A PRINTED card — everything identity depends on except the copy-level facts
   (edition, grade, condition). Search results are grouped on this, so choosing a
   grade never splits one printing into several rows. */
const PRINT_FIELDS = ["name", "set", "num", "print", "language"];
const printKey = (c) => (c
  ? PRINT_FIELDS.map((f) => String(c[f]).trim().toLowerCase()).join("|") : "");

/* Group a catalog into printed cards, each carrying the variants beneath it, so
   a picker can ask for edition only when the printing genuinely offers a choice. */
function printedCards(cards) {
  const groups = new Map();
  for (const c of cards) {
    const k = printKey(c);
    if (!groups.has(k)) groups.set(k, { ...c, variants: [] });
    groups.get(k).variants.push(c);
  }
  return [...groups.values()];
}

/* Which copy-level questions still need answering before MetYet can say which
   exact card this is. The same three for both personas. */
function identityGaps(printed, copy) {
  const editions = printed ? [...new Set(printed.variants.map((v) => v.edition))] : [];
  const edition = editions.length === 1 ? editions[0] : (copy.edition || "");
  const needsEdition = editions.length > 1 && !copy.edition;
  const raw = copy.grade === "Raw";
  return {
    editions, edition, needsEdition,
    needsGrade: !copy.grade,
    needsCondition: raw && !copy.condition,
    raw,
    resolved: !!printed && !!edition && !!copy.grade && (!raw || !!copy.condition),
  };
}

/* The exact canonical identity a picker produces. Both personas end here. */
const identityFrom = (printed, copy, edition) => {
  const t = { ...printed, edition, grade: copy.grade, condition: copy.grade === "Raw" ? copy.condition : null };
  delete t.variants;
  return t;
};

module.exports.GRADED_VALUES = GRADED_VALUES;
module.exports.CONDITION_VALUES = CONDITION_VALUES;
module.exports.searchCards = searchCards;
module.exports.printKey = printKey;
module.exports.printedCards = printedCards;
module.exports.identityGaps = identityGaps;
module.exports.identityFrom = identityFrom;
