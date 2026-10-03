/* ============================================================================
   A GOAL'S TIER IS A CHOICE, AND A CHOICE CANNOT BE MADE BY ACCIDENT

   Primary and Secondary are the two things a Collector can mean about a card
   they are looking for:

     Primary Goal    I am actively hunting this card, in this grade
     Secondary Goal  I want it, in this grade, less urgently

   The difference is not cosmetic. `INVARIANTS.goalIsPursued` is `tier ===
   "primary"`, and `startOpportunity` consults it among its other gates — the
   one of them that asks about the Collector's own intent rather than about
   inventory, identity or the relationship. A Secondary Goal cannot begin a
   deal. So the tier is the difference between a Goal that can turn into a
   transaction and one that cannot.

   WHAT BOTH WRITERS USED TO DO. `addGoal` and `updateGoalTier` each read

       tier === "primary" ? "primary" : "secondary"

   which is not validation. It is the domain answering a question the Collector
   was asked and did not answer. `undefined`, `null`, `""`, `"Primary"`,
   `"PRIMARY"`, `"banana"`, `1`, `true`, `["primary"]` and `{}` all became a
   Secondary Goal, were stored, and came back 200. A caller that fumbled the
   field — a client shipped with a renamed constant, a mis-cased string from an
   import, a `tier` that arrived `undefined` because the object it was read from
   was the wrong one — was told it had succeeded, and the Collector's hunt had
   quietly become a watch-list entry with no event anywhere recording it.

   `validateWorld` has required the exact two strings since it was written, and
   it does real work — it guards hand-built seeds and worlds read back from
   persistence, and `phase3-domain-readiness` already feeds it a bad tier and
   expects a rejection. What it could not do is answer a caller: it runs on
   save and on load, so a malformed tier arriving through a COMMAND was
   normalised long before the validator ever saw the world, and the Collector
   got a 200. The DB is weaker still: `goals.tier` is a generated column over
   `attrs ->> 'tier'`, nullable, with no CHECK.

   SO: BOTH WRITERS REFUSE, WITH ONE CODE, AND MUTATE NOTHING. `invalid-tier`,
   named for `invalid-amount`, which answers the same shape of question about a
   number the domain has no value for.

   WHAT THIS SUITE DELIBERATELY DOES NOT TOUCH. Not `CollectorCopy`, not
   `offered`/`keeping`, not Binder membership, not Goal criteria or the
   temporary criteria lock, not Goal cardinality, not the persistence schema,
   not `validateWorld`, not the Opportunity progression. Section C exists to
   prove that the transaction locks mean today exactly what they meant
   yesterday.
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");
const W = require("../domain/metyet-world.js");
const { createStore } = require("./fixture-store.cjs");
const RT = require("../domain/metyet-runtime.js");
const C = require("../domain/metyet-commands.js");

const ROOT = path.join(__dirname, "..");
const AT = "2026-09-30";

const CASEY = { collectorId: "casey" };
const TP = { partnerId: "nl" };

const world = (over = {}) => createStore({
  partners: [{ id: "nl", name: "Northline", tradeRate: 0.7 }],
  collectors: [{ id: "casey", name: "Casey" }],
  relationships: [{ partnerId: "nl", collectorId: "casey", status: "accepted", at: AT }],
  goals: [{ id: "g1", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary",
    desired: { grade: "PSA 9" } }],
  inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 30,
    grade: "PSA 9", cert: "SHOP-1", photos: { front: "f", back: "b" }, archived: false }],
  collectorCopies: [], binders: [], binderEntries: [], opportunities: [], catalog: [],
  copyReviews: [], photoRequests: [], conversations: [], interests: [],
  ...over,
});

const x = (st, actor, cmd, payload) => st.execute(actor, cmd, { ...(payload || {}), at: AT });
const code = (r) => {
  assert(r && typeof r === "object", "a command returned nothing at all");
  return r.ok !== false ? "OK" : r.refused;
};
const okv = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
const snap = (st) => JSON.stringify(st.get());
const tierOf = (st, id) => (st.get().goals.find((g) => g.id === id) || {}).tier;
const valid = (st) => W.validateWorld(st.get()).ok;

/* EVERY SHAPE THAT USED TO MEAN "SECONDARY". The absent case is listed twice
   on purpose: a key that was never sent and a key explicitly set to
   `undefined` reach the command identically today, and a future reader
   wondering whether only one of them is covered should not have to check. */
