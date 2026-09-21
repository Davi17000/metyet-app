/* ============================================================================
   PHASE 5 C2.1 — COLLECTOR COPY FOUNDATION CORRECTIONS

   Three things C2 got wrong, and the regressions that keep them fixed.

   C2 separated owning a card from offering it, which was right. It then made
   three mistakes at the seams of that separation, each of which is the same
   mistake in a different place: LETTING AN ABSENCE STAND IN FOR AN ANSWER.

     A. the silent unoffering   a row written before C2 has no `offered` key,
                                so it loaded as `undefined`, and `undefined !==
                                true` — every Collector's existing trade supply
                                quietly stopped being supply on deploy, with no
                                command, no log and no error to say so. The
                                absence was doing the work of `false` without
                                anybody having said it.

     B. the signal you could not put down
                                Interest was gated on the copy being offered —
                                in BOTH directions. So when a Collector withdrew
                                an offer, the partner who had pulled that card
                                aside could no longer un-pull it, and the
                                Collector went on seeing interest in a card they
                                had taken off the table. The only cure was to
                                re-offer the card they had just decided not to.

     C. the queue behind a closed door
                                Nothing stopped a partner registering NEW
                                interest in a copy already reserved or committed
                                inside somebody's active deal, or already
                                traded away. Interest does not reserve a copy
                                and must not start to — but it also must not
                                record a signal the product cannot honour.

   D. and the scope claim       a test named "migration touched one table" for a
                                migration that touches two on purpose.

   The governing rule for all of it: canonical state describes durable truth.
   `offered` is the owner's willingness; deal availability is derived from the
   opportunities; Interest is a partner considering an offered copy. None of
   them may stand in for another.
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
const D = require("../domain/metyet-domain.js");
const RT = require("../domain/metyet-runtime.js");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const json = (v) => JSON.stringify(v);

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

const SUBJECT = { north: "sub-north", second: "sub-second", casey: "sub-casey" };
const ACTOR = { casey: { collectorId: "c1" }, north: { partnerId: "p1" }, second: { partnerId: "p2" } };

/* Casey knows Northline and does not know Second. One LEGACY catalogue card,
   because section A is about rows from a world that only had those. */
async function world() {
  const pg = database();
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  const runtime = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 1000 });
  const repository = createWorldRepository(db);
  const catalog = createCatalogRepository(db, { newId: runtime.newId });
  await repository.saveWorld({
    catalog: [{ id: "k1", name: "Charizard", set: "Base", num: "4/102" }],
    collectors: [{ id: "c1", name: "Casey" }],
    partners: [{ id: "p1", name: "Northline" }, { id: "p2", name: "Second" }],
    relationships: [{ partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" }],
    invitations: [], goals: [], inventory: [], collectorCopies: [], interests: [],
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
  })) {
    made[name] = (await ctx.catalog.putCanonicalCard({ cardContextId, ...dimensions })).canonicalCardId;
  }
  return made;
}

const post = (app, token, command, payload) => app.inject({ method: "POST", url: "/api/commands",
  headers: { authorization: `Bearer ${token}` }, payload: { command, payload } });
const get = (app, token, url) => app.inject({ method: "GET", url,
  headers: { authorization: `Bearer ${token}` } });
const own = (app, token, copy) => post(app, token, "addCollectorCopy", { copy });
const offer = (app, token, copyId, offered) =>
  post(app, token, "setCollectorCopyOffered", { copyId, offered });
const copiesOf = async (ctx) => (await ctx.repository.loadWorld()).collectorCopies;
const copyOf = async (ctx, id) => (await copiesOf(ctx)).find((b) => b.id === id);
const interestsOf = async (ctx) => (await ctx.repository.loadWorld()).interests;

/* `setInterest` has no production surface (it is not on the allow-list), so it
   is exercised past the door — through the same transaction, the same advisory
   lock and the same validateWorld the route would use. */
const direct = (ctx, actor, command, payload) =>
  executeCommand(ctx.repository, { actor, command, payload, runtime: ctx.runtime });
