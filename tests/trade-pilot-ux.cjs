/* ============================================================================
   A TRADE IS A SET OF CARDS, EACH WITH ITS OWN STORY

   This pass began by finding that Pass 2 had silently broken Value Trade. When
   trade cards gained their own row id, `marketRespond`/`pctRespond` were changed
   to take it — but the four call sites in ValueCard still passed `binderId`. The
   id matched nothing, so every Accept and every Send became a no-op. Nothing
   threw, nothing failed, and the full suite stayed green, because no test had
   ever driven those buttons through the store.

   That is the lesson this suite exists to encode: the assertions here address
   cards by row id and check the STORE afterwards, so a mismatch cannot hide
   behind a render that looks fine.

   The rest is the per-card experience. Market value and Trade % are the same
   conversation in different units, so they share one shape — standing proposal,
   who made it, accept or counter, history — and the second is locked until the
   first settles, because a percentage of an unagreed number means nothing.
   ========================================================================= */

process.env.METYET_DEV = "1";

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");
const M = require("../dist/MetYet.cjs");
const { createStore } = require("../domain/metyet-store.js");
const { collectorView } = require("../domain/collector-view.js");
const App = require("../dist/Collector.cjs").default;
const { __store } = require("../dist/Collector.cjs");

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

/* ---- a two-card trade, built entirely through canonical actions ---------- */
const CARD_A = { id: "ka", name: "Mew ex", set: "Pokemon 151", number: "193/165",
  variant: "SIR", edition: "Unlimited", language: "English", grade: "PSA 10", condition: null };
const CARD_B = { id: "kb", name: "Lugia", set: "Neo Genesis", number: "9/111",
  variant: "Holo", edition: "Unlimited", language: "English", grade: "PSA 8", condition: null };
const TARGET = { id: "kt", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };

const twoCardTrade = () => {
  const st = createStore({
    catalog: [CARD_A, CARD_B, TARGET],
    collectors: [{ id: "casey", name: "Casey", prefs: [] }],
    partners: [{ id: "nl", name: "Northline Cards" }],
    goals: [], binder: [], interests: [], conversations: [], opportunities: [],
    preferences: [], photoRequests: [], copyReviews: [],
    inventory: [{ invId: "inv-1", partnerId: "nl", cardId: "kt", ask: 4000,
      archived: false, photos: { front: "f", back: "b" } }],
  });
  const g = st.actions.addGoal({ collectorId: "casey", cardId: "kt", tier: "primary", at: AT });
  const o = st.actions.startOpportunity({ goalId: g, collectorId: "casey", partnerId: "nl",
    cardId: "kt", invId: "inv-1", listedPrice: 4000, amount: 3600, at: AT });
  st.actions.agreePrice({ oppId: o, amount: 3600, by: "tp", at: AT });
  const a = M.emptyTradeCard("ka", null, null, "b-a");
  const b = M.emptyTradeCard("kb", null, null, "b-b");
  st.actions.patchOpportunity(o, (x) => ({ ...x, trade: { ...x.trade, submitted: true,
    cards: [{ ...a, inclusion: "accepted" }, { ...b, inclusion: "accepted" }] } }));
  const get = () => st.get().opportunities.find((x) => x.id === o);
  return { st, o, A: a.id, B: b.id, get,
    card: (id) => get().trade.cards.find((c) => c.id === id) };
};
const settleMarket = (w, id, amount) => {
  w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "tp",
    action: "propose", amount, at: AT });
  w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "collector",
    action: "accept", at: AT });
};

