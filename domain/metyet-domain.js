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
const tradeValueAt = (market, percent) =>
  (market == null || percent == null ? null : Math.round(market * percent));
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
      return FULFILLMENT.received(f) ? { actor: "partner", reason: "handoff" }
        : { actor: "collector", reason: "handoff" };
    }
    default:
      return { actor: null, reason: "done" };
  }
}

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
  return { ...tc,
    ...(by === "tp" ? { tpPercent: percent } : { collectorPercent: percent }),
    percentThread: [...tc.percentThread, { by, type: "propose", percent, at }] };
}

function dealApplyAdj(deal, by, action, amount, at) {
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
  if (typeof amount !== "number" || !isFinite(amount) || amount === 0) return deal;
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
const tcWithdraw = (tc, at) => (tc.inclusion === "accepted" && !tc.withdrawn
  ? { ...tc, withdrawn: true, withdrawnAt: at } : tc);

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
    return { ...o, trade: { ...o.trade, mode: "cash" }, stage: "deal" };
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
  return valueTradeSettled(o) && activeTradeCards(o).filter(cardSettled).length > 0
    ? { ...o, stage: "deal" } : o;
};

/* Rows still IN the trade: awaiting the partner's decision, or accepted and not
   withdrawn. Rejected and withdrawn rows keep their history but are out. */
const liveTradeRows = (o) => tradeRows(o).filter((c) =>
  c.inclusion === "proposed" || (c.inclusion === "accepted" && !c.withdrawn));

const TRADE = { applyMarket: tcApplyMarket, decide: tcDecide, liveTradeRows,
  selectTradeSettled, selectionExhausted, closeSelection,
  valueTradeSettled, closeValuation, applyPercent: tcApplyPercent,
  applyDealAdjustment: dealApplyAdj, withdraw: tcWithdraw, marketAgreed };

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
  /* A binder copy is a physical thing a partner must be able to evaluate.
     Both faces or it does not exist. */
  binderCopyPhotographed: (photos) => !!(photos && photos.front && photos.back),
  /* THE SAME RULE, FOR THE OTHER SIDE'S SHELF. A stock image identifies the
     card; actual front and back photos identify the specific physical copy, and
     price depends on condition — so a copy is ready to be negotiated over only
     once both faces of THAT copy exist. One face is not enough, and there is
     deliberately no separate predicate: it is the same standard a collector's
     binder copy has always had to meet. */
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
};

module.exports = {
  FULFILLMENT, TRADE,
  identityKey, isRaw, sameIdentity,
  STAGES, STAGE_IX, STAGE_LABEL,
  isEnded, isCompleted, isTerminal, isActive, isNegotiating,
  activeOppForGoal, goalState,
  acceptedTradeCards, cardSettled, tradeValueOf, tradeValueAt, totalTradeValue,
  calculatedBalance, finalBalance,
  lastEntry, nextActor,
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

/* Returns the next threads array. Pure — callers decide how to store it. */
function appendThreadEntry(threads, { collectorId, partnerId, card, cardId, oppId, entry, at, id }) {
  const k = threadKey(collectorId, partnerId, card);
  const stamped = {
    id: id || "e" + Math.random().toString(36).slice(2, 10),
    at: at || new Date().toISOString(),
    ...entry,
  };
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
