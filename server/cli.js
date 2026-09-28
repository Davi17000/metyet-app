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
       auth-check [--token-file=<path>]   is the identity provider set up right?
       sign-in --email=… [--out=<path>]   get one real access token, to check with
       register-partner [--url=…]         accept an invitation, against a running server
       view [--url=…]                     what this sign-in can see, as itself
       catalog-import --provider=… --vocabulary=<path> --records=<path>
                                  [--dry-run] [--limit=<n>]
                                  load approved card data through the translation boundary

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
const { checkAuth } = require("./auth-check.js");
const { signIn } = require("./auth-signin.js");
const { registerPartner, view } = require("./partner-register.js");
const fs = require("fs");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { systemRuntime } = require("../domain/metyet-runtime.js");
const { importCatalog, exitCodeFor, EXIT } = require("./catalog/import.js");
const { plan: planInventory, apply: applyInventory, createMapper } = require("./inventory/import.js");
const { templateNames, readTemplate } = require("./inventory/templates.js");

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
  node server/cli.js auth-check [--token-file=<path holding one access token>]
  node server/cli.js sign-in --email=<address> [--out=<path for the access token>]
  node server/cli.js register-partner [--url=<server>] [--token-file=<path>]
  node server/cli.js view [--url=<server>] [--token-file=<path>]
  node server/cli.js catalog-import --provider=<name> --vocabulary=<path> --records=<path> [--dry-run] [--limit=<n>]
  node server/cli.js inventory-templates
  node server/cli.js inventory-columns --csv=<path> [--template=<name>] [--mapping=<path>]
  node server/cli.js inventory-import --partner=<id> --csv=<path> [--template=<name>] [--mapping=<path>] [--approve] [--limit=<n>]

The database is read from DATABASE_URL (and DATABASE_SSL, DATABASE_CA_CERT or
DATABASE_CA_CERT_FILE, DATABASE_POOL_MAX); auth-check and sign-in read SUPABASE_URL and
SUPABASE_PUBLISHABLE_KEY instead and need no database. register-partner and view need
neither: they talk to a RUNNING server over HTTP, reading the bearer from a file.

catalog-import reads two JSON files an operator supplies: a vocabulary MetYet owns, and
source records some approved provider produced. It talks to no provider, opens no socket
and takes no credential — the records are already on disk when it runs. It exits 3 when it
completed but quarantined or rejected something, which is not a failure and is not a clean
success either.

inventory-import takes a Trusted Partner's own inventory CSV and a mapping that says what
its columns mean, and reports which rows resolve to a card MetYet's catalog already holds.
Without --approve it writes nothing at all: preview and import are two invocations, not a
flag, because a flag is one typo away from a shelf nobody agreed to. The partner comes from
--partner and never from the file. It exits 3 when it previewed or imported but could not
resolve every row, which is not a failure — with a thin catalog it is the expected answer
and the useful evidence.

Nothing here starts a server. auth-check and sign-in contact the identity provider — to
ask it a question, and to ask it to email one person a code — and neither changes anything
the vendor holds. No command here creates a Trusted Partner: register-partner asks a
server to redeem an invitation, and the server's own rules decide.`;

/* A message a person can act on, with nothing secret in it: a connection string
   that reached an error from the driver is removed rather than printed. */
const safeMessage = (error) => String((error && error.message) || error)
  .replace(/postgres(ql)?:\/\/\S+/gi, "<connection string>")
  .replace(/\b(password|secret|token|key)\s*=\s*\S+/gi, "$1=<hidden>");

/* Some failures are a person's next action rather than a fault, and two of them
   are reliably misread.

   A TLS trust failure against a hosted database almost always means one thing —
   the provider signs with its own root, and this machine has not been given it —
   and saying only "self-signed certificate in certificate chain" sends an
   operator looking for a fault in their connection string, or worse, for a way
   to turn verification off.

   And an authentication failure that is INTERMITTENT is not a wrong password.
   Supabase's shared pooler caches credentials, and documents that right after a
   password change it keeps checking new connections against the cached ones.
   The instinct on seeing 28P01 is to reset the database password — which is the
   one action that starts that window rather than ending it. So this says so.

   Codes, never message text: wording changes between releases. */
