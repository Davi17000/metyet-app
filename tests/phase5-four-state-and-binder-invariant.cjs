/* ============================================================================
   THE FOUR STATES, AND WHAT A BINDER IS FOR

   A card in a Collector's world means one of four things, and the four live at
   two different levels because that is what makes them true:

     Primary Goal    I am actively hunting this card, in this grade   (CARD)
     Secondary Goal  I want it, in this grade, less urgently          (CARD)
     Trade/Sell      I own this copy and would part with it           (COPY)
     PC              I own this copy and intend to keep it            (COPY)

   THE LEVELS ARE THE POINT, AND THE TWO-COPY CASE IS WHY. Somebody who owns two
   copies of one card may truthfully keep one and offer the other. Flattening
   the four onto the card would make that unsayable, so they are mutually
   exclusive PER COPY and not per card — and a Goal for a card you already own
   is not a contradiction either, it is somebody hunting a better copy. There is
   no `cardState`, no `intent` field, and nothing that joins the four.

   PC IS POSITIVE AND IS NEVER INFERRED. `offered === false` means only that no
   offer has been made: three places in the product say so and a migration
   exists because that confusion already cost a Collector their visible supply.
   A copy that has said nothing carries no `keeping` key at all — which is what
   every copy in every existing world honestly is, PC having only just become
   sayable. Absence is unstated, not "not keeping".

   AND A BINDER NEEDS SOMETHING TO BE COHERENT ABOUT:

     NO STATE, NO MEMBERSHIP.

   Filing used to be unconditional, and C3.1 asserted that on purpose. What it
   produced most often was a binder full of cards that appeared nowhere else in
   the product and did nothing. A card the Collector has said NOTHING about has
   no relationship for a binder to be coherent about — so it cannot be filed.

   OWNING COUNTS, WHATEVER THE DISPOSITION. "I own this and have not decided
   whether I would part with it" is a real state and the state every copy in
   every existing world is in. Requiring a disposition before filing would make
   the commonest card in the product unfilable and would push people into
   declaring an intention they have not formed.

   ENFORCED AT THE COMMAND, NEVER IN `validateWorld`. Worlds written before this
   rule hold filed cards with no state; they were legal when written and they
   are not corrupt. Making them invalid would be a 500 on the next command
   anybody sends rather than a refusal, and this repository has learned that
   three times. Nothing fabricates a state to rescue them.
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
const own = (st, actor, card, cert, extra = {}) => okv(x(st, actor, "addCollectorCopy",
  { copy: { canonicalCardId: card, grade: "PSA 9", cert, ...extra }, at: AT }), `own ${cert}`);
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
    const st = world();
    const k = own(st, CASEY, "cc-x", "A");
    eq(D.copyDisposition(copyOf(st, "A")), "unstated", "a new copy came with an opinion");
    assert(!D.copyKept(copyOf(st, "A")), "a new copy was born being kept");

    okv(x(st, CASEY, "setCollectorCopyOffered", { copyId: k, offered: true, at: AT }), "offer");
    okv(x(st, CASEY, "setCollectorCopyOffered", { copyId: k, offered: false, at: AT }), "withdraw");
    assert(!D.copyKept(copyOf(st, "A")),
      "withdrawing an offer was read as a decision to keep");
    eq(D.copyDisposition(copyOf(st, "A")), "unstated",
      "the absence of an offer became a positive statement");

    /* And "no" is not stored as a fact either. The panel sends a boolean for
       every new copy; a copy that said nothing must still carry NO key, because
       that is what every copy written before PC existed looks like and the two
       must be indistinguishable. */
    own(st, CASEY, "cc-x", "B", { keeping: false });
    assert(!("keeping" in copyOf(st, "B")), "a copy was stored as explicitly not-kept");
    eq(D.copyDisposition(copyOf(st, "B")), "unstated", "an explicit no became a statement");
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
    const st = world();
    const k = own(st, CASEY, "cc-x", "A");
    for (const patch of [{ offered: true }, { keeping: true }, { offered: false, keeping: true }]) {
      eq(code(x(st, CASEY, "updateCollectorCopy", { copyId: k, patch, at: AT })),
        D.REFUSE.identityImmutable, `${JSON.stringify(patch)} got through a patch`);
    }
    eq(D.copyDisposition(copyOf(st, "A")), "unstated", "a patch changed the disposition");
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

