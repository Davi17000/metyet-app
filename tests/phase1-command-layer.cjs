/* ============================================================================
   PHASE 1 — CANONICAL COMMAND LAYER

   Domain enforcement, not UI hiding. Every test drives store.execute(actor,
   command, payload) — the one authoritative mutation boundary — and asserts on
   canonical state.

     A  command × actor × stage matrix
     B  one canonical turn owner, read identically by both personas
     C  terminal immutability (byte-identical state)
     D  Goal locks
     E  physical-copy rules (InventoryCopy, BinderCopy)
     F  final agreement belongs to the current economic state
     G  seeded randomized invariant checks
     H  product code has no raw mutation path
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");
const C = require("../domain/metyet-commands.js");
const { createStore } = require("../domain/metyet-store.js");
const { collectorView } = require("../domain/collector-view.js");
const TP = require("../dist/MetYet.cjs");

const R = D.REFUSE;
const AT = "2026-09-01";
const card = (id, o = {}) => ({ id, name: o.name || "Charizard", set: o.set || "Base Set",
  num: o.num || "4/102", print: "Holo", edition: "Unlimited", language: "English",
  grade: o.grade || "PSA 9", condition: o.condition || null, tags: [] });
const photos = (id) => ({ front: id + ":front", back: id + ":back" });

/* A small, fully related world. c3 and p3 exist but share no Relationship with
   the seats that act, so they are the non-participants. */
function world() {
  return createStore({
    catalog: [card("k1"), card("k2", { name: "Blastoise", num: "2/102" }),
      card("k4", { grade: "PSA 8" }), card("k5", { name: "Venusaur", num: "15/102" })],
    collectors: [{ id: "c1", name: "Casey" }, { id: "c2", name: "Dana" }, { id: "c3", name: "Eli" }],
    partners: [{ id: "p1", name: "Northline", tradeRate: 0.8 }, { id: "p2", name: "Second" },
      { id: "p3", name: "Stranger" }],
    relationships: [
      { partnerId: "p1", collectorId: "c1" }, { partnerId: "p1", collectorId: "c2" },
      { partnerId: "p2", collectorId: "c1" }, { partnerId: "p2", collectorId: "c2" },
    ],
    goals: [
      { id: "g1", collectorId: "c1", cardId: "k1", tier: "primary" },
      { id: "g2", collectorId: "c2", cardId: "k1", tier: "primary" },
      { id: "g3", collectorId: "c1", cardId: "k2", tier: "secondary" },
      { id: "g4", collectorId: "c3", cardId: "k1", tier: "primary" },
      { id: "g5", collectorId: "c1", cardId: "k4", tier: "primary" },
      { id: "g6", collectorId: "c1", cardId: "k5", tier: "primary" },
    ],
    inventory: [
      { invId: "i1", partnerId: "p1", cardId: "k1", ask: 1000, cost: 700, cert: "PSA 1", archived: false, photos: photos("i1") },
      { invId: "i2", partnerId: "p1", cardId: "k1", ask: 1100, cost: 800, cert: "PSA 2", archived: false, photos: photos("i2") },
      { invId: "i3", partnerId: "p2", cardId: "k1", ask: 1200, cost: 900, archived: false, photos: photos("i3") },
      { invId: "i4", partnerId: "p1", cardId: "k2", ask: 400, cost: 300, archived: false, photos: photos("i4") },
      { invId: "i5", partnerId: "p3", cardId: "k1", ask: 900, cost: 600, archived: false, photos: photos("i5") },
      { invId: "i6", partnerId: "p1", cardId: "k5", ask: 800, cost: 500, archived: false, photos: photos("i6") },
    ],
    collectorCopies: [
      { offered: true, id: "b1", collectorId: "c1", cardId: "k2", market: 350, cert: "PSA 11", photos: photos("b1") },
      { offered: true, id: "b2", collectorId: "c1", cardId: "k5", market: 200, cert: null, photos: photos("b2") },
      { offered: true, id: "b3", collectorId: "c2", cardId: "k2", market: 300, cert: null, photos: photos("b3") },
    ],
    interests: [], conversations: [], opportunities: [], preferences: [], activity: [],
  });
}

const TP1 = { partnerId: "p1" }, TP2 = { partnerId: "p2" }, TP3 = { partnerId: "p3" };
const C1 = { collectorId: "c1" }, C2 = { collectorId: "c2" }, C3 = { collectorId: "c3" };
const ok = (r, msg) => { assert(r && r.ok, (msg || "expected success") + " — refused: " + (r && r.refused)); return r.value; };
const no = (r, code, msg) => {
  assert(r && !r.ok, (msg || "expected refusal") + " — but it succeeded");
  if (code) eq(r.refused, code, msg || "refusal code");
};
const opp = (s, id) => s.get().opportunities.find((o) => o.id === id);
const snap = (s) => JSON.stringify(s.get());
const PLAN = { method: "meetup", date: "2026-09-20", time: "18:00", location: "Card shop" };

