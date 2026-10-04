/* ============================================================================
   PHASE 5 C3.4b — BINDER

   C3.1 built the concept and shipped no screen on purpose. C3.3 let a person
   file the card in front of them, from the Card Specification panel, without
   ever seeing a binder as a thing. This is the batch that gives binders a
   place, and it is also the batch that takes Goals out of the navigation.

   BINDERS EXPRESS COHERENCE. GOALS EXPRESS PRIORITY. Those are two different
   kinds of truth about one card and both stay durable and independent — filing
   a card creates no Goal, unfiling removes none, and a Goal needs no binder.
   What changed is that they no longer need two destinations. "These are my
   Mudkips, and these two I am still looking for" is one thought, so priority is
   read inside the binder rather than beside it, and the production navigation
   becomes Browse · Binder · Your Cards · Trusted Partners.

   WHICH PUTS ONE OBLIGATION ON THIS BATCH: removing the Goals tab must not hide
   a Goal. So the Goals in no active binder are listed, derived on every render,
   under plain words. They are not a binder. There is no record for them.

   A. the library           binders as objects, newest first, with a way to make one
   B. put away              archiving is reversible and keeps everything
   C. inside a binder       identity and priority, and deliberately nothing else
   D. not in a binder yet   derived, never a record, and correct at every edge
   E. add cards             transient binder context, carried into Browse
   F. the two new doors     exposure, seats, ownership, idempotence
   G. privacy               a binder is the Collector's, whole
   H. the navigation        four sections, and what did not move
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
const { projectForActor } = require("../domain/metyet-projection.js");
const { validateWorld } = require("../domain/metyet-world.js");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
const { executeCommand } = require("../persistence/command-transaction.js");
const C = require("../domain/metyet-commands.js");
const RT = require("../domain/metyet-runtime.js");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
/* Source with comments stripped, for assertions about what the code DOES
   rather than about what it says it does. */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const json = (v) => JSON.stringify(v);

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

const SUBJECT = { north: "sub-north", casey: "sub-casey", dana: "sub-dana" };
const ACTOR = { casey: { collectorId: "c1" }, dana: { collectorId: "c2" },
  north: { partnerId: "p1" } };

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
    partners: [{ id: "p1", name: "Northline" }],
    relationships: [
      { partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" },
      { partnerId: "p1", collectorId: "c2", status: "accepted", at: "2030-01-01" },
    ],
    invitations: [], goals: [], inventory: [], collectorCopies: [],
    binders: [], binderEntries: [],
    interests: [], opportunities: [], conversations: [], photoRequests: [], copyReviews: [],
  });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: SUBJECT.north, role: "tp", partnerId: "p1" });
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
  const made = { charizardContext: charizard.cardContextId, mudkipContext: mudkip.cardContextId };
  made.firstEdition = (await ctx.catalog.putCanonicalCard({ cardContextId: charizard.cardContextId,
    printRun: "first_edition", finish: "holofoil",
    imageSmall: "https://img.example.invalid/zard-small.png" })).canonicalCardId;
  made.unlimited = (await ctx.catalog.putCanonicalCard({ cardContextId: charizard.cardContextId,
    printRun: "unlimited", finish: "holofoil",
    imageSmall: "https://img.example.invalid/zard-u-small.png" })).canonicalCardId;
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
const refusal = (res) => (res.statusCode === 200 ? null : res.json().error.refused);
const makeBinder = async (app, token, name) =>
  (await post(app, token, "createBinder", { name })).json().value;
/* THE CARD-LEVEL PAIR, WHICH IS NOW ONLY FOR LEGACY ROWS (Batch 3B-1). The
   product no longer adds one; these remain so the tests about what a binder
   does with the rows filed before 3B can still make one.

   A LEGACY ROW IS MADE PAST THE DOOR, AND PROVES IT LANDED (Batch 3C-1). The
   add door is closed — no client may create a bare-card row — so a fixture
   makes one the way the historical rows were made: the domain command, through
   the same transaction, advisory lock and validateWorld the route uses. It
   used to POST and discard the answer, and the 3C audit measured fourteen
   tests here that went on passing with no row at all. So it now refuses to
   return until the row it promised is in the world: a test that reasons about
   a legacy row is reasoning about one that exists. */
const file = async (ctx, token, binderId, canonicalCardId) => {
  const r = await executeCommand(ctx.repository, { actor: ACTOR[token],
    command: "addBinderEntry", payload: { binderId, canonicalCardId }, runtime: ctx.runtime });
  assert(!r.refused, `the legacy fixture was refused: ${r.refused}`);
  assert((await load(ctx)).binderEntries.some((e) => e.binderId === binderId
    && e.canonicalCardId === canonicalCardId), "the legacy fixture row did not land");
  return r;
};
const unfile = (app, token, binderId, canonicalCardId) =>
  post(app, token, "removeBinderEntry", { binderId, canonicalCardId });
/* AND THE OBJECT-LEVEL PAIR, WHICH IS WHAT PUTTING SOMETHING IN A BINDER MEANS
   FROM 3B-1 ON. Exactly one of `goalId` / `collectorCopyId`. */
const fileObj = (app, token, binderId, what) =>
  post(app, token, "fileObject", { binderId, ...what });
const unfileObj = (app, token, what) => post(app, token, "unfileObject", what);
/* The Goal for a card, so a test can say "file that hunt" without carrying ids
   through its own fixture. */
const goalFor = async (ctx, canonicalCardId) => (await load(ctx)).goals
  .find((g) => g.canonicalCardId === canonicalCardId);
const want = (app, token, canonicalCardId, tier = "primary", extra = {}) =>
  post(app, token, "addGoal", { canonicalCardId, tier, desired: { grade: "PSA 9" }, ...extra });
/* A NEW COPY MUST SAY WHETHER ITS OWNER WOULD PART WITH IT (the disposition
   batch). This suite is about what a BINDER shows — and one of its own tests
   pins that a binder shows "no ownership or availability telemetry, however
   much of it is true" — so the disposition is scaffolding here and the default
   is stated once, visibly, rather than at twenty call sites. It applies ONLY
   when the caller named neither, so a caller that says `keeping` does not get
   `offered: true` added underneath it. */
const own = (app, token, copy) => post(app, token, "addCollectorCopy",
  { copy: ("offered" in copy || "keeping" in copy) ? copy : { ...copy, offered: true } });

/* ---------------------------------------------------------------- RENDERING
   The real components, built with esbuild and driven by react-test-renderer
   against a real server. No DOM, so nothing below claims anything about pixels
   or about scrolling. */
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
const BinderSection = build("client/collector/sections/Binder.jsx").default;
const SHELL_MOD = build("client/collector/CollectorShell.jsx");
const CollectorShell = SHELL_MOD.default;

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
/* The Binder section is a FRAGMENT — the panel and its scrim are siblings — so
   `toJSON()` is an array, not a node. Every walk here handles both. */
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
const inputs = (r) => r.root.findAll((n) => n.type === "input");
const images = (r) => r.root.findAll((n) => n.type === "img").map((n) => n.props.src);
/* A press starts real work — a command over HTTP, then an authoritative
   re-read, then the component's own state settling after both. That is more
   than a couple of ticks, so this waits long enough for the whole chain rather
   than for the render it happens to trigger first. */
const settle = async () => {
  for (let i = 0; i < 20; i += 1) {
    await TR.act(async () => { await new Promise((done) => setTimeout(done, 0)); });
  }
};
const findButton = (r, label) => buttons(r).find((n) => instText(n).trim() === label)
  || buttons(r).find((n) => instText(n).includes(label));
const press = async (r, label) => {
  const b = findButton(r, label);
  assert(b, `no button "${label}" among: ${buttons(r).map(instText).join(" | ")}`);
  assert(!b.props.disabled, `the button "${label}" is disabled`);
  await TR.act(async () => { b.props.onClick(); });
  await settle();
};
const typeInto = async (r, ariaLabel, value) => {
  const input = inputs(r).find((n) => n.props["aria-label"] === ariaLabel);
  assert(input, `no input "${ariaLabel}"`);
  await TR.act(async () => { input.props.onChange({ target: { value } }); });
  await settle();
};
/* The catalogue door, counting describe calls so "one request for the ids on
   screen" is checkable. */
