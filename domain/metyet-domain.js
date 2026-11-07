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

const { randomToken } = require("./metyet-runtime.js");

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

/* HOW LONG AN INVITATION STAYS OPEN (Phase 5 Batch 2).

   Fourteen days, from the moment the command ran. It is not a parameter: a
   Trusted Partner inviting somebody at a counter is not making a decision about
   expiry, and offering them one would be a field to fill in rather than a
   choice worth having. Fourteen is what MetYet's own partner invitations
   default to, so the product has one answer to "how long does an invitation
   last" rather than two.

   Derived from the command's own timestamp, so it is the runtime's clock and
   not a caller's — and so every record one command writes agrees about when
   "now" was. An unreadable timestamp yields null rather than a guess. */
const INVITATION_DAYS = 14;
const invitationExpiry = (at, days = INVITATION_DAYS) => {
  const from = at ? new Date(at) : null;
  if (!from || Number.isNaN(from.getTime())) return null;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
};
/* AND NOW THE QUESTION A REDEMPTION ASKS (Phase 5 Batch 3A).

   Batch 2 recorded the expiry and deliberately wrote no predicate to read it,
   because a rule with no caller is a rule that rots. This is the caller.

   Open means all four: it exists, nobody has accepted it, nobody has withdrawn
   it, and it is not past its day. `now` IS REQUIRED and there is no fallback to
   a clock — nothing in the domain reads the time, a caller passes the one its
   runtime gave it, and a test holds every module here to that. Without a time
   there is no answer, so it says so by refusing.

   THIS IS NECESSARY AND NOT SUFFICIENT, and the order matters more than the
   rule. A redemption must ALSO have spent a genuine, unspent credential, and
   that check lives in metyet_auth where the secret is. Possession is what
   proves who may accept; this only says whether there is still anything to
   accept. A caller that asked only this question would let anybody accept any
   invitation whose id they could guess. */
const invitationOpen = (invitation, now) => {
  if (!invitation || typeof invitation !== "object") return false;
  if (invitation.acceptedAt || invitation.revokedAt) return false;
  if (!invitation.expiresAt || !now) return false;
  const ends = new Date(invitation.expiresAt).getTime();
  const at = new Date(now).getTime();
  return Number.isFinite(ends) && Number.isFinite(at) && ends > at;
};

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
/* Market Validation is still open: a live deal that has not agreed a price.
   Named here so the projection can carry the answer and no screen has to work
   it out from a stage (Batch 3B.1). */
const priceUnresolved = (o) => isActive(o) && o.stage === "agree-price";

/* ------------------------------------------------------- GOAL STATE (DERIVED)

   Never stored. Seeking / Negotiating / Satisfied describe what the
   opportunities actually say, so they cannot drift from reality, and ending a
   negotiation returns a goal to Seeking with no mutation at all. */
/* A NEGOTIATION THAT CAN NEVER CONCLUDE IS ENDED, NOT IGNORED (M3A A1).

   One live negotiation per Goal is a real rule, and it assumes a negotiation can
   end. A deal whose physical shop copy has gone to somebody else — promised by
   another deal's final agreement, or sold — cannot conclude, and before A1 the
   domain coped by reading such a deal as "not the one negotiation" while leaving
   it active: still `declined: false`, still apparently open, silently excluded
   from the rule in four places.

   That exclusion is gone. The command that makes the card unavailable now ENDS
   every other active deal on it in the same write, with the ordinary ending
   fields and `outcome: "card-unavailable"` (see `endUnavailable` in the command
   layer): `acceptDeal` when another deal reaches final agreement, and
   `removeInventoryCopy` when the partner takes the card off the shelf before any
   price was agreed. An ended deal holds nothing, so its Goal is free, its trade
   cards are released and every later command on it is refused as terminal.

   `transactionallyLost` stays, as the predicate `validateWorld` uses to insist
   that no active deal is in this condition. Losing is permanent because the
   deal is ENDED, not because of how the predicate reads: a rival cancelling
   after its final agreement does not resurrect a deal that was already ended,
   and a brand-new deal on the copy once it is back on the shelf starts clean. A
   temporary hold (`pendingFor`) is not loss and ends nothing. */
const transactionallyLost = (o, opps) => {
  const invId = o && o.invId;
  if (invId == null) return false;
  if (soldInventoryIds(opps || []).has(invId)) return true;
  /* PROMISED ELSEWHERE NOW, OR SOLD (M3A A1).

     Before A1 this asked whether another deal had EVER given final agreement on
     the copy, because a lost deal stayed active and un-losing it — when the
     rival cancelled after agreeing — would have handed its Goal a second live
     negotiation. Losing had to be permanent, and the predicate was what made it
     so.

     Losing is now made permanent by ENDING the deal (`endUnavailable`, in the
     same write as the rival's final agreement), so the predicate no longer has
     to carry that history — and carrying it had become wrong: after a promised
     deal was cancelled and the copy went back on the shelf, a brand-new deal on
     it read as "lost" from the moment it began. So this now asks what is true
     now: another ACTIVE deal holds final agreement on the copy, or it is sold.
     `validateWorld` uses it to insist that no active deal is in that state. */
  return (opps || []).some((other) => other && other.invId === invId
    && other.id !== o.id && isActive(other) && finalAgreementGiven(other));
};

/* AND A REFERENTIAL CONSTRAINT, WHICH IS NOT THE SAME AS A LOCK. Releasing the
   negotiation lock lets a Collector demote the Goal and pursue the card
   elsewhere. It must NOT let them DELETE the Goal, because an active
   Opportunity names it and `validateWorld` requires that name to resolve —
   deleting would produce an unstorable world, the exact shape this batch set
   out to avoid one predicate over. The honest way out of a dead deal is to
   cancel it, which stays available and is what makes the Goal deletable. */
/* THE FOUR COLLECTING STATES, and how many times one record's meaning may
   cross between a Goal and an owned copy (P6-F4 Batch 5). Every crossing
   appends to the record's `formerly` lineage and nothing is ever removed from
   it, so the bound is a refusal (`lineage-full`), never a truncation. */
const COLLECTING_STATES = Object.freeze(["primary", "secondary", "pc", "trade"]);
const COLLECTING_LINEAGE_MAX = 64;

const goalNamedByActive = (goalId, opps) =>
  (opps || []).some((o) => o && o.goalId === goalId && isActive(o));

const activeOppForGoal = (goalId, opps) =>
  (opps || []).find((o) => o.goalId === goalId && isNegotiating(o)) || null;

const goalState = (goalId, opps) => {
  const mine = (opps || []).filter((o) => o.goalId === goalId);
  if (mine.some(isCompleted)) return "satisfied";
  if (mine.some(isNegotiating)) return "negotiating";
  return "seeking";
};

/* ------------------------------------------------------------- SETTLEMENT

   One arithmetic, used by both personas. Trade value needs BOTH terms agreed;
   there is no partial credit. */
const tradeRows = (o) => (o.trade && o.trade.cards) || [];
const acceptedRows = (o) => tradeRows(o).filter((c) => c.inclusion === "accepted");
const activeTradeCards = (o) => acceptedRows(o).filter((c) => !c.withdrawn);
const acceptedTradeCards = (o) =>
  ((o.trade && o.trade.cards) || []).filter((c) => c.inclusion === "accepted" && !c.withdrawn);
const cardSettled = (c) => c.agreedMarket != null && c.agreedPercent != null;
const tradeValueOf = (c) => (cardSettled(c) ? Math.round(c.agreedMarket * c.agreedPercent) : null);
/* What a card WOULD be worth at a given percentage. Previews need this before
   anything is agreed, and tradeValueOf deliberately refuses unsettled cards —
   so without it each screen re-derives the rounding rule and they drift. Same
   arithmetic, one definition. */
/* A trade value only exists against a real market figure. Guarding here rather
   than at each call site is what keeps NaN out of every screen that converts. */
const tradeValueAt = (market, percent) => {
  const m = Number(market); const p = Number(percent);
  if (!isFinite(m) || !isFinite(p) || m <= 0 || p < 0) return null;
  return Math.round(m * p);
};
const totalTradeValue = (o) => acceptedTradeCards(o).reduce((a, c) => a + (tradeValueOf(c) || 0), 0);

/* Positive = the collector pays the partner. Negative = the partner pays the
   collector. One directionality, expressed differently by each persona. */
/* A MARKET-VALUE PROPOSAL, IN WHOLE DOLLARS (Market Validation, Batch 2).
   MetYet does not negotiate in cents. A proposal — the Collector's opening, or
   either side's counter — is EITHER a whole-dollar `amount`, OR a `percent` of
   the Proposed Market Price captured when the negotiation opened (a fraction:
   0.9 = 90%, as trade percentages already are), resolved to the nearest whole
   dollar with Math.round. Never measured against the previous counter.
   A fractional dollar amount is refused, never rounded: rounding a number a
   person typed is MetYet choosing a price for them. The resolved dollar amount
   is the one authority; the percentage is kept beside it only as its basis.
   Returns { amount, basis } or { refused }. */
const priceProposal = (listed, { amount, percent }) => {
  const has = (v) => v !== undefined && v !== null;
  const dollars = (n) => Number.isSafeInteger(n) && n > 0;
  if (has(percent)) {
    if (has(amount)) return { refused: REFUSE.invalidAmount };
    if (!(typeof percent === "number" && isFinite(percent) && percent > 0)) return { refused: REFUSE.invalidAmount };
    if (!(typeof listed === "number" && isFinite(listed) && listed > 0)) return { refused: REFUSE.invalidAmount };
    const resolved = Math.round(listed * percent);
    if (!dollars(resolved)) return { refused: REFUSE.invalidAmount };
    return { amount: resolved, basis: { percent } };
  }
  if (!dollars(amount)) return { refused: REFUSE.invalidAmount };
  return { amount, basis: null };
};
/* THE PROPOSED MARKET PRICE IN NEGOTIATION TERMS: whole dollars. A shop's
   stored `ask` may carry cents (a CSV import allows two places, and so does
   the form); every screen already shows it rounded, and Firm on Price compares
   an opening against exactly that figure. The stored value is never rewritten. */
const wholeDollarPrice = (listed) =>
  (typeof listed === "number" && isFinite(listed) && listed > 0 ? Math.round(listed) : null);
const calculatedBalance = (o) =>
  (o.agreedPrice == null ? null : o.agreedPrice - totalTradeValue(o));
const finalBalance = (o) =>
  (o.deal && o.deal.agreedAdj != null ? o.deal.agreedAdj : calculatedBalance(o));

/* ============================================================================
   WHO OWES WHOM — ONE SIGNED NUMBER, ONE READING OF IT

   The convention, stated once so nothing has to guess:

     balance > 0   the collector owes the partner
     balance < 0   the partner owes the collector
     balance === 0 nobody owes anything

   The sign was always right in the domain. What went wrong was the receipt
   rendering Math.abs() of it, which threw the direction away — so a deal where
   the trade was worth MORE than the card still read as "you pay", and the
   adjustment line was computed against a magnitude rather than a position.

   So direction is derived here, from the signed amount, and returned as meaning
   rather than as a number to be interpreted again downstream. The magnitude
   comes back unsigned because a headline should never show a negative: which
   way the money moves belongs in the words. Presentation maps `direction` to
   its own tokens; no colour or persona wording lives in the domain. */
/* NEW SINCE YOU LAST LOOKED — derived by comparison, not by flagging.

   An event is new to a seat when it happened after that seat last opened the
   deal, and was not that seat's own doing: your own message is not news to you.
   Nothing is written onto the events themselves, so two people can hold
   different views of the same unchanged history. */
const newSince = (events, viewedAt, viewer) => {
  const since = viewedAt || null;
  return events.filter((e) => {
    if (!e.at) return false;
    /* Your own move is never news to you — whichever seat you are reading from.
       `by` carries the actor, so this holds when the same chronology is read
       from the other side. */
    if (e.by === viewer || e.mine === true) return false;
    if (!viewer && e.kind === "mine") return false;
    return !since || String(e.at) > String(since);
  });
};

