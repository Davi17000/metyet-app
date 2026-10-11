/* ============================================================================
   PHASE 6 P6-F4 BATCH 3 — ADD CARDS TO A BINDER
   Binders express coherence. Collecting states express intent.
     A. the chooser      + Add cards → Add from My Cards · Browse new cards
     B. My Cards         the Collector's own Goals and copies; exact ids; no
                         silent moves ("Move from … to …?"); none re-sent;
                         refusals said; Try again files only what failed
     C. a new card       made on the Phase 6 card, then THAT record filed —
                         by the id the create returned; Retry filing never
                         re-creates; a lost answer is looked up, not resent
     D. coming back      Browse says where it is adding; Back to <binder>;
                         ordinary Browse unchanged
   Real-browser journeys: harness/phase6-filing-browser.cjs.
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const React = require("react");
const TR = require("react-test-renderer");

global.window = global.window || {};
Object.assign(global.window, { addEventListener() {}, removeEventListener() {} });

const ROOT = path.join(__dirname, "..");
const load = (rel) => {
  const out = esbuild.buildSync({ entryPoints: [path.join(ROOT, rel)], bundle: true, format: "cjs",
    write: false, logLevel: "silent", jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"], define: { "process.env.NODE_ENV": '"production"' } });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};
const Binder = load("client/collector/sections/Binder.jsx").default;
const CardDetail = load("client/collector/CardDetail.jsx").default;
const BROWSE = load("client/collector/sections/Browse.jsx");
const json = (v) => JSON.stringify(v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = async () => { for (let i = 0; i < 8; i += 1) await TR.act(async () => { await sleep(0); }); };
const textOf = (n) => (typeof n === "string" ? n : !n || !n.children ? "" : n.children.map(textOf).join(" "));
const flat = (n) => textOf(n).replace(/\s+/g, " ").trim();
const cls = (n) => String((n.props && n.props.className) || "");
const buttons = (r) => r.root.findAll((n) => n.type === "button");
const btn = (r, re) => buttons(r).find((b) => re.test(flat(b))) || null;
const tap = async (b) => { assert(b, "no such control"); await TR.act(async () => { b.props.onClick({ preventDefault() {} }); }); await settle(); };

/* ------------------------------------------------------------- Binders */
const ME = "c1";
const CARDS = {
  "cc-char": { canonicalCardId: "cc-char", cardName: "Charizard", expansionName: "Base Set", collectorNumber: "4", finish: "holofoil" },
  "cc-mud": { canonicalCardId: "cc-mud", cardName: "Mudkip", expansionName: "Ruby & Sapphire", collectorNumber: "60", finish: "non_holo" },
};
const STATE = () => ({
  actor: { seat: "collector", collectorId: ME },
  binders: [{ id: "b-mud", collectorId: ME, name: "Mudkips", createdAt: "2030-01-02", archivedAt: null },
    { id: "b-gen1", collectorId: ME, name: "Gen 1", createdAt: "2030-01-03", archivedAt: null }],
  goals: [{ id: "g-mud", collectorId: ME, canonicalCardId: "cc-mud", tier: "primary", desired: { grade: "PSA 9" }, createdAt: "2030-01-05" }],
  collectorCopies: [
    { id: "k-1", collectorId: ME, canonicalCardId: "cc-char", grade: "PSA 8", keeping: true, offered: false, status: "available", addedAt: "2030-01-06", grading: { state: "graded", label: "PSA 8" } },
    { id: "k-2", collectorId: ME, canonicalCardId: "cc-char", grade: "Raw", condition: "Near Mint", offered: true, status: "available", addedAt: "2030-01-07", grading: { state: "raw", label: "Raw · Near Mint" } },
    { id: "k-3", collectorId: ME, canonicalCardId: "cc-mud", grade: "PSA 10", keeping: true, status: "available", addedAt: "2030-01-08", grading: { state: "graded", label: "PSA 10" } }],
  binderMemberships: [{ id: "m1", binderId: "b-gen1", collectorCopyId: "k-1" }, { id: "m2", binderId: "b-mud", collectorCopyId: "k-3" }],
  binderEntries: [], catalog: [], partners: [], relationships: [], inventory: [], opportunities: [], discoveries: [],
});
async function binders({ answer = () => ({ ok: true }) } = {}) {
  const sent = []; let live = STATE(); let setLive = null; let refreshed = 0;
  const onFileObject = async (what) => {
    sent.push(["fileObject", what]);
    const a = answer(what);
    if (a === "throw") throw new Error("offline");
    if (!a || a.ok !== false) {
      const key = what.goalId ? "goalId" : "collectorCopyId";
      live = { ...live, binderMemberships: [...live.binderMemberships.filter((m) => m[key] !== what[key]), { id: `m${Math.random()}`, binderId: what.binderId, [key]: what[key] }] };
      setLive(live);
    }
    return a;
  };
  const added = [];
  function Live() {
    const [state, set] = React.useState(live); setLive = set;
    return React.createElement(Binder, { state, onSpecify: async (st) => { sent.push(["step", st]); return { ok: true }; },
      onBrowseCards: { describe: async (ids) => ({ cards: ids.map((id) => CARDS[id]).filter(Boolean) }) },
      onFileObject, onUnfileObject: async (w) => { sent.push(["unfileObject", w]); return { ok: true }; },
      onCreateBinder: async () => ({ ok: true }), onAddCards: (into) => added.push(into),
      onRefresh: async () => { refreshed += 1; } });
  }
  let r; await TR.act(async () => { r = TR.create(React.createElement(Live)); }); await settle();
  return { r, sent, added, get refreshed() { return refreshed; }, get live() { return live; } };
}
const openBinder = async (r, name) => {
  const head = buttons(r).find((n) => cls(n).includes("mcs-sechead") && /^Binders/.test(flat(n)));
  if (head.props["aria-expanded"] === false) await tap(head);
  const row = buttons(r).find((n) => cls(n).includes("mcs-bhead") && flat(n).startsWith(name));
  if (row.props["aria-expanded"] === false) await tap(row);
};
const chooser = (r) => r.root.findAll((n) => n.props && n.props.role === "dialog" && /^Add cards to /.test(String(n.props["aria-label"] || "")))[0] || null;
const picker = (r) => r.root.findAll((n) => n.props && n.props.role === "dialog" && /^Add to /.test(String(n.props["aria-label"] || "")))[0] || null;
const ptile = (r, key) => picker(r).findAll((n) => n.type === "li" && n.props["data-key"] === key)[0];
const pick = async (r, key) => tap(ptile(r, key).findAll((n) => n.type === "button")[0]);
const addBtn = (r) => picker(r).findAll((n) => n.type === "button" && cls(n).includes("mcs-cd-add"))[0];
const startPicking = async (r, name = "Mudkips") => {
  await openBinder(r, name);
  await tap(btn(r, /^\+ Add cards$/));
  await tap(btn(r, /^Add from My Cards/));
  assert(picker(r), "no picker");
};
const snackText = (r) => { const s = r.root.findAll((n) => cls(n).split(" ").includes("mcs-snack-wrap"))[0]; return s ? flat(s) : ""; };

