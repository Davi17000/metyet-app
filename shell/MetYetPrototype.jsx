import React, { useState, useRef } from "react";
import MetYet, { buildCanonicalSeed, demoDealFixture, demoDealStage } from "../src/MetYet.jsx";
import MetYetCollector from "../collector/MetYetCollector.jsx";
import { createStore } from "../domain/metyet-store.js";
import { DEV as SHARED_DEV } from "../shared/dev-flag.js";
import { DEMO as SHARED_DEMO } from "../shared/demo-flag.js";

/* ============================================================================
   THE METYET PROTOTYPE SHELL

   One runtime, two perspectives.

   The shell owns exactly one store instance for the life of the prototype and
   hands it to whichever persona is mounted. It is deliberately thin: store
   lifetime, active persona, persona identity, switching, and one demo reset.
   No domain rule lives here — matching, lifecycle, settlement, privacy and the
   invariants all stay in the canonical domain, where both personas read them.

   The governing rule this exists to demonstrate:
     one mutation -> one canonical state change -> two perspectives -> no sync.

   Persona selection sits OUTSIDE both information architectures. The Trusted
   Partner sidebar and the Collector's three tabs are untouched; switching lives
   in a prototype strip that belongs to neither product.
   ========================================================================== */

const SELF_PARTNER = "p-self";
const SELF_COLLECTOR = "c12";

/* Prototype tooling is hidden unless explicitly enabled, exactly as the
   Collector's own review panel is, so nothing here can reach a normal build.
   One flag, shared with every other gate — see shared/dev-flag.js. */
const DEV = SHARED_DEV;
/* Scenario controls are for whoever is trying the product, not only for us.
   DEV implies DEMO at the flag layer, so this needs no `|| DEV` here. */
const DEMO = SHARED_DEMO;

/* The five canonical active stages, in lifecycle order. Labels match the ones
   the product uses so the control reads the same as the rail beside it. */
/* Before any offer exists. NOT Deal Flow stages — the lifecycle still has
   exactly five, and nothing here is ever written to opportunity.stage. */
/* User-facing language is Review Card. The fixture ids stay `pre-deal*`: they
   are internal, referenced by tests and the seed, and renaming them would be
   churn without meaning. What the reviewer reads is what matters. */
const DEMO_PRE = [
  { id: "pre-deal", label: "Review Card · awaiting photos" },
  { id: "pre-deal-ready", label: "Review Card · photos ready" },
];

const DEMO_STAGES = [
  { id: "agree-price", label: "Agree on Price" },
  { id: "select-trade", label: "Select Trade" },
  { id: "value-trade", label: "Value Trade" },
  { id: "deal", label: "Deal" },
  { id: "fulfillment", label: "Fulfillment" },
];

