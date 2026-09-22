/* ============================================================================
   PHASE 5 C3.1 — BINDER FOUNDATION

   Where a card belongs, as a fact of its own.

   MetYet has known three things about a Collector and a card: that they want it
   (Goal), that they own a copy of it (CollectorCopy), and that they will part
   with that copy (`offered`). It has never known where the card BELONGS — which
   is the first question a collector actually asks about a card, and the one
   they answer by putting it in a binder.

     Binder        this card belongs here                ← new in C3.1
     Goal          I want this card
     CollectorCopy I own this physical copy
     offered       I am willing to trade or sell it

   THE WHOLE BATCH IS ABOUT KEEPING THOSE FOUR APART. Organising a card must not
   imply wanting it. Selling a card must not un-file it. Owning three copies of
   one card must not mean three places it belongs. And none of it may reach a
   Trusted Partner, because how somebody arranges their collection is not a fact
   about a trade.

   A. ownership          whose binder this is, and who decided
   B. the set            a binder holds each card once, and says so
   C. independence       the canonical scenarios: nothing reorganises itself
   D. privacy            what a partner receives of all this, which is nothing
   E. the closed door    the commands exist and production cannot reach them
   F. persistence        what is stored, what comes back, what the schema refuses
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate, readMigrations } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { createApp, CARD_NAMING_COMMANDS } = require("../server/app.js");
const { executeCommand } = require("../persistence/command-transaction.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { projectForActor } = require("../domain/metyet-projection.js");
const { validateWorld } = require("../domain/metyet-world.js");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
const C = require("../domain/metyet-commands.js");
const D = require("../domain/metyet-domain.js");
const RT = require("../domain/metyet-runtime.js");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const json = (v) => JSON.stringify(v);

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

/* Casey knows Northline. Dana knows nobody and is here to be a second
   Collector. Second is a partner outside Casey's network. */
const SUBJECT = { north: "sub-north", second: "sub-second", casey: "sub-casey", dana: "sub-dana" };
const ACTOR = { casey: { collectorId: "c1" }, dana: { collectorId: "c2" },
  north: { partnerId: "p1" }, second: { partnerId: "p2" } };

/* A NAME NOTHING ELSE IN THE WORLD COULD PRODUCE. Section D searches the whole
   serialised partner projection for it, so it has to be a string that cannot
   arrive by any other route — a card name or a set code would prove nothing. */
const SECRET_NAME = "ZZ-MUDKIP-CURATION-MARKER-7741";

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
    collectors: [{ id: "c1", name: "Casey" }, { id: "c2", name: "Dana" }],
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
  await accounts.linkAccount({ subject: SUBJECT.dana, role: "collector", collectorId: "c2" });
  const verifier = { verify: async (token) => {
    const subject = SUBJECT[token];
    if (!subject) throw Object.assign(new Error("no"), { reason: "bad token" });
    return { subject, email: `${token}@example.invalid`, emailVerified: true };
  } };
  return { pg, db, runtime, repository, catalog,
    app: createApp({ repository, catalog, accounts, verifier, runtime }) };
}

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
  })) {
    made[name] = (await ctx.catalog.putCanonicalCard({ cardContextId, ...dimensions })).canonicalCardId;
  }
  return made;
}

const post = (app, token, command, payload) => app.inject({ method: "POST", url: "/api/commands",
  headers: { authorization: `Bearer ${token}` }, payload: { command, payload } });
const get = (app, token, url) => app.inject({ method: "GET", url,
  headers: { authorization: `Bearer ${token}` } });

/* BINDER COMMANDS HAVE NO PRODUCTION SURFACE (section E proves the door is
   shut), so they are exercised past it — through the same transaction, the same
   advisory lock and the same validateWorld the route would use. Nothing here
   reaches around the domain. */
const run1 = (ctx, actor, command, payload) =>
  executeCommand(ctx.repository, { actor, command, payload, runtime: ctx.runtime });
const ok1 = async (ctx, actor, command, payload) => {
  const r = await run1(ctx, actor, command, payload);
  assert(!r.refused, `${command} refused: ${r.refused}`);
  return r.value;
};
const binder = (ctx, actor, name) => ok1(ctx, actor, "createBinder", { name });
const file = (ctx, actor, binderId, canonicalCardId) =>
  run1(ctx, actor, "addBinderEntry", { binderId, canonicalCardId });
const unfile = (ctx, actor, binderId, canonicalCardId) =>
  run1(ctx, actor, "removeBinderEntry", { binderId, canonicalCardId });

const load = (ctx) => ctx.repository.loadWorld();
const entriesOf = async (ctx, binderId) =>
  (await load(ctx)).binderEntries.filter((e) => e.binderId === binderId);
const own = (app, token, copy) => post(app, token, "addCollectorCopy", { copy });
const PHOTOS = { front: "copy:front", back: "copy:back" };

