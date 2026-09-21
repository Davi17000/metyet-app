/* ============================================================================
   PHASE 5 C3.2 — GOAL DESIRED-COPY CRITERIA AND GRADING COHERENCE

   Two things a card can be described as, and one rule for both.

   A Collector says two different sentences about a grade. "I own a PSA 9" is a
   FACT about an object in a drawer. "I'm looking for a Raw Near Mint" is a
   PREFERENCE about an object that does not exist yet. They read alike, they use
   the same vocabulary, and MetYet could express only the first one — so a Goal
   that arrived carrying criteria had them silently dropped, and the caller got
   a 200 for data that went nowhere.

   Worse, the fact half could contradict itself. `grade: "PSA 9"` with
   `condition: "Damaged"` passed every check, persisted, and was then read back
   by `gradingOf` as graded with no condition at all. The record said two
   incompatible things and the product quietly showed one of them.

   C3.2 gives both halves ONE rule — `gradingProblem` — and a name that keeps
   them apart: a Goal's is `desired`, a copy's is its own fields.

   A. the rule            what a grading pair may say, in one place
   B. goal criteria       what a Collector is looking for
   C. copy coherence      what is actually in the drawer
   D. compatibility       what the product may not invent
   E. untouched           Discovery, Binders, privacy, the production door
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate, readMigrations } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { createApp } = require("../server/app.js");
const { executeCommand } = require("../persistence/command-transaction.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { projectForActor } = require("../domain/metyet-projection.js");
const { validateWorld } = require("../domain/metyet-world.js");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
const D = require("../domain/metyet-domain.js");
const RT = require("../domain/metyet-runtime.js");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const json = (v) => JSON.stringify(v);

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

const SUBJECT = { north: "sub-north", second: "sub-second", casey: "sub-casey" };
const ACTOR = { casey: { collectorId: "c1" }, north: { partnerId: "p1" }, second: { partnerId: "p2" } };

async function world() {
  const pg = database();
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  const runtime = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 1000 });
  const repository = createWorldRepository(db);
  const catalog = createCatalogRepository(db, { newId: runtime.newId });
  await repository.saveWorld({
    catalog: [],
    collectors: [{ id: "c1", name: "Casey" }],
    partners: [{ id: "p1", name: "Northline" }, { id: "p2", name: "Second" }],
    relationships: [{ partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" }],
    invitations: [], goals: [], inventory: [], collectorCopies: [],
    binders: [], binderEntries: [],
    interests: [], opportunities: [], conversations: [], photoRequests: [], copyReviews: [],
  });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: SUBJECT.north, role: "tp", partnerId: "p1" });
  await accounts.linkAccount({ subject: SUBJECT.second, role: "tp", partnerId: "p2" });
  await accounts.linkAccount({ subject: SUBJECT.casey, role: "collector", collectorId: "c1" });
  const verifier = { verify: async (token) => {
    const subject = SUBJECT[token];
    if (!subject) throw Object.assign(new Error("no"), { reason: "bad token" });
    return { subject, email: `${token}@example.invalid`, emailVerified: true };
  } };
  return { pg, db, runtime, repository, catalog,
    app: createApp({ repository, catalog, accounts, verifier, runtime }) };
}

/* Four printings of one card, so "a different card" and "a different copy of
   the same card" never get confused in a test. */
async function charizard(ctx) {
  const { expansionId } = await ctx.catalog.putExpansion(
    { game: "pokemon", code: "base1", name: "Base", printedTotal: 102 });
  const { cardContextId } = await ctx.catalog.putCardContext({ game: "pokemon", expansionId,
    collectorNumber: "4", cardName: "Charizard", artist: "Mitsuhiro Arita" });
  const made = {};
  for (const [name, dimensions] of Object.entries({
    firstEdition: { printRun: "first_edition", finish: "holofoil" },
    shadowless: { printRun: "shadowless", finish: "holofoil" },
    unlimited: { printRun: "unlimited", finish: "holofoil" },
    reverse: { printRun: "unlimited", finish: "reverse_holofoil" },
  })) {
    made[name] = (await ctx.catalog.putCanonicalCard({ cardContextId, ...dimensions })).canonicalCardId;
  }
  return made;
}

