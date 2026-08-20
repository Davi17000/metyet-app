const { describe, test, assert, eq } = require("./run.cjs");
const { render, text, allText, btn, btns, btnExact, click, byClass, byClassIn } = require("./util.cjs");

const navItems = (r) => byClass(r, "sb-item");
const navLabels = (r) => navItems(r).map((n) => text(byClassIn(n, "lbl")[0]));
const current = (r) => {
  const on = navItems(r).find((n) => n.props["aria-current"] === "page");
  return on ? text(byClassIn(on, "lbl")[0]) : null;
};
const go = (r, label) => click(navItems(r).find((n) => text(byClassIn(n, "lbl")[0]) === label));

describe("1. Primary navigation order", () => {
  test("it renders Collector Network, Inventory, Opportunities in that order", () => {
    eq(navLabels(render()).join(" > "), "Collector Network > Inventory > Opportunities",
      "who I serve, what I hold, where they intersect");
  });

  test("there are exactly three primary destinations", () => {
    eq(navItems(render()).length, 3, "no section was added or lost");
  });

  test("labels, icons and counts are unchanged", () => {
    const r = render();
    navItems(r).forEach((n) => {
      assert(n.findAllByType("svg").length === 1, "each item keeps its icon");
      assert(byClassIn(n, "cnt")[0], "and its count");
    });
    const counts = navItems(r).map((n) => text(byClassIn(n, "cnt")[0]));
    eq(counts.join(","), "13,37,22", "collectors, inventory, active opportunities");
  });
});

describe("2. Default landing", () => {
  test("the session opens on Collector Network", () => {
    const r = render();
    eq(current(r), "Collector Network", "the inputs come before their consequences");
  });

  test("the network content is what actually renders on load", () => {
    const t = allText(render());
    assert(t.includes("Invite collector"), "the collector network page is showing");
    assert(t.includes("All collectors") || t.includes("Collector"), "its own content, not a redirect");
  });

  test("landing on the network does not open any opportunity surface", () => {
    const r = render();
    eq(byClass(r, "lc").length, 0, "no lifecycle map");
    eq(byClass(r, "ws").length, 0, "and no workspace");
  });
});

describe("3–5. Every section stays directly reachable", () => {
  test("Inventory opens from the landing page", () => {
    const r = render();
    go(r, "Inventory");
    eq(current(r), "Inventory", "marked current");
    assert(allText(r).includes("Add card"), "and its content rendered");
  });

  test("Opportunities opens directly, with no prior visits required", () => {
    const r = render();
    go(r, "Opportunities");
    eq(current(r), "Opportunities", "reachable in one click from a cold start");
    eq(byClass(r, "lc").length, 1, "the lifecycle map rendered");
  });

  test("Collector Network is reachable again from anywhere", () => {
    const r = render();
    go(r, "Opportunities");
    go(r, "Collector Network");
    eq(current(r), "Collector Network", "returned");
    assert(allText(r).includes("Invite collector"), "with its content");
  });

  test("arbitrary navigation between all three works", () => {
    const r = render();
    const order = ["Inventory", "Opportunities", "Collector Network", "Opportunities",
      "Inventory", "Collector Network"];
    order.forEach((label) => {
      go(r, label);
      eq(current(r), label, "navigated to " + label);
    });
  });

  test("only one section is ever marked current", () => {
    const r = render();
    ["Inventory", "Opportunities", "Collector Network"].forEach((label) => {
      go(r, label);
      eq(navItems(r).filter((n) => n.props["aria-current"] === "page").length, 1,
        "exactly one active item at " + label);
    });
  });
});

