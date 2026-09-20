/* ============================================================================
   PHASE 5 BATCH 2 — OPENING A COLLECTOR INVITATION

   Batch 1 proved a Trusted Partner could change something of their own. This is
   the first thing they can create, and it is the piece a Collector Network
   grows from — so the questions it has to answer are not about a form.

   THE ONE THAT DECIDED THE DESIGN. Before this batch, `inviteCollector` created
   a Collector: a person-shaped row with an id, waiting to be claimed. That
   cannot be right, because a Collector may be in more than one Trusted
   Partner's network and there is one active account per person. Two shops
   inviting the same person made two Collector identities, and that person could
   only ever sign in as one of them — so the second shop's invitation could
   never be redeemed by the person it was written for.

   So an invitation now NAMES NOBODY. It records that a partner opened a door,
   when, until when, and two labels they typed for their own recognition. Who
   walks through it is decided at redemption, from an authenticated identity —
   and redemption is Batch 3 and does not exist yet. THAT BOUNDARY IS TESTED
   HERE: nothing in this build can turn the credential into anything.

     A  the invitation names nobody, end to end and in the database
     B  the credential: once, digest only, and never in a projection
     C  authority: whose network, and what the browser cannot claim
     D  withdrawing, and what withdrawing is not
     E  the raw API: the old semantics are gone, not merely unreachable
     F  ambiguity: what the screen says when it cannot know
     G  the boundary the control reaches through
     H  nothing in this build can redeem anything

   Everything below drives the REAL modules: the real section, the real
   commands module, the real production store, the real api client, the real
   Fastify routes, the real transaction, the real domain and a real migrated
   Postgres. Only the identity provider is a stand-in, as every server suite in
   this repository does it.
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
const ProductionApp = load("client/production-app.jsx").default;
const NETWORK = load("client/tp/sections/CollectorNetwork.jsx");
const { createApp } = require("../server/app.js");
const H = require("./helpers/command-server.cjs");
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
  /* A section rendered on its own is a fragment, so the root is an ARRAY. The
     shell wraps it in a div and hides that; a test that renders the section
     directly must not silently read nothing. */
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
const clickable = (r, label) => labels(r).some((l) => l.includes(label));
/* A control whose handler is a round trip. `clickText` fires and forgets, which
   is right for opening a form and wrong for anything that reaches the server. */
const press = async (r, label) => {
  const b = buttons(r).find((n) => instText(n).includes(label));
  assert(b, `no button "${label}" among: ${labels(r).join(" | ")}`);
  await TR.act(async () => { await b.props.onClick(); });
};
const field = (r, label) => {
  const all = r.root.findAll((n) => n.type === "label");
  const lab = all.find((n) => instText(n).startsWith(label));
  assert(lab, `no field "${label}" among: ${all.map(instText).join(" | ")}`);
  const input = lab.findAll((n) => n.type === "input" || n.type === "textarea")[0];
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

/* ------------------------------------------------------------- the wiring

   What SignIn does, in the three lines it does it in: hold the store,
   subscribe, and hand the application the projection plus bound callbacks. A
   test in G asserts SignIn really binds these and no others. */
function Live({ store, onInvite, onRevokeInvite, onRefresh }) {
  const [state, setState] = React.useState(store.get());
  React.useEffect(() => store.sub(setState), [store]);
  return React.createElement(ProductionApp,
    { state, onSignOut() {}, onInvite, onRevokeInvite, onRefresh });
}

const RECIPIENT = "Dana at the Tuesday show";
const NOTE = "Wants a graded Blastoise — met at Superior St.";

const connect = async (opts = {}) => {
  const { app, close, repository, accounts, db, credentials } =
    await H.serve(createApp, { collectorCredentials: true, ...opts });

  const seatClient = (token, fetchImpl = null) => {
    const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => token,
      fetchImpl: fetchImpl || H.fetchFor(app) });
    const store = STORE.createProductionStore({ api });
    return { api, store,
      onInvite: COMMANDS.openCollectorInvitation(store),
      onRevokeInvite: COMMANDS.revokeCollectorInvitation(store),
      onRefresh: COMMANDS.refreshView(store) };
  };

  /* The Trusted Partner, signed in, looking at their Collector Network — which
     is where they land, so there is no navigation to do. */
  const shop = async (fetchImpl = null) => {
    const seat = seatClient(H.TOKEN, fetchImpl);
    await seat.store.load();
    const r = render(React.createElement(Live, seat));
    return { ...seat, r };
  };

  const world = () => repository.loadWorld();
  const invitations = async () => (await world()).invitations || [];
  const raw = async (sql, params = []) =>
    db.transaction(async (t) => (await t.query(sql, params)).rows, { readOnly: true });

  return { app, close, repository, accounts, db, credentials, seatClient, shop, world,
    invitations, raw };
};

/* Opening one, the way a person does. Returns whatever the screen now shows. */
const invite = async (r, { recipient = RECIPIENT, note = NOTE } = {}) => {
  clickText(r, "Invite a collector");
  if (recipient !== null) typeInto(r, "Who is this for", recipient);
  if (note !== null) typeInto(r, "Note", note);
  await submit(r);
  return flat(r);
};

/* The credential as the screen shows it: the one place it is ever rendered. */
const shownCredential = (r) => {
  const el = r.root.findAll((n) => n.type === "code")[0];
  return el ? instText(el).trim() : null;
};

