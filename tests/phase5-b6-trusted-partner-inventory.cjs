/* ============================================================================
   PHASE 5 BATCH 6 — TRUSTED PARTNER INVENTORY

   The first product record to name a canonical card.

   Batch 5 built the catalog and deliberately wired nothing to it. This is the
   batch where a Trusted Partner picks an exact printing out of it and says "I
   have one of those" — and the line it has to hold is the one Batch 5 drew:
   WHICH CARD THIS IS belongs to the catalog, WHAT IS TRUE ABOUT THIS ONE
   belongs to the copy, and a browser may name the first but never invent it.

   A. authorization       whose copy this is, and who decided
   B. canonical selection what may be chosen, and what may not
   C. the copy boundary   grade, condition and cert are the copy's
   D. persistence & reads what is stored, and what it costs to display
   E. privacy             what a Collector may see of somebody else's shelf
   F. compatibility       the demo, Goals and the catalog all as they were
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
const { projectForActor } = require("../domain/metyet-projection.js");
const { validateWorld } = require("../domain/metyet-world.js");
const RT = require("../domain/metyet-runtime.js");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "");

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

const SUBJECT = { north: "sub-north", second: "sub-second", casey: "sub-casey" };

/* Two Trusted Partners, one Collector who knows the first, and an empty
   catalog — production's own starting state. */
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
    invitations: [], goals: [], inventory: [], collectorCopies: [], binders: [], binderEntries: [], interests: [],
    opportunities: [], conversations: [], photoRequests: [], copyReviews: [],
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
  const app = createApp({ repository, catalog, accounts, verifier, runtime });
  return { pg, db, runtime, repository, catalog, app };
}

/* Base Set Charizard: one checklist line, three collectible printings. */
async function charizard(ctx) {
  const { expansionId } = await ctx.catalog.putExpansion(
    { game: "pokemon", code: "base1", name: "Base", printedTotal: 102 });
  const { cardContextId } = await ctx.catalog.putCardContext({ game: "pokemon", expansionId,
    collectorNumber: "4", cardName: "Charizard", artist: "Mitsuhiro Arita", rarity: "Rare Holo" });
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
const addCopy = (app, token, copy) => post(app, token, "addInventoryCopy", { copy });

/* PAST THE DOOR (Phase 5 Batch 8.1, narrowed by C5). Batch 6 wrote four
   commands and the product offered one, so three of these rules could only be
   asked of the domain directly — `POST /api/commands` refused the other three
   before they reached it.

   C5 GAVE TWO OF THEM A SCREEN. `updateInventoryCopy` and `removeInventoryCopy`
   are on the production allow-list now, and the tests below that used to prove
   them shut ask the same questions over HTTP instead. Nothing about the rules
   changed: the seat check, the ownership check and the identity rule are Batch
   6's, unedited, and the suite that covers the rest of the production path is
   tests/phase5-c5-tp-inventory-correction.cjs.

   `addCopyPhotos` and `reviewCopy` are still domain-only, and `direct` is still
   how this suite reaches them. */
const ACTOR = { north: { partnerId: "p1" }, second: { partnerId: "p2" } };
const direct = (ctx, actor, command, payload) =>
  executeCommand(ctx.repository, { actor, command, payload, runtime: ctx.runtime });

/* ============================================================== A */
describe("A. whose copy this is, and who decided", () => {

  test("a Trusted Partner adds a copy, and it is theirs because of who asked", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const res = await addCopy(ctx.app, "north", { canonicalCardId: cards.unlimited, grade: "PSA 9", ask: 4200 });
    eq(res.statusCode, 200, res.body);
    const invId = res.json().value;
    const stored = (await ctx.repository.loadWorld()).inventory.find((i) => i.invId === invId);
    assert(stored, "persisted");
    eq(stored.partnerId, "p1", "owned by the partner who asked");
    eq(stored.canonicalCardId, cards.unlimited, "and it names the exact printing chosen");
    assert(res.json().state.inventory.some((i) => i.invId === invId), "and the answer shows it");
  });

  test("a Collector cannot add inventory at all", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const res = await addCopy(ctx.app, "casey", { canonicalCardId: cards.unlimited });
    eq(res.statusCode, 409, res.body);
    eq(res.json().error.refused, "not-owner", "refused by seat");
    eq((await ctx.repository.loadWorld()).inventory.length, 0, "and nothing was written");
  });

  test("ownership cannot be forged in the payload", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const res = await addCopy(ctx.app, "north", { canonicalCardId: cards.unlimited, partnerId: "p2" });
    eq(res.statusCode, 200, res.body);
    const stored = (await ctx.repository.loadWorld()).inventory[0];
    eq(stored.partnerId, "p1", "the actor's partner, not the payload's");
  });

  test("one Trusted Partner cannot touch another's copy", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = (await addCopy(ctx.app, "north", { canonicalCardId: cards.unlimited })).json().value;
    /* THE DOOR OPENED IN C5 AND THE RULE DID NOT MOVE. Batch 6 could only ask
       this of the domain, because `POST /api/commands` refused both commands
       outright; C5 gives them a screen, so the question is now asked where a
       browser actually asks it. `not-owner` is still the answer, and it is
       still the domain's — see tests/phase5-c5-tp-inventory-correction.cjs for
       the rest of the production-path authorization. */
    const over = await post(ctx.app, "second", "updateInventoryCopy", { invId, patch: { ask: 1 } });
    eq(over.statusCode, 409, over.body);
    eq(over.json().error.refused, "not-owner", "somebody else's shelf is not theirs to edit");
    const res = await direct(ctx, ACTOR.second, "updateInventoryCopy", { invId, patch: { ask: 1 } });
    eq(res.ok, false);
    eq(res.refused, "not-owner", "and the domain says the same thing directly");
    const gone = await direct(ctx, ACTOR.second, "removeInventoryCopy", { invId });
    eq(gone.refused, "not-owner", "nor theirs to archive");
  });
});