/* ===================================================== C. the Binder invariant */
describe("C. No state, no membership", () => {
  const withBinder = () => {
    const st = world();
    return { st, bd: okv(x(st, CASEY, "createBinder", { name: "Shoebox", at: AT }), "binder") };
  };

  test("[16] a card nobody has said anything about cannot be filed", () => {
    const { st, bd } = withBinder();
    eq(code(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: "cc-none", at: AT })),
      D.REFUSE.cardHasNoState, "a meaningless card was filed");
    eq(st.get().binderEntries.length, 0, "and an entry was written anyway");
    eq(st.get().goals.length, 0, "a Goal was invented to make it legal");
    eq(copies(st).length, 0, "a copy was invented to make it legal");
  });

  test("[17] every one of the four states qualifies, and so does plain ownership", () => {
    const { st, bd } = withBinder();
    wants(st, CASEY, "cc-p", "primary");
    wants(st, CASEY, "cc-s", "secondary");
    const o = own(st, CASEY, "cc-o", "O");
    okv(x(st, CASEY, "setCollectorCopyOffered", { copyId: o, offered: true, at: AT }), "offer");
    const kp = own(st, CASEY, "cc-k", "K");
    okv(x(st, CASEY, "setCollectorCopyKept", { copyId: kp, keeping: true, at: AT }), "keep");
    own(st, CASEY, "cc-u", "U");        // owned, nothing said
    for (const card of ["cc-p", "cc-s", "cc-o", "cc-k", "cc-u"]) {
      eq(code(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: card, at: AT })), "OK",
        `${card} could not be filed`);
    }
    eq(st.get().binderEntries.length, 5, "not everything landed");
  });

  test("[18] somebody else's state does not qualify your card", () => {
    const { st, bd } = withBinder();
    wants(st, JORDAN, "cc-x");
    own(st, JORDAN, "cc-y", "J");
    for (const card of ["cc-x", "cc-y"]) {
      eq(code(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: card, at: AT })),
        D.REFUSE.cardHasNoState, `${card}: another Collector's state qualified it`);
    }
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
      eq(code(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: "cc-x", at: AT })),
        D.REFUSE.cardHasNoState, "filed with no state");
    }
    wants(st, CASEY, "cc-x");
    for (const bd of [a, b]) {
      okv(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: "cc-x", at: AT }), "file");
    }
    eq(st.get().binderEntries.length, 2, "one card, two places it belongs");
  });

  test("[21] removing ONE of several states leaves membership alone", () => {
    const st = world();
    const bd = okv(x(st, CASEY, "createBinder", { name: "B", at: AT }), "binder");
    const g = wants(st, CASEY, "cc-x");
    const k = own(st, CASEY, "cc-x", "A");
    okv(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: "cc-x", at: AT }), "file");
    okv(x(st, CASEY, "removeGoal", { goalId: g, at: AT }), "stop wanting");
    eq(st.get().binderEntries.length, 1, "dropping the Goal un-filed a card still owned");
    okv(x(st, CASEY, "removeCollectorCopy", { copyId: k, at: AT }), "sell the copy");
    eq(st.get().binderEntries.length, 1, "selling the copy un-filed the card");
    assert(valid(st), "the world became invalid");
  });

  test("[22] Primary ↔ Secondary never invalidates membership", () => {
    const st = world();
    const bd = okv(x(st, CASEY, "createBinder", { name: "B", at: AT }), "binder");
    const g = wants(st, CASEY, "cc-x", "secondary");
    okv(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: "cc-x", at: AT }), "file");
    for (const tier of ["primary", "secondary", "primary"]) {
      okv(x(st, CASEY, "updateGoalTier", { goalId: g, tier, at: AT }), tier);
      eq(st.get().binderEntries.length, 1, `moving to ${tier} un-filed the card`);
    }
  });

  test("[23] a disposition change never touches membership", () => {
    const st = world();
    const bd = okv(x(st, CASEY, "createBinder", { name: "B", at: AT }), "binder");
    const k = own(st, CASEY, "cc-x", "A");
    okv(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: "cc-x", at: AT }), "file");
    for (const [cmd, field] of [["setCollectorCopyOffered", { offered: true }],
      ["setCollectorCopyKept", { keeping: true }], ["setCollectorCopyOffered", { offered: false }]]) {
      okv(x(st, CASEY, cmd, { copyId: k, ...field, at: AT }), cmd);
      eq(st.get().binderEntries.length, 1, `${cmd} reorganised a binder`);
    }
  });

  test("[24] a legacy world with filed, stateless cards is still storable", () => {
    /* THE LESSON THIS REPOSITORY HAS LEARNED THREE TIMES. A world that was legal
       when it was written must not become unstorable, because that is an error
       raised on the next command anybody sends rather than a refusal. */
    const st = world({
      binders: [{ id: "b1", collectorId: "casey", name: "Old", createdAt: AT, archivedAt: null }],
      binderEntries: [{ binderId: "b1", canonicalCardId: "cc-legacy", addedAt: AT }],
    });
    assert(valid(st), "a legacy filed card made the world unstorable");
    /* And nothing invents a state for it. */
    eq(st.get().goals.length, 0, "a Goal was fabricated for a legacy row");
    eq(copies(st).length, 0, "a copy was fabricated for a legacy row");
    /* The rule is not in validateWorld, by design. */
    assert(!/cardHasNoState|cardMeansSomething/.test(codeOf("domain/metyet-world.js")),
      "the invariant reached validateWorld, which would condemn existing worlds");
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
});

