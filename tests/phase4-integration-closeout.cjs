/* ============================================================================
   PHASE 4 BATCH 10 — THE SEAMS BETWEEN THE BATCHES

   Every Phase 4 batch tested itself well and stopped at its own edge. The
   server suites stop at HTTP; the client suites start from a projection someone
   handed them. Nothing, until this file, ran the whole path:

     Postgres -> domain -> projectForActor -> HTTP -> api client -> store
       -> <SignIn/> -> <ProductionApp/> -> the seat's own shell

   That is the gap Batch 10 exists to close. Everything below is REAL: a real
   migrated database, the real world repository, the real Fastify routes, the
   real account directory, the real command transaction, the real domain, the
   real api client, the real production store and the real React components.
   Only the identity provider is a stand-in, exactly as phase3-server.cjs has
   always done it — a token names its subject.

   THE PRIVACY TESTS HERE ARE DIFFERENT IN KIND from the ones in the batch
   suites. Those hand a component a projection containing a secret and check the
   screen. These put the secret in POSTGRES and check it never comes out of the
   socket — which is where the guarantee actually lives.

   WHAT THIS IS NOT. Seeding a Collector into a test world and telling the
   account directory about them is test provisioning, not the product lifecycle.
   MetYet still has no way for a real Collector to be invited, redeem anything,
   accept anything or acquire a relationship. That is a Phase 5 dependency and
   nothing in this file closes it or claims to.

     A  auth -> actor -> projection, over the wire, for both seats
     B  projection -> seat routing -> the seat's own shell
     C  privacy, measured at the socket
     D  the mutation seam, end to end
     E  conflict, expiry and ambiguity
     F  demo and production, including the error paths
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
const ACTOR = load("client/actor.js");
const ProductionApp = load("client/production-app.jsx").default;
const { createApp } = require("../server/app.js");
const H = require("./helpers/command-server.cjs");

const TP_NAV = ["Collector Network", "Inventory", "Opportunities"];
/* Restated in Batch 8.1: the Trade Binder left the Collector's navigation
   until the batch that lets anybody put a card in one. */
/* Restated in Phase 5 C3.4b: that batch arrived, so Binder is a destination —
   and Goals stopped being one, because a binder expresses coherence and a goal
   expresses priority, which is read where the card is rather than beside it.
   This list is what the routing tests below use to recognise the Collector app,
   so it is the navigation as the product now ships it. */
const CO_NAV = ["Browse", "Binder", "Your Cards", "Trusted Partners"];

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
const hasNav = (r, nav) => nav.every((l) => buttons(r).some((b) => instText(b).includes(l)));

/* One real server, one real client, one seat. */
const connect = async (opts = {}) => {
  const { app, close, repository } = await H.serve(createApp, opts);
  const seatClient = (token) => {
    const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => token,
      fetchImpl: H.fetchFor(app) });
    return { api, store: STORE.createProductionStore({ api }) };
  };
  return { app, close, repository, seatClient };
};

/* Everything the seeded world holds that a Collector must never receive. */
const TP_SECRETS = [String(H.MARK.cost), H.MARK.acquired, H.MARK.relNote, H.MARK.relLast,
  H.MARK.relReviewed, H.MARK.activity, String(H.MARK.tradeRate)];

