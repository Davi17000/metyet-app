/* ============================================================================
   NOTHING TO AGREE TO YET — AND WHAT EXACTLY WE AGREED

   Two rules, both about the difference between a figure that has been OFFERED
   and one that has been AGREED.

   The first: while a cash proposal sits unanswered, the economics are not
   mutually settled, so there is no deal to agree to. That guard has to live in
   the domain, not in what the UI happens to render — the old version was
   reachable by any caller, which means it was not a rule, only a habit.

   The second: the receipt answers "what did we agree to", and it used to vanish
   the moment a deal reached Handoff. That is precisely when somebody is about
   to hand over cards and a stack of cash, and the one moment the derivation
   matters most. Handoff answers "how are we completing it" — a different
   question, and it belongs in its own card.
   ========================================================================= */

process.env.METYET_DEV = "1";

global.window = global.window || {};
window.matchMedia = (q) => ({ matches: /max-width:\s*560px/.test(q),
  addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {} });

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");
const SCEN = require("../harness/review-scenario.cjs");
const App = require("../dist/Collector.cjs").default;
const { __store } = require("../dist/Collector.cjs");

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const STORE = fs.readFileSync(path.join(ROOT, "domain", "metyet-commands.js"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const AT = "2026-08-24";

const txt = (n) => {
  if (!n) return "";
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ").replace(/\s+/g, " ").trim();
};
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));

/* A frozen deal at a checkpoint, driven only by canonical actions. */
const at = (cp) => SCEN.buildTo(cp);
const oppOf = (f) => f.store.get().opportunities.find((x) => x.id === f.oppId);

let R = null;
const render = (state) => {
  __store.reset(state);
  TR.act(() => { R = TR.create(React.createElement(App)); });
  const b = R.root.findAllByType("button").find((x) => /^Deal Flow/.test(txt(x)));
  if (b) click(b);
  return R;
};
const open = (cp) => render(at(cp).store.get());
const agreeButtons = () => R.root.findAllByType("button")
  .filter((b) => /^Agree/.test(txt(b)));
const live = () => __store.get().get().opportunities
  .find((x) => D.isActive(x) && x.deal);

describe("A. No final agreement while cash is unresolved", () => {
  test("the rule lives in the action, not in what the UI draws", () => {
    /* PHASE 1: final agreement belongs to the CURRENT economic state (contract
       §4, Invariants 19–20). The command enforces the order and the state: a
       new figure clears confirmations, and the collector's agreement waits for
       the partner's confirmation of that figure. */
    const cmds = code(STORE);
    const accept = cmds.slice(cmds.indexOf("acceptDeal(state, a"), cmds.indexOf("proposeFulfillment(state, a"));
    assert(/if \(!d\.tpAgreed\) return refuse\(R\.notYourTurn\)/.test(accept), "the action decides");
    const propose = cmds.slice(cmds.indexOf("proposeFinalBalance(state, a"), cmds.indexOf("acceptDeal(state, a"));
    assert(/tpAgreed: false, collectorAgreed: false/.test(propose), "and a new figure clears agreement");
  });

  test("a standing collector proposal blocks agreement", () => {
    const f = at("cash-standing");
    const o = oppOf(f);
    eq(o.deal.collectorAdj, 2800, "a figure is on the table");
    assert(o.deal.agreedAdj == null, "and nobody has agreed it");
    f.store.actions.dealAgree({ oppId: f.oppId, by: "collector", at: AT });
    assert(!oppOf(f).deal.collectorAgreed, "so agreeing does nothing");
    eq(oppOf(f).stage, "deal", "and the stage holds");
  });

  test("a standing partner counter blocks it too", () => {
    const f = at("cash-standing");
    f.store.actions.dealAdjustRespond({ oppId: f.oppId, by: "tp",
      action: "propose", amount: 2600, at: AT });
    f.store.actions.dealAgree({ oppId: f.oppId, by: "collector", at: AT });
    assert(!oppOf(f).deal.collectorAgreed,
      "their counter is just as unresolved as yours");
  });

  test("acceptance restores eligibility", () => {
    /* PHASE 1: the partner accepting the standing figure IS the partner's
       confirmation of that economic state; the collector's agreement then
       settles it. There is no separate acceptance step. */
    const f = at("cash-standing");
    f.store.actions.dealAdjustRespond({ oppId: f.oppId, by: "tp",
      action: "accept", at: AT });
    assert(oppOf(f).deal.tpAgreed, "the partner confirmed the figure on the table");
    f.store.actions.dealAgree({ oppId: f.oppId, by: "collector", at: AT });
    assert(oppOf(f).deal.collectorAgreed, "and agreement is available again");
    eq(oppOf(f).deal.agreedAdj, 2800, "the figure both confirmed is the agreed one");
  });

  test("a resolved deal still progresses when both agree", () => {
    /* cash-agreed: the partner has confirmed; the collector's confirmation completes it. */
    const f = at("cash-agreed");
    f.store.actions.dealAgree({ oppId: f.oppId, by: "collector", at: AT });
    eq(oppOf(f).stage, "fulfillment", "the lifecycle is unchanged");
  });

  test("agreeing twice changes nothing", () => {
    const f = at("cash-agreed");
    f.store.actions.dealAgree({ oppId: f.oppId, by: "collector", at: AT });
    const once = JSON.stringify(oppOf(f).deal);
    f.store.actions.dealAgree({ oppId: f.oppId, by: "collector", at: AT });
    eq(JSON.stringify(oppOf(f).deal), once, "idempotent");
  });

  test("an unsubmitted draft does not touch canonical state", () => {
    open("value-complete");
    const before = JSON.stringify(live().deal);
    const slider = cls(R, "cs-r")[0];
    if (slider) TR.act(() => { slider.props.onChange({ target: { value: "-500" } }); });
    eq(JSON.stringify(live().deal), before, "dragging proposes nothing");
  });

  test("no agree control is offered while a proposal stands", () => {
    open("cash-standing");
    eq(agreeButtons().length, 0,
      "hidden rather than disabled: " + agreeButtons().map(txt).join(" | "));
    assert(cls(R, "cp-wait")[0], "the waiting state is what shows instead");
  });

  test("it returns once the cash is agreed", () => {
    open("cash-agreed");
    assert(agreeButtons().length >= 1,
      "the collector can commit again: " + agreeButtons().map(txt).join(" | "));
  });

  test("no local flag was introduced", () => {
    const d = code(COL);
    ["waitingForTp", "proposalSent", "cashAccepted"].forEach((f) =>
      assert(!d.includes(f), "no " + f));
    assert(/const cashUnresolved = !cashSettled && !!standing0;/.test(d),
      "the UI derives it from the same canonical facts");
  });
});

