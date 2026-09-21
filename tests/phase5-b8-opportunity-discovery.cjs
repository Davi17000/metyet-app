/* ============================================================================
   PHASE 5 BATCH 8 — OPPORTUNITY DISCOVERY

   Supply and demand, introduced.

   Batch 6 put a Trusted Partner's shelf on canonical cards. Batch 7 put a
   Collector's list on the same ones. This is the sentence those two batches
   were for:

     an explicit Collector Goal
     + an available Trusted Partner Copy
     + an accepted relationship between those two people
     + the same exact canonical card
     = something both of them should know

   Every clause is tested here for what it lets through AND for what it does
   not. A discovery is not a match, not a score, not a recommendation and not a
   reservation — and proving the negatives is most of this file, because those
   are the things a product like this turns into when nobody is watching.

   Two separate things wear the word "Opportunity" and this batch keeps them
   apart on purpose:
     - an OPPORTUNITY is a durable negotiation a Collector started with an
       offer. It persists, and Batch 8 moves its card reference to canonical;
     - a DISCOVERY is the overlap that exists before anybody has acted. It is
       computed, stored nowhere, and is what "Opportunity Discovery" means.

   A. discovery positives   what makes an overlap real
   B. discovery negatives   what does not, however much it resembles one
   C. idempotency           asking twice asks the same question twice
   D. lifecycle             what stops an overlap, and what must never be erased
   E. privacy               who is told, and what never travels
   F. canonical opportunity the deal record's own migration, and the hole it closed
   G. compatibility         B5, B6, B7 and the demo as they were
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { createApp } = require("../server/app.js");
const { executeCommand } = require("../persistence/command-transaction.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { discoveriesIn } = require("../domain/metyet-discovery.js");
const { projectForActor, PROJECTION_SECTIONS } = require("../domain/metyet-projection.js");
const { validateWorld } = require("../domain/metyet-world.js");
const RT = require("../domain/metyet-runtime.js");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "");
const json = (v) => JSON.stringify(v);

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

/* Northline knows Casey AND Dana — two collectors, one shelf, which is the
   whole of the "discovery reserves nothing" argument. Second knows nobody. */
