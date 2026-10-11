/* ============================================================================
   PHASE 6 P6-F4 BATCH 4 — FOUR STATES, AND GUIDED TRANSITIONS (CardEdit → CardCross)
   The four states describe collecting intent. Goals and owned copies remain
   distinct production records.
     A. four states      all four on every saved card; the saved one selected
     B. same record      Primary ↔ Secondary, PC ↔ Trade / Sell: edits, by id
     C. Goal → owned     "Do you own this card now?" — a NEW copy, the same
                         printing; the Goal kept unless they say; removal only
                         after the copy is confirmed; refusals kept honest
     D. owned → Goal     "Looking for another copy?" — a NEW Goal; the copy
                         stays; an existing Goal is never duplicated, only
                         changed on purpose
     E. partial / lost   Retry filing never re-creates; a lost answer is
                         looked up, not resent
   Real-server journeys: harness/phase6-filing-browser.cjs.
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const React = require("react");
const TR = require("react-test-renderer");

const winL = {};
global.window = global.window || {};
Object.assign(global.window, { addEventListener: (t, f) => { (winL[t] = winL[t] || []).push(f); },
  removeEventListener: (t, f) => { winL[t] = (winL[t] || []).filter((x) => x !== f); } });
const fireWin = (t, e) => (winL[t] || []).slice().forEach((f) => f(e));

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
const EDIT = load("client/collector/CardEdit.jsx");
const json = (v) => JSON.stringify(v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const ME = "c1";
const CARDS = {
  "cc-mud-r": { canonicalCardId: "cc-mud-r", cardContextId: "x60", cardName: "Mudkip", expansionName: "Ruby & Sapphire", collectorNumber: "60", artist: "Ken Sugimori", finish: "reverse_holofoil" },
  "cc-char": { canonicalCardId: "cc-char", cardContextId: "x4", cardName: "Charizard", expansionName: "Base Set", collectorNumber: "4", artist: "Mitsuhiro Arita", finish: "holofoil" },
  "cc-ven": { canonicalCardId: "cc-ven", cardContextId: "x15", cardName: "Venusaur", expansionName: "Base Set", collectorNumber: "15", finish: "holofoil" },
};
const STATE = () => ({
  actor: { seat: "collector", collectorId: ME },
  binders: [{ id: "b-mud", collectorId: ME, name: "Mudkips", createdAt: "2030-01-02", archivedAt: null },
    { id: "b-gen1", collectorId: ME, name: "Gen 1", createdAt: "2030-01-03", archivedAt: null }],
  goals: [
    { id: "g-mud", collectorId: ME, canonicalCardId: "cc-mud-r", tier: "primary", desired: { grade: "Raw", condition: "Near Mint" }, createdAt: "2030-01-05" },
    { id: "g-ven", collectorId: ME, canonicalCardId: "cc-ven", tier: "secondary", createdAt: "2030-01-04" }],
  collectorCopies: [
    { id: "k-a", collectorId: ME, canonicalCardId: "cc-char", grade: "PSA 8", keeping: true, offered: false, cert: "CERT-A", market: 300, status: "available", addedAt: "2030-01-06", grading: { state: "graded", label: "PSA 8" } },
    { id: "k-b", collectorId: ME, canonicalCardId: "cc-char", grade: "Raw", condition: "Lightly Played", offered: true, cert: "SER-B", status: "available", addedAt: "2030-01-07", grading: { state: "raw", label: "Raw · Lightly Played" } },
    { id: "k-m", collectorId: ME, canonicalCardId: "cc-mud-r", grade: "PSA 10", keeping: true, status: "available", addedAt: "2030-01-08", grading: { state: "graded", label: "PSA 10" } }],
  binderMemberships: [{ id: "m1", binderId: "b-mud", goalId: "g-mud" }, { id: "m2", binderId: "b-gen1", collectorCopyId: "k-a" }],
  binderEntries: [], catalog: [], partners: [], relationships: [], inventory: [], opportunities: [], discoveries: [],
});
const applyStep = (s, step) => {
  const goals = (f) => ({ ...s, goals: s.goals.map((g) => (g.id === step.goalId ? f(g) : g)) });
  const copies = (f) => ({ ...s, collectorCopies: s.collectorCopies.map((c) => (c.id === step.copyId ? f(c) : c)) });
  if (step.kind === "record-copy") return { ...s, collectorCopies: [...s.collectorCopies, { id: step.madeId, collectorId: ME, canonicalCardId: step.on, ...step.copy, status: "available", addedAt: "2030-02-01" }] };
  if (step.kind === "start-looking") return { ...s, goals: [...s.goals, { id: step.madeId, collectorId: ME, canonicalCardId: step.on, tier: step.tier, desired: step.desired, createdAt: "2030-02-01" }] };
  if (step.kind === "file-object") { const k = step.goalId ? "goalId" : "collectorCopyId"; return { ...s, binderMemberships: [...s.binderMemberships.filter((m) => m[k] !== step[k]), { id: `m-${step[k]}`, binderId: step.binderId, [k]: step[k] }] }; }
  if (step.kind === "how-hard") return goals((g) => ({ ...g, tier: step.tier }));
  if (step.kind === "wanted-copy") return goals((g) => ({ ...g, desired: step.desired }));
  if (step.kind === "correct-copy") return copies((c) => ({ ...c, ...step.patch }));
  if (step.kind === "keeping") return copies((c) => ({ ...c, keeping: true, offered: false }));
  if (step.kind === "offering") return copies((c) => ({ ...c, offered: true, keeping: false }));
  if (step.kind === "stop-looking") return { ...s, goals: s.goals.filter((g) => g.id !== step.goalId), binderMemberships: s.binderMemberships.filter((m) => m.goalId !== step.goalId) };
  if (step.kind === "forget-copy") return { ...s, collectorCopies: s.collectorCopies.filter((c) => c.id !== step.copyId), binderMemberships: s.binderMemberships.filter((m) => m.collectorCopyId !== step.copyId) };
  return s;
};
async function show({ answer = () => ({ ok: true }), hold = false, world = STATE() } = {}) {
  const sent = []; const gates = []; let setLive = null; let live = world; let n = 0;
  const onSpecify = async (step, canonicalCardId) => {
    sent.push([step, canonicalCardId]);
    if (step.kind === "record-copy" || step.kind === "start-looking") {
      const madeId = `${step.kind === "record-copy" ? "k" : "g"}-new${++n}`;
      const a = answer(step, madeId);
      if (a === "throw" || a === "throw-made") { if (a === "throw-made") { live = applyStep(live, { ...step, madeId, on: canonicalCardId }); setLive(live); } throw new Error("offline"); }
      if (a && a.ok === false) return a;
      live = applyStep(live, { ...step, madeId, on: canonicalCardId }); setLive(live);
      return { ok: true, value: madeId };
    }
    if (hold) { const g = {}; g.promise = new Promise((r) => { g.resolve = r; }); gates.push(g); const a = await g.promise; if (!a || a.ok !== false) { live = applyStep(live, step); setLive(live); } return a; }
    const a = answer(step);
    if (a === "throw") throw new Error("offline");
    if (a === "throw-done") { live = applyStep(live, step); setLive(live); throw new Error("offline"); }
    if (!a || a.ok !== false) { live = applyStep(live, step); setLive(live); }
    return a;
  };
  function Live() {
    const [state, set] = React.useState(live); setLive = set;
    return React.createElement(Binder, { state, onSpecify,
      onBrowseCards: { describe: async (ids) => ({ cards: ids.map((id) => CARDS[id]).filter(Boolean) }) },
      onFileObject: async () => ({ ok: true }), onUnfileObject: async () => ({ ok: true }), onCreateBinder: async () => ({ ok: true }),
      onRefresh: async () => {} });
  }
  let r; await TR.act(async () => { r = TR.create(React.createElement(Live)); }); await settle();
  return { r, sent, gates, get live() { return live; } };
}
const settle = async () => { for (let i = 0; i < 6; i += 1) await TR.act(async () => { await sleep(0); }); };
const textOf = (n) => (typeof n === "string" ? n : !n || !n.children ? "" : n.children.map(textOf).join(" "));
const flat = (n) => textOf(n).replace(/\s+/g, " ").trim();
const cls = (n) => String((n.props && n.props.className) || "");
const page = (r) => r.root.findAll((n) => n.props && n.props.role === "dialog" && /^Your (Goal|copy): /.test(String(n.props["aria-label"] || "")))[0] || null;
const open = async (r, re) => {
  const t = r.root.findAll((n) => n.type === "li" && cls(n).includes("mcs-otile")).find((li) => re.test(flat(li)));
  assert(t, `no tile ${re}`);
  await TR.act(async () => { t.findAll((n) => n.type === "button")[0].props.onClick({ preventDefault() {} }); }); await settle();
  assert(page(r), "no page");
};
const choice = (r, title) => page(r).findAll((n) => n.type === "button" && cls(n).includes("mcs-cd-choice")
  && ((n.findAll((x) => x.type === "b")[0] || { children: [] }).children.join("") === title))[0] || null;
const pressed = (r) => page(r).findAll((n) => n.type === "button" && n.props["aria-pressed"] === true).map((n) => (n.findAll((x) => x.type === "b")[0] || { children: [] }).children.join(""));
const tap = async (b) => { assert(b, "no such control"); await TR.act(async () => { b.props.onClick(); }); await settle(); };
const saveBtn = (r) => page(r).findAll((n) => n.type === "button" && cls(n).includes("mcs-cd-add"))[0];
const save = (r) => tap(saveBtn(r));
const inputs = (r) => page(r).findAll((n) => n.type === "input");
const type = async (el, v) => { await TR.act(async () => { el.props.onChange({ target: { value: v } }); }); };
const steps = (sent) => sent.map(([s]) => s);

const cross = (r) => r.root.findAll((n) => n.props && n.props.role === "dialog" && cls(n).includes("mcs-cx"))[0] || null;
const xchoice = (r, title) => cross(r).findAll((n) => n.type === "button" && cls(n).includes("mcs-cd-choice")
  && ((n.findAll((x) => x.type === "b")[0] || { children: [] }).children.join("") === title))[0] || null;
const xbtn = (r, re) => cross(r).findAll((n) => n.type === "button" && re.test(flat(n)))[0] || null;
const confirmBtn = (r) => cross(r).findAll((n) => n.type === "button" && cls(n).includes("mcs-cd-add"))[0];
const xpressed = (r) => cross(r).findAll((n) => n.type === "button" && n.props["aria-pressed"] === true).map((n) => (n.findAll((x) => x.type === "b")[0] || { children: [] }).children.join(""));
const kinds = (sent) => sent.map(([s]) => s.kind);
const startCross = async (r, tileRe, state) => { await open(r, tileRe); await tap(choice(r, state)); assert(cross(r), "no guided step"); };
const homeOf = (live, k, id) => (live.binderMemberships.find((m) => m[k] === id) || {}).binderId || null;

/* ============================================================== A */
describe("A. all four states, on every saved card", () => {
  test("a Goal: four, in the shared language, Primary selected; the copy pair marked as adding", async () => {
    const { r } = await show();
    await open(r, /Primary.*Mudkip/);
    const st = page(r).findAll((n) => n.props && n.props["data-q"] === "state")[0];
    eq(json(st.findAll((n) => n.type === "button").map((b) => [b.props["data-st"], b.props["aria-pressed"], cls(b).includes("cross")])),
      json([["primary", true, false], ["secondary", false, false], ["pc", false, true], ["trade", false, true]]));
    assert(/I'm interested in this card\./.test(flat(st)) && /A keeper/.test(flat(st)) && /Available for trade or sale/.test(flat(st)));
  });
  test("a copy: four, PC selected", async () => {
    const { r } = await show();
    await open(r, /PC.*Charizard #4 · Holo · PSA 8/);
    eq(json(pressed(r)), json(["PC", "Graded", "PSA 8"]));
    eq(page(r).findAll((n) => n.props && n.props["data-q"] === "state")[0].findAll((n) => n.type === "button").length, 4);
  });
  test("choosing the other pair sends nothing", async () => {
    const s = await show();
    await startCross(s.r, /Primary.*Mudkip/, "PC");
    eq(s.sent.length, 0);
  });
});

/* ============================================================== B */
describe("B. the record's own pair: an ordinary edit", () => {
  test("Primary → Secondary → Primary: two how-hard steps on g-mud; nothing created; binder unchanged", async () => {
    const s = await show();
    await open(s.r, /Primary.*Mudkip/);
    await tap(choice(s.r, "Secondary")); await save(s.r);
    await tap(choice(s.r, "Primary")); await save(s.r);
    eq(json(steps(s.sent)), json([{ kind: "how-hard", goalId: "g-mud", tier: "secondary" }, { kind: "how-hard", goalId: "g-mud", tier: "primary" }]));
    eq(s.live.goals.length, 2); eq(s.live.collectorCopies.length, 3);
    eq(json(s.live.binderMemberships), json(STATE().binderMemberships));
  });
  test("PC → Trade / Sell → PC: offering, keeping, on k-a only", async () => {
    const s = await show();
    await open(s.r, /PC.*Charizard #4 · Holo · PSA 8/);
    await tap(choice(s.r, "Trade / Sell")); await save(s.r);
    await tap(choice(s.r, "PC")); await save(s.r);
    eq(json(kinds(s.sent)), json(["offering", "keeping"]));
    assert(s.sent.every(([st]) => st.copyId === "k-a"));
    eq(s.live.collectorCopies.length, 3);
    eq(json(s.live.binderMemberships), json(STATE().binderMemberships));
  });
});

/* ============================================================== C */
describe("C. Goal → owned: a new copy, and the Goal only goes if they say", () => {
  test("the step: question, explanation, the same printing, prefilled and editable, binder, Goal kept by default", async () => {
    const s = await show();
    await startCross(s.r, /Primary.*Mudkip/, "PC");
    const t = flat(cross(s.r));
    assert(/Do you own this card now\?/.test(t) && /MetYet will add an owned copy using this card's saved version and configuration\./.test(t), t);
    assert(/Reverse Holo — the same printing/.test(t), t);
    eq(json(xpressed(s.r)), json(["PC", "Raw", "Near Mint", "Mudkips", "Keep this Goal"]));
    assert(/I'm still looking for another copy\./.test(t) && /I've found what I wanted\./.test(t));
    assert(/This Goal stays in Mudkips\./.test(t), t);
    eq(flat(confirmBtn(s.r)), "Add to Personal Collection");
    await tap(xchoice(s.r, "Trade / Sell"));
    eq(flat(confirmBtn(s.r)), "Add to Trade / Sell");
  });
  test("Primary Goal → PC, keep the Goal: one copy, the Goal's printing, filed by its id; the Goal untouched", async () => {
    const s = await show();
    await startCross(s.r, /Primary.*Mudkip/, "PC");
    await tap(confirmBtn(s.r));
    eq(json(s.sent), json([[{ kind: "record-copy", copy: { grade: "Raw", condition: "Near Mint", offered: false, keeping: true } }, "cc-mud-r"],
      [{ kind: "file-object", binderId: "b-mud", collectorCopyId: "k-new1" }, "cc-mud-r"]]));
    assert(s.live.goals.some((g) => g.id === "g-mud" && g.tier === "primary"), "the Goal changed");
    eq(homeOf(s.live, "goalId", "g-mud"), "b-mud");
    const t = flat(cross(s.r));
    assert(/✓ Added to Personal Collection/.test(t) && /Raw · Near Mint · Reverse Holo · in Mudkips/.test(t) && /Your Goal stays/.test(t), t);
    await tap(xbtn(s.r, /^Open the new copy$/));
    assert(page(s.r) && /Your copy: Mudkip/.test(page(s.r).props["aria-label"]), "the new copy did not open");
    eq(json(pressed(s.r)), json(["PC", "Raw", "Near Mint"]));
  });
  test("a Goal with no grade stated: nothing assumed — they say, then a Trade / Sell copy at that grade", async () => {
    const s = await show();
    await startCross(s.r, /Secondary.*Venusaur/, "Trade / Sell");
    eq(confirmBtn(s.r).props["aria-disabled"], true);
    await tap(confirmBtn(s.r)); eq(s.sent.length, 0);
    await tap(xchoice(s.r, "Graded")); await tap(xchoice(s.r, "PSA 9"));
    eq(json(xpressed(s.r)), json(["Trade / Sell", "Graded", "PSA 9", "Unfiled", "Keep this Goal"]));
    await tap(confirmBtn(s.r));
    eq(json(steps(s.sent)), json([{ kind: "record-copy", copy: { grade: "PSA 9", condition: null, offered: true, keeping: false } }]));
    assert(/Unfiled/.test(flat(cross(s.r))));
  });
  test("prefilled from the Goal but corrected: the copy is what they have, the Goal keeps what they wanted", async () => {
    const s = await show();
    await startCross(s.r, /Primary.*Mudkip/, "PC");
    await tap(xchoice(s.r, "Lightly Played"));
    await tap(confirmBtn(s.r));
    eq(s.sent[0][0].copy.condition, "Lightly Played");
    eq(json(s.live.goals.find((g) => g.id === "g-mud").desired), json({ grade: "Raw", condition: "Near Mint" }));
  });
  test("Stop looking: create, file, THEN stop-looking; the page stays and says so", async () => {
    const s = await show();
    await startCross(s.r, /Primary.*Mudkip/, "PC");
    await tap(xchoice(s.r, "Stop looking for this card"));
    await tap(confirmBtn(s.r));
    eq(json(kinds(s.sent)), json(["record-copy", "file-object", "stop-looking"]));
    eq(s.sent[2][0].goalId, "g-mud");
    assert(!s.live.goals.some((g) => g.id === "g-mud"));
    assert(cross(s.r), "the result vanished with the Goal");
    const t = flat(cross(s.r));
    assert(/You've stopped looking for this card\./.test(t) && !/Back to the Goal/.test(t), t);
    await tap(xbtn(s.r, /^Back to Mudkips$/));
    eq(cross(s.r), null); eq(page(s.r), null);
  });
  test("stopping refused (an active deal): the copy stays made, the Goal stays, and it says why", async () => {
    const s = await show({ answer: (st) => (st.kind === "stop-looking" ? { ok: false, refused: "goal-locked" } : { ok: true }) });
    await startCross(s.r, /Primary.*Mudkip/, "PC");
    await tap(xchoice(s.r, "Stop looking for this card"));
    await tap(confirmBtn(s.r));
    assert(s.live.goals.some((g) => g.id === "g-mud") && s.live.collectorCopies.some((c) => c.id === "k-new1"));
    assert(/Your Goal stays: This card is part of an active deal\./.test(flat(cross(s.r))), flat(cross(s.r)));
    assert(/✓ Added to Personal Collection/.test(flat(cross(s.r))));
  });
  test("a creation refused: nothing filed, nothing removed", async () => {
    const s = await show({ answer: (st) => (st.kind === "record-copy" ? { ok: false, refused: "grading-incoherent" } : { ok: true }) });
    await startCross(s.r, /Primary.*Mudkip/, "PC");
    await tap(xchoice(s.r, "Stop looking for this card"));
    await tap(confirmBtn(s.r));
    eq(json(kinds(s.sent)), json(["record-copy"]));
    assert(/Nothing was saved/.test(flat(cross(s.r))));
  });
  test("two Charizard copies, and a third from a Goal: each its own record", async () => {
    const world = STATE(); world.goals.push({ id: "g-char", collectorId: ME, canonicalCardId: "cc-char", tier: "secondary", desired: { grade: "PSA 10" }, createdAt: "2030-01-09" });
    const s = await show({ world });
    await startCross(s.r, /Secondary.*Charizard/, "PC");
    await tap(confirmBtn(s.r));
    eq(json(s.live.collectorCopies.filter((c) => c.canonicalCardId === "cc-char").map((c) => [c.id, c.grade])), json([["k-a", "PSA 8"], ["k-b", "Raw"], ["k-new1", "PSA 10"]]));
    eq(json(STATE().collectorCopies.slice(0, 2)), json(s.live.collectorCopies.slice(0, 2)));
  });
});

/* ============================================================== D */
describe("D. owned → Goal: a new Goal; the copy stays; no duplicate", () => {
  test("PC copy → Primary Goal: the copy's printing and grade, into its binder; the copy untouched", async () => {
    const s = await show();
    await startCross(s.r, /PC.*Charizard #4 · Holo · PSA 8/, "Primary");
    const t = flat(cross(s.r));
    assert(/Looking for another copy\?/.test(t) && /Your owned copy will stay in your collection\./.test(t), t);
    eq(json(xpressed(s.r)), json(["Primary", "Graded", "PSA 8", "Gen 1"]));
    eq(flat(confirmBtn(s.r)), "Create Primary Goal");
    await tap(confirmBtn(s.r));
    eq(json(s.sent), json([[{ kind: "start-looking", tier: "primary", desired: { grade: "PSA 8" } }, "cc-char"],
      [{ kind: "file-object", binderId: "b-gen1", goalId: "g-new1" }, "cc-char"]]));
    eq(json(s.live.collectorCopies.find((c) => c.id === "k-a")), json(STATE().collectorCopies[0]));
    eq(homeOf(s.live, "collectorCopyId", "k-a"), "b-gen1");
    assert(/✓ Primary Goal created/.test(flat(cross(s.r))) && /Your copy stays in your collection\./.test(flat(cross(s.r))));
    await tap(xbtn(s.r, /^Back to the copy$/));
    assert(page(s.r) && /Your copy: Charizard/.test(page(s.r).props["aria-label"]));
  });
  test("Trade / Sell copy → Secondary Goal, desired changed to Near Mint", async () => {
    const s = await show();
    await startCross(s.r, /Trade \/ Sell.*Charizard #4 · Holo · Raw/, "Secondary");
    eq(json(xpressed(s.r)), json(["Secondary", "Raw", "Lightly Played", "Unfiled"]));
    await tap(xchoice(s.r, "Near Mint"));
    eq(flat(confirmBtn(s.r)), "Create Secondary Goal");
    await tap(confirmBtn(s.r));
    eq(json(steps(s.sent)), json([{ kind: "start-looking", tier: "secondary", desired: { grade: "Raw", condition: "Near Mint" } }]));
  });
  test("a Goal for this version exists: none is made; open it, or change ITS priority on purpose", async () => {
    const s = await show();
    await startCross(s.r, /PC.*Mudkip/, "Secondary");
    const t = flat(cross(s.r));
    assert(/You already have a Goal for this version/.test(t) && /won't start a second Goal/.test(t), t);
    eq(cross(s.r).findAll((n) => n.type === "button" && cls(n).includes("mcs-cd-add")).length, 0, "a create button is offered");
    eq(s.sent.length, 0);
    await tap(xbtn(s.r, /^Make it Secondary$/));
    eq(json(steps(s.sent)), json([{ kind: "how-hard", goalId: "g-mud", tier: "secondary" }]));
    assert(/✓ Your Goal is now Secondary\./.test(flat(cross(s.r))));
    await tap(xbtn(s.r, /^Open that Goal$/));
    assert(page(s.r) && /Your Goal: Mudkip/.test(page(s.r).props["aria-label"]));
    eq(json(pressed(s.r)).includes("Secondary"), true);
  });
  test("same tier already: only Open that Goal", async () => {
    const s = await show();
    await startCross(s.r, /PC.*Mudkip/, "Primary");
    eq(xbtn(s.r, /^Make it/), null);
    assert(xbtn(s.r, /^Open that Goal$/));
  });
});

/* ============================================================== E */
describe("E. partial success and lost answers", () => {
  test("made, filing refused: said; Retry filing files the SAME id, never re-creates; then the Goal goes as asked", async () => {
    let files = 0;
    const s = await show({ answer: (st) => (st.kind === "file-object" && files++ === 0 ? { ok: false, refused: "binder-archived" } : { ok: true }) });
    await startCross(s.r, /Primary.*Mudkip/, "Trade / Sell");
    await tap(xchoice(s.r, "Stop looking for this card"));
    await tap(confirmBtn(s.r));
    eq(json(kinds(s.sent)), json(["record-copy", "file-object"]), "it went on past a failed filing");
    assert(/Your new copy is saved — but it couldn't go into Mudkips: that binder has been put away\. It's Unfiled\./.test(flat(cross(s.r))), flat(cross(s.r)));
    await tap(xbtn(s.r, /^Retry filing$/));
    eq(json(kinds(s.sent)), json(["record-copy", "file-object", "file-object", "stop-looking"]));
    eq(s.sent[2][0].collectorCopyId, "k-new1");
    eq(s.live.collectorCopies.filter((c) => c.canonicalCardId === "cc-mud-r").length, 2, "a second copy");
  });
  test("Leave it Unfiled: the copy stays, the Goal is decided as asked", async () => {
    const s = await show({ answer: (st) => (st.kind === "file-object" ? { ok: false, refused: "binder-archived" } : { ok: true }) });
    await startCross(s.r, /Primary.*Mudkip/, "PC");
    await tap(confirmBtn(s.r));
    await tap(xbtn(s.r, /^Leave it Unfiled$/));
    eq(json(kinds(s.sent)), json(["record-copy", "file-object"]));
    assert(/✓ Added to Personal Collection/.test(flat(cross(s.r))) && /Unfiled/.test(flat(cross(s.r))));
  });
  test("filing answer lost but landed: Retry filing looks and sends nothing", async () => {
    let files = 0;
    const s = await show({ answer: (st) => (st.kind === "file-object" && files++ === 0 ? "throw-done" : { ok: true }) });
    await startCross(s.r, /Primary.*Mudkip/, "PC");
    await tap(confirmBtn(s.r));
    assert(/It may be there already; Retry filing checks\./.test(flat(cross(s.r))));
    await tap(xbtn(s.r, /^Retry filing$/));
    eq(json(kinds(s.sent)), json(["record-copy", "file-object"]));
    assert(/✓ Added/.test(flat(cross(s.r))));
  });
  test("create answer lost, and it WAS made: looked up and filed — no second create", async () => {
    const s = await show({ answer: (st) => (st.kind === "record-copy" ? "throw-made" : { ok: true }) });
    await startCross(s.r, /Primary.*Mudkip/, "PC");
    await tap(confirmBtn(s.r));
    eq(json(kinds(s.sent)), json(["record-copy", "file-object"]));
    eq(s.sent[1][0].collectorCopyId, "k-new1");
  });
  test("create answer lost, NOT made: nothing more sent; it says nothing was saved", async () => {
    const s = await show({ answer: (st) => (st.kind === "record-copy" ? "throw" : { ok: true }) });
    await startCross(s.r, /Primary.*Mudkip/, "PC");
    await tap(xchoice(s.r, "Stop looking for this card"));
    await tap(confirmBtn(s.r));
    eq(json(kinds(s.sent)), json(["record-copy"]));
    assert(/lost contact, and nothing was saved/.test(flat(cross(s.r))));
  });
  test("removal answer lost: re-read; a Goal still there is said to be there, and not resent", async () => {
    const s = await show({ answer: (st) => (st.kind === "stop-looking" ? "throw" : { ok: true }) });
    await startCross(s.r, /Primary.*Mudkip/, "PC");
    await tap(xchoice(s.r, "Stop looking for this card"));
    await tap(confirmBtn(s.r));
    eq(json(kinds(s.sent)), json(["record-copy", "file-object", "stop-looking"]));
    assert(/It's still there/.test(flat(cross(s.r))), flat(cross(s.r)));
  });
  test("removal answer lost but it went: said as stopped", async () => {
    const s = await show({ answer: (st) => (st.kind === "stop-looking" ? "throw-done" : { ok: true }) });
    await startCross(s.r, /Primary.*Mudkip/, "PC");
    await tap(xchoice(s.r, "Stop looking for this card"));
    await tap(confirmBtn(s.r));
    assert(cross(s.r) && /You've stopped looking for this card\./.test(flat(cross(s.r))));
  });
  test("Back from the step returns to the card, nothing sent; Escape does not close the step", async () => {
    const s = await show();
    await startCross(s.r, /Primary.*Mudkip/, "PC");
    await TR.act(async () => { fireWin("keydown", { key: "Escape" }); }); await settle();
    assert(cross(s.r), "Escape threw the step away");
    await tap(xbtn(s.r, /^‹ Back$/));
    assert(page(s.r) && !cross(s.r)); eq(s.sent.length, 0);
  });
});

/* ============================================================== F */
describe("F. boundaries", () => {
  test("no new step kinds; nothing deletes-and-recreates", () => {
    const src = read("client/collector/CardCross.jsx").replace(/\/\*[\s\S]*?\*\//g, "");
    const used = [...src.matchAll(/kind: "([a-z-]+)"/g)].map((m) => m[1]).filter((k, i, all) => all.indexOf(k) === i).sort();
    eq(json(used), json(["file-object", "how-hard", "record-copy", "start-looking", "stop-looking"]));
    assert(!/forget-copy|correct-copy|wanted-copy|unfile-object/.test(src));
  });
});

run();
