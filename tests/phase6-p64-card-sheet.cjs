/* ============================================================================
   PHASE 6 P6-4 — THE FOUR-STATE CARD SHEET, AND A LIGHTER CONFIRMATION
   Reference: phase6-prototype-01 @ fca2c61 (ObjectSheet, iteration 8C).
   A tap on a Goal or copy opens ITS sheet: the card, what it is to you, where
   it lives, and — only when asked — its facts and the full card.
     A. Goals          Primary ↔ Secondary, one updateGoalTier, said after the answer
     B. copies         PC ↔ Trade / Sell, one disposition command; "Owned" chooses
     C. the pairs      a Goal is never turned into a copy, nor a copy into a Goal
     D. independence   a state change moves nothing; a move changes no state
     E. refusals       said, never claimed; stale or lost contact re-reads
     F. one at a time  duplicate taps, filing during a change, a hold behind a sheet
     G. confirmation   a compact bar above the tab bar and the sheet; Undo there,
                       guarded, re-checked, and gone after a few seconds
     H. a11y and shape thumb-sized choices, labelled groups, a modal dialog
     I. boundaries     only the existing steps; no command named
   Real-browser coverage (390px, touch) is harness/phase6-filing-browser.cjs.
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const React = require("react");
const TR = require("react-test-renderer");

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
const Shell = load("client/collector/CollectorShell.jsx").default;
const json = (v) => JSON.stringify(v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------- a world */
const ME = "c1";
const CARDS = {
  "cc-char": { canonicalCardId: "cc-char", cardName: "Charizard", expansionName: "Base Set", collectorNumber: "4", finish: "holofoil", imageSmall: null },
  "cc-ven": { canonicalCardId: "cc-ven", cardName: "Venusaur", expansionName: "Base Set", collectorNumber: "15", finish: "holofoil", imageSmall: null },
  "cc-pika": { canonicalCardId: "cc-pika", cardName: "Pikachu", expansionName: "Base Set", collectorNumber: "58", finish: "non_holo", imageSmall: null },
};
const AT = "2030-01-0";
const STATE = () => ({
  actor: { seat: "collector", collectorId: ME },
  binders: [
    { id: "b-gen1", collectorId: ME, name: "Gen 1", createdAt: "2030-01-03", archivedAt: null },
    { id: "b-mud", collectorId: ME, name: "Mudkips", createdAt: "2030-01-02", archivedAt: null },
    { id: "b-old", collectorId: ME, name: "Old Trades", createdAt: "2030-01-01", archivedAt: "2030-01-04" }],
  goals: [
    { id: "g-char", collectorId: ME, canonicalCardId: "cc-char", tier: "primary", desired: { grade: "PSA 9" }, createdAt: `${AT}5` },
    { id: "g-ven", collectorId: ME, canonicalCardId: "cc-ven", tier: "secondary", createdAt: `${AT}5` }],
  collectorCopies: [
    { id: "k-char", collectorId: ME, canonicalCardId: "cc-char", grading: { state: "graded", label: "PSA 8" }, keeping: true, offered: false, status: "available", cert: "C-8", addedAt: `${AT}6` },
    { id: "k-pika", collectorId: ME, canonicalCardId: "cc-pika", grading: { state: "graded", label: "PSA 7" }, offered: true, status: "available", addedAt: `${AT}6` },
    { id: "k-ven", collectorId: ME, canonicalCardId: "cc-ven", grading: { state: "graded", label: "PSA 6" }, offered: false, status: "available", addedAt: `${AT}6` }],
  binderMemberships: [
    { id: "m1", binderId: "b-gen1", goalId: "g-char" },
    { id: "m2", binderId: "b-gen1", collectorCopyId: "k-char" }],
  binderEntries: [],
  catalog: [], partners: [], relationships: [], inventory: [], opportunities: [], discoveries: [],
});
const door = { describe: async (ids) => ({ cards: ids.map((id) => CARDS[id]).filter(Boolean) }) };

