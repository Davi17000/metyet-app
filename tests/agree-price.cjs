const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const { PriceDecision, percentageOf, amountFromPercentage } = require("../dist/MetYet.test.cjs");
const { render, text, allText, btn, btns, btnExact, click, byClass, byClassIn, goProfile } = require("./util.cjs");

/* ---- the real app, at James Rivera's Agree on Price opportunity ----
   Listed $780, collector offered $686. Nothing here is hardcoded arithmetic:
   the expected percentages are recomputed from those two numbers. */
const LISTED = 780, OFFER = 686;
const pc = (amount) => Math.round((amount / LISTED) * 100);

const atAgreePrice = () => {
  const r = render();
  goProfile(r, "James Rivera");
  click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
  return r;
};
const panel = (r) => byClass(r, "pn")[0];
const inputs = (r) => panel(r).findAllByType("input");
const values = (r) => inputs(r).map((i) => i.props.value).join("|");
const typeIn = (r, i, v) => TR.act(() => { inputs(r)[i].props.onChange({ target: { value: v } }); });
const sendBtn = (r) => byClass(r, "pn-send")[0];
const acceptBtn = (r) => byClass(r, "pn-accept")[0];
const headline = (r) => text(byClassIn(panel(r), "pn-amt")[0]);
const pctLine = (r) => text(byClassIn(panel(r), "pn-pct")[0]);

describe("Agree on Price — the collector's offer reads as a percentage", () => {
  test("the offer is the focal number with its share of listed beneath", () => {
    const r = atAgreePrice();
    // the collector's identity now sits on the avatar, so the label says "Their offer"
    eq(text(byClassIn(panel(r), "pn-h")[0]), "Their offer", "term label, no duplicated name");
    const party = byClassIn(panel(r), "np")[0];
    assert(party, "the collector is present in the negotiation");
    eq(text(byClassIn(party, "np-n")[0]), "James R.", "named once, on the avatar");
    assert(!text(panel(r)).includes("James R.'s offer"), "no duplicated identity wording");
    eq(headline(r), "$686", "the offer is the headline");
    eq(pctLine(r), pc(OFFER) + "% of listed price", "derived share, unambiguous label");
    eq(pc(OFFER), 88, "sanity: 686 of 780 is 88%");
  });

  test("the percentage is derived, never stored on the opportunity", () => {
    // the same amount against a different listed price yields a different percentage
    eq(percentageOf(686, 780), 88, "88% of 780");
    eq(percentageOf(686, 620), 111, "the same dollars, a different base");
    eq(percentageOf(546, 620), 88, "a second price pair");
    eq(percentageOf(496, 620), 80, "and another");
  });

  test("whole percentages only, never long decimals", () => {
    const r = atAgreePrice();
    assert(/^\d+% of listed price$/.test(pctLine(r)), "no decimal precision: " + pctLine(r));
    eq(percentageOf(546, 620), 88, "88.06% rounds to 88");
  });

  test("the running negotiation history carries percentages too", () => {
    const r = atAgreePrice();
    const t = allText(r);
    assert(t.includes("$686 · 88%"), "the thread pairs each amount with its share");
  });

  test("Terms still shows listed and agreed price", () => {
    const t = allText(atAgreePrice());
    assert(t.includes("Listed price"), "listed price preserved");
    assert(t.includes("Agreed price"), "agreed price preserved");
  });
});

describe("Agree on Price — dollars drive the percentage", () => {
  test("typing an amount updates the percentage immediately", () => {
    const r = atAgreePrice();
    typeIn(r, 0, "624");
    eq(values(r), ["624", String(pc(624))].join("|"), "624 of 780 is 80%");
    typeIn(r, 0, "725");
    eq(values(r), ["725", String(pc(725))].join("|"), "725 of 780 is 93%");
  });

  test("clearing the amount clears the percentage", () => {
    const r = atAgreePrice();
    typeIn(r, 0, "600");
    typeIn(r, 0, "");
    eq(values(r), ["", ""].join("|"), "both empty");
  });

  test("no second percentage state exists — the percent field is always derived", () => {
    const r = atAgreePrice();
    typeIn(r, 1, "80");                       // set via percent
    const viaPct = values(r);
    typeIn(r, 0, viaPct.split("|")[0]);                  // set the same dollars directly
    eq(values(r), viaPct, "both routes land on one value, so only one is held");
  });
});