/* Canonical stage drivers. Each returns the opportunity id. */
const STEPS = {
  "agree-price": (s) => ok(s.execute(C1, "startOpportunity", { goalId: "g1", invId: "i1", amount: 900, at: AT })),
  "select-trade": (s) => { const id = STEPS["agree-price"](s); ok(s.execute(TP1, "acceptPrice", { oppId: id, at: AT })); return id; },
  "reserved": (s) => { const id = STEPS["select-trade"](s); ok(s.execute(C1, "proposeTradeSelection", { oppId: id, binderIds: ["b1"], at: AT })); return id; },
  "value-trade": (s) => { const id = STEPS.reserved(s); ok(s.execute(TP1, "reviewTradeCard", { oppId: id, decision: "accepted", at: AT })); return id; },
  "deal": (s) => {
    const id = STEPS["value-trade"](s);
    const row = () => opp(s, id).trade.cards[0].id;
    ok(s.execute(C1, "proposeMarketValue", { oppId: id, tradeCardId: row(), amount: 300, at: AT }));
    ok(s.execute(TP1, "acceptMarketValue", { oppId: id, tradeCardId: row(), at: AT }));
    ok(s.execute(TP1, "proposeTradePercent", { oppId: id, tradeCardId: row(), percent: 0.8, at: AT }));
    ok(s.execute(C1, "acceptTradePercent", { oppId: id, tradeCardId: row(), at: AT }));
    eq(opp(s, id).stage, "deal", "valuation settled into Deal");
    return id;
  },
  "fulfillment": (s) => { const id = STEPS.deal(s); ok(s.execute(TP1, "acceptDeal", { oppId: id, at: AT })); ok(s.execute(C1, "acceptDeal", { oppId: id, at: AT })); return id; },
  "plan-proposed": (s) => { const id = STEPS.fulfillment(s); ok(s.execute(TP1, "proposeFulfillment", { oppId: id, plan: PLAN, at: AT })); return id; },
  "plan-agreed": (s) => { const id = STEPS["plan-proposed"](s); ok(s.execute(C1, "confirmFulfillmentPlan", { oppId: id, at: AT })); return id; },
  "handed-off": (s) => { const id = STEPS["plan-agreed"](s); ok(s.execute(TP1, "confirmHandoff", { oppId: id, at: AT })); return id; },
  "completed": (s) => { const id = STEPS["handed-off"](s); ok(s.execute(C1, "confirmHandoff", { oppId: id, at: AT })); return id; },
  "cancelled": (s) => { const id = STEPS["value-trade"](s); ok(s.execute(C1, "cancelOpportunity", { oppId: id, at: AT })); return id; },
};
const at = (stage) => { const s = world(); const id = STEPS[stage](s); return { s, id, row: () => (opp(s, id).trade.cards[0] || {}).id }; };

/* ------------------------------------------------------------------ A */
/* One row per command: the stage it belongs to, the correct actor, the other
   participant, a non-participant, and the payload builder. */
const MATRIX = [
  { cmd: "proposePrice", stage: "agree-price", good: TP1, wrong: C1, outsider: TP3, pay: (x) => ({ oppId: x.id, amount: 950 }) },
  { cmd: "acceptPrice", stage: "agree-price", good: TP1, wrong: C1, outsider: TP2, pay: (x) => ({ oppId: x.id }) },
  { cmd: "proposeTradeSelection", stage: "select-trade", good: C1, wrong: TP1, outsider: C2, pay: (x) => ({ oppId: x.id, binderIds: ["b1"] }) },
  { cmd: "reviewTradeCard", stage: "reserved", good: TP1, wrong: C1, outsider: TP2, pay: (x) => ({ oppId: x.id, decision: "accepted" }) },
  { cmd: "withdrawTradeCard", stage: "reserved", good: C1, wrong: TP1, outsider: C2, pay: (x) => ({ oppId: x.id, tradeCardId: x.row() }) },
  { cmd: "proposeMarketValue", stage: "value-trade", good: C1, wrong: TP1, outsider: C2, pay: (x) => ({ oppId: x.id, tradeCardId: x.row(), amount: 300 }) },
  { cmd: "proposeFinalBalance", stage: "deal", good: TP1, wrong: C1, outsider: TP2, pay: (x) => ({ oppId: x.id, amount: 450 }) },
  { cmd: "acceptDeal", stage: "deal", good: TP1, wrong: C1, outsider: TP2, pay: (x) => ({ oppId: x.id }) },
  { cmd: "proposeFulfillment", stage: "fulfillment", good: TP1, wrong: C1, outsider: TP2, pay: (x) => ({ oppId: x.id, plan: PLAN }) },
  { cmd: "confirmFulfillmentPlan", stage: "plan-proposed", good: C1, wrong: TP1, outsider: C2, pay: (x) => ({ oppId: x.id }) },
  { cmd: "requestFulfillmentRevision", stage: "plan-proposed", good: C1, wrong: TP1, outsider: C2, pay: (x) => ({ oppId: x.id, note: "Sunday" }) },
  { cmd: "confirmHandoff", stage: "plan-agreed", good: TP1, wrong: C1, outsider: TP2, pay: (x) => ({ oppId: x.id }) },
  { cmd: "confirmHandoff", stage: "handed-off", good: C1, wrong: TP1, outsider: C2, pay: (x) => ({ oppId: x.id }), label: "receipt" },
  { cmd: "cancelOpportunity", stage: "value-trade", good: C1, wrong: null, outsider: C2, pay: (x) => ({ oppId: x.id }) },
];
/* Value-stage commands that need a prior move are covered separately below. */
const OTHER_STAGE = { "agree-price": "deal", "select-trade": "value-trade", reserved: "deal",
  "value-trade": "agree-price", deal: "select-trade", fulfillment: "deal",
  "plan-proposed": "deal", "plan-agreed": "deal", "handed-off": "deal" };

