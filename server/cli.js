/* ============================================================================
   THE OPERATOR COMMANDS — WHAT THE FOUNDER RUNS, DELIBERATELY

     node server/cli.js <command>            (npm run db:migrate, db:bootstrap, …)

       status                      what is applied, and what the world holds
       migrate                     apply pending migrations (forward-only)
       bootstrap                   create the empty canonical world
       actors                      the Collector and Trusted Partner ids
       accounts                    the provisioned sign-ins
       link-account --subject=… --role=collector|tp --actor=<id>
       disable-account --account=<id>
       invite-partner --email=… --name=… [--contact=…] [--days=…] [--note=…]
       invitations                 every invitation and what became of it
       invitation --id=<id>        one invitation, in full
       revoke-invitation --id=<id> withdraw one that is still pending

   Every one of these is a decision someone makes on purpose. None of them runs
   by itself: the server never migrates at startup (a rolling restart would
   otherwise half-migrate a live database), and there is no HTTP route to any of
   them.

   They are repeatable. `migrate` applies only what is pending and refuses a file
   whose checksum changed; `bootstrap` refuses the moment a world exists;
   `link-account` refuses a second active account for a subject or an actor.
   Each failure prints one sentence and exits non-zero, and no message ever
   carries a connection string, a token or a key.

   The database comes from the environment (DATABASE_URL and friends). Tests
   inject an in-process database instead, so every line below is exercised
   without a server or a vendor.
   ========================================================================== */

const { migrate, migrationStatus } = require("../persistence/migrate.js");
const { withDatabase } = require("./db-pool.js");
const { bootstrapWorld, emptyWorld } = require("./bootstrap.js");
const { linkActorAccount, listActors } = require("./provisioning.js");

const USAGE = `MetYet operator commands

  node server/cli.js status
  node server/cli.js migrate
  node server/cli.js bootstrap
  node server/cli.js actors
  node server/cli.js accounts
  node server/cli.js link-account --subject=<provider sub> --role=collector|tp --actor=<id>
  node server/cli.js disable-account --account=<account id>
  node server/cli.js invite-partner --email=<address> --name=<store name> [--contact=<person>] [--days=14] [--note=<text>]
  node server/cli.js invitations
  node server/cli.js invitation --id=<invitation id>
  node server/cli.js revoke-invitation --id=<invitation id>

The database is read from DATABASE_URL (and DATABASE_SSL, DATABASE_CA_CERT,
DATABASE_POOL_MAX). Nothing here starts a server or contacts a vendor.`;

/* A message a person can act on, with nothing secret in it: a connection string
   that reached an error from the driver is removed rather than printed. */
const safeMessage = (error) => String((error && error.message) || error)
  .replace(/postgres(ql)?:\/\/\S+/gi, "<connection string>")
  .replace(/\b(password|secret|token|key)\s*=\s*\S+/gi, "$1=<hidden>");

function parseFlags(argv) {
  const flags = {};
  for (const arg of argv) {
    const match = /^--([a-z][a-z0-9-]*)(?:=(.*))?$/i.exec(arg);
    if (!match) return { flags, unknown: arg };
    flags[match[1]] = match[2] === undefined ? true : match[2];
  }
  return { flags, unknown: null };
}

/* The operator operations. Named so it is never confused with the domain's
   command layer: nothing here authors canonical state. */