describe("Agree on Price — the percentage drives dollars", () => {
  test("typing a percentage updates the amount immediately", () => {
    const r = atAgreePrice();
    typeIn(r, 1, "80");
    eq(values(r).split("|")[0], String(Math.round(LISTED * 0.8)), "80% of 780");
    typeIn(r, 1, "75");
    eq(values(r).split("|")[0], String(Math.round(LISTED * 0.75)), "75% of 780");
  });

  test("the conversion is whole dollars, matching the rest of the flow", () => {
    eq(amountFromPercentage(80, 620), 496, "80% of 620");
    eq(amountFromPercentage(75, 620), 465, "75% of 620");
    eq(amountFromPercentage(88, 620), 546, "88% of 620");
    const r = atAgreePrice();
    typeIn(r, 1, "77");
    assert(/^\d+$/.test(values(r).split("|")[0]), "no cents introduced: " + values(r));
  });

  test("the percentage field is labelled against listed price", () => {
    const r = atAgreePrice();
    const labels = byClassIn(panel(r), "pn-fl").map(text);
    eq(labels.join(" | "), "Amount | % of listed", "units are labelled, not implied");
    assert(inputs(r)[1].props["aria-label"].includes("percentage of listed price"),
      "and spelled out for assistive tech");
  });
});

describe("Agree on Price — sending a counter", () => {
  test("Send counter submits the canonical dollar amount, however it was entered", () => {
    const r = atAgreePrice();
    typeIn(r, 1, "80");                        // entered as a percentage
    const expected = String(Math.round(LISTED * 0.8));
    click(sendBtn(r));
    eq(headline(r), "$" + Number(expected).toLocaleString("en-US"), "the dollar amount was sent");
    assert(allText(r).includes("You countered"), "recorded on the existing price thread");
  });

  test("the action reads Send counter", () => {
    const r = atAgreePrice();
    eq(text(sendBtn(r)), "Send counter", "not just 'Counter'");
  });

  test("an empty or invalid counter cannot be submitted", () => {
    const r = atAgreePrice();
    eq(sendBtn(r).props.disabled, true, "disabled with nothing entered");
    typeIn(r, 0, "abc");
    eq(values(r), ["", ""].join("|"), "letters never reach state");
    eq(sendBtn(r).props.disabled, true, "still disabled");
    typeIn(r, 0, "0");
    eq(sendBtn(r).props.disabled, true, "zero is not a counter");
    typeIn(r, 0, "500");
    eq(sendBtn(r).props.disabled, false, "a real amount enables it");
  });

  test("negative values are normalised rather than accepted", () => {
    const r = atAgreePrice();
    typeIn(r, 0, "-50");
    assert(!values(r).split("|")[0].includes("-"), "no negative amount: " + values(r));
    typeIn(r, 1, "-20");
    assert(!values(r).split("|")[1].includes("-"), "no negative percentage: " + values(r));
  });
});

describe("Agree on Price — Accept is unchanged", () => {
  test("Accept still names the collector's current offer", () => {
    const r = atAgreePrice();
    eq(text(acceptBtn(r)), "Accept $686", "the amount stays in the button");
  });

  test("accepting settles the agreed price at the collector's offer", () => {
    const r = atAgreePrice();
    click(acceptBtn(r));
    const t = allText(r);
    assert(t.includes("$686"), "the accepted amount carries through");
    assert(!t.includes("Send counter"), "the negotiation surface is done");
    assert(t.includes("Select Trade"), "the stage advanced exactly as before");
  });

  test("accepting takes no extra confirmation step", () => {
    const r = atAgreePrice();
    click(acceptBtn(r));
    assert(byClass(r, "modal").length === 0, "no confirmation dialog was introduced");
  });
});

