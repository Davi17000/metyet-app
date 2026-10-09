/* ============================================================================
   PHASE 6 P6-3 — PICK A CARD UP AND PUT IT WHERE IT BELONGS
   The Phase 6 press-and-hold filing gesture on the production Binders screen.
   This suite drives the REAL gesture code — the pointer handlers on a tile,
   the 450ms hold, the filing layer's window listeners — through react-test-
   renderer, with a minimal window/document stand-in (the renderer has no DOM).
   A real-browser run of the same gestures against the real server and
   database is harness/phase6-filing-browser.cjs (`npm run ux:filing-browser`, needs Google Chrome).
     A. tap or hold     a tap opens; a hold or a mouse drag picks up; a touch
                        that moves first is a scroll
     B. dropping        file, move, unfile; exactly one command, carrying no
                        state; success only after the server answers
     C. not dropping    every way to put it back writes nothing
     D. when it fails   refusals said; stale state re-read; one at a time
     E. other paths     Details' Binder choice, Undo, List view's Move/Remove
     F. what can move   objects only; history and put-away binders are not
                        destinations
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const path = require("path");
const esbuild = require("esbuild");
const React = require("react");
const TR = require("react-test-renderer");

/* ------------------------------------------------- a window to listen on */
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
const BINDER = load("client/collector/sections/Binder.jsx");
const Binder = BINDER.default;
const json = (v) => JSON.stringify(v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------- a world */
const ME = "c1";
const CARDS = {
  "cc-char": { canonicalCardId: "cc-char", cardName: "Charizard", expansionName: "Base Set", collectorNumber: "4", finish: "holofoil" },
  "cc-mud": { canonicalCardId: "cc-mud", cardName: "Mudkip", expansionName: "Ruby & Sapphire", collectorNumber: "60", finish: "non_holo" },
  "cc-blas": { canonicalCardId: "cc-blas", cardName: "Blastoise", expansionName: "Base Set", collectorNumber: "2", finish: "holofoil" },
};
const STATE = () => ({
  actor: { seat: "collector", collectorId: ME },
  binders: [
    { id: "b-gen1", collectorId: ME, name: "Gen 1", createdAt: "2030-01-03", archivedAt: null },
    { id: "b-mud", collectorId: ME, name: "Mudkips", createdAt: "2030-01-02", archivedAt: null },
    { id: "b-old", collectorId: ME, name: "Old", createdAt: "2030-01-01", archivedAt: "2030-01-04" }],
  goals: [{ id: "g-char", collectorId: ME, canonicalCardId: "cc-char", tier: "primary", desired: { grade: "PSA 9" }, createdAt: "2030-01-05" }],
  collectorCopies: [
    { id: "k-mud", collectorId: ME, canonicalCardId: "cc-mud", grading: { state: "graded", label: "PSA 10" }, offered: true, status: "available", addedAt: "2030-01-06" },
    { id: "k-blas", collectorId: ME, canonicalCardId: "cc-blas", grading: { state: "raw", label: "Raw · Near Mint" }, keeping: true, offered: false, status: "available", addedAt: "2030-01-07" }],
  binderMemberships: [{ id: "m1", binderId: "b-gen1", goalId: "g-char" }],
  binderEntries: [{ binderId: "b-mud", canonicalCardId: "cc-blas", addedAt: "2030-01-01" }],
  catalog: [], partners: [], relationships: [], inventory: [], opportunities: [], discoveries: [],
});
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
/* The projection is held by a parent, as the real store holds it: a filing
   the server accepts comes back as a new projection with the new home. */
const applied = (state, name, what) => {
  const key = what.goalId ? "goalId" : "collectorCopyId";
  const rest = state.binderMemberships.filter((m) => m[key] !== what[key]);
  return { ...state, binderMemberships: name === "fileObject"
    ? [...rest, { id: `m-${rest.length + 9}`, binderId: what.binderId, [key]: what[key] }] : rest };
};
async function show({ answer = null, hold = false } = {}) {
  const sent = []; let refreshed = 0; const gates = [];
  let setLive = null; let live = STATE();
  const rec = (name) => (...args) => {
    sent.push([name, ...args]);
    const settleWith = (res) => {
      if (res && res.ok !== false && (name === "fileObject" || name === "unfileObject")) {
        live = applied(live, name, args[0]); if (setLive) setLive(live);
      }
      return res;
    };
    if (hold) { const d = deferred(); gates.push(d); return d.promise.then(settleWith); }
    return Promise.resolve().then(() => (answer ? answer(name, args) : { ok: true })).then(settleWith);
  };
  function Live() {
    const [state, set] = React.useState(live);
    setLive = set;
    return React.createElement(Binder, { state,
      onBrowseCards: { describe: async (ids) => ({ cards: ids.map((id) => CARDS[id]).filter(Boolean) }) },
      onSpecify: async () => ({ ok: true }), onFileObject: rec("fileObject"), onUnfileObject: rec("unfileObject"),
      onCreateBinder: rec("createBinder"), onRenameBinder: rec("renameBinder"), onArchiveBinder: rec("setBinderArchived"),
      onRefresh: async () => { refreshed += 1; } });
  }
  let r;
  await TR.act(async () => { r = TR.create(React.createElement(Live)); });
  await settle();
  return { r, sent, gates, get refreshed() { return refreshed; } };
}
const settle = async () => { for (let i = 0; i < 6; i += 1) await TR.act(async () => { await sleep(0); }); };
const textOf = (n) => (typeof n === "string" ? n : !n || !n.children ? "" : n.children.map(textOf).join(" "));
const flat = (n) => textOf(n).replace(/\s+/g, " ").trim();
const cls = (n) => String((n.props && n.props.className) || "");
const yourCards = (r) => r.root.findAll((n) => n.type === "section" && n.props["aria-label"] === "Your Cards")[0];
/* A tile, found by its STATE and its card — read state first so the
   matchers do not depend on the caption's layout (P6-3.1 put the name first). */
const caption = (n) => {
  const mk = n.findAll((m) => cls(m).includes("mcs-mk"))[0];
  return `${mk ? flat(mk) : ""} ${flat(n.findAll((m) => cls(m).includes("mcs-ometa"))[0])}`;
};
const tileFor = (r, re, root = yourCards(r)) => root.findAll((n) => n.type === "li" && cls(n).includes("mcs-otile"))
  .find((n) => re.test(caption(n)));
const art = (tile) => tile.findAll((n) => n.type === "button" && cls(n).includes("mcs-otap"))[0];
const layer = (r) => r.root.findAll((n) => n.props && n.props["aria-label"] === "Where should this go?")[0] || null;
const down = async (btn, type = "touch", x = 10, y = 10) => {
  await TR.act(async () => { btn.props.onPointerDown({ button: 0, isPrimary: true, pointerId: 1, clientX: x, clientY: y, pointerType: type }); });
};
const moveTile = async (btn, x, y) => { await TR.act(async () => { btn.props.onPointerMove({ pointerId: 1, clientX: x, clientY: y }); }); };
const upTile = async (btn) => { await TR.act(async () => { btn.props.onPointerUp({ pointerId: 1 }); }); };
/* Carry the lifted card over a destination and let go. */
const carryTo = async (dest) => {
  pointedAt = dest;
  await TR.act(async () => { fireWin("pointermove", { pointerId: 1, clientX: 200, clientY: 300 }); });
  await TR.act(async () => { fireWin("pointerup", { pointerId: 1, clientX: 200, clientY: 300 }); });
  pointedAt = null;
  await settle();
};
const pickUp = async (r, re) => {
  const b = art(tileFor(r, re));
  await down(b, "touch"); await TR.act(async () => { await sleep(500); });
  assert(layer(r), "the hold did not pick the card up");
  return b;
};
const button = (r, re) => r.root.findAll((n) => n.type === "button").find((b) => re.test(flat(b))) || null;

/* ============================================================== A */
describe("A. a tap opens; a hold files", () => {
  test("a tap opens the card and sends nothing", async () => {
    const { r, sent } = await show();
    const b = art(tileFor(r, /Primary.*Charizard/));
    await down(b, "touch"); await upTile(b);
    await TR.act(async () => { b.props.onClick({ preventDefault() {} }); }); await settle();
    assert(/Are you looking for it/.test(flat(r.root)), "the tap did not open the card");
    eq(layer(r), null, "a tap started filing");
    eq(sent.length, 0);
  });
  test("a hold of 450ms picks the card up and says where it is now", async () => {
    const { r } = await show();
    const b = art(tileFor(r, /Primary.*Charizard/));
    await down(b, "touch");
    await TR.act(async () => { await sleep(300); });
    eq(layer(r), null, "it picked up early");
    await TR.act(async () => { await sleep(250); });
    assert(layer(r), "the hold did not pick it up");
    assert(/Charizard · Primary · now in Gen 1/.test(flat(layer(r))), flat(layer(r)));
    /* and the click the platform sends after a hold does not open the card */
    await TR.act(async () => { b.props.onClick({ preventDefault() {} }); });
    assert(!/Are you looking for it/.test(flat(r.root)), "the hold's trailing click opened the card");
  });
  test("a touch that moves before the hold is a scroll: nothing is picked up", async () => {
    const { r } = await show();
    const b = art(tileFor(r, /Primary.*Charizard/));
    await down(b, "touch", 10, 10); await moveTile(b, 10, 40);
    await TR.act(async () => { await sleep(500); });
    eq(layer(r), null, "scrolling picked a card up");
  });
  test("a mouse press that drags picks up at once — the desktop way", async () => {
    const { r } = await show();
    const b = art(tileFor(r, /Primary.*Charizard/));
    await down(b, "mouse", 10, 10); await moveTile(b, 30, 10);
    assert(layer(r), "a mouse drag did not pick the card up");
  });
  test("the lifted tile is marked; the destinations are the active binders, Unfiled, and Cancel", async () => {
    const { r } = await show();
    await pickUp(r, /Primary.*Charizard/);
    assert(cls(tileFor(r, /Primary.*Charizard/)).includes("lifted"), "the tile was not marked lifted");
    const dests = layer(r).findAll((n) => n.props && n.props["data-dest"]).map((n) => [n.props["data-dest"], flat(n), n.props["aria-disabled"] || ""]);
    eq(json(dests), json([["b:b-gen1", "Gen 1 Current binder", "true"], ["b:b-mud", "Mudkips", ""],
      ["unfiled", "Unfiled Take it out of Gen 1", ""], ["cancel", "Cancel Put it back", ""]]), "destinations");
  });
});

/* ============================================================== B */
describe("B. dropping on a destination", () => {
  test("moving between binders: one fileObject, naming only the thing and the binder", async () => {
    const { r, sent } = await show();
    await pickUp(r, /Primary.*Charizard/);
    await carryTo("b:b-mud");
    eq(json(sent), json([["fileObject", { binderId: "b-mud", goalId: "g-char" }]]), "exactly one command, no state");
    assert(/Charizard is filed in Mudkips/.test(flat(r.root)), "no confirmation");
  });
  test("filing an Unfiled copy", async () => {
    const { r, sent } = await show();
    await pickUp(r, /PC.*Blastoise/);
    await carryTo("b:b-gen1");
    eq(json(sent), json([["fileObject", { binderId: "b-gen1", collectorCopyId: "k-blas" }]]));
  });
  test("taking one out of its binder: unfileObject", async () => {
    const { r, sent } = await show();
    await pickUp(r, /Primary.*Charizard/);
    await carryTo("unfiled");
    eq(json(sent), json([["unfileObject", { goalId: "g-char" }]]));
    assert(/Charizard is Unfiled now/.test(flat(r.root)));
  });
  test("success is said only when the server has answered", async () => {
    const s = await show({ hold: true });
    await pickUp(s.r, /Primary.*Charizard/);
    await carryTo("b:b-mud");
    assert(/Filing…/.test(flat(s.r.root)), "no pending state while the command is out");
    assert(!/is filed in/.test(flat(s.r.root)), "success shown before the server answered");
    await TR.act(async () => { s.gates[0].resolve({ ok: true }); }); await settle();
    assert(/Charizard is filed in Mudkips/.test(flat(s.r.root)), "no confirmation after the answer");
  });
  test("dropping on the current binder does nothing", async () => {
    const { r, sent } = await show();
    await pickUp(r, /Primary.*Charizard/);
    await carryTo("b:b-gen1");
    eq(sent.length, 0, "a no-op was sent");
  });
});

/* ============================================================== C */
describe("C. putting it back writes nothing", () => {
  for (const [label, act] of [
    ["releasing without carrying it anywhere", async () => { await TR.act(async () => { fireWin("pointerup", { pointerId: 1, clientX: 10, clientY: 10 }); }); }],
    ["carrying it to Cancel", async () => carryTo("cancel")],
    ["releasing over nothing", async () => carryTo(null)],
    ["Escape", async () => { await TR.act(async () => { fireWin("keydown", { key: "Escape", stopPropagation() {} }); }); }],
    ["the pointer being cancelled", async () => { await TR.act(async () => { fireWin("pointercancel", { pointerId: 1 }); }); }],
    ["the window losing focus", async () => { await TR.act(async () => { fireWin("blur", {}); }); }],
  ]) {
    test(label, async () => {
      const { r, sent } = await show();
      await pickUp(r, /Primary.*Charizard/);
      await act(); await settle();
      eq(layer(r), null, "the layer stayed");
      eq(sent.length, 0, "something was written");
      assert(!cls(tileFor(r, /Primary.*Charizard/)).includes("lifted"), "the card was not put back");
    });
  }
});

/* ============================================================== D */
describe("D. when it does not work", () => {
  test("a refusal is said, nothing is claimed, and a stale screen is re-read", async () => {
    const s = await show({ answer: () => ({ ok: false, refused: "binder-archived" }) });
    await pickUp(s.r, /Primary.*Charizard/);
    await carryTo("b:b-mud");
    assert(/That binder has been put away/.test(flat(s.r.root)), flat(s.r.root));
    assert(!/is filed in/.test(flat(s.r.root)), "success claimed after a refusal");
    eq(s.refreshed, 1, "the screen was not re-read");
  });
  test("a card or binder that vanished: said, and re-read", async () => {
    const s = await show({ answer: () => ({ ok: false, refused: "not-found" }) });
    await pickUp(s.r, /PC.*Blastoise/);
    await carryTo("b:b-gen1");
    assert(/has changed since this screen was drawn/.test(flat(s.r.root)));
    eq(s.refreshed, 1);
  });
  test("lost contact: said honestly, and re-read", async () => {
    const s = await show({ answer: () => { throw new Error("offline"); } });
    await pickUp(s.r, /PC.*Blastoise/);
    await carryTo("b:b-gen1");
    assert(/can't tell whether that was filed/.test(flat(s.r.root)));
    eq(s.refreshed, 1);
  });
  test("one at a time: nothing else is filed while a filing is out", async () => {
    const s = await show({ hold: true });
    await pickUp(s.r, /Primary.*Charizard/);
    await carryTo("b:b-mud");
    /* a second gesture, and the keyboard path, while the first is out */
    const b = art(tileFor(s.r, /PC.*Blastoise/));
    await down(b, "touch"); await TR.act(async () => { await sleep(500); });
    eq(layer(s.r), null, "a second card was picked up mid-filing");
    eq(s.sent.length, 1, "a second command was sent");
    await TR.act(async () => { s.gates[0].resolve({ ok: true }); }); await settle();
  });
});

/* ============================================================== E */
describe("D2. one at a time, by every route", () => {
  test("two filings in the same instant send one command", async () => {
    const s = await show({ hold: true });
    const t = tileFor(s.r, /PC.*Blastoise/);
    const details = t.findAll((n) => n.type === "button" && /^Details$/.test(flat(n)))[0];
    await TR.act(async () => { details.props.onClick(); }); await settle();
    const pick = s.r.root.findAll((n) => n.type === "select" && n.props["aria-label"] === "Binder for Blastoise")[0];
    await TR.act(async () => { pick.props.onChange({ target: { value: "b-mud" } }); pick.props.onChange({ target: { value: "b-gen1" } }); });
    eq(s.sent.length, 1, "two commands left for one card at once");
    await TR.act(async () => { s.gates[0].resolve({ ok: true }); }); await settle();
  });
});

describe("E. the paths that need no gesture", () => {
  test("Details: the Binder choice files and unfiles, by keyboard", async () => {
    const { r, sent } = await show();
    const t = tileFor(r, /PC.*Blastoise/);
    const details = t.findAll((n) => n.type === "button" && /^Details$/.test(flat(n)))[0];
    await TR.act(async () => { details.props.onClick(); }); await settle();
    const pick = r.root.findAll((n) => n.type === "select" && n.props["aria-label"] === "Binder for Blastoise")[0];
    assert(pick, "no Binder choice in Details");
    eq(pick.props["aria-label"], "Binder for Blastoise");
    eq(json(pick.findAll((n) => n.type === "option").map((o) => flat(o))), json(["Unfiled", "Gen 1", "Mudkips"]), "active binders only");
    await TR.act(async () => { pick.props.onChange({ target: { value: "b-mud" } }); }); await settle();
    eq(json(sent), json([["fileObject", { binderId: "b-mud", collectorCopyId: "k-blas" }]]));
  });
  test("while a Details sheet is open, a hold behind it picks nothing up (P6-3.1)", async () => {
    const { r, sent } = await show();
    const t = tileFor(r, /PC.*Blastoise/);
    await TR.act(async () => { t.findAll((n) => n.type === "button" && /^Details$/.test(flat(n)))[0].props.onClick(); });
    await settle();
    const b = art(tileFor(r, /Primary.*Charizard/));
    await down(b, "touch"); await TR.act(async () => { await sleep(500); });
    eq(layer(r), null, "a card was lifted from behind an open sheet");
    await upTile(b);
    eq(sent.length, 0);
  });
  test("Undo puts it back where it was, with the same commands", async () => {
    const { r, sent } = await show();
    await pickUp(r, /Primary.*Charizard/);
    await carryTo("b:b-mud");
    const u = button(r, /^Undo$/);
    assert(u, "no Undo offered");
    await TR.act(async () => { u.props.onClick(); }); await settle();
    eq(json(sent[1]), json(["fileObject", { binderId: "b-gen1", goalId: "g-char" }]), "undo is a filing back");
    assert(/Put back: Charizard is in Gen 1 again/.test(flat(r.root)));
    assert(!button(r, /^Undo$/), "an undo of an undo was offered");
  });
  test("no Undo is promised into a binder that cannot take it back", async () => {
    const s = STATE();
    s.binderMemberships = [{ id: "m9", binderId: "b-old", collectorCopyId: "k-mud" }];
    const sent = [];
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(Binder, { state: s,
        onBrowseCards: { describe: async (ids) => ({ cards: ids.map((id) => CARDS[id]).filter(Boolean) }) },
        onFileObject: async (w) => { sent.push(w); return { ok: true }; }, onUnfileObject: async (w) => { sent.push(w); return { ok: true }; } }));
    });
    await settle();
    await pickUp(r, /Trade \/ Sell.*Mudkip/);
    await carryTo("b:b-gen1");
    eq(sent.length, 1);
    assert(!button(r, /^Undo$/), "an undo into a put-away binder was promised");
  });
  test("an expanded binder: its cards at once, and Move & Remove from its menu", async () => {
    /* RESTATED (P6-3.1): no second screen — a binder opens in place, and the
       list with Move and Remove is one item in its "•••" menu. */
    const { r } = await show();
    const sec = r.root.findAll((n) => cls(n).includes("mcs-sechead") && /^Binders/.test(flat(n)))[0];
    await TR.act(async () => { sec.props.onClick(); }); await settle();
    const row = r.root.findAll((n) => n.type === "button" && cls(n).includes("mcs-bhead") && /^Gen 1/.test(flat(n)))[0];
    await TR.act(async () => { row.props.onClick(); }); await settle();
    const binders = r.root.findAll((n) => n.type === "section" && n.props["aria-label"] === "Your binders")[0];
    eq(binders.findAll((n) => n.type === "li" && cls(n).includes("mcs-otile")).length, 1, "its card is not there at once");
    assert(!button(r, /^Open Gen 1/), "a second step to open it survived");
    const more = r.root.findAll((n) => n.type === "button" && n.props["aria-label"] === "Manage Gen 1")[0];
    await TR.act(async () => { more.props.onClick(); }); await settle();
    await TR.act(async () => { button(r, /^Move & remove \(list\)$/).props.onClick(); }); await settle();
    assert(button(r, /^Remove from Binder$/), "Remove lost");
  });
});