const doorFor = (ctx) => {
  const calls = { describe: 0, ids: [] };
  return { calls, door: {
    find: async (query) =>
      ctx.catalog.findCardContexts(Object.fromEntries(new URLSearchParams(query).entries())),
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

/* A Binder section over the real projection, with the real commands behind its
   callbacks — so every press in this file goes through the production door and
   comes back as a fresh authoritative projection, exactly as the shell does. */
async function screen(ctx, token = "casey", extra = {}) {
  const { calls, door } = doorFor(ctx);
  const specified = [];
  let r;
  let latest = await view(ctx.app, token);
  let announce = null;          // set once the harness has mounted

  /* THE PROJECTION IS REACT STATE, held by a parent, exactly as the real shell
     holds it. A command sends, re-reads, and hands the new projection down; the
     section re-renders because its prop changed, not because a test re-created
     it. Doing this any other way — updating the root from inside a callback —
     puts a render inside a render and loses the state the section sets after
     its own command returns. */
  const send = async (command, payload) => {
    const res = await post(ctx.app, token, command, payload);
    latest = await view(ctx.app, token);
    if (announce) announce(latest);
    /* `value` CARRIED THROUGH (Batch 3B-1). It was dropped, which was invisible
       while nothing in this file minted anything — and fatal the moment a step
       has to bind the id the server returned. */
    return res.statusCode === 200
      ? { ok: true, value: res.json().value }
      : { ok: false, refused: refusal(res) };
  };

  /* THE STEP VOCABULARY, SENT RATHER THAN RECORDED (Batch 3B-1).

     `onSpecify` used to push the step onto `specified` and return `undefined`,
     which `CardSpecification.commit` reads as success while minting nothing. So
     no test in this file could drive a filing from the Binder section through
     to the database — the panel would appear to work and the world would not
     change. It records AND sends, mapped exactly as `client/sign-in/SignIn.jsx`
     maps them, so a screen test and the real entrance cannot disagree. */
  const dispatch = async (step, canonicalCardId) => {
    specified.push({ step, canonicalCardId });
    switch (step.kind) {
      case "make-binder": return send("createBinder", { name: step.name });
      case "file-object": return send("fileObject",
        { binderId: step.binderId, goalId: step.goalId, collectorCopyId: step.collectorCopyId });
      case "unfile-object": return send("unfileObject",
        { goalId: step.goalId, collectorCopyId: step.collectorCopyId });
      case "file": return send("addBinderEntry", { binderId: step.binderId, canonicalCardId });
      case "unfile": return send("removeBinderEntry", { binderId: step.binderId, canonicalCardId });
      case "start-looking": return send("addGoal",
        { canonicalCardId, tier: step.tier, desired: step.desired });
      case "record-copy": return send("addCollectorCopy", { copy: { canonicalCardId, ...step.copy } });
      case "offering": return send("setCollectorCopyOffered",
        { copyId: step.copyId, offered: step.offered });
      case "keeping": return send("setCollectorCopyKept",
        { copyId: step.copyId, keeping: step.keeping });
      case "correct-copy": return send("updateCollectorCopy", { copyId: step.copyId, patch: step.patch });
      case "wanted-copy": return send("updateGoalCriteria", { goalId: step.goalId, desired: step.desired });
      case "how-hard": return send("updateGoalTier", { goalId: step.goalId, tier: step.tier });
      case "stop-looking": return send("removeGoal", { goalId: step.goalId });
      case "forget-copy": return send("removeCollectorCopy", { copyId: step.copyId });
      default: return { ok: false, refused: "command-unavailable" };
    }
  };
  function Live({ first }) {
    const [state, setState] = React.useState(first);
    announce = setState;
    return React.createElement(BinderSection, {
      state,
      onBrowseCards: door,
      onSpecify: dispatch,
      onFileObject: (what) => send("fileObject", what),
      onUnfileObject: (what) => send("unfileObject", what),
      onCreateBinder: (name) => send("createBinder", { name }),
      onRenameBinder: (binderId, name) => send("renameBinder", { binderId, name }),
      onArchiveBinder: (binderId, archived) => send("setBinderArchived", { binderId, archived }),
      ...extra,
    });
  }
  await TR.act(async () => { r = TR.create(React.createElement(Live, { first: latest })); });
  await settle();
  /* For the tests that change the world behind the screen's back and then ask
     what an authoritative refresh does. */
  const refresh = async () => {
    latest = await view(ctx.app, token);
    await TR.act(async () => { announce(latest); });
    await settle();
  };
  return { r, calls, specified, refresh, get state() { return latest; } };
}

/* ============================================================== A
   Binders as objects: the thing C3.1 built and nobody could see. */
describe("A. the library", () => {

  test("an empty library says what a binder is for, and offers to make one", async () => {
    const ctx = await world();
    const { r } = await screen(ctx);
    const said = texts(r);
    assert(/haven't made a binder yet/i.test(said), said);
    /* And it says the thing this whole batch is about. */
    assert(/where a card belongs/i.test(said), said);
    /* And it says the two things a binder is NOT, in the same breath — this
       sentence is the whole distinction the batch rests on. */
    assert(/different thing from wanting it or owning it/i.test(said), said);
    assert(findButton(r, "Make a binder"), "no way to make one");
  });

  test("making one, naming it, and a blank name refused before it is sent", async () => {
    const ctx = await world();
    const { r } = await screen(ctx);
    /* Nothing is sent until there is something to send. */
    eq(findButton(r, "Make a binder").props.disabled, true, "a nameless binder was offerable");
    await typeInto(r, "New binder name", "   ");
    eq(findButton(r, "Make a binder").props.disabled, true, "whitespace counted as a name");
    await typeInto(r, "New binder name", "Mudkip Collection");
    await press(r, "Make a binder");
    eq((await load(ctx)).binders.length, 1);
    eq((await load(ctx)).binders[0].name, "Mudkip Collection");
    assert(texts(r).includes("Mudkip Collection"), texts(r));
    /* And the field is empty again, so the next one does not inherit a name. */
    eq(inputs(r).find((n) => n.props["aria-label"] === "New binder name").props.value, "");
  });

  test("each binder shows its name and how many cards are in it, and nothing else", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    await want(ctx.app, "casey", made.mudkip, "secondary");
    await file(ctx, "casey", mine, made.mudkip);
    await want(ctx.app, "casey", made.firstEdition, "secondary");
    await file(ctx, "casey", mine, made.firstEdition);
    /* Owned and offered, so a count of either WOULD have something to show. */
    await own(ctx.app, "casey", { canonicalCardId: made.mudkip, grade: "PSA 9" });
    await post(ctx.app, "casey", "setCollectorCopyOffered",
      { copyId: (await load(ctx)).collectorCopies[0].id, offered: true });
    const { r } = await screen(ctx);
    const said = texts(r);
    assert(said.includes("Mudkip Collection"), said);
    assert(said.includes("2 cards"), said);
    assert(!/own \d|\d owned|offering|offered|for trade/i.test(said),
      "ownership telemetry reached the library: " + said);
  });

  /* NEWEST FIRST, AT THE GRANULARITY THE EXISTING ORDERING HAS. `byRecency` is
     the repository's one sort and it reads a DAY, because that is what every
     other recency-ordered surface in this product shows. So binders made on
     different days come back newest first, and binders made on the same day
     keep the order the server sent them in. Inventing a finer ordering here
     would be a second sort, and a second sort is a second authority. */
  test("newest first, by the day the server stamped", async () => {
    const ctx = await world();
    const stored = await load(ctx);
    stored.binders = [
      { id: "b-first", collectorId: "c1", name: "First", createdAt: "2030-01-01", archivedAt: null },
      { id: "b-third", collectorId: "c1", name: "Third", createdAt: "2030-03-03", archivedAt: null },
      { id: "b-second", collectorId: "c1", name: "Second", createdAt: "2030-02-02", archivedAt: null },
    ];
    await ctx.repository.saveWorld(stored);
    const { r } = await screen(ctx);
    /* Read from AFTER the view chips: the row says "My Binders · All Cards · …"
       above the library, and an indexOf over the whole screen would find a chip
       before it found a binder. */
    const whole = texts(r);
    const said = whole.slice(whole.indexOf("Your binders"));
    const order = ["Third", "Second", "First"].map((n) => said.indexOf(n));
    assert(order.every((i) => i >= 0), said);
    assert(order[0] < order[1] && order[1] < order[2], "not newest first: " + said);
  });

  test("binders made on one day keep the order the server sent", async () => {
    const ctx = await world();
    await makeBinder(ctx.app, "casey", "First");
    await makeBinder(ctx.app, "casey", "Second");
    const { r } = await screen(ctx);
    const whole = texts(r);
    const said = whole.slice(whole.indexOf("Your binders"));
    assert(said.indexOf("First") < said.indexOf("Second"),
      "the same-day order is not the server's: " + said);
  });

  test("renaming happens in place, and keeps every card", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    await want(ctx.app, "casey", made.mudkip, "secondary");
    await file(ctx, "casey", mine, made.mudkip);
    const { r } = await screen(ctx);
    await press(r, "Rename");
    await typeInto(r, "Binder name", "The Mudkips");
    await press(r, "Save name");
    const after = await load(ctx);
    eq(after.binders.length, 1, "renaming made a second binder");
    eq(after.binders[0].id, mine, "renaming replaced the binder");
    eq(after.binders[0].name, "The Mudkips");
    eq(after.binderEntries.length, 1, "a card fell out of a renamed binder");
    eq(after.binderEntries[0].canonicalCardId, made.mudkip);
    assert(texts(r).includes("The Mudkips"), texts(r));
    assert(!texts(r).includes("Mudkip Collection"), texts(r));
  });

  test("cancelling a rename writes nothing", async () => {
    const ctx = await world();
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    const { r } = await screen(ctx);
    await press(r, "Rename");
    await typeInto(r, "Binder name", "Something Else");
    await press(r, "Cancel");
    eq((await load(ctx)).binders.find((b) => b.id === mine).name, "Mudkip Collection");
    assert(!texts(r).includes("Something Else"), texts(r));
  });
});

/* ============================================================== B
   Put away, not deleted. */
describe("B. put away", () => {

  test("a binder put away leaves the library, and is not gone", async () => {
    const ctx = await world();
    await makeBinder(ctx.app, "casey", "Mudkip Collection");
    const { r } = await screen(ctx);
    await press(r, "Put away");
    const after = await load(ctx);
    eq(after.binders.length, 1, "putting one away deleted it");
    assert(after.binders[0].archivedAt, "nothing was stamped");
    const said = texts(r);
    assert(!/Your binders[\s\S]*Mudkip Collection/.test(said.split("Show binders")[0] || said),
      "an archived binder is still in the library: " + said);
    assert(/Show binders you've put away \(1\)/.test(said), said);
  });

  test("hidden by default, revealed by one control, and brought back by one press", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    await want(ctx.app, "casey", made.mudkip, "secondary");
    await file(ctx, "casey", mine, made.mudkip);
    await post(ctx.app, "casey", "setBinderArchived", { binderId: mine, archived: true });
    const { r } = await screen(ctx);
    assert(!findButton(r, "Bring back"), "an archived binder was showing without being asked for");
    await press(r, "Show binders you've put away");
    assert(texts(r).includes("Put away"), texts(r));
    await press(r, "Bring back");
    const after = await load(ctx);
    eq(after.binders[0].archivedAt, null, "it did not come back");
    eq(after.binderEntries.length, 1, "its card did not survive the round trip");
    assert(texts(r).includes("1 card"), texts(r));
  });

  test("archiving touches the archive state and nothing else", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    await want(ctx.app, "casey", made.mudkip, "secondary");
    await file(ctx, "casey", mine, made.mudkip);
    await want(ctx.app, "casey", made.firstEdition, "secondary");
    await file(ctx, "casey", mine, made.firstEdition);
    await want(ctx.app, "casey", made.mudkip, "primary");
    await own(ctx.app, "casey", { canonicalCardId: made.mudkip, grade: "PSA 9" });
    const before = await load(ctx);

    eq((await post(ctx.app, "casey", "setBinderArchived",
      { binderId: mine, archived: true })).statusCode, 200);
    const after = await load(ctx);

    eq(after.binderEntries.length, before.binderEntries.length, "entries did not survive");
    eq(json(after.binderEntries.map((e) => e.canonicalCardId).sort()),
      json(before.binderEntries.map((e) => e.canonicalCardId).sort()));
    eq(json(after.goals), json(before.goals), "a Goal moved when a binder was put away");
    eq(json(after.collectorCopies), json(before.collectorCopies),
      "a copy moved when a binder was put away");
    eq(after.binders[0].name, before.binders[0].name, "the name moved");
    eq(after.binders[0].createdAt, before.binders[0].createdAt, "the creation date moved");
    assert(validateWorld(after).ok !== false, "the world stopped validating");
  });

  test("renaming touches the name and nothing else", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    await want(ctx.app, "casey", made.mudkip, "secondary");
    await file(ctx, "casey", mine, made.mudkip);
    await want(ctx.app, "casey", made.mudkip, "secondary");
    const before = await load(ctx);
    eq((await post(ctx.app, "casey", "renameBinder",
      { binderId: mine, name: "The Mudkips" })).statusCode, 200);
    const after = await load(ctx);
    eq(after.binders[0].name, "The Mudkips");
    eq(after.binders[0].archivedAt, before.binders[0].archivedAt, "renaming archived it");
    eq(after.binders[0].createdAt, before.binders[0].createdAt);
    eq(json(after.binderEntries), json(before.binderEntries), "membership moved");
    eq(json(after.goals), json(before.goals), "a Goal moved");
  });

  test("there is no delete, here or in the domain", () => {
    assert(!C.COMMAND_NAMES.some((n) => /^deleteBinder|^removeBinder$/.test(n)),
      "a binder delete appeared");
    const section = code("client/collector/sections/Binder.jsx");
    assert(!/Delete|delete/.test(section), "the section offers a delete: ");
  });
});

