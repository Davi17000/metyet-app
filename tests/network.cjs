const { describe, test, assert, eq } = require("./run.cjs");
const { render, text, allText, btn, btns, btnExact, click, byClass, byClassIn, goProfile } = require("./util.cjs");

/* ---- table readers --------------------------------------------------------
   Everything is read from the rendered table, so the assertions are about what
   the Trusted Partner actually sees rather than about internal shape. */
const toNetwork = (r) => { click(btnExact(r, "Collector Network13")); return r; };
const table = (r) => byClass(r, "tbl")[0];
const headers = (r) => table(r).findAllByType("th");
const headerText = (r) => headers(r).map((h) => text(h).replace(/[↑↓]/g, "").trim());
const bodyRows = (r) => table(r).findAllByType("tr").slice(1);
const cells = (tr) => tr.findAllByType("td");
const rowFor = (r, name) => bodyRows(r).find((tr) => text(cells(tr)[0]).includes(name));
const COL = { name: 0, since: 1, newb: 2, total: 3, open: 4, deals: 5, value: 6, coverage: 7 };
const cellText = (r, name, col) => text(cells(rowFor(r, name))[COL[col]]);
const columnOrder = (r, col) => bodyRows(r).map((tr) => text(cells(tr)[COL[col]]));
const sortBy = (r, label) => click(headers(r).find((h) => text(h).includes(label)).findByType("button"));

const net = () => toNetwork(render());

describe("Collector Network — column layout", () => {
  test("columns are in the specified order", () => {
    eq(headerText(net()).join(" | "),
      "Collector | Member since | New binder | Total binder | Open to trade | Completed deals | Deal value | Coverage",
      "column order");
  });

  test("the old binder column shapes are gone", () => {
    const heads = headerText(net());
    assert(!heads.includes("Trade binder"), "the combined column is gone");
    assert(!heads.includes("Trade binder additions"), "the old additions column is gone");
    assert(!heads.includes("Total trade binder"), "the old total column is gone");
  });

  test("no extra action column was added", () => {
    const r = net();
    eq(headers(r).length, 8, "eight columns exactly");
    bodyRows(r).forEach((tr) => eq(cells(tr).length, 8, "each row has eight cells"));
  });
});

describe("Collector Network — the three binder columns", () => {
  const triple = (r, name) => [cellText(r, name, "newb"), cellText(r, name, "total"), cellText(r, name, "open")].join(" | ");

  test("each collector renders three bare numbers", () => {
    const r = net();
    eq(triple(r, "Ellen Fisher"), "3 | 6 | 5", "three new, six shared, five open");
    eq(triple(r, "James Rivera"), "2 | 5 | 3", "two of James's five are unflagged");
    eq(triple(r, "Alex Trinh"), "1 | 2 | 2", "both of Alex's are open to trade");
    eq(triple(r, "Casey Lin"), "1 | 2 | 1", "a new unreviewed copy alongside her flagged one");
  });

  test("a collector with nothing shared renders 0 | 0 | 0", () => {
    const r = render();
    click(btnExact(r, "Collector Network13"));
    click(btn(r, "Invite collector"));
    const inputs = byClass(r, "modal")[0].findAllByType("input");
    const set = (i, v) => require("react-test-renderer").act(() => inputs[i].props.onChange({ target: { value: v } }));
    set(0, "Wendy Okafor"); set(1, "wendy@example.com"); set(2, "Fargo, ND");
    click(btn(r, "Send invitation"));
    eq(triple(r, "Wendy Okafor"), "0 | 0 | 0", "empty binder");
  });

  test("every binder cell is a bare number, never a formatted string", () => {
    const r = net();
    ["newb", "total", "open"].forEach((col) => {
      columnOrder(r, col).forEach((t) => assert(/^\d+$/.test(t), `${col} must be a bare number, got: ${t}`));
    });
  });

  test("the old formatted strings no longer render anywhere", () => {
    const r = net();
    const t = text(table(r));
    for (const gone of ["1 new", "2 new", "3 new", " total", "·"]) {
      assert(!t.includes(gone), `old combined-cell text still present in the table: "${gone}"`);
    }
  });

  test("a non-zero new count is teal, and zero is quiet", () => {
    const r = net();
    const marked = byClass(r, "net-new");
    eq(marked.length, 9, "one teal marker per collector with unseen additions");
    marked.forEach((m) => assert(/^\d+$/.test(text(m)), "bare number, got: " + text(m)));
    assert(!allText(r).includes("Mark as read"), "no acknowledge affordance");
  });

  test("the three columns stay one row tall", () => {
    const r = net();
    ["newb", "total", "open"].forEach((col) => {
      bodyRows(r).forEach((tr) => {
        const kids = cells(tr)[COL[col]].children.filter((c) => typeof c === "object");
        assert(kids.length <= 1, "no stacked metadata in the binder columns");
      });
    });
  });

  test("total binder counts every shared card regardless of tpInterest", () => {
    const r = net();
    eq(cellText(r, "James Rivera", "total"), "5", "unflagged cards counted");
    eq(cellText(r, "James Rivera", "open"), "3", "but only three are open to trade");
  });
});

