/* ============================================================================
   PHASE 5 C4 — THE CATALOG INGESTION RUNNER

   Batch 5 built the translation boundary and the canonical repository, tested
   both thoroughly, and shipped no way to run them. There was no route, no CLI
   verb and no caller of `applyTranslation` outside its own suite — so the
   production catalog could only ever be empty, and `addGoal`,
   `addCollectorCopy`, `addInventoryCopy` and `addBinderEntry` were all refused
   `card-unavailable` for want of anything to name. Every screen C1 through
   C3.5 built was demonstrable only against a test fixture.

   This is the verb, the loop, the transaction boundary and the summary. It is
   not a provider: its input is a file, which is exactly the adapter boundary,
   and the day an approved provider exists the only new thing is a function
   that produces the same array.

   AND THREE ORDINARY INPUTS THAT USED TO CRASH. The C4 checkpoint drove the
   pipeline against a real database and found that a `null` element, a record
   with no provider card id, and a printed total of `"abc"`, `10.5` or
   `99999999999` each threw — the first two out of `translate` and
   `recordSourceMapping`, the third out of Postgres. Under a batch transaction
   any one of them takes hundreds of good records down. They are classified
   now, at the boundary where the rule belongs.

   A. three outcomes        mapped, quarantined, and the one that cannot queue
   B. rerun is recovery     ids, mappings and everybody's references survive
   C. what the run says     counts that reconcile with the database
   D. dry run               classifies everything, writes nothing
   E. the transaction       batched, atomic, and a fault stops the run
   F. the operator's door   flags, exit codes, files, and no secrets
   G. the boundaries hold   no HTTP, no exposure, no migration, no provider
   H. and then it works     the catalog feeds the product that was waiting
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { createApp } = require("../server/app.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { projectForActor } = require("../domain/metyet-projection.js");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
const { importCatalog, exitCodeFor, EXIT } = require("../server/catalog/import.js");
const { applyTranslation, QUARANTINE, REJECTED }
  = require("../server/catalog/translation.js");
const { runCommand } = require("../server/cli.js");
const RT = require("../domain/metyet-runtime.js");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const json = (v) => JSON.stringify(v);

/* ------------------------------------------------------------- A WORLD */

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

const SUBJECT = { north: "sub-north", casey: "sub-casey" };

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
    partners: [{ id: "p1", name: "Northline" }],
    relationships: [{ partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" }],
    invitations: [], goals: [], inventory: [], collectorCopies: [],
    binders: [], binderEntries: [],
    interests: [], opportunities: [], conversations: [], photoRequests: [], copyReviews: [],
  });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: SUBJECT.north, role: "tp", partnerId: "p1" });
  await accounts.linkAccount({ subject: SUBJECT.casey, role: "collector", collectorId: "c1" });
  const verifier = { verify: async (token) => {
    const subject = SUBJECT[token];
    if (!subject) throw Object.assign(new Error("no"), { reason: "bad token" });
    return { subject, email: `${token}@example.invalid`, emailVerified: true };
  } };
  return { pg, db, runtime, repository, catalog,
    app: createApp({ repository, catalog, accounts, verifier, runtime }) };
}

const post = (app, token, command, payload) => app.inject({ method: "POST", url: "/api/commands",
  headers: { authorization: `Bearer ${token}` }, payload: { command, payload } });
const get = (app, token, url) => app.inject({ method: "GET", url,
  headers: { authorization: `Bearer ${token}` } });
const view = async (app, token) => (await get(app, token, "/api/view")).json().state;

/* -------------------------------------------------------- THE FIXTURES

   A vocabulary MetYet owns, and records some provider produced. Two different
   kinds of thing, kept apart here exactly as the runner keeps them apart. */

const VOCAB = Object.freeze({
  expansions: { "prov-set-base1": "base1", "prov-set-jungle": "jungle" },
  variants: {
    unlimitedHolofoil: { printRun: "unlimited", finish: "holofoil" },
    firstEditionHolofoil: { printRun: "first_edition", finish: "holofoil" },
    unlimitedNormal: { printRun: "unlimited", finish: "non_holo" },
  },
});

/* A SECOND PROVIDER THAT MODELS THE SAME CARDS DIFFERENTLY — one keys its
   variants by name, the other by a flag string. Both must arrive at one card. */
const VOCAB_FLAGS = Object.freeze({
  expansions: { "S1": "base1" },
  variants: { "holo=1,first=0": { printRun: "unlimited", finish: "holofoil" } },
});

const rec = (over = {}) => ({
  providerExpansionId: "prov-set-base1",
  providerVariantKey: "unlimitedHolofoil",
  expansionName: "Base",
  expansionSeries: "Base",
  expansionPrintedTotal: 102,
  ...over,
});

const CHARIZARD = rec({ providerCardId: "prov-4", collectorNumber: "4", cardName: "Charizard",
  artist: "Mitsuhiro Arita", imageSmall: "https://img.example.invalid/zard.png" });
/* THE SAME CHECKLIST LINE, A SECOND PRINTING — and it repeats the artist,
   which a real export does and which matters more than it looks: presentation
   is last-write-wins, so a second record for one context that omitted the
   artist would blank it. Pinned in section C. */
const CHARIZARD_1ST = rec({ providerCardId: "prov-4", providerVariantKey: "firstEditionHolofoil",
  collectorNumber: "4", cardName: "Charizard", artist: "Mitsuhiro Arita" });
const MUDKIP = rec({ providerCardId: "prov-63", providerVariantKey: "unlimitedNormal",
  collectorNumber: "63", cardName: "Mudkip" });
const GOOD = Object.freeze([CHARIZARD, CHARIZARD_1ST, MUDKIP]);

const importing = (ctx, records, over = {}) => importCatalog({
  catalog: ctx.catalog, db: ctx.db, provider: "alpha", vocabulary: VOCAB, records, ...over });

const rows = async (ctx, table) =>
  (await ctx.pg.query(`select count(*)::int n from metyet_catalog.${table}`)).rows[0].n;
const shape = async (ctx) => ({
  expansions: await rows(ctx, "expansions"),
  contexts: await rows(ctx, "card_contexts"),
  cards: await rows(ctx, "canonical_cards"),
  mappings: await rows(ctx, "source_mappings"),
});
const allRows = async (ctx, table) =>
  (await ctx.pg.query(`select * from metyet_catalog.${table} order by 1`)).rows;
const cardIds = async (ctx) =>
  (await ctx.pg.query("select canonical_card_id from metyet_catalog.canonical_cards order by 1"))
    .rows.map((r) => r.canonical_card_id);

/* A temp file, because the CLI reads paths and a test should exercise the
   thing an operator actually does. Cleaned up by the OS; never in the repo. */
const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "metyet-c4-"));
const tmp = (name, value) => {
  const at = path.join(tmpdir, name);
  fs.writeFileSync(at, typeof value === "string" ? value : JSON.stringify(value));
  return at;
};

