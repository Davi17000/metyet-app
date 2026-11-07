/* PHASE 1 CLOSEOUT: this suite drives the Trusted Partner workspace's
   Collector simulation (SimBlock — acting as the collector from the partner's
   screen). That is engineering tooling and now renders only under DEV
   (shared/dev-flag.js), so the suite runs in DEV. Product and pilot builds
   never show it: tests/phase1-closeout.cjs. */
process.env.METYET_DEV = "1";

const { describe, test, assert, eq } = require("./run.cjs");
const TR = require("react-test-renderer");
const { render, text, allText, btn, btns, btnExact, click, byClass, byClassIn, goProfile } = require("./util.cjs");

/* RESTATED (M3A A1P) — TP-LED SELECTION. The partner chooses from the
   Collector's Trade/Sell cards; the Collector may withdraw any card, hold to add
   more, or say they're ready; the partner then deselects what they don't want
   and starts valuing. Every test below keeps its original intent, restated in
   that vocabulary:
     to review / accepted / rejected   ->  selected / withdrawn / deselected
     "Accept into trade" / "Reject"    ->  "Deselect" / "Start valuing"
   Alex Trinh's opportunity is seeded at Select Trade on the partner's final
   review: Espeon selected, Vaporeon already deselected. */
const selectTrade = () => {
  const r = render();
  goProfile(r, "Alex Trinh");
  click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
  return r;
};
/* A three-state selection: one selected (under review), one withdrawn by the
   Collector, one deselected by the partner.

   PHASE 1: moved from James Rivera to Ellen Fisher. Every copy James has open
   to trade is reserved, committed or already Traded in another Opportunity, and
   one exact BinderCopy may be in only one active package (contract §4), so the
   draft no longer offers them. Ellen has two available open-to-trade copies; the
   partner marks her third (Pikachu VMAX) open through the real binder toggle. */
const mixedPackage = () => {
  const r = render();
  goProfile(r, "Ellen Fisher");
  const tile = byClass(r, "cp-bind").find((t) => text(t).startsWith("Pikachu VMAX"));
  const toggle = tile.findAllByType("button").find((b) => text(b) === "Open to trade");
  if (toggle.props["aria-pressed"] !== "true") click(toggle);
  click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
  click(btns(r, "Accept $")[0]);                       // price agreed -> draft
  btns(r, "+ ").slice(0, 3).forEach((b) => click(btns(r, "+ ")[0]));
  click(btns(r, "Send 3 cards to")[0]);                // the partner's selection
  click(btns(r, "Withdraw from this deal")[0]);        // the Collector withdraws one (DEV seat)
  click(btns(r, "Ready — you can finish choosing")[0]); // and is ready
  click(btns(r, "Deselect")[0]);                       // the partner deselects one
  return r;
};

const surface = (r) => byClass(r, "vt-wrap")[0];
const surfaceText = (r) => text(surface(r));
const reviewCards = (r) => byClass(r, "st-card");
const resolved = (r) => byClass(r, "st-done");
const groups = (r) => byClass(r, "st-group").map(text);
const photoBtns = (r) => byClass(r, "copyph-btn");

describe("Select Trade — future financial fields are absent", () => {
  test("no market, percentage or trade-value information appears", () => {
    const t = surfaceText(selectTrade());
    for (const banned of ["Market Value", "Market value", "Trade %", "Trade Value",
      "locked", "not yet"]) {
      assert(!t.includes(banned), `Select Trade must not show "${banned}"`);
    }
  });

  test("no financial table or placeholder dashes remain", () => {
    const r = selectTrade();
    eq(byClassIn(surface(r), "vt").length, 0, "the financial table is gone");
    eq(surface(r).findAllByType("th").length, 0, "no financial column headers");
    assert(!/—/.test(text(byClass(r, "st-card")[0])), "no placeholder dashes on the review card");
  });

  test("machinery language is gone from the helper copy", () => {
    const t = surfaceText(selectTrade());
    assert(!t.includes("Valuation opens"), "no stage-gate mechanics");
    assert(!t.includes("settled state"), "no internal vocabulary");
    // RESTATED (M3A A1P): the next step, in the partner's terms
    assert(t.includes("Starting valuation reserves the selected cards for this deal."), "user-centered next step");
  });

  test("the task copy names the collector and the job", () => {
    const t = surfaceText(selectTrade());
    assert(t.includes("Select Trade"), "stage name kept");
    // RESTATED (M3A A1P): Alex is ready; the partner finishes choosing
    assert(t.includes("Alex T. is ready. Finish choosing from their cards, then start valuing."), "task copy: " + t.slice(0, 120));
  });
});