const OPERATIONS = {
  async status({ db, repository }, _flags, say) {
    const schema = await migrationStatus(db);
    if (!schema.migrated) {
      say("schema:      not migrated (run `npm run db:migrate`)");
      return 0;
    }
    say(`schema:      ${schema.applied.length} applied, ${schema.pending.length} pending`
      + `${schema.pending.length ? ` (${schema.pending.join(", ")})` : ""}`);
    if (schema.changed.length) {
      say(`integrity:   ${schema.changed.join(", ")} no longer match the files in this build.`);
      say("             Restore the original file and add a new migration instead.");
    }
    const world = await repository.loadWorld();
    const version = await repository.readVersion();
    const counts = Object.entries(world).filter(([, rows]) => rows.length)
      .map(([name, rows]) => `${name}: ${rows.length}`);
    say(`world:       version ${version}, ${counts.length ? counts.join(", ") : "empty"}`);
    return 0;
  },

  async migrate({ db }, _flags, say) {
    const { applied, current } = await migrate(db);
    say(applied.length ? `applied:     ${applied.join(", ")}` : "applied:     nothing (already up to date)");
    say(`migrations:  ${current.join(", ")}`);
    return 0;
  },

  async bootstrap({ repository }, _flags, say) {
    const result = await bootstrapWorld(repository);
    say(`world:       empty canonical world in place (version ${result.version})`);
    say(`collections: ${Object.keys(emptyWorld()).length}, all empty — no demo data, no example records`);
    return 0;
  },

  async actors({ repository }, _flags, say) {
    const { collectors, partners } = await listActors(repository);
    say(`partners:    ${partners.length ? partners.map((p) => `${p.id} (${p.name || "unnamed"})`).join(", ") : "none"}`);
    say(`collectors:  ${collectors.length ? collectors.map((c) => `${c.id} (${c.name || "unnamed"})`).join(", ") : "none"}`);
    if (!partners.length && !collectors.length) {
      say("There is nobody to link an account to yet. A Trusted Partner is not made");
      say("by a script: invite one (`npm run partner:invite`) and they register");
      say("themselves, which is what creates them.");
    }
    return 0;
  },

  async accounts({ accounts }, _flags, say) {
    const rows = await accounts.listAccounts();
    if (!rows.length) { say("accounts:    none"); return 0; }
    rows.forEach((a) => say(`${a.status === "active" ? "active  " : "disabled"}     ${a.accountId}  ${a.role}  ${JSON.stringify(a.actor)}  subject=${a.subject}`));
    return 0;
  },

  async "link-account"({ repository, accounts }, flags, say) {
    const account = await linkActorAccount({ repository, accounts,
      subject: flags.subject, role: flags.role, actorId: flags.actor });
    say(`linked:      ${account.accountId}  ${account.role}  ${JSON.stringify(account.actor)}`);
    say("That sign-in can now use the API as this actor, and no other.");
    return 0;
  },

  async "disable-account"({ accounts }, flags, say) {
    const account = await accounts.disableAccount(flags.account);
    if (!account) { say("no active account with that id; nothing changed"); return 1; }
    say(`disabled:    ${account.accountId}  ${account.role}  ${JSON.stringify(account.actor)}`);
    return 0;
  },

  /* MetYet invites Trusted Partners. This is where that decision is recorded,
     and the credential below is printed ONCE — it is stored only as a hash, so
     a lost one is re-issued with a new invitation, never recovered. */
  async "invite-partner"({ invitations }, flags, say) {
    const { invitation, token } = await invitations.createInvitation({
      email: flags.email, storeName: flags.name, contactName: flags.contact,
      note: flags.note, ttlDays: flags.days === undefined ? undefined : Number(flags.days) });
    say(`invited:     ${invitation.storeName} <${invitation.email}>`);
    say(`invitation:  ${invitation.id}`);
    say(`expires:     ${invitation.expiresAt}`);
    say("");
    say(`credential:  ${token}`);
    say("");
    say("Send that credential to them yourself; it is shown here once and is not");
    say("stored anywhere. It lets them register this Trusted Partner one time.");
    say("It is not a way to sign in: once they have registered, their own");
    say("verified sign-in is what they use from then on.");
    return 0;
  },

  async invitations({ invitations }, _flags, say) {
    const rows = await invitations.listInvitations();
    if (!rows.length) { say("invitations: none"); return 0; }
    rows.forEach((i) => say(`${i.status.padEnd(9)}    ${i.id}  ${i.storeName} <${i.email}>`
      + `${i.partnerId ? `  -> ${i.partnerId}` : ""}`));
    return 0;
  },

  async invitation({ invitations }, flags, say) {
    const found = await invitations.findById(flags.id);
    if (!found) { say("no invitation with that id"); return 1; }
    say(`invitation:  ${found.id}`);
    say(`status:      ${found.status}`);
    say(`partner:     ${found.storeName} <${found.email}>${found.contactName ? `  (${found.contactName})` : ""}`);
    say(`created:     ${found.createdAt}`);
    say(`expires:     ${found.expiresAt}`);
    if (found.acceptedAt) {
      say(`accepted:    ${found.acceptedAt}`);
      say(`created:     partner ${found.partnerId}, account ${found.accountId}`);
    }
    if (found.revokedAt) say(`revoked:     ${found.revokedAt}`);
    if (found.note) say(`note:        ${found.note}`);
    say("The credential itself is not stored and cannot be shown.");
    return 0;
  },

  /* Withdrawing is one-way. To let someone in after this, invite them again:
     a new invitation with a new credential, so what happened to the old one
     stays readable. */
  async "revoke-invitation"({ invitations }, flags, say) {
    const revoked = await invitations.revokeInvitation(flags.id);
    if (!revoked) { say("no pending invitation with that id; nothing changed"); return 1; }
    say(`revoked:     ${revoked.id}  ${revoked.storeName} <${revoked.email}>`);
    say("That credential can no longer register anything. Invite them again to");
    say("issue a new one.");
    return 0;
  },
};

/* `database` is injected by the tests; production opens one from the
   environment and closes it when the command is done. */
async function runCommand(argv = [], { env = process.env, say = console.log, database } = {}) {
  const [name, ...rest] = argv;
  if (!name || name === "--help" || name === "help") { say(USAGE); return name ? 0 : 2; }
  const command = Object.prototype.hasOwnProperty.call(OPERATIONS, name) ? OPERATIONS[name] : null;
  if (!command) { say(`unknown command "${name}"`); say(USAGE); return 2; }
  const { flags, unknown } = parseFlags(rest);
  if (unknown) { say(`unexpected argument "${unknown}"`); say(USAGE); return 2; }

  const run = (context) => command(context, flags, say);
  try {
    return database ? await run(database) : await withDatabase(run, { env });
  } catch (error) {
    say(`failed:      ${safeMessage(error)}`);
    if (error && error.code) say(`code:        ${error.code}`);
    return 1;
  }
}

if (require.main === module) {
  runCommand(process.argv.slice(2)).then((code) => { process.exitCode = code; },
    (error) => { console.error(`failed: ${safeMessage(error)}`); process.exitCode = 1; });
}

module.exports = { runCommand, USAGE, safeMessage };
