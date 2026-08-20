const { describe, test, assert, eq } = require("./run.cjs");
const { render, text, allText, btn, btns, btnExact, click, byClass, byClassIn, goProfile } = require("./util.cjs");

const profile = (who = "Ellen Fisher") => { const r = render(); goProfile(r, who); return r; };
const sections = (r) => byClass(r, "cp-sec-h").map((n) => text(n).replace(/\s+/g, " ").trim());
const head = (r) => byClass(r, "cp-head")[0];
const tiles = (r) => byClass(r, "cp-bind");
const idx = (r, label) => sections(r).findIndex((h) => h.startsWith(label));

describe("Information hierarchy", () => {
  test("the page reads identity, then supply, then demand", () => {
    const r = profile("James Rivera");
    assert(head(r), "the collector summary leads");
    const order = sections(r);
    const seq = ["Trade Binder", "Primary Goals", "Secondary Goals"]
      .map((l) => order.findIndex((h) => h.startsWith(l)));
    assert(seq.every((v) => v >= 0), "all three sections present: " + order.join(" | "));
    assert(seq[0] < seq[1] && seq[1] < seq[2],
      "Trade Binder above both goal tiers: " + order.join(" | "));
  });

  test("the Trade Binder is the first section after the summary", () => {
    const r = profile();
    eq(sections(r)[0].split(" ")[0] + " " + sections(r)[0].split(" ")[1], "Trade Binder",
      "it is the first working surface: " + sections(r).join(" | "));
  });

  test("Active Opportunities and History remain, below the goals", () => {
    const r = profile("James Rivera");
    assert(idx(r, "Active Opportunities") > idx(r, "Secondary Goals"), "opportunities stay downstream");
    assert(idx(r, "History") > idx(r, "Active Opportunities"), "history last");
  });

  test("the profile content is contained rather than stretched", () => {
    const r = profile();
    eq(byClass(r, "cp-wrap").length, 1, "one containing wrapper");
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    const rule = /\.cp-wrap \{([^}]*)\}/.exec(src)[1];
    assert(/max-width/.test(rule), "with a maximum width");
    assert(!/(^|[^-])\bwidth:\s*\d+px/.test(rule), "and no brittle fixed width");
  });
});

describe("Collector summary", () => {
  test("it holds every existing relationship fact in one surface", () => {
    const t = text(head(profile()));
    for (const fact of ["EF", "Ellen Fisher", "Boston, MA", "Member since",
      "Completed deals", "Deal value", "Coverage"]) {
      assert(t.includes(fact), `summary retains "${fact}"`);
    }
    assert(t.includes("Sealed modern"), "the collector description");
    assert(byClassIn(head(profile()), "tag").length > 0, "and the preference tags");
  });

  test("Member since is identity metadata, not a headline figure", () => {
    const r = profile();
    const kpis = byClassIn(head(r), "cp-life-l").map(text);
    eq(kpis.join(" | "), "Completed deals | Deal value | Coverage",
      "three relationship facts, and Member since is not among them");
    assert(byClassIn(head(r), "cp-meta").some((n) => text(n).includes("Member since")),
      "it sits with the location instead");
  });

  test("the collector name is the strongest element", () => {
    const r = profile();
    const name = byClassIn(head(r), "cp-name")[0];
    assert(name && text(name) === "Ellen Fisher", "the name has its own treatment");
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    const rule = /\.cp-name \{([^}]*)\}/.exec(src)[1];
    const size = Number(/font-size:\s*(\d+)/.exec(rule)[1]);
    assert(size >= 20, "and outranks the metadata beneath it: " + size + "px");
  });

  test("no CRM metrics were invented", () => {
    const t = allText(profile());
    for (const banned of ["relationship health", "Lifetime value", "Last contacted",
      "Engagement", "Activity score", "Health"]) {
      assert(!t.includes(banned), `no invented metric: "${banned}"`);
    }
  });
});

