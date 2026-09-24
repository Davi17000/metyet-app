/* ============================================================================
   PHASE 5 C5 — THE SHOP CAN FIX ITS OWN SHELF

   Batch 6 wrote `updateInventoryCopy` and `removeInventoryCopy`, tested both,
   and shipped neither. So a Trusted Partner's inventory was write-once, and the
   consequence was not cosmetic: a copy leaves live supply only by being
   archived or by its derived status ceasing to be `available`, that status
   comes entirely from opportunities, and the whole deal lifecycle is
   deliberately shut. A card sold over the counter therefore stayed available
   for ever and went on telling a Collector that a shop they trust has it. The
   only lever that stopped the wrong answer was the Collector giving up their
   own Goal.

   That is what this batch fixes, and what these tests are about. The rules are
   Batch 6's and are not restated here — what is proved here is that the
   production path reaches them, that the derived answer moves when the shelf
   does, and that nothing else moved with it.

   A. the door            two commands joined the allow-list, and only two
   B. authorization       over HTTP, seat by seat, for both commands
   C. correcting a copy   same copy, corrected facts, untouched everything else
   D. taking one off      archive, not delete — and what a Collector stops seeing
   E. more than one       counts that go down before they go away
   F. the client boundary what the browser may send, and what it may not decide
   G. what was said       consent language, the holder count, the goal sentence
   H. nothing else moved  the architecture C5 was not allowed to touch
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
const React = require("react");
const TR = require("react-test-renderer");
const esbuild = require("esbuild");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
const { COMMAND_NAMES } = require("../domain/metyet-commands.js");
const RT = require("../domain/metyet-runtime.js");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
/* Source with its comments taken out. Every claim this suite makes about what a
   FILE says is about code or about copy a person reads — never about a comment
   explaining why something was removed, which is exactly the kind of sentence
   C5 added and which a naive grep would read as the thing it describes. */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const json = (v) => JSON.stringify(v);

/* A real production component, compiled the way every other suite compiles one.
   There is no persistent bundle of the production client in dist/ — the app
   build (`npm run build:app`) is not part of `verify` — so a rendered assertion
   is the only kind that can speak for what a person sees. */
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
const texts = (n) => {
  const out = [];
  const walk = (node) => {
    if (!node || node.type === "style") return;
    for (const c of node.children || []) {
      if (typeof c === "string" || typeof c === "number") out.push(String(c)); else walk(c);
    }
  };
  walk(n);
  return out;
};

/* ------------------------------------------------------------- A WORLD */

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

const SUBJECT = { north: "sub-north", second: "sub-second",
  casey: "sub-casey", dana: "sub-dana" };

/* Two shops, two Collectors. Casey knows Northline; Dana knows nobody, which is
   what makes her useful — she is a second Collector for the ownership checks
   that had none. */
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
    invitations: [], goals: [], inventory: [], collectorCopies: [], binders: [],
    binderEntries: [], interests: [], opportunities: [], conversations: [],
    photoRequests: [], copyReviews: [],
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
  const app = createApp({ repository, catalog, accounts, verifier, runtime });
  return { pg, db, runtime, repository, catalog, app };
}

/* One checklist line, two printings — enough for "the same card" and "a
   different card" to both be sayable. */
async function charizard(ctx) {
  const { expansionId } = await ctx.catalog.putExpansion(
    { game: "pokemon", code: "base1", name: "Base", printedTotal: 102 });
  const { cardContextId } = await ctx.catalog.putCardContext({ game: "pokemon", expansionId,
    collectorNumber: "4", cardName: "Charizard", artist: "Mitsuhiro Arita", rarity: "Rare Holo" });
  const made = {};
  for (const [name, dimensions] of Object.entries({
    firstEdition: { printRun: "first_edition", finish: "holofoil" },
    unlimited: { printRun: "unlimited", finish: "holofoil" },
  })) {
    made[name] = (await ctx.catalog.putCanonicalCard({ cardContextId, ...dimensions })).canonicalCardId;
  }
  return { expansionId, cardContextId, ...made };
}

const post = (app, token, command, payload) => app.inject({ method: "POST", url: "/api/commands",
  headers: { authorization: `Bearer ${token}` }, payload: { command, payload } });
const view = async (app, token) => (await app.inject({ method: "GET", url: "/api/view",
  headers: { authorization: `Bearer ${token}` } })).json().state;

const addCopy = (app, token, copy) => post(app, token, "addInventoryCopy", { copy });
const correct = (app, token, invId, patch) => post(app, token, "updateInventoryCopy", { invId, patch });
const retire = (app, token, invId) => post(app, token, "removeInventoryCopy", { invId });
const refusal = (res) => (res.statusCode === 200 ? null : res.json().error.refused);

const stock = async (ctx, token, copy) => {
  const res = await addCopy(ctx.app, token, copy);
  eq(res.statusCode, 200, res.body);
  return res.json().value;
};
/* A Goal has to say which copy it is after (C3.2), so this says one. */
const wants = async (ctx, token, canonicalCardId, tier = "primary") => {
  const res = await post(ctx.app, token, "addGoal",
    { canonicalCardId, tier, desired: { grade: "PSA 9" } });
  eq(res.statusCode, 200, res.body);
  return res.json().value;
};
const rowOf = async (ctx, invId) =>
  (await ctx.repository.loadWorld()).inventory.find((i) => i.invId === invId) || null;