describe("B. The receipt says what was agreed", () => {
  /* `.card` also matches goal tiles, so scope to the receipt's own section. */
  const receiptText = () => cls(R, "sec").map(txt)
    .filter((t) => /What this deal comes to/.test(t))
    .sort((a, b) => a.length - b.length)[0] || "";

  test("it renders the agreed price and every trade card", () => {
    open("cash-agreed");
    const t = receiptText();
    const o = live();
    assert(t.includes(String(o.agreedPrice).replace(/\B(?=(\d{3})+(?!\d))/g, ",")),
      "the agreed price: " + t.slice(0, 90));
    D.acceptedTradeCards(o).forEach((c) => {
      const nm = __store.get().get().catalog.find((x) => x.id === c.cardId).name;
      assert(t.includes(nm), nm + " appears");
    });
  });

  test("each card shows market value, percentage and credited value", () => {
    open("cash-agreed");
    const t = receiptText();
    assert(/Agreed market value/.test(t), "market value");
    assert(/Agreed Trade %/.test(t), "percentage");
    assert(/Trade value/.test(t), "and what it credited");
    /* And those figures are the canonical ones. */
    const c = D.acceptedTradeCards(live())[0];
    assert(t.includes(String(c.agreedMarket)), "the agreed market value itself");
    eq(D.tradeValueOf(c), Math.round(c.agreedMarket * c.agreedPercent),
      "credited by the shared helper");
  });

  test("the total equals the canonical calculation", () => {
    open("cash-agreed");
    eq(D.totalTradeValue(live()), 1173, "$723 + $450");
    assert(/Total trade value/.test(receiptText()), "and is shown");
  });

  test("calculated cash uses canonical payer language", () => {
    open("cash-agreed");
    const t = receiptText();
    assert(/Calculated cash balance/.test(t), "labelled");
    assert(/You pay Northline Cards|Northline Cards pays you|No cash owed/.test(t),
      "and said in words: " + t.slice(-140));
    assert(!/-\$|\$-/.test(t), "with no unexplained signed currency");
  });

  test("a negotiated difference is shown, and nothing when there is none", () => {
    /* PHASE 1: the figure is agreed only once both have confirmed it. */
    open("handoff-open");
    const r = D.cashReceipt(live());
    eq(r.adjustment, 73, "the agreed figure differs from calculated");
    assert(/Final cash adjustment|Additional discount/.test(receiptText()),
      "so the change is stated");
    const d = code(COL);
    assert(/receipt\.adjustment !== 0 &&/.test(d),
      "and an unchanged figure shows no row");
  });

  test("the final settlement is the strongest line", () => {
    open("handoff-open");
    const t = receiptText();
    assert(/Cash settlement/.test(t), "headed");
    assert(cls(R, "dl-final")[0], "and given the total treatment");
  });

  test("a standing proposal is never presented as the final settlement", () => {
    open("cash-standing");
    const o = live();
    eq(D.finalBalance(o), D.calculatedBalance(o),
      "an unanswered proposal has not moved the balance");
    /* The receipt shows two labelled states while a proposal stands, so the
       settled figure can never be read as the offered one. */
    const t = cls(R, "sec").map(txt).filter((x) => /Where the cash stands/.test(x))
      .sort((a, b) => a.length - b.length)[0] || "";
    assert(/Current — agreed so far/.test(t), "current is labelled: " + t.slice(0, 120));
    assert(/not agreed yet/.test(t), "and the proposal is marked unsettled");
  });

  test("both payer directions render", () => {
    [[1000, 275, "collector-to-tp"], [700, 1000, "tp-to-collector"],
      [1000, 1000, "settled"]].forEach(([price, market, dir]) => {
      const o = { agreedPrice: price,
        trade: { cards: [{ inclusion: "accepted", agreedMarket: market,
          agreedPercent: 1 }] }, deal: {} };
      eq(D.cashReceipt(o).final.direction, dir, price + "/" + market);
    });
    eq(D.settlement(0, { viewer: "collector", partner: "NL" }).sentence,
      "No cash owed", "and zero says so");
  });
});

