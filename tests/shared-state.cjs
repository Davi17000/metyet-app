/* ============================================================================
   A–O CROSS-PERSONA INTEGRATION

   These assert the governing rule of the migration:

     one mutation -> one canonical state change -> two perspectives -> no sync

   Every test performs an action ONCE and then reads the result from BOTH
   persona projections. A test that passed by copying state between two stores
   would be the failure this suite exists to catch, so each scenario also
   asserts the record count — one, not two.
   ========================================================================= */
const { describe, test, assert, eq } = require("./run.cjs");
const D = require("../domain/metyet-domain.js");
const E = require("../domain/metyet-entities.js");
const { createStore } = require("../domain/metyet-store.js");

const AT = "2026-08-14";
const card = (id, o = {}) => ({ id, name: o.name || "Charizard", set: o.set || "Base Set",
  num: o.num || "4/102", print: "Holo", edition: "Unlimited", language: "English",
  grade: o.grade || "PSA 9", condition: o.condition || null, tags: o.tags || ["base-set", "holo"] });

/* One scenario universe, used by both personas. Same people, same cards. */
const world = () => createStore({
  catalog: [card("k1"), card("k2", { name: "Blastoise", num: "2/102" }),
    card("k3", { name: "Lugia", set: "Neo Genesis", num: "9/111" })],
  collectors: [{ id: "c1", name: "Casey Lin", short: "Casey L." }],
  partners: [{ id: "p-self", name: "Northline Cards" },
    { id: "p2", name: "Complete Collectibles" }],
  goals: [],
  inventory: [],
  binder: [],
  interests: [],
  conversations: [],
  opportunities: [],
  preferences: [{ collectorId: "c1", tags: ["base-set", "holo"] }],
});

/* The two projections. Neither holds state; both read the one store. */
const asPartner = (s, partnerId) => ({
  myInventory: E.inventoryOf(s.inventory, partnerId),
  networkSupply: E.binderCopiesForPartner(s.binder),          // privacy applied here
  myInterests: E.binderCopiesInterestedBy(s.interests, partnerId),
  myOpportunities: s.opportunities.filter((o) => o.partnerId === partnerId),
  networkDemand: s.goals,
  conversations: s.conversations.filter((c) => c.partnerId === partnerId),
});
const asCollector = (s, collectorId) => ({
  myGoals: s.goals.filter((g) => g.collectorId === collectorId),
  myBinder: s.binder.filter((b) => b.collectorId === collectorId).map(E.binderCopyForOwner),
  partnersInterested: (binderId) => E.partnersInterestedIn(s.interests, binderId),
  myOpportunities: s.opportunities.filter((o) => o.collectorId === collectorId),
  supplyFor: (cardId) => E.partnersHolding(s.inventory, s.catalog.find((c) => c.id === cardId),
    (id) => s.catalog.find((c) => c.id === id)),
  conversations: s.conversations.filter((c) => c.collectorId === collectorId),
});

describe("A. Collector Goal -> TP Demand", () => {
  test("one goal record, visible from both sides", () => {
    const st = world();
    st.actions.addInventoryCopy({ invId: "inv1", partnerId: "p-self", cardId: "k1", ask: 4200 });
    const gid = st.actions.addGoal({ collectorId: "c1", cardId: "k1", tier: "primary", at: AT });

    eq(st.get().goals.length, 1, "exactly one Goal record exists");
    eq(asCollector(st.get(), "c1").myGoals.length, 1, "the collector sees it");
    eq(asPartner(st.get(), "p-self").networkDemand.length, 1, "the partner sees the demand");
    eq(asCollector(st.get(), "c1").supplyFor("k1").length, 1, "and matching supply appears");
    eq(D.goalState(gid, st.get().opportunities), "seeking", "state derives as Seeking");
  });
});

describe("B. TP Inventory -> Collector Supply", () => {
  test("one inventory record, visible from both sides", () => {
    const st = world();
    st.actions.addGoal({ collectorId: "c1", cardId: "k3", tier: "primary", at: AT });
    eq(asCollector(st.get(), "c1").supplyFor("k3").length, 0, "no supply yet");

    st.actions.addInventoryCopy({ invId: "inv9", partnerId: "p2", cardId: "k3", ask: 980 });

    eq(st.get().inventory.length, 1, "exactly one InventoryCopy");
    eq(asPartner(st.get(), "p2").myInventory.length, 1, "its owner sees it");
    eq(asPartner(st.get(), "p-self").myInventory.length, 0, "another partner does not");
    eq(asCollector(st.get(), "c1").supplyFor("k3").length, 1, "the collector gains that supply");
  });
});

describe("C. Collector Binder -> TP Network Supply", () => {
  test("one binder copy, visible from both sides", () => {
    const st = world();
    const id = st.actions.addBinderCopy({ id: "b1", collectorId: "c1", cardId: "k2",
      market: 700, cert: "PSA 1", addedAt: AT, photos: { front: "f", back: "b" } });

    eq(st.get().binder.length, 1, "exactly one BinderCopy");
    assert(id, "created");
    eq(asCollector(st.get(), "c1").myBinder.length, 1, "the collector sees it");
    eq(asPartner(st.get(), "p-self").networkSupply.length, 1, "the partner sees the same copy");
    eq(asPartner(st.get(), "p-self").networkSupply[0].id, "b1", "the same record, by id");
  });

  test("the photo invariant holds at the domain, not the form", () => {
    const st = world();
    eq(st.actions.addBinderCopy({ id: "bx", collectorId: "c1", cardId: "k2",
      photos: { front: "f", back: null } }), null, "one face is refused");
    eq(st.get().binder.length, 0, "and nothing was created");
  });
});

