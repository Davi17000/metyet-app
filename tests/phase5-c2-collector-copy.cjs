/* ============================================================================
   PHASE 5 C2 — COLLECTOR COPY FOUNDATION

   One thing a Collector owns, and one separate thing they say about it.

   Batch 6 put a Trusted Partner's supply on canonical cards. Batch 7 put a
   Collector's demand there. This is the third record in that family and the one
   that was worst off: a Collector's own physical card could only name a row in
   the LEGACY catalogue, which is empty in production and meant to stay that
   way — so a real Collector could not record owning anything at all.

   And it carried a second problem the rename made visible. Owning a card and
   offering it to your Trusted Partners were the SAME ACT. A copy existed only
   because it had been put up for trade, so "I own this but I'm not trading it"
   was unsayable, and "I've changed my mind" could only be said by DELETING the
   record — throwing away the photographs, the certificate and the fact of
   ownership in order to change an answer about willingness.

   Both are fixed here, and the tests below are about the seam between them.

   A. canonical ownership   whose card this is, which card it is, who decided
   B. multiple copies       two of the same card are two objects
   C. offered               willingness changes; ownership does not
   D. removal               leaving your hands is not changing your mind
   E. photographs           where the requirement went, and that it still bites
   F. derived status        `offered` did not replace, and cannot replace, it
   G. projection & privacy  what a partner receives, and what they do not
   H. production boundary   the exact doors this batch opened
   I. compatibility         everything Batches 5–8 and C1 established, intact
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
const { projectForActor, FIELD_RULES } = require("../domain/metyet-projection.js");
const { validateWorld } = require("../domain/metyet-world.js");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
const D = require("../domain/metyet-domain.js");
const C = require("../domain/metyet-commands.js");
const RT = require("../domain/metyet-runtime.js");

const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/* One production module, bundled and evaluated — the same way the Phase 4
   suites read a client file, so an assertion about the navigation is about the
   navigation rather than about prose near it. */
const loadModule = (rel) => {
  const out = esbuild.buildSync({
    entryPoints: [path.join(ROOT, rel)],
    bundle: true, format: "cjs", write: false, logLevel: "silent", jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const module = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(
    module, module.exports, require);
  return module.exports;
};
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "");
const json = (v) => JSON.stringify(v);

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

/* Casey knows Northline. Dana knows nobody. Second is a partner outside
   Casey's network. The catalog starts empty, as production's does. */
const SUBJECT = { north: "sub-north", second: "sub-second", casey: "sub-casey", dana: "sub-dana" };
const ACTOR = { casey: { collectorId: "c1" }, dana: { collectorId: "c2" },
  north: { partnerId: "p1" }, second: { partnerId: "p2" } };

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
    invitations: [], goals: [], inventory: [], collectorCopies: [], binders: [], binderEntries: [], interests: [],
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

/* The product's own door, every time. A Collector records a card by sending the
   command a browser sends; nothing in this file reaches around the route. */
const own = (app, token, copy) => post(app, token, "addCollectorCopy", { copy });
const offer = (app, token, copyId, offered) =>
  post(app, token, "setCollectorCopyOffered", { copyId, offered });
const drop = (app, token, copyId) => post(app, token, "removeCollectorCopy", { copyId });
const copiesOf = async (ctx) => (await ctx.repository.loadWorld()).collectorCopies;
const copyOf = async (ctx, id) => (await copiesOf(ctx)).find((b) => b.id === id);

/* PAST THE DOOR. `updateCollectorCopy` is written and tested and deliberately
   NOT exposed to production (section H), so its rules are asked through the same
   transaction, the same lock and the same validateWorld — and also proved shut
   at the HTTP boundary, which is stricter than only doing one of the two. */
const direct = (ctx, actor, command, payload) =>
  executeCommand(ctx.repository, { actor, command, payload, runtime: ctx.runtime });
const closedOverHttp = async (ctx, token, command, payload = {}) => {
  const res = await post(ctx.app, token, command, payload);
  eq(res.statusCode, 409, `${command} over HTTP`);
  eq(res.json().error.refused, "command-unavailable", `${command} over HTTP`);
};

const PHOTOS = { front: "copy:front", back: "copy:back" };

/* ============================================================== A */
describe("A. whose card this is, which card it is, and who decided", () => {

  test("a Collector records owning an exact canonical card, with no legacy catalogue row", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const res = await own(ctx.app, "casey", { canonicalCardId: cards.firstEdition,
      grade: "PSA 9", cert: "PSA 12345678", market: 8000 });
    eq(res.statusCode, 200, res.body);
    const stored = await copyOf(ctx, res.json().value);
    eq(stored.collectorId, "c1", "owned by the collector who asked");
    eq(stored.canonicalCardId, cards.firstEdition, "and it names the exact printing chosen");
    assert(!("cardId" in stored) || stored.cardId == null, "and no legacy reference came with it");
    /* The whole point: production's legacy catalogue is empty and stayed empty. */
    eq((await ctx.repository.loadWorld()).catalog.length, 0, "no legacy card was invented");
  });

  test("a canonical card that does not exist is refused, and nothing is written", async () => {
    const ctx = await world();
    await charizard(ctx);
    const res = await own(ctx.app, "casey", { canonicalCardId: "cc-not-a-real-card" });
    eq(res.statusCode, 409, res.body);
    eq(res.json().error.refused, "card-unavailable", "refused in the caller's own vocabulary");
    eq((await copiesOf(ctx)).length, 0, "and nothing was written");
  });

  test("naming both a canonical card and a legacy one is refused — exactly one reference", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const res = await own(ctx.app, "casey", { canonicalCardId: cards.unlimited, cardId: "k-legacy" });
    eq(res.statusCode, 409, res.body);
    eq((await copiesOf(ctx)).length, 0, "and nothing was written");
    /* validateWorld is the backstop, not just the command. */
    const bad = await ctx.repository.loadWorld();
    bad.collectorCopies = [{ id: "bx", collectorId: "c1", cardId: "k1", canonicalCardId: cards.unlimited }];
    const r = validateWorld(bad);
    assert(!r.ok && r.errors.some((e) => e.code === "ref.ambiguous"), json(r.errors));
  });

  test("a copy that names no card at all is refused by validateWorld", async () => {
    const ctx = await world();
    const bad = await ctx.repository.loadWorld();
    bad.collectorCopies = [{ id: "bx", collectorId: "c1", offered: true }];
    const r = validateWorld(bad);
    assert(!r.ok && r.errors.some((e) => e.code === "ref.missing"), json(r.errors));
  });

  test("a Trusted Partner cannot record a Collector's card", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const res = await own(ctx.app, "north", { canonicalCardId: cards.unlimited });
    eq(res.statusCode, 409, res.body);
    eq(res.json().error.refused, "not-owner", "refused by seat");
    eq((await copiesOf(ctx)).length, 0, "and nothing was written");
  });

  test("ownership cannot be forged in the payload — the actor decides, not the caller", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const res = await own(ctx.app, "casey", { canonicalCardId: cards.unlimited, collectorId: "c2" });
    eq(res.statusCode, 200, res.body);
    eq((await copyOf(ctx, res.json().value)).collectorId, "c1", "the claim was ignored");
  });

  test("a Collector cannot touch another Collector's copy — offer, withdraw, edit or remove", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = (await own(ctx.app, "casey", { canonicalCardId: cards.unlimited, cert: "CASEY" })).json().value;

    eq((await offer(ctx.app, "dana", id, true)).json().error.refused, "not-owner", "offering");
    eq((await drop(ctx.app, "dana", id)).json().error.refused, "not-owner", "removing");
    const edit = await direct(ctx, ACTOR.dana, "updateCollectorCopy", { copyId: id, patch: { cert: "DANA" } });
    eq(edit.refused, "not-owner", "editing, past the door");

    const still = await copyOf(ctx, id);
    eq(still.cert, "CASEY", "and the copy is exactly as its owner left it");
    eq(still.offered, false, "including its willingness");
  });
});

