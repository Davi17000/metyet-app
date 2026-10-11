/* ============================================================================
   PHASE 6 P6-F4 BATCH 5 — THE SAVED CARD'S FOUR STATES, ONE SUBMIT (CardEdit)
   Select any state → Submit Update → the server confirms → the card is in
   its new state. One changeCollectingState (the real domain command, run
   here against the page's world); no sheet, no questions, no second card.
     A. the draft        four states; saved selected; Submit live only on a
                         real difference, and off again when undone
     B. same record      Primary ↔ Secondary, PC ↔ Trade / Sell: same id
     C. across           the record re-made: the page opens it, same card,
                         same binder; its history offered, never applied
     D. refusals         said in the Collector's words; the saved state back
     E. lost answers     looked up, never resent
     F. with other edits the record's own fields first, then its state
     G. boundaries       CardCross retired; Browse and Add cards untouched
   Supersedes tests/phase6-f4-b4-guided-transitions.cjs (B4 / B4.1's guided
   creation sheet, retired by founder decision in B5).
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
const C = require("../domain/metyet-commands.js");
const RT = require("../domain/metyet-runtime.js");
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
  collectors: [{ id: ME, name: "Casey" }],
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
    if (step.kind === "change-state") {
      const a = await answer(step);
      if (a === "throw") throw new Error("offline");
      if (a && a.ok === false) return a;
      const r = C.execute(live, { collectorId: ME }, "changeCollectingState",
        step.goalId ? { goalId: step.goalId, from: step.from, to: step.to } : { collectorCopyId: step.collectorCopyId, from: step.from, to: step.to }, RT.systemRuntime());
      if (r.ok) { live = r.state; setLive(live); }
      if (a === "throw-done") throw new Error("offline");
      return r.ok ? { ok: true, value: r.value } : r;
    }
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

const backTo = async (r) => { await tap(page(r).findAll((n) => cls(n) === "mcs-cd-back")[0]); };
const ready = (r) => saveBtn(r).props["aria-disabled"] === false;
const kinds = (sent) => sent.map(([s]) => s.kind);
const dock = (r) => flat(page(r).findAll((n) => cls(n) === "mcs-cd-dock")[0]);
const tilesFor = (r, re) => r.root.findAll((n) => n.type === "li" && cls(n).includes("mcs-otile")).filter((li) => re.test(flat(li)));
const homeOf = (live, id) => (live.binderMemberships.find((m) => m.goalId === id || m.collectorCopyId === id) || {}).binderId || null;
const statesOn = (r) => page(r).findAll((n) => n.props && n.props["data-q"] === "state")[0]
  .findAll((n) => n.type === "button" && n.props["data-st"]).map((b) => [b.props["data-st"], b.props["aria-pressed"]]);
const recall = (r) => page(r).findAll((n) => cls(n) === "mcs-ce-recall")[0] || null;
const btnIn = (n, re) => n.findAll((x) => x.type === "button" && re.test(flat(x)))[0] || null;

/* ============================================================== A */
describe("A. four states, a draft, and Submit Update", () => {
  test("a Goal opens on its saved state, Submit off; any state selects in place, sends nothing; back again is no change", async () => {
    const s = await show();
    await open(s.r, /Primary.*Mudkip/);
    eq(json(statesOn(s.r)), json([["primary", true], ["secondary", false], ["pc", false], ["trade", false]]));
    eq(flat(saveBtn(s.r)), "Submit update"); assert(!ready(s.r), "live on opening");
    for (const m of ["Trade / Sell", "PC", "Secondary"]) { await tap(choice(s.r, m)); assert(ready(s.r), `${m} did not turn Submit on`); }
    eq(json(statesOn(s.r)), json([["primary", false], ["secondary", true], ["pc", false], ["trade", false]]));
    await tap(choice(s.r, "Primary")); assert(!ready(s.r), "the saved state again is still a change");
    eq(s.sent.length, 0);
    eq(r_dialogs(s.r), 1, "something opened over the card");
  });
  test("grade, certificate and value: on when changed, off when undone; the removal question is not a change", async () => {
    const s = await show();
    await open(s.r, /PC.*Charizard #4 · Holo · PSA 8/);
    assert(!ready(s.r));
    await tap(choice(s.r, "PSA 9")); assert(ready(s.r)); await tap(choice(s.r, "PSA 8")); assert(!ready(s.r));
    await type(inputs(s.r)[0], "CERT-Z"); assert(ready(s.r)); await type(inputs(s.r)[0], "CERT-A"); assert(!ready(s.r));
    await type(inputs(s.r)[1], "301"); assert(ready(s.r)); await type(inputs(s.r)[1], "300"); assert(!ready(s.r));
    await tap(btnIn(page(s.r), /^I no longer own this$/)); assert(!ready(s.r));
    await tap(btnIn(page(s.r), /^Keep it$/)); assert(!ready(s.r));
    eq(s.sent.length, 0);
  });
});
const r_dialogs = (r) => r.root.findAll((n) => n.props && n.props.role === "dialog" && n.props["aria-modal"] === "true").length;

/* ============================================================== B */
describe("B. the same record: Primary ↔ Secondary, PC ↔ Trade / Sell", () => {
  test("Primary → Secondary: one change-state on g-mud; the same Goal, its wanted copy and binder kept; reopened as Secondary", async () => {
    const s = await show();
    await open(s.r, /Primary.*Mudkip/);
    await tap(choice(s.r, "Secondary")); await save(s.r);
    eq(json(steps(s.sent)), json([{ kind: "change-state", goalId: "g-mud", from: "primary", to: "secondary" }]));
    const g = s.live.goals.find((x) => x.id === "g-mud");
    eq(json([g.tier, g.desired]), json(["secondary", { grade: "Raw", condition: "Near Mint" }]));
    eq(homeOf(s.live, "g-mud"), "b-mud");
    assert(/✓ Saved — Secondary\./.test(dock(s.r)), dock(s.r)); assert(!ready(s.r));
    await backTo(s.r); await open(s.r, /Secondary.*Mudkip/);
    eq(statesOn(s.r)[1][1], true);
  });
  test("PC → Trade / Sell → PC: the same copy k-a; cert, value, grade, binder kept", async () => {
    const s = await show();
    await open(s.r, /PC.*Charizard #4 · Holo · PSA 8/);
    await tap(choice(s.r, "Trade / Sell")); await save(s.r);
    await tap(choice(s.r, "PC")); await save(s.r);
    eq(json(steps(s.sent).map((x) => [x.collectorCopyId, x.from, x.to])), json([["k-a", "pc", "trade"], ["k-a", "trade", "pc"]]));
    const k = s.live.collectorCopies.find((c) => c.id === "k-a");
    eq(json([k.grade, k.cert, k.market, k.keeping, k.offered]), json(["PSA 8", "CERT-A", 300, true, false]));
    eq(homeOf(s.live, "k-a"), "b-gen1");
  });
});

/* ============================================================== C */
describe("C. across the pair: the record re-made, the same card on screen", () => {
  test("Primary → PC: one command; the page is now the copy, same binder, no grade asserted; one Mudkip tile still", async () => {
    const s = await show();
    const tiles0 = tilesFor(s.r, /Mudkip/).length;
    await open(s.r, /Primary.*Mudkip/);
    await tap(choice(s.r, "PC")); await save(s.r);
    eq(json(kinds(s.sent)), json(["change-state"]));
    assert(page(s.r) && /^Your copy: Mudkip/.test(page(s.r).props["aria-label"]), "the page is not the copy");
    eq(json(statesOn(s.r).filter(([, on]) => on)), json([["pc", true]]));
    assert(/✓ Now PC — same card, still in Mudkips\./.test(dock(s.r)), dock(s.r));
    assert(!ready(s.r));
    const copy = s.live.collectorCopies.find((c) => c.formerly && c.formerly[0].id === "g-mud");
    assert(copy && !("grade" in copy), "a wanted grade was asserted");
    eq(homeOf(s.live, copy.id), "b-mud");
    assert(!s.live.goals.some((g) => g.id === "g-mud"));
    eq(tilesFor(s.r, /Mudkip/).length, tiles0, "a second card appeared");
    eq(json(pressed(s.r)), json(["PC"]), "a grade is shown as chosen");
  });
  test("after it: 'You were looking for Raw · Near Mint' — a tap fills the draft; Submit sends the copy's own edit", async () => {
    const s = await show();
    await open(s.r, /Primary.*Mudkip/);
    await tap(choice(s.r, "PC")); await save(s.r);
    assert(recall(s.r) && /You were looking for Raw · Near Mint — is this one Raw · Near Mint\?/.test(flat(recall(s.r))), page(s.r) ? flat(page(s.r)) : "no page");
    eq(s.sent.length, 1, "the suggestion sent something");
    await tap(btnIn(recall(s.r), /^Yes, Raw · Near Mint$/));
    eq(json(pressed(s.r)), json(["PC", "Raw", "Near Mint"])); assert(ready(s.r));
    await save(s.r);
    const id = s.live.collectorCopies.find((c) => c.formerly).id;
    eq(json(steps(s.sent)[1]), json({ kind: "correct-copy", copyId: id, patch: { grade: "Raw", condition: "Near Mint" } }));
    eq(recall(s.r), null, "the suggestion stays after it was taken");
  });
  test("PC copy → Primary: the Goal wants what the copy was; the copy's cert and value are kept in its history, and said", async () => {
    const s = await show();
    await open(s.r, /PC.*Charizard #4 · Holo · PSA 8/);
    await tap(choice(s.r, "Primary")); await save(s.r);
    assert(/^Your Goal: Charizard/.test(page(s.r).props["aria-label"]));
    eq(json(pressed(s.r)), json(["Primary", "Graded", "PSA 8"]));
    assert(/From your copy: PSA 8 · Cert CERT-A · \$300 — kept with this card\./.test(flat(page(s.r))), flat(page(s.r)));
    assert(/still in Gen 1/.test(dock(s.r)));
    const g = s.live.goals.find((x) => x.formerly && x.formerly[0].id === "k-a");
    eq(homeOf(s.live, g.id), "b-gen1");
    eq(json(s.live.collectorCopies.find((c) => c.id === "k-b")), json(STATE().collectorCopies[1]), "its sibling copy changed");
  });
  test("PC → Primary → Trade / Sell: 'Your earlier copy' can be restored in one tap; nothing applied until Submit", async () => {
    const s = await show();
    await open(s.r, /PC.*Charizard #4 · Holo · PSA 8/);
    await tap(choice(s.r, "Primary")); await save(s.r);
    await tap(choice(s.r, "Trade / Sell")); await save(s.r);
    assert(/^Your copy: Charizard/.test(page(s.r).props["aria-label"]));
    const copy = s.live.collectorCopies.find((c) => c.formerly && c.formerly.length === 2);
    assert(copy, "the lineage did not carry both crossings");
    eq(json(copy.formerly.map((f) => f.kind)), json(["copy", "goal"]));
    assert(/Your earlier copy: PSA 8 · Cert CERT-A · \$300\./.test(flat(recall(s.r))), flat(recall(s.r)));
    assert(/You were looking for PSA 8/.test(flat(recall(s.r))));
    await tap(btnIn(recall(s.r), /^Restore these$/));
    eq(json(inputs(s.r).map((i) => i.props.value)), json(["CERT-A", "300"]));
    eq(s.sent.length, 2);
    await save(s.r);
    eq(json(steps(s.sent)[2]), json({ kind: "correct-copy", copyId: copy.id, patch: { grade: "PSA 8", condition: null, cert: "CERT-A", market: 300 } }));
  });
});

/* ============================================================== D */
describe("D. refusals: said, and the saved state comes back", () => {
  test("a copy whose printing already has a Goal: duplicate-goal, said; still PC; nothing changed", async () => {
    const s = await show();
    const before = json(s.live);
    await open(s.r, /PC.*Mudkip/);
    await tap(choice(s.r, "Secondary")); await save(s.r);
    assert(/You already have a Goal for this version, so MetYet won't make a second one\./.test(dock(s.r)), dock(s.r));
    eq(json(statesOn(s.r).filter(([, on]) => on)), json([["pc", true]]));
    assert(!ready(s.r)); eq(json(s.live), before);
  });
  test("a Trusted Partner's interest: partner-interest, said", async () => {
    const world = STATE(); world.interests = [{ partnerId: "nl", binderId: "k-b", at: "2030-01-01" }];
    const s = await show({ world });
    await open(s.r, /Trade \/ Sell.*Charizard #4 · Holo · Raw/);
    await tap(choice(s.r, "Primary")); await save(s.r);
    assert(/A Trusted Partner is interested in this copy/.test(dock(s.r)), dock(s.r));
    eq(json(statesOn(s.r).filter(([, on]) => on)), json([["trade", true]]));
  });
  test("a copy with no grade: criteria-required, with what to correct", async () => {
    const world = STATE(); world.collectorCopies.push({ id: "k-n", collectorId: ME, canonicalCardId: "cc-ven", keeping: true, status: "available", addedAt: "2030-01-09" });
    world.goals = world.goals.filter((g) => g.id !== "g-ven");
    const s = await show({ world });
    await open(s.r, /PC.*Venusaur/);
    await tap(choice(s.r, "Primary")); await save(s.r);
    assert(/Add this copy's grade first \(and its condition, if it's Raw\)/.test(dock(s.r)), dock(s.r));
  });
  test("an active deal: goal-locked, said; still Primary", async () => {
    const s = await show({ answer: (st) => (st.kind === "change-state" ? { ok: false, refused: "goal-locked" } : { ok: true }) });
    await open(s.r, /Primary.*Mudkip/);
    await tap(choice(s.r, "Trade / Sell")); await save(s.r);
    assert(/part of an active deal/.test(dock(s.r)) && !/✓/.test(dock(s.r)), dock(s.r));
    eq(json(statesOn(s.r).filter(([, on]) => on)), json([["primary", true]]));
    assert(s.live.goals.some((g) => g.id === "g-mud"));
  });
  test("double Submit while sending: one command", async () => {
    let release = null;
    const s = await show({ answer: (st) => (st.kind === "change-state" ? new Promise((r) => { release = r; }) : { ok: true }) });
    await open(s.r, /Primary.*Mudkip/);
    await tap(choice(s.r, "Secondary"));
    await TR.act(async () => { saveBtn(s.r).props.onClick(); saveBtn(s.r).props.onClick(); }); await settle();
    eq(s.sent.length, 1);
    await tap(saveBtn(s.r)); eq(s.sent.length, 1, "a third tap sent again");
    await TR.act(async () => { release({ ok: false, refused: "state-changed" }); }); await settle();
    eq(s.sent.length, 1);
  });
});

/* ============================================================== E */
describe("E. a lost answer is looked up, never resent", () => {
  test("lost, and it landed: the page opens the new record, said as done; sent once", async () => {
    const s = await show({ answer: (st) => (st.kind === "change-state" ? "throw-done" : { ok: true }) });
    await open(s.r, /Primary.*Mudkip/);
    await tap(choice(s.r, "PC")); await save(s.r);
    eq(s.sent.length, 1);
    assert(/^Your copy: Mudkip/.test(page(s.r).props["aria-label"]) && /✓ Now PC/.test(dock(s.r)), dock(s.r));
  });
  test("lost, and it did not land: said; the saved state back; nothing resent", async () => {
    const s = await show({ answer: (st) => (st.kind === "change-state" ? "throw" : { ok: true }) });
    await open(s.r, /Primary.*Mudkip/);
    await tap(choice(s.r, "PC")); await save(s.r);
    eq(s.sent.length, 1);
    assert(/MetYet lost contact, and the change didn't happen/.test(dock(s.r)), dock(s.r));
    eq(json(statesOn(s.r).filter(([, on]) => on)), json([["primary", true]]));
    assert(s.live.goals.some((g) => g.id === "g-mud"));
  });
});

/* ============================================================== F */
describe("F. with the record's own edits: those first, then its state", () => {
  test("a Goal's wanted condition and PC together: wanted-copy, then change-state; the lineage holds the corrected want", async () => {
    const s = await show();
    await open(s.r, /Primary.*Mudkip/);
    await tap(choice(s.r, "Lightly Played")); await tap(choice(s.r, "PC")); await save(s.r);
    eq(json(kinds(s.sent)), json(["wanted-copy", "change-state"]));
    const copy = s.live.collectorCopies.find((c) => c.formerly && c.formerly[0].id === "g-mud");
    eq(json(copy.formerly[0].facts.desired), json({ grade: "Raw", condition: "Lightly Played" }));
  });
  test("a copy's certificate and Primary together: correct-copy, then change-state; the new cert is in its history", async () => {
    const s = await show();
    await open(s.r, /PC.*Charizard #4 · Holo · PSA 8/);
    await type(inputs(s.r)[0], "CERT-NEW"); await tap(choice(s.r, "Primary")); await save(s.r);
    eq(json(kinds(s.sent)), json(["correct-copy", "change-state"]));
    const g = s.live.goals.find((x) => x.formerly && x.formerly[0].id === "k-a");
    eq(g.formerly[0].facts.cert, "CERT-NEW");
  });
});

/* ============================================================== G */
describe("G. boundaries", () => {
  test("the guided creation sheet is retired; the page makes and removes nothing by itself", () => {
    assert(!fs.existsSync(path.join(ROOT, "client/collector/CardCross.jsx")), "CardCross.jsx is still here");
    const src = read("client/collector/CardEdit.jsx").replace(/\/\*[\s\S]*?\*\//g, "");
    assert(!/CardCross|record-copy|start-looking|file-object/.test(src), "the page still creates or files records");
    const used = [...src.matchAll(/kind: "([a-z-]+)"/g)].map((m) => m[1]).filter((k, i, all) => all.indexOf(k) === i);
    const ALLOWED = ["change-state", "correct-copy", "wanted-copy", "how-hard", "keeping", "offering", "stop-looking", "forget-copy"];
    assert(used.every((k) => ALLOWED.includes(k)), "a step outside the page's own: " + used);
    assert(used.includes("change-state"));
  });
  test("Browse and + Add cards still create Goals and copies", () => {
    const detail = read("client/collector/CardDetail.jsx");
    assert(/record-copy/.test(detail) && /start-looking/.test(detail) && /file-object/.test(detail));
  });
});

run();
