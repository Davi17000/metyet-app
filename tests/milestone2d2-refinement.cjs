/* ============================================================================
   MILESTONE 2D.2 REFINEMENT — THE CARD, THE NEGOTIATION, THE NEXT ACTION

   The Collector's Deal Workspace, rendered through the real shell over
   projections of worlds driven by real domain commands:

     A. the price summary: the asking price, the Collector's latest offer and
        the partner's latest counter, the one on the table marked Latest; an
        Agreed price only after an explicit acceptance; the context kept as
        the deal moves on; the actions are the server's
     B. the card viewer from the workspace header, at every stage: the exact
        card, the catalogue's front only, no back invented, a partner's photo
        references never drawn, a clean close
     C. the shorter words
   Two-sided messaging, nonces and retries stay in
   tests/milestone2d2-deal-messaging-ui.cjs.
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
const AT = "2026-11-03T15:04:00.000Z";
let seq = 0;
const runtime = () => RT.createRuntime({ now: () => AT, newId: (p = "") => `${p}${++seq}` });
const A = { collectorId: "casey" };
const NL = { partnerId: "nl" };
const SV = { partnerId: "sv" };
/* A partner's photo references — what the domain stores, and what must never
   become an image source. */
const REF = { front: "https://tp-photos.example/i1-front.jpg", back: "https://tp-photos.example/i1-back.jpg" };

const world = () => createStore({
  partners: [{ id: "nl", name: "Northline Cards", tradeRate: 0.7 }, { id: "sv", name: "Silver Vale", tradeRate: 0.7 }],
  collectors: [{ id: "casey", name: "Casey" }],
  relationships: [
    { partnerId: "nl", collectorId: "casey", status: "accepted", at: AT },
    { partnerId: "sv", collectorId: "casey", status: "accepted", at: AT }],
  goals: [
    { id: "gA", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "Raw", condition: "Near Mint" } },
    { id: "gB", collectorId: "casey", canonicalCardId: "cc-y", tier: "primary", desired: { grade: "PSA 9" } }],
  inventory: [
    { invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", grade: "Raw", condition: "Near Mint", ask: 12, cost: 6, photos: REF },
    { invId: "i3", partnerId: "sv", canonicalCardId: "cc-y", grade: "PSA 9", ask: 300, cost: 150 }],
  collectorCopies: [], binders: [], binderEntries: [], opportunities: [], catalog: [], copyReviews: [],
  photoRequests: [], conversations: [], interests: [],
}, runtime());
const x = (st, actor, cmd, payload) => st.execute(actor, cmd, { at: AT, ...(payload || {}) });
const okv = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
/* A deal on Northline's Mudkip: Casey offers $10, then the moves given. */
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
const { priceRows } = build("client/negotiation.jsx");
/* Mudkip has catalogue images (front only, as every catalogue does);
   Charizard has none. */
const CARDS = {
  "cc-x": { canonicalCardId: "cc-x", cardName: "Mudkip", expansionName: "Ruby & Sapphire", collectorNumber: "60",
    printRun: "not_applicable", finish: "non_holo", language: "en",
    imageSmall: "https://images.catalog.example/rs/60.png", imageLarge: "https://images.catalog.example/rs/60_hires.png" },
  "cc-y": { canonicalCardId: "cc-y", cardName: "Charizard", expansionName: "Base Set", collectorNumber: "4" } };
const door = { describe: async (ids) => ({ cards: ids.map((id) => CARDS[id]).filter(Boolean) }) };
const settle = async () => { for (let i = 0; i < 10; i += 1) await TR.act(async () => { await new Promise((d) => setTimeout(d, 0)); }); };

const textOf = (n) => (typeof n === "string" ? n : (n && n.children ? n.children.map(textOf).join(" ") : ""));
const flat = (n) => textOf(n).replace(/\s+/g, " ");
const cls = (n) => String((n.props && n.props.className) || "").split(" ");
const byCls = (root, c) => root.findAll((n) => typeof n.type === "string" && cls(n).includes(c));
const btn = (root, label) => root.findAll((n) => n.type === "button" && (flat(n).trim() === label
  || n.props["aria-label"] === label))[0] || null;

