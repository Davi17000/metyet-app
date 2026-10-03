/* ============================================================================
   A BINDER IS THE HOME OF A GOAL OR A COPY, NOT OF A CARD

   Two things a Collector can act on:

     Goal           I am looking for this exact card, this hard
     CollectorCopy  I own this exact physical card, and I keep it or I'd part with it

   A Binder is where one of those optionally lives. Not where a card lives —
   because a Collector who hunts a card, keeps one copy of it and would part
   with another has THREE things that may belong in three different places, and
   a row naming the card could only say one thing about all three. 0013 shipped
   that row and called it transitional in its own closing note; the commands
   have said so since the salvage batch: *"three actionable objects share one
   row, which is why the row is on its way to naming the object instead."*

   WHAT THIS BATCH BUILDS, AND WHAT IT DELIBERATELY DOES NOT.

   It builds the representation: a `binder_memberships` row with an id of its
   own naming exactly one Goal or one CollectorCopy, at most one home per
   object, `fileObject` and `unfileObject`, the validator rules, the projection,
   and the removal lifecycle. It does NOT move a single Collector screen across.
   The panel still asks "which binders does this card belong in?" and still
   sends `addBinderEntry`, because that question cannot express three homes for
   one card and replacing it is a redesign of the control, not a batch.

   SO BOTH REPRESENTATIONS ARE LIVE AT ONCE, AND SECTION E IS THE PROOF THAT
   THEY DO NOT TOUCH. `binder_entries` is not altered, not re-keyed, not read
   and not written by anything here. A card-level row is NEVER the answer to
   "which binder is this Goal in" — if no membership names the object, the
   object is unfiled, however many rows mention its card. Those rows record an
   act of filing a CARD; nothing on one records what caused it, and
   one-Goal-per-card is a rule the command keeps and the database does not, so
   even "there is exactly one candidate" is a fact about today rather than about
   what somebody meant.

   AND SECTION G IS ABOUT A DEFECT THIS BATCH FOUND AND FIXED. A binder created
   in the same Save was never filed into: the panel showed it ticked, created
   it, filed nothing, closed without a word, and on a retry made a second one.
   Nothing could name a binder that had no id yet. That is now general — every
   minting step's id is recorded against a handle the plan carries — which is
   the mechanism object-level filing will need in 3B and which the card-level
   filing needed all along.
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const path = require("path");
const React = require("react");
const TR = require("react-test-renderer");
const esbuild = require("esbuild");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository, TABLES } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { projectForActor } = require("../domain/metyet-projection.js");
const { validateWorld } = require("../domain/metyet-world.js");
const D = require("../domain/metyet-domain.js");
const C = require("../domain/metyet-commands.js");
const RT = require("../domain/metyet-runtime.js");
const { createStore } = require("./fixture-store.cjs");

const ROOT = path.join(__dirname, "..");
const AT = "2026-10-01";

const CASEY = { collectorId: "casey" };
const DANA = { collectorId: "dana" };
const TP = { partnerId: "nl" };
const PHOTOS = { front: "f.jpg", back: "b.jpg" };

/* Casey owns two copies of one card and is hunting it as well — the case the
   card-level row could never describe. Dana is a second Collector, and the
   legacy entry is a card-level row of the kind no command here writes. */
const world = (over = {}) => createStore({
  partners: [{ id: "nl", name: "Northline", tradeRate: 0.7 }],
  collectors: [{ id: "casey", name: "Casey" }, { id: "dana", name: "Dana" }],
  relationships: [{ partnerId: "nl", collectorId: "casey", status: "accepted", at: AT }],
  goals: [{ id: "g1", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary",
    desired: { grade: "PSA 9" } },
  { id: "gd", collectorId: "dana", canonicalCardId: "cc-x", tier: "primary",
    desired: { grade: "PSA 9" } }],
  inventory: [],
  collectorCopies: [
    { id: "keep", collectorId: "casey", canonicalCardId: "cc-x", keeping: true,
      offered: false, grade: "PSA 9", cert: "K1", photos: PHOTOS },
    { id: "sell", collectorId: "casey", canonicalCardId: "cc-x", offered: true,
      grade: "PSA 8", cert: "S1", photos: PHOTOS },
    { id: "theirs", collectorId: "dana", canonicalCardId: "cc-x", offered: true,
      grade: "PSA 7", cert: "D1", photos: PHOTOS }],
  binders: [{ id: "A", collectorId: "casey", name: "Hunting", createdAt: AT, archivedAt: null },
    { id: "B", collectorId: "casey", name: "Keepers", createdAt: AT, archivedAt: null },
    { id: "OLD", collectorId: "casey", name: "Put away", createdAt: AT, archivedAt: AT },
    { id: "HERS", collectorId: "dana", name: "Dana's", createdAt: AT, archivedAt: null }],
  /* A card-level row, which this batch must leave exactly as it finds it. */
  binderEntries: [{ binderId: "A", canonicalCardId: "cc-x", addedAt: AT }],
  binderMemberships: [],
  opportunities: [], catalog: [], copyReviews: [], photoRequests: [],
  conversations: [], interests: [],
  ...over,
});

const x = (st, actor, cmd, payload) => st.execute(actor, cmd, { ...(payload || {}), at: AT });
const code = (r) => {
  assert(r && typeof r === "object", "a command returned nothing at all");
  return r.ok !== false ? "OK" : r.refused;
};
const okv = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
const snap = (st) => JSON.stringify(st.get());
const homes = (st) => st.get().binderMemberships;
const homeOf = (st, kind, id) => homes(st).find((m) => m[kind] === id) || null;
const entries = (st) => JSON.stringify(st.get().binderEntries);
const valid = (st) => validateWorld(st.get()).ok;

/* ================================================= A. naming exactly one thing */
describe("A. A membership is the home of one thing", () => {

  test("[1] a Goal can be filed, and the row names the Goal", () => {
    const st = world();
    const id = okv(x(st, CASEY, "fileObject", { binderId: "A", goalId: "g1" }), "file");
    const m = homeOf(st, "goalId", "g1");
    assert(m, "nothing was written");
    eq(m.id, id, "the command returned a different id than it wrote");
    eq(m.binderId, "A", "the wrong binder");
    eq(m.filedAt, AT, "no filedAt");
    assert(!("collectorCopyId" in m), "a copy reference appeared from nowhere");
    assert(valid(st), "the world stopped validating");
  });

  test("[2] a CollectorCopy can be filed, and the row names the copy", () => {
    const st = world();
    const id = okv(x(st, CASEY, "fileObject", { binderId: "B", collectorCopyId: "keep" }), "file");
    const m = homeOf(st, "collectorCopyId", "keep");
    assert(m && m.id === id && m.binderId === "B", "the copy was not filed");
    assert(!("goalId" in m), "a goal reference appeared from nowhere");
    assert(valid(st), "the world stopped validating");
  });

  test("[3] both, neither, malformed and blank are all refused, and write nothing", () => {
    /* They fail at the same thing — the request did not name exactly one object
       — which is why they share a code. A blank is listed because `isId` does
       not trim anywhere in this repository, so without its own check a
       whitespace id would reach the foreign key and come back as a database
       error rather than a refusal. */
    const cases = [
      ["both", { goalId: "g1", collectorCopyId: "keep" }],
      ["neither", {}],
      ["both undefined", { goalId: undefined, collectorCopyId: undefined }],
      ["both null", { goalId: null, collectorCopyId: null }],
      ["blank goal", { goalId: "   " }],
      ["blank copy", { collectorCopyId: "" }],
      ["goal as a number", { goalId: 7 }],
      ["copy as an object", { collectorCopyId: { id: "keep" } }],
      ["goal as an array", { goalId: ["g1"] }],
    ];
    for (const [label, target] of cases) {
      const st = world();
      const before = snap(st);
      eq(code(x(st, CASEY, "fileObject", { binderId: "A", ...target })),
        D.REFUSE.invalidTarget, `${label}: was not refused as an invalid target`);
      eq(snap(st), before, `${label}: a refused filing changed the world`);
      /* And `unfileObject` answers the same way about the same thing. */
      eq(code(x(st, CASEY, "unfileObject", target)),
        D.REFUSE.invalidTarget, `${label}: unfile did not refuse`);
      eq(snap(st), before, `${label}: a refused unfiling changed the world`);
    }
    /* A REAL ID BESIDE AN EMPTY STRING IS ONE TARGET, NOT TWO. An empty string
       is how an unfilled field arrives, not a second answer — refusing it would
       mean a caller could never send both keys with one of them filled, which
       is the natural shape for a form. `addGoal`'s rule against naming two
       cards is about two REAL values, and so is this one. */
    const st = world();
    okv(x(st, CASEY, "fileObject", { binderId: "A", goalId: "g1", collectorCopyId: "  " }),
      "a real id beside a blank");
    eq(homeOf(st, "goalId", "g1").binderId, "A", "the real target was not used");
  });

  test("[4] a refused filing consumes no membership id", () => {
    /* The id sequence is the runtime's, and a request that was rejected must
       leave no gap in it — the rule the last two batches each had to pin for
       their own command. */
    let minted = 0;
    const rt = RT.createRuntime({ now: () => AT, newId: (p = "") => `${p}${++minted}` });
    const base = world().get();
    const ask = (payload) => C.execute(base, { ...CASEY, seat: "collector" },
      "fileObject", { ...payload, at: AT }, rt);
    eq(code(ask({ binderId: "A" })), D.REFUSE.invalidTarget, "not refused");
    eq(code(ask({ binderId: "A", goalId: "g1", collectorCopyId: "keep" })),
      D.REFUSE.invalidTarget, "not refused");
    eq(code(ask({ binderId: "nope", goalId: "g1" })), D.REFUSE.notFound, "not refused");
    eq(code(ask({ binderId: "HERS", goalId: "g1" })), D.REFUSE.notOwner, "not refused");
    eq(code(ask({ binderId: "OLD", goalId: "g1" })), D.REFUSE.binderArchived, "not refused");
    eq(minted, 0, "a refusal consumed a membership id");
    const r = ask({ binderId: "A", goalId: "g1" });
    assert(r && r.ok !== false, `the real filing was refused: ${r && r.refused}`);
    eq(r.value, "bm1", "the refusals left a gap in the id sequence");
  });

  test("[5] a binder or an object that is not there answers not-found", () => {
    const st = world();
    eq(code(x(st, CASEY, "fileObject", { binderId: "nope", goalId: "g1" })), D.REFUSE.notFound);
    eq(code(x(st, CASEY, "fileObject", { binderId: "A", goalId: "nope" })), D.REFUSE.notFound);
    eq(code(x(st, CASEY, "fileObject", { binderId: "A", collectorCopyId: "nope" })), D.REFUSE.notFound);
    eq(code(x(st, CASEY, "unfileObject", { goalId: "nope" })), D.REFUSE.notFound);
    eq(snap(st), snap(world()), "one of those wrote something");
  });
});