/* THE LIVE PROJECTION: what a confirmed command would leave, as the store
   would re-read it. Refusals and lost contact leave it exactly as it was. */
const applyStep = (s, step) => {
  if (step.kind === "how-hard") return { ...s, goals: s.goals.map((g) => (g.id === step.goalId ? { ...g, tier: step.tier } : g)) };
  if (step.kind === "keeping") return { ...s, collectorCopies: s.collectorCopies.map((c) => (c.id === step.copyId ? { ...c, keeping: true, offered: false } : c)) };
  if (step.kind === "offering") return { ...s, collectorCopies: s.collectorCopies.map((c) => (c.id === step.copyId ? { ...c, offered: true, keeping: false } : c)) };
  return s;
};
const applyFile = (s, name, what) => {
  const key = what.goalId ? "goalId" : "collectorCopyId";
  const rest = s.binderMemberships.filter((m) => m[key] !== what[key]);
  return { ...s, binderMemberships: name === "fileObject"
    ? [...rest, { id: `m-${Math.random()}`, binderId: what.binderId, [key]: what[key] }] : rest };
};

async function show(opts = {}) {
  const sent = []; const gates = []; const refreshes = [];
  let setLive = null; let live = opts.state || STATE();
  const answer = async (name, apply) => {
    if (opts.hold) { const g = {}; g.promise = new Promise((r) => { g.resolve = r; }); gates.push(g); const a = await g.promise; if (!a || a.ok !== false) apply(); return a; }
    const a = opts.answer ? opts.answer(name) : { ok: true };
    if (a === "throw") throw new Error("offline");
    if (!a || a.ok !== false) apply();
    return a;
  };
  const commit = (next) => { live = next; if (setLive) setLive(next); };
  const props = {
    onBrowseCards: door,
    onSpecify: async (step, canonicalCardId) => { sent.push(["step", step]); return answer(step.kind, () => commit(applyStep(live, step))); },
    onFileObject: async (what) => { sent.push(["fileObject", what]); return answer("fileObject", () => commit(applyFile(live, "fileObject", what))); },
    onUnfileObject: async (what) => { sent.push(["unfileObject", what]); return answer("unfileObject", () => commit(applyFile(live, "unfileObject", what))); },
    onCreateBinder: async () => ({ ok: true }), onRenameBinder: async () => ({ ok: true }), onArchiveBinder: async () => ({ ok: true }),
    onAddCards: () => {},
    onRefresh: async () => { refreshes.push(1); if (opts.onRefresh) commit(opts.onRefresh(live)); },
  };
  function Live() {
    const [state, set] = React.useState(live);
    setLive = set;
    return React.createElement(Binder, { state, ...props });
  }
  let r;
  await TR.act(async () => { r = TR.create(React.createElement(Live)); });
  await settle();
  return { r, sent, gates, refreshes, commit: (f) => TR.act(async () => { commit(f(live)); }) };
}
const settle = async () => { for (let i = 0; i < 6; i += 1) await TR.act(async () => { await sleep(0); }); };
const textOf = (n) => (typeof n === "string" ? n : !n || !n.children ? "" : n.children.map(textOf).join(" "));
const flat = (n) => textOf(n).replace(/\s+/g, " ").trim();
const cls = (n) => String((n.props && n.props.className) || "");
const buttons = (r) => r.root.findAll((n) => n.type === "button");
const btn = (r, re) => buttons(r).find((b) => re.test(flat(b))) || null;
const yourCards = (r) => r.root.findAll((n) => n.type === "section" && n.props["aria-label"] === "Your Cards")[0];
const tileOf = (r, state, name) => yourCards(r).findAll((n) => n.type === "li" && cls(n).includes("mcs-otile"))
  /* RESTATED (P6-F4 B1): the card's name now leads the identity line (mcs-oq), after its state */
  .find((li) => flat(li.findAll((n) => /\bmcs-mk\b/.test(cls(n)))[0]) === state && new RegExp(`^${name}`).test(flat(li.findAll((n) => cls(n) === "mcs-oq")[0])));
