/* ============================================================================
   PHASE 5 C3.5 — CLOSING THE LOOP

   A Collector says what they are looking for. Their Trusted Partner reads it.
   And — since this batch — the Collector is told which of their shops has one.

   WHAT WAS BROKEN. C3.4 removed the Goals tab, correctly: a Goal is priority
   and belongs where the card is, not in a destination of its own. But
   `Goals.jsx` was the only file in the client that read `state.discoveries`,
   and it went into `DEFERRED_SECTIONS` with the tab. So the server kept
   computing the overlap, kept scoping it to accepted relationships, kept
   sending it — and no Collector could see any of it. The product asked for
   effort and answered with silence. Separately, `goal.desired` had crossed the
   seat boundary since C3.2 and no partner screen rendered it, so the one
   person it was written for could not read which copy was wanted.

   WHAT THIS BATCH IS, AND IS NOT. It is two readers over data that was already
   projected and already authorized. It is not the Goals tab coming back, not a
   shop's catalogue, not search across shops, not a message, not an offer, and
   not a persisted anything. No command was exposed, no projection changed, no
   migration was written.

   A. under your own shop      the answer, named, with the cards
   B. only what you asked for  nothing inferred, nothing borrowed, nothing else's
   C. it only reads            no action, no write, no read-state, no invId
   D. which copy they want     `desired`, rendered where it was always going
   E. still two facts          how hard, and which copy, kept apart
   F. the boundaries hold      exposure, migration, privacy, navigation
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const React = require("react");
const TR = require("react-test-renderer");
const esbuild = require("esbuild");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { createApp } = require("../server/app.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
const C = require("../domain/metyet-commands.js");
const D = require("../domain/metyet-domain.js");
const RT = require("../domain/metyet-runtime.js");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const json = (v) => JSON.stringify(v);

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

const SUBJECT = { north: "sub-north", south: "sub-south", casey: "sub-casey", dana: "sub-dana" };
/* TWO SHOPS AND TWO COLLECTORS, every pairing accepted except one — so
   "scoped to this Collector" and "under the right shop" are both falsifiable
   rather than true by there being only one of everything. */
async function world() {
  const pg = database();
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  const runtime = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 1000 });
  const repository = createWorldRepository(db);
  const catalog = createCatalogRepository(db, { newId: runtime.newId });
  await repository.saveWorld({
    catalog: [],
    collectors: [{ id: "c1", name: "Casey" }, { id: "c2", name: "Dana" }],
    partners: [{ id: "p1", name: "Northline" }, { id: "p2", name: "Southgate" }],
    relationships: [
      { partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" },
      { partnerId: "p2", collectorId: "c1", status: "accepted", at: "2030-02-02" },
      { partnerId: "p1", collectorId: "c2", status: "accepted", at: "2030-01-01" },
    ],
    invitations: [], goals: [], inventory: [], collectorCopies: [],
    binders: [], binderEntries: [],
    interests: [], opportunities: [], conversations: [], photoRequests: [], copyReviews: [],
  });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: SUBJECT.north, role: "tp", partnerId: "p1" });
  await accounts.linkAccount({ subject: SUBJECT.south, role: "tp", partnerId: "p2" });
  await accounts.linkAccount({ subject: SUBJECT.casey, role: "collector", collectorId: "c1" });
  await accounts.linkAccount({ subject: SUBJECT.dana, role: "collector", collectorId: "c2" });
  const verifier = { verify: async (token) => {
    const subject = SUBJECT[token];
    if (!subject) throw Object.assign(new Error("no"), { reason: "bad token" });
    return { subject, email: `${token}@example.invalid`, emailVerified: true };
  } };
  return { pg, db, runtime, repository, catalog,
    app: createApp({ repository, catalog, accounts, verifier, runtime }) };
}

async function cards(ctx) {
  const { expansionId } = await ctx.catalog.putExpansion(
    { game: "pokemon", code: "base1", name: "Base", printedTotal: 102 });
  const charizard = await ctx.catalog.putCardContext({ game: "pokemon", expansionId,
    collectorNumber: "4", cardName: "Charizard", artist: "Mitsuhiro Arita" });
  const mudkip = await ctx.catalog.putCardContext({ game: "pokemon", expansionId,
    collectorNumber: "63", cardName: "Mudkip", artist: "Kagemaru Himeno" });
  const made = {};
  made.firstEdition = (await ctx.catalog.putCanonicalCard({ cardContextId: charizard.cardContextId,
    printRun: "first_edition", finish: "holofoil",
    imageSmall: "https://img.example.invalid/zard-small.png" })).canonicalCardId;
  made.unlimited = (await ctx.catalog.putCanonicalCard({ cardContextId: charizard.cardContextId,
    printRun: "unlimited", finish: "holofoil" })).canonicalCardId;
  made.mudkip = (await ctx.catalog.putCanonicalCard({ cardContextId: mudkip.cardContextId,
    printRun: "unlimited", finish: "non_holo",
    imageSmall: "https://img.example.invalid/mudkip-small.png" })).canonicalCardId;
  return made;
}

