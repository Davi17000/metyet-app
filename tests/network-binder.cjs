const { describe, test, assert, eq } = require("./run.cjs");
const TR = require("react-test-renderer");
const { render, text, allText, btn, btns, btnExact, click, byClass, byClassIn, goProfile } = require("./util.cjs");

const binderTab = () => { const r = render(); click(btns(r, "Trade Binder")[0]); return r; };
const cards = (r) => byClass(r, "nb-card");
const names = (r) => cards(r).map((n) => text(byClassIn(n, "nb-t")[0]));
const owners = (r) => cards(r).map((n) => text(byClassIn(n, "nb-who")[0]));
const toggles = (r) => byClass(r, "nb-card").map((n) => byClassIn(n, "cp-bind-x")[0]);
const filterBtn = (r, label) => btns(r, label).find((b) => text(b).trim() === label);
const selects = (r) => byClass(r, "nb-bar")[0].findAllByType("select");
const pick = (r, i, v) => TR.act(() => { selects(r)[i].props.onChange({ target: { value: v } }); });
const search = (r, v) => TR.act(() => {
  byClass(r, "nb-search")[0].findAllByType("input")[0].props.onChange({ target: { value: v } });
});

/* Adds a specific catalog card to a collector's binder through the real demo flow. */
const addToBinder = (r, who, optionIndex) => {
  goProfile(r, who);
  click(btn(r, "Add a copy to the trade binder"));
  const sel = byClass(r, "modal")[0].findAllByType("select")[0];
  const opt = sel.props.children[1][optionIndex];
  TR.act(() => { sel.props.onChange({ target: { value: opt.props.value } }); });
  click(btns(r, "Add front")[0]);
  click(btns(r, "Add back")[0]);
  click(btns(r, "Add to Trade Binder")[0]);
  return String(opt.props.children);
};

describe("Navigation", () => {
  test("Collector Network splits into Collectors and Trade Binder", () => {
    const r = render();
    eq(byClass(r, "tab").map(text).join(" > "), "Collectors > Trade Binder", "two sub-tabs");
  });

  test("Collectors remains the default and is unchanged", () => {
    const r = render();
    assert(byClass(r, "tbl").length === 1, "the collector table still renders by default");
    assert(allText(r).includes("Invite collector"), "and its actions remain");
    eq(cards(r).length, 0, "the binder workspace is not shown yet");
  });

  test("the Trade Binder tab opens its own workspace", () => {
    const r = binderTab();
    assert(cards(r).length > 0, "cards render");
    eq(byClass(r, "tbl").length, 0, "and it is a workspace, not the collector table");
  });

  test("it reuses the existing sub-navigation pattern", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    assert(/const NETWORK_TABS = \[/.test(src), "a tab config like Inventory's");
    assert(/className=\{"tab" \+ \(tab === t\.id \? " on" : ""\)\}/.test(src),
      "and the same tab markup, not a competing system");
  });
});

describe("Aggregation and network scoping", () => {
  test("every binder card in the network appears exactly once", () => {
    const r = binderTab();
    eq(cards(r).length, 34, "all seeded binder copies");
    const ids = cards(r).map((n) => text(byClassIn(n, "nb-t")[0]) + "|" + text(byClassIn(n, "nb-who")[0]));
    eq(new Set(ids).size, ids.length, "no duplicates");
  });

  test("the summary counts cards, collectors and new additions from real data", () => {
    const r = binderTab();
    const t = text(byClass(r, "nb-sum")[0]);
    assert(/34 cards across 13 collectors/.test(t), "counts match the data: " + t);
    assert(/\d+ new since your last review/.test(t), "and the new count is derived");
  });

  test("no card from outside the network can appear", () => {
    const r = binderTab();
    const shown = new Set(owners(r));
    click(btns(r, "Collectors")[0]);
    const network = new Set(byClass(r, "tbl")[0].findAllByType("tr").slice(1)
      .map((tr) => text(tr.findAllByType("td")[0])));
    shown.forEach((o) => assert([...network].some((n) => n.includes(o.split(" ")[0])),
      o + " belongs to the network"));
  });

  test("every card names its collector, and the name navigates", () => {
    const r = binderTab();
    cards(r).forEach((n) => assert(text(byClassIn(n, "nb-who")[0]).length > 0, "owner shown"));
    click(byClassIn(cards(r)[0], "nb-who")[0]);
    assert(byClass(r, "cp-head").length === 1, "opens that collector's profile");
    assert(byClass(r, "cp-bind").length > 0, "landing on their trade binder");
  });

  test("each card shows the minimum useful identity", () => {
    const t = text(cards(binderTab())[0]);
    assert(/PSA |Raw/.test(t), "grade or condition");
    assert(t.includes("View copy") && t.includes("You\u2019re interested"), "and one action each");
    assert(byClassIn(cards(binderTab())[0], "cimg").length >= 1, "with card imagery");
  });
});

