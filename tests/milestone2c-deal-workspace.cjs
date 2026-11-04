/* ============================================================================
   MILESTONE 2C — THE FULL-SCREEN DEAL WORKSPACE

   Deal Flow -> a Goal -> View Deal -> the Deal Workspace -> Back to that Goal,
   through the real Collector shell, over projections of worlds driven by real
   domain commands:

     A. navigation: full screen, one deal by id, Back to Deal Flow and the
        same Goal's card; opening sends and changes nothing
        (RE-PINNED, Milestone 2C.1: the accordion is gone; the Goal card's
        one action opens the workspace)
     B. authorization: only this Collector's own deals; a stale or foreign id
        is refused plainly and shows nothing of the deal it names
     C. the stage area: each price under its own name, the moves only when the
        server says so, and the server's next projection after a move
     D. the conversation: reserved, never simulated, never read for intent
     E. one model: the workspace says the same stage as the dashboard
   (The browser's Back button, a reload and keyboard focus are exercised in a
   real browser by harness/phase6-deal-scenarios.cjs.)
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
const AT = "2026-11-03";
let seq = 0;
const runtime = () => RT.createRuntime({ now: () => AT, newId: (p = "") => `${p}${++seq}` });
const A = { collectorId: "casey" };
const J = { collectorId: "jordan" };
const NL = { partnerId: "nl" };

const world = () => createStore({
  partners: [{ id: "nl", name: "Northline Cards", tradeRate: 0.7 }, { id: "sv", name: "Silver Vale", tradeRate: 0.7 }],
  collectors: [{ id: "casey", name: "Casey" }, { id: "jordan", name: "Jordan" }],
  relationships: [
    { partnerId: "nl", collectorId: "casey", status: "accepted", at: AT },
    { partnerId: "sv", collectorId: "casey", status: "accepted", at: AT },
    { partnerId: "nl", collectorId: "jordan", status: "accepted", at: AT }],
  goals: [
    { id: "gA", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "Raw", condition: "Near Mint" } },
    { id: "gB", collectorId: "casey", canonicalCardId: "cc-y", tier: "primary", desired: { grade: "PSA 9" } },
    { id: "gJ", collectorId: "jordan", canonicalCardId: "cc-y", tier: "primary", desired: { grade: "PSA 9" } }],
  inventory: [
    { invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", grade: "Raw", condition: "Near Mint", ask: 12, cost: 6, cert: "CERT-1" },
    { invId: "i2", partnerId: "sv", canonicalCardId: "cc-x", grade: "Raw", condition: "Near Mint", ask: 14, cost: 7 },
    { invId: "i3", partnerId: "nl", canonicalCardId: "cc-y", grade: "PSA 9", ask: 300, cost: 150 }],
  collectorCopies: [], binders: [], binderEntries: [], opportunities: [], catalog: [], copyReviews: [],
  photoRequests: [], conversations: [], interests: [],
}, runtime());
const x = (st, actor, cmd, payload) => st.execute(actor, cmd, { at: AT, ...(payload || {}) });
const okv = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };

const build = (rel) => {
  const out = esbuild.buildSync({ entryPoints: [path.join(ROOT, rel)], bundle: true, format: "cjs", write: false,
    logLevel: "silent", jsx: "automatic", platform: "node",
    external: ["react", "react-dom", "react/jsx-runtime", "react-test-renderer"] });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};
const Shell = build("client/collector/CollectorShell.jsx").default;
const CARDS = {
  "cc-x": { canonicalCardId: "cc-x", cardName: "Mudkip", expansionName: "Ruby & Sapphire", collectorNumber: "60",
    printRun: "not_applicable", finish: "non_holo", language: "en" },
  "cc-y": { canonicalCardId: "cc-y", cardName: "Charizard", expansionName: "Base Set", collectorNumber: "4" } };
const door = { describe: async (ids) => ({ cards: ids.map((id) => CARDS[id]).filter(Boolean) }) };
const settle = async () => { for (let i = 0; i < 10; i += 1) await TR.act(async () => { await new Promise((d) => setTimeout(d, 0)); }); };

const textOf = (n) => (typeof n === "string" ? n : (n && n.children ? n.children.map(textOf).join(" ") : ""));
const flat = (n) => textOf(n).replace(/\s+/g, " ");
const cls = (n) => String((n.props && n.props.className) || "").split(" ");
const byCls = (root, c) => root.findAll((n) => typeof n.type === "string" && cls(n).includes(c));
const btn = (root, label) => root.findAll((n) => n.type === "button" && (flat(n).trim() === label
  || n.props["aria-label"] === label))[0] || null;

/* A Collector's shell over the store, sending real commands and re-projecting
   after each, the way the production entrance does. */
