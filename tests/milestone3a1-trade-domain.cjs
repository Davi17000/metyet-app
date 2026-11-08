/* ============================================================================
   M3A A1 — TP-LED TRADE SELECTION, WITHDRAWAL, AND EXPLICIT LOST-CARD ENDINGS

   The domain half of M3A, pinned before any screen sends these commands. Every
   rule below is enforced in the canonical command layer and checked by
   `validateWorld`; none of the commands is on the production allow-list yet.

     SELECTION    the partner selects specific Trade/Sell copies. Selection
                  locks the copy's material specification but is not exclusive:
                  the same copy may be selected in other deals.
     COLLECTOR    may say "hold on, I'm adding more cards" as often as they
                  like, adds cards only by offering them in Browse, says when
                  they are ready, and may withdraw any selected card from this
                  deal until final agreement. Cash only is their explicit choice.
     VALUATION    entering it reserves every selected copy for this deal,
                  atomically, across every deal — the same partner's included.
     LOST CARD    when another deal reaches final agreement on the shop's card,
                  or the shop removes it before a price is agreed, every other
                  active deal on it ENDS as `card-unavailable` in the same write.
     INVENTORY    a removed shop copy is never revived: re-adding the same card
                  makes a new inventory instance with no inherited history.

   Section letters follow the authorization brief's test plan. Each section
   ends with negative checks that show the rule actually catches a violation.
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const D = require("../domain/metyet-domain.js");
const P = require("../domain/metyet-projection.js");
const W = require("../domain/metyet-world.js");
const RT = require("../domain/metyet-runtime.js");
const { createStore } = require("./fixture-store.cjs");
const { isExposed } = require("../server/exposed-commands.js");

const AT = "2026-11-05";
let seq = 0;
const runtime = () => RT.createRuntime({ now: () => AT, newId: (p = "") => `${p}${++seq}` });

const PH = { front: "f.jpg", back: "b.jpg" };
const NL = { partnerId: "nl" };
const RV = { partnerId: "rv" };
const CASEY = { collectorId: "casey" };
const JORDAN = { collectorId: "jordan" };

/* Two shops, two collectors. Casey owns four copies with each disposition, and
   Jordan wants the same shop card Casey wants. */
const seed = (over = {}) => ({
  partners: [{ id: "nl", name: "Northline" }, { id: "rv", name: "Riverside" }],
  collectors: [{ id: "casey", name: "Casey" }, { id: "jordan", name: "Jordan" }],
  goals: [
    { id: "gC", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } },
    { id: "gC2", collectorId: "casey", canonicalCardId: "cc-w", tier: "primary", desired: { grade: "PSA 9" } },
    { id: "gJ", collectorId: "jordan", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } }],
  inventory: [
    { invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 300, grade: "PSA 9", cert: "C1", photos: PH },
    { invId: "i2", partnerId: "nl", canonicalCardId: "cc-x", ask: 320, grade: "PSA 9", cert: "C2", photos: PH },
    { invId: "i3", partnerId: "rv", canonicalCardId: "cc-x", ask: 310, grade: "PSA 9", cert: "C3", photos: PH },
    { invId: "i4", partnerId: "nl", canonicalCardId: "cc-w", ask: 200, grade: "PSA 9", cert: "C4", photos: PH }],
  collectorCopies: [
    { id: "k1", collectorId: "casey", canonicalCardId: "cc-y", grade: "PSA 8", cert: "K1", offered: true, photos: PH },
    { id: "k2", collectorId: "casey", canonicalCardId: "cc-z", grade: "Raw", condition: "Near Mint", offered: true, photos: { front: "kf.jpg", back: null } },
    { id: "k3", collectorId: "casey", canonicalCardId: "cc-v", grade: "PSA 7", offered: false, keeping: true },
    { id: "k4", collectorId: "casey", canonicalCardId: "cc-u", grade: "PSA 6", offered: false },
    { id: "kJ", collectorId: "jordan", canonicalCardId: "cc-y", grade: "PSA 8", offered: true }],
  binders: [], binderEntries: [], opportunities: [], catalog: [],
  copyReviews: [], photoRequests: [], conversations: [], interests: [],
  ...over,
});
const world = (over) => createStore(seed(over), runtime());

const x = (st, actor, cmd, payload) => st.execute(actor, cmd, { at: AT, ...(payload || {}) });
const okv = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
const no = (r, code, why) => eq(r && r.refused, code, why);
const opp = (st, id) => st.get().opportunities.find((o) => o.id === id);
const turn = (st, id) => D.nextActor(opp(st, id));
const copy = (st, id) => st.get().collectorCopies.find((b) => b.id === id);
const status = (st, id) => D.collectorCopyStatus(id, st.get().opportunities);
const rowsOf = (st, id) => (opp(st, id).trade && opp(st, id).trade.cards) || [];
const liveIds = (st, id) => D.TRADE.liveTradeRows(opp(st, id)).map((c) => c.id);
const valid = (st) => W.validateWorld(st.get());
const tpView = (st, tp) => P.projectForActor(st.get(), tp);
const tpCopy = (st, tp, id) => (tpView(st, tp).collectorCopies || []).find((b) => b.id === id) || null;

/* A deal with an agreed price, sitting in Select Trade on the partner's turn. */
const agreed = (st, who, goalId, invId, tp, amount = 300) => {
  const id = okv(x(st, who, "startOpportunity", { goalId, invId, amount }), "open");
  okv(x(st, tp, "acceptPrice", { oppId: id }), "price agreed");
  return id;
};
/* Partner selects, Collector is ready, partner closes: Value Trade. */
const toValuation = (st, oppId, tp, who, copyIds) => {
  const rows = okv(x(st, tp, "selectTradeCards", { oppId, copyIds }), "select");
  okv(x(st, who, "continueTradeSelection", { oppId }), "ready");
  okv(x(st, tp, "closeTradeSelection", { oppId }), "close");
  return rows;
};
const settleCard = (st, oppId, tp, who, rowId, market = 100, pct = 0.8) => {
  okv(x(st, who, "proposeMarketValue", { oppId, tradeCardId: rowId, amount: market }), "market");
  okv(x(st, tp, "acceptMarketValue", { oppId, tradeCardId: rowId }), "market ok");
  okv(x(st, tp, "proposeTradePercent", { oppId, tradeCardId: rowId, percent: pct }), "pct");
  okv(x(st, who, "acceptTradePercent", { oppId, tradeCardId: rowId }), "pct ok");
};
/* Several cards, in the order the one-actor turn rule allows: the Collector
   opens every market value, the partner accepts them and opens every
   percentage, the Collector accepts. */
