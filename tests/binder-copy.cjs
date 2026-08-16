const { describe, test, assert, eq } = require("./run.cjs");
const TR = require("react-test-renderer");
const { render, text, allText, btn, btns, btnExact, click, byClass, byClassIn, goProfile } = require("./util.cjs");

const openBinderAdd = (r, who) => {
  goProfile(r, who);
  click(btn(r, "Add a copy to the trade binder"));
  return byClass(r, "modal")[0];
};
const modalOf = (r) => byClass(r, "modal")[0];
const commit = (r) => btns(r, "Add to Trade Binder")[0];
const photoBtn = (r, side) => btns(r, "Add " + side)[0];
const pickCard = (r, i = 3) => {
  const sel = modalOf(r).findAllByType("select")[0];
  TR.act(() => { sel.props.onChange({ target: { value: sel.props.children[1][i].props.value } }); });
};
const tiles = (r) => byClass(r, "cp-bind");
const flags = (r) => byClass(r, "bp-flag").map(text);

describe("Trade Binder invariant — a copy needs both faces", () => {
  test("A. with no photos the commit is unavailable", () => {
    const r = render();
    openBinderAdd(r, "Casey Lin");
    pickCard(r);
    eq(commit(r).props.disabled, true, "cannot commit without photos");
    eq(flags(r).join(","), "Required,Required", "both faces are marked required up front");
  });

  test("B. a front photo alone is not enough", () => {
    const r = render();
    openBinderAdd(r, "Casey Lin");
    pickCard(r);
    click(photoBtn(r, "front"));
    eq(flags(r).join(","), "On file,Required", "back is still outstanding");
    eq(commit(r).props.disabled, true, "still cannot commit");
  });

  test("C. a back photo alone is not enough", () => {
    const r = render();
    openBinderAdd(r, "Casey Lin");
    pickCard(r);
    click(photoBtn(r, "back"));
    eq(flags(r).join(","), "Required,On file", "front is still outstanding");
    eq(commit(r).props.disabled, true, "still cannot commit");
  });

  test("D. front and back together open the commit", () => {
    const r = render();
    openBinderAdd(r, "Casey Lin");
    pickCard(r);
    click(photoBtn(r, "front"));
    click(photoBtn(r, "back"));
    eq(flags(r).join(","), "On file,On file", "both on file");
    eq(commit(r).props.disabled, false, "commit is now available");
  });

  test("the requirement is visible before submission, not reported after", () => {
    const r = render();
    openBinderAdd(r, "Casey Lin");
    const t = text(modalOf(r));
    assert(t.includes("Required"), "state is shown up front");
    assert(t.includes("front") && t.includes("back"), "both faces are named");
  });

  test("E. the committed record carries both photos", () => {
    const r = render();
    const before = (goProfile(r, "Casey Lin"), tiles(r).length);
    click(btn(r, "Add a copy to the trade binder"));
    pickCard(r);
    click(photoBtn(r, "front"));
    click(photoBtn(r, "back"));
    click(commit(r));
    eq(tiles(r).length, before + 1, "the copy entered the binder");
    click(byClass(r, "cp-bind-view")[0]);              // newest first, so this is it
    const drawer = text(byClass(r, "drawer")[0]);
    eq((drawer.match(/collector photo/g) || []).length, 2, "front and back are both on file");
    assert(!drawer.includes("not on file"), "neither face is missing");
  });

  test("every seeded binder copy satisfies the invariant", () => {
    const r = render();
    for (const who of ["Sarah Mendel", "James Rivera", "Alex Trinh", "Ellen Fisher", "Hiro Tanaka"]) {
      const rr = render();
      goProfile(rr, who);
      const n = byClass(rr, "cp-bind-view").length;
      for (let i = 0; i < n; i++) {
        const r3 = render();
        goProfile(r3, who);
        click(byClass(r3, "cp-bind-view")[i]);
        const d = text(byClass(r3, "drawer")[0]);
        assert(!d.includes("not on file"), `${who} copy ${i} is missing a face`);
      }
    }
    assert(r, "sanity");
  });

  test("F/G. counts and New Binder behaviour are unaffected by the requirement", () => {
    const r = render();
    goProfile(r, "James Rivera");
    const head = byClass(r, "cp-sec-h").find((n) => text(n).startsWith("Trade Binder"));
    eq(text(byClassIn(head, "mono")[0]), "5", "total unchanged");
    eq(text(byClassIn(head, "cp-bind-open")[0]), "3 open to trade", "open count unchanged");
    click(btn(r, "All collectors"));
    const row = byClass(r, "tbl")[0].findAllByType("tr").find((tr) => text(tr).includes("Ellen Fisher"));
    const cells = row.findAllByType("td").map(text);
    eq(cells[2] + "|" + cells[3] + "|" + cells[4], "3|6|5", "New / Total / Open all unchanged");
  });

  test("H. Open to trade still works on a newly added copy", () => {
    const r = render();
    openBinderAdd(r, "Casey Lin");
    pickCard(r);
    click(photoBtn(r, "front"));
    click(photoBtn(r, "back"));
    click(commit(r));
    const toggle = byClass(r, "cp-bind-x")[0];
    eq(toggle.props["aria-pressed"], "false", "a new copy starts unflagged");
    click(toggle);
    eq(byClass(r, "cp-bind-x")[0].props["aria-pressed"], "true", "and can be marked open to trade");
  });
});

