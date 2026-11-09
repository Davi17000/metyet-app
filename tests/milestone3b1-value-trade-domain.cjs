/* ============================================================================
   M3B B1 — VALUE TRADE IN THE DOMAIN: WHOLE NUMBERS, AND THE PARTNER MAY DECLINE

   Two founder-approved changes to the canonical command layer, with nothing
   exposed to production yet (the server's allow-list is B2's):

     D1  a proposed market value is a whole number of dollars; a proposed trade
         percentage is a whole number from 1% to 100% (stored, as it always was,
         as a fraction: 0.8 = 80%). Accepting is unchanged — an agreed value is
         only ever the other side's standing proposal.
     D2  `declineTradeCard` — the partner declines one card during Value Trade,
         at any turn (D8), with an optional note of at most 140 characters (D7).
         The row becomes "rejected" with when and at which stage; its history
         stays; it holds nothing, owns no turn and earns no credit; the other
         cards keep their agreements; no card left → Select Trade; every card
         left settled → Deal. Nothing is written to the copy or the shop's stock.

     A  whole numbers               E  retries, races, stale screens
     B  declining, at every point   F  the world rules
     C  what a decline leaves alone  G  who can see it
     D  who may decline              H  through the real schema
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const { PGlite } = require("@electric-sql/pglite");
const D = require("../domain/metyet-domain.js");
const P = require("../domain/metyet-projection.js");
const W = require("../domain/metyet-world.js");
const RT = require("../domain/metyet-runtime.js");
const { createStore } = require("./fixture-store.cjs");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { executeCommand } = require("../persistence/command-transaction.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");

const AT = "2030-03-01";
const json = (v) => JSON.stringify(v);
const NL = { partnerId: "nl" }, RV = { partnerId: "rv" }, CASEY = { collectorId: "casey" }, JORDAN = { collectorId: "jordan" };
const seed = () => ({
  partners: [{ id: "nl", name: "Northline" }, { id: "rv", name: "Riverside" }],
  collectors: [{ id: "casey", name: "Casey" }, { id: "jordan", name: "Jordan" }],
  goals: [
    { id: "gC", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } },
    { id: "gC2", collectorId: "casey", canonicalCardId: "cc-w", tier: "primary", desired: { grade: "PSA 9" } },
    { id: "gJ", collectorId: "jordan", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } }],
  inventory: [
    { invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 300, grade: "PSA 9" },
    { invId: "i2", partnerId: "rv", canonicalCardId: "cc-w", ask: 200, grade: "PSA 9" }],
  collectorCopies: [
    { id: "k1", collectorId: "casey", canonicalCardId: "cc-y", grade: "PSA 8", cert: "K1", offered: true },
    { id: "k2", collectorId: "casey", canonicalCardId: "cc-z", grade: "PSA 7", cert: "K2", offered: true },
    { id: "k3", collectorId: "casey", canonicalCardId: "cc-v", grade: "PSA 6", cert: "K3", offered: true }],
  binders: [], binderEntries: [], opportunities: [], catalog: [], invitations: [],
  copyReviews: [], photoRequests: [], conversations: [], interests: [],
});
const world = () => createStore(seed());
const x = (st, actor, cmd, payload) => st.execute(actor, cmd, { at: AT, ...(payload || {}) });
const okv = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
const no = (r, code, why) => eq(r && r.refused, code, why);
const opp = (st, id) => st.get().opportunities.find((o) => o.id === id);
const row = (st, id, rowId) => opp(st, id).trade.cards.find((c) => c.id === rowId);
const status = (st, copyId) => D.collectorCopyStatus(copyId, st.get().opportunities);
const valid = (st) => { const v = W.validateWorld(st.get()); assert(v.ok, json(v.errors.slice(0, 3))); };
const agreed = (st) => { const id = okv(x(st, CASEY, "startOpportunity", { goalId: "gC", invId: "i1", amount: 300 }), "open"); okv(x(st, NL, "acceptPrice", { oppId: id }), "price"); return id; };
const toValuation = (st, oppId, copyIds) => {
  const rows = okv(x(st, NL, "selectTradeCards", { oppId, copyIds }), "select");
  okv(x(st, CASEY, "continueTradeSelection", { oppId }), "ready");
  okv(x(st, NL, "closeTradeSelection", { oppId }), "close");
  return rows;
};
/* Settling cards in the order the turn rule allows (D3): while a seat still
   holds a card and moved last, the deal's turn stays with it — so the Collector
   opens every market value, the partner accepts them all and opens every
   percentage, and the Collector accepts. `cards` is [[rowId, market, pct]]. */