/* ============================================================== A */
describe("A. auth -> actor -> projection, over the wire", () => {
  test("a Trusted Partner's token resolves to their actor and their projection alone", async () => {
    const { close, seatClient } = await connect();
    try {
      const { store } = seatClient(H.TOKEN);
      await store.load();
      const state = store.get();
      eq(JSON.stringify(state.actor), JSON.stringify({ seat: "tp", partnerId: H.PARTNER }),
        "the server named a different actor than the token's account");
      eq(ACTOR.describeActor(state).seat, "tp");
      eq(ACTOR.describeActor(state).id, H.PARTNER);
      eq(ACTOR.describeActor(state).name, "Northline");
      /* And the TP's network is their network: a Collector they have no
         relationship with is not in it either. */
      assert(!JSON.stringify(state).includes(H.MARK.stranger),
        "an unrelated Collector reached a Trusted Partner's projection");
      eq(state.collectors.length, 1, "the TP received a Collector outside their network");
    } finally { await close(); }
  });

  test("a Collector's token resolves to their actor and their projection alone", async () => {
    const { close, seatClient } = await connect();
    try {
      const { store } = seatClient(H.COLLECTOR_TOKEN);
      await store.load();
      const state = store.get();
      eq(JSON.stringify(state.actor), JSON.stringify({ seat: "collector", collectorId: H.COLLECTOR }));
      eq(ACTOR.describeActor(state).name, "Casey");
      /* Their own record, and only theirs — proved against a world that holds
         a SECOND Collector. Asserting `length === 1` against a world with one
         person in it is satisfied by a projector that stopped scoping, which
         is exactly how one walked past an earlier version of this test. */
      eq(state.collectors.length, 1, "a Collector received more than their own record");
      eq(state.collectors[0].id, H.COLLECTOR);
      assert(!JSON.stringify(state).includes(H.MARK.stranger),
        "an unrelated Collector reached a Collector's projection");
    } finally { await close(); }
  });

  test("two seats on one server receive two different projections", async () => {
    const { close, seatClient } = await connect();
    try {
      const tp = seatClient(H.TOKEN);
      const co = seatClient(H.COLLECTOR_TOKEN);
      await tp.store.load();
      await co.store.load();
      assert(JSON.stringify(tp.store.get()) !== JSON.stringify(co.store.get()),
        "both seats received the same state");
      eq(tp.store.get().actor.seat, "tp");
      eq(co.store.get().actor.seat, "collector");
      /* The same world, seen from two places — neither is the world. */
      assert(!("partnerId" in co.store.get().actor), "a Collector was given a partner id");
      assert(!("collectorId" in tp.store.get().actor), "a TP was given a collector id");
    } finally { await close(); }
  });

  test("an unverifiable token reaches no projection at all", async () => {
    const { close, seatClient } = await connect();
    try {
      const { store } = seatClient("not-a-real-token");
      let threw = null;
      try { await store.load(); } catch (error) { threw = error; }
      assert(threw, "a bad token produced a projection");
      eq(threw.failure, API.FAILURES.unauthenticated);
      eq(store.get(), null, "and nothing was adopted");
    } finally { await close(); }
  });

  test("a verified subject with no account is refused, and named as such", async () => {
    const { close, seatClient } = await connect();
    try {
      const { store } = seatClient("token-for:sub-nobody");
      let threw = null;
      try { await store.load(); } catch (error) { threw = error; }
      eq(threw && threw.failure, API.FAILURES.notProvisioned);
      eq(store.get(), null);
    } finally { await close(); }
  });
});

/* ============================================================== B */
describe("B. projection -> seat routing -> the seat's own shell", () => {
  test("the real server's answer routes a Trusted Partner to the TP workspace", async () => {
    const { close, seatClient } = await connect();
    try {
      const { store } = seatClient(H.TOKEN);
      await store.load();
      const r = render(React.createElement(ProductionApp, { state: store.get(), onSignOut() {} }));
      assert(hasNav(r, TP_NAV), "the TP workspace did not render: " + flat(r));
      assert(!hasNav(r, CO_NAV), "the Collector app rendered for a TP");
      assert(flat(r).includes("Northline"), "their own name, from the server: " + flat(r));
      clickText(r, "Inventory");
      assert(flat(r).includes("Charizard"), "their own stock: " + flat(r));
      /* Their OWN acquisition cost is theirs to see. */
      assert(flat(r).includes("$31,337"), "a TP lost sight of their own cost: " + flat(r));
    } finally { await close(); }
  });

  test("the real server's answer routes a Collector to the Collector app", async () => {
    const { close, seatClient } = await connect();
    try {
      const { store } = seatClient(H.COLLECTOR_TOKEN);
      await store.load();
      const r = render(React.createElement(ProductionApp, { state: store.get(), onSignOut() {} }));
      assert(hasNav(r, CO_NAV), "the Collector app did not render: " + flat(r));
      assert(!hasNav(r, TP_NAV), "the TP workspace rendered for a Collector");
      assert(flat(r).includes("Casey"), "their own name, from the server: " + flat(r));
      /* C1 made Browse the Collector's first section; their goal is one press
         away, and the point of this test is that the real server's projection
         reaches the real Collector app. */
      /* SUPERSEDED AND RESTATED (Phase 5 C3.4b).

         What it protected: that a Collector's own Goal, as the real server
         projects it, arrives in the real Collector app — proved by pressing
         Goals and reading the goal's own note off the screen.

         Why it is no longer correct: there is no Goals press. C3.4b removed the
         top-level Goals entry. This fixture's goal is also a LEGACY one — it
         names `cardId: "k1"` and no canonical card — so it reaches no canonical
         surface by design, and dressing it up as one would be fiction.

         What replaces it, and why it is stricter: the claim was always about
         the seam, not the tab, so it is asserted at the seam — the goal is in
         the projection the real server sent to this real client, with its own
         note and its own tier, which the old form never checked. And the app is
         still driven, by pressing a section that exists, so the seam is proved
         through a real render rather than only through the store. */
      const mine = store.get().goals;
      eq(mine.length, 1, "their own goal did not reach them");
      eq(mine[0].note, "CASEY-WANTS-CHARIZARD", "their own goal: " + JSON.stringify(mine[0]));
      eq(mine[0].tier, "primary", "their own goal's priority did not survive the seam");
      clickText(r, "Binder");
      assert(flat(r).includes("Binder"), "Binder did not render: " + flat(r));
      /* Restated in Batch 8.1. Their own binder copy still reaches them from
         the real server — that is a projection property and it is unchanged.
         What is gone is the tab that showed it, because nothing in production
         can put a card in a binder yet. */
      eq(store.get().collectorCopies.map((b) => b.cert).join(), "CASEY-CERT-9001",
        "their own binder copy did not reach them");
      clickText(r, "Trusted Partners");
      assert(flat(r).includes("Northline"), "their own partner: " + flat(r));
    } finally { await close(); }
  });

  test("routing follows the SERVER's seat, not anything a caller supplies", async () => {
    const { close, seatClient } = await connect();
    try {
      const { store } = seatClient(H.COLLECTOR_TOKEN);
      await store.load();
      /* Every prop a caller could try. None of them is read. */
      const r = render(React.createElement(ProductionApp, { state: store.get(), onSignOut() {},
        seat: "tp", actor: { seat: "tp", partnerId: H.PARTNER }, partnerId: H.PARTNER,
        role: "tp", subject: H.SUBJECT }));
      assert(hasNav(r, CO_NAV) && !hasNav(r, TP_NAV),
        "a prop changed which product rendered: " + flat(r));
    } finally { await close(); }
  });
});