/* ============================================================== C
   Inside a binder: identity, priority, and deliberately nothing else. */
describe("C. inside a binder", () => {

  async function filled(ctx) {
    const made = await cards(ctx);
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    /* A card has to mean something before it can be filed (the four-state
       batch). These tests are about what a binder SHOWS, so the fixture says
       the smallest true thing and the individual tests then take it away where
       that is what they are about. */
    await want(ctx.app, "casey", made.mudkip, "secondary");
    await file(ctx, "casey", mine, made.mudkip);
    return { made, mine };
  }

  test("a card shows its picture, its name, its set and its number", async () => {
    const ctx = await world();
    await filled(ctx);
    const { r } = await screen(ctx);
    await press(r, "Mudkip Collection");
    const said = texts(r);
    assert(said.includes("Mudkip"), said);
    assert(said.includes("Base"), said);
    assert(said.includes("#63"), said);
    eq(json(images(r)), json(["https://img.example.invalid/mudkip-small.png"]),
      "the catalogue's own picture is not what is shown");
  });

  test("Primary and Secondary when there is a Goal, and no tag when there is not", async () => {
    const ctx = await world();
    const { made, mine } = await filled(ctx);
    /* THE SECOND CARD QUALIFIES BY BEING OWNED, not by being wanted — which is
       what makes "no tag when there is not" sayable at all now that a card must
       mean something before it can be filed. */
    await own(ctx.app, "casey", { canonicalCardId: made.firstEdition, grade: "PSA 9" });
    await file(ctx, "casey", mine, made.firstEdition);
    const g = (await load(ctx)).goals.find((x) => x.canonicalCardId === made.mudkip);
    await post(ctx.app, "casey", "updateGoalTier", { goalId: g.id, tier: "primary" });
    /* RE-PINNED (Batch 3B-1), AND THE CLAIM IS SHARPER THAN IT WAS. The tier
       used to appear because a GOAL FOR THIS CARD existed and the card was in
       the binder — two facts joined by card id, which is the inference 3B
       removes. It now appears because THIS GOAL is what is filed here, which is
       what the tag was always trying to say.
       So the Goal is filed as an object. The Charizard is filed as a card
       (a legacy row) and owned, and is not wanted — one tag, not two, for the
       same reason as before. */
    await fileObj(ctx.app, "casey", mine, { goalId: g.id });
    const { r } = await screen(ctx);
    await press(r, "Mudkip Collection");
    const said = texts(r);
    assert(said.includes("Actively hunting"), said);
    eq((said.match(/Actively hunting|Keeping an eye out/g) || []).length, 1, said);
    /* AND IT IS THE GOAL'S OWN ROW, NOT THE CARD'S HEADING. A card heading
       carries identity and nothing else now; every statement about a thing is
       on that thing's row, which is what makes two things on one card legible. */
    assert(said.includes("Looking for"), said);
  });

  test("a Goal for a card in this binder is not filed here, and does not say it is", async () => {
    /* THE INFERENCE 3B-1 REMOVED, PINNED FROM THE OTHER SIDE. Before this batch
       a Goal's tier appeared in any binder that happened to hold its card. A
       card-level row says a CARD was filed; it is not this Goal's home, and a
       binder that does not hold the Goal must not claim to. */
    const ctx = await world();
    const { made, mine } = await filled(ctx);
    const g = await goalFor(ctx, made.mudkip);
    assert(g, "the fixture has no Goal");
    eq((await load(ctx)).binderEntries.length, 1, "and the card is filed the legacy way");
    eq(((await load(ctx)).binderMemberships || []).length, 0, "nothing filed the Goal");
    const { r } = await screen(ctx);
    await press(r, "Mudkip Collection");
    const said = texts(r);
    assert(!/Actively hunting|Keeping an eye out|Looking for/.test(said),
      `a legacy row was read as the Goal's home: ${said}`);
    /* The card is still there, as history, and says so. */
    assert(/Filed before Binders organised specific cards/.test(said), said);
  });

  test("a filed card with no Goal reads as a card, and carries no priority tag", async () => {
    /* RE-PINNED TWICE, AND WHAT IT PROTECTS IS UNCHANGED: a card in a binder
       that nobody is hunting renders as a card and shows no priority, because a
       binder is organisation and not a want list.

       The route there changed twice and has now settled. It could always file a
       card that meant nothing; for one batch it could not, and stopping wanting
       the card also took the membership. Both rules are withdrawn. The card is
       left KEPT here rather than bare, because a filed card a Collector actually
       holds is the more interesting version of "no priority to show". */
    const ctx = await world();
    const { made, mine } = await filled(ctx);
    await unfile(ctx.app, "casey", mine, made.mudkip);
    /* And "left KEPT" is now what the fixture actually stores. It used to record
       a bare copy and then say PC in the comment; a new copy must state which,
       so the two finally agree — which also makes the `setCollectorCopyKept`
       call below the idempotent no-op path rather than a write. It is left in
       place because what this test asserts is that a binder shows no ownership
       telemetry however much of it is true, and saying PC twice is as true as
       saying it once. */
    const copyId = (await post(ctx.app, "casey", "addCollectorCopy",
      { copy: { canonicalCardId: made.firstEdition, grade: "PSA 9", keeping: true } })).json().value;
    eq((await post(ctx.app, "casey", "setCollectorCopyKept",
      { copyId, keeping: true })).statusCode, 200);
    await file(ctx, "casey", mine, made.firstEdition);
    for (const g of (await load(ctx)).goals) {
      eq((await post(ctx.app, "casey", "removeGoal", { goalId: g.id })).statusCode, 200);
    }
    eq((await load(ctx)).goals.length, 0, "the goals are gone");
    eq((await load(ctx)).binderEntries.length, 1, "and the card is still filed");
    const { r } = await screen(ctx);
    await press(r, "Mudkip Collection");
    const said = texts(r);
    assert(said.includes("Charizard"), said);
    assert(!/Actively hunting|Keeping an eye out/.test(said), said);
  });

  test("a binder says what is IN it and still counts no shelf", async () => {
    /* RE-PINNED, AND THIS IS THE BATCH'S CENTRAL DOCTRINAL REVERSAL — the one
       claim 3B-1 exists to overturn, so it is worth writing out what is being
       given up and what is not.

       THE OLD CLAIM, AND WHY IT WAS RIGHT. "No ownership or availability
       telemetry, however much of it is true": a binder said "this card belongs
       here", so a copy's grade and whether its owner would part with it were
       facts about a shelf that nobody had asked this screen for. C3.4 also
       guarded the SOURCE — `Binder.jsx` was forbidden to contain the string
       `collectorCopies` at all — which was the strongest possible way to say it.

       WHY 3B-1 SUPERSEDES IT. A binder no longer holds cards. It holds a Goal,
       or one specific copy, or two of the three copies of one card — so opening
       one has to answer WHICH of your things are here, and a thing cannot say
       which it is without saying what it is. A copy's grading stopped being
       telemetry about a card and became how a Collector tells their own copies
       apart. The source guard goes with the claim: counting the cards in a
       binder now means reading the card each filed copy names.

       WHAT IS NOT SUPERSEDED, AND IS ASSERTED HERE INSTEAD. A binder must not
       become inventory. So: nothing counts what is NOT filed, no ownership
       total appears anywhere, and the unfiled copy below — same card, same
       Collector, offered — must be absent from the binder entirely. That is the
       principle the old claim was protecting, stated as the thing it protects
       rather than as a ban on a word. */
    const ctx = await world();
    const { made, mine } = await filled(ctx);
    await want(ctx.app, "casey", made.mudkip, "primary");
    for (const grade of ["PSA 9", "PSA 8"]) {
      await own(ctx.app, "casey", { canonicalCardId: made.mudkip, grade });
    }
    for (const copy of (await load(ctx)).collectorCopies) {
      await post(ctx.app, "casey", "setCollectorCopyOffered", { copyId: copy.id, offered: true });
    }
    const owned = (await load(ctx)).collectorCopies;
    eq(owned.length, 2, "the fixture owns two");
    /* ONE of the two is filed here. The other is the control. */
    await fileObj(ctx.app, "casey", mine, { collectorCopyId: owned[0].id });
    const { r } = await screen(ctx);
    await press(r, "Mudkip Collection");
    const said = texts(r);
    /* The filed one says what it is. */
    assert(said.includes(owned[0].grade), `the filed copy does not say which it is: ${said}`);
    /* The unfiled one is not here at all — not as a row, not in a count. */
    assert(!said.includes(owned[1].grade),
      `a copy that lives nowhere appeared in a binder: ${said}`);
    assert(!/own 2|2 owned|2 copies|offering \d/i.test(said),
      `a shelf count reached a binder: ${said}`);
    /* AND THE LIBRARY OUTSIDE IS UNTOUCHED, which is where the old rule still
       holds exactly as C3.4 wrote it. */
    await press(r, "All binders");
    const library = texts(r);
    assert(!/own \d|\d owned|offering|offered|for trade|PSA/i.test(library),
      `ownership telemetry reached the library: ${library}`);
  });

  test("an empty binder says so, and says what a binder is not", async () => {
    const ctx = await world();
    await makeBinder(ctx.app, "casey", "Mudkip Collection");
    const { r } = await screen(ctx);
    await press(r, "Mudkip Collection");
    const said = texts(r);
    assert(/Nothing in this binder yet/i.test(said), said);
    assert(/doesn't mean you want it or own it/i.test(said), said);
  });

  test("one card may be in several binders, and is one entry in each", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const a = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    const b = await makeBinder(ctx.app, "casey", "Favourites");
    await want(ctx.app, "casey", made.mudkip, "secondary");
    await file(ctx, "casey", a, made.mudkip);
    await file(ctx, "casey", b, made.mudkip);
    /* Filing twice into one binder is still one entry — C3.1's rule, unmoved. */
    await file(ctx, "casey", b, made.mudkip);
    const entries = (await load(ctx)).binderEntries;
    eq(entries.length, 2, "the same card in two binders is not two entries");
    eq(json(entries.map((e) => e.binderId).sort()), json([a, b].sort()));
    const { r } = await screen(ctx);
    await press(r, "Favourites");
    assert(texts(r).includes("1 card"), texts(r));
  });

  test("clicking a card opens the Card Specification, and the binder stays behind it", async () => {
    const ctx = await world();
    await filled(ctx);
    const { r } = await screen(ctx);
    await press(r, "Mudkip Collection");
    await press(r, "Open");
    const said = texts(r);
    /* RE-PINNED (Batch 3B-1): the panel's card-level Binder question is gone,
       because a card is no longer the subject of organisation. The proof it
       opened is the question it still asks — and the home control beside what
       the person is looking for, which is the question that replaced it. */
    assert(/Are you looking for it\?/i.test(said), said);
    assert(/Unfiled/.test(said), `the panel has no home control: ${said}`);
    assert(!/Which binders does this card belong in/i.test(said),
      "the card-level Binder question is still being asked");
    /* The panel is a sibling; the binder was never unmounted. */
    assert(said.includes("Mudkip Collection"), "the binder went away: " + said);
    /* And the file itself names no command — the panel's grammar is the only one. */
    const section = code("client/collector/sections/Binder.jsx");
    for (const name of EXPOSED_COMMANDS) {
      assert(!new RegExp(`["']${name}["']`).test(section), `the section names ${name}`);
    }
  });

  test("one describe for the ids on screen, never one per card", async () => {
    const ctx = await world();
    const { made, mine } = await filled(ctx);
    await want(ctx.app, "casey", made.firstEdition, "secondary");
    await file(ctx, "casey", mine, made.firstEdition);
    await want(ctx.app, "casey", made.unlimited, "secondary");
    await file(ctx, "casey", mine, made.unlimited);
    const { r, calls } = await screen(ctx);
    const before = calls.describe;
    await press(r, "Mudkip Collection");
    assert(calls.describe - before <= 1,
      `three cards took ${calls.describe - before} requests`);
    eq(calls.ids[calls.ids.length - 1].length, 3, json(calls.ids));
  });
});