describe("A. command × actor × stage matrix", () => {
  for (const m of MATRIX) {
    const name = m.label ? `${m.cmd} (${m.label})` : m.cmd;
    test(`${name}: correct actor at ${m.stage} succeeds`, () => {
      const x = at(m.stage); ok(x.s.execute(m.good, m.cmd, { ...m.pay(x), at: AT }));
    });
    if (m.wrong) test(`${name}: the other participant is refused`, () => {
      const x = at(m.stage); const before = snap(x.s);
      const r = x.s.execute(m.wrong, m.cmd, { ...m.pay(x), at: AT });
      no(r); eq(snap(x.s), before, "refusal changed nothing");
    });
    test(`${name}: a non-participant is refused`, () => {
      const x = at(m.stage); const before = snap(x.s);
      const r = x.s.execute(m.outsider, m.cmd, { ...m.pay(x), at: AT });
      no(r); eq(snap(x.s), before, "refusal changed nothing");
    });
    if (OTHER_STAGE[m.stage] && m.cmd !== "cancelOpportunity") test(`${name}: the wrong stage is refused`, () => {
      const x = at(OTHER_STAGE[m.stage]); const before = snap(x.s);
      const r = x.s.execute(m.good, m.cmd, { ...m.pay(x), at: AT });
      no(r); eq(snap(x.s), before, "refusal changed nothing");
    });
    test(`${name}: a terminal opportunity is refused`, () => {
      for (const term of ["completed", "cancelled"]) {
        const x = at(term); const before = snap(x.s);
        no(x.s.execute(m.good, m.cmd, { ...m.pay(x), at: AT }), null, `${term}`);
        eq(snap(x.s), before, `${term}: nothing changed`);
      }
    });
  }

  test("acceptMarketValue / proposeTradePercent / acceptTradePercent follow the card's owner", () => {
    const x = at("value-trade"); const row = x.row();
    no(x.s.execute(TP1, "acceptMarketValue", { oppId: x.id, tradeCardId: row }), R.notYourTurn, "nothing to accept yet");
    ok(x.s.execute(C1, "proposeMarketValue", { oppId: x.id, tradeCardId: row, amount: 300 }));
    no(x.s.execute(C1, "acceptMarketValue", { oppId: x.id, tradeCardId: row }), R.notYourTurn, "not your own figure");
    no(x.s.execute(C2, "acceptMarketValue", { oppId: x.id, tradeCardId: row }), R.notParticipant);
    ok(x.s.execute(TP1, "acceptMarketValue", { oppId: x.id, tradeCardId: row }));
    no(x.s.execute(C1, "proposeTradePercent", { oppId: x.id, tradeCardId: row, percent: 0.9 }), R.notYourTurn, "the partner opens trade %");
    ok(x.s.execute(TP1, "proposeTradePercent", { oppId: x.id, tradeCardId: row, percent: 0.8 }));
    no(x.s.execute(TP1, "acceptTradePercent", { oppId: x.id, tradeCardId: row }), R.notYourTurn, "not your own figure");
    ok(x.s.execute(C1, "acceptTradePercent", { oppId: x.id, tradeCardId: row }));
    eq(opp(x.s, x.id).stage, "deal");
  });

  test("startOpportunity: correct collector succeeds; partner, outsider and unrelated pairs are refused", () => {
    const s = world();
    no(s.execute(TP1, "startOpportunity", { goalId: "g1", invId: "i1", amount: 900 }), R.notOwner, "only the collector opens");
    no(s.execute(C2, "startOpportunity", { goalId: "g1", invId: "i1", amount: 900 }), R.notOwner, "not their goal");
    no(s.execute(C3, "startOpportunity", { goalId: "g4", invId: "i1", amount: 900 }), R.noRelationship, "no Relationship");
    no(s.execute(C1, "startOpportunity", { goalId: "g1", invId: "i5", amount: 900 }), R.noRelationship, "partner outside the network");
    no(s.execute({ collectorId: "nobody" }, "startOpportunity", { goalId: "g1", invId: "i1", amount: 900 }), R.unknownActor);
    ok(s.execute(C1, "startOpportunity", { goalId: "g1", invId: "i1", amount: 900 }));
  });

  test("the payload can never assert a seat", () => {
    const x = at("agree-price"); const before = snap(x.s);
    no(x.s.execute(C1, "acceptPrice", { oppId: x.id, by: "tp", seat: "tp", partnerId: "p1" }), R.notYourTurn);
    no(x.s.execute({ collectorId: "c1", seat: "tp" }, "acceptPrice", { oppId: x.id }), R.notYourTurn);
    no(x.s.execute({ collectorId: "c1", partnerId: "p1" }, "acceptPrice", { oppId: x.id }), R.unknownActor, "two identities are no identity");
    eq(snap(x.s), before);
  });

  test("an unknown command is refused", () => {
    const s = world(); no(s.execute(C1, "patchOpportunity", {}), R.unknownCommand);
  });
});

/* ------------------------------------------------------------------ B */
const tpOwner = (o) => TP.nextAction(o).owner;
const collectorWho = (s, o) => collectorView(s.get(), o.collectorId).turnFor(o).who;