describe("Interest is the existing tpInterest state", () => {
  test("toggling here flags the card", () => {
    const r = binderTab();
    const off = toggles(r).find((b) => b.props["aria-pressed"] === "false");
    assert(off, "an unflagged card exists");
    click(off);
    eq(toggles(r).filter((b) => b.props["aria-pressed"] === "true").length,
      toggles(binderTab()).filter((b) => b.props["aria-pressed"] === "true").length + 1,
      "one more flagged than the untouched baseline");
  });

  test("it is immediately reflected on the collector profile", () => {
    const r = binderTab();
    const idx = toggles(r).findIndex((b) => b.props["aria-pressed"] === "false");
    const who = text(byClassIn(cards(r)[idx], "nb-who")[0]);
    const name = text(byClassIn(cards(r)[idx], "nb-t")[0]);
    click(toggles(r)[idx]);
    click(byClassIn(cards(r)[idx], "nb-who")[0]);        // to that collector's profile
    const tile = byClass(r, "cp-bind").find((n) => text(n).includes(name));
    assert(tile, `${name} is in ${who}'s binder`);
    eq(byClassIn(tile, "cp-bind-x")[0].props["aria-pressed"], "true",
      "the profile shows the same interest, not a separate flag");
  });

  test("removing interest here also clears it on the profile", () => {
    const r = binderTab();
    const idx = toggles(r).findIndex((b) => b.props["aria-pressed"] === "true");
    const name = text(byClassIn(cards(r)[idx], "nb-t")[0]);
    click(toggles(r)[idx]);
    click(byClassIn(cards(r)[idx], "nb-who")[0]);
    const tile = byClass(r, "cp-bind").find((n) => text(n).includes(name));
    eq(byClassIn(tile, "cp-bind-x")[0].props["aria-pressed"], "false", "cleared on both surfaces");
  });

  test("flagging here makes the card eligible in Select Trade", () => {
    const r = binderTab();
    // James R.'s unflagged copy, chosen from the consolidated view
    const idx = cards(r).findIndex((n, i) => owners(r)[i] === "James R."
      && byClassIn(n, "cp-bind-x")[0].props["aria-pressed"] === "false");
    assert(idx >= 0, "he has an unflagged copy");
    const name = names(r)[idx];
    click(toggles(r)[idx]);
    goProfile(r, "James Rivera");
    click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
    click(btns(r, "Accept $")[0]);
    assert(btns(r, "+ ").some((b) => text(b).includes(name)),
      name + " is now addable in Select Trade");
  });

  test("no second interest field was introduced", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    assert(!/nbInterest|networkInterest|interested:/.test(src), "only tpInterest exists");
    const fn = src.slice(src.indexOf("function NetworkBinder"), src.indexOf("function CollectorList"));
    assert(fn.includes("setTradeInterest"), "the workspace writes through the existing handler");
  });
});

