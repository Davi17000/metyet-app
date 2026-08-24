#!/usr/bin/env node
/* ============================================================================
   THE REVIEW RUNNER — one command, the same evidence every time.

   Two halves, deliberately separable.

   The half that always runs: rebuild the canonical scenario, walk it to each
   checkpoint, and ASSERT the state the capture claims to show. This needs no
   browser, so the matrix is verified anywhere — including CI and this
   container. A capture whose assertions fail is reported as failed rather than
   photographed, because a misleading reference asset is worse than a missing
   one.

   The half that needs a browser: the screenshots themselves. Playwright is used
   if it is installed and its browser is present; otherwise the run completes,
   writes the manifest with every capture marked `pending-capture`, and exits
   nonzero so nobody mistakes a stateful dry run for a visual review.

   Nothing here decides a stage, a turn, a valuation or a direction. It asks the
   domain and reports the answer.
   ========================================================================= */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const D = require(path.join(ROOT, "domain", "metyet-domain.js"));
const { collectorView } = require(path.join(ROOT, "domain", "collector-view.js"));
const SCENARIO = require("./review-scenario.cjs");
const { CAPTURES } = require("./capture-matrix.cjs");

const VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 2 };

const sh = (cmd) => {
  try { return execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] })
    .toString().trim(); } catch { return null; }
};

/* Environment, recorded so two runs can be compared meaningfully. */
const environment = (browser) => ({
  commit: sh("git rev-parse HEAD") || "unknown (no git in this workspace)",
  shortSha: sh("git rev-parse --short HEAD") || "nogit",
  branch: sh("git rev-parse --abbrev-ref HEAD") || "unknown",
  capturedAt: new Date().toISOString(),
  viewport: VIEWPORT,
  devTooling: process.env.METYET_DEV === "1",
  browser: browser || "none (assertions only)",
  node: process.version,
});

/* Replay the canonical scenario, stopping at a checkpoint. The scenario is
   rebuilt from actions each time, so an intermediate capture is a real moment
   rather than a rewind of a finished deal. */
const stateAt = (checkpoint) => {
  const built = SCENARIO.build();
  const store = built.store;
  const o = store.get().opportunities.find((x) => x.id === built.oppId);
  /* build() walks to completion; for earlier checkpoints we re-run the same
     acts and snapshot when the checkpoint is reached. The scenario records the
     stage at each checkpoint, which is what the assertions compare against. */
  return { store, opp: o, built };
};

/* Because build() runs to completion, intermediate states are produced by
   replaying with a stop. The scenario exposes its checkpoint list; the runner
   asks for a store frozen at each one. */
const framesByCheckpoint = () => {
  const frames = new Map();
  SCENARIO.CHECKPOINTS.forEach((cp) => {
    const built = SCENARIO.buildTo ? SCENARIO.buildTo(cp) : null;
    if (built) frames.set(cp, built);
  });
  return frames;
};

const contextFor = (store, oppId) => {
  const o = store.get().opportunities.find((x) => x.id === oppId);
  const v = collectorView(store.get(), SCENARIO.ME);
  const thread = v.threadWith(o.partnerId, o.cardId);
  const entries = (thread && thread.entries) || [];
  return {
    state: store.get(),
    opp: o,
    messages: entries.filter((e) => e.kind !== "event"),
    events: entries,
    accepted: D.acceptedTradeCards(o),
    /* Everything the timeline can show, counted from canonical threads. */
    density: entries.length
      + (o.priceThread || []).length
      + ((o.deal && o.deal.adjThread) || []).length
      + D.acceptedTradeCards(o).reduce((n, c) =>
        n + (c.valueThread || []).length + (c.percentThread || []).length, 0),
  };
};

/* Render the real app at the review viewport with the frozen scenario injected
   as its starting state, drive to the requested surface, and photograph it.
   The page is the product's own dev page — no harness screen exists. */