const post = (app, token, command, payload) => app.inject({ method: "POST", url: "/api/commands",
  headers: { authorization: `Bearer ${token}` }, payload: { command, payload } });
const get = (app, token, url) => app.inject({ method: "GET", url,
  headers: { authorization: `Bearer ${token}` } });
const view = async (app, token) => (await get(app, token, "/api/view")).json().state;
const load = (ctx) => ctx.repository.loadWorld();
const want = (app, token, canonicalCardId, tier = "primary", desired = { grade: "PSA 9" }) =>
  post(app, token, "addGoal", { canonicalCardId, tier, desired });
const stock = (app, token, copy) => post(app, token, "addInventoryCopy", { copy });

/* ---------------------------------------------------------------- RENDERING */
const build = (rel) => {
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
const TrustedPartners = build("client/collector/sections/TrustedPartners.jsx").default;
const CollectorNetwork = build("client/tp/sections/CollectorNetwork.jsx").default;
const COLLECTOR_SHELL = build("client/collector/CollectorShell.jsx");
const TP_SHELL = build("client/tp/TrustedPartnerShell.jsx");
const TP_PRESENT = build("client/tp/present.js");

/* Both sections render fragments or nodes; every walk here handles both. */
const texts = (r) => {
  const out = [];
  const walk = (n) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (typeof n === "string" || typeof n === "number") { out.push(String(n)); return; }
    if (!n || n.type === "style") return;
    for (const c of n.children || []) walk(c);
  };
  walk(r.toJSON());
  return out.join(" ").replace(/\s+/g, " ");
};
const buttons = (r) => r.root.findAll((n) => n.type === "button");
/* The text of one test INSTANCE, which has `children` but no `toJSON`. */
const instText = (node) => {
  const out = [];
  const walk = (n) => {
    if (typeof n === "string" || typeof n === "number") { out.push(String(n)); return; }
    if (!n || !Array.isArray(n.children)) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out.join(" ").replace(/\s+/g, " ");
};
const images = (r) => r.root.findAll((n) => n.type === "img").map((n) => n.props.src);
const settle = async () => {
  for (let i = 0; i < 20; i += 1) {
    await TR.act(async () => { await new Promise((done) => setTimeout(done, 0)); });
  }
};

/* The catalogue door, counting calls so "one request for the ids on screen"
   is checkable and so "described, never mirrored" has something to prove. */
const doorFor = (ctx) => {
  const calls = { describe: 0, ids: [] };
  return { calls, door: {
    find: async (q) => ctx.catalog.findCardContexts(Object.fromEntries(new URLSearchParams(q).entries())),
    read: async (id) => {
      const found = await ctx.catalog.readCardContext(id);
      return found ? { ...found.context, canonicalCards: found.canonicalCards } : null;
    },
    describe: async (ids) => {
      calls.describe += 1; calls.ids.push([...ids]);
      return { cards: await ctx.catalog.describeCanonicalCards(ids) };
    },
    expansions: async (q) => ctx.catalog.findExpansions(Object.fromEntries(new URLSearchParams(q).entries())),
    artists: async (q) => ctx.catalog.findArtists(Object.fromEntries(new URLSearchParams(q).entries())),
  } };
};

/* The Collector's own Trusted Partners screen, over the real projection. */
async function shops(ctx, token = "casey") {
  const { calls, door } = doorFor(ctx);
  const state = await view(ctx.app, token);
  let r;
  await TR.act(async () => {
    r = TR.create(React.createElement(TrustedPartners, { state, onBrowseCards: door }));
  });
  await settle();
  return { r, calls, state };
}

/* The partner's own Collector Network screen, over the real projection. */
async function network(ctx, token = "north") {
  const { calls, door } = doorFor(ctx);
  const state = await view(ctx.app, token);
  let r;
  await TR.act(async () => {
    r = TR.create(React.createElement(CollectorNetwork, { state, onBrowseCards: door }));
  });
  await settle();
  return { r, calls, state };
}

/* One Collector, one goal, one partner holding it. The shape most of section
   A varies from. */
async function oneOverlap(ctx) {
  const made = await cards(ctx);
  await want(ctx.app, "casey", made.firstEdition, "primary");
  await stock(ctx.app, "north", { canonicalCardId: made.firstEdition, ask: 900 });
  return made;
}

/* ============================================================== A
   The answer, under the shop that has it. */
describe("A. under your own shop", () => {

  test("the shop is named, and the card it has is the one you asked for", async () => {
    const ctx = await world();
    await oneOverlap(ctx);
    const { r } = await shops(ctx);
    const said = texts(r);
    /* The sentence names the shop — this is the regression C3.4 opened and the
       whole reason the batch exists. An anonymous count is not this. */
    assert(said.includes("Northline has a card you're looking for."), said);
    assert(said.includes("Charizard"), said);
    assert(!/of your Trusted Partners have this/.test(said),
      "the anonymous holder count was reproduced instead of naming the shop: " + said);
  });

  test("the card is identified the way every canonical surface identifies one", async () => {
    const ctx = await world();
    await oneOverlap(ctx);
    const { r, calls } = await shops(ctx);
    const said = texts(r);
    assert(said.includes("Charizard"), said);
    assert(said.includes("Base"), said);
    assert(said.includes("#4"), said);
    eq(json(images(r)), json(["https://img.example.invalid/zard-small.png"]),
      "the catalogue's own picture is not what is shown");
    /* ONE request for the ids on screen — never one per row. */
    eq(calls.describe, 1, `the screen asked ${calls.describe} times`);
  });

  test("two shops, two answers, and neither borrows the other's", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.firstEdition, "primary");
    await want(ctx.app, "casey", made.mudkip, "secondary");
    await stock(ctx.app, "north", { canonicalCardId: made.firstEdition, ask: 900 });
    await stock(ctx.app, "south", { canonicalCardId: made.mudkip, ask: 20 });
    const { r } = await shops(ctx);
    const said = texts(r);
    const north = said.indexOf("Northline");
    const south = said.indexOf("Southgate");
    assert(north >= 0 && south >= 0, said);
    /* Each card sits between its own shop's name and the next shop's. */
    const zard = said.indexOf("Charizard");
    const mud = said.indexOf("Mudkip");
    assert(north < zard && zard < south, "the Charizard is not under Northline: " + said);
    assert(south < mud, "the Mudkip is not under Southgate: " + said);
    assert(said.includes("Northline has a card you're looking for."), said);
    assert(said.includes("Southgate has a card you're looking for."), said);
  });

  test("several cards at one shop are counted, and counted as cards you asked for", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    for (const id of [made.firstEdition, made.unlimited, made.mudkip]) {
      await want(ctx.app, "casey", id, "primary");
      await stock(ctx.app, "north", { canonicalCardId: id, ask: 100 });
    }
    /* A second copy of one of them: the count is of YOUR cards, not their stock. */
    await stock(ctx.app, "north", { canonicalCardId: made.mudkip, ask: 110 });
    const { r } = await shops(ctx);
    const said = texts(r);
    assert(said.includes("Northline has 3 cards you're looking for."), said);
    assert(!/4 cards/.test(said), "their second copy was counted as a fourth card: " + said);
  });

  test("a shop with nothing of yours says nothing at all", async () => {
    const ctx = await world();
    await oneOverlap(ctx);
    const { r } = await shops(ctx);
    const said = texts(r);
    assert(said.includes("Southgate"), "the second shop stopped being listed: " + said);
    assert(!/Southgate has/.test(said), "a shop with nothing claimed something: " + said);
    assert(!/0 cards/.test(said), "a shop was told it has none of your cards: " + said);
    eq((said.match(/cards? you're looking for/g) || []).length, 1, said);
  });

  test("both priorities show, and each says which it is", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.firstEdition, "primary");
    await want(ctx.app, "casey", made.mudkip, "secondary");
    await stock(ctx.app, "north", { canonicalCardId: made.firstEdition, ask: 900 });
    await stock(ctx.app, "north", { canonicalCardId: made.mudkip, ask: 20 });
    const { r } = await shops(ctx);
    const said = texts(r);
    assert(said.includes("Actively hunting"), said);
    assert(said.includes("Keeping an eye out"), said);
    /* THE WORDS A PERSON READS, not the domain's names for the tiers. The risk
       on THIS seat is not "Primary goal" — no Collector presenter can emit
       that — it is `tierIntent` silently failing and the row falling through
       to `tierLabel`, which on this seat says the bare word "Primary". So the
       tags are read off the tree and held to the sentence, which is the thing
       that would actually regress. */
    const tags = r.root.findAll((n) => n.type === "span"
      && /mcs-tag/.test(n.props.className || "")).map(instText).map((t) => t.trim());
    eq(json(tags.filter((t) => /hunting|eye out|Primary|Secondary/.test(t)).sort()),
      json(["Actively hunting", "Keeping an eye out"]),
      "a tier tag is not the sentence a person reads: " + json(tags));
  });

  test("a card the catalogue has not described yet still appears", async () => {
    const ctx = await world();
    await oneOverlap(ctx);
    const state = await view(ctx.app, "casey");
    let r;
    /* No catalogue door at all: the shop still has your card. */
    await TR.act(async () => {
      r = TR.create(React.createElement(TrustedPartners, { state, onBrowseCards: null }));
    });
    await settle();
    const said = texts(r);
    assert(said.includes("Northline has a card you're looking for."), said);
    assert(said.includes("Loading this card…"), said);
    eq(json(images(r)), json([]), "an image appeared without a description");
  });
});