const post = (app, token, command, payload) => app.inject({ method: "POST", url: "/api/commands",
  headers: { authorization: `Bearer ${token}` }, payload: { command, payload } });
const get = (app, token, url) => app.inject({ method: "GET", url,
  headers: { authorization: `Bearer ${token}` } });
const want = (app, token, canonicalCardId, tier = "primary", extra = {}) =>
  post(app, token, "addGoal", { canonicalCardId, tier, ...extra });
const own = (app, token, copy) => post(app, token, "addCollectorCopy", { copy });
const stock = (app, token, copy) => post(app, token, "addInventoryCopy", { copy });
const load = (ctx) => ctx.repository.loadWorld();
const goalFor = async (ctx, card) => (await load(ctx)).goals.find((g) => g.canonicalCardId === card);
const refusal = (res) => (res.statusCode === 200 ? null : res.json().error.refused);

/* `updateCollectorCopy` and `updateInventoryCopy` are exercised past the
   production door — one is unexposed by design, the other has a TP surface but
   these are domain rules. Same transaction, same lock, same validateWorld. */
const direct = (ctx, actor, command, payload) =>
  executeCommand(ctx.repository, { actor, command, payload, runtime: ctx.runtime });

const INCOHERENT = "grading-incoherent";

/* ============================================================== A */
describe("A. one rule for what a grading pair may say", () => {

  test("Raw says what state; a grade says it already; neither is a real answer", () => {
    eq(D.gradingProblem({ grade: "Raw", condition: "Near Mint" }), null, "raw with a condition");
    eq(D.gradingProblem({ grade: "PSA 10" }), null, "a graded card alone");
    eq(D.gradingProblem({}), null, "nobody has described it yet");
    eq(D.gradingProblem({ grade: "Raw" }), D.GRADING_PROBLEM.rawNeedsCondition,
      "raw alone is half a sentence");
    eq(D.gradingProblem({ grade: "PSA 9", condition: "Damaged" }), D.GRADING_PROBLEM.gradedHasCondition,
      "a graded card does not also carry a raw condition");
    eq(D.gradingProblem({ grade: "PSA 11" }), D.GRADING_PROBLEM.grade, "outside 1-10");
    eq(D.gradingProblem({ grade: "BGS 9" }), D.GRADING_PROBLEM.grade, "a grader the product has no word for");
    eq(D.gradingProblem({ condition: "Mint" }), D.GRADING_PROBLEM.condition, "not a condition MetYet knows");
  });

  test("the vocabulary did not widen — PSA only, Raw, and the five conditions", () => {
    eq(json(D.GRADED_VALUES), json(["Raw", "PSA 1", "PSA 2", "PSA 3", "PSA 4", "PSA 5",
      "PSA 6", "PSA 7", "PSA 8", "PSA 9", "PSA 10"]), "the grade vocabulary moved");
    eq(json(D.CONDITION_VALUES), json(["Near Mint", "Lightly Played", "Moderately Played",
      "Heavily Played", "Damaged"]), "the condition vocabulary moved");
    /* C3.2 adds no grader, no registry and no range. The parser can READ
       another grader's label; the product offers none. */
    eq(D.gradingOf({ grade: "BGS 9.5" }).grader, "BGS", "the reader is provider-neutral");
    eq(D.gradingProblem({ grade: "BGS 9.5" }), D.GRADING_PROBLEM.grade, "and the product still refuses it");
  });

  test("a contradictory record is REPORTED, never silently reinterpreted", () => {
    /* This is the invariant the batch is really about. Before C3.2 `gradingOf`
       answered `condition: null` for a PSA 9 / Damaged row — the presenter
       would have shown "PSA 9" and the database said something else. */
    const bad = { grade: "PSA 9", condition: "Damaged" };
    const reading = D.gradingRead(bad);
    eq(reading.problem, D.GRADING_PROBLEM.gradedHasCondition, "the contradiction is named");
    eq(reading.condition, "Damaged", "and the other half survives rather than vanishing");
    eq(reading.label, "PSA 9");
    /* A sayable record reads exactly as it did, with problem null. */
    const good = D.gradingRead({ grade: "Raw", condition: "Near Mint" });
    eq(good.problem, null);
    eq(good.label, "Raw · Near Mint");
    eq(json(D.gradingRead({ grade: "PSA 9" })), json({ ...D.gradingOf({ grade: "PSA 9" }), problem: null }),
      "and adds nothing to a clean one but the null");
  });
});