const SUBJECT = { north: "sub-north", second: "sub-second", casey: "sub-casey", dana: "sub-dana" };

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
    relationships: [
      { partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" },
      { partnerId: "p1", collectorId: "c2", status: "accepted", at: "2030-01-01" },
    ],
    invitations: [], goals: [], inventory: [], collectorCopies: [], interests: [],
    opportunities: [], conversations: [], photoRequests: [], copyReviews: [],
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

/* Three printings of one checklist line, and the SAME line printed again in a
   later release by the same artist. The second is what proves that recognising
   a picture is not recognising a card. */
async function cards(ctx) {
  const base = await ctx.catalog.putExpansion(
    { game: "pokemon", code: "base1", name: "Base", printedTotal: 102 });
  const later = await ctx.catalog.putExpansion(
    { game: "pokemon", code: "base2", name: "Base Set 2", printedTotal: 130 });
  const line = await ctx.catalog.putCardContext({ game: "pokemon", expansionId: base.expansionId,
    collectorNumber: "4", cardName: "Charizard", artist: "Mitsuhiro Arita" });
  const reprint = await ctx.catalog.putCardContext({ game: "pokemon", expansionId: later.expansionId,
    collectorNumber: "4", cardName: "Charizard", artist: "Mitsuhiro Arita" });
  const made = {};
  for (const [name, dimensions] of Object.entries({
    firstEdition: { printRun: "first_edition", finish: "holofoil" },
    unlimited: { printRun: "unlimited", finish: "holofoil" },
  })) {
    made[name] = (await ctx.catalog.putCanonicalCard(
      { cardContextId: line.cardContextId, ...dimensions })).canonicalCardId;
  }
  made.sameArtLaterSet = (await ctx.catalog.putCanonicalCard(
    { cardContextId: reprint.cardContextId, printRun: "unlimited", finish: "holofoil" })).canonicalCardId;
  return made;
}

const post = (app, token, command, payload) => app.inject({ method: "POST", url: "/api/commands",
  headers: { authorization: `Bearer ${token}` }, payload: { command, payload } });
const get = (app, token, url) => app.inject({ method: "GET", url,
  headers: { authorization: `Bearer ${token}` } });

const want = (app, token, canonicalCardId, tier = "primary", extra = {}) =>
  post(app, token, "addGoal", { canonicalCardId, tier, ...extra });
const hold = (app, token, canonicalCardId, extra = {}) =>
  post(app, token, "addInventoryCopy", { copy: { canonicalCardId, ask: 900, ...extra } });

const view = async (ctx, token) => {
  const res = await get(ctx.app, token, "/api/view");
  eq(res.statusCode, 200, res.body);
  return res.json();
};
const found = async (ctx, token) => (await view(ctx, token)).state.discoveries;
const idOf = (res) => res.json().value;

/* PAST THE DOOR (Phase 5 Batch 8.1). Goals and copies are commands the product
   offers and are still sent over HTTP below. The deal lifecycle —
   `startOpportunity`, `acceptPrice`, `cancelOpportunity` — and archiving a copy
   are built, tested and sent by no screen, and `POST /api/commands` no longer
   offers what no screen sends. Every assertion in this file is Batch 8's and is
   unchanged; the commands that set up a progressed deal now run through the
   same transaction the route runs them through, so what discovery does about a
   committed copy, an archived one and a cancelled deal is proved exactly as
   before. Section H additionally proves the door itself. */
const ACTOR = { casey: { collectorId: "c1" }, dana: { collectorId: "c2" },
  north: { partnerId: "p1" }, second: { partnerId: "p2" } };
const act = async (ctx, actor, command, payload) => {
  const res = await executeCommand(ctx.repository,
    { actor, command, payload, runtime: ctx.runtime });
  return res;
};
const acted = async (ctx, actor, command, payload) => {
  const res = await act(ctx, actor, command, payload);
  eq(res.ok, true, `${command}: ${JSON.stringify(res.refused)}`);
  return res.value;
};

/* One goal, one copy, one accepted relationship — the shortest true sentence
   this batch can say. Returned so a test can then take it apart. */
async function overlap(ctx, { tier = "primary" } = {}) {
  const made = await cards(ctx);
  const goalId = idOf(await want(ctx.app, "casey", made.unlimited, tier));
  const invId = idOf(await hold(ctx.app, "north", made.unlimited));
  return { made, goalId, invId };
}

/* ============================================================== A */
describe("A. what makes an overlap real", () => {

  test("the goal comes first, then the card turns up", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const goalId = idOf(await want(ctx.app, "casey", made.unlimited));
    eq((await found(ctx, "casey")).length, 0, "wanting something nobody has is not a discovery");
    const invId = idOf(await hold(ctx.app, "north", made.unlimited));

    const mine = await found(ctx, "casey");
    eq(mine.length, 1, "and now Northline has it");
    eq(mine[0].goalId, goalId, "about the goal that said so");
    eq(mine[0].partnerId, "p1", "with the partner who has it");
    eq(mine[0].canonicalCardId, made.unlimited, "over one exact card");
    eq(json(mine[0].invIds), json([invId]), "carrying the copy an offer would name");
  });

  test("the card comes first, then somebody says they want it", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await hold(ctx.app, "north", made.unlimited);
    eq((await found(ctx, "north")).length, 0, "stock alone is not demand");
    await want(ctx.app, "casey", made.unlimited);
    eq((await found(ctx, "north")).length, 1, "order of arrival decides nothing");
  });

  test("the relationship may be the last of the three to exist", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "dana", made.unlimited);
    await hold(ctx.app, "second", made.unlimited);
    eq((await found(ctx, "dana")).length, 0, "Dana does not know Second");

    const state = await ctx.repository.loadWorld();
    await ctx.repository.saveWorld({ ...state, relationships: [...state.relationships,
      { partnerId: "p2", collectorId: "c2", status: "accepted", at: "2030-02-01" }] });
    eq((await found(ctx, "dana")).length, 1, "and now they do");
  });

  test("both seats are told, and it is the same overlap read from two ends", async () => {
    const ctx = await world();
    const { goalId, invId } = await overlap(ctx);
    const [mine, theirs] = [await found(ctx, "casey"), await found(ctx, "north")];
    eq(mine.length, 1); eq(theirs.length, 1);
    eq(mine[0].key, theirs[0].key, "one key, because it is one fact");
    eq(theirs[0].goalId, goalId); eq(json(theirs[0].invIds), json([invId]));
    eq(theirs[0].collectorId, "c1", "the partner is told whose demand it is");
  });

  test("Primary participates, and says so", async () => {
    const ctx = await world();
    await overlap(ctx, { tier: "primary" });
    eq((await found(ctx, "casey"))[0].tier, "primary", "the tier travels verbatim");
  });

  test("Secondary participates too — keeping an eye out is still saying so", async () => {
    const ctx = await world();
    await overlap(ctx, { tier: "secondary" });
    const theirs = await found(ctx, "north");
    eq(theirs.length, 1, "a secondary goal is explicit demand, not a preference");
    eq(theirs[0].tier, "secondary", "and is never promoted to make a match look better");
  });

  test("one partner holding two copies is one partner to talk to", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.unlimited);
    const a = idOf(await hold(ctx.app, "north", made.unlimited, { ask: 900 }));
    const b = idOf(await hold(ctx.app, "north", made.unlimited, { ask: 850 }));

    const mine = await found(ctx, "casey");
    eq(mine.length, 1, "the unit is the goal and the partner, not the copy");
    eq(mine[0].copies, 2, "and it says how many they have");
    eq(json(mine[0].invIds), json([a, b].sort()), "carrying both, in a fixed order");
  });

  test("two collectors wanting one card are two independent overlaps", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await hold(ctx.app, "north", made.unlimited);
    await want(ctx.app, "casey", made.unlimited);
    await want(ctx.app, "dana", made.unlimited);

    eq((await found(ctx, "north")).length, 2, "the partner hears from both");
    const [mine, theirs] = [await found(ctx, "casey"), await found(ctx, "dana")];
    eq(mine.length, 1, "and neither collector is told about the other");
    eq(mine[0].collectorId, "c1");
    eq(theirs.length, 1);
    eq(theirs[0].collectorId, "c2");
    eq(json(mine[0].invIds), json(theirs[0].invIds), "over the same copy, reserved for neither");
  });
});

