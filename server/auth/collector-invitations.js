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
   unspent. A redemption must check both, in one transaction, and Batch 3 owns
   that — which is why `claim` has no caller in this batch.

   This module knows nothing of the canonical world, and there is no route that
   reaches `claim`.
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

    /* ATOMIC, AND WITHOUT A CALLER IN THIS BATCH. Null means "no credential
       that this secret can still spend", without saying which rule stopped it.
       Batch 3 calls this inside the transaction that also creates the
       Relationship, and checks the canonical invitation alongside it. */
    async claim(token, { at = new Date(), by = null, tx } = {}) {
      if (typeof token !== "string" || !token) return null;
      const when = at instanceof Date ? at.toISOString() : String(at);
      const rows = await run(CLAIM, [digestOf(token), when, by], { tx });
      return rows.length ? toRecord(rows[0]) : null;
    },
  };
}

module.exports = { createCollectorCredentials, CredentialError, TOKEN_SYMBOLS };