async function collector(st) {
  const s = { sent: [], messages: [], focused: [] };
  const send = (cmd) => async (payload) => { s.sent.push(cmd); const r = x(st, A, cmd, payload); await s.rerender(); return r; };
  const props = () => ({
    state: P.projectForActor(st.get(), A), onSignOut: () => {}, onBrowseCards: door,
    onOpenOffer: (goalId, invId, price) => send("startOpportunity")({ goalId, invId, ...price }),
    onCounterOffer: (oppId, price) => send("proposePrice")({ oppId, ...price }),
    onAcceptOffer: (oppId) => send("acceptPrice")({ oppId }),
    onWithdrawOffer: (oppId) => send("cancelOpportunity")({ oppId }),
    onInspect: async () => ({ ok: true }), onRequestPhotos: async () => { s.sent.push("requestPhotos"); return { ok: true }; },
    onRefresh: async () => { await s.rerender(); },
    onSendMessage: async (oppId, text, nonce) => {
      s.messages.push(text);
      const r = x(st, A, "sendDealMessage", { oppId, text, nonce });
      await s.rerender();
      return r;
    },
  });
  const el = () => React.createElement(CollectorShell, props());
  /* Refs get a focus() that records who was focused, so a closed viewer can
     be seen to hand focus back to the picture that opened it. */
  const createNodeMock = (node) => ({ focus: () => s.focused.push(String(node.props.className || node.type)),
    scrollIntoView: () => {} });
  s.rerender = async () => { await TR.act(async () => { s.r.update(el()); }); };
  await TR.act(async () => { s.r = TR.create(el(), { createNodeMock }); });
  await settle();
  s.go = async (label) => { const b = s.r.root.findAll((n) => n.type === "button" && flat(n).includes(label) && cls(n).includes("mcs-i"))[0];
    await TR.act(async () => { b.props.onClick(); }); await settle(); };
  s.goal = (id) => s.r.root.findAll((n) => n.type === "article" && n.props["data-goal"] === id)[0] || null;
  s.ws = () => s.r.root.findAll((n) => n.type === "div" && n.props.className === "mcs-ws")[0] || null;
  s.open = async (goalId) => { await s.go("Deal Flow"); await TR.act(async () => { byCls(s.goal(goalId), "mcs-dg-cta")[0].props.onClick(); }); await settle(); };
  s.stage = () => byCls(s.ws(), "mcs-ws-stage")[0];
  s.rows = () => s.stage().findAll((n) => n.type === "dl")[0]
    ? s.stage().findAll((n) => n.type === "dl")[0].children.map((d) => flat(d).trim()) : [];
  s.buttons = () => s.stage().findAll((n) => n.type === "button").map((b) => flat(b).trim()).join("|");
  s.turn = () => flat(byCls(s.ws(), "mcs-ws-turn")[0]).trim();
  s.thumb = () => byCls(s.ws(), "mcs-ws-artbtn")[0] || null;
  s.viewer = () => s.r.root.findAll((n) => n.type === "div" && n.props.role === "dialog")[0] || null;
  s.view = async () => { await TR.act(async () => { s.thumb().props.onClick(); }); await settle(); };
  s.talk = () => byCls(s.ws(), "mcs-msg")[0] || null;
  return s;
}

const imgs = (root) => root.findAll((n) => n.type === "img").map((n) => n.props.src);

