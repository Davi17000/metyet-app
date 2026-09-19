/* ============================================================================
   PHASE 5 BATCH 3D — WHO INVITED YOU, BEFORE ANYTHING IS ASKED OF YOU

   A person scans a shop's QR code, and until this batch what MetYet showed them
   first was a box asking for their email address. They had been talking to the
   shop owner thirty seconds earlier. This batch names the shop.

   THE ONE THING THIS SUITE EXISTS TO PROTECT. The new route is unauthenticated,
   which is the entire point and also the entire risk, so every test here is
   really one of two questions:

     does it disclose more than one name?      (section B)
     does it change anything at all?           (section C)

   AND THE INVARIANT IT PINS, which supersedes a Batch 3A decision on purpose:

     The server may disclose the inviting Trusted Partner's canonical display
     name — and only that — to a holder of a currently live personal invitation
     credential.

   Everything Batch 3A built stands: authentication still precedes acceptance,
   acceptance is still explicit, the credential is still spent exactly once by
   exactly one path, and the delivery address and the partner's private label
   still reach nobody.
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
const { createApp } = require("../server/app.js");
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
const clickable = (r, label) => labels(r).some((l) => l.includes(label));
const press = async (r, label) => {
  const b = buttons(r).find((n) => instText(n).includes(label));
  assert(b, `no button "${label}" among: ${labels(r).join(" | ")}`);
  await TR.act(async () => { await b.props.onClick(); });
};
/* The entrance labels its inputs with `htmlFor` rather than wrapping them, so a
   field is found the way a browser finds it: by the id its label points at. */
const field = (r, label) => {
  const all = r.root.findAll((n) => n.type === "label");
  const lab = all.find((n) => instText(n).startsWith(label));
  assert(lab, `no field "${label}" among: ${all.map(instText).join(" | ")}`);
  return r.root.findAll((n) => n.type === "input" && n.props.id === lab.props.htmlFor)[0];
};
const typeInto = (r, label, value) => {
  const input = field(r, label);
  assert(input, `field "${label}" has nothing to type into`);
  TR.act(() => { input.props.onChange({ target: { value } }); });
};
const submit = async (r) => {
  const form = r.root.findAll((n) => n.type === "form")[0];
  assert(form, "no form on screen");
  await TR.act(async () => { await form.props.onSubmit({ preventDefault() {} }); });
};
/* Let the entrance's own effect finish asking who invited them. It is a real
   round trip through the real server, so microtasks are not enough. */
const settle = async () => {
  for (let i = 0; i < 5; i += 1) {
    await TR.act(async () => { await new Promise((done) => setTimeout(done, 5)); });
  }
};

/* --------------------------------------------------------------- the world */
const SHOP = "Northline Cards";
const ADDRESS = "dana@example.test";
const LABEL = "Dana from the Tuesday show";
const NOTE = "Wants a graded Blastoise";
const DANA = "sub-dana";
const DANA_TOKEN = `token-for:${DANA}`;

const fakeMailer = (answer = () => ({ ok: true })) => {
  const sent = [];
  return { sent, async send(m) { sent.push(m); return answer(m); } };
};