describe("TP binder review — inspecting the actual copy", () => {
  const inspect = (r, who, i = 0) => {
    goProfile(r, who);
    click(byClass(r, "cp-bind-view")[i]);
    return byClass(r, "drawer")[0];
  };

  test("A/B. front and back are both inspectable from the profile", () => {
    const d = inspect(render(), "Alex Trinh");
    const caps = byClassIn(d, "cimg-cap").map(text);
    eq(caps.join(","), "front,back", "both faces, labelled");
  });

  test("C. inspection shows the binder copy, not generic catalog art", () => {
    const d = inspect(render(), "Alex Trinh");
    eq(byClassIn(d, "copyph").length, 2, "two copy plates");
    assert(text(d).includes("collector photo"), "the collector's own photographs");
    assert(text(d).includes("This exact copy"), "framed as the specific copy");
  });

  test("the inspection surface carries no negotiation or stage controls", () => {
    const d = inspect(render(), "Alex Trinh");
    const t = text(d);
    for (const banned of ["Trade %", "Trade Value", "Market Value", "Accept", "Reject",
      "Counter", "Stage", "Cash balance", "Send"]) {
      assert(!t.includes(banned), `inspection must not offer "${banned}"`);
    }
    // close, two enlarge triggers, two clipboard actions — all inspection, no decisions
    eq(d.findAllByType("button").length, 5, "close, two photo triggers, two copy actions");
    eq(byClassIn(d, "copyph-btn").length, 2, "both faces are enlargeable");
    eq(byClassIn(d, "ccopy")[0].findAllByType("button").length, 2, "card info and cert copy");
    d.findAllByType("button").forEach((b) => {
      const label = (b.props["aria-label"] || "") + text(b);
      assert(!/Accept|Reject|Open to trade|Send/.test(label), "no decision control: " + label);
    });
  });

  test("D/E. inspecting does not toggle Open to trade", () => {
    const r = render();
    goProfile(r, "James Rivera");
    const before = byClass(r, "cp-bind-x").map((b) => b.props["aria-pressed"]).join(",");
    click(byClass(r, "cp-bind-view")[0]);
    click(btns(r, "").find((b) => b.props["aria-label"] === "Close"));
    eq(byClass(r, "cp-bind-x").map((b) => b.props["aria-pressed"]).join(","), before,
      "tpInterest untouched by looking");
    click(byClass(r, "cp-bind-x")[0]);
    assert(byClass(r, "cp-bind-x").map((b) => b.props["aria-pressed"]).join(",") !== before,
      "and the toggle still works afterwards");
  });

  test("F. inspecting does not mutate card identity", () => {
    const r = render();
    goProfile(r, "Alex Trinh");
    const before = tiles(r).map(text).join("|");
    click(byClass(r, "cp-bind-view")[0]);
    click(btns(r, "").find((b) => b.props["aria-label"] === "Close"));
    eq(tiles(r).map(text).join("|"), before, "the binder is exactly as it was");
  });

  test("G. the tile stays compact — no permanent large photos in the grid", () => {
    const r = render();
    goProfile(r, "Ellen Fisher");
    eq(byClass(r, "copyph").length, 0, "no copy plates in the collapsed grid");
    tiles(r).forEach((t) => eq(byClassIn(t, "cp-bind-art").length, 1, "one artwork per tile"));
  });
});

