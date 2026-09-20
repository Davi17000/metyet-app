/* ============================================================================
   PHASE 5 BATCH 3B-2 — MetYet SENDS THE INVITATION

   Batch 2 created an invitation and handed its one credential to the Trusted
   Partner. Batch 3B-1 made the link in that credential work. This batch lets
   MetYet carry the link to somebody, and everything here is about the two
   things that makes newly possible to get wrong:

     AN ADDRESS COULD BECOME AN IDENTITY. It must not. Where MetYet sends an
     invitation decides nothing about who may accept it; the person signs in
     with any address they can receive mail at, and nothing anywhere compares
     the two. Section B exists for that one property.

     A SEND COULD BE CLAIMED WITHOUT EVIDENCE. It must not. `sent` is written
     only when the provider said so. A provider that refused, a connection that
     died, an outcome that could not be written — each leaves the truth as it
     actually is, and the partner resolves it by REPLACING the invitation, which
     kills the old code. Section C exists for that one property.

   No provider is contacted. The mailer is injected, as every suite in this
   repository injects the identity provider, and a test that reached a real one
   would be a test that could send mail to a stranger.

   Everything else is real: the real routes, the real transaction, the real
   credential directory, the real migrated Postgres, the real section, the real
   store and the real api client.
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
const NETWORK = load("client/tp/sections/CollectorNetwork.jsx");
const { createApp } = require("../server/app.js");
const { createResendMailer, FAILURES, ANSWERED, ENDPOINT } = require("../server/mail/resend.js");
const { buildInvitationEmail, SOMEBODY } = require("../server/collector-invitation-email.js");
const { loadServerConfig } = require("../server/config.js");
const H = require("./helpers/command-server.cjs");

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
const clickable = (r, label) => labels(r).some((l) => l.includes(label));
const field = (r, label) => {
  const all = r.root.findAll((n) => n.type === "label");
  const lab = all.find((n) => instText(n).startsWith(label));
  assert(lab, `no field "${label}" among: ${all.map(instText).join(" | ")}`);
  const input = lab.findAll((n) => n.type === "input" || n.type === "textarea")[0];
  assert(input, `field "${label}" has nothing to type into`);
  return input;
};
const hasField = (r, label) => r.root.findAll((n) => n.type === "label")
  .some((n) => instText(n).startsWith(label));
const typeInto = (r, label, value) => {
  TR.act(() => { field(r, label).props.onChange({ target: { value } }); });
};
const submit = async (r) => {
  const form = r.root.findAll((n) => n.type === "form")[0];
  assert(form, "the form is not on screen");
  await TR.act(async () => { await form.props.onSubmit({ preventDefault() {} }); });
};

/* ------------------------------------------------------------ the provider

   A MAIL PROVIDER THAT IS NOT ONE. It records what it was asked to send and
   answers however the test needs. Nothing leaves this process. */
const fakeMailer = (answer = () => ({ ok: true })) => {
  const sent = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
      return answer(message, sent.length);
    },
  };
};

const APP_URL = "https://app.metyet.test";
const ADDRESS = "dana@example.test";
const SHOP = "Northline Cards";

/* --------------------------------------------------------------- the world */