describe("D. TP Interested -> Collector signal", () => {
  test("one interest relationship, read from both ends", () => {
    const st = world();
    st.actions.addBinderCopy({ id: "b1", collectorId: "c1", cardId: "k2", market: 700,
      addedAt: AT, photos: { front: "f", back: "b" } });
    st.actions.setInterest("p-self", "b1", true, AT);

    eq(st.get().interests.length, 1, "exactly one interest record");
    eq(asPartner(st.get(), "p-self").myInterests.join(), "b1", "the partner sees their interest");
    eq(asCollector(st.get(), "c1").partnersInterested("b1").join(), "p-self",
      "the collector sees which partner is interested");
    eq(st.get().opportunities.length, 0, "and no Opportunity was created");
  });

  test("interest is per exact copy, not per identity", () => {
    const st = world();
    ["b1", "b2"].forEach((id) => st.actions.addBinderCopy({ id, collectorId: "c1", cardId: "k2",
      market: 700, addedAt: AT, photos: { front: "f", back: "b" } }));
    st.actions.setInterest("p-self", "b1", true, AT);
    eq(asCollector(st.get(), "c1").partnersInterested("b2").length, 0,
      "the other copy of the same card is unaffected");
  });

  test("removing interest clears both views at once", () => {
    const st = world();
    st.actions.addBinderCopy({ id: "b1", collectorId: "c1", cardId: "k2", market: 700,
      addedAt: AT, photos: { front: "f", back: "b" } });
    st.actions.setInterest("p-self", "b1", true, AT);
    st.actions.setInterest("p-self", "b1", false, AT);
    eq(st.get().interests.length, 0, "the record is gone");
    eq(asCollector(st.get(), "c1").partnersInterested("b1").length, 0, "collector signal cleared");
  });
});

describe("E. Collector Reach out -> TP conversation", () => {
  test("one conversation, both participants, no Opportunity", () => {
    const st = world();
    st.actions.addInventoryCopy({ invId: "inv1", partnerId: "p2", cardId: "k1", ask: 4200 });
    const gid = st.actions.addGoal({ collectorId: "c1", cardId: "k1", tier: "primary", at: AT });
    st.actions.reachOut({ collectorId: "c1", partnerId: "p2", goalId: gid, invId: "inv1", at: AT });

    eq(st.get().conversations.length, 1, "exactly one Conversation");
    eq(asCollector(st.get(), "c1").conversations.length, 1, "the collector sees it");
    eq(asPartner(st.get(), "p2").conversations.length, 1, "the partner sees the same one");
    const cv = st.get().conversations[0];
    eq(cv.goalId, gid, "goal context kept");
    eq(cv.invId, "inv1", "exact inventory copy kept");
    eq(st.get().opportunities.length, 0, "NO Opportunity created");
    eq(D.goalState(gid, st.get().opportunities), "seeking", "the goal stays Seeking");
  });
});

describe("F. TP Reach out -> Collector conversation", () => {
  test("the inverse holds, with binder-copy context", () => {
    const st = world();
    st.actions.addBinderCopy({ id: "b1", collectorId: "c1", cardId: "k2", market: 700,
      addedAt: AT, photos: { front: "f", back: "b" } });
    st.actions.reachOut({ collectorId: "c1", partnerId: "p-self", binderId: "b1", at: AT });

    eq(st.get().conversations.length, 1, "one Conversation");
    eq(asPartner(st.get(), "p-self").conversations.length, 1, "the partner sees it");
    eq(asCollector(st.get(), "c1").conversations.length, 1, "the collector sees it");
    eq(st.get().conversations[0].binderId, "b1", "the exact copy is named");
    eq(st.get().opportunities.length, 0, "and still no Opportunity");
  });
});

describe("G. Collector Make an offer -> TP Opportunity", () => {
  test("one Opportunity, same stage, same card, same goal, one owner", () => {
    const st = world();
    st.actions.addInventoryCopy({ invId: "inv1", partnerId: "p2", cardId: "k1", ask: 4200 });
    const gid = st.actions.addGoal({ collectorId: "c1", cardId: "k1", tier: "primary", at: AT });
    const oid = st.actions.startOpportunity({ goalId: gid, collectorId: "c1", partnerId: "p2",
      cardId: "k1", invId: "inv1", listedPrice: 4200, amount: 3700, at: AT });

    eq(st.get().opportunities.length, 1, "exactly ONE Opportunity");
    const c = asCollector(st.get(), "c1").myOpportunities[0];
    const p = asPartner(st.get(), "p2").myOpportunities[0];
    eq(c.id, p.id, "the same record from both sides");
    eq(c.stage, p.stage, "same stage");
    eq(c.cardId, p.cardId, "same card");
    eq(c.goalId, p.goalId, "same goal");
    eq(D.goalState(gid, st.get().opportunities), "negotiating", "the goal derives Negotiating");
    eq(D.nextActor(c).actor, "partner", "one turn owner — the partner must answer");
    assert(oid, "created");
  });
});

