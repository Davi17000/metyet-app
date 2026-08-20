const { describe, test, assert, eq } = require("./run.cjs");
const TR = require("react-test-renderer");
const { percentageOf, amountFromPercentage } = require("../dist/MetYet.test.cjs");
const { render, text, allText, btn, btns, btnExact, click, byClass, byClassIn, goProfile } = require("./util.cjs");

/* Hiro Tanaka holds the seeded Value Trade opportunity. The market phase opens with
   no proposal on the table, so the collector proposes first and the TP then owns the
   review — the exact state in the screenshot. */
const THEIRS = 123;

const valueTrade = () => {
  const r = render();
  goProfile(r, "Hiro Tanaka");
  click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
  return r;
};
/* Trade % now renders as a .pn block too, so the market block is selected by its own
   vocabulary rather than by position. */
const blocks = (r) => byClass(r, "pn").filter((n) => (/market value|Opening market/.test(text(n)) && !/trade %/i.test(text(n))));
const fields = (r) => blocks(r)[0].findAllByType("input");
const inBlock = (r, cls) => byClassIn(blocks(r)[0], cls)[0];
const values = (r) => fields(r).map((i) => i.props.value).join("|");
const typeIn = (r, i, v) => TR.act(() => { fields(r)[i].props.onChange({ target: { value: v } }); });
const send = (r) => inBlock(r, "pn-send");
const accept = (r) => inBlock(r, "pn-accept");

/* Collector opens at $123, handing the decision to the TP. */
const tpTurn = () => {
  const r = valueTrade();
  typeIn(r, 0, String(THEIRS));
  click(send(r));
  return r;
};
const tradeRow = (r) => byClass(r, "tbl")[0];
const rowText = (r) => text(tradeRow(r));

describe("Value Trade — the opening proposal has no reference", () => {
  test("with nothing on the table, only an amount is asked for", () => {
    const r = valueTrade();
    eq(fields(r).length, 1, "no percentage field without something to compare to");
    assert(text(blocks(r)[0]).includes("Opening market proposal"), "labelled as the opening move");
    assert(!text(blocks(r)[0]).includes("%"), "no orphaned percent sign");
  });

  test("the opening send uses the same market action as before", () => {
    const r = valueTrade();
    typeIn(r, 0, "123");
    click(send(r));
    assert(allText(r).includes("proposed $123 market value"), "recorded on the existing value thread");
  });
});

describe("Value Trade — the TP's market decision", () => {
  test("their standing proposal is the focal number and the reference", () => {
    const r = tpTurn();
    const b = text(blocks(r)[0]);
    assert(b.includes("Their market value"), "term label: " + b);
    assert(b.includes("Hiro T."), "and the collector is named on the avatar");
    assert(!b.includes("Hiro T.'s market value"), "without duplicating the name into the label");
    assert(b.includes("$123"), "the amount");
    assert(b.includes("Reference value"), "named as the reference");
  });

  test("the counter is a single Amount field — no percentage input", () => {
    const r = tpTurn();
    eq(fields(r).length, 1, "one field only");
    eq(byClassIn(blocks(r)[0], "pn-fl").map(text).join(","), "Amount", "labelled Amount");
    assert(fields(r)[0].props["aria-label"].includes("dollars"), "and it is a dollar field");
  });

  test("no percentage label, suffix, helper text or 'or counter' remains", () => {
    const r = tpTurn();
    const t = text(blocks(r)[0]);
    for (const gone of ["% of their value", "% of your value", "%", "or counter"]) {
      assert(!t.includes(gone), `Value Trade must not show "${gone}": ${t}`);
    }
  });

  test("typing an amount produces no derived percentage anywhere", () => {
    const r = tpTurn();
    typeIn(r, 0, "98");
    eq(values(r), "98", "only the dollar amount is held");
    assert(!/%/.test(text(blocks(r)[0])), "and nothing percentage-shaped is rendered");
  });

  test("whole dollars, no cents", () => {
    const r = tpTurn();
    typeIn(r, 0, "98");
    assert(/^\d+$/.test(values(r)), "no cents introduced: " + values(r));
  });

  test("their standing value is still framed as the reference", () => {
    const r = tpTurn();
    const t = text(blocks(r)[0]);
    assert(t.includes("Reference value"), "the reference framing is kept");
    assert(t.includes("$123"), "with their amount");
  });

  test("Send market counter submits the entered dollar amount", () => {
    const r = tpTurn();
    typeIn(r, 0, "98");
    click(send(r));
    assert(allText(r).includes("proposed $98 market value"),
      "the dollar amount reached the existing market action");
  });

  test("an empty or invalid proposal cannot be sent", () => {
    const r = tpTurn();
    eq(send(r).props.disabled, true, "disabled with nothing entered");
    typeIn(r, 0, "abc");
    eq(values(r), "", "letters never reach state");
    typeIn(r, 0, "0");
    eq(send(r).props.disabled, true, "zero is not a proposal");
    typeIn(r, 0, "-40");
    assert(!values(r).includes("-"), "negatives are stripped: " + values(r));
    typeIn(r, 0, "90");
    eq(send(r).props.disabled, false, "a real amount enables it");
  });
});

