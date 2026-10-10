/* ============================================================================
   PHASE 6 P6-3.1 — AN EXPANDED BINDER IS AN OPENED COLLECTION
   Reference: phase6-prototype-01 @ fca2c61. A binder opens IN PLACE — its
   cards at once, fully interactive — and there is no second screen to go to.
   Card facts and the Binder choice live in one Details sheet; managing the
   binder lives in one quiet menu; "+ Add cards" and "+ New binder" stay in
   sight. Filing itself is phase6-p63-filing's; this suite is the layout's.
     A. expand / collapse   name, count, turn-down; one open; cards at once
     B. no second step      no "Open …", no "‹ Binders"; returning from Add
                            cards lands with that binder open
     C. the tile            card first; name, state, grade; nothing exposed
     D. Details             one sheet: facts, Binder choice, Card, Close
     E. managing            the menu; put away; bring back; no delete
     F. the layout          compact fixed-size grid; long names; no stretch
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

/* ------------------------------------------------------------- a world */
const ME = "c1";
const CARDS = {
  "cc-char": { canonicalCardId: "cc-char", cardName: "Charizard", expansionName: "Base Set", collectorNumber: "4", finish: "holofoil", imageSmall: null },
  "cc-mud": { canonicalCardId: "cc-mud", cardName: "Mudkip", expansionName: "Ruby & Sapphire", collectorNumber: "60", finish: "non_holo", imageSmall: null },
  "cc-blas": { canonicalCardId: "cc-blas", cardName: "Blastoise", expansionName: "Base Set", collectorNumber: "2", finish: "holofoil", imageSmall: null },
  "cc-old": { canonicalCardId: "cc-old", cardName: "Pikachu", expansionName: "Base Set", collectorNumber: "58", finish: "non_holo", imageSmall: null },
};
const LONG = "Japanese Promos and Special Illustration Rares Wishlist 2026";
const AT = "2030-01-0";
const STATE = () => ({
  actor: { seat: "collector", collectorId: ME },
  binders: [
    { id: "b-gen1", collectorId: ME, name: "Gen 1 Favorites", createdAt: "2030-01-04", archivedAt: null },
    { id: "b-mud", collectorId: ME, name: "Mudkip", createdAt: "2030-01-03", archivedAt: null },
    { id: "b-long", collectorId: ME, name: LONG, createdAt: "2030-01-02", archivedAt: null },
    { id: "b-old", collectorId: ME, name: "Old Trades", createdAt: "2030-01-01", archivedAt: "2030-01-05" }],
  goals: [
    { id: "g-char", collectorId: ME, canonicalCardId: "cc-char", tier: "primary", desired: { grade: "PSA 9" }, createdAt: `${AT}5` },
    { id: "g-mud", collectorId: ME, canonicalCardId: "cc-mud", tier: "secondary", desired: { grade: "PSA 10" }, createdAt: `${AT}5` }],
  collectorCopies: [
    { id: "k-char", collectorId: ME, canonicalCardId: "cc-char", grading: { state: "graded", label: "PSA 8" }, cert: "CERT-8",
      market: 1200, photos: { front: "https://img.example.invalid/f.png", back: "https://img.example.invalid/b.png" }, keeping: true, offered: false, status: "available", addedAt: `${AT}6` },
    { id: "k-blas", collectorId: ME, canonicalCardId: "cc-blas", grading: { state: "raw", label: "Raw · Near Mint" }, keeping: true, offered: false, status: "available", addedAt: `${AT}6` },
    { id: "k-pika", collectorId: ME, canonicalCardId: "cc-old", grading: { state: "graded", label: "PSA 7" }, offered: true, status: "committed", addedAt: `${AT}6` }],
  binderMemberships: [
    { id: "m1", binderId: "b-gen1", goalId: "g-char" },
    { id: "m2", binderId: "b-gen1", collectorCopyId: "k-char" },
    { id: "m3", binderId: "b-mud", goalId: "g-mud" },
    { id: "m4", binderId: "b-old", collectorCopyId: "k-pika" }],
  binderEntries: [{ binderId: "b-mud", canonicalCardId: "cc-blas", addedAt: `${AT}1` }],
  catalog: [], partners: [], relationships: [], inventory: [], opportunities: [], discoveries: [],
});
const door = { describe: async (ids) => ({ cards: ids.map((id) => CARDS[id]).filter(Boolean) }) };
const settle = async () => { for (let i = 0; i < 6; i += 1) await TR.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function show(props = {}, state = STATE()) {
  const sent = [];
  const rec = (name) => async (...args) => { sent.push([name, ...args]); return { ok: true }; };
  let r;
  await TR.act(async () => {
    r = TR.create(React.createElement(Binder, { state, onBrowseCards: door, onSpecify: async () => ({ ok: true }),
      onCreateBinder: rec("createBinder"), onRenameBinder: rec("renameBinder"), onArchiveBinder: rec("setBinderArchived"),
      onFileObject: rec("fileObject"), onUnfileObject: rec("unfileObject"), onAddCards: rec("addCards"), ...props }));
  });
  await settle();
  return { r, sent };
}
const textOf = (n) => (typeof n === "string" ? n : !n || !n.children ? "" : n.children.map(textOf).join(" "));
const flat = (n) => textOf(n).replace(/\s+/g, " ").trim();
const cls = (n) => String((n.props && n.props.className) || "");
const buttons = (r) => r.root.findAll((n) => n.type === "button");
const btn = (r, re) => buttons(r).find((b) => re.test(flat(b))) || null;
const click = async (b) => { assert(b, "no such control"); await TR.act(async () => { b.props.onClick(); }); await settle(); };
const cover = (r, id) => r.root.findAll((n) => cls(n).includes("mcs-bcover") && n.props["data-binder"] === id)[0] || null;
const head = (r, id) => cover(r, id).findAll((n) => n.type === "button" && cls(n).includes("mcs-bhead"))[0];
const tilesIn = (n) => n.findAll((m) => m.type === "li" && cls(m).includes("mcs-otile"));
const openSection = async (r) => click(buttons(r).find((b) => cls(b).includes("mcs-sechead") && /^Binders/.test(flat(b))));
const menuOf = (r, id) => buttons(r).find((b) => b.props["aria-label"] === `Manage ${STATE().binders.find((x) => x.id === id).name}`) || null;
const dialog = (r) => r.root.findAll((n) => n.props && n.props.role === "dialog")[0] || null;

/* ============================================================== A */
describe("A. expand and collapse", () => {
  test("collapsed: the binder's name, its count, and a turn-down — no cards", async () => {
    const { r } = await show();
    await openSection(r);
    const h = head(r, "b-gen1");
    eq(h.props["aria-expanded"], false, "collapsed rows say so");
    eq(flat(h), "Gen 1 Favorites 2 cards", "name and count");
    eq(tilesIn(cover(r, "b-gen1")).length, 0, "a collapsed binder laid out its cards");
    eq(menuOf(r, "b-gen1"), null, "a collapsed binder offers management");
  });
  test("expanding shows its cards at once, fully interactive", async () => {
    const { r } = await show();
    await openSection(r);
    await click(head(r, "b-gen1"));
    eq(head(r, "b-gen1").props["aria-expanded"], true);
    const t = tilesIn(cover(r, "b-gen1"));
    eq(t.length, 2, "its two cards, at once");
    for (const tile of t) {
      const tap = tile.findAll((n) => n.type === "button" && cls(n).includes("mcs-otap"))[0];
      assert(tap && typeof tap.props.onClick === "function", "the card does not open");
      assert(cls(tap).includes("holdable") && typeof tap.props.onPointerDown === "function", "the card cannot be held to file");
      /* RESTATED (P6-4): the tap itself opens the card's sheet — no Details link. */
      eq(tap.props["aria-haspopup"], "dialog", "the tap does not open the card's sheet");
    }
    assert(/2 cards · 1 Primary · 1 PC/.test(flat(cover(r, "b-gen1"))), "what is here, in one line");
  });
  test("a tap on a card in an expanded binder opens it, in one press", async () => {
    const { r } = await show();
    await openSection(r);
    await click(head(r, "b-gen1"));
    await TR.act(async () => { tilesIn(cover(r, "b-gen1"))[0].findAll((n) => n.type === "button")[0].props.onClick({ preventDefault() {} }); });
    await settle();
    assert(dialog(r) && /^Card: Charizard/.test(dialog(r).props["aria-label"]), "the card did not open");
  });
  test("collapsing hides them again; one binder is open at a time", async () => {
    const { r } = await show();
    await openSection(r);
    await click(head(r, "b-gen1"));
    await click(head(r, "b-mud"));
    eq(head(r, "b-gen1").props["aria-expanded"], false, "two open at once");
    eq(tilesIn(cover(r, "b-mud")).length, 2, "Mudkip's Goal and its earlier filing");
    await click(head(r, "b-mud"));
    eq(tilesIn(cover(r, "b-mud")).length, 0, "collapsing left the cards out");
  });
  test("an empty binder says what a binder is, and offers Add cards", async () => {
    const { r, sent } = await show();
    await openSection(r);
    await click(head(r, "b-long"));
    assert(/Nothing in this binder yet/.test(flat(cover(r, "b-long"))));
    await click(cover(r, "b-long").findAll((n) => n.type === "button" && /^\+ Add cards$/.test(flat(n)))[0]);
    eq(json(sent), json([["addCards", { binderId: "b-long", name: LONG }]]));
  });
});

/* ============================================================== B */
describe("B. no second step", () => {
  test("there is no Open, and no back: the binder you expanded IS the binder", async () => {
    const { r } = await show();
    await openSection(r);
    for (const id of ["b-gen1", "b-mud", "b-long"]) {
      await click(head(r, id));
      assert(!buttons(r).some((b) => /^Open /.test(flat(b)) || /^‹/.test(flat(b))), `a second step for ${id}`);
    }
  });
  test("returning from Add cards lands with that binder open", async () => {
    const { r } = await show({ fillingBinder: { binderId: "b-mud", name: "Mudkip" } });
    eq(head(r, "b-mud").props["aria-expanded"], true, "the binder being filled is not open");
    eq(tilesIn(cover(r, "b-mud")).length, 2);
  });
  test("a closed binder's match count is what it shows when opened", async () => {
    const { r } = await show();
    const box = r.root.findAll((n) => n.type === "input" && n.props.type === "search")[0];
    await TR.act(async () => { box.props.onChange({ target: { value: "charizard" } }); }); await settle();
    await openSection(r);
    assert(/2 matches/.test(flat(head(r, "b-gen1"))), flat(head(r, "b-gen1")));
    await click(head(r, "b-gen1"));
    eq(tilesIn(cover(r, "b-gen1")).length, 2, "the matches it promised");
    await click(r.root.findAll((n) => n.type === "button" && /^PC$/.test(flat(n)))[0]);
    eq(tilesIn(cover(r, "b-gen1")).length, 1, "the state filter narrows the open binder too");
  });
});

/* ============================================================== C */
describe("C. the tile is the card", () => {
  /* RESTATED (P6-F4 B1): P6-3.1 put the name first; the founder's B1 brief
     adopts the prototype's caption order instead — state, then the card's
     identity (name and number · version · its own grade). */
  test("picture first, then state, then name, number, version and its own grade", async () => {
    const { r } = await show();
    await openSection(r);
    await click(head(r, "b-gen1"));
    const t = tilesIn(cover(r, "b-gen1")).map((li) => {
      const kids = li.children.filter((c) => typeof c !== "string").map((c) => cls(c));
      const meta = li.findAll((n) => cls(n) === "mcs-ometa")[0];
      return { order: kids, first: meta.children.filter((c) => typeof c !== "string").map((c) => cls(c)),
        state: flat(li.findAll((n) => /\bmcs-mk\b/.test(cls(n)))[0]), ident: flat(li.findAll((n) => cls(n) === "mcs-oq")[0]) };
    });
    for (const x of t) {
      assert(/mcs-otap/.test(x.order[0]), "the picture is not first: " + json(x));
      eq(x.first.slice(0, 2).join(","), "mcs-ostate,mcs-oq", "the caption is not state, then the card");
    }
    assert(t.some((x) => x.state === "Primary" && x.ident === "Charizard #4 · Holo · PSA 9"), json(t));
    assert(t.some((x) => x.state === "PC" && x.ident === "Charizard #4 · Holo · PSA 8"), json(t));
  });
  test("nothing administrative is laid out under the cards", async () => {
    const { r } = await show();
    await openSection(r);
    await click(head(r, "b-gen1"));
    eq(r.root.findAll((n) => n.type === "select").length, 0, "a form control is exposed under the cards");
    for (const li of tilesIn(r.root)) {
      eq(li.findAll((n) => n.type === "input" || n.type === "select").length, 0, "a field on a tile");
      assert(!/CERT-8|\$1,?200/.test(flat(li)), "secondary facts crowd the tile: " + flat(li));
    }
  });
  test("an earlier filing is a quiet tile with no Details and no hold", async () => {
    const { r } = await show();
    await openSection(r);
    await click(head(r, "b-mud"));
    const early = tilesIn(cover(r, "b-mud")).find((li) => /Earlier filing/.test(flat(li)));
    assert(early, "the earlier filing is not shown");
    eq(early.findAll((n) => n.props && n.props["aria-haspopup"] === "dialog").length, 0, "history opens a card sheet");
    eq(early.findAll((n) => typeof n.props.onPointerDown === "function").length, 0, "history can be picked up");
  });
});

/* ============================================================== D */
describe("D. the card's sheet (restated in P6-4 from P6-3.1's Details)", () => {
  const openPc = async (r) => {
    await openSection(r);
    await click(head(r, "b-gen1"));
    const pc = tilesIn(cover(r, "b-gen1")).find((li) => /\bPC\b/.test(flat(li)));
    await TR.act(async () => { pc.findAll((n) => n.type === "button")[0].props.onClick({ preventDefault() {} }); }); await settle();
  };
  test("a copy's facts: grade at once; cert, value, photos, status on request — writing nothing", async () => {
    const { r, sent } = await show();
    await openPc(r);
    const d = dialog(r);
    assert(d && /^Card: Charizard/.test(d.props["aria-label"]), "no sheet");
    assert(/Grade PSA 8/.test(flat(d)) && /In Gen 1 Favorites/.test(flat(d)), flat(d));
    assert(!/CERT-8/.test(flat(d)), "technical facts are shown before they are asked for");
    await click(btn(r, /^Copy details$/));
    const t = flat(dialog(r));
    for (const re of [/CERT-8/, /\$1,?200/, /Photos Front and back/, /Status Available/]) assert(re.test(t), `${re} missing: ${t}`);
    eq(sent.length, 0);
  });
  test("its Binder choice is the keyboard path to filing, and offers active binders only", async () => {
    const { r, sent } = await show();
    await openPc(r);
    /* RESTATED (P6-F4 B2A): one Move; its chooser lists the binders (the current one marked, not offered) */
    await click(btn(r, /^Move$/));
    const group = r.root.findAll((n) => n.props && n.props.role === "group" && n.props["aria-label"] === "Binder for Charizard")[0];
    eq(json(group.findAll((n) => n.type === "button" && String(n.props["data-dest"] || "").startsWith("b:") && !n.props.disabled).map(flat)), json(["Mudkip", LONG]));
    await click(btn(r, /^Mudkip$/));
    eq(json(sent), json([["fileObject", { binderId: "b-mud", collectorCopyId: "k-char" }]]), "one command, naming only the binder and the copy");
    assert(/Charizard is filed in Mudkip/.test(flat(r.root)), "the answer is not said");
  });
  test("Close and Escape close it; Open full card opens the Card Specification", async () => {
    const { r } = await show();
    await openPc(r);
    await click(buttons(r).find((b) => b.props["aria-label"] === "Close"));
    eq(dialog(r), null);
    await TR.act(async () => { tilesIn(cover(r, "b-gen1")).find((li) => /\bPC\b/.test(flat(li))).findAll((n) => n.type === "button")[0].props.onClick({ preventDefault() {} }); });
    await settle();
    await TR.act(async () => { dialog(r).props.onKeyDown({ key: "Escape" }); }); await settle();
    eq(dialog(r), null, "Escape");
    await TR.act(async () => { tilesIn(cover(r, "b-gen1")).find((li) => /\bPC\b/.test(flat(li))).findAll((n) => n.type === "button")[0].props.onClick({ preventDefault() {} }); });
    await settle();
    await click(btn(r, /^Open full card/));
    assert(/Are you looking for it|Card Specification/i.test(flat(r.root)), "Open full card did not open it");
  });
  test("a Goal's sheet says what it looks for", async () => {
    const { r } = await show();
    await openSection(r);
    await click(head(r, "b-gen1"));
    await TR.act(async () => { tilesIn(cover(r, "b-gen1")).find((li) => /Primary/.test(flat(li))).findAll((n) => n.type === "button")[0].props.onClick({ preventDefault() {} }); });
    await settle();
    assert(/Looking for PSA 9/.test(flat(dialog(r))), flat(dialog(r)));
  });
});

/* ============================================================== E */
describe("E. managing a binder, out of the way", () => {
  test("the menu is closed until asked for; it holds rename, the list, and put away — no delete", async () => {
    const { r } = await show();
    await openSection(r);
    await click(head(r, "b-gen1"));
    assert(!btn(r, /^Rename binder$/), "management is laid out by default");
    const more = menuOf(r, "b-gen1");
    eq(more.props["aria-expanded"], false);
    await click(more);
    const items = r.root.findAll((n) => n.props && n.props.role === "menuitem").map(flat);
    eq(json(items), json(["Rename binder", "Move & remove (list)", "Put away"]));
    assert(!buttons(r).some((b) => /Delete/i.test(flat(b))), "a delete appeared");
    assert(btn(r, /^\+ Add cards$/), "Add cards is not in sight");
  });
  test("the list keeps Move and Remove, and goes back to cards", async () => {
    const { r } = await show();
    await openSection(r);
    await click(head(r, "b-gen1"));
    await click(menuOf(r, "b-gen1"));
    await click(btn(r, /^Move & remove \(list\)$/));
    assert(r.root.findAll((n) => n.type === "select" && /^Move /.test(String(n.props["aria-label"] || ""))).length === 2, "Move lost");
    eq(buttons(r).filter((b) => /^Remove from Binder$/.test(flat(b))).length, 2, "Remove lost");
    await click(menuOf(r, "b-gen1"));
    await click(btn(r, /^Show as cards$/));
    eq(tilesIn(cover(r, "b-gen1")).length, 2);
  });
  test("a put-away binder still opens in place; its menu brings it back, and it takes no new cards", async () => {
    const { r, sent } = await show();
    await openSection(r);
    await click(btn(r, /^Show binders you've put away/));
    await click(head(r, "b-old"));
    assert(/Put away · 1 card/.test(flat(head(r, "b-old"))), flat(head(r, "b-old")));
    eq(tilesIn(cover(r, "b-old")).length, 1, "its card is shown");
    assert(!cover(r, "b-old").findAll((n) => n.type === "button" && /Add cards/.test(flat(n))).length, "Add cards on a put-away binder");
    await click(menuOf(r, "b-old"));
    eq(json(r.root.findAll((n) => n.props && n.props.role === "menuitem").map(flat)), json(["Move & remove (list)", "Bring back"]));
    await click(btn(r, /^Bring back$/));
    eq(json(sent), json([["setBinderArchived", "b-old", false]]));
  });
  test("+ New binder stays in sight below the binders", async () => {
    const { r } = await show();
    await openSection(r);
    await click(head(r, "b-gen1"));
    assert(btn(r, /^\+ New binder$/), "New binder is hidden while a binder is open");
  });
});

/* ============================================================== F */
describe("F. the layout", () => {
  const css = () => {
    let r;
    TR.act(() => { r = TR.create(React.createElement(Shell, { state: { ...STATE(), collectors: [{ id: ME, name: "C" }] }, onSignOut() {} })); });
    return r.root.findAll((n) => n.type === "style").map((n) => n.children.join("")).join("\n");
  };
  test("cards keep one size from tablet up: fixed tracks, never stretched", () => {
    const wide = css().slice(css().indexOf("@media (min-width:600px)"));
    assert(/\.mcs-ogrid \{ grid-template-columns:repeat\(auto-fill, minmax\(132px, 152px\)\);[^}]*justify-content:start;/.test(wide), "the desktop grid stretches its cards");
    assert(/\.mcs-ogrid \{ list-style:none;[^}]*grid-template-columns:repeat\(3, minmax\(0, 1fr\)\)/.test(css()), "three across on a phone");
  });
  /* RESTATED (P6-F4 B1): P6-3.1 set an open binder's cards on the page; the
     founder's B1 brief returns them to the prototype's cover — the binder is
     one bordered cover holding its row and its cards. The screen keeps its
     measure. */
  test("an open binder is one cover holding its cards; the screen has a measure", () => {
    const c = css();
    assert(/\.mcs-binders \{ max-width:1040px; \}/.test(c), "no measure for the screen");
    assert(/\.mcs-bcover \{ display:block; width:100%; text-align:left; border:1px solid var\(--line\); background:#FFF;\s*border-radius:16px; \}/.test(c), "the binder is not a cover");
    assert(/\.mcs-bcover\.open \{ border-color:var\(--t1\); \}/.test(c), "an open binder does not say so");
    assert(/\.mcs-bbody \{ padding:0 10px 10px; \}/.test(c), "the cards are not inside the cover");
    /* (the open binder is marked on its whole cover now — asserted above — not on its row) */
  });
  test("a long binder name ends in an ellipsis, keeping its count and menu in view", async () => {
    assert(/\.mcs-bline b \{[^}]*text-overflow:ellipsis; white-space:nowrap; \}/.test(css()), "a long name can push the count out");
    const { r } = await show();
    await openSection(r);
    eq(flat(head(r, "b-long")), `${LONG} 0 cards`, "the long name or its count is lost");
  });
  test("a binder with many cards shows every one of them", async () => {
    const s = STATE();
    for (let i = 0; i < 40; i += 1) {
      s.collectorCopies.push({ id: `k-${i}`, collectorId: ME, canonicalCardId: "cc-blas", grading: { state: "graded", label: `PSA ${(i % 10) + 1}` },
        keeping: true, offered: false, status: "available", addedAt: `${AT}7` });
      s.binderMemberships.push({ id: `mm-${i}`, binderId: "b-long", collectorCopyId: `k-${i}` });
    }
    const { r } = await show({}, s);
    await openSection(r);
    eq(flat(head(r, "b-long")), `${LONG} 40 cards`);
    await click(head(r, "b-long"));
    eq(tilesIn(cover(r, "b-long")).length, 40, "a big binder was cut short");
  });
  test("moving a card names only the binder and the thing — never its state", async () => {
    const src = fs.readFileSync(path.join(ROOT, "client/collector/sections/Binder.jsx"), "utf8");
    assert(/onFileObject\(\{ binderId: to, \.\.\.what \}\)/.test(src) && /onUnfileObject\(what\)/.test(src), "the filing commands changed");
    assert(!/tier|keeping|offered/.test((src.match(/const what = [^\n]+/) || [""])[0]), "a filing carries state");
  });
});

run();
