/* Builds a TEST-ONLY bundle that additionally exports TradeBinder and the price-negotiation pieces, so large-binder
   fixtures can be driven directly without inflating production seed data.
   src/MetYet.jsx is never modified. */
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
mkdirSync("dist", { recursive: true });
const src = readFileSync("src/MetYet.jsx", "utf8");
writeFileSync("dist/MetYet.testsrc.jsx", src + "\nexport { TradeBinder, BinderCard, PriceDecision, MarketDecision, CardContext, inventoryCoverage, networkProfile, networkDemandCards, identityKey, COLLECTOR_CARDS_SEED, GOALS_SEED, CARDS_SEED, buildOpps, OPPS_SEED };\n");
await build({
  entryPoints: ["dist/MetYet.testsrc.jsx"],
  bundle: true, format: "cjs", platform: "node", outfile: "dist/MetYet.test.cjs",
  external: ["react", "react-dom"], jsx: "automatic", logLevel: "warning",
});
console.log("test bundle built");