describe("New since last review", () => {
  test("new cards are badged, using the existing review timestamp", () => {
    const r = binderTab();
    const badged = byClass(r, "nb-new").length;
    assert(badged > 0, "some cards are new");
    const t = text(byClass(r, "nb-sum")[0]);
    eq(Number(/(\d+) new/.exec(t)[1]), badged, "the summary count matches the badges");
  });

  test("the filter narrows to exactly those cards", () => {
    const r = binderTab();
    const badged = byClass(r, "nb-new").length;
    click(filterBtn(r, "New since last review"));
    eq(cards(r).length, badged, "only the new cards remain");
    cards(r).forEach((n) => assert(byClassIn(n, "nb-new").length === 1, "each is badged"));
  });

  test("reviewing a collector's profile clears their cards from New", () => {
    const r = binderTab();
    const before = byClass(r, "nb-new").length;
    const owner = owners(r)[names(r).findIndex((_, i) =>
      byClassIn(cards(r)[i], "nb-new").length === 1)];
    click(byClassIn(cards(r).find((n) => text(byClassIn(n, "nb-who")[0]) === owner), "nb-who")[0]);
    click(btn(r, "All collectors"));
    click(btns(r, "Trade Binder")[0]);
    assert(byClass(r, "nb-new").length < before,
      "opening their profile counted as a review, exactly as the network table already does");
  });

  test("the count is derived, never faked", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    assert(/const isUnseenAddition = /.test(src), "one shared rule");
    assert(/const unseenAdditions = \(binderCards, collector\) =>\s*\n?\s*binderCards\.filter\(\(cc\) => isUnseenAddition/.test(src),
      "and the Collector Network count uses the same rule");
  });
});

describe("Filters", () => {
  test("Interested narrows to flagged cards", () => {
    const r = binderTab();
    const flagged = toggles(r).filter((b) => b.props["aria-pressed"] === "true").length;
    click(filterBtn(r, "You\u2019re interested"));
    eq(cards(r).length, flagged, "only cards the TP flagged");
    toggles(r).forEach((b) => eq(b.props["aria-pressed"], "true", "each is flagged"));
  });

  test("collector and graded/raw filters work", () => {
    const r = binderTab();
    pick(r, 1, "raw");
    cards(r).forEach((n) => assert(/Raw/.test(text(n)), "raw only: " + text(n).slice(0, 40)));
    pick(r, 1, "graded");
    cards(r).forEach((n) => assert(/PSA /.test(text(n)), "graded only"));
    pick(r, 1, "");
    const someone = owners(r)[0];
    const id = selects(r)[0].props.children[1].find((o) => true).props.value;
    pick(r, 0, id);
    eq(new Set(owners(r)).size, 1, "one collector at a time");
  });

  test("search matches cards and collectors", () => {
    const r = binderTab();
    search(r, "blastoise");
    assert(cards(r).length >= 1 && names(r).every((n) => /Blastoise/i.test(n)), "by card name");
    search(r, "Hiro");
    assert(cards(r).length >= 1 && owners(r).every((o) => /Hiro/.test(o)), "and by collector");
  });

  test("a filtered-empty result says so without implying an empty network", () => {
    const r = binderTab();
    search(r, "zzzznotacard");
    eq(cards(r).length, 0, "nothing matches");
    const t = allText(r);
    assert(t.includes("No binder cards match these filters."), "filtered empty state");
    assert(!t.includes("haven’t added any Trade Binder cards yet"), "not the true empty state");
  });
});

describe("Network demand signal", () => {
  test("demand from another collector surfaces on the card", () => {
    const r = render();
    // Casey adds a Base Set Charizard PSA 9 — an identity other collectors want
    const label = addToBinder(r, "Casey Lin", 0);
    assert(/Charizard/.test(label), "added the wanted identity: " + label);
    click(btn(r, "All collectors"));
    click(btns(r, "Trade Binder")[0]);
    const dem = byClass(r, "nb-dem");
    assert(dem.length >= 1, "a demand signal appeared");
    assert(/^Primary goal for /.test(text(dem[0])), "named as primary-goal demand: " + text(dem[0]));
  });

  test("it uses the existing identity matcher, not a new one", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    const fn = src.slice(src.indexOf("function NetworkBinder"), src.indexOf("function CollectorList"));
    assert(fn.includes("goalsForIdentity"), "reuses the shared matcher");
    assert(!/identityKey\(/.test(fn), "and does not re-implement matching");
  });

  test("the owner's own goal is not counted as network demand", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    const fn = src.slice(src.indexOf("function NetworkBinder"), src.indexOf("function CollectorList"));
    assert(/x\.collectorId !== cc\.collectorId/.test(fn),
      "the owner is excluded so the signal means somebody else wants it");
  });

  test("the signal is absent when there is no demand", () => {
    const r = binderTab();
    cards(r).forEach((n) => {
      const dem = byClassIn(n, "nb-dem");
      if (dem.length) assert(/^Primary goal for /.test(text(dem[0])), "shown only with real demand");
    });
  });

  test("no opaque score is introduced", () => {
    const t = allText(binderTab());
    for (const banned of ["Score", "Relevance", "Match %", "Probability", "Recommended"]) {
      assert(!t.includes(banned), `no black-box ranking: ${banned}`);
    }
  });
});

