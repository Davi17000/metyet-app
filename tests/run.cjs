/* Minimal assertion runner — focused suites first, then everything. */
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
