/* ============================================================================
   THE FOUR STATES A COLLECTOR CAN BE IN, AND THE ONE RULE THAT WAS WITHDRAWN

   A card in a Collector's world means one of four things, and the four live at
   two different levels because that is what makes them true:

     Primary Goal    I am actively hunting this card, in this grade   (a GOAL)
     Secondary Goal  I want it, in this grade, less urgently          (a GOAL)
     Trade/Sell      I own this copy and would part with it           (a COPY)
     PC              I own this copy and intend to keep it            (a COPY)

   THE LEVELS ARE THE POINT, AND THE TWO-COPY CASE IS WHY. Somebody who owns two
   copies of one card may truthfully keep one and offer the other. Flattening the
   four onto the card would make that unsayable, so they are mutually exclusive
   PER COPY and not per card — and a Goal for a card you already own is not a
   contradiction either, it is somebody hunting a better copy. There is no
   `cardState`, no `intent` field, and nothing that joins the four.

   PC IS POSITIVE AND IS NEVER INFERRED. `offered === false` means only that no
   offer has been made: three places in the product say so, and a migration
   exists because that confusion already cost a Collector their visible supply.
   A copy that has said nothing carries no `keeping` key at all — which is what
   every copy in every existing world honestly is, PC having only just become
   sayable. Absence is unstated, not "not keeping".

   OWNING WITHOUT A DISPOSITION IS VALID AND IS NOT A FIFTH STATE. Nothing
   removes such a copy, hides it, or invents a disposition for it. It is a
   record; it is simply not one of the four things a person can MEAN.

   AND THE RULE THIS SUITE USED TO CARRY IS WITHDRAWN.

   For one batch a card had to be in one of the four before it could be filed in
   a binder, and losing the last of them took the memberships away. Section C is
   now the record of that reversal rather than of the rule. Both halves asked
   "what does this canonical card currently mean to this Collector?" — an
   aggregate the object model rejects, because a Collector's actionable things
   are a specific sought copy and a specific owned copy, and a card kept in one
   copy, offered in another and hunted in a third has no single answer. What
   replaced it:

     Binder organisation must not determine whether a Goal or CollectorCopy is
     meaningful, and state changes must not silently destroy organisation.

   So `cardHasState`, `collectorStatesFor`, the filing guard, its refusal code
   and the cascade are gone — along with the warnings the cascade needed and the
   command ordering it forced. What survives is everything above: the four
   states themselves, which were always about objects and never about cards.
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const React = require("react");
const TR = require("react-test-renderer");
const esbuild = require("esbuild");
const D = require("../domain/metyet-domain.js");
const P = require("../domain/metyet-projection.js");
const W = require("../domain/metyet-world.js");
const { createStore } = require("./fixture-store.cjs");
const RT = require("../domain/metyet-runtime.js");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");

const ROOT = path.join(__dirname, "..");
const AT = "2026-09-30";
let seq = 0;
const runtime = () => RT.createRuntime({ now: () => AT, newId: (p = "") => `${p}${++seq}` });
const codeOf = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const TP = { partnerId: "nl" };
const OTHER_TP = { partnerId: "sv" };
const CASEY = { collectorId: "casey" };
const JORDAN = { collectorId: "jordan" };

const world = (over = {}) => {
  seq = 0;
  return createStore({
    partners: [{ id: "nl", name: "Northline", tradeRate: 0.7 },
      { id: "sv", name: "Silver Vale", tradeRate: 0.7 }],
    collectors: [{ id: "casey", name: "Casey" }, { id: "jordan", name: "Jordan" }],
    relationships: [
      { partnerId: "nl", collectorId: "casey", status: "accepted", at: AT },
      { partnerId: "nl", collectorId: "jordan", status: "accepted", at: AT }],
    goals: [], inventory: [], collectorCopies: [], binders: [], binderEntries: [],
    opportunities: [], catalog: [], copyReviews: [], photoRequests: [],
    conversations: [], interests: [],
    ...over,
  }, runtime());
};

const x = (st, actor, cmd, payload) => st.execute(actor, cmd, payload || {});
const code = (r) => (r && r.ok !== false ? "OK" : r.refused);
const okv = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
const copies = (st) => st.get().collectorCopies;
const copyOf = (st, cert) => copies(st).find((c) => c.cert === cert);
const valid = (st) => {
  const v = W.validateWorld(st.get());
  return v && "ok" in v ? v.ok : ((v || []).length === 0);
};
/* A NEW COPY MUST SAY WHETHER ITS OWNER WOULD PART WITH IT (the disposition
   batch). This suite is about the four states themselves, so the disposition is
   NOT incidental here and every test that turns on it says so at the call site;
   the default below exists only for the binder, cascade and projection cases
   where a copy is scaffolding. It applies ONLY when the caller named neither,
   so an `extra` that says `keeping` is never given `offered: true` underneath
   it — that would be `disposition-conflict` rather than a default.

   A copy that says NOTHING can no longer be created at all. The cases that need
   one — every copy recorded before this rule — seed the row, which is the honest
   way to test a state the product holds but does not make. */
const own = (st, actor, card, cert, extra = {}) => okv(x(st, actor, "addCollectorCopy",
  { copy: { canonicalCardId: card, grade: "PSA 9", cert,
    ...(("offered" in extra) || ("keeping" in extra) ? {} : { offered: true }),
    ...extra }, at: AT }), `own ${cert}`);

/* AND THE SHAPE THIS SUITE KEEPS TESTING AND CAN NO LONGER BUILD: a stored copy
   with no disposition. Seeded, never commanded. */
const quietCopy = (over = {}) => ({ id: "quiet", collectorId: "casey",
  canonicalCardId: "cc-x", grade: "PSA 9", cert: "Q", offered: false, ...over });
const wants = (st, actor, card, tier = "secondary") => okv(x(st, actor, "addGoal",
  { canonicalCardId: card, tier, desired: { grade: "PSA 9" }, at: AT }), "want");

