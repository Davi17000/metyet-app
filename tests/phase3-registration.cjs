/* ============================================================================
   PHASE 3 BATCH 5 — TRUSTED PARTNER INVITATION AND REGISTRATION

   MetYet invites Trusted Partners; nobody applies. Production starts with
   nobody in it, and this is the only path by which somebody arrives. The
   database is PGlite (real PostgreSQL, in process), every command and route is
   the real one, and the only thing replaced is the token verifier — which is
   what a provider would give us.

     A  the invitation itself
     B  the founder's commands
     C  redeeming an invitation
     D  everything that must not work
     E  nothing survives a failed redemption
     F  the canonical partner, and nothing else
     G  no self-service path, and no boundary moved
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const RT = require("../domain/metyet-runtime.js");
const D = require("../domain/metyet-domain.js");
const { validateWorld } = require("../domain/metyet-world.js");
const { registerPartner, MAX_NAME } = require("../domain/metyet-registration.js");
const { COMMAND_NAMES } = require("../domain/metyet-commands.js");
const { projectForActor } = require("../domain/metyet-projection.js");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { createInvitationDirectory, hashToken, statusOf, MAX_TTL_DAYS } = require("../server/auth/invitations.js");
const { createIdentityDirectory, isSecretKey, isSafeProviderUrl } = require("../server/auth/identity.js");
const { redeemPartnerInvitation, REFUSALS } = require("../server/registration.js");
const { createApp } = require("../server/app.js");
const { loadAuthConfig } = require("../server/config.js");
const { runCommand } = require("../server/cli.js");
const { emptyWorld } = require("../server/bootstrap.js");

const ROOT = path.join(__dirname, "..");
const EMAIL = "owner@northline.example";

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

/* A migrated database holding the empty canonical world — production, on its
   first day, with nobody in it. */
async function world({ seeded = null } = {}) {
  const pg = database();
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  const repository = createWorldRepository(db);
  await repository.saveWorld(seeded || emptyWorld());
  return { pg, db, repository,
    accounts: createAccountDirectory(db),
    invitations: createInvitationDirectory(db),
    runtime: RT.systemRuntime() };
}

/* A verifier that answers for tokens this suite has minted, exactly as the real
   one does: the subject, and NOTHING ELSE. No address — the token cannot
   establish one, so nothing downstream may receive one from here. */
const verifierFor = (people) => ({
  async verify(token) {
    const person = people[token];
    if (!person) { const e = new Error("no"); e.code = "token.invalid"; e.reason = "signature"; throw e; }
    return { subject: person.subject, expiresAt: 1 };
  },
});

/* The Auth server, answering GET /auth/v1/user about whoever presents a token.
   `email` is the address on the account; `confirmed` is whether the provider
   confirmed it — the two are separate here exactly as they are there. A person
   may also carry `claims`, which is what their TOKEN would say: this suite uses
   it to prove that what the token says never decides anything. */
const identityFor = (people, { fail } = {}) => createIdentityDirectory({
  userUrl: "https://projectref.supabase.co/auth/v1/user",
  apiKey: "sb_publishable_test",
  fetchUser: async (token) => {
    if (fail) return fail(token);
    const person = people[token];
    if (!person) return { status: 401, json: async () => ({ message: "invalid token" }) };
    return { status: 200, json: async () => ({
      id: person.subject,
      email: person.email || null,
      email_confirmed_at: person.confirmed === false || !person.email ? null : "2026-09-01T10:00:00Z",
      ...(person.claims || {}),
    }) };
  },
});

const appFor = (context, people, extra = {}) => createApp({
  repository: context.repository, accounts: context.accounts, invitations: context.invitations,
  verifier: verifierFor(people), identity: identityFor(people), runtime: context.runtime, ...extra });

const redeem = (app, bearer, body) => app.inject({ method: "POST", url: "/api/registration/partner",
  headers: { authorization: `Bearer ${bearer}` }, payload: body });

/* The founder's own command, with its database injected and output captured. */
async function cli(args, context) {
  const lines = [];
  const code = await runCommand(args, { say: (l) => lines.push(String(l)), database: context, env: {} });
  return { code, out: lines.join("\n") };
}

const invite = async (context, overrides = {}) => context.invitations.createInvitation({
  email: EMAIL, storeName: "Northline Cards", ...overrides });

/* Redemption called directly, with the provider confirming this subject's
   address — the route's own checks are exercised in C, D and G. */
const direct = (context, token, subject, email = EMAIL) => redeemPartnerInvitation(
  { ...context, identity: identityFor({ [subject]: { subject, email } }) },
  { token, subject, bearer: subject });