const MALFORMED = [
  ["omitted", undefined, true],
  ["undefined", undefined, false],
  ["null", null, false],
  ["empty string", "", false],
  ["whitespace", "   ", false],
  ["title case", "Primary", false],
  ["upper case", "PRIMARY", false],
  ["title case secondary", "Secondary", false],
  ["padded", " primary ", false],
  ["arbitrary string", "banana", false],
  ["zero", 0, false],
  ["one", 1, false],
  ["true", true, false],
  ["array", ["primary"], false],
  ["object", { tier: "primary" }, false],
];
/* `omit` says whether to leave the key out entirely rather than send it. */
const withTier = (base, value, omit) => (omit ? { ...base } : { ...base, tier: value });

/* ==================================================== A. stating a new Goal */
describe("A. addGoal accepts the two tiers and refuses everything else", () => {

  test("[1] both tiers are accepted, and stored exactly as chosen", () => {
    for (const tier of ["primary", "secondary"]) {
      const st = world();
      const id = okv(x(st, CASEY, "addGoal",
        { canonicalCardId: "cc-z", tier, desired: { grade: "PSA 9" } }), tier);
      eq(tierOf(st, id), tier, `${tier} was not stored as chosen`);
      assert(valid(st), `${tier} produced a world the validator rejects`);
    }
  });

  test("[2] every malformed tier is refused, and none of them becomes Secondary", () => {
    for (const [label, value, omit] of MALFORMED) {
      const st = world();
      const before = snap(st);
      const r = x(st, CASEY, "addGoal", withTier(
        { canonicalCardId: "cc-z", desired: { grade: "PSA 9" } }, value, omit));
      /* The refusal has to be THIS one. A tier fault answered as `not-found` or
         `criteria-required` would send the caller to fix the wrong field. */
      eq(code(r), D.REFUSE.invalidTier, `${label}: was not refused as an invalid tier`);
      eq(snap(st), before, `${label}: a refused Goal changed the world`);
      eq(st.get().goals.length, 1, `${label}: a Goal was written anyway`);
    }
  });

  test("[3] and the legacy demo path is held to the same rule", () => {
    /* `cardId` is the prototype's way of naming a card. It is exempt from the
       criteria requirement, deliberately and on the record — it is not exempt
       from this one, because a tier is not a criterion, it is the whole
       meaning of the Goal. */
    const st = world({ catalog: [{ id: "legacy-1", name: "Pikachu", number: "58" }] });
    const before = snap(st);
    eq(code(x(st, CASEY, "addGoal", { cardId: "legacy-1", tier: "banana" })),
      D.REFUSE.invalidTier, "the demo path still coerced");
    eq(snap(st), before, "the demo path wrote a Goal anyway");
  });

  test("[4] the answer to a malformed tier does not depend on the world", () => {
    /* THE ORDERING CHOICE IN `addGoal`, PINNED.

       The gate sits directly after the seat check: who is asking precedes what
       they asked, and after that everything answerable without reading the
       world is answered before anything that reads it. The point is stability
       — the same malformed request gets the same refusal whatever else happens
       to be true. Each case below is malformed in its tier AND in something
       the command used to answer for, and every one of them must now say
       `invalid-tier`. */
    const st = world();
    const cases = [
      ["a grading shape fault", { canonicalCardId: "cc-z", desired: { grade: "Raw" } }],
      ["a card that is not there", { cardId: "nope" }],
      ["a card already on the list", { canonicalCardId: "cc-x", desired: { grade: "PSA 9" } }],
      ["no criteria at all", { canonicalCardId: "cc-z" }],
    ];
    for (const [label, payload] of cases) {
      eq(code(x(st, CASEY, "addGoal", { ...payload, tier: "banana" })),
        D.REFUSE.invalidTier, `${label}: answered for the world, not the request`);
    }
    /* THE ONE THING THAT STILL ANSWERS FIRST is the seat, because a partner has
       no business naming a Collector's intent at all. */
    eq(code(x(st, TP, "addGoal", { canonicalCardId: "cc-z", tier: "banana" })),
      D.REFUSE.notOwner, "seat ownership stopped answering first");
    /* And with a legal tier, every one of those older refusals is exactly where
       it was — the gate added an answer, it did not take any away. */
    eq(code(x(st, CASEY, "addGoal",
      { canonicalCardId: "cc-z", tier: "primary", desired: { grade: "Raw" } })),
    D.REFUSE.gradingIncoherent, "the grading shape check stopped answering");
    eq(code(x(st, CASEY, "addGoal", { cardId: "nope", tier: "primary" })),
      D.REFUSE.notFound, "card resolution stopped answering");
    eq(code(x(st, CASEY, "addGoal",
      { canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } })),
    D.REFUSE.duplicateGoal, "the duplicate check stopped answering");
    eq(code(x(st, CASEY, "addGoal", { canonicalCardId: "cc-z", tier: "primary" })),
      D.REFUSE.criteriaRequired, "the criteria requirement stopped answering");
    eq(snap(st), snap(world()), "one of the refusals above wrote something");
  });

  test("[4b] and a refused Goal does not consume the id it would have been given", () => {
    /* WHY THE GATE IS ABOVE `ctx.id("g")` AND NOT MERELY ABOVE THE GOAL ROW.
       `newId` advances a counter the moment it is called, so a gate placed
       after the mint would make `invalid-tier` the one refusal in this command
       that leaves a mark — a gap in the id sequence caused by a request that
       was rejected. The batch's promise is that a refusal changes nothing; an
       id sequence is something. */
    let minted = 0;
    const rt = RT.createRuntime({ now: () => AT, newId: (p = "") => `${p}${++minted}` });
    const base = world().get();
    const ask = (tier) => C.execute(base, CASEY, "addGoal",
      { canonicalCardId: "cc-z", tier, desired: { grade: "PSA 9" }, at: AT }, rt);
    eq(code(ask("banana")), D.REFUSE.invalidTier, "not refused");
    eq(minted, 0, "a refused Goal consumed an id");
    const r = ask("primary");
    assert(r && r.ok !== false, `the real Goal was refused: ${r && r.refused}`);
    eq(r.value, "g1", "the refusal left a gap in the id sequence");
  });
});

