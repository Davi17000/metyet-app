/* ============================================================================
   THE MATCH BECOMES TRUE, AND YOU CAN SEE IT

   Three things, and they are one thing:

     1  A Goal's stated criteria decide which copies match. A criterion the
        Collector did NOT state restricts nothing.
     2  A negotiation that can never conclude stops holding its Goal.
     3  A read-only surface shows the copies that actually qualify.

   WHY 1 AND 2 BELONG IN ONE BATCH. Both are the same mistake in two places:
   the product answering a question nobody asked. Criteria that do not filter
   answer "would you like this instead?"; a dead deal that still locks a Goal
   answers "are you still busy?" with a yes that stopped being true. Neither is
   safe to show a person until both are fixed, which is why the surface is here
   and Inspect is not.

   WHAT IS DELIBERATELY NOT HERE. No threshold, no floor, no "or better", no
   ranges, no multiple acceptable values, no ranking, no fuzzy matching. A
   stated criterion is matched exactly; the ordered look of `PSA 1 … PSA 10` is
   a list of names, not a scale, and section A pins that in both directions.
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const React = require("react");
const TR = require("react-test-renderer");
const esbuild = require("esbuild");
const D = require("../domain/metyet-domain.js");
const P = require("../domain/metyet-projection.js");
const { validateWorld } = require("../domain/metyet-world.js");
const { discoveriesIn } = require("../domain/metyet-discovery.js");
const { createStore } = require("./fixture-store.cjs");
const RT = require("../domain/metyet-runtime.js");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");

const ROOT = path.join(__dirname, "..");
const AT = "2026-09-29";
let seq = 0;
const runtime = () => RT.createRuntime({ now: () => AT, newId: (p = "") => `${p}${++seq}` });
const PH = { front: "f.jpg", back: "b.jpg" };
const TP = { partnerId: "nl" };
const TP2 = { partnerId: "sv" };
const A = { collectorId: "casey" };
const B = { collectorId: "jordan" };

/* Two shops, two collectors, one card. Goals and copies are passed in per test
   because what they SAY is the subject of this suite. */
const world = (over = {}) => createStore({
  partners: [{ id: "nl", name: "Northline", tradeRate: 0.7 },
    { id: "sv", name: "Silver Vale", tradeRate: 0.7 }],
  collectors: [{ id: "casey", name: "Casey" }, { id: "jordan", name: "Jordan" }],
  relationships: [
    { partnerId: "nl", collectorId: "casey", status: "accepted", at: AT },
    { partnerId: "sv", collectorId: "casey", status: "accepted", at: AT },
    { partnerId: "nl", collectorId: "jordan", status: "accepted", at: AT }],
  goals: [], inventory: [], collectorCopies: [], binders: [], binderEntries: [],
  opportunities: [], catalog: [], copyReviews: [], photoRequests: [],
  conversations: [], interests: [],
  ...over,
}, runtime());

const x = (st, actor, cmd, payload) => st.execute(actor, cmd, payload || {});
const okv = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
const nov = (r, code, why) => { eq(r && r.refused, code, why); };
const code = (r) => (r && r.ok !== false ? "OK" : r.refused);
const seen = (st, actor = A) => (P.projectForActor(st.get(), actor).discoveries || []);
const copiesSeen = (st, actor = A) =>
  seen(st, actor).reduce((n, d) => n + d.invIds.length, 0);

const goal = (over = {}) => ({ id: "gA", collectorId: "casey", canonicalCardId: "cc-x",
  tier: "primary", ...over });
const copy = (over = {}) => ({ invId: "i1", partnerId: "nl", canonicalCardId: "cc-x",
  ask: 30, photos: PH, ...over });

/* One Goal, one copy, and the answer. The whole of section A. */
const overlap = (desired, copyFacts) => {
  const st = world({ goals: [goal({ desired })], inventory: [copy(copyFacts)] });
  return { st, count: seen(st).length };
};

