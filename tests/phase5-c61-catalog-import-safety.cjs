/* ============================================================================
   PHASE 5 C6.1 — CATALOG IMPORT SAFETY

   Two ingestion risks the C6 checkpoint found by probing the runner, both fixed
   here, both pinned by behaviour rather than by reading source.

   THE FIRST WAS A DEFECT AND IT WAS SERIOUS. C4 wrote a rejection for a record
   it cannot key — no provider card id means no row in `source_mappings`, which
   is keyed by one — and put that gate SECOND, after the check for a missing
   collector number or card name. So the rejection only ever fired for a record
   that was otherwise complete. A record missing the card id AND a number or a
   name — the ordinary shape of a broken row in a bulk export — was classified
   `incomplete-record`, sent to quarantine, and threw on the way in, inside the
   batch transaction. The batch rolled back and the runner returned: one
   malformed row failed the whole import and wrote nothing, taking every good
   record with it.

   THE SECOND WAS NOT A DEFECT BUT A BLIND SPOT. An expansion code is whatever
   an operator's vocabulary says it is — nothing can check it, and nothing
   should, because a genuinely new release has to be declarable. So `FOSSIL` and
   `FOSSSIL` are equally valid, and typing the second mints a second canonical
   expansion with cards in it while the run reports success. The fix is not
   validation; it is that the run now NAMES the releases it is about to open,
   before it opens them, in the dry run.

   A. the defect          the three shapes, and the good record beside them
   B. what did not change quarantine is still quarantine, faults still stop
   C. rejection is total  nothing is written, nothing is invented
   D. releases, named     the typo is visible before it is durable
   E. the same either way dry run and real run classify identically
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { importCatalog, EXIT, exitCodeFor } = require("../server/catalog/import.js");
const { createTranslator, QUARANTINE, REJECTED } = require("../server/catalog/translation.js");
const RT = require("../domain/metyet-runtime.js");

const json = (v) => JSON.stringify(v);

/* This suite's own vocabulary and cards. Nothing is borrowed from another
   fixture, so a change there cannot quietly change what is proved here. */
const VARIANTS = { unlimitedHolofoil: { printRun: "unlimited", finish: "holofoil" } };
const VOCAB = { expansions: { fossil: "FOSSIL" }, variants: VARIANTS };

const GOOD = Object.freeze({ providerExpansionId: "fossil", providerCardId: "fossil-2",
  providerVariantKey: "unlimitedHolofoil", collectorNumber: "2", cardName: "Articuno" });

/* A second good one, so "the good record landed" can be more than one row. */
const ALSO_GOOD = Object.freeze({ ...GOOD, providerCardId: "fossil-9",
  collectorNumber: "9", cardName: "Muk" });

/* A variant of GOOD with fields removed — and its OWN provider card id unless
   the id is one of the fields being removed. `source_mappings` is unique on
   (provider, provider card id, variant key), so a record that reuses GOOD's id
   upserts onto GOOD's row instead of adding one, and a test counting rows would
   be measuring the wrong thing. */
let nextId = 100;
const without = (...fields) => {
  const record = { ...GOOD, providerCardId: `fossil-${nextId += 1}` };
  for (const f of fields) delete record[f];
  return record;
};

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

async function world() {
  const pg = database();
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  const runtime = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 1000 });
  return { pg, db, runtime, catalog: createCatalogRepository(db, { newId: runtime.newId }) };
}

const doImport = (ctx, records, extra = {}) => importCatalog({
  catalog: ctx.catalog, db: ctx.db, provider: "probe",
  vocabulary: VOCAB, records, ...extra });

const countOf = async (ctx, table) =>
  (await ctx.pg.query(`select count(*)::int as n from metyet_catalog.${table}`)).rows[0].n;

const classify = (record, vocabulary = VOCAB) => {
  const t = createTranslator({ provider: "probe", vocabulary });
  const r = t.translate(record);
  return r.ok ? "mappable"
    : r.rejected ? `rejected:${r.rejected.reason}`
      : `quarantined:${r.quarantine.reason}`;
};

