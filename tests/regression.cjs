const { describe, test, assert, eq } = require("./run.cjs");
const TR = require("react-test-renderer");
const { render, text, allText, btn, btns, btnExact, buttons, click, byClass, byClassIn, binderCounts, goProfile } = require("./util.cjs");

const COLLECTORS = ["Sarah Mendel", "James Rivera", "Alex Trinh", "Priya Raman", "Marcus Webb",
  "Dana Kowalski", "Hiro Tanaka", "Ellen Fisher", "Tomás Ortega", "Nina Alvarez",
  "Grant Whitfield", "Casey Lin", "Robert Nakamura"];

describe("Every collector profile renders", () => {
  for (const who of COLLECTORS) {
    test(who, () => {
      const r = render();
      goProfile(r, who);
      const t = allText(r);
      assert(t.includes(who), "identity renders");
      assert(t.includes("Member since"), "lifetime stats render");
      assert(t.includes("Primary Goals"), "primary goals render");
      assert(t.includes("Trade Binder"), "trade binder renders");
      assert(t.includes("History"), "history renders");
      // every binder card carries exactly one standing-interest control
      const cards = byClass(r, "cp-bind");
      const toggles = byClass(r, "cp-bind-x");
      eq(toggles.length, cards.length, "one toggle per binder card");
      const counts = binderCounts(r);
      eq(counts.total, cards.length, "heading total matches rendered cards (all seeds are under the page limit)");
      eq(counts.open, toggles.filter((b) => b.props["aria-pressed"] === "true").length, "open count matches flagged cards");
    });
  }
});

describe("Every active opportunity workspace opens", () => {
  for (const who of COLLECTORS) {
    test(who, () => {
      const r = render();
      goProfile(r, who);
      const opens = btns(r, "Open").filter((b) => text(b).trim() === "Open");
      if (!opens.length) return;                       // no active opportunities is valid
      opens.forEach((_, i) => {
        const rr = render();
        goProfile(rr, who);
        const o = btns(rr, "Open").filter((b) => text(b).trim() === "Open");
        click(o[i]);
        assert(byClass(rr, "ws-stagework").length === 1, "workspace opened");
        assert(btns(rr, "Trade Binder").length >= 0, "no crash");
      });
    });
  }
});

describe("Stage workspaces keep their controls", () => {
  /* The opportunity row on the profile carries its stage label, so the right
     workspace is chosen by stage rather than by guessing at row order. */
  const at = (who, stage) => {
    const r = render();
    goProfile(r, who);
    const row = byClass(r, "cp-opp").find((n) => text(n).includes(stage));
    if (!row) throw new Error(`${who} has no ${stage} opportunity`);
    click(row.findAllByType("button").find((b) => text(b).trim() === "Open"));
    assert(byClass(r, "ws-stagework").length === 1, "workspace opened");
    return r;
  };

  test("Agree on Price still offers accept and counter", () => {
    const r = at("James Rivera", "Agree on Price");
    assert(btns(r, "Accept $").length >= 1, "accept control");
    assert(btns(r, "Send counter").length === 1, "TP counter control");
    assert(byClass(r, "pn").length === 1, "the decision panel renders once");
  });

  test("Select Trade still reviews the proposed package", () => {
    const r = at("Alex Trinh", "Select Trade");
    assert(btns(r, "Accept into trade").length >= 1, "inclusion decision");
    assert(btns(r, "Reject").length >= 1, "rejection decision");
  });

  test("Value Trade still settles market value and percentage", () => {
    const r = at("Hiro Tanaka", "Value Trade");
    const t = text(byClass(r, "ws-stagework")[0]) + allText(r);
    assert(t.includes("Market Value"), "market column");
    assert(t.includes("Trade %"), "percentage column");
    assert(t.includes("Trade Value"), "trade value column");
    assert(!t.includes("Trade Credit"), "no user-facing trade credit wording");
  });

  test("Deal still shows the cash balance", () => {
    const r = at("Nina Alvarez", "Deal");
    assert(text(byClass(r, "ws-stagework")[0]).includes("Cash balance"), "cash balance renders");
  });

  test("Fulfillment still proposes a plan", () => {
    const r = at("Casey Lin", "Fulfillment");
    assert(text(byClass(r, "ws-stagework")[0]).includes("handoff"), "handoff step renders");
  });
});

