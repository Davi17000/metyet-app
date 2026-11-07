/* ============================================================================
   MARKET VALIDATION — BATCH 2.1: WHOLE DOLLARS
   MetYet prices in whole dollars. A NEW Proposed Market Price is a whole number
   of dollars above zero (refused, never rounded); a price stored in cents
   before this rule is left alone and never blocks an unrelated correction; a
   final cash adjustment is whole dollars, keeping its sign convention.
     A. inventory        add and correct, through the real server
     B. history          a cents price stays, edits around it still land
     C. the TP's form    whole-dollar entry, clear feedback, no rounding
     D. final cash       proposeFinalBalance, and what was already agreed
   CSV import is covered in phase5-c8-inventory-csv-mapping (price-not-whole-
   dollars / price-not-positive); Market Validation offers and counters in
   market-validation-b2-domain-rules. The inventory harness is the C5 suite's.
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
const { validateWorld } = require("../domain/metyet-world.js");
const { createStore } = require("./fixture-store.cjs");

const setStoredAsk = async (ctx, invId, ask) => {
  const w = await ctx.repository.loadWorld(); w.inventory.find((i) => i.invId === invId).ask = ask;
  await ctx.repository.saveWorld(w);
  eq((await rowOf(ctx, invId)).ask, ask, "the historical fixture landed");
};

/* ============================================================== A */
describe("A. a new or changed price is whole dollars above zero", () => {
  test("a whole-dollar price is accepted on add, and stored as that integer", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 120 });
    eq((await rowOf(ctx, invId)).ask, 120, "$120");
  });
  test("cents, zero and negatives are refused on add, and nothing is created", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    for (const bad of [120.5, 0.5, 120.01, 0, -1, "120.5"]) {
      const before = (await ctx.repository.loadWorld()).inventory.length;
      eq(refusal(await addCopy(ctx.app, "north", { canonicalCardId: cards.unlimited, grade: "PSA 9", ask: bad })), "invalid-amount", `ask ${JSON.stringify(bad)}`);
      eq((await ctx.repository.loadWorld()).inventory.length, before, "nothing created");
    }
    eq(refusal(await addCopy(ctx.app, "north", { canonicalCardId: cards.unlimited, grade: "PSA 9" })), null, "an unpriced copy is still fine");
  });
  test("a whole-dollar edit lands; a fractional or zero edit is refused and changes nothing", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 120 });
    eq((await correct(ctx.app, "north", invId, { ask: 130 })).statusCode, 200, "whole dollars");
    eq((await rowOf(ctx, invId)).ask, 130, "$130");
    const before = json(await rowOf(ctx, invId));
    for (const bad of [130.5, 99.99, 0, -5]) {
      eq(refusal(await correct(ctx.app, "north", invId, { ask: bad, cert: "11112222" })), "invalid-amount", `edit to ${bad}`);
    }
    eq(json(await rowOf(ctx, invId)), before, "nothing changed — not even the cert beside it");
    eq((await correct(ctx.app, "north", invId, { ask: null })).statusCode, 200, "clearing the price is still allowed");
  });
  test("the shop's private cost is not a price, and keeps its rules", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 120, cost: 87.5 });
    eq((await rowOf(ctx, invId)).cost, 87.5, "a cost with cents is unchanged behaviour");
  });
});

/* ============================================================== B */
describe("B. a price stored in cents before the rule", () => {
  test("stays as it was, is still valid, and is shown to a Collector unchanged", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 120 });
    await setStoredAsk(ctx, invId, 42.6);
    const v = validateWorld(await ctx.repository.loadWorld());
    assert(v.ok, "a historical cents price made the world invalid: " + json(v.errors));
    eq((await view(ctx.app, "casey")).inventory.find((i) => i.invId === invId).ask, 42.6, "not rewritten on the way out");
  });
  test("an unrelated correction still lands, with or without the price sent back unchanged", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 120 });
    await setStoredAsk(ctx, invId, 42.6);
    eq((await correct(ctx.app, "north", invId, { cert: "55556666" })).statusCode, 200, "cert only");
    eq((await correct(ctx.app, "north", invId, { ask: 42.6, firmOnPrice: true })).statusCode, 200, "the same price sent back, beside a real change");
    const row = await rowOf(ctx, invId);
    eq(row.ask, 42.6, "price untouched"); eq(row.cert, "55556666", "cert landed"); eq(row.firmOnPrice, true, "preference landed");
  });
  test("but changing it means a whole-dollar price", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 120 });
    await setStoredAsk(ctx, invId, 42.6);
    eq(refusal(await correct(ctx.app, "north", invId, { ask: 43.5 })), "invalid-amount", "to another cents price");
    eq((await correct(ctx.app, "north", invId, { ask: 43 })).statusCode, 200, "to whole dollars");
    eq((await rowOf(ctx, invId)).ask, 43, "$43");
  });
});

