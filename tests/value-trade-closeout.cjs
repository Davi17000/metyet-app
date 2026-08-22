/* ============================================================================
   VALUE TRADE ASKS TWO QUESTIONS, ONE AT A TIME

   What is this card worth, and how much of that counts toward the deal. The
   same negotiation twice in different units — so it uses one shape, and the
   only thing that changes is whether the number is dollars or a percentage.

   The screen previously treated both as equally live even after the first was
   settled: an agreed $1,804 sat in a panel still shaped like an open
   negotiation, competing for attention with the 80% actually being decided. And
   because the two phases shared an empty-state label, the percentage field
   invited the collector to "Enter an amount".

   Now an agreed term collapses into context beside the card it describes, its
   history one click away, and the open question is the only thing shaped like a
   decision. Nothing is erased, nothing is recalculated locally, and no display
   state exists apart from what the domain already holds.
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

/* ---- domain fixture: a real two-card trade at Value Trade ---------------- */
const MEW = { id: "ka", name: "Mew ex", set: "Dragon Frontiers", number: "1",
  variant: "", edition: "Unlimited", language: "English", grade: "PSA 8", condition: null };
const LUGIA = { id: "kb", name: "Lugia", set: "Neo Genesis", number: "9/111",
  variant: "Holo", edition: "Unlimited", language: "English", grade: "PSA 8", condition: null };
const TARGET = { id: "kt", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };

const world = (n = 1) => {
  const st = createStore({
    catalog: [MEW, LUGIA, TARGET],
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
  const rows = [M.emptyTradeCard("ka", null, null, "b-a")];
  if (n > 1) rows.push(M.emptyTradeCard("kb", null, null, "b-b"));
  st.actions.patchOpportunity(o, (x) => ({ ...x, stage: "select-trade",
    trade: { ...x.trade, submitted: true, cards: rows } }));
  st.actions.reviewTradeCards({ oppId: o, decision: "accepted", at: AT });
  const get = () => st.get().opportunities.find((x) => x.id === o);
  return { st, o, get, ids: rows.map((r) => r.id),
    card: (id) => get().trade.cards.find((c) => c.id === id) };
};
const agreeMarket = (w, id, amount) => {
  w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "tp", action: "propose", amount, at: AT });
  w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "accept", at: AT });
};
const agreePercent = (w, id, percent) => {
  w.st.actions.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "tp", action: "propose", percent, at: AT });
  w.st.actions.tradePercentRespond({ oppId: w.o, tradeCardId: id, by: "collector", action: "accept", at: AT });
};

/* ---- rendered fixture: the screenshot state ----------------------------- */
const S = () => __store.get().get();
const acts = () => __store.get().actions;
const goal = () => collectorView(S(), "c12").myGoals()
  .find((g) => /^Review deal/.test(g.note || ""));
const opp = () => D.activeOppForGoal(goal().id, S().opportunities);
let R = null;
const render = (mutateCard) => {
  __store.reset(M.buildCanonicalSeed({ review: true, demoStage: "value-trade" }));
  if (mutateCard) {
    const tc = opp().trade.cards.find((c) => c.inclusion === "accepted");
    TR.act(() => { acts().patchOpportunity(opp().id, (x) => ({ ...x,
      trade: { ...x.trade, cards: x.trade.cards.map((c) => (c.id === tc.id
        ? { ...c, ...mutateCard } : c)) } })); });
  }
  TR.act(() => { R = TR.create(React.createElement(App)); });
  cls(R, "goal").forEach((g) => {
    const d = g.findAllByType("button")
      .find((b) => String(b.props.className || "").includes("goal-deal"));
    if (d && !d.props["aria-expanded"]) click(d);
  });
  return cls(R, "vcard")[0];
};
/* Market agreed at $1,804, partner proposes 80%, collector's move. */
const SCREENSHOT = { agreedMarket: 1804, agreedPercent: null, tpPercent: 0.8,
  collectorPercent: null, percentThread: [{ by: "tp", type: "propose", percent: 0.8, at: AT }] };
const labels = (vc) => vc.findAllByType("button").map(txt).filter(Boolean);

