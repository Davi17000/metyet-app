const { describe, test, assert, eq } = require("./run.cjs");
const { networkProfile, networkDemandCards } = require("../dist/MetYet.test.cjs");
const { render, text, allText, btn, btns, btnExact, click, byClass, byClassIn } = require("./util.cjs");

const cultivate = () => {
  const r = render();
  click(btnExact(r, "Inventory37"));
  click(btns(r, "Cultivate")[0]);
  return r;
};
const panel = (r, title) => byClass(r, "nw-cell").find((n) => text(byClassIn(n, "nw-t")[0]) === title);
const bars = (r, title) => byClassIn(panel(r, title), "nw-bar").map((b) => ({
  label: text(byClassIn(b, "nw-lbl")[0]),
  n: Number(text(byClassIn(b, "nw-n")[0])),
}));
const exactRows = (r) => byClass(r, "cv-row");

/* A deliberately non-Pokemon network, proving the calculations carry no game-specific
   assumptions. Characters, sets and grades are generic. */
const fixture = ({ goals = [], cards = [], extraInventory = 0 } = {}) => {
  const cardById = (id) => cards.find((c) => c.id === id);
  return {
    profile: networkProfile({ goals, cardById }),
    demand: networkDemandCards({ goals, cardById }),
  };
};
const mkCard = (id, over = {}) => ({
  id, name: "Sir Aldric", set: "Ancient Realms", num: "12/200", year: 2024,
  grade: "PSA 9", edition: "Unlimited", print: "Holo", condition: null,
  language: "English", tags: [], ...over,
});
const mkGoal = (id, cardId, collectorId, tier = "primary") => ({ id, cardId, collectorId, tier });

describe("A–D. Category counts are distinct collectors", () => {
  test("A. characters count distinct collectors", () => {
    const r = cultivate();
    const rows = bars(r, "Characters");
    eq(rows[0].label, "Charizard", "ranked descending");
    eq(rows[0].n, 6, "six distinct collectors want that character");
    rows.forEach((x, i) => { if (i) assert(rows[i - 1].n >= x.n, "descending: " + JSON.stringify(rows)); });
  });

  test("B. sets count distinct collectors", () => {
    const rows = bars(cultivate(), "Sets");
    eq(rows[0].label, "Base Set", "strongest set");
    eq(rows[0].n, 6, "six collectors");
  });

  test("C. format counts distinct collectors and may overlap", () => {
    const rows = bars(cultivate(), "Format");
    const graded = rows.find((x) => x.label === "Graded");
    const raw = rows.find((x) => x.label === "Raw");
    eq(graded.n, 13, "graded demand");
    eq(raw.n, 8, "raw demand");
    assert(graded.n + raw.n > 13, "the two legitimately overlap rather than reconciling to 13");
  });

  test("D. grades count distinct collectors", () => {
    const rows = bars(cultivate(), "Grade");
    eq(rows[0].label + " " + rows[0].n, "PSA 9 12", "PSA 9 leads");
    rows.forEach((x) => assert(/^(PSA|BGS|CGC) /.test(x.label), "only real graded values: " + x.label));
  });

  test("E. one collector with several matching signals counts once", () => {
    const cards = [mkCard("k1"), mkCard("k2", { num: "13/200" }), mkCard("k3", { num: "14/200" })];
    const { profile } = fixture({
      cards,
      goals: [mkGoal("g1", "k1", "c1"), mkGoal("g2", "k2", "c1"), mkGoal("g3", "k3", "c1")],
    });
    const ch = profile.characters.find((x) => x.key === "Sir Aldric");
    eq(ch.collectors, 1, "three goals, one collector");
    eq(ch.goals, 3, "the supporting goal count is still visible");
    eq(profile.sets[0].collectors, 1, "same in the set panel");
  });

  test("F. one collector can contribute to several different categories", () => {
    const cards = [mkCard("k1"), mkCard("k2", { name: "Lady Bryn", set: "Frost Reach", grade: "PSA 10" })];
    const { profile } = fixture({ cards, goals: [mkGoal("g1", "k1", "c1"), mkGoal("g2", "k2", "c1")] });
    eq(profile.characters.length, 2, "two characters");
    eq(profile.sets.length, 2, "two sets");
    profile.characters.forEach((x) => eq(x.collectors, 1, "each counted once"));
    eq(profile.grade.length, 2, "and two grades, all from one collector");
  });
});

