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
/* A NEW COPY MUST SAY WHETHER ITS OWNER WOULD PART WITH IT (the disposition
   batch). This suite is about the Card Specification panel; the disposition is
   scaffolding in most of it and the subject of a few tests, which say so at the
   call site. The default applies ONLY when the caller named neither, so a
   caller that says `keeping` is never given `offered: true` underneath it. */
const own = (app, token, copy) => post(app, token, "addCollectorCopy",
  { copy: ("offered" in copy || "keeping" in copy) ? copy : { ...copy, offered: true } });
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
      "client/tp/sections/Inventory.jsx", "client/collector/sections/Collection.jsx"]) {
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

/* ============================================================== C
   What copy a Collector is after: stating it, and correcting it without
   losing the Goal that carries it. */
describe("C. a Goal says which copy is wanted, and can change its mind", () => {

  test("a canonical Goal must say, and says exactly what it was told", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    eq(refusal(await want(ctx.app, "casey", made.firstEdition, "primary")), "criteria-required");
    eq(refusal(await want(ctx.app, "casey", made.firstEdition, "primary", { desired: {} })),
      "criteria-required", "an empty object is not an answer");
    eq((await load(ctx)).goals.length, 0, "a refused Goal wrote something");

    eq(refusal(await want(ctx.app, "casey", made.firstEdition, "primary",
      { desired: { grade: "Raw" } })), "grading-incoherent", "Raw with no condition");
    eq(refusal(await want(ctx.app, "casey", made.firstEdition, "primary",
      { desired: { grade: "PSA 9", condition: "Damaged" } })), "grading-incoherent",
    "a graded target carrying a raw condition");

    eq(refusal(await want(ctx.app, "casey", made.firstEdition, "primary",
      { desired: { grade: "Raw", condition: "Near Mint" } })), null);
    eq(json((await load(ctx)).goals[0].desired), json({ grade: "Raw", condition: "Near Mint" }));
  });

  test("correcting the criteria keeps the Goal, its dates and its tier", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.firstEdition, "primary", { desired: { grade: "PSA 8" } });
    const before = (await load(ctx)).goals[0];

    eq((await post(ctx.app, "casey", "updateGoalCriteria",
      { goalId: before.id, desired: { grade: "PSA 10" } })).statusCode, 200);
    const after = (await load(ctx)).goals[0];
    eq(json(after.desired), json({ grade: "PSA 10" }), "the criteria did not change");
    eq(after.id, before.id, "the Goal is a different one");
    eq(after.canonicalCardId, before.canonicalCardId, "the card moved");
    eq(after.tier, before.tier, "the tier moved");
    eq(after.createdAt, before.createdAt, "when the Goal began was rewritten");
    eq(after.since, before.since, "how long it has been at this tier was rewritten");
    eq(after.confirmedAt, before.confirmedAt);
    eq(after.secondarySince, before.secondarySince);
    eq((await load(ctx)).goals.length, 1, "a second Goal appeared");
  });

  test("and it is refused the same way a creation is", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.firstEdition, "primary", { desired: { grade: "PSA 8" } });
    const id = (await load(ctx)).goals[0].id;
    for (const desired of [{ grade: "Raw" }, { grade: "PSA 9", condition: "Damaged" },
      { grade: 9 }, { grade: "PSA 9", nonsense: true }]) {
      eq(refusal(await post(ctx.app, "casey", "updateGoalCriteria", { goalId: id, desired })),
        "grading-incoherent", json(desired));
    }
    eq(json((await load(ctx)).goals[0].desired), json({ grade: "PSA 8" }), "a refusal changed it");
  });

  test("nobody else can change what somebody is looking for", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.firstEdition, "primary", { desired: { grade: "PSA 8" } });
    const id = (await load(ctx)).goals[0].id;
    eq(refusal(await post(ctx.app, "north", "updateGoalCriteria",
      { goalId: id, desired: { grade: "PSA 10" } })), "not-owner");
    eq(json((await load(ctx)).goals[0].desired), json({ grade: "PSA 8" }));
  });

  /* RE-PINNED, AND THIS ONE IS A PRODUCT REVERSAL RATHER THAN A CORRECTION.

     This test asserted that criteria CAN be corrected while a deal is under
     way, and it is titled "the case that decided the command" because it was:
     C3.3 chose an `updateGoalCriteria` command over remove-and-recreate
     precisely so that the one moment being precise about the copy matters would
     not be the one moment it was impossible.

     The object-identity audit found the other half of that argument. Nothing
     snapshots the criteria, and `startOpportunity` admits a copy by asking
     them — so an edit mid-deal leaves a shared record whose own admission gate
     can no longer be reproduced. The product's answer is that the record holds
     still, so `updateGoalCriteria` now refuses `goal-locked` like its two
     neighbours.

     WHAT THIS TEST STILL PROTECTS, unchanged and still the reason the command
     exists: correcting criteria must never mean destroying and recreating the
     Goal — `createdAt` is the first step of the only funnel this product has,
     and a partner must never watch demand disappear and come back as new. So
     the correction is still one command on one field, and it is asserted here
     once the deal is no longer live, which is the state a Collector reaches by
     cancelling or finishing. The cost is written down in the hand-back: mid-deal
     she must now choose between the deal and the correction. */
  test("criteria are corrected in place, never by recreating the Goal", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    /* The Goal states what the shop has, so the deal can open — since the
       true-match batch the criteria gate `startOpportunity` too, and this test
       is about CORRECTING criteria mid-deal, not about matching. */
    await want(ctx.app, "casey", made.firstEdition, "primary", { desired: { grade: "PSA 9" } });
    const goalId = (await load(ctx)).goals[0].id;
    const invId = (await stock(ctx.app, "north",
      { canonicalCardId: made.firstEdition, grade: "PSA 9", ask: 900 })).json().value;
    /* The COLLECTOR opens a negotiation on their own Goal — a partner cannot,
       and `startOpportunity` refuses `not-owner` if one tries. It opens at
       `agree-price`, which is what makes the Goal locked. */
    const opened = await direct(ctx, ACTOR.casey, "startOpportunity",
      { goalId, invId, amount: 800 });
    eq(opened.ok, true, "the deal did not start: " + json(opened));

    /* While the deal is live, BOTH are refused, and by the same rule. */
    eq(refusal(await post(ctx.app, "casey", "removeGoal", { goalId })), "goal-locked");
    eq(refusal(await post(ctx.app, "casey", "updateGoalCriteria",
      { goalId, desired: { grade: "PSA 10" } })), "goal-locked",
    "criteria were rewritten underneath a live deal");
    eq(json((await load(ctx)).goals[0].desired), json({ grade: "PSA 9" }),
      "they changed anyway");

    /* Once it is not, the correction is IN PLACE — which is the property this
       test was written for and the one that has not changed. */
    const oppId = (await load(ctx)).opportunities[0].id;
    eq((await direct(ctx, ACTOR.casey, "cancelOpportunity",
      { oppId, reason: "the shop sold it" })).ok, true, "the deal did not end");
    const before = (await load(ctx)).goals[0];
    eq((await post(ctx.app, "casey", "updateGoalCriteria",
      { goalId, desired: { grade: "PSA 10" } })).statusCode, 200,
    "a Collector could not say which copy they are after");
    const after = (await load(ctx)).goals[0];
    eq(json(after.desired), json({ grade: "PSA 10" }), "the correction did not land");
    /* THE SAME GOAL, not a new one: the id stands, and so does every timestamp
       that remove-and-recreate would have destroyed. */
    eq(after.id, before.id, "the Goal was recreated");
    eq(after.createdAt, before.createdAt, "createdAt was overwritten");
    eq(after.since, before.since, "since was overwritten");
    eq((await load(ctx)).goals.length, 1, "a second Goal appeared");
    /* And the deal's own record still names it. */
    eq((await load(ctx)).opportunities.length, 1);
    eq((await load(ctx)).opportunities[0].goalId, goalId);
  });

  test("RE-PINNED: criteria ARE a filter, and Discovery reads them", async () => {
    /* C3.3 pinned the opposite — criteria were context a person weighed, so a
       PSA 10 want surfaced a Heavily Played Raw copy. The true-match batch
       reversed it: a stated criterion is a criterion. C3.3's real subject, the
       specification panel writing four independent facts, is untouched. */
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.firstEdition, "primary", { desired: { grade: "PSA 10" } });
    await stock(ctx.app, "north",
      { canonicalCardId: made.firstEdition, grade: "Raw", condition: "Heavily Played", ask: 40 });
    eq((await view(ctx.app, "casey")).discoveries.length, 0,
      "a copy that does not match the stated criteria is not an answer");
    /* And the other way round. */
    const ctx2 = await world();
    const made2 = await cards(ctx2);
    await want(ctx2.app, "casey", made2.firstEdition, "secondary",
      { desired: { grade: "Raw", condition: "Near Mint" } });
    await stock(ctx2.app, "north", { canonicalCardId: made2.firstEdition, grade: "PSA 8", ask: 5000 });
    eq((await view(ctx2.app, "casey")).discoveries.length, 0);
    /* Supply that IS what was asked for still overlaps, so this proves
       exclusion rather than proving nothing ever matches. */
    await stock(ctx2.app, "north",
      { canonicalCardId: made2.firstEdition, grade: "Raw", condition: "Near Mint", ask: 5000 });
    eq((await view(ctx2.app, "casey")).discoveries.length, 1,
      "the copy she described is still an answer");
    /* A different printing still discovers nothing — the exact rule is intact. */
    const ctx3 = await world();
    const made3 = await cards(ctx3);
    await want(ctx3.app, "casey", made3.firstEdition, "primary", { desired: { grade: "PSA 9" } });
    await stock(ctx3.app, "north", { canonicalCardId: made3.unlimited, grade: "PSA 9", ask: 900 });
    eq((await view(ctx3.app, "casey")).discoveries.length, 0, "the exact-card rule was loosened");
    assert(/meetsGoalCriteria/.test(code("domain/metyet-discovery.js")),
      "Discovery stopped asking the domain's criteria predicate");
  });

  /* THE GOALS SCREEN STAYS LIGHTWEIGHT (§3.1). Prioritisation is "how hard am I
     looking?" and specification is "which copy, where does it belong, what do I
     own?" — two questions, two surfaces, and the simple one is not made to ask
     the hard one's question. */
  test("the Goals screen's tier flip still works, and invents no criteria", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    /* A Goal written before C3.3, with none — the historical shape. */
    const before = await load(ctx);
    await ctx.repository.saveWorld({ ...before, goals: [{ id: "g-old", collectorId: "c1",
      canonicalCardId: made.firstEdition, tier: "secondary", note: "",
      since: "2030-01-01T00:00:00.000Z", createdAt: "2030-01-01T00:00:00.000Z" }] });

    eq((await post(ctx.app, "casey", "updateGoalTier",
      { goalId: "g-old", tier: "primary" })).statusCode, 200,
    "the lightweight tier flip stopped working on a historical Goal");
    const after = (await load(ctx)).goals[0];
    eq(after.tier, "primary");
    assert(!("desired" in after), "a preference was invented for somebody who never stated one");
    assert(validateWorld(await load(ctx)).ok);

    /* And removing it still works too. */
    eq((await post(ctx.app, "casey", "removeGoal", { goalId: "g-old" })).statusCode, 200);
  });

  test("a canonical Goal cannot be emptied back to unstated; a legacy one can", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.firstEdition, "primary", { desired: { grade: "PSA 8" } });
    const id = (await load(ctx)).goals[0].id;
    eq(refusal(await post(ctx.app, "casey", "updateGoalCriteria", { goalId: id, desired: null })),
      "criteria-required", "a canonical Goal was emptied back to a state the product no longer creates");

    /* The legacy path has no such rule, because the prototype never had
       criteria to state. Exercised past the door: `cardId` Goals are the demo's
       and are not reachable from the Collector app. */
    const seeded = await load(ctx);
    await ctx.repository.saveWorld({ ...seeded,
      catalog: [{ id: "k1", name: "Legacy", set: "Demo", num: "1/1" }],
      goals: [...seeded.goals, { id: "g-legacy", collectorId: "c1", cardId: "k1",
        tier: "secondary", note: "", since: "2030-01-01T00:00:00.000Z",
        createdAt: "2030-01-01T00:00:00.000Z", desired: { grade: "PSA 9" } }] });
    const cleared = await direct(ctx, ACTOR.casey, "updateGoalCriteria",
      { goalId: "g-legacy", desired: null });
    eq(cleared.ok, true, "a legacy Goal could not be cleared");
    assert(!("desired" in (await load(ctx)).goals.find((g) => g.id === "g-legacy")),
      "clearing left an answer shaped like an absence");
  });
});