/* ============================================================ A. state truth */
describe("A. What a Collector can say, and what they cannot", () => {
  test("[1] a Goal of either tier must be specified", () => {
    for (const tier of ["primary", "secondary"]) {
      const st = world();
      eq(code(x(st, CASEY, "addGoal", { canonicalCardId: "cc-x", tier, at: AT })),
        D.REFUSE.criteriaRequired, `${tier}: an unspecified Goal was created`);
      eq(code(x(st, CASEY, "addGoal", { canonicalCardId: "cc-x", tier, desired: {}, at: AT })),
        D.REFUSE.criteriaRequired, `${tier}: an empty specification was accepted`);
      eq(code(x(st, CASEY, "addGoal",
        { canonicalCardId: "cc-x", tier, desired: { grade: "PSA 9" }, at: AT })), "OK",
        `${tier}: a specified Goal was refused`);
    }
  });

  test("[2] and a Goal cannot have its last criterion taken away", () => {
    const st = world();
    const g = wants(st, CASEY, "cc-x");
    eq(code(x(st, CASEY, "updateGoalCriteria", { goalId: g, desired: null, at: AT })),
      D.REFUSE.criteriaRequired, "a Goal was emptied");
    eq(code(x(st, CASEY, "updateGoalCriteria", { goalId: g, desired: {}, at: AT })),
      D.REFUSE.criteriaRequired, "a Goal was emptied");
  });

  test("[3] Trade/Sell and PC both require a copy to exist", () => {
    const st = world();
    for (const cmd of ["setCollectorCopyOffered", "setCollectorCopyKept"]) {
      const field = cmd === "setCollectorCopyOffered" ? { offered: true } : { keeping: true };
      eq(code(x(st, CASEY, cmd, { copyId: "no-such-copy", ...field, at: AT })),
        D.REFUSE.notFound, `${cmd} on nothing`);
    }
    eq(copies(st).length, 0, "a copy was conjured");
  });

  test("[4] `offered === false` is not PC, and never becomes it", () => {
    /* RE-PINNED: THE GUARANTEE IS UNCHANGED AND ITS PROOF HAD TO MOVE.

       The claim is that the absence of an offer is never read as a decision to
       keep. `offered: false` has meant "no offer stated" since C2, three places
       forbid reading more into it, and migration 0012 exists because that
       confusion once cost a Collector their visible supply.

       Both acts this test used to perform are now refused. The disposition
       batch requires a new copy to say which, and refuses
       `setCollectorCopyOffered(false)` — so "create a copy that says nothing"
       and "withdraw an offer" are both gone as routes. What replaces them: the
       refusals themselves, and a SEEDED copy, which is what every copy recorded
       before the rule actually is. The guarantee is asserted against the data
       that really has this shape rather than against a shape a command once
       made. */
    const st = world({ collectorCopies: [quietCopy()] });
    assert(!D.copyKept(copyOf(st, "Q")), "a copy with no keep was read as kept");
    eq(D.copyDisposition(copyOf(st, "Q")), "unstated",
      "the absence of an offer became a positive statement");
    assert(valid(st), "a world holding such a copy stopped loading");

    /* No command can make another one, in either of the two ways it used to. */
    eq(code(x(st, CASEY, "addCollectorCopy",
      { copy: { canonicalCardId: "cc-x", grade: "PSA 9", cert: "B" }, at: AT })),
    D.REFUSE.invalidDisposition, "a copy was recorded saying nothing");
    eq(code(x(st, CASEY, "addCollectorCopy",
      { copy: { canonicalCardId: "cc-x", grade: "PSA 9", cert: "B", keeping: false }, at: AT })),
    D.REFUSE.invalidDisposition, "an explicit no was accepted as an answer");

    /* And an offered copy cannot be withdrawn back into it — the refusal
       leaves the copy's own answer exactly as it was. */
    const k = own(st, CASEY, "cc-x", "A", { offered: true });
    eq(code(x(st, CASEY, "setCollectorCopyOffered", { copyId: k, offered: false, at: AT })),
      D.REFUSE.invalidDisposition, "an offer was withdrawn into silence");
    eq(D.copyDisposition(copyOf(st, "A")), "offered", "the refusal changed the copy");
    assert(!D.copyKept(copyOf(st, "A")),
      "withdrawing an offer was read as a decision to keep");

    /* And PC's own `offered: false` is not what makes it PC: the key is. */
    const pc = own(st, CASEY, "cc-x", "C", { keeping: true });
    eq(copyOf(st, "C").offered, false, "a kept copy is on offer");
    assert(D.copyKept(copyOf(st, "C")), "the keep did not land");
    assert(copyOf(st, "C").keeping === true && !("keeping" in copyOf(st, "Q")),
      "a kept copy and a silent one became indistinguishable");
    assert(valid(st), "the world became invalid");
  });

  test("[5] the two statements cannot both be true, by any route", () => {
    const st = world();
    const k = own(st, CASEY, "cc-x", "A");
    /* Born with both. */
    eq(code(x(st, CASEY, "addCollectorCopy",
      { copy: { canonicalCardId: "cc-x", grade: "PSA 9", cert: "B", offered: true, keeping: true }, at: AT })),
      D.REFUSE.dispositionConflict, "a copy was born contradicting itself");
    /* Kept, then offered. */
    okv(x(st, CASEY, "setCollectorCopyKept", { copyId: k, keeping: true, at: AT }), "keep");
    okv(x(st, CASEY, "setCollectorCopyOffered", { copyId: k, offered: true, at: AT }), "offer");
    eq(D.copyDisposition(copyOf(st, "A")), "offered", "offering did not withdraw the keep");
    assert(!D.copyKept(copyOf(st, "A")), "the copy still claims to be kept");
    /* Offered, then kept. */
    okv(x(st, CASEY, "setCollectorCopyKept", { copyId: k, keeping: true, at: AT }), "keep again");
    eq(D.copyDisposition(copyOf(st, "A")), "keeping", "keeping did not withdraw the offer");
    eq(copyOf(st, "A").offered, false, "the copy is still on offer");
    assert(valid(st), "the world is invalid after a disposition swap");
  });

  test("[6] neither statement travels inside a correction", () => {
    /* RE-PINNED: the copy now starts as PC rather than silent, because a new
       copy must say which. What the test asserts is unchanged — a disposition
       does not travel inside a correction — and it is now checked against a
       copy whose answer a successful patch would visibly have overwritten. */
    const st = world();
    const k = own(st, CASEY, "cc-x", "A", { keeping: true });
    for (const patch of [{ offered: true }, { keeping: true }, { offered: false, keeping: true }]) {
      eq(code(x(st, CASEY, "updateCollectorCopy", { copyId: k, patch, at: AT })),
        D.REFUSE.identityImmutable, `${JSON.stringify(patch)} got through a patch`);
    }
    eq(D.copyDisposition(copyOf(st, "A")), "keeping", "a patch changed the disposition");
  });

  test("[7] a world that says both is reported, even though no command can make one", () => {
    const st = world({ collectorCopies: [{ id: "k1", collectorId: "casey",
      canonicalCardId: "cc-x", grade: "PSA 9", offered: true, keeping: true, addedAt: AT }] });
    assert(!valid(st), "a self-contradicting copy validated");
  });

  test("[8] and a world with no `keeping` key at all is perfectly valid", () => {
    /* EVERY EXISTING WORLD IS THIS ONE. Requiring the field would make them all
       unstorable, which is an error on the next command rather than a refusal. */
    const st = world({ collectorCopies: [{ id: "k1", collectorId: "casey",
      canonicalCardId: "cc-x", grade: "PSA 9", offered: false, addedAt: AT }] });
    assert(valid(st), "a copy written before PC existed became invalid");
    eq(D.copyDisposition(st.get().collectorCopies[0]), "unstated", "absence was read as a claim");
    const bad = world({ collectorCopies: [{ id: "k1", collectorId: "casey",
      canonicalCardId: "cc-x", grade: "PSA 9", offered: false, keeping: "yes", addedAt: AT }] });
    assert(!valid(bad), "a non-boolean keeping was accepted");
  });
});

