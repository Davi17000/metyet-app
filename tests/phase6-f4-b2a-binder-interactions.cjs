/* ============================================================================
   PHASE 6 P6-F4 BATCH 2A — THE FOUR STATES' LOOK, AND MOVING A CARD
     A. one visual language   the four states' colours, icons, messages; the
                              Primary icon is a SQUARE reticle; neutral stays
                              neutral; every surface reads the one mapping
     B. Move                  one obvious Move in the card sheet; its chooser
                              is the press-and-hold destinations; opening it
                              writes nothing; one fileObject; Undo
     C. + New binder          createBinder, then fileObject into what it
                              returned; refusals; a failed move after a made
                              binder; Try moving again (never a second
                              create); a lost answer is looked up, not resent
     D. boundaries            no Goal/copy conversion; filing creates nothing
   Real-browser journeys: harness/phase6-filing-browser.cjs.
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const React = require("react");
const TR = require("react-test-renderer");

/* a window to listen on (the renderer has no DOM) */
const winL = {}; const docL = {};
const on = (map) => (t, f) => { (map[t] = map[t] || []).push(f); };
const off = (map) => (t, f) => { map[t] = (map[t] || []).filter((x) => x !== f); };
let pointedAt = null;
global.window = global.window || {};
Object.assign(global.window, { addEventListener: on(winL), removeEventListener: off(winL) });
global.document = global.document || {};
Object.assign(global.document, { hidden: false, addEventListener: on(docL), removeEventListener: off(docL),
  elementFromPoint: () => (pointedAt ? { closest: () => ({ getAttribute: (k) => (k === "data-dest" ? pointedAt : null) }) } : null) });
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
const STATES = load("client/collector/states.jsx");
const Binder = load("client/collector/sections/Binder.jsx").default;
const CardDetail = load("client/collector/CardDetail.jsx").default;
const json = (v) => JSON.stringify(v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const settle = async () => { for (let i = 0; i < 8; i += 1) await TR.act(async () => { await sleep(0); }); };
const textOf = (n) => (typeof n === "string" ? n : !n || !n.children ? "" : n.children.map(textOf).join(" "));
const flat = (n) => textOf(n).replace(/\s+/g, " ").trim();
const cls = (n) => String((n.props && n.props.className) || "");

/* ------------------------------------------------------------- a world */
const ME = "c1";
const CARDS = {
  "cc-char": { canonicalCardId: "cc-char", cardName: "Charizard", expansionName: "Base Set", collectorNumber: "4", finish: "holofoil" },
  "cc-mud": { canonicalCardId: "cc-mud", cardName: "Mudkip", expansionName: "Ruby & Sapphire", collectorNumber: "60", finish: "non_holo" },
  "cc-blas": { canonicalCardId: "cc-blas", cardName: "Blastoise", expansionName: "Base Set", collectorNumber: "2", finish: "holofoil" },
  "cc-ven": { canonicalCardId: "cc-ven", cardName: "Venusaur", expansionName: "Base Set", collectorNumber: "15", finish: "holofoil" },
};
const STATE = () => ({
  actor: { seat: "collector", collectorId: ME },
  binders: [
    { id: "b-gen1", collectorId: ME, name: "Gen 1", createdAt: "2030-01-03", archivedAt: null },
    { id: "b-mud", collectorId: ME, name: "Mudkips", createdAt: "2030-01-02", archivedAt: null },
    { id: "b-old", collectorId: ME, name: "Old", createdAt: "2030-01-01", archivedAt: "2030-01-04" }],
  goals: [
    { id: "g-char", collectorId: ME, canonicalCardId: "cc-char", tier: "primary", desired: { grade: "PSA 9" }, createdAt: "2030-01-05" },
    { id: "g-ven", collectorId: ME, canonicalCardId: "cc-ven", tier: "secondary", desired: { grade: "PSA 8" }, createdAt: "2030-01-04" }],
  collectorCopies: [
    { id: "k-mud", collectorId: ME, canonicalCardId: "cc-mud", grading: { state: "graded", label: "PSA 10" }, offered: true, status: "available", addedAt: "2030-01-06" },
    { id: "k-blas", collectorId: ME, canonicalCardId: "cc-blas", grading: { state: "raw", label: "Raw · Near Mint" }, keeping: true, offered: false, status: "available", addedAt: "2030-01-07" },
    { id: "k-own", collectorId: ME, canonicalCardId: "cc-blas", grading: { state: "raw", label: "Raw · Damaged" }, status: "available", addedAt: "2030-01-08" }],
  binderMemberships: [{ id: "m1", binderId: "b-gen1", goalId: "g-char" }],
  binderEntries: [],
  catalog: [], partners: [], relationships: [], inventory: [], opportunities: [], discoveries: [],
});

/* The projection is held by a parent, as the real store holds it. `server`
   decides each command's answer; a command the server ACCEPTED changes the
   projection — even when its answer is lost (`lose`), which is exactly the
   case a re-read has to find. */
async function show({ server = () => ({ ok: true }) } = {}) {
  const sent = []; let refreshed = 0; let setLive = null; let live = STATE(); let truth = live; let made = 0;
  const accept = (name, args) => {
    if (name === "createBinder") {
      made += 1; const id = `b-new${made}`;
      truth = { ...truth, binders: [...truth.binders, { id, collectorId: ME, name: args[0], createdAt: `2030-02-0${made}`, archivedAt: null }] };
      return id;
    }
    if (name === "fileObject" || name === "unfileObject") {
      const w = args[0]; const key = w.goalId ? "goalId" : "collectorCopyId";
      const rest = truth.binderMemberships.filter((m) => m[key] !== w[key]);
      truth = { ...truth, binderMemberships: name === "fileObject" ? [...rest, { id: `m${rest.length + 9}`, binderId: w.binderId, [key]: w[key] }] : rest };
    }
    return null;
  };
  const rec = (name) => async (...args) => {
    sent.push([name, ...args]);
    await sleep(0);
    const verdict = server(name, args, sent) || { ok: true };
    if (verdict.ok === false) return verdict;
    const value = accept(name, args);
    if (verdict.lose) throw new Error("connection lost");    // accepted, answer never arrives
    live = truth; if (setLive) setLive(live);
    return { ok: true, value };
  };
  function Live() {
    const [state, set] = React.useState(live);
    setLive = set;
    return React.createElement(Binder, { state,
      onBrowseCards: { describe: async (ids) => ({ cards: ids.map((id) => CARDS[id]).filter(Boolean) }) },
      onSpecify: async (step) => { sent.push(["step", step]); return { ok: true }; },
      onFileObject: rec("fileObject"), onUnfileObject: rec("unfileObject"),
      onCreateBinder: rec("createBinder"), onRenameBinder: rec("renameBinder"), onArchiveBinder: rec("setBinderArchived"),
      onRefresh: async () => { refreshed += 1; live = truth; if (setLive) setLive(live); } });
  }
  let r;
  await TR.act(async () => { r = TR.create(React.createElement(Live)); });
  await settle();
  return { r, sent, get refreshed() { return refreshed; }, get truth() { return truth; } };
}
const yourCards = (r) => r.root.findAll((n) => n.type === "section" && n.props["aria-label"] === "Your Cards")[0];
const tiles = (r) => yourCards(r).findAll((n) => n.type === "li" && cls(n).includes("mcs-otile"));
const tileFor = (r, re) => tiles(r).find((li) => re.test(flat(li)));
const buttons = (r) => r.root.findAll((n) => n.type === "button");
const btn = (r, re) => buttons(r).find((b) => re.test(flat(b))) || null;
const press = async (b) => { assert(b, "no such control"); await TR.act(async () => { b.props.onClick({ preventDefault() {} }); }); await settle(); };
const sheet = (r) => r.root.findAll((n) => n.props && n.props.role === "dialog" && /^(Card|Your (Goal|copy)): /.test(String(n.props["aria-label"] || "")))[0] || null;
const chooser = (r) => r.root.findAll((n) => n.props && n.props.role === "dialog" && n.props["aria-label"] === "Where should this go?" && cls(n).includes("mcs-choose"))[0] || null;
const prompt = (r) => r.root.findAll((n) => n.props && n.props.role === "dialog" && n.props["aria-label"] === "New binder")[0] || null;
const dest = (r, id) => chooser(r).findAll((n) => n.type === "button" && n.props["data-dest"] === id)[0];
const openCard = async (r, re) => { await press(tileFor(r, re).findAll((n) => n.type === "button")[0]); assert(sheet(r), "no sheet"); };
const typeName = async (r, v) => {
  const input = prompt(r).findAll((n) => n.type === "input")[0];
  await TR.act(async () => { input.props.onChange({ target: { value: v } }); });
};
const writes = (sent) => sent.filter(([k]) => k !== "step").map(([k]) => k);
const snackText = (r) => { const s = r.root.findAll((n) => cls(n).split(" ").includes("mcs-snack-wrap"))[0]; return s ? flat(s) : ""; };
const openCovers = (r) => r.root.findAll((n) => n.props && n.props["data-binder"] && cls(n).split(" ").includes("open")).map((n) => n.props["data-binder"]);

/* ============================================================== A */
describe("A. one visual language for the four states", () => {
  test("the founder's mapping, exactly", () => {
    const S = STATES.STATE_STYLE;
    eq(json(Object.keys(S)), json(["primary", "secondary", "pc", "trade"]));
    eq(json(Object.values(S).map((s) => [s.label, s.color, s.message])), json([
      ["Primary", "#21865A", "Actively hunting"], ["Secondary", "#3C75CA", "Interested"],
      ["PC", "#8655B9", "A keeper"], ["Trade / Sell", "#CB792E", "Available for trade or sale"]]));
  });
  test("labels read at 4.5:1 or better on their own tint (the orange itself does not)", () => {
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    const L = (h) => { const c = rgb(h); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const cr = (a, b) => { const x = L(a); const y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    for (const s of Object.values(STATES.STATE_STYLE)) assert(cr(s.ink, s.tint) >= 4.5, `${s.label} label is ${cr(s.ink, s.tint).toFixed(2)}:1`);
    assert(cr("#CB792E", "#FFFFFF") < 4.5, "the reason the ink exists");
  });
  test("the Primary icon is a SQUARE reticle: four open corners, a centre crosshair, a small dot — never a circle", () => {
    let r; TR.act(() => { r = TR.create(React.createElement(STATES.StateIcon, { kind: "primary" })); });
    const svg = r.root.findByType("svg");
    eq(svg.props.strokeLinecap, "round");
    eq(svg.props.viewBox, "0 0 16 16");
    eq(r.root.findAll((n) => n.type === "circle" || n.type === "ellipse").length, 0, "a circular target");
    const d = r.root.findAllByType("path").map((p) => p.props.d);
    const corners = d.filter((x) => /^M[\d.]+ [\d.]+[VH][\d.]+[hv]-?[\d.]+$/.test(x));
    eq(corners.length, 4, "four open square corners: " + json(d));
    /* each corner starts on the frame's edge and is one vertical and one horizontal leg of equal length — an OPEN corner */
    for (const c of corners) {
      const [x, y] = c.match(/^M([\d.]+) ([\d.]+)/).slice(1).map(Number);
      assert([2, 14].includes(x) || [2, 14].includes(y), "a corner does not start on the frame's edge: " + c);
      const legs = c.match(/[VHvh]-?[\d.]+/g);
      eq(legs.length, 2, "a corner is not two legs: " + c);
      assert(/^[VH]/.test(legs[0]) && /^[hv]/.test(legs[1]) && legs[0][0].toLowerCase() !== legs[1][0], "a corner is not square: " + c);
    }
    const cross = d.filter((x) => /^M8 [\d.]+v2$|^M[\d.]+ 8h2$/.test(x));
    eq(cross.length, 4, "four short centre crosshair strokes: " + json(d));
    const dot = r.root.findAll((n) => n.props && n.props["data-part"] === "dot")[0];
    assert(dot && dot.props.fill === "currentColor" && Number(dot.props.width) <= 2, "no small centre dot");
    assert(/\.mcs-st-primary[^{]*\{ --st:#21865A;/.test(STATES.STATE_CSS), "Primary is not green");
  });
  test("the other three: eye, gem, exchange arrows", () => {
    const parts = (s) => { let r; TR.act(() => { r = TR.create(React.createElement(STATES.StateIcon, { kind: s })); }); return r; };
    assert(parts("secondary").root.findAllByType("circle").length === 1, "the eye has no pupil");
    assert(parts("pc").root.findAllByType("path").some((p) => /13\.5/.test(p.props.d)), "no gem point");
    const arrows = parts("trade").root.findAllByType("path").map((p) => p.props.d);
    assert(arrows.includes("M2.5 5.5h10") && arrows.includes("M13.5 10.5h-10"), "not two opposed arrows: " + json(arrows));
  });
  test("a neutral state stays neutral: Owned wears no icon and no colour", () => {
    let r; TR.act(() => { r = TR.create(React.createElement(STATES.StateChip, { kind: "owned", label: "Owned" })); });
    eq(r.root.findAllByType("svg").length, 0);
    assert(!cls(r.root.findByType("span")).includes("mcs-st"), "Owned is styled as a state");
    eq(STATES.StateIcon({ kind: "goal" }), null);
  });
  test("Binder tiles and the card sheet wear it", async () => {
    const { r } = await show();
    const chip = (re) => tileFor(r, re).findAll((n) => n.props && n.props["data-collecting"])[0];
    eq(chip(/Charizard/).props["data-collecting"], "primary");
    eq(chip(/Mudkip/).props["data-collecting"], "trade");
    eq(chip(/Raw · Near Mint/).props["data-collecting"], "pc");
    assert(!tileFor(r, /Raw · Damaged/).findAll((n) => n.props && n.props["data-collecting"]).length, "an unsorted copy wears a state");
    assert(tileFor(r, /Charizard/).findAll((n) => n.props && n.props["data-state-icon"] === "primary").length === 1, "no icon on the chip");
    await openCard(r, /Charizard/);
    /* RESTATED (P6-F4 B2B): the saved card's page offers the record's own pair, in the shared language */
    const states = sheet(r).findAll((n) => n.type === "button" && n.props["data-st"]);
    /* (B2B.1: the shared messages, with the founder's Secondary sentence) */
    /* (B4: all four, in the shared language) */
    eq(json(states.map((b) => [b.props["data-st"], flat(b)])), json([["primary", "Primary Actively hunting"],
      ["secondary", "Secondary I'm interested in this card."], ["pc", "PC A keeper"], ["trade", "Trade / Sell Available for trade or sale"]]));
    assert(states.every((b) => b.findAll((n) => n.props && n.props["data-state-icon"] === b.props["data-st"]).length === 1), "a state button has no icon");
  });
  test("Browse markers and the Phase 6 card's choices read the same mapping", () => {
    const disc = read("client/browse/Discover.jsx");
    assert(/<StateChip key=\{t\} kind=\{c\} label=\{t\} \/>/.test(disc), "Browse markers do not use the shared chip");
    const card = read("client/collector/CardDetail.jsx");
    for (const s of ["primary", "secondary", "pc", "trade"]) assert(new RegExp(`<Choice st="${s}"`).test(card), `the card's ${s} choice`);
    /* nothing else in the client spells the colours */
    const files = ["client/collector/CollectorShell.jsx", "client/collector/sections/Binder.jsx", "client/browse/Discover.jsx", "client/collector/CardDetail.jsx"];
    for (const f of files) assert(!/#21865A|#3C75CA|#8655B9|#CB792E/i.test(read(f)), `${f} spells a state colour itself`);
  });
  test("Secondary says interest, without urgency", () => {
    let r;
    TR.act(() => { r = TR.create(React.createElement(CardDetail, { context: { cardName: "Mudkip", cards: [{ canonicalCardId: "k", finish: "non_holo" }] },
      state: {}, onClose() {}, onSave: async () => ({ ok: true }) })); });
    const pick = (t) => TR.act(() => { r.root.findAll((n) => n.type === "button" && flat(n).startsWith(t))[0].props.onClick(); });
    pick("Raw"); pick("Near Mint"); pick("I'm looking for it");
    assert(/Secondary I'm interested in this card\./.test(flat(r.root)), flat(r.root));
    assert(!/right opportunity/.test(read("client/collector/CardDetail.jsx")), "the old sentence survived");
  });
});

/* ============================================================== B */
describe("B. one obvious Move", () => {
  test("the sheet has one Move; opening its chooser writes nothing", async () => {
    const { r, sent } = await show();
    await openCard(r, /Charizard/);
    assert(!btn(r, /^Move to another binder$|^Take out of/), "the old controls are still there");
    await press(btn(r, /^Move$/));
    assert(chooser(r), "no chooser");
    eq(json(chooser(r).findAll((n) => n.type === "button").map((b) => [b.props["data-dest"], flat(b), !!b.props.disabled])), json([
      ["b:b-gen1", "Gen 1 Current binder", true], ["b:b-mud", "Mudkips", false],
      ["unfiled", "Unfiled Take it out of Gen 1", false], ["new", "+ New binder", false], ["cancel", "Cancel Put it back", false]]));
    assert(!/Old/.test(flat(chooser(r))), "a put-away binder was offered");
    eq(writes(sent).length, 0, "opening the chooser wrote something");
    await press(dest(r, "cancel"));
    eq(chooser(r), null); eq(writes(sent).length, 0);
  });
  test("a binder: one fileObject, then the teal note with Undo and the destination opened", async () => {
    const { r, sent } = await show();
    await openCard(r, /Charizard/);
    await press(btn(r, /^Move$/));
    await press(dest(r, "b:b-mud"));
    eq(json(sent), json([["fileObject", { binderId: "b-mud", goalId: "g-char" }]]));
    assert(/Charizard is filed in Mudkips\. Undo/.test(snackText(r)), snackText(r));
    eq(json(openCovers(r)), json(["b-mud"]));
    eq(chooser(r), null, "the chooser stayed open");
    await press(buttons(r).find((b) => cls(b) === "mcs-undo"));
    eq(json(sent[1]), json(["fileObject", { binderId: "b-gen1", goalId: "g-char" }]), "Undo is the same command, backwards");
  });
  test("Unfiled: one unfileObject", async () => {
    const { r, sent } = await show();
    await openCard(r, /Charizard/);
    await press(btn(r, /^Move$/));
    await press(dest(r, "unfiled"));
    eq(json(sent), json([["unfileObject", { goalId: "g-char" }]]));
  });
  test("press and hold still files, and offers the same destinations", async () => {
    const { r, sent } = await show();
    const b = tileFor(r, /Charizard/).findAll((n) => n.type === "button")[0];
    await TR.act(async () => { b.props.onPointerDown({ button: 0, isPrimary: true, pointerId: 1, clientX: 10, clientY: 10, pointerType: "touch" }); });
    await TR.act(async () => { await sleep(500); });
    const layer = r.root.findAll((n) => n.props && n.props["aria-label"] === "Where should this go?")[0];
    eq(json(layer.findAll((n) => n.props && n.props["data-dest"]).map((n) => n.props["data-dest"])), json(["b:b-gen1", "b:b-mud", "unfiled", "new", "cancel"]));
    pointedAt = "b:b-mud";
    await TR.act(async () => { fireWin("pointermove", { pointerId: 1, clientX: 200, clientY: 300 }); });
    await TR.act(async () => { fireWin("pointerup", { pointerId: 1, clientX: 200, clientY: 300 }); });
    pointedAt = null; await settle();
    eq(json(sent), json([["fileObject", { binderId: "b-mud", goalId: "g-char" }]]));
  });
  test("dropping a held card on + New binder asks for the name, and writes nothing yet", async () => {
    const { r, sent } = await show();
    const b = tileFor(r, /Raw · Near Mint/).findAll((n) => n.type === "button")[0];
    await TR.act(async () => { b.props.onPointerDown({ button: 0, isPrimary: true, pointerId: 1, clientX: 10, clientY: 10, pointerType: "touch" }); });
    await TR.act(async () => { await sleep(500); });
    pointedAt = "new";
    await TR.act(async () => { fireWin("pointermove", { pointerId: 1, clientX: 200, clientY: 300 }); });
    await TR.act(async () => { fireWin("pointerup", { pointerId: 1, clientX: 200, clientY: 300 }); });
    pointedAt = null; await settle();
    assert(prompt(r) && /Blastoise will go in it/.test(flat(prompt(r))), "no name prompt");
    eq(writes(sent).length, 0);
  });
});

/* ============================================================== C */
describe("C. + New binder, then the move", () => {
  const startNew = async (r, name = "Keepers") => {
    await openCard(r, /Raw · Near Mint/);
    await press(btn(r, /^Move$/));
    await press(dest(r, "new"));
    assert(prompt(r), "no name prompt");
    await typeName(r, name);
    await press(btn(r, /^Create & move$/));
  };
  test("createBinder, then fileObject into the binder it returned; success only after both", async () => {
    const { r, sent, truth } = await show();
    await startNew(r);
    eq(json(writes(sent)), json(["createBinder", "fileObject"]));
    eq(json(sent[0]), json(["createBinder", "Keepers"]));
    eq(json(sent[1]), json(["fileObject", { binderId: "b-new1", collectorCopyId: "k-blas" }]));
    assert(/Blastoise is filed in Keepers\. Undo/.test(snackText(r)), snackText(r));
    eq(prompt(r), null); eq(chooser(r), null);
    eq(json(openCovers(r)), json(["b-new1"]), "the new binder is not opened");
    assert(/In Keepers/.test(flat(sheet(r))), "the sheet does not follow");
  });
  test("Undo after the confirmed move: back to Unfiled; the new binder stays", async () => {
    const s = await show();
    await startNew(s.r);
    await press(buttons(s.r).find((b) => cls(b) === "mcs-undo"));
    eq(json(s.sent[2]), json(["unfileObject", { collectorCopyId: "k-blas" }]));
    assert(s.truth.binders.some((b) => b.name === "Keepers"), "Undo removed the binder");
  });
  test("a refused createBinder files nothing and says so in the prompt", async () => {
    const { r, sent } = await show({ server: (name) => (name === "createBinder" ? { ok: false, refused: "name-required" } : null) });
    await startNew(r, "Keepers");
    eq(json(writes(sent)), json(["createBinder"]), "it filed after a refused create");
    assert(prompt(r) && /A binder needs a name\./.test(flat(prompt(r))), "the refusal is not said");
    assert(!/filed in/.test(snackText(r)), "success claimed");
  });
  test("the binder is made but the move is refused: kept, said, and Try moving again files — never a second create", async () => {
    let filings = 0;
    const s = await show({ server: (name) => (name === "fileObject" && filings++ === 0 ? { ok: false, refused: "not-found" } : null) });
    await startNew(s.r);
    eq(json(writes(s.sent)), json(["createBinder", "fileObject"]));
    assert(/Made “Keepers”, but Blastoise couldn't be moved into it/.test(snackText(s.r)), snackText(s.r));
    assert(!/is filed in/.test(snackText(s.r)), "success claimed after a refused move");
    assert(s.truth.binders.some((b) => b.id === "b-new1"), "the made binder was lost");
    await press(btn(s.r, /^Try moving again$/));
    eq(json(writes(s.sent)), json(["createBinder", "fileObject", "fileObject"]), "the retry made another binder");
    eq(json(s.sent[2]), json(["fileObject", { binderId: "b-new1", collectorCopyId: "k-blas" }]));
    assert(/Blastoise is filed in Keepers/.test(snackText(s.r)), snackText(s.r));
    eq(s.truth.binders.filter((b) => b.name === "Keepers").length, 1, "two Keepers");
  });
  test("lost answer to createBinder, binder was made: re-read, then move into it — no second create", async () => {
    const s = await show({ server: (name) => (name === "createBinder" ? { ok: true, lose: true } : null) });
    await startNew(s.r);
    assert(s.refreshed >= 1, "the projection was not re-read before deciding");
    eq(json(writes(s.sent)), json(["createBinder", "fileObject"]), "createBinder was resent");
    eq(json(s.sent[1]), json(["fileObject", { binderId: "b-new1", collectorCopyId: "k-blas" }]));
    assert(/Blastoise is filed in Keepers/.test(snackText(s.r)), snackText(s.r));
  });
  test("lost connection, binder NOT made: nothing filed, nothing resent, and it says so", async () => {
    const s = await show({ server: (name) => { if (name === "createBinder") throw new Error("offline"); return null; } });
    await startNew(s.r);
    eq(json(writes(s.sent)), json(["createBinder"]));
    assert(s.refreshed >= 1, "it did not look before deciding");
    assert(/wasn't made\. Nothing was changed/.test(flat(prompt(s.r))), flat(prompt(s.r)));
  });
  test("lost answer to the move into a made binder: re-read; if it landed, it is filed; never a second create", async () => {
    let filings = 0;
    const s = await show({ server: (name) => (name === "fileObject" && filings++ === 0 ? { ok: true, lose: true } : null) });
    await startNew(s.r);
    assert(/Made “Keepers”, but Blastoise couldn't be moved into it/.test(snackText(s.r)), "uncertainty was claimed as success: " + snackText(s.r));
    await press(btn(s.r, /^Try moving again$/));
    eq(json(writes(s.sent)), json(["createBinder", "fileObject"]), "it filed or created again although the move had landed");
    assert(/Blastoise is filed in Keepers/.test(snackText(s.r)), snackText(s.r));
  });
  test("one at a time: a second Create while the first is out sends nothing", async () => {
    let release;
    const s = await show({ server: () => null });
    await openCard(s.r, /Raw · Near Mint/);
    await press(btn(s.r, /^Move$/));
    await press(dest(s.r, "new"));
    await typeName(s.r, "Keepers");
    const create = btn(s.r, /^Create & move$/);
    await TR.act(async () => { create.props.onClick(); create.props.onClick(); });
    await settle();
    eq(writes(s.sent).filter((k) => k === "createBinder").length, 1, "two binders for one tap-tap");
    void release;
  });
});

/* ============================================================== D */
describe("D. boundaries", () => {
  test("moving never changes what a card is: no Goal or copy command, no state step", async () => {
    const { r, sent } = await show();
    await openCard(r, /Charizard/);
    await press(btn(r, /^Move$/));
    await press(dest(r, "new"));
    await typeName(r, "Hunts");
    await press(btn(r, /^Create & move$/));
    for (const [k] of sent) assert(["createBinder", "fileObject"].includes(k), `a ${k} was sent by a move`);
  });
  test("the client names no new command; the allow-list is unchanged", () => {
    const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
    eq(EXPOSED_COMMANDS.length, 29);
    const src = read("client/collector/sections/Binder.jsx").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const c of EXPOSED_COMMANDS) assert(!new RegExp(`["']${c}["']`).test(src), `Binder names ${c}`);
  });
});

run();