const connect = async ({ mailer = fakeMailer(), appUrl = APP_URL, ...opts } = {}) => {
  const { app, close, repository, accounts, db, credentials } =
    await H.serve(createApp, { collectorCredentials: true, mailer, appUrl, ...opts });

  /* The shop has a name, in the canonical world, where the email must read it
     from and nowhere else. */
  const seeded = await repository.loadWorld();
  await repository.saveWorld({
    ...seeded,
    partners: seeded.partners.map((p) => (p.id === H.PARTNER ? { ...p, name: SHOP } : p)),
  });

  const f = H.fetchFor(app);
  const post = (route, token, body, headers = {}) => f(`http://localhost${route}`, {
    method: "POST",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  const invite = async (body = {}, token = H.TOKEN, headers = {}) => {
    const res = await post("/api/invitations/collector", token,
      { recipient: "Dana at the Tuesday show", note: null, ...body }, headers);
    return { status: res.status, body: await res.json() };
  };
  const accept = async (credential, token) => {
    const res = await post("/api/invitations/collector/accept", token, { token: credential });
    return { status: res.status, body: await res.json() };
  };
  const command = async (name, payload, token = H.TOKEN) => {
    const res = await post("/api/commands", token, { command: name, payload });
    return { status: res.status, body: await res.json() };
  };
  const view = async (token) => {
    const res = await f("http://localhost/api/view", { headers: { authorization: `Bearer ${token}` } });
    return { status: res.status, body: await res.json() };
  };
  const world = () => repository.loadWorld();
  const raw = async (sql, params = []) =>
    db.transaction(async (t) => (await t.query(sql, params)).rows, { readOnly: true });
  const rowFor = async (invitationId) =>
    (await raw("select * from metyet_auth.collector_invitation_credentials where invitation_id = $1",
      [invitationId]))[0] || null;

  return { app, close, repository, accounts, db, credentials, mailer, f, post, invite, accept,
    command, view, world, raw, rowFor };
};

/* Somebody MetYet has never seen, signing in under their own address — which is
   not the address anything was sent to, and never has to be. */
const DANA = "sub-dana";
const DANA_TOKEN = `token-for:${DANA}`;

/* ============================================================== A
   MetYet SENDS IT, ONCE, AND ONLY AFTER THE INVITATION EXISTS         */
describe("A. the send", () => {
  test("an invitation with an address is sent exactly once, and only after it is committed", async () => {
    /* THE ORDER IS THE PROPERTY, so the order is what is recorded. The world
       transaction says when it began and when it returned; the provider says
       when it was asked. A send from inside that transaction would be holding
       the global world lock while a third party thought about it — and would
       have to be undone if the commit then failed, which nothing can do to an
       email. Asserted as a sequence rather than by reading the database from
       inside the provider, because under the mutation that read would queue
       behind the very lock it is trying to prove is held. */
    const order = [];
    const { close, invite, mailer, world } = await connect({
      repositoryWrapper: (base) => ({
        ...base,
        withTransaction: async (fn, opts) => {
          order.push("transaction:begin");
          try { return await base.withTransaction(fn, opts); }
          finally { order.push("transaction:end"); }
        },
      }),
      mailer: fakeMailer(() => { order.push("provider"); return { ok: true }; }),
    });
    try {
      const { status, body } = await invite({ email: ADDRESS });
      eq(status, 200, "the invitation was not created");
      eq(mailer.sent.length, 1, `${mailer.sent.length} provider requests for one invitation`);
      const wrote = order.indexOf("transaction:end");
      const asked = order.indexOf("provider");
      assert(wrote >= 0 && asked > wrote,
        "the provider was asked before the transaction finished: " + order.join(" → "));
      eq((await world()).invitations.length, 1, "the invitation did not survive the send");
      eq(body.delivery.state, "sent", "the reply did not report the send");
      eq(body.delivery.to, ADDRESS, "the reply named a different address");
    } finally { await close(); }
  });

  test("it goes to the address that was given, normalised", async () => {
    const { close, invite, mailer, rowFor } = await connect();
    try {
      const { body } = await invite({ email: "  Dana@Example.TEST  " });
      eq(mailer.sent[0].to, ADDRESS, "the provider was given something other than the address");
      eq(body.delivery.to, ADDRESS, "the reply reported a different address");
      eq((await rowFor(body.invitationId)).delivered_to, ADDRESS, "a different address was recorded");
    } finally { await close(); }
  });

  test("the message carries the link and the bare code, and nothing that tracks anybody", async () => {
    const { close, invite, mailer } = await connect();
    try {
      const { body } = await invite({ email: ADDRESS });
      const message = mailer.sent[0];
      const text = message.text;
      assert(text.includes(`${APP_URL}/join#${body.credential}`),
        "the message does not carry the B3B-1 link");
      /* And the code on its own, for somebody reading on a phone who will
         finish on a laptop. It is in the link already, so this adds nothing. */
      assert(new RegExp(`(^|\\s)${body.credential}(\\s|$)`, "m").test(text),
        "the message does not carry the bare code");
      assert(!/<img|1x1\.|pixel|utm_|\/track|\?track|click\?|open\.gif/i.test(`${text}${message.subject}`),
        "the message carries something that would report when it was read");
      assert(!message.html, "an html part appeared, and with it somewhere for a pixel to live");
    } finally { await close(); }
  });

  test("the shop's name comes from the canonical world, and cannot be claimed by the browser", async () => {
    const { close, invite, mailer } = await connect();
    try {
      /* A recipient hint that would very much like to be the shop's name. */
      await invite({ email: ADDRESS, recipient: "Southline Cards — your account is suspended" });
      eq(mailer.sent[0].subject, `${SHOP} invited you to MetYet`,
        "the subject took a name from somewhere other than the world");
      assert(!mailer.sent[0].text.includes("suspended"),
        "the recipient hint reached the message");

      /* And there is no field to put one in. */
      const claimed = await invite({ email: ADDRESS, partnerName: "Southline Cards" });
      eq(claimed.status, 400, "the route accepted a shop name from the browser");
      eq(mailer.sent.length, 1, "a refused request still asked the provider");
    } finally { await close(); }
  });

  test("an invitation with no address sends nothing, and is the invitation Batch 2 shipped", async () => {
    const { close, invite, mailer, rowFor } = await connect();
    try {
      const { status, body } = await invite();
      eq(status, 200, "the manual invitation broke");
      eq(mailer.sent.length, 0, "a provider was asked about an invitation nobody asked to send");
      eq(body.delivery.requested, false, "the reply claimed a delivery");
      assert(body.credential, "the credential did not come back");
      const row = await rowFor(body.invitationId);
      eq(row.delivery_requested_at, null, "a delivery was recorded for an invitation with no address");
      eq(row.delivered_to, null, "an address was recorded where none was given");
    } finally { await close(); }
  });

  test("a replacement is sent under its own idempotency key", async () => {
    /* A KEY THAT NAMED THE PERSON WOULD SWALLOW THE REPLACEMENT. A repeated key
       returns the provider's cached answer instead of sending; since a
       replacement exists precisely because the first send did not arrive, a key
       shared between them would suppress the one send that mattered. */
    const { close, invite, mailer } = await connect();
    try {
      const first = await invite({ email: ADDRESS });
      const second = await invite({ email: ADDRESS });
      const keys = mailer.sent.map((m) => m.idempotencyKey);
      assert(keys[0] && keys[1], "a send went out with no idempotency key");
      assert(keys[0] !== keys[1], `both sends used the same key: ${keys[0]}`);
      assert(keys[0].includes(first.body.invitationId) && keys[1].includes(second.body.invitationId),
        "the key is not the issuance's own");
    } finally { await close(); }
  });
});

/* ============================================================== B
   THE ADDRESS IS A DESTINATION AND NEVER AN IDENTITY                 */
describe("B. where it was sent decides nothing", () => {
  test("a person signing in under a different address redeems the invitation", async () => {
    /* The whole of the batch's central risk, in one test. MetYet emailed
       dana@example.test; the person who accepts is authenticated as somebody
       else entirely, and that is not merely tolerated — it is the design. */
    const { close, invite, accept, world } = await connect();
    try {
      const before = await world();
      const { body } = await invite({ email: ADDRESS });
      const redeemed = await accept(body.credential, DANA_TOKEN);
      eq(redeemed.status, 200, "the invitation refused the person it was sent to find");
      const after = await world();
      eq(after.relationships.length, before.relationships.length + 1, "no relationship came of it");
      eq(after.collectors.length, before.collectors.length + 1, "no collector came of it");
    } finally { await close(); }
  });

  test("nothing in the product compares an authenticated address with a delivery address", () => {
    /* Structural, because a behavioural test can only prove the pairs it tried.
       The acceptance path is read directly: it has no word for an address. */
    const acceptance = code("server/collector-acceptance.js");
    assert(!/email|delivered_to|deliveredTo|address/i.test(acceptance),
      "the acceptance transaction learned about addresses");
    const domain = code("domain/metyet-registration.js");
    assert(!/email|address/i.test(domain), "the domain operation learned about addresses");
    /* And the directory's claim does not read one either: it matches a digest. */
    const claim = (code("server/auth/collector-invitations.js").match(/const CLAIM = `[\s\S]*?`/) || [])[0];
    assert(claim && /token_digest = \$1/.test(claim), "claiming no longer matches on the digest alone");
    assert(!/delivered_to\s*=\s*\$/.test(claim.replace(/delivered_to = null/g, "")),
      "claiming compares the address it was sent to");
  });

  test("the delivery address is in neither seat's projection, and not in the world", async () => {
    const { close, invite, accept, view, world } = await connect();
    try {
      const { body } = await invite({ email: ADDRESS });
      const partner = await view(H.TOKEN);
      assert(!JSON.stringify(partner.body.state).includes(ADDRESS),
        "the partner's projection carries the delivery address");
      assert(!JSON.stringify(await world()).includes(ADDRESS),
        "the canonical world carries the delivery address");

      await accept(body.credential, DANA_TOKEN);
      const collector = await view(DANA_TOKEN);
      assert(!JSON.stringify(collector.body.state).includes(ADDRESS),
        "the collector's projection carries the delivery address");
      assert(!JSON.stringify(await world()).includes(ADDRESS),
        "acceptance put the delivery address into the world");
    } finally { await close(); }
  });

  test("the credential is in the message and in the reply, and in storage only as its digest", async () => {
    const { close, invite, raw, world } = await connect();
    try {
      const { body } = await invite({ email: ADDRESS });
      /* Both shapes of invitation, because the columns a send writes are also
         the columns a plaintext could hide in. */
      const manual = await invite();
      const rows = await raw("select * from metyet_auth.collector_invitation_credentials");
      const stored = JSON.stringify(rows);
      assert(!stored.includes(body.credential), "the plaintext credential is in the credential table");
      assert(!stored.includes(manual.body.credential),
        "the plaintext credential of an invitation nobody sent is in the credential table");
      assert(!JSON.stringify(await world()).includes(body.credential),
        "the plaintext credential is in the canonical world");
      const crypto = require("crypto");
      const digest = crypto.createHash("sha256").update(body.credential, "utf8").digest("hex");
      assert(rows.some((r) => r.token_digest === digest),
        "what is stored is not the digest of what was handed over");
    } finally { await close(); }
  });
});

/* ============================================================== C
   WHAT MetYet SAYS WHEN THE SEND DID NOT WORK                        */
describe("C. truth about a send", () => {
  test("a provider that refuses does not undo the invitation", async () => {
    const { close, invite, accept, world, rowFor } = await connect({
      mailer: fakeMailer(() => ({ ok: false, failure: FAILURES.rejected })),
    });
    try {
      const { status, body } = await invite({ email: ADDRESS });
      eq(status, 200, "a refused send failed the request");
      const invitations = (await world()).invitations;
      eq(invitations.length, 1, "the invitation was rolled back by a refused send");
      /* AND IT IS STILL AN OFFER. Undoing it "helpfully" — deleting it, or
         withdrawing it because the email bounced — would take away the thing
         the partner still has: a live invitation whose code is on their screen
         and can be handed over by any other means. */
      eq(invitations[0].revokedAt, null, "a refused send withdrew the invitation");
      assert(body.credential, "the credential was withheld from an invitation that exists");
      assert(await rowFor(body.invitationId), "the credential row went with the failed send");
      eq((await accept(body.credential, DANA_TOKEN)).status, 200,
        "the invitation that survived a refused send cannot be redeemed");
    } finally { await close(); }
  });

  test("a refusal is recorded as a category of ours, and never as a send", async () => {
    const { close, invite, rowFor } = await connect({
      mailer: fakeMailer(() => ({ ok: false, failure: FAILURES.rejected })),
    });
    try {
      const { body } = await invite({ email: ADDRESS });
      eq(body.delivery.state, "failed", "a refusal was reported as something else");
      eq(body.delivery.failure, "rejected", "the reply did not name our own category");
      const row = await rowFor(body.invitationId);
      eq(row.delivered_at, null, "a refused send was recorded as delivered");
      eq(row.delivery_error, "rejected", "the refusal was not recorded");
      assert(row.delivery_requested_at, "the intent to send was not recorded");
    } finally { await close(); }
  });

  test("a connection that died leaves the outcome unknown, and says so", async () => {
    /* THE HONEST STATE. Nobody can tell whether the message went, so nothing is
       written and nothing is claimed — not success, and not failure either. */
    const { close, invite, rowFor } = await connect({
      mailer: fakeMailer(() => ({ ok: false, failure: FAILURES.unreachable })),
    });
    try {
      const { body } = await invite({ email: ADDRESS });
      eq(body.delivery.state, "unconfirmed", "an unanswered send was reported as an outcome");
      const row = await rowFor(body.invitationId);
      eq(row.delivered_at, null, "an unanswered send was recorded as delivered");
      eq(row.delivery_error, null, "an unanswered send was recorded as a refusal");
      assert(row.delivery_requested_at, "the intent to send was lost with the answer");
    } finally { await close(); }
  });

  test("a provider that answers 429 did not take it, and that IS an outcome", async () => {
    const { close, invite, rowFor } = await connect({
      mailer: fakeMailer(() => ({ ok: false, failure: FAILURES.unavailable })),
    });
    try {
      const { body } = await invite({ email: ADDRESS });
      eq(body.delivery.state, "failed", "an answered refusal was reported as unknown");
      eq((await rowFor(body.invitationId)).delivery_error, "unavailable", "the outcome was not recorded");
    } finally { await close(); }
  });

  test("a send that could not be recorded is never reported as a send", async () => {
    /* The provider accepted it and the write that would remember that failed.
       Durable state says "requested, outcome unknown", so the answer does too:
       a screen that said `sent` over a row that says otherwise is two answers
       to one question, and the weaker one is the true one. */
    const { close, invite, credentials, rowFor } = await connect();
    const recordDelivery = credentials.recordDelivery.bind(credentials);
    credentials.recordDelivery = async () => { throw new Error("the outcome could not be written"); };
    try {
      const { status, body } = await invite({ email: ADDRESS });
      eq(status, 200, "a failed outcome write failed the request");
      eq(body.delivery.state, "unconfirmed", "a send nobody could record was claimed anyway");
      const row = await rowFor(body.invitationId);
      eq(row.delivered_at, null, "a durable claim of delivery appeared from nowhere");
      eq(row.delivery_error, null, "a durable failure appeared from nowhere");
    } finally { credentials.recordDelivery = recordDelivery; await close(); }
  });

  test("the provider's own words are never returned, logged or stored", async () => {
    /* A PROVIDER'S ERROR BODY CAN QUOTE BACK THE REQUEST THAT CAUSED IT, and
       that request carried the credential. So the adapter reads a status and
       nothing else — proved here by answering with a body that contains the
       secret and then looking everywhere it could have gone. */
    const secret = "CREDENTIAL-THAT-MUST-NOT-ESCAPE";
    const logged = [];
    const mailer = createResendMailer({
      apiKey: "not-a-real-key", from: "MetYet <invitations@metyet.test>",
      fetchImpl: async () => ({
        status: 422,
        async text() { logged.push("text"); return `invalid: ${secret}`; },
        async json() { logged.push("json"); return { message: `invalid: ${secret}` }; },
      }),
    });
    const answer = await mailer.send({ to: ADDRESS, subject: "s", text: "t" });
    eq(answer.ok, false, "a 422 read as a success");
    eq(answer.failure, "rejected", "a 422 is not the provider refusing it");
    eq(JSON.stringify(answer), '{"ok":false,"failure":"rejected"}', "the answer carries more than a word");
    eq(logged.length, 0, `the adapter read the provider's body (${logged.join()})`);

    /* And structurally: nothing in the adapter can read a body at all. */
    const adapter = code("server/mail/resend.js");
    assert(!/\.text\(\)|\.json\(\)|response\.body|await res\b/.test(adapter),
      "the adapter reads the provider's body");
    assert(!/console\.|log\./.test(adapter), "the adapter logs");
    /* Nor may the route log an address, a credential or anything a provider said. */
    const route = code("server/app.js");
    const logs = route.match(/request\.log\.[a-z]+\([\s\S]{0,160}?\)/g) || [];
    for (const line of logs) {
      assert(!/deliverTo|credential|result\.token|sent\.failure|error\.message/.test(line),
        "a log line carries something it must not: " + line.replace(/\s+/g, " ").slice(0, 120));
    }
  });
});

/* ============================================================== D
   THERE IS NO RESEND. THERE IS REPLACE.                              */
describe("D. replacing an invitation", () => {
  /* The screen, wired to the real server exactly as SignIn wires it. */
  const screen = async (opts = {}) => {
    const ctx = await connect(opts);
    const calls = [];
    const api = API.createApiClient({
      baseUrl: "http://localhost",
      getToken: async () => H.TOKEN,
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), method: (init && init.method) || "GET",
          body: init && init.body ? JSON.parse(init.body) : null });
        return ctx.f(url, init);
      },
    });
    const store = STORE.createProductionStore({ api });
    await store.load();
    const seat = {
      onInvite: COMMANDS.openCollectorInvitation(store),
      onRevokeInvite: COMMANDS.revokeCollectorInvitation(store),
      onRefresh: COMMANDS.refreshView(store),
    };
    const Live = () => {
      const [state, setState] = React.useState(store.get());
      React.useEffect(() => store.sub(setState), []);
      return React.createElement(NETWORK.default, { state, ...seat });
    };
    return { ...ctx, calls, store, r: render(React.createElement(Live)) };
  };

  const fill = (r, { recipient = "Dana", email = "" } = {}) => {
    if (recipient !== null) typeInto(r, "Who is this for", recipient);
    typeInto(r, "Email", email);
  };

  test("the form offers an address, says what it is for, and says what it is not", async () => {
    const { close, r } = await screen();
    try {
      clickText(r, "Invite a collector");
      assert(hasField(r, "Email"), "there is nowhere to say where to send it");
      const help = flat(r);
      assert(/Where MetYet sends the invitation/i.test(help), "the field does not say what it is");
      assert(/does not decide who can accept/i.test(help),
        "the field lets a person believe the address is the person");
    } finally { await close(); }
  });

  test("the button says what will happen, and changes when an address is typed", async () => {
    const { close, r } = await screen();
    try {
      clickText(r, "Invite a collector");
      assert(clickable(r, "Create invitation"), "with no address it does not offer to create one");
      assert(!clickable(r, "Send invitation"), "with no address it offers to send one");
      fill(r, { email: ADDRESS });
      assert(clickable(r, "Send invitation"), "with an address it does not offer to send it");
      assert(!clickable(r, "Create invitation"), "with an address it still says create");
    } finally { await close(); }
  });

  test("the one-time panel shows the code and the link, and the link is the server's", async () => {
    const { close, r } = await screen();
    try {
      clickText(r, "Invite a collector");
      fill(r, { email: "" });
      await submit(r);
      const shown = flat(r);
      const credential = instText(r.root.findAll((n) => n.type === "code")[0]).trim();
      assert(shown.includes(`${APP_URL}/join#${credential}`), "the link is not offered: " + shown);
    } finally { await close(); }
  });

  test("replacing withdraws the old invitation BEFORE it creates the new one", async () => {
    const { close, r, calls, world } = await screen({
      mailer: fakeMailer(() => ({ ok: false, failure: FAILURES.rejected })),
    });
    try {
      clickText(r, "Invite a collector");
      fill(r, { email: ADDRESS });
      await submit(r);
      assert(/refused/i.test(flat(r)), "the screen did not say the send failed: " + flat(r));
      clickText(r, "Done");

      const first = (await world()).invitations[0];
      assert(clickable(r, "Replace invitation"), "a failed delivery offers no way to replace it");
      clickText(r, "Replace invitation");
      typeInto(r, "Email", "dana.other@example.test");
      const before = calls.length;
      await submit(r);

      const after = calls.slice(before).filter((c) => c.method === "POST");
      eq(after.length, 2, "replacing was not two requests: " + after.map((c) => c.url).join(" "));
      assert(after[0].url.endsWith("/api/commands")
        && after[0].body.command === "revokeCollectorInvitation"
        && after[0].body.payload.invitationId === first.id,
        "the old invitation was not withdrawn first: " + JSON.stringify(after[0].body));
      assert(after[1].url.endsWith("/api/invitations/collector"),
        "the replacement was not created second");

      const w = await world();
      eq(w.invitations.length, 2, "replacing did not create a new invitation");
      eq(w.invitations.filter((i) => !i.revokedAt && !i.acceptedAt).length, 1,
        "two live invitations exist for one person");
    } finally { await close(); }
  });

  test("the code that went astray stops working the moment it is replaced", async () => {
    const { close, r, accept, world } = await screen({
      mailer: fakeMailer(() => ({ ok: false, failure: FAILURES.rejected })),
    });
    try {
      clickText(r, "Invite a collector");
      fill(r, { email: ADDRESS });
      await submit(r);
      const old = instText(r.root.findAll((n) => n.type === "code")[0]).trim();
      clickText(r, "Done");
      clickText(r, "Replace invitation");
      await submit(r);
      const fresh = instText(r.root.findAll((n) => n.type === "code")[0]).trim();
      assert(fresh && fresh !== old, "replacing handed back the same secret");

      const before = (await world()).relationships.length;
      const refused = await accept(old, DANA_TOKEN);
      eq(refused.status, 409, "the replaced code still redeems");
      eq((await world()).relationships.length, before, "the replaced code created a relationship");
      eq((await accept(fresh, DANA_TOKEN)).status, 200, "the fresh code does not redeem");
      eq((await world()).relationships.length, before + 1, "the fresh code connected nobody");
    } finally { await close(); }
  });

  test("replacing again leaves one live invitation, however many times it is pressed", async () => {
    const { close, r, world } = await screen({
      mailer: fakeMailer(() => ({ ok: false, failure: FAILURES.rejected })),
    });
    try {
      clickText(r, "Invite a collector");
      fill(r, { email: ADDRESS });
      await submit(r);
      clickText(r, "Done");
      for (let i = 0; i < 3; i += 1) {
        clickText(r, "Replace invitation");
        await submit(r);
        clickText(r, "Done");
      }
      const w = await world();
      eq(w.invitations.length, 4, "a replacement did not create an invitation");
      eq(w.invitations.filter((i) => !i.revokedAt && !i.acceptedAt).length, 1,
        "more than one live invitation survived repeated replacement");
    } finally { await close(); }
  });

  test("it is called replacing, and never resending", async () => {
    const section = code("client/tp/sections/CollectorNetwork.jsx");
    assert(!/Send again|Resend|Retry delivery|Send it again/i.test(section),
      "the screen promises to send the same invitation again, which is impossible by construction");
    /* And nothing anywhere can: the plaintext is returned once and never kept. */
    const directory = code("server/auth/collector-invitations.js");
    assert(!/function resend|resend\s*\(|\btoken_plain\b/.test(directory),
      "the credential directory grew a way to send the same secret twice");
  });
});

