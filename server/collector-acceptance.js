/* ============================================================================
   ACCEPTING AN INVITATION — ONE PERSON, ONE IDENTITY, ANY NUMBER OF NETWORKS

     acceptCollectorInvitation({ repository, accounts, credentials, runtime },
                               { token, subject })
       -> { ok: true,  collectorId, accountId, invitationId, partnerId, version,
            converged }
        | { ok: false, refused }

   This is the batch the whole of Batch 2 was shaped for. An invitation names
   nobody; possession of its credential plus an authenticated identity is what
   turns it into a Relationship, and this is where that happens.

   WHY IT IS NOT A COMMAND, AND NOT `alongside`. The person redeeming may be
   authenticated at the provider and be NOBODY in MetYet — no partnerId, no
   collectorId, nothing resolveActor can turn into a seat. So execute() cannot
   run it and POST /api/commands cannot reach it, which is the guarantee we
   want rather than a limitation we tolerate. Batch 2's `alongside` hook cannot
   express this either: it runs after saveWorld, and this needs the credential
   claimed BEFORE the domain step (the claim is what names the invitation) and
   the account bound AFTER it (the binding needs the id the domain minted). So
   this is its own transaction, following server/registration.js — the only
   other authoring path whose authority is a redeemed invitation.

   ────────────────────────────────────────────────────────────────────────────
   THE ORDER, AND THE ONE STEP THAT DECIDES WHETHER THIS IS CORRECT
   ────────────────────────────────────────────────────────────────────────────

     1  lockWorld(tx)                     the first statement
     2  readVersion(tx)
     3  accounts.findActiveBySubject      ** INSIDE THE LOCK **
     4  credentials.claim / findSpentBy
     5  loadWorld(tx)
     6  acceptCollectorInvitation         the domain decides
     7  validateWorld -> saveWorld(expectedVersion)
     8  accounts.linkAccount              only when the person is new
     commit

   STEP 3 IS THE WHOLE DESIGN. registration.js asks its identity provider BEFORE
   the transaction opens, deliberately: that is a network round trip and the
   transaction holds a global lock. This is a local SELECT, and copying that
   reasoning here would be the bug.

   Two Trusted Partners invite the same unknown person, who redeems both at
   once. Inside the lock: the first transaction finds no account, mints a
   Collector, binds it, commits. The second waits on the lock; when it gets it,
   its account lookup is a fresh statement under READ COMMITTED and sees the row
   the first one committed — so it reuses that Collector and appends a second
   Relationship. One person, one identity, two networks.

   Outside the lock, both would have decided "no account" before either
   committed, and the second linkAccount would violate accounts_active_subject_key
   — a spurious refusal, a spent credential, and a person who has to ask for a
   new invitation. READ COMMITTED is chosen for exactly this reason in
   persistence/database.js, and this function is what depends on it.

   A single-connection test database cannot tell these two apart, because there
   the second transaction runs after the first either way. So the ordering is
   asserted structurally, and proved against real Postgres on a real pool
   out of band. Both are in the Batch 3A suite.

   ────────────────────────────────────────────────────────────────────────────
   WHAT IT REFUSES, AND HOW LITTLE IT SAYS
   ────────────────────────────────────────────────────────────────────────────

   `invitation-unusable` covers six causes: no such credential, malformed,
   already spent by somebody else, expired, withdrawn, already accepted. They
   are one answer because telling them apart would let somebody with a list of
   guesses learn which credentials are real. registration.js set that precedent.

   `already-a-partner` is the one refusal that names its cause, and it is
   checked FIRST — before the credential is read at all. A Trusted Partner
   submitting a guess therefore learns nothing about whether the guess was good,
   and no wrong-seat attempt can spend somebody's invitation.

   EMAIL IS NEVER ASKED FOR. There is no identity call in this file. Not to
   compare an address, not to record one, not at all — the surest way to keep a
   delivery address from becoming authority is never to fetch it. The recipient
   hint on the invitation is the inviting partner's own label and is read by
   nothing here.

   A REFUSAL BURNS NOTHING. Every refusal throws ROLLBACK, so a claim made on
   the way to one is undone and the credential stays spendable. Somebody who
   redeems while signed in as the wrong person can sign in again and try.

   A LOST REPLY IS RECOVERABLE. If the transaction committed and the answer
   never arrived, the credential is spent — by this subject. `findSpentBy` says
   so, and the retry converges on success with the current projection instead of
   reporting a dead invitation. That is why `claimed_by` is written.
   ========================================================================== */

const RT = require("../domain/metyet-runtime.js");
const { validateWorld } = require("../domain/metyet-world.js");
const { acceptCollectorInvitation: accept } = require("../domain/metyet-registration.js");
const { PersistenceError, CODES, summarise } = require("../persistence/errors.js");

const ROLLBACK = Symbol("metyet.acceptance-refused");

const REFUSALS = Object.freeze({
  invitationUnusable: "invitation-unusable",
  alreadyAPartner: "already-a-partner",
  alreadyLinked: "already-linked",
});

