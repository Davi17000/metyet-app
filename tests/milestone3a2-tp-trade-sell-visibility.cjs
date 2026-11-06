/* ============================================================================
   M3A A2 — A TRUSTED PARTNER SEES THE TRADE/SELL COPIES THEIR COLLECTORS OFFER

   Production's Collector Network used to say only "Copies offered 3". The
   projection already carried each copy; nothing drew it. A2 draws it, under
   each connected Collector, read-only:

     SUPPLY     copies whose projected status is `available` — listed under
                "Available to trade", and exactly what that count says
     CONTEXT    copies one of THIS partner's deals is considering (`selected`)
                or holding (`reserved`, `committed`) — listed apart, never
                counted
     NOT HERE   `traded` (history, in its deal), `unavailable` (only a deal of
                theirs still names it), PC, unstated, and every copy of a
                Collector outside the network

   Nothing on this screen decides a status: the projection derived it from the
   partner's own deals (collectorCopyForViewer), and the screen sorts by it.

     A  the real demo seed: counts and rows agree with the projection
     B  the whole production path — screen, API client, Fastify, PGlite, the
        real catalogue — through the doors production already opens
     C  deal states, driven by the real (unexposed) trade commands on a valid
        world, read through the projection onto the same screen
     D  the presenter's table
     E  the boundary: read-only, one description request, no new door
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const React = require("react");
const TR = require("react-test-renderer");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { createApp } = require("../server/app.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { isExposed } = require("../server/exposed-commands.js");
const { fetchFor } = require("./helpers/command-server.cjs");
const RT = require("../domain/metyet-runtime.js");
const D = require("../domain/metyet-domain.js");
const P = require("../domain/metyet-projection.js");
const W = require("../domain/metyet-world.js");
const { createStore } = require("../domain/metyet-store.js");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const load = (rel) => {
  const out = esbuild.buildSync({ entryPoints: [path.join(ROOT, rel)], bundle: true, format: "cjs",
    write: false, logLevel: "silent", jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"], define: { "process.env.NODE_ENV": '"production"' } });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};
const Network = load("client/tp/sections/CollectorNetwork.jsx").default;
const PRESENT = load("client/tp/present.js");
const API = load("client/api.js");
const STORE = load("client/production-store.js");
const C = load("client/commands.js");
const ProductionApp = load("client/production-app.jsx").default;
const h = React.createElement;
const json = (v) => JSON.stringify(v);

/* ------------------------------------------------------------ READING */
const textOf = (node) => {
  if (typeof node === "string") return node;
  if (!node || !node.children) return "";
  if (node.type === "style") return "";
  return node.children.map(textOf).join(" ");
};
const squash = (s) => s.replace(/\s+/g, " ").trim();
const settle = async () => { for (let i = 0; i < 4; i += 1) await TR.act(async () => {}); };
/* The record for one Collector, found by the name in its title. */
const recordOf = (root, name) => root.findAll((n) => n.type === "article"
  && n.props.className === "tps-rec" && squash(textOf(n)).startsWith(name))[0] || null;
const listOf = (rec, which) => (rec ? rec.findAll((n) => n.type === "ul"
  && /cards (available to trade|in your deals)$/.test(n.props["aria-label"] || "")
  && n.props["aria-label"].endsWith(which))[0] || null : null);
const copyIdsIn = (node) => (node ? node.findAll((n) => n.type === "li" && n.props["data-copy"] != null)
  .map((n) => n.props["data-copy"]) : []);
const rowFor = (root, copyId) => root.findAll((n) => n.type === "li" && n.props["data-copy"] === copyId)[0] || null;
const countIn = (rec) => {
  const m = /Available to trade (\d+)/.exec(squash(textOf(rec && rec.findAll((n) => n.props && n.props.className === "tps-facts")[0])));
  return m ? Number(m[1]) : 0;
};
const supplyIds = (root, name) => copyIdsIn(listOf(recordOf(root, name), "available to trade"));
const dealIds = (root, name) => copyIdsIn(listOf(recordOf(root, name), "in your deals"));

/* The screen alone, with a description door that records what it is asked. */
async function screen(state, cards = {}) {
  const asked = [];
  const door = { describe: async (ids) => { asked.push([...ids]); return { cards: ids.map((id) => cards[id]).filter(Boolean) }; } };
  let r;
  await TR.act(async () => { r = TR.create(h(Network, { state, onBrowseCards: door })); });
  await settle();
  return { r, root: r.root, text: squash(textOf(r.toJSON() && { children: [].concat(r.toJSON()) })), asked };
}