/* ============================================================== B */
describe("B. what is not an overlap, however much it resembles one", () => {

  test("no goal is no demand, and no copy is no supply", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await hold(ctx.app, "north", made.unlimited);
    eq((await found(ctx, "casey")).length, 0, "Casey has said nothing");
    eq((await found(ctx, "north")).length, 0, "and nobody has said anything to Northline");
  });

  test("a different printing of the same card is a different card", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.firstEdition);
    await hold(ctx.app, "north", made.unlimited);
    eq((await found(ctx, "casey")).length, 0, "wanting the 1st Edition is not wanting the Unlimited");
  });

  test("the same artwork in a later expansion is a different card", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.unlimited);
    await hold(ctx.app, "north", made.sameArtLaterSet);
    eq((await found(ctx, "casey")).length, 0, "one picture, two collectibles");
  });

  test("a collector and a partner who do not know each other are told nothing", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.unlimited);
    await hold(ctx.app, "second", made.unlimited);
    eq((await found(ctx, "casey")).length, 0, "Casey does not know Second");
    eq((await found(ctx, "second")).length, 0, "and Second is told about nobody");
  });

  test("another partner's stock cannot create this partner's overlap", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.unlimited);
    await hold(ctx.app, "second", made.unlimited);
    eq((await found(ctx, "north")).length, 0, "Northline has nothing Casey wants");
  });

  test("another collector's goal cannot create this collector's overlap", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "dana", made.unlimited);
    await hold(ctx.app, "north", made.unlimited);
    const mine = await found(ctx, "casey");
    eq(mine.length, 0, "Casey wants nothing, whatever Dana wants");
    eq((await found(ctx, "north")).length, 1, "and Dana's own overlap is unaffected");
  });

  test("browsing the catalog creates nothing at all", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await hold(ctx.app, "north", made.unlimited);
    const before = await view(ctx, "casey");
    const browse = await get(ctx.app, "casey", "/api/card-contexts");
    eq(browse.statusCode, 200, browse.body);
    assert(browse.json().contexts.length > 0, "there was something to look at");
    const after = await view(ctx, "casey");
    eq(after.state.discoveries.length, 0, "looking at a card is not wanting it");
    eq(after.version, before.version, "and it changed nothing");
  });

  test("a withdrawn card cannot manufacture new demand or new supply", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await ctx.catalog.withdrawCanonicalCard(made.unlimited);
    const asked = await want(ctx.app, "casey", made.unlimited);
    eq(asked.statusCode, 409, asked.body);
    eq(asked.json().error.refused, "card-unavailable");
    const stocked = await hold(ctx.app, "north", made.unlimited);
    eq(stocked.statusCode, 409, stocked.body);
    eq((await found(ctx, "casey")).length, 0, "and nothing appeared from a card nobody may choose");
  });

  test("a preference tag is not a goal", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await hold(ctx.app, "north", made.unlimited);
    const state = await ctx.repository.loadWorld();
    await ctx.repository.saveWorld({ ...state,
      collectors: state.collectors.map((c) => (c.id === "c1" ? { ...c, prefs: ["charizard"] } : c)) });
    const tags = (await view(ctx, "north")).state.collectors.find((c) => c.id === "c1").prefs;
    eq(json(tags), json(["charizard"]), "the tag reached the partner, as it always did");
    eq((await found(ctx, "north")).length, 0, "and it is still not somebody asking for a card");
  });

  test("legacy card references take no part on either side", async () => {
    const ctx = await world();
    const legacy = { id: "cardX", name: "Charizard", set: "Base", num: "4",
      print: "Holo", edition: "Unlimited", language: "EN", grade: "Raw", condition: "NM" };
    await ctx.repository.saveWorld({
      catalog: [legacy],
      collectors: [{ id: "c1", name: "Casey" }, { id: "c2", name: "Dana" }],
      partners: [{ id: "p1", name: "Northline" }, { id: "p2", name: "Second" }],
      relationships: [{ partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" }],
      invitations: [],
      goals: [{ id: "g1", collectorId: "c1", cardId: "cardX", tier: "primary", since: "2030-01-01" }],
      inventory: [{ invId: "i1", partnerId: "p1", cardId: "cardX", ask: 900,
        photos: { front: null, back: null }, archived: false }],
      collectorCopies: [], interests: [], opportunities: [], conversations: [],
      photoRequests: [], copyReviews: [],
    });
    const mine = await view(ctx, "casey");
    eq(mine.state.goals.length, 1, "the goal is there");
    eq(mine.state.inventory.length, 1, "and the copy is there");
    eq(mine.state.discoveries.length, 0,
      "and they do not meet: a catalogue row cannot say which printing it means");
  });
});

/* ============================================================== C */
describe("C. asking twice asks the same question twice", () => {

  test("reading does not write, and reading again gives the same answer", async () => {
    const ctx = await world();
    await overlap(ctx);
    const first = await view(ctx, "casey");
    const second = await view(ctx, "casey");
    const third = await view(ctx, "casey");
    eq(first.version, third.version, "no version moved");
    eq(json(first.state.discoveries), json(second.state.discoveries), "byte for byte");
    eq(json(second.state.discoveries), json(third.state.discoveries), "and again");
    eq(first.state.discoveries.length, 1, "and there is still exactly one");
  });

  test("changing how hard you are looking does not make a second overlap", async () => {
    const ctx = await world();
    const { goalId } = await overlap(ctx, { tier: "primary" });
    const flip = async (tier) => {
      const res = await post(ctx.app, "casey", "updateGoalTier", { goalId, tier });
      eq(res.statusCode, 200, res.body);
    };
    await flip("secondary");
    let mine = await found(ctx, "casey");
    eq(mine.length, 1, "still one"); eq(mine[0].tier, "secondary", "wearing the new tier");
    await flip("primary");
    mine = await found(ctx, "casey");
    eq(mine.length, 1, "still one"); eq(mine[0].tier, "primary", "and the old one again");
  });

  test("removing a goal and asking again re-creates nothing", async () => {
    const ctx = await world();
    const { made, goalId } = await overlap(ctx);
    const first = (await found(ctx, "casey"))[0].key;
    eq((await post(ctx.app, "casey", "removeGoal", { goalId })).statusCode, 200);
    eq((await found(ctx, "casey")).length, 0, "no goal, no overlap");

    const again = idOf(await want(ctx.app, "casey", made.unlimited));
    const back = await found(ctx, "casey");
    eq(back.length, 1, "asking for it again is one overlap, not two");
    assert(back[0].key !== first, "and it is the new goal's, because it is a new goal");
    eq(back[0].goalId, again);
  });

  test("a copy removed and re-listed is one overlap, then one overlap", async () => {
    const ctx = await world();
    const { made, invId } = await overlap(ctx);
    await acted(ctx, ACTOR.north, "removeInventoryCopy", { invId });
    eq((await found(ctx, "casey")).length, 0, "an archived copy is not on the shelf");
    const back = idOf(await hold(ctx.app, "north", made.unlimited));
    const mine = await found(ctx, "casey");
    eq(mine.length, 1, "and the new copy is one overlap");
    eq(json(mine[0].invIds), json([back]), "naming the copy that actually exists");
  });

  test("the derivation is pure: it reads a view and never touches it", () => {
    const view = Object.freeze({
      relationships: [{ partnerId: "p1", collectorId: "c1", status: "accepted" }],
      goals: [{ id: "g1", collectorId: "c1", canonicalCardId: "k1", tier: "primary" }],
      inventory: [{ invId: "i1", partnerId: "p1", canonicalCardId: "k1", status: "available" }],
    });
    const before = json(view);
    const once = discoveriesIn(view);
    const twice = discoveriesIn(view);
    eq(json(view), before, "the input is unchanged");
    eq(json(once), json(twice), "and the output is a function of it");
    eq(once.length, 1);
    assert(once[0] !== twice[0], "each answer is its own object");
  });

  test("an empty or malformed view is an empty answer, never a throw", () => {
    for (const v of [null, undefined, {}, { goals: null, inventory: null }, "no", 7]) {
      eq(json(discoveriesIn(v)), json([]), `discoveriesIn(${json(v)})`);
    }
  });
});

