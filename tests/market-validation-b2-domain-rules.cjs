/* ============================================================================
   MARKET VALIDATION — BATCH 2: DOMAIN RULES
   The Collector opens with a market-price offer; the Trusted Partner's `ask` is
   their Proposed Market Price, never a binding listing; nothing is agreed until
   the side that did NOT make the last proposal accepts it. Domain only — no
   screen and no production API sends these commands yet (see Section K).
     A. Open to Offers        the default: any positive opening, still unagreed
     B. Firm on Price         the opening must equal the captured price
     C. the snapshot          price and preference captured at the opening
     D. dollars or percent    one authoritative amount, in WHOLE dollars
     E. mutual agreement      the three paths, and no automatic advance
     F. one offer per card    across partners, per exact version, released on end
     G. decline and withdraw  distinct outcomes; both free the slot
     H. who may do what       authorization and privacy
     I. downstream            agreedPrice still feeds the same arithmetic
     J. counters              whole dollars or a share of the CAPTURED price, both sides
     K. no door yet           nothing reached the production allow-list
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const D = require("../domain/metyet-domain.js");
const P = require("../domain/metyet-projection.js");
const { validateWorld } = require("../domain/metyet-world.js");
const { createStore } = require("./fixture-store.cjs");
const RT = require("../domain/metyet-runtime.js");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");

const AT = "2026-10-08";
let seq = 0;
const runtime = () => RT.createRuntime({ now: () => AT, newId: (p = "") => `${p}${++seq}` });
const PH = { front: "f.jpg", back: "b.jpg" };
const TP = { partnerId: "nl" };
const TP2 = { partnerId: "sv" };
const A = { collectorId: "casey" };
const B = { collectorId: "jordan" };
const PLAN = { method: "meetup", date: "2026-10-20", time: "18:00", location: "Card shop" };

/* Two shops, two Collectors. Casey knows both shops; Jordan knows Northline. */
const world = (over = {}) => createStore({
  partners: [{ id: "nl", name: "Northline", tradeRate: 0.7 }, { id: "sv", name: "Silver Vale", tradeRate: 0.7 }],
  collectors: [{ id: "casey", name: "Casey" }, { id: "jordan", name: "Jordan" }],
  relationships: [
    { partnerId: "nl", collectorId: "casey", status: "accepted", at: AT },
    { partnerId: "sv", collectorId: "casey", status: "accepted", at: AT },
    { partnerId: "nl", collectorId: "jordan", status: "accepted", at: AT }],
  goals: [
    { id: "gA", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } },
    { id: "gY", collectorId: "casey", canonicalCardId: "cc-y", tier: "primary", desired: { grade: "PSA 9" } },
    { id: "gB", collectorId: "jordan", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } }],
  inventory: [
    { invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 30, grade: "PSA 9", photos: PH },
    { invId: "i2", partnerId: "sv", canonicalCardId: "cc-x", ask: 32, grade: "PSA 9", photos: PH },
    { invId: "i3", partnerId: "nl", canonicalCardId: "cc-y", ask: 50, grade: "PSA 9", photos: PH },
    { invId: "i4", partnerId: "nl", canonicalCardId: "cc-x", ask: 30, grade: "PSA 9", photos: PH }],
  collectorCopies: [], binders: [], binderEntries: [], opportunities: [], catalog: [],
  copyReviews: [], photoRequests: [], conversations: [], interests: [],
  ...over,
}, runtime());
const x = (st, actor, cmd, payload) => st.execute(actor, cmd, { at: AT, ...(payload || {}) });
const okv = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
const nov = (r, code, why) => eq(r && r.refused, code, why);
const opp = (st, id) => st.get().opportunities.find((o) => o.id === id);
const firm = (st, invId, on = true) => { const s = st.get(); s.inventory.find((i) => i.invId === invId).firmOnPrice = on; };
const json = (v) => JSON.stringify(v);
const valid = (st) => { const v = validateWorld(st.get()); assert(v.ok, "world invalid: " + json(v.errors)); };

