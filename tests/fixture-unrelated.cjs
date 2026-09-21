/* ============================================================================
   TEST FIXTURE — A WORLD WITH DELIBERATELY UNRELATED PARTIES (Phase 2)

   `fixture-store.cjs` relates every partner to every collector, which is right
   for suites testing settlement or turn order and useless for visibility: in an
   everyone-connected world no leak can show. This world is the opposite. Two
   Trusted Partners, four Collectors, and explicit Relationships:

       Alpha (pA) ──── cA          (cA knows only Alpha)
       Alpha (pA) ──┐
                    ├── cAB        (cAB belongs to both networks)
       Beta  (pB) ──┘
       Beta  (pB) ──── cB          (cB knows only Beta)
                       cX          (related to nobody)
       Gamma (pC)                  (related to nobody; holds stock and an invite)

   Deals, each deliberately different in who and how far:
       oA    cA  ↔ Alpha   completed, trades bA, signed balance, fulfillment plan
       oABA  cAB ↔ Alpha   completed, trades bAB1 (a copy Beta is also interested in)
       oAB   cAB ↔ Beta    Select Trade, bAB2 reserved in a submitted package
       oB    cB  ↔ Beta    Deal, a standing signed balance

   Invitations: Alpha, Beta and Gamma each invite a new person through the
   command (Alpha types tags and a city for theirs); Gamma also holds a seeded
   PENDING invitation to cX, an existing Collector with Goals, Binder and tags.
   An invitation is not a Relationship, so none of that may reach Gamma.

   `snapshots.oABA` keeps canonical state at each step of oABA's lifecycle, so a
   test can hold a non-participant's projection fixed while that deal moves.

   Every private or party-specific value carries a unique MARKER string or a
   distinctive number, so a test can scan a serialized projection and fail on
   the first leaked byte. No marker contains another, so a substring scan for
   one can never be satisfied by a different one. Deals, messages, requests, reviews and invitations
   are created through the real command layer (store.execute) so their shapes
   are the product's own; only static records are seeded.

   Test-only. Product code never imports this.
   ========================================================================== */
const { createStore } = require("../domain/metyet-store.js");

const AT = "2026-09-01";
const card = (id, name) => ({ id, name, set: "Base Set", num: id.toUpperCase(), print: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null, tags: ["vintage"] });
const shot = (id) => ({ front: `photo:${id}:front`, back: `photo:${id}:back` });

/* Distinctive values: money that appears nowhere else, and strings that name
   exactly who may see them. */
const V = {
  costA1: 31337, costA2: 31338, costA5: 41515, costB1: 25011, costC1: 47007,
  acquiredA1: "1999-01-11",
  marketA: 7771, marketAB1: 9991, marketAB2: 9992, marketB: 8881, marketX: 6661,
  rateA: 0.7123, rateB: 0.6456, rateC: 0.5789,
  invEmailA: "invitee-alpha@example.test", invEmailB: "invitee-beta@example.test",
  invEmailC: "invitee-gamma@example.test", invEmailX: "invitee-xander@example.test",
};
const MARK = {
  relNoteA_AB: "ALPHA-PRIVATE-NOTE-ABOUT-ROBIN", relNoteB_AB: "BETA-PRIVATE-NOTE-ABOUT-ROBIN",
  relNoteA_A: "ALPHA-PRIVATE-NOTE-ABOUT-CASEY",
  legacyNoteA: "LEGACY-ROW-NOTE-CASEY", legacyNoteAB: "LEGACY-ROW-NOTE-ROBIN",
  legacyNoteB: "LEGACY-ROW-NOTE-BLAKE",
  actA: "ALPHA-ACTIVITY-ONLY", actB: "BETA-ACTIVITY-ONLY", actLegacy: "LEGACY-ACTIVITY-NO-OWNER",
  msgA: "ALPHA-THREAD-cA-ONLY", msgAB_A: "ALPHA-THREAD-cAB-ONLY",
  msgAB_B: "BETA-THREAD-cAB-ONLY", msgB: "BETA-THREAD-cB-ONLY",
  prefA: "pref-casey-alpha-only", prefAB: "pref-robin-both", prefB: "pref-blake-beta-only",
  prefX: "pref-xander-no-network",
  goalNoteB: "GOAL-NOTE-cB-ONLY",
  partnerPrivateB: "BETA-INTERNAL-FIELD",
  inviteeA: "Invitee Of Alpha", inviteeB: "Invitee Of Beta", inviteeC: "Invitee Of Gamma",
  inviteePrefA: "pref-typed-at-alpha-invite", inviteeCityA: "Invitee City Alpha",
};