/* ============================================================== B */
describe("B. two of the same card are two objects", () => {

  test("a Collector may own several copies of one canonical card, each with its own facts", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const a = (await own(ctx.app, "casey", { canonicalCardId: cards.unlimited,
      grade: "PSA 9", cert: "PSA 111", market: 4000 })).json().value;
    const b = (await own(ctx.app, "casey", { canonicalCardId: cards.unlimited,
      condition: "Lightly Played", cert: null, market: 900 })).json().value;

    assert(a !== b, "two records");
    const rows = await copiesOf(ctx);
    eq(rows.length, 2, "both kept");
    eq(rows.filter((x) => x.canonicalCardId === cards.unlimited).length, 2, "of the same card");
    eq((await copyOf(ctx, a)).grade, "PSA 9", "one is graded");
    eq((await copyOf(ctx, b)).condition, "Lightly Played", "the other is raw and described");
    eq((await copyOf(ctx, a)).market, 4000);
    eq((await copyOf(ctx, b)).market, 900, "and their values are their own");
  });

  test("owning is not a Goal: there is no one-per-card rule on a shelf", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    for (let i = 0; i < 4; i += 1) {
      const res = await own(ctx.app, "casey", { canonicalCardId: cards.shadowless });
      eq(res.statusCode, 200, `copy ${i}: ${res.body}`);
    }
    eq((await copiesOf(ctx)).length, 4, "four physical objects, one card");
    /* And the Goal rule it is NOT is still the Goal rule (Batch 7). */
    const first = await post(ctx.app, "casey", "addGoal", { canonicalCardId: cards.shadowless, tier: "primary", desired: { grade: "PSA 9" } });
    eq(first.statusCode, 200, first.body);
    const again = await post(ctx.app, "casey", "addGoal", { canonicalCardId: cards.shadowless, tier: "primary", desired: { grade: "PSA 9" } });
    eq(again.statusCode, 409, "a second live Goal for one card is still refused");
  });

  test("each copy's willingness is its own", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const a = (await own(ctx.app, "casey", { canonicalCardId: cards.unlimited, offered: true })).json().value;
    const b = (await own(ctx.app, "casey", { canonicalCardId: cards.unlimited, offered: true })).json().value;
    eq((await offer(ctx.app, "casey", a, false)).statusCode, 200);
    eq((await copyOf(ctx, a)).offered, false, "one withdrawn");
    eq((await copyOf(ctx, b)).offered, true, "the other untouched");
  });
});

/* ============================================================== C */
describe("C. willingness changes; ownership does not", () => {

  test("a new copy is NOT offered unless its owner says so", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const quiet = (await own(ctx.app, "casey", { canonicalCardId: cards.unlimited })).json().value;
    eq((await copyOf(ctx, quiet)).offered, false, "owning is the base fact");
    const loud = (await own(ctx.app, "casey", { canonicalCardId: cards.shadowless, offered: true })).json().value;
    eq((await copyOf(ctx, loud)).offered, true, "and offering is a thing you say");
  });

  test("stopping offering keeps the record, the card and every physical fact", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = (await own(ctx.app, "casey", { canonicalCardId: cards.firstEdition, offered: true,
      grade: "PSA 10", cert: "PSA 99887766", market: 42000, photos: PHOTOS })).json().value;
    const before = await copyOf(ctx, id);
    eq(before.offered, true, "offered to start with");

    eq((await offer(ctx.app, "casey", id, false)).statusCode, 200);
    const after = await copyOf(ctx, id);

    assert(after, "the CollectorCopy still exists");
    eq(after.id, before.id, "the same record");
    eq(after.canonicalCardId, cards.firstEdition, "its canonical identity is unchanged");
    eq(after.grade, "PSA 10", "grade kept");
    eq(after.cert, "PSA 99887766", "certificate kept");
    eq(after.market, 42000, "the owner's reference value kept");
    eq(after.photos.front, PHOTOS.front, "front photograph kept");
    eq(after.photos.back, PHOTOS.back, "back photograph kept");
    eq(after.offered, false, "and only the willingness changed");
  });

  test("a withdrawn copy is no longer trade supply for a related partner", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = (await own(ctx.app, "casey", { canonicalCardId: cards.firstEdition,
      offered: true, photos: PHOTOS })).json().value;

    const supply = async () => (await get(ctx.app, "north", "/api/view")).json().state.collectorCopies;
    eq((await supply()).length, 1, "offered: Northline sees it");
    await offer(ctx.app, "casey", id, false);
    eq((await supply()).length, 0, "withdrawn: Northline sees nothing");
    /* And the owner still sees it whole. */
    const mine = (await get(ctx.app, "casey", "/api/view")).json().state.collectorCopies;
    eq(mine.length, 1, "the Collector still owns it");
    eq(mine[0].offered, false, "and is told what they said about it");
  });

  test("offering it again makes the SAME record supply again — not a new one", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = (await own(ctx.app, "casey", { canonicalCardId: cards.firstEdition,
      offered: true, cert: "PSA 4242", photos: PHOTOS })).json().value;
    await offer(ctx.app, "casey", id, false);
    eq((await offer(ctx.app, "casey", id, true)).statusCode, 200);

    eq((await copiesOf(ctx)).length, 1, "one record throughout");
    eq((await copyOf(ctx, id)).offered, true);
    eq((await copyOf(ctx, id)).cert, "PSA 4242", "with the certificate it always had");
    const seen = (await get(ctx.app, "north", "/api/view")).json().state.collectorCopies;
    eq(seen.length, 1, "supply again");
    eq(seen[0].id, id, "and it is the same copy, by id");
  });

  test("saying the same thing twice changes nothing and is not an error", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = (await own(ctx.app, "casey", { canonicalCardId: cards.unlimited, offered: true })).json().value;
    const before = json(await copyOf(ctx, id));
    const again = await offer(ctx.app, "casey", id, true);
    eq(again.statusCode, 200, again.body);
    eq(json(await copyOf(ctx, id)), before, "byte-identical");
  });

  test("`offered` cannot ride in on an update patch — willingness has one door", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = (await own(ctx.app, "casey", { canonicalCardId: cards.unlimited, offered: true })).json().value;
    const r = await direct(ctx, ACTOR.casey, "updateCollectorCopy", { copyId: id, patch: { offered: false } });
    eq(r.refused, D.REFUSE.identityImmutable, "an edit cannot change what a card is doing in the world");
    eq((await copyOf(ctx, id)).offered, true, "and it did not");
    /* An ordinary edit still works, and still preserves willingness. */
    const ok = await direct(ctx, ACTOR.casey, "updateCollectorCopy", { copyId: id, patch: { market: 5 } });
    assert(!ok.refused, json(ok));
    eq((await copyOf(ctx, id)).market, 5, "the edit landed");
    eq((await copyOf(ctx, id)).offered, true, "and offering survived it");
  });

  test("`offered` is a boolean or it is refused, and validateWorld says so too", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = (await own(ctx.app, "casey", { canonicalCardId: cards.unlimited })).json().value;
    for (const value of ["yes", 1, null, undefined]) {
      const res = await offer(ctx.app, "casey", id, value);
      eq(res.statusCode, 409, `offered: ${json(value)}`);
    }
    const bad = await ctx.repository.loadWorld();
    bad.collectorCopies = bad.collectorCopies.map((b) => ({ ...b, offered: "yes" }));
    const r = validateWorld(bad);
    assert(!r.ok && r.errors.some((e) => e.code === "field.invalid" && /offered/.test(e.path)), json(r.errors));
  });
});