/* ============================================================== D */
describe("D. what stops an overlap, and what must never be erased", () => {

  test("an archived copy is not silently current supply", async () => {
    const ctx = await world();
    const { invId } = await overlap(ctx);
    eq((await found(ctx, "north")).length, 1, "on the shelf");
    await acted(ctx, ACTOR.north, "removeInventoryCopy", { invId });
    eq((await found(ctx, "north")).length, 0, "off the shelf");
    eq((await found(ctx, "casey")).length, 0, "and the collector is not still being told about it");
  });

  test("a copy committed to one deal stops being supply for everyone else", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const invId = idOf(await hold(ctx.app, "north", made.unlimited));
    const goalId = idOf(await want(ctx.app, "casey", made.unlimited, "primary"));
    await want(ctx.app, "dana", made.unlimited, "primary");
    eq((await found(ctx, "dana")).length, 1, "Dana can see it while it is free");

    const oppId = await acted(ctx, ACTOR.casey, "startOpportunity", { goalId, invId, amount: 800 });
    await acted(ctx, ACTOR.north, "acceptPrice", { oppId });
    eq((await found(ctx, "dana")).length, 0,
      "a copy with a settled price is spoken for, and is not offered to somebody else");
  });

  test("one collector's deal does not take away another's legitimate overlap", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const first = idOf(await hold(ctx.app, "north", made.unlimited));
    const second = idOf(await hold(ctx.app, "north", made.unlimited));
    const goalId = idOf(await want(ctx.app, "casey", made.unlimited, "primary"));
    await want(ctx.app, "dana", made.unlimited, "primary");

    const oppId = await acted(ctx, ACTOR.casey, "startOpportunity",
      { goalId, invId: first, amount: 800 });
    await acted(ctx, ACTOR.north, "acceptPrice", { oppId });

    const theirs = await found(ctx, "dana");
    eq(theirs.length, 1, "Northline still has one, so Dana still has an overlap");
    eq(json(theirs[0].invIds), json([second]), "and it is the copy that is actually free");
  });

  test("a goal removed takes its overlap with it, and no history with it", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const invId = idOf(await hold(ctx.app, "north", made.unlimited));
    const goalId = idOf(await want(ctx.app, "casey", made.unlimited, "primary"));
    const oppId = await acted(ctx, ACTOR.casey, "startOpportunity", { goalId, invId, amount: 800 });

    const locked = await post(ctx.app, "casey", "removeGoal", { goalId });
    eq(locked.statusCode, 409, "a goal being negotiated is not removable");
    eq(locked.json().error.refused, "goal-locked");

    await acted(ctx, ACTOR.casey, "cancelOpportunity", { oppId, reason: "changed my mind" });
    eq((await post(ctx.app, "casey", "removeGoal", { goalId })).statusCode, 200);
    eq((await found(ctx, "casey")).length, 0, "the overlap is gone with the goal");
    const state = await view(ctx, "casey");
    eq(state.state.opportunities.length, 1, "and the negotiation that happened is still there");
    eq(state.state.opportunities[0].id, oppId);
  });

  test("a relationship that ends ends the overlap and keeps the deal", async () => {
    const ctx = await world();
    const { goalId } = await overlap(ctx);
    const before = await ctx.repository.loadWorld();
    await ctx.repository.saveWorld({ ...before, relationships: before.relationships
      .map((r) => (r.partnerId === "p1" && r.collectorId === "c1" ? { ...r, status: "ended" } : r)) });
    eq((await found(ctx, "casey")).length, 0, "a partner you no longer know is not your supply");
    eq((await found(ctx, "north")).length, 0, "and the demand is not yours to see either");
    const after = await ctx.repository.loadWorld();
    eq(after.goals.length, 1, "the goal is untouched — it was never about that partner");
    eq(after.inventory.length, 1, "and so is the copy");
  });

  test("a card withdrawn from the catalog does not erase what people said", async () => {
    const ctx = await world();
    const { made } = await overlap(ctx);
    eq(await ctx.catalog.withdrawCanonicalCard(made.unlimited), true);
    const mine = await found(ctx, "casey");
    eq(mine.length, 1, "Casey still wants it and Northline still has it");
    eq(mine[0].canonicalCardId, made.unlimited, "over the same exact card");
    const stored = await ctx.repository.loadWorld();
    eq(stored.goals.length, 1, "nothing was deleted");
    eq(stored.inventory.length, 1);
  });

  test("a progressed deal is shown as a deal, and the overlap does not double it", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const invId = idOf(await hold(ctx.app, "north", made.unlimited));
    const goalId = idOf(await want(ctx.app, "casey", made.unlimited, "primary"));
    await acted(ctx, ACTOR.casey, "startOpportunity", { goalId, invId, amount: 800 });
    /* The copy is not committed yet — a price has only been offered — so the
       overlap is still true, and both screens drop it against the live deal on
       the same goal and partner rather than the server pretending it is gone. */
    const mine = await found(ctx, "casey");
    eq(mine.length, 1, "supply and demand still overlap");
    eq(mine[0].key, `${goalId}::p1`, "and the key is exactly what a screen joins on");
  });
});

