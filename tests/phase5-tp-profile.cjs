/* ============================================================================
   PHASE 5 BATCH 1 — THE FIRST PRODUCTION WRITE

   Phase 4 built the authenticated mutation boundary and left it with no caller,
   which was the correct state and is no longer the state. This suite covers the
   first control in production that changes canonical MetYet state: a Trusted
   Partner editing their own shop profile.

   IT RUNS THE WHOLE PATH, AND NONE OF IT IS A STAND-IN:

     a control in <Profile/> -> onSave(patch) -> client/commands.js
       -> the production store -> the real api client -> POST /api/commands
         -> the real Fastify route -> the verified token -> the account directory
           -> the actor the SERVER derived -> the real command transaction
             -> the real domain -> a real migrated Postgres
               -> projectForActor -> the response -> the store -> the screen

   Only the identity provider is a stand-in, exactly as every server suite in
   this repository does it: a token names its subject.

   WHY THE TESTS ARE SHAPED THIS WAY. A component test that mocks a save proves
   the mock. The interesting questions in a first write are all at the seams —
   whether the browser can name an owner, whether a refusal can look like a
   success, whether the screen can show a value the server never accepted — and
   each of those is a lie that only shows up when the real server is on the
   other end.

     A  the screen is the projection, and edit mode starts from it
     B  the write, end to end, all the way back to the screen
     C  authority: whose profile, and whose to change
     D  refusal, conflict, ambiguity, and pressing twice
     E  privacy, measured at the socket
     F  the boundary the control reaches through
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
const PROFILE = load("client/tp/sections/Profile.jsx");
const { createApp } = require("../server/app.js");
const H = require("./helpers/command-server.cjs");

/* A second Trusted Partner, and a Collector related to nobody. Neither can be
   reached through the product — this is test provisioning, the same kind
   tests/helpers/command-server.cjs already does, and it closes no lifecycle
   gap. It exists so "only your own shop changed" is a claim about a world that
   contains somebody else's. */
const OTHER_PARTNER = "p-southline";
const OTHER_ABOUT = "SOUTHLINE-OWN-WORDS";
const STRANGER_SUBJECT = "sub-dana";
const STRANGER_TOKEN = `token-for:${STRANGER_SUBJECT}`;

/* ------------------------------------------------------------- rendering */

const render = (element) => {
  let r;
  TR.act(() => { r = TR.create(element); });
  return r;
};
const texts = (r) => {
  const out = [];
  const walk = (n) => {
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
const clickText = (r, label) => {
  const b = buttons(r).find((n) => instText(n).includes(label));
  assert(b, `no button "${label}" among: ${buttons(r).map(instText).join(" | ")}`);
  TR.act(() => { b.props.onClick(); });
};
const clickable = (r, label) => buttons(r).some((n) => instText(n).includes(label));

/* One labelled field of the form, found the way a person finds it: by its
   label, not by its position. */
const field = (r, label) => {
  const lab = r.root.findAll((n) => n.type === "label").find((n) => instText(n).startsWith(label));
  assert(lab, `no field "${label}" among: ${r.root.findAll((n) => n.type === "label").map(instText).join(" | ")}`);
  const input = lab.findAll((n) => n.type === "input" || n.type === "textarea")[0];
  assert(input, `field "${label}" has nothing to type into`);
  return input;
};
const typeInto = (r, label, value) => {
  const input = field(r, label);
  TR.act(() => { input.props.onChange({ target: { value } }); });
};
const submit = async (r) => {
  const form = r.root.findAll((n) => n.type === "form")[0];
  assert(form, "the form is not on screen");
  await TR.act(async () => { await form.props.onSubmit({ preventDefault() {} }); });
};

/* THE WIRING SignIn USES, AND NOTHING MORE. SignIn holds the store, subscribes
   to it, and hands the application the projection plus one bound callback.
   Those three lines are reproduced here rather than driving the whole sign-in
   flow, so that what is under test is the write and not the entrance — and a
   test below asserts SignIn really does bind and pass it. */
function Live({ store, onSaveProfile }) {
  const [state, setState] = React.useState(store.get());
  React.useEffect(() => store.sub(setState), [store]);
  return React.createElement(ProductionApp, { state, onSignOut() {}, onSaveProfile });
}

/* One real server, real clients for each seat, and a second shop in the world. */
const connect = async (opts = {}) => {
  const { app, close, repository, accounts } = await H.serve(createApp, opts);

  const world = H.world();
  world.partners = [...world.partners,
    { id: OTHER_PARTNER, name: "Southline Cards", about: OTHER_ABOUT, email: "south@example.com" }];
  await repository.saveWorld(world);
  await accounts.linkAccount({ subject: STRANGER_SUBJECT, role: "collector", collectorId: "c-stranger" });

  const seatClient = (token, fetchImpl = null) => {
    const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => token,
      fetchImpl: fetchImpl || H.fetchFor(app) });
    const store = STORE.createProductionStore({ api });
    return { api, store, onSaveProfile: COMMANDS.savePartnerProfile(store) };
  };

  /* The Trusted Partner, signed in, on the Shop Profile section. */
  const shop = async (fetchImpl = null) => {
    const seat = seatClient(H.TOKEN, fetchImpl);
    await seat.store.load();
    const r = render(React.createElement(Live, { store: seat.store, onSaveProfile: seat.onSaveProfile }));
    clickText(r, "Shop Profile");
    return { ...seat, r };
  };

  const partnerRow = async (id) =>
    (await repository.loadWorld()).partners.find((p) => p.id === id) || null;

  return { app, close, repository, accounts, seatClient, shop, partnerRow };
};