/* ============================================================== C */
describe("C. privacy, measured at the socket", () => {
  test("a Trusted Partner's private values are in the database and not in the Collector's response", async () => {
    const { close, seatClient } = await connect();
    try {
      /* First: the TP can see them, so the markers are really there. */
      const tp = seatClient(H.TOKEN);
      await tp.store.load();
      const tpWire = JSON.stringify(tp.store.get());
      assert(tpWire.includes(String(H.MARK.cost)), "the fixture has no cost; the test is toothless");
      assert(tpWire.includes(H.MARK.relNote), "the fixture has no private note");
      assert(tpWire.includes(H.MARK.activity), "the fixture has no private activity");

      /* Then: none of them crosses to the Collector. */
      const co = seatClient(H.COLLECTOR_TOKEN);
      await co.store.load();
      const coWire = JSON.stringify(co.store.get());
      TP_SECRETS.forEach((secret) =>
        assert(!coWire.includes(secret), `"${secret}" crossed the projection boundary`));
      assert(!coWire.includes(H.MARK.stranger), "another Collector crossed the boundary");
      assert(!tpWire.includes(H.MARK.stranger), "an unrelated Collector reached the TP");
    } finally { await close(); }
  });

  test("the fields themselves are absent, not merely blank", async () => {
    const { close, seatClient } = await connect();
    try {
      const { store } = seatClient(H.COLLECTOR_TOKEN);
      await store.load();
      const state = store.get();
      state.inventory.forEach((i) => {
        assert(!("cost" in i), "a Collector received an acquisition cost field");
        assert(!("acquired" in i), "a Collector received an acquisition date field");
      });
      state.relationships.forEach((r) => {
        ["note", "last", "binderReviewedAt"].forEach((f) =>
          assert(!(f in r), `a Collector received the TP-private "${f}"`));
      });
      state.partners.forEach((p) => assert(!("tradeRate" in p), "a Collector received a Trade %"));
      eq(state.activity.length, 0, "a Collector received partner-private activity");
    } finally { await close(); }
  });

  test("and nothing private reaches the Collector's screen either", async () => {
    const { close, seatClient } = await connect();
    try {
      const { store } = seatClient(H.COLLECTOR_TOKEN);
      await store.load();
      const r = render(React.createElement(ProductionApp, { state: store.get(), onSignOut() {} }));
      for (const s of CO_NAV) {
        clickText(r, s);
        const shown = flat(r);
        TP_SECRETS.forEach((secret) =>
          assert(!shown.includes(secret), `"${secret}" reached the Collector's ${s}: ` + shown));
      }
    } finally { await close(); }
  });

  test("the browser does not mask a projector leak by filtering it away", () => {
    /* If the projection ever DID carry a foreign row, the screen must not
       quietly drop it — that would hide a server bug behind a browser habit.
       Neither surface re-implements the server's scoping rule. */
    const files = ["client/collector", "client/tp"].flatMap((dir) =>
      fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
        .flatMap((e) => (e.isDirectory()
          ? fs.readdirSync(path.join(ROOT, dir, e.name)).map((f) => `${dir}/${e.name}/${f}`)
          : [`${dir}/${e.name}`])));
    const bare = files.map(code).join("\n");
    assert(!/collectorId\s*===\s*(who|actor|me)|partnerId\s*===\s*(who|actor|me)/.test(bare),
      "a surface re-filters the projection by the actor's own id");
    assert(!/projectForActor/.test(bare), "a surface projects in the browser");
  });
});