/* ==================================================== A. the criteria rule */
describe("A. A stated criterion is a criterion; an unstated one is not", () => {
  test("[1] an exactly stated grade matches", () => {
    eq(overlap({ grade: "PSA 9" }, { grade: "PSA 9" }).count, 1, "the grade she asked for");
  });

  test("[2] a different grade does not", () => {
    eq(overlap({ grade: "PSA 9" }, { grade: "PSA 8" }).count, 0, "a grade below");
    eq(overlap({ grade: "PSA 9" }, { grade: "Raw", condition: "Near Mint" }).count, 0, "and a raw copy");
  });

  test("[3] an exactly stated condition matches", () => {
    eq(overlap({ grade: "Raw", condition: "Near Mint" },
      { grade: "Raw", condition: "Near Mint" }).count, 1, "exactly what she described");
  });

  test("[4] a different condition does not", () => {
    eq(overlap({ grade: "Raw", condition: "Near Mint" },
      { grade: "Raw", condition: "Lightly Played" }).count, 0, "one step away is away");
  });

  test("[15] and there is no floor: a BETTER grade is not silently acceptable", () => {
    /* The single most tempting thing to get wrong. Nobody asked her whether a
       PSA 10 would do, and somebody completing a set at PSA 9 would say no. */
    eq(overlap({ grade: "PSA 9" }, { grade: "PSA 10" }).count, 0, "PSA 10 for a PSA 9 want");
    eq(overlap({ grade: "PSA 1" }, { grade: "PSA 10" }).count, 0, "nor the widest version of it");
    eq(overlap({ grade: "Raw", condition: "Heavily Played" },
      { grade: "Raw", condition: "Near Mint" }).count, 0, "and condition has no floor either");
    /* Stated the other way too: the vocabularies are never read as a scale. */
    const domain = fs.readFileSync(path.join(ROOT, "domain/metyet-domain.js"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert(!/GRADED_VALUES\s*\.\s*indexOf|CONDITION_VALUES\s*\.\s*indexOf/.test(domain),
      "a grading vocabulary was read by position, which is a scale");
    assert(!/PSA\s*\d+\s*\+|(grade|condition)\s*(>=|>|or better|and above)/i.test(domain),
      "a grade band appeared in the domain");
  });

  test("[5] a stated grade infers nothing about condition", () => {
    const anyCondition = ["Near Mint", "Lightly Played", "Damaged"];
    for (const condition of anyCondition) {
      eq(overlap({ grade: "Raw" }, { grade: "Raw", condition }).count, 1,
        `grade-only left ${condition} unrestricted`);
    }
  });

  test("[6] a stated condition infers nothing about grade beyond the existing rule", () => {
    /* A Raw copy in that condition matches: grade is unrestricted. */
    eq(overlap({ condition: "Near Mint" }, { grade: "Raw", condition: "Near Mint" }).count, 1,
      "condition-only did not restrict grade");
    /* A PSA copy does not — and that is `gradingProblem`, not a rule added
       here: a graded copy may not carry a condition at all, so it has none,
       and none is not "Near Mint". */
    eq(overlap({ condition: "Near Mint" }, { grade: "PSA 9" }).count, 0,
      "a graded copy has no condition to match");
    assert(D.gradingProblem({ grade: "PSA 9", condition: "Near Mint" }),
      "the existing rule that makes that pair impossible is still there");
  });

  test("[7] both stated requires both", () => {
    eq(overlap({ grade: "Raw", condition: "Near Mint" },
      { grade: "Raw", condition: "Near Mint" }).count, 1, "both");
    eq(overlap({ grade: "Raw", condition: "Near Mint" },
      { grade: "Raw", condition: "Damaged" }).count, 0, "grade alone is not enough");
  });

  test("[8] neither stated restricts nothing — including a legacy Goal", () => {
    for (const desired of [undefined, null, {}, { grade: "" }, { grade: "   " }]) {
      eq(overlap(desired, { grade: "PSA 1" }).count, 1,
        `a Goal saying ${JSON.stringify(desired)} started restricting`);
    }
    /* And a world holding such a Goal is still a valid world. */
    const { st } = overlap(undefined, { grade: "PSA 1" });
    assert(validateWorld(st.get()).ok, "an unstated-criteria Goal became unstorable");
  });
});

/* ======================================================== B. Discovery */
describe("B. Discovery answers with the copies she described", () => {
  test("[9] mixed copies return only the qualifiers", () => {
    const st = world({
      goals: [goal({ desired: { grade: "PSA 9" } })],
      inventory: [
        copy({ invId: "i1", grade: "PSA 9" }),
        copy({ invId: "i2", grade: "PSA 8" }),
        copy({ invId: "i3", grade: "PSA 9" }),
        copy({ invId: "i4", grade: "Raw", condition: "Near Mint" })] });
    const found = seen(st);
    eq(found.length, 1, "one shop, one answer");
    eq(found[0].invIds.join(","), "i1,i3", "and only the copies she described");
    eq(found[0].copies, 2, "counted the same way");
  });

  test("[10] two shops are two answers, each judged on its own copies", () => {
    const st = world({
      goals: [goal({ desired: { grade: "PSA 9" } })],
      inventory: [
        copy({ invId: "i1", partnerId: "nl", grade: "PSA 9" }),
        copy({ invId: "i2", partnerId: "sv", grade: "PSA 8" })] });
    const found = seen(st);
    eq(found.length, 1, "only the shop with a qualifying copy");
    eq(found[0].partnerId, "nl", "and it is the right shop");
  });

  test("[11] availability still governs, on top of criteria", () => {
    const st = world({
      goals: [goal({ desired: { grade: "PSA 9" } }),
        { id: "gB", collectorId: "jordan", canonicalCardId: "cc-x", tier: "primary",
          desired: { grade: "PSA 9" } }],
      inventory: [copy({ grade: "PSA 9" })] });
    eq(seen(st).length, 1, "available and matching");

    const b = okv(x(st, B, "startOpportunity", { goalId: "gB", invId: "i1", amount: 27, at: AT }), "B opens");
    okv(x(st, TP, "setCopyPending", { invId: "i1", oppId: b, at: AT }), "the shop pends it");
    eq(seen(st).length, 0, "pending for somebody else is not an answer");

    okv(x(st, TP, "setCopyPending", { invId: "i1", oppId: null, at: AT }), "released");
    eq(seen(st).length, 1, "and released, it is again");

    okv(x(st, TP, "acceptPrice", { oppId: b, at: AT }), "value");
    okv(x(st, B, "proposeTradeSelection", { oppId: b, binderIds: [], at: AT }), "package");
    okv(x(st, TP, "acceptDeal", { oppId: b, at: AT }), "tp yes");
    okv(x(st, B, "acceptDeal", { oppId: b, at: AT }), "collector yes");
    eq(seen(st).length, 0, "committed is not an answer");
  });

  test("[12] canonical identity still decides first, and criteria cannot loosen it", () => {
    const st = world({
      goals: [goal({ desired: { grade: "PSA 9" } })],
      inventory: [copy({ canonicalCardId: "cc-other", grade: "PSA 9" })] });
    eq(seen(st).length, 0, "a different card in the right grade is a different card");
    /* And grade did not become part of identity. */
    const discovery = fs.readFileSync(path.join(ROOT, "domain/metyet-discovery.js"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    assert(/canonicalCardId/.test(discovery), "identity is still the join");
    assert(/meetsGoalCriteria/.test(discovery), "and criteria are asked separately");
  });

  test("discoveriesIn is still pure, and still stores nothing", () => {
    const st = world({ goals: [goal({ desired: { grade: "PSA 9" } })],
      inventory: [copy({ grade: "PSA 9" })] });
    const view = P.projectForActor(st.get(), A);
    const once = JSON.stringify(discoveriesIn(view));
    const twice = JSON.stringify(discoveriesIn(view));
    eq(once, twice, "two reads of one world disagreed");
    assert(!("discoveries" in st.get()), "a discovery was written down");
  });
});

/* ================================================= C. startOpportunity */
describe("C. The command boundary answers the same question", () => {
  test("[13] a pair Discovery offers is a pair startOpportunity accepts", () => {
    const st = world({ goals: [goal({ desired: { grade: "Raw", condition: "Near Mint" } })],
      inventory: [copy({ grade: "Raw", condition: "Near Mint" })] });
    eq(seen(st).length, 1, "Discovery offered it");
    okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }),
      "and the command refused it");
  });

  test("[14] a pair it does not offer is refused, reached directly", () => {
    const st = world({ goals: [goal({ desired: { grade: "PSA 9" } })],
      inventory: [copy({ grade: "PSA 8" })] });
    eq(seen(st).length, 0, "Discovery did not offer it");
    nov(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }),
      D.REFUSE.criteriaMismatch, "and reaching past the surface does not work");
  });

  test("one predicate, asked by both, so they cannot drift", () => {
    const commands = fs.readFileSync(path.join(ROOT, "domain/metyet-commands.js"), "utf8");
    const discovery = fs.readFileSync(path.join(ROOT, "domain/metyet-discovery.js"), "utf8");
    assert(/D\.meetsGoalCriteria\(/.test(commands), "the command layer grew its own rule");
    assert(/D\.meetsGoalCriteria\(/.test(discovery), "discovery grew its own rule");
  });

  test("the refusal says nothing about anybody else", () => {
    const st = world({ goals: [goal({ desired: { grade: "PSA 9" } })],
      inventory: [copy({ grade: "PSA 8" })] });
    const r = x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT });
    eq(Object.keys(r).sort().join(","), "ok,refused", "a refusal carries a code and nothing else");
  });

  test("every other gate still stands in front of it", () => {
    const st = world({ goals: [goal({ tier: "secondary", desired: { grade: "PSA 9" } })],
      inventory: [copy({ grade: "PSA 9" })] });
    nov(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }),
      D.REFUSE.notPrimary, "a watchlist entry is still not a pursuit");
    nov(x(st, B, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }),
      D.REFUSE.notOwner, "and it is still her goal");
  });
});

