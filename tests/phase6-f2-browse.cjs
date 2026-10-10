/* ============================================================================
   PHASE 6 P6-F2 — BROWSE, AS THE PHASE 6 PROTOTYPE DRAWS IT
   The Collector's Browse (client/browse/Discover.jsx, inside
   client/collector/sections/Browse.jsx), driven against a recorded catalogue.
     A. the landing       search · Pokémon / Sets / Artists · the Pokédex by generation
     B. the doorways      a Pokémon, a set, an artist → their cards; back again
     C. composition       constraints are chips that AND; text narrows by name or number
     D. suggestions       refine what is on screen; kinds already chosen are not offered
     E. the grid          exact cards, more as you scroll, the Collector's own marks
     F. states            loading, nothing matches, unreachable + Try again
     G. discovery ≠ collecting   browsing writes nothing; opening is the old card
     H. boundaries        only catalogue reads; CardBrowser (the TP's) untouched
   Real-browser journeys at 360 / 390 / 768 / 1280: harness/phase6-filing-browser.cjs.
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
const BROWSE = load("client/collector/sections/Browse.jsx");
const Browse = BROWSE.default;
const json = (v) => JSON.stringify(v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------- a recorded catalogue */
const SETS = [{ expansionId: "e-sv", name: "Prismatic Evolutions", series: "Scarlet & Violet", releaseDate: "2025-01-17", cardCount: 3 },
  { expansionId: "e-rs", name: "Ruby & Sapphire", series: "EX", releaseDate: "2003-07-18", cardCount: 3 }];
