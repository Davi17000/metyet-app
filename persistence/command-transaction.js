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

   `alongside` — SOMETHING THAT MUST COMMIT WITH THE WORLD, OR NOT AT ALL
   (Phase 5 Batch 2). One caller needs a write OUTSIDE the canonical world to
   land in the same transaction as one inside it: creating a Collector
   invitation mints a credential, and the credential lives in `metyet_auth`
   because the world repository must never carry one. An invitation with no
   credential, or a credential with no invitation, would each be wreckage
   somebody has to find.

   So a caller may pass a function, which runs inside this transaction after the
   world is saved and before it commits. It receives the transaction and what
   the command produced; anything it throws rolls the world change back with it.
   This layer still knows nothing about auth — it just holds the door open.

   Every other caller passes nothing, and `POST /api/commands` is one of them:
   the generic route has no hook to offer, so no ordinary command can acquire a
   second write this way. */

const C = require("../domain/metyet-commands.js");
const RT = require("../domain/metyet-runtime.js");
const { validateWorld } = require("../domain/metyet-world.js");
const { PersistenceError, CODES, summarise } = require("./errors.js");

const ROLLBACK = Symbol("metyet.refused-rollback");

async function executeCommand(repository, { actor, command, payload, runtime, alongside = null } = {}) {
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
      /* Inside the transaction, after the save, before the commit. A throw here
         takes the world change with it. */
      const extra = typeof alongside === "function"
        ? await alongside(tx, { value: result.value, version: saved.version })
        : null;
      return { ok: true, value: result.value, version: saved.version, world: result.state,
        changes: saved.changes, extra };
    });
  } catch (error) {
    if (error === ROLLBACK) return refusal;
    throw error;
  }
}

/* ============================================================================
   SEVERAL COMMANDS, ONE COMMIT (Phase 5 C8)

   One HTTP request is one command is one transaction, and that is right: a
   request is one person doing one thing. An operator importing four hundred
   inventory rows from a file is not that. Run those as four hundred
   transactions and a database fault at row two hundred leaves a shop with half
   a shelf and no record of which half — so the fold lives here, beside the
   single-command version, using the same lock, the same validation and the same
   domain.

   IT IS THE SAME WRITE PATH, DELIBERATELY. Every row goes through `C.execute`
   with the same actor and the same command a person clicking Save goes through;
   nothing here relaxes a check, skips `validateWorld`, or writes a row itself.
   The only difference is where the commit is. A second inventory write path is
   exactly what this exists to avoid.

   ALL OR NOTHING, AND A REFUSAL IS A FAULT. If any command refuses, the whole
   batch rolls back and the refusal is reported with the index that produced it.
   A half-applied file is not a smaller success; it is a shelf nobody can
   reconcile against the file it came from.

   ONE VERSION BUMP. The world is loaded once, folded through every command, and
   validated once at the end — so `expectedVersion` is checked against the
   version the batch read, and a concurrent writer loses the race rather than
   interleaving with it. */
async function executeCommands(repository, { actor, commands, runtime } = {}) {
  if (!RT.isRuntime(runtime) || runtime.mode !== RT.MODES.authoritative) {
    throw new PersistenceError(CODES.runtimeNotAuthoritative,
      "executeCommands requires an authoritative runtime (systemRuntime); the prototype runtime trusts caller times and ids.");
  }
  const batch = Array.isArray(commands) ? commands : [];
  if (!batch.length) throw new TypeError("executeCommands: at least one command is required");

  let refusal = null;
  try {
    return await repository.withTransaction(async (tx) => {
      await repository.lockWorld(tx);
      const version = await repository.readVersion(tx);
      let state = await repository.loadWorld(tx);
      const values = [];
      for (let at = 0; at < batch.length; at += 1) {
        const { command, payload } = batch[at] || {};
        const result = C.execute(state, actor, command, payload, runtime);
        if (!result.ok) {
          refusal = { ok: false, refused: result.refused, at, version };
          throw ROLLBACK;
        }
        state = result.state;
        values.push(result.value);
      }
      /* ONCE, AT THE END, AND HERE IS THE HONEST REASON (Phase 5 C8, corrected
         after review). A first draft said "every intermediate state was produced
         by a command that already validated its own change" — which is false:
         `C.execute` never calls `validateWorld`, and the only per-command
         validation MetYet has is the one in `executeCommand` directly above.

         The real reason is narrower and true: only the FINAL state is persisted,
         and a command that refuses rolls the whole batch back, so an intermediate
         state is never durable and never observed. What must be valid is what is
         written. A batch that could produce a valid end state through an invalid
         middle one is a batch whose commands disagree about an invariant, and
         that is a domain question rather than something this loop can rescue. */
      const check = validateWorld(state);
      if (!check.ok) {
        throw new PersistenceError(CODES.invalidNextWorld,
          `a batch of ${batch.length} commands produced an invalid world, so nothing was saved: `
          + summarise(check.errors),
          { details: { count: batch.length, errors: check.errors } });
      }
      const saved = await repository.saveWorld(state, tx, { expectedVersion: version });
      return { ok: true, values, version: saved.version, world: state, changes: saved.changes };
    });
  } catch (error) {
    if (error === ROLLBACK) return refusal;
    throw error;
  }
}

module.exports = { executeCommand, executeCommands };