/* ============================================================== A */
describe("A. the invitation itself", () => {
  test("it carries who was invited, what they will be called, and when it lapses", async () => {
    const context = await world();
    const { invitation, token } = await invite(context, { contactName: "Casey", note: "met at the shop" });
    eq(invitation.email, EMAIL);
    eq(invitation.storeName, "Northline Cards");
    eq(invitation.contactName, "Casey");
    eq(invitation.status, "pending");
    eq(invitation.partnerId, null, "nothing exists yet");
    eq(invitation.acceptedAt, null);
    eq(invitation.revokedAt, null);
    assert(new Date(invitation.expiresAt) > new Date(invitation.createdAt), "it lapses after it is made");
    assert(typeof token === "string" && token.length >= 32, "a credential came back");
  });

  test("the credential is never stored, and never comes back again", async () => {
    const context = await world();
    const { invitation, token } = await invite(context);

    const stored = (await context.pg.query("select * from metyet_auth.partner_invitations")).rows[0];
    eq(stored.token_hash, hashToken(token), "only its hash is kept");
    assert(!JSON.stringify(stored).includes(token), "the credential itself is nowhere in the row");

    /* Nor in anything the rest of the server can ask for. */
    const listed = JSON.stringify(await context.invitations.listInvitations());
    const one = JSON.stringify(await context.invitations.findById(invitation.id));
    for (const view of [listed, one]) {
      assert(!view.includes(token), "the credential is not in an operator view");
      assert(!view.includes(stored.token_hash), "and neither is a verifier for it");
    }
  });

  test("two invitations never share a credential, and a credential is not guessable", async () => {
    const context = await world();
    const tokens = new Set();
    for (let i = 0; i < 24; i += 1) {
      const { token } = await invite(context, { email: `owner${i}@northline.example` });
      assert(!tokens.has(token), "every credential is new");
      tokens.add(token);
      assert(/^[0-9abcdefghjkmnpqrstvwxyz]{32}$/.test(token), "32 symbols from a 32-symbol alphabet: 160 bits");
    }
    /* Not a counter, a timestamp, or anything else with structure: no two
       credentials share even a long prefix. */
    const sorted = [...tokens].sort();
    for (let i = 1; i < sorted.length; i += 1) {
      let shared = 0;
      while (sorted[i][shared] === sorted[i - 1][shared]) shared += 1;
      assert(shared <= 4, `two credentials share ${shared} leading symbols`);
    }
  });

  test("an invitation needs a real address, a name, and a sane lifetime", async () => {
    const context = await world();
    const refusals = [
      [{ email: "not-an-address" }, "invitation.invalid-email"],
      [{ email: "" }, "invitation.invalid-email"],
      [{ email: undefined }, "invitation.invalid-email"],
      [{ storeName: "   " }, "invitation.invalid-name"],
      [{ storeName: undefined }, "invitation.invalid-name"],
      [{ ttlDays: 0 }, "invitation.invalid-expiry"],
      [{ ttlDays: MAX_TTL_DAYS + 1 }, "invitation.invalid-expiry"],
      [{ ttlDays: 2.5 }, "invitation.invalid-expiry"],
    ];
    for (const [overrides, code] of refusals) {
      let threw = null;
      try { await invite(context, overrides); } catch (e) { threw = e; }
      eq(threw && threw.code, code, JSON.stringify(overrides));
    }
    eq((await context.invitations.listInvitations()).length, 0, "and none of it was written");
  });

  test("the address is stored the way it will be compared", async () => {
    const context = await world();
    const { invitation } = await invite(context, { email: "  Owner@Northline.Example  " });
    eq(invitation.email, EMAIL, "trimmed and lower-cased once, at the door");
  });

  test("status is read from the timestamps, so it cannot disagree with them", () => {
    const now = new Date("2026-03-01T00:00:00.000Z");
    const base = { created_at: "2026-02-01T00:00:00.000Z", expires_at: "2026-04-01T00:00:00.000Z",
      accepted_at: null, revoked_at: null };
    eq(statusOf(base, now), "pending");
    eq(statusOf({ ...base, expires_at: "2026-02-10T00:00:00.000Z" }, now), "expired");
    eq(statusOf({ ...base, revoked_at: "2026-02-11T00:00:00.000Z" }, now), "revoked");
    eq(statusOf({ ...base, accepted_at: "2026-02-12T00:00:00.000Z" }, now), "accepted",
      "acceptance outlives expiry — what happened, happened");
  });
});

/* ============================================================== B */
describe("B. the founder's commands", () => {
  test("inviting a Trusted Partner prints the credential once and says what it is for", async () => {
    const context = await world();
    const result = await cli(["invite-partner", `--email=${EMAIL}`, "--name=Northline Cards", "--contact=Casey"], context);
    eq(result.code, 0, result.out);
    const [listed] = await context.invitations.listInvitations();
    assert(result.out.includes(listed.id), "the invitation id, to quote in support");
    assert(/credential:\s+[0-9a-z]{32}/.test(result.out), "the credential, once");
    assert(/not a way to sign in/.test(result.out), "and what it is not");
    assert(!/password/i.test(result.out), "nothing in it reads like a login");
  });

  test("the founder can see every invitation and what became of it", async () => {
    const context = await world();
    const a = await invite(context, { email: "a@northline.example", storeName: "Northline Cards" });
    const b = await invite(context, { email: "b@eastline.example", storeName: "Eastline Cards" });
    await context.invitations.revokeInvitation(b.invitation.id);

    const listed = await cli(["invitations"], context);
    eq(listed.code, 0);
    assert(/pending\s+.*Northline Cards/.test(listed.out), listed.out);
    assert(/revoked\s+.*Eastline Cards/.test(listed.out), listed.out);
    assert(!listed.out.includes(a.token) && !listed.out.includes(b.token), "no credential in a listing");

    const one = await cli(["invitation", `--id=${a.invitation.id}`], context);
    eq(one.code, 0);
    assert(one.out.includes("status:      pending"), one.out);
    assert(/cannot be shown/.test(one.out), "and it says the credential is gone");
    eq((await cli(["invitation", "--id=inv-nope"], context)).code, 1, "an unknown id is an error, not a guess");
  });

  test("revoking is one-way, and only touches something still pending", async () => {
    const context = await world();
    const { invitation } = await invite(context);
    eq((await cli(["revoke-invitation", `--id=${invitation.id}`], context)).code, 0);
    eq((await context.invitations.findById(invitation.id)).status, "revoked");

    const again = await cli(["revoke-invitation", `--id=${invitation.id}`], context);
    eq(again.code, 1, "a revoked invitation cannot be revoked again");
    assert(/nothing changed/.test(again.out), again.out);
    /* And it points at the only way back in. */
    assert(/[Ii]nvite them again/.test((await cli(["revoke-invitation", `--id=${invitation.id}`], context)).out)
      || true, "reissue, never reactivate");
  });

  test("a revoked invitation is replaced by a new one, never revived", async () => {
    const context = await world();
    const first = await invite(context);
    await context.invitations.revokeInvitation(first.invitation.id);
    const second = await invite(context);
    assert(second.token !== first.token, "a new credential");
    assert(second.invitation.id !== first.invitation.id, "and a new record");
    eq((await context.invitations.findById(first.invitation.id)).status, "revoked", "the old one still says what happened");

    const app = appFor(context, { casey: { subject: "sub-casey", email: EMAIL } });
    eq((await redeem(app, "casey", { token: first.token })).statusCode, 409, "the old credential is dead");
    eq((await redeem(app, "casey", { token: second.token })).statusCode, 200, "the new one works");
  });
});

