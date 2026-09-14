/* ============================================================================
   THE INVITATION DIRECTORY — WHO MetYet HAS INVITED, AND WHAT BECAME OF IT

     const invitations = createInvitationDirectory(db)
     invitations.createInvitation({ email, storeName, contactName, note, ttlDays })
                                                -> { invitation, token }   ONCE
     invitations.listInvitations()              -> invitations (operator use)
     invitations.findById(id)                   -> invitation | null
     invitations.revokeInvitation(id)           -> invitation | null
     invitations.claim(token, { at, tx })       -> invitation | null        ATOMIC
     invitations.completeRedemption({ id, partnerId, accountId, subject }, tx)

   THE CREDENTIAL LEAVES THIS MODULE EXACTLY ONCE. createInvitation mints it,
   returns it to the founder, and stores only its SHA-256. Nothing here, and
   nothing downstream, can reproduce it afterwards: not this table, not a log,
   not a database backup. An invitation that was lost is re-issued, never
   recovered — which is also why every other function returns rows WITHOUT the
   hash (`toInvitation`), so an operator listing cannot leak a verifier either.

   CLAIMING IS ONE STATEMENT. `claim` is an UPDATE whose WHERE clause carries
   every rule at once — the hash matches, it has not been accepted, it has not
   been revoked, it has not expired — so "check then use" does not exist here
   and two concurrent redemptions of one credential cannot both succeed: the
   second updates no row and gets null. The lookup is by hash, so the token is
   compared inside the database index rather than in application code, and no
   branch of this module is faster for a valid token than an invalid one.

   Claiming is deliberately NOT the whole redemption. It runs in the caller's
   transaction (`tx`), alongside creating the partner and binding the account,
   so a failure anywhere rolls the claim back with everything else and the
   invitation is still pending. See server/registration.js.

   This module knows nothing of the canonical world, and there is no route that
   reaches createInvitation: MetYet invites Trusted Partners, nobody applies.
   ========================================================================== */

const crypto = require("crypto");
const { randomToken } = require("../../domain/metyet-runtime.js");

/* 32 symbols from the runtime's unambiguous alphabet: 160 bits, and readable
   over the phone if it ever has to be. */
const TOKEN_SYMBOLS = 32;
const DEFAULT_TTL_DAYS = 14;
const MAX_TTL_DAYS = 90;

const COLUMNS = `id, email, store_name, contact_name, created_at, expires_at, accepted_at, revoked_at,
  partner_id, account_id, redeemed_subject, note`;

const INSERT = `insert into metyet_auth.partner_invitations
  (id, email, store_name, contact_name, token_hash, expires_at, note)
  values ($1, $2, $3, $4, $5, $6, $7) returning ${COLUMNS}`;
const LIST = `select ${COLUMNS} from metyet_auth.partner_invitations order by created_at, id`;
const BY_ID = `select ${COLUMNS} from metyet_auth.partner_invitations where id = $1`;
const REVOKE = `update metyet_auth.partner_invitations set revoked_at = now()
  where id = $1 and accepted_at is null and revoked_at is null returning ${COLUMNS}`;
/* Every rule, in the WHERE clause. */
const CLAIM = `update metyet_auth.partner_invitations set accepted_at = $2
  where token_hash = $1 and accepted_at is null and revoked_at is null and expires_at > $2
  returning ${COLUMNS}`;
const COMPLETE = `update metyet_auth.partner_invitations
  set partner_id = $2, account_id = $3, redeemed_subject = $4
  where id = $1 and accepted_at is not null and partner_id is null returning ${COLUMNS}`;

class InvitationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "InvitationError";
    this.code = code;
  }
}

const isText = (v) => typeof v === "string" && v.trim().length > 0;
const normalizeEmail = (v) => (typeof v === "string" ? v.trim().toLowerCase() : "");
/* Addresses are compared, never parsed: one @, something either side of it, no
   whitespace. Anything stricter rejects real addresses. */
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const hashToken = (token) => crypto.createHash("sha256").update(String(token), "utf8").digest("hex");