/* ============================================================== D */
describe("D. leaving your hands is not changing your mind", () => {

  test("removal and withdrawal are different acts with different results", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const kept = (await own(ctx.app, "casey", { canonicalCardId: cards.unlimited, offered: true })).json().value;
    const gone = (await own(ctx.app, "casey", { canonicalCardId: cards.shadowless, offered: true })).json().value;

    await offer(ctx.app, "casey", kept, false);
    eq((await drop(ctx.app, "casey", gone)).statusCode, 200);

    assert(await copyOf(ctx, kept), "withdrawing left the record");
    eq(await copyOf(ctx, gone), undefined, "removing took it away");
  });

  test("removing a copy takes its interests with it; withdrawing does not", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = (await own(ctx.app, "casey", { canonicalCardId: cards.unlimited,
      offered: true, photos: PHOTOS })).json().value;
    const keen = await direct(ctx, ACTOR.north, "setInterest", { binderId: id, on: true });
    assert(!keen.refused, json(keen));
    eq((await ctx.repository.loadWorld()).interests.length, 1, "Northline is interested");

    await offer(ctx.app, "casey", id, false);
    eq((await ctx.repository.loadWorld()).interests.length, 1,
      "withdrawing an offer does not erase who had been interested");

    await offer(ctx.app, "casey", id, true);
    eq((await drop(ctx.app, "casey", id)).statusCode, 200);
    eq((await ctx.repository.loadWorld()).interests.length, 0, "removing the card removes them");
    assert(validateWorld(await ctx.repository.loadWorld()).ok, "and leaves a valid world");
  });

  test("a partner cannot register interest in a card its owner is not offering", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = (await own(ctx.app, "casey", { canonicalCardId: cards.unlimited, photos: PHOTOS })).json().value;
    const r = await direct(ctx, ACTOR.north, "setInterest", { binderId: id, on: true });
    /* `not-found`, deliberately: the answer a copy that does not exist gets. A
       refusal that told the two apart would be the leak. */
    eq(r.refused, D.REFUSE.notFound, "an unoffered copy does not exist for a partner");
    eq((await ctx.repository.loadWorld()).interests.length, 0, "and nothing was written");
  });

  test("a copy a live deal holds cannot be removed, whatever its owner now says about offering", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const w = await reservedCopy(ctx, cards);

    eq((await drop(ctx.app, "casey", w.copyId)).json().error.refused, "copy-reserved",
      "a reserved copy is part of a deal");
    /* Withdrawing the OFFER is still allowed — it is a statement, not a deletion
       — and the deal keeps the copy regardless. */
    eq((await offer(ctx.app, "casey", w.copyId, false)).statusCode, 200);
    assert(await copyOf(ctx, w.copyId), "the copy is still there");
    eq((await drop(ctx.app, "casey", w.copyId)).json().error.refused, "copy-reserved",
      "and still cannot be deleted out from under the deal");
  });

  test("history is not deletable: a completed deal's copy stays", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const w = await reservedCopy(ctx, cards);
    const accepted = await direct(ctx, ACTOR.north, "reviewTradeCard",
      { oppId: w.oppId, tradeCardId: w.tradeCardId, decision: "accept" });
    assert(!accepted.refused, json(accepted));
    eq((await drop(ctx.app, "casey", w.copyId)).json().error.refused, "copy-committed",
      "a committed copy is the deal's record now");
  });
});

/* A Collector's copy inside a live trade package, built the long way — through
   the real negotiation commands, so the locks under test are the real ones. */
async function reservedCopy(ctx, cards) {
  const invId = (await post(ctx.app, "north", "addInventoryCopy",
    { copy: { canonicalCardId: cards.firstEdition, ask: 9000 } })).json().value;
  const goalId = (await post(ctx.app, "casey", "addGoal",
    { canonicalCardId: cards.firstEdition, tier: "primary", desired: { grade: "PSA 9" } })).json().value;
  const copyId = (await own(ctx.app, "casey", { canonicalCardId: cards.shadowless,
    offered: true, photos: PHOTOS, market: 3000 })).json().value;

  const opened = await direct(ctx, ACTOR.casey, "startOpportunity", { goalId, invId, amount: 9000 });
  assert(!opened.refused, "startOpportunity: " + json(opened));
  const oppId = opened.value;
  const priced = await direct(ctx, ACTOR.north, "acceptPrice", { oppId });
  assert(!priced.refused, "acceptPrice: " + json(priced));
  const sent = await direct(ctx, ACTOR.casey, "proposeTradeSelection", { oppId, binderIds: [copyId] });
  assert(!sent.refused, "proposeTradeSelection: " + json(sent));

  const world = await ctx.repository.loadWorld();
  const opp = world.opportunities.find((o) => o.id === oppId);
  const row = opp.trade.cards.find((c) => c.binderId === copyId);
  assert(row, "the package names the copy");
  return { invId, goalId, copyId, oppId, tradeCardId: row.id };
}

