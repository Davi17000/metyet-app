import { build } from "esbuild";
await build({
  entryPoints: ["src/MetYet.jsx"],
  bundle: true, format: "cjs", platform: "node",
  outfile: "dist/MetYet.cjs",
  external: ["react", "react-dom", "react-test-renderer"],
  loader: { ".jsx": "jsx" }, jsx: "automatic",
  logLevel: "info",
});