const CTX = [
  { cardContextId: "x1", cardName: "Mudkip", expansionId: "e-rs", expansionName: "Ruby & Sapphire", collectorNumber: "59", artist: "Atsuko Nishida", pokedexNumbers: [258] },
  { cardContextId: "x2", cardName: "Mudkip", expansionId: "e-rs", expansionName: "Ruby & Sapphire", collectorNumber: "60", artist: "Ken Sugimori", pokedexNumbers: [258] },
  { cardContextId: "x3", cardName: "Treecko", expansionId: "e-rs", expansionName: "Ruby & Sapphire", collectorNumber: "74", artist: "Atsuko Nishida", pokedexNumbers: [252] },
  { cardContextId: "x4", cardName: "Eevee", expansionId: "e-sv", expansionName: "Prismatic Evolutions", collectorNumber: "74", artist: "Ken Sugimori", pokedexNumbers: [133] },
  { cardContextId: "x5", cardName: "Pikachu", expansionId: "e-sv", expansionName: "Prismatic Evolutions", collectorNumber: "TG04", artist: "Atsuko Nishida", pokedexNumbers: [25] },
  { cardContextId: "x6", cardName: "Mudkip ex", expansionId: "e-sv", expansionName: "Prismatic Evolutions", collectorNumber: "8", artist: "Ken Sugimori", pokedexNumbers: [258] },
];
const gen = (d) => [151, 251, 386, 493, 649, 721, 809, 905, 1025].findIndex((l) => d <= l) + 1;
function catalogue({ fail = null, slow = null } = {}) {
  const calls = [];
  const page = (all, q) => { const p = Number(q.get("page") || 1); const n = Number(q.get("pageSize") || 24); return { slice: all.slice((p - 1) * n, p * n), total: all.length, page: p }; };
  const gate = async (kind) => { if (slow && slow.has(kind)) await slow.get(kind); if (fail && fail.has(kind)) throw new Error("offline"); };
  const door = {
    find: async (raw) => {
      calls.push(["find", raw]); await gate("find");
      const q = new URLSearchParams(raw);
      const all = CTX.filter((c) => (!q.get("pokedex") || c.pokedexNumbers.includes(Number(q.get("pokedex"))))
        && (!q.get("expansionId") || c.expansionId === q.get("expansionId")) && (!q.get("artist") || c.artist === q.get("artist"))
        && (!q.get("query") || c.cardName.toLowerCase().includes(q.get("query").toLowerCase()))
        && (!q.get("number") || c.collectorNumber.toLowerCase() === q.get("number").toLowerCase()));
      const { slice, total, page: p } = page(all, q);
      return { contexts: slice, total, page: p };
    },
    pokemon: async (raw) => {
      calls.push(["pokemon", raw]); await gate("pokemon");
      const q = new URLSearchParams(raw);
      const dex = [...new Set(CTX.flatMap((c) => c.pokedexNumbers))].sort((a, b) => a - b).map((d) => {
        const cs = CTX.filter((c) => c.pokedexNumbers.includes(d));
        return { pokedexNumber: d, name: cs.map((c) => c.cardName).sort((a, b) => a.length - b.length)[0], generation: gen(d), cardCount: cs.length,
          face: { cardContextId: cs[0].cardContextId, cardName: cs[0].cardName, expansionName: cs[0].expansionName, collectorNumber: cs[0].collectorNumber, imageSmall: null } };
      });
      const shown = dex.filter((p) => (!q.get("generation") || p.generation === Number(q.get("generation"))) && (!q.get("query") || p.name.toLowerCase().includes(q.get("query").toLowerCase())));
      const { slice, total, page: p } = page(shown, q);
      return { pokemon: slice, total, page: p, generations: [...new Set(dex.map((x) => x.generation))].sort() };
    },
    expansions: async (raw) => {
      calls.push(["expansions", raw]); await gate("expansions");
      const q = new URLSearchParams(raw);
      const all = SETS.filter((s) => !q.get("query") || s.name.toLowerCase().includes(q.get("query").toLowerCase()));
      const { slice, total, page: p } = page(all, q); return { expansions: slice, total, page: p };
    },
    artists: async (raw) => {
      calls.push(["artists", raw]); await gate("artists");
      const q = new URLSearchParams(raw);
      const names = [...new Set(CTX.map((c) => c.artist))].sort().filter((a) => !q.get("query") || a.toLowerCase().includes(q.get("query").toLowerCase()));
      const { slice, total, page: p } = page(names.map((a) => ({ artist: a, cardCount: CTX.filter((c) => c.artist === a).length })), q);
      return { artists: slice, total, page: p };
    },
    read: async (id) => { calls.push(["read", id]); const c = CTX.find((x) => x.cardContextId === id); return { ...c, canonicalCards: [{ canonicalCardId: `cc-${id}`, printRun: "unlimited", finish: "holofoil", language: "en" }] }; },
    describe: async (ids) => { calls.push(["describe", ids.join(",")]); return { cards: ids.map((id) => ({ canonicalCardId: id, cardContextId: id.replace(/^cc-/, ""), cardName: "?" })) }; },
  };
  return { door, calls };
}
const STATE = (extra = {}) => ({ actor: { seat: "collector", collectorId: "c1" }, goals: [], collectorCopies: [], binders: [], binderMemberships: [], binderEntries: [], catalog: [], ...extra });

async function show({ state = STATE(), cat = catalogue(), onSpecify = null } = {}) {
  let r; let session = BROWSE.newBrowseSession(); let count = null;
  const specify = [];
  const draw = async () => {
    const el = React.createElement(Browse, { state, session, onSession: (next) => { session = next; draw(); }, onBrowseCards: cat.door,
      onSpecify: onSpecify || (async (...a) => { specify.push(a); return { ok: true }; }), onCount: (n) => { count = n; } });
    await TR.act(async () => { if (r) r.update(el); else r = TR.create(el); });
  };
  await draw(); await settle();
  return { get r() { return r; }, calls: cat.calls, session: () => session, count: () => count, specify, settle };
}
const settle = async () => { for (let i = 0; i < 8; i += 1) await TR.act(async () => { await sleep(0); }); };
const textOf = (n) => (typeof n === "string" ? n : !n || !n.children ? "" : n.children.map(textOf).join(" "));
const flat = (n) => textOf(n).replace(/\s+/g, " ").trim();
const cls = (n) => String((n.props && n.props.className) || "");
const buttons = (r) => r.root.findAll((n) => n.type === "button");
const btn = (r, re) => buttons(r).find((b) => re.test(flat(b))) || null;
const press = async (s, b) => { assert(b, "no such control"); await TR.act(async () => { b.props.onClick(); }); await s.settle(); };
const type = async (s, value) => {
  const input = s.r.root.findAll((n) => n.type === "input" && n.props["aria-label"] === "Search")[0];
  await TR.act(async () => { input.props.onChange({ target: { value } }); }); await s.settle();
  await TR.act(async () => { await sleep(260); }); await s.settle();   // the suggestions' 200ms pause
};
const tiles = (r) => r.root.findAll((n) => n.type === "button" && cls(n) === "mcs-dtile").map((b) => flat(b.findAll((n) => n.type === "b")[0]));
const row = (r, re) => r.root.findAll((n) => n.type === "button" && cls(n) === "mcs-drow").find((b) => re.test(flat(b.findAll((n) => cls(n) === "mcs-drow-t")[0]))) || null;
const cells = (r) => r.root.findAll((n) => n.type === "button" && /^mcs-dcell/.test(cls(n))).map((b) => b.props["aria-label"]);
const chips = (r) => r.root.findAll((n) => n.type === "button" && cls(n) === "mcs-dchip").map((b) => b.props["aria-label"]);
const last = (calls, kind) => calls.filter(([k]) => k === kind).slice(-1)[0];