/* ======================================================== B. multiple copies */
describe("B. One card, two copies, two different truths", () => {
  const twoCopies = () => {
    const st = world();
    const a = own(st, CASEY, "cc-x", "A");
    const b = own(st, CASEY, "cc-x", "B", { grade: "PSA 8" });
    okv(x(st, CASEY, "setCollectorCopyKept", { copyId: a, keeping: true, at: AT }), "keep A");
    okv(x(st, CASEY, "setCollectorCopyOffered", { copyId: b, offered: true, at: AT }), "offer B");
    return { st, a, b };
  };

  test("[9] Copy A kept and Copy B offered, at the same time", () => {
    const { st } = twoCopies();
    eq(D.copyDisposition(copyOf(st, "A")), "keeping", "A is not kept");
    eq(D.copyDisposition(copyOf(st, "B")), "offered", "B is not offered");
    assert(valid(st), "two truths about one card made the world invalid");
  });

  test("[10] changing one does not rewrite the other", () => {
    const { st, b } = twoCopies();
    okv(x(st, CASEY, "setCollectorCopyKept", { copyId: b, keeping: true, at: AT }), "keep B too");
    eq(D.copyDisposition(copyOf(st, "A")), "keeping", "A moved when B did");
    okv(x(st, CASEY, "setCollectorCopyOffered", { copyId: b, offered: true, at: AT }), "offer B again");
    eq(D.copyDisposition(copyOf(st, "A")), "keeping", "A moved when B did");
  });

  test("[11] and removing one does not rewrite the other", () => {
    const { st, b } = twoCopies();
    okv(x(st, CASEY, "removeCollectorCopy", { copyId: b, at: AT }), "sell B");
    eq(copies(st).length, 1, "the wrong copy went");
    eq(D.copyDisposition(copyOf(st, "A")), "keeping", "A lost its meaning when B left");
  });

  test("[12] a partner sees the offered copy and only the offered copy", () => {
    const { st } = twoCopies();
    const v = P.projectForActor(st.get(), TP);
    const seen = (v.collectorCopies || []).map((c) => c.cert);
    eq(seen.join(","), "B", "the shop saw a copy it should not: " + seen.join(","));
  });

  test("[13] and the kept copy does not leak because its sibling is offered", () => {
    const { st } = twoCopies();
    const blob = JSON.stringify(P.projectForActor(st.get(), TP));
    assert(!blob.includes("keeping"), "PC crossed to a partner");
    assert(!blob.includes('"A"'), "the kept copy's certificate crossed");
    /* An unrelated shop sees nothing of either. */
    eq((P.projectForActor(st.get(), OTHER_TP).collectorCopies || []).length, 0,
      "an unrelated shop saw a copy");
  });

  test("[14] `keeping` is not on the partner allow-list at all", () => {
    /* Belt and braces: the row does not reach a partner because a kept copy is
       not offered, AND the field is not among the ones that cross. */
    const src = codeOf("domain/metyet-projection.js");
    const at = src.indexOf("COLLECTOR_COPY_FOR_PARTNER");
    const list = src.slice(at, src.indexOf("]", at));
    assert(!/keeping/.test(list), "keeping is on the partner allow-list");
    assert(!/market/.test(list), "the private reference value is on it either");
  });

  test("[15] wanting a card you already own is not a contradiction", () => {
    const st = world();
    const k = own(st, CASEY, "cc-x", "A");
    okv(x(st, CASEY, "setCollectorCopyKept", { copyId: k, keeping: true, at: AT }), "keep it");
    eq(code(x(st, CASEY, "addGoal",
      { canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 10" }, at: AT })), "OK",
      "hunting a better copy of a card you keep was refused");
    eq(D.copyDisposition(copyOf(st, "A")), "keeping", "the Goal changed the copy");
  });
});

/* ================================ C. a Binder organises; it does not judge */
describe("C. What a Binder does not decide", () => {
  const withBinder = () => {
    const st = world();
    return { st, bd: okv(x(st, CASEY, "createBinder", { name: "Shoebox", at: AT }), "binder") };
  };

  /* THE RULE THIS SECTION USED TO ASSERT IS WITHDRAWN, AND THE REVERSAL IS THE
     POINT. For one batch a card had to be in one of the four states before it
     could be filed, and losing the last of them took the membership away. Both
     halves asked "what does this canonical card currently mean to this
     Collector?" — an aggregate the object model rejects, because a Collector's
     actionable things are a specific sought copy and a specific owned copy, and
     a card that is kept in one copy, offered in another and hunted in a third
     has no single answer.

     What replaces it is the plain rule:

       Binder organisation must not determine whether a Goal or CollectorCopy is
       meaningful, and state changes must not silently destroy organisation. */

  test("[16] a card nobody has said anything about can be filed", () => {
    const { st, bd } = withBinder();
    okv(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: "cc-none", at: AT }),
      "a card with nothing said about it was refused");
    eq(st.get().binderEntries.length, 1, "the entry did not land");
    eq(st.get().goals.length, 0, "a Goal was created by filing");
    eq(copies(st).length, 0, "a copy was created by filing");
    assert(valid(st), "the world became invalid");
  });

  test("[17] every state files, and so does no state at all", () => {
    const { st, bd } = withBinder();
    wants(st, CASEY, "cc-p", "primary");
    wants(st, CASEY, "cc-s", "secondary");
    const o = own(st, CASEY, "cc-o", "O");
    okv(x(st, CASEY, "setCollectorCopyOffered", { copyId: o, offered: true, at: AT }), "offer");
    const kp = own(st, CASEY, "cc-k", "K");
    okv(x(st, CASEY, "setCollectorCopyKept", { copyId: kp, keeping: true, at: AT }), "keep");
    own(st, CASEY, "cc-u", "U");
    for (const card of ["cc-p", "cc-s", "cc-o", "cc-k", "cc-u", "cc-nothing"]) {
      eq(code(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: card, at: AT })), "OK",
        card + " could not be filed");
    }
    eq(st.get().binderEntries.length, 6, "not everything landed");
  });

  test("[18] but a binder that is not yours refuses, which is the only rule left", () => {
    const st = world();
    const mine = okv(x(st, CASEY, "createBinder", { name: "Mine", at: AT }), "mine");
    const theirs = okv(x(st, JORDAN, "createBinder", { name: "Theirs", at: AT }), "theirs");
    eq(code(x(st, CASEY, "addBinderEntry", { binderId: theirs, canonicalCardId: "cc-x", at: AT })),
      D.REFUSE.notOwner, "Casey filed into somebody else's binder");
    eq(code(x(st, JORDAN, "addBinderEntry", { binderId: mine, canonicalCardId: "cc-x", at: AT })),
      D.REFUSE.notOwner, "Jordan filed into Casey's binder");
    eq(code(x(st, CASEY, "addBinderEntry",
      { binderId: "no-such-binder", canonicalCardId: "cc-x", at: AT })),
    D.REFUSE.notFound, "a binder that does not exist accepted a card");
    eq(st.get().binderEntries.length, 0, "an entry landed anyway");
  });

  test("[19] one Binder may hold cards in different states", () => {
    const { st, bd } = withBinder();
    wants(st, CASEY, "cc-p", "primary");
    wants(st, CASEY, "cc-s", "secondary");
    const kp = own(st, CASEY, "cc-k", "K");
    okv(x(st, CASEY, "setCollectorCopyKept", { copyId: kp, keeping: true, at: AT }), "keep");
    for (const card of ["cc-p", "cc-s", "cc-k"]) {
      okv(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: card, at: AT }), card);
    }
    eq(st.get().binderEntries.length, 3, "a binder refused to mix states");
    assert(valid(st), "a mixed binder is invalid");
  });

  test("[20] and several Binders behave the same way", () => {
    const st = world();
    const a = okv(x(st, CASEY, "createBinder", { name: "A", at: AT }), "A");
    const b = okv(x(st, CASEY, "createBinder", { name: "B", at: AT }), "B");
    for (const bd of [a, b]) {
      okv(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: "cc-x", at: AT }), "file");
    }
    eq(st.get().binderEntries.length, 2, "one card, two places it belongs");
    okv(x(st, CASEY, "addBinderEntry", { binderId: a, canonicalCardId: "cc-x", at: AT }), "again");
    eq(st.get().binderEntries.length, 2, "re-filing added a row");
  });

  test("[21] removing a state leaves every membership exactly where it was", () => {
    /* THE RESTORED PROMISE, and the one C3.1 was written for: nothing
       reorganises a binder but its owner. */
    const st = world();
    const a = okv(x(st, CASEY, "createBinder", { name: "A", at: AT }), "A");
    const b = okv(x(st, CASEY, "createBinder", { name: "B", at: AT }), "B");
    const g = wants(st, CASEY, "cc-x");
    const k = own(st, CASEY, "cc-x", "A");
    okv(x(st, CASEY, "setCollectorCopyKept", { copyId: k, keeping: true, at: AT }), "keep");
    for (const bd of [a, b]) {
      okv(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: "cc-x", at: AT }), "file");
    }
    okv(x(st, CASEY, "removeGoal", { goalId: g, at: AT }), "stop wanting");
    eq(st.get().binderEntries.length, 2, "dropping the Goal un-filed a card");
    /* RE-PINNED: withdrawing a keep is refused now — a copy is kept or it is on
       offer — so the state change here is the SWITCH, which is the only way a
       disposition changes. It must leave organisation alone for the same reason
       the withdrawal had to. */
    okv(x(st, CASEY, "setCollectorCopyOffered", { copyId: k, offered: true, at: AT }), "switch");
    eq(st.get().binderEntries.length, 2, "switching the disposition un-filed a card");
    okv(x(st, CASEY, "removeCollectorCopy", { copyId: k, at: AT }), "sell it");
    eq(st.get().binderEntries.length, 2,
      "selling the LAST thing said about the card un-filed it");
    assert(valid(st), "the world became invalid");
    eq(st.get().goals.length, 0, "a Goal was fabricated");
    eq(copies(st).length, 0, "a copy was fabricated");
  });

  test("[21b] and only the command that names a membership may remove one", () => {
    /* Structural, because what this replaces was a cascade buried in four
       unrelated commands. */
    const cmd = codeOf("domain/metyet-commands.js");
    const dom = codeOf("domain/metyet-domain.js");
    /* WHICH COMMANDS MENTION `binderEntries` AT ALL — robust to how a future
       cascade might be spelled. A prune written with `.filter`, `.reduce` or
       anything else would still have to live in some command, and only the two
       that are about membership may name it. */
    const bodies = cmd.split(/\n  (?=[a-zA-Z][a-zA-Z0-9]*\(state,)/);
    const touching = bodies.filter((b) => b.includes("binderEntries"))
      .map((b) => (b.match(/^\s*([a-zA-Z][a-zA-Z0-9]*)\(state,/) || [null, null])[1])
      .filter(Boolean);
    eq(touching.sort().join(","), "addBinderEntry,removeBinderEntry",
      "a command other than the two about membership touches it: " + touching.join(","));
    for (const dead of ["pruneOrphanedMemberships", "cardHasState", "cardHasNoState",
      "collectorStatesFor"]) {
      assert(!cmd.includes(dead), dead + " survives in the command layer");
      assert(!dom.includes(dead), dead + " survives in the domain");
    }
  });

  test("[22] Primary <-> Secondary never touches membership", () => {
    const st = world();
    const bd = okv(x(st, CASEY, "createBinder", { name: "B", at: AT }), "binder");
    const g = wants(st, CASEY, "cc-x", "secondary");
    okv(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: "cc-x", at: AT }), "file");
    for (const tier of ["primary", "secondary", "primary"]) {
      okv(x(st, CASEY, "updateGoalTier", { goalId: g, tier, at: AT }), tier);
      eq(st.get().binderEntries.length, 1, "moving to " + tier + " un-filed the card");
    }
  });

  test("[23] and neither does any disposition change, in any direction", () => {
    const st = world();
    const bd = okv(x(st, CASEY, "createBinder", { name: "B", at: AT }), "binder");
    const k = own(st, CASEY, "cc-x", "A");
    okv(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: "cc-x", at: AT }), "file");
    const entries = () => JSON.stringify(st.get().binderEntries);
    const before = entries();
    /* RE-PINNED: "in any direction" is now the four legal moves — each answer
       stated afresh, and each switch both ways. The two withdrawals that used
       to be in this list are refused, so they are asserted below to be refusals
       that also reorganise nothing: a refused command must leave a binder
       exactly as alone as a successful one does. */
    for (const [cmd, field] of [["setCollectorCopyOffered", { offered: true }],
      ["setCollectorCopyKept", { keeping: true }],
      ["setCollectorCopyOffered", { offered: true }],
      ["setCollectorCopyKept", { keeping: true }]]) {
      okv(x(st, CASEY, cmd, { copyId: k, ...field, at: AT }), cmd);
      eq(entries(), before, cmd + " " + JSON.stringify(field) + " reorganised a binder");
    }
    for (const [cmd, field] of [["setCollectorCopyOffered", { offered: false }],
      ["setCollectorCopyKept", { keeping: false }]]) {
      eq(code(x(st, CASEY, cmd, { copyId: k, ...field, at: AT })),
        D.REFUSE.invalidDisposition, cmd + " accepted a withdrawal");
      eq(entries(), before, cmd + " " + JSON.stringify(field) + " reorganised a binder");
    }
  });

  test("[24] a world with filed, stateless cards is valid and storable", () => {
    /* It always was — the withdrawn rule lived in the command and deliberately
       never in `validateWorld`, because condemning existing worlds is a 500 on
       the next command rather than a refusal. Now nothing holds the opinion at
       all, and this pins that `validateWorld` has not acquired one. */
    const st = world({
      binders: [{ id: "b1", collectorId: "casey", name: "Old", createdAt: AT, archivedAt: null }],
      binderEntries: [{ binderId: "b1", canonicalCardId: "cc-legacy", addedAt: AT }],
    });
    assert(valid(st), "a filed card with no state made the world unstorable");
    eq(st.get().goals.length, 0, "a Goal was fabricated for it");
    eq(copies(st).length, 0, "a copy was fabricated for it");
    /* And a command can still ADD one. Asserting that the withdrawn rule's names
       are absent from `validateWorld` would assert nothing — they were never
       there, deliberately, because condemning a stored world is a 500 on the
       next command rather than a refusal. What is worth proving is that filing
       another stateless card works and the world still stores. */
    okv(x(st, CASEY, "addBinderEntry", { binderId: "b1", canonicalCardId: "cc-other", at: AT }),
      "a second stateless card could not join it");
    assert(valid(st), "the world became unstorable");
  });

  test("[25] unfiling is untouched, and needs no state at all", () => {
    const st = world({
      binders: [{ id: "b1", collectorId: "casey", name: "Old", createdAt: AT, archivedAt: null }],
      binderEntries: [{ binderId: "b1", canonicalCardId: "cc-legacy", addedAt: AT }],
    });
    okv(x(st, CASEY, "removeBinderEntry", { binderId: "b1", canonicalCardId: "cc-legacy", at: AT }),
      "a legacy entry could not be removed");
    eq(st.get().binderEntries.length, 0, "it is still there");
  });

  test("[25b] and Archive is exactly what it was", () => {
    const st = world();
    const bd = okv(x(st, CASEY, "createBinder", { name: "Old", at: AT }), "binder");
    const g = wants(st, CASEY, "cc-x");
    okv(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: "cc-x", at: AT }), "file");
    okv(x(st, CASEY, "setBinderArchived", { binderId: bd, archived: true, at: AT }), "put away");
    eq(st.get().binderEntries.length, 1, "archiving emptied the binder");
    okv(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: "cc-y", at: AT }), "file");
    okv(x(st, CASEY, "removeGoal", { goalId: g, at: AT }), "stop wanting");
    eq(st.get().binderEntries.length, 2, "something reached into an archived binder");
    okv(x(st, CASEY, "setBinderArchived", { binderId: bd, archived: false, at: AT }), "bring back");
    eq(st.get().binderEntries.length, 2, "unarchiving changed what it held");
    eq(st.get().binders[0].archivedAt, null, "it did not come back");
  });

  test("[25c] and a membership still names a CARD, which is transitional", () => {
    /* Said out loud so nothing downstream reads more into the row than is
       there. Three actionable objects — a Goal and two copies — share ONE
       membership today, which is exactly why the row is on its way to naming
       the object instead. No test may pretend it already does. */
    const st = world();
    const bd = okv(x(st, CASEY, "createBinder", { name: "B", at: AT }), "binder");
    wants(st, CASEY, "cc-x");
    own(st, CASEY, "cc-x", "A");
    own(st, CASEY, "cc-x", "B");
    okv(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: "cc-x", at: AT }), "file");
    const row = st.get().binderEntries[0];
    eq(Object.keys(row).sort().join(","), "addedAt,binderId,canonicalCardId",
      "the membership row changed shape");
    for (const k of ["goalId", "collectorCopyId", "copyId", "objectId"]) {
      assert(!(k in row), "the row has started naming an object (" + k + ") — that is the next batch");
    }
    eq(st.get().binderEntries.length, 1, "three objects produced more than one membership");
  });
});