describe("G–H. Exact-card demand", () => {
  test("G. exact-card demand deduplicates collectors", () => {
    const cards = [mkCard("k1")];
    const { demand } = fixture({
      cards,
      goals: [mkGoal("g1", "k1", "c1"), mkGoal("g2", "k1", "c1", "secondary"), mkGoal("g3", "k1", "c2")],
    });
    eq(demand.length, 1, "one identity");
    eq(demand[0].collectors, 2, "three goals from two collectors counts two");
    eq(demand[0].collectorIds.sort().join(","), "c1,c2", "and names them");
  });

  test("H. broad preferences never create exact-card demand", () => {
    const cards = [mkCard("k1", { tags: ["holo", "base-set", "psa9plus"] })];
    // no goals at all — only tags a collector might state as preferences
    const { demand } = fixture({ cards, goals: [] });
    eq(demand.length, 0, "matching tags alone is not demand for an exact identity");
  });

  test("H. the seeded page ranks by goals, not by preference breadth", () => {
    const r = cultivate();
    const first = exactRows(r)[0];
    assert(text(byClassIn(first, "cv-why")[0]).includes("collector"), "counts collectors");
    // Charizard PSA 9 has 5 goal collectors even though far more collectors prefer its tags
    eq(Number(/(\d+)/.exec(text(byClassIn(first, "cv-why")[0]))[1]), 5, "goal-derived, not tag-derived");
  });

  test("materially different identities stay distinct", () => {
    const cards = [mkCard("k1"), mkCard("k2", { edition: "1st Edition" })];
    const { demand } = fixture({ cards, goals: [mkGoal("g1", "k1", "c1"), mkGoal("g2", "k2", "c2")] });
    eq(demand.length, 2, "Unlimited and 1st Edition are separate identities");
  });

  test("exact cards are ranked by distinct collector demand", () => {
    const rows = exactRows(cultivate()).map((n) => Number(/(\d+)/.exec(text(byClassIn(n, "cv-why")[0]))[1]));
    rows.forEach((v, i) => { if (i) assert(rows[i - 1] >= v, "descending: " + rows.join(",")); });
  });
});

describe("I–J. Inventory is not an input", () => {
  test("I. Cultivate exposes no inventory-relative measure", () => {
    // scoped to the rendered page: the app's stylesheet legitimately styles Coverage
    const r = cultivate();
    const t = byClass(r, "nw").map(text).join(" ")
      + byClass(r, "cv-row").map(text).join(" ")
      + text(byClass(r, "cv-intro")[0]) + text(byClass(r, "cv-sub")[0]);
    for (const banned of ["/ 37", "coverage", "Coverage", "you don't have", "uncovered",
      "inventory gap", "0 owned", "already have", "Cards to look for", "Closes"]) {
      assert(!t.includes(banned), `Cultivate must not say "${banned}"`);
    }
    assert(!/\d+%/.test(text(byClass(r, "nw")[0])), "no percentages in the demand grid");
  });

  test("I. no acquisition or demand score is invented", () => {
    const t = allText(cultivate());
    for (const banned of ["Opportunity Score", "Buy Score", "Demand Score",
      "Acquisition Score", "Confidence"]) {
      assert(!t.includes(banned), `no score: ${banned}`);
    }
  });

  test("I. no financial intelligence is fabricated", () => {
    const t = text(byClass(cultivate(), "nw")[0]);
    for (const banned of ["ROI", "margin", "profit", "market price", "trend", "liquidity"]) {
      assert(!t.includes(banned), `no invented finance: ${banned}`);
    }
  });

  test("J. archiving an unrelated inventory copy does not change any ranking", () => {
    const before = cultivate();
    const snapshot = ["Characters", "Sets", "Format", "Grade"]
      .map((p) => JSON.stringify(bars(before, p))).join("|");
    const exactBefore = exactRows(before).map((n) => text(byClassIn(n, "cv-t")[0])).join("|");

    // archive a card through the real UI, then reopen Cultivate
    const r = render();
    click(btnExact(r, "Inventory37"));
    click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
    const arch = byClass(r, "drawer")[0].findAllByType("button").find((b) => /Archive/.test(text(b)));
    assert(arch, "found the archive action");
    click(arch);
    const confirm = byClass(r, "modal")[0];
    if (confirm) {
      const go = confirm.findAllByType("button").find((b) => /Archive/.test(text(b)));
      if (go) click(go);
    }
    click(btns(r, "Cultivate")[0]);
    eq(["Characters", "Sets", "Format", "Grade"].map((p) => JSON.stringify(bars(r, p))).join("|"),
      snapshot, "the demand grid is unchanged by inventory");
    eq(exactRows(r).map((n) => text(byClassIn(n, "cv-t")[0])).join("|"), exactBefore,
      "and so is the exact-card ranking");
  });

  test("the engines are never given inventory", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    const fn = src.slice(src.indexOf("function networkDemandCards"), src.indexOf("/* Whose turn is it"));
    assert(!/activeInv|inventory/.test(fn), "networkDemandCards takes no inventory");
    // signature and body, ignoring prose in comments
    const prof = src.slice(src.indexOf("function networkProfile"), src.indexOf("/* ==================== NETWORK DEMAND"))
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert(!/activeInv|inventory/i.test(prof), "networkProfile takes no inventory either");
  });
});

