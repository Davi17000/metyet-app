/* ============================================================================
   MILESTONE 2D.3 — AFTER AGREEMENT, BOTH SIDES SAY THE SAME THING; AND A
   PRINTING IS SAID IN WORDS

   The Trusted Partner's Opportunities and the Collector's Deal Workspace,
   rendered through their real shells over projections of worlds driven by
   real domain commands:

     A. an agreed price with Select Trade not in production: the shop is told
        "Price agreed · Select Trade coming soon" (never "Waiting for Casey",
        a move Casey cannot make), and sees the agreed price large, with the
        prices that led to it
     B. both sides show the same agreed price — the stored one
     C. nothing else moved: before agreement the turn tags are as they were;
        a deal whose next move is not choosing a trade keeps its own tags
     D. a printing in words on the shop's side ("Normal"), from the one
        shared helper, never the catalogue's codes
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

const ROOT = path.join(__dirname, "..");
const AT = "2026-11-04T15:04:00.000Z";
let seq = 0;
const runtime = () => RT.createRuntime({ now: () => AT, newId: (p = "") => `${p}${++seq}` });
const A = { collectorId: "casey" };
const NL = { partnerId: "nl" };

const world = () => createStore({
  partners: [{ id: "nl", name: "Northline Cards", tradeRate: 0.7 }],
  collectors: [{ id: "casey", name: "Casey" }],
  relationships: [{ partnerId: "nl", collectorId: "casey", status: "accepted", at: AT }],
  goals: [{ id: "gA", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "Raw", condition: "Near Mint" } }],
  inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", grade: "Raw", condition: "Near Mint", ask: 12, cost: 6 }],
  collectorCopies: [], binders: [], binderEntries: [], opportunities: [], catalog: [], copyReviews: [],
  photoRequests: [], conversations: [], interests: [],
}, runtime());
const x = (st, actor, cmd, payload) => st.execute(actor, cmd, { at: AT, ...(payload || {}) });
const okv = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
const offered = (moves = []) => {
  const st = world();
  const oppId = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 10 }), "open");
  for (const [actor, cmd, payload] of moves) okv(x(st, actor, cmd, { oppId, ...(payload || {}) }), cmd);
  return { st, oppId };
};

const build = (rel) => {
  const out = esbuild.buildSync({ entryPoints: [path.join(ROOT, rel)], bundle: true, format: "cjs", write: false,
    logLevel: "silent", jsx: "automatic", platform: "node",
    external: ["react", "react-dom", "react/jsx-runtime", "react-test-renderer"] });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};
const CollectorShell = build("client/collector/CollectorShell.jsx").default;
const TPShell = build("client/tp/TrustedPartnerShell.jsx").default;
const NEG = build("client/negotiation.jsx");
const PRINTING = build("client/printing.js");
const PRESENT = build("client/collector/present.js");
/* The catalogue's own description, codes and all. */
const MUDKIP = { canonicalCardId: "cc-x", cardName: "Mudkip", expansionName: "Ruby & Sapphire", collectorNumber: "60",
  printRun: "not_applicable", finish: "non_holo", language: "en" };
const door = { describe: async (ids) => ({ cards: ids.includes("cc-x") ? [MUDKIP] : [] }) };
const settle = async () => { for (let i = 0; i < 10; i += 1) await TR.act(async () => { await new Promise((d) => setTimeout(d, 0)); }); };

const textOf = (n) => (typeof n === "string" ? n : (n && n.children ? n.children.map(textOf).join(" ") : ""));
const flat = (n) => textOf(n).replace(/\s+/g, " ").trim();
const cls = (n) => String((n.props && n.props.className) || "").split(" ");
const byCls = (root, c) => root.findAll((n) => typeof n.type === "string" && cls(n).includes(c));

/* The shop, on Opportunities. `shape` may rewrite the projection, for the one
   test that needs a turn production cannot reach yet. */