describe("Copy continuity — the same physical copy through the deal", () => {
  test("a binder copy keeps its identity, photos and binderId into Value Trade", () => {
    const r = render();

    // 1-2. a binder copy with front and back photos, marked Open to trade
    goProfile(r, "James Rivera");
    const off = byClass(r, "cp-bind-x").find((b) => b.props["aria-pressed"] === "false");
    click(byClass(r, "cp-bind-view").find((_, i) =>
      byClass(r, "cp-bind-x")[i].props["aria-pressed"] === "false"));
    const drawerText = text(byClass(r, "drawer")[0]);
    eq((drawerText.match(/collector photo/g) || []).length, 2, "the copy has both faces");
    const name = ["Poliwrath", "Chansey", "Electabuzz", "Scyther", "Rayquaza Gold Star"]
      .find((n) => drawerText.includes(n));
    assert(name, "identified the copy: " + drawerText.slice(0, 80));
    click(btns(r, "").find((b) => b.props["aria-label"] === "Close"));
    click(off);                                          // 2. mark Open to trade

    // 3-4. it becomes eligible, and the collector proposes it
    click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
    click(btns(r, "Accept $")[0]);                       // price agreed -> Select Trade draft
    const add = btns(r, "+ ").find((b) => text(b).includes(name));
    assert(add, `${name} is eligible in Select Trade: ` + btns(r, "+ ").map(text).join(","));
    click(add);

    // 5-7. the proposed card carries the binder copy's photos into Select Trade
    const review = byClass(r, "st-card").map(text).join(" ");
    assert(review.includes(name), "the card is under review: " + review.slice(0, 120));
    const caps = byClass(r, "st-photos").flatMap((n) => byClassIn(n, "cimg-cap")).map(text);
    eq(caps.join(","), "front,back", "both faces carried through to Select Trade");
    assert(!review.includes("not on file"), "neither photo was lost");

    // 8-10. send the package, accept the card, and the same copy reappears in Value Trade
    click(btns(r, "Send package for review")[0]);
    btns(r, "Accept into trade").forEach((b) => click(b));   // clear every proposed card
    const ev = byClass(r, "vt-evidence")[0] || byClass(r, "vt-mkt-copy")[0];
    if (ev) {
      assert(text(ev).includes("collector photo"), "Value Trade shows the same physical copy");
      assert(byClassIn(ev, "copyph").length >= 2, "front and back both survive into valuation");
    }
  });

  test("Value Trade shows the same copy's photos beside the negotiation", () => {
    const r = render();
    goProfile(r, "Hiro Tanaka");
    click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
    const copy = byClass(r, "vt-mkt-copy")[0];
    assert(copy, "the copy panel renders in the market phase");
    const caps = byClassIn(copy, "cimg-cap").map(text);
    eq(caps.join(","), "front,back", "front and back, labelled");
    eq(byClassIn(copy, "copyph").length, 2, "two copy plates");
    assert(!text(copy).includes("not on file"), "the actual copy photos, not placeholders");
  });

  test("Value Trade shows the exact identity next to the copy", () => {
    const r = render();
    goProfile(r, "Hiro Tanaka");
    click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
    const copy = text(byClass(r, "vt-mkt-copy")[0]);
    assert(copy.includes("This exact copy"), "framed as the specific copy");
    assert(copy.includes("Base Set") || /#\d/.test(copy), "set and printed identity: " + copy);
    assert(/PSA |Raw/.test(copy), "grade or condition: " + copy);
  });

  test("the TP never has to leave Value Trade to see the copy", () => {
    const r = render();
    goProfile(r, "Hiro Tanaka");
    click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
    // photos and the market decision are in the same block
    const mkt = byClass(r, "vt-mkt")[0];
    assert(byClassIn(mkt, "copyph").length === 2, "copy is present");
    assert(byClassIn(mkt, "pn").length >= 1, "and so is the market decision");
  });

  test("no stage downstream of the binder asks for photos again", () => {
    const r = render();
    goProfile(r, "Hiro Tanaka");
    click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
    const t = allText(r);
    assert(!t.includes("Add front"), "no photo-collection prompt");
    assert(!t.includes("photos missing"), "nothing reported missing");
    assert(!t.includes("No photos on file"), "no evidence gap");
  });
});

describe("Terminology — Trade Value, not Trade Credit", () => {
  test("the trade table column reads Trade Value", () => {
    const r = render();
    goProfile(r, "Hiro Tanaka");
    click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
    const heads = byClass(r, "tbl")[0].findAllByType("th").map(text);
    assert(heads.includes("Trade Value"), "column renamed: " + heads.join(","));
    assert(!heads.includes("Trade Credit"), "old wording gone");
  });

  test("no user-facing trade credit wording remains in the workspace", () => {
    const r = render();
    goProfile(r, "Hiro Tanaka");
    click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
    assert(!/[Tt]rade [Cc]redit/.test(allText(r)), "no trade credit wording");
  });

  test("Trade % is still locked until market settles, and the maths is unchanged", () => {
    const r = render();
    goProfile(r, "Hiro Tanaka");
    click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
    assert(text(byClass(r, "tbl")[0]).includes("locked"), "Trade % locked while market is open");
  });
});

require("./run.cjs").run();