describe("A. Details are gone; the workspace is not", () => {
  test("Value Trade renders no details column", () => {
    render();
    eq(cls(R, "idf-det").length, 0, "the region is absent, not hidden");
    eq(cls(R, "idf-det-k").length, 0, "and none of its fields render");
  });

  test("no empty wrapper reserves the space", () => {
    assert(/if \(rows\.length === 0\) return null;/.test(code(COL)),
      "a stage with nothing to summarise renders no column at all");
  });

  test("the conversation is still there", () => {
    render();
    eq(cls(R, "chat-embed").length, 1, "one conversation, unchanged");
  });

  test("Deal and Fulfillment keep their details", () => {
    ["deal", "fulfillment"].forEach((stage) => {
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

  test("nothing canonical was deleted to hide the column", () => {
    const w = world();
    agreeMarket(w, w.ids[0], 1804);
    agreePercent(w, w.ids[0], 0.8);
    eq(D.acceptedTradeCards(w.get()).length, 1, "accepted cards still tracked");
    eq(D.totalTradeValue(w.get()), 1443, "and the total still computes");
  });
});

describe("B. An agreed market value becomes context", () => {
  test("it appears with the card's identity", () => {
    const vc = render(SCREENSHOT);
    const ctx = cls(vc, "vcard-agreed")[0];
    assert(ctx, "the agreed value sits in the identity block");
    assert(/Agreed market value/.test(txt(ctx)), "named as agreed");
    assert(/\$1,804/.test(txt(ctx)), "showing the settled figure");
    assert(/Mew ex/.test(txt(vc)), "beside the card it describes");
  });

  test("an unsettled proposal is never labelled agreed", () => {
    /* The partner has proposed but nothing is agreed. */
    const vc = render({ agreedMarket: null, tpMarket: 1804,
      valueThread: [{ by: "tp", type: "propose", amount: 1804, at: AT }] });
    eq(cls(vc, "vcard-agreed").length, 0, "no agreed context while it is open");
    assert(/Proposed by/.test(txt(vc)), "it reads as a proposal");
  });

  test("it derives from agreedMarket, with no display copy", () => {
    const active = code(COL);
    const src = active.slice(active.indexOf('className="vcard-agreed"') - 200,
      active.indexOf('className="vcard-agreed"') + 300);
    assert(/tcd\.agreedMarket != null &&/.test(src), "gated on the canonical field");
    assert(/money\(tcd\.agreedMarket\)/.test(src), "and rendered from it directly");
  });

  test("each card carries its own agreed value", () => {
    const w = world(2);
    agreeMarket(w, w.ids[0], 1804);
    agreeMarket(w, w.ids[1], 900);
    eq(w.card(w.ids[0]).agreedMarket, 1804, "one card");
    eq(w.card(w.ids[1]).agreedMarket, 900, "the other, independently");
  });
});

describe("C. One grammar, two units", () => {
  test("the dollar phase speaks dollars", () => {
    const vc = render({ agreedMarket: null, tpMarket: null, valueThread: [] });
    eq(cls(vc, "vp-unit-m").map(txt).join(","), "$", "the field is marked $");
    /* Clearing the draft (which is prefilled from the collector's own note)
       reveals the empty-state label, and it must name the unit. */
    const field = vc.findAllByType("input")
      .find((i) => /dollars/.test(String(i.props["aria-label"] || "")));
    assert(field, "a dollar field");
    TR.act(() => { field.props.onChange({ target: { value: "" } }); });
    const after = cls(R, "vcard")[0];
    assert(labels(after).some((t) => /Enter a dollar amount/.test(t)),
      "its empty state asks for dollars: " + labels(after).join(" | "));
    assert(!labels(after).some((t) => /Enter an amount$/.test(t)),
      "not the old unit-free wording");
  });

  test("the percentage phase speaks percentages", () => {
    const vc = render(SCREENSHOT);
    assert(labels(vc).some((t) => /Enter a percentage/.test(t)),
      "its empty state asks for a percentage");
    assert(!labels(vc).some((t) => /Enter an amount/.test(t)),
      "and never the old unit-free wording");
    /* CONTRACT CHANGE: the percentage phase now offers BOTH units, because a
       trade % and the dollars it represents are one proposal written two ways.
       The percentage field is still marked %, and a dollar field joins it. */
    /* CONTRACT CHANGE: the shared TradeFields editor supplies both units. */
    const marks = cls(vc, "pn-u").map(txt);
    assert(marks.includes("%"), "the percentage field is marked %: " + marks.join(","));
    assert(marks.includes("$"), "and its linked dollar field is marked $");
  });

  test("Accept names the standing dollar proposal", () => {
    const vc = render({ agreedMarket: null, tpMarket: 1804,
      valueThread: [{ by: "tp", type: "propose", amount: 1804, at: AT }] });
    assert(labels(vc).some((t) => /^Accept \$1,804$/.test(t)),
      "the figure is in the button: " + labels(vc).join(" | "));
  });

  test("Accept names the standing percentage proposal", () => {
    const vc = render(SCREENSHOT);
    assert(labels(vc).some((t) => /^Accept 80%$/.test(t)),
      "as a percentage: " + labels(vc).join(" | "));
  });

  test("accepting takes the canonical standing proposal, not the typed draft", () => {
    const w = world();
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.ids[0], by: "tp",
      action: "propose", amount: 1804, at: AT });
    /* An amount argument is ignored by the rule; acceptance means their figure. */
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.ids[0], by: "collector",
      action: "accept", amount: 99, at: AT });
    eq(w.card(w.ids[0]).agreedMarket, 1804, "settled at what was actually proposed");
  });

  test("one presentation component serves both phases", () => {
    eq((code(COL).match(/function Phase\(/g) || []).length, 1,
      "a single shared component, not a parallel model");
    const vc = render(SCREENSHOT);
    eq(cls(vc, "vp").length, 2, "used twice on each card");
  });
});

describe("D. The open question is the only one shaped like a decision", () => {
  test("the settled dollar phase collapses", () => {
    const vc = render(SCREENSHOT);
    eq(cls(vc, "settled").length, 1, "market value is presented as settled");
    /* Its negotiation controls are gone: one Accept remains, for the percentage. */
    eq(labels(vc).filter((t) => /^Accept /.test(t)).length, 1,
      "only the live phase offers acceptance: " + labels(vc).join(" | "));
    assert(labels(vc).some((t) => /^Accept 80%$/.test(t)), "and it is the percentage");
  });

  test("its history survives the collapse", () => {
    const vc = render(SCREENSHOT);
    const hist = labels(vc).filter((t) => /View history/.test(t));
    eq(hist.length, 2, "both phases keep their history: " + hist.join(" | "));
  });

  test("the dollar history really opens and shows the exchange", () => {
    const vc = render(SCREENSHOT);
    const b = vc.findAllByType("button").find((x) => /View history \( 3/.test(txt(x)))
      || vc.findAllByType("button").find((x) => /View history/.test(txt(x)));
    assert(b, "a history control");
    click(b);
    const list = cls(cls(R, "vcard")[0], "vp-hist-l")[0];
    assert(list, "the entries render");
    assert(/Northline Cards|You/.test(txt(list)), "attributed to whoever moved");
  });

  test("percentage stays locked until market is agreed", () => {
    const w = world();
    w.st.actions.tradePercentRespond({ oppId: w.o, tradeCardId: w.ids[0], by: "tp",
      action: "propose", percent: 0.8, at: AT });
    eq(w.card(w.ids[0]).tpPercent, null, "a percentage of an unagreed number means nothing");
    const vc = render({ agreedMarket: null, tpMarket: null, valueThread: [] });
    eq(cls(vc, "locked").length, 1, "and the screen says so rather than offering it");
  });

  test("one card may negotiate percentage while another negotiates market", () => {
    const w = world(2);
    agreeMarket(w, w.ids[0], 1804);
    w.st.actions.tradePercentRespond({ oppId: w.o, tradeCardId: w.ids[0], by: "tp",
      action: "propose", percent: 0.8, at: AT });
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: w.ids[1], by: "tp",
      action: "propose", amount: 900, at: AT });
    eq(w.card(w.ids[0]).tpPercent, 0.8, "the settled card moved to percentage");
    eq(w.card(w.ids[1]).agreedMarket, null, "while the other is still on market value");
  });
});