describe("B. one canonical turn owner", () => {
  const STATES = ["agree-price", "select-trade", "reserved", "value-trade", "deal",
    "fulfillment", "plan-proposed", "plan-agreed", "handed-off", "completed", "cancelled"];
  for (const stage of STATES) {
    test(`${stage}: both personas read the same actor, never both, never neither while work remains`, () => {
      const x = at(stage); const o = opp(x.s, x.id);
      const actor = D.nextActor(o).actor;
      eq(D.nextActor(o).actor, actor, "deterministic");
      const tpMine = tpOwner(o) === "tp";
      const colMine = collectorWho(x.s, o) === "me";
      assert(!(tpMine && colMine), "never both 'your move'");
      eq(tpMine, actor === "partner", "TP projection agrees with the canonical actor");
      eq(colMine, actor === "collector", "Collector projection agrees with the canonical actor");
      if (D.isActive(o)) assert(actor != null, "an active deal always has an actor");
      else eq(actor, null, "terminal deals have no actor");
    });
  }

  test("Deal: partner confirms first, collector second", () => {
    const x = at("deal"); const o = () => opp(x.s, x.id);
    eq(D.nextActor(o()).actor, "partner");
    no(x.s.execute(C1, "acceptDeal", { oppId: x.id }), R.notYourTurn, "collector cannot go first");
    ok(x.s.execute(TP1, "acceptDeal", { oppId: x.id }));
    eq(D.nextActor(o()).actor, "collector");
    no(x.s.execute(TP1, "acceptDeal", { oppId: x.id }), R.notYourTurn, "partner cannot confirm twice");
    ok(x.s.execute(C1, "acceptDeal", { oppId: x.id }));
    eq(o().stage, "fulfillment", "collector's confirmation advances");
  });

  test("Fulfillment: plan, confirm, partner handoff, collector receipt completes", () => {
    const x = at("fulfillment"); const o = () => opp(x.s, x.id);
    eq(D.nextActor(o()).reason, "plan");
    no(x.s.execute(C1, "confirmHandoff", { oppId: x.id }), R.notYourTurn, "no receipt before a plan");
    ok(x.s.execute(TP1, "proposeFulfillment", { oppId: x.id, plan: PLAN }));
    no(x.s.execute(TP1, "confirmHandoff", { oppId: x.id }), R.notYourTurn, "no handoff before the collector confirms the plan");
    ok(x.s.execute(C1, "confirmFulfillmentPlan", { oppId: x.id }));
    no(x.s.execute(C1, "confirmHandoff", { oppId: x.id }), R.notYourTurn, "collector's receipt waits for the partner's handoff");
    ok(x.s.execute(TP1, "confirmHandoff", { oppId: x.id }));
    eq(o().stage, "fulfillment", "the partner's handoff does not complete");
    ok(x.s.execute(C1, "confirmHandoff", { oppId: x.id }));
    eq(o().stage, "completed", "the collector's receipt completes");
  });

  test("Value Trade with several cards: one actor at a time, and the last mover keeps the turn while it holds a card", () => {
    const s = world();
    const id = STEPS["select-trade"](s);
    ok(s.execute(C1, "proposeTradeSelection", { oppId: id, binderIds: ["b1", "b2"] }));
    ok(s.execute(TP1, "reviewTradeCard", { oppId: id, decision: "accepted" }));
    const [r1, r2] = opp(s, id).trade.cards.map((c) => c.id);
    const actor = () => D.nextActor(opp(s, id)).actor;
    const never = () => { const o = opp(s, id); assert(!(tpOwner(o) === "tp" && collectorWho(s, o) === "me"), "never both"); };
    ok(s.execute(C1, "proposeMarketValue", { oppId: id, tradeCardId: r1, amount: 300 }));
    eq(actor(), "collector", "the collector still holds card 2, so it keeps the turn"); never();
    no(s.execute(TP1, "acceptMarketValue", { oppId: id, tradeCardId: r1 }), R.notYourTurn, "the partner waits");
    ok(s.execute(C1, "proposeMarketValue", { oppId: id, tradeCardId: r2, amount: 150 }));
    eq(actor(), "partner", "both cards now wait on the partner"); never();
    ok(s.execute(TP1, "proposeMarketValue", { oppId: id, tradeCardId: r1, amount: 280 }));   // card 1 -> collector
    eq(actor(), "partner", "the partner still holds card 2"); never();
    no(s.execute(C1, "acceptMarketValue", { oppId: id, tradeCardId: r1 }), R.notYourTurn, "the collector waits for the partner");
    ok(s.execute(TP1, "acceptMarketValue", { oppId: id, tradeCardId: r2 }));                  // card 2 -> partner opens %
    ok(s.execute(TP1, "proposeTradePercent", { oppId: id, tradeCardId: r2, percent: 0.8 }));  // card 2 -> collector
    eq(actor(), "collector", "the partner holds nothing, so the turn passes"); never();
    ok(s.execute(C1, "acceptMarketValue", { oppId: id, tradeCardId: r1 }));
  });
});

/* ------------------------------------------------------------------ C */
describe("C. terminal immutability", () => {
  const ATTEMPTS = (x) => [
    [TP1, "proposePrice", { oppId: x.id, amount: 1 }], [C1, "proposePrice", { oppId: x.id, amount: 1 }],
    [TP1, "acceptPrice", { oppId: x.id }], [C1, "acceptPrice", { oppId: x.id }],
    [C1, "proposeTradeSelection", { oppId: x.id, binderIds: ["b2"] }], [C1, "chooseCashOnly", { oppId: x.id }],
    [TP1, "reviewTradeCard", { oppId: x.id, decision: "rejected" }],
    [C1, "withdrawTradeCard", { oppId: x.id, tradeCardId: x.row() }],
    [C1, "proposeMarketValue", { oppId: x.id, tradeCardId: x.row(), amount: 1 }],
    [TP1, "acceptMarketValue", { oppId: x.id, tradeCardId: x.row() }],
    [TP1, "proposeTradePercent", { oppId: x.id, tradeCardId: x.row(), percent: 0.1 }],
    [C1, "acceptTradePercent", { oppId: x.id, tradeCardId: x.row() }],
    [TP1, "proposeFinalBalance", { oppId: x.id, amount: -9999 }], [C1, "proposeFinalBalance", { oppId: x.id, amount: 0 }],
    [TP1, "acceptDeal", { oppId: x.id }], [C1, "acceptDeal", { oppId: x.id }],
    [TP1, "proposeFulfillment", { oppId: x.id, plan: PLAN }],
    [C1, "confirmFulfillmentPlan", { oppId: x.id }], [C1, "requestFulfillmentRevision", { oppId: x.id, note: "x" }],
    [TP1, "confirmHandoff", { oppId: x.id }], [C1, "confirmHandoff", { oppId: x.id }],
    [TP1, "cancelOpportunity", { oppId: x.id, reason: "late" }], [C1, "cancelOpportunity", { oppId: x.id, reason: "late" }],
  ];
  for (const term of ["completed", "cancelled"]) {
    test(`${term}: every meaningful mutation leaves canonical state byte-identical`, () => {
      const x = at(term); const before = snap(x.s);
      for (const [actor, cmd, pay] of ATTEMPTS(x)) {
        const r = x.s.execute(actor, cmd, { ...pay, at: "2026-12-31" });
        assert(!r.ok, `${cmd} must be refused on a ${term} opportunity`);
        eq(snap(x.s), before, `${cmd} changed state`);
      }
    });
  }
  test("a cancelled-after-agreement deal keeps its terms and cannot be terminalized again", () => {
    const x = at("plan-agreed");
    no(x.s.execute(TP1, "cancelOpportunity", { oppId: x.id }), R.reasonRequired, "reason required after final agreement");
    const agreed = opp(x.s, x.id);
    ok(x.s.execute(TP1, "cancelOpportunity", { oppId: x.id, reason: "Card damaged", at: AT }));
    const o = opp(x.s, x.id);
    assert(D.cancelledAfterAgreement(o), "recorded as cancelled after agreement");
    eq(o.outcome, "cancelled"); eq(o.endedReason, "Card damaged"); eq(o.endedStage, "fulfillment");
    eq(o.agreedPrice, agreed.agreedPrice, "price kept");
    eq(JSON.stringify(o.trade), JSON.stringify(agreed.trade), "trade terms kept");
    eq(JSON.stringify(o.deal), JSON.stringify(agreed.deal), "final agreement kept");
    no(x.s.execute(C1, "cancelOpportunity", { oppId: x.id, reason: "again" }), R.terminal);
  });
});

