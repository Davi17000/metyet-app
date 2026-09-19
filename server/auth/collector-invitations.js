/* ============================================================================
   THE COLLECTOR INVITATION CREDENTIAL — ONE SECRET, HANDED OVER ONCE

     const credentials = createCollectorCredentials(db)
     credentials.issue({ invitationId, tx })   -> { token }        ONCE
     credentials.claim(token, { at, by, tx })  -> invitationId | null   ATOMIC
     credentials.findByInvitation(id)          -> { invitationId, createdAt,
                                                    claimedAt } | null

   WHAT THIS IS, AND WHAT IT IS NOT. It is the secret that will let somebody
   redeem one Trusted Partner's invitation. It is NOT an account, not a login,
   and not a claim about who that somebody is — the canonical invitation names
   nobody, and possession plus an authenticated identity is what Batch 3 will
   turn into a Relationship.

   THE CREDENTIAL LEAVES THIS MODULE EXACTLY ONCE. `issue` mints it, returns it
   to the caller, and stores only its SHA-256. Nothing here and nothing
   downstream can reproduce it afterwards: not this table, not a log, not a
   database backup. A credential that was lost is re-issued by revoking the
   invitation and sending a new one — never recovered. That is why there is no
   "show it again", and why `findByInvitation` returns no digest: an operator
   listing must not hand out a verifier either.

   CLAIMING IS ONE STATEMENT. `claim` is an UPDATE whose WHERE clause carries
   both rules at once — the digest matches, and it has not been claimed — so
   "check then use" does not exist here and two concurrent redemptions of one
   credential cannot both succeed: the second updates no row and gets null. The
   lookup is by digest, so the secret is compared inside the database index
   rather than in application code.

   CLAIMING IS NECESSARY AND NOT SUFFICIENT. Expiry, revocation and acceptance
   are PRODUCT facts and live on the canonical invitation, where a partner can
   see and change them. This table knows only whether the secret is genuine and
   unspent. A redemption must check both, in one transaction — and since Batch
   3A it does: server/collector-acceptance.js is the only caller of `claim`, and
   it checks the canonical invitation in the same transaction.

   WHO SPENT IT, AND WHY THAT IS WORTH STORING (Batch 3A). `claimed_by` carries
   the verified subject. It is not authority — possession of the secret is — and
   nothing compares it to decide whether a redemption may proceed. It exists so
   that a person whose reply was lost can try again and be told what actually
   happened, instead of being told their invitation is dead. `findSpentBy` is
   the whole of that, and it answers for one subject about their own act.

   This module still knows nothing of the canonical world: no world id, no
   partner, no collector, no relationship.
   ========================================================================== */

const crypto = require("crypto");
const { randomToken } = require("../../domain/metyet-runtime.js");

/* 32 symbols from the runtime's unambiguous alphabet: 160 bits, and readable
   aloud if an invitation is ever handed over across a counter. The same length
   MetYet's own partner invitations use. */
const TOKEN_SYMBOLS = 32;

const TABLE = "metyet_auth.collector_invitation_credentials";
/* The digest is deliberately absent, so it cannot reach a caller by accident.
   The delivery columns are NOT secrets and are here on purpose: a Trusted
   Partner is owed the truth about whether their invitation was emailed. */
const COLUMNS = "invitation_id, created_at, claimed_at, claimed_by, "
  + "delivery_requested_at, delivered_to, delivered_at, delivery_error";

const INSERT = `insert into ${TABLE} (invitation_id, token_digest)
  values ($1, $2) returning ${COLUMNS}`;
/* THE INTENT TO SEND, recorded in the same transaction as the credential it
   will carry — the address is known before anything is sent, so there is no
   reason for it to arrive later. Only the OUTCOME has to wait, because the
   outcome comes from outside. */
const REQUEST_DELIVERY = `update ${TABLE} set delivery_requested_at = $2, delivered_to = $3
  where invitation_id = $1 returning ${COLUMNS}`;
/* The outcome of the one send this credential will ever have. `where
   delivered_at is null and delivery_error is null` makes it write-once: a late
   answer cannot overwrite the answer already recorded. */
const RECORD_DELIVERY = `update ${TABLE} set delivered_at = $2, delivery_error = $3
  where invitation_id = $1 and delivered_at is null and delivery_error is null returning ${COLUMNS}`;
/* An invitation that is over keeps no address. */
const CLOSE_DELIVERY = `update ${TABLE} set delivered_to = null, delivery_error = null
  where invitation_id = $1 returning ${COLUMNS}`;
const BY_INVITATION = `select ${COLUMNS} from ${TABLE} where invitation_id = $1`;
/* The same digest lookup `claim` does, without spending anything. It exists for
   exactly one question — "did THIS person already redeem this?" — and it is why
   a lost reply is recoverable (Batch 3A). Same columns, so it still cannot hand
   back a verifier. */
