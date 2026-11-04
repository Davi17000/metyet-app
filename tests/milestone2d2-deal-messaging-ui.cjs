/* ============================================================================
   MILESTONE 2D.2 — THE DEAL'S CONVERSATION, ON BOTH SIDES

   The Collector's Deal Workspace and the Trusted Partner's Opportunities,
   rendered through their real shells over projections of worlds driven by
   real domain commands — `sendDealMessage` included — the way the production
   entrance drives them:

     A. each side sees the same thread, correctly attributed; empty state;
        first send; the other side sees it on its next read
     B. history survives a fresh mount (a reload; the server-level reload and
        restart are tests/milestone2d1-deal-messaging.cjs)
     C. sending: trim and limits; one nonce per composed message, reused on a
        retry and replaced when the text changes; an ambiguous failure is
        never drawn as sent, and is recognised once the server shows it; no
        double send
     D. lifecycle: an ended deal keeps its history and has no composer
     E. isolation: another deal's thread, another shop's deals, and a late
        answer after leaving the deal
     F. the negotiation boundary: a message is never an offer or acceptance
     G. boundaries in the source: one binding, no store, no intent-reading
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
const J = { collectorId: "jordan" };
const NL = { partnerId: "nl" };
const SV = { partnerId: "sv" };

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
    { invId: "i3", partnerId: "nl", canonicalCardId: "cc-y", grade: "PSA 9", ask: 300, cost: 150 },
    { invId: "i4", partnerId: "nl", canonicalCardId: "cc-y", grade: "PSA 9", ask: 310, cost: 160 }],
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
const CollectorShell = build("client/collector/CollectorShell.jsx").default;
const TPShell = build("client/tp/TrustedPartnerShell.jsx").default;
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
const thread = (st, oppId) => (st.get().conversations || []).filter((t) => t.oppId === oppId && t.key === `opp::${oppId}`);
const messages = (st, oppId) => thread(st, oppId).flatMap((t) => t.entries || []);

/* THE ONE MESSAGING BINDING, as the entrance builds it — `(oppId, text,
   nonce)` straight to the command — with a hook a test can use to lose the
   reply, fail before sending, or hold the answer back. */
function messenger(st, actor, rerender) {
  const m = { calls: [], mode: "ok", hold: null };
  m.send = async (oppId, text, nonce) => {
    m.calls.push({ oppId, text, nonce });
    const mode = m.mode;
    if (mode === "unsent") { const e = new Error("unavailable"); e.failure = "unavailable"; throw e; }
    if (mode === "conflict") { const e = new Error("conflict"); e.failure = "conflict"; throw e; }
    if (mode === "hold") await new Promise((d) => { m.hold = d; });
    const r = x(st, actor, "sendDealMessage", { oppId, text, nonce });
    if (mode === "lost") { const e = new Error("unavailable"); e.failure = "unavailable"; throw e; }
    await rerender();
    return r;
  };
  return m;
}

/* A Collector's shell over the store. `refresh` re-projects, the way
   `store.load()` adopts a fresh projection; it can be made to fail. */