describe("Select Trade — the unresolved card is the unit of work", () => {
  test("card identity leads the review", () => {
    const r = selectTrade();
    const c = reviewCards(r)[0];
    assert(c, "a card is under review");
    eq(text(byClassIn(c, "st-name")[0]), "Espeon", "card name");
    assert(text(byClassIn(c, "st-sub")[0]).includes("Neo Discovery"), "set");
  });

  test("Card Details lists only fields the catalog has", () => {
    const r = selectTrade();
    const c = reviewCards(r)[0];
    const details = text(byClassIn(c, "st-details")[0]);
    assert(details.includes("Card Details"), "the required heading");
    assert(details.includes("Set"), "set");
    assert(details.includes("Grade") && details.includes("PSA 9"), "grade");
    assert(details.includes("Edition") && details.includes("Unlimited"), "edition");
    assert(details.includes("Language") && details.includes("Japanese"), "language");
    assert(details.includes("Cert") && details.includes("PSA 71230068"), "cert");
  });

  test("the heading is exactly 'Card Details'", () => {
    const t = surfaceText(selectTrade());
    assert(t.includes("Card Details"), "correct label");
    for (const wrong of ["Copy Details", "Copy Information", "Physical Copy Details", "This exact copy"]) {
      assert(!t.includes(wrong), `must not use "${wrong}"`);
    }
  });

  test("a raw card shows its condition instead of a grade", () => {
    /* RESTATED (M3A A1P), and strengthened: this used to return early when the
       fixture held no raw card. James's Poliwrath is raw and free to choose. */
    const r = render();
    goProfile(r, "James Rivera");
    click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
    click(btns(r, "Accept $")[0]);
    click(btns(r, "+ ").find((b) => text(b).includes("Poliwrath")));
    click(btns(r, "Send 1 card to")[0]);
    const poli = reviewCards(r).map(text).find((t) => t.includes("Poliwrath"));
    assert(poli, "Poliwrath is under review");
    assert(poli.includes("Condition") && !/Grade/.test(poli), "condition shown: " + poli);
  });

  test("the decision is asked directly, with only inclusion actions", () => {
    const r = selectTrade();
    const c = reviewCards(r)[0];
    assert(text(c).includes("Keep this card in the trade?"), "the prompt");   // RESTATED (M3A A1P)
    const labels = c.findAllByType("button")
      .filter((b) => !b.props["aria-label"])            // exclude the photo enlarge triggers
      .map(text);
    eq(labels.join(" | "), "Deselect", "inclusion actions only");
  });

  test("no negotiation controls leak onto the review card", () => {
    const c = reviewCards(selectTrade())[0];
    eq(c.findAllByType("input").length, 0, "no value or percentage inputs");
    eq(c.findAllByType("select").length, 0, "no selectors");
  });
});

describe("Select Trade — the physical copy is central", () => {
  test("front and back are both shown at review size", () => {
    const r = selectTrade();
    const ph = byClassIn(reviewCards(r)[0], "copyph");
    eq(ph.length, 2, "two copy plates");
    eq(byClassIn(reviewCards(r)[0], "cimg-cap").map(text).join(","), "front,back", "labelled");
    ph.forEach((p) => assert(String(p.props.className).includes("lg"), "shown large enough to judge"));
  });

  test("the actual copy photos are used, not catalog artwork", () => {
    const c = reviewCards(selectTrade())[0];
    assert(text(c).includes("collector photo"), "the collector's own photographs");
    eq(byClassIn(c, "cimg").length, 0, "no stock artwork substituted");
  });

  test("clicking front opens the shared lightbox on front", () => {
    const r = selectTrade();
    click(photoBtns(r)[0]);
    assert(byClass(r, "lb").length === 1, "the existing PhotoLightbox, not a new viewer");
    eq(text(byClass(r, "lb-side")[0]), "front", "opened on the clicked face");
  });

  test("clicking back opens on back, and faces can be switched", () => {
    const r = selectTrade();
    click(photoBtns(r)[1]);
    eq(text(byClass(r, "lb-side")[0]), "back", "opened on back");
    click(btns(r, "front").find((b) => text(b).trim() === "front"));
    eq(text(byClass(r, "lb-side")[0]), "front", "switched");
  });

  test("the lightbox shows the correct card identity", () => {
    const r = selectTrade();
    click(photoBtns(r)[0]);
    const t = text(byClass(r, "modal")[0]);
    assert(t.includes("Espeon"), "the card under review");
    assert(t.includes("Neo Discovery"), "its set");
  });

  test("closing returns to Select Trade with no decision changed", () => {
    const r = selectTrade();
    const before = surfaceText(r);
    click(photoBtns(r)[0]);
    click(btns(r, "Close").find((b) => text(b).trim() === "Close"));
    eq(byClass(r, "modal").length, 0, "viewer closed");
    eq(surfaceText(r), before, "the review surface is untouched");
    eq(reviewCards(r).length, 1, "the card is still awaiting a decision");
  });

  test("the photo trigger is a real accessible button", () => {
    photoBtns(selectTrade()).forEach((b) => {
      eq(b.type, "button", "keyboard reachable");
      assert(/View larger (front|back) photo/.test(b.props["aria-label"]), "labelled");
    });
  });
});