async function shop(st, shape = (s) => s) {
  const s = {};
  const el = () => React.createElement(TPShell, { state: shape(P.projectForActor(st.get(), NL)), onSignOut: () => {},
    onBrowseCards: door, onCounterOffer: async () => ({ ok: true }), onAcceptOffer: async () => ({ ok: true }),
    onDeclineOffer: async () => ({ ok: true }), onRefresh: async () => {}, onSendMessage: async () => ({ ok: true }) });
  await TR.act(async () => { s.r = TR.create(el()); });
  await settle();
  const nav = s.r.root.findAll((n) => n.type === "button" && cls(n).includes("tps-item") && /Opportunities/.test(flat(n)))[0];
  await TR.act(async () => { nav.props.onClick(); });
  await settle();
  s.rec = (oppId) => byCls(s.r.root, "tps-rec").find((r) => byCls(r, "tps-msg").some((m) => m.props["data-thread"] === oppId)) || null;
  s.panelOf = (oppId) => byCls(s.r.root, "tps-panel").find((p) => byCls(p, "tps-rec").includes(s.rec(oppId)));
  s.tags = (oppId) => byCls(byCls(s.rec(oppId), "tps-rec-tags")[0], "tps-tag").map(flat);
  s.buttons = (oppId) => s.rec(oppId).findAll((n) => n.type === "button" && !cls(n).some((c) => /^tps-(talk|msg)/.test(c))).map(flat);
  return s;
}
async function collector(st) {
  const s = {};
  const el = () => React.createElement(CollectorShell, { state: P.projectForActor(st.get(), A), onSignOut: () => {},
    onBrowseCards: door, onRefresh: async () => {}, onSendMessage: async () => ({ ok: true }) });
  await TR.act(async () => { s.r = TR.create(el(), { createNodeMock: () => ({ focus() {}, scrollIntoView() {} }) }); });
  await settle();
  const go = s.r.root.findAll((n) => n.type === "button" && /Deal Flow/.test(flat(n)) && cls(n).includes("mcs-i"))[0];
  await TR.act(async () => { go.props.onClick(); }); await settle();
  const card = s.r.root.findAll((n) => n.type === "article" && n.props["data-goal"] === "gA")[0];
  await TR.act(async () => { byCls(card, "mcs-dg-cta")[0].props.onClick(); }); await settle();
  s.ws = () => s.r.root.findAll((n) => n.type === "div" && n.props.className === "mcs-ws")[0];
  return s;
}

/* ============================================================== A. THE SHOP */
/* RESTATED (M3A A3, founder-authorized): Select Trade is in production now. After an agreed price the shop is told, in the server's words, that choosing cards is its move — and it can; the "coming soon" moved on to Value Trade (tests/milestone3a3-tp-selection.cjs). */
describe("A. an agreed price, and then Select Trade", () => {
  test("Casey accepts Northline's $11: the shop is told choosing cards is its move — not to wait on Casey", async () => {
    const { st, oppId } = offered([[NL, "proposePrice", { amount: 11 }], [A, "acceptPrice"]]);
    const o = st.get().opportunities.find((y) => y.id === oppId);
    eq([o.agreedPrice, o.stage].join(), "11,select-trade");
    eq(P.projectForActor(st.get(), NL).opportunities.find((y) => y.id === oppId).turn.reason, "select-trade", "the server's next move (RESTATED, M3A A1: choosing trade cards is the shop's own move now)");
    const s = await shop(st);
    eq(s.tags(oppId).join("|"), "Select Trade|Primary goal|Your move");
    const t = flat(s.rec(oppId));
    assert(!/Waiting for Casey|coming soon/.test(t), t);
    assert(/Choose the cards you'd consider from Casey's Trade\/Sell cards/.test(t), t);
    eq(flat(byCls(s.panelOf(oppId), "tps-ph")[0]).split(" ")[0].toLowerCase(), "ready", "not Ready to coordinate");
  });
  test("the agreed price is the record's largest figure, with the prices that led to it and what comes next", async () => {
    const { st, oppId } = offered([[NL, "proposePrice", { amount: 11 }], [A, "acceptPrice"]]);
    const s = await shop(st);
    const box = byCls(s.rec(oppId), "tps-agreed")[0];
    assert(box && box.props["aria-label"] === "Agreed price", "no agreed-price block");
    eq(flat(byCls(box, "tps-agreed-row")[0]), "Agreed price $11");
    eq(byCls(box, "tps-offer-trail")[0].findAll((n) => n.type === "li").map(flat).join(" | "),
      "Casey's offer $10 | Your counter $11 | Casey accepted $11");
    eq(byCls(box, "tps-agreed-next").length, 0, "a coming-soon line under an agreed price");
    assert(byCls(s.rec(oppId), "tps-sel").length === 1, "what comes next is the Select Trade panel");
  });
  test("the shop accepts Casey's $10: the same, at $10", async () => {
    const { st, oppId } = offered([[NL, "acceptPrice"]]);
    const s = await shop(st);
    eq(s.tags(oppId)[0], "Select Trade");
    eq(flat(byCls(s.rec(oppId), "tps-agreed-row")[0]), "Agreed price $10");
  });
});