/* ================================================== D. the panel's ordering */
describe("D. The order the card page sends in", () => {
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
  const SPEC = build("client/collector/CardSpecification.jsx");

  test("[26] a home is given after the thing that has it exists", () => {
    /* RE-PINNED (Batch 3B-1), AND THE RULE IS NOW STRUCTURAL RATHER THAN TIDY.

       It used to read "a binder is ticked last, after what is being organised",
       and the reason was legibility: a person ticking a binder is organising
       what they have just said, which is how it reads if the sequence stops.
       True, and it was all that was at stake while a filing named a CARD —
       nothing stopped the panel sending it first.

       A filing now names a THING, and a thing being created in this Save has no
       id until its own step mints one. So the order is not a preference: the
       filing CANNOT be sent earlier, and the plan puts it immediately after, so
       a later sibling's refusal cannot cost it. */
    const state = { binders: [{ id: "bd1", collectorId: "casey", name: "Shoebox" }],
      binderEntries: [], binderMemberships: [], goals: [], collectorCopies: [], catalog: [] };
    const answers = { newBinders: [], want: "primary", goalHome: "bd1", madeGoal: null,
      desired: { grade: "PSA 9", condition: "" }, copies: [] };
    const plan = SPEC.planFrom(state, "cc-x", answers).steps;
    const kinds = plan.map((s) => s.kind);
    assert(kinds.includes("start-looking") && kinds.includes("file-object"), json(kinds));
    assert(kinds.indexOf("start-looking") < kinds.indexOf("file-object"),
      "the panel files before it says anything: " + kinds.join(","));
    /* And adjacent, which is the half the old ordering could not express. */
    eq(kinds.indexOf("file-object"), kinds.indexOf("start-looking") + 1, kinds.join(","));
    /* The filing names the handle `start-looking` declared, not an id nobody
       has yet and not the card. */
    const filing = plan.find((st) => st.kind === "file-object");
    eq(filing.goalDraftId, plan.find((st) => st.kind === "start-looking").goalDraftId,
      "the filing names something else");
    assert(!filing.goalId, "the filing named an id that does not exist yet");
    assert(!("canonicalCardId" in filing), "a filing named a card");
  });

  test("[27] and a copy is recorded before it is filed, for the same reason", () => {
    const state = { binders: [{ id: "bd1", collectorId: "casey", name: "Shoebox" }],
      binderEntries: [], binderMemberships: [], goals: [], collectorCopies: [], catalog: [] };
    const answers = { newBinders: [], want: "none", goalHome: null, madeGoal: null,
      desired: { grade: "", condition: "" },
      copies: [{ id: null, key: "n1", grade: "PSA 9", condition: "", cert: "C", market: "",
        disposition: "keeping", removed: false, home: "bd1" }] };
    const plan = SPEC.planFrom(state, "cc-x", answers).steps;
    const kinds = plan.map((s) => s.kind);
    assert(kinds.indexOf("record-copy") < kinds.indexOf("file-object"),
      "the panel files before the copy exists: " + kinds.join(","));
    eq(kinds.indexOf("file-object"), kinds.indexOf("record-copy") + 1, kinds.join(","));
    eq(plan.find((st) => st.kind === "file-object").copyDraftId, "n1",
      "the filing names something other than the copy that was just recorded");
  });

  test("[27b] and a thing with no home emits no filing at all", () => {
    /* UNFILED IS AN ANSWER AND IT COSTS NOTHING. A Collector who never opens a
       home control must produce the plan they would have produced before this
       batch, minus the card-level filing that is gone. */
    const state = { binders: [{ id: "bd1", collectorId: "casey", name: "Shoebox" }],
      binderEntries: [], binderMemberships: [], goals: [], collectorCopies: [], catalog: [] };
    const answers = { newBinders: [], want: "primary", goalHome: null, madeGoal: null,
      desired: { grade: "PSA 9", condition: "" },
      copies: [{ id: null, key: "n1", grade: "PSA 9", condition: "", cert: "C", market: "",
        disposition: "keeping", removed: false, home: null }] };
    const kinds = SPEC.planFrom(state, "cc-x", answers).steps.map((s) => s.kind);
    eq(kinds.join(","), "record-copy,start-looking", kinds.join(","));
  });

  /* A sequence that stops should leave a person with MORE said about their card
     than they started with, never less. That reason predates the withdrawn
     binder rule and survives it. */
  test("[28] and taking things away happens last of all", () => {
    const state = {
      binders: [{ id: "bd1", collectorId: "casey", name: "Shoebox" }],
      binderEntries: [{ binderId: "bd1", canonicalCardId: "cc-x" }],
      goals: [{ id: "g1", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary",
        desired: { grade: "PSA 9" } }],
      collectorCopies: [], catalog: [] };
    const answers = { binders: new Set(["bd1"]), newBinders: [], want: "none",
      desired: { grade: "", condition: "" }, copies: [] };
    const kinds = SPEC.planFrom(state, "cc-x", answers).steps.map((s) => s.kind);
    eq(kinds[kinds.length - 1], "stop-looking",
      "removing the last thing said about a card is not last: " + kinds.join(","));
  });

  test("[28b] an ownership fact is never lost to an unrelated Goal refusal", () => {
    /* WHAT THIS ORDER IS FOR NOW. It used to be that the plan put demand first
       because a card had to mean something before it could be filed. That rule
       is withdrawn, and a different one took its place: a Goal edit can be
       refused for something about a DEAL — `goal-locked`, which this panel
       deliberately never predicts — while a copy record can only be refused for
       something about the copy. `commit` halts on the first refusal, so with
       demand first, somebody who corrected her criteria and recorded a card she
       had just bought lost the card because of a negotiation it had nothing to
       do with.

       Driven end to end against the real domain, because the claim is about
       what SURVIVES a partial save, not about the order of a list. */
    const st = world({
      inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 30,
        grade: "PSA 9", photos: { front: "f", back: "b" }, archived: false }],
    });
    const g = okv(x(st, CASEY, "addGoal", { canonicalCardId: "cc-x", tier: "primary",
      desired: { grade: "PSA 9" }, at: AT }), "want");
    const oppId = okv(x(st, CASEY, "startOpportunity",
      { goalId: g, invId: "i1", amount: 26, at: AT }), "open a deal");
    assert(D.goalNamedByActive(g, st.get().opportunities), "the fixture has no live deal");

    const answers = { binders: new Set(), newBinders: [], want: "primary",
      desired: { grade: "PSA 10", condition: "" },
      copies: [{ id: null, key: "n1", grade: "PSA 8", condition: "", cert: "NEW", market: "",
        disposition: "offered", removed: false }] };
    const steps = SPEC.planFrom(st.get(), "cc-x", answers).steps;
    assert(steps.some((s) => s.kind === "record-copy") && steps.some((s) => s.kind === "wanted-copy"),
      "the fixture is not the two-fact case: " + steps.map((s) => s.kind).join(","));
    assert(steps.findIndex((s) => s.kind === "record-copy")
      < steps.findIndex((s) => s.kind === "wanted-copy"),
    "the criteria edit still runs before the copy: " + steps.map((s) => s.kind).join(","));

    /* The panel's own halt-on-first-refusal, as `commit` writes it. */
    const sent = [];
    let stopped = null;
    for (const step of steps) {
      const answer = step.kind === "record-copy"
        ? x(st, CASEY, "addCollectorCopy", { copy: { canonicalCardId: "cc-x", ...step.copy }, at: AT })
        : step.kind === "wanted-copy"
          ? x(st, CASEY, "updateGoalCriteria", { goalId: step.goalId, desired: step.desired, at: AT })
          : { ok: true };
      sent.push(step.kind);
      if (answer && answer.ok === false) { stopped = { kind: step.kind, refused: answer.refused }; break; }
    }
    /* 13 — the ownership fact landed. */
    eq(copies(st).length, 1, "the copy was lost to the Goal refusal");
    eq(copies(st)[0].cert, "NEW", "the wrong copy landed");
    eq(D.copyDisposition(copies(st)[0]), "offered", "the disposition was lost");
    /* 14 — and the Goal edit is still refused, with the criteria untouched. */
    eq(stopped && stopped.kind, "wanted-copy", "the save stopped somewhere else");
    eq(stopped.refused, D.REFUSE.goalLocked, "the criteria edit was not refused");
    eq(st.get().goals[0].desired.grade, "PSA 9", "the criteria changed underneath a live deal");
    /* 15 — and a retry with the draft bound creates no second copy. */
    const bound = { ...answers,
      copies: answers.copies.map((d) => ({ ...d, id: copies(st)[0].id })) };
    const retry = SPEC.planFrom(st.get(), "cc-x", bound).steps.map((s) => s.kind);
    assert(!retry.includes("record-copy"),
      "the retry would record a second physical copy: " + retry.join(","));
    eq(retry.join(","), "wanted-copy", "the retry sends more than what is left: " + retry.join(","));
    assert(valid(st), "the world became invalid");
  });
  test("[29] a copy's disposition is one of two answers, and sends one command", () => {
    /* RE-PINNED: THREE ANSWERS BECAME TWO, AND THE THIRD IS NOT A STEP.

       This test used to assert that going back to saying nothing sent
       `offering: false`. The disposition batch removed that button and the
       domain refuses that command: a copy is kept or it is on offer, because a
       copy that says nothing is barred from every trade package and reaches no
       partner. What survives, and is what the test was always for, is that one
       answer sends exactly one command and no change sends none.

       `"unanswered"` is now the panel's DRAFT sentinel — what a half-filled row
       looks like, and what a copy stored before the rule opens as — and the
       plan must emit nothing for it rather than a withdrawal. */
    const base = { binders: [], binderEntries: [], goals: [], catalog: [],
      collectorCopies: [{ id: "k1", collectorId: "casey", canonicalCardId: "cc-x",
        grade: "PSA 9", offered: true }] };
    const plan = (disposition) => SPEC.planFrom(base, "cc-x",
      { binders: new Set(), newBinders: [], want: "none", desired: { grade: "", condition: "" },
        copies: [{ id: "k1", grade: "PSA 9", condition: "", cert: "", market: "",
          disposition, removed: false }] }).steps;
    eq(plan("offered").length, 0, "no change sent a command anyway");
    eq(json(plan("keeping").map((s) => s.kind)), json(["keeping"]), "keeping sent the wrong thing");
    eq(plan("keeping")[0].keeping, true, "the switch was not stated positively");
    eq(json(plan("unanswered").map((s) => s.kind)), json([]),
      "an unanswered draft sent a command");
    /* And a copy stored saying nothing, opened and left alone, sends nothing —
       both sides of the comparison read the sentinel for that case. */
    const quiet = { binders: [], binderEntries: [], goals: [], catalog: [],
      collectorCopies: [{ id: "k1", collectorId: "casey", canonicalCardId: "cc-x",
        grade: "PSA 9", offered: false }] };
    eq(json(SPEC.planFrom(quiet, "cc-x",
      { binders: new Set(), newBinders: [], want: "none", desired: { grade: "", condition: "" },
        copies: [{ id: "k1", grade: "PSA 9", condition: "", cert: "", market: "",
          disposition: "unanswered", removed: false }] }).steps), json([]),
    "looking at a copy that says nothing proposed a decision for it");
  });
});

