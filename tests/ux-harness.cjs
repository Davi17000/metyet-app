/* ============================================================================
   THE HARNESS IS INSTRUMENTATION, SO IT MUST BE TRUSTWORTHY

   A review package is evidence somebody else acts on. The failure that matters
   is not a crash — it is a run that reports success while producing nothing, or
   photographs the wrong deal, or quietly downgrades to "we checked the state"
   when screenshots were what was asked for. That happened: a manifest arrived
   saying `captured: 0, pending: 23, failed: 0`, which reads like a pass.

   So screenshot mode is strict and assertion-only must be named. These tests
   pin the shape of the promise rather than any particular browser path.
   ========================================================================= */

const { describe, test, assert, eq } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");

const ROOT = path.join(__dirname, "..");
const SCENARIO = require("../harness/review-scenario.cjs");
const { CAPTURES, IDS } = require("../harness/capture-matrix.cjs");
const RUNNER = fs.readFileSync(path.join(ROOT, "harness", "mobile-ux-review.cjs"), "utf8");
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("A. The capture matrix is a stable contract", () => {
  test("there are twenty-three captures", () => {
    eq(CAPTURES.length, 23, "the agreed review set");
  });

  test("every id is unique and numerically ordered", () => {
    eq(new Set(IDS).size, IDS.length, "no duplicates");
    const nums = IDS.map((id) => Number(id.slice(0, 2)));
    eq(nums.join(","), nums.slice().sort((a, b) => a - b).join(","), "in order");
    eq(nums[0], 1, "starting at 01");
    eq(nums[nums.length - 1], 23, "ending at 23");
  });

  test("each capture names a real checkpoint and asks a question", () => {
    CAPTURES.forEach((c) => {
      assert(SCENARIO.CHECKPOINTS.includes(c.checkpoint),
        c.id + " names a real checkpoint: " + c.checkpoint);
      assert(c.question && c.question.length > 10, c.id + " states its UX question");
      assert(typeof c.assert === "function", c.id + " asserts its state");
    });
  });

  test("the required subjects are all present", () => {
    /* Named individually so one cannot silently disappear in a refactor. */
    ["01-active-deal-entry", "02-deal-timeline-initial", "03-timeline-new-activity",
      "04-messages-unread-while-timeline-read", "05-messages-mixed-personas",
      "06-card-context-multi-card", "07-card-photo-viewer",
      "08-price-negotiation-action", "09-price-agreed-milestone",
      "10-trade-selection", "11-trade-completed-milestone",
      "12-value-market-proposal", "13-value-market-agreed",
      "14-value-percent-proposal", "15-value-completed", "16-cash-proposal",
      "17-cash-agreed", "18-handoff-action", "19-handoff-progress",
      "20-deal-completed", "21-long-timeline-top", "22-long-timeline-history",
      "23-long-messages"].forEach((id) =>
      assert(IDS.includes(id), id + " is still in the matrix"));
  });

  test("the two long-timeline captures are framed differently", () => {
    const top = CAPTURES.find((c) => c.id === "21-long-timeline-top");
    const hist = CAPTURES.find((c) => c.id === "22-long-timeline-history");
    eq(top.scroll, "top", "one frames the current end");
    eq(hist.scroll, "bottom", "the other the older end");
    assert(top.scroll !== hist.scroll, "or they are one screenshot twice");
  });
});