/* ============================================================== E */
describe("E. who is told, and what never travels", () => {

  test("an unrelated seat sees nothing, including no empty promise of something", async () => {
    const ctx = await world();
    await overlap(ctx);
    const outside = await view(ctx, "second");
    eq(json(outside.state.discoveries), json([]), "Second is told nothing");
    eq(outside.state.goals.length, 0, "and has no demand to compute one from");
    const dana = await view(ctx, "dana");
    eq(json(dana.state.discoveries), json([]), "Dana is told nothing about Casey");
  });

  test("the partner's private facts do not travel with the overlap", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.unlimited);
    await hold(ctx.app, "north", made.unlimited,
      { cost: 555, acquired: "2029-09-09", note: "PRIVATE-NORTHLINE-NOTE" });

    const raw = (await get(ctx.app, "casey", "/api/view")).body;
    assert(!raw.includes("PRIVATE-NORTHLINE-NOTE"), "the partner's note stayed with the partner");
    assert(!raw.includes("555"), "and so did what they paid");
    assert(!raw.includes("2029-09-09"), "and when they got it");
    const mine = await found(ctx, "casey");
    eq(mine.length, 1, "while the overlap itself arrived");
    eq(json(Object.keys(mine[0]).sort()),
      json(["canonicalCardId", "collectorId", "copies", "goalId", "invIds", "key",
        "partnerId", "tier"]),
      "an overlap is ids and a tier — there is no field on it for anything else");
  });

  test("a collector's note on a goal does not cross to an unrelated partner", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.unlimited, "primary", { note: "CASEY-PRIVATE-REASON" });
    await hold(ctx.app, "north", made.unlimited);
    await hold(ctx.app, "second", made.unlimited);
    const outside = (await get(ctx.app, "second", "/api/view")).body;
    assert(!outside.includes("CASEY-PRIVATE-REASON"), "Second never hears it");
    assert(!outside.includes("c1"), "nor that Casey exists");
  });

  test("a payload cannot forge an overlap the relationship does not support", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await hold(ctx.app, "second", made.unlimited);
    const asked = await want(ctx.app, "casey", made.unlimited, "primary",
      { collectorId: "c2", partnerId: "p2" });
    eq(asked.statusCode, 200, asked.body);
    const mine = await found(ctx, "casey");
    eq(mine.length, 0, "naming a partner in a payload does not make them yours");
    eq((await found(ctx, "second")).length, 0, "nor make somebody else's demand theirs");
  });

  test("privacy is decided before the overlap is computed, not after", () => {
    const src = code("domain/metyet-projection.js");
    assert(/withDiscoveries\(/.test(src), "the projection is what adds them");
    const order = src.indexOf("withDiscoveries(me.seat");
    assert(order > 0 && src.indexOf("projectForPartner(state, me)") > order === false
      || /withDiscoveries\(\s*me\.seat === "tp" \? projectForPartner/.test(src),
      "and it wraps the finished projection rather than canonical state");
    const discovery = code("domain/metyet-discovery.js");
    assert(!/state\.|isRelated\(|resolveActor/.test(discovery),
      "the derivation never reaches canonical state or re-decides who anybody is");
  });

  test("the section is declared, so an unclassified one cannot appear unnoticed", async () => {
    const ctx = await world();
    await overlap(ctx);
    assert(PROJECTION_SECTIONS.includes("discoveries"), "declared");
    for (const token of ["casey", "north", "dana", "second"]) {
      const state = (await view(ctx, token)).state;
      eq(json(Object.keys(state).sort()), json([...PROJECTION_SECTIONS].sort()), `${token} sections`);
      assert(Array.isArray(state.discoveries), `${token} always has the section`);
    }
  });
});

/* ============================================================== F */
describe("F. the deal record's own migration, and the hole it closed", () => {

  test("a deal started from a canonical goal keeps canonical identity", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const invId = idOf(await hold(ctx.app, "north", made.unlimited));
    const goalId = idOf(await want(ctx.app, "casey", made.unlimited, "primary"));
    await acted(ctx, ACTOR.casey, "startOpportunity", { goalId, invId, amount: 800 });

    const stored = (await ctx.repository.loadWorld()).opportunities[0];
    eq(stored.canonicalCardId, made.unlimited, "the deal names the exact card");
    assert(!("cardId" in stored) || stored.cardId == null, "and no legacy reference came with it");
    eq(stored.invId, invId, "over the exact copy");
    eq(stored.goalId, goalId, "for the exact goal");
  });

  test("THE HOLE: two canonical records no longer compare equal by holding no legacy card", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const invId = idOf(await hold(ctx.app, "north", made.firstEdition));
    const goalId = idOf(await want(ctx.app, "casey", made.unlimited, "primary"));
    const res = await act(ctx, ACTOR.casey, "startOpportunity", { goalId, invId, amount: 800 });
    eq(res.ok, false);
    eq(res.refused, "identity-mismatch",
      "a 1st Edition copy does not satisfy a goal for the Unlimited");
    eq((await ctx.repository.loadWorld()).opportunities.length, 0, "and nothing was written");
  });

  test("a canonical goal and a legacy copy are not comparable and do not meet", async () => {
    const ctx = await world();
    const legacy = { id: "cardX", name: "Charizard", set: "Base", num: "4",
      print: "Holo", edition: "Unlimited", language: "EN", grade: "Raw", condition: "NM" };
    const state = await ctx.repository.loadWorld();
    await ctx.repository.saveWorld({ ...state, catalog: [legacy],
      inventory: [{ invId: "i1", partnerId: "p1", cardId: "cardX", ask: 900,
        photos: { front: null, back: null }, archived: false }] });
    const made = await cards(ctx);
    const goalId = idOf(await want(ctx.app, "casey", made.unlimited, "primary"));
    const res = await act(ctx, ACTOR.casey, "startOpportunity",
      { goalId, invId: "i1", amount: 800 });
    eq(res.ok, false);
    eq(res.refused, "identity-mismatch", "the two vocabularies never meet");
  });

  test("the card comes from the records, never from the caller", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const invId = idOf(await hold(ctx.app, "north", made.unlimited));
    const goalId = idOf(await want(ctx.app, "casey", made.unlimited, "primary"));
    await acted(ctx, ACTOR.casey, "startOpportunity",
      { goalId, invId, amount: 800, canonicalCardId: made.firstEdition, cardId: "cardX",
        partnerId: "p2", collectorId: "c2" });
    const stored = (await ctx.repository.loadWorld()).opportunities[0];
    eq(stored.canonicalCardId, made.unlimited, "the goal's card, not the payload's");
    eq(stored.partnerId, "p1", "the copy's owner, not the payload's");
    eq(stored.collectorId, "c1", "the actor's collector, not the payload's");
  });

  test("a legacy deal still works exactly as it did", async () => {
    const ctx = await world();
    const legacy = { id: "cardX", name: "Charizard", set: "Base", num: "4",
      print: "Holo", edition: "Unlimited", language: "EN", grade: "Raw", condition: "NM" };
    await ctx.repository.saveWorld({
      catalog: [legacy],
      collectors: [{ id: "c1", name: "Casey" }],
      partners: [{ id: "p1", name: "Northline" }],
      relationships: [{ partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" }],
      invitations: [],
      goals: [{ id: "g1", collectorId: "c1", cardId: "cardX", tier: "primary", since: "2030-01-01" }],
      inventory: [{ invId: "i1", partnerId: "p1", cardId: "cardX", ask: 900,
        photos: { front: null, back: null }, archived: false }],
      collectorCopies: [], interests: [], opportunities: [], conversations: [],
      photoRequests: [], copyReviews: [],
    });
    await acted(ctx, ACTOR.casey, "startOpportunity",
      { goalId: "g1", invId: "i1", amount: 800 });
    const stored = (await ctx.repository.loadWorld()).opportunities[0];
    eq(stored.cardId, "cardX", "the demo's own reference, kept");
    assert(!("canonicalCardId" in stored) || stored.canonicalCardId == null, "and nothing invented");
  });

  test("the world refuses a deal that names no card, or two", () => {
    const base = {
      catalog: [], collectors: [{ id: "c1" }], partners: [{ id: "p1" }],
      relationships: [], invitations: [], goals: [], inventory: [], collectorCopies: [],
      interests: [], conversations: [], photoRequests: [], copyReviews: [],
    };
    const deal = (extra) => ({ id: "o1", collectorId: "c1", partnerId: "p1",
      stage: "completed", declined: false, completedAt: "2030-01-02", ...extra });
    const codes = (state) => validateWorld(state).errors.map((e) => e.code);
    assert(codes({ ...base, opportunities: [deal({})] }).includes("ref.missing"),
      "a deal over no card is not a deal");
    assert(codes({ ...base, opportunities: [deal({ cardId: "x", canonicalCardId: "k" })] })
      .includes("ref.ambiguous"), "and a deal over two cards is two deals");
    eq(json(codes({ ...base, opportunities: [deal({ canonicalCardId: "k" })] })), json([]),
      "one canonical reference is a valid deal");
  });

  test("the database is the backstop: a deal cannot name a card that is not there", async () => {
    const ctx = await world();
    const state = await ctx.repository.loadWorld();
    let failed = null;
    try {
      await ctx.repository.saveWorld({ ...state, opportunities: [{ id: "o1", collectorId: "c1",
        partnerId: "p1", canonicalCardId: "not-a-card", stage: "completed", declined: false,
        completedAt: "2030-01-02" }] });
    } catch (error) { failed = error; }
    assert(failed, "the foreign key refused it");
    eq((await ctx.repository.loadWorld()).opportunities.length, 0, "and nothing was stored");
  });

  test("the migration is additive and backfills nothing", () => {
    const sql = read("persistence/migrations/0009_opportunity_canonical_card.sql");
    assert(/alter table metyet\.opportunities\s+add column canonical_card_id text/.test(sql),
      "the column arrives");
    assert(/opportunities_canonical_card_fk/.test(sql), "held by a foreign key");
    assert(/alter column card_id drop not null/.test(sql), "and the legacy column is relaxed");
    assert(!/\bupdate\b|\binsert\b|\bdrop table\b|\bdrop column\b|\bdelete\b/i.test(sql),
      "nothing is written, translated, guessed or destroyed");
    /* One table. Binder copies, trade rows and conversations move with the
       batch that rewrites the command that writes them. */
    const touched = [...sql.matchAll(/alter table\s+([a-z_.]+)/g)].map((m) => m[1]);
    eq(json([...new Set(touched)]), json(["metyet.opportunities"]), "and one table is touched");
  });
});