/* ============================================================== A */
describe("A. the landing", () => {
  test("one search field, Pokémon / Sets / Artists, and the Pokédex open on arrival", async () => {
    const s = await show();
    eq(s.r.root.findAll((n) => n.type === "input" && n.props["aria-label"] === "Search")[0].props.placeholder, "Search Pokémon, sets, artists or cards");
    eq(json(s.r.root.findAll((n) => n.props && n.props.role === "tab" && cls(n.parent) === "mcs-dtabs").map((b) => [flat(b), b.props["aria-selected"]])),
      json([["Pokémon", true], ["Sets", false], ["Artists", false]]));
    eq(json(tiles(s.r)), json(["Pikachu", "Eevee", "Treecko", "Mudkip"]), "Pokédex order, plainest name");
    assert(/2 cards|3 cards/.test(flat(s.r.root)), "no card counts on the tiles");
    eq(json(s.calls.map(([k]) => k)), json(["pokemon"]), "arrival asks one Pokédex page and nothing else");
  });
  test("generation chips come from the catalogue; choosing one asks the server for it", async () => {
    const s = await show();
    eq(json(buttons(s.r).filter((b) => cls(b.parent) === "mcs-dgens").map(flat)), json(["All", "Gen 1", "Gen 3"]));
    await press(s, btn(s.r, /^Gen 3$/));
    assert(/generation=3/.test(last(s.calls, "pokemon")[1]), last(s.calls, "pokemon")[1]);
    eq(json(tiles(s.r)), json(["Treecko", "Mudkip"]));
  });
});

/* ============================================================== B */
describe("B. the doorways, and back", () => {
  test("a Pokémon → its cards, a chip to remove, the count beside the title; removing it is back, asking nothing", async () => {
    const s = await show();
    await press(s, s.r.root.findAll((n) => n.type === "button" && n.props["data-dex"] === 258)[0]);
    assert(/pokedex=258/.test(last(s.calls, "find")[1]));
    eq(json(chips(s.r)), json(["Remove Pokémon: Mudkip"]));
    eq(cells(s.r).length, 3); eq(s.count(), 3, "the title's count");
    const before = s.calls.length;
    await press(s, s.r.root.findAll((n) => n.type === "button" && n.props["aria-label"] === "Remove Pokémon: Mudkip")[0]);
    eq(json(tiles(s.r)), json(["Pikachu", "Eevee", "Treecko", "Mudkip"]));
    eq(s.calls.length, before, "going back asked the server again");
    eq(s.count(), null, "the count stayed after the cards went");
  });
  test("Sets: newest first with their year, series and count; a set → its cards", async () => {
    const s = await show();
    await press(s, btn(s.r, /^Sets$/));
    const rows = s.r.root.findAll((n) => cls(n) === "mcs-drow-t").map(flat);   // the row's words, not its (decorative) fan
    eq(json(rows), json(["Prismatic Evolutions 2025 · Scarlet & Violet · 3 cards", "Ruby & Sapphire 2003 · EX · 3 cards"]));
    assert(s.r.root.findAll((n) => cls(n) === "mcs-dfan").length === 2, "no card fans");
    await press(s, row(s.r, /^Ruby & Sapphire/));
    assert(/expansionId=e-rs/.test(last(s.calls, "find")[1]));
    eq(json(chips(s.r)), json(["Remove Set: Ruby & Sapphire"]));
  });
  test("Artists: alphabetical (interim, register D4); an artist → their cards", async () => {
    const s = await show();
    await press(s, btn(s.r, /^Artists$/));
    eq(json(s.r.root.findAll((n) => cls(n) === "mcs-drow-t").map((t) => flat(t.findAll((n) => n.type === "b")[0]))), json(["Atsuko Nishida", "Ken Sugimori"]));
    await press(s, row(s.r, /^Atsuko Nishida/));
    assert(/artist=Atsuko%20Nishida/.test(last(s.calls, "find")[1]));
    eq(cells(s.r).length, 3);
  });
  test("the tab, generation and constraints survive leaving Browse and coming back (the session is the shell's)", async () => {
    const s = await show();
    await press(s, btn(s.r, /^Gen 3$/));
    await press(s, s.r.root.findAll((n) => n.type === "button" && n.props["data-dex"] === 258)[0]);
    const kept = s.session();
    eq(json([kept.gen, kept.pokemon]), json([3, { dex: 258, name: "Mudkip" }]));
    assert(kept.pages[Object.keys(kept.pages).find((k) => k.startsWith("cards:"))].items.length === 3, "the loaded cards were not kept");
  });
});