const TLS_TRUST_CODES = new Set([
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_UNTRUSTED",
]);
const ALTNAME_CODE = "ERR_TLS_CERT_ALTNAME_INVALID";

const AUTH_FAILED_CODE = "28P01";

function connectionAdvice(error, say) {
  const code = error && error.code;
  if (code === AUTH_FAILED_CODE) {
    say("");
    say("Before changing anything: if this command has just worked, or works when you run");
    say("it again, the password is not wrong. A hosted pooler caches credentials, and");
    say("Supabase documents connections being checked against a stale cache — which looks");
    say("exactly like this and clears itself.");
    say("");
    say("  Run a read-only command (`npm run db:status`) a few times. Some failing and");
    say("  some succeeding means the pooler, not the password.");
    say("");
    say("If it fails every time: on the SHARED pooler the user is postgres.<project-ref>,");
    say("not postgres, and a password with a reserved character (& # ? space) has to be");
    say("percent-encoded inside a connection string. Resetting the password is the last");
    say("thing to try, not the first — it opens the stale-cache window rather than closing");
    say("it.");
    return true;
  }
  if (TLS_TRUST_CODES.has(code)) {
    say("");
    say("That is certificate verification working, not a connection fault: the database");
    say("presented a certificate signed by a root this machine does not trust. Hosted");
    say("Postgres providers commonly sign with their own root and publish it to");
    say("download — on Supabase it is in Database Settings, under SSL Configuration.");
    say("");
    say("  export DATABASE_CA_CERT_FILE=/path/to/the/certificate.crt");
    say("");
    say("Then run this again. Do not turn verification off to get past it: without the");
    say("certificate checked, anything that can answer for the host reads and rewrites");
    say("everything on the connection, password included.");
    return true;
  }
  if (code === ALTNAME_CODE) {
    say("");
    say("The certificate verified, but it is not for this host — so either the host in");
    say("DATABASE_URL is not the one the provider issued it for, or the wrong CA is");
    say("configured. Check the host against the connection string in the dashboard.");
    return true;
  }
  return false;
}

function parseFlags(argv) {
  const flags = {};
  for (const arg of argv) {
    const match = /^--([a-z][a-z0-9-]*)(?:=(.*))?$/i.exec(arg);
    if (!match) return { flags, unknown: arg };
    flags[match[1]] = match[2] === undefined ? true : match[2];
  }
  return { flags, unknown: null };
}

/* Commands that talk to the identity provider rather than the database, and so
   must not demand DATABASE_URL to run: an operator configuring Supabase has not
   necessarily configured Postgres yet, and should not have to. */
/* `inventory-templates` and `inventory-columns` are here because neither can
   reach a card or a shelf: the first prints configuration, the second reads one
   file's headers. A verb that cannot write should not be handed a database to
   write with, and running them needs no DATABASE_URL at all. */