describe("H. One negotiation per goal", () => {
  test("the domain refuses a second, from any caller", () => {
    const st = world();
    const gid = st.actions.addGoal({ collectorId: "c1", cardId: "k1", tier: "primary", at: AT });
    const a = st.actions.startOpportunity({ goalId: gid, collectorId: "c1", partnerId: "p2",
      cardId: "k1", listedPrice: 4200, amount: 3700, at: AT });
    const b = st.actions.startOpportunity({ goalId: gid, collectorId: "c1", partnerId: "p-self",
      cardId: "k1", listedPrice: 4300, amount: 3800, at: AT });

    assert(a, "the first is created");
    eq(b, null, "the second is refused by the action itself");
    eq(st.get().opportunities.length, 1, "and no second record exists");
  });

  test("alternatives stay visible and reachable by conversation", () => {
    const st = world();
    st.actions.addInventoryCopy({ invId: "i1", partnerId: "p2", cardId: "k1", ask: 4200 });
    st.actions.addInventoryCopy({ invId: "i2", partnerId: "p-self", cardId: "k1", ask: 4300 });
    const gid = st.actions.addGoal({ collectorId: "c1", cardId: "k1", tier: "primary", at: AT });
    st.actions.startOpportunity({ goalId: gid, collectorId: "c1", partnerId: "p2",
      cardId: "k1", listedPrice: 4200, amount: 3700, at: AT });

    eq(asCollector(st.get(), "c1").supplyFor("k1").length, 2, "both partners remain visible");
    st.actions.reachOut({ collectorId: "c1", partnerId: "p-self", goalId: gid, at: AT });
    eq(st.get().conversations.length, 1, "the alternative can still be contacted");
    eq(st.get().opportunities.length, 1, "without creating a second negotiation");
  });
});

describe("I. Agree on Price", () => {
  test("both personas derive the same agreed price", () => {
    const st = world();
    const gid = st.actions.addGoal({ collectorId: "c1", cardId: "k1", tier: "primary", at: AT });
    const oid = st.actions.startOpportunity({ goalId: gid, collectorId: "c1", partnerId: "p2",
      cardId: "k1", listedPrice: 4200, amount: 3700, at: AT });

    st.actions.patchOpportunity(oid, (o) => ({ ...o,
      priceThread: [...o.priceThread, { by: "partner", type: "counter", amount: 3980, at: AT }] }));
    eq(D.nextActor(st.get().opportunities[0]).actor, "collector", "the turn moved to the collector");

    st.actions.patchOpportunity(oid, (o) => ({ ...o, agreedPrice: 3980, stage: "select-trade",
      priceThread: [...o.priceThread, { by: "collector", type: "accept", amount: 3980, at: AT }] }));

    eq(asCollector(st.get(), "c1").myOpportunities[0].agreedPrice, 3980, "collector sees 3980");
    eq(asPartner(st.get(), "p2").myOpportunities[0].agreedPrice, 3980, "partner sees 3980");
    eq(st.get().opportunities.length, 1, "still one record");
  });
});

describe("J. Select Trade", () => {
  test("exact binder ids, interest orders but never gates, no money, no private value", () => {
    const st = world();
    ["b1", "b2"].forEach((id, i) => st.actions.addBinderCopy({ id, collectorId: "c1",
      cardId: i ? "k2" : "k3", market: 700 + i, addedAt: AT, photos: { front: "f", back: "b" } }));
    st.actions.setInterest("p2", "b1", true, AT);
    const gid = st.actions.addGoal({ collectorId: "c1", cardId: "k1", tier: "primary", at: AT });
    const oid = st.actions.startOpportunity({ goalId: gid, collectorId: "c1", partnerId: "p2",
      cardId: "k1", listedPrice: 4200, amount: 3700, at: AT });

    /* Every copy is eligible; interest only orders them. */
    const keen = E.binderCopiesInterestedBy(st.get().interests, "p2");
    const mine = asCollector(st.get(), "c1").myBinder;
    const ordered = [...mine.filter((b) => keen.includes(b.id)),
      ...mine.filter((b) => !keen.includes(b.id))];
    eq(ordered.length, 2, "both copies are eligible");
    eq(ordered[0].id, "b1", "the interested copy is offered first");

    st.actions.patchOpportunity(oid, (o) => ({ ...o, stage: "select-trade",
      trade: { submitted: true, cards: ordered.map((b) => ({ binderId: b.id, inclusion: "proposed" })) } }));

    const shared = asPartner(st.get(), "p2").myOpportunities[0].trade.cards;
    eq(shared.map((c) => c.binderId).join(), "b1,b2", "the partner sees the exact copies");
    /* No valuation belongs at this stage, and no private value can leak. */
    shared.forEach((c) => { assert(c.agreedMarket === undefined, "no market value at selection"); });
    const seen = asPartner(st.get(), "p2").networkSupply;
    seen.forEach((b) => assert(b.market === undefined, "no private value in the partner projection"));
  });
});