/* What is new on each surface, for one seat. Timeline holds everything;
   Messages holds only what somebody said. Two questions, one chronology. */
const unreadFor = (events, viewedAt, viewer) => {
  const seat = (viewedAt || {})[viewer === "tp" ? "tp" : "collector"] || {};
  const timeline = newSince(events, seat.timeline, viewer);
  const messages = newSince(events.filter((e) => e.kind === "message"),
    seat.messages, viewer);
  return { timeline, messages };
};

const cashDirection = (amount) => {
  if (amount == null) return { direction: "unknown", amount: null };
  if (amount > 0) return { direction: "collector-to-tp", amount: Math.abs(amount) };
  if (amount < 0) return { direction: "tp-to-collector", amount: Math.abs(amount) };
  return { direction: "settled", amount: 0 };
};

/* What the receipt is actually reporting: what the settled terms came to, what
   an accepted final amount changed, and what is owed — each with its direction
   already resolved. The adjustment stays SIGNED against the signed balance, so
   -300 becoming -250 is +50 (less owed to the collector), not -50. */
/* WHO PAYS WHOM, IN WORDS — the one place that decides.

   The signed balance stays exactly as it was: it is the right internal model,
   and reversing it would be a correctness change nobody asked for. What was
   wrong is that half a dozen places each turned that sign into English on
   their own, and one of them said "$272 to them" — leaving the reader to work
   out who "them" was, in the one sentence where guessing costs money.

   So direction becomes a sentence exactly once. `viewer` decides which side
   says "You", which is what lets a collector and a partner read the same
   agreement and both describe the same transaction correctly.

   Zero is a real state, not a small debt: nobody pays anybody. */
const settlement = (amount, { viewer = "collector", collector = "the collector",
  partner = "them" } = {}) => {
  const dir = cashDirection(amount);
  const nameOf = (seat) => (seat === viewer ? "You"
    : seat === "tp" ? partner : collector);
  if (dir.direction === "unknown") {
    return { ...dir, payer: null, payee: null, sentence: null };
  }
  if (dir.direction === "settled") {
    return { ...dir, payer: null, payee: null, sentence: "No cash owed" };
  }
  const payerSeat = dir.direction === "collector-to-tp" ? "collector" : "tp";
  const payeeSeat = payerSeat === "collector" ? "tp" : "collector";
  const payer = nameOf(payerSeat);
  const payee = nameOf(payeeSeat);
  return { ...dir, payer, payee, payerSeat, payeeSeat,
    /* "You pay X" / "X pays you" — never a pronoun, never a bare sign.
       The reader is "You" at the start of a sentence and "you" inside one, so
       the payee is lowercased when it is them; otherwise it reads "pays You". */
    sentence: payer + (payer === "You" ? " pay " : " pays ")
      + (payee === "You" ? "you" : payee) };
};

/* COMPARING TWO SETTLEMENTS — presentation, not a second economic model.

   The slider could say what a move would settle AT, and not what it would DO.
   Answering that in the receipt one layer above is why the same feedback kept
   recurring: the control that needed the comparison never had it.

   The subtlety is that a signed delta only means something while the payer
   stays the same. Once a proposal crosses zero, "+$208" describes no experience
   anybody has — the money did not grow by $208, it stopped flowing one way and
   started flowing the other. A crossing is therefore a SWING, the distance to
   zero plus the distance out the far side, and never carries a sign.

   Payer semantics are untouched: every sentence still comes from settlement(). */
const compareCashSettlement = (currentSigned, proposedSigned, ctx = {}) => {
  const cur = settlement(currentSigned, ctx);
  const prop = settlement(proposedSigned, ctx);
  const a = Number(currentSigned) || 0;
  const b = Number(proposedSigned) || 0;

  const fromZero = a === 0 && b !== 0;
  const toZero = b === 0 && a !== 0;
  /* Strictly opposite sides. Zero is the crossing point, not a side. */
  const crossesZero = a !== 0 && b !== 0 && (a > 0) !== (b > 0);
  const samePayer = !crossesZero && !fromZero && !toZero && a !== 0;

  const magnitude = crossesZero ? Math.abs(a) + Math.abs(b)
    : Math.abs(Math.abs(b) - Math.abs(a));

  const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
  let label = null;
  if (a === b) label = null;                       /* nothing changed, say nothing */
  else if (fromZero) label = "New " + usd(Math.abs(b)) + " cash settlement";
  else if (toZero) label = usd(Math.abs(a)) + " reduction from current";
  else if (crossesZero) label = usd(magnitude) + " swing from current";
  else label = (Math.abs(b) > Math.abs(a) ? "+" : "-") + usd(magnitude) + " from current";

  return { current: cur, proposed: prop, samePayer, crossesZero, fromZero,
    toZero, magnitude, label, changed: a !== b };
};

const cashReceipt = (o) => {
  const calc = calculatedBalance(o);
  const final = finalBalance(o);
  return {
    calculated: cashDirection(calc),
    final: cashDirection(final),
    adjustment: (calc == null || final == null) ? null : final - calc,
    /* A PROPOSAL IS NOT YET A BALANCE — but it is a figure somebody is being
       asked to answer, and the receipt could not describe it. `adjustment`
       compares the AGREED figure to the calculated one, so while an offer is
       merely standing it is zero and any row built on it disappears. The
       receipt then showed a settled total directly beneath an unanswered
       offer, which reads as though the offer had already taken effect.

       So a standing proposal gets its own leg. Nothing is stored, and
       `adjustment` keeps its meaning: agreed and offered are different facts. */
    proposed: (() => {
      const d = o.deal || {};
      const by = dealAdjStanding(d);
      const amount = by === "tp" ? d.tpAdj : by === "collector" ? d.collectorAdj : null;
      if (by == null || amount == null) return null;
      return { by, balance: cashDirection(amount),
        delta: calc == null ? null : amount - calc };
    })(),
  };
};

/* --------------------------------------------------------- TURN OWNERSHIP

   ONE ownership truth: which actor must move. The persona-relative words
   ("Your move" / "Waiting on them") are chosen by each UI from this actor —
   they are never stored. */
const lastEntry = (t) => (t && t.length ? t[t.length - 1] : null);

/* ONE CANONICAL TURN OWNER (contract §4, Invariant 19).

   Both personas and the command layer read THIS function. There is no second
   turn engine: the Trusted Partner's labels and the Collector's wording are
   chosen from `reason`, never re-derived.

   Where both participants must confirm, the order is fixed — the partner
   first, the collector second — so there is exactly one actor at every point.
   Value Trade is per card, and a card's owner comes from cardOwner(); when
   both seats hold cards, the partner moves first, so the opportunity still
   has exactly one actor. */
function nextActor(o) {
  if (!o) return { actor: null, reason: "done" };
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
    /* TP-LED SELECTION (M3A A1) — see `selectionOf` for what each marker
       means. A hold outranks everything: while the Collector is adding cards
       the partner waits. Each send hands the Collector a fresh look, and the
       partner may only close once the Collector has said they are ready. */
    case "select-trade": {
      const sel = selectionOf(o);
      if (sel.adding) return { actor: "collector", reason: "adding-cards" };
      if (!sel.sentAt) return { actor: "partner", reason: "select-trade" };
      if (!sel.readyAt) return { actor: "collector", reason: "more-cards" };
      if (sel.closedEmptyAt) return { actor: "collector", reason: "trade-reviewed" };
      return { actor: "partner", reason: "close-selection" };
    }
    case "value-trade": {
      const owners = activeTradeCards(o).map(cardOwner);
      const tp = owners.filter((x) => x === "tp").length;
      const col = owners.filter((x) => x === "collector").length;
      if (!tp && !col) return { actor: "collector", reason: "values-settled" };
      /* Both seats hold cards: the turn stays with whoever moved last (the
         last thread entry, contract §6) while they still hold a card, so a
         seat can work through its cards in one sitting. With no ordered
         history, the partner moves first. */
      let seat = tp && !col ? "tp" : col && !tp ? "collector" : (lastValueMover(o) || "tp");
      const count = seat === "tp" ? tp : col;
      return { actor: seat === "tp" ? "partner" : "collector", reason: "value", count };
    }
    case "deal": {
      const d = o.deal || {};
      if (!d.tpAgreed) return { actor: "partner", reason: "final" };
      if (!d.collectorAgreed) return { actor: "collector", reason: "final" };
      return { actor: null, reason: "agreed" };
    }
    case "fulfillment": {
      const f = o.fulfillment || {};
      if (!f.proposedAt || f.revisionRequested) return { actor: "partner", reason: "plan" };
      if (!f.collectorConfirmedPlan) return { actor: "collector", reason: "confirm-plan" };
      if (!FULFILLMENT.handedOff(f)) return { actor: "partner", reason: "handoff" };
      if (!FULFILLMENT.received(f)) return { actor: "collector", reason: "receipt" };
      return { actor: null, reason: "done" };
    }
    default:
      return { actor: null, reason: "done" };
  }
}

/* The seat that made the most recent Value Trade move on this opportunity,
   read from the ordering stamp the command layer puts on each entry. */
function lastValueMover(o) {
  let best = null, seq = -1;
  for (const c of activeTradeCards(o)) {
    for (const e of [...(c.valueThread || []), ...(c.percentThread || [])]) {
      if (typeof e.seq === "number" && e.seq > seq) { seq = e.seq; best = e.by; }
    }
  }
  return best === "tp" || best === "collector" ? best : null;
}
const nextValueSeq = (o) => {
  let seq = 0;
  for (const c of tradeRows(o)) {
    for (const e of [...(c.valueThread || []), ...(c.percentThread || [])]) {
      if (typeof e.seq === "number" && e.seq >= seq) seq = e.seq + 1;
    }
  }
  return seq;
};

/* The seat name for a nextActor actor. `by` fields store seats ("tp" /
   "collector"); nextActor speaks "partner" / "collector". */
const seatOfActor = (actor) => (actor === "partner" ? "tp" : actor === "collector" ? "collector" : null);

/* ------------------------------------------------------------- INVARIANTS

   Enforced HERE, in the domain, so no UI entry point on either persona can
   route around them. */
/* ============================================================================
   ONE FACT, ONE FIELD — FULFILLMENT

   Two seats were storing the same two facts under different names. The Trusted
   Partner (and every canonical action) wrote `tpHandoff` / `collectorReceipt`;
   the Collector wrote `tpDone` / `collectorDone`. Worse, the two were read in
   different places: turn logic asked the raw record for `collectorDone` while
   the receipt projection asked it for `collectorReceipt`. A deal fulfilled from
   one seat could therefore read as "waiting on the collector" in the rail and
   "collector confirmed" in the receipt — the same record disagreeing with
   itself.

   `tpHandoff` / `collectorReceipt` are canonical, because they are what the
   canonical actions (confirmHandoff) already write and what the completion rule
   already tests. The names also say which fact they hold: a handoff is the
   partner giving the card over, a receipt is the collector confirming they have
   it — two events, not one boolean seen twice.

   These readers are the ONLY place the legacy names are understood. Reading a
   legacy record here keeps old and seeded data working without scattering
   `a || b` through the app; nothing writes the legacy names any more, so this
   is a migration boundary rather than a permanent dialect. A record carrying
   both is resolved by the canonical field, deterministically, since that is the
   one the canonical actions maintain. */
const FULFILLMENT = {
  handedOff: (f) => {
    if (!f) return false;
    return f.tpHandoff != null ? !!f.tpHandoff : !!f.tpDone;
  },
  received: (f) => {
    if (!f) return false;
    return f.collectorReceipt != null ? !!f.collectorReceipt : !!f.collectorDone;
  },
};