/* ============================================================== A */
describe("A. the door opened by exactly two", () => {

  test("the allow-list went from sixteen to eighteen, and gained these two", async () => {
    eq(EXPOSED_COMMANDS.length, 18, "the production surface is not the size C5 intended");
    for (const name of ["updateInventoryCopy", "removeInventoryCopy"]) {
      assert(EXPOSED_COMMANDS.includes(name), `${name} is not offered`);
    }
  });

  test("every name on the list is a real command, and no name repeats", async () => {
    const names = new Set(COMMAND_NAMES);
    for (const name of EXPOSED_COMMANDS) assert(names.has(name), `${name} is not a command`);
    eq(new Set(EXPOSED_COMMANDS).size, EXPOSED_COMMANDS.length, "a name is on the list twice");
  });

  test("no dormant command came through the same door", async () => {
    const ctx = await world();
    /* The deal lifecycle, the legacy catalogue writer, and the two inventory
       commands C5 did NOT ship. Each is a real command and each is refused
       identically to one that does not exist. */
    for (const name of ["startOpportunity", "proposePrice", "acceptPrice", "acceptDeal",
      "confirmHandoff", "cancelOpportunity", "sendMessage", "reachOut", "setInterest",
      "resolveCardIdentity", "addCopyPhotos", "reviewCopy", "inviteCollector"]) {
      assert(COMMAND_NAMES.has ? COMMAND_NAMES.has(name) : [...COMMAND_NAMES].includes(name),
        `${name} is not a command, so this test is asserting nothing`);
      assert(!EXPOSED_COMMANDS.includes(name), `${name} is exposed`);
      const res = await post(ctx.app, "north", name, {});
      eq(res.statusCode, 409, `${name} over HTTP`);
      eq(res.json().error.refused, "command-unavailable", name);
    }
  });

  test("measured against the baseline itself, C5 opened exactly these two", async () => {
    /* AGAINST GIT, NOT AGAINST A LITERAL. The first draft of this test wrote
       `const before = 16` three lines under an assertion that the list is 18,
       and claimed in its comment to be reading the baseline — it was restating
       the test above it, and anybody exposing a nineteenth command would have
       edited both the same way. This reads the file as dc2fd25 actually had it. */
    const { execFileSync } = require("child_process");
    const file = execFileSync("git", ["show", "dc2fd25:server/exposed-commands.js"],
      { cwd: ROOT, encoding: "utf8" });
    const after = file.split("EXPOSED_COMMANDS")[1] || "";
    const before = (after.slice(0, after.indexOf("]);")).match(/"[a-zA-Z]+"/g) || [])
      .map((x) => x.slice(1, -1));
    eq(before.length, 16, "the baseline was not sixteen");
    const added = EXPOSED_COMMANDS.filter((n) => !before.includes(n));
    const lost = before.filter((n) => !EXPOSED_COMMANDS.includes(n));
    eq(json(added.sort()), json(["removeInventoryCopy", "updateInventoryCopy"]),
      "C5 opened a door it did not declare");
    eq(json(lost), json([]), "C5 closed a door somebody else opened");
  });
});

/* ============================================================== B */
describe("B. whose shelf it is, asked where a browser asks", () => {

  test("the owning shop corrects and retires its own copy", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, grade: "PSA 9", ask: 4200 });
    eq((await correct(ctx.app, "north", invId, { ask: 3900 })).statusCode, 200, "correcting");
    eq((await retire(ctx.app, "north", invId)).statusCode, 200, "retiring");
  });

  test("another Trusted Partner cannot correct or retire it", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200 });
    eq(refusal(await correct(ctx.app, "second", invId, { ask: 1 })), "not-owner", "correcting");
    eq(refusal(await retire(ctx.app, "second", invId)), "not-owner", "retiring");
    const row = await rowOf(ctx, invId);
    eq(row.ask, 4200, "the ask was not touched");
    eq(row.archived, false, "and the copy is still on the shelf");
  });

  test("a Collector cannot correct or retire a shop's copy", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200 });
    for (const who of ["casey", "dana"]) {
      eq(refusal(await correct(ctx.app, who, invId, { ask: 1 })), "not-owner", `${who} correcting`);
      eq(refusal(await retire(ctx.app, who, invId)), "not-owner", `${who} retiring`);
    }
    eq((await rowOf(ctx, invId)).ask, 4200, "the ask was not touched");
  });

  test("a copy id nobody minted is refused, and says nothing about the shelf", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200, cert: "88881111" });
    for (const invId of ["inv-does-not-exist", "", null, 42, { invId: "x" }]) {
      eq(refusal(await correct(ctx.app, "north", invId, { ask: 1 })), "not-found", `correct ${json(invId)}`);
      eq(refusal(await retire(ctx.app, "north", invId)), "not-found", `retire ${json(invId)}`);
    }
    /* AND THE REFUSAL DOES NOT DESCRIBE WHAT IS THERE. A partner guessing ids
       learns the same thing for a copy that is not theirs and one that does not
       exist — nothing. */
    const res = await correct(ctx.app, "north", "inv-does-not-exist", { ask: 1 });
    assert(!res.body.includes("88881111"), "a refusal carried a certificate");
    assert(!res.body.includes("4200"), "a refusal carried an ask");
  });

  test("a patch cannot move a copy to a different card, or to a different shop", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited });
    for (const patch of [{ canonicalCardId: cards.firstEdition }, { cardId: "legacy-1" },
      { partnerId: "p2" }, { invId: "inv-somewhere-else" }]) {
      eq(refusal(await correct(ctx.app, "north", invId, patch)), "identity-immutable", json(patch));
    }
    const row = await rowOf(ctx, invId);
    eq(row.canonicalCardId, cards.unlimited, "still the same card");
    eq(row.partnerId, "p1", "still the same shop");
    eq(row.invId, invId, "still the same copy");
  });

  test("the grading rule is the domain's on this path too", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = await stock(ctx, "north",
      { canonicalCardId: cards.unlimited, grade: "Raw", condition: "Near Mint" });
    /* CHECKED AGAINST THE MERGED RECORD, which is the whole reason C3.2 exists:
       the patch says only `grade`, and the copy's stored condition is what makes
       the result incoherent. */
    eq(refusal(await correct(ctx.app, "north", invId, { grade: "PSA 9" })), "grading-incoherent",
      "a graded copy cannot keep a raw condition");
    eq((await rowOf(ctx, invId)).grade, "Raw", "and nothing was written");
    /* Said properly, it is accepted — the same physical card, back from a
       grader. */
    eq((await correct(ctx.app, "north", invId,
      { grade: "PSA 9", condition: null })).statusCode, 200, "grade and condition together");
  });

  test("an amount that is not one is refused", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200 });
    /* Values that SURVIVE JSON. `Infinity` and `NaN` do not — they serialise to
       `null`, which is the honest "nobody said", so sending them would be
       asserting something about JSON rather than about the domain. */
    for (const ask of [-1, "nine hundred", "-5", { amount: 1 }]) {
      eq(refusal(await correct(ctx.app, "north", invId, { ask })), "invalid-amount", json(ask));
    }
    /* WHAT IS NOT ASSERTED, AND WHY. The domain reads an amount through
       `Number(...)`, so `true` arrives as 1 and `[]` as 0 and both are accepted.
       That is Batch 6's coercion and `addInventoryCopy` has always had it —
       C5 exposed a second door onto the same rule and did not widen it, so
       pinning a stricter behaviour here would be pinning a rule that does not
       exist. It is written down as debt in the C5 report instead. */
    eq((await rowOf(ctx, invId)).ask, 4200, "the ask survived every bad one");
  });

  test("a retired copy stays retired, and retiring it again changes nothing", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited });
    eq((await retire(ctx.app, "north", invId)).statusCode, 200);
    const once = await rowOf(ctx, invId);
    eq((await retire(ctx.app, "north", invId)).statusCode, 200, "and it is not an error to say it twice");
    eq(json(await rowOf(ctx, invId)), json(once), "the row is byte-identical");
  });
});