/* ============================================================== A */
describe("A. the invitation names nobody", () => {
  test("opening one creates exactly one invitation, and no Collector at all", async () => {
    const { close, shop, world } = await connect();
    try {
      const before = await world();
      const { r } = await shop();
      await invite(r);

      const after = await world();
      eq(after.invitations.length, before.invitations.length + 1, "not exactly one invitation");
      const inv = after.invitations[after.invitations.length - 1];

      /* THE WHOLE POINT, IN FOUR ASSERTIONS. */
      eq(inv.collectorId, null, "the invitation named somebody");
      eq(after.collectors.length, before.collectors.length,
        "a Collector was created by inviting; two shops inviting one person now make two people");
      eq(after.relationships.length, before.relationships.length,
        "a Relationship was created before anybody accepted anything");
      eq(inv.acceptedAt, null, "an invitation nobody has seen is already accepted");
    } finally { await close(); }
  });

  test("it belongs to the inviting partner, expires, and carries only labels", async () => {
    const { close, shop, invitations } = await connect();
    try {
      const { r } = await shop();
      await invite(r);
      const inv = (await invitations()).slice(-1)[0];

      eq(inv.partnerId, H.PARTNER, "the invitation is not the inviting partner's");
      eq(inv.revokedAt, null, "a new invitation is already withdrawn");
      assert(inv.at, "no time was recorded");
      eq(inv.expiresAt, D.invitationExpiry(inv.at), "the expiry is not the domain's own");
      assert(Date.parse(inv.expiresAt) > Date.parse(inv.at), "it expires before it was sent");

      eq(inv.recipient, RECIPIENT, "the recipient hint was not kept as typed");
      eq(inv.note, NOTE, "the note was not kept as typed");
      /* AND NOTHING THAT DECIDES ANYTHING. No email, no subject, no address the
         redemption could match against — a hint that becomes authority is the
         mistake this design exists to avoid. */
      const decided = Object.keys(inv).filter((k) => /email|subject|address|token|secret|code|digest/i.test(k));
      eq(decided.join(","), "", "the invitation grew a field that could become authority");
    } finally { await close(); }
  });

  test("two shops inviting the same person make two invitations and no people", async () => {
    /* THIS IS THE CASE THAT REWROTE THE COMMAND. Under the old semantics each
       invitation minted a Collector, so one person invited by two shops became
       two identities — and with one active account per person, only one of them
       could ever be signed in as. Here the same person is invited twice and the
       world gains nobody. */
    const OTHER = "p-southline";
    const SUBJECT = "sub-southline";
    const { close, shop, world, repository, accounts, seatClient } = await connect();
    try {
      const seeded = await world();
      await repository.saveWorld({ ...seeded,
        partners: [...seeded.partners, { id: OTHER, name: "Southline Cards" }] });
      await accounts.linkAccount({ subject: SUBJECT, role: "tp", partnerId: OTHER });

      const before = await world();
      const { r } = await shop();
      await invite(r, { recipient: "Dana", note: "first shop" });

      const second = seatClient(`token-for:${SUBJECT}`);
      await second.store.load();
      const answer = await second.store.createInvitation({ recipient: "Dana", note: "second shop" });
      eq(answer.ok, true, "the second shop could not invite the same person");

      const after = await world();
      eq(after.invitations.length, 2, "not two invitations");
      eq(after.collectors.length, before.collectors.length,
        "inviting created people: " + after.collectors.map((c) => c.id).join(","));
      assert(after.invitations.every((i) => i.collectorId === null),
        "an unaccepted invitation names somebody");
      eq(after.invitations.map((i) => i.partnerId).sort().join(","), [H.PARTNER, OTHER].sort().join(","),
        "the two invitations do not belong to the two shops");
      /* And the credentials are distinct, so redeeming one says nothing about
         the other — which is what lets one person join both networks. */
      assert(answer.credential, "the second shop's invitation carries no credential");
      assert(answer.credential !== shownCredential(r), "two shops issued one secret");
    } finally { await close(); }
  });

  test("a label is a label: one line, bounded, and absent when it is empty", async () => {
    /* A hint decides nothing, which is exactly why it must not be a place to
       put anything. It is one line, it is bounded, and blank means blank rather
       than an empty string pretending to be a name. */
    const { close, seatClient, invitations } = await connect();
    try {
      const seat = seatClient(H.TOKEN);
      await seat.store.load();

      const long = "D".repeat(400);
      const messy = "  Dana\n\n  at the   show \t";
      await seat.store.createInvitation({ recipient: messy, note: long });
      await seat.store.createInvitation({ recipient: "   ", note: "" });

      const [one, two] = await invitations();
      eq(one.recipient, "Dana at the show", "the recipient kept its whitespace and line breaks");
      assert(!/\n/.test(one.note), "the note kept a line break");
      assert(one.note.length <= 200 && one.note.length < long.length,
        `an unbounded note was stored (${one.note.length} characters)`);
      eq(two.recipient, null, "a blank recipient was stored as an empty string");
      eq(two.note, null, "a blank note was stored as an empty string");
    } finally { await close(); }
  });

  test("the domain will not invent a time, and the domain reads no clock", () => {
    const commands = code("domain/metyet-commands.js");
    const invite = (commands.match(/inviteCollector\(state[\s\S]*?\n  \},/) || [])[0];
    assert(invite, "inviteCollector is no longer shaped so this test can read it");
    assert(!/Date\.now|new Date\(\s*\)/.test(invite), "the command reached for a clock");
    assert(/ctx\.at/.test(invite), "the command does not take its time from the runtime");
    assert(/ctx\.id\(/.test(invite), "the command does not take its id from the runtime");
    /* And the expiry rule is the domain's, in one place. */
    const domain = code("domain/metyet-domain.js");
    assert(/invitationExpiry/.test(domain), "the expiry rule left the domain");
    assert(!/Date\.now|new Date\(\s*\)/.test(domain), "the domain module reached for a clock");
  });
});

/* ============================================================== B */
describe("B. the credential: once, digest only, never in a projection", () => {
  test("the secret comes back once, and the database keeps only its digest", async () => {
    const { close, shop, invitations, raw } = await connect();
    try {
      const { r } = await shop();
      await invite(r);
      const shown = shownCredential(r);
      assert(shown && shown.length >= 16, "no credential reached the screen: " + String(shown));

      const inv = (await invitations()).slice(-1)[0];
      const rows = await raw(
        "select invitation_id, token_digest, claimed_at, claimed_by from "
        + "metyet_auth.collector_invitation_credentials where invitation_id = $1", [inv.id]);
      eq(rows.length, 1, "the credential row is not one row");
      eq(rows[0].claimed_at, null, "a credential nobody has used is already spent");
      assert(rows[0].token_digest !== shown, "the plaintext credential is in the database");
      assert(!String(rows[0].token_digest).includes(shown), "the digest contains the secret");
      eq(rows[0].token_digest, require("crypto").createHash("sha256").update(shown, "utf8").digest("hex"),
        "the stored digest is not this credential's");
    } finally { await close(); }
  });

  test("no projection carries it, before or after, and no refresh brings it back", async () => {
    const { close, shop, app } = await connect();
    try {
      const { r, store } = await shop();
      await invite(r);
      const secret = shownCredential(r);
      assert(secret, "no credential to look for");

      /* The store's own projection, and a fresh one off the wire. */
      assert(!JSON.stringify(store.get()).includes(secret), "the credential is in the projection");
      await TR.act(async () => { await store.load(); });
      assert(!JSON.stringify(store.get()).includes(secret), "a refresh brought the credential back");

      const res = await H.fetchFor(app)("http://localhost/api/view",
        { headers: { authorization: `Bearer ${H.TOKEN}` } });
      const body = await res.json();
      assert(!JSON.stringify(body).includes(secret), "the credential is in a view response");
    } finally { await close(); }
  });

  test("the screen shows it once and offers no way to see it again", async () => {
    const { close, shop } = await connect();
    try {
      const { r } = await shop();
      await invite(r);
      const secret = shownCredential(r);
      assert(flat(r).includes(secret), "the credential is not on screen when it is meant to be");

      clickText(r, "Done");
      assert(!flat(r).includes(secret), "the credential is still on screen after dismissing it");
      assert(!clickable(r, "Show") && !clickable(r, "Reveal") && !clickable(r, "Copy again"),
        "there is a way to ask for it a second time: " + labels(r).join(" | "));

      /* And the outstanding invitation it belongs to lists what the server
         sent — both labels, as typed — and no secret. */
      const shown = flat(r);
      assert(/Invitations outstanding/.test(shown), "the invitation is not listed: " + shown);
      assert(shown.includes(RECIPIENT), "the list dropped who it was for: " + shown);
      assert(shown.includes(NOTE), "the list dropped the note: " + shown);
      assert(!shown.includes(secret), "the list carries the credential");
    } finally { await close(); }
  });

  test("two invitations get two different credentials", async () => {
    const { close, shop } = await connect();
    try {
      const { r } = await shop();
      await invite(r, { recipient: "One", note: "" });
      const first = shownCredential(r);
      clickText(r, "Done");
      await invite(r, { recipient: "Two", note: "" });
      const second = shownCredential(r);
      assert(first && second, "a credential is missing");
      assert(first !== second, "two invitations share one secret");
    } finally { await close(); }
  });

  test("the credential directory hands back no digest and no token, ever", async () => {
    const { close, shop, invitations, credentials } = await connect();
    try {
      const { r } = await shop();
      await invite(r);
      const inv = (await invitations()).slice(-1)[0];
      const record = await credentials.findByInvitation(inv.id);
      assert(record, "the credential cannot be found by its invitation");
      const keys = Object.keys(record).sort().join(",");
      assert(!/digest|token|secret/i.test(keys), "a lookup hands out a verifier: " + keys);
      assert(!JSON.stringify(record).includes(shownCredential(r)), "a lookup hands out the secret");
    } finally { await close(); }
  });

  test("a commit that fails afterwards leaves no credential behind", async () => {
    /* THE REASON THE HOOK EXISTS. The credential is minted inside the same
       transaction as the invitation, so a rollback anywhere takes both. Minting
       it in a transaction of its own would leave a secret pointing at an
       invitation that does not exist — wreckage nobody would ever find. Here
       the transaction is made to fail after everything in it succeeded. */
    const { close, app, invitations, raw } = await connect({
      repositoryWrapper: (base) => ({
        ...base,
        withTransaction: async (fn) => base.withTransaction(async (tx) => {
          await fn(tx);
          throw new Error("the commit failed after everything else succeeded");
        }),
      }),
    });
    try {
      const res = await H.fetchFor(app)("http://localhost/api/invitations/collector", {
        method: "POST",
        headers: { authorization: `Bearer ${H.TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ recipient: "Dana", note: null }),
      });
      assert(res.status >= 500, "a failed commit answered as though it worked: " + res.status);
      eq((await invitations()).length, 0, "the invitation survived a rolled-back transaction");
      const rows = await raw("select invitation_id from metyet_auth.collector_invitation_credentials");
      eq(rows.length, 0, "a credential survived a rolled-back transaction, pointing at nothing");

      /* AND THE ONE THING THIS TEST CANNOT SEE. PGlite is a single connection,
         so a credential minted in a transaction "of its own" would be swept up
         by the same rollback here and this test would pass anyway — against a
         real Postgres with a pool it would not. So the transaction being
         THREADED THROUGH is asserted directly, because the behaviour that
         distinguishes them is invisible in this harness. */
      assert(/credentials\.issue\(\{\s*invitationId:\s*value,\s*tx\s*\}\)/
        .test(code("server/collector-invitation.js")),
        "the credential is minted outside the caller's transaction");
      assert(/async \(tx, \{ value \}\)/.test(code("server/collector-invitation.js")),
        "the hook no longer receives the transaction");
    } finally { await close(); }
  });

  test("a credential is spendable exactly once, in one statement", async () => {
    /* `claim` has no caller in this batch and Batch 3 is where it gets one —
       but it is the rule that stops two people redeeming one invitation, and a
       rule with no test is a rule that quietly stops holding before its caller
       arrives. The WHERE clause carries both conditions, so "check then use"
       does not exist and two concurrent claims cannot both win. */
    const { close, shop, invitations, credentials } = await connect();
    try {
      const { r } = await shop();
      await invite(r);
      const secret = shownCredential(r);
      const inv = (await invitations()).slice(-1)[0];

      eq(await credentials.claim("not-the-secret", { at: "2030-02-01T00:00:00.000Z" }), null,
        "a credential nobody issued was accepted");

      const [a, b] = await Promise.all([
        credentials.claim(secret, { at: "2030-02-01T00:00:00.000Z", by: "sub-one" }),
        credentials.claim(secret, { at: "2030-02-01T00:00:00.000Z", by: "sub-two" }),
      ]);
      const won = [a, b].filter(Boolean);
      eq(won.length, 1, "one secret was spent twice");
      eq(won[0].invitationId, inv.id, "the claim answered with the wrong invitation");
      eq(await credentials.claim(secret, { at: "2030-03-01T00:00:00.000Z" }), null,
        "a spent credential can be spent again");
    } finally { await close(); }
  });

  test("no world state anywhere holds a credential", async () => {
    const { close, shop, world } = await connect();
    try {
      const { r } = await shop();
      await invite(r);
      const secret = shownCredential(r);
      assert(!JSON.stringify(await world()).includes(secret),
        "the canonical world carries a credential; metyet holds product state, metyet_auth holds secrets");
    } finally { await close(); }
  });
});

/* ============================================================== C */
describe("C. authority: whose network, and what the browser cannot claim", () => {
  test("the browser sends two labels and no authority at all", async () => {
    const { close, app } = await connect();
    try {
      const sent = [];
      const impl = async (url, init) => {
        if (init && init.method === "POST") sent.push({ url: String(url), body: JSON.parse(init.body) });
        return H.fetchFor(app)(url, init);
      };
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => H.TOKEN,
        fetchImpl: impl });
      const store = STORE.createProductionStore({ api });
      await store.load();
      const r = render(React.createElement(Live, { store,
        onInvite: COMMANDS.openCollectorInvitation(store),
        onRevokeInvite: COMMANDS.revokeCollectorInvitation(store),
        onRefresh: COMMANDS.refreshView(store) }));
      await invite(r);

      eq(sent.length, 1, `${sent.length} requests were sent`);
      assert(sent[0].url.endsWith("/api/invitations/collector"), "a different route: " + sent[0].url);
      eq(Object.keys(sent[0].body).sort().join(","), "note,recipient", "the body grew a field");
      /* Every key at every depth, because a nested one is still a claim. The
         VALUES are whatever a person typed and are not searched: "Dana at the
         Tuesday show" contains "at" and means nothing by it. */
      const keys = [];
      const walk = (v) => {
        if (!v || typeof v !== "object") return;
        for (const [k, inner] of Object.entries(v)) { keys.push(k); walk(inner); }
      };
      walk(sent[0].body);
      for (const forbidden of ["partnerId", "collectorId", "actor", "seat", "role", "by",
        "at", "subject", "sub", "token", "account", "accountId"]) {
        assert(!keys.includes(forbidden), `the browser sent ${forbidden}: ${keys.join(",")}`);
      }
    } finally { await close(); }
  });

  test("the server derives the inviting partner from the token, not the request", async () => {
    const { close, app, invitations } = await connect();
    try {
      /* A body that tries to name a different shop is rejected outright rather
         than quietly ignored, because silently ignoring it is how a caller
         comes to believe it worked. */
      const res = await H.fetchFor(app)("http://localhost/api/invitations/collector", {
        method: "POST",
        headers: { authorization: `Bearer ${H.TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ recipient: "Dana", note: null, partnerId: "p-southline" }),
      });
      eq(res.status, 400, "a body naming an owner was accepted");
      eq((await invitations()).length, 0, "an invitation was created by a rejected request");

      /* And the honest request lands on the token's own shop. */
      const ok = await H.fetchFor(app)("http://localhost/api/invitations/collector", {
        method: "POST",
        headers: { authorization: `Bearer ${H.TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ recipient: "Dana", note: null }),
      });
      eq(ok.status, 200, "the honest request did not succeed");
      eq((await invitations())[0].partnerId, H.PARTNER, "the invitation went to the wrong shop");
    } finally { await close(); }
  });

  test("an unauthenticated request creates nothing", async () => {
    const { close, app, invitations } = await connect();
    try {
      const res = await H.fetchFor(app)("http://localhost/api/invitations/collector",
        { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ recipient: "Dana" }) });
      eq(res.status, 401, "an anonymous request was not refused");
      eq((await invitations()).length, 0, "an anonymous request created an invitation");
    } finally { await close(); }
  });

  test("a Collector cannot open an invitation", async () => {
    const { close, app, invitations } = await connect();
    try {
      const res = await H.fetchFor(app)("http://localhost/api/invitations/collector", {
        method: "POST",
        headers: { authorization: `Bearer ${H.COLLECTOR_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ recipient: "Somebody" }),
      });
      eq(res.status, 409, "a Collector's invitation was not refused: " + res.status);
      const body = await res.json();
      eq(body.error.refused, "not-owner", "the refusal is not the domain's own");
      eq((await invitations()).length, 0, "a Collector created an invitation");
    } finally { await close(); }
  });

  test("the route is not there at all when the server has nowhere to keep a secret", async () => {
    /* The default server in this repository's helper has no credential
       directory, and a server that cannot store a credential must not create
       an invitation that needs one. */
    const { app, close } = await H.serve(createApp);
    try {
      const res = await H.fetchFor(app)("http://localhost/api/invitations/collector", {
        method: "POST",
        headers: { authorization: `Bearer ${H.TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ recipient: "Dana" }),
      });
      eq(res.status, 404, "the route answered without a credential directory");
    } finally { await close(); }
  });
});

/* ============================================================== D */
describe("D. withdrawing, and what withdrawing is not", () => {
  test("withdrawing marks the invitation and keeps it", async () => {
    const { close, shop, invitations } = await connect();
    try {
      const { r } = await shop();
      await invite(r);
      clickText(r, "Done");
      const before = (await invitations()).slice(-1)[0];

      await press(r, "Withdraw");
      const after = (await invitations()).slice(-1)[0];
      eq((await invitations()).length, 1, "withdrawing deleted the history");
      assert(after.revokedAt, "the invitation was not marked withdrawn");
      eq(after.id, before.id, "a different invitation was withdrawn");
      eq(after.recipient, before.recipient, "withdrawing rewrote what was typed");

      const shown = flat(r);
      assert(/Withdrawn/.test(shown), "the screen does not say it was withdrawn: " + shown);
      assert(!/Invitations outstanding/.test(shown), "a withdrawn invitation is still outstanding");
      /* AND IT IS KEPT, THOUGH NO LONGER IN THE WAY. Batch 3A folded withdrawn
         history behind a disclosure — it is history, not work — so what this
         test asks is that the rows SURVIVE and are reachable, which is the part
         that was ever worth asserting. */
      clickText(r, "Show");
      const opened = flat(r);
      assert(opened.includes(RECIPIENT), "the withdrawn invitation lost who it was for: " + opened);
      assert(opened.includes(NOTE), "the withdrawn invitation lost its note: " + opened);
    } finally { await close(); }
  });

  test("withdrawing twice is one withdrawal, not an error", async () => {
    const { close, shop, invitations, seatClient } = await connect();
    try {
      const { r } = await shop();
      await invite(r);
      const inv = (await invitations()).slice(-1)[0];

      const seat = seatClient(H.TOKEN);
      await seat.store.load();
      const first = await seat.store.execute(COMMANDS.REVOKE_INVITATION, { invitationId: inv.id });
      eq(first.ok, true, "the first withdrawal was refused");
      const when = (await invitations())[0].revokedAt;
      const second = await seat.store.execute(COMMANDS.REVOKE_INVITATION, { invitationId: inv.id });
      eq(second.ok, true, "withdrawing an already-withdrawn invitation was an error");
      eq((await invitations())[0].revokedAt, when, "the second withdrawal moved the time");
    } finally { await close(); }
  });

  test("another shop's invitation cannot be withdrawn", async () => {
    /* A SECOND TRUSTED PARTNER, not a Collector. A Collector is stopped by the
       seat check before ownership is ever considered, so testing with one
       proves the seat check and nothing about whose invitation this is. */
    const OTHER = "p-southline";
    const { close, shop, world, repository, invitations, accounts, seatClient } = await connect();
    try {
      const seeded = await world();
      await repository.saveWorld({ ...seeded,
        partners: [...seeded.partners, { id: OTHER, name: "Southline Cards" }] });
      await accounts.linkAccount({ subject: "sub-southline", role: "tp", partnerId: OTHER });

      const { r } = await shop();
      await invite(r);
      const inv = (await invitations()).slice(-1)[0];

      const other = seatClient("token-for:sub-southline");
      await other.store.load();
      assert(!JSON.stringify(other.store.get()).includes(inv.id),
        "another shop's invitation is in this shop's projection");

      const answer = await other.store.execute(COMMANDS.REVOKE_INVITATION, { invitationId: inv.id });
      eq(answer.ok, false, "another shop withdrew an invitation that was not theirs");
      eq(answer.refused, "not-owner", "the refusal is not the domain's own");
      eq((await invitations())[0].revokedAt, null, "a refusal still changed the world");
    } finally { await close(); }
  });

  test("a Collector cannot withdraw anything at all", async () => {
    const { close, shop, invitations, accounts, seatClient } = await connect();
    try {
      const { r } = await shop();
      await invite(r);
      const inv = (await invitations()).slice(-1)[0];

      await accounts.linkAccount({ subject: "sub-dana", role: "collector", collectorId: "c-stranger" });
      const stranger = seatClient("token-for:sub-dana");
      await stranger.store.load();
      const answer = await stranger.store.execute(COMMANDS.REVOKE_INVITATION, { invitationId: inv.id });
      eq(answer.ok, false, "a Collector withdrew an invitation");
      eq(answer.refused, "not-owner", "the refusal is not the domain's own");
      eq((await invitations())[0].revokedAt, null, "a refusal still changed the world");
    } finally { await close(); }
  });

  test("withdrawing is an ordinary command and carries no secret back", async () => {
    const { close, shop, app, invitations } = await connect();
    try {
      const sent = [];
      const impl = async (url, init) => {
        if (init && init.method === "POST") sent.push({ url: String(url), body: JSON.parse(init.body) });
        return H.fetchFor(app)(url, init);
      };
      const { r } = await shop(impl);
      await invite(r);
      clickText(r, "Done");
      await press(r, "Withdraw");

      const command = sent.find((s) => s.url.endsWith("/api/commands"));
      assert(command, "withdrawing did not go through the ordinary command route: "
        + sent.map((s) => s.url).join(" | "));
      eq(command.body.command, "revokeCollectorInvitation", "a different command was sent");
      eq(Object.keys(command.body.payload).sort().join(","), "invitationId", "the payload grew a field");
      eq((await invitations())[0].id, command.body.payload.invitationId);
    } finally { await close(); }
  });
});

/* ============================================================== E */
describe("E. the raw API: the old semantics are gone, not merely unreachable", () => {
  /* `POST /api/commands` does not allow-list command names — it takes what the
     domain has. So "the browser no longer asks for that" would have been no fix
     at all: anyone with a token could have asked for it directly. The fix is in
     the domain, and this is where that is proved. */
  test("inviteCollector through the raw command route creates no Collector", async () => {
    const { close, app, world } = await connect();
    try {
      const before = await world();
      const res = await H.fetchFor(app)("http://localhost/api/commands", {
        method: "POST",
        headers: { authorization: `Bearer ${H.TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ command: "inviteCollector",
          payload: { recipient: "Dana", note: "raw" } }),
      });
      eq(res.status, 200, "the raw route refused a command that is still the domain's");

      const after = await world();
      eq(after.collectors.length, before.collectors.length,
        "the raw route created a Collector: " + after.collectors.map((c) => c.id).join(","));
      eq(after.relationships.length, before.relationships.length, "the raw route created a Relationship");
      eq(after.invitations.length, 1, "not exactly one invitation");
      eq(after.invitations[0].collectorId, null, "the raw route created an invitation naming somebody");
    } finally { await close(); }
  });

  test("the old payload shape cannot smuggle the old behaviour back", async () => {
    const { close, app, world } = await connect();
    try {
      /* Every shape the pre-B2 command took, and one invented one. None of them
         may put a person in the world. */
      const attempts = [
        { name: "Dana", email: "dana@example.com" },
        { collectorId: "c-dana", name: "Dana" },
        { recipient: "Dana", collectorId: "c-dana" },
        { email: "dana@example.com" },
      ];
      for (const payload of attempts) {
        await H.fetchFor(app)("http://localhost/api/commands", {
          method: "POST",
          headers: { authorization: `Bearer ${H.TOKEN}`, "content-type": "application/json" },
          body: JSON.stringify({ command: "inviteCollector", payload }),
        });
      }
      const after = await world();
      eq(after.collectors.length, 2, "an old payload shape created a person: "
        + after.collectors.map((c) => c.id).join(","));
      assert(after.invitations.every((i) => i.collectorId === null),
        "an old payload shape resolved an invitation to somebody");
      assert(!JSON.stringify(after.invitations).includes("dana@example.com"),
        "an address the command does not accept was stored anyway");
    } finally { await close(); }
  });

  test("the raw route mints no credential, so a raw invitation is inert", async () => {
    const { close, app, world, credentials } = await connect();
    try {
      await H.fetchFor(app)("http://localhost/api/commands", {
        method: "POST",
        headers: { authorization: `Bearer ${H.TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ command: "inviteCollector", payload: { recipient: "Dana" } }),
      });
      const inv = (await world()).invitations[0];
      assert(inv, "no invitation was created");
      eq(await credentials.findByInvitation(inv.id), null,
        "the ordinary command route minted a credential");
      /* Which is the honest outcome: the command route answers with a
         projection, and a credential must never be in one. An invitation with
         no credential can never be redeemed — it is a row a partner can see and
         withdraw, and nothing else. */
    } finally { await close(); }
  });

  test("the command route's reply never carries a credential field", async () => {
    const { close, app } = await connect();
    try {
      const res = await H.fetchFor(app)("http://localhost/api/commands", {
        method: "POST",
        headers: { authorization: `Bearer ${H.TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ command: "inviteCollector", payload: { recipient: "Dana" } }),
      });
      const body = await res.json();
      assert(!("credential" in body), "the command route answered with a credential");
      assert(!/credential|token|secret/i.test(JSON.stringify(body)),
        "the command route's reply mentions a secret");
    } finally { await close(); }
  });
});

/* ============================================================== F */
describe("F. ambiguity: what the screen says when it cannot know", () => {
  /* THE STAKES ARE HIGHER HERE THAN ANYWHERE ELSE IN THE PRODUCT. The reply is
     the only copy of the credential, so a request whose reply was lost may have
     created an invitation whose secret is already gone forever. The screen must
     not claim either outcome. */
  test("a committed write whose reply is lost is reported as unknown, not as failed", async () => {
    const { close, app, invitations } = await connect();
    try {
      /* The request reaches the real server and really commits; only the reply
         is destroyed. Nothing in the browser can tell this apart from a request
         that never arrived — which is exactly why the copy must not claim. */
      const impl = async (url, init) => {
        const res = await H.fetchFor(app)(url, init);
        if (init && init.method === "POST" && String(url).includes("/api/invitations/")) {
          throw new TypeError("network error");
        }
        return res;
      };
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => H.TOKEN,
        fetchImpl: impl });
      const store = STORE.createProductionStore({ api });
      await store.load();
      const r = render(React.createElement(Live, { store,
        onInvite: COMMANDS.openCollectorInvitation(store),
        onRevokeInvite: COMMANDS.revokeCollectorInvitation(store),
        onRefresh: COMMANDS.refreshView(store) }));
      await invite(r);

      eq((await invitations()).length, 1, "the write did not actually commit, so this proves nothing");
      const shown = flat(r);
      assert(/cannot tell/.test(shown), "the screen claimed to know what happened: " + shown);
      assert(!/nothing was created/.test(shown), "the screen said nothing was created, and it was");
      assert(!shownCredential(r), "a credential was shown for a reply that never arrived");
    } finally { await close(); }
  });

  test("a 200 with no credential is the ambiguous case, not a success", async () => {
    /* THE WORST SHAPE OF ALL. The server committed and said so, and the one
       copy of the secret is not in the reply — so the invitation exists and can
       never be redeemed. A browser that treated this as success would show a
       blank code and a partner would hand over nothing. */
    const { close, app, invitations } = await connect();
    try {
      const impl = async (url, init) => {
        const res = await H.fetchFor(app)(url, init);
        if (init && init.method === "POST" && String(url).includes("/api/invitations/")) {
          const body = await res.json();
          delete body.credential;
          return { status: res.status, async json() { return body; } };
        }
        return res;
      };
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => H.TOKEN,
        fetchImpl: impl });
      const store = STORE.createProductionStore({ api });
      await store.load();
      const r = render(React.createElement(Live, { store,
        onInvite: COMMANDS.openCollectorInvitation(store),
        onRevokeInvite: COMMANDS.revokeCollectorInvitation(store),
        onRefresh: COMMANDS.refreshView(store) }));
      await invite(r);

      eq((await invitations()).length, 1, "the write did not commit, so this proves nothing");
      assert(!shownCredential(r), "an empty credential was presented as one to hand over");
      const shown = flat(r);
      assert(/cannot tell/.test(shown), "a reply with no secret was treated as a success: " + shown);
      assert(/withdraw/i.test(shown), "the partner is not told how to recover: " + shown);
    } finally { await close(); }
  });

  test("the copy for an ambiguous failure claims neither outcome", () => {
    /* Read from the real module, so a rewrite that reintroduces the claim fails
       here even if no test drove that exact path. */
    for (const [failure, sentence] of Object.entries(NETWORK.AMBIGUOUS)) {
      assert(/cannot tell/.test(sentence), `${failure} claims to know: ${sentence}`);
      assert(!/nothing was created|was not created|no invitation was created/i.test(sentence),
        `${failure} claims nothing happened: ${sentence}`);
      assert(/not been sent again|has not been sent again/i.test(sentence),
        `${failure} does not say it was not retried: ${sentence}`);
      assert(/withdraw/i.test(sentence), `${failure} offers no way out: ${sentence}`);
    }
    /* And the certain ones DO say it, because they are answers. */
    for (const [failure, sentence] of Object.entries(NETWORK.CERTAIN)) {
      assert(/nothing was created/.test(sentence), `${failure} does not say it is certain: ${sentence}`);
    }
    /* The two sets do not overlap, and a 5xx is ambiguous rather than certain. */
    const certain = Object.keys(NETWORK.CERTAIN);
    const ambiguous = Object.keys(NETWORK.AMBIGUOUS);
    eq(certain.filter((k) => ambiguous.includes(k)).join(","), "",
      "a failure is both certain and ambiguous");
    assert(ambiguous.includes("unavailable"), "a lost connection is treated as an answer");
    assert(ambiguous.includes("unexpected"), "an unreadable reply is treated as an answer");
  });

  test("an ambiguous failure re-reads, and re-reading is a GET", async () => {
    const { close, app } = await connect();
    try {
      const calls = [];
      let failNext = true;
      const impl = async (url, init) => {
        calls.push({ url: String(url), method: (init && init.method) || "GET" });
        if (failNext && init && init.method === "POST" && String(url).includes("/api/invitations/")) {
          failNext = false;
          /* The request really lands: the world moves, and only the reply is
             lost. This is the case that must not be replayed. */
          await H.fetchFor(app)(url, init);
          throw new TypeError("network error");
        }
        return H.fetchFor(app)(url, init);
      };
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => H.TOKEN,
        fetchImpl: impl });
      const store = STORE.createProductionStore({ api });
      await store.load();
      const r = render(React.createElement(Live, { store,
        onInvite: COMMANDS.openCollectorInvitation(store),
        onRevokeInvite: COMMANDS.revokeCollectorInvitation(store),
        onRefresh: COMMANDS.refreshView(store) }));
      calls.length = 0;
      await invite(r);

      const posts = calls.filter((c) => c.method === "POST" && c.url.includes("/api/invitations/"));
      eq(posts.length, 1, "the write was replayed after an ambiguous failure");
      const gets = calls.filter((c) => c.method !== "POST");
      assert(gets.length >= 1, "nothing was re-read after an ambiguous failure");

      const shown = flat(r);
      assert(/cannot tell/.test(shown), "the screen claimed to know: " + shown);
      /* The re-read is what makes the advice actionable: the invitation the
         partner cannot see the code for IS on screen, and can be withdrawn. */
      assert(/Invitations outstanding/.test(shown), "the re-read did not show what exists: " + shown);
      assert(clickable(r, "Withdraw"), "there is no way to undo what may have happened");
      assert(!shownCredential(r), "a credential was shown for a reply that never arrived");
    } finally { await close(); }
  });

  test("a draft survives a failure, so nothing a person typed is lost", async () => {
    const { close, app } = await connect();
    try {
      const impl = async (url, init) => {
        if (init && init.method === "POST" && String(url).includes("/api/invitations/")) {
          throw new TypeError("network error");
        }
        return H.fetchFor(app)(url, init);
      };
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => H.TOKEN,
        fetchImpl: impl });
      const store = STORE.createProductionStore({ api });
      await store.load();
      const r = render(React.createElement(Live, { store,
        onInvite: COMMANDS.openCollectorInvitation(store),
        onRevokeInvite: COMMANDS.revokeCollectorInvitation(store),
        onRefresh: COMMANDS.refreshView(store) }));
      await invite(r);
      eq(field(r, "Who is this for").props.value, RECIPIENT, "the draft was thrown away on failure");
      eq(field(r, "Note").props.value, NOTE, "the note was thrown away on failure");
    } finally { await close(); }
  });

  test("pressing create twice sends one request", async () => {
    const { close, app } = await connect();
    try {
      let posts = 0;
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const impl = async (url, init) => {
        if (init && init.method === "POST") { posts += 1; await gate; }
        return H.fetchFor(app)(url, init);
      };
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => H.TOKEN,
        fetchImpl: impl });
      const store = STORE.createProductionStore({ api });
      await store.load();
      const r = render(React.createElement(Live, { store,
        onInvite: COMMANDS.openCollectorInvitation(store),
        onRevokeInvite: COMMANDS.revokeCollectorInvitation(store),
        onRefresh: COMMANDS.refreshView(store) }));
      clickText(r, "Invite a collector");
      typeInto(r, "Who is this for", RECIPIENT);
      const form = r.root.findAll((n) => n.type === "form")[0];
      let a; let b;
      TR.act(() => { a = form.props.onSubmit({ preventDefault() {} }); });
      TR.act(() => { b = form.props.onSubmit({ preventDefault() {} }); });
      release();
      await TR.act(async () => { await Promise.all([a, b]); });
      eq(posts, 1, `${posts} invitations were created by one press of one button`);
    } finally { await close(); }
  });
});