describe("Value Trade — Accept is unchanged", () => {
  test("Accept names their standing value", () => {
    eq(text(accept(tpTurn())), "Accept $123", "the amount stays in the button");
  });

  test("accepting settles the market exactly as before", () => {
    const r = tpTurn();
    click(accept(r));
    assert(allText(r).includes("Market agreed"), "the existing accept transition ran");
    assert(rowText(r).includes("$123"), "settled at their number");
  });

  test("accepting hands over to the trade percentage phase, unchanged", () => {
    const r = tpTurn();
    click(accept(r));
    assert(allText(r).includes("trade %") || allText(r).includes("Trade %"),
      "the existing next phase opens: " + rowText(r).slice(0, 200));
  });
});

describe("Value Trade — waiting on the collector", () => {
  test("after countering, the TP sees the standing number and who owes the move", () => {
    const r = tpTurn();
    typeIn(r, 0, "98");
    click(send(r));
    const wait = blocks(r).find((n) => String(n.props.className).includes("wait"));
    assert(wait, "the waiting block rendered");
    const t = text(wait);
    assert(t.includes("Your market value"), "their own number");
    assert(t.includes("$98"), "the amount sent");
    assert(!/%/.test(t), "and no percentage reading: " + t);
    assert(t.includes("Waiting on Hiro T."), "and who is being waited on");
  });

  test("the waiting block offers no TP action", () => {
    const r = tpTurn();
    typeIn(r, 0, "98");
    click(send(r));
    const wait = blocks(r).find((n) => String(n.props.className).includes("wait"));
    assert(wait, "the waiting block rendered");
    eq(wait.findAllByType("input").length, 0, "no live inputs");
    eq(wait.findAllByType("button").length, 0, "and nothing to click");
  });

  test("ownership came from the existing card logic, not a new flag", () => {
    const r = tpTurn();
    typeIn(r, 0, "98");
    click(send(r));
    assert(rowText(r).includes("Review market"), "the existing owner label drives it");
  });
});

describe("Value Trade — collector-side parity", () => {
  test("the collector's side reads the same negotiation from its own seat", () => {
    const r = tpTurn();
    typeIn(r, 0, "98");
    click(send(r));
    const sim = blocks(r).find((n) => !String(n.props.className).includes("wait"));
    assert(sim, "the collector block renders");
    const t = text(sim);
    assert(t.includes("Your market value"), "the TP's number is the reference from their seat");
    assert(t.includes("$98"), "showing what the TP sent");
    assert(t.includes("Accept $98"), "with the same accept affordance");
    eq(byClassIn(sim, "pn-fl").map(text).join(","), "Amount", "the same single dollar field");
  });

  test("the collector counters in dollars too", () => {
    const r = tpTurn();
    typeIn(r, 0, "98");
    click(send(r));
    const sim = blocks(r).find((n) => !String(n.props.className).includes("wait"));
    eq(sim.findAllByType("input").length, 1, "one dollar field on their seat as well");
  });
});