const WITHOUT_DATABASE = new Set(["auth-check", "sign-in", "register-partner", "view",
  "inventory-templates", "inventory-columns"]);

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

  /* The other half of the environment. Reads no database and writes nothing. */
  async "auth-check"(_context, flags, say) {
    return checkAuth({ env: this.env, say, tokenFile: flags["token-file"] });
  },

  /* Accepting an invitation, and then reading what it made. Both talk to a
     RUNNING SERVER over HTTP rather than to the database: the point is to prove
     the real route, with a real verified token, exactly as a browser will —
     so neither of them needs, or gets, a database connection of its own. */
  async "register-partner"(_context, flags, say) {
    return registerPartner({ say,
      ...(flags.url === undefined ? {} : { url: flags.url }),
      ...(flags["token-file"] === undefined ? {} : { tokenFile: flags["token-file"] }) });
  },

  async view(_context, flags, say) {
    return view({ say,
      ...(flags.url === undefined ? {} : { url: flags.url }),
      ...(flags["token-file"] === undefined ? {} : { tokenFile: flags["token-file"] }) });
  },

  /* The other half of that check: getting a real token to give it. The address
     is an argument because it is not a secret; the code is typed and the token
     is written to a file, because both are. */
  async "sign-in"(_context, flags, say) {
    return signIn({ env: this.env, say, email: flags.email,
      ...(flags.out === undefined ? {} : { out: flags.out }) });
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

  /* ------------------------------------------------- THE CATALOG (Phase 5 C4)

     An operator decision, made on purpose, exactly like `migrate`. There is no
     HTTP route to this and there must never be: a browser cannot mint card
     identity, and a thirty-thousand-record import is not a request.

     TWO FILES, AND THEY ARE DIFFERENT KINDS OF THING. The vocabulary is a
     declaration MetYet owns — a mapping table somebody reviewed — and the
     records are somebody else's data. Conflating them is how a provider's
     words end up deciding MetYet's, so they arrive as two paths and are read
     separately.

     PARSED, NEVER REQUIRED. `JSON.parse` on a string this file read, never
     `require()` on a path an operator passed: `require` on caller input is
     arbitrary code execution wearing a configuration flag. And nothing in
     either file is ever used AS a path — record contents name cards, not
     files.

     NO CREDENTIAL FLAG, and there is nothing here that would want one. When an
     adapter eventually needs a key it reads it from the environment like every
     other secret in this codebase; argv is visible in `ps` and lands in shell
     history. */
  async "catalog-import"({ db }, flags, say) {
    const provider = typeof flags.provider === "string" ? flags.provider.trim() : "";
    if (!provider) { say("catalog-import needs --provider=<name>"); return EXIT.invalid; }
    if (typeof flags.vocabulary !== "string" || !flags.vocabulary) {
      say("catalog-import needs --vocabulary=<path to a JSON mapping table>");
      return EXIT.invalid;
    }
    if (typeof flags.records !== "string" || !flags.records) {
      say("catalog-import needs --records=<path to a JSON array of source records>");
      return EXIT.invalid;
    }
    let limit = null;
    if (flags.limit !== undefined) {
      limit = Number(flags.limit);
      if (!Number.isInteger(limit) || limit <= 0) {
        say("--limit must be a positive whole number");
        return EXIT.invalid;
      }
    }
    const dryRun = flags["dry-run"] === true || flags["dry-run"] === "true";

    /* READ AND PARSE BOTH BEFORE ANYTHING IS WRITTEN. A truncated file, a JSON
       object where an array belongs, a vocabulary with a word the domain does
       not know — each is an operator's mistake and each should cost nothing. */
    let vocabulary;
    let records;
    try {
      vocabulary = JSON.parse(fs.readFileSync(flags.vocabulary, "utf8"));
    } catch (error) {
      say(`vocabulary:  could not be read as JSON — ${safeMessage(error)}`);
      return EXIT.failure;
    }
    try {
      records = JSON.parse(fs.readFileSync(flags.records, "utf8"));
    } catch (error) {
      say(`records:     could not be read as JSON — ${safeMessage(error)}`);
      return EXIT.failure;
    }
    if (!Array.isArray(records)) {
      say("records:     the file must hold a JSON array of source records");
      return EXIT.failure;
    }

    const catalog = createCatalogRepository(db, { newId: systemRuntime().newId });
    let summary;
    try {
      summary = await importCatalog({ catalog, db, provider, vocabulary, records,
        dryRun, limit });
    } catch (error) {
      say(`failed:      ${safeMessage(error)}`);
      return EXIT.failure;
    }

    reportImport(summary, say);
    return exitCodeFor(summary);
  },

  /* ------------------------------ THE SHOP'S OWN FILE (Phase 5 C8)

     A Trusted Partner already has their inventory somewhere. These three verbs
     are how MetYet does the translating instead of asking them to rewrite it.

     THREE VERBS BECAUSE THERE ARE THREE QUESTIONS, and separating them is what
     makes a mistake hard. `inventory-templates` says what shapes MetYet knows.
     `inventory-columns` says what a particular file's headers came out as under
     a particular mapping, and touches no card and no shelf. `inventory-import`
     resolves every row against the catalog and reports it — and writes only when
     told to in a separate word.

     WHY --approve AND NOT --dry-run. `catalog-import` defaults to writing and
     takes `--dry-run` to hold back, which is right for a file MetYet produced
     from a vocabulary MetYet owns. This file is somebody else's and the mapping
     is a guess until a person has read a preview, so the default is the safe one
     and the dangerous one has to be asked for. A run without `--approve` is
     handed no repository at all, so it could not write if it wanted to. */
  async "inventory-templates"(context, flags, say) {
    for (const name of templateNames()) {
      const t = readTemplate(name);
      say(`${name}${t.provisional ? "  (PROVISIONAL)" : ""}`);
      say(`  name:      ${t.name}`);
      if (t.note) say(`  note:      ${t.note}`);
      const mapped = Object.entries(t.columns).filter(([, h]) => h);
      say(`  columns:   ${mapped.length} mapped, `
        + `${Object.entries(t.columns).filter(([, h]) => !h).length} declared absent`);
      if ((t.ignore || []).length) say(`  ignores:   ${t.ignore.join(", ")}`);
    }
    return EXIT.clean;
  },

  async "inventory-columns"(context, flags, say) {
    const made = buildMapper(flags, say);
    if (!made.mapper) return made.exit;
    const csv = readTextFile(flags.csv, "csv", say);
    if (csv.error) return csv.error;
    const { parseCsv } = require("./inventory/mapping.js");
    const { headers, rows } = parseCsv(csv.text);
    const columns = made.mapper.columnsFor(headers);
    say(`template:    ${made.mapper.template.name}`
      + `${made.mapper.template.provisional ? "  (PROVISIONAL — not an authoritative schema)" : ""}`);
    say(`rows:        ${rows.length}`);
    reportColumns(columns, say);
    /* An unmapped header is not a failure and not a success: it is a file MetYet
       has not been told how to read, and somebody has to decide. */
    return columns.unread.length || columns.missing.length || columns.duplicated.length
      ? EXIT.quarantine : EXIT.clean;
  },

  async "inventory-import"({ db, repository }, flags, say) {
    const partnerId = typeof flags.partner === "string" ? flags.partner.trim() : "";
    if (!partnerId) { say("inventory-import needs --partner=<trusted partner id>"); return EXIT.invalid; }
    const made = buildMapper(flags, say);
    if (!made.mapper) return made.exit;
    const csv = readTextFile(flags.csv, "csv", say);
    if (csv.error) return csv.error;
    let limit = null;
    if (flags.limit !== undefined) {
      limit = Number(flags.limit);
      if (!Number.isInteger(limit) || limit <= 0) { say("--limit must be a positive whole number"); return EXIT.invalid; }
    }
    const approve = flags.approve === true || flags.approve === "true";

    const catalog = createCatalogRepository(db, { newId: systemRuntime().newId });
    let made2;
    try {
      /* The world is read once, to say what the shelf already holds — which is
         how a re-run is visible BEFORE it happens, given that an inventory copy
         has no natural key and re-running genuinely duplicates. */
      const world = await repository.loadWorld();
      made2 = await planInventory({ csv: csv.text, mapper: made.mapper, catalog,
        partnerId, world, limit });
    } catch (error) {
      say(`failed:      ${safeMessage(error)}`);
      return EXIT.failure;
    }

    reportPlan(made2, say);
    if (!approve) {
      say(`mode:        preview  (nothing was written; add --approve to import)`);
      return exitCodeForPlan(made2);
    }
    if (!made2.importable.length) {
      say(`mode:        approved, but no row resolved — nothing to write`);
      return exitCodeForPlan(made2);
    }
    let result;
    try {
      result = await applyInventory({ plan: made2, repository,
        runtime: systemRuntime(), partnerId });
    } catch (error) {
      say(`failed:      ${safeMessage(error)}  (one transaction — nothing was written)`);
      return EXIT.failure;
    }
    if (result.refused) {
      say(`refused:     ${result.refused.reason}`
        + `${result.refused.line ? ` at line ${result.refused.line}` : ""}`
        + `  (one transaction — nothing was written)`);
      return EXIT.failure;
    }
    say(`mode:        imported`);
    say(`written:     ${result.written} cop${result.written === 1 ? "y" : "ies"}`
      + `  (world version ${result.version})`);
    return exitCodeForPlan(made2);
  },
};