const buildBundle = () => {
  const out = path.join(ROOT, "artifacts", "ux-bundle.js");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  require("esbuild").buildSync({
    entryPoints: [path.join(__dirname, "capture-entry.jsx")],
    outfile: out, bundle: true, format: "iife", jsx: "automatic",
    logLevel: "silent",
    define: { "process.env.METYET_DEV": "\"1\"",
      "process.env.NODE_ENV": "\"development\"" },
  });
  return fs.readFileSync(out, "utf8");
};

const pageHtml = (bundle, state) =>
  "<!doctype html><html><head><meta charset=utf-8>"
  + "<meta name=viewport content=\"width=device-width,initial-scale=1\">"
  + "<style>html,body{margin:0;padding:0;background:#F1F3F6}"
  + "#root{min-height:100vh}</style></head><body><div id=root></div>"
  + "<script>window.__UX_STATE__=" + JSON.stringify(state) + ";<\/script>"
  + "<script>" + bundle + "<\/script></body></html>";

const makeShooter = (pw, browser, bundle) => async (ctx, cap, file) => {
  const page = await browser.newPage({ viewport: {
    width: VIEWPORT.width, height: VIEWPORT.height },
    deviceScaleFactor: VIEWPORT.deviceScaleFactor });
  /* Animations off: a screenshot mid-transition is not comparable to one taken
     a month later. Nothing else about the UI is altered. */
  await page.addStyleTag({ content:
    "*,*::before,*::after{animation:none!important;transition:none!important}" });
  await page.setContent(pageHtml(bundle, ctx.state), { waitUntil: "load" });
  await page.waitForSelector(".mdl, .goal", { timeout: 5000 });
  if (cap.surface !== "goals") {
    /* Two passes with a settle between: the first expands the Deal Flow, the
       second lands on the surface, because React has to commit in between. */
    await page.evaluate((v) => window.__uxDrive && window.__uxDrive(v), cap.surface);
    await page.waitForTimeout(250);
    await page.evaluate((v) => window.__uxDrive && window.__uxDrive(v), cap.surface);
    await page.waitForTimeout(250);
    /* The deal must actually be open, or this capture is of the wrong screen. */
    const open = await page.evaluate(() => !!document.querySelector(".mdl"));
    if (!open) {
      /* A completed deal leaves the active list, so there is no Deal Flow to
         expand. That is the product's behaviour, recorded rather than forced. */
      throw new Error("no mobile deal on screen for " + cap.surface
        + " — a completed deal is no longer in the active Goals list");
    }
    /* The deal opens below the goal card, so a viewport shot of the page top
       photographs the Goals list instead of the thing under review. */
    await page.evaluate(() => {
      const el = document.querySelector(".mdl");
      if (el) el.scrollIntoView({ block: "start" });
    });
    await page.waitForTimeout(120);
  }
  if (cap.scroll === "bottom") {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  }
  await page.screenshot({ path: file, fullPage: false });
  await page.close();
};