const SAVED = Object.freeze({
  about: "Vintage-first shop on Superior Street since 2009.",
  specialties: "Vintage, Graded, Sealed",
  website: "https://northline.example",
  instagram: "@northlinecards",
  email: "hello@northline.example",
  phone: "218-555-0117",
});
const fillAll = (r) => { for (const f of PROFILE.FIELDS) typeInto(r, f.label, SAVED[f.key]); };

/* ============================================================== A */
describe("A. the screen is the projection, and edit mode starts from it", () => {
  test("what is on screen is what the server sent, for a shop that has filled nothing in", async () => {
    const { close, shop } = await connect();
    try {
      const { r } = await shop();
      const shown = flat(r);
      assert(/Nothing here yet/.test(shown), "an empty profile did not say so: " + shown);
      assert(/Northline/.test(shown), "the shop's own name is missing: " + shown);
      /* Nothing is invented to fill the space. */
      assert(!/example\.com|@|http/.test(shown.replace(/Shop Profile|Sign out/g, "")),
        "a contact detail nobody sent is on screen: " + shown);
      assert(clickable(r, "Edit profile"), "there is no way in");
    } finally { await close(); }
  });

  test("edit mode starts from the projection, never from a leftover draft", async () => {
    const { close, shop } = await connect();
    try {
      const { r } = await shop();
      clickText(r, "Edit profile");
      for (const f of PROFILE.FIELDS) eq(field(r, f.label).props.value, "", `${f.key} did not start empty`);
      typeInto(r, "Website", "https://typed-but-abandoned.example");
      clickText(r, "Cancel");
      clickText(r, "Edit profile");
      eq(field(r, "Website").props.value, "", "an abandoned draft came back");
    } finally { await close(); }
  });

  test("cancel sends no command and changes nothing anywhere", async () => {
    const { close, shop, partnerRow } = await connect();
    try {
      const { r, store } = await shop();
      const before = JSON.stringify(store.get());
      const beforeRow = JSON.stringify(await partnerRow(H.PARTNER));
      const version = store.version();
      clickText(r, "Edit profile");
      fillAll(r);
      clickText(r, "Cancel");
      eq(store.status(), STORE.STATUS.ready, "a command was sent by cancelling");
      eq(store.version(), version, "the world moved when nothing was asked of it");
      eq(JSON.stringify(store.get()), before, "the projection changed without a response");
      eq(JSON.stringify(await partnerRow(H.PARTNER)), beforeRow, "canonical state changed on cancel");
      assert(!flat(r).includes("Superior Street"), "a cancelled draft is on screen as though saved");
    } finally { await close(); }
  });

  test("the fields offered are exactly the ones the domain accepts", () => {
    /* The command's own allow-list, read from the domain rather than restated. */
    const command = src("domain/metyet-commands.js");
    const allowed = (command.match(/updatePartnerProfile[\s\S]*?const allowed = \[([^\]]+)\]/) || [])[1];
    assert(allowed, "updatePartnerProfile no longer has an allow-list this test can read");
    const domainFields = allowed.split(",").map((s) => s.trim().replace(/["']/g, "")).filter(Boolean);
    eq(PROFILE.FIELDS.map((f) => f.key).join(","), domainFields.join(","),
      "the form and the domain disagree about what a profile is");
    eq(COMMANDS.PROFILE_FIELDS.join(","), domainFields.join(","));
    /* The default Trade % is private configuration and is not among them. */
    assert(!domainFields.includes("tradeRate"), "the domain started accepting tradeRate");
    assert(!/tradeRate/.test(code("client/tp/sections/Profile.jsx")), "the form offers private configuration");
  });
});

/* ============================================================== B */
describe("B. the write, end to end, all the way back to the screen", () => {
  test("saving issues exactly one updatePartnerProfile, carrying only a patch", async () => {
    const { close, app } = await connect();
    try {
      const sent = [];
      const impl = async (url, init) => {
        if (init && init.method === "POST") sent.push(JSON.parse(init.body));
        return H.fetchFor(app)(url, init);
      };
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => H.TOKEN,
        fetchImpl: impl });
      const store = STORE.createProductionStore({ api });
      await store.load();
      const r = render(React.createElement(Live,
        { store, onSaveProfile: COMMANDS.savePartnerProfile(store) }));
      clickText(r, "Shop Profile");
      clickText(r, "Edit profile");
      fillAll(r);
      await submit(r);

      eq(sent.length, 1, `${sent.length} commands were sent`);
      eq(sent[0].command, "updatePartnerProfile", "a different command was sent");
      eq(Object.keys(sent[0]).sort().join(","), "command,payload", "the body grew a field");
      eq(Object.keys(sent[0].payload).sort().join(","), "patch", "the payload grew a field");
      eq(Object.keys(sent[0].payload.patch).sort().join(","),
        PROFILE.FIELDS.map((f) => f.key).sort().join(","), "the patch is not the six fields");
      assert(Array.isArray(sent[0].payload.patch.specialties),
        "specialties left the browser as something other than a list");
      eq(sent[0].payload.patch.specialties.join("|"), "Vintage|Graded|Sealed");
    } finally { await close(); }
  });

  test("the browser sends no authority, and the server derives the shop from the token", async () => {
    const { close, app, partnerRow } = await connect();
    try {
      const sent = [];
      const impl = async (url, init) => {
        if (init && init.method === "POST") sent.push(JSON.parse(init.body));
        return H.fetchFor(app)(url, init);
      };
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => H.TOKEN,
        fetchImpl: impl });
      const store = STORE.createProductionStore({ api });
      await store.load();
      const r = render(React.createElement(Live,
        { store, onSaveProfile: COMMANDS.savePartnerProfile(store) }));
      clickText(r, "Shop Profile");
      clickText(r, "Edit profile");
      typeInto(r, "Website", SAVED.website);
      await submit(r);

      const body = JSON.stringify(sent[0]);
      for (const key of ["actor", "seat", "role", "accountId", "subject", "token",
        "partnerId", "\"by\"", "\"at\""]) {
        assert(!body.includes(key), `the browser sent ${key}: ${body}`);
      }
      /* And the shop that changed is the token's, which the browser never named. */
      const row = await partnerRow(H.PARTNER);
      eq(row.website, SAVED.website, "the server changed a different shop, or none");
    } finally { await close(); }
  });

  test("the persisted shop, the returned projection and the screen all say the same thing", async () => {
    const { close, shop, partnerRow } = await connect();
    try {
      const { r, store } = await shop();
      const version = store.version();
      clickText(r, "Edit profile");
      fillAll(r);
      await submit(r);

      /* Postgres. */
      const row = await partnerRow(H.PARTNER);
      eq(row.about, SAVED.about, "canonical state did not change");
      eq(row.specialties.join("|"), "Vintage|Graded|Sealed");
      eq(row.email, SAVED.email);
      eq(row.name, "Northline", "registration's name was overwritten by an edit");
      eq(row.tradeRate, H.MARK.tradeRate, "a field nobody edited moved");

      /* The projection the server returned. */
      const mine = store.get().partners.find((p) => p.id === H.PARTNER);
      eq(mine.about, SAVED.about, "the returned projection is behind the world");
      eq(store.version(), version + 1, "the world's version did not advance exactly once");
      eq(store.status(), STORE.STATUS.ready);

      /* And the screen, which left edit mode and is rendering that projection. */
      const shown = flat(r);
      assert(!r.root.findAll((n) => n.type === "form").length, "the form stayed open after a save");
      assert(shown.includes(SAVED.about), "the saved words are not on screen: " + shown);
      assert(shown.includes(SAVED.phone) && shown.includes("Vintage"), shown);
      assert(!/Nothing here yet/.test(shown), "the empty sentence survived a save");
    } finally { await close(); }
  });

  test("a second edit starts from what was saved, not from what was typed", async () => {
    const { close, shop } = await connect();
    try {
      const { r } = await shop();
      clickText(r, "Edit profile");
      typeInto(r, "Phone", SAVED.phone);
      await submit(r);
      clickText(r, "Edit profile");
      eq(field(r, "Phone").props.value, SAVED.phone, "the saved value did not come back from the server");
      eq(field(r, "Website").props.value, "", "a field nobody saved acquired a value");
    } finally { await close(); }
  });
});

