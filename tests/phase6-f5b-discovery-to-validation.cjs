/* ============================================================================
   PHASE 6 P6-F5B — FROM A TRUSTED PARTNER'S COPY TO MARKET VALIDATION
   Discover card → express priority → make an offer → follow Deal Flow.
   Discovering a card is not wanting it: every step is the Collector's own.
     A. the next step    per copy, from the server's own answers (Goal for the
                         exact printing, `discoveries`, live deals)
     B. the routes       Make an Offer opens Deal Flow's existing composer on
                         that exact copy; Open in Deal Flow and Edit your Goal
                         go where they say; nothing is sent by navigating
     C. Market Validation through the real server: the Proposed Market Price
                         is snapshotted; the Collector opens; nothing is
                         agreed until someone accepts; the agreed price is
                         stored apart; Firm on Price; one live offer per card
   No new command. startOpportunity, proposePrice, acceptPrice, addGoal and
   changeCollectingState are reused as they are.
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const path = require("path");
const esbuild = require("esbuild");
const React = require("react");
const TR = require("react-test-renderer");

const ROOT = path.join(__dirname, "..");
const json = (v) => JSON.stringify(v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = async () => { for (let i = 0; i < 8; i += 1) await TR.act(async () => { await sleep(0); }); };
const textOf = (n) => (typeof n === "string" ? n : !n || !n.children ? "" : n.children.map(textOf).join(" "));
const flat = (n) => textOf(n).replace(/\s+/g, " ").trim();
const cls = (n) => String((n.props && n.props.className) || "");
const load = (rel) => {
  const out = esbuild.buildSync({ entryPoints: [path.join(ROOT, rel)], bundle: true, format: "cjs",
    write: false, logLevel: "silent", jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"], define: { "process.env.NODE_ENV": '"production"' } });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};
const stubWindow = () => { if (!global.window) global.window = { addEventListener() {}, removeEventListener() {}, scrollTo() {} }; };

/* ============================================================== C (server first: no fake window yet) */
let ctx = null;
const world = async () => { if (!ctx) ctx = await require("../harness/phase6-world.cjs").serve(); return ctx; };
const send = async (who, command, payload) => {
  const c = await world();
  const r = await fetch(c.url + "api/commands", { method: "POST", headers: { authorization: `Bearer ${who}`, "content-type": "application/json" }, body: JSON.stringify({ command, payload }) });
  const body = await r.json();
  return r.status === 200 ? { ok: true, value: body.value, state: body.state } : { ok: false, refused: body.error && body.error.refused };
};
const view = async () => { const c = await world(); return (await (await fetch(c.url + "api/view", { headers: { authorization: "Bearer casey" } })).json()).state; };
const printings = async () => {
  const c = await world();
  const ctxs = await (await fetch(c.url + "api/card-contexts?pokedex=258&number=60", { headers: { authorization: "Bearer casey" } })).json();
  const cards = (await (await fetch(c.url + `api/card-contexts/${ctxs.contexts[0].cardContextId}`, { headers: { authorization: "Bearer casey" } })).json()).canonicalCards;
  return { normal: cards.find((k) => k.finish === "non_holo").canonicalCardId, reverse: cards.find((k) => k.finish === "reverse_holofoil").canonicalCardId };
};