/* ============================================================== E */
describe("E. photographs, where the requirement went", () => {

  test("recording a card you own needs no photograph at all", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const bare = await own(ctx.app, "casey", { canonicalCardId: cards.unlimited });
    eq(bare.statusCode, 200, bare.body);
    const half = await own(ctx.app, "casey", { canonicalCardId: cards.shadowless, photos: { front: "f" } });
    eq(half.statusCode, 200, half.body);
    eq((await copiesOf(ctx)).length, 2, "a shoebox and no lightbox is a real starting point");
    /* And editing one does not demand them either. */
    const r = await direct(ctx, ACTOR.casey, "updateCollectorCopy",
      { copyId: bare.json().value, patch: { market: 120 } });
    assert(!r.refused, json(r));
  });

  test("offering an unphotographed card is allowed; putting it in a trade is not", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = (await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: cards.firstEdition, ask: 9000 } })).json().value;
    const goalId = (await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: cards.firstEdition, tier: "primary", desired: { grade: "PSA 9" } })).json().value;
    const copyId = (await own(ctx.app, "casey", { canonicalCardId: cards.shadowless,
      offered: true, photos: { front: "only-one-face" } })).json().value;
    eq((await copyOf(ctx, copyId)).offered, true, "offering it is a statement, and allowed");

    const oppId = (await direct(ctx, ACTOR.casey, "startOpportunity", { goalId, invId, amount: 9000 })).value;
    assert(!(await direct(ctx, ACTOR.north, "acceptPrice", { oppId })).refused);

    const refused = await direct(ctx, ACTOR.casey, "proposeTradeSelection", { oppId, binderIds: [copyId] });
    eq(refused.refused, D.REFUSE.photosRequired,
      "a partner cannot be asked to value a card they cannot see");
    const still = (await ctx.repository.loadWorld()).opportunities.find((o) => o.id === oppId);
    assert(!(still.trade && still.trade.submitted), "and nothing was submitted");
  });

  test("add the second face and the same trade operation proceeds", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = (await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: cards.firstEdition, ask: 9000 } })).json().value;
    const goalId = (await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: cards.firstEdition, tier: "primary", desired: { grade: "PSA 9" } })).json().value;
    const copyId = (await own(ctx.app, "casey", { canonicalCardId: cards.shadowless,
      offered: true, photos: { front: "only-one-face" } })).json().value;
    const oppId = (await direct(ctx, ACTOR.casey, "startOpportunity", { goalId, invId, amount: 9000 })).value;
    await direct(ctx, ACTOR.north, "acceptPrice", { oppId });
    eq((await direct(ctx, ACTOR.casey, "proposeTradeSelection", { oppId, binderIds: [copyId] })).refused,
      D.REFUSE.photosRequired, "refused while half photographed");

    const shot = await direct(ctx, ACTOR.casey, "updateCollectorCopy",
      { copyId, patch: { photos: PHOTOS } });
    assert(!shot.refused, json(shot));
    const sent = await direct(ctx, ACTOR.casey, "proposeTradeSelection", { oppId, binderIds: [copyId] });
    assert(!sent.refused, "the same operation, now allowed: " + json(sent));
    const opp = (await ctx.repository.loadWorld()).opportunities.find((o) => o.id === oppId);
    assert(opp.trade.submitted, "and the package is submitted");
  });

  test("grade and condition are read in one place, provider-neutrally", () => {
    /* C2 DID NOT CHANGE THE STORED SHAPE, and the report says why: splitting
       "PSA 9" into a grading state, a grader and a number would migrate every
       inventory row already written, in a batch whose subject is ownership.
       What it did change is that there is now one reader that says what such a
       string MEANS, so the migration when it comes has one place to change and
       a grading company appears in one regex rather than four files. */
    eq(json(D.gradingOf({ grade: "PSA 9" })),
      json({ state: "graded", grader: "PSA", grade: 9, condition: null, label: "PSA 9" }),
      "a graded copy has a grader and a number, and no raw condition");
    eq(json(D.gradingOf({ grade: "Raw", condition: "Near Mint" })),
      json({ state: "raw", grader: null, grade: null, condition: "Near Mint", label: "Raw · Near Mint" }),
      "a raw copy has a condition and no grader");
    /* Stated-raw and nothing-stated are different answers and stay different. */
    eq(D.gradingOf({}).state, "unstated", "a copy nobody described is not a raw copy");
    eq(D.gradingOf({ grade: "Raw" }).state, "raw");
    /* Provider-neutral by construction: nothing here knows the word PSA. */
    eq(D.gradingOf({ grade: "BGS 9.5" }).grader, "BGS", "another grader parses the same way");
    eq(D.gradingOf({ grade: "BGS 9.5" }).grade, 9.5);
    /* And the vocabulary the COMMANDS accept is still PSA-only and still a
       closed list — the model can read more than the product offers, which is
       the point and is not the same as shipping a BGS control. */
    assert(D.GRADED_VALUES.every((v) => v === "Raw" || /^PSA /.test(v)), "the offered vocabulary widened");
    /* The grader is not part of which card this is (Batch 5, unchanged). */
    const identity = D.identityFrom({ name: "Charizard" }, { grade: "PSA 9" }, null);
    assert(!("grader" in identity), "a grading company entered card identity");
  });

  test("there is one photograph predicate, for both seats", () => {
    assert(typeof D.INVARIANTS.copyPhotographed === "function", "the predicate exists");
    eq(D.INVARIANTS.binderCopyPhotographed, undefined, "and the duplicate under the old name is gone");
    assert(D.INVARIANTS.copyPhotographed({ front: "a", back: "b" }));
    assert(!D.INVARIANTS.copyPhotographed({ front: "a" }));
    assert(!D.INVARIANTS.copyPhotographed({ back: "b" }));
    assert(!D.INVARIANTS.copyPhotographed(null));
    /* And the partner's side of the deal is still held to it (Batch 6 / B8). */
    assert(/copyPhotographed/.test(code("domain/metyet-commands.js")), "the commands read it");
  });
});