/* ============================================================== D
   The five doors C3.3 opened, and the rules that did not move with them. */
describe("D. the production door, and what is still shut", () => {

  /* SUPERSEDED AND RESTATED BY C3.4.

     What it protected: that C3.3 opened five doors and exactly five, so a
     command could not reach a browser without a batch deciding to let it.

     Why it is no longer correct: C3.4 built the Binder screen, and a screen
     that can put a binder away and bring it back needs `setBinderArchived`;
     one that can correct a binder's name needs `renameBinder`. Fourteen is
     C3.3's number, not the allow-list's forever.

     What replaces it, and why it is stricter: the same pin by value AND by
     count at sixteen, and C3.3's own claim — that IT opened five — is now
     asserted against C3.3's own commit below, where later batches cannot
     silently erase it. */
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
      /* AND THE TWO BATCH 3A ADDED. `fileObject` and `unfileObject` file one
         GOAL or one COLLECTORCOPY in a binder, which is where membership is
         going — `addBinderEntry` above files a CARD, and is what every
         Collector screen still sends. Both doors are open at once on purpose:
         the screens move across in 3B, and a per-card checkbox cannot express
         three homes for one card. */
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

  /* C3.3's OWN CLAIM, moved here when C3.4 superseded the count above. C3.3
     opened five doors and exactly five; that is a fact about C3.3's commit and
     stays true however far the allow-list travels afterwards. Asserted against
     the merge C3.3 shipped, so no later batch can quietly rewrite what C3.3
     did. */
  test("C3.3 itself opened five doors and exactly five", () => {
    const { execFileSync } = require("child_process");
    const at = execFileSync("git", ["show", "8c61ec8:server/exposed-commands.js"],
      { cwd: ROOT, encoding: "utf8" });
    /* Only the list literal: everything after `]);` is ordinary code, and a
       `typeof x === "string"` would otherwise count as a command. */
    const after = at.split("EXPOSED_COMMANDS")[1] || "";
    const names = after.slice(0, after.indexOf("]);")).match(/"[a-zA-Z]+"/g) || [];
    eq(names.length, 14, "C3.3 did not ship fourteen");
    for (const name of ["updateCollectorCopy", "updateGoalCriteria"]) {
      assert(names.includes(`"${name}"`), `C3.3 did not open ${name}`);
    }
    for (const name of ["renameBinder", "setBinderArchived", "markBinderReviewed"]) {
      assert(!names.includes(`"${name}"`), `C3.3 opened ${name}`);
    }
  });

  /* SUPERSEDED AND RESTATED BY C3.4.

     What it protected: that the binder lifecycle and the deal lifecycle were
     both still shut, so C3.3 could not be read as having opened either.

     Why it is no longer correct for the binder half: C3.4 built the screen that
     manages a binder as an object, and opened `renameBinder` and
     `setBinderArchived` with it. The deal half has not moved at all.

     What replaces it, and why it is stricter: the deal lifecycle stays pinned
     exactly as it was, and `markBinderReviewed` — the one binder-named command
     C3.4 deliberately left shut, because it is the legacy "a partner opened
     this Collector's cards" command and has nothing to do with a Binder but its
     name — is named here explicitly rather than swept up in a list, so closing
     the Binder screen's doors cannot be mistaken for closing it too. */
  test("the deal lifecycle is still shut, and so is markBinderReviewed", async () => {
    const ctx = await world();
    for (const name of ["startOpportunity", "proposePrice", "acceptDeal",
      "resolveCardIdentity", "setInterest", "markBinderReviewed"]) {
      assert(!EXPOSED_COMMANDS.includes(name), `${name} is exposed`);
      eq((await post(ctx.app, "casey", name, {})).json().error.refused, "command-unavailable", name);
    }
  });

  test("createBinder: a partner cannot, a blank name cannot, and the owner is the caller", async () => {
    const ctx = await world();
    eq(refusal(await post(ctx.app, "north", "createBinder", { name: "Theirs" })), "not-owner");
    eq(refusal(await post(ctx.app, "casey", "createBinder", { name: "  " })), "name-required");
    /* An owner named in the payload is ignored: ownership comes from the token. */
    const id = (await post(ctx.app, "casey", "createBinder",
      { name: "Mudkip Collection", collectorId: "somebody-else" })).json().value;
    const made = (await load(ctx)).binders.find((b) => b.id === id);
    eq(made.collectorId, "c1", "a payload named the owner");
    eq(made.name, "Mudkip Collection");
    eq(made.archivedAt, null);
  });

  test("addBinderEntry / removeBinderEntry: owner only, and the catalog guard runs", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const mine = (await post(ctx.app, "casey", "createBinder", { name: "Mine" })).json().value;

    eq(refusal(await post(ctx.app, "north", "addBinderEntry",
      { binderId: mine, canonicalCardId: made.firstEdition })), "not-owner");
    eq(refusal(await post(ctx.app, "second", "removeBinderEntry",
      { binderId: mine, canonicalCardId: made.firstEdition })), "not-owner");
    /* The guard C3.1 wrote for the batch that would open this door. */
    eq(refusal(await post(ctx.app, "casey", "addBinderEntry",
      { binderId: mine, canonicalCardId: "not-a-card" })), "card-unavailable");
    eq((await load(ctx)).binderEntries.length, 0);

    /* And the card has to mean something before it can be filed (the four-state
       batch), so this says the smallest true thing first. */
    await want(ctx.app, "casey", made.firstEdition, "secondary", { desired: { grade: "PSA 9" } });
    eq((await post(ctx.app, "casey", "addBinderEntry",
      { binderId: mine, canonicalCardId: made.firstEdition })).statusCode, 200);
    /* Idempotent, and the first addedAt stands. */
    const first = (await load(ctx)).binderEntries[0].addedAt;
    eq((await post(ctx.app, "casey", "addBinderEntry",
      { binderId: mine, canonicalCardId: made.firstEdition })).statusCode, 200);
    eq((await load(ctx)).binderEntries.length, 1, "filing a filed card made a second entry");
    eq((await load(ctx)).binderEntries[0].addedAt, first, "re-filing restamped it");
  });

  test("unfiling removes organisation and nothing else", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const mine = (await post(ctx.app, "casey", "createBinder", { name: "Mine" })).json().value;
    await post(ctx.app, "casey", "addBinderEntry", { binderId: mine, canonicalCardId: made.firstEdition });
    await want(ctx.app, "casey", made.firstEdition, "primary", { desired: { grade: "PSA 9" } });
    const copyId = (await own(ctx.app, "casey",
      { canonicalCardId: made.firstEdition, grade: "PSA 9", offered: true })).json().value;

    eq((await post(ctx.app, "casey", "removeBinderEntry",
      { binderId: mine, canonicalCardId: made.firstEdition })).statusCode, 200);
    const w = await load(ctx);
    eq(w.binderEntries.length, 0);
    eq(w.goals.length, 1, "unfiling removed the Goal");
    eq(w.collectorCopies.length, 1, "unfiling removed the copy");
    eq(w.collectorCopies[0].offered, true, "unfiling withdrew the offer");
    eq(w.binders.length, 1, "unfiling removed the binder");
    eq(copyId, w.collectorCopies[0].id);
  });

  test("updateGoalCriteria and updateCollectorCopy are reachable, and refuse the wrong seat", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.firstEdition, "primary", { desired: { grade: "PSA 9" } });
    const goalId = (await load(ctx)).goals[0].id;
    const copyId = (await own(ctx.app, "casey",
      { canonicalCardId: made.firstEdition, grade: "PSA 9" })).json().value;

    eq(refusal(await post(ctx.app, "north", "updateGoalCriteria",
      { goalId, desired: { grade: "PSA 1" } })), "not-owner");
    eq(refusal(await post(ctx.app, "north", "updateCollectorCopy",
      { copyId, patch: { cert: "X" } })), "not-owner");
    eq(refusal(await post(ctx.app, "casey", "updateCollectorCopy",
      { copyId, patch: { offered: true } })), "identity-immutable",
    "offering rode in on an edit");
    eq(refusal(await post(ctx.app, "casey", "updateCollectorCopy",
      { copyId, patch: { canonicalCardId: made.unlimited } })), "identity-immutable");
    eq(refusal(await post(ctx.app, "casey", "updateCollectorCopy",
      { copyId, patch: { condition: "Damaged" } })), "grading-incoherent",
    "the merged record was not checked");
    eq((await post(ctx.app, "casey", "updateCollectorCopy",
      { copyId, patch: { grade: "Raw", condition: "Near Mint" } })).statusCode, 200);
  });

  test("an unauthenticated caller reaches none of the five", async () => {
    const ctx = await world();
    for (const name of ["createBinder", "addBinderEntry", "removeBinderEntry",
      "updateCollectorCopy", "updateGoalCriteria"]) {
      const res = await ctx.app.inject({ method: "POST", url: "/api/commands",
        payload: { command: name, payload: {} } });
      eq(res.statusCode, 401, name);
    }
    eq((await load(ctx)).binders.length, 0);
  });
});