/* ------------------------------------------------------------------ D */
describe("D. Goal locks", () => {
  test("an active Opportunity blocks demotion, removal and a second Opportunity; cancellation releases", () => {
    const x = at("agree-price");
    no(x.s.execute(C1, "updateGoalTier", { goalId: "g1", tier: "secondary" }), R.goalLocked, "no demotion");
    no(x.s.execute(C1, "removeGoal", { goalId: "g1" }), R.goalLocked, "no removal");
    no(x.s.execute(C1, "startOpportunity", { goalId: "g1", invId: "i2", amount: 900 }), R.alreadyNegotiating, "no second deal");
    ok(x.s.execute(C1, "cancelOpportunity", { oppId: x.id }));
    eq(D.goalState("g1", x.s.get().opportunities), "seeking", "derived: seeking again");
    ok(x.s.execute(C1, "updateGoalTier", { goalId: "g1", tier: "secondary" }), "demotion allowed after cancellation");
    ok(x.s.execute(C1, "updateGoalTier", { goalId: "g1", tier: "primary" }));
    ok(x.s.execute(C1, "startOpportunity", { goalId: "g1", invId: "i2", amount: 900 }), "a new deal may start");
  });
  test("only a Primary Goal opens an Opportunity", () => {
    const s = world();
    no(s.execute(C1, "startOpportunity", { goalId: "g3", invId: "i4", amount: 350 }), R.notPrimary);
    ok(s.execute(C1, "updateGoalTier", { goalId: "g3", tier: "primary" }));
    ok(s.execute(C1, "startOpportunity", { goalId: "g3", invId: "i4", amount: 350 }));
  });
  test("completion satisfies the Goal through derived state only", () => {
    const x = at("handed-off");
    const goalsBefore = JSON.stringify(x.s.get().goals);
    ok(x.s.execute(C1, "confirmHandoff", { oppId: x.id }));
    eq(JSON.stringify(x.s.get().goals), goalsBefore, "no goal record was written");
    eq(D.goalState("g1", x.s.get().opportunities), "satisfied");
  });
  test("mismatched goal / copy identity is refused", () => {
    const s = world();
    no(s.execute(C1, "startOpportunity", { goalId: "g5", invId: "i1", amount: 900 }), R.identityMismatch, "PSA 8 goal, PSA 9 copy");
  });
});

/* ------------------------------------------------------------------ E */
describe("E. TP InventoryCopy commitment", () => {
  test("competing offers before settlement; settlement commits; second commitment refused; no identity leak", () => {
    const s = world();
    const a = ok(s.execute(C1, "startOpportunity", { goalId: "g1", invId: "i1", amount: 900 }));
    const b = ok(s.execute(C2, "startOpportunity", { goalId: "g2", invId: "i1", amount: 950 }), "competing offer allowed");
    eq(D.inventoryCopyStatus("i1", s.get().opportunities), "available");
    ok(s.execute(TP1, "acceptPrice", { oppId: a }));
    eq(D.inventoryCopyStatus("i1", s.get().opportunities), "committed");
    const r = s.execute(TP1, "acceptPrice", { oppId: b });
    no(r, R.copyCommitted, "second commitment refused");
    eq(Object.keys(r).sort().join(","), "ok,refused", "the refusal carries no deal, collector or price");
    no(s.execute(TP1, "removeInventoryCopy", { invId: "i1" }), R.copyCommitted, "cannot archive a committed copy");
    no(s.execute(TP1, "updateInventoryCopy", { invId: "i1", patch: { cert: "PSA 999" } }), R.copyCommitted, "cert locked");
    no(s.execute(TP1, "updateInventoryCopy", { invId: "i1", patch: { cardId: "k4" } }), R.identityImmutable, "identity locked");
    ok(s.execute(TP1, "updateInventoryCopy", { invId: "i1", patch: { ask: 1050 } }), "non-identity facts still editable");
  });
  test("cancellation releases the copy; completion makes it Sold", () => {
    const x = at("value-trade");
    ok(x.s.execute(C1, "cancelOpportunity", { oppId: x.id }));
    eq(D.inventoryCopyStatus("i1", x.s.get().opportunities), "available", "released");
    const y = at("completed");
    eq(D.inventoryCopyStatus("i1", y.s.get().opportunities), "sold");
    no(y.s.execute(C2, "startOpportunity", { goalId: "g2", invId: "i1", amount: 900 }), R.copyUnavailable, "sold is not supply");
    const supply = collectorView(y.s.get(), "c2").partnersWith("k1").map((x2) => x2.inv.invId);
    assert(!supply.includes("i1"), "a sold copy is not listed as supply");
  });
});

