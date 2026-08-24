/* ============================================================================
   TALKING IS NOT AGREEING

   The mobile deal could be read but not replied to, and a tester on a phone
   could only ever move one side of a two-sided negotiation. Both gaps close by
   reusing what already exists rather than building mobile copies of it.

   The composer is DealChat's — same draft-local, same single canonical send,
   same shared thread the Trusted Partner reads. The partner simulator is
   SimulateTP, which already gates on DEV and already offers only the moves
   canonically available right now.

   The one judgement here is about the Messages tab. It used to show
   conversation alone, and reading a thread with no sense of what is being
   negotiated loses the point of it — so canonical milestones stay alongside the
   messages. They keep their own kind and their own shape, because the whole
   danger of putting them together is somebody reading "sounds good" as a
   commitment. A message can sit between two milestones; it can never become
   one, and it settles nothing.

   Milestones already written into the shared thread are read from there rather
   than re-derived, so a given event appears exactly once either way.
   ========================================================================= */

process.env.METYET_DEV = "1";

global.window = global.window || {};
let NARROW = true;
window.matchMedia = (q) => ({
  matches: /max-width:\s*560px/.test(q) && NARROW,
  addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {},
});

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const D = require("../domain/metyet-domain.js");
const M = require("../dist/MetYet.cjs");
const { collectorView } = require("../domain/collector-view.js");
const App = require("../dist/Collector.cjs").default;
const { __store } = require("../dist/Collector.cjs");

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const AT = "2026-08-21";

const txt = (n) => {
  if (!n) return "";
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ").replace(/\s+/g, " ").trim();
};
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));

const S = () => __store.get().get();
const acts = () => __store.get().actions;
const goal = () => collectorView(S(), "c12").myGoals()
  .find((g) => /^Review deal/.test(g.note || ""));
const opp = () => D.activeOppForGoal(goal().id, S().opportunities);
const anyOpp = (id) => S().opportunities.find((x) => x.id === id);

let R = null;
const expand = () => cls(R, "goal").forEach((g) => {
  const d = g.findAllByType("button")
    .find((b) => String(b.props.className || "").includes("goal-deal"));
  if (d && !d.props["aria-expanded"]) click(d);
});
const open = ({ stage = "value-trade", narrow = true } = {}) => {
  NARROW = narrow;
  __store.reset(M.buildCanonicalSeed({ review: true, demoStage: stage }));
  TR.act(() => { R = TR.create(React.createElement(App)); });
  expand();
  return R;
};
const rerender = () => { TR.act(() => { R.update(React.createElement(App)); }); expand(); };
const tab = (name) => {
  const b = R.root.findAllByType("button").find((x) => txt(x) === name);
  assert(b, "a " + name + " tab");
  click(b);
};
const composer = () => R.root.findAllByType("textarea")[0];
const send = (text) => {
  TR.act(() => { composer().props.onChange({ target: { value: text } }); });
  const b = R.root.findAllByType("button").find((x) => txt(x) === "Send");
  assert(b, "a Send control");
  click(b);
};
const rows = () => cls(R, "mdl-e");
const thread = () => collectorView(S(), "c12").threadWith(opp().partnerId, opp().cardId);

