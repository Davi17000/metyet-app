const { describe, test, assert, eq } = require("./run.cjs");
const TR = require("react-test-renderer");
const { render, text, allText, btn, btns, btnExact, click, byClass, byClassIn, goProfile } = require("./util.cjs");

/* Hiro Tanaka's Value Trade opportunity. Its third trade card sits in the market
   phase with no proposal on the table, so it can be driven to a settled market and
   then into a fresh Trade % negotiation — the state this task is about. */
const MARKET = 500;                 // the market value settled below
const DEFAULT_PCT = 80;             // PARTNER.tradeRate snapshotted onto the opportunity

const valueTrade = () => {
  const r = render();
  goProfile(r, "Hiro Tanaka");
  click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
  return r;
};
const blocks = (r) => byClass(r, "pn");
const last = (r) => blocks(r)[blocks(r).length - 1];
const btnIn = (node, startsWith) =>
  node.findAllByType("button").find((b) => text(b).startsWith(startsWith));
const fields = (node) => node.findAllByType("input");
const values = (node) => fields(node).map((i) => i.props.value).join("|");
const typeIn = (node, i, v) => TR.act(() => { fields(node)[i].props.onChange({ target: { value: v } }); });
const rowText = (r) => text(byClass(r, "tbl")[0]);

/* Settle the market on the untouched card, leaving the TP to open Trade %. */
const atTradePct = () => {
  const r = valueTrade();
  typeIn(last(r), 0, String(MARKET));
  click(btnIn(last(r), "Send market"));          // collector proposes
  click(btnIn(last(r), "Accept"));               // TP accepts -> market agreed
  return r;
};
/* Put the collector's proposal on the table so the TP is answering one. */
const theirProposal = (r, whole) => {
  typeIn(last(r), 0, String(whole));
  click(btnIn(last(r), "Send trade"));           // TP proposes
  const sim = last(r);                           // collector's seat
  typeIn(sim, 0, String(whole + 6));
  click(btnIn(sim, "Send trade"));               // collector counters
  return r;
};

describe("Trade % — the TP default is a starting position", () => {
  test("A. the default prepopulates both readings without submitting", () => {
    const r = atTradePct();
    const b = last(r);
    eq(values(b), DEFAULT_PCT + "|" + Math.round(MARKET * DEFAULT_PCT / 100),
      "80% and its trade value are filled in");
    assert(text(b).includes("Your trade %"), "it is your position, not theirs");
    assert(text(b).includes("on agreed market value $500"), "the reference is named");
  });

  test("A. nothing is written to the negotiation until send is pressed", () => {
    const r = atTradePct();
    // scope to the card under negotiation; other seeded cards legitimately show 80%
    const row = byClass(r, "tbl")[0].findAllByType("tr").find((tr) => text(tr).includes("Blastoise"));
    assert(!/You \d+%/.test(text(row)), "no proposal recorded yet: " + text(row).slice(0, 160));
    assert(!allText(r).includes("trade rate on Blastoise"), "no proposal event");
    eq(text(btnIn(last(r), "Send trade")), "Send trade proposal", "an explicit action is required");
  });

  test("A. the one-click default submit is gone", () => {
    const r = atTradePct();
    assert(!allText(r).includes("Propose your default"), "legacy immediate-submit control removed");
    assert(!allText(r).includes("Propose %"), "legacy percent button removed");
  });

  test("A. sending creates the proposal at the edited value", () => {
    const r = atTradePct();
    typeIn(last(r), 0, "75");
    click(btnIn(last(r), "Send trade"));
    assert(allText(r).includes("proposed a 75% trade rate"), "the edited figure was sent");
  });
});