/* ==================================== D2. what the adversarial pass caught */
describe("D2. Where the four states nearly stayed a domain-only idea", () => {
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

  test("[30] a new copy recorded as PC is STORED as PC", () => {
    /* THE BATCH'S HEADLINE, ALMOST INVISIBLE. `addOwnedCopy` rebuilds its
       payload from a fixed field list, and `keeping` was not on it — so the
       panel's "I'm keeping this one" survived the plan, survived the binding
       switch, and was dropped one line before the command. The copy stored
       silently as unstated and the person had to say it a second time. That is
       the same shape as the batch-6 defect where the headline fix rendered from
       a source the screen never read. */
    const CLIENT = load("client/commands.js");
    const sent = [];
    const add = CLIENT.addOwnedCopy({ execute: (name, payload) => { sent.push([name, payload]); } });
    add({ canonicalCardId: "cc-x", grade: "PSA 9", keeping: true });
    eq(sent[0][0], "addCollectorCopy", "the wrong command");
    eq(sent[0][1].copy.keeping, true, "the decision to keep was dropped at the boundary");
    /* And it goes all the way into a stored row. */
    const st = world();
    const id = okv(x(st, CASEY, "addCollectorCopy", { copy: sent[0][1].copy, at: AT }), "add");
    eq(D.copyDisposition(copies(st).find((c) => c.id === id)), "keeping", "it did not land");
  });

  test("[31] neither setter ever stores `keeping: false`", () => {
    /* ABSENCE IS THE HONEST ANSWER, and it is what every copy written before PC
       existed looks like. Writing `false` would make "I have not decided" and
       "I decided not to" the same row, which is the confusion migration 0012
       exists to remember. */
    /* RE-PINNED: THE GUARANTEE IS UNCHANGED AND THE WITHDRAWALS THAT PROVED IT
       ARE NOW REFUSED.

       `keeping: false` must never be stored, because absence is what "no keep
       stated" looks like and writing `false` would make "I have not decided"
       and "I decided not to" the same row — the confusion migration 0012 exists
       to remember. That still holds, and now has two proofs: the key is absent
       after a switch AWAY from PC, and the withdrawal that used to be the other
       route is refused without writing anything. */
    const st = world();
    const k = own(st, CASEY, "cc-x", "A", { offered: true });
    const has = () => "keeping" in copyOf(st, "A");
    assert(!has(), "a Trade/Sell copy was born with a keeping key");
    okv(x(st, CASEY, "setCollectorCopyKept", { copyId: k, keeping: true, at: AT }), "keep");
    eq(copyOf(st, "A").keeping, true, "the keep did not land");
    /* Switching away from PC is the only way to stop keeping a copy, and it
       removes the key rather than writing `false`. */
    okv(x(st, CASEY, "setCollectorCopyOffered", { copyId: k, offered: true, at: AT }), "switch back");
    assert(!has(), "switching away from PC left a decision behind: "
      + JSON.stringify(copyOf(st, "A")));
    /* And the refusals write nothing at all. */
    for (const [cmd, field] of [["setCollectorCopyKept", { keeping: false }],
      ["setCollectorCopyOffered", { offered: false }]]) {
      const before = JSON.stringify(copyOf(st, "A"));
      eq(code(x(st, CASEY, cmd, { copyId: k, ...field, at: AT })),
        D.REFUSE.invalidDisposition, cmd + " accepted a withdrawal");
      eq(JSON.stringify(copyOf(st, "A")), before, cmd + " wrote something");
      assert(!has(), cmd + " wrote a keeping: false");
    }
    /* RE-PINNED: the copy does NOT return to saying nothing, and that is the
       point of the batch rather than a loss. It keeps the answer it had. */
    eq(D.copyDisposition(copyOf(st, "A")), "offered",
      "a refused withdrawal changed the copy's answer");
    /* And a keep cleared BY AN OFFER leaves no residue either. */
    okv(x(st, CASEY, "setCollectorCopyKept", { copyId: k, keeping: true, at: AT }), "keep");
    okv(x(st, CASEY, "setCollectorCopyOffered", { copyId: k, offered: true, at: AT }), "offer");
    assert(!has(), "the cleared keep was stored as a decision not to keep");
  });

  test("[34] Your Cards shows a kept copy AS kept, and says nothing about silence", () => {
    /* It read "Offered" or "Not offered", which showed a copy somebody had
       deliberately marked PC in the same words as one they have never
       mentioned — the exact conflation this batch exists to end. */
    const src = codeOf("client/collector/sections/Collection.jsx");
    assert(!/"Not offered"/.test(src), "Your Cards still reports an absence as an answer");
    assert(/keeping === true/.test(src) && /Keeping/.test(src),
      "Your Cards cannot show a copy its owner is keeping");
  });
});

