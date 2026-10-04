/* ============================================================================
   QUALIFICATION — PARTICIPANT-AWARE VISIBILITY, INSPECT, REQUEST PHOTOS

   Deal Flow could already say "this exact copy, at this shop, is the card you
   asked for" and could do nothing with the answer. This batch is what a
   Collector may then do about it, and the whole of it is two verbs:

     Inspect         look properly at THIS physical copy
     Request photos  ask to be shown it before deciding anything

   Neither settles a value, reserves the card, tells the shop anything about
   intent, or begins a deal. Several Collectors may inspect one copy at the same
   moment and none of them is ahead of the others.

   THE RULE THE BATCH EXISTS FOR:

     PENDING CLOSES THE DOOR; IT DOES NOT THROW OUT THE PEOPLE ALREADY IN THE
     ROOM.

   Both halves of that were wrong before, in opposite directions, and Section A
   is the proof of each. `reviewCopy` and `requestPhotos` refused only a SOLD
   copy, so a copy pending for — or already promised to — somebody else's deal
   accepted a total stranger to it; and because sold refused while committed did
   not, the difference between the two answers reported the exact moment a
   rival's deal completed. Meanwhile the projection dropped the copy the instant
   it stopped being available, so a Collector who was legitimately mid-inspection
   lost the card off their screen and kept a review row pointing at nothing.

   NOTHING DURABLE WAS ADDED. Both answers are derived from rows that have
   existed since the beginning: `inventoryCopyStatus` (the Option B authority,
   unchanged) decides whether the door is open, and the Collector's own open
   `copyReviews` / `photoRequests` decide whether they are already inside. There
   is no `participant` field, no `authorizedViewer`, no stored access list, and
   no migration — Section E is the proof.
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const React = require("react");
const TR = require("react-test-renderer");
const esbuild = require("esbuild");
const D = require("../domain/metyet-domain.js");
const P = require("../domain/metyet-projection.js");
const { createStore } = require("./fixture-store.cjs");
const RT = require("../domain/metyet-runtime.js");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");

const ROOT = path.join(__dirname, "..");
/* SOURCE PINS READ CODE, NOT THE PROSE ABOUT IT. These files explain at length
   what they deliberately do NOT do, so a bare substring search finds "Market
   Value" in a sentence promising there isn't one. Comments come out first. */
const codeOf = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const AT = "2026-09-29";
let seq = 0;
const runtime = () => RT.createRuntime({ now: () => AT, newId: (p = "") => `${p}${++seq}` });

const TP = { partnerId: "nl" };
const OTHER_TP = { partnerId: "sv" };
const CASEY = { collectorId: "casey" };     // our Collector
const JORDAN = { collectorId: "jordan" };   // a rival at the same shop
const RILEY = { collectorId: "riley" };     // a stranger to that shop

/* One shop, one card, two copies; a Collector, a rival and a stranger. */
const world = (over = {}) => {
  seq = 0;
  return createStore({
    partners: [{ id: "nl", name: "Northline", tradeRate: 0.7 },
      { id: "sv", name: "Silver Vale", tradeRate: 0.7 }],
    collectors: [{ id: "casey", name: "Casey" }, { id: "jordan", name: "Jordan" },
      { id: "riley", name: "Riley" }],
    relationships: [
      { partnerId: "nl", collectorId: "casey", status: "accepted", at: AT },
      { partnerId: "nl", collectorId: "jordan", status: "accepted", at: AT },
      { partnerId: "sv", collectorId: "riley", status: "accepted", at: AT }],
    goals: [
      { id: "gC", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } },
      { id: "gJ", collectorId: "jordan", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } },
      { id: "gR", collectorId: "riley", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } }],
    inventory: [
      { invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 30, grade: "PSA 9",
        cert: "C1", photos: { front: null, back: null } },
      { invId: "i2", partnerId: "nl", canonicalCardId: "cc-x", ask: 32, grade: "PSA 9",
        cert: "C2", photos: { front: "f.jpg", back: "b.jpg" } }],
    collectorCopies: [], binders: [], binderEntries: [], opportunities: [], catalog: [],
    copyReviews: [], photoRequests: [], conversations: [], interests: [],
    ...over,
  }, runtime());
};

const x = (st, actor, cmd, payload) => st.execute(actor, cmd, payload || {});
const code = (r) => (r && r.ok !== false ? "OK" : r.refused);
const okv = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
const view = (st, actor) => P.projectForActor(st.get(), actor);
const copyRow = (st, actor, invId = "i1") =>
  (view(st, actor).inventory || []).find((i) => i.invId === invId) || null;
const statusOf = (st, invId = "i1") =>
  D.inventoryCopyStatus(invId, st.get().opportunities, st.get().inventory);

/* JORDAN is the rival whose deal takes the copy away. */
const valued = (st, invId = "i1") => {
  const id = okv(x(st, JORDAN, "startOpportunity",
    { goalId: "gJ", invId, amount: 26, at: AT }), "open");
  okv(x(st, TP, "acceptPrice", { oppId: id, at: AT }), "value agreed");
  return id;
};
const promised = (st, oppId) => {
  okv(x(st, JORDAN, "proposeTradeSelection", { oppId, binderIds: [], at: AT }), "package");
  okv(x(st, TP, "acceptDeal", { oppId, at: AT }), "partner yes");
  okv(x(st, JORDAN, "acceptDeal", { oppId, at: AT }), "collector yes");
  return oppId;
};
const finished = (st, oppId) => {
  okv(x(st, TP, "proposeFulfillment",
    { oppId, plan: { method: "show", show: "Leeds", date: "2026-10-04" }, at: AT }), "plan");
  okv(x(st, JORDAN, "confirmFulfillmentPlan", { oppId, at: AT }), "plan ok");
  okv(x(st, TP, "confirmHandoff", { oppId, at: AT }), "handed over");
  okv(x(st, JORDAN, "confirmHandoff", { oppId, at: AT }), "received");
  return oppId;
};
const CLOSE = {
  available: () => null,
  pending: (st) => {
    const a = okv(x(st, JORDAN, "startOpportunity",
      { goalId: "gJ", invId: "i1", amount: 26, at: AT }), "open");
    okv(x(st, TP, "setCopyPending", { invId: "i1", oppId: a, at: AT }), "pend");
    return a;
  },
  committed: (st) => promised(st, valued(st)),
  sold: (st) => finished(st, promised(st, valued(st))),
};
const CLOSED = ["pending", "committed", "sold"];