/* ============================================================== B
   Only what you asked for — nothing inferred, nothing else's. */
describe("B. only what you asked for", () => {

  test("a card in a binder, wanted by nobody, is not an answer", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const binder = (await post(ctx.app, "casey", "createBinder", { name: "Mudkips" })).json().value;
    await post(ctx.app, "casey", "addBinderEntry",
      { binderId: binder, canonicalCardId: made.mudkip });
    await stock(ctx.app, "north", { canonicalCardId: made.mudkip, ask: 20 });
    const { r, state } = await shops(ctx);
    eq(state.discoveries.length, 0, "filing a card created demand");
    assert(!/has a card you're looking for|has \d+ cards/.test(texts(r)),
      "binder membership was read as a want: " + texts(r));
  });

  test("a card you own, wanted by nobody, is not an answer either", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await post(ctx.app, "casey", "addCollectorCopy",
      { copy: { canonicalCardId: made.mudkip, grade: "PSA 9" } });
    await stock(ctx.app, "north", { canonicalCardId: made.mudkip, ask: 20 });
    const { r, state } = await shops(ctx);
    eq(state.discoveries.length, 0, "owning a card created demand");
    assert(!/you're looking for/.test(texts(r)), texts(r));
  });

  test("another Collector's goals never reach your screen", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    /* Dana wants the Charizard from the same shop Casey is related to. */
    await want(ctx.app, "dana", made.firstEdition, "primary");
    await stock(ctx.app, "north", { canonicalCardId: made.firstEdition, ask: 900 });
    const { r, state } = await shops(ctx, "casey");
    eq(state.discoveries.length, 0, "somebody else's goal reached this Collector");
    assert(!/you're looking for/.test(texts(r)), texts(r));
    /* And Dana, who did ask, is answered. */
    const theirs = await shops(ctx, "dana");
    assert(texts(theirs.r).includes("Northline has a card you're looking for."), texts(theirs.r));
  });

  test("a shop you are not related to is not on the screen, answer or no answer", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "dana", made.firstEdition, "primary");
    await stock(ctx.app, "south", { canonicalCardId: made.firstEdition, ask: 900 });
    /* Dana is related to Northline only; Southgate holds what Dana wants. */
    const { r, state } = await shops(ctx, "dana");
    assert(!texts(r).includes("Southgate"), "an unrelated shop appeared: " + texts(r));
    eq(state.partners.filter((p) => p.id === "p2").length, 0, "the server sent an unrelated partner");
    eq(state.discoveries.length, 0, "an unrelated shop's supply became a discovery");
  });

  test("the rest of a shop's shelf never appears — only the overlap", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.firstEdition, "primary");
    await stock(ctx.app, "north", { canonicalCardId: made.firstEdition, ask: 900 });
    /* Two more cards on the same shelf that Casey never asked for. */
    await stock(ctx.app, "north", { canonicalCardId: made.mudkip, ask: 20 });
    await stock(ctx.app, "north", { canonicalCardId: made.unlimited, ask: 400 });
    const { r, state } = await shops(ctx);
    const said = texts(r);
    assert(said.includes("Charizard"), said);
    assert(!said.includes("Mudkip"), "a card nobody asked for was listed: " + said);
    /* The projection DID carry the whole shelf — the screen is what narrows it,
       and that is the claim: this is not a filtered marketplace, it is an
       answer to a question the Collector asked. */
    assert(state.inventory.length >= 3, "the fixture stopped proving anything");
    eq(state.discoveries.length, 1, "the server's own overlap moved");
  });

  test("a partner's private facts are not on the screen, and were never sent", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.firstEdition, "primary");
    await stock(ctx.app, "north",
      { canonicalCardId: made.firstEdition, ask: 900, cost: 400, cert: "ZZ-CERT-C35" });
    const { r, state } = await shops(ctx);
    const said = texts(r);
    for (const secret of ["400", "ZZ-CERT-C35", "900"]) {
      assert(!said.includes(secret), `"${secret}" reached the Collector's screen: ` + said);
    }
    for (const row of state.inventory) {
      assert(!("cost" in row), "a Collector received a partner's acquisition cost");
    }
  });

  test("a copy that is no longer available stops being an answer", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.firstEdition, "primary");
    const invId = (await stock(ctx.app, "north",
      { canonicalCardId: made.firstEdition, ask: 900 })).json().value;
    const before = await shops(ctx);
    assert(texts(before.r).includes("Northline has a card"), texts(before.r));
    /* Archived at the source. Nothing on the Collector's side had to be told. */
    const stored = await load(ctx);
    stored.inventory = stored.inventory.map((i) => (i.invId === invId ? { ...i, archived: true } : i));
    await ctx.repository.saveWorld(stored);
    const after = await shops(ctx);
    eq(after.state.discoveries.length, 0, "an archived copy is still an overlap");
    assert(!/you're looking for/.test(texts(after.r)), texts(after.r));
  });
});