/* ============================================================== F */
describe("F. `offered` did not replace the derived status", () => {

  test("a copy carries both answers, and they mean different things", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const w = await reservedCopy(ctx, cards);
    const stored = await copyOf(ctx, w.copyId);

    eq(stored.offered, true, "the owner is willing");
    assert(!("status" in stored), "and no status was written down beside it");
    eq(D.collectorCopyStatus(w.copyId, (await ctx.repository.loadWorld()).opportunities), "reserved",
      "the deal's answer is still derived, from the deals");
  });

  test("the full derivation still moves: available, reserved, committed, traded", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const opps = async () => (await ctx.repository.loadWorld()).opportunities;

    const fresh = (await own(ctx.app, "casey", { canonicalCardId: cards.unlimited,
      offered: true, photos: PHOTOS })).json().value;
    eq(D.collectorCopyStatus(fresh, await opps()), "available", "nothing holds it");

    const w = await reservedCopy(ctx, cards);
    eq(D.collectorCopyStatus(w.copyId, await opps()), "reserved", "submitted in a package");
    await direct(ctx, ACTOR.north, "reviewTradeCard",
      { oppId: w.oppId, tradeCardId: w.tradeCardId, decision: "accept" });
    eq(D.collectorCopyStatus(w.copyId, await opps()), "committed", "accepted into the trade");
  });

  test("withdrawing an offer does not rewrite a deal's answer", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const w = await reservedCopy(ctx, cards);
    await direct(ctx, ACTOR.north, "reviewTradeCard",
      { oppId: w.oppId, tradeCardId: w.tradeCardId, decision: "accept" });
    eq((await offer(ctx.app, "casey", w.copyId, false)).statusCode, 200, "the owner may still say it");
    eq(D.collectorCopyStatus(w.copyId, (await ctx.repository.loadWorld()).opportunities), "committed",
      "and the deal's hold on the copy is untouched");
    const row = (await ctx.repository.loadWorld()).opportunities
      .find((o) => o.id === w.oppId).trade.cards.find((c) => c.binderId === w.copyId);
    assert(row, "the trade package still names it");
  });

  test("withdrawing an offer does not pull a copy out of the partner's own live deal", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const w = await reservedCopy(ctx, cards);
    const seen = async () => (await get(ctx.app, "north", "/api/view")).json().state.collectorCopies;

    eq((await seen()).find((b) => b.id === w.copyId).status, "reserved", "their own deal's answer");
    await offer(ctx.app, "casey", w.copyId, false);
    const after = (await seen()).find((b) => b.id === w.copyId);
    /* `offered` gates SUPPLY. A copy the partner's own submitted package names
       is not reaching them as supply — it is reaching them as part of a deal
       they are in, which is the projection's older rule and the stronger one:
       a partner who staked a negotiation on a card is never shown a hole where
       their own proposal used to be. Their own deal's answer stays theirs. */
    assert(after, "the copy vanished from a deal the partner is in");
    eq(after.status, "reserved", "and their own deal's answer is unchanged");
    eq(after.offered, false, "though they are told it is no longer on offer");
  });

  test("a copy ANOTHER collector's deal holds still reads only `unavailable`", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const w = await reservedCopy(ctx, cards);
    /* Northline is in that deal; Second is related to nobody, so the rule under
       test is the one about supply, not the one about participation. */
    const second = (await get(ctx.app, "second", "/api/view")).json().state;
    eq(second.collectorCopies.length, 0, "a partner outside the network sees no copies at all");
    assert(!JSON.stringify(second).includes(w.copyId), "not even the id");
  });

  test("an unoffered copy NO partner has named reaches nobody at all", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = (await own(ctx.app, "casey", { canonicalCardId: cards.unlimited, photos: PHOTOS })).json().value;
    const seen = (await get(ctx.app, "north", "/api/view")).json().state.collectorCopies;
    eq(seen.length, 0, "not as supply, not as unavailable, not at all");
    assert(await copyOf(ctx, id), "though it is certainly in the world");
  });
});

/* ============================================================== G */
describe("G. what a partner receives, and what they do not", () => {

  test("the owner sees their own copy whole, including the value they wrote down", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = (await own(ctx.app, "casey", { canonicalCardId: cards.firstEdition, offered: true,
      grade: "PSA 9", cert: "PSA 555", market: 7777, photos: PHOTOS })).json().value;
    const mine = (await get(ctx.app, "casey", "/api/view")).json().state.collectorCopies
      .find((b) => b.id === id);
    eq(mine.market, 7777, "their own reference value");
    eq(mine.grade, "PSA 9");
    eq(mine.cert, "PSA 555");
    eq(mine.offered, true);
    eq(mine.status, "available", "and the server's derived answer");
  });

  test("a related partner receives what a trade needs, and not the Collector's number", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await own(ctx.app, "casey", { canonicalCardId: cards.firstEdition, offered: true,
      grade: "PSA 9", condition: null, cert: "PSA 555", market: 7777, photos: PHOTOS,
      note: "bought at the show, do not sell under 9k" });
    const seen = (await get(ctx.app, "north", "/api/view")).json().state.collectorCopies;
    eq(seen.length, 1, "supply");
    /* `grading` JOINED `status` AS A DERIVED KEY (Phase 5 C3.3).
       What this protected: that a partner receives exactly the copy fields the
       allow-list names plus the server's derived answer, and nothing else —
       above all not the Collector's own reference value or private note.
       Why naming only `status` is no longer correct: what a copy's grade MEANS
       is now decided by the server too, for the reason `status` already was.
       What replaces it, and why it is stricter: the derived key is named, and
       the reading inside it is checked against the same privacy rule — a
       derived field is a new way for a private fact to travel, so it is opened
       and inspected rather than allowed through on the strength of its name. */
    const allowed = new Set([...FIELD_RULES.COLLECTOR_COPY_FOR_PARTNER, "status", "grading"]);
    for (const k of Object.keys(seen[0])) assert(allowed.has(k), `an unclassified field crossed: ${k}`);
    eq(json(Object.keys(seen[0].grading).sort()),
      json(["condition", "grade", "grader", "label", "problem", "state"]),
      "the grading reading is not the shape the domain produces");
    eq(seen[0].grading.label, "PSA 9", "the reading the partner is given");
    eq(seen[0].grading.problem, null, "a sayable copy reported a problem");
    eq(seen[0].canonicalCardId, cards.firstEdition, "which card it is");
    eq(seen[0].grade, "PSA 9", "what the object is");
    eq(seen[0].offered, true, "and that it is on offer");
    assert(!("market" in seen[0]), "the Collector's reference value is theirs");
    assert(!JSON.stringify(seen[0]).includes("do not sell"), "and so is a private note");
    assert(!JSON.stringify(seen).includes("7777"), "the number itself never crossed");
  });

  test("an unrelated partner sees nothing of it, offered or not", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await own(ctx.app, "casey", { canonicalCardId: cards.firstEdition, offered: true,
      cert: "PSA 555", market: 7777, photos: PHOTOS });
    const seen = (await get(ctx.app, "second", "/api/view")).json().state;
    eq(seen.collectorCopies.length, 0, "no copies");
    eq(seen.collectors.length, 0, "and no Collector to attach them to");
    assert(!JSON.stringify(seen).includes("PSA 555"), "nothing of the copy at all");
  });

  test("another Collector's copy is not in a Collector's own view", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await own(ctx.app, "dana", { canonicalCardId: cards.unlimited, offered: true, cert: "DANA-CERT" });
    const casey = (await get(ctx.app, "casey", "/api/view")).json().state;
    eq(casey.collectorCopies.length, 0, "a Collector's shelf is their own");
    assert(!JSON.stringify(casey).includes("DANA-CERT"));
  });

  test("the projection's own rule names `offered` and still refuses `market`", () => {
    const rule = FIELD_RULES.COLLECTOR_COPY_FOR_PARTNER;
    for (const field of ["id", "collectorId", "canonicalCardId", "grade", "condition",
      "offered", "photos", "cert"]) {
      assert(rule.includes(field), `${field} is missing from the partner's allow-list`);
    }
    assert(!rule.includes("market"), "the Collector's reference value is on the allow-list");
    assert(!rule.includes("note"), "a private note is on the allow-list");
    /* It is an allow-list, not a deny-list: that is what makes an unclassified
       field private by default. */
    assert(/const COLLECTOR_COPY_FOR_PARTNER = \[/.test(read("domain/metyet-projection.js")),
      "the rule stopped being a list of what may cross");
  });
});