async function shell(st, actor = A) {
  const sent = [];
  const send = (cmd) => async (payload) => { sent.push(cmd); const r = x(st, actor, cmd, payload); await TR.act(async () => { r2.update(el()); }); await settle(); return r; };
  const props = () => ({
    state: P.projectForActor(st.get(), actor), onSignOut: () => {}, onBrowseCards: door,
    onOpenOffer: (goalId, invId, price) => send("startOpportunity")({ goalId, invId, ...price }),
    onCounterOffer: (oppId, price) => send("proposePrice")({ oppId, ...price }),
    onAcceptOffer: (oppId) => send("acceptPrice")({ oppId }),
    onWithdrawOffer: (oppId) => send("cancelOpportunity")({ oppId }),
    onInspect: async () => ({ ok: true }), onRequestPhotos: async () => ({ ok: true }), onRefresh: async () => {},
  });
  const el = () => React.createElement(Shell, props());
  let r2;
  await TR.act(async () => { r2 = TR.create(el()); });
  await settle();
  const s = { r: r2, sent, rerender: async () => { await TR.act(async () => { r2.update(el()); }); await settle(); } };
  s.go = async (label) => { const b = s.r.root.findAll((n) => n.type === "button" && flat(n).includes(label) && cls(n).includes("mcs-i"))[0];
    await TR.act(async () => { b.props.onClick(); }); await settle(); };
  s.goal = (id) => s.r.root.findAll((n) => n.type === "article" && n.props["data-goal"] === id)[0] || null;
  s.ws = () => s.r.root.findAll((n) => n.type === "div" && n.props.className === "mcs-ws")[0] || null;
  s.cta = async (id) => { await TR.act(async () => { byCls(s.goal(id), "mcs-dg-cta")[0].props.onClick(); }); await settle(); };
  s.back = async () => { await TR.act(async () => { btn(s.ws(), "Back to Deal Flow").props.onClick(); }); await settle(); };
  s.nav = () => s.r.root.findAll((n) => n.type === "nav").length;
  return s;
}
const offered = (moves = []) => {
  const st = world();
  const oppId = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 10 }), "offer");
  for (const [who, cmd, p] of moves) okv(x(st, who, cmd, { oppId, ...(p || {}) }), cmd);
  return { st, oppId };
};

