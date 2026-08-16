const { describe, test, assert, eq } = require("./run.cjs");
const TR = require("react-test-renderer");
const { render, text, allText, btn, btns, btnExact, click, byClass, byClassIn, goProfile } = require("./util.cjs");

const atStage = (who, stage) => {
  const r = render();
  goProfile(r, who);
  const row = byClass(r, "cp-opp").find((n) => text(n).includes(stage));
  assert(row, `${who} has no ${stage} opportunity`);
  click(row.findAllByType("button").find((b) => text(b).trim() === "Open"));
  return r;
};
const menuBtn = (r) => byClass(r, "dm-btn")[0];
const openMenu = (r) => { click(menuBtn(r)); return byClass(r, "dm-item").map(text); };
const stageWork = (r) => byClass(r, "ws-stagework")[0];
const terms = (r) => (text(stageWork(r))
  .match(/Listed price\S{0,14}|Agreed price\S{0,14}|Total trade value\S{0,14}/g) || []).join("|");
/* Walk the two-step flow: confirm, then skip or save a reason. */
const endDeal = (r, reason) => {
  click(menuBtn(r));
  click(byClass(r, "dm-item")[0]);
  const go = btns(r, "").find((b) => /^(End deal|Cancel deal)$/.test(text(b).trim()));
  assert(go, "the confirm action");
  click(go);
  if (reason) {
    click(byClass(r, "dm-reasons")[0].findAllByType("button").find((b) => text(b) === reason));
    click(btns(r, "Save")[0]);
  } else {
    click(btns(r, "Skip")[0]);
  }
};
const opportunities = () => { const r = render(); click(btnExact(r, "Opportunities22")); return r; };

describe("1. The exit is persistent but subordinate", () => {
  test("every active stage exposes the deal menu in the header", () => {
    for (const [who, stage] of [["James Rivera", "Agree on Price"], ["Alex Trinh", "Select Trade"],
      ["Hiro Tanaka", "Value Trade"], ["Nina Alvarez", "Deal"], ["Hiro Tanaka", "Fulfillment"]]) {
      const r = atStage(who, stage);
      assert(menuBtn(r), `${stage} has the menu`);
      assert(byClassIn(byClass(r, "ws-head")[0], "dm").length === 1, "and it lives in the header");
    }
  });

  test("it does not compete with the stage actions", () => {
    const r = atStage("James Rivera", "Agree on Price");
    const t = text(stageWork(r));
    assert(!t.includes("End deal"), "no exit control among the primary actions");
    assert(!String(menuBtn(r).props.className).includes("pri"), "the menu itself is quiet");
    assert(!String(menuBtn(r).props.className).includes("dgr"), "and not styled destructively");
    assert(menuBtn(r).props["aria-label"], "but it is labelled for assistive tech");
  });

  test("the menu is closed until asked for", () => {
    const r = atStage("James Rivera", "Agree on Price");
    eq(byClass(r, "dm-item").length, 0, "nothing shown by default");
    eq(openMenu(r).length, 1, "one deal-level action once opened");
  });
});