describe("A. The regression that started this pass", () => {
  test("trade rows are addressed by their own id, never the binder copy", () => {
    /* Pass 2 changed the signature; four call sites kept passing binderId and
       every one became a silent no-op. This is the guard against a repeat. */
    const active = code(COL);
    assert(!/marketRespond\(o\.id, tcd\.binderId/.test(active), "market uses the row id");
    assert(!/pctRespond\(o\.id, tcd\.binderId/.test(active), "percentage too");
    assert(/marketRespond\(o\.id, tcd\.id,/.test(active), "explicitly");
    assert(/pctRespond\(o\.id, tcd\.id,/.test(active), "in both phases");
  });

  test("addressing by the wrong identifier changes nothing at all", () => {
    /* The failure mode was silence — worth pinning, so the shape of the bug
       stays visible rather than only its current fix. */
    const w = twoCardTrade();
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: "b-a", by: "collector",
      action: "propose", amount: 500, at: AT });
    eq(w.card(w.A).collectorMarket, null, "a binderId addresses no row");
    eq(w.card(w.A).valueThread.length, 0, "and records nothing");
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.A, by: "collector",
      action: "propose", amount: 500, at: AT });
    eq(w.card(w.A).collectorMarket, 500, "the row id does");
  });
});

describe("B. Each card negotiates its market value alone", () => {
  test("two cards hold different market states at once", () => {
    const w = twoCardTrade();
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.A, by: "tp",
      action: "propose", amount: 1804, at: AT });
    eq(w.card(w.A).tpMarket, 1804, "one card has a standing proposal");
    eq(w.card(w.B).tpMarket, null, "the other has none");
  });

  test("settling one does not settle the other", () => {
    const w = twoCardTrade();
    settleMarket(w, w.A, 1804);
    eq(w.card(w.A).agreedMarket, 1804, "card A is agreed");
    eq(w.card(w.B).agreedMarket, null, "card B is untouched");
  });

  test("the full exchange is preserved per card", () => {
    const w = twoCardTrade();
    const a = w.st.actions;
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.A, by: "collector", action: "propose", amount: 1900, at: AT });
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.A, by: "tp", action: "propose", amount: 1804, at: AT });
    a.tradeMarketRespond({ oppId: w.o, tradeCardId: w.A, by: "collector", action: "accept", at: AT });
    eq(w.card(w.A).valueThread.map((e) => e.by + ":" + e.type + ":" + e.amount).join(" | "),
      "collector:propose:1900 | tp:propose:1804 | collector:accept:1804",
      "the history is the record, not the final number");
    eq(w.card(w.B).valueThread.length, 0, "and belongs to that card only");
  });
});

