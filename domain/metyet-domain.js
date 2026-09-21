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
    case "select-trade":
      if (!o.trade || !o.trade.submitted) return { actor: "collector", reason: "choose-trade" };
      return (tradeRows(o).some((c) => c.inclusion === "proposed" && !c.withdrawn))
        ? { actor: "partner", reason: "review-trade" }
        : { actor: "collector", reason: "trade-reviewed" };
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

/* Withdrawing a card from the trade. It sets a flag rather than deleting the
   row, because the negotiation that happened is still true: the card stops
   contributing economics but its history stays readable. Only an accepted,
   not-already-withdrawn card can be withdrawn — the rule the TP seat already
   used, now reachable by both. */
/* CONTRACT §4 / Invariant 18: a COMMITTED copy (accepted by the partner)
   cannot be withdrawn unilaterally. Only a RESERVED row — submitted, not yet
   accepted — can be withdrawn, and withdrawing releases the reservation. The
   row stays in the package as history. */
const tcWithdraw = (tc, at) => (tc.inclusion === "proposed" && !tc.withdrawn
  ? { ...tc, inclusion: "withdrawn", withdrawn: true, withdrawnAt: at } : tc);

/* The partner's inclusion decision on a proposed card. Accepting brings it into
   the trade's economics; rejecting leaves the row and its history in place but
   out of the totals. Only an undecided card can be decided. */
const tcDecide = (tc, decision, at) => (tc.inclusion === "proposed"
  ? { ...tc, inclusion: decision, reviewedAt: at } : tc);

/* WHEN SELECTION IS OVER.

   The Trusted Partner reviews each proposed card; once none is still awaiting a
   decision, the selection has resolved and the deal moves on — to Value Trade if
   anything was accepted, or straight to Deal as a cash purchase if everything
   was rejected. There is no further decision for either person to make, which is
   why nothing waits for a confirmation that would have nothing to confirm.

   This rule already existed, but only inside the Trusted Partner's React module,
   applied on its own review path. The canonical action did not run it, so a
   review performed through the shared action left the card accepted, the
   guidance saying "move on to agreeing values", and the stage still on Select
   Trade — the two seats disagreeing about the same opportunity. Moving it here
   is what makes one review mean one outcome. */
const selectTradeSettled = (o) => !!(o.trade && o.trade.submitted)
  && tradeRows(o).filter((c) => c.inclusion === "proposed").length === 0
  && tradeRows(o).filter((c) => c.inclusion === "accepted").length > 0;

const selectionExhausted = (o) => !!(o.trade && o.trade.submitted)
  && tradeRows(o).filter((c) => c.inclusion === "proposed").length === 0
  && tradeRows(o).filter((c) => c.inclusion === "accepted").length === 0;

/* Applied after any change to inclusion. It only ever moves a deal that is
   actually sitting in Select Trade, so it cannot disturb a later stage. */
const closeSelection = (o) => {
  if (o.stage !== "select-trade" || isTerminal(o)) return o;
  if (selectTradeSettled(o)) return { ...o, stage: "value-trade" };
  if (selectionExhausted(o)) {
    return { ...o, trade: { ...o.trade, mode: "cash" }, stage: "deal",
      deal: { adjThread: [], ...(o.deal || {}) } };
  }
  return o;
};

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

/* Rows still IN the trade: awaiting the partner's decision, or accepted and not
   withdrawn. Rejected and withdrawn rows keep their history but are out. */
const liveTradeRows = (o) => tradeRows(o).filter((c) =>
  c.inclusion === "proposed" || (c.inclusion === "accepted" && !c.withdrawn));

const TRADE = { applyMarket: tcApplyMarket, decide: tcDecide, liveTradeRows, cardOwner,
  selectTradeSettled, selectionExhausted, closeSelection,
  valueTradeSettled, closeValuation, applyPercent: tcApplyPercent,
  applyDealAdjustment: dealApplyAdj, dealAdjStanding, withdraw: tcWithdraw, marketAgreed,
  marketStanding, percentStanding, negotiationState };