/* ============================================================== A */
describe("A. Open to Offers is the default", () => {
  test("a copy with no preference takes any positive opening, and nothing is agreed", () => {
    const st = world();
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 25 }), "open below the price");
    const r = opp(st, o);
    eq(r.firmOnPrice, false, "captured as Open to Offers");
    eq(r.listedPrice, 30, "the Proposed Market Price, captured");
    eq(r.stage, "agree-price", "still at Market Validation");
    eq(r.agreedPrice, null, "nothing agreed");
    eq(json(r.priceThread.map((e) => [e.by, e.type, e.amount])), json([["collector", "offer", 25]]), "one opening offer");
    valid(st);
  });
  test("and above the price too — a proposal, not a bid floor", () => {
    const st = world();
    okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 34 }), "open above the price");
  });
});

/* ============================================================== B */
describe("B. Firm on Price governs the opening only", () => {
  test("the opening must equal the captured price, in dollars or as a share", () => {
    for (const [pay, why] of [[{ amount: 29 }, "below"], [{ amount: 31 }, "above"], [{ percent: 0.9 }, "90%"], [{ percent: 1.05 }, "105% ($32)"]]) {
      const st = world(); firm(st, "i1");
      nov(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", ...pay }), "firm-on-price", `firm refuses ${why}`);
      eq(st.get().opportunities.length, 0, "and nothing was created");
    }
    let st = world(); firm(st, "i1");
    eq(opp(st, okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 30 }), "exactly the price")).firmOnPrice, true, "captured as firm");
    st = world(); firm(st, "i1");
    eq(opp(st, okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", percent: 1 }), "100%")).priceThread[0].amount, 30, "100% is the price");
    /* Whole dollars: only the resolved amount counts, so a share that rounds to
       the price IS the price (101% of $30 = $30.30 → $30). */
    st = world(); firm(st, "i1");
    eq(opp(st, okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", percent: 1.01 }), "101% → $30")).priceThread[0].amount, 30, "rounds to the price");
  });
  test("a stored price with cents is the whole-dollar price it is shown as", () => {
    const st = world(); firm(st, "i1"); st.get().inventory.find((i) => i.invId === "i1").ask = 42.6;
    nov(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 42 }), "firm-on-price", "$42 is not $43");
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 43 }), "$43 is the price, in whole dollars");
    eq(opp(st, o).listedPrice, 42.6, "the stored snapshot is never rewritten");
    const s2 = world(); firm(s2, "i1"); s2.get().inventory.find((i) => i.invId === "i1").ask = 42.6;
    eq(opp(s2, okv(x(s2, A, "startOpportunity", { goalId: "gA", invId: "i1", percent: 1 }), "100%")).priceThread[0].amount, 43, "100% resolves to $43 too");
  });
  test("a Firm copy with no price cannot be opened at all", () => {
    const st = world(); firm(st, "i1"); st.get().inventory.find((i) => i.invId === "i1").ask = null;
    nov(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 30 }), "firm-on-price", "no price to match");
  });
  test("the partner may still counter — an outdated price is theirs to correct", () => {
    const st = world(); firm(st, "i1");
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 30 }), "firm opening");
    okv(x(st, TP, "proposePrice", { oppId: o, amount: 36 }), "the partner counters above its own old price");
    okv(x(st, A, "acceptPrice", { oppId: o }), "the Collector accepts the counter");
    eq(opp(st, o).agreedPrice, 36, "agreed at the counter");
  });
  test("after a counter the Collector may counter too — Firm is not a rule about the conversation", () => {
    const st = world(); firm(st, "i1");
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 30 }), "firm opening");
    okv(x(st, TP, "proposePrice", { oppId: o, amount: 36 }), "counter");
    okv(x(st, A, "proposePrice", { oppId: o, amount: 33 }), "the Collector counters back");
  });
});

/* ============================================================== C */
describe("C. the price and the preference are captured at the opening", () => {
  test("editing the shelf afterwards moves neither", () => {
    const st = world();
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 28 }), "open");
    const before = json(opp(st, o));
    okv(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { ask: 45, firmOnPrice: true } }), "the shop reprices and goes firm");
    eq(json(opp(st, o)), before, "the opportunity is byte-identical");
    eq(opp(st, o).listedPrice, 30, "still the old price");
    eq(opp(st, o).firmOnPrice, false, "still Open");
    okv(x(st, TP, "acceptPrice", { oppId: o }), "and the opening can still be accepted as made");
  });
  test("…and a firm opening stays firm if the shop relaxes later", () => {
    const st = world(); firm(st, "i1");
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 30 }), "firm open");
    okv(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { firmOnPrice: false, ask: 20 } }), "relax");
    eq(opp(st, o).firmOnPrice, true, "captured firm");
    eq(opp(st, o).listedPrice, 30, "captured price");
  });
});

