/* ============================================================================
   OPEN COLLECTOR REGISTRATION — A VERIFIED PERSON BECOMES A COLLECTOR (B1)

     registerCollectorAccount({ repository, accounts, identity, runtime },
                              { name, subject, bearer })
       -> { ok: true,  collectorId, accountId, created, version }
        | { ok: false, refused }

   Account access is open to Collectors; Trusted Partner relationships still
   require mutual consent. This is the first half of that sentence and nothing
   of the second: somebody with a verified sign-in and no MetYet account names
   themselves and receives a personal collecting workspace. No invitation is
   read, spent or required, no Relationship is created, and no Trusted Partner
   learns that this person exists.

   It follows the two paths it sits beside — server/registration.js (a Trusted
   Partner, from MetYet's invitation) and server/collector-acceptance.js (a
   Collector, from a shop's invitation) — and copies each where it is right:

     0  name checked                    nothing is asked or opened for a bad one
     1  identity.confirmedEmail         BEFORE the transaction, like registration.js:
                                        a network round trip must never hold the
                                        global world lock
     2  lockWorld(tx), readVersion(tx)
     3  accounts.findActiveBySubject    ** INSIDE THE LOCK **, like acceptance:
                                        two concurrent registrations serialize
                                        and the second sees the first's account
     4  accounts.findBySubject          disabled history: never re-created here
     5  loadWorld -> registerCollector -> validateWorld -> saveWorld(expected)
     6  accounts.linkAccount            same transaction; the database's one-
                                        active-account-per-subject index is the
                                        backstop, and its refusal rolls back 5
     commit

   WHY A CONFIRMED EMAIL, WHEN NOTHING HERE COMPARES ONE. An email OTP sign-in
   confirms the address as a side effect, so for the product's own sign-in this
   always passes. It is required anyway, because "a verified person" is the
   rule and a token is not proof of a mailbox: a provider user created some
   other way (an admin call, a future provider) must not become a MetYet
   account by holding a signature. The address itself is not read, stored or
   logged — the answer is used as a yes or no.

   IDEMPOTENT, AND ONLY FOR THE SAME PERSON. A sign-in that already has an
   active Collector account is answered with that account (`created: false`),
   so a lost reply is recovered by asking again. A replay never renames anyone:
   the name sent the second time is ignored, because renaming is not this
   route's job.

   WHAT IT REFUSES.
     already-a-partner   this sign-in is a Trusted Partner. Checked inside the
                         lock and before anything is written: a TP account is
                         never converted, extended or given a second seat.
     account-disabled    this sign-in had an account that was switched off.
                         Re-enabling is an operator's decision, not a form's.
     name-required       blank, too long, or not text.
     email-unverified    the provider has no confirmed address for this sign-in.
     identity-unavailable  the provider could not be asked; nothing was opened.
     already-linked      the database refused a second active account — the lock
                         should make this unreachable; if not, it is a refusal.

   A REFUSAL WRITES NOTHING. Every refusal inside the transaction throws
   ROLLBACK, so a world change on the way to one is undone with it.
   ========================================================================== */

const RT = require("../domain/metyet-runtime.js");
const { validateWorld } = require("../domain/metyet-world.js");
const { registerCollector, cleanName } = require("../domain/metyet-registration.js");
const { PersistenceError, CODES, summarise } = require("../persistence/errors.js");

const ROLLBACK = Symbol("metyet.collector-registration-refused");

const REFUSALS = Object.freeze({
  nameRequired: "name-required",
  alreadyAPartner: "already-a-partner",
  accountDisabled: "account-disabled",
  emailUnverified: "email-unverified",
  identityUnavailable: "identity-unavailable",
  alreadyLinked: "already-linked",
});

async function registerCollectorAccount({ repository, accounts, identity, runtime } = {},
  { name, subject, bearer } = {}) {
  if (!repository || !accounts || !identity) {
    throw new TypeError("registerCollectorAccount: a repository, an account directory and an identity "
      + "directory are required");
  }
  if (!RT.isRuntime(runtime) || runtime.mode !== RT.MODES.authoritative) {
    throw new PersistenceError(CODES.runtimeNotAuthoritative,
      "registering a Collector requires an authoritative runtime (systemRuntime); the prototype "
      + "runtime trusts caller times and ids.");
  }
  if (typeof subject !== "string" || !subject) {
    throw new TypeError("registerCollectorAccount: the verified subject is required");
  }

  /* 0 — a name worth asking the provider about. The domain checks it again;
     this only spares a round trip for something that cannot succeed. */
  if (!cleanName(name)) return { ok: false, refused: REFUSALS.nameRequired };

  /* 1 — the provider's own answer, outside the lock. */
  let answer;
  try {
    answer = await identity.confirmedEmail(bearer, { subject });
  } catch (error) {
    return { ok: false, refused: REFUSALS.identityUnavailable, reason: (error && error.reason) || "unavailable" };
  }
  if (!answer || typeof answer.email !== "string" || !answer.email) {
    return { ok: false, refused: REFUSALS.emailUnverified };
  }

  /* One clock reading for the whole registration. */
  const ctx = RT.callContext(runtime, undefined);
  let refusal = null;

  try {
    return await repository.withTransaction(async (tx) => {
      /* 2 */
      await repository.lockWorld(tx);
      const version = await repository.readVersion(tx);

      /* 3 — who is this subject, now that nobody else can be registering it. */
      const existing = await accounts.findActiveBySubject(subject, { tx });
      if (existing) {
        if (existing.role !== "collector") {
          refusal = { ok: false, refused: REFUSALS.alreadyAPartner };
          throw ROLLBACK;
        }
        /* Already a Collector: the same answer the first time gave. Nothing is
           written, so nothing is saved — this returns from inside the
           transaction and commits an empty one. */
        return { ok: true, collectorId: existing.actor.collectorId, accountId: existing.accountId,
          created: false, version };
      }

      /* 4 — a sign-in that was switched off stays off. */
      const history = await accounts.findBySubject(subject, { tx });
      if (history.length) {
        refusal = { ok: false, refused: REFUSALS.accountDisabled };
        throw ROLLBACK;
      }

      /* 5 — the domain decides what a new Collector is. */
      const world = await repository.loadWorld(tx);
      const result = registerCollector(world, { name }, ctx);
      if (!result.ok) {
        refusal = { ok: false, refused: result.refused === "name-required" ? REFUSALS.nameRequired : result.refused };
        throw ROLLBACK;
      }
      const check = validateWorld(result.state);
      if (!check.ok) {
        throw new PersistenceError(CODES.invalidNextWorld,
          `registering a Collector produced an invalid world, so nothing was saved: ${summarise(check.errors)}`,
          { details: { errors: check.errors } });
      }
      const saved = await repository.saveWorld(result.state, tx, { expectedVersion: version });

      /* 6 — bind, in the same transaction. */
      let account;
      try {
        account = await accounts.linkAccount(
          { subject, role: "collector", collectorId: result.value.collectorId }, tx);
      } catch (error) {
        if (error && error.code === "account.already-active") {
          refusal = { ok: false, refused: REFUSALS.alreadyLinked };
          throw ROLLBACK;
        }
        throw error;
      }

      return { ok: true, collectorId: result.value.collectorId, accountId: account.accountId,
        created: true, version: saved.version };
    });
  } catch (error) {
    if (error === ROLLBACK) return refusal;
    throw error;
  }
}

module.exports = { registerCollectorAccount, REFUSALS };