/* ============================================================================
   TRADE NEGOTIATION RULES — ONE IMPLEMENTATION, BOTH SEATS

   These were pure, actor-parameterised reducers already, but they lived inside
   the Trusted Partner's React module — so the Collector could not reach them
   and grew its own shortcuts that wrote `agreedMarket` and `agreedPercent`
   directly, with no thread history and none of the gating below. Two seats,
   two implementations, one of them silently wrong.

   Moving them here changes no rule. It puts the rule BENEATH both personas, so
   the canonical store actions can call it and neither UI has to re-state it.

   The invariants they carry, unchanged:
     - an agreed value is OUTPUT only: it is written by one side accepting the
       other's standing position, never typed in;
     - every proposal, counter and acceptance is appended to its thread;
     - market closes before percentage opens, and the partner opens percentage;
     - a re-opened deal adjustment invalidates both confirmations, because a
       newly assembled deal has not been agreed by anybody yet.
   ========================================================================== */
const marketAgreed = (tc) => tc.agreedMarket != null;

/* WHOSE MOVE ON ONE TRADE CARD — the one per-card turn rule.
   Market value: the collector opens it; after that the seat answering the
   standing proposal owns the card. Trade %: the partner opens it; then the
   same alternation. Rejected, withdrawn or settled cards have no owner. */
function cardOwner(tc) {
  if (!tc || tc.inclusion !== "accepted" || tc.withdrawn) return null;
  if (tc.agreedMarket == null) {
    if (tc.collectorMarket == null) return "collector";
    const last = (tc.valueThread || [])[(tc.valueThread || []).length - 1];
    return last && last.by === "tp" ? "collector" : "tp";
  }
  if (tc.agreedPercent == null) {
    if (tc.tpPercent == null) return "tp";
    const last = (tc.percentThread || [])[(tc.percentThread || []).length - 1];
    return last && last.by === "tp" ? "collector" : "tp";
  }
  return null;
}

/* Who made the proposal currently on the table, or null if none is. The last
   thread entry is the authority: it is the move nobody has answered yet. */
const marketStanding = (tc) => {
  if (marketAgreed(tc)) return null;
  const last = (tc.valueThread || [])[tc.valueThread.length - 1];
  return last && last.type === "propose" ? last.by : null;
};
const percentStanding = (tc) => {
  if (tc.agreedPercent != null) return null;
  const last = (tc.percentThread || [])[tc.percentThread.length - 1];
  return last && last.type === "propose" ? last.by : null;
};

/* ONE NEGOTIATION STATE, READ THE SAME WAY BY BOTH SEATS.

   Every numeric negotiation in MetYet is the same conversation: somebody puts a
   number on the table, the other answers. Rather than each screen working out
   whose move it is from raw fields — and drifting — both ask this.

   `phase` is "market" or "percent"; `viewer` is the seat asking. The answer says
   what state the negotiation is in, so the UI never has to invent one:

     locked    this phase cannot open yet
     settled   agreed; show it as context, not as a decision
     waiting   the viewer has spoken and is being answered
     theirs    a proposal is on the table for the viewer to accept or counter
     open      nobody has proposed and it is the viewer's move
     blocked   nobody has proposed and it is NOT the viewer's move
*/
const negotiationState = (tc, phase, viewer) => {
  const other = viewer === "tp" ? "collector" : "tp";
  if (phase === "percent") {
    if (!marketAgreed(tc)) return { state: "locked", standing: null, by: null };
    if (tc.agreedPercent != null) {
      return { state: "settled", standing: tc.agreedPercent, by: null };
    }
    const who = percentStanding(tc);
    if (who === viewer) return { state: "waiting", standing: viewer === "tp" ? tc.tpPercent : tc.collectorPercent, by: viewer };
    if (who === other) return { state: "theirs", standing: other === "tp" ? tc.tpPercent : tc.collectorPercent, by: other };
    /* Nobody has proposed. The partner opens this phase, so the collector waits
       rather than being offered a control that would do nothing. */
    return { state: viewer === "tp" ? "open" : "blocked", standing: null, by: null };
  }
  if (marketAgreed(tc)) return { state: "settled", standing: tc.agreedMarket, by: null };
  const who = marketStanding(tc);
  if (who === viewer) return { state: "waiting", standing: viewer === "tp" ? tc.tpMarket : tc.collectorMarket, by: viewer };
  if (who === other) return { state: "theirs", standing: other === "tp" ? tc.tpMarket : tc.collectorMarket, by: other };
  /* Nobody has proposed. The collector opens market value (cardOwner), so the
     partner waits rather than being offered a control that would be refused. */
  return { state: viewer === "tp" ? "blocked" : "open", standing: null, by: null };
};

function tcApplyMarket(tc, by, action, amount, at) {
  if (marketAgreed(tc)) return tc;                       // market is closed
  if (action === "accept") {
    const other = by === "tp" ? tc.collectorMarket : tc.tpMarket;
    if (other == null) return tc;
    return { ...tc, agreedMarket: other,
      ...(by === "tp" ? { tpMarket: other } : { collectorMarket: other }),
      valueThread: [...tc.valueThread, { by, type: "accept", amount: other, at }] };
  }
  if (!(amount > 0)) return tc;
  /* ONE TURN AT A TIME. A proposal is a move in a conversation: once yours is
     the standing one, the other person is holding it, and pressing Send again
     cannot mean anything. Without this a collector could append the same
     $2,050 to the history three times and appear to be negotiating with
     themselves. Countering a proposal THEY made is still allowed — that is the
     normal back-and-forth. */
  if (marketStanding(tc) === by) return tc;
  return { ...tc,
    ...(by === "tp" ? { tpMarket: amount } : { collectorMarket: amount }),
    valueThread: [...tc.valueThread, { by, type: "propose", amount, at }] };
}

function tcApplyPercent(tc, by, action, percent, at) {
  if (!marketAgreed(tc) || tc.agreedPercent != null || tc.withdrawn) return tc;
  if (by === "tp" && tc.tpPercent == null && action !== "propose") return tc;
  if (by === "collector" && tc.tpPercent == null) return tc;   // TP opens this phase
  if (action === "accept") {
    const other = by === "tp" ? tc.collectorPercent : tc.tpPercent;
    if (other == null) return tc;
    return { ...tc, agreedPercent: other,
      ...(by === "tp" ? { tpPercent: other } : { collectorPercent: other }),
      percentThread: [...tc.percentThread, { by, type: "accept", percent: other, at }] };
  }
  if (!(percent > 0) || percent > 1) return tc;
  if (percentStanding(tc) === by) return tc;             // same turn rule
  return { ...tc,
    ...(by === "tp" ? { tpPercent: percent } : { collectorPercent: percent }),
    percentThread: [...tc.percentThread, { by, type: "propose", percent, at }] };
}

/* Whose adjustment proposal is on the table, or null if none is. The last
   thread entry is the authority: it is the move nobody has answered yet. */
const dealAdjStanding = (deal) => {
  if (!deal || deal.agreedAdj != null) return null;
  const thread = deal.adjThread || [];
  const last = thread[thread.length - 1];
  return last && last.type === "propose" ? last.by : null;
};

function dealApplyAdj(rawDeal, by, action, amount, at) {
  /* A deal that reached this stage through closeValuation may have no thread
     yet — nobody had proposed anything. Reading one that was never created is
     what made Propose throw, and an action that throws is one that silently
     does nothing. */
  const deal = { adjThread: [], ...(rawDeal || {}) };
  if (deal.agreedAdj != null) return deal;                 // locked once agreed
  if (action === "accept") {
    const other = by === "tp" ? deal.collectorAdj : deal.tpAdj;
    if (other == null) return deal;
    return { ...deal, agreedAdj: other,
      ...(by === "tp" ? { tpAdj: other } : { collectorAdj: other }),
      adjThread: [...deal.adjThread, { by, type: "accept", amount: other, at }],
      // a newly assembled deal must be confirmed again by both sides
      tpAgreed: false, collectorAgreed: false };
  }
  /* Zero is a real settlement — "even, nobody owes" — not a missing value.
     Rejecting it made an even split the one balance you could not propose. */
  if (typeof amount !== "number" || !isFinite(amount)) return deal;
  /* ONE TURN AT A TIME, as everywhere else a number is negotiated. Without this
     a second Send silently replaced the figure the other party was already
     reading — the same defect fixed for market value and trade percentage. */
  if (dealAdjStanding(deal) === by) return deal;
  return { ...deal,
    ...(by === "tp" ? { tpAdj: amount } : { collectorAdj: amount }),
    adjThread: [...deal.adjThread, { by, type: "propose", amount, at }],
    tpAgreed: false, collectorAgreed: false };   // proposal invalidates confirmations only
}

/* THE TRADE SIDE CHANGED UNDER THE DEAL (M3A A1). A card withdrawn in Deal
   changes the calculated balance, so every figure and every confirmation given
   against the old one is about a deal that no longer exists. Rather than erase
   them, a `reset` entry is appended: the thread keeps saying exactly what was
   proposed and accepted, and everything that reads the CURRENT position
   (`dealAdjStanding`, `currentCashFigure`) reads only what came after the last
   reset. The standing figures, an agreed adjustment and both confirmations are
   cleared, and confirmation starts again with the partner. */
function dealReset(rawDeal, at, reason) {
  const deal = { adjThread: [], ...(rawDeal || {}) };
  return { ...deal, tpAdj: null, collectorAdj: null, agreedAdj: null,
    tpAgreed: false, collectorAgreed: false,
    adjThread: [...(deal.adjThread || []), { by: null, type: "reset", reason: reason || "card-withdrawn", at: at || null }] };
}

/* WITHDRAWING A CARD FROM ONE DEAL (M3A A1).

   The Collector may take one card out of one deal at any point before both
   parties have given final agreement — in Select Trade, in Value Trade when a
   proposed market value or percentage is not worth it to them, or in Deal. It
   sets a flag rather than deleting the row, because the negotiation that
   happened is still true: the card stops contributing economics but its
   history, its snapshot and every thread entry stay readable. `withdrawnStage`
   records where in the deal it happened.

   IT IS ABOUT THIS DEAL ONLY. Nothing here touches the physical copy: its
   Trade/Sell disposition is a fact about the copy, said in Browse, and leaving
   one deal is not changing your mind about parting with the card. What the
   withdrawal releases is derived — the row stops being live, so the copy stops
   being selected or reserved BY THIS DEAL (`binderRowState`).

   Only a live row can be withdrawn: one the partner selected (inclusion
   `accepted`) and nobody has withdrawn. The final-agreement bar is the
   command's, because it is a fact about the deal and not about the row. */
const liveRow = (tc) => !!tc && tc.inclusion === "accepted" && !tc.withdrawn;
const tcWithdraw = (tc, at, stage) => (liveRow(tc)
  ? { ...tc, withdrawn: true, withdrawnAt: at || null, withdrawnStage: stage || null } : tc);

/* WHAT THE PARTNER HAS SELECTED, AND WHERE SELECTION STANDS (M3A A1).

   TP-LED. The partner picks specific copies out of the Collector's Trade/Sell
   supply; the Collector never submits cards to a deal. A selection is a trade
   row with `inclusion: "accepted"` — the partner's inclusion decision, the same
   value the economics have always read — so valuation, credit, the balance and
   final agreement need no second vocabulary.

   `trade.selection` carries the few facts the turn needs and nothing else:

     sentAt         the partner has shown the Collector a selection (possibly
                    empty) — every send gives the Collector a fresh look
     adding         the Collector said "hold on, I'm adding more cards"
     readyAt        the Collector said they are ready for the partner to finish
     closedEmptyAt  the partner closed with nothing selected; the Collector now
                    chooses: hold and add more, cash only, or end the deal

   A HOLD MAY BE ASKED FOR ANY NUMBER OF TIMES, and nothing expires it. The
   Collector adds cards only through Browse, by offering a copy, which puts it in
   every connected partner's supply; there is no per-deal offering list.

   SELECTION CLOSES ONLY BY A DECISION. There is no automatic move to Value
   Trade and no automatic cash purchase: `closeTradeSelection` is the partner
   saying "value these", and choosing cash is the Collector saying so. The old
   `closeSelection` turned "everything was declined" into a cash deal, which is
   a decision nobody made — it is gone. */
const selectionOf = (o) => (o && o.trade && o.trade.selection) || {};

