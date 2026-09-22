/* ============================================================================
   PHASE 5 C3.3 — CARD SPECIFICATION UX

   One card, four independent facts, one deliberate commit.

   Everything C3.3 writes already existed. A Binder is organisation (C3.1), a
   Goal is demand (Batch 7), a CollectorCopy is ownership (C2), and `offered` is
   availability (C2). What a Collector could not do was say any of it about the
   card they were looking at: Browse could create a Goal and nothing else, and
   the three copy commands had been exposed since C2 with no screen to send
   them. C3.3 is the screen — and it composes those facts rather than inventing
   a fifth one on top of them.

   THE THING THIS SUITE IS REALLY ABOUT is that the four stay independent. A
   Collector may want a card Primarily, own three copies of it, offer one, and
   file it in two binders, all at once. A product that modelled that as a state
   machine would have to pick one, and would be wrong about a person's actual
   collection on the first day. So the tests below assert the combinations, not
   the transitions.

   A. the raw condition   a live TP defect C3.2 created, fixed first
   B. one grading reading  the server decides what a grade means, once
   C. criteria on a Goal   stating and correcting what copy is wanted
   D. the door             which commands a browser may now send
   E. the panel            initialisation, editing, and writing nothing
   F. the commit           a diff, in order, and what a partial one leaves
   G. independence         the combinations a real collection contains
   H. privacy              what a Trusted Partner still never receives
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
const { executeCommand } = require("../persistence/command-transaction.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { projectForActor, FIELD_RULES } = require("../domain/metyet-projection.js");
const { validateWorld } = require("../domain/metyet-world.js");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
const C = require("../domain/metyet-commands.js");
const D = require("../domain/metyet-domain.js");
const RT = require("../domain/metyet-runtime.js");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
/* Source with comments stripped, for assertions about what the code DOES
   rather than about what it says it does. */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const json = (v) => JSON.stringify(v);

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

const SUBJECT = { north: "sub-north", second: "sub-second", casey: "sub-casey" };
const ACTOR = { casey: { collectorId: "c1" }, north: { partnerId: "p1" }, second: { partnerId: "p2" } };

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
    collectors: [{ id: "c1", name: "Casey" }],
    partners: [{ id: "p1", name: "Northline" }, { id: "p2", name: "Second" }],
    relationships: [{ partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" }],
    invitations: [], goals: [], inventory: [], collectorCopies: [],
    binders: [], binderEntries: [],
    interests: [], opportunities: [], conversations: [], photoRequests: [], copyReviews: [],
  });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: SUBJECT.north, role: "tp", partnerId: "p1" });
  await accounts.linkAccount({ subject: SUBJECT.second, role: "tp", partnerId: "p2" });
  await accounts.linkAccount({ subject: SUBJECT.casey, role: "collector", collectorId: "c1" });
  const verifier = { verify: async (token) => {
    const subject = SUBJECT[token];
    if (!subject) throw Object.assign(new Error("no"), { reason: "bad token" });
    return { subject, email: `${token}@example.invalid`, emailVerified: true };
  } };
  return { pg, db, runtime, repository, catalog,
    app: createApp({ repository, catalog, accounts, verifier, runtime }) };
}

/* Two printings of one card plus a second card, so "another printing" and
   "another card" are never confused with "another copy of this one". */