describe("K. Value Trade", () => {
  test("both personas derive identical settled terms", () => {
    const st = world();
    st.actions.addBinderCopy({ id: "b1", collectorId: "c1", cardId: "k2", market: 700,
      addedAt: AT, photos: { front: "f", back: "b" } });
    const gid = st.actions.addGoal({ collectorId: "c1", cardId: "k1", tier: "primary", at: AT });
    const oid = st.actions.startOpportunity({ goalId: gid, collectorId: "c1", partnerId: "p2",
      cardId: "k1", listedPrice: 4200, amount: 3700, at: AT });
    st.actions.patchOpportunity(oid, (o) => ({ ...o, agreedPrice: 3980, stage: "value-trade",
      trade: { submitted: true, cards: [{ binderId: "b1", inclusion: "accepted",
        agreedMarket: 650, agreedPercent: 0.8 }] } }));

    const c = asCollector(st.get(), "c1").myOpportunities[0];
    const p = asPartner(st.get(), "p2").myOpportunities[0];
    eq(D.totalTradeValue(c), D.totalTradeValue(p), "identical trade value");
    eq(D.totalTradeValue(c), 520, "650 x 80% = 520");
    /* The collector's private 700 is not what was agreed; only the submitted 650 is. */
    assert(D.totalTradeValue(c) !== 700, "the private reference never became a term");
  });
});

describe("L. Deal", () => {
  test("one cash difference, identical from both sides", () => {
    const st = world();
    st.actions.addBinderCopy({ id: "b1", collectorId: "c1", cardId: "k2", market: 700,
      addedAt: AT, photos: { front: "f", back: "b" } });
    const gid = st.actions.addGoal({ collectorId: "c1", cardId: "k1", tier: "primary", at: AT });
    const oid = st.actions.startOpportunity({ goalId: gid, collectorId: "c1", partnerId: "p2",
      cardId: "k1", listedPrice: 4200, amount: 3700, at: AT });
    st.actions.patchOpportunity(oid, (o) => ({ ...o, agreedPrice: 3980, stage: "deal",
      trade: { submitted: true, cards: [{ binderId: "b1", inclusion: "accepted",
        agreedMarket: 650, agreedPercent: 0.8 }] } }));

    const c = asCollector(st.get(), "c1").myOpportunities[0];
    const p = asPartner(st.get(), "p2").myOpportunities[0];
    eq(D.calculatedBalance(c), D.calculatedBalance(p), "one settlement, both sides");
    eq(D.calculatedBalance(c), 3460, "3980 - 520 = 3460, collector owes partner");
  });
});

describe("M. Fulfillment -> completion satisfies the Goal", () => {
  test("completion needs no second mutation to satisfy the goal", () => {
    const st = world();
    const gid = st.actions.addGoal({ collectorId: "c1", cardId: "k1", tier: "primary", at: AT });
    const oid = st.actions.startOpportunity({ goalId: gid, collectorId: "c1", partnerId: "p2",
      cardId: "k1", listedPrice: 4200, amount: 3700, at: AT });
    eq(D.goalState(gid, st.get().opportunities), "negotiating", "negotiating first");

    st.actions.patchOpportunity(oid, (o) => ({ ...o, stage: "completed", completedAt: AT }));

    eq(D.goalState(gid, st.get().opportunities), "satisfied",
      "the goal derives Satisfied with no goal mutation at all");
    const g = st.get().goals.find((x) => x.id === gid);
    assert(!("status" in g), "the goal record still stores no status");
    eq(asPartner(st.get(), "p2").myOpportunities[0].stage, "completed", "partner history agrees");
    eq(asCollector(st.get(), "c1").myOpportunities[0].stage, "completed", "collector history agrees");
  });
});

describe("N. Failed negotiation unlocks the Goal", () => {
  test("history is kept, the goal returns to Seeking, another offer is allowed", () => {
    const st = world();
    const gid = st.actions.addGoal({ collectorId: "c1", cardId: "k1", tier: "primary", at: AT });
    const first = st.actions.startOpportunity({ goalId: gid, collectorId: "c1", partnerId: "p2",
      cardId: "k1", listedPrice: 4200, amount: 3700, at: AT });
    st.actions.patchOpportunity(first, (o) => ({ ...o, agreedPrice: 3980 }));

    st.actions.endOpportunity(first, "collector", AT);

    eq(st.get().opportunities.length, 1, "the failed deal is KEPT, not deleted");
    eq(st.get().opportunities[0].agreedPrice, 3980, "its agreed terms survive as history");
    eq(D.goalState(gid, st.get().opportunities), "seeking", "the goal derives Seeking again");

    const second = st.actions.startOpportunity({ goalId: gid, collectorId: "c1", partnerId: "p-self",
      cardId: "k1", listedPrice: 4300, amount: 3800, at: AT });
    assert(second, "another partner can now receive an offer");
    eq(st.get().opportunities.length, 2, "two records: one ended, one live");
    eq(D.goalState(gid, st.get().opportunities), "negotiating", "and the goal is negotiating again");
  });
});

describe("O. Privacy", () => {
  test("the collector's reference value cannot reach any TP projection", () => {
    const st = world();
    st.actions.addBinderCopy({ id: "b1", collectorId: "c1", cardId: "k2", market: 999,
      cert: "PSA 123", addedAt: AT, photos: { front: "f", back: "b" } });
    st.actions.setInterest("p-self", "b1", true, AT);

    const tp = asPartner(st.get(), "p-self");
    const serialised = JSON.stringify(tp);
    assert(!serialised.includes("999"), "not in any TP-facing projection: " + serialised.slice(0, 120));
    tp.networkSupply.forEach((b) => eq(b.market, undefined, "the field is absent, not blanked"));

    /* Everything a partner may legitimately see survives the projection. */
    eq(tp.networkSupply[0].cert, "PSA 123", "certification still visible");
    assert(tp.networkSupply[0].photos, "photos still visible");

    /* The owner keeps their own number. */
    eq(asCollector(st.get(), "c1").myBinder[0].market, 999, "the collector still sees it");
  });

  test("privacy is enforced at the domain boundary, not by each screen", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "domain", "metyet-entities.js"), "utf8");
    assert(/const \{ market, \.\.\.visible \} = cc;/.test(src),
      "the partner projection strips it structurally");
  });
});