/* ============================================== E. what must not have moved */
describe("E. The boundaries this batch did not cross", () => {
  test("[35] Binder membership still creates no demand", () => {
    const st = world({
      inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 30,
        grade: "PSA 9", photos: { front: "f", back: "b" }, archived: false }],
    });
    const bd = okv(x(st, CASEY, "createBinder", { name: "B", at: AT }), "binder");
    const k = own(st, CASEY, "cc-x", "A");
    okv(x(st, CASEY, "setCollectorCopyKept", { copyId: k, keeping: true, at: AT }), "keep");
    okv(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: "cc-x", at: AT }), "file");
    const v = P.projectForActor(st.get(), CASEY);
    eq((v.discoveries || []).length, 0,
      "filing or keeping a card became demand: " + JSON.stringify(v.discoveries));
  });

  test("[36] PC is not demand, and Trade/Sell is not demand either", () => {
    const st = world({
      inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 30,
        grade: "PSA 9", photos: { front: "f", back: "b" }, archived: false }],
    });
    const k = own(st, CASEY, "cc-x", "A");
    for (const [cmd, field] of [["setCollectorCopyKept", { keeping: true }],
      ["setCollectorCopyOffered", { offered: true }]]) {
      okv(x(st, CASEY, cmd, { copyId: k, ...field, at: AT }), cmd);
      eq((P.projectForActor(st.get(), CASEY).discoveries || []).length, 0,
        `${cmd} created demand`);
    }
  });

  test("[37] an exact Goal still matches, exactly", () => {
    const st = world({
      inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 30,
        grade: "PSA 9", photos: { front: "f", back: "b" }, archived: false }],
    });
    wants(st, CASEY, "cc-x", "primary");
    eq((P.projectForActor(st.get(), CASEY).discoveries || []).length, 1, "the match was lost");

    const miss = world({
      inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 30,
        grade: "PSA 9", photos: { front: "f", back: "b" }, archived: false }],
      goals: [{ id: "g1", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary",
        desired: { grade: "PSA 10" } }],
    });
    eq((P.projectForActor(miss.get(), CASEY).discoveries || []).length, 0,
      "a PSA 10 goal matched a PSA 9 copy — stated is no longer exact");
  });

  test("[38] qualification is still transaction-free", () => {
    const st = world({
      inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 30,
        grade: "PSA 9", photos: { front: null, back: null }, archived: false }],
    });
    wants(st, CASEY, "cc-x", "primary");
    okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "inspect");
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    eq(st.get().opportunities.length, 0, "qualification started a transaction");
    eq(D.inventoryCopyStatus("i1", st.get().opportunities, st.get().inventory), "available",
      "qualification changed availability");
  });

  test("[39] the allow-list grew by exactly one, and the transaction is shut", () => {
    /* RE-PINNED (Batch 3C-1): 25 → 24. `addBinderEntry` left the door by
       name; any other change to the size still fails here. */
    eq(EXPOSED_COMMANDS.length, 24, "the production surface is not the size this batch declared");
    assert(EXPOSED_COMMANDS.includes("setCollectorCopyKept"), "PC has a control but no door");
    const { COMMAND_NAMES } = require("../domain/metyet-commands.js");
    const known = COMMAND_NAMES.has ? (n) => COMMAND_NAMES.has(n)
      : (n) => [...COMMAND_NAMES].includes(n);
    for (const shut of ["startOpportunity", "proposePrice", "acceptPrice", "acceptMarketValue",
      "proposeMarketValue", "acceptDeal", "setCopyPending", "proposeTradeSelection",
      "confirmHandoff", "setInterest", "sendMessage"]) {
      assert(known(shut), `${shut} is not a command, so this line asserts nothing`);
      assert(!EXPOSED_COMMANDS.includes(shut), `${shut} was exposed`);
    }
  });

  test("[40] no migration, and no generic state field anywhere", () => {
    const migrations = fs.readdirSync(path.join(ROOT, "persistence/migrations"))
      .filter((f) => f.endsWith(".sql")).sort();
    eq(migrations[migrations.length - 1], "0014_binder_memberships.sql", migrations.join(","));
    /* CLOSED DECISIONS: no generic `intent`, no generic `cardState`. What is
       forbidden is a FIELD — something written on a card, Goal or copy that
       joins the four truths into one. The word itself is not forbidden: the
       deal stages have been grouped under "intent" since Phase 1, and that is a
       grouping of stages, not a fact about a card. So this looks for the field
       shapes, and separately pins that the surviving word is only ever a
       `group:` value. */
    const src = codeOf("domain/metyet-domain.js") + codeOf("domain/metyet-commands.js")
      + codeOf("domain/metyet-projection.js") + codeOf("domain/metyet-world.js");
    for (const invented of ["cardState", "intent", "collectionState", "pcFlag", "noticed",
      "bookmarked", "savedCard"]) {
      for (const shape of [`${invented}:`, `.${invented}`, `["${invented}"]`]) {
        assert(!src.includes(shape), `a generic concept called ${invented} appeared as ${shape}`);
      }
    }
    for (const m of src.match(/.{0,14}"intent"/g) || []) {
      assert(/group: "intent"|!== "intent"/.test(m), `"intent" is being used as a fact: ${m}`);
    }
  });

  test("[41] curiosity is still not durable", () => {
    /* CLOSED DECISION: MetYet does not persist "this caught my attention". */
    const src = codeOf("domain/metyet-commands.js") + codeOf("domain/metyet-world.js");
    for (const word of ["noticed", "bookmark", "favourite", "favorite", "watchlist",
      "shortlist", "wishlist"]) {
      assert(!new RegExp(word, "i").test(src), `a ${word} concept appeared in the domain`);
    }
    const st = world();
    eq(st.get().binderEntries.length + st.get().goals.length + copies(st).length, 0,
      "a world starts holding something nobody said");
  });

  test("[42] the four Collector tabs are unchanged", () => {
    const out = esbuild.buildSync({
      entryPoints: [path.join(ROOT, "client/collector/CollectorShell.jsx")],
      bundle: true, format: "cjs", write: false, logLevel: "silent", jsx: "automatic",
      external: ["react", "react-dom", "react/jsx-runtime"],
      define: { "process.env.NODE_ENV": '"production"' },
    });
    const mod = { exports: {} };
    new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
    eq(mod.exports.SECTIONS.map((s) => s.label).join(" · "),
      "Browse · Binders · Trusted Partners · Deal Flow", "the navigation moved");
  });
});

const json = (v) => JSON.stringify(v);

if (require.main === module) run();
module.exports = {};