const sheet = (r) => r.root.findAll((n) => n.props && n.props.role === "dialog" && /^Card: /.test(String(n.props["aria-label"] || "")))[0] || null;
const choice = (r, m) => sheet(r).findAll((n) => n.type === "button" && n.props["data-meaning"] === m)[0];
const snack = (r) => r.root.findAll((n) => cls(n) === "mcs-snack-wrap")[0] || null;
/* RESTATED (P6-F4 B2A): the sheet's binder controls are ONE "Move", whose
   chooser holds every destination — another binder, Unfiled, + New binder.
   The same commands; the claims below are unchanged. */
const chooser = (r) => r.root.findAll((n) => n.props && n.props.role === "dialog" && n.props["aria-label"] === "Where should this go?")[0] || null;
const press = async (b) => { assert(b, "no such control"); await TR.act(async () => { b.props.onClick(); }); await settle(); };
const open = async (r, state, name) => {
  const t = tileOf(r, state, name);
  assert(t, `no ${state} ${name} tile`);
  await TR.act(async () => { t.findAll((n) => n.type === "button")[0].props.onClick({ preventDefault() {} }); });
  await settle();
  assert(sheet(r), "the card sheet did not open");
};
const steps = (sent) => sent.filter(([k]) => k === "step").map(([, s]) => s);

