/* ============================================================================
   BINDERS ABSORB YOUR CARDS — FOUR DESTINATIONS, AND NOTHING LOST

   One sentence: the useful jobs Your Cards did moved into Binders as derived
   views, and only then did the tab come down.

     Browse · Binders · Trusted Partners · Deal Flow

   THE VIEWS ARE DERIVED AND ARE NOT BINDERS. All Cards, Primary Goals,
   Secondary Goals and Trade/Sell are computed on every render from the binders,
   goals and copies the server already sent. Nothing about them is stored: no
   synthetic binder, no saved filter, no membership record, no new command.

   THE FOUR TRUTHS STAY FOUR. Binder membership says a card belongs somewhere;
   a Goal says it is wanted; its tier says how hard; a CollectorCopy says it is
   owned; `offered` says it may be traded. A view is a way of LOOKING at those,
   never a fifth fact and never a collapse of the four into a status.

   AND PC WAS NOT GUESSED. The only fact that resembles one is
   `offered === false`, which says a copy is not currently on offer and says
   nothing at all about whether its owner decided to keep it. Reading the second
   from the first would be the product inventing a statement nobody made. There
   is no PC view here, and section F asserts its absence rather than its shape.
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const React = require("react");
const TR = require("react-test-renderer");
const esbuild = require("esbuild");
const P = require("../domain/metyet-projection.js");
const { createStore } = require("./fixture-store.cjs");
const RT = require("../domain/metyet-runtime.js");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");

const ROOT = path.join(__dirname, "..");
const AT = "2026-09-29";
let seq = 0;
const runtime = () => RT.createRuntime({ now: () => AT, newId: (p = "") => `${p}${++seq}` });
const PH = { front: "f.jpg", back: "b.jpg" };
const ME = { collectorId: "casey" };

const world = (over = {}) => createStore({
  partners: [{ id: "nl", name: "Northline", tradeRate: 0.7 }],
  collectors: [{ id: "casey", name: "Casey" }],
  relationships: [{ partnerId: "nl", collectorId: "casey", status: "accepted", at: AT }],
  goals: [], inventory: [], collectorCopies: [], binders: [], binderEntries: [],
  opportunities: [], catalog: [], copyReviews: [], photoRequests: [],
  conversations: [], interests: [],
  ...over,
}, runtime());

const build = (rel) => {
  const out = esbuild.buildSync({
    entryPoints: [path.join(ROOT, rel)],
    bundle: true, format: "cjs", write: false, logLevel: "silent", jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};
const SHELL_MOD = build("client/collector/CollectorShell.jsx");
const SHELL = SHELL_MOD.default;
const Collection = build("client/collector/sections/Collection.jsx").default;
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const texts = (r) => {
  const out = [];
  const walk = (n) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (typeof n === "string" || typeof n === "number") { out.push(String(n)); return; }
    if (!n || n.type === "style") return;
    for (const c of n.children || []) walk(c);
  };
  walk(r.toJSON());
  return out.join(" ").replace(/\s+/g, " ");
};
const buttons = (r) => r.root.findAll((n) => n.type === "button");
const instText = (node) => {
  const out = [];
  const walk = (n) => {
    if (typeof n === "string" || typeof n === "number") { out.push(String(n)); return; }
    if (!n || !Array.isArray(n.children)) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out.join(" ").replace(/\s+/g, " ");
};
const press = async (r, label) => {
  const hit = buttons(r).find((b) => instText(b).includes(label));
  assert(hit, `no button "${label}" among: ${buttons(r).map(instText).join(" | ")}`);
  await TR.act(async () => { hit.props.onClick(); });
  for (let i = 0; i < 8; i += 1) {
    await TR.act(async () => { await new Promise((done) => setTimeout(done, 0)); });
  }
};

const CARDS = {
  "cc-a": { canonicalCardId: "cc-a", cardName: "Charizard", expansionName: "Base Set",
    collectorNumber: "4", imageSmall: "https://example.test/a.png" },
  "cc-b": { canonicalCardId: "cc-b", cardName: "Mudkip", expansionName: "Ruby & Sapphire",
    collectorNumber: "60", imageSmall: null },
  "cc-c": { canonicalCardId: "cc-c", cardName: "Umbreon", expansionName: "Neo Discovery",
    collectorNumber: "13", imageSmall: null },
};
const door = { describe: async (ids) => ({ cards: ids.map((id) => CARDS[id]).filter(Boolean) }) };

/* The component on its own, for the derivation tests: a view is a pure function
   of the projection and nothing else, and this is where that is provable. */
const showView = async (st, view, query = "") => {
  const state = P.projectForActor(st.get(), ME);
  let r;
  await TR.act(async () => {
    r = TR.create(React.createElement(Collection,
      { state, view, query, onBrowseCards: door }));
  });
  for (let i = 0; i < 8; i += 1) {
    await TR.act(async () => { await new Promise((done) => setTimeout(done, 0)); });
  }
  return r;
};
/* And the whole shell, for the navigation tests. */
const showShell = async (st) => {
  const state = P.projectForActor(st.get(), ME);
  let r;
  await TR.act(async () => {
    r = TR.create(React.createElement(SHELL, { state, onSignOut() {},
      onBrowseCards: door, onSpecify: async () => ({ ok: true }) }));
  });
  return r;
};

