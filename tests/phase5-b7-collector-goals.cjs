/* ============================================================================
   PHASE 5 BATCH 7 — COLLECTOR GOALS

   Demand, said out loud.

   Batch 6 put supply on canonical cards: a Trusted Partner saying "I have one
   of these". This is the other half — a Collector saying "I want one of those,
   and I want you to know it" — and the two now point at the same catalog
   rather than at two descriptions that happen to read alike.

   The line this batch has to hold is not the one about identity, which Batches
   5 and 6 already drew. It is about MEANING: a Goal is something a person
   SAID. Nothing infers one, nothing scores one, and Primary and Secondary stay
   two different sentences rather than one word called "match".

   A. authorization    whose demand this is, and who decided
   B. which card       what may be wanted, and what may not
   C. how hard         Primary, Secondary, and nothing between or beyond
   D. duplicates       one live Goal per Collector per exact card
   E. persistence      what is stored, and what it costs to show
   F. visibility       who is told, and who is not
   G. compatibility    supply, the demo and the catalog all as they were
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
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { validateWorld } = require("../domain/metyet-world.js");
const RT = require("../domain/metyet-runtime.js");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "");

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

/* Casey knows Northline. Dana knows nobody. Second is a partner outside
   Casey's network. The catalog starts empty, as production's does. */
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
    relationships: [{ partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" }],
    invitations: [], goals: [], inventory: [], binder: [], interests: [],
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
  return { expansionId, cardContextId, ...made };
}

const post = (app, token, command, payload) => app.inject({ method: "POST", url: "/api/commands",
  headers: { authorization: `Bearer ${token}` }, payload: { command, payload } });
const get = (app, token, url) => app.inject({ method: "GET", url,
  headers: { authorization: `Bearer ${token}` } });
const want = (app, token, canonicalCardId, tier = "primary", extra = {}) =>
  post(app, token, "addGoal", { canonicalCardId, tier, ...extra });
const goalsOf = async (ctx) => (await ctx.repository.loadWorld()).goals;

/* ============================================================== A */
describe("A. whose demand this is, and who decided", () => {

  test("a Collector says what they want, and it is theirs because of who asked", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const res = await want(ctx.app, "casey", cards.unlimited, "primary");
    eq(res.statusCode, 200, res.body);
    const stored = (await goalsOf(ctx))[0];
    eq(stored.collectorId, "c1", "owned by the collector who asked");
    eq(stored.canonicalCardId, cards.unlimited, "and it names the exact card chosen");
    eq(stored.tier, "primary", "and how hard they are looking");
    assert(!("cardId" in stored) || stored.cardId == null, "and no legacy reference came with it");
  });

  test("a Trusted Partner cannot create a Collector's demand", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const res = await want(ctx.app, "north", cards.unlimited);
    eq(res.statusCode, 409, res.body);
    eq(res.json().error.refused, "not-owner", "demand is not a partner's to state");
    eq((await goalsOf(ctx)).length, 0, "and nothing was written");
  });

  test("ownership cannot be forged in the payload", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const res = await want(ctx.app, "casey", cards.unlimited, "primary",
      { collectorId: "c2", partnerId: "p2" });
    eq(res.statusCode, 200, res.body);
    const stored = (await goalsOf(ctx))[0];
    eq(stored.collectorId, "c1", "the actor's collector, not the payload's");
    assert(!("partnerId" in stored), "and a Goal is addressed to nobody in particular");
  });

  test("one Collector cannot touch another's goal", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const goalId = (await want(ctx.app, "casey", cards.unlimited)).json().value;
    for (const [command, payload] of [
      ["updateGoalTier", { goalId, tier: "secondary" }],
      ["confirmGoal", { goalId }],
      ["removeGoal", { goalId }],
    ]) {
      const res = await post(ctx.app, "dana", command, payload);
      eq(res.json().error.refused, "not-owner", command);
    }
    eq((await goalsOf(ctx)).length, 1, "and the goal is untouched");
  });
});

