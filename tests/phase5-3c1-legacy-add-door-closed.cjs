/* ============================================================================
   PHASE 5 BATCH 3C-1 — THE DOOR WITH NO CALLER CLOSES

   3B-1 stopped the product creating bare-card Binder rows and kept the
   card-level add (`addBinderEntry`) open for one release, so a browser tab
   opened before that deploy kept working. That release shipped (`b658e7e`) and
   the release owner judged the window enough. This batch closes the door.

   THE ASYMMETRY IS THE WHOLE BATCH, AND EACH HALF HAS ITS OWN GUARD HERE:

     external add      CLOSED    no client binds it; the door answers
                                 `command-unavailable` before anything runs
     external remove   OPEN      the legacy line's Remove still takes a row out,
                                 from an active binder and an archived one
     domain add        KEPT      dormant and unreachable, because the rows it
                                 made still exist and tests must make them
                                 honestly

   Nothing about a legacy row changed: it is still stored, still shown to its
   owner, still never a Goal's or a copy's home, and still invisible to anybody
   else. And nothing about filing a THING changed: a Goal and a CollectorCopy
   are filed exactly as 3B-1 shipped.

   A. the door           closed, first, and to everybody
   B. the asymmetry      in the domain, not at the door; no alias; one caller
   C. legacy removal     the real panel and the real binding, active + archived
   D. filing things      Goal, copy, and a new binder in the same Save
   E. no inference       a legacy row is nobody's home, beside a real one
   F. privacy            a partner and another Collector receive none of it
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
const { executeCommand } = require("../persistence/command-transaction.js");
const { createApp } = require("../server/app.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { EXPOSED_COMMANDS, isExposed } = require("../server/exposed-commands.js");
const C = require("../domain/metyet-commands.js");
const RT = require("../domain/metyet-runtime.js");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const json = (v) => JSON.stringify(v);

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

const SUBJECT = { north: "sub-north", casey: "sub-casey", dana: "sub-dana" };
const ACTOR = { casey: { collectorId: "c1" }, dana: { collectorId: "c2" }, north: { partnerId: "p1" } };

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
  return { runtime, repository, catalog,
    app: createApp({ repository, catalog, accounts, verifier, runtime }) };
}

async function cards(ctx) {
  const { expansionId } = await ctx.catalog.putExpansion(
    { game: "pokemon", code: "base1", name: "Base", printedTotal: 102 });
  const mudkip = await ctx.catalog.putCardContext({ game: "pokemon", expansionId,
    collectorNumber: "63", cardName: "Mudkip", artist: "Kagemaru Himeno" });
  return { mudkip: (await ctx.catalog.putCanonicalCard({ cardContextId: mudkip.cardContextId,
    printRun: "unlimited", finish: "non_holo" })).canonicalCardId };
}

const post = (app, token, command, payload) => app.inject({ method: "POST", url: "/api/commands",
  headers: { authorization: `Bearer ${token}` }, payload: { command, payload } });
const view = async (app, token) => (await app.inject({ method: "GET", url: "/api/view",
  headers: { authorization: `Bearer ${token}` } })).json().state;
const load = (ctx) => ctx.repository.loadWorld();
const value = async (res) => {
  eq(res.statusCode, 200, res.body);
  return res.json().value;
};

/* A LEGACY ROW, MADE THE ONLY WAY ONE CAN STILL BE MADE: the domain command,
   through the same transaction the route uses, and proved to have landed. */
const legacyRow = async (ctx, binderId, canonicalCardId) => {
  const r = await executeCommand(ctx.repository, { actor: ACTOR.casey,
    command: "addBinderEntry", payload: { binderId, canonicalCardId }, runtime: ctx.runtime });
  assert(!r.refused, `the legacy fixture was refused: ${r.refused}`);
  assert((await load(ctx)).binderEntries.some((e) => e.binderId === binderId
    && e.canonicalCardId === canonicalCardId), "the legacy fixture row did not land");
};

/* THE REAL CLIENT CODE, bundled the way the other rendering suites bundle it. */
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
const SPEC = build("client/collector/CardSpecification.jsx");
const CMD = build("client/commands.js");