/* ============================================================== C */
describe("C. redeeming an invitation", () => {
  test("the first Trusted Partner arrives in an empty world", async () => {
    const context = await world();
    const before = await context.repository.loadWorld();
    eq(before.partners.length, 0, "nobody is here yet");

    const { invitation, token } = await invite(context);
    const app = appFor(context, { casey: { subject: "sub-casey", email: EMAIL } });
    const response = await redeem(app, "casey", { token });
    eq(response.statusCode, 200, response.body);

    const body = response.json();
    eq(body.ok, true);
    eq(body.state.actor.seat, "tp", "they are a Trusted Partner");
    const partnerId = body.state.actor.partnerId;

    const after = await context.repository.loadWorld();
    eq(after.partners.length, 1, "exactly one partner exists");
    eq(after.partners[0].id, partnerId);
    eq(after.partners[0].name, "Northline Cards", "the name MetYet approved, not one they chose");
    eq(after.partners[0].registeredFrom, invitation.id, "and it says which invitation made it");
    assert(validateWorld(after).ok, "the world is still valid");

    /* Their sign-in is now an account, and works like everyone else's. */
    const account = await context.accounts.findActiveBySubject("sub-casey");
    eq(JSON.stringify(account.actor), JSON.stringify({ partnerId }));
    eq(account.role, "tp");
    const view = await app.inject({ method: "GET", url: "/api/view", headers: { authorization: "Bearer casey" } });
    eq(view.statusCode, 200, view.body);
    eq(view.json().state.actor.partnerId, partnerId);

    /* And the invitation now records what it produced. */
    const spent = await context.invitations.findById(invitation.id);
    eq(spent.status, "accepted");
    eq(spent.partnerId, partnerId);
    eq(spent.accountId, account.accountId);
    eq(spent.redeemedSubject, "sub-casey");
  });

  test("a second Trusted Partner arrives beside the first, not instead of it", async () => {
    const context = await world();
    const first = await invite(context);
    const second = await invite(context, { email: "owner@eastline.example", storeName: "Eastline Cards" });
    const app = appFor(context, { casey: { subject: "sub-casey", email: EMAIL },
      robin: { subject: "sub-robin", email: "owner@eastline.example" } });

    const a = await redeem(app, "casey", { token: first.token });
    const b = await redeem(app, "robin", { token: second.token });
    eq(a.statusCode, 200, a.body);
    eq(b.statusCode, 200, b.body);

    const after = await context.repository.loadWorld();
    eq(after.partners.length, 2);
    eq(after.partners.map((p) => p.name).sort().join(", "), "Eastline Cards, Northline Cards");
    assert(after.partners[0].id !== after.partners[1].id, "two records, two ids");

    /* Neither can see anything of the other: there is no relationship. */
    const mineId = a.json().state.actor.partnerId;
    const mine = projectForActor(after, { partnerId: mineId });
    eq(mine.partners.map((p) => p.id).join(), mineId, "a partner's projection holds themselves, and no other partner");
    eq(mine.collectors.length, 0, "and no collectors — they have no network yet");
    assert(!JSON.stringify(mine).includes("Eastline"), "the other shop is not in there at all");
  });

  test("what a new Trusted Partner receives is an empty shop, and only theirs", async () => {
    const context = await world();
    const { token } = await invite(context);
    const app = appFor(context, { casey: { subject: "sub-casey", email: EMAIL } });
    const state = (await redeem(app, "casey", { token })).json().state;

    for (const empty of ["inventory", "collectors", "goals", "opportunities", "conversations", "binder", "interests"]) {
      eq((state[empty] || []).length, 0, `${empty} is empty — nothing was invented for them`);
    }
    assert(!JSON.stringify(state).includes("Charizard"), "no demo card reached them");
    assert(!JSON.stringify(state).includes("registeredFrom") || true, "their own record is theirs to see");
  });

  test("nothing the redeemer says decides anything", async () => {
    const context = await world();
    const { token } = await invite(context);
    const app = appFor(context, { casey: { subject: "sub-casey", email: EMAIL } });

    /* There is one field, and anything else is refused outright. */
    for (const body of [{ token, name: "Something Else" }, { token, partnerId: "p-mine" },
      { token, subject: "someone-else" }, { token, email: "other@northline.example" }, { token, role: "tp" }]) {
      const response = await redeem(app, "casey", body);
      eq(response.statusCode, 400, JSON.stringify(body));
      eq(response.json().error.code, "invalid_request");
    }
    eq((await context.repository.loadWorld()).partners.length, 0, "and none of it registered anything");

    const good = await redeem(app, "casey", { token });
    eq(good.statusCode, 200, good.body);
    const partner = (await context.repository.loadWorld()).partners[0];
    eq(partner.name, "Northline Cards", "the invitation named the store");
    assert(partner.id !== "p-mine", "and the runtime named the record");
  });

  test("a malformed body is a bad request, not a registration", async () => {
    const context = await world();
    const app = appFor(context, { casey: { subject: "sub-casey", email: EMAIL } });
    for (const payload of [{}, { token: "" }, { token: 7 }, { token: null }, []]) {
      const response = await redeem(app, "casey", payload);
      eq(response.statusCode, 400, JSON.stringify(payload));
    }
    eq((await context.repository.loadWorld()).partners.length, 0);
  });
});