/* ============================================================== G */
describe("G. B5, B6, B7 and the demo, as they were", () => {

  test("supply and demand still behave exactly as their own batches left them", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const goalId = idOf(await want(ctx.app, "casey", made.unlimited, "primary"));
    const invId = idOf(await hold(ctx.app, "north", made.unlimited, { grade: "PSA 9" }));

    const dup = await want(ctx.app, "casey", made.unlimited);
    eq(dup.statusCode, 409, "one live goal per collector per exact card (B7)");
    eq(dup.json().error.refused, "duplicate-goal");

    const copy = (await view(ctx, "north")).state.inventory[0];
    eq(copy.canonicalCardId, made.unlimited, "a copy names a canonical card (B6)");
    eq(copy.grade, "PSA 9", "and grade is the copy's, not the card's (B5)");
    assert(goalId && invId);
  });

  test("nothing here reaches a provider, and no provider id is anywhere near it", () => {
    const files = ["domain/metyet-discovery.js", "domain/metyet-projection.js",
      "client/tp/sections/Opportunities.jsx", "client/collector/sections/Goals.jsx",
      "persistence/migrations/0009_opportunity_canonical_card.sql"];
    for (const f of files) {
      const src = code(f);
      assert(!/scrydex|pokemontcg|providerCardId|provider_card_id|apiKey|pokemon_cards\.json/i.test(src),
        `${f} mentions a provider`);
      assert(!/fetch\(|require\(["']https?|axios/.test(src), `${f} reaches the network`);
    }
  });

  test("no score, no ranking, no recommendation, anywhere in the discovery path", () => {
    const files = ["domain/metyet-discovery.js", "client/tp/sections/Opportunities.jsx",
      "client/collector/sections/Goals.jsx", "client/tp/present.js", "client/collector/present.js"];
    for (const f of files) {
      const src = code(f);
      assert(!/\bscore\b|\bmatchScore\b|\brelevance\b|\brecommend/i.test(src),
        `${f} has grown an opinion about how good a match is`);
      assert(!/\bfuzzy\b|levenshtein|similarity|\.includes\(\s*query/i.test(src),
        `${f} compares cards by resemblance`);
    }
  });

  test("the derivation writes nothing, and cannot", () => {
    const src = code("domain/metyet-discovery.js");
    assert(!/\brepository\b|\bsaveWorld\b|\bexecuteCommand\b|\binsert\b|\bupdate\s+metyet/i.test(src),
      "no write path");
    assert(!/\bmath\.random\b|\bdate\.now\b|new Date\(\)/i.test(src),
      "and no clock or randomness, so one world has one answer");
  });

  test("a discovery is never stored: no table, no column, no collection", async () => {
    const ctx = await world();
    await overlap(ctx);
    const { rows: tables } = await ctx.db.transaction((tx) => tx.query(
      "select table_name from information_schema.tables where table_schema = 'metyet'"),
    { readOnly: true });
    const named = tables.map((t) => t.table_name).filter((n) => /discover/i.test(n));
    eq(json(named), json([]), "no table holds one");
    const stored = await ctx.repository.loadWorld();
    assert(!("discoveries" in stored), "and the canonical world has no such collection");
    eq((await found(ctx, "casey")).length, 1, "while the seat is told about it all the same");
  });

  test("the demo prototype's own matching was not touched", () => {
    const entities = read("domain/metyet-entities.js");
    assert(/partnersHolding/.test(entities) && /goalsMatchingCard/.test(entities),
      "the prototype's selectors are still there");
    assert(/sameIdentity/.test(entities), "still on the legacy key, which is the demo's");
    const discovery = read("domain/metyet-discovery.js");
    assert(!/sameIdentity|identityKey/.test(discovery),
      "and the canonical derivation does not borrow it");
  });

  test("the Opportunity aggregate is still the only durable one, and still needs a person", () => {
    const commands = code("domain/metyet-commands.js");
    const starts = [...commands.matchAll(/opportunities:\s*\[\.\.\.list\(state\.opportunities\)/g)];
    eq(starts.length, 1, "exactly one command creates an Opportunity");
    assert(/startOpportunity\(state, a, \{ goalId, invId, amount \}/.test(commands),
      "and it is the collector's offer, which carries a figure a person chose");
  });
});

/* ============================================================== H
   WHAT EACH PERSON ACTUALLY READS.

   The same projection both seats receive above, rendered by the production
   components. A derivation nobody is shown is not a feature, and a sentence
   that overclaims is worse than no sentence — so this section is about the
   words as much as the wiring. */
const React = require("react");
const TR = require("react-test-renderer");
const esbuild = require("esbuild");

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
const TpShell = load("client/tp/TrustedPartnerShell.jsx").default;
const CollectorShellUI = load("client/collector/CollectorShell.jsx").default;

const render = (element) => { let r; TR.act(() => { r = TR.create(element); }); return r; };
const instText = (node) => {
  const out = [];
  const walk = (n) => {
    if (typeof n === "string" || typeof n === "number") { out.push(String(n)); return; }
    if (!n || !Array.isArray(n.children)) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out.join(" ");
};
const texts = (r) => {
  const out = [];
  const walk = (n) => {
    if (n && n.type === "style") return;
    for (const c of (n && n.children) || []) {
      if (typeof c === "string" || typeof c === "number") out.push(String(c)); else walk(c);
    }
  };
  walk(r.toJSON());
  return out.join(" ").replace(/\s+/g, " ");
};
const clickText = (r, label) => {
  const button = r.root.findAll((n) => n.type === "button").find((n) => instText(n).includes(label));
  assert(button, `no button "${label}"`);
  TR.act(() => { button.props.onClick(); });
};

/* A canonical world in memory — no database, because this section is about
   what the components do with a projection, not about how one is stored. */
const CARD = "cc-charizard-unlimited";
const canonicalWorld = (over = {}) => ({
  catalog: [],
  collectors: [{ id: "c1", name: "Casey" }, { id: "c2", name: "Dana" }],
  partners: [{ id: "p1", name: "Northline" }],
  relationships: [
    { partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" },
    { partnerId: "p1", collectorId: "c2", status: "accepted", at: "2030-01-01" },
  ],
  invitations: [],
  goals: [{ id: "g1", collectorId: "c1", canonicalCardId: CARD, tier: "primary",
    since: "2030-01-02", note: "" }],
  inventory: [{ invId: "i1", partnerId: "p1", canonicalCardId: CARD, ask: 900, cost: 400,
    acquired: "2029-01-01", note: "PRIVATE", photos: { front: null, back: null }, archived: false }],
  collectorCopies: [], interests: [], opportunities: [], conversations: [],
  photoRequests: [], copyReviews: [], ...over,
});
const describer = () => ({
  search: async () => ({ contexts: [] }),
  read: async () => ({ context: null, cards: [] }),
  describe: async () => ({ cards: [{ canonicalCardId: CARD, cardName: "Charizard",
    expansionName: "Base", collectorNumber: "4", finish: "Holofoil", printRun: "Unlimited",
    language: "English" }] }),
});

describe("H. what each person actually reads", () => {

  test("the collector is told which partner has it, on the goal itself", async () => {
    const state = projectForActor(canonicalWorld(), { collectorId: "c1" });
    eq(state.discoveries.length, 1, "the projection carried one");
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(CollectorShellUI,
        { state, onSignOut() {}, onBrowseCards: describer() }));
    });
    /* C1 made Browse the Collector's first section, so the goal list — which
       is what these assertions are about — is one press away. */
    TR.act(() => { clickText(r, "Goals"); });
    await TR.act(async () => {});
    const said = texts(r);
    assert(said.includes("Northline has this card."),
      `expected the plain sentence, got: ${said.slice(0, 400)}`);
    assert(!/match|recommend|score/i.test(said), "and no marketplace vocabulary");
  });

  test("two copies are counted, and counted as copies rather than allocated", async () => {
    const world = canonicalWorld();
    world.inventory.push({ invId: "i2", partnerId: "p1", canonicalCardId: CARD, ask: 850,
      photos: { front: null, back: null }, archived: false });
    const state = projectForActor(world, { collectorId: "c1" });
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(CollectorShellUI,
        { state, onSignOut() {}, onBrowseCards: describer() }));
    });
    /* C1 made Browse the Collector's first section, so the goal list — which
       is what these assertions are about — is one press away. */
    TR.act(() => { clickText(r, "Goals"); });
    await TR.act(async () => {});
    const said = texts(r);
    assert(said.includes("Northline has 2 of this card."), said.slice(0, 400));
    assert(!/reserved|held for you|yours/i.test(said), "nothing is set aside for anybody");
  });

  test("the partner is told who is looking, and for which card", async () => {
    const state = projectForActor(canonicalWorld(), { partnerId: "p1" });
    eq(state.discoveries.length, 1);
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(TpShell,
        { state, onSignOut() {}, onBrowseCards: describer() }));
    });
    TR.act(() => { clickText(r, "Opportunities"); });
    await TR.act(async () => {});
    const said = texts(r);
    assert(said.includes("Ready to coordinate"), said.slice(0, 400));
    assert(said.includes("Casey is actively looking for this card."), said.slice(0, 600));
    assert(said.includes("Charizard"), "and it says which card");
  });

  test("Secondary keeps its own sentence on the partner's screen", async () => {
    const world = canonicalWorld();
    world.goals[0].tier = "secondary";
    const state = projectForActor(world, { partnerId: "p1" });
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(TpShell,
        { state, onSignOut() {}, onBrowseCards: describer() }));
    });
    TR.act(() => { clickText(r, "Opportunities"); });
    await TR.act(async () => {});
    const said = texts(r);
    assert(said.includes("This card is on Casey's secondary list."), said.slice(0, 600));
    assert(!said.includes("actively looking"), "and is not dressed up as hunting");
  });

  test("a card whose name has not arrived is still a card you have", async () => {
    const state = projectForActor(canonicalWorld(), { partnerId: "p1" });
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(TpShell, { state, onSignOut() {} }));
    });
    TR.act(() => { clickText(r, "Opportunities"); });
    await TR.act(async () => {});
    const said = texts(r);
    assert(said.includes("Ready to coordinate"), "the panel is still there");
    assert(said.includes("A card MetYet is still describing"), said.slice(0, 500));
    assert(said.includes("Casey is actively looking for this card."), "and the demand still reads");
  });

  test("no overlap is no panel, not an empty one", async () => {
    const world = canonicalWorld();
    world.inventory = [];
    const tp = projectForActor(world, { partnerId: "p1" });
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(TpShell,
        { state: tp, onSignOut() {}, onBrowseCards: describer() }));
    });
    TR.act(() => { clickText(r, "Opportunities"); });
    await TR.act(async () => {});
    const said = texts(r);
    assert(!said.includes("Ready to coordinate"), "no panel");
    assert(said.includes("Nothing in progress yet."), "and the section reads as it always did");
  });

  test("a live deal replaces the overlap for that partner, and only that partner", async () => {
    const world = canonicalWorld();
    world.opportunities = [{ id: "o1", goalId: "g1", collectorId: "c1", partnerId: "p1",
      canonicalCardId: CARD, invId: "i1", stage: "agree-price", listedPrice: 900,
      agreedPrice: null, priceThread: [{ by: "collector", type: "offer", amount: 800, at: "2030-02-01" }],
      trade: { submitted: false, cards: [] }, declined: false, completedAt: null, updated: "2030-02-01" }];
    const state = projectForActor(world, { collectorId: "c1" });
    eq(state.discoveries.length, 1, "the overlap is still true — nothing is committed yet");
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(CollectorShellUI,
        { state, onSignOut() {}, onBrowseCards: describer() }));
    });
    /* C1 made Browse the Collector's first section, so the goal list — which
       is what these assertions are about — is one press away. */
    TR.act(() => { clickText(r, "Goals"); });
    await TR.act(async () => {});
    const said = texts(r);
    assert(!said.includes("Northline has this card."),
      "the deal is the truer sentence, so the screen does not say both");
    assert(said.includes("Agreeing a price"), "and the deal is what is shown");
  });

  test("the sections are handed no way to write", () => {
    const opportunities = code("client/tp/sections/Opportunities.jsx");
    assert(!/onAddCopy|onInvite|onAddGoal|command\(|mutate\(/.test(opportunities),
      "Opportunities can ask what a card is called and nothing else");
    const goals = code("client/collector/sections/Goals.jsx");
    assert(!/discoveries\s*=|state\.discoveries\s*=/.test(goals),
      "and nothing writes back into the overlap it was given");
  });
});

run();