/* ================================================= A. the rule itself */
describe("A. Pending closes the door; it does not throw out the people in the room", () => {
  test("[1] a new entrant is refused on every closed copy", () => {
    for (const name of CLOSED) {
      const st = world(); CLOSE[name](st);
      eq(code(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT })), D.REFUSE.copyUnavailable,
        `${name}: a stranger to the deal began inspecting`);
      const st2 = world(); CLOSE[name](st2);
      eq(code(x(st2, CASEY, "requestPhotos", { invId: "i1", at: AT })), D.REFUSE.copyUnavailable,
        `${name}: a stranger to the deal asked for photographs`);
    }
  });

  test("[2] and every closed copy gives the SAME answer, which is the privacy of it", () => {
    /* The refusal must not be usable to tell pending from promised from gone.
       Before this batch sold refused while committed did not, and that single
       difference reported the moment a rival's deal completed. */
    const seen = {};
    for (const name of CLOSED) {
      const st = world(); CLOSE[name](st);
      seen[name] = code(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }));
    }
    eq(seen.pending, seen.committed, "pending is distinguishable from committed");
    eq(seen.committed, seen.sold, "committed is distinguishable from sold");
  });

  test("[3] an open copy is open to anybody who knows the shop", () => {
    const st = world();
    eq(code(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT })), "OK", "Casey may look");
    eq(code(x(st, JORDAN, "reviewCopy", { invId: "i1", at: AT })), "OK", "and so may Jordan");
    eq(statusOf(st), "available", "and looking changed nothing about the copy");
  });

  test("[4] somebody already inspecting keeps the copy on their screen", () => {
    for (const name of CLOSED) {
      const st = world();
      okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "Casey looks first");
      CLOSE[name](st);
      const row = copyRow(st, CASEY);
      assert(row, `${name}: the copy vanished from under an open review`);
      eq(row.status, "unavailable", `${name}: and it says only that it is unavailable`);
    }
  });

  test("[5] what they are shown is 'unavailable' and never which, or whose", () => {
    for (const name of CLOSED) {
      const st = world();
      okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "look");
      CLOSE[name](st);
      const v = view(st, CASEY);
      const blob = JSON.stringify(v);
      for (const leak of ["jordan", "pendingFor", "agreedPrice", "finalAgreement"]) {
        assert(!blob.includes(leak), `${name}: the projection carried ${leak}`);
      }
      eq(v.opportunities.length, 0, `${name}: a rival's deal reached Casey`);
      for (const word of ["pending", "committed", "sold"]) {
        assert(copyRow(st, CASEY).status !== word,
          `${name}: the copy told Casey it was ${word}`);
      }
    }
  });

  test("[6] an open photo request keeps it too, and the evidence arrives", () => {
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "Casey asks");
    promised(st, valued(st));
    eq(statusOf(st), "committed", "the rival's deal took the copy");
    /* The partner may still answer an outstanding request: filling an EMPTY
       slot is evidence arriving, which the mutation guard has always allowed. */
    eq(code(x(st, TP, "addCopyPhotos", { invId: "i1", front: "f.jpg", back: "b.jpg", at: AT })), "OK",
      "the shop could not answer a request it had already accepted");
    const row = copyRow(st, CASEY);
    assert(row, "the evidence arrived into a hole");
    eq(row.photos.front, "f.jpg", "and Casey cannot see what she asked for");
    const req = (view(st, CASEY).photoRequests || []).find((r) => r.invId === "i1");
    assert(req && req.fulfilledAt, "her request still reads outstanding");
  });

  test("[7] ending qualification gives up the access it bought", () => {
    const st = world();
    const rv = okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "look");
    promised(st, valued(st));
    assert(copyRow(st, CASEY), "the copy should be visible while inspecting");
    okv(x(st, CASEY, "endReview", { reviewId: rv, at: AT }), "done");
    eq(copyRow(st, CASEY), null,
      "the copy stayed visible after the inspection it depended on had ended");
  });

  test("[8] and it does not survive the relationship ending", () => {
    /* An ended relationship takes a shop's whole supply off the screen. A review
       left open across that ending must not be a keyhole back into it — an
       adversarial run caught exactly this. */
    const st = world();
    okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "look");
    const s = st.get();
    const ended = { ...s, relationships: s.relationships.map((r) => (r.collectorId === "casey"
      ? { ...r, status: "ended" } : r)) };
    const v = P.projectForActor(ended, CASEY);
    assert(!v.inventory.some((i) => i.invId === "i1"),
      "an ex-partner's copy came back through an open review");
    eq(v.copyReviews.length, 1, "and the Collector's own record of it was destroyed");
  });

  test("[9] the collector whose own deal closed the copy is not locked out", () => {
    for (const name of ["pending", "committed"]) {
      const st = world(); CLOSE[name](st);
      eq(code(x(st, JORDAN, "requestPhotos", { invId: "i1", at: AT })), "OK",
        `${name}: the holder was refused their own card`);
    }
    const st = world(); CLOSE.sold(st);
    eq(code(x(st, JORDAN, "requestPhotos", { invId: "i1", at: AT })), D.REFUSE.copyUnavailable,
      "sold: not even the buyer, because the card is gone");
  });

  test("[10] a rival whose own deal already LOST the copy is not a holder", () => {
    /* An adversarial run put this here. A losing negotiation is not terminal, so
       asking merely for an ACTIVE deal of one's own let the loser back through
       the door of a card that had been sold out from under them. */
    const st = world();
    okv(x(st, CASEY, "startOpportunity", { goalId: "gC", invId: "i1", amount: 25, at: AT }), "Casey too");
    finished(st, promised(st, valued(st)));
    eq(statusOf(st), "sold", "Jordan's deal completed");
    eq(code(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT })), D.REFUSE.copyUnavailable,
      "the loser was let back in on a card that is gone");
  });
});