describe("E. The resulting trade value", () => {
  test("a settled card states all three figures", () => {
    const vc = render({ agreedMarket: 1804, agreedPercent: 0.8,
      percentThread: [{ by: "tp", type: "propose", percent: 0.8, at: AT }] });
    const sum = cls(vc, "vcard-sum")[0];
    assert(sum, "the summary renders");
    const t = txt(sum);
    assert(/Agreed market value .*\$1,804/.test(t), "the market value");
    assert(/Trade percentage .*80%/.test(t), "the percentage");
    assert(/Trade value .*\$1,443/.test(t), "and what it comes to");
  });

  test("the figure comes from the canonical helper", () => {
    eq(D.tradeValueOf({ inclusion: "accepted", agreedMarket: 1804, agreedPercent: 0.8 }),
      1443, "$1,804 x 80% = $1,443");
    const vc = code(COL).slice(code(COL).indexOf("function ValueCard("),
      code(COL).indexOf("function ValueCard(") + 7000);
    assert(/tradeValue\(tcd\)/.test(vc), "the UI calls the helper");
    assert(!/agreedMarket \* |agreedPercent \* /.test(vc), "and re-derives nothing");
  });

  test("each card keeps independent economics", () => {
    const w = world(2);
    agreeMarket(w, w.ids[0], 1804); agreePercent(w, w.ids[0], 0.8);
    agreeMarket(w, w.ids[1], 900); agreePercent(w, w.ids[1], 0.75);
    eq(D.tradeValueOf(w.card(w.ids[0])), 1443, "one card");
    eq(D.tradeValueOf(w.card(w.ids[1])), 675, "the other, at its own percentage");
    eq(D.totalTradeValue(w.get()), 2118, "totalling from the per-card figures");
  });

  test("Deal still consumes the settled terms", () => {
    const w = world();
    agreeMarket(w, w.ids[0], 1804); agreePercent(w, w.ids[0], 0.8);
    eq(w.get().stage, "deal", "the canonical transition still fires");
    eq(D.totalTradeValue(w.get()), 1443, "with the agreed economics carried through");
    eq(D.calculatedBalance(w.get()), 3990 - 1443, "and the balance derived from them");
  });
});