describe("B. The scenario is built from canonical actions", () => {
  test("every checkpoint is reachable", () => {
    SCENARIO.CHECKPOINTS.forEach((cp) => {
      const f = SCENARIO.buildTo(cp);
      assert(f && f.store, cp + " builds");
    });
  });

  test("a checkpoint freezes the deal at that moment", () => {
    const early = SCENARIO.buildTo("price-open");
    const late = SCENARIO.buildTo("completed");
    const o = (f) => f.store.get().opportunities.find((x) => x.id === f.oppId);
    eq(o(early).stage, "agree-price", "the early frame is early");
    eq(o(late).stage, "completed", "and the late one is late");
    /* The walk continuing must not reach back into a frame already handed out. */
    eq(o(early).stage, "agree-price", "and the early frame stays early");
  });

  test("economics come from the domain, never from the harness", () => {
    const f = SCENARIO.buildTo("completed");
    const o = f.store.get().opportunities.find((x) => x.id === f.oppId);
    const cards = D.acceptedTradeCards(o);
    eq(cards.length, 2, "two cards were traded");
    eq(D.tradeValueOf(cards[0]), 723, "$850 x 85%");
    eq(D.tradeValueOf(cards[1]), 450, "$600 x 75%");
    eq(D.totalTradeValue(o), 1173, "totalling $1,173");
    eq(D.calculatedBalance(o), 2727, "$3,900 - $1,173");
    eq(D.finalBalance(o), 2800, "settled at the agreed figure");
    eq(D.cashReceipt(o).final.direction, "collector-to-tp", "with direction intact");
  });

  test("the scenario writes no lifecycle or economic result by hand", () => {
    const src = code(fs.readFileSync(
      path.join(ROOT, "harness", "review-scenario.cjs"), "utf8"));
    /* Reading the stage to label a checkpoint is fine; assigning one is not.
       The distinction is what separates a recorder from a state editor. */
    ["agreedPrice:", "agreedMarket:", "agreedPercent:", "agreedAdj:",
      "tpAgreed:", "collectorAgreed:", "tpHandoff:", "collectorReceipt:"]
      .forEach((f) => assert(!src.includes(f),
        "the scenario never assigns " + f));
    assert(!/\.\.\.o, stage:|stage: "/.test(src), "and never sets a stage");
    assert(/at\.push\(\{ id, stage: get\(\)\.stage \}\)/.test(src),
      "it only reads the stage to label a checkpoint");

    /* PHASE 1 closed the last gap: submitting the trade package is now the
       canonical proposeTradeSelection command, so the scenario writes nothing
       by hand at all. */
    const patches = (src.match(/A\.patchOpportunity/g) || []).length;
    eq(patches, 0, "no raw patch remains");
    assert(/A\.proposeTradeSelection\(/.test(src), "the package goes through the command");
  });

  test("progression uses canonical actions", () => {
    const src = code(fs.readFileSync(
      path.join(ROOT, "harness", "review-scenario.cjs"), "utf8"));
    ["agreePrice", "reviewTradeCards", "tradeMarketRespond", "tradePercentRespond",
      "dealAdjustRespond", "dealAgree", "proposeFulfillment", "confirmHandoff"]
      .forEach((a) => assert(src.includes("A." + a), a + " drives the deal"));
  });
});

describe("C. Screenshot mode cannot pass without screenshots", () => {
  test("a capture is only 'captured' when a real file exists", () => {
    assert(/fs\.existsSync\(file\) \? fs\.statSync\(file\)\.size : 0/.test(RUNNER),
      "the file is measured");
    assert(/size < 5000/.test(RUNNER), "and a placeholder-sized image is rejected");
    assert(/rec\.status = "captured"; rec\.bytes = size;/.test(RUNNER),
      "status follows the file, not the intent");
  });

  test("a missing browser fails the run rather than downgrading it", () => {
    /* The exact defect: a manifest reporting captured 0 / failed 0. */
    assert(/if \(!assertOnly && !browserInstance\)/.test(RUNNER),
      "screenshot mode requires a browser that actually launched");
    assert(/process\.exit\(2\)/.test(RUNNER), "and exits nonzero when it has none");
    assert(/Chrome you already have/.test(RUNNER),
      "telling the developer what it looked for");
    assert(/launchError/.test(RUNNER), "and why each candidate failed");
  });

  test("assertion-only is an explicit mode", () => {
    assert(/args\.includes\("--assert-only"\)/.test(RUNNER), "it must be asked for");
    assert(/rec\.status = "asserted"/.test(RUNNER),
      "and its results are labelled as assertions, not captures");
    eq(PKG.scripts["ux:mobile-review:assert"],
      "node harness/mobile-ux-review.cjs --assert-only", "with its own command");
  });

  test("screenshot mode treats anything pending as failure", () => {
    assert(/const bad = assertOnly \? failures : \(failures > 0 \|\| manifest\.summary\.pending > 0\)/
      .test(RUNNER), "pending is only acceptable when assertions were what was asked for");
  });

  test("the manifest records the browser actually used", () => {
    assert(/browser: browser \|\| "none \(assertions only\)"/.test(RUNNER),
      "and does not claim one it did not have");
  });
});

describe("D. It uses the browser you already have", () => {
  test("installed Chrome is the first choice", () => {
    assert(/\{ channel: "chrome" \}/.test(RUNNER), "the Chrome channel leads");
    const order = RUNNER.slice(RUNNER.indexOf("const LAUNCH"),
      RUNNER.indexOf("const attempts"));
    assert(order.indexOf('channel: "chrome"') < order.indexOf("opts: {} }"),
      "before Playwright's own Chromium");
  });

  test("no browser download is a required step", () => {
    /* A managed work machine should not need a second Chromium installed just
       to look at screenshots. */
    assert(!PKG.scripts["ux:browser-install"], "no install command in the workflow");
    assert(!/npm run ux:browser-install/.test(RUNNER),
      "and the failure path does not demand one");
    eq(PKG.scripts["ux:mobile-review"], "node harness/mobile-ux-review.cjs",
      "the review command is the whole workflow");
  });

  test("no path is tied to one person's machine", () => {
    /* A fallback path is allowed; a home directory is not. */
    assert(!/\/Users\/[a-z]/i.test(RUNNER), "no user home directory");
    assert(!/process\.env\.HOME/.test(RUNNER), "and nothing derived from one");
    const fallbacks = RUNNER.match(/executablePath:\s*\n?\s*"([^"]+)"/g) || [];
    fallbacks.forEach((f) => assert(/^\S*"\/Applications\//.test(f.replace(/\s+/g, " ").replace(/executablePath: /, "")),
      "any fallback is a standard application location: " + f));
  });

  test("it runs headless, so it cannot disturb a real session", () => {
    assert(/headless: true/.test(RUNNER), "always headless");
    assert(!/headless: false/.test(RUNNER), "never otherwise");
  });

  test("playwright is declared, not ambient", () => {
    /* The original defect: it resolved from a global install that existed in
       one environment and nowhere else. */
    assert(PKG.devDependencies && PKG.devDependencies.playwright,
      "declared in devDependencies");
  });

  test("every failed launch is reported, not swallowed", () => {
    assert(/attempts\.push\(cand\.label/.test(RUNNER),
      "each candidate records why it failed");
    assert(/launchError = attempts\.join\(" \| "\)/.test(RUNNER),
      "and the reasons reach the developer");
  });
});

describe("E. The harness stays outside the product", () => {
  test("generated assets are ignored", () => {
    const ignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    assert(/^artifacts\/?$/m.test(ignore), "artifacts are never committed");
  });

  test("no product source imports the harness", () => {
    ["collector/MetYetCollector.jsx", "src/MetYet.jsx",
      "shell/MetYetPrototype.jsx", "domain/metyet-domain.js",
      "domain/metyet-store.js"].forEach((f) => {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      assert(!/harness\//.test(src), f + " does not know the harness exists");
    });
  });

  test("the capture entry is harness-only", () => {
    const entry = fs.readFileSync(
      path.join(ROOT, "harness", "capture-entry.jsx"), "utf8");
    assert(/window\.__uxDrive/.test(entry), "it only exposes surface switching");
    ["agreePrice", "dealAgree", "tradeMarketRespond", "stage:"].forEach((a) =>
      assert(!entry.includes(a), "and no product behaviour: " + a));
  });

  test("the lifecycle is unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment",
      "six, in order");
  });
});

require("./run.cjs").run();