/* ============================================================== A */
describe("A. a record that cannot be keyed is rejected, whatever else is wrong", () => {

  /* The three shapes. The first is C4's own case and must not regress; the
     other two are what C6 measured failing the run. */
  const SHAPES = {
    "missing only the provider card id": without("providerCardId"),
    "missing the provider card id and the card name": without("providerCardId", "cardName"),
    "missing the provider card id and the collector number": without("providerCardId", "collectorNumber"),
  };

  for (const [label, record] of Object.entries(SHAPES)) {
    test(`${label} — rejected as unkeyable`, async () => {
      eq(classify(record), `rejected:${REJECTED.unkeyable}`, label);
    });

    test(`${label} — the good records in the same batch land`, async () => {
      const ctx = await world();
      /* The bad record in the MIDDLE, so neither "it was first" nor "it was
         last" can explain a pass. */
      const summary = await doImport(ctx, [GOOD, record, ALSO_GOOD]);
      eq(summary.status, "completed-with-quarantine", json(summary.failedBatch));
      eq(summary.failedBatch, null, "the run stopped on a row it should have skipped");
      eq(summary.mappable, 2, "both good records were mappable");
      eq(summary.rejected, 1, "and the bad one was rejected");
      eq(json(summary.rejectionReasons), json({ [REJECTED.unkeyable]: 1 }), "by name");
      eq(await countOf(ctx, "canonical_cards"), 2, "two cards were written");
      eq(await countOf(ctx, "source_mappings"), 2, "and two mappings, not three");
    });

    test(`${label} — the run is not an operational failure`, async () => {
      const ctx = await world();
      const summary = await doImport(ctx, [GOOD, record]);
      eq(exitCodeFor(summary), EXIT.quarantine, "a malformed row is not exit 1");
      assert(summary.status !== "failed", "the run reported an operational failure");
    });
  }

  test("a blank or whitespace provider card id is no id at all", async () => {
    for (const id of ["", "   ", "\t", "\n  \n"]) {
      eq(classify({ ...GOOD, providerCardId: id }), `rejected:${REJECTED.unkeyable}`, json(id));
      eq(classify({ ...GOOD, providerCardId: id, cardName: "" }),
        `rejected:${REJECTED.unkeyable}`, `${json(id)} with no name`);
    }
  });

  test("a provider card id that is not a string is no id either", async () => {
    for (const id of [null, 0, 42, true, [], {}]) {
      eq(classify({ ...GOOD, providerCardId: id }), `rejected:${REJECTED.unkeyable}`, json(id));
    }
  });

  test("and one malformed row does not cost the records after it", async () => {
    /* The measured failure was worse than one batch: a fault RETURNS, so every
       later batch was never attempted. With small batches, a bad row in the
       first one used to lose everything behind it. */
    const ctx = await world();
    const many = [];
    for (let i = 0; i < 12; i += 1) {
      many.push({ ...GOOD, providerCardId: `fossil-${i}`, collectorNumber: String(i),
        cardName: `Card ${i}` });
    }
    many.splice(1, 0, without("providerCardId", "cardName"));
    const summary = await doImport(ctx, many, { batchSize: 3 });
    eq(summary.status, "completed-with-quarantine", json(summary.failedBatch));
    eq(summary.mappable, 12, "every good record was mappable");
    eq(await countOf(ctx, "canonical_cards"), 12, "and every one of them landed");
  });
});