const settleAll = (st, oppId, cards) => {
  for (const [r, m] of cards) okv(x(st, CASEY, "proposeMarketValue", { oppId, tradeCardId: r, amount: m }), "market");
  for (const [r] of cards) okv(x(st, NL, "acceptMarketValue", { oppId, tradeCardId: r }), "market ok");
  for (const [r, , p] of cards) okv(x(st, NL, "proposeTradePercent", { oppId, tradeCardId: r, percent: p }), "pct");
  for (const [r] of cards) okv(x(st, CASEY, "acceptTradePercent", { oppId, tradeCardId: r }), "pct ok");
};
const settle = (st, oppId, r, market, pct) => settleAll(st, oppId, [[r, market, pct]]);
const decline = (st, oppId, r, note) => x(st, NL, "declineTradeCard", { oppId, tradeCardId: r, ...(note !== undefined ? { note } : {}) });
const inValuation = (cards = ["k1", "k2"]) => { const st = world(); const a = agreed(st); const rows = toValuation(st, a, cards); return { st, a, rows }; };

/* ======================================================================= A */
describe("A. Whole dollars and whole percentages (D1)", () => {
  test("a market value is a whole number of dollars above zero — proposed or countered", () => {
    const { st, a, rows: [r] } = inValuation(["k1"]);
    for (const bad of [250.5, 0, -10, 99.99, Infinity, NaN, "100", null]) {
      no(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r, amount: bad }), "invalid-amount", `market ${bad}`);
    }
    okv(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r, amount: 250 }), "whole dollars");
    no(x(st, NL, "proposeMarketValue", { oppId: a, tradeCardId: r, amount: 240.25 }), "invalid-amount", "a fractional counter");
    okv(x(st, NL, "proposeMarketValue", { oppId: a, tradeCardId: r, amount: 240 }), "a whole counter");
    okv(x(st, CASEY, "acceptMarketValue", { oppId: a, tradeCardId: r }), "accept");
    eq(row(st, a, r).agreedMarket, 240, "agreed is the standing proposal");
    valid(st);
  });
  test("a trade percentage is a whole 1%–100%, stored as the fraction it always was", () => {
    const { st, a, rows: [r] } = inValuation(["k1"]);
    okv(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r, amount: 200 }), "market");
    okv(x(st, NL, "acceptMarketValue", { oppId: a, tradeCardId: r }), "market ok");
    for (const bad of [0, 0.755, -0.5, 1.01, 2, 0.295, 0.001, "0.8", null, NaN]) {
      no(x(st, NL, "proposeTradePercent", { oppId: a, tradeCardId: r, percent: bad }), "invalid-amount", `percent ${bad}`);
    }
    okv(x(st, NL, "proposeTradePercent", { oppId: a, tradeCardId: r, percent: 0.29 }), "29% (0.29 × 100 is not exactly 29 in binary)");
    eq(row(st, a, r).tpPercent, 0.29, "stored as sent");
    no(x(st, CASEY, "proposeTradePercent", { oppId: a, tradeCardId: r, percent: 0.305 }), "invalid-amount", "a fractional counter");
    okv(x(st, CASEY, "proposeTradePercent", { oppId: a, tradeCardId: r, percent: 0.01 }), "1% is a whole percentage");
    okv(x(st, NL, "proposeTradePercent", { oppId: a, tradeCardId: r, percent: 1 }), "100% is a whole percentage");
    okv(x(st, CASEY, "acceptTradePercent", { oppId: a, tradeCardId: r }), "accept");
    eq(row(st, a, r).agreedPercent, 1, "agreed is the standing proposal");
    eq(D.tradeValueOf(row(st, a, r)), 200, "credit at 100%");
  });
  test("every whole percentage from 1 to 100 is accepted as a fraction", () => {
    for (let pct = 1; pct <= 100; pct += 1) {
      const { st, a, rows: [r] } = inValuation(["k1"]);
      okv(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r, amount: 100 }), "market");
      okv(x(st, NL, "acceptMarketValue", { oppId: a, tradeCardId: r }), "market ok");
      okv(x(st, NL, "proposeTradePercent", { oppId: a, tradeCardId: r, percent: pct / 100 }), `${pct}%`);
    }
  });
  test("credit and cash are computed exactly as before", () => {
    const { st, a, rows: [r1, r2] } = inValuation();
    settleAll(st, a, [[r1, 251, 0.85], [r2, 199, 0.7]]);
    eq(D.tradeValueOf(row(st, a, r1)), 213, "$251 × 85% = $213.35 → $213");
    eq(D.calculatedBalance(opp(st, a)), 300 - 213 - 139, "agreed price minus credit");
    eq(opp(st, a).stage, "deal", "every card settled → Deal");
  });
});

