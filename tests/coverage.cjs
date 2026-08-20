const { describe, test, assert, eq } = require("./run.cjs");
const { inventoryCoverage } = require("../dist/MetYet.test.cjs");
const { render, text, allText, btn, btns, btnExact, click, byClass, byClassIn } = require("./util.cjs");

const coverageTab = () => {
  const r = render();
  click(btnExact(r, "Inventory37"));
  click(btns(r, "Coverage")[0]);
  return r;
};
const layers = (r) => byClass(r, "cov-layer");
const rowFor = (r, label) => layers(r).find((n) => text(byClassIn(n, "cov-name")[0]).startsWith(label));
const countOf = (r, label) => text(byClassIn(rowFor(r, label), "cov-count")[0]);
const numOf = (r, label) => Number(text(byClassIn(rowFor(r, label), "cov-num")[0]));
const openRow = (r, label) => click(rowFor(r, label).findAllByType("button")[0]);
const drilldownCards = (r, label) => byClassIn(rowFor(r, label), "cov-body")[0]
  .findAllByType("tr").slice(1).map((tr) => text(tr.findAllByType("button")[0]));

/* A hand-built network so the two models can be exercised independently of seed data. */
const fixture = ({ prefsOn = [], dealCards = [], primary = [], secondary = [], archived = [] } = {}) => {
  const cards = ["a", "b", "c", "d"].map((id) => ({
    id, name: id.toUpperCase(), set: "Base Set", num: "1/102", grade: "PSA 9",
    print: "Holo", edition: "Unlimited", language: "English",
    tags: prefsOn.includes(id) ? ["holo"] : ["plain"],
  }));
  const cardById = (id) => cards.find((c) => c.id === id);
  const activeInv = cards.filter((c) => !archived.includes(c.id))
    .map((c, i) => ({ invId: "inv" + c.id, cardId: c.id, ask: 100 + i, acquired: "2025-01-01" }));
  const opps = dealCards.map((cid, i) => ({
    id: "o" + i, cardId: cid, collectorId: "c1", stage: "deal", archived: false, declined: false,
  }));
  const goals = [
    ...primary.map((cid, i) => ({ id: "gp" + i, cardId: cid, collectorId: "c1", tier: "primary" })),
    ...secondary.map((cid, i) => ({ id: "gs" + i, cardId: cid, collectorId: "c2", tier: "secondary" })),
  ];
  const collectors = [
    { id: "c1", short: "C1", prefs: ["holo"] },
    { id: "c2", short: "C2", prefs: ["holo"] },
    { id: "c3", short: "C3", prefs: ["holo"] },
  ];
  return inventoryCoverage({ activeInv, opps, goals, collectors, cardById, today: new Date("2026-08-13") });
};