/* ============================================================== C */
describe("C. composition", () => {
  test("Pokémon and Set together are an AND; text narrows by name, a number by number", async () => {
    const s = await show();
    await press(s, s.r.root.findAll((n) => n.type === "button" && n.props["data-dex"] === 258)[0]);
    await type(s, "ruby");
    await press(s, s.r.root.findAll((n) => n.type === "button" && /Ruby & Sapphire/.test(flat(n)) && cls(n.parent.parent) === "mcs-dsugg")[0]);
    const q = new URLSearchParams(last(s.calls, "find")[1]);
    eq(json([q.get("pokedex"), q.get("expansionId"), q.get("query")]), json(["258", "e-rs", null]), "the suggestion did not compose");
    eq(json(chips(s.r)), json(["Remove Pokémon: Mudkip", "Remove Set: Ruby & Sapphire"]));
    eq(cells(s.r).length, 2);
    await type(s, "60");
    eq(new URLSearchParams(last(s.calls, "find")[1]).get("number"), "60");
    eq(json(cells(s.r)), json(["Mudkip, Ruby & Sapphire #60"]));
    await press(s, btn(s.r, /^Clear all$/));
    eq(chips(s.r).length, 0); eq(tiles(s.r).length, 4);
  });
  test("a letters-and-digits number is a number (TG04); a word is a name", async () => {
    const s = await show();
    await type(s, "TG04");
    eq(new URLSearchParams(last(s.calls, "find")[1]).get("number"), "TG04");
    eq(json(cells(s.r)), json(["Pikachu, Prismatic Evolutions #TG04"]));
    await type(s, "mud");
    eq(new URLSearchParams(last(s.calls, "find")[1]).get("query"), "mud");
  });
});

/* ============================================================== D */
describe("D. suggestions", () => {
  test("two letters ask Pokémon, sets and artists; the ones that would refine are offered with counts", async () => {
    const s = await show();
    await type(s, "mu");
    const sugg = s.r.root.findAll((n) => cls(n) === "mcs-dsugg")[0];
    assert(sugg, "no suggestions");
    assert(/Pokémon Mudkip 3 cards/.test(flat(sugg)), flat(sugg));
    await type(s, "m");
    eq(s.r.root.findAll((n) => cls(n) === "mcs-dsugg").length, 0, "one letter suggested");
  });
  test("a kind already chosen is not offered again", async () => {
    const s = await show();
    await press(s, s.r.root.findAll((n) => n.type === "button" && n.props["data-dex"] === 258)[0]);
    const before = s.calls.filter(([k]) => k === "pokemon").length;
    await type(s, "mu");
    eq(s.calls.filter(([k]) => k === "pokemon").length, before, "Pokémon were asked while a Pokémon is chosen");
  });
});