/* =========================================================== A. PRICES */
describe("A. the price summary: every figure that matters, from the canonical deal", () => {
  test("opening offer: the asking price and Casey's offer, marked Latest; waiting; Withdraw only", async () => {
    const { st } = offered();
    const s = await collector(st); await s.open("gA");
    eq(s.rows().join("|"), "Northline Cards' asking price $12|Your offer Latest $10");
    eq(s.turn(), "Waiting for Northline Cards");
    eq(s.buttons(), "Withdraw offer");
  });
  test("Northline counters $11: all three figures, the counter Latest; Casey may Accept $11, Counter or Withdraw", async () => {
    const { st } = offered([[NL, "proposePrice", { amount: 11 }]]);
    const s = await collector(st); await s.open("gA");
    eq(s.rows().join("|"), "Northline Cards' asking price $12|Your offer $10|Northline Cards' counter Latest $11");
    eq(s.turn(), "Your turn · Review counteroffer");
    eq(s.buttons(), "Accept $11|Counter|Withdraw offer");
    assert(!/Agreed/.test(flat(s.stage())), "an agreed price before anybody accepted");
  });
  test("Casey counters back (the manual-review state): Casey's counter is Latest, Northline's $11 stays visible", async () => {
    const { st, oppId } = offered([[NL, "proposePrice", { amount: 11 }], [A, "proposePrice", { amount: 10 }]]);
    const s = await collector(st); await s.open("gA");
    eq(s.rows().join("|"), "Northline Cards' asking price $12|Your offer Latest $10|Northline Cards' counter $11");
    eq(s.turn(), "Waiting for Northline Cards");
    eq(s.buttons(), "Withdraw offer");
    eq(st.get().opportunities.find((o) => o.id === oppId).priceThread.map((e) => `${e.by}:${e.type}:${e.amount}`).join(),
      "collector:offer:10,tp:counter:11,collector:counter:10", "the canonical record");
  });
  test("a later counter replaces the earlier one per side — one row each, never a ledger", async () => {
    const { st } = offered([[NL, "proposePrice", { amount: 11 }], [A, "proposePrice", { amount: 10 }],
      [NL, "proposePrice", { amount: 12 }], [A, "proposePrice", { amount: 11 }]]);
    const s = await collector(st); await s.open("gA");
    eq(s.rows().join("|"), "Northline Cards' asking price $12|Your offer Latest $11|Northline Cards' counter $12");
    assert(!/Price history|offered \$|countered with/i.test(flat(s.ws())), flat(s.ws()));
  });
  test("explicit acceptance: Casey accepts $11 — once — and Agreed price appears, the context kept, nothing Latest", async () => {
    const { st, oppId } = offered([[NL, "proposePrice", { amount: 11 }]]);
    const s = await collector(st); await s.open("gA");
    await TR.act(async () => { await btn(s.stage(), "Accept $11").props.onClick(); });
    await settle();
    eq(JSON.stringify(s.sent), JSON.stringify(["acceptPrice"]));
    const o = st.get().opportunities.find((y) => y.id === oppId);
    eq([o.listedPrice, o.agreedPrice, o.stage].join(), "12,11,select-trade");
    eq(s.rows().join("|"), "Northline Cards' asking price $12|Your offer $10|Northline Cards' counter $11|Agreed price $11");
    eq(s.buttons(), "", "price actions after agreement");
    eq(s.turn(), "Market price agreed");
  });
  test("Northline accepts Casey's offer: Agreed price is Casey's $10, with no counter invented", async () => {
    const { st } = offered([[NL, "acceptPrice"]]);
    const s = await collector(st); await s.open("gA");
    eq(s.rows().join("|"), "Northline Cards' asking price $12|Your offer $10|Agreed price $10");
  });
  test("withdrawn: the figures stay, nothing is Latest or Agreed, no actions, and it says so", async () => {
    const { st } = offered([[NL, "proposePrice", { amount: 11 }]]);
    const s = await collector(st); await s.open("gA");
    await TR.act(async () => { await btn(s.stage(), "Withdraw offer").props.onClick(); });
    await settle();
    eq(s.rows().join("|"), "Northline Cards' asking price $12|Your offer $10|Northline Cards' counter $11");
    eq(s.buttons(), "");
    eq(s.turn(), "You withdrew this offer.");
  });
  test("chat is not acceptance: \"I accept $11\" is a message; the deal, its figures and its buttons are unchanged", async () => {
    const { st, oppId } = offered([[NL, "proposePrice", { amount: 11 }]]);
    const s = await collector(st); await s.open("gA");
    const before = JSON.stringify(st.get().opportunities.find((o) => o.id === oppId));
    const box = s.talk().findAll((n) => n.type === "textarea")[0];
    await TR.act(async () => { box.props.onChange({ target: { value: "I accept $11" } }); });
    await TR.act(async () => { await s.talk().findAll((n) => n.type === "form")[0].props.onSubmit({ preventDefault() {} }); });
    await settle();
    eq(JSON.stringify(s.messages), JSON.stringify(["I accept $11"]));
    eq(JSON.stringify(s.sent), "[]", "a deal command was sent");
    eq(JSON.stringify(st.get().opportunities.find((o) => o.id === oppId)), before, "the deal changed");
    eq(s.rows().join("|"), "Northline Cards' asking price $12|Your offer $10|Northline Cards' counter Latest $11");
    eq(s.buttons(), "Accept $11|Counter|Withdraw offer");
  });
  test("priceRows reads only what is there: no asking price, no moves, bad amounts and an agreedPrice while open say nothing", () => {
    const open = { seat: "collector", reason: "price", amount: 11, active: true, priceOpen: true };
    eq(priceRows(null, "collector", "X").length, 0);
    eq(priceRows({ priceThread: [], turn: open }, "collector", "X").length, 0);
    eq(priceRows({ listedPrice: 0, priceThread: [{ by: "collector", type: "offer", amount: "10" },
      { by: "tp", type: "counter", amount: NaN }], turn: open }, "collector", "X").length, 0);
    /* the server says the price is still open: whatever agreedPrice a row
       carries, it is not an agreement */
    eq(priceRows({ listedPrice: 12, agreedPrice: 11, priceThread: [{ by: "collector", type: "offer", amount: 10 },
      { by: "tp", type: "counter", amount: 11 }], turn: open }, "collector", "Silver Vale").map((r) => r.label).join("|"),
      "Silver Vale's asking price|Your offer|Silver Vale's counter");
    /* an accept entry is not an offer */
    eq(priceRows({ listedPrice: 12, agreedPrice: 10, priceThread: [{ by: "collector", type: "offer", amount: 10 },
      { by: "tp", type: "accept", amount: 10 }], turn: { ...open, priceOpen: false } }, "collector", "X").map((r) => r.key).join(),
      "asking,yours,agreed");
  });
  test("the summary decides nothing: the buttons come from the server's turn, not from the rows", () => {
    const neg = fs.readFileSync(path.join(ROOT, "client/negotiation.jsx"), "utf8");
    const fn = neg.slice(neg.indexOf("export function priceRows("), neg.indexOf("/* One sentence: where this deal stands"));
    assert(fn.length > 100 && !/onAccept|onCounter|onWithdraw|execute|fetch/.test(fn), "priceRows reaches an action");
    const parts = fs.readFileSync(path.join(ROOT, "client/collector/deal-parts.jsx"), "utf8");
    assert(!/priceRows/.test(parts.slice(parts.indexOf("export function NegotiationControls("))), "the controls read the summary");
  });
});