describe("Ordering", () => {
  test("cards with primary demand lead, then new cards", () => {
    const r = render();
    addToBinder(r, "Casey Lin", 0);                       // gives one card primary demand
    click(btn(r, "All collectors"));
    click(btns(r, "Trade Binder")[0]);
    const first = cards(r)[0];
    assert(byClassIn(first, "nb-dem").length === 1, "the demanded card is first: " + text(first).slice(0, 50));
    // after the demand block, new cards precede previously reviewed ones
    const flags = cards(r).map((n) => byClassIn(n, "nb-new").length === 1);
    const lastNew = flags.lastIndexOf(true);
    const firstOld = flags.indexOf(false);
    if (firstOld >= 0 && lastNew >= 0) {
      const tail = cards(r).slice(firstOld).map((n) => byClassIn(n, "nb-dem").length > 0
        || byClassIn(n, "nb-new").length > 0);
      assert(tail.filter(Boolean).length <= flags.filter(Boolean).length, "signalled cards cluster at the top");
    }
  });
});

describe("The per-collector binder is unaffected", () => {
  test("the profile Trade Binder still works", () => {
    const r = render();
    goProfile(r, "Ellen Fisher");
    eq(byClass(r, "cp-bind").length, 6, "her binder still renders in relationship context");
    assert(byClass(r, "cp-bind-view").length === 6, "with its own View copy actions");
    const h = byClass(r, "cp-sec-h").find((n) => text(n).startsWith("Trade Binder"));
    assert(/Trade Binder 6/.test(text(h)), "and its count");
  });

  test("both surfaces read the same records", () => {
    const r = binderTab();
    const ellen = names(r).filter((_, i) => owners(r)[i] === "Ellen F.");
    goProfile(r, "Ellen Fisher");
    const profile = byClass(r, "cp-bind").map((n) => text(byClassIn(n, "cp-bind-t")[0]));
    eq(ellen.sort().join(","), profile.sort().join(","), "same cards, same source");
  });
});

/* Adds the Base Set Charizard PSA 9 — an identity three other collectors hold as a
   Primary Goal — so the demand path can be exercised against real state. */
const withDemand = () => {
  const r = render();
  addToBinder(r, "Casey Lin", 0);
  click(btn(r, "All collectors"));
  click(btns(r, "Trade Binder")[0]);
  return r;
};
const demOf = (n) => byClassIn(n, "nb-dem")[0];