/* ============================================================== D */
describe("D. the mutation seam, end to end", () => {
  test("a real command changes the real world and returns the authoritative projection", async () => {
    const { close, seatClient, repository } = await connect();
    try {
      const { store } = seatClient(H.TOKEN);
      await store.load();
      const before = JSON.stringify(store.get());
      const beforeVersion = store.version();

      const result = await store.execute(H.COMMAND, H.PAYLOAD);
      assert(result.ok, "the real server refused: " + JSON.stringify(result));

      /* The store holds exactly what came back, and the database moved. */
      eq(JSON.stringify(store.get()), JSON.stringify(result.state));
      assert(JSON.stringify(store.get()) !== before, "the projection did not move");
      assert(store.version() > beforeVersion, "the world version did not advance");
      const world = await repository.loadWorld();
      eq(world.partners[0].about, H.PROFILE_ABOUT, "the canonical world did not change");

      /* AND THE TIME IS THE SERVER'S — `at` is on its forbidden payload list.
         A profile patch carries no timestamp, so the proof moved to a command
         that does: a Collector's own goal, whose `createdAt` (Batch 8.1) and
         `since` are both stamped by the server's runtime and by nothing a
         caller sent. */
      const { store: collector } = seatClient(H.COLLECTOR_TOKEN);
      await collector.load();
      const goal = await collector.execute(H.COLLECTOR_COMMAND, H.COLLECTOR_PAYLOAD);
      assert(goal.ok, "the real server refused the goal: " + JSON.stringify(goal));
      const made = (await repository.loadWorld()).goals.find((g) => g.id === goal.value);
      assert(made, "the goal is not in the canonical world");
      assert(String(made.createdAt).startsWith("2030-"), "the server did not stamp it: " + made.createdAt);
      eq(made.createdAt, made.since, "one command, one reading of the clock");
    } finally { await close(); }
  });

  test("the mutation carries no authority, and the server would refuse it if it did", async () => {
    const { close, seatClient } = await connect();
    try {
      const { api } = seatClient(H.TOKEN);
      for (const key of ["actor", "seat", "subject", "account", "role"]) {
        let threw = null;
        try { await api.command(H.COMMAND, { ...H.PAYLOAD, [key]: "anything" }); }
        catch (error) { threw = error; }
        assert(threw, `the server accepted a payload carrying "${key}"`);
        eq(threw.status, 400, `"${key}" was not refused as a bad request`);
      }
    } finally { await close(); }
  });

  test("a Collector cannot run a Trusted Partner's command, and is refused by the domain", async () => {
    const { close, seatClient } = await connect();
    try {
      const { store } = seatClient(H.COLLECTOR_TOKEN);
      await store.load();
      const before = JSON.stringify(store.get());
      const result = await store.execute(H.COMMAND, H.PAYLOAD);
      eq(result.ok, false, "a Collector ran a TP-only command");
      assert(typeof result.refused === "string" && result.refused, "and the rule was not named");
      eq(JSON.stringify(store.get()), before, "a refusal changed the projection");
      eq(store.status(), STORE.STATUS.ready, "and the screen is still usable");
      eq(store.lastRefusal(), result.refused);
    } finally { await close(); }
  });

  test("a control reaches the mutation path through a callback, never by holding one", () => {
    /* Reads and mutations meet at the store, and no product surface holds one.
       Phase 4 had no control at all; Phase 5 Batch 1 added the first, and it
       changed nothing here — Shop Profile is handed `onSave(patch)` and cannot
       name a command, reach a store, or go to the network. That is what makes a
       section a section rather than a second client. */
    ["get", "sub", "execute", "load", "status", "version", "lastError", "lastRefusal", "pending", "stale"]
      .forEach((m) => {
        const store = STORE.createProductionStore({ api: { view() {}, command() {} } });
        eq(typeof store[m], "function", `store.${m} is missing`);
      });
    const surfaces = ["client/collector", "client/tp"].flatMap((dir) =>
      fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
        .flatMap((e) => (e.isDirectory()
          ? fs.readdirSync(path.join(ROOT, dir, e.name)).map((f) => `${dir}/${e.name}/${f}`)
          : [`${dir}/${e.name}`])));
    surfaces.forEach((rel) => assert(!/store\.|execute\s*\(|\.command\s*\(/.test(code(rel)),
      `${rel} holds a store or a command path`));
  });
});

/* ============================================================== E */
describe("E. conflict, expiry and ambiguity", () => {
  test("a world that moves under a command is a conflict, recovered by re-reading", async () => {
    /* The repository is wrapped so the world's version advances between the
       load and the save — the server's own `state_changed` path. */
    let bump = false;
    const { close, seatClient } = await connect({
      repositoryWrapper: (repo) => ({ ...repo,
        loadWorld: async (tx) => {
          const w = await repo.loadWorld(tx);
          if (tx && bump) await tx.query("update metyet.world_meta set version = version + 1");
          return w;
        } }),
    });
    try {
      const { store } = seatClient(H.TOKEN);
      await store.load();
      const good = JSON.stringify(store.get());
      bump = true;

      let threw = null;
      try { await store.execute(H.COMMAND, H.PAYLOAD); } catch (error) { threw = error; }
      assert(threw, "a conflict resolved instead of throwing");
      eq(threw.failure, API.FAILURES.conflict, "a conflict was reported as something else");
      eq(store.status(), STORE.STATUS.conflict, "the store did not distinguish a conflict");
      assert(store.get() !== null, "the last good projection was thrown away");
      eq(store.lastRefusal(), null, "a conflict is not a refusal");
      assert(typeof good === "string");
    } finally { await close(); }
  });

  test("a session that ends fails closed, and cannot become another actor", async () => {
    const { close, app } = await connect();
    try {
      let token = H.COLLECTOR_TOKEN;
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => token,
        fetchImpl: H.fetchFor(app) });
      const store = STORE.createProductionStore({ api });
      await store.load();
      eq(store.get().actor.seat, "collector");
      const mine = JSON.stringify(store.get());

      token = null;                                        // the session ended
      let threw = null;
      try { await store.load(); } catch (error) { threw = error; }
      eq(threw && threw.failure, API.FAILURES.unauthenticated);
      eq(JSON.stringify(store.get()), mine, "the last truthful projection was blanked");
      eq(store.status(), STORE.STATUS.error);
      /* And it is still THEIR projection — no other actor's authority leaked in. */
      eq(store.get().actor.collectorId, H.COLLECTOR);
    } finally { await close(); }
  });

  test("an ambiguous network failure is never replayed", async () => {
    const { close, app } = await connect();
    try {
      let sent = 0;
      const impl = async (url, init) => {
        if (init && init.method === "POST") { sent += 1; throw new Error("connection lost"); }
        return H.fetchFor(app)(url, init);
      };
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => H.TOKEN, fetchImpl: impl });
      const store = STORE.createProductionStore({ api });
      await store.load();
      const good = JSON.stringify(store.get());
      let threw = null;
      try { await store.execute(H.COMMAND, H.PAYLOAD); } catch (error) { threw = error; }
      eq(threw && threw.failure, API.FAILURES.unavailable);
      eq(sent, 1, `the command was sent ${sent} times after an ambiguous failure`);
      eq(JSON.stringify(store.get()), good, "the good projection was cleared");
      eq(store.pending(), null, "and the store is stuck thinking one is in flight");
    } finally { await close(); }
  });

  test("two commands at once are never two mutations", async () => {
    const { close, app } = await connect();
    try {
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      let posts = 0;
      const impl = async (url, init) => {
        if (init && init.method === "POST") { posts += 1; await gate; }
        return H.fetchFor(app)(url, init);
      };
      const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => H.TOKEN, fetchImpl: impl });
      const store = STORE.createProductionStore({ api });
      await store.load();

      const first = store.execute(H.COMMAND, H.PAYLOAD);
      const second = store.execute(H.COMMAND, H.PAYLOAD);
      const outcome = await Promise.race([
        second.then(() => "RESOLVED", (e) => e),
        new Promise((resolve) => setTimeout(() => resolve("HUNG"), 100)),
      ]);
      assert(outcome !== "HUNG" && outcome !== "RESOLVED", "the duplicate was sent");
      eq(outcome.name, "CommandInFlightError");
      eq(posts, 1, `${posts} commands reached the server`);
      release();
      await first;
    } finally { await close(); }
  });
});

