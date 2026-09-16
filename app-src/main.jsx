/* ============================================================================
   THE PRODUCTION CLIENT'S ONE ENTRY POINT

   Built by app.build.mjs, served by the API server at app.metyet.io. It wires
   the four pieces the last two batches built and adds nothing of its own:

     production config  ->  supabase auth  ->  session
                                                 |
                                            api client  ->  production store
                                                 |
                                              <SignIn />

   If the build was configured wrongly — a missing value, a plaintext address, a
   secret key — that is discovered HERE, at boot, and shown as one clear message
   rather than as a different failure on each screen.
   ========================================================================== */
import React from "react";
import { createRoot } from "react-dom/client";
import { readProductionConfig, ProductionConfigError } from "../client/production-config.js";
import { createSupabaseAuth } from "../client/supabase-auth.js";
import { createSupabaseSession } from "../client/supabase-session.js";
import { createApiClient } from "../client/api.js";
import { createProductionStore } from "../client/production-store.js";
import SignIn from "../client/sign-in/SignIn.jsx";

const problemScreen = (lines) => React.createElement("div",
  { style: { minHeight: "100vh", background: "#F1F3F6", color: "#98302C", padding: 32,
    fontFamily: "'Public Sans', system-ui, sans-serif", fontSize: 14 } },
  React.createElement("div", { style: { fontWeight: 600, marginBottom: 8 } },
    "MetYet cannot start"),
  lines.map((line, i) => React.createElement("div", { key: i }, line)));

function mount() {
  const root = createRoot(document.getElementById("root"));

  let config;
  try {
    config = readProductionConfig();
  } catch (error) {
    /* The NAMES of what is wrong, never the values. */
    root.render(problemScreen(error instanceof ProductionConfigError ? error.problems : ["configuration could not be read"]));
    return;
  }

  const auth = createSupabaseAuth({ supabaseUrl: config.supabaseUrl, publishableKey: config.publishableKey });
  const session = createSupabaseSession({ auth });
  const api = createApiClient({ baseUrl: config.apiUrl, getToken: () => session.token() });
  const store = createProductionStore({ api });

  root.render(React.createElement(SignIn, { session, store }));
}

mount();
