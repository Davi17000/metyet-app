const { describe, test, assert, eq } = require("./run.cjs");
const { render, text, allText, btn, btns, btnExact, buttons, click, byClass, binderCounts, goProfile } = require("./util.cjs");

/* The binder toggle also reads "Open to trade", so opportunity rows are opened by
   exact label to avoid matching it. */
const openOpp = (r, n = 0) => click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[n]);
/* Every seeded select-trade opp already has a submitted package, so the draft
   surface is reached by letting the collector accept the asking price. */
const openDraftSelectTrade = (r, who) => {
  goProfile(r, who);
  openOpp(r, 0);
  click(btns(r, "Accept $")[0]);
  return r;
};
const addable = (r) => btns(r, "+ ").map((b) => text(b).replace("+", "").trim());
const cardOf = (toggle) => {
  let n = toggle;
  while (n && !(typeof n.type === "string" && String(n.props.className || "").split(/\s+/).includes("cp-bind"))) n = n.parent;
  return n;
};

/* Section headings in render order, so structural position is asserted against
   what the Trusted Partner actually sees rather than against source order. */
const sectionOrder = (r) => byClass(r, "cp-sec-h").map((n) => text(n).replace(/\s+/g, " ").trim());
const binderSection = (r) => byClass(r, "cp-bind");
const toggles = (r) => byClass(r, "cp-bind-x");
const heading = (r) => sectionOrder(r).find((h) => h.startsWith("Trade Binder"));

describe("Trade Binder — placement on the Collector Profile", () => {
  test("a collector with binder cards has a Trade Binder section", () => {
    const r = render();
    goProfile(r, "Alex Trinh");
    assert(heading(r), "no Trade Binder heading on the profile");
  });

  test("it leads the working sections, above both goal tiers", () => {
    const r = render();
    goProfile(r, "James Rivera");           // has secondary goals and an active opp
    const order = sectionOrder(r);
    const i = (p) => order.findIndex((h) => h.startsWith(p));
    const bind = i("Trade Binder"), pri = i("Primary Goals"), sec = i("Secondary Goals");
    assert(bind >= 0 && pri >= 0 && sec >= 0, "missing a section: " + JSON.stringify(order));
    assert(bind < pri, "collector-side supply comes before their demand");
    assert(pri < sec, "and primary intent still outranks secondary");
  });

  test("the existing profile sections are all still present and in order", () => {
    const r = render();
    goProfile(r, "James Rivera");
    const order = sectionOrder(r);
    const expected = ["Trade Binder", "Primary Goals", "Secondary Goals", "Active Opportunities", "History"];
    eq(order.map((h) => expected.find((e) => h.startsWith(e))).filter(Boolean).join("|"),
      expected.join("|"), "profile section order");
  });

  test("no separate Trade Binder nav destination was added", () => {
    const r = render();
    const nav = byClass(r, "sb-item").map((n) => text(n));
    eq(nav.length, 3, "sidebar item count");
    assert(!nav.some((n) => n.includes("Binder")), "binder must not become its own page");
  });
});