/* ================================================== B. changing one's mind */
describe("B. updateGoalTier moves a Goal between the two, and nowhere else", () => {

  test("[5] Primary → Secondary, and Secondary → Primary", () => {
    const st = world();
    okv(x(st, CASEY, "updateGoalTier", { goalId: "g1", tier: "secondary" }), "demote");
    eq(tierOf(st, "g1"), "secondary", "the demotion did not land");
    okv(x(st, CASEY, "updateGoalTier", { goalId: "g1", tier: "primary" }), "promote");
    eq(tierOf(st, "g1"), "primary", "the promotion did not land");
    assert(valid(st), "a legal tier change produced an invalid world");
  });

  test("[6] setting the tier a Goal already has stays a no-op", () => {
    /* Idempotency is load-bearing: the Card Specification panel re-sends a
       plan on retry, and a step that already landed must not churn `since`. */
    const st = world();
    const before = snap(st);
    okv(x(st, CASEY, "updateGoalTier", { goalId: "g1", tier: "primary" }), "same tier");
    eq(snap(st), before, "re-stating the current tier rewrote the Goal");
  });

  test("[7] every malformed tier is refused, and none of them demotes the Goal", () => {
    for (const [label, value, omit] of MALFORMED) {
      const st = world();
      const before = snap(st);
      const r = x(st, CASEY, "updateGoalTier", withTier({ goalId: "g1" }, value, omit));
      eq(code(r), D.REFUSE.invalidTier, `${label}: was not refused as an invalid tier`);
      eq(tierOf(st, "g1"), "primary", `${label}: the Goal was demoted anyway`);
      eq(snap(st), before, `${label}: a refused change moved something`);
    }
  });

  test("[8] addressing the Goal at all is settled before its tier is read", () => {
    /* `not-found` and `not-owner` precede the gate, and should: without a Goal
       this caller may speak for, there is nothing for a tier to be wrong
       about. Everything after them — the no-op, the lock — comes later. */
    const st = world();
    eq(code(x(st, CASEY, "updateGoalTier", { goalId: "nope", tier: "banana" })),
      D.REFUSE.notFound, "an unknown Goal stopped answering not-found");
    eq(code(x(st, TP, "updateGoalTier", { goalId: "g1", tier: "banana" })),
      D.REFUSE.notOwner, "a partner seat stopped answering not-owner");
    eq(snap(st), snap(world()), "one of those refusals wrote something");
  });
});

