/* ============================================================================
   PHASE 6 P6-4 — THE FOUR-STATE CARD SHEET, AND A LIGHTER CONFIRMATION
   RESTATED (P6-F4 Batch 2B): the bottom sheet is now the full-screen saved-card
   page (client/collector/CardEdit.jsx). Every claim below is made of that page.
   Two are SUPERSEDED by the founder's 2B brief and say so where they stand:
   a tap no longer saves at once (Save Changes does, sending only what changed),
   and a Goal or copy CAN now be removed from its page, behind a confirmation.
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
    { id: "k-char", collectorId: ME, canonicalCardId: "cc-char", grade: "PSA 8", grading: { state: "graded", label: "PSA 8" }, keeping: true, offered: false, status: "available", cert: "C-8", addedAt: `${AT}6` },
    { id: "k-pika", collectorId: ME, canonicalCardId: "cc-pika", grade: "PSA 7", grading: { state: "graded", label: "PSA 7" }, offered: true, status: "available", addedAt: `${AT}6` },
    { id: "k-ven", collectorId: ME, canonicalCardId: "cc-ven", grade: "PSA 6", grading: { state: "graded", label: "PSA 6" }, offered: false, status: "available", addedAt: `${AT}6` }],
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
  if (step.kind === "wanted-copy") return { ...s, goals: s.goals.map((g) => (g.id === step.goalId ? { ...g, desired: step.desired } : g)) };
  if (step.kind === "correct-copy") return { ...s, collectorCopies: s.collectorCopies.map((c) => (c.id === step.copyId ? { ...c, ...step.patch } : c)) };
  if (step.kind === "stop-looking") return { ...s, goals: s.goals.filter((g) => g.id !== step.goalId), binderMemberships: s.binderMemberships.filter((m) => m.goalId !== step.goalId) };
  if (step.kind === "forget-copy") return { ...s, collectorCopies: s.collectorCopies.filter((c) => c.id !== step.copyId), binderMemberships: s.binderMemberships.filter((m) => m.collectorCopyId !== step.copyId) };
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
/* RESTATED (P6-F4 B2B): the saved card's full-screen page; its state choices
   are the record's own pair, marked with the shared state language (data-st). */
const sheet = (r) => r.root.findAll((n) => n.props && n.props.role === "dialog" && /^Your (Goal|copy): /.test(String(n.props["aria-label"] || "")))[0] || null;
const choice = (r, m) => (sheet(r).findAll((n) => n.type === "button" && n.props["data-st"] === m)[0] || null);
const saveBtn = (r) => sheet(r).findAll((n) => n.type === "button" && cls(n).includes("mcs-cd-add"))[0];
const save = async (r) => { await TR.act(async () => { saveBtn(r).props.onClick(); }); await settle(); };
const snack = (r) => r.root.findAll((n) => cls(n).split(" ").includes("mcs-snack-wrap"))[0] || null;
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
  assert(sheet(r), "the card's page did not open");
};
const steps = (sent) => sent.filter(([k]) => k === "step").map(([, s]) => s);

/* ============================================================== A */
describe("A. a Goal: Primary and Secondary", () => {
  /* RESTATED (P6-F4 B4): all four states are shown; the copy pair is not an
     edit of this Goal — it opens the guided step (tests/phase6-f4-b4-guided-transitions.cjs) */
  test("the page opens on the Goal's saved tier and wanted grade; the copy pair is marked as adding, not editing", async () => {
    const { r, sent } = await show();
    await open(r, "Primary", "Charizard");
    eq(choice(r, "primary").props["aria-pressed"], true);
    eq(choice(r, "secondary").props["aria-pressed"], false);
    for (const m of ["pc", "trade"]) { eq(choice(r, m).props["aria-pressed"], false); assert(/\bcross\b/.test(choice(r, m).props.className), `${m} looks like an edit`); }
    const pressed = sheet(r).findAll((n) => n.type === "button" && n.props["aria-pressed"] === true).map(flat);
    assert(pressed.includes("Graded") && pressed.includes("PSA 9"), "the wanted grade is not selected: " + pressed);
    assert(/Charizard/.test(flat(sheet(r))) && /Base Set · 4/.test(flat(sheet(r))) && /Holo — the version you saved/.test(flat(sheet(r))) && !/holofoil/.test(flat(sheet(r))), "the card's identity");
    eq(sent.length, 0, "opening wrote something");
  });
  test("Secondary: one updateGoalTier step, on Save; said only after the answer; the tile follows", async () => {
    /* SUPERSEDED IN PART (P6-F4 B2B): a tap chooses; Save Changes sends. */
    const s = await show({ hold: true });
    await open(s.r, "Primary", "Charizard");
    await press(choice(s.r, "secondary"));
    eq(steps(s.sent).length, 0, "choosing sent something");
    await TR.act(async () => { saveBtn(s.r).props.onClick(); });
    eq(json(steps(s.sent)), json([{ kind: "how-hard", goalId: "g-char", tier: "secondary" }]));
    assert(/Saving…/.test(flat(saveBtn(s.r))), "no pending state");
    assert(!/✓/.test(flat(sheet(s.r))), "success claimed before the answer");
    await TR.act(async () => { s.gates[0].resolve({ ok: true }); }); await settle();
    eq(choice(s.r, "secondary").props["aria-pressed"], true);
    assert(/✓ Saved — how important it is\./.test(flat(sheet(s.r))), "no acknowledgement: " + flat(sheet(s.r)));
    assert(tileOf(s.r, "Secondary", "Charizard"), "the tile did not follow the server");
  });
  test("the current state chosen again: nothing to save", async () => {
    const { r, sent } = await show();
    await open(r, "Primary", "Charizard");
    await press(choice(r, "primary"));
    eq(saveBtn(r).props["aria-disabled"], true, "a no-op offered to save");
    await save(r);
    eq(sent.length, 0);
  });
});