/* ======================================================================= B */
describe("B. The partner declines a card — at any point in Value Trade (D2, D8)", () => {
  const declined = (st, a, r) => {
    const c = row(st, a, r);
    eq([c.inclusion, c.declinedStage, c.declinedAt, c.withdrawn === true].join(), `rejected,value-trade,${AT},false`, "the row is a partner decline");
    return c;
  };
  test("before any value is proposed: rejected, history-ready, and no longer held", () => {
    const { st, a, rows: [r1, r2] } = inValuation();
    eq(status(st, "k1"), "reserved");
    okv(decline(st, a, r1), "decline");
    declined(st, a, r1);
    eq(status(st, "k1"), "available", "the hold is released");
    eq(status(st, "k2"), "reserved", "the other card is still held");
    eq(opp(st, a).stage, "value-trade");
    valid(st);
  });
  test("during market-value negotiation: the thread stays on the row as history", () => {
    const { st, a, rows: [r1, r2] } = inValuation();
    okv(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r2, amount: 90 }), "the Collector opens the other card too");
    okv(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r1, amount: 150 }), "market");
    okv(x(st, NL, "proposeMarketValue", { oppId: a, tradeCardId: r1, amount: 120 }), "counter");
    const before = json(row(st, a, r1).valueThread);
    okv(decline(st, a, r1), "decline");
    eq(json(declined(st, a, r1).valueThread), before, "the market thread is kept");
    valid(st);
  });
  test("during trade-percentage negotiation, and after both values are agreed: history kept, no credit", () => {
    const { st, a, rows: [r1, r2] } = inValuation();
    okv(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r1, amount: 150 }), "m1");
    okv(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r2, amount: 90 }), "m2");
    okv(x(st, NL, "acceptMarketValue", { oppId: a, tradeCardId: r1 }), "m1 ok");
    okv(x(st, NL, "proposeTradePercent", { oppId: a, tradeCardId: r1, percent: 0.8 }), "p1");
    okv(decline(st, a, r1), "decline mid-percentage");
    eq(json(declined(st, a, r1).percentThread.map((e) => e.percent)), json([0.8]), "the percentage thread is kept");
    /* a second deal: decline after both values on the card are agreed */
    const s2 = inValuation(["k1", "k2", "k3"]);
    const [q0, q1, q2] = s2.rows; const go = (who, cmd, p) => okv(x(s2.st, who, cmd, { oppId: s2.a, ...p }), cmd);
    go(CASEY, "proposeMarketValue", { tradeCardId: q0, amount: 150 });
    go(CASEY, "proposeMarketValue", { tradeCardId: q1, amount: 90 });
    go(CASEY, "proposeMarketValue", { tradeCardId: q2, amount: 60 });
    go(NL, "acceptMarketValue", { tradeCardId: q0 }); go(NL, "acceptMarketValue", { tradeCardId: q1 });
    go(NL, "proposeTradePercent", { tradeCardId: q0, percent: 0.8 }); go(NL, "proposeTradePercent", { tradeCardId: q1, percent: 0.5 });
    go(NL, "proposeMarketValue", { tradeCardId: q2, amount: 55 });
    go(CASEY, "acceptTradePercent", { tradeCardId: q0 }); go(CASEY, "acceptTradePercent", { tradeCardId: q1 });
    const c = row(s2.st, s2.a, s2.rows[0]);
    eq([c.agreedMarket, c.agreedPercent].join(), "150,0.8");
    eq(opp(s2.st, s2.a).stage, "value-trade", "the third card is still open");
    okv(decline(s2.st, s2.a, s2.rows[0]), "decline a settled card");
    const after = row(s2.st, s2.a, s2.rows[0]);
    eq([after.agreedMarket, after.agreedPercent].join(), "150,0.8", "the agreed figures stay as history");
    eq(D.totalTradeValue(opp(s2.st, s2.a)), 45, "…but earn nothing: only the other settled card counts ($90 × 50%)");
    eq(D.calculatedBalance(opp(s2.st, s2.a)), 300 - 45, "the cash difference is recalculated from what remains");
    valid(s2.st);
  });
  test("at the Collector's turn and at the partner's turn alike", () => {
    const { st, a, rows: [r1, r2] } = inValuation();
    eq(D.nextActor(opp(st, a)).actor, "collector", "the Collector opens market values");
    okv(decline(st, a, r1), "on the Collector's turn");
    okv(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r2, amount: 80 }), "m2");
    eq(D.nextActor(opp(st, a)).actor, "partner", "now the partner's turn");
    const s2 = inValuation(["k1", "k2", "k3"]);
    okv(x(s2.st, CASEY, "proposeMarketValue", { oppId: s2.a, tradeCardId: s2.rows[0], amount: 80 }), "m");
    okv(x(s2.st, CASEY, "proposeMarketValue", { oppId: s2.a, tradeCardId: s2.rows[1], amount: 70 }), "m");
    okv(x(s2.st, CASEY, "proposeMarketValue", { oppId: s2.a, tradeCardId: s2.rows[2], amount: 60 }), "m");
    eq(D.nextActor(s2.st.get().opportunities.find((o) => o.id === s2.a)).actor, "partner");
    okv(decline(s2.st, s2.a, s2.rows[2]), "on the partner's turn");
  });
  test("declining the last card returns the deal to Select Trade — the partner chooses again or asks for more", () => {
    const { st, a, rows: [r1] } = inValuation(["k1"]);
    okv(decline(st, a, r1), "decline the only card");
    const o = opp(st, a);
    eq(o.stage, "select-trade", "back to Select Trade");
    eq(D.nextActor(o).reason, "select-trade", "the partner's move: choose cards or ask for more");
    eq(status(st, "k1"), "available");
    okv(x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k2"] }), "choosing another card is the ordinary process");
    valid(st);
  });
  test("declining the one unsettled card moves the deal to Deal when every remaining card is settled", () => {
    const { st, a, rows: [r1, r2] } = inValuation();
    okv(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r1, amount: 150 }), "m1");
    okv(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r2, amount: 90 }), "m2");
    okv(x(st, NL, "acceptMarketValue", { oppId: a, tradeCardId: r1 }), "m1 ok");
    okv(x(st, NL, "proposeTradePercent", { oppId: a, tradeCardId: r1, percent: 0.8 }), "p1");
    okv(x(st, NL, "proposeMarketValue", { oppId: a, tradeCardId: r2, amount: 80 }), "m2 countered");
    okv(x(st, CASEY, "acceptTradePercent", { oppId: a, tradeCardId: r1 }), "p1 ok — card 1 settled");
    eq(opp(st, a).stage, "value-trade", "card 2 is still open");
    okv(decline(st, a, r2), "decline");
    const o = opp(st, a);
    eq(o.stage, "deal", "Value Trade closed by itself");
    eq(D.calculatedBalance(o), 300 - 120, "price minus the remaining card's credit");
    valid(st);
  });
});

