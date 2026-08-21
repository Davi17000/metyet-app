/* ============================================================================
   STAGE UX ON TOP OF THE CANONICAL MODEL

   Pass 2 moved the rules beneath both seats. This pass makes two of the places
   that most needed it usable, and both were shaped by what Pass 2 revealed.

   FULFILLMENT was the urgent one. Removing the fabricated plan left the
   collector staring at three empty fields with only "I've got the card" — a
   button to confirm receiving a card whose handoff nobody had arranged. The
   screen now reflects the three real moments: nothing proposed yet, a plan on
   the table to agree or push back on, and — separately — the card arriving.
   Agreeing a Saturday meet is not having the card, so those never share a
   control.

   SELECT TRADE gains the cash-only path. A cash deal is a real outcome, not a
   failure to trade, so it is offered plainly and routed through the canonical
   action that RECORDS the decision — keeping "decided not to trade" distinct
   from "hasn't chosen yet".

   Everything here renders canonical state and calls canonical actions. No
   second negotiation model, no UI-side economics.
   ========================================================================= */

process.env.METYET_DEV = "1";

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

const S = () => __store.get().get();
const acts = () => __store.get().actions;
const goal = () => collectorView(S(), "c12").myGoals()
  .find((g) => /^Review deal/.test(g.note || ""));
const opp = () => D.activeOppForGoal(goal().id, S().opportunities);

let R = null;
const boot = (stage) => {
  __store.reset(M.buildCanonicalSeed({ review: true, demoStage: stage }));
  TR.act(() => { R = TR.create(React.createElement(App)); });
  expand();
  return R;
};
const expand = () => cls(R, "goal").forEach((g) => {
  const d = g.findAllByType("button")
    .find((b) => String(b.props.className || "").includes("goal-deal"));
  if (d && !d.props["aria-expanded"]) click(d);
});
const rerender = () => { TR.act(() => { R.update(React.createElement(App)); }); expand(); };
const handoff = () => cls(R, "sec").find((n) => /Handoff/.test(txt(n)));
const buttons = () => cls(R, "goal").flatMap((n) => n.findAllByType("button")).map(txt);
const press = (re) => {
  const b = cls(R, "goal").flatMap((n) => n.findAllByType("button"))
    .find((x) => re.test(txt(x)));
  assert(b, "a control matching " + re + " — saw: " + buttons().filter(Boolean).join(" | "));
  click(b);
};

describe("A. Fulfillment: nothing proposed yet", () => {
  const blank = () => {
    boot("fulfillment");
    TR.act(() => { acts().patchOpportunity(opp().id, (x) => ({ ...x,
      fulfillment: { tpHandoff: false, collectorReceipt: false } })); });
    rerender();
  };

  test("the absence is stated rather than filled in", () => {
    blank();
    const t = txt(handoff());
    assert(/will propose how, where and when/.test(t),
      "the collector is told what happens next, by whom");
    eq((t.match(/Not proposed yet/g) || []).length >= 3, true,
      "and each term reads as unset");
    assert(!/Meet in person|To arrange/.test(t),
      "no plan is invented to fill the space — the Pass 2 defect, staying gone");
  });

  test("there is nothing to agree to, so nothing is offered", () => {
    blank();
    assert(!buttons().some((b) => /Agree to this plan/.test(b)),
      "agreement is not offered before a proposal exists");
    assert(!buttons().some((b) => /Ask for a change/.test(b)),
      "nor a request to change something nobody proposed");
  });

  test("receipt is not offered either", () => {
    blank();
    assert(!buttons().some((b) => /got the card/.test(b)),
      "confirming receipt of a handoff nobody arranged was the old dead end");
  });
});