/* ============================================================== C */
describe("C. correcting a copy", () => {

  test("the same copy, with the facts a shop actually got wrong", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited,
      grade: "PSA 9", cert: "11112222", ask: 4200, cost: 3100 });
    const res = await correct(ctx.app, "north", invId,
      { grade: "PSA 10", cert: "88881111", ask: 9500, cost: 3100 });
    eq(res.statusCode, 200, res.body);
    const row = await rowOf(ctx, invId);
    eq(row.invId, invId, "the copy is the same copy");
    eq(row.grade, "PSA 10", "the grade moved");
    eq(row.cert, "88881111", "so did the certificate");
    eq(row.ask, 9500, "and the ask");
    eq(row.canonicalCardId, cards.unlimited, "and it is still a copy of the same card");
  });

  test("the answer carries the corrected copy, so the screen needs no second read", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200 });
    const res = await correct(ctx.app, "north", invId, { ask: 3900 });
    const shown = res.json().state.inventory.find((i) => i.invId === invId);
    assert(shown, "the copy is in the reply");
    eq(shown.ask, 3900, "with the new ask");
  });

  test("a patch touches what it names and nothing else", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited,
      grade: "PSA 9", cert: "11112222", ask: 4200, cost: 3100,
      acquired: "2029-06-01", note: "back room, top shelf" });
    const before = await rowOf(ctx, invId);
    eq((await correct(ctx.app, "north", invId, { ask: 3900 })).statusCode, 200);
    const after = await rowOf(ctx, invId);
    eq(after.ask, 3900, "the named field changed");
    /* THE ONES THE SCREEN DOES NOT OFFER SURVIVE A CORRECTION. `note`,
       `acquired` and `photos` have no control in C5, deliberately — and a patch
       carries only the keys it names, so leaving them out leaves them alone
       rather than blanking them. */
    for (const key of ["note", "acquired", "cost", "cert", "grade", "photos",
      "canonicalCardId", "partnerId", "addedAt"]) {
      eq(json(after[key]), json(before[key]), `${key} was disturbed by an unrelated correction`);
    }
  });

  test("a correction is visible to a related Collector, and carries nothing private with it", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited,
      grade: "PSA 9", ask: 4200, cost: 3100, acquired: "2029-06-01", note: "paid too much" });
    await correct(ctx.app, "north", invId, { ask: 3900 });
    const theirs = (await view(ctx.app, "casey")).inventory.find((i) => i.invId === invId);
    assert(theirs, "a related Collector sees the copy");
    eq(theirs.ask, 3900, "at the corrected price");
    for (const secret of ["cost", "acquired", "note"]) {
      assert(!(secret in theirs), `a Collector received the partner's ${secret}`);
    }
    const body = JSON.stringify(await view(ctx.app, "casey"));
    assert(!body.includes("3100"), "what it cost never left the server");
    assert(!body.includes("paid too much"), "nor the note");
  });

  test("an unrelated Collector sees neither the copy nor the correction", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200 });
    await correct(ctx.app, "north", invId, { ask: 3900 });
    const dana = await view(ctx.app, "dana");
    eq(dana.inventory.length, 0, "Dana knows nobody, so Dana has no supply");
    assert(!JSON.stringify(dana).includes(invId), "and not the copy's id either");
  });
});