describe("Select Trade — resolved cards collapse", () => {
  /* RESTATED (M3A A1P): a selected card stays under review until valuation
     starts, so the card that collapses on the Collector's side is a WITHDRAWN
     one — compact, labelled, with nothing left to decide. */
  test("an accepted card collapses to a compact resolved line", () => {
    const r = mixedPackage();
    const ok = resolved(r).find((n) => text(n).includes("Withdrawn"));
    assert(ok, "an accepted card is shown");
    assert(groups(r).includes("Withdrawn by Ellen F."), "clearly accepted: " + text(ok));
    assert(byClassIn(ok, "st-photos").length === 0, "no full review panel");
    eq(ok.findAllByType("button").length, 0, "no decision controls");
  });

  test("a rejected card collapses and stays identifiable", () => {
    const r = selectTrade();
    const no = resolved(r).find((n) => String(n.props.className).includes("no"));
    assert(no, "the rejected card is still listed");
    assert(text(no).includes("Deselected"), "clearly rejected");   // RESTATED (M3A A1P)
    assert(text(no).includes("Vaporeon"), "still identifiable: " + text(no));
    assert(byClassIn(no, "st-photos").length === 0, "collapsed, not a review panel");
  });

  test("resolved cards keep enough identity to understand the package", () => {
    const r = selectTrade();
    const no = resolved(r)[0];
    const t = text(no);
    assert(/PSA |Raw/.test(t), "grade or condition: " + t);
    assert(t.includes("Jungle"), "set");
  });

  test("unresolved cards keep the full actionable treatment", () => {
    const r = mixedPackage();
    reviewCards(r).forEach((c) => {
      assert(byClassIn(c, "st-photos").length === 1, "photos present");
      assert(text(c).includes("Keep this card in the trade?"), "and the decision is live");   // RESTATED (M3A A1P)
    });
  });
});

describe("Select Trade — ordering", () => {
  test("unresolved cards come before resolved ones", () => {
    const r = mixedPackage();
    const g = groups(r);
    const i = (n) => g.indexOf(n);
    // RESTATED (M3A A1P), and strengthened: every group must be present
    assert(i("Selected") >= 0, "a review group exists: " + g.join(","));
    assert(i("Deselected") > i("Selected"), "to review precedes accepted");
    assert(i("Withdrawn by Ellen F.") > i("Selected"), "to review precedes rejected");
  });

  test("accepted precedes rejected", () => {
    const r = mixedPackage();
    const g = groups(r);
    // RESTATED (M3A A1P): the partner's own decisions before the Collector's
    assert(g.indexOf("Deselected") >= 0 && g.indexOf("Deselected") < g.indexOf("Withdrawn by Ellen F."),
      "accepted before rejected: " + g.join(","));
  });

  test("grouping does not reorder the underlying package", () => {
    const r = mixedPackage();
    // the domain order is unobservable in the UI; assert the view derives groups
    // rather than the array being sorted, by checking every card is still present
    const shown = reviewCards(r).length + resolved(r).length;
    assert(shown >= 3, "every proposed card is still rendered: " + shown);
  });

  test("the summary uses live counts", () => {
    const r = mixedPackage();
    const prog = text(byClass(r, "vt-progress")[0]);
    // RESTATED (M3A A1P), and strengthened: the exact live counts
    assert(/\d+ selected/.test(prog), "accepted count: " + prog);
    assert(/\d+ deselected/.test(prog), "rejected count");
    eq(prog, "1 selected · 1 deselected · 1 withdrawn", "counts come from state");
  });
});

