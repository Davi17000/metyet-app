/* ============================================================================
   MILESTONE 2C.1 — COMPACT GOAL CARDS WITH PROGRESS

   Deal Flow's landing page as one card per Goal, and View Matches, through
   the real Collector shell over projections of worlds driven by real domain
   commands. The world: three Primary Goals and one Secondary —

     Mudkip      an agreed deal with Northline; Northline's copy matches
     Charizard   no deal; Northline (two copies) and Silver Vale match
     Pikachu     no deal; nobody connected has it (Faraway, unconnected, does)
     Venusaur    Secondary; Silver Vale's copy matches

   and Jordan, another Collector, with a deal of his own.

     A. every Goal once, in the server's order, each its own identity
     B. progress: one bar per active Goal, from the shared mapping; none
        without a deal
     C. counts are Trusted Partners, not copies
     D. no accordion and nothing nested on the landing page
     E. the one action: the deal's opens the workspace; View Matches opens
        the Goal's matches, full screen, and an offer from there opens the
        deal the server made
     F. nothing unauthorized; a Secondary Goal cannot start a deal
   (Focus, scrolling and overflow at 390 and 320 are checked in a real browser
   by harness/phase6-deal-scenarios.cjs, scenario d.)
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const path = require("path");
const React = require("react");
const TR = require("react-test-renderer");
const esbuild = require("esbuild");
const P = require("../domain/metyet-projection.js");
const { createStore } = require("./fixture-store.cjs");
const RT = require("../domain/metyet-runtime.js");

const ROOT = path.join(__dirname, "..");
const AT = "2026-11-03";
let seq = 0;
const runtime = () => RT.createRuntime({ now: () => AT, newId: (p = "") => `${p}${++seq}` });
const A = { collectorId: "casey" };
const J = { collectorId: "jordan" };
const NL = { partnerId: "nl" };

const world = ({ agreed = true, mudkipMoves = null } = {}) => {
  const st = createStore({
    partners: [{ id: "nl", name: "Northline Cards", tradeRate: 0.7 }, { id: "sv", name: "Silver Vale", tradeRate: 0.7 },
      { id: "far", name: "Faraway Games", tradeRate: 0.7 }],
    collectors: [{ id: "casey", name: "Casey" }, { id: "jordan", name: "Jordan" }],
    relationships: [
      { partnerId: "nl", collectorId: "casey", status: "accepted", at: AT },
      { partnerId: "sv", collectorId: "casey", status: "accepted", at: AT },
      { partnerId: "nl", collectorId: "jordan", status: "accepted", at: AT }],
    /* the server's order: Charizard first, then Mudkip — not the order of urgency */
    goals: [
      { id: "gC", collectorId: "casey", canonicalCardId: "cc-char", tier: "primary", desired: { grade: "PSA 9" } },
      { id: "gV", collectorId: "casey", canonicalCardId: "cc-ven", tier: "secondary", desired: { grade: "PSA 8" } },
      { id: "gM", collectorId: "casey", canonicalCardId: "cc-mud", tier: "primary", desired: { grade: "Raw", condition: "Near Mint" } },
      { id: "gP", collectorId: "casey", canonicalCardId: "cc-pika", tier: "primary", desired: { grade: "PSA 10" } },
      { id: "gJ", collectorId: "jordan", canonicalCardId: "cc-ven", tier: "primary", desired: { grade: "PSA 9" } }],
    inventory: [
      { invId: "m1", partnerId: "nl", canonicalCardId: "cc-mud", grade: "Raw", condition: "Near Mint", ask: 12, cost: 6, cert: "CERT-M" },
      { invId: "c1", partnerId: "nl", canonicalCardId: "cc-char", grade: "PSA 9", ask: 1200, cost: 900, cert: "CERT-C1" },
      { invId: "c2", partnerId: "nl", canonicalCardId: "cc-char", grade: "PSA 9", ask: 1250, cost: 950, firmOnPrice: true },
      { invId: "c3", partnerId: "sv", canonicalCardId: "cc-char", grade: "PSA 9", ask: 1180, cost: 800 },
      { invId: "j1", partnerId: "nl", canonicalCardId: "cc-ven", grade: "PSA 9", ask: 1300, cost: 999 },
      { invId: "p1", partnerId: "far", canonicalCardId: "cc-pika", grade: "PSA 10", ask: 500, cost: 300 },
      { invId: "v1", partnerId: "sv", canonicalCardId: "cc-ven", grade: "PSA 8", ask: 300, cost: 150 }],
    collectorCopies: [], binders: [], binderEntries: [], opportunities: [], catalog: [], copyReviews: [],
    photoRequests: [], conversations: [], interests: [],
  }, runtime());
  const x = (actor, cmd, payload) => st.execute(actor, cmd, { at: AT, ...(payload || {}) });
  const ok = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
  const mud = ok(x(A, "startOpportunity", { goalId: "gM", invId: "m1", amount: 10 }), "Mudkip offer");
  for (const [who, cmd, p] of mudkipMoves || (agreed ? [[NL, "proposePrice", { amount: 11 }], [A, "acceptPrice"]] : [])) {
    ok(x(who, cmd, { oppId: mud, ...(p || {}) }), cmd);
  }
  const jordans = ok(x(J, "startOpportunity", { goalId: "gJ", invId: "j1", amount: 1111 }), "Jordan's offer");
  return { st, x, mud, jordans };
};

