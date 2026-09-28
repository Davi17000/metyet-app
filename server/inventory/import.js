/* ============================================================================
   THE INVENTORY IMPORT RUNNER (Phase 5 C8)

   Reads what the mapper made of a file, asks the catalog which cards those rows
   mean, sorts them into what can be imported and what cannot, and — only when
   the operator says so in a separate breath — writes the importable ones through
   the command a Trusted Partner's own screen uses.

   PROVIDER-NEUTRAL, LIKE THE CATALOG RUNNER IT SITS BESIDE. This file knows
   nothing about Collectr, Card Ladder, or any product. It knows about a mapper,
   a catalog and a command. Which source a file came from is the template's
   business, and the template is configuration.

   TWO PHASES AND THEY ARE DIFFERENT INVOCATIONS, NOT A FLAG ON ONE. A preview
   cannot write because a preview is a run that was never handed a repository to
   write with — not because a boolean said not to. A boolean is one typo away
   from a shelf full of cards nobody approved; a missing argument is a different
   kind of thing. `plan()` classifies and returns; `apply()` is the only function
   in this file that can write, and it takes the plan it was given rather than
   re-deciding anything.

   NOTHING IS SILENTLY DROPPED. Every row of the file comes back in exactly one
   bucket with a reason attached. A row MetYet cannot understand is evidence, and
   with the catalog as thin as it is today most rows will be evidence — which is
   the point of running this before there is a catalog worth importing against.

   RE-RUNS ARE NOT IDEMPOTENT AND THIS DOES NOT PRETEND OTHERWISE. An inventory
   copy has no natural key: `invId` is minted fresh on every write, so importing
   the same file twice puts the same cards on the shelf twice. MetYet has not
   decided what a source row's durable identity is, and inventing one here —
   hashing the row, trusting the source's own id — would be deciding it in a
   corner. So the plan SAYS how many copies the shelf already holds of each card
   it is about to add, and the operator decides. That is the honest pilot
   behaviour: a warning an operator reads, not a guess a runner makes.
   ============================================================================ */

const { parseCsv, createMapper, COPY_KEYS } = require("./mapping.js");
const { resolveIdentity, OUTCOME } = require("./resolve.js");
const { executeCommands } = require("../../persistence/command-transaction.js");

const CLASS = Object.freeze({
  importable: "importable",
  unresolved: "unresolved",
  ambiguous: "ambiguous",
  invalid: "invalid",
});

/* One run, one shelf, one lock. Past this a file should be split, which an
   operator can do and a runner cannot do for them. */
const MAX_COPIES = 2000;

const tally = () => {
  const counts = {};
  return { add: (k) => { counts[k] = (counts[k] || 0) + 1; }, counts };
};

/* ------------------------------------------------------------------- THE PLAN

   `plan({ csv, mapper, catalog, partnerId, world })` — reads, maps, resolves and
   classifies. Takes no repository and cannot write. `world` is optional and is
   used only to count what the shelf already holds, so that a re-run is visible
   before it happens rather than afterwards. */
async function plan({ csv, mapper, catalog, partnerId, world = null, limit = null } = {}) {
  if (!mapper || typeof mapper.normalize !== "function") {
    throw new TypeError("inventory import: a mapper is required");
  }
  if (!catalog || typeof catalog.findCardIdentity !== "function") {
    throw new TypeError("inventory import: a catalog repository is required");
  }
  if (typeof partnerId !== "string" || !partnerId.trim()) {
    throw new TypeError("inventory import: a partner is required");
  }

  const { headers, rows, lines } = parseCsv(csv);
  const columns = mapper.columnsFor(headers);
  const take = Number.isInteger(limit) && limit > 0 ? limit : rows.length;
  const chosen = rows.slice(0, take);
  const chosenLines = lines.slice(0, take);

  /* What the shelf already holds, per canonical card. Read from the world the
     caller handed over; this file does not go looking for one. */
  const already = new Map();
  for (const copy of (world && Array.isArray(world.inventory) ? world.inventory : [])) {
    if (copy.partnerId !== partnerId || copy.archived === true) continue;
    const id = copy.canonicalCardId;
    if (typeof id === "string" && id) already.set(id, (already.get(id) || 0) + 1);
  }

  const importable = [];
  const rejected = [];
  const reasons = tally();
  /* Resolution is cached by the identity a row states, because a file of four
     hundred rows is usually a few dozen distinct cards and every lookup is a
     round trip. The key is the stated identity and nothing else, so two rows
     that state different printings are never one cache entry. */
  const cache = new Map();

  for (let at = 0; at < chosen.length; at += 1) {
    /* THE LINE IN THE FILE, counted by the parser where the newlines are — not
       the row's position, which drifts from the line the moment a blank
       separator row or a quoted newline appears. */
    const line = chosenLines[at];
    const mapped = mapper.normalize(chosen[at], headers, { at: line });
    if (!mapped.ok) {
      reasons.add(mapped.invalid.reason);
      rejected.push({ line, klass: CLASS.invalid, reason: mapped.invalid.reason,
        detail: mapped.invalid.detail, field: mapped.invalid.field, source: mapped.source });
      continue;
    }

    const { identity, copy, quantity, source } = mapped.record;
    const key = JSON.stringify([identity.expansion, identity.collectorNumber,
      identity.cardName.toLowerCase(), identity.dimensions]);
    if (!cache.has(key)) cache.set(key, await resolveIdentity(catalog, identity));
    const found = cache.get(key);

    if (found.outcome !== OUTCOME.resolved) {
      const klass = found.outcome === OUTCOME.ambiguous ? CLASS.ambiguous : CLASS.unresolved;
      reasons.add(found.reason);
      rejected.push({ line, klass, reason: found.reason, detail: found.detail,
        identity, candidates: found.candidates || [], source });
      continue;
    }

    importable.push({
      line, source, quantity,
      card: found.card,
      /* The payload as `addInventoryCopy` will receive it, assembled HERE so a
         preview shows exactly what a write would send. Nothing is added to it
         later: the command does not whitelist its input, so a stray field would
         live on the row for ever. */
      copy: { canonicalCardId: found.card.canonicalCardId, ...copy },
      alreadyOnShelf: already.get(found.card.canonicalCardId) || 0,
    });
  }

  const copies = importable.reduce((n, r) => n + r.quantity, 0);
  /* A CAP ON THE WHOLE RUN, not only on a row. `--limit` bounds rows read and
     says nothing about copies, so one mistyped quantity cell could still hold
     the world lock while it materialised thousands of rows. This is a refusal
     an operator can see and split, rather than a transaction nobody can stop. */
  const tooMany = copies > MAX_COPIES ? copies : null;
  return {
    template: mapper.template,
    partnerId,
    columns,
    rows: chosen.length,
    skipped: rows.length - chosen.length,
    importable,
    rejected,
    counts: {
      rows: chosen.length,
      importable: importable.length,
      copies,
      unresolved: rejected.filter((r) => r.klass === CLASS.unresolved).length,
      ambiguous: rejected.filter((r) => r.klass === CLASS.ambiguous).length,
      invalid: rejected.filter((r) => r.klass === CLASS.invalid).length,
      reasons: reasons.counts,
    },
    tooMany,
    /* Named so a caller cannot mistake a plan for a result. */
    written: false,
  };
}

