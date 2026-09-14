/* ============================================================================
   REDEMPTION — AN INVITATION BECOMES A TRUSTED PARTNER, ONCE, OR NOT AT ALL

     redeemPartnerInvitation({ repository, accounts, invitations, runtime },
                             { token, subject, email })
       -> { ok: true,  partner, accountId, invitationId, version }
        | { ok: false, refused }

   This is the only way a Trusted Partner comes into existence, and it is four
   things that must all happen or none of them:

     1  the invitation is CLAIMED   (metyet_auth.partner_invitations)
     2  the partner is REGISTERED   (the canonical world, via the domain)
     3  the sign-in is BOUND to it  (metyet_auth.accounts)
     4  the invitation records what it produced

   All four run in ONE database transaction, under the world lock, so there is
   no moment at which a half-registered Trusted Partner exists. If the world
   save fails, if the account is a duplicate, if the process dies between steps
   — the claim rolls back with everything else and the invitation is still
   pending. Nothing has to be cleaned up afterwards, because nothing was left.

   WHAT AUTHORIZES WHAT. The invitation authorizes the REGISTRATION: it decides
   that this store exists and what it is called, and MetYet wrote both when it
   invited them. The verified sign-in authorizes everything AFTERWARDS, through
   the account it is bound to here. They are separate on purpose: a credential
   that could create a partner and also act as one would be a password that
   MetYet had mailed out.

   NOTHING THE CALLER SAYS IS TRUSTED. The request carries one thing — the
   credential — and the subject and email come from the verified token. The
   store's name is the invitation's, not the request's; the partner's id is the
   runtime's, not the request's. There is no field a redeemer can set.

   REFUSALS SAY LITTLE. A credential that is unknown, expired, revoked or
   already spent all give the same answer, because distinguishing them would let
   someone with a list of guesses learn which ones exist.
   ========================================================================== */

const { registerPartner } = require("../domain/metyet-registration.js");
const { validateWorld } = require("../domain/metyet-world.js");
const RT = require("../domain/metyet-runtime.js");
const { normalizeEmail } = require("./auth/invitations.js");
const { PersistenceError, CODES, summarise } = require("../persistence/errors.js");

const ROLLBACK = Symbol("metyet.redemption-refused");

/* The vocabulary a redeemer is answered with. Deliberately small. */
const REFUSALS = Object.freeze({
  /* Unknown, expired, revoked or already redeemed — one answer for all four. */
  invitationUnusable: "invitation-unusable",
  /* The invitation was addressed to somebody else. */
  wrongRecipient: "wrong-recipient",
  /* The sign-in has no verified address, so it cannot be shown to be the one
     invited. Not a refusal of the person — a refusal to guess. */
  emailUnverified: "email-unverified",
  /* This sign-in is already somebody in MetYet. */
  alreadyLinked: "already-linked",
});

async function redeemPartnerInvitation({ repository, accounts, invitations, runtime } = {},
  { token, subject, email } = {}) {
  if (!repository || !accounts || !invitations) throw new TypeError("redeemPartnerInvitation: repository, accounts and invitations are required");
  if (!RT.isRuntime(runtime) || runtime.mode !== RT.MODES.authoritative) {
    throw new PersistenceError(CODES.runtimeNotAuthoritative,
      "registration requires an authoritative runtime (systemRuntime); the prototype runtime trusts caller times and ids.");
  }
  if (typeof subject !== "string" || !subject) throw new TypeError("redeemPartnerInvitation: the verified subject is required");
  if (typeof token !== "string" || !token) return { ok: false, refused: REFUSALS.invitationUnusable };

  /* The address must come from the token, and the provider must have verified
     it. MetYet invites a person at an address; without one there is nothing to
     check the redeemer against, and "probably them" is not a standard this
     path applies. */
  const verified = normalizeEmail(email);
  if (!verified) return { ok: false, refused: REFUSALS.emailUnverified };

  /* One clock reading for the whole redemption: the claim's expiry check, the
     partner's `since` and the audit row all agree. */
  const ctx = RT.callContext(runtime, undefined);
  let refusal = null;

  try {
    return await repository.withTransaction(async (tx) => {
      /* The lock first, so the world loaded below is current — and so two
         redemptions serialize rather than racing to save. */
      await repository.lockWorld(tx);
      const version = await repository.readVersion(tx);

      /* 1 — claim. One statement, every rule, single use. */
      const invitation = await invitations.claim(token, { at: ctx.at, tx });
      if (!invitation) { refusal = { ok: false, refused: REFUSALS.invitationUnusable }; throw ROLLBACK; }
      if (invitation.email !== verified) { refusal = { ok: false, refused: REFUSALS.wrongRecipient }; throw ROLLBACK; }

      /* 2 — register. The domain decides what a new partner is; this does not. */
      const world = await repository.loadWorld(tx);
      const result = registerPartner(world, { name: invitation.storeName, invitationId: invitation.id }, ctx);
      if (!result.ok) { refusal = { ok: false, refused: result.refused }; throw ROLLBACK; }

      const check = validateWorld(result.state);
      if (!check.ok) {
        throw new PersistenceError(CODES.invalidNextWorld,
          `registering a Trusted Partner produced an invalid world, so nothing was saved: ${summarise(check.errors)}`,
          { details: { errors: check.errors } });
      }
      const saved = await repository.saveWorld(result.state, tx, { expectedVersion: version });

      /* 3 — bind. The database refuses a second active account for this subject
         or this partner; that refusal is the pilot rule, not an error to work
         around. */
      let account;
      try {
        account = await accounts.linkAccount({ subject, role: "tp", partnerId: result.value.id }, tx);
      } catch (error) {
        if (error && error.code === "account.already-active") {
          refusal = { ok: false, refused: REFUSALS.alreadyLinked };
          throw ROLLBACK;
        }
        throw error;
      }

      /* 4 — record what this invitation produced, for support and audit. */
      await invitations.completeRedemption({ id: invitation.id, partnerId: result.value.id,
        accountId: account.accountId, subject }, tx);

      return { ok: true, partner: result.value.partner, accountId: account.accountId,
        invitationId: invitation.id, version: saved.version };
    });
  } catch (error) {
    if (error === ROLLBACK) return refusal;
    throw error;
  }
}

module.exports = { redeemPartnerInvitation, REFUSALS };