/* =============================================== D. the goal lock */
describe("D. A negotiation that can never conclude stops holding the Goal", () => {
  const twoShops = () => world({
    goals: [goal({ desired: { grade: "PSA 9" } }),
      { id: "gB", collectorId: "jordan", canonicalCardId: "cc-x", tier: "primary",
        desired: { grade: "PSA 9" } }],
    inventory: [copy({ invId: "i1", partnerId: "nl", grade: "PSA 9" }),
      copy({ invId: "i9", partnerId: "sv", grade: "PSA 9" })] });
  const rivalWins = (st) => {
    const b = okv(x(st, B, "startOpportunity", { goalId: "gB", invId: "i1", amount: 27, at: AT }), "B opens");
    okv(x(st, TP, "acceptPrice", { oppId: b, at: AT }), "value");
    okv(x(st, B, "proposeTradeSelection", { oppId: b, binderIds: [], at: AT }), "package");
    okv(x(st, TP, "acceptDeal", { oppId: b, at: AT }), "tp yes");
    okv(x(st, B, "acceptDeal", { oppId: b, at: AT }), "collector yes");
    return b;
  };
  const sell = (st, b) => {
    okv(x(st, TP, "proposeFulfillment", { oppId: b, plan: { method: "show", show: "Leeds", date: "2026-10-04" }, at: AT }), "plan");
    okv(x(st, B, "confirmFulfillmentPlan", { oppId: b, at: AT }), "plan ok");
    okv(x(st, TP, "confirmHandoff", { oppId: b, at: AT }), "handed over");
    okv(x(st, B, "confirmHandoff", { oppId: b, at: AT }), "received");
  };

  test("[16][17] a NORMAL live negotiation still locks the Goal", () => {
    const st = twoShops();
    okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }), "she opens");
    eq(D.inventoryCopyStatus("i1", st.get().opportunities, st.get().inventory), "available",
      "on a copy that is perfectly available");
    eq(D.goalState("gA", st.get().opportunities), "negotiating", "so the Goal is busy");
    nov(x(st, A, "startOpportunity", { goalId: "gA", invId: "i9", amount: 29, at: AT }),
      D.REFUSE.alreadyNegotiating, "one negotiation per Goal did NOT loosen");
    nov(x(st, A, "updateGoalTier", { goalId: "gA", tier: "secondary", at: AT }),
      D.REFUSE.goalLocked, "nor did the demotion lock");
    nov(x(st, A, "removeGoal", { goalId: "gA", at: AT }), D.REFUSE.goalLocked, "nor the removal lock");
  });

  test("[18] a copy committed elsewhere releases the losing Goal", () => {
    const st = twoShops();
    okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }), "she opens");
    rivalWins(st);
    eq(D.inventoryCopyStatus("i1", st.get().opportunities, st.get().inventory), "committed",
      "the card is promised to somebody else");
    eq(D.goalState("gA", st.get().opportunities), "seeking", "her Goal is free again");
    okv(x(st, A, "updateGoalTier", { goalId: "gA", tier: "secondary", at: AT }), "she may demote it");
  });

  test("[19] a SOLD copy releases it too — for pursuit and demotion", () => {
    const st = twoShops();
    okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }), "she opens");
    sell(st, rivalWins(st));
    eq(D.inventoryCopyStatus("i1", st.get().opportunities, st.get().inventory), "sold", "gone");
    eq(D.goalState("gA", st.get().opportunities), "seeking", "her Goal is free again");
    okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i9", amount: 29, at: AT }),
      "she may pursue the card elsewhere");
  });

  test("[19b] but DELETING the Goal still waits for the dead deal to be closed", () => {
    /* THE REGRESSION THIS EXISTS FOR. Releasing the negotiation lock is not the
       same as releasing the REFERENCE: an active Opportunity names the Goal,
       and `validateWorld` requires that name to resolve. Deleting it produced a
       world the persistence layer refuses — a 500, not a refusal, which is the
       precise failure Option B was fixed for. The way through is to cancel,
       which is one command away and is the honest record anyway. */
    const st = twoShops();
    const a = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }), "she opens");
    sell(st, rivalWins(st));
    nov(x(st, A, "removeGoal", { goalId: "gA", at: AT }), D.REFUSE.goalLocked,
      "deleting would have left an Opportunity naming nothing");
    assert(validateWorld(st.get()).ok, "and the world is still storable");
    okv(x(st, A, "cancelOpportunity", { oppId: a, reason: "lost it", at: AT }), "she closes the dead deal");
    okv(x(st, A, "removeGoal", { goalId: "gA", at: AT }), "and then the Goal goes");
    assert(validateWorld(st.get()).ok, "and it is still storable after");
  });

  test("[19c] losing is PERMANENT: the rival cancelling does not resurrect it", () => {
    /* THE OTHER REGRESSION. `copyCommittedTo` asks whether a commitment stands
       NOW, so cancelling the winner un-lost the loser — and a Goal that had
       legitimately opened a replacement in the meantime then held TWO live
       negotiations, which `validateWorld` refuses and which no further command
       could clear. Final agreement is never un-given, so losing keys on that
       and stays lost. */
    const st = twoShops();
    const a1 = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }), "she opens");
    const b = rivalWins(st);
    const a2 = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i9", amount: 29, at: AT }),
      "she opens a replacement");
    okv(x(st, B, "cancelOpportunity", { oppId: b, reason: "changed my mind", at: AT }),
      "and the rival walks away after all");
    eq(D.inventoryCopyStatus("i1", st.get().opportunities, st.get().inventory), "available",
      "the copy is back on the shelf");
    const live = st.get().opportunities.filter((o) => o.goalId === "gA"
      && D.isNegotiating(o) && !D.transactionallyLost(o, st.get().opportunities));
    eq(live.length, 1, "one Goal still has exactly one live negotiation");
    eq(live[0].id, a2, "and it is the replacement, not the superseded one");
    assert(D.transactionallyLost(st.get().opportunities.find((o) => o.id === a1),
      st.get().opportunities), "the superseded conversation stayed lost");
    assert(validateWorld(st.get()).ok, "and the world is storable");
  });

  test("[19d] repeating commit → replace → cancel never accumulates live deals", () => {
    /* The unbounded form of the same defect: three rounds used to reach three
       live negotiations on one Goal and a world no command could repair. */
    const st = twoShops();
    okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }), "round 1");
    for (let round = 0; round < 3; round += 1) {
      const b = rivalWins(st);
      okv(x(st, B, "cancelOpportunity", { oppId: b, reason: "again", at: AT }), "rival walks");
      assert(validateWorld(st.get()).ok, `world invalid after round ${round + 1}`);
      const live = st.get().opportunities.filter((o) => o.goalId === "gA"
        && D.isNegotiating(o) && !D.transactionallyLost(o, st.get().opportunities));
      assert(live.length <= 1, `round ${round + 1} left ${live.length} live negotiations`);
    }
  });

  test("[22] and the released Goal can be used somewhere else", () => {
    const st = twoShops();
    okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }), "she opens");
    rivalWins(st);
    okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i9", amount: 29, at: AT }),
      "she may pursue the same card at another shop");
    /* And the world holding both is storable — the validator asks the same
       question the domain does. */
    assert(validateWorld(st.get()).ok, "a legal state became unstorable");
  });

  test("the WINNER is not released", () => {
    const st = twoShops();
    rivalWins(st);
    eq(D.goalState("gB", st.get().opportunities), "negotiating", "the deal that holds it still holds it");
    nov(x(st, B, "updateGoalTier", { goalId: "gB", tier: "secondary", at: AT }),
      D.REFUSE.goalLocked, "and its Goal is still locked");
  });

  test("[20][21] the losing record remains, untouched and un-faked", () => {
    const st = twoShops();
    const a = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }), "she opens");
    const before = JSON.stringify(st.get().opportunities.find((o) => o.id === a));
    rivalWins(st);
    const after = st.get().opportunities.find((o) => o.id === a);
    eq(JSON.stringify(after), before, "the losing record was rewritten");
    eq(after.stage, "agree-price", "it is where it was");
    eq(after.declined, false, "and nothing faked a decline");
    assert(after.endedAt === undefined || after.endedAt === null, "nor an ending");
    assert(D.isActive(after), "it is still an active record; only the LOCK was released");
  });

  test("[23] cancellation still works, and is still the honest way out", () => {
    const st = twoShops();
    const a = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }), "she opens");
    rivalWins(st);
    okv(x(st, A, "cancelOpportunity", { oppId: a, reason: "lost the race", at: AT }), "she may close it");
    const after = st.get().opportunities.find((o) => o.id === a);
    eq(after.declined, true, "and then it IS declined, because she said so");
  });

  test("no new durable state, no sweep, no lifecycle field", () => {
    const st = twoShops();
    okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }), "she opens");
    rivalWins(st);
    const o = st.get().opportunities.find((z) => z.goalId === "gA");
    for (const k of ["lost", "stranded", "superseded", "dead", "releasedAt", "lockedBy"]) {
      assert(!(k in o), `a durable ${k} was written`);
    }
    const domain = fs.readFileSync(path.join(ROOT, "domain/metyet-domain.js"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert(!/\b(lost|stranded|superseded)\b\s*[:=]/.test(domain), "and no such field is assigned");
  });
});