/* ============================================================== D */
describe("D. taking a copy off the shelf", () => {

  test("removing archives the row; it does not delete it", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200, cert: "88881111" });
    eq((await retire(ctx.app, "north", invId)).statusCode, 200);
    const row = await rowOf(ctx, invId);
    assert(row, "the row is still there");
    eq(row.archived, true, "marked archived");
    eq(row.cert, "88881111", "with everything it always said about itself");
    eq((await ctx.repository.loadWorld()).inventory.length, 1, "nothing was deleted");
  });

  test("an archived copy leaves the shop's own live supply", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited });
    const before = (await view(ctx.app, "north")).inventory.filter((i) => !i.archived);
    eq(before.length, 1, "one live copy");
    await retire(ctx.app, "north", invId);
    const after = (await view(ctx.app, "north")).inventory;
    eq(after.filter((i) => !i.archived).length, 0, "none live");
    eq(after.length, 1, "and the record is still projected to its owner");
  });

  test("S5b — a Collector stops being told a shop has the card", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await wants(ctx, "casey", cards.unlimited);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200 });

    const before = (await view(ctx.app, "casey")).discoveries;
    eq(before.length, 1, "the overlap exists before the shop sells it");
    eq(before[0].partnerId, "p1", "and it names the shop");
    eq(before[0].copies, 1, "one copy");

    eq((await retire(ctx.app, "north", invId)).statusCode, 200, "the shop takes it off the shelf");

    eq((await view(ctx.app, "casey")).discoveries.length, 0,
      "the Collector is no longer told this shop has it");
    /* AND FROM THE OTHER SIDE. The partner's own "Ready to coordinate" reads
       the same derived list. */
    eq((await view(ctx.app, "north")).discoveries.length, 0,
      "and the shop is no longer shown the overlap either");
  });

  test("the Goal is untouched — what ended is the supply, not the want", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const goalId = await wants(ctx, "casey", cards.unlimited);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited });
    await retire(ctx.app, "north", invId);
    const mine = (await view(ctx.app, "casey")).goals;
    eq(mine.length, 1, "the Goal is still there");
    eq(mine[0].id, goalId, "the same Goal");
    eq(mine[0].tier, "primary", "at the same tier");
    eq(json(mine[0].desired), json({ grade: "PSA 9" }), "with the same criteria");
  });

  test("the shop's other copies are unaffected", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const gone = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200 });
    const kept = await stock(ctx, "north", { canonicalCardId: cards.firstEdition, ask: 9000 });
    await retire(ctx.app, "north", gone);
    eq((await rowOf(ctx, kept)).archived, false, "the other copy is still live");
    eq((await rowOf(ctx, kept)).ask, 9000, "and unchanged");
  });

  test("a correction after a removal still works, because the row is still there", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200 });
    await retire(ctx.app, "north", invId);
    /* Not a feature, an observation: archiving is a fact about the copy, not a
       lock on it, and the domain says so. It is recorded here so that a later
       batch changing it does so on purpose. */
    eq((await correct(ctx.app, "north", invId, { ask: 10 })).statusCode, 200);
    eq((await rowOf(ctx, invId)).archived, true, "and it is still archived");
    eq((await view(ctx.app, "casey")).discoveries.length, 0, "and still not supply");
  });
});

/* ============================================================== E */
describe("E. more than one copy", () => {

  test("two copies are two rows and one overlap of two", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await wants(ctx, "casey", cards.unlimited);
    await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200 });
    await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4400 });
    const found = (await view(ctx.app, "casey")).discoveries;
    eq(found.length, 1, "one shop, one card, one answer");
    eq(found[0].copies, 2, "and it counts both");
  });

  test("removing one of two keeps the overlap and drops the count", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await wants(ctx, "casey", cards.unlimited);
    const first = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200 });
    await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4400 });
    eq((await view(ctx.app, "casey")).discoveries[0].copies, 2, "two before");
    await retire(ctx.app, "north", first);
    const found = (await view(ctx.app, "casey")).discoveries;
    eq(found.length, 1, "the shop still has one, so the answer stands");
    eq(found[0].copies, 1, "one after");
  });

  test("removing the last one removes the answer", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await wants(ctx, "casey", cards.unlimited);
    const first = await stock(ctx, "north", { canonicalCardId: cards.unlimited });
    const second = await stock(ctx, "north", { canonicalCardId: cards.unlimited });
    await retire(ctx.app, "north", first);
    eq((await view(ctx.app, "casey")).discoveries.length, 1, "still one after the first");
    await retire(ctx.app, "north", second);
    eq((await view(ctx.app, "casey")).discoveries.length, 0, "and none after the last");
  });

  test("a correction does not change the count", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await wants(ctx, "casey", cards.unlimited);
    const first = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200 });
    await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4400 });
    await correct(ctx.app, "north", first, { ask: 100, grade: "PSA 10" });
    const found = (await view(ctx.app, "casey")).discoveries;
    eq(found.length, 1, "still one overlap");
    eq(found[0].copies, 2, "still two copies — correcting a copy is not removing it");
  });

  test("criteria still do not filter the answer, and C5 did not change that", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    /* The Goal asks for a PSA 9; the shop's copy is heavily played and raw. It
       is the same card, so the overlap stands and a person decides. Pinned here
       because a batch about correcting grades is exactly the batch where
       somebody might be tempted to make the grade matter. */
    await wants(ctx, "casey", cards.unlimited);
    const invId = await stock(ctx, "north",
      { canonicalCardId: cards.unlimited, grade: "Raw", condition: "Heavily Played" });
    eq((await view(ctx.app, "casey")).discoveries.length, 1, "the overlap is about the card");
    await correct(ctx.app, "north", invId, { grade: "Raw", condition: "Damaged" });
    eq((await view(ctx.app, "casey")).discoveries.length, 1, "and correcting the grade does not end it");
  });
});