/* ============================================================== B */
describe("B. a copy: PC and Trade / Sell", () => {
  test("PC → Trade / Sell is setCollectorCopyOffered; back is setCollectorCopyKept", async () => {
    const { r, sent } = await show();
    await open(r, "PC", "Charizard");
    await press(choice(r, "trade")); await save(r);
    await press(choice(r, "pc")); await save(r);
    eq(json(steps(sent)), json([{ kind: "offering", copyId: "k-char", offered: true }, { kind: "keeping", copyId: "k-char", keeping: true }]));
    eq(choice(r, "pc").props["aria-pressed"], true);
  });
  test("a copy that said neither is shown as unanswered, and either answer can be given", async () => {
    const { r, sent } = await show();
    await open(r, "Owned", "Venusaur");
    eq(choice(r, "pc").props["aria-pressed"], false); eq(choice(r, "trade").props["aria-pressed"], false);
    await press(choice(r, "pc")); await save(r);
    eq(json(steps(sent)), json([{ kind: "keeping", copyId: "k-ven", keeping: true }]));
    assert(/✓ Saved — Personal collection\./.test(flat(sheet(r))));
  });
  test("a copy's grade is selected at once; its certificate is in Copy details", async () => {
    /* RESTATED (P6-F4 B2B): the founder brought certificate and value onto the page, editable */
    const { r } = await show();
    await open(r, "PC", "Charizard");
    const pressed = sheet(r).findAll((n) => n.type === "button" && n.props["aria-pressed"] === true).map(flat);
    assert(pressed.includes("Graded") && pressed.includes("PSA 8"), pressed);
    const cert = sheet(r).findAll((n) => n.type === "input")[0];
    eq(cert.props.value, "C-8");
  });
});

