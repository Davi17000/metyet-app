/* ============================================================================
   OPTION B — WHEN A PHYSICAL CARD STOPS BEING ANYBODY'S TO PURSUE

   One sentence is the whole batch:

     Available until the partner deliberately makes the copy Pending, or both
     parties reach Final Deal Agreement. Sold only after completion.

   WHAT THIS REPLACED. Agreeing what a card was WORTH used to take it away from
   everybody else — silently, with nobody deciding it. That read a shared fact
   as a promise, and it is the thing "agreement about information is not
   agreement to transact" was written against. Two collectors may now both find
   out what one card is worth, and neither is owed it.

   WHAT REPLACED IT, AND WHY IT IS TWO THINGS RATHER THAN ONE.

     Pending            a partner's decision. Stops new pursuits. Releasable.
     Final agreement    a promise. Stops a second promise. Not releasable
                        without saying why.

   They do different jobs and neither can do the other's. Pending manages
   concurrency and a partner may forget it, so it cannot carry safety. Final
   agreement carries safety and nobody chooses when it lands, so it cannot
   manage concurrency. The one rule that matters — a physical card cannot be
   promised twice — hangs on the second, never the first.

   THE THIRD BOUNDARY, WHICH DID NOT MOVE. `copyInLiveDeal` still keys on a
   settled price, because "may somebody else pursue this?" and "may the partner
   still CHANGE this?" are different questions. From the moment a value is
   agreed, a collector is reasoning about this exact slab; re-certifying it or
   archiving it underneath them is a different harm from letting a second
   person ask about it. Section J is that distinction, pinned.

   The numbered invariants are the ones the implementation brief required; each
   test names the number it discharges.
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const D = require("../domain/metyet-domain.js");
const P = require("../domain/metyet-projection.js");
const { createStore } = require("./fixture-store.cjs");
const RT = require("../domain/metyet-runtime.js");

const AT = "2026-09-28";
let seq = 0;
const runtime = () => RT.createRuntime({
  now: () => AT, newId: (p = "") => `${p}${++seq}`,
});

const PH = { front: "f.jpg", back: "b.jpg" };
const TP = { partnerId: "nl" };
const A = { collectorId: "casey" };
const B = { collectorId: "jordan" };

/* One partner, two related collectors, two physical copies of one card, and
   one collector-owned card to trade. Everything below builds on this. */
const world = (over = {}) => createStore({
  partners: [{ id: "nl", name: "Northline", tradeRate: 0.7 }],
  collectors: [{ id: "casey", name: "Casey" }, { id: "jordan", name: "Jordan" }],
  relationships: [
    { partnerId: "nl", collectorId: "casey", status: "accepted", at: AT },
    { partnerId: "nl", collectorId: "jordan", status: "accepted", at: AT }],
  goals: [
    { id: "gA", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } },
    { id: "gB", collectorId: "jordan", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } }],
  inventory: [
    { invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 30, grade: "PSA 9", cert: "C1", photos: PH },
    { invId: "i2", partnerId: "nl", canonicalCardId: "cc-x", ask: 32, grade: "PSA 9", cert: "C2", photos: PH }],
  collectorCopies: [
    { id: "kA1", collectorId: "casey", canonicalCardId: "cc-y", grade: "PSA 8", offered: true, photos: PH },
    { id: "kA2", collectorId: "casey", canonicalCardId: "cc-z", grade: "PSA 7", offered: true, photos: PH }],
  binders: [], binderEntries: [], opportunities: [], catalog: [],
  copyReviews: [], photoRequests: [], conversations: [], interests: [],
  ...over,
}, runtime());

const x = (st, actor, cmd, payload) => st.execute(actor, cmd, payload || {});
const okv = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
const nov = (r, code, why) => { eq(r && r.refused, code, why); };
const status = (st, invId = "i1") =>
  D.inventoryCopyStatus(invId, st.get().opportunities, st.get().inventory);
const oppOf = (st, cid) => st.get().opportunities.find((o) => o.collectorId === cid);
const view = (st, actor) => P.projectForActor(st.get(), actor);
const discoveryOf = (st, actor) => (view(st, actor).discoveries || [])[0] || null;
const copyRow = (st, actor, invId = "i1") =>
  (view(st, actor).inventory || []).find((i) => i.invId === invId) || null;