/* RETURNING TO SELECT TRADE WHEN THE LAST CARD LEAVES. Valuation with nothing
   to value, or a Deal whose trade side has emptied, has no honest next move, so
   the deal goes back to the stage where one exists: the partner may select
   again, the Collector may hold, choose cash only, or end the deal. The
   selection markers start over; every row, thread and the deal's adjustment
   history stay exactly as they were. */
const reopenSelection = (o, at) => ({ ...o, stage: "select-trade",
  trade: { ...(o.trade || {}), selection: { reopenedAt: at || null } } });

/* WHEN VALUATION IS OVER. Every card still in the trade has an agreed market
   value AND an agreed percentage, and at least one of them survived to carry
   economics. If every card was withdrawn the deal deliberately WAITS here for an
   explicit collector decision rather than silently becoming a cash purchase —
   choosing to buy outright is a decision somebody makes, not a default.

   Same story as closeSelection: the rule existed, but only inside the Trusted
   Partner's module, so a valuation settled through the canonical actions left
   the deal sitting in Value Trade with nothing left to negotiate. */
const valueTradeSettled = (o) => {
  const active = activeTradeCards(o);
  return acceptedRows(o).length > 0 && active.every(cardSettled);
};

const closeValuation = (o) => {
  if (o.stage !== "value-trade" || isTerminal(o)) return o;
  if (!(valueTradeSettled(o) && activeTradeCards(o).filter(cardSettled).length > 0)) return o;
  /* Arriving at Deal means arriving with somewhere to negotiate the balance. */
  return { ...o, stage: "deal", deal: { adjThread: [], ...(o.deal || {}) } };
};

/* Rows still IN the trade: selected by the partner and not withdrawn. Deselected
   and withdrawn rows keep their history but are out. (Before M3A A1 a row the
   Collector had proposed and the partner had not yet decided was live too; the
   Collector no longer proposes, so there is no undecided row.) */
const liveTradeRows = (o) => tradeRows(o).filter(liveRow);

const TRADE = { applyMarket: tcApplyMarket, liveTradeRows, liveRow, cardOwner,
  selectionOf, reopenSelection,
  valueTradeSettled, closeValuation, applyPercent: tcApplyPercent,
  applyDealAdjustment: dealApplyAdj, dealAdjStanding, dealReset, withdraw: tcWithdraw, marketAgreed,
  marketStanding, percentStanding, negotiationState };

const INVARIANTS = {
  /* A collector may pursue one structured negotiation per goal at a time.
     Alternatives stay visible and reachable — only the offer is limited. */
  /* THE COLLECTOR'S BOUNDARY. Per GOAL, and it begins at the first submitted
     offer — not at reviewing, asking for photos, or chatting. Those are how you
     find out whether you want the card; this is where you commit to buying one. */
  oneNegotiationPerGoal: (goalId, opps) => activeOppForGoal(goalId, opps) == null,

  /* AND PER EXACT CARD (Market Validation, Batch 2). One active outbound offer
     per Collector per exact card, whichever partner holds it and whether or not
     a Goal began it — the rule a Goal-free offer will need, stated without
     reference to a Goal. Same window as the Goal rule (negotiating, not ended,
     not completed), so a completed purchase frees it for the next copy. A deal
     whose copy went to somebody else is ENDED by that event (M3A A1), so it
     frees the slot by being over, not by an exception here. `sameCard(o)`
     answers whether `o` is about this card. */
  oneActiveOfferPerCard: (collectorId, sameCard, opps) => !(opps || []).some((o) =>
    o.collectorId === collectorId && isNegotiating(o) && sameCard(o)),

  /* THE PARTNER'S BOUNDARY, and deliberately a different one.

     A partner is not committed merely because somebody has offered — several
     collectors may be talking to them about the same card at once, and that is
     healthy.

     WHERE THIS BOUNDARY USED TO BE, AND WHY IT MOVED (Option B). It used to be
     `agreedPrice != null`: settling a market value committed the copy. That
     read a valuation as a promise. Agreeing what a card is WORTH is a shared
     fact about the card, and two collectors can hold it at once without either
     of them being owed anything — which is the whole of "agreement about
     information is not agreement to transact". So the boundary is now the one
     moment both parties say yes to the assembled deal: `finalAgreementGiven`.

     THE LOCK IS PER PHYSICAL COPY, so a partner may commit different copies to
     different collectors at once, and it releases when the deal ends, because
     an ended deal holds nothing.

     WHAT THIS IS NOT. It is not the mutation guard. `copyInLiveDeal` below is
     deliberately wider and still keys on a settled price — see its comment. */
  copyCommittedTo: (invId, opps, exceptOppId) => (invId == null ? null
    : (opps || []).find((o) => o.invId === invId && o.id !== exceptOppId
      && isActive(o) && finalAgreementGiven(o)) || null),

  /* THE PARTNER'S OTHER BOUNDARY — WIDER, AND FOR A DIFFERENT PURPOSE.

     Two questions look alike and are not the same:

       "may another collector still pursue this copy?"   availability
       "may the partner still CHANGE this copy?"         mutation safety

     Availability moved to final agreement. Mutation safety must not, and this
     predicate exists so that moving one did not silently move the other. From
     the moment a market value is settled, a collector is reasoning about THIS
     physical card — assembling a trade package against its certificate, pricing
     around its grade. Letting the partner re-certify it or archive it out from
     under that is a different kind of harm from letting somebody else pursue
     it, and the older, wider window is the right one for it.

     So: `updateInventoryCopy` and `removeInventoryCopy` ask this; nothing about
     who may pursue the copy does. */
  copyInLiveDeal: (invId, opps) => (invId == null ? null
    : (opps || []).find((o) => o.invId === invId
      && isActive(o) && o.agreedPrice != null) || null),

  /* PENDING — THE ONE AVAILABILITY FACT A PARTNER CHOOSES (Option B).

     Everything else about a copy's availability is derived from what has
     happened to it. This is derived from what the partner DECIDED: they are
     working toward a transaction on this exact card and would rather not start
     another conversation about it. It names the opportunity, because "pending"
     with nobody attached cannot tell the collector on the other side of that
     deal that it is pending for THEM.

     STALE BY CONSTRUCTION, AND THAT IS THE POINT. The field may outlive the
     opportunity it names — a cancelled deal leaves it dangling. Rather than
     sweep, this asks whether the named opportunity is still active, so a
     forgotten `pendingFor` reads as available on its own. There is nothing to
     clean up and nothing that can rot.

     VIEWER-RELATIVE FOR FREE. `opps` is whatever the caller is asking about:
     hand it one collector's own opportunities and a copy pending for somebody
     else's deal simply is not pending to them. That is how the projection tells
     "pending for your deal" from "unavailable" without a second rule. */
  copyPendingFor: (invId, inventory, opps) => {
    if (invId == null) return null;
    const copy = (inventory || []).find((i) => i.invId === invId);
    /* An archived copy is nobody's to be pending FOR. Without this the derived
       status contradicted the command layer outright: a copy pended before any
       price was settled is still archivable (removeInventoryCopy keys on
       copyInLiveDeal), and both seats were then shown "Pending" — "Pending for
       your deal" to the collector — for a copy every command answers
       copy-unavailable about. Falling through leaves it `available` here, which
       the projection renders `unavailable` via inSupply, as it did before. */
    if (!copy || copy.archived) return null;
    const oppId = typeof copy.pendingFor === "string" ? copy.pendingFor : null;
    if (!oppId) return null;
    const held = (opps || []).find((o) => o.id === oppId && o.invId === invId && isActive(o));
    return held ? held.id : null;
  },
  /* WHEN A PHYSICAL COPY CAN BE EVALUATED. A stock image identifies the CARD;
     actual front and back photos identify the SPECIFIC PHYSICAL COPY, and what
     a copy is worth depends on the condition of that copy — so a copy is ready
     to be negotiated over only once both of its faces exist. One face is not
     enough.

     ONE PREDICATE, NOT TWO (C2). `binderCopyPhotographed` and `copyPhotographed`
     were the same expression under two names, one per seat, which is how a rule
     starts drifting from itself. The standard does not depend on who owns the
     card, so neither does the predicate. */
  copyPhotographed: (photos) => !!(photos && photos.front && photos.back),
  /* An Opportunity is evidence of active pursuit. A Secondary goal is a
     watchlist entry — the collector is looking, not chasing — so a deal cannot
     begin against one. Promotion to Primary is the collector's own statement
     that this has become something they are actively pursuing. */
  goalIsPursued: (goalId, goals) => {
    const g = goals.find((x) => x.id === goalId);
    return !!g && g.tier === "primary";
  },
};

/* Why an Opportunity could not be created. Presentation layers read this to
   offer the right next step rather than dead-ending the person. */