/* ============================================================== B */
describe("B. what may be wanted, and what may not", () => {

  test("a card that does not exist is refused", async () => {
    const ctx = await world();
    await charizard(ctx);
    const res = await want(ctx.app, "casey", "ccnothing");
    eq(res.statusCode, 409, res.body);
    eq(res.json().error.refused, "card-unavailable", "a clear rule, not a database error");
    eq((await goalsOf(ctx)).length, 0, "and nothing was written");
  });

  test("a withdrawn card cannot be newly wanted — but demand already stated survives", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const goalId = (await want(ctx.app, "casey", cards.shadowless)).json().value;
    await ctx.catalog.withdrawCanonicalCard(cards.shadowless);

    const again = await want(ctx.app, "dana", cards.shadowless);
    eq(again.json().error.refused, "card-unavailable", "nobody may start wanting it now");

    /* The half that matters: Casey said something, and a catalog change does
       not unsay it. */
    const still = (await goalsOf(ctx)).find((g) => g.id === goalId);
    assert(still, "the goal is still there");
    eq(still.canonicalCardId, cards.shadowless, "still naming the card it was for");
    eq(still.tier, "primary", "and still saying how hard they are looking");
    const mine = (await get(ctx.app, "casey", "/api/view")).json().state.goals;
    eq(mine.length, 1, "and they can still see it");
  });

  test("the browser cannot mint a card, only name one", async () => {
    const ctx = await world();
    await charizard(ctx);
    const res = await want(ctx.app, "casey", "ccinvented", "primary",
      { cardName: "Charizard", expansion: "Base", collectorNumber: "4" });
    eq(res.json().error.refused, "card-unavailable", "a description is not a card");
    const counts = (await ctx.pg.query(`select
        (select count(*) from metyet_catalog.canonical_cards)::int as k,
        (select count(*) from metyet_catalog.card_contexts)::int as c`)).rows[0];
    eq(`${counts.k},${counts.c}`, "3,1", "the catalog is exactly as the fixture left it");
  });

  test("display fields sent alongside cannot override which card is wanted", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await want(ctx.app, "casey", cards.firstEdition, "primary",
      { cardName: "Blastoise", finish: "reverse_holofoil", printRun: "unlimited" });
    const stored = (await goalsOf(ctx))[0];
    eq(stored.canonicalCardId, cards.firstEdition, "the id decided, and only the id");
    const described = await ctx.catalog.describeCanonicalCards([stored.canonicalCardId]);
    eq(described[0].cardName, "Charizard", "the catalog's name");
    eq(described[0].printRun, "first_edition", "and the catalog's print run");
  });

  test("the printings of one card are different things to want", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    for (const id of [cards.firstEdition, cards.shadowless, cards.unlimited]) {
      eq((await want(ctx.app, "casey", id)).statusCode, 200, "each may be wanted separately");
    }
    const held = (await goalsOf(ctx)).map((g) => g.canonicalCardId);
    eq(new Set(held).size, 3, "three goals for three cards, not one card three times");
  });

  test("the same card in another release is a different thing to want", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const base2 = await ctx.catalog.putExpansion({ game: "pokemon", code: "base4", name: "Base Set 2" });
    const context2 = await ctx.catalog.putCardContext({ game: "pokemon",
      expansionId: base2.expansionId, collectorNumber: "4", cardName: "Charizard",
      artist: "Mitsuhiro Arita" });
    const reprint = (await ctx.catalog.putCanonicalCard(
      { cardContextId: context2.cardContextId, printRun: "unlimited", finish: "holofoil" })).canonicalCardId;
    eq((await want(ctx.app, "casey", cards.unlimited)).statusCode, 200, "the original");
    eq((await want(ctx.app, "casey", reprint)).statusCode, 200, "and the reprint, separately");
    eq((await goalsOf(ctx)).length, 2, "two goals, because they are two cards");
  });

  test("a Goal is for one card: naming both ways is refused", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const res = await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: cards.unlimited, cardId: "legacy-1", tier: "primary" });
    eq(res.json().error.refused, "not-found", "two answers to one question is no answer");
  });
});