/* ============================================================== D */
describe("D. whole dollars, or a share of the price — one amount", () => {
  test("90% of 30 is 27, the same as saying 27", () => {
    const s1 = world(); const s2 = world();
    const a = opp(s1, okv(x(s1, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 27 }), "dollars"));
    const b = opp(s2, okv(x(s2, A, "startOpportunity", { goalId: "gA", invId: "i1", percent: 0.9 }), "percent"));
    eq(a.priceThread[0].amount, 27, "dollars"); eq(b.priceThread[0].amount, 27, "percent resolves to the same");
    assert(!("basis" in a.priceThread[0]), "a dollar opening carries no basis");
    eq(json(b.priceThread[0].basis), json({ percent: 0.9 }), "a percent opening keeps its basis beside the amount");
    valid(s2);
  });
  test("a share resolves to the nearest whole dollar (Math.round), deterministically", () => {
    for (const [ask, pct, want] of [[120, 0.9, 108], [125, 0.9, 113], [33.33, 0.3333, 11], [99.99, 0.15, 15], [1234, 0.875, 1080], [10, 0.333, 3]]) {
      const st = world(); st.get().inventory.find((i) => i.invId === "i1").ask = ask;
      const o = opp(st, okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", percent: pct }), `${pct} of ${ask}`));
      eq(o.priceThread[0].amount, want, `${pct} × ${ask}`);
      assert(Number.isInteger(o.priceThread[0].amount), "an integer");
      eq(o.priceThread[0].amount, D.priceProposal(ask, { percent: pct }).amount, "one definition of the rounding");
    }
  });
  test("invalid amounts and shares are refused, and create nothing", () => {
    const bad = [{ amount: 0 }, { amount: -1 }, { amount: NaN }, { amount: "27" }, {},
      { amount: 27.5 }, { amount: 0.5 }, { amount: 27.01 }, { amount: 1e20 },
      { percent: 0 }, { percent: -0.1 }, { percent: NaN }, { percent: Infinity }, { percent: "0.9" },
      { amount: 27, percent: 0.9 }, { percent: 0.0001 }];
    for (const pay of bad) {
      const st = world(); st.get().inventory.find((i) => i.invId === "i1").ask = 30;
      nov(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", ...pay }), "invalid-amount", `refused ${json(pay)}`);
      eq(st.get().opportunities.length, 0, "nothing created");
    }
    const st = world(); st.get().inventory.find((i) => i.invId === "i1").ask = null;
    nov(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", percent: 0.9 }), "invalid-amount", "a share of no price");
  });
});

/* ============================================================== E */
describe("E. mutual agreement", () => {
  const agreed = (st, o, price) => { const r = opp(st, o); eq(r.agreedPrice, price, "the agreed value"); eq(r.stage, "select-trade", "and on to Select Trade"); };
  test("Collector offers → partner accepts", () => {
    const st = world(); const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 28 }), "offer");
    okv(x(st, TP, "acceptPrice", { oppId: o }), "accept"); agreed(st, o, 28);
  });
  test("Collector offers → partner counters → Collector accepts (no second partner confirmation)", () => {
    const st = world(); const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 25 }), "offer");
    okv(x(st, TP, "proposePrice", { oppId: o, amount: 29 }), "counter");
    okv(x(st, A, "acceptPrice", { oppId: o }), "accept"); agreed(st, o, 29);
    nov(x(st, TP, "acceptPrice", { oppId: o }), "wrong-stage", "there is nothing left for the partner to confirm");
  });
  test("Collector offers → partner counters → Collector counters → partner accepts", () => {
    const st = world(); const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 24 }), "offer");
    okv(x(st, TP, "proposePrice", { oppId: o, amount: 30 }), "counter");
    okv(x(st, A, "proposePrice", { oppId: o, amount: 27 }), "counter back");
    okv(x(st, TP, "acceptPrice", { oppId: o }), "accept"); agreed(st, o, 27);
    eq(json(opp(st, o).priceThread.map((e) => [e.by, e.type, e.amount])),
      json([["collector", "offer", 24], ["tp", "counter", 30], ["collector", "counter", 27], ["tp", "accept", 27]]), "the whole history kept");
  });
  test("offering exactly the partner's price advances nothing", () => {
    for (const isFirm of [false, true]) {
      const st = world(); if (isFirm) firm(st, "i1");
      const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 30 }), "at the price");
      eq(opp(st, o).stage, "agree-price", `${isFirm ? "firm" : "open"}: still waiting`);
      eq(opp(st, o).agreedPrice, null, "nothing agreed");
      eq(D.nextActor(opp(st, o)).actor, "partner", "the partner's turn");
      nov(x(st, A, "acceptPrice", { oppId: o }), "not-your-turn", "a Collector cannot accept their own offer");
    }
  });
});