/* ============================================================== G */
describe("G. the boundary the control reaches through", () => {
  test("the section holds no store, no command name and no network", () => {
    const bare = code("client/tp/sections/CollectorNetwork.jsx");
    assert(!/\bfetch\s*\(|XMLHttpRequest|EventSource|WebSocket/.test(bare), "the section reaches the network");
    assert(!/store\.|createApiClient|createProductionStore|session\./.test(bare),
      "the section holds a store, a session or an api client");
    assert(!/inviteCollector|revokeCollectorInvitation|updatePartnerProfile|execute\s*\(/.test(bare),
      "the section names a command");
    assert(!/api\/|\/api/.test(bare), "the section names a route");
    assert(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(bare),
      "the section persists the credential somewhere it can be read again");
  });

  test("the command names live in exactly one file", () => {
    const commands = code("client/commands.js");
    assert(/revokeCollectorInvitation/.test(commands), "the withdraw command is not named here");
    const browserFiles = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.jsx?$/.test(e.name) && rel !== "client/commands.js") browserFiles.push(rel);
      }
    };
    walk("client");
    for (const rel of browserFiles) {
      /* api.js may name the ROUTE — that is its job — but nothing but
         commands.js may name a command. */
      assert(!/"inviteCollector"|'inviteCollector'|"revokeCollectorInvitation"|'revokeCollectorInvitation'/
        .test(code(rel)), `${rel} names a command`);
    }
  });

  test("SignIn binds the callbacks and hands them on, and hands on nothing else", () => {
    const bare = code("client/sign-in/SignIn.jsx");
    assert(/openCollectorInvitation\(store\)/.test(bare), "the invite callback is not bound from the store");
    assert(/revokeCollectorInvitation\(store\)/.test(bare), "the withdraw callback is not bound");
    assert(/refreshView\(store\)/.test(bare), "the re-read callback is not bound");
    const handed = (bare.match(/ProductionApp,\s*\{([\s\S]*?)\}\)/) || [])[1] || "";
    assert(handed, "ProductionApp is no longer handed props this test can read");
    assert(!/\bstore\b/.test(handed), "the store itself crossed into the application");
    assert(!/\bsession\b/.test(handed), "the session crossed into the application");
    assert(!/\bapi\b/.test(handed), "the api client crossed into the application");
  });

  test("handed no callback, the section offers no way to invite or withdraw", () => {
    const Section = NETWORK.default;
    const state = { collectors: [], relationships: [], invitations: [
      { id: "inv-1", partnerId: H.PARTNER, collectorId: null, at: "2030-01-01T00:00:00.000Z",
        expiresAt: "2030-01-15T00:00:00.000Z", acceptedAt: null, revokedAt: null,
        recipient: "Dana", note: null }] };
    const r = render(React.createElement(Section, { state }));
    assert(!clickable(r, "Invite a collector"), "an invite control with nothing behind it");
    assert(!clickable(r, "Withdraw"), "a withdraw control with nothing behind it");
    /* And it still renders what it was given. */
    assert(/Dana/.test(flat(r)), "the invitation it was handed is not on screen: " + flat(r));
  });

  test("the projection handed in is never edited", async () => {
    const { close, shop } = await connect();
    try {
      const { r, store: s } = await shop();
      const pristine = JSON.stringify(s.get());
      clickText(r, "Invite a collector");
      typeInto(r, "Who is this for", RECIPIENT);
      clickText(r, "Cancel");
      eq(JSON.stringify(s.get()), pristine, "the section edited the projection it was given");
    } finally { await close(); }
  });

  test("cancelling sends nothing and creates nothing", async () => {
    const { close, shop, invitations, app } = await connect();
    try {
      const sent = [];
      const { r } = await shop(async (url, init) => {
        if (init && init.method === "POST") sent.push(String(url));
        return H.fetchFor(app)(url, init);
      });
      clickText(r, "Invite a collector");
      typeInto(r, "Who is this for", RECIPIENT);
      typeInto(r, "Note", NOTE);
      clickText(r, "Cancel");
      eq(sent.length, 0, "cancelling sent " + sent.join(", "));
      eq((await invitations()).length, 0, "cancelling created an invitation");
    } finally { await close(); }
  });
});

