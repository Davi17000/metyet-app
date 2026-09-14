/* ============================================================================
   OUT OF BAND — REDEMPTION ON A REAL POSTGRESQL, WITH REAL CONNECTIONS

   NOT part of `npm test`. The suite's in-process database (PGlite) is real
   PostgreSQL, but it is ONE SESSION: a nested transaction there quietly joins
   the one already open, so a bug that took work outside the redemption's
   transaction would still appear to roll back. On a pool of real connections it
   would not, and the account it created would survive a failure — which is the
   one thing this batch must never do.

   So this runs the real redemption against a real server over a real pg.Pool:

     A  the happy path across two schemas, in one transaction
     B  a failure at each step leaves nothing behind — on real connections
     C  two clients redeeming one credential at the same time, concurrently
     D  the world lock actually serializes them

   Run it against a throwaway database:

     DATABASE_URL=postgresql://postgres@/postgres?host=/tmp&port=5439 \
       node tests/out-of-band/registration-real-postgres.cjs
   ========================================================================== */
const { Pool } = require("pg");
const RT = require("../../domain/metyet-runtime.js");
const { fromPgPool } = require("../../persistence/database.js");
const { migrate } = require("../../persistence/migrate.js");
const { createWorldRepository } = require("../../persistence/world-repository.js");
const { createAccountDirectory } = require("../../server/auth/accounts.js");
const { createInvitationDirectory } = require("../../server/auth/invitations.js");
const { createIdentityDirectory } = require("../../server/auth/identity.js");
const { redeemPartnerInvitation, REFUSALS } = require("../../server/registration.js");
const { emptyWorld } = require("../../server/bootstrap.js");

/* Which address the provider reports for a given bearer token, matching the
   invitations each section creates. */
const emailFor = (token) => {
  const numbered = /^bearer-sub-(\d+)$/.exec(token);
  return numbered ? `owner${numbered[1]}@northline.example` : "owner@northline.example";
};

const URL = process.env.DATABASE_URL;
if (!URL) { console.error("DATABASE_URL is required"); process.exit(2); }

let passed = 0, failed = 0;
const ok = (cond, what) => { if (cond) { passed += 1; console.log("  ok   " + what); } else { failed += 1; console.log("  FAIL " + what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what} (${JSON.stringify(a)} vs ${JSON.stringify(b)})`);

async function fresh(pool) {
  await pool.query("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade");
  const db = fromPgPool(pool);
  await migrate(db);
  const repository = createWorldRepository(db);
  await repository.saveWorld(emptyWorld());
  return { db, repository, accounts: createAccountDirectory(db),
    invitations: createInvitationDirectory(db), runtime: RT.systemRuntime(),
    /* The Auth server, answering about whoever presents a token. The real one
       is exercised by the in-process suite; what this suite is for is the
       DATABASE behaviour on real connections. */
    identity: createIdentityDirectory({ userUrl: "https://projectref.supabase.co/auth/v1/user",
      apiKey: "sb_publishable_test",
      fetchUser: async (token) => ({ status: 200, json: async () => ({
        id: token.replace(/^bearer-/, ""), email: emailFor(token), email_confirmed_at: "2026-09-01T10:00:00Z" }) }) }) };
}
const invite = (c, email = "owner@northline.example") =>
  c.invitations.createInvitation({ email, storeName: "Northline Cards" });

async function main() {
  const pool = new Pool({ connectionString: URL, max: 8 });

  console.log("\nA. the happy path, on real connections");
  {
    const c = await fresh(pool);
    const { token, invitation } = await invite(c);
    const result = await redeemPartnerInvitation(c, { token, subject: "sub-casey", bearer: "bearer-sub-casey" });
    ok(result.ok, "it registered");
    const world = await c.repository.loadWorld();
    eq(world.partners.length, 1, "one partner");
    eq(world.partners[0].name, "Northline Cards", "named by the invitation");
    const account = await c.accounts.findActiveBySubject("sub-casey");
    eq(account.actor.partnerId, world.partners[0].id, "the sign-in is bound to it");
    eq((await c.invitations.findById(invitation.id)).status, "accepted", "and the invitation is spent");
  }

  console.log("\nB. a failure at each step leaves nothing behind");
  for (const [step, breakIt] of Object.entries({
    "loading the world": (c) => { c.repository.loadWorld = async () => { throw new Error("load"); }; },
    "saving the world": (c) => { c.repository.saveWorld = async () => { throw new Error("save"); }; },
    "binding the account": (c) => { c.accounts.linkAccount = async () => { throw new Error("link"); }; },
    "recording the outcome": (c) => { c.invitations.completeRedemption = async () => { throw new Error("audit"); }; },
  })) {
    const c = await fresh(pool);
    const { token, invitation } = await invite(c);
    const real = { loadWorld: c.repository.loadWorld, saveWorld: c.repository.saveWorld,
      linkAccount: c.accounts.linkAccount, completeRedemption: c.invitations.completeRedemption };
    breakIt(c);
    let threw = null;
    try { await redeemPartnerInvitation(c, { token, subject: "sub-casey", bearer: "bearer-sub-casey" }); }
    catch (e) { threw = e; }
    Object.assign(c.repository, { loadWorld: real.loadWorld, saveWorld: real.saveWorld });
    c.accounts.linkAccount = real.linkAccount;
    c.invitations.completeRedemption = real.completeRedemption;

    ok(threw, `${step}: the failure surfaced`);
    eq((await c.repository.loadWorld()).partners.length, 0, `${step}: no partner`);
    eq((await c.accounts.listAccounts()).length, 0, `${step}: NO ACCOUNT — the cross-schema rollback`);
    eq((await c.invitations.findById(invitation.id)).status, "pending", `${step}: the invitation is still pending`);
  }

  console.log("\nC. two clients redeeming one credential at the same time");
  {
    const c = await fresh(pool);
    const { token } = await invite(c);
    const attempts = ["sub-a", "sub-b", "sub-c", "sub-d"].map((subject) =>
      redeemPartnerInvitation(c, { token, subject, bearer: `bearer-${subject}` }));
    const results = await Promise.all(attempts);
    eq(results.filter((r) => r.ok).length, 1, "exactly one succeeded");
    ok(results.filter((r) => !r.ok).every((r) => r.refused === REFUSALS.invitationUnusable),
      "and the rest were told the credential is unusable");
    eq((await c.repository.loadWorld()).partners.length, 1, "one partner exists");
    eq((await c.accounts.listAccounts()).length, 1, "and one account");
  }

  console.log("\nD. four different invitations redeemed at once");
  {
    const c = await fresh(pool);
    const invites = [];
    for (let i = 0; i < 4; i += 1) invites.push(await invite(c, `owner${i}@northline.example`));
    const results = await Promise.all(invites.map((inv, i) =>
      redeemPartnerInvitation(c, { token: inv.token, subject: `sub-${i}`, bearer: `bearer-sub-${i}` })));
    eq(results.filter((r) => r.ok).length, 4, "all four registered");
    const world = await c.repository.loadWorld();
    eq(world.partners.length, 4, "four partners");
    eq(new Set(world.partners.map((p) => p.id)).size, 4, "with four distinct ids");
    eq(new Set(world.partners.map((p) => p.registeredFrom)).size, 4, "one per invitation");
    eq((await c.accounts.listAccounts()).length, 4, "and four accounts");
  }

  await pool.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
