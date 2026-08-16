import { build } from "esbuild";
const r = await build({
  entryPoints: ["src/MetYet.jsx"],
  bundle: true, minify: true, format: "esm", platform: "browser",
  target: ["es2020"], outfile: "dist/MetYet.prod.js",
  external: ["react", "react-dom"],
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  metafile: true, logLevel: "warning",
});
const o = Object.values(r.metafile.outputs)[0];
console.log("PRODUCTION BUILD OK — bytes:", o.bytes);