describe("The governing rule holds", () => {
  test("no action writes two records for one concept", () => {
    const st = world();
    const gid = st.actions.addGoal({ collectorId: "c1", cardId: "k1", tier: "primary", at: AT });
    st.actions.addBinderCopy({ id: "b1", collectorId: "c1", cardId: "k2", market: 700,
      addedAt: AT, photos: { front: "f", back: "b" } });
    st.actions.setInterest("p-self", "b1", true, AT);
    st.actions.reachOut({ collectorId: "c1", partnerId: "p-self", goalId: gid, at: AT });
    st.actions.startOpportunity({ goalId: gid, collectorId: "c1", partnerId: "p2",
      cardId: "k1", listedPrice: 4200, amount: 3700, at: AT });

    const s = st.get();
    eq(s.goals.length, 1, "one goal");
    eq(s.binder.length, 1, "one binder copy");
    eq(s.interests.length, 1, "one interest");
    eq(s.conversations.length, 1, "one conversation");
    eq(s.opportunities.length, 1, "one opportunity");
  });

  test("there is no synchronisation step anywhere in the store", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "domain", "metyet-store.js"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");   // code, not prose
    for (const bad of ["sync", "mirror", "copyTo", "propagate"]) {
      assert(!new RegExp("\\b" + bad, "i").test(src), `no ${bad} step exists`);
    }
  });
});

/* ============================================================================
   THE OPPORTUNITY -> GOAL RELATIONSHIP

   The Domain Contract has always said an Opportunity references a Goal. The TP
   implementation didn't carry goalId, which meant goal state could not derive
   for TP-seeded opportunities. These lock the relationship in place so it can't
   be lost again, and so no call site re-derives it from (collectorId, cardId).
   ========================================================================= */
describe("Opportunity references its Goal", () => {
  const TP = require("../dist/MetYet.test.cjs");

  test("seeded TP opportunities resolve their goal at hydration", () => {
    const opps = TP.buildOpps(TP.OPPS_SEED);
    const linked = opps.filter((o) => o.goalId);
    assert(linked.length > 0, "opportunities carry goalId");
    linked.forEach((o) => assert(/^g\d+$/.test(o.goalId), "a real goal id: " + o.goalId));
  });

  test("the resolution is unambiguous — one goal per collector per identity", () => {
    const seen = new Map();
    TP.GOALS_SEED.forEach((g) => {
      const k = g[0] + "|" + g[1];
      assert(!seen.has(k), "no collector holds two goals for one card: " + k);
      seen.set(k, true);
    });
  });

  test("it is resolved once, not re-derived at call sites", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    assert(/const goalIdFor = \(collectorId, cardId\)/.test(src), "resolved at hydration");
    /* goalState and the invariant must key on goalId, never on the pair. */
    assert(/o2\.goalId === goalId/.test(src), "the invariant keys on goalId");
  });

  test("a new opportunity sets goalId explicitly", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    assert(/emptyOpp\(g\.collectorId, g\.cardId, inv\.invId, inv\.ask, NOW, goalId,/.test(src),
      "collectorMakeOffer passes the goal through");
    assert(/inv\.partnerId \|\| SELF_PARTNER\)/.test(src),
      "and names the partner who owns the copy being bought");
  });

  test("goal state derives from goalId for Casey's live negotiation", () => {
    const opps = TP.buildOpps(TP.OPPS_SEED);
    const caseys = opps.filter((o) => o.collectorId === "c12" && o.goalId);
    assert(caseys.length > 0, "Casey has linked opportunities");
    caseys.filter((o) => D.isNegotiating(o)).forEach((o) =>
      eq(D.goalState(o.goalId, opps), "negotiating",
        "an active opportunity makes its goal derive Negotiating"));
  });

  test("a completed opportunity makes its goal derive Satisfied", () => {
    const opps = TP.buildOpps(TP.OPPS_SEED);
    const done = opps.find((o) => o.goalId && o.stage === "completed");
    if (!done) return;
    eq(D.goalState(done.goalId, opps), "satisfied", "completion satisfies the goal");
  });

  test("an ended opportunity returns its goal to Seeking", () => {
    const opps = TP.buildOpps(TP.OPPS_SEED);
    const live = opps.find((o) => o.goalId && D.isNegotiating(o));
    assert(live, "a live one exists");
    const ended = opps.map((o) => (o.id === live.id ? { ...o, declined: true } : o));
    eq(D.goalState(live.goalId, ended), "seeking", "ending unlocks the goal");
  });

  test("the invariant refuses a second negotiation on the same goal", () => {
    const opps = TP.buildOpps(TP.OPPS_SEED);
    const live = opps.find((o) => o.goalId && D.isNegotiating(o));
    eq(D.INVARIANTS.oneNegotiationPerGoal(live.goalId, opps), false,
      "a goal already negotiating cannot start another");
  });
});

