/* Development entry point ONLY.

   The application is shell/MetYetPrototype.jsx — the same canonical component
   the tests and the generated previews use. This file exists solely to mount it
   in a browser, and contains no product logic, no store, and no domain rules. */
import React from "react";
import { createRoot } from "react-dom/client";
import MetYetPrototype from "../shell/MetYetPrototype.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <MetYetPrototype />
  </React.StrictMode>
);