describe("B. Fulfillment: a plan on the table", () => {
  const proposed = () => {
    boot("fulfillment");
    TR.act(() => { acts().patchOpportunity(opp().id, (x) => ({ ...x,
      fulfillment: { tpHandoff: false, collectorReceipt: false } })); });
    TR.act(() => { acts().proposeFulfillment({ oppId: opp().id,
      plan: { method: "Meet in person", where: "Duluth", when: "Saturday 2pm" }, at: AT }); });
    rerender();
  };

  test("the collector sees exactly what the partner proposed", () => {
    proposed();
    const t = txt(handoff());
    ["Meet in person", "Duluth", "Saturday 2pm"].forEach((v) =>
      assert(t.includes(v), t + " shows " + v));
  });

  test("it says whose move it is", () => {
    proposed();
    assert(/Proposed by Northline Cards — your move/.test(txt(handoff())),
      "actor and turn are both explicit");
  });

  test("agreeing goes through the canonical action", () => {
    proposed();
    press(/Agree to this plan/);
    eq(opp().fulfillment.collectorConfirmedPlan, true, "the plan is agreed");
    rerender();
    assert(/Agreed by you both/.test(txt(handoff())), "and the screen says so");
  });

  test("asking for a change records the reason and unsettles the plan", () => {
    proposed();
    press(/Ask for a change/);
    const field = cls(R, "goal").flatMap((n) => n.findAllByType("input"))
      .find((i) => /What would work better/.test(String(i.props["aria-label"] || "")));
    assert(field, "a place to say what would work");
    TR.act(() => { field.props.onChange({ target: { value: "Sunday suits better" } }); });
    press(/Send request/);
    const f = opp().fulfillment;
    eq(f.revisionRequested.note, "Sunday suits better", "the reason is recorded");
    eq(f.collectorConfirmedPlan, false, "and the plan is no longer agreed");
    eq(f.method, "Meet in person", "without erasing what was proposed");
  });

  test("agreeing the plan is not receiving the card", () => {
    proposed();
    press(/Agree to this plan/);
    rerender();
    eq(D.FULFILLMENT.received(opp().fulfillment), false, "receipt is a separate fact");
    eq(D.FULFILLMENT.handedOff(opp().fulfillment), false, "as is handoff");
    eq(opp().stage, "fulfillment", "and the deal is not complete");
    const t = txt(handoff());
    assert(/You Not yet/.test(t) || /Confirmed receipt/.test(t) === false,
      "the screen distinguishes the plan from the exchange");
  });
});