async function acceptCollectorInvitation({ repository, accounts, credentials, runtime } = {},
  { token, subject } = {}) {
  if (!repository || !accounts || !credentials) {
    throw new TypeError("acceptCollectorInvitation: a repository, an account directory and a "
      + "credential directory are required");
  }
  if (!RT.isRuntime(runtime) || runtime.mode !== RT.MODES.authoritative) {
    throw new PersistenceError(CODES.runtimeNotAuthoritative,
      "accepting an invitation requires an authoritative runtime (systemRuntime); the prototype "
      + "runtime trusts caller times and ids.");
  }
  if (typeof subject !== "string" || !subject) {
    throw new TypeError("acceptCollectorInvitation: the verified subject is required");
  }
  /* A missing or malformed credential is refused exactly as an unknown one is,
     and without touching anything. */
  if (typeof token !== "string" || !token) return { ok: false, refused: REFUSALS.invitationUnusable };

  /* One clock reading for the whole redemption: the expiry check, the
     acceptance stamp, the Relationship's start and the claim all agree about
     when "now" was. */
  const ctx = RT.callContext(runtime, undefined);

  let refusal = null;
  try {
    return await repository.withTransaction(async (tx) => {
      /* 1, 2 — the lock first, then the version it is being read against. */
      await repository.lockWorld(tx);
      const version = await repository.readVersion(tx);

      /* 3 — WHO IS THIS SUBJECT? Inside the lock. See the header. */
      const existing = await accounts.findActiveBySubject(subject, { tx });
      if (existing && existing.role === "tp") {
        /* Before the credential is read, so a wrong-seat attempt cannot spend
           one and learns nothing about whether it was real. */
        refusal = { ok: false, refused: REFUSALS.alreadyAPartner };
        throw ROLLBACK;
      }
      const knownCollectorId = existing ? existing.actor.collectorId : null;

      /* 4 — the credential. One statement carries both of its rules. */
      let claimed = await credentials.claim(token, { at: ctx.at, by: subject, tx });
      let converged = false;
      if (!claimed) {
        /* Spent. By this person, or not at all — and only the first of those is
           an answer they are entitled to. */
        const mine = await credentials.findSpentBy(token, subject, { tx });
        if (!mine) {
          refusal = { ok: false, refused: REFUSALS.invitationUnusable };
          throw ROLLBACK;
        }
        claimed = mine;
        converged = true;
      }

      /* 5 — the world, under the lock this transaction already holds. */
      const world = await repository.loadWorld(tx);

      if (converged) {
        /* This person already did this. Nothing to write; answer with what is
           true now. The invitation must have been accepted by the Collector
           this subject resolves to — anything else means the two tables
           disagree, which is a fault rather than a refusal. */
        const invitation = (world.invitations || []).find((i) => i.id === claimed.invitationId) || null;
        if (!invitation || !invitation.acceptedAt || !invitation.collectorId
          || (knownCollectorId && invitation.collectorId !== knownCollectorId)) {
          throw new PersistenceError(CODES.invalidNextWorld,
            "a credential was spent by this subject but the invitation it names is not accepted by "
            + "them; the canonical world and the credential directory disagree.",
            { details: { invitationId: claimed.invitationId } });
        }
        return { ok: true, collectorId: invitation.collectorId, accountId: existing && existing.accountId,
          invitationId: invitation.id, partnerId: invitation.partnerId, version, converged: true };
      }

      /* 6 — the domain decides. It resolves or mints the Collector, converges
         the Relationship, and stamps the invitation. */
      const result = accept(world, { invitationId: claimed.invitationId, collectorId: knownCollectorId }, ctx);
      if (!result.ok) {
        refusal = { ok: false, refused: REFUSALS.invitationUnusable };
        throw ROLLBACK;
      }

      /* 7 — validate, then save against the version this transaction loaded. */
      const check = validateWorld(result.state);
      if (!check.ok) {
        throw new PersistenceError(CODES.invalidNextWorld,
          `accepting an invitation produced an invalid world, so nothing was saved: ${summarise(check.errors)}`,
          { details: { errors: check.errors } });
      }
      const saved = await repository.saveWorld(result.state, tx, { expectedVersion: version });

      /* 8 — bind, but only for somebody new. An existing Collector account is
         reused, which is what lets one person join a second network. */
      let accountId = existing ? existing.accountId : null;
      if (!existing) {
        try {
          const account = await accounts.linkAccount(
            { subject, role: "collector", collectorId: result.value.collectorId }, tx);
          accountId = account.accountId;
        } catch (error) {
          if (error && error.code === "account.already-active") {
            /* The lock should have made this unreachable; if the database
               refuses anyway, it is right and this is a refusal, not a crash. */
            refusal = { ok: false, refused: REFUSALS.alreadyLinked };
            throw ROLLBACK;
          }
          throw error;
        }
      }

      const invitation = result.state.invitations.find((i) => i.id === claimed.invitationId);
      return { ok: true, collectorId: result.value.collectorId, accountId,
        invitationId: claimed.invitationId, partnerId: invitation.partnerId,
        version: saved.version, converged: false,
        collectorCreated: result.value.collectorCreated,
        relationshipCreated: result.value.relationshipCreated };
    });
  } catch (error) {
    if (error === ROLLBACK) return refusal;
    throw error;
  }
}

module.exports = { acceptCollectorInvitation, REFUSALS };