/* ============================================================== C */
describe("C. how hard somebody is looking", () => {

  test("Primary and Secondary are both explicit, and they are different", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await want(ctx.app, "casey", cards.firstEdition, "primary");
    await want(ctx.app, "casey", cards.unlimited, "secondary");
    const held = (await goalsOf(ctx));
    eq(held.find((g) => g.canonicalCardId === cards.firstEdition).tier, "primary");
    eq(held.find((g) => g.canonicalCardId === cards.unlimited).tier, "secondary");
    /* Both are demand. Neither is a preference, and there is no third value. */
    eq(new Set(held.map((g) => g.tier)).size, 2, "two meanings, said apart");
  });

  test("a level the product does not have becomes the one it does, never a new one", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    for (const tier of ["urgent", "maybe", "", null, 3, "PRIMARY"]) {
      const res = await post(ctx.app, "casey", "addGoal",
        { canonicalCardId: cards.unlimited, tier });
      if (res.statusCode === 200) {
        const stored = (await goalsOf(ctx))[0];
        eq(stored.tier, "secondary", `"${tier}" did not become a level of its own`);
        await post(ctx.app, "casey", "removeGoal", { goalId: stored.id });
      }
    }
    const tiers = new Set((await goalsOf(ctx)).map((g) => g.tier));
    assert([...tiers].every((t) => t === "primary" || t === "secondary"),
      "a third level exists: " + [...tiers].join(","));
  });

  test("changing your mind changes what you mean, never which card you mean", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const goalId = (await want(ctx.app, "casey", cards.firstEdition, "secondary")).json().value;
    const res = await post(ctx.app, "casey", "updateGoalTier", { goalId, tier: "primary" });
    eq(res.statusCode, 200, res.body);
    const stored = (await goalsOf(ctx))[0];
    eq(stored.tier, "primary", "the intent moved");
    eq(stored.canonicalCardId, cards.firstEdition, "and the card did not");
    eq(stored.id, goalId, "and it is the same goal");
  });

  test("a priority change carries no card, so it cannot move one", () => {
    const commands = code("domain/metyet-commands.js");
    const body = commands.slice(commands.indexOf("updateGoalTier(state"),
      commands.indexOf("confirmGoal(state"));
    assert(!/canonicalCardId|cardId/.test(body), "changing intent can reach a card reference");
    const client = code("client/commands.js");
    const binding = client.slice(client.indexOf("export function setGoalPriority"),
      client.indexOf("export function removeCollectorGoal"));
    assert(!/canonicalCardId|cardId/.test(binding), "the client binding carries a card");
  });

  test("nothing infers a Goal: searching and reading create none", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await get(ctx.app, "casey", "/api/card-contexts?query=Charizard");
    await get(ctx.app, "casey", `/api/card-contexts/${cards.cardContextId}`);
    await get(ctx.app, "casey", `/api/canonical-cards?ids=${cards.unlimited}`);
    await get(ctx.app, "casey", "/api/view");
    eq((await goalsOf(ctx)).length, 0, "looking at cards is not wanting them");
    /* And no read route could create one even in principle. */
    const app = code("server/app.js");
    const reads = app.match(/app\.get\([^)]*\)/g) || [];
    assert(!reads.some((r) => /addGoal|executeCommand/.test(r)), "a read route reaches a command");
  });
});