describe("Agree on Price — waiting on the collector", () => {
  test("after countering, the panel shows the counter and who owns the next step", () => {
    const r = atAgreePrice();
    typeIn(r, 0, "600");
    click(sendBtn(r));
    eq(text(byClassIn(panel(r), "pn-h")[0]), "Your counter", "it is now the TP's number");
    eq(headline(r), "$600", "the amount sent");
    eq(pctLine(r), pc(600) + "% of listed price", "with its share of listed");
    assert(text(byClassIn(panel(r), "pn-wait")[0]).includes("James R."), "waiting on the collector");
  });

  test("no active counter form is offered while waiting", () => {
    const r = atAgreePrice();
    typeIn(r, 0, "600");
    click(sendBtn(r));
    // the TP's own block: no live form while waiting. The collector's demo seat now
    // renders its own PriceDecision below, which is the parity change, not a leak.
    eq(panel(r).findAllByType("input").length, 0, "no live inputs in the TP block");
    eq(byClassIn(panel(r), "pn-send").length, 0, "no Send counter button");
    eq(byClassIn(panel(r), "pn-accept").length, 0, "and nothing to accept — not the TP's turn");
  });

  test("the decision surface returns when the collector counters back", () => {
    const r = atAgreePrice();
    typeIn(r, 0, "600");
    click(sendBtn(r));
    // the collector responds through their own seat, which now uses PriceDecision
    const sim = byClass(r, "pn")[1];
    assert(sim, "the collector-side decision block renders");
    TR.act(() => { sim.findAllByType("input")[0].props.onChange({ target: { value: "650" } }); });
    click(byClassIn(sim, "pn-send")[0]);
    assert(acceptBtn(r), "an Accept action is back");
    eq(headline(r), "$650", "showing their new offer");
    eq(pctLine(r), pc(650) + "% of listed price", "with its share");
    eq(panel(r).findAllByType("input").length, 2, "and both counter inputs return");
  });
});

describe("Agree on Price — safety", () => {
  /* Driven directly so a zero or missing listed price can be exercised without
     inventing seed data for an impossible opportunity. */
  const mountWith = (listedPrice) => {
    const opp = {
      id: "o1", listedPrice, agreedPrice: null, stage: "agree-price",
      priceThread: [{ by: "collector", type: "offer", amount: 500, at: "2026-08-01" }],
    };
    let r;
    TR.act(() => {
      r = TR.create(React.createElement(PriceDecision, {
        opp, col: { short: "Priya R." }, na: { owner: "tp" }, priceRespond: () => {},
      }));
    });
    return r;
  };
  const allTextOf = (r) => text(r.root);

  test("a zero listed price never renders NaN or Infinity", () => {
    const r = mountWith(0);
    const t = allTextOf(r);
    assert(!/NaN|Infinity/.test(t), "no broken number: " + t);
    assert(t.includes("$500"), "the offer still shows");
    assert(t.includes("listed price unavailable"), "and the share degrades to a plain statement");
  });

  test("a missing listed price is handled the same way", () => {
    [null, undefined].forEach((v) => {
      const t = allTextOf(mountWith(v));
      assert(!/NaN|Infinity/.test(t), "no broken number for " + v);
    });
  });

  test("the helpers refuse to divide by zero or by nothing", () => {
    eq(percentageOf(500, 0), null, "zero listed price");
    eq(percentageOf(500, null), null, "missing listed price");
    eq(percentageOf("", 620), null, "empty amount");
    eq(percentageOf("abc", 620), null, "non-numeric amount");
    eq(amountFromPercentage(80, 0), null, "zero listed price");
    eq(amountFromPercentage("", 620), null, "empty percentage");
    eq(amountFromPercentage(-5, 620), null, "negative percentage");
  });

  test("with no usable reference the percentage field is not offered at all", () => {
    const r = mountWith(0);
    eq(r.root.findAllByType("input").length, 1, "amount only — nothing to take a percentage of");
    TR.act(() => { r.root.findAllByType("input")[0].props.onChange({ target: { value: "400" } }); });
    eq(r.root.findAllByType("input")[0].props.value, "400", "the amount still works normally");
    assert(!/NaN|Infinity|%/.test(allTextOf(r)), "and no orphaned percent sign: " + allTextOf(r));
  });
});