describe("A–E. The page is anchored to total inventory", () => {
  test("A. no coverage percentage or score remains", () => {
    const r = coverageTab();
    const t = text(byClass(r, "cov-top")[0]) + layers(r).map((n) => text(byClassIn(n, "cov-row")[0])).join(" ");
    assert(!/%/.test(t), "no percentage anywhere on the measures: " + t.slice(0, 160));
    for (const banned of ["Coverage Score", "Demand Score", "Fit Score", "coverage %"]) {
      assert(!allText(r).includes(banned), `no abstract score: ${banned}`);
    }
  });

  test("B. the denominator leads the page", () => {
    const r = coverageTab();
    const lead = text(byClass(r, "cov-lead")[0]);
    eq(text(byClass(r, "cov-big")[0]), "37", "total current inventory");
    assert(lead.includes("Current inventory"), "labelled as the denominator: " + lead);
  });

  test("C. every explicit-demand row reads X / N cards", () => {
    const r = coverageTab();
    ["Deal Flow", "Primary Goals", "Secondary Goals"].forEach((l) => {
      assert(/^\d+\/ 37 cards$/.test(countOf(r, l)), `${l} shows "${countOf(r, l)}"`);
    });
  });

  test("D. there is no separate percentage column", () => {
    const r = coverageTab();
    eq(byClass(r, "cov-share").length, 0, "the percentage column is gone");
  });

  test("E. Age is no longer a coverage category", () => {
    const r = coverageTab();
    const names = layers(r).map((n) => text(byClassIn(n, "cov-name")[0]));
    assert(!names.some((n) => n.startsWith("Age")), "no Age row: " + names.join(" | "));
    assert(!allText(r).includes("oldest held"), "and no age helper copy");
    assert(!allText(r).includes("Held for"), "nor an age drilldown column");
  });

  test("the explicit-demand section shows only meaningful connections", () => {
    const r = coverageTab();
    const heading = byClass(r, "cov-sec").map(text);
    eq(heading.join(" | "), "Explicit demand | Preference alignment", "two sections");
    // the label is the name node minus its description child
    const names = layers(r).map((n) => {
      const nm = byClassIn(n, "cov-name")[0];
      return text(nm).replace(text(byClassIn(nm, "cov-q")[0]), "");
    });
    eq(names.length, 4, "three demand rows plus the lens");
    eq(names.slice(0, 3).join("|"), "Deal Flow|Primary Goals|Secondary Goals",
      "the three connection categories");
    eq(names[3], "Preferences", "and the overlapping lens");
  });

  test("the residual category is gone entirely", () => {
    const r = coverageTab();
    const t = allText(r);
    assert(!t.includes("No stated goal"), "the row is removed");
    assert(!t.includes("No current explicit goal or active opportunity match"), "and its description");
    assert(!t.includes("no goal or opportunity match yet"), "and its right-side text");
    assert(!layers(r).some((n) => text(byClassIn(n, "cov-name")[0]).startsWith("No ")),
      "and no replacement residual row was introduced");
  });

  test("nothing renders to the right of the metric", () => {
    const r = coverageTab();
    eq(byClass(r, "cov-ctx").length, 0, "the explanatory column is gone");
    layers(r).forEach((n) => {
      const kids = byClassIn(n, "cov-row")[0].children.filter((k) => typeof k === "object")
        .map((k) => String(k.props.className || ""));
      eq(kids[kids.length - 1], "cov-count mono", "the metric is the last thing on the row");
    });
    for (const gone of ["across 13 collectors", "relevant to", "counted in Deal Flow", "no preference match"]) {
      assert(!allText(r).includes(gone), `removed: "${gone}"`);
    }
  });

  test("no replacement secondary metric appears", () => {
    const r = coverageTab();
    layers(r).forEach((n) => {
      const row = text(byClassIn(n, "cov-row")[0]);
      const nums = row.match(/\d+/g) || [];
      eq(nums.length, 2, "only the numerator and denominator: " + row);
    });
    eq(byClass(r, "nw-track").length, 0, "no progress bars");
    assert(!/%/.test(text(byClass(r, "cov-top")[0])), "and still no percentages");
  });
});

describe("F–G. Reconciliation", () => {
  test("G. the displayed rows no longer need to account for every card", () => {
    const r = coverageTab();
    const shown = ["Deal Flow", "Primary Goals", "Secondary Goals"].reduce((a, l) => a + numOf(r, l), 0);
    eq(shown, 34, "21 + 1 + 12 connect to demand");
    assert(shown < 37, "the section shows connections, not a full accounting");
    // the partition itself is unchanged underneath
    const cov = fixture({ dealCards: ["a"], primary: ["b"], secondary: ["c"] });
    eq(cov.layers.deal.count + cov.layers.primary.count
      + cov.layers.secondary.count + cov.layers.none.count, cov.total,
      "the engine still partitions every held card exactly once");
  });

  test("G. reconciliation holds for arbitrary fixtures too", () => {
    const cases = [
      {}, { dealCards: ["a"] }, { primary: ["b"] }, { secondary: ["c", "d"] },
      { dealCards: ["a", "b"], primary: ["b"], secondary: ["c"] },
      { dealCards: ["a"], primary: ["a"], secondary: ["a"] },
    ];
    cases.forEach((cfg, i) => {
      const cov = fixture(cfg);
      const sum = cov.layers.deal.count + cov.layers.primary.count
        + cov.layers.secondary.count + cov.layers.none.count;
      eq(sum, cov.total, "case " + i + " reconciles to " + cov.total);
    });
  });

  test("F. the buckets are mutually exclusive", () => {
    const cov = fixture({ dealCards: ["a"], primary: ["a", "b"], secondary: ["a", "c"] });
    const ids = (k) => cov.layers[k].items.map((r) => r.inv.invId);
    const all = [...ids("deal"), ...ids("primary"), ...ids("secondary"), ...ids("none")];
    eq(new Set(all).size, all.length, "no inventory card appears in two buckets");
    eq(all.length, cov.total, "and every card appears exactly once");
    assert(ids("deal").includes("inva"), "the strongest signal wins");
    assert(!ids("primary").includes("inva"), "so it is not also a primary match");
  });

  test("H. 'No stated goal' means no goal or opportunity, nothing more", () => {
    const cov = fixture({ dealCards: ["a"], primary: ["b"], secondary: ["c"] });
    eq(cov.layers.none.count, 1, "only D remains");
    eq(cov.layers.none.items[0].inv.invId, "invd", "and it is the unmatched card");
  });
});

