/* ============================================================================
   PHASE 5 BATCH 3C — ONE PERSONAL INVITATION, HANDED OVER THREE WAYS

   Batch 2 created the invitation and its one credential. Batch 3A let somebody
   redeem it. Batch 3B-1 made a link work. Batch 3B-2 let MetYet send that link.
   This batch adds the way a shop actually does it: hold up a screen.

   THE ONE CLAIM THIS SUITE EXISTS TO PROVE. A QR, a link and a code are not
   three invitations. They are one invitation, and every property that made it
   safe — personal, expiring, revocable, single use, creating no Collector,
   deciding nothing about identity — is a property of the invitation rather than
   of the channel, so none of them changes because a camera was involved.

   AND ONE THING THE PICTURE COULD GET WRONG THAT NOTHING ELSE COULD. A QR is a
   secret rendered as an image, and the ordinary way to render one is to ask a
   service for it. That would hand a live invitation credential to whoever
   answered. Section E exists for that alone.

   THE ENCODER IS CHECKED BY SOMEBODY ELSE'S DECODER. `jsqr` is a separate
   implementation; a round trip through our own code would prove only that it
   agrees with itself.
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const React = require("react");
const TR = require("react-test-renderer");
const jsQR = require("jsqr");

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
const QR = load("client/qr/encode.js");
const ENTRY = load("app-src/main.jsx");
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
const clickText = (r, label) => {
  const b = buttons(r).find((n) => instText(n).includes(label));
  assert(b, `no button "${label}" among: ${labels(r).join(" | ")}`);
  TR.act(() => { b.props.onClick(); });
};
const field = (r, label) => {
  const all = r.root.findAll((n) => n.type === "label");
  const lab = all.find((n) => instText(n).startsWith(label));
  assert(lab, `no field "${label}" among: ${all.map(instText).join(" | ")}`);
  return lab.findAll((n) => n.type === "input" || n.type === "textarea")[0];
};
const typeInto = (r, label, value) => {
  TR.act(() => { field(r, label).props.onChange({ target: { value } }); });
};
const submit = async (r) => {
  const form = r.root.findAll((n) => n.type === "form")[0];
  assert(form, "the form is not on screen");
  await TR.act(async () => { await form.props.onSubmit({ preventDefault() {} }); });
};
/* The credential as the screen shows it: still the one <code> on the panel. */
const shownCredential = (r) => {
  const el = r.root.findAll((n) => n.type === "code")[0];
  return el ? instText(el).trim() : null;
};
const svgs = (r) => r.root.findAll((n) => n.type === "svg");

/* --------------------------------------------------------------- the world */

const APP_URL = "https://app.metyet.test";
const ADDRESS = "dana@example.test";
const SHOP = "Northline Cards";
const DANA = "sub-dana";
const DANA_TOKEN = `token-for:${DANA}`;

const fakeMailer = (answer = () => ({ ok: true })) => {
  const sent = [];
  return { sent, async send(message) { sent.push(message); return answer(message, sent.length); } };
};