describe("Collector Network — Open to trade", () => {
  test("counts only tpInterest cards, as a bare number", () => {
    const r = net();
    eq(cellText(r, "Ellen Fisher", "open"), "5", "five of six flagged");
    eq(cellText(r, "James Rivera", "open"), "3", "three of four flagged");
    eq(cellText(r, "Casey Lin", "open"), "1", "one of one");
    columnOrder(r, "open").forEach((t) => assert(/^\d+$/.test(t), "bare number, got: " + t));
    assert(!allText(r).includes("cards open"), "the header carries the meaning");
  });

  test("it follows tpInterest when a flag changes", () => {
    const r = render();
    goProfile(r, "James Rivera");
    click(byClass(r, "cp-bind-x").find((b) => b.props["aria-pressed"] === "false"));
    click(btn(r, "All collectors"));
    eq(cellText(r, "James Rivera", "open"), "4", "flagging raised the count");
  });

  test("flagging changes neither the total nor the unseen count", () => {
    const r = render();
    goProfile(r, "Ellen Fisher");                 // visiting also reviews Ellen
    const before = byClass(r, "cp-bind-x").filter((b) => b.props["aria-pressed"] === "true").length;
    click(byClass(r, "cp-bind-x").find((b) => b.props["aria-pressed"] === "false"));
    click(btn(r, "All collectors"));
    eq(cellText(r, "Ellen Fisher", "total"), "6", "total unmoved by a flag");
    eq(cellText(r, "Ellen Fisher", "newb"), "0", "reviewed, and flagging did not revive it");
    eq(cellText(r, "Ellen Fisher", "open"), String(before + 1), "open count moved");
    eq(cellText(r, "James Rivera", "newb"), "2", "another collector untouched");
    eq(cellText(r, "James Rivera", "total"), "5", "another collector untouched");
  });

  test("unflagging lowers the count again", () => {
    const r = render();
    goProfile(r, "Ellen Fisher");
    click(byClass(r, "cp-bind-x").find((b) => b.props["aria-pressed"] === "true"));
    click(btn(r, "All collectors"));
    eq(cellText(r, "Ellen Fisher", "open"), "4", "down from five");
    eq(cellText(r, "Ellen Fisher", "total"), "6", "total still six");
  });
});