/* The CLI, with its database injected and its output captured. */
async function cli(argv, ctx) {
  const lines = [];
  const codeOut = await runCommand(argv, {
    say: (line) => lines.push(String(line)),
    database: ctx ? { db: ctx.db, repository: ctx.repository } : undefined,
    env: {},
  });
  return { code: codeOut, out: lines.join("\n") };
}

/* ============================================================== A
   Three outcomes, and the one that cannot queue. */
describe("A. three outcomes", () => {

  test("a record MetYet understands becomes a card, a context and a mapping", async () => {
    const ctx = await world();
    const summary = await importing(ctx, GOOD);
    eq(summary.mappable, 3);
    eq(summary.quarantined, 0);
    eq(summary.rejected, 0);
    eq(json(await shape(ctx)), json({ expansions: 1, contexts: 2, cards: 3, mappings: 3 }),
      "one release, two checklist lines, three printings");
    eq(summary.status, "complete");
    eq(exitCodeFor(summary), EXIT.clean);
  });

  test("an unknown variant is quarantined durably, and mints no card", async () => {
    const ctx = await world();
    const summary = await importing(ctx, [...GOOD,
      rec({ providerCardId: "prov-9", providerVariantKey: "cosmosWhatever",
        collectorNumber: "9", cardName: "Blastoise" })]);
    eq(summary.quarantined, 1);
    eq(json(summary.quarantineReasons), json({ [QUARANTINE.unknownVariant]: 1 }));
    eq((await shape(ctx)).cards, 3, "a card was minted for a variant nobody mapped");
    const queue = await ctx.catalog.readQuarantine({ provider: "alpha" });
    eq(queue.length, 1);
    eq(queue[0].providerCardId, "prov-9");
    /* The constraint is the one that matters: a quarantined mapping names no
       card, so nothing can be searched, matched or wanted through it. */
    const mapping = (await allRows(ctx, "source_mappings"))
      .find((r) => r.provider_card_id === "prov-9");
    eq(mapping.status, "quarantined");
    eq(mapping.canonical_card_id, null);
  });

  test("a record with no provider card id is rejected, and no id is fabricated", async () => {
    /* THE DEFECT C4 FOUND. `translate` refused this as incomplete — correctly —
       and then `applyTranslation` handed the blank id to `recordSourceMapping`,
       which requires one and threw a TypeError from inside a quarantine write.
       A quarantine that cannot be stored is not a quarantine. */
    const ctx = await world();
    const summary = await importing(ctx, [...GOOD,
      rec({ providerCardId: "", collectorNumber: "1", cardName: "Alakazam" })]);
    eq(summary.rejected, 1);
    eq(json(summary.rejectionReasons), json({ [REJECTED.unkeyable]: 1 }));
    eq(summary.quarantined, 0, "an unkeyable record was filed as a quarantine");
    eq((await shape(ctx)).mappings, 3, "a mapping row was written for a record with no key");
    /* And emphatically nothing invented. */
    for (const row of await allRows(ctx, "source_mappings")) {
      assert(row.provider_card_id && row.provider_card_id.trim(),
        "a mapping row carries a fabricated provider card id");
      assert(!/alakazam/i.test(json(row)), "the unkeyable record was stored anyway");
    }
  });

  test("applyTranslation writes nothing at all for a rejected translation", async () => {
    /* Asserted at the boundary rather than through the runner, because this is
       the contract the runner relies on: a rejected translation must reach no
       repository method, or the fabricated-id problem comes back one layer
       down. */
    const ctx = await world();
    const touched = [];
    const watcher = new Proxy({}, { get: (_t, name) => async (...args) => {
      touched.push(String(name));
      return ctx.catalog[name](...args);
    } });
    const { createTranslator } = require("../server/catalog/translation.js");
    const t = createTranslator({ provider: "alpha", vocabulary: VOCAB });
    for (const bad of [null, "x", 7, rec({ providerCardId: "", collectorNumber: "1", cardName: "A" })]) {
      const result = await applyTranslation(watcher, t.translate(bad));
      eq(result.rejected, true, `${json(bad)} was not rejected`);
      eq(result.quarantined, false);
    }
    eq(json(touched), json([]), "a rejected translation reached the repository: " + json(touched));
  });

  test("a record that is not a record is rejected, not thrown", async () => {
    const ctx = await world();
    const summary = await importing(ctx, [...GOOD, null, "a bare string", 42, []]);
    eq(summary.rejected, 4);
    eq(json(summary.rejectionReasons), json({ [REJECTED.unreadable]: 4 }));
    eq((await shape(ctx)).cards, 3);
    eq(summary.mappable, 3);
  });

  test("a printed total the column cannot hold is dropped, counted, and costs no card", async () => {
    /* `printed_total` is descriptive and nullable — nothing validates a
       collector number against it. So an unusable total means "nobody told
       us", which is true. Quarantining would be false: the card is perfectly
       identifiable, and the field arrives on the EXPANSION, so one mistyped
       set total would have taken the whole release down with it. */
    const ctx = await world();
    for (const bad of ["abc", 10.5, 99999999999, -99999999999]) {
      const fresh = await world();
      const summary = await importCatalog({ catalog: fresh.catalog, db: fresh.db,
        provider: "alpha", vocabulary: VOCAB,
        records: [rec({ providerCardId: "prov-4", collectorNumber: "4", cardName: "Charizard",
          expansionPrintedTotal: bad })] });
      eq(summary.mappable, 1, `${json(bad)} cost the card`);
      eq(summary.status, "complete", `${json(bad)} was treated as a failure`);
      eq(json(summary.ignored), json({ "expansion-printed-total": 1 }),
        `${json(bad)} was dropped silently`);
      const expansion = (await allRows(fresh, "expansions"))[0];
      eq(expansion.printed_total, null, `${json(bad)} reached the column`);
    }
    /* A usable one is kept, so the check is not simply refusing everything. */
    const summary = await importing(ctx, [CHARIZARD]);
    eq(json(summary.ignored), json({}));
    eq((await allRows(ctx, "expansions"))[0].printed_total, 102);
  });

  test("good rows survive every bad one beside them", async () => {
    const ctx = await world();
    const summary = await importing(ctx, [
      null,
      rec({ providerCardId: "", collectorNumber: "1", cardName: "Alakazam" }),
      CHARIZARD,
      rec({ providerCardId: "prov-9", providerVariantKey: "nope", collectorNumber: "9", cardName: "Blastoise" }),
      CHARIZARD_1ST,
      rec({ providerCardId: "prov-x", providerExpansionId: "prov-set-unknown",
        collectorNumber: "1", cardName: "Elsewhere" }),
      MUDKIP,
    ]);
    eq(summary.mappable, 3);
    eq(summary.quarantined, 2);
    eq(summary.rejected, 2);
    eq((await shape(ctx)).cards, 3, "a good row was lost to a bad one");
    eq(json(summary.quarantineReasons),
      json({ [QUARANTINE.unknownVariant]: 1, [QUARANTINE.unknownExpansion]: 1 }));
  });

  test("every quarantine reason is still its own groupable word", async () => {
    const ctx = await world();
    const summary = await importing(ctx, [
      rec({ providerCardId: "prov-1", providerVariantKey: "nope", collectorNumber: "1", cardName: "A" }),
      rec({ providerCardId: "prov-2", providerExpansionId: "prov-set-nope", collectorNumber: "2", cardName: "B" }),
      rec({ providerCardId: "prov-3", collectorNumber: "", cardName: "C" }),
      rec({ providerCardId: "prov-4", collectorNumber: "4", cardName: "D", unmappable: "two finishes in one row" }),
    ]);
    eq(json(summary.quarantineReasons), json({
      [QUARANTINE.unknownVariant]: 1,
      [QUARANTINE.unknownExpansion]: 1,
      [QUARANTINE.incomplete]: 1,
      [QUARANTINE.lossy]: 1,
    }));
    eq(summary.quarantined, 4);
  });
});