describe("Trade Binder — shows everything the collector shared", () => {
  test("Alex Trinh shows his existing binder cards", () => {
    const r = render();
    goProfile(r, "Alex Trinh");
    eq(binderSection(r).length, 2, "Alex's binder card count");
    const t = binderSection(r).map(text).join(" ");
    assert(t.includes("Espeon"), "expected Alex's binder cards to render, got: " + t);
  });

  test("unflagged cards stay visible, and the count is everything shared", () => {
    const r = render();
    goProfile(r, "James Rivera");           // t3 t19 t20 flagged, t4 not
    eq(binderSection(r).length, 5, "James's binder renders every shared card");
    eq(binderCounts(r).total, 5, "count is total shared, not total flagged");
    const off = toggles(r).filter((b) => b.props["aria-pressed"] === "false");
    eq(off.length, 2, "the unflagged cards are still rendered");
    assert(off.some((b) => text(cardOf(b)).includes("Poliwrath")), "unflagged card identity renders");
  });

  test("flagged cards visibly show standing interest", () => {
    const r = render();
    goProfile(r, "James Rivera");
    const on = toggles(r).filter((b) => b.props["aria-pressed"] === "true");
    eq(on.length, 3, "flagged card count");
    on.forEach((b) => {
      assert(text(b).includes("Open to trade"), "toggle label");
      assert(b.props.className.includes("on"), "flagged toggle carries its on state");
    });
  });

  test("a raw copy renders its full identity, without any value", () => {
    const r = render();
    goProfile(r, "James Rivera");
    const poli = binderSection(r).map(text).find((t) => t.includes("Poliwrath"));
    assert(poli.includes("Base Set"), "set renders: " + poli);
    assert(poli.includes("#13/102"), "printed number renders: " + poli);
    assert(poli.includes("Raw"), "Raw renders instead of a grade: " + poli);
    assert(poli.includes("Lightly Played"), "raw condition detail renders: " + poli);
    assert(poli.includes("Unlimited"), "edition renders: " + poli);
    assert(poli.includes("English"), "language renders: " + poli);
    assert(!/\$\d/.test(poli), "the collector's private value is not shown to the TP: " + poli);
  });

  test("a graded copy renders its grade rather than a raw condition", () => {
    const r = render();
    goProfile(r, "James Rivera");
    const graded = binderSection(r).map(text).find((t) => t.includes("Electabuzz"));
    assert(graded.includes("Base Set"), "set renders: " + graded);
    assert(graded.includes("#20/102"), "printed number renders: " + graded);
    assert(graded.includes("PSA 9"), "grade renders: " + graded);
    assert(!graded.includes("Raw"), "graded copies never say Raw: " + graded);
    assert(!/\$\d/.test(graded), "no private value on a graded tile either: " + graded);
  });

  test("the old 'Their $' wording is gone from the binder", () => {
    const r = render();
    goProfile(r, "James Rivera");
    const t = binderSection(r).map(text).join(" ");
    assert(!t.includes("Their $"), "old value wording removed");
    assert(!t.includes("Collector value"), "and the private reference value with it");
    assert(!/\$\d/.test(t), "no monetary value anywhere on the tiles: " + t);
  });

  test("stock artwork renders through the existing CardImage component", () => {
    const r = render();
    goProfile(r, "Alex Trinh");
    const imgs = binderSection(r).flatMap((n) => n.findAll(
      // token match: the missing-artwork placeholder has cimg-ph* children
      (x) => typeof x.type === "string" && String(x.props.className || "").split(/\s+/).includes("cimg"),
      { deep: true }));
    eq(imgs.length, 2, "one card image per binder card");
  });

  test("a collector with no shared cards gets the quiet empty state", () => {
    const r = render();
    click(btn(r, "Collector Network"));
    click(btn(r, "Invite collector"));
    const modal = byClass(r, "modal")[0] || r.root;
    const inputs = modal.findAllByType("input");
    const set = (idx, v) => require("react-test-renderer").act(() => {
      inputs[idx].props.onChange({ target: { value: v } });
    });
    set(0, "Wendy Okafor"); set(1, "wendy@example.com"); set(2, "Fargo, ND");
    click(btn(r, "Send invitation"));
    click(btnExact(r, "Wendy Okafor"));
    eq(binderSection(r).length, 0, "no binder cards");
    eq(binderCounts(r).total, 0, "count is zero");
    eq(binderCounts(r).open, null, "no open-to-trade count on an empty binder");
    assert(allText(r).includes("No cards shared in their trade binder."), "empty state copy");
  });
});

describe("Trade Binder — standing interest writes to tpInterest", () => {
  test("Open to trade toggles on and off", () => {
    const r = render();
    goProfile(r, "James Rivera");
    const off = () => toggles(r).filter((b) => b.props["aria-pressed"] === "false");
    const start = off().length;
    assert(start > 0, "there is something unflagged to toggle");

    click(off()[0]);
    eq(off().length, start - 1, "toggled on");
    eq(toggles(r).filter((b) => b.props["aria-pressed"] === "true").length, 5 - (start - 1), "one more flagged");

    const on = toggles(r).filter((b) => b.props["aria-pressed"] === "true");
    click(on[0]);
    eq(toggles(r).filter((b) => b.props["aria-pressed"] === "false").length, start, "toggled back off");
  });

  test("toggling never adds or removes a binder card", () => {
    const r = render();
    goProfile(r, "James Rivera");
    const before = binderSection(r).length;
    click(toggles(r)[0]);
    eq(binderSection(r).length, before, "binder card count is unaffected by interest");
    eq(binderCounts(r).total, 5, "heading total is unaffected by interest");
  });

  test("the binder exposes no valuation or negotiation controls", () => {
    const r = render();
    goProfile(r, "James Rivera");
    const t = binderSection(r).map(text).join(" ");
    for (const banned of ["Trade %", "Trade Credit", "Agreed", "Counter", "Accept", "Reject",
      "Include", "Approve", "Select", "Withdraw", "Stage", "Offer", "Cash"]) {
      assert(!t.includes(banned), `binder must not surface "${banned}"`);
    }
    const controls = binderSection(r).flatMap((n) => n.findAllByType("input").concat(n.findAllByType("select")));
    eq(controls.length, 0, "no inputs or selects on the card faces");
    // two controls per card: inspect the copy, and the standing-interest toggle
    eq(binderSection(r).flatMap((n) => n.findAllByType("button")).length, 10, "view + toggle per card");
    eq(byClass(r, "cp-bind-view").length, 5, "one inspect control per card");
  });
});

