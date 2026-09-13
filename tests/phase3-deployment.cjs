/* ============================================================================
   PHASE 3 BATCH 4 — THE HOSTED ENVIRONMENT

   What an operator runs, and what production starts from. The database is
   PGlite (real PostgreSQL, in process) and every command is the real one; only
   the pool is replaced, the way production replaces it with a real one.

     A  configuration for a hosted environment
     B  the migration command
     C  the server never migrates itself
     D  the empty canonical world
     E  provisioning a sign-in for an existing actor
     F  secrets stay out of output
     G  deployment artifacts and the runbook
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const RT = require("../domain/metyet-runtime.js");
const { validateWorld } = require("../domain/metyet-world.js");
const { fromPGlite } = require("../persistence/database.js");
const { migrate, migrationStatus, readMigrations } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { createApp } = require("../server/app.js");
const { runCommand, safeMessage, USAGE } = require("../server/cli.js");
const { emptyWorld, bootstrapWorld, COLLECTIONS } = require("../server/bootstrap.js");
const { linkActorAccount, listActors } = require("../server/provisioning.js");
const { loadServerConfig, loadDatabaseConfig, loadAuthConfig, describeConfig } = require("../server/config.js");

const ROOT = path.join(__dirname, "..");
const SECRET = "sup3r-s3cret-password";
const ENV = {
  DATABASE_URL: `postgresql://metyet:${SECRET}@db.example.supabase.co:5432/postgres`,
  SUPABASE_URL: "https://projectref.supabase.co",
};

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

/* An empty database: no schema at all, as a new Supabase project is. */
async function blank() {
  const pg = database();
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade");
  const db = fromPGlite(pg);
  return { pg, db, repository: createWorldRepository(db), accounts: createAccountDirectory(db) };
}
/* A migrated database with an empty world, as production starts. */
async function migrated() {
  const context = await blank();
  await migrate(context.db);
  return context;
}

/* The CLI with its database injected and its output captured. */
async function cli(args, context) {
  const lines = [];
  const code = await runCommand(args, { say: (line) => lines.push(String(line)), database: context, env: {} });
  return { code, out: lines.join("\n") };
}

const card = (id) => ({ id, name: "Charizard", set: "Base Set", num: "4/102", print: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null, tags: [] });
const populated = () => ({ ...emptyWorld(),
  catalog: [card("k1")],
  collectors: [{ id: "c1", name: "Casey" }],
  partners: [{ id: "p1", name: "Northline", tradeRate: 0.8 }],
  relationships: [{ partnerId: "p1", collectorId: "c1", status: "accepted", at: "2026-01-01" }],
  goals: [{ id: "g1", collectorId: "c1", cardId: "k1", tier: "primary" }] });