/* ============================================================== A */
describe("A. whose binder this is, and who decided", () => {

  test("a Collector makes a binder, and it is theirs because of who asked", async () => {
    const ctx = await world();
    const id = await binder(ctx, ACTOR.casey, "  Mudkip Collection  ");
    const stored = (await load(ctx)).binders.find((b) => b.id === id);
    eq(stored.collectorId, "c1", "owned by the collector who asked");
    eq(stored.name, "Mudkip Collection", "and the name is trimmed, not taken raw");
    eq(stored.archivedAt, null, "active from the start");
    assert(stored.createdAt, "stamped by the command's clock");
  });

  test("ownership cannot be forged in the payload", async () => {
    const ctx = await world();
    const r = await run1(ctx, ACTOR.casey, "createBinder", { name: "Mine", collectorId: "c2" });
    assert(!r.refused, json(r));
    eq((await load(ctx)).binders[0].collectorId, "c1", "the claim was ignored");
  });

  test("a Trusted Partner cannot make, rename, archive or fill a Collector's binder", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = await binder(ctx, ACTOR.casey, "Mudkip Collection");

    eq((await run1(ctx, ACTOR.north, "createBinder", { name: "Theirs" })).refused, D.REFUSE.notOwner);
    eq((await run1(ctx, ACTOR.north, "renameBinder", { binderId: id, name: "X" })).refused, D.REFUSE.notOwner);
    eq((await run1(ctx, ACTOR.north, "setBinderArchived", { binderId: id, archived: true })).refused, D.REFUSE.notOwner);
    eq((await file(ctx, ACTOR.north, id, cards.unlimited)).refused, D.REFUSE.notOwner);
    eq((await unfile(ctx, ACTOR.north, id, cards.unlimited)).refused, D.REFUSE.notOwner);
    eq((await load(ctx)).binders.length, 1, "and nothing else was created");
  });

  test("a Collector cannot touch another Collector's binder", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = await binder(ctx, ACTOR.casey, "Mudkip Collection");
    await file(ctx, ACTOR.casey, id, cards.unlimited);

    for (const [command, payload] of [
      ["renameBinder", { binderId: id, name: "Dana's now" }],
      ["setBinderArchived", { binderId: id, archived: true }],
      ["addBinderEntry", { binderId: id, canonicalCardId: cards.shadowless }],
      ["removeBinderEntry", { binderId: id, canonicalCardId: cards.unlimited }],
    ]) {
      eq((await run1(ctx, ACTOR.dana, command, payload)).refused, D.REFUSE.notOwner, command);
    }
    const w = await load(ctx);
    eq(w.binders[0].name, "Mudkip Collection", "the binder is as its owner left it");
    eq(w.binders[0].archivedAt, null);
    eq(w.binderEntries.length, 1, "and so is its membership");
  });

  test("a binder needs a name, and whitespace is not one", async () => {
    const ctx = await world();
    for (const name of ["", "   ", null, undefined, 42, {}]) {
      eq((await run1(ctx, ACTOR.casey, "createBinder", { name })).refused,
        D.REFUSE.nameRequired, `name: ${json(name)}`);
    }
    eq((await load(ctx)).binders.length, 0, "and nothing was created");
    /* The same rule on the way through. */
    const id = await binder(ctx, ACTOR.casey, "Mudkip Collection");
    eq((await run1(ctx, ACTOR.casey, "renameBinder", { binderId: id, name: "  " })).refused,
      D.REFUSE.nameRequired);
    eq((await load(ctx)).binders[0].name, "Mudkip Collection", "and the old name stands");
  });

  test("renaming changes the name and nothing else", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = await binder(ctx, ACTOR.casey, "Mudkip Collection");
    await file(ctx, ACTOR.casey, id, cards.unlimited);
    const before = (await load(ctx)).binders[0];

    await ok1(ctx, ACTOR.casey, "renameBinder", { binderId: id, name: "Water Starters" });
    const after = (await load(ctx)).binders[0];
    eq(after.name, "Water Starters");
    eq(after.collectorId, before.collectorId, "owner unchanged");
    eq(after.createdAt, before.createdAt, "created-at unchanged");
    eq((await entriesOf(ctx, id)).length, 1, "membership unchanged");
  });
});