/* ============================================================== E
   AN INVITATION THAT IS OVER KEEPS NO ADDRESS                        */
describe("E. retention", () => {
  test("accepting clears the address it was sent to", async () => {
    const { close, invite, accept, rowFor } = await connect();
    try {
      const { body } = await invite({ email: ADDRESS });
      eq((await rowFor(body.invitationId)).delivered_to, ADDRESS, "the address was not recorded");
      eq((await accept(body.credential, DANA_TOKEN)).status, 200, "acceptance failed");
      const row = await rowFor(body.invitationId);
      eq(row.delivered_to, null, "an accepted invitation still names a mailbox");
      eq(row.delivery_error, null, "an accepted invitation still carries a delivery failure");
      assert(row.delivery_requested_at, "that it was emailed at all was forgotten");
      assert(row.claimed_at, "the claim itself was not recorded");
    } finally { await close(); }
  });

  test("withdrawing clears it too", async () => {
    const { close, invite, command, rowFor } = await connect({
      mailer: fakeMailer(() => ({ ok: false, failure: FAILURES.rejected })),
    });
    try {
      const { body } = await invite({ email: ADDRESS });
      eq((await rowFor(body.invitationId)).delivery_error, "rejected", "the failure was not recorded");
      const withdrawn = await command("revokeCollectorInvitation", { invitationId: body.invitationId });
      eq(withdrawn.status, 200, "withdrawing failed");
      const row = await rowFor(body.invitationId);
      eq(row.delivered_to, null, "a withdrawn invitation still names a mailbox");
      eq(row.delivery_error, null, "a withdrawn invitation still carries a delivery failure");
      assert(row.delivery_requested_at, "that it was emailed at all was forgotten");
    } finally { await close(); }
  });
});