describe("Trade % ↔ Trade Value synchronization", () => {
  test("B. a percentage drives the trade value", () => {
    const r = atTradePct();
    typeIn(last(r), 0, "80");
    eq(values(last(r)), "80|400", "80% of $500");
    typeIn(last(r), 0, "62");
    eq(values(last(r)), "62|310", "62% of $500");
  });

  test("B. the submitted canonical value is a fraction", () => {
    const r = atTradePct();
    typeIn(last(r), 0, "80");
    click(btnIn(last(r), "Send trade"));
    assert(allText(r).includes("proposed a 80% trade rate"), "displayed as a whole percent");
    assert(rowText(r).includes("80%"), "and stored so the row shows 80%");
  });

  test("C. a trade value drives the percentage", () => {
    const r = atTradePct();
    typeIn(last(r), 1, "400");
    eq(values(last(r)), "80|400", "$400 of $500 is 80%");
    typeIn(last(r), 1, "310");
    eq(values(last(r)), "62|310", "$310 is 62%");
  });

  test("C. entering a trade value still submits a canonical percentage", () => {
    const r = atTradePct();
    typeIn(last(r), 1, "400");
    click(btnIn(last(r), "Send trade"));
    assert(allText(r).includes("proposed a 80% trade rate"), "converted back to the percentage");
  });

  test("D. an awkward trade value quantises to a whole percent", () => {
    const r = atTradePct();
    typeIn(last(r), 1, "398");                    // 398/500 = 79.6%
    eq(values(last(r)), "80|400", "rounds to 80% and redisplays its exact trade value");
  });

  test("D. the two fields can never visually disagree", () => {
    const r = atTradePct();
    for (const v of ["398", "401", "333", "1", "499", "251"]) {
      typeIn(last(r), 1, v);
      const [p, d] = values(last(r)).split("|");
      if (p === "") continue;
      eq(Number(d), Math.round(MARKET * Number(p) / 100),
        `trade value must equal round(market x ${p}%)`);
    }
  });

  test("D. percentages are capped and cleared sensibly", () => {
    const r = atTradePct();
    typeIn(last(r), 1, "9999");
    eq(values(last(r)).split("|")[0], "100", "cannot exceed 100%");
    typeIn(last(r), 0, "");
    eq(values(last(r)), "|", "clearing clears both");
    eq(btnIn(last(r), "Send trade").props.disabled, true, "and nothing can be sent");
  });

  test("D. invalid input never reaches the fields", () => {
    const r = atTradePct();
    typeIn(last(r), 0, "abc");
    eq(values(last(r)), "|", "letters rejected");
    typeIn(last(r), 0, "-20");
    assert(!values(last(r)).includes("-"), "negatives stripped");
    typeIn(last(r), 0, "0");
    eq(btnIn(last(r), "Send trade").props.disabled, true, "zero is not a trade %");
  });

  test("the inputs are polished fields, not browser number spinners", () => {
    const r = atTradePct();
    fields(last(r)).forEach((i) => {
      eq(i.props.type, "text", "text input, no spinner chrome");
      assert(i.props.inputMode === "decimal", "numeric keyboard");
      assert(i.props["aria-label"], "labelled for assistive tech");
    });
    const labels = byClassIn(last(r), "pn-fl").map(text);
    eq(labels.join(" | "), "Trade % | Trade Value", "explicit labels");
  });
});

describe("Trade % — accepting their position", () => {
  test("E. their position shows both readings and the reference", () => {
    const r = theirProposal(atTradePct(), 80);
    const b = last(r);
    assert(text(b).includes("Their trade %"), "their position");
    assert(text(b).includes("86%"), "their percentage");
    assert(text(b).includes("Trade Value $430"), "its dollar translation: " + text(b).slice(0, 160));
    assert(text(b).includes("on agreed market value $500"), "the reference");
  });

  test("E. accept settles their exact canonical percentage", () => {
    const r = theirProposal(atTradePct(), 80);
    click(btnIn(last(r), "Accept"));
    assert(allText(r).includes("Trade % agreed"), "the existing accept transition ran");
    assert(rowText(r).includes("86%"), "settled at their figure, not the edited one");
  });

  test("E. the editable counter fields do not interfere with accept", () => {
    const r = theirProposal(atTradePct(), 80);
    typeIn(last(r), 0, "40");                     // type something different first
    click(btnIn(last(r), "Accept"));
    assert(rowText(r).includes("86%"), "accept used their percentage, not the typed 40%");
    assert(!rowText(r).includes("40%"), "the typed value was never submitted");
  });
});