/* ============================================================== F */
describe("F. what can be picked up, and where it can go", () => {
  test("an earlier filing is history: it cannot be picked up", async () => {
    const { r } = await show();
    const sec = r.root.findAll((n) => cls(n).includes("mcs-sechead") && /^Binders/.test(flat(n)))[0];
    await TR.act(async () => { sec.props.onClick(); }); await settle();
    const row = r.root.findAll((n) => n.type === "button" && cls(n).includes("mcs-bhead") && /^Mudkips/.test(flat(n)))[0];
    await TR.act(async () => { row.props.onClick(); }); await settle();
    const binderSection = r.root.findAll((n) => n.type === "section" && n.props["aria-label"] === "Your binders")[0];
    const early = tileFor(r, /Earlier filing/, binderSection);
    assert(early, "no earlier filing shown");
    eq(early.findAll((n) => n.type === "button" && n.props.onPointerDown).length, 0, "history can be picked up");
  });
  test("a put-away binder is never a destination", async () => {
    const { r } = await show();
    await pickUp(r, /PC.*Blastoise/);
    assert(!/\bOld\b/.test(flat(layer(r))), "a put-away binder was offered");
  });
  test("with no callbacks to file with, nothing can be picked up", async () => {
    let r;
    await TR.act(async () => { r = TR.create(React.createElement(Binder, { state: STATE() })); });
    await settle();
    eq(r.root.findAll((n) => n.type === "button" && n.props.onPointerDown).length, 0);
  });
});

run();
