/* ============================================================================
   PHASE 6 P6-F3A STAGE 1 — THE CARD, AS THE PHASE 6 PROTOTYPE DRAWS IT
   client/collector/CardDetail.jsx, opened from Browse
   (client/collector/sections/Browse.jsx), against a recorded catalogue.
     A. identity        name; set · number · artist; the picture the catalogue holds
     B. versions        one is said; several are asked; none "can't record"
     C. remembers       the Collector's own Goal and copies, grouped, by binder id
     D. navigation      ‹ back to the Browse it came from; ‹ › through its results
     E. Stage 1         nothing writes; Add opens today's form, and says so
     F. the exception   the review-only artwork lives in harness/ and nowhere a
                        production build can reach
   Visual comparison with the prototype: `npm run review:fidelity` (c00–c06).
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
const CardDetail = load("client/collector/CardDetail.jsx").default;
const BROWSE = load("client/collector/sections/Browse.jsx");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const tick = () => TR.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const settle = async () => { for (let i = 0; i < 6; i += 1) await tick(); };

const flat = (node) => {
  const out = [];
  const walk = (n) => {
    if (n == null) return;
    if (typeof n === "string" || typeof n === "number") { out.push(String(n)); return; }
    if (n.type === "style") return;
    (n.children || []).forEach(walk);
  };
  walk(node.toJSON ? node.toJSON() : node);
  return out.join(" ").replace(/\s+/g, " ");
};
const btns = (r) => r.root.findAll((n) => n.type === "button");
const cls = (r, c) => r.root.findAll((n) => typeof (n.props && n.props.className) === "string" && n.props.className.split(" ").includes(c));
const tap = async (b) => { await TR.act(async () => { b.props.onClick(); }); await settle(); };

/* ------------------------------------------------- Mudkip, R&S #60 */
const IMG = { imageSmall: "img://catalogue/rs-60-small", imageLarge: "img://catalogue/rs-60-large" };
const MUDKIP = { cardContextId: "ctx-60", cardName: "Mudkip", expansionName: "Ruby & Sapphire", collectorNumber: "60", artist: "Ken Sugimori" };
const printing = (id, finish, extra = {}) => ({ canonicalCardId: id, cardContextId: "ctx-60", printRun: "unlimited", finish,
  language: "en", stamp: "none", printVariation: "standard", status: "active", ...IMG, ...extra });
const TWO = [printing("k-n", "non_holo"), printing("k-r", "reverse_holofoil")];
const STATE = () => ({
  goals: [{ id: "g1", canonicalCardId: "k-r", tier: "secondary", desired: { grade: "PSA 9" } }],
  collectorCopies: [
    { id: "c1", canonicalCardId: "k-n", grading: { state: "raw", label: "Raw · Near Mint" }, keeping: true },
    { id: "c2", canonicalCardId: "k-n", grading: { state: "raw", label: "Raw · Near Mint" }, keeping: true },
    { id: "c3", canonicalCardId: "k-n", grading: { state: "raw", label: "Raw · Near Mint" }, keeping: true },
  ],
  /* two binders with ONE name: c3 must not join c1/c2's line */
  binders: [{ id: "b1", name: "Mudkip" }, { id: "b2", name: "Mudkip" }],
  binderMemberships: [{ binderId: "b1", collectorCopyId: "c1" }, { binderId: "b1", collectorCopyId: "c2" },
    { binderId: "b2", collectorCopyId: "c3" }, { binderId: "b1", goalId: "g1" }],
});
const card = (props = {}) => {
  let r;
  const seen = { closed: 0, steps: [], added: [] };
  TR.act(() => {
    r = TR.create(React.createElement(CardDetail, { context: { ...MUDKIP, cards: TWO }, state: STATE(), backLabel: "Mudkip",
      position: 1, total: 3, onStep: (d) => seen.steps.push(d), onClose: () => { seen.closed += 1; },
      onAdd: (c) => seen.added.push(c.canonicalCardId), ...props }));
  });
  return { r, seen };
};

