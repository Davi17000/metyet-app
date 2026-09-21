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
const { createStore, collectorProposesCash, partnerConfirms } = require("./fixture-store.cjs");   // hand-built worlds declare their Relationships (contract §2)

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

/* PHASE 1: `reviewed` worlds reach Value Trade canonically — the rows are
   submitted as proposals and the partner's reviewTradeCards accepts them, which
   is what closes Select Trade. (Patching `inclusion: "accepted"` directly left
   the Opportunity in Select Trade, where the command layer refuses value moves.)
   Unreviewed worlds keep the old Select Trade fixture for the two tests that
   exercise the review and cash-only paths themselves. */
const world = (reviewed = true) => {
  const st = createStore({
    catalog: [A_CARD, B_CARD, TARGET],
    collectors: [{ id: "casey", name: "Casey", prefs: [] }],
    partners: [{ id: "nl", name: "Northline Cards" }],
    goals: [], collectorCopies: [], binders: [], binderEntries: [], interests: [], conversations: [], opportunities: [],
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
  if (reviewed) {
    st.actions.patchOpportunity(o, (x) => ({ ...x, stage: "select-trade",
      trade: { ...x.trade, submitted: true, cards: [a, b] } }));
    st.actions.reviewTradeCards({ oppId: o, decision: "accepted", at: AT });
  } else {
    st.actions.patchOpportunity(o, (x) => ({ ...x, trade: { ...x.trade, submitted: true,
      cards: [{ ...a, inclusion: "accepted" }, { ...b, inclusion: "accepted" }] } }));
  }
  const get = () => st.get().opportunities.find((x) => x.id === o);
  return { st, o, A: a.id, B: b.id, get,
    card: (id) => get().trade.cards.find((c) => c.id === id) };
};
/* PHASE 1: the collector opens market value (D.cardOwner) and the Value Trade
   turn is one owner per Opportunity (D.nextActor), so each seat moves on every
   card it holds before the other answers. Settling the last term closes Value
   Trade canonically — the stage is no longer patched to Deal. */
const settleAll = (w, terms) => {
  const a = w.st.actions;
  terms.forEach(([id, market]) => a.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "propose", amount: market, at: AT }));
  terms.forEach(([id]) => a.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "tp", action: "accept", at: AT }));
  terms.forEach(([id, , percent]) => a.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "tp", action: "propose", percent, at: AT }));
  terms.forEach(([id]) => a.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "accept", at: AT }));
};
const bothSettled = () => {
  const w = world();
  settleAll(w, [[w.A, 1804, 0.8], [w.B, 900, 0.75]]);
  eq(w.get().stage, "deal", "valuation closed canonically");
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
    const deal = code(COL).slice(code(COL).indexOf("function DealReceipt("),
      code(COL).indexOf("function Fulfillment("));
    assert(/D\.totalTradeValue\(o\)/.test(deal), "the total is canonical");
    assert(/tradeValue\(tcd\)/.test(deal), "and each card's value");
    assert(/D\.finalBalance\(o\)/.test(deal), "as is the balance");
    assert(!/agreedMarket \*|reduce\(/.test(deal), "nothing is recomputed here");
  });

  test("each card shows what was agreed, not just the result", () => {
    const deal = code(COL).slice(code(COL).indexOf("function DealReceipt("),
      code(COL).indexOf("function Fulfillment("));
    assert(/Agreed market value/.test(deal), "the market value");
    assert(/Agreed Trade %/.test(deal), "the percentage");
    assert(/Trade value/.test(deal), "and the credit it produces");
    assert(/money\(tcd\.agreedMarket\)/.test(deal), "read from the card");
    assert(/pct\(tcd\.agreedPercent\)/.test(deal), "in both cases");
  });

  test("rows are keyed by their own identity", () => {
    const deal = code(COL).slice(code(COL).indexOf("function DealReceipt("),
      code(COL).indexOf("function Fulfillment("));
    assert(/key=\{tcd\.id \|\| tcd\.binderId\}/.test(deal),
      "two rows for one binder copy stay distinct");
  });

  test("payment direction is stated in words", () => {
    const deal = code(COL).slice(code(COL).indexOf("function DealReceipt("),
      code(COL).indexOf("function Fulfillment("));
    /* CONTRACT CHANGE: direction now comes from the canonical projection, so
       the receipt names the payer explicitly instead of testing a sign. */
    /* CONTRACT CHANGE: one canonical formatter, D.settlement(), now produces
       payer and recipient; surfaces no longer write their own sentence. */
    assert(/settle\(cash, them\)\.sentence/.test(deal),
      "the settlement line comes from the formatter");
    assert(/const settle = \(amount, partnerName\)/.test(code(COL)), "declared once");
    assert(/"No cash owed"/.test(code(
      require("fs").readFileSync(require("path").join(ROOT, "domain", "metyet-domain.js"), "utf8"))),
      "with a settled case handled in the helper");
  });

  test("a cash-only deal claims no trade", () => {
    const w = world(false);
    /* Cash-only requires an empty package; emptying it is the collector's move. */
    w.st.actions.patchOpportunity(w.o, (x) => ({ ...x, trade: { ...x.trade, cards: [] } }));
    w.st.actions.chooseCashOnly({ oppId: w.o, at: AT });
    eq(w.get().trade.mode, "cash", "the decision is recorded");
    eq(D.totalTradeValue(w.get()), 0, "and contributes nothing");
    const deal = code(COL).slice(code(COL).indexOf("function DealReceipt("),
      code(COL).indexOf("function Fulfillment("));
    assert(/No cards are going into this trade/.test(deal),
      "the screen says so rather than showing empty rows");
  });
});