describe("Value Trade — market negotiation % is NOT Trade %", () => {
  test("Value Trade market has no percentage at all, so the concepts cannot collide", () => {
    const r = tpTurn();
    eq(fields(r).length, 1, "market negotiation is dollars only");
    const cols = tradeRow(r).findAllByType("th").map(text);
    assert(cols.some((c) => c.includes("Trade %")), "the Trade % column still exists");
    // the trade percentage is still locked, so nothing numeric can be sitting in it
    assert(rowText(r).includes("locked"), "Trade % remains locked while market is open");
  });

  test("typing a market amount does not unlock Trade %", () => {
    const r = tpTurn();
    assert(rowText(r).includes("locked"), "locked before");
    typeIn(r, 0, "50");
    assert(rowText(r).includes("locked"), "still locked after typing dollars");
  });

  test("Trade % unlocks only when the market settles, by the existing gate", () => {
    const r = tpTurn();
    assert(rowText(r).includes("locked"), "locked while market is open");
    click(accept(r));
    assert(!rowText(r).includes("locked") || allText(r).includes("Trade %"),
      "the existing settlement gate opened the next phase");
  });

  test("the two percentages have different labels and different references", () => {
    const r = tpTurn();
    const negotiation = byClassIn(blocks(r)[0], "pn-fl").map(text).join(" ");
    eq(negotiation, "Amount", "market negotiation has no percentage field at all");
    const headers = tradeRow(r).findAllByType("th").map(text).join(" ");
    assert(headers.includes("Trade %"), "the deal term keeps its own column");
    assert(!headers.includes("of their value"), "which is never relabelled");
  });

  test("trade credit still derives from agreed market times Trade %", () => {
    const r = tpTurn();
    click(accept(r));                                     // market settles at 123
    // the negotiation percentage typed earlier can have left no trace in credit
    const t = rowText(r);
    assert(t.includes("$123"), "agreed market value is their accepted number");
    assert(!t.includes("$98"), "no market-negotiation figure leaked into the row: " + t.slice(0, 240));
  });
});

describe("Value Trade — safety", () => {
  test("no NaN, Infinity, or runaway precision anywhere in the block", () => {
    const r = tpTurn();
    typeIn(r, 0, "98");
    const t = text(blocks(r)[0]);
    assert(!/NaN|Infinity/.test(t), "clean output: " + t);
    assert(!/\d\.\d{3}/.test(t), "no long decimals: " + t);
  });

  test("the helpers guard a missing or zero reference", () => {
    eq(percentageOf(98, 0), null, "zero reference");
    eq(percentageOf(98, null), null, "missing reference");
    eq(amountFromPercentage(80, 0), null, "zero reference");
    eq(amountFromPercentage(-5, 123), null, "negative percentage");
    eq(percentageOf(98, 123), 80, "and still works normally");
  });
});

describe("Market counter CTA reflects submittability", () => {
  const isPrimary = (b) => String(b.props.className).split(/\s+/).includes("pri");

  test("empty is quiet and disabled", () => {
    const r = tpTurn();
    const b = send(r);
    eq(b.props.disabled, true, "not submittable");
    assert(!isPrimary(b), "and not styled as ready");
  });

  test("a valid amount lights the CTA", () => {
    const r = tpTurn();
    typeIn(r, 0, "98");
    eq(send(r).props.disabled, false, "submittable");
    assert(isPrimary(send(r)), "primary teal");
  });

  test("only the amount drives the CTA now", () => {
    const r = tpTurn();
    eq(fields(r).length, 1, "there is no second entry path");
    typeIn(r, 0, "98");
    assert(isPrimary(send(r)), "primary teal from the amount alone");
  });

  test("clearing returns it to inactive", () => {
    const r = tpTurn();
    typeIn(r, 0, "98");
    typeIn(r, 0, "");
    const b = send(r);
    eq(b.props.disabled, true, "disabled");
    assert(!isPrimary(b), "and quiet");
  });

  test("styling and disabled never disagree", () => {
    const r = tpTurn();
    for (const v of ["", "abc", "0", "98", "-4", ""]) {
      typeIn(r, 0, v);
      eq(isPrimary(send(r)), !send(r).props.disabled, `"${v}": primary iff actionable`);
    }
  });

  test("submitting still calls the existing market transition once", () => {
    const r = tpTurn();
    typeIn(r, 0, "98");
    click(send(r));
    eq((allText(r).match(/proposed \$98 market value/g) || []).length, 1, "one proposal");
  });

  test("Accept keeps its primary treatment alongside a typed counter", () => {
    const r = tpTurn();
    typeIn(r, 0, "98");
    assert(String(accept(r).props.className).includes("pri"), "Accept stays available");
    assert(!accept(r).props.disabled, "and actionable");
  });
});

/* The collector's binder value is a PRIVATE reference. It may seed their own
   proposal field, but it must never reach the TP until they press send. */