/* A conversation that has agreed a value but promised nothing. */
const valued = (st, actor, goalId, invId, amount) => {
  const id = okv(x(st, actor, "startOpportunity", { goalId, invId, amount, at: AT }), "open");
  okv(x(st, TP, "acceptPrice", { oppId: id, at: AT }), "the partner agrees the value");
  return id;
};
/* …and one that has been promised. */
const promised = (st, actor, oppId, binderIds) => {
  okv(x(st, actor, "proposeTradeSelection", { oppId, binderIds: binderIds || [], at: AT }), "package");
  if (binderIds && binderIds.length) {
    const o = st.get().opportunities.find((o2) => o2.id === oppId);
    for (const row of o.trade.cards) {
      okv(x(st, TP, "reviewTradeCard", { oppId, tradeCardId: row.id, decision: "accept", at: AT }), "accept card");
      okv(x(st, actor, "proposeMarketValue", { oppId, tradeCardId: row.id, amount: 20, at: AT }), "value");
      okv(x(st, TP, "acceptMarketValue", { oppId, tradeCardId: row.id, at: AT }), "value ok");
      okv(x(st, TP, "proposeTradePercent", { oppId, tradeCardId: row.id, percent: 0.7, at: AT }), "pct");
      okv(x(st, actor, "acceptTradePercent", { oppId, tradeCardId: row.id, at: AT }), "pct ok");
    }
  }
  okv(x(st, TP, "acceptDeal", { oppId, at: AT }), "the partner says yes");
  okv(x(st, actor, "acceptDeal", { oppId, at: AT }), "and so does the collector");
  return oppId;
};
const completed = (st, actor, oppId) => {
  okv(x(st, TP, "proposeFulfillment", { oppId, plan: { method: "show", show: "Leeds", date: "2026-10-04" }, at: AT }), "plan");
  okv(x(st, actor, "confirmFulfillmentPlan", { oppId, at: AT }), "plan ok");
  okv(x(st, TP, "confirmHandoff", { oppId, at: AT }), "handed over");
  okv(x(st, actor, "confirmHandoff", { oppId, at: AT }), "received");
  return oppId;
};

/* ============================================ A. qualification reserves nothing */
describe("A. Looking at a card is not claiming it", () => {
  test("[1] inspecting and asking for photographs reserve nothing", () => {
    const st = world({ inventory: [
      { invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 30, grade: "PSA 9", photos: null }] });
    okv(x(st, A, "reviewCopy", { invId: "i1", at: AT }), "review");
    okv(x(st, A, "requestPhotos", { invId: "i1", at: AT }), "photos");
    eq(status(st), "available", "the card is still anybody's");
    eq(st.get().opportunities.length, 0, "and no deal was invented");
    assert(okv(x(st, B, "startOpportunity", { goalId: "gB", invId: "i1", amount: 26, at: AT }), "B may open one"));
  });

  test("[2] a sold copy cannot be photographed on request", () => {
    const st = world();
    completed(st, A, promised(st, A, valued(st, A, "gA", "i1", 27)));
    eq(status(st), "sold", "the card is gone");
    nov(x(st, B, "requestPhotos", { invId: "i1", at: AT }), D.REFUSE.copyUnavailable,
      "so there is nothing to photograph");
    nov(x(st, B, "reviewCopy", { invId: "i1", at: AT }), D.REFUSE.copyUnavailable,
      "and the two commands answer alike");
  });

  test("[2] photo requests are still idempotent on an available copy", () => {
    const st = world({ inventory: [
      { invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 30, grade: "PSA 9", photos: null }] });
    okv(x(st, A, "requestPhotos", { invId: "i1", at: AT }), "first");
    okv(x(st, A, "requestPhotos", { invId: "i1", at: AT }), "second");
    eq(st.get().photoRequests.length, 1, "one request, not two");
    eq(st.get().copyReviews.length, 1, "and the review it opened for them");
  });
});

/* ====================================== B. two people may value the same card */
describe("B. A valuation is a shared fact, not a claim", () => {
  test("[4] two collectors may hold concurrent conversations on one copy", () => {
    const st = world();
    okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 25, at: AT }), "A opens");
    okv(x(st, B, "startOpportunity", { goalId: "gB", invId: "i1", amount: 26, at: AT }), "B opens");
    eq(st.get().opportunities.length, 2, "both stand");
    eq(status(st), "available", "and the card is still available");
    eq(copyRow(st, A).status, "available", "to A");
    eq(copyRow(st, B).status, "available", "and to B");
  });

  test("[5][6] both may agree a value, and the copy stays available", () => {
    const st = world();
    valued(st, A, "gA", "i1", 27);
    eq(status(st), "available", "agreeing what it is worth claims nothing");
    valued(st, B, "gB", "i1", 26);
    eq(st.get().opportunities.filter((o) => o.agreedPrice != null).length, 2,
      "two agreed values on one physical card");
    eq(status(st), "available", "and it is still available");
  });

  test("[7] an agreed value leaves exact Discovery intact", () => {
    const st = world();
    const before = discoveryOf(st, B);
    eq(JSON.stringify(before.invIds), JSON.stringify(["i1", "i2"]), "both copies are supply");
    valued(st, A, "gA", "i1", 27);
    const after = discoveryOf(st, B);
    eq(JSON.stringify(after.invIds), JSON.stringify(["i1", "i2"]),
      "and still both after somebody agrees a value");
    eq(after.copies, 2, "nothing was taken out of B's match");
  });
});