/* ============================================================== C */
describe("C. authority: whose profile, and whose to change", () => {
  test("naming another shop in the payload changes this shop, and never that one", async () => {
    const { close, seatClient, partnerRow } = await connect();
    try {
      const { store } = seatClient(H.TOKEN);
      await store.load();
      /* `partnerId` is a legitimate domain identifier for other commands, so
         the server does not reject it outright — it is simply never read as
         authority. This is the difference, proved rather than assumed. */
      const result = await store.execute("updatePartnerProfile",
        { patch: { about: "MINE" }, partnerId: OTHER_PARTNER });
      eq(result.ok, true, "the command was refused for the wrong reason");
      eq((await partnerRow(OTHER_PARTNER)).about, OTHER_ABOUT, "another shop was rewritten");
      eq((await partnerRow(H.PARTNER)).about, "MINE", "the acting shop was not the one changed");
    } finally { await close(); }
  });

  test("a patch that names an owner cannot smuggle one through the allow-list", async () => {
    const { close, seatClient, partnerRow } = await connect();
    try {
      const { store } = seatClient(H.TOKEN);
      await store.load();
      const result = await store.execute("updatePartnerProfile",
        { patch: { about: "MINE TOO", id: OTHER_PARTNER, partnerId: OTHER_PARTNER, name: "Renamed",
          tradeRate: 0.1 } });
      eq(result.ok, true);
      const me = await partnerRow(H.PARTNER);
      eq(me.about, "MINE TOO");
      eq(me.id, H.PARTNER, "the shop's own id was rewritten by a patch");
      eq(me.name, "Northline", "the shop's name was rewritten by a patch");
      eq(me.tradeRate, H.MARK.tradeRate, "private configuration was rewritten by a patch");
      eq((await partnerRow(OTHER_PARTNER)).about, OTHER_ABOUT, "another shop was rewritten");
    } finally { await close(); }
  });

  test("a Collector cannot edit a Trusted Partner's profile", async () => {
    const { close, seatClient, partnerRow } = await connect();
    try {
      const { store } = seatClient(H.COLLECTOR_TOKEN);
      await store.load();
      eq(store.get().actor.seat, "collector");
      const result = await store.execute("updatePartnerProfile", { patch: { about: "BY A COLLECTOR" } });
      eq(result.ok, false, "a Collector changed a shop");
      eq(result.refused, "not-owner", "refused for a reason that is not the seat");
      eq((await partnerRow(H.PARTNER)).about, undefined, "the shop changed anyway");
    } finally { await close(); }
  });

  test("a Collector is never handed the control in the first place", async () => {
    const { close, seatClient } = await connect();
    try {
      const seat = seatClient(H.COLLECTOR_TOKEN);
      await seat.store.load();
      let handed = null;
      const r = render(React.createElement(Live,
        { store: seat.store, onSaveProfile: (patch) => { handed = patch; } }));
      const shown = flat(r);
      assert(/Goals|Trade Binder|Trusted Partners/.test(shown), "the Collector is not in their own app");
      assert(!/Shop Profile|Edit profile/.test(shown), "a Collector was offered a shop to edit: " + shown);
      eq(handed, null);
      /* Structurally, too: the seat router hands it to one shell only. */
      const router = code("client/production-app.jsx");
      assert(/TrustedPartnerShell[^>]*onSaveProfile/.test(router.replace(/\s+/g, " ")),
        "the Trusted Partner shell is not given the callback");
      assert(!/CollectorShell[^>]*onSaveProfile/.test(router.replace(/\s+/g, " ")),
        "the Collector shell is given a Trusted Partner's callback");
    } finally { await close(); }
  });

  test("an authority key in the payload is refused by the boundary, not honoured", async () => {
    const { close, seatClient, partnerRow } = await connect();
    try {
      const { store } = seatClient(H.TOKEN);
      await store.load();
      for (const key of ["actor", "seat", "role", "subject", "accountId", "at"]) {
        let threw = null;
        try {
          await store.execute("updatePartnerProfile", { patch: { about: "NO" }, [key]: "anything" });
        } catch (error) { threw = error; }
        assert(threw, `the server accepted a payload carrying ${key}`);
        eq(threw.status, 400, `${key} was not rejected as a bad request`);
      }
      eq((await partnerRow(H.PARTNER)).about, undefined, "one of them got through");
    } finally { await close(); }
  });
});