describe("C. Trade % is per card, and waits its turn", () => {
  test("it is locked until that card's market value is agreed", () => {
    const w = twoCardTrade();
    w.st.actions.tradePercentRespond({ oppId: w.o, tradeCardId: w.A, by: "tp",
      action: "propose", percent: 0.8, at: AT });
    eq(w.card(w.A).tpPercent, null, "a percentage of an unagreed number means nothing");
    eq(w.card(w.A).percentThread.length, 0, "so nothing is recorded");
  });

  test("locking is per card, not per stage", () => {
    const w = twoCardTrade();
    settleMarket(w, w.A, 1804);
    w.st.actions.tradePercentRespond({ oppId: w.o, tradeCardId: w.A, by: "tp", action: "propose", percent: 0.8, at: AT });
    w.st.actions.tradePercentRespond({ oppId: w.o, tradeCardId: w.B, by: "tp", action: "propose", percent: 0.75, at: AT });
    eq(w.card(w.A).tpPercent, 0.8, "the settled card can proceed");
    eq(w.card(w.B).tpPercent, null, "while the unsettled one still cannot");
  });

  test("the partner can propose a different percentage per card", () => {
    const w = twoCardTrade();
    settleMarket(w, w.A, 1804);
    settleMarket(w, w.B, 900);
    w.st.actions.tradePercentRespond({ oppId: w.o, tradeCardId: w.A, by: "tp", action: "propose", percent: 0.8, at: AT });
    w.st.actions.tradePercentRespond({ oppId: w.o, tradeCardId: w.B, by: "tp", action: "propose", percent: 0.75, at: AT });
    eq(w.card(w.A).tpPercent, 0.8, "80% here");
    eq(w.card(w.B).tpPercent, 0.75, "75% there — there is no global percentage");
  });

  test("the collector can accept one and counter the other", () => {
    const w = twoCardTrade();
    settleMarket(w, w.A, 1804);
    settleMarket(w, w.B, 900);
    const a = w.st.actions;
    a.tradePercentRespond({ oppId: w.o, tradeCardId: w.A, by: "tp", action: "propose", percent: 0.8, at: AT });
    a.tradePercentRespond({ oppId: w.o, tradeCardId: w.B, by: "tp", action: "propose", percent: 0.75, at: AT });
    a.tradePercentRespond({ oppId: w.o, tradeCardId: w.A, by: "collector", action: "accept", at: AT });
    a.tradePercentRespond({ oppId: w.o, tradeCardId: w.B, by: "collector", action: "propose", percent: 0.85, at: AT });
    eq(w.card(w.A).agreedPercent, 0.8, "one settled");
    eq(w.card(w.B).agreedPercent, null, "one still open");
    eq(w.card(w.B).collectorPercent, 0.85, "with the counter standing");
    eq(w.card(w.B).percentThread.map((e) => e.by).join(","), "tp,collector", "and recorded");
  });

  test("the economics come out of the domain", () => {
    const w = twoCardTrade();
    settleMarket(w, w.A, 1804);
    settleMarket(w, w.B, 900);
    const a = w.st.actions;
    [[w.A, 0.8], [w.B, 0.75]].forEach(([id, p]) => {
      a.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "tp", action: "propose", percent: p, at: AT });
      a.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "accept", at: AT });
    });
    eq(D.tradeValueOf(w.card(w.A)), 1443, "$1,804 x 80% = $1,443");
    eq(D.tradeValueOf(w.card(w.B)), 675, "$900 x 75% = $675");
    eq(D.totalTradeValue(w.get()), 2118, "totalling $2,118");
  });
});

describe("D. Removing a card keeps what happened", () => {
  test("there is a shared canonical action for it", () => {
    /* It existed only as a TP-module reducer; this pass lifted it, following
       the pattern Pass 2 established rather than raw-patching the field. */
    assert(typeof D.TRADE.withdraw === "function", "the rule is in the domain");
    const w = twoCardTrade();
    assert(typeof w.st.actions.withdrawTradeCard === "function", "and reachable as an action");
  });

  test("withdrawal affects only the card withdrawn", () => {
    const w = twoCardTrade();
    settleMarket(w, w.A, 1804);
    w.st.actions.withdrawTradeCard({ oppId: w.o, tradeCardId: w.A, at: AT });
    eq(w.card(w.A).withdrawn, true, "that card is out");
    eq(w.card(w.B).withdrawn, false, "its sibling is not");
  });

  test("history survives removal", () => {
    const w = twoCardTrade();
    settleMarket(w, w.A, 1804);
    const before = w.card(w.A).valueThread.length;
    w.st.actions.withdrawTradeCard({ oppId: w.o, tradeCardId: w.A, at: AT });
    eq(w.card(w.A).valueThread.length, before, "the negotiation still happened");
    eq(w.card(w.A).agreedMarket, 1804, "and what was agreed is still readable");
    assert(w.card(w.A).withdrawnAt, "with the moment it left recorded");
  });

  test("a withdrawn card stops contributing", () => {
    const w = twoCardTrade();
    settleMarket(w, w.A, 1804);
    settleMarket(w, w.B, 900);
    const a = w.st.actions;
    [[w.A, 0.8], [w.B, 0.75]].forEach(([id, p]) => {
      a.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "tp", action: "propose", percent: p, at: AT });
      a.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "accept", at: AT });
    });
    eq(D.totalTradeValue(w.get()), 2118, "both counted");
    a.withdrawTradeCard({ oppId: w.o, tradeCardId: w.A, at: AT });
    eq(D.totalTradeValue(w.get()), 675, "and only the remaining card after");
  });

  test("the row is never deleted", () => {
    const w = twoCardTrade();
    w.st.actions.withdrawTradeCard({ oppId: w.o, tradeCardId: w.A, at: AT });
    eq(w.get().trade.cards.length, 2, "a flag, not a delete");
    const src = code(COL);
    assert(/st\.withdrawTradeCard\(o\.id, tcd\.id\)/.test(src), "the UI calls the action");
    assert(!/withdrawn: true/.test(src), "and never sets the flag itself");
  });
});

