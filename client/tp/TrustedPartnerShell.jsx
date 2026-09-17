/* ============================================================================
   THE TRUSTED PARTNER PRODUCTION SHELL — PROJECTION IN, PIXELS OUT

     <TrustedPartnerShell state={projection} onSignOut={fn} />

   The Trusted Partner surface in production. Everything on it arrived in one
   `GET /api/view` response, and there is no second way for anything to get
   here: nothing under `client/tp/` imports a store, a session, an api client,
   a domain module or `fetch`. Hand it a projection and it renders; hand it
   nothing and it says so.

   THE INFORMATION ARCHITECTURE IS THE PRODUCT'S, NOT A NEW ONE. Three sections
   in the order the work actually flows — who you serve, what you hold, where
   the two meet — with the titles and subtitles the product has carried since
   Phase 1. Batch 5 filled them in; it did not rearrange them.

   THIS FILE IS THE FRAME. Navigation, counts, the shop's name, sign-out, and
   the stylesheet. Each section is its own module under `sections/`, because a
   section that is a real read experience is too long to share a file with two
   others and still be read by a person.

   WHAT IT DOES NOT DO, AND WHY EACH ONE MATTERS.

   It does not know who you are. `describeActor` reads the seat and the id the
   server sent; the shop's name is found by matching that id against the
   projection's own partner records. Nothing here can name a partner the server
   did not name.

   It does not compute a domain rule. A copy's status, a deal's stage, who is in
   the network — all canonical answers, carried on the rows. Counting the rows
   the server sent, and joining them by the ids they carry, is reading. Deciding
   what a row MEANS is not, and is not done here.

   It does not name a command. Phase 5 Batch 1 gave the product its first
   control that changes anything — a Trusted Partner's own shop profile, reached
   from Inventory's "View shop" — and it gets to the authenticated boundary
   through `onSaveProfile`, a function of one argument handed in from outside.
   Nothing under `client/tp/` holds a store, spells a command, or reaches the
   network, and a test keeps it that way. Everything else still changes nothing,
   and says so rather than offering a button that quietly does nothing.

   It does not assume data exists. A newly registered Trusted Partner has a name
   and nothing else. Every list handles nought rows as an ordinary case with a
   sentence, never as an error and never with invented sample content.

   IT IS USABLE ON A PHONE. Records are blocks of wrapping facts rather than
   table rows, so nothing scrolls sideways and no column collapses to nothing;
   under 860px the navigation becomes a strip across the top. A pilot happens on
   a shop counter, not only at a desk.
   ========================================================================== */

import React, { useState } from "react";
import { describeActor } from "../actor.js";
import { rows } from "./present.js";
import CollectorNetwork from "./sections/CollectorNetwork.jsx";
import Inventory from "./sections/Inventory.jsx";
import Opportunities from "./sections/Opportunities.jsx";

/* The three sections, in the product's own order: inputs before their
   consequences. Each one is recurring work a Trusted Partner opens MetYet to
   do, which is what earns a place here.

   A PROFILE IS NOT ONE OF THEM. It had a destination of its own for one
   release, and that gave it more weight than it carries: it is context for the
   shop rather than a workspace. It now lives behind Inventory's "View shop",
   which is also where it is most useful — the thing that makes a shelf of
   copies mean something to a collector.

   `writes` is what the read-only notice is keyed on. A section that cannot
   change anything says so; a section from which something CAN be changed does
   not carry a notice contradicting itself, and says what is still read-only in
   its own words instead. */
export const SECTIONS = Object.freeze([
  { id: "collectors", label: "Collector Network", title: "Collector Network",
    sub: "Who you're serving, and what you know about them" },
  { id: "inventory", label: "Inventory", title: "Inventory", writes: true,
    sub: "What you have and how it connects to collector demand" },
  { id: "opportunities", label: "Opportunities", title: "Opportunities",
    sub: "What you're actively coordinating, and what's waiting at each stage" },
]);

const VIEWS = { collectors: CollectorNetwork, inventory: Inventory, opportunities: Opportunities };