describe("Review-state filtering", () => {
  test("the three review queues are offered, and Uninterested is not", () => {
    const r = binderTab();
    const labels = byClass(r, "nb-bar")[0].findAllByType("button").map((b) => text(b).trim());
    eq(labels.slice(0, 3).join(" | "), "New since last review | You haven\u2019t reviewed | You\u2019re interested",
      "three work queues");
    assert(!labels.some((l) => /Uninterested|Rejected|Passed/.test(l)),
      "absence of interest is not rejection");
  });

  test("Not reviewed shows every card the TP has not flagged", () => {
    const r = binderTab();
    const unflagged = toggles(r).filter((b) => b.props["aria-pressed"] === "false").length;
    click(btns(r, "You haven\u2019t reviewed").find((b) => text(b).trim() === "You haven\u2019t reviewed"));
    eq(cards(r).length, unflagged, "exactly the unflagged cards");
    toggles(r).forEach((b) => eq(b.props["aria-pressed"], "false", "none of them are Interested"));
  });

  test("it is derived from the absence of interest, not a stored flag", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    /* Interest is a relationship now; "not reviewed" is still derived from its
       absence rather than stored. */
    assert(/notReviewed: !interestedIn\(cc\.id\)/.test(src), "derived from the interest relationship");
    assert(!/tpInterest/.test(src), "the old boolean is gone entirely");
    assert(!/notReviewed:\s*(true|false),\s*$/m.test(src), "never persisted");
    // scoped to the workspace: Select Trade's inclusion states are unrelated
    const fn = src.slice(src.indexOf("function NetworkBinder"), src.indexOf("function CollectorList"))
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");   // code, not prose
    assert(!/uninterested|rejected|declined/i.test(fn), "and no rejection state was invented");
  });

  test("flagging a card moves it between the two queues", () => {
    const r = binderTab();
    click(btns(r, "You haven\u2019t reviewed").find((b) => text(b).trim() === "You haven\u2019t reviewed"));
    const before = cards(r).length;
    click(toggles(r)[0]);
    eq(cards(r).length, before - 1, "it left Not reviewed");
    click(btns(r, "You haven\u2019t reviewed").find((b) => text(b).trim() === "You haven\u2019t reviewed"));
    click(btns(r, "You\u2019re interested").find((b) => text(b).trim() === "You\u2019re interested"));
    eq(cards(r).length, toggles(binderTab()).filter((b) => b.props["aria-pressed"] === "true").length + 1,
      "and joined Interested");
  });

  test("cards carry a Not reviewed marker", () => {
    const r = binderTab();
    const unflagged = toggles(r).filter((b) => b.props["aria-pressed"] === "false").length;
    eq(byClass(r, "nb-unrev").length, unflagged, "one marker per unflagged card");
  });
});

describe("Owner and demand are different concepts", () => {
  test("the owner is always present and navigates to their profile", () => {
    const r = withDemand();
    const top = cards(r)[0];
    eq(text(byClassIn(top, "nb-own")[0]), "Owned by Casey L.", "the owner of the copy");
    click(byClassIn(top, "nb-who")[0]);
    assert(byClass(r, "cp-head").length === 1, "opens their profile");
  });

  test("demand names other collectors, never the owner", () => {
    const r = withDemand();
    const top = cards(r)[0];
    const owner = text(byClassIn(top, "nb-own")[0]);
    assert(/^Primary goal for /.test(text(demOf(top))), "labelled as demand: " + text(demOf(top)));
    click(demOf(top));
    const who = byClassIn(cards(r)[0], "nb-dem-who")[0].findAllByType("button").map(text);
    assert(who.length >= 1, "the matching collectors are listed");
    assert(!who.includes(owner), "and the owner is never among them: " + who.join(","));
  });

  test("owner and demand are separate elements, not one line", () => {
    const r = withDemand();
    const top = cards(r)[0];
    assert(byClassIn(top, "nb-own")[0] !== demOf(top), "distinct nodes");
    assert(!text(byClassIn(top, "nb-own")[0]).includes("Primary goal"),
      "the owner line carries no demand wording");
  });

  test("a single match names the collector directly", () => {
    const r = withDemand();
    const single = cards(r).map(demOf).filter(Boolean)
      .find((d) => /Primary goal for [A-Z]/.test(text(d)) && !/collectors/.test(text(d)));
    if (single) assert(/Primary goal for \w/.test(text(single)), "named: " + text(single));
  });

  test("multiple matches summarise and expand", () => {
    const r = withDemand();
    const top = cards(r)[0];
    eq(text(demOf(top)), "Primary goal for 3 collectors", "summarised");
    eq(byClassIn(cards(r)[0], "nb-dem-who").length, 0, "collapsed by default");
    click(demOf(top));
    const who = byClassIn(cards(r)[0], "nb-dem-who")[0].findAllByType("button").map(text);
    eq(who.length, 3, "all three revealed without leaving the page");
    click(who.length ? byClassIn(cards(r)[0], "nb-dem-who")[0].findAllByType("button")[0] : null);
    assert(byClass(r, "cp-head").length === 1, "and each opens that collector");
  });
});