/* ============================================================== A */
describe("A. + Add cards: a simple choice", () => {
  test("two ways in, and choosing writes nothing", async () => {
    const s = await binders();
    await openBinder(s.r, "Mudkips");
    await tap(btn(s.r, /^\+ Add cards$/));
    assert(chooser(s.r) && /Add cards to Mudkips/.test(flat(chooser(s.r))));
    eq(json(chooser(s.r).findAll((n) => n.type === "button" && cls(n).includes("mcs-addto-opt")).map((b) => flat(b.findAll((x) => x.type === "b")[0]))), json(["Add from My Cards", "Browse new cards"]));
    eq(s.sent.length, 0);
    await tap(btn(s.r, /^Browse new cards/));
    eq(json(s.added), json([{ binderId: "b-mud", name: "Mudkips" }]), "Browse did not carry the binder");
  });
});

/* ============================================================== B */
describe("B. Add from My Cards", () => {
  test("every Goal and copy, with its state, its home, and — for this binder — marked and not offered", async () => {
    const s = await binders();
    await startPicking(s.r);
    assert(/1 already in Mudkips\./.test(flat(picker(s.r))));
    const here = ptile(s.r, "c:k-3");
    eq(here.findAll((n) => n.type === "button")[0].props.disabled, true, "a card already here can be picked");
    assert(/This binder/.test(flat(here)));
    assert(/in Gen 1/.test(flat(ptile(s.r, "c:k-1"))) && /Unfiled/.test(flat(ptile(s.r, "c:k-2"))) && /Unfiled/.test(flat(ptile(s.r, "g:g-mud"))));
    assert(ptile(s.r, "g:g-mud").findAll((n) => n.props && n.props["data-collecting"] === "primary").length === 1, "the Goal's state is not shown");
  });
  test("an Unfiled copy: one fileObject naming exactly that copy — not its twin", async () => {
    const s = await binders();
    await startPicking(s.r);
    await pick(s.r, "c:k-2");
    assert(/Add 1 to Mudkips/.test(flat(addBtn(s.r))));
    await tap(addBtn(s.r));
    eq(json(s.sent), json([["fileObject", { binderId: "b-mud", collectorCopyId: "k-2" }]]));
    eq(picker(s.r), null, "the picker stayed");
    assert(/1 added to Mudkips\. Add more/.test(snackText(s.r)), snackText(s.r));
    assert(s.r.root.findAll((n) => n.props && n.props["data-binder"] === "b-mud" && cls(n).split(" ").includes("open")).length === 1, "the binder is not opened");
  });
  test("a Goal and a copy together: each by its own id", async () => {
    const s = await binders();
    await startPicking(s.r);
    await pick(s.r, "g:g-mud"); await pick(s.r, "c:k-2");
    await tap(addBtn(s.r));
    const sorted = (xs) => xs.map((x) => json(x)).sort();
    eq(json(sorted(s.sent.map(([, w]) => w))), json(sorted([{ binderId: "b-mud", goalId: "g-mud" }, { binderId: "b-mud", collectorCopyId: "k-2" }])));
  });
  test("one in another binder: nothing moves until 'Move from Gen 1 to Mudkips?' is confirmed", async () => {
    const s = await binders();
    await startPicking(s.r);
    await pick(s.r, "c:k-1");
    assert(/1 card will move here from Gen 1\./.test(flat(picker(s.r))), flat(picker(s.r)));
    await tap(addBtn(s.r));
    eq(s.sent.length, 0, "it moved without asking");
    assert(/Move from Gen 1 to Mudkips\? Charizard will move here — it won't stay there too\./.test(flat(picker(s.r))), flat(picker(s.r)));
    await tap(btn(s.r, /^Back$/));
    eq(s.sent.length, 0, "Back moved it");
    await tap(addBtn(s.r));
    await tap(btn(s.r, /^Move and add$/));
    eq(json(s.sent), json([["fileObject", { binderId: "b-mud", collectorCopyId: "k-1" }]]));
    assert(/1 added to Mudkips · 1 moved from another binder\./.test(snackText(s.r)), snackText(s.r));
  });
  test("ticking and unticking writes nothing; nothing ticked, nothing to add", async () => {
    const s = await binders();
    await startPicking(s.r);
    await pick(s.r, "c:k-2"); await pick(s.r, "c:k-2");
    eq(addBtn(s.r).props["aria-disabled"], true);
    await tap(addBtn(s.r));
    eq(s.sent.length, 0);
  });
  test("a refusal is said, nothing is claimed for it, and Try again files only what failed", async () => {
    let n = 0;
    const s = await binders({ answer: (w) => (w.goalId && n++ === 0 ? { ok: false, refused: "binder-archived" } : { ok: true }) });
    await startPicking(s.r);
    await pick(s.r, "g:g-mud"); await pick(s.r, "c:k-2");
    await tap(addBtn(s.r));
    assert(/1 added to Mudkips\. Mudkip couldn't be added: That binder has been put away/.test(snackText(s.r)), snackText(s.r));
    assert(s.refreshed >= 1, "a stale screen was not re-read");
    await tap(btn(s.r, /^Try again$/));
    eq(s.sent.length, 3, "the retry sent more than what failed");
    eq(json(s.sent[2][1]), json({ binderId: "b-mud", goalId: "g-mud" }), "the retry re-sent what had worked");
  });
  test("lost contact: said; re-read; nothing claimed for that card", async () => {
    const s = await binders({ answer: () => "throw" });
    await startPicking(s.r);
    await pick(s.r, "c:k-2");
    await tap(addBtn(s.r));
    assert(/Charizard couldn't be added: MetYet lost contact/.test(snackText(s.r)) && !/added to Mudkips/.test(snackText(s.r)), snackText(s.r));
    assert(s.refreshed >= 1);
  });
  test("filing never changes what a card is: only fileObject is sent", async () => {
    const s = await binders();
    await startPicking(s.r);
    await pick(s.r, "g:g-mud"); await pick(s.r, "c:k-2"); await pick(s.r, "c:k-1");
    await tap(addBtn(s.r)); await tap(btn(s.r, /^Move and add 3$/));
    for (const [k] of s.sent) eq(k, "fileObject");
    eq(json(s.live.goals), json(STATE().goals)); eq(json(s.live.collectorCopies), json(STATE().collectorCopies));
  });
});

/* ============================================================== C */
const MUD = { cardContextId: "ctx-60", cardName: "Mudkip", expansionName: "Ruby & Sapphire", collectorNumber: "60", artist: "Ken Sugimori" };
const P = (id, finish) => ({ canonicalCardId: id, cardContextId: "ctx-60", printRun: "unlimited", finish, language: "en", stamp: "none", printVariation: "standard", status: "active" });
const CARDS2 = [P("k-n", "non_holo"), P("k-r", "reverse_holofoil")];
function card({ server, state = {}, refreshTo = null }) {
  const sent = []; const added = []; let r; let cur = state;
  const props = () => ({ context: { ...MUD, cards: CARDS2 }, state: cur, onClose() {},
    fileInto: { binderId: "b-mud", name: "Mudkips" },
    onSave: async (step, id) => { sent.push([step.kind, step, id]); return server(step, sent); },
    onAdded: (ack) => added.push(ack),
    onRefresh: async () => { if (refreshTo) { cur = refreshTo(cur); await TR.act(async () => { r.update(React.createElement(CardDetail, props())); }); } } });
  TR.act(() => { r = TR.create(React.createElement(CardDetail, props())); });
  return { r, sent, added };
}
const choose = async (r, ...titles) => {
  for (const t of titles) {
    const b = r.root.findAll((n) => n.type === "button" && cls(n).includes("mcs-cd-choice")
      && (n.findAll((x) => x.type === "b")[0] || { children: [] }).children.join("") === t)[0];
    assert(b, `no choice ${t}`); await tap(b);
  }
};
const add = (r) => tap(r.root.findAll((n) => n.type === "button" && cls(n).includes("mcs-cd-add"))[0]);
const dock = (r) => flat(r.root.findAll((n) => cls(n) === "mcs-cd-dock")[0]);
describe("C. a new card, filed into the binder it was added from", () => {
  test("a Goal: start-looking, then file-object naming the id the create returned — and only then success", async () => {
    const { r, sent, added } = card({ server: (st) => (st.kind === "start-looking" ? { ok: true, value: "g-new" } : { ok: true }) });
    assert(/Adding to Mudkips/.test(dock(r)));
    await choose(r, "Normal", "Graded", "PSA 9", "I'm looking for it", "Primary");
    await add(r);
    eq(json(sent.map((x) => x[0])), json(["start-looking", "file-object"]));
    eq(json(sent[1][1]), json({ kind: "file-object", binderId: "b-mud", goalId: "g-new" }));
    assert(/✓ Added to Mudkips/.test(dock(r)) && /in Mudkips/.test(dock(r)), dock(r));
    await TR.act(async () => { await sleep(1000); });
    eq(added.length, 1);
  });
  test("a copy: record-copy, then file-object naming that copy", async () => {
    const { r, sent } = card({ server: (st) => (st.kind === "record-copy" ? { ok: true, value: "k-new" } : { ok: true }) });
    await choose(r, "Reverse Holo", "Raw", "Near Mint", "I own it", "Trade / Sell");
    await add(r);
    eq(json(sent[1][1]), json({ kind: "file-object", binderId: "b-mud", collectorCopyId: "k-new" }));
  });
  test("made but not filed: said plainly; Retry filing sends the filing — the same id — never the create", async () => {
    let files = 0;
    const { r, sent, added } = card({ server: (st) => (st.kind === "record-copy" ? { ok: true, value: "k-new" }
      : files++ === 0 ? { ok: false, refused: "binder-archived" } : { ok: true }) });
    await choose(r, "Normal", "Raw", "Near Mint", "I own it", "Personal collection");
    await add(r);
    assert(/Personal collection saved — but it couldn't go into Mudkips: that binder has been put away\. It's Unfiled\./.test(dock(r)), dock(r));
    assert(!/✓/.test(dock(r)), "success claimed for a half");
    assert(/Retry filing/.test(dock(r)));
    await add(r);
    eq(json(sent.map((x) => x[0])), json(["record-copy", "file-object", "file-object"]), "the retry re-created");
    eq(sent[2][1].collectorCopyId, "k-new");
    assert(/✓ Added to Mudkips/.test(dock(r)), dock(r));
    await TR.act(async () => { await sleep(1000); });
    eq(added.length, 1);
  });
  test("a refused create files nothing", async () => {
    const { r, sent } = card({ server: () => ({ ok: false, refused: "duplicate-goal" }) });
    await choose(r, "Normal", "Graded", "PSA 9", "I'm looking for it", "Primary");
    await add(r);
    eq(json(sent.map((x) => x[0])), json(["start-looking"]));
    assert(/Nothing was saved/.test(dock(r)));
  });
  test("lost answer to the create, and it WAS made: re-read, then file that record — no second create", async () => {
    const { r, sent } = card({ server: (st) => { if (st.kind === "record-copy") throw new Error("offline"); return { ok: true }; },
      refreshTo: (s) => ({ ...s, collectorCopies: [...((s && s.collectorCopies) || []), { id: "k-found", canonicalCardId: "k-n" }] }) });
    await choose(r, "Normal", "Raw", "Near Mint", "I own it", "Personal collection");
    await add(r);
    eq(json(sent.map((x) => x[0])), json(["record-copy", "file-object"]));
    eq(sent[1][1].collectorCopyId, "k-found");
  });
  test("lost answer, NOT made: nothing filed, nothing resent, and it says so", async () => {
    const { r, sent } = card({ server: (st) => { if (st.kind === "record-copy") throw new Error("offline"); return { ok: true }; }, refreshTo: (s) => s });
    await choose(r, "Normal", "Raw", "Near Mint", "I own it", "Personal collection");
    await add(r);
    eq(json(sent.map((x) => x[0])), json(["record-copy"]));
    assert(/lost contact, and nothing was saved/.test(dock(r)), dock(r));
  });
  test("lost answer, and two new copies of the card appeared: nothing is guessed, nothing filed", async () => {
    const { r, sent } = card({ server: (st) => { if (st.kind === "record-copy") throw new Error("offline"); return { ok: true }; },
      refreshTo: (s) => ({ ...s, collectorCopies: [{ id: "k-a", canonicalCardId: "k-n" }, { id: "k-b", canonicalCardId: "k-n" }] }) });
    await choose(r, "Normal", "Raw", "Near Mint", "I own it", "Personal collection");
    await add(r);
    eq(json(sent.map((x) => x[0])), json(["record-copy"]), "a guessed record was filed");
    assert(/Check Binders before trying again/.test(dock(r)), dock(r));
  });
  test("a filing whose answer was lost but landed: Retry filing looks first and sends nothing again", async () => {
    let files = 0;
    const st = { binderMemberships: [] };
    const { r, sent } = card({ state: st, server: (s) => {
      if (s.kind === "record-copy") return { ok: true, value: "k-new" };
      files += 1; if (files === 1) throw new Error("offline");
      return { ok: true }; },
    refreshTo: (s) => ({ ...s, binderMemberships: [{ binderId: "b-mud", collectorCopyId: "k-new" }] }) });
    await choose(r, "Normal", "Raw", "Near Mint", "I own it", "Personal collection");
    await add(r);
    assert(/It may be there already; Retry filing checks\./.test(dock(r)), dock(r));
    await add(r);
    eq(json(sent.map((x) => x[0])), json(["record-copy", "file-object"]), "it re-filed what had landed");
    assert(/✓ Added to Mudkips/.test(dock(r)), dock(r));
  });
});

/* ============================================================== D */
describe("D. coming back, and ordinary Browse unchanged", () => {
  const CTX = [{ ...MUD, pokedexNumbers: [258] }];
  const browse = (extra) => {
    const calls = [];
    const door = { find: async () => ({ contexts: CTX, total: 1, page: 1, pageSize: 24 }),
      read: async () => ({ context: CTX[0], canonicalCards: [P("k-n", "non_holo")] }),
      describe: async () => ({ cards: [] }), expansions: async () => ({ expansions: [], total: 0 }),
      artists: async () => ({ artists: [], total: 0 }), pokemon: async () => ({ pokemon: [], total: 0 }) };
    let session = BROWSE.newBrowseSession(); let r;
    const draw = () => TR.act(async () => {
      const el = React.createElement(BROWSE.default, { state: {}, session, onSession: (x) => { session = x; draw(); },
        onSpecify: async (step) => { calls.push(step.kind); return step.kind === "record-copy" ? { ok: true, value: "k-new" } : { ok: true }; },
        onBrowseCards: door, ...extra });
      if (r) r.update(el); else r = TR.create(el);
    });
    return { calls, draw, get r() { return r; } };
  };
  const addOne = async (b) => {
    await b.draw();
    const input = b.r.root.findAll((n) => n.type === "input").find((n) => n.props["aria-label"] === "Search");
    await TR.act(async () => { input.props.onChange({ target: { value: "mudkip" } }); }); await settle(); await b.draw(); await settle();
    await tap(btns2(b.r).find((x) => x.props["aria-label"] === "Mudkip, Ruby & Sapphire #60"));
    await choose(b.r, "Raw", "Near Mint", "I own it", "Personal collection");
    await add(b.r);
    await TR.act(async () => { await sleep(1000); }); await settle();
  };
  const btns2 = (r) => r.root.findAll((n) => n.type === "button");
  test("from a binder: the note offers Add another and Back to <binder>; Back goes back", async () => {
    let back = 0;
    const b = browse({ fillingBinder: { binderId: "b-mud", name: "Mudkips" }, onBackToBinder: () => { back += 1; } });
    await addOne(b);
    eq(json(b.calls), json(["record-copy", "file-object"]));
    const note = b.r.root.findAll((n) => cls(n) === "mcs-d-ack")[0];
    assert(note && /Personal collection ✓ Mudkip #60 · Raw · Near Mint · Normal · in Mudkips/.test(flat(note)), note ? flat(note) : "no note");
    await tap(btns2(b.r).find((x) => flat(x) === "Back to Mudkips"));
    eq(back, 1);
  });
  test("ordinary Browse: one command, no filing, no binder words", async () => {
    const b = browse({});
    await addOne(b);
    eq(json(b.calls), json(["record-copy"]));
    const note = b.r.root.findAll((n) => cls(n) === "mcs-d-ack")[0];
    assert(note && !/Back to|Add another|in Mudkips/.test(flat(note)), flat(note));
  });
  test("the Card Specification is no longer reachable from Browse", () => {
    const src = fs.readFileSync(path.join(ROOT, "client/collector/sections/Browse.jsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert(!/CardSpecification/.test(src), "Browse still imports the old form");
  });
});

run();