/* ============================================================== H */
describe("H. nothing in this build can redeem anything", () => {
  test("claim has exactly one caller, and it is the acceptance transaction", () => {
    const server = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.js$/.test(e.name)) server.push(rel);
      }
    };
    walk("server");
    /* Partner invitations have their own directory and their own `claim`, which
       registration has always called — a different table, a different
       lifecycle. The question here is about the COLLECTOR credential directory:
       who imports it, and what do they do with it.

       BATCH 2 SAID "NOBODY MAY SPEND ONE"; BATCH 3A SAYS "EXACTLY ONE THING
       MAY". That is the change the batch exists to make, and the assertion that
       survives it is the narrower one: spending a credential happens in one
       place, inside the transaction that also creates the Relationship — never
       from a route, a command, or anywhere a second rule could be forgotten. */
    const MODULE = "server/auth/collector-invitations.js";
    const importers = server.filter((rel) => rel !== MODULE)
      .filter((rel) => /collector-invitations/.test(code(rel)));
    eq(importers.sort().join(","), "server/index.js",
      "the credential directory is reached from somewhere unexpected");
    /* index.js hands it to createApp; app.js receives it by name and passes it
       on. Neither spends it — a route that could would be a route that had to
       remember the canonical rules for itself. */
    for (const rel of ["server/index.js", "server/app.js", "server/collector-invitation.js"]) {
      const bare = code(rel);
      assert(!/collectorCredentials\.claim|credentials\.claim\s*\(/.test(bare),
        `${rel} can spend a credential`);
    }
    const spenders = server.filter((rel) => rel !== MODULE)
      .filter((rel) => /credentials\.claim\s*\(/.test(code(rel)));
    eq(spenders.join(","), "server/collector-acceptance.js",
      "a credential is spendable from somewhere other than the acceptance transaction");
    /* And where it is spent, the canonical invitation is checked in the same
       breath — which is the rule the credential directory's own header states
       and cannot enforce. */
    const spender = code("server/collector-acceptance.js");
    assert(/lockWorld\(tx\)/.test(spender) && /loadWorld\(tx\)/.test(spender),
      "the spender does not read the canonical world in its own transaction");
    assert(/acceptCollectorInvitation|accept\(world/.test(spender),
      "the spender does not put the canonical invitation through the domain");
    /* THE THREE-ROUTE CONTRACT (widened deliberately in Phase 5 Batch 3D).

       Batch 2 asserted there was no route that redeems; Batch 3A made it one,
       and said that one was the authenticated acceptance — "not a preview, not
       a lookup, not anything that would describe an invitation to somebody who
       submitted a guess".

       Batch 3D added exactly such a lookup, on purpose, and the reasoning is in
       server/app.js beside it: the credential is 160 bits, the invitation email
       has named the shop since 3B-2, the QR is handed over in person since 3C,
       and acceptance was already an oracle. What the lookup adds is asking
       without spending — and what it may disclose is one name.

       So the pin is not loosened, it is restated. THREE routes touch an
       invitation, each with one power, and a fourth still fails here:

         create   authenticated, and the only one that mints a credential
         context  unauthenticated, read-only, and discloses one name
         accept   authenticated, and the only one that redeems

       The narrower claim — that only ONE of them can spend a credential — is
       the `claim has exactly one caller` test above, which is where it belongs. */
    const routes = server.map(code).join("\n").match(/["'`]\/api\/[^"'`]*["'`]/g) || [];
    /* `context` WAS DROPPED FROM THIS FILTER IN BATCH 5, and the set it
       produces is unchanged. It was there to catch
       `/api/invitations/collector/context`, which the `/api/invitations` prefix
       already catches; all it did besides was match any route with the word
       "context" in it, and Batch 5's card browsing is `/api/card-contexts`. A
       filter that names invitation routes by their prefix is tighter than one
       that guesses from a word, and a fourth INVITATION route still fails. */
    const touching = [...new Set(routes.filter((r) => /redeem|accept|claim|join|\/api\/invitations/i.test(r)))];
    eq(touching.sort().join(","),
      ['"/api/invitations/collector"', '"/api/invitations/collector/accept"',
        '"/api/invitations/collector/context"'].join(","),
      "a route touching invitations appeared that this batch did not design");
  });

  test("accepting an invitation is not a command this build has", () => {
    const commands = code("domain/metyet-commands.js");
    assert(!/\bredeemInvitation\b|\bacceptCollectorInvitation\b|\bjoinNetwork\b/.test(commands),
      "a redemption command was added ahead of its batch");
    /* And nothing sets acceptedAt on a Collector invitation. */
    const sets = commands.match(/acceptedAt:\s*[^,\n]+/g) || [];
    for (const s of sets) {
      assert(/acceptedAt:\s*null/.test(s) || /acceptedAt:\s*(i|inv|r)\.acceptedAt/.test(s),
        "something in the domain accepts an invitation: " + s);
    }
  });

  test("the invitation an unresolved row describes still validates as a world", async () => {
    const { close, shop, repository, world } = await connect();
    try {
      const { r } = await shop();
      await invite(r);
      /* The round trip through the repository is the real test: a world with an
         invitation that names nobody must load, validate and save again. */
      const loaded = await world();
      await repository.saveWorld(loaded);
      const again = await world();
      eq(again.invitations.length, 1, "the invitation did not survive a round trip");
      eq(again.invitations[0].collectorId, null, "the round trip invented a Collector");
    } finally { await close(); }
  });

  test("a resolved invitation still persists who resolved it", async () => {
    /* `collectorId` became nullable in this batch, which is the change that
       makes an unresolved invitation representable. The field itself is what
       Batch 3's redemption will write, so it has to survive a round trip when
       it IS set — and nothing in this build can set it, so it is seeded. That
       is test provisioning, not a lifecycle, and it closes no gap. */
    const { close, repository, world, raw } = await connect();
    try {
      const seeded = await world();
      await repository.saveWorld({ ...seeded,
        invitations: [{ id: "inv-seeded", partnerId: H.PARTNER, collectorId: H.COLLECTOR,
          at: "2030-01-01T00:00:00.000Z", expiresAt: "2030-01-15T00:00:00.000Z",
          acceptedAt: "2030-01-02T00:00:00.000Z", revokedAt: null,
          recipient: "Casey", note: null }] });
      const back = await world();
      eq(back.invitations.length, 1, "the seeded invitation did not survive");
      eq(back.invitations[0].collectorId, H.COLLECTOR,
        "a resolved invitation forgot who resolved it, which is what redemption writes");
      eq(back.invitations[0].acceptedAt, "2030-01-02T00:00:00.000Z", "the acceptance was lost");

      /* AND IT IS IN THE COLUMN, not only in the record's attributes. The
         column is what the database itself can act on — a foreign key, an
         index, a constraint — and it is the difference between a resolved
         invitation the database understands and one only the application
         does. A round trip through `attrs` alone would satisfy the assertions
         above and leave the column empty. */
      const rows = await raw(
        "select id, collector_id from metyet.invitations where id = $1", ["inv-seeded"]);
      eq(rows.length, 1, "the invitation is not a row");
      eq(rows[0].collector_id, H.COLLECTOR, "the resolved Collector is not in the column");

      /* And the unresolved case is a NULL there, which is the whole reason the
         column stopped being NOT NULL in this batch's migration. */
      await repository.saveWorld({ ...back,
        invitations: [{ ...back.invitations[0], id: "inv-open", collectorId: null,
          acceptedAt: null }] });
      const open = await raw("select collector_id from metyet.invitations where id = $1", ["inv-open"]);
      eq(open.length, 1, "the unresolved invitation is not a row");
      eq(open[0].collector_id, null, "an invitation that names nobody has somebody in the column");
    } finally { await close(); }
  });
});

if (require.main === module) run();
module.exports = { run };