/* ============================================================== A */
describe("A. configuration for a hosted environment", () => {
  test("an operator command needs a database and nothing else", () => {
    const db = loadDatabaseConfig({ DATABASE_URL: ENV.DATABASE_URL });
    eq(db.connectionString, ENV.DATABASE_URL, "the connection string");
    eq(db.sslMode, "require", "TLS on by default");
    eq(db.poolMax, 10);
    assert(db.statementTimeoutMs >= 1000 && db.idleTransactionTimeoutMs >= 1000, "a hung statement cannot hold the world lock for ever");
    let threw = null;
    try { loadDatabaseConfig({}); } catch (e) { threw = e; }
    assert(threw && /DATABASE_URL/.test(threw.message), "and it names what is missing");
  });

  test("the server needs the identity provider too, and derives its endpoints", () => {
    const config = loadServerConfig({ ...ENV, PORT: "10000" });
    eq(config.auth.jwksUrl, "https://projectref.supabase.co/auth/v1/.well-known/jwks.json", "Supabase's JWKS path");
    eq(config.auth.issuer, "https://projectref.supabase.co/auth/v1", "Supabase's issuer");
    eq(config.auth.audience, "authenticated", "Supabase's audience for a signed-in user");
    eq(config.port, 10000, "the port the host provides");
    eq(config.host, "0.0.0.0", "bound where a container can reach it");
    eq(loadAuthConfig(ENV).issuer, config.auth.issuer, "the same, loaded on its own");
    let threw = null;
    try { loadServerConfig({ DATABASE_URL: ENV.DATABASE_URL }); } catch (e) { threw = e; }
    assert(threw && /SUPABASE_URL/.test(threw.message), "the server will not start without it");
  });

  test("hosted TLS is configurable, and refuses nonsense", () => {
    eq(JSON.stringify(loadDatabaseConfig(ENV).ssl), JSON.stringify({ rejectUnauthorized: true }), "verified by default");
    eq(loadDatabaseConfig({ ...ENV, DATABASE_SSL: "no-verify" }).ssl.rejectUnauthorized, false, "a provider chain can be trusted loosely");
    eq(loadDatabaseConfig({ ...ENV, DATABASE_SSL: "disable" }).ssl, false, "and disabled for a local database");
    eq(loadDatabaseConfig({ ...ENV, DATABASE_CA_CERT: "-----BEGIN CERTIFICATE-----" }).ssl.ca, "-----BEGIN CERTIFICATE-----", "a pinned CA");
    let threw = null;
    try { loadDatabaseConfig({ ...ENV, DATABASE_SSL: "maybe" }); } catch (e) { threw = e; }
    assert(threw && /DATABASE_SSL/.test(threw.message));
  });
});

/* ============================================================== B */
describe("B. the migration command", () => {
  test("it applies every migration to an empty database and says what it did", async () => {
    const context = await blank();
    const first = await cli(["migrate"], context);
    eq(first.code, 0, first.out);
    readMigrations().forEach((m) => assert(first.out.includes(m.version), "names " + m.version));
    const status = await migrationStatus(context.db);
    eq(status.pending.length, 0, "nothing pending");
    eq(status.applied.join(), readMigrations().map((m) => m.version).join(), "all applied, in order");
  });

  test("running it again changes nothing", async () => {
    const context = await migrated();
    const before = (await context.pg.query("select version, checksum from metyet.schema_migrations order by version")).rows;
    const again = await cli(["migrate"], context);
    eq(again.code, 0);
    assert(/already up to date/.test(again.out), again.out);
    eq(JSON.stringify((await context.pg.query("select version, checksum from metyet.schema_migrations order by version")).rows),
      JSON.stringify(before), "the record is untouched");
  });

  test("a migration edited after it ran is refused, and the command fails", async () => {
    const context = await migrated();
    const [first] = readMigrations();
    const lines = [];
    const code = await runCommand(["migrate"], { say: (l) => lines.push(l), database: context, env: {} });
    eq(code, 0, "the honest run passes");
    const { migrate: runMigrate } = require("../persistence/migrate.js");
    let failed = null;
    try { await runMigrate(context.db, { migrations: [{ ...first, checksum: "tampered" }] }); } catch (e) { failed = e; }
    assert(failed && failed.code === "persistence.migration-changed", "the runner refuses it");
    void lines;
  });

  test("status reports the schema and the world without touching either", async () => {
    const blankStatus = await cli(["status"], await blank());
    eq(blankStatus.code, 0);
    assert(/not migrated/.test(blankStatus.out), blankStatus.out);
    const context = await migrated();
    const ready = await cli(["status"], context);
    assert(/0 pending/.test(ready.out) && /world: *version 0, empty/.test(ready.out), ready.out);
    eq((await migrationStatus(context.db)).pending.length, 0, "status applied nothing");
  });

  test("an unknown command or stray argument is a usage error, not a guess", async () => {
    const context = await migrated();
    eq((await cli(["nonsense"], context)).code, 2);
    eq((await cli(["migrate", "now"], context)).code, 2);
    eq((await cli([], context)).code, 2);
    const help = await cli(["--help"], context);
    eq(help.code, 0);
    assert(help.out.includes("link-account") && help.out === USAGE, "the usage text");
  });
});