/* ======================================================================= C */
describe("C. A decline leaves everything else alone", () => {
  test("other cards keep their agreements; turns are recomputed from what remains", () => {
    const { st, a, rows: [r1, r2, r3] } = inValuation(["k1", "k2", "k3"]);
    okv(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r1, amount: 150 }), "m1");
    okv(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r2, amount: 90 }), "m2");
    okv(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r3, amount: 60 }), "m3");
    okv(x(st, NL, "acceptMarketValue", { oppId: a, tradeCardId: r1 }), "m1 ok");
    okv(x(st, NL, "proposeTradePercent", { oppId: a, tradeCardId: r1, percent: 0.8 }), "p1");
    okv(x(st, NL, "proposeMarketValue", { oppId: a, tradeCardId: r2, amount: 85 }), "m2 countered");
    okv(x(st, NL, "proposeMarketValue", { oppId: a, tradeCardId: r3, amount: 55 }), "m3 countered");
    okv(x(st, CASEY, "acceptTradePercent", { oppId: a, tradeCardId: r1 }), "card 1 settled");
    const kept = json(row(st, a, r1));
    okv(decline(st, a, r3), "decline the third");
    eq(json(row(st, a, r1)), kept, "a settled card was touched");
    eq(json(row(st, a, r2).valueThread.map((e) => e.amount)), json([90, 85]), "an open card was touched");
    eq(D.cardOwner(row(st, a, r3)), null, "a declined card owns no turn");
  });
  test("no copy, disposition or shop stock is written", () => {
    const { st, a, rows: [r1] } = inValuation();
    const copies = json(st.get().collectorCopies); const inv = json(st.get().inventory);
    okv(decline(st, a, r1, "Corner wear is more than the photos showed."), "decline");
    eq(json(st.get().collectorCopies), copies, "a collector copy changed");
    eq(json(st.get().inventory), inv, "the shop's inventory changed");
  });
  test("Collector withdrawal is unchanged, and still reads apart from a decline", () => {
    const { st, a, rows: [r1, r2] } = inValuation();
    okv(x(st, CASEY, "withdrawTradeCard", { oppId: a, tradeCardId: r1 }), "withdraw");
    const w = row(st, a, r1);
    eq([w.inclusion, w.withdrawn, w.withdrawnStage, w.declinedStage === undefined].join(), "accepted,true,value-trade,true");
    okv(decline(st, a, r2), "decline the other");
    const d = row(st, a, r2);
    eq([d.inclusion, d.withdrawn === true, d.declinedStage].join(), "rejected,false,value-trade");
    eq(opp(st, a).stage, "select-trade", "nothing left");
  });
  test("a partner's deselect in Select Trade is unchanged, and reads apart from a decline", () => {
    const st = world(); const a = agreed(st);
    const [r] = okv(x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1"] }), "select");
    okv(x(st, CASEY, "continueTradeSelection", { oppId: a }), "ready");
    okv(x(st, NL, "deselectTradeCard", { oppId: a, tradeCardId: r }), "deselect");
    const c = row(st, a, r);
    eq([c.inclusion, c.declinedStage === undefined, c.declinedAt === undefined, !!c.deselectedAt].join(), "rejected,true,true,true");
  });
});