/* ===================================================== B. what a stranger sees */
describe("B. A stranger to the shop", () => {
  test("[11] is told about the shop, never about the copy", () => {
    for (const name of ["available", ...CLOSED]) {
      const st = world(); CLOSE[name](st);
      eq(code(x(st, RILEY, "reviewCopy", { invId: "i1", at: AT })), D.REFUSE.noRelationship,
        `${name}: a stranger read a copy's state out of an id`);
      eq(code(x(st, RILEY, "requestPhotos", { invId: "i1", at: AT })), D.REFUSE.noRelationship,
        `${name}: a stranger read a copy's state out of an id`);
    }
  });

  test("[12] and learns nothing of anyone's qualification", () => {
    const st = world();
    okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "Casey looks");
    okv(x(st, CASEY, "requestPhotos", { invId: "i2", at: AT }), "and asks about the other");
    for (const actor of [RILEY, JORDAN]) {
      const v = view(st, actor);
      eq(v.copyReviews.length, 0, "somebody else's review arrived");
      eq((v.photoRequests || []).length, 0, "somebody else's photo request arrived");
      assert(!JSON.stringify(v).includes("casey"), "Casey was named");
    }
  });

  test("[13] a Trusted Partner never sees a Review Card at all", () => {
    const st = world();
    okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "look");
    const v = view(st, TP);
    eq((v.copyReviews || []).length, 0, "the shop was told somebody is looking");
    /* A photo request IS the partner's business — it is a job on their shelf. */
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    assert((view(st, TP).photoRequests || []).some((r) => r.invId === "i1"),
      "the shop cannot see a request it is expected to answer");
  });

  test("[14] the owning partner keeps the precise state, which is theirs to have", () => {
    const st = world(); CLOSE.committed(st);
    eq(statusOf(st), "committed", "the domain flattened its own answer");
    const row = (view(st, TP).inventory || []).find((i) => i.invId === "i1");
    assert(row, "the shop lost its own copy");
    assert(row.status !== "unavailable", "the shop was given the bystander's answer");
  });
});

/* ========================================================= C. Inspect */
describe("C. Inspect", () => {
  test("[15] the right Collector may begin, and it reserves nothing", () => {
    const st = world();
    const before = JSON.stringify(st.get().opportunities);
    const rv = okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "look");
    assert(rv, "no review id came back");
    eq(JSON.stringify(st.get().opportunities), before, "inspecting created a deal");
    eq(st.get().opportunities.length, 0, "inspecting created an opportunity");
    eq(statusOf(st), "available", "inspecting made the copy unavailable to others");
    eq(D.goalState("gC", st.get().opportunities), "seeking", "inspecting locked the Goal");
  });

  test("[16] several may inspect one copy and none is ahead", () => {
    const st = world();
    okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "Casey");
    okv(x(st, JORDAN, "reviewCopy", { invId: "i1", at: AT }), "Jordan");
    eq(st.get().copyReviews.length, 2, "two reviews of one copy");
    eq(statusOf(st), "available", "two people looking made it unavailable");
    /* And the other may still go on to deal on it. */
    eq(code(x(st, JORDAN, "startOpportunity", { goalId: "gJ", invId: "i1", amount: 26, at: AT })), "OK",
      "inspecting by one blocked a deal by another");
  });

  test("[17] it is idempotent, and a second press writes nothing", () => {
    const st = world();
    const a = okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "first");
    const before = JSON.stringify(st.get().copyReviews);
    const b = okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "second");
    eq(b, a, "a second press opened a second review");
    eq(JSON.stringify(st.get().copyReviews), before, "a second press wrote something");
  });

  test("[18] nobody else may end somebody's inspection", () => {
    const st = world();
    const rv = okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "look");
    eq(code(x(st, JORDAN, "endReview", { reviewId: rv, at: AT })), D.REFUSE.notOwner,
      "a rival closed Casey's inspection");
    eq(code(x(st, TP, "endReview", { reviewId: rv, at: AT })), D.REFUSE.notOwner,
      "the shop closed Casey's inspection");
    okv(x(st, CASEY, "endReview", { reviewId: rv, at: AT }), "her own");
  });

  test("[19] ending keeps the record and only closes it", () => {
    const st = world();
    const rv = okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "look");
    okv(x(st, CASEY, "endReview", { reviewId: rv, at: AT }), "done");
    eq(st.get().copyReviews.length, 1, "ending deleted the record");
    assert(st.get().copyReviews[0].endedAt, "ending did not close it");
  });

  test("[20] a stale screen cannot open a review on a copy that has closed", () => {
    /* The browser may be seconds out of date. The server is what decides. */
    const st = world();
    CLOSE.committed(st);
    eq(code(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT })), D.REFUSE.copyUnavailable,
      "a stale press got through");
  });

  test("[21] the actor cannot be injected from the payload", () => {
    const st = world();
    /* Every extra field a caller might hope means something. */
    const r = x(st, CASEY, "reviewCopy",
      { invId: "i1", collectorId: "jordan", partnerId: "sv", actor: "jordan", at: AT });
    okv(r, "the command itself");
    const row = st.get().copyReviews[0];
    eq(row.collectorId, "casey", "the browser chose who was asking");
    eq(row.partnerId, "nl", "the browser chose which shop");
  });
});