const interest = (ctx, actor, copyId, on) => direct(ctx, actor, "setInterest", { binderId: copyId, on });

const PHOTOS = { front: "copy:front", back: "copy:back" };

/* WRITING A ROW AS IT EXISTED BEFORE C2.

   Not a simulation of one — the actual shape. Before C2 a Collector's copy was
   a `binder_copies` row whose `attrs` held its facts and whose existence WAS
   the offer; there was no `offered` key because there was no such concept.
   Migration 0011 renames the table, so after it this is exactly what such a row
   looks like: same id, same attrs, no `offered`. It is inserted with raw SQL on
   purpose — the repository cannot write it, because the repository only ever
   writes worlds the domain produced, and the domain has not produced one of
   these since C2. That is precisely why the migration has to reach them. */
const insertLegacyCopy = (ctx, id = "b-legacy") => ctx.pg.exec(
  `insert into metyet.collector_copies (id, collector_id, card_id, canonical_card_id, ord, attrs)
   values ('${id}', 'c1', 'k1', null, 0, '{"cardId":"k1","cert":"PSA 70551201","market":900,`
   + `"photos":{"front":"binder:k1:front","back":"binder:k1:back"},"addedAt":"2029-03-04"}'::jsonb)`);

/* ============================================================== A */
describe("A. a copy that existed before C2 still means what it meant", () => {

  test("the backfill is its own migration, because an edited one is refused", () => {
    const versions = readMigrations().map((m) => m.version);
    assert(versions.includes("0012_collector_copy_offered_backfill"), "the backfill migration is missing");
    assert(versions.indexOf("0012_collector_copy_offered_backfill")
      > versions.indexOf("0011_collector_copies"), "the backfill must run after the rename");
    /* migrate.js records each file's SHA-256 and refuses one that changed after
       it ran, so correcting 0011 in place would never reach an environment that
       had already applied it. A new file runs everywhere, once, in order. */
    assert(/checksum/.test(read("persistence/migrate.js")), "the runner stopped checksumming");
  });

  /* THE REAL UPGRADE, NOT A SIMULATION OF ONE. The database is migrated only as
     far as 0011 — the exact state a deployment of C2 would be in — the legacy
     row is written into it, and then the runner is asked to bring the schema up
     to date. 0012 applies the way it will apply in production, in order, once,
     under the same lock. */
  test("a legacy trade-supply row migrates to offered === true", async () => {
    const pg = new PGlite();
    await pg.exec("drop schema if exists metyet cascade");
    const db = fromPGlite(pg);
    const all = readMigrations();
    const throughC2 = all.filter((m) => m.version <= "0011_collector_copies");
    const upgrade = await migrate(db, { migrations: throughC2 });
    assert(!upgrade.applied.includes("0012_collector_copy_offered_backfill"),
      "the backfill ran before the world that needs it existed");

    /* The parents a pre-C2 world would already have had. The foreign key is
       still named `binder_copies_collector_fk` — constraint names follow a
       renamed table, which is harmless and is part of why 0011 could rename
       without moving data. */
    await pg.exec(`insert into metyet.collectors (id, ord, attrs) values ('c1', 0, '{}'::jsonb);
      insert into metyet.catalog_cards (id, ord, attrs)
        values ('k1', 0, '{"name":"Charizard"}'::jsonb);
      insert into metyet.collector_copies (id, collector_id, card_id, ord, attrs)
        values ('b-legacy', 'c1', 'k1', 0, '{"cardId":"k1","cert":"PSA 70551201"}'::jsonb)`);
    const before = await pg.query("select attrs from metyet.collector_copies where id = 'b-legacy'");
    assert(!("offered" in before.rows[0].attrs), "the fixture already had an `offered`");

    const run = await migrate(db, { migrations: all });
    eq(run.applied.join(","), "0012_collector_copy_offered_backfill",
      "the upgrade applied something other than the backfill");
    const after = await pg.query("select attrs from metyet.collector_copies where id = 'b-legacy'");
    eq(after.rows[0].attrs.offered, true, "a row whose existence WAS the offer stays an offer");
  });

  test("and it is still visible to the same Trusted Partner, under the same authorization", async () => {
    const ctx = await world();
    await insertLegacyCopy(ctx);
    await backfill(ctx);

    const w = await ctx.repository.loadWorld();
    const north = projectForActor(w, ACTOR.north);
    eq(north.collectorCopies.length, 1, "the partner who could see it before still can");
    eq(north.collectorCopies[0].id, "b-legacy", "the same record, by id");
    eq(north.collectorCopies[0].status, "available", "as supply");

    /* The authorization did not loosen to achieve it. */
    const second = projectForActor(w, ACTOR.second);
    eq(second.collectorCopies.length, 0, "a partner outside the network still sees nothing");
    assert(!json(second).includes("PSA 70551201"), "not even the certificate");
    /* And the Collector's private figure still does not cross. */
    assert(!json(north).includes("900"), "the owner's reference value crossed");
  });

  test("the bug this replaces: without the backfill the partner's supply vanishes", async () => {
    const ctx = await world();
    await insertLegacyCopy(ctx);
    /* Read the world BEFORE the backfill, exactly as C2 shipped it. This is the
       regression itself, stated as a test so nobody reintroduces it: an absent
       key silently read as "not offered". */
    const rows = await ctx.pg.query("select attrs from metyet.collector_copies where id = 'b-legacy'");
    const asC2LoadedIt = { ...rows.rows[0].attrs, id: "b-legacy", collectorId: "c1" };
    eq(typeof asC2LoadedIt.offered, "undefined", "the shape that caused it");
    eq(asC2LoadedIt.offered === true, false, "and `undefined !== true` is what unoffered it");

    await backfill(ctx);
    const fixed = await copyOf(ctx, "b-legacy");
    eq(fixed.offered, true, "the correction");
  });

  test("the backfill changes nothing a person actually said", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const quiet = (await own(ctx.app, "casey", { canonicalCardId: cards.firstEdition })).json().value;
    const loud = (await own(ctx.app, "casey",
      { canonicalCardId: cards.shadowless, offered: true })).json().value;
    eq((await copyOf(ctx, quiet)).offered, false);

    await backfill(ctx);
    eq((await copyOf(ctx, quiet)).offered, false, "an explicit false is a decision and is left alone");
    eq((await copyOf(ctx, loud)).offered, true, "an explicit true is left alone too");

    /* Idempotent: running it twice is running it once. */
    const before = json(await copiesOf(ctx));
    await backfill(ctx);
    eq(json(await copiesOf(ctx)), before, "re-running the backfill moved something");
  });
});