/* ============================================================== H */
describe("H. the doors this batch opened, and no others", () => {

  /* SUPERSEDED AND RESTATED (Phase 5 C3.3).

     What this protected: that C2 opened exactly three doors and no fourth
     arrived unnamed alongside them — the list is edited on purpose, by whoever
     ships the surface, in the same change that ships it.

     Why the number nine is no longer correct: C3.3 ships the Card
     Specification panel, which is the surface five written-and-waiting commands
     were waiting for. `updateCollectorCopy` is C2's own deferred one, and C2
     said in this file that it would join "in the batch that gives it a screen".

     What replaces it, and why it is stricter: the exact set is still pinned by
     VALUE and by count, C2's three are still named as C2's, and the five are
     named with the batch that opened them — so this test still fails the moment
     a tenth, or a fifteenth, arrives without somebody writing it down. */
  test("the exact exposed production command set, C2's three among them", () => {
    eq(json([...EXPOSED_COMMANDS].sort()), json([
      "updatePartnerProfile", "revokeCollectorInvitation",
      "addGoal", "updateGoalTier", "removeGoal",
      "addInventoryCopy",
      /* C2 — three, and the whole of the concept. */
      "addCollectorCopy", "setCollectorCopyOffered", "removeCollectorCopy",
      /* C3.3 — the Card Specification panel's five. */
      "createBinder", "addBinderEntry", "removeBinderEntry",
      "updateCollectorCopy", "updateGoalCriteria",
      /* C3.4b — managing a binder as an object, now that there is a screen. */
      "renameBinder", "setBinderArchived",
      /* AND THE TWO C5 ADDED (Phase 5 C5). `updateInventoryCopy` and
         `removeInventoryCopy` were written and tested in Batch 6 and shipped
         without a screen; C5 gives them one, so a shop can correct a typo and
         take a sold copy off its shelf. They are listed here because this pin
         reads the LIVE allow-list — it is a statement about the product's
         surface today, not a fossil of the batch that wrote it. */
      "updateInventoryCopy", "removeInventoryCopy",
    ].sort()), "the production surface is not what this batch declared");
    eq(EXPOSED_COMMANDS.length, 18, "and nothing arrived unnamed");
  });

  test("every exposed name is a real command, and the client sends exactly these", () => {
    const table = new Set(C.COMMAND_NAMES);
    for (const name of EXPOSED_COMMANDS) assert(table.has(name), `${name} is not a command`);
    const client = read("client/commands.js");
    for (const name of EXPOSED_COMMANDS) {
      assert(client.includes(`"${name}"`), `${name} is exposed but nothing in client/ sends it`);
    }
  });

  /* SUPERSEDED AND RESTATED (Phase 5 C3.3).

     What this protected: that a command with no surface is not shipped. C2 wrote
     `updateCollectorCopy`, tested it, and left the door shut, saying here that
     it would join the product "in the batch that gives it a screen".

     Why it is no longer correct: C3.3 is that batch. The Card Specification
     panel shows a copy's grade, condition, certificate and reference value, and
     a screen that shows them while refusing to change them would be worse than
     one that showed nothing. It is also the only way to correct a copy written
     before C3.2 that says both PSA 9 and Damaged.

     What replaces it, and why it is stricter: the door is open, so what is
     asserted now is that the RULES behind it did not move with it — the wrong
     seat, a non-owner, an immutable identity and a smuggled `offered` are all
     still refused, over HTTP, which is a stronger statement than "nobody can
     reach it". */
  test("editing a copy is reachable now, and every rule behind it still holds", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    assert(C.COMMAND_NAMES.includes("updateCollectorCopy"), "the command exists");
    assert(EXPOSED_COMMANDS.includes("updateCollectorCopy"), "C3.3 gave it a screen");
    const id = (await own(ctx.app, "casey", { canonicalCardId: cards.firstEdition,
      grade: "PSA 9", cert: "PSA 1" })).json().value;

    /* It works, for its owner. */
    const ok = await post(ctx.app, "casey", "updateCollectorCopy", { copyId: id, patch: { cert: "PSA 2" } });
    eq(ok.statusCode, 200);
    eq((await copyOf(ctx, id)).cert, "PSA 2");

    /* And the rules are where they were. */
    const wrongSeat = await post(ctx.app, "north", "updateCollectorCopy",
      { copyId: id, patch: { cert: "PSA 3" } });
    eq(wrongSeat.json().error.refused, "not-owner", "a partner edited a Collector's copy");
    const other = await post(ctx.app, "dana", "updateCollectorCopy",
      { copyId: id, patch: { cert: "PSA 3" } });
    eq(other.json().error.refused, "not-owner", "another Collector edited it");
    const moved = await post(ctx.app, "casey", "updateCollectorCopy",
      { copyId: id, patch: { canonicalCardId: cards.unlimited } });
    eq(moved.json().error.refused, "identity-immutable", "a copy was moved to another card");
    const smuggled = await post(ctx.app, "casey", "updateCollectorCopy",
      { copyId: id, patch: { offered: true } });
    eq(smuggled.json().error.refused, "identity-immutable", "offering rode in on an edit");
    eq((await copyOf(ctx, id)).offered, false, "and it did not take effect anyway");
    eq((await copyOf(ctx, id)).cert, "PSA 2", "a refused edit changed something");
  });

  test("no legacy or future command became reachable", async () => {
    const ctx = await world();
    for (const name of ["resolveCardIdentity", "addBinderCopy", "updateBinderCopy",
      "removeBinderCopy", "setInterest", "startOpportunity", "proposeTradeSelection",
      "markBinderReviewed", "addCopyPhotos"]) {
      assert(!EXPOSED_COMMANDS.includes(name), `${name} is exposed`);
      await closedOverHttp(ctx, "casey", name, {});
    }
  });

  test("the old command names are gone from the domain, not merely unexposed", () => {
    const commands = read("domain/metyet-commands.js");
    for (const gone of ["addBinderCopy(state", "updateBinderCopy(state", "removeBinderCopy(state"]) {
      assert(!commands.includes(gone), `${gone} still exists — two names for one concept`);
    }
    for (const here of ["addCollectorCopy(state", "updateCollectorCopy(state",
      "setCollectorCopyOffered(state", "removeCollectorCopy(state"]) {
      assert(commands.includes(here), `${here} is missing`);
    }
  });

  test("a browser cannot name an owner, and cannot smuggle one through the copy", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    /* A payload that claims an actor at the top level is refused by the route
       before any command runs — the Phase 4 rule, unchanged. */
    for (const claim of [{ actor: { collectorId: "c2" } }, { seat: "tp" }, { account: "c2" }]) {
      const res = await post(ctx.app, "casey", "addCollectorCopy",
        { copy: { canonicalCardId: cards.unlimited }, ...claim });
      assert(res.statusCode === 400 || res.statusCode === 409, json(claim) + ": " + res.body);
    }
    eq((await copiesOf(ctx)).length, 0, "and nothing was written");

    /* Buried inside the `copy`, an ownership claim is not refused — it is
       IGNORED, which is the same guarantee arrived at differently and the one
       `addInventoryCopy` has always given: a copy's facts are whatever its
       owner describes, and the owner is the actor. Whatever else rides along
       is a fact about a record nobody else receives: the partner's allow-list
       (COLLECTOR_COPY_FOR_PARTNER) names what may cross, so an invented field
       reaches no other seat. Both halves are asserted, because only the second
       one is a privacy claim. */
    const res = await post(ctx.app, "casey", "addCollectorCopy", { copy: {
      canonicalCardId: cards.unlimited, offered: true, photos: PHOTOS,
      collectorId: "c2", seat: "tp", invented: "SMUGGLED" } });
    eq(res.statusCode, 200, res.body);
    const stored = await copyOf(ctx, res.json().value);
    eq(stored.collectorId, "c1", "the owner is the actor, not the claim");
    const northline = (await get(ctx.app, "north", "/api/view")).json().state;
    assert(!JSON.stringify(northline).includes("SMUGGLED"), "an invented field crossed a seat");
    const seen = northline.collectorCopies.find((b) => b.id === stored.id);
    assert(seen, "the copy is supply");
    assert(!("seat" in seen) && !("invented" in seen), "only classified fields cross");
  });
});

