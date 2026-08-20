/* ============================================================================
   TWO COMMITMENTS, AT TWO DIFFERENT MOMENTS

   Reviewing a card is not buying it. Several collectors may look at the same
   physical copy at once, ask the partner to photograph it, and chat about it —
   none of that reserves anything, and the photographs benefit whoever comes
   next. That is the point of Review Card.

   Commitment then arrives twice, asymmetrically:

     COLLECTOR  at their first submitted offer, per GOAL.
                They have decided which card they are buying.

     PARTNER    when the price is settled, per PHYSICAL COPY.
                They have told one collector what this card costs, and cannot
                honestly tell another the same thing about the same card.

   Between those two moments several collectors may have live offers on one
   copy, which is deliberate: an offer is a question, and a partner is allowed
   to have more than one on the table.

   Both boundaries are enforced in the domain, because both personas can reach
   them and neither app may be the thing that decides.
   ========================================================================= */

const { describe, test, assert, eq } = require("./run.cjs");
const D = require("../domain/metyet-domain.js");
const { createStore } = require("../domain/metyet-store.js");
const { collectorView } = require("../domain/collector-view.js");

const readSrc = (rel) => require("fs").readFileSync(require("path").join(__dirname, "..", rel), "utf8");
const AT = "2026-08-19";

const CHAR = { id: "k1", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };
const BLAST = { id: "k2", name: "Blastoise", set: "Base Set", number: "2", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };

/* Northline holds two different copies; Complete holds a third of the same
   card, so "same card" and "same copy" can be told apart. */
const world = () => createStore({
  catalog: [CHAR, BLAST],
  collectors: [{ id: "casey", name: "Casey", prefs: [] }, { id: "jordan", name: "Jordan", prefs: [] },
    { id: "taylor", name: "Taylor", prefs: [] }],
  partners: [{ id: "nl", name: "Northline Cards" }, { id: "cc", name: "Complete Collectibles" }],
  goals: [], binder: [], interests: [], conversations: [], opportunities: [],
  preferences: [], photoRequests: [], copyReviews: [],
  inventory: [
    { invId: "inv-1", partnerId: "nl", cardId: "k1", ask: 4200, archived: false,
      photos: { front: null, back: null } },
    { invId: "inv-2", partnerId: "cc", cardId: "k1", ask: 4300, archived: false,
      photos: { front: null, back: null } },
    { invId: "inv-3", partnerId: "nl", cardId: "k2", ask: 900, archived: false,
      photos: { front: null, back: null } },
  ],
});
const goalFor = (st, who, cardId) =>
  st.actions.addGoal({ collectorId: who, cardId, tier: "primary", at: AT });
const offer = (st, { goalId, who, partnerId, invId, cardId, amount }) =>
  st.actions.startOpportunity({ goalId, collectorId: who, partnerId, cardId,
    invId, listedPrice: 4200, amount: amount || 3700, at: AT });
const committed = (st, invId) => D.INVARIANTS.copyCommittedTo(invId, st.get().opportunities);