describe("E. BinderCopy reservation and commitment", () => {
  test("draft reserves nothing; submission reserves; cross-deal reuse blocked", () => {
    const s = world();
    const a = STEPS["select-trade"](s);
    ok(s.execute(C1, "startOpportunity", { goalId: "g6", invId: "i6", amount: 700 }));
    const b = s.get().opportunities.find((o) => o.goalId === "g6").id;
    ok(s.execute(TP1, "acceptPrice", { oppId: b }));
    eq(D.collectorCopyStatus("b1", s.get().opportunities), "available", "nothing submitted: draft reserves nothing");
    ok(s.execute(C1, "proposeTradeSelection", { oppId: a, binderIds: ["b1"] }));
    eq(D.collectorCopyStatus("b1", s.get().opportunities), "reserved");
    no(s.execute(C1, "proposeTradeSelection", { oppId: b, binderIds: ["b1"] }), R.copyReserved, "cannot submit elsewhere");
    no(s.execute(C1, "removeCollectorCopy", { copyId: "b1" }), R.copyReserved);
    no(s.execute(C1, "proposeTradeSelection", { oppId: b, binderIds: ["b3"] }), R.notOwner, "only your own copies");
  });
  test("reserved withdrawal allowed before acceptance and releases the copy", () => {
    const x = at("reserved");
    ok(x.s.execute(C1, "withdrawTradeCard", { oppId: x.id, tradeCardId: x.row() }));
    eq(D.collectorCopyStatus("b1", x.s.get().opportunities), "available", "released");
    const o = opp(x.s, x.id);
    eq(o.trade.cards.length, 1, "the row stays as history");
    eq(o.stage, "deal", "nothing left to review: the package resolves to cash");
  });
  test("partner acceptance commits; committed withdrawal, removal and reuse blocked; cert locked", () => {
    const x = at("value-trade");
    eq(D.collectorCopyStatus("b1", x.s.get().opportunities), "committed");
    no(x.s.execute(C1, "withdrawTradeCard", { oppId: x.id, tradeCardId: x.row() }), R.copyCommitted, "no unilateral withdrawal");
    no(x.s.execute(C1, "removeCollectorCopy", { copyId: "b1" }), R.copyCommitted);
    no(x.s.execute(C1, "updateCollectorCopy", { copyId: "b1", patch: { cert: "PSA 77" } }), R.copyCommitted);
    ok(x.s.execute(C1, "updateCollectorCopy", { copyId: "b1", patch: { market: 360 } }), "private value still editable");
    ok(x.s.execute(C1, "startOpportunity", { goalId: "g6", invId: "i6", amount: 700 }));
    const b = x.s.get().opportunities.find((o) => o.goalId === "g6").id;
    ok(x.s.execute(TP1, "acceptPrice", { oppId: b }));
    no(x.s.execute(C1, "proposeTradeSelection", { oppId: b, binderIds: ["b1"] }), R.copyCommitted);
    ["deal", "fulfillment", "plan-agreed"].forEach((stage) => {
      const y = at(stage);
      no(y.s.execute(C1, "withdrawTradeCard", { oppId: y.id, tradeCardId: y.row() }), R.copyCommitted, `no withdrawal in ${stage}`);
    });
  });
  test("cancellation releases; completion makes it Traded; history references survive", () => {
    const x = at("cancelled");
    eq(D.collectorCopyStatus("b1", x.s.get().opportunities), "available");
    assert(x.s.get().collectorCopies.some((b) => b.id === "b1"), "copy stays in the binder");
    const y = at("completed");
    eq(D.collectorCopyStatus("b1", y.s.get().opportunities), "traded");
    eq(opp(y.s, y.id).trade.cards[0].binderId, "b1", "the completed deal still names the exact copy");
    no(y.s.execute(C1, "removeCollectorCopy", { copyId: "b1" }), R.copyCommitted, "history is not deleted");
  });
});

/* ------------------------------------------------------------------ F */
describe("F. final agreement belongs to the current economic state", () => {
  test("change the deal → reconfirm the deal", () => {
    const x = at("deal"); const o = () => opp(x.s, x.id);
    /* 1. economics settled */
    eq(o().stage, "deal");
    /* 2. partner confirms */
    ok(x.s.execute(TP1, "acceptDeal", { oppId: x.id }));
    assert(o().deal.tpAgreed, "partner confirmation in force");
    /* 3. cash changes */
    ok(x.s.execute(C1, "proposeFinalBalance", { oppId: x.id, amount: 400, at: AT }));
    /* 4. the partner's confirmation is no longer in force */
    eq(o().deal.tpAgreed, false, "partner confirmation lapsed");
    eq(D.currentCashFigure(o()), 400, "the new figure is current");
    eq(D.nextActor(o()).actor, "partner", "confirmation restarts with the partner");
    /* 5. the collector cannot rely on the stale confirmation */
    no(x.s.execute(C1, "acceptDeal", { oppId: x.id }), R.notYourTurn);
    eq(o().stage, "deal", "stale agreement did not advance the deal");
    /* 6. partner reconfirms */
    ok(x.s.execute(TP1, "acceptDeal", { oppId: x.id }));
    eq(o().stage, "deal", "not yet");
    /* 7. collector confirms  8. only then Fulfillment */
    ok(x.s.execute(C1, "acceptDeal", { oppId: x.id }));
    eq(o().stage, "fulfillment");
    eq(o().deal.agreedAdj, 400, "the agreed figure is the one both confirmed");
    eq(D.finalBalance(o()), 400);
    no(x.s.execute(TP1, "proposeFinalBalance", { oppId: x.id, amount: 1 }), R.wrongStage, "no economic change after agreement");
  });
  test("a partner proposal after confirming is not its turn; the same figure proposed again still restarts", () => {
    const x = at("deal"); const o = () => opp(x.s, x.id);
    ok(x.s.execute(TP1, "proposeFinalBalance", { oppId: x.id, amount: 500 }));
    ok(x.s.execute(TP1, "acceptDeal", { oppId: x.id }));
    no(x.s.execute(TP1, "proposeFinalBalance", { oppId: x.id, amount: 520 }), R.notYourTurn);
    ok(x.s.execute(C1, "proposeFinalBalance", { oppId: x.id, amount: 450 }));
    ok(x.s.execute(TP1, "proposeFinalBalance", { oppId: x.id, amount: 500 }), "back to the earlier figure");
    eq(o().deal.tpAgreed, false, "an agreement to an earlier state never revives");
  });
  test("a figure the partner proposes in its own workspace is the same signed balance on both seats", () => {
    /* The Trusted Partner workspace used to send a DELTA to proposeFinalBalance
       and add agreedAdj to its base, while the domain and the Collector treat
       the figure as the final signed balance — one agreement, two numbers. */
    const React = require("react");
    const TR = require("react-test-renderer");
    const App = require("../dist/Prototype.cjs").default;
    const U = require("./util.cjs");
    let r; TR.act(() => { r = TR.create(React.createElement(App)); });
    U.click(U.byClass(r, "myp-card")[0]);
    const store = r.root.findAll((nd) => nd.props && nd.props.store)[0].props.store;
    U.goProfile(r, "Nina Alvarez");
    const row = U.byClass(r, "cp-opp").find((nd) => U.text(nd).includes("Deal"));
    U.click(row.findAllByType("button").find((b) => U.text(b).trim() === "Open"));
    const nina = store.get().collectors.find((c) => c.name === "Nina Alvarez").id;
    const before = store.get().opportunities.find((x) => x.collectorId === nina && x.stage === "deal");
    assert(D.calculatedBalance(before) > 300, "the collector owes more than the figure proposed");
    const sw = U.byClass(r, "ws-stagework")[0];
    TR.act(() => { sw.findAllByType("input")[0].props.onChange({ target: { value: "300" } }); });
    U.click(sw.findAllByType("button").find((b) => U.text(b).includes("Propose balance")));
    const after = opp(store, before.id);
    eq(D.currentCashFigure(after), 300, "the domain holds the proposed final balance, not a delta");
    eq(D.cashReceipt(after).proposed.balance.direction, "collector-to-tp", "the collector still pays");
    assert(/You proposed Nina A\. pays you — \$300\./.test(U.text(U.byClass(r, "ws-stagework")[0])),
      "and the partner's workspace describes the same $300");
  });
});

