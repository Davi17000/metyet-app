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
/* The digest is deliberately absent, so it cannot reach a caller by accident. */
const COLUMNS = "invitation_id, created_at, claimed_at, claimed_by";

const INSERT = `insert into ${TABLE} (invitation_id, token_digest) values ($1, $2) returning ${COLUMNS}`;
const BY_INVITATION = `select ${COLUMNS} from ${TABLE} where invitation_id = $1`;
/* The same digest lookup `claim` does, without spending anything. It exists for
   exactly one question — "did THIS person already redeem this?" — and it is why
   a lost reply is recoverable (Batch 3A). Same columns, so it still cannot hand
   back a verifier. */
const BY_DIGEST = `select ${COLUMNS} from ${TABLE} where token_digest = $1`;
/* Both rules, in the WHERE clause. */
const CLAIM = `update ${TABLE} set claimed_at = $2, claimed_by = $3
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

/* What the rest of the server may see. No digest, and no token. */
const toRecord = (row) => ({
  invitationId: row.invitation_id,
  createdAt: row.created_at,
  claimedAt: row.claimed_at,
  claimedBy: row.claimed_by,
  claimed: Boolean(row.claimed_at),
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

module.exports = { createCollectorCredentials, CredentialError, TOKEN_SYMBOLS };
