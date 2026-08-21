/* ============================================================================
   EVERY NUMBER TRACEABLE, EVERY MOVE REAL

   Two things complete the pilot flow.

   DEAL had to become a receipt. It showed only a per-card trade value, so the
   figure the collector was asked to accept could not be checked against what
   they had agreed. It now shows agreed market value, agreed Trade %, and the
   credit that produces, per card, then the total and the cash balance in words.

   It also had a second silent break of exactly the Pass 2 kind: the final
   negotiation read `deal.proposedAdj` / `proposedBy`, fields Pass 2 replaced
   with `tpAdj` / `collectorAdj` / `adjThread`. A proposal was recorded
   canonically and the screen showed nothing at all.

   DEMO progression is the other half. A pilot is usually one person, so the
   partner's move is offered where the tester already is — but only through the
   canonical action the real seat calls, only when it is genuinely that seat's
   move, and never for the collector's own agreement.
   ========================================================================= */

process.env.METYET_DEV = "1";

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const D = require("../domain/metyet-domain.js");
const M = require("../dist/MetYet.cjs");
const { createStore } = require("../domain/metyet-store.js");

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const AT = "2026-08-19";

const txt = (n) => {
  if (!n) return "";
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ").replace(/\s+/g, " ").trim();
};
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));

/* ---- a two-card trade, built only through canonical actions -------------- */
const A_CARD = { id: "ka", name: "Mew ex", set: "Pokemon 151", number: "193/165",
  variant: "SIR", edition: "Unlimited", language: "English", grade: "PSA 10", condition: null };
const B_CARD = { id: "kb", name: "Lugia", set: "Neo Genesis", number: "9/111",
  variant: "Holo", edition: "Unlimited", language: "English", grade: "PSA 8", condition: null };
const TARGET = { id: "kt", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };

const world = () => {
  const st = createStore({
    catalog: [A_CARD, B_CARD, TARGET],
    collectors: [{ id: "casey", name: "Casey", prefs: [] }],
    partners: [{ id: "nl", name: "Northline Cards" }],
    goals: [], binder: [], interests: [], conversations: [], opportunities: [],
    preferences: [], photoRequests: [], copyReviews: [],
    inventory: [{ invId: "inv-1", partnerId: "nl", cardId: "kt", ask: 4200,
      archived: false, photos: { front: "f", back: "b" } }],
  });
  const g = st.actions.addGoal({ collectorId: "casey", cardId: "kt", tier: "primary", at: AT });
  const o = st.actions.startOpportunity({ goalId: g, collectorId: "casey", partnerId: "nl",
    cardId: "kt", invId: "inv-1", listedPrice: 4200, amount: 3990, at: AT });
  st.actions.agreePrice({ oppId: o, amount: 3990, by: "tp", at: AT });
  const a = M.emptyTradeCard("ka", null, null, "b-a");
  const b = M.emptyTradeCard("kb", null, null, "b-b");
  st.actions.patchOpportunity(o, (x) => ({ ...x, trade: { ...x.trade, submitted: true,
    cards: [{ ...a, inclusion: "accepted" }, { ...b, inclusion: "accepted" }] } }));
  const get = () => st.get().opportunities.find((x) => x.id === o);
  return { st, o, A: a.id, B: b.id, get,
    card: (id) => get().trade.cards.find((c) => c.id === id) };
};
const settle = (w, id, market, percent) => {
  const a = w.st.actions;
  a.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "tp", action: "propose", amount: market, at: AT });
  a.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "accept", at: AT });
  a.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "tp", action: "propose", percent, at: AT });
  a.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "accept", at: AT });
};
const bothSettled = () => {
  const w = world();
  settle(w, w.A, 1804, 0.8);
  settle(w, w.B, 900, 0.75);
  w.st.actions.patchOpportunity(w.o, (x) => ({ ...x, stage: "deal",
    deal: x.deal && x.deal.adjThread ? x.deal : { adjThread: [] } }));
  return w;
};