const build = (rel) => {
  const out = esbuild.buildSync({ entryPoints: [path.join(ROOT, rel)], bundle: true, format: "cjs", write: false,
    logLevel: "silent", jsx: "automatic", platform: "node",
    external: ["react", "react-dom", "react/jsx-runtime", "react-test-renderer"] });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};
const Shell = build("client/collector/CollectorShell.jsx").default;
const DF = build("client/collector/sections/DealFlow.jsx");
const PARTS = build("client/collector/deal-parts.jsx");
const PG = build("client/collector/deal-progress.js");
const CARDS = {
  "cc-mud": { canonicalCardId: "cc-mud", cardName: "Mudkip", expansionName: "Ruby & Sapphire", collectorNumber: "60",
    finish: "non_holo", printRun: "not_applicable", language: "en", imageSmall: "https://example.test/mud.png" },
  "cc-char": { canonicalCardId: "cc-char", cardName: "Charizard", expansionName: "Base Set", collectorNumber: "4" },
  "cc-pika": { canonicalCardId: "cc-pika", cardName: "Pikachu", expansionName: "Jungle", collectorNumber: "60" },
  "cc-ven": { canonicalCardId: "cc-ven", cardName: "Venusaur", expansionName: "Base Set", collectorNumber: "15" } };
const door = { describe: async (ids) => ({ cards: ids.map((id) => CARDS[id]).filter(Boolean) }) };
const settle = async () => { for (let i = 0; i < 10; i += 1) await TR.act(async () => { await new Promise((d) => setTimeout(d, 0)); }); };

const textOf = (n) => (typeof n === "string" ? n : (n && n.children ? n.children.map(textOf).join(" ") : ""));
const flat = (n) => textOf(n).replace(/\s+/g, " ").trim();
const cls = (n) => String((n.props && n.props.className) || "").split(" ");
const byCls = (root, c) => root.findAll((n) => typeof n.type === "string" && cls(n).includes(c));
const buttons = (root) => root.findAll((n) => n.type === "button").map((b) => flat(b));
const bars = (root) => root.findAll((n) => n.props && n.props.role === "progressbar");
/* The deal block's three lines, in order, with the bar shown as [bar]. */
const lines = (card) => byCls(byCls(card, "mcs-dg-deal")[0], "mcs-dg-progress")[0].findAll((n) => typeof n.type === "string"
  && (n.type === "p" || n.props.role === "progressbar")).map((n) => (n.props.role === "progressbar" ? "[bar]" : flat(n))).join(" | ");

/* The Collector's shell over the store, sending real commands and
   re-projecting after each, as the production entrance does. */
