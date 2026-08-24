/* DEV/REVIEW ENTRY ONLY — never bundled into production.

   Mounts the real Collector app and hands it the review scenario's frozen
   state, so a screenshot is of the product rather than of anything this harness
   drew. `__uxDrive` exposes only surface switching, so the runner can open
   Messages or the photo viewer the way a thumb would. */
import React from "react";
import { createRoot } from "react-dom/client";
import Collector, { __store } from "../collector/MetYetCollector.jsx";

const injected = window.__UX_STATE__;
if (injected) __store.reset(injected);

window.__uxDrive = (surface) => {
  const hit = (re) => Array.from(document.querySelectorAll("button"))
    .find((b) => re.test((b.textContent || "").trim()));
  const deal = hit(/^Deal Flow/);
  if (deal && deal.getAttribute("aria-expanded") !== "true") deal.click();
  if (surface === "messages") { const m = hit(/^Messages$/); if (m) m.click(); }
  if (surface === "timeline") { const t = hit(/^Timeline$/); if (t) t.click(); }
  if (surface === "photos") {
    const c = document.querySelector(".mdl-card");
    if (c) c.click();
  }
};

createRoot(document.getElementById("root")).render(<Collector />);