/* ============================================================== C
   It only reads. */
describe("C. it only reads", () => {

  test("there is nothing to press", async () => {
    const ctx = await world();
    await oneOverlap(ctx);
    const { r } = await shops(ctx);
    eq(buttons(r).length, 0, "a control appeared: " + buttons(r).map((b) => b.props.children).join("|"));
    const said = texts(r);
    for (const bad of [/\bAsk\b/, /Message/, /Make an offer/, /Start/, /Reserve/, /Hold/, /Buy/]) {
      assert(!bad.test(said), `${bad} appeared on a read-only screen: ` + said);
    }
  });

  test("the file names no command, and is handed none", () => {
    const section = code("client/collector/sections/TrustedPartners.jsx");
    for (const name of EXPOSED_COMMANDS) {
      assert(!new RegExp(`["']${name}["']`).test(section), `the section names ${name}`);
    }
    for (const name of ["startOpportunity", "setInterest", "sendMessage", "reachOut",
      "requestPhotos", "markBinderReviewed"]) {
      assert(!new RegExp(name).test(section), `the section names ${name}`);
    }
    /* The shell hands it exactly one prop, and that prop is a read. */
    const shell = code("client/collector/CollectorShell.jsx");
    const at = shell.indexOf('meta.id === "partners"');
    assert(at > 0, "the shell stopped naming the partners section");
    const given = shell.slice(at, at + 200);
    assert(/\{ onBrowseCards \}/.test(given), "the partners section was handed something else: " + given);
    for (const bad = /onSpecify|onCreateBinder|onAddGoal|onSetPriority|onRemoveGoal/; ;) {
      assert(!bad.test(given), "a command callback reached the partners section: " + given);
      break;
    }
  });

  test("looking at it writes nothing and creates nothing", async () => {
    const ctx = await world();
    await oneOverlap(ctx);
    const before = await load(ctx);
    await shops(ctx);
    const after = await load(ctx);
    eq(json(after), json(before), "reading the screen changed the world");
    eq((after.interests || []).length, 0, "an Interest appeared");
    eq((after.opportunities || []).length, 0, "an Opportunity appeared");
    eq((after.activity || []).length, 0, "activity appeared");
    eq((after.conversations || []).length, 0, "a conversation appeared");
  });

  test("no read position, dismissal or notification object exists anywhere", async () => {
    const ctx = await world();
    await oneOverlap(ctx);
    const after = await load(ctx);
    for (const key of Object.keys(after)) {
      assert(!/notification|dismiss|seen|unread|badge/i.test(key),
        `the world grew a "${key}" collection`);
    }
    const section = code("client/collector/sections/TrustedPartners.jsx");
    for (const bad of ["localStorage", "sessionStorage", "dismiss", "markSeen", "notification"]) {
      assert(!new RegExp(bad, "i").test(section), `the section reached for ${bad}`);
    }
    /* Discovery is still computed, not stored. */
    assert(!/discoveries/.test(code("persistence/world-repository.js")),
      "discoveries reached the repository");
    const migrations = fs.readdirSync(path.join(ROOT, "persistence", "migrations")).sort();
    assert(!migrations.some((m) => /discover/i.test(m)), "a discovery migration appeared");
  });

  test("the server's handle on a physical copy is never printed", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.firstEdition, "primary");
    const invId = (await stock(ctx.app, "north",
      { canonicalCardId: made.firstEdition, ask: 900 })).json().value;
    assert(typeof invId === "string" && invId, "the fixture has no id to leak");
    const { r, state } = await shops(ctx);
    assert(!texts(r).includes(invId), `invId ${invId} was printed: ` + texts(r));
    /* It is in the projection — the screen is what declines to show it. */
    assert(state.discoveries[0].invIds.includes(invId), "the fixture stopped proving anything");
    assert(!/invIds|\binvId\b/.test(code("client/collector/sections/TrustedPartners.jsx")),
      "the section reads the copy handle at all");
  });
});

