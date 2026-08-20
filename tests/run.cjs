/* Minimal assertion runner — focused suites first, then everything. */

/* ------------------------------------------------------------ STALE BUILD

   Most suites read the app from dist/, which `npm test` does NOT rebuild — only
   `npm run build` (and `npm run verify`, which runs it first) does. So editing
   source and running a suite directly tests the PREVIOUS build, and the results
   are quietly wrong rather than obviously wrong.

   That is not hypothetical: applying a patch that touched src/ and shell/ and
   then running one suite produced nine unrelated-looking failures — a missing
   optgroup, a copy that would not go stock-only, a request that refused to be
   created — every one of them an artefact of the stale bundle rather than a
   real defect. An hour can disappear into that.

   So: if any source file is newer than the newest bundle, stop and say so once,
   instead of failing N times for reasons that do not name the cause. */
(function checkBuildFreshness() {
  const fs = require("fs"), path = require("path");
  const root = path.join(__dirname, "..");
  const newest = (dir, exts) => {
    let t = 0;
    const walk = (d) => {
      let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (exts.some((x) => e.name.endsWith(x))) {
          const m = fs.statSync(full).mtimeMs;
          if (m > t) t = m;
        }
      }
    };
    walk(dir);
    return t;
  };
  const distDir = path.join(root, "dist");
  if (!fs.existsSync(distDir)) return;                 // nothing built yet; let it fail naturally
  const built = newest(distDir, [".cjs"]);
  if (!built) return;
  /* Everything that feeds the bundles. */
  const sources = ["src", "shell", "collector", "domain", "shared"]
    .map((d) => path.join(root, d)).filter((d) => fs.existsSync(d));
  let latest = 0, which = null;
  for (const d of sources) {
    const t = newest(d, [".js", ".jsx"]);
    if (t > latest) { latest = t; which = path.basename(d); }
  }
  /* A second of slack: a build writes dist just after reading source. */
  if (latest > built + 1000) {
    console.error("\n  STALE BUILD — these results would be meaningless.\n");
    console.error("  Source under " + which + "/ is newer than dist/.");
    console.error("  Tests read the app from dist/, and `npm test` does not rebuild it.\n");
    console.error("  Run this first:\n");
    console.error("      npm run build\n");
    console.error("  (or `npm run verify`, which builds, tests, and smokes in one go)\n");
    process.exit(1);
  }
})();

const suites = [];
let only = process.argv[2] || null;
function describe(name, fn) { suites.push({ name, tests: [] }); fn(); }
function test(name, fn) { suites[suites.length - 1].tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || "eq") + ` — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
module.exports = { describe, test, assert, eq, run };

async function run() {
  let pass = 0, fail = 0;
  for (const s of suites) {
    if (only && !s.name.toLowerCase().includes(only.toLowerCase())) continue;
    console.log("\n" + s.name);
    for (const t of s.tests) {
      try { await t.fn(); console.log("  ok   " + t.name); pass++; }
      catch (e) { console.log("  FAIL " + t.name + "\n       " + e.message); fail++; }
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