/* ============================================================== F
   CONFIGURATION, AND A MetYet THAT CANNOT SEND                       */
describe("F. configuration", () => {
  const ENV = Object.freeze({
    DATABASE_URL: "postgres://localhost/metyet",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  });

  test("a server with no mail settings starts, and opens invitations exactly as before", async () => {
    const config = loadServerConfig({ ...ENV });
    eq(config.mail, null, "mail was configured out of nothing");
    eq(config.appUrl, null, "an origin was invented");

    const { close, invite, mailer, world } = await connect({ mailer: null, appUrl: null });
    try {
      const { status, body } = await invite();
      eq(status, 200, "a server with no mail cannot open an invitation");
      assert(body.credential, "the credential did not come back");
      eq(body.joinUrl, undefined, "a link was built from an origin nobody configured");
      eq((await world()).invitations.length, 1, "the invitation was not created");
      /* And an address is refused rather than silently dropped: a partner who
         typed one must not be left believing something was sent. */
      const offered = await invite({ email: ADDRESS });
      eq(offered.status, 400, "an address was accepted by a server that cannot send");
      eq((await world()).invitations.length, 1, "the refused request created an invitation anyway");
    } finally { await close(); }
  });

  test("mail needs its key, its sender and an origin, and says which is missing", () => {
    const problems = (env) => {
      try { loadServerConfig({ ...ENV, ...env }); return []; }
      catch (error) { return error.problems || [error.message]; }
    };
    assert(problems({ RESEND_API_KEY: "k" }).some((p) => /MAIL_FROM/.test(p)),
      "a key with no sender was accepted");
    assert(problems({ MAIL_FROM: "MetYet <i@metyet.test>" }).some((p) => /RESEND_API_KEY/.test(p)),
      "a sender with no key was accepted");
    assert(problems({ RESEND_API_KEY: "k", MAIL_FROM: "MetYet <i@metyet.test>" })
      .some((p) => /APP_URL/.test(p)), "mail was configured with nowhere for its links to point");
    const whole = loadServerConfig({ ...ENV, RESEND_API_KEY: "k",
      MAIL_FROM: "MetYet <i@metyet.test>", APP_URL: `${APP_URL}/` });
    eq(whole.appUrl, APP_URL, "the origin was not normalised");
    eq(whole.mail.from, "MetYet <i@metyet.test>", "the sender was lost");
    /* And an origin a link would be unsafe to carry is refused outright. */
    assert(problems({ APP_URL: "http://app.metyet.test" }).some((p) => /APP_URL/.test(p)),
      "a plaintext origin was accepted for a link in an email");
  });

  test("APP_URL is configuration, and no request can be it", async () => {
    const { close, invite, mailer } = await connect();
    try {
      const { body } = await invite({ email: ADDRESS }, H.TOKEN, {
        host: "evil.example",
        "x-forwarded-host": "evil.example",
        origin: "https://evil.example",
        "x-forwarded-proto": "http",
      });
      assert(mailer.sent[0].text.includes(`${APP_URL}/join#`),
        "the message carried a link to somewhere a request named");
      assert(!mailer.sent[0].text.includes("evil.example"), "a forged host reached the message");
      eq(body.joinUrl, `${APP_URL}/join#${body.credential}`, "the reply's link came from the request");

      /* Structural, because a forged header is only one of the ways. */
      const route = code("server/app.js");
      const near = route.match(/joinUrl[\s\S]{0,200}/g) || [];
      for (const chunk of near) {
        assert(!/hostname|headers|protocol|request\.url|origin/i.test(chunk),
          "the link is built from something the request carried: " + chunk.slice(0, 120));
      }
      const email = code("server/collector-invitation-email.js");
      assert(!/\brequest\b|\bheaders\b|\breq\.|process\.env/i.test(email),
        "the message builder learned to read a request or its environment");
    } finally { await close(); }
  });

  test("the blueprint offers the three settings and carries none of their values", () => {
    const blueprint = src("render.yaml");
    for (const name of ["RESEND_API_KEY", "MAIL_FROM", "APP_URL"]) {
      assert(blueprint.includes(name), `${name} is not offered by the deployment blueprint`);
    }
    /* A value beside a secret in a file in this repository is the one thing a
       blueprint must never contain. */
    const lines = blueprint.split("\n");
    lines.forEach((line, i) => {
      if (!/key:\s*(RESEND_API_KEY|APP_URL)/.test(line)) return;
      const next = lines[i + 1] || "";
      assert(/sync:\s*false/.test(next), `${line.trim()} carries a value instead of sync: false`);
    });
    const docs = src("docs/DEPLOYMENT.md");
    assert(/RESEND_API_KEY/.test(docs) && /APP_URL/.test(docs),
      "the deployment notes do not describe the new settings");
    assert(!/re_[A-Za-z0-9]{8,}/.test(`${blueprint}${docs}`), "something that looks like a key is written down");
  });
});