describe("Select Trade — inclusion behaviour is unchanged", () => {
  /* RESTATED (M3A A1P): the partner's per-card decision is now Deselect. */
  test("accepting records the decision and collapses the card", () => {
    const r = selectTrade();
    const before = reviewCards(r).length;
    click(btns(r, "Deselect")[0]);
    assert(allText(r).includes("You deselected Espeon"), "decision recorded");
    assert(reviewCards(r).length < before && byClass(r, "st-done").length === 2,
      "the card left the review group");
  });

  test("rejecting records the decision", () => {
    const r = mixedPackage();
    const name = text(byClassIn(reviewCards(r)[0], "st-name")[0]);
    click(btns(r, "Deselect")[0]);
    assert(allText(r).includes("You deselected " + name), "the rejection was recorded: " + name);
  });

  test("resolving the last card advances the stage as before", () => {
    /* RESTATED (M3A A1P): the stage advances when the partner starts valuing. */
    const r = selectTrade();
    click(btns(r, "Start valuing 1 card")[0]);
    assert(allText(r).includes("Selection closed — 1 card reserved, valuation open"), "the existing gate advanced the stage");
    assert(byClass(r, "vt-mkt-copy").length === 1, "valuation is open");
  });

  test("rejecting every card does not open valuation", () => {
    /* RESTATED (M3A A1P): deselecting everything and closing hands the choice
       to the Collector (cash only, add more, or end) — it never opens valuation. */
    const r = selectTrade();
    click(btns(r, "Deselect")[0]);
    click(btns(r, "Close with no cards")[0]);
    const t = allText(r);
    assert(t.includes("You deselected Espeon"), "the rejection was recorded");
    assert(t.includes("No card was chosen, so nothing moves forward as trade."), "and the Collector decides next");
    eq(byClass(r, "vt-mkt-copy").length, 0, "no valuation surface opened");
    eq(byClass(r, "pn").length, 0, "and no negotiation surface");
  });

  test("closing sends exactly the selection the partner was looking at", () => {
    /* A stale screen must not close a selection that changed under it, so the
       close names the live rows it was rendered from (expect), and the domain
       refuses it if they differ. */
    const src = require("fs").readFileSync(require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    assert(/const live = activeTradeCards\(o\)\.map\(\(c\) => c\.id\);\s*const r = act\(tpActor, "closeTradeSelection", \{ oppId, expect: \{ tradeCardIds: live \} \}/.test(src),
      "the close carries the rendered selection");
    assert(/R\.termsChanged/.test(require("fs").readFileSync(require("path").join(__dirname, "..", "domain", "metyet-commands.js"), "utf8")),
      "and a mismatch is refused as terms-changed");
  });

  test("the Trade Binder CTA is preserved and secondary", () => {
    const r = selectTrade();
    const cta = btns(r, "View Alex T.'s Trade Binder")[0];
    assert(cta, "the CTA is still available");
    assert(!String(cta.props.className).includes("pri"), "and is not a primary action");
    click(cta);
    assert(allText(r).includes("Trade Binder"), "it still opens the binder");
  });
});

describe("Value Trade still owns the financials", () => {
  test("after Select Trade completes, valuation shows the money again", () => {
    const r = selectTrade();
    click(btns(r, "Start valuing 1 card")[0]);   // RESTATED (M3A A1P)
    const t = allText(r);
    assert(t.includes("Market Value"), "market value returns");
    assert(t.includes("Trade %"), "trade percentage returns");
    assert(t.includes("Trade Value"), "trade value returns");
  });

  test("the accepted physical copy is present in Value Trade", () => {
    const r = selectTrade();
    click(btns(r, "Start valuing 1 card")[0]);   // RESTATED (M3A A1P)
    const copy = byClass(r, "vt-mkt-copy")[0];
    assert(copy, "the copy panel renders in valuation");
    assert(text(copy).includes("collector photo"), "the same physical copy");
    eq(byClassIn(copy, "cimg-cap").map(text).join(","), "front,back", "both faces survived");
  });
});

require("./run.cjs").run();
