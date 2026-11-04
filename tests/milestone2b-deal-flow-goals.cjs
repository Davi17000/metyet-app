/* ============================================================================
   MILESTONE 2B — DEAL FLOW: ONE GOAL, ITS TRUSTED PARTNERS, ITS ONE DEAL

   The redesigned Collector Deal Flow, rendered from the server's own
   projection of worlds driven by real domain commands:

     A. the counts are the server's match — Trusted Partners, not copies;
        nothing unconnected, unavailable or mismatched is counted
     B. Primary and Secondary Goals are told apart
     C. (was: the accordion — RE-PINNED in Milestone 2C.1, which replaced it
        with one compact card per Goal and View Matches; the card's own
        tests are tests/milestone2c1-goal-cards.cjs)
     D. one active deal per Goal: shown, resumable, and no second offer
     E. the canonical-stage → journey mapping (client/collector/deal-progress.js)
     F. pricing language and the agreed state: nothing past it is offered
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const path = require("path");
const React = require("react");
const TR = require("react-test-renderer");
const esbuild = require("esbuild");
const D = require("../domain/metyet-domain.js");
const P = require("../domain/metyet-projection.js");
const { createStore } = require("./fixture-store.cjs");
const RT = require("../domain/metyet-runtime.js");

const ROOT = path.join(__dirname, "..");
const AT = "2026-11-03";
let seq = 0;
const runtime = () => RT.createRuntime({ now: () => AT, newId: (p = "") => `${p}${++seq}` });
const A = { collectorId: "casey" };
const NL = { partnerId: "nl" };

const world = (over = {}) => createStore({
  partners: [{ id: "nl", name: "Northline Cards", tradeRate: 0.7 },
    { id: "sv", name: "Silver Vale", tradeRate: 0.7 },
    { id: "far", name: "Faraway Games", tradeRate: 0.7 }],
  collectors: [{ id: "casey", name: "Casey" }],
  /* Faraway is NOT connected to Casey */
  relationships: [
    { partnerId: "nl", collectorId: "casey", status: "accepted", at: AT },
    { partnerId: "sv", collectorId: "casey", status: "accepted", at: AT }],
  goals: [], inventory: [], collectorCopies: [], binders: [], binderEntries: [],
  opportunities: [], catalog: [], copyReviews: [], photoRequests: [],
  conversations: [], interests: [],
  ...over,
}, runtime());
const x = (st, actor, cmd, payload) => st.execute(actor, cmd, payload || {});
const okv = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
const goal = (over = {}) => ({ id: "gA", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary",
  desired: { grade: "Raw", condition: "Near Mint" }, ...over });
const copy = (over = {}) => ({ invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", grade: "Raw",
  condition: "Near Mint", ask: 12, cert: "CERT-PRIVATE", cost: 6, ...over });

const build = (rel) => {
  const out = esbuild.buildSync({ entryPoints: [path.join(ROOT, rel)], bundle: true, format: "cjs", write: false,
    logLevel: "silent", jsx: "automatic", platform: "node",
    external: ["react", "react-dom", "react/jsx-runtime", "react-test-renderer"] });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};
const DF = build("client/collector/sections/DealFlow.jsx");
const PG = build("client/collector/deal-progress.js");
const WS = build("client/collector/DealWorkspace.jsx");

const CARDS = { "cc-x": { canonicalCardId: "cc-x", cardName: "Mudkip", expansionName: "Ruby & Sapphire",
  collectorNumber: "60", printRun: "not_applicable", finish: "non_holo", language: "en", imageSmall: "https://example.test/m.png" },
"cc-y": { canonicalCardId: "cc-y", cardName: "Venusaur", expansionName: "Base Set", collectorNumber: "15" } };
const door = { describe: async (ids) => ({ cards: ids.map((id) => CARDS[id]).filter(Boolean) }) };
const settle = async () => { for (let i = 0; i < 10; i += 1) await TR.act(async () => { await new Promise((d) => setTimeout(d, 0)); }); };
const sends = () => ({ onOpenOffer: async () => ({ ok: true }), onOpenDeal: () => {},
  onInspect: async () => ({ ok: true }), onRequestPhotos: async () => ({ ok: true }) });