describe("A. Deal is a receipt of card-level agreements", () => {
  test("the whole chain reconciles", () => {
    const w = bothSettled();
    eq(D.tradeValueOf(w.card(w.A)), 1443, "$1,804 x 80% = $1,443");
    eq(D.tradeValueOf(w.card(w.B)), 675, "$900 x 75% = $675");
    eq(D.totalTradeValue(w.get()), 2118, "total trade value $2,118");
    eq(w.get().agreedPrice, 3990, "agreed price $3,990");
    eq(D.calculatedBalance(w.get()), 3990 - 2118, "cash balance $1,872");
  });

  test("every figure the screen shows comes from the domain", () => {
    const deal = code(COL).slice(code(COL).indexOf("function DealStage("),
      code(COL).indexOf("function DealStage(") + 5000);
    assert(/D\.totalTradeValue\(o\)/.test(deal), "the total is canonical");
    assert(/tradeValue\(tcd\)/.test(deal), "and each card's value");
    assert(/D\.finalBalance\(o\)/.test(deal), "as is the balance");
    assert(!/agreedMarket \*|reduce\(/.test(deal), "nothing is recomputed here");
  });

  test("each card shows what was agreed, not just the result", () => {
    const deal = code(COL).slice(code(COL).indexOf("function DealStage("),
      code(COL).indexOf("function DealStage(") + 5000);
    assert(/Agreed market value/.test(deal), "the market value");
    assert(/Agreed Trade %/.test(deal), "the percentage");
    assert(/Trade value/.test(deal), "and the credit it produces");
    assert(/money\(tcd\.agreedMarket\)/.test(deal), "read from the card");
    assert(/pct\(tcd\.agreedPercent\)/.test(deal), "in both cases");
  });

  test("rows are keyed by their own identity", () => {
    const deal = code(COL).slice(code(COL).indexOf("function DealStage("),
      code(COL).indexOf("function DealStage(") + 5000);
    assert(/key=\{tcd\.id \|\| tcd\.binderId\}/.test(deal),
      "two rows for one binder copy stay distinct");
  });

  test("payment direction is stated in words", () => {
    const deal = code(COL).slice(code(COL).indexOf("function DealStage("),
      code(COL).indexOf("function DealStage(") + 5000);
    assert(/cash >= 0 \? `You pay \$\{them\}` : `\$\{them\} pays you`/.test(deal),
      "a sign is not an explanation");
  });

  test("a cash-only deal claims no trade", () => {
    const w = world();
    w.st.actions.chooseCashOnly({ oppId: w.o, at: AT });
    eq(w.get().trade.mode, "cash", "the decision is recorded");
    eq(D.totalTradeValue(w.get()), 0, "and contributes nothing");
    const deal = code(COL).slice(code(COL).indexOf("function DealStage("),
      code(COL).indexOf("function DealStage(") + 5000);
    assert(/No cards are going into this trade/.test(deal),
      "the screen says so rather than showing empty rows");
  });
});

describe("B. Deal agreement stays each person's own", () => {
  test("the final negotiation reads canonical fields", () => {
    /* The second silent break: this screen read proposedAdj/proposedBy, which
       Pass 2 stopped writing. A proposal was recorded and nothing appeared. */
    const deal = code(COL).slice(code(COL).indexOf("function DealStage("),
      code(COL).indexOf("function DealStage(") + 5000);
    assert(!/proposedAdj|proposedBy/.test(deal), "the stale fields are gone");
    assert(/deal\.tpAdj/.test(deal) && /deal\.collectorAdj/.test(deal),
      "one standing position per side");
    assert(/deal\.agreedAdj/.test(deal), "and the settled figure");
  });

  test("a canonical proposal is actually visible to the model", () => {
    const w = bothSettled();
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "collector", action: "propose",
      amount: 1800, at: AT });
    eq(w.get().deal.collectorAdj, 1800, "recorded where the screen now reads");
    eq(w.get().deal.adjThread.length, 1, "with history");
  });

  test("one person agreeing is not both", () => {
    const w = bothSettled();
    w.st.actions.dealAgree({ oppId: w.o, by: "collector", at: AT });
    eq(w.get().deal.collectorAgreed, true, "theirs");
    assert(!w.get().deal.tpAgreed, "not the partner's");
    eq(w.get().stage, "deal", "and the deal waits");
    w.st.actions.dealAgree({ oppId: w.o, by: "tp", at: AT });
    eq(w.get().stage, "fulfillment", "until both have");
  });

  test("both states are shown separately", () => {
    const deal = code(COL).slice(code(COL).indexOf("function DealStage("),
      code(COL).indexOf("function DealStage(") + 5000);
    assert(/iAgreed = !!deal\.collectorAgreed/.test(deal), "the collector's own bit");
    assert(/theyAgreed = !!deal\.tpAgreed/.test(deal), "and the partner's, read apart");
    assert(/st\.dealAgree\(o\.id\)/.test(deal), "agreeing names only the actor");
  });

  test("adjusting never reopens upstream card terms", () => {
    const w = bothSettled();
    const before = JSON.stringify(w.get().trade.cards);
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "tp", action: "propose", amount: 1900, at: AT });
    eq(JSON.stringify(w.get().trade.cards), before, "market values and percentages hold");
    assert(!w.get().deal.collectorAgreed && !w.get().deal.tpAgreed,
      "though both confirmations are withdrawn, per the canonical rule");
  });
});

