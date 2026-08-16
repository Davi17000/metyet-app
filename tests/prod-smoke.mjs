import React from "react";
import { readFileSync } from "fs";
import { renderToStaticMarkup } from "react-dom/server";
const { default: MetYet } = await import("../dist/MetYet.prod.js");

const html = renderToStaticMarkup(React.createElement(MetYet));
if (!html.includes("MetYet") || html.length < 5000) { console.error("prod bundle did not render"); process.exit(1); }

const src = readFileSync("dist/MetYet.prod.js", "utf8");
const need = ["Trade Binder", "Open to trade", "s Trade Binder", "No cards shared in their trade binder",
  "No cards match your search", "Search trade binder...", "View all ", "Show fewer", "open to trade", "cp-bind-grid", "of listed price", "Send counter", "% of listed", "% of ", "Send market counter", "Reference value", "Add to Trade Binder", "View copy", "Trade Value", "View larger", "copyph-btn", "Their offer", "Trade %", "Send trade proposal", "Send trade counter", "on agreed market value", "Card Details", "Would you accept this card into the trade?", "Accepted cards move to Value Trade.", "Copy card information", "Copy PSA certification number", "Card info", "PSA Cert #", "execCommand", "textarea", "readonly"];
const gone = ["Their $", "Trade Credit", "— credit ", "Propose your default", "trade value on ${nm}", "Valuation opens as soon as", "Collector value"];
const bad = ["Flag more", "Would consider"];
for (const n of need) if (!src.includes(n)) { console.error("MISSING from prod bundle:", n); process.exit(1); }
for (const b of [...bad, ...gone]) if (src.includes(b)) { console.error("STALE string in prod bundle:", b); process.exit(1); }
console.log("PROD SMOKE OK — rendered", html.length, "chars; binder strings shipped, old CTA wording absent");