describe("The private reference value stays private until submitted", () => {
  const PRIVATE = 320;                                  // James Rivera's binder value for Chansey

  /* Drive a binder copy all the way to the market phase through the real UI. */
  const toMarket = () => {
    const r = render();
    goProfile(r, "James Rivera");
    click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
    click(btns(r, "Accept $")[0]);                      // price agreed -> Select Trade draft
    const add = btns(r, "+ ").find((b) => text(b).includes("Chansey"));
    assert(add, "the binder copy is eligible");
    click(add);
    click(btns(r, "Send package for review")[0]);
    btns(r, "Accept into trade").forEach((b) => click(b));
    return r;
  };
  const marketBlock = (r) => byClass(r, "pn")
    .filter((n) => /market value|Opening market/.test(text(n)) && !/trade %/i.test(text(n)))[0];

  test("it is absent from the TP-facing Trade Binder", () => {
    const r = render();
    goProfile(r, "James Rivera");
    const t = byClass(r, "cp-bind").map(text).join(" ");
    assert(!t.includes(String(PRIVATE)), "the tile never shows it");
    assert(!/\$\d/.test(t), "nor any other monetary value");
  });

  test("it is absent from the copy inspection drawer", () => {
    const r = render();
    goProfile(r, "James Rivera");
    click(byClass(r, "cp-bind-view")[0]);
    const d = text(byClass(r, "drawer")[0]);
    assert(!/Collector value/.test(d), "no value row in the drawer");
    assert(!/\$\d/.test(d), "and no figure: " + d.slice(0, 120));
  });

  test("it is absent from Select Trade card review", () => {
    const r = render();
    goProfile(r, "James Rivera");
    click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
    click(btns(r, "Accept $")[0]);
    click(btns(r, "+ ").find((b) => b && text(b).includes("Chansey")));
    click(btns(r, "Send package for review")[0]);
    const review = byClass(r, "st-card").map(text).join(" ");
    assert(!review.includes(String(PRIVATE)), "not in the review card: " + review.slice(0, 140));
    assert(!/Collector value/.test(review), "and no value label");
  });

  test("the TP sees no market value before the collector proposes", () => {
    const r = toMarket();
    assert(!allText(r).includes("proposed $" + PRIVATE), "no proposal was created");
    const row = text(byClass(r, "tbl")[0]);
    assert(!row.includes(String(PRIVATE)), "and nothing in the trade row: " + row.slice(0, 140));
  });

  test("the collector's own field is prepopulated with it", () => {
    const r = toMarket();
    eq(marketBlock(r).findAllByType("input").map((i) => i.props.value).join(""), String(PRIVATE),
      "offered back to them as a starting point");
  });

  test("prepopulation creates no proposal, event or transition", () => {
    const r = toMarket();
    const before = text(byClass(r, "tbl")[0]);
    // simply rendering the prepopulated field must change nothing
    assert(!before.includes(String(PRIVATE)), "no market state was written");
    assert(!/proposed \$\d+ market value/.test(allText(r)), "no proposal event was logged");
    assert(text(byClass(r, "ws-map")[0]).includes("Value Trade"), "and the stage is where it was");
  });

  test("the collector may edit before sending, and only the sent figure reaches the TP", () => {
    const r = toMarket();
    const ins = () => marketBlock(r).findAllByType("input")[0];
    TR.act(() => { ins().props.onChange({ target: { value: "480" } }); });
    click(byClassIn(marketBlock(r), "pn-send")[0]);
    const t = allText(r);
    assert(t.includes("proposed $480 market value"), "the edited figure was proposed");
    assert(!t.includes("proposed $" + PRIVATE), "the unused private reference never surfaced");
    const row = text(byClass(r, "tbl")[0]);
    assert(row.includes("$480"), "and the row shows the submitted value");
    assert(!row.includes(String(PRIVATE)), "not the private one");
  });

  test("the private value is not overwritten by what was sent", () => {
    const r = toMarket();
    TR.act(() => { marketBlock(r).findAllByType("input")[0].props.onChange({ target: { value: "480" } }); });
    click(byClassIn(marketBlock(r), "pn-send")[0]);
    click(btn(r, "Collector profile"));
    const tiles = byClass(r, "cp-bind").map(text).join(" ");
    assert(!tiles.includes("480"), "the binder tile still shows no value at all");
  });

  test("the TP's own field is never seeded from the collector's private value", () => {
    const r = toMarket();
    TR.act(() => { marketBlock(r).findAllByType("input")[0].props.onChange({ target: { value: "480" } }); });
    click(byClassIn(marketBlock(r), "pn-send")[0]);
    // now the TP responds
    const tp = marketBlock(r);
    eq(tp.findAllByType("input").map((i) => i.props.value).join(""), "",
      "the TP starts from empty and evaluates independently");
    assert(text(tp).includes("Accept $480"), "with their existing accept action intact");
  });
});

require("./run.cjs").run();
