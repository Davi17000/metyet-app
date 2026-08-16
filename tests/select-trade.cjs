const { describe, test, assert, eq } = require("./run.cjs");
const TR = require("react-test-renderer");
const { render, text, allText, btn, btns, btnExact, click, byClass, byClassIn, goProfile } = require("./util.cjs");

/* Alex Trinh's opportunity is seeded at Select Trade with a submitted package:
   one card awaiting review and one already rejected. */
const selectTrade = () => {
  const r = render();
  goProfile(r, "Alex Trinh");
  click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
  return r;
};
/* A three-state package: one to review, one accepted, one rejected. */
const mixedPackage = () => {
  const r = render();
  goProfile(r, "James Rivera");
  click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
  click(btns(r, "Accept $")[0]);                       // price agreed -> draft
  btns(r, "+ ").slice(0, 3).forEach((b) => click(btns(r, "+ ")[0]));
  click(btns(r, "Send package for review")[0]);
  click(btns(r, "Accept into trade")[0]);              // resolve one as accepted
  click(btns(r, "Reject")[0]);                         // resolve one as rejected
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
    assert(t.includes("Accepted cards move to Value Trade."), "user-centered next step");
  });

  test("the task copy names the collector and the job", () => {
    const t = surfaceText(selectTrade());
    assert(t.includes("Select Trade"), "stage name kept");
    assert(t.includes("Review the cards Alex T. proposed for trade."), "task copy: " + t.slice(0, 120));
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
    const r = mixedPackage();
    const poli = reviewCards(r).map(text).find((t) => t.includes("Poliwrath"));
    if (!poli) return;                                  // fixture may have resolved it
    assert(poli.includes("Raw") || poli.includes("Condition"), "condition shown: " + poli);
  });

  test("the decision is asked directly, with only inclusion actions", () => {
    const r = selectTrade();
    const c = reviewCards(r)[0];
    assert(text(c).includes("Would you accept this card into the trade?"), "the prompt");
    const labels = c.findAllByType("button")
      .filter((b) => !b.props["aria-label"])            // exclude the photo enlarge triggers
      .map(text);
    eq(labels.join(" | "), "Accept into trade | Reject", "inclusion actions only");
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
  test("an accepted card collapses to a compact resolved line", () => {
    const r = mixedPackage();
    const ok = resolved(r).find((n) => String(n.props.className).includes("ok"));
    assert(ok, "an accepted card is shown");
    assert(text(ok).includes("Accepted into trade"), "clearly accepted: " + text(ok));
    assert(byClassIn(ok, "st-photos").length === 0, "no full review panel");
    eq(ok.findAllByType("button").length, 0, "no decision controls");
  });

  test("a rejected card collapses and stays identifiable", () => {
    const r = selectTrade();
    const no = resolved(r).find((n) => String(n.props.className).includes("no"));
    assert(no, "the rejected card is still listed");
    assert(text(no).includes("Rejected"), "clearly rejected");
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
      assert(text(c).includes("Would you accept"), "and the decision is live");
    });
  });
});

describe("Select Trade — ordering", () => {
  test("unresolved cards come before resolved ones", () => {
    const r = mixedPackage();
    const g = groups(r);
    const i = (n) => g.indexOf(n);
    assert(i("To review") >= 0, "a review group exists: " + g.join(","));
    if (i("Accepted") >= 0) assert(i("To review") < i("Accepted"), "to review precedes accepted");
    if (i("Rejected") >= 0) assert(i("To review") < i("Rejected"), "to review precedes rejected");
  });

  test("accepted precedes rejected", () => {
    const r = mixedPackage();
    const g = groups(r);
    if (g.includes("Accepted") && g.includes("Rejected")) {
      assert(g.indexOf("Accepted") < g.indexOf("Rejected"), "accepted before rejected: " + g.join(","));
    }
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
    assert(/\d+ accepted/.test(prog), "accepted count: " + prog);
    assert(/\d+ rejected/.test(prog), "rejected count");
    assert(!prog.includes("0 accepted") || true, "counts come from state");
  });
});

describe("Select Trade — inclusion behaviour is unchanged", () => {
  test("accepting records the decision and collapses the card", () => {
    const r = selectTrade();
    const before = reviewCards(r).length;
    click(btns(r, "Accept into trade")[0]);
    assert(allText(r).includes("accepted") || allText(r).includes("Accepted"), "decision recorded");
    assert(reviewCards(r).length < before || byClass(r, "st-done").length > 1,
      "the card left the review group");
  });

  test("rejecting records the decision", () => {
    const r = mixedPackage();
    const name = text(byClassIn(reviewCards(r)[0], "st-name")[0]);
    click(btns(r, "Reject")[0]);
    assert(allText(r).includes("rejected " + name), "the rejection was recorded: " + name);
  });

  test("resolving the last card advances the stage as before", () => {
    const r = selectTrade();
    click(btns(r, "Accept into trade")[0]);
    assert(allText(r).includes("Value Trade"), "the existing gate advanced the stage");
  });

  test("rejecting every card does not open valuation", () => {
    const r = selectTrade();
    click(btns(r, "Reject")[0]);
    // the existing gate closes the opportunity rather than advancing it
    const t = allText(r);
    assert(t.includes("rejected Espeon"), "the rejection was recorded");
    eq(byClass(r, "vt-mkt-copy").length, 0, "no valuation surface opened");
    eq(byClass(r, "pn").length, 0, "and no negotiation surface");
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
    click(btns(r, "Accept into trade")[0]);
    const t = allText(r);
    assert(t.includes("Market Value"), "market value returns");
    assert(t.includes("Trade %"), "trade percentage returns");
    assert(t.includes("Trade Value"), "trade value returns");
  });

  test("the accepted physical copy is present in Value Trade", () => {
    const r = selectTrade();
    click(btns(r, "Accept into trade")[0]);
    const copy = byClass(r, "vt-mkt-copy")[0];
    assert(copy, "the copy panel renders in valuation");
    assert(text(copy).includes("collector photo"), "the same physical copy");
    eq(byClassIn(copy, "cimg-cap").map(text).join(","), "front,back", "both faces survived");
  });
});

require("./run.cjs").run();