/* ============================================================== B */
describe("B. a binder holds each card once", () => {

  test("filing the same card twice is one membership, not an error", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = await binder(ctx, ACTOR.casey, "Mudkip Collection");

    const first = await file(ctx, ACTOR.casey, id, cards.unlimited);
    assert(!first.refused, json(first));
    const at = (await entriesOf(ctx, id))[0].addedAt;

    const again = await file(ctx, ACTOR.casey, id, cards.unlimited);
    assert(!again.refused, "a repeat file was refused: " + json(again));
    const rows = await entriesOf(ctx, id);
    eq(rows.length, 1, "still one membership");
    eq(rows[0].addedAt, at, "and the original addedAt stands — re-filing does not restamp it");
  });

  test("validateWorld refuses a duplicate membership assembled outside the command", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = await binder(ctx, ACTOR.casey, "Mudkip Collection");
    const w = await load(ctx);
    w.binderEntries = [
      { binderId: id, canonicalCardId: cards.unlimited, addedAt: "2030-01-01T00:00:00.000Z" },
      { binderId: id, canonicalCardId: cards.unlimited, addedAt: "2030-01-02T00:00:00.000Z" },
    ];
    const r = validateWorld(w);
    assert(!r.ok, "a binder holding one card twice was accepted");
    assert(r.errors.some((e) => e.code === "id.duplicate" && /binderEntries/.test(e.path)), json(r.errors));
  });

  test("unfiling a card that is not filed is a no-op, not an error", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = await binder(ctx, ACTOR.casey, "Mudkip Collection");
    const r = await unfile(ctx, ACTOR.casey, id, cards.unlimited);
    assert(!r.refused, json(r));
    eq(r.value, false, "and it says plainly that there was nothing to remove");
  });

  test("a binder may hold a card the Collector neither wants nor owns", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = await binder(ctx, ACTOR.casey, "Cards I like the art of");
    await file(ctx, ACTOR.casey, id, cards.unlimited);

    const w = await load(ctx);
    eq(w.binderEntries.length, 1, "filed");
    eq(w.goals.length, 0, "no Goal was created");
    eq(w.collectorCopies.length, 0, "no copy was created");
    assert(validateWorld(w).ok, "and the world is valid: curation is not an incomplete state");
    /* And the partner is told nothing that could be read as demand. */
    const tp = (await get(ctx.app, "north", "/api/view")).json().state;
    eq(tp.goals.length, 0, "filing a card did not become demand");
    eq(tp.discoveries.length, 0, "and produced no discovery");
  });
});

/* ============================================================== C
   THE CANONICAL SCENARIOS. Each is one story the product has to survive, and
   each is the same assertion from a different direction: a Binder records where
   a card belongs, and nothing that happens to wanting, owning or offering may
   quietly reorganise it. */