/* ============================================================== F */
describe("F. the client boundary", () => {

  test("the browser names both commands in exactly one file", async () => {
    const commands = code("client/commands.js");
    for (const name of ["updateInventoryCopy", "removeInventoryCopy"]) {
      assert(commands.includes(`"${name}"`), `${name} is not bound`);
    }
    /* THE RULE THIS FILE HAS ALWAYS HAD. A screen receives a callback; only
       client/commands.js knows what the command is called. */
    for (const rel of ["client/tp/sections/Inventory.jsx", "client/tp/TrustedPartnerShell.jsx",
      "client/production-app.jsx"]) {
      for (const name of ["updateInventoryCopy", "removeInventoryCopy"]) {
        assert(!code(rel).includes(name), `${rel} spells a command name`);
      }
    }
  });

  test("the Inventory screen holds no store, no session and no fetch", async () => {
    const screen = code("client/tp/sections/Inventory.jsx");
    for (const name of ["production-store", "supabase", "fetch(", "/api/"]) {
      assert(!screen.includes(name), `the screen reaches ${name}`);
    }
  });

  test("the screen does not decide who owns a copy", async () => {
    const screen = code("client/tp/sections/Inventory.jsx");
    assert(!/partnerId/.test(screen), "the screen reads an owner");
    assert(!/seat/.test(screen), "the screen reads a seat");
  });

  test("the payload the screen builds carries no identity", async () => {
    const screen = code("client/tp/sections/Inventory.jsx");
    /* The correction payload is built in one place. It may not name the card,
       the copy's owner, or the copy itself as something to change. */
    const payload = screen.slice(screen.indexOf("const payload = () =>"));
    const body = payload.slice(0, payload.indexOf("};"));
    for (const name of ["canonicalCardId", "cardId", "partnerId", "invId", "archived"]) {
      assert(!body.includes(name), `the correction payload carries ${name}`);
    }
  });

  test("the grading courtesy is written once, not once per form", async () => {
    const screen = code("client/tp/sections/Inventory.jsx");
    /* C3.3 found three implementations of this rule and every one of them read
       a copy saying both "PSA 9" and "Damaged" as a clean PSA 9. Adding a
       correction form was the obvious place for a fourth. */
    const occurrences = (screen.match(/=== "Raw" \? f\.condition : ""/g) || []).length;
    eq(occurrences, 1, "the drop-the-condition rule is implemented more than once");
    eq((screen.match(/rawNeedsCondition =/g) || []).length, 1,
      "the raw-needs-a-condition courtesy is implemented more than once");
  });

  test("both controls render only when the screen was handed the callback", async () => {
    const screen = code("client/tp/sections/Inventory.jsx");
    assert(/\{onEditCopy \? \(/.test(screen), "the Edit control is not gated on its callback");
    assert(/\{onRetireCopy \? \(/.test(screen), "the Remove control is not gated on its callback");
    /* AND NEITHER IS RENDERED DISABLED INSTEAD. A control that cannot do what
       it says is worse than one that is not there. */
    assert(!/disabled=\{!onEditCopy/.test(screen), "a dead Edit control is rendered disabled");
    assert(!/disabled=\{!onRetireCopy/.test(screen), "a dead Remove control is rendered disabled");
  });
});

/* ====================================== the screen, actually rendered */
describe("F2. the controls, pressed", () => {

  /* WHY THIS SECTION EXISTS. The first version of this batch covered the Edit
     form and the removal confirmation with four regexes over source, and an
     adversarial review found two real defects underneath them: a no-change Save
     destroyed a stored `condition` on a copy with no grade, and a numeric
     certificate came back as an empty box and was written away. Neither could
     be seen by grepping — both are what the form BUILDS, which only exists when
     it is rendered and pressed. The mutation that proves the point: wiring
     "Remove from inventory" straight to the command, with no confirmation, left
     every source assertion passing. */

  const INVENTORY = build("client/tp/sections/Inventory.jsx").default;

  const shelf = async (ctx, sent, state) => {
    /* THE SHAPE THE STORE ANSWERS IN. `describeCards` returns `{ cards }`
       (client/production-store.js:296-299); the repository returns a bare
       array. Handing the screen the array made every row read "Loading this
       card…" for ever, which is how the first draft of this test concluded the
       confirmation did not name the card. */
    const door = { describe: async (ids) => ({ cards: await ctx.catalog.describeCanonicalCards(ids) }),
      find: async () => ({ contexts: [] }), read: async () => ({ canonicalCards: [] }),
      expansions: async () => ({ expansions: [] }), artists: async () => ({ artists: [] }) };
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(INVENTORY, {
        state,
        onBrowseCards: door,
        onAddCopy: async () => ({ ok: true }),
        onEditCopy: async (invId, patch) => { sent.push({ kind: "edit", invId, patch }); return { ok: true }; },
        onRetireCopy: async (invId) => { sent.push({ kind: "retire", invId }); return { ok: true }; },
      }));
    });
    /* THE NAME ARRIVES IN A SECOND TICK. The screen holds ids and asks the
       catalogue what they are called; until that resolves every row reads
       "Loading this card…". Settling twice is what a browser does in a few
       milliseconds, and a test that did not would be asserting against a
       loading state. */
    await TR.act(async () => {});
    await TR.act(async () => {});
    return r;
  };
  const pressText = async (r, label) => {
    const b = r.root.findAll((n) => n.type === "button")
      .find((n) => texts(n).join(" ").trim() === label);
    assert(b, `no control "${label}" among: `
      + r.root.findAll((n) => n.type === "button").map((n) => texts(n).join(" ").trim()).join(" | "));
    assert(!b.props.disabled, `"${label}" is disabled`);
    await TR.act(async () => { b.props.onClick(); });
    await TR.act(async () => {});
  };

  test("pressing Save without changing anything sends back exactly what was there", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    /* THE COPY THAT BROKE THE FIRST VERSION: no grade, but a stated condition.
       The domain accepts it, the shelf renders it, and the form shows no
       condition control for it — so a payload built from form state alone
       asserted an absence it had never asked about. */
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited,
      condition: "Near Mint", ask: 4200, cost: 3100, cert: "88881111",
      acquired: "2029-06-01", note: "back room" });
    const before = await rowOf(ctx, invId);
    const sent = [];
    const r = await shelf(ctx, sent, await view(ctx.app, "north"));
    await pressText(r, "Edit");
    await pressText(r, "Save changes");
    eq(sent.length, 1, "one command");
    eq(sent[0].kind, "edit", "and it is the correction");
    eq(sent[0].invId, invId, "for this copy");

    /* Applied for real, the patch must leave the row as it found it. */
    const res = await correct(ctx.app, "north", invId, sent[0].patch);
    eq(res.statusCode, 200, res.body);
    const after = await rowOf(ctx, invId);
    /* COMPARED BY MEANING. An absent key and an explicit null both say "nobody
       stated this", and a form that clears a field has to be able to send the
       null — so a Save can turn the first into the second without changing what
       the copy claims. What must never differ is a STATED value. */
    const same = (a, b) => json(a === undefined ? null : a) === json(b === undefined ? null : b);
    for (const key of ["grade", "condition", "ask", "cost", "cert", "acquired",
      "note", "photos", "canonicalCardId", "partnerId", "invId", "archived"]) {
      assert(same(after[key], before[key]),
        `${key} was changed by a Save that changed nothing: `
        + `${json(before[key])} -> ${json(after[key])}`);
    }
  });

  test("a numeric certificate survives being looked at", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, cert: 88881111 });
    const sent = [];
    const r = await shelf(ctx, sent, await view(ctx.app, "north"));
    await pressText(r, "Edit");
    await pressText(r, "Save changes");
    await correct(ctx.app, "north", invId, sent[0].patch);
    /* NORMALISED, NOT LOST. The form reads and writes text, so a numeric
       certificate comes back as the digits it always displayed as. What the
       first version did was return `null` — `text()` answers null for anything
       that is not a string — and write the emptiness back. */
    eq(String((await rowOf(ctx, invId)).cert), "88881111",
      "opening the form and saving it destroyed a certificate it could not display");
  });

  test("an edit sends the field that changed, and the copy's id", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = await stock(ctx, "north",
      { canonicalCardId: cards.unlimited, grade: "PSA 9", ask: 4200 });
    const sent = [];
    const r = await shelf(ctx, sent, await view(ctx.app, "north"));
    await pressText(r, "Edit");
    const ask = r.root.findAll((n) => n.type === "input")
      .find((n) => n.props.inputMode === "decimal");
    assert(ask, "no ask field");
    await TR.act(async () => { ask.props.onChange({ target: { value: "3900" } }); });
    await pressText(r, "Save changes");
    eq(sent[0].patch.ask, 3900, "the new ask");
    eq(sent[0].patch.grade, "PSA 9", "and the grade it already had");
    for (const forbidden of ["canonicalCardId", "cardId", "partnerId", "invId", "archived"]) {
      assert(!(forbidden in sent[0].patch), `the patch carried ${forbidden}`);
    }
  });

  test("Cancel on the form sends nothing at all", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200 });
    const sent = [];
    const r = await shelf(ctx, sent, await view(ctx.app, "north"));
    await pressText(r, "Edit");
    await pressText(r, "Cancel");
    eq(sent.length, 0, "cancelling wrote something");
  });

  test("removing takes two presses, and the first one sends nothing", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited });
    const sent = [];
    const r = await shelf(ctx, sent, await view(ctx.app, "north"));
    await pressText(r, "Remove from inventory");
    eq(sent.length, 0, "the opening press sent the command");
    /* The question names the card, so a person is not confirming a row number. */
    const asked = texts(r.root).join(" ");
    assert(/Charizard/.test(asked), "the confirmation does not name the card: " + asked);
    assert(/stop being told/.test(asked), "it does not say who stops seeing it: " + asked);
    await pressText(r, "Remove it");
    eq(sent.length, 1, "the confirming press sent nothing");
    eq(sent[0].kind, "retire", "and it is the removal");
    eq(sent[0].invId, invId, "of this copy");
  });

  test("Keep it keeps it", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await stock(ctx, "north", { canonicalCardId: cards.unlimited });
    const sent = [];
    const r = await shelf(ctx, sent, await view(ctx.app, "north"));
    await pressText(r, "Remove from inventory");
    await pressText(r, "Keep it");
    eq(sent.length, 0, "declining removed something");
    /* And the shelf is back, not stuck on the question. */
    const after = texts(r.root).join(" ");
    assert(/Remove from inventory/.test(after), "the control did not come back: " + after);
  });

  test("neither control is rendered when the screen was handed no callback", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await stock(ctx, "north", { canonicalCardId: cards.unlimited });
    const state = await view(ctx.app, "north");
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(INVENTORY, { state, onBrowseCards: null }));
    });
    const labels = r.root.findAll((n) => n.type === "button")
      .map((n) => texts(n).join(" ").trim());
    assert(!labels.includes("Edit"), "a dead Edit control was rendered: " + labels.join(" | "));
    assert(!labels.includes("Remove from inventory"),
      "a dead Remove control was rendered: " + labels.join(" | "));
  });
});

