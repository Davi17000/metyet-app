/* ============================================================================
   MARKET VALIDATION — BATCH 1: TRUSTED PARTNER PRICING CONTROLS
   A Trusted Partner's `ask` is now presented as the copy's Proposed Market
   Price, and each copy carries one optional preference, `firmOnPrice`:
   unchecked (absent or false) is Open to Offers, checked is Firm on Price.
   Nothing here negotiates — Collector offers and partner responses are later
   batches. What is proved:
     A. the domain       default false, booleans only, add and correct, and a
                         correction of anything else leaves it alone
     B. old copies       a row written before the preference existed is Open
                         to Offers everywhere: world, projection, form
     C. the Collector    the projection carries a boolean and nothing private
     D. who may change   the owning shop, and nobody else; pricing rules intact
     E. the screen       Proposed Market Price, the Firm on Price box, its
                         default, and a saved choice that comes back
   The harness (world, catalogue, HTTP helpers, component build) is the C5
   suite's, reused as-is.
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { createApp } = require("../server/app.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const React = require("react");
const TR = require("react-test-renderer");
const esbuild = require("esbuild");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
const { COMMAND_NAMES } = require("../domain/metyet-commands.js");
const { executeCommand } = require("../persistence/command-transaction.js");
const RT = require("../domain/metyet-runtime.js");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
/* Source with its comments taken out. Every claim this suite makes about what a
   FILE says is about code or about copy a person reads — never about a comment
   explaining why something was removed, which is exactly the kind of sentence
   C5 added and which a naive grep would read as the thing it describes. */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const json = (v) => JSON.stringify(v);

/* A real production component, compiled the way every other suite compiles one.
   There is no persistent bundle of the production client in dist/ — the app
   build (`npm run build:app`) is not part of `verify` — so a rendered assertion
   is the only kind that can speak for what a person sees. */
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
const texts = (n) => {
  const out = [];
  const walk = (node) => {
    if (!node || node.type === "style") return;
    for (const c of node.children || []) {
      if (typeof c === "string" || typeof c === "number") out.push(String(c)); else walk(c);
    }
  };
  walk(n);
  return out;
};

/* ------------------------------------------------------------- A WORLD */

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

const SUBJECT = { north: "sub-north", second: "sub-second",
  casey: "sub-casey", dana: "sub-dana" };

/* Two shops, two Collectors. Casey knows Northline; Dana knows nobody, which is
   what makes her useful — she is a second Collector for the ownership checks
   that had none. */
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
    partners: [{ id: "p1", name: "Northline" }, { id: "p2", name: "Second" }],
    relationships: [{ partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" }],
    invitations: [], goals: [], inventory: [], collectorCopies: [], binders: [],
    binderEntries: [], interests: [], opportunities: [], conversations: [],
    photoRequests: [], copyReviews: [],
  });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: SUBJECT.north, role: "tp", partnerId: "p1" });
  await accounts.linkAccount({ subject: SUBJECT.second, role: "tp", partnerId: "p2" });
  await accounts.linkAccount({ subject: SUBJECT.casey, role: "collector", collectorId: "c1" });
  await accounts.linkAccount({ subject: SUBJECT.dana, role: "collector", collectorId: "c2" });
  const verifier = { verify: async (token) => {
    const subject = SUBJECT[token];
    if (!subject) throw Object.assign(new Error("no"), { reason: "bad token" });
    return { subject, email: `${token}@example.invalid`, emailVerified: true };
  } };
  const app = createApp({ repository, catalog, accounts, verifier, runtime });
  return { pg, db, runtime, repository, catalog, app };
}

/* One checklist line, two printings — enough for "the same card" and "a
   different card" to both be sayable. */
async function charizard(ctx) {
  const { expansionId } = await ctx.catalog.putExpansion(
    { game: "pokemon", code: "base1", name: "Base", printedTotal: 102 });
  const { cardContextId } = await ctx.catalog.putCardContext({ game: "pokemon", expansionId,
    collectorNumber: "4", cardName: "Charizard", artist: "Mitsuhiro Arita", rarity: "Rare Holo" });
  const made = {};
  for (const [name, dimensions] of Object.entries({
    firstEdition: { printRun: "first_edition", finish: "holofoil" },
    unlimited: { printRun: "unlimited", finish: "holofoil" },
  })) {
    made[name] = (await ctx.catalog.putCanonicalCard({ cardContextId, ...dimensions })).canonicalCardId;
  }
  return { expansionId, cardContextId, ...made };
}

