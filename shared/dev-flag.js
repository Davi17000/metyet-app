/* ============================================================================
   ONE DEV FLAG, TWO RUNTIMES

   Development tooling — the prototype header's Demo stage selector, the
   Collector's review panel, the review fixtures in the seed — is gated on a
   single boolean. This module is the only place that boolean is decided.

   The problem this solves: every gate used to read `process.env.METYET_DEV`
   directly. That is correct under Node, where the tests and build scripts run,
   and silently false in a browser, where `process` does not exist — so
   `METYET_DEV=1 npm run dev` enabled nothing on screen. The guard was not
   broken; it simply had no way to learn the truth.

   So the flag is resolved from whichever source the runtime actually has:

     BROWSER  the bundler substitutes a literal for __METYET_DEV__ at build
              time (see dev-server.mjs). Exactly one boolean crosses the
              boundary — no process shim, no environment object, nothing else.

     NODE     no substitution happens, so `typeof __METYET_DEV__` is
              "undefined" and the environment is read directly. Tests that set
              process.env and re-require a bundle keep working unchanged.

   Anything not explicitly enabled is off. A production build that defines
   nothing therefore ships with dev tooling disabled, which is the behaviour we
   want by default rather than by remembering.
   ========================================================================== */

/* eslint-disable no-undef */
const resolve = () => {
  /* Build-time literal, when a bundler has provided one. */
  if (typeof __METYET_DEV__ !== "undefined") {
    return __METYET_DEV__ === true || __METYET_DEV__ === "1";
  }
  /* Otherwise the environment, when there is one to read. */
  if (typeof process !== "undefined" && process && process.env) {
    return process.env.METYET_DEV === "1";
  }
  return false;
};

export const DEV = resolve();

/* Node-side callers (tests, build scripts) may re-read after changing the
   environment; the browser value is fixed at build time either way. */
export const isDev = resolve;