/* A mapping is either a template MetYet has written down or a JSON file for a
   shape nobody has yet. Never both, because then one of them is being ignored. */
function buildMapper(flags, say) {
  const named = typeof flags.template === "string" ? flags.template.trim() : "";
  const path = typeof flags.mapping === "string" ? flags.mapping.trim() : "";
  if (named && path) {
    say("give either --template=<name> or --mapping=<path>, not both");
    return { exit: EXIT.invalid };
  }
  if (!named && !path) {
    say(`give --template=<name> (${templateNames().join(", ")}) or --mapping=<path to a JSON mapping>`);
    return { exit: EXIT.invalid };
  }
  let template;
  if (named) {
    template = readTemplate(named);
    if (!template) {
      say(`no template called "${named}" — known: ${templateNames().join(", ")}`);
      return { exit: EXIT.invalid };
    }
  } else {
    /* PARSED, NEVER REQUIRED, exactly as catalog-import reads its vocabulary:
       `require` on a path an operator passed is arbitrary code execution wearing
       a configuration flag. */
    const file = readTextFile(path, "mapping", say);
    if (file.error) return { exit: file.error };
    try { template = JSON.parse(file.text); } catch (error) {
      say(`mapping:     could not be read as JSON — ${safeMessage(error)}`);
      return { exit: EXIT.failure };
    }
  }
  try {
    return { mapper: createMapper({ template }) };
  } catch (error) {
    say(`mapping:     ${safeMessage(error)}`);
    return { exit: EXIT.invalid };
  }
}