describe("Collector Network — a profile visit is the review", () => {
  test("visiting from the network clears that collector's additions", () => {
    const r = net();
    eq(cellText(r, "Ellen Fisher", "newb"), "3", "before");
    const openBefore = cellText(r, "Ellen Fisher", "open");
    click(btnExact(r, "Ellen Fisher"));
    click(btn(r, "All collectors"));
    eq(cellText(r, "Ellen Fisher", "newb"), "0", "cleared by the visit");
    eq(cellText(r, "Ellen Fisher", "total"), "6", "total unchanged by a review");
    eq(cellText(r, "Ellen Fisher", "open"), openBefore, "open-to-trade count unchanged by a review");
  });

  test("other collectors' counts are untouched by the visit", () => {
    const r = net();
    click(btnExact(r, "Ellen Fisher"));
    click(btn(r, "All collectors"));
    eq(cellText(r, "James Rivera", "newb"), "2", "James unaffected");
    eq(cellText(r, "Alex Trinh", "newb"), "1", "Alex unaffected");
  });

  test("the review leaves the binder itself alone", () => {
    const r = net();
    const openBefore = cellText(r, "Ellen Fisher", "open");
    click(btnExact(r, "Ellen Fisher"));
    const flagged = byClass(r, "cp-bind-x").map((b) => b.props["aria-pressed"]).join(",");
    eq(flagged, "true,true,true,true,true,false", "tpInterest unchanged by the visit");
    eq(byClass(r, "cp-bind").length, 6, "no cards added or removed");
    click(btn(r, "All collectors"));
    eq(cellText(r, "Ellen Fisher", "total"), "6", "total unchanged");
    eq(cellText(r, "Ellen Fisher", "open"), openBefore, "tpInterest-derived count unchanged");
  });

  test("reaching the profile from an opportunity also counts as a review", () => {
    const r = render();
    // Opportunities -> stage drilldown -> collector, never touching the network table
    click(btnExact(r, "Opportunities22"));
    click(btns(r, "TP 4")[0]);
    const link = btns(r, "James R.")[0];
    assert(link, "found an opportunity-side route to James");
    click(link);
    assert(allText(r).includes("James Rivera") && allText(r).includes("Trade Binder"), "landed on the profile");
    click(btnExact(r, "Collector Network13"));
    eq(cellText(r, "James Rivera", "newb"), "0", "the opportunity-side visit reviewed him");
    eq(cellText(r, "Ellen Fisher", "newb"), "3", "and only him");
  });

  test("reaching the profile from the Trade Binder CTA also counts as a review", () => {
    const r = render();
    goProfile(r, "Alex Trinh");                          // profile visit
    click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
    click(btn(r, "View Alex T.'s Trade Binder"));         // CTA back into the profile
    click(btnExact(r, "Collector Network13"));
    eq(cellText(r, "Alex Trinh", "newb"), "0", "reviewed");
  });
});

describe("Collector Network — sorting", () => {
  /* Read the two numbers back out of the rendered cell so the assertions are about
     the order the TP sees, while proving the comparison itself was numeric. */
  const binderPair = (r) => columnOrder(r, "binder").map((t) => {
    const m = /^(?:(\d+) new · )?(\d+) total$/.exec(t);
    return [Number(m[1] || 0), Number(m[2])];
  });
  const opens = (r) => columnOrder(r, "open").map(Number);
  const isDesc = (a) => a.every((v, i) => i === 0 || a[i - 1] >= v);
  const isAsc = (a) => a.every((v, i) => i === 0 || a[i - 1] <= v);

  const colNums = (r, col) => columnOrder(r, col).map(Number);

  for (const [label, col, top] of [["New binder", "newb", 3], ["Total binder", "total", 6]]) {
    test(`${label} sorts numerically, descending then ascending`, () => {
      const r = net();
      sortBy(r, label);
      const desc = colNums(r, col);
      assert(isDesc(desc), "descending: " + desc.join(","));
      eq(desc[0], top, "largest first");
      sortBy(r, label);
      const asc = colNums(r, col);
      assert(isAsc(asc), "ascending: " + asc.join(","));
      eq(asc[asc.length - 1], top, "largest last");
    });

    test(`${label} starts most-to-least on first click`, () => {
      const r = net();
      sortBy(r, label);                              // first click on a fresh column
      const first = colNums(r, col);
      assert(isDesc(first), "natural direction is most to least: " + first.join(","));
      const head = headers(r).find((h) => text(h).includes(label));
      eq(head.props["aria-sort"], "descending", "and it says so");
    });
  }

  test("Open to trade sorts numerically, descending then ascending", () => {
    const r = net();
    sortBy(r, "Open to trade");
    const desc = opens(r);
    assert(isDesc(desc), "descending: " + desc.join(","));
    eq(desc[0], 5, "largest open-to-trade count first");
    sortBy(r, "Open to trade");
    const asc = opens(r);
    assert(isAsc(asc), "ascending: " + asc.join(","));
    eq(asc[asc.length - 1], 5, "largest last");
  });

  test("existing columns still sort", () => {
    const r = net();
    sortBy(r, "Completed deals");
    const deals = columnOrder(r, "deals").map(Number);
    assert(isDesc(deals), "completed deals descending: " + deals.join(","));
    sortBy(r, "Collector");
    eq(bodyRows(r).length, 13, "all rows still present after a text sort");
    sortBy(r, "Member since");
    eq(bodyRows(r).length, 13, "member since sort keeps every row");
    sortBy(r, "Deal value");
    eq(bodyRows(r).length, 13, "deal value sort keeps every row");
    sortBy(r, "Coverage");
    eq(bodyRows(r).length, 13, "coverage sort keeps every row");
  });

  test("aria-sort is exposed on the active column only", () => {
    const r = net();
    sortBy(r, "Open to trade");
    const active = headers(r).filter((h) => h.props["aria-sort"] !== "none");
    eq(active.length, 1, "one active sort column");
    assert(text(active[0]).includes("Open to trade"), "the one just clicked");
  });
});