describe("H–K. Preference alignment is a lens, not a bucket", () => {
  test("H. it uses the same denominator", () => {
    const r = coverageTab();
    assert(/^\d+\/ 37 cards$/.test(countOf(r, "Preferences")), "same N: " + countOf(r, "Preferences"));
  });

  test("I. a Deal Flow card still counts toward preferences", () => {
    const cov = fixture({ dealCards: ["a"], prefsOn: ["a"] });
    eq(cov.layers.deal.count, 1, "counted once in Deal Flow");
    assert(cov.layers.deal.items.some((r) => r.inv.invId === "inva"), "and stays there");
    assert(!cov.layers.none.items.some((r) => r.inv.invId === "inva"), "it did not move to another bucket");
    assert(cov.layers.preference.items.some((r) => r.inv.invId === "inva"),
      "yet it does count toward preference alignment");
  });

  test("I. the lens never disturbs the partition", () => {
    const withPrefs = fixture({ dealCards: ["a"], primary: ["b"], prefsOn: ["a", "b", "c", "d"] });
    const without = fixture({ dealCards: ["a"], primary: ["b"], prefsOn: [] });
    ["deal", "primary", "secondary", "none"].forEach((k) =>
      eq(withPrefs.layers[k].count, without.layers[k].count,
        k + " is unaffected by whether preferences match"));
    eq(withPrefs.layers.preference.count, 4, "but the lens sees all four");
    eq(without.layers.preference.count, 0, "and none when nothing matches");
  });

  test("J. a card matching several collectors counts once", () => {
    const cov = fixture({ prefsOn: ["a"] });
    // three collectors all prefer "holo"; the card must contribute 1, not 3
    eq(cov.layers.preference.items[0].who.length, 3, "three collectors match it");
    eq(cov.layers.preference.count, 1, "yet the numerator rises by exactly one card");
    eq(new Set(cov.layers.preference.items.map((r) => r.inv.invId)).size,
      cov.layers.preference.count, "deduplicated per inventory card");
  });

  test("the numerator can never exceed the denominator", () => {
    const cov = fixture({ prefsOn: ["a", "b", "c", "d"] });
    eq(cov.layers.preference.count, cov.total, "at most every held card");
    assert(cov.layers.preference.count <= cov.total, "bounded by the denominator");
  });

  test("zero preference matches render cleanly rather than being hidden", () => {
    const cov = fixture({ prefsOn: [] });
    eq(cov.layers.preference.count, 0, "zero is a real answer");
    const r = coverageTab();
    assert(rowFor(r, "Preferences"), "the row is always present");
  });
});