/* ================================================================ A */
describe("A. navigation", () => {
  test("View Deal opens the full-screen workspace on that exact deal, sending and changing nothing", async () => {
    const { st, oppId } = offered();
    const before = JSON.stringify(st.get());
    const s = await shell(st);
    await s.go("Deal Flow");
    await s.cta("gA");
    assert(s.ws(), "no workspace");
    eq(s.ws().props["data-opp"], oppId, "the workspace is not on this deal");
    eq(s.nav(), 0, "the tab bar is still drawn: not full screen");
    eq(s.goal("gA"), null, "the dashboard is still drawn under the workspace");
    eq(s.sent.length, 0, "opening the workspace sent a command");
    eq(JSON.stringify(st.get()), before, "opening the workspace changed the world");
    eq(st.get().opportunities.length, 1, "an opportunity was created");
  });
  test("Back returns to Deal Flow, to the same Goal's card, with every Goal's card as it was", async () => {
    const { st, oppId } = offered();
    const s = await shell(st);
    await s.go("Deal Flow");
    const cards = () => s.r.root.findAll((n) => n.type === "article" && n.props["data-goal"]).map((a) => flat(a));
    const before = cards();
    await s.cta("gA");
    await s.back();
    assert(!s.ws(), "the workspace did not close");
    assert(s.nav() > 0, "the tab bar did not come back");
    eq(JSON.stringify(cards()), JSON.stringify(before), "a Goal's card changed by visiting a deal");
    assert(s.goal("gA").findAll((n) => n.props && n.props["data-opp"] === oppId).length === 1, "the Goal's deal is not on its card");
    const on = s.r.root.findAll((n) => n.type === "button" && cls(n).includes("mcs-i") && n.props["aria-current"] === "page")[0];
    assert(/Deal Flow/.test(flat(on)), "Back did not land in Deal Flow");
  });
  test("the dashboard deal is an overview: no negotiation is conducted on the Goal's card", async () => {
    const { st } = offered([[NL, "proposePrice", { amount: 11 }]]);
    const s = await shell(st);
    await s.go("Deal Flow");
    const labels = s.goal("gA").findAll((n) => n.type === "button").map((b) => flat(b).trim());
    for (const no of ["Accept $11", "Counter", "Withdraw offer"]) assert(!labels.includes(no), `${no} is in the dashboard`);
    eq(s.goal("gA").findAll((n) => n.props && n.props["aria-label"] === "Your offer").length, 0);
  });
  test("every one of the three actions opens the same workspace", async () => {
    for (const [moves, label] of [[[], "View Deal"], [[[NL, "proposePrice", { amount: 11 }]], "Review Counteroffer"],
      [[[NL, "proposePrice", { amount: 11 }], [A, "acceptPrice"]], "View Agreement"]]) {
      const { st, oppId } = offered(moves);
      const s = await shell(st);
      await s.go("Deal Flow");
      eq(flat(byCls(s.goal("gA"), "mcs-dg-cta")[0]).trim(), label);
      await s.cta("gA");
      eq(s.ws() && s.ws().props["data-opp"], oppId, `${label} did not open the deal`);
    }
  });
});

/* ================================================================ B */
describe("B. only this Collector's own deals", () => {
  test("another Collector's deal is not in the projection and cannot be opened", async () => {
    const st = world();
    const theirs = okv(x(st, J, "startOpportunity", { goalId: "gJ", invId: "i3", amount: 277 }), "Jordan's offer");
    /* and Casey has a deal of her own, which a stale id must not fall back to */
    okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 10 }), "Casey's own offer");
    const proj = P.projectForActor(st.get(), A);
    assert(!proj.opportunities.some((o) => o.id === theirs), "a foreign deal reached the projection");
    const s = await shell(st);
    await s.go("Deal Flow");
    /* drive the shell to the foreign id the way a stale link would */
    const DW = build("client/collector/DealWorkspace.jsx").default;
    let r;
    await TR.act(async () => { r = TR.create(React.createElement(DW, { state: proj, oppId: theirs, onBack: () => {}, onBrowseCards: door })); });
    await settle();
    const t = flat(r.root);
    assert(/This deal isn't available/.test(t), t);
    assert(!/277|Jordan|Charizard|300/.test(t), "something of the foreign deal was shown: " + t);
    assert(!/Mudkip|\$10\b|\$12\b/.test(t), "a stale id fell back to another deal: " + t);
    eq(r.root.findAll((n) => n.type === "button").length, 2, "more than the two ways back");
  });
  test("the workspace shows only the active partner's deal, never another partner's price or a partner's books", async () => {
    const { st, oppId } = offered();
    const s = await shell(st);
    await s.go("Deal Flow"); await s.cta("gA");
    const t = flat(s.ws());
    assert(/with Northline Cards/.test(t), t);
    assert(!/Silver Vale|\$14\b|\$6\b|\$7\b|CERT-1|0\.7|70%/.test(t), "another partner or private field: " + t);
    assert(!/not_applicable|non_holo|\ben\b/.test(t), "an internal printing identifier: " + t);
    assert(!new RegExp(oppId).test(t), "the opportunity id is shown");
  });
});