const PERSONAS = [
  { id: "tp", label: "Trusted Partner", who: "Northline Cards",
    blurb: "Manage your collector network, inventory, opportunities and sourcing.",
    cta: "Continue as Trusted Partner" },
  { id: "collector", label: "Collector", who: "Casey Lin",
    blurb: "Manage your collecting goals, Trade Binder and Trusted Partner relationships.",
    cta: "Continue as Collector" },
];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Public+Sans:wght@400;500;600&display=swap');
.myp { font-family: 'Public Sans', system-ui, sans-serif; color: #131922; }
.myp * { box-sizing: border-box; }
.myp button { font: inherit; color: inherit; cursor: pointer; }

/* ---- startup chooser: a prototype entry point, not a marketing page ---- */
.myp-enter { min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: #F1F3F6; padding: 28px 20px; }
.myp-body { background: #0A1014; }
.myp-box { width: 100%; max-width: 760px; }
.myp-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 26px; }
.myp-mark { width: 30px; height: 30px; border-radius: 8px; background: #0B5D66; color: #FFF;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Archivo'; font-weight: 700; font-size: 15px; }
.myp-wm { font-family: 'Archivo'; font-weight: 700; font-size: 19px; letter-spacing: -.01em; }
.myp-h { font-family: 'Archivo'; font-size: 27px; font-weight: 700; letter-spacing: -.02em;
  line-height: 1.15; margin: 0 0 6px; }
.myp-sub { font-size: 14px; color: #616B7A; margin-bottom: 26px; }
.myp-grid { display: grid; gap: 16px; grid-template-columns: 1fr; }
@media (min-width: 720px) { .myp-grid { grid-template-columns: 1fr 1fr; } }
.myp-card { background: #FFF; border: 1px solid #DFE4EA; border-radius: 14px; padding: 22px;
  display: flex; flex-direction: column; text-align: left;
  box-shadow: 0 1px 2px rgba(15,19,27,.04), 0 8px 22px rgba(15,19,27,.05);
  transition: border-color .14s ease, transform .14s ease; }
.myp-card:hover { border-color: #B9C4CE; transform: translateY(-2px); }
.myp-role { font-family: 'Archivo'; font-size: 18px; font-weight: 700; }
.myp-who { font-size: 12.5px; color: #8B95A3; margin-top: 2px; }
.myp-blurb { font-size: 13.5px; color: #616B7A; line-height: 1.5; margin: 12px 0 20px; flex: 1; }
.myp-cta { display: inline-flex; align-items: center; justify-content: center;
  border-radius: 10px; padding: 11px 16px; font-size: 14px; font-weight: 600;
  background: #0B5D66; border: 1px solid #0B5D66; color: #FFF; }
.myp-note { font-size: 12px; color: #8B95A3; margin-top: 22px; text-align: center; }

/* ---- prototype strip: outside both product IAs, quiet by design ---- */
.myp-bar { display: flex; align-items: center; gap: 10px; padding: 6px 14px;
  background: #0F131B; color: #C6CEDA; font-size: 12px; position: relative; z-index: 60; }
.myp-tag { font-family: 'Archivo'; font-size: 9px; letter-spacing: .13em; text-transform: uppercase;
  font-weight: 700; color: #7E8AA0; }
.myp-viewing { color: #FFF; font-weight: 600; }
.myp-actions { margin-left: auto; display: flex; gap: 8px; align-items: center; }
/* Same scale and voice as the buttons beside it — tooling, not product CTA. */
.myp-stage { display: inline-flex; align-items: center; gap: 6px; }
.myp-stage-l { font-size: 11px; letter-spacing: .04em; text-transform: uppercase;
  opacity: .7; }
.myp-sel { font: inherit; font-size: 12px; padding: 4px 8px; border-radius: 7px;
  background: transparent; color: inherit; border: 1px solid currentColor;
  opacity: .85; cursor: pointer; }
.myp-btn { background: none; border: 1px solid #2A3446; color: #C6CEDA; border-radius: 7px;
  padding: 4px 10px; font-size: 12px; }
.myp-btn:hover { border-color: #46536B; color: #FFF; }
/* ABOVE THE VEIL, EXPLICITLY. Both live in .myp-bar's stacking context; the
   veil claims z-index 55 while the menu claimed none, so the transparent veil
   painted over the menu and swallowed every click. The menu looked fine and did
   nothing: choosing a persona hit the veil, which closes the menu. One number
   short of the veil is enough, and states the relationship rather than relying
   on document order. */
.myp-menu { position: absolute; top: 32px; right: 14px; background: #FFF; color: #131922;
  border: 1px solid #DFE4EA; border-radius: 9px; padding: 4px; min-width: 190px;
  box-shadow: 0 10px 28px rgba(15,19,27,.18); z-index: 56; }
.myp-item { display: block; width: 100%; text-align: left; background: none; border: 0;
  padding: 8px 10px; border-radius: 6px; font-size: 13px; }
.myp-item:hover { background: #F1F4F7; }
.myp-item.on { color: #0B5D66; font-weight: 600; }
.myp-veil { position: fixed; inset: 0; z-index: 55; }
.myp-body { position: relative; }
`;

export default function MetYetPrototype() {
  /* ONE STORE FOR THE RUNTIME. A ref, so persona changes — which are ordinary
     state updates — can never re-run the factory. Switching perspective must
     not be able to replace reality. */
  const storeRef = useRef(null);
  /* THE DEMO WORLD NEEDS THE GOAL THE SCENARIOS TALK ABOUT. Every scenario
     rebuilds the canonical review fixture and swaps it onto the collector's
     matching goal — so without `review`, that goal is simply absent, the loader
     finds nothing to swap, and every selection silently does nothing. Seeding
     the same way the scenarios expect is what makes them real. A build with
     DEMO off is untouched: it seeds exactly as before. */
  if (storeRef.current === null) {
    storeRef.current = createStore(buildCanonicalSeed({ review: DEMO }));
  }
  const store = storeRef.current;

  const [persona, setPersona] = useState(null);      // null = the chooser
  const [menu, setMenu] = useState(false);
  /* Remounts the persona tree after a reset so components re-read the restored
     universe. It does NOT recreate the store. */
  const [epoch, setEpoch] = useState(0);

  if (persona === null) {
    return (
      <div className="myp">
        <style>{CSS}</style>
        <div className="myp-enter">
          <div className="myp-box">
            <div className="myp-brand">
              <span className="myp-mark">M</span>
              <span className="myp-wm">MetYet</span>
            </div>
            <h1 className="myp-h">How would you like to explore MetYet?</h1>
            <div className="myp-sub">
              Both experiences run on the same live data. Anything you do as one side
              is visible from the other.
            </div>
            <div className="myp-grid">
              {PERSONAS.map((p) => (
                <button key={p.id} className="myp-card" onClick={() => setPersona(p.id)}>
                  <span className="myp-role">{p.label}</span>
                  <span className="myp-who">{p.who}</span>
                  <span className="myp-blurb">{p.blurb}</span>
                  <span className="myp-cta">{p.cta}</span>
                </button>
              ))}
            </div>
            <div className="myp-note">Prototype — you can switch sides at any time.</div>
          </div>
        </div>
      </div>
    );
  }

  const current = PERSONAS.find((p) => p.id === persona);
  /* Derived from the live opportunity, so the control always reflects what is
     actually loaded — including after the demo is reset. */
  const demoStage = DEMO ? demoDealStage(store.get(), SELF_COLLECTOR) : null;

  return (
    <div className="myp">
      <style>{CSS}</style>

      {/* Prototype scaffolding. Deliberately not part of either product's
          navigation — the TP sidebar and the Collector's tabs are untouched. */}
      <div className="myp-bar">
        <span className="myp-tag">Prototype</span>
        <span>Viewing as <span className="myp-viewing">{current.label}</span> · {current.who}</span>
        <span className="myp-actions">
          <button className="myp-btn" aria-haspopup="menu" aria-expanded={menu}
            onClick={() => setMenu(!menu)}>Switch persona</button>
          {/* SCENARIO — tester-facing, and Collector-only: it loads a Collector
              review fixture, so it has no business appearing while the Trusted
              Partner product is on screen. It calls the SAME loader the
              Collector's review panel uses; it never writes a stage. */}
          {DEMO && persona === "collector" && (
            <label className="myp-stage">
              <span className="myp-stage-l">Scenario</span>
              <select className="myp-sel" value={demoStage || ""}
                aria-label="Scenario"
                onChange={(e) => {
                  const next = demoDealFixture(store.get(),
                    { collectorId: SELF_COLLECTOR, demoStage: e.target.value });
                  if (next) { store.set(next); setEpoch((n) => n + 1); }
                }}>
                {/* Kept in its own group: these come BEFORE a deal exists, and
                    must never read as a sixth Deal Flow stage. */}
                <optgroup label="Review Card">
                  {DEMO_PRE.map((x) => (
                    <option key={x.id} value={x.id}>{x.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Deal stage">
                  {DEMO_STAGES.map((x) => (
                    <option key={x.id} value={x.id}>{x.label}</option>
                  ))}
                </optgroup>
              </select>
            </label>
          )}
          <button className="myp-btn" onClick={() => {
            /* ONE reset for ONE universe: restoring the seed resets both
               perspectives, because there is only one reality to restore. */
            /* Reset returns to the demo baseline, not a world the scenarios
               can no longer address. */
            store.reset(buildCanonicalSeed({ review: DEMO }));
            setEpoch((e) => e + 1);
            setMenu(false);
          }}>Reset demo</button>
        </span>
        {menu && (<>
          <span className="myp-veil" onClick={() => setMenu(false)} />
          <span className="myp-menu" role="menu">
            {PERSONAS.map((p) => (
              <button key={p.id} role="menuitem"
                className={"myp-item" + (p.id === persona ? " on" : "")}
                onClick={() => { setPersona(p.id); setMenu(false); }}>
                {p.label} · {p.who}
              </button>
            ))}
          </span>
        </>)}
      </div>

      {/* The SAME store instance goes to whichever persona is mounted. Neither
          app's standalone fallback is used inside the shell, because an injected
          store always wins. */}
      <div className="myp-body">
        {persona === "tp"
          ? <MetYet key={"tp-" + epoch} store={store} partnerId={SELF_PARTNER} />
          : <MetYetCollector key={"col-" + epoch} store={store} collectorId={SELF_COLLECTOR} />}
      </div>
    </div>
  );
}

/* Exposed for the unified-runtime tests: they must be able to assert that the
   store instance survives a persona switch. Not product surface. */
export { PERSONAS, SELF_PARTNER, SELF_COLLECTOR, DEMO_STAGES, DEMO_PRE };