const REFUSE = {
  noGoal: "no-goal",
  notPrimary: "goal-not-primary",
  alreadyNegotiating: "already-negotiating",
  /* Kept for callers that still speak it, but the domain no longer refuses an
     offer for want of photos — seeing the card is encouraged, not enforced. */
  photosNeeded: "photos-needed",
  copyUnavailable: "copy-unavailable",
  /* The copy is spoken for. Deliberately says nothing about who, or for how
     much — a blocked collector learns the card is unavailable, not who beat
     them to it or what they paid. */
  copyCommitted: "copy-committed",
  /* Cash-only and a live trade card are contradictory intents. */
  tradeCardsSelected: "trade-cards-selected",
  /* A copy's card identity cannot change; that would be a different object. */
  identityImmutable: "identity-immutable",
  /* Both faces, or the copy does not exist. */
  photosRequired: "photos-required",
  invalidAmount: "invalid-amount",
  /* A GOAL IS PRIMARY OR SECONDARY, AND THE COLLECTOR CHOOSES WHICH.

     The writers used to take anything that was not the string "primary" and
     write "secondary" — so `undefined`, `""`, `"Primary"` and `"banana"` all
     demoted a Goal, with a 200 and no way for the caller to know. Tier is not a
     field with a sensible default; it is the whole difference between "I am
     hunting this" and "I am keeping an eye out", and it is the one thing
     `startOpportunity` asks about the Collector's own intent before letting a
     deal begin — `goalIsPursued`, which is `tier === "primary"`.

     Named for `invalid-amount`, which answers the same shape of question about
     a number: the request named something the domain has no value for. */
  invalidTier: "invalid-tier",
  /* A COPY IS KEPT OR IT IS ON OFFER, AND ITS OWNER CHOOSES WHICH.

     `disposition-conflict` below answers the opposite failure — both at once.
     This one answers silence, and the three shapes silence used to take:
     neither flag set, a flag set to something that is not a boolean, and
     `false`, which is how the product used to say "I take it back".

     WHY `false` IS NOW A REFUSAL AND NOT A WITHDRAWAL. A copy that says
     nothing is a copy MetYet cannot act on: it is barred from a trade package
     and it never reaches a partner, so "I take it back" made the copy
     invisible without telling anybody that is what it did. Changing one's mind
     about a copy means choosing the other answer, and both setters already
     clear each other in one step, so nothing is lost.

     Named for `invalid-tier`, and through it for `invalid-amount`: the request
     named something the domain has no value for. Copies recorded before this
     rule keep their silence — it is a real state they are really in, and
     `copyDisposition` still reports it as `unstated`. What ends is the ability
     to create another one. */
  invalidDisposition: "invalid-disposition",
  /* A MEMBERSHIP IS THE HOME OF ONE THING.

     A Binder holds a Goal or a CollectorCopy — the two objects a Collector can
     act on — and `fileObject` must be told which. Naming both is a
     contradiction, naming neither is silence, a non-string is unreadable and a
     blank is none of them wearing an id's clothes. They fail at the same thing:
     the request did not name exactly one object, so there is nothing to file.

     `validateWorld` distinguishes `ref.ambiguous` from `ref.missing` for the
     five records that name their card one of two ways, and that distinction is
     right where it lives — it describes a stored world to a reader. A refusal
     answers a caller about their payload, and this vocabulary has gone the
     other way twice already: `invalid-tier` and `invalid-disposition` each
     cover absence, garbage and wrong shape with one code, because a caller
     looking for what to fix finds it in the same place either way. */
  invalidTarget: "invalid-target",
  /* A PRICING PREFERENCE IS YES OR NO (Market Validation, Batch 1). A Trusted
     Partner's copy is Open to Offers unless the partner says it is Firm on
     Price, and `firmOnPrice` is that answer — `true` or `false`, never "yes",
     1 or null, which would be a preference nobody can read the same way twice. */
  invalidPricingPreference: "invalid-pricing-preference",
  /* FIRM ON PRICE HOLDS AT THE OPENING (Market Validation, Batch 2). A copy the
     partner marked Firm on Price can only be opened at the Proposed Market
     Price captured when the offer is made. The partner may still counter later;
     this governs only how a Collector begins. */
  firmOnPrice: "firm-on-price",
  /* A BINDER THAT HAS BEEN PUT AWAY TAKES NOTHING NEW.

     Archiving does not unfile what a binder holds and does not change any
     object's state — `setBinderArchived` touches one timestamp and says so. But
     a shelf somebody has put away is not where a new thing goes, and the panel
     has filtered archived binders out of the picker since C3.4. This is the
     domain saying no for its own reasons, which is the same argument the blank
     card id in `addBinderEntry` was given.

     Unfiling is still allowed, deliberately: a Collector must always be able to
     take a thing out of a binder, including out of one they have put away. */
  binderArchived: "binder-archived",
  /* Command-layer refusals (Phase 1). Deliberately terse: a refusal names the
     rule, never another collector, deal or price. */
  unknownActor: "unknown-actor",
  unknownCommand: "unknown-command",
  notFound: "not-found",
  notParticipant: "not-participant",
  notOwner: "not-owner",
  noRelationship: "no-relationship",
  wrongStage: "wrong-stage",
  terminal: "terminal",
  /* A deal message (Milestone 2D.1): nothing to say, too much to say, no
     nonce to recognise a retry by, and a nonce already used by this sender
     on this deal for different words. */
  messageEmpty: "message-empty",
  messageTooLong: "message-too-long",
  nonceRequired: "nonce-required",
  nonceConflict: "nonce-conflict",
  notYourTurn: "not-your-turn",
  goalLocked: "goal-locked",
  duplicateGoal: "duplicate-goal",
  identityMismatch: "identity-mismatch",
  /* The copy is this card, and it is available — but it is not the one this
     Goal asked for. Distinct from identity-mismatch on purpose: the same card
     in a grade the Collector did not ask for is a different answer from the
     wrong card, and only the first is worth telling them about. It discloses
     nothing private: both halves are the Collector's own criteria and the
     copy's own publicly projected facts. */
  criteriaMismatch: "criteria-mismatch",
  copyReserved: "copy-reserved",
  copyInUse: "copy-in-use",
  copySold: "copy-sold",
  /* THE PARTNER IS WORKING ON THIS ONE (Option B). Distinct from
     `copy-committed`, which says two parties have agreed a deal, and from
     `copy-sold`, which says the card is gone: this says a person decided, and a
     person can undecide. A surface may say so without naming the other deal. */
  copyPending: "copy-pending",
  reasonRequired: "reason-required",
  planIncomplete: "plan-incomplete",
  nothingToAccept: "nothing-to-accept",
  alreadySubmitted: "already-submitted",
  /* Registration (Phase 3 Batch 5). The one authoring path whose authority is a
     redeemed invitation rather than an existing actor — see
     metyet-registration.js. Terse for the same reason as the rest: a refusal
     names the rule and nothing about who else is registered. */
  nameRequired: "name-required",
  /* ONE REFUSAL FOR AN UNSAYABLE GRADING PAIR (Phase 5 C3.2). Distinct from
     `not-found`, which is what the four separate half-checks used to answer and
     which told a caller nothing about what was wrong. See gradingProblem. */
  gradingIncoherent: "grading-incoherent",
  /* A PHOTOGRAPH REFERENCE THAT IS NOT ONE. Added by photo fulfilment, and the
     reason is worth keeping: the first attempt at this COERCED a malformed face
     to null instead, which turned `front: {}` from "junk masquerading as
     evidence" into "junk silently deleting evidence" — a shop's only record of
     a card's condition erased on a 200. Refusing is the only honest answer to
     input nobody can store. It is a refusal code, not a durable fact: nothing
     is written, no lifecycle gains a state, and no migration follows. */
  photoUnusable: "photo-unusable",
  /* A COPY CANNOT BE BOTH ON OFFER AND BEING KEPT. Two positive statements about
     one physical object that contradict each other; the domain refuses the pair
     rather than deciding which one the person meant. */
  dispositionConflict: "disposition-conflict",
  /* ONLY A COPY ITS OWNER HAS OFFERED MAY GO INTO A TRADE PACKAGE.

     A package is the moment a Collector's own property is put on a shared
     record and reserved, so the question "would you part with this one" has to
     have been answered YES before it can be asked of a shop. Two copies are
     refused here: one the owner is KEEPING, which is the opposite answer; and
     one nobody has said anything about, which is no answer at all — and
     silence is not consent to trade a card.

     WHY A REFUSAL OF ITS OWN rather than `copy-unavailable`. Unavailable means
     the product cannot use the copy — archived, reserved, sold. This copy is
     perfectly usable and its owner has simply not offered it, which is a
     sentence a person can act on ("offer it, then add it") rather than a dead
     end. Nothing leaks: the only actor who can reach this refusal is the copy's
     own owner. */
  copyNotOffered: "copy-not-offered",
  /* M3A A1. `copy-in-deal`: a partner has selected this copy (or a deal holds
     it), so the facts that say what the object is — grade, condition,
     certificate, existing photographs — cannot be restated, and it cannot be
     switched to PC, until every deal has let it go. The owner is the only actor
     who can reach it. `terms-changed`: the caller acted on a deal state that is
     no longer the current one (a card was withdrawn, a figure moved); nothing
     was written, and the answer is to re-read. `superseded`: the command
     belongs to the retired Collector-proposes selection workflow. */
  copyInDeal: "copy-in-deal",
  termsChanged: "terms-changed",
  commandRetired: "superseded",
  /* A GOAL THAT NAMES A CANONICAL CARD SAYS WHICH COPY IT WANTS (Phase 5 C3.3).
     Distinct from `grading-incoherent`, which answers a pair that cannot be
     true: this answers a pair that was never stated. C3.2 deliberately left
     criteria optional, because the only surface that could create a Goal sent
     none and requiring them would have broken the shipped product's primary
     action; C3.3 ships the control that states them, so the requirement lands
     with the means to satisfy it. It is scoped to the canonical path — the
     legacy `cardId` path is the prototype's and keeps its own answer. */
  criteriaRequired: "criteria-required",
  /* CHANGING WHAT A CARD MEANS (P6-F4 Batch 5): `changeCollectingState`.
     `state-changed` — the screen asked from a state the record is no longer
     in; nothing is guessed, the Collector chooses again on the latest.
     `partner-interest` — a Trusted Partner has said they are interested in
     this copy; it is never turned into a Goal underneath them.
     `state-change-unsupported` — a legacy record with no canonical printing.
     `lineage-full` — the record's history is full; nothing is ever dropped
     from it to make room. `invalid-state` — not one of the four. */
  stateChanged: "state-changed",
  partnerInterest: "partner-interest",
  stateChangeUnsupported: "state-change-unsupported",
  lineageFull: "lineage-full",
  invalidState: "invalid-state",
  invitationRequired: "invitation-required",
  alreadyRegistered: "already-registered",
  /* Redemption (Phase 5 Batch 3A). ONE WORD FOR SIX CAUSES, on purpose: an
     invitation that never existed, one that expired, one withdrawn, one already
     accepted, and a credential spent by somebody else all answer the same. A
     refusal that distinguished them would let anybody with a list of guesses
     learn which invitations are real. */
  invitationUnusable: "invitation-unusable",
};

module.exports = {
  FULFILLMENT, TRADE, cashDirection, cashReceipt, settlement, compareCashSettlement, newSince, unreadFor,
  identityKey, isRaw, sameIdentity,
  INVITATION_DAYS, invitationExpiry, invitationOpen,
  STAGES, STAGE_IX, STAGE_LABEL,
  isEnded, isCompleted, isTerminal, isActive, isNegotiating, priceUnresolved,
  activeOppForGoal, goalState, priceProposal, wholeDollarPrice,
  acceptedTradeCards, cardSettled, tradeValueOf, tradeValueAt, totalTradeValue,
  calculatedBalance, finalBalance,
  lastEntry, nextActor, seatOfActor, cardOwner, nextValueSeq,
  INVARIANTS, REFUSE,
};

/* ------------------------------------------------------- CARD IDENTITY SEARCH

   How MetYet decides WHICH card someone means. Shared, because the answer must
   not depend on who is asking: a Trusted Partner adding an inventory copy and a
   collector stating a goal are describing the same thing, and must describe it
   the same way.

   The persona changes what happens AFTER a card is chosen. It must not change
   how the card is defined. */

/* THE TWO THINGS A GOAL CAN BE, AS A CLOSED LIST.

   `validateWorld` has required a stored tier to be exactly one of these two
   since the world validator was written. The writers did not: they took
   anything that was not the string "primary" and wrote "secondary", so a
   fumbled field demoted a Goal with a 200. This is the list they read now.

   IT IS THE SECOND COPY OF THAT LIST, AND THAT IS A COMPROMISE, NOT A DESIGN.
   `metyet-world.js` declares its own `GOAL_TIERS`. It could read this one —
   it already imports this module — but the batch that added this constant was
   not allowed to touch the validator, so instead a test reads the validator's
   literal out of its source and fails the moment the two disagree. Single-
   sourcing it is one line, and belongs to a batch that may edit that file. */
const GOAL_TIERS = Object.freeze(["primary", "secondary"]);

const GRADED_VALUES = ["Raw", "PSA 1", "PSA 2", "PSA 3", "PSA 4", "PSA 5",
  "PSA 6", "PSA 7", "PSA 8", "PSA 9", "PSA 10"];
const CONDITION_VALUES = ["Near Mint", "Lightly Played", "Moderately Played",
  "Heavily Played", "Damaged"];

/* ---------------------------------------------- READING A COPY'S CONDITION
   (Phase 5 C2)

   `grade` is STORED as a string — "Raw", or a grading label like "PSA 9" — and
   C2 did not change that. What it changed is that there is now ONE place that
   decides what such a string MEANS, instead of the decision being made again
   in each presenter with its own regex.

   THE STORED SHAPE IS NOT THE CONCEPTUAL SHAPE, and this function is the seam
   between them. Conceptually a copy is:

       raw     → grading state `raw`, a `condition`, no grader and no number
       graded  → grading state `graded`, a `grader`, a numeric `grade`,
                 and no raw condition

   That is what comes back here, parsed out of the string, from whichever seat
   is asking — a partner's inventory copy and a Collector's own copy are the
   same kind of object, so they read the same way.

   WHY THE STRING STAYS, FOR NOW. Splitting the storage into `gradingState`,
   `grader` and a numeric `grade` would touch every inventory row already
   written, both `attrs` blobs, the prototype's card picker, the identity
   vocabulary in `identityFrom`, and both presenters — a migration of live data
   in a batch whose subject is ownership. The C2 report states that tradeoff.
   What this gives instead is the thing that makes the migration cheap when it
   comes: one reader to change, and a grading company that appears in exactly
   one regex rather than in four files. Nothing outside this function should
   ever test a grade string against /psa/i again.

   IT IS NOT PART OF CARD IDENTITY. A grade describes THIS physical copy, not
   which card it is — Batch 5 moved it off identity and C2 does not move it
   back. `grader` is deliberately not a canonical-card dimension. */