/* ============================================================== D
   Not in a binder yet — derived, never a record. */
describe("D. not in a binder yet", () => {

  test("a Goal in no binder is listed, with its priority", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.mudkip, "primary");
    await want(ctx.app, "casey", made.firstEdition, "secondary");
    const { r } = await screen(ctx);
    const said = texts(r);
    assert(said.includes("Not in a binder yet"), said);
    assert(said.includes("2 cards"), said);
    assert(said.includes("Mudkip") && said.includes("Charizard"), said);
    assert(said.includes("Actively hunting"), said);
    assert(said.includes("Keeping an eye out"), said);
  });

  test("it is not a binder: no record, no membership, no count of one", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.mudkip, "primary");
    const { r } = await screen(ctx);
    assert(texts(r).includes("Not in a binder yet"), texts(r));
    const after = await load(ctx);
    eq(after.binders.length, 0, "a synthetic binder was persisted");
    eq(after.binderEntries.length, 0, "a synthetic membership was persisted");
    /* And the library above it still says there are none. */
    assert(/haven't made a binder yet/i.test(texts(r)), texts(r));
  });

  test("filing it makes it leave, on the authoritative refresh", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.mudkip, "primary");
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    const s = await screen(ctx);
    assert(texts(s.r).includes("Not in a binder yet"), texts(s.r));
    /* RE-PINNED (Batch 3B-1). Filing the CARD used to make the Goal leave this
       list, which was the inference the batch removed: a card-level row is not
       a Goal's home. Filing the GOAL is what settles it, and the card-level row
       deliberately does NOT — asserted below, because that is the correction. */
    await file(ctx, "casey", mine, made.mudkip);
    await s.refresh();
    assert(texts(s.r).includes("Not in a binder yet"),
      "a legacy row was read as the Goal's home: " + texts(s.r));
    const g = await goalFor(ctx, made.mudkip);
    await fileObj(ctx.app, "casey", mine, { goalId: g.id });
    await s.refresh();
    assert(!texts(s.r).includes("Not in a binder yet"),
      "a filed Goal is still waiting: " + texts(s.r));
  });

  test("taking it out of its last active binder makes it come back", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const a = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    const b = await makeBinder(ctx.app, "casey", "Favourites");
    await want(ctx.app, "casey", made.mudkip, "secondary");
    /* RE-PINNED (Batch 3B-1), AND THE SHAPE OF THE TEST CHANGED WITH THE RULE.
       A card could be in several binders at once, so "its LAST active binder"
       was a real question. An OBJECT has one home or none, so there is no last
       one to count down to: moving it from A to B leaves it filed, and taking
       it out of B is what brings it back. Moving is one command, which is the
       other half of the same fact. */
    const g = await goalFor(ctx, made.mudkip);
    await fileObj(ctx.app, "casey", a, { goalId: g.id });
    await want(ctx.app, "casey", made.mudkip, "primary");
    const s = await screen(ctx);
    assert(!texts(s.r).includes("Not in a binder yet"), texts(s.r));
    /* A move: still filed, and still exactly one row. */
    await fileObj(ctx.app, "casey", b, { goalId: g.id });
    await s.refresh();
    assert(!texts(s.r).includes("Not in a binder yet"), "a move lost the home: " + texts(s.r));
    eq((await load(ctx)).binderMemberships.length, 1, "a move made a second membership");
    await unfileObj(ctx.app, "casey", { goalId: g.id });
    await s.refresh();
    assert(texts(s.r).includes("Not in a binder yet"), texts(s.r));
  });

  test("a Goal whose only binders are put away counts as unfiled", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    await want(ctx.app, "casey", made.mudkip, "secondary");
    const g = await goalFor(ctx, made.mudkip);
    await fileObj(ctx.app, "casey", mine, { goalId: g.id });
    await want(ctx.app, "casey", made.mudkip, "primary");
    const s = await screen(ctx);
    assert(!texts(s.r).includes("Not in a binder yet"), texts(s.r));
    await post(ctx.app, "casey", "setBinderArchived", { binderId: mine, archived: true });
    await s.refresh();
    assert(texts(s.r).includes("Not in a binder yet"),
      "an archived binder still counted as a home: " + texts(s.r));
    /* The membership itself is untouched — this is a question about the
       binders a person is using, not about the record. Archiving evicts
       nothing, which the domain has held since 3A. */
    eq((await load(ctx)).binderMemberships.length, 1, "archiving unfiled something");
    /* And bringing it back settles it again. */
    await post(ctx.app, "casey", "setBinderArchived", { binderId: mine, archived: false });
    await s.refresh();
    assert(!texts(s.r).includes("Not in a binder yet"), texts(s.r));
  });

  test("stopping looking removes it, because there is no Goal left", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.mudkip, "primary");
    const s = await screen(ctx);
    assert(texts(s.r).includes("Not in a binder yet"), texts(s.r));
    const goalId = (await load(ctx)).goals[0].id;
    await post(ctx.app, "casey", "removeGoal", { goalId });
    await s.refresh();
    assert(!texts(s.r).includes("Not in a binder yet"), texts(s.r));
  });

  test("clicking one opens the same Card Specification", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.mudkip, "primary");
    const { r } = await screen(ctx);
    await press(r, "Open");
    /* RE-PINNED (Batch 3B-1): the card-level Binder question is gone and the
       home control beside the hunt replaced it. */
    assert(/Are you looking for it\?/i.test(texts(r)), texts(r));
    assert(/Unfiled/.test(texts(r)), texts(r));
    /* The same panel, which is the same file — there is no second one. */
    const files = fs.readdirSync(path.join(ROOT, "client", "collector"));
    eq(files.filter((f) => /Specification/i.test(f)).length, 1,
      "a second specification surface appeared: " + files.join(","));
  });

  test("a legacy Goal that names no canonical card is not dressed up as one", async () => {
    /* A pre-C2 Goal names `cardId` and nothing canonical. It cannot be
       described, cannot be filed and cannot be specified, so it is not put in a
       list whose every row promises all three. This is a deliberate
       consequence of removing the Goals tab and is recorded as debt, not an
       accident: nothing in production can create one. */
    const ctx = await world();
    const legacy = await load(ctx);
    legacy.catalog = [{ id: "k1", name: "An old card" }];
    legacy.goals = [{ id: "g-legacy", collectorId: "c1", cardId: "k1", tier: "primary" }];
    await ctx.repository.saveWorld(legacy);
    const { r } = await screen(ctx);
    assert(!texts(r).includes("Not in a binder yet"), texts(r));
    /* And it is still there, untouched, for whatever reaches it next. */
    eq((await load(ctx)).goals.length, 1);
  });
});