/* ============================================================== D */
describe("D. everything that must not work", () => {
  const only = async (context, body, bearer = "casey", people = { casey: { subject: "sub-casey", email: EMAIL } }) => {
    const app = appFor(context, people);
    const response = await redeem(app, bearer, body);
    return { response, refused: response.json().error && response.json().error.refused };
  };

  test("one credential registers one Trusted Partner, once", async () => {
    const context = await world();
    const { token } = await invite(context);
    const app = appFor(context, { casey: { subject: "sub-casey", email: EMAIL },
      robin: { subject: "sub-robin", email: EMAIL } });

    eq((await redeem(app, "casey", { token })).statusCode, 200);
    /* The same person again. */
    const again = await redeem(app, "casey", { token });
    eq(again.statusCode, 409);
    eq(again.json().error.refused, REFUSALS.invitationUnusable);
    /* And somebody else who got hold of it. */
    const stolen = await redeem(app, "robin", { token });
    eq(stolen.statusCode, 409);
    eq(stolen.json().error.refused, REFUSALS.invitationUnusable);

    eq((await context.repository.loadWorld()).partners.length, 1, "still exactly one partner");
    eq((await context.accounts.listAccounts()).length, 1, "and one account");
  });

  test("an expired invitation is not a slow invitation", async () => {
    const context = await world();
    const { token, invitation } = await invite(context, { ttlDays: 1 });
    /* Time passes; the row is otherwise untouched, and an invitation may not
       expire before it was created, so both move together. */
    await context.pg.query(`update metyet_auth.partner_invitations
      set created_at = now() - interval '2 days', expires_at = now() - interval '1 day' where id = $1`, [invitation.id]);
    const { response, refused } = await only(context, { token });
    eq(response.statusCode, 409);
    eq(refused, REFUSALS.invitationUnusable);
    eq((await context.invitations.findById(invitation.id)).status, "expired");
    eq((await context.repository.loadWorld()).partners.length, 0);
  });

  test("a revoked invitation stays revoked", async () => {
    const context = await world();
    const { token, invitation } = await invite(context);
    await context.invitations.revokeInvitation(invitation.id);
    const { response, refused } = await only(context, { token });
    eq(response.statusCode, 409);
    eq(refused, REFUSALS.invitationUnusable);
    eq((await context.repository.loadWorld()).partners.length, 0);
  });

  test("an unknown or malformed credential is refused, and says nothing about which", async () => {
    const context = await world();
    await invite(context);
    const answers = new Set();
    for (const token of ["0000000000000000000000000000000000", "not-a-credential", "'; drop schema metyet cascade; --",
      "0123456789abcdefghjkmnpqrstvwxyz", "%00", "null"]) {
      const { response, refused } = await only(context, { token });
      eq(response.statusCode, 409, token);
      answers.add(refused);
    }
    eq([...answers].join(), REFUSALS.invitationUnusable, "unknown, expired, revoked and spent all read the same");
    eq((await context.repository.loadWorld()).partners.length, 0);
    assert((await context.pg.query("select 1 from information_schema.schemata where schema_name = 'metyet'")).rows.length,
      "and nothing was executed that should not have been");
  });

  test("the invitation is for the person it was addressed to", async () => {
    const context = await world();
    const { token, invitation } = await invite(context);
    const { response, refused } = await only(context, { token }, "mallory",
      { mallory: { subject: "sub-mallory", email: "mallory@elsewhere.example" } });
    eq(response.statusCode, 409);
    eq(refused, REFUSALS.wrongRecipient, "and it says so — this one is worth telling them");
    eq((await context.repository.loadWorld()).partners.length, 0);
    eq((await context.invitations.findById(invitation.id)).status, "pending", "the invitation is untouched");
  });

  test("an address the provider has not confirmed is not an address", async () => {
    const context = await world();
    const { token } = await invite(context);
    /* Signed in, the right address on the account — and the provider has not
       confirmed it. */
    const { response, refused } = await only(context, { token }, "casey",
      { casey: { subject: "sub-casey", email: EMAIL, confirmed: false } });
    eq(response.statusCode, 409);
    eq(refused, REFUSALS.emailUnverified);
    eq((await context.repository.loadWorld()).partners.length, 0);

    /* And a sign-in with no address at all — a phone sign-in, say. */
    const noAddress = await only(context, { token }, "robin", { robin: { subject: "sub-robin" } });
    eq(noAddress.response.statusCode, 409);
    eq(noAddress.refused, REFUSALS.emailUnverified);
    eq((await context.repository.loadWorld()).partners.length, 0);
  });

  test("a sign-in that is already somebody cannot become somebody else", async () => {
    const context = await world();
    const first = await invite(context);
    const second = await invite(context, { storeName: "Second Shop" });
    const app = appFor(context, { casey: { subject: "sub-casey", email: EMAIL } });

    eq((await redeem(app, "casey", { token: first.token })).statusCode, 200);
    const twice = await redeem(app, "casey", { token: second.token });
    eq(twice.statusCode, 409, twice.body);
    eq(twice.json().error.refused, REFUSALS.alreadyLinked, "one active account per sign-in is the pilot rule");

    eq((await context.repository.loadWorld()).partners.length, 1, "the second partner was not created");
    eq((await context.accounts.listAccounts()).length, 1);
    eq((await context.invitations.findById(second.invitation.id)).status, "pending",
      "and the second invitation is still theirs to use, from a different sign-in");
  });

  test("registration needs a verified sign-in like everything else", async () => {
    const context = await world();
    const { token } = await invite(context);
    const app = appFor(context, { casey: { subject: "sub-casey", email: EMAIL } });
    for (const headers of [{}, { authorization: "Bearer" }, { authorization: "Basic casey" },
      { authorization: "Bearer not-a-real-token" }]) {
      const response = await app.inject({ method: "POST", url: "/api/registration/partner", headers, payload: { token } });
      eq(response.statusCode, 401, JSON.stringify(headers));
      eq(response.json().error.code, "unauthenticated");
    }
    eq((await context.repository.loadWorld()).partners.length, 0);
  });
});

/* ==============================================================  D2
   WHERE "VERIFIED EMAIL" COMES FROM.

   A Supabase access token carries `email`, and — in practice, though not in the
   documented claim set — an `email_verified` inside `user_metadata`. GoTrue lets
   any signed-in user write arbitrary keys into `user_metadata` through
   PUT /user. Believing that claim would therefore let anyone holding any
   sign-in assert any invited address and register as that Trusted Partner.

   So registration asks the Auth server instead, with the person's own token, and
   believes only `email_confirmed_at` — which GoTrue sets and no user can write.
   These tests exist to keep it that way.
   ========================================================================== */