async function collector(st, actor = A) {
  const s = { sent: [], refreshes: 0, refreshFails: false };
  const send = (cmd) => async (payload) => { s.sent.push(cmd); const r = x(st, actor, cmd, payload); await s.rerender(); return r; };
  const props = () => ({
    state: P.projectForActor(st.get(), actor), onSignOut: () => {}, onBrowseCards: door,
    onOpenOffer: (goalId, invId, price) => send("startOpportunity")({ goalId, invId, ...price }),
    onCounterOffer: (oppId, price) => send("proposePrice")({ oppId, ...price }),
    onAcceptOffer: (oppId) => send("acceptPrice")({ oppId }),
    onWithdrawOffer: (oppId) => send("cancelOpportunity")({ oppId }),
    onInspect: async () => ({ ok: true }), onRequestPhotos: async () => ({ ok: true }),
    onRefresh: async () => { s.refreshes += 1; if (s.refreshFails) throw new Error("offline"); await s.rerender(); },
    onSendMessage: s.msg.send,
  });
  const el = () => React.createElement(CollectorShell, props());
  s.rerender = async () => { await TR.act(async () => { s.r.update(el()); }); };
  s.msg = messenger(st, actor, () => s.rerender());
  await TR.act(async () => { s.r = TR.create(el()); });
  await settle();
  s.go = async (label) => { const b = s.r.root.findAll((n) => n.type === "button" && flat(n).includes(label) && cls(n).includes("mcs-i"))[0];
    await TR.act(async () => { b.props.onClick(); }); await settle(); };
  s.goal = (id) => s.r.root.findAll((n) => n.type === "article" && n.props["data-goal"] === id)[0] || null;
  s.ws = () => s.r.root.findAll((n) => n.type === "div" && n.props.className === "mcs-ws")[0] || null;
  s.open = async (goalId) => { await s.go("Deal Flow"); await TR.act(async () => { byCls(s.goal(goalId), "mcs-dg-cta")[0].props.onClick(); }); await settle(); };
  s.back = async () => { await TR.act(async () => { btn(s.ws(), "Back to Deal Flow").props.onClick(); }); await settle(); };
  s.talk = () => byCls(s.ws(), "mcs-msg")[0] || null;
  return s;
}

/* A Trusted Partner's shell, on Opportunities. */
async function partner(st, actor = NL) {
  const s = { sent: [] };
  const send = (cmd) => async (payload) => { s.sent.push(cmd); const r = x(st, actor, cmd, payload); await s.rerender(); return r; };
  const props = () => ({
    state: P.projectForActor(st.get(), actor), onSignOut: () => {}, onBrowseCards: door,
    onCounterOffer: (oppId, price) => send("proposePrice")({ oppId, ...price }),
    onAcceptOffer: (oppId) => send("acceptPrice")({ oppId }),
    onDeclineOffer: (oppId) => send("declineOffer")({ oppId }),
    onRefresh: async () => { await s.rerender(); },
    onSendMessage: s.msg.send,
  });
  const el = () => React.createElement(TPShell, props());
  s.rerender = async () => { await TR.act(async () => { s.r.update(el()); }); };
  s.msg = messenger(st, actor, () => s.rerender());
  await TR.act(async () => { s.r = TR.create(el()); });
  await settle();
  const nav = s.r.root.findAll((n) => n.type === "button" && cls(n).includes("tps-item") && /Opportunities/.test(flat(n)))[0];
  await TR.act(async () => { nav.props.onClick(); });
  await settle();
  s.talks = () => byCls(s.r.root, "tps-msg");
  s.talkFor = (oppId) => s.talks().find((t) => t.props["data-thread"] === oppId) || null;
  s.toggle = async (oppId) => {
    const t = byCls(s.r.root, "tps-talk").find((n) => byCls(n, "tps-msg").some((m) => m.props["data-thread"] === oppId));
    await TR.act(async () => { byCls(t, "tps-talk-toggle")[0].props.onClick(); }); await settle();
  };
  return s;
}

const box = (talk) => talk.findAll((n) => n.type === "textarea")[0] || null;
const sendBtn = (talk) => talk.findAll((n) => n.type === "button" && n.props.type === "submit")[0] || null;
const type = async (talk, value) => { await TR.act(async () => { box(talk).props.onChange({ target: { value } }); }); };
const submit = async (talk) => {
  const form = talk.findAll((n) => n.type === "form")[0];
  await TR.act(async () => { await form.props.onSubmit({ preventDefault() {} }); });
  await settle();
};
const bubbles = (talk) => talk.findAll((n) => n.type === "li").map((li) => ({
  who: flat(byCls(li, li.props.className.split(" ")[0].replace("-item", "-who"))[0]).trim(),
  text: flat(byCls(li, li.props.className.split(" ")[0].replace("-item", "-text"))[0]).trim(),
  mine: cls(li).includes("mine"), time: li.findAll((n) => n.type === "time").length }));