/* The backfill statement, applied on demand. `migrate` will not re-run a file
   it has recorded, so a test that wants to watch the correction happen runs the
   file's own SQL — read from the file, never retyped, so the test cannot drift
   from what ships. */
const backfill = (ctx) => ctx.pg.exec(
  read("persistence/migrations/0012_collector_copy_offered_backfill.sql"));

/* ============================================================== B */
describe("B. `offered` is a boolean, and absence is not an answer", () => {

  test("a canonical copy with no `offered` is refused by validateWorld", async () => {
    const ctx = await world();
    const w = await ctx.repository.loadWorld();
    w.collectorCopies = [{ id: "bx", collectorId: "c1", cardId: "k1", photos: PHOTOS }];
    const r = validateWorld(w);
    assert(!r.ok, "a world that says nothing about offering was accepted");
    const hit = r.errors.find((e) => e.code === "field.invalid" && /offered/.test(e.path));
    assert(hit, json(r.errors));
    assert(/separate facts/.test(hit.message), "the message does not explain the rule: " + hit.message);
  });

  test("undefined, null and every tri-state are refused the same way", async () => {
    const ctx = await world();
    const base = await ctx.repository.loadWorld();
    for (const value of [undefined, null, "", "true", "yes", 0, 1, {}, []]) {
      const w = { ...base, collectorCopies: [
        { id: "bx", collectorId: "c1", cardId: "k1", offered: value }] };
      const r = validateWorld(w);
      assert(!r.ok && r.errors.some((e) => e.code === "field.invalid" && /offered/.test(e.path)),
        `offered: ${json(value)} was accepted`);
    }
    for (const value of [true, false]) {
      const w = { ...base, collectorCopies: [
        { id: "bx", collectorId: "c1", cardId: "k1", offered: value }] };
      assert(validateWorld(w).ok, `offered: ${value} was refused`);
    }
  });

  test("the repository refuses to save such a world, before a single statement", async () => {
    const ctx = await world();
    const w = await ctx.repository.loadWorld();
    w.collectorCopies = [{ id: "bx", collectorId: "c1", cardId: "k1" }];
    let refused = null;
    try { await ctx.repository.saveWorld(w); } catch (e) { refused = e; }
    assert(refused, "an ambiguous world was persisted");
    assert(/offered/.test(refused.message), refused.message);
    eq((await copiesOf(ctx)).length, 0, "and nothing was written");
  });

  test("a new copy defaults to false, explicitly, and survives a round trip", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = (await own(ctx.app, "casey",
      { canonicalCardId: cards.firstEdition, cert: "PSA 4242" })).json().value;

    const stored = await copyOf(ctx, id);
    eq(stored.offered, false, "owning is the base fact");
    eq(typeof stored.offered, "boolean", "and it is stated, not merely absent");

    /* Through the database and back: the key is really on the row, not a
       default something applies on read. */
    const raw = await ctx.pg.query("select attrs from metyet.collector_copies where id = $1", [id]);
    eq(raw.rows[0].attrs.offered, false, "the explicit false reached the JSONB");

    const reloaded = await ctx.repository.loadWorld();
    eq(reloaded.collectorCopies[0].offered, false, "and came back");
    assert(validateWorld(reloaded).ok, "and the reloaded world validates");

    /* And once offered, the same round trip holds for true. */
    await offer(ctx.app, "casey", id, true);
    const again = await ctx.pg.query("select attrs from metyet.collector_copies where id = $1", [id]);
    eq(again.rows[0].attrs.offered, true, "true reached the JSONB too");
  });
});

