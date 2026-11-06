/* ============================================================================
   MILESTONE 2A — THE DEAL FLOW REVIEW SCENARIOS HOLD WHAT THEY SAY

   harness/phase6-deal-scenarios.cjs builds three Market Validation moments on
   the real server — opening offer, counteroffer, Agreed Market Price — from
   real commands under each seat. A review is only as honest as its fixture,
   so this suite runs each one on its own fresh world, without a browser, and
   checks it against the server: the pricing snapshot, the price history, the
   stage and whose turn it is, both seats' views, that Faraway (not connected)
   sees nothing, that nothing is reserved, that every out-of-turn or
   unauthorised move is refused and changes nothing, and that the later deal
   steps are still closed at the door. The screenshots are the harness's job
   (`npm run review:deal-scenarios`); this is what makes them trustworthy.
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const { serve } = require("../harness/phase6-world.cjs");
const { SCENARIOS, serveOptions, verifyScenario } = require("../harness/phase6-deal-scenarios.cjs");

const facts = {};
const each = async (key) => {
  const ctx = await serve({ port: 0, ...serveOptions(key) });
  try { facts[key] = await verifyScenario(ctx, key); return facts[key]; } finally { ctx.server.close(); }
};

describe("A. opening offer submitted", () => {
  test("$10 against a $12 Proposed Market Price; Northline to move; nothing agreed, nothing reserved", async () => {
    const f = await each("a");
    eq(f.collectorSays, "Waiting for Northline Cards");
    eq(f.collectorAction, "View Deal");
    eq(f.collectorProgress, "Step 1 of 10 · Market Validation");
    eq(f.partnerSees.panel, "Ready to coordinate");
    eq(f.partnerSees.priceBlock.says, "Casey's offer is $10. Your move.");
    eq(JSON.stringify(f.partnerSees.priceBlock.controls), JSON.stringify(["Accept", "Counter", "Decline"]));
    eq(f.agreedMarketPrice, null);
    eq(f.copyStatusForCollector, "available");
  });
});

describe("B. Trusted Partner counteroffer received", () => {
  test("Northline's $11 is on the table; Casey's move; the $12 snapshot is unchanged", async () => {
    const f = await each("b");
    eq(f.collectorSays, "Your turn · Review counteroffer");
    eq(f.collectorAction, "Review Counteroffer");
    eq(f.collectorProgress, "Step 1 of 10 · Market Validation");
    eq(f.onTable, 11);
    eq(f.proposedMarketPrice, 12);
    eq(f.partnerSees.panel, "In progress");
    /* RESTATED (Milestone 2D.3 polish): the shop's $11 is named as a counter. */
    eq(f.partnerSees.priceBlock.says, "Waiting for Casey to reply to your $11 counter.");
    eq(f.partnerSees.priceBlock.controls.length, 0, "the shop can answer its own counter");
  });
});

describe("C. Agreed Market Price", () => {
  test("agreed at $11, apart from the $12 Proposed Market Price; the next stage in words; no later command passes the door", async () => {
    const f = await each("c");
    eq(f.agreedMarketPrice, 11);
    eq(f.proposedMarketPrice, 12);
    eq(f.stage, "select-trade");
    /* RESTATED (M3A A3, founder-authorized): Select Trade is in production, so after the price is agreed the Collector is told the shop is choosing cards, with View Deal. */
    eq(f.collectorSays, "Northline Cards is choosing cards");
    eq(f.collectorAction, "View Deal");
    eq(f.collectorProgress, "Market Validation complete · Next: Step 2 of 10 · Select Trade");   /* RESTATED (M3A A3): step 2 is available now */
    eq(f.partnerSees.priceBlock, null, "the shop still has price controls");
    eq(JSON.stringify(f.partnerSees.facts), JSON.stringify({ Listed: 12, Agreed: 11 }));
    assert(f.refusals.some((r) => /proposeTradeSelection → command-unavailable/.test(r)), JSON.stringify(f.refusals));
    assert(f.refusals.some((r) => /proposeFinalBalance → command-unavailable/.test(r)), JSON.stringify(f.refusals));
  });
});

describe("D. three Primary Goals (Milestone 2C.1)", () => {
  test("the agreed Mudkip deal; Charizard matched by two connected Trusted Partners; Pikachu by nobody connected", async () => {
    const f = await each("d");
    eq(f.agreedMarketPrice, 11);
    eq(f.collectorAction, "View Deal");   /* RESTATED (M3A A3, founder-authorized): Select Trade is in production, so after the price is agreed the Collector is told the shop is choosing cards, with View Deal. */
    eq(JSON.stringify(f.goals), JSON.stringify({ charizard: "2 Trusted Partners · 2 copies", mudkip: "agreed", pikachu: "no match",
      reverse: "1 Trusted Partner · Firm on Price" }));
  });
});

describe("E. the scenarios are what the launcher offers", () => {
  test("exactly a, b, c and d, each verified above", () => {
    eq(Object.keys(SCENARIOS).join(), "a,b,c,d");
    for (const k of Object.keys(SCENARIOS)) assert(facts[k], `scenario ${k} was not verified`);
  });
});

run();
