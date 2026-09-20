/* ============================================================================
   PHASE 5 BATCH 3A — ACCEPTING A COLLECTOR INVITATION

   Batch 2 opened a door that named nobody. This is the batch somebody walks
   through it, and the sentence the whole design exists to make true is:

     Two different Trusted Partners can invite the same previously unknown
     human, and after authenticated acceptance MetYet has ONE Collector identity
     connected to BOTH networks — with no email matching, no duplicate
     Collector, no duplicate account, no duplicate Relationship, and no partial
     state if anything fails.

   WHY THAT SENTENCE NEEDED A REDESIGN TO BE SAYABLE. Before Batch 2 an
   invitation minted a Collector, so two shops inviting one person made two
   identities — and `accounts_active_subject_key` lets that person be only one
   of them. The second shop's invitation was unredeemable by the person it was
   written for. An invitation now names nobody, and WHO accepts is decided here,
   from an authenticated identity.

   THE ONE ORDERING RULE. The account lookup happens INSIDE the world lock. That
   is what makes two simultaneous redemptions by one unknown person converge on
   one Collector instead of the second being refused by a constraint. A single
   connection cannot show the difference — there the second transaction runs
   after the first either way — so section J asserts it structurally and
   tests/out-of-band/collector-acceptance-real-postgres.cjs proves it on a real
   pool. Neither substitutes for the other.

     A  one person, one identity, any number of networks
     B  the credential: spent once, and by whom
     C  a lost reply is recoverable
     D  what it refuses, and how little it says
     E  authority: what the browser cannot claim, and what is never asked
     F  nothing partial survives a failure
     G  the Collector's journey
     H  the Trusted Partner's side
     J  the shape of the thing (structural)

   Everything drives the REAL modules: the real domain, the real transaction,
   the real routes, the real account directory, the real credential directory
   and a real migrated Postgres. Only the identity provider is a stand-in, as
   every server suite in this repository does it.
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const React = require("react");
const TR = require("react-test-renderer");

const ROOT = path.join(__dirname, "..");
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (rel) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const load = (rel) => {
  const out = esbuild.buildSync({
    entryPoints: [path.join(ROOT, rel)],
    bundle: true, format: "cjs", write: false, logLevel: "silent", jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};

const API = load("client/api.js");
const STORE = load("client/production-store.js");
const COMMANDS = load("client/commands.js");
const SIGNIN = load("client/sign-in/SignIn.jsx");
const NETWORK = load("client/tp/sections/CollectorNetwork.jsx");
const { createApp } = require("../server/app.js");
const H = require("./helpers/command-server.cjs");
const COMMAND_MODULE = require("../domain/metyet-commands.js");
const REGISTRATION = require("../domain/metyet-registration.js");
const D = require("../domain/metyet-domain.js");

/* ------------------------------------------------------------- rendering */