const CASEY = { collectorId: "c1" };   // the seat SUBJECT.casey is linked to
/* A LEGACY ROW IS MADE PAST THE DOOR, AND PROVES IT LANDED (Batch 3C-1). No
   client may create a bare-card Binder row any more, so a test that needs one
   makes it the way the historical rows were made: the domain command, through
   the same transaction, advisory lock and validateWorld the route uses. This
   used to POST and discard the answer, which the 3C audit measured passing
   with no row at all — so it now refuses to return until the row exists. */
const legacyRow = async (ctx, actor, binderId, canonicalCardId) => {
  const r = await executeCommand(ctx.repository, { actor,
    command: "addBinderEntry", payload: { binderId, canonicalCardId }, runtime: ctx.runtime });
  assert(!r.refused, `the legacy fixture was refused: ${r.refused}`);
  assert((await ctx.repository.loadWorld()).binderEntries.some((e) => e.binderId === binderId
    && e.canonicalCardId === canonicalCardId), "the legacy fixture row did not land");
  return r;
};
const post = (app, token, command, payload) => app.inject({ method: "POST", url: "/api/commands",
  headers: { authorization: `Bearer ${token}` }, payload: { command, payload } });
const view = async (app, token) => (await app.inject({ method: "GET", url: "/api/view",
  headers: { authorization: `Bearer ${token}` } })).json().state;

const addCopy = (app, token, copy) => post(app, token, "addInventoryCopy", { copy });
const correct = (app, token, invId, patch) => post(app, token, "updateInventoryCopy", { invId, patch });
const retire = (app, token, invId) => post(app, token, "removeInventoryCopy", { invId });
const refusal = (res) => (res.statusCode === 200 ? null : res.json().error.refused);

/* Supply carries the grade this suite's Goals ask for. Since the true-match
   batch a Goal's stated criteria constrain Discovery, and every test here is
   about something else — corrections, counts, archiving — so demand and supply
   are made to agree deliberately. */
const stock = async (ctx, token, copy) => {
  /* Only when the copy says nothing about its grading at all — a copy that
     states Raw, or a condition, is saying something and must not be overridden
     into an incoherent pair. */
  const said = copy && (copy.grade || copy.condition);
  const res = await addCopy(ctx.app, token, said ? copy : { grade: "PSA 9", ...copy });
  eq(res.statusCode, 200, res.body);
  return res.json().value;
};
/* A Goal has to say which copy it is after (C3.2), so this says one. */
const wants = async (ctx, token, canonicalCardId, tier = "primary") => {
  const res = await post(ctx.app, token, "addGoal",
    { canonicalCardId, tier, desired: { grade: "PSA 9" } });
  eq(res.statusCode, 200, res.body);
  return res.json().value;
};
const rowOf = async (ctx, invId) =>
  (await ctx.repository.loadWorld()).inventory.find((i) => i.invId === invId) || null;


const D = require("../domain/metyet-domain.js");
const W = require("../domain/metyet-world.js");
const FIRM_HELP = "When enabled, Collectors can only initiate at your proposed market price. You'll still confirm the offer before proceeding.";