/* ============================================================== B */
describe("B. what a Collector is looking for", () => {

  test("Goal A — Primary, Raw, Near Mint persists and round-trips", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const res = await want(ctx.app, "casey", cards.firstEdition, "primary",
      { desired: { grade: "Raw", condition: "Near Mint" } });
    eq(res.statusCode, 200, res.body);

    const g = await goalFor(ctx, cards.firstEdition);
    eq(json(g.desired), json({ grade: "Raw", condition: "Near Mint" }), "stored as stated");
    eq(g.tier, "primary");
    assert(!("grade" in g) && !("condition" in g),
      "criteria leaked onto the Goal as if they were facts about a copy");

    /* Through the database and back: `desired` is in the Goal's attrs, which is
       why this batch needs no migration. */
    const row = (await ctx.pg.query("select attrs from metyet.goals where id = $1", [g.id])).rows[0];
    eq(json(row.attrs.desired), json({ grade: "Raw", condition: "Near Mint" }), "reached the JSONB");
    const back = await load(ctx);
    assert(validateWorld(back).ok, json(validateWorld(back).errors));
    eq(json(back.goals[0].desired), json({ grade: "Raw", condition: "Near Mint" }), "and came back");
  });

  test("Goal B — Secondary, PSA 10, and no raw condition anywhere near it", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    eq((await want(ctx.app, "casey", cards.shadowless, "secondary",
      { desired: { grade: "PSA 10" } })).statusCode, 200);
    const g = await goalFor(ctx, cards.shadowless);
    eq(json(g.desired), json({ grade: "PSA 10" }));
    assert(!("condition" in g.desired), "a graded target grew a condition");
    eq(g.tier, "secondary");
  });

  test("Goal C — every unsayable request is refused, and nothing is written", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const cases = [
      ["Raw with no condition", { grade: "Raw" }],
      ["Raw with a condition MetYet has no word for", { grade: "Raw", condition: "Mint" }],
      ["PSA 9 and Near Mint at once", { grade: "PSA 9", condition: "Near Mint" }],
      ["a grade outside 1-10", { grade: "PSA 11" }],
      ["a grade from a company the product does not offer", { grade: "BGS 9" }],
      ["a grade that is not a string", { grade: 9 }],
      ["criteria naming something else entirely", { grade: "PSA 9", finish: "holofoil" }],
      ["criteria that are not an object", "Raw"],
    ];
    for (const [label, desired] of cases) {
      const res = await want(ctx.app, "casey", cards.firstEdition, "primary", { desired });
      eq(refusal(res), INCOHERENT, label);
    }
    eq((await load(ctx)).goals.length, 0, "and no Goal was created by any of them");
  });

  test("a bare grade or condition is REFUSED, not silently dropped", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    /* THE DEFECT THIS BATCH EXISTS TO FIX. `addGoal` used to accept a payload
       carrying `grade`/`condition`, return 200, and discard them — a success
       that loses data, which is worse than a refusal because nothing says so.
       They are now refused at the door: criteria belong under `desired`. */
    for (const extra of [{ grade: "Raw", condition: "Near Mint" }, { grade: "PSA 9" }, { condition: "Damaged" }]) {
      eq(refusal(await want(ctx.app, "casey", cards.firstEdition, "primary", extra)),
        INCOHERENT, json(extra));
    }
    eq((await load(ctx)).goals.length, 0, "and nothing was written");
  });

  test("Goal D — a second Goal for the same card is still a duplicate, however differently described", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    eq((await want(ctx.app, "casey", cards.firstEdition, "primary",
      { desired: { grade: "Raw", condition: "Near Mint" } })).statusCode, 200);
    /* One Goal per Collector per canonical card, unchanged. Wanting a PSA 10 of
       a card you already want Raw is a change of mind about the same demand,
       not a second demand — and a second Goal would make the tier ambiguous. */
    eq(refusal(await want(ctx.app, "casey", cards.firstEdition, "primary",
      { desired: { grade: "PSA 10" } })), "duplicate-goal", "criteria did not create a second Goal");
    eq(refusal(await want(ctx.app, "casey", cards.firstEdition, "secondary")),
      "duplicate-goal", "nor did dropping them");
    eq((await load(ctx)).goals.length, 1, "exactly one");
    /* A DIFFERENT PRINTING is a different card and is not a duplicate. */
    eq((await want(ctx.app, "casey", cards.shadowless, "primary",
      { desired: { grade: "PSA 10" } })).statusCode, 200, "a different printing is a different want");
  });

  test("Goal E — a tier change preserves criteria exactly", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await want(ctx.app, "casey", cards.firstEdition, "secondary",
      { desired: { grade: "Raw", condition: "Lightly Played" } });
    const before = await goalFor(ctx, cards.firstEdition);

    eq((await post(ctx.app, "casey", "updateGoalTier", { goalId: before.id, tier: "primary" })).statusCode, 200);
    const after = await goalFor(ctx, cards.firstEdition);
    eq(after.tier, "primary", "the tier moved");
    eq(json(after.desired), json(before.desired), "and the criteria did not");
    eq(after.createdAt, before.createdAt, "nor did when the Goal began");

    /* And back again. */
    await post(ctx.app, "casey", "updateGoalTier", { goalId: before.id, tier: "secondary" });
    eq(json((await goalFor(ctx, cards.firstEdition)).desired), json(before.desired),
      "a round trip through both tiers rewrote nothing");
  });

  test("a Goal with no criteria is a Goal, and stays one", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    /* THE LIVE PATH. Browse is the Collector app's first section and its
       add-goal call sends `{ canonicalCardId, tier }` and nothing else — there
       is no grade control until C3.3's Card Specification surface. Requiring
       criteria here would make the shipped product's primary action fail for
       every user, so the requirement lands in the batch that ships the means to
       satisfy it. What is enforced from today is that criteria, WHEN GIVEN,
       must be sayable. */
    eq((await want(ctx.app, "casey", cards.firstEdition, "primary")).statusCode, 200,
      "the live Browse add-goal path stopped working");
    const g = await goalFor(ctx, cards.firstEdition);
    assert(!("desired" in g),
      "an unstated preference was written down as though somebody had stated it");
    assert(validateWorld(await load(ctx)).ok, "and the world is valid without criteria");

    /* Empty criteria are the same as none — not an answer shaped like one. */
    await want(ctx.app, "casey", cards.shadowless, "primary", { desired: {} });
    assert(!("desired" in (await goalFor(ctx, cards.shadowless))),
      "an empty object became a stated preference");
  });
});