const connect = async ({ mailer = fakeMailer(), appUrl = APP_URL, ...opts } = {}) => {
  const ctx = await H.serve(createApp, { collectorCredentials: true, mailer, appUrl, ...opts });
  const seeded = await ctx.repository.loadWorld();
  await ctx.repository.saveWorld({ ...seeded,
    partners: seeded.partners.map((p) => (p.id === H.PARTNER ? { ...p, name: SHOP } : p)) });

  const f = H.fetchFor(ctx.app);
  const calls = [];
  const watched = async (url, init) => {
    calls.push({ url: String(url), method: (init && init.method) || "GET" });
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
  const world = () => ctx.repository.loadWorld();
  const raw = async (sql, params = []) =>
    ctx.db.transaction(async (t) => (await t.query(sql, params)).rows, { readOnly: true });

  /* The shop's screen, wired to the real server exactly as SignIn wires it. */
  const shop = async () => {
    const api = API.createApiClient({ baseUrl: "http://localhost",
      getToken: async () => H.TOKEN, fetchImpl: watched });
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
    return render(React.createElement(Live));
  };

  return { ...ctx, mailer, f, calls, invite, accept, command, view, world, raw, shop };
};

/* Create an invitation the way a shop owner does, with whatever they typed. */
const createInvitation = async (r, { recipient = null, email = null } = {}) => {
  clickText(r, "Invite a collector");
  if (recipient !== null) typeInto(r, "Who is this for", recipient);
  if (email !== null) typeInto(r, "Email", email);
  await submit(r);
};

/* --------------------------------------------------------- reading a symbol

   Rendered to pixels and handed to an independent decoder, which is what makes
   "a phone can read this" a claim with evidence behind it. */
const decode = (symbol, { scale = 6, quiet = 4 } = {}) => {
  const dim = (symbol.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let y = 0; y < dim; y += 1) {
    for (let x = 0; x < dim; x += 1) {
      const mx = Math.floor(x / scale) - quiet;
      const my = Math.floor(y / scale) - quiet;
      const dark = mx >= 0 && my >= 0 && mx < symbol.size && my < symbol.size
        && symbol.modules[my][mx] === 1;
      const i = (y * dim + x) * 4;
      if (dark) { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; }
      data[i + 3] = 255;
    }
  }
  const got = jsQR(data, dim, dim);
  return got ? got.data : null;
};

/* The same reading, from what the component actually rendered: the SVG path is
   turned back into modules, so the test reads the picture rather than trusting
   the encoder twice. */
const symbolFromSvg = (svg) => {
  const span = Number(String(svg.props.viewBox).split(" ")[2]);
  const quiet = 4;
  const size = span - quiet * 2;
  const path = svg.findAll((n) => n.type === "path")[0];
  const modules = Array.from({ length: size }, () => new Array(size).fill(0));
  for (const m of String(path.props.d).matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    modules[Number(m[2]) - quiet][Number(m[1]) - quiet] = 1;
  }
  return { size, modules };
};

/* ============================================================== A
   ONE INVITATION, THREE WAYS TO HAND IT OVER                         */
describe("A. the handoff", () => {
  test("the QR carries exactly the link the server returned — no second token", async () => {
    const { close, shop, calls } = await connect();
    try {
      const r = await shop();
      await createInvitation(r);
      const credential = shownCredential(r);
      assert(credential, "the credential is not on screen");

      const svg = svgs(r)[0];
      assert(svg, "no QR was rendered");
      const decoded = decode(symbolFromSvg(svg));
      eq(decoded, `${APP_URL}/join#${credential}`,
        "the QR does not carry the invitation's own link");

      /* And the link beside it is the same string, character for character. */
      assert(flat(r).includes(`${APP_URL}/join#${credential}`),
        "the copyable link is not the same link");
      /* Exactly one invitation was created for all three. */
      const created = calls.filter((c) => c.url.endsWith("/api/invitations/collector"));
      eq(created.length, 1, `${created.length} invitations were created for one handoff`);
    } finally { await close(); }
  });

  test("the QR is a picture of the link, and the link opens the ordinary entry path", async () => {
    const { close, shop, accept, world } = await connect();
    try {
      const r = await shop();
      await createInvitation(r);
      const decoded = decode(symbolFromSvg(svgs(r)[0]));

      /* Exactly what a phone does: open the URL, and let the entry point read
         the fragment out of the address bar. */
      const url = new URL(decoded);
      eq(url.pathname, "/join", "the QR points somewhere other than /join");
      eq(url.search, "", "the QR put something in a query string");
      assert(url.hash.startsWith("#"), "the credential is not in the fragment");

      let replaced = null;
      const loc = { hash: url.hash, pathname: url.pathname, search: url.search };
      const hist = { replaceState: (a, b, to) => { replaced = to; } };
      const arrived = ENTRY.takeInvitationFromUrl(loc, hist);
      eq(arrived, url.hash.slice(1), "the entry point did not take the credential");
      eq(replaced, "/join", "the fragment was not stripped from the address bar");

      /* And it redeems, which is the whole journey in one assertion. */
      const before = (await world()).relationships.length;
      eq((await accept(arrived, DANA_TOKEN)).status, 200, "the scanned invitation did not redeem");
      eq((await world()).relationships.length, before + 1, "no relationship came of it");
    } finally { await close(); }
  });

  test("a shop can invite with no name and no address at all", async () => {
    const { close, shop, world, mailer } = await connect();
    try {
      const r = await shop();
      clickText(r, "Invite a collector");
      await submit(r);                                   /* nothing typed */
      assert(shownCredential(r), "an invitation with nothing typed was not created");
      assert(svgs(r).length >= 1, "no QR for an in-person invitation");
      eq(mailer.sent.length, 0, "an email was sent for an invitation with no address");
      const invitations = (await world()).invitations;
      eq(invitations.length, 1, "the invitation was not created");
      eq(invitations[0].recipient, null, "a label was invented");
      eq(invitations[0].collectorId, null, "the invitation created a Collector");
    } finally { await close(); }
  });

  test("the form says every field is optional, and the panel says it is one invitation", async () => {
    const { close, shop } = await connect();
    try {
      const r = await shop();
      clickText(r, "Invite a collector");
      const form = flat(r);
      assert(/Nothing below is required/i.test(form), "the form does not say it is optional");
      assert(/Who is this for \(optional\)/.test(form), "the name does not read as optional");
      assert(/Email \(optional\)/.test(form), "the address does not read as optional");
      /* And the label is described as what it is, not as who they are. */
      assert(/does not become their name/i.test(form),
        "the form does not say the label is not the collector's name");

      await submit(r);
      const panel = flat(r);
      assert(/One invitation/i.test(panel), "the panel does not say it is one invitation");
      assert(/same invitation/i.test(panel), "the panel does not say the channels are the same one");
    } finally { await close(); }
  });

  test("an emailed invitation still behaves exactly as Batch 3B-2 left it", async () => {
    const { close, shop, mailer, raw } = await connect();
    try {
      const r = await shop();
      await createInvitation(r, { email: ADDRESS });
      eq(mailer.sent.length, 1, `${mailer.sent.length} provider requests for one invitation`);
      eq(mailer.sent[0].to, ADDRESS, "the message went somewhere else");
      const credential = shownCredential(r);
      assert(mailer.sent[0].text.includes(`${APP_URL}/join#${credential}`),
        "the email does not carry the same link");
      /* And the QR beside it is that same link again. */
      eq(decode(symbolFromSvg(svgs(r)[0])), `${APP_URL}/join#${credential}`,
        "the QR and the email disagree");
      const rows = await raw("select delivered_to from metyet_auth.collector_invitation_credentials");
      eq(rows[0].delivered_to, ADDRESS, "the delivery address was not recorded");
    } finally { await close(); }
  });
});

/* ============================================================== B
   THE INVITATION'S OWN RULES, UNCHANGED BY THE CHANNEL             */
describe("B. one invitation's rules", () => {
  test("a scanned credential is single use", async () => {
    const { close, shop, accept } = await connect();
    try {
      const r = await shop();
      await createInvitation(r);
      const credential = decode(symbolFromSvg(svgs(r)[0])).split("#")[1];
      eq((await accept(credential, DANA_TOKEN)).status, 200, "the first redemption failed");
      const second = await accept(credential, "token-for:sub-someone-else");
      eq(second.status, 409, "a scanned credential was spent twice");
    } finally { await close(); }
  });

  test("withdrawing kills the QR's invitation, because there is only one", async () => {
    const { close, shop, command, accept, world } = await connect();
    try {
      const r = await shop();
      await createInvitation(r);
      const credential = decode(symbolFromSvg(svgs(r)[0])).split("#")[1];
      const invitationId = (await world()).invitations[0].id;
      eq((await command("revokeCollectorInvitation", { invitationId })).status, 200,
        "withdrawing failed");
      eq((await accept(credential, DANA_TOKEN)).status, 409,
        "a withdrawn invitation was still redeemable from its QR");
    } finally { await close(); }
  });

  test("an expired invitation cannot be redeemed, however it was handed over", async () => {
    const { close, shop, accept, repository, world } = await connect();
    try {
      const r = await shop();
      await createInvitation(r);
      const credential = decode(symbolFromSvg(svgs(r)[0])).split("#")[1];
      /* Age it past its own expiry, in the canonical world. */
      const now = await world();
      await repository.saveWorld({ ...now,
        invitations: now.invitations.map((i) => ({ ...i, expiresAt: "2020-01-01T00:00:00.000Z" })) });
      eq((await accept(credential, DANA_TOKEN)).status, 409, "an expired invitation redeemed");
    } finally { await close(); }
  });

  test("replacing issues a new invitation and kills the old QR", async () => {
    const { close, shop, accept, world } = await connect({
      mailer: fakeMailer(() => ({ ok: false, failure: "rejected" })),
    });
    try {
      const r = await shop();
      await createInvitation(r, { email: ADDRESS });
      const old = decode(symbolFromSvg(svgs(r)[0])).split("#")[1];
      clickText(r, "Done");
      clickText(r, "Replace invitation");
      await submit(r);
      const fresh = decode(symbolFromSvg(svgs(r)[0])).split("#")[1];
      assert(fresh && fresh !== old, "replacing produced the same secret");

      eq((await accept(old, DANA_TOKEN)).status, 409, "the replaced QR still redeems");
      eq((await accept(fresh, DANA_TOKEN)).status, 200, "the fresh QR does not redeem");
      const live = (await world()).invitations.filter((i) => !i.revokedAt && !i.acceptedAt);
      eq(live.length, 0, "a live invitation survived being accepted and replaced");
    } finally { await close(); }
  });
});

/* ============================================================== C
   THE ADDRESS IS STILL A DESTINATION, AND THE LABEL IS STILL A LABEL */
describe("C. what the invitation does not decide", () => {
  test("somebody signing in at another address still redeems a scanned invitation", async () => {
    const { close, shop, accept, world } = await connect();
    try {
      const r = await shop();
      await createInvitation(r, { email: ADDRESS });
      const credential = decode(symbolFromSvg(svgs(r)[0])).split("#")[1];
      const before = (await world()).collectors.length;
      eq((await accept(credential, DANA_TOKEN)).status, 200,
        "the invitation refused a different address");
      eq((await world()).collectors.length, before + 1, "no Collector came of it");
    } finally { await close(); }
  });

  test("the TP's label never becomes the Collector's name", async () => {
    const { close, shop, accept, view, world } = await connect();
    try {
      const r = await shop();
      const before = new Set((await world()).collectors.map((c) => c.id));
      await createInvitation(r, { recipient: "Dana from the Tuesday show" });
      const credential = decode(symbolFromSvg(svgs(r)[0])).split("#")[1];
      eq((await accept(credential, DANA_TOKEN)).status, 200, "acceptance failed");

      const made = (await world()).collectors.find((c) => !before.has(c.id));
      assert(made, "no Collector was created");
      eq(Object.keys(made).sort().join(), "id", "the Collector was born with more than an id");
      assert(!("name" in made), "the label became a name");

      /* And the label never reaches them, in either direction. */
      const theirs = await view(DANA_TOKEN);
      assert(!JSON.stringify(theirs.body.state).includes("Tuesday show"),
        "the collector received the words their shop wrote about them");
    } finally { await close(); }
  });

  test("the delivery address stays out of every Collector-facing reply", async () => {
    const { close, shop, accept, view, world } = await connect();
    try {
      const r = await shop();
      await createInvitation(r, { email: ADDRESS });
      const credential = decode(symbolFromSvg(svgs(r)[0])).split("#")[1];
      const accepted = await accept(credential, DANA_TOKEN);
      eq(accepted.status, 200, "acceptance failed");
      assert(!JSON.stringify(accepted.body).includes(ADDRESS),
        "the acceptance reply carries the delivery address");
      assert(!JSON.stringify((await view(DANA_TOKEN)).body).includes(ADDRESS),
        "the collector's projection carries the delivery address");
      assert(!JSON.stringify(await world()).includes(ADDRESS),
        "the canonical world carries the delivery address");
    } finally { await close(); }
  });

  test("nothing in the product matches an authenticated address against a delivery address", () => {
    const acceptance = code("server/collector-acceptance.js");
    assert(!/email|delivered_to|deliveredTo|address/i.test(acceptance),
      "the acceptance transaction learned about addresses");
    assert(!/email|address/i.test(code("domain/metyet-registration.js")),
      "the domain operation learned about addresses");
  });
});

/* ============================================================== D
   THE SECRET STAYS WHERE IT WAS                                    */
describe("D. where the credential is, and is not", () => {
  test("the QR module reaches no network, no storage and no address bar", () => {
    for (const rel of ["client/qr/encode.js", "client/qr/Qr.jsx"]) {
      const bare = code(rel);
      assert(!/\bfetch\s*\(|XMLHttpRequest|EventSource|WebSocket|new Image|src\s*=/.test(bare),
        `${rel} reaches the network`);
      assert(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(bare),
        `${rel} persists something`);
      assert(!/location\s*[.[]|\.hash\b|URLSearchParams|history\s*\./.test(bare),
        `${rel} reads the address bar`);
      assert(!/console\./.test(bare), `${rel} logs`);
    }
  });

  test("encoding a symbol performs no request of any kind", async () => {
    /* Every way a browser could reach out, taken away for the duration. */
    const globals = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "Image", "navigator"];
    const saved = new Map();
    for (const name of globals) {
      saved.set(name, globalThis[name]);
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get() { throw new Error(`the QR path reached for ${name}`); },
      });
    }
    try {
      const symbol = QR.encodeQr(`${APP_URL}/join#0123456789abcdefghjkmnpqrstvwxyz`);
      eq(decode(symbol), `${APP_URL}/join#0123456789abcdefghjkmnpqrstvwxyz`,
        "the symbol did not survive being built with no browser to reach");
    } finally {
      for (const name of globals) {
        delete globalThis[name];
        if (saved.get(name) !== undefined) globalThis[name] = saved.get(name);
      }
    }
  });

  test("no file in the product names a QR service", () => {
    const walk = (dir, out = []) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel, out);
        else if (/\.(jsx?|mjs|cjs)$/.test(e.name)) out.push(rel);
      }
      return out;
    };
    const SERVICES = /qrserver|goqr|chart\.googleapis|quickchart|qrcode\.show|api\.qrcode/i;
    for (const rel of [...walk("client"), ...walk("app-src"), ...walk("server")]) {
      assert(!SERVICES.test(src(rel)), `${rel} names a hosted QR service`);
    }
  });

  test("the credential is not persisted, and not in a query string", async () => {
    const { close, shop, calls } = await connect();
    try {
      const r = await shop();
      await createInvitation(r);
      const credential = shownCredential(r);
      for (const call of calls) {
        assert(!call.url.includes(credential), "a credential travelled in a URL: " + call.url);
        assert(!call.url.includes("?"), "a request grew a query string: " + call.url);
      }
      for (const rel of ["client/tp/sections/CollectorNetwork.jsx", "client/qr/Qr.jsx",
        "client/qr/encode.js", "client/sign-in/SignIn.jsx", "app-src/main.jsx"]) {
        assert(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(code(rel)),
          `${rel} persists the credential`);
      }
    } finally { await close(); }
  });

  test("the QR exists only where the plaintext legitimately does", async () => {
    const { close, shop } = await connect();
    try {
      const r = await shop();
      eq(svgs(r).length, 0, "a QR was on screen before an invitation existed");
      await createInvitation(r);
      assert(svgs(r).length >= 1, "no QR on the handoff panel");
      clickText(r, "Done");
      eq(svgs(r).length, 0, "the QR outlived the panel that held the credential");
      assert(!flat(r).includes(`${APP_URL}/join#`), "the link outlived the panel");
    } finally { await close(); }
  });
});