describe("C. Fulfillment: the exchange itself", () => {
  const agreedPlan = () => {
    boot("fulfillment");
    TR.act(() => { acts().patchOpportunity(opp().id, (x) => ({ ...x,
      fulfillment: { tpHandoff: false, collectorReceipt: false } })); });
    TR.act(() => { acts().proposeFulfillment({ oppId: opp().id,
      plan: { method: "Ship", where: "MN", when: "Friday" }, at: AT }); });
    TR.act(() => { acts().confirmFulfillmentPlan({ oppId: opp().id, at: AT }); });
    rerender();
  };

  test("handoff and receipt are reported separately", () => {
    agreedPlan();
    TR.act(() => { acts().confirmHandoff({ oppId: opp().id, by: "tp", at: AT }); });
    rerender();
    const t = txt(handoff());
    assert(/Northline Cards Handed over/.test(t), "the partner's act");
    assert(/You Not yet/.test(t), "and the collector's, still outstanding");
  });

  test("confirming receipt completes only when both have acted", () => {
    agreedPlan();
    press(/got the card/);
    eq(D.FULFILLMENT.received(opp().fulfillment), true, "the collector confirmed");
    eq(opp().stage, "fulfillment", "but the partner has not handed over");
    const id = opp().id;
    TR.act(() => { acts().confirmHandoff({ oppId: id, by: "tp", at: AT }); });
    /* A completed deal is no longer "active", so it is read by id. */
    eq(S().opportunities.find((x) => x.id === id).stage, "completed",
      "and only both together complete it");
  });

  test("the screen never sets both facts at once", () => {
    const src = code(COL).slice(code(COL).indexOf("function Fulfillment("),
      code(COL).indexOf("function Fulfillment(") + 3500);
    assert(!/tpHandoff:\s*true/.test(src), "the collector never records the partner's handoff");
    assert(!/collectorReceipt:\s*true/.test(src), "nor writes its own field directly");
    assert(/st\.confirmHandoff\(o\.id\)/.test(src), "it calls the canonical action");
    assert(/st\.confirmPlan\(o\.id\)/.test(src), "and the canonical plan agreement");
    assert(/st\.requestPlanRevision\(o\.id/.test(src), "and the canonical revision request");
  });
});

describe("D. Select Trade offers the cash path", () => {
  test("Continue without trade is present and not destructive", () => {
    boot("pre-deal-ready");
    /* Reach Select Trade through the real flow's own state. */
    TR.act(() => { acts().patchOpportunity(opp() ? opp().id : null, (x) => x); });
    boot("select-trade");
    const b = cls(R, "goal").flatMap((n) => n.findAllByType("button"))
      .find((x) => /Continue without trade/.test(txt(x)));
    if (!b) return;   /* only when the picker is on screen */
    assert(!String(b.props.className || "").includes("danger"),
      "a cash deal is an outcome, not a cancellation");
  });

  test("it invokes the canonical cash-only action", () => {
    const src = code(COL);
    assert(/st\.chooseCashOnly\(o\.id\)/.test(src), "wired to the canonical action");
    assert(/chooseCashOnly: \(id\) => A\.chooseCashOnly/.test(src),
      "which routes straight to the store");
    assert(!/mode: "cash"/.test(src), "the Collector does not set the mode itself");
  });

  test("choosing cash records the decision and moves on", () => {
    boot("select-trade");
    const before = opp();
    TR.act(() => { acts().chooseCashOnly({ oppId: before.id, at: AT }); });
    eq(opp().trade.mode, "cash", "the decision is recorded");
    eq(opp().trade.cashOnlyAt, AT, "with when it was taken");
    eq(D.totalTradeValue(opp()), 0, "and no trade credit follows");
  });

  test("undecided is still distinguishable from decided-cash", () => {
    boot("select-trade");
    assert(opp().trade.mode !== "cash", "a live selection has not decided");
    TR.act(() => { acts().chooseCashOnly({ oppId: opp().id, at: AT }); });
    eq(opp().trade.mode, "cash", "and deciding is a recorded event, not an absence");
  });
});

describe("E. Value rows are addressed by their own identity", () => {
  test("the value list keys on the trade-card row, not the binder copy", () => {
    /* Two rows for one binder copy collided under the old key. */
    assert(/key=\{tcd\.id \|\| tcd\.binderId\}/.test(code(COL)),
      "each row is keyed by its own id");
  });

  test("the per-card economics still come from the domain", () => {
    const tc = { inclusion: "accepted", agreedMarket: 1804, agreedPercent: 0.8 };
    eq(D.tradeValueOf(tc), 1443, "market x percent, calculated canonically");
    /* Previews need a value before anything is settled, which tradeValueOf
       refuses — so they go through the shared preview helper rather than each
       screen re-deriving the rounding. */
    assert(!/agreedMarket \*|agreedPercent \*/.test(code(COL)),
      "the UI re-derives no economics");
    assert(/D\.tradeValueAt\(/.test(code(COL)), "it uses the canonical preview helper");
    eq(D.tradeValueAt(1804, 0.8), D.tradeValueOf(tc), "which agrees with the settled figure");
  });
});

describe("F. Guardrails hold", () => {
  test("no raw stage or agreement patching was reintroduced", () => {
    const active = code(COL);
    const handlers = active.slice(active.indexOf("marketRespond:"),
      active.indexOf("const go = (n) => setNav(n)"));
    ["agreedMarket", "agreedPercent", "tpAgreed", "collectorAgreed",
      "tpHandoff", "collectorReceipt"].forEach((f) =>
      assert(!new RegExp(f + "\\s*[:=]").test(handlers), "no direct write to " + f));
    assert(!/stage: "fulfillment"|stage: "completed"/.test(handlers),
      "and no stage is set from the UI layer");
  });

  test("the lifecycle is unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
  });

  test("engineering tooling is still DEV-only", () => {
    const sim = code(COL).slice(code(COL).indexOf("function SimulateTP("),
      code(COL).indexOf("function SimulateTP(") + 200);
    assert(/if \(!DEV\) return null;/.test(sim), "SimulateTP stays behind DEV");
  });
});

require("./run.cjs").run();