/* ============================================================== C */
describe("C. the Trusted Partner's form", () => {
  const INVENTORY = build("client/tp/sections/Inventory.jsx").default;
  const shelf = async (ctx, sent, state) => {
    const door = { describe: async (ids) => ({ cards: await ctx.catalog.describeCanonicalCards(ids) }),
      find: async () => ({ contexts: [] }), read: async () => ({ canonicalCards: [] }),
      expansions: async () => ({ expansions: [] }), artists: async () => ({ artists: [] }) };
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(INVENTORY, { state, onBrowseCards: door, onAddCopy: async () => ({ ok: true }),
        onEditCopy: async (invId, patch) => { sent.push({ invId, patch }); return { ok: true }; }, onRetireCopy: async () => ({ ok: true }) }));
    });
    await TR.act(async () => {}); await TR.act(async () => {});
    return r;
  };
  const press = async (r, label) => {
    const b = r.root.findAll((n) => n.type === "button").find((n) => texts(n).join(" ").trim() === label);
    assert(b, `no control "${label}"`); await TR.act(async () => { b.props.onClick(); }); await TR.act(async () => {});
  };
  const priceBox = (r) => r.root.findAll((n) => n.type === "label" && texts(n).join(" ").includes("Proposed Market Price"))
    .map((l) => l.findAll((n) => n.type === "input")[0]).find(Boolean);
  const saveButton = (r) => r.root.findAll((n) => n.type === "button").find((n) => texts(n).join(" ").trim() === "Save changes");
  const type = async (r, v) => { await TR.act(async () => { priceBox(r).props.onChange({ target: { value: v } }); }); };

  test("the price box is a whole-number field", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 120 });
    const r = await shelf(ctx, [], await view(ctx.app, "north"));
    await press(r, "Edit");
    eq(priceBox(r).props.inputMode, "numeric", "a numeric keyboard, not a decimal one");
  });
  test("typing cents says so, disables Save, and never rounds", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 120 });
    const sent = []; const r = await shelf(ctx, sent, await view(ctx.app, "north"));
    await press(r, "Edit");
    await type(r, "120.50");
    assert(texts(r.root).join(" ").includes("A Proposed Market Price is whole dollars — no cents."), "the message");
    eq(saveButton(r).props.disabled, true, "Save is disabled");
    await TR.act(async () => { saveButton(r).props.onClick(); });
    eq(sent.length, 0, "nothing was sent — and nothing was rounded to $121 or $120");
    await type(r, "0");
    assert(texts(r.root).join(" ").includes("A Proposed Market Price is above $0."), "zero gets its own message");
    await type(r, "125");
    eq(saveButton(r).props.disabled, false, "a whole-dollar price can be saved");
    await press(r, "Save changes");
    eq(sent[0].patch.ask, 125, "$125 sent, as typed");
  });
  test("a historical cents price does not block saving something else", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 120 });
    await setStoredAsk(ctx, invId, 42.6);
    const sent = []; const r = await shelf(ctx, sent, await view(ctx.app, "north"));
    await press(r, "Edit");
    eq(saveButton(r).props.disabled, false, "the untouched historical price is not flagged");
    await press(r, "Save changes");
    eq(sent[0].patch.ask, 42.6, "the stored price goes back exactly as it was");
    eq((await correct(ctx.app, "north", invId, sent[0].patch)).statusCode, 200, "and the server accepts it");
    eq((await rowOf(ctx, invId)).ask, 42.6, "unchanged");
  });
  test("the shelf shows prices without cents", async () => {
    const ctx = await world(); const cards = await charizard(ctx);
    const invId = await stock(ctx, "north", { canonicalCardId: cards.unlimited, ask: 120 });
    await setStoredAsk(ctx, invId, 42.6);
    const r = await shelf(ctx, [], await view(ctx.app, "north"));
    const t = texts(r.root).join(" ");
    assert(t.includes("$43") && !t.includes("42.6") && !/\$\d+\.\d/.test(t), "whole-dollar display");
  });
});