/* ============================================================== G */
describe("G. what the product says", () => {

  test("no user-visible string offers a Trade Binder any more", async () => {
    /* COMMENTS ARE EXEMPT AND THAT IS THE POINT. C5 left several explaining why
       the name went; what must never come back is a sentence a person reads. */
    for (const rel of ["client/sign-in/SignIn.jsx", "client/collector/CollectorShell.jsx",
      "client/collector/sections/MyCards.jsx", "client/collector/sections/TrustedPartners.jsx",
      "client/collector/CardSpecification.jsx", "client/collector/sections/Binder.jsx"]) {
      assert(!/Trade Binder/i.test(code(rel)), `${rel} still shows "Trade Binder" to a person`);
    }
  });

  test("the consent sentence describes what the server actually shares", async () => {
    const consent = read("client/sign-in/SignIn.jsx");
    const sentence = consent.slice(consent.indexOf("Accepting adds you to"),
      consent.indexOf("other shop."));
    assert(/goals you set/.test(sentence), "it does not mention Goals");
    assert(/choose\s+/.test(sentence) && /offer/.test(sentence),
      "it does not say that offering is a choice");
    assert(/stay private/.test(sentence), "it does not say what stays private");
    assert(/binders/i.test(sentence), "it does not mention binders at all");
    assert(!/Trade Binder/i.test(sentence), "it still names the Trade Binder");
    /* AND IT MAKES NO ABSOLUTE IT CANNOT KEEP. `COLLECTOR_FOR_PARTNER`
       (domain/metyet-projection.js:124) carries a Collector's name, short name,
       city and preference tags to their network, so "nothing else about you is
       shared" would be false of the code even though no exposed command can set
       the last three. The sentence names the one a person expects instead. */
    assert(!/Nothing else about you/.test(sentence),
      "the sentence makes a claim the projection contradicts: " + sentence);
    assert(/your name/.test(sentence), "it does not say the shop learns their name");
  });

  test("the join banner says the same thing as the consent sentence", async () => {
    const shell = code("client/collector/CollectorShell.jsx");
    assert(/goals you set, and any cards you choose to offer/.test(shell),
      "the banner and the consent sentence disagree about what is shared");
  });

  test("and what they both promise is what the projection does", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    /* Three facts, one of each kind: a Goal, a copy kept back, a copy offered. */
    await wants(ctx, "casey", cards.unlimited);
    const priv = await post(ctx.app, "casey", "addCollectorCopy",
      { copy: { canonicalCardId: cards.firstEdition, offered: false } });
    eq(priv.statusCode, 200, priv.body);
    const open = await post(ctx.app, "casey", "addCollectorCopy",
      { copy: { canonicalCardId: cards.unlimited, offered: true } });
    eq(open.statusCode, 200, open.body);
    const made = await post(ctx.app, "casey", "createBinder", { name: "Base Set run" });
    eq(made.statusCode, 200, made.body);

    const theirs = await view(ctx.app, "north");
    eq(theirs.goals.length, 1, "the Goal crossed");
    const crossed = theirs.collectorCopies.map((b) => b.id);
    assert(crossed.includes(open.json().value), "the offered copy crossed");
    assert(!crossed.includes(priv.json().value), "the copy kept back did not");
    eq(theirs.binders.length, 0, "and no binder did");
    assert(!JSON.stringify(theirs).includes("Base Set run"), "not even its name");
  });

  test("Card Specification no longer counts anybody's Trusted Partners", async () => {
    const panel = code("client/collector/CardSpecification.jsx");
    assert(!/holders/.test(panel), "the holder count is still in the panel");
    /* AGAINST THE CODE, NOT THE COMMENTS. C5 left a comment quoting the
       sentence it deleted, which is the sentence, and a naive read would find
       it. What must never come back is a line that RENDERS. */
    assert(!/of your Trusted Partners have this/.test(panel), "the sentence is still there");
    const browse = code("client/collector/sections/Browse.jsx");
    assert(!/holdersOf|holders=/.test(browse), "Browse still computes or passes it");
    /* AND THE STYLE IT USED WENT WITH IT, so the removal cannot be undone by
       half. (`dist/MetYet.prod.js` is deliberately NOT checked: that bundle is
       the prototype, built from src/MetYet.jsx, and never contained this rule —
       asserting its absence there would prove nothing. What proves it is the
       rendered panel, in the test below.) */
    assert(!/mcs-spec-net/.test(read("client/collector/CollectorShell.jsx")),
      "the rule it used is still in the stylesheet");
  });

  test("and the rendered panel says it from neither door", async () => {
    /* THROUGH BROWSE, WHICH IS THE DOOR THAT USED TO PASS THE COUNT. Binder and
       Your Cards never passed it, so they were silent before this batch and are
       silent now — the asymmetry was the defect, and the only door that can
       regress is this one. (An earlier draft of this comment claimed the test
       opened both; it did not, and saying so was worse than the gap.) */
    const ctx = await world();
    const cards = await charizard(ctx);
    await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 900 });
    const state = await view(ctx.app, "casey");
    assert(state.inventory.length === 1, "the Collector can see their partner's copy");

    const SHELL = build("client/collector/CollectorShell.jsx").default;
    const door = { find: async (q) =>
      ctx.catalog.findCardContexts(Object.fromEntries(new URLSearchParams(q).entries())),
    read: async (id) => ctx.catalog.readCardContext(id),
    describe: async (ids) => ctx.catalog.describeCanonicalCards(ids),
    expansions: async () => ({ expansions: [] }), artists: async () => ({ artists: [] }) };

    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(SHELL,
        { state, onSignOut() {}, onSpecify: async () => ({ ok: true }), onBrowseCards: door }));
    });
    const typeInto = async (id, value) => {
      const input = r.root.findAll((n) => n.type === "input").find((n) => n.props.id === id);
      assert(input, `no input ${id}`);
      await TR.act(async () => { input.props.onChange({ target: { value } }); });
      await TR.act(async () => {});
    };
    const pressText = async (label) => {
      const b = r.root.findAll((n) => n.type === "button")
        .find((n) => texts(n).join(" ").includes(label));
      assert(b, `no control "${label}"`);
      await TR.act(async () => { b.props.onClick(); });
      await TR.act(async () => {});
    };
    await typeInto("mcs-br-q", "Charizard");
    await pressText("Charizard");
    /* A CHECKLIST LINE WITH TWO PRINTINGS ASKS WHICH, and the count only ever
       appeared once one was chosen — so stopping here would assert the absence
       of something that was never going to be present. Choose one. */
    await pressText("unlimited");
    const shown = texts(r.root).join(" ");
    /* The panel is open AND past the chooser: these two strings belong to the
       section the count used to sit in. Without them this test proves nothing,
       which is how the first draft of it managed to pass while stopping early. */
    assert(/Are you looking for it\?/.test(shown), "the panel did not reach the goal section: "
      + shown.slice(0, 500));
    assert(/Do you have one\?/.test(shown), "the panel did not reach the copies section: "
      + shown.slice(0, 500));
    assert(!/of your Trusted Partners ha[sv]e? this/.test(shown),
      "the count is still rendered from Browse: " + shown.slice(0, 500));
  });

  test("the loading sentence does not give a Collector a shop", async () => {
    assert(!/Loading your shop/.test(code("client/sign-in/SignIn.jsx")),
      "a Collector is still told about their shop");
  });

  test("a new goal says where it went, and claims nothing more", async () => {
    const panel = code("client/collector/CardSpecification.jsx");
    assert(/Your Trusted Partners can see this goal/.test(panel),
      "nothing tells a person where a saved goal went");
    /* WHAT IT MUST NOT SAY. Not that a particular shop has looked, not that
       anybody has the card, and not that MetYet will tell them. */
    /* SLICED FROM THE RIGHT END. The first draft ran from `setSaved(` to the
       first `setSaving(false);`, which occurs EARLIER in the file, in the
       refusal branch — so the slice was empty and all five claims below passed
       against nothing. Taking the two sentences themselves is unambiguous. */
    const at = panel.indexOf("Saved. Your Trusted Partners");
    assert(at > 0, "the saved sentence is gone");
    const said = panel.slice(at, panel.indexOf("\");", at));
    assert(said.length > 40, "the slice did not find the sentences: " + json(said));
    assert(/Trusted Partners can see this goal/.test(said), "the sentence changed shape");
    for (const claim of ["has this", "notified", "has been told", "will tell", "alerted",
      "has your card", "in stock"]) {
      assert(!said.includes(claim), `the sentence claims "${claim}": ${said}`);
    }
  });

  test("and it does not promise an empty network anything", async () => {
    const panel = code("client/collector/CardSpecification.jsx");
    assert(/When you join a shop's Collector Network/.test(panel),
      "a Collector with no partners is told their partners can see it");
  });
});

