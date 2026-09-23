/* ============================================================================
   PHASE 5 BATCH 3B-1 — ARRIVING BY LINK

   Batch 3A let somebody accept an invitation by typing a code. That works
   across a counter and nowhere else. This batch makes the link work:

     https://app.metyet.io/join#<credential>

   and the whole of it is one question — where may a secret live on its way from
   an email to an acceptance?

   THE FRAGMENT, AND WHY IT IS THE ONLY CHOICE. Browsers never put the fragment
   in an HTTP request. It reaches no server log, no access log, no `Referer` sent
   to anything the page loads. A query string does all three, which is why a
   credential must never be in one — and why this suite spends as much effort
   proving the query string is IGNORED as proving the fragment is read.

   ONE FILE READS THE ADDRESS BAR, and it is the entry point. <SignIn/> holds the
   code in memory and knows nothing about URLs — Batch 3A asserted that, and
   this batch keeps that assertion true rather than editing it. A screen that
   could read a link is a screen a link could tell anything.

   AND NOTHING THE LINK SAYS IS TRUSTED BEYOND THE CODE ITSELF. Not a shop name,
   not a path, not a query parameter. A link that could name the inviting shop
   could name the WRONG shop, and MetYet would be repeating a stranger's claim to
   somebody in the act of accepting it.

     A  arriving by link, end to end
     B  what a URL cannot say
     C  the credential goes nowhere it could be read again
     D  acceptance is still something a person does
     E  arriving is not a state the page keeps handing back
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

const load = (rel, format = "cjs") => {
  const out = esbuild.buildSync({
    entryPoints: [path.join(ROOT, rel)],
    bundle: true, format, write: false, logLevel: "silent", jsx: "automatic",
    external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};

/* THE FRONT DOOR ITSELF. Importing it here is the point: it defines its
   functions and mounts nothing, because there is no document. */
const ENTRY = load("app-src/main.jsx");
const API = load("client/api.js");
const STORE = load("client/production-store.js");
const AUTH = load("client/supabase-auth.js");
const SESSION = load("client/supabase-session.js");
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
/* THE CONFIRM SCREEN, BY WHAT IT OFFERS RATHER THAN WHAT IT SAYS (rewritten in
   Batch 3D). This was detected by one exact sentence, which made five tests
   depend on copy they were not written to protect. What identifies the screen
   is that it offers to accept the invitation — a control, not a phrase. */
const onConfirmScreen = (r) => clickable(r, "Accept invitation");
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
const field = (r, label) => {
  const all = r.root.findAll((n) => n.type === "label");
  const lab = all.find((n) => instText(n).startsWith(label));
  assert(lab, `no field "${label}" among: ${all.map(instText).join(" | ")}`);
  const id = lab.props.htmlFor;
  return r.root.findAll((n) => n.type === "input" && n.props.id === id)[0];
};
const typeInto = (r, label, value) => {
  const input = field(r, label);
  assert(input, `field "${label}" has nothing to type into`);
  TR.act(() => { input.props.onChange({ target: { value } }); });
};
const submit = async (r) => {
  const form = r.root.findAll((n) => n.type === "form")[0];
  assert(form, "the form is not on screen");
  await TR.act(async () => { await form.props.onSubmit({ preventDefault() {} }); });
};

/* ---------------------------------------------------------- a fake address bar

   `replaceState` here does what a browser does: it rewrites the current entry,
   so the fragment stops being there. Tests below depend on that, because "the
   credential is gone from the address bar" and "a second read finds nothing"
   are the same fact seen twice. */
const addressBar = (url) => {
  const u = new URL(url);
  const calls = [];
  const loc = { get href() { return u.href; }, get pathname() { return u.pathname; },
    get search() { return u.search; }, get hash() { return u.hash; } };
  const hist = {
    replaceState(state, title, next) {
      calls.push(next);
      const resolved = new URL(next, u.href);
      u.pathname = resolved.pathname; u.search = resolved.search; u.hash = resolved.hash;
    },
  };
  return { loc, hist, calls, current: () => u.href };
};

const CREDENTIAL = "k7m4p2q9wxyz3rst5vbn8dfg6hjc0a1e";   // 32 symbols, the shape the runtime mints

/* ----------------------------------------------------------- a real server */
const DANA = "sub-dana";
const PROJECT = "https://projectref.supabase.co";
const KEY = "sb_publishable_example";