/* ============================================================== A */
describe("A. the preference in the domain", () => {

  test("a new copy is Open to Offers unless the shop says otherwise", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200 });
    eq((await rowOf(ctx, invId)).firmOnPrice, false, "stored as an explicit false");
  });

  test("a copy added Firm on Price is stored that way", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200, firmOnPrice: true });
    eq((await rowOf(ctx, invId)).firmOnPrice, true, "firm");
    eq((await rowOf(ctx, invId)).ask, 4200, "and the Proposed Market Price is still `ask`, as it was");
  });

  test("the preference can be turned on and off again, and each answer persists", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200 });
    let res = await correct(ctx.app, "north", invId, { firmOnPrice: true });
    eq(res.statusCode, 200, res.body);
    eq((await rowOf(ctx, invId)).firmOnPrice, true, "false → true");
    res = await correct(ctx.app, "north", invId, { firmOnPrice: false });
    eq(res.statusCode, 200, res.body);
    eq((await rowOf(ctx, invId)).firmOnPrice, false, "true → false");
  });

  test("only a boolean is a preference — on add", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    for (const bad of ["yes", "true", 1, 0, null, {}, []]) {
      const before = (await ctx.repository.loadWorld()).inventory.length;
      const res = await addCopy(ctx.app, "north", { canonicalCardId: cards.unlimited, grade: "PSA 9", ask: 4200, firmOnPrice: bad });
      eq(refusal(res), "invalid-pricing-preference", `firmOnPrice ${JSON.stringify(bad)} was accepted on add`);
      eq((await ctx.repository.loadWorld()).inventory.length, before, "and no copy was created");
    }
  });

  test("only a boolean is a preference — on correction, and the copy is untouched", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200, firmOnPrice: true });
    const before = await rowOf(ctx, invId);
    for (const bad of ["no", "false", 0, 1, null]) {
      const res = await correct(ctx.app, "north", invId, { firmOnPrice: bad, ask: 1 });
      eq(refusal(res), "invalid-pricing-preference", `firmOnPrice ${JSON.stringify(bad)} was accepted on correction`);
    }
    eq(json(await rowOf(ctx, invId)), json(before), "a refused correction wrote nothing — not even the ask beside it");
  });

  test("correcting anything else leaves the preference exactly where it was", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, grade: "PSA 9", ask: 4200, firmOnPrice: true });
    for (const patch of [{ ask: 3900 }, { cert: "12345678" }, { grade: "PSA 10" }, { cost: 2000 }, { grade: "Raw", condition: "Near Mint" }]) {
      const res = await correct(ctx.app, "north", invId, patch);
      eq(res.statusCode, 200, res.body);
      eq((await rowOf(ctx, invId)).firmOnPrice, true, `${json(patch)} reset Firm on Price`);
    }
    eq((await rowOf(ctx, invId)).ask, 3900, "the other corrections still landed");
  });
});

/* ============================================================== B */
describe("B. a copy written before the preference existed", () => {

  const legacy = async (ctx, cards) => {
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, grade: "PSA 9", ask: 4200 });
    const w = await ctx.repository.loadWorld();
    const row = w.inventory.find((i) => i.invId === invId);
    delete row.firmOnPrice;                       // exactly what a pre-Batch-1 row looks like
    await ctx.repository.saveWorld(w);
    assert(!("firmOnPrice" in (await rowOf(ctx, invId))), "the fixture really has no key");
    return invId;
  };

  test("loads and validates as it always did", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    await legacy(ctx, cards);
    const v = W.validateWorld(await ctx.repository.loadWorld());
    assert(v.ok, "an old copy without the key made the world invalid: " + json(v.errors));
  });

  test("a stored non-boolean is caught by world validation", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, grade: "PSA 9", ask: 4200 });
    const w = await ctx.repository.loadWorld();
    w.inventory.find((i) => i.invId === invId).firmOnPrice = "yes";
    const v = W.validateWorld(w);
    assert(!v.ok && v.errors.some((e) => /firmOnPrice/.test(e.path)), "a world holding firmOnPrice: \"yes\" was accepted: " + json(v.errors));
  });

  test("a related Collector reads it as Open to Offers", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await legacy(ctx, cards);
    const theirs = (await view(ctx.app, "casey")).inventory.find((i) => i.invId === invId);
    assert(theirs, "the Collector sees the copy");
    eq(theirs.firmOnPrice, false, "a missing preference is a boolean false, not undefined");
  });

  test("correcting it leaves it Open to Offers unless the shop says otherwise", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await legacy(ctx, cards);
    await correct(ctx.app, "north", invId, { ask: 3900 });
    const row = await rowOf(ctx, invId);
    assert(row.firmOnPrice !== true, "a correction of the ask made an old copy firm");
  });
});