/* ------------------------------------------------------------------ THE WRITE

   `apply({ plan, repository, runtime, partnerId })` — writes the plan's
   importable rows and nothing else, in one transaction, through the ordinary
   command.

   THE ACTOR IS THE CALLER'S, NEVER THE FILE'S. `partnerId` is checked against
   the plan it is applying, so a plan made for one shop cannot be written to
   another by changing one argument. Nothing in a CSV can name a partner —
   `portfolio` is carried as a diagnostic and reaches no command — and there is
   no HTTP route here, so there is no anonymous caller to worry about either. */
async function apply({ plan: made, repository, runtime, partnerId, catalog = null } = {}) {
  if (!made || made.written !== false || !Array.isArray(made.importable)) {
    throw new TypeError("inventory import: a plan from plan() is required");
  }
  if (typeof partnerId !== "string" || partnerId.trim() !== made.partnerId) {
    throw new TypeError("inventory import: the partner applying a plan must be the partner it was made for");
  }
  if (made.tooMany) {
    throw new TypeError(`inventory import: ${made.tooMany} copies in one run is more than `
      + `${MAX_COPIES}; split the file`);
  }
  if (!made.importable.length) {
    return { written: 0, refused: null, version: null };
  }

  /* THE CHECK THE HTTP ROUTE MAKES AND THE COMMAND DOES NOT (Phase 5 C8,
     corrected after review). `addInventoryCopy` only looks a card up when the
     payload has NO canonical id — the active-status check lives in the route,
     which calls `findSelectableCanonicalCard` and refuses `card-unavailable`.
     An earlier draft of this runner skipped it, so a printing withdrawn between
     the preview and the approval landed on a shelf: this write path was strictly
     weaker than the one a person clicking Save uses, while its own header
     claimed it was the same. Asked again HERE, at write time, because a plan is
     a photograph of a catalog that can move. */
  if (catalog && typeof catalog.findSelectableCanonicalCard === "function") {
    for (const row of made.importable) {
      if (!(await catalog.findSelectableCanonicalCard(row.card.canonicalCardId))) {
        return { written: 0, version: null,
          refused: { reason: "card-unavailable", at: null, line: row.line } };
      }
    }
  }

  /* Quantity is expanded here rather than in the domain, because MetYet's model
     is one row per physical copy — "three of this card" is three copies, and
     three copies are what a shop can price, photograph and sell separately. */
  const commands = [];
  for (const row of made.importable) {
    /* WHITELISTED AT THE DOOR. `addInventoryCopy` spreads whatever it is handed
       straight onto the row and `updateInventoryCopy` has no way to name a field
       it does not know, so anything extra lives on that copy for ever. A plan is
       an ordinary mutable object and this is the last place that can care. */
    const copy = { canonicalCardId: row.card.canonicalCardId };
    for (const key of COPY_KEYS) if (row.copy[key] !== undefined) copy[key] = row.copy[key];
    for (let n = 0; n < row.quantity; n += 1) {
      commands.push({ command: "addInventoryCopy", payload: { copy: { ...copy } } });
    }
  }

  const result = await executeCommands(repository, {
    actor: { partnerId: partnerId.trim() },
    commands,
    runtime,
  });
  if (!result.ok) {
    /* One refusal fails the batch and nothing was written. The index points at
       the command, so it is mapped back to the file's line for the operator. */
    let seen = 0;
    let line = null;
    for (const row of made.importable) {
      if (result.at >= seen && result.at < seen + row.quantity) { line = row.line; break; }
      seen += row.quantity;
    }
    return { written: 0, refused: { reason: result.refused, at: result.at, line }, version: null };
  }
  return { written: commands.length, refused: null, version: result.version };
}

module.exports = { plan, apply, createMapper, parseCsv, CLASS };