/* ============================================================== F */
describe("F. one active offer per exact card", () => {
  test("a second opening on the same card is refused, whichever shop holds it", () => {
    const st = world();
    okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 28 }), "first, at Northline");
    nov(x(st, A, "startOpportunity", { goalId: "gA", invId: "i2", amount: 30 }), "already-negotiating", "a second, at Silver Vale");
    nov(x(st, A, "startOpportunity", { goalId: "gA", invId: "i4", amount: 30 }), "already-negotiating", "nor another copy at the same shop");
  });
  test("the rule is about the card, not the Goal — an active deal without this Goal still holds the slot", () => {
    /* The shape a Goal-free (inventory-started) offer will have. */
    const st = world({ opportunities: [{ id: "o-free", goalId: null, collectorId: "casey", partnerId: "nl",
      canonicalCardId: "cc-x", invId: "i4", stage: "agree-price", listedPrice: 30, firmOnPrice: false, agreedPrice: null,
      priceThread: [{ by: "collector", type: "offer", amount: 29, at: AT }], trade: { submitted: false, cards: [] },
      tradeRate: 0.7, deal: D.emptyDeal(), fulfillment: D.emptyFulfillment(), declined: false, completedAt: null, updated: AT }] });
    nov(x(st, A, "startOpportunity", { goalId: "gA", invId: "i2", amount: 30 }), "already-negotiating", "held by the Goal-free deal");
  });
  test("a different exact version is independent", () => {
    const st = world();
    okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 28 }), "cc-x");
    okv(x(st, A, "startOpportunity", { goalId: "gY", invId: "i3", amount: 45 }), "cc-y, at the same time");
  });
  test("another Collector is never blocked by Casey's offer", () => {
    const st = world();
    okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 28 }), "Casey");
    okv(x(st, B, "startOpportunity", { goalId: "gB", invId: "i4", amount: 27 }), "Jordan, same card, same shop");
  });
  test("a completed purchase frees the slot for the next copy", () => {
    const st = world();
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 30 }), "open");
    okv(x(st, TP, "acceptPrice", { oppId: o }), "agree");
    okv(x(st, A, "chooseCashOnly", { oppId: o }), "cash only");
    okv(x(st, TP, "acceptDeal", { oppId: o }), "tp final"); okv(x(st, A, "acceptDeal", { oppId: o }), "collector final");
    okv(x(st, TP, "proposeFulfillment", { oppId: o, plan: PLAN }), "plan"); okv(x(st, A, "confirmFulfillmentPlan", { oppId: o }), "confirm");
    okv(x(st, TP, "confirmHandoff", { oppId: o }), "handed"); okv(x(st, A, "confirmHandoff", { oppId: o }), "received");
    eq(opp(st, o).stage, "completed", "completed");
    okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i2", amount: 31 }), "a second copy of the same card, sequentially");
  });
});