describe("C. Demo progression uses only real moves", () => {
  const HOSTED = path.join(ROOT, "dist", "HostedProgression.cjs");
  let built = false;
  const shell = () => {
    if (!built) {
      esbuild.buildSync({
        entryPoints: [path.join(ROOT, "shell", "MetYetPrototype.jsx")],
        outfile: HOSTED, bundle: true, format: "cjs", platform: "node",
        external: ["react", "react-dom"], jsx: "automatic", logLevel: "silent",
        define: { __METYET_DEV__: "false", __METYET_DEMO__: "true" },
      });
      built = true;
    }
    delete require.cache[require.resolve(HOSTED)];
    return require(HOSTED).default;
  };
  const enter = () => {
    let r; TR.act(() => { r = TR.create(React.createElement(shell())); });
    click(r.root.findAllByType("button").find((b) => /Continue as Collector/.test(txt(b))));
    return r;
  };
  const expand = (r) => cls(r, "goal").forEach((g) => {
    const d = g.findAllByType("button")
      .find((b) => String(b.props.className || "").includes("goal-deal"));
    if (d && !d.props["aria-expanded"]) click(d);
  });
  const scenario = (r, v) => {
    TR.act(() => { r.root.findAllByType("select")[0].props.onChange({ target: { value: v } }); });
    expand(r);
  };

  test("hosted demo shows partner responses and no engineering tools", () => {
    const r = enter();
    assert(!/Simulate/.test(txt(r.root)), "SimulateTP is absent");
    assert(!/Advance stage|Force/.test(txt(r.root)), "and no generic stage forcing");
    scenario(r, "value-trade");
    const box = cls(r, "dpr")[0];
    assert(box, "a partner-response block exists");
    assert(/Demo/.test(txt(box)) && /Partner response/.test(txt(box)),
      "labelled as demo scaffolding, in plain language");
  });

  test("only the move that is genuinely available is offered", () => {
    /* Value Trade needs a market value before a percentage; the helper offers
       whichever of those is actually next, and nothing else. */
    const r = enter();
    scenario(r, "value-trade");
    const labels = cls(r, "dpr")[0].findAllByType("button").map(txt);
    eq(labels.length, 1, "one valid move: " + labels.join(" / "));
    assert(/proposes|accepts/.test(labels[0]), "phrased as the partner acting");
  });

  test("no response is offered when the partner has nothing to do", () => {
    const r = enter();
    /* Cards not yet submitted — there is nothing for the partner to review. */
    scenario(r, "select-trade");
    eq(cls(r, "dpr").length, 0, "silence, not a disabled button");
  });

  test("fulfillment offers the plan, then the handoff", () => {
    const r = enter();
    scenario(r, "fulfillment");
    const box = cls(r, "dpr")[0];
    assert(box, "a response is available");
    assert(/proposes a handoff plan/.test(txt(box)),
      "the partner proposes first — the collector never invents the plan");
  });

  test("every demo response calls a canonical action", () => {
    const src = code(COL).slice(code(COL).indexOf("function DemoPartnerResponse("),
      code(COL).indexOf("function SimulateTP("));
    assert(/const A = st\.simulate;/.test(src), "it uses the canonical action set");
    ["agreePrice", "reviewTradeCards", "tradeMarketRespond", "tradePercentRespond",
      "dealAdjustRespond", "dealAgree", "proposeFulfillment", "confirmHandoff"]
      .forEach((a) => assert(new RegExp("A\\." + a + "\\(").test(src), a + " is canonical"));
    assert(!/patchOpportunity/.test(src), "and nothing is patched directly");
    assert(!/stage:/.test(src), "no stage is written");
  });

  test("the helper never acts for the collector", () => {
    const src = code(COL).slice(code(COL).indexOf("function DemoPartnerResponse("),
      code(COL).indexOf("function SimulateTP("));
    assert(!/by: "collector"/.test(src), "every move is the partner's");
    assert(!/collectorAgreed/.test(src), "and it never grants the collector's agreement");
  });

  test("it is demo-gated, not dev-gated", () => {
    const src = code(COL).slice(code(COL).indexOf("function DemoPartnerResponse("),
      code(COL).indexOf("function SimulateTP("));
    assert(/if \(!DEMO \|\| !o\) return null;/.test(src), "DEMO shows it");
    const sim = code(COL).slice(code(COL).indexOf("function SimulateTP("),
      code(COL).indexOf("function SimulateTP(") + 200);
    assert(/if \(!DEV\) return null;/.test(sim), "while the simulator stays behind DEV");
  });
});

describe("D. Guards hold across the pass", () => {
  test("no raw business patching in stage handlers", () => {
    const active = code(COL);
    const handlers = active.slice(active.indexOf("marketRespond:"),
      active.indexOf("const go = (n) => setNav(n)"));
    ["agreedMarket", "agreedPercent", "tpAgreed", "collectorAgreed",
      "tpHandoff", "collectorReceipt", "inclusion"].forEach((f) =>
      assert(!new RegExp(f + "\\s*[:=]").test(handlers), "no direct write to " + f));
  });

  test("the trade-card review is a canonical action", () => {
    const w = world();
    assert(typeof w.st.actions.reviewTradeCards === "function", "the action exists");
    assert(typeof D.TRADE.decide === "function", "over a shared rule");
    const st2 = world();
    st2.st.actions.patchOpportunity(st2.o, (x) => ({ ...x, trade: { ...x.trade,
      cards: x.trade.cards.map((c) => ({ ...c, inclusion: "proposed" })) } }));
    st2.st.actions.reviewTradeCards({ oppId: st2.o, decision: "accepted", at: AT });
    eq(st2.get().trade.cards.every((c) => c.inclusion === "accepted"), true,
      "undecided rows are decided together");
  });

  test("the lifecycle and economics are unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
    eq(D.tradeValueOf({ inclusion: "accepted", agreedMarket: 900, agreedPercent: 0.75 }),
      675, "and the formula is untouched");
  });
});

require("./run.cjs").run();