/* ============================================================== E
   THE ENCODER ITSELF                                               */
describe("E. the symbol", () => {
  test("every supported version round-trips through an independent decoder", () => {
    for (const v of QR.VERSIONS) {
      for (const length of [v.capacity, v.capacity - 1]) {
        if (length < 1) continue;
        const text = "x".repeat(length);
        const symbol = QR.encodeQr(text);
        eq(symbol.version, v.version, `${length} characters chose version ${symbol.version}`);
        eq(decode(symbol), text, `version ${v.version} at ${length} characters did not decode`);
      }
    }
  });

  test("it refuses what it cannot carry, rather than truncating it", () => {
    const biggest = QR.VERSIONS[QR.VERSIONS.length - 1].capacity;
    let threw = null;
    try { QR.encodeQr("z".repeat(biggest + 1)); } catch (error) { threw = error; }
    assert(threw && threw.name === "QrError", "an oversized value was not refused");
    let empty = null;
    try { QR.encodeQr(""); } catch (error) { empty = error; }
    assert(empty, "an empty value produced a symbol");
  });

  test("the picture has its quiet zone, and is big enough to scan", async () => {
    const { close, shop } = await connect();
    try {
      const r = await shop();
      await createInvitation(r);
      const svg = svgs(r)[0];
      const symbol = symbolFromSvg(svg);
      const span = Number(String(svg.props.viewBox).split(" ")[2]);
      eq(span - symbol.size, 8, "the quiet zone is not four modules on each side");
      assert(Number(svg.props.width) >= 180, "the symbol is too small to scan reliably");
      /* Nothing is drawn in the margin. */
      const path = svg.findAll((n) => n.type === "path")[0];
      for (const m of String(path.props.d).matchAll(/M(\d+) (\d+)h/g)) {
        const x = Number(m[1]);
        const y = Number(m[2]);
        assert(x >= 4 && y >= 4 && x < span - 4 && y < span - 4, "a module was drawn in the quiet zone");
      }
    } finally { await close(); }
  });
});

run();