describe("C. nothing reorganises a Collector's binder but the Collector", () => {

  test("B — a Goal moving from Secondary to Primary leaves membership alone", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = await binder(ctx, ACTOR.casey, "Mudkip Collection");
    await file(ctx, ACTOR.casey, id, cards.firstEdition);
    const goalId = (await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: cards.firstEdition, tier: "secondary", desired: { grade: "PSA 9" } })).json().value;

    eq((await post(ctx.app, "casey", "updateGoalTier", { goalId, tier: "primary" })).statusCode, 200);

    const w = await load(ctx);
    eq(w.goals.find((g) => g.id === goalId).tier, "primary", "the goal moved");
    eq(w.binderEntries.length, 1, "and the card is still filed");
    eq(w.binderEntries[0].canonicalCardId, cards.firstEdition, "in the same place");
  });

  test("C — acquiring the card, then dropping the Goal, leaves membership alone", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = await binder(ctx, ACTOR.casey, "Mudkip Collection");
    await file(ctx, ACTOR.casey, id, cards.firstEdition);
    const goalId = (await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: cards.firstEdition, tier: "primary", desired: { grade: "PSA 9" } })).json().value;

    /* The card turns up. */
    const copyId = (await own(ctx.app, "casey",
      { canonicalCardId: cards.firstEdition, grade: "PSA 9", photos: PHOTOS })).json().value;
    eq((await entriesOf(ctx, id)).length, 1, "acquiring did not reorganise anything");

    /* And the Collector stops looking. */
    eq((await post(ctx.app, "casey", "removeGoal", { goalId })).statusCode, 200);
    const w = await load(ctx);
    eq(w.goals.length, 0, "the goal is gone");
    eq(w.binderEntries.length, 1, "the card is still filed");
    assert(w.collectorCopies.some((b) => b.id === copyId), "and still owned");
  });

  test("E — the last owned copy leaving does not un-file the card", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = await binder(ctx, ACTOR.casey, "Mudkip Collection");
    await file(ctx, ACTOR.casey, id, cards.firstEdition);
    const copyId = (await own(ctx.app, "casey",
      { canonicalCardId: cards.firstEdition, offered: true, photos: PHOTOS })).json().value;
    eq((await load(ctx)).collectorCopies.length, 1, "owned");

    eq((await post(ctx.app, "casey", "removeCollectorCopy", { copyId })).statusCode, 200);

    const w = await load(ctx);
    eq(w.collectorCopies.length, 0, "the copy is gone");
    eq(w.binderEntries.length, 1, "and the card is still where the Collector put it");
    /* This is the scenario the whole design turns on: removeCollectorCopy
       cascades interests, and if membership named a copy it would cascade
       organisation too. It names the canonical card, so it does not. */
    eq(w.binderEntries[0].canonicalCardId, cards.firstEdition);
  });

  test("F — three physical copies of one card are one place it belongs", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = await binder(ctx, ACTOR.casey, "Mudkip Collection");
    await file(ctx, ACTOR.casey, id, cards.shadowless);

    const made = [];
    for (const spec of [{ grade: "Raw", condition: "Near Mint" }, { grade: "PSA 9" }, { grade: "PSA 10" }]) {
      made.push((await own(ctx.app, "casey",
        { canonicalCardId: cards.shadowless, ...spec, photos: PHOTOS })).json().value);
    }
    eq((await post(ctx.app, "casey", "setCollectorCopyOffered",
      { copyId: made[1], offered: true })).statusCode, 200);

    const w = await load(ctx);
    eq(w.collectorCopies.length, 3, "three physical objects");
    eq(json(w.collectorCopies.map((b) => b.offered)), json([false, true, false]),
      "with independent facts");
    eq(w.binderEntries.length, 1, "and ONE organisational membership");
  });

  test("G — the same card in two binders, removed from one, stays in the other", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const mudkip = await binder(ctx, ACTOR.casey, "Mudkip Collection");
    const artists = await binder(ctx, ACTOR.casey, "Favourite Artists");
    await file(ctx, ACTOR.casey, mudkip, cards.firstEdition);
    await file(ctx, ACTOR.casey, artists, cards.firstEdition);
    eq((await load(ctx)).binderEntries.length, 2, "one card, two places it belongs");

    await ok1(ctx, ACTOR.casey, "removeBinderEntry",
      { binderId: mudkip, canonicalCardId: cards.firstEdition });

    const w = await load(ctx);
    eq(w.binderEntries.length, 1, "removed from one");
    eq(w.binderEntries[0].binderId, artists, "and still in the other");
  });

  test("archiving a binder puts it away and touches nothing else", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = await binder(ctx, ACTOR.casey, "Mudkip Collection");
    await file(ctx, ACTOR.casey, id, cards.firstEdition);
    const goalId = (await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: cards.firstEdition, tier: "primary", desired: { grade: "PSA 9" } })).json().value;
    const copyId = (await own(ctx.app, "casey",
      { canonicalCardId: cards.firstEdition, offered: true, photos: PHOTOS })).json().value;

    await ok1(ctx, ACTOR.casey, "setBinderArchived", { binderId: id, archived: true });

    const w = await load(ctx);
    assert(w.binders[0].archivedAt, "archived, with a time rather than a flag");
    eq(w.binderEntries.length, 1, "its cards are still in it");
    eq(w.goals.find((g) => g.id === goalId).tier, "primary", "the goal is untouched");
    eq(w.collectorCopies.find((b) => b.id === copyId).offered, true, "and so is the copy");
  });

  test("archiving is reversible, and saying it twice changes nothing", async () => {
    const ctx = await world();
    const id = await binder(ctx, ACTOR.casey, "Mudkip Collection");
    await ok1(ctx, ACTOR.casey, "setBinderArchived", { binderId: id, archived: true });
    const archivedAt = (await load(ctx)).binders[0].archivedAt;

    const again = await run1(ctx, ACTOR.casey, "setBinderArchived", { binderId: id, archived: true });
    assert(!again.refused, json(again));
    eq((await load(ctx)).binders[0].archivedAt, archivedAt, "byte-identical: a no-op wrote nothing");

    await ok1(ctx, ACTOR.casey, "setBinderArchived", { binderId: id, archived: false });
    eq((await load(ctx)).binders[0].archivedAt, null, "and it comes back out");
    /* `archived` is a boolean or it is refused. */
    for (const value of ["yes", 1, null, undefined]) {
      eq((await run1(ctx, ACTOR.casey, "setBinderArchived", { binderId: id, archived: value })).refused,
        D.REFUSE.notFound, `archived: ${json(value)}`);
    }
  });

  test("unfiling a card leaves the Goal, the copy and the offer exactly as they were", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = await binder(ctx, ACTOR.casey, "Mudkip Collection");
    await file(ctx, ACTOR.casey, id, cards.firstEdition);
    const goalId = (await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: cards.firstEdition, tier: "primary", desired: { grade: "PSA 9" } })).json().value;
    const copyId = (await own(ctx.app, "casey",
      { canonicalCardId: cards.firstEdition, offered: true, photos: PHOTOS })).json().value;
    const north = await run1(ctx, ACTOR.north, "setInterest", { binderId: copyId, on: true });
    assert(!north.refused, "the partner's interest: " + json(north));

    await ok1(ctx, ACTOR.casey, "removeBinderEntry",
      { binderId: id, canonicalCardId: cards.firstEdition });

    const w = await load(ctx);
    eq(w.binderEntries.length, 0, "unfiled");
    eq(w.goals.find((g) => g.id === goalId).tier, "primary", "the Goal stands");
    const copy = w.collectorCopies.find((b) => b.id === copyId);
    eq(copy.offered, true, "the offer stands");
    eq(w.interests.length, 1, "and so does the partner's interest");
    eq(D.collectorCopyStatus(copyId, w.opportunities), "available", "no deal state moved");
  });
});