describe("Agree on Price — no pricing intelligence, no Value Trade bleed", () => {
  test("nothing suggests what the TP should offer", () => {
    const t = allText(atAgreePrice());
    for (const banned of ["Recommended", "Suggested", "Target", "Margin", "Profit",
      "Comps", "Good deal", "Below market", "Above market"]) {
      assert(!t.includes(banned), `must not advise on price: "${banned}"`);
    }
  });

  test("the Agree on Price percentage is not the Value Trade percentage", () => {
    const r = atAgreePrice();
    const t = text(panel(r));
    assert(t.includes("of listed"), "labelled against listed price");
    assert(!t.includes("Trade %"), "the Value Trade concept stays out of this panel");
    assert(!t.includes("Trade Credit"), "and so does its credit");
  });
});

/* The CTA must express whether the action can actually be taken right now. */
describe("Counter CTA reflects submittability", () => {
  const sendBtn2 = (r) => byClassIn(panel(r), "pn-send")[0];
  const isPrimary = (b) => String(b.props.className).split(/\s+/).includes("pri");

  test("A. an empty counter leaves the CTA quiet and disabled", () => {
    const r = atAgreePrice();
    const b = sendBtn2(r);
    eq(b.props.disabled, true, "not submittable");
    assert(!isPrimary(b), "and not styled as ready");
  });

  test("B. entering an amount lights the CTA immediately", () => {
    const r = atAgreePrice();
    typeIn(r, 0, "600");
    const b = sendBtn2(r);
    eq(b.props.disabled, false, "submittable");
    assert(isPrimary(b), "and styled as the primary action");
  });

  test("C. entering a percentage lights the same CTA", () => {
    const r = atAgreePrice();
    typeIn(r, 1, "90");
    const b = sendBtn2(r);
    eq(b.props.disabled, false, "either entry path activates it");
    assert(isPrimary(b), "primary");
    assert(values(r).split("|")[0] !== "", "with the amount derived: " + values(r));
  });

  test("D. clearing the value returns the CTA to inactive", () => {
    const r = atAgreePrice();
    typeIn(r, 0, "600");
    assert(isPrimary(sendBtn2(r)), "active first");
    typeIn(r, 0, "");
    const b = sendBtn2(r);
    eq(b.props.disabled, true, "disabled again");
    assert(!isPrimary(b), "and quiet again");
  });

  test("styling and disabled state can never disagree", () => {
    const r = atAgreePrice();
    for (const v of ["", "abc", "0", "-5", "600", "1", ""]) {
      typeIn(r, 0, v);
      const b = sendBtn2(r);
      eq(isPrimary(b), !b.props.disabled, `"${v}": primary iff actionable`);
    }
  });

  test("E. clicking the active CTA submits once through the existing handler", () => {
    const r = atAgreePrice();
    typeIn(r, 0, "600");
    click(sendBtn2(r));
    // one entry on the price thread; the conversation event is a separate surface
    const stage = text(byClass(r, "ws-stagework")[0]);
    eq((stage.match(/You countered/g) || []).length, 1,
      "exactly one counter on the price thread");
    eq(headline(r), "$600", "at the entered amount");
  });

  test("F. Accept stays actionable while a valid counter is typed", () => {
    const r = atAgreePrice();
    typeIn(r, 0, "600");
    const acc = acceptBtn(r);
    assert(!acc.props.disabled, "Accept is not disabled by typing a counter");
    assert(String(acc.props.className).includes("pri"), "and keeps its primary treatment");
    assert(isPrimary(sendBtn2(r)), "both decisions read as available");
  });

  test("the collector seat behaves identically", () => {
    const r = atAgreePrice();
    typeIn(r, 0, "600");
    click(sendBtn2(r));                                   // hand the turn over
    const sim = byClass(r, "pn")[1];
    assert(sim, "the collector's decision block");
    const b = () => byClassIn(byClass(r, "pn")[1], "pn-send")[0];
    eq(b().props.disabled, true, "quiet when empty");
    TR.act(() => { byClass(r, "pn")[1].findAllByType("input")[0].props.onChange({ target: { value: "650" } }); });
    eq(b().props.disabled, false, "active once valid");
    assert(String(b().props.className).includes("pri"), "same primary treatment, no perspective-specific logic");
  });
});

require("./run.cjs").run();
