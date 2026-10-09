/* ============================================================================
   PHASE 6 P6-2 — THE BINDERS SCREEN IN THE PHASE 6 SHAPE
   Reference: phase6-prototype-01 @ fca2c61 (iteration 8E). The screen is
   search · state filters · ▸ Binders · ▸ Unfiled · Your Cards, built on the
   production projection and the commands production already exposes.
     A. shape          order, disclosure, one binder open at a time
     B. truth          every tile is one Goal or copy; state read off the row;
                       Unfiled is "no home"; a put-away home is still a home
     C. narrowing      search and state filters act on all three at once
     D. tiles          art, missing art, opening the Card Specification
     E. binders        make, rename, put away, bring back; refusals said
     F. opened binder  its summary, its filters, Move and Remove kept
     G. boundaries     no command named, nothing stored, catalogue asked
                       only for what is on screen
   The full production-path coverage (real server, real commands) lives in
   phase5-c34b-binder, restated for this batch; this suite is the screen's own.
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const React = require("react");
const TR = require("react-test-renderer");

const ROOT = path.join(__dirname, "..");
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
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
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
const json = (v) => JSON.stringify(v);

/* ------------------------------------------------------------- a world */
const ME = "c1";
const CARDS = {
  "cc-char": { canonicalCardId: "cc-char", cardName: "Charizard", expansionName: "Base Set", collectorNumber: "4",
    finish: "holofoil", imageSmall: "https://img.example.invalid/char.png" },
  "cc-mud": { canonicalCardId: "cc-mud", cardName: "Mudkip", expansionName: "Ruby & Sapphire", collectorNumber: "60",
    finish: "non_holo", imageSmall: null },
  "cc-blas": { canonicalCardId: "cc-blas", cardName: "Blastoise", expansionName: "Base Set", collectorNumber: "2",
    finish: "holofoil", imageSmall: null },
  "cc-ven": { canonicalCardId: "cc-ven", cardName: "Venusaur", expansionName: "Base Set", collectorNumber: "15",
    finish: "holofoil", imageSmall: null },
  "cc-old": { canonicalCardId: "cc-old", cardName: "Pikachu", expansionName: "Base Set", collectorNumber: "58",
    finish: "non_holo", imageSmall: null },
};
const AT = "2030-01-0";
const STATE = () => ({
  actor: { seat: "collector", collectorId: ME },
  binders: [
    { id: "b-gen1", collectorId: ME, name: "Gen 1 Favorites", createdAt: "2030-01-03", archivedAt: null },
    { id: "b-mud", collectorId: ME, name: "Mudkip", createdAt: "2030-01-02", archivedAt: null },
    { id: "b-old", collectorId: ME, name: "Old Trades", createdAt: "2030-01-01", archivedAt: "2030-01-04" }],
  goals: [
    { id: "g-char", collectorId: ME, canonicalCardId: "cc-char", tier: "primary", desired: { grade: "PSA 9" }, createdAt: `${AT}5` },
    { id: "g-mud", collectorId: ME, canonicalCardId: "cc-mud", tier: "primary", desired: { grade: "PSA 10" }, createdAt: `${AT}5` },
    { id: "g-ven", collectorId: ME, canonicalCardId: "cc-ven", tier: "secondary", desired: { grade: "PSA 9" }, createdAt: `${AT}5` }],
  collectorCopies: [
    { id: "k-char", collectorId: ME, canonicalCardId: "cc-char", grading: { state: "graded", label: "PSA 8" }, keeping: true, offered: false, status: "available", addedAt: `${AT}6` },
    { id: "k-blas", collectorId: ME, canonicalCardId: "cc-blas", grading: { state: "raw", label: "Raw · Near Mint" }, keeping: true, offered: false, status: "available", addedAt: `${AT}6` },
    { id: "k-pika", collectorId: ME, canonicalCardId: "cc-old", grading: { state: "graded", label: "PSA 7" }, offered: true, status: "committed", addedAt: `${AT}6` },
    { id: "k-ven", collectorId: ME, canonicalCardId: "cc-ven", grading: { state: "graded", label: "PSA 6" }, offered: false, status: "available", cert: "HIST-1", market: 40, addedAt: `${AT}6` }],
  binderMemberships: [
    { id: "m1", binderId: "b-gen1", goalId: "g-char" },
    { id: "m2", binderId: "b-gen1", collectorCopyId: "k-char" },
    { id: "m3", binderId: "b-mud", goalId: "g-mud" },
    { id: "m4", binderId: "b-old", collectorCopyId: "k-pika" }],
  binderEntries: [{ binderId: "b-mud", canonicalCardId: "cc-blas", addedAt: `${AT}1` }],
  catalog: [], partners: [], relationships: [], inventory: [], opportunities: [], discoveries: [],
});

