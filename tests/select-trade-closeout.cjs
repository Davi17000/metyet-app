/* ============================================================================
   SELECT TRADE PRESENTS ONE COHERENT CHOICE

   Cash-only and a live trade card are contradictory intents, but the screen
   offered both at once. Choosing "Continue without trade" with a card selected
   produced a deal that was a cash purchase AND a pending trade simultaneously:
   mode "cash", stage "deal", and a row still sitting at "proposed" that Value
   Trade had been skipped past and could never resolve.

   Hiding the button would have fixed the screen and left the invariant open to
   any other caller, so the rule lives in the canonical action and the UI simply
   reflects it. A row is "live" if it is awaiting the partner's decision, or
   accepted and not withdrawn — rejected and withdrawn rows keep their history
   but are out of the trade, and correctly block nothing.

   The rest is subtraction. The "Your cards" preamble restated what the stage
   guidance already said, and the details column counted cards that were listed
   in full a few inches away. Removing both leaves room for the actual decision:
   offer these cards, go fetch more, or buy outright.
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

/* ---- domain fixtures ---------------------------------------------------- */
const A_CARD = { id: "ka", name: "Mew ex", set: "Pokemon 151", number: "193/165",
  variant: "SIR", edition: "Unlimited", language: "English", grade: "PSA 10", condition: null };
const TARGET = { id: "kt", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };

const atSelectTrade = (rows) => {
  const st = createStore({
    catalog: [A_CARD, TARGET],
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
  st.actions.patchOpportunity(o, (x) => ({ ...x, stage: "select-trade",
    trade: { ...x.trade, submitted: rows.length > 0, cards: rows } }));
  const get = () => st.get().opportunities.find((x) => x.id === o);
  return { st, o, get, rows: () => get().trade.cards };
};
const row = (over) => ({ ...M.emptyTradeCard("ka", null, null, "b-a"), ...over });

/* ---- rendered fixtures -------------------------------------------------- */
const S = () => __store.get().get();
const acts = () => __store.get().actions;
const goal = () => collectorView(S(), "c12").myGoals()
  .find((g) => /^Review deal/.test(g.note || ""));
const opp = () => D.activeOppForGoal(goal().id, S().opportunities);
let R = null;
const render = (mutate) => {
  __store.reset(M.buildCanonicalSeed({ review: true, demoStage: "select-trade" }));
  if (mutate) TR.act(() => { acts().patchOpportunity(opp().id, mutate); });
  TR.act(() => { R = TR.create(React.createElement(App)); });
  cls(R, "goal").forEach((g) => {
    const d = g.findAllByType("button")
      .find((b) => String(b.props.className || "").includes("goal-deal"));
    if (d && !d.props["aria-expanded"]) click(d);
  });
  return R;
};
const labels = () => cls(R, "goal").flatMap((n) => n.findAllByType("button")).map(txt);
const press = (re) => {
  const b = cls(R, "goal").flatMap((n) => n.findAllByType("button"))
    .find((x) => re.test(txt(x)));
  assert(b, "a control matching " + re + " — saw: " + labels().filter(Boolean).join(" | "));
  click(b);
  return b;
};
const emptyPackage = (x) => ({ ...x, trade: { ...x.trade, submitted: false, cards: [] } });

describe("A. Cash-only is the empty-package path", () => {
  test("the contradiction is refused at the action, not just hidden", () => {
    /* Reproduces the browser bug: before this, the deal advanced to `deal` with
       mode "cash" and a row still at "proposed". */
    const w = atSelectTrade([row()]);
    const res = w.st.actions.chooseCashOnly({ oppId: w.o, at: AT });
    eq(res.refused, D.REFUSE.tradeCardsSelected, "a direct caller cannot create it");
    eq(w.get().stage, "select-trade", "the deal did not advance");
    assert(!w.get().trade.mode, "and no cash intent was recorded");
  });

  test("an accepted card blocks it too", () => {
    const w = atSelectTrade([row({ inclusion: "accepted" })]);
    eq(w.st.actions.chooseCashOnly({ oppId: w.o, at: AT }).refused,
      D.REFUSE.tradeCardsSelected, "an accepted card is still in the trade");
  });

  test("rejected and withdrawn rows block nothing", () => {
    /* They keep their history but are out of the trade, so cash-only is
       coherent — this is why the rule is about live rows, not row count. */
    const rejected = atSelectTrade([row({ inclusion: "rejected" })]);
    rejected.st.actions.chooseCashOnly({ oppId: rejected.o, at: AT });
    eq(rejected.get().trade.mode, "cash", "a rejected card does not block it");
    eq(rejected.rows().length, 1, "and its row survives");

    const gone = atSelectTrade([row({ inclusion: "accepted", withdrawn: true })]);
    gone.st.actions.chooseCashOnly({ oppId: gone.o, at: AT });
    eq(gone.get().trade.mode, "cash", "nor does a withdrawn one");
  });

  test("removing the cards makes it valid again", () => {
    const w = atSelectTrade([row()]);
    eq(w.st.actions.chooseCashOnly({ oppId: w.o, at: AT }).refused,
      D.REFUSE.tradeCardsSelected, "blocked while the card is in");
    w.st.actions.patchOpportunity(w.o, (x) => ({ ...x, trade: { ...x.trade, cards: [] } }));
    w.st.actions.chooseCashOnly({ oppId: w.o, at: AT });
    eq(w.get().trade.mode, "cash", "and available once the package is empty");
    eq(w.get().stage, "deal", "advancing correctly");
  });

  test("the valid path fabricates no trade rows", () => {
    const w = atSelectTrade([]);
    w.st.actions.chooseCashOnly({ oppId: w.o, at: AT });
    eq(w.rows().length, 0, "nothing is invented to value");
    eq(D.totalTradeValue(w.get()), 0, "and there is no trade credit");
    eq(w.get().trade.cashOnlyAt, AT, "the decision is dated, not merely absent");
  });

  test("the button is absent while cards are in the trade", () => {
    render();
    assert(D.TRADE.liveTradeRows(opp()).length > 0, "the seeded package has cards");
    assert(!labels().some((t) => /Continue without trade/.test(t)),
      "so the contradictory choice is not offered");
  });

  test("it returns once the package is emptied", () => {
    render(emptyPackage);
    assert(labels().some((t) => /Continue without trade/.test(t)),
      "with nothing in the trade, buying outright is a real choice");
  });

  test("the UI reflects the rule rather than restating it", () => {
    const src = code(COL);
    assert(/liveRows\.length === 0 && \(/.test(src), "visibility follows the live rows");
    assert(/D\.TRADE\.liveTradeRows\(o\)/.test(src), "read from the canonical helper");
    assert(!/hasTradeSelection/.test(src), "no parallel boolean was invented");
  });
});

describe("B. Update Binder navigates and nothing else", () => {
  test("it is offered in Select Trade", () => {
    render(emptyPackage);
    assert(labels().some((t) => /^Update Binder$/.test(t)), "the action exists");
  });

  test("it goes to the Trade Binder", () => {
    const src = code(COL).slice(code(COL).indexOf("function SelectTrade("),
      code(COL).indexOf("function SelectTrade(") + 4000);
    assert(/go\(\{ v: "binder" \}\)/.test(src), "the existing binder route");
  });

  test("the opportunity is byte-identical across the navigation", () => {
    render();
    const before = JSON.stringify(opp());
    press(/^Update Binder$/);
    eq(JSON.stringify(opp()), before,
      "no stage, no selection, no trade row, no history changed");
  });

  test("the whole world is untouched, not just the deal", () => {
    render();
    const before = JSON.stringify({ o: S().opportunities, c: S().conversations,
      b: S().binder, i: S().interests });
    press(/^Update Binder$/);
    eq(JSON.stringify({ o: S().opportunities, c: S().conversations,
      b: S().binder, i: S().interests }), before, "navigation only");
  });

  test("it does not compete with sending the cards", () => {
    render();
    const btn = cls(R, "goal").flatMap((n) => n.findAllByType("button"))
      .find((x) => /^Update Binder$/.test(txt(x)));
    assert(btn, "the control renders");
    const c = String(btn.props.className || "");
    assert(!/\bpri\b|\bdeep\b/.test(c), "secondary, not a primary CTA: " + c);
    assert(/\bsm\b/.test(c), "and small");
  });
});

describe("C. Redundant surfaces are gone", () => {
  test("the explanatory preamble is removed", () => {
    render();
    const page = txt(cls(R, "goal")[0]);
    assert(!/Pick what you'd put toward this/.test(page), "the paragraph is gone");
    assert(!/You'll agree what each one is worth after/.test(page), "all of it");
    assert(!/Pick what you'd put toward this/.test(COL), "and gone from source");
  });

  test("Select Trade renders no details column", () => {
    render();
    eq(cls(R, "idf-det").length, 0, "the counts duplicated the card list beside them");
    const page = txt(cls(R, "goal")[0]);
    ["Unresolved", "Sent for review"].forEach((k) =>
      assert(!new RegExp(k).test(page), k + " is no longer shown here"));
  });

  test("no empty column is left reserving space", () => {
    render();
    assert(/if \(rows\.length === 0\) return null;/.test(code(COL)),
      "a stage with nothing to summarise renders no column at all");
  });

  test("other stages keep their details", () => {
    ["value-trade", "deal", "fulfillment"].forEach((stage) => {
      __store.reset(M.buildCanonicalSeed({ review: true, demoStage: stage }));
      TR.act(() => { R = TR.create(React.createElement(App)); });
      cls(R, "goal").forEach((g) => {
        const d = g.findAllByType("button")
          .find((b) => String(b.props.className || "").includes("goal-deal"));
        if (d && !d.props["aria-expanded"]) click(d);
      });
      eq(cls(R, "idf-det").length, 1, stage + " still summarises its own terms");
    });
  });

  test("the receipt model itself was not touched", () => {
    /* Presentation was removed; nothing canonical was deleted to hide it. */
    const w = atSelectTrade([row({ inclusion: "accepted" })]);
    eq(D.acceptedTradeCards(w.get()).length, 1, "inclusion state is intact");
    eq(w.get().trade.submitted, true, "as is submission");
    eq(w.rows()[0].inclusion, "accepted", "and each row's own status");
  });

  test("the conversation survives", () => {
    render();
    eq(cls(R, "chat-embed").length, 1, "one conversation, still there");
  });
});

describe("D. Nothing upstream or downstream regressed", () => {
  test("the close-selection rule still runs", () => {
    const w = atSelectTrade([row()]);
    w.st.actions.reviewTradeCards({ oppId: w.o, decision: "accepted", at: AT });
    eq(w.get().stage, "value-trade", "the prior pass's fix is intact");
  });

  test("all-rejected still becomes a cash purchase", () => {
    const w = atSelectTrade([row()]);
    w.st.actions.reviewTradeCards({ oppId: w.o, decision: "rejected", at: AT });
    eq(w.get().stage, "deal", "nothing left to value");
    eq(w.get().trade.mode, "cash", "so it settles in cash");
  });

  test("cards still use the canonical shape and identity", () => {
    const w = atSelectTrade([row()]);
    const tc = w.rows()[0];
    ["id", "cardId", "binderId", "valueThread", "percentThread"].forEach((k) =>
      assert(k in tc, k + " survives"));
    eq(tc.binderId, "b-a", "the exact physical copy");
  });

  test("submitting still uses the canonical factory", () => {
    const src = code(COL);
    assert(/emptyTradeCard\(/.test(src), "the shared factory");
    assert(!/inclusion: "proposed"/.test(src), "not a hand-built row");
  });

  test("the lifecycle is unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
  });
});

require("./run.cjs").run();