describe("Opportunities and Inventory are unaffected", () => {
  test("the lifecycle map renders every stage", () => {
    const r = render();
    click(btnExact(r, "Opportunities22"));
    const t = allText(r);
    for (const s of ["Agree on Price", "Select Trade", "Value Trade", "Deal", "Fulfillment"]) {
      assert(t.includes(s), s + " present");
    }
  });

  test("inventory renders and the card drawer opens", () => {
    const r = render();
    click(btnExact(r, "Inventory37"));
    assert(allText(r).includes("Add card"), "inventory view");
    const rows = byClass(r, "inv-row");
    assert(rows.length > 0 || allText(r).length > 0, "inventory rendered");
  });

  test("the add-card and invite modals still open", () => {
    const r = render();
    click(btnExact(r, "Inventory37"));
    click(btn(r, "Add card"));
    assert(byClass(r, "modal").length === 1, "add inventory modal");
    click(btn(r, "Cancel"));
    click(btnExact(r, "Collector Network13"));
    click(btn(r, "Invite collector"));
    assert(byClass(r, "modal").length === 1, "invite modal");
  });
});

describe("The binder model is not duplicated", () => {
  test("interest set on the profile is the same state Select Trade reads", () => {
    const r = render();
    goProfile(r, "James Rivera");
    const toggles = () => byClass(r, "cp-bind-x");
    const before = toggles().filter((b) => b.props["aria-pressed"] === "true").length;
    click(toggles().filter((b) => b.props["aria-pressed"] === "false")[0]);
    // navigating away and back reads the same single source of truth
    click(btn(r, "All collectors"));
    goProfileAgain(r, "James Rivera");
    eq(toggles().filter((b) => b.props["aria-pressed"] === "true").length, before + 1,
      "the flag persisted across navigation, so it lives in shared state");
  });

  function goProfileAgain(r, name) { click(btnExact(r, name)); }
});

describe("Opportunities drilldown — card image sizing", () => {
  const drilldown = () => {
    const r = render();
    click(btnExact(r, "Opportunities22"));            // no longer the landing section
    click(btns(r, "TP 4")[0]);
    return r;
  };
  const table = (r) => byClass(r, "tbl")[0];
  const imgsIn = (node) => node.findAll((n) => n.type === "img"
    && /\bcimg\b/.test(String(n.props.className || "")));
  const widths = (node) => [...new Set(imgsIn(node).map((i) => i.props.style.width))].sort((a, b) => a - b);

  test("rows use the dedicated triage preset, not the shared thumbnail", () => {
    const r = drilldown();
    const w = widths(table(r));
    eq(w.join(","), "52", "every drilldown image is the triage size");
  });

  test("the natural card aspect ratio is preserved", () => {
    const r = drilldown();
    imgsIn(table(r)).forEach((i) => {
      const { width, height } = i.props.style;
      eq(height, Math.round(width / 0.716), "standard card ratio, never cropped or distorted");
      assert(height >= 70 && height <= 77, "height lands in the intended band: " + height);
    });
  });

  test("the image stays modest — recognisable, not a gallery", () => {
    const r = drilldown();
    imgsIn(table(r)).forEach((i) => assert(i.props.style.width <= 60, "no larger than ~60px"));
  });

  test("card identity still sits beside the image, not below it", () => {
    const r = drilldown();
    const row = table(r).findAllByType("tr")[1];
    const cell = row.findAllByType("td")[1];
    const holder = byClassIn(cell, "cimg-row")[0];
    assert(holder, "the image and name share one inline holder");
    eq(imgsIn(holder).length, 1, "the image");
    assert(holder.findAllByType("button").length >= 1, "and the identity link, in the same span");
  });

  test("every column still renders", () => {
    const r = drilldown();
    const rows = table(r).findAllByType("tr").slice(1);
    assert(rows.length > 0, "rows render");
    rows.forEach((tr) => eq(tr.findAllByType("td").length, 7,
      "Collector, Card, Detail, Stage, Waiting, Next Step, Open"));
  });

  test("the sizing change does not leak into other card surfaces", () => {
    // Deal Summary and Collector Profile share the 34px thumbnail preset
    const a = render();
    goProfile(a, "Nina Alvarez");
    click(btns(a, "Open").filter((b) => text(b).trim() === "Open")[0]);
    assert(widths(a.root).includes(34), "Deal workspace keeps its 34px thumbnails");
    assert(!widths(a.root).includes(52), "and gained no triage images");

    const b = render();
    goProfile(b, "Alex Trinh");
    assert(widths(b.root).includes(34), "Collector Profile keeps its thumbnails");

    const c = render();
    click(btnExact(c, "Inventory37"));
    eq(widths(c.root).join(","), "180", "Inventory shelf images are unchanged");
  });

  test("row padding was not inflated to accommodate the image", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    assert(src.includes(".tbl td { padding: 9px 12px;"), "the shared compact cell padding is untouched");
  });
});