function readTextFile(path, label, say) {
  if (typeof path !== "string" || !path.trim()) {
    say(`inventory commands need --${label}=<path>`);
    return { error: EXIT.invalid };
  }
  try { return { text: fs.readFileSync(path.trim(), "utf8") }; } catch (error) {
    say(`${label}:${" ".repeat(Math.max(1, 12 - label.length - 1))}could not be read — ${safeMessage(error)}`);
    return { error: EXIT.failure };
  }
}

function reportColumns(columns, say) {
  say(`mapped:      ${columns.mapped.length}`);
  for (const { header, field } of columns.mapped) say(`  ${header}  ->  ${field}`);
  if (columns.ignored.length) say(`ignored:     ${columns.ignored.join(", ")}`);
  /* Labelled `unread`, not the other word. C4 pinned that this file prints no
     counter under that label, because C4 had one that nothing could compute
     honestly. This is a list of headers rather than a transition count — but the
     pin is right that the label is taken, so the label changes. */
  if (columns.unread.length) say(`unread:      ${columns.unread.join(", ")}  (nothing reads these)`);
  if (columns.duplicated.length) {
    say(`duplicated:  ${columns.duplicated.map((d) => `${d.header} x${d.count}`).join(", ")}`
      + `  (one column per field — map the file's columns explicitly)`);
  }
  if (columns.missing.length) {
    say(`missing:     ${columns.missing.map((m) => `${m.header} (${m.field})`).join(", ")}`
      + `  (the mapping expects these and the file has none)`);
  }
}

/* A count, a reason, and — for the rows that did NOT import — the detail that
   says why, which does quote what the cell said and sometimes the card's name.
   That is deliberate and it is the difference between a report an operator can
   act on and a number they have to go hunting behind. It is bounded: the
   IMPORTED rows are never listed, so a successful run prints no card names, no
   prices and no certs, and the rejected list is capped. An earlier draft of this
   comment claimed no card name or price is ever printed, which was false of the
   line directly beneath it. */
function reportPlan(made, say) {
  say(`template:    ${made.template.name}`
    + `${made.template.provisional ? "  (PROVISIONAL — not an authoritative schema)" : ""}`);
  say(`partner:     ${made.partnerId}`);
  reportColumns(made.columns, say);
  say(`rows:        ${made.counts.rows}${made.skipped ? `, ${made.skipped} not read (--limit)` : ""}`);
  say(`importable:  ${made.counts.importable} row${made.counts.importable === 1 ? "" : "s"}`
    + ` -> ${made.counts.copies} cop${made.counts.copies === 1 ? "y" : "ies"}`);
  say(`unresolved:  ${made.counts.unresolved}`);
  say(`ambiguous:   ${made.counts.ambiguous}`);
  say(`invalid:     ${made.counts.invalid}`);
  const why = Object.entries(made.counts.reasons).sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => `${reason} x${n}`).join(", ");
  if (why) say(`reasons:     ${why}`);
  /* THE LINES, SO A PERSON CAN LOOK. Capped, because a report is not a file. */
  const shown = made.rejected.slice(0, 20);
  for (const row of shown) say(`  line ${row.line}: ${row.klass} — ${row.reason}: ${row.detail}`);
  if (made.rejected.length > shown.length) {
    say(`  ... and ${made.rejected.length - shown.length} more`);
  }
  /* A re-run duplicates, because an inventory copy has no natural key. Said
     before the write, not after. */
  const dup = made.importable.filter((r) => r.alreadyOnShelf > 0);
  if (dup.length) {
    say(`already held: ${dup.length} of these cards are on this shelf already`
      + `  (importing adds MORE copies; there is no de-duplication)`);
  }
}

