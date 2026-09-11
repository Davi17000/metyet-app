/* ============================================================================
   ONE DEAL · ONE TIMELINE · ONE NEXT DECISION

   A prototype, and deliberately a VIEW rather than a system. The hypothesis is
   that on a phone a deal should read as one persistent chronological
   transaction, not as desktop workspaces stacked vertically.

   Two things make that safe to try. Every event on the timeline is PROJECTED
   from state that already exists — the price thread, each trade card's market
   and percentage threads, the deal adjustment thread, the fulfillment record
   and the conversation, each already carrying its own timestamp. Nothing new is
   persisted. And the current-decision block renders the EXISTING stage
   components, so every control is the canonical action: a mobile Accept is the
   same Accept, with the same turn guards and the same refusals.

   Messages ride the same chronology because that is how the deal actually
   happened, but they carry their own kind and their own shape, so a message can
   never be mistaken for — or become — an agreement.
   ========================================================================= */

process.env.METYET_DEV = "1";

/* A phone viewport for an environment with no DOM. Set before the app loads. */
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
const D = require("../domain/metyet-domain.js");
const M = require("../dist/MetYet.cjs");
const { collectorView } = require("../domain/collector-view.js");
const App = require("../dist/Collector.cjs").default;
const { __store } = require("../dist/Collector.cjs");

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const AT = "2026-08-20";

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
/* Reach the full-page deal the way the product does: choose a copy, offer,
   which routes into the deal shell. */
const openDeal = ({ narrow = true, stage = "pre-deal-ready" } = {}) => {
  NARROW = narrow;
  __store.reset(M.buildCanonicalSeed({ review: true, demoStage: stage }));
  TR.act(() => { R = TR.create(React.createElement(App)); });
  const c = S().catalog.find((x) => x.id === goal().cardId);
  const card = () => cls(R, "goal").find((n) => txt(n).includes(c.name) && txt(n).includes(c.set));
  click(cls(card(), "gs-row")[0].findAllByType("button")
    .find((b) => /^Review Card$/i.test(txt(b))));
  click(card().findAllByType("button").find((b) => /^Make an offer/.test(txt(b))));
  const f = R.root.findAllByType("input")
    .find((i) => /offer in dollars/.test(String(i.props["aria-label"] || "")));
  TR.act(() => { f.props.onChange({ target: { value: "3555" } }); });
  click(R.root.findAllByType("button").find((b) => txt(b) === "Submit offer"));
  return R;
};
const rerender = () => TR.act(() => { R.update(React.createElement(App)); });
const events = () => cls(R, "mdl-e").map((n) => txt(n));
const press = (re) => {
  const b = R.root.findAllByType("button").find((x) => re.test(txt(x)));
  assert(b, "a control matching " + re + " — saw: "
    + R.root.findAllByType("button").map(txt).filter(Boolean).join(" | "));
  click(b);
  return b;
};