/* ------------------------------------------------------------------ G */
function prng(seed) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

describe("G. seeded randomized invariant checks", () => {
  for (const seed of [7, 42, 2026]) {
    test(`seed ${seed}: 3,000 random commands never break an invariant`, () => {
      const rnd = prng(seed);
      const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
      const s = world();
      /* Open a few deals so the walk spends its steps inside the lifecycle. */
      s.execute(C1, "startOpportunity", { goalId: "g1", invId: "i1", amount: 900, at: AT });
      s.execute(C2, "startOpportunity", { goalId: "g2", invId: "i1", amount: 950, at: AT });
      s.execute(C1, "startOpportunity", { goalId: "g6", invId: "i6", amount: 700, at: AT });
      const actors = [TP1, TP2, TP3, C1, C2, C3];
      const terminalSnaps = new Map();
      const cmds = C.COMMAND_NAMES;
      for (let step = 0; step < 3000; step++) {
        const st = s.get();
        const opps = st.opportunities;
        const o = opps.length ? pick(opps) : null;
        let actor, cmd, pay;
        if (o && rnd() < 0.7) {
          const t = D.nextActor(o);
          actor = rnd() < 0.8 && t.actor ? (t.actor === "partner" ? { partnerId: o.partnerId } : { collectorId: o.collectorId }) : pick(actors);
          const row = pick(((o.trade && o.trade.cards) || []).concat([{}]));
          /* Mostly moves that fit the stage, some that do not, rare cancellation. */
          const BY_STAGE = { "agree-price": ["proposePrice", "acceptPrice", "acceptPrice"],
            "select-trade": ["proposeTradeSelection", "reviewTradeCard", "reviewTradeCard", "withdrawTradeCard", "chooseCashOnly"],
            "value-trade": ["proposeMarketValue", "acceptMarketValue", "proposeTradePercent", "acceptTradePercent", "withdrawTradeCard"],
            deal: ["proposeFinalBalance", "acceptDeal", "acceptDeal"],
            fulfillment: ["proposeFulfillment", "confirmFulfillmentPlan", "requestFulfillmentRevision", "confirmHandoff", "confirmHandoff"],
            completed: ["acceptPrice", "proposeFinalBalance", "confirmHandoff", "cancelOpportunity"] };
          const ALL = ["proposePrice", "acceptPrice", "proposeTradeSelection", "reviewTradeCard", "withdrawTradeCard",
            "proposeMarketValue", "acceptMarketValue", "proposeTradePercent", "acceptTradePercent",
            "proposeFinalBalance", "acceptDeal", "proposeFulfillment", "confirmFulfillmentPlan",
            "requestFulfillmentRevision", "confirmHandoff", "chooseCashOnly"];
          const roll = rnd();
          cmd = roll < 0.02 ? "cancelOpportunity" : roll < 0.8 ? pick(BY_STAGE[o.stage] || ALL) : pick(ALL);
          pay = { oppId: o.id, tradeCardId: row.id, amount: Math.round(rnd() * 1200) - 100,
            percent: Math.round(rnd() * 100) / 100, decision: pick(["accepted", "rejected"]),
            binderIds: pick([[], ["b1"], ["b2"], ["b1", "b2"], ["b3"]]), plan: pick([PLAN, {}]),
            reason: pick(["", "because"]), at: "2026-09-" + (10 + (step % 18)) };
        } else if (rnd() < 0.5) {
          /* Re-open deals as earlier ones end, so the walk keeps covering the lifecycle. */
          const g = pick(["g1", "g2", "g6", "g5", "g4"]);
          const goal = st.goals.find((x) => x.id === g);
          actor = goal ? { collectorId: goal.collectorId } : pick(actors);
          cmd = "startOpportunity";
          pay = { goalId: g, invId: pick(["i1", "i2", "i3", "i6"]), amount: 500 + Math.round(rnd() * 600), at: AT };
        } else {
          actor = pick(actors);
          cmd = pick(cmds);
          pay = { goalId: pick(["g1", "g2", "g3", "g4", "g5", "g6"]), invId: pick(["i1", "i2", "i3", "i4", "i5", "i6"]),
            amount: Math.round(rnd() * 1200), tier: pick(["primary", "secondary"]), binderId: pick(["b1", "b2", "b3"]),
            patch: pick([{ cert: "X" }, { ask: 10 }, { market: 5 }]), on: rnd() < 0.5, at: AT };
        }
        s.execute(actor, cmd, pay);
        const now = s.get();

        /* terminal records never change once terminal */
        for (const x of now.opportunities) {
          if (terminalSnaps.has(x.id)) {
            const { viewedAt, ...rest } = x;
            eq(JSON.stringify(rest), terminalSnaps.get(x.id), `step ${step}: terminal ${x.id} changed by ${cmd}`);
          } else if (!D.isActive(x)) {
            const { viewedAt, ...rest } = x; terminalSnaps.set(x.id, JSON.stringify(rest));
          }
        }
        /* one active negotiation per goal */
        const perGoal = {};
        now.opportunities.filter(D.isNegotiating).forEach((x) => { perGoal[x.goalId] = (perGoal[x.goalId] || 0) + 1; });
        Object.values(perGoal).forEach((n) => assert(n <= 1, `step ${step}: two active deals on one goal`));
        /* no InventoryCopy committed twice */
        const inv = {};
        now.opportunities.filter((x) => D.isActive(x) && x.agreedPrice != null)
          .forEach((x) => { inv[x.invId] = (inv[x.invId] || 0) + 1; });
        Object.values(inv).forEach((n) => assert(n <= 1, `step ${step}: an InventoryCopy committed twice`));
        /* no BinderCopy reserved/committed in two active packages */
        const held = {};
        now.opportunities.filter(D.isActive).forEach((x) => ((x.trade && x.trade.cards) || []).forEach((row) => {
          if (D.binderRowState(x, row)) held[row.binderId] = (held[row.binderId] || 0) + 1;
        }));
        Object.entries(held).forEach(([b, n]) => assert(n <= 1, `step ${step}: ${b} held by two active packages`));
        /* stage prerequisites and no stale final agreement */
        for (const x of now.opportunities) {
          const ix = D.STAGE_IX[x.stage];
          if (ix >= D.STAGE_IX["select-trade"]) assert(x.agreedPrice != null, `step ${step}: ${x.stage} without a price`);
          if (ix >= D.STAGE_IX["deal"]) assert(x.trade && x.trade.submitted, `step ${step}: ${x.stage} without a submitted package`);
          if (ix >= D.STAGE_IX["deal"] && x.trade.mode !== "cash") {
            assert(D.acceptedTradeCards(x).every(D.cardSettled), `step ${step}: ${x.stage} with unsettled cards`);
          }
          if (x.stage === "deal") assert(!x.deal.collectorAgreed, `step ${step}: collector agreement did not advance`);
          if (ix >= D.STAGE_IX["fulfillment"]) {
            assert(x.deal.tpAgreed && x.deal.collectorAgreed, `step ${step}: ${x.stage} without both final agreements`);
            const standing = (x.deal.adjThread || []).filter((e) => e.type === "propose").pop();
            if (standing) eq(x.deal.agreedAdj, standing.amount, `step ${step}: agreed figure is not the last proposal`);
          }
          if (x.stage === "completed") assert(x.fulfillment.collectorConfirmedPlan && x.fulfillment.tpHandoff
            && x.fulfillment.collectorReceipt, `step ${step}: completed without the handoff sequence`);
          if (D.isNegotiating(x)) {
            const g = now.goals.find((y) => y.id === x.goalId);
            assert(g && g.tier === "primary", `step ${step}: active deal on a non-primary or missing goal`);
          }
        }
        /* a successful cash change always clears final agreement */
        if (cmd === "proposeFinalBalance") {
          const x = now.opportunities.find((y) => y.id === pay.oppId);
          if (x && x.stage === "deal") {
            const last = (x.deal.adjThread || []).slice(-1)[0];
            if (last && last.type === "propose" && last.at === pay.at && last.amount === pay.amount) {
              assert(!x.deal.tpAgreed && !x.deal.collectorAgreed, `step ${step}: stale agreement survived a cash change`);
            }
          }
        }
      }
      const reached = new Set(s.get().opportunities.map((x) => x.stage));
      assert(reached.has("completed") && s.get().opportunities.some((x) => x.declined),
        "the walk reached both completion and cancellation");
    });
  }
});