describe("C. Market Validation through the real server", () => {
  test("Open to Offers: Proposed Market Price $12 snapshotted; Collector opens at $10; shop counters $11; Collector accepts; agreed $11 apart; $12 untouched", async () => {
    const c = await world();
    const { normal } = await printings();
    const goal = await send("casey", "addGoal", { canonicalCardId: normal, tier: "primary", desired: { grade: "Raw", condition: "Near Mint" } });
    assert(goal.ok, json(goal));
    const v0 = await view();
    assert(v0.discoveries.some((d) => d.goalId === goal.value && d.invIds.includes(c.ids.shops.n1)), "the server does not offer this copy to the Goal");
    const opened = await send("casey", "startOpportunity", { goalId: goal.value, invId: c.ids.shops.n1, amount: 10 });
    assert(opened.ok, json(opened));
    let o = (await c.world()).opportunities.find((x) => x.id === opened.value);
    eq(json([o.listedPrice, o.agreedPrice, o.stage, o.priceThread.map((p) => [p.by, p.type, p.amount])]),
      json([12, null, "agree-price", [["collector", "offer", 10]]]));
    eq((await send("casey", "acceptPrice", { oppId: o.id })).refused, "not-your-turn", "the Collector accepted their own offer");
    assert((await send("north", "proposePrice", { oppId: o.id, amount: 11 })).ok);
    assert((await send("casey", "acceptPrice", { oppId: o.id })).ok);
    o = (await c.world()).opportunities.find((x) => x.id === opened.value);
    eq(json([o.listedPrice, o.agreedPrice]), json([12, 11]));
    eq(json(o.priceThread.map((p) => [p.by, p.type, p.amount])), json([["collector", "offer", 10], ["tp", "counter", 11], ["collector", "accept", 11]]));
    /* opening a deal reserves nothing: the copy is still listed as available to Casey */
    eq((await view()).inventory.find((i) => i.invId === c.ids.shops.n1).status, "available");
  });
  test("an opening equal to the Proposed Market Price is only an offer — nothing agreed until the shop accepts", async () => {
    const c = await world();
    const { reverse } = await printings();
    const goal = await send("casey", "addGoal", { canonicalCardId: reverse, tier: "primary", desired: { grade: "PSA 9" } });
    assert(goal.ok, json(goal));
    /* Firm on Price ($85): an opening below it is refused; at it, it opens */
    eq((await send("casey", "startOpportunity", { goalId: goal.value, invId: c.ids.shops.n2, amount: 70 })).refused, "firm-on-price");
    const opened = await send("casey", "startOpportunity", { goalId: goal.value, invId: c.ids.shops.n2, amount: 85 });
    assert(opened.ok, json(opened));
    let o = (await c.world()).opportunities.find((x) => x.id === opened.value);
    eq(json([o.listedPrice, o.firmOnPrice, o.agreedPrice, o.stage]), json([85, true, null, "agree-price"]), "an offer at the price was taken as agreement");
    assert((await send("north", "acceptPrice", { oppId: o.id })).ok);
    o = (await c.world()).opportunities.find((x) => x.id === opened.value);
    eq(json([o.listedPrice, o.agreedPrice]), json([85, 85]));
  });
  test("one live offer per card: a second opening on the same card is refused, and a later price edit does not move the snapshot", async () => {
    const c = await world();
    const { normal } = await printings();
    const g = (await view()).goals.find((x) => x.canonicalCardId === normal);
    const again = await send("casey", "startOpportunity", { goalId: g.id, invId: c.ids.shops.n1, amount: 12 });
    eq(again.refused, "already-negotiating");
    assert((await send("north", "updateInventoryCopy", { invId: c.ids.shops.n1, patch: { ask: 40 } })).ok);
    const o = (await c.world()).opportunities.find((x) => x.goalId === g.id);
    eq(o.listedPrice, 12, "a shelf edit moved a negotiation under way");
  });
  test("eligibility stays the server's: a Goal whose grade differs is refused (criteria-mismatch); an unconnected shop's copy is refused", async () => {
    const c = await world();
    const char = (await view()).goals.find((g) => g.id === c.ids.goal);   // Charizard Primary, wants PSA 9; Northline has PSA 8
    eq((await send("casey", "startOpportunity", { goalId: char.id, invId: c.ids.shops.n3, amount: 1200 })).refused, "criteria-mismatch");
    const { normal } = await printings();
    const g = (await view()).goals.find((x) => x.canonicalCardId === normal);
    const r = await send("casey", "startOpportunity", { goalId: g.id, invId: c.ids.shops.f1, amount: 300 });
    assert(r.ok === false, "an unconnected shop's copy opened a deal");
    c.server.close();
  });
});

/* ============================================================== A, B */
const CardDetail = load("client/collector/CardDetail.jsx").default;
const DF_MOD = load("client/collector/sections/DealFlow.jsx");
const DealFlow = DF_MOD.default;
const { GoalMatches } = DF_MOD;
const P = (id, finish) => ({ canonicalCardId: id, cardContextId: "x60", printRun: "unlimited", finish, language: "en", stamp: "none", printVariation: "standard", status: "active" });
const MUD = { cardContextId: "x60", cardName: "Mudkip", expansionName: "Ruby & Sapphire", collectorNumber: "60", cards: [P("k60n", "non_holo"), P("k60r", "reverse_holofoil")] };
const INV = [
  { invId: "i1", partnerId: "p-north", canonicalCardId: "k60n", grade: "Raw", condition: "Near Mint", ask: 12, firmOnPrice: false, status: "available", grading: { state: "raw", label: "Raw · Near Mint" } },
  { invId: "i2", partnerId: "p-north", canonicalCardId: "k60r", grade: "PSA 9", ask: 85, firmOnPrice: true, status: "available", grading: { state: "graded", label: "PSA 9" } }];
const BASE = { actor: { seat: "collector", collectorId: "c1" }, partners: [{ id: "p-north", name: "Northline Cards" }],
  goals: [], collectorCopies: [], binders: [], binderMemberships: [], inventory: INV, discoveries: [], opportunities: [] };
