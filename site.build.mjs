/* Builds the hosted browser app for GitHub Pages.

   WHY THIS EXISTS SEPARATELY FROM prod.build.mjs

   `dist/` is build and test infrastructure: library bundles that externalise
   React and are consumed by Node, not by a browser. Nothing in it mounts, and
   there is no HTML, which is exactly why Pages served a 404 — the artifact was
   never a web page.

   This produces the other thing: a real page. It bundles the SAME unified shell
   that local development mounts, includes React and ReactDOM so the browser has
   no bare specifiers left to resolve, and compiles the demo tooling out through
   the one flag that gates it.

   The entry lives in site-src/ rather than site/, because site/ is wiped and
   recreated on every build — keeping the source there would mean deleting it. */

import esbuild from "esbuild";
import { rm, mkdir, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const SRC = "site-src/main.jsx";
const OUT = "site";
const DOMAIN = "app.metyet.io";

/* Same-directory paths, because the artifact IS the site root. A root-relative
   "/main.js" would be correct at app.metyet.io and wrong anywhere else — under
   a project-pages path, or served from a subfolder while checking the build. */
const HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <!-- Mobile-first personas need this, or iOS assumes a 980px page. -->
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MetYet</title>
    <meta name="description" content="MetYet — find the exact card you're after, and trade for it with a partner you trust." />
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

const listing = async (dir) => {
  const out = [];
  for (const name of await readdir(dir)) {
    const full = path.join(dir, name);
    out.push(`${name} — ${(await stat(full)).size} bytes`);
  }
  return out.sort();
};

try {
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
    /* React and ReactDOM are bundled, NOT externalised: a browser cannot
       resolve a bare "react" specifier, and an import map would be a second
       thing to keep in step with package.json. */
    define: {
      "process.env.NODE_ENV": '"production"',
      __METYET_DEV__: "false",
    },
  });

  if (result.errors.length) throw new Error(result.errors.map((e) => e.text).join("\n"));

  await writeFile(path.join(OUT, "index.html"), HTML);
  /* Pages needs this to keep serving the custom domain after each deploy;
     without it the domain setting is cleared by the next publish. */
  await writeFile(path.join(OUT, "CNAME"), `${DOMAIN}\n`);
  /* Belt and braces: stops any Jekyll-style processing of the artifact. */
  await writeFile(path.join(OUT, ".nojekyll"), "");

  console.log(`SITE BUILD OK — ${OUT}/`);
  (await listing(OUT)).forEach((l) => console.log("  " + l));
} catch (err) {
  console.error("SITE BUILD FAILED");
  console.error(err.message || err);
  process.exit(1);
}