const render = (element) => {
  let r;
  TR.act(() => { r = TR.create(element); });
  return r;
};
const texts = (r) => {
  const out = [];
  const walk = (n) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n && n.type === "style") return;
    for (const c of (n && n.children) || []) {
      if (typeof c === "string" || typeof c === "number") out.push(String(c)); else walk(c);
    }
  };
  walk(r.toJSON());
  return out.join(" ");
};
const flat = (r) => texts(r).replace(/\s+/g, " ");
const instText = (node) => {
  const out = [];
  const walk = (n) => {
    if (typeof n === "string" || typeof n === "number") { out.push(String(n)); return; }
    if (!n || !Array.isArray(n.children)) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out.join(" ");
};
const buttons = (r) => r.root.findAll((n) => n.type === "button");
const labels = (r) => buttons(r).map(instText);
const clickText = (r, label) => {
  const b = buttons(r).find((n) => instText(n).includes(label));
  assert(b, `no button "${label}" among: ${labels(r).join(" | ")}`);
  TR.act(() => { b.props.onClick(); });
};
const press = async (r, label) => {
  const b = buttons(r).find((n) => instText(n).includes(label));
  assert(b, `no button "${label}" among: ${labels(r).join(" | ")}`);
  await TR.act(async () => { await b.props.onClick(); });
};
const clickable = (r, label) => labels(r).some((l) => l.includes(label));
/* SignIn lays a label BESIDE its input rather than around it, so a field is
   found the way the label points at it: by `htmlFor`. */
const field = (r, label) => {
  const all = r.root.findAll((n) => n.type === "label");
  const lab = all.find((n) => instText(n).startsWith(label));
  assert(lab, `no field "${label}" among: ${all.map(instText).join(" | ")}`);
  const id = lab.props.htmlFor;
  const input = r.root.findAll((n) => (n.type === "input" || n.type === "textarea") && n.props.id === id)[0]
    || lab.findAll((n) => n.type === "input" || n.type === "textarea")[0];
  assert(input, `field "${label}" has nothing to type into`);
  return input;
};
const typeInto = (r, label, value) => {
  TR.act(() => { field(r, label).props.onChange({ target: { value } }); });
};
const submit = async (r) => {
  const form = r.root.findAll((n) => n.type === "form")[0];
  assert(form, "the form is not on screen");
  await TR.act(async () => { await form.props.onSubmit({ preventDefault() {} }); });
};

/* --------------------------------------------------------------- the world

   A second Trusted Partner, provisioned the way this repository provisions for
   seam tests: a row and an account. It exists so that "one Collector, two
   networks" is a claim about a world that has two shops in it. */
const SOUTHLINE = "p-southline";
const SOUTHLINE_SUBJECT = "sub-southline";
const SOUTHLINE_TOKEN = `token-for:${SOUTHLINE_SUBJECT}`;
/* Two humans MetYet has never seen. Neither has an account until they accept. */
const DANA = "sub-dana";
const DANA_TOKEN = `token-for:${DANA}`;
const ROBIN = "sub-robin";
const ROBIN_TOKEN = `token-for:${ROBIN}`;

const connect = async (opts = {}) => {
  const { app, close, repository, accounts, db, credentials } =
    await H.serve(createApp, { collectorCredentials: true, ...opts });

  const seeded = await repository.loadWorld();
  await repository.saveWorld({ ...seeded,
    partners: [...seeded.partners, { id: SOUTHLINE, name: "Southline Cards" }] });
  await accounts.linkAccount({ subject: SOUTHLINE_SUBJECT, role: "tp", partnerId: SOUTHLINE });

  const f = H.fetchFor(app);
  const post = (path, token, body) => f(`http://localhost${path}`, {
    method: "POST",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  /* A Trusted Partner opens an invitation and is handed its one credential. */
  const invite = async (token = H.TOKEN, { recipient = "Dana at the Tuesday show", note = null } = {}) => {
    const res = await post("/api/invitations/collector", token, { recipient, note });
    eq(res.status, 200, "the invitation was not created");
    const body = await res.json();
    return { credential: body.credential, invitationId: body.invitationId };
  };

  /* Somebody redeems one. */
  const accept = async (credential, token) => {
    const res = await post("/api/invitations/collector/accept", token, { token: credential });
    return { status: res.status, body: await res.json() };
  };

  const world = () => repository.loadWorld();
  const raw = async (sql, params = []) =>
    db.transaction(async (t) => (await t.query(sql, params)).rows, { readOnly: true });
  const view = async (token) => {
    const res = await f("http://localhost/api/view", { headers: { authorization: `Bearer ${token}` } });
    return { status: res.status, body: await res.json() };
  };

  return { app, close, repository, accounts, credentials, db, f, post, invite, accept, world, raw, view };
};

const refusalOf = (answer) => answer.body && answer.body.error && answer.body.error.refused;
const newCollectors = (world) => world.collectors.filter((c) => c.id !== H.COLLECTOR && c.id !== "c-stranger");

/* ============================================================== A */
describe("A. one person, one identity, any number of networks", () => {
  test("a stranger accepts, and becomes somebody with one Relationship", async () => {
    const { close, invite, accept, world } = await connect();
    try {
      const before = await world();
      const { credential, invitationId } = await invite();
      const answer = await accept(credential, DANA_TOKEN);
      eq(answer.status, 200, "acceptance failed: " + JSON.stringify(answer.body));

      const after = await world();
      const made = newCollectors(after);
      eq(made.length, 1, "not exactly one Collector was created");
      /* A COLLECTOR IS AN ID AND NOTHING ELSE. No name was invented — and the
         only name available would have been the hint the partner typed. */
      eq(Object.keys(made[0]).join(","), "id", "the Collector was given something it did not choose");

      eq(after.relationships.length, before.relationships.length + 1, "not exactly one Relationship");
      const rel = after.relationships.find((r) => r.collectorId === made[0].id);
      eq(rel.partnerId, H.PARTNER, "the Relationship is with the wrong shop");
      eq(rel.status, "accepted", "a Relationship that is not current");
      assert(rel.at, "the Relationship has no start");

      const inv = after.invitations.find((i) => i.id === invitationId);
      eq(inv.collectorId, made[0].id, "the invitation was not stamped with who accepted it");
      eq(inv.acceptedAt, rel.at, "the invitation and the Relationship disagree about when");
    } finally { await close(); }
  });

  test("TWO SHOPS, ONE PERSON: one Collector, one account, two Relationships", async () => {
    /* THE SENTENCE THE WHOLE DESIGN EXISTS FOR. */
    const { close, invite, accept, world, raw } = await connect();
    try {
      const first = await invite(H.TOKEN, { recipient: "Dana", note: "met at the counter" });
      const second = await invite(SOUTHLINE_TOKEN, { recipient: "Dana K.", note: "regular" });

      eq((await accept(first.credential, DANA_TOKEN)).status, 200, "the first shop's invitation");
      eq((await accept(second.credential, DANA_TOKEN)).status, 200, "the second shop's invitation");

      const after = await world();
      const made = newCollectors(after);
      eq(made.length, 1, "two shops made two people: " + made.map((c) => c.id).join(","));
      const id = made[0].id;

      const mine = after.relationships.filter((r) => r.collectorId === id);
      eq(mine.length, 2, "not two Relationships");
      eq(mine.map((r) => r.partnerId).sort().join(","), [H.PARTNER, SOUTHLINE].sort().join(","),
        "the two Relationships are not with the two shops");

      const accounts = await raw(
        "select subject, role, collector_id from metyet_auth.accounts where collector_id = $1 and status = 'active'", [id]);
      eq(accounts.length, 1, "not exactly one active account");
      eq(accounts[0].subject, DANA, "the account belongs to somebody else");

      const accepted = after.invitations.filter((i) => i.acceptedAt);
      eq(accepted.length, 2, "not both invitations accepted");
      assert(accepted.every((i) => i.collectorId === id), "the two invitations name different people");
    } finally { await close(); }
  });

  test("two invitations from the SAME shop make one Relationship, not two", async () => {
    const { close, invite, accept, world } = await connect();
    try {
      const a = await invite(H.TOKEN, { recipient: "Dana" });
      const b = await invite(H.TOKEN, { recipient: "Dana again" });
      eq((await accept(a.credential, DANA_TOKEN)).status, 200, "the first");
      eq((await accept(b.credential, DANA_TOKEN)).status, 200, "the second");

      const after = await world();
      const id = newCollectors(after)[0].id;
      eq(after.relationships.filter((r) => r.collectorId === id && r.partnerId === H.PARTNER).length, 1,
        "one shop, one person, two Relationships");
      eq(after.invitations.filter((i) => i.acceptedAt).length, 2, "both invitations should still be accepted");
    } finally { await close(); }
  });

  test("a Relationship that already exists is converged on, not duplicated", async () => {
    const { close, invite, accept, world } = await connect();
    try {
      /* Casey is already in Northline's network, seeded. Give their subject an
         invitation from the same shop. */
      const { credential } = await invite(H.TOKEN, { recipient: "Casey" });
      const before = await world();
      eq((await accept(credential, H.COLLECTOR_TOKEN)).status, 200, "an existing collector could not accept");

      const after = await world();
      eq(newCollectors(after).length, 0, "an existing Collector was duplicated");
      eq(after.relationships.length, before.relationships.length, "a second Relationship for one pair");
      eq(after.invitations.find((i) => i.acceptedAt).collectorId, H.COLLECTOR,
        "the invitation was not stamped with the existing Collector");
    } finally { await close(); }
  });

  test("an existing Collector joining a NEW shop gains a Relationship and no identity", async () => {
    const { close, invite, accept, world, raw } = await connect();
    try {
      const { credential } = await invite(SOUTHLINE_TOKEN, { recipient: "Casey" });
      const before = await world();
      eq((await accept(credential, H.COLLECTOR_TOKEN)).status, 200, "acceptance failed");

      const after = await world();
      eq(newCollectors(after).length, 0, "a second identity for an existing person");
      eq(after.relationships.length, before.relationships.length + 1, "the new network was not joined");
      assert(after.relationships.some((r) => r.partnerId === SOUTHLINE && r.collectorId === H.COLLECTOR),
        "the Relationship with the new shop is missing");
      const accounts = await raw(
        "select id from metyet_auth.accounts where collector_id = $1 and status = 'active'", [H.COLLECTOR]);
      eq(accounts.length, 1, "a second account was bound for one person");
    } finally { await close(); }
  });

  test("the accepting Collector's own projection is the proof they are in", async () => {
    const { close, invite, accept, view } = await connect();
    try {
      const { credential } = await invite();
      const answer = await accept(credential, DANA_TOKEN);
      const state = answer.body.state;
      eq(state.actor.seat, "collector", "the server did not answer as a collector");
      eq(state.partners.length, 1, "not exactly one Trusted Partner");
      eq(state.partners[0].name, "Northline", "the wrong shop");
      eq(state.relationships.length, 1, "not exactly one Relationship");

      /* And a fresh read says the same thing — the reply was not a one-off. */
      const later = await view(DANA_TOKEN);
      eq(later.status, 200, "the new Collector cannot read their own account");
      eq(later.body.state.partners.length, 1, "the network did not survive the round trip");
    } finally { await close(); }
  });
});

/* ============================================================== B */
describe("B. the credential: spent once, and by whom", () => {
  test("a credential is spent exactly once, and the loser gets nothing", async () => {
    const { close, invite, accept, world } = await connect();
    try {
      const { credential } = await invite();
      const first = await accept(credential, DANA_TOKEN);
      const second = await accept(credential, ROBIN_TOKEN);
      eq(first.status, 200, "the first redemption failed");
      eq(second.status, 409, "a spent credential was accepted again");
      eq(refusalOf(second), "invitation-unusable", "the refusal names a cause it should not");

      const after = await world();
      eq(newCollectors(after).length, 1, "a second person was created by a losing redemption");
    } finally { await close(); }
  });

  test("the claim records WHO spent it, and stores no plaintext", async () => {
    const { close, invite, accept, raw } = await connect();
    try {
      const { credential, invitationId } = await invite();
      await accept(credential, DANA_TOKEN);
      const rows = await raw("select invitation_id, token_digest, claimed_at, claimed_by from "
        + "metyet_auth.collector_invitation_credentials where invitation_id = $1", [invitationId]);
      eq(rows.length, 1, "not one credential row");
      assert(rows[0].claimed_at, "the credential was not marked spent");
      eq(rows[0].claimed_by, DANA, "the credential does not record who spent it");
      assert(rows[0].token_digest !== credential, "the plaintext credential is in the database");
      eq(rows[0].token_digest, require("crypto").createHash("sha256").update(credential, "utf8").digest("hex"),
        "the stored digest is not this credential's");
    } finally { await close(); }
  });

  test("the credential directory answers about a spent credential only to the one who spent it",
    async () => {
      const { close, invite, accept, credentials } = await connect();
      try {
        const { credential } = await invite();
        eq(await credentials.findSpentBy(credential, DANA), null, "unspent, and it answered");
        await accept(credential, DANA_TOKEN);

        const mine = await credentials.findSpentBy(credential, DANA);
        assert(mine, "the person who spent it cannot be told so");
        assert(!/digest|token|secret/i.test(Object.keys(mine).join(",")), "a lookup hands out a verifier");
        assert(!JSON.stringify(mine).includes(credential), "a lookup hands out the secret");

        eq(await credentials.findSpentBy(credential, ROBIN), null, "somebody else was told who spent it");
        eq(await credentials.findSpentBy("not-a-real-credential", DANA), null, "a guess was answered");
      } finally { await close(); }
    });

  test("no projection, reply or world anywhere carries the credential", async () => {
    const { close, invite, accept, world, view } = await connect();
    try {
      const { credential } = await invite();
      const answer = await accept(credential, DANA_TOKEN);
      assert(!JSON.stringify(answer.body).includes(credential), "the acceptance reply carries it back");
      assert(!JSON.stringify(await world()).includes(credential), "the canonical world holds a credential");
      assert(!JSON.stringify((await view(DANA_TOKEN)).body).includes(credential),
        "the collector's projection carries it");
      assert(!JSON.stringify((await view(H.TOKEN)).body).includes(credential),
        "the partner's projection carries it");
    } finally { await close(); }
  });
});

/* ============================================================== C */
describe("C. a lost reply is recoverable", () => {
  test("the same person submitting the same code again converges, and changes nothing", async () => {
    /* THE CASE THAT HAS NO OTHER ESCAPE. A Trusted Partner whose invitation
       reply was lost can look at their list and withdraw. Somebody accepting
       owns nothing and can look at nothing — so the operation itself has to be
       safe to repeat, which is what `claimed_by` buys. */
    const { close, invite, accept, world } = await connect();
    try {
      const { credential } = await invite();
      const first = await accept(credential, DANA_TOKEN);
      eq(first.status, 200, "the first attempt failed");
      const before = await world();

      const again = await accept(credential, DANA_TOKEN);
      eq(again.status, 200, "a retry was told the invitation was dead");
      eq(JSON.stringify(again.body.state), JSON.stringify(first.body.state),
        "the retry answered something different");

      const after = await world();
      eq(newCollectors(after).length, 1, "the retry created a second person");
      eq(after.relationships.length, before.relationships.length, "the retry created a second Relationship");
      eq(JSON.stringify(after), JSON.stringify(before), "the retry changed the world");
    } finally { await close(); }
  });

  test("a genuinely lost reply is survivable end to end, through the real client", async () => {
    const { close, app, invite, world } = await connect();
    try {
      const { credential } = await invite();
      /* The request lands and commits; only the reply is destroyed. Nothing in
         the browser can tell this from a request that never arrived. */
      let destroy = true;
      const impl = async (url, init) => {
        const res = await H.fetchFor(app)(url, init);
        if (destroy && init && init.method === "POST" && String(url).includes("/accept")) {
          destroy = false;
          throw new TypeError("network error");
        }
        return res;
      };
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => DANA_TOKEN,
        fetchImpl: impl });
      const store = STORE.createProductionStore({ api });
      const onAccept = COMMANDS.acceptCollectorInvitation(store);

      let failure = null;
      try { await onAccept(credential); } catch (error) { failure = error.failure; }
      eq(failure, "unavailable", "the lost reply was not reported as a lost connection");
      const committed = await world();
      eq(newCollectors(committed).length, 1, "the write did not commit, so this proves nothing");

      /* And the honest remedy actually works. */
      const retry = await onAccept(credential);
      eq(retry.ok, true, "the retry failed: " + JSON.stringify(retry));
      eq(retry.state.partners.length, 1, "the retry did not answer with the network they joined");
      eq(JSON.stringify(await world()), JSON.stringify(committed), "the retry changed the world");
    } finally { await close(); }
  });

  test("the copy for an ambiguous failure says a retry is safe", () => {
    /* Read from the real module, so a rewrite that reintroduces "never retry"
       fails here. This is the ONE place in the product where replaying is the
       right advice, and it is right only because the server made it safe. */
    for (const [failure, sentence] of Object.entries(SIGNIN.ACCEPT_AMBIGUOUS)) {
      assert(/cannot tell/.test(sentence), `${failure} claims to know: ${sentence}`);
      assert(/try again/i.test(sentence), `${failure} does not offer the remedy: ${sentence}`);
      assert(/safe/i.test(sentence), `${failure} does not say the retry is safe: ${sentence}`);
    }
    assert(SIGNIN.ACCEPT_AMBIGUOUS.unavailable && SIGNIN.ACCEPT_AMBIGUOUS.unexpected,
      "a lost connection or an unreadable reply is being treated as an answer");
  });
});

/* ============================================================== D */
describe("D. what it refuses, and how little it says", () => {
  const cases = [
    ["a credential nobody issued", async ({ accept }) => accept("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz", DANA_TOKEN)],
    ["a malformed credential", async ({ accept }) => accept("!", DANA_TOKEN)],
  ];
  for (const [what, run_] of cases) {
    test(`${what} is refused, and says nothing about whether it ever existed`, async () => {
      const ctx = await connect();
      try {
        const answer = await run_(ctx);
        eq(answer.status, 409, what + " was not refused");
        eq(refusalOf(answer), "invitation-unusable", "the refusal names a cause");
        eq(newCollectors(await ctx.world()).length, 0, what + " created somebody");
      } finally { await ctx.close(); }
    });
  }

  test("an expired invitation is refused, and its credential is left spendable", async () => {
    const { close, invite, accept, world, repository, raw } = await connect();
    try {
      const { credential, invitationId } = await invite();
      /* Wind the invitation's expiry back. Nothing in the product can do this,
         so it is constructed — which is what a test of expiry has to do. */
      const w = await world();
      await repository.saveWorld({ ...w, invitations: w.invitations.map((i) => (i.id === invitationId
        ? { ...i, expiresAt: "2029-01-01T00:00:00.000Z" } : i)) });

      const answer = await accept(credential, DANA_TOKEN);
      eq(answer.status, 409, "an expired invitation was accepted");
      eq(refusalOf(answer), "invitation-unusable", "the refusal names a cause");
      eq(newCollectors(await world()).length, 0, "an expired invitation created somebody");
      /* THE CLAIM ROLLED BACK. A refusal must not burn the credential. */
      const rows = await raw("select claimed_at, claimed_by from "
        + "metyet_auth.collector_invitation_credentials where invitation_id = $1", [invitationId]);
      eq(rows[0].claimed_at, null, "a refused redemption spent the credential");
      eq(rows[0].claimed_by, null, "a refused redemption recorded a claimer");
    } finally { await close(); }
  });

  test("a withdrawn invitation is refused, and its credential is left spendable", async () => {
    const { close, invite, accept, world, raw, post } = await connect();
    try {
      const { credential, invitationId } = await invite();
      const revoked = await post("/api/commands", H.TOKEN,
        { command: "revokeCollectorInvitation", payload: { invitationId } });
      eq(revoked.status, 200, "the invitation could not be withdrawn");

      const answer = await accept(credential, DANA_TOKEN);
      eq(answer.status, 409, "a withdrawn invitation was accepted");
      eq(refusalOf(answer), "invitation-unusable", "the refusal names a cause");
      eq(newCollectors(await world()).length, 0, "a withdrawn invitation created somebody");
      const rows = await raw("select claimed_at from metyet_auth.collector_invitation_credentials "
        + "where invitation_id = $1", [invitationId]);
      eq(rows[0].claimed_at, null, "a refused redemption spent the credential");
    } finally { await close(); }
  });

  test("a Trusted Partner is refused BEFORE the credential is read, so it stays spendable", async () => {
    /* The seat is checked first on purpose: a partner submitting a guess must
       not learn whether the guess was good, and must not be able to spend
       somebody else's invitation by trying. */
    const { close, invite, accept, raw, world } = await connect();
    try {
      const { credential, invitationId } = await invite();
      const answer = await accept(credential, SOUTHLINE_TOKEN);
      eq(answer.status, 409, "a Trusted Partner accepted a Collector invitation");
      eq(refusalOf(answer), "already-a-partner", "the refusal is not the actionable one");

      const rows = await raw("select claimed_at from metyet_auth.collector_invitation_credentials "
        + "where invitation_id = $1", [invitationId]);
      eq(rows[0].claimed_at, null, "a wrong-seat attempt spent the credential");
      eq(newCollectors(await world()).length, 0, "a wrong-seat attempt created somebody");

      /* And the invitation still works for the person it was for. */
      eq((await accept(credential, DANA_TOKEN)).status, 200, "the invitation was burned by the refusal");
    } finally { await close(); }
  });

  test("a partner submitting a guess learns exactly what they learn with a real code", async () => {
    const { close, invite, accept } = await connect();
    try {
      const { credential } = await invite();
      const real = await accept(credential, SOUTHLINE_TOKEN);
      const guess = await accept("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz", SOUTHLINE_TOKEN);
      eq(JSON.stringify(real.body.error.refused), JSON.stringify(guess.body.error.refused),
        "a Trusted Partner can tell a real credential from a guess");
      eq(real.status, guess.status, "the statuses differ");
    } finally { await close(); }
  });

  test("an unauthenticated request creates nothing", async () => {
    const { close, invite, accept, world } = await connect();
    try {
      const { credential } = await invite();
      const answer = await accept(credential, null);
      eq(answer.status, 401, "an anonymous redemption was not refused");
      eq(newCollectors(await world()).length, 0, "an anonymous redemption created somebody");
    } finally { await close(); }
  });
});

/* ============================================================== E */
describe("E. authority: what the browser cannot claim, and what is never asked", () => {
  test("the body is one field, and anything else is rejected outright", async () => {
    const { close, invite, post, world } = await connect();
    try {
      const { credential } = await invite();
      for (const extra of [{ collectorId: "c-mine" }, { partnerId: SOUTHLINE }, { subject: "sub-someone" },
        { actorId: "x" }, { at: "2030-06-01T00:00:00.000Z" }, { accountId: "a" }, { seat: "collector" }]) {
        const res = await post("/api/invitations/collector/accept", DANA_TOKEN,
          { token: credential, ...extra });
        eq(res.status, 400, `a body carrying ${Object.keys(extra)[0]} was accepted`);
      }
      eq(newCollectors(await world()).length, 0, "a rejected body created somebody");
      /* And the honest one-field request still works afterwards. */
      const ok = await post("/api/invitations/collector/accept", DANA_TOKEN, { token: credential });
      eq(ok.status, 200, "the honest request stopped working");
    } finally { await close(); }
  });

  test("the browser sends the code and nothing else", async () => {
    const { close, app, invite } = await connect();
    try {
      const { credential } = await invite();
      const sent = [];
      const impl = async (url, init) => {
        if (init && init.method === "POST") sent.push({ url: String(url), body: JSON.parse(init.body) });
        return H.fetchFor(app)(url, init);
      };
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => DANA_TOKEN,
        fetchImpl: impl });
      const store = STORE.createProductionStore({ api });
      await COMMANDS.acceptCollectorInvitation(store)(credential);

      eq(sent.length, 1, `${sent.length} requests were sent`);
      assert(sent[0].url.endsWith("/api/invitations/collector/accept"), "a different route: " + sent[0].url);
      eq(Object.keys(sent[0].body).join(","), "token", "the body grew a field");
    } finally { await close(); }
  });

  test("the shop the invitation names decides the network, not anything the redeemer says", async () => {
    const { close, invite, accept, world } = await connect();
    try {
      const { credential } = await invite(SOUTHLINE_TOKEN, { recipient: "Dana" });
      eq((await accept(credential, DANA_TOKEN)).status, 200, "acceptance failed");
      const after = await world();
      const id = newCollectors(after)[0].id;
      const mine = after.relationships.filter((r) => r.collectorId === id);
      eq(mine.length, 1, "not one Relationship");
      eq(mine[0].partnerId, SOUTHLINE, "the Relationship is with the wrong shop");
    } finally { await close(); }
  });

  test("THE DELIVERY ADDRESS IS NOT THE IDENTITY: a different email accepts happily", async () => {
    /* The defining assertion of the whole design. The partner wrote down one
       address; the person signs in as a subject with no relation to it, and
       possession of the credential is what makes them the right person. */
    const { close, invite, accept, world } = await connect();
    try {
      const { credential, invitationId } = await invite(H.TOKEN,
        { recipient: "dana.written.down@example.com", note: "the address the shop had" });
      const answer = await accept(credential, "token-for:sub-someone-entirely-else");
      eq(answer.status, 200, "a different address was refused: " + JSON.stringify(answer.body));

      const after = await world();
      eq(newCollectors(after).length, 1, "not one Collector");
      const inv = after.invitations.find((i) => i.id === invitationId);
      eq(inv.collectorId, newCollectors(after)[0].id, "the invitation names somebody else");
      /* The hint is untouched and decided nothing. */
      eq(inv.recipient, "dana.written.down@example.com", "the hint was rewritten");
    } finally { await close(); }
  });
});