/* ============================================================== C */
describe("C. the server never migrates itself", () => {
  test("starting against an unmigrated database writes no schema and reports unready", async () => {
    const context = await blank();
    const app = createApp({ repository: context.repository, accounts: context.accounts,
      verifier: { verify: async () => ({ subject: "sub" }) }, runtime: RT.systemRuntime(),
      checkSchema: () => migrationStatus(context.db) });
    const ready = await app.inject({ method: "GET", url: "/api/health/ready" });
    eq(ready.statusCode, 503, ready.body);
    eq(ready.json().reason, "migrations-pending", "it says which kind of unready");
    const live = await app.inject({ method: "GET", url: "/api/health/live" });
    eq(live.statusCode, 200, "liveness still answers");
    const schemas = (await context.pg.query("select count(*)::int as n from information_schema.schemata where schema_name in ('metyet','metyet_auth')")).rows[0].n;
    eq(schemas, 0, "nothing was created by starting");
  });

  test("a half-migrated database is unready too", async () => {
    const context = await migrated();
    const pretend = { ...context.db };
    const app = createApp({ repository: context.repository, accounts: context.accounts,
      verifier: { verify: async () => ({ subject: "sub" }) }, runtime: RT.systemRuntime(),
      checkSchema: async () => ({ migrated: true, applied: ["0001_canonical_world"], pending: ["0002_accounts"] }) });
    const ready = await app.inject({ method: "GET", url: "/api/health/ready" });
    eq(ready.statusCode, 503);
    eq(ready.json().reason, "migrations-pending");
    void pretend;
  });

  test("once migrated, readiness is green and says nothing about the world", async () => {
    const context = await migrated();
    const app = createApp({ repository: context.repository, accounts: context.accounts,
      verifier: { verify: async () => ({ subject: "sub" }) }, runtime: RT.systemRuntime(),
      checkSchema: () => migrationStatus(context.db) });
    const ready = await app.inject({ method: "GET", url: "/api/health/ready" });
    eq(ready.statusCode, 200);
    eq(JSON.stringify(ready.json()), JSON.stringify({ status: "ready" }));
  });

  /* A database that cannot be reached is a different problem from a database
     that has not been migrated, and the fixes are different. Reporting the first
     as the second sends an operator to run a migration command that will fail
     for the same reason the server did. */
  test("a database failure is not mistaken for a schema that was never migrated", async () => {
    const context = await migrated();
    for (const failure of [
      Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:5432"), { code: "ECONNREFUSED" }),
      Object.assign(new Error("password authentication failed for user \"metyet\""), { code: "28P01" }),
      Object.assign(new Error("permission denied for schema metyet"), { code: "42501" }),
      Object.assign(new Error("self signed certificate in certificate chain"), { code: "SELF_SIGNED_CERT_IN_CHAIN" }),
      new Error("the driver fell over"),
    ]) {
      const broken = { kind: "broken", transaction: async () => { throw failure; } };
      let threw = null;
      try { await migrationStatus(broken); } catch (e) { threw = e; }
      eq(threw, failure, `${failure.code || "no code"} propagates instead of being reported as unmigrated`);

      const app = createApp({ repository: context.repository, accounts: context.accounts,
        verifier: { verify: async () => ({ subject: "sub" }) }, runtime: RT.systemRuntime(),
        checkSchema: () => migrationStatus(broken) });
      const ready = await app.inject({ method: "GET", url: "/api/health/ready" });
      eq(ready.statusCode, 503, ready.body);
      eq(ready.json().reason, undefined, "generically unavailable, not migrations-pending");
      eq(JSON.stringify(ready.json()), JSON.stringify({ status: "unavailable" }), "and nothing about the database leaks out");
    }
  });

  /* The one database error that does mean "never migrated" is the bookkeeping
     table (or its schema) not existing, and that is read from the SQLSTATE
     rather than the message. */
  test("only a missing migration table reads as never migrated", async () => {
    const context = await blank();
    const status = await migrationStatus(context.db);
    eq(status.migrated, false);
    eq(status.pending.length, readMigrations().length, "everything is pending");
    eq(status.changed.length, 0);
    for (const code of ["42P01", "3F000"]) {
      const absent = { kind: "absent", transaction: async () => { throw Object.assign(new Error("relation does not exist"), { code }); } };
      eq((await migrationStatus(absent)).migrated, false, code + " means the schema is not there yet");
    }
  });

  test("asking whether the schema is ready applies nothing to it", async () => {
    const context = await blank();
    const app = createApp({ repository: context.repository, accounts: context.accounts,
      verifier: { verify: async () => ({ subject: "sub" }) }, runtime: RT.systemRuntime(),
      checkSchema: () => migrationStatus(context.db) });
    for (let i = 0; i < 3; i += 1) {
      eq((await app.inject({ method: "GET", url: "/api/health/ready" })).statusCode, 503);
    }
    const schemas = (await context.pg.query("select count(*)::int as n from information_schema.schemata where schema_name in ('metyet','metyet_auth')")).rows[0].n;
    eq(schemas, 0, "readiness created nothing, however often it is asked");
    eq((await migrationStatus(context.db)).applied.length, 0, "and applied nothing");
  });

  /* migrate() refuses a migration file that was edited after it ran. Readiness
     has to agree: the database and the build disagree about what the schema is,
     and a green health check would hide that behind a service that looks fine. */
  test("an applied migration that was edited afterwards cannot produce readiness 200", async () => {
    const context = await migrated();
    const real = readMigrations();
    const edited = real.map((m, i) => (i === 0 ? { ...m, sql: m.sql + "\n-- a later edit\n", checksum: "0".repeat(64) } : m));

    const drifted = await migrationStatus(context.db, { migrations: edited });
    eq(drifted.migrated, true, "the bookkeeping table is still there");
    eq(drifted.pending.length, 0, "and nothing is pending — only the contents disagree");
    eq(drifted.changed.join(), real[0].version, "the drifted migration is named");

    const app = createApp({ repository: context.repository, accounts: context.accounts,
      verifier: { verify: async () => ({ subject: "sub" }) }, runtime: RT.systemRuntime(),
      checkSchema: () => migrationStatus(context.db, { migrations: edited }) });
    const ready = await app.inject({ method: "GET", url: "/api/health/ready" });
    eq(ready.statusCode, 503, ready.body);
    eq(ready.json().reason, "schema-integrity", "a stable reason, and not the same one as a pending migration");
    eq(JSON.stringify(ready.json()), JSON.stringify({ status: "unavailable", reason: "schema-integrity" }),
      "which version, and why, stays in the log");

    /* Undoctored, the same database is ready — so this is drift, not breakage. */
    const honest = createApp({ repository: context.repository, accounts: context.accounts,
      verifier: { verify: async () => ({ subject: "sub" }) }, runtime: RT.systemRuntime(),
      checkSchema: () => migrationStatus(context.db) });
    eq((await honest.inject({ method: "GET", url: "/api/health/ready" })).statusCode, 200);

    /* And the operator command says the same thing the health check does. */
    const said = await cli(["status"], context);
    eq(said.code, 0, said.out);
    assert(!/integrity/.test(said.out), "nothing has drifted in the real files");
  });

  test("the production bootstrap applies no migration itself", () => {
    const index = fs.readFileSync(path.join(ROOT, "server", "index.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert(!/[^a-zA-Z]migrate\s*\(/.test(index), "server/index.js never calls migrate()");
    assert(/migrationStatus/.test(index), "it only asks what the state is");
    const app = fs.readFileSync(path.join(ROOT, "server", "app.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert(!/migrate\s*\(/.test(app), "and neither do the routes");
  });
});

/* ============================================================== D */
describe("D. the empty canonical world", () => {
  test("the empty world is every collection and nothing in them, and the domain accepts it", () => {
    const world = emptyWorld();
    eq(Object.keys(world).sort().join(), [...COLLECTIONS].sort().join(), "every canonical collection");
    Object.entries(world).forEach(([name, rows]) => { assert(Array.isArray(rows) && rows.length === 0, name + " is empty"); });
    assert(validateWorld(world).ok, "validateWorld accepts it");
    /* Serialized, the world is collection names and punctuation — no value of
       any kind survives stripping the keys. Nothing is seeded, not even an id. */
    const skeleton = JSON.stringify(world).replace(/"[A-Za-z]+":/g, "");
    eq(skeleton.replace(/[{}[\],]/g, ""), "", "there is no data in it at all: " + skeleton.slice(0, 200));
  });

  test("bootstrapping a fresh database gives an empty, valid, readable world", async () => {
    const context = await migrated();
    const result = await cli(["bootstrap"], context);
    eq(result.code, 0, result.out);
    const world = await context.repository.loadWorld();
    assert(validateWorld(world).ok, "valid");
    Object.values(world).forEach((rows) => eq(rows.length, 0, "empty"));
    eq(await context.repository.readVersion(), 0, "the version has not moved");
    const rows = (await context.pg.query(`select sum(n)::int as total from (
      select count(*) as n from metyet.catalog_cards union all select count(*) from metyet.collectors
      union all select count(*) from metyet.partners union all select count(*) from metyet.opportunities) x`)).rows[0].total;
    eq(rows, 0, "no rows were invented");
  });

  test("bootstrapping twice is safe", async () => {
    const context = await migrated();
    await cli(["bootstrap"], context);
    const again = await cli(["bootstrap"], context);
    eq(again.code, 0, again.out);
    eq(await context.repository.readVersion(), 0, "still untouched");
  });

  test("it refuses to overwrite a world that already exists, and writes nothing", async () => {
    const context = await migrated();
    await context.repository.saveWorld(populated());
    const before = (await context.pg.query("select to_jsonb(x) as r from metyet.collectors x")).rows.map((r) => JSON.stringify(r.r)).join();
    const result = await cli(["bootstrap"], context);
    eq(result.code, 1, result.out);
    assert(/already holds a world/.test(result.out), result.out);
    assert(/collectors: 1/.test(result.out), "it names what it found: " + result.out);
    eq((await context.pg.query("select to_jsonb(x) as r from metyet.collectors x")).rows.map((r) => JSON.stringify(r.r)).join(), before, "untouched");
    let failed = null;
    try { await bootstrapWorld(context.repository); } catch (e) { failed = e; }
    eq(failed && failed.code, "bootstrap.world-not-empty", "and the code says why");
  });

  test("nothing in the production path can reach the demo seed", () => {
    for (const file of ["server/bootstrap.js", "server/cli.js", "server/index.js", "server/provisioning.js", "server/db-pool.js"]) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      assert(!/buildCanonicalSeed|createStore|dist\/|\.\.\/src\/|demoDealFixture/.test(text), file + " reaches the prototype");
    }
  });
});

/* ============================================================== E */
describe("E. provisioning a sign-in for an actor that exists", () => {
  const link = (context, flags) => cli(["link-account", ...flags], context);

  test("a Collector and a Trusted Partner can be linked, and then authenticate", async () => {
    const context = await migrated();
    await context.repository.saveWorld(populated());
    eq((await link(context, ["--subject=sub-casey", "--role=collector", "--actor=c1"])).code, 0);
    eq((await link(context, ["--subject=sub-northline", "--role=tp", "--actor=p1"])).code, 0);
    const app = createApp({ repository: context.repository, accounts: context.accounts, runtime: RT.systemRuntime(),
      verifier: { verify: async (token) => ({ subject: token }) } });
    const casey = await app.inject({ method: "GET", url: "/api/view", headers: { authorization: "Bearer sub-casey" } });
    eq(casey.statusCode, 200, casey.body);
    eq(JSON.stringify(casey.json().state.actor), JSON.stringify({ seat: "collector", collectorId: "c1" }));
    const northline = await app.inject({ method: "GET", url: "/api/view", headers: { authorization: "Bearer sub-northline" } });
    eq(JSON.stringify(northline.json().state.actor), JSON.stringify({ seat: "tp", partnerId: "p1" }));
  });

  test("an actor that does not exist in the canonical world is refused", async () => {
    const context = await migrated();
    await context.repository.saveWorld(populated());
    const missing = await link(context, ["--subject=sub-ghost", "--role=collector", "--actor=c404"]);
    eq(missing.code, 1, missing.out);
    assert(/no Collector "c404"/.test(missing.out), missing.out);
    eq((await context.accounts.listAccounts()).length, 0, "and nothing was written");
  });

  test("the role and the actor must agree", async () => {
    const context = await migrated();
    await context.repository.saveWorld(populated());
    const wrong = await link(context, ["--subject=sub-x", "--role=tp", "--actor=c1"]);
    eq(wrong.code, 1);
    assert(/exists, but as a Collector/.test(wrong.out), wrong.out);
    eq((await context.accounts.listAccounts()).length, 0, "nothing written");
  });

  test("a second active account for one subject or one actor is refused", async () => {
    const context = await migrated();
    await context.repository.saveWorld({ ...populated(), collectors: [{ id: "c1", name: "Casey" }, { id: "c2", name: "Dana" }] });
    eq((await link(context, ["--subject=sub-casey", "--role=collector", "--actor=c1"])).code, 0);
    const twice = await link(context, ["--subject=sub-casey", "--role=collector", "--actor=c2"]);
    eq(twice.code, 1, twice.out);
    const sameActor = await link(context, ["--subject=sub-other", "--role=collector", "--actor=c1"]);
    eq(sameActor.code, 1, sameActor.out);
    eq((await context.accounts.listAccounts()).length, 1, "one account, as intended");
  });

  test("nothing is inferred: a subject, a role and an actor id are all required", async () => {
    const context = await migrated();
    await context.repository.saveWorld(populated());
    for (const flags of [[], ["--subject=sub-x"], ["--subject=sub-x", "--role=collector"],
      ["--role=collector", "--actor=c1"], ["--subject=sub-x", "--role=owner", "--actor=c1"]]) {
      const result = await link(context, flags);
      eq(result.code, 1, flags.join(" "));
    }
    /* Each missing argument is refused for its own reason. A command that let a
       missing role fall through would still refuse — but by claiming the actor
       does not exist, which sends the operator looking in the wrong place. */
    const reasons = [
      [{ role: "collector", actorId: "c1" }, "provisioning.subject-required"],
      [{ subject: "sub-x", actorId: "c1" }, "provisioning.role-required"],
      [{ subject: "sub-x", role: "owner", actorId: "c1" }, "provisioning.role-required"],
      [{ subject: "sub-x", role: "collector" }, "provisioning.actor-required"],
    ];
    for (const [args, code] of reasons) {
      let refused = null;
      try {
        await linkActorAccount({ repository: context.repository, accounts: context.accounts, ...args });
      } catch (e) { refused = e; }
      eq(refused && refused.code, code, JSON.stringify(args));
    }
    /* An email address is not authority, and there is no parameter for one. */
    let failed = null;
    try {
      await linkActorAccount({ repository: context.repository, accounts: context.accounts,
        email: "casey@example.test", role: "collector", actorId: "c1" });
    } catch (e) { failed = e; }
    eq(failed && failed.code, "provisioning.subject-required");
    eq((await context.accounts.listAccounts()).length, 0, "nothing written by any of it");
  });

  test("an empty world says plainly that there is nobody to link yet", async () => {
    const context = await migrated();
    await cli(["bootstrap"], context);
    const actors = await cli(["actors"], context);
    eq(actors.code, 0);
    assert(/partners: *none/.test(actors.out) && /collectors: *none/.test(actors.out), actors.out);
    assert(/no command that/.test(actors.out), "and names the gap: " + actors.out);
    eq(JSON.stringify(await listActors(context.repository)), JSON.stringify({ collectors: [], partners: [] }));
    const attempt = await cli(["link-account", "--subject=sub-first-tp", "--role=tp", "--actor=p1"], context);
    eq(attempt.code, 1, "so the first Trusted Partner cannot be provisioned by a script");
  });

  test("an account can be listed and disabled", async () => {
    const context = await migrated();
    await context.repository.saveWorld(populated());
    await cli(["link-account", "--subject=sub-casey", "--role=collector", "--actor=c1"], context);
    const listed = await cli(["accounts"], context);
    assert(/active/.test(listed.out) && /collector/.test(listed.out) && /sub-casey/.test(listed.out), listed.out);
    const accountId = (await context.accounts.listAccounts())[0].accountId;
    const disabled = await cli(["disable-account", `--account=${accountId}`], context);
    eq(disabled.code, 0, disabled.out);
    eq(await context.accounts.findActiveBySubject("sub-casey"), null, "the sign-in no longer resolves");
    eq((await cli(["disable-account", `--account=${accountId}`], context)).code, 1, "and disabling it twice is not a success");
  });
});

/* ============================================================== F */
describe("F. secrets stay out of every output", () => {
  test("a failure never prints the connection string", async () => {
    const broken = { db: { transaction: async () => { throw new Error(`connect ECONNREFUSED for ${ENV.DATABASE_URL}`); } },
      repository: { loadWorld: async () => { throw new Error(`password authentication failed for "${ENV.DATABASE_URL}"`); },
        readVersion: async () => 0 },
      accounts: { listAccounts: async () => [] } };
    for (const args of [["status"], ["bootstrap"], ["accounts"]]) {
      const result = await cli(args, broken);
      assert(!result.out.includes(SECRET), args[0] + " leaked the password: " + result.out);
      assert(!result.out.includes("db.example.supabase.co"), args[0] + " leaked the host");
    }
    eq(safeMessage(new Error(`could not connect to ${ENV.DATABASE_URL}`)), "could not connect to <connection string>");
    eq(safeMessage(new Error("password=hunter2 rejected")), "password=<hidden> rejected");
  });

  test("startup logging and configuration errors carry settings, not values", () => {
    const described = JSON.stringify(describeConfig(loadServerConfig(ENV)));
    assert(!described.includes(SECRET) && !described.includes(ENV.DATABASE_URL), described);
    eq(JSON.parse(described).jwksHost, "projectref.supabase.co", "the host is enough to tell projects apart");
    let threw = null;
    try { loadServerConfig({ ...ENV, DATABASE_SSL: "maybe" }); } catch (e) { threw = e; }
    assert(threw && !threw.message.includes(SECRET), threw.message);
  });

  test("nothing committed in this batch looks like a credential", () => {
    for (const file of ["render.yaml", "docs/DEPLOYMENT.md", "server/cli.js", "server/db-pool.js",
      "server/bootstrap.js", "server/provisioning.js", "server/config.js", ".node-version"]) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      assert(!/eyJ[A-Za-z0-9_-]{20,}/.test(text), file + " contains something like a token");
      assert(!/postgres(ql)?:\/\/[^\s"'`]*:[^\s"'`]*@/.test(text), file + " contains a connection string with a password");
      assert(!/service_role|anon_key|BEGIN (RSA )?PRIVATE KEY|srv-[a-z0-9]{16,}/.test(text), file + " contains a key or a service id");
    }
  });
});

/* ============================================================== G */
describe("G. deployment artifacts and the runbook", () => {
  const render = fs.readFileSync(path.join(ROOT, "render.yaml"), "utf8");
  const runbook = fs.readFileSync(path.join(ROOT, "docs", "DEPLOYMENT.md"), "utf8");
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

  test("the blueprint says how to build, start and check the service", () => {
    eq((render.match(/buildCommand: (.*)/) || [])[1], "npm ci --omit=dev", "production dependencies only");
    eq((render.match(/startCommand: (.*)/) || [])[1], "npm start");
    eq((render.match(/healthCheckPath: (.*)/) || [])[1], "/api/health/ready");
    assert(/NODE_VERSION/.test(render) && fs.readFileSync(path.join(ROOT, ".node-version"), "utf8").trim() === "22",
      "one Node version, written down twice and agreeing");
    assert(/autoDeploy: false/.test(render), "deploys are deliberate");
  });

  test("the blueprint carries no secret: every value-bearing variable is safe to read", () => {
    const withValues = [...render.matchAll(/- key: (\w+)\n\s+value: (.*)/g)].map((m) => [m[1], m[2].replace(/"/g, "")]);
    const secretish = [...render.matchAll(/- key: (\w+)\n\s+sync: false/g)].map((m) => m[1]);
    eq(secretish.sort().join(), "DATABASE_URL,SUPABASE_URL", "the two an operator sets by hand");
    withValues.forEach(([key, value]) => assert(!/URL|SECRET|KEY|TOKEN|PASSWORD/i.test(key) || value === "", `${key} has a value in the file`));
    eq(withValues.find(([k]) => k === "DATABASE_SSL")[1], "require", "TLS is on in the blueprint");
  });

  test("every environment variable the code reads is in the runbook, and vice versa", () => {
    const config = fs.readFileSync(path.join(ROOT, "server", "config.js"), "utf8");
    const read = [...config.matchAll(/env\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]);
    const named = [...new Set(read)].filter((name) => name !== "PORT" && name !== "HOST" && name !== "LOG_LEVEL");
    named.forEach((name) => assert(runbook.includes(name), `${name} is not in the runbook`));
    ["PORT"].forEach((name) => assert(runbook.includes(name), `${name} is not in the runbook`));
  });

  test("the runbook separates what is local from what only Matt can do, and prices it", () => {
    assert(/## Part 1 — local, no vendor needed/.test(runbook), "local work is marked");
    assert(/## Part 2 — the external actions/.test(runbook), "external work is marked");
    ["Supabase", "Render", "Resend", "DNS"].forEach((vendor) => assert(runbook.includes(vendor), vendor + " is covered"));
    assert(/\$7\/month|\$7 /.test(runbook) && /\$25\/month/.test(runbook), "the paid choices are named");
    assert(/Check\b/.test(runbook), "each action has a verification");
    assert(/no command that/.test(runbook) || /cannot create/.test(runbook), "the Trusted Partner gap is written down");
  });

  test("the operator commands the runbook names exist", () => {
    ["db:status", "db:migrate", "db:bootstrap", "account:link", "account:list", "start"].forEach((script) => {
      assert(pkg.scripts[script], script + " is missing from package.json");
      assert(runbook.includes(script), script + " is not in the runbook");
    });
    eq(pkg.scripts["db:migrate"], "node server/cli.js migrate");
    eq(pkg.scripts.verify, "npm run build && npm test && npm run prod && npm run smoke && npm run previews",
      "the founder's one local gate is unchanged");
  });

  test("the Supabase assumptions in the runbook are the ones the code enforces", () => {
    const verifier = fs.readFileSync(path.join(ROOT, "server", "auth", "token-verifier.js"), "utf8");
    const config = loadServerConfig(ENV);
    assert(runbook.includes("/auth/v1/.well-known/jwks.json"), "the JWKS path is written down");
    assert(config.auth.jwksUrl.endsWith("/auth/v1/.well-known/jwks.json"), "and derived");
    assert(runbook.includes("authenticated"), "the audience is written down");
    assert(/ES256/.test(runbook) && /ES256/.test(verifier), "asymmetric signing, in both");
    assert(/HS256/.test(runbook), "and the legacy algorithm is called out as unsupported");
    assert(/only asymmetric algorithms/.test(verifier), "which is what the verifier enforces");
  });
});

run();