/* ================================================= D. Request Photos */
describe("D. Request Photos", () => {
  test("[22] an authorized Collector may ask, and it reserves nothing", () => {
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    eq(st.get().opportunities.length, 0, "asking created an opportunity");
    eq(statusOf(st), "available", "asking made the copy unavailable");
    eq(D.goalState("gC", st.get().opportunities), "seeking", "asking locked the Goal");
    eq(st.get().photoRequests.length, 1, "no request was written");
  });

  test("[23] asking opens the look as well, which is existing behaviour", () => {
    /* `requestPhotos` has created a Review Card since long before this batch.
       Pinned because the button is new: pressing Request photos also starts an
       inspection, and a reader of the UI should not be surprised by that. */
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    eq(st.get().copyReviews.length, 1, "asking did not open the look");
    assert(!st.get().copyReviews[0].endedAt, "and it opened it already closed");
  });

  test("[24] asking twice writes once", () => {
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "first");
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "second");
    eq(st.get().photoRequests.length, 1, "a second press wrote a second request");
  });

  test("[25] a fully photographed copy has nothing to ask for", () => {
    const st = world();
    const r = x(st, CASEY, "requestPhotos", { invId: "i2", at: AT });
    assert(r && r.ok !== false, "asking about a photographed copy was refused");
    eq(st.get().photoRequests.length, 0, "a pointless request was written anyway");
  });

  test("[26] an unauthorized Collector may not ask", () => {
    const st = world();
    eq(code(x(st, RILEY, "requestPhotos", { invId: "i1", at: AT })), D.REFUSE.noRelationship,
      "a stranger put a job on a shop's shelf");
  });

  test("[27] and a Trusted Partner may not ask on a Collector's behalf", () => {
    const st = world();
    eq(code(x(st, TP, "requestPhotos", { invId: "i1", at: AT })), D.REFUSE.notOwner,
      "a shop manufactured demand for its own copy");
    eq(code(x(st, OTHER_TP, "reviewCopy", { invId: "i1", at: AT })), D.REFUSE.notOwner,
      "a shop inspected a rival's copy");
  });
});

/* ============================================ E. photo integrity, through real writes */
describe("E. The evidence cannot be rewritten", () => {
  const filled = (over) => world({
    inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 30,
      grade: "PSA 9", cert: "C1", photos: { front: "f.jpg", back: "b.jpg" } }],
    ...over,
  });
  const commit = (st) => promised(st, valued(st));
  const photosOf = (st) => JSON.stringify(st.get().inventory.find((i) => i.invId === "i1").photos);

  test("[28] an omitted slot cannot delete protected evidence, by any patch shape", () => {
    /* The original defect: the guard read the patch slot by slot (unmentioned =
       unchanged) while the write ASSIGNED wholesale (unmentioned = deleted). */
    for (const patch of [{ photos: {} }, { photos: { front: "f.jpg" } }, { photos: null },
      { photos: "gotcha" }, { photos: [] }, { photos: { front: "NEW.jpg", back: "b.jpg" } }]) {
      const st = filled(); commit(st);
      const before = photosOf(st);
      eq(code(x(st, TP, "updateInventoryCopy", { invId: "i1", patch, at: AT })),
        D.REFUSE.copyCommitted, `${JSON.stringify(patch)} was allowed`);
      eq(photosOf(st), before, `${JSON.stringify(patch)} moved the evidence`);
    }
  });

  test("[29] the empty-then-refill route is closed at the first step", () => {
    const st = filled(); commit(st);
    eq(code(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { photos: {} }, at: AT })),
      D.REFUSE.copyCommitted, "the emptying half got through");
    eq(code(x(st, TP, "addCopyPhotos", { invId: "i1", front: "FAKE.jpg", back: "F2.jpg", at: AT })),
      D.REFUSE.copyCommitted, "the refilling half got through");
    eq(photosOf(st), JSON.stringify({ front: "f.jpg", back: "b.jpg" }), "the evidence moved");
  });

  test("[30] evidence ARRIVING is still allowed, and then that slot closes", () => {
    const st = world({ inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-x",
      ask: 30, grade: "PSA 9", cert: "C1", photos: { front: "f.jpg", back: null } }] });
    commit(st);
    eq(code(x(st, TP, "addCopyPhotos", { invId: "i1", back: "b.jpg", at: AT })), "OK",
      "an empty slot could not be filled inside a live deal");
    eq(code(x(st, TP, "addCopyPhotos", { invId: "i1", back: "other.jpg", at: AT })),
      D.REFUSE.copyCommitted, "and then it stayed open");
  });

  test("[31] photographs are stored in the only shape the guard can read", () => {
    /* An adversarial run found the protection defeatable in two legal steps:
       nothing checked this field's SHAPE, so a partner could store
       `photos: "gotcha"` while the copy was still available, and from then on
       `photoSlot` read every slot of a non-object as null — the guard's question
       is "did a slot that HELD something stop holding it", so the copy looked
       permanently empty to it.

       HONEST SEVERITY: this was data hygiene, not a proven evidence rewrite.
       Corrupting required the copy to be AVAILABLE, and wiping photographs while
       available was already allowed, so it bought no power over evidence that a
       plain wipe did not. What it bought was an unreadable value that the guard,
       the projection and every client then had to cope with. */
    for (const bad of ["gotcha", 42, true, [], null]) {
      const st = filled();
      okv(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { photos: bad }, at: AT }),
        `${JSON.stringify(bad)} on an available copy`);
      const stored = st.get().inventory.find((i) => i.invId === "i1").photos;
      assert(stored && typeof stored === "object" && !Array.isArray(stored),
        `${JSON.stringify(bad)} was stored as-is`);
      assert("front" in stored && "back" in stored,
        `${JSON.stringify(bad)} left the field without its two slots`);
    }
  });

  test("[32] the guard is handed what the write will produce, not the patch", () => {
    const src = fs.readFileSync(path.join(ROOT, "domain/metyet-commands.js"), "utf8");
    const at = src.indexOf("updateInventoryCopy(state");
    const body = src.slice(at, src.indexOf("removeInventoryCopy(state"));
    assert(/const nextPhotos =/.test(body), "the final photographs are not computed");
    assert(body.indexOf("const nextPhotos =") < body.indexOf("protectedCopyEdit("),
      "the guard is asked before the final photographs exist");
    assert(/protectedCopyEdit\(state, invId, copy, p, nextPhotos\)/.test(body),
      "the guard is handed something other than the final photographs");
  });
});