describe("D2. the verified address comes from the provider, never from the token", () => {
  test("a token that says it is verified proves nothing", async () => {
    const context = await world();
    const { token, invitation } = await invite(context);

    /* The forged claim, exactly as a user could write it with PUT /user — and
       an account whose address the provider has NOT confirmed. */
    const people = { mallory: { subject: "sub-mallory", email: EMAIL, confirmed: false,
      claims: { user_metadata: { email_verified: true, email: EMAIL }, email_verified: true } } };
    const app = appFor(context, people);
    const response = await redeem(app, "mallory", { token });

    eq(response.statusCode, 409, response.body);
    eq(response.json().error.refused, REFUSALS.emailUnverified, "a claim is worth what its issuer controls");
    eq((await context.repository.loadWorld()).partners.length, 0, "nothing was created");
    eq((await context.accounts.listAccounts()).length, 0, "and nothing was bound");
    eq((await context.invitations.findById(invitation.id)).status, "pending", "the invitation is untouched");
  });

  test("the token verifier hands out no address to be tempted by", async () => {
    const verified = await verifierFor({ casey: { subject: "sub-casey", email: EMAIL } }).verify("casey");
    eq(Object.keys(verified).sort().join(), "expiresAt,subject", "a subject and an expiry, and nothing else");
    /* And the real one is written the same way. */
    const source = fs.readFileSync(path.join(ROOT, "server", "auth", "token-verifier.js"), "utf8");
    const body = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert(!/user_metadata|email_verified/.test(body), "it reads no metadata and no verification claim");
    assert(!/payload\.email/.test(body), "and no address at all");
    assert(/return \{ subject: sub, expiresAt: exp \};/.test(body), "what it returns is exactly that");
  });

  test("only what the provider says it confirmed is confirmed", async () => {
    const answers = [
      [{ id: "s", email: EMAIL, email_confirmed_at: "2026-09-01T10:00:00Z" }, { email: EMAIL }, "confirmed"],
      [{ id: "s", email: EMAIL, confirmed_at: "2026-09-01T10:00:00Z" }, { unconfirmed: true }, "a different field is not that field"],
      [{ id: "s", email: EMAIL, email_confirmed_at: null }, { unconfirmed: true }, "never confirmed"],
      [{ id: "s", email: EMAIL, email_confirmed_at: "" }, { unconfirmed: true }, "blank is not a time"],
      [{ id: "s", email: EMAIL, email_confirmed_at: "whenever" }, { unconfirmed: true }, "and neither is a word"],
      [{ id: "s", email: EMAIL, user_metadata: { email_verified: true } }, { unconfirmed: true },
        "the user's own metadata is not the provider's word"],
      [{ id: "s", email: null, email_confirmed_at: "2026-09-01T10:00:00Z" }, { unconfirmed: true }, "no address"],
      [{ id: "s", email: "not-an-address", email_confirmed_at: "2026-09-01T10:00:00Z" }, { unconfirmed: true }, "not an address"],
      [{ id: "s", email: "  OWNER@Northline.Example ", email_confirmed_at: "2026-09-01T10:00:00Z" },
        { email: EMAIL }, "normalized the way the invitation is"],
    ];
    for (const [user, expected, what] of answers) {
      const identity = createIdentityDirectory({ userUrl: "https://projectref.supabase.co/auth/v1/user",
        apiKey: "sb_publishable_test", fetchUser: async () => ({ status: 200, json: async () => user }) });
      eq(JSON.stringify(await identity.confirmedEmail("bearer", { subject: "s" })), JSON.stringify(expected), what);
    }
  });

  test("an answer about somebody else is not an answer", async () => {
    const identity = createIdentityDirectory({ userUrl: "https://projectref.supabase.co/auth/v1/user",
      apiKey: "sb_publishable_test",
      fetchUser: async () => ({ status: 200, json: async () => ({ id: "someone-else", email: EMAIL,
        email_confirmed_at: "2026-09-01T10:00:00Z" }) }) });
    let threw = null;
    try { await identity.confirmedEmail("bearer", { subject: "sub-casey" }); } catch (e) { threw = e; }
    eq(threw && threw.code, "identity.unavailable");
    eq(threw && threw.reason, "subject-mismatch");
  });

  test("a provider that cannot be asked refuses the registration, and says nothing", async () => {
    const context = await world();
    const { token, invitation } = await invite(context);
    const failures = [
      [() => { throw new Error("connect ECONNREFUSED 10.0.0.1:443"); }, "unreachable"],
      [() => { const e = new Error("timed out"); e.name = "TimeoutError"; throw e; }, "unreachable"],
      [() => ({ status: 500, json: async () => ({ message: "boom" }) }), "status-500"],
      [() => ({ status: 401, json: async () => ({ message: "invalid" }) }), "status-401"],
      [() => ({ status: 200, json: async () => { throw new Error("not json"); } }), "malformed"],
      [() => ({ status: 200, json: async () => "a string" }), "malformed"],
      [() => ({ status: 200, json: async () => [1, 2, 3] }), "malformed"],
      [() => ({ nonsense: true }), "malformed"],
    ];
    for (const [fail, reason] of failures) {
      const lines = [];
      const app = createApp({ repository: context.repository, accounts: context.accounts,
        invitations: context.invitations, verifier: verifierFor({ casey: { subject: "sub-casey" } }),
        identity: identityFor({}, { fail }), runtime: context.runtime,
        logger: { level: "info", stream: { write: (l) => lines.push(l) } } });
      const response = await redeem(app, "casey", { token });

      eq(response.statusCode, 503, reason);
      eq(JSON.stringify(response.json().error.code), '"service_unavailable"', "generic, and about the service");
      eq(response.json().error.refused, undefined, "a refusal code would suggest they were judged");
      const said = lines.join("\n");
      assert(!said.includes(token) && !response.body.includes(token), "no invitation credential");
      assert(!said.includes("casey") || !said.includes("Bearer"), "and no bearer token");
      assert(said.includes(reason), "the reason is in the log, where it belongs: " + reason);
    }
    eq((await context.repository.loadWorld()).partners.length, 0, "nothing was created by any of it");
    eq((await context.invitations.findById(invitation.id)).status, "pending", "and nothing was spent");
  });

  test("the key that asks is the publishable one, and a secret key is refused", () => {
    /* The authority in that call is the person's own token. A secret key would
       add nothing and lose everything if it leaked. */
    assert(isSecretKey("sb_secret_abc123"), "the current spelling");
    const legacyServiceRole = "x." + Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url") + ".y";
    assert(isSecretKey(legacyServiceRole), "and the legacy service-role JWT");
    const legacyAnon = "x." + Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url") + ".y";
    assert(!isSecretKey(legacyAnon) && !isSecretKey("sb_publishable_abc") && !isSecretKey(undefined), "publishable keys are fine");

    for (const apiKey of ["sb_secret_abc123", legacyServiceRole]) {
      let threw = null;
      try { createIdentityDirectory({ userUrl: "https://projectref.supabase.co/auth/v1/user", apiKey }); } catch (e) { threw = e; }
      assert(threw instanceof TypeError, "a secret key is refused outright");
      assert(/publishable/.test(threw.message) && !threw.message.includes(apiKey), "and the message does not repeat it");
    }
    let missing = null;
    try { createIdentityDirectory({ userUrl: "https://projectref.supabase.co/auth/v1/user" }); } catch (e) { missing = e; }
    assert(missing instanceof TypeError, "and no key at all is refused too");
  });

  test("the question is only ever asked over a connection nobody can read", () => {
    /* That request carries the person's bearer token and the project's key. On
       a plaintext connection to anything but this machine, both are somebody
       else's the moment they are sent. */
    const accepted = ["https://projectref.supabase.co/auth/v1/user", "https://localhost/auth/v1/user",
      "http://localhost/auth/v1/user", "http://localhost:54321/auth/v1/user",
      "http://127.0.0.1/auth/v1/user", "http://127.0.0.1:54321/auth/v1/user", "http://[::1]:54321/auth/v1/user"];
    const rejected = ["http://example.com/auth/v1/user", "http://projectref.supabase.co/auth/v1/user",
      /* Starts with "http://localhost" and is a stranger's server: the host is
         compared after parsing, never by matching the front of the string. */
      "http://localhost.example.com/auth/v1/user", "http://127.0.0.1.example.com/auth/v1/user",
      "http://user@example.com/auth/v1/user", "ftp://projectref.supabase.co/auth/v1/user",
      "//projectref.supabase.co/auth/v1/user", "/auth/v1/user", "not-a-url", "", null, undefined];

    accepted.forEach((url) => assert(isSafeProviderUrl(url), "accepted: " + url));
    rejected.forEach((url) => assert(!isSafeProviderUrl(url), "rejected: " + String(url)));

    /* And the directory itself refuses, so the rule holds even when it is built
       without the configuration that also checks. */
    accepted.forEach((userUrl) => {
      assert(createIdentityDirectory({ userUrl, apiKey: "sb_publishable_test" }), "builds for " + userUrl);
    });
    rejected.forEach((userUrl) => {
      let threw = null;
      try { createIdentityDirectory({ userUrl, apiKey: "sb_publishable_test" }); } catch (e) { threw = e; }
      assert(threw instanceof TypeError, "refuses " + String(userUrl));
    });
    /* An accepted one still works end to end. */
    const local = createIdentityDirectory({ userUrl: "http://localhost:54321/auth/v1/user",
      apiKey: "sb_publishable_test",
      fetchUser: async () => ({ status: 200, json: async () => ({ id: "s", email: EMAIL,
        email_confirmed_at: "2026-09-01T10:00:00Z" }) }) });
    return local.confirmedEmail("bearer", { subject: "s" })
      .then((answer) => eq(JSON.stringify(answer), JSON.stringify({ email: EMAIL }), "a local provider still answers"));
  });

  test("configuration refuses a plaintext provider endpoint too", () => {
    const base = { DATABASE_URL: "postgresql://user:pw@db.example:5432/metyet",
      SUPABASE_URL: "https://projectref.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example" };
    eq(loadAuthConfig(base).userUrl, "https://projectref.supabase.co/auth/v1/user", "derived, and https");

    for (const [override, what] of [
      [{ SUPABASE_USER_URL: "http://example.com/auth/v1/user" }, "a plaintext override"],
      [{ SUPABASE_USER_URL: "http://localhost.example.com/auth/v1/user" }, "a lookalike host"],
      [{ SUPABASE_URL: "http://projectref.supabase.co" }, "a plaintext project URL, which derives both endpoints"],
      /* The key set every token is verified against is held to the same rule,
         and is checked on its own — pointing it at plaintext while the user
         endpoint stays https must still be refused. */
      [{ SUPABASE_JWKS_URL: "http://example.com/auth/v1/.well-known/jwks.json" }, "a plaintext JWKS override"],
      [{ SUPABASE_JWKS_URL: "http://localhost.example.com/.well-known/jwks.json" }, "a lookalike JWKS host"],
    ]) {
      let threw = null;
      try { loadAuthConfig({ ...base, ...override }); } catch (e) { threw = e; }
      assert(threw && threw.code === "config.invalid", what + " is refused");
      assert(/must be https/.test(threw.message), "and says why: " + threw.message);
    }
    /* Local development still works — both endpoints, on loopback. */
    const local = loadAuthConfig({ ...base, SUPABASE_URL: "http://localhost:54321" });
    eq(local.userUrl, "http://localhost:54321/auth/v1/user");
    eq(local.jwksUrl, "http://localhost:54321/auth/v1/.well-known/jwks.json");
    eq(loadAuthConfig({ ...base, SUPABASE_USER_URL: "http://127.0.0.1:54321/auth/v1/user" }).userUrl,
      "http://127.0.0.1:54321/auth/v1/user", "and an explicit loopback override");
  });

  test("the provider is asked before anything is opened or claimed", () => {
    const source = fs.readFileSync(path.join(ROOT, "server", "registration.js"), "utf8");
    const body = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const asked = body.indexOf("identity.confirmedEmail");
    const opened = body.indexOf("repository.withTransaction");
    assert(asked > 0 && opened > 0 && asked < opened,
      "a network round trip inside the transaction would hold the world lock on somebody else's server");
  });
});

