/* ============================================================================
   THE EMPTY WORLD — WHAT PRODUCTION STARTS FROM

     emptyWorld()                  -> a canonical world with nothing in it
     bootstrapWorld(repository)    -> { created, version, counts }

   A new production database holds a schema and no world. This makes that state
   explicit and checkable: the collections exist, validateWorld() accepts them,
   and the world version is where it started.

   WHAT IS NOT HERE. No demo seed, no example cards, no placeholder shop, no
   invented collector, no history. Production begins with nothing, and the first
   real records are created by real people through commands. The prototype's
   seeded world is a separate concern (demo.metyet.io) and this file cannot
   reach it: it imports the domain's collection list and nothing else.

   IT WILL NOT OVERWRITE ANYTHING. bootstrapWorld reads what is stored first and
   refuses the moment any collection has a record in it, naming what it found.
   Running it again on an empty world changes nothing and reports the same
   answer, so it is safe in a deploy step or a runbook that is followed twice.
   ========================================================================== */

const { validateWorld, REQUIRED_COLLECTIONS, OPTIONAL_COLLECTIONS } = require("../domain/metyet-world.js");

const COLLECTIONS = [...REQUIRED_COLLECTIONS, ...OPTIONAL_COLLECTIONS];

class BootstrapError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "BootstrapError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/* Every canonical collection, empty. */
const emptyWorld = () => Object.fromEntries(COLLECTIONS.map((name) => [name, []]));

const countsOf = (world) => Object.fromEntries(COLLECTIONS.map((name) => [name, (world[name] || []).length]));

async function bootstrapWorld(repository) {
  const empty = emptyWorld();
  const check = validateWorld(empty);
  if (!check.ok) {
    /* The domain would have to disagree with itself for this to happen. */
    throw new BootstrapError("bootstrap.empty-world-invalid",
      "The empty canonical world is not valid, so production cannot be started from it.", { errors: check.errors });
  }

  const stored = await repository.loadWorld();
  const counts = countsOf(stored);
  const occupied = Object.entries(counts).filter(([, n]) => n > 0);
  if (occupied.length) {
    throw new BootstrapError("bootstrap.world-not-empty",
      `This database already holds a world (${occupied.map(([name, n]) => `${name}: ${n}`).join(", ")}). `
      + "Bootstrapping would overwrite it, so nothing was written.", { counts });
  }

  const saved = await repository.saveWorld(empty);
  return { created: true, version: saved.version, rowsWritten: saved.rowsWritten, counts };
}

module.exports = { emptyWorld, bootstrapWorld, BootstrapError, COLLECTIONS };