/* ============================================================ C. Pending */
describe("C. Pending is the one availability fact a partner chooses", () => {
  test("[8] a partner may mark a copy pending for one active deal", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    okv(x(st, TP, "setCopyPending", { invId: "i1", oppId: a, at: AT }), "marked");
    eq(status(st), "pending", "the card is spoken for");
    eq(st.get().inventory.find((i) => i.invId === "i1").pendingFor, a, "by that deal");
  });

  test("[8] and nobody else may", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    nov(x(st, A, "setCopyPending", { invId: "i1", oppId: a, at: AT }), D.REFUSE.notOwner,
      "not the collector in the deal");
    /* A REAL second shop, so the refusal is ownership rather than "who?". */
    const st2 = world({ partners: [{ id: "nl", name: "Northline", tradeRate: 0.7 },
      { id: "hb", name: "Harbour", tradeRate: 0.6 }] });
    const b = valued(st2, A, "gA", "i1", 27);
    nov(x(st2, { partnerId: "hb" }, "setCopyPending", { invId: "i1", oppId: b, at: AT }),
      D.REFUSE.notOwner, "nor another shop");
  });

  test("[8] the named deal must be real, theirs, on that copy, and running", () => {
    /* One goal per conversation — `oneNegotiationPerGoal` is unchanged by this
       batch, so A needs a second goal to hold a second deal. */
    const st = world({ goals: [
      { id: "gA", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } },
      /* gA2 asks for what i2 actually is: since the true-match batch a Goal's
         stated criteria constrain startOpportunity, and this test is about
         which DEAL may be named, not about criteria. */
      { id: "gA2", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } },
      { id: "gB", collectorId: "jordan", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } }] });
    const a = valued(st, A, "gA", "i1", 27);
    const other = valued(st, A, "gA2", "i2", 31);
    nov(x(st, TP, "setCopyPending", { invId: "i1", oppId: "nope", at: AT }), D.REFUSE.notFound,
      "an invented deal");
    nov(x(st, TP, "setCopyPending", { invId: "i1", oppId: other, at: AT }), D.REFUSE.identityMismatch,
      "a deal about a different copy");
    okv(x(st, A, "cancelOpportunity", { oppId: a, reason: "no", at: AT }), "end it");
    nov(x(st, TP, "setCopyPending", { invId: "i1", oppId: a, at: AT }), D.REFUSE.terminal,
      "and a deal that has ended");
  });

  test("[9] a pending copy leaves new Discovery", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    x(st, TP, "setCopyPending", { invId: "i1", oppId: a, at: AT });
    const d = discoveryOf(st, B);
    eq(JSON.stringify(d.invIds), JSON.stringify(["i2"]), "only the other copy is supply");
    eq(d.copies, 1, "and the count says so");
  });

  test("[10] a pending copy refuses a new pursuit, without saying why", () => {
    /* RE-PINNED by the integrity/privacy cleanup. This used to require the
       refusal to be `copy-pending` "in its own words". The word was the leak:
       a new pursuit needs no connection to the card, so three distinct answers
       were a public oracle on a rival deal's stage. The DOMAIN still knows —
       asserted below — and a collector is told one thing. */
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    x(st, TP, "setCopyPending", { invId: "i1", oppId: a, at: AT });
    const r = x(st, B, "startOpportunity", { goalId: "gB", invId: "i1", amount: 28, at: AT });
    nov(r, D.REFUSE.copyUnavailable, "not available to Jordan, and that is all he learns");
    eq(Object.keys(r).sort().join(","), "ok,refused", "and it names nobody");
    eq(status(st), "pending", "while the domain still knows exactly what it is");
  });

  test("[11] the deal it is pending FOR carries on untouched", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    x(st, TP, "setCopyPending", { invId: "i1", oppId: a, at: AT });
    okv(x(st, A, "proposeTradeSelection", { oppId: a, binderIds: [], at: AT }), "A picks cash");
    okv(x(st, TP, "acceptDeal", { oppId: a, at: AT }), "and the deal proceeds");
    eq(copyRow(st, A).status, "pending", "A sees it as pending — for their deal");
  });

  test("[12] and another collector's conversation cannot progress", () => {
    const st = world();
    okv(x(st, B, "startOpportunity", { goalId: "gB", invId: "i1", amount: 26, at: AT }), "B was already talking");
    const a = valued(st, A, "gA", "i1", 27);
    x(st, TP, "setCopyPending", { invId: "i1", oppId: a, at: AT });
    const b = oppOf(st, "jordan").id;
    nov(x(st, TP, "proposePrice", { oppId: b, amount: 29, at: AT }), D.REFUSE.copyPending,
      "no more figures over a card the shop is working on");
    nov(x(st, TP, "acceptPrice", { oppId: b, at: AT }), D.REFUSE.copyPending, "and none accepted");
    assert(oppOf(st, "jordan"), "but B's conversation still exists");
    eq(copyRow(st, B).status, "unavailable", "and B can see the card is not theirs to pursue");
  });

  test("[13] releasing restores availability and erases nothing", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    x(st, TP, "setCopyPending", { invId: "i1", oppId: a, at: AT });
    okv(x(st, TP, "setCopyPending", { invId: "i1", oppId: null, at: AT }), "released");
    eq(status(st), "available", "the card is back");
    eq(JSON.stringify(discoveryOf(st, B).invIds), JSON.stringify(["i1", "i2"]), "and so is B's match");
    const o = st.get().opportunities.find((y) => y.id === a);
    eq(o.agreedPrice, 27, "A's agreed value survived");
    eq(o.priceThread.length, 2, "and the whole thread with it");
    okv(x(st, B, "startOpportunity", { goalId: "gB", invId: "i1", amount: 28, at: AT }), "B may pursue again");
  });

  test("[14] a stale pendingFor derives as available with no sweep", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    x(st, TP, "setCopyPending", { invId: "i1", oppId: a, at: AT });
    okv(x(st, A, "cancelOpportunity", { oppId: a, reason: "changed my mind", at: AT }), "A walks away");
    eq(st.get().inventory.find((i) => i.invId === "i1").pendingFor, a,
      "the field still points at the ended deal");
    eq(status(st), "available", "and the card reads available anyway");
    okv(x(st, B, "startOpportunity", { goalId: "gB", invId: "i1", amount: 28, at: AT }), "so B may pursue it");
  });

  test("a partner cannot pend one copy for two deals at once", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    const b = valued(st, B, "gB", "i1", 26);
    okv(x(st, TP, "setCopyPending", { invId: "i1", oppId: a, at: AT }), "for A");
    nov(x(st, TP, "setCopyPending", { invId: "i1", oppId: b, at: AT }), D.REFUSE.copyPending,
      "and not also for B");
  });

  test("pending is not reachable through the ordinary inventory patch", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    okv(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { pendingFor: a }, at: AT }), "patch accepted");
    eq(st.get().inventory.find((i) => i.invId === "i1").pendingFor, undefined,
      "but availability is not a description of the card");
    eq(status(st), "available", "so nothing changed");
  });

  test("nor by adding a copy that claims to be pending", () => {
    const st = world();
    const id = okv(x(st, TP, "addInventoryCopy", { copy: {
      canonicalCardId: "cc-q", ask: 10, pendingFor: "made-up" } , at: AT }), "added");
    eq(st.get().inventory.find((i) => i.invId === id).pendingFor, undefined,
      "a brand-new card is pending for nothing");
  });

  test("[privacy] a collector never receives another deal's id", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    x(st, TP, "setCopyPending", { invId: "i1", oppId: a, at: AT });
    for (const who of [A, B]) {
      const rows = view(st, who).inventory || [];
      rows.forEach((r) => assert(!("pendingFor" in r),
        "a collector is told the status, never the deal behind it"));
    }
    const mine = (view(st, TP).inventory || []).find((i) => i.invId === "i1");
    eq(mine.pendingFor, a, "the shop that set it can see it");
  });
});