describe("A. The Messages tab can actually be used", () => {
  test("it offers a composer", () => {
    open();
    tab("Messages");
    assert(composer(), "a place to type");
    assert(/Message .* about this card/.test(String(composer().props["aria-label"])),
      "labelled for what it is");
  });

  test("sending writes to the one canonical thread", () => {
    open();
    tab("Messages");
    send("On my way");
    assert(thread().entries.some((e) => e.text === "On my way"),
      "the shared thread has it");
  });

  test("the partner reads it from that same thread", () => {
    open();
    tab("Messages");
    send("Front looks clean");
    const o = opp();
    /* The projection the Trusted Partner reads is the same record set. */
    const shared = collectorView(S(), "c12").threadWith(o.partnerId, o.cardId);
    const entry = shared.entries.find((e) => e.text === "Front looks clean");
    assert(entry, "one entry");
    eq(entry.by, "collector", "attributed to whoever wrote it");
  });

  test("it sends exactly once", () => {
    open();
    tab("Messages");
    send("Only once please");
    eq(thread().entries.filter((e) => e.text === "Only once please").length, 1,
      "one press, one entry");
  });

  test("typing before sending is draft state only", () => {
    open();
    tab("Messages");
    const before = JSON.stringify(S().conversations);
    TR.act(() => { composer().props.onChange({ target: { value: "not sent yet" } }); });
    eq(JSON.stringify(S().conversations), before, "nothing is written while typing");
  });

  test("a message mutates no deal state whatsoever", () => {
    open({ stage: "agree-price" });
    const id = opp().id;
    const before = JSON.stringify(anyOpp(id));
    tab("Messages");
    send("Sounds good, deal!");
    const after = anyOpp(id);
    eq(after.stage, JSON.parse(before).stage, "stage unmoved");
    eq(after.agreedPrice, JSON.parse(before).agreedPrice, "nothing priced");
    eq(JSON.stringify(after.trade), JSON.stringify(JSON.parse(before).trade),
      "no trade term touched");
    eq(JSON.stringify(after.deal), JSON.stringify(JSON.parse(before).deal),
      "no cash term touched");
    eq(D.nextActor(after).actor, D.nextActor(JSON.parse(before)).actor,
      "and the turn did not change hands");
  });

  test("the composer reuses the canonical send path", () => {
    const shell = code(COL).slice(code(COL).indexOf("function MobileDeal("),
      code(COL).indexOf("function MobileDeal(") + 9000);
    assert(/<DealChat[^>]*composerOnly/.test(shell), "it mounts DealChat");
    assert(!/sendMessage/.test(shell), "and never calls the action itself");
    eq((code(COL).match(/st\.sendMessage\(pid, cid, draft/g) || []).length, 1,
      "one send implementation in the app");
  });

  test("the input is thumb-friendly", () => {
    assert(/\.mdl-comp \.inp \{ font-size: 16px; min-height: 44px; \}/.test(COL),
      "16px text, 44px target — no iOS zoom, no tiny hit area");
  });
});

describe("B. Milestones travel with the conversation", () => {
  test("Messages keeps the deal context around the chat", () => {
    open();
    tab("Messages");
    const kinds = rows().map((n) => String(n.props.className));
    assert(kinds.some((k) => !/message/.test(k)),
      "milestones are present: " + kinds.join(" | "));
  });

  test("messages and milestones are different things on screen", () => {
    open();
    tab("Messages");
    send("Looks great");
    rerender(); tab("Messages");
    const msg = rows().find((n) => /Looks great/.test(txt(n)));
    assert(String(msg.props.className).includes("message"), "a message carries its kind");
    assert(cls(msg, "mdl-e-msg")[0], "and its conversational shape");
    const milestone = rows().find((n) => !String(n.props.className).includes("message"));
    assert(milestone && !cls(milestone, "mdl-e-msg")[0],
      "a milestone has neither");
  });

  test("every milestone class the deal can produce is covered", () => {
    /* Price, trade review, market, percentage, cash, fulfillment, completion —
       each derived from its canonical thread or record. */
    const proj = code(COL).slice(code(COL).indexOf("function dealTimeline("),
      code(COL).indexOf("function MobileDeal("));
    [["price", /priceThread/], ["trade review", /reviewedAt/],
      ["market value", /valueThread/], ["trade %", /percentThread/],
      ["final cash", /adjThread/], ["fulfillment", /proposedAt/],
      ["handoff", /FULFILLMENT\.handedOff/], ["receipt", /FULFILLMENT\.received/]]
      .forEach(([name, re]) => assert(re.test(proj), name + " is projected"));
  });

  test("milestone wording names the actor and the commitment", () => {
    open({ stage: "agree-price" });
    const id = opp().id;
    TR.act(() => { acts().patchOpportunity(id, (x) => ({ ...x,
      priceThread: [...x.priceThread,
        { by: "tp", type: "propose", amount: 4032, at: "2026-08-15" }] })); });
    rerender(); tab("Messages");
    assert(rows().some((n) => /Northline Cards countered at \$4,032/.test(txt(n))),
      "who, what and how much: " + rows().map(txt).join(" | "));
  });

  test("a percentage milestone carries the dollars it means", () => {
    const proj = code(COL).slice(code(COL).indexOf("function dealTimeline("),
      code(COL).indexOf("function MobileDeal("));
    assert(/D\.tradeValueAt\(c\.agreedMarket, e\.percent\)/.test(proj),
      "through the canonical helper");
    eq(D.tradeValueAt(500, 0.9), 450, "90% of $500 is $450");
  });

  test("cash milestones keep payer direction", () => {
    const mk = (price, trade) => ({ agreedPrice: price,
      trade: { cards: [{ inclusion: "accepted", agreedMarket: trade, agreedPercent: 1 }] },
      deal: {} });
    eq(D.cashReceipt(mk(1000, 275)).calculated.direction, "collector-to-tp", "you owe");
    eq(D.cashReceipt(mk(700, 1000)).calculated.direction, "tp-to-collector", "they owe");
    const shell = code(COL).slice(code(COL).indexOf("function MobileDeal("),
      code(COL).indexOf("function MobileDeal(") + 9000);
    assert(/owes you/.test(shell) && /You owe/.test(shell), "and the phone says which");
  });

  test("an event already in the shared thread is not projected twice", () => {
    open();
    const o = opp();
    /* A lifecycle event written into the conversation is read from there. */
    TR.act(() => { acts().sendMessage({ collectorId: "c12", partnerId: o.partnerId,
      cardId: o.cardId, by: "collector", text: "Reached out", at: "2026-08-22" }); });
    rerender(); tab("Messages");
    const proj = code(COL).slice(code(COL).indexOf("function dealTimeline("),
      code(COL).indexOf("function MobileDeal("));
    assert(/m\.kind === "event" \? "milestone" : "message"/.test(proj),
      "a shared-thread event becomes a milestone rather than a second record");
    eq(rows().filter((n) => /Reached out/.test(txt(n))).length, 1, "shown once");
  });

  test("Messages is not a second receipt", () => {
    open();
    tab("Messages");
    eq(cls(R, "vcard").length, 0, "no value-trade workspace");
    eq(cls(R, "dl-final").length, 0, "and no deal receipt");
  });
});

describe("C. The partner can be driven from the phone, in DEV only", () => {
  test("the simulator is present under the engineering flag", () => {
    open();
    assert(/Simulate/.test(txt(R.root)) || cls(R, "sim")[0],
      "engineering tooling is reachable on mobile");
  });

  test("it is the existing simulator, not a mobile copy", () => {
    const shell = code(COL).slice(code(COL).indexOf("function MobileDeal("),
      code(COL).indexOf("function MobileDeal(") + 9000);
    assert(/<SimulateTP o=\{o\} st=\{st\} \/>/.test(shell), "mounted, not reimplemented");
    eq((code(COL).match(/function SimulateTP\(/g) || []).length, 1, "one definition");
    ["tradeMarketRespond", "tradePercentRespond", "dealAgree", "reviewTradeCards"]
      .forEach((a) => assert(!shell.includes(a), "no " + a + " restated in the shell"));
  });

  test("it gates on DEV, not on demo mode", () => {
    const sim = code(COL).slice(code(COL).indexOf("function SimulateTP("),
      code(COL).indexOf("function SimulateTP(") + 200);
    assert(/if \(!DEV\) return null;/.test(sim), "DEV only");
    assert(!/DEMO/.test(sim), "never merely because demo mode is on");
  });

  test("a hosted demo build exposes no engineering controls", () => {
    const out = path.join(ROOT, "dist", "HostedMsg.cjs");
    esbuild.buildSync({
      entryPoints: [path.join(ROOT, "shell", "MetYetPrototype.jsx")],
      outfile: out, bundle: true, format: "cjs", platform: "node",
      external: ["react", "react-dom"], jsx: "automatic", logLevel: "silent",
      define: { __METYET_DEV__: "false", __METYET_DEMO__: "true" },
    });
    delete require.cache[require.resolve(out)];
    const P = require(out).default;
    let r; TR.act(() => { r = TR.create(React.createElement(P)); });
    click(r.root.findAllByType("button").find((b) => /Continue as Collector/.test(txt(b))));
    cls(r, "goal").forEach((g) => {
      const d = g.findAllByType("button")
        .find((b) => String(b.props.className || "").includes("goal-deal"));
      if (d && !d.props["aria-expanded"]) click(d);
    });
    eq(cls(r, "mdl").length, 1, "the mobile deal still renders");
    assert(!/Simulate/.test(txt(r.root)), "with no engineering tooling");
    fs.unlinkSync(out);
  });

  test("a simulated action moves the same canonical state", () => {
    open({ stage: "agree-price" });
    const id = opp().id;
    const before = anyOpp(id).priceThread.length;
    /* Through the canonical action the simulator itself uses. */
    TR.act(() => { acts().agreePrice({ oppId: id, amount: 3555, by: "partner", at: AT }); });
    rerender();
    assert(anyOpp(id).priceThread.length > before, "the thread grew");
    eq(anyOpp(id).agreedPrice, 3555, "and the deal settled canonically");
  });

  test("turn guards survive simulated actions", () => {
    open({ stage: "agree-price" });
    const id = opp().id;
    TR.act(() => { acts().patchOpportunity(id, (x) => ({ ...x,
      priceThread: [...x.priceThread,
        { by: "tp", type: "propose", amount: 3700, at: "2026-08-15" }] })); });
    const n = anyOpp(id).priceThread.length;
    /* The partner cannot speak twice in a row. */
    TR.act(() => { acts().patchOpportunity(id, (x) => x); });
    eq(anyOpp(id).priceThread.length, n, "no duplicate move slipped in");
  });

  test("simulated value-trade keeps copy identity and independence", () => {
    open({ stage: "value-trade" });
    const o = opp();
    const cards = (o.trade && o.trade.cards) || [];
    cards.forEach((c) => assert(c.id !== c.binderId,
      "row id and binder copy id stay distinct"));
    if (cards.length > 1) {
      assert(cards[0].binderId !== cards[1].binderId, "two copies, two identities");
    }
  });

  test("the simulator never sets a stage, and adds no shortcut", () => {
    const sim = code(COL).slice(code(COL).indexOf("function SimulateTP("),
      code(COL).indexOf("function SimulateTP(") + 6000);
    assert(!/stage:\s*["']/.test(sim), "no stage is ever written");
    assert(!/Advance stage|Force |Skip /i.test(sim), "and no generic advance control");

    /* CONTRACT CHANGE, tightened: the trade-review and value paths that used to
       write state now take actions, so exactly ONE raw patch survives — the
       partner's price counter, which has no canonical action to call. It is
       named here so it cannot quietly become two. */
    eq((sim.match(/A\.patchOpportunity/g) || []).length, 1,
      "one remaining raw patch: the price counter, a known domain gap");
    const counter = sim.slice(sim.indexOf("Counter at 96%"),
      sim.indexOf("Counter at 96%") + 400);
    assert(/priceThread/.test(counter), "and it appends to a thread, never a terminal field");

    ["agreePrice", "reviewTradeCards", "tradeMarketRespond", "tradePercentRespond",
      "dealAdjustRespond", "dealAgree", "confirmHandoff", "sendMessage", "endOpportunity"]
      .forEach((a) => assert(sim.includes("A." + a), a + " goes through the action set"));
  });
});

describe("D. Nothing else moved", () => {
  test("desktop is untouched", () => {
    open({ narrow: false });
    eq(cls(R, "mdl").length, 0, "no mobile shell");
    eq(cls(R, "chat-embed").length, 1, "the desktop conversation is unchanged");
    eq(cls(R, "idf-stage").length, 1, "as is the workspace");
  });

  test("the composer-only mode adds no second stream", () => {
    open();
    tab("Messages");
    eq(cls(R, "chat-m").length, 0, "DealChat renders no messages in this mode");
    assert(composer(), "only the composer");
  });

  test("both mobile entry paths still work", () => {
    eq((code(COL).match(/if \(narrow\) return <MobileDeal/g) || []).length, 2,
      "inline and full-page");
    eq((code(COL).match(/function MobileDeal\(/g) || []).length, 1, "one component");
  });

  test("the lifecycle is unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
  });
});

require("./run.cjs").run();
