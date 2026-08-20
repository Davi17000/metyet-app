/* ============================================================================
   THE FIRST OFFER IS THE COLLECTOR'S JUDGEMENT

   The offer field used to open at 90% of asking — a hardcoded 0.9 that read as
   a recommendation. MetYet coordinates a negotiation; it does not tell anybody
   what to pay. So the field starts blank and the collector enters it
   deliberately, with nothing seeding it: not the asking price, not a private
   valuation, not a prior negotiation.

   Dollars and percentage are two views of one intended offer, and they use the
   SAME component both seats already use at Agree on Price — so the first offer,
   the collector's counter and the partner's counter are one pricing system
   rather than three that happen to agree.

   The explanation at that moment is about what it commits, and its scope: an
   active deal with this partner FOR THIS GOAL. Not globally, not for all cards,
   and emphatically not the partner's copy — which is only committed later, when
   a price is finalised.
   ========================================================================= */

process.env.METYET_DEV = "1";

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const D = require("../domain/metyet-domain.js");
const { createStore } = require("../domain/metyet-store.js");
const { collectorView } = require("../domain/collector-view.js");
const App = require("../dist/Collector.cjs").default;
const { __store } = require("../dist/Collector.cjs");
const M = require("../dist/MetYet.cjs");

const readSrc = (rel) => require("fs").readFileSync(require("path").join(__dirname, "..", rel), "utf8");
const COL = readSrc("collector/MetYetCollector.jsx");
const TP = readSrc("src/MetYet.jsx");
const txt = (n) => {
  if (!n) return "";
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ").replace(/\s+/g, " ").trim();
};
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));
const AT = "2026-08-19";
const ME = "c12";

const S = () => __store.get().get();
const view = () => collectorView(S(), ME);
const goal = () => view().myGoals().find((g) => /^Review deal/.test(g.note || ""));
const asking = () => view().partnersWith(goal().cardId)[0].ask;

/* Reach the offer sheet the way the collector does: choose a copy on the row,
   then offer from Review Card. */
const openOffer = () => {
  __store.reset(M.buildCanonicalSeed({ review: true, demoStage: "pre-deal-ready" }));
  let r; TR.act(() => { r = TR.create(React.createElement(App)); });
  const c = S().catalog.find((x) => x.id === goal().cardId);
  const card = () => cls(r, "goal").find((n) => txt(n).includes(c.name) && txt(n).includes(c.set));
  click(cls(card(), "gs-row")[0].findAllByType("button")
    .find((b) => /^Review Card$/i.test(txt(b))));
  click(card().findAllByType("button").find((b) => txt(b) === "Make an offer"));
  return r;
};
const dollars = (r) => r.root.findAllByType("input")
  .find((i) => /offer in dollars/.test(String(i.props["aria-label"] || "")));
const percent = (r) => r.root.findAllByType("input")
  .find((i) => /percentage of the asking/.test(String(i.props["aria-label"] || "")));
const cta = (r) => r.root.findAllByType("button").find((b) => txt(b) === "Submit offer");
const type = (f, v) => TR.act(() => f.props.onChange({ target: { value: v } }));