const CSS = `
.tps { --sidebar:#0F131B; --sidebar-2:#1A2130; --sidebar-line:#232B3A; --bg:#F1F3F6;
  --panel:#FFF; --line:#DFE4EA; --line-soft:#EDF0F4; --text:#131922; --muted:#616B7A;
  --faint:#8B95A3; --t1:#0B5D66; --t1-bg:#E6F0F1; --amber:#9A6408; --amber-bg:#FBF3E3;
  --amber-line:#EBD9B4;
  font-family:'Public Sans',system-ui,sans-serif; color:var(--text); font-size:13px;
  line-height:1.45; display:flex; min-height:100vh; background:var(--bg);
  -webkit-font-smoothing:antialiased; }
.tps *,.tps *::before,.tps *::after { box-sizing:border-box; }
.tps button { font-family:inherit; font-size:inherit; cursor:pointer; }
.tps :focus-visible { outline:2px solid var(--t1); outline-offset:1px; }
.tps .mono { font-variant-numeric:tabular-nums; }
.tps .disp { font-family:'Archivo',system-ui,sans-serif; }
.tps p { margin:0; }

/* ---- the rail ---- */
.tps-sb { width:228px; flex:0 0 228px; background:var(--sidebar); color:#C6CDD8;
  display:flex; flex-direction:column; border-right:1px solid var(--sidebar-line); }
.tps-brand { padding:18px; border-bottom:1px solid var(--sidebar-line); display:flex;
  align-items:center; gap:9px; }
.tps-mark-i { width:18px; height:18px; position:relative; flex:0 0 18px; display:block; }
.tps-mark-i i { position:absolute; width:11px; height:11px; border:1.5px solid #4E8C93; display:block; }
.tps-mark-i i:first-child { top:0; left:0; }
.tps-mark-i i:last-child { bottom:0; right:0; border-color:#E8EDF2; background:rgba(232,237,242,.08); }
.tps-word { font-family:'Archivo'; font-weight:600; font-size:15px; letter-spacing:-.01em; color:#F2F5F8; }
.tps-sec { padding:18px 18px 7px; font-family:'Archivo'; font-size:10px; letter-spacing:.1em;
  text-transform:uppercase; color:#5C6779; font-weight:600; }
.tps-nav { padding:0 8px; display:flex; flex-direction:column; gap:1px; }
.tps-item { display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:4px;
  background:none; border:0; color:#A9B3C1; text-align:left; width:100%; position:relative; }
.tps-item:hover { background:#161C27; color:#E4E9EF; }
.tps-item.on { background:var(--sidebar-2); color:#FFF; }
.tps-item.on::before { content:''; position:absolute; left:-8px; top:6px; bottom:6px; width:2px;
  background:#4E8C93; }
.tps-item .lbl { flex:1; font-size:13px; }
.tps-item .cnt { font-size:11px; color:#6C7787; }
.tps-item.on .cnt { color:#9FB6B9; }
.tps-foot { margin-top:auto; padding:14px 18px; border-top:1px solid var(--sidebar-line); }
.tps-foot .n { color:#E4E9EF; font-weight:600; font-size:12.5px; }
.tps-foot .r { color:#5C6779; font-size:11px; letter-spacing:.04em; text-transform:uppercase;
  font-family:'Archivo'; font-weight:600; margin-top:2px; }
.tps-out { margin-top:12px; width:100%; background:none; border:1px solid #2A3446; color:#A9B3C1;
  border-radius:6px; padding:6px 10px; font-size:12.5px; }
.tps-out:hover { border-color:#46536B; color:#FFF; }

/* ---- the page ---- */
.tps-main { flex:1; display:flex; flex-direction:column; min-width:0; }
.tps-top { background:#FFF; border-bottom:1px solid var(--line); padding:14px 22px; flex:0 0 auto; }
.tps-top h1 { font-family:'Archivo'; font-size:17px; font-weight:600; margin:0; letter-spacing:-.01em; }
.tps-top .sub { color:var(--muted); font-size:12.5px; margin-top:1px; }
.tps-ro { display:flex; gap:8px; flex-wrap:wrap; align-items:baseline; background:var(--amber-bg);
  border-bottom:1px solid var(--amber-line); color:var(--amber); padding:7px 22px; font-size:12.5px; }
.tps-ro .tps-dim { color:#A9863F; }
.tps-scroll { flex:1; padding:18px 22px 44px; }

/* ---- panels and records ---- */
.tps-panel { background:var(--panel); border:1px solid var(--line); border-radius:6px;
  box-shadow:0 1px 1px rgba(19,25,34,.03); margin-bottom:16px; overflow:hidden; }
.tps-ph { display:flex; align-items:baseline; gap:10px; padding:11px 16px;
  border-bottom:1px solid var(--line-soft); }
.tps-ph h2 { font-family:'Archivo'; font-size:10.5px; font-weight:600; letter-spacing:.09em;
  text-transform:uppercase; color:var(--muted); margin:0; }
.tps-note { margin-left:auto; font-size:11.5px; color:var(--faint); }
.tps-empty { padding:22px 16px; color:var(--muted); max-width:62ch; }
.tps-list { display:flex; flex-direction:column; }
.tps-foot-note { padding:10px 16px; color:var(--faint); font-size:12px;
  border-top:1px solid var(--line-soft); }

.tps-rec { padding:13px 16px; border-bottom:1px solid var(--line-soft); }
.tps-rec:last-child { border-bottom:0; }
.tps-rec-head { display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap; }
.tps-rec-id { min-width:0; flex:1 1 260px; }
.tps-rec-t { font-weight:600; font-size:14px; }
.tps-rec-s { color:var(--muted); margin-top:1px; }
.tps-rec-tags { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
.tps-rec-note { margin-top:8px; color:var(--muted); display:flex; gap:7px; flex-wrap:wrap; }

.tps-tag { display:inline-block; font-size:10.5px; letter-spacing:.03em; padding:2px 7px;
  border-radius:3px; background:#F2F4F7; color:var(--muted); border:1px solid var(--line-soft);
  white-space:nowrap; }
.tps-tag-strong { background:var(--t1-bg); color:var(--t1); border-color:#CBE0E2; }
.tps-tag-unknown { background:var(--amber-bg); color:var(--amber); border-color:var(--amber-line); }

.tps-marks { display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; }
.tps-mark { font-size:11px; color:var(--faint); border:1px solid var(--line-soft);
  border-radius:3px; padding:1px 6px; }
.tps-prefs { margin-top:9px; }

.tps-facts { display:flex; flex-wrap:wrap; gap:6px 18px; margin-top:9px; }
.tps-fact { display:flex; gap:6px; align-items:baseline; min-width:0; }
.tps-fact-l { font-family:'Archivo',system-ui,sans-serif; font-size:9.5px; letter-spacing:.07em;
  text-transform:uppercase; color:var(--faint); font-weight:600; white-space:nowrap; }
.tps-fact-v { font-size:12.5px; }

.tps-sub { list-style:none; margin:10px 0 0; padding:9px 0 0; border-top:1px dashed var(--line-soft);
  display:flex; flex-direction:column; gap:5px; }
.tps-sub li { display:flex; gap:8px; flex-wrap:wrap; align-items:baseline; }
.tps-sub-t { font-weight:500; }
.tps-sub-s { color:var(--faint); font-size:12px; }
.tps-sub-n { color:var(--muted); font-size:12px; }

/* ---- the one thing that writes ---- */
.tps-edit { background:none; border:1px solid var(--line); border-radius:5px; padding:4px 11px;
  color:var(--t1); font-size:12px; font-weight:600; }
.tps-edit:hover { border-color:var(--t1); background:var(--t1-bg); }
.tps-act { margin-left:auto; display:flex; align-items:center; }
.tps-act-lead { margin-left:auto; }
.tps-ph .tps-note + .tps-act { margin-left:12px; }
.tps-crumb { margin:0 0 12px; }
.tps-back { background:none; border:0; padding:0; color:var(--t1); font-size:12.5px;
  font-weight:600; }
.tps-back:hover { text-decoration:underline; }
.tps-form { display:block; }
.tps-fields { display:flex; flex-wrap:wrap; gap:14px 18px; padding:15px 16px; }
.tps-field { display:flex; flex-direction:column; gap:4px; flex:1 1 220px; min-width:0; }
.tps-field.wide { flex-basis:100%; }
.tps-field-l { font-family:'Archivo',system-ui,sans-serif; font-size:9.5px; letter-spacing:.07em;
  text-transform:uppercase; color:var(--faint); font-weight:600; }
.tps-field-h { color:var(--faint); font-size:11.5px; }
.tps-input { width:100%; padding:8px 10px; border:1px solid var(--line); border-radius:5px;
  font-family:inherit; font-size:13px; color:var(--text); background:#FFF; resize:vertical; }
.tps-input:focus-visible { outline:2px solid var(--t1); outline-offset:1px; border-color:var(--t1); }
.tps-input:disabled { background:#F7F8FA; color:var(--muted); }
.tps-actions { display:flex; gap:9px; flex-wrap:wrap; padding:0 16px 15px; }
.tps-save { background:var(--t1); border:1px solid var(--t1); color:#FFF; border-radius:5px;
  padding:8px 15px; font-weight:600; font-size:13px; }
.tps-save:disabled { opacity:.6; cursor:default; }
.tps-cancel { background:#FFF; border:1px solid var(--line); color:var(--muted); border-radius:5px;
  padding:8px 15px; font-size:13px; }
.tps-cancel:disabled { opacity:.6; cursor:default; }
.tps-problem { margin:0 16px 14px; padding:9px 11px; background:var(--amber-bg);
  border:1px solid var(--amber-line); border-radius:5px; color:var(--amber); max-width:70ch; }
.tps-aside { color:var(--faint); font-size:12px; max-width:70ch; }

/* ---- a phone ---- */
@media (max-width:860px) {
  .tps { display:block; }
  .tps-sb { width:auto; flex:none; border-right:0; border-bottom:1px solid var(--sidebar-line); }
  .tps-sec { display:none; }
  .tps-nav { flex-direction:row; overflow-x:auto; padding:8px; gap:6px; }
  .tps-item { width:auto; flex:0 0 auto; gap:7px; }
  .tps-item.on::before { display:none; }
  .tps-foot { margin-top:0; display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:11px 16px; }
  .tps-foot .r { margin-top:0; }
  .tps-out { margin-top:0; width:auto; margin-left:auto; }
  .tps-top, .tps-ro { padding-left:16px; padding-right:16px; }
  .tps-scroll { padding:14px 12px 36px; }
  .tps-rec, .tps-ph, .tps-empty, .tps-foot-note { padding-left:13px; padding-right:13px; }
}
`;