/* =========================================================== B. VIEWER */
describe("B. the card viewer, from the Deal Workspace's own picture", () => {
  test("the header picture is a button that opens the exact card: name, printing, grade and partner", async () => {
    const { st } = offered([[NL, "proposePrice", { amount: 11 }]]);
    const s = await collector(st); await s.open("gA");
    eq(s.thumb().props["aria-label"], "View card: Mudkip, catalog image");
    assert(/Mudkip/.test(flat(byCls(s.ws(), "mcs-ws-title")[0])) && /Ruby & Sapphire · #60/.test(flat(byCls(s.ws(), "mcs-ws-sub")[0])));
    await s.view();
    const v = s.viewer();
    assert(v && v.props["aria-modal"] === "true", "no dialog");
    eq(flat(v.findAll((n) => n.props && n.props.id === v.props["aria-labelledby"])[0]).trim(),
      "Mudkip Normal · Raw · Near Mint · Northline Cards");
    eq(JSON.stringify(s.sent), "[]", "opening the viewer sent something");
  });
  test("the catalogue's front only — the large image, labelled as the printing — and no back image invented", async () => {
    const { st } = offered();
    const s = await collector(st); await s.open("gA");
    await s.view();
    eq(JSON.stringify(imgs(s.viewer())), JSON.stringify([CARDS["cc-x"].imageLarge]));
    eq(s.viewer().findAll((n) => n.props && n.props.role === "img")[0].props["aria-label"], "Catalog image of Mudkip");
    assert(/Catalog image — it shows the printing, not this copy's condition\./.test(flat(s.viewer())));
    assert(/No back image\./.test(flat(s.viewer())), flat(s.viewer()));
  });
  test("a partner's photo references are said, never drawn — anywhere on the screen", async () => {
    const { st } = offered();
    const s = await collector(st); await s.open("gA");
    await s.view();
    assert(/Northline Cards has added photos of this copy \(front and back\), but MetYet can't show them yet\./.test(flat(s.viewer())), flat(s.viewer()));
    const all = imgs(s.r.root);
    assert(!all.some((src) => /tp-photos/.test(String(src))), `a reference was drawn: ${all}`);
    assert(all.every((src) => src === CARDS["cc-x"].imageSmall || src === CARDS["cc-x"].imageLarge), `an image outside the catalogue: ${all}`);
  });
  test("a card with no catalogue image: no picture, said plainly, and still no back", async () => {
    const st = world();
    okv(x(st, A, "startOpportunity", { goalId: "gB", invId: "i3", amount: 280 }), "open");
    const s = await collector(st); await s.open("gB");
    eq(s.thumb().props["aria-label"], "View card: Charizard, no picture yet");
    await s.view();
    eq(imgs(s.viewer()).length, 0);
    assert(/There's no picture of this card yet\. No back image\./.test(flat(s.viewer())), flat(s.viewer()));
    assert(!/added photos/.test(flat(s.viewer())), "photos claimed for a copy with none");
  });
  test("Close, Escape and a tap outside each close it; focus returns to the picture; nothing is sent", async () => {
    const { st } = offered();
    const s = await collector(st); await s.open("gA");
    for (const how of ["close", "escape", "outside"]) {
      await s.view();
      assert(s.viewer(), `${how}: did not open`);
      s.focused.length = 0;
      await TR.act(async () => {
        const v = s.viewer();
        if (how === "close") btn(v, "Close").props.onClick();
        if (how === "escape") v.props.onKeyDown({ key: "Escape" });
        if (how === "outside") v.props.onClick({ target: v, currentTarget: v });
      });
      await settle();
      eq(s.viewer(), null, `${how}: still open`);
      assert(s.focused.includes("mcs-ws-artbtn"), `${how}: focus went to ${s.focused}`);
    }
    /* a tap on the card itself is not a tap outside */
    await s.view();
    await TR.act(async () => { const v = s.viewer(); v.props.onClick({ target: {}, currentTarget: v }); });
    assert(s.viewer(), "a tap inside closed it");
    eq(JSON.stringify(s.sent), "[]");
    eq(JSON.stringify(s.messages), "[]");
  });
  test("it stays reachable at every stage: open, countered, agreed and withdrawn", async () => {
    const stages = {
      open: [], countered: [[NL, "proposePrice", { amount: 11 }]],
      agreed: [[NL, "proposePrice", { amount: 11 }], [A, "acceptPrice"]],
      withdrawn: [[NL, "proposePrice", { amount: 11 }]] };
    for (const [name, moves] of Object.entries(stages)) {
      const { st } = offered(moves);
      const s = await collector(st); await s.open("gA");
      /* An ended deal leaves Deal Flow's list, so it is seen where the
         Collector ends it: in the workspace, which stays on that deal. */
      if (name === "withdrawn") {
        await TR.act(async () => { await btn(s.stage(), "Withdraw offer").props.onClick(); });
        await settle();
        eq(s.turn(), "You withdrew this offer.");
      }
      assert(s.thumb(), `${name}: no picture to tap`);
      await s.view();
      assert(s.viewer() && /Mudkip/.test(flat(s.viewer())), `${name}: no viewer`);
    }
  });
  test("the viewer is one component, shared with View Matches, and builds no URL", () => {
    const v = fs.readFileSync(path.join(ROOT, "client/collector/card-viewer.jsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert(!/https?:|<img|fetch\(|new URL|src=\{(?!card)/.test(v), "the viewer reaches for an image itself");
    assert(!/photos\.(front|back)|copy\.photos\[/.test(v), "the viewer reads a photo reference as a picture");
    for (const f of ["client/collector/DealWorkspace.jsx", "client/collector/sections/DealFlow.jsx"]) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      assert(/from "\.{1,2}\/(\.\.\/)?card-viewer\.jsx"|from "\.\.\/card-viewer\.jsx"|from "\.\/card-viewer\.jsx"/.test(src), `${f} has its own viewer`);
      assert(!/function PhotoViewer\(/.test(src), `${f} defines a viewer`);
    }
  });
});

/* =========================================================== C. WORDS */
describe("C. the shorter words, with the meaning kept", () => {
  test("Price negotiation, Refresh messages, a short Message label with a full accessible name, and the chat line", async () => {
    const { st, oppId } = offered([[NL, "proposePrice", { amount: 11 }]]);
    const s = await collector(st); await s.open("gA");
    eq(flat(s.stage().findAll((n) => n.type === "h2")[0]).trim(), "Price negotiation");
    const t = flat(s.ws());
    for (const gone of ["Proposed Market Price", "Counteroffer from", "Your counteroffer", "Your opening offer",
      "Check for new messages", "Agreed Market Price", "Ask Northline Cards about"]) {
      assert(!t.includes(gone), `"${gone}" is still said: ${t}`);
    }
    assert(btn(s.talk(), "Refresh messages"), "no Refresh messages");
    const label = s.talk().findAll((n) => n.type === "label")[0];
    eq(label.props.htmlFor, `mcs-msg-in-${oppId}`);
    eq(flat(label).replace(/\s+/g, " ").trim(), "Message Northline Cards", "the accessible name");
    eq(byCls(label, "mcs-msg-vh").length, 1, "the partner's name is not visually hidden");
    assert(/Chat doesn't confirm a deal\. Offers and acceptance use the price buttons\./.test(flat(s.talk())));
  });
});

run();