/* ============================================================== H */
describe("H. nothing else moved", () => {

  test("no migration, and the newest is still C3.4's", async () => {
    const files = fs.readdirSync(path.join(ROOT, "persistence/migrations")).sort();
    eq(files[files.length - 1], "0013_binders.sql", "C5 added or renamed a migration");
  });

  test("the domain's command table did not grow", async () => {
    eq([...COMMAND_NAMES].length, 49, "C5 wrote a command instead of shipping two that existed");
  });

  test("no new route, and the catalogue import is still unreachable", async () => {
    const ctx = await world();
    const app = code("server/app.js");
    assert(!/app\.(post|put|patch|delete)\([^)]*inventor/i.test(app), "an inventory route exists");
    for (const name of ["catalogImport", "importCatalog"]) {
      eq((await post(ctx.app, "north", name, {})).json().error.refused, "command-unavailable", name);
    }
  });

  test("binder privacy, unchanged", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const made = await post(ctx.app, "casey", "createBinder", { name: "Secret run" });
    eq(made.statusCode, 200, made.body);
    await post(ctx.app, "casey", "addBinderEntry",
      { binderId: made.json().value, canonicalCardId: cards.unlimited });
    const theirs = await view(ctx.app, "north");
    eq(theirs.binders.length, 0, "no binder");
    eq(theirs.binderEntries.length, 0, "no membership");
    assert(!JSON.stringify(theirs).includes("Secret run"), "and not the name");
  });

  test("offered is still separate from owned, and correcting a shop's copy does not touch it", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const mine = await post(ctx.app, "casey", "addCollectorCopy",
      { copy: { canonicalCardId: cards.unlimited, offered: false } });
    const copyId = mine.json().value;
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited });
    await correct(ctx.app, "north", invId, { ask: 1 });
    await retire(ctx.app, "north", invId);
    const stored = (await ctx.repository.loadWorld()).collectorCopies.find((b) => b.id === copyId);
    eq(stored.offered, false, "a Collector's willingness is their own");
    eq(stored.archived === true, false, "and a shop retiring its copy does not retire theirs");
  });

  test("a Collector's copies and a shop's inventory are still two collections", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await post(ctx.app, "casey", "addCollectorCopy",
      { copy: { canonicalCardId: cards.unlimited, offered: true } });
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited });
    await retire(ctx.app, "north", invId);
    const world1 = await ctx.repository.loadWorld();
    eq(world1.collectorCopies.length, 1, "the Collector's copy is untouched");
    eq(world1.collectorCopies[0].archived === true, false, "and not archived by association");
    eq(world1.inventory.filter((i) => i.archived).length, 1, "only the shop's row moved");
  });

  test("no provider identity anywhere in either seat's view", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited });
    await correct(ctx.app, "north", invId, { ask: 3900 });
    for (const seat of ["north", "casey"]) {
      const body = JSON.stringify(await view(ctx.app, seat));
      for (const leak of ["provider", "natural_key", "naturalKey", "source_mapping"]) {
        assert(!body.includes(leak), `"${leak}" reached the ${seat} projection`);
      }
    }
  });

  test("nothing C5 wrote reaches a bundled card dataset", async () => {
    /* C5's claim was that correcting a copy on the shelf needs no catalog dump.
       It asserted that against `pokemon_cards.json` by name and additionally
       asserted the file still existed — which pinned the file rather than the
       property. C7.1 removed the file (unread by anything, no verified licence
       basis), so the claim is now stated as what it meant. */
    for (const rel of ["client/tp/sections/Inventory.jsx", "client/commands.js",
      "client/collector/CardSpecification.jsx", "server/exposed-commands.js"]) {
      assert(!/pokemon_cards|cards\.json/i.test(read(rel)), `${rel} reaches a bundled dataset`);
    }
    assert(!fs.existsSync(path.join(ROOT, "pokemon_cards.json")), "it came back");
  });

  test("no dependency was added", async () => {
    const pkg = JSON.parse(read("package.json"));
    eq(json(Object.keys(pkg.dependencies || {}).sort()),
      json(["esbuild", "fastify", "jose", "pg", "react", "react-dom", "react-test-renderer"]),
      "the dependency list moved");
  });
});

