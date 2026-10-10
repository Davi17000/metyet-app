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
/* `reply` is what the server answers each Add: a value, a promise, or a throw. */
const card = (props = {}, reply = () => ({ ok: true, value: "new-id" })) => {
  let r;
  const seen = { closed: 0, steps: [], saves: [], added: [] };
  TR.act(() => {
    r = TR.create(React.createElement(CardDetail, { context: { ...MUDKIP, cards: TWO }, state: STATE(), backLabel: "Mudkip",
      position: 1, total: 3, onStep: (d) => seen.steps.push(d), onClose: () => { seen.closed += 1; },
      onSave: (step, canonicalCardId) => { seen.saves.push({ step, canonicalCardId }); return reply(step); },
      onAdded: (ack, printing) => seen.added.push({ ack, id: printing.canonicalCardId }), ...props }));
  });
  return { r, seen };
};
/* a question's choice, by its title */
const choiceNamed = (r, title) => cls(r, "mcs-cd-choice").find((b) => b.type === "button"
  && (b.findAll((x) => x.type === "b")[0] || { children: [] }).children.join("") === title);
const pick = async (r, ...titles) => {
  for (const t of titles) { const b = choiceNamed(r, t); assert(b, `no choice "${t}": ${flat(r)}`); await tap(b); }
};
const addButton = (r) => cls(r, "mcs-cd-add")[0];
const versions = (r) => cls(r, "mcs-cd-wrap")[0] ? cls(r, "mcs-cd-wrap")[0].findAll((n) => n.type === "button") : [];

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
    eq(versions(r).map((b) => b.props["aria-pressed"]).join(","), "false,false");
    assert(!/What does this card mean to you\?/.test(flat(r)), "a question came before the version");
    eq(cls(r, "mcs-cd-add")[0].props["aria-disabled"], true, "Add was ready before a version was chosen");
  });
  test("choosing one marks it, reveals the next question, and says the picture is the card's", async () => {
    const { r } = card({ state: {} });
    assert(!/may look different/.test(flat(r)));
    await pick(r, "Reverse Holo");
    eq(versions(r).map((b) => b.props["aria-pressed"]).join(","), "false,true");
    assert(/Card picture — this version may look different\./.test(flat(r)), flat(r));
    assert(cls(r, "mcs-cd-frame")[0].props.className.includes("rev"), "the reverse holo wears no sheen");
    /* Stage 2.1: what the card IS comes next — never what it means */
    assert(/Which version\? Normal Reverse Holo Raw or graded\? Raw Graded/.test(flat(r)), flat(r));
    assert(!/What does this card mean to you\?/.test(flat(r)), "the collecting state came before the physical card");
    eq(addButton(r).props["aria-disabled"], true, "a version alone readied Add");
  });
  test("one printing is said, not asked; none is \"MetYet can't record this card yet.\"", () => {
    const one = card({ context: { ...MUDKIP, cards: [TWO[0]] } });
    assert(/Normal — the only version of this card\./.test(flat(one.r)), flat(one.r));
    eq(versions(one.r).length, 0, "one printing was asked");
    assert(/Raw or graded\?/.test(flat(one.r)), "the one printing was not taken as chosen");
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
  const browse = (extra = {}) => {
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
        onSpecify: async (step, id) => { calls.push(["specify", step, id]); return { ok: true, value: "new" }; },
        onBrowseCards: door, ...extra });
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
  const search = async (b) => {
    await b.draw();
    const input = b.r.root.findAll((n) => n.type === "input").find((n) => n.props["aria-label"] === "Search");
    await TR.act(async () => { input.props.onChange({ target: { value: "mudkip" } }); });
    await settle(); await b.draw(); await settle();
  };
  test("after a saved Add: back to the same Browse, with the prototype's note and the card marked", async () => {
    const b = browse();
    await search(b);
    const finds = b.calls.filter((c) => c[0] === "find").length;
    const sessionBefore = JSON.stringify(b.session);
    await tap(btns(b.r).find((x) => x.props["aria-label"] === "Mudkip, Ruby & Sapphire #60"));
    await pick(b.r, "Raw", "Near Mint", "I own it", "Personal collection");
    await tap(addButton(b.r));
    eq(JSON.stringify(b.calls.filter((c) => c[0] === "specify")), JSON.stringify([["specify",
      { kind: "record-copy", copy: { grade: "Raw", condition: "Near Mint", offered: false, keeping: true } }, "k-ctx-60"]]));
    await TR.act(async () => { await new Promise((done) => setTimeout(done, 1000)); });
    await settle();
    eq(cls(b.r, "mcs-cd").length, 0, "the card did not return to Browse");
    const note = cls(b.r, "mcs-d-ack")[0];
    assert(note, "no acknowledgement on Browse");
    eq(flat(note), "Personal collection ✓ Mudkip #60 · Raw · Near Mint · Normal MetYet remembered this one. Only you can see it.");
    const cell = btns(b.r).find((x) => x.props["aria-label"] === "Mudkip, Ruby & Sapphire #60");
    assert(cell.props.className.split(" ").includes("just"), "the card was not marked");
    eq(b.calls.filter((c) => c[0] === "find").length, finds, "the grid was fetched again");
    eq(JSON.stringify(b.session), sessionBefore, "the Browse session was rewritten");
    /* and the next card's dock no longer explains itself (prototype seenAddHint) */
    await tap(cell);
    assert(!/wakes up as you answer/.test(flat(b.r)), flat(b.r));
  });
  test("filling a binder keeps Stage 1's door: no questions, Add opens the form with that binder", async () => {
    const b = browse({ fillingBinder: { binderId: "b1", name: "Mudkip" } });
    await search(b);
    await tap(btns(b.r).find((x) => x.props["aria-label"] === "Mudkip, Ruby & Sapphire #60"));
    assert(!/What does this card mean to you\?/.test(flat(b.r)), "the questions appeared while filling a binder");
    assert(/For now, Add opens MetYet's current card form\./.test(flat(b.r)), flat(b.r));
    await tap(addButton(b.r));
    assert(/Are you looking for it\?/.test(flat(b.r)), "the form did not open");
    eq(b.calls.filter((c) => c[0] === "specify").length, 0, "opening the form wrote something");
  });
});