/* ============================================================== B
   Rerun is recovery. */
describe("B. rerun is recovery", () => {

  test("an unchanged rerun creates nothing and duplicates nothing", async () => {
    const ctx = await world();
    await importing(ctx, GOOD);
    const before = await shape(ctx);
    const ids = await cardIds(ctx);

    const again = await importing(ctx, GOOD);
    eq(json(await shape(ctx)), json(before), "the second run changed the table counts");
    eq(json(await cardIds(ctx)), json(ids), "an id moved");
    eq(json(again.created), json({ expansions: 0, contexts: 0, cards: 0, mappings: 3 }),
      "the second run claimed to have minted something");
    eq(json(again.reused), json({ expansions: 3, contexts: 3, cards: 3 }));
  });

  test("a mapping keeps its id and its first sighting, and its last sighting moves", async () => {
    const ctx = await world();
    await importing(ctx, GOOD);
    const first = await allRows(ctx, "source_mappings");
    await new Promise((done) => setTimeout(done, 5));
    await importing(ctx, GOOD);
    const second = await allRows(ctx, "source_mappings");

    eq(second.length, first.length);
    for (const was of first) {
      const now = second.find((r) => r.source_mapping_id === was.source_mapping_id);
      assert(now, "a mapping was re-minted rather than found");
      eq(json(now.first_seen_at), json(was.first_seen_at), "first_seen_at moved");
      eq(now.canonical_card_id, was.canonical_card_id, "the card it names moved");
      assert(new Date(now.last_seen_at) >= new Date(was.last_seen_at), "last_seen_at went backwards");
    }
  });

  test("what people already said survives a rerun, whole", async () => {
    /* THE TEST THAT MATTERS MOST. An import that renumbered a card would break
       a Goal somebody stated, a binder somebody organised, a copy somebody
       owns and a shelf a partner stocked — silently, and only visibly when
       they next opened the app. */
    const ctx = await world();
    await importing(ctx, GOOD);
    const [zard] = await cardIds(ctx);

    await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: zard, tier: "primary", desired: { grade: "PSA 9" } });
    const binder = (await post(ctx.app, "casey", "createBinder", { name: "Mine" })).json().value;
    await post(ctx.app, "casey", "addBinderEntry", { binderId: binder, canonicalCardId: zard });
    await post(ctx.app, "casey", "addCollectorCopy",
      { copy: { canonicalCardId: zard, grade: "PSA 9" } });
    await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: zard, ask: 900 } });

    const before = await view(ctx.app, "casey");
    const partnerBefore = await view(ctx.app, "north");
    assert(before.discoveries.length === 1, "the fixture stopped proving anything");

    await importing(ctx, GOOD);

    const after = await view(ctx.app, "casey");
    eq(json(after.goals), json(before.goals), "a Goal changed");
    eq(json(after.binderEntries), json(before.binderEntries), "a binder entry changed");
    eq(json(after.collectorCopies), json(before.collectorCopies), "a copy changed");
    eq(json(after.discoveries), json(before.discoveries), "the overlap changed");
    eq(json((await view(ctx.app, "north")).inventory), json(partnerBefore.inventory),
      "a partner's shelf changed");
    /* And the card is still describable by the id they all hold. */
    const described = await ctx.catalog.describeCanonicalCards([zard]);
    eq(described.length, 1);
    eq(described[0].cardName, "Charizard");
  });

  test("a rerun after a partial run finishes the job", async () => {
    const ctx = await world();
    /* Half the file, as though a fault stopped the first attempt. */
    await importing(ctx, GOOD, { limit: 1 });
    eq((await shape(ctx)).cards, 1);
    const summary = await importing(ctx, GOOD);
    eq((await shape(ctx)).cards, 3);
    eq(json(summary.created), json({ expansions: 0, contexts: 1, cards: 2, mappings: 3 }),
      "the rerun re-minted what the first run had already done");
  });

  test("widening a vocabulary resolves a quarantined row in place", async () => {
    const ctx = await world();
    const odd = rec({ providerCardId: "prov-9", providerVariantKey: "cosmosHolofoil",
      collectorNumber: "9", cardName: "Blastoise" });
    await importing(ctx, [odd]);
    const queued = await ctx.catalog.readQuarantine({ provider: "alpha" });
    eq(queued.length, 1);
    const mappingId = queued[0].sourceMappingId;

    const wider = { ...VOCAB, variants: { ...VOCAB.variants,
      cosmosHolofoil: { printRun: "unlimited", finish: "cosmos_holofoil" } } };
    const summary = await importCatalog({ catalog: ctx.catalog, db: ctx.db,
      provider: "alpha", vocabulary: wider, records: [odd] });

    eq(summary.mappable, 1);
    eq(summary.quarantined, 0);
    eq((await ctx.catalog.readQuarantine({ provider: "alpha" })).length, 0, "the queue did not empty");
    const mapping = (await allRows(ctx, "source_mappings"))[0];
    eq(mapping.source_mapping_id, mappingId, "the row was re-minted rather than resolved in place");
    eq(mapping.status, "mapped");
    assert(mapping.canonical_card_id, "it resolved to no card");
  });

  test("no mapped-to-quarantined counter is reported, because none can be honest", async () => {
    /* THE FIRST DEFECT THIS BATCH FOUND IN ITSELF, and the brief's own
       condition — surface the transition "if safely observable". It is not.
       The runner read the quarantine queue and treated its complement as "was
       mapped before", which counts every key the database has never seen; and
       `readQuarantine` caps at a hundred rows, so past that even already
       quarantined keys land in the same bucket. Both were measured. The
       counter is absent rather than wrong, and this pins that it stays absent
       until the repository can answer the question properly. */
    const ctx = await world();
    const first = await importing(ctx, [
      rec({ providerCardId: "p1", providerVariantKey: "nope", collectorNumber: "1", cardName: "A" })]);
    assert(!("requarantined" in first) || first.requarantined === undefined,
      "a mapped-to-quarantined counter came back; it must be correct or absent");
    eq(first.quarantined, 1);
    const cli = read("server/cli.js");
    assert(!/unmapped:/.test(cli), "the CLI prints a transition count nothing computes");
  });

  test("a card that stops being mappable is not deleted, and its old mapping stands", async () => {
    const ctx = await world();
    await importing(ctx, [CHARIZARD]);
    const [was] = await cardIds(ctx);

    /* The provider renames the variant; MetYet's table has not caught up. */
    const renamed = rec({ providerCardId: "prov-4", providerVariantKey: "holofoilUnlimited",
      collectorNumber: "4", cardName: "Charizard" });
    const summary = await importing(ctx, [renamed]);
    eq(summary.quarantined, 1);

    /* The CARD survives — somebody may be hunting it — and only the mapping
       moved. That is the whole non-destructive promise. */
    eq((await shape(ctx)).cards, 1, "a card was deleted because a provider renamed a variant");
    eq(json(await cardIds(ctx)), json([was]), "the card's id moved");
    const mapped = (await allRows(ctx, "source_mappings")).filter((r) => r.status === "mapped");
    eq(mapped.length, 1, "the old mapping was removed");
    eq(mapped[0].provider_variant_key, "unlimitedHolofoil");
  });
});