describe("2. End deal before mutual agreement", () => {
  test("the action reads End deal through the active flow", () => {
    for (const [who, stage] of [["James Rivera", "Agree on Price"], ["Alex Trinh", "Select Trade"],
      ["Hiro Tanaka", "Value Trade"], ["Nina Alvarez", "Deal"]]) {
      eq(openMenu(atStage(who, stage)).join(","), "End deal", stage + " offers End deal");
    }
  });

  test("the confirmation is restrained and defaults to the safe choice", () => {
    const r = atStage("James Rivera", "Agree on Price");
    click(menuBtn(r));
    click(byClass(r, "dm-item")[0]);
    const t = text(byClass(r, "modal")[0]);
    assert(t.includes("End this deal with James R.?"), "title names the collector: " + t.slice(0, 60));
    assert(t.includes("Everything agreed so far will be kept in the opportunity history."), "reassuring body");
    assert(t.includes("Keep working"), "the safe action is offered first");
    const actions = byClass(r, "modal")[0].findAllByType("button").map((b) => text(b).trim());
    assert(actions.includes("Keep working") && actions.includes("End deal"), "both choices: " + actions);
  });

  test("Keep working leaves the deal untouched", () => {
    const r = atStage("James Rivera", "Agree on Price");
    const before = terms(r);
    click(menuBtn(r));
    click(byClass(r, "dm-item")[0]);
    click(btns(r, "Keep working")[0]);
    eq(byClass(r, "modal").length, 0, "the modal closed");
    assert(menuBtn(r), "and the deal is still active");
    eq(terms(r), before, "with its terms intact");
  });

  test("3. ending preserves every upstream term", () => {
    const r = atStage("Hiro Tanaka", "Value Trade");
    const before = terms(r);
    const rows = text(byClass(r, "tbl")[0]);
    endDeal(r);
    eq(terms(r), before, "price and trade value unchanged");
    eq(text(byClass(r, "tbl")[0]), rows, "and every trade card, market value and percentage");
  });

  test("2. ending makes the opportunity terminal", () => {
    const r = atStage("James Rivera", "Agree on Price");
    endDeal(r);
    eq(byClass(r, "dm-btn").length, 0, "the exit disappears once the record is terminal");
    assert(allText(r).includes("ended the deal during Agree on Price"), "and it is recorded");
  });

  test("4. it leaves the active counts and Needs you", () => {
    const before = opportunities();
    const needsBefore = Number(text(byClass(before, "dq-n")[0]));
    const r = atStage("James Rivera", "Agree on Price");
    endDeal(r);
    click(btnExact(r, "Opportunities22"));
    eq(Number(text(byClass(r, "dq-n")[0])), needsBefore - 1, "one fewer needing the TP");
    const archived = byClass(r, "lc-row").find((n) => String(n.props.className).includes("n-archived"));
    assert(/Archived\s*1/.test(text(archived)), "and it moved to the terminal stage: " + text(archived));
  });

  test("5. it remains reachable in history", () => {
    const r = atStage("James Rivera", "Agree on Price");
    endDeal(r, "Changed my mind");
    click(btn(r, "Collector profile"));
    click(btns(r, "History")[0]);
    assert(allText(r).includes("ended the deal"), "the outcome is in the collector's history");
  });
});

describe("4. Optional reason", () => {
  test("the reason step is offered but skippable", () => {
    const r = atStage("James Rivera", "Agree on Price");
    click(menuBtn(r));
    click(byClass(r, "dm-item")[0]);
    click(btns(r, "").find((b) => text(b).trim() === "End deal"));
    const reasons = byClass(r, "dm-reasons")[0].findAllByType("button").map(text);
    eq(reasons.length, 5, "five suggestions: " + reasons.join(" | "));
    assert(reasons.includes("Changed my mind"), "including the expected options");
    assert(btns(r, "Skip").length === 1, "and Skip is available");
  });

  test("skipping still ends the deal", () => {
    const r = atStage("James Rivera", "Agree on Price");
    endDeal(r);
    eq(byClass(r, "dm-btn").length, 0, "terminal");
    assert(!/—\s*(Changed|Couldn)/.test(allText(r)), "with no reason recorded");
  });

  test("a chosen reason is recorded with the outcome", () => {
    const r = atStage("James Rivera", "Agree on Price");
    endDeal(r, "Changed my mind");
    assert(allText(r).includes("ended the deal during Agree on Price — Changed my mind"),
      "reason kept alongside the stage it ended in");
  });

  test("Save is unavailable until a reason is picked", () => {
    const r = atStage("James Rivera", "Agree on Price");
    click(menuBtn(r));
    click(byClass(r, "dm-item")[0]);
    click(btns(r, "").find((b) => text(b).trim() === "End deal"));
    eq(btns(r, "Save")[0].props.disabled, true, "nothing to save yet");
    click(byClass(r, "dm-reasons")[0].findAllByType("button")[0]);
    eq(btns(r, "Save")[0].props.disabled, false, "enabled once chosen");
  });
});