describe("F. Removal, identity, and the lifecycle", () => {
  test("removal uses the canonical withdrawal", () => {
    const src = code(COL).slice(code(COL).indexOf("function ValueCard("),
      code(COL).indexOf("function ValueCard(") + 7000);
    assert(/st\.withdrawTradeCard\(o\.id, tcd\.id\)/.test(src), "the canonical action");
    assert(!/withdrawn:/.test(src), "and no raw patch of the flag");
  });

  test("it is secondary to the negotiation", () => {
    const vc = render(SCREENSHOT);
    const b = vc.findAllByType("button").find((x) => /Remove from trade/.test(txt(x)));
    assert(b, "the control exists");
    const c = String(b.props.className || "");
    assert(!/\bpri\b|\bdeep\b/.test(c), "styled quietly: " + c);
  });

  test("removal preserves history and drops the card from totals", () => {
    const w = world(2);
    agreeMarket(w, w.ids[0], 1804); agreePercent(w, w.ids[0], 0.8);
    agreeMarket(w, w.ids[1], 900); agreePercent(w, w.ids[1], 0.75);
    eq(D.totalTradeValue(w.get()), 2118, "both counted");
    w.st.actions.withdrawTradeCard({ oppId: w.o, tradeCardId: w.ids[0], at: AT });
    eq(D.totalTradeValue(w.get()), 675, "one leaves the totals");
    eq(w.card(w.ids[0]).valueThread.length, 2, "its history is intact");
    eq(w.card(w.ids[0]).agreedMarket, 1804, "and what was agreed is still readable");
  });

  test("removing the last unsettled card still advances canonically", () => {
    const w = world(2);
    agreeMarket(w, w.ids[0], 1804); agreePercent(w, w.ids[0], 0.8);
    eq(w.get().stage, "value-trade", "one card outstanding");
    w.st.actions.withdrawTradeCard({ oppId: w.o, tradeCardId: w.ids[1], at: AT });
    eq(w.get().stage, "deal", "removing it resolves the stage");
  });

  test("rows are addressed by their own id", () => {
    const src = code(COL);
    assert(/marketRespond\(o\.id, tcd\.id,/.test(src), "market by row id");
    assert(/pctRespond\(o\.id, tcd\.id,/.test(src), "percentage by row id");
    assert(!/tcd\.binderId,/.test(src), "never by the binder copy");
    /* And proven, not just read: a binderId addresses nothing. */
    const w = world();
    w.st.actions.tradeMarketRespond({ oppId: w.o, tradeCardId: "b-a", by: "tp",
      action: "propose", amount: 500, at: AT });
    eq(w.card(w.ids[0]).tpMarket, null, "a binderId matches no row");
  });

  test("the Collector writes no canonical business field", () => {
    const active = code(COL);
    const vc = active.slice(active.indexOf("function ValueCard("),
      active.indexOf("function ValueCard(") + 7000);
    ["agreedMarket:", "agreedPercent:", "withdrawn:", "stage:"].forEach((f) =>
      assert(!vc.includes(f), "no direct write of " + f));
  });

  test("the lifecycle is unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
  });
});

require("./run.cjs").run();