/* ======================================================================= D */
describe("D. Only the deal's partner, only in Value Trade, only a card in the trade", () => {
  test("the Collector, another partner, a made-up deal or row, another deal's row — refused, nothing changes", () => {
    const { st, a, rows: [r1] } = inValuation();
    const other = (() => { const id = okv(x(st, CASEY, "startOpportunity", { goalId: "gC2", invId: "i2", amount: 200 }), "rv deal"); okv(x(st, RV, "acceptPrice", { oppId: id }), "rv price"); return id; })();
    const [rvRow] = okv(x(st, RV, "selectTradeCards", { oppId: other, copyIds: ["k3"] }), "rv select");
    const before = json(st.get());
    no(x(st, CASEY, "declineTradeCard", { oppId: a, tradeCardId: r1 }), "not-owner", "the Collector");
    no(x(st, RV, "declineTradeCard", { oppId: a, tradeCardId: r1 }), "not-participant", "another partner");
    no(x(st, JORDAN, "declineTradeCard", { oppId: a, tradeCardId: r1 }), "not-owner", "another Collector");
    no(decline(st, "opp-made-up", r1), "not-found", "a made-up deal");
    no(decline(st, a, "tc-made-up"), "not-found", "a made-up row");
    no(decline(st, a, rvRow), "not-found", "another deal's row");
    eq(json(st.get()), before, "a refusal changed the world");
  });
  test("not before Value Trade, and not in Deal — and never on an ended deal", () => {
    const st = world(); const a = agreed(st);
    const [r] = okv(x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1"] }), "select");
    no(decline(st, a, r), "wrong-stage", "Select Trade has deselect");
    const s2 = inValuation(["k1"]);
    settle(s2.st, s2.a, s2.rows[0], 100, 0.5);
    eq(opp(s2.st, s2.a).stage, "deal");
    no(decline(s2.st, s2.a, s2.rows[0]), "wrong-stage", "Deal is out of this batch");
    const s3 = inValuation(["k1"]);
    okv(x(s3.st, CASEY, "cancelOpportunity", { oppId: s3.a, reason: "changed my mind" }), "end the deal");
    no(decline(s3.st, s3.a, s3.rows[0]), "terminal", "an ended deal");
  });
  test("the note: optional, one line of at most 140 characters, kept as written", () => {
    const { st, a, rows: [r1, r2, r3] } = inValuation(["k1", "k2", "k3"]);
    no(decline(st, a, r1, "x".repeat(141)), "message-too-long", "141 characters");
    no(decline(st, a, r1, 42), "message-empty", "not text");
    okv(decline(st, a, r1, "  Corner wear is   more than\nthe photos showed.  "), "a note");
    eq(row(st, a, r1).declineNote, "Corner wear is more than the photos showed.", "trimmed to one line");
    okv(decline(st, a, r2, "🃏".repeat(140)), "exactly 140 characters, though each is two code units");
    okv(decline(st, a, r3, "   "), "a blank note is no note");
    assert(!("declineNote" in row(st, a, r3)), "a blank note was stored");
    valid(st);
  });
});

/* ======================================================================= E */
describe("E. Retries, races and stale screens", () => {
  test("a repeat of a decline that landed answers as done and changes nothing — even after the deal moved on", () => {
    const { st, a, rows: [r1, r2] } = inValuation();
    okv(decline(st, a, r1, "Not for us."), "decline");
    const after = json(st.get());
    eq(okv(decline(st, a, r1, "Not for us."), "the same again"), r1);
    eq(json(st.get()), after, "a repeat changed the world");
    okv(decline(st, a, r2), "the last card → back to Select Trade");
    eq(opp(st, a).stage, "select-trade");
    okv(decline(st, a, r2), "a lost answer retried after the stage moved");
  });
  test("a card the partner deselected in Select Trade is not 'already declined': a decline of it is refused", () => {
    const st = world(); const a = agreed(st);
    const [r1] = okv(x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1", "k2"] }), "select");
    okv(x(st, CASEY, "continueTradeSelection", { oppId: a }), "ready");
    okv(x(st, NL, "deselectTradeCard", { oppId: a, tradeCardId: r1 }), "deselect");
    okv(x(st, NL, "closeTradeSelection", { oppId: a }), "close");
    eq(opp(st, a).stage, "value-trade");
    const before = json(st.get());
    no(decline(st, a, r1), "nothing-to-accept", "a deselected card is not in the trade");
    eq(json(st.get()), before, "nothing changed");
  });
  test("withdraw then decline, decline then withdraw: the second is refused and nothing changes", () => {
    const { st, a, rows: [r1, r2] } = inValuation();
    okv(x(st, CASEY, "withdrawTradeCard", { oppId: a, tradeCardId: r1 }), "withdraw first");
    let before = json(st.get());
    no(decline(st, a, r1), "nothing-to-accept", "declining a withdrawn card");
    eq(json(st.get()), before);
    okv(decline(st, a, r2), "decline first");
    before = json(st.get());
    const s2 = inValuation();
    okv(decline(s2.st, s2.a, s2.rows[0]), "decline first");
    const b2 = json(s2.st.get());
    no(x(s2.st, CASEY, "withdrawTradeCard", { oppId: s2.a, tradeCardId: s2.rows[0] }), "nothing-to-accept", "withdrawing a declined card");
    eq(json(s2.st.get()), b2);
  });
  test("a delayed decline after the deal reached Deal is refused; after the shop's card went elsewhere the deal has ended", () => {
    const { st, a, rows: [r1] } = inValuation(["k1"]);
    settle(st, a, r1, 100, 0.5);
    no(decline(st, a, r1), "wrong-stage", "the deal moved to Deal before the decline arrived");
    /* The shop's card is promised to Jordan's deal (cash only, both agree):
       Casey's deal ends as card-unavailable, so a decline that arrives late is
       refused as terminal and changes nothing. */
    const s2 = inValuation(["k1"]);
    const j = okv(x(s2.st, JORDAN, "startOpportunity", { goalId: "gJ", invId: "i1", amount: 310 }), "Jordan opens");
    okv(x(s2.st, NL, "acceptPrice", { oppId: j }), "price");
    okv(x(s2.st, JORDAN, "chooseCashOnly", { oppId: j }), "cash only");
    okv(x(s2.st, NL, "acceptDeal", { oppId: j }), "partner agrees");
    okv(x(s2.st, JORDAN, "acceptDeal", { oppId: j }), "Jordan agrees");
    eq(opp(s2.st, s2.a).outcome, "card-unavailable", "Casey's deal ended when the card was promised elsewhere");
    const before = json(s2.st.get());
    no(decline(s2.st, s2.a, s2.rows[0]), "terminal", "a decline on an ended deal");
    eq(json(s2.st.get()), before);
    eq(status(s2.st, "k1"), "available", "and the ended deal holds nothing");
  });
});

/* ======================================================================= F */
describe("F. The world rules", () => {
  const forge = (patch) => {
    const { st, a, rows: [r1] } = inValuation(["k1"]);
    const w = st.get();
    const bad = { ...w, opportunities: w.opportunities.map((o) => (o.id !== a ? o
      : { ...o, trade: { ...o.trade, cards: o.trade.cards.map((c) => (c.id === r1 ? { ...c, ...patch } : c)) } })) };
    return W.validateWorld(bad).errors.map((e) => e.code);
  };
  test("a decline belongs only to a rejected row, never to a withdrawn one; the note is a short line", () => {
    assert(forge({ declinedAt: AT, declinedStage: "value-trade" }).includes("invariant.decline-on-rejected-row"), "a live row carrying a decline");
    assert(forge({ declineNote: "Not this one." }).includes("invariant.decline-on-rejected-row"), "a live row carrying only a decline note");
    assert(forge({ inclusion: "rejected", declinedAt: AT, declinedStage: "value-trade", withdrawn: true }).includes("invariant.decline-not-withdrawn"), "declined and withdrawn");
    assert(forge({ inclusion: "rejected", declinedAt: AT, declinedStage: "value-trade", declineNote: "x".repeat(141) }).includes("field.invalid"), "a long note");
    assert(forge({ inclusion: "rejected", declinedAt: AT, declinedStage: "value-trade", declineNote: "   " }).includes("field.invalid"), "a blank stored note");
    eq(forge({ inclusion: "rejected", declinedAt: AT, declinedStage: "value-trade", declineNote: "Fine." }).join(), "", "a proper decline is valid");
  });
});

/* ======================================================================= G */
describe("G. Who can see a decline", () => {
  test("both participants see the decline and its note; another partner sees nothing of the deal", () => {
    const { st, a, rows: [r1] } = inValuation();
    okv(decline(st, a, r1, "Corner wear."), "decline");
    const tp = P.projectForActor(st.get(), NL).opportunities.find((o) => o.id === a).trade.cards.find((c) => c.id === r1);
    const col = P.projectForActor(st.get(), CASEY).opportunities.find((o) => o.id === a).trade.cards.find((c) => c.id === r1);
    for (const [who, c] of [["partner", tp], ["Collector", col]]) {
      eq([c.inclusion, c.declinedStage, c.declineNote].join(), "rejected,value-trade,Corner wear.", who);
    }
    assert(!P.projectForActor(st.get(), RV).opportunities.some((o) => o.id === a), "another partner sees the deal");
    assert(!JSON.stringify(P.projectForActor(st.get(), JORDAN)).includes("Corner wear."), "another Collector sees the note");
    eq(P.projectForActor(st.get(), RV).collectorCopies.find((b) => b.id === "k1").status, "available", "the released copy is ordinary supply again");
  });
});

/* ======================================================================= H */
describe("H. Through the real schema: a decline survives a round trip", () => {
  test("decline over PGlite with every migration: stored, reloaded, valid, and the copy free", async () => {
    const db = fromPGlite(new PGlite()); await migrate(db);
    const runtime = RT.deterministicRuntime({ start: "2030-03-01T00:00:00.000Z", stepMs: 1000 });
    const repository = createWorldRepository(db);
    /* The real schema holds canonical card ids to the catalogue, so the seed's
       placeholder ids become real catalogue printings. */
    const catalog = createCatalogRepository(db, { newId: runtime.newId });
    const { expansionId } = await catalog.putExpansion({ game: "pokemon", code: "b1", name: "Base Set", printedTotal: 102 });
    let text = JSON.stringify(seed());
    for (const [n, ph] of [["1", "cc-x"], ["2", "cc-w"], ["3", "cc-y"], ["4", "cc-z"], ["5", "cc-v"]]) {
      const { cardContextId } = await catalog.putCardContext({ game: "pokemon", expansionId, collectorNumber: n, cardName: `Card ${n}`, artist: "x", rarity: "Rare" });
      const { canonicalCardId } = await catalog.putCanonicalCard({ cardContextId, finish: "holofoil" });
      text = text.split(`"${ph}"`).join(`"${canonicalCardId}"`);
    }
    const s = JSON.parse(text);
    await repository.saveWorld({ ...s, relationships: [
      { partnerId: "nl", collectorId: "casey", status: "accepted", at: AT },
      { partnerId: "rv", collectorId: "casey", status: "accepted", at: AT },
      { partnerId: "nl", collectorId: "jordan", status: "accepted", at: AT }] });
    const go = async (actor, command, payload) => {
      const r = await executeCommand(repository, { actor, command, payload, runtime });
      assert(r.ok, `${command}: ${r.refused}`); return r.value;
    };
    const a = await go(CASEY, "startOpportunity", { goalId: "gC", invId: "i1", amount: 300 });
    await go(NL, "acceptPrice", { oppId: a });
    const [r1, r2] = await go(NL, "selectTradeCards", { oppId: a, copyIds: ["k1", "k2"] });
    await go(CASEY, "continueTradeSelection", { oppId: a });
    await go(NL, "closeTradeSelection", { oppId: a });
    await go(CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r1, amount: 150 });
    await go(NL, "declineTradeCard", { oppId: a, tradeCardId: r1, note: "Not this one." });
    const w = await repository.loadWorld();
    const o = w.opportunities.find((y) => y.id === a);
    const c = o.trade.cards.find((y) => y.id === r1);
    eq([c.inclusion, c.declinedStage, c.declineNote, c.valueThread.length].join(), "rejected,value-trade,Not this one.,1", "stored and reloaded");
    eq(D.collectorCopyStatus("k1", w.opportunities), "available", "released");
    eq(D.collectorCopyStatus("k2", w.opportunities), "reserved", "the other still held");
    assert(W.validateWorld(w).ok, "the stored world is valid");
    const fractional = await executeCommand(repository, { actor: CASEY, command: "proposeMarketValue",
      payload: { oppId: a, tradeCardId: r2, amount: 99.5 }, runtime });
    eq(fractional.refused, "invalid-amount", "the whole-dollar rule holds through the transaction");
  });
});

run();