/* =========================================== C. what a live deal still holds */
describe("C. The transaction locks mean exactly what they meant before", () => {

  const withDeal = () => {
    const st = world();
    const oppId = okv(x(st, CASEY, "startOpportunity",
      { goalId: "g1", invId: "i1", amount: 26 }), "start");
    assert(D.goalLocked("g1", st.get().opportunities), "the fixture is not actually locked");
    return { st, oppId };
  };

  test("[9] a live deal still refuses the demotion, and still permits the promotion", () => {
    const { st } = withDeal();
    eq(code(x(st, CASEY, "updateGoalTier", { goalId: "g1", tier: "secondary" })),
      D.REFUSE.goalLocked, "the demotion lock stopped answering");
    eq(tierOf(st, "g1"), "primary", "the Goal was demoted under a live deal");
    /* `goal-locked` is about losing Primary, not about being untouchable: a
       second Goal, demoted first so the promotion is real work and not the
       no-op branch. */
    const g2 = okv(x(st, CASEY, "addGoal",
      { canonicalCardId: "cc-w", tier: "secondary", desired: { grade: "PSA 9" } }), "second");
    okv(x(st, CASEY, "updateGoalTier", { goalId: g2, tier: "primary" }), "promotion");
    eq(tierOf(st, g2), "primary", "promotion under a live deal stopped working");
  });

  test("[10] a malformed tier on a locked Goal answers invalid-tier, not goal-locked", () => {
    /* THE ORDERING CHOICE IN `updateGoalTier`, AND IT IS OBSERVABLE.

       The tier gate sits after `not-found` and `not-owner` and BEFORE both the
       no-op and the demotion lock. Before this batch, `"banana"` on a locked
       Primary Goal coerced to "secondary", hit the lock, and came back
       `goal-locked` — which is a claim about the WORLD ("this Goal is in a live
       deal, so it may not be demoted") made about a request that named no tier
       at all and therefore asked for no demotion.

       Two reasons it must not stand. It is untrue: the caller is told to end
       its deal when what it has to fix is its payload. And it is unstable: the
       identical malformed request would answer `invalid-tier` or `goal-locked`
       depending on whether a partner happened to have an Opportunity open,
       which is not a fact about the request. `not-found` and `not-owner`
       already settle whether the request makes sense at all before any deal
       state is read; this joins them.

       `"Secondary"` is the case that shows the change most sharply — one
       capital letter used to be a valid demotion request. */
    const { st } = withDeal();
    const before = snap(st);
    for (const bad of ["banana", "Secondary", "secondary ", "", null, undefined, 2]) {
      eq(code(x(st, CASEY, "updateGoalTier", { goalId: "g1", tier: bad })),
        D.REFUSE.invalidTier, `${JSON.stringify(bad)}: answered for the deal, not the request`);
    }
    eq(snap(st), before, "a refused malformed request touched the deal or the Goal");
    /* And the lock itself is untouched for the request that really is one. */
    eq(code(x(st, CASEY, "updateGoalTier", { goalId: "g1", tier: "secondary" })),
      D.REFUSE.goalLocked, "the lock stopped answering a real demotion");
  });

  test("[11] removeGoal and updateGoalCriteria still answer goal-locked", () => {
    const { st } = withDeal();
    eq(code(x(st, CASEY, "removeGoal", { goalId: "g1" })), D.REFUSE.goalLocked,
      "the removal lock moved");
    eq(code(x(st, CASEY, "updateGoalCriteria", { goalId: "g1", desired: { grade: "PSA 4" } })),
      D.REFUSE.goalLocked, "the criteria lock moved");
    eq(st.get().goals.length, 1, "a Goal went");
  });

  test("[12] a Secondary Goal still cannot begin a deal, and a Primary one still can", () => {
    /* The reason the tier is worth refusing over. Plenty of code READS a tier —
       the Collector's Goals list, the partner's view of demand, discovery — but
       this is the one place it decides something irreversible: whether a
       negotiation may exist at all. */
    const st = world({ goals: [{ id: "g1", collectorId: "casey", canonicalCardId: "cc-x",
      tier: "secondary", desired: { grade: "PSA 9" } }] });
    eq(code(x(st, CASEY, "startOpportunity", { goalId: "g1", invId: "i1", amount: 26 })),
      D.REFUSE.notPrimary, "a Secondary Goal opened a deal");
    okv(x(st, CASEY, "updateGoalTier", { goalId: "g1", tier: "primary" }), "promote");
    okv(x(st, CASEY, "startOpportunity", { goalId: "g1", invId: "i1", amount: 26 }), "deal");
  });
});