describe("E. One negotiation grammar, rendered per card", () => {
  const boot = (stage) => {
    __store.reset(M.buildCanonicalSeed({ review: true, demoStage: stage }));
    let r; TR.act(() => { r = TR.create(React.createElement(App)); });
    cls(r, "goal").forEach((g) => {
      const d = g.findAllByType("button")
        .find((b) => String(b.props.className || "").includes("goal-deal"));
      if (d && !d.props["aria-expanded"]) click(d);
    });
    return r;
  };

  test("every active card gets its own panel", () => {
    const r = boot("value-trade");
    const cards = cls(r, "vcard");
    assert(cards.length >= 1, "a panel per card");
    const view = collectorView(__store.get().get(), "c12");
    const goal = view.myGoals().find((g) => /^Review deal/.test(g.note || ""));
    const opp = D.activeOppForGoal(goal.id, __store.get().get().opportunities);
    eq(cards.length, D.acceptedTradeCards(opp).length,
      "one panel per active trade card, no aggregate surface");
  });

  test("both units of negotiation use the same panel shape", () => {
    const r = boot("value-trade");
    const card = cls(r, "vcard")[0];
    const phases = cls(card, "vp");
    eq(phases.length, 2, "market value and Trade %, side by side in one grammar");
    const labels = phases.map((p) => txt(cls(p, "vp-h")[0]));
    eq(labels.join(" | "), "Market value | Trade %", "each named for what it settles");
  });

  test("card identity and status lead each panel", () => {
    const r = boot("value-trade");
    const card = cls(r, "vcard")[0];
    assert(cls(card, "art")[0], "the card itself");
    assert(txt(cls(card, "vcard-n")[0]).length > 0, "its name");
    assert(txt(cls(card, "vcard-st")[0]).length > 0, "and where this card has got to");
  });

  test("the UI writes no economics of its own", () => {
    const active = code(COL);
    const vc = active.slice(active.indexOf("function ValueCard("),
      active.indexOf("function ValueCard(") + 6000);
    ["agreedMarket:", "agreedPercent:", "withdrawn:", "stage:"].forEach((f) =>
      assert(!vc.includes(f), "no direct write of " + f));
    assert(!/Math\.round\([^)]*agreedMarket \*/.test(vc),
      "and the rounding rule is not restated");
    assert(/D\.tradeValueAt\(/.test(vc), "previews use the canonical helper");
  });
});

describe("F. Select Trade keeps its canonical paths", () => {
  test("Continue without trade is intact and canonical", () => {
    const active = code(COL);
    assert(/Continue without trade/.test(active), "still offered");
    assert(/st\.chooseCashOnly\(o\.id\)/.test(active), "through the canonical action");
    assert(!/mode: "cash"/.test(active), "and the UI never sets the mode itself");
  });

  test("proposed cards still use the canonical factory", () => {
    const active = code(COL);
    assert(/emptyTradeCard\(/.test(active), "the shared factory");
    assert(!/inclusion: "proposed"/.test(active), "not a hand-built reduced object");
  });

  test("engineering tooling remains DEV-only", () => {
    const sim = code(COL).slice(code(COL).indexOf("function SimulateTP("),
      code(COL).indexOf("function SimulateTP(") + 200);
    assert(/if \(!DEV\) return null;/.test(sim), "SimulateTP is not a demo control");
  });

  test("the lifecycle is untouched", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
  });
});

require("./run.cjs").run();