async function cards(ctx) {
  const { expansionId } = await ctx.catalog.putExpansion(
    { game: "pokemon", code: "base1", name: "Base", printedTotal: 102 });
  const charizard = await ctx.catalog.putCardContext({ game: "pokemon", expansionId,
    collectorNumber: "4", cardName: "Charizard", artist: "Mitsuhiro Arita" });
  const mudkip = await ctx.catalog.putCardContext({ game: "pokemon", expansionId,
    collectorNumber: "63", cardName: "Mudkip", artist: "Kagemaru Himeno" });
  const made = { charizardContext: charizard.cardContextId, mudkipContext: mudkip.cardContextId };
  made.firstEdition = (await ctx.catalog.putCanonicalCard({ cardContextId: charizard.cardContextId,
    printRun: "first_edition", finish: "holofoil" })).canonicalCardId;
  made.unlimited = (await ctx.catalog.putCanonicalCard({ cardContextId: charizard.cardContextId,
    printRun: "unlimited", finish: "holofoil" })).canonicalCardId;
  made.mudkip = (await ctx.catalog.putCanonicalCard({ cardContextId: mudkip.cardContextId,
    printRun: "unlimited", finish: "non_holo" })).canonicalCardId;
  return made;
}

const post = (app, token, command, payload) => app.inject({ method: "POST", url: "/api/commands",
  headers: { authorization: `Bearer ${token}` }, payload: { command, payload } });
const get = (app, token, url) => app.inject({ method: "GET", url,
  headers: { authorization: `Bearer ${token}` } });
const view = async (app, token) => (await get(app, token, "/api/view")).json().state;
const own = (app, token, copy) => post(app, token, "addCollectorCopy", { copy });
const stock = (app, token, copy) => post(app, token, "addInventoryCopy", { copy });
const want = (app, token, canonicalCardId, tier = "primary", extra = {}) =>
  post(app, token, "addGoal", { canonicalCardId, tier, ...extra });
const load = (ctx) => ctx.repository.loadWorld();
const refusal = (res) => (res.statusCode === 200 ? null : res.json().error.refused);
/* Past the production door, for domain rules whose surface is not the subject. */
const direct = (ctx, actor, command, payload) =>
  executeCommand(ctx.repository, { actor, command, payload, runtime: ctx.runtime });

/* ---------------------------------------------------------------- RENDERING
   The same approach C1 established: build the real component with esbuild and
   drive it with react-test-renderer against a real server. No DOM, so nothing
   below claims anything about pixels — see section E on what "the grid stayed
   put" is allowed to mean here. */
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
const texts = (r) => {
  const out = [];
  const walk = (n) => {
    if (n && n.type === "style") return;
    for (const c of (n && n.children) || []) {
      if (typeof c === "string" || typeof c === "number") out.push(String(c)); else walk(c);
    }
  };
  walk(r.toJSON());
  return out.join(" ").replace(/\s+/g, " ");
};
const buttons = (r) => r.root.findAll((n) => n.type === "button");
const selects = (r) => r.root.findAll((n) => n.type === "select");
/* A click starts real work — a catalog read, a command — and `act` only awaits
   its own callback, not a promise an onClick handler drops. */
const settle = async () => {
  for (let i = 0; i < 5; i += 1) {
    await TR.act(async () => { await new Promise((done) => setTimeout(done, 0)); });
  }
};
const findButton = (r, label) => buttons(r).find((n) => instText(n).trim() === label
  || instText(n).includes(label) || (n.props["aria-label"] || "") === label);
const press = async (r, label) => {
  const b = findButton(r, label);
  assert(b, `no button "${label}" among: ${buttons(r).map(instText).join(" | ")}`);
  assert(!b.props.disabled, `the button "${label}" is disabled`);
  await TR.act(async () => { b.props.onClick(); });
  await settle();
};
const typeInto = async (r, id, value) => {
  const input = r.root.findAll((n) => n.type === "input").find((n) => n.props.id === id);
  assert(input, `no input ${id}`);
  await TR.act(async () => { input.props.onChange({ target: { value } }); });
  await settle();
};
/* A <select> found by the label text of the <label> that wraps it. */
const selectNamed = (r, label) => {
  const wrapper = r.root.findAll((n) => n.type === "label")
    .find((n) => instText(n).includes(label));
  if (!wrapper) return null;
  return wrapper.findAll((n) => n.type === "select")[0] || null;
};
const choose = async (r, label, value) => {
  const el = selectNamed(r, label);
  assert(el, `no control "${label}"`);
  await TR.act(async () => { el.props.onChange({ target: { value } }); });
  await settle();
};
const optionsOf = (el) => el.findAll((n) => n.type === "option").map((n) => n.props.value);