describe("Trade % — turn ownership and waiting", () => {
  test("F. after sending, the TP sees a waiting state with no live controls", () => {
    const r = atTradePct();
    typeIn(last(r), 0, "80");
    click(btnIn(last(r), "Send trade"));
    const wait = byClass(r, "pn").find((n) => String(n.props.className).includes("wait"));
    assert(wait, "waiting block rendered");
    const t = text(wait);
    assert(t.includes("Your trade %"), "your standing position");
    assert(t.includes("80%") && t.includes("Trade Value $400"), "both readings: " + t);
    assert(t.includes("Waiting on Hiro T."), "and who owes the move");
    eq(fields(wait).length, 0, "no editable controls while waiting");
  });

  test("F. ownership comes from the existing card logic", () => {
    const r = atTradePct();
    typeIn(last(r), 0, "80");
    click(btnIn(last(r), "Send trade"));
    assert(rowText(r).includes("Review trade %"), "the existing owner label drives it");
  });
});

describe("Trade % — collector parity", () => {
  test("G. the collector negotiates with the same synchronized readings", () => {
    const r = atTradePct();
    typeIn(last(r), 0, "80");
    click(btnIn(last(r), "Send trade"));
    const sim = last(r);
    assert(text(sim).includes("Their trade %"), "the TP's position from their seat");
    assert(text(sim).includes("Trade Value $400"), "with its dollar translation");
    const labels = byClassIn(sim, "pn-fl").map(text);
    eq(labels.join(" | "), "Trade % | Trade Value", "the same two fields");
    typeIn(sim, 1, "350");
    eq(values(sim), "70|350", "and the same synchronization");
  });

  test("G. the collector can counter", () => {
    const r = atTradePct();
    typeIn(last(r), 0, "80");
    click(btnIn(last(r), "Send trade"));
    typeIn(last(r), 0, "70");
    click(btnIn(last(r), "Send trade"));
    assert(allText(r).includes("proposed a 70% trade rate"), "their counter landed");
    assert(rowText(r).includes("Review trade %"), "and the turn came back");
  });

  test("G. the collector can accept", () => {
    const r = atTradePct();
    typeIn(last(r), 0, "80");
    click(btnIn(last(r), "Send trade"));
    click(btnIn(last(r), "Accept"));
    assert(allText(r).includes("Trade % agreed"), "settled from the collector's seat");
    assert(rowText(r).includes("80%"), "at the TP's figure");
  });

  test("G. the collector is not shown their own avatar", () => {
    const r = atTradePct();
    typeIn(last(r), 0, "80");
    click(btnIn(last(r), "Send trade"));
    eq(byClassIn(last(r), "np").length, 0, "no counterparty avatar in their own seat");
  });

  test("K. no misleading 'counter' action is passed", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    assert(!/percentAction\([^)]*"counter"/.test(src),
      "proposals and counters are one domain operation, so both send 'propose'");
  });
});

describe("Trade % — isolated from the Market Value percentage", () => {
  test("H. market value negotiation cannot touch trade percentage state", () => {
    const r = valueTrade();
    const mkt = last(r);
    typeIn(mkt, 0, "500");
    click(btnIn(mkt, "Send market"));
    // market value is negotiated in dollars only, so there is no percentage to confuse
    eq(last(r).findAllByType("input").length, 1, "one dollar field");
    typeIn(last(r), 0, "400");
    assert(rowText(r).includes("locked"), "Trade % is still locked, untouched");
    assert(!allText(r).includes("trade rate"), "no trade % proposal was created");
  });

  test("H. only the trade phase has a percentage field", () => {
    const r = valueTrade();
    const mkt = last(r);
    typeIn(mkt, 0, "500");
    click(btnIn(mkt, "Send market"));
    eq(byClassIn(last(r), "pn-fl").map(text).join(" | "), "Amount",
      "market negotiation is dollars only");
    click(btnIn(last(r), "Accept"));
    eq(byClassIn(last(r), "pn-fl").map(text).join(" | "), "Trade % | Trade Value",
      "the percentage concept belongs to the trade phase alone");
  });

  test("H. Trade % never labelled '% of their value', and vice versa", () => {
    const r = atTradePct();
    const t = text(last(r));
    assert(!t.includes("% of their value"), "trade % must not borrow the market label");
    assert(!t.includes("Amount"), "and not the market amount label");
  });
});