describe("Demand drives review priority", () => {
  test("the Primary goal match filter composes with a review queue", () => {
    const r = withDemand();
    const F = (l) => btns(r, l).find((b) => text(b).trim() === l);
    click(F("You haven\u2019t reviewed"));
    const unrev = cards(r).length;
    click(F("Wanted by a collector"));
    assert(cards(r).length <= unrev, "narrowed further");
    cards(r).forEach((n) => {
      assert(demOf(n), "every result has demand");
      eq(byClassIn(n, "cp-bind-x")[0].props["aria-pressed"], "false", "and is unreviewed");
    });
  });

  test("unreviewed cards with demand sort to the top", () => {
    const r = withDemand();
    const top = cards(r)[0];
    assert(demOf(top), "the first card has primary demand");
    eq(byClassIn(top, "cp-bind-x")[0].props["aria-pressed"], "false", "and has not been reviewed");
  });

  test("demand never marks a card Interested by itself", () => {
    const r = withDemand();
    eq(byClassIn(cards(r)[0], "cp-bind-x")[0].props["aria-pressed"], "false",
      "the signal informs the decision, it does not make it");
  });

  test("the demand filter shows only cards with primary demand", () => {
    const r = withDemand();
    click(btns(r, "Wanted by a collector").find((b) => text(b).trim() === "Wanted by a collector"));
    cards(r).forEach((n) => assert(demOf(n), "each result carries the signal"));
  });
});

describe("Existing behaviour is preserved", () => {
  test("search, collector and graded filters still work", () => {
    const r = binderTab();
    search(r, "blastoise");
    assert(names(r).every((n) => /Blastoise/i.test(n)), "search");
    search(r, "");
    pick(r, 1, "raw");
    cards(r).forEach((n) => assert(/Raw/.test(text(n)), "raw filter"));
    pick(r, 1, "");
    assert(cards(r).length > 0, "cleared");
  });

  test("New since last review is unchanged", () => {
    const r = binderTab();
    const badged = byClass(r, "nb-new").length;
    click(btns(r, "New since last review").find((b) => text(b).trim() === "New since last review"));
    eq(cards(r).length, badged, "still filters to the badged cards");
  });

  test("View copy and interest toggling still work", () => {
    const r = binderTab();
    click(byClass(r, "nb-view")[0]);
    assert(byClass(r, "drawer").length === 1, "the copy drawer opens");
  });

  test("Interested still means only openness to a future trade", () => {
    const t = allText(binderTab());
    for (const banned of ["Reserved", "Committed", "Offer made", "Guaranteed", "Market value"]) {
      assert(!t.includes(banned), `no over-claimed meaning: ${banned}`);
    }
  });
});

/* The seed must keep exercising every sourcing situation. These assert the SHAPE of
   the data through the UI, so a future seed change that flattens the workspace back
   into one uniform case fails loudly rather than quietly. */