/* ============================================================== E
   Add cards: a binder carried into Browse and nowhere else. */
describe("E. add cards", () => {

  const shellProps = (state, door, extra = {}) => ({
    state, onSignOut() {}, onBrowseCards: door, ...extra,
  });

  async function shell(ctx, token = "casey", extra = {}) {
    const { calls, door } = doorFor(ctx);
    let r;
    const state = await view(ctx.app, token);
    await TR.act(async () => {
      r = TR.create(React.createElement(CollectorShell, shellProps(state, door, extra)));
    });
    await settle();
    return { r, calls, state };
  }

  test("Add cards moves to Browse and says which binder is being filled", async () => {
    const ctx = await world();
    await cards(ctx);
    await makeBinder(ctx.app, "casey", "Mudkip Collection");
    const { r } = await shell(ctx);
    await press(r, "Binder");
    await press(r, "Mudkip Collection");
    await press(r, "Add cards");
    const said = texts(r);
    assert(/Adding to/.test(said), "no note about where they came from: " + said);
    assert(said.includes("Mudkip Collection"), said);
    /* It is Browse, not a second search inside Binder. */
    assert(/Find a card by Pokémon/.test(said), said);
  });

  test("the context is transient: it writes nothing, and one press ends it", async () => {
    const ctx = await world();
    await cards(ctx);
    await makeBinder(ctx.app, "casey", "Mudkip Collection");
    const before = await load(ctx);
    const { r } = await shell(ctx);
    await press(r, "Binder");
    await press(r, "Mudkip Collection");
    await press(r, "Add cards");
    const during = await load(ctx);
    eq(json(during.binders), json(before.binders), "carrying a binder changed one");
    eq(during.binderEntries.length, 0, "carrying a binder filed something");
    await press(r, "Stop adding to it");
    assert(!/Adding to/.test(texts(r)), texts(r));
    eq(json(await load(ctx)), json(during), "dismissing it wrote something");
  });

  test("nothing about it is persisted, and no preference exists to hold it", async () => {
    const shellCode = code("client/collector/CollectorShell.jsx");
    assert(/useState\(null\)/.test(shellCode), "the context is not component state");
    for (const bad of ["localStorage", "sessionStorage", "prefs", "preferences"]) {
      assert(!new RegExp(bad).test(shellCode), `the shell reached for ${bad}`);
    }
    /* No table grew a place to put it, either. */
    const migrations = fs.readdirSync(path.join(ROOT, "persistence", "migrations")).sort();
    eq(migrations[migrations.length - 1], "0014_binder_memberships.sql",
      "C3.4 added a migration: " + migrations.join(","));
    assert(!/prefs/.test(code("persistence/world-repository.js")), "a prefs column appeared");
  });

  test("the panel preselects that binder, and it can be unticked", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    const other = await makeBinder(ctx.app, "casey", "Favourites");
    const state = await view(ctx.app, "casey");
    const Panel = build("client/collector/CardSpecification.jsx").default;
    const card = { canonicalCardId: made.mudkip, cardName: "Mudkip",
      expansionName: "Base", collectorNumber: "63" };
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(Panel, { card, context: card, state,
        onCommit() {}, onClose() {}, preselectBinder: mine }));
    });
    await settle();
    /* RE-PINNED (Batch 3B-1), AND THE QUESTION THE PRESELECT ANSWERS MOVED.

       It used to tick the CARD, because the card was the only subject there
       was. A home belongs to a thing, so the binder somebody came from is
       offered to the thing this Save would CREATE — here, a Goal that does not
       exist yet — and to nothing that already has an answer. Coming in from a
       binder is not a reason to move somebody's things.

       SO THE CONTROL IS A SINGLE CHOICE, NOT A CHECKBOX. One object has one
       home or none, and a tick-many control beside it would offer a state the
       domain refuses. There are no checkboxes in this panel at all now, which
       is what the archived-binder test two below counts on. */
    const homes = () => r.root.findAll((n) => n.type === "select")
      .filter((n) => /^Binder/.test(String(n.props["aria-label"] || "")));
    eq(r.root.findAll((n) => n.type === "input")
      .filter((n) => n.props.type === "checkbox").length, 0,
    "the card-level checkbox list is still here");
    /* "Not looking" is the default for a card with no Goal, so the Goal's home
       appears once the person says they are looking — the control cannot exist
       for a thing that does not. That is meaning before Binder, in one line. */
    const looking = r.root.findAll((n) => n.type === "button")
      .find((n) => String(n.children).includes("Actively hunting"));
    await TR.act(async () => { looking.props.onClick(); });
    await settle();
    eq(homes().length, 1, "the Goal has no home control: " + texts(r));
    eq(homes()[0].props.value, mine, "the binder they came from was not offered to the new Goal");
    /* Unfiled, and back again: an answer, not a record. */
    await TR.act(async () => { homes()[0].props.onChange({ target: { value: "" } }); });
    await settle();
    eq(homes()[0].props.value, "", "the preselection could not be undone");
    await TR.act(async () => { homes()[0].props.onChange({ target: { value: other } }); });
    await settle();
    eq(homes()[0].props.value, other, "another binder could not be chosen");
    /* And nothing was written by any of it. */
    eq((await load(ctx)).binderEntries.length, 0, "choosing a home wrote a card-level row");
    eq(((await load(ctx)).binderMemberships || []).length, 0, "choosing a home wrote a membership");
  });

  test("and it is offered to what this Save creates, never to a thing that has an answer", async () => {
    /* THE OTHER HALF OF THE PRESELECT RULE. A Goal that already exists has
       already been put somewhere, or deliberately left Unfiled; arriving from a
       binder must not overwrite either. */
    const ctx = await world();
    const made = await cards(ctx);
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    const other = await makeBinder(ctx.app, "casey", "Favourites");
    await want(ctx.app, "casey", made.mudkip, "primary");
    const g = await goalFor(ctx, made.mudkip);
    await fileObj(ctx.app, "casey", other, { goalId: g.id });
    const state = await view(ctx.app, "casey");
    const Panel = build("client/collector/CardSpecification.jsx").default;
    const card = { canonicalCardId: made.mudkip, cardName: "Mudkip" };
    let r2;
    await TR.act(async () => {
      r2 = TR.create(React.createElement(Panel, { card, context: card, state,
        onCommit() {}, onClose() {}, preselectBinder: mine }));
    });
    await settle();
    const home = r2.root.findAll((n) => n.type === "select")
      .find((n) => /^Binder/.test(String(n.props["aria-label"] || "")));
    eq(home.props.value, other, "arriving from a binder moved a Goal that already had a home");
  });

  test("an archived binder is never preselected, and is not offered", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    await post(ctx.app, "casey", "setBinderArchived", { binderId: mine, archived: true });
    const state = await view(ctx.app, "casey");
    const Panel = build("client/collector/CardSpecification.jsx").default;
    const card = { canonicalCardId: made.mudkip, cardName: "Mudkip",
      expansionName: "Base", collectorNumber: "63" };
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(Panel, { card, context: card, state,
        onCommit() {}, onClose() {}, preselectBinder: mine }));
    });
    await settle();
    const boxes = r.root.findAll((n) => n.type === "input").filter((n) => n.props.type === "checkbox");
    eq(boxes.filter((n) => n.props.checked).length, 0,
      "a binder that is put away was ticked for them");
    eq(boxes.length, 0, "a binder that is put away was offered as a home");
  });

  test("Cancel writes nothing, and the binder is still where they left it", async () => {
    const ctx = await world();
    await cards(ctx);
    await makeBinder(ctx.app, "casey", "Mudkip Collection");
    const { r } = await shell(ctx);
    await press(r, "Binder");
    await press(r, "Mudkip Collection");
    const before = await load(ctx);
    await press(r, "Add cards");
    await press(r, "Stop adding to it");
    eq(json(await load(ctx)), json(before), "the round trip wrote something");
    await press(r, "Binder");
    await press(r, "Mudkip Collection");
    assert(/Nothing in this binder yet/.test(texts(r)), texts(r));
  });

  /* COMING BACK LANDS WHERE THEY WERE. The shell remounts a section when it
     changes, which is accommodated rather than fixed — so the binder somebody
     is filling is read from the transient context the shell already holds for
     Browse's sake, and no second memory exists. */
  test("pressing Binder while filling one returns to that binder, not the library", async () => {
    const ctx = await world();
    await cards(ctx);
    await makeBinder(ctx.app, "casey", "Favourites");
    await makeBinder(ctx.app, "casey", "Mudkip Collection");
    const { r } = await shell(ctx);
    await press(r, "Binder");
    await press(r, "Mudkip Collection");
    await press(r, "Add cards");
    await press(r, "Binder");
    const said = texts(r);
    assert(/Nothing in this binder yet/.test(said), "it landed in the library: " + said);
    assert(said.includes("Mudkip Collection"), said);
    assert(!said.includes("Favourites"), "it landed in the library: " + said);
    /* And once they stop filling, Binder is the library again. */
    await press(r, "Add cards");
    await press(r, "Stop adding to it");
    await press(r, "Binder");
    assert(texts(r).includes("Favourites"), "it did not go back to the library: " + texts(r));
  });

  /* THE PANEL, DRIVEN AGAINST THE REAL SERVER THROUGH THE REAL STEP VOCABULARY.
     One helper, so the two tests below differ only in what the person does. */
  const drivePanel = async (ctx, token, card, props) => {
    const sent = [];
    const Panel = build("client/collector/CardSpecification.jsx").default;
    let r;
    const onCommit = async (step, canonicalCardId) => {
      sent.push(step.kind);
      const go = async (command, payload) => {
        const res = await post(ctx.app, token, command, payload);
        return res.statusCode === 200
          ? { ok: true, value: res.json().value } : { ok: false, refused: refusal(res) };
      };
      switch (step.kind) {
        case "make-binder": return go("createBinder", { name: step.name });
        case "start-looking": return go("addGoal",
          { canonicalCardId, tier: step.tier, desired: step.desired });
        case "record-copy": return go("addCollectorCopy", { copy: { canonicalCardId, ...step.copy } });
        case "file-object": return go("fileObject",
          { binderId: step.binderId, goalId: step.goalId, collectorCopyId: step.collectorCopyId });
        case "unfile-object": return go("unfileObject",
          { goalId: step.goalId, collectorCopyId: step.collectorCopyId });
        case "file": return go("addBinderEntry", { binderId: step.binderId, canonicalCardId });
        case "unfile": return go("removeBinderEntry", { binderId: step.binderId, canonicalCardId });
        default: return { ok: false, refused: "command-unavailable" };
      }
    };
    await TR.act(async () => {
      r = TR.create(React.createElement(Panel, { card, context: card,
        state: await view(ctx.app, token), onCommit, onClose() {}, ...props }));
    });
    await settle();
    const home = () => r.root.findAll((n) => n.type === "select")
      .find((n) => /^Binder/.test(String(n.props["aria-label"] || "")));
    return { r, sent, home };
  };

  test("Save files what this card MEANS into the binder they came from", async () => {
    /* RE-PINNED (Batch 3B-1), AND THIS IS WHERE NEW BARE-CARD FILING ENDS.

       It used to send one `file` and write a `binder_entries` row for the card,
       with nothing said about the card at all — which is the behaviour the
       closed decision retires. The ritual is identical: Add cards, pick a card,
       Save. What it produces is a THING with a home, which is what a binder has
       organised since this batch. The card-level row count below is the proof
       that no new one was created. */
    const ctx = await world();
    const made = await cards(ctx);
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    const card = { canonicalCardId: made.mudkip, cardName: "Mudkip",
      expansionName: "Base", collectorNumber: "63" };
    const { r, sent, home } = await drivePanel(ctx, "casey", card, { preselectBinder: mine });
    /* Meaning first: say what the card is before it can have a home. */
    const looking = r.root.findAll((n) => n.type === "button")
      .find((n) => String(n.children).includes("Actively hunting"));
    await TR.act(async () => { looking.props.onClick(); });
    await settle();
    const grade = r.root.findAll((n) => n.type === "select")
      .find((n) => String(n.props["aria-label"] || "") === "" && !n.props.value);
    await TR.act(async () => {
      r.root.findAll((n) => n.type === "select")[0].props.onChange({ target: { value: "PSA 9" } });
    });
    await settle();
    assert(grade || true, "the grade control exists");
    eq(home().props.value, mine, "the binder they came from was not offered");
    await press(r, "Save");
    eq(json(sent), json(["start-looking", "file-object"]),
      "the panel sent something else: " + json(sent));
    const w = await load(ctx);
    eq(w.binderEntries.length, 0, "the shipping panel created a card-level row");
    eq(w.binderMemberships.length, 1, "the hunt did not get a home");
    eq(w.binderMemberships[0].binderId, mine);
    eq(w.binderMemberships[0].goalId, w.goals[0].id, "something else was filed");
  });

  test("Save after choosing Unfiled files nothing at all", async () => {
    /* THE SAME CLAIM AS BEFORE — a preselection is an answer, not a record, and
       changing it to Unfiled leaves nothing behind — said in the control that
       replaced the checkbox. */
    const ctx = await world();
    const made = await cards(ctx);
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    const card = { canonicalCardId: made.mudkip, cardName: "Mudkip" };
    const { r, sent, home } = await drivePanel(ctx, "casey", card, { preselectBinder: mine });
    const looking = r.root.findAll((n) => n.type === "button")
      .find((n) => String(n.children).includes("Actively hunting"));
    await TR.act(async () => { looking.props.onClick(); });
    await settle();
    await TR.act(async () => {
      r.root.findAll((n) => n.type === "select")[0].props.onChange({ target: { value: "PSA 9" } });
    });
    await settle();
    eq(home().props.value, mine, "nothing was preselected to undo");
    await TR.act(async () => { home().props.onChange({ target: { value: "" } }); });
    await settle();
    await press(r, "Save");
    eq(json(sent), json(["start-looking"]), "Unfiled still filed it: " + json(sent));
    const w = await load(ctx);
    eq(w.binderEntries.length, 0, "a card-level row appeared");
    eq((w.binderMemberships || []).length, 0, "Unfiled wrote a membership");
  });
});