describe("A. The first offer starts blank", () => {
  test("both fields open empty", () => {
    const r = openOffer();
    eq(dollars(r).props.value, "", "no dollar amount");
    eq(percent(r).props.value, "", "and no percentage");
  });

  test("no 90% default, and no 0.9 anywhere in the offer UI", () => {
    const r = openOffer();
    const ask = asking();
    assert(dollars(r).props.value !== String(Math.round(ask * 0.9)),
      "the field is not seeded at 90% of asking");
    /* And the source that produced it is gone. */
    const sheet = COL.slice(COL.indexOf("function MakeOffer(") > -1
      ? COL.indexOf("function MakeOffer(") : COL.indexOf('<Sheet title="Make an offer"') - 3000,
      COL.indexOf('<Sheet title="Make an offer"') + 3000);
    assert(!/ask \* 0\.9|0\.9\)/.test(sheet), "no 0.9 seed remains");
    assert(/const \[amt, setAmt\] = useState\(""\)/.test(sheet), "the state starts empty");
  });

  test("nothing private is used to prefill it", () => {
    /* The state declaration is the only thing that could seed the field. */
    const decl = COL.slice(COL.indexOf('const [amt, setAmt] = useState("")') - 500,
      COL.indexOf('const [amt, setAmt] = useState("")') + 60);
    ["myValue", "privateValue", "valuation", "suggest", "recommend", "0.9"].forEach((w) =>
      assert(!new RegExp(w.replace(".", "\\."), "i").test(decl),
        "no " + w + " seeds the first offer"));
    assert(/useState\(""\)/.test(decl), "it is simply empty");
  });

  test("the CTA is disabled until a real amount exists", () => {
    const r = openOffer();
    eq(cta(r).props.disabled, true, "disabled while blank");
    type(dollars(r), String(Math.round(asking() * 0.9)));
    eq(cta(r).props.disabled, false, "enabled once valid");
    type(dollars(r), "");
    eq(cta(r).props.disabled, true, "and disabled again when cleared");
  });

  test("nothing is created by opening the sheet or typing in it", () => {
    const r = openOffer();
    const before = S().opportunities.length;
    type(dollars(r), "3555");
    eq(S().opportunities.length, before, "typing an offer is not making one");
  });
});