/* ============================================================== G */
describe("G. decline and withdrawal", () => {
  test("the partner declines: a distinct outcome, history kept, slot freed", () => {
    const st = world();
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 20 }), "open");
    okv(x(st, TP, "proposePrice", { oppId: o, amount: 29 }), "counter");
    const thread = json(opp(st, o).priceThread);
    okv(x(st, TP, "declineOffer", { oppId: o, reason: "  not at that price  " }), "decline");
    const r = opp(st, o);
    eq(r.outcome, "declined", "declined, not merely ended"); eq(r.endedBy, "tp", "by the partner");
    eq(r.endedStage, "agree-price", "during Market Validation"); eq(r.endedReason, "not at that price", "reason trimmed");
    eq(json(r.priceThread), thread, "the price history is untouched");
    assert(!D.isActive(r), "no longer active"); valid(st);
    okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i2", amount: 30 }), "the Collector may open elsewhere");
  });
  test("the partner may decline on either turn, with or without a reason", () => {
    const st = world();
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 20 }), "open");
    okv(x(st, TP, "proposePrice", { oppId: o, amount: 29 }), "counter — now the Collector's turn");
    okv(x(st, TP, "declineOffer", { oppId: o }), "decline anyway");
    eq(opp(st, o).endedReason, null, "no reason is fine");
  });
  test("the Collector withdraws after a counter: ended, slot freed", () => {
    const st = world();
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 20 }), "open");
    okv(x(st, TP, "proposePrice", { oppId: o, amount: 29 }), "counter");
    okv(x(st, A, "cancelOpportunity", { oppId: o }), "withdraw — no reason needed before agreement");
    eq(opp(st, o).outcome, "ended", "ended"); eq(opp(st, o).endedBy, "collector", "by the Collector");
    okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i2", amount: 30 }), "slot freed");
  });
  test("decline is only for an unresolved value; after agreement the old rules stand", () => {
    const st = world();
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 30 }), "open");
    okv(x(st, TP, "acceptPrice", { oppId: o }), "agreed");
    nov(x(st, TP, "declineOffer", { oppId: o }), "wrong-stage", "too late to decline");
    okv(x(st, A, "chooseCashOnly", { oppId: o }), "cash only");
    okv(x(st, TP, "acceptDeal", { oppId: o }), "tp final"); okv(x(st, A, "acceptDeal", { oppId: o }), "collector final");
    nov(x(st, TP, "cancelOpportunity", { oppId: o }), "reason-required", "after final agreement a reason is still required");
    nov(x(st, TP, "declineOffer", { oppId: o }), "wrong-stage", "and decline is not a way around it");
  });
  test("a declined or withdrawn opportunity takes no further moves", () => {
    const st = world();
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 20 }), "open");
    okv(x(st, TP, "declineOffer", { oppId: o }), "decline");
    nov(x(st, A, "proposePrice", { oppId: o, amount: 25 }), "terminal", "no counter after decline");
    nov(x(st, TP, "acceptPrice", { oppId: o }), "terminal", "no accept after decline");
    nov(x(st, TP, "declineOffer", { oppId: o }), "terminal", "no second decline");
  });
});

/* ============================================================== H */
describe("H. who may do what", () => {
  test("only the participating partner may decline, counter or accept", () => {
    const st = world();
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 20 }), "open at Northline");
    nov(x(st, TP2, "declineOffer", { oppId: o }), "not-participant", "another shop cannot decline");
    nov(x(st, TP2, "acceptPrice", { oppId: o }), "not-participant", "nor accept");
    nov(x(st, TP2, "proposePrice", { oppId: o, amount: 25 }), "not-participant", "nor counter");
    nov(x(st, A, "declineOffer", { oppId: o }), "not-owner", "a Collector withdraws, they do not decline");
    nov(x(st, B, "proposePrice", { oppId: o, amount: 25 }), "not-participant", "another Collector has no say");
    nov(x(st, TP, "declineOffer", { oppId: "nope" }), "not-found", "an invented deal");
    eq(opp(st, o).declined, false, "still open");
  });
  test("a partner cannot open an offer, and a Collector cannot open at an unrelated shop", () => {
    const st = world();
    nov(x(st, TP, "startOpportunity", { goalId: "gA", invId: "i1", amount: 20 }), "not-owner", "a partner");
    nov(x(st, B, "startOpportunity", { goalId: "gB", invId: "i2", amount: 20 }), "no-relationship", "Jordan does not know Silver Vale");
  });
  test("the one-offer refusal speaks only of the Collector's own deals, and says the same thing whichever shop holds them", () => {
    const viaNl = world(); okv(x(viaNl, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 28 }), "at Northline");
    const viaSv = world(); okv(x(viaSv, A, "startOpportunity", { goalId: "gA", invId: "i2", amount: 30 }), "at Silver Vale");
    const r1 = x(viaNl, A, "startOpportunity", { goalId: "gA", invId: "i4", amount: 30 });
    const r2 = x(viaSv, A, "startOpportunity", { goalId: "gA", invId: "i4", amount: 30 });
    eq(json(r1), json(r2), "one answer, naming no shop");
  });
  test("each side sees the negotiation; nobody else does", () => {
    const st = world();
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", percent: 0.9 }), "open");
    okv(x(st, TP, "declineOffer", { oppId: o, reason: "no" }), "decline");
    const mine = P.projectForActor(st.get(), A).opportunities.find((y) => y.id === o);
    const theirs = P.projectForActor(st.get(), TP).opportunities.find((y) => y.id === o);
    assert(mine && theirs, "both participants see it");
    eq(mine.outcome, "declined", "the Collector is told it was declined");
    eq(theirs.firmOnPrice, false, "the partner sees the captured preference");
    eq(json(mine.priceThread[0].basis), json({ percent: 0.9 }), "and the opening's basis");
    assert(!P.projectForActor(st.get(), B).opportunities.some((y) => y.id === o), "another Collector sees nothing");
    assert(!P.projectForActor(st.get(), TP2).opportunities.some((y) => y.id === o), "another shop sees nothing");
  });
});

