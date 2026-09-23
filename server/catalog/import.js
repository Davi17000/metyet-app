/* ============================================================================
   THE CATALOG IMPORT RUNNER (Phase 5 C4)

     importCatalog({ catalog, db, provider, vocabulary, records,
                     dryRun, limit, batchSize })  ->  summary

   THE THING THAT WAS MISSING. Batch 5 built the translation boundary and the
   canonical repository, tested both, and shipped no way to run them: no route,
   no CLI verb, no caller of `applyTranslation` outside its own test. So the
   production catalog could only ever be empty, and every command that names a
   card — a Goal, a Collector's copy, a partner's inventory, a binder entry —
   was refused `card-unavailable` for want of anything to name. This is the
   loop, the transaction boundary and the summary. It is not a provider.

   FILE-FED, AND THAT IS THE ADAPTER BOUNDARY. What arrives here is an array of
   source records — the provider-neutral shape `translate` documents. A future
   adapter for an approved provider is a function that produces that array;
   nothing else about this file changes when one exists. Which is why the
   runner can be built, tested and reviewed before any provider decision, and
   why it contains no network call, no credential, no pagination and no retry.

   THREE OUTCOMES PER RECORD, because the boundary has three:

     mapped      a card exists, and a mapping points at it
     quarantined MetYet does not understand it yet; it waits in source_mappings
     rejected    MetYet cannot key it, so it cannot even wait

   The third is counted and named, never stored. Storing it would mean
   inventing a provider id, which is the one thing the catalog's whole identity
   design exists to prevent.

   BATCHES, NOT ONE TRANSACTION AND NOT NONE. Every write goes through a
   caller-supplied `tx`, which matters more than it looks: without one the
   repository puts each statement in its own transaction, so an upsert's
   existence check and its write land separately and two runs can collide. One
   transaction around thirty thousand records would hold locks for the whole
   import and discard everything on the last row's fault. So: batches, and a
   record's expansion, context, card and mapping are atomic together with the
   quarantine rows beside them.

   A FAULT STOPS THE RUN. It does not skip the batch and carry on — a skipped
   batch is silent data loss wearing a success code. The summary names the
   range that failed, and the fix is to run it again: rerun IS the recovery,
   because every write is keyed by a natural key and every id is minted once.

   NOTHING IS EVER REMOVED. A source that stops listing a card means nothing
   here. No withdrawal, no staleness sweep, no set difference — those are how a
   catalog synchroniser deletes the card somebody was hunting for.
   ========================================================================== */

const { createTranslator, applyTranslation, QUARANTINE, REJECTED } = require("./translation.js");

const DEFAULT_BATCH_SIZE = 500;

const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/* A counter that names its own keys, so a reason nobody predicted still lands
   somewhere countable rather than being dropped. */
const tally = () => {
  const counts = Object.create(null);
  return {
    add(key) { counts[key] = (counts[key] || 0) + 1; },
    get total() { return Object.values(counts).reduce((a, b) => a + b, 0); },
    get byReason() { return { ...counts }; },
  };
};

/* ---------------------------------------------------------------- THE RUN */

