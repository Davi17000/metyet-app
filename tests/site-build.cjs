/* ============================================================================
   THE HOSTED ARTIFACT IS A WEB PAGE

   Pages was serving a 404 because the artifact it published was never a site.
   `dist/` holds library bundles for Node — they externalise React, nothing
   mounts, and there is no HTML at all. Uploading it produced a directory with
   no index to serve.

   This suite guards the thing that replaces it: a real page, built from the
   SAME unified shell local development mounts, carrying its own React so the
   browser has no bare specifier left to resolve, with the demo tooling compiled
   out rather than deleted from source.

   The last point is where honesty matters. esbuild cannot tree-shake a
   component that a live call site still references, so a few dev strings do
   survive into the bundle. Asserting their absence would be a lie dressed as a
   test. What is asserted instead is the thing that actually determines
   behaviour: the flag those call sites are gated on compiles to false.
   ========================================================================= */

const { describe, test, assert, eq } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "site");
const read = (f) => fs.readFileSync(path.join(OUT, f), "utf8");
const has = (f) => fs.existsSync(path.join(OUT, f));

/* Build once, from the repo's own command, exactly as CI will. */
let built = null;
const build = () => {
  if (built === null) {
    built = execFileSync("npm", ["run", "build:site"], { cwd: ROOT, encoding: "utf8" });
  }
  return built;
};

describe("A. The build produces a complete site", () => {
  test("it runs from the repo's own command and reports success", () => {
    assert(/SITE BUILD OK/.test(build()), "the build succeeds");
    assert(!/SITE BUILD FAILED/.test(built), "and does not silently continue past errors");
  });

  test("the publish directory holds a page, its script, and nothing stray", () => {
    build();
    assert(has("index.html"), "an index to serve");
    assert(has("main.js"), "the browser bundle");
    /* Everything present is deliberate; a stray .jsx or .map would mean source
       or debug material was published. */
    const files = fs.readdirSync(OUT).sort();
    eq(files.join(","), ".nojekyll,CNAME,index.html,main.js", "exactly the artifact");
  });

  test("the entry source lives outside the published directory", () => {
    /* site/ is wiped and recreated each build, so its own source cannot live
       there — a build that deletes its input works exactly once. */
    assert(fs.existsSync(path.join(ROOT, "site-src", "main.jsx")), "the entry is kept apart");
    assert(!has("main.jsx"), "and is not published");
  });

  test("the custom domain survives each deploy", () => {
    build();
    eq(read("CNAME").trim(), "app.metyet.io",
      "Pages clears the domain setting on publish unless the artifact carries it");
  });
});

describe("B. The page can actually boot", () => {
  test("it has a root to mount into", () => {
    build();
    assert(/<div id="root"><\/div>/.test(read("index.html")), "an empty #root");
    assert(/<meta name="viewport"[^>]*width=device-width/.test(read("index.html")),
      "and a mobile viewport, since both personas are mobile-first");
  });

  test("it loads the bundle by a path that works at the site root", () => {
    build();
    assert(/<script type="module" src="\.\/main\.js"><\/script>/.test(read("index.html")),
      "same-directory, so the artifact is portable");
    assert(fs.existsSync(path.join(OUT, "main.js")), "and that file is really there");
  });

  test("it references nothing that is not in the artifact", () => {
    build();
    const html = read("index.html");
    assert(!/src\/main\.tsx/.test(html), "not the Vite entry that mounts the TP app alone");
    assert(!/bolt/i.test(html), "not the old placeholder metadata");
    /* Every local src= must exist in the artifact. */
    const srcs = [...html.matchAll(/src="\.\/([^"]+)"/g)].map((m) => m[1]);
    assert(srcs.length >= 1, "at least one local script");
    srcs.forEach((s) => assert(has(s), s + " is present"));
  });

  test("the bundle mounts through createRoot", () => {
    build();
    const js = read("main.js");
    assert(/createRoot/.test(js), "it creates a root");
    assert(/getElementById/.test(js), "and looks for the element to mount into");
  });
});

