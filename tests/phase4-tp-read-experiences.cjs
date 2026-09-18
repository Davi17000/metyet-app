/* ============================================================================
   PHASE 4 BATCH 5 — THE TRUSTED PARTNER READ EXPERIENCES

   Batch 4 put the Trusted Partner behind the door with three sections and
   enough in them to prove the boundary held. This batch makes those sections
   useful, and these tests are about the ways a useful screen can start lying:
   by matching a record to the wrong person, by borrowing one copy's money for
   another, by rounding an unfamiliar answer to a familiar one, or by filling a
   gap that the server left empty on purpose.

   TWO KINDS OF FIXTURE, DELIBERATELY.

   `REAL` is `projectForActor()` run over the demo seed for one partner — the
   actual output of the actual projection, so the shapes are not a memory of
   what the server sends. It is used ONLY as an input to the production
   components; nothing in `client/` imports any of it, which section F proves.
   It happens to contain three copies of the same Charizard bought at three
   different prices, which is the Acquisition Cost case exactly.

   Hand-built fixtures carry the adversarial cases — decoys, reversed order,
   unknown stages, ragged collections — because those must be constructed.

     A  identity: the actor's id, never row order
     B  relationships and goals: joined by identifier, never by position
     C  acquisition cost: the exact copy, and no arithmetic on it
     D  unknown values survive as themselves
     E  empty and ragged projections are ordinary
     F  no mutation, no demo, no prototype, no diagnostics
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const React = require("react");
const TR = require("react-test-renderer");

const ROOT = path.join(__dirname, "..");
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (rel) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const load = (rel, define = {}) => {
  const out = esbuild.buildSync({
    entryPoints: [path.join(ROOT, rel)],
    bundle: true, format: "cjs", write: false, logLevel: "silent", jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
    define: { "process.env.NODE_ENV": '"production"', ...define },
  });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};

const SHELL_MOD = load("client/tp/TrustedPartnerShell.jsx");
const Shell = SHELL_MOD.default;
const PRESENT = load("client/tp/present.js");

/* Every file the Trusted Partner surface is made of, found rather than listed,
   so a new section cannot join the product without joining these assertions. */
const TP_FILES = fs.readdirSync(path.join(ROOT, "client", "tp"), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory()
    ? fs.readdirSync(path.join(ROOT, "client", "tp", e.name)).map((f) => `client/tp/${e.name}/${f}`)
    : [`client/tp/${e.name}`]));

const PARTNER = "p-9k2m";

/* ---------------------------------------------------- the real projection */

const REAL = (() => {
  const out = esbuild.buildSync({
    entryPoints: [path.join(ROOT, "src", "MetYet.jsx")],
    bundle: true, format: "cjs", write: false, logLevel: "silent", jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
  });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  const { projectForActor } = require(path.join(ROOT, "domain", "metyet-projection.js"));
  return projectForActor(mod.exports.buildCanonicalSeed(), { partnerId: "p-self" });
})();

/* Taken HERE, before any test has rendered anything. Snapshotting inside the
   test that checks for mutation is worthless: by then other tests have already
   rendered this same object, so anything they changed is baked into the
   baseline and compares equal to itself. A break injection that wrote one
   field onto a row walked straight through exactly that mistake. */
const REAL_PRISTINE = JSON.stringify(REAL);

/* ---------------------------------------------------------- hand fixtures */

const EMPTY = Object.freeze({
  actor: { seat: "tp", partnerId: PARTNER },
  catalog: [], collectors: [], partners: [{ id: PARTNER, name: "Northline Cards" }],
  relationships: [], invitations: [], goals: [], preferences: [], inventory: [], binder: [],
  interests: [], opportunities: [], conversations: [], activity: [], photoRequests: [],
  copyReviews: [], counterparties: [],
});

/* --------------------------------------------------------------- renderers */

const render = (element) => {
  let r;
  TR.act(() => { r = TR.create(element); });
  return r;
};
/* What a person would READ. A <style> child is a string too, and the shell's
   stylesheet would otherwise satisfy half the assertions in this file. */
