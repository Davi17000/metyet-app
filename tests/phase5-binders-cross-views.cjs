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

  test("the box is the shell's, and a change of view empties it", () => {
    /* RE-PINNED. This used to assert that the query SURVIVED a change of view,
       on the reasoning that the box lives above the component. It does live
       there — but carrying the text along meant pressing a chip could land on a
       populated view showing "Nothing here matches", and opening a binder could
       make a full binder look empty. Held above the views, so one box serves
       all of them; emptied when the subject changes, because a filter the
       person did not type for THIS view is a filter they did not ask for. Still
       one `useState`, no storage, no URL. */
    const binder = code("client/collector/sections/Binder.jsx");
    assert(/useState\(""\)/.test(binder), "the query is not held above the views");
    assert(/query=\{query\}/.test(binder), "the views are not given it");
    assert(!/localStorage|sessionStorage/.test(binder), "the query was persisted");
    assert(/chooseView = \(id\) => \{[^}]*setQuery\(""\)/.test(binder),
      "changing view carried the old query along");
  });
});

/* ============================== C. every job Your Cards did, preserved */
describe("C. Nothing useful went with the tab", () => {
  test("[17][18] owned cards and their copies are still reachable", async () => {
    const r = await showShell(FULL());
    await press(r, "Binders");
    await press(r, "All Cards");
    const shown = texts(r);
    assert(/Charizard/.test(shown), "the owned card is unreachable: " + shown);
    assert(/OFFERED-1/.test(shown) && /KEPT-1/.test(shown), "a copy is unreachable: " + shown);
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
    const r = await showShell(FULL());
    await press(r, "Binders");
    await press(r, "Trade/Sell");
    const shown = texts(r);
    assert(/OFFERED-1/.test(shown), "the offered copy is unreachable: " + shown);
    assert(!/KEPT-1/.test(shown), "the view is not the offered ones");
  });

  test("[20] the specification panel is still reachable from a card", async () => {
    const r = await showShell(FULL());
    await press(r, "Binders");
    await press(r, "All Cards");
    const open = buttons(r).find((b) => instText(b).trim() === "Open");
    assert(open, "no way into the panel: " + buttons(r).map(instText).join(" | "));
    await press(r, "Open");
    assert(/Where it belongs|Are you looking|binder/i.test(texts(r)),
      "the panel did not open: " + texts(r));
    /* And it is the SAME panel, not a second editing grammar. */
    const src = code("client/collector/sections/Collection.jsx");
    assert(/CardSpecification/.test(src), "a second editor appeared");
    assert(!/addGoal|setCollectorCopyOffered|addBinderEntry/.test(src),
      "the collection names a command");
  });
});

/* =========================================== D. the navigation */
describe("D. Four destinations", () => {
  test("[22][23] primary navigation is exactly the four", () => {
    eq(SHELL_MOD.SECTIONS.map((s) => s.id).join(","), "browse,binder,partners,deal-flow");
    eq(SHELL_MOD.SECTIONS.map((s) => s.label).join(" · "),
      "Browse · Binders · Trusted Partners · Deal Flow");
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

  test("[27][28] there is still no PC view, and silence is no longer labelled", () => {
    const views = build("client/collector/sections/Collection.jsx").COLLECTION_VIEWS;
    eq(views.map((v) => v.id).join(","), "binders,all,primary,secondary,trade",
      "the view list changed");
    for (const v of views) {
      assert(!/\bPC\b|Personal Collection/i.test(v.label), `a PC view appeared: ${v.label}`);
    }
    const src = code("client/collector/sections/Collection.jsx");
    assert(!/personal ?collection/i.test(src), "the file names a Personal Collection");
    /* RE-PINNED, AND THE REASON IS THE POINT OF THE BATCH.

       This used to require the words "Not offered" on a copy's row, because at
       the time that was the honest thing to say: MetYet had no fact for "I am
       keeping this", so the most it could report was that no offer existed.

       PC is now a positive statement with its own command, so the old label has
       become the dishonest one — it described a decision and an absence in the
       same words. The row now says "Offered" or "Keeping" when somebody has
       said one of them, and says NOTHING when nobody has. A view is still a
       different question from a fact, and there is still no PC view. */
    assert(!/Not offered/.test(src), "an absence is being reported as an answer again");
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
    /* THE TRANSACTION IS WHAT MUST STAY CLOSED, and it is. `reviewCopy`,
       `endReview` and `requestPhotos` left this loop when the qualification
       batch gave them a surface; everything that settles a value, reserves a
       card or advances a deal is still unreachable. */
    /* THE TRANSACTION IS WHAT MUST STAY CLOSED, and it is. `addCopyPhotos`
       left this loop when photo fulfilment gave the Trusted Partner a surface
       for answering a Collector's request; it supplies evidence about a card
       and settles nothing. */
    eq(EXPOSED_COMMANDS.length, 23, "a command was exposed that no batch declared");
    for (const closed of ["startOpportunity", "proposePrice", "acceptPrice",
      "acceptMarketValue", "acceptDeal", "setCopyPending", "cancelOpportunity",
      "proposeFulfillment", "confirmHandoff"]) {
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
    const st = world({
      binders: [{ id: "bd1", collectorId: "casey", name: "Mine", createdAt: AT,
        archivedAt: null }],
      binderEntries: [{ binderId: "bd1", canonicalCardId: "cc-b", addedAt: AT },
        { binderId: "bd1", canonicalCardId: "cc-b", addedAt: AT },
        { binderId: "bd1", canonicalCardId: null, addedAt: AT }] });
    const library = texts(await openBinders(st));
    assert(/1 card\b/.test(library),
      "the library counted rows, not cards: " + library.slice(0, 200));
    const inside = texts(await showView(st, { kind: "binder", binderId: "bd1" }));
    assert(/Mudkip/.test(inside), "the binder did not hold the card it counted");
  });

  /* G6. The catalogue was re-asked on every chip press; the names of cards do
     not change while somebody decides which tab to look at. */
  test("moving between views does not re-ask the catalogue", async () => {
    let asks = 0;
    const counted = { describe: async (ids) => { asks += 1; return door.describe(ids); } };
    const r = await openBinders(FULL(), counted);
    for (const label of ["All Cards", "Primary Goals", "Secondary Goals", "Trade/Sell",
      "My Binders", "All Cards", "Trade/Sell", "All Cards"]) {
      await tap(r, label);
    }
    assert(asks <= 2, `${asks} catalogue requests for 8 presses over 3 cards`);
  });

  /* G7. A search that followed you to a screen it could not filter. */
  test("the search box is only where it filters something", async () => {
    const r = await openBinders(FULL());
    const boxes = () => r.root.findAllByType("input")
      .filter((n) => n.props.type === "search");
    eq(boxes().length, 0, "the binder library offered a search that does nothing");
    await tap(r, "All Cards");
    eq(boxes().length, 1, "a collection view lost its search box");
  });

  test("a query does not survive a change of view", async () => {
    const r = await openBinders(FULL());
    await tap(r, "All Cards");
    const box = r.root.findAllByType("input").find((n) => n.props.type === "search");
    await TR.act(async () => { box.props.onChange({ target: { value: "mudkip" } }); });
    await settle(r);
    assert(/Mudkip/.test(texts(r)), "the query did not filter");
    await tap(r, "Trade/Sell");
    const after = r.root.findAllByType("input").find((n) => n.props.type === "search");
    eq(after.props.value, "", "a stale query followed the person to another view");
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
