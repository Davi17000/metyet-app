/* ============================================================================
   ONE DEMO FLAG, AND WHY IT IS NOT THE DEV FLAG

   Two different audiences were sharing one switch.

   A vendor or collector trying the pilot at app.metyet.io needs to reach a deal
   that is already at Value Trade, and needs to put it back afterwards. That is
   not debugging — it is the only way to look at a six-stage flow without
   spending an afternoon getting there. Meanwhile an engineer needs tools that
   fabricate a counterparty's moves, which is precisely what a demo must not do
   when the person can simply switch persona and make the move for real.

   Gating both on DEV meant the pilot either showed engineering tooling or hid
   the scenario controls that make it useful. So there are two booleans:

     DEMO   intentional, tester-facing scenario controls
     DEV    engineering tooling

   DEV implies DEMO, decided HERE rather than at each call site, so that no
   component ever has to remember the relationship — an engineer running the
   full toolkit should not also have to ask for the demo controls.

   Resolution mirrors shared/dev-flag.js exactly:

     BROWSER  the bundler substitutes a literal for __METYET_DEMO__ at build
              time. One boolean crosses the boundary; no process shim.

     NODE     no substitution, so the environment is read directly, and tests
              that set process.env and re-require a bundle keep working.

   Anything not explicitly enabled is off, so a future customer build that
   defines neither flag ships with both surfaces absent by default rather than
   by remembering to turn them off.
   ========================================================================== */

/* eslint-disable no-undef */
import { DEV, isDev } from "./dev-flag.js";

const resolve = () => {
  /* Build-time literal, when a bundler has provided one. */
  if (typeof __METYET_DEMO__ !== "undefined") {
    return __METYET_DEMO__ === true || __METYET_DEMO__ === "1";
  }
  /* Otherwise the environment, when there is one to read. */
  if (typeof process !== "undefined" && process && process.env) {
    return process.env.METYET_DEMO === "1";
  }
  return false;
};

/* Engineering mode is a superset: DEV implies DEMO. */
export const DEMO = resolve() || DEV;

/* Node-side callers (tests, build scripts) may re-read after changing the
   environment; the browser value is fixed at build time either way. */
export const isDemo = () => resolve() || isDev();