/* ============================================================== D */
describe("D. what a Trusted Partner receives of a Collector's organisation", () => {

  /* A Collector with a binder, a filed card, a goal, an owned offered copy and
     a related partner — so the partner's projection is FULL of legitimate data
     about this Collector, and the only question is whether the organisation is
     in there with it. */
  async function organised(ctx) {
    const cards = await charizard(ctx);
    const id = await binder(ctx, ACTOR.casey, SECRET_NAME);
    await file(ctx, ACTOR.casey, id, cards.firstEdition);
    await post(ctx.app, "casey", "addGoal", { canonicalCardId: cards.firstEdition, tier: "primary", desired: { grade: "PSA 9" } });
    await own(ctx.app, "casey", { canonicalCardId: cards.firstEdition, offered: true, photos: PHOTOS });
    return { cards, id };
  }

  test("nothing of it — not the name, not the id, not the membership", async () => {
    const ctx = await world();
    const { id, cards } = await organised(ctx);
    const body = (await get(ctx.app, "north", "/api/view")).body;

    /* Asserted against the WHOLE serialised response, because a field-by-field
       check only proves the fields somebody thought to name. */
    assert(!body.includes(SECRET_NAME), "the binder's name crossed to a partner");
    assert(!body.includes(id), "the binder's id crossed to a partner");
    const state = JSON.parse(body).state;
    eq(state.binders.length, 0, "no binders");
    eq(state.binderEntries.length, 0, "no membership");

    /* And the partner DOES receive everything they are entitled to, so the
       absence above is a boundary rather than an empty world. */
    eq(state.goals.length, 1, "the Collector's stated demand still reaches them");
    eq(state.collectorCopies.length, 1, "and the offered copy");
    eq(state.goals[0].canonicalCardId, cards.firstEdition);
  });

  test("no count, and no derived hint — the number is a leak too", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    /* Three binders, one card filed in all three: if any count or hint reaches
       the partner, a 3 has to appear somewhere in their view. */
    for (const name of [`${SECRET_NAME}-A`, `${SECRET_NAME}-B`, `${SECRET_NAME}-C`]) {
      const id = await binder(ctx, ACTOR.casey, name);
      await file(ctx, ACTOR.casey, id, cards.firstEdition);
    }
    await post(ctx.app, "casey", "addGoal", { canonicalCardId: cards.firstEdition, tier: "primary", desired: { grade: "PSA 9" } });
    const state = (await get(ctx.app, "north", "/api/view")).json().state;

    assert(!json(state).includes(SECRET_NAME), "a binder name crossed");
    /* Every number the partner receives about this card, enumerated: none of
       them is three. "This card is in three of their binders" would tell a
       partner how much the Collector cares about it, which is negotiating
       information nobody offered. */
    const goal = state.goals[0];
    for (const [k, v] of Object.entries(goal)) {
      assert(v !== 3 && v !== "3", `a binder count rode along on the goal as ${k}`);
    }
    eq(Object.keys(state).filter((k) => /binder/i.test(k)).sort().join(","),
      "binderEntries,binders", "a binder-shaped section appeared that nobody declared");
    eq(state.binders.length, 0);
    eq(state.binderEntries.length, 0);
  });

  test("an unrelated partner receives none of it either", async () => {
    const ctx = await world();
    await organised(ctx);
    const body = (await get(ctx.app, "second", "/api/view")).body;
    assert(!body.includes(SECRET_NAME), "an unrelated partner saw a binder name");
    const state = JSON.parse(body).state;
    eq(state.binders.length, 0);
    eq(state.binderEntries.length, 0);
    eq(state.collectors.length, 0, "nor anything else of this Collector");
  });

  test("another Collector's binders are not in a Collector's own view", async () => {
    const ctx = await world();
    await organised(ctx);
    const body = (await get(ctx.app, "dana", "/api/view")).body;
    assert(!body.includes(SECRET_NAME), "Dana saw Casey's organisation");
    eq(JSON.parse(body).state.binders.length, 0);
  });

  test("the owner receives their own, whole", async () => {
    const ctx = await world();
    const { id, cards } = await organised(ctx);
    const state = (await get(ctx.app, "casey", "/api/view")).json().state;
    eq(state.binders.length, 1);
    eq(state.binders[0].name, SECRET_NAME, "their own name, in full");
    eq(state.binders[0].id, id);
    eq(state.binderEntries.length, 1);
    eq(state.binderEntries[0].canonicalCardId, cards.firstEdition);
    assert(state.binderEntries[0].addedAt, "with when they filed it");
  });

  test("entries are scoped through binders, not by naming a collector", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const casey = await binder(ctx, ACTOR.casey, SECRET_NAME);
    const dana = await binder(ctx, ACTOR.dana, "Dana's shelf");
    await file(ctx, ACTOR.casey, casey, cards.firstEdition);
    await file(ctx, ACTOR.dana, dana, cards.shadowless);

    /* A BinderEntry carries no collectorId — it is reachable only through the
       binder that holds it, which is what makes it impossible to project one
       without projecting its binder. */
    const w = await load(ctx);
    assert(!("collectorId" in w.binderEntries[0]), "an entry names an owner of its own");

    const mine = projectForActor(w, ACTOR.casey);
    eq(mine.binderEntries.length, 1, "one entry");
    eq(mine.binderEntries[0].canonicalCardId, cards.firstEdition, "and it is the owner's");
  });
});