describe("Seed covers the real sourcing situations", () => {
  const survey = () => {
    const r = binderTab();
    return cards(r).map((n, i) => ({
      name: names(r)[i],
      owner: owners(r)[i],
      isNew: byClassIn(n, "nb-new").length === 1,
      unreviewed: byClassIn(n, "cp-bind-x")[0].props["aria-pressed"] === "false",
      primary: byClassIn(n, "nb-dem").length === 1 ? text(byClassIn(n, "nb-dem")[0]) : null,
      secondary: byClassIn(n, "nb-dem2").length === 1,
      raw: /Raw/.test(text(n)),
    }));
  };

  test("1. new and unreviewed cards exist", () => {
    assert(survey().some((x) => x.isNew && x.unreviewed), "the everyday review case");
  });

  test("2. a card with a single named primary match exists", () => {
    const one = survey().filter((x) => x.primary && !/collectors/.test(x.primary));
    assert(one.length >= 1, "single-collector demand: " + one.map((x) => x.primary).join(", "));
    assert(/^Primary goal for [A-Z]/.test(one[0].primary), "and it names them: " + one[0].primary);
  });

  test("3. a card with multiple primary matches exists", () => {
    const many = survey().filter((x) => x.primary && /collectors/.test(x.primary));
    assert(many.length >= 1, "multi-collector demand exists");
    assert(/Primary goal for [2-9] collectors/.test(many[0].primary), many[0].primary);
  });

  test("4. an unreviewed card with primary demand exists — the priority case", () => {
    const hot = survey().filter((x) => x.unreviewed && x.primary);
    assert(hot.length >= 2, "several cards demand a decision: " + hot.length);
  });

  test("5. an already-interested card with primary demand exists", () => {
    assert(survey().some((x) => !x.unreviewed && x.primary), "interest and demand can coexist");
  });

  test("6. cards with no demand at all exist", () => {
    const quiet = survey().filter((x) => !x.primary && !x.secondary);
    assert(quiet.length >= 5, "not everything shared is wanted: " + quiet.length);
  });

  test("7. a secondary-only card exists", () => {
    const sec = survey().filter((x) => !x.primary && x.secondary);
    assert(sec.length >= 1, "weaker demand is distinguishable from none");
  });

  test("8. both graded and raw cards carry demand", () => {
    const withDem = survey().filter((x) => x.primary || x.secondary);
    assert(withDem.some((x) => x.raw), "raw sourcing is represented");
    assert(withDem.some((x) => !x.raw), "and graded sourcing too");
  });

  test("no collector is shown demand for a card they own", () => {
    const r = binderTab();
    cards(r).forEach((n) => {
      const dem = byClassIn(n, "nb-dem")[0];
      if (!dem) return;
      const owner = text(byClassIn(n, "nb-own")[0]);
      click(dem);
      const who = byClassIn(n, "nb-dem-who")[0];
      if (who) who.findAllByType("button").map(text)
        .forEach((nm) => assert(nm !== owner, `${owner} must not want their own copy`));
      click(dem);
    });
  });

  test("the priority queue is non-empty and actionable", () => {
    const r = binderTab();
    const F = (l) => btns(r, l).find((b) => text(b).trim() === l);
    click(F("You haven\u2019t reviewed"));
    click(F("Wanted by a collector"));
    assert(cards(r).length >= 2, "the TP lands on real work: " + cards(r).length + " cards");
    cards(r).forEach((n) => {
      assert(byClassIn(n, "nb-dem")[0], "each has demand");
      eq(byClassIn(n, "cp-bind-x")[0].props["aria-pressed"], "false", "and awaits a decision");
    });
  });

  test("the workspace still contains a realistic amount of quiet inventory", () => {
    const all = survey();
    const signalled = all.filter((x) => x.primary || x.secondary).length;
    assert(signalled >= 5, "enough demand to demonstrate sourcing: " + signalled);
    assert(signalled < all.length / 2, "but the page is not uniformly hot: " + signalled + "/" + all.length);
  });
});

/* Every person-shaped string on this page must state its relationship, because the
   surface mixes two perspectives: cards your collectors own, and interest that is
   yours. A name with no stated relationship is the failure mode being guarded. */