/* ============================================================== C */
describe("C. what is actually in the drawer", () => {

  test("Copy A — Raw with a valid condition persists", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const res = await own(ctx.app, "casey",
      { canonicalCardId: cards.firstEdition, grade: "Raw", condition: "Lightly Played" });
    eq(res.statusCode, 200, res.body);
    const copy = (await load(ctx)).collectorCopies[0];
    eq(copy.grade, "Raw");
    eq(copy.condition, "Lightly Played");
    eq(D.gradingRead(copy).problem, null, "and it reads without contradiction");
    eq(D.gradingRead(copy).state, "raw");
  });

  test("Copy B — a graded copy persists with no condition", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    eq((await own(ctx.app, "casey", { canonicalCardId: cards.firstEdition, grade: "PSA 9" })).statusCode, 200);
    const copy = (await load(ctx)).collectorCopies[0];
    eq(copy.grade, "PSA 9");
    assert(copy.condition == null, "a graded copy carried a raw condition");
    const reading = D.gradingRead(copy);
    eq(reading.state, "graded"); eq(reading.grader, "PSA"); eq(reading.grade, 9);
    eq(reading.problem, null);
  });

  test("Copy C — PSA 9 with a condition cannot become durable state by any supported write", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);

    /* The door C2 left open, now shut. */
    eq(refusal(await own(ctx.app, "casey",
      { canonicalCardId: cards.firstEdition, grade: "PSA 9", condition: "Damaged" })),
      INCOHERENT, "addCollectorCopy accepted a contradiction");
    eq(refusal(await own(ctx.app, "casey", { canonicalCardId: cards.firstEdition, grade: "Raw" })),
      INCOHERENT, "a raw copy with no condition is half a sentence");
    eq((await load(ctx)).collectorCopies.length, 0, "and nothing was written");

    /* And the update path, checked against the MERGED record — the subtle case:
       a patch that names only a grade still has to leave a sayable card. */
    const id = (await own(ctx.app, "casey",
      { canonicalCardId: cards.firstEdition, grade: "Raw", condition: "Near Mint" })).json().value;
    const merged = await direct(ctx, ACTOR.casey, "updateCollectorCopy",
      { copyId: id, patch: { grade: "PSA 9" } });
    eq(merged.refused, INCOHERENT,
      "a patch naming only a grade left the old raw condition behind it");
    eq(refusal(await post(ctx.app, "casey", "addCollectorCopy",
      { copy: { canonicalCardId: cards.shadowless, grade: "PSA 9", condition: "Near Mint" } })),
      INCOHERENT);

    /* Stating both together is how the correction is made, and it works. */
    const ok = await direct(ctx, ACTOR.casey, "updateCollectorCopy",
      { copyId: id, patch: { grade: "PSA 9", condition: null } });
    assert(!ok.refused, "the coherent correction was refused: " + json(ok));
    const after = (await load(ctx)).collectorCopies.find((b) => b.id === id);
    eq(after.grade, "PSA 9");
    assert(after.condition == null);
  });

  test("Copy D — a grading correction touches nothing else about the copy", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = (await own(ctx.app, "casey", { canonicalCardId: cards.firstEdition,
      grade: "Raw", condition: "Near Mint", offered: true, cert: "PSA 4242",
      photos: { front: "f", back: "b" }, market: 900 })).json().value;
    const north = await direct(ctx, ACTOR.north, "setInterest", { binderId: id, on: true });
    assert(!north.refused, "the partner's interest: " + json(north));

    const fixed = await direct(ctx, ACTOR.casey, "updateCollectorCopy",
      { copyId: id, patch: { grade: "PSA 9", condition: null } });
    assert(!fixed.refused, json(fixed));

    const w = await load(ctx);
    const copy = w.collectorCopies.find((b) => b.id === id);
    eq(copy.offered, true, "offering changed");
    eq(copy.cert, "PSA 4242", "the certificate changed");
    eq(copy.market, 900, "the reference value changed");
    eq(w.interests.length, 1, "the partner's interest was disturbed");
    eq(D.collectorCopyStatus(id, w.opportunities), "available", "deal status moved");
  });

  test("a Trusted Partner's shelf answers the same rule", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    eq(refusal(await stock(ctx.app, "north",
      { canonicalCardId: cards.firstEdition, grade: "PSA 9", condition: "Damaged", ask: 1 })),
      INCOHERENT, "TP inventory accepted a contradiction");
    eq(refusal(await stock(ctx.app, "north",
      { canonicalCardId: cards.firstEdition, grade: "Raw", ask: 1 })),
      INCOHERENT, "TP inventory accepted raw with no condition");
    eq((await load(ctx)).inventory.length, 0, "and nothing was written");

    eq((await stock(ctx.app, "north",
      { canonicalCardId: cards.firstEdition, grade: "Raw", condition: "Damaged", ask: 1 })).statusCode, 200);
    /* The update path too, merged. */
    const invId = (await load(ctx)).inventory[0].invId;
    const bad = await direct(ctx, ACTOR.north, "updateInventoryCopy",
      { invId, patch: { grade: "PSA 8" } });
    eq(bad.refused, INCOHERENT, "a merged contradiction reached a partner's shelf");
  });

  test("one rule, asked in one place — no command repeats it", () => {
    const commands = read("domain/metyet-commands.js");
    /* Four half-checks used to live here, none of which asked the question that
       mattered. They are gone; everything calls `gradingProblem`. */
    assert(!/GRADED_VALUES\.includes/.test(commands), "a command still checks the grade list itself");
    assert(!/CONDITION_VALUES\.includes/.test(commands), "a command still checks the condition list itself");
    const calls = (commands.match(/D\.gradingProblem\(/g) || []).length;
    assert(calls >= 5, `expected every write path to ask the one rule, found ${calls} calls`);
  });
});