async function importCatalog({ catalog, db, provider, vocabulary, records,
  dryRun = false, limit = null, batchSize = DEFAULT_BATCH_SIZE } = {}) {
  if (!isObject(catalog)) throw new TypeError("import: a catalog repository is required");
  if (!dryRun && !(db && typeof db.transaction === "function")) {
    throw new TypeError("import: a database is required unless this is a dry run");
  }
  if (!Array.isArray(records)) throw new TypeError("import: records must be an array");

  /* Built first, and deliberately before anything is read or written: a
     vocabulary with a word the domain does not know is an operator's mistake
     in a table they wrote, and it should stop the run at the start rather than
     after nine thousand rows. */
  const translator = createTranslator({ provider, vocabulary });

  const chosen = Number.isInteger(limit) && limit > 0 ? records.slice(0, limit) : records;

  const summary = {
    provider: translator.provider,
    mode: dryRun ? "dry-run" : "write",
    read: records.length,
    processed: chosen.length,
    mappable: 0,
    quarantined: 0,
    rejected: 0,
    quarantineReasons: {},
    rejectionReasons: {},
    ignored: {},
    /* Only ever filled on a real run: a dry run cannot know what a write would
       have created without doing it. */
    created: null,
    reused: null,
    failedBatch: null,
    status: null,
  };

  const quarantineCounts = tally();
  const rejectionCounts = tally();
  const ignoredCounts = tally();

  /* Translate everything first. It is pure, it needs no database, and doing it
     up front means a dry run and a real run classify identically — the only
     difference between them is whether anything is written afterwards. */
  const translated = chosen.map((source) => translator.translate(source));
  for (const t of translated) {
    if (t.ok) {
      summary.mappable += 1;
      for (const what of t.ignored || []) ignoredCounts.add(what);
    } else if (t.rejected) {
      rejectionCounts.add(t.rejected.reason);
    } else {
      quarantineCounts.add(t.quarantine.reason);
    }
  }
  summary.quarantined = quarantineCounts.total;
  summary.rejected = rejectionCounts.total;
  summary.quarantineReasons = quarantineCounts.byReason;
  summary.rejectionReasons = rejectionCounts.byReason;
  summary.ignored = ignoredCounts.byReason;

  if (dryRun) {
    summary.status = statusOf(summary);
    return summary;
  }

  /* WHAT IS NOT COUNTED HERE, AND WHY (Phase 5 C4).

     A `mapped -> quarantined` transition is the clearest early signal that a
     vocabulary has fallen behind a provider, and this runner does not report
     it — because with the repository as it stands it cannot do so honestly.

     The first attempt read the quarantine queue and treated its complement as
     "was mapped before this run". That is wrong twice over: the complement of
     "currently quarantined" also contains every key the database has never
     seen, so a record quarantined on its FIRST sighting was reported as a card
     taken away; and `readQuarantine` clamps to a hundred rows, so past that
     the queue read is truncated and even already-quarantined keys fall into
     the same bucket. Both were measured, not reasoned about.

     Observing it properly needs a read the catalog repository does not offer —
     the mapped rows for a given provider and a given set of keys — and adding
     one is a persistence change this batch has no business making. So the
     counter is absent rather than wrong. The brief asked for it "if safely
     observable"; it is not, yet. */

  const created = { expansions: 0, contexts: 0, cards: 0, mappings: 0 };
  const reused = { expansions: 0, contexts: 0, cards: 0 };

  /* The writable ones, in the order they arrived, so a failed batch names a
     range an operator can find in their file. */
  const writable = [];
  translated.forEach((t, index) => { if (!t.rejected) writable.push({ t, index }); });

  for (let at = 0; at < writable.length; at += batchSize) {
    const batch = writable.slice(at, at + batchSize);
    const first = batch[0].index;
    const last = batch[batch.length - 1].index;
    try {
      /* ONE TRANSACTION, AND EVERY WRITE INSIDE IT GETS THE HANDLE. Passing
         `tx` is not an optimisation: without it the repository runs each
         statement in a transaction of its own, which splits every upsert's
         existence check from its write. */
      /* COUNTED INTO A SCRATCH PAIR, MERGED ONLY ON COMMIT. The first version
         incremented the run's totals inside the callback, so a batch that
         rolled back still reported the rows it had written before the fault —
         the database was consistent and the summary beside it was not. */
      const batchCreated = { expansions: 0, contexts: 0, cards: 0, mappings: 0 };
      const batchReused = { expansions: 0, contexts: 0, cards: 0 };
      await db.transaction(async (tx) => {
        batchCreated.expansions = 0; batchCreated.contexts = 0;
        batchCreated.cards = 0; batchCreated.mappings = 0;
        batchReused.expansions = 0; batchReused.contexts = 0; batchReused.cards = 0;
        for (const { t } of batch) {
          const result = await applyTranslation(catalog, t, { tx });
          /* Every record that reaches here writes exactly one mapping row,
             mapped or quarantined. */
          batchCreated.mappings += 1;
          if (result.quarantined) continue;
          /* The repository said whether each level was minted or found. */
          count(batchCreated, batchReused, "expansions", result.created.expansion);
          count(batchCreated, batchReused, "contexts", result.created.context);
          count(batchCreated, batchReused, "cards", result.created.card);
        }
      });
      for (const key of Object.keys(batchCreated)) created[key] += batchCreated[key];
      for (const key of Object.keys(batchReused)) reused[key] += batchReused[key];
    } catch (error) {
      /* STOP. The batch rolled back whole, so the world is consistent; what is
         not consistent is anybody's belief about how far the run got, and
         carrying on would make that worse. */
      summary.failedBatch = { from: first, to: last, size: batch.length,
        message: safeText(error) };
      /* The batch that failed contributed nothing, because it rolled back. */
      summary.created = created;
      summary.reused = reused;
      summary.status = "failed";
      return summary;
    }
  }

  summary.created = created;
  summary.reused = reused;
  summary.status = statusOf(summary);
  return summary;
}

/* ------------------------------------------------------------- COUNTING */

/* `putExpansion`, `putCardContext` and `putCanonicalCard` each answer whether
   they minted or found, and `applyTranslation` now passes that through. So
   "new" means the database minted a row during this run, not "an id this loop
   had not seen yet" — which would have counted the second card of a release as
   a reused expansion and been right by accident. */
const count = (created, reused, key, wasCreated) => {
  if (wasCreated) created[key] += 1; else reused[key] += 1;
};

/* ---------------------------------------------------------------- STATUS */

const statusOf = (s) => {
  if (s.quarantined || s.rejected) return "completed-with-quarantine";
  return "complete";
};

/* Exit codes the CLI hands to the shell. Distinct from "failed" on purpose: a
   run that quarantined a thousand records has not failed — the good rows
   landed and the rest are queued — but it is emphatically not a clean success,
   and a scheduler must be able to tell without parsing prose. */
const EXIT = Object.freeze({ clean: 0, failure: 1, invalid: 2, quarantine: 3 });
const exitCodeFor = (summary) => {
  if (!summary || summary.status === "failed") return EXIT.failure;
  if (summary.status === "completed-with-quarantine") return EXIT.quarantine;
  return EXIT.clean;
};

/* A message an operator may read. The CLI redacts separately; this is the
   belt: never a record, never a payload, only what went wrong. */
const safeText = (error) => {
  const message = error && error.message ? String(error.message) : String(error);
  return message.replace(/postgres(?:ql)?:\/\/[^\s]*/gi, "<connection string>")
    .replace(/\b(password|secret|token|key)\s*=\s*[^\s,;]+/gi, "$1=<hidden>");
};

module.exports = { importCatalog, exitCodeFor, EXIT, DEFAULT_BATCH_SIZE,
  QUARANTINE, REJECTED };