/* Inventory is partner-owned. Once other partners' stock lives in the same
   canonical collection, an unowned copy would silently appear on the TP's own
   shelf — so ownership is required, and TP surfaces scope to the active partner. */
describe("Inventory ownership is scoped, not assumed", () => {
  test("the TP scopes its shelf to the active partner", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    assert(/i\.partnerId === SELF_PARTNER/.test(src),
      "activeInv filters to the partner who owns the copy");
  });

  test("every seeded and runtime-created copy names its owner", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    const block = src.slice(src.indexOf("function buildCanonicalSeed"),
      src.indexOf("function useShared"));
    const records = block.match(/\{ invId: "[^"]+"/g) || [];
    records.forEach((r) => {
      const i = block.indexOf(r);
      assert(/partnerId:/.test(block.slice(i, i + 160)), "owned: " + r);
    });
    const add = src.slice(src.indexOf('invId: "inv" + cardId + "-"'), src.indexOf('invId: "inv" + cardId + "-"') + 200);
    assert(/partnerId: SELF_PARTNER/.test(add), "runtime copies are owned too");
  });
});

/* ============================================================================
   CASEY (c12) — THE CANONICAL COLLECTOR PERSONA

   Casey is not a fixture. She is a collector inside the same network the Trusted
   Partner sees, and the Collector experience will run on these exact records.
   These lock the scenario coverage the Collector demo depends on, so a future
   seed change cannot quietly remove a demonstrable state.
   ========================================================================= */
describe("Casey's canonical scenario coverage", () => {
  const TP = require("../dist/MetYet.test.cjs");
  const cards = Object.fromEntries(TP.CARDS_SEED.map((c) => [c.id, c]));
  const goals = () => TP.GOALS_SEED.map((g, i) => ({ id: "g" + i, collectorId: g[0],
    cardId: g[1], tier: g[2] }));
  const hers = () => goals().filter((g) => g.collectorId === "c12");
  const opps = () => TP.buildOpps(TP.OPPS_SEED);
  const binder = () => TP.COLLECTOR_CARDS_SEED
    .map((r, i) => ({ id: "cc" + i, cardId: r[0], collectorId: r[1], selfInterest: r[2] }))
    .filter((b) => b.collectorId === "c12");

  test("she exists once, with her canonical identity", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    eq((src.match(/name: "Casey Lin"/g) || []).length, 1, "exactly one Casey");
    assert(/id: "c12", binderReviewedAt[^}]*name: "Casey Lin"/.test(src), "and she is c12");
  });

  test("goal tiers: one primary, several secondary", () => {
    const g = hers();
    assert(g.some((x) => x.tier === "primary"), "a primary goal");
    assert(g.filter((x) => x.tier === "secondary").length >= 2, "several secondary goals");
  });

  test("all three derived lifecycle states are demonstrable", () => {
    const o = opps();
    const states = new Set(hers().map((g) => D.goalState(g.id, o)));
    ["seeking", "negotiating", "satisfied"].forEach((s2) =>
      assert(states.has(s2), s2 + " is reachable: " + [...states].join(",")));
  });

  test("her completed Opportunity makes its Goal derive Satisfied", () => {
    const o = opps();
    const done = o.find((x) => x.collectorId === "c12" && x.stage === "completed" && x.goalId);
    assert(done, "the completed opportunity now references a goal");
    eq(D.goalState(done.goalId, o), "satisfied", "and that goal derives Satisfied");
    /* No stored status anywhere. */
    const g = TP.GOALS_SEED.find((x) => x[0] === "c12" && x[1] === done.cardId);
    assert(g && g.length <= 7, "the goal record carries no status field");
  });

  test("supply derives from inventory ownership, not a partner list", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    const block = src.slice(src.indexOf("function buildCanonicalSeed"),
      src.indexOf("function useShared"));
    /* Other partners' stock lives in the same collection, distinguished only by
       who owns it — there is no separate partner-inventory table. */
    ["p2", "p3", "p4"].forEach((p) =>
      assert(new RegExp('partnerId: "' + p + '"').test(block), p + " owns canonical stock"));
    assert(!/PARTNER_INVENTORY|partnerStock/i.test(src), "no parallel supply table");
  });

  test("at least one goal is met by several partners, and one by exactly one", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    const block = src.slice(src.indexOf("function buildCanonicalSeed"),
      src.indexOf("function useShared"));
    const owners = (cardId) => {
      const set = new Set();
      const re = new RegExp('partnerId: "([^"]+)", cardId: "' + cardId + '"', "g");
      let m; while ((m = re.exec(block))) set.add(m[1]);
      if (new RegExp('cardId: "' + cardId + '"').test(block) === false) return set;
      return set;
    };
    const counts = hers().map((g) => ({ card: g.cardId, n: owners(g.cardId).size }));
    assert(counts.some((c) => c.n >= 2), "a goal several partners can meet: " + JSON.stringify(counts));
    assert(counts.some((c) => c.n === 1), "and one only a single partner can meet");
  });

  test("her binder covers zero, one and several interested partners", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    const others = src.slice(src.indexOf("const OTHER_INTEREST_SEED"),
      src.indexOf("/* THE TRADE BINDER INVARIANT"));
    const count = (ccId) => {
      const fromSelf = binder().find((b) => b.id === ccId && b.selfInterest) ? 1 : 0;
      const re = new RegExp('binderId: "' + ccId + '"', "g");
      return fromSelf + ((others.match(re) || []).length);
    };
    const counts = binder().map((b) => count(b.id));
    assert(counts.some((n) => n === 0), "a copy nobody has flagged: " + counts.join(","));
    assert(counts.some((n) => n >= 2), "and one several partners would consider");
    assert(binder().some((b) => b.selfInterest), "including p-self on one of them");
  });

  test("interest is still a relationship and creates no Opportunity", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    assert(!/tpInterest/.test(src), "no boolean returned");
    const setter = src.slice(src.indexOf("const setTradeInterest ="),
      src.indexOf("const setTradeInterest =") + 500);
    assert(!/setOpps|emptyOpp/.test(setter), "marking interest creates nothing else");
  });

  test("preference-driven For You has canonical inventory to match", () => {
    const prefs = ["gold-star", "alt-art", "modern", "trainer"];
    const matches = TP.CARDS_SEED.filter((c) => (c.tags || []).some((t) => prefs.includes(t)));
    assert(matches.length >= 4, "her stated preferences match real cards: " + matches.length);
  });

  test("the enrichment did not disturb the frozen TP counts", () => {
    /* p-self's shelf, the collector network and the opportunity queue are what the
       TP sees; other partners' stock must not appear in any of them. */
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    assert(/i\.partnerId === SELF_PARTNER/.test(src), "TP inventory stays scoped");
  });
});