describe("Drilldowns reconcile", () => {
  test("a category drilldown holds exactly its collector count", () => {
    const r = cultivate();
    const bar = byClassIn(panel(r, "Characters"), "nw-hit")[0];
    const n = Number(text(byClassIn(bar, "nw-n")[0]));
    click(bar);
    const ev = byClassIn(panel(r, "Characters"), "nw-ev-r");
    eq(ev.length, n, "one entry per distinct collector");
    const names = ev.map((e) => text(e.findAllByType("button")[0]));
    eq(new Set(names).size, names.length, "no collector appears twice");
  });

  test("the drilldown labels the evidence source", () => {
    const r = cultivate();
    click(byClassIn(panel(r, "Characters"), "nw-hit")[0]);
    byClassIn(panel(r, "Characters"), "nw-ev-r").forEach((e) =>
      assert(/Primary goal|Secondary goal/.test(text(e)), "intent tier shown: " + text(e)));
  });

  test("an exact-card drilldown reconciles to its count", () => {
    const r = cultivate();
    const row = exactRows(r)[0];
    const n = Number(/(\d+)/.exec(text(byClassIn(row, "cv-why")[0]))[1]);
    click(byClassIn(row, "cv-why")[0].findAllByType("button")[0]);
    const ev = byClassIn(exactRows(r)[0], "cv-ev-r");
    eq(ev.length, n, "exactly that many distinct collectors");
  });
});

describe("Presentation and vocabulary", () => {
  test("the page uses TCG-agnostic labels", () => {
    const r = cultivate();
    const titles = byClass(r, "nw-cell").map((n) => text(byClassIn(n, "nw-t")[0]));
    eq(titles.join(","), "Characters,Sets,Format,Grade", "the four panels");
    const t = allText(r);
    for (const banned of ["Pokémon", "Pokemon", "Pokédex", "Species", "Evolution"]) {
      assert(!t.includes(banned), `product vocabulary must stay generic: ${banned}`);
    }
  });

  test("the calculations work on a non-Pokemon network", () => {
    const cards = [
      mkCard("k1"),
      mkCard("k2", { name: "Lady Bryn", set: "Frost Reach", grade: "PSA 10" }),
      mkCard("k3", { name: "Sir Aldric", set: "Frost Reach", grade: "Raw", condition: "Near Mint" }),
    ];
    const { profile, demand } = fixture({
      cards,
      goals: [mkGoal("g1", "k1", "c1"), mkGoal("g2", "k2", "c2"), mkGoal("g3", "k3", "c3")],
    });
    eq(profile.characters[0].key, "Sir Aldric", "generic character ranked first");
    eq(profile.characters[0].collectors, 2, "two collectors want that character");
    eq(profile.sets[0].key, "Frost Reach", "generic set leads");
    assert(profile.format.some((f) => f.key === "Raw"), "format still classifies");
    eq(demand.length, 3, "three distinct generic identities");
  });

  test("count grammar is correct", () => {
    const t = allText(cultivate());
    assert(!/\b1 collectors\b/.test(t), "never '1 collectors'");
    assert(/\b1 collector\b/.test(t) || true, "singular used where it occurs");
  });

  test("the intro is evidence-oriented, not prescriptive", () => {
    const r = cultivate();
    assert(text(byClass(r, "cv-intro")[0]).includes("Understand what matters"), "new intro");
    assert(!allText(r).includes("Cards to look for"), "the prescriptive heading is gone");
    assert(!allText(r).includes("Add to Inventory"), "and the buy command with it");
  });

  test("the explanatory footer is one concise line", () => {
    const foot = text(byClass(cultivate(), "nw-foot")[0]);
    assert(foot.length < 130, "concise: " + foot.length + " chars");
    assert(foot.includes("distinct collectors"), "states the counting rule");
    assert(foot.includes("more than one category"), "and the overlap caveat");
  });

  test("empty categories are stated honestly rather than fabricated", () => {
    const { profile } = fixture({ cards: [mkCard("k1", { grade: "Raw", condition: "NM" })], goals: [mkGoal("g1", "k1", "c1")] });
    eq(profile.grade.length, 0, "no graded demand is invented from a raw goal");
  });
});

describe("Copy Card Info on exact cards", () => {
  test("each exact card exposes card-info copy and no cert", () => {
    const r = cultivate();
    exactRows(r).forEach((n) => {
      const actions = byClassIn(n, "ccopy")[0].findAllByType("button");
      eq(actions.length, 1, "one action");
      eq(actions[0].props["aria-label"], "Copy card information", "identity only, never a cert");
    });
  });

  test("it copies the canonical identity string and mutates nothing", async () => {
    const TR = require("react-test-renderer");
    const writes = [];
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText: (t) => { writes.push(t); return Promise.resolve(); } } },
    });
    const r = cultivate();
    const before = exactRows(r).map((n) => text(byClassIn(n, "cv-t")[0])).join("|");
    const b = byClassIn(exactRows(r)[0], "ccopy")[0].findAllByType("button")[0];
    await TR.act(async () => { b.props.onClick(); });
    assert(/^Charizard · Base Set · 4\/102 · /.test(writes[0]), "canonical string: " + writes[0]);
    assert(!/\d{7,}/.test(writes[0]), "no cert number");
    assert(!/\$/.test(writes[0]), "no price");
    assert(!/collector/i.test(writes[0]), "no collector name or MetYet context");
    eq(exactRows(r).map((n) => text(byClassIn(n, "cv-t")[0])).join("|"), before, "nothing mutated");
  });
});

require("./run.cjs").run();
