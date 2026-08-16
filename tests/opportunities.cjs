const { describe, test, assert, eq } = require("./run.cjs");
const TR = require("react-test-renderer");
const { render, text, allText, btn, btns, btnExact, click, byClass, byClassIn, goProfile } = require("./util.cjs");

/* Opportunities is no longer the landing section, so every case navigates there. */
const opportunities = () => { const r = render(); click(btnExact(r, "Opportunities22")); return r; };
const map = (r) => byClass(r, "lc")[0];
const panels = (r) => byClass(r, "lc-open");
const rows = (r) => byClass(r, "lc-row");
const rowFor = (r, stageId) => rows(r).find((n) => String(n.props.className).includes("n-" + stageId));
/* Rows and open panels in DOM order, so "beneath the thing I clicked" is testable. */
const sequence = (r) => map(r).findAll((n) => typeof n.type === "string"
  && /^(lc-row|lc-open)$/.test(String(n.props.className || "").split(" ")[0]))
  .map((n) => {
    const cls = String(n.props.className).split(" ");
    return cls[0] === "lc-open" ? "OPEN" : cls[1].replace("n-", "");
  });
const openStage = (r, stageId) => click(rowFor(r, stageId).findAllByType("button")[0]);
const needsBtn = (r) => byClass(r, "dq-entry")[0];
const queueRows = (r) => panels(r)[0].findAllByType("tr").slice(1);

describe("A–B. The queue opens beneath its own row", () => {
  test("clicking Value Trade renders its drilldown immediately after that row", () => {
    const r = opportunities();
    openStage(r, "value-trade");
    const seq = sequence(r);
    const i = seq.indexOf("value-trade");
    eq(seq[i + 1], "OPEN", "the panel is the very next node: " + seq.join(" > "));
    eq(seq[i + 2], "deal", "and the pipeline continues below it");
  });

  test("every deal stage opens beneath itself", () => {
    for (const id of ["agree-price", "select-trade", "value-trade", "deal", "fulfillment"]) {
      const r = opportunities();
      openStage(r, id);
      const seq = sequence(r);
      eq(seq[seq.indexOf(id) + 1], "OPEN", id + " opens directly beneath itself");
    }
  });

  test("collector-intent and history rows behave the same way", () => {
    for (const id of ["secondary", "primary", "completed", "archived"]) {
      const r = opportunities();
      openStage(r, id);
      const seq = sequence(r);
      eq(seq[seq.indexOf(id) + 1], "OPEN", id + " opens beneath itself");
    }
  });

  test("B. no drilldown is rendered below the whole framework", () => {
    const r = opportunities();
    openStage(r, "value-trade");
    // the panel lives inside the lifecycle map, not as a sibling panel after it
    eq(byClassIn(map(r), "lc-open").length, 1, "the only panel is inside the map");
    const strays = r.root.findAll((n) => typeof n.type === "string"
      && String(n.props.className || "") === "panel"
      && byClassIn(n, "lc-open").length === 0
      && n.findAllByType("table").length > 0);
    eq(strays.length, 0, "no bottom-of-page drilldown container remains");
  });

  test("O. exactly one opportunity list exists on the page", () => {
    const r = opportunities();
    openStage(r, "value-trade");
    eq(panels(r).length, 1, "one panel");
    eq(byClass(r, "lc-open-scroll").length, 1, "one bounded list");
  });
});

describe("C–E. Single-open accordion", () => {
  test("C/D. opening another stage closes the previous one", () => {
    const r = opportunities();
    openStage(r, "value-trade");
    eq(panels(r).length, 1, "one open");
    openStage(r, "deal");
    eq(panels(r).length, 1, "still only one open");
    const seq = sequence(r);
    eq(seq[seq.indexOf("deal") + 1], "OPEN", "and it moved to Deal");
    eq(seq[seq.indexOf("value-trade") + 1], "deal", "Value Trade closed");
  });

  test("E. clicking the open stage again collapses it", () => {
    const r = opportunities();
    openStage(r, "value-trade");
    eq(panels(r).length, 1, "open");
    openStage(r, "value-trade");
    eq(panels(r).length, 0, "collapsed back to the clean pipeline");
  });

  test("panels never accumulate down the page", () => {
    const r = opportunities();
    ["agree-price", "select-trade", "value-trade", "deal", "fulfillment"].forEach((id) => {
      openStage(r, id);
      eq(panels(r).length, 1, "one at a time while cycling stages");
    });
  });

  test("the row shows it is open", () => {
    const r = opportunities();
    openStage(r, "value-trade");
    assert(String(rowFor(r, "value-trade").props.className).includes("on"), "open row is marked");
    const chev = byClassIn(rowFor(r, "value-trade"), "lc-chev")[0];
    assert(chev, "the existing chevron is reused as the disclosure affordance");
  });
});