/* ============================================ B. one home, and moving between */
describe("B. An object has one home or none", () => {

  test("[6] filing it again in the same binder keeps the row, the id and the moment", () => {
    const st = world();
    const id = okv(x(st, CASEY, "fileObject", { binderId: "A", goalId: "g1" }), "file");
    const before = snap(st);
    const again = okv(x(st, CASEY, "fileObject", { binderId: "A", goalId: "g1" }), "again");
    eq(again, id, "the same answer produced a different id");
    eq(snap(st), before, "re-stating a home rewrote the row");
  });

  test("[7] filing it elsewhere MOVES the same row — it does not make a second", () => {
    /* The whole reason there is no `moveObject`. An object has one home, so
       filing it somewhere else IS the move: one row, updated in place, with no
       moment in between where the thing belongs nowhere. */
    const st = world();
    const id = okv(x(st, CASEY, "fileObject", { binderId: "A", goalId: "g1" }), "file");
    okv(x(st, CASEY, "fileObject", { binderId: "B", goalId: "g1" }), "move");
    eq(homes(st).length, 1, `the move left ${homes(st).length} rows`);
    const m = homeOf(st, "goalId", "g1");
    eq(m.id, id, "the move replaced the row instead of moving it");
    eq(m.binderId, "B", "the move did not land");
    eq(m.filedAt, AT, "the moment it was filed was not refreshed");
    assert(valid(st), "the move produced an invalid world");
  });

  test("[8] a Goal and two copies of one card can live in three different places", () => {
    /* THE CAPABILITY THIS BATCH EXISTS FOR, and the thing a card-level row
       could not say: one canonical card, three actionable objects, three homes.
       The legacy entry for that same card is still in binder A throughout, and
       is none of their homes. */
    const st = world({ binders: [
      { id: "A", collectorId: "casey", name: "Hunting", createdAt: AT, archivedAt: null },
      { id: "B", collectorId: "casey", name: "Keepers", createdAt: AT, archivedAt: null },
      { id: "Cc", collectorId: "casey", name: "For trade", createdAt: AT, archivedAt: null }] });
    okv(x(st, CASEY, "fileObject", { binderId: "A", goalId: "g1" }), "goal");
    okv(x(st, CASEY, "fileObject", { binderId: "B", collectorCopyId: "keep" }), "pc");
    okv(x(st, CASEY, "fileObject", { binderId: "Cc", collectorCopyId: "sell" }), "trade");
    eq(homeOf(st, "goalId", "g1").binderId, "A");
    eq(homeOf(st, "collectorCopyId", "keep").binderId, "B");
    eq(homeOf(st, "collectorCopyId", "sell").binderId, "Cc");
    eq(homes(st).length, 3, "three objects did not make three homes");
    assert(valid(st), "the world stopped validating");
  });

  test("[9] unfiling leaves the object exactly as it was, and is idempotent", () => {
    const st = world();
    okv(x(st, CASEY, "fileObject", { binderId: "A", goalId: "g1" }), "file");
    okv(x(st, CASEY, "fileObject", { binderId: "B", collectorCopyId: "keep" }), "file");
    okv(x(st, CASEY, "unfileObject", { goalId: "g1" }), "unfile");
    eq(homeOf(st, "goalId", "g1"), null, "the Goal still has a home");
    eq(st.get().goals.find((g) => g.id === "g1").tier, "primary", "unfiling changed the Goal");
    eq(homes(st).length, 1, "unfiling one took the other");
    const before = snap(st);
    eq(okv(x(st, CASEY, "unfileObject", { goalId: "g1" }), "again"), false,
      "unfiling nothing did not say so");
    eq(snap(st), before, "unfiling nothing wrote something");
    eq(D.copyDisposition(st.get().collectorCopies.find((b) => b.id === "keep")), "keeping",
      "unfiling changed a disposition");
  });

  test("[10] and what an object MEANS never moves it", () => {
    /* Membership is organisation; tier and disposition are meaning. Changing
       one has never moved the other and must not start — this is the rule the
       salvage batch restored, asserted now at the object level. */
    const st = world();
    okv(x(st, CASEY, "fileObject", { binderId: "A", goalId: "g1" }), "goal");
    okv(x(st, CASEY, "fileObject", { binderId: "B", collectorCopyId: "keep" }), "pc");
    const before = JSON.stringify(homes(st));
    okv(x(st, CASEY, "updateGoalTier", { goalId: "g1", tier: "secondary" }), "demote");
    okv(x(st, CASEY, "updateGoalTier", { goalId: "g1", tier: "primary" }), "promote");
    okv(x(st, CASEY, "setCollectorCopyOffered", { copyId: "keep", offered: true }), "switch");
    okv(x(st, CASEY, "setCollectorCopyKept", { copyId: "keep", keeping: true }), "switch back");
    okv(x(st, CASEY, "updateGoalCriteria", { goalId: "g1", desired: { grade: "PSA 10" } }), "criteria");
    okv(x(st, CASEY, "updateCollectorCopy", { copyId: "keep", patch: { market: 50 } }), "correct");
    eq(JSON.stringify(homes(st)), before, "a change of meaning moved a home");
  });
});

/* ========================================================== C. whose things */
describe("C. One Collector's binder holds one Collector's things", () => {

  test("[11] a Collector cannot file into somebody else's binder", () => {
    const st = world();
    eq(code(x(st, CASEY, "fileObject", { binderId: "HERS", goalId: "g1" })), D.REFUSE.notOwner);
    eq(code(x(st, TP, "fileObject", { binderId: "A", goalId: "g1" })), D.REFUSE.notOwner);
    eq(homes(st).length, 0, "something was filed anyway");
  });

  test("[12] nor file somebody else's object into their own", () => {
    /* THE HOLE THIS BATCH OPENS AND CLOSES IN THE SAME BREATH. Owning the
       binder used to be the whole question, because an entry named a card and a
       card has no owner. A membership names an OBJECT, so both sides have to
       agree — and the projection scopes entries by the binder alone, so a row
       pairing Casey's binder with Dana's Goal would put Dana's object id on
       Casey's screen. */
    const st = world();
    eq(code(x(st, CASEY, "fileObject", { binderId: "A", goalId: "gd" })), D.REFUSE.notOwner,
      "another Collector's Goal was filed in this one's binder");
    eq(code(x(st, CASEY, "fileObject", { binderId: "A", collectorCopyId: "theirs" })),
      D.REFUSE.notOwner, "another Collector's copy was filed in this one's binder");
    eq(code(x(st, CASEY, "unfileObject", { goalId: "gd" })), D.REFUSE.notOwner,
      "this Collector unfiled another's Goal");
    eq(homes(st).length, 0, "something was filed anyway");
    /* And a world that contains such a pair could not have been written. */
    const bad = world({ binderMemberships: [{ id: "m1", binderId: "A", goalId: "gd", filedAt: AT }] });
    assert(!valid(bad), "a cross-owner membership validated");
    eq(validateWorld(bad.get()).errors[0].code, "ref.owner-mismatch", "the wrong complaint");
  });

  test("[13] the owner receives their memberships, scoped by BOTH owners", () => {
    const st = world();
    okv(x(st, CASEY, "fileObject", { binderId: "A", goalId: "g1" }), "file");
    /* A cross-owner row cannot be created, so one is seeded to prove the filter
       does not depend on that being true forever. */
    const leaky = world({ binderMemberships: [
      { id: "mine", binderId: "A", goalId: "g1", filedAt: AT },
      { id: "theirs", binderId: "A", goalId: "gd", filedAt: AT }] });
    const own = projectForActor(leaky.get(), CASEY);
    eq(own.binderMemberships.length, 1, "the scope let something through");
    eq(own.binderMemberships[0].id, "mine", "the wrong row survived");
    const dana = projectForActor(leaky.get(), DANA);
    eq(dana.binderMemberships.length, 0, "a Collector saw a membership in another's binder");
    assert(projectForActor(st.get(), CASEY).binderMemberships.length === 1,
      "the owner stopped seeing their own");

    /* AND A ROW NAMING TWO OBJECTS, ONE OF THEM SOMEBODY ELSE'S. This is the
       case the filter first got wrong and this test first missed: it dispatched
       on `goalId` being set, so a row pairing Casey's binder and Casey's Goal
       with DANA'S copy was checked against the Goal owner only and went
       straight through — putting Dana's copy id on Casey's screen. An
       adversarial pass on the finished batch built the row by hand and read the
       id back. Such a row is refused by `fileObject` and by `validateWorld`
       (test [19b]); it is seeded here for exactly the reason the row above is,
       because a filter that reads half a row is relying on both of those being
       perfect forever. */
    const both = world({ binderMemberships: [
      { id: "m1", binderId: "A", goalId: "g1", collectorCopyId: "theirs", filedAt: AT }] });
    assert(!valid(both), "a both-named row validated, so the seed is not the hazard it claims");
    const leaked = JSON.stringify(projectForActor(both.get(), CASEY).binderMemberships);
    eq(leaked, "[]", `a row naming a stranger's copy was projected: ${leaked}`);
    assert(!leaked.includes("theirs"), "a stranger's copy id reached the owner's screen");
    /* And the mirror image: a stranger's Goal beside this Collector's copy. */
    const mirrored = world({ binderMemberships: [
      { id: "m1", binderId: "A", goalId: "gd", collectorCopyId: "keep", filedAt: AT }] });
    eq(JSON.stringify(projectForActor(mirrored.get(), CASEY).binderMemberships), "[]",
      "a row naming a stranger's Goal was projected");
    /* And a row naming NEITHER, which has no owner to check at all. */
    const neither = world({ binderMemberships: [{ id: "m1", binderId: "A", filedAt: AT }] });
    eq(JSON.stringify(projectForActor(neither.get(), CASEY).binderMemberships), "[]",
      "a row naming no object was projected on the strength of the binder alone");
  });

  test("[14] and a Trusted Partner receives none of it, including for a copy in a live deal", () => {
    /* The field-level rule is an explicit empty, and that is easy. The harder
       one is the ROW: a copy a partner's own submitted package names reaches
       them whatever its disposition says, and that is the path a previous batch
       got wrong. So the copy here is in a live deal AND filed. */
    const st = world({
      goals: [{ id: "g1", collectorId: "casey", canonicalCardId: "cc-z", tier: "primary",
        desired: { grade: "PSA 9" } }],
      inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-z", ask: 30,
        grade: "PSA 9", cert: "SHOP-1", photos: PHOTOS, archived: false }],
    });
    okv(x(st, CASEY, "fileObject", { binderId: "A", collectorCopyId: "sell" }), "file the copy");
    okv(x(st, CASEY, "fileObject", { binderId: "B", goalId: "g1" }), "file the goal");
    const oppId = okv(x(st, CASEY, "startOpportunity",
      { goalId: "g1", invId: "i1", amount: 26 }), "start");
    okv(x(st, TP, "acceptPrice", { oppId }), "agree");
    okv(x(st, CASEY, "proposeTradeSelection", { oppId, binderIds: ["sell"] }), "package");
    const theirs = projectForActor(st.get(), TP);
    eq(JSON.stringify(theirs.binderMemberships), "[]", "a membership crossed to a partner");
    eq(JSON.stringify(theirs.binders), "[]", "a binder crossed");
    eq(JSON.stringify(theirs.binderEntries), "[]", "an entry crossed");
    /* And not by any other route either — the whole body, searched. */
    const body = JSON.stringify(theirs);
    assert(!body.includes("Keepers") && !body.includes("Hunting"),
      "a binder name reached a partner");
    assert(!/"binderId":"A"|"binderId":"B"/.test(body), "a binder id reached a partner");
  });
});

