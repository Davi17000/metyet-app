/* ============================================================================
   BUILD EVERYTHING THE TESTS AND PREVIEWS NEED

   From a clean checkout: `npm install && npm run build && npm test`.

   The suites exercise the real components, so they need compiled bundles. This
   produces all four from canonical source; nothing here is hand-maintained.
   ========================================================================== */
import { build } from "esbuild";

const common = {
  bundle: true, format: "cjs", platform: "node",
  external: ["react", "react-dom"], jsx: "automatic", logLevel: "warning",
};

const targets = [
  { entryPoints: ["src/MetYet.jsx"], outfile: "dist/MetYet.cjs" },
  { entryPoints: ["collector/MetYetCollector.jsx"], outfile: "dist/Collector.cjs" },
  { entryPoints: ["shell/MetYetPrototype.jsx"], outfile: "dist/Prototype.cjs" },
];

for (const t of targets) {
  await build({ ...common, ...t });
  console.log("built", t.outfile);
}