/* ============================================================== C
   What the run says. */
describe("C. what the run says", () => {

  test("the summary reconciles with the database, row for row", async () => {
    const ctx = await world();
    const summary = await importing(ctx, [...GOOD,
      rec({ providerCardId: "prov-9", providerVariantKey: "nope", collectorNumber: "9", cardName: "B" }),
      null]);
    const db = await shape(ctx);
    eq(summary.created.expansions + summary.reused.expansions, summary.mappable);
    eq(summary.created.expansions, db.expansions, "new expansions is not what the table holds");
    eq(summary.created.contexts, db.contexts, "new contexts is not what the table holds");
    eq(summary.created.cards, db.cards, "new cards is not what the table holds");
    eq(summary.created.mappings, db.mappings, "mappings written is not what the table holds");
    eq(summary.mappable + summary.quarantined, db.mappings,
      "a mapping row exists for every record that was not rejected");
    eq(summary.processed, summary.mappable + summary.quarantined + summary.rejected,
      "the three outcomes do not add up to what was processed");
  });

  test("two providers describing one card arrive at one canonical card", async () => {
    const ctx = await world();
    await importing(ctx, [CHARIZARD]);
    const [only] = await cardIds(ctx);

    const summary = await importCatalog({ catalog: ctx.catalog, db: ctx.db,
      provider: "beta", vocabulary: VOCAB_FLAGS,
      records: [{ providerExpansionId: "S1", providerCardId: "B-0001",
        providerVariantKey: "holo=1,first=0", collectorNumber: "4", cardName: "Charizard",
        expansionName: "Base" }] });

    eq(summary.mappable, 1);
    eq(json(summary.created), json({ expansions: 0, contexts: 0, cards: 0, mappings: 1 }),
      "the second provider minted a second card for the same printing");
    eq(json(await cardIds(ctx)), json([only]));
    const mappings = await allRows(ctx, "source_mappings");
    eq(mappings.length, 2, "two providers, two mappings");
    eq(new Set(mappings.map((m) => m.canonical_card_id)).size, 1, "one card");
  });

  test("two records of one provider converging on one card is reported, not refused", async () => {
    const ctx = await world();
    /* Two provider ids the vocabulary collapses onto one printing — usually a
       sign the table lost a distinction the provider was making. It is not the
       runner's job to guess which; it is its job to be countable. */
    const summary = await importing(ctx, [
      CHARIZARD,
      rec({ providerCardId: "prov-4-alt", collectorNumber: "4", cardName: "Charizard" }),
    ]);
    eq(summary.mappable, 2, "the second was refused rather than reported");
    eq(json(summary.created), json({ expansions: 1, contexts: 1, cards: 1, mappings: 2 }),
      "two source records did not converge on one card");
    eq(summary.created.mappings - summary.created.cards, 1,
      "the convergence is not visible in the summary");
    const mappings = await allRows(ctx, "source_mappings");
    eq(new Set(mappings.map((m) => m.canonical_card_id)).size, 1);
  });

  test("presentation is last-write-wins, which a summary cannot hide", async () => {
    /* OBSERVED, NOT CHOSEN. `putCardContext` rewrites artist, rarity,
       supertype, subtypes and pokédex numbers on every sighting, so two
       records for ONE checklist line disagree by whoever is read last — and a
       record that simply omits a field blanks it. That is the repository's
       behaviour and C4 does not change it: a runner that decided which source
       was more trustworthy would be a second authority over somebody else's
       data. It is pinned here so it is a known property rather than a
       surprise, and so a batch that wants merge semantics has to say so. */
    const ctx = await world();
    await importing(ctx, [
      rec({ providerCardId: "prov-4", collectorNumber: "4", cardName: "Charizard",
        artist: "Mitsuhiro Arita" }),
      rec({ providerCardId: "prov-4b", providerVariantKey: "firstEditionHolofoil",
        collectorNumber: "4", cardName: "Charizard" }),
    ]);
    eq((await shape(ctx)).contexts, 1, "one checklist line");
    eq((await allRows(ctx, "card_contexts"))[0].artist, null,
      "the second record no longer blanks the artist — presentation semantics changed");
    /* The identity is untouched by any of it, which is the part that matters. */
    eq((await shape(ctx)).cards, 2);
  });

  test("nothing a provider called anything becomes canonical identity", async () => {
    const ctx = await world();
    await importing(ctx, [rec({ providerCardId: "PROV-CARD-9999",
      providerExpansionId: "prov-set-base1", providerVariantKey: "unlimitedHolofoil",
      collectorNumber: "4", cardName: "Charizard" })]);
    for (const table of ["expansions", "card_contexts", "canonical_cards"]) {
      const text = json(await allRows(ctx, table));
      for (const leaked of ["PROV-CARD-9999", "prov-set-base1", "unlimitedHolofoil", "alpha"]) {
        assert(!text.includes(leaked), `"${leaked}" reached metyet_catalog.${table}`);
      }
    }
    /* And the mapping DOES keep them, which is the point: lineage is
       remembered where it belongs and nowhere else. */
    const mapping = (await allRows(ctx, "source_mappings"))[0];
    eq(mapping.provider, "alpha");
    eq(mapping.provider_card_id, "PROV-CARD-9999");
    eq(mapping.provider_variant_key, "unlimitedHolofoil");
  });
});

/* ============================================================== D
   Dry run. */
