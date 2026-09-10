/* ============================================================================
   WHO PAYS WHOM, SAID ONCE

   The internal model is a signed balance and stays that way: it is the right
   representation, and it lets a proposal cross zero. What it must never do is
   reach a reader. "$272 to them" asks somebody to work out who "them" is in the
   one sentence where guessing costs money, and "-$272" asks them to know the
   sign convention.

   So the sign becomes English exactly once, in `settlement()`, which takes the
   reading seat. A collector and a partner then describe the SAME agreement from
   their own side and never contradict each other — the invariant these tests
   exist to hold, because the alternative is two components each deciding what
   positive means.
   ========================================================================= */

const { describe, test, assert, eq } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const TP = fs.readFileSync(path.join(ROOT, "src", "MetYet.jsx"), "utf8");
const DOM = fs.readFileSync(path.join(ROOT, "domain", "metyet-domain.js"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const NAMES = { collector: "Casey", partner: "Northline Cards" };
const asCollector = (n) => D.settlement(n, { viewer: "collector", ...NAMES });
const asPartner = (n) => D.settlement(n, { viewer: "tp", ...NAMES });

describe("A. One agreement, two seats, no contradiction", () => {
  test("a collector owing reads correctly from both sides", () => {
    eq(asCollector(272).sentence, "You pay Northline Cards", "their own side");
    eq(asPartner(272).sentence, "Casey pays you", "and the partner's");
  });

  test("a partner owing reads correctly from both sides", () => {
    eq(asCollector(-272).sentence, "Northline Cards pays you", "the collector is paid");
    eq(asPartner(-272).sentence, "You pay Casey", "and the partner pays");
  });

  test("both seats agree on who pays and how much", () => {
    [272, -272, 1, -1, 5000].forEach((n) => {
      const c = asCollector(n); const t = asPartner(n);
      eq(c.payerSeat, t.payerSeat, n + ": one payer");
      eq(c.payeeSeat, t.payeeSeat, n + ": one payee");
      eq(c.amount, t.amount, n + ": one amount");
      assert(c.sentence !== t.sentence, n + ": described from different sides");
    });
  });

  test("reversing the sign reverses payer and payee", () => {
    const up = asCollector(272); const down = asCollector(-272);
    eq(up.payerSeat, down.payeeSeat, "the payer becomes the payee");
    eq(up.payeeSeat, down.payerSeat, "and the payee the payer");
    eq(up.amount, down.amount, "at the same magnitude");
  });

  test("the amount is always unsigned", () => {
    [-1, -272, -5000].forEach((n) =>
      assert(asCollector(n).amount > 0, n + " reads as a positive figure"));
  });
});

describe("B. Zero is not a small debt", () => {
  test("nobody owes anybody", () => {
    const z = asCollector(0);
    eq(z.direction, "settled", "settled");
    eq(z.sentence, "No cash owed", "and said plainly");
    eq(z.payer, null, "with no payer");
    eq(z.payee, null, "and no payee");
    eq(z.amount, 0, "$0");
  });

  test("it reads the same from either seat", () => {
    eq(asPartner(0).sentence, asCollector(0).sentence, "one statement");
  });

  test("an unknown balance claims nothing", () => {
    const u = asCollector(null);
    eq(u.direction, "unknown", "no price agreed yet");
    eq(u.sentence, null, "so no sentence is invented");
  });
});

describe("C. One interpretation, nowhere else", () => {
  test("the helper is declared once", () => {
    eq((code(DOM).match(/const settlement = /g) || []).length, 1, "one formatter");
    assert(typeof D.settlement === "function", "and it is exported");
  });

  test("no persona derives payer from the sign itself", () => {
    /* The defect this closes: the partner's seat used to compute
       `net > 0 ? "collector" : "tp"` — the same judgement, written twice. */
    [["Collector", code(COL)], ["Trusted Partner", code(TP)]].forEach(([n, src]) => {
      assert(!/net > 0 \? "collector"/.test(src), n + " does not re-derive the payer");
      assert(!/> 0 \? "to them"/.test(src), n + " does not re-derive the wording");
    });
  });

  test("the partner's seat consumes the canonical helper", () => {
    const tp = code(TP);
    assert(/SharedID\.settlement\(/.test(tp), "it calls the shared formatter");
    const fn = tp.slice(tp.indexOf("const cashBalance = (opp)"),
      tp.indexOf("const remainingCash"));
    assert(/SharedID\.settlement\(net/.test(fn), "including for payer and recipient");
    assert(!/payer: net > 0/.test(fn), "and computes neither itself");
  });

  test("the collector's seat consumes it too", () => {
    assert(/D\.settlement\(amount, \{/.test(code(COL))
      || /const settle = \(amount, partnerName\) => D\.settlement/.test(code(COL)),
      "through one alias");
    eq((code(COL).match(/const settle = \(amount, partnerName\)/g) || []).length, 1,
      "declared once");
  });
});

describe("D. No ambiguous or signed settlement language", () => {
  const authored = [["collector", code(COL)], ["partner", code(TP)]];

  test("no surface says 'to them' or 'to you' for direction", () => {
    authored.forEach(([n, src]) => {
      assert(!/"to them"|' to them'|\$\{[^}]*\} to them/.test(src),
        n + ": no 'to them'");
      assert(!/>= 0 \? "to them" : "to you"/.test(src), n + ": and no sign ternary");
    });
  });

  test("the old Handoff wording is gone from source", () => {
    authored.forEach(([n, src]) =>
      assert(!/Settling up/.test(src), n + ": 'Settling up' is not in authored source"));
    assert(/Cash settlement/.test(code(COL)), "replaced by an explicit label");
  });

  test("no human-facing settlement shows a signed number", () => {
    authored.forEach(([n, src]) => {
      assert(!/\$-|\-\$\{money/.test(src), n + ": no negative currency in copy");
      assert(!/money\(net\)/.test(src), n + ": the signed net is never rendered raw");
    });
  });

  test("the helper never emits a pronoun for the other party", () => {
    ["them", "they", "the other party"].forEach((w) => {
      const c = asCollector(272).sentence + " " + asPartner(272).sentence;
      assert(!new RegExp("\\b" + w + "\\b", "i").test(c),
        "no '" + w + "' in: " + c);
    });
  });
});

describe("E. Every settlement surface uses it", () => {
  const col = code(COL);

  test("the Cash stage receipt", () => {
    const deal = col.slice(col.indexOf("function DealStage("),
      col.indexOf("function Fulfillment("));
    assert(/settle\(/.test(deal) || /D\.settlement\(/.test(deal),
      "the deal receipt speaks through the helper");
    assert(!/cash >= 0 \?/.test(deal), "and not through a sign test");
  });

  test("the Handoff card", () => {
    const f = col.slice(col.indexOf("function Fulfillment("),
      col.indexOf("function Fulfillment(") + 4000);
    assert(/Cash settlement/.test(f), "labelled explicitly");
    assert(/set\.sentence/.test(f), "with the canonical sentence");
    assert(!/to them/.test(f), "and no pronoun");
  });

  test("the mobile deal summary", () => {
    const m = col.slice(col.indexOf("function MobileDeal("),
      col.indexOf("function Deal({", col.indexOf("function MobileDeal(")));
    assert(/settle\(D\.finalBalance\(o\), them\)\.sentence/.test(m),
      "the summary reads the helper");
  });

  test("the proposal control states the consequence before agreement", () => {
    const deal = col.slice(col.indexOf("function DealStage("),
      col.indexOf("function Fulfillment("));
    assert(/cmp\.proposed\.direction/.test(deal), "the draft has a resolved direction");
    /* CONTRACT CHANGE: the proposal control now renders current, proposed and the
       change live, and the "Switch to …" button is gone — the slider is the only
       direction control, and crossing zero is what changes payer. */
    assert(/cmp\.proposed\.sentence/.test(deal),
      "stated in words while proposing, through the helper");
    assert(/Proposed cash settlement/.test(deal), "and labelled as a proposal");
    assert(/"Propose no cash owed"/.test(deal), "including the zero case");
  });

  test("the receipt still reconciles the whole agreement", () => {
    /* CONTRACT CHANGE: the receipt is now its own component, so both the Deal
       stage and Handoff can render the same derivation. The lines it must keep
       are unchanged — only where they live. */
    const rec = col.slice(col.indexOf("function DealReceipt("),
      col.indexOf("function DealStage("));
    ["Price you agreed", "Agreed market value", "Agreed Trade %", "Trade value",
      "Total trade value", "Calculated cash balance"].forEach((line) =>
      assert(rec.includes(line), "the receipt keeps: " + line));
    assert(/<DealReceipt o=\{o\} st=\{st\} them=\{them\} \/>/.test(col),
      "and the deal stage renders it");
  });

  test("the arithmetic behind it is untouched", () => {
    const o = { agreedPrice: 3900,
      trade: { cards: [
        { inclusion: "accepted", agreedMarket: 850, agreedPercent: 0.85 },
        { inclusion: "accepted", agreedMarket: 600, agreedPercent: 0.75 }] },
      deal: {} };
    eq(D.totalTradeValue(o), 1173, "$723 + $450");
    eq(D.calculatedBalance(o), 2727, "$3,900 - $1,173");
    eq(asCollector(D.calculatedBalance(o)).sentence, "You pay Northline Cards",
      "and the settlement follows from it");
  });

  test("the lifecycle is unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment",
      "six, in order");
  });
});

require("./run.cjs").run();