/* ============================================================== E
   The panel: what it shows when it opens, and what it refuses to write.

   A NOTE ON WHAT "THE GRID STAYED PUT" MEANS HERE. `react-test-renderer` has
   no DOM and no scroll, so no test below claims a pixel position. What IS
   provable is the mechanism that makes the position survive: the grid is never
   unmounted, no fetch re-fires, the browsing session is not rewritten, and the
   panel is rendered AFTER the grid and out of flow rather than above it. Those
   four together are why there is nothing to restore — and asserting them is
   honest, where asserting "the scroll was preserved" would not be. */
describe("E. the panel shows current truth, and writes nothing until Save", () => {

  const SHELL = build("client/collector/CollectorShell.jsx").default;
  const SPEC = build("client/collector/CardSpecification.jsx");

  const browsing = async (ctx, onSpecify, token = "casey") => {
    const state = await view(ctx.app, token);
    const { door, calls } = doorFor(ctx);
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(SHELL,
        { state, onSignOut() {}, onSpecify, onBrowseCards: door }));
    });
    return { r, calls, state };
  };

  const openCard = async (r, name) => {
    await typeInto(r, "mcs-br-q", name);
    await press(r, name);
  };

  test("a card nobody has said anything about opens honestly empty", async () => {
    const ctx = await world();
    await cards(ctx);
    const { r } = await browsing(ctx, async () => ({ ok: true }));
    await openCard(r, "Mudkip");
    const shown = texts(r);
    assert(/You haven’t made any binders yet/.test(shown), "binders: " + shown);
    assert(/You haven’t recorded a copy of this card/.test(shown), "copies: " + shown);
    /* Not looking is the state of a card nobody has said anything about — and
       the grade control is not shown at all, because there is nothing to
       describe until somebody says they are looking. */
    const notLooking = buttons(r).find((b) => instText(b).trim() === "Not looking");
    eq(notLooking.props["aria-pressed"], true, "a card nobody wants opened as wanted");
    assert(!selectNamed(r, "Grade wanted"), "a preference was asked for before a want");
    /* And no blank copy form: a pre-filled one answers "how many do you own"
       with "one" on the person's behalf. */
    assert(!selectNamed(r, "Grade"), "a blank copy row was created for somebody");
  });

  test("a card with everything on it opens showing all of it", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const bindA = (await post(ctx.app, "casey", "createBinder", { name: "Mudkip Collection" })).json().value;
    const bindB = (await post(ctx.app, "casey", "createBinder", { name: "Keepers" })).json().value;
    await post(ctx.app, "casey", "createBinder", { name: "Untouched" });
    await want(ctx.app, "casey", made.mudkip, "secondary", { desired: { grade: "Raw", condition: "Lightly Played" } });
    await post(ctx.app, "casey", "addBinderEntry", { binderId: bindA, canonicalCardId: made.mudkip });
    await post(ctx.app, "casey", "addBinderEntry", { binderId: bindB, canonicalCardId: made.mudkip });
    await own(ctx.app, "casey", { canonicalCardId: made.mudkip, grade: "PSA 9", cert: "PSA 111", market: 500, offered: true });
    await own(ctx.app, "casey",
      { canonicalCardId: made.mudkip, grade: "Raw", condition: "Damaged", cert: "SER-2", keeping: true });

    const { r, state } = await browsing(ctx, async () => ({ ok: true }));
    await openCard(r, "Mudkip");
    const shown = texts(r);

    /* The panel reads the projection: assert the ANSWERS it derived, which is
       what the controls are bound to, rather than scraping labels. */
    const answers = SPEC.initialAnswers(state, made.mudkip);
    eq(json([...answers.binders].sort()), json([bindA, bindB].sort()), "binder membership");
    eq(answers.want, "secondary", "the tier");
    eq(json(answers.desired), json({ grade: "Raw", condition: "Lightly Played" }), "the criteria");
    eq(answers.copies.length, 2, "both copies");
    eq(answers.copies[0].cert, "PSA 111");
    eq(answers.copies[0].disposition, "offered",
      "a copy on offer opens showing that, in the form the panel's buttons use");
    eq(answers.copies[1].cert, "SER-2");
    /* RE-PINNED: the second copy is KEPT rather than silent, because a new copy
       must say which. What this asserts is unchanged and is the reason the
       disposition lives on the copy: two copies of one card open showing two
       different answers. */
    eq(answers.copies[1].disposition, "keeping",
      "a copy its owner is keeping opens showing that — disposition is per copy");

    assert(/Mudkip Collection/.test(shown) && /Keepers/.test(shown) && /Untouched/.test(shown),
      "every binder is offered, not only the ones this card is in: " + shown);
    const keeping = buttons(r).find((b) => instText(b).trim() === "Keeping an eye out");
    eq(keeping.props["aria-pressed"], true, "the tier was not shown");
    /* And Save has nothing to do, because nothing has been changed. */
    const save = buttons(r).find((b) => instText(b).trim() === "Save");
    assert(save.props.disabled, "an unchanged card offered to write something");
  });

  test("a Goal with no criteria opens EMPTY — never Raw, never Near Mint", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const before = await load(ctx);
    await ctx.repository.saveWorld({ ...before, goals: [{ id: "g-old", collectorId: "c1",
      canonicalCardId: made.mudkip, tier: "primary", note: "",
      since: "2030-01-01T00:00:00.000Z", createdAt: "2030-01-01T00:00:00.000Z" }] });
    const { r, state } = await browsing(ctx, async () => ({ ok: true }));
    await openCard(r, "Mudkip");

    const answers = SPEC.initialAnswers(state, made.mudkip);
    eq(answers.want, "primary");
    eq(json(answers.desired), json({ grade: "", condition: "" }),
      "a preference was invented for a Collector who never stated one");
    assert(/You haven't said which copy you're after/.test(texts(r)),
      "the panel did not say the criteria are unstated: " + texts(r));
    /* And it cannot be saved until they say — the rule arrives where the means
       to satisfy it is. */
    const save = buttons(r).find((b) => instText(b).trim() === "Save");
    assert(save.props.disabled, "a legacy Goal could be re-saved with no criteria");
  });

  test("opening, editing and cancelling write nothing at all", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await post(ctx.app, "casey", "createBinder", { name: "Mudkip Collection" });
    const before = json(await load(ctx));
    const sent = [];
    const { r, calls } = await browsing(ctx, async (step) => { sent.push(step); return { ok: true }; });

    await openCard(r, "Mudkip");
    /* Tick a binder, choose a want, state a grade, add a copy, offer it. */
    const box = r.root.findAll((n) => n.type === "input").find((n) => n.props.type === "checkbox");
    await TR.act(async () => { box.props.onChange({ target: { checked: true } }); });
    await press(r, "Actively hunting");
    await choose(r, "Grade wanted", "PSA 10");
    await press(r, "I own one of these");
    await choose(r, "Grade", "PSA 9");
    await press(r, "Cancel");

    eq(sent.length, 0, "the panel sent a command before Save");
    eq(json(await load(ctx)), before, "the world changed without anybody pressing Save");
    eq(calls.describe, 0, "and nothing was even described");
    /* Browsing alone still produces no discovery — C1's rule, on a bigger
       surface that now has far more ways to be tempted. */
    eq((await view(ctx.app, "casey")).discoveries.length, 0);
  });

  test("the grid is never unmounted, never refetched, and the session is untouched", async () => {
    const ctx = await world();
    await cards(ctx);
    const { r, calls } = await browsing(ctx, async () => ({ ok: true }));
    await typeInto(r, "mcs-br-q", "Mudkip");
    const afterSearch = calls.find;
    const gridText = texts(r);
    assert(gridText.includes("Mudkip"), "the grid did not fill");

    await press(r, "Mudkip");
    await press(r, "Cancel");
    await press(r, "Mudkip");
    await press(r, "Cancel");

    eq(calls.find, afterSearch,
      "the catalog was asked again — the grid remounted, and a person's place with it");
    assert(texts(r).includes("Mudkip"), "the results are gone after a round trip");
    /* The search box still holds what was typed: the session lives above the
       section and nothing here rewrites it. */
    const input = r.root.findAll((n) => n.type === "input").find((n) => n.props.id === "mcs-br-q");
    eq(input.props.value, "Mudkip", "the browsing session was rewritten");
  });

  test("the sheet is rendered after the grid and out of flow, so nothing moves behind it", async () => {
    const ctx = await world();
    await cards(ctx);
    const { r } = await browsing(ctx, async () => ({ ok: true }));
    await openCard(r, "Mudkip");

    /* ORDER IS THE MECHANISM. A panel inserted BEFORE the grid pushes it down
       the page while the window's scroll offset stays put, which is exactly the
       jump C3.3 set out to remove. Asserted on the rendered tree rather than on
       the source. */
    const classes = [];
    const walk = (n) => {
      if (!n || typeof n !== "object") return;
      if (n.props && typeof n.props.className === "string") classes.push(n.props.className);
      (n.children || []).forEach(walk);
    };
    walk(r.toJSON());
    const grid = classes.findIndex((c) => c.split(" ").includes("mcs-br"));
    const sheet = classes.findIndex((c) => c.split(" ").includes("mcs-spec-scrim"));
    assert(grid >= 0, "the grid is not rendered");
    assert(sheet >= 0, "the sheet is not rendered");
    assert(grid < sheet, "the sheet is rendered above the grid and would push it down the page");

    /* And it is taken out of flow by the stylesheet rather than by luck. */
    const css = read("client/collector/CollectorShell.jsx");
    assert(/\.mcs-spec-scrim\s*\{[^}]*position:fixed/.test(css.replace(/\s+/g, " ").replace(/ \{/g, "{")),
      "the sheet is not out of flow");
    /* NO SCROLL RESTORATION WAS BUILT, and none should have been: there is
       nothing to restore when nothing moves. */
    assert(!/scrollTo|scrollTop|scrollIntoView|scrollY|scrollRestoration/.test(code("client/collector/sections/Browse.jsx")
      + code("client/collector/CardSpecification.jsx") + code("client/collector/CollectorShell.jsx")),
    "scroll-restoration machinery was built for a problem that was removed instead");
  });

  test("the panel is composition: no store, no api, no domain, no command names", () => {
    const bare = code("client/collector/CardSpecification.jsx");
    assert(!/require\(|from ["']\.\.\/\.\.\/domain|metyet-commands|projectForActor/.test(bare),
      "the panel reaches the domain");
    assert(!/store\.|api\.|createApiClient|createProductionStore|fetch\(/.test(bare),
      "the panel holds a store or an api client");
    assert(!/execute\s*\(|\.command\s*\(/.test(bare), "the panel has a way to write");
    for (const name of EXPOSED_COMMANDS) {
      assert(!new RegExp(`["']${name}["']`).test(bare),
        `the panel names the command ${name} rather than calling what it was handed`);
    }
    /* And no new durable concept was invented to hold the answers. */
    assert(!/saveCardSpecification|specification[A-Z]|intent/i.test(code("domain/metyet-commands.js")
      .split("updateGoalCriteria")[0].slice(-2000) + ""), "an orchestration command appeared");
    assert(!C.COMMAND_NAMES.includes("saveCardSpecification"), "an aggregate command was added");
  });
});

/* ============================================================== F
   The commit: a difference, in an order chosen for what a failure leaves
   behind, and a retry that sends only what is left. */
describe("F. one button, a sequence of commands that already existed", () => {

  const SPEC = build("client/collector/CardSpecification.jsx");
  const SHELL = build("client/collector/CollectorShell.jsx").default;

  /* The entrance's own mapping, kept here so a test drives the real sequence
     rather than a paraphrase of it. `client/sign-in/SignIn.jsx` holds the
     production copy; a test below asserts the two name the same steps. */
  const runStep = (ctx, token) => async (step, canonicalCardId) => {
    const send = (command, payload) => post(ctx.app, token, command, payload);
    const answer = async (res) => (res.statusCode === 200
      ? { ok: true, value: res.json().value }
      : { ok: false, refused: res.json().error.refused });
    switch (step.kind) {
      case "make-binder": return answer(await send("createBinder", { name: step.name }));
      case "file": return answer(await send("addBinderEntry", { binderId: step.binderId, canonicalCardId }));
      case "unfile": return answer(await send("removeBinderEntry", { binderId: step.binderId, canonicalCardId }));
      case "wanted-copy": return answer(await send("updateGoalCriteria", { goalId: step.goalId, desired: step.desired }));
      case "how-hard": return answer(await send("updateGoalTier", { goalId: step.goalId, tier: step.tier }));
      case "stop-looking": return answer(await send("removeGoal", { goalId: step.goalId }));
      case "start-looking": return answer(await send("addGoal", { canonicalCardId, tier: step.tier, desired: step.desired }));
      case "correct-copy": return answer(await send("updateCollectorCopy", { copyId: step.copyId, patch: step.patch }));
      case "offering": return answer(await send("setCollectorCopyOffered", { copyId: step.copyId, offered: step.offered }));
      case "forget-copy": return answer(await send("removeCollectorCopy", { copyId: step.copyId }));
      case "record-copy": return answer(await send("addCollectorCopy", { copy: { canonicalCardId, ...step.copy } }));
      default: return { ok: false, refused: "command-unavailable" };
    }
  };

  const ORDER = ["make-binder", "file", "unfile", "wanted-copy", "how-hard",
    "stop-looking", "start-looking", "correct-copy", "offering", "forget-copy", "record-copy"];

  test("the panel and the entrance name exactly the same steps", () => {
    const entrance = code("client/sign-in/SignIn.jsx");
    const panel = code("client/collector/CardSpecification.jsx");
    for (const kind of ORDER) {
      assert(new RegExp(`case "${kind}"`).test(entrance), `the entrance cannot map "${kind}"`);
      assert(new RegExp(`kind: "${kind}"`).test(panel) || kind === "unfile" || kind === "file",
        `the panel never produces "${kind}"`);
    }
    /* And nothing the panel can produce is unmapped. */
    const produced = [...panel.matchAll(/kind: "([a-z-]+)"/g)].map((m) => m[1]);
    for (const kind of new Set(produced)) {
      assert(new RegExp(`case "${kind}"`).test(entrance), `the entrance cannot map "${kind}"`);
    }
  });

  test("a full specification commits as one ordered sequence of existing commands", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const state0 = await view(ctx.app, "casey");
    const answers = {
      ...SPEC.initialAnswers(state0, made.mudkip),
      newBinders: ["Mudkip Collection"],
      want: "primary",
      desired: { grade: "Raw", condition: "Near Mint" },
      copies: [{ ...{ id: null, grade: "PSA 9", condition: "", cert: "PSA 900", market: "500",
        disposition: "offered", removed: false }, key: "new-1" }],
    };
    const plan = SPEC.planFrom(state0, made.mudkip, answers);
    /* RE-PINNED (Batch 3A), AND THE DEFECT IS IN THE DIFFERENCE. The panel used
       to emit `make-binder` for a brand-new binder and NOTHING ELSE: the binder
       was created and this card was never put in it, because the filing step
       could only name a binder that already had an id. A new binder now emits
       both. The `file` is last here only because this fixture has no
       corrections — section 3 of `planFrom` puts filing in the group that can
       fail only on its own terms, AHEAD of the three a deal can refuse, which
       is what the next test measures. */
    eq(plan.steps.map((s) => s.kind).join(","), "make-binder,record-copy,start-looking,file",
      "the sequence is not what the panel declared");

    const send = runStep(ctx, "casey");
    /* BINDING THE MINTED ID, BECAUSE THIS TEST DRIVES `planFrom` RATHER THAN
       THE COMPONENT. A new binder's `file` step carries a draft handle, not an
       id; `commit` in CardSpecification resolves it from the answer the
       `make-binder` step returned, and the component doing that is proved
       against the real mounted panel in phase5-binder-object-membership. Here
       the harness stands in for it, in three lines, the same way the retry test
       below stands in for `adopt`. */
    const minted = new Map();
    for (const step of plan.steps) {
      const needsId = step.binderDraftId && step.kind !== "make-binder";
      const sending = needsId ? { ...step, binderId: minted.get(step.binderDraftId) } : step;
      assert(!needsId || sending.binderId, `${step.kind} named an unresolved handle`);
      const answer = await send(sending, made.mudkip);
      eq(answer.ok, true, `${step.kind}: ${answer.refused}`);
      if (step.binderDraftId && step.kind === "make-binder") minted.set(step.binderDraftId, answer.value);
    }

    const w = await load(ctx);
    eq(w.binders.length, 1);
    eq(w.binders[0].name, "Mudkip Collection");
    /* THE CARD IS ACTUALLY IN IT. Before Batch 3A this was zero, and every
       assertion in this test passed anyway — the binder existed, so the panel
       looked right, and the card was simply not in it. */
    eq(w.binderEntries.length, 1, "the new binder was created empty");
    eq(w.binderEntries[0].binderId, w.binders[0].id, "the card was filed somewhere else");
    eq(w.binderEntries[0].canonicalCardId, made.mudkip, "a different card was filed");
    eq(w.goals.length, 1);
    eq(json(w.goals[0].desired), json({ grade: "Raw", condition: "Near Mint" }));
    eq(w.collectorCopies.length, 1);
    eq(w.collectorCopies[0].grade, "PSA 9", "the copy's own grading, not the Goal's");
    eq(w.collectorCopies[0].offered, true);
    assert(validateWorld(w).ok, "the world is invalid after a full commit");
    /* NO AGGREGATE WAS CREATED. Four facts, four kinds of record, and nothing
       that joins them. */
    assert(!("cardSpecifications" in w), "a new collection appeared");
  });

  /* THE ORDER IS THE POINT OF THIS SECTION, AND IT HAS CHANGED TWICE.

     It was organisation first, because filing is the most reversible thing on
     the panel. Then a card with no state could not be filed, so state had to
     come first. That rule is withdrawn, and what decides the order now is the
     only thing that was ever really at stake: `commit` stops at the first
     refusal, so the order decides what a person LOSES when one statement is
     refused.

     Three commands can be refused for something that is not about what they
     say — `updateGoalCriteria` and `updateGoalTier` answer `goal-locked`, and
     `updateCollectorCopy` answers `copy-committed` once a deal has taken the
     copy. Everything else answers only for itself. So the property is:
     containers, then everything refusable only for itself, then those three,
     then removals last of all — because a sequence that stops should leave a
     person with more said about their card than they started with, never less.
     New physical copies are still created before anything can depend on them,
     because a duplicate copy is a legitimate thing to own and nothing
     downstream can tell an accidental resend from a real second copy. */
  test("what only answers for itself goes first, then what a deal can refuse", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const bind = (await post(ctx.app, "casey", "createBinder", { name: "Old" })).json().value;
    /* Order no longer matters for legality here — filing is refused for
       nothing but a binder that is not yours — so this is just a fixture. */
    await want(ctx.app, "casey", made.mudkip, "secondary", { desired: { grade: "PSA 8" } });
    await post(ctx.app, "casey", "addBinderEntry", { binderId: bind, canonicalCardId: made.mudkip });
    /* RE-PINNED: the stored copy is KEPT rather than silent — a new copy must
       say which — so the draft's "offered" below is still a real switch and the
       plan still contains the `offering` step this test orders. */
    const copyId = (await own(ctx.app, "casey",
      { canonicalCardId: made.mudkip, grade: "PSA 9", cert: "A", keeping: true })).json().value;

    /* A SECOND BINDER, SO THE PLAN ACTUALLY CONTAINS A FILING. Without one this
       test asserted the file-comes-after-saying rule inside an `if` that could
       never be true, which is an assertion that asserts nothing — and the rule
       it was guarding is the load-bearing one: a card is filed only after the
       Goal or copy that makes the filing legal has been written. */
    const bind2 = (await post(ctx.app, "casey", "createBinder", { name: "New Home" })).json().value;

    const state = await view(ctx.app, "casey");
    const answers = {
      binders: new Set([bind2]), newBinders: ["Brand New"],
      want: "primary", desired: { grade: "PSA 10", condition: "" },
      copies: [
        { id: copyId, grade: "PSA 9", condition: "", cert: "B", market: "", disposition: "offered", removed: false },
        /* RE-PINNED: a new copy's draft must name a disposition — the panel will
           not let one be saved without one — so the sentinel is gone from here. */
        { id: null, key: "new-1", grade: "Raw", condition: "Damaged", cert: "", market: "",
          disposition: "keeping", removed: false },
      ],
    };
    const kinds = SPEC.planFrom(state, made.mudkip, answers).steps.map((s) => s.kind);
    /* RE-PINNED (Batch 3A): TWO filings, because there are two binders. "New
       Home" already exists and is ticked, and "Brand New" is being created in
       this same Save — and before 3A only the first of those produced a `file`,
       so the binder the person made in this very plan was left empty. Two
       binders, two filings is the rule stated as a count. */
    eq(kinds.join(","),
      "make-binder,offering,record-copy,file,file,unfile,correct-copy,wanted-copy,how-hard",
      "the commit order moved");
    /* STATED AS THE RULE RATHER THAN AS THIS FIXTURE'S ARITHMETIC. The first
       version counted `file` against `make-binder + 1`, which holds here only
       because there happens to be exactly one existing unfiled ticked binder —
       it would have passed just as well if BOTH filings had named the new
       binder and the existing one had been skipped, which is the half of the
       defect it was supposed to rule out. So it asserts what the filings
       actually name: every ticked binder that does not already hold this card,
       and every binder being created in this same Save, exactly once each. */
    const plan = SPEC.planFrom(state, made.mudkip, answers).steps;
    const filings = plan.filter((st) => st.kind === "file");
    eq(filings.filter((st) => st.binderId === bind2).length, 1, "the existing binder was not filed into");
    eq(filings.filter((st) => st.binderDraftId === "new-binder-0").length, 1,
      "the binder being created in this Save was not filed into");
    eq(filings.length, 2, `the plan filed ${JSON.stringify(filings)}`);
    /* Stated as the properties rather than only as the literal, so the reasons
       survive a future reordering of the middle. */
    eq(kinds[0], "make-binder", "a container that names no card is not first");
    assert(kinds.indexOf("wanted-copy") < kinds.indexOf("how-hard"),
      "a Goal becomes more precise before it becomes more urgent");
    /* RE-PINNED ON THE REAL LINE, WHICH IS NOT OWNERSHIP VERSUS DEMAND. The
       first attempt at this put all ownership first and mirrored the bug it was
       fixing, because `correct-copy` is deal-refusable too. The line is
       refusable-for-itself versus refusable-for-a-deal. */
    const DEAL_CAN_REFUSE = ["correct-copy", "wanted-copy", "how-hard"];
    const ONLY_ITSELF = ["make-binder", "offering", "record-copy", "file", "unfile"];
    for (const safe of ONLY_ITSELF) {
      assert(kinds.includes(safe), safe + " is missing, so the next line asserts nothing");
      for (const risky of DEAL_CAN_REFUSE) {
        assert(kinds.includes(risky), risky + " is missing, so the next line asserts nothing");
        assert(kinds.indexOf(safe) < kinds.indexOf(risky),
          safe + " must come before " + risky + ", or a live deal costs a person "
          + "work that had nothing to do with it");
      }
    }
    assert(kinds.includes("file"), "this plan no longer files anything, so the "
      + "ordering rule below is not being tested at all");
    /* A new copy is recorded before it can be filed alongside; the corrections
       and the Goal edits deliberately come after, so a refused one cannot cost
       the filing. */
    for (const saying of ["record-copy", "offering"]) {
      assert(kinds.indexOf(saying) < kinds.indexOf("file"),
        saying + " should precede filing, so a stopped sequence reads in order");
    }
    /* Unfiling after filing so a binder swap never passes through a moment of
       belonging nowhere. */
    assert(kinds.indexOf("unfile") > kinds.indexOf("file"),
      "a card is unfiled before it is filed");
  });

  test("a partial commit is legible: what stood, what did not, and no false success", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const state0 = await view(ctx.app, "casey");
    const answers = { ...SPEC.initialAnswers(state0, made.mudkip),
      newBinders: ["Mudkip Collection"], want: "primary",
      desired: { grade: "Raw", condition: "" } };   // Raw with no condition: refused
    const plan = SPEC.planFrom(state0, made.mudkip, answers);
    const send = runStep(ctx, "casey");
    const finished = [];
    let stopped = null;
    for (const step of plan.steps) {
      const answer = await send(step, made.mudkip);
      if (!answer.ok) { stopped = { step, refused: answer.refused }; break; }
      finished.push(step);
    }
    eq(finished.map((s) => s.kind).join(","), "make-binder", "the binder did not stand");
    eq(stopped.step.kind, "start-looking");
    eq(stopped.refused, "grading-incoherent");

    /* The binder exists; the Goal does not. Both true, neither a corruption —
       which is why cross-concept atomicity is not required. */
    const w = await load(ctx);
    eq(w.binders.length, 1);
    eq(w.goals.length, 0);
    assert(validateWorld(w).ok, "a partial commit left the world invalid");

    /* And the message names BOTH halves rather than claiming success or bare
       failure. */
    const said = SPEC.explain(stopped.step, stopped.refused, finished);
    assert(/new binder was made/.test(said), "what stood was not said: " + said);
    assert(/goal could not be saved/.test(said), "what failed was not said: " + said);
    assert(/graded and in a raw condition/.test(said), "why was not said: " + said);
    assert(/sends only what is left/.test(said), "the retry was not explained: " + said);
  });

  /* THE RETRY TEST THE TWO NON-IDEMPOTENT COMMANDS EXIST FOR. `createBinder`
     and `addCollectorCopy` both mint identity, so neither is safe to resend
     blind. The panel never resends them blind: it recomputes the difference
     against the projection the server just returned, and the binder that now
     exists is no longer a difference. */
  test("pressing Save again sends only what is left — one binder, one copy", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const send = runStep(ctx, "casey");
    const answers = {
      binders: new Set(), newBinders: ["Mudkip Collection"],
      want: "primary", desired: { grade: "Raw", condition: "" },   // refused on the first pass
      copies: [{ id: null, key: "new-1", grade: "PSA 9", condition: "", cert: "C1",
        market: "", disposition: "offered", removed: false }],
    };

    /* FIRST PRESS. The binder is made; the Goal is refused; the sequence stops,
       so the copy is never sent. */
    const first = SPEC.planFrom(await view(ctx.app, "casey"), made.mudkip, answers);
    /* RE-PINNED (Batch 3A): a new binder now also emits the `file` that puts
       this card in it. It is last, so it is below the refusal and never runs on
       this press — which is exactly what the second plan below has to notice. */
    eq(first.steps.map((s) => s.kind).join(","), "make-binder,record-copy,start-looking,file");
    const doneFirst = [];
    for (const step of first.steps) {
      const answer = await send(step, made.mudkip);
      if (!answer.ok) break;
      doneFirst.push(step.kind);
    }
    /* RE-PINNED WITH THE ORDER. Ownership now precedes demand, so the copy
       lands BEFORE the Goal is refused — which is the point of that order: an
       independent ownership fact is not lost to an unrelated Goal problem. */
    eq(doneFirst.join(","), "make-binder,record-copy");
    eq((await load(ctx)).binders.length, 1);
    eq((await load(ctx)).collectorCopies.length, 1, "the copy was lost to the Goal refusal");

    /* The person fixes the criteria and presses Save again. The panel has
       adopted the projection the server returned, so the binder it made is now
       part of the truth — and the new binder it would have created is gone from
       the difference, replaced by filing THIS card in the one that exists. */
    const state1 = await view(ctx.app, "casey");
    const bindId = state1.binders[0].id;
    /* And the panel has bound the id the server minted onto the draft that
       asked for it, which is what stops a retry recording a second physical
       copy — `adopt` in CardSpecification. Done here the same way, because this
       test drives `planFrom` rather than the component. */
    const mintedId = state1.collectorCopies[0].id;
    assert(mintedId, "the copy did not land on the first press");
    const fixed = { ...answers, binders: new Set([bindId]), newBinders: [],
      copies: answers.copies.map((c) => ({ ...c, id: mintedId })),
      desired: { grade: "Raw", condition: "Near Mint" } };
    const second = SPEC.planFrom(state1, made.mudkip, fixed);
    /* What this test is really about is unchanged: the second plan contains no
       `make-binder`, because that part already succeeded — and no `record-copy`
       either, because the copy landed on the first press and the panel bound the
       id the server minted. Only the Goal and the filing are left. */
    eq(second.steps.map((s) => s.kind).join(","), "start-looking,file",
      "the retry re-sent work that had already succeeded");
    assert(!second.steps.some((st) => st.kind === "make-binder"),
      "the retry tried to create the binder again");
    for (const step of second.steps) {
      const answer = await send(step, made.mudkip);
      eq(answer.ok, true, `${step.kind}: ${answer.refused}`);
    }

    /* EXACTLY ONE OF EACH. */
    const w = await load(ctx);
    eq(w.binders.length, 1, "the retry created a second binder");
    eq(w.binderEntries.length, 1);
    eq(w.goals.length, 1);
    eq(w.collectorCopies.length, 1, "the retry created a second physical copy");
    eq(w.collectorCopies[0].cert, "C1");
    assert(validateWorld(w).ok);
  });

  test("a second Save with nothing changed sends nothing", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.mudkip, "primary", { desired: { grade: "PSA 9" } });
    await own(ctx.app, "casey", { canonicalCardId: made.mudkip, grade: "PSA 9", offered: true });
    const state = await view(ctx.app, "casey");
    const plan = SPEC.planFrom(state, made.mudkip, SPEC.initialAnswers(state, made.mudkip));
    eq(plan.steps.length, 0, "an unchanged panel would have written something");
  });

  test("the store still refuses to run two commands at once, so the sequence is serial", () => {
    /* The sequence is awaited step by step because the production store throws
       on a second concurrent command. Asserted against the store, so that a
       future parallel 'optimisation' of the commit fails here first. */
    const store = code("client/production-store.js");
    assert(/CommandInFlightError/.test(store), "the store stopped serialising commands");
    /* RE-PINNED: the step is resolved into `sending` immediately before
       dispatch, because a step may name a binder this same Save has just
       created and a handle only becomes an id partway through. It is still one
       await per step, which is what this test is about. */
    assert(/await onCommit\(sending/.test(code("client/collector/CardSpecification.jsx")),
      "the panel stopped awaiting each step");
  });
});