/* ============================================================== D */
describe("D. the final cash adjustment is whole dollars", () => {
  const AT = "2026-10-08"; let seq = 0;
  const rt = () => require("../domain/metyet-runtime.js").createRuntime({ now: () => AT, newId: (p = "") => `${p}${++seq}` });
  const TPA = { partnerId: "nl" }; const C = { collectorId: "casey" };
  const deal = (over = {}) => createStore({
    partners: [{ id: "nl", name: "Northline", tradeRate: 0.7 }], collectors: [{ id: "casey", name: "Casey" }],
    relationships: [{ partnerId: "nl", collectorId: "casey", status: "accepted", at: AT }],
    goals: [{ id: "gA", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } }],
    inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 120, grade: "PSA 9", photos: { front: "f", back: "b" } }],
    collectorCopies: [], binders: [], binderEntries: [], opportunities: [], catalog: [],
    copyReviews: [], photoRequests: [], conversations: [], interests: [], ...over }, rt());
  const x = (st, a, c, p) => st.execute(a, c, { at: AT, ...(p || {}) });
  const atDeal = () => {
    const st = deal();
    const o = x(st, C, "startOpportunity", { goalId: "gA", invId: "i1", amount: 110 }).value;
    assert(x(st, TPA, "acceptPrice", { oppId: o }).ok, "agree"); assert(x(st, C, "chooseCashOnly", { oppId: o }).ok, "cash only");
    assert(x(st, TPA, "acceptDeal", { oppId: o }).ok, "partner's final");
    return { st, o, opp: () => st.get().opportunities.find((y) => y.id === o) };
  };
  test("whole dollars are accepted — positive, negative (the partner pays) and zero", () => {
    for (const amount of [100, -15, 0]) {
      const { st, o, opp } = atDeal();
      const r = x(st, C, "proposeFinalBalance", { oppId: o, amount });
      assert(r.ok, `$${amount} refused: ${r.refused}`);
      eq(D.lastEntry(opp().deal.adjThread).amount, amount, `$${amount} proposed, sign kept`);
    }
  });
  test("cents are refused, and nothing is recorded", () => {
    for (const amount of [100.5, -15.25, 0.01, "100"]) {
      const { st, o, opp } = atDeal();
      const before = json(opp());
      eq(x(st, C, "proposeFinalBalance", { oppId: o, amount }).refused, "invalid-amount", `${JSON.stringify(amount)} refused`);
      eq(json(opp()), before, "nothing recorded");
    }
  });
  test("an agreed whole-dollar adjustment is the final balance; the settlement formula is unchanged", () => {
    const { st, o, opp } = atDeal();
    eq(D.calculatedBalance(opp()), 110, "calculated: the agreed price, no trade credit");
    assert(x(st, C, "proposeFinalBalance", { oppId: o, amount: 105 }).ok, "propose $105");
    assert(x(st, TPA, "acceptDeal", { oppId: o }).ok, "partner accepts the figure");
    assert(x(st, C, "acceptDeal", { oppId: o }).ok, "collector confirms");
    eq(D.finalBalance(opp()), 105, "final: $105");
    eq(opp().stage, "fulfillment", "on to fulfilment");
  });
  test("an agreement already recorded in cents is kept and still reads", () => {
    const { st, opp } = atDeal();
    const w = st.get(); const r = w.opportunities[0];
    r.deal = { ...r.deal, agreedAdj: 104.5 };
    eq(D.finalBalance(r), 104.5, "the historical figure is not rewritten");
    const v = validateWorld(w); assert(v.ok, "a historical cents agreement made the world invalid: " + json(v.errors));
  });
});

run();