describe("Trade Binder as the working surface", () => {
  test("it opens expanded, showing the cards", () => {
    const r = profile();
    assert(tiles(r).length > 0, "cards render immediately, not behind a disclosure");
    eq(tiles(r).length, 6, "all six of Ellen's copies");
  });

  test("the heading carries the count and the availability summary", () => {
    const r = profile();
    const h = sections(r)[0];
    assert(/Trade Binder 6/.test(h), "total count: " + h);
    assert(/5 open to trade/.test(h), "and how much is available");
  });

  test("each tile keeps the identity needed to recognise the copy", () => {
    const t = text(tiles(profile())[0]);
    assert(/Rebel Clash|Paldea|Evolving/.test(t), "set");
    assert(/#\d/.test(t), "printed number");
    assert(/PSA |Raw/.test(t), "grade or condition");
    assert(t.includes("English") || t.includes("Japanese"), "language");
    assert(t.includes("View copy") && t.includes("Open to trade"), "and both actions");
  });

  test("the private collector value is still absent", () => {
    const r = profile();
    const t = tiles(r).map(text).join(" ");
    assert(!/\$\d/.test(t), "no monetary value on any tile: " + t.slice(0, 120));
    assert(!t.includes("Collector value"), "and no value label");
    click(byClass(r, "cp-bind-view")[0]);
    const d = text(byClass(r, "drawer")[0]);
    assert(!/Collector value/.test(d), "nor in the inspection drawer");
    assert(!/\$\d/.test(d), "and no figure there either");
  });

  test("Open to trade is scannable and still interactive", () => {
    const r = profile();
    const toggles = byClass(r, "cp-bind-x");
    eq(toggles.length, tiles(r).length, "one per card");
    const on = toggles.filter((b) => b.props["aria-pressed"] === "true");
    eq(on.length, 5, "five flagged, matching the heading");
    on.forEach((b) => assert(String(b.props.className).includes(" on"), "flagged cards read differently"));
    const off = toggles.find((b) => b.props["aria-pressed"] === "false");
    assert(off, "and an unflagged card is still shown, not hidden");
    click(off);
    eq(byClass(r, "cp-bind-x").filter((b) => b.props["aria-pressed"] === "true").length, 6,
      "the toggle still works");
  });

  test("tiles share one geometry and one action stack", () => {
    const r = profile();
    tiles(r).forEach((t) => {
      eq(byClassIn(t, "cp-bind-act").length, 1, "one action wrapper per tile");
      const kids = t.children.filter((k) => typeof k === "object")
        .map((k) => String(k.props.className || "").split(" ")[0]);
      eq(kids[0], "cp-bind-art", "artwork first");
      eq(kids[kids.length - 1], "cp-bind-act", "actions last, bottom-aligned");
    });
  });

  test("the grid stays dense and degrades without overflow", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    const rule = /\.cp-bind-grid \{([^}]*)\}/.exec(src)[1];
    assert(/auto-fill/.test(rule), "the grid reflows by available width");
    const min = Number(/minmax\((\d+)px/.exec(rule)[1]);
    assert(min >= 130 && min <= 200, "cards stay comparable at a glance: " + min + "px");
    assert(!/overflow-x/.test(rule), "and never scroll sideways");
  });
});

describe("Goals below the binder", () => {
  test("the primary goal keeps its full information", () => {
    const r = profile("James Rivera");
    const gc = byClass(r, "gc").find((n) => !String(n.props.className).includes("sec"));
    assert(gc, "a primary goal card renders");
    const t = text(gc);
    assert(byClassIn(gc, "cimg").length >= 1, "card image");
    assert(/PSA |Raw/.test(t), "grade or condition");
    assert(/Primary for|day|month|year/.test(t), "how long it has been primary: " + t.slice(0, 140));
    assert(btns(r, "Reach out").length >= 1, "and Reach out still available");
  });

  test("Reach out still opens its existing flow", () => {
    const r = profile("James Rivera");
    click(btns(r, "Reach out")[0]);
    assert(byClass(r, "modal").length === 1, "the outreach modal opened");
  });

  test("secondary goals stay collapsed until asked for", () => {
    const r = profile("James Rivera");
    const before = byClass(r, "gc").length;
    const toggle = byClass(r, "cp-sec-h").find((n) => text(n).startsWith("Secondary Goals"));
    assert(toggle, "the secondary section is present");
    click(btns(r, "Secondary Goals")[0]);
    assert(byClass(r, "gc").length > before, "expanding reveals them");
  });

  test("goal counts are unchanged", () => {
    const r = profile("James Rivera");
    const pri = sections(r).find((h) => h.startsWith("Primary Goals"));
    const sec = sections(r).find((h) => h.startsWith("Secondary Goals"));
    assert(/Primary Goals \d/.test(pri), "primary count: " + pri);
    assert(/Secondary Goals \d/.test(sec), "secondary count: " + sec);
  });
});

describe("Nothing else changed", () => {
  test("navigation into and out of the profile still works", () => {
    const r = profile();
    click(btn(r, "All collectors"));
    assert(allText(r).includes("Invite collector"), "back at the network");
    assert(byClass(r, "cp-head").length === 0, "and off the profile");
  });

  test("the profile did not become an Opportunities or Inventory surface", () => {
    const r = profile("James Rivera");
    const t = allText(r);
    for (const banned of ["Accept into trade", "Send counter", "Market Value", "Trade %",
      "Add card", "Explicit demand"]) {
      assert(!t.includes(banned), `no borrowed workflow UI: "${banned}"`);
    }
  });

  test("binder search, paging and ordering are untouched", () => {
    const r = profile();
    // six cards is under the disclosure limit, so no search or expander should appear
    eq(byClass(r, "cp-bind-search").length, 0, "no search below the limit");
    eq(byClass(r, "cp-bind-more").length, 0, "and no View all control");
  });

  test("the Collector Network overview still agrees with the profile", () => {
    const r = render();
    const row = byClass(r, "tbl")[0].findAllByType("tr").find((tr) => text(tr).includes("Ellen Fisher"));
    const cells = row.findAllByType("td").map(text);
    eq(cells[3] + "|" + cells[4], "6|5", "total binder and open-to-trade match the profile heading");
  });
});

require("./run.cjs").run();