/* ============================================================== C */
describe("C. putting a card down is not the same act as picking it up", () => {

  test("a partner can withdraw Interest after the Collector unoffers the copy", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = (await own(ctx.app, "casey",
      { canonicalCardId: cards.firstEdition, offered: true, photos: PHOTOS })).json().value;

    const on = await interest(ctx, ACTOR.north, id, true);
    assert(!on.refused, "Northline could not express interest: " + json(on));
    eq((await interestsOf(ctx)).length, 1, "one interest");

    eq((await offer(ctx.app, "casey", id, false)).statusCode, 200, "Casey takes it off the table");

    const off = await interest(ctx, ACTOR.north, id, false);
    assert(!off.refused, "withdrawal was refused: " + json(off));
    eq((await interestsOf(ctx)).length, 0, "and the signal is gone");
    /* The copy is untouched: withdrawal removes a partner's signal, not a card. */
    const copy = await copyOf(ctx, id);
    assert(copy, "the copy was removed");
    eq(copy.offered, false, "and its owner's answer is still their own");
  });

  test("a partner cannot create new Interest in an unoffered copy", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = (await own(ctx.app, "casey",
      { canonicalCardId: cards.firstEdition, photos: PHOTOS })).json().value;
    eq((await copyOf(ctx, id)).offered, false, "never offered");

    const r = await interest(ctx, ACTOR.north, id, true);
    /* `not-found`: a copy the partner may not see does not exist for them, and
       a refusal that told them apart would be the leak. */
    eq(r.refused, D.REFUSE.notFound, "an unoffered copy accepted new interest");
    eq((await interestsOf(ctx)).length, 0, "and nothing was written");
  });

  test("nor after the Collector unoffers one it had been interested in and withdrew from", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = (await own(ctx.app, "casey",
      { canonicalCardId: cards.firstEdition, offered: true, photos: PHOTOS })).json().value;
    await interest(ctx, ACTOR.north, id, true);
    await offer(ctx.app, "casey", id, false);
    await interest(ctx, ACTOR.north, id, false);

    const again = await interest(ctx, ACTOR.north, id, true);
    eq(again.refused, D.REFUSE.notFound, "interest could be re-created on an unoffered copy");
    eq((await interestsOf(ctx)).length, 0);

    /* Re-offer, and it is available again — the record never went anywhere. */
    await offer(ctx.app, "casey", id, true);
    assert(!(await interest(ctx, ACTOR.north, id, true)).refused, "re-offering did not restore it");
    eq((await interestsOf(ctx)).length, 1);
  });

  test("withdrawal still needs a current relationship, and the right seat", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = (await own(ctx.app, "casey",
      { canonicalCardId: cards.firstEdition, offered: true, photos: PHOTOS })).json().value;
    await interest(ctx, ACTOR.north, id, true);

    eq((await interest(ctx, ACTOR.second, id, false)).refused, D.REFUSE.noRelationship,
      "a partner outside the network reached into the interest model");
    eq((await direct(ctx, ACTOR.casey, "setInterest", { binderId: id, on: false })).refused,
      D.REFUSE.notOwner, "a Collector withdrew a partner's interest");
    eq((await interestsOf(ctx)).length, 1, "Northline's interest is untouched");
  });

  test("withdrawing interest nobody expressed is a no-op, not an error", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = (await own(ctx.app, "casey",
      { canonicalCardId: cards.firstEdition, photos: PHOTOS })).json().value;
    const r = await interest(ctx, ACTOR.north, id, false);
    assert(!r.refused, "an unoffered copy the partner never touched refused a no-op: " + json(r));
    eq((await interestsOf(ctx)).length, 0);
  });
});