/* ======================================================= A. REAL DEMO SEED */
const SEED = (() => {
  const out = esbuild.buildSync({ entryPoints: [path.join(ROOT, "src", "MetYet.jsx")], bundle: true, format: "cjs",
    write: false, logLevel: "silent", jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime"] });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports.buildCanonicalSeed;
})();

describe("A. On the real demo world, the screen and the projection agree copy for copy", () => {
  test("every partner: supply rows are exactly the in-network `available` copies; deal rows exactly their own selected/reserved/committed", async () => {
    const world = createStore(SEED()).get();
    assert(W.validateWorld(world).ok, "the demo world is valid");
    let sawEveryState = new Set();
    for (const p of world.partners) {
      const view = P.projectForActor(world, { partnerId: p.id });
      const s = await screen(view);
      for (const c of view.collectors) {
        const mine = view.collectorCopies.filter((b) => b.collectorId === c.id);
        mine.forEach((b) => sawEveryState.add(b.status));
        const want = (sts) => mine.filter((b) => sts.includes(b.status)).map((b) => b.id).sort();
        eq(json(supplyIds(s.root, c.name).sort()), json(want(["available"])), `${p.id}/${c.id} supply`);
        eq(json(dealIds(s.root, c.name).sort()), json(want(["selected", "reserved", "committed"])), `${p.id}/${c.id} context`);
        eq(countIn(recordOf(s.root, c.name)), want(["available"]).length, `${p.id}/${c.id} count is the supply rows`);
      }
      for (const b of view.collectorCopies.filter((x) => ["traded", "unavailable"].includes(x.status))) {
        assert(!rowFor(s.root, b.id), `${p.id}: a ${b.status} copy was listed (${b.id})`);
      }
    }
    for (const st of ["available", "selected", "reserved", "committed", "traded"]) {
      assert(sawEveryState.has(st), `the demo world exercises ${st} (saw ${[...sawEveryState]})`);
    }
  });
  test("the projection handed in is never edited", async () => {
    const view = P.projectForActor(createStore(SEED()).get(), { partnerId: "p-self" });
    const before = json(view);
    await screen(view);
    eq(json(view), before, "unchanged");
  });
});

/* =========================================== B. THE WHOLE PRODUCTION PATH */
const SUBJECT = { north: "sub-north", silver: "sub-silver", faraway: "sub-far", casey: "sub-casey", jordan: "sub-jordan" };
const MARK = { market: 4242, binder: "SECRET-BINDER-NAME", jordanCert: "JORDAN-ENDED-CERT", farCert: "UNSTATED-CERT" };
let pglite = null;
async function server() {
  const pg = pglite || (pglite = new PGlite());
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  const runtime = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 1000 });
  const repository = createWorldRepository(db);
  const catalog = createCatalogRepository(db, { newId: runtime.newId });
  const { expansionId } = await catalog.putExpansion({ game: "pokemon", code: "b1", name: "Base Set", printedTotal: 102 });
  const ctxOf = async (n, name) => (await catalog.putCardContext({ game: "pokemon", expansionId,
    collectorNumber: n, cardName: name, artist: "Ken Sugimori", rarity: "Rare" })).cardContextId;
  const charCtx = await ctxOf("4", "Charizard");
  const cards = {
    char1st: (await catalog.putCanonicalCard({ cardContextId: charCtx, finish: "holofoil", printRun: "first_edition" })).canonicalCardId,
    charUnl: (await catalog.putCanonicalCard({ cardContextId: charCtx, finish: "holofoil", printRun: "unlimited" })).canonicalCardId,
    blastoise: (await catalog.putCanonicalCard({ cardContextId: await ctxOf("2", "Blastoise"), finish: "holofoil" })).canonicalCardId,
    pikachu: (await catalog.putCanonicalCard({ cardContextId: await ctxOf("58", "Pikachu"), finish: "non_holo" })).canonicalCardId,
  };
  /* Jordan's relationship with Northline has ENDED. An UNSTATED copy — not
     offered and no keep decision (copyDisposition "unstated"; a stored copy
     must at least say `offered`, so this is the shape persistence accepts) —
     and a pre-C3.2 contradictory one are stored as old worlds hold them. */
  await repository.saveWorld({
    catalog: [], collectors: [{ id: "c1", name: "Casey Lin" }, { id: "c2", name: "Jordan Park" }],
    partners: [{ id: "p1", name: "Northline" }, { id: "p2", name: "Silver Vale" }, { id: "p3", name: "Faraway" }],
    relationships: [
      { partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" },
      { partnerId: "p2", collectorId: "c1", status: "accepted", at: "2030-01-01" },
      { partnerId: "p1", collectorId: "c2", status: "ended", at: "2030-01-01" },
      { partnerId: "p2", collectorId: "c2", status: "accepted", at: "2030-01-01" }],
    invitations: [], goals: [], inventory: [], binders: [], binderEntries: [],
    collectorCopies: [
      { id: "legacy-unstated", collectorId: "c1", canonicalCardId: cards.pikachu, grade: "PSA 6", cert: MARK.farCert, offered: false, addedAt: "2029-01-01" },
      { id: "legacy-conflict", collectorId: "c1", canonicalCardId: cards.blastoise, grade: "PSA 9", condition: "Damaged",
        cert: "CONFLICT-9", offered: true, addedAt: "2029-01-02" },
      { id: "jordan-1", collectorId: "c2", canonicalCardId: cards.pikachu, grade: "PSA 10", cert: MARK.jordanCert, offered: true, addedAt: "2029-01-03" }],
    interests: [], opportunities: [], conversations: [], photoRequests: [], copyReviews: [] });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: SUBJECT.north, role: "tp", partnerId: "p1" });
  await accounts.linkAccount({ subject: SUBJECT.silver, role: "tp", partnerId: "p2" });
  await accounts.linkAccount({ subject: SUBJECT.faraway, role: "tp", partnerId: "p3" });
  await accounts.linkAccount({ subject: SUBJECT.casey, role: "collector", collectorId: "c1" });
  await accounts.linkAccount({ subject: SUBJECT.jordan, role: "collector", collectorId: "c2" });
  const verifier = { verify: async (token) => {
    if (!SUBJECT[token]) throw Object.assign(new Error("no"), { reason: "bad token" });
    return { subject: SUBJECT[token], email: `${token}@example.invalid`, emailVerified: true };
  } };
  const app = createApp({ repository, catalog, accounts, verifier, runtime });
  const post = async (who, command, payload) => {
    const res = await app.inject({ method: "POST", url: "/api/commands",
      headers: { authorization: `Bearer ${who}` }, payload: { command, payload } });
    eq(res.statusCode, 200, `${command}: ${res.body}`);
    return res.json().value;
  };
  /* Casey's shelf, through Your Cards' own doors: two offered copies of ONE
     printing that differ in every physical fact, a PC copy of the same card,
     a raw copy, and a copy filed in a named binder with a private value. */
  const k = {};
  k.slabA = await post("casey", "addCollectorCopy", { copy: { canonicalCardId: cards.char1st, grade: "PSA 9", cert: "CERT-AAA-111",
    photos: { front: "binder:a:front", back: "binder:a:back" }, offered: true, market: MARK.market } });
  k.slabB = await post("casey", "addCollectorCopy", { copy: { canonicalCardId: cards.char1st, grade: "PSA 7", cert: "CERT-BBB-222",
    photos: { front: "binder:b:front" }, offered: true } });
  k.pc = await post("casey", "addCollectorCopy", { copy: { canonicalCardId: cards.char1st, grade: "PSA 10", cert: "CERT-PC-KEEP", keeping: true } });
  /* A raw copy that nonetheless carries a number in `cert`: a certificate is a
     graded copy's, so the row must not present this one as one. */
  k.raw = await post("casey", "addCollectorCopy", { copy: { canonicalCardId: cards.charUnl, grade: "Raw", condition: "Lightly Played",
    cert: "RAW-NOT-A-CERT", offered: true } });
  const binder = await post("casey", "createBinder", { name: MARK.binder });
  await post("casey", "fileObject", { binderId: binder, collectorCopyId: k.raw });
  assert(W.validateWorld(await repository.loadWorld()).ok, "the stored world is valid");
  return { app, repository, cards, k, post };
}
/* A partner's real seat: ProductionApp → shell → Collector Network, over the
   real API client and production store, counting every request it makes. */