/* RE-PINNED (Milestone 2C): the negotiation is conducted in the Deal Workspace. */
const workspace = async (st, oppId, props = {}) => {
  const state = P.projectForActor(st.get(), A);
  let r;
  await TR.act(async () => { r = TR.create(React.createElement(WS.default, { state, oppId, onBack: () => {}, onBrowseCards: door,
    onCounterOffer: async () => ({ ok: true }), onAcceptOffer: async () => ({ ok: true }), onWithdrawOffer: async () => ({ ok: true }), ...props })); });
  await settle();
  return r;
};
const render = async (st, props = {}) => {
  const state = P.projectForActor(st.get(), A);
  let r;
  await TR.act(async () => { r = TR.create(React.createElement(DF.default, { state, onBrowseCards: door, ...props })); });
  await settle();
  return { r, state };
};
const textOf = (n) => (typeof n === "string" ? n : (n && n.children ? n.children.map(textOf).join(" ") : ""));
const flat = (n) => textOf(n).replace(/\s+/g, " ");
const cls = (n) => String((n.props && n.props.className) || "").split(" ");
const byCls = (root, c) => root.findAll((n) => typeof n.type === "string" && cls(n).includes(c));
const article = (r, goalId) => (r.root || r).findAll((n) => n.type === "article" && n.props["data-goal"] === goalId)[0];
/* RE-PINNED (Milestone 2C.1): what the accordion's heading said, the Goal's
   card says; what its body listed, View Matches lists. */
const matches = async (st, goalId, props = {}) => {
  const state = P.projectForActor(st.get(), A);
  let r;
  await TR.act(async () => { r = TR.create(React.createElement(DF.GoalMatches, { state, goalId, onBrowseCards: door, ...props })); });
  await settle();
  return r;
};
const buttons = (root) => root.findAll((n) => n.type === "button").map((b) => flat(b).trim());
const entryFor = (st, goalId) => DF.dealFlowGoals(P.projectForActor(st.get(), A)).find((g) => g.goal.id === goalId);