function unrelatedWorld() {
  const store = createStore({
    catalog: [card("k1", "Charizard"), card("k2", "Blastoise"), card("k3", "Venusaur"),
      card("k4", "Mewtwo"), card("k5", "Lugia")],
    collectors: [
      { id: "cA", name: "Casey Alpha-Only", short: "Casey A.", city: "Duluth", prefs: [MARK.prefA],
        note: MARK.legacyNoteA, since: "2020-02-02", last: "2026-08-01", binderReviewedAt: "2026-07-01" },
      { id: "cAB", name: "Robin Both-Networks", short: "Robin B.", city: "Eagan", prefs: [MARK.prefAB],
        note: MARK.legacyNoteAB, since: "2021-03-03", last: "2026-08-02", binderReviewedAt: "2026-07-02" },
      { id: "cB", name: "Blake Beta-Only", short: "Blake B.", city: "Roseville", prefs: [MARK.prefB],
        note: MARK.legacyNoteB, since: "2022-04-04", last: "2026-08-03", binderReviewedAt: "2026-07-03" },
      { id: "cX", name: "Xander No-Network", short: "Xander N.", city: "Nowhere", prefs: [MARK.prefX] },
    ],
    partners: [
      { id: "pA", name: "Alpha Cards", city: "Duluth", tradeRate: V.rateA, since: "2019-09-09",
        note: "Alpha public tagline", about: "Alpha about", specialties: ["Base Set"],
        website: "alpha.example.test", instagram: "@alpha", email: "shop@alpha.example.test" },
      { id: "pB", name: "Beta Breaks", city: "Roseville", tradeRate: V.rateB, since: "2018-08-08",
        note: "Beta public tagline", email: "shop@beta.example.test", internal: MARK.partnerPrivateB },
      { id: "pC", name: "Gamma Gaming", city: "Elsewhere", tradeRate: V.rateC },
    ],
    relationships: [
      { partnerId: "pA", collectorId: "cA", status: "accepted", at: "2024-01-01", note: MARK.relNoteA_A },
      { partnerId: "pA", collectorId: "cAB", status: "accepted", at: "2024-02-02",
        note: MARK.relNoteA_AB, binderReviewedAt: "2026-08-10", last: "2026-08-11" },
      { partnerId: "pB", collectorId: "cAB", status: "accepted", at: "2024-03-03",
        note: MARK.relNoteB_AB, binderReviewedAt: "2026-08-12" },
      { partnerId: "pB", collectorId: "cB", status: "accepted", at: "2024-04-04" },
    ],
    goals: [
      { id: "gA", collectorId: "cA", cardId: "k1", tier: "primary", note: "cA wants Charizard" },
      { id: "gAB", collectorId: "cAB", cardId: "k3", tier: "primary" },
      { id: "gAB2", collectorId: "cAB", cardId: "k5", tier: "primary" },
      { id: "gB", collectorId: "cB", cardId: "k1", tier: "primary", note: MARK.goalNoteB },
      { id: "gX", collectorId: "cX", cardId: "k1", tier: "primary" },
    ],
    preferences: [
      { collectorId: "cA", tags: [MARK.prefA] }, { collectorId: "cB", tags: [MARK.prefB] },
      { collectorId: "cAB", tags: [MARK.prefAB] }, { collectorId: "cX", tags: [MARK.prefX] },
    ],
    inventory: [
      { invId: "iA1", partnerId: "pA", cardId: "k1", ask: 4000, cost: V.costA1, acquired: V.acquiredA1,
        archived: false, addedAt: AT, cert: "PSA-A1", photos: shot("iA1") },
      { invId: "iA2", partnerId: "pA", cardId: "k2", ask: 900, cost: V.costA2, archived: false,
        addedAt: AT, cert: null, photos: { front: null, back: null } },
      { invId: "iA3", partnerId: "pA", cardId: "k3", ask: 700, cost: 11111, archived: true,
        addedAt: AT, cert: null, photos: shot("iA3") },
      { invId: "iA5", partnerId: "pA", cardId: "k5", ask: 1500, cost: V.costA5, archived: false,
        addedAt: AT, cert: "PSA-A5", photos: shot("iA5") },
      { invId: "iB1", partnerId: "pB", cardId: "k1", ask: 3900, cost: V.costB1, archived: false,
        addedAt: AT, cert: "PSA-B1", photos: shot("iB1") },
      { invId: "iB3", partnerId: "pB", cardId: "k3", ask: 800, cost: 22222, archived: false,
        addedAt: AT, cert: "PSA-B3", photos: shot("iB3") },
      { invId: "iC1", partnerId: "pC", cardId: "k1", ask: 3800, cost: V.costC1, archived: false,
        addedAt: AT, cert: "PSA-C1", photos: shot("iC1") },
    ],
    /* Every copy here is OWNED AND OFFERED (Phase 5 C2). This fixture exists to
       exercise the NETWORK boundary — who may see whose supply — so each copy
       has to be supply for that question to be asked at all. The other half of
       the rule, that an UNOFFERED copy is not supply even inside the network,
       is a different question and is proved in phase5-c2-collector-copy.cjs
       against its own fixture. Mixing the two here would make every network
       assertion below ambiguous about which rule excluded a row. */
    collectorCopies: [
      { id: "bA", collectorId: "cA", cardId: "k2", market: V.marketA, offered: true, photos: shot("bA"), cert: "PSA-bA", addedAt: AT },
      { id: "bAB1", collectorId: "cAB", cardId: "k4", market: V.marketAB1, offered: true, photos: shot("bAB1"), cert: "PSA-bAB1", addedAt: AT },
      { id: "bAB2", collectorId: "cAB", cardId: "k2", market: V.marketAB2, offered: true, photos: shot("bAB2"), cert: "PSA-bAB2", addedAt: AT },
      { id: "bB", collectorId: "cB", cardId: "k4", market: V.marketB, offered: true, photos: shot("bB"), cert: "PSA-bB", addedAt: AT },
      { id: "bX", collectorId: "cX", cardId: "k4", market: V.marketX, offered: true, photos: shot("bX"), cert: "PSA-bX", addedAt: AT },
    ],
    binders: [], binderEntries: [],
    interests: [
      { partnerId: "pA", binderId: "bA", at: AT }, { partnerId: "pA", binderId: "bAB1", at: AT },
      { partnerId: "pB", binderId: "bAB1", at: AT }, { partnerId: "pB", binderId: "bB", at: AT },
    ],
    conversations: [], opportunities: [],
    /* Activity rows: two owned, one legacy row with no owner (as recordNote wrote before Phase 2 Batch 2). */
    activity: [
      { id: "a1", partnerId: "pA", collectorId: "cAB", type: "note", text: MARK.actA, date: AT },
      { id: "a2", partnerId: "pB", collectorId: "cAB", type: "note", text: MARK.actB, date: AT },
      { id: "a3", collectorId: "cAB", type: "note", text: MARK.actLegacy, date: AT },
    ],
    photoRequests: [], copyReviews: [],
    /* Seeded, as Relationships are: no command invites an existing Collector. */
    invitations: [{ id: "invX", partnerId: "pC", collectorId: "cX", email: V.invEmailX, at: AT, acceptedAt: null }],
  });

  const pA = { partnerId: "pA" }, pB = { partnerId: "pB" }, pC = { partnerId: "pC" };
  const cA = { collectorId: "cA" }, cAB = { collectorId: "cAB" }, cB = { collectorId: "cB" };
  const ok = (r, what) => { if (!r.ok) throw new Error(`fixture step failed: ${what} (${r.refused})`); return r.value; };
  const x = (actor, cmd, payload, what) => ok(store.execute(actor, cmd, { at: AT, ...payload }), what || cmd);
  const opp = (id) => store.get().opportunities.find((o) => o.id === id);
  const row = (id) => opp(id).trade.cards[0].id;

  /* oA — cA ↔ Alpha, completed, with a traded binder copy and a signed balance. */
  const oA = x(cA, "startOpportunity", { goalId: "gA", invId: "iA1", amount: 3700 }, "oA offer");
  x(pA, "acceptPrice", { oppId: oA });
  x(cA, "proposeTradeSelection", { oppId: oA, binderIds: ["bA"] });
  x(pA, "reviewTradeCard", { oppId: oA, decision: "accepted" });
  x(cA, "proposeMarketValue", { oppId: oA, tradeCardId: row(oA), amount: 500 });
  x(pA, "acceptMarketValue", { oppId: oA, tradeCardId: row(oA) });
  x(pA, "proposeTradePercent", { oppId: oA, tradeCardId: row(oA), percent: 0.8 });
  x(cA, "acceptTradePercent", { oppId: oA, tradeCardId: row(oA) });
  x(pA, "acceptDeal", { oppId: oA });
  x(cA, "proposeFinalBalance", { oppId: oA, amount: -150 });
  x(pA, "acceptDeal", { oppId: oA });
  x(cA, "acceptDeal", { oppId: oA });
  x(pA, "proposeFulfillment", { oppId: oA, plan: { method: "meetup", location: "Alpha counter", date: "2026-09-05", time: "12:00" } });
  x(cA, "confirmFulfillmentPlan", { oppId: oA });
  x(pA, "confirmHandoff", { oppId: oA });
  x(cA, "confirmHandoff", { oppId: oA });

  /* oABA — cAB ↔ Alpha, completed, trading bAB1 away. Beta holds an interest in
     bAB1 too, so Beta must stop seeing that copy once Alpha's deal trades it. */
  const snap = {};
  snap.beforeOffer = store.get();
  const oABA = x(cAB, "startOpportunity", { goalId: "gAB2", invId: "iA5", amount: 1400 }, "oABA offer");
  snap.offered = store.get();
  x(pA, "acceptPrice", { oppId: oABA });
  snap.agreed = store.get();                                  // iA5 committed; bAB1 still free
  x(cAB, "proposeTradeSelection", { oppId: oABA, binderIds: ["bAB1"] });
  snap.reserved = store.get();                                // bAB1 reserved
  x(pA, "reviewTradeCard", { oppId: oABA, decision: "accepted" });
  snap.committed = store.get();                               // bAB1 committed
  x(cAB, "proposeMarketValue", { oppId: oABA, tradeCardId: row(oABA), amount: 1000 });
  x(pA, "acceptMarketValue", { oppId: oABA, tradeCardId: row(oABA) });
  x(pA, "proposeTradePercent", { oppId: oABA, tradeCardId: row(oABA), percent: 0.75 });
  x(cAB, "acceptTradePercent", { oppId: oABA, tradeCardId: row(oABA) });
  snap.valued = store.get();
  x(pA, "acceptDeal", { oppId: oABA });
  x(cAB, "proposeFinalBalance", { oppId: oABA, amount: 650 });
  snap.deal = store.get();
  x(pA, "acceptDeal", { oppId: oABA });
  x(cAB, "acceptDeal", { oppId: oABA });
  snap.fulfillment = store.get();
  x(pA, "proposeFulfillment", { oppId: oABA, plan: { method: "ship", location: "Eagan", date: "2026-09-06", time: "" } });
  x(cAB, "confirmFulfillmentPlan", { oppId: oABA });
  x(pA, "confirmHandoff", { oppId: oABA });
  x(cAB, "confirmHandoff", { oppId: oABA });
  snap.traded = store.get();                                  // completed: bAB1 traded, iA5 sold

  /* oB — cB ↔ Beta, at Deal with a standing signed balance. */
  const oB = x(cB, "startOpportunity", { goalId: "gB", invId: "iB1", amount: 3500 }, "oB offer");
  x(pB, "acceptPrice", { oppId: oB });
  x(cB, "chooseCashOnly", { oppId: oB });
  x(pB, "acceptDeal", { oppId: oB });
  x(cB, "proposeFinalBalance", { oppId: oB, amount: 3333 });

  /* oAB — cAB ↔ Beta, at Select Trade with a submitted (reserved) package. */
  const oAB = x(cAB, "startOpportunity", { goalId: "gAB", invId: "iB3", amount: 600 }, "oAB offer");
  x(pB, "acceptPrice", { oppId: oAB });
  x(cAB, "proposeTradeSelection", { oppId: oAB, binderIds: ["bAB2"] });

  /* Conversations — one per partner–collector–card, through the real command. */
  x(cA, "sendMessage", { partnerId: "pA", cardId: "k1", text: MARK.msgA });
  x(pA, "sendMessage", { collectorId: "cAB", cardId: "k4", text: MARK.msgAB_A });
  x(cAB, "sendMessage", { partnerId: "pB", cardId: "k3", text: MARK.msgAB_B });
  x(pB, "sendMessage", { collectorId: "cB", cardId: "k1", text: MARK.msgB });

  /* Review Card workflow and photo requests. */
  x(cA, "requestPhotos", { invId: "iA2" });
  x(cAB, "reviewCopy", { invId: "iB1" });

  /* Invitations — each partner's own. PHASE 5 BATCH 2: an invitation names
     nobody, so there is no invitee Collector to mint and the command returns
     the invitation's own id. The recipient is a label the partner typed, and
     it is partner-private: another partner must never read it. */
  const invA = x(pA, "inviteCollector", { recipient: MARK.inviteeA, note: V.invEmailA });
  const invB = x(pB, "inviteCollector", { recipient: MARK.inviteeB, note: V.invEmailB });
  const invC = x(pC, "inviteCollector", { recipient: MARK.inviteeC, note: V.invEmailC });

  return { store, AT, V, MARK, ids: { oA, oABA, oB, oAB,
    invA, invB, invC, invX: "invX" },
    snapshots: { oABA: snap },
    actors: { pA, pB, pC, cA, cAB, cB, cX: { collectorId: "cX" } } };
}

module.exports = { unrelatedWorld };