/* ============================================================== D
   WHAT THE EXISTING STATUS MODEL ALREADY MEANT, AND WHAT C2.1 ADDED.

   `collectorCopyStatus(copyId, opportunities)` is derived, never stored. It
   reads every opportunity's trade package and answers for one exact physical
   copy: `available`, `reserved` (named in a submitted package), `committed`
   (accepted into a live trade) or `traded` (that deal completed).

   The PROJECTION already used it to decide what a partner may see, and did so
   correctly: an uninvolved partner receives nothing at all for a copy another
   deal holds, so they could not see it to act on it. What C2 did NOT have was
   the same rule at the COMMAND, and a command is not allowed to depend on a
   screen — a partner holding an id could still register interest in a copy the
   product had already promised elsewhere.

   C2.1 asks the same derived question in `setInterest`, for CREATION only. No
   new state, no second source of truth, and Interest still reserves nothing:
   this is the other direction, a copy a deal is holding refusing new signals. */
describe("D. Interest does not reserve a copy, and a held copy takes no new Interest", () => {

  /* A Collector's copy inside a live trade package, built through the real
     negotiation commands so the status under test is the real derivation. */
  async function reserved(ctx, cards) {
    const invId = (await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: cards.firstEdition, ask: 9000 } })).json().value;
    const goalId = (await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: cards.firstEdition, tier: "primary" })).json().value;
    const copyId = (await own(ctx.app, "casey", { canonicalCardId: cards.shadowless,
      offered: true, photos: PHOTOS, market: 3000 })).json().value;
    const oppId = (await direct(ctx, ACTOR.casey, "startOpportunity", { goalId, invId, amount: 9000 })).value;
    assert(!(await direct(ctx, ACTOR.north, "acceptPrice", { oppId })).refused, "acceptPrice");
    assert(!(await direct(ctx, ACTOR.casey, "proposeTradeSelection",
      { oppId, binderIds: [copyId] })).refused, "proposeTradeSelection");
    const w = await ctx.repository.loadWorld();
    const row = w.opportunities.find((o) => o.id === oppId).trade.cards.find((c) => c.binderId === copyId);
    return { copyId, oppId, tradeCardId: row.id };
  }

  test("expressing Interest reserves nothing — the status does not move", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const id = (await own(ctx.app, "casey",
      { canonicalCardId: cards.firstEdition, offered: true, photos: PHOTOS })).json().value;
    const before = D.collectorCopyStatus(id, (await ctx.repository.loadWorld()).opportunities);
    assert(!(await interest(ctx, ACTOR.north, id, true)).refused);
    const after = D.collectorCopyStatus(id, (await ctx.repository.loadWorld()).opportunities);
    eq(before, "available");
    eq(after, "available", "Interest started to reserve the copy");
    eq((await ctx.repository.loadWorld()).opportunities.length, 0, "and it created no deal");
  });

  test("a copy reserved in an active deal takes no new Interest", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const { copyId } = await reserved(ctx, cards);
    eq(D.collectorCopyStatus(copyId, (await ctx.repository.loadWorld()).opportunities), "reserved");

    const r = await interest(ctx, ACTOR.north, copyId, true);
    eq(r.refused, D.REFUSE.copyUnavailable, "a copy a deal is holding accepted new interest");
    eq((await interestsOf(ctx)).length, 0, "and nothing was written");
  });

  test("nor a committed one, nor one already traded away", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const { copyId, oppId, tradeCardId } = await reserved(ctx, cards);
    assert(!(await direct(ctx, ACTOR.north, "reviewTradeCard",
      { oppId, tradeCardId, decision: "accept" })).refused, "reviewTradeCard");
    eq(D.collectorCopyStatus(copyId, (await ctx.repository.loadWorld()).opportunities), "committed");
    eq((await interest(ctx, ACTOR.north, copyId, true)).refused, D.REFUSE.copyUnavailable);
  });

  test("but Interest expressed BEFORE the deal can still be withdrawn", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    /* Interest first, while the copy is plainly available. */
    const copyId = (await own(ctx.app, "casey", { canonicalCardId: cards.shadowless,
      offered: true, photos: PHOTOS, market: 3000 })).json().value;
    assert(!(await interest(ctx, ACTOR.north, copyId, true)).refused, "the interest");
    eq((await interestsOf(ctx)).length, 1);

    /* Then the copy goes into a deal. */
    const invId = (await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: cards.firstEdition, ask: 9000 } })).json().value;
    const goalId = (await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: cards.firstEdition, tier: "primary" })).json().value;
    const oppId = (await direct(ctx, ACTOR.casey, "startOpportunity", { goalId, invId, amount: 9000 })).value;
    await direct(ctx, ACTOR.north, "acceptPrice", { oppId });
    assert(!(await direct(ctx, ACTOR.casey, "proposeTradeSelection",
      { oppId, binderIds: [copyId] })).refused, "proposeTradeSelection");
    eq(D.collectorCopyStatus(copyId, (await ctx.repository.loadWorld()).opportunities), "reserved");

    const off = await interest(ctx, ACTOR.north, copyId, false);
    assert(!off.refused, "a stale signal could not be cleared: " + json(off));
    eq((await interestsOf(ctx)).length, 0, "and it is gone");
    /* Withdrawing it did nothing to the deal. */
    const w = await ctx.repository.loadWorld();
    assert(w.opportunities.find((o) => o.id === oppId).trade.cards.some((c) => c.binderId === copyId),
      "withdrawing interest disturbed the trade package");
    assert(validateWorld(w).ok, "and the world still validates");
  });

  test("the projection already hid such a copy from an uninvolved partner, and still does", async () => {
    const ctx = await world();
    const cards = await charizard(ctx);
    const { copyId } = await reserved(ctx, cards);
    /* This is the boundary that was already right. The command check C2.1 added
       is the same rule where a screen cannot be relied on — not a replacement
       for it, and not a second answer to the same question. */
    const second = (await get(ctx.app, "second", "/api/view")).json().state;
    eq(second.collectorCopies.length, 0, "a partner outside the network sees nothing");
    const north = (await get(ctx.app, "north", "/api/view")).json().state.collectorCopies
      .find((b) => b.id === copyId);
    eq(north.status, "reserved", "the partner in the deal sees their own deal's answer");
  });
});

run();