/* ================================================================ A */
describe("A. the counts are the server's match", () => {
  test("no matching Trusted Partner: zero, said plainly", async () => {
    const st = world({ goals: [goal()], inventory: [] });
    const e = entryFor(st, "gA");
    eq([e.partnerCount, e.copyCount].join(), "0,0");
    const { r } = await render(st, sends());
    const head = flat(article(r, "gA"));
    assert(/No Trusted Partner matches yet/.test(head), head);
    eq(buttons(article(r, "gA")).length, 0, "a button with nothing behind it");
    assert(/None of your Trusted Partners has this one right now/.test(flat((await matches(st, "gA")).root)));
  });
  test("two matching Trusted Partners count as two", async () => {
    const st = world({ goals: [goal()], inventory: [copy(), copy({ invId: "i2", partnerId: "sv", ask: 14 })] });
    const e = entryFor(st, "gA");
    eq([e.partnerCount, e.copyCount].join(), "2,2");
    const { r } = await render(st);
    assert(/2 Trusted Partners match/.test(flat(article(r, "gA"))));
    eq(byCls((await matches(st, "gA")).root, "mcs-gm-partner").length, 2, "two partner groups");
  });
  test("two physical copies at one Trusted Partner are one Trusted Partner, two rows", async () => {
    const st = world({ goals: [goal()], inventory: [copy(), copy({ invId: "i2", ask: 13 })] });
    const e = entryFor(st, "gA");
    eq([e.partnerCount, e.copyCount].join(), "1,2");
    const { r } = await render(st);
    /* RE-PINNED (Milestone 2C.1): the card counts Trusted Partners only */
    assert(/1 Trusted Partner matches/.test(flat(article(r, "gA"))) && !/copies/.test(flat(article(r, "gA"))), flat(article(r, "gA")));
    const groups = byCls((await matches(st, "gA")).root, "mcs-gm-partner");
    eq(groups.length, 1);
    eq(byCls(groups[0], "mcs-df-copy").length, 2);
  });
  test("an unconnected partner's copy is not counted, named or listed", async () => {
    const st = world({ goals: [goal()], inventory: [copy({ partnerId: "far", invId: "f1" })] });
    eq(entryFor(st, "gA").partnerCount, 0);
    const { r, state } = await render(st);
    assert(!rows(state.inventory).some((i) => i.invId === "f1"), "the projection carried an unconnected copy");
    assert(!/Faraway/.test(flat(r.root)), "an unconnected partner was named");
  });
  test("a mismatched grade or condition is not a match, and the criteria are not broadened", async () => {
    const st = world({ goals: [goal()], inventory: [copy({ condition: "Damaged" }), copy({ invId: "i2", grade: "PSA 9", condition: null })] });
    const e = entryFor(st, "gA");
    eq([e.partnerCount, e.copyCount, e.nearMiss].join(), "0,0,2");
    const { r } = await render(st, sends());
    assert(/No Trusted Partner matches yet/.test(flat(article(r, "gA"))));
    assert(/Your Trusted Partners have this card in another grade or condition/.test(flat(article(r, "gA"))));
    eq(buttons(article(r, "gA")).length, 0, "View Matches offered with nothing that matches");
    const m = await matches(st, "gA");
    assert(/2 copies of this card are available from your Trusted Partners in a different grade or condition/
      .test(flat(m.root)));
    eq(byCls(m.root, "mcs-df-copy").length, 0, "a mismatched copy was listed");
  });
  test("a match naming a copy the projection did not send is neither drawn nor counted", () => {
    const state = { goals: [goal()], inventory: [], discoveries: [{ goalId: "gA", partnerId: "nl", invIds: ["ghost"] }] };
    const e = DF.dealFlowGoals(state).find((g) => g.goal.id === "gA");
    eq([e.partnerCount, e.copyCount, e.partners.length].join(), "0,0,0");
  });
  test("an archived copy is not counted", async () => {
    const st = world({ goals: [goal()], inventory: [copy({ archived: true })] });
    eq(entryFor(st, "gA").partnerCount, 0);
  });
  test("a partner's private fields never render: no certificate, cost or trade rate", async () => {
    const st = world({ goals: [goal()], inventory: [copy()] });
    const { r } = await render(st, sends());
    const t = flat(r.root) + " " + flat((await matches(st, "gA", sends())).root);
    assert(!/CERT-PRIVATE|\$6\b|0\.7|70%/.test(t), t);
    assert(!/not_applicable|non_holo|\ben\b/.test(t), "an internal printing identifier: " + t);
    assert(!/shop/i.test(t), "storefront wording: " + t);
  });
});
const rows = (v) => (Array.isArray(v) ? v : []);