export default function TrustedPartnerShell({ state, onSignOut, onSaveProfile = null }) {
  const [section, setSection] = useState(SECTIONS[0].id);

  const who = describeActor(state);
  /* A count is the rows the server sent. */
  const counts = {
    collectors: rows(state && state.collectors).length,
    inventory: rows(state && state.inventory).filter((i) => !i.archived).length,
    opportunities: rows(state && state.opportunities).filter((o) => o.stage !== "completed").length,
  };
  const meta = SECTIONS.find((s) => s.id === section) || SECTIONS[0];
  const View = VIEWS[meta.id];
  /* Only the section the profile is reached from receives the callback. It is
     the Trusted Partner's own profile and nothing else's, so nothing else is
     handed a way to send it. */
  const extra = meta.id === "inventory" ? { onSaveProfile } : null;

  return (
    <div className="tps">
      <style>{CSS}</style>

      <nav className="tps-sb" aria-label="Trusted Partner">
        <div className="tps-brand">
          <span className="tps-mark-i"><i /><i /></span>
          <span className="tps-word">MetYet</span>
        </div>
        <div className="tps-sec">Trusted Partner</div>
        <div className="tps-nav">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button"
              className={"tps-item" + (s.id === section ? " on" : "")}
              aria-current={s.id === section ? "page" : undefined}
              onClick={() => setSection(s.id)}>
              <span className="lbl">{s.label}</span>
              {counts[s.id] === undefined ? null : <span className="cnt mono">{counts[s.id]}</span>}
            </button>
          ))}
        </div>
        <div className="tps-foot">
          {/* The shop's own name, found by the actor's own id. When the server
              named nobody, nothing is substituted for it. */}
          <div className="n">{who.name || "Your workspace"}</div>
          <div className="r">Trusted Partner</div>
          <button className="tps-out" type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </nav>

      <div className="tps-main">
        <div className="tps-top">
          <h1 className="disp">{meta.title}</h1>
          <div className="sub">{meta.sub}</div>
        </div>
        {meta.writes ? null : (
          <div className="tps-ro" role="note">
            <span>Read-only for now — everything here is what the server holds for you.</span>
            <span className="tps-dim">Actions arrive in a later release.</span>
          </div>
        )}
        <div className="tps-scroll" key={section}>
          <View state={state} {...extra} />
        </div>
      </div>
    </div>
  );
}