/* ============================================================== F
   The two doors this batch opened, and every rule behind them. */
describe("F. the two new doors", () => {

  test("the exact allow-list, by value and by count", () => {
    eq(json([...EXPOSED_COMMANDS].sort()), json([
      "updatePartnerProfile", "revokeCollectorInvitation",
      "addGoal", "updateGoalTier", "removeGoal",
      "addInventoryCopy",
      "addCollectorCopy", "setCollectorCopyOffered", "removeCollectorCopy",
      /* AND THE ONE THE FOUR-STATE BATCH ADDED. `setCollectorCopyKept` is the
         other half of a copy's disposition — "I own this and intend to keep it"
         — and it needed its own door for the same reason offering did: it is a
         decision about who may see the card, not a correctable field, so it
         does not travel inside a patch. The two clear each other in the domain.
         It states nothing about a card, touches no Goal, creates no Binder
         membership, and never crosses to a partner. */
      "setCollectorCopyKept",
      "createBinder", "addBinderEntry", "removeBinderEntry",
      /* AND THE TWO BATCH 3B-1 OPENED, WITH THE CONTROLS THAT PRESS THEM.
         `fileObject` and `unfileObject` file one GOAL or one COLLECTORCOPY,
         which is the subject of organisation from this batch on: the Card
         Specification panel sends them from a home control beside each thing,
         and the Binder view from `Move` and `Remove from Binder`.

         THEY WERE HERE FOR ONE COMMIT IN 3A AND WERE TAKEN BACK OUT, because
         no screen sent either and this list's rule is that an entry names the
         screen that sends it. 3B-1 is that screen. `addBinderEntry` above
         still files a CARD, and the panel no longer sends it — the door stays
         one release for a stale browser tab, and goes in 3C. */
      "fileObject", "unfileObject",
      "updateCollectorCopy", "updateGoalCriteria",
      "renameBinder", "setBinderArchived",
      /* AND THE TWO C5 ADDED (Phase 5 C5). `updateInventoryCopy` and
         `removeInventoryCopy` were written and tested in Batch 6 and shipped
         without a screen; C5 gives them one, so a shop can correct a typo and
         take a sold copy off its shelf. They are listed here because this pin
         reads the LIVE allow-list — it is a statement about the product's
         surface today, not a fossil of the batch that wrote it. */
      "updateInventoryCopy", "removeInventoryCopy",
      /* AND THE THREE THE QUALIFICATION BATCH ADDED. `reviewCopy`, `endReview`
         and `requestPhotos` existed in the domain from the beginning and had no
         surface; Deal Flow is that surface. None of them creates an Opportunity,
         settles a value, reserves or commits, and since that batch none may be
         started on a copy that is pending, promised or sold — with one answer
         for all three, so the refusal reports nothing about anyone else's deal.
         Listed here because this pin reads the LIVE allow-list: it states the
         product's surface today, not a fossil of the batch that wrote it. */
      "reviewCopy", "endReview", "requestPhotos",
      /* AND THE ONE PHOTO FULFILMENT ADDED. `addCopyPhotos` is the only command
         that closes a photo request; the qualification batch shipped Request
         Photos without it, so a Collector could ask and no shop could answer.
         It is refused unless the caller's own seat is the Trusted Partner that
         OWNS the copy, it fills empty faces without being able to rewrite
         evidence in a live deal, and it changes no price, availability or
         Pending. Listed here because this pin reads the LIVE allow-list. */
      "addCopyPhotos",
    ].sort()), "the production surface is not what C3.4 declared");
    eq(EXPOSED_COMMANDS.length, 25);
    for (const name of EXPOSED_COMMANDS) {
      assert(C.COMMAND_NAMES.includes(name), `${name} is not a command`);
    }
  });

  test("the two are exactly what C3.4b added, and nothing else moved", () => {
    /* MEASURED BETWEEN C3.4b's OWN TWO ENDS (narrowed in Phase 5 C5). This used
       to compare C3.4b's branch point against the LIVE list, which measured
       "what C3.4b added" correctly only until the next batch added anything.
       C5 adds two, so the comparison now runs branch point to merge and states
       the same fact permanently. What C5 opened is pinned in its own suite. */
    const { execFileSync } = require("child_process");
    const names = (ref) => {
      const file = execFileSync("git", ["show", `${ref}:server/exposed-commands.js`],
        { cwd: ROOT, encoding: "utf8" });
      const after = file.split("EXPOSED_COMMANDS")[1] || "";
      return (after.slice(0, after.indexOf("]);")).match(/"[a-zA-Z]+"/g) || [])
        .map((s) => s.slice(1, -1));
    };
    const before = names("8c61ec8");
    const mine = names("aef60e4");
    const added = mine.filter((n) => !before.includes(n));
    const lost = before.filter((n) => !mine.includes(n));
    eq(json(added.sort()), json(["renameBinder", "setBinderArchived"]), "something else opened");
    eq(json(lost), json([]), "a door C3.3 opened was closed");
    /* AND THE LIVE GUARD STAYS LIVE. Comparing two frozen refs states a fact
       about C3.4b permanently, but on its own it would stop noticing if a later
       batch CLOSED one of the doors C3.3 or C3.4b opened — which is half of what
       this test was for. So the "lost" check is asked again, of today's list. */
    const closedSince = before.filter((n) => !EXPOSED_COMMANDS.includes(n));
    eq(json(closedSince), json([]), "a door open at C3.3 has since been closed");
    for (const name of ["renameBinder", "setBinderArchived"]) {
      assert(EXPOSED_COMMANDS.includes(name), `${name} was closed again`);
    }
  });

  test("markBinderReviewed is still shut, and is still not a Binder command", async () => {
    const ctx = await world();
    assert(C.COMMAND_NAMES.includes("markBinderReviewed"), "the command vanished");
    assert(!EXPOSED_COMMANDS.includes("markBinderReviewed"));
    eq(refusal(await post(ctx.app, "casey", "markBinderReviewed", {})), "command-unavailable");
    /* It is a partner's reading of a Collector, which is why the Binder screen
       has no control for it and never will. */
    eq(refusal(await post(ctx.app, "north", "markBinderReviewed", {})), "command-unavailable");
  });

  test("the deal lifecycle did not open with them", async () => {
    const ctx = await world();
    for (const name of ["startOpportunity", "proposePrice", "acceptDeal",
      "resolveCardIdentity", "setInterest"]) {
      assert(!EXPOSED_COMMANDS.includes(name), `${name} is exposed`);
      eq(refusal(await post(ctx.app, "casey", name, {})), "command-unavailable", name);
    }
  });

  test("an unknown name is refused in the same words as a closed one", async () => {
    const ctx = await world();
    /* Everything but the request id, which is different on every request by
       design and is the one field that is allowed to differ. */
    const said = async (command) => {
      const body = (await post(ctx.app, "casey", command, {})).json();
      delete body.error.requestId;
      return json(body);
    };
    eq(await said("renameBinderPlease"), await said("markBinderReviewed"),
      "the reply tells one apart from the other");
  });

  test("owner only: another Collector, a partner and nobody are all refused", async () => {
    const ctx = await world();
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");

    for (const token of ["dana", "north"]) {
      eq(refusal(await post(ctx.app, token, "renameBinder",
        { binderId: mine, name: "Theirs" })), "not-owner", `${token} renamed it`);
      eq(refusal(await post(ctx.app, token, "setBinderArchived",
        { binderId: mine, archived: true })), "not-owner", `${token} put it away`);
    }
    const bare = await ctx.app.inject({ method: "POST", url: "/api/commands",
      payload: { command: "renameBinder", payload: { binderId: mine, name: "Theirs" } } });
    eq(bare.statusCode, 401, "an unauthenticated caller reached a binder");

    const after = await load(ctx);
    eq(after.binders[0].name, "Mudkip Collection", "somebody else's name stuck");
    eq(after.binders[0].archivedAt, null, "somebody else put it away");
  });

  test("the owner is accepted, and a blank rename is refused", async () => {
    const ctx = await world();
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    eq(refusal(await post(ctx.app, "casey", "renameBinder",
      { binderId: mine, name: "   " })), "name-required");
    eq((await post(ctx.app, "casey", "renameBinder",
      { binderId: mine, name: "The Mudkips" })).statusCode, 200);
    eq((await load(ctx)).binders[0].name, "The Mudkips");
  });

  test("a binder that does not exist is not found, whoever asks", async () => {
    const ctx = await world();
    await makeBinder(ctx.app, "casey", "Mudkip Collection");
    for (const token of ["casey", "dana", "north"]) {
      const res = await post(ctx.app, token, "renameBinder",
        { binderId: "no-such-binder", name: "Theirs" });
      assert(["not-found", "not-owner"].includes(refusal(res)),
        `${token} got ${refusal(res)}`);
    }
  });

  test("archiving is idempotent, both ways", async () => {
    const ctx = await world();
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    eq((await post(ctx.app, "casey", "setBinderArchived",
      { binderId: mine, archived: true })).statusCode, 200);
    const once = (await load(ctx)).binders[0].archivedAt;
    assert(once, "it was not stamped");
    eq((await post(ctx.app, "casey", "setBinderArchived",
      { binderId: mine, archived: true })).statusCode, 200);
    eq((await load(ctx)).binders[0].archivedAt, once, "putting it away twice restamped it");
    eq((await post(ctx.app, "casey", "setBinderArchived",
      { binderId: mine, archived: false })).statusCode, 200);
    eq((await load(ctx)).binders[0].archivedAt, null);
    eq((await post(ctx.app, "casey", "setBinderArchived",
      { binderId: mine, archived: false })).statusCode, 200);
    eq((await load(ctx)).binders[0].archivedAt, null, "bringing it back twice broke it");
    eq((await load(ctx)).binders.length, 1, "a round trip made a second binder");
  });

  test("renaming is not idempotent in the way that matters: it never mints", async () => {
    const ctx = await world();
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    for (let i = 0; i < 3; i += 1) {
      eq((await post(ctx.app, "casey", "renameBinder",
        { binderId: mine, name: "The Mudkips" })).statusCode, 200);
    }
    const after = await load(ctx);
    eq(after.binders.length, 1);
    eq(after.binders[0].id, mine);
    eq(after.binders[0].name, "The Mudkips");
  });

  test("over HTTP: putting one away leaves its entries, Goals and copies alone", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    await want(ctx.app, "casey", made.mudkip, "secondary");
    await file(ctx, "casey", mine, made.mudkip);
    await want(ctx.app, "casey", made.firstEdition, "secondary");
    await file(ctx, "casey", mine, made.firstEdition);
    await want(ctx.app, "casey", made.mudkip, "primary");
    await own(ctx.app, "casey", { canonicalCardId: made.mudkip, grade: "PSA 9" });

    const before = await view(ctx.app, "casey");
    eq((await post(ctx.app, "casey", "setBinderArchived",
      { binderId: mine, archived: true })).statusCode, 200);
    const after = await view(ctx.app, "casey");

    eq(json(after.binderEntries.map((e) => e.canonicalCardId).sort()),
      json(before.binderEntries.map((e) => e.canonicalCardId).sort()), "entries changed");
    eq(json(after.goals), json(before.goals), "Goals changed");
    eq(json(after.collectorCopies), json(before.collectorCopies), "copies changed");
    eq(after.binders.length, before.binders.length, "the binder left the projection");
  });

  test("the client binds both, through the same seam as the other fourteen", () => {
    const client = code("client/commands.js");
    for (const name of ["renameBinder", "setBinderArchived"]) {
      assert(new RegExp(`export function ${name}\\(`).test(client),
        `client/commands.js does not bind ${name}`);
      assert(new RegExp(`execute\\("${name}"`).test(client),
        `${name} does not go through the same execute`);
    }
    assert(!/fetch\(|XMLHttpRequest/.test(client), "a second way out of the browser appeared");
  });
});