/* ======================================= D. final agreement is the hard line */
describe("D. A promise is what a card cannot carry twice", () => {
  test("[15] final agreement makes the copy exclusive", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    eq(status(st), "available", "not before");
    promised(st, A, a);
    eq(status(st), "committed", "and after");
  });

  test("[16] one copy cannot reach final agreement in two deals", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    const b = valued(st, B, "gB", "i1", 26);
    /* B assembles their deal FIRST, so both reach the promise boundary and it
       is that guard — not the earlier package guard — under test. */
    okv(x(st, B, "proposeTradeSelection", { oppId: b, binderIds: [], at: AT }), "B picks cash first");
    promised(st, A, a);
    nov(x(st, TP, "acceptDeal", { oppId: b, at: AT }), D.REFUSE.copyCommitted,
      "and then the card has already been promised");
    assert(!D.finalAgreementGiven(st.get().opportunities.find((o) => o.id === b)),
      "and nothing was written to B's deal");
  });

  test("[17] one copy cannot complete two deals", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    const b = valued(st, B, "gB", "i1", 26);
    okv(x(st, B, "proposeTradeSelection", { oppId: b, binderIds: [], at: AT }), "B picks cash first");
    completed(st, A, promised(st, A, a));
    nov(x(st, TP, "acceptDeal", { oppId: b, at: AT }), D.REFUSE.copyUnavailable, "the card is gone");
    eq(st.get().opportunities.filter((o) => o.stage === "completed" && o.invId === "i1").length, 1,
      "exactly one deal completed on this physical card");
  });

  test("[18] a sold copy refuses everything that would move it", () => {
    const st = world();
    okv(x(st, B, "startOpportunity", { goalId: "gB", invId: "i1", amount: 26, at: AT }), "B was talking");
    const a = valued(st, A, "gA", "i1", 27);
    completed(st, A, promised(st, A, a));
    const b = oppOf(st, "jordan").id;
    nov(x(st, TP, "proposePrice", { oppId: b, amount: 29, at: AT }), D.REFUSE.copyUnavailable, "no new figures");
    nov(x(st, TP, "acceptPrice", { oppId: b, at: AT }), D.REFUSE.copyUnavailable, "nothing accepted");
    nov(x(st, B, "reviewCopy", { invId: "i1", at: AT }), D.REFUSE.copyUnavailable, "no review");
    nov(x(st, B, "requestPhotos", { invId: "i1", at: AT }), D.REFUSE.copyUnavailable, "no photographs");
    /* RE-PINNED by the true-match batch. This used to answer
       `already-negotiating`: B's dead conversation still held their Goal, so
       the refusal was about the Goal rather than about the card. That lock is
       now released once the copy is gone — which is the point — so B reaches
       the availability gate and is told the honest thing instead. */
    nov(x(st, B, "startOpportunity", { goalId: "gB", invId: "i1", amount: 30, at: AT }),
      D.REFUSE.copyUnavailable, "and the card itself is what is gone");
    eq(D.goalState("gB", st.get().opportunities), "seeking",
      "B's goal is free again, rather than held by a deal that lost");
  });

  test("[3][19] the losing conversation is kept, not rewritten or deleted", () => {
    const st = world();
    okv(x(st, B, "startOpportunity", { goalId: "gB", invId: "i1", amount: 26, at: AT }), "B was talking");
    const a = valued(st, A, "gA", "i1", 27);
    completed(st, A, promised(st, A, a));
    const b = oppOf(st, "jordan");
    assert(b, "B's deal still exists");
    eq(b.stage, "agree-price", "at the stage it actually reached");
    eq(b.declined, false, "not marked as a failure nobody chose");
    eq(copyRow(st, B).status, "unavailable", "and the card is still legible to them");
    okv(x(st, B, "cancelOpportunity", { oppId: b.id, at: AT }), "B may close it themselves");
  });

  test("a promised copy still refuses a new pursuit", () => {
    const st = world();
    promised(st, A, valued(st, A, "gA", "i1", 27));
    /* RE-PINNED: same collapse as [10]. What matters here is that it refuses;
       that it refuses in the SAME word as pending and sold is the point. */
    nov(x(st, B, "startOpportunity", { goalId: "gB", invId: "i1", amount: 28, at: AT }),
      D.REFUSE.copyUnavailable, "somebody has been promised this one");
    eq(status(st), "committed", "though the domain has not forgotten which it is");
  });

  test("pending for THIS deal never blocks its own promise", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    x(st, TP, "setCopyPending", { invId: "i1", oppId: a, at: AT });
    promised(st, A, a);
    eq(D.finalAgreementGiven(st.get().opportunities.find((o) => o.id === a)), true,
      "the shop holding it for you is not an obstacle to you");
  });
});