/* ============================================================ B. BOTH SIDES */
describe("B. both sides say the same agreement — the stored one", () => {
  /* RESTATED (M3A A3, founder-authorized): Select Trade is in production now. After an agreed price the shop is told, in the server's words, that choosing cards is its move — and it can; the "coming soon" moved on to Value Trade (tests/milestone3a3-tp-selection.cjs). */
  test("the Collector's Agreed price and the shop's are the stored agreedPrice; both say Select Trade is under way", async () => {
    const { st, oppId } = offered([[NL, "proposePrice", { amount: 11 }], [A, "acceptPrice"]]);
    const stored = st.get().opportunities.find((y) => y.id === oppId).agreedPrice;
    const t = await shop(st);
    const c = await collector(st);
    const shopSays = flat(byCls(t.rec(oppId), "tps-agreed-row")[0]);
    const collectorSays = byCls(c.ws(), "mcs-ws-prices")[0].children.map(flat).find((r) => /^Agreed price/.test(r));
    eq(shopSays, `Agreed price $${stored}`);
    eq(collectorSays, `Agreed price $${stored}`);
    assert(/Northline Cards is choosing from your Trade\/Sell cards/.test(flat(c.ws())), flat(c.ws()));
    assert(/Choose the cards you'd consider/.test(flat(t.rec(oppId))), flat(t.rec(oppId)));
  });
});

/* ========================================================= C. NOTHING ELSE */
describe("C. nothing else moved", () => {
  test("before agreement the tags are the turn's, and there is no agreed price anywhere", async () => {
    const yours = offered();
    const a = await shop(yours.st);
    assert(a.tags(yours.oppId).includes("Your move"), a.tags(yours.oppId).join("|"));
    const theirs = offered([[NL, "proposePrice", { amount: 11 }]]);
    const b = await shop(theirs.st);
    assert(b.tags(theirs.oppId).includes("Waiting for Casey"), b.tags(theirs.oppId).join("|"));
    for (const [s, id] of [[a, yours.oppId], [b, theirs.oppId]]) {
      eq(byCls(s.rec(id), "tps-agreed").length, 0, "an agreed price before anybody accepted");
      assert(!/Price agreed/.test(flat(s.rec(id))));
    }
  });
  test("a withdrawn deal has no agreed block and no agreed tag", async () => {
    const { st, oppId } = offered([[A, "cancelOpportunity"]]);
    const s = await shop(st);
    eq(byCls(s.rec(oppId), "tps-agreed").length, 0);
    assert(!/Price agreed/.test(flat(s.rec(oppId))));
  });
  test("an agreed deal that was later ended is history: no agreed block, no coming-soon, its own ended line", async () => {
    /* No production button ends an agreed deal; the domain can, with a reason. */
    const { st, oppId } = offered([[NL, "proposePrice", { amount: 11 }], [A, "acceptPrice"], [A, "cancelOpportunity", { reason: "changed my mind" }]]);
    const o = st.get().opportunities.find((y) => y.id === oppId);
    eq([o.declined, o.agreedPrice].join(), "true,11");
    const s = await shop(st);
    eq(byCls(s.rec(oppId), "tps-agreed").length, 0, "an ended deal drawn as an agreement in progress");
    assert(!/coming soon/.test(flat(s.rec(oppId))), flat(s.rec(oppId)));
    assert(/This deal was ended\./.test(flat(s.rec(oppId))), flat(s.rec(oppId)));
  });
  test("an agreed deal whose next move is NOT choosing a trade keeps its own stage and turn tags", async () => {
    const { st, oppId } = offered([[NL, "proposePrice", { amount: 11 }], [A, "acceptPrice"]]);
    const s = await shop(st, (state) => ({ ...state, opportunities: state.opportunities.map((o) => (o.id === oppId
      ? { ...o, turn: { ...o.turn, seat: "tp", reason: "review-trade" } } : o)) }));
    const tags = s.tags(oppId);
    assert(!tags.some((t) => /coming soon/.test(t)), tags.join("|"));
    assert(tags.includes("Your move"), tags.join("|"));
    eq(flat(byCls(s.rec(oppId), "tps-agreed-row")[0]), "Agreed price $11", "the agreed price is still said");
  });
  test("the source decides nothing: it reads turn and agreedPrice, compares no stage, and adds no action", () => {
    const src = fs.readFileSync(path.join(ROOT, "client/tp/sections/Opportunities.jsx"), "utf8");
    const fn = src.slice(src.indexOf("const agreedOn ="), src.indexOf("/* Whose turn, in two words."));
    /* RESTATED (M3A A1): the reason is `select-trade` — the shop's own move to choose trade cards.
       RESTATED (M3A A3, founder-authorized): that move has its control now, so
       there is no "awaiting" state left here to read it — Select Trade reads
       the turn in client/select-trade.jsx. The agreed state still reads only
       agreedPrice, and still compares no stage and reaches no action. */
    assert(/agreedPrice/.test(fn) && !/coming soon/.test(fn), fn);
    assert(!/\.stage|onAccept|onCounter|onDecline|onSend/.test(fn), "the agreed state compares a stage or reaches an action");
  });
});

/* ============================================================== E. WORDS */
describe("E. the shop's price words are the Collector's, each said once", () => {
  test("an offer and a counter stay distinct: Casey's offer, Your counter, Casey's counter, Casey accepted", async () => {
    const { st, oppId } = offered([[NL, "proposePrice", { amount: 12 }], [A, "proposePrice", { amount: 11 }]]);
    const s = await shop(st);
    eq(byCls(s.rec(oppId), "tps-offer-trail")[0].findAll((n) => n.type === "li").map(flat).join(" | "),
      "Casey's offer $10 | Your counter $12 | Casey's counter $11");
    assert(/Casey's counter is \$11\. Your move\./.test(flat(s.rec(oppId))), flat(s.rec(oppId)));
    const w = offered([[NL, "proposePrice", { amount: 11 }]]);
    const t = await shop(w.st);
    assert(/Waiting for Casey to reply to your \$11 counter\./.test(flat(t.rec(w.oppId))), flat(t.rec(w.oppId)));
  });
  test("the asking price is said once, as Asking price; the old words are gone", async () => {
    const { st, oppId } = offered();
    const s = await shop(st);
    const t = flat(s.rec(oppId));
    eq((t.match(/Asking price \$12/g) || []).length, 1, t);
    eq(flat(byCls(s.rec(oppId), "tps-offer-terms")[0]), "Open to Offers");
    assert(!/Proposed Market Price|Listed|offered \$|countered with/.test(t), t);
  });
  test("the agreed price is said once: no small Agreed fact beside the summary", async () => {
    const { st, oppId } = offered([[NL, "proposePrice", { amount: 11 }], [A, "acceptPrice"]]);
    const s = await shop(st);
    const facts = byCls(s.rec(oppId), "tps-fact").map(flat);
    assert(!facts.some((f) => /Agreed/i.test(f)), facts.join("|"));
    eq((flat(s.rec(oppId)).match(/\$11\b/g) || []).length, 3, "the summary, its counter line and its acceptance line");
    /* an ended agreed deal has no summary, so its fact stays */
    const ended = offered([[NL, "proposePrice", { amount: 11 }], [A, "acceptPrice"], [A, "cancelOpportunity", { reason: "changed my mind" }]]);
    const e = await shop(ended.st);
    assert(byCls(e.rec(ended.oppId), "tps-fact").map(flat).includes("Agreed price $11"), "the ended deal lost its agreed price");
  });
  test("the price moves are a full finger's height, and wrap rather than crowd", () => {
    const css = fs.readFileSync(path.join(ROOT, "client/tp/TrustedPartnerShell.jsx"), "utf8");
    assert(/\.tps-offer-do \.tps-go, \.tps-offer-mode \.tps-chip \{ min-height:44px; \}/.test(css), "Accept / Counter / Decline under 44px");
    assert(/\.tps-offer-field input \{ min-height:44px;/.test(css), "the counter box under 44px");
    assert(/\.tps-offer-do, \.tps-offer-mode \{ display:flex; flex-wrap:wrap;/.test(css), "the moves no longer wrap");
  });
});

/* ============================================================= D. PRINTING */
describe("D. a printing in words on the shop's side", () => {
  test("cardLine says the printing as the Collector reads it — never the catalogue's codes", () => {
    eq(NEG.cardLine(MUDKIP), "Mudkip · Ruby & Sapphire · #60 · Normal");
    eq(NEG.cardLine({ ...MUDKIP, finish: "reverse_holofoil" }), "Mudkip · Ruby & Sapphire · #60 · Reverse Holo");
    eq(NEG.cardLine({ ...MUDKIP, finish: "holofoil", printRun: "first_edition", language: "ja" }),
      "Mudkip · Ruby & Sapphire · #60 · Holo · First Edition · JA");
    eq(NEG.cardLine({ cardName: "Mudkip" }), "Mudkip");
    eq(NEG.cardLine(null), null);
  });
  test("the shop's record names the exact card in words", async () => {
    const { st, oppId } = offered();
    const s = await shop(st);
    const sub = flat(byCls(s.rec(oppId), "tps-rec-s")[0]);
    /* RESTATED (M3B B4 polish): a deal says a raw copy one way — "Near Mint · Ungraded". */
    eq(sub, "Mudkip · Ruby & Sapphire · #60 · Normal · Near Mint · Ungraded");
    assert(!/non_holo|not_applicable|\ben\b/.test(flat(s.rec(oppId))), flat(s.rec(oppId)));
  });
  test("one helper for both workspaces: the Collector's re-exports it, and neither imports the other", () => {
    const sample = { ...MUDKIP, finish: "holofoil", stamp: "prerelease" };
    eq(PRESENT.printingLine(sample), PRINTING.printingLine(sample));
    eq(PRESENT.versionLabel(sample), PRINTING.versionLabel(sample));
    const present = fs.readFileSync(path.join(ROOT, "client/collector/present.js"), "utf8");
    assert(/export \{ versionLabel, printingLine \} from "\.\.\/printing\.js";/.test(present));
    assert(!/FINISH_NAMES/.test(present.replace(/\/\*[\s\S]*?\*\//g, "")), "the Collector keeps a second copy of the words");
    const neg = fs.readFileSync(path.join(ROOT, "client/negotiation.jsx"), "utf8");
    assert(/from "\.\/printing\.js"/.test(neg) && !/collector\//.test(neg), "cardLine reaches into the Collector app");
  });
});

run();
