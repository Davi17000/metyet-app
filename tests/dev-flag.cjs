/* ============================================================================
   ONE BROWSER-SAFE DEV FLAG

   Every dev gate used to read `process.env.METYET_DEV` for itself. That is
   correct under Node — where the tests and build scripts run — and silently
   false in a browser, where `process` does not exist. So `METYET_DEV=1 npm run
   dev` enabled nothing on screen: the gates were not broken, they simply had no
   way to learn the truth.

   `shared/dev-flag.js` is now the only place that decides. It reads a build-time
   literal when a bundler has provided one (the browser) and the environment when
   there is one to read (Node), so both runtimes agree.

   These tests hold three things: that the flag resolves correctly in each
   runtime, that no module re-derives it locally, and that the actual BUILT
   browser artifact carries the right value — not merely the source.
   ========================================================================= */

const { describe, test, assert, eq } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const FLAG_SRC = readSrc("shared/dev-flag.js");

/* Every module that gates behaviour on development mode. */
const GATED = ["collector/MetYetCollector.jsx", "src/MetYet.jsx", "shell/MetYetPrototype.jsx"];

describe("A. One definition, not three", () => {
  test("the flag is defined in exactly one module", () => {
    assert(/export const DEV = resolve\(\)/.test(FLAG_SRC),
      "shared/dev-flag.js exports the canonical flag");
    const defs = GATED.filter((f) => /process\.env\.METYET_DEV/.test(readSrc(f)));
    eq(defs.length, 0, "no gated module reads the environment for itself: " + defs.join(", "));
  });

  test("every gated module imports it rather than re-deriving it", () => {
    GATED.forEach((f) => {
      const src = readSrc(f);
      assert(/import \{ DEV as SHARED_DEV \} from "[^"]*shared\/dev-flag\.js"/.test(src),
        f + " imports the canonical flag");
      assert(/= SHARED_DEV;/.test(src), f + " assigns from it directly");
    });
  });

  /* The regression this pass exists to prevent. */
  test("no module may reintroduce a direct environment check", () => {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (e.name === "node_modules" || e.name === "dist" || e.name === "previews"
        || e.name.startsWith(".")) return [];
      const full = path.join(dir, e.name);
      return e.isDirectory() ? walk(full) : [full];
    });
    const offenders = walk(ROOT)
      .filter((f) => /\.(js|jsx|mjs)$/.test(f))
      .filter((f) => !/shared[\\/]dev-flag\.js$/.test(f))
      .filter((f) => !/dev-server\.mjs$/.test(f))      // injects it; does not gate on it
      .filter((f) => !/[\\/]tests[\\/]/.test(f))
      .filter((f) => /process\.env\.METYET_DEV/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f));
    eq(offenders.length, 0,
      "only shared/dev-flag.js and the dev server may mention METYET_DEV: "
      + offenders.join(", "));
  });

  test("the flag exposes one boolean and nothing else", () => {
    assert(!/process\.env\s*\}|\.\.\.\s*process\.env/.test(FLAG_SRC),
      "no environment object is passed through");
    const dev = readSrc("dev-server.mjs");
    const define = /define:\s*\{([^}]*)\}/.exec(dev);
    assert(define, "the dev server defines something");
    eq((define[1].match(/:/g) || []).length, 1, "exactly one value crosses into the browser");
    assert(/__METYET_DEV__/.test(define[1]), "and it is the dev flag");
    assert(!/window\.process|globalThis\.process|process-polyfill/.test(dev),
      "no process shim is installed in the browser");
  });
});

describe("B. It resolves correctly in Node", () => {
  const resolveIn = (env) => {
    const code = "const m = require(" + JSON.stringify(path.join(ROOT, "shared/dev-flag.js"))
      + "); process.stdout.write(String(m.DEV));";
    /* The module is ESM; evaluate its logic the way a bundle would by importing. */
    const out = execFileSync(process.execPath,
      ["--input-type=module", "-e",
        "import { DEV } from " + JSON.stringify(path.join(ROOT, "shared/dev-flag.js"))
        + "; process.stdout.write(String(DEV));"],
      { env: { ...process.env, ...env }, encoding: "utf8" });
    return out.trim();
  };

  test("METYET_DEV=1 resolves true", () => {
    eq(resolveIn({ METYET_DEV: "1" }), "true", "dev mode is on");
  });

  test("an unset or other value resolves false", () => {
    eq(resolveIn({ METYET_DEV: "" }), "false", "empty is off");
    eq(resolveIn({ METYET_DEV: "0" }), "false", "0 is off");
    eq(resolveIn({ METYET_DEV: "true" }), "false", "only the documented value enables it");
  });

  test("it never throws where process is absent", () => {
    assert(/typeof process !== "undefined"/.test(FLAG_SRC),
      "the environment read is guarded");
    assert(/typeof __METYET_DEV__ !== "undefined"/.test(FLAG_SRC),
      "and so is the build-time literal");
    assert(/return false;\s*\}?\s*;?\s*$|return false;/.test(FLAG_SRC),
      "with a definite default of off");
  });
});