const INVARIANTS = {
  /* A collector may pursue one structured negotiation per goal at a time.
     Alternatives stay visible and reachable — only the offer is limited. */
  /* THE COLLECTOR'S BOUNDARY. Per GOAL, and it begins at the first submitted
     offer — not at reviewing, asking for photos, or chatting. Those are how you
     find out whether you want the card; this is where you commit to buying one. */
  oneNegotiationPerGoal: (goalId, opps) => activeOppForGoal(goalId, opps) == null,

  /* THE PARTNER'S BOUNDARY, and deliberately a different one.

     A partner is not committed merely because somebody has offered — several
     collectors may be talking to them about the same card at once, and that is
     healthy. They become committed when the PRICE IS SETTLED, because that is
     the point at which they have told one collector what the card costs them
     and cannot honestly tell another the same thing.

     Settled price is `agreedPrice != null`, which is the existing canonical
     marker for Agree on Price being done; no new field is introduced. The lock
     is per PHYSICAL COPY, so a partner may commit different copies to different
     collectors at the same time. It releases when the deal ends, since an ended
     deal no longer holds anything. */
  copyCommittedTo: (invId, opps, exceptOppId) => (invId == null ? null
    : (opps || []).find((o) => o.invId === invId && o.id !== exceptOppId
      && isActive(o) && o.agreedPrice != null) || null),
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
  notYourTurn: "not-your-turn",
  goalLocked: "goal-locked",
  duplicateGoal: "duplicate-goal",
  identityMismatch: "identity-mismatch",
  copyReserved: "copy-reserved",
  copyInUse: "copy-in-use",
  copySold: "copy-sold",
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
  isEnded, isCompleted, isTerminal, isActive, isNegotiating,
  activeOppForGoal, goalState,
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
        submitted: reached(1) ? !!(o.trade && o.trade.submitted) : false },

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
    if (thread[i].type === "propose") return thread[i].amount;
  }
  return calculatedBalance(o);
};

/* PHYSICAL-COPY STATUS — derived from the opportunities, never stored (§6). */
const inventoryCopyStatus = (invId, opps) => {
  const mine = (opps || []).filter((o) => o.invId != null && o.invId === invId);
  if (mine.some(isCompleted)) return "sold";
  if (mine.some((o) => isActive(o) && o.agreedPrice != null)) return "committed";
  return "available";
};
const soldInventoryIds = (opps) => new Set((opps || [])
  .filter((o) => isCompleted(o) && o.invId != null).map((o) => o.invId));

/* Which rows of an opportunity hold an exact BinderCopy, and how. */
const binderRowState = (o, row) => {
  if (!row || row.withdrawn) return null;
  if (row.inclusion === "accepted") return "committed";
  if (row.inclusion === "proposed" && o.trade && o.trade.submitted) return "reserved";
  return null;                       // draft, rejected or withdrawn rows hold nothing
};
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
      if (st === "committed") status = "committed";
      else if (st === "reserved" && status === "available") status = "reserved";
    }
  }
  return status;
};

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
const emptyTradeCard = (cardId, photos, cert, binderId, canonicalCardId) => {
  const canonical = typeof canonicalCardId === "string" && canonicalCardId;
  return {
    id: "tc" + (canonical || cardId) + "-" + randomToken(8),
    ...(canonical ? { canonicalCardId: canonical } : { cardId }),
    binderId: binderId || null, inclusion: "proposed", reviewedAt: null,
    withdrawn: false, withdrawnAt: null,
    collectorMarket: null, tpMarket: null, agreedMarket: null, valueThread: [],
    collectorPercent: null, tpPercent: null, agreedPercent: null, percentThread: [],
    cert: cert || null, photos: photos || { front: null, back: null },
  };
};

module.exports.finalAgreementGiven = finalAgreementGiven;
module.exports.cancelledAfterAgreement = cancelledAfterAgreement;
module.exports.currentCashFigure = currentCashFigure;
module.exports.inventoryCopyStatus = inventoryCopyStatus;
module.exports.soldInventoryIds = soldInventoryIds;
module.exports.collectorCopyStatus = collectorCopyStatus;
module.exports.binderRowState = binderRowState;
module.exports.goalLocked = goalLocked;
module.exports.emptyDeal = emptyDeal;
module.exports.emptyFulfillment = emptyFulfillment;
module.exports.emptyTradeCard = emptyTradeCard;