/* ==================================================== F. the surface */
const build = (rel) => {
  const out = esbuild.buildSync({
    entryPoints: [path.join(ROOT, rel)],
    bundle: true, format: "cjs", write: false, logLevel: "silent", jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};
const DealFlow = build("client/collector/sections/DealFlow.jsx").default;
const CARDS = { "cc-x": { canonicalCardId: "cc-x", cardName: "Charizard",
  expansionName: "Base Set", collectorNumber: "4", imageSmall: null } };
const door = { describe: async (ids) => ({ cards: ids.map((id) => CARDS[id]).filter(Boolean) }) };
const texts = (r) => {
  const out = [];
  const walk = (n) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (typeof n === "string" || typeof n === "number") { out.push(String(n)); return; }
    if (!n || n.type === "style") return;
    for (const c of n.children || []) walk(c);
  };
  walk(r.toJSON());
  return out.join(" ").replace(/\s+/g, " ");
};
const instText = (node) => {
  const out = [];
  const walk = (v) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === "string" || typeof v === "number") { out.push(String(v)); return; }
    if (v && v.props) walk(v.props.children);
  };
  walk(node.props.children);
  return out.join(" ").trim();
};
const settle = async () => {
  for (let i = 0; i < 10; i += 1) {
    await TR.act(async () => { await new Promise((done) => setTimeout(done, 0)); });
  }
};
const showFlow = async (st, actor, props = {}) => {
  const state = P.projectForActor(st.get(), actor);
  let r;
  await TR.act(async () => {
    r = TR.create(React.createElement(DealFlow, { state, onBrowseCards: door, ...props }));
  });
  await settle();
  return r;
};
const button = (r, label) => r.root.findAllByType("button").find((n) => instText(n) === label);

describe("F. The screen, and the door it sends through", () => {
  test("[33] Inspect names the physical copy and nothing else", async () => {
    const st = world();
    const sent = [];
    const r = await showFlow(st, CASEY,
      { onInspect: async (invId) => { sent.push(invId); return { ok: true, value: "rv1" }; } });
    const b = button(r, "Inspect");
    assert(b, "no Inspect control: " + texts(r).slice(0, 200));
    await TR.act(async () => { await b.props.onClick(); });
    eq(sent.length, 1, "the press sent nothing");
    eq(sent[0], "i1", "the press did not name the physical copy");
  });

  test("[34] the screen says when you are inspecting, and offers to stop", async () => {
    const st = world();
    okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "look");
    const ended = [];
    const r = await showFlow(st, CASEY,
      { onEndInspection: async (id) => { ended.push(id); return { ok: true }; } });
    assert(/inspecting this copy/i.test(texts(r)), "it does not say so: " + texts(r).slice(0, 200));
    const b = button(r, "Done inspecting");
    assert(b, "no way to stop");
    await TR.act(async () => { await b.props.onClick(); });
    eq(ended.length, 1, "stopping sent nothing");
    assert(String(ended[0]).length > 0, "stopping did not name the review");
  });

  test("[35] Request photos names the copy, and goes once asked", async () => {
    const st = world();
    const asked = [];
    let r = await showFlow(st, CASEY,
      { onRequestPhotos: async (invId) => { asked.push(invId); return { ok: true }; } });
    const b = button(r, "Request photos");
    assert(b, "no Request photos control");
    await TR.act(async () => { await b.props.onClick(); });
    eq(asked[0], "i1", "the press did not name the physical copy");

    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "really ask");
    r = await showFlow(st, CASEY, { onRequestPhotos: async () => ({ ok: true }) });
    assert(/Photos requested/.test(texts(r)), "the screen does not say it was asked");
    assert(!button(r, "Request photos"), "it offered to ask again");
  });

  test("[36] a refusal is reported without saying what happened to the copy", async () => {
    const st = world();
    const r = await showFlow(st, CASEY,
      { onInspect: async () => ({ ok: false, refused: "copy-unavailable" }) });
    await TR.act(async () => { await button(r, "Inspect").props.onClick(); });
    await settle();
    const shown = texts(r);
    assert(/isn't available/i.test(shown), "the refusal was swallowed: " + shown.slice(0, 200));
    for (const word of ["pending", "committed", "sold", "jordan"]) {
      assert(!new RegExp(word, "i").test(shown), `the message leaked "${word}"`);
    }
  });

  test("[37] no control is offered that the screen was handed no way to send", async () => {
    const st = world();
    const r = await showFlow(st, CASEY);   // no command props at all
    eq(r.root.findAllByType("button").length, 0,
      "a control appeared with nothing behind it: " + texts(r).slice(0, 200));
  });

  test("[38] and the screen stops where the transaction starts", () => {
    const src = codeOf("client/collector/sections/DealFlow.jsx");
    for (const gone of ["startOpportunity", "acceptPrice", "acceptMarketValue", "setCopyPending",
      "Market Value", "Make an offer", "Agree a price"]) {
      assert(!src.includes(gone), `Deal Flow grew ${gone}`);
    }
    /* And the only three it can send are the qualification ones. */
    for (const prop of ["onInspect", "onEndInspection", "onRequestPhotos"]) {
      assert(src.includes(prop), `Deal Flow lost ${prop}`);
    }
  });
});