const offered = (moves = []) => {
  const st = world();
  const oppId = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 10 }), "offer");
  for (const [who, cmd, p] of moves) okv(x(st, who, cmd, { oppId, ...(p || {}) }), cmd);
  return { st, oppId };
};

/* ================================================================ A */
describe("A. one thread, both sides", () => {
  test("before the first message: an empty state, a labelled box, and Send disabled", async () => {
    const { st, oppId } = offered();
    const s = await collector(st);
    await s.open("gA");
    const t = s.talk();
    eq(t.props["data-thread"], oppId);
    eq(t.props["data-messaging"], "open");
    assert(/Conversation with Northline Cards/.test(flat(t)), flat(t));
    assert(/No messages yet/.test(flat(t)), flat(t));
    eq(t.findAll((n) => n.type === "li").length, 0);
    const label = t.findAll((n) => n.type === "label")[0];
    eq(label.props.htmlFor, box(t).props.id, "the box has no label");
    eq(sendBtn(t).props.disabled, true, "Send is live with nothing typed");
    await type(t, "   \n  ");
    eq(sendBtn(s.talk()).props.disabled, true, "Send is live for blank text");
    eq(s.msg.calls.length, 0);
    /* the conversation sits under the deal, never above it */
    const order = byCls(s.ws(), "mcs-ws-body")[0].findAll((n) => typeof n.type === "string" && n.type === "section")
      .map((n) => cls(n)[0]);
    eq(order.join(), "mcs-ws-stage,mcs-msg");
  });

  test("a Collector's first message: trimmed, sent once with a nonce, shown only once the server holds it", async () => {
    const { st, oppId } = offered();
    const s = await collector(st);
    await s.open("gA");
    await type(s.talk(), "  Is the corner as sharp as the photo?\n  ");
    await submit(s.talk());
    eq(s.msg.calls.length, 1);
    eq(s.msg.calls[0].oppId, oppId);
    eq(s.msg.calls[0].text, "Is the corner as sharp as the photo?");
    assert(typeof s.msg.calls[0].nonce === "string" && s.msg.calls[0].nonce.length >= 16 && s.msg.calls[0].nonce.length <= 128);
    eq(messages(st, oppId).length, 1);
    const b = bubbles(s.talk());
    eq(JSON.stringify(b), JSON.stringify([{ who: "You", text: "Is the corner as sharp as the photo?", mine: true, time: 1 }]));
    eq(box(s.talk()).props.value, "", "the box kept a sent message");
    assert(/Message sent\./.test(flat(byCls(s.talk(), "mcs-msg-sr")[0])), "nothing said it was sent");
  });

  test("the Trusted Partner sees the same thread, attributed to the Collector, and replies", async () => {
    const { st, oppId } = offered();
    okv(x(st, A, "sendDealMessage", { oppId, text: "Is it still available?", nonce: "n-casey-1" }), "msg");
    const tp = await partner(st);
    const t = tp.talkFor(oppId);
    assert(t, "the shop has no conversation for this deal");
    /* closed until asked for, and the control says there is something there */
    const toggle = byCls(tp.r.root, "tps-talk-toggle")[0];
    eq(toggle.props["aria-expanded"], false);
    assert(/Conversation · 1 message/.test(flat(toggle)), flat(toggle));
    await tp.toggle(oppId);
    eq(JSON.stringify(bubbles(tp.talkFor(oppId))), JSON.stringify([{ who: "Casey", text: "Is it still available?", mine: false, time: 1 }]));
    assert(/Conversation with Casey/.test(flat(tp.talkFor(oppId))));
    await type(tp.talkFor(oppId), "Yes — it's in the case by the till.");
    await submit(tp.talkFor(oppId));
    eq(messages(st, oppId).map((m) => `${m.by}:${m.text}`).join("|"), "collector:Is it still available?|tp:Yes — it's in the case by the till.");
    eq(bubbles(tp.talkFor(oppId)).map((b) => `${b.who}:${b.mine}`).join(), "Casey:false,You:true");
    /* the shop's price controls are still there beside it */
    assert(btn(tp.r.root, "Accept $10") && btn(tp.r.root, "Counter") && btn(tp.r.root, "Decline"), "the price controls went");

    /* the Collector sees it on their next read */
    const s = await collector(st);
    await s.open("gA");
    eq(bubbles(s.talk()).map((b) => `${b.who}:${b.text}`).join("|"),
      "You:Is it still available?|Northline Cards:Yes — it's in the case by the till.");
  });

  /* RESTATED (2D.2 refinement): the button now reads "Refresh messages". */
  test("Refresh messages re-reads, and the other side's message appears", async () => {
    const { st, oppId } = offered();
    const s = await collector(st);
    await s.open("gA");
    okv(x(st, NL, "sendDealMessage", { oppId, text: "Shop's open till six.", nonce: "n-nl-1" }), "msg");
    eq(s.talk().findAll((n) => n.type === "li").length, 0, "a message appeared without a read");
    await TR.act(async () => { btn(s.talk(), "Refresh messages").props.onClick(); });
    await settle();
    eq(s.refreshes, 1);
    eq(bubbles(s.talk()).map((b) => b.who).join(), "Northline Cards");
    s.refreshFails = true;
    await TR.act(async () => { btn(s.talk(), "Refresh messages").props.onClick(); });
    await settle();
    assert(/couldn't refresh messages/.test(flat(s.talk())), flat(s.talk()));
    eq(bubbles(s.talk()).length, 1, "a failed check lost the history");
  });
});

/* ================================================================ B */
describe("B. history survives", () => {
  test("a fresh mount — a reload, or signing in again — shows the same history, in order", async () => {
    const { st, oppId } = offered();
    okv(x(st, A, "sendDealMessage", { oppId, text: "one", nonce: "a1" }), "1");
    okv(x(st, NL, "sendDealMessage", { oppId, text: "two", nonce: "b1" }), "2");
    okv(x(st, A, "sendDealMessage", { oppId, text: "three", nonce: "a2" }), "3");
    for (let i = 0; i < 2; i += 1) {
      const s = await collector(st);
      await s.open("gA");
      eq(bubbles(s.talk()).map((b) => `${b.who}:${b.text}`).join("|"), "You:one|Northline Cards:two|You:three");
      s.r.unmount();
    }
  });
});

/* ================================================================ C */
describe("C. sending", () => {
  test("over 2,000 characters (counted as a person sees them) is refused here, and the text stays", async () => {
    const { st } = offered();
    const s = await collector(st);
    await s.open("gA");
    const emoji = "😀".repeat(2000);           // 2,000 characters, 4,000 UTF-16 units
    await type(s.talk(), emoji);
    eq(sendBtn(s.talk()).props.disabled, false, "2,000 emoji were counted as more than 2,000");
    assert(/2,000 \/ 2,000/.test(flat(s.talk())), flat(s.talk()));
    await type(s.talk(), emoji + "!");
    eq(sendBtn(s.talk()).props.disabled, true, "Send is live over the limit");
    assert(/up to 2,000 characters\. This one is 2,001\./.test(flat(s.talk())), flat(s.talk()));
    eq(box(s.talk()).props["aria-invalid"], true);
    await submit(s.talk());
    eq(s.msg.calls.length, 0, "an over-limit message was sent");
    eq(box(s.talk()).props.value, emoji + "!", "the text was lost");
  });

  test("a reply lost after the server saved it: not drawn as sent; Retry sends the SAME nonce; one message", async () => {
    const { st, oppId } = offered();
    const s = await collector(st);
    await s.open("gA");
    s.refreshFails = true;                     // the re-read after the failure cannot reach the server either
    s.msg.mode = "lost";
    await type(s.talk(), "See you Saturday?");
    await submit(s.talk());
    eq(messages(st, oppId).length, 1, "the server did not save it");
    eq(s.talk().findAll((n) => n.type === "li").length, 0, "an unconfirmed message was drawn as sent");
    assert(/couldn't confirm your message was sent/.test(flat(s.talk())), flat(s.talk()));
    eq(box(s.talk()).props.value, "See you Saturday?", "the text was lost");
    eq(flat(sendBtn(s.talk())).trim(), "Retry");
    s.msg.mode = "ok";
    await submit(s.talk());
    eq(s.msg.calls.length, 2);
    eq(s.msg.calls[1].nonce, s.msg.calls[0].nonce, "the retry was a new message");
    eq(messages(st, oppId).length, 1, "the retry became a second message");
    eq(bubbles(s.talk()).length, 1);
    eq(box(s.talk()).props.value, "");
  });

  test("a lost reply is recognised as delivered when the next read shows the sender's own nonce", async () => {
    const { st, oppId } = offered();
    const s = await collector(st);
    await s.open("gA");
    s.msg.mode = "lost";
    await type(s.talk(), "Cash is fine.");
    await submit(s.talk());
    eq(s.refreshes, 1, "an ambiguous failure did not re-read");
    eq(s.msg.calls.length, 1, "it was sent again on its own");
    eq(bubbles(s.talk()).map((b) => b.text).join("|"), "Cash is fine.");
    eq(box(s.talk()).props.value, "", "a delivered message stayed in the box");
    assert(!/couldn't confirm/.test(flat(s.talk())), "it still says unconfirmed after the server showed it");
  });

  test("a send that never reached the server: Retry sends the same nonce; editing makes a new message", async () => {
    const { st, oppId } = offered();
    const s = await collector(st);
    await s.open("gA");
    s.refreshFails = true;
    s.msg.mode = "unsent";
    await type(s.talk(), "Does it come with the slab?");
    await submit(s.talk());
    await submit(s.talk());
    eq(s.msg.calls[1].nonce, s.msg.calls[0].nonce, "a retry of the same text changed nonce");
    eq(messages(st, oppId).length, 0);
    /* whitespace around the same words is the same message */
    await type(s.talk(), "  Does it come with the slab?  ");
    eq(flat(sendBtn(s.talk())).trim(), "Retry");
    await submit(s.talk());
    eq(s.msg.calls[2].nonce, s.msg.calls[0].nonce);
    await type(s.talk(), "Does it come with the original slab?");
    eq(flat(sendBtn(s.talk())).trim(), "Send", "edited text still offered as a retry");
    s.msg.mode = "ok";
    await submit(s.talk());
    assert(s.msg.calls[3].nonce !== s.msg.calls[0].nonce, "edited text reused the old nonce");
    eq(messages(st, oppId).map((m) => m.text).join("|"), "Does it come with the original slab?");
  });

  test("a conflict says not sent and keeps the text; a refusal is said in words", async () => {
    const { st, oppId } = offered();
    const s = await collector(st);
    await s.open("gA");
    s.msg.mode = "conflict";
    await type(s.talk(), "Hello");
    await submit(s.talk());
    assert(/wasn't sent/.test(flat(s.talk())), flat(s.talk()));
    eq(box(s.talk()).props.value, "Hello");
    eq(messages(st, oppId).length, 0);
    /* the server's own refusal, should one ever arrive, in words; the text stays */
    s.msg.send = async () => ({ ok: false, refused: "message-too-long" });
    await s.rerender();
    await submit(s.talk());
    assert(/Messages can be up to 2,000 characters\./.test(flat(s.talk())), flat(s.talk()));
    eq(box(s.talk()).props.value, "Hello");
  });

  test("two presses in the same instant are one message", async () => {
    const { st, oppId } = offered();
    const s = await collector(st);
    await s.open("gA");
    s.msg.mode = "hold";
    await type(s.talk(), "Just checking in.");
    const form = s.talk().findAll((n) => n.type === "form")[0];
    let first; let second;
    await TR.act(async () => { first = form.props.onSubmit({ preventDefault() {} }); second = form.props.onSubmit({ preventDefault() {} }); });
    eq(s.msg.calls.length, 1, "the second press sent");
    /* while in flight: the text is kept, marked as sending, not drawn as sent */
    eq(flat(sendBtn(s.talk())).trim(), "Sending…");
    eq(sendBtn(s.talk()).props.disabled, true);
    eq(box(s.talk()).props.readOnly, true);
    eq(s.talk().findAll((n) => n.type === "li").length, 0, "a message in flight was drawn as sent");
    await TR.act(async () => { s.msg.hold(); await first; await second; });
    await settle();
    eq(messages(st, oppId).length, 1);
    eq(bubbles(s.talk()).length, 1);
  });
});

/* ================================================================ D */
describe("D. a finished deal is read-only", () => {
  test("withdrawn: the history stays, there is no box to type in, and it says why", async () => {
    const { st, oppId } = offered();
    okv(x(st, A, "sendDealMessage", { oppId, text: "Thanks anyway.", nonce: "w1" }), "msg");
    const s = await collector(st);
    await s.open("gA");
    eq(s.talk().props["data-messaging"], "open");
    await TR.act(async () => { await btn(s.ws(), "Withdraw offer").props.onClick(); });
    await settle();
    const t = s.talk();
    eq(t.props["data-messaging"], "read-only");
    eq(bubbles(t).map((b) => b.text).join(), "Thanks anyway.");
    eq(t.findAll((n) => n.type === "textarea" || n.type === "form").length, 0, "an ended deal can be written to");
    /* RESTATED (2D.2 refinement): shorter, same meaning. */
    assert(/This deal has ended\. Messages are read-only\./.test(flat(t)), flat(t));
  });

  test("the shop's Completed list keeps the same read-only thread", async () => {
    const { st, oppId } = offered();
    okv(x(st, NL, "sendDealMessage", { oppId, text: "Sorry, can't go that low.", nonce: "d1" }), "msg");
    okv(x(st, NL, "declineOffer", { oppId }), "decline");
    const tp = await partner(st);
    await tp.toggle(oppId);
    const t = tp.talkFor(oppId);
    eq(t.props["data-messaging"], "read-only");
    eq(bubbles(t).map((b) => `${b.who}:${b.text}`).join(), "You:Sorry, can't go that low.");
    eq(t.findAll((n) => n.type === "textarea").length, 0);
  });

  test("an agreed price is not the end: the deal stays messageable", async () => {
    const { st, oppId } = offered([[NL, "acceptPrice"]]);
    const s = await collector(st);
    await s.open("gA");
    eq(s.talk().props["data-messaging"], "open");
    await type(s.talk(), "Great — when can I pick it up?");
    await submit(s.talk());
    eq(messages(st, oppId).length, 1);
  });

  test("a deal that ends while the box is open: the server's refusal is said, and the composer goes", async () => {
    const { st, oppId } = offered();
    const s = await collector(st);
    await s.open("gA");
    await type(s.talk(), "Still interested!");
    okv(x(st, NL, "declineOffer", { oppId }), "decline behind the Collector's back");
    await submit(s.talk());
    eq(messages(st, oppId).length, 0);
    eq(s.refreshes, 1, "a terminal refusal did not re-read");
    assert(/This deal has ended/.test(flat(s.talk())) || s.talk().props["data-messaging"] === "read-only",
      flat(s.talk()));
    eq(s.talk().props["data-messaging"], "read-only");
  });
});

/* ================================================================ E */
describe("E. isolation", () => {
  test("each deal shows only its own thread", async () => {
    const st = world();
    const o1 = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 10 }), "o1");
    const o2 = okv(x(st, A, "startOpportunity", { goalId: "gB", invId: "i3", amount: 250 }), "o2");
    okv(x(st, A, "sendDealMessage", { oppId: o1, text: "about the Mudkip", nonce: "e1" }), "m1");
    okv(x(st, A, "sendDealMessage", { oppId: o2, text: "about the Charizard", nonce: "e2" }), "m2");
    const s = await collector(st);
    await s.open("gA");
    eq(bubbles(s.talk()).map((b) => b.text).join(), "about the Mudkip");
    await s.back();
    await TR.act(async () => { byCls(s.goal("gB"), "mcs-dg-cta")[0].props.onClick(); }); await settle();
    eq(bubbles(s.talk()).map((b) => b.text).join(), "about the Charizard");
    const tp = await partner(st);
    await tp.toggle(o1); await tp.toggle(o2);
    eq(bubbles(tp.talkFor(o1)).map((b) => b.text).join(), "about the Mudkip");
    eq(bubbles(tp.talkFor(o2)).map((b) => b.text).join(), "about the Charizard");
  });

  test("another shop sees nothing of a deal it is not in, and another Collector nothing of Casey's", async () => {
    const { st, oppId } = offered();
    okv(x(st, A, "sendDealMessage", { oppId, text: "private to Northline", nonce: "p1" }), "msg");
    const sv = await partner(st, SV);
    eq(sv.talkFor(oppId), null);
    assert(!/private to Northline/.test(flat(sv.r.root)), "Silver Vale can read Northline's conversation");
    const jordan = await collector(st, J);
    assert(!/private to Northline/.test(flat(jordan.r.root)), "Jordan can read Casey's conversation");
    /* the shop's own messages carry its nonce only to itself */
    okv(x(st, NL, "sendDealMessage", { oppId, text: "shop says", nonce: "SHOP-SECRET-NONCE" }), "tp");
    assert(!JSON.stringify(P.projectForActor(st.get(), A)).includes("SHOP-SECRET-NONCE"), "the shop's nonce reached the Collector");
  });

  test("leaving a deal while a message is on its way: it lands on that deal only, and the next deal's box is untouched", async () => {
    const st = world();
    const o1 = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 10 }), "o1");
    const o2 = okv(x(st, A, "startOpportunity", { goalId: "gB", invId: "i3", amount: 250 }), "o2");
    const s = await collector(st);
    await s.open("gA");
    s.msg.mode = "hold";
    await type(s.talk(), "for deal one");
    const form = s.talk().findAll((n) => n.type === "form")[0];
    let pending;
    await TR.act(async () => { pending = form.props.onSubmit({ preventDefault() {} }); });
    await s.back();
    await TR.act(async () => { byCls(s.goal("gB"), "mcs-dg-cta")[0].props.onClick(); }); await settle();
    eq(s.talk().props["data-thread"], o2);
    await type(s.talk(), "half-written for deal two");
    await TR.act(async () => { s.msg.hold(); await pending; });
    await settle();
    eq(messages(st, o1).map((m) => m.text).join(), "for deal one");
    eq(messages(st, o2).length, 0, "the late answer wrote into the other deal");
    eq(s.talk().props["data-thread"], o2);
    eq(bubbles(s.talk()).length, 0, "the other deal's message is shown here");
    eq(box(s.talk()).props.value, "half-written for deal two", "the late answer cleared the other deal's box");
  });

  test("the workspace switched straight to another deal mid-send: nothing of the first deal's message is carried over", async () => {
    const st = world();
    const o1 = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 10 }), "o1");
    const o2 = okv(x(st, A, "startOpportunity", { goalId: "gB", invId: "i3", amount: 250 }), "o2");
    const WS = build("client/collector/DealWorkspace.jsx").default;
    let r;
    const m = messenger(st, A, async () => { await TR.act(async () => { r.update(el(current)); }); });
    let current = o1;
    const el = (oppId) => React.createElement(WS, { state: P.projectForActor(st.get(), A), oppId, onBack: () => {},
      onSendMessage: m.send, onRefresh: async () => {} });
    await TR.act(async () => { r = TR.create(el(o1)); });
    await settle();
    const talk = () => byCls(r.root, "mcs-msg")[0];
    m.mode = "hold";
    await type(talk(), "for deal one");
    let pending;
    await TR.act(async () => { pending = talk().findAll((n) => n.type === "form")[0].props.onSubmit({ preventDefault() {} }); });
    current = o2;
    await TR.act(async () => { r.update(el(o2)); });
    eq(talk().props["data-thread"], o2);
    eq(box(talk()).props.value, "", "deal one's message is in deal two's box");
    eq(box(talk()).props.readOnly, false, "deal two's box is locked by deal one's send");
    await type(talk(), "deal two draft");
    await TR.act(async () => { m.hold(); await pending; });
    await settle();
    eq(messages(st, o1).length, 1);
    eq(messages(st, o2).length, 0);
    eq(box(talk()).props.value, "deal two draft", "deal one's answer cleared deal two's box");
    r.unmount();
  });
});