/* ============================================================== A */
describe("A. a Goal: Primary and Secondary", () => {
  test("the sheet opens on the Goal's tier, in the 'Looking for it' pair", async () => {
    const { r, sent } = await show();
    await open(r, "Primary", "Charizard");
    eq(choice(r, "primary").props["aria-pressed"], true);
    eq(choice(r, "secondary").props["aria-pressed"], false);
    for (const m of ["pc", "trade"]) eq(choice(r, m).props["aria-pressed"], false, `${m} claimed for a Goal`);
    assert(/Looking for PSA 9/.test(flat(sheet(r))), "the wanted grade is not shown");
    /* RESTATED (P6-F4 B1): the version in a collector's words, never the internal value */
    assert(/Charizard/.test(flat(sheet(r))) && /Base Set · #4 · Holo/.test(flat(sheet(r))) && !/holofoil/.test(flat(sheet(r))), "the card's identity");
    eq(sent.length, 0, "opening wrote something");
  });
  test("Secondary: one updateGoalTier step; said only after the answer; the tile follows", async () => {
    const s = await show({ hold: true });
    await open(s.r, "Primary", "Charizard");
    await TR.act(async () => { choice(s.r, "secondary").props.onClick(); });
    eq(json(steps(s.sent)), json([{ kind: "how-hard", goalId: "g-char", tier: "secondary" }]));
    assert(/Saving…/.test(flat(choice(s.r, "secondary"))), "no pending state");
    assert(!/✓/.test(flat(sheet(s.r))), "success claimed before the answer");
    eq(choice(s.r, "primary").props["aria-pressed"], true, "the new state shown before the server agreed");
    await TR.act(async () => { s.gates[0].resolve({ ok: true }); }); await settle();
    eq(choice(s.r, "secondary").props["aria-pressed"], true);
    assert(/✓ Now Secondary/.test(flat(sheet(s.r))), "no acknowledgement");
    assert(tileOf(s.r, "Secondary", "Charizard"), "the tile did not follow the server");
  });
  test("tapping the current state sends nothing", async () => {
    const { r, sent } = await show();
    await open(r, "Primary", "Charizard");
    await press(choice(r, "primary"));
    eq(sent.length, 0);
  });
});

/* ============================================================== B */
describe("B. a copy: PC and Trade / Sell", () => {
  test("PC → Trade / Sell is setCollectorCopyOffered; back is setCollectorCopyKept", async () => {
    const { r, sent } = await show();
    await open(r, "PC", "Charizard");
    await press(choice(r, "trade"));
    await press(choice(r, "pc"));
    eq(json(steps(sent)), json([{ kind: "offering", copyId: "k-char", offered: true }, { kind: "keeping", copyId: "k-char", keeping: true }]));
    eq(choice(r, "pc").props["aria-pressed"], true);
  });
  test("a copy that said neither is shown as unanswered, and either answer can be given", async () => {
    const { r, sent } = await show();
    await open(r, "Owned", "Venusaur");
    eq(choice(r, "pc").props["aria-pressed"], false); eq(choice(r, "trade").props["aria-pressed"], false);
    assert(/haven't said yet whether you're keeping this copy/.test(flat(sheet(r))), flat(sheet(r)));
    await press(choice(r, "pc"));
    eq(json(steps(sent)), json([{ kind: "keeping", copyId: "k-ven", keeping: true }]));
    assert(/✓ Now PC/.test(flat(sheet(r))));
  });
  test("a copy's grade is shown at once; technical facts wait until asked", async () => {
    const { r } = await show();
    await open(r, "PC", "Charizard");
    assert(/Grade PSA 8/.test(flat(sheet(r))));
    assert(!/C-8/.test(flat(sheet(r))), "cert shown before it was asked for");
    await press(btn(r, /^Copy details$/));
    assert(/C-8/.test(flat(sheet(r))));
  });
});

/* ============================================================== C */
describe("C. a Goal is never turned into a copy, nor a copy into a Goal", () => {
  test("on a Goal, PC and Trade / Sell send nothing and say why", async () => {
    const { r, sent } = await show();
    await open(r, "Primary", "Charizard");
    for (const m of ["pc", "trade"]) {
      eq(choice(r, m).props["aria-disabled"], true, `${m} looks available on a Goal`);
      await press(choice(r, m));
      assert(/describe a copy you own.*won't turn it into a copy/.test(flat(sheet(r))), flat(sheet(r)));
    }
    eq(sent.length, 0, "a cross-pair tap wrote something");
    assert(btn(r, /^Open full card$/), "no way on to record a copy");
  });
  test("on a copy, Primary and Secondary send nothing and say why", async () => {
    const { r, sent } = await show();
    await open(r, "Trade / Sell", "Pikachu");
    await press(choice(r, "primary"));
    await press(choice(r, "secondary"));
    eq(sent.length, 0);
    assert(/Primary and Secondary are Goals.*won't turn it into a Goal/.test(flat(sheet(r))), flat(sheet(r)));
  });
  test("the sheet holds no removal, conversion, or record-making step", () => {
    const src = fs.readFileSync(path.join(ROOT, "client/collector/sections/Binder.jsx"), "utf8");
    const kinds = [...src.matchAll(/kind: "([a-z-]+)"/g)].map((m) => m[1]).filter((k) => !["goal", "copy", "earlier", "binder"].includes(k));
    eq(json([...new Set(kinds)].sort()), json(["how-hard", "keeping", "offering"]), "the sheet's steps");
  });
});

/* ============================================================== D */
describe("D. state and binder are independent", () => {
  test("changing state sends no filing and moves nothing", async () => {
    const { r, sent } = await show();
    await open(r, "Primary", "Charizard");
    await press(choice(r, "secondary"));
    eq(sent.filter(([k]) => k !== "step").length, 0, "a state change filed something");
    assert(!("binderId" in steps(sent)[0]), "a state step named a binder");
    assert(/In Gen 1/.test(flat(sheet(r))), "the home moved with the state");
  });
  test("moving binders sends one fileObject and no state", async () => {
    const { r, sent } = await show();
    await open(r, "PC", "Charizard");
    await press(btn(r, /^Move$/));
    assert(/now in Gen 1/.test(flat(chooser(r))), "the chooser does not say where it is now");
    await press(btn(r, /^Mudkips$/));
    eq(json(sent), json([["fileObject", { binderId: "b-mud", collectorCopyId: "k-char" }]]));
    eq(choice(r, "pc").props["aria-pressed"], true, "the state moved with the binder");
    assert(/In Mudkips/.test(flat(sheet(r))));
  });
  test("taking it out of its binder: unfileObject only; Unfiled is said", async () => {
    const { r, sent } = await show();
    await open(r, "Primary", "Charizard");
    await press(btn(r, /^Move$/));
    await press(btn(r, /^Unfiled Take it out of Gen 1$/));
    eq(json(sent), json([["unfileObject", { goalId: "g-char" }]]));
    assert(/Unfiled/.test(flat(sheet(r).findAll((n) => cls(n) === "mcs-ohome")[0])));
    eq(choice(r, "primary").props["aria-pressed"], true);
  });
  test("put-away binders are not offered as a destination", async () => {
    const { r } = await show();
    await open(r, "Owned", "Venusaur");
    await press(btn(r, /^Move$/));
    const names = chooser(r).findAll((n) => n.type === "button" && String(n.props["data-dest"] || "").startsWith("b:")).map(flat);
    eq(json(names), json(["Gen 1", "Mudkips"]));
  });
});

/* ============================================================== E */
describe("E. refusals are said, never claimed", () => {
  test("goal-locked: the reason, the old state kept, no ✓, no re-read needed", async () => {
    const { r, refreshes } = await show({ answer: () => ({ ok: false, refused: "goal-locked" }) });
    await open(r, "Primary", "Charizard");
    await press(choice(r, "secondary"));
    assert(/part of an active deal, so it stays Primary/.test(flat(sheet(r))), flat(sheet(r)));
    eq(choice(r, "primary").props["aria-pressed"], true);
    assert(!/✓/.test(flat(sheet(r))));
    eq(refreshes.length, 0);
  });
  test("not-found (stale): said, and the screen re-reads", async () => {
    const { r, refreshes } = await show({ answer: () => ({ ok: false, refused: "not-found" }) });
    await open(r, "PC", "Charizard");
    await press(choice(r, "trade"));
    assert(/changed since the screen was drawn/.test(flat(sheet(r))));
    eq(refreshes.length, 1, "a stale screen was not re-read");
    eq(choice(r, "pc").props["aria-pressed"], true);
  });
  test("lost contact: said honestly, and re-read", async () => {
    const { r, refreshes } = await show({ answer: () => "throw" });
    await open(r, "PC", "Charizard");
    await press(choice(r, "trade"));
    assert(/lost contact/.test(flat(sheet(r))) && !/✓/.test(flat(sheet(r))));
    eq(refreshes.length, 1);
  });
  test("a card that vanished on re-read closes its sheet rather than show a ghost", async () => {
    const { r } = await show({ answer: () => ({ ok: false, refused: "not-found" }),
      onRefresh: (s) => ({ ...s, collectorCopies: s.collectorCopies.filter((c) => c.id !== "k-char"),
        binderMemberships: s.binderMemberships.filter((m) => m.collectorCopyId !== "k-char") }) });
    await open(r, "PC", "Charizard");
    await press(choice(r, "trade"));
    eq(sheet(r), null, "the sheet still shows a card the server no longer has");
    assert(/changed since the screen was drawn/.test(flat(snack(r))), "the sheet vanished without saying why");
  });
});

/* ============================================================== F */
describe("F. one change at a time", () => {
  test("two taps in one instant send one command", async () => {
    const s = await show({ hold: true });
    await open(s.r, "PC", "Charizard");
    await TR.act(async () => { choice(s.r, "trade").props.onClick(); choice(s.r, "trade").props.onClick(); });
    eq(steps(s.sent).length, 1, "a duplicate submission");
    await TR.act(async () => { s.gates[0].resolve({ ok: true }); }); await settle();
  });
  test("while a state change is out, nothing can be filed and no other state is sent", async () => {
    const s = await show({ hold: true });
    await open(s.r, "PC", "Charizard");
    await TR.act(async () => { choice(s.r, "trade").props.onClick(); });
    assert(btn(s.r, /^Move$/).props.disabled, "Move offered during a change");
    await TR.act(async () => { choice(s.r, "pc").props.onClick(); });
    eq(s.sent.length, 1);
    await TR.act(async () => { s.gates[0].resolve({ ok: true }); }); await settle();
  });
  test("while a filing is out, no state change is sent", async () => {
    const s = await show({ hold: true });
    await open(s.r, "PC", "Charizard");
    await press(btn(s.r, /^Move$/));
    await TR.act(async () => { btn(s.r, /^Mudkips$/).props.onClick(); });
    await TR.act(async () => { choice(s.r, "trade").props.onClick(); });
    eq(json(s.sent.map(([k]) => k)), json(["fileObject"]));
    await TR.act(async () => { s.gates[0].resolve({ ok: true }); }); await settle();
  });
});

/* ============================================================== G */
describe("G. confirmation: compact, at the foot, with Undo", () => {
  test("after a filing from the sheet, the bar says it and offers Undo — outside the sheet", async () => {
    const { r, sent } = await show();
    await open(r, "PC", "Charizard");
    await press(btn(r, /^Move$/));
    await press(btn(r, /^Mudkips$/));
    const bar = snack(r);
    assert(bar && /Charizard is filed in Mudkips/.test(flat(bar)), "no confirmation bar");
    assert(!sheet(r).findAll((n) => cls(n) === "mcs-snack-wrap").length, "the confirmation is inside the sheet");
    await press(buttons(r).find((b) => cls(b) === "mcs-undo"));
    eq(json(sent[1]), json(["fileObject", { binderId: "b-gen1", collectorCopyId: "k-char" }]), "undo is the same command, backwards");
    assert(/Put back/.test(flat(snack(r))));
    assert(!buttons(r).some((b) => cls(b) === "mcs-undo"), "an undo of an undo");
  });
  test("Undo without opening anything: after a drag-free filing elsewhere, the bar is on the screen itself", async () => {
    const { r } = await show();
    await open(r, "Owned", "Venusaur");
    await press(btn(r, /^Move$/));
    await press(btn(r, /^Gen 1$/));
    await press(buttons(r).find((b) => b.props["aria-label"] === "Close"));
    eq(sheet(r), null);
    assert(buttons(r).some((b) => cls(b) === "mcs-undo"), "Undo needs the sheet open");
  });
  test("Undo pressed twice in one instant sends one command", async () => {
    const s = await show();
    await open(s.r, "PC", "Charizard");
    await press(btn(s.r, /^Move$/));
    await press(btn(s.r, /^Mudkips$/));
    const u = buttons(s.r).find((b) => cls(b) === "mcs-undo");
    await TR.act(async () => { u.props.onClick(); u.props.onClick(); }); await settle();
    eq(s.sent.length, 2, "a duplicate undo");
  });
  test("Undo refused: said, not claimed", async () => {
    let n = 0;
    const { r } = await show({ answer: () => (n++ === 0 ? { ok: true } : { ok: false, refused: "binder-archived" }) });
    await open(r, "PC", "Charizard");
    await press(btn(r, /^Move$/));
    await press(btn(r, /^Mudkips$/));
    await press(buttons(r).find((b) => cls(b) === "mcs-undo"));
    assert(/put away/.test(flat(snack(r))) && !/Put back/.test(flat(r.root)), flat(snack(r)));
  });
  test("Undo into a binder put away since it was offered: nothing sent, said why", async () => {
    const s = await show();
    await open(s.r, "PC", "Charizard");
    await press(btn(s.r, /^Move$/));
    await press(btn(s.r, /^Mudkips$/));
    await s.commit((st) => ({ ...st, binders: st.binders.map((b) => (b.id === "b-gen1" ? { ...b, archivedAt: "2030-02-01" } : b)) }));
    await settle();
    await press(buttons(s.r).find((b) => cls(b) === "mcs-undo"));
    eq(s.sent.length, 1, "undo was sent into a put-away binder");
    assert(/can't go back there — that binder has been put away/.test(flat(snack(s.r))));
  });
  test("the bar gets out of the way after a few seconds; Move stays", async () => {
    const { r } = await show();
    await open(r, "PC", "Charizard");
    await press(btn(r, /^Move$/));
    await press(btn(r, /^Mudkips$/));
    assert(snack(r));
    await TR.act(async () => { await sleep(6200); });
    eq(snack(r), null, "the confirmation stayed");
    assert(btn(r, /^Move$/), "Move is gone with it");
  });
  test("the bar sits above the tab bar and an open sheet, below a filing; only it takes touches", () => {
    let r;
    TR.act(() => { r = TR.create(React.createElement(Shell, { state: { ...STATE(), collectors: [{ id: ME, name: "C" }] }, onSignOut() {} })); });
    const css = r.root.findAll((n) => n.type === "style").map((n) => n.children.join("")).join("\n");
    assert(/\.mcs-snack-wrap \{ position:fixed; left:0; right:0; z-index:45; pointer-events:none;[^}]*bottom:calc\(var\(--tabbar-h\) \+ 10px \+ env\(safe-area-inset-bottom, 0px\)\);/.test(css), "not above the tab bar");
    assert(/\.mcs-snack \{ pointer-events:auto;/.test(css), "the bar does not take its own touches");
    assert(/\.mcs-sheet-scrim \{ position:fixed; inset:0; z-index:30;/.test(css) && /\.mcs-filing \{ position:fixed; inset:0; z-index:60;/.test(css), "layering");
  });
});

/* ============================================================== H */
describe("H. accessibility and shape", () => {
  test("a modal dialog named for the card, Close first and focused, Escape closes", async () => {
    const { r } = await show();
    await open(r, "PC", "Charizard");
    eq(sheet(r).props["aria-modal"], "true");
    const close = buttons(r).find((b) => b.props["aria-label"] === "Close");
    eq(close.props.autoFocus, true);
    await TR.act(async () => { sheet(r).props.onKeyDown({ key: "Escape" }); }); await settle();
    eq(sheet(r), null);
  });
  test("the four states are two labelled groups of pressed/unpressed buttons", async () => {
    const { r } = await show();
    await open(r, "PC", "Charizard");
    const groups = sheet(r).findAll((n) => n.props.role === "group").map((g) => g.props["aria-label"]);
    eq(json(groups.slice(0, 2)), json(["Looking for it", "Own it"]));
    for (const m of ["primary", "secondary", "pc", "trade"]) assert(typeof choice(r, m).props["aria-pressed"] === "boolean", m);
  });
  test("thumb-sized: state choices 56px, Close and binder choices 44px", () => {
    let r;
    TR.act(() => { r = TR.create(React.createElement(Shell, { state: { ...STATE(), collectors: [{ id: ME, name: "C" }] }, onSignOut() {} })); });
    const css = r.root.findAll((n) => n.type === "style").map((n) => n.children.join("")).join("\n");
    assert(/\.mcs-state \{ min-height:56px;/.test(css));
    assert(/\.mcs-x \{[^}]*width:44px; height:44px;/.test(css));
    assert(/\.mcs-oacts \.mcs-go, \.mcs-ochoice \{ min-height:44px; \}/.test(css));
  });
  test("an earlier filing opens the full card, not an object sheet", async () => {
    const st = STATE(); st.binderEntries = [{ binderId: "b-mud", canonicalCardId: "cc-pika", addedAt: `${AT}1` }];
    const { r } = await show({ state: st });
    eq(r.root.findAll((n) => n.type === "li" && cls(n).includes("mcs-otile") && /Earlier filing/.test(flat(n))).length, 0, "history in Your Cards");
  });
});

/* ============================================================== I */
describe("I. boundaries", () => {
  test("the section still names no command; the sheet uses the step words it was handed", () => {
    const src = fs.readFileSync(path.join(ROOT, "client/collector/sections/Binder.jsx"), "utf8");
    const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
    eq(EXPOSED_COMMANDS.length, 29, "the production door is unchanged");
    /* the same rule P6-2 holds: no command as a string the code could send */
    for (const c of EXPOSED_COMMANDS) assert(!new RegExp(`["']${c}["']`).test(src), `Binder names ${c}`);
    assert(/onSpecify\(step, o\.thing\.canonicalCardId \|\| null\)/.test(src), "state changes do not go through the bound steps");
  });
});

run();