/* ============================================= G. what did not move */
describe("G. The boundary", () => {
  test("[39] the allow-list grew by exactly the three with a surface", () => {
    /* RE-PINNED by photo fulfilment, which added the fourth: `addCopyPhotos`,
       the only command that closes a photo request. This batch's own three are
       still asserted below, and the transaction set is still shut. */
    /* RE-PINNED (Batch 3C-1): 25 → 24. `addBinderEntry` left the door by
       name; any other change to the size still fails here. */
    eq(EXPOSED_COMMANDS.length, 24, "the production surface is not the size this batch declared");
    assert(EXPOSED_COMMANDS.includes("addCopyPhotos"),
      "the shop lost its way to answer a request");
    for (const open of ["reviewCopy", "endReview", "requestPhotos"]) {
      assert(EXPOSED_COMMANDS.includes(open), `${open} has a control but no door`);
    }
    for (const shut of ["startOpportunity", "proposePrice", "acceptPrice", "acceptMarketValue",
      "acceptDeal", "proposeTradeSelection", "setCopyPending", "cancelOpportunity",
      "proposeFulfillment", "confirmHandoff", "sendMessage", "setInterest"]) {
      assert(!EXPOSED_COMMANDS.includes(shut), `${shut} was exposed`);
    }
    eq(new Set(EXPOSED_COMMANDS).size, EXPOSED_COMMANDS.length, "a command is listed twice");
  });

  test("[40] every exposed name is a real command", () => {
    const { COMMAND_NAMES } = require("../domain/metyet-commands.js");
    const known = COMMAND_NAMES.has ? (n) => COMMAND_NAMES.has(n)
      : (n) => [...COMMAND_NAMES].includes(n);
    for (const name of EXPOSED_COMMANDS) assert(known(name), `${name} is not a command`);
  });

  test("[41] no migration, and no new durable field", () => {
    const migrations = fs.readdirSync(path.join(ROOT, "persistence/migrations"))
      .filter((f) => f.endsWith(".sql")).sort();
    eq(migrations[migrations.length - 1], "0014_binder_memberships.sql", migrations.join(","));
    /* A durable concept would show up as a FIELD being written or read, so this
       looks for the shapes a field takes rather than for the word, which the
       comments use freely to explain that there is no such field. */
    const src = codeOf("domain/metyet-domain.js") + codeOf("domain/metyet-commands.js")
      + codeOf("domain/metyet-projection.js") + codeOf("domain/metyet-world.js");
    for (const invented of ["participant", "authorizedViewer", "qualificationParticipant",
      "visibilityGrant", "cardState", "qualifiedBy"]) {
      for (const shape of [`${invented}:`, `.${invented}`, `"${invented}"`, `'${invented}'`]) {
        assert(!src.includes(shape), `a durable concept called ${invented} appeared as ${shape}`);
      }
    }
    /* And the persisted column set never learned one either. */
    const repo = codeOf("persistence/world-repository.js");
    for (const invented of ["participant", "authorized", "visibility", "qualif"]) {
      assert(!repo.toLowerCase().includes(invented), `${invented} reached persistence`);
    }
  });

  test("[42] visibility is derived, and the world stays storable", () => {
    /* The whole rule is read off rows that already existed. If it needed a fact
       of its own, a world built by running the commands would stop validating. */
    const st = world();
    okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "look");
    okv(x(st, CASEY, "requestPhotos", { invId: "i2", at: AT }), "ask");
    promised(st, valued(st));
    const W = require("../domain/metyet-world.js");
    const verdict = W.validateWorld(st.get());
    const errors = (verdict && verdict.errors) || (Array.isArray(verdict) ? verdict : []);
    eq(JSON.stringify(errors), "[]", "the world stopped being storable");
    if (verdict && "ok" in verdict) assert(verdict.ok, "the world is not storable");
  });

  test("[43] True Match is untouched: stated is exact, unstated is unrestricted", () => {
    const st = world({
      goals: [{ id: "gC", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary",
        desired: { grade: "PSA 10" } }],
    });
    eq(code(x(st, CASEY, "startOpportunity", { goalId: "gC", invId: "i1", amount: 25, at: AT })),
      D.REFUSE.criteriaMismatch, "a PSA 9 copy satisfied a PSA 10 goal");
    const loose = world({
      goals: [{ id: "gC", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary", desired: {} }],
    });
    eq(code(x(loose, CASEY, "startOpportunity", { goalId: "gC", invId: "i1", amount: 25, at: AT })), "OK",
      "an unstated criterion became a guess");
  });

  test("[44] the Collector still has exactly four destinations", () => {
    const SHELL = build("client/collector/CollectorShell.jsx");
    eq(SHELL.SECTIONS.map((s) => s.label).join(" · "),
      "Browse · Binders · Trusted Partners · Deal Flow", "the navigation moved");
  });
});

/* =========================================================================
   H — WHAT THE ADVERSARIAL PASS FOUND

   Every test here failed when it was written. The first is the one that
   mattered: the rule was right in the domain and in the projection, and the
   screen threw it away anyway.
   ========================================================================= */
describe("H. The adversarial pass", () => {
  test("[45] a copy you are inspecting stays ON SCREEN when it closes", async () => {
    /* THE BATCH'S HEADLINE, AND IT WAS INVISIBLE. Deal Flow builds its copy list
       from `discoveries`, and a discovery requires `status === "available"` — so
       the copy the projection worked to keep was dropped by the screen anyway.
       The Collector lost the card exactly as before, and with it the only route
       to Done inspecting, which pinned the copy into their projection for good. */
    const st = world();
    okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "look");
    CLOSE.committed(st);
    assert(copyRow(st, CASEY), "precondition: the projection should still hold it");
    const r = await showFlow(st, CASEY, { onEndInspection: async () => ({ ok: true }) });
    const shown = texts(r);
    assert(/C1/.test(shown) || /No longer available/.test(shown),
      "the copy vanished from the screen: " + shown.slice(0, 260));
    assert(button(r, "Done inspecting"),
      "there is no way to close an inspection on a copy that closed");
  });

  test("[46] and that row offers nothing it cannot do", async () => {
    const st = world();
    okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "look");
    CLOSE.committed(st);
    const r = await showFlow(st, CASEY, { onInspect: async () => ({ ok: true }),
      onRequestPhotos: async () => ({ ok: true }), onEndInspection: async () => ({ ok: true }) });
    assert(/No longer available/.test(texts(r)), "it does not say the copy closed");
    /* i2 is still available and still offers both, so this is not vacuous. */
    assert(button(r, "Inspect"), "precondition: the available copy lost its control");
    const labels = r.root.findAllByType("button").map(instText);
    eq(labels.filter((l) => l === "Done inspecting").length, 1, "one way out, on the closed copy");
  });

  test("[47] an open review is answered with itself, before the door", async () => {
    /* The gate sat ABOVE the short-circuit, so it did the opposite of the
       comment beside it and broke the idempotence `client/commands.js` promises:
       a lost response plus a rival's pend left the Collector refused on a review
       they already owned. */
    for (const name of CLOSED) {
      const st = world();
      const first = okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "look");
      CLOSE[name](st);
      const again = x(st, CASEY, "reviewCopy", { invId: "i1", at: AT });
      assert(again && again.ok !== false,
        `${name}: a retry was refused on a review the Collector already held`);
      eq(again.value, first, `${name}: the retry opened a different review`);
      eq(st.get().copyReviews.filter((r) => r.collectorId === "casey").length, 1,
        `${name}: the retry wrote a second review`);
    }
  });

  test("[48] and so is an open photo request", () => {
    for (const name of CLOSED) {
      const st = world();
      okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
      CLOSE[name](st);
      const again = x(st, CASEY, "requestPhotos", { invId: "i1", at: AT });
      assert(again && again.ok !== false, `${name}: a retry was refused`);
      eq(st.get().photoRequests.length, 1, `${name}: the retry wrote a second request`);
    }
  });

  test("[49] an archived copy is not a fourth, readable state", () => {
    /* `archived: true` rode on the retained row, distinguishing "the shop pulled
       it" from "a deal has it" — the exact difference the flat `unavailable`
       exists to hide. */
    const st = world();
    okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "look");
    okv(x(st, TP, "removeInventoryCopy", { invId: "i1", at: AT }), "the shop pulls it");
    eq(copyRow(st, CASEY), null, "an archived copy stayed visible through a review");
  });

  test("[50] a bystander cannot tell a closed photographed copy from a closed bare one", () => {
    /* `copyPhotographed` short-circuited to success ABOVE the door, so asking
       about i2 answered differently from asking about i1 once both had closed. */
    /* i1 has no photographs; i2 has both. One negotiation per Goal, so each
       copy is closed in a world of its own. */
    const closeOne = (invId) => {
      const st = world();
      const o = okv(x(st, JORDAN, "startOpportunity",
        { goalId: "gJ", invId, amount: 26, at: AT }), "open");
      okv(x(st, TP, "setCopyPending", { invId, oppId: o, at: AT }), "pend");
      return code(x(st, CASEY, "requestPhotos", { invId, at: AT }));
    };
    const bare = closeOne("i1");
    const photographed = closeOne("i2");
    eq(bare, D.REFUSE.copyUnavailable, "the bare copy did not close the door");
    eq(photographed, bare,
      "a photographed copy answered differently from a bare one, which is an oracle");
  });

  test("[51] photographs are normalised at BOTH doors, not just one", () => {
    /* The first fix normalised `updateInventoryCopy` and its comment claimed
       that was the only door. `addInventoryCopy` is also on the allow-list and
       also writes this field — and `{front:{},back:{}}` went in reading as fully
       photographed, so a copy holding no evidence at all told the Collector
       there was nothing left to ask for. */
    const st = world();
    okv(x(st, TP, "addInventoryCopy", { copy: { invId: "i9", canonicalCardId: "cc-x",
      grade: "PSA 9", ask: 20, photos: { front: {}, back: {} } }, at: AT }), "born");
    const born = st.get().inventory.find((i) => i.invId === "i9");
    assert(!D.INVARIANTS.copyPhotographed(born.photos),
      "a copy with no evidence read as fully photographed");
    eq(JSON.stringify(born.photos), JSON.stringify({ front: null, back: null }),
      "it was not stored in the shape every reader expects");
    /* So the Collector can still ask for the evidence. */
    eq(code(x(st, CASEY, "requestPhotos", { invId: "i9", at: AT })), "OK",
      "the Collector was refused the chance to ask for evidence that does not exist");
  });

  test("[52] a press on one copy does not swallow a press on another", async () => {
    /* One `busy` flag for the whole screen meant the other buttons stayed
       lit and did nothing, with no message. */
    const st = world();
    let release;
    const held = new Promise((done) => { release = done; });
    const seen = [];
    const r = await showFlow(st, CASEY, {
      onInspect: async (invId) => { seen.push(invId); await held; return { ok: true }; },
    });
    const all = r.root.findAllByType("button").filter((n) => instText(n) === "Inspect");
    assert(all.length >= 2, "precondition: two copies should be inspectable");
    await TR.act(async () => { all[0].props.onClick(); });
    await TR.act(async () => { all[1].props.onClick(); });
    eq(seen.length, 2, "the second copy's press was swallowed");
    await TR.act(async () => { release(); await held; });
  });

  test("[53] a refusal names the copy it is about", async () => {
    const st = world();
    const r = await showFlow(st, CASEY,
      { onInspect: async () => ({ ok: false, refused: "copy-unavailable" }) });
    const all = r.root.findAllByType("button").filter((n) => instText(n) === "Inspect");
    await TR.act(async () => { await all[0].props.onClick(); });
    await settle();
    const notices = r.root.findAll((n) => n.props
      && n.props.className === "mcs-df-trouble");
    eq(notices.length, 1, "the message was not attached to one copy");
  });

  test("[54] there is exactly one definition of participation", () => {
    /* `qualifyingOn` was written, exported, documented as half the rule — and
       called by nothing, while the projection restated a narrower version of it
       inline. A third definition waiting to drift. */
    const proj = codeOf("domain/metyet-projection.js");
    assert(/D\.qualifyingOn\(/.test(proj), "the projection restates the rule itself");
    const dom = codeOf("domain/metyet-domain.js");
    assert(/qualifyingOn/.test(dom), "the predicate is gone");
  });

  test("[55] the screen offers no control beyond the three", async () => {
    /* [38] in the binders suite asserted Deal Flow had NO button. That could not
       survive this batch, so it was re-pinned — and a bare "names no transaction
       command" would let a fourth control in. This is the upper bound. */
    const st = world();
    okv(x(st, CASEY, "reviewCopy", { invId: "i2", at: AT }), "one open look");
    const r = await showFlow(st, CASEY, { onInspect: async () => ({ ok: true }),
      onEndInspection: async () => ({ ok: true }), onRequestPhotos: async () => ({ ok: true }) });
    const labels = [...new Set(r.root.findAllByType("button").map(instText))].sort();
    eq(labels.join(" | "), "Done inspecting | Inspect | Request photos",
      "Deal Flow grew a control this batch did not declare");
  });
});