/* ================================================================ B */
describe("B. Primary and Secondary Goals", () => {
  test("RE-PINNED (Milestone 2C.2): a Secondary Goal is not in Deal Flow at all, and still cannot start a deal", async () => {
    const st = world({ goals: [goal(), goal({ id: "gS", canonicalCardId: "cc-y", tier: "secondary", desired: { grade: "PSA 9" } })],
      inventory: [copy(), copy({ invId: "i9", canonicalCardId: "cc-y", grade: "PSA 9", condition: null })] });
    const { r } = await render(st, { ...sends(), onOpenMatches: () => {} });
    const panels = r.root.findAll((n) => n.type === "section" && cls(n).includes("mcs-dg-sec"));
    eq(panels.map((p) => flat(p.findAll((h) => h.type === "h2")[0]).trim()).join("|"), "Primary Goals");
    assert(article(r, "gA") && !article(r, "gS"), "the Secondary Goal is drawn in Deal Flow");
    assert(!/Secondary|Venusaur/.test(flat(r.root)), "the Secondary Goal is mentioned");
    eq(st.get().goals.find((g) => g.id === "gS").tier, "secondary", "the Secondary Goal itself changed");
    /* Even reached directly, its View Matches never offers a deal */
    const sm = await matches(st, "gS", sends());
    assert(byCls(sm.root, "mcs-df-copy").length === 1, "the Secondary Goal's copy");
    assert(!buttons(sm.root).includes("Make an offer"), "a Secondary Goal offers a deal");
    assert(/offers start from a Primary Goal/.test(flat(sm.root)), "it does not say why");
    assert(buttons((await matches(st, "gA", sends())).root).includes("Make an offer"), "the Primary Goal lost its offer");
  });
  test("the Primary Goal wears the approved state language", async () => {
    const st = world({ goals: [goal()], inventory: [copy()] });
    const { r } = await render(st);
    const chip = article(r, "gA").findAll((n) => n.props && n.props["data-collecting"] === "primary")[0];
    assert(chip && /Primary Goal/.test(flat(chip)), "no Primary chip");
    assert(chip.findAll((n) => n.props && n.props["data-state-icon"] === "primary").length === 1, "no square reticle");
  });
});

/* ================================================================ C */
describe("C. no accordion", () => {
  test("RE-PINNED (Milestone 2C.1): no disclosure control, no hidden region — the card is always whole", async () => {
    const st = world({ goals: [goal()], inventory: [copy()] });
    const { r } = await render(st, { ...sends(), onOpenMatches: () => {} });
    eq(r.root.findAll((n) => n.props && (n.props["aria-expanded"] !== undefined || n.props["aria-controls"] !== undefined)).length, 0,
      "an accordion control remains");
    eq(r.root.findAll((n) => typeof n.type === "string" && n.props.hidden).length, 0, "a hidden region remains");
    eq(buttons(article(r, "gA")).join("|"), "View Matches");
  });
  test("arriving from Browse with Make an Offer opens View Matches on that copy; looking sends nothing", async () => {
    const st = world({ goals: [goal()], inventory: [copy()] });
    let sent = 0;
    const m = await matches(st, "gA", { ...sends(), onOpenOffer: async () => { sent += 1; return { ok: true }; },
      compose: { goalId: "gA", invId: "i1" } });
    const li = m.root.findAll((n) => n.type === "li" && n.props["data-inv"] === "i1")[0];
    assert(byCls(li, "mcs-oo").length === 1, "the composer is not open on that copy");
    eq(sent, 0);
  });
});