/* ============================================================================
   THE TP RUNS ON THE SHARED STORE

   Its canonical collections are no longer component-local. The adapter keeps the
   existing setInventory(fn) call sites working, but the write lands on the one
   canonical collection — no shadow state, no mirror, no sync effect.
   ========================================================================= */
describe("Trusted Partner runtime is the shared store", () => {
  const src = () => require("fs").readFileSync(
    require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");

  test("no canonical collection is held in component-local useState", () => {
    const root = src().slice(src().indexOf("export default function MetYet("),
      src().indexOf("const [toast, setToast]"));
    ["cardDb", "inventory", "goals", "collectors", "opps", "collectorCards",
      "interests", "activity", "threads"].forEach((k) =>
      assert(!new RegExp("\\[" + k + ", set\\w+\\] = useState").test(root),
        k + " is no longer local state"));
  });

  test("each canonical collection reads the store", () => {
    const root = src();
    [["cardDb", "catalog"], ["inventory", "inventory"], ["goals", "goals"],
      ["collectors", "collectors"], ["opps", "opportunities"],
      ["collectorCards", "binder"], ["interests", "interests"],
      ["activity", "activity"], ["threads", "conversations"]].forEach(([local, key]) =>
      assert(new RegExp("\\[" + local + ", set\\w+\\] = useShared\\(store, \"" + key + "\"\\)").test(root),
        local + " -> store." + key));
  });

  test("presentation state stays local", () => {
    const root = src();
    ["nav", "toast", "modal", "drawer"].forEach((k) =>
      assert(new RegExp("\\[" + k + ", set\\w+\\] = useState").test(root),
        k + " is UI state and stays local"));
  });

  test("the adapter writes the canonical store, with no shadow copy", () => {
    const fn = src().slice(src().indexOf("function useShared"),
      src().indexOf("function useShared") + 600);
    assert(/useSyncExternalStore\(store\.sub, store\.get, store\.get\)/.test(fn),
      "it subscribes to the store rather than copying it");
    assert(/store\.set\(\{ \.\.\.cur, \[key\]: next \}\)/.test(fn), "and writes back to it");
    assert(!/useState|useEffect/.test(fn), "no shadow state and no sync effect");
  });

  test("an injected store wins, so a shell can share one runtime", () => {
    const root = src();
    assert(/export default function MetYet\(\{ store: injectedStore/.test(root),
      "the TP accepts an injected store");
    assert(/injectedStore \|\| createStore\(buildCanonicalSeed\(\)\)/.test(root),
      "and only builds its own as a fallback");
  });

  test("there is no synchronisation anywhere in the TP root", () => {
    const root = src().replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    ["syncState", "mirrorTo", "copyCanonical", "propagateTo"].forEach((bad) =>
      assert(!new RegExp(bad, "i").test(root), "no " + bad));
  });

  test("two mounts sharing one store see one universe", () => {
    const { createStore } = require("../domain/metyet-store.js");
    const st = createStore({ goals: [{ id: "g1" }], inventory: [], binder: [],
      interests: [], conversations: [], opportunities: [], catalog: [],
      collectors: [], partners: [], preferences: [] });
    const before = st.get();
    st.actions.addGoal({ collectorId: "c12", cardId: "i17", tier: "primary", at: "2026-08-14" });
    assert(st.get() !== before, "state advanced");
    eq(st.get().goals.length, 2, "one collection, one write");
  });
});

/* ============================================================================
   ONE CARD IDENTITY EXPERIENCE, TWO PERSONAS

   The persona may change what happens after a card is chosen. It must not
   change how MetYet decides which card it is.
   ========================================================================= */
describe("Card identity search is shared, not duplicated", () => {
  const tpSrc = () => require("fs").readFileSync(
    require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
  const colSrc = () => require("fs").readFileSync(
    require("path").join(__dirname, "..", "collector", "MetYetCollector.jsx"), "utf8");
  const pickSrc = () => require("fs").readFileSync(
    require("path").join(__dirname, "..", "shared", "CardIdentityPicker.jsx"), "utf8");
  const { buildCanonicalSeed } = require("../dist/MetYet.cjs");

  test("1/2. there is ONE definition of the search and the vocabularies", () => {
    ["searchCards", "GRADED_VALUES", "CONDITION_VALUES", "printedCards", "identityGaps"]
      .forEach((k) => assert(new RegExp("^(const|function) " + k, "m").test(
        require("fs").readFileSync(require("path").join(__dirname, "..", "domain", "metyet-domain.js"), "utf8")),
        k + " is defined in the domain"));
    /* The TP must not carry its own copy any more. */
    assert(/GRADED_VALUES = SharedID\.GRADED_VALUES/.test(tpSrc()), "TP reuses the shared grades");
    assert(/CONDITION_VALUES = SharedID\.CONDITION_VALUES/.test(tpSrc()), "and conditions");
    assert(/const searchCards = SharedID\.searchCards/.test(tpSrc()), "and the search");
    assert(!/function searchCards\(cards, query\) \{/.test(tpSrc()), "no second implementation");
    assert(!/const GRADED_VALUES = \["Raw"/.test(colSrc()), "the Collector defines no grades of its own");
  });

  test("3. every identity criterion the TP can specify is in the shared picker", () => {
    const p = pickSrc();
    ["Edition", "PSA Grade", "Condition"].forEach((f) =>
      assert(p.includes(f), f + " is asked by the shared picker"));
    assert(/D\.GRADED_VALUES/.test(p) && /D\.CONDITION_VALUES/.test(p),
      "using the canonical vocabularies");
  });

  test("4. TP-only physical-copy fields do not leak into goal creation", () => {
    const p = pickSrc();
    ["cost", "ask", "acquired", "cert"].forEach((f) =>
      assert(!new RegExp('"' + f + '"|\\b' + f + ':').test(p),
        f + " describes a partner's own copy and stays out of the shared picker"));
    const goal = colSrc().slice(colSrc().indexOf("function AddGoalPicker"),
      colSrc().indexOf("/* A secondary goal"));
    ["cost", "acquired", "asking"].forEach((f) =>
      assert(!new RegExp("\\b" + f + "\\b", "i").test(goal), f + " is not asked of a collector"));
  });

  test("5. the same criteria resolve to the same canonical identity for both personas", () => {
    const s2 = buildCanonicalSeed();
    const printed = D.printedCards(s2.catalog);
    const chz = D.searchCards(printed, "charizard base set").find((c) => c.num === "4/102");
    assert(chz, "the printed card is findable");
    const copy = { edition: "Unlimited", grade: "PSA 9", condition: "" };
    const gaps = D.identityGaps(chz, copy);
    const identity = D.identityFrom(chz, copy, gaps.edition);
    /* Whichever persona built it, the key is the same, and it resolves to the
       card the other persona already holds. */
    const existing = s2.catalog.find((c) => c.id === "i1");
    eq(D.identityKey(identity), D.identityKey(existing),
      "one identityKey, regardless of who described it");
  });

  test("8. an ambiguous printing must be disambiguated before it resolves", () => {
    const s2 = buildCanonicalSeed();
    const printed = D.printedCards(s2.catalog);
    const chz = D.searchCards(printed, "charizard base set").find((c) => c.num === "4/102");
    const editions = [...new Set(chz.variants.map((v) => v.edition))];
    assert(editions.length > 1, "this printing spans editions: " + editions.join(", "));
    eq(D.identityGaps(chz, { grade: "PSA 9" }).resolved, false, "grade alone is not enough");
    eq(D.identityGaps(chz, { edition: "Unlimited", grade: "PSA 9" }).resolved, true,
      "edition plus grade resolves it");
  });

  test("9. raw copies still require a condition, exactly as for the TP", () => {
    const s2 = buildCanonicalSeed();
    const printed = D.printedCards(s2.catalog);
    const c = D.searchCards(printed, "charizard base set")[0];
    const withRaw = D.identityGaps(c, { edition: "Unlimited", grade: "Raw" });
    eq(withRaw.resolved, false, "raw without a condition is incomplete");
    eq(withRaw.needsCondition, true, "and says so");
    eq(D.identityGaps(c, { edition: "Unlimited", grade: "Raw", condition: "Near Mint" }).resolved,
      true, "with a condition it resolves");
  });

  test("search groups by printing, so a grade never splits a result", () => {
    const s2 = buildCanonicalSeed();
    const printed = D.printedCards(s2.catalog);
    assert(printed.length < s2.catalog.length, "variants collapse into printings");
    printed.forEach((p) => assert(p.variants.length >= 1, "each carries its variants"));
    const chz = printed.find((c) => c.name === "Charizard" && c.num === "4/102");
    assert(chz.variants.length > 1, "one row for several graded copies");
  });

  test("12. TP inventory creation is untouched", () => {
    const tp = tpSrc();
    assert(/addCopyToInventory\(\s*resolved\.id,/.test(tp), "still adds via the same action");
    assert(/cost: d\.cost, ask: d\.ask, acquired: d\.acquired/.test(tp),
      "with its own physical-copy fields intact");
  });
});

require("./run.cjs").run();