/* ============================================================== D
   Which copy they want. */
describe("D. which copy they want", () => {

  test("a raw want says raw, and says the condition", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.firstEdition, "primary",
      { grade: "Raw", condition: "Near Mint" });
    const { r } = await network(ctx);
    assert(texts(r).includes("Looking for: Raw · Near Mint"), texts(r));
  });

  test("a graded want says the grade, and invents no condition beside it", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.firstEdition, "primary", { grade: "PSA 10" });
    const { r } = await network(ctx);
    const said = texts(r);
    assert(said.includes("Looking for: PSA 10"), said);
    assert(!/PSA 10 ·/.test(said), "a condition was invented beside a grade: " + said);
    for (const bad of ["Near Mint", "Mint", "Lightly Played", "Raw"]) {
      assert(!said.includes(bad), `"${bad}" appeared beside a graded want: ` + said);
    }
  });

  test("a goal that named no copy says nothing, rather than saying 'any'", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    /* Historical: C3.2 wrote criteria and C3.3 made them required, so a goal
       with none can only come from before. It still has to render. */
    const stored = await load(ctx);
    stored.goals = [{ id: "g-old", collectorId: "c1", canonicalCardId: made.firstEdition,
      tier: "secondary", since: "2029-01-01", note: "from before criteria existed" }];
    await ctx.repository.saveWorld(stored);
    const { r } = await network(ctx);
    const said = texts(r);
    assert(said.includes("Charizard"), "the goal stopped rendering: " + said);
    assert(!said.includes("Looking for:"), "criteria were invented: " + said);
    for (const bad of ["Any", "any condition", "unspecified", "null", "undefined"]) {
      assert(!said.includes(bad), `"${bad}" was invented: ` + said);
    }
  });

  test("the sentence reads the way the domain reads it, case by case", () => {
    /* THE POINT OF THIS TEST. A presenter that works out for itself what a
       grading pair means is a second authority — which is exactly what C3.3
       removed for copies by projecting `grading`, and what its pin in
       `phase5-c33-card-specification.cjs` still forbids in this very file.
       `desired` carries no projected reading, so `desiredLine` decides nothing
       and simply says back what was stated. This pins that against `gradingOf`,
       the domain's own function, for every pair the product can actually
       store. */
    const coherent = [
      { grade: "PSA 10" },
      { grade: "Raw", condition: "Near Mint" },
      /* A condition with no grade is sayable — the domain calls it unstated
         rather than raw, and C3.2 kept "Raw" and "nobody said" as different
         answers. Note what is NOT here: `{ grade: "Raw" }` alone, which the
         domain refuses as `raw-needs-condition`. A raw want always names a
         condition, so this list is every pair the product can store. */
      { condition: "Lightly Played" },
      {},
      null,
    ];
    for (const desired of coherent) {
      /* The domain agrees this pair is sayable, which is why the product could
         have stored it. */
      eq(D.gradingProblem(desired) || null, null, `${json(desired)} is not a storable pair`);
      const reading = D.gradingOf(desired);
      const line = TP_PRESENT.desiredLine(desired);
      if (!reading.label) {
        eq(line, null, `${json(desired)} produced a sentence from nothing`);
      } else {
        eq(line, `Looking for: ${reading.label}`,
          `${json(desired)} does not read the way the domain reads it`);
      }
    }
  });

  test("a contradictory historical pair shows both halves rather than picking one", () => {
    /* PSA 9 and Damaged cannot both be true, and C3.2 refuses the pair at the
       command — so this can only be a record written before that door closed.
       The domain's own doctrine for these is to REPORT the contradiction, not
       resolve it: `gradingRead` keeps the condition and names the problem, and
       `gradeConflictLine` says both halves to the partner pricing the copy.
       The criteria sentence follows the same rule, because a presenter that
       showed only "PSA 9" would be deciding which half somebody meant. */
    const contradictory = { grade: "PSA 9", condition: "Damaged" };
    eq(D.gradingProblem(contradictory), "graded-has-condition",
      "the domain stopped calling this a contradiction");
    const line = TP_PRESENT.desiredLine(contradictory);
    assert(line.includes("PSA 9"), line);
    assert(line.includes("Damaged"), "one half of the contradiction was dropped: " + line);

    /* The other refusable pair, for the same reason: a raw want with no
       condition is not storable, and if one exists it still says what it
       says rather than being completed on somebody's behalf. */
    eq(D.gradingProblem({ grade: "Raw" }), "raw-needs-condition");
    eq(TP_PRESENT.desiredLine({ grade: "Raw" }), "Looking for: Raw");
  });

  test("the partner is given no way to change it", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.firstEdition, "primary", { grade: "PSA 10" });
    const { r } = await network(ctx);
    /* The goal list carries no input, select or control of its own. */
    const list = r.root.findAll((n) => n.type === "li")
      .filter((n) => instText(n).includes("Looking for:"));
    assert(list.length, "the sentence is not in the goal list at all");
    for (const li of list) {
      eq(li.findAll((n) => n.type === "button").length, 0, "a control sits beside the criteria");
      eq(li.findAll((n) => n.type === "input").length, 0, "an input sits beside the criteria");
      eq(li.findAll((n) => n.type === "select").length, 0, "a picker sits beside the criteria");
    }
    /* And the command that COULD change it is a Collector's, checked at the
       server rather than by the absence of a button. */
    assert(EXPOSED_COMMANDS.includes("updateGoalCriteria"),
      "the criteria command stopped being reachable at all");
    const res = await post(ctx.app, "north", "updateGoalCriteria",
      { goalId: (await load(ctx)).goals[0].id, desired: { grade: "Raw", condition: "Poor" } });
    eq(res.json().error.refused, "not-owner", "a partner edited a Collector's criteria");
    eq((await load(ctx)).goals[0].desired.grade, "PSA 10", "the criteria moved");
  });
});