/* ============================================================== B */
describe("B. what may be chosen, and what may not", () => {

  test("a card that does not exist is refused, and says so in one word", async () => {
    const ctx = await world();
    await charizard(ctx);
    const res = await addCopy(ctx.app, "north", { canonicalCardId: "ccnothing" });
    eq(res.statusCode, 409, res.body);
    eq(res.json().error.refused, "card-unavailable", "a clear rule, not a database error");
    eq((await ctx.repository.loadWorld()).inventory.length, 0, "and nothing was written");
  });

  test("a withdrawn card cannot be newly chosen, and copies of it survive", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    /* Somebody already has one. */
    const invId = (await addCopy(ctx.app, "north", { canonicalCardId: cards.shadowless })).json().value;
    await ctx.catalog.withdrawCanonicalCard(cards.shadowless);

    const res = await addCopy(ctx.app, "north", { canonicalCardId: cards.shadowless });
    eq(res.json().error.refused, "card-unavailable", "nobody may start owning it now");
    const still = (await ctx.repository.loadWorld()).inventory.find((i) => i.invId === invId);
    assert(still, "and the copy somebody already had is untouched");
    eq(still.canonicalCardId, cards.shadowless, "still naming the card it is a copy of");
  });

  test("the browser cannot mint a card, only name one", async () => {
    const ctx = await world();
    await charizard(ctx);
    /* Everything a client might send that DESCRIBES a card rather than naming
       one: none of it creates anything, and none of it becomes identity. */
    const invented = await addCopy(ctx.app, "north", { canonicalCardId: "ccinvented",
      cardName: "Charizard", expansion: "Base", collectorNumber: "4", finish: "holofoil" });
    eq(invented.json().error.refused, "card-unavailable", "a description is not a card");
    const counts = (await ctx.pg.query(`select
        (select count(*) from metyet_catalog.canonical_cards)::int as k,
        (select count(*) from metyet_catalog.card_contexts)::int as c`)).rows[0];
    eq(`${counts.k},${counts.c}`, "3,1", "the catalog is exactly as the fixture left it");
  });

  test("display fields sent alongside cannot override which card it is", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const res = await addCopy(ctx.app, "north", { canonicalCardId: cards.firstEdition,
      cardName: "Blastoise", finish: "reverse_holofoil", printRun: "unlimited" });
    eq(res.statusCode, 200, res.body);
    const stored = (await ctx.repository.loadWorld()).inventory[0];
    eq(stored.canonicalCardId, cards.firstEdition, "the id decided, and only the id");
    /* And what a screen shows comes from the catalog, never from the copy. */
    const described = await ctx.catalog.describeCanonicalCards([stored.canonicalCardId]);
    eq(described[0].cardName, "Charizard", "the catalog's name");
    eq(described[0].printRun, "first_edition", "and the catalog's print run");
  });

  test("the printings of one card stay distinct choices", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    for (const id of [cards.firstEdition, cards.shadowless, cards.unlimited]) {
      eq((await addCopy(ctx.app, "north", { canonicalCardId: id })).statusCode, 200, "each is addable");
    }
    const held = (await ctx.repository.loadWorld()).inventory.map((i) => i.canonicalCardId);
    eq(new Set(held).size, 3, "three copies of three different cards, not one card three times");
  });

  test("the same card in another release is another card", async () => {
    const ctx = await world();
    await charizard(ctx);
    const base2 = await ctx.catalog.putExpansion({ game: "pokemon", code: "base4", name: "Base Set 2" });
    const context2 = await ctx.catalog.putCardContext({ game: "pokemon",
      expansionId: base2.expansionId, collectorNumber: "4", cardName: "Charizard",
      artist: "Mitsuhiro Arita" });
    const other = await ctx.catalog.putCanonicalCard(
      { cardContextId: context2.cardContextId, printRun: "unlimited", finish: "holofoil" });
    const first = (await ctx.catalog.readCardContext((await charizard(ctx)).cardContextId)).canonicalCards;
    assert(!first.some((c) => c.canonicalCardId === other.canonicalCardId),
      "the reprint is not one of the original's printings");
    eq((await addCopy(ctx.app, "north", { canonicalCardId: other.canonicalCardId })).statusCode, 200,
      "and a copy of it is its own copy");
  });

  test("a copy is of one card: naming both ways is refused", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const res = await addCopy(ctx.app, "north", { canonicalCardId: cards.unlimited, cardId: "legacy-1" });
    eq(res.statusCode, 409, res.body);
    eq(res.json().error.refused, "not-found", "two answers to one question is no answer");
  });
});