/* ============================================================== C */
describe("C. a Goal is never turned into a copy, nor a copy into a Goal", () => {
  /* RESTATED (P6-F4 B4): offered now, as a guided addition; the page says what they do */
  test("on a Goal, PC and Trade / Sell add a copy, and the page says so", async () => {
    const { r, sent } = await show();
    await open(r, "Primary", "Charizard");
    assert(choice(r, "pc") && choice(r, "trade"));
    assert(/PC or Trade \/ Sell adds a copy you own — you'll choose whether this Goal stays\./.test(flat(sheet(r))), flat(sheet(r)));
    eq(sent.length, 0);
  });
  /* RESTATED (P6-F4 B4) */
  test("on a copy, Primary and Secondary start a Goal, and the page says so", async () => {
    const { r, sent } = await show();
    await open(r, "Trade / Sell", "Pikachu");
    assert(choice(r, "primary") && choice(r, "secondary"));
    assert(/Primary or Secondary starts a Goal for another copy — this copy stays yours\./.test(flat(sheet(r))), flat(sheet(r)));
    eq(sent.length, 0);
  });
  /* (P6-F4 B4: still true of the page itself — record-making lives only in CardCross.jsx, behind its own confirmation) */
  test("the page's steps: changes to the same record, and removal — never conversion or record-making", () => {
    /* SUPERSEDED IN PART (P6-F4 B2B): removal (stop-looking, forget-copy) is now on the page, behind a confirmation */
    const src = fs.readFileSync(path.join(ROOT, "client/collector/CardEdit.jsx"), "utf8");
    const kinds = [...src.matchAll(/kind: "([a-z-]+)"/g)].map((m) => m[1]);
    eq(json([...new Set(kinds)].sort()), json(["correct-copy", "forget-copy", "how-hard", "keeping", "offering", "stop-looking", "wanted-copy"]), "the page's steps");
    assert(!/start-looking|record-copy/.test(src), "the page can make a record");
  });
});

/* ============================================================== D */
describe("D. state and binder are independent", () => {
  test("changing state sends no filing and moves nothing", async () => {
    const { r, sent } = await show();
    await open(r, "Primary", "Charizard");
    await press(choice(r, "secondary")); await save(r);
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
    assert(/Unfiled/.test(flat(sheet(r))));
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
    await press(choice(r, "secondary")); await save(r);
    assert(/Nothing was saved: how hard you're looking could not be saved/.test(flat(sheet(r))), flat(sheet(r)));
    assert(/active deal/i.test(flat(sheet(r))), "the reason is not said: " + flat(sheet(r)));
    assert(!/✓/.test(flat(sheet(r))));
    eq(refreshes.length, 0);
    assert(tileOf(r, "Primary", "Charizard"), "the refused change reached the tile");
  });
  test("not-found (stale): said, and the screen re-reads", async () => {
    const { r, refreshes } = await show({ answer: () => ({ ok: false, refused: "not-found" }) });
    await open(r, "PC", "Charizard");
    await press(choice(r, "trade")); await save(r);
    assert(/Nothing was saved/.test(flat(sheet(r))));
    eq(refreshes.length, 1, "a stale screen was not re-read");
  });
  test("lost contact: said honestly, and re-read", async () => {
    const { r, refreshes } = await show({ answer: () => "throw" });
    await open(r, "PC", "Charizard");
    await press(choice(r, "trade")); await save(r);
    assert(/lost contact/.test(flat(sheet(r))) && !/✓/.test(flat(sheet(r))));
    eq(refreshes.length, 1);
  });
  test("a card that vanished on re-read closes its page rather than show a ghost", async () => {
    const { r } = await show({ answer: () => ({ ok: false, refused: "not-found" }),
      onRefresh: (s) => ({ ...s, collectorCopies: s.collectorCopies.filter((c) => c.id !== "k-char"),
        binderMemberships: s.binderMemberships.filter((m) => m.collectorCopyId !== "k-char") }) });
    await open(r, "PC", "Charizard");
    await press(choice(r, "trade")); await save(r);
    eq(sheet(r), null, "the page still shows a card the server no longer has");
    assert(/changed elsewhere and is no longer here/.test(flat(snack(r))), "the page vanished without saying why");
  });
});

/* ============================================================== F */
describe("F. one change at a time", () => {
  test("two Saves in one instant send one command", async () => {
    const s = await show({ hold: true });
    await open(s.r, "PC", "Charizard");
    await press(choice(s.r, "trade"));
    await TR.act(async () => { saveBtn(s.r).props.onClick(); saveBtn(s.r).props.onClick(); });
    eq(steps(s.sent).length, 1, "a duplicate submission");
    await TR.act(async () => { s.gates[0].resolve({ ok: true }); }); await settle();
  });
  test("while a save is out, nothing can be filed and nothing else is sent", async () => {
    const s = await show({ hold: true });
    await open(s.r, "PC", "Charizard");
    await press(choice(s.r, "trade"));
    await TR.act(async () => { saveBtn(s.r).props.onClick(); });
    assert(btn(s.r, /^Move$/).props.disabled, "Move offered during a save");
    eq(s.sent.length, 1);
    await TR.act(async () => { s.gates[0].resolve({ ok: true }); }); await settle();
  });
  test("while a filing is out, nothing can be saved", async () => {
    const s = await show({ hold: true });
    await open(s.r, "PC", "Charizard");
    await press(btn(s.r, /^Move$/));
    await TR.act(async () => { btn(s.r, /^Mudkips$/).props.onClick(); });
    await TR.act(async () => { choice(s.r, "trade").props.onClick(); });
    eq(saveBtn(s.r).props["aria-disabled"], true, "Save offered while a filing is out");
    await TR.act(async () => { saveBtn(s.r).props.onClick(); });
    eq(json(s.sent.map(([k]) => k)), json(["fileObject"]));
    await TR.act(async () => { s.gates[0].resolve({ ok: true }); }); await settle();
  });
});

/* ============================================================== G */
describe("G. confirmation: compact, at the foot, with Undo", () => {
  test("after a filing from the page, the bar says it and offers Undo — outside the page", async () => {
    const { r, sent } = await show();
    await open(r, "PC", "Charizard");
    await press(btn(r, /^Move$/));
    await press(btn(r, /^Mudkips$/));
    const bar = snack(r);
    assert(bar && /Charizard is filed in Mudkips/.test(flat(bar)), "no confirmation bar");
    assert(!sheet(r).findAll((n) => cls(n).split(" ").includes("mcs-snack-wrap")).length, "the confirmation is inside the page");
    await press(buttons(r).find((b) => cls(b) === "mcs-undo"));
    eq(json(sent[1]), json(["fileObject", { binderId: "b-gen1", collectorCopyId: "k-char" }]), "undo is the same command, backwards");
    assert(/Put back/.test(flat(snack(r))));
    assert(!buttons(r).some((b) => cls(b) === "mcs-undo"), "an undo of an undo");
  });
  test("Undo without the page: after a filing, the bar stays on the screen itself", async () => {
    const { r } = await show();
    await open(r, "Owned", "Venusaur");
    await press(btn(r, /^Move$/));
    await press(btn(r, /^Gen 1$/));
    await press(sheet(r).findAll((n) => n.type === "button" && cls(n) === "mcs-cd-back")[0]);
    eq(sheet(r), null);
    assert(buttons(r).some((b) => cls(b) === "mcs-undo"), "Undo needs the page open");
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
  test("the bar sits above the tab bar and the card page, below a filing; only it takes touches", () => {
    let r;
    TR.act(() => { r = TR.create(React.createElement(Shell, { state: { ...STATE(), collectors: [{ id: ME, name: "C" }] }, onSignOut() {} })); });
    const css = r.root.findAll((n) => n.type === "style").map((n) => n.children.join("")).join("\n");
    assert(/\.mcs-snack-wrap \{ position:fixed; left:0; right:0; z-index:45; pointer-events:none;[^}]*bottom:calc\(var\(--tabbar-h\) \+ 10px \+ env\(safe-area-inset-bottom, 0px\)\);/.test(css), "not above the tab bar");
    assert(/\.mcs-snack \{ pointer-events:auto;/.test(css), "the bar does not take its own touches");
    assert(/\.mcs-cd \{ position:fixed; inset:0; z-index:28;/.test(css) && /\.mcs-filing \{ position:fixed; inset:0; z-index:60;/.test(css), "layering");
  });
});

/* ============================================================== H */
describe("H. accessibility and shape", () => {
  /* (Escape is tested with a window stand-in in tests/phase6-f4-b2b-card-edit.cjs) */
  test("a modal dialog named for the record; ‹ Binders first, and it closes the page", async () => {
    const { r } = await show();
    await open(r, "PC", "Charizard");
    eq(sheet(r).props["aria-modal"], "true");
    eq(sheet(r).props["aria-label"], "Your copy: Charizard");
    const first = sheet(r).findAll((n) => n.type === "button")[0];
    eq(flat(first), "‹ Binders");
    await TR.act(async () => { first.props.onClick(); }); await settle();
    eq(sheet(r), null);
  });
  test("the state choices are pressed/unpressed buttons of the record's own pair", async () => {
    const { r } = await show();
    await open(r, "PC", "Charizard");
    for (const m of ["pc", "trade"]) assert(typeof choice(r, m).props["aria-pressed"] === "boolean", m);
  });
  test("thumb-sized: Move and the binder destinations 44px or more", () => {
    let r;
    TR.act(() => { r = TR.create(React.createElement(Shell, { state: { ...STATE(), collectors: [{ id: ME, name: "C" }] }, onSignOut() {} })); });
    const css = r.root.findAll((n) => n.type === "style").map((n) => n.children.join("")).join("\n");
    assert(/\.mcs-ce \.mcs-ce-home \.mcs-go \{ min-height:44px;/.test(css), "Move is not thumb-sized");
    assert(/\.mcs-dest \{[^}]*min-height:52px;/.test(css), "destinations are not thumb-sized");
  });
  test("an earlier filing opens the full card, not an object page", async () => {
    const st = STATE(); st.binderEntries = [{ binderId: "b-mud", canonicalCardId: "cc-pika", addedAt: `${AT}1` }];
    const { r } = await show({ state: st });
    eq(r.root.findAll((n) => n.type === "li" && cls(n).includes("mcs-otile") && /Earlier filing/.test(flat(n))).length, 0, "history in Your Cards");
  });
});

/* ============================================================== I */
describe("I. boundaries", () => {
  test("the section still names no command; the page uses the step words it was handed", () => {
    const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
    eq(EXPOSED_COMMANDS.length, 29, "the production door is unchanged");
    for (const f of ["client/collector/sections/Binder.jsx", "client/collector/CardEdit.jsx"]) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      for (const c of EXPOSED_COMMANDS) assert(!new RegExp(`["']${c}["']`).test(src), `${f} names ${c}`);
    }
    assert(/onSave\(step, thing\.canonicalCardId \|\| null\)/.test(fs.readFileSync(path.join(ROOT, "client/collector/CardEdit.jsx"), "utf8")), "changes do not go through the bound steps");
  });
});

run();