async function shell(st, actor = A) {
  const sent = [];
  let r;
  const props = () => ({
    state: P.projectForActor(st.get(), actor), onSignOut: () => {}, onBrowseCards: door,
    onAddGoal: async () => ({ ok: true }),
    onOpenOffer: (goalId, invId, price) => send("startOpportunity", { goalId, invId, ...price }),
    onCounterOffer: (oppId, price) => send("proposePrice", { oppId, ...price }),
    onAcceptOffer: (oppId) => send("acceptPrice", { oppId }),
    onWithdrawOffer: (oppId) => send("cancelOpportunity", { oppId }),
    onInspect: (invId) => send("reviewCopy", { invId }),
    onEndInspection: (reviewId) => send("endReview", { reviewId }),
    onRequestPhotos: (invId) => send("requestPhotos", { invId }),
    onRefresh: async () => { await TR.act(async () => { r.update(el()); }); },
  });
  const send = async (cmd, payload) => {
    sent.push(cmd);
    const out = st.execute(actor, cmd, { at: AT, ...payload });
    await TR.act(async () => { r.update(el()); });
    await settle();
    return out;
  };
  const el = () => React.createElement(Shell, props());
  await TR.act(async () => { r = TR.create(el()); });
  await settle();
  const s = { sent, get r() { return r; } };
  s.go = async (label) => { const b = r.root.findAll((n) => n.type === "button" && flat(n).includes(label) && cls(n).includes("mcs-i"))[0];
    await TR.act(async () => { b.props.onClick(); }); await settle(); };
  s.cards = () => r.root.findAll((n) => n.type === "article" && n.props["data-goal"]);
  s.goal = (id) => s.cards().find((a) => a.props["data-goal"] === id) || null;
  s.press = async (root, label) => { const b = root.findAll((n) => n.type === "button" && (flat(n) === label || n.props["aria-label"] === label))[0];
    assert(b, `no "${label}" in: ${flat(root).slice(0, 300)}`);
    await TR.act(async () => { await b.props.onClick(); }); await settle(); };
  s.ws = () => r.root.findAll((n) => n.type === "div" && n.props.className === "mcs-ws")[0] || null;
  s.gm = () => r.root.findAll((n) => n.type === "div" && cls(n).includes("mcs-gm"))[0] || null;
  s.nav = () => r.root.findAll((n) => n.type === "nav").length;
  return s;
}
const landing = async (opts) => { const w = world(opts); const s = await shell(w.st); await s.go("Deal Flow"); return { ...w, s }; };

/* ================================================================ A */
describe("A. every Goal once, each itself", () => {
  test("every Primary Goal renders exactly once, in the server's order — and no Secondary Goal (Milestone 2C.2)", async () => {
    const { s } = await landing();
    const ids = s.cards().map((a) => a.props["data-goal"]);
    eq(ids.join(), "gC,gM,gP", "not each Primary Goal once, in the server's order");
    const sections = byCls(s.r.root, "mcs-dg-sec").map((sec) => flat(sec.findAll((n) => n.type === "h2")[0]));
    eq(sections.join("|"), "Primary Goals");
  });
  test("the page says what it is, once, with no introduction and no 'What works today'", async () => {
    const { s } = await landing();
    const main = s.r.root.findAll((n) => n.type === "main")[0];
    eq(flat(main.findAll((n) => n.type === "h1")[0]), "Deal Flow");
    eq(flat(byCls(main, "mcs-sub")[0]), "Your collecting goals and where they stand.");
    assert(!/What works today|Trades and messages arrive later/.test(flat(main)), flat(main).slice(0, 300));
    for (const no of ["mcs-chip", "mcs-views", "mcs-find"]) eq(byCls(main, no).length, 0, `a ${no} (filters/sort/search) appeared`);
  });
  test("each card is its own Goal: art, name, set and number, what was asked for, and the Primary mark", async () => {
    const { s } = await landing();
    const want = { gC: ["Charizard", "Base Set · #4", "PSA 9"], /* RE-PINNED (Milestone 2C.3): the version the catalogue names is part of the printing */
      gM: ["Mudkip", "Ruby & Sapphire · #60 · Normal", "Raw · Near Mint"],
      gP: ["Pikachu", "Jungle · #60", "PSA 10"] };
    for (const [id, [name, set, asked]] of Object.entries(want)) {
      const a = s.goal(id);
      eq(flat(byCls(a, "mcs-dg-name")[0]), name, `${id} name`);
      eq(flat(byCls(a, "mcs-dg-set")[0]), set, `${id} printing`);
      eq(flat(byCls(a, "mcs-dg-want")[0]), asked, `${id} criteria`);
      eq(byCls(a, "mcs-dg-art").length, 1, `${id} art`);
      const chip = a.findAll((n) => n.props && n.props["data-collecting"] === "primary")[0];
      assert(chip && /Primary Goal/.test(flat(chip)), `${id} has no Primary mark`);
      eq(chip.findAll((n) => n.props && n.props["data-state-icon"] === "primary").length, 1, `${id}: not the square reticle`);
      for (const other of Object.values(want).map((w) => w[0]).filter((n) => n !== name)) {
        assert(!flat(a).includes(other), `${id}'s card mentions ${other}`);
      }
    }
    eq(s.goal("gV"), null, "a Secondary Goal is drawn in Deal Flow");
    assert(!/not_applicable|non_holo|\ben\b/.test(flat(s.r.root.findAll((n) => n.type === "main")[0])), "an internal printing identifier");
  });
});

