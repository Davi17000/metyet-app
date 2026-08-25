/* ============================================================================
   THE CAPTURE MATRIX — what gets photographed, and what must be true first.

   Every entry names a checkpoint in the canonical scenario, the surface to be
   on, and the facts that must hold before the shutter opens. A written PNG is
   not success: a screenshot of the wrong deal, or of a deal in the wrong state,
   is worse than a missing one because it becomes a reference asset somebody
   compares against later.

   `assert` receives the canonical opportunity and the domain, and returns a
   string on failure. It must read the SAME projections the product reads —
   this file may describe states, never compute them.

   Ids are stable and numeric so a rerun overwrites cleanly and two runs can be
   diffed file by file.
   ========================================================================= */

const D = require("../domain/metyet-domain.js");

const accepted = (o) => D.acceptedTradeCards(o);
const standing = (o, phase, seat) => {
  const c = accepted(o)[0];
  return c ? D.TRADE.negotiationState(c, phase, seat) : { state: "none" };
};

/* surface: "goals" (outside the deal), "timeline", "messages", "photos" */
const CAPTURES = [
  { id: "01-active-deal-entry", checkpoint: "price-open", surface: "goals",
    question: "Can a collector see where an active deal lives before opening it?",
    assert: (o) => (o.stage === "agree-price" ? null
      : "expected agree-price, got " + o.stage) },

  { id: "02-deal-timeline-initial", checkpoint: "price-open", surface: "timeline",
    question: "On opening, is the card, the progress and the required action clear?",
    assert: (o) => (o.stage === "agree-price" ? null
      : "expected agree-price, got " + o.stage) },

  { id: "03-timeline-new-activity", checkpoint: "market-standing", surface: "timeline",
    question: "Is activity from the other seat visibly new?",
    unread: { surface: "timeline", min: 1 },
    assert: (o) => (o.stage === "value-trade" ? null
      : "expected value-trade, got " + o.stage) },

  { id: "04-messages-unread-while-timeline-read", checkpoint: "market-standing",
    surface: "timeline", review: ["timeline"],
    question: "Can Timeline be read while Messages stays unread?",
    unread: { surface: "messages", min: 1, other: { surface: "timeline", max: 0 } },
    assert: (o) => (o.stage === "value-trade" ? null : "expected value-trade") },

  { id: "05-messages-mixed-personas", checkpoint: "cash-standing", surface: "messages",
    question: "Are the two people distinguishable at a glance?",
    assert: (o, dom, ctx) => (ctx.messages.some((m) => m.by === "collector")
      && ctx.messages.some((m) => m.by === "tp") ? null
      : "expected messages from both seats, got "
        + ctx.messages.map((m) => m.by).join(",")) },

  { id: "06-card-context-multi-card", checkpoint: "value-complete", surface: "timeline",
    question: "Is every collectible in the deal reachable from the card strip?",
    assert: (o) => (accepted(o).length >= 2 ? null
      : "expected 2+ accepted trade cards, got " + accepted(o).length) },

  { id: "07-card-photo-viewer", checkpoint: "price-open", surface: "photos",
    question: "Are the actual photographs of this copy one tap away?",
    assert: (o) => (o.invId ? null : "the deal names no inventory copy") },

  { id: "08-price-negotiation-action", checkpoint: "price-open", surface: "timeline",
    question: "Is the price decision obviously the thing to do now?",
    assert: (o) => (o.stage === "agree-price" ? null : "expected agree-price") },

  { id: "09-price-agreed-milestone", checkpoint: "price-agreed", surface: "timeline",
    question: "Does an agreed price read as a decision that stuck?",
    assert: (o) => (o.agreedPrice === 3900 ? null
      : "expected agreed price 3900, got " + o.agreedPrice) },

  { id: "10-trade-selection", checkpoint: "trade-selected", surface: "timeline",
    question: "Is choosing what to offer clear with more than one card?",
    assert: (o) => ((o.trade.cards || []).length >= 2 ? null
      : "expected 2+ proposed rows, got " + (o.trade.cards || []).length) },

  { id: "11-trade-completed-milestone", checkpoint: "trade-accepted", surface: "timeline",
    question: "Once the partner has decided, is that visible as history?",
    assert: (o) => (o.stage === "value-trade" ? null
      : "expected the selection to have closed, got " + o.stage) },

  { id: "12-value-market-proposal", checkpoint: "market-standing", surface: "timeline",
    question: "Is a standing market-value proposal, and whose move it is, clear?",
    assert: (o) => (standing(o, "market", "collector").state === "theirs" ? null
      : "expected a partner proposal awaiting the collector") },

  { id: "13-value-market-agreed", checkpoint: "market-agreed", surface: "timeline",
    question: "Does an agreed market value become context rather than a decision?",
    assert: (o) => (accepted(o).every((c) => c.agreedMarket != null) ? null
      : "expected every card to have an agreed market value") },

  { id: "14-value-percent-proposal", checkpoint: "percent-standing", surface: "timeline",
    question: "Is a standing percentage, and what it comes to in dollars, clear?",
    assert: (o) => (standing(o, "percent", "collector").state === "theirs" ? null
      : "expected a partner percentage awaiting the collector") },

  { id: "15-value-completed", checkpoint: "value-complete", surface: "timeline",
    question: "Is the resulting trade value presented where it is expected?",
    assert: (o) => (D.totalTradeValue(o) === 1173 ? null
      : "expected trade value 1173, got " + D.totalTradeValue(o)) },

  { id: "16-cash-proposal", checkpoint: "cash-standing", surface: "timeline",
    question: "Is the cash figure, and which way it moves, unambiguous?",
    assert: (o) => (D.TRADE.dealAdjStanding(o.deal) === "collector" ? null
      : "expected a collector cash proposal standing") },

  { id: "17-cash-agreed", checkpoint: "cash-agreed", surface: "timeline",
    question: "Does an agreed balance read as settled, with direction intact?",
    assert: (o) => {
      const r = D.cashReceipt(o);
      if (o.deal.agreedAdj !== 2800) return "expected agreed cash 2800";
      return r.final.direction === "collector-to-tp" ? null
        : "expected collector-to-tp, got " + r.final.direction;
    } },

  { id: "18-handoff-action", checkpoint: "handoff-open", surface: "timeline",
    question: "Is it clear what has to happen for the cards to change hands?",
    assert: (o) => (o.stage === "fulfillment" ? null
      : "expected fulfillment, got " + o.stage) },

  { id: "19-handoff-progress", checkpoint: "handoff-partial", surface: "timeline",
    question: "When one side has acted and the other has not, is that legible?",
    assert: (o) => {
      const f = o.fulfillment || {};
      if (!D.FULFILLMENT.handedOff(f)) return "expected the partner to have handed over";
      return D.FULFILLMENT.received(f) ? "expected the collector NOT to have confirmed"
        : null;
    } },

  { id: "20-deal-completed", checkpoint: "handoff-partial", surface: "timeline",
    question: "With every decision settled, does the deal still show how it got there?",
    note: "a completed deal leaves the active list and has no mobile Deal Flow;"
      + " captured at the last state the mobile surface can show",
    assert: (o) => (o.stage === "fulfillment" ? null
      : "expected fulfillment, got " + o.stage) },

  { id: "21-long-timeline-top", checkpoint: "handoff-partial", surface: "timeline",
    scroll: "top",
    question: "With a full history, is the current area still readable?",
    /* Density is the whole chronology — thread entries plus the negotiation
       threads the timeline projects — not just what was said aloud. */
    assert: (o, dom, ctx) => (ctx.density >= 12 ? null
      : "expected a dense history, got " + ctx.density + " events") },

  { id: "22-long-timeline-history", checkpoint: "handoff-partial", surface: "timeline",
    scroll: "bottom",
    question: "Scrolled into older history, does the hierarchy hold up?",
    assert: (o, dom, ctx) => (ctx.density >= 12 ? null
      : "expected a dense history, got " + ctx.density) },

  { id: "23-long-messages", checkpoint: "handoff-partial", surface: "messages",
    question: "At conversational length, does the chat stay scannable?",
    assert: (o, dom, ctx) => (ctx.messages.length >= 4 ? null
      : "expected a real conversation, got " + ctx.messages.length + " messages") },
];

module.exports = { CAPTURES, IDS: CAPTURES.map((c) => c.id) };
