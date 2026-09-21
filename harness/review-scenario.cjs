/* ============================================================================
   THE REVIEW SCENARIO — one deterministic deal, built only from canonical acts.

   Every state the harness captures is reached the way a real pair of people
   would reach it: offer, counter, accept, review, propose, agree, hand over.
   Nothing here computes a balance, decides a turn, or sets a stage. If a state
   cannot be produced by calling actions, that is a gap to report rather than a
   reason to write the state by hand — the whole point of a review harness is
   that what it photographs is what the product actually does.

   Determinism comes from fixed identities, fixed amounts and fixed timestamps,
   so two runs a month apart differ only where the product differs.

   Dates sit before the app's demo clock (2026-08-14) deliberately: reads are
   stamped with that clock, so activity dated after it could never be marked
   read, and every unread capture would be a lie about the product.
   ========================================================================= */

const D = require("../domain/metyet-domain.js");
const { createStore } = require("../domain/metyet-store.js");
/* The scenario world declares its Relationship explicitly (contract §2). */
const M = require("../dist/MetYet.cjs");

/* Stable identities. Names chosen to be obvious in a screenshot. */
const ME = "c12";                      /* the collector identity the app renders */
const TP = "northline";
const TARGET = { id: "rev-target", name: "Charizard", set: "Base Set", number: "4",
  variant: "Holo", edition: "Unlimited", language: "English", grade: "PSA 9",
  condition: null };
const GIVE_A = { id: "rev-give-a", name: "Blastoise", set: "Base Set", number: "2",
  variant: "Holo", edition: "Unlimited", language: "English", grade: "PSA 9",
  condition: null };
const GIVE_B = { id: "rev-give-b", name: "Venusaur", set: "Base Set", number: "15",
  variant: "Holo", edition: "Unlimited", language: "English", grade: "PSA 8",
  condition: null };

/* A fixed clock. Every act is dated, in order, before the demo clock. */
const DAY = (n) => "2026-08-" + String(n).padStart(2, "0");

const seed = () => ({
  catalog: [TARGET, GIVE_A, GIVE_B],
  collectors: [{ id: ME, name: "Casey Bell", prefs: [] }],
  partners: [{ id: TP, name: "Northline Cards", city: "Duluth, Minnesota",
    about: "Independent Pokemon dealer working out of Duluth since 2022.",
    specialties: ["Vintage", "PSA", "WOTC"] }],
  goals: [], interests: [], conversations: [], opportunities: [],
  preferences: [], photoRequests: [], copyReviews: [],
  relationships: [{ partnerId: TP, collectorId: ME, status: "accepted", at: DAY(1) }],
  /* Two copies the collector OWNS AND OFFERS, both photographed. `offered` is
     explicit (C2): the scenario is about a partner evaluating supply, and a copy
     that is not offered is not supply. */
  collectorCopies: [
    { id: "rev-copy-a", collectorId: ME, cardId: GIVE_A.id, market: 900, offered: true,
      photos: { front: "binder:rev-a:front", back: "binder:rev-a:back" },
      cert: "PSA 44000001", addedAt: DAY(1) },
    { id: "rev-copy-b", collectorId: ME, cardId: GIVE_B.id, market: 600, offered: true,
      photos: { front: "binder:rev-b:front", back: "binder:rev-b:back" },
      cert: "PSA 44000002", addedAt: DAY(1) },
  ],
  /* The partner's copy of the target, photographed, so the photo viewer has
     something honest to show. */
  inventory: [{ invId: "rev-inv", partnerId: TP, cardId: TARGET.id, ask: 4200,
    archived: false, acquired: "2026-01-11", addedAt: DAY(2),
    photos: { front: "copy:rev-inv:front", back: "copy:rev-inv:back" } }],
});

/* Each step names the state it leaves behind, so the capture matrix can stop
   wherever it needs to and know exactly what is on screen. */
