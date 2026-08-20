/* Production entry point ONLY.

   The application is shell/MetYetPrototype.jsx — the same canonical component
   local development mounts, the tests exercise, and the previews generate from.
   There is one MetYet, not a hosted variant of it: this file exists solely to
   mount that component in a browser and contains no product logic, no store,
   and no domain rules.

   The only difference from dev/main.jsx is what the bundler substitutes for
   __METYET_DEV__, which is how the demo tooling compiles out rather than being
   removed from source. StrictMode is deliberately absent here: its double
   render is a development diagnostic, not something to ship. */
import React from "react";
import { createRoot } from "react-dom/client";
import MetYetPrototype from "../shell/MetYetPrototype.jsx";

const mount = document.getElementById("root");
if (!mount) throw new Error("MetYet: no #root element to mount into.");

createRoot(mount).render(<MetYetPrototype />);