describe("C. The built browser artifact carries the right value", () => {
  const bundle = (dev) => {
    const out = path.join(require("os").tmpdir(), "metyet-flag-" + (dev ? "on" : "off"));
    execFileSync(process.execPath, ["--input-type=module", "-e",
      `import { build } from "esbuild";
       await build({ entryPoints: { main: ${JSON.stringify(path.join(ROOT, "dev/main.jsx"))} },
         bundle: true, format: "esm", outdir: ${JSON.stringify(out)}, jsx: "automatic",
         logLevel: "error", define: { __METYET_DEV__: ${JSON.stringify(String(dev))} } });`],
      { cwd: ROOT, encoding: "utf8" });
    return fs.readFileSync(path.join(out, "main.js"), "utf8");
  };

  test("with the flag on, the browser resolves dev true", () => {
    const js = bundle(true);
    const fn = js.slice(js.indexOf("// shared/dev-flag.js"), js.indexOf("var DEV = resolve()"));
    assert(/if \(true\) \{\s*return true;/.test(fn),
      "the literal was substituted and resolves true: " + fn.slice(0, 160));
  });

  test("with the flag off, the browser resolves dev false", () => {
    const js = bundle(false);
    const fn = js.slice(js.indexOf("// shared/dev-flag.js"), js.indexOf("var DEV = resolve()"));
    assert(/if \(true\) \{\s*return false;/.test(fn),
      "the literal was substituted and resolves false: " + fn.slice(0, 160));
  });

  test("the browser never depends on process for the flag", () => {
    const js = bundle(true);
    const fn = js.slice(js.indexOf("// shared/dev-flag.js"), js.indexOf("var DEV = resolve()"));
    /* The environment branch survives as dead code behind `if (true)`, which is
       harmless — what matters is that it is never the deciding path. */
    const decided = fn.indexOf("return true;");
    const envRead = fn.indexOf("process.env.METYET_DEV");
    assert(decided > -1 && (envRead === -1 || decided < envRead),
      "the literal decides before the environment is ever consulted");
  });
});

describe("D. Injection points", () => {
  test("the dev server passes METYET_DEV through to the browser", () => {
    const dev = readSrc("dev-server.mjs");
    assert(/__METYET_DEV__: JSON\.stringify\(process\.env\.METYET_DEV === "1"\)/.test(dev),
      "the dev server substitutes the boolean at build time");
  });

  test("the production build ships dev tooling off", () => {
    const prod = readSrc("prod.build.mjs");
    assert(/__METYET_DEV__: "false"/.test(prod),
      "production states it explicitly rather than relying on omission");
  });

  test("the Node test bundles still read the environment", () => {
    /* build-all.mjs deliberately defines nothing, so tests that set
       process.env and re-require a bundle keep working. */
    const all = readSrc("build-all.mjs");
    assert(!/__METYET_DEV__/.test(all),
      "no literal is baked into the test bundles, so Node stays authoritative");
  });
});

describe("E. Gated behaviour still follows the flag", () => {
  const load = (dev) => {
    const before = process.env.METYET_DEV;
    if (dev) process.env.METYET_DEV = "1"; else delete process.env.METYET_DEV;
    Object.keys(require.cache).filter((k) => /dist[\\/](Prototype|Collector|MetYet)\.cjs$/.test(k))
      .forEach((k) => delete require.cache[k]);
    const proto = require("../dist/Prototype.cjs");
    const seed = require("../dist/MetYet.cjs");
    if (before === undefined) delete process.env.METYET_DEV;
    else process.env.METYET_DEV = before;
    return { App: proto.default, buildCanonicalSeed: seed.buildCanonicalSeed };
  };
  const React = require("react");
  const TR = require("react-test-renderer");
  const txt = (n) => {
    if (!n) return "";
    const o = []; const w = (x) => { for (const c of x.children || []) {
      if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
    w(n); return o.join(" ");
  };
  const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
    && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
  const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));
  const collector = (mod) => {
    let r; TR.act(() => { r = TR.create(React.createElement(mod.App)); });
    click(cls(r, "myp-card")[1]);
    return r;
  };

  test("dev on: the Demo stage selector and review fixtures are present", () => {
    const mod = load(true);
    const r = collector(mod);
    assert(/Demo stage/.test(txt(cls(r, "myp-bar")[0])), "the selector is in the bar");
    eq(r.root.findAllByType("select").length, 1, "with its control");
    const s = mod.buildCanonicalSeed();
    assert(s.goals.some((g) => /^Review /.test(g.note || "")), "review fixtures are seeded");
  });

  test("dev off: neither appears, and the product is unchanged", () => {
    const mod = load(false);
    const r = collector(mod);
    assert(!/Demo stage/.test(txt(cls(r, "myp-bar")[0])), "no selector label");
    eq(r.root.findAllByType("select").length, 0, "and no control");
    eq(cls(r, "rvw").length, 0, "no review panel");
    const s = mod.buildCanonicalSeed();
    eq(s.goals.length, 76, "the canonical goal count is untouched");
    eq(s.opportunities.length, 38, "and the opportunity count");
    assert(!s.goals.some((g) => /^Review /.test(g.note || "")), "no review fixture leaks");
    /* The product itself still renders. */
    assert(cls(r, "myp-bar")[0], "the prototype bar is still there");
    assert(/Switch persona/.test(txt(cls(r, "myp-bar")[0])), "with its real controls");
    assert(/Reset demo/.test(txt(cls(r, "myp-bar")[0])), "including reset");
  });
});

require("./run.cjs").run();