describe("D. dry run", () => {

  test("it classifies everything and writes absolutely nothing", async () => {
    const ctx = await world();
    const records = [...GOOD, null,
      rec({ providerCardId: "", collectorNumber: "1", cardName: "A" }),
      rec({ providerCardId: "prov-9", providerVariantKey: "nope", collectorNumber: "9", cardName: "B" })];
    const before = await shape(ctx);
    const dry = await importing(ctx, records, { dryRun: true });

    eq(dry.mode, "dry-run");
    eq(dry.mappable, 3);
    eq(dry.quarantined, 1);
    eq(dry.rejected, 2);
    eq(json(await shape(ctx)), json(before), "a dry run wrote something");
    eq(json(before), json({ expansions: 0, contexts: 0, cards: 0, mappings: 0 }));
  });

  test("it claims no knowledge it could not have without writing", async () => {
    const ctx = await world();
    /* A MIXED FIXTURE, deliberately: comparing two all-good runs would compare
       0 with 0 and prove nothing about the classification agreeing. */
    const mixed = [...GOOD, null,
      rec({ providerCardId: "", collectorNumber: "1", cardName: "A" }),
      rec({ providerCardId: "p9", providerVariantKey: "nope", collectorNumber: "9", cardName: "B" }),
      rec({ providerCardId: "p8", providerExpansionId: "prov-set-nope", collectorNumber: "8", cardName: "C" }),
      rec({ providerCardId: "p7", collectorNumber: "7", cardName: "D", expansionPrintedTotal: "lots" })];
    const dry = await importing(ctx, mixed, { dryRun: true });
    eq(dry.created, null, "a dry run claimed to know what it created");
    eq(dry.reused, null, "a dry run claimed to know what it reused");

    /* What it CAN know it says, and identically to the real run — every
       counter, not merely the ones that happen to be zero. */
    const real = await importing(ctx, mixed);
    assert(dry.mappable > 0 && dry.quarantined > 0 && dry.rejected > 0,
      "the fixture stopped exercising all three outcomes");
    eq(dry.read, real.read);
    eq(dry.processed, real.processed);
    eq(dry.mappable, real.mappable);
    eq(dry.quarantined, real.quarantined);
    eq(dry.rejected, real.rejected);
    eq(json(dry.quarantineReasons), json(real.quarantineReasons));
    eq(json(dry.rejectionReasons), json(real.rejectionReasons));
    eq(json(dry.ignored), json(real.ignored));
    eq(dry.status, real.status);
  });

  test("a dry run over a populated catalog changes not one row", async () => {
    const ctx = await world();
    await importing(ctx, GOOD);
    /* Every row of every table, not four counts: a dry run that rewrote a
       presentation column or bumped a `last_seen_at` would pass a count
       comparison and still have written. */
    const before = {};
    for (const table of ["expansions", "card_contexts", "canonical_cards", "source_mappings"]) {
      before[table] = json(await allRows(ctx, table));
    }
    await importing(ctx, [...GOOD, MUDKIP,
      rec({ providerCardId: "p9", providerVariantKey: "nope", collectorNumber: "9", cardName: "B" })],
    { dryRun: true });
    for (const table of Object.keys(before)) {
      eq(json(await allRows(ctx, table)), before[table], `a dry run changed ${table}`);
    }
  });
});

/* ============================================================== E
   The transaction. */
describe("E. the transaction", () => {

  test("every real write is handed the caller's transaction", async () => {
    /* Not asserted from the source text but from behaviour: the repository is
       wrapped so that any write arriving WITHOUT a `tx` is recorded. Without
       one, an upsert's existence check and its write land in two different
       transactions, which is how two concurrent runs both miss and both
       insert. */
    const ctx = await world();
    const naked = [];
    const watched = {};
    for (const [name, fn] of Object.entries(ctx.catalog)) {
      watched[name] = typeof fn !== "function" ? fn : async (...args) => {
        if (["putExpansion", "putCardContext", "putCanonicalCard", "recordSourceMapping"]
          .includes(name)) {
          const options = args[1];
          if (!options || !options.tx) naked.push(name);
        }
        return ctx.catalog[name](...args);
      };
    }
    await importCatalog({ catalog: watched, db: ctx.db, provider: "alpha",
      vocabulary: VOCAB,
      records: [...GOOD, rec({ providerCardId: "p9", providerVariantKey: "nope",
        collectorNumber: "9", cardName: "B" })] });
    eq(json(naked), json([]), "a write went to the repository without a transaction");
  });

  test("a fault rolls its batch back whole and stops the run", async () => {
    const ctx = await world();
    let seen = 0;
    const exploding = { ...ctx.catalog,
      putCanonicalCard: async (card, options) => {
        seen += 1;
        if (seen === 3) throw Object.assign(new Error("connection terminated"), { code: "57P01" });
        return ctx.catalog.putCanonicalCard(card, options);
      } };
    const summary = await importCatalog({ catalog: exploding, db: ctx.db, provider: "alpha",
      vocabulary: VOCAB, records: GOOD, batchSize: 3 });

    eq(summary.status, "failed");
    assert(summary.failedBatch, "the failing batch was not named");
    eq(summary.failedBatch.from, 0);
    eq(summary.failedBatch.to, 2);
    /* The whole batch rolled back — including the two records that had already
       succeeded inside it. That is what atomic means, and it is why rerun is
       the recovery. */
    eq(json(await shape(ctx)), json({ expansions: 0, contexts: 0, cards: 0, mappings: 0 }),
      "a failed batch left rows behind");
    eq(exitCodeFor(summary), EXIT.failure);
  });

  test("a failed batch contributes nothing to the counts it reports", async () => {
    /* THE SECOND DEFECT THIS BATCH FOUND IN ITSELF. The counters used to be
       incremented inside the transaction callback, so a batch that rolled back
       still reported the rows it had written before the fault — the database
       was consistent and the summary printed beside it was not. */
    const ctx = await world();
    let seen = 0;
    const exploding = { ...ctx.catalog,
      putCanonicalCard: async (card, options) => {
        seen += 1;
        if (seen === 3) throw new Error("connection terminated");
        return ctx.catalog.putCanonicalCard(card, options);
      } };
    const summary = await importCatalog({ catalog: exploding, db: ctx.db, provider: "alpha",
      vocabulary: VOCAB, records: GOOD, batchSize: 3 });
    eq(summary.status, "failed");
    const db = await shape(ctx);
    eq(json(db), json({ expansions: 0, contexts: 0, cards: 0, mappings: 0 }));
    eq(summary.created.expansions, db.expansions, "it counted an expansion it rolled back");
    eq(summary.created.contexts, db.contexts, "it counted a context it rolled back");
    eq(summary.created.cards, db.cards, "it counted a card it rolled back");
    eq(summary.created.mappings, db.mappings, "it counted a mapping it rolled back");
    eq(summary.reused.expansions, 0, "it counted a reuse it rolled back");
  });

  test("a committed batch before a failed one is still counted", async () => {
    /* The other half: rolling the counters back too far would be its own lie. */
    const ctx = await world();
    let seen = 0;
    const exploding = { ...ctx.catalog,
      putCanonicalCard: async (card, options) => {
        seen += 1;
        if (seen === 3) throw new Error("connection terminated");
        return ctx.catalog.putCanonicalCard(card, options);
      } };
    const summary = await importCatalog({ catalog: exploding, db: ctx.db, provider: "alpha",
      vocabulary: VOCAB, records: GOOD, batchSize: 1 });
    eq(summary.status, "failed");
    eq(summary.failedBatch.from, 2, "the third record is the one that failed");
    const db = await shape(ctx);
    eq(db.cards, 2, "the two batches that committed did not survive");
    eq(summary.created.cards, db.cards, "the summary disagrees with the database");
    eq(summary.created.mappings, db.mappings);
  });

  test("a later batch is not attempted after an earlier one fails", async () => {
    const ctx = await world();
    let seen = 0;
    const exploding = { ...ctx.catalog,
      putCanonicalCard: async (card, options) => {
        seen += 1;
        if (seen === 1) throw Object.assign(new Error("connection terminated"), { code: "57P01" });
        return ctx.catalog.putCanonicalCard(card, options);
      } };
    const summary = await importCatalog({ catalog: exploding, db: ctx.db, provider: "alpha",
      vocabulary: VOCAB, records: GOOD, batchSize: 1 });
    eq(summary.status, "failed");
    eq(summary.failedBatch.from, 0);
    eq(seen, 1, "the run carried on past a fault");
    eq((await shape(ctx)).cards, 0);
    /* And running it again, with the fault gone, completes. */
    const after = await importing(ctx, GOOD);
    eq(after.status, "complete");
    eq((await shape(ctx)).cards, 3);
  });

  test("a record's four writes are atomic together", async () => {
    const ctx = await world();
    const exploding = { ...ctx.catalog,
      recordSourceMapping: async () => { throw new Error("mapping refused"); } };
    const summary = await importCatalog({ catalog: exploding, db: ctx.db, provider: "alpha",
      vocabulary: VOCAB, records: [CHARIZARD], batchSize: 1 });
    eq(summary.status, "failed");
    /* The expansion, context and card were written before the mapping failed —
       and none of them survived, because they share the transaction. */
    eq(json(await shape(ctx)), json({ expansions: 0, contexts: 0, cards: 0, mappings: 0 }),
      "a card outlived the mapping it was written with");
  });

  test("a durable quarantine is inside the transaction too", async () => {
    const ctx = await world();
    let mappings = 0;
    const exploding = { ...ctx.catalog,
      recordSourceMapping: async (mapping, options) => {
        mappings += 1;
        if (mappings === 2) throw new Error("mapping refused");
        return ctx.catalog.recordSourceMapping(mapping, options);
      } };
    const summary = await importCatalog({ catalog: exploding, db: ctx.db, provider: "alpha",
      vocabulary: VOCAB, batchSize: 10,
      records: [rec({ providerCardId: "p1", providerVariantKey: "nope", collectorNumber: "1", cardName: "A" }),
        rec({ providerCardId: "p2", providerVariantKey: "nope", collectorNumber: "2", cardName: "B" })] });
    eq(summary.status, "failed");
    eq((await shape(ctx)).mappings, 0, "a quarantine row survived a rolled-back batch");
  });
});