/* ================================================================ B */
describe("B. progress", () => {
  test("Mudkip (agreed): stage above the bar, one bar, status below, one action", async () => {
    const { s, mud } = await landing();
    const a = s.goal("gM");
    eq(bars(a).length, 1, "not exactly one progress bar");
    const deal = byCls(a, "mcs-dg-deal")[0];
    eq(deal.props["data-opp"], mud);
    /* RESTATED (M3A A3, founder-authorized): an agreed price is followed by Select Trade, which production now offers — the partner choosing cards, said as that, with "View Deal". */
    eq(lines(a), "Select Trade | [bar] | Northline Cards is choosing cards");
    eq(buttons(a).join("|"), "View Deal", "not exactly one action");
    assert(!/Deal complete|Completed|Continue/.test(flat(a)), "something past the price is implied");
  });
  test("an open price: Market Validation above the bar, whose turn below — the server's turn, both ways", async () => {
    let { s } = await landing({ agreed: false });
    eq(lines(s.goal("gM")), "Market Validation | [bar] | Waiting for Northline Cards");
    eq(buttons(s.goal("gM")).join("|"), "View Deal");
    ({ s } = await landing({ mudkipMoves: [[NL, "proposePrice", { amount: 11 }]] }));
    eq(lines(s.goal("gM")), "Market Validation | [bar] | Your turn · Review counteroffer");
    eq(buttons(s.goal("gM")).join("|"), "Review Counteroffer");
  });
  test("the bar is the shared mapping, segment for segment, with an accessible name and value", async () => {
    for (const opts of [{ agreed: false }, { agreed: true }]) {
      const { s, st, mud } = await landing(opts);
      const deal = P.projectForActor(st.get(), A).opportunities.find((o) => o.id === mud);
      const p = PG.dealProgress(deal);
      const bar = bars(s.goal("gM"))[0];
      eq([bar.props["aria-valuemin"], bar.props["aria-valuemax"], bar.props["aria-valuenow"]].join(), `0,10,${p.done}`);
      assert(/^Deal progress: /.test(bar.props["aria-label"]) && bar.props["aria-valuetext"], "no accessible name or value");
      eq(byCls(bar, "mcs-dg-seg").map((g) => g.props.className).join("|"),
        p.steps.map((st2) => `mcs-dg-seg ${st2.state}${st2.available ? "" : " planned"}`).join("|"), "not the shared mapping");
      eq(byCls(bar, "mcs-dg-seg").length, 10);
    }
  });
  test("completed steps are the Primary green, read from the one state mapping, never spelled in the shell", async () => {
    const { s } = await landing();
    const bar = bars(s.goal("gM"))[0];
    const STATES = build("client/collector/states.jsx");
    eq(bar.props.style["--done"], STATES.STATE_STYLE.primary.color);
    eq(STATES.STATE_STYLE.primary.color, "#21865A");
    const css = require("fs").readFileSync(path.join(ROOT, "client/collector/CollectorShell.jsx"), "utf8");
    assert(/\.mcs-dg-seg\.done \{ background:var\(--done\); \}/.test(css), "done segments do not use it");
  });
  test("Goals without a deal show no progress at all — no bar, no step", async () => {
    const { s } = await landing();
    for (const id of ["gC", "gP"]) {
      eq(bars(s.goal(id)).length, 0, `${id} has a progress bar`);
      assert(!/Step \d|Market Validation/.test(flat(s.goal(id))), `${id} claims a stage: ${flat(s.goal(id))}`);
      eq(s.goal(id).findAll((n) => n.props && n.props["data-opp"]).length, 0, `${id} shows a deal`);
    }
  });
  test("a stage this build does not know keeps the safe fallback: its name and status, no bar", () => {
    let r;
    TR.act(() => { r = TR.create(React.createElement(PARTS.GoalProgress, { deal: { stage: "haggling" },
      glance: { status: "Deal in progress", mine: false } })); });
    eq(bars(r.root).length, 0, "a bar was invented for an unknown stage");
    eq(flat(r.root), "haggling Deal in progress");
  });
});