/* =========================================================================
   I — THROUGH THE REAL DOOR

   Exposing three commands is the central act of this batch, and every other
   section here calls the domain in process. This one goes over HTTP, against
   the real server and a real database, because the allow-list, the actor
   resolution and the refusal shape are all things only that path exercises.
   ========================================================================= */
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { createApp } = require("../server/app.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));
const SUBJECT = { north: "sub-north", casey: "sub-casey", dana: "sub-dana" };

async function served() {
  const pg = database();
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  const rt = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 1000 });
  const repository = createWorldRepository(db);
  const catalog = createCatalogRepository(db, { newId: rt.newId });
  /* The inventory row names a canonical card by foreign key, so the catalogue
     has to hold one before the world can be saved. */
  const { expansionId } = await catalog.putExpansion(
    { game: "pokemon", code: "base1", name: "Base", printedTotal: 102 });
  const { cardContextId } = await catalog.putCardContext({ game: "pokemon", expansionId,
    collectorNumber: "4", cardName: "Charizard", artist: "Mitsuhiro Arita", rarity: "Rare Holo" });
  const { canonicalCardId } = await catalog.putCanonicalCard(
    { cardContextId, printRun: "unlimited", finish: "holofoil" });
  await repository.saveWorld({
    catalog: [],
    collectors: [{ id: "c1", name: "Casey" }, { id: "c2", name: "Dana" }],
    partners: [{ id: "p1", name: "Northline" }],
    relationships: [{ partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" }],
    invitations: [], goals: [], collectorCopies: [], binders: [], binderEntries: [],
    interests: [], opportunities: [], conversations: [], photoRequests: [], copyReviews: [],
    inventory: [{ invId: "iv1", partnerId: "p1", canonicalCardId, ask: 30,
      grade: "PSA 9", cert: "C1", photos: { front: null, back: null }, archived: false }],
  });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: SUBJECT.north, role: "tp", partnerId: "p1" });
  await accounts.linkAccount({ subject: SUBJECT.casey, role: "collector", collectorId: "c1" });
  await accounts.linkAccount({ subject: SUBJECT.dana, role: "collector", collectorId: "c2" });
  const verifier = { verify: async (token) => {
    const subject = SUBJECT[token];
    if (!subject) throw Object.assign(new Error("no"), { reason: "bad token" });
    return { subject, email: `${token}@example.invalid`, emailVerified: true };
  } };
  return { app: createApp({ repository, catalog, accounts, verifier, runtime: rt }) };
}
const send = (app, token, command, payload) => app.inject({ method: "POST",
  url: "/api/commands", headers: { authorization: `Bearer ${token}` },
  payload: { command, payload } });