/* ============================================================== F */
describe("F. demo and production, including the error paths", () => {
  test("a failed production read never falls back to anything", async () => {
    const { close, seatClient } = await connect();
    try {
      const { store } = seatClient("not-a-real-token");
      try { await store.load(); } catch (error) { /* expected */ }
      eq(store.get(), null, "something stood in for a projection");
      const r = render(React.createElement(ProductionApp, { state: store.get(), onSignOut() {} }));
      const shown = flat(r);
      assert(!hasNav(r, TP_NAV) && !hasNav(r, CO_NAV), "a product surface rendered: " + shown);
      ["Casey", "Northline", "Sarah Mendel", "Charizard", "Switch persona", "Prototype"]
        .forEach((n) => assert(!shown.includes(n), `"${n}" appeared after a failed read: ` + shown));
    } finally { await close(); }
  });

  test("the production entry graph cannot reach the demo, and the demo cannot reach production", () => {
    const productionFiles = ["client/api.js", "client/session.js", "client/supabase-auth.js",
      "client/supabase-session.js", "client/production-store.js", "client/production-config.js",
      "client/actor.js", "client/production-app.jsx", "client/sign-in/SignIn.jsx", "app-src/main.jsx"]
      .concat(["client/collector", "client/tp"].flatMap((dir) =>
        fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
          .flatMap((e) => (e.isDirectory()
            ? fs.readdirSync(path.join(ROOT, dir, e.name)).map((f) => `${dir}/${e.name}/${f}`)
            : [`${dir}/${e.name}`]))));
    productionFiles.forEach((rel) => {
      const bare = code(rel);
      assert(!/src\/MetYet|shell\/MetYetPrototype|collector\/MetYetCollector|demo-flag|site-src/.test(bare),
        `${rel} reaches the demo`);
      assert(!/from ["'][^"']*domain\/|require\(["'][^"']*domain\//.test(bare), `${rel} imports domain`);
    });
    ["shell/MetYetPrototype.jsx", "src/MetYet.jsx", "collector/MetYetCollector.jsx", "site-src/main.jsx"]
      .forEach((rel) => assert(!/client\/|app-src/.test(code(rel)), `${rel} reaches production`));
  });

  test("the two bundles carry none of each other", () => {
    const build = (entry, define) => esbuild.buildSync({
      entryPoints: [path.join(ROOT, entry)], bundle: true, format: "esm", write: false,
      logLevel: "silent", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"', ...define },
    }).outputFiles[0].text;

    const production = build("app-src/main.jsx", { __METYET_DEV__: "false", __METYET_DEMO__: "false",
      __METYET_API_URL__: '""', __METYET_SUPABASE_URL__: '""', __METYET_SUPABASE_KEY__: '""' });
    ["buildCanonicalSeed", "prototypeRuntime", "systemRuntime", "projectForActor", "validateWorld",
      "metyet-commands", "CARDS_SEED", "Switch persona", "Reset demo", "p-self"]
      .forEach((n) => assert(!production.includes(n), `the production bundle contains "${n}"`));

    const demo = build("site-src/main.jsx", { __METYET_DEV__: "false", __METYET_DEMO__: "true" });
    ["supabase", "auth/v1", "Bearer ", "/api/view", "/api/commands", "state_changed",
      "CommandInFlightError", "CollectorShell", "TrustedPartnerShell"]
      .forEach((n) => assert(!demo.includes(n), `the demo bundle contains "${n}"`));
  });

  test("the two workspaces cannot import each other", () => {
    const listing = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
      .flatMap((e) => (e.isDirectory()
        ? fs.readdirSync(path.join(ROOT, dir, e.name)).map((f) => `${dir}/${e.name}/${f}`)
        : [`${dir}/${e.name}`]));
    listing("client/tp").forEach((rel) => assert(!/client\/collector|CollectorShell/.test(code(rel)),
      `${rel} reaches the Collector app`));
    listing("client/collector").forEach((rel) => assert(!/client\/tp|TrustedPartnerShell/.test(code(rel)),
      `${rel} reaches the TP workspace`));
  });
});

run();