/* ============================================================== A */
describe("A. identity", () => {
  test("name, then set · number · artist, under the card's picture", () => {
    const { r } = card();
    const shown = flat(r);
    assert(/Mudkip Ruby & Sapphire · 60 · Ken Sugimori/.test(shown), shown);
    eq(cls(r, "mcs-cd-ident")[0].findByType("h2").children.join(""), "Mudkip");
    const img = r.root.findAll((n) => n.type === "img");
    assert(img.length >= 1, "no picture");
    eq(img[0].props.src, IMG.imageLarge, "the hero is not the catalogue's large picture");
  });
  test("full screen, out of flow, a dialog named for the card", () => {
    const { r } = card();
    const root = cls(r, "mcs-cd")[0];
    eq(root.props.role, "dialog"); eq(root.props["aria-modal"], "true");
    assert(/^Mudkip, Ruby & Sapphire · 60 · Ken Sugimori$/.test(root.props["aria-label"]), root.props["aria-label"]);
    const css = read("client/collector/CollectorShell.jsx").replace(/\s+/g, " ");
    assert(/\.mcs-cd \{ position:fixed; inset:0; z-index:28;/.test(css), "the card is not full screen");
    assert(/\.mcs-cd-frame \{[^}]*width:72%/.test(css), "the hero is not the prototype's 72%");
  });
  test("a card with no picture draws the prototype's placeholder, never a broken image", () => {
    const bare = TWO.map((c) => ({ ...c, imageSmall: null, imageLarge: null }));
    const { r } = card({ context: { ...MUDKIP, cards: bare } });
    eq(r.root.findAll((n) => n.type === "img").length, 0);
    assert(/No picture yet/.test(flat(r)), flat(r));
  });
});

/* ============================================================== B */
describe("B. versions", () => {
  test("several are asked, in the prototype's words, and nothing is chosen for you", () => {
    const { r } = card();
    assert(/Which version\? Normal Reverse Holo/.test(flat(r)), flat(r));
    const choices = cls(r, "mcs-cd-choice");
    eq(choices.map((b) => b.props["aria-pressed"]).join(","), "false,false");
    eq(cls(r, "mcs-cd-add")[0].props["aria-disabled"], true, "Add was ready before a version was chosen");
  });
  test("choosing one marks it, readies Add, and says the picture is the card's", async () => {
    const { r } = card();
    assert(!/may look different/.test(flat(r)));
    await tap(cls(r, "mcs-cd-choice")[1]);
    eq(cls(r, "mcs-cd-choice").map((b) => b.props["aria-pressed"]).join(","), "false,true");
    assert(/Card picture — this version may look different\./.test(flat(r)), flat(r));
    assert(cls(r, "mcs-cd-frame")[0].props.className.includes("rev"), "the reverse holo wears no sheen");
    eq(cls(r, "mcs-cd-add")[0].props["aria-disabled"], false);
  });
  test("one printing is said, not asked; none is \"MetYet can't record this card yet.\"", () => {
    const one = card({ context: { ...MUDKIP, cards: [TWO[0]] } });
    assert(/Normal — the only version of this card\./.test(flat(one.r)), flat(one.r));
    eq(cls(one.r, "mcs-cd-choice").length, 0);
    eq(cls(one.r, "mcs-cd-add")[0].props["aria-disabled"], false);
    const none = card({ context: { ...MUDKIP, cards: [] } });
    assert(/Which version\? MetYet can't record this card yet\./.test(flat(none.r)), flat(none.r));
    eq(cls(none.r, "mcs-cd-add")[0].props["aria-disabled"], true);
  });
  test("a production printing's other differences are named, not hidden", () => {
    const { versionLabel } = load("client/collector/CardDetail.jsx");
    eq(versionLabel(printing("x", "holofoil", { printRun: "first_edition" })), "Holo · First Edition");
    eq(versionLabel(printing("x", "holofoil", { stamp: "prerelease" })), "Holo · Prerelease stamp");
    eq(versionLabel(printing("x", "non_holo", { language: "ja" })), "Normal · JA");
  });
});

/* ============================================================== C */
describe("C. MetYet remembers", () => {
  test("the Goal and the copies, per version, alike copies counted, binders told apart by id", () => {
    const { r } = card();
    const lines = cls(r, "mcs-cd-remembered")[0].findAllByType("li").map((li) => li.children.join(""));
    eq(JSON.stringify(lines), JSON.stringify([
      "Normal · 2 copies · Personal collection · Raw · Near Mint · Mudkip",
      "Normal · You own it · Personal collection · Raw · Near Mint · Mudkip",
      "Reverse Holo · Looking for it · Secondary · PSA 9 · Mudkip",
    ]));
  });
  test("a card nobody has said anything about has no box", () => {
    const { r } = card({ state: {} });
    eq(cls(r, "mcs-cd-remembered").length, 0);
  });
});

/* ============================================================== D */
describe("D. navigation", () => {
  test("‹ back names where it came from, and closes", async () => {
    const { r, seen } = card();
    const back = cls(r, "mcs-cd-back")[0];
    eq(flat(back), "‹ Mudkip");
    await tap(back);
    eq(seen.closed, 1);
  });
  test("‹ › step, and stop at the ends", async () => {
    const mid = card();
    await tap(btns(mid.r).find((b) => b.props["aria-label"] === "Next card"));
    await tap(btns(mid.r).find((b) => b.props["aria-label"] === "Previous card"));
    eq(mid.seen.steps.join(","), "1,-1");
    const first = card({ position: 0 });
    eq(btns(first.r).find((b) => b.props["aria-label"] === "Previous card").props.disabled, true);
    const last = card({ position: 2 });
    eq(btns(last.r).find((b) => b.props["aria-label"] === "Next card").props.disabled, true);
  });

  /* Browse, wired: Discover's results are the card's neighbours. */
  const CTX = ["59", "60", "61"].map((n) => ({ ...MUDKIP, cardContextId: `ctx-${n}`, collectorNumber: n, pokedexNumbers: [258] }));
  const browse = () => {
    const calls = [];
    const door = {
      find: async (q) => { calls.push(["find", q]); return { contexts: CTX, total: CTX.length, page: 1, pageSize: 24 }; },
      read: async (id) => { calls.push(["read", id]); return { context: CTX.find((c) => c.cardContextId === id), canonicalCards: [printing(`k-${id}`, "non_holo")] }; },
      describe: async () => ({ cards: [] }), expansions: async () => ({ expansions: [], total: 0 }),
      artists: async () => ({ artists: [], total: 0 }), pokemon: async () => ({ pokemon: [], total: 0 }),
    };
    let session = BROWSE.newBrowseSession();
    let r;
    const draw = () => TR.act(async () => {
      const el = React.createElement(BROWSE.default, { state: {}, session, onSession: (s) => { session = s; draw(); },
        onSpecify: async () => ({ ok: true }), onBrowseCards: door });
      if (r) r.update(el); else r = TR.create(el);
    });
    return { calls, draw, get r() { return r; }, get session() { return session; } };
  };
  test("from Browse: the card opens over the grid, ‹ › walk the results, ‹ back leaves Browse as it was", async () => {
    const b = browse();
    await b.draw();
    const input = b.r.root.findAll((n) => n.type === "input").find((n) => n.props["aria-label"] === "Search");
    await TR.act(async () => { input.props.onChange({ target: { value: "mudkip" } }); });
    await settle(); await b.draw(); await settle();
    const finds = b.calls.filter((c) => c[0] === "find").length;
    const sessionBefore = JSON.stringify(b.session);
    await tap(btns(b.r).find((x) => /^Mudkip, Ruby & Sapphire #60$/.test(x.props["aria-label"] || "")));
    eq(cls(b.r, "mcs-cd").length, 1, "the card did not open");
    eq(flat(cls(b.r, "mcs-cd-back")[0]), "‹ “mudkip”");
    assert(/Ruby & Sapphire · 60/.test(flat(cls(b.r, "mcs-cd")[0])));
    await tap(btns(b.r).find((x) => x.props["aria-label"] === "Next card"));
    assert(/Ruby & Sapphire · 61/.test(flat(cls(b.r, "mcs-cd")[0])), flat(cls(b.r, "mcs-cd")[0]));
    eq(btns(b.r).find((x) => x.props["aria-label"] === "Next card").props.disabled, true, "stepped past the end");
    await tap(btns(b.r).find((x) => x.props["aria-label"] === "Previous card"));
    await tap(btns(b.r).find((x) => x.props["aria-label"] === "Previous card"));
    assert(/Ruby & Sapphire · 59/.test(flat(cls(b.r, "mcs-cd")[0])));
    await tap(cls(b.r, "mcs-cd-back")[0]);
    eq(cls(b.r, "mcs-cd").length, 0, "the card stayed open");
    eq(b.calls.filter((c) => c[0] === "find").length, finds, "the grid was fetched again");
    eq(JSON.stringify(b.session), sessionBefore, "the Browse session was rewritten");
    assert(cls(b.r, "mcs-disc").length === 1, "the grid is gone");
  });
});

/* ============================================================== E */
describe("E. Stage 1: presentation only", () => {
  test("nothing on the card writes; Add hands the chosen version to today's form", async () => {
    const { r, seen } = card();
    await tap(cls(r, "mcs-cd-add")[0]);
    eq(seen.added.length, 0, "Add acted before a version was chosen");
    await tap(cls(r, "mcs-cd-choice")[1]);
    assert(/For now, Add opens MetYet's current card form\./.test(flat(r)), "the interim is not said");
    await tap(cls(r, "mcs-cd-add")[0]);
    eq(seen.added.join(","), "k-r");
    const src = code("client/collector/CardDetail.jsx");
    assert(!/onSpecify|onCommit|addGoal|addCollectorCopy|fetch\(|api\./.test(src), "the card writes or reaches past its props");
    const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
    for (const c of EXPOSED_COMMANDS) assert(!new RegExp(`["']${c}["']`).test(src), `the card names ${c}`);
  });
  test("the Stage 2 questions are not drawn", () => {
    const { r } = card({ context: { ...MUDKIP, cards: [TWO[0]] } });
    assert(!/What does this card mean to you\?|I'm looking for it|I own it|Raw or graded/.test(flat(r)), flat(r));
  });
  test("with no save path, the card says nothing about one and Add stays quiet", () => {
    const { r } = card({ onAdd: null, context: { ...MUDKIP, cards: [TWO[0]] } });
    assert(!/For now/.test(flat(r)));
    eq(cls(r, "mcs-cd-add")[0].props["aria-disabled"], true);
  });
});

/* ============================================================== F */
describe("F. the review-only artwork exception", () => {
  const PROVIDER = /tcgdex|tcgplayer|pokemontcg|REVIEW_ARTWORK|applyReviewArtwork/i;
  const walk = (dir) => (fs.existsSync(path.join(ROOT, dir)) ? fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : []);
  test("no provider URL, and no trace of the exception, in anything that ships", () => {
    const shipped = ["client", "server", "persistence", "domain", "app-src", "shared"].flatMap(walk)
      .filter((f) => /\.(m?c?js|jsx|ts|tsx|json|html|css|sql)$/.test(f));
    assert(shipped.length > 50, "the scan found nothing to scan");
    const hits = shipped.filter((f) => PROVIDER.test(read(f)));
    eq(JSON.stringify(hits), "[]", "a provider or the exception reached shipped code");
  });
  test("the built app carries none of it either", () => {
    /* app.build.mjs's own bundle — same entry, same switches — in memory, so a
       test never overwrites a configured app/ */
    const src = (read("app.build.mjs").match(/const SRC = "([^"]+)"/) || [])[1];
    assert(src, "app.build.mjs has no entry point");
    const out = esbuild.buildSync({ entryPoints: [path.join(ROOT, src)], bundle: true, format: "esm", write: false,
      jsx: "automatic", minify: true, target: ["es2020"], logLevel: "silent",
      define: { "process.env.NODE_ENV": '"production"', __METYET_API_URL__: '""', __METYET_SUPABASE_URL__: '""',
        __METYET_SUPABASE_KEY__: '""', __METYET_DEV__: "false", __METYET_DEMO__: "false" } });
    const bundle = out.outputFiles.map((f) => f.text).join("\n");
    assert(bundle.length > 100000 && /Which version\?/.test(bundle), "the bundle does not carry the card");
    assert(!PROVIDER.test(bundle), "the production bundle carries a provider URL");
    for (const f of walk("app").filter((x) => /\.(js|html)$/.test(x))) assert(!PROVIDER.test(read(f)), `${f} carries a provider URL`);
  });
  test("it lives in the review harness, which nothing that ships imports", () => {
    assert(/REVIEW_ARTWORK[\s\S]*assets\.tcgdex\.net\/en\/ex\/ex1\/60\/high\.webp/.test(read("harness/phase6-world.cjs")));
    const importers = ["client", "server", "persistence", "domain", "app-src", "shared"].flatMap(walk)
      .concat(["app.build.mjs", "prod.build.mjs", "build-all.mjs", "server/index.js"])
      .filter((f) => fs.existsSync(path.join(ROOT, f)) && /harness[\\/]/.test(read(f)));
    eq(JSON.stringify(importers), "[]");
    /* the exception writes only into the in-memory review database it builds */
    const world = read("harness/phase6-world.cjs");
    assert(/new PGlite\(/.test(world), "the review database is not in memory");
    assert(!/DATABASE_URL/.test(world), "the review world can reach a real database");
  });
  test("the catalogue importer and C7.1's image rules are unchanged by this batch", () => {
    const { execFileSync } = require("child_process");
    const changed = execFileSync("git", ["diff", "--name-only", "450013e", "--", "persistence", "server", "domain",
      "scripts", "app-src"], { cwd: ROOT, encoding: "utf8" }).trim();
    eq(changed, "", "Stage 1 changed production catalogue, server or domain code");
  });
});

run();