/* ====================================== the pin the checkpoint asked for */
describe("I. a Collector cannot rewrite another Collector's goal criteria", () => {

  /* FOUND BY THE POST-C4 CHECKPOINT, and proved by mutation: the ownership
     clause of `updateGoalCriteria` could be deleted and all 4,255 tests still
     passed, because every suite that exercised the refusal used a Trusted
     Partner actor and so tripped only the seat half of the check.

     The implementation was correct and is unchanged. What was missing was this. */

  test("a second Collector is refused, and the criteria do not move", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const goalId = await wants(ctx, "casey", cards.unlimited);
    const res = await post(ctx.app, "dana", "updateGoalCriteria",
      { goalId, desired: { grade: "Raw", condition: "Damaged" } });
    eq(res.statusCode, 409, res.body);
    eq(res.json().error.refused, "not-owner", "another Collector rewrote a Goal");
    const stored = (await ctx.repository.loadWorld()).goals.find((g) => g.id === goalId);
    eq(json(stored.desired), json({ grade: "PSA 9" }), "the criteria moved");
  });

  test("the same is true of the tier and of removing it", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const goalId = await wants(ctx, "casey", cards.unlimited);
    eq(refusal(await post(ctx.app, "dana", "updateGoalTier", { goalId, tier: "secondary" })),
      "not-owner", "tier");
    eq(refusal(await post(ctx.app, "dana", "removeGoal", { goalId })), "not-owner", "removal");
    const stored = (await ctx.repository.loadWorld()).goals.find((g) => g.id === goalId);
    assert(stored, "the Goal survived");
    eq(stored.tier, "primary", "at its own tier");
  });

  test("and a Trusted Partner still cannot either", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const goalId = await wants(ctx, "casey", cards.unlimited);
    eq(refusal(await post(ctx.app, "north", "updateGoalCriteria",
      { goalId, desired: { grade: "Raw", condition: "Damaged" } })), "not-owner", "the partner");
  });
});

run();