const BY_DIGEST = `select ${COLUMNS} from ${TABLE} where token_digest = $1`;
/* THE NARROWEST QUESTION THIS TABLE CAN BE ASKED (Phase 5 Batch 3D): which
   invitation does this unspent secret belong to?

   One column, and the unspent rule in the WHERE clause rather than in a caller,
   so a spent credential is indistinguishable from one that never existed — both
   are no row. It cannot return a digest, a delivery address, a claimant or a
   timestamp, because it does not select them. */
const UNSPENT_BY_DIGEST = `select invitation_id from ${TABLE}
  where token_digest = $1 and claimed_at is null`;
/* Both rules, in the WHERE clause. */
/* Claiming is also the moment an invitation is over, so the address it was sent
   to goes in the same statement. One write, no second call site to forget, and
   no window in which an accepted invitation still names a mailbox. */
const CLAIM = `update ${TABLE} set claimed_at = $2, claimed_by = $3,
    delivered_to = null, delivery_error = null
  where token_digest = $1 and claimed_at is null returning ${COLUMNS}`;

class CredentialError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CredentialError";
    this.code = code;
  }
}

const isId = (v) => typeof v === "string" && v.length > 0;
const digestOf = (token) => crypto.createHash("sha256").update(String(token), "utf8").digest("hex");

/* WHAT MetYet KNOWS ABOUT A SEND, DERIVED RATHER THAN STORED.

   A stored state word is a word that can disagree with the timestamps beside
   it. metyet_auth.partner_invitations already derives its status the same way
   (server/auth/invitations.js), and this follows it.

   `unconfirmed` is the one that matters. A send whose outcome never came
   back — a timeout, or a process that stopped between the provider answering
   and this row being written — is not a success and must never read as one. */
const DELIVERY = Object.freeze({
  none: "none", unconfirmed: "unconfirmed", sent: "sent", failed: "failed",
});
const deliveryOf = (row) => {
  if (!row.delivery_requested_at) return DELIVERY.none;
  if (row.delivered_at) return DELIVERY.sent;
  if (row.delivery_error) return DELIVERY.failed;
  return DELIVERY.unconfirmed;
};

/* What the rest of the server may see. No digest, and no token. */
const toRecord = (row) => ({
  invitationId: row.invitation_id,
  createdAt: row.created_at,
  claimedAt: row.claimed_at,
  claimedBy: row.claimed_by,
  claimed: Boolean(row.claimed_at),
  delivery: deliveryOf(row),
  deliveredTo: row.delivered_to || null,
  deliveredAt: row.delivered_at || null,
  deliveryError: row.delivery_error || null,
});