/* A browse door wired to the real catalog repository, counting its calls so a
   test can prove the grid was not re-fetched. */
const doorFor = (ctx) => {
  const calls = { find: 0, read: 0, describe: 0 };
  return { calls, door: {
    find: async (query) => {
      calls.find += 1;
      return ctx.catalog.findCardContexts(Object.fromEntries(new URLSearchParams(query).entries()));
    },
    read: async (id) => {
      calls.read += 1;
      const found = await ctx.catalog.readCardContext(id);
      return found ? { ...found.context, canonicalCards: found.canonicalCards } : null;
    },
    describe: async (ids) => { calls.describe += 1; return { cards: await ctx.catalog.describeCanonicalCards(ids) }; },
    expansions: async (q) => ctx.catalog.findExpansions(Object.fromEntries(new URLSearchParams(q).entries())),
    artists: async (q) => ctx.catalog.findArtists(Object.fromEntries(new URLSearchParams(q).entries())),
  } };
};

/* ============================================================== A
   The defect C3.2 left on a shipped screen, and the first thing C3.3 fixes. */
describe("A. a raw copy says what state it is in — on the screen, not only in the domain", () => {

  const TP_SHELL = build("client/tp/TrustedPartnerShell.jsx").default;

  const EMPTY_TP = Object.freeze({
    actor: { seat: "tp", partnerId: "p1" },
    collectors: [], partners: [{ id: "p1", name: "Northline" }], relationships: [],
    invitations: [], goals: [], preferences: [], inventory: [], collectorCopies: [],
    binders: [], binderEntries: [], interests: [], opportunities: [], conversations: [],
    activity: [], photoRequests: [], copyReviews: [], counterparties: [], discoveries: [],
    catalog: [],
  });

  /* The Inventory section with its Add-a-copy panel open on a chosen card. */
  const adding = async (ctx, onAddCopy) => {
    const { door } = doorFor(ctx);
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(TP_SHELL,
        { state: EMPTY_TP, onSignOut() {}, onAddCopy, onBrowseCards: door }));
    });
    await press(r, "Inventory");
    await press(r, "Add cards");
    /* Mudkip has ONE printing, so choosing the card is choosing the canonical
       card and the grading controls appear straight away. Which printing is
       meant is C1's question and is answered by C1's tests. */
    await typeInto(r, "tps-br-q", "Mudkip");
    await press(r, "Mudkip");
    return r;
  };

  test("the domain refuses a raw copy with no condition — which is what made this reachable", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    eq(refusal(await stock(ctx.app, "north", { canonicalCardId: made.firstEdition, grade: "Raw" })),
      "grading-incoherent", "the rule C3.2 made authoritative");
    /* And the same pair with its other half is accepted, so the refusal is
       about the missing condition and not about raw copies. */
    eq(refusal(await stock(ctx.app, "north",
      { canonicalCardId: made.firstEdition, grade: "Raw", condition: "Near Mint" })), null);
  });

  test("so the screen no longer offers the payload the domain refuses", async () => {
    const ctx = await world();
    await cards(ctx);
    const sent = [];
    const r = await adding(ctx, async (copy) => { sent.push(copy); return { ok: true }; });

    await choose(r, "Grade", "Raw");
    const condition = selectNamed(r, "Condition");
    assert(condition, "choosing Raw did not ask for a condition");
    /* "Not stated" is a real answer for a copy nobody has described, and it
       stays on the GRADE control — asserted here so that requiring a condition
       is not quietly turned into requiring a grade. It is not an answer once
       somebody has said the card is raw: the condition control's empty entry
       is a prompt that cannot be chosen. */
    assert(optionsOf(selectNamed(r, "Grade")).includes(""),
      "a copy nobody has described can no longer be left unstated");
    const placeholder = condition.findAll((n) => n.type === "option")
      .find((n) => n.props.value === "");
    assert(placeholder && placeholder.props.disabled,
      "a raw copy can still be left with no condition: " + json(optionsOf(condition)));
    const add = findButton(r, "Add this copy");
    assert(add && add.props.disabled, "a raw copy with no condition can still be added");
    assert(/needs a condition/i.test(texts(r)), "and nothing says why: " + texts(r));
    eq(sent.length, 0, "a command was sent for a copy the domain would refuse");
  });

  test("a raw copy with its condition is sent whole; a graded copy carries none", async () => {
    const ctx = await world();
    await cards(ctx);
    const sent = [];
    const r = await adding(ctx, async (copy) => { sent.push(copy); return { ok: true }; });

    await choose(r, "Grade", "Raw");
    await choose(r, "Condition", "Heavily Played");
    await press(r, "Add this copy");
    eq(sent.length, 1);
    eq(sent[0].grade, "Raw");
    eq(sent[0].condition, "Heavily Played");
    eq(D.gradingProblem(sent[0]), null, "the screen sent a pair the domain refuses");
  });

  test("changing the grade drops a condition that no longer applies", async () => {
    const ctx = await world();
    await cards(ctx);
    const sent = [];
    const r = await adding(ctx, async (copy) => { sent.push(copy); return { ok: true }; });

    await choose(r, "Grade", "Raw");
    await choose(r, "Condition", "Damaged");
    await choose(r, "Grade", "PSA 9");
    assert(!selectNamed(r, "Condition"), "a graded copy is still being asked for a raw condition");
    await press(r, "Add this copy");
    eq(sent.length, 1);
    eq(sent[0].grade, "PSA 9");
    eq(sent[0].condition, null, "a stale condition rode along with a graded copy");
    eq(D.gradingProblem(sent[0]), null);
  });

  test("and if a refusal still arrives, it names the field", async () => {
    const ctx = await world();
    await cards(ctx);
    /* Forced, because the screen no longer produces it: the point is that the
       vocabulary is mapped, not that the mapping is reachable. */
    const r = await adding(ctx, async () => ({ ok: false, refused: "grading-incoherent" }));
    await choose(r, "Grade", "PSA 9");
    await press(r, "Add this copy");
    const shown = texts(r);
    assert(/raw condition|needs a condition/i.test(shown), "the refusal is still generic: " + shown);
    assert(!/Check the details and try again/.test(shown),
      "a refusal the screen understands was reported as one it does not: " + shown);
  });

  test("the domain is still the authority — the screen only asks first", () => {
    const body = code("client/tp/sections/Inventory.jsx");
    /* The screen may not carry its own list of what a grade or condition may
       be: that vocabulary is the domain's, and a second copy of it is a second
       answer that drifts. What it may do is ask whether the one pair it is
       holding is complete. */
    assert(!/GRADED_VALUES|CONDITION_VALUES|gradingProblem/.test(body),
      "the screen reaches for the domain's rule instead of asking the server");
    assert(/rawNeedsCondition/.test(body), "the screen does not ask before it sends");
  });
});

