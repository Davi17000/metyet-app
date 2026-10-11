/* ============================================================================
   PHASE 6 P6-F4 BATCH 2B — A SAVED CARD, EDITED IN PLACE (CardEdit)
   Add once. Refine effortlessly.
     A. preselection     the record's own saved answers, from the projection;
                         two copies of one card are never conflated
     B. saving           only what changed, through the existing steps; no-op
                         Save disabled; one at a time; said after the answer
     C. independence     a state change keeps the configuration; a configuration
                         change keeps the state; the binder never moves
     D. identity         the version is fixed — no step can change a record's
                         card; the record keeps its id
     E. refusals         a refusal claims nothing; a partial save says exactly
                         what was saved and what was not
     F. removal          only behind a confirmation; the page closes and says so
     G. shape            Escape closes; no administrative entry points
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
    { id: "k-b", collectorId: ME, canonicalCardId: "cc-char", grade: "Raw", condition: "Lightly Played", offered: true, cert: "SER-B", status: "available", addedAt: "2030-01-07", grading: { state: "raw", label: "Raw · Lightly Played" } }],
  binderMemberships: [{ id: "m1", binderId: "b-mud", goalId: "g-mud" }, { id: "m2", binderId: "b-gen1", collectorCopyId: "k-a" }],
  binderEntries: [], catalog: [], partners: [], relationships: [], inventory: [], opportunities: [], discoveries: [],
});
const applyStep = (s, step) => {
  const goals = (f) => ({ ...s, goals: s.goals.map((g) => (g.id === step.goalId ? f(g) : g)) });
  const copies = (f) => ({ ...s, collectorCopies: s.collectorCopies.map((c) => (c.id === step.copyId ? f(c) : c)) });
  if (step.kind === "how-hard") return goals((g) => ({ ...g, tier: step.tier }));
  /* (P6-F4 B5: a same-type change-state is the same record's tier or disposition) */
  if (step.kind === "change-state" && step.goalId) return { ...s, goals: s.goals.map((g) => (g.id === step.goalId ? { ...g, tier: step.to } : g)) };
  if (step.kind === "change-state") return { ...s, collectorCopies: s.collectorCopies.map((c) => (c.id === step.collectorCopyId
    ? (step.to === "pc" ? { ...c, keeping: true, offered: false } : { ...c, offered: true, keeping: false }) : c)) };
  if (step.kind === "wanted-copy") return goals((g) => ({ ...g, desired: step.desired }));
  if (step.kind === "correct-copy") return copies((c) => ({ ...c, ...step.patch }));
  if (step.kind === "keeping") return copies((c) => ({ ...c, keeping: true, offered: false }));
  if (step.kind === "offering") return copies((c) => ({ ...c, offered: true, keeping: false }));
  if (step.kind === "stop-looking") return { ...s, goals: s.goals.filter((g) => g.id !== step.goalId), binderMemberships: s.binderMemberships.filter((m) => m.goalId !== step.goalId) };
  if (step.kind === "forget-copy") return { ...s, collectorCopies: s.collectorCopies.filter((c) => c.id !== step.copyId), binderMemberships: s.binderMemberships.filter((m) => m.collectorCopyId !== step.copyId) };
  return s;
};
async function show({ answer = () => ({ ok: true }), hold = false } = {}) {
  const sent = []; const gates = []; let setLive = null; let live = STATE();
  const onSpecify = async (step, canonicalCardId) => {
    sent.push([step, canonicalCardId]);
    if (hold) { const g = {}; g.promise = new Promise((r) => { g.resolve = r; }); gates.push(g); const a = await g.promise; if (!a || a.ok !== false) { live = applyStep(live, step); setLive(live); } return a; }
    const a = answer(step);
    if (a === "throw") throw new Error("offline");
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

/* RESTATED (P6-F4 B2B.1): what it means comes FIRST on the page, so a page's
   selected answers read state, then grading; a copy's states are "PC" and
   "Trade / Sell" in the shared language. */
/* ============================================================== A */
describe("A. the record's own saved answers, already chosen", () => {
  test("a Goal: its version, Raw · Near Mint, Primary, and its binder", async () => {
    const { r, sent } = await show();
    await open(r, /Mudkip/);
    eq(page(r).props["aria-label"], "Your Goal: Mudkip");
    assert(/Ruby & Sapphire · 60 · Ken Sugimori/.test(flat(page(r))), flat(page(r)));
    assert(/Reverse Holo — the version you saved\./.test(flat(page(r))));
    eq(json(pressed(r)), json(["Primary", "Raw", "Near Mint"]));
    assert(/Binder In Mudkips/.test(flat(page(r))));
    eq(saveBtn(r).props["aria-disabled"], true, "Save offered with nothing changed");
    eq(sent.length, 0, "opening wrote something");
  });
  test("a Goal with no criteria opens empty on them — never Raw, never a grade", async () => {
    const { r } = await show();
    await open(r, /Venusaur/);
    eq(json(pressed(r)), json(["Secondary"]));
  });
  test("two copies of one card open as themselves: each its own grading, state, cert and value", async () => {
    const { r } = await show();
    await open(r, /PC.*Charizard/);
    eq(json(pressed(r)), json(["PC", "Graded", "PSA 8"]));
    eq(json(inputs(r).map((i) => i.props.value)), json(["CERT-A", "300"]));
    await tap(page(r).findAll((n) => cls(n) === "mcs-cd-back")[0]);
    await open(r, /Trade \/ Sell.*Charizard/);
    eq(json(pressed(r)), json(["Trade / Sell", "Raw", "Lightly Played"]));
    eq(json(inputs(r).map((i) => i.props.value)), json(["SER-B", ""]));
  });
});

/* ============================================================== B */
describe("B. Save changes sends only what changed", () => {
  /* RESTATED (P6-F4 B5): the state step is change-state (changeCollectingState) */
  test("Primary → Secondary: one state step on that Goal; Raw · Near Mint and the binder untouched", async () => {
    const s = await show();
    await open(s.r, /Mudkip/);
    await tap(choice(s.r, "Secondary"));
    eq(saveBtn(s.r).props["aria-disabled"], false);
    await save(s.r);
    eq(json(steps(s.sent)), json([{ kind: "change-state", goalId: "g-mud", from: "primary", to: "secondary" }]));
    eq(s.sent[0][1], "cc-mud-r", "the exact card");
    eq(json(pressed(s.r)), json(["Secondary", "Raw", "Near Mint"]), "the configuration was reset");
    assert(/✓ Saved — Secondary\./.test(flat(page(s.r))));
    eq(json(s.live.binderMemberships), json(STATE().binderMemberships), "the binder moved");
    eq(saveBtn(s.r).props["aria-disabled"], true, "Save stays ready after the change is saved");
  });
  test("a condition change: one wanted-copy step; the tier stays", async () => {
    const s = await show();
    await open(s.r, /Mudkip/);
    await tap(choice(s.r, "Lightly Played"));
    await save(s.r);
    eq(json(steps(s.sent)), json([{ kind: "wanted-copy", goalId: "g-mud", desired: { grade: "Raw", condition: "Lightly Played" } }]));
    eq(json(pressed(s.r)), json(["Primary", "Raw", "Lightly Played"]), "the state was reset");
  });
  test("Raw → Graded clears only the condition, asks for a grade, then saves both with the tier untouched", async () => {
    const s = await show();
    await open(s.r, /Mudkip/);
    await tap(choice(s.r, "Graded"));
    eq(json(pressed(s.r)), json(["Primary", "Graded"]), "the tier was cleared with the condition");
    eq(saveBtn(s.r).props["aria-disabled"], true, "a graded Goal with no grade offered to save");
    assert(/Which grade is it\?/.test(flat(page(s.r))));
    await tap(choice(s.r, "PSA 10"));
    await save(s.r);
    eq(json(steps(s.sent)), json([{ kind: "wanted-copy", goalId: "g-mud", desired: { grade: "PSA 10" } }]));
  });
  /* RESTATED (P6-F4 B5) */
  test("a copy: PC → Trade / Sell is one state step; its grading, cert and value stay", async () => {
    const s = await show();
    await open(s.r, /PC.*Charizard/);
    await tap(choice(s.r, "Trade / Sell"));
    await save(s.r);
    eq(json(steps(s.sent)), json([{ kind: "change-state", collectorCopyId: "k-a", from: "pc", to: "trade" }]));
    eq(json(pressed(s.r)), json(["Trade / Sell", "Graded", "PSA 8"]));
  });
  test("a copy's grade, cert and value together are ONE correct-copy patch, naming only what changed", async () => {
    const s = await show();
    await open(s.r, /PC.*Charizard/);
    await tap(choice(s.r, "PSA 9"));
    await type(inputs(s.r)[0], "CERT-A2");
    await save(s.r);
    eq(json(steps(s.sent)), json([{ kind: "correct-copy", copyId: "k-a", patch: { grade: "PSA 9", condition: null, cert: "CERT-A2" } }]));
  });
  test("a changed value alone is a patch of the value alone; a bad value cannot be saved", async () => {
    const s = await show();
    await open(s.r, /PC.*Charizard/);
    await type(inputs(s.r)[1], "-5");
    eq(saveBtn(s.r).props["aria-disabled"], true, "a negative value offered to save");
    await type(inputs(s.r)[1], "450");
    await save(s.r);
    eq(json(steps(s.sent)), json([{ kind: "correct-copy", copyId: "k-a", patch: { market: 450 } }]));
  });
  test("putting an answer back the way it was leaves nothing to save", async () => {
    const s = await show();
    await open(s.r, /Mudkip/);
    await tap(choice(s.r, "Secondary")); await tap(choice(s.r, "Primary"));
    eq(saveBtn(s.r).props["aria-disabled"], true);
    await save(s.r);
    eq(s.sent.length, 0);
  });
  test("one Save, however many taps; nothing claimed until the server answers", async () => {
    const s = await show({ hold: true });
    await open(s.r, /Mudkip/);
    await tap(choice(s.r, "Secondary"));
    const b = saveBtn(s.r);
    await TR.act(async () => { b.props.onClick(); b.props.onClick(); });
    eq(s.sent.length, 1, "a duplicate submission");
    assert(/Saving…/.test(flat(saveBtn(s.r))) && !/✓/.test(flat(page(s.r))), "success before the answer");
    await TR.act(async () => { s.gates[0].resolve({ ok: true }); }); await settle();
    assert(/✓ Saved/.test(flat(page(s.r))));
  });
});

/* ============================================================== B.1 */
describe("B.1 an owned copy's state, both ways (P6-F4 B2B.1)", () => {
  const backTo = async (r) => { await tap(page(r).findAll((n) => cls(n) === "mcs-cd-back")[0]); };
  /* RESTATED (P6-F4 B4): all four states, the record's own pair first among
     equals; the other pair opens the guided step (tests/phase6-f4-b4-guided-transitions.cjs) */
  test("the state question comes first, right under the card, with all four states", async () => {
    const { r } = await show();
    await open(r, /PC.*Charizard/);
    const qs = page(r).findAll((n) => n.props && n.props["data-q"]).map((n) => n.props["data-q"]);
    eq(qs[0], "state", "what it means is not the first question: " + json(qs));
    const st = page(r).findAll((n) => n.props && n.props["data-q"] === "state")[0];
    assert(/^What does this card mean to you\?/.test(flat(st)), flat(st));
    eq(json(st.findAll((n) => n.type === "button").map((b) => [b.props["data-st"], flat(b), b.props["aria-pressed"]])),
      json([["primary", "Primary Actively hunting", false], ["secondary", "Secondary I'm interested in this card.", false],
        ["pc", "PC A keeper", true], ["trade", "Trade / Sell Available for trade or sale", false]]));
  });
  test("PC → Trade / Sell → Save → reopen: Trade / Sell is selected; grade, cert, value and binder unchanged", async () => {
    const s = await show();
    await open(s.r, /PC.*Charizard/);
    await tap(choice(s.r, "Trade / Sell")); await save(s.r);
    eq(json(steps(s.sent)), json([{ kind: "change-state", collectorCopyId: "k-a", from: "pc", to: "trade" }]));
    await backTo(s.r);
    await open(s.r, /Trade \/ Sell.*Charizard #4 · Holo · PSA 8/);
    eq(json(pressed(s.r)), json(["Trade / Sell", "Graded", "PSA 8"]));
    eq(json(inputs(s.r).map((i) => i.props.value)), json(["CERT-A", "300"]));
    const k = s.live.collectorCopies.find((c) => c.id === "k-a");
    eq(json([k.grade, k.cert, k.market, k.offered, k.keeping]), json(["PSA 8", "CERT-A", 300, true, false]));
    eq(json(s.live.binderMemberships), json(STATE().binderMemberships));
  });
  test("Trade / Sell → PC → Save → reopen: PC is selected; the other copy of the card is untouched", async () => {
    const s = await show();
    await open(s.r, /Trade \/ Sell.*Charizard/);
    await tap(choice(s.r, "PC")); await save(s.r);
    eq(json(steps(s.sent)), json([{ kind: "change-state", collectorCopyId: "k-b", from: "trade", to: "pc" }]));
    await backTo(s.r);
    await open(s.r, /PC.*Charizard #4 · Holo · Raw/);
    eq(json(pressed(s.r)), json(["PC", "Raw", "Lightly Played"]));
    const other = s.live.collectorCopies.find((c) => c.id === "k-a");
    eq(json([other.keeping, other.offered]), json([true, false]), "the other copy changed");
  });
  test("a refused state change claims nothing, and reopening shows the server's state", async () => {
    const s = await show({ answer: () => ({ ok: false, refused: "copy-committed" }) });
    await open(s.r, /PC.*Charizard/);
    await tap(choice(s.r, "Trade / Sell")); await save(s.r);
    /* RESTATED (P6-F4 B5): the state step's own words */
    assert(!/✓/.test(flat(page(s.r))) && /This copy is part of a deal, so it stays in your collection\./.test(flat(page(s.r))), flat(page(s.r)));
    await backTo(s.r);
    await open(s.r, /PC.*Charizard/);
    eq(choice(s.r, "PC").props["aria-pressed"], true, "the refused state is shown as saved");
  });
});

/* ============================================================== D */
describe("D. a record's version is its identity", () => {
  test("the version is shown, never offered as a choice; Browse is where another version is recorded", async () => {
    const { r } = await show();
    await open(r, /Mudkip/);
    eq(page(r).findAll((n) => n.props && n.props["data-q"] === "print")[0].findAll((n) => n.type === "button").length, 0, "a version choice");
    assert(/To record a different version, add it from Browse\./.test(flat(page(r))));
  });
  test("no step the page can send names a card, and none makes or converts a record", () => {
    const thing = STATE().collectorCopies[0];
    const all = EDIT.changesFor("copy", thing, { ...EDIT.savedOf("copy", thing), kind: "raw", condition: "Damaged", grade: null, cert: "X", market: "1", disposition: "trade" });
    for (const st of all) assert(!("canonicalCardId" in st) && !("canonicalCardId" in (st.patch || {})) && !("cardId" in (st.patch || {})), "a step names a card: " + json(st));
    eq(json(all.map((x) => x.kind)), json(["correct-copy", "offering"]));
    const src = read("client/collector/CardEdit.jsx");
    assert(!/start-looking|record-copy|canonicalCardId:/.test(src), "the page can make a record or set a card");
  });
  test("after a save the record is the same record: same id, same binder", async () => {
    const s = await show();
    await open(s.r, /PC.*Charizard/);
    await tap(choice(s.r, "Trade / Sell")); await save(s.r);
    eq(s.live.collectorCopies.filter((c) => c.canonicalCardId === "cc-char").map((c) => c.id).join(), "k-a,k-b", "a record was replaced");
    eq(json(s.live.binderMemberships), json(STATE().binderMemberships));
    eq(page(s.r).props["aria-label"], "Your copy: Charizard", "the page lost its record");
  });
});

/* ============================================================== E */
describe("E. refusals and partial saves", () => {
  /* RESTATED (P6-F4 B5, founder): a refused state change shows the ORIGINAL
     saved state again, and says why — it no longer keeps the refused draft */
  test("a refusal: said, nothing claimed, the saved state shown again", async () => {
    const s = await show({ answer: () => ({ ok: false, refused: "goal-locked" }) });
    await open(s.r, /Mudkip/);
    await tap(choice(s.r, "Secondary")); await save(s.r);
    assert(/This card is part of an active deal, so it stays as it is until the deal ends\./.test(flat(page(s.r))), flat(page(s.r)));
    assert(!/✓/.test(flat(page(s.r))));
    eq(json(pressed(s.r)), json(["Primary", "Raw", "Near Mint"]), "the refused state is still shown");
  });
  test("two changes, the second refused: says exactly what was saved and what was not", async () => {
    /* RESTATED (P6-F4 B5): the state is the last step, change-state */
    const s = await show({ answer: (step) => (step.kind === "change-state" ? { ok: false, refused: "goal-locked" } : { ok: true }) });
    await open(s.r, /Mudkip/);
    await tap(choice(s.r, "Lightly Played")); await tap(choice(s.r, "Secondary"));
    await save(s.r);
    eq(json(steps(s.sent).map((x) => x.kind)), json(["wanted-copy", "change-state"]));
    assert(/what you're looking for saved\. This card is part of an active deal/.test(flat(page(s.r))), flat(page(s.r)));
    assert(!/✓/.test(flat(page(s.r))), "a partial save claimed success");
    eq(json(pressed(s.r)), json(["Primary", "Raw", "Lightly Played"]), "the page does not show what is actually saved");
  });
  test("lost contact: said, nothing claimed", async () => {
    const s = await show({ answer: () => "throw" });
    await open(s.r, /Mudkip/);
    await tap(choice(s.r, "Secondary")); await save(s.r);
    assert(/lost contact/.test(flat(page(s.r))) && !/✓/.test(flat(page(s.r))));
  });
});

/* ============================================================== F */
describe("F. removal, only on purpose", () => {
  test("Stop looking needs a confirmation; Keep it sends nothing", async () => {
    const s = await show();
    await open(s.r, /Mudkip/);
    await tap(page(s.r).findAll((n) => n.type === "button" && flat(n) === "Stop looking for this")[0]);
    assert(/Stop looking for Mudkip\?/.test(flat(page(s.r))));
    await tap(page(s.r).findAll((n) => n.type === "button" && flat(n) === "Keep it")[0]);
    eq(s.sent.length, 0);
  });
  test("confirmed: one stop-looking step; the page closes and the bar says so — no ghost warning", async () => {
    const s = await show();
    await open(s.r, /Mudkip/);
    await tap(page(s.r).findAll((n) => n.type === "button" && flat(n) === "Stop looking for this")[0]);
    await tap(page(s.r).findAll((n) => n.type === "button" && flat(n) === "Stop looking")[0]);
    eq(json(steps(s.sent)), json([{ kind: "stop-looking", goalId: "g-mud" }]));
    eq(page(s.r), null);
    const bar = s.r.root.findAll((n) => cls(n).split(" ").includes("mcs-snack-wrap"))[0];
    assert(bar && /Stopped looking for Mudkip\./.test(flat(bar)) && !/changed elsewhere/.test(flat(bar)), bar ? flat(bar) : "no bar");
  });
  test("a refused removal says so and claims nothing; the page stays", async () => {
    const s = await show({ answer: () => ({ ok: false, refused: "goal-locked" }) });
    await open(s.r, /Mudkip/);
    await tap(page(s.r).findAll((n) => n.type === "button" && flat(n) === "Stop looking for this")[0]);
    await tap(page(s.r).findAll((n) => n.type === "button" && flat(n) === "Stop looking")[0]);
    assert(page(s.r), "the page closed after a refusal");
    assert(/Nothing was saved: the goal could not be removed/.test(flat(page(s.r))), flat(page(s.r)));
    assert(!s.r.root.findAll((n) => cls(n).split(" ").includes("mcs-snack-wrap")).some((n) => /Stopped looking/.test(flat(n))), "a refused removal was announced");
  });
  test("a copy: I no longer own this → one forget-copy step on that copy only", async () => {
    const s = await show();
    await open(s.r, /Trade \/ Sell.*Charizard/);
    await tap(page(s.r).findAll((n) => n.type === "button" && flat(n) === "I no longer own this")[0]);
    await tap(page(s.r).findAll((n) => n.type === "button" && flat(n) === "Remove it")[0]);
    eq(json(steps(s.sent)), json([{ kind: "forget-copy", copyId: "k-b" }]));
    eq(s.live.collectorCopies.map((c) => c.id).join(), "k-a", "the other copy went too");
  });
});

/* ============================================================== G */
describe("G. shape", () => {
  test("Escape closes the page", async () => {
    const { r } = await show();
    await open(r, /Mudkip/);
    await TR.act(async () => { fireWin("keydown", { key: "Escape" }); }); await settle();
    eq(page(r), null);
  });
  test("the administrative entry points are gone", async () => {
    const { r } = await show();
    await open(r, /PC.*Charizard/);
    assert(!/Open full card|Goal details|grade, copies, and more/.test(flat(r.root)), flat(r.root));
    assert(!/Open full card|Goal details/.test(read("client/collector/sections/Binder.jsx").replace(/\/\*[\s\S]*?\*\//g, "")), "Binder still renders them");
  });
  test("over the page, the bar rises above its dock; opening a card clears an old warning", async () => {
    const s = await show({ answer: (step) => (step.kind === "how-hard" ? { ok: false, refused: "not-found" } : { ok: true }) });
    await open(s.r, /Mudkip/);
    await tap(choice(s.r, "Secondary")); await save(s.r);
    /* the page vanished? no — still there; make a warning on the screen itself */
    await tap(page(s.r).findAll((n) => cls(n) === "mcs-cd-back")[0]);
    const Shell = load("client/collector/CollectorShell.jsx").default;
    let r2; TR.act(() => { r2 = TR.create(React.createElement(Shell, { state: { ...STATE(), collectors: [{ id: ME, name: "C" }] }, onSignOut() {} })); });
    const css = r2.root.findAll((n) => n.type === "style").map((n) => n.children.join("")).join("\n");
    assert(/\.mcs-snack-wrap\.over-page \{ bottom:calc\(132px/.test(css), "the bar does not rise over a card's page");
    const src = read("client/collector/sections/Binder.jsx");
    assert(/mcs-snack-wrap\$\{detailKey \? " over-page" : ""\}/.test(src), "the bar does not know a page is open");
    assert(/setDetailKey\(key\); setMoving\(false\); setProblem\(null\);/.test(src), "an old warning outlives opening another card");
  });
  test("the client names no command; the allow-list is unchanged", () => {
    const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
    /* P6-F4 B5: + changeCollectingState, founder-approved */ eq(EXPOSED_COMMANDS.length, 30);
    const src = read("client/collector/CardEdit.jsx");
    for (const c of EXPOSED_COMMANDS) assert(!new RegExp(`["']${c}["']`).test(src), `CardEdit names ${c}`);
  });
});

run();