/* One Collector, three cards, each meaningful a different way, plus one card
   that is meaningful three ways at once. */
const FULL = () => world({
  binders: [{ id: "bd1", collectorId: "casey", name: "Mudkips", createdAt: AT, archivedAt: null },
    { id: "bd2", collectorId: "casey", name: "Away", createdAt: AT, archivedAt: AT }],
  binderEntries: [{ binderId: "bd1", canonicalCardId: "cc-b", addedAt: AT },
    { binderId: "bd1", canonicalCardId: "cc-a", addedAt: AT },
    { binderId: "bd2", canonicalCardId: "cc-a", addedAt: AT }],
  goals: [{ id: "g1", collectorId: "casey", canonicalCardId: "cc-a", tier: "primary",
    desired: { grade: "PSA 9" }, createdAt: AT },
    { id: "g2", collectorId: "casey", canonicalCardId: "cc-c", tier: "secondary",
      desired: { grade: "PSA 9" }, createdAt: AT }],
  collectorCopies: [
    { id: "k1", collectorId: "casey", canonicalCardId: "cc-a", grade: "PSA 9",
      offered: true, cert: "OFFERED-1", market: 900, photos: PH, addedAt: AT },
    { id: "k2", collectorId: "casey", canonicalCardId: "cc-a", grade: "Raw",
      condition: "Damaged", offered: false, cert: "KEPT-1", market: 20, photos: PH, addedAt: AT }],
});

/* ============================================== A. the derived views */
describe("A. Four views over what already means something", () => {
  test("[1] All Cards includes a card that is only in a binder", async () => {
    const st = world({
      binders: [{ id: "bd1", collectorId: "casey", name: "B", createdAt: AT, archivedAt: null }],
      binderEntries: [{ binderId: "bd1", canonicalCardId: "cc-b", addedAt: AT }] });
    const shown = texts(await showView(st, { kind: "all" }));
    assert(/Mudkip/.test(shown), "a filed card is not in All Cards: " + shown);
  });

  test("[2] All Cards includes a card that is only a Goal", async () => {
    const st = world({ goals: [{ id: "g1", collectorId: "casey", canonicalCardId: "cc-a",
      tier: "primary", desired: { grade: "PSA 9" }, createdAt: AT }] });
    assert(/Charizard/.test(texts(await showView(st, { kind: "all" }))), "a wanted card is not in All Cards");
  });

  test("[3] All Cards includes a card that is only owned", async () => {
    const st = world({ collectorCopies: [{ id: "k1", collectorId: "casey",
      canonicalCardId: "cc-c", grade: "PSA 9", offered: false, cert: "OWN-1", addedAt: AT }] });
    const shown = texts(await showView(st, { kind: "all" }));
    assert(/Umbreon/.test(shown), "an owned card is not in All Cards: " + shown);
    assert(/OWN-1/.test(shown), "and its copy is not under it: " + shown);
  });

  test("[4] one card meaningful three ways is one card, not three", async () => {
    const shown = texts(await showView(FULL(), { kind: "all" }));
    eq(shown.split("Charizard").length - 1, 1, "the card was listed once per source: " + shown);
    /* And all three of its meanings are still visible on that one heading. */
    assert(/Actively hunting/.test(shown), "the Goal was lost in the de-duplication");
    assert(/OFFERED-1/.test(shown) && /KEPT-1/.test(shown), "a copy was lost");
  });

  test("[5][6][7] the Goal views are the tiers, and need no binder", async () => {
    /* Neither goal's card is filed anywhere in this world. */
    const st = world({ goals: [
      { id: "g1", collectorId: "casey", canonicalCardId: "cc-a", tier: "primary",
        desired: { grade: "PSA 9" }, createdAt: AT },
      { id: "g2", collectorId: "casey", canonicalCardId: "cc-c", tier: "secondary",
        desired: { grade: "PSA 9" }, createdAt: AT }] });
    const primary = texts(await showView(st, { kind: "primary" }));
    assert(/Charizard/.test(primary), "a Primary Goal with no binder vanished: " + primary);
    assert(!/Umbreon/.test(primary), "a Secondary Goal appeared under Primary");
    const secondary = texts(await showView(st, { kind: "secondary" }));
    assert(/Umbreon/.test(secondary), "a Secondary Goal with no binder vanished: " + secondary);
    assert(!/Charizard/.test(secondary), "a Primary Goal appeared under Secondary");
  });

  test("[8][9][31] Trade/Sell is the offered COPIES, not the cards", async () => {
    const shown = texts(await showView(FULL(), { kind: "trade" }));
    assert(/OFFERED-1/.test(shown), "the offered copy is missing: " + shown);
    assert(!/KEPT-1/.test(shown), "a copy that is not offered appeared: " + shown);
    /* One card, two copies, one of them offered — so the card appears with
       exactly one copy under it. Copy-level truth, grouped only for reading. */
    eq(shown.split("Charizard").length - 1, 1, "the card was listed per copy");
    assert(!/Umbreon|Mudkip/.test(shown), "a card with nothing offered kept its heading");
  });

  test("[10] several copies of one card stay several copies", async () => {
    const shown = texts(await showView(FULL(), { kind: "all" }));
    assert(/OFFERED-1/.test(shown) && /KEPT-1/.test(shown), "a copy was merged away: " + shown);
    assert(/2 copies/.test(shown), "the count is not the copies': " + shown);
    /* AND THE HEADING NEVER CARRIES A GRADE — a PSA 9 and a damaged raw copy of
       one card are two different objects and any single grading would be a fact
       about neither. Asserted on the source, the way C3.4a asserted it. */
    const src = code("client/collector/sections/Collection.jsx");
    const head = src.slice(src.indexOf("mcs-group-head"), src.indexOf("listed.map("));
    assert(head.length > 100, "the heading region was not found");
    assert(!/gradeLine/.test(head), "the heading grew a grade");
  });

  test("[11][12] a named binder follows membership, and a card may be in several", async () => {
    const st = FULL();
    const shown = texts(await showView(st, { kind: "binder", binderId: "bd1" }));
    assert(/Mudkip/.test(shown) && /Charizard/.test(shown), "a filed card is missing: " + shown);
    assert(!/Umbreon/.test(shown), "a card that is not filed here appeared: " + shown);
    /* cc-a is in bd1 AND in the archived bd2; both are valid and neither
       borrows the other's membership. */
    const away = texts(await showView(st, { kind: "binder", binderId: "bd2" }));
    assert(/Charizard/.test(away), "the second binder lost the card: " + away);
    assert(!/Mudkip/.test(away), "a binder borrowed another's membership");
  });

  test("a binder shows cards, never inventory", async () => {
    /* Binder.jsx has held since C3.4 that a binder says "this card belongs
       here" and must not quietly become a shelf. The collection views are where
       the shelf lives now; a named binder is not one of them. */
    const shown = texts(await showView(FULL(), { kind: "binder", binderId: "bd1" }));
    assert(!/OFFERED-1|KEPT-1/.test(shown), "a copy's certificate reached a binder: " + shown);
    assert(!/Offered|Not offered/.test(shown), "offering telemetry reached a binder: " + shown);
  });
});