/* ================================================================ C */
describe("C. Trusted Partners, not copies", () => {
  test("Charizard: two Trusted Partners (three copies) — said as two, with View Matches", async () => {
    const { s, st } = await landing();
    const e = DF.dealFlowGoals(P.projectForActor(st.get(), A)).find((g) => g.goal.id === "gC");
    eq([e.partnerCount, e.copyCount].join(), "2,3");
    const a = s.goal("gC");
    eq(flat(byCls(a, "mcs-dg-match")[0]), "2 Trusted Partners match");
    assert(!/3|copies/.test(flat(byCls(a, "mcs-dg-match")[0])), "a copy count on the card");
    eq(buttons(a).join("|"), "View Matches");
  });
  test("Mudkip: one Trusted Partner; Pikachu: none, plainly, and no button", async () => {
    const { s } = await landing();
    eq(flat(byCls(s.goal("gM"), "mcs-dg-match")[0]), "1 Trusted Partner matches");
    const p = s.goal("gP");
    eq(flat(byCls(p, "mcs-dg-match")[0]), "No Trusted Partner matches yet");
    eq(buttons(p).length, 0, "a button with nothing behind it");
    eq(p.findAll((n) => n.type === "button" && n.props.disabled).length, 0, "a disabled button");
  });
});

/* ================================================================ D */
describe("D. no accordion, nothing nested", () => {
  test("no disclosure control, no hidden region, no copy rows, prices, forms or transaction controls", async () => {
    const { s } = await landing({ mudkipMoves: [[NL, "proposePrice", { amount: 11 }]] });
    const main = s.r.root.findAll((n) => n.type === "main")[0];
    eq(main.findAll((n) => n.props && (n.props["aria-expanded"] !== undefined || n.props["aria-controls"] !== undefined)).length, 0, "an accordion control");
    eq(main.findAll((n) => typeof n.type === "string" && n.props.hidden).length, 0, "a hidden region");
    eq(main.findAll((n) => ["input", "form", "textarea", "li", "details", "dl"].includes(n.type)).length, 0, "nested content");
    const t = flat(main);
    for (const no of [/Proposed Market Price/, /\$\d/, /Inspect|Request photos|Make an offer/, /Accept|Counter\b|Withdraw/,
      /Price history/, /CERT-/, /Active deal/, /Matching Trusted Partners/]) {
      assert(!no.test(t), `${no} is on the landing page: ${t.slice(0, 400)}`);
    }
    for (const a of s.cards()) eq(a.findAll((n) => n.type === "button").length <= 1, true, "a card with more than one button");
  });
  test("the accordion's styles and state are gone", () => {
    const fs = require("fs");
    const shellSrc = fs.readFileSync(path.join(ROOT, "client/collector/CollectorShell.jsx"), "utf8");
    const dfSrc = fs.readFileSync(path.join(ROOT, "client/collector/sections/DealFlow.jsx"), "utf8");
    for (const gone of ["mcs-dg-toggle", "mcs-dg-chev", "mcs-dg-body", "openGoals", "onToggleGoal", "dealGoals"]) {
      assert(!shellSrc.includes(gone) && !dfSrc.includes(gone), `${gone} remains`);
    }
  });
});