/* ============================================================== I */
describe("I. downstream arithmetic is untouched", () => {
  test("the agreed value is what the balance starts from, exactly as before", () => {
    const st = world();
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", percent: 0.9 }), "open at 27");
    okv(x(st, TP, "proposePrice", { oppId: o, amount: 29 }), "counter");
    okv(x(st, A, "acceptPrice", { oppId: o }), "agree");
    okv(x(st, A, "chooseCashOnly", { oppId: o }), "cash only");
    const r = opp(st, o);
    eq(r.agreedPrice, 29, "agreed");
    eq(D.calculatedBalance(r), 29, "the Collector pays the agreed value, with no trade credit");
    eq(D.finalBalance(r), 29, "and the final balance is the same until adjusted");
  });
  test("a world with captured snapshots still validates; a bad snapshot does not", () => {
    const st = world(); okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 28 }), "open");
    valid(st);
    const bad = JSON.parse(json(st.get())); bad.opportunities[0].firmOnPrice = "yes";
    const v = validateWorld(bad);
    assert(!v.ok && v.errors.some((e) => /firmOnPrice/.test(e.path)), "a non-boolean snapshot was accepted");
  });
});

/* ============================================================== J */
describe("J. counters: whole dollars, or a share of the price captured at the opening", () => {
  const priced = (ask) => { const st = world(); st.get().inventory.find((i) => i.invId === "i1").ask = ask; return st; };
  test("the brief's example: open at 90% of $120, partner counters at 95%, Collector accepts $114", () => {
    const st = priced(120);
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", percent: 0.9 }), "open at 90%");
    eq(opp(st, o).priceThread[0].amount, 108, "$108");
    okv(x(st, TP, "proposePrice", { oppId: o, percent: 0.95 }), "partner counters at 95%");
    eq(opp(st, o).priceThread[1].amount, 114, "$114, not 95% of $108");
    eq(json(opp(st, o).priceThread[1].basis), json({ percent: 0.95 }), "with its basis");
    okv(x(st, A, "acceptPrice", { oppId: o }), "accept");
    eq(opp(st, o).agreedPrice, 114, "agreed at $114"); assert(Number.isInteger(opp(st, o).agreedPrice), "an integer");
  });
  test("both sides may counter as a share; every share is of the captured price, even after the shop reprices", () => {
    const st = priced(120);
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 100 }), "open at $100");
    okv(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { ask: 200 } }), "the shop reprices to $200");
    okv(x(st, TP, "proposePrice", { oppId: o, percent: 0.97 }), "partner: 97%");
    eq(opp(st, o).priceThread[1].amount, 116, "97% of the captured $120 (116.4 → 116), not of $200");
    okv(x(st, A, "proposePrice", { oppId: o, percent: 0.92 }), "Collector: 92%");
    eq(opp(st, o).priceThread[2].amount, 110, "92% of $120 (110.4 → 110), not of the last counter");
    okv(x(st, TP, "acceptPrice", { oppId: o }), "partner accepts");
    eq(opp(st, o).agreedPrice, 110, "agreed $110");
  });
  test("whole-dollar counters from both sides are accepted; fractional ones are refused, by both sides", () => {
    const st = priced(120);
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 100 }), "open");
    for (const bad of [114.5, 0.99, 114.01]) {
      nov(x(st, TP, "proposePrice", { oppId: o, amount: bad }), "invalid-amount", `partner $${bad}`);
    }
    okv(x(st, TP, "proposePrice", { oppId: o, amount: 115 }), "partner $115");
    for (const bad of [104.5, 105.25]) {
      nov(x(st, A, "proposePrice", { oppId: o, amount: bad }), "invalid-amount", `Collector $${bad}`);
    }
    nov(x(st, A, "proposePrice", { oppId: o, amount: 105, percent: 0.9 }), "invalid-amount", "both at once");
    nov(x(st, A, "proposePrice", { oppId: o, percent: 0 }), "invalid-amount", "0%");
    okv(x(st, A, "proposePrice", { oppId: o, amount: 105 }), "Collector $105");
    eq(json(opp(st, o).priceThread.map((e) => e.amount)), json([100, 115, 105]), "only the whole-dollar proposals landed");
    assert(opp(st, o).priceThread.every((e) => Number.isInteger(e.amount)), "every stored amount is an integer");
  });
  test("a share of nothing is refused — an opening with no captured price can only be countered in dollars", () => {
    const st = world({ opportunities: [{ id: "o-old", goalId: "gA", collectorId: "casey", partnerId: "nl", canonicalCardId: "cc-x",
      invId: "i1", stage: "agree-price", listedPrice: null, agreedPrice: null,
      priceThread: [{ by: "collector", type: "offer", amount: 25, at: AT }], trade: { submitted: false, cards: [] },
      tradeRate: 0.7, deal: D.emptyDeal(), fulfillment: D.emptyFulfillment(), declined: false, completedAt: null, updated: AT }] });
    nov(x(st, TP, "proposePrice", { oppId: "o-old", percent: 0.9 }), "invalid-amount", "no captured price");
    okv(x(st, TP, "proposePrice", { oppId: "o-old", amount: 28 }), "dollars still work");
  });
  test("turns are unchanged: nobody counters twice in a row", () => {
    const st = priced(120);
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 100 }), "open");
    nov(x(st, A, "proposePrice", { oppId: o, percent: 0.9 }), "not-your-turn", "the Collector cannot counter their own offer");
    okv(x(st, TP, "proposePrice", { oppId: o, percent: 0.95 }), "partner");
    nov(x(st, TP, "proposePrice", { oppId: o, amount: 113 }), "not-your-turn", "nor the partner theirs");
  });
});