/* ============================================================== E */
describe("E. the commands exist, and production cannot reach them", () => {

  test("all five are in the domain command table", () => {
    for (const name of ["createBinder", "renameBinder", "setBinderArchived",
      "addBinderEntry", "removeBinderEntry"]) {
      assert(C.COMMAND_NAMES.includes(name), `${name} is missing from the command table`);
    }
  });

  /* SUPERSEDED AND RESTATED (Phase 5 C3.3).

     What this protected: that C3.1 built a durable concept and shipped no way
     to reach it — a command joins the production allow-list in the batch that
     gives it a screen, not in the batch that writes it.

     Why it is no longer correct for three of the five: C3.3 IS that batch for
     them. The Card Specification panel files this card, unfiles it, and makes a
     binder to file it in, and those three commands are what those controls
     send.

     What replaces it, and why it is stricter: the rule is unchanged and is now
     asserted on the two that still have no surface — and, for the three that
     do, this checks the thing that actually matters once a door is open, which
     is that the seat and ownership rules behind it did not move with it.

     SUPERSEDED AGAIN AND RESTATED (Phase 5 C3.4b). C3.4b is the batch that
     gives the last two a screen: a Binder library renames one in place and puts
     one away. So none of the five is unreachable any more, and the rule that
     produced this test now has one Binder-named command left to bite on —
     `markBinderReviewed`, which is not a Binder command at all. That is what
     this asserts, and it is stricter than the wording it replaces: it pins
     `markBinderReviewed` closed by NAME rather than leaving it to a list of
     everything C3.1 happened not to expose. */
  test("the one that is not a Binder command is still unreachable", async () => {
    const ctx = await world();
    assert(C.COMMAND_NAMES.includes("markBinderReviewed"), "the command vanished");
    assert(!EXPOSED_COMMANDS.includes("markBinderReviewed"),
      "markBinderReviewed is on the production allow-list");
    const res = await post(ctx.app, "casey", "markBinderReviewed", {});
    eq(res.statusCode, 409, "markBinderReviewed over HTTP");
    eq(res.json().error.refused, "command-unavailable", "markBinderReviewed over HTTP");
  });

  test("and the three C3.3 opened kept every rule behind them", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    for (const name of ["createBinder", "addBinderEntry", "removeBinderEntry"]) {
      assert(EXPOSED_COMMANDS.includes(name), `${name} was not opened by C3.3`);
    }
    /* A partner has no binders, and cannot make one. */
    eq((await post(ctx.app, "north", "createBinder", { name: "Mine" })).json().error.refused,
      "not-owner", "a Trusted Partner made a binder");
    /* A binder needs a name. */
    eq((await post(ctx.app, "casey", "createBinder", { name: "   " })).json().error.refused,
      "name-required");
    const mine = (await post(ctx.app, "casey", "createBinder", { name: "Mudkip Collection" })).json().value;
    /* Another Collector's binder is not reachable by naming it. */
    eq((await post(ctx.app, "dana", "addBinderEntry",
      { binderId: mine, canonicalCardId: cards.firstEdition })).json().error.refused,
    "not-owner", "another Collector filed a card in somebody else's binder");
    eq((await post(ctx.app, "north", "removeBinderEntry",
      { binderId: mine, canonicalCardId: cards.firstEdition })).json().error.refused, "not-owner");
    /* And a card the catalog does not hold is refused at the door, by the
       guard C3.1 wrote for exactly this moment and could not reach. */
    eq((await post(ctx.app, "casey", "addBinderEntry",
      { binderId: mine, canonicalCardId: "not-a-card" })).json().error.refused,
    "card-unavailable", "the catalog guard did not run on an open door");
  });

  /* SUPERSEDED AND RESTATED, three times over now, for the reason above. C3.1's
     claim was that IT shipped no surface — which is still true of C3.1, and is
     now said about C3.1's own commit rather than about the allow-list forever.
     What the allow-list is pinned to is the set C3.4 declared: C3.3's fourteen
     plus the two binder-lifecycle commands, which C3.4 opened because it built
     the screen that needs them. The restatement is stricter than what it
     replaces, not weaker: the set is still pinned by value AND by count, so
     swapping one name for another cannot pass. */
  test("the exposed set is exactly what C3.4 declared", () => {
    eq(json([...EXPOSED_COMMANDS].sort()), json([
      "updatePartnerProfile", "revokeCollectorInvitation",
      "addGoal", "updateGoalTier", "removeGoal",
      "addInventoryCopy",
      "addCollectorCopy", "setCollectorCopyOffered", "removeCollectorCopy",
      "createBinder", "addBinderEntry", "removeBinderEntry",
      "updateCollectorCopy", "updateGoalCriteria",
      "renameBinder", "setBinderArchived",
    ].sort()), "the production surface is not what C3.4 declared");
    eq(EXPOSED_COMMANDS.length, 16);
  });

  /* SUPERSEDED AND RESTATED. The claim was that the client bound the three
     commands C3.1's foundation gave a surface and neither of the two it did
     not. It is no longer correct because C3.4 built the Binder screen, so
     rename and archive have a surface too and the client binds all five. What
     replaces it is stricter, because it no longer merely counts on absence: it
     names the command that STILL has no surface — markBinderReviewed, the
     legacy partner-read command — and holds the client to not binding it. */
  test("the client binds the five with a surface, and not the one without", () => {
    const client = read("client/commands.js");
    for (const name of ["createBinder", "addBinderEntry", "removeBinderEntry",
      "renameBinder", "setBinderArchived"]) {
      assert(client.includes(name), `client/commands.js does not bind ${name}`);
    }
    assert(!client.includes("markBinderReviewed"),
      "client/commands.js names markBinderReviewed");
  });

  test("addBinderEntry is on the catalog guard's list, ready for the batch that opens the door", () => {
    /* The guard is unreachable from a browser today, because the command is not
       exposed. It is written now so that the batch which exposes it does not
       also have to remember to close this. Asserted against the exported rule
       rather than the source text, so it is the behaviour that is pinned. */
    assert(CARD_NAMING_COMMANDS.includes("addBinderEntry"),
      "a command that names a canonical card is not guarded");
    eq(json([...CARD_NAMING_COMMANDS].sort()),
      json(["addBinderEntry", "addCollectorCopy", "addGoal", "addInventoryCopy"]),
      "the guarded set is not what this batch declared");
  });

  test("a canonical card that does not exist is refused by the foreign key", async () => {
    const ctx = await world();
    const id = await binder(ctx, ACTOR.casey, "Mudkip Collection");
    /* Past the door there is no catalog guard — the domain holds no database,
       by a rule this batch does not break. The foreign key is the backstop, and
       it is exactly the backstop `addGoal` has: both throw 23503 rather than
       writing a reference to a card that is not there. */
    let threw = null;
    try { await file(ctx, ACTOR.casey, id, "cc-not-a-real-card"); }
    catch (e) { threw = e; }
    assert(threw, "a binder filed a card that does not exist");
    eq((await load(ctx)).binderEntries.length, 0, "and nothing was written");
  });

  test("a binder that does not exist is refused before anything else", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    eq((await file(ctx, ACTOR.casey, "bd-nope", cards.unlimited)).refused, D.REFUSE.notFound);
    eq((await run1(ctx, ACTOR.casey, "renameBinder", { binderId: "bd-nope", name: "x" })).refused,
      D.REFUSE.notFound);
  });
});