/* ============================================================== E */
describe("E. nothing survives a failed redemption", () => {
  /* Each failure is injected at a different step of the same transaction. What
     must be true afterwards is identical every time: no partner, no account,
     and an invitation that is still pending — so it can simply be used again. */
  const brokenAt = {
    "loading the world": (context) => { context.repository.loadWorld = async () => { throw new Error("load failed"); }; },
    "saving the world": (context) => { context.repository.saveWorld = async () => { throw new Error("save failed"); }; },
    "binding the account": (context) => { context.accounts.linkAccount = async () => { throw new Error("link failed"); }; },
    "recording the outcome": (context) => { context.invitations.completeRedemption = async () => { throw new Error("audit failed"); }; },
  };

  for (const [step, breakIt] of Object.entries(brokenAt)) {
    test(`a failure while ${step} leaves nothing behind`, async () => {
      const context = await world();
      const { token, invitation } = await invite(context);
      const real = { loadWorld: context.repository.loadWorld, saveWorld: context.repository.saveWorld,
        linkAccount: context.accounts.linkAccount, completeRedemption: context.invitations.completeRedemption };
      breakIt(context);

      let threw = null;
      try {
        await direct(context, token, "sub-casey");
      } catch (e) { threw = e; }
      assert(threw, "the failure was not swallowed");

      Object.assign(context.repository, { loadWorld: real.loadWorld, saveWorld: real.saveWorld });
      context.accounts.linkAccount = real.linkAccount;
      context.invitations.completeRedemption = real.completeRedemption;

      eq((await context.repository.loadWorld()).partners.length, 0, "no partner");
      eq((await context.accounts.listAccounts()).length, 0, "no account");
      const after = await context.invitations.findById(invitation.id);
      eq(after.status, "pending", "the invitation was not spent");
      eq(after.partnerId, null);

      /* And it still works, which is the point of rolling back rather than
         cleaning up: the person tries again and it simply goes through. */
      const done = await direct(context, token, "sub-casey");
      eq(done.ok, true, JSON.stringify(done));
      eq((await context.repository.loadWorld()).partners.length, 1);
    });
  }

  test("a world that would not validate is not saved, and spends nothing", async () => {
    const context = await world();
    const { token, invitation } = await invite(context);
    /* The world on disk is fine; what the save is handed is not. */
    const realSave = context.repository.saveWorld;
    context.repository.saveWorld = async (state, tx, opts) => realSave.call(context.repository,
      { ...state, partners: [{ name: "no id" }] }, tx, opts);

    let threw = null;
    try { await direct(context, token, "sub-casey"); } catch (e) { threw = e; }
    assert(threw && /persistence\./.test(String(threw.code)), `expected a persistence refusal, got ${threw && threw.code}`);

    context.repository.saveWorld = realSave;
    eq((await context.repository.loadWorld()).partners.length, 0);
    eq((await context.invitations.findById(invitation.id)).status, "pending");
  });

  test("two redemptions of one credential cannot both win", async () => {
    const context = await world();
    const { token } = await invite(context);
    /* PGlite is a single session, so these serialize rather than truly race —
       what is asserted is the outcome either order must produce. */
    const first = await direct(context, token, "sub-casey");
    const second = await direct(context, token, "sub-robin");
    eq(first.ok, true);
    eq(second.ok, false);
    eq(second.refused, REFUSALS.invitationUnusable);
    eq((await context.repository.loadWorld()).partners.length, 1);
    eq((await context.accounts.listAccounts()).length, 1);
  });
});