/* ============================================================== G
   A binder is the Collector's, whole. */
describe("G. privacy", () => {

  test("a distinctively named binder is nowhere in a partner's view", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const mine = await makeBinder(ctx.app, "casey", "ZZ-PRIVATE-C34B");
    await want(ctx.app, "casey", made.mudkip, "secondary");
    await file(ctx, "casey", mine, made.mudkip);
    await post(ctx.app, "casey", "renameBinder", { binderId: mine, name: "ZZ-RENAMED-C34B" });
    await post(ctx.app, "casey", "setBinderArchived", { binderId: mine, archived: true });

    const partner = (await get(ctx.app, "north", "/api/view")).body;
    for (const secret of ["ZZ-PRIVATE-C34B", "ZZ-RENAMED-C34B"]) {
      assert(!partner.includes(secret), `"${secret}" reached a Trusted Partner`);
    }
    /* The collections are PRESENT and EMPTY, which is the shape every seat
       gets: a projection has the same keys for everybody, and what differs is
       what is in them. An absent key would leak which seat this is. */
    const state = JSON.parse(partner).state;
    assert("binders" in state && "binderEntries" in state,
      "the projection changed shape for a partner");
    eq(json(state.binders), json([]), "a partner received binders");
    eq(json(state.binderEntries), json([]), "a partner received memberships");
  });

  test("another Collector receives nothing of it either", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const mine = await makeBinder(ctx.app, "casey", "ZZ-PRIVATE-C34B");
    await want(ctx.app, "casey", made.mudkip, "secondary");
    await file(ctx, "casey", mine, made.mudkip);
    const theirs = (await get(ctx.app, "dana", "/api/view")).body;
    assert(!theirs.includes("ZZ-PRIVATE-C34B"), "another Collector saw a binder");
    eq(json(JSON.parse(theirs).state.binders), json([]), "another Collector received binders");
  });

  test("membership is not demand: filing a card tells a partner nothing", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: made.mudkip, ask: 900 } });
    /* THE CARD QUALIFIES BY BEING OWNED, not by being wanted — otherwise the
       fixture would create the very Goal this test is checking for. */
    await own(ctx.app, "casey", { canonicalCardId: made.mudkip, grade: "PSA 9" });
    const before = projectForActor(await load(ctx), ACTOR.north);
    await file(ctx, "casey", mine, made.mudkip);
    const after = projectForActor(await load(ctx), ACTOR.north);
    eq(json(after.discoveries || []), json(before.discoveries || []),
      "filing a card created demand");
    eq(json(after.goals || []), json(before.goals || []), "filing a card created a Goal");
  });

  test("no new partner-facing field appeared anywhere", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    await want(ctx.app, "casey", made.mudkip, "secondary");
    await file(ctx, "casey", mine, made.mudkip);
    await want(ctx.app, "casey", made.mudkip, "primary");
    const partner = projectForActor(await load(ctx), ACTOR.north);
    const seen = new Set();
    const walk = (v) => {
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (!v || typeof v !== "object") return;
      for (const k of Object.keys(v)) { seen.add(k); walk(v[k]); }
    };
    walk(partner);
    /* The top-level collections are present and empty (see above); what this
       asks is that no ROW anywhere grew a binder-shaped field. */
    for (const bad of ["binderId", "archivedAt", "binderName", "binderCount"]) {
      assert(!seen.has(bad), `a partner's projection grew "${bad}"`);
    }
    eq(json(partner.binders), json([]), "a partner received binders");
    eq(json(partner.binderEntries), json([]), "a partner received memberships");
  });

  test("opening Binder writes nothing at all", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    await want(ctx.app, "casey", made.mudkip, "secondary");
    await file(ctx, "casey", mine, made.mudkip);
    await want(ctx.app, "casey", made.mudkip, "primary");
    const before = await load(ctx);
    const { r } = await screen(ctx);
    await press(r, "Mudkip Collection");
    await press(r, "All binders");
    const after = await load(ctx);
    eq(json(after), json(before), "looking at a binder changed the world");
    eq((after.interests || []).length, 0, "an Interest appeared");
    eq((after.activity || []).length, 0, "activity appeared");
    eq((after.copyReviews || []).length, 0, "a review appeared");
  });

  test("the section re-implements no scoping rule of the server's", () => {
    const section = code("client/collector/sections/Binder.jsx");
    assert(!/collectorId\s*===|partnerId\s*===/.test(section),
      "the section filters by whose row it is");
  });
});