/* ============================================================== E
   Still two facts. */
describe("E. still two facts", () => {

  test("how hard and which copy are separate sentences, and both are shown", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.firstEdition, "primary", { grade: "PSA 10" });
    const { r } = await network(ctx);
    const said = texts(r);
    assert(said.includes("Primary goal"), "the tier tag went missing: " + said);
    assert(said.includes("is actively looking for this card."), said);
    assert(said.includes("Looking for: PSA 10"), said);
    /* Neither sentence contains the other's fact. */
    assert(!/actively looking for this card[^.]*PSA/.test(said), "the two were merged: " + said);
  });

  test("the same copy at two priorities reads differently, and the copy does not move", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.firstEdition, "primary", { grade: "PSA 10" });
    await want(ctx.app, "casey", made.mudkip, "secondary", { grade: "PSA 10" });
    const { r } = await network(ctx);
    const said = texts(r);
    assert(said.includes("is actively looking for this card."), said);
    assert(said.includes("secondary list."), said);
    eq((said.match(/Looking for: PSA 10/g) || []).length, 2,
      "the criteria followed the tier instead of the card: " + said);
  });

  test("the goal's own note is still its own line", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await post(ctx.app, "casey", "addGoal", { canonicalCardId: made.firstEdition,
      tier: "primary", desired: { grade: "PSA 10" }, note: "ZZ-NOTE-C35" });
    const { r } = await network(ctx);
    const said = texts(r);
    assert(said.includes("ZZ-NOTE-C35"), "the note went missing: " + said);
    assert(said.includes("Looking for: PSA 10"), said);
    /* SEPARATE ELEMENTS, not merely separate words. A flattened string would
       read the same whether these were one sentence or two, so the claim is
       made against the tree: the note and the criteria are their own spans,
       and neither contains the other. */
    const lines = r.root.findAll((n) => n.type === "span"
      && (n.props.className || "") === "tps-sub-n").map(instText);
    assert(lines.some((t) => t.trim() === "Looking for: PSA 10"),
      "the criteria are not a line of their own: " + json(lines));
    assert(lines.some((t) => t.trim() === "ZZ-NOTE-C35"),
      "the note is not a line of its own: " + json(lines));
    assert(!lines.some((t) => t.includes("PSA 10") && t.includes("ZZ-NOTE-C35")),
      "the note and the criteria share a line: " + json(lines));
  });

  test("criteria change nothing about which cards overlap", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    /* A Collector wanting a PSA 10 still discovers a raw copy, and the reverse.
       C3.2 said criteria are context for a person, never a rule for a machine;
       C3.5 renders them and does not promote them. */
    await want(ctx.app, "casey", made.firstEdition, "primary", { grade: "PSA 10" });
    await stock(ctx.app, "north",
      { canonicalCardId: made.firstEdition, grade: "Raw", condition: "Heavily Played", ask: 90 });
    const mine = await shops(ctx);
    eq(mine.state.discoveries.length, 1, "criteria filtered the overlap");
    assert(texts(mine.r).includes("Northline has a card you're looking for."), texts(mine.r));

    const goalId = (await load(ctx)).goals[0].id;
    const before = json((await view(ctx.app, "casey")).discoveries);
    await post(ctx.app, "casey", "updateGoalCriteria",
      { goalId, desired: { grade: "Raw", condition: "Near Mint" } });
    eq(json((await view(ctx.app, "casey")).discoveries), before,
      "changing the criteria changed the overlap");
  });
});