/* ============================================================== E */
describe("E. the grid", () => {
  test("each cell is one exact card context: its name, set and number, and opening it opens that one", async () => {
    const s = await show();
    await type(s, "mudkip");
    eq(json(cells(s.r)), json(["Mudkip, Ruby & Sapphire #59", "Mudkip, Ruby & Sapphire #60", "Mudkip ex, Prismatic Evolutions #8"]));
    await press(s, s.r.root.findAll((n) => n.type === "button" && n.props["aria-label"] === "Mudkip, Ruby & Sapphire #60")[0]);
    eq(json(last(s.calls, "read")), json(["read", "x2"]), "a different card was opened");
  });
  test("more as you scroll: the next page is appended, nothing repeated", async () => {
    const many = [];
    for (let i = 1; i <= 75; i += 1) many.push({ cardContextId: `m${i}`, cardName: "Mudkip", expansionId: "e-rs", expansionName: "Ruby & Sapphire", collectorNumber: `M${i}`, artist: "A", pokedexNumbers: [258] });
    CTX.push(...many);
    try {
      const s = await show();
      await press(s, s.r.root.findAll((n) => n.type === "button" && n.props["data-dex"] === 258)[0]);
      eq(cells(s.r).length, 60);
      const more = btn(s.r, /^Scroll for more · 18 more$/);
      assert(more, "no 'more' line: " + flat(s.r.root).slice(-120));
      await press(s, more);
      eq(cells(s.r).length, 78); eq(new Set(cells(s.r)).size, 78);
      assert(/page=2/.test(last(s.calls, "find")[1]));
      assert(!btn(s.r, /^Scroll for more/), "a 'more' line after the last page");
    } finally { CTX.splice(CTX.length - 75, 75); }
  });
  test("the Collector's own marks: their Goals and copies, on the cards they belong to — asked only when cards show", async () => {
    const state = STATE({ goals: [{ id: "g1", canonicalCardId: "cc-x1", tier: "secondary" }, null],
      collectorCopies: [{ id: "k1", canonicalCardId: "cc-x2", keeping: true }, { id: "k2", canonicalCardId: "cc-x2", keeping: true },
        { id: "k3", canonicalCardId: "cc-x6", offered: true }] });
    const s = await show({ state });
    eq(s.calls.filter(([k]) => k === "describe").length, 0, "the landing asked for descriptions");
    await type(s, "mudkip");
    const marks = (label) => flat(s.r.root.findAll((n) => n.type === "button" && n.props["aria-label"] === label)[0].findAll((n) => cls(n) === "mcs-dmarks")[0] || "");
    eq(marks("Mudkip, Ruby & Sapphire #59"), "Secondary");
    eq(marks("Mudkip, Ruby & Sapphire #60"), "PC ×2");
    eq(marks("Mudkip ex, Prismatic Evolutions #8"), "Trade / Sell");
  });
  test("every card without approved art is the drawn card; with art, the art", async () => {
    const s = await show();
    await type(s, "mudkip");
    const cell = s.r.root.findAll((n) => n.type === "button" && /^mcs-dcell/.test(cls(n)))[0];
    assert(cell.findAll((n) => cls(n).split(" ").includes("mcs-cardph")).length === 1, "not the drawn card");
  });
});

/* ============================================================== F */
describe("F. loading, nothing, and unreachable", () => {
  test("Looking… while the first page is on its way", async () => {
    let release; const wait = new Promise((r) => { release = r; });
    const s = await show({ cat: catalogue({ slow: new Map([["pokemon", wait]]) }) });
    assert(/Looking…/.test(flat(s.r.root)), flat(s.r.root));
    await TR.act(async () => { release(); }); await s.settle();
    assert(!/Looking…/.test(flat(s.r.root)));
  });
  test("nothing matches: said, in context; pointed at a suggestion when one exists", async () => {
    const s = await show();
    await type(s, "zzzz");
    assert(/Nothing matches “zzzz”\./.test(flat(s.r.root)), flat(s.r.root));
    await type(s, "ruby");
    assert(/Nothing matches “ruby”\. Choose a suggestion above to see its cards\./.test(flat(s.r.root)), flat(s.r.root));
  });
  test("unreachable: said, never an empty grid passed off as none; Try again asks again", async () => {
    const fail = new Set(["pokemon"]);
    const s = await show({ cat: catalogue({ fail }) });
    assert(/could not be reached/.test(flat(s.r.root)), flat(s.r.root));
    assert(!/nothing here yet/.test(flat(s.r.root)));
    fail.delete("pokemon");
    await press(s, btn(s.r, /^Try again$/));
    eq(tiles(s.r).length, 4);
  });
});