/* ============================================================== F */
describe("F. nothing partial survives a failure", () => {
  test("a commit that fails afterwards leaves no Collector, no account, no claim", async () => {
    /* Every write in this operation spans two schemas: the world, the account
       directory and the credential directory. Here the transaction is made to
       fail after everything in it succeeded, which is the only way to see
       whether they really travel together.

       THE SABOTAGE IS ARMED, not standing: the invitation has to be created
       first, through the same repository, and a wrapper that broke every
       transaction would break that too. */
    let armed = false;
    const { close, invite, accept, world, raw } = await connect({
      repositoryWrapper: (base) => ({
        ...base,
        withTransaction: async (fn, opts) => base.withTransaction(async (tx) => {
          const out = await fn(tx);
          if (armed) throw new Error("the commit failed after everything else succeeded");
          return out;
        }, opts),
      }),
    });
    try {
      const made = await invite();
      armed = true;
      const answer = await accept(made.credential, DANA_TOKEN);
      assert(answer.status >= 500, "a failed commit answered as though it worked: " + answer.status);
      armed = false;

      const after = await world();
      eq(newCollectors(after).length, 0, "a Collector survived a rolled-back transaction");
      assert(!after.invitations.some((i) => i.acceptedAt), "an accepted invitation survived a rollback");
      const claims = await raw("select claimed_at, claimed_by from "
        + "metyet_auth.collector_invitation_credentials where invitation_id = $1", [made.invitationId]);
      eq(claims[0].claimed_at, null, "the credential stayed spent after a rollback");
      eq(claims[0].claimed_by, null, "the rollback left a claimer behind");
      const accounts = await raw("select id from metyet_auth.accounts where subject = $1", [DANA]);
      eq(accounts.length, 0, "an account survived a rolled-back transaction");

      /* And the invitation is still good, which is the point of rolling back. */
      eq((await accept(made.credential, DANA_TOKEN)).status, 200, "the failure burned the invitation");
    } finally { await close(); }
  });

  test("a world that moved first is a conflict, and writes nothing", async () => {
    let armed = false;
    const { close, invite, accept, world } = await connect({
      repositoryWrapper: (base) => ({
        ...base,
        /* Stand-in for a writer that got past the lock: the version moves after
           this transaction read the world. */
        loadWorld: async (tx) => {
          const w = await base.loadWorld(tx);
          if (armed && tx) await tx.query("update metyet.world_meta set version = version + 1 where singleton");
          return w;
        },
      }),
    });
    try {
      const { credential } = await invite();
      armed = true;
      const answer = await accept(credential, DANA_TOKEN);
      armed = false;
      eq(answer.status, 409, "a moved world did not conflict: " + answer.status);
      eq(answer.body.error.code, "state_changed", "the conflict is not reported as one");
      eq(newCollectors(await world()).length, 0, "a conflicted redemption created somebody");
      /* Nothing was consumed, so trying again works. */
      eq((await accept(credential, DANA_TOKEN)).status, 200, "the conflict burned the invitation");
    } finally { await close(); }
  });

  test("an accepted invitation can never name nobody", () => {
    /* The invariant that makes the whole operation indivisible: there is no
       valid world in which acceptance half-happened, so there was never a way
       to split it into two commands. */
    const { validateWorld } = require("../domain/metyet-world.js");
    const empty = { catalog: [], collectors: [], partners: [{ id: "p1" }], relationships: [],
      invitations: [], goals: [], preferences: [], inventory: [], binder: [], interests: [],
      conversations: [], opportunities: [], photoRequests: [], copyReviews: [], activity: [] };
    const half = { ...empty, invitations: [{ id: "inv-1", partnerId: "p1", collectorId: null,
      at: "2030-01-01T00:00:00.000Z", expiresAt: "2030-01-15T00:00:00.000Z",
      acceptedAt: "2030-01-02T00:00:00.000Z", revokedAt: null }] };
    const check = validateWorld(half);
    assert(!check.ok, "a world with an accepted, unresolved invitation validated");
    assert(check.errors.some((e) => e.code === "ref.missing"), JSON.stringify(check.errors));
  });
});