/* ============================================= D. one list, in two places */
describe("D. The two tiers, and the two places that know them", () => {

  test("[13] the writers' vocabulary and the validator's are the same list", () => {
    /* There are two copies of this list, and there should be one. The
       validator could read `D.GOAL_TIERS` — `metyet-world.js` already imports
       the domain — but the batch that added the constant was not allowed to
       touch the validator, so the copies stand and this test holds them level:
       it reads the validator's literal out of its own source and fails the
       moment either side gains or loses a value. Collapsing them into one
       belongs to a batch that may edit that file. */
    const src = fs.readFileSync(path.join(ROOT, "domain/metyet-world.js"), "utf8");
    const m = src.match(/const GOAL_TIERS = (\[[^\]]*\]);/);
    assert(m, "the validator's GOAL_TIERS is no longer where this test can read it");
    eq(JSON.stringify(JSON.parse(m[1].replace(/'/g, '"'))), JSON.stringify(D.GOAL_TIERS),
      "the validator and the writers disagree about what a tier can be");
    eq(JSON.stringify(D.GOAL_TIERS), JSON.stringify(["primary", "secondary"]),
      "the two tiers changed without this suite being told");
  });

  test("[14] and each writer gates its tier, with the old default gone", () => {
    /* Two assertions with different jobs. The first forbids the literal shape
       the defect had, which is worth naming because it is what a hurried revert
       would put back. The second is the one that generalises: it slices each
       writer out of the source and requires a gate INSIDE it, so a third writer
       added later has to carry its own — and so this test does not punish one
       for existing, which a bare count of gates would. Neither catches a
       differently-spelled coercion (`tier || "secondary"`); the tables in A and
       B are what catch that, on the writers that exist. */
    const src = fs.readFileSync(path.join(ROOT, "domain/metyet-commands.js"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ");
    assert(!/tier\s*===\s*"primary"\s*\?/.test(src),
      "a tier is being defaulted again in metyet-commands.js");
    const bodyOf = (name) => {
      const from = src.indexOf(`${name}(state`);
      assert(from >= 0, `${name} is no longer in metyet-commands.js`);
      const rest = src.slice(from + 1);
      const next = rest.search(/\n  [A-Za-z]+\(state/);
      return next < 0 ? rest : rest.slice(0, next);
    };
    for (const writer of ["addGoal", "updateGoalTier"]) {
      assert(/GOAL_TIERS\.includes\(tier\)/.test(bodyOf(writer)),
        `${writer} no longer checks the tier it was given`);
    }
  });

  test("[15] the refusal has a message a Collector can act on", () => {
    /* A refusal code with no sentence behind it reaches somebody as a blank. */
    const spec = fs.readFileSync(path.join(ROOT, "client/collector/CardSpecification.jsx"), "utf8");
    assert(spec.includes(`"${D.REFUSE.invalidTier}":`),
      "invalid-tier has no Collector-facing explanation");
  });
});

run();