const settleAll = (st, oppId, tp, who, cards) => {
  for (const [rowId, market] of cards) okv(x(st, who, "proposeMarketValue", { oppId, tradeCardId: rowId, amount: market }), "market");
  for (const [rowId] of cards) okv(x(st, tp, "acceptMarketValue", { oppId, tradeCardId: rowId }), "market ok");
  for (const [rowId, , pct] of cards) okv(x(st, tp, "proposeTradePercent", { oppId, tradeCardId: rowId, percent: pct }), "pct");
  for (const [rowId] of cards) okv(x(st, who, "acceptTradePercent", { oppId, tradeCardId: rowId }), "pct ok");
};
const finalAgree = (st, oppId, tp, who) => {
  okv(x(st, tp, "acceptDeal", { oppId }), "partner agrees");
  okv(x(st, who, "acceptDeal", { oppId }), "collector agrees");
};

/* ============================================================ A. selection */
describe("A. The partner selects; the Collector cannot force a card in", () => {
  test("after the price is agreed, the partner owns the turn to select", () => {
    const st = world(); const id = agreed(st, CASEY, "gC", "i1", NL);
    eq(opp(st, id).stage, "select-trade", "Select Trade");
    eq(turn(st, id).actor, "partner", "partner's move"); eq(turn(st, id).reason, "select-trade", "reason");
  });
  test("the Collector cannot select, and the retired Collector-proposes commands are refused", () => {
    const st = world(); const id = agreed(st, CASEY, "gC", "i1", NL);
    no(x(st, CASEY, "selectTradeCards", { oppId: id, copyIds: ["k1"] }), D.REFUSE.notOwner, "collector cannot select");
    no(x(st, CASEY, "proposeTradeSelection", { oppId: id, binderIds: ["k1"] }), "superseded", "propose retired");
    no(x(st, NL, "reviewTradeCard", { oppId: id, decision: "accept" }), "superseded", "review retired");
    eq(rowsOf(st, id).length, 0, "nothing was written");
  });
  test("a selection writes a snapshot row, locks the copy, and never touches Trade/Sell", () => {
    const st = world(); const id = agreed(st, CASEY, "gC", "i1", NL);
    const [r1] = okv(x(st, NL, "selectTradeCards", { oppId: id, copyIds: ["k1"] }), "select");
    const row = rowsOf(st, id).find((c) => c.id === r1);
    eq(row.inclusion, "accepted", "the partner's inclusion"); eq(row.by, "tp", "by the partner");
    eq(row.grade, "PSA 8", "grade snapshot"); eq(row.cert, "K1", "cert snapshot");
    eq(row.canonicalCardId, "cc-y", "printing identity"); eq(row.selectedAt, AT, "when");
    eq(row.photos.front, "f.jpg", "photo snapshot");
    assert(row.photos !== copy(st, "k1").photos, "the snapshot is a copy, not a reference");
    eq(row.reservedAt, null, "not reserved yet");
    eq(status(st, "k1"), "selected", "selected, not reserved");
    eq(copy(st, "k1").offered, true, "still Trade/Sell"); assert(!("keeping" in copy(st, "k1")), "no keep written");
    eq(turn(st, id).reason, "more-cards", "the Collector gets their look");
  });
  test("only the deal Collector's offered copies; one answer for kept and unstated", () => {
    const st = world(); const id = agreed(st, CASEY, "gC", "i1", NL);
    no(x(st, NL, "selectTradeCards", { oppId: id, copyIds: ["k3"] }), "copy-unavailable", "PC");
    no(x(st, NL, "selectTradeCards", { oppId: id, copyIds: ["k4"] }), "copy-unavailable", "unstated");
    no(x(st, NL, "selectTradeCards", { oppId: id, copyIds: ["kJ"] }), "not-found", "another collector's copy");
    no(x(st, NL, "selectTradeCards", { oppId: id, copyIds: ["nope"] }), "not-found", "no copy");
    no(x(st, NL, "selectTradeCards", { oppId: id, copyIds: ["k1", "k1"] }), "copy-in-use", "duplicate");
    no(x(st, RV, "selectTradeCards", { oppId: id, copyIds: ["k1"] }), "not-participant", "another shop");
    eq(rowsOf(st, id).length, 0, "no partial write");
  });
  test("an empty send is allowed and hands the Collector their look; an empty final pick is not", () => {
    const st = world(); const id = agreed(st, CASEY, "gC", "i1", NL);
    okv(x(st, NL, "selectTradeCards", { oppId: id, copyIds: [] }), "nothing yet");
    eq(turn(st, id).reason, "more-cards", "Collector's move");
    okv(x(st, CASEY, "continueTradeSelection", { oppId: id }), "ready");
    no(x(st, NL, "selectTradeCards", { oppId: id, copyIds: [] }), "nothing-to-accept", "empty final pick says nothing");
  });
  test("the partner cannot close before the Collector has had their chance to add cards", () => {
    const st = world(); const id = agreed(st, CASEY, "gC", "i1", NL);
    okv(x(st, NL, "selectTradeCards", { oppId: id, copyIds: ["k1"] }), "select");
    no(x(st, NL, "closeTradeSelection", { oppId: id }), "not-your-turn", "Collector not ready");
    eq(opp(st, id).stage, "select-trade", "still selecting");
  });
  test("'hold on, I'm adding more cards' — any number of times, and new Trade/Sell copies become selectable", () => {
    const st = world(); const id = agreed(st, CASEY, "gC", "i1", NL);
    okv(x(st, NL, "selectTradeCards", { oppId: id, copyIds: ["k1"] }), "select");
    for (let n = 0; n < 3; n++) {
      okv(x(st, CASEY, "holdTradeSelection", { oppId: id }), `hold ${n}`);
      eq(turn(st, id).reason, "adding-cards", "paused");
      no(x(st, NL, "selectTradeCards", { oppId: id, copyIds: ["k2"] }), "not-your-turn", "partner waits");
      no(x(st, NL, "closeTradeSelection", { oppId: id }), "not-your-turn", "and cannot close");
      okv(x(st, CASEY, "continueTradeSelection", { oppId: id }), `ready ${n}`);
      eq(turn(st, id).reason, "close-selection", "partner finishes");
    }
    /* A hold during the partner's final review is honoured too. */
    okv(x(st, CASEY, "holdTradeSelection", { oppId: id }), "hold again");
    eq(tpCopy(st, NL, "k4"), null, "an unstated copy is not supply");
    okv(x(st, CASEY, "setCollectorCopyOffered", { copyId: "k4", offered: true }), "offered in Browse");
    eq(tpCopy(st, NL, "k4").status, "available", "now visible to the partner");
    okv(x(st, CASEY, "continueTradeSelection", { oppId: id }), "ready");
    okv(x(st, NL, "selectTradeCards", { oppId: id, copyIds: ["k4"] }), "partner adds the new card");
    eq(turn(st, id).reason, "close-selection", "selecting during final review does not hand the turn back");
  });
  test("cash only is the Collector's explicit choice, and only with nothing selected", () => {
    const st = world(); const id = agreed(st, CASEY, "gC", "i1", NL);
    okv(x(st, NL, "selectTradeCards", { oppId: id, copyIds: ["k1"] }), "select");
    no(x(st, CASEY, "chooseCashOnly", { oppId: id }), D.REFUSE.tradeCardsSelected, "a card is selected");
    const [row] = liveIds(st, id);
    okv(x(st, CASEY, "withdrawTradeCard", { oppId: id, tradeCardId: row }), "withdraw it");
    okv(x(st, CASEY, "chooseCashOnly", { oppId: id }), "now cash");
    eq(opp(st, id).stage, "deal", "Deal"); eq(opp(st, id).trade.mode, "cash", "cash");
  });
  test("a partner that closes with nothing selected hands the Collector the decision; nothing turns into cash by itself", () => {
    const st = world(); const id = agreed(st, CASEY, "gC", "i1", NL);
    okv(x(st, NL, "selectTradeCards", { oppId: id, copyIds: [] }), "nothing");
    okv(x(st, CASEY, "continueTradeSelection", { oppId: id }), "ready");
    okv(x(st, NL, "closeTradeSelection", { oppId: id }), "close empty");
    eq(opp(st, id).stage, "select-trade", "still Select Trade — no automatic cash");
    eq(turn(st, id).reason, "trade-reviewed", "Collector decides");
    okv(x(st, CASEY, "holdTradeSelection", { oppId: id }), "or adds more");
    eq(turn(st, id).reason, "adding-cards", "back to adding");
  });
});