/* ============================================================== F
   The boundaries hold. */
describe("F. the boundaries hold", () => {

  test("the allow-list is still exactly sixteen, by value and by count", () => {
    eq(json([...EXPOSED_COMMANDS].sort()), json([
      "updatePartnerProfile", "revokeCollectorInvitation",
      "addGoal", "updateGoalTier", "removeGoal",
      "addInventoryCopy",
      "addCollectorCopy", "setCollectorCopyOffered", "removeCollectorCopy",
      "createBinder", "addBinderEntry", "removeBinderEntry",
      "updateCollectorCopy", "updateGoalCriteria",
      "renameBinder", "setBinderArchived",
      /* AND THE TWO C5 ADDED (Phase 5 C5). `updateInventoryCopy` and
         `removeInventoryCopy` were written and tested in Batch 6 and shipped
         without a screen; C5 gives them one, so a shop can correct a typo and
         take a sold copy off its shelf. They are listed here because this pin
         reads the LIVE allow-list — it is a statement about the product's
         surface today, not a fossil of the batch that wrote it. */
      "updateInventoryCopy", "removeInventoryCopy",
    ].sort()), "C3.5 changed the production surface");
    eq(EXPOSED_COMMANDS.length, 18);
    eq(C.COMMAND_NAMES.length, 49, "a command was added or removed");
  });

  test("C3.5 opened no door — the whole file is what it was", () => {
    /* Not the name set: the FILE. A batch that renders two things already on
       the wire has no business editing the door at all, so the strongest
       statement is byte equality — which also catches a comment quietly
       promising a future exposure.

       BOTH ENDS ARE NAMED SINCE C5. This compared the file on disk against
       C3.5's branch point, which was a true statement about C3.5 only while no
       later batch was allowed to open a door. C5 is a batch that is: it gives
       the two Batch 6 inventory commands a screen. So the comparison now runs
       from C3.5's branch point to C3.5's own merge. It says exactly what it
       always said, it is no longer hostage to somebody else's correct work,
       and it would still fail if C3.5 itself were rewritten. */
    const { execFileSync } = require("child_process");
    const at = (ref) => execFileSync("git", ["show", `${ref}:server/exposed-commands.js`],
      { cwd: ROOT, encoding: "utf8" });
    eq(at("aef60e4"), at("97fdba3"),
      "the production door moved in a batch that renders two things");
  });

  test("the deal lifecycle is still shut, and so is everything C3.5 might have wanted", async () => {
    const ctx = await world();
    for (const name of ["startOpportunity", "proposePrice", "acceptPrice", "acceptDeal",
      "setInterest", "sendMessage", "reachOut", "requestPhotos", "markBinderReviewed"]) {
      assert(!EXPOSED_COMMANDS.includes(name), `${name} is exposed`);
      eq((await post(ctx.app, "casey", name, {})).json().error.refused,
        "command-unavailable", name);
    }
  });

  test("no migration, and no new durable concept", async () => {
    const migrations = fs.readdirSync(path.join(ROOT, "persistence", "migrations")).sort();
    eq(migrations[migrations.length - 1], "0013_binders.sql", migrations.join(","));
    const ctx = await world();
    await oneOverlap(ctx);
    const stored = await load(ctx);
    eq(json(Object.keys(stored).sort()), json([
      "activity", "binderEntries", "binders", "catalog", "collectorCopies", "collectors",
      "conversations", "copyReviews", "interests", "inventory", "invitations", "goals",
      "opportunities", "partners", "photoRequests", "preferences", "relationships",
    ].sort()), "the canonical world grew or lost a collection");
  });

  test("the projection did not change: C3.5 renders what was already sent", () => {
    const { execFileSync } = require("child_process");
    const at = (rev) => execFileSync("git", ["show", `${rev}:domain/metyet-projection.js`],
      { cwd: ROOT, encoding: "utf8" });
    eq(at("aef60e4"), read("domain/metyet-projection.js"),
      "the projection changed in a batch that promised not to touch it");
    /* And the discovery derivation is untouched too. */
    eq(execFileSync("git", ["show", "aef60e4:domain/metyet-discovery.js"],
      { cwd: ROOT, encoding: "utf8" }), read("domain/metyet-discovery.js"),
    "the discovery rule changed");
  });

  test("a binder is still the Collector's alone", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const binder = (await post(ctx.app, "casey", "createBinder",
      { name: "ZZ-PRIVATE-C35" })).json().value;
    await post(ctx.app, "casey", "addBinderEntry",
      { binderId: binder, canonicalCardId: made.firstEdition });
    await want(ctx.app, "casey", made.firstEdition, "primary");
    await stock(ctx.app, "north", { canonicalCardId: made.firstEdition, ask: 900 });

    const partner = (await get(ctx.app, "north", "/api/view")).body;
    assert(!partner.includes("ZZ-PRIVATE-C35"), "a binder name reached a partner");
    const state = JSON.parse(partner).state;
    eq(json(state.binders), json([]), "a partner received binders");
    eq(json(state.binderEntries), json([]), "a partner received memberships");
    /* And the partner's own screen says nothing of it. */
    const { r } = await network(ctx);
    assert(!texts(r).includes("ZZ-PRIVATE-C35"), texts(r));
  });

  test("navigation is exactly what C3.4 left, on both seats", () => {
    eq(COLLECTOR_SHELL.SECTIONS.map((s) => s.id).join(","), "browse,binder,my-cards,partners");
    eq(COLLECTOR_SHELL.SECTIONS.map((s) => s.label).join(" · "),
      "Browse · Binder · Your Cards · Trusted Partners");
    eq(COLLECTOR_SHELL.DEFERRED_SECTIONS.map((s) => s.id).join(","), "goals",
      "the deferral list moved");
    /* Goals is still not a destination, and Goals.jsx is still not deleted —
       C3.5 restored the ANSWER, not the tab. */
    assert(!COLLECTOR_SHELL.SECTIONS.some((s) => s.id === "goals"), "the Goals tab came back");
    assert(fs.existsSync(path.join(ROOT, "client", "collector", "sections", "Goals.jsx")),
      "Goals.jsx was deleted");
    eq(TP_SHELL.SECTIONS.map((s) => s.id).join(","), "collectors,inventory,opportunities");
    eq((TP_SHELL.DEFERRED_SECTIONS || []).length, 0, "the TP shell grew a deferral list");
  });

  test("the answer is reachable from the production navigation, not from a deferred view", async () => {
    /* THE REGRESSION CLOSURE, stated as the thing that was actually wrong:
       before C3.5 the only reader of `discoveries` on this seat was a view with
       no route to it. Now the reader is a section the navigation lists. */
    const partners = COLLECTOR_SHELL.SECTIONS.find((s) => s.id === "partners");
    assert(partners && typeof partners.view === "function", "Trusted Partners has no view");
    const section = code("client/collector/sections/TrustedPartners.jsx");
    assert(/state\.discoveries/.test(section),
      "the production section does not read the server's own overlap");
    /* And the deferred view still reads it too — it was never the problem. */
    assert(/state\.discoveries/.test(code("client/collector/sections/Goals.jsx")),
      "the deferred view stopped reading it");
  });
});

run();