/* ============================================================== I */
describe("I. everything else, exactly as it was", () => {

  test("Goal Primary and Secondary still mean what Batch 7 said", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const goalId = (await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: cards.firstEdition, tier: "secondary", desired: { grade: "PSA 9" } })).json().value;
    const invId = (await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: cards.firstEdition, ask: 9000 } })).json().value;
    eq((await direct(ctx, ACTOR.casey, "startOpportunity", { goalId, invId, amount: 9000 })).refused,
      D.REFUSE.notPrimary, "a deal cannot begin against a watchlist entry");
    assert(!(await post(ctx.app, "casey", "updateGoalTier", { goalId, tier: "primary" })).json().error,
      "promotion is the Collector's own statement");
    assert(!(await direct(ctx, ACTOR.casey, "startOpportunity", { goalId, invId, amount: 9000 })).refused,
      "and then it can");
  });

  test("C1 Browse is unchanged: three doorways, all reads, no command", async () => {
    const ctx = await world();
    await charizard(ctx);
    for (const url of ["/api/card-contexts?query=chari", "/api/expansions", "/api/artists"]) {
      eq((await get(ctx.app, "casey", url)).statusCode, 200, url);
      eq((await ctx.app.inject({ method: "GET", url })).statusCode, 401, `${url} without a token`);
    }
    const browser = code("client/browse/CardBrowser.jsx");
    assert(!EXPOSED_COMMANDS.some((c) => browser.includes(c)), "the shared browser names a command");
  });

  test("TP Inventory is unchanged, and a Collector's copy did not become one", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const invId = (await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: cards.unlimited, ask: 4200, cost: 3000 } })).json().value;
    const copyId = (await own(ctx.app, "casey", { canonicalCardId: cards.unlimited,
      offered: true, market: 4000, photos: PHOTOS })).json().value;
    const w = await ctx.repository.loadWorld();
    eq(w.inventory.length, 1, "one partner copy");
    eq(w.collectorCopies.length, 1, "one collector copy");
    eq(w.inventory[0].invId, invId);
    eq(w.collectorCopies[0].id, copyId, "two collections, two records, no merge");
    /* And the partner's acquisition cost is still the partner's. */
    const casey = (await get(ctx.app, "casey", "/api/view")).json().state;
    assert(!JSON.stringify(casey.inventory).includes("3000"), "cost crossed to a Collector");
  });

  test("Discovery is still exact, still computed, and still ignores an unoffered copy's owner", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await post(ctx.app, "casey", "addGoal", { canonicalCardId: cards.firstEdition, tier: "primary", desired: { grade: "PSA 9" } });
    await post(ctx.app, "north", "addInventoryCopy", { copy: { canonicalCardId: cards.shadowless, ask: 1 } });
    eq((await get(ctx.app, "casey", "/api/view")).json().state.discoveries.length, 0,
      "a different printing is a different card");
    await post(ctx.app, "north", "addInventoryCopy", { copy: { canonicalCardId: cards.firstEdition, ask: 9000 } });
    const found = (await get(ctx.app, "casey", "/api/view")).json().state.discoveries;
    eq(found.length, 1, "the exact card is an overlap");
    eq(found[0].canonicalCardId, cards.firstEdition);
    const stored = await ctx.repository.loadWorld();
    assert(!("discoveries" in stored), "and it was not written down");
  });

  test("invitation and relationship authorization is untouched", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    await own(ctx.app, "casey", { canonicalCardId: cards.firstEdition, offered: true, photos: PHOTOS });
    /* Second has no relationship with Casey, and an invitation is not one. */
    const invited = await post(ctx.app, "second", "inviteCollector", { recipient: "Casey" });
    eq(invited.statusCode, 409, "inviteCollector has no production surface either");
    eq((await get(ctx.app, "second", "/api/view")).json().state.collectorCopies.length, 0,
      "and nothing about Casey's cards reached them");
  });

  /* CORRECTED IN C2.1. This test was called "touched one table", and it was not
     true: 0011 alters `collector_copies` AND `opportunity_trade_refs`, on
     purpose — without the second, a canonical Collector copy could never enter
     a trade package (see the migration's own header). The old assertion passed
     only because its regex happened to omit the table it should have named,
     which is the worst way for a scope test to pass. It now names the two
     tables C2 is allowed to touch, and refuses every other one by listing them,
     so the next batch to widen the migration has to widen this line too. */
  test("the C2 migrations touch exactly the two tables they say they do", () => {
    /* `binder_copies` and `collector_copies` are the same table either side of
       the rename statement, so the old name collapses into the new one — the
       question here is which OBJECTS the migration reaches, not how many names
       they have had. */
    const tables = (sql) => [...sql.matchAll(/\balter table\s+metyet\.(\w+)/g)].map((m) => m[1])
      .concat([...sql.matchAll(/\bupdate\s+metyet\.(\w+)/g)].map((m) => m[1]))
      .map((t) => (t === "binder_copies" ? "collector_copies" : t));

    const rename = read("persistence/migrations/0011_collector_copies.sql").replace(/^--.*$/gm, "");
    assert(/binder_copies rename to collector_copies/.test(rename), "the rename is missing");
    eq([...new Set(tables(rename))].sort().join(","), "collector_copies,opportunity_trade_refs",
      "0011 touched a table it does not declare");
    /* `offered` costs no column: a fact about the record lives with the record. */
    assert(!/add column offered/i.test(rename), "offered became a column");

    /* C2.1's backfill touches one table and writes one key. */
    const backfill = read("persistence/migrations/0012_collector_copy_offered_backfill.sql")
      .replace(/^--.*$/gm, "");
    eq([...new Set(tables(backfill))].sort().join(","), "collector_copies",
      "0012 touched a table it does not declare");
    assert(/attrs -> 'offered' is null/.test(backfill),
      "0012 must touch only rows where `offered` is ABSENT — an explicit false is a decision");

    /* And neither one reaches the collections other batches own. */
    for (const sql of [rename, backfill]) {
      assert(!/metyet\.goals|inventory_copies|metyet\.conversations|metyet\.interests/.test(sql),
        "a C2 migration reached a table another batch owns");
    }
  });

  test("a full world built through C2's commands still validates and round-trips", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const w = await reservedCopy(ctx, cards);
    await own(ctx.app, "casey", { canonicalCardId: cards.unlimited });
    await own(ctx.app, "dana", { canonicalCardId: cards.shadowless, offered: true });

    const stored = await ctx.repository.loadWorld();
    const r = validateWorld(stored);
    assert(r.ok, json(r.errors));
    const round = JSON.parse(JSON.stringify(stored));
    assert(validateWorld(round).ok, "a persisted copy validates");
    for (const actor of [ACTOR.casey, ACTOR.dana, ACTOR.north, ACTOR.second]) {
      eq(json(projectForActor(round, actor)), json(projectForActor(stored, actor)),
        "and projects identically for " + json(actor));
    }
    assert(w.copyId, "the deal's copy is in there");
  });

  /* RESTATED IN C3.1, WHICH IS THE BATCH THAT BUILT THEM.

     WHAT IT PROTECTED: that C2 did not quietly begin C3 — no Binder table, no
     Binder command, no Binder section, nothing waiting in the navigation.

     WHY THE OLD WORDING IS NO LONGER CORRECT: `binders` and `binderEntries`,
     their five commands and migration 0013 now exist, by their own batch and
     their own migration. "Do not exist yet" was true of the world C2 shipped
     into and is false of this one; keeping it would mean C3.1 could only pass
     by deleting its own subject.

     WHAT REPLACES IT, AND WHY IT IS STRICTER: the property C2 actually owned
     was never "binders are impossible" — it was that C2 SHIPPED NO SURFACE for
     them. That is now asserted directly and it still holds: C3.1 built the
     durable concept and deliberately shipped no screen and no open door, so a
     person still cannot reach a Binder. The navigation check is unchanged, and
     two new ones are added — no Binder command is exposed to production, and
     C2's own migrations create no Binder table. The old file-name check
     degenerated into "nobody named a file Binder"; naming the door is better. */
  /* SUPERSEDED AND RESTATED (Phase 5 C3.4b).

     What this protected: that no Binder surface existed, so the Binder
     commands C2 and C3.1 wrote could not be reached from a browser.

     Why it is no longer correct: C3.4b ships `sections/Binder.jsx` and puts
     Binder in the Collector's navigation, on purpose. "No file is named
     Binder" and "no Binder is in the navigation" are C2's and C3.1's facts,
     not the product's.

     What replaces it, and why it is stricter: those facts are now asserted
     against C2's OWN commit, where they are permanently true and where no
     later batch can erase them by shipping the surface the roadmap always
     intended. A live reading could only ever be deleted; a reading of
     `4095a95` cannot. */
  test("C2 itself shipped no Binder surface", () => {
    const { execFileSync } = require("child_process");
    const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" });
    const at2 = git("ls-tree", "--name-only", "4095a95", "client/collector/sections/");
    assert(!/Binder/i.test(at2), "C2 shipped a Binder section: " + at2);

    /* C2's OWN migrations create no binder table. 0013 does, and is C3.1's. */
    for (const m of ["0011_collector_copies.sql", "0012_collector_copy_offered_backfill.sql"]) {
      const sql = read(`persistence/migrations/${m}`).replace(/^--.*$/gm, "");
      assert(!/create table metyet\.binders?\b/.test(sql), `${m} created a Binder table`);
    }

    /* SUPERSEDED IN PART, AND RESTATED (Phase 5 C3.3).

       What this protected: that the Binder commands C3.1 wrote were not
       reachable from a browser, because C3.1 shipped no surface for them.

       Why it is no longer correct for all five: C3.3 ships the Card
       Specification panel, where a Collector files THIS card — so creating a
       binder and changing this card's membership of one are reachable now, on
       purpose, and named in exposed-commands.js.

       What replaces it, and why it is stricter: the line is drawn where the
       surface actually is. C3.3 lets a person say where the card in front of
       them belongs; managing binders AS OBJECTS — renaming one, putting one
       away — is C3.4's surface and stays shut. Naming which two are still
       closed is a sharper statement than "all of them are".

       SUPERSEDED AGAIN AND RESTATED (Phase 5 C3.4b). C3.4b built that surface:
       a Binder library where one is renamed in place and put away or brought
       back. `STILL_C34` is therefore empty — the batch it named has arrived
       and opened both. What replaces the pin is not weaker: the Binder command
       TABLE is still pinned exactly, so a sixth Binder command cannot appear
       unnamed; and `markBinderReviewed` — excluded from the table above because
       it is the legacy "a partner opened this Collector's cards" command and
       has nothing to do with a Binder but its name — is now asserted shut here
       by name, which the old wording never did. */
    const table = C.COMMAND_NAMES.filter((n) => /binder/i.test(n) && n !== "markBinderReviewed");
    assert(table.length > 0, "the Binder commands vanished");
    const OPENED_BY_C33 = ["createBinder", "addBinderEntry", "removeBinderEntry"];
    const OPENED_BY_C34 = ["renameBinder", "setBinderArchived"];
    const STILL_C34 = [];
    eq(json(table.slice().sort()), json([...OPENED_BY_C33, ...OPENED_BY_C34, ...STILL_C34].sort()),
      "a Binder command arrived or left without being named here");
    eq(STILL_C34.length, 0, "C3.4 arrived; nothing is waiting for it");
    for (const name of [...OPENED_BY_C33, ...OPENED_BY_C34]) {
      assert(EXPOSED_COMMANDS.includes(name), `${name} lost its surface`);
    }
    assert(!EXPOSED_COMMANDS.includes("markBinderReviewed"),
      "markBinderReviewed is exposed; it is not a Binder command");

    /* Read the NAVIGATION itself, not its file's text: C2's shell says "Trade
       Binder" in prose, describing the idea the product was moving away from,
       and a regex over the whole source cannot tell that apart from a
       destination. So the two frozen section lists are cut out of C2's own
       source and read on their own. */
    const shellAt2 = git("show", "4095a95:client/collector/CollectorShell.jsx");
    const listsAt2 = ["SECTIONS = Object.freeze([", "DEFERRED_SECTIONS = Object.freeze(["]
      .map((start) => {
        const from = shellAt2.indexOf(start);
        assert(from >= 0, `C2's shell has no ${start}`);
        const body = shellAt2.slice(from + start.length);
        return body.slice(0, body.indexOf("]);"));
      });
    for (const list of listsAt2) {
      assert(!/binder/i.test(list.replace(/\/\*[\s\S]*?\*\//g, "")),
        "C2's navigation held a Binder");
    }
  });
});

run();