/* ================================================== D. the panel's ordering */
describe("D. The card page sends state before membership", () => {
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

  test("[26] the commonest flow in the product is not refused at its second step", () => {
    /* FIND A CARD IN BROWSE, TICK A BINDER, SAY YOU WANT IT, SAVE. The plan used
       to file first, which the invariant would have refused before the Goal that
       makes it legal had been written. */
    const state = { binders: [{ id: "bd1", collectorId: "casey", name: "Shoebox" }],
      binderEntries: [], goals: [], collectorCopies: [], catalog: [] };
    const answers = { binders: new Set(["bd1"]), newBinders: [], want: "primary",
      desired: { grade: "PSA 9", condition: "" }, copies: [] };
    const kinds = SPEC.planFrom(state, "cc-x", answers).steps.map((s) => s.kind);
    assert(kinds.includes("start-looking") && kinds.includes("file"), json(kinds));
    assert(kinds.indexOf("start-looking") < kinds.indexOf("file"),
      "the panel files before it says anything: " + kinds.join(","));
  });

  test("[27] recording a copy also precedes filing", () => {
    const state = { binders: [{ id: "bd1", collectorId: "casey", name: "Shoebox" }],
      binderEntries: [], goals: [], collectorCopies: [], catalog: [] };
    const answers = { binders: new Set(["bd1"]), newBinders: [], want: "none",
      desired: { grade: "", condition: "" },
      copies: [{ id: null, key: "n1", grade: "PSA 9", condition: "", cert: "C", market: "",
        disposition: "keeping", removed: false }] };
    const kinds = SPEC.planFrom(state, "cc-x", answers).steps.map((s) => s.kind);
    assert(kinds.indexOf("record-copy") < kinds.indexOf("file"),
      "the panel files before the copy exists: " + kinds.join(","));
  });

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

  test("[29] a copy's disposition is one of three answers, and sends one command", () => {
    const base = { binders: [], binderEntries: [], goals: [], catalog: [],
      collectorCopies: [{ id: "k1", collectorId: "casey", canonicalCardId: "cc-x",
        grade: "PSA 9", offered: true }] };
    const plan = (disposition) => SPEC.planFrom(base, "cc-x",
      { binders: new Set(), newBinders: [], want: "none", desired: { grade: "", condition: "" },
        copies: [{ id: "k1", grade: "PSA 9", condition: "", cert: "", market: "",
          disposition, removed: false }] }).steps;
    eq(plan("offered").length, 0, "no change sent a command anyway");
    eq(json(plan("keeping").map((s) => s.kind)), json(["keeping"]), "keeping sent the wrong thing");
    eq(json(plan("unstated").map((s) => s.kind)), json(["offering"]),
      "going back to saying nothing withdrew the wrong statement");
    eq(plan("unstated")[0].offered, false, "it did not withdraw the offer");
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
    const st = world();
    const k = own(st, CASEY, "cc-x", "A");
    const has = () => "keeping" in copyOf(st, "A");
    okv(x(st, CASEY, "setCollectorCopyOffered", { copyId: k, offered: true, at: AT }), "offer");
    assert(!has(), "offering wrote a keeping: false");
    okv(x(st, CASEY, "setCollectorCopyOffered", { copyId: k, offered: false, at: AT }), "withdraw");
    assert(!has(), "withdrawing an offer wrote a keeping: false");
    okv(x(st, CASEY, "setCollectorCopyKept", { copyId: k, keeping: true, at: AT }), "keep");
    eq(copyOf(st, "A").keeping, true, "the keep did not land");
    okv(x(st, CASEY, "setCollectorCopyKept", { copyId: k, keeping: false, at: AT }), "un-keep");
    assert(!has(), "withdrawing a keep left a decision behind: "
      + JSON.stringify(copyOf(st, "A")));
    eq(D.copyDisposition(copyOf(st, "A")), "unstated", "it did not return to unstated");
    /* And a keep cleared BY AN OFFER leaves no residue either. */
    okv(x(st, CASEY, "setCollectorCopyKept", { copyId: k, keeping: true, at: AT }), "keep");
    okv(x(st, CASEY, "setCollectorCopyOffered", { copyId: k, offered: true, at: AT }), "offer");
    assert(!has(), "the cleared keep was stored as a decision not to keep");
  });

  test("[32] the panel can say the one rule this batch added", () => {
    const SPEC = load("client/collector/CardSpecification.jsx");
    const msg = SPEC.explain({ kind: "file" }, D.REFUSE.cardHasNoState, []);
    assert(!/would not accept it/.test(msg),
      "the new refusal falls through to the generic sentence: " + msg);
    assert(/binder/i.test(msg) && /(want|own)/i.test(msg),
      "the sentence does not name what would make it legal: " + msg);
    /* And the new step has a name in both halves. */
    const ok = SPEC.explain({ kind: "file" }, "goal-locked", [{ kind: "keeping" }]);
    assert(!/something was saved/.test(ok), "the keep step has no name: " + ok);
    const bad = SPEC.explain({ kind: "keeping" }, "not-found", []);
    assert(!/something could not be saved/.test(bad), "the keep step has no name: " + bad);
  });

  test("[33] and it says it BEFORE sending, on the screen built for filing", () => {
    /* "Add cards to this binder" opens the panel with a binder already ticked,
       on a card the person may have said nothing about. Without a local check
       Save looks live, fires, and comes back with a refusal. */
    const SPEC = load("client/collector/CardSpecification.jsx");
    const state = { binders: [{ id: "bd1", collectorId: "casey", name: "Shoebox" }],
      binderEntries: [], goals: [], collectorCopies: [], catalog: [], partners: [] };
    const card = { canonicalCardId: "cc-x", name: "Mudkip" };
    const r = TR.create(React.createElement(SPEC.default,
      { card, state, preselectBinder: "bd1", onCommit: () => ({ ok: true }), onClose: () => {} }));
    const flat = [];
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (!n || typeof n !== "object") return;
      for (const c of n.children || []) {
        if (typeof c === "string") flat.push(c); else walk(c);
      }
    };
    walk(r.toJSON());
    const shown = flat.join(" ");
    assert(/binder holds cards you're looking for or copies you own/.test(shown),
      "the panel does not explain why this cannot be saved: " + shown.slice(0, 400));
    r.unmount();
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
    eq(EXPOSED_COMMANDS.length, 23, "the production surface is not the size this batch declared");
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
    eq(migrations[migrations.length - 1], "0013_binders.sql", migrations.join(","));
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