const refusalOf = (res) => (res.statusCode === 200 ? null : res.json().error.refused);

describe("I. Over HTTP, against the real server", () => {
  test("[56] the three qualification commands reach the domain", async () => {
    const { app } = await served();
    const look = await send(app, "casey", "reviewCopy", { invId: "iv1" });
    eq(look.statusCode, 200, "Inspect did not get through: " + JSON.stringify(refusalOf(look)));
    const reviewId = look.json().value;
    assert(reviewId, "no review id came back over the wire");
    eq((await send(app, "casey", "requestPhotos", { invId: "iv1" })).statusCode, 200,
      "Request photos did not get through");
    eq((await send(app, "casey", "endReview", { reviewId })).statusCode, 200,
      "Done inspecting did not get through");
  });

  test("[57] the transaction is still unreachable from a browser", async () => {
    const { app } = await served();
    /* `addCopyPhotos` is reachable since photo fulfilment; it is exercised as a
       Trusted Partner in that batch's own suite. What must stay unreachable
       from any browser is the transaction. */
    for (const shut of ["startOpportunity", "proposePrice", "acceptPrice", "acceptDeal",
      "setCopyPending", "proposeTradeSelection", "confirmHandoff",
      "sendMessage", "setInterest"]) {
      const res = await send(app, "casey", shut, {});
      eq(res.statusCode, 409, `${shut} reached the domain`);
      eq(refusalOf(res), "command-unavailable", `${shut} answered something revealing`);
    }
  });

  test("[58] a caller cannot say who they are", async () => {
    const { app } = await served();
    /* Dana knows nobody. If the payload could name Casey she would get through. */
    const res = await send(app, "dana", "reviewCopy",
      { invId: "iv1", collectorId: "c1", actor: "c1", partnerId: "p1" });
    assert(res.statusCode !== 200, "a browser chose its own identity");
    assert(["no-relationship", "invalid_request", "bad_request"].includes(refusalOf(res))
      || res.statusCode === 400, "an unexpected answer: " + refusalOf(res));
  });

  test("[59] nobody else may end an inspection, over the wire", async () => {
    const { app } = await served();
    const reviewId = (await send(app, "casey", "reviewCopy", { invId: "iv1" })).json().value;
    eq(refusalOf(await send(app, "dana", "endReview", { reviewId })), "not-owner",
      "another Collector closed it");
    eq(refusalOf(await send(app, "north", "endReview", { reviewId })), "not-owner",
      "the shop closed it");
  });

  test("[60] a malformed payload refuses cleanly and never 500s", async () => {
    const { app } = await served();
    for (const payload of [{}, null, [], 7, { invId: null }, { invId: {} }, { invId: ["iv1"] }]) {
      for (const cmd of ["reviewCopy", "requestPhotos", "endReview"]) {
        const res = await send(app, "casey", cmd, payload);
        assert(res.statusCode < 500, `${cmd} ${JSON.stringify(payload)} -> ${res.statusCode}`);
      }
    }
  });
});

if (require.main === module) run();
module.exports = {};