/* ============================================================== D */
describe("D. what the product may not invent", () => {

  /* A Goal as it exists in live data today: no `desired` key at all, because
     the concept did not exist when it was written. Inserted as raw SQL on
     purpose — the repository only writes worlds the domain produced, and the
     domain would now produce something else. That is exactly why compatibility
     has to be proved rather than assumed. */
  const insertHistoricalGoal = (ctx) => ctx.pg.exec(
    `insert into metyet.goals (id, ord, collector_id, card_id, canonical_card_id, attrs)
     values ('g-historical', 0, 'c1', null, '${ctx.historicalCard}', `
     + `'{"canonicalCardId":"${ctx.historicalCard}","tier":"primary","note":"",`
     + `"since":"2029-01-01","createdAt":"2029-01-01"}'::jsonb)`);

  test("a Goal written before C3.2 loads, and MetYet does not invent a preference for it", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    ctx.historicalCard = cards.firstEdition;
    await insertHistoricalGoal(ctx);

    const w = await load(ctx);
    const g = w.goals.find((x) => x.id === "g-historical");
    assert(g, "a pre-C3.2 Goal would not load");
    assert(!("desired" in g), "MetYet invented criteria the Collector never supplied");
    assert(validateWorld(w).ok, json(validateWorld(w).errors));

    /* Unspecified is distinguishable from every value it could have been given.
       In particular it is NOT Raw / Near Mint, which is the inference the brief
       forbids and the one a careless default would have made. */
    eq(D.gradingOf(g.desired || {}).state, "unstated", "an absent preference read as a stated one");

    /* And the Collector can still work: the world saves again untouched. */
    await ctx.repository.saveWorld(w);
    assert((await load(ctx)).goals.some((x) => x.id === "g-historical"), "still there after a save");
  });

  test("a copy written before C3.2 with a contradictory pair still loads", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    /* C2 and C3.1 accepted `PSA 9` + `Damaged`, so such rows are theoretically
       live. They cannot be repaired — the record does not say which half the
       person meant, and guessing would be MetYet inventing a fact about
       somebody else's card. They must not make a world unloadable either, or
       one bad row from last month locks a Collector out of everything. */
    await ctx.pg.exec(
      `insert into metyet.collector_copies (id, ord, collector_id, card_id, canonical_card_id, attrs)
       values ('b-historical', 0, 'c1', null, '${cards.firstEdition}',
       '{"canonicalCardId":"${cards.firstEdition}","offered":true,`
       + `"grade":"PSA 9","condition":"Damaged"}'::jsonb)`);

    const w = await load(ctx);
    const copy = w.collectorCopies.find((b) => b.id === "b-historical");
    assert(copy, "a pre-C3.2 copy would not load");
    assert(validateWorld(w).ok, "an existing contradictory row made the world invalid: "
      + json(validateWorld(w).errors));
    await ctx.repository.saveWorld(w);

    /* It loads, and the contradiction is REPORTED rather than hidden. Before
       C3.2 the reader answered `condition: null` and the screen would have
       shown a clean "PSA 9". */
    const reading = D.gradingRead(copy);
    eq(reading.problem, D.GRADING_PROBLEM.gradedHasCondition, "the contradiction is not surfaced");
    eq(reading.condition, "Damaged", "and the other half is not silently dropped");

    /* Nothing auto-repaired it. */
    eq((await load(ctx)).collectorCopies.find((b) => b.id === "b-historical").condition, "Damaged",
      "a historical record was rewritten without evidence");
  });

  test("and such a copy cannot be edited into anything until it is made coherent", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await ctx.pg.exec(
      `insert into metyet.collector_copies (id, ord, collector_id, card_id, canonical_card_id, attrs)
       values ('b-historical', 0, 'c1', null, '${cards.firstEdition}',
       '{"canonicalCardId":"${cards.firstEdition}","offered":false,`
       + `"grade":"PSA 9","condition":"Damaged"}'::jsonb)`);

    /* Touching the certificate alone leaves the contradiction in place, so it
       is refused — the correction is one patch away and that is the patch. */
    eq((await direct(ctx, ACTOR.casey, "updateCollectorCopy",
      { copyId: "b-historical", patch: { cert: "PSA 1" } })).refused, INCOHERENT);
    const fix = await direct(ctx, ACTOR.casey, "updateCollectorCopy",
      { copyId: "b-historical", patch: { condition: null } });
    assert(!fix.refused, "stating a coherent pair was refused: " + json(fix));
    eq(D.gradingRead((await load(ctx)).collectorCopies[0]).problem, null, "and now it reads cleanly");

    /* Offering it is unaffected either way — `offered` is not a grading fact. */
    eq((await post(ctx.app, "casey", "setCollectorCopyOffered",
      { copyId: "b-historical", offered: true })).statusCode, 200);
  });

  test("C3.2 adds no migration, and does not need one", () => {
    const versions = readMigrations().map((m) => m.version);
    eq(versions[versions.length - 1], "0013_binders",
      "C3.2 added a migration; `desired` lives in the Goal's attrs and needs no column");
    /* The Goal table stores everything but identity and its card in `attrs`
       (`tier` is a generated column read FROM attrs), so a new attrs key needs
       no DDL. And nothing is backfilled, because there is nothing true to write
       into a Goal whose owner never stated a preference. */
    const spec = read("persistence/world-repository.js");
    assert(/collection: "goals", table: "goals", key: \["id"\]/.test(spec.replace(/\s+/g, " "))
      || /collection: "goals"/.test(spec), "the goals spec moved");
  });
});