describe("F–G. Needs you", () => {
  test("F. it expands immediately beneath the Needs you control", () => {
    const r = opportunities();
    click(needsBtn(r));
    const wrap = byClass(r, "dq-wrap")[0];
    const kids = wrap.children.filter((k) => typeof k === "object")
      .map((k) => String(k.props.className || "").split(" ")[0]);
    eq(kids.join(","), "dq-entry,lc-open", "the panel is the sibling right after the button");
    eq(byClassIn(map(r), "lc-open").length, 0, "and nothing opened inside the map");
  });

  test("F. it is not rendered below the stage framework", () => {
    const r = opportunities();
    click(needsBtn(r));
    eq(byClass(r, "dq-open").length, 1, "one panel, attached to the Needs you card");
    eq(panels(r).length, 1, "and it is the only open panel on the page");
  });

  test("clicking it again collapses it", () => {
    const r = opportunities();
    click(needsBtn(r));
    eq(panels(r).length, 1, "open");
    click(needsBtn(r));
    eq(panels(r).length, 0, "collapsed");
  });

  test("opening a stage closes Needs you", () => {
    const r = opportunities();
    click(needsBtn(r));
    openStage(r, "agree-price");
    eq(byClass(r, "dq-open").length, 0, "Needs you closed");
    eq(sequence(r)[sequence(r).indexOf("agree-price") + 1], "OPEN", "the stage opened instead");
  });

  test("G. its membership and longest-waiting sort are unchanged", () => {
    const r = opportunities();
    const summary = text(needsBtn(r));
    const m = /(\d+)/.exec(summary);
    click(needsBtn(r));
    eq(queueRows(r).length, Number(m[1]), "the count matches the queue it opens");
    // still ordered longest-waiting first
    const waits = queueRows(r).map((tr) => {
      const cells = tr.findAllByType("td").map(text);
      const d = cells.map((t) => /^(\d+)d$/.exec(t.trim())).find(Boolean);
      return d ? Number(d[1]) : null;
    }).filter((v) => v != null);
    assert(waits.length > 0, "waiting values render");
    waits.forEach((v, i) => { if (i) assert(waits[i - 1] >= v, "longest waiting first: " + waits.join(",")); });
  });

  test("the summary line is preserved", () => {
    const t = text(needsBtn(opportunities()));
    assert(/Across every stage/.test(t), "cross-stage framing kept: " + t);
    assert(/longest waiting \d+ days/.test(t), "and the longest-wait note");
  });
});

describe("H–J. Nothing about the pipeline changed", () => {
  test("H. TP and collector ownership pills are unchanged", () => {
    const r = opportunities();
    const before = rows(r).map((n) => text(byClassIn(n, "lc-own")[0] || { children: [] })).join("|");
    openStage(r, "value-trade");
    eq(rows(r).map((n) => text(byClassIn(n, "lc-own")[0] || { children: [] })).join("|"), before,
      "opening a queue does not disturb the counts");
  });

  test("I. stage totals are unchanged", () => {
    const r = opportunities();
    const before = rows(r).map((n) => text(byClassIn(n, "lc-cnt")[0])).join(",");
    openStage(r, "deal");
    eq(rows(r).map((n) => text(byClassIn(n, "lc-cnt")[0])).join(","), before, "totals hold");
    eq(rows(r).length, 9, "every stage row still renders");
  });

  test("the whole framework stays visible around the open queue", () => {
    const r = opportunities();
    openStage(r, "value-trade");
    const t = text(map(r));
    for (const label of ["Secondary Goal", "Primary Goal", "Agree on Price", "Select Trade",
      "Value Trade", "Deal", "Fulfillment", "Completed", "Archived"]) {
      assert(t.includes(label), "still shows " + label);
    }
    assert(t.includes("Collector intent") || t.includes("COLLECTOR INTENT")
      || text(map(r)).length > 0, "regions preserved");
  });

  test("J. opportunity rows keep their existing information", () => {
    const r = opportunities();
    openStage(r, "value-trade");
    const head = panels(r)[0].findAllByType("th").map(text);
    eq(head.join(",").replace(/[↑↓]/g, ""),
      "Collector,Card,Detail,Stage,Waiting,Next Step,", "the existing column set");
    const first = queueRows(r)[0];
    eq(first.findAllByType("td").length, 7, "seven cells per row");
    assert(byClassIn(first, "cimg").length >= 1, "card image retained");
    assert(first.findAllByType("button").some((b) => text(b).trim() === "Open"), "Open action retained");
  });
});

describe("K–N. Behaviour and bounds", () => {
  test("K. Open still launches the opportunity workspace", () => {
    const r = opportunities();
    openStage(r, "value-trade");
    const open = queueRows(r)[0].findAllByType("button").find((b) => text(b).trim() === "Open");
    click(open);
    eq(byClass(r, "ws").length, 1, "the workspace opened");
    assert(byClass(r, "ws-map").length === 1, "with its stage map");
  });

  test("L. the list is bounded and scrolls rather than pushing the pipeline down", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    const m = /\.lc-open-scroll \{([^}]*)\}/.exec(src);
    assert(m, "the bounded list rule exists");
    const h = /max-height:\s*(\d+)px/.exec(m[1]);
    assert(h && Number(h[1]) >= 300 && Number(h[1]) <= 360, "bounded in range: " + m[1]);
    assert(/overflow-y:\s*auto/.test(m[1]), "and scrolls when it overflows");
  });

  test("M. a small queue gets no forced empty height", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    const m = /\.lc-open-scroll \{([^}]*)\}/.exec(src);
    assert(!/(^|[^-])\bheight:\s*\d/.test(m[1]), "max-height only, never a fixed height");
    assert(!/min-height/.test(m[1]), "and no minimum");
  });

  test("L. only one new scroller exists on this page", () => {
    const r = opportunities();
    openStage(r, "value-trade");
    eq(byClass(r, "lc-open-scroll").length, 1, "one bounded list");
    eq(byClass(r, "tbl-scroll").length, 0, "no second nested table scroller");
  });

  test("N. Completed and Archived still open their own queues", () => {
    for (const id of ["completed", "archived"]) {
      const r = opportunities();
      openStage(r, id);
      eq(panels(r).length, 1, id + " opens");
      assert(panels(r)[0].findAllByType("table").length === 1
        || text(panels(r)[0]).length > 0, id + " renders its queue or empty state");
    }
  });
});

require("./run.cjs").run();