/* ============================================================== D */
describe("D. refusal, conflict, ambiguity, and pressing twice", () => {
  test("a refusal keeps the form open and never shows the draft as saved", async () => {
    const { close, shop, partnerRow } = await connect();
    try {
      const { r, store } = await shop();
      clickText(r, "Edit profile");
      typeInto(r, "About", "REFUSED WORDS");
      /* The one refusal this command has that a person can reach: the domain
         requires specialties to be a list, and a patch that is not one is
         declined. It is forced here at the boundary rather than through the
         form, which cannot produce anything but a list. */
      await TR.act(async () => {
        await store.execute("updatePartnerProfile", { patch: { specialties: "not a list" } });
      });
      eq(store.lastRefusal(), "invalid-amount", "the domain accepted a specialties string");
      eq(store.status(), STORE.STATUS.ready, "a refusal was treated as an error");
      eq((await partnerRow(H.PARTNER)).specialties, undefined, "a refused command wrote anyway");
      /* The screen is still the server's: the form is open, and the shop
         underneath has not acquired the typed words. */
      assert(r.root.findAll((n) => n.type === "form").length, "the form closed on a refusal");
      eq(field(r, "About").props.value, "REFUSED WORDS", "the typing was thrown away");
      clickText(r, "Cancel");
      assert(!flat(r).includes("REFUSED WORDS"), "a refused value is on screen as though saved");
    } finally { await close(); }
  });

  test("a refusal from the save itself is reported, and nothing is predicted", async () => {
    const { close, app, partnerRow } = await connect();
    try {
      /* The server's own refusal shape, produced by the real route for a real
         rule — the Collector seat — then delivered to a Trusted Partner's
         screen, so the screen's handling of `{ ok: false }` is what is tested. */
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => H.TOKEN,
        fetchImpl: H.fetchFor(app) });
      const store = STORE.createProductionStore({ api });
      await store.load();
      const refusing = async () => ({ ok: false, refused: "not-owner" });
      const r = render(React.createElement(Live, { store, onSaveProfile: refusing }));
      clickText(r, "Shop Profile");
      clickText(r, "Edit profile");
      typeInto(r, "About", "NEVER SAVED");
      await submit(r);
      const shown = flat(r);
      assert(/Only the Trusted Partner this shop belongs to/.test(shown), "the refusal was not said: " + shown);
      assert(r.root.findAll((n) => n.type === "form").length, "the form closed on a refusal");
      eq((await partnerRow(H.PARTNER)).about, undefined);
    } finally { await close(); }
  });

  test("a conflict re-reads, is never replayed, and drops the stale draft", async () => {
    let bump = false;
    let posts = 0;
    const { close, app, repository } = await connect({
      repositoryWrapper: (repo) => ({ ...repo,
        loadWorld: async (tx) => {
          const w = await repo.loadWorld(tx);
          if (tx && bump) await tx.query("update metyet.world_meta set version = version + 1");
          return w;
        } }),
    });
    try {
      const impl = async (url, init) => {
        if (init && init.method === "POST") posts += 1;
        return H.fetchFor(app)(url, init);
      };
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => H.TOKEN,
        fetchImpl: impl });
      const store = STORE.createProductionStore({ api });
      await store.load();
      const r = render(React.createElement(Live,
        { store, onSaveProfile: COMMANDS.savePartnerProfile(store) }));
      clickText(r, "Shop Profile");
      clickText(r, "Edit profile");
      typeInto(r, "About", "WRITTEN AGAINST A STALE WORLD");
      bump = true;
      await submit(r);

      eq(posts, 1, `the command was sent ${posts} times after a conflict`);
      eq(store.status(), STORE.STATUS.conflict, "a conflict was not distinguished");
      eq(store.lastRefusal(), null, "a conflict was reported as a refusal");
      const after = (await repository.loadWorld()).partners.find((p) => p.id === H.PARTNER);
      eq(after.about, undefined, "a conflicted command wrote anyway");
      const shown = flat(r);
      assert(/Someone else changed this shop/.test(shown), "the conflict was not explained: " + shown);
      assert(!r.root.findAll((n) => n.type === "form").length, "the stale form stayed open");
      assert(!shown.includes("WRITTEN AGAINST A STALE WORLD"), "the stale draft is on screen as saved");
    } finally { await close(); }
  });

  /* AN AMBIGUOUS FAILURE IS THE ONE OUTCOME THE BROWSER CANNOT KNOW. The POST
     may have arrived, committed, and had its reply lost — so the screen must not
     claim either way. Saying "nothing was saved" here would be a lie that causes
     the damage it describes: it invites a second save of a write that already
     landed. */
  test("an ambiguous network failure is never replayed, and never claims an outcome", async () => {
    const { close, app } = await connect();
    try {
      let posts = 0;
      const impl = async (url, init) => {
        if (init && init.method === "POST") { posts += 1; throw new Error("connection lost"); }
        return H.fetchFor(app)(url, init);
      };
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => H.TOKEN,
        fetchImpl: impl });
      const store = STORE.createProductionStore({ api });
      await store.load();
      const r = render(React.createElement(Live,
        { store, onSaveProfile: COMMANDS.savePartnerProfile(store) }));
      clickText(r, "Shop Profile");
      clickText(r, "Edit profile");
      typeInto(r, "About", "MAYBE SENT");
      await submit(r);

      eq(posts, 1, `the command was sent ${posts} times after an ambiguous failure`);
      const shown = flat(r);
      /* It says it cannot tell. */
      assert(/cannot tell whether the change went through/.test(shown),
        "the uncertainty was not stated: " + shown);
      assert(/has not been sent again/.test(shown), "the screen did not say it stopped: " + shown);
      /* And it does not claim an outcome in either direction. */
      assert(!/nothing was saved|was not saved|wasn't saved/i.test(shown),
        "the screen claimed the change was not saved, which it cannot know: " + shown);
      assert(!/saved\b(?!.*cannot)/i.test(shown.replace(/whether the change[^.]*\./g, "")
        .replace(/before saving a second time/g, "")),
        "the screen claimed the change WAS saved: " + shown);
      /* The draft survives, so the person can decide what to do with it. */
      assert(r.root.findAll((n) => n.type === "form").length, "the form closed on a failure");
      eq(field(r, "About").props.value, "MAYBE SENT", "the typing was thrown away");
      /* No optimistic state: the shop underneath is still the server's. */
      eq(store.get().partners.find((p) => p.id === H.PARTNER).about, undefined,
        "an unconfirmed change was adopted into the projection");
      eq(store.pending(), null, "the store is stuck thinking a command is in flight");
    } finally { await close(); }
  });

  test("a change that COMMITTED but whose reply was lost is not reported as unsaved", async () => {
    const { close, app, partnerRow } = await connect();
    try {
      /* The sharpest case, and the reason the copy had to change: the command
         reaches the server and commits, and only the REPLY is lost. `api.js`
         calls a 200 with no state `unexpected`, which is exactly what an
         unreadable success looks like from a browser. */
      let posts = 0;
      const impl = async (url, init) => {
        const real = await H.fetchFor(app)(url, init);
        if (init && init.method === "POST") {
          posts += 1;
          return { status: 200, async json() { return { ok: true, version: 99 }; } };
        }
        return real;
      };
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => H.TOKEN,
        fetchImpl: impl });
      const store = STORE.createProductionStore({ api });
      await store.load();
      const r = render(React.createElement(Live,
        { store, onSaveProfile: COMMANDS.savePartnerProfile(store) }));
      clickText(r, "Shop Profile");
      clickText(r, "Edit profile");
      typeInto(r, "About", "COMMITTED BUT UNCONFIRMED");
      await submit(r);

      eq(posts, 1, `the command was sent ${posts} times`);
      /* It really did commit. */
      eq((await partnerRow(H.PARTNER)).about, "COMMITTED BUT UNCONFIRMED",
        "the fixture did not actually commit, so this proves nothing");
      const shown = flat(r);
      assert(!/nothing was saved|was not saved|wasn't saved/i.test(shown),
        "a committed change was reported as unsaved: " + shown);
      assert(/cannot tell whether the change went through/.test(shown),
        "the uncertainty was not stated: " + shown);
      eq(field(r, "About").props.value, "COMMITTED BUT UNCONFIRMED", "the draft was thrown away");
    } finally { await close(); }
  });

  test("only an answer may claim an outcome; an unknown may not", () => {
    /* The rule, kept where it cannot drift: a message for a failure the server
       ANSWERED may say nothing was saved, because that is a fact. A message for
       a failure nobody answered may not say it in either direction. */
    for (const [failure, message] of Object.entries(PROFILE.AMBIGUOUS)) {
      assert(!/nothing was saved|was not saved|wasn't saved|did not save/i.test(message),
        `the "${failure}" message claims the change was not saved: ${message}`);
      assert(!/\bwas saved\b|\bhas been saved\b/i.test(message),
        `the "${failure}" message claims the change was saved: ${message}`);
      assert(/cannot tell|could not confirm|cannot confirm/i.test(message),
        `the "${failure}" message does not say the outcome is unknown: ${message}`);
      assert(/not been sent again|not sent again|has not been retried/i.test(message),
        `the "${failure}" message does not say the command was not replayed: ${message}`);
    }
    /* The two the client genuinely cannot resolve, and no others. */
    eq(Object.keys(PROFILE.AMBIGUOUS).sort().join(","), "unavailable,unexpected");
    /* And they are exactly the api client's two unanswered outcomes. `conflict`,
       `unauthenticated` and `not-provisioned` are answers and stay certain. */
    for (const failure of ["conflict", "unauthenticated", "not-provisioned"]) {
      assert(PROFILE.CERTAIN[failure], `${failure} lost its message`);
      assert(/nothing was saved/i.test(PROFILE.CERTAIN[failure]),
        `${failure} is an answer and should say so: ${PROFILE.CERTAIN[failure]}`);
    }
    /* An unknown failure word falls to the cautious message, never the certain one. */
    assert(!Object.keys(PROFILE.CERTAIN).includes("unexpected"),
      "the default failure was made to sound certain");
  });

  test("pressing Save twice is one mutation, and the second press cannot be made", async () => {
    const { close, app, partnerRow } = await connect();
    try {
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      let posts = 0;
      const impl = async (url, init) => {
        if (init && init.method === "POST") { posts += 1; await gate; }
        return H.fetchFor(app)(url, init);
      };
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => H.TOKEN,
        fetchImpl: impl });
      const store = STORE.createProductionStore({ api });
      await store.load();
      const version = store.version();
      const r = render(React.createElement(Live,
        { store, onSaveProfile: COMMANDS.savePartnerProfile(store) }));
      clickText(r, "Shop Profile");
      clickText(r, "Edit profile");
      typeInto(r, "About", "ONCE");

      const form = r.root.findAll((n) => n.type === "form")[0];
      let first;
      TR.act(() => { first = form.props.onSubmit({ preventDefault() {} }); });
      /* While it is in flight the controls are disabled and the screen says so,
         so a second press is not something a person can perform. */
      const save = buttons(r).find((n) => instText(n).includes("Saving"));
      assert(save, "the button did not say it was saving: " + buttons(r).map(instText).join(" | "));
      eq(save.props.disabled, true, "Save stayed pressable while a command was in flight");
      eq(field(r, "About").props.disabled, true, "the field stayed editable while saving");
      /* And pressing anyway sends nothing. */
      await TR.act(async () => { await form.props.onSubmit({ preventDefault() {} }); });
      eq(posts, 1, `${posts} commands reached the server`);

      release();
      await TR.act(async () => { await first; });
      eq(posts, 1, `${posts} commands reached the server in total`);
      eq((await partnerRow(H.PARTNER)).about, "ONCE");
      eq(store.version(), version + 1, "the world moved more than once");
    } finally { await close(); }
  });
});