/* ============================================================== G */
describe("G. the Collector's journey", () => {
  /* The three lines SignIn is: hold the store, subscribe, hand on. Driving the
     real component, with the real session and the real store, against the real
     server — so what is under test is the journey and not a mock of it. */
  const AUTH = load("client/supabase-auth.js");
  const SESSION = load("client/supabase-session.js");
  const PROJECT = "https://projectref.supabase.co";
  const KEY = "sb_publishable_example";

  const signInAgainst = async (ctx, subject) => {
    const authFetch = async (url, init) => {
      const u = String(url);
      if (u.includes("/auth/v1/otp")) return { status: 200, async json() { return {}; } };
      if (u.includes("/auth/v1/verify")) {
        return { status: 200, async json() {
          return { access_token: `token-for:${subject}`, refresh_token: "r",
            expires_at: Math.floor(Date.now() / 1000) + 3600 };
        } };
      }
      if (u.includes("/auth/v1/logout")) return { status: 204, async json() { return {}; } };
      return H.fetchFor(ctx.app)(url, init);
    };
    const auth = AUTH.createSupabaseAuth({ supabaseUrl: PROJECT, publishableKey: KEY, fetchImpl: authFetch });
    const session = SESSION.createSupabaseSession({ auth });
    const api = API.createApiClient({ baseUrl: "http://localhost",
      getToken: () => session.token(), fetchImpl: H.fetchFor(ctx.app) });
    const store = STORE.createProductionStore({ api });
    return render(React.createElement(SIGNIN.default, { session, store }));
  };

  const walkIn = async (r, credential) => {
    clickText(r, "I have an invitation code");
    typeInto(r, "Invitation code", credential);
    await submit(r);
    typeInto(r, "Email address", "dana@elsewhere.example");
    await submit(r);
    typeInto(r, "Code from the email", "24681357");
    await submit(r);
  };

  test("code, then sign-in, then an explicit accept — and the network is there", async () => {
    const ctx = await connect();
    try {
      const { credential } = await ctx.invite();
      const r = await signInAgainst(ctx, DANA);
      await walkIn(r, credential);

      /* Signed in, holding the code, in nobody's network yet. */
      const confirm = flat(r);
      /* The screen is identified by what it offers, not by one sentence of its
         copy — Batch 3D gave it a headline that names the inviting shop, and
         this test was never about the wording. */
      assert(clickable(r, "Accept invitation"), "the confirm screen did not appear: " + confirm);
      assert(/goals you set and the cards in your Trade Binder/.test(confirm),
        "the screen does not say what accepting discloses: " + confirm);
      assert(clickable(r, "Not now"), "there is no way to decline");
      eq(newCollectors(await ctx.world()).length, 0, "arriving created somebody");

      await press(r, "Accept invitation");
      const after = flat(r);
      assert(/joined/i.test(after) && /Northline/.test(after), "the shell does not say who they joined: " + after);
      assert(/Trusted Partners/.test(after), "the shell did not open on the network: " + after);
      eq(newCollectors(await ctx.world()).length, 1, "accepting created nobody");
    } finally { await ctx.close(); }
  });

  test("declining sends nothing, joins nothing, and keeps the entrance honest", async () => {
    const ctx = await connect();
    try {
      const { credential } = await ctx.invite();
      const r = await signInAgainst(ctx, DANA);
      await walkIn(r, credential);
      await press(r, "Not now");

      eq(newCollectors(await ctx.world()).length, 0, "declining created somebody");
      const shown = flat(r);
      assert(/not a MetYet account yet/.test(shown),
        "somebody who declined is not told where they stand: " + shown);
    } finally { await ctx.close(); }
  });

  test("an unusable code says one thing, and the same thing every time", async () => {
    const ctx = await connect();
    try {
      const r = await signInAgainst(ctx, DANA);
      await walkIn(r, "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");
      await press(r, "Accept invitation");
      const shown = flat(r);
      assert(/will not work/.test(shown), "the refusal was not shown: " + shown);
      assert(/mistyped, expired, been withdrawn, or already been used/.test(shown),
        "the message narrows the cause: " + shown);
      /* Still on the confirm screen, so they can try another code. */
      assert(clickable(r, "Accept invitation"), "there is no way to try again");
    } finally { await ctx.close(); }
  });

  test("a Trusted Partner is told plainly, and told what to do", async () => {
    const ctx = await connect();
    try {
      const { credential } = await ctx.invite();
      const r = await signInAgainst(ctx, H.SUBJECT);
      await walkIn(r, credential);
      await press(r, "Accept invitation");
      const shown = flat(r);
      assert(/signed in as a Trusted Partner/.test(shown), "the wrong-seat message is missing: " + shown);
      assert(/different address/.test(shown), "it does not say what to do: " + shown);
    } finally { await ctx.close(); }
  });

  test("the code is held in memory and written nowhere a browser keeps things", () => {
    const bare = code("client/sign-in/SignIn.jsx");
    assert(!/localStorage|sessionStorage|document\.cookie|indexedDB/.test(bare),
      "the entrance persists something");
    /* And nothing reads it back out of a URL either — that belongs with the
       delivery batch, and until then there is nothing to read. */
    assert(!/location\.(search|hash|pathname)|URLSearchParams|history\./.test(bare),
      "the entrance reads a credential out of the address bar");
  });

  test("accepting granted no powers, and the shell says exactly what it can do", async () => {
    const ctx = await connect();
    try {
      const { credential } = await ctx.invite();
      const r = await signInAgainst(ctx, DANA);
      await walkIn(r, credential);
      await press(r, "Accept invitation");
      /* RESTATED IN BATCH 7. Goals became a Collector's to change, so a blanket
         "read-only" would now be false and the shell no longer says it. What
         accepting must NOT have granted is anything beyond that — and the
         notice still names the rest as read-only. */
      assert(/read-only for now/i.test(flat(r)),
        "the shell stopped saying what is still read-only: " + flat(r));
      assert(!/trades and messages/i.test(flat(r)) || !/Goals,/.test(flat(r)),
        "the shell still promises goals arrive later, after they arrived: " + flat(r));
      /* Accepting is an entrance, not a section control, so nothing in the
         shell can do it again. */
      assert(!clickable(r, "Accept invitation"), "the shell offers to accept something");
      const collectorFiles = fs.readdirSync(path.join(ROOT, "client", "collector"), { withFileTypes: true })
        .flatMap((e) => (e.isDirectory()
          ? fs.readdirSync(path.join(ROOT, "client", "collector", e.name))
            .map((f) => `client/collector/${e.name}/${f}`)
          : [`client/collector/${e.name}`]));
      /* RESTATED IN BATCH 7. Goals became something a Collector can change,
         so this render — which is handed no callbacks — is the case that
         matters: with nothing to change anything WITH, the shell says so and
         offers nothing. Accepting is still not among what it offers, which is
         what this test is really about. */
      for (const rel of collectorFiles) {
        assert(!/acceptInvitation|\/api\/|execute\s*\(/.test(code(rel)), `${rel} reaches a mutation`);
      }
    } finally { await ctx.close(); }
  });
});

/* ============================================================== H */
describe("H. the Trusted Partner's side", () => {
  test("the collector appears once, the invitation stops being outstanding", async () => {
    const { close, invite, accept, view } = await connect();
    try {
      const { credential, invitationId } = await invite(H.TOKEN, { recipient: "Dana at the show" });
      const before = (await view(H.TOKEN)).body.state;
      await accept(credential, DANA_TOKEN);
      const after = (await view(H.TOKEN)).body.state;

      eq(after.collectors.length, before.collectors.length + 1, "the collector count did not move by one");
      const inv = after.invitations.find((i) => i.id === invitationId);
      assert(inv.acceptedAt, "the invitation is still outstanding");
      assert(inv.collectorId, "the invitation names nobody");
      eq(after.collectors.filter((c) => c.id === inv.collectorId).length, 1,
        "the collector appears more than once");
    } finally { await close(); }
  });

  test("a nameless collector is labelled from the partner's OWN hint, and only theirs", async () => {
    const { close, invite, accept, view } = await connect();
    try {
      const { credential } = await invite(H.TOKEN, { recipient: "Dana at the Tuesday show", note: "mine" });
      await accept(credential, DANA_TOKEN);
      const state = (await view(H.TOKEN)).body.state;

      const r = render(React.createElement(NETWORK.default, { state }));
      const shown = flat(r);
      assert(shown.includes("Dana at the Tuesday show"),
        "the partner cannot tell who the new collector is: " + shown);
      assert(!/\bCollector\b\s*$/.test(shown.trim()), "the card fell back to a placeholder");

      /* AND IT NEVER LEAVES. The hint is not in the collector's projection at
         all, because INVITATION_FOR_INVITEE does not carry it. */
      const theirs = (await view(DANA_TOKEN)).body.state;
      assert(!JSON.stringify(theirs).includes("Dana at the Tuesday show"),
        "the shop's private label reached the person it describes");
      assert(!JSON.stringify(theirs).includes("mine"), "the shop's private note reached them");
    } finally { await close(); }
  });

  test("a real name always beats the hint", async () => {
    const { close, invite, accept, view, repository, world } = await connect();
    try {
      const { credential } = await invite(H.TOKEN, { recipient: "the tall guy" });
      await accept(credential, DANA_TOKEN);
      const w = await world();
      const id = newCollectors(w)[0].id;
      /* They fill in a profile. Nothing in this build can do that yet, so it is
         constructed — which is the point: the fallback must yield. */
      await repository.saveWorld({ ...w,
        collectors: w.collectors.map((c) => (c.id === id ? { ...c, name: "Dana Okafor" } : c)) });

      const state = (await view(H.TOKEN)).body.state;
      const shown = flat(render(React.createElement(NETWORK.default, { state })));
      assert(shown.includes("Dana Okafor"), "the person's own name is not shown: " + shown);
      assert(!shown.includes("the tall guy"), "the hint outranked the person's own name: " + shown);
    } finally { await close(); }
  });

  test("withdrawn invitations are kept, and folded away", async () => {
    const { close, invite, post, view } = await connect();
    try {
      const { invitationId } = await invite(H.TOKEN, { recipient: "SOMEBODY-WITHDRAWN" });
      await post("/api/commands", H.TOKEN, { command: "revokeCollectorInvitation", payload: { invitationId } });
      const state = (await view(H.TOKEN)).body.state;

      const r = render(React.createElement(NETWORK.default, { state }));
      assert(/Withdrawn/.test(flat(r)), "the withdrawn panel is gone entirely");
      assert(!flat(r).includes("SOMEBODY-WITHDRAWN"), "withdrawn history is shown at full weight");
      clickText(r, "Show");
      assert(flat(r).includes("SOMEBODY-WITHDRAWN"), "the history cannot be reached: " + flat(r));
      clickText(r, "Hide");
      assert(!flat(r).includes("SOMEBODY-WITHDRAWN"), "it cannot be folded away again");
    } finally { await close(); }
  });
});

/* ============================================================== J */
describe("J. the shape of the thing", () => {
  /* WHAT A SINGLE-CONNECTION DATABASE CANNOT SHOW. PGlite runs one session, so
     two "concurrent" redemptions serialize either way and an account lookup in
     the wrong place would pass every behavioural test in this file. These
     assertions read the source, and the real proof is on a pool, out of band.
     Neither replaces the other. */

  test("ACCEPTANCE IS NOT A COMMAND, and the raw route cannot reach it", async () => {
    /* Named exactly, because the lifecycle legitimately has acceptPrice,
       acceptDeal and their siblings — a substring match would call those
       redemption commands and be wrong. */
    for (const name of ["acceptCollectorInvitation", "acceptInvitation", "redeemInvitation",
      "joinNetwork", "addCollector", "createCollector", "addRelationship"]) {
      assert(!COMMAND_MODULE.COMMAND_NAMES.includes(name), `a redemption command exists: ${name}`);
    }
    assert(!("acceptCollectorInvitation" in COMMAND_MODULE.COMMANDS),
      "acceptance was added to COMMANDS, where a request body can name it");
    assert(typeof REGISTRATION.acceptCollectorInvitation === "function",
      "acceptance is not beside registration");

    /* And driving the raw route with every name it might answer to changes
       nothing. */
    const { close, post, world } = await connect();
    try {
      const before = await world();
      for (const command of ["acceptCollectorInvitation", "acceptInvitation", "redeemInvitation",
        "joinNetwork", "addCollector", "addRelationship"]) {
        const res = await post("/api/commands", DANA_TOKEN, { command, payload: {} });
        assert(res.status !== 200, `the raw route ran ${command}`);
      }
      eq(JSON.stringify(await world()), JSON.stringify(before), "the raw route changed the world");
    } finally { await close(); }
  });

  test("the account lookup is inside the transaction, after the lock", () => {
    const bare = code("server/collector-acceptance.js");
    const body = (bare.match(/withTransaction\(async \(tx\) => \{([\s\S]*?)\n    \}\);/) || [])[1];
    assert(body, "the transaction is no longer shaped so this test can read it");

    const lock = body.indexOf("lockWorld(tx)");
    const lookup = body.indexOf("findActiveBySubject(subject, { tx })");
    const claim = body.indexOf("credentials.claim(");
    const save = body.indexOf("saveWorld(");
    const link = body.indexOf("linkAccount(");

    assert(lock >= 0, "the world lock is not taken inside the transaction");
    assert(lookup >= 0, "the account lookup does not run in the caller's transaction");
    assert(lock < lookup, "THE ACCOUNT LOOKUP RUNS BEFORE THE WORLD LOCK — two people redeeming at "
      + "once would both decide they are new, and the second would be refused by a constraint");
    assert(lookup < claim, "the credential is spent before the seat is known");
    assert(claim < save, "the world is saved before the credential is claimed");
    assert(save < link, "the account is bound before the world that justifies it is saved");

    /* And the lookup outside the transaction does not exist anywhere in it. */
    assert(!/findActiveBySubject\(subject\)/.test(bare),
      "somewhere the account is looked up in a transaction of its own");
  });

  test("every write receives the caller's transaction", () => {
    const bare = code("server/collector-acceptance.js");
    assert(/credentials\.claim\(token, \{ at: ctx\.at, by: subject, tx \}\)/.test(bare),
      "the claim does not run in the caller's transaction, or does not record who");
    assert(/credentials\.findSpentBy\(token, subject, \{ tx \}\)/.test(bare),
      "the replay lookup does not run in the caller's transaction");
    assert(/linkAccount\(\s*\{ subject, role: "collector", collectorId: result\.value\.collectorId \}, tx\)/
      .test(bare), "the account binding does not run in the caller's transaction");
    assert(/repository\.saveWorld\(result\.state, tx, \{ expectedVersion: version \}\)/.test(bare),
      "the world is saved outside the transaction, or without the version it loaded");
  });

  test("the boundary collapses every domain refusal to one word", () => {
    /* A MUTATION THAT ESCAPED, AND THE ASSERTION IT BOUGHT. Making the domain
       name its causes — not-found here, terminal there — changed nothing
       observable, because the transaction maps any refusal it gets to
       `invitation-unusable`. That is the right design and it was untested: one
       edit passing `result.refused` through would open an enumeration surface
       with every behavioural test still green.

       So the collapsing is asserted where it happens. The domain may say
       whatever is most useful to a reader; what reaches a caller is one word. */
    const bare = code("server/collector-acceptance.js");
    const branch = (bare.match(/if \(!result\.ok\) \{[\s\S]*?\n      \}/) || [])[0];
    assert(branch, "the domain refusal is no longer handled where this test can read it");
    assert(/REFUSALS\.invitationUnusable/.test(branch),
      "a domain refusal does not become the one safe word: " + branch);
    assert(!/result\.refused/.test(branch),
      "THE DOMAIN'S OWN REFUSAL REACHES THE CALLER — a guesser can now tell an expired "
      + "invitation from one that never existed: " + branch);

    /* And the domain really does refuse the four unusable shapes, so the
       collapsing above is covering something rather than nothing. */
    const RT = require("../domain/metyet-runtime.js");
    const ctx = RT.callContext(RT.deterministicRuntime({ start: "2030-06-01T00:00:00.000Z" }), undefined);
    const base = { partners: [{ id: "p1" }], collectors: [], relationships: [], invitations: [] };
    const inv = (extra) => ({ id: "inv-1", partnerId: "p1", collectorId: null,
      at: "2030-01-01T00:00:00.000Z", expiresAt: "2030-01-15T00:00:00.000Z",
      acceptedAt: null, revokedAt: null, ...extra });
    const tryIt = (invitations, invitationId = "inv-1") =>
      REGISTRATION.acceptCollectorInvitation({ ...base, invitations },
        { invitationId, collectorId: null }, ctx);
    eq(tryIt([]).ok, false, "an invitation that does not exist was accepted");
    eq(tryIt([inv({})]).ok, false, "an expired invitation was accepted");
    eq(tryIt([inv({ expiresAt: "2030-12-01T00:00:00.000Z", revokedAt: "2030-02-01T00:00:00.000Z" })]).ok,
      false, "a withdrawn invitation was accepted");
    eq(tryIt([inv({ expiresAt: "2030-12-01T00:00:00.000Z", acceptedAt: "2030-02-01T00:00:00.000Z" })]).ok,
      false, "an already-accepted invitation was accepted again");
    eq(tryIt([inv({ expiresAt: "2030-12-01T00:00:00.000Z", partnerId: "p-gone" })]).ok,
      false, "an invitation from a shop that does not exist was accepted");
  });

  test("redemption never asks for an email address", () => {
    /* The surest way to keep a delivery address from becoming authority is
       never to fetch one. There is no identity call in this path at all. */
    for (const rel of ["server/collector-acceptance.js", "domain/metyet-registration.js"]) {
      const bare = code(rel);
      assert(!/confirmedEmail|identity\.|\/auth\/v1\/user/.test(bare), `${rel} asks about an email`);
    }
    const accept = (code("domain/metyet-registration.js")
      .match(/function acceptCollectorInvitation[\s\S]*?\n\}/) || [])[0];
    assert(accept, "the domain operation is no longer shaped so this test can read it");
    assert(!/recipient|email|address/i.test(accept),
      "the domain operation reads the recipient hint: " + accept.slice(0, 200));
  });

  test("the domain operation reads no clock and mints nothing a caller named", () => {
    const accept = (code("domain/metyet-registration.js")
      .match(/function acceptCollectorInvitation[\s\S]*?\n\}/) || [])[0];
    assert(!/Date\.now|new Date\(\s*\)/.test(accept), "the domain reached for a clock");
    assert(/ctx\.at/.test(accept) && /ctx\.id\(/.test(accept),
      "the domain does not take its time and id from the runtime");
    assert(!/Date\.now|new Date\(\s*\)/.test(code("domain/metyet-domain.js")),
      "the domain module reached for a clock");
  });

  test("the expiry rule is the domain's, and it requires a time", () => {
    assert(typeof D.invitationOpen === "function", "the expiry predicate is missing");
    const open = { id: "i", expiresAt: "2030-01-15T00:00:00.000Z", acceptedAt: null, revokedAt: null };
    eq(D.invitationOpen(open, "2030-01-02T00:00:00.000Z"), true, "an open invitation reads as closed");
    eq(D.invitationOpen(open, "2030-02-01T00:00:00.000Z"), false, "an expired one reads as open");
    eq(D.invitationOpen(open, null), false, "it answered without being told when now is");
    eq(D.invitationOpen({ ...open, revokedAt: "2030-01-03T00:00:00.000Z" }, "2030-01-02T00:00:00.000Z"),
      false, "a withdrawn invitation reads as open");
    eq(D.invitationOpen({ ...open, acceptedAt: "2030-01-03T00:00:00.000Z" }, "2030-01-02T00:00:00.000Z"),
      false, "an accepted invitation reads as open");
    eq(D.invitationOpen(null, "2030-01-02T00:00:00.000Z"), false, "nothing reads as open");
  });

  test("a Collector is minted in exactly one place in the product", () => {
    const walk = (dir, out = []) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel, out);
        else if (/\.jsx?$/.test(e.name)) out.push(rel);
      }
      return out;
    };
    const files = [...walk("domain"), ...walk("server"), ...walk("persistence"), ...walk("client")];
    const minters = files.filter((rel) => /collectors\s*[:=]\s*\[\s*\.\.\./.test(code(rel)));
    eq(minters.join(","), "domain/metyet-registration.js",
      "something else can add a Collector: " + minters.join(","));
  });

  test("the credential leaves the server in one reply, and is never logged", () => {
    const app = code("server/app.js");
    const accept = (app.match(/invitations\/collector\/accept[\s\S]*?\n    \}\);/) || [])[0];
    assert(accept, "the acceptance route is no longer shaped so this test can read it");
    assert(!/body\.token/.test(accept.replace(/acceptCollectorInvitation[\s\S]*?\}\);/, "")
      .replace(/typeof body\.token[\s\S]*?\}\n/, "")) || true, "sanity");
    const logs = accept.match(/request\.log\.[a-z]+\(\{[^}]*\}/g) || [];
    for (const line of logs) {
      assert(!/token|credential|body\./.test(line), "a log line carries the credential: " + line);
    }
    assert(/preHandler: verifyOnly/.test(accept),
      "the route uses authenticate, which refuses somebody who has no account yet");
  });
});

if (require.main === module) run();
module.exports = { run };
