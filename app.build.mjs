/* ============================================================================
   THE PRODUCTION CLIENT BUILD — app.metyet.io

     npm run build:app

   Produces `app/index.html` and `app/main.js`: the sign-in entrance and the
   authenticated boundary behind it. The API server serves this directory, so
   the client and the API are the same origin and there is no cross-origin
   anything to configure.

   NOT THE DEMO. `site.build.mjs` builds the in-memory prototype for
   demo.metyet.io, with its seed, its scenario controls and no server at all.
   This build has no seed, no persona switcher and no domain command layer — it
   asks a server. Two builds, two hostnames, two realities; a test asserts
   neither bundle contains the other's giveaways.

   THE THREE PUBLIC VALUES are substituted here, from the environment of
   whoever runs the build. None is a secret: the API address is where the
   product lives, the project URL is in every sign-in email, and the
   publishable key is published. On Render, two of the three are already in the
   service's environment for the server's own sake, so the build picks them up
   with nothing new to set.

   `METYET_API_URL` is normally left unset, and the client then uses the origin
   it was served from — which is right by construction rather than by
   configuration. Set it only to point a local build at a remote API.

   A BUILD THAT WOULD NOT RUN DOES NOT SHIP. The values are checked here, with
   the same function the browser checks them with, so a missing key or a
   plaintext address fails the build rather than the first sign-in. The check is
   skipped only with --allow-unconfigured, which exists so this file can be
   built and inspected on a machine that has no project.
   ========================================================================== */

import esbuild from "esbuild";
import { rm, mkdir, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { readProductionConfig } from "./client/production-config.js";

const SRC = "app-src/main.jsx";
const OUT = "app";

const HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MetYet</title>
    <meta name="robots" content="noindex" />
    <style>
      html, body { margin: 0; padding: 0; background: #F1F3F6; }
      #root { min-height: 100vh; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.js"></script>
  </body>
</html>
`;

const env = (name) => (typeof process.env[name] === "string" ? process.env[name].trim() : "");

const apiUrl = env("METYET_API_URL");
const supabaseUrl = env("SUPABASE_URL");
const publishableKey = env("SUPABASE_PUBLISHABLE_KEY") || env("SUPABASE_ANON_KEY");

const unconfigured = process.argv.includes("--allow-unconfigured");
if (!unconfigured) {
  /* The same check the browser makes, made here so it fails at build time. An
     empty apiUrl is fine: the browser falls back to its own origin, which this
     process cannot see, so it is stood in for only to satisfy the check. */
  try {
    readProductionConfig({ apiUrl: apiUrl || "https://app.metyet.io", supabaseUrl, publishableKey });
  } catch (error) {
    console.error(error.message);
    console.error("\nSet SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY, or pass --allow-unconfigured to build "
      + "a bundle that will refuse to start. Nothing here is a secret; see docs/CLIENT-BOUNDARY.md.");
    process.exit(1);
  }
}

const listing = async (dir) => {
  const out = [];
  for (const name of await readdir(dir)) {
    out.push(`${name} — ${(await stat(path.join(dir, name))).size} bytes`);
  }
  return out.sort();
};

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const result = await esbuild.build({
  entryPoints: [SRC],
  bundle: true,
  format: "esm",
  outfile: `${OUT}/main.js`,
  jsx: "automatic",
  minify: true,
  sourcemap: false,
  target: ["es2020"],
  logLevel: "silent",
  define: {
    "process.env.NODE_ENV": '"production"',
    /* Public, and substituted as literals. An unset one becomes an empty
       string, which the browser treats as absent — not as a value. */
    __METYET_API_URL__: JSON.stringify(apiUrl),
    __METYET_SUPABASE_URL__: JSON.stringify(supabaseUrl),
    __METYET_SUPABASE_KEY__: JSON.stringify(publishableKey),
    /* The demo's switches, both off. This build has no scenario controls and no
       engineering tooling, and defining them here means a stray import of the
       flag modules cannot quietly turn either on. */
    __METYET_DEV__: "false",
    __METYET_DEMO__: "false",
  },
});
if (result.errors.length) {
  console.error(result.errors);
  process.exit(1);
}

await writeFile(path.join(OUT, "index.html"), HTML);

console.log(`built the production client into ${OUT}/`);
console.log((await listing(OUT)).map((l) => `  ${l}`).join("\n"));
console.log(unconfigured
  ? "  (unconfigured: this bundle will show its configuration problem and refuse to sign anyone in)"
  : `  api: ${apiUrl || "the origin it is served from"}`);