describe("6. Inventory sub-navigation is untouched", () => {
  test("the tabs keep their order", () => {
    const r = render();
    go(r, "Inventory");
    eq(byClass(r, "tab").map(text).join(" > "), "Current > Coverage > Cultivate",
      "sub-navigation is out of scope and unchanged");
  });

  test("each sub-tab still opens its own view", () => {
    const r = render();
    go(r, "Inventory");
    click(btns(r, "Coverage")[0]);
    assert(allText(r).includes("Explicit demand"), "Coverage");
    click(btns(r, "Cultivate")[0]);
    assert(allText(r).includes("Network demand"), "Cultivate");
    click(btns(r, "Current")[0]);
    assert(byClass(r, "inv-row").length > 0, "Current");
  });
});

describe("7–9. Suggestion, not enforcement", () => {
  test("no step numbering or progress UI was introduced", () => {
    const r = render();
    const nav = text(byClass(r, "sb")[0]);
    for (const banned of ["Step 1", "Step 2", "Step 3", "1.", "2.", "3."]) {
      assert(!nav.includes(banned), `no numbering: "${banned}"`);
    }
    eq(byClass(r, "sb-step").length, 0, "no step affordance");
    eq(byClass(r, "sb-progress").length, 0, "no progress indicator");
  });

  test("nothing is gated, disabled or badged", () => {
    const r = render();
    navItems(r).forEach((n) => {
      assert(!n.props.disabled, "every destination is enabled from a cold start");
      assert(!/badge|lock|todo|done/i.test(String(n.props.className)), "no invented state");
    });
  });

  test("no onboarding prompt or review requirement appears", () => {
    const r = render();
    // scoped to the nav and the landing page chrome; "Next step" is existing
    // opportunity vocabulary and unrelated to workflow gating
    const t = text(byClass(r, "sb")[0]) + text(byClass(r, "ph")[0] || { children: [] });
    for (const banned of ["Review Network first", "Get started", "Complete this step",
      "Review your inventory first", "You must", "Next \u2192"]) {
      assert(!t.includes(banned), `no workflow prompt: "${banned}"`);
    }
    assert(!/\bStep \d/.test(allText(r)), "and no step language anywhere");
  });

  test("Opportunities works fully without visiting the other sections first", () => {
    const r = render();
    go(r, "Opportunities");
    // open a stage queue and launch a workspace, straight from a cold start
    const row = byClass(r, "lc-row").find((n) => String(n.props.className).includes("n-value-trade"));
    click(row.findAllByType("button")[0]);
    eq(byClass(r, "lc-open").length, 1, "the queue opened");
    const open = byClass(r, "lc-open")[0].findAllByType("button").find((b) => text(b).trim() === "Open");
    click(open);
    eq(byClass(r, "ws").length, 1, "and the workspace launched — nothing was gated");
  });
});

describe("10–11. State and alternate surfaces", () => {
  test("navigation behaviour is unchanged by the reorder", () => {
    const r = render();
    go(r, "Inventory");
    click(btns(r, "Coverage")[0]);
    assert(allText(r).includes("Explicit demand"), "on the Coverage tab");
    go(r, "Opportunities");
    go(r, "Inventory");
    /* Sections have always remounted on switch, so Inventory returns to Current.
       That is pre-existing behaviour and the reorder must not alter it either way. */
    assert(byClass(r, "inv-row").length > 0, "Inventory reopens on Current, as it always did");
    eq(byClass(r, "tab").map(text).join(","), "Current,Coverage,Cultivate", "with its tabs intact");
  });

  test("there is one navigation implementation, so no surface can drift", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    const navs = src.match(/label: "Collector Network"/g) || [];
    eq(navs.length, 1, "a single items array defines the order");
    eq((src.match(/className="sb-nav"/g) || []).length, 1, "and a single rendered nav");
  });

  test("the order is defined by data, not duplicated markup", () => {
    const r = render();
    const nav = byClass(r, "sb-nav")[0];
    eq(nav.findAllByType("button").length, 3, "three buttons from one map");
    eq(navLabels(r).join(","), "Collector Network,Inventory,Opportunities", "in data order");
  });
});

require("./run.cjs").run();