const build = (stopAt, onStop) => {
  const st = createStore(seed());
  const A = st.actions;
  const at = [];                                   // ordered checkpoints

  const goalId = A.addGoal({ collectorId: ME, cardId: TARGET.id,
    tier: "primary", at: DAY(2) });
  const oppId = A.startOpportunity({ goalId, collectorId: ME, partnerId: TP,
    cardId: TARGET.id, invId: "rev-inv", listedPrice: 4200, amount: 3900,
    at: DAY(3) });
  const get = () => st.get().opportunities.find((o) => o.id === oppId);
  let halted = false;
  const mark = (id) => {
    at.push({ id, stage: get().stage });
    if (!halted && stopAt === id && onStop) {
      halted = true;
      /* Snapshot the store as it stands at this checkpoint. */
      /* A frozen copy: the caller gets the deal as it was at this moment, and
         the walk continuing afterwards cannot change what they hold. */
      const frozen = createStore(JSON.parse(JSON.stringify(st.get())));
      onStop({ store: frozen, oppId, goalId, checkpoints: at.slice() });
    }
  };

  const say = (by, text, day) => A.sendMessage({ collectorId: ME, partnerId: TP,
    cardId: TARGET.id, by, text, oppId, at: DAY(day) });

  const step = (fn) => { if (!halted) fn(); };
  say("collector", "Interested in the Charizard — any more photos?", 3);
  say("tp", "Front and back are up now. Corners are sharp.", 3);
  mark("price-open");                              // collector has offered

  /* Price: offer, counter, acceptance. */
  A.agreePrice({ oppId, amount: 3900, by: "tp", at: DAY(4) });
  mark("price-agreed");

  /* Trade: two copies proposed, both accepted by the partner. Submitting the
     package reserves the exact copies; the partner's acceptance commits them. */
  A.proposeTradeSelection({ oppId, binderIds: ["rev-copy-a", "rev-copy-b"], at: DAY(5) });
  mark("trade-selected");
  say("collector", "Adding the Blastoise and the Venusaur.", 5);
  A.reviewTradeCards({ oppId, decision: "accepted", at: DAY(5) });
  mark("trade-accepted");

  /* Market value, per card, ending agreed. PHASE 1: the collector opens market
     value, and the turn stays with whoever moved last while they hold a card. */
  const ids = get().trade.cards.map((c) => c.id);
  A.tradeMarketRespond({ oppId, tradeCardId: ids[0], by: "collector",
    action: "propose", amount: 900, at: DAY(6) });
  A.tradeMarketRespond({ oppId, tradeCardId: ids[1], by: "collector",
    action: "propose", amount: 600, at: DAY(6) });
  A.tradeMarketRespond({ oppId, tradeCardId: ids[0], by: "tp",
    action: "propose", amount: 850, at: DAY(6) });
  A.tradeMarketRespond({ oppId, tradeCardId: ids[1], by: "tp",
    action: "accept", at: DAY(6) });
  /* Accepting the Venusaur's market opens its trade %, which the partner opens. */
  A.tradePercentRespond({ oppId, tradeCardId: ids[1], by: "tp",
    action: "propose", percent: 0.75, at: DAY(6) });
  mark("market-standing");                         // awaiting the collector
  say("tp", "850 feels right for the Blastoise given the centring.", 6);
  A.tradeMarketRespond({ oppId, tradeCardId: ids[0], by: "collector",
    action: "accept", at: DAY(7) });
  A.tradePercentRespond({ oppId, tradeCardId: ids[1], by: "collector",
    action: "accept", at: DAY(7) });
  mark("market-agreed");

  /* Percentage on the Blastoise: the partner opens, the collector counters. */
  A.tradePercentRespond({ oppId, tradeCardId: ids[0], by: "tp",
    action: "propose", percent: 0.8, at: DAY(8) });
  mark("percent-standing");
  say("collector", "Can we do 85 on the Blastoise?", 8);
  A.tradePercentRespond({ oppId, tradeCardId: ids[0], by: "collector",
    action: "propose", percent: 0.85, at: DAY(8) });
  A.tradePercentRespond({ oppId, tradeCardId: ids[0], by: "tp",
    action: "accept", at: DAY(9) });
  mark("value-complete");                          // closes into Deal

  /* Cash. The partner confirms first; a new figure from the collector clears
     that confirmation and hands the turn back; the partner confirms the new
     figure, and the collector's confirmation completes final agreement. */
  A.dealAgree({ oppId, by: "tp", at: DAY(10) });
  A.dealAdjustRespond({ oppId, by: "collector", action: "propose",
    amount: 2800, at: DAY(10) });
  mark("cash-standing");
  say("tp", "2800 works. Let us get it shipped.", 10);
  A.dealAgree({ oppId, by: "tp", at: DAY(11) });
  mark("cash-agreed");                             // partner confirmed 2800

  A.dealAgree({ oppId, by: "collector", at: DAY(11) });
  mark("handoff-open");
  A.proposeFulfillment({ oppId, plan: { method: "Ship", where: "Duluth, Minnesota",
    when: "Friday" }, at: DAY(12) });
  A.confirmFulfillmentPlan({ oppId, at: DAY(12) });
  mark("handoff-planned");
  A.confirmHandoff({ oppId, by: "tp", at: DAY(13) });
  mark("handoff-partial");                         // one side done
  A.confirmHandoff({ oppId, by: "collector", at: DAY(13) });
  mark("completed");

  return { store: st, oppId, goalId, checkpoints: at };
};

/* STOPPING EARLY IS A REAL MOMENT, NOT A REWIND. The same acts run in the same
   order and simply stop, so an intermediate capture shows a deal that genuinely
   existed in that state rather than a finished deal with fields removed. */
const buildTo = (checkpoint) => {
  let stopped = null;
  const inner = build(checkpoint, (frame) => { stopped = frame; });
  return stopped || inner;
};

module.exports = { build, buildTo, seed, ME, TP, TARGET, GIVE_A, GIVE_B, DAY,
  CHECKPOINTS: ["price-open", "price-agreed", "trade-selected", "trade-accepted",
    "market-standing", "market-agreed", "percent-standing", "value-complete",
    "cash-standing", "cash-agreed", "handoff-open", "handoff-planned",
    "handoff-partial", "completed"] };