/* ============================================================== G
   The four facts are independent. These are the combinations a real
   collection contains, and none of them is an edge case. */
describe("G. want, own, offer and file are four answers, not one", () => {

  const setup = async () => {
    const ctx = await world();
    const made = await cards(ctx);
    return { ctx, made };
  };

  test("a Collector can want a card they already own", async () => {
    const { ctx, made } = await setup();
    await want(ctx.app, "casey", made.firstEdition, "primary", { desired: { grade: "PSA 10" } });
    await own(ctx.app, "casey", { canonicalCardId: made.firstEdition, grade: "PSA 8" });
    const w = await load(ctx);
    eq(w.goals.length, 1, "owning one removed the goal");
    eq(w.collectorCopies.length, 1);
    eq(w.goals[0].canonicalCardId, w.collectorCopies[0].canonicalCardId, "the same card");
    eq(json(w.goals[0].desired), json({ grade: "PSA 10" }));
    eq(w.collectorCopies[0].grade, "PSA 8",
      "the copy's actual grading was overwritten by the desired one");
  });

  test("and offer the copy they own while still hunting a better one", async () => {
    const { ctx, made } = await setup();
    await want(ctx.app, "casey", made.firstEdition, "primary", { desired: { grade: "PSA 10" } });
    const id = (await own(ctx.app, "casey",
      { canonicalCardId: made.firstEdition, grade: "PSA 8", offered: true })).json().value;
    const mine = await view(ctx.app, "casey");
    eq(mine.goals.length, 1);
    eq(mine.collectorCopies.find((b) => b.id === id).offered, true);
    /* And the partner sees both halves: the demand and the supply. */
    const theirs = await view(ctx.app, "north");
    eq(theirs.goals.length, 1, "the partner cannot see the demand");
    eq(theirs.collectorCopies.length, 1, "the partner cannot see the offered copy");
  });

  test("two copies of one card, different grades, only one offered", async () => {
    const { ctx, made } = await setup();
    const a = (await own(ctx.app, "casey",
      { canonicalCardId: made.firstEdition, grade: "PSA 9", cert: "A", offered: true })).json().value;
    /* The one that is NOT offered says PC, which is what "not offered" means for
       a copy recorded today. Every assertion below reads `offered`, and a kept
       copy's `offered` is false, so none of them moves. */
    const b = (await own(ctx.app, "casey",
      { canonicalCardId: made.firstEdition, grade: "Raw", condition: "Damaged", cert: "B",
        keeping: true })).json().value;
    assert(a !== b, "two copies of one card became one record");
    const mine = await view(ctx.app, "casey");
    eq(mine.collectorCopies.length, 2);
    eq(mine.collectorCopies.find((x) => x.id === a).offered, true);
    eq(mine.collectorCopies.find((x) => x.id === b).offered, false);
    eq(mine.collectorCopies.find((x) => x.id === a).grading.label, "PSA 9");
    eq(mine.collectorCopies.find((x) => x.id === b).grading.label, "Raw · Damaged");
    /* THE UNOFFERED ONE IS NOT SUPPLY. */
    const theirs = await view(ctx.app, "north");
    eq(theirs.collectorCopies.length, 1, "an unoffered copy reached a partner");
    eq(theirs.collectorCopies[0].id, a);
  });

  test("filing is still not demand, and needs nothing to be true first", async () => {
    /* RESTORED. Filing a card creates neither demand nor ownership — that claim
       never changed. What briefly changed was the precondition: for one batch a
       card nobody had said anything about could not be filed at all. That rule
       is withdrawn, so the original and simpler statement holds again. */
    const { ctx, made } = await setup();
    const bind = (await post(ctx.app, "casey", "createBinder", { name: "Someday" })).json().value;
    eq((await post(ctx.app, "casey", "addBinderEntry",
      { binderId: bind, canonicalCardId: made.mudkip })).statusCode, 200,
    "a card nobody has said anything about could not be filed");
    let w = await load(ctx);
    eq(w.binderEntries.length, 1, "the entry did not land");
    eq(w.goals.length, 0, "filing became demand");
    eq(w.collectorCopies.length, 0, "filing a card created ownership");

    /* And saying something afterwards changes nothing about the filing. */
    await want(ctx.app, "casey", made.mudkip, "secondary", { desired: { grade: "PSA 9" } });
    w = await load(ctx);
    eq(w.binderEntries.length, 1, "wanting the card re-filed it");
    eq(w.goals.length, 1, "filing invented a second Goal");
  });

  test("one card in two binders, and at most once in each", async () => {
    const { ctx, made } = await setup();
    const a = (await post(ctx.app, "casey", "createBinder", { name: "Mudkips" })).json().value;
    const b = (await post(ctx.app, "casey", "createBinder", { name: "Keepers" })).json().value;
    for (const binderId of [a, b, a, b]) {
      await post(ctx.app, "casey", "addBinderEntry", { binderId, canonicalCardId: made.mudkip });
    }
    const entries = (await load(ctx)).binderEntries;
    eq(entries.length, 2, "a card was filed twice in one binder, or once across two");
    eq(json(entries.map((e) => e.binderId).sort()), json([a, b].sort()));
  });

  test("removing the goal leaves the binders and the copies", async () => {
    const { ctx, made } = await setup();
    const bind = (await post(ctx.app, "casey", "createBinder", { name: "Keepers" })).json().value;
    await want(ctx.app, "casey", made.firstEdition, "primary", { desired: { grade: "PSA 9" } });
    await own(ctx.app, "casey", { canonicalCardId: made.firstEdition, grade: "PSA 9", offered: true });
    await post(ctx.app, "casey", "addBinderEntry", { binderId: bind, canonicalCardId: made.firstEdition });
    const goalId = (await load(ctx)).goals[0].id;

    eq((await post(ctx.app, "casey", "removeGoal", { goalId })).statusCode, 200);
    const w = await load(ctx);
    eq(w.goals.length, 0);
    eq(w.binderEntries.length, 1, "no longer looking un-filed the card");
    eq(w.collectorCopies.length, 1, "no longer looking gave away the copy");
    eq(w.collectorCopies[0].offered, true, "no longer looking withdrew the offer");
  });

  test("selling the last copy leaves the binder membership — the C3.1 proof, from the new surface", async () => {
    const { ctx, made } = await setup();
    const bind = (await post(ctx.app, "casey", "createBinder", { name: "Keepers" })).json().value;
    /* RE-PINNED. What this proves is what a membership NAMES — the canonical
       card, never the physical copy — so the card has to still mean something
       once the copy is gone, or the two questions get mixed up. A Goal carries
       it here; the copy goes and the membership stays, which it could only do by
       naming the card.

       THE OTHER CASE, where the copy held the card's last state, is the
       four-state suite's `[21b]`: there the membership goes, and that is the
       last-state rule rather than anything about copies. */
    const id = (await own(ctx.app, "casey",
      { canonicalCardId: made.firstEdition, grade: "PSA 9", offered: true })).json().value;
    await want(ctx.app, "casey", made.firstEdition, "secondary", { desired: { grade: "PSA 10" } });
    await post(ctx.app, "casey", "addBinderEntry", { binderId: bind, canonicalCardId: made.firstEdition });

    eq((await post(ctx.app, "casey", "removeCollectorCopy", { copyId: id })).statusCode, 200);
    const w = await load(ctx);
    eq(w.collectorCopies.length, 0);
    eq(w.binderEntries.length, 1,
      "selling a card un-filed it — membership named the copy rather than the card");
    eq(w.binderEntries[0].canonicalCardId, made.firstEdition);
  });

  test("ending an offer is not losing the card, and never was", async () => {
    /* RE-PINNED: "withdrawing an offer" is now "saying you are keeping it".
       `setCollectorCopyOffered(false)` is refused — a copy is kept or it is on
       offer — and the switch is the act that ends an offer. Every assertion
       below is unchanged, including that the copy stops being supply, because
       what the projection reads is `offered` and a kept copy's is false. */
    const { ctx, made } = await setup();
    const id = (await own(ctx.app, "casey", { canonicalCardId: made.firstEdition,
      grade: "PSA 9", cert: "KEEP", market: 400, offered: true })).json().value;
    eq((await post(ctx.app, "casey", "setCollectorCopyOffered",
      { copyId: id, offered: false })).json().error.refused, "invalid-disposition",
    "an offer was withdrawn into silence");
    eq((await post(ctx.app, "casey", "setCollectorCopyKept",
      { copyId: id, keeping: true })).statusCode, 200);
    const copy = (await load(ctx)).collectorCopies[0];
    eq(copy.id, id, "the copy was replaced");
    eq(copy.cert, "KEEP", "the certificate went with the offer");
    eq(copy.market, 400, "the reference value went with the offer");
    eq(copy.grade, "PSA 9");
    eq((await view(ctx.app, "north")).collectorCopies.length, 0, "it is no longer supply");
  });
});