const connect = async (opts = {}) => {
  const ctx = await H.serve(createApp, { collectorCredentials: true,
    mailer: fakeMailer(), appUrl: "https://app.metyet.test", ...opts });
  const seeded = await ctx.repository.loadWorld();
  await ctx.repository.saveWorld({ ...seeded,
    partners: seeded.partners.map((p) => (p.id === H.PARTNER ? { ...p, name: SHOP } : p)) });

  const f = H.fetchFor(ctx.app);
  const calls = [];
  const watched = async (url, init) => {
    calls.push({ url: String(url), method: (init && init.method) || "GET",
      headers: (init && init.headers) || {}, body: init && init.body ? String(init.body) : null });
    return f(url, init);
  };
  const post = (route, token, body) => f(`http://localhost${route}`, {
    method: "POST",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const invite = async (body = {}, token = H.TOKEN) => {
    const res = await post("/api/invitations/collector", token, body);
    return { status: res.status, body: await res.json() };
  };
  const context = async (body, token = null) => {
    const res = await post("/api/invitations/collector/context", token, body);
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
  const world = () => ctx.repository.loadWorld();
  const raw = async (sql, params = []) =>
    ctx.db.transaction(async (t) => (await t.query(sql, params)).rows, { readOnly: true });
  const accounts = () => raw("select id from metyet_auth.accounts");

  return { ...ctx, f, watched, calls, invite, context, accept, command, world, raw, accounts };
};

/* The entrance, wired to the real server as the production entry point wires
   it: a session that behaves, a real store, real bindings. */
const entrance = async (ctx, { arrivedWith = null, subject = DANA } = {}) => {
  let token = null;
  const session = {
    async requestCode() { return true; },
    async verifyCode() { token = `token-for:${subject}`; return true; },
    async signOut() { token = null; },
    token: async () => token,
    status: () => (token ? "present" : "anonymous"),
    subscribe: () => () => {},
  };
  const api = API.createApiClient({ baseUrl: "http://localhost",
    getToken: async () => token, fetchImpl: ctx.watched });
  const store = STORE.createProductionStore({ api });
  const r = render(React.createElement(SIGNIN.default, { session, store, arrivedWith }));
  await settle();
  return r;
};

const signIn = async (r) => {
  typeInto(r, "Email address", ADDRESS);
  await submit(r);
  typeInto(r, "Code from the email", "24681357");
  await submit(r);
};

/* ============================================================== A
   THE NAME ARRIVES, AND IT IS THE SHOP'S OWN                       */
describe("A. context before credentials", () => {
  test("a live invitation names the inviting shop, and says nothing else", async () => {
    const { close, invite, context } = await connect();
    try {
      const made = await invite({ recipient: LABEL, note: NOTE, email: ADDRESS });
      const { status, body } = await context({ token: made.body.credential });
      eq(status, 200, "a live invitation was not described");
      eq(body.partnerName, SHOP, "the shop was not named, or was named wrongly");
      /* ONE FIELD OF CONTEXT. `ok` is the envelope every reply in this API
         carries; `partnerName` is the disclosure. Anything else is a leak. */
      eq(Object.keys(body).sort().join(","), "ok,partnerName",
        "the reply carries more than the shop's name: " + Object.keys(body).join(","));
      const said = JSON.stringify(body);
      for (const [what, value] of [["the delivery address", ADDRESS], ["the partner's label", LABEL],
        ["the note", NOTE], ["the invitation id", made.body.invitationId],
        ["the credential", made.body.credential]]) {
        assert(!said.includes(value), `the reply carries ${what}`);
      }
      assert(!/expire|claimed|deliver|digest|collector/i.test(said),
        "the reply describes the invitation's state: " + said);
    } finally { await close(); }
  });

  test("it is unauthenticated — that is what makes it context BEFORE credentials", async () => {
    const { close, invite, context } = await connect();
    try {
      const made = await invite();
      const anonymous = await context({ token: made.body.credential });
      eq(anonymous.status, 200, "a person with no session could not be told who invited them");
      /* And a session does not change the answer: it is not an authority. */
      const signedIn = await context({ token: made.body.credential }, H.TOKEN);
      eq(signedIn.body.partnerName, anonymous.body.partnerName, "a token changed the answer");
    } finally { await close(); }
  });

  test("the name comes from canonical state, and no request can supply one", async () => {
    const { close, invite, context, repository, world } = await connect();
    try {
      const made = await invite({ recipient: "Southline Cards — your account is suspended" });
      const claimed = await context({ token: made.body.credential, partnerName: "Southline Cards" });
      eq(claimed.status, 400, "the route accepted a shop name from the browser");

      const honest = await context({ token: made.body.credential });
      eq(honest.body.partnerName, SHOP, "the label reached the answer");

      /* Rename the shop in the world and the answer follows it. */
      const now = await world();
      await repository.saveWorld({ ...now,
        partners: now.partners.map((p) => (p.id === H.PARTNER ? { ...p, name: "Northline Cards & Co" } : p)) });
      eq((await context({ token: made.body.credential })).body.partnerName, "Northline Cards & Co",
        "the name did not come from the world");
    } finally { await close(); }
  });

  test("the credential travels in the body, never in a path or a query", async () => {
    const { close, invite, context, f } = await connect();
    try {
      const made = await invite();
      /* The route this batch added takes a POST body and nothing else. */
      const viaQuery = await f(
        `http://localhost/api/invitations/collector/context?token=${made.body.credential}`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      assert(viaQuery.status >= 400, "a credential in a query string was accepted");
      const viaPath = await f(`http://localhost/api/invitations/collector/context/${made.body.credential}`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      assert(viaPath.status >= 400, "a credential in a path was accepted");
      eq((await context({ token: made.body.credential })).status, 200, "the body is not the way in");

      /* And structurally: nothing builds a URL out of a credential. */
      const route = code("server/app.js");
      const near = route.match(/collector\/context[\s\S]{0,400}/)[0];
      assert(!/request\.query|params|request\.url/.test(near),
        "the route reads the credential from somewhere other than the body");
    } finally { await close(); }
  });

  test("the credential is never logged, on success or on refusal", () => {
    /* Structural, because the strongest evidence here is a line that is never
       written: what the route logs is an invitation id, which is what a support
       question quotes, and never the secret that was submitted. */
    const route = code("server/app.js");
    const start = route.indexOf("/api/invitations/collector/context");
    assert(start > 0, "the context route is gone");
    const body = route.slice(start, route.indexOf("/api/invitations/collector/accept"));
    const logged = body.match(/request\.log\.[a-z]+\([\s\S]{0,140}?\)/g) || [];
    assert(logged.length, "the route logs nothing at all, which this test cannot then check");
    for (const line of logged) {
      assert(!/body\.token|credential|token\s*[,}]/.test(line),
        "a log line carries the credential: " + line.replace(/\s+/g, " "));
    }
  });
});

/* ============================================================== B
   ONE REFUSAL, FOR EVERY REASON                                    */
describe("B. what it will not tell you", () => {
  const refusals = {};

  test("unknown, malformed, expired, withdrawn, replaced and spent are one answer", async () => {
    const { close, invite, context, accept, command, repository, world } = await connect();
    try {
      /* Unknown — a well-formed credential nobody ever issued. */
      refusals.unknown = await context({ token: "abcdefghjkmnpqrstvwxyz0123456789" });
      /* Malformed — not the shape a credential has. */
      refusals.malformed = await context({ token: "not-a-credential" });

      /* Expired. */
      const stale = await invite();
      const before = await world();
      await repository.saveWorld({ ...before,
        invitations: before.invitations.map((i) => (i.id === stale.body.invitationId
          ? { ...i, expiresAt: "2020-01-01T00:00:00.000Z" } : i)) });
      refusals.expired = await context({ token: stale.body.credential });

      /* Withdrawn. */
      const dropped = await invite();
      eq((await command("revokeCollectorInvitation",
        { invitationId: dropped.body.invitationId })).status, 200, "withdrawing failed");
      refusals.withdrawn = await context({ token: dropped.body.credential });

      /* Replaced — withdrawn, then a fresh one issued in its place. */
      const old = await invite();
      await command("revokeCollectorInvitation", { invitationId: old.body.invitationId });
      await invite();
      refusals.replaced = await context({ token: old.body.credential });

      /* Spent. */
      const used = await invite();
      eq((await accept(used.body.credential, DANA_TOKEN)).status, 200, "acceptance failed");
      refusals.accepted = await context({ token: used.body.credential });

      /* The request id differs per request by design and identifies nothing
         about the invitation, so it is removed before comparing. */
      const shape = (r) => `${r.status} ${JSON.stringify(r.body).replace(/"requestId":"[^"]*"/, "")}`;
      const answers = Object.entries(refusals).map(([why, r]) => `${why}: ${shape(r)}`);
      const distinct = new Set(Object.values(refusals).map(shape));
      eq(distinct.size, 1, "the refusals are distinguishable:\n  " + answers.join("\n  "));
      for (const [why, r] of Object.entries(refusals)) {
        eq(r.status, 409, `${why} answered with a different status`);
        assert(!r.body.partnerName, `${why} named a shop`);
      }
    } finally { await close(); }
  });

  test("a refusal says nothing about why, in any word it uses", async () => {
    const { close, invite, context, command } = await connect();
    try {
      const dropped = await invite({ recipient: LABEL, email: ADDRESS });
      await command("revokeCollectorInvitation", { invitationId: dropped.body.invitationId });
      const said = JSON.stringify((await context({ token: dropped.body.credential })).body);
      for (const leak of [LABEL, ADDRESS, dropped.body.invitationId, SHOP]) {
        assert(!said.includes(leak), "a refusal carries something it must not: " + said);
      }
      assert(!/expired|withdrawn|revoked|spent|accepted|unknown/i.test(said),
        "a refusal names its cause: " + said);
    } finally { await close(); }
  });
});

/* ============================================================== C
   IT CHANGES NOTHING                                               */
describe("C. a read, and only a read", () => {
  test("asking does not consume, reserve, or reduce the invitation", async () => {
    const { close, invite, context, accept, world, raw } = await connect();
    try {
      const made = await invite({ email: ADDRESS });
      const rowBefore = (await raw(
        "select * from metyet_auth.collector_invitation_credentials where invitation_id = $1",
        [made.body.invitationId]))[0];

      /* Asked repeatedly, which a reservation would not survive. */
      for (let i = 0; i < 5; i += 1) {
        eq((await context({ token: made.body.credential })).status, 200, `ask ${i + 1} was refused`);
      }

      const rowAfter = (await raw(
        "select * from metyet_auth.collector_invitation_credentials where invitation_id = $1",
        [made.body.invitationId]))[0];
      eq(JSON.stringify(rowAfter), JSON.stringify(rowBefore),
        "the credential row changed while being read");

      /* And it is still worth exactly one redemption. */
      eq((await accept(made.body.credential, DANA_TOKEN)).status, 200,
        "the invitation was not redeemable after being described");
      eq((await accept(made.body.credential, "token-for:sub-someone-else")).status, 409,
        "it was redeemable twice");
      eq((await world()).invitations.filter((i) => i.acceptedAt).length, 1,
        "more than one invitation was accepted");
    } finally { await close(); }
  });

  test("asking creates no Collector, no relationship and no account", async () => {
    const { close, invite, context, world, accounts } = await connect();
    try {
      const made = await invite();
      /* Taken AFTER the invitation exists, so the only thing between the two
         snapshots is the reading. */
      const before = await world();
      const accountsBefore = (await accounts()).length;
      for (let i = 0; i < 3; i += 1) await context({ token: made.body.credential });
      await context({ token: "abcdefghjkmnpqrstvwxyz0123456789" });

      const after = await world();
      eq(after.collectors.length, before.collectors.length, "a Collector appeared");
      eq(after.relationships.length, before.relationships.length, "a relationship appeared");
      eq((await accounts()).length, accountsBefore, "an account appeared");
      eq(after.invitations.filter((i) => i.acceptedAt).length, 0, "an invitation was accepted");
      /* AND NOTHING ELSE EITHER. Naming the collections a reader expects to be
         untouched leaves every collection it did not think of — so the whole
         world is compared, and any write at all fails here. `before` was taken
         after the invitation was created, so the only thing between them is the
         reading. */
      eq(JSON.stringify(after), JSON.stringify(before),
        "the world changed while an invitation was being described");
    } finally { await close(); }
  });

  test("acceptance still needs authentication, and still needs a press", async () => {
    const { close, invite, accept, context, world } = await connect();
    try {
      const made = await invite();
      eq((await context({ token: made.body.credential })).status, 200, "context failed");
      /* Knowing who invited you is not being anybody. */
      const anonymous = await accept(made.body.credential, null);
      eq(anonymous.status, 401, "acceptance was possible without authentication");
      eq((await world()).relationships.length, 1, "a relationship was created anyway");
    } finally { await close(); }
  });
});

/* ============================================================== D
   THE FRONT DOOR                                                   */
describe("D. what a person sees", () => {
  test("arriving by link: the shop is named before anything is asked", async () => {
    const ctx = await connect();
    try {
      const made = await ctx.invite();
      const r = await entrance(ctx, { arrivedWith: made.body.credential });
      const shown = flat(r);
      assert(shown.includes(`${SHOP} invited you to MetYet.`),
        "the shop was not named on arrival: " + shown);
      assert(/keeping an eye out for you/i.test(shown),
        "the screen does not say why they are here: " + shown);
      /* And the credential is not on screen. */
      assert(!shown.includes(made.body.credential), "the credential is on screen");
      /* Authentication is a continuation, not the headline. */
      assert(!/Sign in so they know it's you/i.test(shown),
        "authentication became the headline: " + shown);
    } finally { await ctx.close(); }
  });

  test("a typed code resolves the same context as a scanned one", async () => {
    const ctx = await connect();
    try {
      const made = await ctx.invite();
      const r = await entrance(ctx);
      assert(!flat(r).includes(SHOP), "a shop was named before any invitation was held");
      TR.act(() => {
        const b = buttons(r).find((n) => instText(n).includes("I have an invitation code"));
        b.props.onClick();
      });
      typeInto(r, "Invitation code", made.body.credential);
      await submit(r);
      await settle();
      assert(flat(r).includes(`${SHOP} invited you to MetYet.`),
        "a typed code did not resolve the shop: " + flat(r));
    } finally { await ctx.close(); }
  });

  test("an invitation that is not live names nobody, and the door still works", async () => {
    const ctx = await connect();
    try {
      const made = await ctx.invite();
      await ctx.command("revokeCollectorInvitation", { invitationId: made.body.invitationId });
      const r = await entrance(ctx, { arrivedWith: made.body.credential });
      const shown = flat(r);
      assert(!shown.includes(SHOP), "a withdrawn invitation named a shop: " + shown);
      assert(!/invited you to MetYet/.test(shown), "it claimed somebody invited them");
      /* The entrance still asks for an address — it does not decide the code is
         bad, because that is the acceptance route's answer to give. */
      assert(field(r, "Email address"), "the entrance stopped working");
    } finally { await ctx.close(); }
  });

  test("the whole journey: named shop, OTP, explicit join, one relationship", async () => {
    const ctx = await connect();
    try {
      const made = await ctx.invite();
      const before = (await ctx.world()).relationships.length;
      const r = await entrance(ctx, { arrivedWith: made.body.credential });
      assert(flat(r).includes(`${SHOP} invited you to MetYet.`), "not named on arrival");

      await signIn(r);
      await settle();
      const confirm = flat(r);
      assert(clickable(r, "Accept invitation"), "no confirm screen: " + confirm);
      assert(confirm.includes(`Join ${SHOP}'s Collector Network?`),
        "the confirm screen does not name the shop: " + confirm);
      eq((await ctx.world()).relationships.length, before,
        "a relationship existed before the person pressed anything");

      await press(r, "Accept invitation");
      eq((await ctx.world()).relationships.length, before + 1,
        "the relationship was not created exactly once");
    } finally { await ctx.close(); }
  });

  test("`Use a different address` keeps the invitation and its context", async () => {
    const ctx = await connect();
    try {
      const made = await ctx.invite();
      const r = await entrance(ctx, { arrivedWith: made.body.credential });
      typeInto(r, "Email address", "typo@wrong.example");
      await submit(r);
      assert(/We sent a code to/.test(flat(r)), "not the code screen");
      await press(r, "Use a different address");
      await settle();
      const shown = flat(r);
      assert(!clickable(r, "I have an invitation code"),
        "the invitation was lost by correcting an address: " + shown);
      assert(shown.includes(`${SHOP} invited you to MetYet.`),
        "the shop's name was lost with the address: " + shown);
    } finally { await ctx.close(); }
  });

  test("signing out drops the invitation and the name with it", async () => {
    const ctx = await connect();
    try {
      const made = await ctx.invite();
      const r = await entrance(ctx, { arrivedWith: made.body.credential });
      await signIn(r);
      await settle();
      await press(r, "Not now");
      await settle();
      /* Declined: no longer holding an invitation, so no longer naming a shop. */
      const shown = flat(r);
      assert(!shown.includes(`${SHOP} invited you to MetYet.`),
        "the shop outlived the invitation: " + shown);
    } finally { await ctx.close(); }
  });
});

/* ============================================================== E
   THE SHAPE OF THE CHANGE                                          */
describe("E. the boundary", () => {
  test("three routes touch an invitation, and only one of them redeems", () => {
    const server = fs.readdirSync(path.join(ROOT, "server"), { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".js")).map((e) => `server/${e.name}`);
    const routes = server.map(code).join("\n").match(/["'`]\/api\/[^"'`]*["'`]/g) || [];
    const touching = [...new Set(routes.filter((r) => /invitation|redeem|accept|join|context/i.test(r)))];
    eq(touching.sort().join(","),
      ['"/api/invitations/collector"', '"/api/invitations/collector/accept"',
        '"/api/invitations/collector/context"'].join(","),
      "a fourth invitation route appeared: " + touching.join(","));

    /* And the one that spends a COLLECTOR credential is still the one that
       always did: the acceptance transaction, and nothing in the route layer. */
    assert(!/collectorCredentials\.claim\(/.test(code("server/app.js")),
      "the route layer learned to claim a credential");
    const spender = code("server/collector-acceptance.js");
    assert(/credentials\.claim\(/.test(spender), "the acceptance transaction no longer claims");
  });

  test("the lookup reads one column, and cannot hand back anything else", () => {
    const directory = code("server/auth/collector-invitations.js");
    const statement = (directory.match(/const UNSPENT_BY_DIGEST = `[\s\S]*?`/) || [])[0] || "";
    assert(statement, "the narrow statement is gone");
    assert(/select invitation_id\b/.test(statement), "it selects more than the id: " + statement);
    assert(/claimed_at is null/.test(statement), "a spent credential is still resolvable");
    /* The WHERE clause names the digest, as it must; what matters is that the
       SELECT list cannot hand anything else back. */
    const selected = (statement.match(/select ([\s\S]*?) from/) || [])[1] || "";
    eq(selected.trim(), "invitation_id", "the select list grew: " + selected);
    assert(!/delivered_to|claimed_by|COLUMNS/.test(statement),
      "the statement reaches for more than it needs: " + statement);
  });

  test("exactly one client call leaves the browser without a token", () => {
    const client = code("client/api.js");
    /* Every place the tokenless door is opened, and there must be exactly one. */
    const callers = client.match(/await ask\(|return ask\(|= ask\(/g) || [];
    eq(callers.length, 1, `the anonymous door is used ${callers.length} times; it is for one call`);
    assert(/invitationContext[\s\S]{0,400}?ask\("\/api\/invitations\/collector\/context"/.test(client),
      "the anonymous call is not the context lookup");
    /* And `send` still refuses to leave without one. */
    assert(/const token = await getToken\(\);[\s\S]{0,200}?throw new ApiError\(FAILURES\.unauthenticated/.test(client),
      "send stopped demanding a token");
  });

  test("nothing else about the front door moved", () => {
    /* Still exactly two files read the address bar, and the entrance is not
       one of them. */
    const walk = (dir, out = []) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel, out);
        else if (/\.jsx?$/.test(e.name)) out.push(rel);
      }
      return out;
    };
    const files = [...walk("client"), ...walk("app-src")];
    const readers = files.filter((rel) => /location\s*[.[]|\.hash\b|URLSearchParams|history\s*\./.test(code(rel)));
    eq(readers.sort().join(","), ["app-src/main.jsx", "client/production-config.js"].join(","),
      "the address bar is read somewhere new: " + readers.join(","));
    /* And no browser storage anywhere on the path. */
    for (const rel of files) {
      assert(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(code(rel)),
        `${rel} persists something`);
    }
    /* The fragment is still taken out of the address bar. */
    assert(/replaceState/.test(code("app-src/main.jsx")), "the fragment is no longer stripped");
  });
});

run();