/* ============================================================== C */
describe("C. what a Collector is told", () => {

  test("the preference arrives as a boolean, both ways, and nothing private comes with it", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const firm = await stock(ctx, "north", { canonicalCardId: cards.unlimited, grade: "PSA 9", ask: 4200, firmOnPrice: true,
      cost: 3100, acquired: "2029-06-01", note: "paid too much" });
    const open = await stock(ctx, "north", { canonicalCardId: cards.firstEdition, grade: "PSA 8", ask: 9900, cost: 7777 });
    const seen = (await view(ctx.app, "casey")).inventory;
    const f = seen.find((i) => i.invId === firm); const o = seen.find((i) => i.invId === open);
    eq(f.firmOnPrice, true, "Firm on Price");
    eq(o.firmOnPrice, false, "Open to Offers");
    for (const c of [f, o]) {
      eq(typeof c.firmOnPrice, "boolean", "always a boolean");
      for (const secret of ["cost", "acquired", "note"]) assert(!(secret in c), `a Collector received the partner's ${secret}`);
    }
    const body = JSON.stringify(await view(ctx.app, "casey"));
    assert(!body.includes("3100") && !body.includes("7777") && !body.includes("paid too much"), "nothing private left the server");
  });

  test("a Collector the shop does not know still sees nothing", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, grade: "PSA 9", ask: 4200, firmOnPrice: true });
    const dana = await view(ctx.app, "dana");
    assert(!(dana.inventory || []).some((i) => i.invId === invId), "an unrelated Collector received the copy");
  });

  test("the Collector allow-list names the preference, and only it, beside what was there", async () => {
    const { INVENTORY_FOR_COLLECTOR } = require("../domain/metyet-projection.js").FIELD_RULES;
    eq(json(INVENTORY_FOR_COLLECTOR), json(["invId", "partnerId", "cardId", "canonicalCardId",
      "grade", "condition", "ask", "cert", "photos", "addedAt", "archived", "firmOnPrice"]), "the allow-list moved by exactly one name");
  });
});

/* ============================================================== D */
describe("D. who may change it, and what else still holds", () => {

  test("another Trusted Partner cannot", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200 });
    eq(refusal(await correct(ctx.app, "second", invId, { firmOnPrice: true })), "not-owner", "another shop");
    eq((await rowOf(ctx, invId)).firmOnPrice, false, "unchanged");
  });

  test("a Collector cannot", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200 });
    eq(refusal(await correct(ctx.app, "casey", invId, { firmOnPrice: true })), "not-owner", "a Collector");
    eq(refusal(await addCopy(ctx.app, "casey", { canonicalCardId: cards.unlimited, firmOnPrice: true })), "not-owner", "nor add a shop's copy");
    eq((await rowOf(ctx, invId)).firmOnPrice, false, "unchanged");
  });

  test("the Proposed Market Price keeps its rules", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    eq(refusal(await addCopy(ctx.app, "north", { canonicalCardId: cards.unlimited, grade: "PSA 9", ask: -1, firmOnPrice: true })), "invalid-amount", "a negative ask on add");
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200 });
    eq(refusal(await correct(ctx.app, "north", invId, { ask: "lots", firmOnPrice: true })), "invalid-amount", "a non-number ask on correction");
    eq((await rowOf(ctx, invId)).firmOnPrice, false, "and the preference beside a refused ask did not land");
  });

  test("the preference is not a protected fact: the domain treats it as the shop's own", async () => {
    const src = require("fs").readFileSync(require("path").join(ROOT, "domain/metyet-commands.js"), "utf8");
    assert(/const PROTECTED_COPY_FACTS = \["cert", "grade", "condition"\];/.test(src), "the protected facts moved");
  });
});