/* ============================================================== F
   The operator's door. */
describe("F. the operator's door", () => {

  test("the verb runs, reports and exits clean", async () => {
    const ctx = await world();
    const { code: exit, out } = await cli(["catalog-import", "--provider=alpha",
      `--vocabulary=${tmp("v1.json", VOCAB)}`, `--records=${tmp("r1.json", GOOD)}`], ctx);
    eq(exit, EXIT.clean, out);
    assert(/provider:\s+alpha/.test(out), out);
    assert(/mappable:\s+3/.test(out), out);
    assert(/status:\s+complete/.test(out), out);
    eq((await shape(ctx)).cards, 3);
  });

  test("it exits 3 when it completed but something is waiting", async () => {
    const ctx = await world();
    const records = [...GOOD,
      rec({ providerCardId: "p9", providerVariantKey: "nope", collectorNumber: "9", cardName: "B" })];
    const { code: exit, out } = await cli(["catalog-import", "--provider=alpha",
      `--vocabulary=${tmp("v2.json", VOCAB)}`, `--records=${tmp("r2.json", records)}`], ctx);
    eq(exit, EXIT.quarantine, out);
    assert(/quarantined:\s+1/.test(out), out);
    assert(/completed-with-quarantine/.test(out), out);
    eq((await shape(ctx)).cards, 3, "the good rows did not land");
  });

  test("a missing or malformed flag is invalid invocation, and writes nothing", async () => {
    const ctx = await world();
    const v = tmp("v3.json", VOCAB);
    const r = tmp("r3.json", GOOD);
    for (const argv of [
      ["catalog-import", `--vocabulary=${v}`, `--records=${r}`],
      ["catalog-import", "--provider=alpha", `--records=${r}`],
      ["catalog-import", "--provider=alpha", `--vocabulary=${v}`],
      ["catalog-import", "--provider=   ", `--vocabulary=${v}`, `--records=${r}`],
      ["catalog-import", "--provider=alpha", `--vocabulary=${v}`, `--records=${r}`, "--limit=0"],
      ["catalog-import", "--provider=alpha", `--vocabulary=${v}`, `--records=${r}`, "--limit=two"],
      ["catalog-import", "--provider=alpha", `--vocabulary=${v}`, `--records=${r}`, "--limit=1.5"],
    ]) {
      const { code: exit } = await cli(argv, ctx);
      eq(exit, EXIT.invalid, `${argv.join(" ")} was not refused as invalid`);
    }
    eq((await shape(ctx)).cards, 0, "an invalid invocation wrote something");
    /* And an argument that is not a flag at all is the CLI's own refusal. */
    eq((await cli(["catalog-import", "nonsense"], ctx)).code, EXIT.invalid);
  });

  test("a file that is not what it claims fails before any write", async () => {
    const ctx = await world();
    const goodV = tmp("v4.json", VOCAB);
    const cases = [
      [tmp("bad1.json", "{ not json"), tmp("r4.json", GOOD), "a truncated vocabulary"],
      [goodV, tmp("bad2.json", "[ { \"a\": 1 }"), "a truncated records file"],
      [goodV, tmp("bad3.json", { notAnArray: true }), "a records object"],
      [tmp("bad4.json", { variants: {} }), tmp("r5.json", GOOD), "an empty vocabulary"],
      [tmp("bad5.json", { variants: { v: { printRun: "invented" } } }), tmp("r6.json", GOOD),
        "a vocabulary the domain does not know"],
      [path.join(tmpdir, "does-not-exist.json"), tmp("r7.json", GOOD), "a missing file"],
    ];
    for (const [v, r, what] of cases) {
      const { code: exit } = await cli(["catalog-import", "--provider=alpha",
        `--vocabulary=${v}`, `--records=${r}`], ctx);
      eq(exit, EXIT.failure, `${what} did not fail`);
      eq((await shape(ctx)).cards, 0, `${what} wrote something first`);
    }
  });

  test("--limit takes the first n, and a dry run through the CLI writes nothing", async () => {
    const ctx = await world();
    const v = tmp("v5.json", VOCAB);
    const r = tmp("r8.json", GOOD);
    const dry = await cli(["catalog-import", "--provider=alpha", `--vocabulary=${v}`,
      `--records=${r}`, "--dry-run"], ctx);
    eq(dry.code, EXIT.clean, dry.out);
    assert(/nothing was written/.test(dry.out), dry.out);
    eq((await shape(ctx)).cards, 0, "--dry-run wrote something");

    const one = await cli(["catalog-import", "--provider=alpha", `--vocabulary=${v}`,
      `--records=${r}`, "--limit=1"], ctx);
    eq(one.code, EXIT.clean, one.out);
    eq((await shape(ctx)).cards, 1);
    assert(/3 read, 1 processed/.test(one.out), one.out);
  });

  test("no record, payload or secret-shaped string reaches the output", async () => {
    const ctx = await world();
    const records = [rec({ providerCardId: "p1", providerVariantKey: "nope",
      collectorNumber: "1", cardName: "ZZ-SECRET-CARDNAME",
      unmappable: undefined })];
    const { out } = await cli(["catalog-import", "--provider=alpha",
      `--vocabulary=${tmp("v6.json", VOCAB)}`, `--records=${tmp("r9.json", records)}`], ctx);
    assert(!out.includes("ZZ-SECRET-CARDNAME"), "a record's contents were printed: " + out);

    /* And an induced error carrying secret-shaped text is redacted by the same
       machinery every other operator command uses. */
    const exploding = { ...ctx, db: { transaction: async () => {
      throw new Error("connect failed postgres://user:hunter2@db.internal:5432/metyet token=abc123");
    } } };
    const bad = await cli(["catalog-import", "--provider=alpha",
      `--vocabulary=${tmp("v7.json", VOCAB)}`, `--records=${tmp("r10.json", GOOD)}`], exploding);
    eq(bad.code, EXIT.failure);
    assert(!bad.out.includes("hunter2"), "a password reached the output: " + bad.out);
    assert(!bad.out.includes("abc123"), "a token reached the output: " + bad.out);
    assert(bad.out.includes("<connection string>"), bad.out);
  });

  test("all four exit codes are reachable, and each means one thing", async () => {
    const ctx = await world();
    const v = tmp("vx.json", VOCAB);
    eq((await cli(["catalog-import", "--provider=alpha", `--vocabulary=${v}`,
      `--records=${tmp("rx-clean.json", GOOD)}`], ctx)).code, EXIT.clean, "0 is a clean run");
    eq((await cli(["catalog-import", "--provider=alpha", `--vocabulary=${v}`,
      `--records=${tmp("rx-q.json", [...GOOD, null])}`], ctx)).code, EXIT.quarantine,
    "3 is completed-with-something-waiting");
    eq((await cli(["catalog-import", `--vocabulary=${v}`,
      `--records=${tmp("rx-i.json", GOOD)}`], ctx)).code, EXIT.invalid,
    "2 is an invocation nobody could act on");
    eq((await cli(["catalog-import", "--provider=alpha", `--vocabulary=${v}`,
      `--records=${path.join(tmpdir, "nope.json")}`], ctx)).code, EXIT.failure,
    "1 is an operational failure");
    /* Distinct values, so a scheduler can branch on them. */
    eq(json([EXIT.clean, EXIT.failure, EXIT.invalid, EXIT.quarantine]), json([0, 1, 2, 3]));
  });

  test("the verb is listed where an operator would look for it", () => {
    const cli = read("server/cli.js");
    assert(/catalog-import --provider/.test(cli), "the usage does not name the verb");
    const pkg = JSON.parse(read("package.json"));
    eq(pkg.scripts["catalog:import"], "node server/cli.js catalog-import");
  });
});