/* ======================================================= D. the object's life */
describe("D. A home ends when the thing that had one does", () => {

  test("[15] removing a Goal takes its membership and nothing else", () => {
    const st = world();
    okv(x(st, CASEY, "fileObject", { binderId: "A", goalId: "g1" }), "goal");
    okv(x(st, CASEY, "fileObject", { binderId: "B", collectorCopyId: "keep" }), "copy");
    const before = entries(st);
    okv(x(st, CASEY, "removeGoal", { goalId: "g1" }), "stop looking");
    eq(homeOf(st, "goalId", "g1"), null, "the Goal's membership outlived the Goal");
    assert(homeOf(st, "collectorCopyId", "keep"), "the copy's home went with the Goal's");
    eq(entries(st), before, "the card-level row was touched");
    assert(valid(st), "the world stopped validating");
  });

  test("[16] removing a copy takes its membership and nothing else", () => {
    const st = world();
    okv(x(st, CASEY, "fileObject", { binderId: "A", goalId: "g1" }), "goal");
    okv(x(st, CASEY, "fileObject", { binderId: "B", collectorCopyId: "keep" }), "keep");
    okv(x(st, CASEY, "fileObject", { binderId: "B", collectorCopyId: "sell" }), "sell");
    const before = entries(st);
    okv(x(st, CASEY, "removeCollectorCopy", { copyId: "keep" }), "sell it");
    eq(homeOf(st, "collectorCopyId", "keep"), null, "the copy's membership outlived the copy");
    assert(homeOf(st, "collectorCopyId", "sell"), "the sibling copy's home went with it");
    assert(homeOf(st, "goalId", "g1"), "the Goal's home went with a copy's");
    eq(entries(st), before, "the card-level row was touched");
    assert(valid(st), "the world stopped validating");
  });

  test("[17] which is not the rule the salvage batch withdrew", () => {
    /* `pruneOrphanedMemberships` asked "does this CARD still mean anything to
       this Collector?" and destroyed curation when the answer turned no.
       Nothing here asks that. Casey keeps a Goal and two copies of one card,
       files only the Goal, and then loses both copies: the Goal's home is
       untouched, and so is the card's entry. */
    const st = world();
    okv(x(st, CASEY, "fileObject", { binderId: "A", goalId: "g1" }), "goal");
    const before = entries(st);
    okv(x(st, CASEY, "removeCollectorCopy", { copyId: "keep" }), "sell one");
    okv(x(st, CASEY, "removeCollectorCopy", { copyId: "sell" }), "sell the other");
    eq(homeOf(st, "goalId", "g1").binderId, "A", "losing every copy moved the Goal's home");
    eq(entries(st), before, "losing every copy un-filed the card");
    assert(valid(st), "the world stopped validating");
  });
});