/* ============================================================== B */
describe("B. what this correction did not change", () => {

  test("a keyable record missing a name still quarantines", async () => {
    const ctx = await world();
    const record = without("cardName");
    eq(classify(record), `quarantined:${QUARANTINE.incomplete}`, "not a rejection");
    const summary = await doImport(ctx, [GOOD, record]);
    eq(summary.quarantined, 1, "one queued");
    eq(summary.rejected, 0, "and none rejected");
    eq(await countOf(ctx, "source_mappings"), 2, "the queued row is remembered");
    const queued = await ctx.catalog.readQuarantine({ provider: "probe" });
    eq(queued.length, 1, "and is readable as a queue");
    eq(queued[0].providerCardId, record.providerCardId, "keyed by the id it had");
    /* AND THE REASON IT GIVES NO LONGER MENTIONS THE CARD ID. That question is
       settled before this gate now, so a detail saying "needs a provider card
       id" sent an operator looking for a field that was there. */
    const detail = json(queued[0]);
    assert(!/provider card id/i.test(detail),
      "the incomplete reason still blames a field it did not check: " + detail);
  });

  test("a keyable record missing a collector number still quarantines", async () => {
    const ctx = await world();
    const record = without("collectorNumber");
    eq(classify(record), `quarantined:${QUARANTINE.incomplete}`, "not a rejection");
    const summary = await doImport(ctx, [GOOD, record]);
    eq(summary.quarantined, 1, "one queued");
    eq(await countOf(ctx, "source_mappings"), 2, "and it is stored");
  });

  test("an unknown variant still quarantines, and an unknown expansion too", async () => {
    const ctx = await world();
    const summary = await doImport(ctx, [
      GOOD,
      { ...GOOD, providerCardId: "fossil-3", providerVariantKey: "somethingElse" },
      { ...GOOD, providerCardId: "fossil-4", providerExpansionId: "nothing-maps-here" },
    ]);
    eq(summary.quarantined, 2, "both queued");
    eq(json(summary.quarantineReasons),
      json({ [QUARANTINE.unknownVariant]: 1, [QUARANTINE.unknownExpansion]: 1 }), "by name");
    eq(summary.rejected, 0, "neither was rejected");
  });

  test("a record that is not a record is still rejected as unreadable", async () => {
    for (const thing of [null, "a string", 7, true, []]) {
      eq(classify(thing), `rejected:${REJECTED.unreadable}`, json(thing));
    }
  });

  test("a genuine database fault still stops the run and rolls the batch back", async () => {
    const ctx = await world();
    /* A repository that fails on the third card. The rule this pins is the one
       C4 built deliberately: a real fault is not a data-quality problem and
       must not be swallowed. */
    let cards = 0;
    const breaking = { ...ctx.catalog,
      putCanonicalCard: async (...args) => {
        cards += 1;
        if (cards === 3) throw new Error("connection terminated unexpectedly");
        return ctx.catalog.putCanonicalCard(...args);
      } };
    const records = [];
    for (let i = 0; i < 4; i += 1) {
      records.push({ ...GOOD, providerCardId: `fossil-${i}`, collectorNumber: String(i),
        cardName: `Card ${i}` });
    }
    const summary = await importCatalog({ catalog: breaking, db: ctx.db, provider: "probe",
      vocabulary: VOCAB, records, batchSize: 10 });
    eq(summary.status, "failed", "a real fault must stop the run");
    assert(summary.failedBatch, "and name the batch");
    eq(exitCodeFor(summary), EXIT.failure, "exit 1");
    eq(await countOf(ctx, "canonical_cards"), 0, "the batch rolled back whole");
  });
});

/* ============================================================== C */
describe("C. a rejection writes nothing and invents nothing", () => {

  test("no source mapping is written for a rejected record", async () => {
    const ctx = await world();
    await doImport(ctx, [without("providerCardId", "cardName")]);
    eq(await countOf(ctx, "source_mappings"), 0, "a rejected row was stored");
    eq(await countOf(ctx, "canonical_cards"), 0, "or worse, given a card");
    eq(await countOf(ctx, "expansions"), 0, "or an expansion");
  });

  test("no repository method is reached for a rejected record", async () => {
    const ctx = await world();
    const reached = [];
    const watched = {};
    for (const key of Object.keys(ctx.catalog)) {
      watched[key] = typeof ctx.catalog[key] === "function"
        ? async (...args) => { reached.push(key); return ctx.catalog[key](...args); }
        : ctx.catalog[key];
    }
    await importCatalog({ catalog: watched, db: ctx.db, provider: "probe",
      vocabulary: VOCAB, records: [without("providerCardId", "collectorNumber")] });
    /* The preflight lookup is a read and is allowed; nothing that writes is. */
    for (const method of ["putExpansion", "putCardContext", "putCanonicalCard",
      "recordSourceMapping"]) {
      assert(!reached.includes(method), `${method} was called for a rejected record`);
    }
  });

  test("no synthetic provider id appears anywhere", async () => {
    const ctx = await world();
    await doImport(ctx, [GOOD, without("providerCardId", "cardName")]);
    const rows = await ctx.pg.query(
      "select provider_card_id, provider_variant_key from metyet_catalog.source_mappings");
    eq(rows.rows.length, 1, "one mapping, for the good record");
    eq(rows.rows[0].provider_card_id, GOOD.providerCardId, "with the id it really had");
    for (const row of rows.rows) {
      assert(row.provider_card_id && row.provider_card_id.trim(), "a blank id was stored");
      for (const invented of ["unknown", "generated", "synthetic", "null", "undefined", "-"]) {
        assert(row.provider_card_id !== invented, `an id was invented: ${invented}`);
      }
    }
  });

  test("the rejection is counted and named, so it is not silent either", async () => {
    const ctx = await world();
    const summary = await doImport(ctx, [GOOD, without("providerCardId", "cardName")]);
    eq(summary.rejected, 1, "counted");
    eq(json(summary.rejectionReasons), json({ [REJECTED.unkeyable]: 1 }), "and named");
    eq(summary.processed, summary.mappable + summary.quarantined + summary.rejected,
      "every record is accounted for exactly once");
  });
});