function card(state0, extra = {}) {
  stubWindow();
  const calls = { save: [], offer: [], open: [], edit: [], added: [] };
  let state = state0; let r;
  const props = () => ({ context: MUD, state, onClose() {},
    onSave: async (step, id) => { calls.save.push([step, id]); return extra.answer ? extra.answer(step) : { ok: true, value: "g-new" }; },
    onAdded: (x) => calls.added.push(x), onMakeOffer: (f) => calls.offer.push(f), onOpenDeal: (f) => calls.open.push(f), onEditGoal: (g) => calls.edit.push(g), onRefresh: async () => {} });
  TR.act(() => { r = TR.create(React.createElement(CardDetail, props())); });
  return { r, calls, setState: async (s) => { state = s; await TR.act(async () => { r.update(React.createElement(CardDetail, props())); }); await settle(); } };
}
const copyRow = (r, inv) => r.root.findAll((n) => n.type === "li" && n.props["data-inv"] === inv)[0];
const btn = (n, re) => n.findAll((x) => x.type === "button" && re.test(flat(x)))[0] || null;
const tap = async (b) => { assert(b, "no such control"); await TR.act(async () => { b.props.onClick({ preventDefault() {} }); }); await settle(); };
const pressedTitles = (r) => r.root.findAll((n) => n.type === "button" && n.props["aria-pressed"] === true).map((n) => (n.findAll((x) => x.type === "b")[0] || { children: [] }).children.join(""));