/* ============================================ E. the mutation window did not move */
describe("E. What a partner may still change, and when", () => {
  test("[20] the certificate lock and the archive guard keep the wider window", () => {
    const st = world();
    valued(st, A, "gA", "i1", 27);
    eq(status(st), "available", "the card is available to pursue");
    nov(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { cert: "PSA-999" }, at: AT }),
      D.REFUSE.copyCommitted, "and yet its certificate is locked");
    nov(x(st, TP, "removeInventoryCopy", { invId: "i1", at: AT }), D.REFUSE.copyCommitted,
      "and it cannot be taken off the shelf");
    okv(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { ask: 33 }, at: AT }),
      "while the asking price is still the shop's own business");
  });

  test("[20] and release when the deal ends", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    okv(x(st, A, "cancelOpportunity", { oppId: a, at: AT }), "ended");
    okv(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { cert: "PSA-999" }, at: AT }),
      "the certificate is the shop's again");
  });

  test("the two windows are genuinely different predicates", () => {
    const st = world();
    valued(st, A, "gA", "i1", 27);
    assert(D.INVARIANTS.copyInLiveDeal("i1", st.get().opportunities),
      "mutation safety says this copy is in a live deal");
    eq(D.INVARIANTS.copyCommittedTo("i1", st.get().opportunities), null,
      "while availability says nobody has been promised it");
  });
});

/* ==================================== F. the economics were not disturbed */
describe("F. What this batch must not have touched", () => {
  test("[21][22] agreed market value survives the final adjustment", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    okv(x(st, A, "proposeTradeSelection", { oppId: a, binderIds: [], at: AT }), "cash");
    okv(x(st, TP, "acceptDeal", { oppId: a, at: AT }), "partner first");
    okv(x(st, A, "proposeFinalBalance", { oppId: a, amount: 25, at: AT }), "would you do 25");
    okv(x(st, TP, "acceptDeal", { oppId: a, at: AT }), "partner again");
    okv(x(st, A, "acceptDeal", { oppId: a, at: AT }), "and done");
    const o = st.get().opportunities.find((y) => y.id === a);
    eq(o.agreedPrice, 27, "what they agreed it is worth");
    eq(o.deal.agreedAdj, 25, "and what they agreed to do about it");
  });

  test("[23] trade-card value and percentage stay independent", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    promised(st, A, a, ["kA1"]);
    const card = st.get().opportunities.find((y) => y.id === a).trade.cards[0];
    eq(card.agreedMarket, 20, "the card's agreed value");
    eq(card.agreedPercent, 0.7, "and the agreed percentage, separately");
    eq(st.get().opportunities.find((y) => y.id === a).agreedPrice, 27, "with their copy untouched");
  });

  test("[24] nextActor is still the turn authority", () => {
    const st = world();
    const a = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 25, at: AT }), "open");
    const o = () => st.get().opportunities.find((y) => y.id === a);
    eq(D.nextActor(o()).actor, "partner", "the partner answers an offer");
    nov(x(st, A, "proposePrice", { oppId: a, amount: 26, at: AT }), D.REFUSE.notYourTurn,
      "and the collector may not answer themselves");
  });
});