/* ============================================================== G
   WHAT THIS BATCH DID NOT ADD                                        */
describe("G. the shape of the change", () => {
  test("the three routes that touch an invitation are the three that were designed", () => {
    /* THE THIRD ONE ARRIVED IN BATCH 3D, deliberately: an unauthenticated,
       read-only lookup that names the inviting shop to a holder of a live
       credential, so that scanning a QR no longer lands on a stranger's login
       form. It spends nothing and discloses one name.

       Delivery is still not a route: nothing here sends, resends or reports on
       a send, which is what this batch's own pin was written to protect. A
       fourth route still fails this test. */
    const server = fs.readdirSync(path.join(ROOT, "server"), { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".js")).map((e) => `server/${e.name}`);
    const routes = server.map(code).join("\n").match(/["'`]\/api\/[^"'`]*["'`]/g) || [];
    /* `context` WAS DROPPED FROM THIS FILTER IN BATCH 5, and the set it
       produces is unchanged. It was there to catch `/api/invitations/collector/context`,
       which the `/api/invitations` prefix already catches; all it did besides
       was match any route with the word "context" in it, and Batch 5's card
       browsing is `/api/card-contexts`. A filter that names invitation routes
       by their prefix is tighter than one that guesses from a word, and a
       fourth INVITATION route still fails this test. */
    const touching = [...new Set(routes.filter((r) => /\/api\/invitations|redeem|accept|join|deliver|mail|send/i.test(r)))];
    eq(touching.sort().join(","),
      ['"/api/invitations/collector"', '"/api/invitations/collector/accept"',
        '"/api/invitations/collector/context"'].join(","),
      "a route appeared that this batch did not design: " + touching.join(","));
  });

  test("delivery is not a command, and acceptance still is not one either", () => {
    /* THE NAMES A BROWSER MAY SAY, read from the domain itself. A command is
       exactly a key here, so nothing about delivery being unreachable from
       `POST /api/commands` depends on reading the file's prose. */
    const { COMMAND_NAMES } = require("../domain/metyet-commands.js");
    for (const name of COMMAND_NAMES) {
      assert(!/deliver|mail|email/i.test(name), `"${name}" is a command about delivery`);
      assert(!(/invit/i.test(name) && /send|resend|deliver/i.test(name)),
        `"${name}" is a command that sends an invitation`);
      assert(!(/invit/i.test(name) && /accept|redeem|join|claim/i.test(name)),
        `"${name}" is a command that redeems an invitation`);
    }
    /* And the generic command route still hands the transaction no hook, and
       touches the credential directory in exactly one way: clearing the address
       of an invitation the domain has just closed. */
    const route = code("server/app.js");
    const generic = (route.match(/app\.post\("\/api\/commands"[\s\S]*?\n  \}\);/) || [])[0] || "";
    assert(generic, "the command route is no longer shaped so this test can read it");
    assert(!/alongside/.test(generic), "the command route grew a way to run something alongside");
    assert(!/mailer|buildInvitationEmail/.test(generic), "the command route can send mail");
    const reaches = [...new Set((generic.match(/collectorCredentials\.(\w+)/g) || [])
      .map((m) => m.split(".")[1]))];
    eq(reaches.sort().join(","), "closeDelivery",
      "the command route reaches the credential directory in a new way: " + reaches.join(","));
  });

  test("a command nobody designed cannot record a delivery, whatever it is called", async () => {
    /* THE DOMAIN IS THE GATE, and an escape hatch in front of it would not be
       visible in any list of commands. So this asks the way an attacker would:
       by name, at the one route that takes command names from a browser. */
    const { close, invite, command, rowFor } = await connect({
      mailer: fakeMailer(() => ({ ok: false, failure: FAILURES.rejected })),
    });
    try {
      const { body } = await invite({ email: ADDRESS });
      for (const name of ["deliverCollectorInvitation", "sendCollectorInvitation",
        "resendCollectorInvitation", "recordDelivery", "acceptCollectorInvitation"]) {
        const answer = await command(name, { invitationId: body.invitationId, email: ADDRESS });
        assert(answer.status !== 200, `"${name}" was carried out by the command route`);
        const row = await rowFor(body.invitationId);
        eq(row.delivered_at, null, `"${name}" recorded a delivery`);
        eq(row.delivery_error, "rejected", `"${name}" changed what was recorded`);
      }
    } finally { await close(); }
  });

  test("no credential is kept anywhere a browser could read it again", () => {
    const walk = (dir, out = []) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel, out);
        else if (/\.jsx?$/.test(e.name)) out.push(rel);
      }
      return out;
    };
    for (const rel of [...walk("client"), ...walk("app-src")]) {
      assert(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(code(rel)),
        `${rel} persists something in the browser`);
    }
  });

  test("the migration is additive, forward-only, and the columns are there", async () => {
    const migration = src("persistence/migrations/0005_collector_invitation_delivery.sql");
    assert(!/drop\s+(table|column|schema)|delete\s+from|truncate/i.test(migration),
      "the migration destroys something");
    assert(/add column delivery_requested_at/.test(migration), "the migration is not the one described");
    /* 0004 is applied and untouched. */
    const before = fs.readdirSync(path.join(ROOT, "persistence/migrations"))
      .filter((n) => /^000[1-4]_/.test(n));
    eq(before.length, 4, "an earlier migration was added or removed");

    const { close, raw } = await connect();
    try {
      const columns = (await raw(`select column_name from information_schema.columns
        where table_schema = 'metyet_auth' and table_name = 'collector_invitation_credentials'`))
        .map((c) => c.column_name).sort();
      for (const name of ["delivery_requested_at", "delivered_to", "delivered_at", "delivery_error"]) {
        assert(columns.includes(name), `${name} is not in a migrated database`);
      }
      assert(!columns.includes("delivery_state"), "a state column was stored beside the timestamps");
    } finally { await close(); }
  });

  test("a send that both succeeded and failed cannot be written down", async () => {
    const { close, invite, db, rowFor } = await connect();
    try {
      const { body } = await invite({ email: ADDRESS });
      let refused = null;
      try {
        await db.transaction(async (t) => t.query(
          `update metyet_auth.collector_invitation_credentials
             set delivered_at = now(), delivery_error = 'rejected' where invitation_id = $1`,
          [body.invitationId]));
      } catch (error) { refused = error; }
      assert(refused, "a row claiming both outcomes was accepted");
      const row = await rowFor(body.invitationId);
      assert(row.delivered_at && !row.delivery_error, "the recorded outcome was changed by the attempt");
    } finally { await close(); }
  });

  test("the message builder is a function of three things and reads nothing", () => {
    const built = buildInvitationEmail({ partnerName: SHOP, appUrl: APP_URL, credential: "abc" });
    eq(built.subject, `${SHOP} invited you to MetYet`, "the subject changed shape");
    assert(built.text.includes(`${APP_URL}/join#abc`), "the link is not in the message");
    assert(/sign in/i.test(built.text), "the message does not say they will sign in");
    assert(/not necessarily the one this reached/i.test(built.text),
      "the message lets the reader believe the address it arrived at is who may accept");
    assert(/works once|single|personal/i.test(built.text), "the message does not say it is personal");
    assert(/do not forward/i.test(built.text), "the message does not discourage forwarding");
    assert(/MetYet/.test(built.text), "the message does not say who sent it");
    /* A shop with no name is described rather than invented. */
    eq(buildInvitationEmail({ appUrl: APP_URL, credential: "abc" }).subject,
      `${SOMEBODY} invited you to MetYet`, "an unnamed shop was given a name");
    /* And it refuses to build half a message. */
    for (const args of [{ appUrl: APP_URL }, { credential: "abc" }]) {
      let threw = false;
      try { buildInvitationEmail(args); } catch (error) { threw = true; }
      assert(threw, "a message was built with something missing: " + JSON.stringify(args));
    }
  });

  test("the adapter talks to one endpoint, with a key it is given and a body it is told", async () => {
    const seen = [];
    const mailer = createResendMailer({ apiKey: "K", from: "MetYet <i@metyet.test>",
      fetchImpl: async (url, init) => { seen.push({ url, init }); return { status: 200 }; } });
    const answer = await mailer.send({ to: ADDRESS, subject: "s", text: "t", idempotencyKey: "one" });
    eq(answer.ok, true, "a 200 did not read as sent");
    eq(seen[0].url, ENDPOINT, "the adapter talked to somewhere else");
    eq(seen[0].init.headers.authorization, "Bearer K", "the key is not carried as a bearer token");
    eq(seen[0].init.headers["Idempotency-Key"], "one", "the idempotency key was dropped");
    const body = JSON.parse(seen[0].init.body);
    eq(body.to.join(), ADDRESS, "the recipient was changed");
    assert(seen[0].init.signal, "the request has no deadline");
    /* Every failure word is one of ours, and the two that mean "answered" are
       the only two a caller may record. */
    eq(Object.keys(FAILURES).sort().join(), "rejected,unavailable,unexpected,unreachable",
      "the vocabulary of failure changed");
    eq(ANSWERED.slice().sort().join(), "rejected,unavailable",
      "something unanswered became recordable as an outcome");
  });

  test("no vendor was added to send one email", () => {
    const pkg = JSON.parse(src("package.json"));
    for (const name of ["resend", "nodemailer", "@sendgrid/mail", "postmark", "aws-sdk"]) {
      assert(!pkg.dependencies[name], `${name} was added for one HTTP call`);
    }
    const adapter = code("server/mail/resend.js");
    assert(!/require\(/.test(adapter), "the adapter requires something");
  });
});

run();