const door = (log) => ({ describe: async (ids) => { log.push([...ids]); return { cards: ids.map((id) => CARDS[id]).filter(Boolean) }; } });
const settle = async () => { for (let i = 0; i < 6; i += 1) await TR.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function show(state = STATE(), props = {}) {
  const asks = []; const sent = [];
  const rec = (name) => async (...args) => { sent.push([name, ...args]); return props.answer ? props.answer(name) : { ok: true }; };
  let r;
  await TR.act(async () => {
    r = TR.create(React.createElement(Binder, { state, onBrowseCards: door(asks),
      onSpecify: async () => ({ ok: true }), onCreateBinder: rec("createBinder"), onRenameBinder: rec("renameBinder"),
      onArchiveBinder: rec("setBinderArchived"), onFileObject: rec("fileObject"), onUnfileObject: rec("unfileObject"),
      onAddCards: rec("addCards"), ...props.extra }));
  });
  await settle();
  return { r, asks, sent };
}
const textOf = (n) => (typeof n === "string" ? n : !n || !n.children ? "" : n.children.map(textOf).join(" "));
const flat = (n) => textOf(n).replace(/\s+/g, " ").trim();
const cls = (n) => String((n.props && n.props.className) || "");
const buttons = (r) => r.root.findAll((n) => n.type === "button");
const btn = (r, re) => buttons(r).find((b) => re.test(flat(b))) || null;
const click = async (b) => { assert(b, "no such control"); await TR.act(async () => { b.props.onClick(); }); await settle(); };
const section = (r, label) => r.root.findAll((n) => n.type === "section" && n.props["aria-label"] === label)[0] || null;
const tiles = (root) => root.findAll((n) => n.type === "li" && cls(n).includes("mcs-otile"));
/* A tile's caption, STATE FIRST, then the rest of its words — without the
   picture's plate, which repeats the card's name when there is no picture.
   RESTATED (P6-3.1): the tile now leads with the card's name, so the state is
   read from its own badge and put first, keeping these matchers about the
   tile's facts rather than their layout. */
const part = (tile, name) => { const n = tile.findAll((m) => cls(m).split(" ").includes(name))[0]; return n ? flat(n) : ""; };
const caption = (tile) => `${part(tile, "mcs-mk")} ${flat(tile.findAll((n) => cls(n).includes("mcs-ometa"))[0])}`.trim();
const tileTexts = (root) => tiles(root).map(caption);
const sechead = (r, re) => buttons(r).find((b) => cls(b).includes("mcs-sechead") && re.test(flat(b)));
const type = async (r, value) => {
  const box = r.root.findAll((n) => n.type === "input" && n.props.type === "search")[0];
  await TR.act(async () => { box.props.onChange({ target: { value } }); }); await settle();
};

/* ============================================================== A */
describe("A. the shape of the screen", () => {
  test("search and filters, then Binders, then Unfiled, then Your Cards — in that order", async () => {
    const { r } = await show();
    const t = flat(r.root);
    const order = ["Search your cards", "All Primary Secondary PC Trade / Sell", "Binders · 2", "Unfiled ·", "Your Cards"]
      .map((x) => (x === "Search your cards" ? (r.root.findAll((n) => n.type === "input")[0] ? 0 : -1) : t.indexOf(x)));
    assert(order.every((i) => i >= 0), `missing a part: ${json(order)} in ${t}`);
    assert(order[1] < order[2] && order[2] < order[3] && order[3] < order[4], "out of order: " + t);
  });
  test("the binders and Unfiled are closed on arrival; Your Cards is open", async () => {
    const { r } = await show();
    eq(sechead(r, /^Binders/).props["aria-expanded"], false, "binders open on arrival");
    eq(sechead(r, /^Unfiled/).props["aria-expanded"], false, "unfiled open on arrival");
    assert(tiles(section(r, "Your Cards")).length > 0, "Your Cards is not showing");
  });
  test("with no binders yet, the section is open, saying what a binder is and offering one", async () => {
    const s = STATE(); s.binders = []; s.binderMemberships = []; s.binderEntries = [];
    const { r } = await show(s);
    eq(sechead(r, /^Binders/).props["aria-expanded"], true);
    assert(/haven.t made a binder yet/.test(flat(section(r, "Your binders"))));
    assert(btn(r, /^\+ New binder$/), "no way to make one");
  });
  test("each binder row: name and count; one opens in place at a time", async () => {
    const { r } = await show();
    await click(sechead(r, /^Binders/));
    const rows = () => buttons(r).filter((b) => cls(b).includes("mcs-bhead"));
    eq(json(rows().map(flat)), json(["Gen 1 Favorites 2 cards", "Mudkip 2 cards"]), "newest first, name and count");
    await click(rows()[0]);
    eq(rows()[0].props["aria-expanded"], true);
    await click(rows()[1]);
    eq(json(rows().map((b) => b.props["aria-expanded"])), json([false, true]), "only one open");
    await click(rows()[1]);
    eq(json(rows().map((b) => b.props["aria-expanded"])), json([false, false]), "and it closes again");
  });
});

/* ============================================================== B */
describe("B. what each tile is", () => {
  test("every Goal and every copy is exactly one tile in Your Cards", async () => {
    const { r } = await show();
    eq(tiles(section(r, "Your Cards")).length, 7, "3 Goals + 4 copies");
  });
  test("state is read straight off the row, never inferred", async () => {
    const { r } = await show();
    const t = tileTexts(section(r, "Your Cards"));
    const one = (re) => t.filter((x) => re.test(x));
    eq(one(/^Primary .*Charizard/).length, 1, "a Goal's tier");
    eq(one(/^PC .*Charizard/).length, 1, "keeping → PC");
    eq(one(/^Trade \/ Sell .*Pikachu/).length, 1, "offered → Trade / Sell");
    eq(one(/^Owned .*Venusaur/).length, 1, "a copy that stated neither is Owned, never PC or Trade / Sell");
  });
  test("Unfiled is exactly the Goals and copies with no home", async () => {
    const { r } = await show();
    assert(/^Unfiled · 3 cards$/.test(flat(sechead(r, /^Unfiled/))), flat(sechead(r, /^Unfiled/)));
    await click(sechead(r, /^Unfiled/));
    const t = tileTexts(section(r, "Unfiled"));
    eq(t.length, 3);
    assert(t.some((x) => /Venusaur/.test(x) && /^Secondary/.test(x)) && t.some((x) => /Blastoise/.test(x))
      && t.some((x) => /^Owned .*Venusaur/.test(x)), json(t));
  });
  test("a thing in a put-away binder keeps its home: not Unfiled, and not hidden", async () => {
    const { r } = await show();
    const t = tileTexts(section(r, "Your Cards"));
    assert(t.some((x) => /Pikachu/.test(x) && /in Old Trades \(put away\)/.test(x)), json(t));
    await click(sechead(r, /^Unfiled/));
    assert(!tileTexts(section(r, "Unfiled")).some((x) => /Pikachu/.test(x)), "a homed copy called Unfiled");
  });
  test("an earlier filing shows inside its binder only, as history", async () => {
    const { r } = await show();
    await click(sechead(r, /^Binders/));
    await click(buttons(r).find((b) => cls(b).includes("mcs-bhead") && /^Mudkip/.test(flat(b))));
    const t = tileTexts(section(r, "Your binders"));
    assert(t.some((x) => /^Earlier filing .*Blastoise/.test(x)), json(t));
    assert(!tileTexts(section(r, "Your Cards")).some((x) => /Earlier filing/.test(x)), "history listed as a card of yours");
  });
  test("the server's status is said on the tile when it is not the ordinary one", async () => {
    const { r } = await show();
    const pika = tileTexts(section(r, "Your Cards")).find((x) => /Pikachu/.test(x));
    assert(/Committed|committed/.test(pika), pika);
  });
});

/* ============================================================== C */
describe("C. search and filters narrow all three at once", () => {
  test("a state filter narrows Your Cards and says what it is showing", async () => {
    const { r } = await show();
    await click(btn(r, /^PC$/));
    const t = tileTexts(section(r, "Your Cards"));
    eq(t.length, 2); assert(t.every((x) => /^PC /.test(x)), json(t));
    assert(/2 PC cards/.test(flat(section(r, "Your Cards"))));
    eq(btn(r, /^PC$/).props["aria-pressed"], true);
  });
  test("closed binders say how many of theirs match; Unfiled says x of N", async () => {
    const { r } = await show();
    await type(r, "charizard");
    await click(sechead(r, /^Binders/));
    const gen1 = buttons(r).find((b) => cls(b).includes("mcs-bhead") && /^Gen 1/.test(flat(b)));
    assert(/2 matches/.test(flat(gen1)), flat(gen1));
    const mud = buttons(r).find((b) => cls(b).includes("mcs-bhead") && /^Mudkip/.test(flat(b)));
    assert(/No matches/.test(flat(mud)), flat(mud));
    assert(/^Unfiled · 0 of 3 cards$/.test(flat(sechead(r, /^Unfiled/))), flat(sechead(r, /^Unfiled/)));
    assert(/2 cards matching “charizard”/.test(flat(section(r, "Your Cards"))));
  });
  test("search and filter compose; clearing restores everything exactly", async () => {
    const { r } = await show();
    await type(r, "base set");
    await click(btn(r, /^Primary$/));
    eq(tileTexts(section(r, "Your Cards")).length, 1, "Primary × Base Set = the Charizard Goal");
    await click(btn(r, /^All$/)); await click(btn(r, /^Clear$/));
    eq(tiles(section(r, "Your Cards")).length, 7);
  });
  test("empty states are the product's own sentences, per state", async () => {
    const s = STATE(); s.collectorCopies = s.collectorCopies.filter((c) => !c.offered);
    const { r } = await show(s);
    await click(btn(r, /^Trade \/ Sell$/));
    assert(/not offering any of your copies right now.*separate choice from owning it/.test(flat(section(r, "Your Cards"))));
    await click(btn(r, /^All$/)); await type(r, "zzz");
    assert(/Nothing of yours matches “zzz”/.test(flat(section(r, "Your Cards"))));
  });
});

/* ============================================================== D */
describe("D. tiles", () => {
  test("art is the catalogue's own picture, or a named plate when there is none", async () => {
    const { r } = await show();
    const srcs = r.root.findAll((n) => n.type === "img").map((n) => n.props.src);
    assert(srcs.length >= 1 && srcs.every((x) => x === "https://img.example.invalid/char.png"), json(srcs));
    assert(/Mudkip/.test(flat(section(r, "Your Cards"))), "a card with no picture lost its name");
  });
  test("identity on every tile: name, number, set, version — then its own grading", async () => {
    /* RESTATED (P6-3.1): the brief's hierarchy — name and number first, then
       state beside its own (or wanted) grade, then set and version quietly —
       each read from its own place on ONE tile. */
    const { r } = await show();
    const t = tiles(section(r, "Your Cards")).map((n) => ({ name: part(n, "mcs-oname"), state: part(n, "mcs-mk"),
      grade: part(n, "mcs-oqual"), sub: part(n, "mcs-oq") }));
    assert(t.some((x) => x.name === "Charizard #4" && x.state === "PC" && x.grade === "PSA 8"
      && /Base Set · holofoil$/.test(x.sub)), json(t));
    assert(t.some((x) => x.name === "Charizard #4" && x.state === "Primary" && x.grade === "PSA 9"
      && /Base Set · holofoil$/.test(x.sub)), "the Goal's wanted grade: " + json(t));
  });
  test("a tile's picture opens the Card Specification", async () => {
    let r;
    const Spec = load("client/collector/CardSpecification.jsx").default;
    ({ r } = await show());
    const tile = tiles(section(r, "Your Cards"))[0];
    await click(tile.findAll((n) => n.type === "button")[0]);
    assert(r.root.findAll((n) => n.type === Spec).length === 1 || /Are you looking for it/.test(flat(r.root)), "the panel did not open");
  });
  test("a copy's Details opens its facts in one sheet, writing nothing", async () => {
    /* RESTATED (P6-3.1): Details is a compact sheet, not facts and a Binder
       control laid out under the tile. */
    const { r, sent } = await show();
    const ven = tiles(section(r, "Your Cards")).find((n) => /^Owned .*Venusaur/.test(caption(n)));
    assert(!/HIST-1/.test(flat(ven)) && !ven.findAll((n) => n.type === "select").length, "facts or a control under the tile");
    await click(ven.findAll((n) => n.type === "button").find((b) => /Details/.test(flat(b))));
    const sheet = r.root.findAll((n) => n.props.role === "dialog" && /^Details: Venusaur/.test(String(n.props["aria-label"] || "")))[0];
    assert(sheet, "no Details sheet");
    const t = flat(sheet);
    assert(/HIST-1/.test(t) && /\$40/.test(t), "the facts did not open: " + t);
    eq(sent.length, 0, "opening facts sent something");
    await click(btn(r, /^Close$/));
    assert(!r.root.findAll((n) => n.props.role === "dialog").length, "Close did not close it");
  });
});

/* ============================================================== E */
describe("E. making and managing binders, through the callbacks handed in", () => {
  test("make: named, sent once, acknowledged", async () => {
    const { r, sent } = await show();
    await click(sechead(r, /^Binders/));
    await click(btn(r, /^\+ New binder$/));
    const box = r.root.findAll((n) => n.type === "input" && n.props["aria-label"] === "New binder name")[0];
    await TR.act(async () => { box.props.onChange({ target: { value: "  Holos " } }); });
    await click(btn(r, /^Make a binder$/));
    eq(json(sent), json([["createBinder", "Holos"]]));
    assert(/Made “Holos”/.test(flat(r.root)), "no acknowledgement");
  });
  test("rename and put away from the binder's menu; bring back from the put-away list", async () => {
    const { r, sent } = await show();
    await click(sechead(r, /^Binders/));
    /* RESTATED (P6-3.1): managed from the expanded binder's own menu. */
    await click(buttons(r).find((b) => cls(b).includes("mcs-bhead") && /^Gen 1/.test(flat(b))));
    assert(!btn(r, /^Open Gen 1 Favorites/), "a second step to open it survived");
    await click(buttons(r).find((b) => /^Manage /.test(String(b.props["aria-label"] || ""))));
    await click(btn(r, /^Rename binder$/));
    const box = r.root.findAll((n) => n.type === "input" && n.props["aria-label"] === "Binder name")[0];
    await TR.act(async () => { box.props.onChange({ target: { value: "Kanto" } }); });
    await click(btn(r, /^Save name$/));
    await click(buttons(r).find((b) => /^Manage /.test(String(b.props["aria-label"] || ""))));
    await click(btn(r, /^Put away$/));
    eq(json(sent), json([["renameBinder", "b-gen1", "Kanto"], ["setBinderArchived", "b-gen1", true]]));
    await click(btn(r, /^Show binders you've put away/));
    await click(buttons(r).find((b) => cls(b).includes("mcs-bhead") && /^Old Trades/.test(flat(b))));
    await click(buttons(r).find((b) => b.props["aria-label"] === "Manage Old Trades"));
    await click(btn(r, /^Bring back$/));
    eq(json(sent[2]), json(["setBinderArchived", "b-old", false]));
  });
  test("a refusal is said, not swallowed; no delete is offered anywhere", async () => {
    const { r } = await show(STATE(), { answer: () => ({ ok: false, refused: "name-required" }) });
    await click(sechead(r, /^Binders/));
    await click(btn(r, /^\+ New binder$/));
    const box = r.root.findAll((n) => n.type === "input" && n.props["aria-label"] === "New binder name")[0];
    await TR.act(async () => { box.props.onChange({ target: { value: "x" } }); });
    await click(btn(r, /^Make a binder$/));
    assert(/A binder needs a name/.test(flat(r.root)), flat(r.root));
    assert(!buttons(r).some((b) => /Delete/i.test(flat(b))), "a delete appeared");
  });
});

/* ============================================================== F */
describe("F. an opened binder", () => {
  /* RESTATED (P6-3.1): opening is expanding, in place; production's rows with
     Move and Remove are its menu's "Move & remove (list)". */
  const openGen1 = async (r) => {
    await click(sechead(r, /^Binders/));
    await click(buttons(r).find((b) => cls(b).includes("mcs-bhead") && /^Gen 1/.test(flat(b))));
  };
  const asList = async (r) => {
    await click(buttons(r).find((b) => /^Manage /.test(String(b.props["aria-label"] || ""))));
    await click(btn(r, /^Move & remove \(list\)$/));
  };
  const gen1 = (r) => r.root.findAll((n) => cls(n).includes("mcs-bcover") && n.props["data-binder"] === "b-gen1")[0];
  test("says what is here in one line, and keeps Move and Remove on each object", async () => {
    const { r } = await show();
    await openGen1(r);
    assert(/2 cards · 1 Primary · 1 PC/.test(flat(r.root)), flat(r.root));
    /* P6-3: tiles by default; the list keeps production's rows. */
    await asList(r);
    assert(r.root.findAll((n) => n.type === "select" && /^Move /.test(String(n.props["aria-label"] || ""))).length === 2, "Move lost");
    assert(buttons(r).filter((b) => /^Remove from Binder$/.test(flat(b))).length === 2, "Remove lost");
  });
  test("its filters narrow its own objects", async () => {
    const { r } = await show();
    await openGen1(r);
    await click(btn(r, /^PC$/));
    eq(json(tileTexts(gen1(r)).map((x) => x.split(" ")[0])), json(["PC"]), "tiles: only the PC copy");
    await asList(r);
    const t = flat(gen1(r));
    assert(/Keeping/.test(t) && !/Looking for/.test(t), "the PC filter kept the Goal: " + t);
    await click(btn(r, /^Trade \/ Sell$/));
    assert(/Nothing in this binder is in that state/.test(flat(r.root)), flat(r.root));
  });
  test("a binder opened in place keeps the screen's search and filter, and says when nothing matches", async () => {
    /* RESTATED (P6-3.1): this used to start a binder unfiltered, because
       opening one was going somewhere else. It now opens where it is, under a
       row that has just said how many of its cards match — so the search and
       filter stay, and the binder shows exactly that. */
    const { r } = await show();
    await type(r, "venusaur"); await click(btn(r, /^Secondary$/));
    await openGen1(r);
    eq(r.root.findAll((n) => n.type === "input" && n.props.type === "search")[0].props.value, "venusaur", "the query was dropped");
    eq(btn(r, /^Secondary$/).props["aria-pressed"], true, "the filter was dropped");
    assert(/Nothing Secondary in Gen 1 Favorites matches “venusaur”/.test(flat(gen1(r))), flat(gen1(r)));
  });
});

/* ============================================================== G */
describe("G. boundaries", () => {
  test("the section names no command and stores nothing", () => {
    const src = code("client/collector/sections/Binder.jsx");
    for (const name of EXPOSED_COMMANDS) assert(!new RegExp(`["']${name}["']`).test(src), `it names ${name}`);
    assert(!/localStorage|sessionStorage|indexedDB/.test(src), "something is stored");
    eq(EXPOSED_COMMANDS.length, 29, "the production door moved");
  });
  test("the catalogue is asked once on arrival, for the tiles on screen only", async () => {
    const { r, asks } = await show();
    eq(asks.length, 1, "one request");
    eq(json([...asks[0]].sort()), json(["cc-char", "cc-mud", "cc-old", "cc-ven", "cc-blas"].filter((id) => id !== "cc-blas").concat(["cc-blas"]).sort()),
      "the Goals' and copies' cards");
    await click(btn(r, /^PC$/)); await click(btn(r, /^All$/));
    eq(asks.length, 1, "filtering re-asked");
  });
  test("earlier filings are asked about when their binder opens, or a search needs them", async () => {
    const s = STATE(); s.binderEntries = [{ binderId: "b-mud", canonicalCardId: "cc-early", addedAt: `${AT}1` }];
    const { r, asks } = await show(s);
    assert(!asks.flat().includes("cc-early"), "asked about a closed binder's history on arrival");
    await type(r, "x");
    assert(asks.flat().includes("cc-early"), "a search could not see a closed binder's history");
  });
});

run();