/* ============================================================== E */
describe("E. the Trusted Partner's screen", () => {
  const INVENTORY = build("client/tp/sections/Inventory.jsx").default;
  const shelf = async (ctx, sent, state) => {
    const door = { describe: async (ids) => ({ cards: await ctx.catalog.describeCanonicalCards(ids) }),
      find: async () => ({ contexts: [] }), read: async () => ({ canonicalCards: [] }),
      expansions: async () => ({ expansions: [] }), artists: async () => ({ artists: [] }) };
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(INVENTORY, { state, onBrowseCards: door,
        onAddCopy: async () => ({ ok: true }),
        onEditCopy: async (invId, patch) => { sent.push({ invId, patch }); return { ok: true }; },
        onRetireCopy: async () => ({ ok: true }) }));
    });
    await TR.act(async () => {}); await TR.act(async () => {});
    return r;
  };
  const press = async (r, label) => {
    const b = r.root.findAll((n) => n.type === "button").find((n) => texts(n).join(" ").trim() === label);
    assert(b, `no control "${label}"`);
    await TR.act(async () => { b.props.onClick(); }); await TR.act(async () => {});
  };
  const checkbox = (r) => r.root.findAll((n) => n.type === "input" && n.props.type === "checkbox");
  const words = (r) => texts(r.root).join(" ");

  test("the shelf says Proposed Market Price and how each copy is priced, never Ask", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200, firmOnPrice: true });
    await stock(ctx, "north", { canonicalCardId: cards.firstEdition, ask: 9900 });
    const r = await shelf(ctx, [], await view(ctx.app, "north"));
    const t = words(r);
    assert(/Proposed Market Price/.test(t), "the label");
    assert(/Firm on Price/.test(t) && /Open to Offers/.test(t), "one copy is firm, the other open");
    assert(!/\bAsk\b/.test(t), "the old word survived on this screen");
  });

  test("editing an Open copy shows the box unchecked, with its explanation, and sends false", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200 });
    const sent = [];
    const r = await shelf(ctx, sent, await view(ctx.app, "north"));
    await press(r, "Edit");
    const boxes = checkbox(r);
    eq(boxes.length, 1, "one Firm on Price box");
    eq(boxes[0].props.checked, false, "unchecked = Open to Offers");
    assert(words(r).includes(FIRM_HELP), "the explanation, word for word");
    assert(/Proposed Market Price/.test(words(r)), "the field label in the form");
    await press(r, "Save changes");
    eq(sent[0].patch.firmOnPrice, false, "a Save that changed nothing keeps it Open");
    eq(sent[0].invId, invId, "for this copy");
  });

  test("checking the box, saving, and opening the copy again shows it Firm", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200 });
    const sent = [];
    let r = await shelf(ctx, sent, await view(ctx.app, "north"));
    await press(r, "Edit");
    await TR.act(async () => { checkbox(r)[0].props.onChange({ target: { checked: true } }); });
    eq(checkbox(r)[0].props.checked, true, "the box took the click");
    await press(r, "Save changes");
    eq(sent[0].patch.firmOnPrice, true, "the edit carries the preference");
    eq((await correct(ctx.app, "north", invId, sent[0].patch)).statusCode, 200, "and the server accepts it");
    eq((await rowOf(ctx, invId)).firmOnPrice, true, "persisted");
    r = await shelf(ctx, [], await view(ctx.app, "north"));
    await press(r, "Edit");
    eq(checkbox(r)[0].props.checked, true, "reopened, it shows the saved choice");
  });

  test("a Firm copy saved without touching the box stays Firm", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 4200, firmOnPrice: true });
    const sent = [];
    const r = await shelf(ctx, sent, await view(ctx.app, "north"));
    await press(r, "Edit");
    eq(checkbox(r)[0].props.checked, true, "opens checked");
    await press(r, "Save changes");
    eq(sent[0].patch.firmOnPrice, true, "editing preserves the setting");
    await correct(ctx.app, "north", invId, sent[0].patch);
    eq((await rowOf(ctx, invId)).firmOnPrice, true, "still firm");
  });

  test("the add form starts Open to Offers — no pricing-policy step", async () => {
    const src = code("client/tp/sections/Inventory.jsx");
    assert(/const BLANK_FACTS = Object\.freeze\(\{[^}]*firmOnPrice: false[^}]*\}\)/.test(src), "a new copy's form starts unchecked");
    assert(!/minimum|range|bulk/i.test((src.match(/Firm on Price[\s\S]{0,400}/) || [""])[0]), "no thresholds, ranges or bulk controls beside it");
  });
});

run();