/* ============================================================== H
   What a Trusted Partner receives, and what they still never do. */
describe("H. how somebody organises their collection is not a fact about a trade", () => {

  test("no partner receives a binder id, a name, a membership or a count", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const bind = (await post(ctx.app, "casey", "createBinder",
      { name: "ZZ-PRIVATE-NAME-C33" })).json().value;
    /* A Goal, because this is about one card in two binders, not about it. */
    await want(ctx.app, "casey", made.firstEdition, "secondary", { desired: { grade: "PSA 9" } });
    await want(ctx.app, "casey", made.mudkip, "secondary", { desired: { grade: "PSA 9" } });
    await post(ctx.app, "casey", "addBinderEntry", { binderId: bind, canonicalCardId: made.firstEdition });
    await post(ctx.app, "casey", "addBinderEntry", { binderId: bind, canonicalCardId: made.mudkip });
    /* An offered copy, so the partner receives SOMETHING about this card and
       the absence below is about binders rather than about visibility. */
    await own(ctx.app, "casey", { canonicalCardId: made.firstEdition, grade: "PSA 9", offered: true });

    for (const token of ["north", "second"]) {
      const body = (await get(ctx.app, token, "/api/view")).body;
      assert(!body.includes("ZZ-PRIVATE-NAME-C33"), `${token} received a binder name`);
      assert(!body.includes(bind), `${token} received a binder id`);
      const state = JSON.parse(body).state;
      eq(json(state.binders), "[]", `${token} received binders`);
      eq(json(state.binderEntries), "[]", `${token} received membership`);
      /* Not a count either: "this card is in three of their binders" leaks the
         same thing the names would. */
      assert(!/binderCount|filedIn|binderTotal/.test(body), `${token} received a derived hint`);
    }
    /* The owner still sees all of it. */
    const mine = await view(ctx.app, "casey");
    eq(mine.binders.length, 1);
    eq(mine.binderEntries.length, 2);
  });

  test("filing a card creates no discovery, no activity and no interest", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    /* The partner stocks the card, so an overlap would exist IF filing implied
       demand. It must not: a Goal is demand, and nobody set one. */
    await stock(ctx.app, "north", { canonicalCardId: made.firstEdition, grade: "PSA 9", ask: 900 });
    const bind = (await post(ctx.app, "casey", "createBinder", { name: "Mine" })).json().value;
    await post(ctx.app, "casey", "addBinderEntry", { binderId: bind, canonicalCardId: made.firstEdition });

    eq((await view(ctx.app, "casey")).discoveries.length, 0,
      "filing a card was read as wanting it");
    eq((await view(ctx.app, "north")).discoveries.length, 0);
    const w = await load(ctx);
    eq(w.activity.length === undefined ? 0 : w.activity.length, 0, "filing a card wrote activity");
    eq(w.interests.length, 0, "filing a card created an interest");
  });

  test("the Goal's criteria still reach a related partner, and no one else", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.firstEdition, "primary",
      { desired: { grade: "Raw", condition: "Heavily Played" } });
    const north = await view(ctx.app, "north");
    eq(json(north.goals[0].desired), json({ grade: "Raw", condition: "Heavily Played" }),
      "a partner cannot tell which copy is wanted");
    const second = (await get(ctx.app, "second", "/api/view")).body;
    assert(!second.includes("Heavily Played"), "criteria reached a partner outside the network");
    eq(JSON.parse(second).state.goals.length, 0);
  });

  test("a Collector's own reference value and private note never cross", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await own(ctx.app, "casey", { canonicalCardId: made.firstEdition, grade: "PSA 9",
      offered: true, market: 7777, note: "do not sell under 9k" });
    const body = (await get(ctx.app, "north", "/api/view")).body;
    assert(!body.includes("7777"), "the reference value crossed");
    assert(!body.includes("do not sell"), "a private note crossed");
  });

  test("C3.3 opened no new seat and invented no new collection", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await post(ctx.app, "casey", "createBinder", { name: "Mine" });
    await want(ctx.app, "casey", made.firstEdition, "primary", { desired: { grade: "PSA 9" } });
    await own(ctx.app, "casey", { canonicalCardId: made.firstEdition, grade: "PSA 9" });
    const { PROJECTED_COLLECTIONS } = require("../domain/metyet-projection.js");
    /* The same collections C3.1 established, and no twelfth thing to hold a
       "specification". */
    assert(PROJECTED_COLLECTIONS.includes("binders") && PROJECTED_COLLECTIONS.includes("binderEntries"));
    assert(!PROJECTED_COLLECTIONS.some((c) => /specification|intent/i.test(c)),
      "a new aggregate reached the projection: " + PROJECTED_COLLECTIONS.join(","));
    const w = await load(ctx);
    assert(validateWorld(w).ok, "the world is invalid");
  });

  test("C3.3 wrote no migration: the newest is still somebody else's", () => {
    const names = fs.readdirSync(path.join(ROOT, "persistence", "migrations")).sort();
    eq(names[names.length - 1], "0014_binder_memberships.sql",
      "C3.3 added a migration: " + names.join(","));
    /* `desired` lives in a Goal's attrs and needed no DDL; nothing else C3.3
       writes is a new shape. */
    for (const name of names) {
      const sql = read(path.join("persistence", "migrations", name)).replace(/^--.*$/gm, "");
      assert(!/desired/i.test(sql), `${name} gave a Goal a criteria column`);
    }
  });
});
run();