/* ============================================================== K */
describe("K. no production door yet", () => {
  /* RESTATED (Batch 3B). Batch 2 asserted none of the five was exposed; 3B
     exposed exactly those five, with the screens that send them. What is still
     true and still asserted: nothing past an agreed price joined them. */
  test("the price commands are on the production allow-list, and nothing past them", () => {
    for (const c of ["startOpportunity", "proposePrice", "acceptPrice", "declineOffer", "cancelOpportunity"]) {
      assert(EXPOSED_COMMANDS.includes(c), `${c} is not on the production allow-list`);
    }
    /* M3B B3 (founder-authorized) opened Value Trade's five with the shop's
       screen; everything past them is still shut. */
    for (const c of ["proposeTradeSelection", "chooseCashOnly",
      "acceptDeal", "proposeFinalBalance", "proposeFulfillment", "confirmHandoff", "setCopyPending"]) {
      assert(!EXPOSED_COMMANDS.includes(c), `${c} reached the production allow-list`);
    }
  });
});

/* ============================================================== L */
/* ENDING A DEAL (Batch 3B.1). Withdrawal, decline and ending after a price are
   three different things with three different doors:
     price open   Collector withdraws (cancelOpportunity, no reason needed)
                  partner declines (declineOffer) — and may NOT cancel instead
     price agreed either may end it (cancelOpportunity) with a non-blank reason
     both final   the same, and the outcome reads "cancelled"                  */