const connect = async () => {
  const { app, close, repository } = await H.serve(createApp, { collectorCredentials: true });
  const f = H.fetchFor(app);

  const invite = async (recipient = "Dana at the Tuesday show") => {
    const res = await f("http://localhost/api/invitations/collector", { method: "POST",
      headers: { authorization: `Bearer ${H.TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ recipient, note: null }) });
    eq(res.status, 200, "the invitation was not created");
    return (await res.json()).credential;
  };

  /* The three lines the entry point is, with a stand-in only for the identity
     provider — exactly as every other suite here does it. */
  const arrive = (arrivedWith) => {
    const authFetch = async (url, init) => {
      const u = String(url);
      if (u.includes("/auth/v1/otp")) return { status: 200, async json() { return {}; } };
      if (u.includes("/auth/v1/verify")) {
        return { status: 200, async json() {
          return { access_token: `token-for:${DANA}`, refresh_token: "r",
            expires_at: Math.floor(Date.now() / 1000) + 3600 };
        } };
      }
      if (u.includes("/auth/v1/logout")) return { status: 204, async json() { return {}; } };
      return f(url, init);
    };
    const auth = AUTH.createSupabaseAuth({ supabaseUrl: PROJECT, publishableKey: KEY, fetchImpl: authFetch });
    const session = SESSION.createSupabaseSession({ auth });
    const api = API.createApiClient({ baseUrl: "http://localhost",
      getToken: () => session.token(), fetchImpl: f });
    const store = STORE.createProductionStore({ api });
    return render(React.createElement(SIGNIN.default, { session, store, arrivedWith }));
  };

  const world = () => repository.loadWorld();
  const newCollectors = async () =>
    (await world()).collectors.filter((c) => c.id !== H.COLLECTOR && c.id !== "c-stranger");

  return { close, app, invite, arrive, world, newCollectors };
};

/* Sign in, in this tab, the way a person does. */
const signIn = async (r) => {
  typeInto(r, "Email address", "dana@somewhere-else.example");
  await submit(r);
  typeInto(r, "Code from the email", "24681357");
  await submit(r);
};

/* ============================================================== A */
describe("A. arriving by link", () => {
  test("the credential is read from the fragment and the address bar is cleared", () => {
    const bar = addressBar(`https://app.metyet.io/join#${CREDENTIAL}`);
    const got = ENTRY.takeInvitationFromUrl(bar.loc, bar.hist);

    eq(got, CREDENTIAL, "the credential was not read out of the fragment");
    eq(bar.calls.length, 1, "history.replaceState was not called exactly once");
    assert(!bar.current().includes(CREDENTIAL), "the credential is still in the address bar: " + bar.current());
    assert(!bar.current().includes("#"), "a fragment survived: " + bar.current());
    eq(bar.current(), "https://app.metyet.io/join", "the path was not preserved");
  });

  test("a second read finds nothing, because the first one took it", () => {
    /* The strip is not cosmetic. Anything that re-reads the address bar later —
       a re-render, a re-mount, a curious future batch — finds an empty
       fragment, so an invitation cannot be re-armed from the URL. */
    const bar = addressBar(`https://app.metyet.io/join#${CREDENTIAL}`);
    eq(ENTRY.takeInvitationFromUrl(bar.loc, bar.hist), CREDENTIAL, "the first read");
    eq(ENTRY.takeInvitationFromUrl(bar.loc, bar.hist), null, "a second read found a credential");
  });

  test("the code arrives in the sign-in flow as though it had been typed", async () => {
    const { close, invite, arrive } = await connect();
    try {
      const credential = await invite();
      const r = arrive(credential);
      const shown = flat(r);
      /* THE PROPERTY, NOT THE SENTENCE (rewritten in Batch 3C). This asserted
         one exact line of copy, which made it a test of the wording rather than
         of the behaviour it was written to protect. The behaviour is that the
         entrance KNOWS it is holding an invitation: it says so, and it stops
         offering to take one. The second of those is structural and cannot
         drift with the copy, so it carries the weight now. */
      assert(!clickable(r, "I have an invitation code"),
        "it offered to take a code it was already holding");
      assert(/invitation/i.test(shown),
        "the entrance does not know an invitation arrived: " + shown);
      assert(!shown.includes(credential), "the code is on screen");
    } finally { await close(); }
  });

  test("link, sign-in, accept — the whole journey in one tab", async () => {
    const { close, invite, arrive, newCollectors, world } = await connect();
    try {
      const credential = await invite();
      const bar = addressBar(`https://app.metyet.io/join#${credential}`);
      const r = arrive(ENTRY.takeInvitationFromUrl(bar.loc, bar.hist));

      await signIn(r);
      /* THE INTENT SURVIVED THE ROUND TRIP, and nothing was stored to make it:
         this component never unmounted, and the code sat in its state. */
      assert(onConfirmScreen(r), "the confirm screen did not appear: " + flat(r));
      eq((await newCollectors()).length, 0, "signing in accepted something");

      await press(r, "Accept invitation");
      const after = flat(r);
      assert(/joined/i.test(after) && /Northline/.test(after), "the shell does not say who they joined: " + after);
      eq((await newCollectors()).length, 1, "accepting created nobody");
      eq((await world()).relationships.filter((x) => x.partnerId === H.PARTNER).length, 2,
        "the Relationship was not created");
      assert(!after.includes(credential), "the credential is on screen after acceptance");
    } finally { await close(); }
  });

  test("the typed path still works, exactly as before", async () => {
    const { close, invite, arrive, newCollectors } = await connect();
    try {
      const credential = await invite();
      const r = arrive(null);                      // nobody followed a link
      assert(clickable(r, "I have an invitation code"), "the typed path is gone");
      clickText(r, "I have an invitation code");
      typeInto(r, "Invitation code", credential);
      await submit(r);
      await signIn(r);
      assert(onConfirmScreen(r), "the confirm screen did not appear: " + flat(r));
      await press(r, "Accept invitation");
      eq((await newCollectors()).length, 1, "the typed path stopped working");
    } finally { await close(); }
  });
});

/* ============================================================== B */
describe("B. what a URL cannot say", () => {
  test("a credential in the QUERY STRING is not an invitation", () => {
    /* The query string is sent to the server. It lands in access logs, in
       request logs, and in the `Referer` of anything the page fetches. A
       credential there is a credential published. */
    const bar = addressBar(`https://app.metyet.io/join?code=${CREDENTIAL}`);
    eq(ENTRY.takeInvitationFromUrl(bar.loc, bar.hist), null, "a query-string credential was accepted");
  });

  test("a credential in the PATH is not an invitation", () => {
    const bar = addressBar(`https://app.metyet.io/join/${CREDENTIAL}`);
    eq(ENTRY.takeInvitationFromUrl(bar.loc, bar.hist), null, "a path credential was accepted");
  });

  test("the query string is preserved, not consumed, when a fragment is stripped", () => {
    const bar = addressBar(`https://app.metyet.io/join?ref=poster#${CREDENTIAL}`);
    eq(ENTRY.takeInvitationFromUrl(bar.loc, bar.hist), CREDENTIAL, "the fragment");
    eq(bar.current(), "https://app.metyet.io/join?ref=poster", "the rest of the URL was rewritten too");
  });

  test("a fragment that is not a credential becomes nothing, and still goes", () => {
    /* Two rules at once. Junk does not become "an invitation" the person is
       then asked to accept — a fragment carrying a word, a URL or markup is
       simply not a code. And whatever it carried leaves the address bar anyway:
       something unreadable sitting in a URL is still sitting in a URL. */
    for (const junk of ["hello", "<script>alert(1)</script>", "https://evil.example/x",
      "short", "A".repeat(200), "has space", "code=" + CREDENTIAL, "../../etc/passwd"]) {
      const bar = addressBar(`https://app.metyet.io/join#${encodeURIComponent(junk)}`);
      eq(ENTRY.takeInvitationFromUrl(bar.loc, bar.hist), null, `"${junk.slice(0, 24)}" became an invitation`);
      assert(!bar.current().includes(encodeURIComponent(junk)) && !bar.current().includes(junk),
        `the fragment survived for "${junk.slice(0, 24)}": ${bar.current()}`);
    }
    /* An empty fragment is the one case with nothing to take: `#` alone. It
       carries no credential and there is nothing to strip. */
    const bare = addressBar("https://app.metyet.io/join#");
    eq(ENTRY.takeInvitationFromUrl(bare.loc, bare.hist), null, "an empty fragment became an invitation");
  });

  test("NOTHING ABOUT THE INVITING SHOP COMES FROM THE URL", () => {
    /* The sharpest thing in this batch. A link that could name the shop could
       name the WRONG shop — `?shop=Northline` beside somebody else's
       credential — and MetYet would be repeating a stranger's claim to a person
       in the act of accepting it. So the entry returns a code and nothing else,
       and the confirm screen names no shop at all. */
    const bar = addressBar(
      `https://app.metyet.io/join?shop=Northline%20Cards&partnerId=p1#${CREDENTIAL}`);
    const got = ENTRY.takeInvitationFromUrl(bar.loc, bar.hist);
    eq(typeof got, "string", "the entry returned something other than a bare code");
    eq(got, CREDENTIAL, "the code");

    const entry = code("app-src/main.jsx");
    assert(!/shop|partner|store/i.test(entry.replace(/production-store|createProductionStore|store\b/g, "")),
      "the entry point reads something about a shop from the URL");

    const signin = code("client/sign-in/SignIn.jsx");
    assert(!/arrivedWith[\s\S]{0,80}(shop|partner|name)/i.test(signin),
      "the entrance takes a shop name from what it arrived with");
  });

  test("the shop IS named before acceptance now — and only ever by the server", async () => {
    /* REWRITTEN IN BATCH 3D, DELIBERATELY. This asserted that no shop was named
       before acceptance, because the only way to name one was to look the code
       up and Batch 3A would not add that route. Batch 3D added it — read-only,
       one name, spending nothing — and the reasoning sits beside it in
       server/app.js.

       WHAT THE ORIGINAL TEST WAS REALLY PROTECTING SURVIVES INTACT: that a
       shop's name can never be something a LINK claimed. A link that could name
       a shop could name the wrong one, and MetYet would be repeating an
       attacker's claim to somebody about to accept it. So the assertion is no
       longer "no name" — it is "the name came from the server". */
    const { close, invite, arrive } = await connect();
    try {
      const credential = await invite();
      /* The thing the browser was handed carries no name and could not. */
      assert(!/northline/i.test(credential), "the credential itself carries a name");
      const r = arrive(credential);
      await signIn(r);
      const shown = flat(r);
      assert(onConfirmScreen(r), "not the confirm screen: " + shown);
      assert(/Northline/.test(shown), "the shop was not named: " + shown);
      /* And it still names what accepting DOES, which is the part that needs
         consent and is the reason this screen exists at all. */
      /* WHAT IT MUST SAY, NOT HOW IT SAYS IT (corrected in Phase 5 C5). This
         used to pin the sentence word for word — "goals you set and the cards
         in your Trade Binder" — and so it froze a disclosure that had been
         wrong since C2: the Trade Binder stopped existing when owning and
         offering became two facts, and a partner has never received a
         Collector's cards merely for being owned. A pin on exact copy cannot
         tell a rewrite from a regression, so this one now asks for the three
         things the projection actually does, and forbids the noun by name. */
      assert(/goals you set/.test(shown), "the screen does not say Goals are shared: " + shown);
      assert(/choose to offer/.test(shown), "it does not say offering is the Collector's choice: " + shown);
      assert(/stay private/.test(shown), "it does not say what stays private: " + shown);
      assert(/binders/i.test(shown), "it does not mention binders: " + shown);
      assert(!/Trade Binder/i.test(shown), "the stale disclosure came back: " + shown);
    } finally { await close(); }
  });
});

/* ============================================================== C */
describe("C. the credential goes nowhere it could be read again", () => {
  test("the whole journey writes to no browser storage — measured, not assumed", async () => {
    /* A spy in place of every storage a browser offers. If any code on this
       path wrote the credential — or anything else — it is recorded here. This
       is the behavioural half; the structural half is below, and neither is
       enough alone. */
    const writes = [];
    const spy = (name) => ({
      getItem: () => null,
      setItem: (k, v) => writes.push({ store: name, key: k, value: v }),
      removeItem: (k) => writes.push({ store: name, key: k, value: null }),
      clear: () => writes.push({ store: name, key: "*", value: null }),
    });
    const had = {
      local: Object.getOwnPropertyDescriptor(globalThis, "localStorage"),
      session: Object.getOwnPropertyDescriptor(globalThis, "sessionStorage"),
    };
    globalThis.localStorage = spy("localStorage");
    globalThis.sessionStorage = spy("sessionStorage");

    const { close, invite, arrive } = await connect();
    try {
      const credential = await invite();
      const bar = addressBar(`https://app.metyet.io/join#${credential}`);
      const r = arrive(ENTRY.takeInvitationFromUrl(bar.loc, bar.hist));
      await signIn(r);
      await press(r, "Accept invitation");

      eq(writes.length, 0, "the journey wrote to browser storage: " + JSON.stringify(writes));
    } finally {
      await close();
      if (had.local) Object.defineProperty(globalThis, "localStorage", had.local);
      else delete globalThis.localStorage;
      if (had.session) Object.defineProperty(globalThis, "sessionStorage", had.session);
      else delete globalThis.sessionStorage;
    }
  });

  test("neither file the batch touched can persist anything", () => {
    for (const rel of ["app-src/main.jsx", "client/sign-in/SignIn.jsx"]) {
      const bare = code(rel);
      assert(!/localStorage|sessionStorage|document\.cookie|indexedDB|IDBFactory/.test(bare),
        `${rel} persists something`);
    }
  });

  test("<SignIn/> REMAINS URL-BLIND, which is what let the entry do this", () => {
    /* Batch 3A asserted this and this batch keeps it true rather than editing
       it — the design was chosen so the guard-rail could stay standing. Stated
       here too, in this batch's own words, because a batch that relies on an
       invariant should say so where it relies on it. */
    const bare = code("client/sign-in/SignIn.jsx");
    assert(!/location\s*\.|window\s*\.|URLSearchParams|history\s*\./.test(bare),
      "the entrance learned to read the address bar");
    assert(/arrivedWith/.test(bare), "the entrance is no longer handed what it arrived with");
  });

  test("exactly one file in the product reads the fragment", () => {
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
  });

  test("the credential reaches the server in a body, and appears nowhere else", async () => {
    const { close, invite, app } = await connect();
    try {
      const credential = await invite();
      const seen = [];
      const watch = async (url, init) => {
        seen.push({ url: String(url), body: init && init.body ? String(init.body) : "" });
        return H.fetchFor(app)(url, init);
      };
      const api = API.createApiClient({ baseUrl: "http://localhost",
        getToken: async () => `token-for:${DANA}`, fetchImpl: watch });
      const store = STORE.createProductionStore({ api });
      const COMMANDS = load("client/commands.js");
      await COMMANDS.acceptCollectorInvitation(store)(credential);

      const carrying = seen.filter((s) => s.body.includes(credential) || s.url.includes(credential));
      eq(carrying.length, 1, "the credential travelled more than once: " + carrying.length);
      assert(carrying[0].url.endsWith("/api/invitations/collector/accept"), "a different route");
      assert(!carrying[0].url.includes(credential), "the credential is in a URL, not a body");
      eq(JSON.parse(carrying[0].body).token, credential, "it is not the token field");
      /* And the projection it answered with carries nothing of it. */
      assert(!JSON.stringify(store.get()).includes(credential), "the projection holds the credential");
    } finally { await close(); }
  });
});

/* ============================================================== D */
describe("D. acceptance is still something a person does", () => {
  test("arriving with a link and signing in accepts NOTHING on its own", async () => {
    const { close, invite, arrive, newCollectors, world } = await connect();
    try {
      const credential = await invite();
      const before = await world();
      const r = arrive(credential);
      await signIn(r);

      eq((await newCollectors()).length, 0, "following a link created somebody");
      eq(JSON.stringify(await world()), JSON.stringify(before), "signing in changed the world");
      assert(clickable(r, "Accept invitation"), "there is nothing left to press");
      assert(clickable(r, "Not now"), "there is no way to decline");
    } finally { await close(); }
  });

  test("declining a link invitation joins nothing, and says where they stand", async () => {
    const { close, invite, arrive, newCollectors } = await connect();
    try {
      const r = arrive(await invite());
      await signIn(r);
      await press(r, "Not now");
      eq((await newCollectors()).length, 0, "declining created somebody");
      assert(/not a MetYet account yet/.test(flat(r)),
        "somebody who declined is not told where they stand: " + flat(r));
    } finally { await close(); }
  });
});

/* ============================================================== E */
describe("E. arriving is not a state the page keeps handing back", () => {
  test("SIGNING OUT drops the invitation, and nothing puts it back", async () => {
    /* A MUTATION ESCAPED HERE, and it was worth the escape. The first version of
       this test reached sign-out by way of "Not now", which already drops the
       code — so removing the clear from sign-out changed nothing it could see.

       AND THAT IS STILL TRUE, WHICH IS WORTH SAYING PLAINLY. No screen in this
       build reaches sign-out while an invitation is still held: the confirm
       screen offers only Accept and Not now, both of which drop it, and the
       phases that do offer Sign out are unreachable while one is held. So the
       clear inside `signOut` is a guarantee for the screens that come next
       rather than one this journey exercises, and the assertion that really
       holds it is the structural one below. This test covers the path a person
       can walk; it does not pretend to prove more than that. */
    const { close, invite, arrive } = await connect();
    try {
      const r = arrive(await invite());
      typeInto(r, "Email address", "dana@somewhere-else.example");
      await submit(r);
      typeInto(r, "Code from the email", "24681357");
      await submit(r);
      assert(onConfirmScreen(r), "not the confirm screen: " + flat(r));
      /* Holding an invitation, signed in, and leaving. */
      await press(r, "Not now");
      await press(r, "Sign out");
      assert(!/You have an invitation code ready/.test(flat(r)),
        "the invitation survived a sign-out: " + flat(r));
      assert(clickable(r, "I have an invitation code"),
        "the entrance still believes it holds a code");
    } finally { await close(); }
  });

  test("CORRECTING AN ADDRESS keeps the invitation, because a link cannot be re-read", async () => {
    /* The other half, and the one B3B-1 created. "Use a different address" is a
       typo being fixed, not a session ending — and the fragment that carried the
       code was taken out of the address bar before anything rendered, so a
       person who lost it here would have nothing to recover it from. */
    const { close, invite, arrive, newCollectors } = await connect();
    try {
      const r = arrive(await invite());
      typeInto(r, "Email address", "typo@wrong.example");
      await submit(r);
      assert(/We sent a code to/.test(flat(r)), "not the code screen: " + flat(r));

      await press(r, "Use a different address");
      const shown = flat(r);
      /* Structural first, for the reason given above: whether the entrance is
         still holding the invitation is decided by whether it is asking for
         one, not by which sentence it uses to say so. */
      assert(!clickable(r, "I have an invitation code"),
        "THE INVITATION WAS LOST BY CORRECTING AN EMAIL ADDRESS, and a link cannot be "
        + "re-read to get it back: " + shown);
      assert(/invitation/i.test(shown),
        "it is no longer saying it holds an invitation: " + shown);

      /* And it still works: the journey completes on the second address. */
      typeInto(r, "Email address", "dana@somewhere-else.example");
      await submit(r);
      typeInto(r, "Code from the email", "24681357");
      await submit(r);
      await press(r, "Accept invitation");
      eq((await newCollectors()).length, 1, "the corrected journey did not complete");
    } finally { await close(); }
  });

  test("the two acts are different functions, not one", () => {
    const bare = code("client/sign-in/SignIn.jsx");
    assert(/useDifferentAddress/.test(bare), "correcting an address is not its own act");
    const different = (bare.match(/const useDifferentAddress = useCallback\([\s\S]*?\}, \[session\]\);/) || [])[0];
    assert(different, "it is no longer shaped so this test can read it");
    assert(!/setInvitation/.test(different), "correcting an address clears the invitation");
    const out = (bare.match(/const signOut = useCallback\([\s\S]*?\}, \[session\]\);/) || [])[0];
    assert(out && /setInvitation\(null\)/.test(out), "signing out does not clear the invitation");
  });

  test("the old shared path is gone: declining still drops it too", async () => {
    /* The code is an INITIAL value, not a binding: `useState` reads the prop
       once. An effect that watched the prop would re-arm the invitation the
       moment somebody signed out — handing the next person at this browser an
       invitation they never received. */
    const { close, invite, arrive } = await connect();
    try {
      const r = arrive(await invite());
      await signIn(r);
      assert(onConfirmScreen(r), "not the confirm screen: " + flat(r));

      await press(r, "Not now");
      await press(r, "Sign out");

      const shown = flat(r);
      assert(/Sign in with the address you were invited at/.test(shown),
        "not back at the entrance: " + shown);
      assert(!/You have an invitation code ready/.test(shown),
        "THE INVITATION CAME BACK after signing out: " + shown);
      assert(clickable(r, "I have an invitation code"),
        "the entrance no longer offers to take a code, so it still believes it has one");
    } finally { await close(); }
  });

  test("the prop is read once, and is not watched", () => {
    const bare = code("client/sign-in/SignIn.jsx");
    assert(/useState\(arrivedWith \|\| null\)/.test(bare),
      "what the page arrived with is no longer the initial value of the code it holds");
    assert(!/useEffect\([^)]*arrivedWith|\[\s*arrivedWith\s*\]/.test(bare),
      "an effect watches what the page arrived with, so it can be re-armed");
  });
});

if (require.main === module) run();
module.exports = { run };