describe("Select Trade — eligibility still derives from tpInterest", () => {
  test("only cards flagged Open to trade are addable in Select Trade", () => {
    const r = render();
    openDraftSelectTrade(r, "James Rivera");
    assert(allText(r).includes("Add an eligible card"), "reached the Select Trade draft");
    const names = addable(r);
    assert(names.length === 3, "three flagged cards are addable, got: " + names.join(","));
    assert(!names.includes("Poliwrath"), "the unflagged card must not be addable: " + names.join(","));
  });

  test("flagging from the profile makes that card addable afterwards", () => {
    const r = render();
    goProfile(r, "James Rivera");
    const off = toggles(r).filter((b) => b.props["aria-pressed"] === "false");
    const poli = off.find((b) => text(cardOf(b)).includes("Poliwrath"));
    assert(poli, "Poliwrath is unflagged to begin with");
    click(poli);
    openOpp(r, 0);
    click(btns(r, "Accept $")[0]);
    assert(addable(r).includes("Poliwrath"), "newly flagged card became eligible: " + addable(r).join(","));
  });

  test("unflagging from the profile removes eligibility afterwards", () => {
    const r = render();
    goProfile(r, "James Rivera");
    const on = toggles(r).filter((b) => b.props["aria-pressed"] === "true");
    const name = ["Electabuzz", "Chansey", "Scyther"].find((n) => text(cardOf(on[0])).includes(n));
    assert(name, "picked a flagged card to unflag");
    click(on[0]);
    openOpp(r, 0);
    click(btns(r, "Accept $")[0]);
    assert(!addable(r).includes(name), name + " should no longer be eligible: " + addable(r).join(","));
  });

  test("adding a binder card into a deal keeps its binder identity", () => {
    const r = render();
    openDraftSelectTrade(r, "James Rivera");
    const first = btns(r, "+ ")[0];
    const name = text(first).replace("+", "").trim();
    click(first);
    // Select Trade is now a card-review surface rather than a table
    const review = byClass(r, "st-card").map(text).join(" ");
    assert(review.includes(name), "the added card appears in the review: " + review.slice(0, 120));
    // the binder copy's own photos came with it, which is the continuity that matters here
    assert(byClass(r, "st-photos").length >= 1, "its front/back copy photos came along");
    assert(review.includes("collector photo"), "showing the collector's actual copy");
  });
});

describe("Select Trade — the Trade Binder CTA", () => {
  const openSelectTrade = (r, name) => { goProfile(r, name); openOpp(r, 0); return r; };

  test("the old Flag more CTA is gone", () => {
    const r = render();
    openSelectTrade(r, "Alex Trinh");
    assert(!allText(r).includes("Flag more"), "old CTA wording must be removed");
    assert(!allText(r).includes("Would consider"), "old flag label must be removed");
  });

  test("the CTA reads View [Collector]'s Trade Binder with a dynamic name", () => {
    const r = render();
    openSelectTrade(r, "Alex Trinh");
    eq(btns(r, "View Alex T.'s Trade Binder").length, 1, "Alex's CTA renders once");
    const r2 = render();
    goProfile(r2, "James Rivera");
    openOpp(r2, 1);                                  // James's Value Trade opportunity
    eq(btns(r2, "View James R.'s Trade Binder").length, 1, "name is dynamic per collector");
  });

  test("clicking it closes the workspace and lands on that collector's binder", () => {
    const r = render();
    openSelectTrade(r, "Alex Trinh");
    assert(byClass(r, "ws-stagework").length > 0, "workspace is open before the click");
    click(btn(r, "View Alex T.'s Trade Binder"));
    eq(byClass(r, "ws-stagework").length, 0, "workspace closed");
    assert(allText(r).includes("Alex Trinh"), "landed on the collector profile");
    assert(heading(r), "the Trade Binder section is present on arrival");
    eq(binderSection(r).length, 2, "Alex's binder rendered");
  });

  test("arriving from the CTA marks the binder section as the focus target", () => {
    const r = render();
    openSelectTrade(r, "Alex Trinh");
    click(btn(r, "View Alex T.'s Trade Binder"));
    const sec = byClass(r, "cp-sec").find((n) => text(n).startsWith("Trade Binder"));
    assert(sec, "binder section found");
    eq(sec.props.tabIndex, -1, "section is focusable for the scroll-into-view landing");
  });
});

describe("Regression — untouched surfaces still work", () => {
  test("the three main sections still render", () => {
    const r = render();
    assert(allText(r).includes("Opportunities"), "opportunities");
    click(btn(r, "Inventory"));
    assert(allText(r).includes("Add card"), "inventory");
    click(btn(r, "Collector Network"));
    assert(allText(r).includes("Invite collector"), "collectors");
  });

  test("Value Trade, Deal and Fulfillment workspaces still open", () => {
    for (const [who, marker] of [["Hiro Tanaka", "Value Trade"], ["Nina Alvarez", "Deal"], ["Casey Lin", "Fulfillment"]]) {
      const r = render();
      goProfile(r, who);
      click(btn(r, "Open"));
      assert(allText(r).includes(marker), `${who} → ${marker}`);
    }
  });

  test("goals and history on the profile are unchanged", () => {
    const r = render();
    goProfile(r, "Alex Trinh");
    assert(allText(r).includes("Primary Goals"), "primary goals");
    assert(allText(r).includes("Secondary Goals"), "secondary goals");
    assert(allText(r).includes("History"), "history");
    click(btn(r, "History"));
    assert(allText(r).includes("completed deal"), "history expands");
  });
});

require("./run.cjs").run();