const GRADE_LABEL = /^([A-Za-z]{2,4})\s*([0-9]{1,2}(?:\.[05])?)$/;
const gradingOf = (copy) => {
  const grade = typeof (copy && copy.grade) === "string" ? copy.grade.trim() : "";
  const condition = typeof (copy && copy.condition) === "string" ? copy.condition.trim() : "";
  if (grade && !/^raw$/i.test(grade)) {
    const m = GRADE_LABEL.exec(grade);
    return { state: "graded", grader: m ? m[1].toUpperCase() : null,
      grade: m ? Number(m[2]) : null, condition: null, label: grade };
  }
  /* "Raw" stated, or nothing stated at all: those are different answers and
     stay different. A copy nobody has described is not a raw copy. */
  if (/^raw$/i.test(grade)) {
    return { state: "raw", grader: null, grade: null, condition: condition || null,
      label: condition ? `Raw · ${condition}` : "Raw" };
  }
  return { state: "unstated", grader: null, grade: null, condition: condition || null,
    label: condition || null };
};

/* ------------------------------- WHETHER A GRADING PAIR IS SAYABLE (C3.2)

   `gradingOf` says what a record MEANS. This says whether it means anything at
   all — and it is the ONE rule every write path asks. Before C3.2 each command
   asked half of it separately (is this grade in the list, is this condition in
   the list) and nobody asked the half that matters:

       grade: "PSA 9", condition: "Damaged"

   That passed every check, persisted, and then `gradingOf` read it as graded
   with `condition: null`. The card was recorded as two contradictory things and
   the product quietly showed one of them. A grading company does not assess a
   card and leave it damaged-but-also-a-nine; one of those sentences is false,
   and the database could not say which.

   THE GRAMMAR, ENTIRE:

       Raw          requires a condition — "raw" alone says the card is
                    ungraded and nothing about what state it is in, which is
                    half a sentence.
       PSA 1..10    carries NO raw condition — the grade is the assessment, and
                    a second, contradicting one is not a refinement of it.
       neither      is fine. "Unstated" is a real answer and always has been:
                    a copy nobody has described yet is not a raw copy.

   Returns null when the pair is sayable, or a reason. Callers refuse on a
   reason; nothing interprets one. */
const GRADING_PROBLEM = Object.freeze({
  grade: "grade-unknown",
  condition: "condition-unknown",
  rawNeedsCondition: "raw-needs-condition",
  gradedHasCondition: "graded-has-condition",
});
const stated = (v) => (typeof v === "string" ? v.trim() : "");
const gradingProblem = (facts) => {
  const grade = stated(facts && facts.grade);
  const condition = stated(facts && facts.condition);
  if (grade && !GRADED_VALUES.includes(grade)) return GRADING_PROBLEM.grade;
  if (condition && !CONDITION_VALUES.includes(condition)) return GRADING_PROBLEM.condition;
  if (/^raw$/i.test(grade) && !condition) return GRADING_PROBLEM.rawNeedsCondition;
  if (grade && !/^raw$/i.test(grade) && condition) return GRADING_PROBLEM.gradedHasCondition;
  return null;
};

/* AND WHAT TO DO ABOUT A RECORD THAT ALREADY SAYS SOMETHING IMPOSSIBLE.

   Rows written before C3.2 may carry a contradictory pair, because the door was
   open. They cannot be repaired — "PSA 9 / Damaged" does not say which half the
   person meant, and guessing would be MetYet inventing a fact about somebody
   else's card. They also must not make a world unloadable, or one bad row from
   last month would lock a Collector out of everything.

   So they load, and `gradingOf` REPORTS the contradiction instead of hiding it:
   `problem` carries the reason and `condition` survives rather than being
   silently dropped. A presenter can then say "PSA 9 — this record also says
   Damaged" rather than picking a side on the product's behalf. That is the
   invariant C3.2 is really about: durable data is validated by one rule, and
   presentation may not silently reinterpret a contradictory fact. */
const gradingRead = (copy) => {
  const base = gradingOf(copy);
  const problem = gradingProblem(copy);
  if (!problem) return { ...base, problem: null };
  return { ...base, problem, condition: stated(copy && copy.condition) || base.condition };
};

/* DOES THIS PHYSICAL COPY SATISFY WHAT THE COLLECTOR ACTUALLY SAID?

   One rule, and it is deliberately the narrowest one that can be stated:

     a criterion the Collector STATED     the copy must match it exactly
     a criterion they did NOT state       imposes nothing

   THIS REVERSES A PRIOR DECISION, AND THE REASON IS WORTH KEEPING. Criteria
   used to be context only — a Goal for a Raw card surfaced a PSA 8, on the
   reading that a person might still want to hear about it. That reading makes
   MetYet guess. A Collector who chose "Raw / Near Mint" from a closed list
   chose it; presenting a PSA 8 as an answer to it is the product inventing a
   preference nobody expressed. Criteria now constrain Discovery because they
   are criteria the Collector explicitly selected.

   WHAT THIS IS NOT, AND MUST NEVER QUIETLY BECOME. There is no band, no floor,
   no "or better", no ordering. `GRADED_VALUES` and `CONDITION_VALUES` are read
   with `includes` everywhere in this repository and never with an index
   comparison — the vocabularies are a closed set of names, not a scale. A
   Collector wanting PSA 9 is not assumed to accept PSA 10, because nobody asked
   them and a higher number is not obviously better to somebody completing a set
   at a grade. Ranges, multiple acceptable values and ranked preferences are a
   preference LANGUAGE; if the pilot shows people want one, it gets designed,
   not inferred here.

   UNSTATED IS UNRESTRICTED, WHICH IS NOT THE SAME AS MATCHING NOTHING. A Goal
   that names a grade and no condition restricts grade alone. A Goal that names
   neither restricts nothing and behaves exactly as it did before this batch.
   Absence is absence — the one thing this file already refuses to read as a
   statement. (A legacy `cardId` Goal that DOES state criteria is constrained
   like any other at the command boundary, though Discovery never reaches it:
   `isDemand` has required a canonical card since B8.)

   One consequence falls out of the existing grading rule rather than out of
   this one: a Goal stating only a condition will not match a COHERENT PSA copy,
   because `gradingProblem` forbids a graded copy from carrying a condition at
   all, so its condition is blank and blank is not "Near Mint". That is the
   existing vocabulary being coherent, not a rule added here.

   A ROW WRITTEN BEFORE C3.2 CAN STILL CARRY BOTH, and such a copy DOES match a
   condition-only Goal. That is deliberate rather than overlooked: those rows
   cannot be repaired — "PSA 9 / Damaged" does not say which half the person
   meant — and reading past the condition they actually recorded would be this
   file guessing, which is the thing it exists to refuse. The copy renders with
   its conflict note, so the contradiction is shown rather than hidden. */
const meetsGoalCriteria = (desired, copy) => {
  const wantGrade = stated(desired && desired.grade);
  const wantCondition = stated(desired && desired.condition);
  if (wantGrade && stated(copy && copy.grade) !== wantGrade) return false;
  if (wantCondition && stated(copy && copy.condition) !== wantCondition) return false;
  return true;
};

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

module.exports.GOAL_TIERS = GOAL_TIERS;
module.exports.GRADED_VALUES = GRADED_VALUES;
module.exports.CONDITION_VALUES = CONDITION_VALUES;
module.exports.gradingOf = gradingOf;
module.exports.gradingProblem = gradingProblem;
module.exports.gradingRead = gradingRead;
module.exports.GRADING_PROBLEM = GRADING_PROBLEM;
module.exports.searchCards = searchCards;
module.exports.printKey = printKey;
module.exports.printedCards = printedCards;
module.exports.identityGaps = identityGaps;
module.exports.identityFrom = identityFrom;

/* ------------------------------------------------------- THE DEAL RECEIPT

   A deal fills itself in as it advances. Each stage establishes particular
   terms, and until a stage is reached its terms are genuinely undecided — so
   the receipt shows them blank rather than hiding the row.

   THE GATING RULE: a stage's values are readable only once the opportunity has
   reached that stage. Seed data and object shape routinely carry later-stage
   fields already; showing them early would tell the collector something has
   been agreed when it has not. This is a projection, never a mutation — nothing
   here deletes or writes anything.

   Reconciliation is guaranteed by construction: every number comes from the
   same helpers the Opportunity workspace uses. */

/* THE NEGOTIATION stages: what a deal settles, one at a time. Five, unchanged —
   this is what "N of 5 settled" counts, and what opportunity.stage may hold. */
const RECEIPT_STAGES = ["agree-price", "select-trade", "value-trade", "deal", "fulfillment"];

/* THE PURSUIT, as the collector experiences it. Reviewing a specific copy is
   the beginning of chasing it, so it belongs on the same rail — but it is NOT a
   negotiation stage and is never written to opportunity.stage.

   Keeping the two lists apart is the whole point. An Opportunity carries a
   priceThread whose first entry is an offer; manufacturing one so that a photo
   request could "be" a stage would put a financial statement in the collector's
   mouth that they never made. So Review Card is derived from the photo request
   that already exists, and only steps 2-6 correspond to a real deal. */
const PURSUIT_STEPS = [
  { id: "review-card", label: "Review Card", negotiation: false },
  ...RECEIPT_STAGES.map((id) => ({ id, label: STAGE_LABEL[id], negotiation: true })),
];

function receiptForOpportunity(o, { binderById, cardById, partnerById } = {}) {
  if (!o) return null;
  const at = RECEIPT_STAGES.indexOf(o.stage);
  /* A completed opportunity has passed every stage. */
  const reached = (i) => (isCompleted(o) ? true : at >= i);
  const state = (i) => (isCompleted(o) ? "done"
    : at > i ? "done" : at === i ? "current" : "pending");
  const partner = partnerById ? partnerById(o.partnerId) : null;
  const accepted = acceptedTradeCards(o);

  const card = (tc) => {
    const b = binderById ? binderById(tc.binderId) : null;
    const c = b && cardById ? cardById(b.cardId) : null;
    return {
      binderId: tc.binderId,
      name: c ? c.name : tc.binderId,
      /* Value terms belong to stage 3; blank until it is reached. */
      agreedMarket: reached(2) ? tc.agreedMarket : null,
      agreedPercent: reached(2) ? tc.agreedPercent : null,
      tradeValue: reached(2) ? tradeValueOf(tc) : null,
    };
  };

  return {
    stage: o.stage,
    stageIndex: at,
    complete: isCompleted(o),
    stages: [
      { n: 1, id: "agree-price", label: "Agree on Price", state: state(0),
        partner: partner ? partner.name : null,
        /* The price is only established once both sides agree it. */
        price: reached(0) ? o.agreedPrice : null,
        listed: reached(0) ? o.listedPrice : null },

      { n: 2, id: "select-trade", label: "Select Trade", state: state(1),
        /* Which copies are included — no values here, by design. */
        cards: reached(1) ? accepted.map((tc) => ({
          binderId: tc.binderId,
          name: card(tc).name,
        })) : [],
        submitted: reached(1) ? !!(o.trade && (o.trade.submitted || selectionOf(o).sentAt)) : false },

      { n: 3, id: "value-trade", label: "Value Trade", state: state(2),
        cards: reached(2) ? accepted.map(card) : [],
        total: reached(2) ? totalTradeValue(o) : null },

      { n: 4, id: "deal", label: "Deal", state: state(3),
        calculated: reached(3) ? calculatedBalance(o) : null,
        /* A final negotiated figure, only when one was actually agreed. */
        finalAdj: reached(3) && o.deal ? o.deal.agreedAdj : null,
        balance: reached(3) ? finalBalance(o) : null },

      { n: 5, id: "fulfillment", label: "Fulfillment", state: state(4),
        method: reached(4) ? (o.fulfillment && o.fulfillment.method) || null : null,
        date: reached(4) ? (o.fulfillment && o.fulfillment.date) || null : null,
        time: reached(4) ? (o.fulfillment && o.fulfillment.time) || null : null,
        location: reached(4) ? (o.fulfillment && o.fulfillment.location) || null : null,
        /* Output names belong to the receipt's vocabulary; the FACTS come from
           the one canonical reader, so this can never disagree with the rail. */
        collectorDone: reached(4) ? FULFILLMENT.received(o.fulfillment) : false,
        partnerDone: reached(4) ? FULFILLMENT.handedOff(o.fulfillment) : false },
    ],
  };
}

