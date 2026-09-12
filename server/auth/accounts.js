/* ============================================================================
   THE ACCOUNT DIRECTORY — ONE SIGN-IN, ONE ACTOR

     const accounts = createAccountDirectory(db)
     accounts.findActiveBySubject(subject)          -> { accountId, role, actor } | null
     accounts.linkAccount({ subject, role, collectorId | partnerId })  -> account
     accounts.disableAccount(accountId)             -> account | null
     accounts.listAccounts()                        -> accounts (admin use)

   The server never infers who someone is. A verified token gives a provider
   subject; this directory turns that subject into exactly one MetYet actor
   ({ collectorId } or { partnerId }) or into nothing at all. There is no
   fallback by email, by name, or by anything a request carries.

   Provisioning is invite-only by construction: linkAccount is an
   administrative call (the founder's tooling, and tests), reachable from no
   HTTP route in this batch. The database enforces that a subject and an actor
   each have at most one ACTIVE account, so "which actor is this?" can never
   have two answers; disabling a row is how an account ends.

   This module knows nothing of the canonical world. Whether the actor it names
   still exists there is the request path's question (see server/app.js), so a
   stale mapping is refused by name rather than silently projecting nothing.
   ========================================================================== */

const { randomToken } = require("../../domain/metyet-runtime.js");

const COLUMNS = "id, subject, role, collector_id, partner_id, status, created_at, disabled_at";
const SELECT_ACTIVE_BY_SUBJECT = `select ${COLUMNS} from metyet_auth.accounts where subject = $1 and status = 'active'`;
const SELECT_BY_SUBJECT = `select ${COLUMNS} from metyet_auth.accounts where subject = $1 order by created_at`;
const SELECT_BY_ID = `select ${COLUMNS} from metyet_auth.accounts where id = $1`;
const INSERT_ACCOUNT = `insert into metyet_auth.accounts (id, subject, role, collector_id, partner_id)
  values ($1, $2, $3, $4, $5) returning ${COLUMNS}`;
const DISABLE_ACCOUNT = `update metyet_auth.accounts set status = 'disabled', disabled_at = now()
  where id = $1 and status = 'active' returning ${COLUMNS}`;
const LIST_ACCOUNTS = `select ${COLUMNS} from metyet_auth.accounts order by created_at, id`;

class AccountError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AccountError";
    this.code = code;
  }
}

const isId = (v) => typeof v === "string" && v.length > 0;

/* A row as the rest of the server sees it: the actor in the domain's own
   shape, and nothing that is not needed to act. */
const toAccount = (row) => ({
  accountId: row.id,
  subject: row.subject,
  role: row.role,
  status: row.status,
  actor: row.role === "tp" ? { partnerId: row.partner_id } : { collectorId: row.collector_id },
});

function createAccountDirectory(db) {
  if (!db || typeof db.transaction !== "function") throw new TypeError("createAccountDirectory: a database adapter is required");
  const one = async (sql, params, { readOnly = false } = {}) =>
    db.transaction(async (tx) => (await tx.query(sql, params)).rows, { readOnly });

  return {
    /* The only lookup the request path uses. */
    async findActiveBySubject(subject) {
      if (!isId(subject)) return null;
      const rows = await one(SELECT_ACTIVE_BY_SUBJECT, [subject], { readOnly: true });
      return rows.length ? toAccount(rows[0]) : null;
    },

    async findBySubject(subject) {
      const rows = await one(SELECT_BY_SUBJECT, [subject], { readOnly: true });
      return rows.map(toAccount);
    },

    async findById(accountId) {
      const rows = await one(SELECT_BY_ID, [accountId], { readOnly: true });
      return rows.length ? toAccount(rows[0]) : null;
    },

    /* ADMIN. Provision one account for one actor. The database refuses a second
       active account for the same subject or the same actor; that refusal is
       reported as a conflict rather than resolved here. */
    async linkAccount({ subject, role, collectorId = null, partnerId = null } = {}) {
      if (!isId(subject)) throw new AccountError("account.invalid-subject", "linkAccount needs the provider's subject");
      if (role !== "collector" && role !== "tp") throw new AccountError("account.invalid-role", 'linkAccount needs role "collector" or "tp"');
      const wantsCollector = role === "collector";
      if (wantsCollector ? (!isId(collectorId) || partnerId) : (!isId(partnerId) || collectorId)) {
        throw new AccountError("account.invalid-actor", `a ${role} account names exactly one ${wantsCollector ? "collectorId" : "partnerId"}`);
      }
      try {
        const rows = await one(INSERT_ACCOUNT, [randomToken(16), subject, role, collectorId, partnerId]);
        return toAccount(rows[0]);
      } catch (error) {
        if (/accounts_active_(subject|collector|partner)_key/.test(String(error && error.message))) {
          throw new AccountError("account.already-active", "that subject or actor already has an active account");
        }
        throw error;
      }
    },

    async disableAccount(accountId) {
      const rows = await one(DISABLE_ACCOUNT, [accountId]);
      return rows.length ? toAccount(rows[0]) : null;
    },

    async listAccounts() {
      return (await one(LIST_ACCOUNTS, [], { readOnly: true })).map(toAccount);
    },
  };
}

module.exports = { createAccountDirectory, AccountError };