/* ================================================================ E */
describe("E. the one action", () => {
  /* RESTATED (M3A A3, founder-authorized): an agreed price is followed by Select Trade, which production now offers — the partner choosing cards, said as that, with "View Deal". */
  test("the agreed deal's View Deal opens the workspace on that exact deal; Back returns to Deal Flow", async () => {
    const { s, st, mud } = await landing();
    const before = JSON.stringify(st.get());
    await s.press(s.goal("gM"), "View Deal");
    eq(s.ws() && s.ws().props["data-opp"], mud);
    eq(s.nav(), 0, "not full screen");
    await s.press(s.ws(), "Back to Deal Flow");
    assert(s.goal("gM") && s.nav() > 0, "Back did not return to Deal Flow");
    eq(s.sent.length, 0); eq(JSON.stringify(st.get()), before, "looking changed the world");
  });
  test("View Matches: full screen, partners grouped, each copy with its picture, price, terms and its actions", async () => {
    const { s, st } = await landing();
    const before = JSON.stringify(st.get());
    await s.press(s.goal("gC"), "View Matches");
    const gm = s.gm();
    assert(gm, "View Matches did not open");
    eq(s.nav(), 0, "not full screen");
    eq(gm.props["data-goal"], "gC");
    const head = flat(byCls(gm, "mcs-ws-hd")[0]);
    for (const part of ["Charizard", "Base Set · #4 · PSA 9", "Primary Goal", "2 Trusted Partners match"]) {
      assert(head.includes(part), `the header does not say "${part}": ${head}`);
    }
    const groups = byCls(gm, "mcs-gm-partner");
    eq(groups.map((g) => `${flat(g.findAll((n) => n.type === "h2")[0])}:${byCls(g, "mcs-df-copy").length}`).join(), "Northline Cards:2,Silver Vale:1");
    const row = (inv) => gm.findAll((n) => n.type === "li" && n.props["data-inv"] === inv)[0];
    assert(/\$1,200 Proposed Market Price/.test(flat(row("c1"))) && /Open to Offers/.test(flat(row("c1"))), flat(row("c1")));
    assert(/Firm on Price/.test(flat(row("c2"))), flat(row("c2")));
    /* RE-PINNED (Milestone 2C.2): the picture first, then the two actions */
    for (const inv of ["c1", "c2", "c3"]) {
      eq(byCls(row(inv), "mcs-pv-thumb").length, 1, `${inv} has no picture to tap`);
      eq(row(inv).findAll((n) => n.type === "button" && !cls(n).includes("mcs-pv-thumb")).map((b) => flat(b)).join("|"),
        "Make an offer|Request actual photos", `${inv}'s actions`);
    }
    assert(!/CERT-|\$900|\$950|\$800|0\.7|70%/.test(flat(gm)), "a partner's private field");
    eq(s.sent.length, 0, "opening View Matches sent a command");
    eq(JSON.stringify(st.get()), before, "opening View Matches changed the world (an offer, a reservation)");
  });
  test("pressing Make an offer only opens the composer; Send is one command; the new deal opens by the server's id", async () => {
    const { s, st } = await landing();
    await s.press(s.goal("gC"), "View Matches");
    const row = () => s.gm().findAll((n) => n.type === "li" && n.props["data-inv"] === "c3")[0];
    await s.press(row(), "Make an offer");
    eq(s.sent.length, 0, "pressing Make an offer sent something");
    const input = row().findAll((n) => n.type === "input")[0];
    await TR.act(async () => { input.props.onChange({ target: { value: "1100" } }); });
    await TR.act(async () => { await row().findAll((n) => n.type === "form")[0].props.onSubmit({ preventDefault() {} }); });
    await settle();
    eq(JSON.stringify(s.sent), JSON.stringify(["startOpportunity"]), "not exactly one command");
    const made = st.get().opportunities.filter((o) => o.goalId === "gC");
    eq(made.length, 1, "not one new deal");
    eq([made[0].invId, made[0].priceThread[0].amount].join(), "c3,1100");
    await settle();
    eq(s.ws() && s.ws().props["data-opp"], made[0].id, "the workspace did not open on the deal the server made");
    await s.press(s.ws(), "Back to Deal Flow");
    const card = s.goal("gC");
    eq(card.findAll((n) => n.props && n.props["data-opp"] === made[0].id).length, 1, "the Goal's card does not show its new deal");
    eq(buttons(card).join("|"), "View Deal");
    eq(bars(card).length, 1);
    /* Mudkip's deal stayed Mudkip's */
    /* RESTATED (M3A A3, founder-authorized): an agreed price is followed by Select Trade, which production now offers — the partner choosing cards, said as that, with "View Deal". */
    assert(/is choosing cards/.test(flat(s.goal("gM"))) && !/is choosing cards/.test(flat(card)), "statuses crossed Goals");
  });
  test("Back from View Matches returns to Deal Flow with every card as it was", async () => {
    const { s } = await landing();
    const before = s.cards().map((a) => flat(a));
    await s.press(s.goal("gC"), "View Matches");
    await s.press(s.gm(), "Back to Deal Flow");
    assert(!s.gm() && s.nav() > 0, "View Matches did not close");
    eq(JSON.stringify(s.cards().map((a) => flat(a))), JSON.stringify(before));
  });
  test("Request actual photos still works from View Matches, and sends only itself", async () => {
    const { s } = await landing();
    await s.press(s.goal("gC"), "View Matches");
    const row = (inv) => s.gm().findAll((n) => n.type === "li" && n.props["data-inv"] === inv)[0];
    await s.press(row("c3"), "Request actual photos");
    assert(/Photos requested/.test(flat(row("c3"))), flat(row("c3")));
    eq(JSON.stringify(s.sent), JSON.stringify(["requestPhotos"]));
  });
  test("an ended deal is said quietly on its card, and View Matches returns while copies still match", async () => {
    const { s } = await landing({ agreed: false });
    await s.press(s.goal("gM"), "View Deal");
    await s.press(s.ws(), "Withdraw offer");
    await s.press(s.ws(), "Back to Deal Flow");
    const a = s.goal("gM");
    eq(flat(byCls(a, "mcs-dg-ended")[0]), "You withdrew this offer.");
    eq(bars(a).length, 0, "an ended deal still has a bar");
    eq(buttons(a).join("|"), "View Matches");
  });
});