/* ============================== G. the collector's own cards did not change */
describe("G. Collector trade-copy exclusivity, unchanged", () => {
  test("[25] a copy offered into one deal cannot enter another", () => {
    const st = world({ goals: [
      { id: "gA", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } },
      { id: "gA2", collectorId: "casey", canonicalCardId: "cc-w", tier: "primary", desired: { grade: "PSA 9" } }],
    inventory: [
      { invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 30, grade: "PSA 9", photos: PH },
      { invId: "i2", partnerId: "nl", canonicalCardId: "cc-w", ask: 40, grade: "PSA 9", photos: PH }] });
    const a = valued(st, A, "gA", "i1", 27);
    const b = valued(st, A, "gA2", "i2", 38);
    okv(x(st, A, "proposeTradeSelection", { oppId: a, binderIds: ["kA1"], at: AT }), "into the first");
    eq(D.collectorCopyStatus("kA1", st.get().opportunities), "reserved", "and it is reserved");
    nov(x(st, A, "proposeTradeSelection", { oppId: b, binderIds: ["kA1"], at: AT }), D.REFUSE.copyReserved,
      "so it cannot go into the second");
    nov(x(st, A, "proposeTradeSelection", { oppId: b, binderIds: ["kA2", "kA2"], at: AT }), D.REFUSE.copyInUse,
      "nor twice into one package");
    okv(x(st, A, "proposeTradeSelection", { oppId: b, binderIds: ["kA2"], at: AT }), "a different copy is fine");
  });

  test("[26][27] cancellation releases it; completion makes it traded", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    okv(x(st, A, "proposeTradeSelection", { oppId: a, binderIds: ["kA1"], at: AT }), "offered");
    okv(x(st, A, "cancelOpportunity", { oppId: a, at: AT }), "ended");
    eq(D.collectorCopyStatus("kA1", st.get().opportunities), "available", "released");

    const st2 = world();
    const c = valued(st2, A, "gA", "i1", 27);
    completed(st2, A, promised(st2, A, c, ["kA1"]));
    eq(D.collectorCopyStatus("kA1", st2.get().opportunities), "traded", "and traded once it is gone");
  });

  /* THE ONE THAT NEARLY GOT AWAY. `tests/all.cjs` is an explicit list, so a
     suite that is written and not added to it is never run — and `npm test`
     still says ALL SUITES PASSED. This suite spent its first full run in
     exactly that state: green on its own, invisible to the build. A file
     nobody runs is worse than a file nobody wrote, because it looks like
     cover. */
  test("every suite in tests/ is actually registered to run", () => {
    const fs = require("fs");
    const path = require("path");
    const dir = path.join(__dirname);
    const listed = fs.readFileSync(path.join(dir, "all.cjs"), "utf8");
    /* A SUITE IS A FILE THAT DECLARES TESTS — asked structurally rather than
       against a list of exceptions, because a hand-kept exception list is the
       same kind of thing that let this problem exist. Harnesses and fixtures
       declare none and are not suites. */
    /* WALKED, AND NOT ANCHORED TO COLUMN ZERO. An adversarial pass defeated the
       first version twice: a `describe(` indented inside an `if` block escaped
       `/^describe\(/m`, and a suite in a subdirectory escaped a flat read. */
    const walk = (d, base = "") => fs.readdirSync(d, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), `${base}${e.name}/`)
        : [`${base}${e.name}`]));
    const missing = walk(dir)
      .filter((f) => f.endsWith(".cjs") && f !== "all.cjs")
      .filter((f) => /(^|\n)\s*describe\(/.test(fs.readFileSync(path.join(dir, f), "utf8")))
      .filter((f) => !listed.includes(`tests/${f}`));
    eq(missing.join(", "), "", "written but never run");
  });

  test("the partner's own Inventory screen shows Pending", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    x(st, TP, "setCopyPending", { invId: "i1", oppId: a, at: AT });
    const mine = (view(st, TP).inventory || []).find((i) => i.invId === "i1");
    eq(mine.status, "pending", "the shop that set it sees it — this is the feature's own surface");
  });

  test("an archived copy cannot be negotiated over", () => {
    const st = world();
    const a = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 25, at: AT }), "open");
    okv(x(st, TP, "removeInventoryCopy", { invId: "i1", at: AT }), "the shop takes it off the shelf");
    nov(x(st, TP, "proposePrice", { oppId: a, amount: 26, at: AT }), D.REFUSE.copyUnavailable, "no figures");
    nov(x(st, TP, "acceptPrice", { oppId: a, at: AT }), D.REFUSE.copyUnavailable, "and nothing accepted");
  });

  test("a promised copy cannot then be marked Pending for the deal that lost it", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    const b = valued(st, B, "gB", "i1", 26);
    promised(st, A, a);
    nov(x(st, TP, "setCopyPending", { invId: "i1", oppId: b, at: AT }), D.REFUSE.copyCommitted,
      '"Pending for your deal" must never be said about a card already promised elsewhere');
    eq(status(st), "committed", "and a promise outranks a hold in what the card says");
  });

  test("releasing works on a sold copy, and on an archived one", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    x(st, TP, "setCopyPending", { invId: "i1", oppId: a, at: AT });
    completed(st, A, promised(st, A, a));
    okv(x(st, TP, "setCopyPending", { invId: "i1", oppId: null, at: AT }), "released after the sale");
    eq(st.get().inventory.find((i) => i.invId === "i1").pendingFor, null, "the note is gone");

    const st2 = world();
    const c = okv(x(st2, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 25, at: AT }), "open");
    x(st2, TP, "setCopyPending", { invId: "i1", oppId: c, at: AT });
    okv(x(st2, TP, "removeInventoryCopy", { invId: "i1", at: AT }), "archived");
    okv(x(st2, TP, "setCopyPending", { invId: "i1", oppId: null, at: AT }),
      "a partner can always take their own note off their own card");
  });

  test("anything that is not an id is a mistake, not a release", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    x(st, TP, "setCopyPending", { invId: "i1", oppId: a, at: AT });
    for (const bad of [123, {}, true, [], 0, ""]) {
      nov(x(st, TP, "setCopyPending", { invId: "i1", oppId: bad, at: AT }), D.REFUSE.notFound,
        `${JSON.stringify(bad)} is not an opportunity`);
      eq(st.get().inventory.find((i) => i.invId === "i1").pendingFor, a,
        `${JSON.stringify(bad)} silently released the card`);
    }
  });

  test("a deal on a card that is gone cannot consume the Collector's own copies", () => {
    const st = world();
    const a = valued(st, A, "gA", "i1", 27);
    const b = valued(st, B, "gB", "i1", 26);
    completed(st, A, promised(st, A, a));
    /* Jordan's deal reached `select-trade` before the card was sold. Submitting
       a package here would RESERVE their own cards to a deal that can never
       complete, and they could then neither withdraw them nor offer them
       elsewhere. */
    nov(x(st, B, "proposeTradeSelection", { oppId: b, binderIds: [], at: AT }),
      D.REFUSE.copyUnavailable, "the package is refused");
  });

  test("both seats' labels know the word", () => {
    const tp = require("../client/tp/present.js");
    const col = require("../client/collector/present.js");
    eq(tp.statusLabel("pending"), "Pending", "the shop's word");
    eq(col.statusLabel("pending"), "Pending for your deal", "and the Collector's");
  });

  test("[28] no generic lock field was introduced anywhere", () => {
    const fs = require("fs");
    const path = require("path");
    const root = path.join(__dirname, "..");
    for (const rel of ["domain/metyet-domain.js", "domain/metyet-commands.js", "domain/metyet-projection.js"]) {
      const src = fs.readFileSync(path.join(root, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      assert(!/\blocked\b\s*[:=]/.test(src), `${rel}: no generic locked flag`);
      assert(!/\bheldBy\b|\breservedBy\b/.test(src), `${rel}: and no owner stamped on a copy`);
    }
    const st = world();
    promised(st, A, valued(st, A, "gA", "i1", 27));
    const copy = st.get().inventory.find((i) => i.invId === "i1");
    assert(!("committed" in copy) && !("locked" in copy) && !("status" in copy),
      "commitment is still derived, never written to the card");
  });
});