async function seat(ctx, token) {
  const posts = []; const reads = [];
  const base = fetchFor(ctx.app);
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || "GET";
    if (method === "POST") posts.push(String(url)); else reads.push(String(url));
    return base(url, init);
  };
  const api = API.createApiClient({ baseUrl: "http://localhost", getToken: async () => token, fetchImpl });
  const store = STORE.createProductionStore({ api });
  await store.load();
  function Seat() {
    const [state, setState] = React.useState(store.get());
    React.useEffect(() => store.sub((s) => setState(s)), []);
    return h(ProductionApp, { state, onSignOut: () => {}, onBrowseCards: C.browseCards(store), onRefresh: C.refreshView(store) });
  }
  let r;
  await TR.act(async () => { r = TR.create(h(Seat)); });
  await settle();
  const s = { r, posts, reads, store };
  s.root = () => r.root;
  s.text = () => squash(textOf(r.root));
  s.refresh = async () => { await TR.act(async () => { await store.load(); }); await settle(); };
  return s;
}

describe("B. Through the whole production path", () => {
  test("a connected partner sees each offered copy, one row per physical copy, its printing from the catalogue and its facts from itself", async () => {
    const ctx = await server();
    const s = await seat(ctx, "north");
    const { k } = ctx;
    eq(json(supplyIds(s.root(), "Casey Lin").sort()), json([k.slabA, k.slabB, k.raw, "legacy-conflict"].sort()), "Casey's supply");
    eq(countIn(recordOf(s.root(), "Casey Lin")), 4, "Available to trade 4");
    const a = squash(textOf(rowFor(s.root(), k.slabA)));
    const b = squash(textOf(rowFor(s.root(), k.slabB)));
    const raw = squash(textOf(rowFor(s.root(), k.raw)));
    /* The printing: by canonical id, set · number · finish · print run. */
    for (const row of [a, b]) assert(/^Charizard Base Set · #4 · Holo · First Edition/.test(row), "printing: " + row);
    assert(/^Charizard Base Set · #4 · Holo\b/.test(raw) && !/First Edition/.test(raw), "the other printing: " + raw);
    /* The object: each copy's own grade, cert and photographs — never its twin's. */
    assert(/PSA 9/.test(a) && /Cert CERT-AAA-111/.test(a) && /Photos: front and back/.test(a), "copy A: " + a);
    assert(!/PSA 7|CERT-BBB/.test(a), "copy A borrowed copy B's facts: " + a);
    assert(/PSA 7/.test(b) && /Cert CERT-BBB-222/.test(b) && /Photos: front only/.test(b), "copy B: " + b);
    assert(!/PSA 9|CERT-AAA/.test(b), "copy B borrowed copy A's facts: " + b);
    /* Raw: the condition, no certificate, no photographs line invented. */
    assert(/Raw · Lightly Played/.test(raw) && !/Cert|RAW-NOT-A-CERT/.test(raw) && !/Photos/.test(raw), "raw copy: " + raw);
    assert(!/Selected|In your deal/.test(s.text()), "no deal word on free supply");
  });
  test("a contradictory pre-C3.2 copy shows both halves, as Inventory does, and is not cleaned up", async () => {
    const ctx = await server();
    const s = await seat(ctx, "north");
    const row = squash(textOf(rowFor(s.root(), "legacy-conflict")));
    assert(/Blastoise/.test(row) && /Says PSA 9 and Damaged/.test(row), "both halves: " + row);
  });
  test("PC, unstated, an ended relationship and an unconnected partner: nothing — not a row, not a count, not a certificate", async () => {
    const ctx = await server();
    const north = await seat(ctx, "north");
    const t = north.text();
    for (const leak of ["CERT-PC-KEEP", MARK.farCert, MARK.jordanCert, "Jordan Park", MARK.market, MARK.binder]) {
      assert(!t.includes(String(leak)), `Northline was shown ${leak}`);
    }
    assert(!rowFor(north.root(), ctx.k.pc) && !rowFor(north.root(), "legacy-unstated") && !rowFor(north.root(), "jordan-1"), "no hidden row");
    /* One offered and one PC copy of the same printing: only the offered ones. */
    eq(supplyIds(north.root(), "Casey Lin").filter((id) => [ctx.k.slabA, ctx.k.slabB, ctx.k.pc].includes(id)).length, 2, "the PC twin is not listed");
    const far = await seat(ctx, "faraway");
    assert(!/Casey Lin|Charizard|Available to trade/.test(far.text()), "an unconnected partner sees none of it: " + far.text().slice(0, 300));
    const silver = await seat(ctx, "silver");
    eq(json(supplyIds(silver.root(), "Jordan Park")), json(["jordan-1"]), "the partner Jordan IS connected to sees Jordan's copy");
  });
  test("the Collector switches a copy to PC: it leaves the partner's list and the count; offering it again brings back the SAME copy", async () => {
    const ctx = await server();
    const s = await seat(ctx, "north");
    await ctx.post("casey", "setCollectorCopyKept", { copyId: ctx.k.slabA, keeping: true });
    await s.refresh();
    assert(!rowFor(s.root(), ctx.k.slabA), "kept copy still listed");
    assert(!s.text().includes("CERT-AAA-111"), "its certificate still shown");
    eq(countIn(recordOf(s.root(), "Casey Lin")), 3, "Available to trade 3");
    await ctx.post("casey", "setCollectorCopyOffered", { copyId: ctx.k.slabA, offered: true });
    await s.refresh();
    assert(rowFor(s.root(), ctx.k.slabA), "re-offered copy is back, by the same id");
    eq(countIn(recordOf(s.root(), "Casey Lin")), 4, "Available to trade 4");
    assert(W.validateWorld(await ctx.repository.loadWorld()).ok, "still a valid world");
  });
  test("reading it sends nothing and asks for descriptions once, for the shown copies and goals only", async () => {
    const ctx = await server();
    const s = await seat(ctx, "north");
    eq(json(s.posts), "[]", "no command was sent");
    const describes = s.reads.filter((u) => /\/api\/canonical-cards/.test(u));
    eq(describes.length, 1, "one description request: " + json(s.reads));
    const asked = decodeURIComponent(describes[0].split("ids=")[1]).split(",").sort();
    eq(json(asked), json([ctx.cards.char1st, ctx.cards.charUnl, ctx.cards.blastoise].sort()),
      "the printings of shown copies — not the PC twin's alone, not the unstated or ended ones");
  });
});

/* ===================================== C. DEAL STATES, ON A VALID WORLD */
/* Northline (NL) and Riverside (RV) both serve Casey; Faraway (ZZ) serves no
   one. Every step is a real domain command, and the world is validated after
   each — the trade commands are not production doors yet (A3), so this is the
   strongest authorized boundary for these states. */
const AT = "2030-02-01";
const NL = { partnerId: "nl" }, RV = { partnerId: "rv" }, ZZ = { partnerId: "zz" }, CASEY = { collectorId: "casey" };
const DESC = { "cc-y": { canonicalCardId: "cc-y", cardName: "Lugia", expansionName: "Neo Genesis", collectorNumber: "9", finish: "holofoil" } };
const dealWorld = () => createStore({
  catalog: [], partners: [{ id: "nl", name: "Northline" }, { id: "rv", name: "Riverside" }, { id: "zz", name: "Faraway" }],
  collectors: [{ id: "casey", name: "Casey Lin" }],
  relationships: [{ partnerId: "nl", collectorId: "casey", status: "accepted", at: AT },
    { partnerId: "rv", collectorId: "casey", status: "accepted", at: AT }],
  invitations: [], preferences: [], binders: [], binderEntries: [], interests: [],
  opportunities: [], conversations: [], photoRequests: [], copyReviews: [],
  goals: [
    { id: "g1", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary" },
    { id: "g2", collectorId: "casey", canonicalCardId: "cc-w", tier: "primary" },
    { id: "g3", collectorId: "casey", canonicalCardId: "cc-q", tier: "primary" }],
  inventory: [
    { invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 300, grade: "PSA 9" },
    { invId: "i2", partnerId: "rv", canonicalCardId: "cc-w", ask: 300, grade: "PSA 9" },
    { invId: "i3", partnerId: "nl", canonicalCardId: "cc-q", ask: 300, grade: "PSA 9" }],
  collectorCopies: [
    { id: "k1", collectorId: "casey", canonicalCardId: "cc-y", grade: "PSA 8", cert: "K1-CERT", offered: true, addedAt: AT },
    { id: "k2", collectorId: "casey", canonicalCardId: "cc-y", grade: "PSA 6", cert: "K2-CERT", offered: true, addedAt: AT }],
});
const x = (st, a, c, p) => {
  const r = st.execute(a, c, { at: AT, ...(p || {}) });
  assert(r && r.ok !== false, `${c}: ${r && r.refused}`);
  const v = W.validateWorld(st.get());
  assert(v.ok, `world invalid after ${c}: ${json(v.errors.slice(0, 3))}`);
  return r.value;
};
const agreed = (st, goalId, invId, tp) => { const id = x(st, CASEY, "startOpportunity", { goalId, invId, amount: 300 }); x(st, tp, "acceptPrice", { oppId: id }); return id; };
const settleCard = (st, o, tp, row) => {
  x(st, CASEY, "proposeMarketValue", { oppId: o, tradeCardId: row, amount: 100 }); x(st, tp, "acceptMarketValue", { oppId: o, tradeCardId: row });
  x(st, tp, "proposeTradePercent", { oppId: o, tradeCardId: row, percent: 0.8 }); x(st, CASEY, "acceptTradePercent", { oppId: o, tradeCardId: row });
};
const complete = (st, o, tp) => {
  x(st, tp, "acceptDeal", { oppId: o }); x(st, CASEY, "acceptDeal", { oppId: o });
  x(st, tp, "proposeFulfillment", { oppId: o, plan: { method: "meet" } }); x(st, CASEY, "confirmFulfillmentPlan", { oppId: o });
  x(st, tp, "confirmHandoff", { oppId: o }); x(st, CASEY, "confirmHandoff", { oppId: o });
};
const look = (st, tp) => screen(P.projectForActor(st.get(), tp), DESC);
const where = async (st, tp) => { const s = await look(st, tp);
  return { supply: supplyIds(s.root, "Casey Lin"), deal: dealIds(s.root, "Casey Lin"), count: countIn(recordOf(s.root, "Casey Lin")), s }; };

describe("C. Each copy state reads the projection's answer for THIS partner", () => {
  test("available: both connected partners list it as supply; an unconnected one sees nothing", async () => {
    const st = dealWorld();
    assert(W.validateWorld(st.get()).ok, "valid");
    for (const tp of [NL, RV]) {
      const w = await where(st, tp);
      eq(json(w.supply.sort()), json(["k1", "k2"]), `${tp.partnerId} supply`); eq(w.count, 2, "count");
      assert(/Lugia Neo Genesis · #9 · Holo/.test(squash(textOf(rowFor(w.s.root, "k1")))), "described by canonical id");
    }
    const z = await look(st, ZZ);
    assert(!/Casey|Lugia|K1-CERT/.test(z.text), "Faraway: " + z.text);
  });
  test("selected in YOUR deal: 'Selected in your deal', apart and uncounted; a rival partner's screen does not change at all", async () => {
    const st = dealWorld();
    const before = (await look(st, RV)).text;
    const a = agreed(st, "g1", "i1", NL);
    const rvAfterOpen = (await look(st, RV)).text;
    x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1"] });
    const nl = await where(st, NL);
    eq(json(nl.supply), json(["k2"]), "NL supply"); eq(json(nl.deal), json(["k1"]), "NL context"); eq(nl.count, 1, "NL count");
    assert(/Selected in your deal/.test(squash(textOf(rowFor(nl.s.root, "k1")))), "labelled");
    assert(!/In your deal|Selected/.test(squash(textOf(rowFor(nl.s.root, "k2")))), "k2 is plain supply");
    const rv = (await look(st, RV)).text;
    eq(rv, rvAfterOpen, "Riverside's screen is byte-identical: Northline's selection is invisible");
    eq(before, rvAfterOpen, "and opening a deal elsewhere changed nothing either");
  });
  test("selected by BOTH partners: each sees only its own selection", async () => {
    const st = dealWorld();
    const a = agreed(st, "g1", "i1", NL); const b = agreed(st, "g2", "i2", RV);
    x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1"] });
    x(st, RV, "selectTradeCards", { oppId: b, copyIds: ["k1"] });
    for (const tp of [NL, RV]) {
      const w = await where(st, tp);
      eq(json(w.deal), json(["k1"]), `${tp.partnerId} its own selection`); eq(w.count, 1, "k2 only");
      assert(!/Northline|Riverside/.test(squash(textOf(rowFor(w.s.root, "k1")))), "no partner named on the row");
    }
  });
  test("reserved and committed in YOUR deal: 'In your deal'; elsewhere it is neither supply nor shown — even to a partner whose stale selection names it", async () => {
    const st = dealWorld();
    const a = agreed(st, "g1", "i1", NL); const b = agreed(st, "g2", "i2", RV);
    const [ra] = x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1"] });
    x(st, RV, "selectTradeCards", { oppId: b, copyIds: ["k1"] });
    x(st, CASEY, "continueTradeSelection", { oppId: a }); x(st, NL, "closeTradeSelection", { oppId: a });
    eq(D.collectorCopyStatus("k1", st.get().opportunities), "reserved", "reserved");
    let nl = await where(st, NL);
    eq(json(nl.deal), json(["k1"]), "NL context"); eq(nl.count, 1, "NL count excludes it");
    assert(/In your deal/.test(squash(textOf(rowFor(nl.s.root, "k1")))) && !/Selected/.test(squash(textOf(rowFor(nl.s.root, "k1")))), "held, not selected");
    let rv = await where(st, RV);
    eq(P.projectForActor(st.get(), RV).collectorCopies.find((c) => c.id === "k1").status, "unavailable", "projection: unavailable to RV");
    assert(!rowFor(rv.s.root, "k1"), "RV: not listed anywhere"); eq(rv.count, 1, "RV count is k2 only");
    settleCard(st, a, NL, ra);
    x(st, NL, "acceptDeal", { oppId: a }); x(st, CASEY, "acceptDeal", { oppId: a });
    eq(D.collectorCopyStatus("k1", st.get().opportunities), "committed", "committed");
    nl = await where(st, NL);
    assert(/In your deal/.test(squash(textOf(rowFor(nl.s.root, "k1")))), "committed: in your deal"); eq(nl.count, 1, "uncounted");
    rv = await where(st, RV);
    assert(!rowFor(rv.s.root, "k1"), "RV still sees nothing of it");
  });
  test("traded: off the list for the partner who received it and for the one whose stale selection still names it", async () => {
    const st = dealWorld();
    const a = agreed(st, "g1", "i1", NL); const b = agreed(st, "g2", "i2", RV);
    const [ra] = x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1"] });
    x(st, RV, "selectTradeCards", { oppId: b, copyIds: ["k1"] });
    x(st, CASEY, "continueTradeSelection", { oppId: a }); x(st, NL, "closeTradeSelection", { oppId: a });
    settleCard(st, a, NL, ra); complete(st, a, NL);
    eq(D.collectorCopyStatus("k1", st.get().opportunities), "traded", "traded");
    assert(D.TRADE.liveTradeRows(st.get().opportunities.find((o) => o.id === b)).some((r) => r.binderId === "k1"), "RV's stale selection remains");
    for (const tp of [NL, RV]) {
      const w = await where(st, tp);
      assert(!rowFor(w.s.root, "k1"), `${tp.partnerId}: traded copy listed`);
      eq(w.count, 1, `${tp.partnerId}: only k2 is supply`);
    }
    assert(st.get().opportunities.find((o) => o.id === a).trade.cards.some((c) => c.binderId === "k1"), "its history stays in the deal");
  });
  test("the same partner's stale selection: traded in one deal, still selected in another — not supply, not context", async () => {
    const st = dealWorld();
    const a = agreed(st, "g1", "i1", NL); const c = agreed(st, "g3", "i3", NL);
    const [ra] = x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1"] });
    x(st, NL, "selectTradeCards", { oppId: c, copyIds: ["k1"] });
    x(st, CASEY, "continueTradeSelection", { oppId: a }); x(st, NL, "closeTradeSelection", { oppId: a });
    settleCard(st, a, NL, ra); complete(st, a, NL);
    const nl = await where(st, NL);
    assert(!rowFor(nl.s.root, "k1"), "listed"); eq(nl.count, 1, "count");
  });
  test("unavailable: withdrawn from your deal and then kept as PC — your deal still names it, the list does not", async () => {
    const st = dealWorld();
    const a = agreed(st, "g1", "i1", NL);
    const [ra] = x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1"] });
    x(st, CASEY, "withdrawTradeCard", { oppId: a, tradeCardId: ra });
    x(st, CASEY, "setCollectorCopyKept", { copyId: "k1", keeping: true });
    eq(P.projectForActor(st.get(), NL).collectorCopies.find((b) => b.id === "k1").status, "unavailable", "projection");
    const nl = await where(st, NL);
    assert(!rowFor(nl.s.root, "k1"), "listed"); eq(nl.count, 1, "count");
    assert(!nl.s.text.includes("K1-CERT"), "its certificate is not on the Collector Network");
  });
  test("a relationship that ends takes the copies with it, even the ones your own deal holds", async () => {
    const st = dealWorld();
    const a = agreed(st, "g1", "i1", NL);
    x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1"] });
    const ended = { ...st.get(), relationships: st.get().relationships.map((r) => (r.partnerId === "nl" ? { ...r, status: "ended" } : r)) };
    assert(W.validateWorld(ended).ok, "valid");
    const s = await screen(P.projectForActor(ended, NL), DESC);
    assert(!/Casey|Lugia|K1-CERT|K2-CERT|Available to trade/.test(s.text), "ended: " + s.text);
  });
});

/* ========================================================= D. PRESENTER */
describe("D. The presenter only sorts the server's words", () => {
  test("the table: available is supply; selected, reserved, committed are context; nothing else is here", () => {
    const st = (s) => PRESENT.copyStanding({ status: s });
    eq(json(st("available")), json({ supply: true, label: null }), "available");
    eq(st("selected").label, "Selected in your deal", "selected"); eq(st("selected").supply, false, "not supply");
    eq(st("reserved").label, "In your deal", "reserved"); eq(st("committed").label, "In your deal", "committed");
    for (const s of ["traded", "unavailable", "pending", "sold", "SELECTED", "", "toString", "__proto__", "constructor"]) {
      eq(st(s), null, `"${s}" is not on this list`);
    }
    eq(PRESENT.copyStanding({}), null, "no status"); eq(PRESENT.copyStanding(null), null, "no row");
    eq(PRESENT.copyStanding({ status: " available " }).supply, true, "the server's word, trimmed like every other text");
    eq(PRESENT.statusLabel("selected"), "Selected", "the status word has a label");
  });
  test("a copy with no description yet, or no canonical card, is named neutrally — never from the old catalogue", async () => {
    const state = { actor: { seat: "tp", partnerId: "p" }, collectors: [{ id: "c", name: "Casey Lin" }],
      relationships: [{ partnerId: "p", collectorId: "c", status: "accepted" }], goals: [], invitations: [],
      catalog: [{ id: "old-1", name: "OLD CATALOGUE NAME", set: "OLD SET", grade: "PSA 10" }],
      collectorCopies: [
        { id: "a", collectorId: "c", canonicalCardId: "cc-unknown", grade: "PSA 8", status: "available" },
        { id: "b", collectorId: "c", cardId: "old-1", grade: "PSA 7", status: "available" },
        { id: "u", collectorId: "c", canonicalCardId: "cc-unknown", status: "available" }]
        .map((b) => ({ ...b, grading: D.gradingRead(b) })) };   // as the projection carries it
    const s = await screen(state, {});
    assert(/A card MetYet is still describing/.test(squash(textOf(rowFor(s.root, "a")))), "pending description");
    const b = squash(textOf(rowFor(s.root, "b")));
    assert(/A card MetYet can't describe/.test(b) && /PSA 7/.test(b), "legacy copy: " + b);
    assert(!/OLD CATALOGUE NAME|OLD SET|PSA 10/.test(s.text), "the old catalogue entry was read: " + s.text);
    const u = squash(textOf(rowFor(s.root, "u")));
    eq(u, "A card MetYet is still describing", "nothing stated, nothing shown");
  });
  test("rows are joined to their Collector by id, never by position", async () => {
    const state = { actor: { seat: "tp", partnerId: "p" },
      collectors: [{ id: "c1", name: "Ada Collector" }, { id: "c2", name: "Bo Collector" }],
      relationships: [], goals: [], invitations: [],
      collectorCopies: [{ id: "bo-1", collectorId: "c2", canonicalCardId: "z", grade: "PSA 5", status: "available" },
        { id: "ghost", collectorId: "c-stranger", canonicalCardId: "z", grade: "PSA 4", status: "available" }] };
    const s = await screen(state, {});
    eq(json(supplyIds(s.root, "Ada Collector")), "[]", "Ada has none"); eq(json(supplyIds(s.root, "Bo Collector")), json(["bo-1"]), "Bo's");
    assert(!rowFor(s.root, "ghost"), "a copy of somebody not in the network renders nowhere");
  });
});

/* ========================================================== E. BOUNDARY */
describe("E. Read-only, through the doors that already exist", () => {
  test("the section sends no command and takes no new callback", () => {
    const src = code("client/tp/sections/CollectorNetwork.jsx");
    const sig = /export default function CollectorNetwork\(\{([^}]*)\}/.exec(src)[1].replace(/\s+/g, " ").trim();
    eq(sig, "state, onInvite = null, onRevokeInvite = null, onRefresh = null, onBrowseCards = null", "props unchanged");
    for (const cmd of ["selectTradeCards", "deselectTradeCard", "closeTradeSelection", "setInterest", "markBinderReviewed", "withdrawTradeCard"]) {
      assert(!src.includes(cmd), `${cmd} appears in the Collector Network`);
    }
    assert(!/MetYet\.jsx|metyet-domain|metyet-projection/.test(src), "no prototype or domain import");
  });
  test("the screen decides no status: it never reads opportunities to classify a copy", () => {
    const src = code("client/tp/sections/CollectorNetwork.jsx");
    assert(!/collectorCopyStatus|binderRowState|EXCLUSIVE_COPY_STATES|\.offered\b|\.keeping\b|\.market\b/.test(src), "a second status rule");
  });
  test("no trade or interest command became a production door", () => {
    for (const cmd of ["selectTradeCards", "deselectTradeCard", "closeTradeSelection", "holdTradeSelection",
      "continueTradeSelection", "withdrawTradeCard", "setInterest"]) eq(isExposed(cmd), false, cmd);
  });
  test("the partner projection still carries no keep decision, private value or binder", () => {
    eq(json(P.FIELD_RULES.COLLECTOR_COPY_FOR_PARTNER),
      json(["id", "collectorId", "cardId", "canonicalCardId", "grade", "condition", "offered", "photos", "cert", "addedAt", "updatedAt"]),
      "allow-list unchanged");
  });
  test("one description request covers goals and shown copies together", async () => {
    const state = { actor: { seat: "tp", partnerId: "p" }, collectors: [{ id: "c", name: "Casey Lin" }],
      relationships: [], invitations: [], goals: [{ id: "g", collectorId: "c", canonicalCardId: "cc-goal", tier: "primary" }],
      collectorCopies: [
        { id: "a", collectorId: "c", canonicalCardId: "cc-a", status: "available" },
        { id: "b", collectorId: "c", canonicalCardId: "cc-b", status: "reserved" },
        { id: "t", collectorId: "c", canonicalCardId: "cc-traded", status: "traded" },
        { id: "u", collectorId: "c", canonicalCardId: "cc-unavail", status: "unavailable" }] };
    const s = await screen(state, {});
    eq(s.asked.length, 1, "one request: " + json(s.asked));
    eq(json(s.asked[0].sort()), json(["cc-a", "cc-b", "cc-goal"]), "shown copies and goals; nothing it will not draw");
  });
});

run();