describe("Collector Network — column alignment", () => {
  const alignOf = (node) => {
    const cn = String(node.props.className || "");
    if (cn.split(/\s+/).includes("ctr")) return "center";
    if (cn.split(/\s+/).includes("num")) return "right";
    return "left";
  };
  const EXPECTED = ["left", "center", "center", "center", "center", "center", "right", "right"];

  test("headers use the specified alignment", () => {
    eq(headers(net()).map(alignOf).join(","), EXPECTED.join(","), "header alignment");
  });

  test("body cells use the same alignment as their header", () => {
    const r = net();
    bodyRows(r).forEach((tr) => {
      eq(cells(tr).map(alignOf).join(","), EXPECTED.join(","), "row alignment matches headers");
    });
  });

  test("Member since date and elapsed time share one centered axis", () => {
    const r = net();
    const cell = cells(rowFor(r, "Hiro Tanaka"))[COL.since];
    eq(alignOf(cell), "center", "the cell centres both lines");
    const lines = cell.children.filter((c) => typeof c === "object");
    eq(lines.length, 2, "date and elapsed time");
    lines.forEach((l) => assert(!/text-align/.test(JSON.stringify(l.props.style || {})),
      "neither line overrides the shared centre axis"));
    assert(text(lines[0]).includes("2023"), "date line");
    assert(text(lines[1]).includes("days"), "elapsed line");
  });

  test("headers and body share one column definition", () => {
    const r = net();
    const cols = table(r).findAllByType("col");
    eq(cols.length, 8, "one col per column");
    eq(cols.map((c) => c.props.className).join(","),
      "c-name,c-since,c-new,c-tot,c-open,c-deals,c-val,c-cov", "column model");
    eq(headers(r).length, cols.length, "one header per column");
    bodyRows(r).forEach((tr) => eq(cells(tr).length, cols.length, "one cell per column"));
  });

  test("no column absorbs the table's spare width", () => {
    const widths = {};
    const src = require("fs").readFileSync(require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    for (const m of src.matchAll(/\.net-tbl col\.(c-[a-z]+) \{ width: ([\d.]+)%; \}/g)) widths[m[1]] = Number(m[2]);
    eq(Object.keys(widths).length, 8, "every column has an explicit share");
    assert(!/\.net-tbl col\.[a-z-]+ \{ width: auto/.test(src), "no auto column to soak up the slack");
    eq(Math.round(Object.values(widths).reduce((a, b) => a + b) * 10) / 10, 100, "shares sum to the full table");
    assert(widths["c-name"] < 30, "collector no longer takes a third of the table, got " + widths["c-name"] + "%");
    assert(widths["c-name"] > Math.max(...Object.entries(widths).filter(([k]) => k !== "c-name").map(([, v]) => v)),
      "but it is still the widest column");
  });

  test("no cell fixes its own position with ad hoc margins", () => {
    const r = net();
    [...headers(r), ...bodyRows(r).flatMap(cells)].forEach((n) => {
      const style = JSON.stringify(n.props.style || {});
      assert(!/margin/i.test(style), "alignment comes from the column model, not margins: " + style);
      assert(!/textAlign/i.test(style), "alignment comes from the column model, not inline text-align");
    });
  });
});

require("./run.cjs").run();