/* ------------------------------------------------------------------ H */
describe("H. product code has no raw mutation path", () => {
  const ROOT = path.join(__dirname, "..");
  const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  const PRODUCT = ["src/MetYet.jsx", "collector/MetYetCollector.jsx", "shell/MetYetPrototype.jsx",
    "shared/CardIdentityPicker.jsx", "site-src/main.jsx", "dev/main.jsx"];
  /* Strip comments so prose that names the old helpers is not a false positive. */
  const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  test("no product file uses store.set, store.actions, patchOpportunity or a whole-collection setter", () => {
    for (const f of PRODUCT) {
      const src = code(read(f));
      assert(!/\.actions\b/.test(src), `${f} uses store.actions`);
      assert(!/patchOpportunity/.test(src), `${f} uses patchOpportunity`);
      assert(!/store\.set\(/.test(src), `${f} calls store.set`);
      assert(!/\buseShared\b/.test(src), `${f} uses a whole-collection setter`);
    }
  });
  test("fixture access is confined to DEMO-gated scenario loading", () => {
    for (const f of PRODUCT) {
      const lines = code(read(f)).split("\n");
      lines.forEach((l, i) => {
        if (/\.fixture\./.test(l)) {
          assert(/fixture\.(set|reset)\(/.test(l), `${f}:${i + 1} uses a fixture helper other than scenario set/reset`);
        }
      });
    }
    const shell = code(read("shell/MetYetPrototype.jsx"));
    assert(/DEMO && persona === "collector"/.test(shell), "the scenario loader stays DEMO-gated");
  });
  test("every product mutation names a canonical command", () => {
    for (const f of ["src/MetYet.jsx", "collector/MetYetCollector.jsx"]) {
      const src = code(read(f));
      const used = [...src.matchAll(/\b(?:run|exec|execute)\(\s*(?:[A-Za-z_.]+\s*,\s*)?"([a-zA-Z]+)"/g)].map((m) => m[1]);
      assert(used.length > 5, `${f} routes writes through the command layer`);
      used.forEach((name) => assert(C.COMMAND_NAMES.includes(name), `${f} calls unknown command ${name}`));
    }
  });
});

run();
