/* ============================================================================
   LOCAL DEV SERVER

   Serves the unified prototype — persona chooser, both experiences, one shared
   store — from canonical source with live rebuilds.

   Uses esbuild, which the project already depends on for every other build, so
   running the prototype in a browser adds no new tooling and no new
   dependencies. Nothing here participates in the test or production builds.
   ========================================================================== */
import { context } from "esbuild";

const PORT = Number(process.env.PORT || 5173);

const ctx = await context({
  entryPoints: { main: "dev/main.jsx" },
  bundle: true,
  format: "esm",
  /* esbuild requires the output to live inside the served directory. The bundle
     is gitignored; only index.html and main.jsx are source. */
  outdir: "dev",
  jsx: "automatic",
  sourcemap: true,
  /* THE ONE VALUE THAT CROSSES INTO THE BROWSER. `process` does not exist
     there, so the dev gates had no way to learn what METYET_DEV was set to and
     every dev-only control stayed hidden. Substituting a literal here gives the
     browser the same truth Node already had — and deliberately nothing else:
     one boolean, not an environment object. */
  define: {
    __METYET_DEV__: JSON.stringify(process.env.METYET_DEV === "1"),
  },
  logLevel: "info",
  /* React is bundled here rather than externalised: the browser has no module
     resolver, and this bundle is never shipped. */
});

await ctx.watch();
const { hosts, port } = await ctx.serve({ servedir: "dev", port: PORT });
const shown = (hosts || []).includes("127.0.0.1") ? "localhost" : (hosts || ["localhost"])[0];

console.log("");
console.log("  MetYet prototype running");
console.log(`  →  http://${shown}:${port}`);
console.log("");
console.log("  Choose Trusted Partner or Collector on the start screen.");
console.log("  Both run on one shared store; switch sides from the top bar.");
console.log("  Edits to src/, collector/, shell/ or domain/ rebuild on reload.");
console.log(process.env.METYET_DEV === "1"
  ? "  Dev tooling ON — Demo stage selector and review harness are visible."
  : "  Dev tooling off — run METYET_DEV=1 npm run dev to show demo controls.");
console.log("");