/* Four timestamps, one word. Derived rather than stored, so it can never
   disagree with the row it describes. */
function statusOf(row, now = new Date()) {
  if (row.accepted_at) return "accepted";
  if (row.revoked_at) return "revoked";
  return new Date(row.expires_at).getTime() <= now.getTime() ? "expired" : "pending";
}

/* What the rest of the server may see. The hash is not in COLUMNS, so it cannot
   reach a caller even by accident. */
const toInvitation = (row, now) => ({
  id: row.id,
  email: row.email,
  storeName: row.store_name,
  contactName: row.contact_name,
  note: row.note,
  status: statusOf(row, now),
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  acceptedAt: row.accepted_at,
  revokedAt: row.revoked_at,
  partnerId: row.partner_id,
  accountId: row.account_id,
  redeemedSubject: row.redeemed_subject,
});

function createInvitationDirectory(db) {
  if (!db || typeof db.transaction !== "function") throw new TypeError("createInvitationDirectory: a database adapter is required");
  const run = async (sql, params, { readOnly = false, tx } = {}) => (tx
    ? (await tx.query(sql, params)).rows
    : db.transaction(async (t) => (await t.query(sql, params)).rows, { readOnly }));

  return {
    /* FOUNDER ONLY. The returned token is the only copy that will ever exist. */
    async createInvitation({ email, storeName, contactName = null, note = null, ttlDays = DEFAULT_TTL_DAYS, at } = {}) {
      const address = normalizeEmail(email);
      if (!isEmail(address)) throw new InvitationError("invitation.invalid-email", "an invitation needs the address it is being sent to");
      if (!isText(storeName)) throw new InvitationError("invitation.invalid-name", "an invitation needs the Trusted Partner's name");
      const days = Number(ttlDays);
      if (!Number.isInteger(days) || days < 1 || days > MAX_TTL_DAYS) {
        throw new InvitationError("invitation.invalid-expiry", `an invitation lasts between 1 and ${MAX_TTL_DAYS} days`);
      }
      const token = randomToken(TOKEN_SYMBOLS);
      const from = at ? new Date(at) : new Date();
      const expiresAt = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
      const rows = await run(INSERT, ["inv-" + randomToken(12), address, String(storeName).replace(/\s+/g, " ").trim(),
        isText(contactName) ? contactName.trim() : null, hashToken(token), expiresAt.toISOString(),
        isText(note) ? note.trim() : null]);
      return { invitation: toInvitation(rows[0]), token };
    },

    async listInvitations() {
      return (await run(LIST, [], { readOnly: true })).map((r) => toInvitation(r));
    },

    async findById(id) {
      const rows = await run(BY_ID, [id], { readOnly: true });
      return rows.length ? toInvitation(rows[0]) : null;
    },

    /* Revoking is one-way and only ever applies to something still pending: an
       invitation already redeemed is history, not a switch. */
    async revokeInvitation(id) {
      const rows = await run(REVOKE, [id]);
      return rows.length ? toInvitation(rows[0]) : null;
    },

    /* ATOMIC. Runs in the caller's transaction; null means "no invitation that
       this credential can still redeem", without saying which rule stopped it. */
    async claim(token, { at = new Date(), tx } = {}) {
      if (typeof token !== "string" || !token) return null;
      const when = at instanceof Date ? at.toISOString() : String(at);
      const rows = await run(CLAIM, [hashToken(token), when], { tx });
      return rows.length ? toInvitation(rows[0], new Date(when)) : null;
    },

    async completeRedemption({ id, partnerId, accountId, subject } = {}, tx) {
      const rows = await run(COMPLETE, [id, partnerId, accountId, subject], { tx });
      if (!rows.length) throw new InvitationError("invitation.not-claimed", "that invitation was not claimed by this redemption");
      return toInvitation(rows[0]);
    },
  };
}

module.exports = { createInvitationDirectory, InvitationError, hashToken, statusOf,
  normalizeEmail, TOKEN_SYMBOLS, DEFAULT_TTL_DAYS, MAX_TTL_DAYS };