/* ============================================================== D */
describe("D. one Goal per Collector per exact card", () => {

  test("wanting the same card twice is refused, deterministically", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    eq((await want(ctx.app, "casey", cards.unlimited, "secondary")).statusCode, 200);
    const again = await want(ctx.app, "casey", cards.unlimited, "primary");
    eq(again.statusCode, 409, again.body);
    eq(again.json().error.refused, "duplicate-goal", "and says which rule");
    const held = await goalsOf(ctx);
    eq(held.length, 1, "one goal");
    eq(held[0].tier, "secondary", "and the second attempt did not silently re-level the first");
  });

  test("the database holds the rule too", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await want(ctx.app, "casey", cards.unlimited);
    let failed = false;
    try {
      const w = await ctx.repository.loadWorld();
      await ctx.repository.saveWorld({ ...w, goals: [...w.goals,
        { id: "gforged", collectorId: "c1", canonicalCardId: cards.unlimited, tier: "primary" }] });
    } catch (error) { failed = true; }
    assert(failed, "duplicate demand was written around the command");
  });

  test("two Collectors wanting one card are not duplicates of each other", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    eq((await want(ctx.app, "casey", cards.unlimited)).statusCode, 200);
    eq((await want(ctx.app, "dana", cards.unlimited)).statusCode, 200);
    eq((await goalsOf(ctx)).length, 2, "two people wanting one card is two goals");
  });

  test("the duplicate test is exact identity, never a resemblance", () => {
    const commands = code("domain/metyet-commands.js");
    const body = commands.slice(commands.indexOf("addGoal(state"),
      commands.indexOf("updateGoalTier(state"));
    /* The canonical branch compares ids and nothing else. No name, no artwork,
       no similarity, no normalisation. */
    assert(/g\.canonicalCardId === canonical/.test(body),
      "the canonical duplicate test is not an id comparison");
    assert(!/includes\(|toLowerCase\(|similar|fuzzy|distance/.test(body),
      "a resemblance crept into the duplicate rule");
  });

  test("removing lets you want it again — the rule is about LIVE demand", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const goalId = (await want(ctx.app, "casey", cards.unlimited)).json().value;
    eq((await post(ctx.app, "casey", "removeGoal", { goalId })).statusCode, 200);
    eq((await goalsOf(ctx)).length, 0, "no longer looking");
    eq((await want(ctx.app, "casey", cards.unlimited)).statusCode, 200, "and may look again");
  });
});

/* ============================================================== E */
describe("E. what is stored, and what it costs to show it", () => {

  test("the reference is a real foreign key, and the world stays valid", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await want(ctx.app, "casey", cards.unlimited);
    const row = (await ctx.pg.query(
      "select card_id, canonical_card_id from metyet.goals")).rows[0];
    eq(row.canonical_card_id, cards.unlimited, "the column holds the canonical card");
    eq(row.card_id, null, "and the legacy column holds nothing");
    const w = await ctx.repository.loadWorld();
    assert(validateWorld(w).ok, "valid: " + JSON.stringify(validateWorld(w).errors));
  });

  test("a goal for a card nobody has cannot be written, whatever route is taken", async () => {
    const ctx = await world();
    await charizard(ctx);
    let failed = false;
    try {
      const w = await ctx.repository.loadWorld();
      await ctx.repository.saveWorld({ ...w,
        goals: [{ id: "g1", collectorId: "c1", canonicalCardId: "ccnothing", tier: "primary" }] });
    } catch (error) { failed = true; }
    assert(failed, "the foreign key is the backstop under the server's own check");
  });

  test("a goal must name a card, and only one", async () => {
    const ctx = await world();
    const base = await ctx.repository.loadWorld();
    const neither = validateWorld({ ...base, goals: [{ id: "g", collectorId: "c1", tier: "primary" }] });
    assert(!neither.ok && neither.errors.some((e) => /names no card/.test(e.message)),
      "wanting nothing is not demand");
    const both = validateWorld({ ...base,
      goals: [{ id: "g", collectorId: "c1", cardId: "k1", canonicalCardId: "cc1", tier: "primary" }] });
    assert(!both.ok && both.errors.some((e) => e.code === "ref.ambiguous"),
      "and wanting two cards is not one goal");
  });

  test("showing a list is one request, not one per goal, and never the catalogue", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    for (const id of [cards.firstEdition, cards.shadowless, cards.unlimited]) {
      await want(ctx.app, "casey", id);
    }
    /* Twelve cards nobody wants: they must not travel. */
    const { cardContextId } = await ctx.catalog.putCardContext({ game: "pokemon",
      expansionId: cards.expansionId, collectorNumber: "9", cardName: "Bulbasaur" });
    for (let i = 0; i < 12; i += 1) {
      await ctx.catalog.putCanonicalCard({ cardContextId, printRun: "unlimited",
        finish: "non_holo", language: ["en", "ja", "fr", "de"][i % 4] });
    }
    const wanted = (await get(ctx.app, "casey", "/api/view")).json().state.goals
      .map((g) => g.canonicalCardId);
    eq(wanted.length, 3, "three goals");
    const described = (await get(ctx.app, "casey",
      `/api/canonical-cards?ids=${wanted.join(",")}`)).json();
    eq(described.cards.length, 3, "described in ONE request");
    assert(!JSON.stringify(described).includes("Bulbasaur"), "and nothing nobody wants came with it");
  });

  test("the projection does not grow when the catalogue does", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await want(ctx.app, "casey", cards.unlimited);
    const before = (await get(ctx.app, "casey", "/api/view")).body;
    const { cardContextId } = await ctx.catalog.putCardContext({ game: "pokemon",
      expansionId: cards.expansionId, collectorNumber: "58", cardName: "Pikachu" });
    for (let i = 0; i < 20; i += 1) {
      await ctx.catalog.putCanonicalCard({ cardContextId, printRun: "unlimited",
        finish: "non_holo", language: ["en", "ja", "fr", "de", "it"][i % 5] });
    }
    eq((await get(ctx.app, "casey", "/api/view")).body, before,
      "a collector's view of their own list is the same bytes");
  });
});