const texts = (r) => {
  const out = [];
  const walk = (n) => {
    if (n && n.type === "style") return;
    for (const c of (n && n.children) || []) {
      if (typeof c === "string" || typeof c === "number") out.push(String(c)); else walk(c);
    }
  };
  walk(r.toJSON());
  return out.join(" ");
};
const flat = (r) => texts(r).replace(/\s+/g, " ");
const buttons = (r) => r.root.findAll((n) => n.type === "button");
const instText = (node) => {
  const out = [];
  const walk = (n) => {
    if (typeof n === "string" || typeof n === "number") { out.push(String(n)); return; }
    if (!n || !Array.isArray(n.children)) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out.join(" ");
};
const clickText = (r, label) => {
  const button = buttons(r).find((n) => instText(n).includes(label));
  assert(button, `no button "${label}" among: ${buttons(r).map(instText).join(" | ")}`);
  TR.act(() => { button.props.onClick(); });
};
/* Renders the shell and lands on one section. */
const show = (state, section = null) => {
  const r = render(React.createElement(Shell, { state }));
  if (section) clickText(r, section);
  return r;
};
/* The rendered text of ONE record block, found by something in it. */
const recordWith = (r, needle) => {
  const article = r.root.findAll((n) => n.type === "article")
    .find((n) => instText(n).includes(needle));
  assert(article, `no record containing "${needle}"`);
  return instText(article).replace(/\s+/g, " ");
};

/* ============================================================== A */
describe("A. identity comes from the actor's id, never from row order", () => {
  test("a decoy partner record first in the list cannot rename the shop", () => {
    const state = { ...EMPTY, partners: [
      { id: "p-decoy", name: "Someone Else Cards" },
      { id: PARTNER, name: "Northline Cards" },
    ] };
    const shown = flat(show(state));
    assert(shown.includes("Northline Cards"), "the actor's own record: " + shown);
    assert(!shown.includes("Someone Else Cards"), "a decoy record was used: " + shown);
  });

  test("a decoy LAST is refused too — it is the id that decides, not an end", () => {
    const state = { ...EMPTY, partners: [
      { id: PARTNER, name: "Northline Cards" },
      { id: "p-decoy", name: "Someone Else Cards" },
    ] };
    const shown = flat(show(state));
    assert(shown.includes("Northline Cards") && !shown.includes("Someone Else Cards"), shown);
  });

  test("a partner list that does not contain the actor names nobody", () => {
    const state = { ...EMPTY, partners: [{ id: "p-decoy", name: "Someone Else Cards" }] };
    const shown = flat(show(state));
    assert(!shown.includes("Someone Else Cards"), "a stranger's name was used: " + shown);
    assert(!shown.includes(PARTNER), "or the raw id: " + shown);
    assert(shown.includes("Your workspace"), "and it says so neutrally: " + shown);
  });
});

/* ============================================================== B */
describe("B. every join is by identifier, never by position", () => {
  /* Two collectors; every related collection is in the OPPOSITE order, so a
     screen that paired row 0 with row 0 would attach each fact to the wrong
     person and still look plausible. */
  const TWO = Object.freeze({
    ...EMPTY,
    catalog: [{ id: "cardA", name: "Charizard", set: "Base Set" },
      { id: "cardB", name: "Blastoise", set: "Base Set" }],
    collectors: [{ id: "cA", name: "Ada Collector", city: "Leeds" },
      { id: "cB", name: "Bo Collector", city: "Cardiff" }],
    relationships: [
      { partnerId: PARTNER, collectorId: "cB", status: "accepted", at: "2023-02-02",
        note: "BO'S NOTE", last: "2026-02-02" },
      { partnerId: PARTNER, collectorId: "cA", status: "accepted", at: "2021-01-01",
        note: "ADA'S NOTE", last: "2026-01-01" },
    ],
    goals: [
      { id: "gB", collectorId: "cB", cardId: "cardB", tier: "secondary", note: "BO WANTS BLASTOISE" },
      { id: "gA", collectorId: "cA", cardId: "cardA", tier: "primary", note: "ADA WANTS CHARIZARD" },
    ],
    binder: [{ id: "bB1", collectorId: "cB" }, { id: "bB2", collectorId: "cB" }],
  });

  test("each collector's own relationship note, date and goals attach to them", () => {
    const r = show(TWO);
    const ada = recordWith(r, "Ada Collector");
    const bo = recordWith(r, "Bo Collector");

    assert(ada.includes("ADA'S NOTE"), "Ada's note: " + ada);
    assert(!ada.includes("BO'S NOTE"), "Bo's note landed on Ada: " + ada);
    assert(ada.includes("2021-01-01"), "Ada's relationship start: " + ada);
    assert(!ada.includes("2023-02-02"), "Bo's start landed on Ada: " + ada);
    assert(ada.includes("ADA WANTS CHARIZARD") && !ada.includes("BO WANTS BLASTOISE"),
      "goals crossed over: " + ada);

    assert(bo.includes("BO'S NOTE") && !bo.includes("ADA'S NOTE"), "notes crossed over: " + bo);
    assert(bo.includes("BO WANTS BLASTOISE"), bo);
    /* Two binder copies belong to Bo and none to Ada. */
    assert(/Binder copies 2/.test(bo), "Bo's binder count: " + bo);
    assert(!/Binder copies/.test(ada), "Ada was given a binder count she has not got: " + ada);
  });

  test("a relationship for somebody else's collector attaches to nobody", () => {
    const state = { ...TWO, relationships: [
      ...TWO.relationships,
      { partnerId: PARTNER, collectorId: "c-not-in-network", status: "accepted",
        at: "2020-01-01", note: "A NOTE ABOUT A STRANGER" },
    ] };
    const shown = flat(show(state));
    assert(!shown.includes("A NOTE ABOUT A STRANGER"), "a stranger's row was rendered: " + shown);
    assert(!shown.includes("c-not-in-network"), "or its id: " + shown);
  });

  test("the network list is the network — a counterparty is not a collector", () => {
    /* `counterparties` is bare identity for somebody named by a record but NOT
       in the network. They may label a deal; they may not appear as a
       relationship you have. */
    const state = { ...TWO,
      counterparties: [{ id: "cX", name: "Outside Network Person" }],
      opportunities: [{ id: "oX", collectorId: "cX", cardId: "cardA", stage: "deal", updated: "2026-03-03" }] };
    const network = flat(show(state));
    assert(!network.includes("Outside Network Person"), "an unrelated person is in the network: " + network);
    eq(buttons(show(state)).find((b) => instText(b).includes("Collector Network")) ? true : false, true);

    const deals = flat(show(state, "Opportunities"));
    assert(deals.includes("Outside Network Person"), "but they do label their own deal: " + deals);
  });

  test("an opportunity names the collector its own row names", () => {
    const state = { ...TWO, opportunities: [
      { id: "o1", collectorId: "cB", cardId: "cardB", stage: "deal", updated: "2026-05-05", listedPrice: 900 },
      { id: "o2", collectorId: "cA", cardId: "cardA", stage: "agree-price", updated: "2026-06-06", listedPrice: 4200 },
    ] };
    const r = show(state, "Opportunities");
    const first = recordWith(r, "Charizard");
    assert(first.includes("Ada Collector"), "the Charizard deal is Ada's: " + first);
    assert(!first.includes("Bo Collector"), first);
    const second = recordWith(r, "Blastoise");
    assert(second.includes("Bo Collector") && !second.includes("Ada Collector"), second);
  });
});

/* ============================================================== C */
describe("C. acquisition cost belongs to the exact copy", () => {
  /* Three copies of ONE card, three different costs and three different asks.
     This is the real seed, not an invention. */
  const charizards = REAL.inventory.filter((i) => i.cardId === "i1");

  test("the seed really does hold three copies of one card at three costs", () => {
    assert(charizards.length >= 3, `expected three copies, found ${charizards.length}`);
    const costs = new Set(charizards.map((c) => c.cost));
    eq(costs.size, charizards.length, "the copies do not have distinct costs; the test is toothless");
  });

  test("each copy shows its own cost, and never another copy's", () => {
    const r = show(REAL, "Inventory");
    for (const copy of charizards) {
      const record = recordWith(r, copy.cert);
      const mine = "$" + copy.cost.toLocaleString("en-US");
      assert(record.includes(mine), `${copy.invId} does not show its own cost ${mine}: ${record}`);
      for (const other of charizards) {
        if (other.invId === copy.invId) continue;
        const theirs = "$" + other.cost.toLocaleString("en-US");
        if (theirs === mine) continue;
        assert(!record.includes(theirs),
          `${copy.invId} borrowed ${other.invId}'s cost ${theirs}: ${record}`);
      }
    }
  });

  test("cost is looked up on the row, not by card identity", () => {
    const bare = TP_FILES.map(code).join("\n");
    /* A cost reached through a cardId-keyed map is the failure this forbids. */
    assert(!/cost.*\[.*cardId.*\]|byCard|costFor\s*\(/.test(bare),
      "a cost is being resolved through a card identity");
    assert(/copy\.cost/.test(bare), "the cost is read from the copy being rendered");
  });

  test("no margin, profit or market value is computed anywhere", () => {
    const r = show(REAL, "Inventory");
    const shown = flat(r);
    for (const copy of REAL.inventory.slice(0, 12)) {
      if (typeof copy.ask !== "number" || typeof copy.cost !== "number") continue;
      const margin = "$" + (copy.ask - copy.cost).toLocaleString("en-US");
      /* Only meaningful when the margin is not itself some other real figure. */
      const real = new Set(REAL.inventory.flatMap((i) => [i.ask, i.cost])
        .map((n) => "$" + Number(n).toLocaleString("en-US")));
      if (real.has(margin)) continue;
      assert(!shown.includes(margin), `a margin (${margin}) was computed for ${copy.invId}`);
    }
    assert(!/margin|profit|markup|market value/i.test(shown), "pricing language on screen: " + shown);
    /* `margin` is a CSS property before it is a business one, and the shell
       carries a stylesheet — so the word alone proves nothing. What is
       forbidden is the arithmetic, and the word used as an identifier rather
       than as a declaration (`margin:` or `margin-`). */
    const bare = TP_FILES.map(code).join("\n");
    assert(!/ask\s*[-+]\s*cost|cost\s*[-+]\s*ask|\bprofit\b|\bmarkup\b|\bmargin\b(?![-:])/i.test(bare),
      "arithmetic on money in source");
  });

  test("an opportunity shows the cost of the copy it is bound to, or none", () => {
    const state = { ...EMPTY,
      catalog: [{ id: "card1", name: "Charizard", set: "Base Set", grade: "PSA 9" }],
      collectors: [{ id: "c1", name: "Ada Collector" }],
      inventory: [
        { invId: "inv-cheap", cardId: "card1", cost: 100, ask: 500, cert: "CERT-CHEAP", status: "available" },
        { invId: "inv-dear", cardId: "card1", cost: 900, ask: 1500, cert: "CERT-DEAR", status: "committed" },
      ],
      opportunities: [
        { id: "oBound", collectorId: "c1", cardId: "card1", invId: "inv-dear", stage: "deal",
          updated: "2026-04-04", listedPrice: 1500 },
        { id: "oFree", collectorId: "c1", cardId: "card1", invId: null, stage: "agree-price",
          updated: "2026-03-03", listedPrice: 1500 },
      ] };
    const r = show(state, "Opportunities");
    const bound = recordWith(r, "CERT-DEAR");
    assert(bound.includes("$900"), "the bound copy's own cost: " + bound);
    assert(!bound.includes("$100"), "the other copy's cost was borrowed: " + bound);

    /* The unbound deal names no copy — not the plausible one of the same card. */
    const unbound = r.root.findAll((n) => n.type === "article")
      .map(instText).map((t) => t.replace(/\s+/g, " "))
      .find((t) => !t.includes("CERT-DEAR"));
    assert(unbound, "the unbound opportunity did not render");
    assert(!unbound.includes("CERT-CHEAP") && !unbound.includes("$100"),
      "a copy was chosen for an opportunity that names none: " + unbound);
    assert(!/Your copy/.test(unbound), "and no copy line was drawn at all: " + unbound);
  });
});

/* ============================================================== D */
describe("D. unknown values survive as themselves", () => {
  test("an unfamiliar opportunity stage is shown verbatim and marked unfamiliar", () => {
    const state = { ...EMPTY,
      collectors: [{ id: "c1", name: "Ada Collector" }],
      catalog: [{ id: "card1", name: "Charizard" }],
      opportunities: [{ id: "oX", collectorId: "c1", cardId: "card1",
        stage: "escrow-hold", updated: "2026-07-07" }] };
    const shown = flat(show(state, "Opportunities"));
    assert(shown.includes("escrow-hold"), "the stage vanished: " + shown);
    assert(!/Agree on Price|Select Trade|Value Trade|Fulfillment/.test(shown),
      "it was coerced to a known stage: " + shown);
    assert(/not a stage this version knows/.test(shown), "and is not passed off as familiar: " + shown);
    eq(PRESENT.stageLabel("escrow-hold"), "escrow-hold");
    eq(PRESENT.isKnownStage("escrow-hold"), false);
  });

  test("an unfamiliar stage is not sorted as though it had a position", () => {
    /* Ordering is by DATE, so a stage with no place in a known order still has
       a place in the list. Newest first. */
    const state = { ...EMPTY,
      collectors: [{ id: "c1", name: "Ada Collector" }],
      catalog: [{ id: "k", name: "Known" }, { id: "u", name: "Unknown" }],
      opportunities: [
        { id: "old", collectorId: "c1", cardId: "k", stage: "deal", updated: "2026-01-01" },
        { id: "new", collectorId: "c1", cardId: "u", stage: "escrow-hold", updated: "2026-09-09" },
      ] };
    const shown = flat(show(state, "Opportunities"));
    assert(shown.indexOf("Unknown") < shown.indexOf("Known"),
      "the newer deal is not first: " + shown);
  });

  test("an unfamiliar copy status is shown verbatim, not rounded to available", () => {
    const state = { ...EMPTY,
      catalog: [{ id: "card1", name: "Charizard", set: "Base Set", grade: "PSA 9" }],
      inventory: [{ invId: "inv1", cardId: "card1", status: "impounded", ask: 400, cost: 100 }] };
    const shown = flat(show(state, "Inventory"));
    assert(shown.includes("impounded"), "the status vanished: " + shown);
    assert(!/Available|Committed|Sold|Traded/.test(shown), "it was rounded: " + shown);
    eq(PRESENT.statusLabel("impounded"), "impounded");
  });

  test("raw and graded are the catalogue's answer, each shown as it stands", () => {
    eq(PRESENT.gradeLine({ grade: "PSA 9" }), "PSA 9");
    eq(PRESENT.gradeLine({ grade: "Raw", condition: "Near Mint" }), "Raw · Near Mint");
    eq(PRESENT.gradeLine({ grade: "Raw" }), "Raw");
    eq(PRESENT.gradeLine({ grade: null, condition: "Lightly Played" }), "Lightly Played");
    eq(PRESENT.gradeLine({}), null, "nothing is invented for a card with neither");
    eq(PRESENT.isGraded({ grade: "Raw", condition: "Near Mint" }), false);
    eq(PRESENT.isGraded({ grade: "PSA 10" }), true);

    const state = { ...EMPTY,
      catalog: [{ id: "g", name: "Graded One", grade: "PSA 10" },
        { id: "r", name: "Raw One", grade: "Raw", condition: "Near Mint" }],
      inventory: [{ invId: "i-g", cardId: "g", cert: "CERT-G", status: "available" },
        { invId: "i-r", cardId: "r", cert: "SER-R", status: "available" }] };
    const r = show(state, "Inventory");
    const graded = recordWith(r, "Graded One");
    const raw = recordWith(r, "Raw One");
    assert(graded.includes("PSA 10") && /Cert/.test(graded), "graded copy: " + graded);
    assert(raw.includes("Raw · Near Mint"), "raw copy: " + raw);
    assert(!raw.includes("PSA"), "a raw copy was described as graded: " + raw);
  });

  test("an unfamiliar goal tier is shown as itself", () => {
    eq(PRESENT.tierLabel("primary"), "Primary goal");
    eq(PRESENT.tierLabel("aspirational"), "aspirational");
    eq(PRESENT.tierLabel(null), null);
  });
});

/* ============================================================== E */
describe("E. empty and ragged projections are ordinary cases", () => {
  const sections = ["Collector Network", "Inventory", "Opportunities"];

  test("an empty account renders all three sections, each with a sentence", () => {
    const r = show(EMPTY);
    assert(/No collectors in your network yet/.test(flat(r)), flat(r));
    clickText(r, "Inventory");
    assert(/Nothing in your inventory yet/.test(flat(r)), flat(r));
    clickText(r, "Opportunities");
    assert(/Nothing in progress yet/.test(flat(r)), flat(r));
    assert(!/undefined|NaN|\[object/.test(flat(r)), "something leaked: " + flat(r));
  });

  test("a projection missing collections entirely survives all three sections", () => {
    const bare = { actor: { seat: "tp", partnerId: PARTNER }, partners: [{ id: PARTNER, name: "Northline Cards" }] };
    const r = show(bare);
    for (const s of sections) { clickText(r, s); assert(flat(r).length > 0, `${s} rendered nothing`); }
    assert(flat(r).includes("Northline Cards"), "and the shop is still named");
  });

  test("rows missing optional fields render what is there and omit what is not", () => {
    const state = { ...EMPTY,
      collectors: [{ id: "c1", name: "Ada Collector" }],
      relationships: [{ partnerId: PARTNER, collectorId: "c1", status: "accepted" }],
      catalog: [],
      inventory: [{ invId: "inv1", cardId: "missing-from-catalogue", status: "available" }],
      opportunities: [{ id: "o1", collectorId: "c1" }] };
    const r = show(state);
    const ada = recordWith(r, "Ada Collector");
    assert(!/In your network since/.test(ada), "a start date was invented: " + ada);
    assert(!/Last contact/.test(ada), "a last contact was invented: " + ada);
    assert(!/Your note/.test(ada), "a note was invented: " + ada);

    clickText(r, "Inventory");
    const copy = flat(r);
    assert(copy.includes("A card not in your catalogue"), "an orphan copy vanished: " + copy);
    assert(!/Your cost|Ask\b/.test(copy), "money was invented: " + copy);

    clickText(r, "Opportunities");
    const deal = flat(r);
    assert(deal.includes("Ada Collector"), "the deal lost its collector: " + deal);
    assert(!/Listed|Agreed|Last moved/.test(deal), "figures were invented: " + deal);
  });

  test("ragged rows — nulls, wrong types, missing ids — do not take the product down", () => {
    const ragged = { ...EMPTY,
      collectors: [null, { id: "c1" }, { name: "No Id Person" }],
      relationships: [null, {}],
      goals: [null, { id: "g", collectorId: "c1" }],
      catalog: [null, { id: null, name: "Nameless" }],
      inventory: [null, { invId: "x" }, {}],
      opportunities: [null, { id: "o" }, { id: "o2", stage: 7 }],
      binder: "not an array", counterparties: null };
    const r = show(ragged);
    for (const s of sections) { clickText(r, s); assert(flat(r).length > 0, `${s} rendered nothing`); }
    assert(!/\[object Object\]|undefined|NaN/.test(flat(r)), "something leaked: " + flat(r));
  });

  test("the whole real projection renders in every section", () => {
    const r = show(REAL);
    const network = flat(r);
    assert(network.includes("Sarah Mendel"), "the real network: " + network.slice(0, 200));
    clickText(r, "Inventory");
    assert(flat(r).includes("Charizard"), "the real shelf");
    clickText(r, "Opportunities");
    assert(/Agree on Price|Select Trade|Value Trade|Deal|Fulfillment/.test(flat(r)), "the real deals");
    assert(!/\[object Object\]|undefined|NaN/.test(flat(r)), "something leaked");
  });
});

/* ============================================================== F */
describe("F. no mutation, no demo, no prototype, no diagnostics", () => {
  test("nothing under client/tp reaches a store, a domain, a network or storage", () => {
    assert(TP_FILES.length >= 5, "the file list did not find the sections: " + TP_FILES.join(", "));
    for (const rel of TP_FILES) {
      const bare = code(rel);
      assert(!/from ["'][^"']*domain\/|require\(["'][^"']*domain\//.test(bare), `${rel} imports domain`);
      assert(!/projectForActor|buildCanonicalSeed|createStore|prototypeRuntime|systemRuntime/.test(bare),
        `${rel} projects, seeds or runs a runtime`);
      assert(!/\bfetch\s*\(|XMLHttpRequest|EventSource|WebSocket/.test(bare), `${rel} reaches the network`);
      assert(!/store\.|session\.|api\.|createApiClient|createProductionStore/.test(bare),
        `${rel} holds a store, a session or an api client`);
      assert(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(bare), `${rel} persists something`);
      assert(!/MetYetPrototype|MetYetCollector|demo-flag|dev-flag|src\/MetYet|shell\//.test(bare),
        `${rel} reaches the demo or the prototype`);
      /* PHASE 5 BATCH 1: Shop Profile has a form, so `onSubmit` and `onChange`
         are no longer evidence of anything. What stays forbidden is reaching a
         mutation WITHOUT a callback — spelling a command, calling execute, or
         going to the network — which the assertions above and below cover. A
         form handler that ends in a prop is the intended shape. */
      assert(!/execute\s*\(|\.command\s*\(|updatePartnerProfile/.test(bare),
        `${rel} reaches a command path by itself`);
    }
  });

  test("one file holds the only form, and every other section has none", () => {
    for (const rel of TP_FILES) {
      if (/sections\/Profile\.jsx$/.test(rel)) continue;
      assert(!/onSubmit|onChange|<input|<textarea/.test(code(rel)), `${rel} grew a way to type`);
    }
    assert(/onSubmit/.test(code("client/tp/sections/Profile.jsx")), "the one form went missing");
    /* Inventory renders that component rather than repeating it: there is one
       profile implementation in this product, and moving where it is reached
       from did not make a second. */
    const inventory = code("client/tp/sections/Inventory.jsx");
    assert(/from ["']\.\/Profile\.jsx["']/.test(inventory), "Inventory does not reuse the profile");
    assert(!/FIELDS\s*=|patchFrom|draftFrom|AMBIGUOUS|CERTAIN/.test(inventory),
      "Inventory reimplemented part of the profile");
  });

  test("the projection handed in is never edited, by any section, ever", () => {
    /* Compared against the snapshot taken at load, so this covers every render
       this whole file has performed — not just the three below. */
    const r = show(REAL);
    clickText(r, "Inventory");
    clickText(r, "Opportunities");
    clickText(r, "Collector Network");
    eq(JSON.stringify(REAL), REAL_PRISTINE, "a section mutated the projection it was given");
  });

  test("the only controls on a read section are the three sections and sign out", () => {
    const labels = buttons(show(REAL)).map(instText);
    eq(labels.length, 4, "an extra control appeared: " + labels.join(" | "));
    assert(labels.some((l) => l.includes("Sign out")), labels.join(" | "));
    /* Inventory adds exactly one: the way to the shop, and nothing that
       changes a copy. */
    const onInventory = buttons(show(REAL, "Inventory")).map(instText);
    eq(onInventory.length, 5, "Inventory grew a control: " + onInventory.join(" | "));
    assert(onInventory.some((l) => l.includes("View shop")), onInventory.join(" | "));
  });

  test("Batch 3's diagnostics have not come back", () => {
    const r = show(REAL);
    for (const section of ["Inventory", "Opportunities"]) {
      const shown = flat(r);
      assert(!/\bversion \d+/.test(shown), "the world version is on screen: " + shown);
      assert(!shown.includes("p-self"), "the raw partner id is on screen: " + shown);
      /* Raw canonical collection names dumped as labels was the Batch 3 shape. */
      ["counterparties", "photoRequests", "copyReviews", "catalog", "preferences", "interests"]
        .forEach((name) => assert(!shown.includes(name), `a raw collection name is a label: ${name}`));
      clickText(r, section);
    }
  });

  test("the production bundle still carries no seed, persona or domain", () => {
    const bundle = esbuild.buildSync({
      entryPoints: [path.join(ROOT, "app-src", "main.jsx")],
      bundle: true, format: "esm", write: false, logLevel: "silent", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"', __METYET_DEV__: "false", __METYET_DEMO__: "false",
        __METYET_API_URL__: '""', __METYET_SUPABASE_URL__: '""', __METYET_SUPABASE_KEY__: '""' },
    }).outputFiles[0].text;
    ["buildCanonicalSeed", "CARDS_SEED", "PARTNERS_SEED", "prototypeRuntime", "projectForActor",
      "Switch persona", "Reset demo", "demoDealFixture", "MetYetPrototype", "MetYetCollector",
      "Sarah Mendel", "Casey Lin", "p-self", "Pilot workspace"]
      .forEach((needle) => assert(!bundle.includes(needle), `the production bundle contains "${needle}"`));
  });

  test("the demo is untouched and still has no production dependency", () => {
    ["shell/MetYetPrototype.jsx", "src/MetYet.jsx", "collector/MetYetCollector.jsx", "site-src/main.jsx"]
      .forEach((rel) => assert(!/client\/|app-src/.test(code(rel)), `${rel} reaches production`));
    const bundle = esbuild.buildSync({
      entryPoints: [path.join(ROOT, "site-src", "main.jsx")],
      bundle: true, format: "esm", write: false, logLevel: "silent", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"', __METYET_DEV__: "false", __METYET_DEMO__: "true" },
    }).outputFiles[0].text;
    ["supabase", "auth/v1", "Bearer ", "refresh_token", "/api/view", "/api/commands"]
      .forEach((needle) => assert(!bundle.includes(needle), `the demo bundle contains "${needle}"`));
  });

  test("no dependency was added for any of this", () => {
    const pkg = JSON.parse(src("package.json"));
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    assert(!Object.keys(all).some((d) => /supabase|axios|swr|react-query|tanstack|router|redux|zustand|mui|chakra|antd/.test(d)),
      "a client library was added");
  });
});

run();