module.exports.RECEIPT_STAGES = RECEIPT_STAGES;
module.exports.PURSUIT_STEPS = PURSUIT_STEPS;
module.exports.receiptForOpportunity = receiptForOpportunity;

/* ---------------------------------------------------------- CONVERSATIONS

   ONE THREAD PER COLLECTOR + TRUSTED PARTNER + CARD IDENTITY.

   A Conversation is *between* a Collector and a Trusted Partner (contract §1,
   visibility "participants only"). The partner is therefore part of the
   identity, not a passenger on it. Keying on collector + card alone merged
   every partner holding that identity into one shared thread, which both broke
   the privacy boundary and made the partner-scoped projections dead filters.

   The key still deliberately excludes goal and opportunity, so a single
   conversation survives Secondary -> Primary promotion and is inherited by the
   Opportunity when a deal begins: "one conversation, all stages" — now scoped
   to the collector-partner-card relationship it actually belongs to.

   Entries interleave chronologically and are of two kinds:
     { kind: "message", by: "tp" | "collector", text }
     { kind: "event",   by: "system",           text }

   A thread is created by a real message or a lifecycle event — never by merely
   opening a workspace — so "has this conversation started?" stays honest. */

/* A partnerless thread is precisely the defect this key replaces, so the
   omission is a programming error rather than something to paper over. */
const requirePartner = (partnerId, fn) => {
  if (partnerId == null || partnerId === "") {
    throw new Error(`${fn}: partnerId is required — a Conversation is between a Collector and a Trusted Partner`);
  }
  return partnerId;
};

const threadKey = (collectorId, partnerId, card) =>
  collectorId + "::" + requirePartner(partnerId, "threadKey") + "::" + identityKey(card);

/* ONE CONVERSATION PER DEAL (Milestone 2D.1). A deal's thread is keyed by the
   deal alone — never by a card, a name or anything a client chose — and its
   participants are the deal's own. Migration 0015 holds the database to the
   same key, so the pair (unique key, this function) is one thread per deal. */
const dealThreadKey = (oppId) => "opp::" + oppId;
const findDealThread = (threads, oppId) => (threads || []).find((t) => t.key === dealThreadKey(oppId)) || null;
/* A message is plain text of at most this many characters, after trimming. */
const DEAL_MESSAGE_MAX = 2000;

const findThread = (threads, collectorId, partnerId, card) => {
  const k = threadKey(collectorId, partnerId, card);
  return (threads || []).find((t) => t.key === k) || null;
};

/* Returns the next threads array. Pure — callers decide how to store it.
   An entry's id and time are the caller's runtime's (Phase 3): the command layer
   passes ctx.id("e") and ctx.now(). A helper that read the process clock or made
   up an id would be a second, untrusted source of both, so it refuses instead. */
function appendThreadEntry(threads, { collectorId, partnerId, card, cardId, oppId, entry, at, id }) {
  if (!id || !at) {
    throw new TypeError("appendThreadEntry: id and at are required — they come from the command runtime");
  }
  const k = threadKey(collectorId, partnerId, card);
  const stamped = { id, at, ...entry };
  const found = (threads || []).find((t) => t.key === k);
  if (found) {
    return (threads || []).map((t) => (t.key === k
      ? { ...t, oppId: t.oppId || oppId || null, entries: [...t.entries, stamped] } : t));
  }
  return [...(threads || []), {
    id: "t" + k, key: k, collectorId, partnerId,
    cardId: cardId != null ? cardId : (card && card.id),
    oppId: oppId || null, entries: [stamped],
  }];
}

/* A conversation exists once somebody has actually said something. */
const hasConversation = (threads, collectorId, partnerId, card) => {
  const t = findThread(threads, collectorId, partnerId, card);
  return !!t && t.entries.some((e) => e.kind === "message");
};
const messagesOf = (thread) => (thread ? thread.entries : []);

/* The Collector's side of the same fact: every partner they have talked to
   about one identity. Derived from the canonical threads — not a second model. */
const threadsForCard = (threads, collectorId, card) => {
  const suffix = "::" + identityKey(card);
  return (threads || []).filter((t) => t.collectorId === collectorId
    && typeof t.key === "string" && t.key.endsWith(suffix));
};
const partnersInConversation = (threads, collectorId, card) =>
  threadsForCard(threads, collectorId, card).map((t) => t.partnerId).filter(Boolean);

module.exports.threadKey = threadKey;
module.exports.dealThreadKey = dealThreadKey;
module.exports.findDealThread = findDealThread;
module.exports.DEAL_MESSAGE_MAX = DEAL_MESSAGE_MAX;
module.exports.findThread = findThread;
module.exports.appendThreadEntry = appendThreadEntry;
module.exports.hasConversation = hasConversation;
module.exports.messagesOf = messagesOf;
module.exports.threadsForCard = threadsForCard;
module.exports.partnersInConversation = partnersInConversation;

/* ============================================================================
   PHASE 1 — CANONICAL DERIVATIONS THE COMMAND LAYER ENFORCES
   ========================================================================== */

/* Final agreement (contract §4, Invariants 19–20). Agreement belongs to the
   current economic state: every economic change in Deal clears both flags, so a
   flag that is set is, by construction, agreement to the state now in force. */
const finalAgreementGiven = (o) => !!(o && o.deal && o.deal.tpAgreed && o.deal.collectorAgreed);
/* Cancelled after agreement is DERIVED from the preserved agreement flags. */
const cancelledAfterAgreement = (o) => !!(o && isEnded(o) && finalAgreementGiven(o));

/* The final cash figure currently on the table: the latest proposal, or the
   calculated balance when nobody has proposed one. */
const currentCashFigure = (o) => {
  const d = (o && o.deal) || {};
  if (d.agreedAdj != null) return d.agreedAdj;
  const thread = d.adjThread || [];
  for (let i = thread.length - 1; i >= 0; i--) {
    /* Nothing before a reset is on the table any more (dealReset). */
    if (thread[i].type === "reset") break;
    if (thread[i].type === "propose") return thread[i].amount;
  }
  return calculatedBalance(o);
};

/* PHYSICAL-COPY STATUS — derived from the opportunities and the one fact the
   partner sets, never stored as a status of its own (§6).

   FOUR ANSWERS, IN THIS ORDER, AND THE ORDER IS THE MEANING:

     sold       the card is gone. Nothing outranks it and nothing reverses it.
     committed  both parties said yes to the assembled deal (finalAgreementGiven).
     pending    the partner decided they are working on it (INVARIANTS.copyPendingFor).
     available  everything else — INCLUDING an agreed market value.

   THE LAST LINE IS THE CHANGE (Option B). Settling what a card is worth used to
   make it `committed`, which meant agreeing a fact took the card away from
   everybody else without anyone deciding to. Now it does not: a copy stays
   available through inspection, photographs, valuation, trade selection and
   trade valuation, and leaves only when the partner says so or when both
   parties commit to the deal.

   `committed` OUTRANKS `pending`, and an adversarial pass is why. The other way
   round, a copy pending for deal X and promised in deal X read as `pending` —
   and the Collector's label for that word is "Pending for your deal", which
   understates a card that is already theirs. Worse, before `setCopyPending`
   learned to refuse a promised copy, the LOSING deal could be marked pending
   and its Collector told the card was being held for them. A promise is the
   stronger fact and it is what gets said.

   `inventory` IS REQUIRED FOR `pending` and for nothing else. A caller that
   cannot supply it still gets sold / committed / available correctly. */
const inventoryCopyStatus = (invId, opps, inventory) => {
  const mine = (opps || []).filter((o) => o.invId != null && o.invId === invId);
  if (mine.some(isCompleted)) return "sold";
  if (mine.some((o) => isActive(o) && finalAgreementGiven(o))) return "committed";
  if (INVARIANTS.copyPendingFor(invId, inventory, opps)) return "pending";
  return "available";
};
/* ============================================================================
   WHAT A COLLECTOR HAS SAID ABOUT A CARD

   FOUR USER-FACING STATES, AT TWO DIFFERENT LEVELS, AND THE LEVELS ARE THE
   POINT. A card page offers four things a person can mean:

     Primary Goal    I am actively hunting this card, in this grade
     Secondary Goal  I want it, in this grade, less urgently
     Trade/Sell      I own this physical copy and would part with it
     PC              I own this physical copy and intend to keep it

   The first two are facts about a CANONICAL CARD — one Goal per collector per
   card, carrying its own tier and its own criteria. The last two are facts
   about a PHYSICAL COPY, and a person who owns two copies of one card may
   truthfully keep one and offer the other. So the four are mutually exclusive
   PER COPY and not per card, and anything that flattened them into one value
   on the card would make the two-copy case unsayable. There is no `cardState`
   and no `intent` field here, deliberately.

   `keeping` IS A POSITIVE STATEMENT AND IS NEVER INFERRED. `offered === false`
   means only that no offer has been made — three places in the product say so
   and one of them is a migration written to repair exactly that confusion. A
   copy that has said nothing has said nothing: `keeping` absent is not "not
   keeping", it is "unstated", and that is the state every copy in every
   existing world is in, honestly, because nobody has ever been able to say it.

   THE PAIR CANNOT BOTH BE TRUE. "I would part with this" and "I intend to keep
   this" are contradictory, so the two doors clear each other rather than
   letting a copy hold both. The contradiction is made unreachable by the
   commands, and `validateWorld` reports it as well — belt and braces, because a
   copy asserting both would silently be trade supply the owner thinks is safe. */
const copyKept = (copy) => copy != null && copy.keeping === true;
const copyOffered = (copy) => copy != null && copy.offered === true;
const copyDisposition = (copy) => (copyOffered(copy) ? "offered"
  : copyKept(copy) ? "keeping" : "unstated");

/* THE FOUR STATES, AND WHY THERE IS NO FUNCTION HERE THAT ANSWERS FOR A CARD.

     Primary Goal     hunting it, in this grade            a fact about a GOAL
     Secondary Goal   want it, less urgently               a fact about a GOAL
     Trade/Sell       own this copy, would part with it    a fact about a COPY
     PC               own this copy, intend to keep it     a fact about a COPY

   Each of the four belongs to a specific object and is read from it: a Goal's
   `tier`, and a copy's `copyDisposition` above. That is the whole vocabulary.

   `collectorStatesFor(canonicalCardId, goals, copies)` used to live here — one
   call returning every label a CANONICAL CARD carried for one Collector — and
   it is deliberately gone. It was the aggregate the object model rejects: a
   card is reference data, and "what does this card mean to me" has no single
   honest answer for somebody who keeps one copy, offers another and is hunting
   a third. Its only consumer was the Binder rule that derived whether
   organisation could exist from that aggregate, and with the rule withdrawn the
   function had no caller and no future — the object-level work that follows
   asks the Goal or the copy, never the card.

   OWNING WITHOUT A DISPOSITION REMAINS VALID AND REMAINS UNNAMED. A copy nobody
   has said anything about is a real record; it is what every copy in every
   existing world is; and it is not a fifth user-facing state. Nothing infers a
   disposition for it, and nothing here reports one. */

const soldInventoryIds = (opps) => new Set((opps || [])
  .filter((o) => isCompleted(o) && o.invId != null).map((o) => o.invId));