describe("K–L. Drilldowns", () => {
  test("L. explicit-demand drilldowns stay exclusive", () => {
    const r = coverageTab();
    openRow(r, "Secondary Goals");
    const sec = drilldownCards(r, "Secondary Goals");
    openRow(r, "Deal Flow");
    const deal = drilldownCards(r, "Deal Flow");
    eq(sec.filter((n) => deal.includes(n)).length, 0, "no card in both lists");
  });

  test("K. the preference drilldown deliberately overlaps", () => {
    const cov = fixture({ dealCards: ["a"], prefsOn: ["a", "b"] });
    const prefIds = cov.layers.preference.items.map((r) => r.inv.invId);
    const dealIds = cov.layers.deal.items.map((r) => r.inv.invId);
    assert(dealIds.every((id) => prefIds.includes(id)),
      "a Deal Flow card appears in the preference list as well");
    assert(prefIds.length > dealIds.length, "alongside cards from other buckets");
  });

  test("every row still opens a drilldown", () => {
    const r = coverageTab();
    ["Deal Flow", "Primary Goals", "Secondary Goals", "Preferences"].forEach((l) => {
      openRow(r, l);
      assert(byClassIn(rowFor(r, l), "cov-body")[0], l + " opens");
    });
  });

  test("the footers separate the two models", () => {
    const r = coverageTab();
    const feet = byClass(r, "cov-foot").map(text);
    assert(feet[0].includes("counted once under their strongest explicit-demand signal"),
      "the matched-cards rule: " + feet[0]);
    assert(feet[1].includes("can overlap with the categories above"),
      "and the lens caveat: " + feet[1]);
  });
});

describe("M–N. Denominator and hardcoding", () => {
  test("M. archived inventory is excluded from the denominator", () => {
    const full = fixture({});
    const withArchived = fixture({ archived: ["d"] });
    eq(full.total, 4, "four held");
    eq(withArchived.total, 3, "an archived card leaves the denominator");
    const sum = withArchived.layers.deal.count + withArchived.layers.primary.count
      + withArchived.layers.secondary.count + withArchived.layers.none.count;
    eq(sum, 3, "and the partition still reconciles");
  });

  test("the denominator matches what Inventory > Current shows", () => {
    const r = render();
    click(btnExact(r, "Inventory37"));
    const rows = byClass(r, "inv-row").length;
    click(btns(r, "Coverage")[0]);
    eq(Number(text(byClass(r, "cov-big")[0])), rows, "same set of cards as the Current tab");
  });

  test("N. no count is hardcoded in production logic", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    const fn = src.slice(src.indexOf("function inventoryCoverage"), src.indexOf("/* ==================== YOUR NETWORK"));
    assert(!/\b37\b/.test(fn), "no 37 in the engine");
    assert(!/\b25\b/.test(fn), "no 25 in the engine");
    assert(fn.includes("activeInv.length"), "the total is derived from held inventory");
  });
});

describe("Preference alignment is traceable", () => {
  test("the numerator equals the number of distinct inventory copies listed", () => {
    const cov = fixture({ prefsOn: ["a", "b"] });
    const ids = cov.layers.preference.items.map((r) => r.inv.invId);
    eq(ids.length, cov.layers.preference.count, "count comes from the same collection");
    eq(new Set(ids).size, ids.length, "and every entry is a distinct inventory copy");
    eq(ids.sort().join(","), "inva,invb", "the exact copies are traceable");
  });

  test("a card whose metadata resembles others but matches no stated preference is excluded", () => {
    // fixture cards carry tag "plain"; no collector states it as a preference
    const cov = fixture({ prefsOn: ["a"] });
    eq(cov.layers.preference.count, 1, "only the card with a genuinely stated preference");
    const excluded = cov.layers.preference.items.map((r) => r.inv.invId);
    ["invb", "invc", "invd"].forEach((id) =>
      assert(!excluded.includes(id), id + " has metadata but no stated preference match"));
  });

  test("goals never manufacture a preference match", () => {
    const cov = fixture({ primary: ["b"], secondary: ["c"], prefsOn: [] });
    eq(cov.layers.primary.count, 1, "the goal is recognised");
    eq(cov.layers.secondary.count, 1, "and the secondary goal too");
    eq(cov.layers.preference.count, 0, "but neither creates preference alignment");
  });

  test("the collector context counts collectors, not cards", () => {
    const cov = fixture({ prefsOn: ["a"] });
    eq(cov.layers.preference.count, 1, "one aligned card");
    eq(cov.layers.preference.collectors, 3, "matched by three distinct collectors");
    assert(cov.layers.preference.collectors !== cov.layers.preference.count,
      "the two measures are independent and must not be conflated");
  });

  test("archived copies never enter preference alignment", () => {
    const cov = fixture({ prefsOn: ["a", "d"], archived: ["d"] });
    const ids = cov.layers.preference.items.map((r) => r.inv.invId);
    assert(!ids.includes("invd"), "the archived copy is absent");
    eq(cov.layers.preference.count, 1, "only held copies count");
  });
});