describe("C. Receipt and logistics stay separate through Handoff", () => {
  const cards = () => cls(R, "sec").map(txt);
  /* The smallest section containing a marker is that section itself, rather
     than an ancestor that happens to contain it. */
  const sectionWith = (re) => cards().filter((t) => re.test(t))
    .sort((a, b) => a.length - b.length)[0];

  test("the receipt survives into Handoff", () => {
    open("handoff-open");
    const t = sectionWith(/What this deal comes to/);
    assert(t, "the economic receipt is still there: " + cards().length + " sections");
    assert(/Total trade value/.test(t), "with its derivation intact");
    assert(/Cash settlement/.test(t), "and its conclusion");
  });

  test("logistics remain their own card", () => {
    open("handoff-open");
    const h = sectionWith(/Handoff/);
    assert(h, "the logistics card renders separately");
    const r = sectionWith(/What this deal comes to/);
    assert(r, "and the receipt renders");
    assert(!h.includes("What this deal comes to"),
      "logistics does not contain the receipt");
    assert(!r.includes("Handoff"), "and the receipt does not contain logistics");
  });

  test("the receipt comes before the logistics", () => {
    const f = code(COL).slice(code(COL).indexOf("function Fulfillment("));
    const rec = f.indexOf("<DealReceipt");
    const card = f.indexOf('<div className="sec-h">Handoff</div>');
    assert(rec > 0 && card > 0, "both render");
    assert(rec < card, "what was agreed, then how it happens");
  });

  test("Handoff cash is the final agreed figure", () => {
    open("handoff-open");
    const o = live();
    eq(o.deal.agreedAdj, 2800, "agreed");
    eq(D.finalBalance(o), 2800, "and that is the balance");
    const h = sectionWith(/Handoff/);
    assert(/2,800/.test(h), "shown in the logistics card: " + h.slice(0, 160));
  });

  test("one receipt component serves both stages", () => {
    const d = code(COL);
    eq((d.match(/function DealReceipt\(/g) || []).length, 1, "one definition");
    eq((d.match(/<DealReceipt /g) || []).length, 2, "rendered by both stages");
    const rec = d.slice(d.indexOf("function DealReceipt("),
      d.indexOf("function DealStage("));
    assert(/D\.cashReceipt\(o\)/.test(rec), "deriving its own canonical figures");
    assert(/calcBalance\(o\)/.test(rec), "so it cannot drift from its host");
  });

  test("negotiation history is not duplicated into the receipt", () => {
    const d = code(COL);
    const rec = d.slice(d.indexOf("function DealReceipt("),
      d.indexOf("function DealStage("));
    assert(!/dealTimeline|mdl-e|sendMessage/.test(rec),
      "the receipt is a conclusion, not a history");
  });

  test("the lifecycle and economics are unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment",
      "six, in order");
    eq(D.tradeValueOf({ inclusion: "accepted", agreedMarket: 850,
      agreedPercent: 0.85 }), 723, "the formula holds");
  });
});

require("./run.cjs").run();
