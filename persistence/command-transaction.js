/* ============================================================================
   THE COMMAND TRANSACTION — ONE CANONICAL MUTATION, DURABLY

     executeCommand(repository, { actor, command, payload, runtime })
       -> { ok: true,  value, version, world, changes }
        | { ok: false, refused, version }

   The persistence half of the future server flow, with no HTTP in it:

     1  open a transaction
     2  take the world lock (first statement, so the load below is current)
     3  read the world version
     4  load the canonical world (validated by the repository)
     5  execute(world, actor, command, payload, runtime) — the domain decides
     6  refused  -> roll back; nothing was written, nothing is
     7  succeeded -> validate the next world; invalid -> roll back
     8  save only what changed, from the version loaded in 3
     9  commit, which releases the lock

   Any error at any step rolls the whole transaction back. The business rules are
   execute()'s alone; this function neither checks nor repeats any of them.

   AUTHORITY. `actor` must be the identity an authenticated session resolved to
   — never a value taken from a request body. This layer accepts it as given and
   execute() derives the seat from it; nothing in `payload` is authority.
   `runtime` must be authoritative (systemRuntime in production): the prototype
   adapter, which honours caller-supplied times and ids, is refused here.
   ========================================================================== */

const C = require("../domain/metyet-commands.js");
const RT = require("../domain/metyet-runtime.js");
const { validateWorld } = require("../domain/metyet-world.js");
const { PersistenceError, CODES, summarise } = require("./errors.js");

const ROLLBACK = Symbol("metyet.refused-rollback");

async function executeCommand(repository, { actor, command, payload, runtime } = {}) {
  if (!RT.isRuntime(runtime) || runtime.mode !== RT.MODES.authoritative) {
    throw new PersistenceError(CODES.runtimeNotAuthoritative,
      "executeCommand requires an authoritative runtime (systemRuntime); the prototype runtime trusts caller times and ids.");
  }
  let refusal = null;
  try {
    return await repository.withTransaction(async (tx) => {
      await repository.lockWorld(tx);
      const version = await repository.readVersion(tx);
      const world = await repository.loadWorld(tx);
      const result = C.execute(world, actor, command, payload, runtime);
      if (!result.ok) {
        refusal = { ok: false, refused: result.refused, version };
        throw ROLLBACK;
      }
      const check = validateWorld(result.state);
      if (!check.ok) {
        throw new PersistenceError(CODES.invalidNextWorld,
          `"${command}" produced an invalid world, so nothing was saved: ${summarise(check.errors)}`,
          { details: { command, errors: check.errors } });
      }
      const saved = await repository.saveWorld(result.state, tx, { expectedVersion: version });
      return { ok: true, value: result.value, version: saved.version, world: result.state, changes: saved.changes };
    });
  } catch (error) {
    if (error === ROLLBACK) return refusal;
    throw error;
  }
}

module.exports = { executeCommand };