function createCollectorCredentials(db) {
  if (!db || typeof db.transaction !== "function") {
    throw new TypeError("createCollectorCredentials: a database adapter is required");
  }
  const run = async (sql, params, { readOnly = false, tx } = {}) => (tx
    ? (await tx.query(sql, params)).rows
    : db.transaction(async (t) => (await t.query(sql, params)).rows, { readOnly }));

  return {
    /* The returned token is the only copy that will ever exist. Runs in the
       caller's transaction, so a failure anywhere in the invitation's creation
       takes the credential with it and leaves nothing behind. */
    async issue({ invitationId, tx } = {}) {
      if (!isId(invitationId)) {
        throw new CredentialError("credential.invalid-invitation",
          "a credential belongs to one invitation, and needs its id");
      }
      const token = randomToken(TOKEN_SYMBOLS);
      const rows = await run(INSERT, [invitationId, digestOf(token)], { tx });
      return { credential: toRecord(rows[0]), token };
    },

    /* MetYet IS GOING TO SEND THIS ONE, AND HERE IS WHERE. Runs in the caller's
       transaction, beside the credential it belongs to, so an invitation that
       rolls back takes the address with it.

       IT IS A DESTINATION AND NOT AN IDENTITY. Nothing in redemption reads this
       column; a Collector signs in with whatever address they can receive mail
       at, and possession of the credential plus an authenticated identity is
       what makes them the right person. The time is this directory's own,
       beside the `created_at` the same row takes from the database: an
       operational fact, not a canonical one, and not the runtime's to own. */
    async requestDelivery(invitationId, { to, at = null, tx } = {}) {
      if (!isId(invitationId)) {
        throw new CredentialError("credential.invalid-invitation",
          "a delivery belongs to one invitation, and needs its id");
      }
      if (typeof to !== "string" || !to.trim()) {
        throw new CredentialError("credential.invalid-delivery",
          "a delivery needs somewhere to go");
      }
      const when = at instanceof Date ? at.toISOString() : (at ? String(at) : new Date().toISOString());
      const rows = await run(REQUEST_DELIVERY, [invitationId, when, to.trim()], { tx });
      return rows.length ? toRecord(rows[0]) : null;
    },

    /* THE OUTCOME OF THE ONE SEND, recorded after the transaction has committed
       and the provider has answered — or failed to. Exactly one of `at` and
       `error` is given; `error` is a category of ours (see CATEGORIES in
       server/mail/resend.js), never a provider's words.

       It is write-once by its WHERE clause, so a slow answer arriving after
       something already recorded an outcome cannot rewrite history. */
    async recordDelivery(invitationId, { at = null, error = null } = {}) {
      if (!isId(invitationId)) return null;
      if ((at && error) || (!at && !error)) {
        throw new CredentialError("credential.invalid-delivery",
          "a delivery either succeeded or failed, and this says both or neither");
      }
      const when = at instanceof Date ? at.toISOString() : (at ? String(at) : null);
      const rows = await run(RECORD_DELIVERY, [invitationId, when, error || null]);
      return rows.length ? toRecord(rows[0]) : null;
    },

    /* An invitation that is over keeps no address. `claim` does this for the
       one that was accepted; this is for the one that was withdrawn. */
    async closeDelivery(invitationId, { tx } = {}) {
      if (!isId(invitationId)) return null;
      const rows = await run(CLOSE_DELIVERY, [invitationId], { tx });
      return rows.length ? toRecord(rows[0]) : null;
    },

    async findByInvitation(invitationId) {
      if (!isId(invitationId)) return null;
      const rows = await run(BY_INVITATION, [invitationId], { readOnly: true });
      return rows.length ? toRecord(rows[0]) : null;
    },

    /* ATOMIC. Null means "no credential that this secret can still spend",
       without saying which rule stopped it. Batch 3A calls this inside the
       transaction that also creates the Relationship, and checks the canonical
       invitation alongside it.

       `by` IS THE VERIFIED SUBJECT, and recording it is what makes a lost reply
       survivable. A credential is spent once; without knowing WHO spent it, a
       retry after a reply that never arrived would be told the invitation is
       dead when the person is in fact already connected — and unlike a Trusted
       Partner, they cannot look at a list and withdraw anything. See
       `findSpentBy`. */
    async claim(token, { at = new Date(), by = null, tx } = {}) {
      if (typeof token !== "string" || !token) return null;
      const when = at instanceof Date ? at.toISOString() : String(at);
      const rows = await run(CLAIM, [digestOf(token), when, by], { tx });
      return rows.length ? toRecord(rows[0]) : null;
    },

    /* THE ONLY QUESTION A SPENT CREDENTIAL MAY ANSWER: was it spent by you?

       Returns the record when this secret's digest exists AND it was claimed by
       this same subject — and null for absolutely everything else: no such
       digest, unclaimed, or claimed by somebody else. So it distinguishes
       exactly one case, for exactly the person who already proved they caused
       it, and reveals nothing to anyone else. A guesser gets null whether their
       guess was a real credential or noise, which is the same answer `claim`
       gives them.

       It spends nothing, and it returns no digest — `COLUMNS` sees to that. */
    /* WHICH INVITATION AN UNSPENT SECRET BELONGS TO, AND NOTHING ELSE (Batch
       3D). It exists so that somebody holding a live invitation can be told who
       invited them before they are asked to sign in — the front door naming the
       shop instead of a stranger's login form.

       IT SPENDS NOTHING AND RESERVES NOTHING. A read, in a read-only
       transaction, returning one id. The credential is still worth exactly one
       redemption afterwards, through the one path that performs one.

       IT ANSWERS null FOR EVERYTHING ELSE — no such digest, already claimed,
       whatever — because the caller must not be able to tell those apart. The
       canonical rules (expired, withdrawn, accepted) are not this table's to
       know; the caller checks them against the world and collapses every answer
       into the same refusal. */
    async findUnspent(token) {
      if (typeof token !== "string" || !token) return null;
      const rows = await run(UNSPENT_BY_DIGEST, [digestOf(token)], { readOnly: true });
      return rows.length ? { invitationId: rows[0].invitation_id } : null;
    },

    async findSpentBy(token, subject, { tx } = {}) {
      if (typeof token !== "string" || !token) return null;
      if (typeof subject !== "string" || !subject) return null;
      const rows = await run(BY_DIGEST, [digestOf(token)], { tx });
      if (!rows.length) return null;
      const record = toRecord(rows[0]);
      return record.claimed && record.claimedBy === subject ? record : null;
    },
  };
}

module.exports = { createCollectorCredentials, CredentialError, TOKEN_SYMBOLS, DELIVERY };