/* ================================= H. what the first adversarial pass missed */
describe("H. The boundary is only moved where every holder of it moved", () => {
  /* Each of these was found after the implementation looked finished and the
     whole suite was green. They are kept apart from A–G because none of them
     discharges a numbered invariant: they are the places the brief's "four
     coordinated edits" did not name, and the guards that were put on the wrong
     side of a decision. */

  test("a stored world accepts two agreed VALUES on one copy", () => {
    /* The batch's headline story, taken all the way to persistence.
       validateWorld held the old `agreedPrice != null` predicate, so the domain
       permitted this and the validator rejected it — and because
       command-transaction runs validateWorld on every result and RAISES rather
       than refusing, the second acceptPrice was a fault, not a refusal. */
    const { validateWorld } = require("../domain/metyet-world.js");
    const st = world();
    valued(st, A, "gA", "i1", 26);
    valued(st, B, "gB", "i1", 27);
    eq(status(st), "available", "the domain says both may pursue it");
    const check = validateWorld(st.get());
    assert(check.ok, "and a world holding both is storable: "
      + JSON.stringify(check.errors || []));
  });

  test("but a world holding two PROMISES on one copy is still rejected", () => {
    /* The other half — the fix above must not have bought storability by
       dropping the guarantee. Hand-built, because the command layer refuses to
       produce this state at all. */
    const { validateWorld } = require("../domain/metyet-world.js");
    const st = world();
    /* B opens FIRST — once the copy is promised, B cannot even start, which is
       the command layer doing its job and is not what this test is about. */
    const b = valued(st, B, "gB", "i1", 27);
    promised(st, A, valued(st, A, "gA", "i1", 26));
    const state = st.get();
    const loser = state.opportunities.find((o) => o.id === b);
    loser.deal = { tpAgreed: true, collectorAgreed: true };
    loser.stage = "fulfillment";
    const check = validateWorld(state);
    assert(!check.ok, "two promises on one copy is not a storable world");
    eq((check.errors || []).map((e) => e.code).join(),
      "invariant.copy-committed-once", "and it fails for the right reason");
  });

  test("pendingFor is shape-checked, without being freshness-checked", () => {
    const { validateWorld } = require("../domain/metyet-world.js");
    const bad = world({ inventory: [
      { invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 30, grade: "PSA 9", pendingFor: 42 }] });
    assert(!validateWorld(bad.get()).ok, "a non-id pendingFor is not storable");
    /* A STALE one is a different thing and must stay legal — deriving Available
       from it with no sweep is the design, not a defect to validate away. */
    const stale = world({ inventory: [
      { invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 30, grade: "PSA 9", pendingFor: "o-long-gone" }] });
    assert(validateWorld(stale.get()).ok, "but a stale one is perfectly storable");
    eq(D.inventoryCopyStatus("i1", stale.get().opportunities, stale.get().inventory),
      "available", "and derives Available with nothing swept");
  });

  test("the final cash figure cannot be proposed on a card already promised away", () => {
    /* proposeFinalBalance was left out of the guarded set. The TP must take the
       deal turn first, which is what makes it reachable: Jordan could sign a
       number for Casey's card and learn nothing until the very last click. */
    const st = world();
    const b = valued(st, B, "gB", "i1", 27);
    okv(x(st, B, "proposeTradeSelection", { oppId: b, binderIds: [], at: AT }), "B assembles");
    okv(x(st, TP, "acceptDeal", { oppId: b, at: AT }), "the partner says yes to B");
    promised(st, A, valued(st, A, "gA", "i1", 26));
    eq(status(st), "committed", "the copy is Casey's now");
    nov(x(st, B, "proposeFinalBalance", { oppId: b, amount: 25, at: AT }),
      D.REFUSE.copyUnavailable, "so no final figure may be put on it");
    const o = st.get().opportunities.find((z) => z.id === b);
    eq(((o.deal || {}).adjThread || []).length, 0, "and nothing was written to the thread");
  });

  test("a partner may still REJECT a trade card in a deal that has lost the copy", () => {
    /* Rejecting releases the collector's copy — the same shape as
       withdrawTradeCard, which is deliberately unguarded. Guarding before the
       verdict was read shut the partner out of closing down a dead deal. */
    const st = world({ collectorCopies: [
      { id: "kA1", collectorId: "casey", canonicalCardId: "cc-y", grade: "PSA 8", offered: true, photos: PH },
      { id: "kB1", collectorId: "jordan", canonicalCardId: "cc-y", grade: "PSA 8", offered: true, photos: PH }] });
    const a = valued(st, A, "gA", "i1", 26);
    const b = valued(st, B, "gB", "i1", 27);
    okv(x(st, B, "proposeTradeSelection", { oppId: b, binderIds: ["kB1"], at: AT }), "B offers a card");
    const row = st.get().opportunities.find((z) => z.id === b).trade.cards[0];
    okv(x(st, TP, "setCopyPending", { invId: "i1", oppId: a, at: AT }), "the partner pends it for Casey");
    okv(x(st, TP, "reviewTradeCard", { oppId: b, tradeCardId: row.id, decision: "reject", at: AT }),
      "the partner may still hand Jordan's card back");
    assert(!D.TRADE.liveTradeRows(st.get().opportunities.find((z) => z.id === b))
      .some((c) => c.id === row.id && c.inclusion === "proposed"),
      "and the row is genuinely released, not merely un-refused");
    eq(D.collectorCopyStatus("kB1", st.get().opportunities), "available",
      "so Jordan's own card is his again");
  });

  test("an archived copy is not Pending for anybody", () => {
    /* A copy pended before any price is settled is still archivable, so the
       derived status and the command layer disagreed outright: both seats were
       shown "Pending" for a copy every command answers copy-unavailable about. */
    const st = world();
    const a = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }), "open");
    okv(x(st, TP, "setCopyPending", { invId: "i1", oppId: a, at: AT }), "pend it");
    okv(x(st, TP, "removeInventoryCopy", { invId: "i1", at: AT }), "and then archive it");
    eq(status(st), "available", "the pend no longer speaks for it");
    eq((copyRow(st, A) || {}).status, "unavailable",
      "and Casey is told what the commands will actually say");
    nov(x(st, A, "proposePrice", { oppId: a, amount: 25, at: AT }),
      D.REFUSE.copyUnavailable, "which is this");
  });
});

if (require.main === module) run();
module.exports = {};