/* ================================================================ F */
describe("F. a message is never a move on the price", () => {
  test("\"I accept $11\" leaves the price open, the turn the same, and Accept still there", async () => {
    const { st, oppId } = offered([[NL, "proposePrice", { amount: 11 }]]);
    const before = JSON.stringify(st.get().opportunities.find((o) => o.id === oppId));
    const s = await collector(st);
    await s.open("gA");
    for (const said of ["I accept $11", "Deal. Accept.", "I'll counter at $9", "withdraw"]) {
      await type(s.talk(), said);
      await submit(s.talk());
    }
    eq(JSON.stringify(st.get().opportunities.find((o) => o.id === oppId)), before, "a message changed the deal");
    eq(s.sent.length, 0, `a structured command was sent: ${s.sent}`);
    eq(messages(st, oppId).length, 4);
    assert(btn(s.ws(), "Accept $11"), "Accept went away");
    assert(/Your turn/.test(flat(s.ws())), flat(s.ws()));
    assert(!/Agreed Market Price/.test(flat(s.ws())), "a message agreed a price");
  });

  test("the shop's \"accepted\" is a message too", async () => {
    const { st, oppId } = offered();
    const before = JSON.stringify(st.get().opportunities.find((o) => o.id === oppId));
    const tp = await partner(st);
    await tp.toggle(oppId);
    await type(tp.talkFor(oppId), "Accepted — $10 it is.");
    await submit(tp.talkFor(oppId));
    eq(JSON.stringify(st.get().opportunities.find((o) => o.id === oppId)), before);
    eq(tp.sent.length, 0);
    assert(btn(tp.r.root, "Accept $10"), "the shop's Accept went away");
  });
});

