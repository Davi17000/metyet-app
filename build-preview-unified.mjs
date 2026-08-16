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

const OUT = "dist/MetYetPrototype.preview.jsx";

/* Bundle to ESM with React external — the artifact environment provides React. */
const result = await build({
  entryPoints: ["shell/MetYetPrototype.jsx"],
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

/* esbuild emits one React import per module. Collapse them to a single import,
   but preserve every named hook the bundle actually references — stripping them
   blind leaves undefined identifiers like useRef2. */
/* esbuild renames hooks per module (useState2, useRef2 ...). Capture BOTH the
   original name and any alias, so the collapsed import declares every
   identifier the bundle actually uses. */
const named = new Set(["useState"]);
const aliases = [];
/* Default-import aliases too: esbuild emits `import React3 from "react"`. */
code.replace(/^import\s+(\w+)(?:\s*,\s*\{[^}]*\})?\s*from\s*"react";?\s*$/gm, (m, def) => {
  if (def && def !== "React") aliases.push(["React", def]);
  return m;
});
code.replace(/^import\s+(?:\w+,\s*)?\{([^}]*)\}\s*from\s*"react";?\s*$/gm, (m, inner) => {
  inner.split(",").forEach((part) => {
    const bits = part.trim().split(/\s+as\s+/);
    const orig = (bits[0] || "").trim();
    const alias = (bits[1] || "").trim();
    if (orig) named.add(orig);
    if (alias && alias !== orig) aliases.push([orig, alias]);
  });
  return m;
});
code = code.replace(/^import\s+.*?from\s+"react";?\s*$/gm, "");
code = code.replace(/^import\s+.*?from\s+"react-dom.*?";?\s*$/gm, "");

/* The canonical file exports `__store` for tests; the artifact only needs the
   component as a default export. */
code = code.replace(/^export\s*\{[^}]*\};?\s*$/gm, "");
code = code.replace(/\bexport\s+(const|function|default)\b/g, "$1");

const reactImport = 'import React, { ' + [...named].join(", ") + ' } from "react";'
  + (aliases.length ? "\n" + aliases.map(([o, a]) => `const ${a} = ${o};`).join("\n") : "");
const banner = `/* GENERATED PREVIEW — DO NOT EDIT
 *
 * Built from the canonical modular source by build-preview.mjs:
 *   shell/MetYetPrototype.jsx
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
${reactImport}

`;

/* The component is declared without `export default` after the strip above. */
code = banner + code.trimStart() + "\n\nexport default MetYetPrototype;\n";

writeFileSync(OUT, code);
console.log("wrote", OUT, "-", code.split("\n").length, "lines");
