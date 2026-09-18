/* ============================================================================
   OUT OF BAND — COLLECTOR ACCEPTANCE ON A REAL POSTGRESQL, WITH REAL CONNECTIONS

   NOT part of `npm test`, and it is not optional either. The in-process
   database (PGlite) is real PostgreSQL but it is ONE SESSION, so two
   "concurrent" redemptions there serialize no matter how the code is written.
   That hides exactly the bug this batch is most able to have.

   THE BUG IT HIDES, STATED PLAINLY. Batch 3A decides whether to create a
   Collector or reuse one by asking the account directory who the authenticated
   subject already is. If that question is asked BEFORE the world lock is
   granted, two people — or one person redeeming two invitations at once — can
   both be told "nobody", and both will try to mint an identity. On one session
   the second simply runs afterwards and sees the first, so the wrong code
   passes. On a pool of real connections it does not: the second gets past the
   lookup, waits at the lock, and then violates accounts_active_subject_key.

   So this runs the real acceptance against a real pg.Pool:

     A  the happy path across two schemas, in one transaction
     B  ONE CREDENTIAL, TWO CONCURRENT REDEEMERS — exactly one wins
     C  ONE UNKNOWN PERSON, TWO INVITATIONS, CONCURRENTLY — the load-bearing
        multi-TP proof: one Collector, one account, two Relationships
     D  rollback across schemas: a failure after the world is saved and before
        the account is bound leaves nothing at all
     E  the world lock actually serializes them

   Run it against a THROWAWAY database — it drops and recreates both schemas:

     DATABASE_URL=postgresql://user@host:port/db \
       node tests/out-of-band/collector-acceptance-real-postgres.cjs
   ========================================================================== */
const { Pool } = require("pg");
const RT = require("../../domain/metyet-runtime.js");
const { fromPgPool } = require("../../persistence/database.js");
const { migrate } = require("../../persistence/migrate.js");
const { createWorldRepository } = require("../../persistence/world-repository.js");
const { createAccountDirectory } = require("../../server/auth/accounts.js");
const { createCollectorCredentials } = require("../../server/auth/collector-invitations.js");
const { openCollectorInvitation } = require("../../server/collector-invitation.js");
const { acceptCollectorInvitation } = require("../../server/collector-acceptance.js");
const { emptyWorld } = require("../../server/bootstrap.js");

const URL = process.env.DATABASE_URL;
if (!URL) { console.error("DATABASE_URL is required"); process.exit(2); }

let passed = 0, failed = 0;
const ok = (cond, what) => {
  if (cond) { passed += 1; console.log("  ok   " + what); }
  else { failed += 1; console.log("  FAIL " + what); }
};
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b),
  `${what} (${JSON.stringify(a)} vs ${JSON.stringify(b)})`);

const NORTHLINE = "p-northline";
const SOUTHLINE = "p-southline";

async function fresh(pool) {
  await pool.query("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade");
  const db = fromPgPool(pool);
  await migrate(db);
  const repository = createWorldRepository(db);
  /* Two shops, and nobody else. Provisioned directly because this suite is
     about database behaviour on real connections, not about how a Trusted
     Partner comes to exist. */
  await repository.saveWorld({ ...emptyWorld(),
    partners: [{ id: NORTHLINE, name: "Northline Cards" }, { id: SOUTHLINE, name: "Southline Cards" }] });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: "sub-northline", role: "tp", partnerId: NORTHLINE });
  await accounts.linkAccount({ subject: "sub-southline", role: "tp", partnerId: SOUTHLINE });
  return { db, repository, accounts, credentials: createCollectorCredentials(db),
    runtime: RT.systemRuntime() };
}

const invite = async (c, partnerId, recipient) => {
  const r = await openCollectorInvitation(
    { repository: c.repository, credentials: c.credentials, runtime: c.runtime },
    { actor: { partnerId }, recipient, note: null });
  if (!r.ok) throw new Error("could not open an invitation: " + r.refused);
  return { token: r.token, invitationId: r.invitationId };
};

const accept = (c, token, subject) => acceptCollectorInvitation(c, { token, subject });

const accountsFor = async (c, subject) => (await c.db.transaction(
  async (t) => (await t.query(
    "select id, role, collector_id from metyet_auth.accounts where subject = $1 and status = 'active'",
    [subject])).rows, { readOnly: true }));