/* ============================================================== C */
describe("C. what is true about this physical card", () => {

  test("two grades of one printing are two copies of one card", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const nine = (await addCopy(ctx.app, "north", { canonicalCardId: cards.unlimited, grade: "PSA 9", cert: "111" })).json().value;
    const ten = (await addCopy(ctx.app, "north", { canonicalCardId: cards.unlimited, grade: "PSA 10", cert: "222" })).json().value;
    assert(nine !== ten, "two copies");
    const held = (await ctx.repository.loadWorld()).inventory;
    eq(new Set(held.map((i) => i.canonicalCardId)).size, 1, "of ONE canonical card");
    eq(held.find((i) => i.invId === nine).grade, "PSA 9", "each with its own grade");
    eq(held.find((i) => i.invId === ten).grade, "PSA 10");
    eq(held.find((i) => i.invId === nine).cert, "111", "and its own certificate");
    /* And grading created nothing in the catalog. */
    eq((await ctx.pg.query("select count(*)::int as n from metyet_catalog.canonical_cards")).rows[0].n, 3,
      "a grade is not a card");
  });

  test("two raw copies in different condition are also one card", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await addCopy(ctx.app, "north", { canonicalCardId: cards.unlimited, grade: "Raw", condition: "Near Mint" });
    await addCopy(ctx.app, "north", { canonicalCardId: cards.unlimited, grade: "Raw", condition: "Damaged" });
    const held = (await ctx.repository.loadWorld()).inventory;
    eq(held.length, 2, "two copies");
    eq(new Set(held.map((i) => i.canonicalCardId)).size, 1, "one card");
    eq(held.map((i) => i.condition).sort().join(), "Damaged,Near Mint", "each in its own condition");
  });

  test("a grade the product does not have a word for is refused", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    for (const bad of [{ grade: "BGS 9.5" }, { grade: "Raw", condition: "Pretty good" }]) {
      const res = await addCopy(ctx.app, "north", { canonicalCardId: cards.unlimited, ...bad });
      eq(res.statusCode, 409, JSON.stringify(bad));
    }
    eq((await ctx.repository.loadWorld()).inventory.length, 0, "and nothing was written");
  });

  test("which card a copy is cannot be edited afterwards", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = (await addCopy(ctx.app, "north", { canonicalCardId: cards.unlimited })).json().value;
    /* Exposed since C5; the identity rule below is Batch 6's and is unchanged. */
    for (const patch of [{ canonicalCardId: cards.firstEdition }, { cardId: "legacy" }, { partnerId: "p2" }]) {
      const res = await direct(ctx, ACTOR.north, "updateInventoryCopy", { invId, patch });
      eq(res.refused, "identity-immutable", JSON.stringify(patch));
    }
    eq((await ctx.repository.loadWorld()).inventory[0].canonicalCardId, cards.unlimited, "unmoved");
  });

  test("the copy facts that CAN be corrected are corrected, and identity is not", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = (await addCopy(ctx.app, "north",
      { canonicalCardId: cards.unlimited, grade: "Raw", condition: "Near Mint" })).json().value;
    /* It came back from a grader: the same physical card, a new fact about it. */
    const res = await direct(ctx, ACTOR.north, "updateInventoryCopy",
      { invId, patch: { grade: "PSA 9", condition: null, cert: "88881111", ask: 4200 } });
    eq(res.ok, true, JSON.stringify(res.refused));
    const stored = (await ctx.repository.loadWorld()).inventory[0];
    eq(stored.grade, "PSA 9", "the grade moved");
    eq(stored.cert, "88881111", "and the certificate is the copy's");
    eq(stored.canonicalCardId, cards.unlimited, "and it is still a copy of the same card");
  });

  test("stock artwork is the catalog's and copy photographs are the copy's", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = (await addCopy(ctx.app, "north", { canonicalCardId: cards.unlimited })).json().value;
    const stored = (await ctx.repository.loadWorld()).inventory[0];
    eq(`${stored.photos.front},${stored.photos.back}`, "null,null",
      "a new copy has no photographs of itself");
    assert(!("imageSmall" in stored) && !("imageLarge" in stored),
      "and the card's stock picture is not copied onto it");
    eq((await direct(ctx, ACTOR.north, "addCopyPhotos",
      { invId, front: "inv:1:front", back: null })).ok, true);
    const shot = (await ctx.repository.loadWorld()).inventory[0];
    eq(shot.photos.front, "inv:1:front", "a photograph of THIS card is the copy's");
    const described = await ctx.catalog.describeCanonicalCards([cards.unlimited]);
    assert(!JSON.stringify(described).includes("inv:1:front"), "and never reaches the catalog");
  });
});