describe("A. the next step on each copy", () => {
  test("a matching Primary Goal (the server's discovery): Make an Offer names that exact copy, and sends nothing", async () => {
    const s = { ...BASE, goals: [{ id: "g1", canonicalCardId: "k60n", tier: "primary", desired: { grade: "Raw", condition: "Near Mint" } }],
      discoveries: [{ goalId: "g1", partnerId: "p-north", invIds: ["i1"] }] };
    const { r, calls } = card(s);
    const b = btn(copyRow(r, "i1"), /^Make an Offer$/);
    assert(b && cls(b) === "mcs-cd-offer", "Make an Offer is not the filled action");
    await tap(b);
    eq(json(calls.offer), json([{ goalId: "g1", invId: "i1" }]));
    eq(calls.save.length, 0, "Make an Offer sent something");
    assert(btn(copyRow(r, "i2"), /^Add as Primary Goal$/), "the other printing, with no Goal, offers no Add");
  });
  test("no Goal: Add as Primary Goal answers the card's own questions from that copy — and sends nothing until Add", async () => {
    const { r, calls } = card(BASE);
    await tap(btn(copyRow(r, "i2"), /^Add as Primary Goal$/));
    eq(json(pressedTitles(r)), json(["Reverse Holo", "Graded", "PSA 9", "I'm looking for it", "Primary"]));
    eq(calls.save.length, 0, "the prefill sent something");
  });
  test("…then Add: one start-looking for that printing; the card stays open; once the projection carries the Goal, the same copy offers Make an Offer", async () => {
    const c = card(BASE);
    await tap(btn(copyRow(c.r, "i2"), /^Add as Primary Goal$/));
    await tap(c.r.root.findAll((n) => n.type === "button" && cls(n).includes("mcs-cd-add"))[0]);
    eq(json(c.calls.save.map(([st, id]) => [st.kind, st.tier, st.desired, id])), json([["start-looking", "primary", { grade: "PSA 9" }, "k60r"]]));
    await TR.act(async () => { await sleep(1200); });
    eq(c.calls.added.length, 0, "the card closed");
    await tap(c.r.root.findAll((n) => n.type === "button" && cls(n).includes("mcs-cd-add"))[0]);
    eq(c.calls.save.length, 1, "a second Add was sent");
    await c.setState({ ...BASE, goals: [{ id: "g-new", canonicalCardId: "k60r", tier: "primary", desired: { grade: "PSA 9" } }],
      discoveries: [{ goalId: "g-new", partnerId: "p-north", invIds: ["i2"] }] });
    assert(btn(copyRow(c.r, "i2"), /^Make an Offer$/), "the copy does not offer Make an Offer once the Goal exists");
    eq(c.calls.offer.length, 0, "an offer was started automatically");
  });
  test("a Secondary Goal: Make it Primary sends the approved state change, same Goal — nothing else", async () => {
    const s = { ...BASE, goals: [{ id: "g1", canonicalCardId: "k60n", tier: "secondary", desired: { grade: "Raw", condition: "Near Mint" } }] };
    const { r, calls } = card(s);
    assert(/You're interested in this card \(Secondary\)\./.test(flat(copyRow(r, "i1"))));
    await tap(btn(copyRow(r, "i1"), /^Make it Primary$/));
    eq(json(calls.save.map(([st]) => st)), json([{ kind: "change-state", goalId: "g1", from: "secondary", to: "primary" }]));
    eq(calls.offer.length, 0);
  });
  test("Make it Primary refused: said on that copy", async () => {
    const s = { ...BASE, goals: [{ id: "g1", canonicalCardId: "k60n", tier: "secondary", desired: { grade: "Raw", condition: "Near Mint" } }] };
    const { r } = card(s, { answer: () => ({ ok: false, refused: "goal-locked" }) });
    await tap(btn(copyRow(r, "i1"), /^Make it Primary$/));
    assert(/This Goal is part of an active deal/.test(flat(copyRow(r, "i1"))), flat(copyRow(r, "i1")));
  });
  test("a live deal on this card: 'under way with …' and Open in Deal Flow (a link, not an offer); no Make an Offer for that card", async () => {
    const s = { ...BASE, goals: [{ id: "g1", canonicalCardId: "k60n", tier: "primary", desired: { grade: "Raw", condition: "Near Mint" } }],
      discoveries: [{ goalId: "g1", partnerId: "p-north", invIds: ["i1"] }],
      opportunities: [{ id: "o1", goalId: "g1", partnerId: "p-north", canonicalCardId: "k60n", turn: { active: true } }] };
    const { r, calls } = card(s);
    const row = copyRow(r, "i1");
    assert(/Your offer for this card is under way with Northline Cards\./.test(flat(row)), flat(row));
    eq(btn(row, /^Make an Offer$/), null);
    const link = btn(row, /^Open in Deal Flow$/);
    eq(cls(link), "mcs-linkish");
    await tap(link);
    eq(json(calls.open), json([{ goalId: "g1" }]));
  });
  test("a Primary Goal for a different grade: explained, with a route to edit the Goal — never changed for them", async () => {
    const s = { ...BASE, goals: [{ id: "g2", canonicalCardId: "k60r", tier: "primary", desired: { grade: "PSA 10" } }] };
    const { r, calls } = card(s);
    const row = copyRow(r, "i2");
    assert(/Your Goal is for PSA 10; this copy is PSA 9\./.test(flat(row)), flat(row));
    eq(btn(row, /^Make an Offer$/), null);
    await tap(btn(row, /^Edit your Goal in Binders$/));
    eq(json(calls.edit), json(["g2"])); eq(calls.save.length, 0);
  });
});

describe("B. the routes", () => {
  const DFSTATE = { ...BASE, goals: [{ id: "g1", canonicalCardId: "k60n", tier: "primary", desired: { grade: "Raw", condition: "Near Mint" } }],
    discoveries: [{ goalId: "g1", partnerId: "p-north", invIds: ["i1"], canonicalCardId: "k60n", tier: "primary", collectorId: "c1" }], copyReviews: [], photoRequests: [] };
  const deal = async (focus) => {
    stubWindow();
    const used = []; const offers = [];
    let r;
    await TR.act(async () => { r = TR.create(React.createElement(DealFlow, { state: DFSTATE, focus, onFocusUsed: () => used.push(1),
      onOpenOffer: async (...a) => { offers.push(a); return { ok: true }; }, onBrowseCards: { describe: async () => ({ cards: [] }) } })); });
    await settle();
    return { r, used, offers };
  };
  /* RE-PINNED (Milestone 2C.1): the copies, and the composer, moved from the
     Goal's accordion to View Matches — the shell opens it for that Goal with
     the copy Browse named, so that is what is rendered here. */
  const matches = async (compose) => {
    stubWindow();
    const offers = [];
    let r;
    await TR.act(async () => { r = TR.create(React.createElement(GoalMatches, { state: DFSTATE, goalId: "g1", compose,
      onOpenOffer: async (...a) => { offers.push(a); return { ok: true }; }, onBrowseCards: { describe: async () => ({ cards: [] }) } })); });
    await settle();
    return { r, offers };
  };
  test("Make an Offer arrives in Deal Flow with the existing composer open on that exact copy — and nothing sent", async () => {
    const { r, offers } = await matches({ goalId: "g1", invId: "i1" });
    const li = r.root.findAll((n) => n.type === "li" && n.props["data-inv"] === "i1")[0];
    /* RE-PINNED (Milestone 2C.2): the Collector's opening-offer composer */
    assert(li && li.findAll((n) => cls(n) === "mcs-oo").length === 1, "the composer is not open on that copy");
    assert(/Proposed Market Price from Northline Cards \$12/.test(flat(li)) && /Open to Offers/.test(flat(li)), flat(li));
    eq(offers.length, 0, "an offer was sent by arriving");
  });
  test("Open in Deal Flow arrives with no composer open", async () => {
    const { r, used } = await deal({ goalId: "g1", compose: false });
    eq(r.root.findAll((n) => cls(n) === "mcs-oo").length, 0);
    eq(used.length, 1, "the landing did not take its focus");
    /* and View Matches, opened from the Goal's card, opens no composer either */
    eq((await matches(null)).r.root.findAll((n) => cls(n) === "mcs-oo").length, 0);
  });
});

run();
