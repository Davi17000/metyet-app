/* ============================================================================
   OPENING AN INVITATION — THE OFFER AND ITS SECRET, TOGETHER OR NEITHER

     openCollectorInvitation({ repository, credentials, runtime },
                             { actor, recipient, note })
       -> { ok: true,  invitationId, token, version, world }
        | { ok: false, refused, version }

   Two things have to happen and neither is any use alone: a canonical
   invitation in the world, and the credential that will redeem it in
   `metyet_auth`. An invitation nobody can accept is a dead row; a credential
   for an invitation that does not exist is a secret pointing at nothing. So
   they commit together or not at all.

   WHY THIS IS NOT JUST `POST /api/commands`. That route answers with the
   actor's projection, and the credential must never be in one — a projection is
   read again on every refresh, and a secret that can be re-read is not shown
   once. So the credential travels beside the projection, in a reply this route
   sends exactly one of, and the canonical mutation still goes through the
   ordinary command transaction underneath. `POST /api/registration/partner` is
   the precedent: the one route that takes a step differently, because it is
   both product state and auth state at once.

   THE DOMAIN STILL DECIDES. `executeCommand` runs `inviteCollector` exactly as
   it runs every other command — the world lock first, the version read inside
   it, the domain's own rules, `validateWorld`, and a save against the version
   that was loaded. This file adds no product rule and repeats none. What it
   adds is one function handed to that transaction, which mints the credential
   after the world is saved and before it commits.

   NOTHING THE CALLER SAYS IS AUTHORITY. The inviting partner is the actor an
   authenticated session resolved to. The invitation's id and both its
   timestamps are the runtime's. The credential is the server's, from the
   runtime's own CSPRNG. A recipient and a note are the only things a person
   typed, and neither decides who may redeem anything.
   ========================================================================== */

const { executeCommand } = require("../persistence/command-transaction.js");
const RT = require("../domain/metyet-runtime.js");
const { PersistenceError, CODES } = require("../persistence/errors.js");

const COMMAND = "inviteCollector";

async function openCollectorInvitation({ repository, credentials, runtime } = {},
  { actor, recipient = null, note = null, deliverTo = null } = {}) {
  if (!repository || !credentials) {
    throw new TypeError("openCollectorInvitation: a repository and a credential directory are required");
  }
  if (!RT.isRuntime(runtime) || runtime.mode !== RT.MODES.authoritative) {
    throw new PersistenceError(CODES.runtimeNotAuthoritative,
      "opening an invitation requires an authoritative runtime (systemRuntime); the prototype runtime "
      + "trusts caller times and ids.");
  }
  if (!actor || typeof actor !== "object") {
    throw new TypeError("openCollectorInvitation: the authenticated actor is required");
  }

  /* The token is minted inside the transaction and carried out here, so a
     rollback anywhere means there is nothing to carry. */
  let token = null;

  const result = await executeCommand(repository, {
    actor,
    command: COMMAND,
    /* Exactly what a person typed, and nothing else. */
    payload: { recipient, note },
    runtime,
    alongside: async (tx, { value }) => {
      const issued = await credentials.issue({ invitationId: value, tx });
      token = issued.token;
      /* WHERE IT WILL BE SENT IS COMMITTED WITH IT (Phase 5 Batch 3B-2), in
         this same transaction and therefore under the same rollback. The
         address was typed before anything was sent, so it belongs here. The
         provider's answer does not and cannot: the provider is not in this
         transaction and must never be asked from inside one, because an
         external round trip would hold the global world lock for as long as a
         third party took to answer.

         A SECOND STATEMENT RATHER THAN A WIDER `issue`. Minting a credential is
         one thing and recording where MetYet will send it is another; keeping
         them apart leaves `issue` exactly the operation Batch 2 proved, and
         leaves an invitation with no address taking exactly the path it took
         before this batch existed. */
      if (deliverTo) await credentials.requestDelivery(value, { to: deliverTo, tx });
      return issued.credential;
    },
  });

  if (!result.ok) return { ok: false, refused: result.refused, version: result.version };
  return { ok: true, invitationId: result.value, token, version: result.version, world: result.world };
}

module.exports = { openCollectorInvitation, COMMAND };