/* ============================================================== E */
describe("E. guided configuration (Stage 2)", () => {
  test("domain vocabulary: the card's grades and conditions are exactly the domain's", () => {
    const D = require("../domain/metyet-domain.js");
    const { GRADES, CONDITIONS } = load("client/collector/CardDetail.jsx");
    eq(JSON.stringify(GRADES.slice().sort()), JSON.stringify(D.GRADED_VALUES.filter((g) => g !== "Raw").slice().sort()));
    eq(JSON.stringify(CONDITIONS), JSON.stringify(D.CONDITION_VALUES));
  });
  /* THE FOUNDER-APPROVED ORDER (Stage 2.1): version → raw or graded →
     condition or grade → what it means → Primary / Secondary or PC / Trade. */
  const order = (r) => cls(r, "mcs-cd-q").map((q) => q.props["data-q"]).join(" ");
  test("the order: version, then Raw or graded, then condition or grade, then what it means, then the tier", async () => {
    const { r } = card({ state: {} });
    eq(order(r), "print");
    await pick(r, "Normal");
    eq(order(r), "print kind");
    await pick(r, "Raw");
    eq(order(r), "print kind condition");
    assert(!/What does this card mean to you\?/.test(flat(r)), "the collecting state came before the condition");
    await pick(r, "Near Mint");
    eq(order(r), "print kind condition intent");
    await pick(r, "I'm looking for it");
    eq(order(r), "print kind condition intent priority");
    await pick(r, "I own it");
    eq(order(r), "print kind condition intent disposition");
    /* and nothing physical is asked again after the collecting state */
    eq((flat(r).match(/Raw or graded\?/g) || []).length, 1);
    assert(!/Is your copy raw or graded\?|What's it graded\?|What condition is it in\?/.test(flat(r)), flat(r));
  });
  test("looking for it, Raw: condition → Primary is one start-looking step, on the exact printing", async () => {
    const { r, seen } = card();
    await pick(r, "Normal", "Raw");
    assert(/In what condition\? Near Mint Lightly Played Moderately Played Heavily Played Damaged/.test(flat(r)), flat(r));
    eq(addButton(r).props["aria-disabled"], true, "Add woke before the condition");
    await pick(r, "Lightly Played", "I'm looking for it");
    /* RESTATED (P6-F4 B2A): Secondary is "I'm interested in this card." — genuine interest, no urgency */
    assert(/How important is this one\? Primary I'm actively looking for this\. Secondary I'm interested in this card\./.test(flat(r)), flat(r));
    eq(addButton(r).props["aria-disabled"], true, "Add woke before the tier");
    await pick(r, "Primary");
    eq(addButton(r).props["aria-disabled"], false);
    eq(seen.saves.length, 0, "an answer wrote something");
    await tap(addButton(r));
    eq(JSON.stringify(seen.saves), JSON.stringify([{ step: { kind: "start-looking", tier: "primary",
      desired: { grade: "Raw", condition: "Lightly Played" } }, canonicalCardId: "k-n" }]));
  });
  test("looking for it, Graded: grade → Secondary, on the Reverse Holo and not the Normal", async () => {
    const { r, seen } = card({ state: {} });
    await pick(r, "Reverse Holo", "Graded");
    assert(/Which grade\? PSA 10 PSA 9 PSA 8 PSA 7 PSA 6 PSA 5 PSA 4 PSA 3 PSA 2 PSA 1/.test(flat(r)), flat(r));
    eq(addButton(r).props["aria-disabled"], true, "Add woke before the grade");
    await pick(r, "PSA 10", "I'm looking for it", "Secondary");
    await tap(addButton(r));
    eq(JSON.stringify(seen.saves), JSON.stringify([{ step: { kind: "start-looking", tier: "secondary",
      desired: { grade: "PSA 10" } }, canonicalCardId: "k-r" }]));
  });
  test("I own it, Raw: condition → Personal collection is one record-copy step, kept, not offered", async () => {
    const { r, seen } = card();
    await pick(r, "Reverse Holo", "Raw", "Near Mint", "I own it");
    assert(/What's this card to you\? Personal collection I'm keeping this one\. Trade \/ Sell I'd consider moving it\./.test(flat(r)), flat(r));
    eq(addButton(r).props["aria-disabled"], true, "Add woke before the disposition");
    await pick(r, "Personal collection");
    await tap(addButton(r));
    eq(JSON.stringify(seen.saves), JSON.stringify([{ step: { kind: "record-copy",
      copy: { grade: "Raw", condition: "Near Mint", offered: false, keeping: true } }, canonicalCardId: "k-r" }]));
  });
  test("I own it, Graded: grade → Trade / Sell is offered, not kept, with no condition", async () => {
    const { r, seen } = card();
    await pick(r, "Normal", "Graded", "PSA 9", "I own another one", "Trade / Sell");
    await tap(addButton(r));
    eq(JSON.stringify(seen.saves), JSON.stringify([{ step: { kind: "record-copy",
      copy: { grade: "PSA 9", condition: null, offered: true, keeping: false } }, canonicalCardId: "k-n" }]));
  });
  test("changing an answer clears only what depended on it", async () => {
    const { r } = card({ state: {} });
    const pressed = (t) => (choiceNamed(r, t) ? choiceNamed(r, t).props["aria-pressed"] : "absent");
    await pick(r, "Normal", "Raw", "Near Mint", "I'm looking for it", "Primary");
    eq(addButton(r).props["aria-disabled"], false);
    /* the tier, when the collecting state changes — the physical answers stay */
    await pick(r, "I own it");
    eq([pressed("Raw"), pressed("Near Mint"), pressed("Primary"), pressed("Personal collection")].join(), "true,true,absent,false");
    await pick(r, "Personal collection");
    /* the disposition, when it changes back */
    await pick(r, "I'm looking for it");
    eq([pressed("Primary"), pressed("Personal collection")].join(), "false,absent");
    eq(addButton(r).props["aria-disabled"], true, "a stale tier readied Add");
    await pick(r, "Primary");
    /* a new condition: the collecting state goes, the Raw answer stays */
    await pick(r, "Lightly Played");
    eq([pressed("Raw"), pressed("Lightly Played"), pressed("I'm looking for it")].join(), "true,true,false");
    assert(!/How important is this one\?/.test(flat(r)), "the tier outlived its condition");
    /* Raw → Graded: the condition and everything after it go */
    await pick(r, "I own it", "Trade / Sell", "Graded");
    eq(order(r), "print kind grade");
    await pick(r, "PSA 9");
    eq([pressed("I own it"), pressed("Trade / Sell")].join(), "false,absent", "the collecting state outlived the grading");
    eq(addButton(r).props["aria-disabled"], true, "Add woke on answers given before the change");
    /* a new grade: the collecting state goes, the grading stays */
    await pick(r, "I own it", "Trade / Sell", "PSA 8");
    eq([pressed("Graded"), pressed("PSA 8"), pressed("I own it"), pressed("Trade / Sell")].join(), "true,true,false,absent");
    /* the version: everything starts again */
    await pick(r, "I own it", "Personal collection", "Reverse Holo");
    eq(order(r), "print kind");
    eq([pressed("Raw"), pressed("Graded")].join(), "false,false", "answers survived a change of version");
    /* and re-pressing an answer already given changes nothing */
    await pick(r, "Graded", "PSA 8", "I own it", "Personal collection", "PSA 8");
    eq(addButton(r).props["aria-disabled"], false, "re-pressing an answer cleared what followed it");
  });
  test("the clearing rule itself: each answer invalidates exactly what follows it", () => {
    const { answered } = load("client/collector/CardDetail.jsx");
    const full = { printing: "k", kind: "raw", condition: "Near Mint", grade: null, intent: "own", priority: null, disposition: "trade" };
    const keys = (a) => JSON.stringify(a);
    eq(keys(answered(full, "kind", "graded")), keys({ ...full, kind: "graded", condition: null, grade: null, intent: null, priority: null, disposition: null }));
    eq(keys(answered(full, "condition", "Damaged")), keys({ ...full, condition: "Damaged", intent: null, priority: null, disposition: null }));
    const graded = { ...full, kind: "graded", condition: null, grade: "PSA 9" };
    eq(keys(answered(graded, "grade", "PSA 8")), keys({ ...graded, grade: "PSA 8", intent: null, priority: null, disposition: null }));
    eq(keys(answered(full, "intent", "looking")), keys({ ...full, intent: "looking", priority: null, disposition: null }));
    eq(keys(answered({ ...full, intent: "looking", disposition: null, priority: "primary" }, "intent", "own")),
      keys({ ...full, intent: "own", priority: null, disposition: null }));
    eq(answered(full, "condition", "Near Mint"), full, "re-giving an answer changed something");
  });
  test("every required answer is required — nothing is defaulted on the Collector's behalf", () => {
    const { nextUnanswered, stepFor } = load("client/collector/CardDetail.jsx");
    const one = [printing("k", "non_holo")];
    const base = { printing: "k", kind: null, condition: null, grade: null, intent: null, priority: null, disposition: null };
    const cases = [
      [{}, "kind"],
      [{ intent: "looking", priority: "primary" }, "kind"],
      [{ kind: "raw" }, "condition"],
      [{ kind: "raw", intent: "looking", priority: "primary" }, "condition"],
      [{ kind: "graded", intent: "own", disposition: "pc" }, "grade"],
      [{ kind: "raw", condition: "Near Mint" }, "intent"],
      [{ kind: "raw", condition: "Near Mint", intent: "looking" }, "priority"],
      [{ kind: "graded", grade: "PSA 9", intent: "own" }, "disposition"],
    ];
    for (const [patch, want] of cases) eq((nextUnanswered(one, { ...base, ...patch }, null) || [])[0], want, JSON.stringify(patch));
    eq(nextUnanswered(one, { ...base, kind: "graded", grade: "PSA 9", intent: "looking", priority: "secondary" }, null), null);
    eq(nextUnanswered(one, { ...base, kind: "raw", condition: "Damaged", intent: "own", disposition: "trade" }, null), null);
    /* and the step never fills a gap itself */
    eq(stepFor({ ...base, kind: "raw", intent: "looking", priority: "primary" }).desired.condition, null);
    eq(stepFor({ ...base, kind: "raw", intent: "own", disposition: "pc" }).copy.condition, null);
    eq(stepFor({ ...base, intent: "own", disposition: "pc" }), null, "a step without the physical card");
    /* and a graded copy never carries a condition, whatever else is lying about */
    eq(stepFor({ ...base, kind: "graded", grade: "PSA 9", condition: "Near Mint", intent: "own", disposition: "pc" }).copy.condition, null);
    eq(JSON.stringify(stepFor({ ...base, kind: "graded", grade: "PSA 9", condition: "Near Mint", intent: "looking", priority: "primary" }).desired), JSON.stringify({ grade: "PSA 9" }));
  });
  test("during its beat the card shows what it showed, not the projection that already moved", async () => {
    let r;
    const props = { context: { ...MUDKIP, cards: TWO }, state: {}, onClose() {}, onSave: async () => ({ ok: true, value: "c9" }) };
    TR.act(() => { r = TR.create(React.createElement(CardDetail, props)); });
    await pick(r, "Normal", "Raw", "Near Mint", "I own it", "Personal collection");
    await tap(addButton(r));
    /* the store has already refreshed: the new copy is in the projection */
    await TR.act(async () => { r.update(React.createElement(CardDetail, { ...props,
      state: { collectorCopies: [{ id: "c9", canonicalCardId: "k-n", grading: { state: "raw", label: "Raw · Near Mint" }, keeping: true }] } })); });
    assert(!/MetYet remembers/.test(flat(r)), "the card re-rendered into the new world during its beat");
    assert(/I own it/.test(flat(r)) && !/I own another one/.test(flat(r)), flat(r));
  });
  test("a muted Add writes nothing and points at the next question", async () => {
    const { r, seen } = card({ state: {} });
    assert(/Add to MetYet wakes up as you answer\./.test(flat(r)));
    await tap(addButton(r));
    assert(/Which version is it\?/.test(flat(r)), flat(r));
    await pick(r, "Normal");
    await tap(addButton(r));
    assert(/Raw or graded\?/.test(cls(r, "mcs-cd-hint")[0] ? flat(cls(r, "mcs-cd-hint")[0]) : ""), flat(r));
    await pick(r, "Graded");
    await tap(addButton(r));
    assert(/Which grade is it\?/.test(flat(r)), flat(r));
    eq(cls(r, "mcs-cd-q").find((q) => q.props["data-q"] === "grade").props.className.includes("nudge"), true);
    await pick(r, "PSA 7", "I'm looking for it");
    await tap(addButton(r));
    assert(/How important is this one\?/.test(flat(cls(r, "mcs-cd-hint")[0])), flat(r));
    eq(seen.saves.length, 0);
  });
  test("an existing Goal is shown, not offered again; another copy is still yours to add", async () => {
    const { r } = card();
    await pick(r, "Reverse Holo");
    assert(!/You're looking for it/.test(flat(r)), "the collecting state came before the physical card");
    await pick(r, "Raw", "Near Mint");
    assert(/You're looking for it Secondary · PSA 9 · Mudkip/.test(flat(r)), flat(r));
    assert(!choiceNamed(r, "I'm looking for it"), "a second Goal was offered");
    assert(choiceNamed(r, "I own it"), "owning was taken away by wanting");
    await pick(r, "Normal", "Raw", "Near Mint");
    assert(choiceNamed(r, "I'm looking for it") && choiceNamed(r, "I own another one"), flat(r));
  });
  test("each version resolves to one canonical printing, named specifically enough to tell apart", async () => {
    const { versionLabel } = load("client/collector/CardDetail.jsx");
    const first = printing("k-1", "holofoil", { printRun: "first_edition" });
    const unl = printing("k-u", "holofoil", { printRun: "unlimited" });
    const rev = printing("k-r", "reverse_holofoil");
    eq([first, unl, rev].map((c) => versionLabel(c, [first, unl, rev])).join(" | "), "Holo · First Edition | Holo · Unlimited | Reverse Holo");
    eq(versionLabel(unl, [unl, rev]), "Holo", "Unlimited said when nothing differs by it");
    const { r, seen } = card({ state: {}, context: { ...MUDKIP, cards: [first, unl, rev] } });
    eq(versions(r).map((b) => flat(b)).join(" | "), "Holo · First Edition | Holo · Unlimited | Reverse Holo");
    await pick(r, "Holo · Unlimited", "Graded", "PSA 9", "I own it", "Personal collection");
    await tap(addButton(r));
    eq(seen.saves[0].canonicalCardId, "k-u");
  });
  test("no Binder here: neither step names a binder, and the card never files", () => {
    const src = code("client/collector/CardDetail.jsx");
    assert(!/file-object|fileObject|unfile|preselect|addBinderEntry|make-binder/.test(src), "the card files");
    /* and the step it sends carries nothing but the meaning and the copy */
    const { stepFor } = load("client/collector/CardDetail.jsx");
    const a = { printing: "k", kind: "raw", condition: "Near Mint", intent: "own", disposition: "pc" };
    eq(JSON.stringify(Object.keys(stepFor(a)).concat(Object.keys(stepFor(a).copy))), JSON.stringify(["kind", "copy", "grade", "condition", "offered", "keeping"]));
    const g = { printing: "k", intent: "looking", kind: "graded", grade: "PSA 9", priority: "primary" };
    eq(JSON.stringify(Object.keys(stepFor(g))), JSON.stringify(["kind", "tier", "desired"]));
  });
  test("one Add, however many taps", async () => {
    let release;
    const { r, seen } = card({}, () => new Promise((done) => { release = done; }));
    await pick(r, "Normal", "Raw", "Damaged", "I own another one", "Personal collection");
    const b = addButton(r);
    await TR.act(async () => { b.props.onClick(); b.props.onClick(); b.props.onClick(); });
    await TR.act(async () => { addButton(r).props.onClick(); });
    eq(seen.saves.length, 1, "a second command went out");
    eq(addButton(r).props["aria-busy"], true);
    await TR.act(async () => { release({ ok: true, value: "c9" }); });
    await settle();
    await TR.act(async () => { addButton(r).props.onClick(); });
    eq(seen.saves.length, 1, "an Add after success went out");
  });
  test("success is claimed only after the server answers, held, then handed back once", async () => {
    let release;
    const { r, seen } = card({}, () => new Promise((done) => { release = done; }));
    await pick(r, "Reverse Holo", "Graded", "PSA 8", "I own it", "Trade / Sell");
    await tap(addButton(r));
    assert(!/Added to MetYet/.test(flat(r)), "success was shown before the server answered");
    await TR.act(async () => { release({ ok: true, value: "c9" }); });
    await settle();
    assert(/Trade \/ Sell ✓ · PSA 8 · Reverse Holo ✓ Added to MetYet/.test(flat(r)), flat(r));
    eq(addButton(r).props.className.includes("added"), true);
    eq(seen.added.length, 0, "it left before its beat");
    await TR.act(async () => { await new Promise((done) => setTimeout(done, 1000)); });
    eq(seen.added.length, 1);
    eq(seen.added[0].id, "k-r");
    eq(seen.added[0].ack.value, "Your Trusted Partners can now see you'd move this one.");
  });
  test("a refusal is said in production's words, nothing is claimed, and the answers stay", async () => {
    const { r, seen } = card({ state: {} }, () => ({ ok: false, refused: "duplicate-goal" }));
    await pick(r, "Normal", "Graded", "PSA 9", "I'm looking for it", "Primary");
    await tap(addButton(r));
    assert(/Nothing was saved: the goal could not be saved — That card is already on your list\./.test(flat(r)), flat(r));
    assert(!/Added to MetYet|goal ✓/.test(flat(r)), "a refusal was shown as success");
    eq(choiceNamed(r, "Primary").props["aria-pressed"], true, "the answers were lost");
    eq(addButton(r).props["aria-disabled"], false, "it cannot be tried again");
    await TR.act(async () => { await new Promise((done) => setTimeout(done, 1000)); });
    eq(seen.added.length, 0, "a refused card went back to Browse as added");
  });
  test("lost contact is said honestly and claims nothing", async () => {
    const { r, seen } = card({ state: {} }, () => { throw new Error("offline"); });
    await pick(r, "Normal", "Graded", "PSA 1", "I own it", "Personal collection");
    await tap(addButton(r));
    assert(/MetYet lost contact, so nothing was saved\. Your answers are still here\./.test(flat(r)), flat(r));
    eq(seen.added.length, 0);
  });
  test("with no save path, Add stays quiet and promises nothing", async () => {
    const { r, seen } = card({ onSave: null });
    await pick(r, "Normal", "Raw", "Near Mint", "I'm looking for it", "Primary");
    eq(addButton(r).props["aria-disabled"], true);
    assert(!/wakes up/.test(flat(r)));
    await tap(addButton(r));
    eq(seen.saves.length, 0);
  });
  test("the card names no command and reaches past none of its props", () => {
    const src = code("client/collector/CardDetail.jsx");
    assert(!/addGoal|addCollectorCopy|fetch\(|api\.|execute\(/.test(src), "the card reaches past its props");
    const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
    for (const c of EXPOSED_COMMANDS) assert(!new RegExp(`["']${c}["']`).test(src), `the card names ${c}`);
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