/* ============================================================== D */
describe("D. what is stored, and what it costs to show it", () => {

  test("the reference is a real foreign key, and the world is valid without a catalogue", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await addCopy(ctx.app, "north", { canonicalCardId: cards.unlimited });
    const stored = (await ctx.pg.query(
      "select card_id, canonical_card_id from metyet.inventory_copies")).rows[0];
    eq(stored.canonical_card_id, cards.unlimited, "the column holds the canonical card");
    eq(stored.card_id, null, "and the legacy column holds nothing");

    const w = await ctx.repository.loadWorld();
    assert(validateWorld(w).ok, "a world whose copies name canonical cards is valid: "
      + JSON.stringify(validateWorld(w).errors));
    eq((w.catalog || []).length, 0, "and it carries no catalogue of its own");
  });

  test("a copy of a card nobody has cannot be written, whatever route is taken", async () => {
    const ctx = await world();
    await charizard(ctx);
    let failed = false;
    try {
      await ctx.repository.saveWorld({ ...(await ctx.repository.loadWorld()),
        inventory: [{ invId: "forged", partnerId: "p1", canonicalCardId: "ccnothing" }] });
    } catch (error) { failed = true; }
    assert(failed, "the foreign key is the backstop under the server's own check");
  });

  test("a copy must name a card, and only one", async () => {
    const ctx = await world();
    const base = await ctx.repository.loadWorld();
    const neither = validateWorld({ ...base,
      inventory: [{ invId: "x", partnerId: "p1" }] });
    assert(!neither.ok && neither.errors.some((e) => /names no card/.test(e.message)),
      "a copy of nothing is not a copy");
    const both = validateWorld({ ...base,
      inventory: [{ invId: "x", partnerId: "p1", cardId: "k1", canonicalCardId: "cc1" }] });
    assert(!both.ok && both.errors.some((e) => e.code === "ref.ambiguous"),
      "and a copy of two cards is not a copy either");
  });

  test("showing a shelf is one request, not one per row, and never the catalogue", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    for (const id of [cards.firstEdition, cards.shadowless, cards.unlimited]) {
      await addCopy(ctx.app, "north", { canonicalCardId: id });
    }
    /* Twelve more cards nobody owns: they must not travel. */
    const { cardContextId } = await ctx.catalog.putCardContext({ game: "pokemon",
      expansionId: cards.expansionId, collectorNumber: "9", cardName: "Bulbasaur" });
    for (let i = 0; i < 12; i += 1) {
      await ctx.catalog.putCanonicalCard({ cardContextId, printRun: "unlimited",
        finish: "non_holo", language: ["en", "ja", "fr", "de"][i % 4], stamp: ["none", "prerelease", "staff"][i % 3] });
    }

    const held = (await get(ctx.app, "north", "/api/view")).json().state.inventory
      .map((i) => i.canonicalCardId);
    eq(held.length, 3, "three copies");
    const described = (await get(ctx.app, "north",
      `/api/canonical-cards?ids=${held.join(",")}`)).json();
    eq(described.cards.length, 3, "described in ONE request");
    eq(new Set(described.cards.map((c) => c.cardName)).size, 1, "all of them Charizard");
    for (const card of described.cards) {
      assert(card.expansionName && card.collectorNumber && card.finish && card.printRun,
        "with what a person needs to recognise it");
    }
    assert(!JSON.stringify(described).includes("Bulbasaur"), "and nothing nobody owns came with it");
  });

  test("the projection does not grow when the catalogue does", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await addCopy(ctx.app, "north", { canonicalCardId: cards.unlimited });
    const before = (await get(ctx.app, "north", "/api/view")).body;
    const { cardContextId } = await ctx.catalog.putCardContext({ game: "pokemon",
      expansionId: cards.expansionId, collectorNumber: "58", cardName: "Pikachu" });
    for (let i = 0; i < 20; i += 1) {
      await ctx.catalog.putCanonicalCard({ cardContextId, printRun: "unlimited",
        finish: "non_holo", language: ["en", "ja", "fr", "de", "it"][i % 5],
        stamp: ["none", "prerelease", "staff", "league"][i % 4] });
    }
    eq((await get(ctx.app, "north", "/api/view")).body, before,
      "a partner's view of their own shelf is the same bytes");
  });

  test("the card routes are reads, and the write is a command", () => {
    const app = code("server/app.js");
    const cardRoutes = (app.match(/app\.(get|post)\(\s*"\/api\/(card-contexts|canonical-cards)[^"]*"/g) || []);
    eq(cardRoutes.length, 3, "three card routes");
    assert(cardRoutes.every((r) => /app\.get/.test(r)), "and every one of them is a read");
    assert(!/app\.(post|put|patch|delete)\(\s*"\/api\/inventory/.test(app),
      "inventory did not grow a route of its own: it is a command");
  });
});

/* ============================================================== E */
describe("E. what a Collector may see of somebody else's shelf", () => {

  test("a partner sees their own copy whole; a Collector sees what is for sale", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await addCopy(ctx.app, "north", { canonicalCardId: cards.unlimited, grade: "PSA 9",
      condition: null, ask: 4200, cost: 3100, acquired: "2030-01-02", cert: "77771111",
      note: "back room, top shelf" });

    const mine = (await get(ctx.app, "north", "/api/view")).json().state.inventory[0];
    eq(mine.cost, 3100, "a partner sees what they paid");
    eq(mine.note, "back room, top shelf", "and what they wrote to themselves");

    const theirs = (await get(ctx.app, "casey", "/api/view")).json().state.inventory[0];
    assert(theirs, "a Collector in their network sees the copy");
    eq(theirs.canonicalCardId, cards.unlimited, "and which card it is");
    eq(theirs.grade, "PSA 9", "and what grade it carries — that is what is on offer");
    eq(theirs.ask, 4200, "and what is being asked");
    for (const secret of ["cost", "acquired", "note"]) {
      assert(!(secret in theirs), `a Collector received the partner's ${secret}`);
    }
  });

  test("the fields are absent from the wire, not blanked in the browser", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await addCopy(ctx.app, "north", { canonicalCardId: cards.unlimited, cost: 3100, note: "private" });
    const body = (await get(ctx.app, "casey", "/api/view")).body;
    assert(!body.includes("3100"), "the number never left the server");
    assert(!body.includes("private"), "nor the note");
  });

  test("describing a card reintroduces nothing private", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await addCopy(ctx.app, "north", { canonicalCardId: cards.unlimited, cost: 3100, note: "private" });
    const described = (await get(ctx.app, "casey",
      `/api/canonical-cards?ids=${cards.unlimited}`)).body;
    for (const secret of ["3100", "private", "cost", "acquired"]) {
      assert(!described.includes(secret), `the catalogue carried "${secret}"`);
    }
  });

  test("a Collector outside the network sees no shelf at all", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await addCopy(ctx.app, "second", { canonicalCardId: cards.unlimited, ask: 10 });
    const theirs = (await get(ctx.app, "casey", "/api/view")).json().state.inventory;
    eq(theirs.length, 0, "Second is nobody Casey knows");
  });
});