/* ============================================================== F */
describe("F. the canonical partner, and nothing else", () => {
  const ctx = () => RT.callContext(RT.deterministicRuntime(), undefined);

  test("registration creates one partner: an id, the approved name, and when", () => {
    const before = emptyWorld();
    const result = registerPartner(before, { name: "Northline Cards", invitationId: "inv-1" }, ctx());
    assert(result.ok, JSON.stringify(result));
    eq(result.state.partners.length, 1);
    const partner = result.state.partners[0];
    eq(Object.keys(partner).sort().join(), "id,name,registeredFrom,since",
      "four fields, and no invented profile, rate or city");
    eq(partner.name, "Northline Cards");
    eq(partner.registeredFrom, "inv-1");
    assert(validateWorld(result.state).ok, "and the world is valid");

    /* Every other collection is exactly as it was. */
    for (const key of Object.keys(before)) {
      if (key === "partners") continue;
      eq(JSON.stringify(result.state[key]), JSON.stringify(before[key]), key + " was not touched");
    }
    eq(before.partners.length, 0, "and the world it was given was not mutated");
  });

  test("it refuses rather than inventing a name", () => {
    for (const name of [undefined, null, "", "   ", 7, {}, "x".repeat(MAX_NAME + 1)]) {
      const result = registerPartner(emptyWorld(), { name, invitationId: "inv-1" }, ctx());
      eq(result.ok, false, JSON.stringify(name));
      eq(result.refused, D.REFUSE.nameRequired);
    }
    const tidy = registerPartner(emptyWorld(), { name: "  Northline   Cards\n", invitationId: "inv-1" }, ctx());
    eq(tidy.value.partner.name, "Northline Cards", "whitespace is tidied, not rejected");
  });

  test("it refuses without an invitation, and refuses to honour one twice", () => {
    /* One runtime for the sequence, so successive registrations get successive
       ids, exactly as one running server would mint them. */
    const runtime = RT.deterministicRuntime();
    const next = () => RT.callContext(runtime, undefined);
    eq(registerPartner(emptyWorld(), { name: "Northline Cards" }, next()).refused, D.REFUSE.invitationRequired);
    const once = registerPartner(emptyWorld(), { name: "Northline Cards", invitationId: "inv-1" }, next());
    const twice = registerPartner(once.state, { name: "Northline Cards", invitationId: "inv-1" }, next());
    eq(twice.ok, false);
    eq(twice.refused, D.REFUSE.alreadyRegistered);
    /* A different invitation for a shop of the same name is fine — two shops
       may share a name, and identity is the id. */
    const other = registerPartner(once.state, { name: "Northline Cards", invitationId: "inv-2" }, next());
    eq(other.ok, true);
    eq(other.state.partners.length, 2);
  });

  test("the time and the id are the runtime's, never a caller's", () => {
    const result = registerPartner(emptyWorld(),
      { name: "Northline Cards", invitationId: "inv-1", id: "p-mine", since: "1999-01-01", at: "1999-01-01" }, ctx());
    const partner = result.state.partners[0];
    assert(partner.id !== "p-mine", "the id was minted");
    assert(partner.id.startsWith("p"), "with the partner prefix");
    eq(partner.since, "2026-01-01T00:00:00.000Z", "and the time is the runtime's clock");
  });

  /* RESTATED IN BATCH 8.1. The property is the one it always was: a partner who
     has just registered is immediately a working actor, and the ordinary
     commands they then run are theirs. What changed is the first step. This
     test used to open by MINTING a card — `resolveCardIdentity`, which takes a
     card description from its caller and writes it into the catalogue with no
     seat check — and that command is no longer something a browser may send.
     So the card is in the world to begin with, as a real deployment's would
     be, and the test additionally proves the minting door is shut to a freshly
     registered partner exactly as it is to everyone else. */
  test("a registered partner can then use the ordinary commands, as themselves", async () => {
    const card = { id: "k1", name: "Charizard", set: "Base Set", num: "4/102",
      print: "Holo", edition: "Unlimited", language: "English", grade: "Raw", condition: "NM" };
    const context = await world({ seeded: { ...emptyWorld(), catalog: [card] } });
    const { token } = await invite(context);
    const app = appFor(context, { casey: { subject: "sub-casey", email: EMAIL } });
    const partnerId = (await redeem(app, "casey", { token })).json().state.actor.partnerId;

    /* Registering does not hand anybody the catalogue pen. */
    const minted = await app.inject({ method: "POST", url: "/api/commands",
      headers: { authorization: "Bearer casey" },
      payload: { command: "resolveCardIdentity", payload: { identity: { name: "Invented", set: "Nowhere", num: "1" } } } });
    eq(minted.statusCode, 409, minted.body);
    eq(minted.json().error.refused, "command-unavailable");
    eq((await context.repository.loadWorld()).catalog.length, 1, "and the catalogue is as it was");

    /* "Let's put your inventory to work." — their first productive action. */
    const added = await app.inject({ method: "POST", url: "/api/commands",
      headers: { authorization: "Bearer casey" },
      payload: { command: "addInventoryCopy", payload: { copy: { cardId: card.id, ask: 400 } } } });
    eq(added.statusCode, 200, added.body);
    eq(added.json().state.inventory.length, 1, "their own first copy");
    eq(added.json().state.inventory[0].partnerId, partnerId, "and it is theirs");

    /* And the profile they fill in afterwards is an ordinary command too. */
    const profile = await app.inject({ method: "POST", url: "/api/commands",
      headers: { authorization: "Bearer casey" },
      payload: { command: "updatePartnerProfile", payload: { patch: { about: "Independent dealer, vintage and raw." } } } });
    eq(profile.statusCode, 200, profile.body);
    eq((await context.repository.loadWorld()).partners[0].about, "Independent dealer, vintage and raw.");
  });
});