/* A store in the shape the production store answers with, posting to the real
   server as the signed-in Collector. */
const storeFor = (ctx, token) => ({
  execute: async (command, payload) => {
    const res = await post(ctx.app, token, command, payload);
    return res.statusCode === 200 ? { ok: true, value: res.json().value }
      : { ok: false, refused: res.json().error.refused };
  },
});

const settle = async () => {
  for (let i = 0; i < 5; i += 1) {
    await TR.act(async () => { await new Promise((done) => setTimeout(done, 0)); });
  }
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

/* ================================================================ A */
describe("A. the card-level add door is closed, first, and to everybody", () => {

  test("a stale pre-3B tab's exact request is refused command-unavailable, and nothing moves", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const binderId = await value(await post(ctx.app, "casey", "createBinder", { name: "Mudkips" }));
    const before = await ctx.repository.readVersion();
    /* What `fileCardInBinder` sent, for the owner, naming a real card in their
       own binder — the request a tab opened before 3B-1 makes when it saves. */
    const res = await post(ctx.app, "casey", "addBinderEntry", { binderId, canonicalCardId: made.mudkip });
    eq(res.statusCode, 409, "the retired add was let through");
    eq(res.json().error.refused, "command-unavailable", "the stale tab got a different answer");
    eq(await ctx.repository.readVersion(), before, "the world version moved for a refused command");
    eq((await load(ctx)).binderEntries.length, 0, "a bare-card row was created");
  });

  test("the door answers before the catalog guard, the lookup and the world lock", async () => {
    const ctx = await world();
    const before = await ctx.repository.readVersion();
    /* Each of these would be refused for a DIFFERENT reason further in — an
       uncatalogued card, a binder that does not exist, a partner's seat. That
       they all get the door's answer is the proof the door answered first. */
    for (const [token, payload] of [
      ["casey", { binderId: "no-such-binder", canonicalCardId: "not-a-card" }],
      ["north", { binderId: "no-such-binder", canonicalCardId: "not-a-card" }],
      ["dana", {}],
    ]) {
      const res = await post(ctx.app, token, "addBinderEntry", payload);
      eq(res.statusCode, 409, `${token} reached past the door`);
      eq(res.json().error.refused, "command-unavailable", `${token} got a deeper refusal`);
    }
    eq(await ctx.repository.readVersion(), before, "a refused command reached the world");
  });

  test("the removal door is still open, for the row's owner only", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const binderId = await value(await post(ctx.app, "casey", "createBinder", { name: "Mudkips" }));
    await legacyRow(ctx, binderId, made.mudkip);
    for (const token of ["north", "dana"]) {
      eq((await post(ctx.app, token, "removeBinderEntry",
        { binderId, canonicalCardId: made.mudkip })).json().error.refused, "not-owner");
    }
    eq((await post(ctx.app, "casey", "removeBinderEntry",
      { binderId, canonicalCardId: made.mudkip })).statusCode, 200, "the owner could not remove it");
    eq((await load(ctx)).binderEntries.length, 0, "the row survived its removal");
  });

  test("the current client sends no card-level add, from any file", () => {
    const bindings = code("client/commands.js");
    assert(!/execute\(\s*"addBinderEntry"/.test(bindings), "a binding sends the retired add");
    assert(!/export function fileCardInBinder\b/.test(bindings), "the retired binding is back");
    assert(/export function unfileCardFromBinder\b/.test(bindings)
      && /execute\(\s*"removeBinderEntry"/.test(bindings), "the legacy removal binding is gone");
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory()
      ? walk(path.join(dir, e.name)) : /\.(js|jsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));
    for (const file of walk(path.join(ROOT, "client"))) {
      const rel = file.slice(ROOT.length + 1);
      assert(!/["']addBinderEntry["']/.test(code(rel)), `${rel} names the retired add`);
      assert(!/kind:\s*"file"(?!-)/.test(code(rel)), `${rel} plans a card-level filing`);
    }
    const entrance = code("client/sign-in/SignIn.jsx");
    assert(!/case "file"/.test(entrance), "the entrance maps the retired step");
    assert(!/fileCardInBinder/.test(entrance), "the entrance imports the retired binding");
  });
});

/* ================================================================ B */
describe("B. kept in the domain, closed at the door, and only one way in", () => {

  test("addBinderEntry is a domain command and is not an exposed one — stated together", () => {
    assert(C.COMMAND_NAMES.includes("addBinderEntry"), "the dormant domain command was deleted");
    eq(typeof C.COMMANDS.addBinderEntry, "function", "the dormant domain command has no body");
    assert(!EXPOSED_COMMANDS.includes("addBinderEntry"), "the retired add is exposed");
    assert(EXPOSED_COMMANDS.includes("removeBinderEntry"), "the legacy removal is not exposed");
    eq(C.COMMAND_NAMES.length, 53, "the domain command table moved");
    eq(EXPOSED_COMMANDS.length, 24, "the production surface is not 24");
  });

  test("a legacy row can still be made past the door, by design", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const binderId = await value(await post(ctx.app, "casey", "createBinder", { name: "Old" }));
    await legacyRow(ctx, binderId, made.mudkip);
    eq((await view(ctx.app, "casey")).binderEntries.length, 1, "the owner does not see the row");
  });

  test("no alias: nothing exposed reaches the retired command under another name", () => {
    for (const name of EXPOSED_COMMANDS) {
      assert(Object.prototype.hasOwnProperty.call(C.COMMANDS, name), `${name} is not a command`);
      assert(C.COMMANDS[name] !== C.COMMANDS.addBinderEntry, `${name} is an alias of the retired add`);
    }
    const aliases = Object.keys(C.COMMANDS).filter((k) => k !== "addBinderEntry"
      && C.COMMANDS[k] === C.COMMANDS.addBinderEntry);
    eq(json(aliases), "[]", "the command table holds an alias of the retired add");
    eq(json(Object.keys(C.COMMANDS).sort()), json([...C.COMMAND_NAMES].sort()),
      "the command table and its names disagree");
    for (const spelling of ["addBinderEntry", "AddBinderEntry", " addBinderEntry", "addBinderEntry ",
      "addbinderentry", "fileCardInBinder"]) {
      eq(isExposed(spelling), false, `"${spelling}" is let through the door`);
    }
  });

  test("no production path calls it directly — the domain and the inert guard list only", () => {
    /* Every server, persistence and client file, comments stripped. The one
       expected mention is `CARD_NAMING_COMMANDS` in server/app.js, which sits
       behind `isExposed` and is therefore unreachable for this name. */
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory()
      ? walk(path.join(dir, e.name)) : /\.(js|jsx|mjs|cjs)$/.test(e.name) ? [path.join(dir, e.name)] : []));
    const naming = [...walk(path.join(ROOT, "server")), ...walk(path.join(ROOT, "persistence")),
      ...walk(path.join(ROOT, "client")), path.join(ROOT, "app-src/main.jsx")]
      .map((f) => f.slice(ROOT.length + 1))
      .filter((rel) => /["']addBinderEntry["']/.test(code(rel)));
    eq(json(naming), json(["server/app.js"]), `the retired add is named by ${naming.join(",")}`);
    const app = code("server/app.js");
    const guard = app.match(/CARD_NAMING_COMMANDS = Object\.freeze\(\[([\s\S]*?)\]\)/);
    assert(guard && /"addBinderEntry"/.test(guard[1]), "the mention moved out of the guard list");
    eq((app.match(/["']addBinderEntry["']/g) || []).length, 1, "server/app.js names it outside the guard list");
    assert(app.indexOf("isExposed(command)") < app.indexOf("namesACanonicalCard(command)"),
      "the catalog guard runs before the door");
  });

  test("the two-way equality that holds the door to the client is still two-way", () => {
    /* The guard that makes re-exposing the add a two-file edit. Weakening it to
       a subset check would let either side grow alone. */
    const b81 = read("tests/phase5-b81-plumbing-corrections.cjs");
    assert(b81.includes("eq(json([...sent].sort()), json([...EXPOSED_COMMANDS].sort()),"),
      "phase5-b81's exact client/exposed equality was weakened");
    const bom = read("tests/phase5-binder-object-membership.cjs");
    assert(bom.includes("eq(JSON.stringify([...sent].sort()), JSON.stringify([...EXPOSED_COMMANDS].sort()),"),
      "phase5-binder-object-membership's exact client/exposed equality was weakened");
  });
});

/* ================================================================ C */
describe("C. a legacy row is removed through the real panel and the real binding", () => {

  /* THE PATH A COLLECTOR TAKES, END TO END. The panel's legacy line plans
     `{ kind: "unfile" }`; the entrance maps that to `binder.unfile`, which is
     `unfileCardFromBinder(store)`; the binding sends `removeBinderEntry`. The
     entrance itself lives inside SignIn's component, so its two lines are
     asserted by source and the rest runs for real. */
  test("the entrance maps the legacy line's Remove onto the retained binding", () => {
    const entrance = code("client/sign-in/SignIn.jsx");
    assert(/case "unfile": return binder\.unfile\(step\.binderId, canonicalCardId\)/.test(entrance),
      "the entrance no longer maps the legacy Remove");
    assert(/unfile: unfileCardFromBinder\(store\)/.test(entrance), "binder.unfile is not the retained binding");
  });

  const removeThroughPanel = async (archived) => {
    const ctx = await world();
    const made = await cards(ctx);
    const binderId = await value(await post(ctx.app, "casey", "createBinder", { name: "Trade Night" }));
    await value(await post(ctx.app, "casey", "addGoal", { canonicalCardId: made.mudkip, tier: "secondary",
      desired: { grade: "PSA 9" } }));
    await legacyRow(ctx, binderId, made.mudkip);
    if (archived) {
      eq((await post(ctx.app, "casey", "setBinderArchived", { binderId, archived: true })).statusCode, 200);
      assert((await load(ctx)).binders[0].archivedAt, "the binder was not put away");
    }
    const unfile = CMD.unfileCardFromBinder(storeFor(ctx, "casey"));
    const steps = [];
    const onCommit = async (step, canonicalCardId) => {
      steps.push(step.kind);
      if (step.kind !== "unfile") return { ok: false, refused: "command-unavailable" };
      return unfile(step.binderId, canonicalCardId);
    };
    let r;
    TR.act(() => {
      r = TR.create(React.createElement(SPEC.default, {
        card: { canonicalCardId: made.mudkip, cardName: "Mudkip" },
        state: null, onCommit, onClose: () => {} }));
    });
    await TR.act(async () => {
      r.update(React.createElement(SPEC.default, {
        card: { canonicalCardId: made.mudkip, cardName: "Mudkip" },
        state: await view(ctx.app, "casey"), onCommit, onClose: () => {} }));
    });
    const said = instText(r.root);
    assert(/Filed before/.test(said) && /Trade Night/.test(said), `the legacy line is not shown: ${said}`);
    const remove = r.root.findAll((n) => n.type === "button" && instText(n).trim() === "Remove");
    eq(remove.length, 1, "there is not exactly one Remove on the legacy line");
    await TR.act(async () => { remove[0].props.onClick(); });
    await settle();
    eq(json(steps), json(["unfile"]), "the panel did not plan exactly the legacy removal");
    const w = await load(ctx);
    eq(w.binderEntries.length, 0, "the legacy row survived its Remove");
    eq(w.goals.length, 1, "removing the legacy row removed the Goal");
    eq(w.binders.length, 1, "removing the legacy row removed the binder");
    eq(Boolean(w.binders[0].archivedAt), archived, "removing the row changed whether the binder is put away");
  };

  test("from an active binder", () => removeThroughPanel(false));
  test("from an archived binder", () => removeThroughPanel(true));
});

/* ================================================================ D */
describe("D. filing a THING works exactly as 3B-1 shipped it", () => {

  test("a Goal and a CollectorCopy are each filed and moved through the real bindings", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const store = storeFor(ctx, "casey");
    const a = await value(await post(ctx.app, "casey", "createBinder", { name: "Hunt" }));
    const b = await value(await post(ctx.app, "casey", "createBinder", { name: "Keepers" }));
    await value(await post(ctx.app, "casey", "addGoal", { canonicalCardId: made.mudkip, tier: "primary",
      desired: { grade: "PSA 9" } }));
    const copyId = await value(await post(ctx.app, "casey", "addCollectorCopy",
      { copy: { canonicalCardId: made.mudkip, keeping: true } }));
    const goalId = (await load(ctx)).goals[0].id;
    const file = CMD.fileObjectInBinder(store);
    eq((await file({ binderId: a, goalId })).ok, true, "the Goal could not be filed");
    eq((await file({ binderId: a, collectorCopyId: copyId })).ok, true, "the copy could not be filed");
    eq((await file({ binderId: b, collectorCopyId: copyId })).ok, true, "the copy could not be moved");
    const w = await load(ctx);
    eq(json(w.binderMemberships.map((m) => [m.goalId || m.collectorCopyId, m.binderId]).sort()),
      json([[copyId, b], [goalId, a]].sort()), "the homes are not where they were put");
    eq(w.binderEntries.length, 0, "filing a thing created a card-level row");
    eq(w.goals[0].tier, "primary", "filing changed the Goal's state");
    eq(w.collectorCopies[0].keeping, true, "filing changed the copy's state");
  });

  test("a new binder, a new Goal and a new copy, all filed in the same Save", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const state0 = await view(ctx.app, "casey");
    const answers = {
      ...SPEC.initialAnswers(state0, made.mudkip),
      newBinders: [{ key: "nb-1", name: "Mudkip Collection" }],
      want: "primary", desired: { grade: "Raw", condition: "Near Mint" }, goalHome: "nb-1",
      copies: [{ id: null, grade: "PSA 9", condition: "", cert: "", market: "",
        disposition: "keeping", removed: false, home: "nb-1", key: "new-1" }],
    };
    const plan = SPEC.planFrom(state0, made.mudkip, answers);
    assert(!plan.steps.some((s) => s.kind === "file"), "the Save planned a card-level filing");
    eq(plan.steps.filter((s) => s.kind === "make-binder").length, 1, "one new binder was not one step");
    /* The draft handles resolved the way the panel's `commit` resolves them —
       proved against the mounted panel in phase5-binder-object-membership. */
    const store = storeFor(ctx, "casey");
    const bound = { "make-binder": (s) => CMD.createBinder(store)(s.name),
      "record-copy": (s) => CMD.addOwnedCopy(store)({ canonicalCardId: made.mudkip, ...s.copy }),
      "start-looking": (s) => CMD.addCollectorGoal(store)({ canonicalCardId: made.mudkip,
        tier: s.tier, desired: s.desired }),
      "file-object": (s) => CMD.fileObjectInBinder(store)({ binderId: s.binderId,
        goalId: s.goalId, collectorCopyId: s.collectorCopyId }) };
    const minted = new Map();
    for (const step of plan.steps) {
      const declares = step.kind === "make-binder" || step.kind === "start-looking";
      const sending = { ...step };
      if (step.binderDraftId && !declares) sending.binderId = minted.get(step.binderDraftId);
      if (step.copyDraftId && !declares) sending.collectorCopyId = minted.get(step.copyDraftId);
      if (step.goalDraftId && !declares) sending.goalId = minted.get(step.goalDraftId);
      assert(bound[step.kind], `the Save planned an unexpected step: ${step.kind}`);
      const answer = await bound[step.kind](sending);
      eq(answer.ok, true, `${step.kind}: ${answer.refused}`);
      const handle = step.draftId || (declares ? step.binderDraftId || step.goalDraftId : null);
      if (handle && answer.value) minted.set(handle, answer.value);
    }
    const w = await load(ctx);
    eq(w.binders.length, 1);
    eq(w.binderMemberships.length, 2, "the Goal and the copy are not both in the new binder");
    assert(w.binderMemberships.every((m) => m.binderId === w.binders[0].id), "a thing went elsewhere");
    eq(w.binderEntries.length, 0, "the Save created a card-level row");
  });
});

/* ================================================================ E */
describe("E. a legacy row is nobody's home, even beside a real one", () => {

  test("a legacy row infers neither the Goal's nor the copy's home", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const binderId = await value(await post(ctx.app, "casey", "createBinder", { name: "Old" }));
    await value(await post(ctx.app, "casey", "addGoal", { canonicalCardId: made.mudkip, tier: "primary",
      desired: { grade: "PSA 9" } }));
    await value(await post(ctx.app, "casey", "addCollectorCopy",
      { copy: { canonicalCardId: made.mudkip, offered: true } }));
    await legacyRow(ctx, binderId, made.mudkip);
    const state = await view(ctx.app, "casey");
    eq(state.binderEntries.length, 1, "the legacy row is not visible to its owner");
    eq(state.binderMemberships.length, 0, "a legacy row became a membership");
    const answers = SPEC.initialAnswers(state, made.mudkip);
    eq(answers.goalHome, null, "the Goal opened filed where the legacy row is");
    eq(json(answers.copies.map((c) => c.home)), json([null]), "the copy opened filed where the legacy row is");
    eq(SPEC.planFrom(state, made.mudkip, answers).steps.length, 0,
      "opening a card with a legacy row planned work");
  });

  test("a legacy row and a membership coexist, and each leaves without the other", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const binderId = await value(await post(ctx.app, "casey", "createBinder", { name: "Mudkips" }));
    await value(await post(ctx.app, "casey", "addGoal", { canonicalCardId: made.mudkip, tier: "primary",
      desired: { grade: "PSA 9" } }));
    const goalId = (await load(ctx)).goals[0].id;
    await legacyRow(ctx, binderId, made.mudkip);
    await value(await post(ctx.app, "casey", "fileObject", { binderId, goalId }));
    let w = await load(ctx);
    eq(w.binderEntries.length, 1);
    eq(w.binderMemberships.length, 1);
    eq((await post(ctx.app, "casey", "removeBinderEntry",
      { binderId, canonicalCardId: made.mudkip })).statusCode, 200);
    w = await load(ctx);
    eq(w.binderEntries.length, 0, "the legacy row did not leave");
    eq(w.binderMemberships.length, 1, "removing the legacy row unfiled the Goal");
    await legacyRow(ctx, binderId, made.mudkip);
    await value(await post(ctx.app, "casey", "unfileObject", { goalId }));
    w = await load(ctx);
    eq(w.binderMemberships.length, 0, "the Goal did not leave");
    eq(w.binderEntries.length, 1, "unfiling the Goal removed the legacy row");
  });
});

/* ================================================================ F */
describe("F. nobody else receives any of it", () => {

  test("a partner and another Collector receive no binder, row, membership or name", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const binderId = await value(await post(ctx.app, "casey", "createBinder", { name: "ZZ-PRIVATE-3C1" }));
    await value(await post(ctx.app, "casey", "addGoal", { canonicalCardId: made.mudkip, tier: "primary",
      desired: { grade: "PSA 9" } }));
    await value(await post(ctx.app, "casey", "addCollectorCopy",
      { copy: { canonicalCardId: made.mudkip, offered: true } }));
    const w0 = await load(ctx);
    await legacyRow(ctx, binderId, made.mudkip);
    await value(await post(ctx.app, "casey", "fileObject", { binderId, goalId: w0.goals[0].id }));
    await value(await post(ctx.app, "casey", "fileObject",
      { binderId, collectorCopyId: w0.collectorCopies[0].id }));
    /* The owner sees all three kinds of thing, so the absences below are about
       who is asking and not about an empty world. */
    const mine = await view(ctx.app, "casey");
    eq([mine.binders.length, mine.binderEntries.length, mine.binderMemberships.length].join(","), "1,1,2");
    for (const token of ["north", "dana"]) {
      const body = (await ctx.app.inject({ method: "GET", url: "/api/view",
        headers: { authorization: `Bearer ${token}` } })).body;
      assert(!body.includes("ZZ-PRIVATE-3C1"), `${token} received a binder name`);
      assert(!body.includes(binderId), `${token} received a binder id`);
      const state = JSON.parse(body).state;
      eq(json([state.binders, state.binderEntries, state.binderMemberships]), "[[],[],[]]",
        `${token} received Binder organisation`);
    }
    /* And the partner does receive the offered copy — the visibility path is
       live, so the absence above is a decision and not an outage. */
    eq((await view(ctx.app, "north")).collectorCopies.length, 1, "the partner sees nothing at all");
  });
});

run();