const exitCodeForPlan = (made) =>
  (made.counts.unresolved || made.counts.ambiguous || made.counts.invalid
    || made.columns.unread.length || made.columns.duplicated.length) ? EXIT.quarantine : EXIT.clean;

/* The run, in the aligned shape every other operator command uses. No record
   is printed and no payload: a summary says how many and why, and the queue
   itself is in the database for anybody who needs the detail. */
function reportImport(summary, say) {
  say(`provider:    ${summary.provider}`);
  say(`mode:        ${summary.mode}${summary.mode === "dry-run" ? "  (nothing was written)" : ""}`);
  say(`records:     ${summary.read} read${summary.processed === summary.read ? "" : `, ${summary.processed} processed (--limit)`}`);
  say(`mappable:    ${summary.mappable}`);
  say(`quarantined: ${summary.quarantined}${reasons(summary.quarantineReasons)}`);
  say(`rejected:    ${summary.rejected}${reasons(summary.rejectionReasons)}`);
  const ignored = reasons(summary.ignored);
  if (ignored) say(`ignored:     ${ignored}`);
  /* THE RELEASES THIS RUN OPENS, BY NAME (Phase 5 C6.1). An expansion code is
     whatever the operator's vocabulary says it is — nothing can check it, and
     nothing should, because a new release has to be declarable. So the run says
     which codes it is about to create, and a typo appears as a name nobody
     meant beside the one they did. Named rather than counted on purpose: "2"
     reads as correct to somebody who has not counted. */
  const releases = summary.expansions;
  if (releases && releases.known && releases.opening.length) {
    const n = releases.opening.length;
    say(`opening:     ${releases.opening.join(", ")}`);
    /* TENSE MATTERS HERE. The list is computed before any write, so on a dry
       run these are releases about to be created and on a completed run they
       are releases this run created. Saying "not in the catalog yet" in both
       places read as stale on the second. */
    say(`             ${n === 1 ? "one release" : `${n} releases`} the catalog did not `
      + `have${summary.mode === "dry-run" ? " — check this is what you meant"
        : "; check this is what you meant before importing more"}`);
  }
  if (releases && releases.known && releases.existing.length) {
    say(`adding to:   ${releases.existing.join(", ")}`);
  }
  if (summary.created) {
    say(`expansions:  new ${summary.created.expansions}  reused ${summary.reused.expansions}`);
    say(`contexts:    new ${summary.created.contexts}  reused ${summary.reused.contexts}`);
    say(`cards:       new ${summary.created.cards}  reused ${summary.reused.cards}`);
    say(`mappings:    ${summary.created.mappings} written`);
  }
  if (summary.failedBatch) {
    const f = summary.failedBatch;
    say(`failed at:   records ${f.from}-${f.to} (${f.size} in that batch) — ${f.message}`);
    say("That batch rolled back whole. Nothing after it was attempted. Run it again.");
  }
  say(`status:      ${summary.status}`);
}

const reasons = (counts) => {
  const pairs = Object.entries(counts || {});
  return pairs.length ? `  (${pairs.map(([k, n]) => `${k}: ${n}`).join(", ")})` : "";
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

  const run = (context) => command.call({ env }, context, flags, say);
  try {
    if (WITHOUT_DATABASE.has(name)) return await run({});
    return database ? await run(database) : await withDatabase(run, { env });
  } catch (error) {
    say(`failed:      ${safeMessage(error)}`);
    if (error && error.code) say(`code:        ${error.code}`);
    connectionAdvice(error, say);
    return 1;
  }
}

if (require.main === module) {
  runCommand(process.argv.slice(2)).then((code) => { process.exitCode = code; },
    (error) => { console.error(`failed: ${safeMessage(error)}`); process.exitCode = 1; });
}

module.exports = { runCommand, USAGE, safeMessage, connectionAdvice, TLS_TRUST_CODES, AUTH_FAILED_CODE };