/* ============================================================== E */
describe("E. what C3.2 did not touch", () => {

  test("Goal F — a Raw/NM Goal still discovers a partner's PSA 8 of the same card", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await want(ctx.app, "casey", cards.firstEdition, "primary",
      { desired: { grade: "Raw", condition: "Near Mint" } });
    await stock(ctx.app, "north", { canonicalCardId: cards.firstEdition, grade: "PSA 8", ask: 9000 });

    const mine = (await get(ctx.app, "casey", "/api/view")).json().state;
    eq(mine.discoveries.length, 1, "desired criteria became a filter");
    eq(mine.discoveries[0].canonicalCardId, cards.firstEdition);

    /* And the reverse flavour: a PSA 10 want against a Raw copy on the shelf. */
    await want(ctx.app, "casey", cards.shadowless, "primary", { desired: { grade: "PSA 10" } });
    await stock(ctx.app, "north",
      { canonicalCardId: cards.shadowless, grade: "Raw", condition: "Heavily Played", ask: 20 });
    eq((await get(ctx.app, "casey", "/api/view")).json().state.discoveries.length, 2,
      "a far-from-ideal copy stopped surfacing");

    /* A DIFFERENT CARD still does not discover — the exact-canonical rule is
       what this must not have loosened either. */
    await stock(ctx.app, "north", { canonicalCardId: cards.reverse, ask: 5 });
    eq((await get(ctx.app, "casey", "/api/view")).json().state.discoveries.length, 2,
      "a different printing started discovering");

    const discovery = read("domain/metyet-discovery.js");
    assert(!/grade|condition|desired/i.test(discovery.replace(/\/\*[\s\S]*?\*\//g, "")),
      "the discovery module started reading grading");
  });

  test("Goal G — criteria and tier changes leave Binder membership alone", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const binderId = (await direct(ctx, ACTOR.casey, "createBinder", { name: "Mudkip Collection" })).value;
    await direct(ctx, ACTOR.casey, "addBinderEntry", { binderId, canonicalCardId: cards.firstEdition });
    await want(ctx.app, "casey", cards.firstEdition, "secondary",
      { desired: { grade: "Raw", condition: "Near Mint" } });
    const goalId = (await goalFor(ctx, cards.firstEdition)).id;

    await post(ctx.app, "casey", "updateGoalTier", { goalId, tier: "primary" });
    eq((await load(ctx)).binderEntries.length, 1, "a tier change moved a card out of its binder");

    await post(ctx.app, "casey", "removeGoal", { goalId });
    const w = await load(ctx);
    eq(w.goals.length, 0, "the goal is gone");
    eq(w.binderEntries.length, 1, "and the card is still where the Collector filed it");
    eq(w.binders.length, 1, "and the binder is still there");
  });

  test("criteria reach the seats the Goal reaches, and no others", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await want(ctx.app, "casey", cards.firstEdition, "primary",
      { desired: { grade: "Raw", condition: "Near Mint" } });

    /* The owner, whole. */
    const mine = (await get(ctx.app, "casey", "/api/view")).json().state;
    eq(json(mine.goals[0].desired), json({ grade: "Raw", condition: "Near Mint" }));

    /* A related partner, because a Goal is already how they learn about demand
       and which copy is wanted is part of the same sentence. */
    const north = (await get(ctx.app, "north", "/api/view")).json().state;
    eq(north.goals.length, 1, "the related partner lost the goal");
    eq(json(north.goals[0].desired), json({ grade: "Raw", condition: "Near Mint" }),
      "the partner cannot tell which copy is wanted");

    /* An unrelated partner, nothing — no new seat was opened. */
    const second = (await get(ctx.app, "second", "/api/view")).body;
    assert(!second.includes("Near Mint"), "criteria reached a partner outside the network");
    eq(JSON.parse(second).state.goals.length, 0);
  });

  test("the production door is exactly where C3.1 left it", async () => {
    const ctx = await world();
    eq(json([...EXPOSED_COMMANDS].sort()), json([
      "updatePartnerProfile", "revokeCollectorInvitation",
      "addGoal", "updateGoalTier", "removeGoal",
      "addInventoryCopy",
      "addCollectorCopy", "setCollectorCopyOffered", "removeCollectorCopy",
    ].sort()), "C3.2 broadened production exposure");
    eq(EXPOSED_COMMANDS.length, 9);

    /* No `updateGoalCriteria` was added — C3.3 may reveal the right
       interaction, and a command with no surface is not shipped. */
    const C = require("../domain/metyet-commands.js");
    assert(!C.COMMAND_NAMES.includes("updateGoalCriteria"),
      "a criteria-editing command was added before anything needed it");
    /* And `updateCollectorCopy` is still unexposed, as C2 left it. */
    assert(C.COMMAND_NAMES.includes("updateCollectorCopy"));
    assert(!EXPOSED_COMMANDS.includes("updateCollectorCopy"),
      "updateCollectorCopy was exposed merely to solve grading");
    for (const name of ["updateCollectorCopy", "createBinder", "addBinderEntry"]) {
      const res = await post(ctx.app, "casey", name, {});
      eq(res.json().error.refused, "command-unavailable", name);
    }
  });

  test("Binder, offering and Interest behaviour are all as C3.1 left them", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = (await own(ctx.app, "casey", { canonicalCardId: cards.firstEdition,
      grade: "PSA 9", photos: { front: "f", back: "b" } })).json().value;
    eq((await load(ctx)).collectorCopies[0].offered, false, "the offering default moved");
    eq((await post(ctx.app, "casey", "setCollectorCopyOffered", { copyId: id, offered: true })).statusCode, 200);

    /* A partner cannot see a binder, and never could. */
    const binderId = (await direct(ctx, ACTOR.casey, "createBinder", { name: "ZZ-PRIVATE-C32" })).value;
    await direct(ctx, ACTOR.casey, "addBinderEntry", { binderId, canonicalCardId: cards.firstEdition });
    const north = (await get(ctx.app, "north", "/api/view")).body;
    assert(!north.includes("ZZ-PRIVATE-C32"), "a binder name crossed to a partner");
    eq(JSON.parse(north).state.binders.length, 0);
  });
});

run();