/* ============================================================== F */
describe("F. who is told, and who is not", () => {

  test("a Collector sees their own demand", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await want(ctx.app, "casey", cards.unlimited, "primary", { note: "for the binder" });
    const mine = (await get(ctx.app, "casey", "/api/view")).json().state.goals;
    eq(mine.length, 1, "their own list");
    eq(mine[0].canonicalCardId, cards.unlimited, "the card");
    eq(mine[0].tier, "primary", "and how hard they are looking");
    eq(mine[0].note, "for the binder", "and what they wrote");
  });

  test("the Trusted Partner they know is told, with the card and the intent", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await want(ctx.app, "casey", cards.firstEdition, "primary");
    await want(ctx.app, "casey", cards.unlimited, "secondary");
    const theirs = (await get(ctx.app, "north", "/api/view")).json().state.goals;
    eq(theirs.length, 2, "both goals reached the partner");
    for (const g of theirs) {
      eq(g.collectorId, "c1", "attributed to the collector who said it");
      assert(g.canonicalCardId, "naming the exact card");
      assert(g.tier === "primary" || g.tier === "secondary", "and how hard they are looking");
    }
    eq(theirs.filter((g) => g.tier === "primary").length, 1, "one actively hunted");
    eq(theirs.filter((g) => g.tier === "secondary").length, 1, "and one kept an eye out for");
  });

  test("a Trusted Partner outside the network is told nothing", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await want(ctx.app, "casey", cards.unlimited, "primary", { note: "PRIVATE-NOTE" });
    const res = await get(ctx.app, "second", "/api/view");
    eq(res.json().state.goals.length, 0, "Second is nobody Casey knows");
    assert(!res.body.includes("PRIVATE-NOTE"), "and nothing of it left the server");
    assert(!res.body.includes(cards.unlimited), "not even which card");
  });

  test("a Collector is told nothing of another Collector's demand", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await want(ctx.app, "casey", cards.unlimited);
    const res = await get(ctx.app, "dana", "/api/view");
    eq(res.json().state.goals.length, 0, "Dana has her own list and only hers");
  });

  test("describing the wanted cards reintroduces nothing private", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await want(ctx.app, "casey", cards.unlimited, "primary", { note: "PRIVATE-NOTE" });
    const described = (await get(ctx.app, "north",
      `/api/canonical-cards?ids=${cards.unlimited}`)).body;
    assert(!described.includes("PRIVATE-NOTE"), "the catalogue carried a private note");
    assert(!described.includes("c1") && !described.includes("Casey"),
      "the catalogue named who wants it");
  });

  test("the two intents stay two sentences, never one word", () => {
    const present = read("client/tp/present.js");
    assert(/actively looking for this card/.test(present), "the active sentence is gone");
    assert(/secondary list/.test(present), "the passive sentence is gone");
    const line = code("client/tp/present.js");
    const fn = line.slice(line.indexOf("export const demandLine"),
      line.indexOf("export const tierLabel"));
    assert(!/\bmatch\b|\binterest\b|\bpreference\b/i.test(fn),
      "the distinction was collapsed into a generic word");
  });
});