describe("A. Reviewing reserves nothing", () => {
  test("several collectors may review the same physical copy", () => {
    const st = world();
    ["casey", "jordan", "taylor"].forEach((who) => {
      const id = st.actions.reviewCopy({ collectorId: who, partnerId: "nl", invId: "inv-1", at: AT });
      assert(typeof id === "string", who + " may review it");
    });
    eq(st.get().copyReviews.length, 3, "three reviews of one copy");
    eq(st.get().opportunities.length, 0, "and not one deal between them");
    eq(committed(st, "inv-1"), null, "the copy is not committed to anybody");
  });

  test("reviewing creates no opportunity and no exclusivity", () => {
    const st = world();
    const g = goalFor(st, "casey", "k1");
    st.actions.reviewCopy({ collectorId: "casey", partnerId: "nl", invId: "inv-1", at: AT });
    eq(st.get().opportunities.length, 0, "no opportunity");
    eq(D.goalState(g, st.get().opportunities), "seeking", "the goal is still merely sought");
    /* And another collector is entirely unaffected. */
    const gj = goalFor(st, "jordan", "k1");
    assert(typeof offer(st, { goalId: gj, who: "jordan", partnerId: "nl",
      invId: "inv-1", cardId: "k1" }) === "string",
      "Jordan may still go all the way to an offer on the copy Casey is reviewing");
  });

  test("asking for photos reserves nothing either", () => {
    const st = world();
    st.actions.requestPhotos({ collectorId: "casey", partnerId: "nl", invId: "inv-1", at: AT });
    eq(committed(st, "inv-1"), null, "a request is not a claim");
    eq(st.get().opportunities.length, 0, "and creates no deal");
  });

  test("photographing reserves nothing, and everyone benefits", () => {
    const st = world();
    st.actions.reviewCopy({ collectorId: "casey", partnerId: "nl", invId: "inv-1", at: AT });
    st.actions.reviewCopy({ collectorId: "jordan", partnerId: "nl", invId: "inv-1", at: AT });
    st.actions.requestPhotos({ collectorId: "casey", partnerId: "nl", invId: "inv-1", at: AT });

    eq(st.actions.addCopyPhotos({ invId: "inv-1", front: "f", at: AT }), false,
      "one face is still not the card");
    eq(st.actions.addCopyPhotos({ invId: "inv-1", back: "b", at: AT }), true, "two faces are");

    /* Jordan never asked, and does not need to. */
    const jordan = collectorView(st.get(), "jordan");
    const copy = st.get().inventory.find((i) => i.invId === "inv-1");
    eq(jordan.photoState(copy), "ready", "Jordan sees the actual card immediately");
    eq(jordan.photoRequestFor("inv-1"), null, "with nothing left to ask for");
    eq(committed(st, "inv-1"), null, "and the copy is still free");
  });

  test("starting a review carries no exclusivity warning", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    assert(!/only have one deal|beginning a deal with this/i.test(src),
      "no deal-exclusion language attaches to reviewing");
    const store = readSrc("domain/metyet-store.js");
    const fn = store.slice(store.indexOf("reviewCopy({"), store.indexOf("endReview("));
    assert(!/opportunit/i.test(fn), "and reviewCopy creates no opportunity");
    assert(!/committed|reserve/i.test(fn), "nor any reservation");
  });
});

describe("B. The collector commits by offering, per goal", () => {
  test("the first offer creates the deal", () => {
    const st = world();
    const g = goalFor(st, "casey", "k1");
    const oid = offer(st, { goalId: g, who: "casey", partnerId: "nl", invId: "inv-1", cardId: "k1" });
    assert(typeof oid === "string", "an opportunity was created");
    eq(st.get().opportunities.length, 1, "exactly one");
    eq(D.activeOppForGoal(g, st.get().opportunities).stage, "agree-price", "at Agree on Price");
  });

  test("a second offer for the SAME goal is refused", () => {
    const st = world();
    const g = goalFor(st, "casey", "k1");
    offer(st, { goalId: g, who: "casey", partnerId: "nl", invId: "inv-1", cardId: "k1" });
    const second = offer(st, { goalId: g, who: "casey", partnerId: "cc",
      invId: "inv-2", cardId: "k1", amount: 3900 });
    eq(second.refused, D.REFUSE.alreadyNegotiating,
      "even against a different partner's copy of the same card");
  });

  test("but another goal is entirely unaffected", () => {
    const st = world();
    const g1 = goalFor(st, "casey", "k1");
    const g2 = goalFor(st, "casey", "k2");
    offer(st, { goalId: g1, who: "casey", partnerId: "nl", invId: "inv-1", cardId: "k1" });
    const other = offer(st, { goalId: g2, who: "casey", partnerId: "nl",
      invId: "inv-3", cardId: "k2", amount: 800 });
    assert(typeof other === "string", "the exclusion is per goal, not per collector");
    eq(st.get().opportunities.length, 2, "two live deals, on two different goals");
  });

  test("the rule lives in the domain, not the interface", () => {
    const store = readSrc("domain/metyet-store.js");
    const guard = store.slice(store.indexOf("startOpportunity({"), store.indexOf("const id = \"o\""));
    assert(/oneNegotiationPerGoal/.test(guard), "startOpportunity itself checks it");
    assert(/REFUSE\.alreadyNegotiating/.test(guard), "and refuses with a reason");
  });
});