/* Artwork is a convenience; identity is not. Catalog images are remote assets that can
   be slow, blocked or missing, and the product must stay usable when they are. */
describe("Card display survives missing artwork", () => {
  const failImages = (r) => TR.act(() => {
    r.root.findAll((n) => n.type === "img").forEach((i) => i.props.onError && i.props.onError());
  });
  const plates = (r) => r.root.findAll((n) => typeof n.type === "string"
    && /\bcimg\b/.test(String(n.props.className || ""))
    && /\bempty\b/.test(String(n.props.className || "")));

  test("a failed image becomes a readable identity, not a blank box", () => {
    const r = render();
    goProfile(r, "Ellen Fisher");
    failImages(r);
    const p = plates(r);
    assert(p.length > 0, "plates rendered");
    const big = p.filter((x) => x.props.style.width >= 54);
    big.forEach((x) => {
      const t = text(x);
      assert(t.length > 0, "the plate carries text");
      assert(/PSA |Raw/.test(t), "including grade or condition: " + t);
      // printed number only where the catalog has one; never a dangling placeholder
      assert(!t.includes("#—") && !t.includes("#undefined"), "no placeholder number: " + t);
    });
  });

  test("dimensions are identical whether the image loads or not", () => {
    const before = render();
    goProfile(before, "Ellen Fisher");
    const loaded = byClass(before, "cp-bind").map((t) =>
      JSON.stringify(byClassIn(t, "cimg")[0].props.style));
    const after = render();
    goProfile(after, "Ellen Fisher");
    failImages(after);
    const failedDims = byClass(after, "cp-bind").map((t) =>
      JSON.stringify(byClassIn(t, "cimg")[0].props.style));
    eq(failedDims.join("|"), loaded.join("|"), "no layout shift when artwork is unavailable");
  });

  test("the card is still identifiable to assistive tech", () => {
    const r = render();
    goProfile(r, "Ellen Fisher");
    failImages(r);
    plates(r).forEach((x) => {
      eq(x.props.role, "img", "announced as an image");
      assert(x.props["aria-label"] && x.props["aria-label"].length > 3,
        "with the card named: " + x.props["aria-label"]);
      assert(x.props["aria-hidden"] !== "true", "and never hidden from screen readers");
    });
  });

  test("no error state or broken-image treatment is shown", () => {
    const r = render();
    goProfile(r, "Ellen Fisher");
    failImages(r);
    const t = allText(r);
    for (const banned of ["Image unavailable", "Failed to load", "Error", "Retry",
      "broken", "Could not load"]) {
      assert(!t.includes(banned), `no error language: "${banned}"`);
    }
    plates(r).forEach((x) => assert(!/error|broken/i.test(String(x.props.className)),
      "and no error styling"));
  });

  test("every card surface degrades the same way", () => {
    const surfaces = [
      ["profile binder", (r) => goProfile(r, "Ellen Fisher")],
      ["network binder", (r) => click(btns(r, "Trade Binder")[0])],
      ["inventory", (r) => click(btnExact(r, "Inventory37"))],
      ["drilldown", (r) => { click(btnExact(r, "Opportunities22")); click(btns(r, "TP 4")[0]); }],
    ];
    surfaces.forEach(([label, go]) => {
      const r = render();
      go(r);
      failImages(r);
      const p = plates(r);
      assert(p.length > 0, label + " renders plates");
      p.forEach((x) => assert(text(x).length > 0, label + ": every plate names its card"));
    });
  });

  test("small plates show the name rather than overflowing", () => {
    const r = render();
    click(btnExact(r, "Opportunities22"));
    click(btns(r, "TP 4")[0]);
    failImages(r);
    plates(r).filter((x) => x.props.style.width < 54).forEach((x) => {
      const t = text(x);
      assert(t.length > 0, "still identifies the card: " + t);
      assert(!/#\d/.test(t), "without cramming in metadata that cannot fit: " + t);
    });
  });

  test("a card with no catalog match is handled the same way", () => {
    const r = render();
    goProfile(r, "Ellen Fisher");
    failImages(r);
    plates(r).forEach((x) => assert(x.props.title && x.props.title.length > 0,
      "a tooltip always names the card"));
  });

  test("interaction is unaffected when artwork is missing", () => {
    const r = render();
    goProfile(r, "Ellen Fisher");
    failImages(r);
    eq(byClass(r, "cp-bind").length, 6, "every card still renders");
    const toggle = byClass(r, "cp-bind-x")[0];
    const was = toggle.props["aria-pressed"];
    click(toggle);
    assert(byClass(r, "cp-bind-x")[0].props["aria-pressed"] !== was, "and stays interactive");
  });
});

require("./run.cjs").run();