/* ================================================================ C */
describe("C. the stage area", () => {
  test("opening offer: Proposed Market Price, your opening offer, waiting, and Withdraw only", async () => {
    const { st } = offered();
    const s = await shell(st);
    await s.go("Deal Flow"); await s.cta("gA");
    const t = flat(s.ws());
    for (const re of [/Proposed Market Price \$12/, /Your opening offer \$10/, /Waiting for Northline Cards/, /Step 1 of 10 · Market Validation/]) {
      assert(re.test(t), `${re}: ${t}`);
    }
    const stage = byCls(s.ws(), "mcs-ws-stage")[0];
    eq(stage.findAll((n) => n.type === "button").map((b) => flat(b).trim()).join("|"), "Withdraw offer");
  });
  test("counteroffer: Accept updates canonical state, and the workspace shows the server's new projection", async () => {
    const { st, oppId } = offered([[NL, "proposePrice", { amount: 11 }]]);
    const s = await shell(st);
    await s.go("Deal Flow"); await s.cta("gA");
    const stage = () => byCls(s.ws(), "mcs-ws-stage")[0];
    assert(/Counteroffer from Northline Cards \$11/.test(flat(stage())));
    eq(stage().findAll((n) => n.type === "button").map((b) => flat(b).trim()).join("|"), "Accept $11|Counter|Withdraw offer");
    await TR.act(async () => { await btn(stage(), "Accept $11").props.onClick(); });
    await settle();
    eq(JSON.stringify(s.sent), JSON.stringify(["acceptPrice"]), "not exactly one acceptance");
    const o = st.get().opportunities.find((y) => y.id === oppId);
    eq([o.listedPrice, o.agreedPrice, o.stage].join(), "12,11,select-trade");
    eq(s.ws().props["data-opp"], oppId, "the workspace left the deal");
    const t = flat(s.ws());
    assert(/Market price agreed/.test(t) && /Agreed Market Price \$11/.test(t) && /Proposed Market Price \$12/.test(t), t);
    assert(!btn(stage(), "Accept $11") && !btn(stage(), "Withdraw offer"), "price actions remain after agreement");
  });
  test("Counter opens the existing entry box; a counter is one command", async () => {
    const { st, oppId } = offered([[NL, "proposePrice", { amount: 11 }]]);
    const s = await shell(st);
    await s.go("Deal Flow"); await s.cta("gA");
    await TR.act(async () => { btn(s.ws(), "Counter").props.onClick(); });
    const input = s.ws().findAll((n) => n.type === "input")[0];
    await TR.act(async () => { input.props.onChange({ target: { value: "10" } }); });
    const form = s.ws().findAll((n) => n.type === "form")[0];
    await TR.act(async () => { await form.props.onSubmit({ preventDefault() {} }); });
    await settle();
    eq(JSON.stringify(s.sent), JSON.stringify(["proposePrice"]));
    const o = st.get().opportunities.find((y) => y.id === oppId);
    eq(o.priceThread.map((e) => `${e.by}:${e.type}:${e.amount}`).join(), "collector:offer:10,tp:counter:11,collector:counter:10");
    assert(/Waiting for Northline Cards/.test(flat(s.ws())), "the workspace did not follow the server");
  });
  test("agreed: no unresolved action and no next-stage button; Select Trade is named as unavailable", async () => {
    const { st } = offered([[NL, "proposePrice", { amount: 11 }], [A, "acceptPrice"]]);
    const s = await shell(st);
    await s.go("Deal Flow"); await s.cta("gA");
    const t = flat(s.ws());
    assert(/next planned stage is Select Trade, which isn't available in MetYet yet/.test(t), t);
    assert(/doesn't complete the deal/.test(t), t);
    assert(!/Continue|balance|cash difference \$|paid/i.test(t), t);
    eq(s.ws().findAll((n) => n.type === "button").filter((b) => !b.props["aria-label"]).length, 0,
      "a button other than Back");
  });
  test("a withdrawn deal says so and offers nothing; Back still works", async () => {
    const { st, oppId } = offered();
    const s = await shell(st);
    await s.go("Deal Flow"); await s.cta("gA");
    await TR.act(async () => { await btn(s.ws(), "Withdraw offer").props.onClick(); });
    await settle();
    eq(s.ws().props["data-opp"], oppId);
    assert(/You withdrew this offer\./.test(flat(s.ws())), flat(s.ws()));
    eq(byCls(s.ws(), "mcs-ws-stage")[0].findAll((n) => n.type === "button").length, 0);
    await s.back();
    assert(s.goal("gA"), "Back did not return to the Goal");
    assert(/You withdrew this offer\./.test(flat(s.goal("gA"))), "the card does not say what happened");
    eq(s.goal("gA").findAll((n) => n.props && n.props["data-opp"]).length, 0, "an ended deal still shows as active");
  });
});

/* ================================================================ D */
describe("D. the conversation is reserved, not simulated", () => {
  test("it says messaging is unavailable, and draws no message, input or composer", async () => {
    const { st } = offered([[NL, "proposePrice", { amount: 11 }]]);
    const s = await shell(st);
    await s.go("Deal Flow"); await s.cta("gA");
    const talk = byCls(s.ws(), "mcs-ws-talk")[0];
    assert(talk, "no conversation area");
    eq(talk.props["data-messaging"], "unavailable");
    assert(/Messaging isn't available in MetYet yet/.test(flat(talk)));
    eq(talk.findAll((n) => ["input", "textarea", "button", "form", "li"].includes(n.type)).length, 0, "a fake conversation");
    eq(s.ws().findAll((n) => n.type === "textarea").length, 0);
    eq(s.ws().findAll((n) => n.type === "input").length, 0, "an input before anything was pressed");
  });
  test("no messaging command is reached, and no text is read for intent", () => {
    const strip = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const src = ["client/collector/DealWorkspace.jsx", "client/collector/deal-parts.jsx"].map(strip).join("\n");
    for (const no of ["sendMessage", "reachOut", "recordNote", "conversations", "onSendMessage"]) {
      assert(!src.includes(no), `the workspace reaches ${no}`);
    }
    assert(!/\/\s*accept|includes\(\s*["']accept|toLowerCase\(\)/i.test(src), "the workspace reads text for intent");
    assert(!/execute\s*\(|fetch\s*\(|store\./.test(src), "the workspace talks to the server directly");
  });
});

/* ================================================================ E */
describe("E. one progress model, one stage", () => {
  test("the workspace says the same stage and progress as the dashboard", async () => {
    for (const moves of [[], [[NL, "proposePrice", { amount: 11 }]], [[NL, "proposePrice", { amount: 11 }], [A, "acceptPrice"]]]) {
      const { st } = offered(moves);
      const s = await shell(st);
      await s.go("Deal Flow");
      /* RE-PINNED (Milestone 2C.1): the Goal card arranges the same facts in
         its own three lines, so what is compared is the facts — the same bar,
         segment for segment, and the same status — not the layout. */
      const bar = (root) => { const b = root.findAll((n) => n.props && n.props.role === "progressbar")[0];
        return [b.props["aria-valuenow"], b.props["aria-valuemax"], ...byCls(b, "mcs-dg-seg").map((g) => g.props.className)].join("|"); };
      const dash = byCls(s.goal("gA"), "mcs-dg-deal")[0];
      const dashBar = bar(dash);
      const dashText = flat(dash);
      await s.cta("gA");
      const head = byCls(s.ws(), "mcs-ws-hd")[0];
      eq(bar(head), dashBar, "the two bars disagree");
      const status = flat(head.findAll((n) => n.props && n.props.role === "status")[0]).trim();
      assert(dashText.includes(status), `the card does not say "${status}": ${dashText}`);
    }
  });
});

run();