describe("L. ending a deal: withdrawal, decline, and ending after a price", () => {
  const BAD = [undefined, null, "", "   ", "\n\t", 42, true, {}, ["why"]];
  const agreedDeal = () => {
    const st = world();
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 28 }), "open");
    okv(x(st, TP, "acceptPrice", { oppId: o }), "agree");
    return { st, o };
  };
  test("before a price: the Collector withdraws with no reason — ended, by the Collector", () => {
    const st = world();
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 28 }), "open");
    okv(x(st, A, "cancelOpportunity", { oppId: o }), "withdraw");
    const r = opp(st, o);
    eq([r.outcome, r.endedBy, r.endedStage, r.endedReason, r.agreedPrice].join("|"), "ended|collector|agree-price||", "a withdrawal");
  });
  test("before a price: the partner declines — declined, and cancelling instead is refused", () => {
    const st = world();
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 28 }), "open");
    okv(x(st, TP, "proposePrice", { oppId: o, amount: 30 }), "even after countering");
    const before = JSON.stringify(st.get());
    for (const reason of [undefined, "not this one"]) {
      nov(x(st, TP, "cancelOpportunity", { oppId: o, reason }), "not-owner", `partner cancel, reason ${JSON.stringify(reason)}`);
    }
    eq(JSON.stringify(st.get()), before, "nothing written by either refusal");
    okv(x(st, TP, "declineOffer", { oppId: o }), "the partner's door");
    eq(opp(st, o).outcome, "declined", "declined, not ended");
  });
  test("after a price: either may end it with a reason, which is kept trimmed", () => {
    for (const [who, seat] of [[A, "collector"], [TP, "tp"]]) {
      const { st, o } = agreedDeal();
      okv(x(st, who, "cancelOpportunity", { oppId: o, reason: "  card was damaged  " }), `${seat} ends it`);
      const r = opp(st, o);
      eq([r.outcome, r.endedBy, r.endedStage, r.endedReason, r.agreedPrice].join("|"),
        `ended|${seat}|select-trade|card was damaged|28`, `${seat}: ended, with why, terms kept`);
    }
  });
  test("after a price: a missing, blank or non-string reason is refused, and nothing is written", () => {
    for (const who of [A, TP]) {
      const { st, o } = agreedDeal();
      const before = JSON.stringify(st.get());
      for (const reason of BAD) {
        nov(x(st, who, "cancelOpportunity", { oppId: o, ...(reason === undefined ? {} : { reason }) }),
          "reason-required", `reason ${JSON.stringify(reason)}`);
      }
      eq(JSON.stringify(st.get()), before, "nothing written");
    }
  });
  test("declining is not a way around it once a price is agreed", () => {
    const { st, o } = agreedDeal();
    nov(x(st, TP, "declineOffer", { oppId: o, reason: "no" }), "wrong-stage", "decline after agreement");
  });
  test("nobody else may end it, reason or not", () => {
    const st = world();
    const o = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 28 }), "open");
    for (const [who, label] of [[B, "another Collector"], [TP2, "another partner"]]) {
      nov(x(st, who, "cancelOpportunity", { oppId: o, reason: "because" }), "not-participant", label);
    }
    okv(x(st, TP, "acceptPrice", { oppId: o }), "agree");
    for (const [who, label] of [[B, "another Collector"], [TP2, "another partner"]]) {
      nov(x(st, who, "cancelOpportunity", { oppId: o, reason: "because" }), "not-participant", label + ", after a price");
    }
  });
  test("ending releases the Goal and the copy; an ended deal takes no further ending", () => {
    const { st, o } = agreedDeal();
    nov(x(st, A, "startOpportunity", { goalId: "gA", invId: "i2", amount: 31 }), "already-negotiating", "held while it lives");
    okv(x(st, A, "cancelOpportunity", { oppId: o, reason: "changed my mind" }), "ended");
    eq(D.goalState("gA", st.get().opportunities), "seeking", "the Goal is free");
    eq(D.inventoryCopyStatus("i1", st.get().opportunities, st.get().inventory), "available", "the copy is free");
    okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i2", amount: 31 }), "and a new offer may open");
    nov(x(st, TP, "cancelOpportunity", { oppId: o, reason: "again" }), "terminal", "no second ending");
  });
  test("after both final agreements: still a reason, and it reads as cancelled", () => {
    const { st, o } = agreedDeal();
    okv(x(st, A, "chooseCashOnly", { oppId: o }), "cash only");
    okv(x(st, TP, "acceptDeal", { oppId: o }), "partner final"); okv(x(st, A, "acceptDeal", { oppId: o }), "collector final");
    nov(x(st, TP, "cancelOpportunity", { oppId: o, reason: "  " }), "reason-required", "blank");
    okv(x(st, TP, "cancelOpportunity", { oppId: o, reason: "card lost in transit" }), "with a reason");
    eq([opp(st, o).outcome, opp(st, o).endedStage].join("|"), "cancelled|fulfillment", "cancelled after agreement");
  });
});

run();
