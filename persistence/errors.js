/* ============================================================================
   PERSISTENCE ERRORS

   Every failure the persistence layer raises is a PersistenceError with a
   stable `code`, a sentence saying what to do about it, and — where there is
   one — the underlying cause (a database error) and structured `details`
   (validateWorld diagnostics, the conflicting version, the drifted rows).
   Nothing is swallowed: a failed load never yields a partial world, and a
   failed save rolls the whole transaction back.
   ========================================================================== */

const CODES = Object.freeze({
  invalidWorld: "persistence.invalid-world",          // the stored world fails validateWorld
  invalidInput: "persistence.invalid-input-world",    // saveWorld was handed an invalid world
  invalidNextWorld: "persistence.invalid-next-world", // a command produced an invalid world
  unknownCollection: "persistence.unknown-collection",
  referenceDrift: "persistence.reference-drift",      // relational mirror disagrees with attrs
  lockNotHeld: "persistence.lock-not-held",
  versionConflict: "persistence.version-conflict",
  versionRequired: "persistence.version-required",   // an in-transaction save must say what it loaded
  runtimeNotAuthoritative: "persistence.runtime-not-authoritative",
  migrationChanged: "persistence.migration-changed",
  database: "persistence.database",
});

class PersistenceError extends Error {
  constructor(code, message, { details, cause } = {}) {
    super(message);
    this.name = "PersistenceError";
    this.code = code;
    if (details !== undefined) this.details = details;
    if (cause !== undefined) this.cause = cause;
  }
}

/* Validation diagnostics, summarised for a message; the full list is in details. */
const summarise = (errors, n = 5) => errors.slice(0, n).map((e) => `${e.code} at ${e.path}: ${e.message}`).join("; ")
  + (errors.length > n ? `; and ${errors.length - n} more` : "");

module.exports = { PersistenceError, CODES, summarise };