/* ============================================================== D */
describe("D. the releases a run would open, named before it opens them", () => {

  const TYPO = { expansions: { fossil: "FOSSIL", "fossil-2": "FOSSSIL" }, variants: VARIANTS };
  const other = { ...GOOD, providerExpansionId: "fossil-2", providerCardId: "fossil-p1",
    collectorNumber: "P1", cardName: "Dragonite" };

  test("a dry run names them, having written nothing", async () => {
    const ctx = await world();
    const dry = await importCatalog({ catalog: ctx.catalog, db: ctx.db, provider: "probe",
      vocabulary: TYPO, records: [GOOD, other], dryRun: true });
    eq(json(dry.expansions.opening), json(["FOSSIL", "FOSSSIL"]),
      "the operator is not told which releases they are about to open");
    eq(json(dry.expansions.existing), json([]), "none of them exists yet");
    eq(await countOf(ctx, "expansions"), 0, "and the dry run wrote nothing");
  });

  test("this is what makes the measured typo visible", async () => {
    /* The hazard, stated as the test: one provider set mapped to FOSSIL and
       another to FOSSSIL is two canonical releases with the same cards' shape,
       and the run reports success either way. Nothing here refuses it — an
       operator who means it must still be able to do it — but nobody can now
       say they were not told. */
    const ctx = await world();
    const summary = await importCatalog({ catalog: ctx.catalog, db: ctx.db, provider: "probe",
      vocabulary: TYPO, records: [GOOD, other] });
    eq(summary.status, "complete", "it still succeeds, by design");
    eq(summary.created.expansions, 2, "and still creates two");
    eq(json(summary.expansions.opening), json(["FOSSIL", "FOSSSIL"]),
      "but it said so first, by name");
  });

  test("a re-import of the same file says nothing at all", async () => {
    const ctx = await world();
    await doImport(ctx, [GOOD]);
    const again = await importCatalog({ catalog: ctx.catalog, db: ctx.db, provider: "probe",
      vocabulary: VOCAB, records: [GOOD], dryRun: true });
    eq(json(again.expansions.opening), json([]), "a quiet run must stay quiet");
    eq(json(again.expansions.existing), json(["FOSSIL"]), "the release is simply known");
  });

  test("a deliberate new release is still one step, and is the only thing named", async () => {
    const ctx = await world();
    await doImport(ctx, [GOOD]);
    const two = { expansions: { fossil: "FOSSIL", jungle: "JUNGLE" }, variants: VARIANTS };
    const jungle = { ...GOOD, providerExpansionId: "jungle", providerCardId: "jungle-1",
      collectorNumber: "1", cardName: "Clefable" };
    const summary = await importCatalog({ catalog: ctx.catalog, db: ctx.db, provider: "probe",
      vocabulary: two, records: [GOOD, jungle] });
    eq(summary.status, "complete", "adding a release is not an error");
    eq(json(summary.expansions.opening), json(["JUNGLE"]), "and only the new one is named");
    eq(json(summary.expansions.existing), json(["FOSSIL"]), "the known one is not");
    eq(await countOf(ctx, "expansions"), 2, "both exist afterwards");
  });

  test("a release a record never reaches is not named", async () => {
    /* The vocabulary may declare more than a file uses. What matters is what
       this run would open, not what the table could. */
    const ctx = await world();
    const wide = { expansions: { fossil: "FOSSIL", jungle: "JUNGLE", base: "BASE" },
      variants: VARIANTS };
    const summary = await importCatalog({ catalog: ctx.catalog, db: ctx.db, provider: "probe",
      vocabulary: wide, records: [GOOD], dryRun: true });
    eq(json(summary.expansions.touched), json(["FOSSIL"]), "only the one the file uses");
  });

  test("a quarantined record opens nothing", async () => {
    const ctx = await world();
    const summary = await importCatalog({ catalog: ctx.catalog, db: ctx.db, provider: "probe",
      vocabulary: VOCAB,
      records: [{ ...GOOD, providerVariantKey: "somethingElse" }], dryRun: true });
    eq(json(summary.expansions.touched), json([]),
      "a record MetYet does not understand names no release");
  });

  test("the lookup takes MetYet codes and knows nothing of a provider", async () => {
    const ctx = await world();
    await doImport(ctx, [GOOD]);
    eq(json(await ctx.catalog.knownExpansionCodes(["FOSSIL"])), json(["FOSSIL"]), "known");
    eq(json(await ctx.catalog.knownExpansionCodes(["FOSSSIL"])), json([]), "not known");
    eq(json(await ctx.catalog.knownExpansionCodes([])), json([]), "nothing asked, nothing said");
    eq(json(await ctx.catalog.knownExpansionCodes(null)), json([]), "and it does not throw");
  });

  test("the lookup answers in the currency the WRITE uses, which is case-folded", async () => {
    /* THE DEFECT THIS REPLACES. The first version looked rows up by the folded
       natural key and then filtered the answer against the stored `code`
       column, which `putExpansion` never rewrites — so a catalog holding
       `fossil`, asked about `FOSSIL`, answered "no", and the import then reused
       the existing row anyway. The preflight told the operator a release was
       new in exactly the case where the run was about to merge into an old one
       and rename it. */
    const ctx = await world();
    const lower = { expansions: { fossil: "fossil" }, variants: VARIANTS };
    await importCatalog({ catalog: ctx.catalog, db: ctx.db, provider: "probe",
      vocabulary: lower, records: [GOOD] });
    eq(json(await ctx.catalog.knownExpansionCodes(["FOSSIL"])), json(["FOSSIL"]),
      "a differently-cased spelling of a release the catalog holds is not new");
    eq(json(await ctx.catalog.knownExpansionCodes(["fossil"])), json(["fossil"]),
      "and the answer comes back in the caller's own spelling");
  });

  test("the report agrees with what the run actually creates, whatever the case", async () => {
    const ctx = await world();
    await doImport(ctx, [GOOD]);
    const cased = { expansions: { other: "Fossil" }, variants: VARIANTS };
    const record = { ...GOOD, providerExpansionId: "other", providerCardId: "other-1",
      collectorNumber: "1", cardName: "Aerodactyl" };
    const summary = await importCatalog({ catalog: ctx.catalog, db: ctx.db, provider: "probe",
      vocabulary: cased, records: [record] });
    eq(json(summary.expansions.opening), json([]),
      "the preflight promised a new release the run did not create");
    eq(summary.created.expansions, 0, "and none was created");
    eq(summary.reused.expansions, 1, "the existing one was reused");
    eq(await countOf(ctx, "expansions"), 1, "one release, as the domain keys it");
  });

  test("two spellings of one release in a single run are one release", async () => {
    const ctx = await world();
    const both = { expansions: { a: "FOSSIL", b: "fossil" }, variants: VARIANTS };
    const records = [
      { ...GOOD, providerExpansionId: "a", providerCardId: "a-1" },
      { ...GOOD, providerExpansionId: "b", providerCardId: "b-1", collectorNumber: "3",
        cardName: "Muk" },
    ];
    const dry = await importCatalog({ catalog: ctx.catalog, db: ctx.db, provider: "probe",
      vocabulary: both, records, dryRun: true });
    eq(dry.expansions.opening.length, 1,
      "the operator was promised two releases and would have got one");
    const real = await importCatalog({ catalog: ctx.catalog, db: ctx.db, provider: "probe",
      vocabulary: both, records });
    eq(real.created.expansions, 1, "one was created");
    eq(await countOf(ctx, "expansions"), 1, "and one exists");
  });

  test("a catalog that cannot answer says it does not know, not that nothing exists", async () => {
    const ctx = await world();
    await doImport(ctx, [GOOD]);
    /* Two ways a lookup can fail to answer, and neither may produce the
       positive claim "this release is new" — which is the opposite of true
       here, since FOSSIL demonstrably exists. */
    const withoutLookup = { ...ctx.catalog };
    delete withoutLookup.knownExpansionCodes;
    const breaking = { ...ctx.catalog,
      knownExpansionCodes: async () => { throw new Error("connection terminated unexpectedly"); } };
    for (const [label, catalog] of [["absent", withoutLookup], ["failing", breaking]]) {
      const summary = await importCatalog({ catalog, db: ctx.db, provider: "probe",
        vocabulary: VOCAB, records: [GOOD], dryRun: true });
      eq(summary.expansions.known, false, `${label}: the report claims to know`);
      eq(json(summary.expansions.opening), json([]), `${label}: it named a release anyway`);
      eq(json(summary.expansions.touched), json(["FOSSIL"]),
        `${label}: what the run touches is still knowable without the lookup`);
    }
  });

  test("a lookup that fails does not throw out of the run", async () => {
    /* Nothing has been written when the preflight runs and nothing depends on
       it, so an advisory read that fails must not be the one thing that escapes
       C4's contract that a run returns a summary naming what happened. */
    const ctx = await world();
    const breaking = { ...ctx.catalog,
      knownExpansionCodes: async () => { throw new Error("connection terminated unexpectedly"); } };
    const summary = await importCatalog({ catalog: breaking, db: ctx.db, provider: "probe",
      vocabulary: VOCAB, records: [GOOD] });
    eq(summary.status, "complete", "an advisory read took the run down");
    eq(summary.mappable, 1, "and the summary still says what happened");
    eq(await countOf(ctx, "canonical_cards"), 1, "and the card still landed");
  });

  test("only the records this run processes name a release", async () => {
    /* --limit is an operator's sanity check, and it must describe the run it
       actually performed rather than the file it was handed. */
    const ctx = await world();
    const two = { expansions: { fossil: "FOSSIL", jungle: "JUNGLE" }, variants: VARIANTS };
    const records = [GOOD,
      { ...GOOD, providerExpansionId: "jungle", providerCardId: "j-1", collectorNumber: "1",
        cardName: "Clefable" }];
    const limited = await importCatalog({ catalog: ctx.catalog, db: ctx.db, provider: "probe",
      vocabulary: two, records, limit: 1, dryRun: true });
    eq(json(limited.expansions.touched), json(["FOSSIL"]),
      "a limited run named a release it was never going to reach");
    const whole = await importCatalog({ catalog: ctx.catalog, db: ctx.db, provider: "probe",
      vocabulary: two, records, dryRun: true });
    eq(json(whole.expansions.touched), json(["FOSSIL", "JUNGLE"]), "the whole file names both");
  });
});