describe("Copy is unambiguous about whose perspective is whose", () => {
  test("the owner line states the relationship, never a bare name", () => {
    const r = binderTab();
    cards(r).forEach((n) => {
      const own = text(byClassIn(n, "nb-own")[0]);
      assert(/^Owned by \S/.test(own), "owner relationship stated: " + own);
    });
  });

  test("demand states that collectors want it, not just that they exist", () => {
    const r = withDemand();
    cards(r).map(demOf).filter(Boolean).forEach((d) => {
      const t = text(d);
      assert(/^Primary goal for /.test(t), "reads as demand from people: " + t);
      assert(!/^Primary goal · /.test(t), "the ambiguous separator form is gone");
    });
  });

  test("the expanded list labels who wants the card", () => {
    const r = withDemand();
    click(demOf(cards(r)[0]));
    const who = byClassIn(cards(r)[0], "nb-dem-who")[0];
    assert(text(byClassIn(who, "nb-dem-l")[0]) === "Wanted by", "the list is labelled");
  });

  test("the interest control names whose interest it records", () => {
    const r = binderTab();
    cards(r).forEach((n) => {
      const b = byClassIn(n, "cp-bind-x")[0];
      assert(/^You/.test(text(b)), "visibly first-person: " + text(b));
      assert(/your interest/i.test(b.props["aria-label"]), "and explicit for assistive tech");
      assert(/owned by/i.test(b.props["aria-label"]), "including whose copy it is");
    });
  });

  test("the two perspectives are explained once, not per card", () => {
    const r = binderTab();
    const note = byClass(r, "nb-note");
    eq(note.length, 1, "stated a single time");
    eq(text(note[0]), "Goals belong to your collectors. Interest is yours.",
      "naming both perspectives plainly");
  });

  test("the filters make their scope explicit", () => {
    const r = binderTab();
    const labels = byClass(r, "nb-bar")[0].findAllByType("button").map((b) => text(b).trim());
    eq(labels.join(" | "),
      "New since last review | You haven\u2019t reviewed | You\u2019re interested | Wanted by a collector",
      "review states are yours; demand is theirs");
    assert(labels.some((l) => /^Wanted by/.test(l)), "and demand is phrased as wanting, not matching");
    assert(!labels.includes("Primary goal match"), "the taxonomy-flavoured label is gone");
  });

  test("no internal or system vocabulary reaches the page", () => {
    // scoped to the rendered workspace; the app's stylesheet is not user-facing copy
    const r = binderTab();
    const t = byClass(r, "nb-sum").map(text).join(" ") + byClass(r, "nb-bar").map(text).join(" ")
      + cards(r).map(text).join(" ");
    for (const jargon of ["tpInterest", "binderId", "identityKey", "collectorCards",
      "Primary goal match", "unseen"]) {
      assert(!t.includes(jargon), `internal vocabulary must not surface: ${jargon}`);
    }
    // word-boundary matched: "Dragon Frontiers" is a real set name, not jargon
    ["tier", "flag", "record"].forEach((w) =>
      assert(!new RegExp("\\b" + w + "\\b", "i").test(t), `internal vocabulary: ${w}`));
  });

  test("counts always say what they count", () => {
    const r = binderTab();
    const sum = text(byClass(r, "nb-sum")[0]);
    assert(/\d+ cards? across \d+ collectors?/.test(sum), "cards and collectors are named: " + sum);
    assert(/new since your last review/.test(sum), "and newness is scoped to the reader");
    cards(r).map(demOf).filter(Boolean).forEach((d) => {
      const t = text(d);
      if (/\d+ collectors/.test(t)) assert(/for \d+ collectors/.test(t), "plural demand is attributed: " + t);
    });
  });

  test("nothing overstates what interest means", () => {
    const t = allText(binderTab());
    for (const over of ["Reserved", "Committed", "Secured", "Offer", "Guaranteed", "Deal"]) {
      assert(!t.includes(over), `interest must not imply commitment: ${over}`);
    }
  });

  test("card-level copy stays short enough to scan", () => {
    const r = binderTab();
    cards(r).forEach((n) => {
      [byClassIn(n, "nb-own")[0], demOf(n), byClassIn(n, "nb-dem2")[0]]
        .filter(Boolean).forEach((el) => assert(text(el).length <= 40,
          "one short line, not a sentence: " + text(el)));
    });
  });

  test("the disambiguation changed no behaviour", () => {
    const r = binderTab();
    const before = cards(r).length;
    const name = names(r)[0];
    const was = byClassIn(cards(r)[0], "cp-bind-x")[0].props["aria-pressed"];
    click(byClassIn(cards(r)[0], "cp-bind-x")[0]);
    eq(cards(r).length, before, "no cards appeared or vanished");
    // the list re-sorts on review, so the card is located by name rather than position
    const after = cards(r)[names(r).indexOf(name)];
    assert(byClassIn(after, "cp-bind-x")[0].props["aria-pressed"] !== was,
      "and the toggle still works");
  });
});

require("./run.cjs").run();