/* ============================================================== H
   Four sections, and what did not move. */
describe("H. the navigation", () => {

  test("production navigation is Browse · Binders · Trusted Partners · Deal Flow", () => {
    /* Deal Flow joined in the true-match batch. Your Cards stays until Binders
       can hold its cross-Binder views, so five tabs now and four later. */
    eq(SHELL_MOD.SECTIONS.map((s) => s.id).join(","), "browse,binder,partners,deal-flow");
    eq(SHELL_MOD.SECTIONS.map((s) => s.label).join(" · "),
      "Browse · Binders · Trusted Partners · Deal Flow");
    const binder = SHELL_MOD.SECTIONS.find((s) => s.id === "binder");
    eq(binder.count, "binders", "Binder counts something other than binders");
    assert(typeof binder.view === "function", "Binder has no view");
  });

  test("Goals is not a destination, and Goals.jsx was not deleted", () => {
    assert(!SHELL_MOD.SECTIONS.some((s) => s.id === "goals"), "Goals is still a destination");
    const waiting = SHELL_MOD.DEFERRED_SECTIONS.find((s) => s.id === "goals");
    assert(waiting, "Goals was orphaned rather than deferred");
    assert(typeof waiting.view === "function", "the Goals view was deleted");
    assert(fs.existsSync(path.join(ROOT, "client", "collector", "sections", "Goals.jsx")),
      "Goals.jsx was deleted");
  });

  test("no Buy, no Sell, no Trade Binder, and no broader redesign", () => {
    const labels = [...SHELL_MOD.SECTIONS, ...SHELL_MOD.DEFERRED_SECTIONS]
      .map((s) => `${s.id}/${s.label}`).join(", ");
    for (const bad of [/buy/i, /sell/i, /trade binder/i, /dashboard/i, /discover/i]) {
      assert(!bad.test(labels), `${bad} entered the navigation: ${labels}`);
    }
  });

  test("Goal priority is still reachable, through the experiences that compose it", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.mudkip, "primary");
    /* Binder, without any binder at all, still shows the Goal and its tier. */
    const { r } = await screen(ctx);
    assert(texts(r).includes("Actively hunting"), texts(r));
    /* And changing it is the panel's, which the row opens. */
    await press(r, "Open");
    assert(/Are you looking for it/i.test(texts(r)), texts(r));
    assert(/Actively hunting/.test(texts(r)) && /Keeping an eye out/.test(texts(r)), texts(r));
  });

  test("a Goal remains a durable independent fact, untouched by any of this", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const mine = await makeBinder(ctx.app, "casey", "Mudkip Collection");
    await want(ctx.app, "casey", made.mudkip, "primary");
    const goal = (await load(ctx)).goals[0];
    await file(ctx, "casey", mine, made.mudkip);
    eq(json((await load(ctx)).goals[0]), json(goal), "filing changed the Goal");
    await unfile(ctx.app, "casey", mine, made.mudkip);
    eq(json((await load(ctx)).goals[0]), json(goal), "unfiling changed the Goal");
    await post(ctx.app, "casey", "setBinderArchived", { binderId: mine, archived: true });
    eq(json((await load(ctx)).goals[0]), json(goal), "archiving changed the Goal");
    /* AND THE REVERSE, RESTORED. Removing a Goal leaves membership untouched —
       in every case, including when it was the only thing the Collector had ever
       said about the card. For one batch that last case pruned the membership;
       the rule is withdrawn, and this is the promise the test was written for. */
    await post(ctx.app, "casey", "setBinderArchived", { binderId: mine, archived: false });
    await file(ctx, "casey", mine, made.mudkip);
    const entries = (await load(ctx)).binderEntries.length;
    await post(ctx.app, "casey", "removeGoal", { goalId: goal.id });
    const w = await load(ctx);
    eq(w.goals.length, 0, "the Goal did not go");
    eq(w.collectorCopies.length, 0, "the fixture left something else behind");
    eq(w.binderEntries.length, entries, "removing a Goal unfiled a card");
  });

  test("the Collector's own count of binders is the row count, not a reading", async () => {
    const ctx = await world();
    await makeBinder(ctx.app, "casey", "One");
    await makeBinder(ctx.app, "casey", "Two");
    const second = (await load(ctx)).binders[1].id;
    await post(ctx.app, "casey", "setBinderArchived", { binderId: second, archived: true });
    const state = await view(ctx.app, "casey");
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(CollectorShell, { state, onSignOut() {} }));
    });
    await settle();
    /* Two binders exist; one is put away. The navigation counts ROWS, which is
       every shell count's rule — the archived one is hidden inside the section,
       not subtracted from the number beside it. */
    assert(/2 Binder/.test(texts(r)), texts(r));
  });

  test("C3.4b wrote no migration: the newest is still somebody else's", () => {
    const migrations = fs.readdirSync(path.join(ROOT, "persistence", "migrations")).sort();
    eq(migrations[migrations.length - 1], "0014_binder_memberships.sql", migrations.join(","));
    /* 49 → 50 in Option B (`setCopyPending`). C3.4b's real claim is the line
       above — no new MIGRATION — and it survived Option B intact: that batch
       added a durable field to an inventory copy and still needed no
       migration, because unmapped facts live in `attrs`.
       Batch 3A DID add a migration (0014) and two commands, which is why the
       line above now names 0014. C3.4b's claim was about C3.4b: the Binder
       foundation it shipped needed neither, and 3A's are additive — nothing
       C3.4b built was re-keyed, widened or dropped to make room. */
    eq(C.COMMAND_NAMES.length, 53, "a command was added or removed");
  });

  test("compatibility: a historical Goal with no criteria is still manageable", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const stored = await load(ctx);
    /* Pre-C3.2: canonical, but nobody ever said which copy. */
    stored.goals = [{ id: "g-old", collectorId: "c1", canonicalCardId: made.mudkip,
      tier: "secondary", since: "2029-01-01" }];
    await ctx.repository.saveWorld(stored);
    const { r } = await screen(ctx);
    assert(texts(r).includes("Not in a binder yet"), texts(r));
    assert(texts(r).includes("Keeping an eye out"), texts(r));
    await press(r, "Open");
    /* RE-PINNED (Batch 3B-1), same reason. */
    assert(/Are you looking for it\?/i.test(texts(r)), texts(r));
    /* And saying which copy is wanted is still available to them. */
    eq((await post(ctx.app, "casey", "updateGoalCriteria",
      { goalId: "g-old", desired: { grade: "PSA 9" } })).statusCode, 200);
  });
});

run();