describe("C. The partner commits by settling a price, per copy", () => {
  test("an offer alone does not commit the copy", () => {
    const st = world();
    const g = goalFor(st, "casey", "k1");
    offer(st, { goalId: g, who: "casey", partnerId: "nl", invId: "inv-1", cardId: "k1" });
    eq(committed(st, "inv-1"), null,
      "a question has been asked; nothing has been promised");
  });

  test("two collectors may have live offers on one copy", () => {
    const st = world();
    const gc = goalFor(st, "casey", "k1");
    const gj = goalFor(st, "jordan", "k1");
    const a = offer(st, { goalId: gc, who: "casey", partnerId: "nl", invId: "inv-1", cardId: "k1" });
    const b = offer(st, { goalId: gj, who: "jordan", partnerId: "nl",
      invId: "inv-1", cardId: "k1", amount: 3800 });
    assert(typeof a === "string" && typeof b === "string", "both offers stand");
    eq(st.get().opportunities.filter((o) => o.invId === "inv-1" && D.isActive(o)).length, 2,
      "the partner has two on the table");
    eq(committed(st, "inv-1"), null, "and has committed to neither");
  });

  test("settling the price commits the copy to that deal", () => {
    const st = world();
    const g = goalFor(st, "casey", "k1");
    const oid = offer(st, { goalId: g, who: "casey", partnerId: "nl", invId: "inv-1", cardId: "k1" });
    eq(st.actions.agreePrice({ oppId: oid, amount: 3700, by: "tp", at: AT }), oid, "price settled");
    const c = committed(st, "inv-1");
    assert(c, "the copy is now committed");
    eq(c.id, oid, "to that deal");
    eq(st.get().opportunities.find((o) => o.id === oid).agreedPrice, 3700,
      "using the existing agreed-price marker, not a new field");
  });

  test("a competing deal can no longer settle the same copy", () => {
    const st = world();
    const gc = goalFor(st, "casey", "k1");
    const gj = goalFor(st, "jordan", "k1");
    const a = offer(st, { goalId: gc, who: "casey", partnerId: "nl", invId: "inv-1", cardId: "k1" });
    const b = offer(st, { goalId: gj, who: "jordan", partnerId: "nl",
      invId: "inv-1", cardId: "k1", amount: 3800 });
    st.actions.agreePrice({ oppId: a, amount: 3700, by: "tp", at: AT });

    const blocked = st.actions.agreePrice({ oppId: b, amount: 3800, by: "tp", at: AT });
    eq(blocked.refused, D.REFUSE.copyCommitted, "the second settlement is refused");
    eq(st.get().opportunities.find((o) => o.id === b).agreedPrice, null,
      "and nothing was written to it");
  });

  test("a blocked collector learns nothing about the other one", () => {
    const st = world();
    const gc = goalFor(st, "casey", "k1");
    const gj = goalFor(st, "jordan", "k1");
    const a = offer(st, { goalId: gc, who: "casey", partnerId: "nl", invId: "inv-1", cardId: "k1" });
    const b = offer(st, { goalId: gj, who: "jordan", partnerId: "nl",
      invId: "inv-1", cardId: "k1", amount: 3800 });
    st.actions.agreePrice({ oppId: a, amount: 3700, by: "tp", at: AT });

    const refusal = JSON.stringify(st.actions.agreePrice({ oppId: b, amount: 3800, by: "tp", at: AT }));
    assert(!/casey/i.test(refusal), "no collector identity");
    assert(!/3700/.test(refusal), "and no competing amount");
    eq(JSON.parse(refusal).refused, "copy-committed", "only that the copy is spoken for");
  });

  test("Jordan's own history survives being blocked", () => {
    const st = world();
    const gc = goalFor(st, "casey", "k1");
    const gj = goalFor(st, "jordan", "k1");
    const a = offer(st, { goalId: gc, who: "casey", partnerId: "nl", invId: "inv-1", cardId: "k1" });
    const b = offer(st, { goalId: gj, who: "jordan", partnerId: "nl",
      invId: "inv-1", cardId: "k1", amount: 3800 });
    st.actions.sendMessage({ collectorId: "jordan", partnerId: "nl", cardId: "k1",
      by: "collector", text: "still interested", at: AT });
    st.actions.agreePrice({ oppId: a, amount: 3700, by: "tp", at: AT });
    st.actions.agreePrice({ oppId: b, amount: 3800, by: "tp", at: AT });

    const t = D.findThread(st.get().conversations, "jordan", "nl", CHAR);
    assert(t && t.entries.some((e) => e.text === "still interested"),
      "the conversation is untouched");
    assert(st.get().opportunities.find((o) => o.id === b), "and the negotiation record remains");
  });

  test("new offers on a committed copy are refused", () => {
    const st = world();
    const gc = goalFor(st, "casey", "k1");
    const a = offer(st, { goalId: gc, who: "casey", partnerId: "nl", invId: "inv-1", cardId: "k1" });
    st.actions.agreePrice({ oppId: a, amount: 3700, by: "tp", at: AT });

    const gt = goalFor(st, "taylor", "k1");
    const late = offer(st, { goalId: gt, who: "taylor", partnerId: "nl",
      invId: "inv-1", cardId: "k1", amount: 4000 });
    eq(late.refused, D.REFUSE.copyCommitted, "the copy is spoken for");
  });

  test("commitment is per copy — the partner may commit others freely", () => {
    const st = world();
    const gc = goalFor(st, "casey", "k1");
    const a = offer(st, { goalId: gc, who: "casey", partnerId: "nl", invId: "inv-1", cardId: "k1" });
    st.actions.agreePrice({ oppId: a, amount: 3700, by: "tp", at: AT });

    /* Same partner, different physical copy. */
    const gj = goalFor(st, "jordan", "k2");
    const b = offer(st, { goalId: gj, who: "jordan", partnerId: "nl",
      invId: "inv-3", cardId: "k2", amount: 800 });
    assert(typeof b === "string", "a different copy is unaffected");
    eq(st.actions.agreePrice({ oppId: b, amount: 800, by: "tp", at: AT }), b,
      "and may be committed at the same time");
    assert(committed(st, "inv-1") && committed(st, "inv-3"), "both copies are committed");
    assert(committed(st, "inv-1").id !== committed(st, "inv-3").id, "to different deals");
  });

  test("the lock is enforced in the domain, reachable by either persona", () => {
    const store = readSrc("domain/metyet-store.js");
    const fn = store.slice(store.indexOf("agreePrice({"), store.indexOf("REVIEWING A SPECIFIC COPY"));
    assert(/copyCommittedTo\(o\.invId/.test(fn), "it checks the copy, not the goal");
    assert(/REFUSE\.copyCommitted/.test(fn), "and refuses");
    /* The collector app routes its accept through it rather than patching. */
    const ui = readSrc("collector/MetYetCollector.jsx");
    assert(/A\.agreePrice\(\{ oppId: id/.test(ui),
      "the collector's accept uses the canonical action");
  });
});

describe("D. Release, and what does not release", () => {
  test("ending the deal frees the copy", () => {
    const st = world();
    const gc = goalFor(st, "casey", "k1");
    const a = offer(st, { goalId: gc, who: "casey", partnerId: "nl", invId: "inv-1", cardId: "k1" });
    st.actions.agreePrice({ oppId: a, amount: 3700, by: "tp", at: AT });
    assert(committed(st, "inv-1"), "committed");

    st.actions.endOpportunity(a, "collector", AT);
    eq(committed(st, "inv-1"), null, "an ended deal holds nothing");
  });

  test("a waiting collector can then proceed", () => {
    const st = world();
    const gc = goalFor(st, "casey", "k1");
    const gj = goalFor(st, "jordan", "k1");
    const a = offer(st, { goalId: gc, who: "casey", partnerId: "nl", invId: "inv-1", cardId: "k1" });
    const b = offer(st, { goalId: gj, who: "jordan", partnerId: "nl",
      invId: "inv-1", cardId: "k1", amount: 3800 });
    st.actions.agreePrice({ oppId: a, amount: 3700, by: "tp", at: AT });
    eq(st.actions.agreePrice({ oppId: b, amount: 3800, by: "tp", at: AT }).refused,
      D.REFUSE.copyCommitted, "blocked while Casey holds it");

    st.actions.endOpportunity(a, "collector", AT);
    eq(st.actions.agreePrice({ oppId: b, amount: 3800, by: "tp", at: AT }), b,
      "and free once Casey lets go");
  });

  test("a completed deal does not hand the card back", () => {
    const st = world();
    const gc = goalFor(st, "casey", "k1");
    const a = offer(st, { goalId: gc, who: "casey", partnerId: "nl", invId: "inv-1", cardId: "k1" });
    st.actions.agreePrice({ oppId: a, amount: 3700, by: "tp", at: AT });
    st.actions.patchOpportunity(a, (o) => ({ ...o, stage: "completed", completedAt: AT }));
    /* The deal is no longer active, so the commitment lapses — but the physical
       card has gone, and inventory is what says so. */
    st.actions.removeInventoryCopy("inv-1");
    const gt = goalFor(st, "taylor", "k1");
    eq(offer(st, { goalId: gt, who: "taylor", partnerId: "nl",
      invId: "inv-1", cardId: "k1", amount: 4000 }).refused, D.REFUSE.copyUnavailable,
      "a sold card is unavailable, not merely uncommitted");
  });
});

describe("E. Nothing else moved", () => {
  test("the pursuit and receipt models are unchanged", () => {
    eq(D.PURSUIT_STEPS.length, 6, "six visible pursuit steps");
    eq(D.RECEIPT_STAGES.length, 5, "five negotiation stages");
    assert(!D.STAGES.some((x) => x.id === "review-card"), "review-card is still not a stage");
  });

  test("settling the price still advances to Select Trade with a package", () => {
    const st = world();
    const g = goalFor(st, "casey", "k1");
    const oid = offer(st, { goalId: g, who: "casey", partnerId: "nl", invId: "inv-1", cardId: "k1" });
    st.actions.agreePrice({ oppId: oid, amount: 3700, by: "tp", at: AT });
    const o = st.get().opportunities.find((x) => x.id === oid);
    eq(o.stage, "select-trade", "the next stage");
    assert(o.trade && Array.isArray(o.trade.cards), "with a package to work in");
    eq(D.lastEntry(o.priceThread).type, "accept", "and the acceptance recorded in the thread");
  });

  test("copy photos remain copy-specific through all of it", () => {
    const st = world();
    const g = goalFor(st, "casey", "k1");
    const oid = offer(st, { goalId: g, who: "casey", partnerId: "nl", invId: "inv-1", cardId: "k1" });
    st.actions.addCopyPhotos({ invId: "inv-1", front: "f", back: "b", at: AT });
    st.actions.agreePrice({ oppId: oid, amount: 3700, by: "tp", at: AT });
    eq(D.INVARIANTS.copyPhotographed(st.get().inventory
      .find((i) => i.invId === "inv-2").photos), false,
      "another partner's copy of the same card is untouched");
  });

  test("a later photo upload does not disturb a running negotiation", () => {
    const st = world();
    const g = goalFor(st, "casey", "k1");
    const oid = offer(st, { goalId: g, who: "casey", partnerId: "nl", invId: "inv-1", cardId: "k1" });
    st.actions.requestPhotos({ collectorId: "casey", partnerId: "nl", invId: "inv-1", at: AT });
    st.actions.agreePrice({ oppId: oid, amount: 3700, by: "tp", at: AT });
    const before = st.get().opportunities.find((x) => x.id === oid).stage;
    st.actions.addCopyPhotos({ invId: "inv-1", front: "f", back: "b", at: AT });
    const after = st.get().opportunities.find((x) => x.id === oid);
    eq(after.stage, before, "the stage did not reset");
    eq(after.agreedPrice, 3700, "nor the settled price");
    eq(st.get().photoRequests.filter((r) => !r.fulfilledAt).length, 0, "and the ask resolved");
  });
});

require("./run.cjs").run();