/* ===================================================== B. search */
describe("B. Search looks at what is already yours", () => {
  test("[13] it filters the view on screen", async () => {
    const shown = texts(await showView(FULL(), { kind: "all" }, "mudkip"));
    assert(/Mudkip/.test(shown), "the match vanished: " + shown);
    assert(!/Charizard/.test(shown), "a non-match survived: " + shown);
  });

  test("it searches the set and the number too, and is case-insensitive", async () => {
    const st = FULL();
    assert(/Charizard/.test(texts(await showView(st, { kind: "all" }, "BASE SET"))), "set");
    assert(/Charizard/.test(texts(await showView(st, { kind: "all" }, "#4"))), "number");
  });

  test("[14] it is not catalog search: a card you have said nothing about is not found", async () => {
    const r = await showView(FULL(), { kind: "all" }, "Blastoise");
    const shown = texts(r);
    /* The empty sentence quotes what was typed, which is honest; what must not
       appear is a CARD for it. */
    eq(r.root.findAll((n) => n.props && n.props.className === "mcs-group").length, 0,
      "a card from the catalogue appeared: " + shown);
    assert(/Nothing here matches/.test(shown), "it did not say so honestly: " + shown);
    /* And structurally: this file asks the catalogue what cards are CALLED and
       never asks it to find one. */
    const src = code("client/collector/sections/Collection.jsx");
    const book = code("client/collector/card-descriptions.js");
    assert(/onBrowseCards\.describe\(/.test(book), "it stopped naming its cards");
    assert(/useCardDescriptions/.test(src), "the collection stopped naming its cards");
    for (const [where, text] of [["the collection", src], ["the description cache", book]]) {
      assert(!/browseQuery|card-contexts/.test(text), `${where} grew a catalogue query`);
    }
    assert(!/\.find\(\s*[`"']/.test(src), "the collection grew a catalogue query");
  });

  test("[15] clearing it restores the view exactly", async () => {
    const st = FULL();
    const before = texts(await showView(st, { kind: "all" }, ""));
    const during = texts(await showView(st, { kind: "all" }, "mudkip"));
    const after = texts(await showView(st, { kind: "all" }, ""));
    assert(before !== during, "the search did nothing at all");
    eq(after, before, "clearing the box did not restore the view");
  });

  test("[16] it persists nothing", async () => {
    const st = FULL();
    const before = JSON.stringify(st.get());
    await showView(st, { kind: "all" }, "mudkip");
    await showView(st, { kind: "trade" }, "charizard");
    eq(JSON.stringify(st.get()), before, "searching wrote to the world");
    const src = code("client/collector/sections/Collection.jsx");
    assert(!/execute|command|onSpecify\(/.test(src.slice(src.indexOf("const needle"),
      src.indexOf("const shown"))), "searching reached for a command");
  });

  test("the box is the shell's: filters compose with it, and a binder opened in place keeps it", () => {
    /* RE-PINNED AGAIN (Phase 6 P6-2). Search and the state filter are two
       halves of one question in Phase 6 ("Primary cards matching mudkip"), so
       changing the filter keeps what was typed and the result line says both.
       What the earlier pin protected still holds where it applies: opening a
       binder, or leaving one, is a change of SUBJECT, and the box is emptied —
       a filter the person did not type for this place is one they did not ask
       for. Still one useState, no storage, no URL. */
    const binder = code("client/collector/sections/Binder.jsx");
    assert(/useState\(""\)/.test(binder), "the query is not held above the views");
    assert(/query=\{query\}/.test(binder), "the opened binder is not given it");
    assert(!/localStorage|sessionStorage/.test(binder), "the query was persisted");
    assert(/onClick=\{\(\) => setLens\(id\)\}/.test(binder), "changing the filter touched the query");
    /* RESTATED (Phase 6 P6-3.1): there is no separate binder screen any
       more, so there is no change of place to empty the box. A binder opens
       IN PLACE under a row that has just said "1 match" — emptying the box as
       it opens would hide the very match the row promised. The query is not
       stored anywhere new: still one useState, never set by opening. */
    assert(!/setExpanded\([^)]*\);[^\n]*setQuery/.test(binder), "opening a binder in place threw the query away");
  });
});

/* ============================== C. every job Your Cards did, preserved */
describe("C. Nothing useful went with the tab", () => {
  test("[17][18] owned cards and their copies are still reachable", async () => {
    /* RESTATED (Phase 6 P6-2). The five view chips became state filters (All ·
       Primary · Secondary · PC · Trade / Sell) over Your Cards, which is on the
       Binders screen itself; each Goal and copy is a tile, and a copy's facts
       are reached through the Card Specification its tile opens. The rule this
       test protects is unchanged. */
    const r = await showShell(FULL());
    await press(r, "Binders");
    const tiles = r.root.findAll((n) => n.type === "li" && String(n.props.className || "").includes("mcs-otile"));
    const said = tiles.map((t) => instText(t).replace(/\s+/g, " "));
    assert(said.some((t) => /Trade \/ Sell/.test(t) && /Charizard/.test(t)), "the offered copy has no tile: " + said);
    assert(said.some((t) => /Owned/.test(t) && /Charizard/.test(t)), "the unsorted copy has no tile: " + said);
    /* RESTATED (P6-4, then P6-F4 B2B): each copy's tile opens ITS page, where its
       certificate is (an editable field). Every copy, one at a time. */
    const certs = [];
    for (const want of [/Trade \/ Sell/, /Owned|PC/]) {
      const t = r.root.findAll((n) => n.type === "li" && String(n.props.className || "").includes("mcs-otile"))
        .find((n) => want.test(instText(n)) && /Charizard/.test(instText(n)));
      await TR.act(async () => { t.findAll((n) => n.type === "button")[0].props.onClick({ preventDefault() {} }); });
      const page = r.root.findAll((n) => n.props && n.props.role === "dialog" && /^Your copy: /.test(String(n.props["aria-label"] || "")))[0];
      assert(page, "a copy's tile opens no page");
      certs.push(...page.findAll((n) => n.type === "input").map((n) => n.props.value));
      const back = page.findAll((n) => n.type === "button" && n.props.className === "mcs-cd-back")[0];
      await TR.act(async () => { back.props.onClick(); });
    }
    assert(certs.includes("OFFERED-1") && certs.includes("KEPT-1"), "a copy's cert is unreachable: " + certs);
  });

  test("every copy fact Your Cards showed is still shown", async () => {
    const st = world({ collectorCopies: [{ id: "k1", collectorId: "casey",
      canonicalCardId: "cc-a", grade: "PSA 9", offered: true, cert: "CERT-X",
      market: 2050, photos: PH, addedAt: AT }],
      interests: [{ partnerId: "nl", binderId: "k1", at: AT }] });
    const shown = texts(await showView(st, { kind: "all" }));
    /* "INTERESTED · <shop>" LEFT THIS LIST, AND NOT WITH THE TAB.

       The binders batch was right that absorbing Your Cards must not quietly
       lose a fact, and every fact it carried is still asserted here. This one
       went later and for a different reason: `setInterest` is the only command
       that writes an interest and it is not on the production surface, so the
       line rendered from rows production cannot produce. A fact the product
       cannot yet carry is not a fact a screen should claim. The row above still
       seeds one, so this is a real absence and not a vacuous assertion. */
    for (const fact of ["PSA 9", "CERT-X", "Offered"]) {
      assert(shown.includes(fact), `${fact} was lost with the tab: ` + shown);
    }
    assert(!/Interested/.test(shown), "a claim no command can produce came back: " + shown);
    assert(!shown.includes("Northline"), "a partner was named from an unreachable row");
    assert(/2,050/.test(shown), "the reference value was lost: " + shown);
    assert(/Photos/.test(shown), "the photo note was lost: " + shown);
  });

  test("[19] offered copies are still reachable, under their own view", async () => {
    /* RESTATED (Phase 6 P6-2). The five view chips became state filters (All ·
       Primary · Secondary · PC · Trade / Sell) over Your Cards, which is on the
       Binders screen itself; each Goal and copy is a tile, and a copy's facts
       are reached through the Card Specification its tile opens. The rule this
       test protects is unchanged. */
    const r = await showShell(FULL());
    await press(r, "Binders");
    await press(r, "Trade / Sell");
    const results = r.root.findAll((n) => n.props && n.props["aria-label"] === "Your Cards")[0];
    const shown = instText(results).replace(/\s+/g, " ");
    assert(/1 Trade \/ Sell card/.test(shown) && /Trade \/ Sell/.test(shown), "the offered copy is unreachable: " + shown);
    assert(!/Owned|Primary|Secondary/.test(shown.replace("1 Trade / Sell card", "")), "the view is not the offered ones: " + shown);
  });

  test("[20] the specification panel is still reachable from a card", async () => {
    /* RESTATED (Phase 6 P6-2). The five view chips became state filters (All ·
       Primary · Secondary · PC · Trade / Sell) over Your Cards, which is on the
       Binders screen itself; each Goal and copy is a tile, and a copy's facts
       are reached through the Card Specification its tile opens. The rule this
       test protects is unchanged. */
    const r = await showShell(FULL());
    await press(r, "Binders");
    const tile = r.root.findAll((n) => n.type === "button" && String(n.props.className || "").includes("mcs-otap"))[0];
    assert(tile, "no way into the panel");
    await TR.act(async () => { tile.props.onClick(); });
    assert(/Where it belongs|Are you looking|binder/i.test(texts(r)), "the panel did not open: " + texts(r));
    /* And it is the SAME panel, not a second editing grammar. */
    for (const rel of ["client/collector/sections/Collection.jsx", "client/collector/sections/Binder.jsx"]) {
      const src = code(rel);
      assert(/CardSpecification/.test(src), "a second editor appeared in " + rel);
      assert(!/addGoal|setCollectorCopyOffered|addBinderEntry/.test(src), rel + " names a command");
    }
  });
});

/* =========================================== D. the navigation */
describe("D. Four destinations", () => {
  test("[22][23] primary navigation is exactly the four", () => {
    /* RE-PINNED (Phase 6 P6-1): Deal Flow now precedes Trusted Partners. */
    eq(SHELL_MOD.SECTIONS.map((s) => s.id).join(","), "browse,binder,deal-flow,partners");
    eq(SHELL_MOD.SECTIONS.map((s) => s.label).join(" · "),
      "Browse · Binders · Deal Flow · Trusted Partners");
    assert(!SHELL_MOD.SECTIONS.some((s) => s.id === "my-cards"), "Your Cards is still a tab");
  });

  test("[24] all four are reachable, and each renders", async () => {
    const r = await showShell(FULL());
    for (const label of ["Browse", "Binders", "Trusted Partners", "Deal Flow"]) {
      await press(r, label);
      assert(texts(r).length > 0, `${label} rendered nothing`);
      assert(!/undefined|NaN|\[object Object\]/.test(texts(r)), `${label} leaked something`);
    }
  });

  test("[21][26] nothing depends on the removed destination", () => {
    const shell = code("client/collector/CollectorShell.jsx");
    assert(!/my-cards/.test(shell), "a dead branch for the old id remains");
    assert(!/MyCards/.test(shell), "the shell still names the old component");
    assert(!SHELL_MOD.DEFERRED_SECTIONS.some((s) => s.id === "my-cards"),
      "it was quietly parked in the deferred list instead");
    /* And no file anywhere still imports it. */
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of walk(path.join(ROOT, "client")).filter((f) => /\.jsx?$/.test(f))) {
      assert(!/sections\/MyCards/.test(fs.readFileSync(f, "utf8")),
        `${f} still imports the old path`);
    }
  });

  test("[25] the screen moved rather than being deleted", () => {
    assert(fs.existsSync(path.join(ROOT, "client/collector/sections/Collection.jsx")),
      "the component was deleted");
    assert(!fs.existsSync(path.join(ROOT, "client/collector/sections/MyCards.jsx")),
      "both names exist — one concept, one file");
    assert(/from "\.\/Collection\.jsx"/.test(code("client/collector/sections/Binder.jsx")),
      "nothing composes it, so it is a dead file rather than a moved job");
  });
});

/* ====================================== E. the truths stayed independent */
describe("E. Four facts, still four", () => {
  test("[30] no Goal gained a binder", () => {
    const st = FULL();
    for (const g of st.get().goals) {
      assert(!("binderId" in g), "a Goal grew a binder reference");
    }
    const commands = code("domain/metyet-commands.js");
    const body = commands.slice(commands.indexOf("addGoal(state"),
      commands.indexOf("updateGoalTier(state"));
    assert(!/binderId/.test(body), "addGoal grew a binder");
  });

  test("[7] a Goal in no binder is still a Goal, and still has its priority", async () => {
    const st = world({ goals: [{ id: "g1", collectorId: "casey", canonicalCardId: "cc-a",
      tier: "primary", desired: { grade: "PSA 9" }, createdAt: AT }] });
    const shown = texts(await showView(st, { kind: "primary" }));
    assert(/Charizard/.test(shown) && /Actively hunting/.test(shown), shown);
  });

  test("[32] no card-state enum, and no aggregate save", () => {
    for (const rel of ["client/collector/sections/Collection.jsx",
      "client/collector/sections/Binder.jsx", "client/collector/CollectorShell.jsx"]) {
      const src = code(rel);
      assert(!/cardState|CARD_STATE|\bintent\b\s*[:=]/.test(src), `${rel}: a card-state enum`);
      assert(!/saveCardSpecification|saveCard\(/.test(src), `${rel}: an aggregate save`);
    }
  });

  test("[27][28] PC is a filter now, and silence is still not given a state", () => {
    /* RESTATED (Phase 6 P6-2), AND THE FIRST HALF IS REVERSED ON PURPOSE.
       "There is still no PC view" held because a view is a different question
       from a fact, and nobody had asked for one. P6-2 asks for exactly that:
       the four states the doctrine names (Primary · Secondary · PC · Trade /
       Sell) are the Binders screen's filters, and the old chip list is gone.
       The second half is unchanged and still asserted: a copy that stated
       neither PC nor Trade / Sell is shown as Owned — a true fact — and is
       never given a disposition it did not state, and "Not offered" still
       reports nothing as an answer. */
    const binder = code("client/collector/sections/Binder.jsx");
    assert(/\["all", "All"\], \["primary", "Primary"\], \["secondary", "Secondary"\],\s*\["pc", "PC"\], \["trade", "Trade \/ Sell"\]/.test(binder),
      "the filters are not the four states and All");
    assert(/c\.offered === true \? "trade" : c\.keeping === true \? "pc" : "owned"/.test(binder),
      "a copy's state is not read straight off what it stated");
    assert(!("COLLECTION_VIEWS" in build("client/collector/sections/Collection.jsx")), "the chip list survived");
    const src = code("client/collector/sections/Collection.jsx");
    assert(!/Not offered/.test(src) && !/Not offered/.test(binder), "an absence is being reported as an answer again");
    assert(/keeping === true/.test(src) && /Keeping/.test(src),
      "a copy its owner is keeping cannot say so");
  });

  test("[29] no Smart or System binder is persisted, and no new durable fact", async () => {
    const st = FULL();
    const before = JSON.stringify(st.get());
    await showView(st, { kind: "all" });
    await showView(st, { kind: "primary" });
    await showView(st, { kind: "trade" });
    await showView(st, { kind: "binder", binderId: "bd1" });
    eq(JSON.stringify(st.get()), before, "looking at a view wrote something");
    eq(st.get().binders.length, 2, "a view became a binder");
    for (const b of st.get().binders) {
      assert(!b.smart && !b.system && !b.derived, "a binder grew a kind");
    }
  });
});

/* ============================== F. the boundary this batch did not cross */
describe("F. What did not move", () => {
  test("[39] the production allow-list is unchanged", () => {
    /* MARKET VALIDATION BATCH 3B opened the five price commands — opening an
       offer, countering, accepting, declining and withdrawing — with the screens
       that send them, so they left this list. Everything past an agreed price
       (trade, values, the final balance, fulfilment, Pending) is still shut. */
    /* THE TRANSACTION IS WHAT MUST STAY CLOSED, and it is. `reviewCopy`,
       `endReview` and `requestPhotos` left this loop when the qualification
       batch gave them a surface; everything that settles a value, reserves a
       card or advances a deal is still unreachable. */
    /* THE TRANSACTION IS WHAT MUST STAY CLOSED, and it is. `addCopyPhotos`
       left this loop when photo fulfilment gave the Trusted Partner a surface
       for answering a Collector's request; it supplies evidence about a card
       and settles nothing. */
    /* RE-PINNED (Batch 3C-1): 25 → 24. `addBinderEntry` left the door by
       name; any other change to the size still fails here. */
    /* RE-PINNED (Market Validation Batch 3B): 24 → 29. The five price
       commands joined the door with the Deal Flow and Opportunities controls
       that send them, each named in the allow-list; any other move still fails. */
    eq(EXPOSED_COMMANDS.length, 29, "a command was exposed that no batch declared");
    for (const closed of ["acceptMarketValue", "acceptDeal", "setCopyPending", "proposeFulfillment", "confirmHandoff"]) {
      assert(!EXPOSED_COMMANDS.includes(closed), `${closed} was exposed`);
    }
  });

  test("no migration, and no server or persistence change", () => {
    const migrations = fs.readdirSync(path.join(ROOT, "persistence/migrations"))
      .filter((f) => f.endsWith(".sql"));
    assert(migrations.every((f) => !/binder.*view|collection|cross/i.test(f)),
      "a migration for a derived view appeared: " + migrations.join(", "));
  });

  test("[38] Deal Flow stops at qualification", () => {
    /* RE-PINNED. Deal Flow was read-only because Inspect and Request Photos had
       no production surface, and a disabled control would have been a promise
       the product had not kept. It has exactly those two now — and the line it
       stops at has not moved: no price, no Market Value, no Pending, no offer,
       no message. What this asserts is that line, not the absence of buttons. */
    const src = code("client/collector/sections/DealFlow.jsx");
    for (const cmd of ["startOpportunity", "proposePrice", "acceptPrice",
      "acceptMarketValue", "acceptDeal", "setCopyPending", "proposeFulfillment"]) {
      assert(!src.includes(cmd), `Deal Flow names ${cmd}`);
    }
    /* And it reaches the server only through props the shell hands it. */
    assert(!/execute\s*\(|fetch\s*\(/.test(src),
      "Deal Flow talks to the server directly");
  });

  test("the collection reaches no partner, deal or private data", async () => {
    const st = FULL();
    const src = code("client/collector/sections/Collection.jsx");
    for (const field of ["state.opportunities", "state.discoveries", "state.inventory",
      "pendingFor", "agreedPrice"]) {
      assert(!src.includes(field), `the collection reads ${field}`);
    }
    /* `partners` is read, and only for a name against an interest. */
    const shown = texts(await showView(st, { kind: "all" }));
    assert(!/Northline/.test(shown) || /Interested/.test(shown),
      "a partner was named outside an interest: " + shown);
  });
});

/* ===========================================================================
   G — WHAT THE ADVERSARIAL PASS FOUND

   Every test here failed when it was written. They are the defects an
   adversarial review of the finished batch turned up, each one reproduced
   first and pinned after, so that the specific way this batch went wrong
   cannot come back quietly.
   ========================================================================= */
describe("phase5 binders — the adversarial pass", () => {
  const settle = async (r) => {
    for (let i = 0; i < 8; i += 1) {
      await TR.act(async () => { await new Promise((done) => setTimeout(done, 0)); });
    }
    return r;
  };
  const tap = async (r, label) => {
    const all = r.root.findAllByType("button");
    /* Exact first: a nav entry carries its count ("1 Binders") while a view
       chip is its label alone, and "My Binders" must never win a tap meant for
       the Binders tab. */
    const hit = all.find((n) => instText(n).trim() === label)
      || all.find((n) => instText(n).trim().endsWith(` ${label}`));
    assert(hit, `no button "${label}" among: `
      + r.root.findAllByType("button").map((n) => instText(n).trim()).join(" | "));
    await TR.act(async () => { hit.props.onClick(); });
    return settle(r);
  };
  /* The shell opens on Browse; Binders is where the views live. */
  const openBinders = async (st, onBrowseCards = door) => {
    const state = P.projectForActor(st.get(), ME);
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(SHELL, { state, onSignOut() {},
        onBrowseCards, onSpecify: async () => ({ ok: true }) }));
    });
    await settle(r);
    return tap(r, "Binders");
  };

  /* G1. Order was the contract Your Cards wrote down and this batch dropped:
     the keys came out in array order, which put the OLDEST card on top. */
  test("cards are most-recently-touched first, not array order", async () => {
    const st = world({ collectorCopies: [
      { id: "k1", collectorId: "casey", canonicalCardId: "cc-a", grade: "PSA 9",
        offered: false, addedAt: "2020-01-01" },
      { id: "k2", collectorId: "casey", canonicalCardId: "cc-b", grade: "PSA 9",
        offered: false, addedAt: "2023-01-01" },
      { id: "k3", collectorId: "casey", canonicalCardId: "cc-c", grade: "PSA 9",
        offered: false, addedAt: "2026-01-01" }] });
    const shown = texts(await showView(st, { kind: "all" }));
    const at = (name) => shown.indexOf(name);
    assert(at("Umbreon") < at("Mudkip") && at("Mudkip") < at("Charizard"),
      "oldest first — the screen invented a ranking: " + shown.slice(0, 160));
  });

  test("a card reached by several rows sorts by the most recent of them", async () => {
    const st = world({
      goals: [{ id: "g1", collectorId: "casey", canonicalCardId: "cc-a",
        tier: "primary", createdAt: "2026-06-01" }],
      collectorCopies: [{ id: "k1", collectorId: "casey", canonicalCardId: "cc-b",
        grade: "PSA 9", offered: false, addedAt: "2026-03-01" }] });
    const shown = texts(await showView(st, { kind: "all" }));
    assert(shown.indexOf("Charizard") < shown.indexOf("Mudkip"),
      "the newer goal sorted below the older copy: " + shown.slice(0, 160));
  });

  /* G2. A Goal named the legacy way had no reachable home on the whole
     Collector once Goals stopped being a destination. */
  test("a Goal carrying a legacy cardId is still visible", async () => {
    const st = world({
      catalog: [{ id: "lg1", name: "LegacyCard", set: "Old", num: "1" }],
      goals: [{ id: "g1", collectorId: "casey", cardId: "lg1", tier: "primary",
        createdAt: AT }] });
    for (const kind of ["all", "primary"]) {
      assert(/LegacyCard/.test(texts(await showView(st, { kind }))),
        `a legacy goal is missing from ${kind}`);
    }
    assert(!/LegacyCard/.test(texts(await showView(st, { kind: "secondary" }))),
      "a primary goal appeared under Secondary");
  });

  /* G3. The worst of them: the screen denied an offer that was live. */
  test("an owned copy with no card id is shown, not dropped", async () => {
    const st = world({ collectorCopies: [{ id: "k1", collectorId: "casey",
      grade: "PSA 9", offered: true, cert: "ORPHAN-1", addedAt: AT }] });
    assert(/ORPHAN-1/.test(texts(await showView(st, { kind: "all" }))),
      "an owned copy vanished because it had no card id");
    const trade = texts(await showView(st, { kind: "trade" }));
    assert(/ORPHAN-1/.test(trade),
      "Trade/Sell dropped a copy that is offered: " + trade.slice(0, 160));
    assert(!/not offering any of your (cards|copies)/.test(trade),
      "Trade/Sell denied an offer that Trusted Partners can see: " + trade.slice(0, 160));
  });

  /* G4. Ids are the server's and were never promised to be text. */
  test("a non-string card id does not take the screen down", async () => {
    const st = world({ goals: [{ id: "g1", collectorId: "casey", canonicalCardId: 7,
      tier: "primary", createdAt: AT }] });
    const shown = texts(await showView(st, { kind: "all" }));
    assert(typeof shown === "string", "the section crashed on a numeric id");
  });

  /* G5. Two live derivations of one fact gave two answers to it. */
  test("the library's count is the binder's own contents", async () => {
    /* RESTATED (Phase 6 P6-2): the binder section opens before its rows show,
       and an earlier filing counts once per card however many identical rows
       name it. */
    const st = world({
      binders: [{ id: "bd1", collectorId: "casey", name: "Mine", createdAt: AT,
        archivedAt: null }],
      binderEntries: [{ binderId: "bd1", canonicalCardId: "cc-b", addedAt: AT },
        { binderId: "bd1", canonicalCardId: "cc-b", addedAt: AT },
        { binderId: "bd1", canonicalCardId: null, addedAt: AT }] });
    const r = await openBinders(st);
    await tap(r, "Binders · 1");
    const library = texts(r);
    assert(/1 card\b/.test(library),
      "the library counted rows, not cards: " + library.slice(0, 400));
    const inside = texts(await showView(st, { kind: "binder", binderId: "bd1" }));
    assert(/Mudkip/.test(inside), "the binder did not hold the card it counted");
  });

  /* G6. The catalogue was re-asked on every chip press; the names of cards do
     not change while somebody decides which tab to look at. */
  test("moving between views does not re-ask the catalogue", async () => {
    /* RESTATED (Phase 6 P6-2): the presses are the state filters now. */
    let asks = 0;
    const counted = { describe: async (ids) => { asks += 1; return door.describe(ids); } };
    const r = await openBinders(FULL(), counted);
    for (const label of ["Primary", "Secondary", "PC", "Trade / Sell", "All", "Primary", "Trade / Sell", "All"]) {
      await tap(r, label);
    }
    assert(asks <= 2, `${asks} catalogue requests for 8 presses over 3 cards`);
  });

  /* G7. A search that followed you to a screen it could not filter. */
  test("the search box is only where it filters something", async () => {
    /* RESTATED (Phase 6 P6-2): the screen's one box now filters what is on it
       — Your Cards, Unfiled and the binders together — so it is always
       somewhere it filters something, and it is exactly one box. */
    const r = await openBinders(FULL());
    const boxes = () => r.root.findAllByType("input").filter((n) => n.props.type === "search");
    eq(boxes().length, 1, "one box for the screen");
    await TR.act(async () => { boxes()[0].props.onChange({ target: { value: "umbreon" } }); });
    await settle(r);
    assert(/1 card matching “umbreon”/.test(texts(r)), "it did not filter what is on screen: " + texts(r));
  });

  test("a query is kept as a binder opens in place, and the binder shows its matches", async () => {
    /* RESTATED (Phase 6 P6-2): a FILTER change keeps the query (they compose).
       RESTATED AGAIN (P6-3.1): opening a binder is no longer a change of
       place — it opens where it is — so the query stays, and what the
       closed row counted is exactly what the open binder shows. */
    const r = await openBinders(FULL());
    const box = () => r.root.findAllByType("input").find((n) => n.props.type === "search");
    await TR.act(async () => { box().props.onChange({ target: { value: "mudkip" } }); });
    await settle(r);
    await tap(r, "Primary");
    eq(box().props.value, "mudkip", "the filter dropped what was typed");
    await tap(r, "All");
    await tap(r, "Binders · 1");
    await settle(r);
    const row = r.root.findAll((n) => n.type === "button" && /^Mudkips/.test(instText(n).trim()))[0];
    assert(row, "no Mudkips binder row");
    assert(/1 match/.test(instText(row)), "the closed binder's match count is not true: " + instText(row));
    await TR.act(async () => { row.props.onClick(); });
    await settle(r);
    assert(!r.root.findAll((n) => n.type === "button" && /^Open Mudkips/.test(instText(n).trim())).length,
      "a second step to open the binder survived");
    eq(box().props.value, "mudkip", "opening the binder in place threw away what was typed");
    const open = r.root.findAll((n) => String(n.props.className || "").includes("mcs-bcover")
      && String(n.props.className || "").includes("open"))[0];
    assert(open, "the binder did not open");
    eq(open.findAll((n) => n.type === "li" && String(n.props.className || "").includes("mcs-otile")).length, 1,
      "the open binder does not show the one match its row counted");
  });

  /* G8. The shipped client described a shape this batch removed. */
  test("the client does not describe a navigation it no longer has", () => {
    const shell = fs.readFileSync(
      path.join(ROOT, "client", "collector", "CollectorShell.jsx"), "utf8");
    assert(!/FIVE TABS/.test(shell), "the shell still claims five tabs");
    const binder = fs.readFileSync(
      path.join(ROOT, "client", "collector", "sections", "Binder.jsx"), "utf8");
    assert(!/Your Cards is the shelf/.test(binder),
      "Binder still points at a destination that is gone");
  });

  /* G9. "You're offering 2 of 11" is the fact that says whether a short list
     is the whole story, and it went missing with the toggle it sat beside. */
  test("Trade/Sell still says how much of the shelf is on offer", async () => {
    const shown = texts(await showView(FULL(), { kind: "trade" }));
    assert(/You're offering \d+ of \d+ cop(y|ies)\./.test(shown),
      "the offered-of-owned count is gone: " + shown.slice(0, 200));
  });
});

if (require.main === module) run();
module.exports = {};