/* ================================================================ D */
const withDeal = (moves = []) => {
  const st = world({ goals: [goal()], inventory: [copy(), copy({ invId: "i2", partnerId: "sv", ask: 14 })] });
  const oppId = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 10, at: AT }), "offer");
  for (const m of moves) okv(x(st, m[0], m[1], { oppId, at: AT, ...(m[2] || {}) }), m[1]);
  return { st, oppId };
};
describe("D. one active deal per Goal", () => {
  test("no active deal: every matching copy offers one; no deal block", async () => {
    const st = world({ goals: [goal()], inventory: [copy(), copy({ invId: "i2", partnerId: "sv", ask: 14 })] });
    const { r } = await render(st, { ...sends(), onOpenMatches: () => {} });
    eq(buttons(article(r, "gA")).join("|"), "View Matches");
    eq(r.root.findAll((n) => n.props && n.props["data-opp"]).length, 0, "a deal block with no deal");
    eq(byCls(r.root, "mcs-dg-bar").length, 0, "a progress bar with no deal");
    eq(buttons((await matches(st, "gA", sends())).root).filter((b) => b === "Make an offer").length, 2);
  });
  test("an active deal: named, resumable, others still visible, and no second offer — with the reason", async () => {
    const { st, oppId } = withDeal();
    const before = JSON.stringify(st.get().opportunities);
    const { r } = await render(st, { ...sends(), onOpenMatches: () => {} });
    const art = article(r, "gA");
    const deal = art.findAll((n) => n.props && n.props["data-opp"] === oppId)[0];
    assert(deal, "the active deal is not shown");
    assert(/Market Validation .*Waiting for Northline Cards/.test(flat(deal)), flat(deal));
    /* RE-PINNED (Milestone 2C.1): one action — the deal's; no View Matches */
    eq(buttons(art).join("|"), "View Deal", "the card offers more than its deal");
    const m = await matches(st, "gA", sends());
    eq(byCls(m.root, "mcs-gm-partner").length, 2, "the other matching partner was hidden");
    assert(!buttons(m.root).includes("Make an offer"), "a second offer can be started");
    assert(/can't start while it's active/.test(flat(m.root)), "the reason is not said");
    assert(/In your active deal/.test(flat(m.root.findAll((n) => n.props && n.props["data-inv"] === "i1")[0])));
    eq(JSON.stringify(st.get().opportunities), before, "rendering changed a deal");
    /* and the server agrees: a second offer on the other partner's copy is refused */
    eq(x(st, A, "startOpportunity", { goalId: "gA", invId: "i2", amount: 12, at: AT }).refused, "already-negotiating");
  });
  test("the one action opens the Deal Workspace on this exact deal; the dashboard conducts nothing", async () => {
    const { st, oppId } = withDeal([[NL, "proposePrice", { amount: 11 }]]);
    const opened = [];
    const { r } = await render(st, { ...sends(), onOpenDeal: (...a) => opened.push(a) });
    const deal = r.root.findAll((n) => n.props && n.props["data-opp"] === oppId)[0];
    eq(buttons(deal).join("|"), "Review Counteroffer", "the dashboard deal has more than its one action");
    await TR.act(async () => { byCls(deal, "mcs-dg-cta")[0].props.onClick(); });
    eq(JSON.stringify(opened), JSON.stringify([[oppId, "gA"]]));
  });
  test("Accept, Counter and Withdraw in the workspace send exactly the Collector's moves for this deal", async () => {
    const { st, oppId } = withDeal([[NL, "proposePrice", { amount: 11 }]]);
    const calls = [];
    const r = await workspace(st, oppId, { onAcceptOffer: async (id) => { calls.push(["accept", id]); return { ok: true }; },
      onWithdrawOffer: async (id) => { calls.push(["withdraw", id]); return { ok: true }; } });
    const press = async (label) => { const b = r.root.findAll((n) => n.type === "button" && flat(n).trim() === label)[0];
      await TR.act(async () => { await b.props.onClick(); }); };
    await press("Accept $11");
    await press("Withdraw offer");
    eq(JSON.stringify(calls), JSON.stringify([["accept", oppId], ["withdraw", oppId]]));
  });
});

/* ================================================================ E */
describe("E. canonical stage → journey (deal-progress.js)", () => {
  test("the ten journey steps, in the founder's order", () => {
    eq(PG.JOURNEY.length, 10);
    eq(PG.JOURNEY[0], "Market Validation");
    eq(PG.JOURNEY[9], "Completion Confirmation");
  });
  test("every canonical deal stage is mapped, in order, without gaps or overlaps", () => {
    const stages = D.STAGES.filter((s) => s.group !== "intent").map((s) => s.id);
    eq(Object.keys(PG.STAGE_JOURNEY).join(), stages.join(), "the mapping and the domain's stages differ");
    let next = 1;
    for (const id of stages) {
      const m = PG.STAGE_JOURNEY[id];
      eq(m.first, next, `${id} does not start where the last stage ended`);
      assert(m.last >= m.first, id);
      next = m.last + 1;
    }
    eq(next, 11, "the stages do not cover all ten steps");
  });
  test("the table", () => {
    const at = (stage) => { const p = PG.dealProgress({ stage }); return [p.done, p.label, p.available].join("|"); };
    eq(at("agree-price"), "0|Step 1 of 10 · Market Validation|true");
    eq(at("select-trade"), "1|Step 2 of 10 · Select Trade|false");
    eq(at("value-trade"), "2|Steps 3–4 of 10 · Trade Market Validation, Trade %|false");
    eq(at("deal"), "4|Steps 5–7 of 10 · Final Cash Difference, Final Adjustment, Review & Confirmation|false");
    eq(at("fulfillment"), "7|Steps 8–9 of 10 · Meetup Coordination, Finalized Deal Summary|false");
    eq(at("completed"), "10|Completed|false");
  });
  test("only step 1 is available; a later step is never drawn as available", () => {
    eq(PG.AVAILABLE_THROUGH, 1);
    for (const stage of Object.keys(PG.STAGE_JOURNEY)) {
      for (const s of PG.dealProgress({ stage }).steps) assert(s.available === (s.n === 1), `${stage} step ${s.n}`);
    }
  });
  test("a range is never collapsed to one guessed step", () => {
    const p = PG.dealProgress({ stage: "deal" });
    eq(p.steps.filter((s) => s.state === "current").map((s) => s.n).join(), "5,6,7");
  });
  test("an unknown stage gets no bar and is shown as itself; no deal, nothing", () => {
    eq(JSON.stringify(PG.dealProgress({ stage: "haggling" })), JSON.stringify({ known: false, stage: "haggling", total: 10 }));
    eq(PG.dealProgress(null), null);
  });
});