/* ============================================== B. selected, then reserved */
describe("B. Selection is shared; valuation is exclusive and atomic", () => {
  test("one copy may be selected in two deals at once, and a rival selection is invisible", () => {
    const st = world();
    const a = agreed(st, CASEY, "gC", "i1", NL);
    const before = tpCopy(st, RV, "k1");
    const b = agreed(st, CASEY, "gC2", "i4", NL);
    okv(x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1"] }), "deal A selects");
    okv(x(st, NL, "selectTradeCards", { oppId: b, copyIds: ["k1"] }), "deal B selects the same copy");
    eq(status(st, "k1"), "selected", "selected, shared");
    eq(JSON.stringify(tpCopy(st, RV, "k1")), JSON.stringify(before), "another shop sees exactly what it saw before");
    eq(tpCopy(st, RV, "k1").status, "available", "available to them");
    assert(valid(st).ok, "valid world");
  });
  test("closing reserves every selected copy and moves straight to Value Trade", () => {
    const st = world(); const a = agreed(st, CASEY, "gC", "i1", NL);
    const rows = toValuation(st, a, NL, CASEY, ["k1", "k2"]);
    eq(opp(st, a).stage, "value-trade", "Value Trade");
    for (const r of rows) eq(rowsOf(st, a).find((c) => c.id === r).reservedAt, AT, "reserved at");
    eq(status(st, "k1"), "reserved", "k1 reserved"); eq(status(st, "k2"), "reserved", "k2 reserved");
  });
  test("a reserved copy cannot be selected by any other deal — the same partner's included", () => {
    const st = world();
    const a = agreed(st, CASEY, "gC", "i1", NL);
    const b = agreed(st, CASEY, "gC2", "i4", NL);
    toValuation(st, a, NL, CASEY, ["k1"]);
    no(x(st, NL, "selectTradeCards", { oppId: b, copyIds: ["k1"] }), "copy-unavailable", "same partner, other deal");
    eq(tpCopy(st, RV, "k1"), null, "another shop no longer sees it at all");
  });
  test("a conflicting close changes nothing, names only the caller's own rows, and recovers by deselecting", () => {
    const st = world();
    const a = agreed(st, CASEY, "gC", "i1", NL);
    const b = agreed(st, CASEY, "gC2", "i4", NL);
    okv(x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1"] }), "A selects k1");
    const [bk1, bk2] = okv(x(st, NL, "selectTradeCards", { oppId: b, copyIds: ["k1", "k2"] }), "B selects k1, k2");
    okv(x(st, CASEY, "continueTradeSelection", { oppId: a }), "ready A");
    okv(x(st, CASEY, "continueTradeSelection", { oppId: b }), "ready B");
    okv(x(st, NL, "closeTradeSelection", { oppId: a }), "A closes first");
    const before = JSON.stringify(opp(st, b));
    const r = x(st, NL, "closeTradeSelection", { oppId: b });
    eq(r.refused, "copy-unavailable", "B cannot reserve k1");
    eq(JSON.stringify(r.detail && r.detail.tradeCardIds), JSON.stringify([bk1]), "names B's own conflicting row only");
    eq(JSON.stringify(opp(st, b)), before, "nothing changed: no partial reservation, no stage move");
    eq(status(st, "k2"), "selected", "k2 was not reserved by the failed close");
    okv(x(st, NL, "deselectTradeCard", { oppId: b, tradeCardId: bk1 }), "recovery: deselect");
    okv(x(st, NL, "closeTradeSelection", { oppId: b }), "B closes with k2");
    eq(opp(st, b).stage, "value-trade", "B in Value Trade");
    eq(rowsOf(st, b).find((c) => c.id === bk1).inclusion, "rejected", "the deselected row stays as history");
    eq(rowsOf(st, b).find((c) => c.id === bk2).reservedAt, AT, "k2 reserved for B");
    assert(valid(st).ok, "valid world");
  });
  test("a stale screen cannot close a selection other than the one it showed", () => {
    const st = world(); const a = agreed(st, CASEY, "gC", "i1", NL);
    const [r1, r2] = okv(x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1", "k2"] }), "select");
    okv(x(st, CASEY, "continueTradeSelection", { oppId: a }), "ready");
    okv(x(st, CASEY, "withdrawTradeCard", { oppId: a, tradeCardId: r2 }), "Collector withdraws k2 meanwhile");
    no(x(st, NL, "closeTradeSelection", { oppId: a, expect: { tradeCardIds: [r1, r2] } }), "terms-changed", "stale");
    okv(x(st, NL, "closeTradeSelection", { oppId: a, expect: { tradeCardIds: [r1] } }), "fresh");
  });
  test("negative: a forged double reservation is refused at final agreement, and two live rows in one deal are reported", () => {
    const st = world();
    const a = agreed(st, CASEY, "gC", "i1", NL);
    const b = agreed(st, CASEY, "gC2", "i4", NL);
    const [ra] = toValuation(st, a, NL, CASEY, ["k1"]);
    settleCard(st, a, NL, CASEY, ra);
    const rowA = rowsOf(st, a).find((c) => c.id === ra);
    /* A state no command can produce: deal B holding the same copy in Deal. */
    st.fixture.patchOpportunity(b, (o) => ({ ...o, stage: "deal", deal: D.emptyDeal(),
      trade: { mode: "trade", cards: [{ ...rowA, id: "tc-forged" }] } }));
    no(x(st, NL, "acceptDeal", { oppId: a }), "copy-unavailable", "neither seat can agree a deal whose copy another deal also holds");
    eq(D.finalAgreementGiven(opp(st, a)), false, "nothing promised");
    st.fixture.patchOpportunity(a, (o) => ({ ...o, trade: { ...o.trade, cards: [...o.trade.cards, { ...rowA, id: "tc-dup" }] } }));
    assert(valid(st).errors.some((e) => e.code === "invariant.copy-live-once-per-deal"), "two live rows reported");
  });
});

/* =============================================== C. the specification lock */
describe("C. Material specifications lock at selection and release only when every deal lets go", () => {
  test("grade, condition and certificate cannot change while selected; value and notes can", () => {
    const st = world(); const a = agreed(st, CASEY, "gC", "i1", NL);
    okv(x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1", "k2"] }), "select");
    no(x(st, CASEY, "updateCollectorCopy", { copyId: "k1", patch: { grade: "PSA 10" } }), "copy-in-deal", "grade");
    no(x(st, CASEY, "updateCollectorCopy", { copyId: "k1", patch: { cert: "OTHER" } }), "copy-in-deal", "cert");
    no(x(st, CASEY, "updateCollectorCopy", { copyId: "k2", patch: { condition: "Damaged" } }), "copy-in-deal", "condition");
    no(x(st, CASEY, "updateCollectorCopy", { copyId: "k1", patch: { canonicalCardId: "cc-q" } }), D.REFUSE.identityImmutable, "printing identity, always");
    okv(x(st, CASEY, "updateCollectorCopy", { copyId: "k1", patch: { market: 140 } }), "private value is editable");
    okv(x(st, CASEY, "updateCollectorCopy", { copyId: "k1", patch: { grade: "PSA 8" } }), "restating the same value is not a change");
  });
  test("existing photographs cannot be replaced or removed; an empty slot may still be filled", () => {
    const st = world(); const a = agreed(st, CASEY, "gC", "i1", NL);
    okv(x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k2"] }), "select");
    no(x(st, CASEY, "updateCollectorCopy", { copyId: "k2", patch: { photos: { front: "new.jpg", back: null } } }), "copy-in-deal", "replace");
    no(x(st, CASEY, "updateCollectorCopy", { copyId: "k2", patch: { photos: { front: null, back: null } } }), "copy-in-deal", "remove");
    okv(x(st, CASEY, "updateCollectorCopy", { copyId: "k2", patch: { photos: { front: "kf.jpg", back: "kb.jpg" } } }), "fill the empty back");
  });
  test("a copy selected in two deals stays locked until both have released it", () => {
    const st = world();
    const a = agreed(st, CASEY, "gC", "i1", NL);
    const b = agreed(st, CASEY, "gC2", "i4", NL);
    const [ra] = okv(x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1"] }), "A");
    const [rb] = okv(x(st, NL, "selectTradeCards", { oppId: b, copyIds: ["k1"] }), "B");
    okv(x(st, CASEY, "withdrawTradeCard", { oppId: a, tradeCardId: ra }), "withdrawn from A");
    no(x(st, CASEY, "updateCollectorCopy", { copyId: "k1", patch: { grade: "PSA 10" } }), "copy-in-deal", "B still holds the lock");
    okv(x(st, CASEY, "withdrawTradeCard", { oppId: b, tradeCardId: rb }), "withdrawn from B");
    okv(x(st, CASEY, "updateCollectorCopy", { copyId: "k1", patch: { grade: "PSA 10" } }), "released");
    eq(rowsOf(st, a).find((c) => c.id === ra).grade, "PSA 8", "the deal's snapshot still says what was selected");
  });
  test("a selected or reserved copy cannot be switched to PC until it is withdrawn", () => {
    const st = world(); const a = agreed(st, CASEY, "gC", "i1", NL);
    const [r] = okv(x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1"] }), "select");
    no(x(st, CASEY, "setCollectorCopyKept", { copyId: "k1", keeping: true }), "copy-in-deal", "selected");
    okv(x(st, CASEY, "continueTradeSelection", { oppId: a }), "ready");
    okv(x(st, NL, "closeTradeSelection", { oppId: a }), "reserved");
    no(x(st, CASEY, "setCollectorCopyKept", { copyId: "k1", keeping: true }), "copy-in-deal", "reserved");
    okv(x(st, CASEY, "withdrawTradeCard", { oppId: a, tradeCardId: r }), "withdraw");
    okv(x(st, CASEY, "setCollectorCopyKept", { copyId: "k1", keeping: true }), "now theirs to keep");
  });
  test("an ended deal releases the lock", () => {
    const st = world(); const a = agreed(st, CASEY, "gC", "i1", NL);
    okv(x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1"] }), "select");
    okv(x(st, CASEY, "cancelOpportunity", { oppId: a, reason: "changed my mind" }), "end");
    eq(status(st, "k1"), "available", "released");
    okv(x(st, CASEY, "updateCollectorCopy", { copyId: "k1", patch: { grade: "PSA 10" } }), "editable");
  });
});

/* ===================================================== D. withdrawal */
describe("D. The Collector may withdraw a card from one deal until final agreement", () => {
  test("in Select Trade: the row is kept as history and Trade/Sell is untouched", () => {
    const st = world(); const a = agreed(st, CASEY, "gC", "i1", NL);
    const [r] = okv(x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1"] }), "select");
    const t0 = turn(st, a).reason;
    okv(x(st, CASEY, "withdrawTradeCard", { oppId: a, tradeCardId: r }), "withdraw");
    const row = rowsOf(st, a).find((c) => c.id === r);
    eq(row.withdrawn, true, "withdrawn"); eq(row.withdrawnStage, "select-trade", "where");
    eq(copy(st, "k1").offered, true, "still Trade/Sell"); eq(status(st, "k1"), "available", "released");
    eq(turn(st, a).reason, t0, "a retraction does not move the turn");
  });
  test("in Value Trade: the reservation is released and every other card's agreements stand", () => {
    const st = world(); const a = agreed(st, CASEY, "gC", "i1", NL);
    const [r1, r2] = toValuation(st, a, NL, CASEY, ["k1", "k2"]);
    okv(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r1, amount: 90 }), "k1 opened");
    okv(x(st, CASEY, "proposeMarketValue", { oppId: a, tradeCardId: r2, amount: 120 }), "k2 opened");
    okv(x(st, NL, "acceptMarketValue", { oppId: a, tradeCardId: r2 }), "k2 market agreed");
    okv(x(st, NL, "proposeTradePercent", { oppId: a, tradeCardId: r2, percent: 0.75 }), "k2 pct");
    okv(x(st, NL, "proposeMarketValue", { oppId: a, tradeCardId: r1, amount: 60 }), "partner counters k1 low");
    okv(x(st, CASEY, "acceptTradePercent", { oppId: a, tradeCardId: r2 }), "k2 settled");
    okv(x(st, CASEY, "withdrawTradeCard", { oppId: a, tradeCardId: r1 }), "k1 not worth it at that value");
    const w = rowsOf(st, a).find((c) => c.id === r1);
    eq(w.withdrawnStage, "value-trade", "stage recorded"); eq(w.valueThread.length, 2, "its thread is history");
    const kept = rowsOf(st, a).find((c) => c.id === r2);
    eq(kept.agreedMarket, 120, "sibling market stands"); eq(kept.agreedPercent, 0.75, "sibling percent stands");
    eq(status(st, "k1"), "available", "k1 released"); eq(copy(st, "k1").offered, true, "still Trade/Sell");
    eq(opp(st, a).stage, "deal", "what is left is settled, so the deal moves on");
  });
  test("in Deal: standing figures and both confirmations are voided by a reset entry", () => {
    const st = world(); const a = agreed(st, CASEY, "gC", "i1", NL);
    const [r1, r2] = toValuation(st, a, NL, CASEY, ["k1", "k2"]);
    settleAll(st, a, NL, CASEY, [[r1, 100, 0.8], [r2, 50, 0.8]]);
    okv(x(st, NL, "proposeFinalBalance", { oppId: a, amount: 150 }), "partner proposes");
    okv(x(st, NL, "acceptDeal", { oppId: a }), "partner confirms");
    const thread0 = opp(st, a).deal.adjThread.length;
    okv(x(st, CASEY, "withdrawTradeCard", { oppId: a, tradeCardId: r2 }), "withdraw in Deal");
    const d = opp(st, a).deal;
    eq(d.tpAgreed, false, "partner confirmation cleared"); eq(d.collectorAgreed, false, "collector");
    eq(d.tpAdj, null, "standing figure void"); eq(d.agreedAdj, null, "no agreed figure");
    eq(d.adjThread.length, thread0 + 1, "history kept, one entry added");
    eq(d.adjThread[d.adjThread.length - 1].type, "reset", "a reset");
    eq(D.currentCashFigure(opp(st, a)), D.calculatedBalance(opp(st, a)), "the figure on the table is the new balance");
    eq(D.calculatedBalance(opp(st, a)), 300 - 80, "balance from the remaining card only");
    eq(turn(st, a).actor, "partner", "confirmation restarts with the partner");
  });
  test("the last card leaving returns the deal to Select Trade — never to cash by itself", () => {
    const st = world(); const a = agreed(st, CASEY, "gC", "i1", NL);
    const [r1] = toValuation(st, a, NL, CASEY, ["k1"]);
    okv(x(st, CASEY, "withdrawTradeCard", { oppId: a, tradeCardId: r1 }), "withdraw the only card");
    eq(opp(st, a).stage, "select-trade", "back to Select Trade"); assert(opp(st, a).trade.mode !== "cash", "not cash");
    eq(turn(st, a).reason, "select-trade", "the partner may select again");
    /* Reselection: the ordinary process, a new row, the old one kept. */
    const [r2] = okv(x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1"] }), "select k1 again");
    assert(r2 !== r1, "a new row");
    eq(rowsOf(st, a).filter((c) => c.binderId === "k1").length, 2, "both rows on record");
    eq(rowsOf(st, a).find((c) => c.id === r1).withdrawn, true, "the old row stays withdrawn");
    eq(rowsOf(st, a).find((c) => c.id === r2).agreedMarket, null, "fresh valuation");
    assert(valid(st).ok, "valid world");
  });
  test("the last card leaving in Deal also returns to Select Trade, and cash only remains explicit", () => {
    const st = world(); const a = agreed(st, CASEY, "gC", "i1", NL);
    const [r1] = toValuation(st, a, NL, CASEY, ["k1"]);
    settleCard(st, a, NL, CASEY, r1);
    eq(opp(st, a).stage, "deal", "Deal");
    okv(x(st, CASEY, "withdrawTradeCard", { oppId: a, tradeCardId: r1 }), "withdraw");
    eq(opp(st, a).stage, "select-trade", "back to selection");
    eq(opp(st, a).deal.adjThread.slice(-1)[0].type, "reset", "deal history records the reset");
    okv(x(st, CASEY, "chooseCashOnly", { oppId: a }), "explicit cash");
    eq(D.currentCashFigure(opp(st, a)), 300, "cash at the agreed price");
  });
  test("after final agreement a card cannot be withdrawn unilaterally", () => {
    const st = world(); const a = agreed(st, CASEY, "gC", "i1", NL);
    const [r1] = toValuation(st, a, NL, CASEY, ["k1"]);
    settleCard(st, a, NL, CASEY, r1); finalAgree(st, a, NL, CASEY);
    no(x(st, CASEY, "withdrawTradeCard", { oppId: a, tradeCardId: r1 }), "copy-committed", "committed");
    eq(status(st, "k1"), "committed", "still committed");
  });
  test("stale final agreement and stale final figures are refused", () => {
    const st = world(); const a = agreed(st, CASEY, "gC", "i1", NL);
    const [r1, r2] = toValuation(st, a, NL, CASEY, ["k1", "k2"]);
    settleAll(st, a, NL, CASEY, [[r1, 100, 0.8], [r2, 100, 0.8]]);
    const seen = { balance: D.currentCashFigure(opp(st, a)), tradeCardIds: [r1, r2] };
    okv(x(st, CASEY, "withdrawTradeCard", { oppId: a, tradeCardId: r2 }), "withdraw");
    no(x(st, NL, "acceptDeal", { oppId: a, expect: seen }), "terms-changed", "stale agreement");
    no(x(st, NL, "proposeFinalBalance", { oppId: a, amount: 10, expect: { balance: seen.balance } }), "terms-changed", "stale figure");
    eq(opp(st, a).deal.tpAgreed, false, "nothing written");
    okv(x(st, NL, "acceptDeal", { oppId: a, expect: { balance: D.currentCashFigure(opp(st, a)), tradeCardIds: [r1] } }), "fresh agreement");
  });
  test("negative: withdrawing someone else's row, or a withdrawn row, is refused", () => {
    const st = world(); const a = agreed(st, CASEY, "gC", "i1", NL);
    const [r1] = okv(x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1"] }), "select");
    no(x(st, NL, "withdrawTradeCard", { oppId: a, tradeCardId: r1 }), "not-owner", "partner cannot withdraw");
    okv(x(st, CASEY, "withdrawTradeCard", { oppId: a, tradeCardId: r1 }), "withdraw");
    no(x(st, CASEY, "withdrawTradeCard", { oppId: a, tradeCardId: r1 }), "nothing-to-accept", "twice");
  });
});

/* ========================================= E. Goal and the shop's card */
describe("E. One active deal per Goal, and explicit endings when the shop's card is gone", () => {
  test("a Goal cannot hold a second active deal", () => {
    const st = world(); agreed(st, CASEY, "gC", "i1", NL);
    no(x(st, CASEY, "startOpportunity", { goalId: "gC", invId: "i2", amount: 300 }), "already-negotiating", "second deal");
    no(x(st, CASEY, "startOpportunity", { goalId: "gC", invId: "i3", amount: 300 }), "already-negotiating", "even at another shop");
  });
  test("another deal's final agreement ends every rival deal on the shop card, explicitly and at once", () => {
    const st = world();
    const win = agreed(st, CASEY, "gC", "i1", NL);
    const lose = agreed(st, JORDAN, "gJ", "i1", NL);
    const [rj] = toValuation(st, lose, NL, JORDAN, ["kJ"]);
    eq(status(st, "kJ"), "reserved", "Jordan's card is reserved");
    okv(x(st, CASEY, "chooseCashOnly", { oppId: win }), "Casey pays cash");
    finalAgree(st, win, NL, CASEY);
    const o = opp(st, lose);
    eq(D.isActive(o), false, "the losing deal ended"); eq(o.outcome, "card-unavailable", "outcome");
    eq(o.endedBy, null, "nobody ended it"); eq(o.endedStage, "value-trade", "where it was");
    eq(rowsOf(st, lose).find((c) => c.id === rj).reservedAt, AT, "history intact");
    eq(status(st, "kJ"), "available", "Jordan's card is released");
    no(x(st, NL, "proposeTradePercent", { oppId: lose, tradeCardId: rj, percent: 0.7 }), "terminal", "stale command refused");
    no(x(st, JORDAN, "acceptDeal", { oppId: lose }), "terminal", "stale agreement refused");
    const fresh = okv(x(st, JORDAN, "startOpportunity", { goalId: "gJ", invId: "i2", amount: 320 }), "the Goal is free");
    assert(fresh !== lose, "a new deal");
    assert(valid(st).ok, "valid world");
  });
  test("an ended deal does not come back if the winning deal is later cancelled", () => {
    const st = world();
    const win = agreed(st, CASEY, "gC", "i1", NL);
    const lose = agreed(st, JORDAN, "gJ", "i1", NL);
    okv(x(st, CASEY, "chooseCashOnly", { oppId: win }), "cash"); finalAgree(st, win, NL, CASEY);
    okv(x(st, CASEY, "cancelOpportunity", { oppId: win, reason: "could not meet" }), "winner cancels");
    eq(D.isActive(opp(st, lose)), false, "still ended"); eq(opp(st, lose).outcome, "card-unavailable", "unchanged");
  });
  test("a new deal on a copy whose promised deal was cancelled starts clean, and counts for its Goal", () => {
    const st = world();
    const win = agreed(st, CASEY, "gC", "i1", NL);
    okv(x(st, CASEY, "chooseCashOnly", { oppId: win }), "cash"); finalAgree(st, win, NL, CASEY);
    okv(x(st, CASEY, "cancelOpportunity", { oppId: win, reason: "could not meet" }), "promise cancelled");
    const fresh = okv(x(st, JORDAN, "startOpportunity", { goalId: "gJ", invId: "i1", amount: 300 }), "the card is back on the shelf");
    eq(D.transactionallyLost(opp(st, fresh), st.get().opportunities), false, "not born lost");
    eq(D.activeOppForGoal("gJ", st.get().opportunities).id, fresh, "it is the Goal's one deal");
    assert(valid(st).ok, JSON.stringify(valid(st).errors));
  });
  test("removing the shop card before a price is agreed ends the deals on it; a hold ends nothing", () => {
    const st = world();
    const held = okv(x(st, CASEY, "startOpportunity", { goalId: "gC", invId: "i2", amount: 300 }), "Casey offers on i2");
    const other = okv(x(st, JORDAN, "startOpportunity", { goalId: "gJ", invId: "i2", amount: 300 }), "Jordan offers too");
    okv(x(st, NL, "setCopyPending", { invId: "i2", oppId: held }), "a temporary hold for Casey");
    eq(D.isActive(opp(st, held)), true, "a hold ends nothing"); eq(D.isActive(opp(st, other)), true, "not even the other deal");
    okv(x(st, NL, "setCopyPending", { invId: "i2", oppId: null }), "hold released");
    okv(x(st, NL, "removeInventoryCopy", { invId: "i2" }), "shop removes the card");
    for (const id of [held, other]) {
      eq(opp(st, id).outcome, "card-unavailable", "ended explicitly"); eq(D.isActive(opp(st, id)), false, "not active");
      eq(opp(st, id).priceThread.length > 0, true, "price history kept");
    }
    okv(x(st, CASEY, "startOpportunity", { goalId: "gC", invId: "i1", amount: 300 }), "Casey's Goal is free");
  });
  test("removing the shop card after a price is agreed is still refused", () => {
    const st = world(); agreed(st, CASEY, "gC", "i1", NL);
    no(x(st, NL, "removeInventoryCopy", { invId: "i1" }), "copy-committed", "use cancellation instead");
  });
  test("the Collector is told the card is unavailable and nothing about the other buyer", () => {
    const st = world();
    const win = agreed(st, CASEY, "gC", "i1", NL);
    const lose = agreed(st, JORDAN, "gJ", "i1", NL);
    okv(x(st, CASEY, "chooseCashOnly", { oppId: win }), "cash"); finalAgree(st, win, NL, CASEY);
    const seen = (P.projectForActor(st.get(), JORDAN).opportunities || []).find((o) => o.id === lose);
    eq(seen.outcome, "card-unavailable", "Jordan sees the outcome");
    const text = JSON.stringify(P.projectForActor(st.get(), JORDAN));
    assert(!text.includes(win) && !text.includes("Casey"), "no trace of the winning deal or its Collector");
  });
  test("negative: validateWorld refuses an active deal that has lost its card", () => {
    const st = world();
    const win = agreed(st, CASEY, "gC", "i1", NL);
    const lose = agreed(st, JORDAN, "gJ", "i1", NL);
    okv(x(st, CASEY, "chooseCashOnly", { oppId: win }), "cash"); finalAgree(st, win, NL, CASEY);
    st.fixture.patchOpportunity(lose, (o) => ({ ...o, declined: false, outcome: undefined }));
    assert(valid(st).errors.some((e) => e.code === "invariant.lost-deal-active"), "reported");
    assert(D.activeOppForGoal("gJ", st.get().opportunities) != null, "and it counts for its Goal — no silent exclusion");
  });
});

/* ====================================== F. physical inventory identity */
describe("F. A removed shop copy is never revived; re-adding the same card is a new instance", () => {
  test("remove → re-add an identical card: a new inventory id with no inherited history", () => {
    const st = world();
    const old = okv(x(st, CASEY, "startOpportunity", { goalId: "gC", invId: "i2", amount: 300 }), "deal on i2");
    okv(x(st, NL, "removeInventoryCopy", { invId: "i2" }), "removed");
    const fresh = okv(x(st, NL, "addInventoryCopy", { copy: { canonicalCardId: "cc-x", ask: 320, grade: "PSA 9", cert: "C2", photos: PH } }), "identical card re-added");
    assert(fresh !== "i2", "a new inventory id");
    const inv = st.get().inventory;
    eq(inv.find((i) => i.invId === "i2").archived, true, "the old entry stays, removed");
    eq(inv.find((i) => i.invId === fresh).archived, false, "the new one is available");
    eq(st.get().opportunities.filter((o) => o.invId === fresh).length, 0, "no deal reattached");
    eq(opp(st, old).invId, "i2", "the old deal still names the old copy");
    eq(D.isActive(opp(st, old)), false, "and stays ended");
    eq(D.inventoryCopyStatus(fresh, st.get().opportunities, inv), "available", "independent status");
  });
  test("stale commands against the removed entry never reach the new one", () => {
    const st = world();
    const old = okv(x(st, CASEY, "startOpportunity", { goalId: "gC", invId: "i2", amount: 300 }), "deal on i2");
    okv(x(st, NL, "removeInventoryCopy", { invId: "i2" }), "removed");
    const fresh = okv(x(st, NL, "addInventoryCopy", { copy: { canonicalCardId: "cc-x", ask: 320, grade: "PSA 9", cert: "C2" } }), "re-added");
    no(x(st, NL, "acceptPrice", { oppId: old }), "terminal", "old deal stays dead");
    no(x(st, CASEY, "startOpportunity", { goalId: "gC", invId: "i2", amount: 300 }), "copy-unavailable", "old id unavailable");
    no(x(st, NL, "setCopyPending", { invId: "i2", oppId: old }), "copy-unavailable", "old id cannot be held");
    okv(x(st, NL, "updateInventoryCopy", { invId: "i2", patch: { note: "gone" } }), "a note on the archived record");
    assert(st.get().inventory.find((i) => i.invId === fresh).note !== "gone", "the new copy is untouched");
    const again = okv(x(st, CASEY, "startOpportunity", { goalId: "gC", invId: fresh, amount: 320 }), "a NEW deal for the new copy");
    assert(again !== old, "never the old deal"); eq(opp(st, again).priceThread.length, 1, "starting from nothing");
  });
  test("an identical certificate does not establish continuity, and an old id cannot be reclaimed", () => {
    const st = world();
    okv(x(st, NL, "removeInventoryCopy", { invId: "i2" }), "removed");
    /* The prototype runtime honours a proposed id; the archived one is still taken. */
    no(x(st, NL, "addInventoryCopy", { copy: { invId: "i2", canonicalCardId: "cc-x", grade: "PSA 9", cert: "C2" } }), "copy-in-use", "old id cannot be reused");
    const fresh = okv(x(st, NL, "addInventoryCopy", { copy: { canonicalCardId: "cc-x", grade: "PSA 9", cert: "C2" } }), "same cert, new copy");
    eq(st.get().inventory.filter((i) => i.cert === "C2").length, 2, "two instances, one cert");
    assert(fresh !== "i2", "distinct");
  });
  test("the CSV import adds copies through addInventoryCopy and never carries an inventory id", () => {
    const { COPY_KEYS } = require("../server/inventory/mapping.js");
    assert(!COPY_KEYS.includes("invId"), "no id travels from a file");
    const src = require("fs").readFileSync(require("path").join(__dirname, "../server/inventory/import.js"), "utf8");
    assert(/command: "addInventoryCopy"/.test(src), "adds, never restores");
    assert(!/archived:\s*false|"updateInventoryCopy"/.test(src), "never un-archives or rewrites an existing copy");
    assert(/copy\.archived === true\) continue/.test(src), "archived copies are not counted as the shelf");
  });
});

/* ============================================ G. boundaries and money */
describe("G. Production boundary, privacy and money are unchanged", () => {
  test("no A1 trade command is exposed to production", () => {
    /* RESTATED (M3A A3, founder-authorized): Select Trade's six became
       production doors with the screens that send them. Everything after
       Select Trade, cash-only and the retired names stay shut. */
    for (const c of ["selectTradeCards", "deselectTradeCard", "holdTradeSelection", "continueTradeSelection",
      "closeTradeSelection", "withdrawTradeCard"]) eq(isExposed(c), true, c);
    for (const c of ["chooseCashOnly", "acceptDeal", "proposeFinalBalance",
      "proposeTradeSelection", "reviewTradeCard"]) eq(isExposed(c), false, c);
  });
  test("a partner never receives a Collector's keep decision or private value", () => {
    const st = world(); const a = agreed(st, CASEY, "gC", "i1", NL);
    okv(x(st, CASEY, "updateCollectorCopy", { copyId: "k1", patch: { market: 999 } }), "private value");
    okv(x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1"] }), "select");
    const v = tpView(st, NL);
    assert(!JSON.stringify(v.collectorCopies).includes("999"), "no market");
    assert(!(v.collectorCopies || []).some((b) => "keeping" in b), "no keeping");
    eq(tpCopy(st, NL, "k1").status, "selected", "the partner sees its own selection");
    eq((v.opportunities.find((o) => o.id === a).trade.cards || []).length, 1, "and its own row");
  });
  test("credit, the balance and its sign are computed exactly as before", () => {
    const st = world(); const a = agreed(st, CASEY, "gC", "i1", NL, 300);
    const [r1, r2] = toValuation(st, a, NL, CASEY, ["k1", "k2"]);
    /* RESTATED (M3B D1, founder-approved): market values are whole dollars now,
       so $250.50 is refused (tests/milestone3b1-value-trade-domain.cjs). $251 at
       85% is $213.35 — the rounding of the credit is still what is tested. */
    settleAll(st, a, NL, CASEY, [[r1, 251, 0.85], [r2, 199, 0.7]]);
    const o = opp(st, a);
    eq(D.tradeValueOf(rowsOf(st, a)[0]), Math.round(251 * 0.85), "credit rounding");
    eq(D.calculatedBalance(o), 300 - Math.round(251 * 0.85) - Math.round(199 * 0.7), "balance");
    assert(D.calculatedBalance(o) < 0, "a negative balance is still a balance");
    no(x(st, NL, "proposeFinalBalance", { oppId: a, amount: -49.5 }), "invalid-amount", "still whole dollars");
    okv(x(st, NL, "proposeFinalBalance", { oppId: a, amount: -50 }), "whole-dollar negative figure");
  });
  test("the demo seed and a full trade journey leave a valid world", () => {
    const st = world(); const a = agreed(st, CASEY, "gC", "i1", NL);
    const [r1] = toValuation(st, a, NL, CASEY, ["k1"]);
    settleCard(st, a, NL, CASEY, r1); finalAgree(st, a, NL, CASEY);
    eq(status(st, "k1"), "committed", "committed at final agreement");
    assert(valid(st).ok, JSON.stringify(valid(st).errors));
    const { buildCanonicalSeed } = require("../dist/MetYet.cjs");
    const demo = W.validateWorld(createStore(buildCanonicalSeed()).get());
    assert(demo.ok, "demo seed is valid: " + JSON.stringify(demo.errors.slice(0, 2)));
  });
});

run();