describe("A. The prototype is gated to a phone", () => {
  test("a narrow viewport gets the timeline", () => {
    openDeal({ narrow: true });
    eq(cls(R, "mdl").length, 1, "the mobile shell renders");
    eq(cls(R, "dw").length, 0, "and the desktop workspace does not");
  });

  test("a desktop viewport is completely unchanged", () => {
    openDeal({ narrow: false });
    eq(cls(R, "mdl").length, 0, "no mobile shell");
    eq(cls(R, "dw").length, 1, "the existing deal workspace renders");
    assert(cls(R, "dw-ctx")[0], "with its card context intact");
  });

  test("the breakpoint is a single declared value", () => {
    assert(/const MOBILE_MAX = 560;/.test(code(COL)), "one constant");
    assert(/max-width: \$\{MOBILE_MAX\}px/.test(code(COL)), "used by the query");
    eq((code(COL).match(/const MOBILE_MAX/g) || []).length, 1, "declared once");
  });

  test("both deal shells route to the one mobile component", () => {
    /* CONTRACT CHANGE: this previously asserted the inline Goals deal was NOT
       gated, which was true when the prototype covered only the full-page
       route. A phone screenshot showed the cost of that: the path collectors
       actually take — Goals, Primary Goal, Deal Flow — still rendered the
       desktop workspace. Both shells now gate, on the same hook and the same
       breakpoint, to the same component. What matters is unchanged and
       asserted more strongly below: one implementation, one breakpoint. */
    const active = code(COL);
    eq((active.match(/if \(narrow\) return <MobileDeal/g) || []).length, 2,
      "the full-page deal and the inline Goals deal");
    eq((active.match(/function MobileDeal\(/g) || []).length, 1,
      "rendering one component");
    eq((active.match(/const narrow = useNarrow\(\);/g) || []).length, 2,
      "through the one shared hook");
    eq((active.match(/function useNarrow\(/g) || []).length, 1, "declared once");
  });
});

describe("B. The header is the canonical five", () => {
  test("it shows the five stages, not a second lifecycle", () => {
    openDeal();
    eq(cls(R, "mdl-step").map(txt).join(" | "), "Price | Trade | Value | Cash | Handoff",
      "the phone names for the canonical stages");
    eq(cls(R, "mdl-step").length, D.RECEIPT_STAGES.length, "one per canonical stage");
    const ids = code(COL).slice(code(COL).indexOf("const M_STEPS"),
      code(COL).indexOf("const M_STEPS") + 400);
    D.RECEIPT_STAGES.forEach((s) => assert(ids.includes(s), s + " is the canonical id"));
  });

  test("done, current and upcoming read differently", () => {
    openDeal();
    const now = cls(R, "mdl-step").filter((n) => String(n.props.className).includes("now"));
    eq(now.length, 1, "exactly one current stage");
    eq(txt(now[0]), "Price", "and it is where the deal actually is");
    assert(cls(R, "mdl-step").some((n) => String(n.props.className).includes("next")),
      "with upcoming stages quiet");
  });

  test("identity is present without consuming the screen", () => {
    openDeal();
    const h = cls(R, "mdl-h")[0];
    assert(/Northline Cards/.test(txt(h)), "the partner");
    assert(/Charizard|Rayquaza|Lugia|Mew/.test(txt(h)), "and the card");
    eq(cls(R, "mdl-sum").length, 0, "the full summary is collapsed by default");
  });

  test("the summary expands without leaving the timeline", () => {
    openDeal();
    press(/Deal summary/);
    assert(cls(R, "mdl-sum")[0], "it opens in place");
    eq(cls(R, "mdl").length, 1, "still on the timeline");
    assert(/Purchase price/.test(txt(cls(R, "mdl-sum")[0])), "showing the economics");
  });

  test("the summary is the canonical receipt, not a recalculation", () => {
    const shell = code(COL).slice(code(COL).indexOf("function MobileDeal("),
      code(COL).indexOf("function MobileDeal(") + 6000);
    assert(/D\.cashReceipt\(o\)/.test(shell), "direction and amounts come from the domain");
    assert(/D\.totalTradeValue\(o\)/.test(shell), "as does trade value");
    assert(!/agreedPrice -/.test(shell), "nothing is recomputed here");
  });
});

describe("C. The timeline is projected, never stored", () => {
  test("the collector's opening offer is the first event", () => {
    openDeal();
    assert(events()[0], "there is history");
    assert(/You offered \$3,555/.test(events()[0]),
      "actor, action and value: " + events()[0]);
  });

  test("events state actor, action and value", () => {
    openDeal();
    TR.act(() => { acts().patchOpportunity(opp().id, (x) => ({ ...x,
      priceThread: [...x.priceThread,
        { by: "tp", type: "propose", amount: 3700, at: "2026-08-15" }] })); });
    rerender();
    assert(events().some((e) => /Northline Cards countered at \$3,700/.test(e)),
      "the partner's move reads as theirs: " + events().join(" | "));
  });

  test("a percentage event carries the dollars it means", () => {
    const tc = { cardId: "ka", agreedMarket: 500, valueThread: [],
      percentThread: [{ by: "tp", type: "propose", percent: 0.8, at: AT }] };
    eq(D.tradeValueAt(500, 0.8), 400, "80% of $500");
    const proj = code(COL).slice(code(COL).indexOf("function dealTimeline("),
      code(COL).indexOf("function MobileDeal("));
    assert(/D\.tradeValueAt\(c\.agreedMarket, e\.percent\)/.test(proj),
      "the shared conversion, not new arithmetic");
    assert(/pct\(e\.percent\)/.test(proj), "and the shared percentage format");
  });

  test("nothing new is persisted for the timeline", () => {
    openDeal();
    const o = opp();
    ["timeline", "events", "history", "log"].forEach((k) =>
      assert(!(k in o), "no stored " + k + " on the opportunity"));
    const proj = code(COL).slice(code(COL).indexOf("function dealTimeline("),
      code(COL).indexOf("function MobileDeal("));
    assert(!/patchOpportunity|store\.|set\(/.test(proj), "the projection writes nothing");
  });

  test("only reached stages contribute events", () => {
    openDeal();
    const shown = events().join(" | ");
    assert(!/handed the card over/.test(shown), "no fulfillment event yet");
    assert(!/final cash/.test(shown), "and no cash negotiation yet");
  });

  test("events are ordered by their canonical timestamps", () => {
    openDeal();
    const proj = code(COL).slice(code(COL).indexOf("function dealTimeline("),
      code(COL).indexOf("function MobileDeal("));
    assert(/\.filter\(\(e\) => e\.at\)/.test(proj), "an event without a time is not shown");
    assert(/\.sort\(/.test(proj), "and the rest are ordered");
  });
});

describe("D. Messages travel with events but never become them", () => {
  const withMessage = () => {
    openDeal();
    const card = S().catalog.find((x) => x.id === goal().cardId);
    TR.act(() => { acts().sendMessage({ collectorId: "c12", partnerId: opp().partnerId,
      cardId: card.id, by: "collector", text: "Sounds good to me", at: "2026-08-16" }); });
    rerender();
  };

  test("a message appears in the chronology", () => {
    withMessage();
    assert(events().some((e) => /Sounds good to me/.test(e)),
      "it is on the timeline: " + events().join(" | "));
  });

  test("it is visually and semantically a different kind", () => {
    withMessage();
    const msg = cls(R, "mdl-e").find((n) => /Sounds good to me/.test(txt(n)));
    assert(String(msg.props.className).includes("message"),
      "carrying its own kind, not an event's");
    assert(cls(msg, "mdl-e-msg")[0], "and its own conversational shape");
  });

  test("a message settles nothing", () => {
    withMessage();
    const o = opp();
    eq(o.agreedPrice, null, "no price agreed by talking");
    eq(D.lastEntry(o.priceThread).type, "offer", "the standing move is still the offer");
    eq(o.stage, "agree-price", "and the stage has not moved");
  });

  test("the Messages view is chat-first, and keeps the deal around it", () => {
    /* CONTRACT CHANGE: Messages previously showed conversation alone. Reading a
       thread with no sense of what is being negotiated loses the point of it,
       so canonical milestones stay — visually distinct, and still incapable of
       being confused with something somebody said. */
    withMessage();
    press(/^Messages$/);
    const shown = cls(R, "mdl-e");
    assert(shown.length >= 1, "the view renders");
    assert(shown.some((n) => String(n.props.className).includes("message")),
      "the conversation is there");
    shown.forEach((n) => {
      const k = String(n.props.className);
      assert(/message|milestone|mine|theirs/.test(k),
        "everything is a message or a milestone: " + k);
    });
    /* And a human message still settles nothing. */
    eq(opp().agreedPrice, null, "no price agreed by talking");
  });
});

describe("E. One dominant decision, using canonical actions", () => {
  test("waiting removes the controls rather than disabling them", () => {
    openDeal();
    eq(D.nextActor(opp()).actor, "partner", "the partner owes the move");
    assert(/Waiting on Northline Cards/.test(txt(cls(R, "mdl-now-h")[0])),
      "the header says so");
    assert(!R.root.findAllByType("button").some((b) => /^Accept /.test(txt(b))),
      "and no inert Accept is offered");
  });

  test("the collector's turn presents the canonical stage component", () => {
    openDeal();
    TR.act(() => { acts().patchOpportunity(opp().id, (x) => ({ ...x,
      priceThread: [...x.priceThread,
        { by: "tp", type: "propose", amount: 3700, at: "2026-08-15" }] })); });
    rerender();
    assert(/Your move/.test(txt(cls(R, "mdl-now-h")[0])), "it is the collector's move");
    assert(R.root.findAllByType("button").some((b) => /^Accept \$3,700$/.test(txt(b))),
      "with the standing figure named");
  });

  test("a mobile action mutates the same canonical state", () => {
    openDeal();
    TR.act(() => { acts().patchOpportunity(opp().id, (x) => ({ ...x,
      priceThread: [...x.priceThread,
        { by: "tp", type: "propose", amount: 3700, at: "2026-08-15" }] })); });
    rerender();
    const id = opp().id;
    press(/^Accept \$3,700$/);
    eq(anyOpp(id).agreedPrice, 3700, "settled through the canonical action");
    eq(anyOpp(id).stage, "select-trade", "and the stage advanced canonically");
  });

  test("the completed decision becomes history and the next becomes dominant", () => {
    openDeal();
    TR.act(() => { acts().patchOpportunity(opp().id, (x) => ({ ...x,
      priceThread: [...x.priceThread,
        { by: "tp", type: "propose", amount: 3700, at: "2026-08-15" }] })); });
    rerender();
    press(/^Accept \$3,700$/);
    rerender();
    /* CONTRACT CHANGE: a closed stage collapses to its outcome, so the
       individual acceptance is inside the summary rather than beside it. The
       decision is still history — one tap away, unchanged. */
    const rows = cls(R, "mdl-e").map(txt);
    assert(rows.some((e) => /Price agreed — \$3,700/.test(e))
      || rows.some((e) => /accepted \$3,700/.test(e)),
      "the decision is recorded as history: " + rows.join(" | "));
    const now = cls(R, "mdl-step").filter((n) => String(n.props.className).includes("now"));
    eq(txt(now[0]), "Trade", "and the next stage is current");
  });

  test("the shell renders no negotiation controls of its own", () => {
    const shell = code(COL).slice(code(COL).indexOf("function MobileDeal("),
      code(COL).indexOf("function Deal({", code(COL).indexOf("function MobileDeal(")));
    ["marketRespond", "pctRespond", "dealPropose", "confirmHandoff", "patchOpportunity"]
      .forEach((a) => assert(!shell.includes(a), "no " + a + " in the mobile shell"));
    ["<AgreePrice", "<SelectTrade", "<ValueTrade", "<DealStage", "<Fulfillment"]
      .forEach((c) => assert(shell.includes(c), "it renders the canonical " + c));
  });
});

describe("F. Canonical guarantees survive on mobile", () => {
  /* These are the properties earlier passes fixed; a new view must not weaken
     any of them, so each is asserted against the same store the mobile UI
     drives. */
  const world = () => {
    const CARD = { id: "kt", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
      edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };
    const A = { id: "ka", name: "Mew ex", set: "DF", number: "1", variant: "",
      edition: "Unlimited", language: "English", grade: "PSA 8", condition: null };
    const { createStore } = require("./fixture-store.cjs");   // hand-built worlds declare their Relationships (contract §2)
    const st = createStore({
      catalog: [A, CARD], collectors: [{ id: "casey", name: "Casey", prefs: [] }],
      partners: [{ id: "nl", name: "Northline Cards" }],
      goals: [], binder: [], interests: [], conversations: [], opportunities: [],
      preferences: [], photoRequests: [], copyReviews: [],
      inventory: [{ invId: "inv-1", partnerId: "nl", cardId: "kt", ask: 4000,
        archived: false, photos: { front: "f", back: "b" } }],
    });
    const g = st.actions.addGoal({ collectorId: "casey", cardId: "kt", tier: "primary", at: AT });
    const o = st.actions.startOpportunity({ goalId: g, collectorId: "casey", partnerId: "nl",
      cardId: "kt", invId: "inv-1", listedPrice: 4000, amount: 3800, at: AT });
    st.actions.agreePrice({ oppId: o, amount: 3800, by: "tp", at: AT });
    const rows = [M.emptyTradeCard("ka", null, null, "b-a"),
      M.emptyTradeCard("ka", null, null, "b-b")];
    st.actions.patchOpportunity(o, (x) => ({ ...x, stage: "select-trade",
      trade: { ...x.trade, submitted: true, cards: rows } }));
    st.actions.reviewTradeCards({ oppId: o, decision: "accepted", at: AT });
    return { st, o, ids: rows.map((r) => r.id),
      get: () => st.get().opportunities.find((x) => x.id === o),
      card: (id) => st.get().opportunities.find((x) => x.id === o)
        .trade.cards.find((c) => c.id === id) };
  };

  test("duplicate proposals remain impossible", () => {
    const w = world();
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.ids[0], by: "collector",
      action: "propose", amount: 900, at: AT });
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.ids[0], by: "collector",
      action: "propose", amount: 950, at: AT });
    eq(w.card(w.ids[0]).valueThread.length, 1, "one move, one entry");
  });

  test("exact binder-copy identity is preserved", () => {
    const w = world();
    eq(w.card(w.ids[0]).binderId, "b-a", "the exact copy");
    eq(w.card(w.ids[1]).binderId, "b-b", "and its twin");
    assert(w.ids[0] !== w.ids[1], "with distinct row ids for the same card");
  });

  test("multi-card values stay independent and reconcile", () => {
    const w = world();
    /* PHASE 1: the collector opens market value (D.cardOwner) and the Value
       Trade turn is one owner per Opportunity (D.nextActor), so each seat moves
       on every card it holds before the other answers. Values are unchanged. */
    const A = w.st.actions;
    const terms = [[w.ids[0], 2050, 0.9], [w.ids[1], 900, 0.75]];
    terms.forEach(([id, m]) => A.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "propose", amount: m, at: AT }));
    terms.forEach(([id]) => A.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "tp", action: "accept", at: AT }));
    terms.forEach(([id, , p]) => A.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "tp", action: "propose", percent: p, at: AT }));
    terms.forEach(([id]) => A.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "accept", at: AT }));
    eq(D.tradeValueOf(w.card(w.ids[0])), 1845, "$2,050 x 90%");
    eq(D.tradeValueOf(w.card(w.ids[1])), 675, "$900 x 75%");
    eq(D.totalTradeValue(w.get()), 2520, "totalling $2,520");
  });

  test("signed cash direction survives in every direction", () => {
    const mk = (price, trade) => ({ agreedPrice: price,
      trade: { cards: [{ inclusion: "accepted", agreedMarket: trade, agreedPercent: 1 }] },
      deal: {} });
    eq(D.cashReceipt(mk(1000, 275)).calculated.direction, "collector-to-tp", "you owe");
    eq(D.cashReceipt(mk(700, 1000)).calculated.direction, "tp-to-collector", "they owe");
    eq(D.cashReceipt(mk(1000, 1000)).calculated.direction, "settled", "nobody owes");
    /* RE-ANCHORED, not weakened. The wording used to be written inside
       MobileDeal; direction is now a sentence the domain produces and the shell
       renders, so the assertion follows it to the canonical helper — a stronger
       guarantee, since every seat reads the same one. */
    const shell = code(COL).slice(code(COL).indexOf("function MobileDeal("),
      code(COL).indexOf("function Deal({", code(COL).indexOf("function MobileDeal(")));
    /* The shell reaches the helper through the file-level `settle` alias, so
       accept either spelling — what matters is that it does not compose the
       sentence itself. */
    assert(/settle\(D\.finalBalance\(o\), them\)\.sentence/.test(shell)
      || /D\.settlement\(/.test(shell),
      "the phone says which way, through the canonical settlement helper");
    assert(!/owes you`|\" owes you\"/.test(shell),
      "and never assembles that sentence locally");
    assert(!/Math\.abs\(D\.calculatedBalance/.test(shell), "without discarding the sign");
    /* And the helper genuinely says it, in both directions. */
    eq(D.settlement(272, { viewer: "collector", partner: "NL" }).sentence,
      "You pay NL", "the collector owing");
    eq(D.settlement(-272, { viewer: "collector", partner: "NL" }).sentence,
      "NL pays you", "and the partner owing");
  });

  test("a final cash agreement does not reopen upstream terms", () => {
    const w = world();
    w.st.actions.patchOpportunity(w.o, (x) => ({ ...x, stage: "deal",
      deal: { adjThread: [] } }));
    const before = JSON.stringify(w.get().trade.cards);
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "collector", action: "propose",
      amount: 1400, at: AT });
    w.st.actions.dealAdjustRespond({ oppId: w.o, by: "tp", action: "accept", at: AT });
    eq(JSON.stringify(w.get().trade.cards), before, "card terms are byte-identical");
    eq(w.get().agreedPrice, 3800, "and so is the agreed price");
  });

  test("a completed deal reads completed, and reconciles", () => {
    openDeal();
    const id = opp().id;
    TR.act(() => { acts().patchOpportunity(id, (x) => ({ ...x, stage: "completed",
      agreedPrice: 3555, completedAt: "2026-08-19" })); });
    rerender();
    assert(/Deal completed/.test(txt(cls(R, "mdl-now")[0])), "unmistakably done");
    press(/View receipt/);
    const sum = txt(cls(R, "mdl-sum")[0]);
    assert(/\$3,555/.test(sum), "with figures that match the deal: " + sum);
  });

  test("the lifecycle is unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
  });
});

require("./run.cjs").run();