describe("C. The browser has nothing left to resolve", () => {
  test("React and ReactDOM are bundled, not externalised", () => {
    build();
    const js = read("main.js");
    ["react", "react-dom", "react/jsx-runtime"].forEach((pkg) => {
      const bare = new RegExp('(from|import)\\s*["\']' + pkg.replace("/", "\\/") + '["\']');
      assert(!bare.test(js), "no unresolved bare import of " + pkg);
    });
    /* And they are genuinely present rather than merely unmentioned. */
    assert(/Minified React error|react\.dev\/errors/.test(js), "React itself is in the bundle");
    assert(js.length > 300000, "at a size consistent with bundling it: " + js.length + " bytes");
  });

  test("nothing is imported from outside the artifact", () => {
    build();
    const js = read("main.js");
    /* Real ESM import statements only — prose containing the word "from"
       inside the bundled UI copy is not an import. */
    const imports = [
      ...js.matchAll(/(?:^|[;}\s])import\s*(?:[^;'"]*?\sfrom\s*)?["']([^"']+)["']/g),
    ].map((m) => m[1]);
    imports.forEach((spec) => assert(/^[./]/.test(spec),
      "every remaining import is relative, not a package: " + spec));
    eq(imports.length, 0, "and in practice the bundle imports nothing at all");
  });
});

describe("D. Demo tooling is compiled off, and provably so", () => {
  test("the build-time flag is substituted away entirely", () => {
    build();
    const js = read("main.js");
    assert(!/__METYET_DEV__/.test(js), "no unsubstituted placeholder survives");
    assert(!/METYET_DEV/.test(js), "and no environment lookup either");
  });

  test("the flag those call sites read compiles to false", () => {
    /* The honest proof. The dev harness is gated on `DEV` from the one shared
       flag module, so this bundles THAT module with the site build's own
       defines and evaluates what the browser would get. */
    const esbuild = require("esbuild");
    const out = esbuild.buildSync({
      entryPoints: [path.join(ROOT, "shared", "dev-flag.js")],
      bundle: true, format: "cjs", write: false, logLevel: "silent",
      define: { "process.env.NODE_ENV": '"production"', __METYET_DEV__: "false" },
    });
    const mod = {};
    new Function("module", "exports", out.outputFiles[0].text)(mod, (mod.exports = {}));
    eq(mod.exports.DEV, false, "the browser resolves DEV to false");

    /* And with the dev define, the same module resolves true — so the flag is
       doing the work, rather than being false for some unrelated reason. */
    const devOut = esbuild.buildSync({
      entryPoints: [path.join(ROOT, "shared", "dev-flag.js")],
      bundle: true, format: "cjs", write: false, logLevel: "silent",
      define: { "process.env.NODE_ENV": '"production"', __METYET_DEV__: "true" },
    });
    const devMod = {};
    new Function("module", "exports", devOut.outputFiles[0].text)(devMod, (devMod.exports = {}));
    eq(devMod.exports.DEV, true, "and true when a build asks for it");
  });

  test("the dev surfaces are gated on exactly that flag", () => {
    const shell = fs.readFileSync(path.join(ROOT, "shell", "MetYetPrototype.jsx"), "utf8");
    assert(/import \{ DEV as SHARED_DEV \} from "\.\.\/shared\/dev-flag\.js"/.test(shell),
      "the shell reads the one canonical flag");
    assert(/\{DEV && persona === "collector" && \(/.test(shell),
      "the review harness is behind it");
    assert(/const demoStage = DEV \? /.test(shell), "as is the demo stage");
  });

  test("the tooling remains in source for local development", () => {
    /* Compiled off, not deleted: METYET_DEV=1 npm run dev must still work. */
    const harness = fs.readFileSync(
      path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
    assert(/Review scenarios/.test(harness), "the harness still exists in source");
    const devServer = fs.readFileSync(path.join(ROOT, "dev-server.mjs"), "utf8");
    assert(/__METYET_DEV__: JSON\.stringify\(process\.env\.METYET_DEV === "1"\)/.test(devServer),
      "and dev still switches it on");
  });
});

describe("E. One app, not two", () => {
  test("production mounts the same shell local development mounts", () => {
    const prodEntry = fs.readFileSync(path.join(ROOT, "site-src", "main.jsx"), "utf8");
    const devEntry = fs.readFileSync(path.join(ROOT, "dev", "main.jsx"), "utf8");
    const shellImport = /from "\.\.\/shell\/MetYetPrototype\.jsx"/;
    assert(shellImport.test(prodEntry), "production imports the unified shell");
    assert(shellImport.test(devEntry), "and so does development");
    /* The entry is a boot layer only. */
    ["createStore", "opportunit", "REFUSE", "INVARIANTS"].forEach((w) =>
      assert(!prodEntry.includes(w), "no product logic in the entry: " + w));
  });

  test("the wrong entries are not published", () => {
    build();
    const js = read("main.js");
    const prodEntry = fs.readFileSync(path.join(ROOT, "site-src", "main.jsx"), "utf8");
    assert(!/main\.tsx|src\/App/.test(prodEntry), "not the Vite/TP-only entry");
    /* The unified shell brings both personas; the TP app alone would not. */
    assert(/Trusted Partner/.test(js), "the partner persona is in the bundle");
    assert(/Trade Binder/.test(js), "and the collector persona too");
  });

  test("the site build leaves the test and build pipeline alone", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    ["build", "test", "prod", "smoke", "previews", "verify"].forEach((s) =>
      assert(pkg.scripts[s], s + " is still defined"));
    eq(pkg.scripts["build:site"], "node site.build.mjs", "and the site build is its own command");
    assert(!/build:site/.test(pkg.scripts.verify), "verify is unchanged");
  });
});

describe("F. Pages publishes the site, not the workbench", () => {
  const wf = () => fs.readFileSync(
    path.join(ROOT, ".github", "workflows", "deploy.yml"), "utf8");

  test("it builds and uploads the artifact directory", () => {
    assert(/run: npm run build:site/.test(wf()), "it runs the site build");
    assert(/path: \.\/site\b/.test(wf()), "and uploads that directory");
  });

  test("it no longer publishes build infrastructure", () => {
    assert(!/path: \.\/dist/.test(wf()), "dist is not the site");
    assert(!/path: \.\s*$/m.test(wf()), "nor is the repository root");
  });

  test("the existing Pages plumbing is preserved", () => {
    const y = wf();
    ["pages: write", "id-token: write", "actions/configure-pages", "actions/deploy-pages",
      "npm ci"].forEach((bit) => assert(y.includes(bit), bit + " is retained"));
  });
});

require("./run.cjs").run();