describe("Trade % — settlement math is unchanged", () => {
  test("I. trade value is agreed market x agreed percentage", () => {
    const r = atTradePct();
    typeIn(last(r), 0, "80");
    click(btnIn(last(r), "Send trade"));
    click(btnIn(last(r), "Accept"));              // collector accepts 80%
    const row = byClass(r, "tbl")[0].findAllByType("tr")
      .find((tr) => text(tr).includes("Blastoise") && text(tr).includes("80%"));
    assert(row, "the settled row: " + rowText(r).slice(0, 300));
    assert(text(row).includes("$400"), "500 x 80% = 400 exactly: " + text(row));
  });

  test("I. seeded settled cards keep their original figures", () => {
    const r = valueTrade();
    const t = rowText(r);
    assert(t.includes("$862"), "agreed market preserved");
    assert(t.includes("$741"), "its trade value preserved");
    assert(t.includes("$141"), "second card preserved");
  });

  test("I. the deal summary totals are unchanged", () => {
    const r = render();
    goProfile(r, "Hiro Tanaka");
    click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[1]);
    const t = allText(r);
    assert(t.includes("$1,294"), "total trade value unchanged");
    assert(t.includes("$8,016"), "cash balance unchanged");
  });
});

describe("Trade % — terminology", () => {
  test("J. a percentage is never called a Trade Value", () => {
    const r = atTradePct();
    typeIn(last(r), 0, "80");
    click(btnIn(last(r), "Send trade"));
    const t = allText(r);
    assert(t.includes("80% trade rate"), "a percentage is a trade rate");
    assert(!/\d+% trade value/i.test(t), "never '80% trade value'");
  });

  test("J. Trade Value labels only ever sit beside dollars", () => {
    const r = atTradePct();
    const b = text(last(r));
    const m = b.match(/Trade Value \$?\d/);
    assert(byClassIn(last(r), "pn-fl").map(text).includes("Trade Value"), "the dollar field");
    assert(m || b.includes("Trade Value"), "and the dollar translation: " + b.slice(0, 120));
  });

  test("J. no user-facing Trade Credit wording", () => {
    const r = atTradePct();
    assert(!/[Tt]rade [Cc]redit/.test(allText(r)), "still absent");
  });
});

describe("Trade % CTA reflects submittability", () => {
  const isPrimary = (b) => String(b.props.className).split(/\s+/).includes("pri");
  const sendIn = (r) => btnIn(last(r), "Send trade");

  test("the prepopulated default is already submittable, so the CTA is primary", () => {
    const r = atTradePct();
    const b = sendIn(r);
    eq(b.props.disabled, false, "the default is a valid proposal");
    assert(isPrimary(b), "so it reads as ready");
  });

  test("clearing the field deactivates it", () => {
    const r = atTradePct();
    typeIn(last(r), 0, "");
    const b = sendIn(r);
    eq(b.props.disabled, true, "nothing to send");
    assert(!isPrimary(b), "and it goes quiet");
  });

  test("either representation reactivates it", () => {
    const r = atTradePct();
    typeIn(last(r), 0, "");
    typeIn(last(r), 0, "75");
    assert(isPrimary(sendIn(r)), "percentage entry activates");
    typeIn(last(r), 0, "");
    typeIn(last(r), 1, "400");
    assert(isPrimary(sendIn(r)), "trade-value entry activates the same CTA");
  });

  test("styling and disabled never disagree", () => {
    const r = atTradePct();
    for (const v of ["", "abc", "0", "80", "150", ""]) {
      typeIn(last(r), 0, v);
      eq(isPrimary(sendIn(r)), !sendIn(r).props.disabled, `"${v}": primary iff actionable`);
    }
  });

  test("the default still does not submit on its own", () => {
    const r = atTradePct();
    const row = byClass(r, "tbl")[0].findAllByType("tr").find((tr) => text(tr).includes("Blastoise"));
    assert(!/You \d+%/.test(text(row)), "primary styling is not a submission");
  });
});

require("./run.cjs").run();