/* ================================================================ G */
describe("G. boundaries in the source", () => {
  const strip = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  test("the conversation reaches the server only through the binding it is handed", () => {
    const src = strip("client/deal-conversation.jsx");
    assert(!/execute\s*\(|fetch\s*\(|\bstore\.\w+\s*\(|XMLHttpRequest|WebSocket|EventSource|setInterval/.test(src), "it reaches past its binding, or polls");
    assert(!/from\s+["'][^"']*(domain|server|api|store|commands)/.test(src), "it imports a store, api or domain module");
    assert(!/["'](sendMessage|reachOut|recordNote|sendDealMessage|acceptPrice|proposePrice)["']/.test(src), "it names a command");
    assert(!/includes\(\s*["']accept|toLowerCase\(\)|\/\s*accept|\bmatch\(/i.test(src), "it reads text for intent");
    assert(!/<img|src=/.test(src), "it renders an image");
    assert(!/history\.|location\.|hashchange|pushState/.test(src), "it touches browser history or the URL");
    assert(!/localStorage|sessionStorage|indexedDB/.test(src), "it keeps messages in the browser");
  });
  test("one messaging binding, bound once at the entrance, handed to both seats", () => {
    const signIn = strip("client/sign-in/SignIn.jsx");
    assert(/onSendMessage = useMemo\(\(\) => \(store \? sendDealMessage\(store\) : null\), \[store\]\)/.test(signIn));
    const app = strip("client/production-app.jsx");
    eq((app.match(/onSendMessage=\{onSendMessage\}/g) || []).length, 2, "not handed to exactly the two seats");
    assert(/opportunities" \? \{[^}]*onSendMessage[^}]*\}/.test(strip("client/tp/TrustedPartnerShell.jsx")));
    for (const f of ["client/tp/sections/Inventory.jsx", "client/tp/sections/CollectorNetwork.jsx",
      "client/collector/sections/DealFlow.jsx"]) {
      assert(!strip(f).includes("onSendMessage"), `${f} was handed messaging`);
    }
  });
});

run();