/* ============================================================== G */
describe("G. everything that already worked", () => {

  test("B7 creates no opportunity and matches nothing", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    /* A partner holds the very card a collector wants. Batch 8 is what notices;
       Batch 7 must not. */
    await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: cards.unlimited, ask: 4200 } });
    await want(ctx.app, "casey", cards.unlimited, "primary");
    const w = await ctx.repository.loadWorld();
    eq(w.opportunities.length, 0, "no opportunity was created");
    eq(w.conversations.length, 0, "and nothing was said to anybody");
    const commands = code("domain/metyet-commands.js");
    const body = commands.slice(commands.indexOf("addGoal(state"),
      commands.indexOf("updateGoalTier(state"));
    assert(!/inventory|opportunit|partnersHolding|sameIdentity/i.test(body),
      "stating demand looked at supply");
  });

  test("supply still works, and demand did not disturb it", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const res = await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: cards.firstEdition, grade: "PSA 9", cost: 3100 } });
    eq(res.statusCode, 200, res.body);
    const copy = (await ctx.repository.loadWorld()).inventory[0];
    eq(copy.canonicalCardId, cards.firstEdition, "the copy still names its card");
    eq(copy.grade, "PSA 9", "and grade is still the copy's");
  });

  test("grade and condition are not demand, and no band was invented", () => {
    const commands = code("domain/metyet-commands.js");
    const body = commands.slice(commands.indexOf("addGoal(state"),
      commands.indexOf("updateGoalTier(state"));
    assert(!/grade|condition|psa|\bnm\b/i.test(body), "a Goal learned about a physical copy");
    /* A band is a grade with a comparison attached. Looked for in CODE, since
       prose legitimately says "at least" about other things entirely. */
    const BAND = /PSA\s*\d+\s*\+|NM\s*\+|(grade|condition)\s*(>=|>|or better|and above)/i;
    for (const rel of ["client/collector/sections/Goals.jsx", "client/commands.js",
      "domain/metyet-commands.js"]) {
      assert(!BAND.test(code(rel)), `${rel} invented a grade band`);
    }
  });

  test("the legacy path still works, for the world that still uses it", async () => {
    const ctx = await world();
    const w = await ctx.repository.loadWorld();
    const demo = { ...w,
      catalog: [{ id: "k1", name: "Charizard", set: "Base Set", num: "4/102", print: "Holo",
        edition: "Unlimited", language: "English", grade: "PSA 9", condition: null }],
      goals: [{ id: "g1", collectorId: "c1", cardId: "k1", tier: "primary", since: "2030-01-01" }] };
    assert(validateWorld(demo).ok, "a world with a catalogue and a legacy goal is valid: "
      + JSON.stringify(validateWorld(demo).errors));
  });

  test("this batch moved goals and nothing else", () => {
    const migration = read("persistence/migrations/0008_goal_canonical_card.sql")
      .replace(/^--.*$/gm, "");
    assert(/metyet\.goals/.test(migration), "it is the table it says it is");
    assert(!/binder_copies|opportunities|conversations|opportunity_trade_refs|inventory_copies/
      .test(migration), "the migration touched a table that is not goals");
  });

  test("no provider was integrated and no catalogue was imported", () => {
    for (const rel of ["domain/metyet-commands.js", "server/app.js", "client/commands.js",
      "client/collector/sections/Goals.jsx",
      "persistence/migrations/0008_goal_canonical_card.sql"]) {
      assert(!/scrydex|tcgdex|pokemontcg|pokemon_cards\.json/i.test(read(rel)),
        `${rel} names a provider`);
    }
    assert(!/insert into metyet_catalog/i.test(
      read("persistence/migrations/0008_goal_canonical_card.sql")), "the migration invented cards");
  });

  test("the browser still cannot mint identity or name its own owner", () => {
    const client = ["client/commands.js", "client/collector/sections/Goals.jsx",
      "client/collector/CollectorShell.jsx"].map(code).join("\n");
    assert(!/putCanonicalCard|putCardContext|putExpansion|metyet_catalog/.test(client),
      "the client reached the catalog's writes");
    assert(!/collectorId:/.test(code("client/commands.js")), "a client binding names an owner");
  });

  test("no dependency was added", () => {
    const pkg = JSON.parse(read("package.json"));
    eq(Object.keys(pkg.dependencies).sort().join(),
      "esbuild,fastify,jose,pg,react,react-dom,react-test-renderer",
      "the runtime dependencies are the server's, and nothing more");
  });
});

run();
