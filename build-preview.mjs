/* ============================================================================
   PREVIEW GENERATOR

   Bundles the canonical modular source into ONE self-contained JSX file that
   Claude's artifact viewer can execute. The output is derived, never edited:
   every future change goes into the modules and this is re-run.

   The bundler inlines the domain modules exactly as written, so the preview and
   the tested source cannot diverge — there is no hand-copied logic anywhere.
   ========================================================================== */
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "fs";

const OUT = "dist/MetYetCollector.preview.jsx";

/* Bundle to ESM with React external — the artifact environment provides React. */
const result = await build({
  entryPoints: ["collector/MetYetCollector.jsx"],
  bundle: true,
  format: "esm",
  target: "es2020",
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  external: ["react", "react-dom"],
  write: false,
  logLevel: "warning",
});

let code = result.outputFiles[0].text;

/* esbuild emits `import React from "react"` fragments per module; collapse to a
   single import the artifact runtime understands. */
code = code.replace(/^import\s+.*?from\s+"react";?\s*$/gm, "");
code = code.replace(/^import\s+.*?from\s+"react-dom.*?";?\s*$/gm, "");

/* The canonical file exports `__store` for tests; the artifact only needs the
   component as a default export. */
code = code.replace(/^export\s*\{[^}]*\};?\s*$/gm, "");
code = code.replace(/\bexport\s+(const|function|default)\b/g, "$1");

const banner = `/* GENERATED PREVIEW — DO NOT EDIT
 *
 * Built from the canonical modular source by build-preview.mjs:
 *   collector/MetYetCollector.jsx
 *   domain/metyet-domain.js
 *   domain/metyet-entities.js
 *   domain/metyet-store.js
 *   domain/collector-view.js
 *
 * This file exists ONLY so the Collector experience can be previewed in an
 * environment that cannot resolve module imports. It is a build output, not a
 * source of truth, and it is not an input to future development. Change the
 * modules and re-run: node build-preview.mjs
 */
import React, { useState, useMemo, useSyncExternalStore } from "react";

`;

/* The component is declared without `export default` after the strip above. */
code = banner + code.trimStart() + "\n\nexport default MetYetCollector;\n";

writeFileSync(OUT, code);
console.log("wrote", OUT, "-", code.split("\n").length, "lines");