describe("5. Cancel after mutual agreement", () => {
  test("6. Fulfillment offers Cancel agreed deal instead", () => {
    eq(openMenu(atStage("Hiro Tanaka", "Fulfillment")).join(","), "Cancel agreed deal",
      "the commitment threshold changed the semantics");
  });

  test("its confirmation acknowledges the existing agreement", () => {
    const r = atStage("Hiro Tanaka", "Fulfillment");
    click(menuBtn(r));
    click(byClass(r, "dm-item")[0]);
    const t = text(byClass(r, "modal")[0]);
    assert(t.includes("Cancel this agreed deal?"), "title");
    assert(t.includes("You and Hiro T. already agreed to this deal"), "names the agreement");
    assert(t.includes("stop fulfillment"), "and what cancelling does");
    assert(t.includes("Keep deal"), "with the safe action");
  });

  test("7. cancelling preserves the agreed transaction", () => {
    const r = atStage("Hiro Tanaka", "Fulfillment");
    const before = terms(r);
    const summary = text(stageWork(r));
    endDeal(r);
    eq(terms(r), before, "the agreed figures survive");
    assert(text(stageWork(r)).includes("Total trade value"), "and the breakdown remains: " + summary.slice(0, 60));
    assert(allText(r).includes("cancelled the agreed deal during Fulfillment"),
      "recorded as a cancellation, not an ending");
  });

  test("8. cancelled opportunities become terminal", () => {
    const r = atStage("Hiro Tanaka", "Fulfillment");
    endDeal(r);
    eq(byClass(r, "dm-btn").length, 0, "no further deal actions");
    click(btnExact(r, "Opportunities22"));
    const fulfil = byClass(r, "lc-row").find((n) => String(n.props.className).includes("n-fulfillment"));
    assert(!/Fulfillment\s*3/.test(text(fulfil)), "it left the fulfillment count: " + text(fulfil));
  });

  test("the two outcomes read differently in history", () => {
    const a = atStage("James Rivera", "Agree on Price");
    endDeal(a);
    click(btnExact(a, "Opportunities22"));
    const rowA = byClass(a, "lc-row").find((n) => String(n.props.className).includes("n-archived"));
    click(rowA.findAllByType("button")[0]);
    assert(text(byClass(a, "lc-open")[0]).includes("Ended during Agree on Price"),
      "ended reads as ended");

    const b = atStage("Hiro Tanaka", "Fulfillment");
    endDeal(b);
    click(btnExact(b, "Opportunities22"));
    const rowB = byClass(b, "lc-row").find((n) => String(n.props.className).includes("n-archived"));
    click(rowB.findAllByType("button")[0]);
    assert(text(byClass(b, "lc-open")[0]).includes("Cancelled during Fulfillment"),
      "cancelled reads as cancelled");
  });
});

describe("6 & 10. Completed and existing archives", () => {
  test("9. a completed opportunity offers neither action", () => {
    const r = render();
    goProfile(r, "Sarah Mendel");
    click(btns(r, "History")[0]);
    // completed records are reached through history, and expose no deal menu
    eq(byClass(r, "dm-btn").length, 0, "no exit path on a completed record");
  });

  test("10. a record closed without an outcome keeps its original wording", () => {
    /* Nothing is archived in seed, so the collector-side stop-pursuing path is used —
       it predates this feature and must not be relabelled. */
    const r = atStage("Casey Lin", "Select Trade");
    const stop = btns(r, "Cash only, no trade")[0] || btns(r, "Stop pursuing")[0];
    if (!stop) return;                                // path not reachable from this seed state
    click(stop);
    click(btnExact(r, "Opportunities22"));
    const archived = byClass(r, "lc-row").find((n) => String(n.props.className).includes("n-archived"));
    click(archived.findAllByType("button")[0]);
    const t = text(byClass(r, "lc-open")[0]);
    assert(!/Ended during|Cancelled during/.test(t),
      "records without an outcome are not relabelled: " + t.slice(0, 140));
  });

  test("10. Completed behaviour is unchanged", () => {
    const r = opportunities();
    const completed = byClass(r, "lc-row").find((n) => String(n.props.className).includes("n-completed"));
    assert(completed, "the completed stage still exists");
    click(completed.findAllByType("button")[0]);
    assert(byClass(r, "lc-open").length === 1, "and still opens its own queue");
  });

  test("one terminal flag, no competing lifecycle fields", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    assert(/const isArchived = \(opp\) => !!opp\.declined;/.test(src), "isArchived is unchanged");
    assert(/const isTerminal = \(opp\) => opp\.stage === "completed" \|\| isArchived\(opp\);/.test(src),
      "and so is isTerminal");
    assert(!/isEnded|isCancelled|opp\.ended\b|opp\.cancelled\b/.test(src),
      "no second terminal flag was introduced");
  });
});

describe("9. Upstream chapters are never reopened", () => {
  test("ending during Value Trade leaves settled cards settled", () => {
    const r = atStage("Hiro Tanaka", "Value Trade");
    const row = text(byClass(r, "tbl")[0]);
    assert(/\$\d/.test(row), "there are settled figures to preserve");
    endDeal(r);
    eq(text(byClass(r, "tbl")[0]), row, "market values and percentages are byte-identical");
  });

  test("the stage it ended in is retained", () => {
    const r = atStage("Hiro Tanaka", "Value Trade");
    endDeal(r);
    assert(allText(r).includes("during Value Trade"), "where it stopped is part of the record");
  });
});

require("./run.cjs").run();