/* ============================================================== E */
describe("E. privacy, measured at the socket", () => {
  test("what a Trusted Partner saves is what a related Collector then receives", async () => {
    const { close, app, seatClient } = await connect();
    try {
      const tp = seatClient(H.TOKEN);
      await tp.store.load();
      await tp.onSaveProfile({ about: SAVED.about, specialties: ["Vintage", "Graded"],
        website: SAVED.website, instagram: SAVED.instagram, email: SAVED.email, phone: SAVED.phone });

      /* Read at the socket, not through a component: this is the response. */
      const res = await H.fetchFor(app)("http://localhost/api/view",
        { headers: { authorization: `Bearer ${H.COLLECTOR_TOKEN}` } });
      const body = await res.json();
      const raw = JSON.stringify(body);
      const theirs = body.state.partners.find((p) => p.id === H.PARTNER);
      assert(theirs, "a related Collector cannot see their own Trusted Partner");
      eq(theirs.about, SAVED.about, "an edited, Collector-facing field did not reach them");
      eq(theirs.email, SAVED.email);
      eq(theirs.specialties.join("|"), "Vintage|Graded");

      /* Visibility came from the projection. The browser adds nothing and
         removes nothing — a Collector's own shell renders what arrived. */
      assert(!/filter\s*\(\s*\(?\s*p\s*\)?\s*=>\s*p\.(about|email|website)/.test(
        code("client/collector/sections/TrustedPartners.jsx")), "the browser re-filters a partner's fields");

      /* And the private configuration beside them still never crosses. */
      assert(!raw.includes(String(H.MARK.tradeRate)), "the default Trade % reached a Collector");
      assert(!raw.includes("tradeRate"), "the private field name reached a Collector");
      for (const secret of [String(H.MARK.cost), H.MARK.acquired, H.MARK.relNote, H.MARK.activity]) {
        assert(!raw.includes(secret), `a TP-private value crossed: ${secret}`);
      }
    } finally { await close(); }
  });

  test("an unrelated Collector receives no part of the shop, edited or not", async () => {
    const { close, app, seatClient } = await connect();
    try {
      const tp = seatClient(H.TOKEN);
      await tp.store.load();
      await tp.onSaveProfile({ about: SAVED.about, email: SAVED.email, phone: SAVED.phone,
        website: SAVED.website, instagram: SAVED.instagram, specialties: ["Vintage"] });

      const res = await H.fetchFor(app)("http://localhost/api/view",
        { headers: { authorization: `Bearer ${STRANGER_TOKEN}` } });
      const body = await res.json();
      eq(body.state.actor.collectorId, "c-stranger", "the stranger is not who they signed in as");
      const raw = JSON.stringify(body);
      for (const value of [SAVED.about, SAVED.email, SAVED.phone, SAVED.website, SAVED.instagram]) {
        assert(!raw.includes(value), `an unrelated Collector received ${value}`);
      }
      eq(body.state.partners.length, 0, "an unrelated Collector was given a Trusted Partner");
    } finally { await close(); }
  });

  test("editing a profile moves nothing else in anyone's projection", async () => {
    const { close, app, seatClient } = await connect();
    try {
      const before = JSON.stringify((await (await H.fetchFor(app)("http://localhost/api/view",
        { headers: { authorization: `Bearer ${H.COLLECTOR_TOKEN}` } })).json()).state);
      const tp = seatClient(H.TOKEN);
      await tp.store.load();
      await tp.onSaveProfile({ phone: SAVED.phone });
      const after = (await (await H.fetchFor(app)("http://localhost/api/view",
        { headers: { authorization: `Bearer ${H.COLLECTOR_TOKEN}` } })).json()).state;
      const patched = JSON.parse(before);
      patched.partners = patched.partners.map((p) => (p.id === H.PARTNER ? { ...p, phone: SAVED.phone } : p));
      eq(JSON.stringify(after), JSON.stringify(patched),
        "a profile edit changed something other than the profile");
    } finally { await close(); }
  });
});

/* ============================================================== F */
describe("F. the boundary the control reaches through", () => {
  test("one file names the command, and it is not a product surface", () => {
    eq(COMMANDS.PARTNER_PROFILE, "updatePartnerProfile");
    const surfaces = ["client/collector", "client/tp"].flatMap((dir) =>
      fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
        .flatMap((e) => (e.isDirectory()
          ? fs.readdirSync(path.join(ROOT, dir, e.name)).map((f) => `${dir}/${e.name}/${f}`)
          : [`${dir}/${e.name}`])));
    surfaces.forEach((rel) => {
      const bare = code(rel);
      assert(!/updatePartnerProfile/.test(bare), `${rel} names a command`);
      assert(!/store\.|createProductionStore|createApiClient/.test(bare), `${rel} holds a store`);
      assert(!/\bfetch\s*\(|XMLHttpRequest/.test(bare), `${rel} reaches the network`);
      assert(!/from ["'][^"']*domain\/|require\(["'][^"']*domain\//.test(bare), `${rel} imports domain`);
    });
  });

  test("the callback is bound from the store, and is a function of one argument", async () => {
    const calls = [];
    const fake = { execute: (...args) => { calls.push(args); return Promise.resolve({ ok: true }); } };
    const save = COMMANDS.savePartnerProfile(fake);
    eq(save.length, 1, "the callback takes something other than a patch");
    await save({ about: "x" });
    eq(calls.length, 1);
    eq(calls[0][0], "updatePartnerProfile");
    eq(JSON.stringify(calls[0][1]), JSON.stringify({ patch: { about: "x" } }));
    let threw = null;
    try { COMMANDS.savePartnerProfile({}); } catch (error) { threw = error; }
    assert(threw, "a callback was bound to something that is not a store");
  });

  test("the entrance binds it from its own store and hands it to the application", () => {
    const entrance = code("client/sign-in/SignIn.jsx");
    assert(/savePartnerProfile\(store\)/.test(entrance), "SignIn does not bind the callback from the store");
    assert(/onSaveProfile/.test(entrance) && /ProductionApp[\s\S]{0,200}onSaveProfile/.test(entrance),
      "SignIn does not hand the callback to the application");
    assert(!/updatePartnerProfile/.test(entrance), "the entrance names a command");
  });

  test("the demo keeps its own store, and production still cannot reach it", () => {
    const demo = code("domain/metyet-store.js");
    assert(/const fixture = \{ set, reset, patchOpportunity \}/.test(src("domain/metyet-store.js")),
      "the demo store lost the powers production does not have");
    assert(/execute = \(actor, command, payload\)/.test(demo),
      "the demo store stopped taking an actor, which is the difference");
    for (const rel of ["client/commands.js", "client/tp/sections/Profile.jsx", "client/production-app.jsx"]) {
      const bare = code(rel);
      assert(!/MetYetPrototype|MetYetCollector|demo-flag|dev-flag|src\/MetYet|shell\//.test(bare),
        `${rel} reaches the demo or the prototype`);
      assert(!/prototypeRuntime|buildCanonicalSeed|createStore\b/.test(bare),
        `${rel} reaches a prototype mutation handler`);
    }
  });

  test("the blueprint deploys main, and builds the client the service serves", () => {
    const blueprint = src("render.yaml");
    eq((blueprint.match(/^\s+branch: (\S+)/m) || [])[1], "main", "the blueprint deploys a feature branch");
    const build = (blueprint.match(/buildCommand: (.*)/) || [])[1];
    assert(/npm run build:app/.test(build), "the build does not produce the client: " + build);
    assert(/npm ci --omit=dev/.test(build), "the build stopped installing production dependencies");
    /* The service reads that directory at boot, which is why the build has to
       produce it: `app/` is never committed. */
    assert(/loadClient/.test(src("server/index.js")), "the server no longer serves a built client");
    assert(/^app\/$/m.test(src(".gitignore")), "app/ is committed, which would defeat the point");
  });
});

run();