/* ================================================================ F */
describe("F. pricing language and the agreed state", () => {
  test("opening offer: Proposed Market Price and Your opening offer, in the workspace", async () => {
    const { st, oppId } = withDeal();
    const t = flat((await workspace(st, oppId)).root);
    /* RESTATED (Milestone 2D.2 refinement): the workspace's shorter words —
       the asking price and "Your offer", the one on the table marked. */
    assert(/Northline Cards' asking price \$12/.test(t) && /Your offer Latest \$10/.test(t) && /Waiting for Northline Cards/.test(t), t);
  });
  test("agreed: $11 apart from the $12 snapshot; Select Trade named as unavailable; no action past it", async () => {
    const { st, oppId } = withDeal([[NL, "proposePrice", { amount: 11 }], [A, "acceptPrice"]]);
    const o = st.get().opportunities.find((x) => x.id === oppId);
    eq([o.listedPrice, o.agreedPrice, o.stage].join(), "12,11,select-trade");
    const { r } = await render(st, sends());
    const art = article(r, "gA");
    assert(/Market price agreed .*Select Trade not yet available/.test(flat(art)), flat(art));
    const deal = art.findAll((n) => n.props && n.props["data-opp"] === oppId)[0];
    eq(buttons(deal).join("|"), "View Agreement", "an action other than viewing the agreement");
    assert(!buttons(art).includes("Make an offer"), "an offer can be started on an agreed Goal");
    const w = await workspace(st, oppId);
    const t = flat(w.root);
    /* RESTATED (Milestone 2D.2 refinement): same facts, the new words. */
    for (const part of [/asking price \$12/, /Agreed price \$11/, /Market Validation complete/,
      /Select Trade comes next, and isn't available in MetYet yet/, /doesn't complete the deal/]) {
      assert(part.test(t), `${part}: ${t}`);
    }
    assert(!/Continue|Cash Difference \$|balance|Completed|paid/i.test(t), "something past the price is implied: " + t);
    eq(buttons(w.root).filter((b) => b !== "").join("|"), "", "a button other than Back in the agreed workspace");
  });
  test("the partner's price is never called Market Value, Sale Price or Listed Price", async () => {
    for (const moves of [[], [[NL, "proposePrice", { amount: 11 }]], [[NL, "proposePrice", { amount: 11 }], [A, "acceptPrice"]]]) {
      const { st, oppId } = withDeal(moves);
      const { r } = await render(st, sends());
      const t = flat(r.root) + " " + flat((await workspace(st, oppId)).root);
      assert(!/Market Value|Sale Price|Listed Price|Listed \$/i.test(t), t);
      assert(!/s's\b/.test(t), "an awkward possessive: " + t);
    }
  });
});

run();