describe("Displayed numerators match their drilldowns", () => {
  test("each row's list is the same collection as its metric", () => {
    const r = coverageTab();
    ["Deal Flow", "Primary Goals", "Secondary Goals", "Preferences"].forEach((l) => {
      openRow(r, l);
      const body = byClassIn(rowFor(r, l), "cov-body")[0];
      const shown = body.findAllByType("tr").slice(1).length;
      const more = /Showing 12 of (\d+)/.exec(text(body));
      const listed = more ? Number(more[1]) : shown;
      eq(listed, numOf(r, l), l + ": the list holds exactly the number displayed");
      openRow(r, l);
    });
  });
});

describe("Formatting", () => {
  const src = () => require("fs").readFileSync(
    require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
  const rule = (sel) => {
    const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}").exec(src());
    assert(m, "found " + sel);
    return m[1];
  };

  test("the hero number is not clipped", () => {
    assert(!/overflow:\s*hidden/.test(rule(".cov-top")), "the hero container does not clip");
    assert(!/overflow:\s*hidden/.test(rule(".cov-lead")), "nor its lead row");
    const big = rule(".cov-big");
    assert(/line-height:\s*1\.1/.test(big), "the 40px figure has room for its own line box");
    assert(/padding/.test(big), "with breathing room above and below");
  });

  test("the fraction is one metric on one baseline", () => {
    const r = coverageTab();
    const cell = byClassIn(rowFor(r, "Deal Flow"), "cov-count")[0];
    eq(byClassIn(cell, "cov-num").length, 1, "a numerator part");
    eq(byClassIn(cell, "cov-den").length, 1, "and a quieter denominator part");
    const c = rule(".cov-count");
    assert(/align-items:\s*baseline/.test(c), "shared baseline");
    assert(/gap:/.test(c), "with consistent spacing around the slash");
    assert(!/mono/.test(String(byClassIn(cell, "cov-den")[0].props.className)),
      "the denominator is not monospace");
  });

  test("all five metrics share one aligned column", () => {
    const r = coverageTab();
    const classes = layers(r).map((n) => String(byClassIn(n, "cov-count")[0].props.className));
    eq(new Set(classes).size, 1, "one metric class across every row");
    assert(/min-width:\s*\d+px/.test(rule(".cov-count")), "so label length cannot move the metric");
    assert(!/width:\s*\d+px;/.test(rule(".cov-count").replace(/min-width:\s*\d+px;/, "")),
      "and it stays flexible rather than a brittle fixed width");
  });

  test("section labels are deliberate wrappers with spacing", () => {
    const r = coverageTab();
    eq(byClass(r, "cov-sec").length, 2, "two section labels");
    const sec = rule(".cov-sec");
    assert(/padding:/.test(sec), "with internal spacing, not touching the row above");
    assert(/text-transform:\s*uppercase/.test(sec), "reusing the section-label treatment");
  });

  test("the old percentage UI stays gone and Age stays out", () => {
    const r = coverageTab();
    assert(!/%/.test(text(byClass(r, "cov-top")[0])), "no hero percentage");
    eq(byClass(r, "cov-share").length, 0, "no percentage column");
    assert(!allText(r).includes("Age"), "no Age category");
  });

  test("the row descriptions under each label remain", () => {
    const r = coverageTab();
    const q = layers(r).map((n) => text(byClassIn(n, "cov-q")[0]));
    eq(q.join(" | "),
      "Connected to an active opportunity. | Match a primary collector goal. | "
      + "Match a secondary collector goal. | Meet one or more stated collector preferences.",
      "each category still explains what it means");
  });
});

require("./run.cjs").run();