/* ============================================================== E */
describe("E. a dry run and a real run classify identically", () => {

  /* Built ONCE, so the two modes see byte-identical input — `without` mints a
     fresh id each call, which would otherwise make the comparison meaningless. */
  const MIXED = Object.freeze([
    GOOD,
    without("providerCardId"),
    without("providerCardId", "cardName"),
    without("cardName"),
    { ...GOOD, providerCardId: "fossil-7", providerVariantKey: "somethingElse" },
    "not a record at all",
  ]);

  test("every counter agrees across the two modes", async () => {
    const dryCtx = await world();
    const dry = await doImport(dryCtx, MIXED, { dryRun: true });
    const realCtx = await world();
    const real = await doImport(realCtx, MIXED);
    for (const key of ["read", "processed", "mappable", "quarantined", "rejected"]) {
      eq(dry[key], real[key], `${key} differs between a dry run and a real one`);
    }
    eq(json(dry.quarantineReasons), json(real.quarantineReasons), "quarantine reasons differ");
    eq(json(dry.rejectionReasons), json(real.rejectionReasons), "rejection reasons differ");
    eq(json(dry.expansions), json(real.expansions), "the releases named differ");
  });

  test("and the dry run wrote nothing while the real one did", async () => {
    const ctx = await world();
    await doImport(ctx, MIXED, { dryRun: true });
    eq(await countOf(ctx, "canonical_cards"), 0, "a dry run wrote a card");
    eq(await countOf(ctx, "source_mappings"), 0, "a dry run wrote a mapping");
    await doImport(ctx, MIXED);
    eq(await countOf(ctx, "canonical_cards"), 1, "the real run wrote the good card");
    eq(await countOf(ctx, "source_mappings"), 3, "and queued what it could key");
  });

  test("the summary shape is the same either way", async () => {
    const ctx = await world();
    const dry = await doImport(ctx, [GOOD], { dryRun: true });
    const real = await doImport(ctx, [GOOD]);
    assert(dry.expansions && Array.isArray(dry.expansions.opening),
      "a dry run has no expansions report");
    assert(real.expansions && Array.isArray(real.expansions.opening),
      "a real run has no expansions report");
    eq(dry.created, null, "a dry run must not claim to know what it would create");
    assert(real.created, "a real run reports what it created");
  });
});

run();