/* ============================================================== G
   The boundaries hold. */
describe("G. the boundaries hold", () => {

  test("there is no HTTP way in, and the allow-list did not move", async () => {
    const ctx = await world();
    eq(EXPOSED_COMMANDS.length, 16, "C4 changed the production surface");
    for (const name of ["catalogImport", "importCatalog", "putCanonicalCard",
      "putCardContext", "putExpansion", "recordSourceMapping", "resolveCardIdentity"]) {
      assert(!EXPOSED_COMMANDS.includes(name), `${name} is exposed`);
      const res = await post(ctx.app, "casey", name, {});
      eq(res.json().error.refused, "command-unavailable", name);
    }
    /* And no route writes the schema. */
    const app = code("server/app.js");
    assert(!/app\.(post|put|patch|delete)\([^)]*catalog/i.test(app), "a catalog write route exists");
    assert(!/importCatalog|catalog\/import/.test(app), "the server reaches the runner");
  });

  test("the exposed set is byte-identical to the batch this branch started from", () => {
    const { execFileSync } = require("child_process");
    eq(execFileSync("git", ["show", "97fdba3:server/exposed-commands.js"],
      { cwd: ROOT, encoding: "utf8" }), read("server/exposed-commands.js"),
    "the production door moved in a batch that adds an operator command");
  });

  test("no migration, and 0013_binders.sql is still the newest", () => {
    const migrations = fs.readdirSync(path.join(ROOT, "persistence", "migrations")).sort();
    eq(migrations[migrations.length - 1], "0013_binders.sql", migrations.join(","));
    const { execFileSync } = require("child_process");
    const changed = execFileSync("git", ["diff", "--name-only", "97fdba3", "HEAD", "--",
      "persistence/"], { cwd: ROOT, encoding: "utf8" }).trim();
    eq(changed, "", "persistence changed: " + changed);
  });

  test("the vocabulary is parsed, never executed, and a record names no file", () => {
    const cli = code("server/cli.js");
    const at = cli.indexOf('"catalog-import"');
    assert(at > 0, "the verb vanished");
    const body = cli.slice(at, cli.indexOf("\n  },", at));
    assert(/JSON\.parse\(/.test(body), "the vocabulary is not parsed as JSON");
    assert(!/require\(\s*flags|require\(\s*[a-z]*[Pp]ath/.test(body),
      "caller input reaches require()");
    /* The only paths read are the two flags, and nothing derives a path from a
       record's contents: the runner never reaches the filesystem or the shell
       at all, and its one `require` is a module literal at the top. */
    const runner = code("server/catalog/import.js");
    assert(!/readFile|writeFile|readdir|exec|spawn|child_process/.test(runner),
      "the runner touches the filesystem or the shell");
    const requires = runner.match(/require\([^)]*\)/g) || [];
    eq(json(requires), json(['require("./translation.js")']),
      "the runner requires something other than its own boundary: " + json(requires));
  });

  test("no provider, no network, no SDK", () => {
    for (const rel of ["server/catalog/import.js", "server/catalog/translation.js",
      "persistence/catalog-repository.js", "domain/card-identity.js"]) {
      const body = code(rel);
      assert(!/fetch\(|https?\.request|axios|node-fetch|undici/.test(body),
        `${rel} reaches a network`);
      assert(!/scrydex|tcgdex|pokemontcg|apiKey|api_key|bearer/i.test(body),
        `${rel} names a provider or a credential`);
    }
    const pkg = JSON.parse(read("package.json"));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    assert(!deps.some((d) => /scrydex|tcgdex|pokemontcg|axios|node-fetch/i.test(d)),
      "a provider or HTTP dependency was added: " + deps.join(","));
  });

  test("ingestion does not reference pokemon_cards.json, and the file is untouched", () => {
    for (const rel of ["server/catalog/import.js", "server/catalog/translation.js",
      "server/cli.js", "persistence/catalog-repository.js"]) {
      assert(!/pokemon_cards\.json/.test(read(rel)), `${rel} names pokemon_cards.json`);
    }
    const { execFileSync } = require("child_process");
    const changed = execFileSync("git", ["diff", "--name-only", "97fdba3", "HEAD"],
      { cwd: ROOT, encoding: "utf8" });
    assert(!/pokemon_cards\.json/.test(changed), "pokemon_cards.json was changed");
    assert(fs.existsSync(path.join(ROOT, "pokemon_cards.json")), "it was deleted");
  });

  test("`unmappable` is diagnostic text and reaches no card", async () => {
    const ctx = await world();
    await importing(ctx, [rec({ providerCardId: "p1", collectorNumber: "1", cardName: "A",
      unmappable: "ZZ-DIAGNOSTIC-ONLY two finishes in one row" })]);
    eq((await shape(ctx)).cards, 0, "an unmappable record became a card");
    const mapping = (await allRows(ctx, "source_mappings"))[0];
    eq(mapping.status, "quarantined");
    assert(/lossy-mapping/.test(mapping.quarantine_reason), mapping.quarantine_reason);
    /* It is kept in the bounded lineage, where an operator can read it — and
       nowhere a card could be built from. */
    assert(json(mapping.raw).includes("ZZ-DIAGNOSTIC-ONLY"), "the adapter's reason was dropped");
  });

  test("the lineage a mapping keeps is still bounded to what the adapter read", async () => {
    const ctx = await world();
    await importing(ctx, [rec({ providerCardId: "p1", collectorNumber: "4", cardName: "Charizard",
      rarity: "Rare Holo", supertype: "Pokémon", subtypes: ["Stage 2"],
      pokedexNumbers: [6], imageLarge: "https://img.example.invalid/big.png" })]);
    const raw = (await allRows(ctx, "source_mappings"))[0].raw;
    eq(json(Object.keys(raw).sort()),
      json(["cardName", "collectorNumber", "providerCardId", "providerExpansionId",
        "providerVariantKey"].sort()),
      "the lineage grew into a copy of the provider's record");
  });

  test("nothing is withdrawn, deleted or repointed because a row went missing", async () => {
    const ctx = await world();
    await importing(ctx, GOOD);
    const before = await allRows(ctx, "canonical_cards");
    const mappingsBefore = await allRows(ctx, "source_mappings");

    /* The provider's next export is missing two of the three. */
    await importing(ctx, [CHARIZARD]);

    const after = await allRows(ctx, "canonical_cards");
    eq(after.length, before.length, "a card vanished when a source stopped listing it");
    eq(json(after.map((r) => r.status)), json(before.map((r) => r.status)),
      "a card was withdrawn because a source stopped listing it");
    eq((await allRows(ctx, "source_mappings")).length, mappingsBefore.length,
      "a mapping was removed");
    /* And the runner names no withdrawal machinery at all. `\bsync` rather
       than `sync`, because every function in the file is `async`. */
    const runner = code("server/catalog/import.js");
    for (const machinery of [/withdraw/i, /\bstale/i, /\bprune/i, /reconcile/i,
      /\bsynchron/i, /setDifference/i, /lastSeenBefore/i]) {
      assert(!machinery.test(runner), `the runner grew a synchroniser: ${machinery}`);
    }
    assert(!/withdrawCanonicalCard/.test(runner), "the runner can withdraw a card");
  });
});

/* ============================================================== H
   And then it works. */
describe("H. and then it works", () => {

  test("after an import the catalog read routes answer", async () => {
    const ctx = await world();
    await importing(ctx, GOOD);

    const contexts = (await get(ctx.app, "casey", "/api/card-contexts?query=chari")).json();
    eq(contexts.contexts.length, 1, json(contexts));
    eq(contexts.contexts[0].cardName, "Charizard");
    eq(contexts.contexts[0].expansionCode, "base1");

    const expansions = (await get(ctx.app, "casey", "/api/expansions")).json();
    eq(expansions.expansions.length, 1);
    eq(expansions.expansions[0].name, "Base");

    const artists = (await get(ctx.app, "casey", "/api/artists")).json();
    assert(artists.artists.some((a) => a.artist === "Mitsuhiro Arita"), json(artists));

    const one = (await get(ctx.app, "casey",
      `/api/card-contexts/${contexts.contexts[0].cardContextId}`)).json();
    eq(one.canonicalCards.length, 2, "both printings of the Charizard");
  });

  test("a Collector can want an imported card and a partner can stock one", async () => {
    /* The wall this whole batch exists to remove: with an empty catalog every
       one of these was refused `card-unavailable`. */
    const ctx = await world();
    await importing(ctx, GOOD);
    const [zard] = await cardIds(ctx);

    eq((await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: zard, tier: "primary", desired: { grade: "PSA 9" } })).statusCode, 200);
    eq((await post(ctx.app, "casey", "addCollectorCopy",
      { copy: { canonicalCardId: zard, grade: "PSA 9" } })).statusCode, 200);
    eq((await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: zard, ask: 900 } })).statusCode, 200);
    const binder = (await post(ctx.app, "casey", "createBinder", { name: "Mine" })).json().value;
    eq((await post(ctx.app, "casey", "addBinderEntry",
      { binderId: binder, canonicalCardId: zard })).statusCode, 200);

    /* And a card the catalog does not hold is still refused, so the guard is
       working rather than merely absent. */
    eq((await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: "not-a-card", tier: "primary", desired: { grade: "PSA 9" } }))
      .json().error.refused, "card-unavailable");
  });

  test("Discovery derives from the imported card, carrying no provider identity", async () => {
    const ctx = await world();
    await importing(ctx, GOOD);
    const [zard] = await cardIds(ctx);
    await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: zard, tier: "primary", desired: { grade: "PSA 9" } });
    await post(ctx.app, "north", "addInventoryCopy", { copy: { canonicalCardId: zard, ask: 900 } });

    const mine = await view(ctx.app, "casey");
    eq(mine.discoveries.length, 1, "the overlap did not derive");
    eq(mine.discoveries[0].canonicalCardId, zard);
    /* Nothing a provider said is in the product's state, on either seat. */
    for (const seat of ["casey", "north"]) {
      const body = (await get(ctx.app, seat, "/api/view")).body;
      for (const leaked of ["prov-4", "prov-set-base1", "unlimitedHolofoil", "alpha"]) {
        assert(!body.includes(leaked), `"${leaked}" reached the ${seat} projection`);
      }
    }
    /* And a quarantined record creates no demand and no supply. */
    const world2 = projectForActor(await ctx.repository.loadWorld(), { partnerId: "p1" });
    eq(world2.discoveries.length, 1);
  });
});

run();