async function main() {
  const args = process.argv.slice(2);
  const outRoot = path.join(ROOT, "artifacts", "mobile-ux-review");

  /* Is a browser available? Never assumed. */
  let pw = null; let browserName = null; let browserInstance = null; let shoot = null;
  try {
    pw = require("playwright");
    browserInstance = await pw.chromium.launch();  // throws if no binary
    browserName = "chromium (playwright)";
    shoot = makeShooter(pw, browserInstance, buildBundle());
  } catch (e) {
    pw = null;
    browserName = null;
  }

  const env = environment(browserName);
  const outDir = path.join(outRoot, env.shortSha + "-" + Date.now());
  fs.mkdirSync(outDir, { recursive: true });

  const frames = framesByCheckpoint();
  const results = [];
  let failures = 0;

  for (const cap of CAPTURES) {
    const frame = frames.get(cap.checkpoint);
    const rec = { filename: cap.id + ".png", id: cap.id,
      checkpoint: cap.checkpoint, surface: cap.surface,
      question: cap.question, status: "pending-capture" };

    if (!frame) {
      rec.status = "failed";
      rec.reason = "checkpoint not reachable: " + cap.checkpoint;
      failures += 1; results.push(rec); continue;
    }

    const ctx = contextFor(frame.store, frame.oppId);
    rec.canonical = {
      opportunityId: ctx.opp.id,
      stage: ctx.opp.stage,
      nextActor: D.nextActor(ctx.opp).actor,
      acceptedTradeCards: ctx.accepted.length,
      agreedPrice: ctx.opp.agreedPrice,
      totalTradeValue: D.totalTradeValue(ctx.opp),
      cash: D.cashReceipt(ctx.opp).final,
      messageCount: ctx.messages.length,
    };

    /* Assert the state BEFORE any shutter opens. */
    const problem = cap.assert ? cap.assert(ctx.opp, D, ctx) : null;
    if (problem) {
      rec.status = "failed"; rec.reason = problem; failures += 1;
      results.push(rec); continue;
    }

    if (!pw) { results.push(rec); continue; }

    /* Capture, then PROVE it. A status flag is not evidence: the file must
       exist and be large enough to be a rendered screen rather than a blank
       page, or this is recorded as a failure. */
    try {
      const file = path.join(outDir, rec.filename);
      await shoot(ctx, cap, file);
      const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
      if (size < 5000) {
        rec.status = "failed";
        rec.reason = "image too small to be a rendered screen (" + size + " bytes)";
        failures += 1;
      } else { rec.status = "captured"; rec.bytes = size; }
    } catch (e) {
      rec.status = "failed";
      rec.reason = "capture error: " + String(e.message).split("\n")[0];
      failures += 1;
    }
    results.push(rec);
  }

  const manifest = { environment: env, scenario: "canonical-review-deal",
    viewport: VIEWPORT, captures: results,
    summary: { total: results.length,
      captured: results.filter((r) => r.status === "captured").length,
      pending: results.filter((r) => r.status === "pending-capture").length,
      failed: failures } };
  fs.writeFileSync(path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2));

  const readme = [
    "# MetYet — Mobile UX Review",
    "",
    "Neutral evidence for external review. Individual PNGs are the source of truth.",
    "",
    "| field | value |",
    "| --- | --- |",
    "| commit | " + env.commit + " |",
    "| branch | " + env.branch + " |",
    "| captured | " + env.capturedAt + " |",
    "| viewport | " + VIEWPORT.width + "x" + VIEWPORT.height
      + " @" + VIEWPORT.deviceScaleFactor + "x |",
    "| browser | " + (env.browser || "none") + " |",
    "| DEV tooling | " + env.devTooling + " |",
    "",
    "The deal is built by calling the product's own canonical actions in a fixed",
    "order with fixed dates. No state is written by hand and no economics are",
    "computed here, so what is photographed is what the product does.",
    "",
    "## Captures",
    "",
    ...results.map((r) => "- **" + r.id + "** — " + r.question
      + (r.status === "captured" ? "" : "  \n  _" + r.status
        + (r.reason ? ": " + r.reason : "") + "_")),
    "",
    "## Limitations",
    "",
    "- Only a Collector mobile shell exists; there is no Trusted Partner mobile",
    "  surface, so no `-tp.png` captures are produced. The seat-aware chronology",
    "  is covered by tests at the projection layer instead.",
    "- Screenshots require a browser. Where the manifest says `pending-capture`,",
    "  the state was built and asserted but no image was taken.",
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "README.md"), readme);

  const line = (s) => process.stdout.write(s + "\n");
  line("MOBILE UX REVIEW → " + path.relative(ROOT, outDir));
  line("  captures: " + manifest.summary.total
    + " | captured: " + manifest.summary.captured
    + " | pending: " + manifest.summary.pending
    + " | failed: " + manifest.summary.failed);
  if (!pw) {
    line("  NO BROWSER AVAILABLE — states were built and asserted, no images taken.");
    line("  Install one with: npx playwright install chromium");
  }
  if (browserInstance) await browserInstance.close();
  results.filter((r) => r.status === "failed")
    .forEach((r) => line("  FAILED " + r.id + ": " + r.reason));

  /* Nonzero when anything is missing, so a dry run is never mistaken for a
     visual review. */
  process.exit(failures > 0 || manifest.summary.pending > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