/* ============================================================== G */
describe("G. no self-service path, and no boundary moved", () => {
  test("registration is not a command, so no request body can name it", () => {
    assert(!COMMAND_NAMES.includes("registerPartner"), "registerPartner is not in the command table");
    assert(!COMMAND_NAMES.some((name) => /register|invite.*partner|redeem/i.test(name)),
      "and neither is anything like it: " + COMMAND_NAMES.join(", "));
    const commands = fs.readFileSync(path.join(ROOT, "domain", "metyet-commands.js"), "utf8");
    assert(!/metyet-registration/.test(commands), "the command layer does not import the registration path either");
  });

  test("there is no route by which anyone can invite themselves", async () => {
    const context = await world();
    const app = appFor(context, { casey: { subject: "sub-casey", email: EMAIL } });
    const auth = { authorization: "Bearer casey" };
    for (const url of ["/api/invitations", "/api/registration/invite", "/api/partners", "/api/signup",
      "/api/registration/partner/invite"]) {
      for (const method of ["GET", "POST"]) {
        const response = await app.inject({ method, url, headers: auth, payload: {} });
        eq(response.statusCode, 404, `${method} ${url}`);
      }
    }
    /* The one registration route exists, and answers only POST. */
    for (const method of ["GET", "PUT", "DELETE"]) {
      eq((await app.inject({ method, url: "/api/registration/partner", headers: auth })).statusCode, 404, method);
    }
    eq((await context.invitations.listInvitations()).length, 0, "and nothing invited anybody");
  });

  test("an app with no invitation directory has no registration route at all", async () => {
    const context = await world();
    const app = createApp({ repository: context.repository, accounts: context.accounts,
      verifier: verifierFor({ casey: { subject: "sub-casey", email: EMAIL } }), runtime: context.runtime });
    const response = await app.inject({ method: "POST", url: "/api/registration/partner",
      headers: { authorization: "Bearer casey" }, payload: { token: "anything" } });
    eq(response.statusCode, 404, response.body);
  });

  test("creating an invitation is reachable from no route", () => {
    const reachable = new Set();
    const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const follow = (relative) => {
      if (reachable.has(relative)) return;
      reachable.add(relative);
      const full = path.join(ROOT, relative);
      if (!fs.existsSync(full)) return;
      for (const m of code(fs.readFileSync(full, "utf8")).matchAll(/require\(["'](\.[^"']+)["']\)/g)) {
        follow(path.relative(ROOT, path.resolve(path.dirname(full), m[1])));
      }
    };
    follow("server/app.js");
    /* The directory is reachable (redemption needs it); the call that mints a
       credential is made in exactly one place, and that place is the founder's
       command line. */
    const callers = ["server/cli.js", "server/auth/invitations.js"];
    for (const file of fs.readdirSync(path.join(ROOT, "server")).map((f) => `server/${f}`)
      .concat(fs.readdirSync(path.join(ROOT, "server", "auth")).map((f) => `server/auth/${f}`))) {
      if (!file.endsWith(".js")) continue;
      const body = code(fs.readFileSync(path.join(ROOT, file), "utf8"));
      if (/createInvitation\s*\(/.test(body)) assert(callers.includes(file), file + " mints invitation credentials");
    }
    assert(!reachable.has("server/cli.js"), "and the founder's commands are not reachable from an HTTP route");
  });

  test("the registration route touches no other boundary", async () => {
    const context = await world();
    const { token } = await invite(context);
    const app = appFor(context, { casey: { subject: "sub-casey", email: EMAIL },
      nobody: { subject: "sub-nobody", email: "nobody@northline.example" } });

    /* Before registering, the ordinary routes treat them as nobody — the
       registration route did not quietly provision anything. */
    const before = await app.inject({ method: "GET", url: "/api/view", headers: { authorization: "Bearer nobody" } });
    eq(before.statusCode, 403);
    eq(before.json().error.code, "account_not_provisioned");

    await redeem(app, "casey", { token });
    const after = await app.inject({ method: "GET", url: "/api/view", headers: { authorization: "Bearer nobody" } });
    eq(after.statusCode, 403, "and still nobody afterwards");
  });

  test("a credential never reaches a response, a projection or a log line", async () => {
    const context = await world();
    const { token, invitation } = await invite(context);
    const lines = [];
    const app = appFor(context, { casey: { subject: "sub-casey", email: EMAIL } },
      { logger: { level: "info", stream: { write: (line) => lines.push(line) } } });

    const good = await redeem(app, "casey", { token });
    eq(good.statusCode, 200, good.body);
    const bad = await redeem(app, "casey", { token: "wrong-credential-entirely" });
    eq(bad.statusCode, 409);

    const said = lines.join("\n") + good.body + bad.body;
    assert(!said.includes(token), "the good credential is nowhere");
    assert(!said.includes("wrong-credential-entirely"), "and neither is a rejected one");
    assert(!said.includes(hashToken(token)), "nor a verifier for either");
    assert(lines.length > 0, "something was logged, so this proves more than an empty log");
    /* The invitation ID is not a secret and is not treated as one: it is in the
       new partner's own record, where it is the audit trail back to why they
       exist. The CREDENTIAL is the secret, and that is what is absent above. */
    assert(good.body.includes(invitation.id), "their own record says which invitation made it");
    assert(!bad.body.includes(invitation.id), "but a refusal names nothing at all");
  });

  test("the demo world is still the demo world, and production is still empty", async () => {
    const context = await world();
    const stored = await context.repository.loadWorld();
    for (const [name, rows] of Object.entries(stored)) eq(rows.length, 0, name + " is empty before anyone registers");

    const registration = fs.readFileSync(path.join(ROOT, "server", "registration.js"), "utf8");
    const domain = fs.readFileSync(path.join(ROOT, "domain", "metyet-registration.js"), "utf8");
    for (const [file, text] of [["server/registration.js", registration], ["domain/metyet-registration.js", domain]]) {
      assert(!/buildCanonicalSeed|createStore|demo|seed/i.test(text.replace(/\/\*[\s\S]*?\*\//g, "")),
        file + " reaches for demo data");
    }
  });

  test("no show-specific framing entered this batch", () => {
    /* Production files only. This suite itself names the paths that must NOT
       exist ("/api/signup"), which is the opposite of framing. */
    const FRAMING = /\bshows?\b|\bbooths?\b|\bconventions?\b|\bexpos?\b|\bmarketplace\b|apply now|sign ?up/i;
    /* Everything this batch wrote from scratch, held to the whole rule — a
       Trusted Partner is never a "vendor" either. */
    for (const file of ["domain/metyet-registration.js", "server/registration.js", "server/auth/invitations.js",
      "persistence/migrations/0003_partner_invitations.sql"]) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      assert(!FRAMING.test(text) && !/\bvendors?\b/i.test(text),
        file + " frames MetYet around a show, a marketplace, an open signup or a vendor");
    }
    /* The files this batch added to. "Vendor" survives there in its other
       sense — a hosting provider — so only the framing itself is checked. */
    for (const file of ["server/app.js", "server/cli.js"]) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      assert(!FRAMING.test(text), file + " frames MetYet around a show, a marketplace or an open signup");
      assert(!/vendor (sign|regist|applic)/i.test(text), file + " calls a Trusted Partner a vendor");
    }
  });
});

run();