/* ============================================================================
   QUALIFICATION: WHO MAY LOOK, AND WHO MAY KEEP LOOKING

   PENDING CLOSES THE DOOR; IT DOES NOT THROW OUT THE PEOPLE ALREADY IN THE ROOM.

   Two questions, and keeping them apart is the whole of it:

     openToNewQualification   may somebody who has done nothing with this copy
                              START looking at it?
     qualifyingOn             is this collector ALREADY looking at it?

   Before this batch the product answered the first question wrong in one
   direction and the second wrong in the other. `reviewCopy` and `requestPhotos`
   refused only a SOLD copy, so a copy that was pending for, or already promised
   to, somebody else's deal accepted a new entrant — and because `sold` refused
   while `committed` did not, the difference between the two answers told a rival
   the exact moment another collector's deal completed. Meanwhile the projection
   dropped the copy entirely the moment it stopped being available, so a
   collector who was legitimately mid-inspection lost the card off their screen
   and kept a review row pointing at nothing.

   NEITHER ANSWER IS A NEW FACT. `openToNewQualification` is `inventoryCopyStatus`
   — the Option B authority, unchanged — asked with one word. `qualifyingOn` is
   the review and photo-request rows that have existed since the beginning, read
   the way `collector-view.js` has always read them. Nothing durable was added:
   no `participant`, no `authorizedViewer`, no access list. If these two
   predicates disagree with the rest of the product, the rest of the product is
   what is right, because they are derived from it.

   AN OPEN INTERACTION, NOT A HISTORY. Participation is an OPEN review or an
   OPEN photo request. A review that was ended, or a request that was fulfilled
   and whose review is over, is not a standing claim on the copy: qualification
   that legitimately finished stops keeping the door propped. This is what makes
   "retains only the access necessary" true rather than "retains access forever".

   WHAT PARTICIPATION IS NOT. It is not a reservation, a priority claim, an
   exclusivity, or any kind of head start. Any number of collectors may qualify
   on one copy at once, none of them blocks another, and none of it survives a
   deal. It buys exactly one thing: the copy does not vanish mid-sentence.

   THE COLLECTOR WHOSE OWN DEAL HOLDS THE CARD IS THE FIRST PARTICIPANT, and an
   adversarial run is why this is written down. Closing the door on `committed`
   without saying so locked the winner out of their own card: the copy was
   `committed` precisely BECAUSE of their deal, and they were then refused
   permission to ask the partner for a photograph of the card they had just been
   promised. An active opportunity of one's own is engagement with that copy by
   any reading, so it counts here.

   IT DOES NOT SURVIVE THE RELATIONSHIP. Participation is read alongside a live
   relationship, never instead of one. An ended relationship already takes a
   partner's whole supply off the Collector's screen, and a review left open
   across that ending must not be a keyhole back into it. The caller passes
   `related`, and a copy whose partner is no longer trusted is not qualifying
   for anybody. */
const qualifyingOn = (invId, collectorId, facts) => {
  if (invId == null || collectorId == null) return false;
  const f = facts || {};
  const mine = (r) => r && r.invId === invId && r.collectorId === collectorId;
  return (f.copyReviews || []).some((r) => mine(r) && !r.endedAt)
    || (f.photoRequests || []).some((r) => mine(r) && !r.fulfilledAt)
    || (f.opportunities || []).some((o) => mine(o) && isActive(o));
};
const openToNewQualification = (invId, opps, inventory) =>
  inventoryCopyStatus(invId, opps, inventory) === "available";

/* THE ONE SEAT A CLOSED COPY STAYS OPEN TO: the Collector whose own deal is the
   reason it closed — the deal that actually HOLDS it, which is the one named by
   `copyCommittedTo` or by the partner's `pendingFor`, never merely a deal that
   happens to name the copy and has not formally ended. An adversarial run is why
   that distinction is spelled out: a rival whose negotiation had already lost
   the card still read as "active", and asking only for an active deal let the
   loser back through the door of a copy that had been sold out from under them.
   Everybody else — including somebody with an open
   review — is answered identically whatever the copy's state, so no command can
   be used to ask whether a rival's deal is pending, promised or finished. What
   an existing reviewer keeps is what the projection gives them: the card still
   on screen, marked plainly unavailable, and `endReview` to close their own
   sentence. That is "understand and complete"; re-opening is starting again. */
const holdingCopy = (invId, collectorId, opps, inventory) => {
  if (invId == null || collectorId == null) return false;
  const all = opps || [];
  /* SOLD HOLDS NOTHING. A completed deal is not a door anybody is standing in;
     the card is gone and the answer is the same for every seat. */
  if (soldInventoryIds(all).has(invId)) return false;
  const committed = INVARIANTS.copyCommittedTo(invId, all);
  if (committed) return committed.collectorId === collectorId;
  const pendingId = INVARIANTS.copyPendingFor(invId, inventory, all);
  if (pendingId) {
    const held = all.find((o) => o.id === pendingId);
    return !!held && held.collectorId === collectorId;
  }
  return false;
};

/* WHAT ONE DEAL IS DOING WITH ONE COLLECTOR COPY (M3A A1).

   Derived from the deal's stage, never stored on the copy, and never a change
   to the copy's Trade/Sell disposition:

     selected   a live row while the deal is in Select Trade. The partner is
                considering this exact copy. Its material specification is
                locked, but it is NOT exclusive: the same copy may be selected
                in other deals, with other partners or the same one.
     reserved   a live row once the deal is in Value Trade or Deal. Exclusive:
                no other deal may select or reserve it. Entering valuation is
                the only way in (`closeTradeSelection`), and it is atomic.
     committed  a live row once both parties have given final agreement.
                Unilateral withdrawal is over; cancellation rules apply.

   Deselected, withdrawn and legacy undecided rows hold nothing. A completed
   deal's committed rows read as `traded` in `collectorCopyStatus`; an ended
   deal holds nothing at all. */
const binderRowState = (o, row) => {
  if (!o || !liveRow(row)) return null;
  /* Fulfillment and completion are only reachable through final agreement, so
     they are committed whatever the flags on a hand-built record say. */
  if (finalAgreementGiven(o) || o.stage === "fulfillment" || isCompleted(o)) return "committed";
  if (o.stage === "value-trade" || o.stage === "deal") return "reserved";
  if (o.stage === "select-trade") return "selected";
  return null;
};
/* The strongest thing any deal is doing with a copy, ranked
   traded > committed > reserved > selected > available. `exceptOppId` asks the
   question for everybody but one deal — "may THIS deal still have it?". */
const COPY_HOLD_RANK = { available: 0, selected: 1, reserved: 2, committed: 3 };
const collectorCopyStatus = (binderId, opps, exceptOppId) => {
  let status = "available";
  for (const o of opps || []) {
    if (o.id === exceptOppId) continue;
    for (const row of tradeRows(o)) {
      if (row.binderId !== binderId) continue;
      const st = binderRowState(o, row);
      if (!st) continue;
      if (isCompleted(o) && st === "committed") return "traded";
      if (!isActive(o)) continue;
      if (COPY_HOLD_RANK[st] > COPY_HOLD_RANK[status]) status = st;
    }
  }
  return status;
};
/* Exclusive: no other deal may select or reserve this copy. */
const EXCLUSIVE_COPY_STATES = Object.freeze(["reserved", "committed", "traded"]);
const copyExclusive = (binderId, opps, exceptOppId) =>
  EXCLUSIVE_COPY_STATES.includes(collectorCopyStatus(binderId, opps, exceptOppId));
/* THE SPECIFICATION LOCK, which is not the reservation. From the moment any
   partner selects a copy until every deal that selected it has let it go, the
   facts that say what the object IS — grade, condition, certificate and the
   photographs already on it — cannot be restated, because somebody is
   reasoning about exactly that object. A copy selected in two deals stays
   locked until both have released it; a traded copy is history and stays
   locked for ever. Printing identity (`canonicalCardId`) is immutable on every
   copy at all times and needs no lock. */
const copySpecLocked = (binderId, opps) => collectorCopyStatus(binderId, opps) !== "available";

/* An active Opportunity locks its Goal at Primary (§4, Invariant 13). */
const goalLocked = (goalId, opps) => activeOppForGoal(goalId, opps || []) != null;

/* ---- canonical record factories (one shape for every seat) ---- */
const emptyDeal = () => ({ collectorAgreed: false, tpAgreed: false, adjThread: [],
  tpAdj: null, collectorAdj: null, agreedAdj: null });
const emptyFulfillment = () => ({ method: null, show: "", date: "", time: "",
  location: "", note: "", proposedAt: null, collectorConfirmedPlan: false,
  revisionRequested: null, tpHandoff: false, collectorReceipt: false });
/* The row id here labels a DRAFT row (the Trusted Partner's client-side package
   editor and test fixtures). A row that enters canonical state is re-identified
   by the command runtime at submission (proposeTradeSelection). */
/* EXACTLY ONE CARD REFERENCE, HERE TOO (Phase 5 C2). A trade row names the card
   the copy it carries names, and since C2 a Collector's copy may name a
   canonical card instead of a legacy one. `canonicalCardId` is the fifth
   argument rather than a replacement for the first, so every existing caller —
   the demo, the draft editor, the fixtures — is untouched: pass it and the row
   carries `canonicalCardId` and NO `cardId`; omit it and nothing changes.

   This is the same move Batch 6 made for inventory, Batch 7 for goals and Batch
   8 for opportunities, and it is here now for one reason: without it a
   production Collector's copy — which has no legacy card — could be owned and
   offered but never actually put into a trade. validateWorld requires one of
   the two references and refuses both. */
/* THE ROW IS ALSO THE SNAPSHOT (M3A A1). `spec` carries the copy's grade and
   condition at the moment it was selected, beside the certificate and photo
   references the row has always carried, so the deal's record of WHICH object
   was being valued never depends on the copy staying as it was. The copy is
   locked while selected anyway (`copySpecLocked`); the snapshot is what history
   reads after the lock is gone. Photographs are copied, never shared by
   reference. `selectedAt`, `reservedAt` and `withdrawnStage` are written by the
   commands that do those things. */
const emptyTradeCard = (cardId, photos, cert, binderId, canonicalCardId, spec) => {
  const canonical = typeof canonicalCardId === "string" && canonicalCardId;
  const s = spec || {};
  return {
    id: "tc" + (canonical || cardId) + "-" + randomToken(8),
    ...(canonical ? { canonicalCardId: canonical } : { cardId }),
    binderId: binderId || null, inclusion: "proposed", reviewedAt: null,
    withdrawn: false, withdrawnAt: null, withdrawnStage: null,
    selectedAt: null, reservedAt: null,
    grade: typeof s.grade === "string" ? s.grade : null,
    condition: typeof s.condition === "string" ? s.condition : null,
    collectorMarket: null, tpMarket: null, agreedMarket: null, valueThread: [],
    collectorPercent: null, tpPercent: null, agreedPercent: null, percentThread: [],
    cert: cert || null,
    photos: photos && typeof photos === "object"
      ? { front: photos.front == null ? null : photos.front, back: photos.back == null ? null : photos.back }
      : { front: null, back: null },
  };
};

module.exports.finalAgreementGiven = finalAgreementGiven;
module.exports.cancelledAfterAgreement = cancelledAfterAgreement;
module.exports.currentCashFigure = currentCashFigure;
module.exports.inventoryCopyStatus = inventoryCopyStatus;
module.exports.copyKept = copyKept;
module.exports.copyOffered = copyOffered;
module.exports.copyDisposition = copyDisposition;
module.exports.qualifyingOn = qualifyingOn;
module.exports.openToNewQualification = openToNewQualification;
module.exports.holdingCopy = holdingCopy;
module.exports.soldInventoryIds = soldInventoryIds;
module.exports.meetsGoalCriteria = meetsGoalCriteria;
module.exports.transactionallyLost = transactionallyLost;
module.exports.goalNamedByActive = goalNamedByActive;
module.exports.COLLECTING_STATES = COLLECTING_STATES;
module.exports.COLLECTING_LINEAGE_MAX = COLLECTING_LINEAGE_MAX;
module.exports.collectorCopyStatus = collectorCopyStatus;
module.exports.binderRowState = binderRowState;
module.exports.copyExclusive = copyExclusive;
module.exports.copySpecLocked = copySpecLocked;
module.exports.EXCLUSIVE_COPY_STATES = EXCLUSIVE_COPY_STATES;
module.exports.goalLocked = goalLocked;
module.exports.emptyDeal = emptyDeal;
module.exports.emptyFulfillment = emptyFulfillment;
module.exports.emptyTradeCard = emptyTradeCard;