/* ============================================================== F */
describe("F. what is stored, and what the schema refuses", () => {

  test("the migration is the next one in sequence and applies to a fresh database", async () => {
    const versions = readMigrations().map((m) => m.version);
    assert(versions.includes("0013_binders"), "the migration is missing");
    eq(versions[versions.length - 1], "0013_binders", "it is not the newest");

    const pg = new PGlite();
    const db = fromPGlite(pg);
    const r = await migrate(db);
    assert(r.applied.includes("0013_binders"), "it did not apply to a fresh database");
  });

  test("and it applies as an UPGRADE from the previous schema", async () => {
    /* The state a deployment of C2.1 is in, brought forward — which is how this
       will actually run, rather than from nothing. */
    const pg = new PGlite();
    const db = fromPGlite(pg);
    const all = readMigrations();
    const before = all.filter((m) => m.version <= "0012_collector_copy_offered_backfill");
    const first = await migrate(db, { migrations: before });
    assert(!first.applied.includes("0013_binders"), "the binder tables arrived early");

    const upgrade = await migrate(db, { migrations: all });
    eq(upgrade.applied.join(","), "0013_binders", "the upgrade applied something else too");
    const t = await pg.query(
      "select table_name from information_schema.tables where table_schema = 'metyet' and table_name in ('binders','binder_entries') order by table_name");
    eq(t.rows.map((x) => x.table_name).join(","), "binder_entries,binders", "the tables are not there");
  });

  test("a binder and its membership round-trip exactly", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = await binder(ctx, ACTOR.casey, SECRET_NAME);
    await file(ctx, ACTOR.casey, id, cards.firstEdition);
    await file(ctx, ACTOR.casey, id, cards.shadowless);

    const w = await load(ctx);
    const again = JSON.parse(JSON.stringify(w));
    assert(validateWorld(again).ok, "a persisted copy validates");
    eq(json(projectForActor(again, ACTOR.casey)), json(projectForActor(w, ACTOR.casey)),
      "and projects identically");

    /* Through the database and back: identity and the card are columns, the
       rest is attrs, exactly as every other record in this schema. */
    const row = (await ctx.pg.query("select id, collector_id, attrs from metyet.binders")).rows[0];
    eq(row.collector_id, "c1");
    eq(row.attrs.name, SECRET_NAME, "the name reached the JSONB");
    eq(row.attrs.archivedAt, null);
    const e = (await ctx.pg.query(
      "select binder_id, canonical_card_id, attrs from metyet.binder_entries order by canonical_card_id")).rows;
    eq(e.length, 2);
    eq(e[0].binder_id, id);
    assert(e[0].attrs.addedAt, "and the entry's addedAt did too");
  });

  test("an archived binder round-trips as a time, not a flag", async () => {
    const ctx = await world();
    const id = await binder(ctx, ACTOR.casey, "Mudkip Collection");
    await ok1(ctx, ACTOR.casey, "setBinderArchived", { binderId: id, archived: true });
    const at = (await ctx.pg.query("select attrs from metyet.binders")).rows[0].attrs.archivedAt;
    assert(typeof at === "string" && at, "archivedAt is not a timestamp: " + json(at));
    eq((await load(ctx)).binders[0].archivedAt, at, "and it comes back as itself");
  });

  test("the schema refuses a duplicate membership, a dangling binder and a dangling card", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = await binder(ctx, ACTOR.casey, "Mudkip Collection");
    await file(ctx, ACTOR.casey, id, cards.firstEdition);

    const fails = async (sql, what) => {
      let threw = null;
      try { await ctx.pg.exec(sql); } catch (e) { threw = e; }
      assert(threw, what);
      return threw;
    };
    await fails(`insert into metyet.binder_entries (ord, binder_id, canonical_card_id, attrs)
      values (99, '${id}', '${cards.firstEdition}', '{}'::jsonb)`,
      "the same card was filed twice in one binder");
    await fails(`insert into metyet.binder_entries (ord, binder_id, canonical_card_id, attrs)
      values (98, 'bd-nope', '${cards.shadowless}', '{}'::jsonb)`,
      "an entry named a binder that does not exist");
    await fails(`insert into metyet.binders (id, ord, collector_id, attrs)
      values ('bd-x', 97, 'c-nope', '{}'::jsonb)`,
      "a binder named a collector who does not exist");
  });

  test("validateWorld refuses a binder with no owner, no name, or a bad archivedAt", async () => {
    const ctx = await world();
    const base = await load(ctx);
    const cases = [
      [{ id: "bd1", collectorId: "c-nope", name: "X", archivedAt: null }, "ref.unknown", "collectorId"],
      [{ id: "bd1", collectorId: "c1", name: "   ", archivedAt: null }, "field.invalid", "name"],
      [{ id: "bd1", collectorId: "c1", archivedAt: null }, "field.invalid", "name"],
      [{ id: "bd1", collectorId: "c1", name: "X", archivedAt: 42 }, "field.invalid", "archivedAt"],
    ];
    for (const [row, code, field] of cases) {
      const w = { ...base, binders: [row], binderEntries: [] };
      const r = validateWorld(w);
      assert(!r.ok && r.errors.some((e) => e.code === code && e.path.includes(field)),
        `${field}: ${json(r.errors)}`);
    }
    /* And a well-formed one passes, so the cases above are not passing by accident. */
    assert(validateWorld({ ...base,
      binders: [{ id: "bd1", collectorId: "c1", name: "X", archivedAt: null }],
      binderEntries: [] }).ok);
  });

  test("validateWorld refuses an entry with no binder and one with no card", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const base = await load(ctx);
    const binders = [{ id: "bd1", collectorId: "c1", name: "X", archivedAt: null }];

    const dangling = validateWorld({ ...base, binders,
      binderEntries: [{ binderId: "bd-nope", canonicalCardId: cards.unlimited }] });
    assert(!dangling.ok && dangling.errors.some((e) => e.code === "ref.unknown" && /binderId/.test(e.path)),
      json(dangling.errors));

    const cardless = validateWorld({ ...base, binders, binderEntries: [{ binderId: "bd1" }] });
    assert(!cardless.ok && cardless.errors.some((e) => e.code === "ref.missing" && /canonicalCardId/.test(e.path)),
      json(cardless.errors));
  });

  test("the world refuses to save if the binder collections are missing entirely", async () => {
    const ctx = await world();
    const w = await load(ctx);
    delete w.binders;
    let threw = null;
    try { await ctx.repository.saveWorld(w); } catch (e) { threw = e; }
    assert(threw, "a world with no binders collection was persisted");
    assert(/binders/.test(threw.message), threw.message);
  });

  test("Discovery, supply and interest are untouched by any of this", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = await binder(ctx, ACTOR.casey, SECRET_NAME);
    await file(ctx, ACTOR.casey, id, cards.firstEdition);
    /* Demand and supply that SHOULD discover each other. */
    await post(ctx.app, "casey", "addGoal", { canonicalCardId: cards.firstEdition, tier: "primary", desired: { grade: "PSA 9" } });
    await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: cards.firstEdition, ask: 9000 } });
    const mine = (await get(ctx.app, "casey", "/api/view")).json().state;
    eq(mine.discoveries.length, 1, "the overlap still computes");

    /* And a card that is ONLY filed discovers nothing. */
    await file(ctx, ACTOR.casey, id, cards.shadowless);
    await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: cards.shadowless, ask: 100 } });
    const after = (await get(ctx.app, "casey", "/api/view")).json().state;
    eq(after.discoveries.length, 1, "filing a card did not become demand");
    eq(after.discoveries[0].canonicalCardId, cards.firstEdition, "the one with a Goal");
    const stored = await load(ctx);
    assert(!("discoveries" in stored), "and discovery is still computed, not stored");
  });
});

run();