/* ===================================================== E. the surface */
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
const SHELL = build("client/collector/CollectorShell.jsx");

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
const CARDS = {
  "cc-x": { canonicalCardId: "cc-x", cardName: "Charizard", expansionName: "Base Set",
    collectorNumber: "4", imageSmall: "https://example.test/zard.png" },
};
const door = { describe: async (ids) => ({ cards: ids.map((id) => CARDS[id]).filter(Boolean) }) };
const render = async (st, actor = A) => {
  const state = P.projectForActor(st.get(), actor);
  let r;
  await TR.act(async () => { r = TR.create(React.createElement(DealFlow, { state, onBrowseCards: door })); });
  for (let i = 0; i < 10; i += 1) {
    await TR.act(async () => { await new Promise((done) => setTimeout(done, 0)); });
  }
  return { r, state };
};

describe("E. The surface shows the copies, and only those", () => {
  test("[24] Deal Flow is reachable from the Collector's navigation", () => {
    const ids = SHELL.SECTIONS.map((s) => s.id);
    assert(ids.includes("deal-flow"), "Deal Flow is not a destination");
    const entry = SHELL.SECTIONS.find((s) => s.id === "deal-flow");
    eq(entry.label, "Deal Flow", "and it says so");
    /* [32] and nothing useful was taken away to make room for it. `my-cards`
       left the list a batch later, when Binders absorbed its views — its job
       moved rather than disappearing, which is asserted in that batch's own
       suite. What this line protects is that DEAL FLOW did not displace
       anything, and the three destinations it arrived beside are still here. */
    for (const kept of ["browse", "binder", "partners"]) {
      assert(ids.includes(kept), `${kept} was removed to make room`);
    }
  });

  test("[25][26] it groups by the Goal and shows the specific copies", async () => {
    const st = world({
      goals: [goal({ desired: { grade: "PSA 9" } })],
      inventory: [
        copy({ invId: "i1", partnerId: "nl", grade: "PSA 9", cert: "CERT-ONE", ask: 4200 }),
        copy({ invId: "i2", partnerId: "sv", grade: "PSA 9", cert: "CERT-TWO", ask: 4400 })] });
    const { r } = await render(st);
    const shown = texts(r);
    assert(shown.includes("Charizard"), "the card is named: " + shown);
    assert(shown.includes("Northline") && shown.includes("Silver Vale"), "both shops: " + shown);
    assert(shown.includes("CERT-ONE") && shown.includes("CERT-TWO"), "both copies: " + shown);
    assert(/2 copies that match/.test(shown), "and counted as copies: " + shown);
  });

  test("[27] a copy that does not qualify is not rendered", async () => {
    const st = world({
      goals: [goal({ desired: { grade: "PSA 9" } })],
      inventory: [
        copy({ invId: "i1", grade: "PSA 9", cert: "SHOWN" }),
        copy({ invId: "i2", grade: "PSA 8", cert: "HIDDEN" })] });
    const { r } = await render(st);
    const shown = texts(r);
    assert(shown.includes("SHOWN"), "the qualifying copy is there");
    assert(!shown.includes("HIDDEN"), "a copy she did not ask for was rendered: " + shown);
  });

  test("[28] the authorized copy facts render", async () => {
    const st = world({
      goals: [goal({ desired: { grade: "PSA 9" } })],
      inventory: [copy({ grade: "PSA 9", cert: "CERT-X", ask: 4200, photos: PH })] });
    const { r } = await render(st);
    const shown = texts(r);
    for (const fact of ["Northline", "PSA 9", "CERT-X"]) {
      assert(shown.includes(fact), `${fact} is missing: ` + shown);
    }
    assert(/4,?200/.test(shown), "the asking price is missing: " + shown);
  });

  test("[29] and nothing about anybody else's deal can appear", async () => {
    const st = world({
      goals: [goal({ desired: { grade: "PSA 9" } }),
        { id: "gB", collectorId: "jordan", canonicalCardId: "cc-x", tier: "primary",
          desired: { grade: "PSA 9" } }],
      inventory: [copy({ invId: "i1", grade: "PSA 9" }), copy({ invId: "i2", grade: "PSA 9" })] });
    const b = okv(x(st, B, "startOpportunity", { goalId: "gB", invId: "i2", amount: 27, at: AT }), "B opens");
    okv(x(st, TP, "setCopyPending", { invId: "i2", oppId: b, at: AT }), "pended for B");
    const { r, state } = await render(st);
    const shown = texts(r);
    const serialised = JSON.stringify(state);
    assert(!shown.includes(b), "a rival opportunity id reached the screen");
    assert(!shown.toLowerCase().includes("jordan"), "a rival collector reached the screen");
    assert(!serialised.includes("pendingFor"), "pendingFor reached the Collector's projection");
    assert(!/agree-price|select-trade|fulfillment/.test(shown), "a rival stage reached the screen");
    /* The pended copy is not even in her data, so the screen could not leak it. */
    assert(!(state.inventory || []).some((i) => i.invId === "i2"),
      "a copy held by somebody else's deal reached her projection");
  });

  test("[30] no control on the screen sends anything", async () => {
    const st = world({ goals: [goal({ desired: { grade: "PSA 9" } })],
      inventory: [copy({ grade: "PSA 9" })] });
    const { r } = await render(st);
    eq(r.root.findAll((n) => n.type === "button").length, 0, "Deal Flow grew a button");
    eq(r.root.findAll((n) => n.type === "form").length, 0, "and a form");
    const src = fs.readFileSync(path.join(ROOT, "client/collector/sections/DealFlow.jsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const cmd of ["reviewCopy", "requestPhotos", "startOpportunity", "proposePrice",
      "acceptPrice", "setCopyPending", "cancelOpportunity"]) {
      assert(!src.includes(cmd), `Deal Flow names ${cmd}`);
    }
    assert(!/onSpecify|\.execute\(|store\./.test(src), "Deal Flow reached for a command channel");
  });

  test("[31] the four silences say four different things", async () => {
    const noPartners = createStore({ partners: [], collectors: [{ id: "casey", name: "Casey" }],
      relationships: [], goals: [], inventory: [], collectorCopies: [], binders: [],
      binderEntries: [], opportunities: [], catalog: [], copyReviews: [], photoRequests: [],
      conversations: [], interests: [] }, runtime());
    assert(/no Trusted Partners yet/i.test(texts((await render(noPartners)).r)),
      "the no-shops silence");

    const noGoals = world({ inventory: [copy({ grade: "PSA 9" })] });
    assert(/haven't said what you're looking for/i.test(texts((await render(noGoals)).r)),
      "the no-goals silence");

    const nobodyHasIt = world({ goals: [goal({ desired: { grade: "PSA 9" } })], inventory: [] });
    assert(/None of your shops has this one/i.test(texts((await render(nobodyHasIt)).r)),
      "the nobody-has-it silence");

    /* The one worth explaining: they have the card, in another form. */
    const wrongForm = world({ goals: [goal({ desired: { grade: "PSA 9" } })],
      inventory: [copy({ grade: "PSA 8" }), copy({ invId: "i2", grade: "Raw", condition: "Damaged" })] });
    const shown = texts((await render(wrongForm)).r);
    assert(/No copies match what you asked for/i.test(shown), "the wrong-form silence: " + shown);
    assert(/2 copies of this card are available/i.test(shown),
      "it did not say how many were there: " + shown);
    /* And it named no shop, because those copies are not hers to be told about. */
    assert(!shown.includes("Northline"), "the wrong-form silence named a shop: " + shown);
  });

  test("[UI] the screen says what she actually asked for", async () => {
    /* It said "any grade or condition" for every Goal, on the one screen built
       to prove criteria matter — `gradeLine` reads the derived `grading` the
       server attaches to COPIES, and a Goal's `desired` never carries one. */
    const st = world({ goals: [goal({ desired: { grade: "PSA 9" } })],
      inventory: [copy({ grade: "PSA 9" })] });
    const shown = texts((await render(st)).r);
    assert(/You asked for PSA 9/.test(shown), "the criteria line is wrong: " + shown);
    assert(!/any grade or condition/.test(shown), "it fell back to the unstated wording: " + shown);

    const both = world({ goals: [goal({ desired: { grade: "Raw", condition: "Near Mint" } })],
      inventory: [copy({ grade: "Raw", condition: "Near Mint" })] });
    assert(/You asked for Raw · Near Mint/.test(texts((await render(both)).r)), "both criteria");

    /* And a Goal that genuinely stated nothing still says so. */
    const neither = world({ goals: [goal({})], inventory: [copy({ grade: "PSA 9" })] });
    assert(/any grade or condition/.test(texts((await render(neither)).r)), "the unstated case");
  });

  test("[UI] two Goals for one card do not cancel each other's silence out", async () => {
    /* The near-miss exclusion was built from EVERY discovery, so the copy that
       satisfied one Goal counted as "matched" for the other — which then said
       nobody had the card, to the one person who can see it in the window. */
    const st = world({
      goals: [goal({ id: "g1", desired: { grade: "PSA 9" } }),
        { id: "g2", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary",
          desired: { grade: "PSA 10" } }],
      inventory: [copy({ invId: "i1", grade: "PSA 9" })] });
    const shown = texts((await render(st)).r);
    assert(/No copies match what you asked for/.test(shown),
      "the PSA 10 goal did not explain itself: " + shown);
    assert(/1 copy of this card is available/.test(shown),
      "it did not say the card is there in another form: " + shown);
  });

  test("a card the catalogue has not described yet still renders", async () => {
    const st = world({ goals: [goal({ canonicalCardId: "cc-unknown", desired: { grade: "PSA 9" } })],
      inventory: [copy({ canonicalCardId: "cc-unknown", grade: "PSA 9" })] });
    const { r } = await render(st);
    const shown = texts(r);
    assert(shown.includes("Northline"), "the shop vanished with the caption: " + shown);
    assert(!/undefined|NaN|\[object Object\]/.test(shown), "something leaked: " + shown);
  });
});

/* ============================================ F. what must not have moved */
describe("F. The boundary this batch did not cross", () => {
  test("[33] the production allow-list is unchanged", () => {
    eq(EXPOSED_COMMANDS.length, 23, "a command was exposed by this batch");
    /* THE TRANSACTION IS WHAT MUST STAY CLOSED. `reviewCopy`, `endReview` and
       `requestPhotos` left this loop when the qualification batch gave them a
       surface in Deal Flow, and `addCopyPhotos` left it when photo fulfilment
       gave the shop one for answering them; they qualify a copy and settle
       nothing. Everything that prices, reserves or advances a deal is still
       unreachable. */
    for (const closed of ["startOpportunity",
      "proposePrice", "acceptPrice", "cancelOpportunity", "setCopyPending", "acceptDeal",
      "proposeTradeSelection", "confirmHandoff"]) {
      assert(!EXPOSED_COMMANDS.includes(closed), `${closed} was exposed`);
    }
  });

  test("the domain grew no command and no durable field", () => {
    const { COMMAND_NAMES } = require("../domain/metyet-commands.js");
    eq(COMMAND_NAMES.length, 51, "a command was added or removed");
  });

  test("[11][34][35][36] Option B's availability model is untouched", () => {
    const st = world({
      goals: [goal({ desired: { grade: "PSA 9" } }),
        { id: "gB", collectorId: "jordan", canonicalCardId: "cc-x", tier: "primary",
          desired: { grade: "PSA 9" } }],
      inventory: [copy({ grade: "PSA 9" })] });
    /* Two collectors may both agree a value while it is Available. */
    const a = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }), "A opens");
    const b = okv(x(st, B, "startOpportunity", { goalId: "gB", invId: "i1", amount: 27, at: AT }), "B opens");
    okv(x(st, TP, "acceptPrice", { oppId: a, at: AT }), "A's value agreed");
    eq(D.inventoryCopyStatus("i1", st.get().opportunities, st.get().inventory), "available",
      "agreeing a value still reserves nothing");
    okv(x(st, TP, "acceptPrice", { oppId: b, at: AT }), "B's value agreed too");
    assert(validateWorld(st.get()).ok, "two agreed values on one copy became unstorable");

    /* Final agreement is still the hard boundary, and still blocks a second. */
    okv(x(st, A, "proposeTradeSelection", { oppId: a, binderIds: [], at: AT }), "A packages");
    okv(x(st, B, "proposeTradeSelection", { oppId: b, binderIds: [], at: AT }), "B packages");
    okv(x(st, TP, "acceptDeal", { oppId: a, at: AT }), "tp yes to A");
    okv(x(st, A, "acceptDeal", { oppId: a, at: AT }), "A yes");
    eq(D.inventoryCopyStatus("i1", st.get().opportunities, st.get().inventory), "committed", "promised");
    nov(x(st, TP, "acceptDeal", { oppId: b, at: AT }), D.REFUSE.copyCommitted,
      "a second promise is still refused");
  });

  test("[37] Collector trade-copy exclusivity is unchanged", () => {
    const st = world({
      goals: [goal({ desired: { grade: "PSA 9" } })],
      inventory: [copy({ grade: "PSA 9" })],
      collectorCopies: [{ id: "kA1", collectorId: "casey", canonicalCardId: "cc-y",
        grade: "PSA 8", offered: true, photos: PH }] });
    const a = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }), "opens");
    okv(x(st, TP, "acceptPrice", { oppId: a, at: AT }), "value");
    okv(x(st, A, "proposeTradeSelection", { oppId: a, binderIds: ["kA1"], at: AT }), "offers her card");
    eq(D.collectorCopyStatus("kA1", st.get().opportunities), "reserved",
      "her own copy is still held by the package");
  });

  test("[38] the privacy shaping from the cleanup batch still holds", () => {
    const st = world({
      goals: [goal({ desired: { grade: "PSA 9" } }),
        { id: "gB", collectorId: "jordan", canonicalCardId: "cc-x", tier: "primary",
          desired: { grade: "PSA 9" } }],
      inventory: [copy({ grade: "PSA 9" })] });
    const b = okv(x(st, B, "startOpportunity", { goalId: "gB", invId: "i1", amount: 27, at: AT }), "B opens");
    okv(x(st, TP, "setCopyPending", { invId: "i1", oppId: b, at: AT }), "pended for B");
    /* A competing collector still learns only that it is unavailable. */
    nov(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }),
      D.REFUSE.copyUnavailable, "a rival's stage leaked");
    /* And the owning partner still gets the PRECISE word about their own shelf,
       because they act on the difference — the asymmetry the cleanup batch
       introduced and this one must not have flattened. */
    const oppB = st.get().opportunities.find((o) => o.collectorId === "jordan").id;
    nov(x(st, TP, "setCopyPending", { invId: "i1", oppId: oppB + "-other", at: AT }),
      D.REFUSE.copyPending,
      "the owner is told the precise word about their own copy");
    /* The whole asymmetry in one place: the same world, two seats, two answers. */
    eq(code(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT })),
      D.REFUSE.copyUnavailable, "and a rival is told only that it is unavailable");
  });

  test("[39] a world this batch produces is storable", () => {
    const st = world({ goals: [goal({ desired: { grade: "PSA 9" } })],
      inventory: [copy({ grade: "PSA 9" })] });
    okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }), "opens");
    const check = validateWorld(st.get());
    assert(check.ok, "a normal world became invalid: " + JSON.stringify(check.errors || []));
  });
});

if (require.main === module) run();
module.exports = {};