async function main() {
  const pool = new Pool({ connectionString: URL, max: 8 });

  /* ------------------------------------------------------------------ A */
  console.log("\nA. the happy path, on real connections");
  {
    const c = await fresh(pool);
    const { token, invitationId } = await invite(c, NORTHLINE, "Dana at the counter");
    const result = await accept(c, token, "sub-dana");
    ok(result.ok, "it accepted");
    const world = await c.repository.loadWorld();
    eq(world.collectors.length, 1, "one Collector exists");
    eq(world.relationships.length, 1, "one Relationship exists");
    eq(world.relationships[0].partnerId, NORTHLINE, "with the inviting shop");
    eq(world.invitations.find((i) => i.id === invitationId).collectorId, world.collectors[0].id,
      "the invitation names who accepted it");
    const bound = await accountsFor(c, "sub-dana");
    eq(bound.length, 1, "one active account");
    eq(bound[0].collector_id, world.collectors[0].id, "bound to that Collector");
  }

  /* ------------------------------------------------------------------ B */
  console.log("\nB. one credential, two concurrent redeemers");
  {
    const c = await fresh(pool);
    const { token } = await invite(c, NORTHLINE, "whoever gets there first");
    const [a, b] = await Promise.all([
      accept(c, token, "sub-dana"),
      accept(c, token, "sub-robin"),
    ]);
    const winners = [a, b].filter((r) => r.ok);
    eq(winners.length, 1, "exactly one redemption succeeded");
    const loser = [a, b].find((r) => !r.ok);
    eq(loser.refused, "invitation-unusable", "the loser is told nothing about why");
    const world = await c.repository.loadWorld();
    eq(world.collectors.length, 1, "one Collector, not two");
    eq(world.relationships.length, 1, "one Relationship, not two");
    const both = [...await accountsFor(c, "sub-dana"), ...await accountsFor(c, "sub-robin")];
    eq(both.length, 1, "one account across both subjects");
  }

  /* ------------------------------------------------------------------ C */
  console.log("\nC. THE LOAD-BEARING PROOF — one unknown person, two shops, at once");
  {
    const c = await fresh(pool);
    const north = await invite(c, NORTHLINE, "Dana");
    const south = await invite(c, SOUTHLINE, "Dana K.");
    /* Both redeemed by ONE previously unknown subject, concurrently, on
       separate pooled connections. */
    const [a, b] = await Promise.all([
      accept(c, north.token, "sub-dana"),
      accept(c, south.token, "sub-dana"),
    ]);
    ok(a.ok && b.ok, "both redemptions succeeded: "
      + JSON.stringify([a.ok ? "ok" : a.refused, b.ok ? "ok" : b.refused]));

    const world = await c.repository.loadWorld();
    eq(world.collectors.length, 1, "ONE Collector identity");
    const id = world.collectors[0].id;
    eq(world.relationships.length, 2, "TWO Relationships");
    eq(world.relationships.map((r) => r.partnerId).sort(), [NORTHLINE, SOUTHLINE].sort(),
      "one to each shop");
    ok(world.relationships.every((r) => r.collectorId === id), "both to the same person");

    const bound = await accountsFor(c, "sub-dana");
    eq(bound.length, 1, "ONE active account");
    eq(bound[0].collector_id, id, "bound to that one Collector");

    const accepted = world.invitations.filter((i) => i.acceptedAt);
    eq(accepted.length, 2, "both invitations accepted");
    ok(accepted.every((i) => i.collectorId === id), "both naming the same Collector");
  }

  /* ------------------------------------------------------------------ D */
  console.log("\nD. rollback across schemas, on real connections");
  {
    const c = await fresh(pool);
    const { token, invitationId } = await invite(c, NORTHLINE, "Dana");
    /* Fail AFTER the world is saved and the account is bound, but before the
       transaction commits. On one session a stray write would be swept up
       anyway; on a pool it would not. */
    let armed = true;
    const sabotaged = { ...c,
      repository: { ...c.repository,
        withTransaction: (fn, opts) => c.repository.withTransaction(async (tx) => {
          const out = await fn(tx);
          if (armed) throw new Error("the commit failed after everything else succeeded");
          return out;
        }, opts) } };
    let threw = false;
    try { await accept(sabotaged, token, "sub-dana"); } catch (error) { threw = true; }
    ok(threw, "the failure was not swallowed");
    armed = false;

    const world = await c.repository.loadWorld();
    eq(world.collectors.length, 0, "no Collector persists");
    eq(world.relationships.length, 0, "no Relationship persists");
    eq(world.invitations.filter((i) => i.acceptedAt).length, 0, "no accepted invitation persists");
    eq((await accountsFor(c, "sub-dana")).length, 0, "NO ACCOUNT ROW PERSISTS");
    const claim = await c.credentials.findByInvitation(invitationId);
    eq(claim.claimed, false, "the credential is still spendable");

    /* And it really is: the same code works afterwards. */
    const retry = await accept(c, token, "sub-dana");
    ok(retry.ok, "the invitation survived the failure and was accepted afterwards");
  }

  /* ------------------------------------------------------------------ E */
  console.log("\nE. the world lock serializes, and the version moves once per acceptance");
  {
    const c = await fresh(pool);
    const invitations = await Promise.all([
      invite(c, NORTHLINE, "one"), invite(c, NORTHLINE, "two"),
      invite(c, SOUTHLINE, "three"), invite(c, SOUTHLINE, "four"),
    ]);
    const subjects = ["sub-a", "sub-b", "sub-c", "sub-d"];
    const results = await Promise.all(invitations.map((i, n) => accept(c, i.token, subjects[n])));
    ok(results.every((r) => r.ok), "all four accepted");
    const versions = results.map((r) => r.version).sort((x, y) => x - y);
    eq(new Set(versions).size, 4, "each acceptance got its own version — no lost update");

    const world = await c.repository.loadWorld();
    eq(world.collectors.length, 4, "four different people made four Collectors");
    eq(world.relationships.length, 4, "four Relationships");
    for (const s of subjects) eq((await accountsFor(c, s)).length, 1, `one account for ${s}`);
  }

  await pool.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