/* ============================================================== F */
describe("F. everything that already worked", () => {

  test("the legacy path still works, for the world that still uses it", async () => {
    const ctx = await world();
    /* A world with its own catalogue — the demo's shape — still resolves a copy
       against it exactly as it always did. */
    const w = await ctx.repository.loadWorld();
    const demo = { ...w,
      catalog: [{ id: "k1", name: "Charizard", set: "Base Set", num: "4/102", print: "Holo",
        edition: "Unlimited", language: "English", grade: "PSA 9", condition: null }],
      inventory: [{ invId: "inv1", partnerId: "p1", cardId: "k1", ask: 100, archived: false }] };
    assert(validateWorld(demo).ok, "a world with a catalogue and a legacy copy is valid: "
      + JSON.stringify(validateWorld(demo).errors));
    const view = projectForActor(demo, { seat: "tp", partnerId: "p1" });
    eq(view.inventory[0].cardId, "k1", "and it projects as it always did");
  });

  test("this batch moved inventory and nothing else", () => {
    /* RESTATED IN BATCH 7, which is when Goals moved — by their own migration,
       which is the whole point of the boundary. What Batch 6 has to keep true
       is that ITS migration touched one table, and it still does. */
    const migration = read("persistence/migrations/0007_inventory_canonical_card.sql")
      .replace(/^--.*$/gm, "");
    assert(!/metyet\.goals|binder_copies|opportunities|conversations/.test(migration),
      "the Batch 6 migration touched a table that is not inventory");
    assert(/inventory_copies/.test(migration), "and it is the one it says it is");
    /* RESTATED IN C2, WHICH IS THE BATCH THAT MOVED COLLECTOR COPIES — by their
       own migration (0011), which is again the whole point of the boundary.
       `addCollectorCopy` names a canonical card now and this list no longer
       forbids it. Opportunities' trade rows and conversations are still waiting
       for the batch that rewrites the command that writes each of them, and
       they are what the list holds now, so the rule still bites. */
    const commands = code("domain/metyet-commands.js");
    for (const [name, next] of [["sendMessage", "canonicalCardId"], ["recordNote", "canonicalCardId"]]) {
      const at = commands.indexOf(`${name}(state`);
      assert(at >= 0, `${name} is not in the command table`);
      const body = commands.slice(at, at + 900);
      assert(!new RegExp(next).test(body), `${name} moved ahead of its batch`);
    }
  });

  test("no provider was integrated and no catalogue was imported", () => {
    for (const rel of ["domain/metyet-commands.js", "server/app.js", "client/api.js",
      "client/production-store.js", "client/tp/sections/Inventory.jsx",
      "persistence/migrations/0007_inventory_canonical_card.sql"]) {
      const text = read(rel);
      assert(!/scrydex|tcgdex|pokemontcg|pokemon_cards\.json/i.test(text), `${rel} names a provider`);
    }
    const migration = read("persistence/migrations/0007_inventory_canonical_card.sql");
    assert(!/insert into metyet_catalog/i.test(migration), "the migration invented card rows");
  });

  test("the browser still cannot mint identity or name its own owner", () => {
    const client = ["client/api.js", "client/production-store.js", "client/commands.js",
      "client/tp/sections/Inventory.jsx"].map(code).join("\n");
    assert(!/putCanonicalCard|putCardContext|putExpansion|metyet_catalog/.test(client),
      "the client reached the catalog's writes");
    assert(!/partnerId:/.test(code("client/commands.js")),
      "a client binding names an owner");
  });

  test("no dependency was added", () => {
    const pkg = JSON.parse(read("package.json"));
    eq(Object.keys(pkg.dependencies).sort().join(),
      "esbuild,fastify,jose,pg,react,react-dom,react-test-renderer",
      "the runtime dependencies are the server's, and nothing more");
  });
});

run();