/* ==================================================== E. the card-level rows */
describe("E. The rows that name a card are left exactly as they are", () => {

  test("[18] filing an object does not consume, convert or remove the card's row", () => {
    const st = world();
    const before = entries(st);
    okv(x(st, CASEY, "fileObject", { binderId: "A", goalId: "g1" }), "goal");
    okv(x(st, CASEY, "fileObject", { binderId: "B", collectorCopyId: "keep" }), "copy");
    okv(x(st, CASEY, "unfileObject", { goalId: "g1" }), "unfile");
    eq(entries(st), before, "the card-level row changed");
  });

  test("[19] and a card-level row is never an object's home", () => {
    /* THE RULE THE WHOLE TRANSITION RESTS ON. Binder A holds card cc-x as a
       card-level row, and Casey has a Goal and two copies of exactly that card.
       None of them is filed. "Which binder is this Goal in?" is answered by the
       memberships and by nothing else, so the answer is: none. */
    const st = world();
    eq(st.get().binderEntries.length, 1, "the fixture lost its legacy row");
    eq(homes(st).length, 0, "the fixture already had a membership");
    for (const [kind, id] of [["goalId", "g1"], ["collectorCopyId", "keep"],
      ["collectorCopyId", "sell"]]) {
      eq(homeOf(st, kind, id), null,
        `a card-level row answered for ${id} — exactly one candidate is not an answer`);
    }
    /* Not even when the card-level row is the only thing that could be meant. */
    const only = world({ goals: [{ id: "g1", collectorId: "casey", canonicalCardId: "cc-x",
      tier: "primary", desired: { grade: "PSA 9" } }], collectorCopies: [] });
    eq(homeOf(only, "goalId", "g1"), null, "one candidate was read as the answer");
    /* AND THE STRUCTURAL HALF, because the assertions above read the stored
       collection and would survive a fallback being added somewhere else. The
       two membership commands must not so much as look at the card-level rows:
       a fallback has to be written before it can be used, and this is where
       writing one fails. */
    const src = require("fs").readFileSync(
      path.join(ROOT, "domain/metyet-commands.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
    const bodyOf = (name) => {
      const from = src.indexOf(`${name}(state`);
      assert(from >= 0, `${name} is no longer in metyet-commands.js`);
      const rest = src.slice(from + 1);
      const next = rest.search(/\n {2}[A-Za-z]+\(state/);
      return next < 0 ? rest : rest.slice(0, next);
    };
    for (const command of ["fileObject", "unfileObject"]) {
      assert(!/binderEntries/.test(bodyOf(command)),
        `${command} reads or writes the card-level rows`);
    }
    for (const command of ["addBinderEntry", "removeBinderEntry"]) {
      assert(!/binderMemberships/.test(bodyOf(command)),
        `${command} reads or writes object memberships`);
    }
  });

  /* THE VALIDATOR RULES, EACH ONE NAMED. Added after an adversarial pass found
     that nine of the ten new rules in `metyet-world.js` had no assertion at
     all: the whole block could be deleted and every other test in this file
     still passed. That matters more here than in most places, because this
     batch's own argument for safety is "the command refuses that pair AND
     `validateWorld` refuses a world containing one" — a world can be assembled
     by an import, a repair script or a future command, and the validator is
     the only thing standing there. One assertion per rule, by code and path,
     so deleting any single rule fails exactly one line. */
  test("[19b] every new invariant is a rule the validator states, not a comment", () => {
    const M = (over) => world({ binderMemberships: [{ id: "m1", binderId: "A", goalId: "g1",
      filedAt: AT, ...over }] });
    const first = (st) => {
      const r = validateWorld(st.get());
      assert(!r.ok, "the world validated");
      return r.errors[0];
    };
    const expect = (st, codeWanted, pathEnds, why) => {
      const e = first(st);
      eq(e.code, codeWanted, `${why}: ${JSON.stringify(e)}`);
      assert(e.path.endsWith(pathEnds), `${why}: path was ${e.path}`);
    };

    expect(M({ goalId: "g1", collectorCopyId: "keep" }), "ref.ambiguous", ".goalId",
      "a row naming both an object and a copy");
    expect(M({ goalId: null }), "ref.missing", ".goalId", "a row naming neither");
    expect(M({ goalId: "nope" }), "ref.unknown", ".goalId", "a Goal nobody minted");
    expect(M({ goalId: null, collectorCopyId: "nope" }), "ref.unknown", ".collectorCopyId",
      "a copy nobody minted");
    expect(M({ binderId: "nope" }), "ref.unknown", ".binderId", "a binder nobody minted");
    expect(M({ id: null }), "id.missing", ".id", "a membership with no id");
    expect(M({ filedAt: 1759276800000 }), "field.invalid", ".filedAt",
      "a filedAt that is not a time");

    /* The two-rows rules need two rows, so they are built out rather than
       patched. `id.duplicate` is reported at `.binderId` for a second home and
       at `.id` for a repeated membership id — the same code as the card-level
       duplicate-pair rule uses at `.canonicalCardId`, which is this file's
       settled vocabulary for "this appears twice and may not"; the PATH is what
       says which. Both are asserted, so neither can be deleted. */
    expect(world({ binderMemberships: [
      { id: "m1", binderId: "A", goalId: "g1", filedAt: AT },
      { id: "m1", binderId: "B", goalId: null, collectorCopyId: "keep", filedAt: AT }] }),
    "id.duplicate", ".id", "two memberships sharing one id");
    expect(world({ binderMemberships: [
      { id: "m1", binderId: "A", goalId: "g1", filedAt: AT },
      { id: "m2", binderId: "B", goalId: "g1", filedAt: AT }] }),
    "id.duplicate", ".binderId", "one Goal with two homes");
    expect(world({ binderMemberships: [
      { id: "m1", binderId: "A", goalId: null, collectorCopyId: "keep", filedAt: AT },
      { id: "m2", binderId: "B", goalId: null, collectorCopyId: "keep", filedAt: AT }] }),
    "id.duplicate", ".binderId", "one copy with two homes");

    /* Owner mismatch is asserted by [12]; named here so the set is complete and
       a reader can see that nothing in the block is unaccounted for. */
    assert(!valid(world({ binderMemberships: [
      { id: "m1", binderId: "A", goalId: "gd", filedAt: AT }] })), "cross-owner");

    /* AND THE SAME ROWS, SAID PROPERLY, VALIDATE. Without this every assertion
       above would also pass if the validator simply refused every membership. */
    const ok1 = world({ binderMemberships: [
      { id: "m1", binderId: "A", goalId: "g1", filedAt: AT },
      { id: "m2", binderId: "B", collectorCopyId: "keep", filedAt: AT },
      { id: "m3", binderId: "OLD", collectorCopyId: "sell", filedAt: null }] });
    assert(valid(ok1), `a correct world was refused: ${JSON.stringify(validateWorld(ok1.get()).errors)}`);
  });

  test("[20] a world of purely card-level rows still loads, and the validator has no opinion", () => {
    /* THE COMPATIBILITY PIN. `validateWorld` runs on LOAD as well as before
       save, so a rule true only of worlds written after this batch would turn
       every stored one into a 500 on the next read rather than a refusal. This
       repository has been caught by that three times. Every rule section A, B
       and C rely on is vacuous here — there are no memberships to fail one. */
    /* No `binderMemberships` override: the default fixture already supplies an
       empty one, and passing `[]` here read as though it were doing something. */
    const legacy = world();
    assert(valid(legacy), "a world of card-level rows stopped loading");
    eq(JSON.stringify(validateWorld(legacy.get()).errors), "[]", "the validator complained");
    /* And a world from before the collection existed at all. */
    const before = { ...legacy.get() };
    delete before.binderMemberships;
    assert(validateWorld(before).ok, "a world with no memberships collection stopped loading");
    /* The card-level rules themselves are untouched: a duplicate pair is still
       refused, and an entry still has to name a card. */
    const dup = world({ binderEntries: [{ binderId: "A", canonicalCardId: "cc-x", addedAt: AT },
      { binderId: "A", canonicalCardId: "cc-x", addedAt: AT }] });
    assert(!valid(dup), "the card-level duplicate rule went missing");
    const cardless = world({ binderEntries: [{ binderId: "A", addedAt: AT }] });
    assert(!valid(cardless), "an entry naming no card became valid");
  });

  test("[21] and the card-level commands are untouched", () => {
    const st = world();
    okv(x(st, CASEY, "addBinderEntry", { binderId: "B", canonicalCardId: "cc-y" }), "file a card");
    eq(st.get().binderEntries.length, 2, "the card was not filed");
    eq(homes(st).length, 0, "filing a card made a membership");
    okv(x(st, CASEY, "removeBinderEntry", { binderId: "B", canonicalCardId: "cc-y" }), "unfile");
    eq(st.get().binderEntries.length, 1, "the card was not unfiled");
  });
});

/* ======================================================= F. a binder put away */
describe("F. A binder that has been put away", () => {

  test("[22] takes nothing new, gives up nothing it holds, and lets go on request", () => {
    const st = world();
    okv(x(st, CASEY, "fileObject", { binderId: "A", goalId: "g1" }), "file");
    eq(code(x(st, CASEY, "fileObject", { binderId: "OLD", goalId: "g1" })),
      D.REFUSE.binderArchived, "a put-away binder took a new thing");
    eq(homeOf(st, "goalId", "g1").binderId, "A", "the refusal moved the home anyway");
    /* Archiving the binder a thing already lives in changes nothing about it. */
    okv(x(st, CASEY, "setBinderArchived", { binderId: "A", archived: true }), "put away");
    const m = homeOf(st, "goalId", "g1");
    assert(m && m.binderId === "A", "putting a binder away emptied it");
    /* And a Collector may always take a thing out of one. */
    okv(x(st, CASEY, "unfileObject", { goalId: "g1" }), "take it out");
    eq(homeOf(st, "goalId", "g1"), null, "a thing could not be taken out of a put-away binder");
    assert(valid(st), "the world stopped validating");
  });
});

/* ========================================= G. the binder made in the same Save */
describe("G. A binder made in the same Save is one you can file into", () => {
  const load = (rel) => {
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
  const SPEC = load("client/collector/CardSpecification.jsx");

  /* The same switch `SignIn.jsx` uses for these step kinds. */
  const send = (st, step, canonicalCardId) => {
    switch (step.kind) {
      case "make-binder": return x(st, CASEY, "createBinder", { name: step.name });
      /* BATCH 3B-1. The object-level pair, mapped exactly as `SignIn.jsx` maps
         them, so a plan test and the real entrance cannot disagree about what a
         step means. A kind this switch does not know is still a refusal rather
         than a guess — which is why it had to learn these two rather than
         silently answering `command-unavailable` to the batch's own steps. */
      case "file-object": return x(st, CASEY, "fileObject",
        { binderId: step.binderId, goalId: step.goalId, collectorCopyId: step.collectorCopyId });
      case "unfile-object": return x(st, CASEY, "unfileObject",
        { goalId: step.goalId, collectorCopyId: step.collectorCopyId });
      case "start-looking": return x(st, CASEY, "addGoal",
        { canonicalCardId, tier: step.tier, desired: step.desired });
      case "record-copy": return x(st, CASEY, "addCollectorCopy",
        { copy: { canonicalCardId, ...step.copy } });
      case "offering": return x(st, CASEY, "setCollectorCopyOffered",
        { copyId: step.copyId, offered: step.offered });
      case "keeping": return x(st, CASEY, "setCollectorCopyKept",
        { copyId: step.copyId, keeping: step.keeping });
      case "file": return x(st, CASEY, "addBinderEntry", { binderId: step.binderId, canonicalCardId });
      case "unfile": return x(st, CASEY, "removeBinderEntry",
        { binderId: step.binderId, canonicalCardId });
      default: return { ok: false, refused: "command-unavailable" };
    }
  };

  /* `swallowValue` answers a step with a bare success and no minted id, which
     is what the transport would do if it ever stopped forwarding `value`. It is
     not reachable through the real store today — `production-store.js` forwards
     it and `createBinder` returns the id — so it is injected here rather than
     left as a path nothing covers. See [23b]. */
  const panel = (st, { failOnce = null, swallowValue = null, stale = false } = {}) => {
    const sent = [];
    let pending = failOnce;
    const seen = () => {
      const w = st.get();
      /* SCOPED THE WAY THE SERVER SCOPES IT (Batch 3B-1). This spread the raw
         world and filtered three collections by hand, which left
         `binderMemberships` UNSCOPED — including another Collector's rows. That
         was harmless while a binder held cards; with per-object homes it means a
         panel test could pass against a projection production never produces.
         The real projection is the honest answer. */
      const mine = projectForActor(w, CASEY);
      return { ...mine, catalog: [], partners: [] };
    };
    const onCommit = async (step, canonicalCardId) => {
      /* THE OBJECT AS DISPATCHED, NOT ITS JSON. `JSON.parse(JSON.stringify(x))`
         drops any own key whose value is `undefined`, so `[23]`'s "no handle
         reached the command layer" could not have failed on a key that was
         present and undefined — which is exactly what the panel used to send.
         Recorded live, with the key list captured beside it. */
      sent.push({ ...step, __keys: Object.keys(step) });
      if (pending && step.kind === pending) { pending = null; return { ok: false, refused: "not-found" }; }
      const answer = send(st, step, canonicalCardId);
      if (swallowValue && step.kind === swallowValue) return { ok: answer.ok !== false };
      return answer;
    };
    let r;
    let closed = false;
    const element = () => React.createElement(SPEC.default, {
      card: { canonicalCardId: "cc-w", cardName: "Mudkip" },
      state: seen(), onCommit, onClose: () => { closed = true; },
    });
    TR.act(() => { r = TR.create(element()); });
    /* `stale` HOLDS THE PROJECTION STILL BETWEEN PRESSES, which is a real race
       and not a contrivance: `commit` recomputes its plan from the `state`
       PROP, and the parent's refresh is a round trip. A person who presses Save
       again the moment the refusal appears can get there first. */
    const refresh = () => { if (!stale) TR.act(() => { r.update(element()); }); };
    const button = (label) => {
      const b = r.root.findAll((n) => n.type === "button"
        && String(n.children).includes(label))[0];
      assert(b, `no "${label}" button`);
      return b;
    };
    return {
      sent,
      closed: () => closed,
      text: () => JSON.stringify(r.toJSON()),
      name: (value) => {
        const i = r.root.findAll((n) => n.type === "input"
          && n.props["aria-label"] === "New binder name")[0];
        TR.act(() => { i.props.onChange({ target: { value } }); });
      },
      press: (label) => { TR.act(() => { button(label).props.onClick(); }); },
      /* THE HOME CONTROLS, BY WHAT THEY ARE (Batch 3B-1). Addressed by their
         accessible label, never by position among every select on screen —
         which is also what makes the label worth having. */
      homes: () => r.root.findAll((n) => n.type === "select")
        .filter((n) => /^Binder/.test(String(n.props["aria-label"] || ""))),
      home: (value, nth = 0) => {
        const all = r.root.findAll((n) => n.type === "select")
          .filter((n) => /^Binder/.test(String(n.props["aria-label"] || "")));
        assert(all[nth], `no home control #${nth} — found ${all.length}`);
        TR.act(() => { all[nth].props.onChange({ target: { value } }); });
      },
      grade: (value, nth = 0) => {
        const all = r.root.findAll((n) => n.type === "select")
          .filter((n) => !/^Binder/.test(String(n.props["aria-label"] || "")));
        assert(all[nth], `no grade control #${nth}`);
        TR.act(() => { all[nth].props.onChange({ target: { value } }); });
      },
      save: async () => {
        await TR.act(async () => { await button("Save").props.onClick(); });
        refresh();
      },
    };
  };

  test("[23] it is created AND filed into, in one Save", async () => {
    /* THE DEFECT THIS FIXES. `answers.newBinders` held names, `answers.binders`
       held ids, and nothing joined them — so the plan made the binder and filed
       nothing into it, and the panel closed without a word.
       RE-PINNED (Batch 3B-1): what goes into the new binder is a THING, so the
       person says what the card means first and the home follows. The binder is
       still created and still filled, in one Save, which is the claim. */
    const st = world({ binders: [], binderEntries: [], binderMemberships: [],
      goals: [], collectorCopies: [] });
    const p = panel(st);
    p.name("Mudkips"); p.press("Add binder");
    p.press("Actively hunting"); p.grade("PSA 9");
    eq(p.homes().length, 1, "the hunt has no home control");
    /* The new binder is offered by its client key; pick it by its label, never
       by position and never by its name reaching the command. */
    const option = p.homes()[0].props.children.flat(2)
      .find((o) => o && o.props && /Mudkips/.test(String(o.props.children)));
    assert(option, `the new binder was not offered: ${p.text().slice(0, 400)}`);
    p.home(option.props.value);
    await p.save();
    eq(st.get().binders.length, 1, "the binder was not made");
    eq(st.get().binderEntries.length, 0, "the panel created a card-level row");
    eq(st.get().binderMemberships.length, 1,
      `the hunt was not filed into the new binder: ${JSON.stringify(st.get().binderMemberships)}`);
    eq(st.get().binderMemberships[0].binderId, st.get().binders[0].id, "it was filed somewhere else");
    eq(st.get().binderMemberships[0].goalId, st.get().goals[0].id, "something else was filed");
    /* And nothing downstream ever saw a handle — the step that arrived carried
       a real, minted binder id and a real, minted Goal id. */
    const filed = p.sent.filter((s) => s.kind === "file-object");
    eq(filed.length, 1, `the panel sent ${JSON.stringify(p.sent.map((x) => x.kind))}`);
    eq(filed[0].binderId, st.get().binders[0].id, "the filing step named something else");
    eq(filed[0].goalId, st.get().goals[0].id, "the filing step named no thing");
    assert(!filed[0].__keys.includes("binderDraftId"),
      `a client handle reached the command layer: ${filed[0].__keys.join(",")}`);
    assert(!filed[0].__keys.includes("goalDraftId"),
      `a client handle reached the command layer: ${filed[0].__keys.join(",")}`);
    /* And not as a key holding `undefined` either, which is how it passed this
       assertion before: a spread with `binderDraftId: undefined` leaves the own
       property in place, and every `make-binder` went out carrying a stray
       `binderId: undefined` the same way. */
    for (const st2 of p.sent) {
      assert(!st2.__keys.includes("binderDraftId"),
        `${st2.kind} carried a handle: ${st2.__keys.join(",")}`);
      assert(st2.kind === "make-binder" ? !st2.__keys.includes("binderId") : true,
        "make-binder was dispatched carrying a binderId");
    }
  });

  test("[23b] and a Save that cannot learn the new binder's id says so rather than closing", async () => {
    /* THE SILENT SKIP, WHICH WAS THE DEFECT WEARING A DIFFERENT HAT. `commit`
       resolves a filing step's handle from what `make-binder` answered, and if
       that answer carried no id the step used to be skipped with a `continue`
       whose comment claimed the only cause was an earlier refusal — which
       cannot happen, because a refusal returns out of the loop. The reachable
       cause is an answer with no `value`, and skipping on it reproduces exactly
       what this batch fixed: binder made, card not filed, panel closes saying
       nothing, next Save makes a second binder. Not reachable through the real
       store today, so the harness swallows the value; the point is that the
       panel must not treat a missing id as success. */
    const st = world({ binders: [], binderEntries: [], binderMemberships: [],
      goals: [], collectorCopies: [] });
    const p = panel(st, { swallowValue: "make-binder" });
    p.name("Mudkips"); p.press("Add binder");
    p.press("Actively hunting"); p.grade("PSA 9");
    const option = p.homes()[0].props.children.flat(2)
      .find((o) => o && o.props && /Mudkips/.test(String(o.props.children)));
    p.home(option.props.value);
    await p.save();
    eq(st.get().binders.length, 1, "the binder was not made");
    eq(st.get().binderMemberships.length, 0, "the hunt was filed, so this test is about nothing");
    assert(!p.closed(), "the panel closed on a Save that did not do what was asked");
    assert(/not yet|could not|try again|Something/i.test(p.text()),
      `the panel reported nothing: ${p.text().slice(0, 400)}`);
  });

  test("[24] and a retry does not make a second binder of the same name", async () => {
    /* `make-binder` used to be re-sent on every press, because nothing recorded
       that it had already happened. Not fixed by de-duplicating on the NAME —
       two binders may share one, and a name cannot say which one was made — but
       by adopting the minted id, exactly as a new copy's is adopted. */
    const st = world({ binders: [], binderEntries: [], binderMemberships: [],
      goals: [], collectorCopies: [] });
    const p = panel(st, { failOnce: "file-object" });
    p.name("Mudkips"); p.press("Add binder");
    p.press("Actively hunting"); p.grade("PSA 9");
    const option = p.homes()[0].props.children.flat(2)
      .find((o) => o && o.props && /Mudkips/.test(String(o.props.children)));
    p.home(option.props.value);
    await p.save();
    eq(st.get().binders.length, 1, "the first Save did not make the binder");
    eq(st.get().goals.length, 1, "the first Save did not make the Goal");
    eq(st.get().binderMemberships.length, 0, "the fixture did not refuse the filing");
    await p.save();
    eq(st.get().binders.length, 1,
      `the retry made a second binder: ${JSON.stringify(st.get().binders.map((b) => b.name))}`);
    /* AND NOT A SECOND GOAL EITHER (Batch 3B-1). `addGoal` is the one step in
       this plan that is neither idempotent nor content-addressable: a retry
       that re-sent it would collect `duplicate-goal` and the person would read
       a refusal for work that had already succeeded. `adopt` records the Goal
       it made, which is what stops it. */
    eq(st.get().goals.length, 1,
      `the retry made a second Goal: ${JSON.stringify(st.get().goals.map((g) => g.id))}`);
    eq(st.get().binderMemberships.length, 1, "the retry did not finish the filing");
    eq(st.get().binderMemberships[0].goalId, st.get().goals[0].id, "it filed something else");
    eq(p.sent.filter((s) => s.kind === "make-binder").length, 1,
      "the retry re-sent make-binder");
    eq(p.sent.filter((s) => s.kind === "start-looking").length, 1,
      "the retry re-sent start-looking");
  });

  test("[24b] and a retry does not make a second Goal, even before the projection catches up", () => {
    /* THE ONE STEP IN THE PLAN THAT IS NEITHER IDEMPOTENT NOR
       CONTENT-ADDRESSABLE. `createBinder` can be re-sent and produces a second
       binder; `addCollectorCopy` likewise; both are fixed by adopting the
       minted id. `addGoal` is different: a second one is REFUSED
       `duplicate-goal`, so a retry that re-sent it would show a person a
       refusal for work that had already succeeded.

       The projection normally settles between presses and `planFrom` finds the
       Goal there, so this is tested with the projection held STILL — which is
       the real race: `commit` reads the `state` prop, the parent's refresh is a
       round trip, and a person who presses Save again the instant the message
       appears can beat it. `adopt` recording the Goal it made is what closes
       it. */
    const st = world({ binders: [], binderEntries: [], binderMemberships: [],
      goals: [], collectorCopies: [] });
    const p = panel(st, { failOnce: "file-object", stale: true });
    p.name("Mudkips"); p.press("Add binder");
    p.press("Actively hunting"); p.grade("PSA 9");
    const option = p.homes()[0].props.children.flat(2)
      .find((o) => o && o.props && /Mudkips/.test(String(o.props.children)));
    p.home(option.props.value);
    return (async () => {
      await p.save();
      eq(st.get().goals.length, 1, "the first Save did not make the Goal");
      eq(st.get().binderMemberships.length, 0, "the fixture did not refuse the filing");
      await p.save();
      eq(p.sent.filter((x) => x.kind === "start-looking").length, 1,
        `the retry re-sent start-looking against a stale projection: ${
          JSON.stringify(p.sent.map((x) => x.kind))}`);
      eq(st.get().goals.length, 1, "the retry made a second Goal");
      /* AND IT STILL FINISHES THE WORK THAT WAS LEFT, naming the Goal it made
         rather than one it would have had to look up. */
      eq(st.get().binderMemberships.length, 1, "the retry did not finish the filing");
      eq(st.get().binderMemberships[0].goalId, st.get().goals[0].id, "it filed something else");
    })();
  });

  test("[24c] a binder put away while the panel is open stops being a destination", () => {
    /* ARCHIVING EVICTS NOTHING AND TAKES NOTHING NEW, so a home chosen before
       the binder was put away is in an awkward position: the answer still names
       it, and `fileObject` would refuse it.

       The plan says NOTHING for that thing rather than either sending a
       guaranteed refusal or quietly reading the answer as Unfiled — because
       "leave it there" is what the person said, and emptying a binder on their
       behalf would be inventing a decision. */
    const st = world({ binderMemberships: [] });
    const state = () => projectForActor(st.get(), CASEY);
    const answers = { newBinders: [], want: "primary", goalHome: null, madeGoal: null,
      desired: { grade: "PSA 9", condition: "" },
      copies: [{ id: "keep", grade: "PSA 9", condition: "", cert: "K1", market: "",
        disposition: "keeping", removed: false, home: "A" }] };
    /* While A is live: one filing. */
    eq(SPEC.planFrom(state(), "cc-x", answers).steps.map((k) => k.kind).join(","),
      "file-object", "the fixture does not file anything");
    /* A is put away between the panel opening and Save. */
    okv(x(st, CASEY, "setBinderArchived", { binderId: "A", archived: true }), "put away");
    eq(SPEC.planFrom(state(), "cc-x", answers).steps.length, 0,
      "the panel sent a filing into a binder that has been put away");
    /* AND A THING ALREADY IN AN ARCHIVED BINDER IS NOT QUIETLY TAKEN OUT. */
    const filed = world();
    okv(x(filed, CASEY, "fileObject", { binderId: "A", collectorCopyId: "keep" }), "file");
    okv(x(filed, CASEY, "setBinderArchived", { binderId: "A", archived: true }), "put away");
    const stay = { ...answers, copies: [{ ...answers.copies[0], home: "A" }] };
    eq(SPEC.planFrom(projectForActor(filed.get(), CASEY), "cc-x", stay).steps.length, 0,
      "re-stating a home in a put-away binder sent a refusable filing");
    /* Choosing Unfiled DOES take it out, which the domain allows from an
       archived binder for exactly this reason. */
    const out = { ...answers, copies: [{ ...answers.copies[0], home: null }] };
    eq(SPEC.planFrom(projectForActor(filed.get(), CASEY), "cc-x", out).steps
      .map((k) => k.kind).join(","), "unfile-object",
    "a thing could not be taken out of a put-away binder");
  });

  test("[25] every minting step's id is recorded, not only a copy's", () => {
    /* The generalisation itself, read off the source: the binding used to be
       `step.kind === "record-copy" && step.draftId` and nothing else, so a
       Goal's minted id and a binder's were returned and dropped. */
    const src = require("fs").readFileSync(
      path.join(ROOT, "client/collector/CardSpecification.jsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ");
    assert(!/step\.kind === "record-copy" && step\.draftId/.test(src),
      "the minted-id binding is special-cased on one step kind again");
    /* STATED AS THE PROPERTY, NOT AS THE OLD SPELLING. The line above only
       rules out the exact text the defect had; these two say what must be true
       of any spelling. The binding must mention no step KIND at all except to
       say which key carries the handle, and nothing may look a binder up by
       anything on `newBinders` other than its position. */
    const bind = (src.match(/const draftId = [^;]+;/) || [""])[0];
    assert(/draftId/.test(bind) && !/"record-copy"|"offering"|"file"/.test(bind),
      `the binding names a step kind: ${bind}`);
    assert(!/newBinders\.[a-zA-Z]*(some|includes|find|indexOf|filter\([^)]*===)/.test(src),
      "a binder is being identified by its name somewhere");
    assert(/newBinders\.entries\(\)|newBinders\.length/.test(src),
      "the new binders are no longer addressed by position, so the line above asserts nothing");
  });
});

/* ============================================ H. what the database enforces */
describe("H. What the schema itself refuses", () => {
  let pg = null;
  const db = async () => {
    if (!pg) pg = new PGlite();
    await pg.exec("drop schema if exists metyet cascade; "
      + "drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
    const handle = fromPGlite(pg);
    await migrate(handle);
    /* The Goal and the copy name their card the LEGACY way, which needs one
       small row rather than three catalog ones. This section is about the
       membership table; how its objects name their cards is not its subject. */
    await pg.exec(`
      insert into metyet.catalog_cards (id, ord, attrs)
        values ('k1', 0, '{"name":"Mudkip"}');
      insert into metyet.collectors (id, ord, attrs) values ('casey', 0, '{"name":"Casey"}');
      insert into metyet.binders (id, ord, collector_id, attrs)
        values ('A', 0, 'casey', '{"name":"A","archivedAt":null}'),
               ('B', 1, 'casey', '{"name":"B","archivedAt":null}');
      insert into metyet.goals (id, ord, collector_id, card_id, attrs)
        values ('g1', 0, 'casey', 'k1', '{"tier":"primary","cardId":"k1"}');
      insert into metyet.collector_copies (id, ord, collector_id, card_id, attrs)
        values ('b1', 0, 'casey', 'k1', '{"offered":true,"cardId":"k1"}');
    `);
    /* One canonical card through the catalog's own door, because a card-level
       binder entry has a foreign key to it and section E's point is that such a
       row survives this batch untouched. Through the repository rather than by
       hand, so this fixture cannot drift from the catalog's schema. */
    const catalog = createCatalogRepository(handle, { newId: (p2 = "") => `${p2}1` });
    const { expansionId } = await catalog.putExpansion(
      { game: "pokemon", code: "base1", name: "Base", printedTotal: 102 });
    const { cardContextId } = await catalog.putCardContext(
      { game: "pokemon", expansionId, collectorNumber: "4", cardName: "Charizard" });
    const { canonicalCardId } = await catalog.putCanonicalCard(
      { cardContextId, printRun: "unlimited", finish: "holofoil" });
    return { pg, handle, canonicalCardId };
  };
  const insert = async (pgh, cols) => {
    const { id, binder, goal, copy } = cols;
    try {
      /* THE MIRROR KEYS GO IN `attrs` TOO. A nullable reference is a mirror,
         and `fromRows` requires the column and the attrs key to agree — a row
         with `goal_id` set and no `goalId` in `attrs` is reference drift, which
         makes the whole world unloadable rather than one row wrong. These rows
         exist to be refused by the DDL, so they never reach a load; writing
         them correctly anyway is what stops this helper from teaching the wrong
         shape to the next person who copies it. */
      const mirrors = JSON.stringify({ filedAt: "t",
        ...(goal ? { goalId: goal } : {}), ...(copy ? { collectorCopyId: copy } : {}) });
      await pgh.exec(`insert into metyet.binder_memberships
        (id, ord, binder_id, goal_id, collector_copy_id, attrs) values
        ('${id}', 0, '${binder}', ${goal ? `'${goal}'` : "null"},
         ${copy ? `'${copy}'` : "null"}, '${mirrors}')`);
      return null;
    } catch (e) { return String(e.message || e); }
  };

  test("[26] exactly one object, enforced by the table", async () => {
    const { pg: p } = await db();
    assert(/binder_memberships_names_one_object/.test(
      await insert(p, { id: "m1", binder: "A", goal: "g1", copy: "b1" }) || ""),
    "a row naming both was accepted");
    assert(/binder_memberships_names_one_object/.test(
      await insert(p, { id: "m2", binder: "A" }) || ""),
    "a row naming neither was accepted");
    eq(await insert(p, { id: "m3", binder: "A", goal: "g1" }), null, "a goal row was refused");
    eq(await insert(p, { id: "m4", binder: "A", copy: "b1" }), null, "a copy row was refused");
  });

  test("[27] one home per object, and the foreign keys hold", async () => {
    const { pg: p } = await db();
    await insert(p, { id: "m1", binder: "A", goal: "g1" });
    assert(/one_home_per_goal/.test(await insert(p, { id: "m2", binder: "B", goal: "g1" }) || ""),
      "a Goal was given a second home");
    await insert(p, { id: "m3", binder: "A", copy: "b1" });
    assert(/one_home_per_copy/.test(await insert(p, { id: "m4", binder: "B", copy: "b1" }) || ""),
      "a copy was given a second home");
    assert(await insert(p, { id: "m5", binder: "nope", goal: "g1" }), "an unknown binder was accepted");
    assert(await insert(p, { id: "m6", binder: "A", goal: "nope" }), "an unknown goal was accepted");
  });

  test("[28] and a MOVE survives the repository's own write order", async () => {
    /* THE FINDING THAT CHOSE THIS WHOLE DESIGN, and an honest note about which
       half of the answer is doing the work.

       The repository writes a collection as one batched upsert keyed on that
       collection's primary key. `binder_entries` keys on a POSITIONAL `ord`
       recomputed from the array index, so a reordered array renumbers rows as
       the statement progresses, and a non-deferrable unique index sees a
       transient duplicate mid-statement — a Collector moving one Goal between
       binders got a 503. That was measured, and it is why the object columns
       are not in that table.

       This table keys on a MINTED id, so a reorder addresses the same rows by
       the same keys and there is no transient state to trip over. That is what
       removes the hazard. The deferrable uniqueness is defence in depth — it
       costs nothing and it keeps the rule true if anything ever reintroduces
       positional keying — and a mutation that makes it a non-deferrable partial
       index does NOT fail this test. That is recorded rather than hidden: the
       stable id is the load-bearing half. */
    const { handle } = await db();
    const repository = createWorldRepository(handle);
    const base = await repository.loadWorld();
    const withTwo = { ...base, binderMemberships: [
      { id: "m1", binderId: "A", goalId: "g1", filedAt: "t" },
      { id: "m2", binderId: "A", collectorCopyId: "b1", filedAt: "t" }] };
    await repository.saveWorld(withTwo);
    /* The move, with the array deliberately reordered around it — the shape a
       naive filter-then-push produces, and the one that used to fail. */
    const moved = { ...base, binderMemberships: [
      { id: "m2", binderId: "A", collectorCopyId: "b1", filedAt: "t" },
      { id: "m1", binderId: "B", goalId: "g1", filedAt: "t2" }] };
    await repository.saveWorld(moved);
    const back = await repository.loadWorld();
    const m1 = back.binderMemberships.find((m) => m.id === "m1");
    eq(m1.binderId, "B", "the move did not land");
    eq(m1.filedAt, "t2", "the moment was not refreshed");
    eq(back.binderMemberships.length, 2, "the move lost a row");
  });

  test("[29] a legacy row round-trips unchanged, and the two tables do not meet", async () => {
    const { handle, canonicalCardId } = await db();
    const repository = createWorldRepository(handle);
    const base = await repository.loadWorld();
    await repository.saveWorld({ ...base,
      binderEntries: [{ binderId: "A", canonicalCardId, addedAt: "t" }],
      binderMemberships: [{ id: "m1", binderId: "A", goalId: "g1", filedAt: "t" }] });
    const back = await repository.loadWorld();
    eq(JSON.stringify(back.binderEntries),
      JSON.stringify([{ binderId: "A", canonicalCardId, addedAt: "t" }]),
      "the card-level row changed shape");
    /* And the membership keeps exactly its own keys — the nullable references
       are MIRRORS, so the column that is NULL leaves no `goalId: null` behind. */
    eq(JSON.stringify(Object.keys(back.binderMemberships[0]).sort()),
      JSON.stringify(["binderId", "filedAt", "goalId", "id"]),
      `a membership came back as ${JSON.stringify(back.binderMemberships[0])}`);
  });

  test("[30] a reverted build reads the stored world, and can still delete a filed Goal", async () => {
    /* THE ROLLBACK, VERIFIED RATHER THAN ASSERTED — AND THE FIRST VERSION OF
       THIS TEST WAS VACUOUS. It snapshotted the world BEFORE writing the
       membership and validated the snapshot, so it could not have observed the
       stored row at all; an adversarial pass on the finished batch caught it,
       and caught the defect it was supposed to catch (below) at the same time.
       Reverting the code while the migration stays applied must not take the
       product down, and `loadWorld` runs on every command, so "down" means
       every user. Driven by building a reader from the PRE-3A spec list, so
       "an older build" is the actual set of tables an older build knows. */
    const { handle, pg: p } = await db();
    const repository = createWorldRepository(handle);
    const base = await repository.loadWorld();
    await repository.saveWorld({ ...base,
      binderMemberships: [{ id: "m1", binderId: "A", goalId: "g1", filedAt: "t" }] });
    const rows = await p.query("select count(*)::int as n from metyet.binder_memberships");
    eq(rows.rows[0].n, 1, "the membership was not stored");

    /* READING. The world as it is NOW, with the row in the database — that is
       the whole correction: the first version validated a snapshot taken
       before the save, which no amount of reasoning about it could make
       observe the stored row. An older build's reader differs from this one in
       exactly one way, that its spec list has no entry for the new table, so
       the world it assembles is this one minus that key and identical
       everywhere else. Both halves of that are asserted rather than assumed. */
    assert(TABLES.some((t) => t.collection === "binderMemberships"),
      "the new table has no spec, so this test is about nothing");
    const now = await repository.loadWorld();
    eq(now.binderMemberships.length, 1, "the stored row is not in the loaded world");
    const asOld = { ...now };
    delete asOld.binderMemberships;
    eq(Object.keys(now).length, Object.keys(asOld).length + 1,
      "an old build differs by more than the one collection");
    assert(validateWorld(asOld).ok,
      `a reverted build could not load the world: ${JSON.stringify(validateWorld(asOld).errors)}`);
    eq(JSON.stringify(asOld.binderEntries), JSON.stringify(base.binderEntries),
      "the old reader saw different card-level rows");

    /* WRITING, WHICH IS THE HALF THIS TEST USED TO MISS ENTIRELY. A reverted
       build does not run the cascade in `removeGoal`, so it issues a bare
       DELETE on `goals` and leaves the membership behind. With the object
       foreign keys as NO ACTION that DELETE was refused at COMMIT — after the
       write had returned, so a 500 rather than a refusal — and the owner of
       that Goal could never press "No longer looking" again until the code went
       forward. `on delete cascade` in 0014 is why this now passes. */
    await p.exec("begin; delete from metyet.goals where id = 'g1'; commit");
    const left = await p.query("select count(*)::int as n from metyet.binder_memberships");
    eq(left.rows[0].n, 0, "the membership outlived the object it was the home of");
    const afterDelete = { ...(await repository.loadWorld()) };
    delete afterDelete.binderMemberships;
    assert(validateWorld(afterDelete).ok,
      `the world an old build reads after its own delete is invalid: ${
        JSON.stringify(validateWorld(afterDelete).errors)}`);

    /* AND THE SAME FOR A COPY, BECAUSE IT IS A SECOND FOREIGN KEY AND NOT THE
       SAME ONE. Removing the cascade from the copy key passed this test while
       only the Goal half existed, which is the whole reason the two halves are
       written out rather than argued from symmetry. A sale is the common way a
       copy leaves, and `removeCollectorCopy` is what a reverted build would not
       be running. */
    await repository.saveWorld({ ...(await repository.loadWorld()),
      binderMemberships: [{ id: "m2", binderId: "A", collectorCopyId: "b1", filedAt: "t" }] });
    eq((await p.query("select count(*)::int as n from metyet.binder_memberships")).rows[0].n, 1,
      "the copy's membership was not stored");
    await p.exec("begin; delete from metyet.collector_copies where id = 'b1'; commit");
    eq((await p.query("select count(*)::int as n from metyet.binder_memberships")).rows[0].n, 0,
      "the membership outlived the copy it was the home of");
  });
});

/* ================= J. the Collector experience, driven end to end (3B-1) */
describe("J. What a Collector sees and does", () => {
  /* The real card list, built and mounted over the real projection. */
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
  const COLLECTION = build("client/collector/sections/Collection.jsx");

  const show = (st, binderId) => {
    const out = [];
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (!n || typeof n !== "object") return;
      for (const c of n.children || []) { if (typeof c === "string") out.push(c); else walk(c); }
    };
    let r;
    TR.act(() => {
      r = TR.create(React.createElement(COLLECTION.default, {
        state: projectForActor(st.get(), CASEY),
        view: { kind: "binder", binderId },
        /* The card captions, supplied rather than fetched, in the shape the
           hook returns — so this test is about the rendering and not about the
           catalogue. */
        descriptions: { described: {
          "cc-x": { canonicalCardId: "cc-x", cardName: "Charizard",
            expansionName: "Base", collectorNumber: "4" },
          "cc-y": { canonicalCardId: "cc-y", cardName: "Mudkip" },
          "cc-z": { canonicalCardId: "cc-z", cardName: "Pikachu" },
        }, describe() {} },
        onFileObject: null, onUnfileObject: null,
      }));
    });
    walk(r.toJSON());
    return { said: out.join(" "), r };
  };

  test("[37] one card, four things, four different answers — and each binder shows only its own", () => {
    /* THE SCENARIO THE CARD-LEVEL QUESTION COULD NOT ASK. A Goal, a kept copy,
       an offered copy and a second offered copy, all of one card, in three
       binders and nowhere. */
    const st = world({ binders: [
      { id: "A", collectorId: "casey", name: "Hunting", createdAt: AT, archivedAt: null },
      { id: "B", collectorId: "casey", name: "Keepers", createdAt: AT, archivedAt: null },
      { id: "T", collectorId: "casey", name: "Trade Night", createdAt: AT, archivedAt: null }] });
    okv(x(st, CASEY, "fileObject", { binderId: "A", goalId: "g1" }), "goal");
    okv(x(st, CASEY, "fileObject", { binderId: "B", collectorCopyId: "keep" }), "pc");
    okv(x(st, CASEY, "fileObject", { binderId: "T", collectorCopyId: "sell" }), "trade");
    eq(homes(st).length, 3, "three things, three homes");

    const a = show(st, "A").said;
    assert(/Actively hunting|Looking for/.test(a), `the hunt is not in A: ${a}`);
    assert(!/PSA 9|PSA 8/.test(a), `a copy that lives elsewhere appeared in A: ${a}`);
    const b = show(st, "B").said;
    assert(/PSA 9/.test(b), `the kept copy is not in B: ${b}`);
    assert(!/PSA 8/.test(b), `the offered copy appeared in B: ${b}`);
    assert(!/Actively hunting|Looking for/.test(b), `the hunt appeared in B: ${b}`);
    const c = show(st, "T").said;
    assert(/PSA 8/.test(c), `the offered copy is not in C: ${c}`);
    assert(!/PSA 9/.test(c), `the kept copy appeared in C: ${c}`);
  });

  test("[38] a Goal and a copy of one card in one binder: one heading, two things", () => {
    const st = world();
    okv(x(st, CASEY, "fileObject", { binderId: "A", goalId: "g1" }), "goal");
    okv(x(st, CASEY, "fileObject", { binderId: "A", collectorCopyId: "keep" }), "copy");
    const { said } = show(st, "A");
    /* ONE CARD HEADING. The card is how the two are read together; it is not a
       third thing and it owns no action. Counted structurally rather than by
       the word, because the card's name legitimately appears twice in one
       heading — once as the picture's label and once as the title. */
    const { r } = show(st, "A");
    eq(r.root.findAll((n) => n.props && n.props.className === "mcs-group").length, 1,
      `the card was listed once per thing: ${said}`);
    /* AND TWO THINGS, EACH SAYING WHAT IT IS. */
    assert(/Looking for/.test(said), `the hunt is not its own row: ${said}`);
    assert(/PSA 9/.test(said), `the copy is not its own row: ${said}`);
    assert(/Keeping/.test(said), `the copy does not say what it is: ${said}`);
  });

  test("[39] a binder with memberships and no legacy rows is not empty", () => {
    /* THE SILENT-FAILURE GUARD. `rows()` tolerates `undefined` and the
       collection is optional, so a regression that stopped reading memberships
       would render an EMPTY binder rather than failing — a Collector would
       watch their organising vanish and the logs would say nothing. */
    const st = world({ binderEntries: [] });
    okv(x(st, CASEY, "fileObject", { binderId: "A", collectorCopyId: "keep" }), "file");
    eq(st.get().binderEntries.length, 0, "the fixture has a legacy row");
    const { said } = show(st, "A");
    assert(!/Nothing in this binder yet/.test(said), `a filed binder rendered empty: ${said}`);
    assert(/PSA 9/.test(said), said);
  });

  test("[40] two copies with no distinguishing facts are told apart truthfully", () => {
    /* THE CLOSED DECISION ON IDENTICAL COPIES. No invented number, no id on
       screen — a true sentence about the order they were added in, derived from
       `addedAt` with the stable id as a tiebreak, and never from array
       position. */
    const st = world({ collectorCopies: [
      { id: "bare1", collectorId: "casey", canonicalCardId: "cc-x", offered: true, addedAt: "2026-09-01" },
      { id: "bare2", collectorId: "casey", canonicalCardId: "cc-x", offered: true, addedAt: "2026-09-02" }] });
    okv(x(st, CASEY, "fileObject", { binderId: "A", collectorCopyId: "bare1" }), "file");
    okv(x(st, CASEY, "fileObject", { binderId: "B", collectorCopyId: "bare2" }), "file");
    const a = show(st, "A").said;
    const b = show(st, "B").said;
    assert(/added first/.test(a), `the first copy is not named: ${a}`);
    assert(/added next/.test(b), `the second copy is not named: ${b}`);
    /* AND NEITHER SCREEN SHOWS AN ID OR AN INVENTED NUMBER. */
    for (const said of [a, b]) {
      assert(!/bare1|bare2/.test(said), `an id reached the screen: ${said}`);
      assert(!/Copy #|#1|#2/.test(said), `an invented number reached the screen: ${said}`);
    }
    /* THE ORDER IS THE ORDER THEY WERE ADDED IN, NOT THE ORDER THEY ARRIVE IN.
       Reversing the projection's array must not rename them. */
    const flipped = world({ collectorCopies: [
      { id: "bare2", collectorId: "casey", canonicalCardId: "cc-x", offered: true, addedAt: "2026-09-02" },
      { id: "bare1", collectorId: "casey", canonicalCardId: "cc-x", offered: true, addedAt: "2026-09-01" }] });
    okv(x(flipped, CASEY, "fileObject", { binderId: "A", collectorCopyId: "bare1" }), "file");
    assert(/added first/.test(show(flipped, "A").said),
      "the label follows array position rather than when the copy was added");
  });

  test("[41] a legacy row beside a Goal and several copies infers nothing", () => {
    /* SCENARIO Q, RENDERED. One card-level row, a Goal and three copies, and
       nothing anywhere that says which — if any — the row was about. The row is
       shown as history with no actions; the things show their own homes. */
    const st = world();
    eq(st.get().binderEntries.length, 1, "the fixture has no legacy row");
    eq(homes(st).length, 0, "the fixture filed something");
    const { said } = show(st, "A");
    assert(/Filed before Binders organised specific cards/.test(said),
      `the legacy row is not shown as history: ${said}`);
    assert(!/Looking for|Keeping|Offered/.test(said),
      `a legacy row was read as a thing's home: ${said}`);
    /* And it carries no Move and no Remove here — it is removed from the card's
       own panel, beside the card it is actually about. */
    assert(!/Move to…/.test(said), `a legacy row was offered a Move: ${said}`);
  });

  test("[42] duplicate binder names stay distinguishable by id, never by name", () => {
    const st = world({ binders: [
      { id: "x1", collectorId: "casey", name: "Trade Night", createdAt: AT, archivedAt: null },
      { id: "x2", collectorId: "casey", name: "Trade Night", createdAt: AT, archivedAt: null }] });
    okv(x(st, CASEY, "fileObject", { binderId: "x1", goalId: "g1" }), "file");
    eq(homeOf(st, "goalId", "g1").binderId, "x1", "the wrong binder took it");
    /* And the other one is still empty — a name identified nothing. */
    eq(homes(st).filter((m) => m.binderId === "x2").length, 0,
      "a binder was chosen by its name");
    const { said } = show(st, "x2");
    assert(!/Looking for/.test(said), `the same-named binder claimed the hunt: ${said}`);
  });

  test("[43] a Trusted Partner sees none of the new rendering either", () => {
    /* THE PRIVACY CLAIM, AT THE RENDERING LAYER. [14] proves the projection
       carries nothing; this proves nothing in 3B-1 reads around it. */
    const st = world();
    okv(x(st, CASEY, "fileObject", { binderId: "A", goalId: "g1" }), "goal");
    okv(x(st, CASEY, "fileObject", { binderId: "B", collectorCopyId: "sell" }), "copy");
    const theirs = projectForActor(st.get(), { partnerId: "nl" });
    const body = JSON.stringify(theirs);
    for (const n of ["Hunting", "Keepers", "A", "B", "Cc"]) {
      assert(!new RegExp(`"name":"${n}"`).test(body), `a binder name reached a partner: ${n}`);
    }
    eq(JSON.stringify(theirs.binderMemberships), "[]", body);
    eq(JSON.stringify(theirs.binders), "[]", body);
    eq(JSON.stringify(theirs.binderEntries), "[]", body);
    assert(!/binderCount|filedIn|binderTotal/.test(body), body);
  });
});

/* =========================== I. reachable, with the controls that reach it */
describe("I. A capability with a surface, at last", () => {
  /* WHAT THIS SECTION WAS, AND WHY IT IS NOW THE OPPOSITE.

     Batch 3A built object-level membership and, for one commit, exposed the two
     commands that write it while no screen sent either. 3A's own closure took
     them back out and this section pinned that: not exposed, nothing in
     `client/` naming them, no thunk, the client able to send exactly 23. Every
     one of those assertions was right, and every one of them is now deliberately
     reversed — because the reason they gave has stopped being true.

     `server/exposed-commands.js` states the rule: an entry is a command a
     production surface sends TODAY, and "when a command joins this list" is
     "when the product grows a surface that sends it." Batch 3B-1 is that
     surface. So the pins are not deleted; they are turned around, and what they
     assert now is the thing that made the difference — that the door and the
     control arrived together, in one batch, and that the card-level door the
     panel no longer presses is still open for one release.

     THE INVARIANT UNDERNEATH NEVER MOVED: a Collector presentation surface may
     not name a command. That is asserted below and in four other suites, and it
     tightened by itself when the list grew to 25. */
  const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
  const OBJECT_COMMANDS = ["fileObject", "unfileObject"];
  const clientSource = () => {
    const dir = path.join(ROOT, "client");
    const out = [];
    const walk = (d) => {
      for (const e of require("fs").readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        /* Comments stripped: both `commands.js` and `exposed-commands.js`
           explain these commands in prose, and a scan that counts prose cannot
           tell an explanation from a dispatch. */
        else if (/\.(js|jsx)$/.test(e.name)) out.push([full.slice(ROOT.length + 1),
          require("fs").readFileSync(full, "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ")]);
      }
    };
    walk(dir);
    return out;
  };

  test("[31] the two object-level commands are reachable, and the card-level pair still is", () => {
    for (const name of OBJECT_COMMANDS) {
      assert(EXPOSED_COMMANDS.includes(name),
        `${name} is not reachable, so no control can press it: ${EXPOSED_COMMANDS.join(",")}`);
    }
    eq(EXPOSED_COMMANDS.length, 25, `the production surface is ${EXPOSED_COMMANDS.join(",")}`);
    /* AND THE CARD-LEVEL PAIR IS STILL OPEN, ON PURPOSE. The panel no longer
       sends `addBinderEntry` — proved in [34] — but the door stays one release
       so a browser tab opened before this deploy keeps working, and
       `removeBinderEntry` stays indefinitely because it is how a legacy row is
       removed. Retiring either is 3C's, with the seven guards that hold them. */
    for (const name of ["addBinderEntry", "removeBinderEntry"]) {
      assert(EXPOSED_COMMANDS.includes(name), `${name} stopped being reachable`);
    }
  });

  test("[32] and they are complete domain commands, exercised end to end", () => {
    for (const name of OBJECT_COMMANDS) {
      assert([...C.COMMAND_NAMES].includes(name), `${name} is not a domain command`);
      eq(typeof C.COMMANDS[name], "function", `${name} has no implementation`);
    }
    eq([...C.COMMAND_NAMES].length, 53, "the domain command table moved");
    const st = world();
    const id = okv(x(st, CASEY, "fileObject", { binderId: "A", goalId: "g1" }), "file");
    eq(homeOf(st, "goalId", "g1").binderId, "A", "the command stopped working");
    okv(x(st, CASEY, "unfileObject", { goalId: "g1" }), "unfile");
    eq(homes(st).length, 0, "the command stopped working");
    assert(id, "no membership id was minted");
  });

  test("[33] exactly one file in client/ names them, and it is the bindings", () => {
    /* REVERSED FROM "NOTHING NAMES EITHER", AND THE REPLACEMENT IS THE RULE
       THAT ALWAYS HELD: `client/commands.js` is the only file allowed to name a
       command, and every surface calls what it was handed. The panel reaches
       them through a step kind and the Binder view through a callback, so
       neither names one — which is also enforced by source guards in
       `phase5-c33`, `phase5-c34a` and `phase5-c34b` that tightened by
       themselves when the exposed list grew. */
    const files = clientSource();
    assert(files.length > 5, `only ${files.length} client files were read`);
    for (const [name, body] of files) {
      const named = OBJECT_COMMANDS.filter((cmd) => new RegExp(`["']${cmd}["']`).test(body));
      if (name === "client/commands.js") {
        eq(named.length, 2, `the bindings name ${named.join(",") || "neither command"}`);
      } else {
        eq(named.length, 0, `${name} names ${named.join(",")} — only the bindings may`);
      }
    }
    /* And the bindings exist, with the shape every other binding has. */
    const bindings = files.find(([n]) => n === "client/commands.js")[1];
    for (const fn of ["fileObjectInBinder", "unfileObjectFromBinder"]) {
      assert(new RegExp(`export function ${fn}\\(`).test(bindings), `${fn} is missing`);
    }
    /* ONE BINDER AND ONE OBJECT, AND NOTHING ELSE. No owner — the seat comes
       from the verified token — and no canonical card, because the object named
       its card when it was created. */
    const slice = bindings.slice(bindings.indexOf("export function fileObjectInBinder"));
    const body = slice.slice(0, slice.indexOf("export function unfileObjectFromBinder"));
    assert(!/collectorId|canonicalCardId|cardId/.test(body),
      `the binding carries an owner or a card: ${body}`);
  });

  test("[34] the shipping panel files a THING, and creates no card-level row", () => {
    /* THE HEADLINE REVERSAL OF 3A'S CLOSURE, AND WHERE NEW BARE-CARD FILING
       ENDS. This used to assert that the panel plans `kind: "file"`, that
       `SignIn.jsx` maps it onto the card-level binding, and that neither file
       mentions an object command. The first is now false on purpose. */
    const panelSrc = require("fs").readFileSync(
      path.join(ROOT, "client/collector/CardSpecification.jsx"), "utf8");
    const signin = require("fs").readFileSync(
      path.join(ROOT, "client/sign-in/SignIn.jsx"), "utf8");
    /* The panel plans the object kinds and NOT the card-level add. */
    assert(/kind: "file-object"/.test(panelSrc), "the panel plans no filing");
    assert(/kind: "unfile-object"/.test(panelSrc), "the panel plans no unfiling");
    assert(!/kind: "file"[^-]/.test(panelSrc.replace(/\/\*[\s\S]*?\*\//g, " ")),
      "the panel still plans a card-level filing");
    /* The entrance maps both, and still maps the card-level pair for a stale
       tab and for the legacy line's Remove. */
    for (const kind of ["file-object", "unfile-object", "file", "unfile"]) {
      assert(new RegExp(`case "${kind}"`).test(signin), `the entrance cannot map "${kind}"`);
    }
    /* AND THE PANEL NAMES NO COMMAND, which is the invariant that did not move
       and which now covers the two new ones for free. */
    for (const cmd of [...OBJECT_COMMANDS, "addBinderEntry"]) {
      assert(!new RegExp(`["']${cmd}["']`).test(panelSrc), `the panel names ${cmd}`);
    }
  });

  test("[35] and the client/exposed sets agree without either being padded", () => {
    /* THE GUARD THAT MADE 3A'S CLOSURE NECESSARY, holding at 25 = 25 and
       unmodified. While the doors were open with no control, it held only
       because two thunks existed that nothing imported — the guard satisfied
       rather than honoured. Now both sides moved together, in one commit,
       because this assertion does not allow anything else. */
    const client = require("fs").readFileSync(path.join(ROOT, "client/commands.js"), "utf8");
    const sent = new Set();
    for (const m of client.matchAll(/execute\(\s*"([A-Za-z]+)"/g)) sent.add(m[1]);
    for (const m of client.matchAll(/^export const [A-Z_]+ = "([A-Za-z]+)";$/gm)) sent.add(m[1]);
    eq(JSON.stringify([...sent].sort()), JSON.stringify([...EXPOSED_COMMANDS].sort()),
      "the door and the client disagree about what the product offers");
    eq(sent.size, 25, `the client can send ${sent.size}`);
    /* AND EVERY ONE OF THEM IS IMPORTED BY SOMETHING. This is the half the
       exact-set guard cannot see: a binding nothing imports satisfies it while
       being dead, which is what 3A's two thunks were. */
    const importers = require("fs").readFileSync(
      path.join(ROOT, "client/sign-in/SignIn.jsx"), "utf8");
    for (const fn of ["fileObjectInBinder", "unfileObjectFromBinder"]) {
      assert(new RegExp(fn).test(importers), `${fn} is exported and imported by nothing`);
    }
  });

  test("[36] and nothing else about the foundation moved with the doors", () => {
    /* The batch is a change of SUBJECT in the UI. These are the counts it
       fixes, asserted together so a change to a screen cannot quietly arrive
       with a change to the schema or the refusal vocabulary. */
    eq(require("fs").readdirSync(path.join(ROOT, "persistence/migrations"))
      .filter((f) => f.endsWith(".sql")).length, 14, "a migration moved");
    eq(Object.keys(D.REFUSE).length, 44, "the refusal vocabulary moved");
    assert(D.REFUSE.invalidTarget === "invalid-target" && D.REFUSE.binderArchived === "binder-archived",
      "Batch 3A's two refusal codes changed");
    /* AND THE DOMAIN FILE IS UNTOUCHED BY THIS BATCH, which is the strongest
       single statement of it. */
    const { execFileSync } = require("child_process");
    const changed = execFileSync("git", ["diff", "--name-only", "ff80c17", "--",
      "domain/", "persistence/"], { cwd: ROOT, encoding: "utf8" }).trim();
    eq(changed, "", `3B-1 changed the foundation: ${changed}`);
  });
});

run();