/* ============================================================== G */
describe("G. discovery is not collecting", () => {
  test("browsing everywhere writes nothing: no Goal, no copy, no binder, no offer", async () => {
    const s = await show();
    await press(s, btn(s.r, /^Gen 3$/));
    await press(s, s.r.root.findAll((n) => n.type === "button" && n.props["data-dex"] === 258)[0]);
    await type(s, "60");
    await press(s, btn(s.r, /^Clear all$/));
    await press(s, btn(s.r, /^Sets$/)); await press(s, btn(s.r, /^Artists$/));
    eq(s.specify.length, 0, "a durable step was sent by browsing");
    assert(s.calls.every(([k]) => ["pokemon", "find", "expansions", "artists", "describe"].includes(k)), json(s.calls.map(([k]) => k)));
  });
  test("opening a card is the existing production card (version, then the Card Specification) — no second card UI", async () => {
    const s = await show();
    await type(s, "eevee");
    await press(s, s.r.root.findAll((n) => n.type === "button" && /^Eevee, /.test(n.props["aria-label"] || ""))[0]);
    assert(/Are you looking for it\?/.test(flat(s.r.root)), "not the Card Specification");
    eq(s.specify.length, 0, "opening wrote something");
    const src = fs.readFileSync(path.join(ROOT, "client/browse/Discover.jsx"), "utf8");
    assert(!/CardSpecification|CardDetail|addGoal|addCollectorCopy|onSpecify/.test(src), "Discover grew its own card detail or a write");
  });
});

/* ============================================================== H */
describe("H. boundaries", () => {
  test("only catalogue reads, through the binding it is handed; no provider, no URL, no dataset", () => {
    const src = fs.readFileSync(path.join(ROOT, "client/browse/Discover.jsx"), "utf8");
    assert(!/fetch\(|XMLHttpRequest|https?:\/\/|tcgdex|pokemontcg|localStorage/.test(src), "Discover reaches past its binding");
    assert(!/\bmcs-ph\b/.test(src), "Discover uses the panel-head class");
    const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
    for (const c of EXPOSED_COMMANDS) assert(!new RegExp(`["']${c}["']`).test(src), `Discover names ${c}`);
  });
  test("the TP's CardBrowser is unchanged by this batch", () => {
    const { execFileSync } = require("child_process");
    const changed = execFileSync("git", ["diff", "--name-only", "3447331", "--", "client/browse/CardBrowser.jsx", "client/tp"], { cwd: ROOT, encoding: "utf8" }).trim();
    eq(changed, "", "the Trusted Partner side changed");
  });
  test("the account button sits at the right edge with or without a count (F1 defect)", () => {
    const Shell = load("client/collector/CollectorShell.jsx").default;
    let r; TR.act(() => { r = TR.create(React.createElement(Shell, { state: { ...STATE(), collectors: [{ id: "c1", name: "C" }] }, onSignOut() {} })); });
    const css = r.root.findAll((n) => n.type === "style").map((n) => n.children.join("")).join("\n");
    assert(/\.mcs-hd \.mcs-acct \{ margin-left:auto; \}/.test(css) && /\.mcs-hd \.mcs-hd-count \+ \.mcs-acct \{ margin-left:0; \}/.test(css));
    /* two columns that may shrink: a long set name wraps instead of pushing the grid off screen */
    assert(/\.mcs-dgrid \{[^}]*grid-template-columns:repeat\(2, minmax\(0, 1fr\)\)/.test(css), "the grid's columns cannot shrink");
    assert(/\.mcs-dtiles \{[^}]*grid-template-columns:repeat\(2, minmax\(0, 1fr\)\)/.test(css), "the Pokédex columns cannot shrink");
  });
});

run();
