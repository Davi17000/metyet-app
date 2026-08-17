const { execFileSync } = require("child_process");
let fail = 0;
execFileSync("node", ["tests/fixture-build.mjs"], { stdio: "inherit" });
for (const f of ["tests/e2e-unified.cjs", "tests/unified.cjs", "tests/shared-state.cjs", "tests/conversation-privacy.cjs", "tests/deal-reentry.cjs", "tests/review-harness.cjs", "tests/cross-persona.cjs", "tests/collector.cjs", "tests/network-binder.cjs", "tests/end-deal.cjs", "tests/collector-profile.cjs", "tests/navigation.cjs", "tests/cultivate.cjs", "tests/coverage.cjs", "tests/opportunities.cjs", "tests/workspace.cjs", "tests/agree-price.cjs", "tests/value-trade.cjs", "tests/trade-pct.cjs", "tests/select-trade.cjs", "tests/card-copy.cjs", "tests/add-inventory-repro.cjs", "tests/binder-copy.cjs", "tests/photo-identity.cjs", "tests/network.cjs", "tests/trade-binder.cjs", "tests/binder-scale.cjs", "tests/regression.cjs"]) {
  console.log("\n======== " + f + " ========");
  try { console.log(execFileSync("node", [f], { encoding: "utf8" })); }
  catch (e) { console.log(e.stdout || ""); fail++; }
}
console.log(fail ? `\n${fail} suite(s) failed` : "\nALL SUITES PASSED");
process.exit(fail ? 1 : 0);