describe("B. Deal agreement stays each person's own", () => {
  test("the final negotiation reads canonical fields", () => {
    /* The second silent break: this screen read proposedAdj/proposedBy, which
       Pass 2 stopped writing. A proposal was recorded and nothing appeared. */
    const deal = code(COL).slice(code(COL).indexOf("function DealReceipt("),
      code(COL).indexOf("function Fulfillment("));
    assert(!/proposedAdj|proposedBy/.test(deal), "the stale fields are gone");
    assert(/deal\.tpAdj/.test(deal) && /deal\.collectorAdj/.test(deal),
      "one standing position per side");
    assert(/deal\.agreedAdj/.test(deal), "and the settled figure");
  });

  test("a canonical proposal is actually visible to the model", () => {
    const w = bothSettled();
    /* PHASE 1: the partner confirms first; then the collector may propose. */
    collectorProposesCash(w.st, w.o, 1800, AT);
    eq(w.get().deal.collectorAdj, 1800, "recorded where the screen now reads");
    eq(w.get().deal.adjThread.length, 1, "with history");
  });

  test("one person agreeing is not both", () => {
    /* PHASE 1 (contract §4): partner first, collector second. */
    const w = bothSettled();
    w.st.actions.dealAgree({ oppId: w.o, by: "collector", at: AT });
    assert(!w.get().deal.collectorAgreed, "the collector cannot confirm before the partner");
    partnerConfirms(w.st, w.o, AT);
    eq(w.get().deal.tpAgreed, true, "theirs");
    assert(!w.get().deal.collectorAgreed, "not the collector's");
    eq(w.get().stage, "deal", "and the deal waits");
    w.st.actions.dealAgree({ oppId: w.o, by: "collector", at: AT });
    eq(w.get().stage, "fulfillment", "until both have");
  });

  test("both states are shown separately", () => {
    const deal = code(COL).slice(code(COL).indexOf("function DealReceipt("),
      code(COL).indexOf("function Fulfillment("));
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
  /* PHASE 1 FINAL CLOSEOUT: the partner-response helper acts as the Trusted
     Partner, so it is DEV-only. The hosted pilot build (DEMO on, DEV off) must
     not show it; its behaviour is exercised in the engineering build. */
  const built = {};
  const shell = (dev = false) => {
    const out = path.join(ROOT, "dist", dev ? "DevProgression.cjs" : "HostedProgression.cjs");
    if (!built[out]) {
      esbuild.buildSync({
        entryPoints: [path.join(ROOT, "shell", "MetYetPrototype.jsx")],
        outfile: out, bundle: true, format: "cjs", platform: "node",
        external: ["react", "react-dom"], jsx: "automatic", logLevel: "silent",
        define: { __METYET_DEV__: String(dev), __METYET_DEMO__: "true" },
      });
      built[out] = true;
    }
    delete require.cache[require.resolve(out)];
    return require(out).default;
  };
  const enter = (dev = false) => {
    let r; TR.act(() => { r = TR.create(React.createElement(shell(dev))); });
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
  /* PHASE 1: the helper appears only while the canonical turn is the partner's
     (D.nextActor). The Value Trade scenario opens on the COLLECTOR's move — the
     partner's 80% is standing — so the tester makes that move first, through the
     collector's real counter control. (Before Phase 1 the helper offered the
     partner a second 80% proposal here, which the reducer would refuse.) */
  const collectorCounters = (r, percent) => {
    const vc = cls(r, "vcard")[0];
    const f = vc.findAllByType("input")
      .find((i) => i.props["aria-label"] === "Trade percentage of the agreed market value");
    TR.act(() => { f.props.onChange({ target: { value: String(percent) } }); });
    click(cls(r, "vcard")[0].findAllByType("button").find((b) => /^Send/.test(txt(b))));
  };

  /* PHASE 1 FINAL CLOSEOUT: superseded "hosted demo shows partner responses".
     The hosted pilot shows none, even on the partner's turn. */
  test("hosted demo shows no partner impersonation and no engineering tools", () => {
    const r = enter();
    assert(!/Simulate/.test(txt(r.root)), "SimulateTP is absent");
    assert(!/Advance stage|Force/.test(txt(r.root)), "and no generic stage forcing");
    scenario(r, "value-trade");
    eq(cls(r, "dpr").length, 0, "nothing while it is the collector's move");
    collectorCounters(r, 85);
    eq(cls(r, "dpr").length, 0, "and nothing on the partner's turn either");
  });

  test("the engineering build offers the partner's response on the partner's turn", () => {
    const r = enter(true);
    scenario(r, "value-trade");
    eq(cls(r, "dpr").length, 0, "nothing while it is the collector's move");
    collectorCounters(r, 85);
    const box = cls(r, "dpr")[0];
    assert(box, "a partner-response block exists");
    assert(/Demo/.test(txt(box)) && /Partner response/.test(txt(box)),
      "labelled as scaffolding, in plain language");
  });

  test("only the move that is genuinely available is offered", () => {
    /* Value Trade needs a market value before a percentage; the helper offers
       whichever of those is actually next, and nothing else. */
    const r = enter(true);   // PHASE 1 FINAL CLOSEOUT: DEV-only helper
    scenario(r, "value-trade");
    collectorCounters(r, 85);
    const labels = cls(r, "dpr")[0].findAllByType("button").map(txt);
    eq(labels.length, 1, "one valid move: " + labels.join(" / "));
    assert(/proposes|accepts/.test(labels[0]), "phrased as the partner acting");
  });

  test("no response is offered when the partner has nothing to do", () => {
    const r = enter(true);   // PHASE 1 FINAL CLOSEOUT: DEV-only helper
    /* Cards not yet submitted — there is nothing for the partner to review. */
    scenario(r, "select-trade");
    eq(cls(r, "dpr").length, 0, "silence, not a disabled button");
  });

  test("fulfillment offers the plan, then the handoff", () => {
    const r = enter(true);   // PHASE 1 FINAL CLOSEOUT: DEV-only helper
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

  /* PHASE 1 FINAL CLOSEOUT: superseded "demo-gated, not dev-gated". */
  test("it is dev-gated, exactly like the simulator", () => {
    const src = code(COL).slice(code(COL).indexOf("function DemoPartnerResponse("),
      code(COL).indexOf("function SimulateTP("));
    assert(/if \(!PARTNER_SIMULATION \|\| !o\) return null;/.test(src), "DEV shows it");
    assert(/const PARTNER_SIMULATION = DEV;/.test(code(COL)), "through the canonical DEV flag");
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
    const st2 = world(false);
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