/* ================================================================ F */
describe("F. nothing unauthorized; Secondary Goals start nothing", () => {
  test("another Collector's Goal, deal and offer never appear; an unconnected partner's copy is never counted", async () => {
    const { s, jordans } = await landing();
    const t = flat(s.r.root);
    assert(!/Jordan|\$1,111|1111|Faraway/.test(t), "something of Jordan's or Faraway's reached the screen");
    assert(!s.cards().some((a) => a.props["data-goal"] === "gJ"), "Jordan's Goal is drawn");
    assert(!s.r.root.findAll((n) => n.props && n.props["data-opp"] === jordans).length, "Jordan's deal is drawn");
    eq(flat(byCls(s.goal("gP"), "mcs-dg-match")[0]), "No Trusted Partner matches yet", "Faraway's Pikachu was counted");
  });
  test("View Matches for a Goal that is not this Collector's shows nothing of it", async () => {
    const { st } = world();
    let r;
    await TR.act(async () => { r = TR.create(React.createElement(DF.GoalMatches, { state: P.projectForActor(st.get(), A),
      goalId: "gJ", onBack: () => {}, onBrowseCards: door, onOpenOffer: async () => ({ ok: true }) })); });
    await settle();
    const t = flat(r.root);
    assert(/Goal not available/.test(t) && /Nothing has been changed/.test(t), t);
    assert(!/Charizard|Jordan|\$1,300|Northline/.test(t), "something of the foreign Goal was shown: " + t);
    eq(buttons(r.root).filter((b) => /Make an offer|Inspect/.test(b)).length, 0);
  });
  test("a Secondary Goal's View Matches, reached directly, lists its match but offers no deal — and the server refuses one", async () => {
    const { st, x } = await landing();
    let r;
    await TR.act(async () => { r = TR.create(React.createElement(DF.GoalMatches, { state: P.projectForActor(st.get(), A),
      goalId: "gV", onBrowseCards: door, onOpenOffer: async () => ({ ok: true }), onRequestPhotos: async () => ({ ok: true }) })); });
    await settle();
    const gm = r.root;
    eq(byCls(gm, "mcs-df-copy").length, 1);
    assert(!buttons(gm).includes("Make an offer"), "a Secondary Goal offers a deal");
    assert(/offers start from a Primary Goal/.test(flat(gm)), "it does not say why");
    eq(x(A, "startOpportunity", { goalId: "gV", invId: "v1", amount: 290 }).refused, "goal-not-primary");
    eq(st.get().opportunities.filter((o) => o.goalId === "gV").length, 0);
  });
});

run();