describe("B. Dollars and percentage are one number", () => {
  test("dollars derive the percentage", () => {
    const r = openOffer();
    const ask = asking();                       // 3950 in the demo world
    type(dollars(r), String(Math.round(ask * 0.9)));
    eq(percent(r).props.value, "90", "$3,555 of $3,950 reads as 90%");
  });

  test("percentage derives the dollars", () => {
    const r = openOffer();
    const ask = asking();
    type(percent(r), "90");
    eq(dollars(r).props.value, String(Math.round(ask * 0.9)), "90% of asking, in whole dollars");
  });

  test("clearing either clears the other", () => {
    const r = openOffer();
    type(dollars(r), "3555");
    assert(percent(r).props.value !== "", "the percentage followed");
    type(dollars(r), "");
    eq(percent(r).props.value, "", "clearing dollars clears it");
    type(percent(r), "90");
    assert(dollars(r).props.value !== "", "the dollars followed");
    type(percent(r), "");
    eq(dollars(r).props.value, "", "and clearing the percentage clears them");
  });

  test("the submitted value is whole canonical dollars", () => {
    const r = openOffer();
    const ask = asking();
    type(percent(r), "90");
    click(cta(r));
    const o = D.activeOppForGoal(goal().id, S().opportunities);
    const entry = D.lastEntry(o.priceThread);
    eq(entry.amount, Math.round(ask * 0.9), "converted to dollars before submission");
    eq(typeof entry.amount, "number", "as a number");
    eq(entry.amount, Math.round(entry.amount), "with no cents");
    assert(!/percent/i.test(JSON.stringify(o)), "and no percentage is stored on the opportunity");
  });

  test("the rounding rule is one rule, used by both directions", () => {
    /* percentage -> dollars: nearest whole dollar.
       dollars -> percentage: nearest whole percent. */
    eq(M.amountFromPercentage(94, 3950), 3713, "94% of $3,950 is $3,713");
    eq(M.percentageOf(3700, 3950), 94, "$3,700 of $3,950 reads as 94%");
    eq(M.amountFromPercentage(90, 3950), 3555, "90% is $3,555");
    eq(M.percentageOf(3555, 3950), 90, "and back again");
  });

  test("no second pricing model was introduced", () => {
    /* One component, used by the first offer and by both counters. */
    assert(/CounterFields/.test(COL), "the Collector uses the shared fields");
    assert(/function CounterFields\(/.test(TP), "which are defined once");
    eq((TP.match(/function CounterFields\(/g) || []).length, 1, "exactly once");
    assert(!/const onPct = /.test(COL), "and the Collector re-implements no conversion");
  });
});

describe("C. Missing or zero asking price", () => {
  test("the helpers refuse rather than produce NaN", () => {
    [0, null, undefined, -1, "x"].forEach((ref) => {
      eq(M.percentageOf(3555, ref), null, "percentageOf is null for " + String(ref));
      eq(M.amountFromPercentage(90, ref), null, "amountFromPercentage too");
    });
    assert(!isNaN(M.percentageOf(3555, 0)), "nothing renders as NaN");
  });

  test("the percentage field is withheld when there is nothing to measure against", () => {
    const fields = TP.slice(TP.indexOf("function CounterFields("),
      TP.indexOf("function CounterFields(") + 1400);
    assert(/const usable = showPercent && percentageOf\(1, reference\) != null/.test(fields),
      "the percentage input appears only when the reference is usable");
    assert(/\{usable && \(/.test(fields), "and is otherwise not rendered");
  });

  test("dollar entry keeps working without a reference", () => {
    const fields = TP.slice(TP.indexOf("function CounterFields("),
      TP.indexOf("function CounterFields(") + 1600);
    const dollarBlock = fields.slice(fields.indexOf('<div className="pn-in">'),
      fields.indexOf("{usable &&"));
    assert(/aria-label=\{amtAria\}/.test(dollarBlock), "the dollar field is unconditional");
    assert(!/usable/.test(dollarBlock), "and does not depend on the percentage being usable");
  });
});

describe("D. What submitting commits, and its scope", () => {
  test("the explainer names the partner and scopes it to this goal", () => {
    const r = openOffer();
    const body = txt(r.root);
    assert(/Submitting an offer starts an active deal with .* for this goal/.test(body),
      "it says what the act does");
    assert(/exclusively with them on it until the deal is completed or the negotiation ends/
      .test(body), "and how long it lasts");
  });

  test("it does not imply a global lock or an agreed price", () => {
    const r = openOffer();
    const body = txt(r.root);
    [/all your deals/i, /any card/i, /globally/i, /every goal/i, /all goals/i]
      .forEach((re) => assert(!re.test(body), "no global-lock language: " + re));
    assert(!/price is agreed|agreed price/i.test(body), "and no claim that price is settled");
    assert(!/committed/i.test(body), "nor that the partner has committed the copy");
  });

  test("the procedural explainer is gone", () => {
    assert(!/work through price,\s*then any cards you trade/.test(COL),
      "the step-by-step walkthrough is replaced by the commitment that matters now");
  });

  test("the CTA says what the action establishes", () => {
    const r = openOffer();
    assert(cta(r), "Submit offer");
    assert(r.root.findAllByType("button").some((b) => txt(b) === "Cancel"), "with a way out");
  });

  test("submitting triggers the per-goal exclusion, and nothing more", () => {
    const r = openOffer();
    type(dollars(r), "3555");
    click(cta(r));
    const g = goal();
    const o = D.activeOppForGoal(g.id, S().opportunities);
    assert(o, "an active deal exists for this goal");
    eq(o.stage, "agree-price", "at Agree on Price");
    /* Collector exclusion is per goal. */
    const again = __store.get().actions.startOpportunity({ goalId: g.id, collectorId: ME,
      partnerId: o.partnerId, cardId: g.cardId, invId: o.invId,
      listedPrice: asking(), amount: 3600, at: AT });
    eq(again.refused, D.REFUSE.alreadyNegotiating, "a second offer for it is refused");
    /* And the partner has committed nothing. */
    eq(D.INVARIANTS.copyCommittedTo(o.invId, S().opportunities), null,
      "the copy is not committed merely because an offer exists");
  });

  test("Review Card entry and photo requests still carry no warning", () => {
    const rv = COL.slice(COL.indexOf("function ReviewCard("), COL.indexOf("function GoalCard("));
    assert(!/starts an active deal/.test(rv), "reviewing warns of nothing");
    assert(!/exclusiv/i.test(rv), "and claims no exclusivity");
    const row = COL.slice(COL.indexOf('className="gs-row"'), COL.indexOf('className="gs-row"') + 1400);
    assert(!/exclusiv|active deal/i.test(row), "nor does choosing a copy");
  });
});

describe("E. The partner's counter mirrors it, and commits nothing", () => {
  const CARD = { id: "k1", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
    edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };
  const world = () => createStore({
    catalog: [CARD], collectors: [{ id: "casey", name: "Casey", prefs: [] }],
    partners: [{ id: "nl", name: "Northline Cards" }],
    goals: [], binder: [], interests: [], conversations: [], opportunities: [],
    preferences: [], photoRequests: [], copyReviews: [],
    inventory: [{ invId: "inv-1", partnerId: "nl", cardId: "k1", ask: 3950, archived: false,
      photos: { front: "f", back: "b" } }],
  });
  const opened = (st) => {
    const g = st.actions.addGoal({ collectorId: "casey", cardId: "k1", tier: "primary", at: AT });
    return { g, o: st.actions.startOpportunity({ goalId: g, collectorId: "casey", partnerId: "nl",
      cardId: "k1", invId: "inv-1", listedPrice: 3950, amount: 3555, at: AT }) };
  };

  test("the counter fields are the same component, blank, labelled for this seat", () => {
    const seat = TP.slice(TP.indexOf('<div className="pn-or"><span>or counter</span></div>'),
      TP.indexOf('<div className="pn-or"><span>or counter</span></div>') + 700);
    assert(/<CounterFields/.test(seat), "the shared fields");
    assert(/amtLabel="Your counter"/.test(seat), "named for the partner");
    assert(/pctLabel="% of asking"/.test(seat), "against the same denominator");
    assert(/const \[amt, setAmt\] = useState\(""\)/.test(TP), "and starting blank");
  });

  test("the same conversions apply on both seats", () => {
    eq(M.percentageOf(3700, 3950), 94, "$3,700 reads as 94%");
    eq(M.amountFromPercentage(94, 3950), 3713, "and 94% is $3,713");
  });

  test("countering does not commit the copy", () => {
    const st = world();
    const { o } = opened(st);
    st.actions.patchOpportunity(o, (x) => ({ ...x,
      priceThread: [...x.priceThread, { by: "tp", type: "counter", amount: 3700, at: AT }] }));
    eq(D.INVARIANTS.copyCommittedTo("inv-1", st.get().opportunities), null,
      "a counter is a question, not a promise");
    eq(st.get().opportunities.find((x) => x.id === o).agreedPrice, null, "nothing is settled");
  });

  test("no commitment warning attaches to countering", () => {
    const a = TP.indexOf('<div className="pn-or"><span>or counter</span></div>',
      TP.indexOf("Accept {money(last.amount)}"));
    const seat = TP.slice(a, TP.indexOf("Send counter", a) + 40)
      /* Judge the copy the partner reads, not the comments explaining it. */
      .replace(/\/\*[\s\S]*?\*\//g, "");
    assert(!/commit/i.test(seat), "countering carries no commitment language");
    /* The warning belongs to finalisation, and stays there. */
    assert(/already committed to another deal/.test(TP),
      "the commitment message lives with price agreement");
  });

  test("Accept ignores whatever is typed into the counter fields", () => {
    const a = TP.indexOf("Accept {money(last.amount)}") - 200;
    const seat = TP.slice(a, TP.indexOf("</button>", a));
    assert(/priceRespond\(opp\.id, by, "accept"\)/.test(seat),
      "Accept passes no amount — it takes the standing proposal");
    assert(/Accept \{money\(last\.amount\)\}/.test(seat), "and names that figure");
    assert(!/\bamt\b/.test(seat), "the counter field is not read by Accept");
  });

  test("Counter submits the typed dollars", () => {
    const a = TP.indexOf('priceRespond(opp.id, by, "counter", Number(amt))') - 300;
    const seat = TP.slice(a, TP.indexOf("</button>", a));
    assert(/priceRespond\(opp\.id, by, "counter", Number\(amt\)\)/.test(seat),
      "the typed amount, as a number");
    assert(/disabled=\{!validAmount\(amt\)\}/.test(seat), "and only when valid");
  });

  test("commitment still begins only at price finalisation", () => {
    const st = world();
    const { o } = opened(st);
    st.actions.patchOpportunity(o, (x) => ({ ...x,
      priceThread: [...x.priceThread, { by: "tp", type: "counter", amount: 3700, at: AT }] }));
    eq(D.INVARIANTS.copyCommittedTo("inv-1", st.get().opportunities), null, "not on counter");
    eq(st.actions.agreePrice({ oppId: o, amount: 3700, by: "tp", at: AT }), o, "on agreement");
    assert(D.INVARIANTS.copyCommittedTo("inv-1", st.get().opportunities), "the copy is committed");
  });
});

describe("F. The pricing system is consistent everywhere", () => {
  test("the Collector's own counter uses the same fields", () => {
    const ap = COL.slice(COL.indexOf("function AgreePrice("), COL.indexOf("/* Select Trade"));
    assert(/<CounterFields/.test(ap), "Agree on Price uses them");
    assert(/pctLabel="% of listed price"/.test(ap) || /pctLabel="% of asking"/.test(ap),
      "with a labelled denominator");
  });

  test("the six-step pursuit and receipt models are unchanged", () => {
    eq(D.PURSUIT_STEPS.length, 6, "six pursuit steps");
    eq(D.RECEIPT_STAGES.length, 5, "five negotiation stages");
  });

  test("price history survives a full exchange", () => {
    const st = createStore({
      catalog: [{ id: "k1", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
        edition: "Unlimited", language: "English", grade: "PSA 9", condition: null }],
      collectors: [{ id: "casey", name: "Casey", prefs: [] }],
      partners: [{ id: "nl", name: "Northline Cards" }],
      goals: [], binder: [], interests: [], conversations: [], opportunities: [],
      preferences: [], photoRequests: [], copyReviews: [],
      inventory: [{ invId: "inv-1", partnerId: "nl", cardId: "k1", ask: 3950, archived: false,
        photos: { front: "f", back: "b" } }],
    });
    const g = st.actions.addGoal({ collectorId: "casey", cardId: "k1", tier: "primary", at: AT });
    const o = st.actions.startOpportunity({ goalId: g, collectorId: "casey", partnerId: "nl",
      cardId: "k1", invId: "inv-1", listedPrice: 3950, amount: 3555, at: AT });
    st.actions.patchOpportunity(o, (x) => ({ ...x,
      priceThread: [...x.priceThread, { by: "tp", type: "counter", amount: 3700, at: AT }] }));
    st.actions.agreePrice({ oppId: o, amount: 3700, by: "tp", at: AT });
    const thread = st.get().opportunities.find((x) => x.id === o).priceThread;
    eq(thread.map((e) => e.type).join(","), "offer,counter,accept", "every step is recorded");
    eq(thread.map((e) => e.amount).join(","), "3555,3700,3700", "with its amount");
    eq(st.get().opportunities.find((x) => x.id === o).agreedPrice, 3700, "and the settled price");
  });

  test("competing offers before commitment are still supported", () => {
    const st = createStore({
      catalog: [{ id: "k1", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
        edition: "Unlimited", language: "English", grade: "PSA 9", condition: null }],
      collectors: [{ id: "casey", name: "Casey", prefs: [] }, { id: "jordan", name: "Jordan", prefs: [] }],
      partners: [{ id: "nl", name: "Northline Cards" }],
      goals: [], binder: [], interests: [], conversations: [], opportunities: [],
      preferences: [], photoRequests: [], copyReviews: [],
      inventory: [{ invId: "inv-1", partnerId: "nl", cardId: "k1", ask: 3950, archived: false,
        photos: { front: "f", back: "b" } }],
    });
    const mk = (who, amt) => st.actions.startOpportunity({
      goalId: st.actions.addGoal({ collectorId: who, cardId: "k1", tier: "primary", at: AT }),
      collectorId: who, partnerId: "nl", cardId: "k1", invId: "inv-1",
      listedPrice: 3950, amount: amt, at: AT });
    assert(typeof mk("casey", 3555) === "string" && typeof mk("jordan", 3600) === "string",
      "two collectors may both have offers on one copy");
    eq(D.INVARIANTS.copyCommittedTo("inv-1", st.get().opportunities), null,
      "until one of them is settled");
  });
});

require("./run.cjs").run();