/* ============================================================== B
   One rule for what a grading pair MEANS, in the one place that already
   decides what a copy's status means. */
describe("B. what a grade means is the server's answer, carried on the row", () => {

  const COLLECTOR_PRESENT = build("client/collector/present.js");
  const TP_PRESENT = build("client/tp/present.js");

  test("every projected copy carries the reading, for both seats", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await own(ctx.app, "casey", { canonicalCardId: made.firstEdition, grade: "PSA 9", offered: true });
    await stock(ctx.app, "north", { canonicalCardId: made.firstEdition, grade: "Raw", condition: "Lightly Played" });

    const mine = await view(ctx.app, "casey");
    eq(mine.collectorCopies[0].grading.label, "PSA 9", "the owner's own copy");
    eq(mine.collectorCopies[0].grading.state, "graded");
    eq(mine.inventory[0].grading.label, "Raw · Lightly Played", "a partner's supply, as the Collector sees it");

    const theirs = await view(ctx.app, "north");
    eq(theirs.inventory[0].grading.label, "Raw · Lightly Played", "the partner's own shelf");
    eq(theirs.collectorCopies[0].grading.label, "PSA 9", "the Collector's offered copy, as the partner sees it");
  });

  test("a contradictory copy reports its contradiction instead of hiding it", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    /* Written the way one could have been written between C2 and C3.2: past
       the command layer, straight into the world, because the command refuses
       it now and the point is what happens to the rows that already exist. */
    const before = await load(ctx);
    await ctx.repository.saveWorld({ ...before, collectorCopies: [{ id: "b-old", collectorId: "c1",
      canonicalCardId: made.firstEdition, grade: "PSA 9", condition: "Damaged", offered: true,
      addedAt: "2030-01-01T00:00:00.000Z" }] });

    const mine = await view(ctx.app, "casey");
    const reading = mine.collectorCopies[0].grading;
    eq(reading.problem, "graded-has-condition", "the contradiction was not reported");
    eq(reading.condition, "Damaged", "one half of the contradiction was dropped");
    eq(reading.label, "PSA 9");
    /* And the presenters say both halves rather than the first one. */
    eq(COLLECTOR_PRESENT.gradeConflictLine(mine.collectorCopies[0]), "PSA 9 and Damaged");
    eq(TP_PRESENT.gradeConflictLine((await view(ctx.app, "north")).collectorCopies[0]),
      "PSA 9 and Damaged", "the partner pricing it is told too");
  });

  test("neither presenter decides grading any more", () => {
    for (const rel of ["client/collector/present.js", "client/tp/present.js",
      "client/tp/sections/Inventory.jsx", "client/collector/sections/MyCards.jsx"]) {
      assert(!/\/\^raw\$\/i/.test(code(rel)), `${rel} still carries its own raw-versus-graded rule`);
    }
    /* Asserted as behaviour as well as absence: a row with no reading is not
       parsed by some other route. */
    eq(COLLECTOR_PRESENT.gradeLine({ grade: "PSA 9" }), null);
    eq(TP_PRESENT.gradeLine({ grade: "PSA 9" }), null);
    eq(COLLECTOR_PRESENT.isGraded({ grade: "PSA 9" }), false);
  });

  test("an unstated copy stays unstated — it does not become Raw", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await own(ctx.app, "casey", { canonicalCardId: made.firstEdition });
    const copy = (await view(ctx.app, "casey")).collectorCopies[0];
    eq(copy.grading.state, "unstated");
    eq(copy.grading.label, null);
    eq(COLLECTOR_PRESENT.gradeLine(copy), null, "a copy nobody described was described");
    eq(COLLECTOR_PRESENT.isGraded(copy), false);
  });

  test("the reading crosses no privacy line: it is computed from fields already projected", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await own(ctx.app, "casey", { canonicalCardId: made.firstEdition, grade: "PSA 9",
      offered: true, market: 7777, note: "do not sell under 9k" });
    const seen = (await view(ctx.app, "north")).collectorCopies[0];
    const allowed = new Set([...FIELD_RULES.COLLECTOR_COPY_FOR_PARTNER, "status", "grading"]);
    for (const k of Object.keys(seen)) assert(allowed.has(k), `an unclassified field crossed: ${k}`);
    /* The reading is a function of `grade` and `condition` and of nothing else,
       so it cannot be a new route for anything the allow-list stopped. */
    eq(json(seen.grading), json(D.gradingRead({ grade: seen.grade, condition: seen.condition })),
      "the reading carries something the two stated fields do not imply");
    assert(!json(seen).includes("7777") && !json(seen).includes("do not sell"),
      "a private fact travelled inside the reading");
  });
});

run();
