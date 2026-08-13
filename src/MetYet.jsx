import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";

/* ============================================================
   MetYet — Trusted Partner Experience (pilot prototype)
   Single-file interactive prototype. All data is local mock data.
   ============================================================ */

/* ---------------------------- DESIGN TOKENS ---------------------------- */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Public+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

.my-root {
  --sidebar: #0F131B;
  --sidebar-2: #1A2130;
  --sidebar-line: #232B3A;
  --bg: #F1F3F6;
  --panel: #FFFFFF;
  --line: #DFE4EA;
  --line-soft: #EDF0F4;
  --text: #131922;
  --muted: #616B7A;
  --faint: #8B95A3;
  --t1: #0B5D66;
  --t2: #4E8C93;
  --t3: #B3C6C9;
  --t1-bg: #E6F0F1;
  --t2-bg: #EFF5F5;
  --t3-bg: #F4F7F7;
  --amber: #9A6408;
  --amber-bg: #FBF3E3;
  --amber-line: #EBD9B4;
  --danger: #98302C;
  --danger-bg: #FBEDEC;

  font-family: 'Public Sans', system-ui, sans-serif;
  color: var(--text);
  font-size: 13px;
  line-height: 1.45;
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}
.my-root *, .my-root *::before, .my-root *::after { box-sizing: border-box; }
.my-root button { font-family: inherit; font-size: inherit; cursor: pointer; }
.my-root input, .my-root select, .my-root textarea { font-family: inherit; font-size: 13px; color: var(--text); }
.my-root :focus-visible { outline: 2px solid var(--t1); outline-offset: 1px; }
.mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
.disp { font-family: 'Archivo', system-ui, sans-serif; }

/* ---- sidebar ---- */
.sb { width: 228px; flex: 0 0 228px; background: var(--sidebar); color: #C6CDD8; display: flex; flex-direction: column; border-right: 1px solid var(--sidebar-line); }
.sb-brand { padding: 18px 18px 16px; border-bottom: 1px solid var(--sidebar-line); display: flex; align-items: center; gap: 9px; }
.sb-mark { width: 18px; height: 18px; position: relative; flex: 0 0 18px; }
.sb-mark i { position: absolute; width: 11px; height: 11px; border: 1.5px solid #4E8C93; display: block; }
.sb-mark i:first-child { top: 0; left: 0; }
.sb-mark i:last-child { bottom: 0; right: 0; border-color: #E8EDF2; background: rgba(232,237,242,.08); }
.sb-word { font-family: 'Archivo'; font-weight: 600; font-size: 15px; letter-spacing: -0.01em; color: #F2F5F8; }
.sb-sec { padding: 18px 18px 7px; font-family: 'Archivo'; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #5C6779; font-weight: 600; }
.sb-nav { padding: 0 8px; display: flex; flex-direction: column; gap: 1px; }
.sb-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 4px; background: none; border: 0; color: #A9B3C1; text-align: left; width: 100%; position: relative; }
.sb-item:hover { background: #161C27; color: #E4E9EF; }
.sb-item.on { background: var(--sidebar-2); color: #FFF; }
.sb-item.on::before { content: ''; position: absolute; left: -8px; top: 6px; bottom: 6px; width: 2px; background: #4E8C93; }
.sb-item .lbl { flex: 1; font-size: 13px; }
.sb-item .cnt { font-family: 'IBM Plex Mono'; font-size: 11px; color: #6C7787; }
.sb-item.on .cnt { color: #9FB6B9; }
.sb-foot { margin-top: auto; padding: 14px 18px; border-top: 1px solid var(--sidebar-line); }
.sb-foot .n { color: #E4E9EF; font-weight: 600; font-size: 12.5px; }
.sb-foot .r { color: #5C6779; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; font-family: 'Archivo'; font-weight: 600; margin-top: 2px; }

/* ---- main ---- */
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.top { background: #FFF; border-bottom: 1px solid var(--line); padding: 13px 22px; display: flex; align-items: center; gap: 16px; flex: 0 0 auto; }
.top h1 { font-family: 'Archivo'; font-size: 17px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
.top .sub { color: var(--muted); font-size: 12.5px; margin-top: 1px; }
.top .spacer { flex: 1; }
.scroll { flex: 1; overflow-y: auto; padding: 18px 22px 40px; }

/* ---- primitives ---- */
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 5px; box-shadow: 0 1px 1px rgba(19,25,34,.03); }
.ph { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--line-soft); }
.ph h2 { font-family: 'Archivo'; font-size: 10.5px; font-weight: 600; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); margin: 0; }
.ph .note { margin-left: auto; font-size: 11.5px; color: var(--faint); }
.pb { padding: 14px; }
.grid { display: grid; gap: 14px; }

.btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); background: #FFF; color: var(--text); padding: 6px 11px; border-radius: 4px; font-size: 12.5px; font-weight: 500; }
.btn:hover { background: #F7F9FA; border-color: #CBD3DB; }
.btn.pri { background: var(--t1); border-color: var(--t1); color: #FFF; }
.btn.pri:hover { background: #094E56; border-color: #094E56; }
.btn.sm { padding: 3px 8px; font-size: 11.5px; }
.btn.dgr { color: var(--danger); }
.btn:disabled { opacity: .45; cursor: default; }
.btn.on { background: var(--t1-bg); border-color: #9FBEC2; color: var(--t1); }

.inp { border: 1px solid var(--line); border-radius: 4px; padding: 6px 9px; background: #FFF; width: 100%; }
.inp:hover { border-color: #CBD3DB; }
select.inp { cursor: pointer; }
.fld { display: block; margin-bottom: 11px; }
.fld > span { display: block; font-family: 'Archivo'; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 600; margin-bottom: 4px; }

.chip { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--line); background: #FBFCFD; border-radius: 3px; padding: 2px 7px; font-size: 11.5px; color: var(--muted); }
.chip.act { cursor: pointer; }
.chip.act:hover { border-color: var(--t2); color: var(--t1); background: var(--t3-bg); }
.tag { display: inline-block; font-size: 10.5px; letter-spacing: .03em; padding: 1px 6px; border-radius: 3px; background: #F2F4F7; color: var(--muted); border: 1px solid var(--line-soft); }

.t-pill { display: inline-flex; align-items: center; gap: 5px; font-family: 'Archivo'; font-size: 10px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; padding: 2px 6px; border-radius: 3px; }
.t-pill.p1 { background: var(--t1-bg); color: var(--t1); }
.t-pill.p2 { background: var(--t2-bg); color: #3C7178; }
.t-pill.p3 { background: var(--t3-bg); color: #6C8286; }
.dot { width: 7px; height: 7px; border-radius: 1px; display: inline-block; }

table.tbl { width: 100%; border-collapse: separate; border-spacing: 0; }
.tbl th.stick { position: sticky; top: 0; background: var(--panel); z-index: 3; box-shadow: inset 0 -1px 0 var(--line); }
.tbl-scroll { max-height: 520px; overflow-y: auto; }
.tbl th.sortable { padding: 0; }
.tbl th.sortable .th-btn { display: flex; align-items: center; gap: 4px; width: 100%; padding: 8px 12px;
  background: none; border: 0; font: inherit; color: inherit; letter-spacing: inherit; text-transform: inherit; text-align: left; }
.tbl th.sortable.num .th-btn { justify-content: flex-end; }
.tbl th.sortable .th-btn:hover { color: var(--muted); background: #F7F9FA; }
.tbl th.sortable .th-btn .ind { font-size: 10px; line-height: 1; opacity: 0; transition: opacity .12s ease; }
.tbl th.sortable .th-btn:hover .ind { opacity: .4; }
.tbl th.sortable .th-btn.on { color: var(--t1); }
.tbl th.sortable .th-btn.on .ind { opacity: 1; }
.tbl th { border-bottom: 1px solid var(--line); font-family: 'Archivo'; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--faint); font-weight: 600; text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.tbl td { padding: 9px 12px; border-bottom: 1px solid var(--line-soft); vertical-align: middle; }
.tbl tr:last-child td { border-bottom: 0; }
.tbl tbody tr:hover { background: #FAFBFC; }
.tbl .num { text-align: right; }
.tbl .ctr { text-align: center; }
.tbl th.sortable.ctr .th-btn { justify-content: center; }
/* Seven columns: the numeric ones stay compact so the collector identity keeps
   the room it needs to be scanned, and nothing has to scroll sideways. */
/* Percentages rather than one auto column: with table-layout: fixed and width 100%,
   an auto column absorbs every spare pixel, which is what opened the gap between
   Collector and Member Since. These sum to 100, so the slack is shared deliberately. */
.net-tbl { table-layout: fixed; }
.net-tbl col.c-name { width: 23.5%; }
.net-tbl col.c-since { width: 13%; }
.net-tbl col.c-new { width: 9.5%; }
.net-tbl col.c-tot { width: 10%; }
.net-tbl col.c-open { width: 11.5%; }
.net-tbl col.c-deals { width: 13.5%; }
.net-tbl col.c-val { width: 10%; }
.net-tbl col.c-cov { width: 9%; }
/* Seven headers on one line: the gutters give back what the extra column took,
   without touching the shared header type scale. */
.net-tbl th.sortable .th-btn { padding-left: 8px; padding-right: 8px; }
.net-tbl td { padding-left: 8px; padding-right: 8px; }
.net-new { color: var(--t1); }
.link { color: var(--t1); background: none; border: 0; padding: 0; font-weight: 500; text-decoration: underline; text-decoration-color: #B9D0D3; text-underline-offset: 2px; }
.link:hover { text-decoration-color: var(--t1); }
.muted { color: var(--muted); }
.faint { color: var(--faint); }

.av { width: 26px; height: 26px; border-radius: 3px; background: var(--t1-bg); color: var(--t1); font-family: 'Archivo'; font-weight: 600; font-size: 10.5px; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 26px; letter-spacing: .02em; }
.av.lg { width: 44px; height: 44px; font-size: 15px; flex-basis: 44px; border-radius: 4px; }

/* ---- opportunities lifecycle ---- */
/* ONE geometry system. Every row is the same five-column grid, so the node, label,
   count, responsibility and chevron each sit on a single vertical axis by
   construction — no absolute offsets to drift out of sync.

   The node is a grid item in column 1, never absolutely positioned. An earlier
   version placed it with "position: absolute; left: 42px", which the .lc-row > *
   rule below silently overrode to "position: relative" (higher specificity),
   dropping the node into flex flow beside the label and off the spine.

   Column 1 is also where the spine runs, so node and spine share one centre line. */
.lc {
  /* Horizontal zones. Gaps are carried as padding on each item rather than one
     uniform column-gap, so node-to-label can stay tight (23px) while the data
     columns get real air. The map has NO max-width: it fills the card, and the
     flexible name column absorbs whatever width the page gives it. */
  --lc-pad: 32px;          /* card inset */
  --lc-col: 12px;          /* node column */
  --lc-gap: 22px;          /* node -> label only */
  --lc-data-gap: 40px;     /* between the data columns */
  --lc-axis: calc(var(--lc-pad) + var(--lc-col) / 2);          /* spine + node centre */
  --lc-label: calc(var(--lc-pad) + var(--lc-col) + var(--lc-gap));
  position: relative;
}
.lc-card { border-radius: 10px; border: 1px solid #E7EAEE;
  padding: 14px 0 10px; box-shadow: 0 1px 2px rgba(19,25,34,.04); }

/* --- spine: drawn per row and per heading, so segments abut into one line --- */
.lc-row::before, .lc-head::before {
  content: ''; position: absolute; left: calc(var(--lc-axis) - 0.5px);
  top: 0; bottom: 0; width: 1px; background: var(--line);
}
.lc-first::before { top: 50%; }      /* begins at the first node, nothing above it */
.lc-last::before { bottom: 50%; }    /* terminates at the last */

/* --- region heading: a caption on the label axis, never a node on the spine --- */
.lc-head { position: relative; padding: 16px 0 6px var(--lc-label); }
.lc-region:first-child .lc-head { padding-top: 2px; }
.lc-head-t { font-family: 'Archivo'; font-size: 9.5px; letter-spacing: .12em;
  text-transform: uppercase; font-weight: 600; color: var(--faint); }
.r-deal .lc-head-t { color: var(--t1); }

/* Intent becoming active coordination: a touch more room, a teal segment, and a
   4px caret on the spine. Felt, not announced. */
.r-deal .lc-head { padding-top: 22px; }
.r-deal .lc-head::before { background: var(--t2); }
.lc-cue { position: absolute; left: var(--lc-axis); top: 9px; transform: translateX(-50%) rotate(45deg);
  width: 5px; height: 5px; border-right: 1px solid var(--t2); border-bottom: 1px solid var(--t2); }

/* --- stage row --- */
.lc-row { position: relative; display: grid; align-items: center;
  /* node | flexible name | count | ownership | chevron — each data column carries
     its own left padding, so column-gap stays 0 and every axis is explicit */
  grid-template-columns:
    var(--lc-col)
    minmax(180px, 1fr)
    calc(var(--lc-data-gap) + 64px)
    calc(var(--lc-data-gap) + 176px)
    calc(var(--lc-data-gap) + 16px);
  column-gap: 0; padding: 0 var(--lc-pad); min-height: 46px;
  transition: background .12s ease; }
/* Nearly invisible, and starting at the label axis so it never crosses the spine. */
.lc-row::after { content: ''; position: absolute; left: var(--lc-label); right: var(--lc-pad);
  bottom: 0; height: 1px; background: #F1F3F6; }
.lc-last::after { display: none; }
.r-intent .lc-row { min-height: 50px; }        /* intent breathes slightly more */
.lc-hit { position: absolute; inset: 0; background: none; border: 0; padding: 0; cursor: pointer; }
/* Grid items paint above the overlay and pass clicks through to it. Deliberately
   sets no position property, so nothing here can override node layout again. */
.lc-row > *:not(.lc-hit) { z-index: 1; pointer-events: none; }
.lc-row > .lc-own { pointer-events: auto; }
.lc-row:hover { background: #F8FAFA; }
.lc-row.on { background: #EEF5F5; }

/* --- nodes: lifecycle position only, never sized or coloured by count or owner --- */
.lc-node { justify-self: center; box-sizing: border-box; border-radius: 50%;
  width: 9px; height: 9px; background: var(--panel); border: 1.25px solid #9FCFD1;
  transition: border-color .12s ease, background .12s ease; }
.n-primary .lc-node { width: 10px; height: 10px; border-width: 1.5px; border-color: var(--t1); }
.r-deal .lc-node { width: 9px; height: 9px; border: 0; background: var(--t1); }
.n-completed .lc-node, .n-archived .lc-node { width: 9px; height: 9px; border: 0; background: #B3B8BF; }
.lc-row:hover .lc-node { border-color: var(--t1); }
.lc-row.on .lc-node { border-color: var(--t1); box-shadow: 0 0 0 3px var(--t1-bg); }
.n-completed.on .lc-node, .n-archived.on .lc-node { background: var(--muted); box-shadow: 0 0 0 3px #ECEEF1; }

/* --- row content --- */
.lc-name { padding-left: var(--lc-gap); font-size: 13.5px; color: var(--text); }
/* Establishes sequence without competing with the stage name. */
.lc-no { color: var(--faint); font-size: 11px; margin-right: 8px; font-weight: 500; }
/* Table stage cell: scannable vertically, same row height as before. */
.stage-c { font-size: 12px; white-space: nowrap; }
.stage-n { color: var(--faint); font-size: 11px; margin-right: 6px; }
.lc-row.on .lc-no { color: var(--t2); }
.lc-row.on .lc-name { font-weight: 600; color: var(--t1); }
.lc-cnt { padding-left: var(--lc-data-gap); font-size: 13.5px; font-weight: 600;
  text-align: right; color: var(--text); font-variant-numeric: tabular-nums; }
.lc-row.on .lc-cnt { color: var(--t1); }
.lc-own { padding-left: var(--lc-data-gap); display: flex; gap: 36px; justify-content: flex-end; }
.lc-chev { padding-left: var(--lc-data-gap); display: flex; justify-content: flex-end;
  color: #D2D7DE; transition: color .12s ease; }
.lc-row:hover .lc-chev, .lc-row.on .lc-chev { color: var(--t2); }

/* History reads as resolved, not as a sixth active stage. */
.r-closed .lc-name, .r-closed .lc-cnt { color: var(--muted); }
.r-closed .lc-row.on .lc-name, .r-closed .lc-row.on .lc-cnt { color: var(--t1); }

/* Compact filter controls. TP is the user's own work so it carries a little more
   weight — never alert styling. */
.lc-pill { width: 70px; height: 22px; padding: 0; border: 1px solid var(--line);
  background: var(--panel); border-radius: 4px; font-size: 10.5px; color: var(--muted);
  display: inline-flex; align-items: center; justify-content: center; gap: 3px;
  white-space: nowrap; font-variant-numeric: tabular-nums;
  transition: border-color .12s ease, background .12s ease, color .12s ease; }
.lc-pill b { font-weight: 600; color: var(--text); }
.lc-pill.tp { border-color: #CCE0E2; color: var(--t1); }
.lc-pill.tp b { color: var(--t1); }
.lc-pill:hover { border-color: var(--t2); color: var(--t1); }
.lc-pill.on { background: var(--t1-bg); border-color: var(--t1); color: var(--t1); }
.lc-pill.on b { color: var(--t1); }
.lc-pill.mute { width: 44px; background: none; border-color: var(--line-soft); color: var(--faint); cursor: default; }
.lc-pill.mute b { color: var(--faint); font-weight: 400; }

/* Narrow: only the responsibility column gives way. The node column, its gap and
   the label axis are fixed, so the node can never leave its label. */
@media (max-width: 1100px) { .lc { --lc-data-gap: 24px; } .lc-own { gap: 20px; } }
@media (max-width: 900px) {
  .lc { --lc-pad: 20px; --lc-gap: 16px; --lc-data-gap: 16px; }
  .lc-own { gap: 10px; }
  .lc-pill { width: 58px; }
  .lc-row { grid-template-columns:
    var(--lc-col) minmax(120px, 1fr) calc(var(--lc-data-gap) + 40px)
    calc(var(--lc-data-gap) + 126px) calc(var(--lc-data-gap) + 16px); }
}

/* Next Step: workflow information, deliberately not an alert. Both values carry
   the same weight; only the hue distinguishes them. */
.nstep { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text); white-space: nowrap; }
.nstep .dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 6px; }
.nstep.tp .dot { background: var(--t1); }
.nstep.collector .dot { background: var(--t3); }

/* ---- network intelligence ---- */
/* Hierarchy carries the argument: one headline number, four supporting splits,
   then diagnosis, then recommendation. No gradients, badges or scores. */
.ni-cov { display: inline-flex; align-items: center; gap: 8px; justify-content: flex-end; }
.ni-cov-bar { width: 54px; height: 4px; background: #EAEEF1; border-radius: 2px; overflow: hidden; }
.ni-cov-bar i { display: block; height: 100%; background: var(--amber); }
.ni-note { display: flex; gap: 12px; align-items: baseline; padding: 9px 14px; border-top: 1px solid var(--line-soft);
  font-size: 11px; color: var(--faint); line-height: 1.5; }
.ni-note .link { margin-left: auto; white-space: nowrap; font-size: 11.5px; }
.ni-strength { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 9px 14px;
  border-top: 1px solid var(--line-soft); font-size: 11.5px; }

.ni-rec { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-bottom: 1px solid var(--line-soft); }
.ni-rec:last-of-type { border-bottom: 0; }
.ni-rec:hover { background: #FAFBFC; }
.ni-rank { width: 18px; flex: 0 0 18px; font-size: 12px; color: var(--faint); padding-top: 2px; }
.ni-rec-main { flex: 1; min-width: 0; }
.ni-rec-t { font-size: 13px; font-weight: 500; }
.ni-why { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 4px; font-size: 11.5px; color: var(--muted); }
.ni-why b { color: var(--text); font-weight: 600; }
.ni-none { color: var(--amber); }
.ni-who { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.ni-rec-act { display: flex; gap: 6px; flex: 0 0 auto; }
@media (max-width: 1100px) { .ni-head { grid-template-columns: 1fr; gap: 18px; } }

/* ---- inventory coverage ---- */
/* Progressive disclosure borrowed from Opportunities: the collapsed row carries the
   headline, expanding explains it. Scanability over visualisation — no charts. */
.cov-top { padding: 18px 22px; }
.cov-lead { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
.cov-big { font-size: 40px; font-weight: 500; letter-spacing: -0.03em; color: var(--t1); line-height: 1; }
.cov-lead-t { font-size: 13.5px; max-width: 460px; line-height: 1.45; }
.cov-lead-note { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line-soft);
  font-size: 12px; color: var(--muted); }

.cov-layer { border-bottom: 1px solid var(--line-soft); }
.cov-layer:last-of-type { border-bottom: 0; }
.cov-layer.zero { opacity: .6; }
.cov-row { display: flex; align-items: center; gap: 14px; width: 100%; background: none; border: 0;
  padding: 13px 16px; text-align: left; cursor: pointer; transition: background .12s ease; }
.cov-row:hover { background: #F8FAFA; }
.cov-layer.on .cov-row { background: #EEF5F5; }
.cov-chev { color: var(--line); flex: 0 0 12px; transition: transform .14s ease, color .12s ease; }
.cov-row:hover .cov-chev { color: var(--t2); }
.cov-layer.on .cov-chev { transform: rotate(90deg); color: var(--t1); }
.cov-name { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 500; }
.cov-q { display: block; font-size: 11.5px; font-weight: 400; color: var(--faint); margin-top: 1px; }
.cov-count { font-size: 20px; font-weight: 500; width: 42px; text-align: right; }
.cov-share { font-size: 12px; color: var(--muted); width: 42px; text-align: right; }
.cov-ctx { width: 260px; flex: 0 0 260px; font-size: 11.5px; color: var(--muted); text-align: right; }
.cov-body { padding: 0 16px 14px 42px; }
.inv-sub { font-size: 12px; color: var(--muted); margin-top: 7px; }
.cult-intro { font-size: 12.5px; color: var(--muted); margin-bottom: 12px; }
/* Your Network: a quick buying reference. Two columns on desktop, one on a phone;
   every count is printed beside its bar so nothing depends on hover. */
.nw { margin-bottom: 4px; }
.nw-grid { display: grid; grid-template-columns: 1fr 1fr; }
.nw-cell { padding: 14px 16px; border-right: 1px solid var(--line-soft); border-bottom: 1px solid var(--line-soft); }
.nw-cell:nth-child(2n) { border-right: 0; }
.nw-cell:nth-last-child(-n+2) { border-bottom: 0; }
.nw-t { font-size: 12.5px; font-weight: 600; }
.nw-s { font-size: 11px; color: var(--faint); margin: 1px 0 10px; }
.dq-entry { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left;
  background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 13px 16px;
  margin-bottom: 14px; cursor: pointer; transition: border-color .12s ease, background .12s ease; }
.dq-entry:hover { border-color: var(--t2); background: #FAFCFC; }
.dq-entry.on { border-color: var(--t1); background: var(--t1-bg); }
.dq-n { font-size: 26px; font-weight: 600; color: var(--t1); line-height: 1; min-width: 34px; }
.dq-l { flex: 1; min-width: 0; }
.dq-l b { font-size: 13.5px; display: block; }
.dq-sub { font-size: 11.5px; color: var(--muted); }
.dq-go { color: var(--line); }
.dq-entry:hover .dq-go, .dq-entry.on .dq-go { color: var(--t1); }
.dq-act { font-size: 10.5px; color: var(--faint); margin-top: 2px; }
/* Collector profile: sections separated by whitespace and a heading, not by nested
   bordered panels. Hierarchy does the work that borders used to. */
.cp-head { display: flex; gap: 16px; align-items: flex-start; padding: 4px 2px 20px; }
.cp-life { display: flex; flex-wrap: wrap; gap: 28px; margin-top: 14px; padding: 12px 0;
  border-top: 1px solid var(--line-soft); border-bottom: 1px solid var(--line-soft); }
.cp-life-l { font-family: 'Archivo'; font-size: 9.5px; letter-spacing: .09em; text-transform: uppercase;
  font-weight: 600; color: var(--faint); }
.cp-life-v { font-size: 15px; font-weight: 500; margin-top: 3px; }
.cp-life-s { font-size: 11px; color: var(--muted); margin-top: 1px; }
.cp-note { font-size: 13px; color: var(--text); margin-top: 10px; max-width: 620px; line-height: 1.5;
  border-left: 2px solid var(--line); padding-left: 11px; }
.cp-prefs { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 11px; }
.cp-sec { margin-bottom: 26px; }
.cp-sec-h { font-family: 'Archivo'; font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
  font-weight: 600; color: var(--muted); padding-bottom: 9px; display: flex; align-items: center; gap: 8px; }
.cp-sec-h .mono { color: var(--faint); letter-spacing: 0; }
.cp-sec-h.as-btn { background: none; border: 0; cursor: pointer; width: 100%; text-align: left; font-family: 'Archivo'; }
.cp-sec-h.as-btn:hover { color: var(--text); }
.cp-chev { color: var(--line); display: inline-flex; transition: transform .14s ease; }
.cp-sec-h[aria-expanded="true"] .cp-chev { transform: rotate(90deg); color: var(--t1); }
.cp-empty { font-size: 12.5px; color: var(--faint); padding: 4px 2px; }

/* A goal states intent; inventory availability sits on it rather than in a table. */
.gc { display: flex; gap: 16px; align-items: flex-start; padding: 16px 2px;
  border-top: 1px solid var(--line-soft); }
.gc:first-of-type { border-top: 0; }
.gc.sec { padding: 12px 2px; gap: 13px; }
.gc-main { flex: 1; min-width: 0; }
.gc-name { font-size: 14px; font-weight: 600; }
.gc.sec .gc-name { font-size: 13px; font-weight: 500; }
.gc-id { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.gc-note { font-size: 12px; color: var(--text); margin-top: 6px; font-style: italic; }
.gc-meta { display: flex; align-items: center; gap: 12px; margin-top: 7px; font-size: 11px; color: var(--faint); }
.gc-have { background: none; border: 0; padding: 0; cursor: pointer; font-size: 11px;
  font-weight: 600; color: var(--t1); text-decoration: underline; text-decoration-color: var(--line); }
.gc-have:hover { text-decoration-color: var(--t1); }
.gc-act { flex: 0 0 auto; }

.cp-opp { display: flex; gap: 12px; align-items: center; padding: 11px 2px; border-top: 1px solid var(--line-soft); }
.cp-opp:first-of-type { border-top: 0; }
.cp-opp-main { flex: 1; min-width: 0; }
.cp-opp-t { font-size: 13px; font-weight: 500; }
.cp-opp-s { font-size: 11.5px; color: var(--muted); margin-top: 2px; }

/* ---- trade binder: browsing the collector's cards, artwork first ----
   A binder page, not a list of records. The tile is sized off the card image so
   rows reflow by count as the profile narrows, and nothing scrolls sideways. */
.cp-bind-open { margin-left: auto; font-family: 'Public Sans'; font-size: 11.5px; font-weight: 400;
  letter-spacing: 0; text-transform: none; color: var(--faint); }
.cp-bind-search { position: relative; width: 240px; max-width: 100%; margin: 0 0 12px; }
.cp-bind-search .ic { position: absolute; left: 8px; top: 7px; color: var(--faint); pointer-events: none; }
.cp-bind-search .inp { padding-left: 27px; }
.cp-bind-grid { display: grid; gap: 12px 10px; grid-template-columns: repeat(auto-fill, minmax(146px, 1fr)); padding-top: 2px; }
.cp-bind { display: flex; flex-direction: column; min-width: 0; padding: 8px;
  border: 1px solid var(--line-soft); border-radius: 4px; background: var(--panel); }
.cp-bind.on { border-color: #BCD3D6; }
.cp-bind-art { display: flex; justify-content: center; }
.cp-bind-t { font-size: 12.5px; font-weight: 500; line-height: 1.25; margin-top: 8px; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cp-bind-id { font-size: 11px; color: var(--muted); margin-top: 2px; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
/* The variant line can run long on a fully specified copy; two lines is the ceiling
   and the title attribute carries the rest, so tiles stay a browsable height. */
.cp-bind-g { font-size: 10.5px; color: var(--faint); margin-top: 1px; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cp-bind-v { font-size: 11px; color: var(--muted); margin-top: 4px; }
.cp-bind-x { margin-top: auto; padding: 3px 6px; font-size: 11px; width: 100%;
  justify-content: center; margin-top: 8px; }
.cp-bind-x .mk { width: 8px; height: 8px; border-radius: 1px; border: 1px solid var(--line); background: #FFF; display: inline-block; flex: 0 0 8px; }
.cp-bind-x.on .mk { background: var(--t1); border-color: var(--t1); }
.cp-bind-more { margin-top: 12px; }
.cp-hist-sum { font-size: 12.5px; color: var(--text); padding: 0 2px 2px; }
.cp-acts { margin-top: 12px; border-top: 1px solid var(--line-soft); }
.cp-act { display: flex; gap: 14px; padding: 8px 2px; border-bottom: 1px solid var(--line-soft); font-size: 12px; }
.cp-act:last-child { border-bottom: 0; }
.cp-act-d { flex: 0 0 92px; color: var(--faint); font-size: 11px; }
.nw-bars { display: flex; flex-direction: column; gap: 6px; }
.nw-bar { display: grid; grid-template-columns: minmax(0,1fr) 64px 26px 54px; align-items: center; gap: 8px; }
.nw-lbl { font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nw-track { height: 6px; background: #EEF1F4; border-radius: 3px; overflow: hidden; }
.nw-track i { display: block; height: 100%; background: var(--t2); border-radius: 3px; }
.nw-n { font-size: 12px; font-weight: 600; text-align: right; }
.nw-u { font-size: 10.5px; color: var(--faint); }
.nw-empty { font-size: 11.5px; color: var(--faint); padding: 6px 0; }
.nw-foot { padding: 10px 16px; border-top: 1px solid var(--line-soft); background: #FCFDFD;
  font-size: 11px; color: var(--faint); line-height: 1.5; }
@media (max-width: 820px) {
  .nw-grid { grid-template-columns: 1fr; }
  .nw-cell { border-right: 0; }
  .nw-cell:nth-last-child(-n+2) { border-bottom: 1px solid var(--line-soft); }
  .nw-cell:last-child { border-bottom: 0; }
  .nw-bar { grid-template-columns: minmax(0,1fr) 48px 24px 48px; }
}
.cv-row { display: flex; gap: 12px; align-items: flex-start; padding: 13px 16px; border-bottom: 1px solid var(--line-soft); }
.cv-row:last-of-type { border-bottom: 0; }
.cv-row:hover { background: #FAFBFC; }
.cv-rank { width: 18px; flex: 0 0 18px; font-size: 12px; color: var(--faint); padding-top: 2px; }
.cv-main { flex: 1; min-width: 0; }
.cv-t { font-size: 13.5px; font-weight: 500; }
.cv-why { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 4px; font-size: 11.5px; color: var(--muted); }
.cv-why b { color: var(--text); font-weight: 600; }
.cv-who { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.cv-add { flex: 0 0 auto; }
.cv-foot { padding: 10px 16px; border-top: 1px solid var(--line-soft); font-size: 11.5px; }
.cv-why-t { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: 0;
  padding: 12px 16px; font-size: 12.5px; font-weight: 500; color: var(--muted); cursor: pointer; text-align: left; }
.cv-why-t:hover { color: var(--text); background: #FAFBFC; }
.cv-chev { color: var(--line); transition: transform .14s ease; }
.cv-why-t[aria-expanded="true"] .cv-chev { transform: rotate(90deg); color: var(--t1); }
.cv-why-body { padding: 0 16px 14px; border-top: 1px solid var(--line-soft); }
.cv-basis { font-size: 11px; color: var(--faint); line-height: 1.5; margin-top: 12px; }
.ac-id { border: 1px solid var(--line); background: #FAFBFC; border-radius: 4px; padding: 11px; margin-bottom: 14px; }
.ac-id-head { display: flex; align-items: baseline; justify-content: space-between; }
/* Initial search state: the field is the interaction, so it gets the room. */
.ai-search-state { padding: 10px 4px 0; }
.ai-field { position: relative; display: flex; align-items: center; }
.ai-field-i { position: absolute; left: 14px; color: var(--faint); display: flex; pointer-events: none; }
.ai-input { width: 100%; font: inherit; font-size: 14px; padding: 14px 14px 14px 42px;
  border: 1px solid var(--line); border-radius: 7px; background: #FFF; color: var(--text);
  transition: border-color .12s ease, box-shadow .12s ease; }
.ai-input::placeholder { color: var(--faint); }
.ai-input:focus { outline: none; border-color: var(--t1); box-shadow: 0 0 0 3px var(--t1-bg); }
.ai-field:focus-within .ai-field-i { color: var(--t1); }
/* Whitespace before a query, rather than an empty box. */
.ai-search-state.quiet { min-height: 236px; }
.ai-none { padding: 40px 0 48px; text-align: center; }
.ai-none-t { font-size: 13.5px; font-weight: 500; }
.ai-none-s { font-size: 12px; color: var(--faint); margin-top: 3px; }
.ai-results { margin-top: 14px; border: 1px solid var(--line); border-radius: 6px; max-height: 420px; overflow-y: auto; }
.ai-row { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; background: none;
  border: 0; border-bottom: 1px solid var(--line-soft); padding: 11px 12px; cursor: pointer; }
.ai-row:last-child { border-bottom: 0; }
.ai-row:hover { background: var(--t1-bg); }
.ai-main { flex: 1; min-width: 0; }
.ai-name { display: block; font-size: 13px; font-weight: 500; }
.ai-sub { display: block; font-size: 10.5px; color: var(--muted); margin-top: 1px; }
.gradepick { display: flex; flex-wrap: wrap; gap: 4px; }
.gradepick .seg-b { flex: 0 0 auto; min-width: 34px; border: 1px solid var(--line); border-radius: 4px; padding: 7px 9px; }
.gradepick .seg-b.wide { min-width: 54px; }
.fld-sub span { color: var(--faint); }
.req { color: var(--amber); font-weight: 700; }
.opt { color: var(--faint); font-weight: 400; text-transform: none; letter-spacing: 0; font-size: 10px; }
.seg { display: flex; gap: 0; border: 1px solid var(--line); border-radius: 5px; overflow: hidden; }
.seg-b { flex: 1; background: none; border: 0; border-right: 1px solid var(--line); padding: 8px 10px;
  font-size: 12px; cursor: pointer; color: var(--muted); }
.seg-b:last-child { border-right: 0; }
.seg-b:hover { background: #F7F9FA; }
.seg-b.on { background: var(--t1); color: #fff; font-weight: 500; }
.ai-var { display: block; font-size: 10px; color: var(--faint); margin-top: 1px; }
.ai-held-note { font-size: 11.5px; color: var(--muted); margin: -6px 0 12px; }
.ai-hint { padding: 14px 12px; font-size: 12px; color: var(--faint); text-align: center; }
.ac-id-t { font-size: 14px; font-weight: 600; margin-top: 3px; }
.ac-id-s { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.cov-aside { font-size: 11px; color: var(--faint); padding: 8px 0 0; }
.cov-who { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.cov-foot { padding: 10px 16px; border-top: 1px solid var(--line-soft); background: #FCFDFD;
  font-size: 11.5px; color: var(--muted); }
@media (max-width: 1100px) { .cov-ctx { display: none; } }

/* ---- Inventory > Current row ---- */
/* The card is the object on the shelf; the row's information sits beside it.
   The art column is fixed so every row aligns, and the body flexes. */
.inv-row { display: flex; align-items: stretch; overflow: hidden; }
.inv-art { flex: 0 0 auto; padding: 14px 0 14px 14px; display: flex; align-items: flex-start; }
.inv-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
/* the demand region fills whatever height the artwork leaves */
.inv-body > div:last-child { flex: 1; }
@media (max-width: 860px) {
  /* stack rather than squeeze the information into a sliver beside the card */
  .inv-row { flex-direction: column; }
  .inv-art { padding: 14px 14px 0; }
}

/* Reach out: the collector names are the interface. Primary intent reads slightly
   stronger than secondary — a weight and border difference, no badges or counts. */
.ro-h { font-family: 'Archivo'; font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase;
  font-weight: 600; color: var(--faint); margin-bottom: 7px; }
.ro-group { margin-bottom: 9px; }
.ro-group:last-of-type { margin-bottom: 0; }
/* Quieter than REACH OUT itself — a group label, not a competing heading. */
.ro-tier { font-size: 10.5px; color: var(--faint); margin-bottom: 5px; letter-spacing: .02em; }
.ro-list { display: flex; flex-wrap: wrap; gap: 5px; }
/* One treatment for every collector. The group label carries the intent, so nothing
   here depends on colour — primary differs only by text weight and a slightly
   firmer border, and reads as emphasis rather than as a success state. */
.ro-name { background: none; border: 1px solid var(--line); border-radius: 4px; padding: 4px 9px;
  font-size: 12px; color: var(--text); cursor: pointer; transition: border-color .12s ease, color .12s ease; }
.ro-name:hover { border-color: var(--t1); color: var(--t1); }
.ro-name.p1 { border-color: var(--muted); font-weight: 600; }
.ro-why { display: inline-block; margin-top: 8px; font-size: 11.5px; color: var(--faint); }
.ro-why:hover { color: var(--t1); }

/* ---- stock card imagery ---- */
/* Dimensions reserved by the component, so these only carry appearance. */
.cimg { border-radius: 3px; object-fit: cover; background: #EEF1F4; flex: 0 0 auto;
  border: 1px solid var(--line-soft); display: inline-block; vertical-align: middle; }
.cimg.empty { background: repeating-linear-gradient(135deg, #F2F4F7 0 4px, #EDF0F4 4px 8px);
  border-style: dashed; border-color: var(--line); }
.ws-stock { flex: 0 0 auto; margin-right: 16px; padding-right: 16px; border-right: 1px solid var(--line-soft); }
.vt-stock { flex: 0 0 auto; margin-right: 16px; padding-right: 16px; border-right: 1px solid var(--line-soft); }
.cimg-row { display: flex; align-items: center; gap: 11px; min-width: 0; }
/* A browse-size image is taller than a line of text, so those rows align to the top
   and get room rather than centring a 75px card against 12px type. */
.tbl td .cimg-row { align-items: flex-start; }
.tbl td .cimg-row > span, .tbl td .cimg-row > div { padding-top: 2px; }
.cimg-cap { display: block; text-align: center; margin-top: 4px; font-family: 'Archivo';
  font-size: 8.5px; letter-spacing: .07em; text-transform: uppercase; font-weight: 600;
  color: var(--faint); white-space: nowrap; }

/* Focused card blocks stack rather than clip when the viewport is narrow. */
@media (max-width: 720px) {
  .ws-stock, .vt-stock { margin-right: 0; padding-right: 0; border-right: 0;
    margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--line-soft); }
  .ws-top, .vt-evidence { flex-direction: column; }
}

/* ---- misc ---- */
.tabs { display: flex; gap: 2px; }
.tab { border: 0; background: none; padding: 6px 12px; border-radius: 4px; font-size: 12.5px; color: var(--muted); font-weight: 500; }
.tab:hover { background: #EEF1F4; color: var(--text); }
.tab.on { background: #E4EAEC; color: var(--t1); font-weight: 600; }


.notice { display: flex; align-items: center; gap: 9px; background: var(--t1-bg); border: 1px solid #BFD5D8; border-radius: 4px; padding: 7px 12px; margin-bottom: 14px; font-size: 12.5px; color: #094E56; }

.ovl { position: fixed; inset: 0; background: rgba(15,19,27,.42); display: flex; z-index: 50; }
.drawer { margin-left: auto; width: 520px; max-width: 92vw; background: #FFF; height: 100%; overflow-y: auto; border-left: 1px solid var(--line); box-shadow: -8px 0 24px rgba(15,19,27,.12); }
.modal { margin: auto; width: 480px; max-width: 92vw; max-height: 88vh; overflow-y: auto; background: #FFF; border-radius: 6px; box-shadow: 0 12px 40px rgba(15,19,27,.28); }
.mh { display: flex; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: #FFF; z-index: 2; }
.mh h3 { font-family: 'Archivo'; font-size: 14.5px; font-weight: 600; margin: 0; }
.mh .x { margin-left: auto; border: 0; background: none; color: var(--faint); font-size: 17px; line-height: 1; padding: 2px 4px; border-radius: 3px; }
.mh .x:hover { background: #F0F3F5; color: var(--text); }
.mb { padding: 18px; }
.mf { padding: 13px 18px; border-top: 1px solid var(--line); display: flex; gap: 8px; justify-content: flex-end; background: #FBFCFD; position: sticky; bottom: 0; }


/* ---- conversation workspace ---- */
.ws { margin: auto; width: 96vw; max-width: 1480px; height: 92vh; background: var(--panel);
  border-radius: 6px; box-shadow: 0 16px 50px rgba(15,19,27,.32); display: flex; flex-direction: column; overflow: hidden; }
.ws-head { display: flex; align-items: center; gap: 10px; padding: 11px 16px; border-bottom: 1px solid var(--line); flex: 0 0 auto; }
.ws-head .x { border: 0; background: none; color: var(--faint); padding: 3px 5px; border-radius: 3px; }
.ws-head .x:hover { background: #F0F3F5; color: var(--text); }

.ws-top { display: flex; gap: 16px; align-items: flex-start; padding: 16px; border-bottom: 1px solid var(--line); flex-wrap: wrap;
  background: #FAFBFC; flex: 0 0 auto; }
.ws-photos { display: flex; gap: 6px; flex: 0 0 auto; }
.ws-photo { width: 46px; height: 64px; border: 1px solid var(--line); border-radius: 3px; background: #FFF;
  display: flex; align-items: center; justify-content: center; text-align: center; font-size: 8.5px; color: var(--faint);
  padding: 3px; line-height: 1.25; overflow: hidden; }
.ws-photo.req { border-style: dashed; border-color: var(--amber-line); background: var(--amber-bg); color: var(--amber); }
.ws-photo img { width: 100%; height: 100%; object-fit: cover; }
.ws-ident { display: flex; flex-wrap: wrap; gap: 4px 8px; margin-top: 4px; font-size: 11.5px; color: var(--muted); }
.ws-ident span { position: relative; }
.ws-ident span + span::before { content: '·'; position: absolute; left: -6px; color: var(--line); }
.ws-invbox { flex: 0 0 auto; text-align: right; min-width: 170px; }
.ws-inv-status { font-family: 'Archivo'; font-size: 10px; letter-spacing: .07em; text-transform: uppercase; font-weight: 600; }
.ws-inv-status.ok { color: var(--t1); }
.ws-inv-status.un { color: var(--amber); }

.ws-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 186px minmax(0,1fr) 336px; }
.ws-map { padding: 14px; border-right: 1px solid var(--line); overflow-y: auto; background: #FCFDFD; }
.ws-stage { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 12px; position: relative; }
.ws-dot { width: 8px; height: 8px; border-radius: 2px; flex: 0 0 8px; border: 1.5px solid var(--line); background: #FFF; }
.ws-stage.past .ws-dot { background: var(--t2); border-color: var(--t2); }
.ws-stage.past .ws-lbl { color: var(--muted); }
.ws-stage.now .ws-dot { background: var(--t1); border-color: var(--t1); box-shadow: 0 0 0 3px var(--t1-bg); }
.ws-stage.now .ws-lbl { color: var(--t1); font-weight: 600; }
.ws-stage.next .ws-lbl { color: var(--faint); }
.ws-stage.skip .ws-lbl { color: var(--faint); text-decoration: line-through; }
.ws-note { font-size: 9.5px; color: var(--faint); }

.ws-chat { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--line); }
.ws-chat-scroll { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.ws-msg { max-width: 74%; }
.ws-msg.mine { align-self: flex-end; }
.ws-msg-who { font-family: 'Archivo'; font-size: 9.5px; letter-spacing: .07em; text-transform: uppercase;
  font-weight: 600; color: var(--faint); margin-bottom: 3px; }
.ws-msg.mine .ws-msg-who { text-align: right; }
.ws-msg-body { border: 1px solid var(--line); border-radius: 4px; padding: 8px 11px; font-size: 12.5px; background: #FFF; }
.ws-msg.mine .ws-msg-body { background: var(--t1-bg); border-color: #C6DBDE; }
.ws-event { display: flex; align-items: center; gap: 9px; }
.ws-event-rule { flex: 1; height: 1px; background: var(--line-soft); }
.ws-event-txt { font-family: 'Archivo'; font-size: 10px; letter-spacing: .05em; text-transform: uppercase;
  font-weight: 600; color: var(--t1); background: var(--t3-bg); border: 1px solid #DCE7E8; border-radius: 3px; padding: 3px 9px; text-align: center; }
.ws-composer { flex: 0 0 auto; border-top: 1px solid var(--line); padding: 10px 14px; background: #FBFCFD; }

.ws-stagework { overflow-y: auto; padding: 14px; }
.ws-owner { border-radius: 4px; padding: 9px 11px; margin-bottom: 14px; border: 1px solid var(--line); background: #F7F9FA; }
.ws-owner.tp { background: var(--t1-bg); border-color: #BFD5D8; }
.ws-owner.collector { background: var(--amber-bg); border-color: var(--amber-line); }
.ws-owner-h { font-family: 'Archivo'; font-size: 10px; letter-spacing: .09em; text-transform: uppercase; font-weight: 600; }
.ws-owner.tp .ws-owner-h { color: var(--t1); }
.ws-owner.collector .ws-owner-h { color: var(--amber); }
.ws-owner.none .ws-owner-h { color: var(--faint); }
.ws-owner-b { font-size: 12.5px; margin-top: 2px; }

/* ---- value trade table ---- */
/* From Select Trade onward the structured workspace carries most of the work, so
   the grid flips: map stays compact, chat holds ~1/3, stage workspace takes ~2/3.
   Gated on min-width because the track minimums exceed the workspace below it. */
@media (min-width: 1181px) {
  .ws-body.txn { grid-template-columns: 160px minmax(300px,0.33fr) minmax(620px,0.67fr); }
}

@media (max-width: 1180px) {
  .ws-body, .ws-body.txn { grid-template-columns: minmax(0,1fr) 320px; }
  /* the workspace stays dominant once the map drops out of the row */
  .ws-body.txn { grid-template-columns: minmax(280px,0.8fr) minmax(460px,1.2fr); }
  .ws-map, .ws-body.txn .ws-map { grid-column: 1 / -1; border-right: 0; border-bottom: 1px solid var(--line);
    display: flex; gap: 14px; overflow-x: auto; padding: 9px 14px; }
  .ws-map .sect-t, .ws-map .faint { display: none; }
  .ws-stage { flex: 0 0 auto; }
}
.fx-methods { display: flex; gap: 7px; margin: 8px 0 12px; }
.fx-method { flex: 1; border: 1px solid var(--line); background: #FFF; border-radius: 4px; padding: 9px 11px;
  text-align: left; font-size: 12.5px; font-weight: 500; color: var(--muted); }
.fx-method:hover { border-color: #CBD3DB; color: var(--text); }
.fx-method.on { border-color: var(--t1); background: var(--t1-bg); color: var(--t1); box-shadow: inset 2px 0 0 var(--t1); }
.fx-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.fx-plan { border: 1px solid #BFD5D8; background: var(--t1-bg); border-radius: 4px; padding: 10px 12px; }
.fx-plan-t { font-size: 13px; font-weight: 600; color: #094E56; }
.fx-rev { border: 1px solid var(--amber-line); background: var(--amber-bg); border-radius: 4px;
  padding: 8px 11px; font-size: 12px; color: var(--amber); margin-bottom: 10px; }
.vt-wrap { display: flex; flex-direction: column; min-height: 0; }
.vt-head { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
.vt-progress { margin-left: auto; font-size: 11.5px; color: var(--muted); border: 1px solid var(--line);
  border-radius: 3px; padding: 4px 9px; background: #FBFCFD; white-space: nowrap; }
.vt-progress.done { color: var(--t1); border-color: #BFD5D8; background: var(--t1-bg); }
.vt-scroll { overflow: auto; border: 1px solid var(--line); border-radius: 4px; max-height: 60vh; }
table.tbl.vt th { padding: 7px 9px; font-size: 9px; }
table.tbl.vt td { padding: 7px 9px; font-size: 11.5px; }
.vt-row.gone td { opacity: .45; }
.vt-row.gone td:first-child { text-decoration: line-through; }
.vt-foot { font-size: 11.5px; padding: 9px 2px 0; }
.vt-exp { border: 1px solid var(--line); background: #FFF; width: 15px; height: 15px; border-radius: 2px;
  font-size: 11px; line-height: 1; color: var(--muted); margin-right: 6px; padding: 0; vertical-align: middle; }
.vt-exp:hover { border-color: var(--t2); color: var(--t1); }
.vt-agreed { background: #F4F8F8; font-weight: 600; }
/* Identity is permanently folded into the Card cell — the table is five columns,
   so the old 11-column width pressure cannot recur. */
.vt-identline { display: block; font-size: 10px; color: var(--faint); line-height: 1.35; margin-top: 2px; }
.vt-pos { display: inline-flex; flex-direction: column; align-items: flex-end; gap: 1px; font-size: 10.5px; color: var(--muted); }
.vt-pos b { font-weight: 600; color: var(--text); margin-left: 4px; }
.vt-out { font-weight: 600; color: var(--t1); }
.vt-live { background: #F7FAFA; box-shadow: inset 2px 0 0 var(--t2); }
.vt-hist { display: flex; justify-content: space-between; font-size: 11.5px; padding: 3px 0; border-bottom: 1px solid var(--line-soft); }
@media (max-width: 1180px) {
  table.tbl.vt th { font-size: 8.5px; padding: 6px 7px; }
  table.tbl.vt td { padding: 6px 7px; }
}
.vt-status { font-family: 'Archivo'; font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase;
  font-weight: 600; padding: 2px 6px; border-radius: 3px; white-space: nowrap; }
.vt-status.tp { background: var(--t1-bg); color: var(--t1); }
.vt-status.collector { background: var(--amber-bg); color: var(--amber); }
.vt-status.ok { background: #EAF2EC; color: #2F6B45; }
.vt-status.gone { background: #F2F4F7; color: var(--faint); text-decoration: line-through; }
.vt-act td { background: #FBFCFD; padding-top: 0; border-bottom: 2px solid var(--line-soft); }
.vt-actions { display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }
.vt-exp-row td { background: #FAFBFC; border-bottom: 2px solid var(--line-soft); }
.vt-evidence { display: flex; gap: 16px; padding: 6px 0 10px; flex-wrap: wrap; }
.vt-photos { display: flex; gap: 6px; flex: 0 0 auto; }
.vt-photo { width: 62px; height: 86px; border: 1px solid var(--line); border-radius: 3px; background: #FFF;
  display: flex; align-items: center; justify-content: center; text-align: center; font-size: 8.5px;
  color: var(--muted); white-space: pre-line; }
.vt-photo.missing { border-style: dashed; border-color: var(--amber-line); background: var(--amber-bg); color: var(--amber); }
.vt-partial { font-family: 'Public Sans'; font-size: 9.5px; color: var(--amber); font-weight: 500; letter-spacing: 0; }
table.tbl.vt tfoot td { border-top: 1px solid var(--line); background: #F7F9FA; font-weight: 500; }
.vt-foot { font-size: 11.5px; margin-top: 9px; line-height: 1.5; }

.toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #131922; color: #FFF; padding: 9px 16px; border-radius: 4px; font-size: 12.5px; z-index: 90; box-shadow: 0 6px 20px rgba(0,0,0,.28); }

.kv { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 0; border-bottom: 1px solid var(--line-soft); }
.kv:last-child { border-bottom: 0; }
.kv .k { color: var(--muted); font-size: 12.5px; }
.kv .v { font-family: 'IBM Plex Mono'; font-size: 13px; font-weight: 500; }


.stat { padding: 12px 14px; border-right: 1px solid var(--line-soft); }
.stat:last-child { border-right: 0; }
.stat .lb { font-family: 'Archivo'; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--faint); font-weight: 600; }
.stat .vl { font-family: 'IBM Plex Mono'; font-size: 22px; font-weight: 500; letter-spacing: -0.02em; margin-top: 3px; }
.stat .hint { font-size: 11.5px; color: var(--muted); margin-top: 2px; }

.tl { position: relative; padding-left: 18px; }
.tl::before { content: ''; position: absolute; left: 4px; top: 6px; bottom: 6px; width: 1px; background: var(--line); }
.tl-i { position: relative; padding: 7px 0; }
.tl-i::before { content: ''; position: absolute; left: -18px; top: 12px; width: 9px; height: 9px; border-radius: 2px; background: #FFF; border: 1.5px solid var(--t2); }
.tl-i.man::before { border-color: var(--faint); }
.tl-i .tt { font-size: 12.5px; }
.tl-i .td { font-size: 11px; color: var(--faint); font-family: 'IBM Plex Mono'; }

.empty { padding: 26px 14px; text-align: center; color: var(--muted); font-size: 12.5px; }
.hr { height: 1px; background: var(--line-soft); margin: 14px 0; }
/* ---- agree on price: one decision, read in dollars or in percent ---- */
.pn { padding: 2px 0 0; }
.pn-h { font-family: 'Archivo'; font-size: 10.5px; letter-spacing: .09em; text-transform: uppercase;
  color: var(--muted); font-weight: 600; margin-bottom: 3px; }
.pn-amt { font-size: 24px; font-weight: 600; line-height: 1.1; letter-spacing: -.01em; }
.pn-pct { font-size: 12px; color: var(--muted); margin-top: 2px; }
.pn-accept { width: 100%; justify-content: center; margin-top: 10px; }
/* a quiet rule, not a section break: accepting and countering are two answers to
   the same question and should read that way */
.pn-or { display: flex; align-items: center; gap: 8px; margin: 12px 0 9px; color: var(--faint); font-size: 11.5px; }
.pn-or::before, .pn-or::after { content: ""; flex: 1; height: 1px; background: var(--line-soft); }
.pn-in { display: flex; gap: 8px; }
.pn-f { flex: 1; min-width: 0; display: block; }
.pn-fl { display: block; font-size: 11px; color: var(--faint); margin-bottom: 3px; }
.pn-w { position: relative; display: block; }
.pn-u { position: absolute; top: 6px; left: 9px; color: var(--faint); font-size: 12.5px; pointer-events: none; }
.pn-u.r { left: auto; right: 9px; }
.pn-w .inp { padding-left: 20px; font-family: 'IBM Plex Mono'; font-size: 12.5px; }
.pn-w .inp.r { padding-left: 9px; padding-right: 20px; }
/* number inputs would add spinners; these are text fields, but guard anyway */
.pn-w .inp::-webkit-outer-spin-button, .pn-w .inp::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.pn-send { width: 100%; justify-content: center; margin-top: 9px; }
.pn-wait { font-size: 12.5px; color: var(--faint); margin-top: 10px; }
.sect-t { font-family: 'Archivo'; font-size: 10.5px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); font-weight: 600; margin: 0 0 8px; }
@media (prefers-reduced-motion: reduce) { .my-root * { transition: none !important; } }
`;

/* ------------------------------- ICONS -------------------------------- */
const Icon = ({ n, s = 16 }) => {
  const p = { width: s, height: s, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    box: <><path d="M2 5.2 8 2.3l6 2.9v5.6L8 13.7 2 10.8z" /><path d="M2 5.2 8 8.1l6-2.9M8 8.1v5.6" /></>,
    people: <><circle cx="6" cy="5.5" r="2.2" /><path d="M2 13c0-2.2 1.8-3.6 4-3.6s4 1.4 4 3.6" /><path d="M11 4.2a2 2 0 0 1 0 3.9M12.2 12.9c0-1.5-.5-2.6-1.4-3.3" /></>,
    flow: <><path d="M2.5 3.5h11l-4 4.5v5l-3-1.6V8z" /></>,
    search: <><circle cx="7" cy="7" r="4.2" /><path d="m10.2 10.2 3 3" /></>,
    plus: <><path d="M8 3v10M3 8h10" /></>,
    arrow: <><path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" /></>,
    back: <><path d="M12.5 8h-9M7 4.5 3.5 8 7 11.5" /></>,
    chev: <><path d="m5.5 3.5 4 4.5-4 4.5" /></>,
    dl: <><path d="M8 2.5v7M5 7l3 3 3-3M3 13h10" /></>,
    x: <><path d="m4 4 8 8M12 4l-8 8" /></>,
    send: <><path d="M14 2 7 9M14 2l-4.5 12L7 9 2 6.5z" /></>,
  };
  return <svg {...p}>{paths[n]}</svg>;
};

/* ------------------------------ MOCK DATA ------------------------------ */

const TODAY = new Date("2026-08-09");

/* The Trusted Partner's own settings. The trade percentage is established here,
   not negotiated inside a deal. */
const PARTNER = { name: "Northline Cards", tradeRate: 0.8 };

/* Counteroffer ceiling. null = unlimited for the pilot. Set a number here and
   both price and market-value negotiation enforce it — see countersBy(). */
const COUNTER_LIMIT = null;

const T = {
  charizard: "Charizard", "base-set": "Base Set", shadowless: "Shadowless", "first-edition": "1st Edition",
  psa9plus: "PSA 9+", psa10: "PSA 10 only", "vintage-wotc": "Vintage WOTC", japanese: "Japanese",
  eeveelution: "Eeveelutions", "gold-star": "Gold Star", sealed: "Sealed product", "full-art": "Full Art",
  "alt-art": "Alt Art", trainer: "Trainer cards", holo: "Holo rares", "team-rocket": "Team Rocket",
  "dark-pokemon": "Dark Pokémon", neo: "Neo era", shining: "Shining Pokémon", promo: "Promos", modern: "Modern era",
  bulk: "Bulk / commons", played: "Played condition",
};

/* ============================================================================
   CANONICAL POKÉMON CARD CATALOG — read-only, generated, never mutated

   Derived from Cards_Normalized-Table_1.csv (32,598 printed cards). Source of truth
   for PRINTED-CARD identity and stock imagery only. MetYet remains authoritative for
   every physical-copy fact: grade, condition, certification, cost, listing price,
   photos, goals, opportunities, deal terms.

   Structurally separate from inventory by construction — frozen, module-scope, never
   held in component state, and no code path writes to it. Adding inventory cannot
   change it. (The prototype renders as one file with no bundler, so this lives here
   rather than in its own module; the read-only boundary is what matters.)

   Mapping ran offline against the printed-card rule — name + set + set position +
   print — with printed_total and release year as deterministic tiebreaks for cards
   reprinted at the same number in a later set. 57 of 84 prototype records resolved,
   0 ambiguous, 0 name/year mismatches. Unresolved records carry no csvId and render
   the fallback rather than a guessed image. Keyed on the CSV's own card_id.
   ============================================================================ */
const CATALOG_IMAGES = Object.freeze({
  "base1-1": ["https://images.pokemontcg.io/base1/1.png", "https://images.pokemontcg.io/base1/1_hires.png"],
  "base1-10": ["https://images.pokemontcg.io/base1/10.png", "https://images.pokemontcg.io/base1/10_hires.png"],
  "base1-12": ["https://images.pokemontcg.io/base1/12.png", "https://images.pokemontcg.io/base1/12_hires.png"],
  "base1-13": ["https://images.pokemontcg.io/base1/13.png", "https://images.pokemontcg.io/base1/13_hires.png"],
  "base1-15": ["https://images.pokemontcg.io/base1/15.png", "https://images.pokemontcg.io/base1/15_hires.png"],
  "base1-16": ["https://images.pokemontcg.io/base1/16.png", "https://images.pokemontcg.io/base1/16_hires.png"],
  "base1-2": ["https://images.pokemontcg.io/base1/2.png", "https://images.pokemontcg.io/base1/2_hires.png"],
  "base1-20": ["https://images.pokemontcg.io/base1/20.png", "https://images.pokemontcg.io/base1/20_hires.png"],
  "base1-3": ["https://images.pokemontcg.io/base1/3.png", "https://images.pokemontcg.io/base1/3_hires.png"],
  "base1-34": ["https://images.pokemontcg.io/base1/34.png", "https://images.pokemontcg.io/base1/34_hires.png"],
  "base1-4": ["https://images.pokemontcg.io/base1/4.png", "https://images.pokemontcg.io/base1/4_hires.png"],
  "base1-58": ["https://images.pokemontcg.io/base1/58.png", "https://images.pokemontcg.io/base1/58_hires.png"],
  "base1-6": ["https://images.pokemontcg.io/base1/6.png", "https://images.pokemontcg.io/base1/6_hires.png"],
  "base1-7": ["https://images.pokemontcg.io/base1/7.png", "https://images.pokemontcg.io/base1/7_hires.png"],
  "base1-8": ["https://images.pokemontcg.io/base1/8.png", "https://images.pokemontcg.io/base1/8_hires.png"],
  "base2-10": ["https://images.pokemontcg.io/base2/10.png", "https://images.pokemontcg.io/base2/10_hires.png"],
  "base2-12": ["https://images.pokemontcg.io/base2/12.png", "https://images.pokemontcg.io/base2/12_hires.png"],
  "base2-3": ["https://images.pokemontcg.io/base2/3.png", "https://images.pokemontcg.io/base2/3_hires.png"],
  "base2-4": ["https://images.pokemontcg.io/base2/4.png", "https://images.pokemontcg.io/base2/4_hires.png"],
  "base5-3": ["https://images.pokemontcg.io/base5/3.png", "https://images.pokemontcg.io/base5/3_hires.png"],
  "base5-4": ["https://images.pokemontcg.io/base5/4.png", "https://images.pokemontcg.io/base5/4_hires.png"],
  "base5-5": ["https://images.pokemontcg.io/base5/5.png", "https://images.pokemontcg.io/base5/5_hires.png"],
  "base5-83": ["https://images.pokemontcg.io/base5/83.png", "https://images.pokemontcg.io/base5/83_hires.png"],
  "bw3-101": ["https://images.pokemontcg.io/bw3/101.png", "https://images.pokemontcg.io/bw3/101_hires.png"],
  "bw7-134": ["https://images.pokemontcg.io/bw7/134.png", "https://images.pokemontcg.io/bw7/134_hires.png"],
  "ecard3-146": ["https://images.pokemontcg.io/ecard3/146.png", "https://images.pokemontcg.io/ecard3/146_hires.png"],
  "ex6-105": ["https://images.pokemontcg.io/ex6/105.png", "https://images.pokemontcg.io/ex6/105_hires.png"],
  "gym2-2": ["https://images.pokemontcg.io/gym2/2.png", "https://images.pokemontcg.io/gym2/2_hires.png"],
  "neo1-17": ["https://images.pokemontcg.io/neo1/17.png", "https://images.pokemontcg.io/neo1/17_hires.png"],
  "neo1-5": ["https://images.pokemontcg.io/neo1/5.png", "https://images.pokemontcg.io/neo1/5_hires.png"],
  "neo1-9": ["https://images.pokemontcg.io/neo1/9.png", "https://images.pokemontcg.io/neo1/9_hires.png"],
  "neo2-20": ["https://images.pokemontcg.io/neo2/20.png", "https://images.pokemontcg.io/neo2/20_hires.png"],
  "neo2-32": ["https://images.pokemontcg.io/neo2/32.png", "https://images.pokemontcg.io/neo2/32_hires.png"],
  "neo3-65": ["https://images.pokemontcg.io/neo3/65.png", "https://images.pokemontcg.io/neo3/65_hires.png"],
  "neo3-66": ["https://images.pokemontcg.io/neo3/66.png", "https://images.pokemontcg.io/neo3/66_hires.png"],
  "neo4-107": ["https://images.pokemontcg.io/neo4/107.png", "https://images.pokemontcg.io/neo4/107_hires.png"],
  "neo4-109": ["https://images.pokemontcg.io/neo4/109.png", "https://images.pokemontcg.io/neo4/109_hires.png"],
  "sm5-148": ["https://images.pokemontcg.io/sm5/148.png", "https://images.pokemontcg.io/sm5/148_hires.png"],
  "sm5-151": ["https://images.pokemontcg.io/sm5/151.png", "https://images.pokemontcg.io/sm5/151_hires.png"],
  "sv2-254": ["https://images.pokemontcg.io/sv2/254.png", "https://images.pokemontcg.io/sv2/254_hires.png"],
  "swsh1-169": ["https://images.pokemontcg.io/swsh1/169.png", "https://images.pokemontcg.io/swsh1/169_hires.png"],
  "swsh11-186": ["https://images.pokemontcg.io/swsh11/186.png", "https://images.pokemontcg.io/swsh11/186_hires.png"],
  "swsh12-186": ["https://images.pokemontcg.io/swsh12/186.png", "https://images.pokemontcg.io/swsh12/186_hires.png"],
  "swsh2-189": ["https://images.pokemontcg.io/swsh2/189.png", "https://images.pokemontcg.io/swsh2/189_hires.png"],
  "swsh35-74": ["https://images.pokemontcg.io/swsh35/74.png", "https://images.pokemontcg.io/swsh35/74_hires.png"],
  "swsh4-188": ["https://images.pokemontcg.io/swsh4/188.png", "https://images.pokemontcg.io/swsh4/188_hires.png"],
  "swsh7-189": ["https://images.pokemontcg.io/swsh7/189.png", "https://images.pokemontcg.io/swsh7/189_hires.png"],
  "swsh7-194": ["https://images.pokemontcg.io/swsh7/194.png", "https://images.pokemontcg.io/swsh7/194_hires.png"],
  "swsh7-212": ["https://images.pokemontcg.io/swsh7/212.png", "https://images.pokemontcg.io/swsh7/212_hires.png"],
  "swsh7-215": ["https://images.pokemontcg.io/swsh7/215.png", "https://images.pokemontcg.io/swsh7/215_hires.png"],
  "swsh7-218": ["https://images.pokemontcg.io/swsh7/218.png", "https://images.pokemontcg.io/swsh7/218_hires.png"],
  "swsh9-154": ["https://images.pokemontcg.io/swsh9/154.png", "https://images.pokemontcg.io/swsh9/154_hires.png"],
});

/* [small, large] for a canonical card id, or null. Never guesses, never falls back
   to a visually similar printing. */
const catalogImage = (csvId) => (csvId && CATALOG_IMAGES[csvId]) || null;

const CARDS_SEED = [
  // --- owned ---
  { id: "i1", name: "Charizard", set: "Base Set", num: "4/102", year: 1999, grade: "PSA 9", value: 4200, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["charizard", "base-set", "vintage-wotc", "holo", "psa9plus"], csvId: "base1-4" },
  { id: "i2", name: "Blastoise", set: "Base Set", num: "2/102", year: 1999, grade: "PSA 8", value: 620, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["base-set", "vintage-wotc", "holo"], csvId: "base1-2" },
  { id: "i3", name: "Venusaur", set: "Base Set", num: "15/102", year: 1999, grade: "PSA 9", value: 780, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["base-set", "vintage-wotc", "holo", "psa9plus"], csvId: "base1-15" },
  { id: "i4", name: "Charizard", set: "Base Set", num: "4/102", year: 1999, grade: "PSA 7", value: 3100, edition: "Shadowless", print: "Holo", condition: null, language: "English", tags: ["charizard", "base-set", "shadowless", "vintage-wotc", "holo"], csvId: "base1-4" },
  { id: "i5", name: "Pikachu (Red Cheeks)", set: "Base Set", num: "58/102", year: 1999, grade: "PSA 10", value: 1450, edition: "Unlimited", print: "Normal", condition: null, language: "English", tags: ["base-set", "vintage-wotc", "psa10", "psa9plus"], csvId: "base1-58" },
  { id: "i6", name: "Alakazam", set: "Base Set", num: "1/102", year: 1999, grade: "PSA 8", value: 900, edition: "1st Edition", print: "Holo", condition: null, language: "English", tags: ["base-set", "first-edition", "shadowless", "vintage-wotc", "holo"], csvId: "base1-1" },
  { id: "i7", name: "Machamp", set: "Base Set", num: "8/102", year: 1999, grade: "PSA 9", value: 240, edition: "1st Edition", print: "Holo", condition: null, language: "English", tags: ["base-set", "first-edition", "vintage-wotc", "holo", "psa9plus"], csvId: "base1-8" },
  { id: "i8", name: "Dark Charizard", set: "Team Rocket", num: "4/82", year: 2000, grade: "PSA 9", value: 1150, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["charizard", "team-rocket", "dark-pokemon", "vintage-wotc", "holo", "psa9plus"], csvId: "base5-4" },
  { id: "i9", name: "Dark Blastoise", set: "Team Rocket", num: "3/82", year: 2000, grade: "PSA 9", value: 310, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["team-rocket", "dark-pokemon", "vintage-wotc", "holo", "psa9plus"], csvId: "base5-3" },
  { id: "i10", name: "Dark Dragonite", set: "Team Rocket", num: "5/82", year: 2000, grade: "Raw", value: 260, edition: "Unlimited", print: "Holo", condition: "Lightly Played", language: "English", tags: ["team-rocket", "dark-pokemon", "vintage-wotc", "holo"], csvId: "base5-5" },
  { id: "i11", name: "Lugia", set: "Neo Genesis", num: "9/111", year: 2000, grade: "PSA 8", value: 2400, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["neo", "vintage-wotc", "holo"], csvId: "neo1-9" },
  { id: "i12", name: "Shining Charizard", set: "Neo Destiny", num: "107/105", year: 2002, grade: "PSA 7", value: 3400, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["charizard", "neo", "shining", "vintage-wotc", "holo"], csvId: "neo4-107" },
  { id: "i13", name: "Shining Mewtwo", set: "Neo Destiny", num: "109/105", year: 2002, grade: "PSA 8", value: 900, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["neo", "shining", "vintage-wotc", "holo"], csvId: "neo4-109" },
  { id: "i14", name: "Umbreon", set: "Neo Discovery", num: "32/75", year: 2001, grade: "PSA 9", value: 780, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["neo", "eeveelution", "vintage-wotc", "holo", "psa9plus"], csvId: "neo2-32" },
  { id: "i15", name: "Espeon", set: "Neo Discovery", num: "20/75", year: 2001, grade: "PSA 9", value: 640, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["neo", "eeveelution", "vintage-wotc", "holo", "psa9plus"], csvId: "neo2-20" },
  { id: "i16", name: "Umbreon Gold Star", set: "POP Series 5", num: "17/17", year: 2007, grade: "PSA 8", value: 12500, edition: "Standard", print: "Holo", condition: null, language: "English", tags: ["gold-star", "eeveelution", "holo"] },
  { id: "i17", name: "Rayquaza Gold Star", set: "EX Deoxys", num: "107/107", year: 2005, grade: "PSA 9", value: 9800, edition: "Standard", print: "Holo", condition: null, language: "English", tags: ["gold-star", "holo", "psa9plus"] },
  { id: "i18", name: "Charizard (No Rarity)", set: "Japanese Base Set", num: "—", year: 1996, grade: "PSA 8", value: 5200, edition: "No Rarity", print: "Holo", condition: null, language: "Japanese", tags: ["charizard", "japanese", "base-set", "vintage-wotc", "holo"] },
  { id: "i19", name: "Eevee", set: "Japanese Vending Series 2", num: "—", year: 1998, grade: "Raw", value: 180, edition: "Standard", print: "Normal", condition: "Near Mint", language: "Japanese", tags: ["japanese", "eeveelution", "promo", "psa9plus"] },
  { id: "i20", name: "Mewtwo", set: "Japanese Trainer Magazine Promo", num: "—", year: 1998, grade: "PSA 8", value: 1100, edition: "Standard", print: "Normal", condition: null, language: "Japanese", tags: ["japanese", "promo"] },
  { id: "i21", name: "Charizard VMAX", set: "Champion's Path", num: "74/73", year: 2020, grade: "PSA 10", value: 420, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["charizard", "modern", "alt-art", "psa10", "psa9plus"], csvId: "swsh35-74" },
  { id: "i22", name: "Umbreon VMAX (Alt Art)", set: "Evolving Skies", num: "215/203", year: 2021, grade: "PSA 9", value: 1600, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["modern", "alt-art", "eeveelution", "psa9plus"], csvId: "swsh7-215" },
  { id: "i23", name: "Rayquaza VMAX (Alt Art)", set: "Evolving Skies", num: "218/203", year: 2021, grade: "PSA 10", value: 480, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["modern", "alt-art", "psa10", "psa9plus"], csvId: "swsh7-218" },
  { id: "i24", name: "Lugia V (Alt Art)", set: "Silver Tempest", num: "186/195", year: 2022, grade: "PSA 10", value: 260, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["modern", "alt-art", "psa10", "psa9plus"], csvId: "swsh12-186" },
  { id: "i25", name: "Professor's Research (Full Art)", set: "Vivid Voltage", num: "178/185", year: 2020, grade: "PSA 10", value: 210, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["modern", "trainer", "full-art", "psa10", "psa9plus"] },
  { id: "i26", name: "Marnie (Full Art)", set: "Sword & Shield", num: "169/202", year: 2020, grade: "PSA 9", value: 190, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["modern", "trainer", "full-art", "psa9plus"], csvId: "swsh1-169" },
  { id: "i27", name: "Lillie (Full Art)", set: "Ultra Prism", num: "151/156", year: 2018, grade: "PSA 9", value: 620, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["modern", "trainer", "full-art", "psa9plus"], csvId: "sm5-151" },
  { id: "i28", name: "Booster Pack (Unlimited)", set: "Base Set", num: "—", year: 1999, grade: "Raw", value: 1700, edition: "Unlimited", print: "Normal", condition: "Near Mint", language: "English", tags: ["sealed", "base-set", "vintage-wotc"] },
  { id: "i29", name: "Booster Box", set: "Evolving Skies", num: "—", year: 2021, grade: "Raw", value: 1250, edition: "Standard", print: "Normal", condition: "Near Mint", language: "English", tags: ["sealed", "modern"] },
  { id: "i30", name: "Booster Box", set: "Japanese Neo Genesis", num: "—", year: 2000, grade: "Raw", value: 2200, edition: "Standard", print: "Normal", condition: "Near Mint", language: "Japanese", tags: ["sealed", "japanese", "neo", "vintage-wotc"] },
  { id: "i31", name: "Zubat", set: "Fossil", num: "64/62", year: 1999, grade: "PSA 8", value: 25, edition: "Unlimited", print: "Normal", condition: null, language: "English", tags: ["bulk"] },
  { id: "i32", name: "Weedle", set: "Jungle", num: "69/64", year: 1999, grade: "Raw", value: 20, edition: "Unlimited", print: "Normal", condition: "Moderately Played", language: "English", tags: ["bulk"] },
  { id: "i33", name: "Machoke", set: "Base Set", num: "34/102", year: 1999, grade: "Raw", value: 15, edition: "Unlimited", print: "Normal", condition: "Damaged", language: "English", tags: ["played"], csvId: "base1-34" },
  { id: "i34", name: "Pikachu", set: "Vivid Voltage", num: "043/185", year: 2020, grade: "PSA 10", value: 40, edition: "Standard", print: "Reverse Holo", condition: null, language: "English", tags: ["modern", "psa10", "psa9plus"] },
  // --- wanted, not owned ---
  { id: "u1", name: "Charizard", set: "Base Set", num: "4/102", year: 1999, grade: "PSA 9", value: 165000, edition: "1st Edition", print: "Holo", condition: null, language: "English", tags: ["charizard", "base-set", "first-edition", "shadowless", "vintage-wotc", "holo", "psa9plus"], csvId: "base1-4" },
  { id: "u2", name: "Blastoise", set: "Base Set", num: "2/102", year: 1999, grade: "PSA 8", value: 6800, edition: "1st Edition", print: "Holo", condition: null, language: "English", tags: ["base-set", "first-edition", "shadowless", "vintage-wotc", "holo"], csvId: "base1-2" },
  { id: "u3", name: "Espeon Gold Star", set: "POP Series 5", num: "16/17", year: 2007, grade: "PSA 9", value: 14000, edition: "Standard", print: "Holo", condition: null, language: "English", tags: ["gold-star", "eeveelution", "holo", "psa9plus"] },
  { id: "u4", name: "Pikachu Illustrator", set: "CoroCoro Promo", num: "—", year: 1998, grade: "PSA 6", value: 375000, edition: "Standard", print: "Normal", condition: null, language: "Japanese", tags: ["japanese", "promo"] },
  { id: "u5", name: "Charizard", set: "Japanese Base Set", num: "—", year: 1996, grade: "PSA 9", value: 22000, edition: "1st Edition", print: "Holo", condition: null, language: "Japanese", tags: ["charizard", "japanese", "base-set", "first-edition", "vintage-wotc", "holo", "psa9plus"] },
  { id: "u6", name: "Giratina V (Alt Art)", set: "Lost Origin", num: "186/196", year: 2022, grade: "PSA 10", value: 380, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["modern", "alt-art", "psa10", "psa9plus"], csvId: "swsh11-186" },
  { id: "u7", name: "Shining Gyarados", set: "Neo Revelation", num: "65/64", year: 2001, grade: "PSA 9", value: 1200, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["neo", "shining", "vintage-wotc", "holo", "psa9plus"], csvId: "neo3-65" },
  { id: "u8", name: "Charizard (Crystal)", set: "Skyridge", num: "146/144", year: 2003, grade: "PSA 8", value: 14000, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["charizard", "vintage-wotc", "holo"], csvId: "ecard3-146" },
  { id: "u9", name: "Vaporeon", set: "Jungle", num: "12/64", year: 1999, grade: "PSA 9", value: 850, edition: "1st Edition", print: "Holo", condition: null, language: "English", tags: ["eeveelution", "first-edition", "vintage-wotc", "holo", "psa9plus"], csvId: "base2-12" },
  { id: "u10", name: "Booster Box (1st Edition)", set: "Team Rocket", num: "—", year: 2000, grade: "Raw", value: 9500, edition: "1st Edition", print: "Normal", condition: "Near Mint", language: "English", tags: ["sealed", "team-rocket", "first-edition", "vintage-wotc"] },
  { id: "u11", name: "Trophy Pikachu No. 3 (Bronze)", set: "Japanese Tournament Promo", num: "—", year: 1997, grade: "PSA 8", value: 18000, edition: "Standard", print: "Normal", condition: null, language: "Japanese", tags: ["japanese", "promo"] },
  { id: "u12", name: "Ancient Mew (Sealed)", set: "Movie Promo", num: "—", year: 1999, grade: "Raw", value: 220, edition: "Standard", print: "Normal", condition: "Near Mint", language: "English", tags: ["promo", "sealed"] },
  { id: "u13", name: "Dark Dragonite", set: "Team Rocket", num: "5/82", year: 2000, grade: "Raw", value: 300, edition: "Unlimited", print: "Holo", condition: "Near Mint", language: "English", tags: ["team-rocket", "dark-pokemon", "vintage-wotc", "holo"], csvId: "base5-5" },
  // --- collector-owned cards, candidates for trade ---
  { id: "t1", name: "Zapdos", set: "Base Set", num: "16/102", year: 1999, grade: "PSA 8", value: 260, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["base-set", "vintage-wotc", "holo"], csvId: "base1-16" },
  { id: "t2", name: "Ninetales", set: "Base Set", num: "12/102", year: 1999, grade: "PSA 9", value: 240, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["base-set", "vintage-wotc", "holo", "psa9plus"], csvId: "base1-12" },
  { id: "t3", name: "Chansey", set: "Base Set", num: "3/102", year: 1999, grade: "PSA 9", value: 300, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["base-set", "vintage-wotc", "holo", "psa9plus"], csvId: "base1-3" },
  { id: "t4", name: "Poliwrath", set: "Base Set", num: "13/102", year: 1999, grade: "Raw", value: 120, edition: "Unlimited", print: "Holo", condition: "Lightly Played", language: "English", tags: ["base-set", "vintage-wotc", "holo"], csvId: "base1-13" },
  { id: "t5", name: "Vaporeon", set: "Japanese Jungle", num: "—", year: 1997, grade: "PSA 9", value: 150, edition: "Unlimited", print: "Holo", condition: null, language: "Japanese", tags: ["japanese", "eeveelution", "holo", "psa9plus"] },
  { id: "t6", name: "Cynthia (Full Art)", set: "Ultra Prism", num: "148/156", year: 2018, grade: "PSA 10", value: 180, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["modern", "trainer", "full-art", "psa10", "psa9plus"], csvId: "sm5-148" },
  { id: "t7", name: "N (Full Art)", set: "Noble Victories", num: "101/101", year: 2011, grade: "PSA 9", value: 420, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["trainer", "full-art", "psa9plus"], csvId: "bw3-101" },
  { id: "t8", name: "Dark Raichu", set: "Team Rocket", num: "83/82", year: 2000, grade: "PSA 8", value: 700, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["team-rocket", "dark-pokemon", "vintage-wotc", "holo"], csvId: "base5-83" },
  { id: "t9", name: "Typhlosion", set: "Neo Genesis", num: "17/111", year: 2000, grade: "PSA 9", value: 220, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["neo", "vintage-wotc", "holo", "psa9plus"], csvId: "neo1-17" },
  { id: "t10", name: "Charizard (CD Promo)", set: "Japanese Promo", num: "—", year: 1998, grade: "PSA 9", value: 900, edition: "Standard", print: "Normal", condition: null, language: "Japanese", tags: ["charizard", "japanese", "promo", "psa9plus"] },
  { id: "t11", name: "Pikachu VMAX", set: "Vivid Voltage", num: "188/185", year: 2020, grade: "PSA 10", value: 130, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["modern", "alt-art", "psa10", "psa9plus"], csvId: "swsh4-188" },
  { id: "t12", name: "Charizard ex", set: "FireRed & LeafGreen", num: "105/112", year: 2004, grade: "PSA 8", value: 1400, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["charizard", "holo"], csvId: "ex6-105" },
  { id: "t13", name: "Sylveon VMAX (Alt Art)", set: "Evolving Skies", num: "212/203", year: 2021, grade: "PSA 9", value: 520, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["modern", "alt-art", "eeveelution", "psa9plus"], csvId: "swsh7-212" },
  { id: "t14", name: "Hitmonchan", set: "Base Set", num: "7/102", year: 1999, grade: "PSA 8", value: 400, edition: "1st Edition", print: "Holo", condition: null, language: "English", tags: ["base-set", "first-edition", "vintage-wotc", "holo"], csvId: "base1-7" },
  { id: "t15", name: "Mew ex", set: "Dragon Frontiers", num: "—", year: 2006, grade: "PSA 8", value: 1900, edition: "Standard", print: "Holo", condition: null, language: "English", tags: ["gold-star", "holo"] },
  { id: "t16", name: "Lugia", set: "Japanese Neo Genesis", num: "—", year: 2000, grade: "PSA 9", value: 700, edition: "Unlimited", print: "Holo", condition: null, language: "Japanese", tags: ["japanese", "neo", "holo", "psa9plus"] },
  { id: "t17", name: "Blaine's Charizard", set: "Gym Challenge", num: "2/132", year: 2000, grade: "PSA 7", value: 1100, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["charizard", "vintage-wotc", "holo"], csvId: "gym2-2" },
  { id: "t18", name: "Espeon", set: "Japanese Neo Discovery", num: "—", year: 2000, grade: "PSA 9", value: 190, edition: "Unlimited", print: "Normal", condition: null, language: "Japanese", tags: ["japanese", "eeveelution", "neo", "psa9plus"] },
  { id: "t19", name: "Electabuzz", set: "Base Set", num: "20/102", year: 1999, grade: "PSA 9", value: 180, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["base-set", "vintage-wotc", "holo", "psa9plus"], csvId: "base1-20" },
  { id: "t20", name: "Scyther", set: "Jungle", num: "10/64", year: 1999, grade: "PSA 9", value: 120, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["vintage-wotc", "holo", "psa9plus"], csvId: "base2-10" },
  { id: "t21", name: "Pikachu", set: "Japanese Vending Series 1", num: "—", year: 1998, grade: "PSA 9", value: 150, edition: "Standard", print: "Normal", condition: null, language: "Japanese", tags: ["japanese", "promo", "psa9plus"] },
  { id: "t22", name: "Blastoise", set: "Japanese Base Set", num: "—", year: 1996, grade: "PSA 8", value: 620, edition: "No Rarity", print: "Holo", condition: null, language: "Japanese", tags: ["japanese", "base-set", "holo"] },
  { id: "t23", name: "Charizard V (Alt Art)", set: "Brilliant Stars", num: "154/172", year: 2022, grade: "PSA 9", value: 340, edition: "Standard", print: "Holo", condition: null, language: "English", tags: ["charizard", "modern", "alt-art", "psa9plus"], csvId: "swsh9-154" },
  { id: "t24", name: "Rayquaza V (Alt Art)", set: "Evolving Skies", num: "194/203", year: 2021, grade: "PSA 10", value: 290, edition: "Standard", print: "Holo", condition: null, language: "English", tags: ["modern", "alt-art", "psa10", "psa9plus"], csvId: "swsh7-194" },
  { id: "t25", name: "Umbreon V (Alt Art)", set: "Evolving Skies", num: "189/203", year: 2021, grade: "PSA 9", value: 480, edition: "Standard", print: "Holo", condition: null, language: "English", tags: ["modern", "alt-art", "eeveelution", "psa9plus"], csvId: "swsh7-189" },
  { id: "t26", name: "Iono (Full Art)", set: "Paldea Evolved", num: "254/193", year: 2023, grade: "PSA 9", value: 110, edition: "Standard", print: "Holo", condition: null, language: "English", tags: ["modern", "trainer", "full-art", "psa9plus"], csvId: "sv2-254" },
  { id: "t27", name: "Boss's Orders (Full Art)", set: "Rebel Clash", num: "189/192", year: 2020, grade: "PSA 9", value: 70, edition: "Standard", print: "Holo", condition: null, language: "English", tags: ["modern", "trainer", "full-art", "psa9plus"], csvId: "swsh2-189" },
  // --- previously sold (history only) ---
  { id: "x1", name: "Charizard", set: "Base Set", num: "4/102", year: 1999, grade: "PSA 8", value: 1800, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["charizard", "base-set", "vintage-wotc", "holo"], csvId: "base1-4" },
  { id: "x2", name: "Gyarados", set: "Base Set", num: "6/102", year: 1999, grade: "PSA 9", value: 300, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["base-set", "vintage-wotc", "holo", "psa9plus"], csvId: "base1-6" },
  { id: "x3", name: "Mewtwo", set: "Base Set", num: "10/102", year: 1999, grade: "PSA 9", value: 350, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["base-set", "vintage-wotc", "holo", "psa9plus"], csvId: "base1-10" },
  { id: "x4", name: "Jolteon", set: "Jungle", num: "4/64", year: 1999, grade: "PSA 9", value: 220, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["eeveelution", "vintage-wotc", "holo", "psa9plus"], csvId: "base2-4" },
  { id: "x5", name: "Flareon", set: "Jungle", num: "3/64", year: 1999, grade: "PSA 9", value: 210, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["eeveelution", "vintage-wotc", "holo", "psa9plus"], csvId: "base2-3" },
  { id: "x6", name: "Charizard VMAX (Rainbow)", set: "Champion's Path", num: "79/73", year: 2020, grade: "PSA 10", value: 380, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["charizard", "modern", "psa10", "psa9plus"] },
  { id: "x7", name: "Blastoise", set: "Japanese Base Set", num: "—", year: 1996, grade: "PSA 9", value: 900, edition: "Unlimited", print: "Holo", condition: null, language: "Japanese", tags: ["japanese", "base-set", "vintage-wotc", "holo", "psa9plus"] },
  { id: "x8", name: "Feraligatr", set: "Neo Genesis", num: "5/111", year: 2000, grade: "PSA 9", value: 260, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["neo", "vintage-wotc", "holo", "psa9plus"], csvId: "neo1-5" },
  { id: "x9", name: "Skyla (Full Art)", set: "Boundaries Crossed", num: "134/149", year: 2012, grade: "PSA 10", value: 300, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["trainer", "full-art", "psa10", "psa9plus"], csvId: "bw7-134" },
  { id: "x10", name: "Shining Magikarp", set: "Neo Revelation", num: "66/64", year: 2001, grade: "PSA 9", value: 700, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["neo", "shining", "vintage-wotc", "holo", "psa9plus"], csvId: "neo3-66" },
];

const COLLECTORS_SEED = [
  { id: "c1", binderReviewedAt: "2026-07-30", name: "Sarah Mendel", short: "Sarah M.", city: "Minneapolis, MN", since: "2024-06-02", last: "2026-08-05", prefs: ["charizard", "base-set", "shadowless", "first-edition", "psa9plus"], note: "Building a shadowless Base Set run. Buys fast when grade is right." },
  { id: "c2", binderReviewedAt: "2026-07-19", name: "James Rivera", short: "James R.", city: "Austin, TX", since: "2024-09-14", last: "2026-08-01", prefs: ["vintage-wotc", "holo", "base-set", "neo"], note: "Wants the unlimited Base holo set complete before moving to Neo." },
  { id: "c3", binderReviewedAt: "2026-07-24", name: "Alex Trinh", short: "Alex T.", city: "Seattle, WA", since: "2023-11-20", last: "2026-07-28", prefs: ["japanese", "eeveelution", "gold-star", "sealed"], note: "Japanese-first collector. Prefers raw Japanese over graded English." },
  { id: "c4", binderReviewedAt: "2026-08-05", name: "Priya Raman", short: "Priya R.", city: "Chicago, IL", since: "2025-02-08", last: "2026-08-07", prefs: ["modern", "alt-art", "full-art", "trainer"], note: "Trainer supporter cards only. Very responsive to alt art drops." },
  { id: "c5", binderReviewedAt: "2026-07-28", name: "Marcus Webb", short: "Marcus W.", city: "Atlanta, GA", since: "2024-01-17", last: "2026-07-30", prefs: ["team-rocket", "dark-pokemon", "base-set", "psa9plus"], note: "Team Rocket master set. Needs high grades only." },
  { id: "c6", binderReviewedAt: "2026-08-06", name: "Dana Kowalski", short: "Dana K.", city: "Denver, CO", since: "2025-04-22", last: "2026-08-06", prefs: ["neo", "shining", "holo"], note: "Chasing all Shining Pokémon. Patient, pays well for centering." },
  { id: "c7", binderReviewedAt: "2026-06-30", name: "Hiro Tanaka", short: "Hiro T.", city: "San Jose, CA", since: "2023-08-05", last: "2026-06-11", prefs: ["japanese", "promo", "gold-star", "eeveelution"], note: "Long-time client. Slow to reply but closes big when he does." },
  { id: "c8", binderReviewedAt: "2026-07-20", name: "Ellen Fisher", short: "Ellen F.", city: "Boston, MA", since: "2025-06-30", last: "2026-08-08", prefs: ["trainer", "full-art", "sealed", "modern"], note: "Sealed modern + full art trainers. Buys in volume, small tickets." },
  { id: "c9", binderReviewedAt: "2026-05-19", name: "Tomás Ortega", short: "Tomás O.", city: "Miami, FL", since: "2024-03-11", last: "2026-05-19", prefs: ["charizard", "vintage-wotc", "psa10", "holo"], note: "Charizard only. Has gone quiet since spring — worth a check-in." },
  { id: "c10", binderReviewedAt: "2026-08-01", name: "Nina Alvarez", short: "Nina A.", city: "Portland, OR", since: "2025-01-25", last: "2026-08-02", prefs: ["eeveelution", "japanese", "alt-art", "modern"], note: "Eeveelution completist across eras." },
  { id: "c11", binderReviewedAt: "2026-07-21", name: "Grant Whitfield", short: "Grant W.", city: "Nashville, TN", since: "2023-05-09", last: "2026-07-21", prefs: ["first-edition", "shadowless", "base-set", "sealed"], note: "1st Edition purist. Will wait years for the right copy." },
  { id: "c12", binderReviewedAt: "2026-04-14", name: "Casey Lin", short: "Casey L.", city: "Brooklyn, NY", since: "2025-09-03", last: "2026-04-14", prefs: ["gold-star", "alt-art", "modern", "trainer"], note: "New-ish. Gold Star curiosity is turning into real intent." },
  { id: "c13", binderReviewedAt: "2026-07-15", name: "Robert Nakamura", short: "Robert N.", city: "Honolulu, HI", since: "2023-02-14", last: "2026-07-15", prefs: ["japanese", "promo", "sealed", "vintage-wotc"], note: "Japanese sealed and tournament promos. Highest lifetime value." },
];

// [collectorId, cardId, tier, note]
const GOALS_SEED = [
  ["c1", "i1", "primary", "Wants a PSA 9 copy before year end", "2026-07-02", "2026-05-16", "2026-08-09"],
  ["c1", "u1", "primary", "Grail. Has budget approved.", "2026-06-20", "2026-04-17", "2026-08-08"],
  ["c2", "i1", "primary", "Final holo needed for unlimited Base run", "2026-06-14", "2026-03-25", "2026-08-07"],
  ["c3", "i1", "primary", "Would take PSA 9 English if Japanese doesn't surface", "2026-05-30", "2026-02-21", "2026-08-06"],
  ["c3", "u3", "primary", "Espeon Gold Star to pair with Umbreon", "2026-05-30", "2026-02-04", "2026-08-04"],
  ["c4", "i27", "primary", "Lillie FA is the centerpiece of her trainer binder", "2026-07-19", "2026-03-09", "2026-08-03"],
  ["c4", "u6", "primary", "Giratina alt art, PSA 10 only", "2026-07-22", "2026-02-23", "2026-07-31"],
  ["c5", "i8", "primary", "Dark Charizard PSA 9 for master set", "2026-06-05", "2025-12-21", "2026-07-28"],
  ["c5", "u10", "primary", "Sealed 1st Ed Team Rocket box", "2026-06-01", "2025-11-30", "2026-07-24"],
  ["c6", "i12", "primary", "Shining Charizard — will accept PSA 7", "2026-07-11", "2026-06-11", "2026-07-21"],
  ["c6", "u7", "primary", "Shining Gyarados PSA 9", "2026-06-28", "2026-05-12", "2026-07-17"],
  ["c7", "u5", "primary", "Japanese 1st Ed Charizard, long-standing want", "2026-04-18", "2026-02-13", "2026-07-13"],
  ["c7", "i16", "primary", "Umbreon Gold Star", "2026-05-09", "2026-02-17", "2026-07-06"],
  ["c8", "i29", "primary", "Sealed Evolving Skies box for long-term hold", "2026-07-30", "2026-04-23", "2026-07-30"],
  ["c9", "u8", "primary", "Crystal Charizard, Skyridge", "2026-05-19", "2026-01-24", "2026-06-22"],
  ["c9", "i4", "primary", "Shadowless Zard, grade flexible", "2026-05-19", "2026-01-07", "2026-06-15"],
  ["c10", "i22", "primary", "Umbreon VMAX alt art", "2026-07-25", "2026-02-26", "2026-07-25"],
  ["c10", "u9", "primary", "Jungle 1st Ed Vaporeon PSA 9", "2026-06-09", "2025-12-25", "2026-06-09"],
  ["c11", "i6", "primary", "1st Ed Alakazam to start the run", "2026-05-12", "2025-11-10", "2026-05-13"],
  ["c11", "u2", "primary", "1st Ed Blastoise", "2026-05-12", "2026-04-12", "2026-05-12"],
  ["c12", "i17", "primary", "Rayquaza Gold Star — first big purchase", "2026-03-02", "2026-01-14", "2026-04-21"],
  ["c13", "u11", "primary", "Trophy Pikachu No. 3", "2026-04-06", "2026-02-01", "2026-04-06"],
  ["c13", "i30", "primary", "Japanese Neo Genesis sealed box", "2026-04-06", "2026-01-15", "2026-04-06"],
  ["c1", "i2", "secondary", "", "2025-10-20", "2025-10-20", "2026-03-02"], ["c1", "i5", "secondary", "", "2025-11-02", "2025-11-02", "2026-02-05"], ["c1", "i28", "secondary", "", "2025-11-27", "2025-11-27", "2026-01-11"], ["c1", "u2", "secondary", "", "2025-11-14", "2025-11-14", "2025-12-12"],
  ["c2", "i3", "secondary", "", "2025-12-09", "2025-12-09", "2025-12-09"], ["c2", "i2", "secondary", "", "2025-12-18", "2025-12-18", "2025-12-18"], ["c2", "i11", "secondary", "", "2026-01-05", "2026-01-05", "2026-01-05"], ["c2", "u2", "secondary", "", "2025-12-03", "2025-12-03", "2025-12-03"],
  ["c3", "i19", "secondary", "", "2026-01-15", "2026-01-15", "2026-01-15"], ["c3", "i20", "secondary", "", "2026-01-28", "2026-01-28", "2026-01-28"], ["c3", "i30", "secondary", "", "2026-02-02", "2026-02-02", "2026-08-09"], ["c3", "u4", "secondary", "", "2026-01-09", "2026-01-09", "2026-08-08"],
  ["c4", "i25", "secondary", "", "2026-02-11", "2026-02-11", "2026-08-07"], ["c4", "i26", "secondary", "", "2026-02-24", "2026-02-24", "2026-08-06"], ["c4", "i23", "secondary", "", "2026-03-06", "2026-03-06", "2026-08-04"], ["c4", "i21", "secondary", "", "2026-01-22", "2026-01-22", "2026-08-03"],
  ["c5", "i9", "secondary", "", "2026-03-18", "2026-03-18", "2026-07-31"], ["c5", "i10", "secondary", "", "2026-03-27", "2026-03-27", "2026-07-28"], ["c5", "i5", "secondary", "", "2026-04-09", "2026-04-09", "2026-07-24"], ["c5", "i1", "secondary", "", "2026-02-05", "2026-02-05", "2026-07-21"],
  ["c6", "i13", "secondary", "", "2026-04-21", "2026-04-21", "2026-07-17"], ["c6", "i11", "secondary", "", "2026-04-30", "2026-04-30", "2026-07-13"], ["c6", "i14", "secondary", "", "2026-05-01", "2026-05-01", "2026-07-06"], ["c6", "i15", "secondary", "", "2026-02-17", "2026-02-17", "2026-06-29"],
  ["c7", "i18", "secondary", "", "2026-05-20", "2026-05-20", "2026-06-22"], ["c7", "i19", "secondary", "", "2026-05-23", "2026-05-23", "2026-06-15"], ["c7", "i30", "secondary", "", "2026-06-07", "2026-06-07", "2026-06-07"], ["c7", "i17", "secondary", "", "2026-03-01", "2026-03-01", "2026-05-29"],
  ["c8", "i25", "secondary", "", "2026-06-16", "2026-06-16", "2026-06-16"], ["c8", "i26", "secondary", "", "2026-06-30", "2026-06-30", "2026-06-30"], ["c8", "i27", "secondary", "", "2026-07-05", "2026-07-05", "2026-07-05"], ["c8", "i24", "secondary", "", "2026-03-12", "2026-03-12", "2026-04-06"],
  ["c9", "i1", "secondary", "", "2026-07-16", "2026-07-16", "2026-07-16"], ["c9", "i12", "secondary", "", "2026-07-20", "2026-07-20", "2026-07-20"], ["c9", "u1", "secondary", "", "2026-03-24", "2026-03-24", "2026-03-24"],
  ["c10", "i14", "secondary", "", "2025-12-30", "2025-12-30", "2026-01-11"], ["c10", "i15", "secondary", "", "2026-01-19", "2026-01-19", "2026-01-19"], ["c10", "i19", "secondary", "", "2026-02-20", "2026-02-20", "2026-02-20"], ["c10", "i23", "secondary", "", "2026-04-02", "2026-04-02", "2026-04-02"],
  ["c11", "i7", "secondary", "", "2026-03-11", "2026-03-11", "2026-03-11"], ["c11", "i28", "secondary", "", "2026-04-14", "2026-04-14", "2026-04-14"], ["c11", "u10", "secondary", "", "2026-04-15", "2026-04-15", "2026-04-15"],
  ["c12", "i21", "secondary", "", "2026-05-11", "2026-05-11", "2026-05-11"], ["c12", "i23", "secondary", "", "2026-06-23", "2026-06-23", "2026-08-09"], ["c12", "i16", "secondary", "", "2026-07-09", "2026-07-09", "2026-08-08"], ["c12", "u6", "secondary", "", "2026-04-27", "2026-04-27", "2026-08-07"],
  ["c13", "i20", "secondary", "", "2026-02-06", "2026-02-06", "2026-08-06"], ["c13", "i18", "secondary", "", "2026-03-30", "2026-03-30", "2026-08-04"], ["c13", "i29", "secondary", "", "2026-04-25", "2026-04-25", "2026-08-03"], ["c13", "u12", "secondary", "", "2026-05-06", "2026-05-06", "2026-07-31"],
  ["c8", "i34", "secondary", "", "2026-08-06", "2026-08-06", "2026-08-06"], ["c5", "u13", "secondary", "", "2026-05-14", "2026-05-14", "2026-07-24"],
];

const STAGES = [
  { id: "secondary", label: "Secondary Goal", group: "intent" },
  { id: "primary", label: "Primary Goal", group: "intent" },
  { id: "agree-price", label: "Agree on Price", group: "deal" },
  { id: "select-trade", label: "Select Trade", group: "deal" },
  { id: "value-trade", label: "Value Trade", group: "deal" },
  { id: "deal", label: "Deal", group: "deal" },
  { id: "fulfillment", label: "Fulfillment", group: "deal" },
  { id: "completed", label: "Completed", group: "closed" },
  /* Archived is a lifecycle destination, not a stage an opportunity sits in: an
     archived record keeps opp.stage and gains declined=true. It is surfaced here so
     the TP can reach closed opportunities, and excluded from every active count. */
  { id: "archived", label: "Archived", group: "closed" },
];
const DEAL_STAGES = ["agree-price", "select-trade", "value-trade", "deal", "fulfillment", "completed"];
/* Stages where the structured workspace, not the conversation, is the main surface. */
const TXN_STAGES = ["select-trade", "value-trade", "deal", "fulfillment", "completed"];
const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.id, s.label]));

/* Canonical stage numbering — the single source for "which step of the deal is this".
   Derived from the existing STAGES order rather than a hand-written list, so adding or
   reordering a deal stage renumbers everything at once.

   Only the five collaborative deal stages are numbered. Collector Intent precedes the
   deal, and Completed/Archived are history: numbering either would imply they sit on
   the same sequence, which they do not. */
const STAGE_NUMBER = Object.fromEntries(
  STAGES.filter((s) => s.group === "deal" && s.id !== "completed").map((s, i) => [s.id, i + 1])
);
/* "01" — zero-padded so the numbers align when stacked vertically. */
const stageNo = (id) => (STAGE_NUMBER[id] ? String(STAGE_NUMBER[id]).padStart(2, "0") : null);
/* "01 · Agree on Price", or just the label for unnumbered states. */
const stageWithNo = (id) => (stageNo(id) ? `${stageNo(id)} · ${STAGE_LABEL[id]}` : STAGE_LABEL[id]);

/* Cards collectors own. `tpInterest` is a Trusted Partner flag, and it is the ONLY
   thing that makes a card eligible to be offered in trade. Unflagged cards never
   appear in Select Trade. [cardId, collectorId, tpInterest] */
/* The collector's trade binder. `market` is the collector's own proposed market value,
   captured in the binder rather than invented at valuation time. `photos` are of the
   exact physical copy and are reused automatically — a collector never re-shoots a card
   they have already documented. [cardId, collectorId, tpInterest, market, photos, cert] */
const PHOTOS = (id) => ({ front: "binder:" + id + ":front", back: "binder:" + id + ":back" });
const NO_PHOTOS = { front: null, back: null };
/* [cardId, collectorId, tpInterest, market, photos, cert, addedAt]
   addedAt is when the collector shared the copy into their binder. Fixed dates, so
   the "new since you last looked" counts are the same on every run. */
const COLLECTOR_CARDS_SEED = [
  ["t1", "c1", true, 275, PHOTOS("t1"), "PSA 70551201", "2025-03-04"],
  ["t2", "c1", true, 250, PHOTOS("t2"), "PSA 70551202", "2025-06-18"],
  ["t3", "c2", true, 320, PHOTOS("t3"), "PSA 69884410", "2025-01-22"],
  ["t4", "c2", false, 130, NO_PHOTOS, null, "2025-05-09"],
  ["t5", "c3", true, 165, PHOTOS("t5"), "PSA 71230067", "2025-04-15"],
  ["t18", "c3", true, 200, NO_PHOTOS, "PSA 71230068", "2026-08-01"],
  ["t6", "c4", true, 195, PHOTOS("t6"), "PSA 72004511", "2025-06-01"],
  ["t7", "c4", true, 450, PHOTOS("t7"), "PSA 68110934", "2025-09-12"],
  ["t8", "c5", true, 760, PHOTOS("t8"), "PSA 66720188", "2024-11-08"],
  ["t9", "c6", true, 235, PHOTOS("t9"), "PSA 70998123", "2025-08-19"],
  ["t10", "c7", true, 980, PHOTOS("t10"), "PSA 65330472", "2024-10-02"],
  ["t11", "c8", false, 140, NO_PHOTOS, "PSA 73001284", "2025-07-14"],
  ["t12", "c9", true, 1500, PHOTOS("t12"), "PSA 64221900", "2024-08-30"],
  ["t17", "c9", true, 1180, PHOTOS("t17"), "PSA 67554120", "2025-03-21"],
  ["t13", "c10", true, 560, PHOTOS("t13"), "PSA 72880341", "2025-05-06"],
  ["t14", "c11", true, 430, PHOTOS("t14"), "PSA 69003377", "2024-07-11"],
  ["t15", "c12", true, 2050, PHOTOS("t15"), "PSA 63118845", "2025-10-10"],
  ["t16", "c13", true, 745, PHOTOS("t16"), "PSA 70442096", "2024-04-25"],
  ["t19", "c2", true, 190, PHOTOS("t19"), "PSA 69884411", "2026-07-26"],
  ["t20", "c2", true, 135, PHOTOS("t20"), "PSA 69884412", "2026-08-03"],
  ["t21", "c7", true, 160, PHOTOS("t21"), "PSA 65330473", "2025-02-27"],
  ["t22", "c7", true, 650, PHOTOS("t22"), "PSA 65330474", "2026-08-04"],
  ["t23", "c8", true, 360, PHOTOS("t23"), "PSA 73001285", "2025-11-05"],
  ["t24", "c8", true, 300, PHOTOS("t24"), "PSA 73001286", "2026-02-17"],
  ["t25", "c8", true, 505, PHOTOS("t25"), "PSA 73001287", "2026-07-29"],
  ["t26", "c8", true, 120, PHOTOS("t26"), "PSA 73001288", "2026-08-02"],
  ["t27", "c8", true, 75, PHOTOS("t27"), "PSA 73001289", "2026-08-06"],
];

/* ---------------------- OPPORTUNITY LIFECYCLE MODEL --------------------- */
/*
  An opportunity record is created only when a Collector makes an offer against a
  specific TP inventory card. Everything before that is intent, and lives on the
  goal (tier = secondary | primary), which only the Collector can change.

  All negotiated terms are stored as structured fields, never inside message text.
*/

/* Fulfillment answers two separate questions, and they must not collapse into one:
   COORDINATION — have we agreed when and where the exchange happens?
   COMPLETION   — did the exchange actually happen?
   The plan can be agreed days before the handoff. Only the two handoff
   confirmations move the opportunity to Completed. */
const FULFILLMENT_METHODS = [
  { id: "show", label: "Pick up at next show", fields: ["show", "date"] },
  { id: "meetup", label: "Coordinate meet up", fields: ["date", "time", "location"] },
];
const methodLabel = (id) => FULFILLMENT_METHODS.find((m) => m.id === id)?.label || "not set";

const emptyFulfillment = () => ({
  method: null,               // 'show' | 'meetup'
  show: "", date: "", time: "", location: "", note: "",
  proposedAt: null,           // TP submitted a plan
  collectorConfirmedPlan: false,
  revisionRequested: null,    // {note, at} — clears when the TP resubmits
  tpHandoff: false,           // TP: I handed over my side
  collectorReceipt: false,    // collector: I received and completed mine
});

/* Derived, never stored alongside the fields it reads. */
const planFieldsFilled = (f) => {
  const m = FULFILLMENT_METHODS.find((x) => x.id === f.method);
  return !!m && m.fields.every((k) => String(f[k] || "").trim());
};
const planProposed = (f) => !!f.proposedAt && !f.revisionRequested;
const planAgreed = (f) => planProposed(f) && f.collectorConfirmedPlan;
const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const fulfillmentSummary = (f) =>
  f.method === "show" ? `Pick up at ${f.show} · ${fmtDate(f.date)}`
    : f.method === "meetup" ? `Meet at ${f.location} · ${fmtDate(f.date)} at ${fmtTime(f.time)}`
      : "no plan yet";

/* Deal is a review of the assembled transaction, not a place to reopen upstream
   chapters. The one economic lever here is a cash ADJUSTMENT: it moves the final
   cash balance and never touches agreed price, market values or percentages. */
const emptyDeal = () => ({
  collectorAgreed: false,
  tpAgreed: false,
  adjThread: [],        // {by, type:'propose'|'accept', amount, at} — signed, see cashBalance
  tpAdj: null,          // standing positions
  collectorAdj: null,
  agreedAdj: null,      // OUTPUT only — written solely by acceptance
});

const emptyOpp = (collectorId, cardId, invId, listedPrice, at) => ({
  id: "o" + Math.random().toString(36).slice(2, 9),
  collectorId, cardId, invId,
  stage: "agree-price",
  listedPrice,
  priceThread: [],          // {by:'collector'|'tp', type:'offer'|'counter'|'accept'|'decline', amount, at}
  agreedPrice: null,
  trade: null,              // {mode:'cash'|'trade', cards:[tradeCard]}
  tradeRate: PARTNER.tradeRate,   // the TP's DEFAULT opening % proposal, snapshot at offer
                                  // time. Never the agreed rate — that is per card.
  deal: emptyDeal(),
  fulfillment: emptyFulfillment(),
  completedAt: null,
  updated: at,
});

const lastEntry = (thread) => thread[thread.length - 1] || null;

/* One card inside a trade. It survives the whole lifecycle: same id, same photos,
   same binder link, from the moment the collector proposes it to the deal summary.

   Two independent axes, deliberately not one enum:
     inclusion  — is the TP willing to take this card at all?  (Select Trade)
     economics  — what is it worth and what credit does it earn? (Value Trade)
   Everything about the economic phase is DERIVED from the structured fields below
   via cardPhase(); there is no second synchronised state to drift. */
const emptyTradeCard = (cardId, photos, cert, binderId) => ({
  id: "tc" + cardId + "-" + Math.random().toString(36).slice(2, 7),  // stable across stages
  cardId,
  binderId: binderId || null,     // link back to the collector's binder copy
  inclusion: "proposed",           // proposed | accepted | rejected   (TP-owned, Select Trade)
  reviewedAt: null,                // when the TP made the inclusion decision
  withdrawn: false,                // collector pulled it over economics (Value Trade)
  withdrawnAt: null,
  collectorMarket: null,           // collector's current market position
  tpMarket: null,                  // TP's current market position
  agreedMarket: null,              // OUTPUT only — never typed directly
  valueThread: [],                 // {by, type:'propose'|'accept', amount, at}
  collectorPercent: null,          // collector's current % position
  tpPercent: null,                 // TP's current % position
  agreedPercent: null,             // OUTPUT only — never typed directly
  percentThread: [],               // {by, type:'propose'|'accept', percent, at}
  cert: cert || null,
  photos: photos || { front: null, back: null },
});

/* ---- card selectors. Names say exactly what they mean. ---------------------- */
/* The cards array is the historical record and is never gated on mode: an
   all-rejected package becomes cash-only but must still show what was proposed. */
const tradeCards = (opp) => opp.trade?.cards || [];
const proposedCards = (opp) => tradeCards(opp).filter((c) => c.inclusion === "proposed");
const rejectedCards = (opp) => tradeCards(opp).filter((c) => c.inclusion === "rejected");
const includedCards = (opp) => tradeCards(opp).filter((c) => c.inclusion === "accepted");
const withdrawnCards = (opp) => includedCards(opp).filter((c) => c.withdrawn);
// the rows Value Trade is actually still working on
const activeTradeCards = (opp) => includedCards(opp).filter((c) => !c.withdrawn);
const marketAgreed = (tc) => tc.agreedMarket != null;
const fullyAgreed = (tc) => tc.agreedMarket != null && tc.agreedPercent != null;
// the rows that carry economics into the deal
const settledCards = (opp) => activeTradeCards(opp).filter(fullyAgreed);

/* ---- economic phase, derived ------------------------------------------------ */
const PHASE = {
  rejected: "rejected", withdrawn: "withdrawn",
  inclusion: "inclusion", market: "market", percent: "percent", settled: "settled",
};
function cardPhase(tc) {
  if (tc.inclusion === "rejected") return PHASE.rejected;
  if (tc.withdrawn) return PHASE.withdrawn;
  if (tc.inclusion === "proposed") return PHASE.inclusion;
  if (!marketAgreed(tc)) return PHASE.market;
  if (tc.agreedPercent == null) return PHASE.percent;
  return PHASE.settled;
}

/* Whose turn is it on this row, and what is the action? Derived, never stored. */
function cardOwner(tc) {
  switch (cardPhase(tc)) {
    case PHASE.rejected:  return { owner: null, label: "Rejected", tone: "gone" };
    case PHASE.withdrawn: return { owner: null, label: "Withdrawn", tone: "gone" };
    case PHASE.inclusion: return { owner: "tp", label: "Review card", tone: "tp" };
    case PHASE.market: {
      if (tc.collectorMarket == null) return { owner: "collector", label: "Propose market", tone: "collector" };
      const last = lastEntry(tc.valueThread);
      return last && last.by === "tp"
        ? { owner: "collector", label: "Review market", tone: "collector" }
        : { owner: "tp", label: "Review market", tone: "tp" };
    }
    case PHASE.percent: {
      if (tc.tpPercent == null) return { owner: "tp", label: "Propose trade %", tone: "tp" };
      const last = lastEntry(tc.percentThread);
      return last && last.by === "tp"
        ? { owner: "collector", label: "Review trade %", tone: "collector" }
        : { owner: "tp", label: "Review trade %", tone: "tp" };
    }
    default: return { owner: null, label: "Agreed", tone: "ok" };
  }
}

/* ---- stage gates ------------------------------------------------------------ */
/* Inclusion only. Market value and photos play no part in this gate. */
const selectTradeSettled = (opp) =>
  !!opp.trade?.submitted && proposedCards(opp).length === 0 && includedCards(opp).length > 0;
/* Every included card must be fully agreed or withdrawn — market alone is not enough. */
const valueTradeSettled = (opp) => {
  const active = activeTradeCards(opp);
  return includedCards(opp).length > 0 && active.every(fullyAgreed);
};
/* Archived: closed without completing. Distinct from Completed, and out of the
   active funnel entirely — it must not feed any active stage's counts. */
const isArchived = (opp) => !!opp.declined;
const isTerminal = (opp) => opp.stage === "completed" || isArchived(opp);
const isActive = (opp) => !isTerminal(opp);

const allWithdrawn = (opp) => includedCards(opp).length > 0 && activeTradeCards(opp).length === 0;

/* ---- pure transitions. The component handlers and the tests call these same
   functions, so what is verified is what runs. ------------------------------- */
const tcReviewInclusion = (tc, action, at) =>
  action === "accept"
    ? { ...tc, inclusion: "accepted", reviewedAt: at }
    : { ...tc, inclusion: "rejected", reviewedAt: at };

/* Market. `agreedMarket` is only ever written by one side accepting the other's
   standing position, so it cannot be typed in directly. Locked once agreed. */
function tcApplyMarket(tc, by, action, amount, at) {
  if (marketAgreed(tc)) return tc;                       // market is closed
  if (action === "accept") {
    const other = by === "tp" ? tc.collectorMarket : tc.tpMarket;
    if (other == null) return tc;
    return { ...tc, agreedMarket: other,
      ...(by === "tp" ? { tpMarket: other } : { collectorMarket: other }),
      valueThread: [...tc.valueThread, { by, type: "accept", amount: other, at }] };
  }
  if (!(amount > 0)) return tc;
  return { ...tc,
    ...(by === "tp" ? { tpMarket: amount } : { collectorMarket: amount }),
    valueThread: [...tc.valueThread, { by, type: "propose", amount, at }] };
}

/* Percentage. Cannot open before the market is agreed. TP moves first. */
function tcApplyPercent(tc, by, action, percent, at) {
  if (!marketAgreed(tc) || tc.agreedPercent != null || tc.withdrawn) return tc;
  if (by === "tp" && tc.tpPercent == null && action !== "propose") return tc;
  if (by === "collector" && tc.tpPercent == null) return tc;   // TP opens this phase
  if (action === "accept") {
    const other = by === "tp" ? tc.collectorPercent : tc.tpPercent;
    if (other == null) return tc;
    return { ...tc, agreedPercent: other,
      ...(by === "tp" ? { tpPercent: other } : { collectorPercent: other }),
      percentThread: [...tc.percentThread, { by, type: "accept", percent: other, at }] };
  }
  if (!(percent > 0) || percent > 1) return tc;
  return { ...tc,
    ...(by === "tp" ? { tpPercent: percent } : { collectorPercent: percent }),
    percentThread: [...tc.percentThread, { by, type: "propose", percent, at }] };
}

/* Deal adjustment negotiation. Same shape as market and percentage: one standing
   position per side, agreement only through acceptance, agreed value is output-only.
   Either party may open it. */
function dealApplyAdj(deal, by, action, amount, at) {
  if (deal.agreedAdj != null) return deal;                 // locked once agreed
  if (action === "accept") {
    const other = by === "tp" ? deal.collectorAdj : deal.tpAdj;
    if (other == null) return deal;
    return { ...deal, agreedAdj: other,
      ...(by === "tp" ? { tpAdj: other } : { collectorAdj: other }),
      adjThread: [...deal.adjThread, { by, type: "accept", amount: other, at }],
      // a newly assembled deal must be confirmed again by both sides
      tpAgreed: false, collectorAgreed: false };
  }
  if (typeof amount !== "number" || !isFinite(amount) || amount === 0) return deal;
  return { ...deal,
    ...(by === "tp" ? { tpAdj: amount } : { collectorAdj: amount }),
    adjThread: [...deal.adjThread, { by, type: "propose", amount, at }],
    tpAgreed: false, collectorAgreed: false };   // proposal invalidates confirmations only
}
const adjOpen = (deal) => deal.agreedAdj == null && deal.adjThread.length > 0;

const tcWithdraw = (tc, at) => (tc.inclusion === "accepted" && !tc.withdrawn ? { ...tc, withdrawn: true, withdrawnAt: at } : tc);

/* ---- money. Trade credit requires BOTH agreed terms. There is no fallback to
   the partner default: an unagreed percentage means unresolved credit. -------- */
const creditFor = (tc) => (fullyAgreed(tc) ? Math.round(tc.agreedMarket * tc.agreedPercent) : null);
const totalCredit = (opp) => settledCards(opp).reduce((a, c) => a + creditFor(c), 0);
const oppValue = (o) => (o.agreedPrice != null ? o.agreedPrice : o.listedPrice);
/* ONE source of truth for cash direction. Sign convention, stated once:
     positive  => the collector owes the TP
     negative  => the TP owes the collector
     zero      => nothing changes hands
   `adjustment` is added to the base, so a collector concession request on a
   collector-owes balance is a NEGATIVE adjustment. The UI never renders the sign;
   it renders payer -> recipient and an absolute amount. */
const baseCash = (opp) => (opp.agreedPrice == null ? null : opp.agreedPrice - totalCredit(opp));
const agreedAdjustment = (opp) => opp.deal?.agreedAdj ?? 0;
const cashBalance = (opp) => {
  const base = baseCash(opp);
  if (base == null) return null;
  const net = base + agreedAdjustment(opp);
  return {
    base, adjustment: agreedAdjustment(opp), net,
    amount: Math.abs(net),
    payer: net > 0 ? "collector" : net < 0 ? "tp" : null,
    recipient: net > 0 ? "tp" : net < 0 ? "collector" : null,
    zero: net === 0,
  };
};
/* Rendered wherever a cash figure appears. Never exposes a negative number. */
const cashLabel = (opp, collectorShort) => {
  const c = cashBalance(opp);
  if (!c) return "—";
  if (c.zero) return "No cash balance";
  return c.payer === "collector"
    ? `${collectorShort} pays you — ${money(c.amount)}`
    : `You pay ${collectorShort} — ${money(c.amount)}`;
};
// retained for callers that only need the signed figure
const remainingCash = (opp) => { const c = cashBalance(opp); return c ? c.net : null; };
const pct = (p) => (p == null ? "—" : Math.round(p * 1000) / 10 + "%");

const countersBy = (thread, who) => thread.filter((e) => e.by === who && e.type === "counter").length;
/* Agree on Price only: an offer read as a share of the card's listed price, which is
   how Trusted Partners talk about buying ("I want to be in around 80%"). It is
   derived on every render and never stored, and it is NOT the Value Trade trade
   percentage — that is a different concept applied to a different base.
   A missing or non-positive listed price yields null rather than NaN or Infinity. */
const pctOfListed = (amount, listed) => {
  const a = Number(amount), l = Number(listed);
  if (amount === "" || amount == null || !isFinite(a)) return null;
  if (!isFinite(l) || l <= 0) return null;
  return Math.round((a / l) * 100);
};
/* The inverse, rounded to whole dollars because this workflow prices in whole
   dollars everywhere else. Returns null rather than a broken amount. */
const amountFromPct = (pct, listed) => {
  const p = Number(pct), l = Number(listed);
  if (pct === "" || pct == null || !isFinite(p) || p < 0) return null;
  if (!isFinite(l) || l <= 0) return null;
  return Math.round((l * p) / 100);
};
const pctLabel = (amount, listed) => {
  const p = pctOfListed(amount, listed);
  return p == null ? null : p + "%";
};

const canCounter = (thread, who) => COUNTER_LIMIT === null || countersBy(thread, who) < COUNTER_LIMIT;

/* ==================== INVENTORY COVERAGE ====================
   How well does what I hold serve the network I actually have?

   Every active inventory item receives EXACTLY ONE classification, applied in
   descending strength: Deal Flow > Primary Goal > Secondary Goal > Age >
   Preference > Unaligned. An item that matches several collectors or goals shows
   those relationships when a layer is expanded, but it is counted once, so the
   headline numbers sum to the inventory and never overstate coverage.

   Matching reuses identityKey() — the same exact-identity rule used by the goal
   tables, Inventory Match and Opportunities. There is no second matcher. */

/* The only aging boundary already established in the product is ago()'s switch
   from days to months at 60. Reused rather than inventing a holding-period policy. */
const AGE_DAYS = 60;

const COVERAGE_LAYERS = [
  { id: "deal", label: "Deal Flow", q: "Connected to an active opportunity.",
    help: "These items are already tied to collector activity." },
  { id: "primary", label: "Primary Goals", q: "What collectors are actively looking for.",
    help: "Items in active deals are counted above." },
  { id: "secondary", label: "Secondary Goals", q: "Relevant to collectors’ secondary goals.",
    help: "Matches a collector's secondary goal." },
  { id: "aging", label: "Age", q: "Held for more than 60 days.",
    help: "Older inventory without a stronger collector signal." },
  { id: "preference", label: "Preferences", q: "Relevant to stated collector preferences.",
    help: "Matches interests beyond specific goals." },
];

function inventoryCoverage({ activeInv, opps, goals, collectors, cardById, today }) {
  const keyOf = (i) => identityKey(cardById(i.cardId));
  const claimed = new Map();                       // invId -> {layer, why}
  const claim = (inv, layer, why) => { if (!claimed.has(inv.invId)) claimed.set(inv.invId, { layer, why }); };

  /* ---- 1. Deal Flow ----
     Opportunities created in-app bind an invId. Seeded ones predate that field, so
     they are attached to specific copies one-per-opportunity instead of by card,
     which would otherwise mark all three Charizard copies as working when two are. */
  const live = opps.filter((o) => isActive(o) && o.stage !== "completed");
  const dealItems = [];
  const takenIds = new Set();
  const byCard = {};
  for (const i of activeInv) (byCard[i.cardId] ||= []).push(i);
  Object.values(byCard).forEach((l) => l.sort((a, b) => String(a.invId).localeCompare(String(b.invId))));
  for (const o of live) {
    let inv = o.invId ? activeInv.find((i) => i.invId === o.invId) : null;
    if (!inv || takenIds.has(inv.invId)) inv = (byCard[o.cardId] || []).find((i) => !takenIds.has(i.invId));
    if (!inv) continue;                            // more opportunities than copies held
    takenIds.add(inv.invId);
    dealItems.push({ inv, opp: o });
    claim(inv, "deal", o);
  }

  /* ---- 2 & 3. Goal coverage on what remains ---- */
  const goalsFor = (inv, tier) => {
    const k = keyOf(inv);
    return goals.filter((g) => g.tier === tier && identityKey(cardById(g.cardId)) === k);
  };
  const tierItems = (tier) => activeInv
    .filter((i) => !claimed.has(i.invId))
    .map((inv) => ({ inv, goals: goalsFor(inv, tier) }))
    .filter((r) => r.goals.length > 0);
  const primaryItems = tierItems("primary");
  primaryItems.forEach((r) => claim(r.inv, "primary", r.goals));
  /* Presentation only. Deal Flow legitimately claims primary-goal inventory first,
     which makes the exclusive Primary count read low at a glance. Reporting the
     overlap alongside it explains the number without disturbing `claimed`: these
     items stay exclusively in Deal Flow and never enter the Primary item list. */
  const primaryInDealFlow = dealItems.filter((d) => goalsFor(d.inv, "primary").length > 0);
  const secondaryItems = tierItems("secondary");
  secondaryItems.forEach((r) => claim(r.inv, "secondary", r.goals));

  /* ---- 4. Age ---- Only what no stronger signal already explains. */
  const agingItems = activeInv
    .filter((i) => !claimed.has(i.invId))
    .map((inv) => ({ inv, days: Math.round((today - new Date(inv.acquired + "T12:00:00")) / 86400000) }))
    .filter((r) => r.days > AGE_DAYS)
    .sort((a, b) => b.days - a.days);
  agingItems.forEach((r) => claim(r.inv, "aging", r.days));

  /* ---- 5. Preferences ---- The weakest signal, so it sees only the remainder. */
  const prefItems = activeInv
    .filter((i) => !claimed.has(i.invId))
    .map((inv) => {
      const c = cardById(inv.cardId);
      const who = collectors
        .map((col) => ({ collector: col, tags: c.tags.filter((t) => col.prefs.includes(t)) }))
        .filter((x) => x.tags.length > 0);
      return { inv, who };
    })
    .filter((r) => r.who.length > 0);
  prefItems.forEach((r) => claim(r.inv, "preference", r.who));

  const unaligned = activeInv.filter((i) => !claimed.has(i.invId));

  /* ---- supporting context per layer, computed from the claimed items only ---- */
  const collectorsIn = (ids) => new Set(ids).size;
  const total = activeInv.length;
  const share = (n) => (total ? n / total : 0);

  const layers = {
    deal: { items: dealItems, count: dealItems.length, share: share(dealItems.length),
      collectors: collectorsIn(dealItems.map((d) => d.opp.collectorId)),
      opportunities: dealItems.length },
    primary: { items: primaryItems, count: primaryItems.length, share: share(primaryItems.length),
      available: primaryItems.length,
      inDealFlow: primaryInDealFlow.length,
      alignedTotal: primaryItems.length + primaryInDealFlow.length,
      goals: new Set(primaryItems.flatMap((r) => r.goals.map((g) => g.id))).size,
      collectors: collectorsIn(primaryItems.flatMap((r) => r.goals.map((g) => g.collectorId))) },
    secondary: { items: secondaryItems, count: secondaryItems.length, share: share(secondaryItems.length),
      goals: new Set(secondaryItems.flatMap((r) => r.goals.map((g) => g.id))).size,
      collectors: collectorsIn(secondaryItems.flatMap((r) => r.goals.map((g) => g.collectorId))) },
    aging: { items: agingItems, count: agingItems.length, share: share(agingItems.length),
      oldest: agingItems.length ? agingItems[0].days : 0, threshold: AGE_DAYS },
    preference: { items: prefItems, count: prefItems.length, share: share(prefItems.length),
      collectors: collectorsIn(prefItems.flatMap((r) => r.who.map((w) => w.collector.id))) },
  };

  /* Primary/secondary goals that no held copy answers — stated as the honest
     counterweight to the coverage figures, without recommending anything. */
  const invKeys = new Set(activeInv.map(keyOf));
  const uncoveredPrimary = goals.filter((g) => g.tier === "primary" && !invKeys.has(identityKey(cardById(g.cardId))));

  return { layers, unaligned, total, uncoveredPrimary, AGE_DAYS,
    connected: dealItems.length + primaryItems.length + secondaryItems.length };
}

/* ==================== YOUR NETWORK ====================
   Buying context: when the exact recommended card isn't on the table, what kinds of
   inventory does this network actually want?

   Counting rule for every dimension: DISTINCT COLLECTORS. One collector with three
   Charizard goals is one collector, not three. Raw goal counts are kept alongside as
   supporting detail but never drive the ordering, and no signal is weighted against
   another — there is no synthetic score.

   Signal source: primary + secondary goals. Preferences are deliberately excluded —
   they are expressed in the tag vocabulary, not in card identity, so they cannot be
   attributed to a specific name, set or grade without inventing a mapping.

   ERA IS NOT DERIVED. Cards carry `year`, but the product defines no year->era rule
   and no era field, so any boundary would be invented here. Omitted by design. */

const networkTally = (goals, cardById, keyOf) => {
  const m = new Map();
  for (const g of goals) {
    const c = cardById(g.cardId);
    if (!c) continue;
    const k = keyOf(c);
    if (k == null) continue;                       // not classifiable — never bucketed
    const e = m.get(k) || { key: k, collectors: new Set(), goals: 0, primary: 0 };
    e.collectors.add(g.collectorId);
    e.goals++;
    if (g.tier === "primary") e.primary++;
    m.set(k, e);
  }
  return [...m.values()]
    .map((e) => ({ key: e.key, collectors: e.collectors.size, goals: e.goals, primary: e.primary }))
    .sort((a, b) => b.collectors - a.collectors || b.primary - a.primary || a.key.localeCompare(b.key));
};

function networkProfile({ goals, cardById }) {
  /* Sealed product and Trainer cards are excluded from the character view using the
     `sealed` and `trainer` tags the product already assigns — not by recognising
     names. Card name is the finest character signal available: there is no
     character/supertype field, so "Dark Charizard" and "Charizard" stay distinct. */
  const isPokemonCard = (c) => !c.tags.includes("sealed") && !c.tags.includes("trainer");

  const pokemon = networkTally(goals, cardById, (c) => (isPokemonCard(c) ? c.name : null));
  const sets = networkTally(goals, cardById, (c) => c.set);
  // Raw vs graded comes from isRaw(), the same rule inventory matching uses.
  const format = networkTally(goals, cardById, (c) =>
    GRADED_VALUES.includes(c.grade) ? (isRaw(c) ? "Raw" : "Graded") : null);
  // Grade keeps the full company + grade string; PSA 10 and BGS 10 would stay distinct.
  const grade = networkTally(goals, cardById, (c) => (!isRaw(c) && GRADED_VALUES.includes(c.grade) ? c.grade : null));

  // goals whose grade value sits outside the product's vocabulary: reported, never bucketed
  const unclassifiedFormat = goals.filter((g) => {
    const c = cardById(g.cardId);
    return c && !GRADED_VALUES.includes(c.grade);
  }).length;

  /* No formatReach / denominator is exported. Raw and Graded overlap at the collector
     level, so any percentage would need a denominator that does not exist. The counts
     stand on their own. */
  return { pokemon, sets, format, grade, unclassifiedFormat, era: null };
}

/* ==================== NETWORK INTELLIGENCE ====================
   Everything here is knowable only by comparing TP INVENTORY x COLLECTOR GOALS.
   Nothing is read from market data, and no composite "score" is invented: the
   ranking is an ordered comparison of real signals, each of which is shown.

   Matching reuses identityKey() — the same exact-identity rule the goal tables,
   inventory match column and Opportunities use. There is no second matcher. */
function networkIntelligence({ goals, collectors, activeInv, cardById, prefInterest }) {
  const invKeys = new Set(activeInv.map((i) => identityKey(cardById(i.cardId))));
  const isCovered = (g) => invKeys.has(identityKey(cardById(g.cardId)));

  /* ---- MEASURE ---- */
  const covered = goals.filter(isCovered);
  const uncovered = goals.filter((g) => !isCovered(g));
  const prim = goals.filter((g) => g.tier === "primary");
  const sec = goals.filter((g) => g.tier === "secondary");
  const served = collectors.filter((c) => goals.some((g) => g.collectorId === c.id && isCovered(g)));
  const underserved = collectors
    .map((c) => {
      const mine = goals.filter((g) => g.collectorId === c.id);
      const hit = mine.filter(isCovered);
      return { collector: c, goals: mine.length, covered: hit.length,
        primaryGap: mine.filter((g) => g.tier === "primary" && !isCovered(g)).length };
    })
    .filter((r) => r.goals > 0 && r.covered < r.goals)
    .sort((a, b) => b.primaryGap - a.primaryGap
      || (b.goals - b.covered) - (a.goals - a.covered)
      || (a.covered / a.goals) - (b.covered / b.goals));
  // inventory that answers no expressed goal at all
  const goalKeys = new Set(goals.map((g) => identityKey(cardById(g.cardId))));
  const relevant = activeInv.filter((i) => goalKeys.has(identityKey(cardById(i.cardId))));
  const idle = activeInv.filter((i) => !goalKeys.has(identityKey(cardById(i.cardId))));

  const rate = (a, b) => (b ? a / b : 0);
  const measure = {
    goals: goals.length, covered: covered.length, coverage: rate(covered.length, goals.length),
    primary: prim.length, primaryCovered: prim.filter(isCovered).length,
    primaryCoverage: rate(prim.filter(isCovered).length, prim.length),
    secondary: sec.length, secondaryCovered: sec.filter(isCovered).length,
    secondaryCoverage: rate(sec.filter(isCovered).length, sec.length),
    collectors: collectors.length, served: served.length,
    inventory: activeInv.length, relevant: relevant.length,
    relevance: rate(relevant.length, activeInv.length), idle, underserved,
  };

  /* ---- DIAGNOSE ----
     Collector preferences and card attributes share one vocabulary, so a tag is
     the only axis on which demand from DIFFERENT collectors can be compared. A tag
     becomes a reported gap only when at least two collectors have an uncovered goal
     in it (one collector's want is not a network pattern) and its coverage sits
     below the network's own average. Both thresholds are stated, not hidden. */
  const MIN_COLLECTORS = 2;
  const byTag = {};
  for (const g of goals) {
    const c = cardById(g.cardId), hit = isCovered(g);
    for (const t of c.tags) {
      const r = (byTag[t] ||= { tag: t, goals: 0, covered: 0, collectors: new Set(),
        unmetCollectors: new Set(), cards: new Set(), unmetPrimary: 0 });
      r.goals++; r.collectors.add(g.collectorId);
      if (hit) r.covered++;
      else { r.unmetCollectors.add(g.collectorId); r.cards.add(g.cardId);
        if (g.tier === "primary") r.unmetPrimary++; }
    }
  }
  const clusters = Object.values(byTag).map((r) => ({
    tag: r.tag, goals: r.goals, covered: r.covered, gap: r.goals - r.covered,
    coverage: rate(r.covered, r.goals), collectors: r.collectors.size,
    unmetCollectors: r.unmetCollectors.size, unmetPrimary: r.unmetPrimary,
    cards: [...r.cards], cardCount: r.cards.size,
  }));
  /* Ordered by severity — worst coverage first — not by raw volume. A frequent
     attribute sitting a point or two under the average is technically a gap but is
     not the story; an attribute seven collectors want and you can barely supply is. */
  const gaps = clusters
    .filter((c) => c.unmetCollectors >= MIN_COLLECTORS && c.coverage < measure.coverage)
    .sort((a, b) => a.coverage - b.coverage || b.unmetCollectors - a.unmetCollectors || b.unmetPrimary - a.unmetPrimary);
  // the honest counterweight: where the same comparison says you are well positioned
  const strengths = clusters
    .filter((c) => c.collectors >= MIN_COLLECTORS && c.coverage >= measure.coverage && c.goals >= 4)
    .sort((a, b) => b.coverage - a.coverage || b.collectors - a.collectors);

  /* ---- RECOMMEND ----
     Ranked by an explicit ordered comparison of observable signals, most decisive
     first. No weights, no composite number: every signal is displayed, so the
     ordering is reproducible by eye. */
  const RANK_BASIS = ["collectors reached", "primary goals", "secondary goals", "preference fit"];
  const pursue = [...new Set(uncovered.map((g) => g.cardId))].map((id) => {
    const c = cardById(id);
    const gs = goals.filter((g) => g.cardId === id);
    const p = gs.filter((g) => g.tier === "primary");
    const s = gs.filter((g) => g.tier === "secondary");
    const goalCollectors = [...new Set(gs.map((g) => g.collectorId))];
    const pref = (prefInterest[id] || []).filter((x) => !goalCollectors.includes(x.collectorId));
    // which reported gaps this card would move
    const closes = gaps.filter((gp) => c.tags.includes(gp.tag)).map((gp) => gp.tag);
    return { card: c, primary: p, secondary: s, goalCollectors, pref, closes,
      reach: goalCollectors.length + pref.length };
  }).sort((a, b) =>
    b.goalCollectors.length - a.goalCollectors.length ||
    b.primary.length - a.primary.length ||
    b.secondary.length - a.secondary.length ||
    b.pref.length - a.pref.length ||
    a.card.name.localeCompare(b.card.name));

  return { measure, gaps, strengths, pursue, thresholds: { MIN_COLLECTORS }, RANK_BASIS };
}

/* Whose turn is it, and what can they do? Derived, never stored. */
function nextAction(opp) {
  if (isArchived(opp)) return { owner: null, label: "Archived — closed without completing" };
  switch (opp.stage) {
    case "secondary":
      return { owner: "collector", label: "Collector to promote to Primary Goal" };
    case "primary":
      return { owner: "collector", label: "Collector to make an offer" };
    case "agree-price": {
      const last = lastEntry(opp.priceThread);
      if (!last) return { owner: "collector", label: "Collector to make an offer" };
      return last.by === "collector"
        ? { owner: "tp", label: "You: accept or counter their offer" }
        : { owner: "collector", label: "Collector to accept or counter" };
    }
    case "select-trade": {
      const cards = tradeCards(opp);
      if (!cards.length) return { owner: "collector", label: "Collector to add trade cards or choose cash" };
      if (!opp.trade.submitted) return { owner: "collector", label: `Collector assembling package · ${cards.length} card${cards.length === 1 ? "" : "s"}` };
      const unreviewed = proposedCards(opp).length;
      if (unreviewed) return { owner: "tp", label: `You: accept or reject ${unreviewed} proposed card${unreviewed === 1 ? "" : "s"}` };
      return includedCards(opp).length
        ? { owner: null, label: "Package settled" }
        : { owner: "collector", label: "Every card rejected — collector to re-propose or choose cash" };
    }
    case "value-trade": {
      if (allWithdrawn(opp)) return { owner: "collector", label: "Collector to continue as cash only or stop pursuing" };
      const active = activeTradeCards(opp);
      const settled = active.filter(fullyAgreed).length;
      const mine = active.filter((c) => cardOwner(c).owner === "tp");
      if (mine.length) {
        const m = mine.filter((c) => cardPhase(c) === PHASE.market).length;
        return { owner: "tp", label: m
          ? `You: review market on ${m} card${m === 1 ? "" : "s"} · ${settled} of ${active.length} settled`
          : `You: trade % on ${mine.length} card${mine.length === 1 ? "" : "s"} · ${settled} of ${active.length} settled` };
      }
      return { owner: "collector", label: `Collector to respond · ${settled} of ${active.length} settled` };
    }
    case "deal": {
      const d = opp.deal;
      if (adjOpen(d)) {
        const last = lastEntry(d.adjThread);
        return last.by === "collector"
          ? { owner: "tp", label: "You: accept or counter the cash adjustment" }
          : { owner: "collector", label: "Collector to accept or counter the cash adjustment" };
      }
      if (!d.tpAgreed) return { owner: "tp", label: "You: agree to the deal as assembled" };
      if (!d.collectorAgreed) return { owner: "collector", label: "Collector to agree to the deal" };
      return { owner: null, label: "Both agreed" };
    }
    case "fulfillment": {
      const f = opp.fulfillment;
      if (f.revisionRequested) return { owner: "tp", label: "You: revise the fulfillment plan" };
      if (!planProposed(f)) return { owner: "tp", label: "You: propose a fulfillment plan" };
      if (!f.collectorConfirmedPlan) return { owner: "collector", label: "Collector to confirm the fulfillment plan" };
      if (!f.tpHandoff) return { owner: "tp", label: `You: confirm handoff — ${fulfillmentSummary(f)}` };
      if (!f.collectorReceipt) return { owner: "collector", label: "Collector to confirm receipt" };
      return { owner: null, label: "Both confirmed" };
    }
    case "completed":
      return { owner: null, label: "Completed" };
    default:
      return { owner: "collector", label: "Collector-owned" };
  }
}

/* Expands the seed tuples into full lifecycle records with structured state
   consistent with the stage each one is parked at. */
function buildOpps(seed) {
  const binder = (cid) => COLLECTOR_CARDS_SEED.filter((r) => r[1] === cid && r[2] && r[4].front && r[3] != null);
  const eligible = (cid) => binder(cid).map((r) => r[0]);
  const binderRow = (id) => COLLECTOR_CARDS_SEED.find((r) => r[0] === id);
  const val = (id) => CARDS_SEED.find((c) => c.id === id)?.value || 0;

  return seed.map((t, i) => {
    const [collectorId, cardId, stage, at, listed] = t;
    const o = { ...emptyOpp(collectorId, cardId, null, listed, at), id: "o" + i, stage, updated: at };
    const offer = Math.round(listed * 0.88);
    const settled = Math.round(listed * 0.95);

    if (stage === "agree-price") {
      o.priceThread = [{ by: "collector", type: "offer", amount: offer, at }];
      // some already have a TP counter sitting with the collector, so the stage
      // shows both sides of the negotiation rather than one uniform block
      if (i % 2 === 1) o.priceThread.push({ by: "tp", type: "counter", amount: Math.round(listed * 0.96), at });
    } else {
      o.priceThread = [
        { by: "collector", type: "offer", amount: offer, at },
        { by: "tp", type: "counter", amount: settled, at },
        { by: "collector", type: "accept", amount: settled, at },
      ];
      o.agreedPrice = settled;
    }

    if (stage === "select-trade") {
      /* Inclusion-only. Rotating so the seed shows all three inclusion states:
         some packages still drafting, some under review, some part-reviewed. */
      const ids = eligible(collectorId).slice(0, 3);
      const withoutPhotos = COLLECTOR_CARDS_SEED.filter((r) => r[1] === collectorId && r[2] && !r[4].front).map((r) => r[0]);
      const all = [...new Set([...ids, ...withoutPhotos.slice(0, 1)])];
      const submitted = i % 3 !== 0;                 // one in three is still a collector draft
      o.trade = all.length
        ? { mode: "trade", submitted, cards: all.map((id, k) => {
            const b = binderRow(id);
            const tc = emptyTradeCard(id, b[4], b[5], id);
            // the last row always stays awaiting review so the stage never
            // seeds in an already-settled state it should have advanced out of
            if (submitted && k < all.length - 1) {
              tc.inclusion = (k + i) % 3 === 1 ? "rejected" : "accepted";
              tc.reviewedAt = at;
            }
            return tc;
          }) }
        : null;
    }

    if (["value-trade", "deal", "fulfillment", "completed"].includes(stage)) {
      // keep seeded credit under the agreed price so no demo deal starts negative
      const budget = o.agreedPrice * 0.7;
      const cap = stage === "value-trade" ? 5 : 3;
      let used = 0;
      const ids = [];
      for (const id of eligible(collectorId)) {
        const credit = Math.round(Math.round(binderRow(id)[3] * 0.9) * PARTNER.tradeRate);
        if (used + credit <= budget && ids.length < cap) { ids.push(id); used += credit; }
      }
      if (!ids.length && stage === "value-trade") {
        const cheapest = eligible(collectorId).slice().sort((a, b) => binderRow(a)[3] - binderRow(b)[3])[0];
        if (cheapest) ids.push(cheapest);
      }

      if (!ids.length) {
        o.trade = { mode: "cash", submitted: true, cards: [] };
      } else if (stage === "value-trade") {
        /* Every reachable Value Trade state, in order, so each is testable:
             0 waiting on collector market   1 waiting on TP market response
             2 waiting on collector market    3 market agreed, waiting on TP %
             4 waiting on collector %         5 collector countered %, waiting on TP
             6 collector withdrew over the economics */
        o.trade = { mode: "trade", submitted: true, cards: ids.map((id, k) => {
          const b = binderRow(id);
          const tc = emptyTradeCard(id, b[4], b[5], id);
          tc.inclusion = "accepted"; tc.reviewedAt = at;
          const ask = b[3];
          const slot = (k + i) % 7;
          if (slot >= 1) {                                        // collector has opened market
            tc.collectorMarket = ask;
            tc.valueThread.push({ by: "collector", type: "propose", amount: ask, at });
          }
          if (slot >= 2) {                                        // TP countered
            tc.tpMarket = Math.round(ask * 0.88);
            tc.valueThread.push({ by: "tp", type: "propose", amount: tc.tpMarket, at });
          }
          if (slot >= 3) {                                        // collector accepted -> agreed
            tc.agreedMarket = tc.tpMarket; tc.collectorMarket = tc.tpMarket;
            tc.valueThread.push({ by: "collector", type: "accept", amount: tc.tpMarket, at });
          }
          if (slot >= 4) {                                        // TP opened percentage
            tc.tpPercent = PARTNER.tradeRate;
            tc.percentThread.push({ by: "tp", type: "propose", percent: tc.tpPercent, at });
          }
          if (slot >= 5) {                                        // collector countered the %
            tc.collectorPercent = 0.86;
            tc.percentThread.push({ by: "collector", type: "propose", percent: 0.86, at });
          }
          if (slot === 6) { tc.withdrawn = true; tc.withdrawnAt = at; }   // kept the card instead
          return tc;
        }) };
      } else {
        /* Fully settled packages. Percentages deliberately differ per card, which
           is only possible now that percentage is negotiated per card. */
        const rates = [0.8, 0.75, 0.82];
        o.trade = { mode: "trade", submitted: true, cards: ids.map((id, k) => {
          const b = binderRow(id);
          const v = Math.round(b[3] * 0.9);
          const r = rates[(k + i) % rates.length];
          const tc = emptyTradeCard(id, b[4], b[5], id);
          tc.inclusion = "accepted"; tc.reviewedAt = at;
          tc.collectorMarket = v; tc.tpMarket = v; tc.agreedMarket = v;
          tc.valueThread = [
            { by: "collector", type: "propose", amount: b[3], at },
            { by: "tp", type: "propose", amount: v, at },
            { by: "collector", type: "accept", amount: v, at },
          ];
          tc.tpPercent = r; tc.collectorPercent = r; tc.agreedPercent = r;
          tc.percentThread = [
            { by: "tp", type: "propose", percent: PARTNER.tradeRate, at },
            ...(r !== PARTNER.tradeRate ? [{ by: "collector", type: "propose", percent: r, at }] : []),
            { by: r !== PARTNER.tradeRate ? "tp" : "collector", type: "accept", percent: r, at },
          ];
          return tc;
        }) };
      }
    }

    if (stage === "deal" && i % 3 === 0) o.deal = { ...emptyDeal(), tpAgreed: true };
    if (["fulfillment", "completed"].includes(stage)) o.deal = { ...emptyDeal(), collectorAgreed: true, tpAgreed: true };
    if (stage === "fulfillment") {
      /* three coordination states so every ownership branch is testable:
         A no plan yet · B TP proposed, awaiting collector · C agreed, awaiting handoff */
      const slot = i % 3;
      if (slot === 1) {
        o.fulfillment = { ...emptyFulfillment(), method: "show", show: "Twin Cities Card Show",
          date: "2026-09-12", note: "Find me at table 214", proposedAt: at };
      } else if (slot === 2) {
        o.fulfillment = { ...emptyFulfillment(), method: "meetup", date: "2026-09-08", time: "18:00",
          location: "Dreamers Vault — Minneapolis", note: "Meet near the front counter",
          proposedAt: at, collectorConfirmedPlan: true };
      }
      // slot 0 keeps the empty fulfillment from emptyOpp — nothing proposed yet
    }
    if (stage === "completed") {
      o.fulfillment = { ...emptyFulfillment(), method: i % 2 ? "show" : "meetup",
        show: "Twin Cities Card Show", date: i % 2 ? "2026-06-13" : "2026-05-30", time: "18:00",
        location: "Dreamers Vault — Minneapolis", proposedAt: at,
        collectorConfirmedPlan: true, tpHandoff: true, collectorReceipt: true };
      o.completedAt = at;
    }
    return o;
  });
}

// [collectorId, cardId, stage, updated, amount]
const OPPS_SEED = [
  ["c1", "i1", "agree-price", "2026-08-05", 4200], ["c5", "i8", "agree-price", "2026-08-04", 1150],
  ["c11", "i6", "agree-price", "2026-07-21", 900], ["c8", "i29", "agree-price", "2026-08-08", 1250],
  ["c4", "i27", "agree-price", "2026-08-07", 620], ["c10", "i22", "agree-price", "2026-08-02", 1600],
  ["c2", "i3", "agree-price", "2026-08-01", 780],
  ["c3", "i1", "select-trade", "2026-07-28", 4200], ["c6", "i12", "select-trade", "2026-08-06", 3400],
  ["c12", "i17", "select-trade", "2026-04-14", 9800], ["c13", "i30", "select-trade", "2026-07-15", 2200],
  ["c9", "i4", "select-trade", "2026-05-19", 3100],
  ["c7", "i16", "value-trade", "2026-06-11", 12500], ["c1", "i5", "value-trade", "2026-08-03", 1450],
  ["c8", "i25", "value-trade", "2026-08-08", 210], ["c2", "i11", "value-trade", "2026-07-30", 2400],
  ["c6", "i13", "deal", "2026-08-06", 900], ["c10", "i14", "deal", "2026-08-02", 780],
  ["c4", "i26", "deal", "2026-08-07", 190],
  ["c13", "i20", "fulfillment", "2026-07-15", 1100], ["c12", "i21", "fulfillment", "2026-08-04", 420],
  ["c7", "i17", "fulfillment", "2026-08-06", 9800],
  ["c1", "x1", "completed", "2026-06-18", 1800], ["c2", "x2", "completed", "2026-05-02", 300],
  ["c3", "x7", "completed", "2026-07-09", 900], ["c4", "x9", "completed", "2026-06-27", 300],
  ["c5", "x3", "completed", "2026-03-14", 350], ["c6", "x8", "completed", "2026-05-21", 260],
  ["c7", "x4", "completed", "2026-02-08", 220], ["c8", "x6", "completed", "2026-07-31", 380],
  ["c9", "x1", "completed", "2026-01-23", 1800], ["c10", "x5", "completed", "2026-06-05", 210],
  ["c11", "x2", "completed", "2026-04-11", 300], ["c12", "x6", "completed", "2026-03-29", 380],
  ["c13", "x10", "completed", "2026-07-02", 700], ["c13", "x7", "completed", "2025-12-15", 900],
  ["c1", "x3", "completed", "2025-11-08", 350], ["c11", "x4", "completed", "2026-02-19", 220],
];

const ACTIVITY_SEED = [
  ["c1", "goal", "Primary goal created — Charizard, Base Set PSA 9", "2026-07-02"],
  ["c1", "match", "Goal matched to inventory — Charizard, Base Set PSA 9", "2026-07-02"],
  ["c1", "outreach", "You reached out about Charizard, Base Set PSA 9", "2026-07-29"],
  ["c1", "stage", "Price agreed at $4,200 — Charizard, Base Set PSA 9", "2026-08-05"],
  ["c1", "completed", "Transaction completed — Charizard, Base Set PSA 8 ($1,800)", "2026-06-18"],
  ["c2", "goal", "Primary goal created — Charizard, Base Set PSA 9", "2026-06-14"],
  ["c2", "outreach", "You reached out about Venusaur, Base Set PSA 9", "2026-07-26"],
  ["c2", "stage", "Price agreed at $780 — Venusaur, Base Set PSA 9", "2026-08-01"],
  ["c3", "goal", "Primary goal created — Espeon Gold Star PSA 9", "2026-05-30"],
  ["c3", "stage", "Trade selected — Charizard, Base Set PSA 9", "2026-07-28"],
  ["c4", "match", "Goal matched to inventory — Lillie (Full Art) PSA 9", "2026-07-19"],
  ["c4", "stage", "Deal reached — Marnie (Full Art) PSA 9", "2026-08-07"],
  ["c5", "goal", "Primary goal created — sealed 1st Ed Team Rocket box", "2026-06-01"],
  ["c5", "outreach", "You reached out about Dark Charizard, Team Rocket PSA 9", "2026-07-25"],
  ["c6", "stage", "Deal reached — Shining Mewtwo, Neo Destiny PSA 8", "2026-08-06"],
  ["c7", "manual", "Called about Umbreon Gold Star — wants photos of corners", "2026-06-11"],
  ["c8", "stage", "Price agreed at $1,250 — Evolving Skies booster box", "2026-08-08"],
  ["c9", "manual", "Met at Miami card show, discussed Skyridge Charizard", "2026-05-19"],
  ["c10", "stage", "Deal reached — Umbreon, Neo Discovery PSA 9", "2026-08-02"],
  ["c11", "goal", "Primary goal created — Alakazam, Base Set 1st Edition", "2026-05-12"],
  ["c12", "goal", "Primary goal created — Rayquaza Gold Star PSA 9", "2026-03-02"],
  ["c12", "stage", "Fulfillment started — Charizard VMAX PSA 10", "2026-08-04"],
  ["c13", "stage", "Fulfillment started — Mewtwo, Japanese Promo PSA 8", "2026-07-15"],
  ["c13", "completed", "Transaction completed — Shining Magikarp PSA 9 ($700)", "2026-07-02"],
];

/* ------------------------------ HELPERS ------------------------------- */

/* The demo is USD-only. Both formatters pin the locale to en-US so digit grouping
   is stable regardless of the browser's locale. Without an explicit locale the
   grouping separator follows the machine and renders 1.234.568 on de-DE.

   money()      estimated / listing values — whole dollars, the existing convention
   moneyExact() amounts actually transacted — exact cents, never rounded */
const USD_LOCALE = "en-US";
const money = (n) => {
  if (n == null || !isFinite(n)) return "—";
  const v = Math.round(n);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString(USD_LOCALE);
};
const moneyExact = (n) => {
  if (n == null || !isFinite(n)) return "—";
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString(USD_LOCALE,
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const daysSince = (d) => Math.round((TODAY - new Date(d + "T12:00:00")) / 86400000);
const ago = (d) => { const n = daysSince(d); return n <= 0 ? "today" : n === 1 ? "1 day ago" : n < 60 ? `${n} days ago` : `${Math.round(n / 30)} mo ago`; };
const initials = (n) => n.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
/* Structured card identity. `edition` is NOT displayed as a column, but it must be
   part of the key: a 1st Edition Charizard and an Unlimited Charizard are the same
   name/set/number and would otherwise collide. Condition participates only for Raw
   cards, because a PSA grade already expresses condition. Tags are never involved. */
const GRADED_VALUES = ["Raw", "PSA 1", "PSA 2", "PSA 3", "PSA 4", "PSA 5", "PSA 6", "PSA 7", "PSA 8", "PSA 9", "PSA 10"];
const CONDITION_VALUES = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];
const PRINT_VALUES = ["Normal", "Holo", "Reverse Holo"];

const isRaw = (c) => c && c.grade === "Raw";
const IDENTITY_FIELDS = ["name", "grade", "print", "edition", "set", "num", "language"];
/* PRINTED-CARD IDENTITY — Add Inventory discovery only.
   A printed card is what came out of a pack: name, set, set position, print
   treatment. Grade and raw condition describe a COPY, not the card, so they are
   deliberately excluded — Base Set Charizard 4/102 Holo is one printed card whether
   a given copy is PSA 8, PSA 9 or raw.
   This does NOT replace identityKey(), which still governs goal matching, coverage
   and opportunity binding across the rest of the product. */
const PRINT_IDENTITY_FIELDS = ["name", "set", "num", "print"];
const printIdentityKey = (c) =>
  c ? PRINT_IDENTITY_FIELDS.map((f) => String(c[f]).trim().toLowerCase()).join("|") : "";

/* True only when every field identityKey() depends on is resolved. Until then no
   honest comparison against held inventory is possible. */
const identityComplete = (c) => {
  if (!c) return false;
  if (!IDENTITY_FIELDS.every((f) => c[f] != null && String(c[f]).trim() !== "")) return false;
  return !isRaw(c) || (c.condition != null && String(c.condition).trim() !== "");
};
const identityKey = (c) => {
  if (!c) return "";
  const base = IDENTITY_FIELDS.map((f) => String(c[f]).trim().toLowerCase());
  base.push(isRaw(c) ? String(c.condition).trim().toLowerCase() : "n/a");
  return base.join("|");
};

/* Relationship tenure. Under a year reads in days; a year or more reads in years plus
   any remainder, with zero remainders omitted. Derived from the join date on every
   render — years and remainder are never stored. The 365-day convention is the
   prototype's, not calendar-anniversary arithmetic. */
const tenureLabel = (since) => {
  const total = daysSince(since);
  if (total == null || !isFinite(total)) return "—";
  if (total < 365) return total + (total === 1 ? " day" : " days");
  const years = Math.floor(total / 365);
  const rem = total % 365;
  const y = years + (years === 1 ? " year" : " years");
  return rem === 0 ? y : `${y} · ${rem} ${rem === 1 ? "day" : "days"}`;
};

/* Days -> months -> years, never compound. `elapsedAgo` is the same scale, phrased
   as a point in the past for Last Confirmed. */
const elapsedAgo = (d) => { const e = elapsed(d); return e === "Today" ? e : e + " ago"; };

/* Days -> months -> years, never compound. */
function elapsed(dateStr) {
  const d = daysSince(dateStr);
  if (d <= 0) return "Today";
  if (d < 30) return d === 1 ? "1 day" : d + " days";
  if (d < 365) { const m = Math.max(1, Math.round(d / 30)); return m === 1 ? "1 month" : m + " months"; }
  const y = Math.max(1, Math.floor(d / 365));
  return y === 1 ? "1 year" : y + " years";
}

/* "New" is never stored. It is the binder read against the last time the Trusted
   Partner opened that collector's profile, so it can only ever be as stale as the
   two timestamps it comes from. Before the first visit, everything shared counts. */
const unseenAdditions = (binderCards, collector) => {
  const seenAt = collector?.binderReviewedAt || collector?.since || null;
  if (!seenAt) return binderCards.length;
  const seen = Date.parse(seenAt);
  return binderCards.filter((cc) => cc.addedAt && Date.parse(cc.addedAt) > seen).length;
};

const cardTitle = (c) => `${c.year} ${c.name} — ${c.set}${c.num && c.num !== "—" ? " #" + c.num : ""}${c.grade ? " · " + c.grade : ""}`;
const cardShort = (c) => `${c.name} — ${c.set}`;

/* ------------------------------- APP ---------------------------------- */

export default function MetYet() {
  const [nav, setNav] = useState({ section: "opportunities" });
  const [cardDb, setCardDb] = useState(CARDS_SEED);
  /* The canonical Pokémon catalog for Add Inventory discovery: every PRINTED card
     MetYet knows exists, whoever holds it. Built from the full card universe — TP
     inventory, unmet collector goals, collector trade cards and sold history — never
     filtered to what is owned, and deduplicated on printed identity so one printed
     card appears once regardless of how many graded copies of it exist.
     `variants` keeps the underlying records so edition can be resolved on selection. */
  const catalog = useMemo(() => {
    const groups = new Map();
    for (const c of cardDb) {
      const k = printIdentityKey(c);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    return [...groups.values()].map((v) => ({ ...v[0], variants: v }));
  }, [cardDb]);

  /* Resolves the printed card plus the TP's copy details to a canonical record.
     Reuses an existing record when the exact identity already exists; registers the
     identity once when it does not, so a PSA 10 nobody has recorded yet is
     representable. Repeat adds of the same identity reuse the same record. */
  const resolveCanonicalCard = (printed, copy) => {
    const target = { ...printed, edition: copy.edition, grade: copy.grade, condition: copy.condition };
    delete target.variants;
    const k = identityKey(target);
    const hit = cardDb.find((c) => identityKey(c) === k);
    if (hit) return hit.id;
    const id = "c" + k.replace(/[^a-z0-9]+/g, "").slice(0, 24) + "-" + cardDb.length;
    setCardDb((db) => [...db, { ...target, id }]);
    return id;
  };
  const [inventory, setInventory] = useState(() =>
    CARDS_SEED.filter((c) => c.id.startsWith("i")).map((c, k) => ({
      invId: "inv" + (k + 1), cardId: c.id, ask: c.value,
      cost: Math.round(c.value * 0.78), acquired: "2026-0" + ((k % 6) + 1) + "-1" + ((k % 9) + 1), archived: false,
      cert: "PSA " + (70000000 + k * 13457), photos: { front: null, back: null },
    })).concat([
      // extra physical copies of the same card identity, at different prices
      { invId: "inv-c2", cardId: "i1", ask: 4650, cost: 3400, acquired: "2026-05-02", archived: false, cert: "PSA 71204885", photos: { front: null, back: null } },
      { invId: "inv-c3", cardId: "i1", ask: 3950, cost: 3100, acquired: "2026-06-21", archived: false, cert: "PSA 68931507", photos: { front: null, back: null } },
      { invId: "inv-c4", cardId: "i14", ask: 810, cost: 615, acquired: "2026-07-04", archived: false, cert: "PSA 73550142", photos: { front: null, back: null } },
    ])
  );
  const [goals, setGoals] = useState(() => GOALS_SEED.map((g, i) => ({
      id: "g" + i, collectorId: g[0], cardId: g[1], tier: g[2], note: g[3],
      since: g[4],        // when the CURRENT priority began
      createdAt: g[5],    // when the goal first existed
      confirmedAt: g[6],  // when the collector last said it's still accurate
      secondarySince: g[2] === "primary" ? g[5] : null,
    })));
  const [collectors, setCollectors] = useState(COLLECTORS_SEED);
  const [opps, setOpps] = useState(() => buildOpps(OPPS_SEED));
  const [collectorCards, setCollectorCards] = useState(() =>
    COLLECTOR_CARDS_SEED.map((r, i) => ({ id: "cc" + i, cardId: r[0], collectorId: r[1], tpInterest: r[2], market: r[3], photos: r[4], cert: r[5], addedAt: r[6] }))
  );
  const [activity, setActivity] = useState(() => ACTIVITY_SEED.map((a, i) => ({ id: "a" + i, collectorId: a[0], type: a[1], text: a[2], date: a[3] })));
  /* One thread per Trusted Partner x Collector x card identity. Keyed on identity
     rather than goalId or oppId so it survives Secondary -> Primary and is inherited
     by the Opportunity when the collector makes an offer. */
  const [threads, setThreads] = useState([]);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [drawer, setDrawer] = useState(null);

  const say = useCallback((m) => { setToast(m); setTimeout(() => setToast((t) => (t === m ? null : t)), 2600); }, []);

  /* ---- derived model ---- */
  const card = useCallback((id) => cardDb.find((c) => c.id === id), [cardDb]);
  const collector = useCallback((id) => collectors.find((c) => c.id === id), [collectors]);

  const activeInv = useMemo(() => inventory.filter((i) => !i.archived), [inventory]);
  const ownedIds = useMemo(() => new Set(activeInv.map((i) => i.cardId)), [activeInv]);

  // preference matches: shared tags, excluding pairs that already have an explicit goal
  const model = useMemo(() => {
    const goalKey = new Set(goals.map((g) => g.collectorId + "|" + g.cardId));
    const prefMatches = []; // {collectorId, cardId, tags[]}
    for (const col of collectors) {
      for (const inv of activeInv) {
        const c = cardDb.find((x) => x.id === inv.cardId);
        if (!c) continue;
        if (goalKey.has(col.id + "|" + c.id)) continue;
        const shared = c.tags.filter((t) => col.prefs.includes(t));
        if (shared.length) prefMatches.push({ collectorId: col.id, cardId: c.id, tags: shared });
      }
    }
    // preference interest in cards not owned (for unmet demand context)
    const prefInterest = {}; // cardId -> [{collectorId, tags}]
    for (const c of cardDb) {
      if (ownedIds.has(c.id) || c.id.startsWith("x")) continue;
      for (const col of collectors) {
        if (goalKey.has(col.id + "|" + c.id)) continue;
        const shared = c.tags.filter((t) => col.prefs.includes(t));
        if (shared.length >= 2) (prefInterest[c.id] ||= []).push({ collectorId: col.id, tags: shared });
      }
    }
    return { prefMatches, prefInterest };
  }, [collectors, activeInv, cardDb, goals, ownedIds]);

  /* Every active inventory copy that exactly satisfies a goal's required identity.
     Returns a list because one goal can be served by several physical copies. */
  const goalMatches = useCallback(
    (goal) => {
      const want = identityKey(card(goal.cardId));
      if (!want) return [];
      return activeInv.filter((i) => identityKey(card(i.cardId)) === want);
    },
    [activeInv, card]
  );

  /* Every goal aimed at this exact card identity, split by priority. Same identity
     semantics as inventory matching — never preference alignment. */
  const goalsForIdentity = useCallback(
    (cardId) => {
      const want = identityKey(card(cardId));
      const hits = want ? goals.filter((g) => identityKey(card(g.cardId)) === want) : [];
      return { primary: hits.filter((g) => g.tier === "primary"), secondary: hits.filter((g) => g.tier === "secondary") };
    },
    [goals, card]
  );

  const demandFor = useCallback(
    (cardId) => ({
      primary: goals.filter((g) => g.cardId === cardId && g.tier === "primary"),
      secondary: goals.filter((g) => g.cardId === cardId && g.tier === "secondary"),
      preference: model.prefMatches.filter((p) => p.cardId === cardId),
    }),
    [goals, model]
  );

  // a goal sits at its own funnel stage only until it enters a deal stage
  const inDeal = useMemo(() => new Set(opps.map((o) => o.collectorId + "|" + o.cardId)), [opps]);
  const goalsAtStage = useCallback(
    (tier) => goals.filter((g) => g.tier === tier && !inDeal.has(g.collectorId + "|" + g.cardId)),
    [goals, inDeal]
  );

  const stageCounts = useMemo(() => {
    const c = { secondary: goalsAtStage("secondary").length, primary: goalsAtStage("primary").length };
    // archived opportunities leave the active funnel entirely; they are counted once, under History
    for (const s of DEAL_STAGES) c[s] = opps.filter((o) => o.stage === s && isActive(o)).length;
    c.archived = opps.filter(isArchived).length;
    return c;
  }, [goalsAtStage, opps]);

  const coverage = useMemo(() => inventoryCoverage({
    activeInv, opps, goals, collectors, cardById: card, today: TODAY,
  }), [activeInv, opps, goals, collectors, card]);

  const profile = useMemo(() => networkProfile({ goals, cardById: card }), [goals, card]);

  const intel = useMemo(() => networkIntelligence({
    goals, collectors, activeInv, cardById: card, prefInterest: model.prefInterest,
  }), [goals, collectors, activeInv, card, model]);

  const collectorStats = useCallback(
    (id) => {
      const gs = goals.filter((g) => g.collectorId === id);
      const p = gs.filter((g) => g.tier === "primary");
      const s = gs.filter((g) => g.tier === "secondary");
      // canonical exact-identity matching, the same rule the goal tables, Coverage
      // and Opportunities use — not a separate cardId lookup
      const pm = p.filter((g) => goalMatches(g).length > 0);
      const sm = s.filter((g) => goalMatches(g).length > 0);
      const pref = model.prefMatches.filter((x) => x.collectorId === id);
      const relIds = new Set([...pm, ...sm].map((g) => g.cardId).concat(pref.map((x) => x.cardId)));
      const relValue = [...relIds].reduce((a, cid) => a + (card(cid)?.value || 0), 0);
      const open = opps.filter((o) => o.collectorId === id && o.stage !== "completed");
      const done = opps.filter((o) => o.collectorId === id && o.stage === "completed");
      return { primary: p, secondary: s, primaryMatches: pm, secondaryMatches: sm, prefMatches: pref, relCount: relIds.size, relValue, open, done };
    },
    [goals, goalMatches, model, card, opps]
  );

  /* Relationship facts for the Collector Network overview. Every value is derived —
     nothing here is stored on the collector record.

     Coverage deliberately reuses the network-level rule from inventoryCoverage():
     a goal is covered when some active inventory item shares its canonical
     identityKey. Only the scope differs — one collector's goals rather than the
     whole network. No second definition of "covered" is introduced. */
  const collectorFacts = useCallback(
    (id) => {
      const s = collectorStats(id);
      const done = s.done;                                  // stage === "completed" only
      const mine = goals.filter((g) => g.collectorId === id);
      const covered = mine.filter((g) => goalMatches(g).length > 0);
      const c = collector(id);
      const binder = collectorCards.filter((cc) => cc.collectorId === id);
      return {
        memberSince: c ? c.since : null,                    // existing join date, not re-stored
        memberDays: c ? daysSince(c.since) : null,          // derived from the date
        completedDeals: done.length,
        dealValue: done.reduce((a, o) => a + (o.agreedPrice || 0), 0),
        coverage: mine.length ? covered.length / mine.length : null,
        coveredGoals: covered.length,
        totalGoals: mine.length,
        /* Every card shared, whatever the Trusted Partner thinks of it — tpInterest
           is a TP opinion and has no bearing on how big the binder is. */
        binderTotal: binder.length,
        binderNew: unseenAdditions(binder, c),
        /* What the TP said they'd accept. Read off tpInterest every render, never stored. */
        binderOpen: binder.filter((cc) => cc.tpInterest).length,
      };
    },
    [collectorStats, goals, goalMatches, collector, collectorCards]
  );


  /* ---- actions ---- */
  const threadKeyFor = useCallback((collectorId, cardId) => collectorId + "::" + identityKey(card(cardId)), [card]);
  const threadFor = useCallback(
    (collectorId, cardId) => threads.find((t) => t.key === threadKeyFor(collectorId, cardId)) || null,
    [threads, threadKeyFor]
  );
  /* Opening the workspace never creates a thread. Only a real message or a lifecycle
     event does, so "has this conversation started?" stays honest. */
  const appendEntry = (collectorId, cardId, entry) => {
    const key = collectorId + "::" + identityKey(card(cardId));
    const stamped = { id: "e" + Date.now() + Math.random().toString(36).slice(2, 6), at: new Date().toISOString(), ...entry };
    setThreads((ts) => {
      const found = ts.find((t) => t.key === key);
      if (found) return ts.map((t) => (t.key === key ? { ...t, entries: [...t.entries, stamped] } : t));
      return [...ts, { id: "t" + key, key, collectorId, cardId, oppId: null, entries: [stamped] }];
    });
  };
  const sendMessage = (collectorId, cardId, by, text) => {
    appendEntry(collectorId, cardId, { kind: "message", by, text });
    if (by === "tp") logActivity(collectorId, "outreach", `You messaged about ${cardShort(card(cardId))} — ${text.slice(0, 60)}`);
  };
  /* Structured lifecycle events land in the same thread, chronologically. */
  const logMilestone = (collectorId, cardId, text) => appendEntry(collectorId, cardId, { kind: "event", by: "system", text });
  const hasConversation = useCallback(
    (collectorId, cardId) => { const t = threadFor(collectorId, cardId); return !!t && t.entries.some((e) => e.kind === "message"); },
    [threadFor]
  );

  const logActivity = (collectorId, type, text, date) =>
    setActivity((a) => [{ id: "a" + Date.now() + Math.random(), collectorId, type, text, date: date || TODAY.toISOString().slice(0, 10) }, ...a]);

  // Outreach is communication only. It never moves the opportunity.
  const startOutreach = (collectorId, cardId, goalTier, message) => {
    const c = card(cardId);
    if (message) appendEntry(collectorId, cardId, { kind: "message", by: "tp", text: message });
    logActivity(collectorId, "outreach", `You reached out about ${cardShort(c)} (${goalTier} goal)${message ? " — " + message.slice(0, 60) : ""}`);
    say(`Outreach sent to ${collector(collectorId).short}. The stage is unchanged — only they can start a negotiation.`);
    setModal(null);
  };

  const NOW = TODAY.toISOString().slice(0, 10);
  const patchOpp = (id, fn, note, type = "stage") => {
    const cur = opps.find((o) => o.id === id);
    if (!cur) return;
    const next = { ...fn(cur), updated: NOW };
    setOpps((os) => os.map((o) => (o.id === id ? next : o)));
    if (note) {
      const text = note(next, cur);
      logActivity(cur.collectorId, type, text);
      logMilestone(cur.collectorId, cur.cardId, text);
    }
  };

  /* --- INTENT (Collector-owned; simulated until the Collector app exists) --- */

  const collectorPromoteGoal = (goalId) => {
    const g = goals.find((x) => x.id === goalId);
    if (!g || g.tier !== "secondary") return;
    setGoals((gs) => gs.map((x) => (x.id === goalId ? { ...x, tier: "primary", since: NOW, secondarySince: x.secondarySince || x.since, confirmedAt: NOW } : x)));
    logActivity(g.collectorId, "goal", `Secondary goal promoted to Primary — ${cardShort(card(g.cardId))} (secondary since ${fmtDate(g.since)})`);
    logMilestone(g.collectorId, g.cardId, "Secondary Goal promoted to Primary Goal");
    say(`${collector(g.collectorId).short} promoted this to a Primary Goal.`);
  };

  /* Reconfirmation is the collector saying "this is still accurate." It changes no
     identity, no priority, and no history — only confirmedAt. */
  const collectorConfirmGoal = (goalId) => {
    const g = goals.find((x) => x.id === goalId);
    if (!g) return;
    setGoals((gs) => gs.map((x) => (x.id === goalId ? { ...x, confirmedAt: NOW } : x)));
    logActivity(g.collectorId, "goal", `${STAGE_LABEL[g.tier]} confirmed — ${cardShort(card(g.cardId))}`);
    logMilestone(g.collectorId, g.cardId, `${STAGE_LABEL[g.tier]} confirmed as still accurate`);
    say(`${collector(g.collectorId).short} confirmed this goal is still accurate.`);
  };

  const collectorMakeOffer = (goalId, amount, invId) => {
    const g = goals.find((x) => x.id === goalId);
    const inv = inventory.find((i) => i.invId === invId && !i.archived);
    if (!g || !inv) return;
    const o = emptyOpp(g.collectorId, g.cardId, inv.invId, inv.ask, NOW);
    o.priceThread = [{ by: "collector", type: "offer", amount, at: NOW }];
    setOpps((os) => [...os, o]);
    // Making an offer is a stronger reaffirmation than pressing Confirm, so it
    // refreshes confirmedAt. Identity, priority and history are untouched, and the
    // offer's own activity event already documents the reaffirming action.
    setGoals((gs) => gs.map((x) => (x.id === goalId ? { ...x, confirmedAt: NOW } : x)));
    logActivity(g.collectorId, "stage", `Made an offer of ${money(amount)} on ${cardShort(card(g.cardId))} (listed ${money(inv.ask)})`);
    logMilestone(g.collectorId, g.cardId, `Collector made an offer — ${money(amount)} against a listed ${money(inv.ask)}`);
    /* The conversation is not recreated. The existing thread for this collector x card
       identity is adopted by the new opportunity. */
    const key = g.collectorId + "::" + identityKey(card(g.cardId));
    setThreads((ts) => ts.map((t) => (t.key === key ? { ...t, oppId: o.id, invId: inv.invId } : t)));
    say(`${collector(g.collectorId).short} opened a negotiation at ${money(amount)}.`);
  };

  /* --- AGREE ON PRICE --- */

  const priceRespond = (oppId, by, action, amount) =>
    patchOpp(oppId, (o) => {
      const thread = [...o.priceThread, { by, type: action, amount: action === "accept" ? lastEntry(o.priceThread).amount : amount, at: NOW }];
      const agreed = action === "accept" ? lastEntry(o.priceThread).amount : null;
      return {
        ...o, priceThread: thread,
        agreedPrice: agreed ?? o.agreedPrice,
        stage: action === "accept" ? "select-trade" : action === "decline" ? o.stage : o.stage,
        declined: action === "decline" ? true : o.declined,
      };
    }, (n, o) => {
      const who = by === "tp" ? "You" : collector(o.collectorId).short;
      if (action === "accept") return `Price agreed at ${money(n.agreedPrice)} — ${cardShort(card(o.cardId))}`;
      if (action === "decline") return `${who} stopped pursuing ${cardShort(card(o.cardId))}`;
      return `${who} countered at ${money(amount)} — ${cardShort(card(o.cardId))}`;
    });

  /* --- SELECT TRADE (Collector-owned) --- */

  /* --- SELECT TRADE: the collector assembles the package --------------------
     Draft edits (adding, removing, revising a proposed market, attaching photos)
     write to the same opp.trade.cards the later stages read. They deliberately
     produce no valuation history and no milestones: drafting is not negotiating. */

  const draftPatch = (oppId, fn) => {
    const cur = opps.find((o) => o.id === oppId);
    if (!cur) return;
    setOpps((os) => os.map((o) => (o.id === oppId ? { ...fn(o), updated: NOW } : o)));
  };

  const tradeAddCard = (oppId, cardId) =>
    draftPatch(oppId, (o) => {
      if (o.trade?.submitted) return o;                    // package is under TP review
      const b = collectorCards.find((cc) => cc.cardId === cardId && cc.collectorId === o.collectorId);
      const existing = o.trade?.cards || [];
      if (existing.some((c) => c.cardId === cardId)) return o;
      return { ...o, trade: { mode: "trade", submitted: false, cards: [...existing, emptyTradeCard(cardId, b?.photos, b?.cert, b?.id)] } };
    });

  /* Draft removal only. Once the TP has made an inclusion decision the row is
     transaction history and can never be deleted. */
  const tradeRemoveCard = (oppId, cardId) =>
    draftPatch(oppId, (o) => {
      const tc = o.trade.cards.find((c) => c.cardId === cardId);
      if (!tc || tc.inclusion !== "proposed" || o.trade.submitted) return o;
      return { ...o, trade: { ...o.trade, cards: o.trade.cards.filter((c) => c.cardId !== cardId) } };
    });

  /* Photos are reused from the binder. Attaching here writes to both so the same
     images appear unchanged in Value Trade. */
  const tradeAttachPhotos = (oppId, cardId) => {
    const photos = { front: "binder:" + cardId + ":front", back: "binder:" + cardId + ":back" };
    setCollectorCards((cs) => cs.map((c) => (c.cardId === cardId ? { ...c, photos } : c)));
    draftPatch(oppId, (o) => ({
      ...o, trade: { ...o.trade, cards: o.trade.cards.map((c) => (c.cardId === cardId ? { ...c, photos } : c)) },
    }));
    say("Photos added to the trade binder and this package.");
  };

  /* The collector hands the package to the TP for inclusion review. No economics
     are required — this stage is only about which cards participate. */
  const submitPackageForReview = (oppId) =>
    patchOpp(oppId, (o) => ({ ...o, trade: { ...o.trade, submitted: true } }),
      (n, o) => `Collector proposed ${o.trade.cards.length} card${o.trade.cards.length === 1 ? "" : "s"} for the trade`);

  /* Select Trade closes the moment no card is awaiting review and at least one was
     accepted. Accepted rows carry straight into Value Trade — same records, same ids. */
  /* A fully reviewed package with at least one acceptance opens Value Trade. A fully
     reviewed package with ZERO acceptances has nothing left to value, so it resolves
     to a cash-only Deal rather than stranding the collector in Select Trade. Neither
     applies while the package is a draft or any card is still unreviewed. */
  const selectionExhausted = (o) =>
    !!o.trade?.submitted && proposedCards(o).length === 0 && includedCards(o).length === 0;
  const maybeCloseSelection = (o) => {
    if (selectTradeSettled(o)) return { ...o, stage: "value-trade" };
    if (selectionExhausted(o)) return { ...o, trade: { ...o.trade, mode: "cash" }, stage: "deal" };
    return o;
  };

  const tpReviewInclusion = (oppId, cardId, action) =>
    patchOpp(oppId, (o) => {
      if (o.stage !== "select-trade" || isTerminal(o)) return o;   // inclusion closes with the stage
      const cards = o.trade.cards.map((c) => (c.cardId === cardId ? tcReviewInclusion(c, action, NOW) : c));
      return maybeCloseSelection({ ...o, trade: { ...o.trade, cards } });
    }, (n, o) => {
      const nm = card(cardId).name;
      const base = action === "accept" ? `You accepted ${nm} into the trade` : `You rejected ${nm} from the trade`;
      if (n.stage === "value-trade")
        return `${base} — package settled at ${includedCards(n).length} card${includedCards(n).length === 1 ? "" : "s"}, valuation open`;
      if (n.stage === "deal")
        return `${base}. All proposed trade cards were declined — continuing as cash only.`;
      return base;
    });

  const collectorChooseCash = (oppId) =>
    patchOpp(oppId, (o) => (isTerminal(o) || !["select-trade", "value-trade"].includes(o.stage)
      ? o
      : { ...o, trade: { ...(o.trade || {}), mode: "cash", submitted: true, cards: o.trade?.cards || [] }, stage: "deal" }),
      (n, o) => `Chose cash only, no trade — ${cardShort(card(o.cardId))}`);

  /* Archiving closes the opportunity without completing it. The record is preserved
     in full; it simply leaves the active funnel. */
  const collectorStopPursuing = (oppId) =>
    patchOpp(oppId, (o) => (isTerminal(o) ? o : { ...o, declined: true, archivedAt: NOW, archivedFrom: o.stage }),
      (n, o) => `${collector(o.collectorId).short} stopped pursuing ${cardShort(card(o.cardId))} — archived from ${STAGE_LABEL[o.stage]}`);

  /* --- VALUE TRADE --- */

  /* Deal is reached only when every included card is fully agreed (market AND
     percentage) or withdrawn. If everything was withdrawn the opportunity waits
     here for an explicit collector decision rather than silently becoming cash. */
  const maybeCloseValuation = (o) =>
    valueTradeSettled(o) && settledCards(o).length > 0 ? { ...o, stage: "deal" } : o;

  const patchCard = (oppId, cardId, fn, note, type = "stage") =>
    patchOpp(oppId, (o) => {
      if (o.stage !== "value-trade" || isTerminal(o)) return o;    // terms close with the stage
      const cards = o.trade.cards.map((c) => (c.cardId === cardId ? fn(c) : c));
      return maybeCloseValuation({ ...o, trade: { ...o.trade, cards } });
    }, note, type);

  const marketAction = (oppId, cardId, by, action, amount) =>
    patchCard(oppId, cardId, (c) => tcApplyMarket(c, by, action, amount, NOW), (n, o) => {
      const nm = card(cardId).name;
      const who = by === "tp" ? "You" : collector(o.collectorId).short;
      const after = n.trade.cards.find((c) => c.cardId === cardId);
      if (action === "accept") return `Market agreed on ${nm} at ${money(after.agreedMarket)}`;
      return `${who} proposed ${money(amount)} market value for ${nm}`;
    });

  const percentAction = (oppId, cardId, by, action, percent) =>
    patchCard(oppId, cardId, (c) => tcApplyPercent(c, by, action, percent, NOW), (n, o) => {
      const nm = card(cardId).name;
      const who = by === "tp" ? "You" : collector(o.collectorId).short;
      const after = n.trade.cards.find((c) => c.cardId === cardId);
      if (action === "accept") return `Trade % agreed on ${nm} at ${pct(after.agreedPercent)} — credit ${money(creditFor(after))}`;
      return `${who} proposed ${pct(percent)} trade credit on ${nm}`;
    });

  const collectorWithdrawCard = (oppId, cardId) =>
    patchCard(oppId, cardId, (c) => tcWithdraw(c, NOW),
      (n, o) => `${collector(o.collectorId).short} withdrew ${card(cardId).name} from the trade — keeping the card at these economics`);

  /* --- DEAL --- */

  const dealAgree = (oppId, by) =>
    patchOpp(oppId, (o) => {
      if (o.stage !== "deal" || isTerminal(o) || adjOpen(o.deal)) return o;
      const deal = { ...o.deal, [by === "tp" ? "tpAgreed" : "collectorAgreed"]: true };
      const both = deal.tpAgreed && deal.collectorAgreed;
      return { ...o, deal, stage: both ? "fulfillment" : o.stage };
    }, (n, o) => n.stage === "fulfillment"
      ? `Deal confirmed — ${cashLabel(n, collector(o.collectorId).short)}`
      : `${by === "tp" ? "You" : collector(o.collectorId).short} agreed to the deal`);

  /* The single Deal-level revision mechanism. It moves the assembled cash balance
     and nothing else: price, market values, percentages and per-card credit are
     already settled and stay settled. */
  const dealAdjust = (oppId, by, action, amount) =>
    patchOpp(oppId, (o) => {
      if (o.stage !== "deal" || isTerminal(o)) return o;
      return { ...o, deal: dealApplyAdj(o.deal, by, action, amount, NOW) };
    }, (n, o) => {
      const who = by === "tp" ? "You" : collector(o.collectorId).short;
      const short = collector(o.collectorId).short;
      if (action === "accept") return `Cash adjustment agreed — ${cashLabel(n, short)}`;
      const dir = amount < 0 ? "reduce" : "increase";
      return `${who} proposed a ${money(Math.abs(amount))} ${dir} to the cash balance`;
    });

  /* --- FULFILLMENT / COMPLETED --- */

  /* Coordination. The TP proposes; the collector confirms or sends it back. */
  const proposeFulfillment = (oppId, plan) =>
    patchOpp(oppId, (o) => ({
      ...o,
      fulfillment: { ...o.fulfillment, ...plan, proposedAt: NOW, revisionRequested: null, collectorConfirmedPlan: false },
    }), (n) => `Fulfillment plan proposed — ${fulfillmentSummary(n.fulfillment)}`);

  const collectorConfirmPlan = (oppId) =>
    patchOpp(oppId, (o) => (planProposed(o.fulfillment)
      ? { ...o, fulfillment: { ...o.fulfillment, collectorConfirmedPlan: true } } : o),
      (n) => `Fulfillment agreed — ${fulfillmentSummary(n.fulfillment)}`);

  const collectorRequestPlanRevision = (oppId, note) =>
    patchOpp(oppId, (o) => ({
      ...o, fulfillment: { ...o.fulfillment, collectorConfirmedPlan: false, revisionRequested: { note, at: NOW } },
    }), (n, o) => `${collector(o.collectorId).short} asked to change the fulfillment plan — ${note}`);

  /* Completion. Blocked until the plan is agreed, and neither side alone finishes it. */
  const confirmHandoff = (oppId, by) =>
    patchOpp(oppId, (o) => {
      if (!planAgreed(o.fulfillment)) return o;
      const f = { ...o.fulfillment, [by === "tp" ? "tpHandoff" : "collectorReceipt"]: true };
      const done = f.tpHandoff && f.collectorReceipt;
      return { ...o, fulfillment: f, stage: done ? "completed" : o.stage, completedAt: done ? NOW : o.completedAt };
    }, (n, o) => n.stage === "completed"
      ? `Transaction completed — ${cardShort(card(o.cardId))} (${money(o.agreedPrice)})`
      : by === "tp" ? "You confirmed handoff" : `${collector(o.collectorId).short} confirmed receipt`,
      "completed");

  const attachBinderPhotos = (ccId) => {
    setCollectorCards((cs) => cs.map((c) => (c.id === ccId
      ? { ...c, photos: { front: "binder:" + c.cardId + ":front", back: "binder:" + c.cardId + ":back" } } : c)));
    say("Photos added to the collector's trade binder.");
  };

  /* Opening the profile is the review. No acknowledge button, and nothing about the
     binder itself changes — only the timestamp the unseen count is measured against. */
  const markBinderReviewed = useCallback((collectorId) => {
    const at = new Date().toISOString();
    setCollectors((cs) => cs.map((c) => (c.id === collectorId ? { ...c, binderReviewedAt: at } : c)));
  }, []);

  const setTradeInterest = (ccId, on) => {
    setCollectorCards((cs) => cs.map((c) => (c.id === ccId ? { ...c, tpInterest: on } : c)));
    say(on ? "Marked open to trade. It can now be added in Select Trade." : "No longer marked open to trade. It won't appear in Select Trade.");
  };

  /* Adds a copy of a card that already exists in the catalog. Reuses the same
     inventory record shape as saveCard — invId, cardId, ask, cost, acquired, cert —
     so there is no Cultivate-only schema and no new card identity is minted. */
  const addCopyToInventory = (cardId, draft) => {
    const c = card(cardId);
    if (!c) return;
    /* Cost and listing price are OPTIONAL. Blank stays blank — stored as null, never
       coerced to 0 and never substituted from the card's estimated value. Anything
       actually entered must still be a valid non-negative number. */
    const money2 = (v, round) => {
      const raw = String(v ?? "").trim();
      if (raw === "") return null;                     // blank is not zero
      const n = Number(raw);
      if (!isFinite(n) || n < 0) return undefined;     // entered but invalid
      return round ? Math.round(n) : n;
    };
    const cost = money2(draft.cost, false);
    const ask = money2(draft.ask, true);               // listing value stays whole dollars
    if (cost === undefined || ask === undefined) return;
    setInventory((iv) => [...iv, {
      invId: "inv" + cardId + "-" + Date.now(),
      cardId,
      ask,
      cost,
      acquired: draft.acquired || NOW,
      cert: draft.cert ? draft.cert.trim() : null,
      archived: false,
      photos: { front: null, back: null },
    }]);
    say(cost == null ? `Added to Current — ${c.name}.` : `Added to Current — ${c.name} at ${moneyExact(cost)}.`);
    setModal(null);
  };

  /* EDIT ONLY. The new-card branch that minted an identity ("n" + Date.now()) is
     removed: inventory is created by addCopyToInventory against an existing
     canonical card, so nothing here may add to cardDb. */
  const saveCard = (draft, invId) => {
    if (!invId) return;
    setCardDb((db) => db.map((c) => (c.id === draft.id ? { ...c, ...draft } : c)));
    setInventory((iv) => iv.map((i) => (i.invId === invId ? { ...i, ask: draft.ask, cost: draft.cost } : i)));
    say(`${draft.name} updated.`);
    setModal(null);
  };

  // Archiving never notifies collectors. It only warns the Trusted Partner when the card
  // is load-bearing for an open deal or an unfilled primary goal.
  const archiveRisk = useCallback(
    (cardId) => {
      const open = opps.filter((o) => o.cardId === cardId && o.stage !== "completed");
      const primary = goals.filter((g) => g.cardId === cardId && g.tier === "primary");
      return { open, primary, blocking: open.length > 0 || primary.length > 0 };
    },
    [opps, goals]
  );

  const archiveInv = (invId, confirmed) => {
    const inv = inventory.find((i) => i.invId === invId);
    if (!inv) return;
    if (!confirmed && archiveRisk(inv.cardId).blocking) { setModal({ type: "archive", invId }); return; }
    setInventory((iv) => iv.map((i) => (i.invId === invId ? { ...i, archived: true } : i)));
    setDrawer(null);
    setModal(null);
    say("Card archived. It no longer counts toward coverage. No collectors were notified.");
  };


  const inviteCollector = (draft) => {
    const id = "c" + Date.now();
    setCollectors((cs) => [...cs, { id, name: draft.name, short: draft.name.split(" ")[0] + " " + (draft.name.split(" ")[1]?.[0] || "") + ".", city: draft.city, since: TODAY.toISOString().slice(0, 10), last: TODAY.toISOString().slice(0, 10), prefs: draft.prefs, note: draft.note, pending: true, binderReviewedAt: TODAY.toISOString() }]);
    logActivity(id, "manual", `Invitation sent to ${draft.email}`);
    say(`Invitation sent to ${draft.name}. They'll appear as pending until they set their goals.`);
    setModal(null);
  };

  const ctx = {
    nav, setNav, card, collector, collectors, cardDb, catalog, resolveCanonicalCard, inventory, activeInv, ownedIds, goals, opps, activity,
    model, intel, profile, coverage, demandFor, goalMatches, goalsForIdentity, stageCounts, goalsAtStage, collectorStats, collectorFacts,
    say, setModal, setDrawer, drawer, startOutreach, saveCard, addCopyToInventory, archiveInv, archiveRisk,
    collectorCards, setTradeInterest, attachBinderPhotos, markBinderReviewed,
    threads, threadFor, sendMessage, hasConversation,
    collectorPromoteGoal, collectorConfirmGoal, collectorMakeOffer, priceRespond,
    tradeAddCard, tradeRemoveCard, tradeAttachPhotos, submitPackageForReview, tpReviewInclusion,
    collectorChooseCash, collectorStopPursuing, marketAction, percentAction, collectorWithdrawCard, dealAgree, dealAdjust, proposeFulfillment, collectorConfirmPlan, collectorRequestPlanRevision, confirmHandoff,
    inviteCollector, logActivity,
  };

  const SECTIONS = {
    opportunities: { title: "Opportunities", sub: "What you're actively coordinating, and what's waiting at each stage" },
    inventory: { title: "Inventory", sub: "What you have and how it connects to collector demand" },
    collectors: { title: "Collector Network", sub: "Who you're serving, and what you know about them" },
  };
  const meta = SECTIONS[nav.section];

  return (
    <div className="my-root">
      <style>{CSS}</style>
      <Sidebar ctx={ctx} />
      <div className="main">
        <div className="top">
          <div>
            <h1 className="disp">{meta.title}</h1>
            <div className="sub">{meta.sub}</div>
          </div>
          <div className="spacer" />
          {nav.section === "inventory" && (
            <button className="btn pri" onClick={() => setModal({ type: "addInventory" })}><Icon n="plus" s={14} />Add card</button>
          )}
          {nav.section === "collectors" && (
            <button className="btn pri" onClick={() => setModal({ type: "invite" })}><Icon n="plus" s={14} />Invite collector</button>
          )}
        </div>
        <div className="scroll" key={nav.section + (nav.collectorId || "")}>
          {nav.section === "opportunities" && <Opportunities ctx={ctx} />}
          {nav.section === "inventory" && <InventoryView ctx={ctx} />}
          {nav.section === "collectors" && (nav.collectorId ? <CollectorProfile ctx={ctx} id={nav.collectorId} /> : <CollectorList ctx={ctx} />)}
        </div>
      </div>

      {drawer?.type === "invItem" && <CardDrawer ctx={ctx} invId={drawer.invId} />}
      {drawer?.type === "workspace" && <ConversationWorkspace ctx={ctx} goalId={drawer.goalId} oppId={drawer.oppId} />}
      {/* edit only — creating inventory goes through AddInventoryModal */}
      {modal?.type === "card" && modal.invId && <CardModal ctx={ctx} invId={modal.invId} />}
      {modal?.type === "addCopy" && <AddCopyModal ctx={ctx} cardId={modal.cardId} />}
      {modal?.type === "addInventory" && <AddInventoryModal ctx={ctx} />}
      {modal?.type === "outreach" && <OutreachModal ctx={ctx} cardId={modal.cardId} collectorId={modal.collectorId} tier={modal.tier} />}
      {modal?.type === "invite" && <InviteModal ctx={ctx} />}
      {modal?.type === "archive" && <ArchiveModal ctx={ctx} invId={modal.invId} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ------------------------------ SIDEBAR ------------------------------- */

function Sidebar({ ctx }) {
  const { nav, setNav, activeInv, collectors, opps } = ctx;
  const items = [
    { id: "opportunities", label: "Opportunities", icon: "flow", count: opps.filter((o) => o.stage !== "completed").length },
    { id: "inventory", label: "Inventory", icon: "box", count: activeInv.length },
    { id: "collectors", label: "Collector Network", icon: "people", count: collectors.length },
  ];
  return (
    <nav className="sb">
      <div className="sb-brand">
        <span className="sb-mark"><i /><i /></span>
        <span className="sb-word">MetYet</span>
      </div>
      <div className="sb-sec">Trusted Partner</div>
      <div className="sb-nav">
        {items.map((i) => (
          <button key={i.id} className={"sb-item" + (nav.section === i.id ? " on" : "")} onClick={() => setNav({ section: i.id })}
            aria-current={nav.section === i.id ? "page" : undefined}>
            <Icon n={i.icon} />
            <span className="lbl">{i.label}</span>
            {i.count !== "" && <span className="cnt mono">{i.count}</span>}
          </button>
        ))}
      </div>
      <div className="sb-foot">
        <div className="n">Northline Cards</div>
        <div className="r">Pilot workspace</div>
      </div>
    </nav>
  );
}

/* ------------------------- NETWORK INTELLIGENCE ------------------------ */



const pctText = (r) => Math.round(r * 100) + "%";


/* Cultivate: a ranked shopping list. The card list is the page; the reasoning that
   produced the order sits underneath, behind a disclosure. Ordering still comes from
   networkIntelligence() — no score, no new weights. */
/* Compact buying reference. Every count is visible without hover, bars are labelled
   in place, and the grid collapses to a single column on a phone. */
function NetworkBar({ rows, unit = "collector", max = 5, empty = "Not enough data yet." }) {
  if (!rows.length) return <div className="nw-empty">{empty}</div>;
  const top = rows.slice(0, max);
  const peak = top[0].collectors || 1;
  return (
    <div className="nw-bars">
      {top.map((r) => (
        <div key={r.key} className="nw-bar">
          <span className="nw-lbl" title={r.key}>{r.key}</span>
          <span className="nw-track"><i style={{ width: Math.max(4, (r.collectors / peak) * 100) + "%" }} /></span>
          <span className="nw-n mono">{r.collectors}</span>
          <span className="nw-u">{unit}{r.collectors === 1 ? "" : "s"}</span>
        </div>
      ))}
    </div>
  );
}

function YourNetwork({ ctx }) {
  const { profile } = ctx;
  const panels = [
    /* Named for what the data actually is: a ranking of card names, not of Pokémon.
       "Charizard", "Dark Charizard" and "Charizard VMAX" stay separate because no
       structured character field exists to merge them. */
    { id: "names", title: "Cards your network wants most", sub: "Ranked by how many collectors want them.",
      body: <NetworkBar rows={profile.pokemon} /> },
    /* Bars, not a donut: a collector with both raw and graded goals is counted in
       both, so these are two independent counts and never a part-to-whole. */
    { id: "format", title: "Format", sub: "How collectors in your network prefer cards.",
      body: <NetworkBar rows={profile.format} /> },
    { id: "grade", title: "Grade", sub: "Which grades matter.",
      body: <NetworkBar rows={profile.grade} empty="No graded demand yet." /> },
    { id: "sets", title: "Sets", sub: "Sets most relevant to your network.",
      body: <NetworkBar rows={profile.sets} /> },
  ];
  return (
    <div className="panel nw">
      <div className="ph">
        <h2>Your Network</h2>
        <span className="note">What matters most across your collector network</span>
      </div>
      <div className="nw-grid">
        {panels.map((p) => (
          <div key={p.id} className="nw-cell">
            <div className="nw-t">{p.title}</div>
            <div className="nw-s">{p.sub}</div>
            {p.body}
          </div>
        ))}
      </div>
      <div className="nw-foot">
        Counted by distinct collectors with a goal, so one collector wanting several
        Charizards counts once. A collector who wants both raw and graded cards appears
        in both format counts. Era isn’t shown — cards carry a year, but the product has
        no era definition to group them by.
      </div>
    </div>
  );
}

function Cultivate({ ctx }) {
  const { intel, setNav, collector, card, setModal } = ctx;
  const { measure: m, gaps, strengths, pursue, thresholds } = intel;
  const [showAll, setShowAll] = useState(false);
  const [why, setWhy] = useState(false);

  const rows = showAll ? pursue : pursue.slice(0, 8);

  return (
    <>
      <YourNetwork ctx={ctx} />

      <div className="sect-t" style={{ margin: "16px 0 8px" }}>Cards to look for</div>
      {pursue.length === 0 ? (
        <div className="panel"><div className="empty">Every collector goal is covered by inventory you have.</div></div>
      ) : (
        <div className="panel">
          {rows.map((p, i) => (
            <div key={p.card.id} className="cv-row">
              <span className="cv-rank mono">{i + 1}</span>
              <CardImage card={p.card} size="browse" />
              <div className="cv-main">
                <div className="cv-t">{cardTitle(p.card)}</div>
                <div className="cv-why">
                  <span>Relevant to <b className="mono">{p.goalCollectors.length}</b> collector{p.goalCollectors.length === 1 ? "" : "s"}</span>
                  {p.primary.length > 0 && <span><b className="mono">{p.primary.length}</b> actively looking</span>}
                  {p.secondary.length > 0 && <span><b className="mono">{p.secondary.length}</b> secondary goal{p.secondary.length === 1 ? "" : "s"}</span>}
                  {p.pref.length > 0 && <span><b className="mono">{p.pref.length}</b> preference match{p.pref.length === 1 ? "" : "es"}</span>}
                  {p.closes.length > 0 && <span>Closes <b className="mono">{p.closes.length}</b> gap{p.closes.length === 1 ? "" : "s"}</span>}
                </div>
                <div className="cv-who">
                  {p.goalCollectors.map((cid) => (
                    <button key={cid} className="chip act" onClick={() => setNav({ section: "collectors", collectorId: cid })}>
                      {collector(cid).short}
                    </button>
                  ))}
                </div>
              </div>
              <button className="btn sm pri cv-add" onClick={() => setModal({ type: "addCopy", cardId: p.card.id })}>
                Add to Inventory
              </button>
            </div>
          ))}
          {pursue.length > 8 && (
            <div className="cv-foot">
              <button className="link" onClick={() => setShowAll(!showAll)}>
                {showAll ? "Show top 8" : `Show all ${pursue.length}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* The ranking evidence, subordinate to the list it explains. */}
      <div className="panel" style={{ marginTop: 14 }}>
        <button className="cv-why-t" onClick={() => setWhy(!why)} aria-expanded={why}>
          <span className="cv-chev" aria-hidden="true"><Icon n="chev" s={12} /></span>
          Why these cards?
        </button>

        {why && (
          <div className="cv-why-body">
            <div className="sect-t">Gaps</div>
            <div className="faint" style={{ fontSize: 11.5, marginBottom: 8 }}>Where collector demand exceeds your inventory.</div>
            {gaps.length === 0 ? (
              <div className="faint" style={{ fontSize: 12 }}>
                No demand has {thresholds.MIN_COLLECTORS} or more collectors you can't serve.
              </div>
            ) : (
              <table className="tbl">
                <thead><tr>
                  <th>Demand</th>
                  <th className="num">Collectors looking</th>
                  <th className="num">Covered</th>
                  <th>Inventory that could increase relevance</th>
                </tr></thead>
                <tbody>
                  {gaps.slice(0, 6).map((g) => (
                    <tr key={g.tag}>
                      <td style={{ fontWeight: 500 }}>{T[g.tag] || g.tag}</td>
                      <td className="num mono">{g.unmetCollectors}<span className="faint"> of {g.collectors}</span></td>
                      <td className="num mono">{pctText(g.coverage)}</td>
                      <td>
                        {g.cards.slice(0, 3).map((id) => (
                          <span key={id} className="chip" style={{ marginRight: 4 }}>{card(id).name}</span>
                        ))}
                        {g.cardCount > 3 && <span className="faint" style={{ fontSize: 11 }}>+{g.cardCount - 3}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {strengths.length > 0 && (
              <>
                <div className="sect-t" style={{ marginTop: 14 }}>Strengths</div>
                <div className="faint" style={{ fontSize: 11.5, marginBottom: 6 }}>Where your inventory is most relevant today.</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {strengths.slice(0, 5).map((st) => (
                    <span key={st.tag} className="chip">{T[st.tag] || st.tag} <b className="mono">{pctText(st.coverage)}</b></span>
                  ))}
                </div>
              </>
            )}

            <div className="cv-basis">
              Ranked by collector reach, goals, then preference fit. Every signal is shown on each card;
              there is no hidden score. Gaps are shown when at least {thresholds.MIN_COLLECTORS} collectors
              are looking and coverage is below your average of {pctText(m.coverage)}.
            </div>
          </div>
        )}
      </div>
    </>
  );
}



/* ------------------------------- FUNNEL ------------------------------- */

/* Three regions, not one funnel. Collector Intent is a declaration; Transaction is
   collaborative work with a current actor; History is done. */
const REGIONS = [
  { group: "intent", label: "Collector Intent" },
  { group: "deal", label: "Deal Flow" },
  { group: "closed", label: "History" },
];

/* Responsibility is derived from nextAction() — the same helper the workspace
   ownership banner reads. There is no second ownership store. */
function stageOwnership(opps, stageId) {
  const list = opps.filter((o) => o.stage === stageId && isActive(o));
  let tp = 0, c = 0, none = 0;
  for (const o of list) {
    const owner = nextAction(o).owner;
    if (owner === "tp") tp++;
    else if (owner === "collector") c++;
    else none++;
  }
  return { total: list.length, tp, c, none };
}

/* Counts say how much exists. Vertical sequence says where it is going. Those are
   different jobs, so nothing here encodes volume as length, size, or intensity.

   The spine is drawn per row, not per region: each stage owns a node, and the
   connector segment runs through the row behind it. Region headers carry the same
   line behind their label, so a heading labels the journey without interrupting it. */
function LifecycleMap({ ctx, counts, stage, owner, onPick }) {
  const { opps } = ctx;
  const ordered = REGIONS.flatMap((r) => STAGES.filter((s) => s.group === r.group));
  const firstId = ordered[0].id;
  const lastId = ordered[ordered.length - 1].id;

  return (
    <div className="lc">
      {REGIONS.map((region) => {
        const stages = STAGES.filter((s) => s.group === region.group);
        return (
          <div key={region.group} className={"lc-region r-" + region.group}>
            <div className="lc-head">
              {region.group === "deal" && <span className="lc-cue" aria-hidden="true" />}
              <span className="lc-head-t">{region.label}</span>
            </div>

            {stages.map((s) => {
              const n = counts[s.id] || 0;
              const own = region.group === "deal" ? stageOwnership(opps, s.id) : null;
              const on = stage === s.id;
              const cls = ["lc-row", "n-" + s.id, on ? "on" : "",
                s.id === firstId ? "lc-first" : "", s.id === lastId ? "lc-last" : ""].filter(Boolean).join(" ");
              return (
                <div key={s.id} className={cls}>
                  {/* one hit area covering node, name, count, whitespace and chevron */}
                  <button className="lc-hit" onClick={() => onPick(s.id, null)}
                    aria-pressed={on && !owner}
                    aria-label={`Show all ${s.label} opportunities`} />
                  <span className="lc-node" aria-hidden="true" />
                  <span className="lc-name">
                    {stageNo(s.id) && <span className="lc-no mono">{stageNo(s.id)}</span>}
                    {s.label}
                  </span>
                  <span className="lc-cnt">{n}</span>

                  <span className="lc-own">
                    {own && own.total > 0 && (<>
                      <button className={"lc-pill tp" + (on && owner === "tp" ? " on" : "")}
                        onClick={() => onPick(s.id, owner === "tp" && on ? null : "tp")}
                        aria-pressed={on && owner === "tp"}
                        aria-label={nextStepCountLabel("tp", own.tp, s.label)}>
                        TP <b>{own.tp}</b>
                      </button>
                      <button className={"lc-pill" + (on && owner === "collector" ? " on" : "")}
                        onClick={() => onPick(s.id, owner === "collector" && on ? null : "collector")}
                        aria-pressed={on && owner === "collector"}
                        aria-label={nextStepCountLabel("collector", own.c, s.label)}>
                        C <b>{own.c}</b>
                      </button>
                      {own.none > 0 && (
                        <span className="lc-pill mute" title="Both sides have acted; nothing is outstanding">— <b>{own.none}</b></span>
                      )}
                    </>)}
                  </span>

                  <span className="lc-chev" aria-hidden="true"><Icon n="chev" s={13} /></span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Opportunities({ ctx }) {
  const { stageCounts, opps } = ctx;
  /* Selection is { stage, owner }. stage === "__all" is the cross-stage queue:
     every active opportunity regardless of stage, which is the one question the
     lifecycle map could not answer. Everything else is unchanged — picking a stage
     still lands on that stage's full set, and owner still cannot outlive it. */
  const [sel, setSel] = useState({ stage: null, owner: null });
  const pick = (stageId, owner) =>
    setSel((s) => (s.stage === stageId && s.owner === owner ? { stage: null, owner: null } : { stage: stageId, owner }));

  /* Same source as the per-stage pills: nextAction() via the active opportunity set. */
  const mine = opps.filter((o) => isActive(o) && o.stage !== "completed" && nextAction(o).owner === "tp");
  const queueOpen = sel.stage === ALL_STAGES;
  const oldest = mine.reduce((a, o) => Math.max(a, daysSince(o.updated)), 0);

  return (
    <>
      {/* The queue entry sits above the map because it is the more common question.
          The map remains the way to think stage by stage. */}
      <button className={"dq-entry" + (queueOpen ? " on" : "")} aria-pressed={queueOpen}
        onClick={() => pick(ALL_STAGES, "tp")}>
        <span className="dq-n mono">{mine.length}</span>
        <span className="dq-l">
          <b>Needs you</b>
          <span className="dq-sub">
            {mine.length === 0
              ? "Nothing needs you right now."
              : `Across every stage${oldest > 0 ? ` · longest waiting ${oldest} days` : ""}`}
          </span>
        </span>
        <span className="dq-go" aria-hidden="true"><Icon n="chev" s={13} /></span>
      </button>

      <div className="panel lc-card" style={{ marginBottom: 14 }}>
        <LifecycleMap ctx={ctx} counts={stageCounts} stage={sel.stage} owner={sel.owner} onPick={pick} />
      </div>

      {sel.stage && (
        <div className="panel">
          <StageDrilldown key={sel.stage} ctx={ctx} stage={queueOpen ? null : sel.stage} owner={sel.owner}
            onClose={() => setSel({ stage: null, owner: null })}
            onClearOwner={() => setSel((s) => ({ ...s, owner: null }))} standalone />
        </div>
      )}
    </>
  );
}

/* ------------------------ OPPORTUNITY WORKSPACE ------------------------ */

/* The single translation from canonical ownership to user-facing language. The
   stored values remain "tp" and "collector"; nothing new is persisted. Every
   surface that names a next step goes through this. */
const NEXT_STEP = { tp: "Trusted Partner", collector: "Collector" };
const nextStepLabel = (owner) => NEXT_STEP[owner] || null;
/* Concise accessible phrasing for the compact stage pills. */
const nextStepCountLabel = (owner, n, stageLabel) =>
  `${NEXT_STEP[owner]} next step — ${n} ${n === 1 ? "opportunity" : "opportunities"} in ${stageLabel}`;

/* Quiet workflow information, never an alarm: no red, no icon, no urgency copy. */
const NextStep = ({ owner }) => {
  const label = nextStepLabel(owner);
  if (!label) return <span className="faint" style={{ fontSize: 11.5 }}>—</span>;
  return (
    <span className={"nstep " + owner}>
      <span className="dot" />{label}
    </span>
  );
};

/* THE stock-image primitive. One resolver, one fallback, three sizes — every surface
   goes through this rather than reaching for a URL.

   A stock image answers "which printed card is this?". It is never evidence of what
   the TP's or a collector's actual copy looks like: physical front/back photos answer
   that, and the two are always presented as separate things.

   Resolution keys on the printed card only, so PSA 8, PSA 9 and a raw copy of the
   same printed card all show the same art. Failure is silent and card-shaped so no
   workflow can break on a missing image. */
/* Four tiers, chosen by how central the card is to the task rather than by screen.
   The card should be recognisable from its artwork before the name is read, so
   anything the TP scans or acts on gets real size; only genuinely incidental
   references stay small.

     thumbnail  the card is context for something else (deal economics, a queue row)
     browse     scanning many cards — artwork leads, density preserved
     feature    acting on this specific card — evaluating, matching, acquiring
     shelf      browsing what you physically hold — the card leads the row
     hero       the card is the subject of the screen                              */
const CARD_IMAGE_SIZES = { thumbnail: 34, browse: 54, feature: 124, shelf: 180, hero: 168 };

function CardImage({ card: c, size = "thumbnail", className = "" }) {
  const art = catalogImage(c && c.csvId);
  const [failed, setFailed] = useState(false);
  const w = CARD_IMAGE_SIZES[size] || CARD_IMAGE_SIZES.thumbnail;
  // dimensions are always reserved so a missing or slow image shifts nothing
  const box = { width: w, height: Math.round(w / 0.716) };   // standard card ratio
  if (!c || !art || failed) {
    return (
      <span className={"cimg empty " + className} style={box} aria-hidden="true"
        title={c && !c.csvId ? "No catalog match for this card" : "Card image unavailable"} />
    );
  }
  // small asset for list contexts, hi-res only where the card is the subject
  const src = size === "thumbnail" ? art[0] : art[1];
  return (
    <img className={"cimg " + className} style={box} src={src}
      loading="lazy" decoding="async" onError={() => setFailed(true)}
      alt={`${c.name} — ${c.set} ${c.num}`} />
  );
}

const OwnerBadge = ({ owner, label }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5,
    color: owner === "tp" ? "var(--t1)" : owner === "collector" ? "var(--amber)" : "var(--faint)",
  }}>
    <span className="dot" style={{ background: owner === "tp" ? "var(--t1)" : owner === "collector" ? "var(--amber)" : "var(--line)" }} />
    {label}
  </span>
);

/* Collector-owned actions have no Collector UI yet. They are simulated here, and
   deliberately fenced off so the ownership model stays honest: the Trusted Partner
   is never given authority to perform them for real. */
function SimBlock({ children, who }) {
  return (
    <div style={{ border: "1px dashed var(--amber-line)", background: "var(--amber-bg)", borderRadius: 4, padding: 11, marginTop: 12 }}>
      <div style={{ fontFamily: "Archivo", fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 600, color: "var(--amber)", marginBottom: 7 }}>
        Demo control · simulating {who} — not a Trusted Partner action
      </div>
      {children}
    </div>
  );
}

const Money = ({ v }) => <span className="mono">{v == null ? "—" : money(v)}</span>;

/* Agree on Price decision surface. One counter value lives here, in dollars, exactly
   as priceRespond already expects; the percentage field is a second way of typing
   that same number, converted on entry rather than kept alongside it. */
function PriceDecision({ opp, col, na, priceRespond }) {
  const [amt, setAmt] = useState("");
  const listed = opp.listedPrice;
  const last = lastEntry(opp.priceThread);
  if (!last) return null;

  // digits and one decimal point only, so negatives and stray text never reach state
  const clean = (v) => v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
  const pct = pctOfListed(amt, listed);
  const amountNum = Number(amt);
  const valid = amt !== "" && isFinite(amountNum) && amountNum > 0;

  const onPct = (v) => {
    const next = clean(v);
    if (next === "") return setAmt("");
    const dollars = amountFromPct(next, listed);
    if (dollars != null) setAmt(String(dollars));
  };

  const theirs = last.by !== "tp";
  const heading = theirs ? `${col.short}'s offer` : "Your counter";
  const standing = pctLabel(last.amount, listed);

  return (
    <div className="pn">
      <div className="pn-h">{heading}</div>
      <div className="pn-amt mono">{money(last.amount)}</div>
      <div className="pn-pct">{standing ? standing + " of listed price" : "listed price unavailable"}</div>

      {na.owner !== "tp" ? (
        /* Not the TP's turn: the same two numbers, no live form. Ownership comes
           from the existing nextAction logic, not from a new waiting flag. */
        <div className="pn-wait">Waiting on {col.short}</div>
      ) : (<>
        <button className="btn pri sm pn-accept" onClick={() => priceRespond(opp.id, "tp", "accept")}>
          Accept {money(last.amount)}
        </button>

        {canCounter(opp.priceThread, "tp") && (<>
          <div className="pn-or"><span>or counter</span></div>
          <div className="pn-in">
            <label className="pn-f">
              <span className="pn-fl">Amount</span>
              <span className="pn-w"><span className="pn-u">$</span>
                <input className="inp" type="text" inputMode="decimal" value={amt}
                  aria-label="Counter amount in dollars"
                  onChange={(e) => setAmt(clean(e.target.value))} />
              </span>
            </label>
            <label className="pn-f">
              <span className="pn-fl">% of listed</span>
              <span className="pn-w"><span className="pn-u r">%</span>
                <input className="inp r" type="text" inputMode="decimal"
                  value={pct == null ? "" : String(pct)}
                  aria-label="Counter as a percentage of listed price"
                  onChange={(e) => onPct(e.target.value)} />
              </span>
            </label>
          </div>
          <button className="btn sm pn-send" disabled={!valid}
            onClick={() => { priceRespond(opp.id, "tp", "counter", amountNum); setAmt(""); }}>
            Send counter
          </button>
        </>)}
      </>)}
    </div>
  );
}

function AmountInput({ value, onChange, onSubmit, label, disabled }) {
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <input className="inp" style={{ width: 96 }} type="number" value={value} onChange={(e) => onChange(e.target.value)} />
      <button className="btn sm" disabled={disabled || !Number(value)} onClick={onSubmit}>{label}</button>
    </span>
  );
}

function DealSummary({ ctx, opp }) {
  const { card, collector } = ctx;
  const cards = settledCards(opp);
  const dropped = [...withdrawnCards(opp), ...rejectedCards(opp)];
  const cb = cashBalance(opp);
  const col = collector(opp.collectorId);
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 4, overflow: "hidden" }}>
      <table className="tbl">
        <tbody>
          <tr>
            <td style={{ width: "58%" }}>
              <div className="cimg-row">
                <CardImage card={card(opp.cardId)} size="thumbnail" />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{cardShort(card(opp.cardId))}</div>
                  <div className="faint" style={{ fontSize: 11 }}>Card you're transferring · agreed purchase price</div>
                </div>
              </div>
            </td>
            <td className="num mono">{money(opp.agreedPrice)}</td>
          </tr>
          {cards.map((tc) => (
            <tr key={tc.id}>
              <td>
                <div className="cimg-row">
                  <CardImage card={card(tc.cardId)} size="thumbnail" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5 }}>{cardShort(card(tc.cardId))}</div>
                    <div className="faint mono" style={{ fontSize: 11 }}>
                      agreed market {money(tc.agreedMarket)} × agreed {pct(tc.agreedPercent)}
                    </div>
                  </div>
                </div>
              </td>
              <td className="num mono" style={{ color: "var(--t1)" }}>{"\u2212" + money(creditFor(tc))}</td>
            </tr>
          ))}
          {cards.length === 0 && (
            <tr><td className="muted" style={{ fontSize: 12.5 }}>No trade cards — cash only</td><td className="num mono">—</td></tr>
          )}
          <tr style={{ background: "#FAFBFC" }}>
            <td className="muted" style={{ fontSize: 12.5 }}>Total trade credit</td>
            <td className="num mono">{money(totalCredit(opp))}</td>
          </tr>
          {/* Base, adjustment and final are separate rows so the arithmetic is visible
              without a ledger, and so nobody mistakes an adjustment for a rewritten term. */}
          {cb && cb.adjustment !== 0 && (<>
            <tr>
              <td className="muted" style={{ fontSize: 12.5 }}>Base cash balance</td>
              <td className="num mono">{cb.base === 0 ? "—" : money(Math.abs(cb.base))}</td>
            </tr>
            <tr>
              <td className="muted" style={{ fontSize: 12.5 }}>Agreed cash adjustment</td>
              <td className="num mono">{(cb.adjustment < 0 ? "\u2212" : "+") + money(Math.abs(cb.adjustment))}</td>
            </tr>
          </>)}
          <tr style={{ background: "#F2F6F6" }}>
            <td style={{ fontSize: 12.5, fontWeight: 600 }}>
              {cb == null || cb.zero ? "Cash balance" : cb.payer === "collector" ? `${col.short} pays you` : `You pay ${col.short}`}
            </td>
            <td className="num mono" style={{ fontWeight: 600, fontSize: 14 }}>
              {cb == null ? "—" : cb.zero ? "No cash balance" : money(cb.amount)}
            </td>
          </tr>
        </tbody>
      </table>
      {dropped.length > 0 && (
        <div className="faint" style={{ fontSize: 11, padding: "7px 12px", borderTop: "1px solid var(--line-soft)" }}>
          Not part of this deal: {dropped.map((tc) => `${card(tc.cardId).name} (${tc.withdrawn ? col.short + " withdrew" : "you rejected"})`).join(", ")}.
        </div>
      )}
      <div className="faint" style={{ fontSize: 11, padding: "7px 12px", borderTop: "1px solid var(--line-soft)" }}>
        Every figure above was agreed card by card during Value Trade. Percentages differ per card because each was negotiated separately.
      </div>
    </div>
  );
}

/* ============================ CONVERSATION WORKSPACE ============================
   One universal workspace for a Trusted Partner x Collector x card identity.
   Four persistent regions: card context (top), stage map (left), conversation
   (center), current-stage controls (right). Opened by Reach Out, Continue Chat, or
   any active opportunity row — always the same component and the same thread. */

const STAGE_MAP = STAGES.map((s) => s.id);

/* Passed / current / upcoming, derived from lifecycle state only. Never clickable:
   the map describes the lifecycle, it cannot drive it. */
function StageMap({ stage, goal }) {
  const cur = STAGE_MAP.indexOf(stage);
  const skippedSecondary = goal && goal.tier === "primary" && !goal.secondarySince;
  return (
    <div className="ws-map">
      <div className="sect-t" style={{ padding: "0 0 8px" }}>Opportunity map</div>
      {STAGES.map((s, i) => {
        const state = i < cur ? "past" : i === cur ? "now" : "next";
        const skipped = s.id === "secondary" && skippedSecondary;
        return (
          <div key={s.id} className={"ws-stage " + (skipped ? "skip" : state)}>
            <span className="ws-dot" />
            <span className="ws-lbl">{s.label}</span>
            {skipped && <span className="ws-note">skipped</span>}
          </div>
        );
      })}
      <div className="faint" style={{ fontSize: 10.5, marginTop: 12, lineHeight: 1.5 }}>
        Stages advance only when the required action happens. This map can't move them.
      </div>
    </div>
  );
}

function Conversation({ ctx, thread, collectorId, cardId, disabled }) {
  const { collector, sendMessage } = ctx;
  const [draft, setDraft] = useState("");
  const entries = thread?.entries || [];
  const col = collector(collectorId);
  const send = (by) => { if (draft.trim()) { sendMessage(collectorId, cardId, by, draft.trim()); setDraft(""); } };

  return (
    <div className="ws-chat">
      <div className="ws-chat-scroll">
        {entries.length === 0 && (
          <div className="empty" style={{ padding: "36px 14px" }}>
            No conversation yet. Opening this workspace doesn't count as reaching out —<br />send a message to start the thread.
          </div>
        )}
        {entries.map((e) => e.kind === "event" ? (
          <div key={e.id} className="ws-event">
            <span className="ws-event-rule" />
            <span className="ws-event-txt">{e.text}</span>
            <span className="ws-event-rule" />
          </div>
        ) : (
          <div key={e.id} className={"ws-msg " + (e.by === "tp" ? "mine" : "theirs")}>
            <div className="ws-msg-who">{e.by === "tp" ? "You" : col.short}</div>
            <div className="ws-msg-body">{e.text}</div>
          </div>
        ))}
      </div>
      <div className="ws-composer">
        <textarea className="inp" rows={2} placeholder={`Message ${col.short} about this card…`}
          value={draft} onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) send("tp"); }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <button className="btn pri sm" disabled={!draft.trim()} onClick={() => send("tp")}>
            <Icon n="send" s={12} />Send
          </button>
          <span className="faint" style={{ fontSize: 11 }}>Messages don't change terms or move the stage.</span>
          <button className="btn sm" style={{ marginLeft: "auto", borderStyle: "dashed", color: "var(--amber)", borderColor: "var(--amber-line)" }}
            disabled={!draft.trim()} onClick={() => send("collector")} title="Demo control">
            Send as {col.short} (demo)
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Shared Trade Table ---------------------------------------------------
   ONE component and ONE data source (opp.trade.cards) for Select Trade and
   Value Trade. The rows are not rebuilt at the stage boundary — the same objects,
   with the same ids and photos, gain formal valuation history on submission.
   What changes between stages is permission, not identity. */

/* Five columns, not eleven. Identity folds into the Card cell permanently (the
   compact treatment introduced for the width fix), and each negotiation lives in
   one cell that shows both standing positions plus the agreed outcome. */
const TRADE_COLUMNS = ["Card", "Market Value", "Trade %", "Trade Credit", "Status"];

const PctInput = ({ value, onChange, onSubmit, label }) => (
  <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
    <input className="inp" style={{ width: 64 }} type="number" step="1" min="1" max="100"
      value={value} onChange={(e) => onChange(e.target.value)} placeholder="%" />
    <button className="btn sm" disabled={!(Number(value) > 0 && Number(value) <= 100)} onClick={onSubmit}>{label}</button>
  </span>
);

function TradeRow({ ctx, opp, tc }) {
  const { card, collector, tpReviewInclusion, tradeRemoveCard, tradeAttachPhotos,
    marketAction, percentAction, collectorWithdrawCard } = ctx;
  const [open, setOpen] = useState(false);
  const [mkt, setMkt] = useState("");
  const [pc, setPc] = useState("");
  const c = card(tc.cardId);
  const col = collector(opp.collectorId);
  const phase = cardPhase(tc);
  const st = cardOwner(tc);
  const dead = phase === PHASE.rejected || phase === PHASE.withdrawn;
  const missingPhotos = !tc.photos.front || !tc.photos.back;
  const defaultPct = Math.round(opp.tradeRate * 100);

  return (
    <>
      <tr className={"vt-row" + (dead ? " gone" : "")}>
        <td>
          <button className="vt-exp" onClick={() => setOpen(!open)} aria-expanded={open}
            title={open ? "Hide evidence" : "Show photos and history"}>{open ? "\u2212" : "+"}</button>
          <span style={{ fontWeight: 500 }}>{c.name}</span>
          <div className="vt-identline">
            {[c.grade, isRaw(c) ? c.condition : null, c.print, c.edition, c.set + " " + c.num, c.language].filter(Boolean).join(" · ")}
          </div>
        </td>

        {/* --- market cell: both positions + outcome --- */}
        <td className={"num" + (phase === PHASE.market ? " vt-live" : "")}>
          {phase === PHASE.inclusion ? <span className="faint">not yet</span>
            : marketAgreed(tc) ? <span className="mono vt-out">{money(tc.agreedMarket)}</span>
              : <span className="vt-pos">
                <span>{col.short} <b className="mono">{tc.collectorMarket == null ? "—" : money(tc.collectorMarket)}</b></span>
                <span>You <b className="mono">{tc.tpMarket == null ? "—" : money(tc.tpMarket)}</b></span>
              </span>}
        </td>

        {/* --- percentage cell --- */}
        <td className={"num" + (phase === PHASE.percent ? " vt-live" : "")}>
          {!marketAgreed(tc) ? <span className="faint">locked</span>
            : tc.agreedPercent != null ? <span className="mono vt-out">{pct(tc.agreedPercent)}</span>
              : <span className="vt-pos">
                <span>You <b className="mono">{pct(tc.tpPercent)}</b></span>
                <span>{col.short} <b className="mono">{pct(tc.collectorPercent)}</b></span>
              </span>}
        </td>

        <td className="num mono vt-agreed">
          {creditFor(tc) == null ? <span className="faint">—</span> : money(creditFor(tc))}
        </td>
        <td><span className={"vt-status " + st.tone}>{dead ? st.label : nextStepLabel(st.owner) + ": " + st.label}</span></td>
      </tr>

      {/* --- SELECT TRADE: TP decides inclusion; collector may pull an unreviewed draft --- */}
      {phase === PHASE.inclusion && (
        <tr className="vt-act"><td colSpan={5}>
          {opp.trade.submitted ? (
            <div className="vt-actions">
              <button className="btn sm pri" onClick={() => tpReviewInclusion(opp.id, tc.cardId, "accept")}>Accept into trade</button>
              <button className="btn sm dgr" onClick={() => tpReviewInclusion(opp.id, tc.cardId, "reject")}>Reject</button>
              {missingPhotos && (
                <span className="faint" style={{ fontSize: 10.5 }}>No photos on file — expand the row before deciding.</span>
              )}
            </div>
          ) : (
            <SimBlock who={col.short}>
              <div className="vt-actions">
                <span style={{ fontSize: 11.5 }}>Draft — not yet sent for your review.</span>
                {missingPhotos && (
                  <button className="btn sm" style={{ color: "var(--amber)", borderColor: "var(--amber-line)" }}
                    onClick={() => tradeAttachPhotos(opp.id, tc.cardId)}>Add front &amp; back photos</button>
                )}
                <button className="btn sm dgr" onClick={() => tradeRemoveCard(opp.id, tc.cardId)}>Remove from package</button>
              </div>
            </SimBlock>
          )}
        </td></tr>
      )}

      {/* --- VALUE TRADE, MARKET PHASE --- */}
      {phase === PHASE.market && (
        <tr className="vt-act"><td colSpan={5}>
          {st.owner === "tp" ? (
            <div className="vt-actions">
              <button className="btn sm pri" onClick={() => marketAction(opp.id, tc.cardId, "tp", "accept")}>
                Accept {money(tc.collectorMarket)}
              </button>
              <AmountInput value={mkt} onChange={setMkt} label="Propose market"
                onSubmit={() => { marketAction(opp.id, tc.cardId, "tp", "propose", Number(mkt)); setMkt(""); }} />
            </div>
          ) : (
            <SimBlock who={col.short}>
              <div className="vt-actions">
                {tc.collectorMarket == null ? (
                  <>
                    <span style={{ fontSize: 11.5 }}>Opening market proposal</span>
                    <AmountInput value={mkt} onChange={setMkt} label="Propose market"
                      onSubmit={() => { marketAction(opp.id, tc.cardId, "collector", "propose", Number(mkt)); setMkt(""); }} />
                  </>
                ) : (
                  <>
                    <button className="btn sm" onClick={() => marketAction(opp.id, tc.cardId, "collector", "accept")}>
                      Accept your {money(tc.tpMarket)}
                    </button>
                    <AmountInput value={mkt} onChange={setMkt} label="Counter market"
                      onSubmit={() => { marketAction(opp.id, tc.cardId, "collector", "counter", Number(mkt)); setMkt(""); }} />
                  </>
                )}
              </div>
            </SimBlock>
          )}
        </td></tr>
      )}

      {/* --- VALUE TRADE, PERCENTAGE PHASE --- */}
      {phase === PHASE.percent && (
        <tr className="vt-act"><td colSpan={5}>
          {st.owner === "tp" ? (
            <div className="vt-actions">
              {tc.collectorPercent != null && (
                <button className="btn sm pri" onClick={() => percentAction(opp.id, tc.cardId, "tp", "accept")}>
                  Accept {pct(tc.collectorPercent)} — credit {money(Math.round(tc.agreedMarket * tc.collectorPercent))}
                </button>
              )}
              {tc.tpPercent == null && (
                <button className="btn sm pri" onClick={() => percentAction(opp.id, tc.cardId, "tp", "propose", opp.tradeRate)}>
                  Propose your default {defaultPct}%
                </button>
              )}
              <PctInput value={pc} onChange={setPc} label={tc.tpPercent == null ? "Propose %" : "Counter %"}
                onSubmit={() => { percentAction(opp.id, tc.cardId, "tp", "propose", Number(pc) / 100); setPc(""); }} />
              <span className="faint" style={{ fontSize: 10.5 }}>
                on agreed market {money(tc.agreedMarket)}
              </span>
            </div>
          ) : (
            <SimBlock who={col.short}>
              <div className="vt-actions">
                <button className="btn sm" onClick={() => percentAction(opp.id, tc.cardId, "collector", "accept")}>
                  Accept {pct(tc.tpPercent)} — credit {money(Math.round(tc.agreedMarket * tc.tpPercent))}
                </button>
                <PctInput value={pc} onChange={setPc} label="Counter %"
                  onSubmit={() => { percentAction(opp.id, tc.cardId, "collector", "counter", Number(pc) / 100); setPc(""); }} />
                <button className="btn sm dgr" onClick={() => collectorWithdrawCard(opp.id, tc.cardId)}>
                  Withdraw — keep the card
                </button>
              </div>
            </SimBlock>
          )}
        </td></tr>
      )}

      {/* --- identical expansion in every phase --- */}
      {open && (
        <tr className="vt-exp-row"><td colSpan={5}>
          <div className="vt-evidence">
            {/* Stock art identifies WHICH card. The collector's photos are the evidence
                for THIS copy. Captioned and separated so the two never blur. */}
            <div className="vt-stock">
              <CardImage card={c} size="feature" />
              <span className="cimg-cap">Card</span>
            </div>
            <div className="vt-photos">
              {["front", "back"].map((side) => (
                <div key={side}>
                  <div className={"vt-photo" + (tc.photos[side] ? "" : " missing")}>
                    <span>{tc.photos[side] ? side + " photo\non file" : side + " photo\nmissing"}</span>
                  </div>
                  <span className="cimg-cap">Their copy · {side}</span>
                </div>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sect-t">This exact copy</div>
              <div className="kv"><span className="k">Identity</span><span className="v" style={{ fontSize: 11.5 }}>{c.name} · {c.grade}{isRaw(c) ? " · " + c.condition : ""} · {c.print} · {c.edition} · {c.set} {c.num} · {c.language}</span></div>
              <div className="kv"><span className="k">Certification</span><span className="v" style={{ fontSize: 11.5 }}>{tc.cert || "not graded"}</span></div>
              <div className="kv"><span className="k">Binder copy</span><span className="v" style={{ fontSize: 11.5 }}>{tc.binderId || "—"}</span></div>
              <div className="kv"><span className="k">Inclusion</span><span className="v" style={{ fontSize: 11.5 }}>
                {tc.inclusion === "proposed" ? "awaiting your review"
                  : tc.inclusion === "rejected" ? "you rejected this card" + (tc.reviewedAt ? " on " + fmtDate(tc.reviewedAt) : "")
                    : "accepted into the trade" + (tc.reviewedAt ? " on " + fmtDate(tc.reviewedAt) : "")}
              </span></div>
              {tc.withdrawn && <div className="kv"><span className="k">Withdrawn</span><span className="v" style={{ fontSize: 11.5 }}>{col.short} kept the card{tc.withdrawnAt ? " on " + fmtDate(tc.withdrawnAt) : ""}</span></div>}
              {fullyAgreed(tc) && <div className="kv"><span className="k">Trade credit</span><span className="v">{money(tc.agreedMarket)} × {pct(tc.agreedPercent)} = {money(creditFor(tc))}</span></div>}

              <div className="sect-t" style={{ marginTop: 10 }}>Market value history</div>
              {tc.valueThread.length === 0 && <div className="faint" style={{ fontSize: 11.5 }}>No market proposals yet.</div>}
              {tc.valueThread.map((e, i) => (
                <div key={i} className="vt-hist">
                  <span className="muted">{e.by === "tp" ? "You" : col.short} {e.type === "accept" ? "accepted" : "proposed"}</span>
                  <span className="mono">{money(e.amount)}</span>
                </div>
              ))}

              <div className="sect-t" style={{ marginTop: 10 }}>Trade % history</div>
              {tc.percentThread.length === 0 && <div className="faint" style={{ fontSize: 11.5 }}>Percentage opens once market value is agreed.</div>}
              {tc.percentThread.map((e, i) => (
                <div key={i} className="vt-hist">
                  <span className="muted">{e.by === "tp" ? "You" : col.short} {e.type === "accept" ? "accepted" : "proposed"}</span>
                  <span className="mono">{pct(e.percent)}</span>
                </div>
              ))}
            </div>
          </div>
        </td></tr>
      )}
    </>
  );
}

function TradeTable({ ctx, opp }) {
  const { collectorCards, card, collector, tradeAddCard, submitPackageForReview,
    collectorChooseCash, collectorStopPursuing, setDrawer, setNav } = ctx;
  const drafting = opp.stage === "select-trade";
  const cards = tradeCards(opp);
  const col = collector(opp.collectorId);

  const proposed = proposedCards(opp);
  const included = includedCards(opp);
  const active = activeTradeCards(opp);
  const settled = settledCards(opp);
  const stranded = allWithdrawn(opp);

  const inPackage = new Set(cards.map((c) => c.cardId));
  const addable = collectorCards.filter((cc) => cc.collectorId === opp.collectorId && cc.tpInterest && !inPackage.has(cc.cardId));

  return (
    <div className="vt-wrap">
      <div className="vt-head">
        <div>
          <div className="sect-t" style={{ margin: 0 }}>{drafting ? "Select Trade" : "Value Trade"}</div>
          <div className="faint" style={{ fontSize: 11.5 }}>
            {drafting
              ? "Which cards are part of this trade? Market value and percentage come next."
              : "Agree market value, then agree what percentage of it becomes trade credit."}
          </div>
        </div>
        <div className={"vt-progress" + ((drafting ? proposed.length === 0 && included.length > 0 : settled.length === active.length && active.length > 0) ? " done" : "")}>
          {drafting
            ? <><span className="mono">{included.length} accepted</span>{proposed.length ? <> · <span className="mono">{proposed.length}</span> to review</> : null}</>
            : <><span className="mono">{settled.length} of {active.length}</span> settled</>}
        </div>
      </div>

      <div className="vt-scroll">
        <table className="tbl vt">
          <thead><tr>
            {TRADE_COLUMNS.map((h, i) => <th key={h} className={"stick" + (i >= 1 && i <= 3 ? " num" : "")}>{h}</th>)}
          </tr></thead>
          <tbody>
            {cards.map((tc) => <TradeRow key={tc.id} ctx={ctx} opp={opp} tc={tc} />)}
            {cards.length === 0 && <tr><td colSpan={5} className="empty">No trade cards proposed yet.</td></tr>}
          </tbody>
          {!drafting && (
            <tfoot><tr>
              <td className="muted" style={{ fontSize: 12 }}>
                {settled.length} card{settled.length === 1 ? "" : "s"} settled
                {withdrawnCards(opp).length ? ` · ${withdrawnCards(opp).length} withdrawn` : ""}
              </td>
              <td className="num mono faint">—</td>
              <td className="num mono faint">—</td>
              <td className="num mono" style={{ fontWeight: 600 }}>{money(totalCredit(opp))}</td>
              <td />
            </tr></tfoot>
          )}
        </table>
      </div>

      {/* ---- stage controls ---- */}
      {drafting ? (
        !opp.trade?.submitted ? (
          <SimBlock who={col.short}>
            {addable.length > 0 && (
              <div style={{ marginBottom: 9 }}>
                <div style={{ fontSize: 11.5, marginBottom: 5 }}>Add an eligible card — only cards you've marked “Open to trade” in their binder appear here.</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {addable.map((cc) => (
                    <button key={cc.id} className="btn sm" onClick={() => tradeAddCard(opp.id, cc.cardId)}>
                      + {card(cc.cardId).name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {addable.length === 0 && cards.length === 0 && (
              <div style={{ fontSize: 12, marginBottom: 9 }}>None of their cards are flagged as trade-eligible, so cash is the only option.</div>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn sm pri" disabled={!cards.length} onClick={() => submitPackageForReview(opp.id)}>
                Send package for review
              </button>
              <button className="btn sm" onClick={() => collectorChooseCash(opp.id)}>Cash only, no trade</button>
              <span className="faint" style={{ fontSize: 11 }}>No market values needed yet — this stage only settles which cards participate.</span>
            </div>
          </SimBlock>
        ) : (
          <div className="vt-foot">
            {proposed.length
              ? <span className="muted">Accept or reject each proposed card. Valuation opens as soon as every card has a decision and at least one is accepted.</span>
              : included.length === 0
                ? <span style={{ color: "var(--amber)" }}>You rejected every card. Nothing can proceed to valuation.</span>
                : <span style={{ color: "var(--t1)" }}>Package settled — moving to Value Trade.</span>}
          </div>
        )
      ) : stranded ? (
        <SimBlock who={col.short}>
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            Every card was withdrawn. The agreed purchase price of {money(opp.agreedPrice)} still stands — {col.short} decides how to proceed.
          </div>
          <div className="vt-actions">
            <button className="btn sm pri" onClick={() => collectorChooseCash(opp.id)}>Continue as cash only</button>
            <button className="btn sm dgr" onClick={() => collectorStopPursuing(opp.id)}>Stop pursuing</button>
          </div>
        </SimBlock>
      ) : (
        <div className="vt-foot">
          {settled.length === active.length && active.length > 0 ? (
            <span style={{ color: "var(--t1)" }}>Every card has an agreed market and an agreed percentage. Trade credit {money(totalCredit(opp))} — moving to Deal.</span>
          ) : (
            <span className="muted">
              {active.length - settled.length} card{active.length - settled.length === 1 ? "" : "s"} still unresolved.
              Each needs an agreed market value and an agreed trade percentage.
            </span>
          )}
        </div>
      )}

      <div style={{ marginTop: 9 }}>
        <button className="btn sm" onClick={() => { setDrawer(null); setNav({ section: "collectors", collectorId: opp.collectorId, focus: "trade-binder" }); }}>
          View {col.short}'s Trade Binder
        </button>
      </div>
    </div>
  );
}

/* Coordination first, completion second. The two are visually separate because
   the plan is usually agreed days before the exchange happens. */
function FulfillmentPanel({ ctx, opp }) {
  const { collector, proposeFulfillment, collectorConfirmPlan, collectorRequestPlanRevision, confirmHandoff } = ctx;
  const f = opp.fulfillment;
  const col = collector(opp.collectorId);
  const agreed = planAgreed(f);
  const [draft, setDraft] = useState({ method: f.method, show: f.show, date: f.date, time: f.time, location: f.location, note: f.note });
  const [revNote, setRevNote] = useState("");
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const ready = planFieldsFilled(draft);

  return (
    <div>
      <div className="sect-t">Coordination — when and where</div>

      {agreed ? (
        <div className="fx-plan">
          <div className="fx-plan-t">{fulfillmentSummary(f)}</div>
          {f.note && <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>{f.note}</div>}
          <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>Agreed by both sides. Proposed {fmtDate(f.proposedAt)}.</div>
        </div>
      ) : (<>
        {f.revisionRequested && (
          <div className="fx-rev">
            <strong>{col.short} asked for a change:</strong> {f.revisionRequested.note}
          </div>
        )}

        <div className="fx-methods">
          {FULFILLMENT_METHODS.map((m) => (
            <button key={m.id} className={"fx-method" + (draft.method === m.id ? " on" : "")} onClick={() => set("method", m.id)}>
              {m.label}
            </button>
          ))}
        </div>

        {draft.method === "show" && (
          <div className="fx-fields">
            <label className="fld"><span>Show / event</span>
              <input className="inp" value={draft.show} onChange={(e) => set("show", e.target.value)} placeholder="Twin Cities Card Show" /></label>
            <label className="fld"><span>Date</span>
              <input className="inp" type="date" value={draft.date} onChange={(e) => set("date", e.target.value)} /></label>
          </div>
        )}
        {draft.method === "meetup" && (<>
          <div className="fx-fields">
            <label className="fld"><span>Date</span>
              <input className="inp" type="date" value={draft.date} onChange={(e) => set("date", e.target.value)} /></label>
            <label className="fld"><span>Time</span>
              <input className="inp" type="time" value={draft.time} onChange={(e) => set("time", e.target.value)} /></label>
          </div>
          <label className="fld"><span>Location</span>
            <input className="inp" value={draft.location} onChange={(e) => set("location", e.target.value)} placeholder="Dreamers Vault — Minneapolis" /></label>
        </>)}
        {draft.method && (
          <label className="fld"><span>Note (optional)</span>
            <input className="inp" value={draft.note} onChange={(e) => set("note", e.target.value)}
              placeholder={draft.method === "show" ? "Find me at table 214" : "Meet near the front counter"} /></label>
        )}

        {draft.method && (
          <div className="vt-actions">
            <button className="btn pri sm" disabled={!ready} onClick={() => proposeFulfillment(opp.id, draft)}>
              {f.proposedAt ? "Resubmit plan" : "Propose fulfillment plan"}
            </button>
            {!ready && <span className="faint" style={{ fontSize: 11 }}>
              {draft.method === "show" ? "Show name and date are needed." : "Date, time and location are needed."}
            </span>}
          </div>
        )}

        {planProposed(f) && !f.collectorConfirmedPlan && (
          <SimBlock who={col.short}>
            <div style={{ fontSize: 12, marginBottom: 7 }}>Proposed: {fulfillmentSummary(f)}{f.note ? ` — ${f.note}` : ""}</div>
            <div className="vt-actions">
              <button className="btn sm" onClick={() => collectorConfirmPlan(opp.id)}>Confirm this plan</button>
              <input className="inp" style={{ flex: 1, minWidth: 140 }} placeholder="Ask for a change" value={revNote} onChange={(e) => setRevNote(e.target.value)} />
              <button className="btn sm dgr" disabled={!revNote.trim()} onClick={() => { collectorRequestPlanRevision(opp.id, revNote); setRevNote(""); }}>Request revision</button>
            </div>
          </SimBlock>
        )}
      </>)}

      <div className="hr" />
      <div className="sect-t">Completion — did the exchange happen</div>
      {!agreed ? (
        <div className="faint" style={{ fontSize: 12 }}>Locked until the plan is agreed. Coordinate first.</div>
      ) : (<>
        <div className="vt-actions">
          <button className="btn pri sm" disabled={f.tpHandoff} onClick={() => confirmHandoff(opp.id, "tp")}>
            {f.tpHandoff ? "You confirmed handoff" : "Confirm handoff"}
          </button>
          <span className="faint" style={{ fontSize: 11.5 }}>
            You gave {col.short} the card and received your side of the exchange.
          </span>
        </div>
        <div className="faint" style={{ fontSize: 11.5, marginTop: 6 }}>
          {f.collectorReceipt ? `${col.short} confirmed receipt.` : `${col.short} has not confirmed receipt.`}
        </div>
        <SimBlock who={col.short}>
          <button className="btn sm" disabled={f.collectorReceipt} onClick={() => confirmHandoff(opp.id, "collector")}>Confirm receipt</button>
        </SimBlock>
      </>)}
    </div>
  );
}

/* Right region. Existing stage controls, unchanged, placed behind the stage they
   belong to. Goal stages are new here; every deal stage is the previous markup. */
function StageWorkspace({ ctx, opp, goal, matches }) {
  const { card, collector, setDrawer, setNav, setModal,
    priceRespond, dealAgree, dealAdjust, proposeFulfillment, collectorConfirmPlan, collectorRequestPlanRevision, confirmHandoff,
    collectorPromoteGoal, collectorConfirmGoal, collectorMakeOffer } = ctx;
  const [counter, setCounter] = useState("");
  const [values, setValues] = useState({});
  const [method, setMethod] = useState("");
  const [adjDraft, setAdjDraft] = useState("");
  const [revNote, setRevNote] = useState("");
  const [copy, setCopy] = useState(matches[0]?.invId || "");
  const chosen = matches.find((m) => m.invId === copy) || matches[0];
  // ask is optional, so fall back to the card's value for the suggested figure only
  const [offer, setOffer] = useState(
    chosen ? String(Math.round((chosen.ask ?? card(chosen.cardId)?.value ?? 0) * 0.9)) : "");

  const stage = opp ? opp.stage : goal.tier;
  const collectorId = opp ? opp.collectorId : goal.collectorId;
  const cardId = opp ? opp.cardId : goal.cardId;
  const col = collector(collectorId);
  const c = card(cardId);
  const na = nextAction(opp || { stage, deal: {}, fulfillment: {} });
  const close = () => setDrawer(null);
  const last = opp ? lastEntry(opp.priceThread) : null;

  return (
    <div className="ws-stagework">
      <div className={"ws-owner " + (na.owner || "none")}>
        <div className="ws-owner-h">{na.owner ? "Next step · " + nextStepLabel(na.owner) : "No next step"}</div>
        <div className="ws-owner-b">{na.label}</div>
      </div>

      {/* ---- INTENT STAGES ---- */}
      {!opp && (<>
        <div className="sect-t">{STAGE_LABEL[stage]}</div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          {stage === "secondary"
            ? "A secondary goal becomes primary only when the collector decides it has. You can talk about it, but you can't promote it."
            : matches.length
              ? "You hold a qualifying copy. Messaging them is fine — but only their offer opens a negotiation."
              : "You hold no qualifying copy. You can still talk about sourcing it."}
        </div>
        {goal.note && <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>“{goal.note}”</div>}
        <div className="hr" />
        <div className="kv"><span className="k">Last confirmed</span><span className="v" style={{ fontSize: 12 }}>{elapsedAgo(goal.confirmedAt)}</span></div>
        <div className="kv"><span className="k">Created</span><span className="v" style={{ fontSize: 12 }}>{fmtDate(goal.createdAt)}</span></div>

        <SimBlock who={col.short}>
          <div style={{ marginBottom: 9 }}>
            <button className="btn sm" onClick={() => collectorConfirmGoal(goal.id)}>Confirm goal is still accurate</button>
          </div>
          {stage === "secondary" ? (
            <button className="btn sm" onClick={() => collectorPromoteGoal(goal.id)}>Promote to Primary Goal</button>
          ) : matches.length === 0 ? (
            <div className="faint" style={{ fontSize: 12 }}>No offer is possible — you hold no qualifying copy.</div>
          ) : (
            <div>
              {matches.length > 1 && (
                <select className="inp" style={{ marginBottom: 7 }} value={copy || matches[0].invId} onChange={(e) => setCopy(e.target.value)}>
                  {matches.map((m) => <option key={m.invId} value={m.invId}>{money(m.ask)} · {m.cert || "no cert"}</option>)}
                </select>
              )}
              <div style={{ fontSize: 12, marginBottom: 6 }}>Offer against {money(chosen.ask)}:</div>
              <AmountInput value={offer} onChange={setOffer} label="Make offer"
                onSubmit={() => collectorMakeOffer(goal.id, Number(offer), chosen.invId)} />
            </div>
          )}
        </SimBlock>
      </>)}

      {/* ---- DEAL STAGES: existing controls, unchanged ---- */}
      {opp && (<>
        <div className="sect-t">Terms</div>
        <div className="kv"><span className="k">Listed price</span><span className="v"><Money v={opp.listedPrice} /></span></div>
        <div className="kv"><span className="k">Agreed price</span><span className="v"><Money v={opp.agreedPrice} /></span></div>
        {opp.trade && <div className="kv"><span className="k">Trade</span><span className="v" style={{ fontSize: 12 }}>{opp.trade.mode === "cash" ? "Cash only" : settledCards(opp).length + " card(s)"}</span></div>}
        {opp.agreedPrice != null && opp.trade && <div className="kv"><span className="k">Cash balance</span><span className="v" style={{ fontSize: 12 }}>{cashLabel(opp, col.short)}</span></div>}
          {opp.stage === "agree-price" && (<>
            <div className="hr" />
            <div className="sect-t">Price negotiation</div>
            <div style={{ marginBottom: 10 }}>
              {opp.priceThread.map((e, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--line-soft)", fontSize: 12.5 }}>
                  <span className="muted">{e.by === "tp" ? "You" : col.short} {e.type === "offer" ? "offered" : e.type === "counter" ? "countered" : e.type}</span>
                  <span className="mono">{money(e.amount)}{pctLabel(e.amount, opp.listedPrice) ? " · " + pctLabel(e.amount, opp.listedPrice) : ""}</span>
                </div>
              ))}
            </div>
            {opp.declined ? (
              <div className="faint" style={{ fontSize: 12.5 }}>{col.short} stopped pursuing this card. The record stays for history.</div>
            ) : (
              <PriceDecision opp={opp} col={col} na={na} priceRespond={priceRespond} />
            )}
            {na.owner === "collector" && !opp.declined && (
              <SimBlock who={col.short}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button className="btn sm" onClick={() => priceRespond(opp.id, "collector", "accept")}>Accept {money(last.amount)}</button>
                  <AmountInput value={counter} onChange={setCounter} label="Counter"
                    disabled={!canCounter(opp.priceThread, "collector")}
                    onSubmit={() => { priceRespond(opp.id, "collector", "counter", Number(counter)); setCounter(""); }} />
                  <button className="btn sm dgr" onClick={() => priceRespond(opp.id, "collector", "decline")}>Stop pursuing</button>
                </div>
              </SimBlock>
            )}
          </>)}

          {(opp.stage === "select-trade" || opp.stage === "value-trade") && <TradeTable ctx={ctx} opp={opp} />}

          {["deal", "fulfillment", "completed"].includes(opp.stage) && (<>
            <div className="hr" />
            <div className="sect-t">Deal summary</div>
            <DealSummary ctx={ctx} opp={opp} />
          </>)}

          {opp.stage === "deal" && (() => {
            const cb = cashBalance(opp);
            const d = opp.deal;
            const open = adjOpen(d);
            const last = lastEntry(d.adjThread);
            const mine = open && last.by === "collector";
            /* An adjustment is expressed as the balance the proposer wants to land on,
               so nobody has to reason about a signed delta. */
            const targetToAdj = (target) => {
              const t = Number(target);
              if (!isFinite(t)) return null;
              const signed = cb.base >= 0 ? t : -t;   // keep the current payer direction
              return signed - cb.base;
            };
            const preview = (adj) => cashLabel({ ...opp, deal: { ...d, agreedAdj: adj } }, col.short);
            return (<>
              <div style={{ marginTop: 12 }} className="sect-t">Cash adjustment</div>
              {d.agreedAdj != null ? (
                <div className="faint" style={{ fontSize: 12 }}>
                  Agreed adjustment of {money(Math.abs(d.agreedAdj))} applied. Upstream terms are unchanged.
                </div>
              ) : !open ? (
                <div className="faint" style={{ fontSize: 12 }}>
                  No adjustment proposed. The deal stands at {cashLabel(opp, col.short)}.
                </div>
              ) : (
                <div style={{ fontSize: 12.5 }}>
                  {last.by === "tp" ? "You" : col.short} proposed {preview(last.amount)}.
                </div>
              )}

              {d.agreedAdj == null && (
                <div className="vt-actions" style={{ marginTop: 8 }}>
                  {mine && (
                    <button className="btn pri sm" onClick={() => dealAdjust(opp.id, "tp", "accept")}>
                      Accept — {preview(last.amount)}
                    </button>
                  )}
                  <AmountInput value={adjDraft} onChange={setAdjDraft}
                    label={open ? "Counter balance" : "Propose balance"}
                    onSubmit={() => { const a = targetToAdj(adjDraft); if (a !== null && a !== 0) dealAdjust(opp.id, "tp", "propose", a); setAdjDraft(""); }} />
                  <span className="faint" style={{ fontSize: 10.5 }}>
                    the cash figure you want to land on — upstream terms stay as agreed
                  </span>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                <button className="btn pri sm" disabled={d.tpAgreed || open} onClick={() => dealAgree(opp.id, "tp")}>
                  {d.tpAgreed ? "You agreed" : "Agree to this deal"}
                </button>
                <span className="faint" style={{ fontSize: 11.5 }}>
                  {open ? "Settle the adjustment first" : d.collectorAgreed ? col.short + " has agreed" : col.short + " has not agreed yet"}
                </span>
              </div>

              <SimBlock who={col.short}>
                <div style={{ marginBottom: 8 }}>
                  <button className="btn sm" disabled={d.collectorAgreed || open} onClick={() => dealAgree(opp.id, "collector")}>Agree to this deal</button>
                </div>
                {d.agreedAdj == null && (
                  <div className="vt-actions">
                    {open && last.by === "tp" && (
                      <button className="btn sm" onClick={() => dealAdjust(opp.id, "collector", "accept")}>
                        Accept — {preview(last.amount)}
                      </button>
                    )}
                    <AmountInput value={adjDraft} onChange={setAdjDraft}
                      label={open ? "Counter balance" : "Propose balance"}
                      onSubmit={() => { const a = targetToAdj(adjDraft); if (a !== null && a !== 0) dealAdjust(opp.id, "collector", "propose", a); setAdjDraft(""); }} />
                  </div>
                )}
              </SimBlock>
            </>);
          })()}

          {opp.stage === "fulfillment" && (<>
            <div className="hr" />
            <FulfillmentPanel ctx={ctx} opp={opp} />
          </>)}

          {opp.stage === "completed" && (
            <div className="notice" style={{ marginTop: 12, marginBottom: 0 }}>
              Completed {fmtDate(opp.completedAt)} · {fulfillmentSummary(opp.fulfillment)}. These terms are preserved as history.
            </div>
          )}

      </>)}
    </div>
  );
}

/* Top region. Card identity is the anchor and never scrolls away. Copy-specific
   detail only appears once an offer has bound the conversation to a physical copy. */
function CardContext({ ctx, c, matches, opp, thread }) {
  const { collector, goalsForIdentity, setDrawer, setNav } = ctx;
  const boundInv = opp && opp.invId ? matches.find((m) => m.invId === opp.invId) : null;
  const serves = goalsForIdentity(c.id);
  const others = serves.primary.length + serves.secondary.length;
  const asks = [...new Set(matches.map((m) => m.ask))].sort((a, b) => a - b);
  const negotiating = opp && DEAL_STAGES.indexOf(opp.stage) >= 0;

  return (
    <div className="ws-top">
      <div className="ws-stock">
        <CardImage card={c} size="hero" />
        <span className="cimg-cap">Card</span>
      </div>
      <div className="ws-photos">
        {["Front", "Back"].map((side) => {
          const img = boundInv && boundInv.photos ? boundInv.photos[side.toLowerCase()] : null;
          return (
            <div key={side}>
              <div className={"ws-photo" + (boundInv && !img && negotiating ? " req" : "")}>
                {img ? <img src={img} alt={`Your copy — ${side}`} /> : (
                  <span>{boundInv && negotiating ? side + " photo required" : side}</span>
                )}
              </div>
              <span className="cimg-cap">Your copy · {side}</span>
            </div>
          );
        })}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="disp" style={{ fontSize: 16, fontWeight: 600 }}>{c.name}</div>
        <div className="ws-ident">
          <span><b>{c.grade}</b></span>
          {isRaw(c) && <span>{c.condition}</span>}
          <span>{c.print}</span>
          <span>{c.set} · {c.num}</span>
          {c.edition !== "Standard" && <span>{c.edition}</span>}
          <span>{c.language}</span>
        </div>
        {others > 1 && (
          <div className="faint" style={{ fontSize: 11.5, marginTop: 5 }}>
            Also wanted by {others - 1} other collector{others - 1 === 1 ? "" : "s"} at this exact identity.
          </div>
        )}
      </div>
      <div className="ws-invbox">
        {matches.length === 0 ? (
          <>
            <div className="ws-inv-status un">No matching inventory currently available</div>
            <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>You can still talk about sourcing it.</div>
          </>
        ) : boundInv ? (
          <>
            <div className="ws-inv-status ok">Negotiating one specific copy</div>
            <div className="mono" style={{ fontSize: 15, marginTop: 2 }}>{money(boundInv.ask)}</div>
            <div className="faint mono" style={{ fontSize: 11 }}>{boundInv.cert || "no cert"}</div>
          </>
        ) : (
          <>
            <div className="ws-inv-status ok">Matched · {matches.length === 1 ? "1 copy" : matches.length + " copies"}</div>
            <div className="mono" style={{ fontSize: 15, marginTop: 2 }}>
              {asks.length === 1 ? money(asks[0]) : money(asks[0]) + "–" + money(asks[asks.length - 1])}
            </div>
            <button className="link" style={{ fontSize: 11.5 }} onClick={() => setDrawer({ type: "invItem", invId: matches[0].invId })}>
              View inventory
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* The single entry point. Resolves goal, opportunity and thread from whichever
   identifier the caller had, so every route lands on the same workspace. */
function ConversationWorkspace({ ctx, goalId, oppId }) {
  const { goals, opps, card, collector, threadFor, goalMatches, setDrawer, setNav } = ctx;

  const opp = oppId ? opps.find((o) => o.id === oppId) : null;
  const collectorId = opp ? opp.collectorId : goals.find((g) => g.id === goalId)?.collectorId;
  const cardId = opp ? opp.cardId : goals.find((g) => g.id === goalId)?.cardId;
  const c = cardId ? card(cardId) : null;

  // the goal behind an opportunity, matched on identity rather than id
  const goal = useMemo(() => {
    if (goalId) return goals.find((g) => g.id === goalId) || null;
    if (!opp) return null;
    const want = identityKey(card(opp.cardId));
    return goals.find((g) => g.collectorId === opp.collectorId && identityKey(card(g.cardId)) === want) || null;
  }, [goalId, goals, opp, card]);

  // a goal row whose collector has already opened a negotiation shows that negotiation
  const liveOpp = useMemo(() => {
    if (opp) return opp;
    if (!goal) return null;
    const want = identityKey(card(goal.cardId));
    return opps.find((o) => o.collectorId === goal.collectorId && identityKey(card(o.cardId)) === want) || null;
  }, [opp, goal, opps, card]);

  const matches = useMemo(() => (goal ? goalMatches(goal) : []), [goal, goalMatches]);
  const thread = collectorId && cardId ? threadFor(collectorId, cardId) : null;
  if (!c || !collectorId) return null;

  const stage = liveOpp ? liveOpp.stage : goal ? goal.tier : "secondary";
  const col = collector(collectorId);
  const close = () => setDrawer(null);

  return (
    <div className="ovl" onClick={close}>
      <div className="ws" onClick={(e) => e.stopPropagation()}>
        <div className="ws-head">
          <div>
            <h3 className="disp" style={{ margin: 0, fontSize: 15 }}>{col.name}</h3>
            <div className="faint" style={{ fontSize: 11.5 }}>{STAGE_LABEL[stage]} · one conversation, all stages</div>
          </div>
          <button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => { close(); setNav({ section: "collectors", collectorId }); }}>
            Collector profile
          </button>
          <button className="x" onClick={close} aria-label="Close"><Icon n="x" s={15} /></button>
        </div>

        <CardContext ctx={ctx} c={c} matches={matches} opp={liveOpp} thread={thread} />

        <div className={"ws-body" + (TXN_STAGES.includes(stage) ? " txn" : "")}>
          <StageMap stage={stage} goal={goal} />
          <Conversation ctx={ctx} thread={thread} collectorId={collectorId} cardId={cardId} />
          <StageWorkspace ctx={ctx} opp={liveOpp} goal={goal} matches={matches} />
        </div>
      </div>
    </div>
  );
}

/* Secondary Goal and Primary Goal share one schema, one component, and one sort
   implementation. Each column supplies a sort value read from the underlying data,
   never from the rendered string. Numbers sort numerically, strings alphabetically,
   and null means "not applicable" — those rows land at the end of an ascending sort. */
const GOAL_COLUMNS = [
  { h: "Collector", val: (r) => r.collectorName },
  { h: "Card", val: (r) => r.c.name },
  { h: "Graded", val: (r) => GRADED_VALUES.indexOf(r.c.grade) },
  // raw conditions run Near Mint -> Damaged; PSA rows have none, so they sit after
  { h: "Condition", val: (r) => (isRaw(r.c) ? CONDITION_VALUES.indexOf(r.c.condition) : CONDITION_VALUES.length) },
  { h: "Print", val: (r) => PRINT_VALUES.indexOf(r.c.print) },
  { h: "Set", val: (r) => r.c.set },
  { h: "Set #", val: (r) => parseSetNum(r.c.num) },
  { h: "Language", val: (r) => r.c.language },
  { h: "Inventory Match", num: true, val: (r) => r.matches.length },
  { h: "Listed Price", num: true, val: (r) => (r.asks.length ? r.asks[0] : null) },
  // ascending = longest without reconfirmation first; descending = freshest first
  { h: "Last Confirmed", num: true, val: (r) => new Date(r.g.confirmedAt + "T12:00:00").getTime() },
];

/* "4/102" -> 4, "043/185" -> 43, "107/105" -> 107. Values with no leading number
   (e.g. "—") return the raw string and are ordered after the numeric ones. */
function parseSetNum(num) {
  const m = String(num).match(/^\s*(\d+)/);
  return m ? Number(m[1]) : String(num);
}

function compareBy(col, a, b) {
  const av = col.val(a), bv = col.val(b);
  const empty = (v) => v == null || (typeof v === "number" && Number.isNaN(v));
  if (empty(av) && empty(bv)) return 0;
  if (empty(av)) return 1;
  if (empty(bv)) return -1;
  const an = typeof av === "number", bn = typeof bv === "number";
  if (an && bn) return av - bv;
  if (an !== bn) return an ? -1 : 1;   // parseable numbers before string fallbacks
  return String(av).localeCompare(String(bv));
}

const SortIndicator = ({ dir }) => (
  <span className="ind" aria-hidden="true">{dir === "desc" ? "\u2193" : "\u2191"}</span>
);

/* Primary opens on freshest confirmed intent so the TP can follow up while the
   signal is current. Secondary keeps seed order until the TP sorts it. */
const DEFAULT_SORT = { primary: { key: "Last Confirmed", dir: "desc" }, secondary: null };

function GoalRowTable({ ctx, stage, rows }) {
  const { card, collector, setNav, setDrawer, goalMatches, hasConversation } = ctx;
  const [sort, setSort] = useState(() => DEFAULT_SORT[stage] || null);

  const onHeader = (h) =>
    setSort((s) => (s && s.key === h ? { key: h, dir: s.dir === "asc" ? "desc" : "asc" } : { key: h, dir: "asc" }));

  const prepared = useMemo(() => {
    const out = rows.map((g) => {
      const c = card(g.cardId);
      const matches = goalMatches(g);
      const asks = [...new Set(matches.map((m) => m.ask))].sort((x, y) => x - y);
      return { g, c, matches, asks, collectorName: collector(g.collectorId)?.name || "" };
    });
    if (!sort) return out;
    const col = GOAL_COLUMNS.find((x) => x.h === sort.key);
    if (!col) return out;
    const sorted = [...out].sort((a, b) => compareBy(col, a, b));
    return sort.dir === "desc" ? sorted.reverse() : sorted;
  }, [rows, sort, card, collector, goalMatches]);

  return (
    <div className="tbl-scroll">
      <table className="tbl">
        <thead><tr>
          {GOAL_COLUMNS.map((col) => {
            const on = sort && sort.key === col.h;
            return (
              <th key={col.h} className={"stick sortable" + (col.num ? " num" : "")}
                aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                <button className={"th-btn" + (on ? " on" : "")} onClick={() => onHeader(col.h)}
                  title={"Sort by " + col.h}>
                  <span>{col.h}</span>
                  <SortIndicator dir={on ? sort.dir : "asc"} />
                </button>
              </th>
            );
          })}
          <th className="stick" style={{ textAlign: "right" }}>Reach Out</th>
        </tr></thead>
        <tbody>
          {prepared.map(({ g, c, matches, asks }) => {
            const price = asks.length === 0 ? "—"
              : asks.length === 1 ? money(asks[0])
                : money(asks[0]) + "–" + money(asks[asks.length - 1]);
            return (
              <tr key={g.id}>
                <td><button className="link" onClick={() => setNav({ section: "collectors", collectorId: g.collectorId })}>{collector(g.collectorId)?.short}</button></td>
                <td>
                  <span className="cimg-row">
                    <CardImage card={c} size="browse" />
                    <span style={{ fontWeight: 500 }}>{c.name}</span>
                  </span>
                </td>
                <td className="mono" style={{ fontSize: 11.5 }}>{c.grade}</td>
                <td style={{ fontSize: 12 }}>{isRaw(c) ? c.condition : <span className="faint">—</span>}</td>
                <td style={{ fontSize: 12 }}>{c.print}</td>
                <td style={{ fontSize: 12 }}>
                  {c.set}
                  {c.edition !== "Standard" && <div className="faint" style={{ fontSize: 10.5 }}>{c.edition}</div>}
                </td>
                <td className="mono" style={{ fontSize: 11.5 }}>{c.num}</td>
                <td style={{ fontSize: 12 }}>{c.language}</td>
                <td className="num" style={{ fontSize: 12 }}>
                  {matches.length === 0
                    ? <span className="faint">Unmatched</span>
                    : <span style={{ color: "var(--t1)", fontWeight: 500 }}>Matched</span>}
                </td>
                <td className="num mono" style={{ fontSize: 12 }}>{price}</td>
                <td className="num mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>{elapsedAgo(g.confirmedAt)}</td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn sm" onClick={() => setDrawer({ type: "workspace", goalId: g.id })}>
                    {hasConversation(g.collectorId, g.cardId) ? "Continue Chat" : "Reach Out"}
                  </button>
                </td>
              </tr>
            );
          })}
          {prepared.length === 0 && <tr><td colSpan={GOAL_COLUMNS.length + 1} className="empty">Nothing sits in {STAGE_LABEL[stage]} right now.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* Deal-stage drilldown columns. Next Step sorts on canonical ownership rank, so
   "Trusted Partner first" is a real sort the user can replace, not a pinned group. */
const DRILL_COLUMNS = [
  { h: "Collector", val: (r) => r.collectorName },
  { h: "Card", val: (r) => r.cardName },
  { h: "Detail", val: (r) => r.sortValue },
  /* Sorts on the canonical sequence, so Stage orders by deal progress rather than
     alphabetically by label. Unnumbered states sort last. */
  { h: "Stage", val: (r) => STAGE_NUMBER[r.stage] || 99, num: true },
  /* Waiting was previously buried as "updated N days ago" inside the free-text
     Detail column and could not be sorted on. It is now its own column with a
     numeric comparator, so the longest-waiting item can lead. */
  { h: "Waiting", num: true, val: (r) => r.waitingDays },
  { h: "Next Step", val: (r) => (r.owner === "tp" ? 0 : 1) },
];
const DRILL_DEFAULT = { key: "Next Step", dir: "asc" };
/* Cross-stage view: no stage to order by, so the longest wait leads. */
const DRILL_ALL_DEFAULT = { key: "Waiting", dir: "desc" };
/* Sentinel selection meaning "no stage filter". Kept distinct from null so the
   existing "nothing selected" state still closes the drilldown. */
const ALL_STAGES = "__all";

function StageDrilldown({ ctx, stage, owner, onClose, onClearOwner, standalone }) {
  const { goals, model, opps, card, collector, setNav, setDrawer, ownedIds, inventory } = ctx;
  /* stage === null is the cross-stage view: every active deal-flow opportunity,
     ordered by how long it has been waiting. Same component, same row builder,
     same sort contract — the stage filter simply becomes optional. */
  const allStages = stage == null;
  const label = allStages ? "Needs you" : STAGE_LABEL[stage];
  const invByCard = (cid) => inventory.find((i) => i.cardId === cid && !i.archived);

  const [sort, setSort] = useState(allStages ? DRILL_ALL_DEFAULT : DRILL_DEFAULT);
  const onSort = (h) => setSort((s2) => (s2.key === h ? { key: h, dir: s2.dir === "asc" ? "desc" : "asc" } : { key: h, dir: "asc" }));
  const isGoalStage = stage === "primary" || stage === "secondary";
  const goalRows = isGoalStage ? ctx.goalsAtStage(stage) : [];
  /* Filtering selects rows. It never touches opportunity state. */
  /* Archived is a destination, not a stage the record sits in, so it selects on the
     archive flag. Active stages show active records only. */
  const inStage = (o) => allStages
    ? (isActive(o) && o.stage !== "completed")
    : (stage === "archived" ? isArchived(o) : o.stage === stage && isActive(o));
  const built = isGoalStage ? [] : opps.filter((o) => inStage(o) && (!owner || nextAction(o).owner === owner))
    .map((o) => ({ k: o.id, collectorId: o.collectorId, cardId: o.cardId,
      collectorName: collector(o.collectorId)?.name || "",
      cardName: card(o.cardId)?.name || "",
      sortValue: oppValue(o),
      waitingDays: daysSince(o.updated),
      owner: nextAction(o).owner,
      stage: o.stage,
      action: nextAction(o).label,
      extra: isArchived(o)
        ? `${money(oppValue(o))} · archived from ${STAGE_LABEL[o.archivedFrom || o.stage]}`
        : money(oppValue(o)),
      opp: o }));
  /* Array#sort is stable, so whatever order the opportunity list already carried
     survives inside each Next Step group as the secondary ordering. */
  const col = DRILL_COLUMNS.find((x) => x.h === sort.key) || DRILL_COLUMNS[DRILL_COLUMNS.length - 1];
  const sorted = [...built].sort((a, b) => {
    const av = col.val(a), bv = col.val(b);
    const r = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sort.dir === "desc" ? -r : r;
  });
  const rows = isGoalStage ? goalRows : sorted;
  const stageTotal = isGoalStage ? goalRows.length : opps.filter(inStage).length;

  return (
    <div style={standalone ? undefined : { borderTop: "1px solid var(--line)", background: "#FBFCFD" }}>
      <div className="ph" style={{ borderBottom: "1px solid var(--line-soft)" }}>
        <h2>{label} — {owner ? `${rows.length} of ${stageTotal}` : rows.length} {stageTotal === 1 && !owner ? "opportunity" : "opportunities"}</h2>
        {owner && <span className="note" style={{ marginLeft: 0 }}>
          Next Step · {nextStepLabel(owner)}{allStages ? " · every stage" : ""}
        </span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {owner && <button className="btn sm" onClick={onClearOwner}>Show all {stageTotal}</button>}
          <button className="btn sm" onClick={onClose}>{standalone ? (allStages ? "Close" : "Close stage") : "Close"}</button>
        </span>
      </div>
      {isGoalStage ? <GoalRowTable key={stage} ctx={ctx} stage={stage} rows={goalRows} /> : (
      <div style={standalone ? undefined : { maxHeight: 300, overflowY: "auto" }}>
        <table className="tbl">
          <thead><tr>
            {DRILL_COLUMNS.map((col) => {
              const on = sort.key === col.h;
              return (
                <th key={col.h} className={"sortable" + (col.num ? " num" : "")}
                  aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                  <button className={"th-btn" + (on ? " on" : "")} onClick={() => onSort(col.h)}
                    title={"Sort by " + col.h}>
                    <span>{col.h}</span>
                    <span className="ind" aria-hidden="true">{on && sort.dir === "desc" ? "\u2193" : "\u2191"}</span>
                  </button>
                </th>
              );
            })}
            <th />
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const c = card(r.cardId);
              return (
                <tr key={r.k}>
                  <td><button className="link" onClick={() => setNav({ section: "collectors", collectorId: r.collectorId })}>{collector(r.collectorId)?.short}</button></td>
                  <td>
                    <span className="cimg-row">
                      <CardImage card={c} size="thumbnail" />
                      {invByCard(r.cardId) ? (
                        <button className="link" onClick={() => setDrawer({ type: "invItem", invId: invByCard(r.cardId).invId })}>{cardShort(c)}</button>
                      ) : (
                        <button className="link" onClick={() => setNav({ section: "inventory", tab: "cultivate", focus: c.id })}>{cardShort(c)}</button>
                      )}
                    </span>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {/* deal-specific detail only — the stage has its own column */}
                    <span style={{ color: r.unmet ? "var(--amber)" : undefined }}>{r.extra}</span>
                    {r.note ? <span className="faint"> — {r.note}</span> : null}
                  </td>
                  <td className="stage-c">
                    {r.stage && (stageNo(r.stage)
                      ? <><span className="stage-n mono">{stageNo(r.stage)}</span>{STAGE_LABEL[r.stage]}</>
                      : <span className="faint">{STAGE_LABEL[r.stage]}</span>)}
                  </td>
                  <td className="num mono" style={{ fontSize: 11.5, color: r.waitingDays > 30 ? "var(--amber)" : "var(--muted)" }}>
                    {r.waitingDays === 0 ? "today" : r.waitingDays + "d"}
                  </td>
                  <td>
                    <NextStep owner={r.opp ? nextAction(r.opp).owner : "collector"} />
                    {allStages && r.action && <div className="dq-act">{r.action.replace(/^You: /, "")}</div>}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn sm" onClick={() => setDrawer({ type: "workspace", oppId: r.opp.id })}>Open</button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="empty">
                {allStages && owner === "tp"
                  ? "Nothing needs you. Every open opportunity sits with a collector."
                  : `Nothing sits in ${label} right now.`}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>)}
    </div>
  );
}

/* ------------------------------ INVENTORY ------------------------------ */

/* Coverage: five layers of inventory intelligence, strongest signal first. Borrows
   the Opportunities progressive-disclosure pattern — the collapsed state is useful
   on its own, and expanding explains why the headline exists. Not a funnel: these
   are classifications of one inventory set, not sequential stages. */
function Coverage({ ctx }) {
  const { coverage, card, collector, setNav, setDrawer } = ctx;
  const [open, setOpen] = useState(null);
  const { layers, unaligned, total, uncoveredPrimary } = coverage;
  const pctOf = (r) => Math.round(r * 100) + "%";

  const headline = (id) => {
    const L = layers[id];
    switch (id) {
      case "deal": return `${L.opportunities} active opportunit${L.opportunities === 1 ? "y" : "ies"} · ${L.collectors} collector${L.collectors === 1 ? "" : "s"}`;
      case "primary": return L.inDealFlow
        ? `${L.available} available · ${L.inDealFlow} already in Deal Flow`
        : `${L.available} available · relevant to ${L.collectors} collector${L.collectors === 1 ? "" : "s"}`;
      case "secondary": return `${L.goals} secondary goal${L.goals === 1 ? "" : "s"} · relevant to ${L.collectors} collector${L.collectors === 1 ? "" : "s"}`;
      case "aging": return L.count ? `oldest held ${L.oldest} days` : `nothing held over ${L.threshold} days`;
      case "preference": return L.collectors ? `relevant to ${L.collectors} collector${L.collectors === 1 ? "" : "s"}` : "no remaining preference match";
      default: return "";
    }
  };

  return (
    <>
      <div className="panel cov-top">
        <div className="cov-lead">
          <span className="cov-big mono">{pctOf(coverage.connected / total)}</span>
          <span className="cov-lead-t">
            of your {total} items connect to collector demand through active deals
            or stated goals.
          </span>
        </div>
        {uncoveredPrimary.length > 0 && (
          <div className="cov-lead-note">
            <b>{uncoveredPrimary.length}</b> primary goal{uncoveredPrimary.length === 1 ? "" : "s"}
            {uncoveredPrimary.length === 1 ? " has" : " have"} no matching inventory.
            <button className="link" style={{ marginLeft: 6 }} onClick={() => setNav({ section: "inventory", tab: "cultivate" })}>
              See what to get
            </button>
          </div>
        )}
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        {COVERAGE_LAYERS.map((l) => {
          const L = layers[l.id];
          const on = open === l.id;
          return (
            <div key={l.id} className={"cov-layer" + (on ? " on" : "") + (L.count === 0 ? " zero" : "")}>
              <button className="cov-row" onClick={() => setOpen(on ? null : l.id)} aria-expanded={on}>
                <span className="cov-chev" aria-hidden="true"><Icon n="chev" s={12} /></span>
                <span className="cov-name">
                  {l.label}
                  <span className="cov-q">{l.q}</span>
                </span>
                <span className="cov-count mono">{L.count}</span>
                <span className="cov-share mono">{pctOf(L.share)}</span>
                <span className="cov-ctx">{headline(l.id)}</span>
              </button>

              {on && (
                <div className="cov-body">
                  {L.count === 0 ? (
                    <div className="empty" style={{ padding: "14px 0" }}>
                      Nothing here. Every item has a stronger collector signal above.
                    </div>
                  ) : (
                    <table className="tbl">
                      <thead><tr>
                        <th>Inventory</th>
                        <th>{l.id === "aging" ? "Held for" : l.id === "deal" ? "Active with" : "Relevant to"}</th>
                        <th className="num">Ask</th>
                        <th />
                      </tr></thead>
                      <tbody>
                        {L.items.slice(0, 12).map((r) => {
                          const c = card(r.inv.cardId);
                          return (
                            <tr key={r.inv.invId}>
                              <td>
                                <span className="cimg-row">
                                  <CardImage card={c} size="browse" />
                                  <span style={{ minWidth: 0 }}>
                                    <button className="link" onClick={() => setDrawer({ type: "invItem", invId: r.inv.invId })}>{cardShort(c)}</button>
                                    <div className="faint mono" style={{ fontSize: 11 }}>{c.grade} · {c.set} {c.num}</div>
                                  </span>
                                </span>
                              </td>
                              <td style={{ fontSize: 12 }}>
                                {l.id === "deal" && (
                                  <>
                                    <button className="link" onClick={() => setNav({ section: "collectors", collectorId: r.opp.collectorId })}>{collector(r.opp.collectorId).short}</button>
                                    <span className="faint"> · {STAGE_LABEL[r.opp.stage]}</span>
                                  </>
                                )}
                                {(l.id === "primary" || l.id === "secondary") && (
                                  <span className="cov-who">
                                    {r.goals.map((g) => (
                                      <button key={g.id} className="chip act" onClick={() => setNav({ section: "collectors", collectorId: g.collectorId })}>
                                        {collector(g.collectorId).short}
                                      </button>
                                    ))}
                                  </span>
                                )}
                                {l.id === "aging" && (
                                  <span className="mono">{r.days} days<span className="faint"> · no deal, goal or preference match</span></span>
                                )}
                                {l.id === "preference" && (
                                  <span className="cov-who">
                                    {r.who.slice(0, 4).map((w) => (
                                      <button key={w.collector.id} className="chip act" title={w.tags.map((t) => T[t] || t).join(", ")}
                                        onClick={() => setNav({ section: "collectors", collectorId: w.collector.id })}>
                                        {w.collector.short}
                                      </button>
                                    ))}
                                    {r.who.length > 4 && <span className="faint" style={{ fontSize: 11 }}>+{r.who.length - 4}</span>}
                                  </span>
                                )}
                              </td>
                              <td className="num mono">{money(r.inv.ask)}</td>
                              <td style={{ textAlign: "right" }}>
                                {l.id === "deal" && (
                                  <button className="btn sm" onClick={() => setDrawer({ type: "workspace", oppId: r.opp.id })}>Open deal</button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  {l.help && (l.id !== "primary" || L.inDealFlow > 0) && (
                    <div className="cov-aside">{l.help}</div>
                  )}
                  {L.items.length > 12 && (
                    <div className="faint" style={{ fontSize: 11, padding: "8px 0 0" }}>
                      Showing 12 of {L.items.length}.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className="cov-foot">
          Each item is counted once, under its strongest signal.
          {unaligned.length > 0 ? (
            <> <b>{unaligned.length}</b> item{unaligned.length === 1 ? "" : "s"} with no known collector relevance yet —{" "}
              {unaligned.slice(0, 3).map((i, k) => (
                <React.Fragment key={i.invId}>
                  {k > 0 && ", "}
                  <button className="link" onClick={() => setDrawer({ type: "invItem", invId: i.invId })}>{card(i.cardId).name}</button>
                </React.Fragment>
              ))}.
            </>
          ) : " Every item matches one of the five."}
        </div>
      </div>
    </>
  );
}

/* Current -> Coverage -> Cultivate: what I have, how well it serves my network,
   what I should get next. The network is now the intelligence layer underneath
   Inventory rather than a destination of its own. */
const INVENTORY_TABS = [
  { id: "mine", label: "Current", sub: "Everything you currently have in inventory." },
  { id: "coverage", label: "Coverage", sub: "See how your inventory connects to collector demand." },
  { id: "cultivate", label: "Cultivate", sub: "Cards most relevant to your network that you don’t have." },
];

function InventoryView({ ctx }) {
  const { nav, setNav } = ctx;
  const tab = nav.tab === "unmet" ? "cultivate" : nav.tab || "mine";   // old links still land somewhere sensible
  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <div className="tabs">
          {INVENTORY_TABS.map((t) => (
            <button key={t.id} className={"tab" + (tab === t.id ? " on" : "")}
              onClick={() => setNav({ ...nav, tab: t.id, focus: undefined })}>{t.label}</button>
          ))}
        </div>
        <div className="inv-sub">{INVENTORY_TABS.find((t) => t.id === tab)?.sub}</div>
      </div>
      {tab === "mine" && <MyInventory ctx={ctx} />}
      {tab === "coverage" && <Coverage ctx={ctx} />}
      {tab === "cultivate" && <Cultivate ctx={ctx} />}
    </>
  );
}

function MyInventory({ ctx }) {
  const { activeInv, card, demandFor, collector, nav, setNav, setDrawer, setModal, inventory } = ctx;
  const [q, setQ] = useState("");
  /* Condition filters on the physical copy's stored grade — exact match, never
     "or better". Raw is one option covering every ungraded copy; raw condition
     quality stays on the item itself rather than becoming a second dropdown. */
  const [cond, setCond] = useState("all");
  const [sort, setSort] = useState("recent");   // newest acquisition first
  const filter = nav.filter;

  /* Current inventory -> search -> condition -> acquisition-date sort -> render.
     Each control is independent; changing one never resets another. */
  const rows = useMemo(() => {
    let r = activeInv.map((i) => ({ inv: i, c: card(i.cardId), d: demandFor(i.cardId) })).filter((r) => r.c);
    if (filter?.collectorId) {
      r = r.filter(({ d }) => {
        if (filter.tier === "primary") return d.primary.some((g) => g.collectorId === filter.collectorId);
        if (filter.tier === "secondary") return d.secondary.some((g) => g.collectorId === filter.collectorId);
        if (filter.tier === "preference") return d.preference.some((p) => p.collectorId === filter.collectorId);
        return d.primary.some((g) => g.collectorId === filter.collectorId) || d.secondary.some((g) => g.collectorId === filter.collectorId) || d.preference.some((p) => p.collectorId === filter.collectorId);
      });
    }
    if (q.trim()) { const s = q.toLowerCase(); r = r.filter(({ c }) => (c.name + " " + c.set + " " + c.grade).toLowerCase().includes(s)); }
    if (cond !== "all") r = r.filter(({ c }) => c.grade === cond);
    /* Sorts on the copy's acquisition date — how long THIS copy has been held —
       never the card's release year. Undated copies stay visible and sort last in
       both directions rather than posing as newest or oldest. */
    const at = (r2) => { const t = r2.inv.acquired ? Date.parse(r2.inv.acquired) : NaN; return isFinite(t) ? t : null; };
    r = [...r].sort((a, b) => {
      const av = at(a), bv = at(b);
      if (av == null || bv == null) {
        if (av == null && bv == null) return a.c.name.localeCompare(b.c.name);
        return av == null ? 1 : -1;
      }
      return sort === "oldest" ? av - bv : bv - av;
    });
    return r;
  }, [activeInv, card, demandFor, q, cond, sort, filter]);

  return (
    <>
      {filter?.collectorId && (
        <div className="notice">
          <Icon n="people" s={15} />
          <span>Showing inventory that matches <strong>{collector(filter.collectorId)?.name}</strong>{filter.tier ? ` at the ${filter.tier} level` : ""} — {rows.length} card{rows.length === 1 ? "" : "s"}.</span>
          <button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => setNav({ section: "inventory", tab: "mine" })}>Clear filter</button>
        </div>
      )}
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="ph" style={{ gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "0 0 260px" }}>
            <span style={{ position: "absolute", left: 8, top: 7, color: "var(--faint)" }}><Icon n="search" s={14} /></span>
            <input className="inp" style={{ paddingLeft: 27 }} placeholder="Search card, set or grade" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {/* Condition: exact grade on the physical copy, from the model's own
              vocabulary rather than whatever happens to be in stock. */}
          <select className="inp" style={{ width: 160 }} value={cond} onChange={(e) => setCond(e.target.value)}>
            <option value="all">All conditions</option>
            {GRADED_VALUES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select className="inp" style={{ width: 150 }} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Most recent</option>
            <option value="oldest">Oldest</option>
          </select>
          <span className="note">{rows.length} of {activeInv.length} cards</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map(({ inv, c, d }) => <InventoryRow key={inv.invId} ctx={ctx} inv={inv} c={c} d={d} />)}
        {rows.length === 0 && (
          <div className="panel"><div className="empty">
            No cards match these filters. Clear a filter, or <button className="link" onClick={() => setModal({ type: "addInventory" })}>add inventory</button>.
          </div></div>
        )}
      </div>
    </>
  );
}

function InventoryRow({ ctx, inv, c, d }) {
  const { collector, setNav, setDrawer, setModal } = ctx;
  const [whyOpen, setWhyOpen] = useState(false);

  /* Who should I contact about this card? One list, built from the same goal
     matching as before — only the presentation changed. Primary is inserted first
     and a collector is never added twice, so the strongest intent wins for anyone
     holding both a primary and a secondary goal on this card. */
  const reachOut = useMemo(() => {
    const seen = new Map();
    for (const g of d.primary) if (!seen.has(g.collectorId)) seen.set(g.collectorId, { id: g.collectorId, tier: "primary", note: g.note });
    for (const g of d.secondary) if (!seen.has(g.collectorId)) seen.set(g.collectorId, { id: g.collectorId, tier: "secondary", note: g.note });
    const all = [...seen.values()];
    /* Grouped after deduplication, so a collector who qualifies both ways appears
       once — under Primary Goals, the stronger intent. */
    return {
      all,
      groups: [
        { tier: "primary", label: "Primary Goals", people: all.filter((p) => p.tier === "primary") },
        { tier: "secondary", label: "Secondary Goals", people: all.filter((p) => p.tier === "secondary") },
      ].filter((g) => g.people.length > 0),
    };
  }, [d]);

  return (
    /* The card owns the left column for the whole row height; MetYet's information
       stacks beside it. Nothing about that information changed — only where it sits. */
    <div className="panel inv-row">
      <div className="inv-art"><CardImage card={c} size="shelf" /></div>
      <div className="inv-body">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "12px 14px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <button className="link disp" style={{ fontSize: 14, fontWeight: 600, textDecoration: "none" }} onClick={() => setDrawer({ type: "invItem", invId: inv.invId })}>
            {cardTitle(c)}
          </button>
          <div style={{ display: "flex", gap: 5, marginTop: 5, flexWrap: "wrap" }}>
            {c.tags.slice(0, 5).map((t) => <span key={t} className="tag">{T[t] || t}</span>)}
          </div>
        </div>
        <div style={{ textAlign: "right", flex: "0 0 auto" }}>
          <div className="mono" style={{ fontSize: 14 }}>{money(inv.ask)}</div>
          <div className="faint" style={{ fontSize: 11 }}>cost {moneyExact(inv.cost)}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
          <button className="btn sm" onClick={() => setModal({ type: "card", invId: inv.invId })}>Edit</button>
          <button className="btn sm" onClick={() => setDrawer({ type: "invItem", invId: inv.invId })}>Open</button>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--line-soft)", background: "#FCFDFD", padding: "9px 14px" }}>
        {reachOut.all.length === 0 ? (
          <div className="faint" style={{ fontSize: 12.5 }}>No collector in your network currently wants this. Consider trading it out.</div>
        ) : (
          <>
            <div className="ro-h">Reach out</div>
            {/* The label carries the intent, so the names themselves can look alike.
                A group renders only when it has someone in it. */}
            {reachOut.groups.map((g) => (
              <div key={g.tier} className="ro-group">
                <div className="ro-tier">{g.label}</div>
                <div className="ro-list">
                  {/* the name IS the action — same outreach modal, scoped to this
                      collector, this card and their goal tier */}
                  {g.people.map((p) => (
                    <button key={p.id} className={"ro-name" + (p.tier === "primary" ? " p1" : "")}
                      title={p.note || ""}
                      onClick={() => setModal({ type: "outreach", cardId: c.id, collectorId: p.id, tier: p.tier })}>
                      {collector(p.id)?.short}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {d.preference.length > 0 && (
              <button className="link ro-why" onClick={() => setWhyOpen(!whyOpen)} aria-expanded={whyOpen}>
                {whyOpen ? "Hide" : "Why this matches"}
              </button>
            )}
            {whyOpen && (
              <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 3 }}>
                {d.preference.map((p, i) => (
                  <div key={i} style={{ fontSize: 11.5, display: "flex", gap: 7 }}>
                    <button className="link" style={{ flex: "0 0 92px", textAlign: "left" }} onClick={() => setNav({ section: "collectors", collectorId: p.collectorId })}>
                      {collector(p.collectorId)?.short}
                    </button>
                    <span className="faint">collects {p.tags.map((t) => T[t] || t).join(" + ")}</span>
                  </div>
                ))}
                <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>
                  Preference fit is context for a conversation, not a reason to start one. Outreach needs a goal.
                </div>
              </div>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}

function CardDrawer({ ctx, invId }) {
  const { inventory, card, demandFor, collector, setDrawer, setModal, setNav, archiveInv, opps } = ctx;
  const [why, setWhy] = useState(false);
  const inv = inventory.find((i) => i.invId === invId);
  if (!inv) return null;
  const c = card(inv.cardId);
  const d = demandFor(c.id);
  const related = opps.filter((o) => o.cardId === c.id);
  const close = () => setDrawer(null);

  return (
    <div className="ovl" onClick={close}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div className="cimg-row" style={{ alignItems: "flex-start", gap: 12 }}>
            <CardImage card={c} size="hero" />
            <div style={{ minWidth: 0 }}>
              <h3 className="disp">{c.name}</h3>
              <div className="faint" style={{ fontSize: 12 }}>{c.year} {c.set}{c.num !== "—" ? " #" + c.num : ""} · {c.grade}</div>
            </div>
          </div>
          <button className="x" onClick={close} aria-label="Close"><Icon n="x" s={15} /></button>
        </div>
        <div className="mb">
          <div className="kv"><span className="k">Ask price</span><span className="v">{money(inv.ask)}</span></div>
          <div className="kv"><span className="k">Your cost</span><span className="v">{moneyExact(inv.cost)}</span></div>
          <div className="kv"><span className="k">Margin at ask</span><span className="v">{moneyExact(inv.ask - inv.cost)}</span></div>
          <div className="kv"><span className="k">Acquired</span><span className="v">{fmtDate(inv.acquired)}</span></div>
          <div style={{ display: "flex", gap: 5, marginTop: 10, flexWrap: "wrap" }}>
            {c.tags.map((t) => <span key={t} className="tag">{T[t] || t}</span>)}
          </div>

          <div className="hr" />
          <div className="sect-t">Who this serves</div>
          {[["primary", "Primary Goals", "p1", d.primary], ["secondary", "Secondary Goals", "p2", d.secondary]].map(([k, lbl, cls, list]) => (
            <div key={k} style={{ marginBottom: 12 }}>
              <span className={"t-pill " + cls}>{lbl} <span className="mono">{list.length}</span></span>
              <div style={{ marginTop: 6 }}>
                {list.length === 0 && <div className="faint" style={{ fontSize: 12.5 }}>None yet.</div>}
                {list.map((g) => (
                  <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 0", borderBottom: "1px solid var(--line-soft)" }}>
                    <span className="av">{initials(collector(g.collectorId).name)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <button className="link" onClick={() => { close(); setNav({ section: "collectors", collectorId: g.collectorId }); }}>{collector(g.collectorId).name}</button>
                      {g.note && <div className="faint" style={{ fontSize: 11.5 }}>{g.note}</div>}
                    </div>
                    <button className="btn sm pri" onClick={() => setModal({ type: "outreach", cardId: c.id, collectorId: g.collectorId, tier: k })}>Reach out</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--faint)" }}>
            <span>Fits the stated preferences of {d.preference.length} collector{d.preference.length === 1 ? "" : "s"}</span>
            {d.preference.length > 0 && (
              <button className="link" style={{ fontSize: 11.5 }} onClick={() => setWhy(!why)} aria-expanded={why}>{why ? "Hide" : "Why this matches"}</button>
            )}
          </div>
          {why && (
            <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 3 }}>
              {d.preference.map((p, i) => (
                <div key={i} style={{ fontSize: 11.5, display: "flex", gap: 7 }}>
                  <button className="link" style={{ flex: "0 0 100px", textAlign: "left" }} onClick={() => { close(); setNav({ section: "collectors", collectorId: p.collectorId }); }}>
                    {collector(p.collectorId).short}
                  </button>
                  <span className="faint">collects {p.tags.map((t) => T[t] || t).join(" + ")}</span>
                </div>
              ))}
              <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>Passive signal. It won't open an opportunity on its own.</div>
            </div>
          )}

          {related.length > 0 && (<>
            <div className="hr" />
            <div className="sect-t">Open and past opportunities</div>
            {related.map((o) => (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 0", borderBottom: "1px solid var(--line-soft)" }}>
                <div style={{ flex: 1 }}>
                  <button className="link" onClick={() => { close(); setNav({ section: "collectors", collectorId: o.collectorId }); }}>{collector(o.collectorId).short}</button>
                  <div className="faint" style={{ fontSize: 11.5 }}>{STAGE_LABEL[o.stage]} · {money(oppValue(o))} · {ago(o.updated)}</div>
                </div>
                <button className="btn sm" onClick={() => { close(); setDrawer({ type: "workspace", oppId: o.id }); }}>Open</button>
              </div>
            ))}
          </>)}
        </div>
        <div className="mf">
          <button className="btn dgr" onClick={() => archiveInv(inv.invId)}>Archive card</button>
          <button className="btn" onClick={() => setModal({ type: "card", invId: inv.invId })}>Edit</button>
          <button className="btn pri" onClick={() => setModal({ type: "outreach", cardId: c.id })}>Reach out</button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- UNMET DEMAND ------------------------------ */


function PrefWhy({ ctx, list, lead }) {
  const { collector, setNav } = ctx;
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--faint)" }}>
        <span>{lead}</span>
        <button className="link" style={{ fontSize: 11.5 }} onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide" : "Why this matches"}</button>
      </div>
      {open && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
          {list.map((p) => (
            <div key={p.collectorId} style={{ fontSize: 11.5, display: "flex", gap: 7 }}>
              <button className="link" style={{ flex: "0 0 100px", textAlign: "left" }} onClick={() => setNav({ section: "collectors", collectorId: p.collectorId })}>{collector(p.collectorId).short}</button>
              <span className="faint">collects {p.tags.map((t) => T[t] || t).join(" + ")}</span>
            </div>
          ))}
          <div className="faint" style={{ fontSize: 11, marginTop: 3 }}>Preference fit doesn't create demand. Only a goal does.</div>
        </div>
      )}
    </div>
  );
}

/* -------------------------- COLLECTOR NETWORK -------------------------- */

/* One sorting mechanism: the column headers. Each comparator reads the value its
   column displays, from collectorFacts(), so a fact is never sorted differently from
   how it is shown.

   Nulls are not coerced. A collector with no completed deals has no deal value — not
   $0 — and one with no goals has no coverage — not 0%. Both sort after every real
   value in either direction, so they never masquerade as a genuine low figure. */
/* align drives both the header and the body cell, so the two can't drift apart.
   num values sort numerically; the rendered "3 new" string is never compared. */
const NET_COLUMNS = [
  { h: "Collector", w: "c-name", val: (r) => r.c.name, text: true, align: "left" },
  // sorts on the stored date, never the formatted tenure string
  { h: "Member since", w: "c-since", val: (r) => -new Date(r.f.memberSince).getTime(), num: true, align: "ctr" },
  /* Three separate questions, three separate numbers: what changed, how much they
     have shared, and how much of it the TP would take. All sort on the raw count. */
  { h: "New binder", w: "c-new", val: (r) => r.f.binderNew, num: true, align: "ctr" },
  { h: "Total binder", w: "c-tot", val: (r) => r.f.binderTotal, num: true, align: "ctr" },
  { h: "Open to trade", w: "c-open", val: (r) => r.f.binderOpen, num: true, align: "ctr" },
  { h: "Completed deals", w: "c-deals", val: (r) => r.f.completedDeals, num: true, align: "ctr" },
  { h: "Deal value", w: "c-val", val: (r) => (r.f.completedDeals === 0 ? null : r.f.dealValue), num: true, align: "num" },
  { h: "Coverage", w: "c-cov", val: (r) => r.f.coverage, num: true, align: "num" },
];
const NET_DEFAULT = { key: "Member since", dir: "desc" };   // longest-standing first

/* desc = "most first" for numbers, A->Z for text. Nulls sink in both directions. */
const netCompare = (col, dir) => (a, b) => {
  const av = col.val(a), bv = col.val(b);
  if (av == null || bv == null) {
    if (av == null && bv == null) return a.c.name.localeCompare(b.c.name);
    return av == null ? 1 : -1;
  }
  const r = col.text ? String(av).localeCompare(String(bv)) : bv - av;
  if (r === 0) return a.c.name.localeCompare(b.c.name);   // stable, direction-independent
  return dir === "desc" ? r : -r;
};

function CollectorList({ ctx }) {
  const { collectors, collectorFacts, setNav } = ctx;
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(NET_DEFAULT);
  /* Same column re-clicked reverses; a new column starts from its natural direction. */
  const onHeader = (h) => setSort((s2) => (s2.key === h ? { key: h, dir: s2.dir === "desc" ? "asc" : "desc" } : { key: h, dir: "desc" }));

  /* data -> search -> sort. Search narrows; the active column orders what remains.
     Neither stage resets the other. */
  const rows = useMemo(() => {
    let r = collectors.map((c) => ({ c, f: collectorFacts(c.id) }));
    if (q.trim()) { const t = q.toLowerCase(); r = r.filter(({ c }) => (c.name + " " + c.city).toLowerCase().includes(t)); }
    const col = NET_COLUMNS.find((x) => x.h === sort.key) || NET_COLUMNS[1];
    return [...r].sort(netCompare(col, sort.dir));
  }, [collectors, collectorFacts, q, sort]);


  return (
    <>
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="ph" style={{ gap: 8 }}>
          <div style={{ position: "relative", flex: "0 0 260px" }}>
            <span style={{ position: "absolute", left: 8, top: 7, color: "var(--faint)" }}><Icon n="search" s={14} /></span>
            <input className="inp" style={{ paddingLeft: 27 }} placeholder="Search name or city" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <span className="note">{q.trim() ? `${rows.length} of ${collectors.length}` : `${collectors.length} collectors`}</span>
        </div>
        <table className="tbl net-tbl">
          <colgroup>
            {NET_COLUMNS.map((col) => <col key={col.h} className={col.w} />)}
          </colgroup>
          <thead><tr>
            {NET_COLUMNS.map((col) => {
              const on = sort.key === col.h;
              return (
                <th key={col.h} className={"sortable " + col.align}
                  aria-sort={on ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}>
                  <button className={"th-btn" + (on ? " on" : "")} onClick={() => onHeader(col.h)}
                    title={"Sort by " + col.h}>
                    <span>{col.h}</span>
                    <SortIndicator dir={on ? sort.dir : "desc"} />
                  </button>
                </th>
              );
            })}
          </tr></thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={NET_COLUMNS.length} className="empty">No collectors match that search.</td></tr>
            )}
            {rows.map(({ c, f }) => {
              return (
                <tr key={c.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span className="av">{initials(c.name)}</span>
                      <div>
                        <button className="link" style={{ fontWeight: 600 }} onClick={() => setNav({ section: "collectors", collectorId: c.id })}>{c.name}</button>
                        {c.pending && <span className="tag" style={{ marginLeft: 6 }}>Invite pending</span>}
                        <div className="faint" style={{ fontSize: 11.5 }}>{c.city}</div>
                      </div>
                    </div>
                  </td>
                  {/* tenure: date leads, derived day count is secondary */}
                  <td className="ctr">
                    <div style={{ fontSize: 12.5 }}>{fmtDate(f.memberSince)}</div>
                    <div className="faint mono" style={{ fontSize: 11 }}>
                      {f.memberDays} {f.memberDays === 1 ? "day" : "days"}
                    </div>
                  </td>
                  {/* activity, not an alert: a quiet teal number when something is new */}
                  <td className="ctr mono" style={{ fontSize: 13 }}>
                    {f.binderNew === 0 ? <span className="faint">0</span> : <span className="net-new">{f.binderNew}</span>}
                  </td>
                  <td className="ctr mono" style={{ fontSize: 13 }}>
                    {f.binderTotal === 0 ? <span className="faint">0</span> : f.binderTotal}
                  </td>
                  <td className="ctr mono" style={{ fontSize: 13 }}>
                    {f.binderOpen === 0 ? <span className="faint">0</span> : f.binderOpen}
                  </td>
                  <td className="ctr mono" style={{ fontSize: 13 }}>{f.completedDeals}</td>
                  {/* completed-deal history only — never listing or inventory value */}
                  <td className="num mono" style={{ fontSize: 13 }}>
                    {f.completedDeals === 0 ? <span className="faint">—</span> : money(f.dealValue)}
                  </td>
                  <td className="num mono" style={{ fontSize: 13 }}>
                    {f.coverage == null ? <span className="faint">—</span> : Math.round(f.coverage * 100) + "%"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}


/* Goal counts, not collector counts: within one profile the collector is always
   this collector, so the meaningful measure is how many of their goals share an
   attribute. Same aggregation as Cultivate, read on a different axis. */
function GoalCard({ ctx, g, tier }) {
  const { card, goalMatches, setDrawer, setModal } = ctx;
  const c = card(g.cardId);
  const matches = goalMatches(g);
  const held = matches.length;
  const tenure = daysSince(g.since);

  return (
    <div className={"gc" + (tier === "secondary" ? " sec" : "")}>
      <CardImage card={c} size={tier === "primary" ? "feature" : "browse"} />
      <div className="gc-main">
        <div className="gc-name">{c.name}</div>
        <div className="gc-id">
          {[c.set, c.num !== "—" ? `#${c.num}` : null, c.print, c.grade, isRaw(c) ? c.condition : null, c.edition !== "Standard" ? c.edition : null]
            .filter(Boolean).join(" · ")}
        </div>
        {g.note && <div className="gc-note">{g.note}</div>}
        <div className="gc-meta">
          <span>{tier === "primary" ? "Primary" : "Secondary"} for {tenure} {tenure === 1 ? "day" : "days"}</span>
          {/* Absence is enough — no "no inventory" badge when the TP can't serve it. */}
          {held > 0 && (
            <button className="gc-have" onClick={() => setDrawer({ type: "invItem", invId: matches[0].invId })}>
              {held === 1 ? "In inventory" : `${held} copies available`}
            </button>
          )}
        </div>
      </div>
      <div className="gc-act">
        {held > 0 && (
          <button className="btn sm pri" onClick={() => setModal({ type: "outreach", cardId: c.id, collectorId: g.collectorId, tier: g.tier })}>Reach out</button>
        )}
      </div>
    </div>
  );
}

/* One card the collector has shared, as it sits in their binder. Everything shown
   is persistent binder data already on the collectorCards record or its catalog
   card — nothing here is valued, negotiated, or opportunity-specific. The single
   action is standing Trusted Partner interest, written straight to tpInterest. */
function BinderCard({ ctx, cc }) {
  const { card, setTradeInterest } = ctx;
  const c = card(cc.cardId);
  if (!c) return null;
  /* Where the copy comes from, and what makes this copy that copy. Both lines are
     built by dropping the fields the catalog doesn't have, so a card never shows a
     dangling separator or a label with nothing after it. "Normal" print is the
     default rather than a variant, so it earns no space. */
  const origin = [c.set, c.num && c.num !== "—" ? "#" + c.num : null].filter(Boolean).join(" · ");
  const spec = [
    isRaw(c) ? "Raw" : c.grade,
    isRaw(c) ? c.condition : null,
    c.print && c.print !== "Normal" ? c.print : null,
    c.edition,
    c.language,
  ].filter(Boolean).join(" · ");

  return (
    <div className={"cp-bind" + (cc.tpInterest ? " on" : "")}>
      {/* Artwork carries the recognition, so it keeps the space; the caption below
          holds the identity needed to tell this copy from another like it. */}
      <div className="cp-bind-art"><CardImage card={c} size="feature" /></div>
      <div className="cp-bind-t" title={cardTitle(c)}>{c.name}</div>
      {origin && <div className="cp-bind-id">{origin}</div>}
      {spec && <div className="cp-bind-g" title={spec}>{spec}</div>}
      {/* The collector's own stated number, never a MetYet valuation. money() already
          renders an absent value as an em dash, so no zero is ever invented. */}
      <div className="cp-bind-v">Collector value <span className="mono">{money(cc.market)}</span></div>
      <button
        className={"btn sm cp-bind-x" + (cc.tpInterest ? " on" : "")}
        aria-pressed={cc.tpInterest ? "true" : "false"}
        onClick={() => setTradeInterest(cc.id, !cc.tpInterest)}
      >
        <span className="mk" aria-hidden="true" />
        Open to trade
      </button>
    </div>
  );
}

/* The one threshold this section has. It decides how many cards show by default,
   and therefore also whether the binder is big enough to need a View all control
   or a search field at all — a binder you can already see whole needs neither. */
const DEFAULT_BINDER_LIMIT = 10;

/* Standing relationship context. Presentation only: ordering, paging and search are
   derived per render, so collectorCards stays exactly as the collector shared it and
   tpInterest remains the single piece of state this section writes. */
function TradeBinder({ ctx, collectorId, sectionRef }) {
  const { collectorCards, card } = ctx;
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(false);

  const binder = useMemo(
    () => collectorCards.filter((cc) => cc.collectorId === collectorId),
    [collectorCards, collectorId]);

  /* Newest shared first, on a copy. What the collector just added is what the
     Trusted Partner hasn't seen, so recency leads; the toggle still shows at a
     glance which cards are already flagged. */
  const ordered = useMemo(
    () => [...binder].sort((a, b) => (Date.parse(b.addedAt) || 0) - (Date.parse(a.addedAt) || 0)),
    [binder]);

  const query = q.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return ordered;
    return ordered.filter((cc) => {
      const c = card(cc.cardId);
      if (!c) return false;
      return [c.name, c.set, c.num].filter(Boolean).join(" ").toLowerCase().includes(query);
    });
  }, [ordered, query, card]);

  const openCount = binder.filter((cc) => cc.tpInterest).length;
  // Above the limit the binder can't be seen whole, so it earns search and paging.
  const oversized = binder.length > DEFAULT_BINDER_LIMIT;
  // A search shows everything it found; the page limit only governs the default view.
  const capped = !query && !expanded && matches.length > DEFAULT_BINDER_LIMIT;
  const shown = capped ? matches.slice(0, DEFAULT_BINDER_LIMIT) : matches;
  const showToggle = oversized && !query;

  return (
    <div className="cp-sec" ref={sectionRef} tabIndex={-1}>
      <div className="cp-sec-h">
        Trade Binder <span className="mono">{binder.length}</span>
        {binder.length > 0 && <span className="cp-bind-open"><span className="mono">{openCount}</span> open to trade</span>}
      </div>

      {binder.length === 0 ? (
        <div className="cp-empty">No cards shared in their trade binder.</div>
      ) : (<>
        {oversized && (
          <div className="cp-bind-search">
            <span className="ic"><Icon n="search" s={14} /></span>
            <input className="inp" type="search" value={q} onChange={(e) => setQ(e.target.value)}
              aria-label="Search trade binder by card name or set" placeholder="Search trade binder..." />
          </div>
        )}

        {matches.length === 0
          ? <div className="cp-empty">No cards match your search.</div>
          : <div className="cp-bind-grid">
            {shown.map((cc) => <BinderCard key={cc.id} ctx={ctx} cc={cc} />)}
          </div>}

        {showToggle && (
          <button className="btn sm cp-bind-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? "Show fewer" : `View all ${binder.length} cards`}
          </button>
        )}
      </>)}
    </div>
  );
}

function CollectorProfile({ ctx, id }) {
  const { nav, collector, collectorStats, collectorFacts, card, setNav, setModal, setDrawer, activity, opps } = ctx;
  const c = collector(id);
  const s = collectorStats(id);
  const f = collectorFacts(id);
  const [showSec, setShowSec] = useState(false);
  const [showHist, setShowHist] = useState(false);

  const acts = activity.filter((a) => a.collectorId === id).sort((a, b) => b.date.localeCompare(a.date));
  const active = opps.filter((o) => o.collectorId === id && isActive(o) && o.stage !== "completed");

  /* Any route into this profile counts as a review — network row, opportunity,
     the Trade Binder CTA — because the rule is "the TP looked", not "the TP
     clicked from the network table". */
  const { markBinderReviewed } = ctx;
  useEffect(() => { markBinderReviewed(id); }, [id, markBinderReviewed]);

  /* Arriving from Select Trade's "View ...'s Trade Binder" lands on the section
     rather than the top of the profile. */
  const binderRef = useRef(null);
  useEffect(() => {
    if (nav.focus !== "trade-binder") return;
    const el = binderRef.current;
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start", behavior: "smooth" });
    if (el && typeof el.focus === "function") el.focus({ preventScroll: true });
  }, [nav.focus, id]);

  return (
    <>
      <button className="btn sm" style={{ marginBottom: 12 }} onClick={() => setNav({ section: "collectors" })}><Icon n="back" s={13} />All collectors</button>

      {/* A. Identity — the person and the relationship context, nothing operational. */}
      <div className="cp-head">
        <span className="av lg">{initials(c.name)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="disp" style={{ fontSize: 20, fontWeight: 600 }}>{c.name}</div>
          {/* Member since moved into the stats row below — not repeated here. */}
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{c.city}</div>

          {/* Four lifetime facts. Every value comes from collectorFacts(), the same
              selector the Collector Network overview reads, so the two agree. */}
          <div className="cp-life">
            <div className="cp-life-i">
              <div className="cp-life-l">Member since</div>
              <div className="cp-life-v">{fmtDate(f.memberSince)}</div>
              <div className="cp-life-s">{tenureLabel(f.memberSince)}</div>
            </div>
            <div className="cp-life-i">
              <div className="cp-life-l">Completed deals</div>
              <div className="cp-life-v mono">{f.completedDeals}</div>
            </div>
            <div className="cp-life-i">
              <div className="cp-life-l">Deal value</div>
              <div className="cp-life-v mono">
                {f.completedDeals === 0 ? <span className="faint">—</span> : money(f.dealValue)}
              </div>
            </div>
            <div className="cp-life-i">
              <div className="cp-life-l">Coverage</div>
              <div className="cp-life-v mono">
                {f.coverage == null ? <span className="faint">—</span> : Math.round(f.coverage * 100) + "%"}
              </div>
            </div>
          </div>

          {c.note && <div className="cp-note">{c.note}</div>}
          <div className="cp-prefs">
            {c.prefs.map((t) => <span key={t} className="tag">{T[t] || t}</span>)}
          </div>
        </div>
      </div>

      {/* B. Primary Goals — the strongest section, always open. */}
      <div className="cp-sec">
        <div className="cp-sec-h">Primary Goals <span className="mono">{s.primary.length}</span></div>
        {s.primary.length === 0
          ? <div className="cp-empty">No primary goals set.</div>
          : s.primary.map((g) => <GoalCard key={g.id} ctx={ctx} g={g} tier="primary" />)}
      </div>

      {/* C. Secondary Goals — same treatment, lower weight, collapsed by default. */}
      {s.secondary.length > 0 && (
        <div className="cp-sec">
          <button className="cp-sec-h as-btn" onClick={() => setShowSec(!showSec)} aria-expanded={showSec}>
            Secondary Goals <span className="mono">{s.secondary.length}</span>
            <span className="cp-chev" aria-hidden="true"><Icon n="chev" s={12} /></span>
          </button>
          {showSec && s.secondary.map((g) => <GoalCard key={g.id} ctx={ctx} g={g} tier="secondary" />)}
        </div>
      )}

      {/* D. Trade Binder — standing relationship context, not deal context. What has
             this collector shared, and which of it would you take in a trade? The
             count is everything they've shared, not everything you've flagged. */}
      <TradeBinder ctx={ctx} collectorId={id} sectionRef={binderRef} />

      {/* E. Active Opportunities — a doorway, not a second Opportunities product.
             Rendered only when there is something in motion. */}
      {active.length > 0 && (
        <div className="cp-sec">
          <div className="cp-sec-h">Active Opportunities <span className="mono">{active.length}</span></div>
          {active.map((o) => {
            const oc = card(o.cardId);
            const na = nextAction(o);
            return (
              <div key={o.id} className="cp-opp">
                <CardImage card={oc} size="thumbnail" />
                <div className="cp-opp-main">
                  <div className="cp-opp-t">{oc.name} — {oc.set}</div>
                  <div className="cp-opp-s">
                    {STAGE_LABEL[o.stage]}
                    {na.owner && <span className="faint"> · Next step: {nextStepLabel(na.owner)}</span>}
                  </div>
                </div>
                <button className="btn sm" onClick={() => setDrawer({ type: "workspace", oppId: o.id })}>Open</button>
              </div>
            );
          })}
        </div>
      )}

      {/* F. History — one quiet line, with the existing activity behind it. */}
      <div className="cp-sec">
        <button className="cp-sec-h as-btn" onClick={() => setShowHist(!showHist)} aria-expanded={showHist}>
          History
          <span className="cp-chev" aria-hidden="true"><Icon n="chev" s={12} /></span>
        </button>
        <div className="cp-hist-sum">
          {f.completedDeals === 0
            ? "No completed deals yet."
            : `${f.completedDeals} completed deal${f.completedDeals === 1 ? "" : "s"} · ${money(f.dealValue)} total`}
        </div>
        {showHist && (
          acts.length === 0
            ? <div className="cp-empty">Nothing logged yet.</div>
            : <div className="cp-acts">
              {acts.map((a) => (
                <div key={a.id} className="cp-act">
                  <span className="cp-act-d mono">{fmtDate(a.date)}</span>
                  <span>{a.text}</span>
                </div>
              ))}
            </div>
        )}
      </div>
    </>
  );
}


/* -------------------------------- MODALS ------------------------------- */

function Modal({ title, sub, onClose, children, footer, width }) {
  return (
    <div className="ovl" onClick={onClose}>
      <div className="modal" style={width ? { width } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div><h3 className="disp">{title}</h3>{sub && <div className="faint" style={{ fontSize: 12 }}>{sub}</div>}</div>
          <button className="x" onClick={onClose} aria-label="Close"><Icon n="x" s={15} /></button>
        </div>
        <div className="mb">{children}</div>
        <div className="mf">{footer}</div>
      </div>
    </div>
  );
}

const ALL_TAGS = Object.keys(T);

/* Add to Inventory. The card identity comes from the recommendation and is
   read-only — editing it would make this a different card and invalidate the
   recommendation. Everything that belongs to the physical copy is editable, using
   the same fields Current Inventory already stores. */
/* The physical-copy fields, shared by both paths that create an inventory record.
   Card identity is never editable here — it belongs to the canonical card. */
function CopyFields({ d, set, costError, showCert = true }) {
  return (
    <>
      <label className="fld"><span>Cost</span>
        <input className="inp" type="number" min="0" step="0.01" inputMode="decimal"
          value={d.cost} onChange={(e) => set("cost", e.target.value)} placeholder="0.00" autoFocus />
        <span className="faint" style={{ fontSize: 10.5 }}>
          {costError ? <span style={{ color: "var(--danger)" }}>Cost can't be negative.</span> : "What you paid for this item."}
        </span>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label className="fld"><span>Ask price</span>
          <input className="inp" type="number" min="0" step="1" value={d.ask} onChange={(e) => set("ask", e.target.value)} /></label>
        <label className="fld"><span>Acquired on</span>
          <input className="inp" type="date" value={d.acquired} onChange={(e) => set("acquired", e.target.value)} /></label>
      </div>

      {showCert && (
        <label className="fld"><span>Certification number</span>
          <input className="inp" value={d.cert} onChange={(e) => set("cert", e.target.value)} placeholder="optional" /></label>
      )}
    </>
  );
}

/* Read-only canonical identity. Shown after selection so the TP can confirm the
   card without being able to alter it. */
function CanonicalIdentity({ c, note, onChange }) {
  return (
    <div className="ac-id">
      <div className="ac-id-head">
        <div className="sect-t" style={{ margin: 0 }}>Card</div>
        {onChange && <button className="link" style={{ fontSize: 11.5 }} onClick={onChange}>Change card</button>}
      </div>
      <div className="ac-id-t">{c.name}</div>
      <div className="ac-id-s">
        {[c.grade, isRaw(c) ? c.condition : null, c.print, c.edition, `${c.set} ${c.num}`, c.language]
          .filter(Boolean).join(" · ")}
      </div>
      {note && <div className="faint" style={{ fontSize: 10.5, marginTop: 4 }}>{note}</div>}
    </div>
  );
}

/* Optional money: blank is acceptable and stays blank. Only an entered value can be
   wrong, so `error` is the gate rather than `valid`. */
const optionalMoneyState = (raw) => {
  const entered = String(raw ?? "").trim() !== "";
  const n = Number(raw);
  return { entered, error: entered && !(isFinite(n) && n >= 0) };
};

/* Multi-term, case-insensitive match across the fields a TP would actually type.
   Every term must appear somewhere in the card's searchable text, so "Charizard Base"
   narrows to Base Set Charizards rather than returning either. */
function searchCards(cards, query) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored = [];
  for (const c of cards) {
    const name = String(c.name).toLowerCase();
    const hay = [c.name, c.set, c.num, c.year, c.grade, c.edition, c.print, c.language]
      .filter(Boolean).join(" ").toLowerCase();
    if (!terms.every((t) => hay.includes(t))) continue;
    // rank: name matches first, then earlier name position, then set then name
    const inName = terms.filter((t) => name.includes(t)).length;
    scored.push({ c, inName, pos: name.indexOf(terms[0]) });
  }
  return scored
    .sort((a, b) => b.inName - a.inName
      || (a.pos < 0 ? 99 : a.pos) - (b.pos < 0 ? 99 : b.pos)
      || a.c.name.localeCompare(b.c.name)
      || a.c.set.localeCompare(b.c.set))
    .map((x) => x.c);
}

/* Add Inventory: find the PRINTED card, then describe the physical copy you hold.
   Search and dedup run on printIdentityKey — grade never splits a search result. */
function AddInventoryModal({ ctx }) {
  const { catalog, inventory, card, resolveCanonicalCard, addCopyToInventory, setModal } = ctx;
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(null);
  /* Nothing here is inherited from the catalog record. Grade starts unset because
     the search result identifies a PRINTED card, which says nothing about the copy
     the TP is holding. Listing price starts blank because it is the TP's asking
     price, not the card's estimated value. */
  const [d, setD] = useState({
    edition: "", grade: "", condition: "", cert: "",
    cost: "", ask: "", acquired: TODAY.toISOString().slice(0, 10),
  });
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));

  const results = useMemo(() => searchCards(catalog, q), [catalog, q]);

  /* Edition is a printed attribute but is not part of the print key, so a printed
     card whose records span editions must have it chosen. Where only one exists it
     is resolved silently and never asked. */
  const editions = picked ? [...new Set(picked.variants.map((v) => v.edition))] : [];
  const edition = editions.length === 1 ? editions[0] : d.edition;

  const isRawPick = d.grade === "Raw";
  const copy = { edition, grade: d.grade, condition: isRawPick ? d.condition : null };
  /* The copy identity is known once a grade is chosen — and, for Raw, a condition.
     Until then MetYet cannot say which physical copy this is. */
  const identityResolved = !!picked && !!edition && !!d.grade && (!isRawPick || !!d.condition);
  /* Optional money: blank is fine, an entered value must be valid. */
  const cost = optionalMoneyState(d.cost);
  const ask = optionalMoneyState(d.ask);
  /* Only the copy identity gates the add — never a financial field. */
  const canAdd = identityResolved && !cost.error && !ask.error;

  /* Held copies compare on full canonical identity — the same rule used everywhere
     else — and only once every field that identity depends on is resolved. */
  const heldMatching = () => {
    if (!identityResolved) return null;
    const target = { ...picked, ...copy };
    delete target.variants;
    if (!identityComplete(target)) return null;
    const k = identityKey(target);
    return inventory.filter((i) => !i.archived && identityKey(card(i.cardId)) === k).length;
  };

  const choose = (c) => {
    setPicked(c);
    const eds = [...new Set(c.variants.map((v) => v.edition))];
    // only edition is prefilled, and only when the printed card leaves no choice
    setD((x) => ({ ...x, edition: eds.length === 1 ? eds[0] : "" }));
  };

  const submit = () => {
    const cardId = resolveCanonicalCard(picked, copy);
    addCopyToInventory(cardId, { cost: d.cost, ask: d.ask, acquired: d.acquired, cert: isRawPick ? "" : d.cert });
  };

  const held = heldMatching();

  return (
    <Modal
      title="Add Inventory"
      sub={picked ? `${picked.name} · ${picked.set} ${picked.num}` : "Find the printed card, then describe your copy."}
      onClose={() => setModal(null)} width={560}
      footer={<>
        <button className="btn" onClick={() => setModal(null)}>Cancel</button>
        {picked && <button className="btn pri" disabled={!canAdd} onClick={submit}>Add to Inventory</button>}
      </>}>

      {!picked ? (
        /* The search field is the whole interaction. No label, no instructions, and
           no results container until there is something to put in it. */
        <div className={"ai-search-state" + (q.trim() === "" ? " quiet" : "")}>
          <div className="ai-field">
            <span className="ai-field-i" aria-hidden="true"><Icon n="search" s={16} /></span>
            <input className="ai-input" value={q} autoFocus type="search"
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search cards by name, set, or number"
              placeholder="Search by card name, set, or number..." />
          </div>

          {q.trim() === "" ? null : results.length === 0 ? (
            <div className="ai-none">
              <div className="ai-none-t">No cards found</div>
              <div className="ai-none-s">Try a card name, set, or number.</div>
            </div>
          ) : (
            <div className="ai-results">
              {results.slice(0, 40).map((c) => (
                <button key={printIdentityKey(c)} className="ai-row" onClick={() => choose(c)}>
                  <CardImage card={c} size="browse" />
                  <span className="ai-main">
                    <span className="ai-name">{c.name}</span>
                    <span className="ai-sub">{[c.set, c.num, c.year].filter(Boolean).join(" · ")}</span>
                    <span className="ai-var">{[c.print, c.language].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              ))}
              {results.length > 40 && (
                <div className="ai-hint">Showing 40 of {results.length}. Add another term to narrow.</div>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="ac-id">
            <div className="ac-id-head">
              <div className="sect-t" style={{ margin: 0 }}>Printed card</div>
              <button className="link" style={{ fontSize: 11.5 }} onClick={() => setPicked(null)}>Change card</button>
            </div>
            {/* printed identity only — grade and condition describe the copy, not the card */}
            <div className="cimg-row" style={{ alignItems: "flex-start", gap: 12 }}>
              <CardImage card={picked} size="feature" />
              <div style={{ minWidth: 0 }}>
                <div className="ac-id-t">{picked.name}</div>
                <div className="ac-id-s">{[picked.set, `#${picked.num}`, picked.print].join(" · ")}</div>
              </div>
            </div>
          </div>

          {editions.length > 1 && (
            <label className="fld"><span>Edition <b className="req">*</b></span>
              <div className="seg">
                {editions.map((e) => (
                  <button key={e} className={"seg-b" + (d.edition === e ? " on" : "")} onClick={() => set("edition", e)}>{e}</button>
                ))}
              </div>
            </label>
          )}

          <label className="fld"><span>PSA Grade <b className="req">*</b></span>
            <div className="gradepick">
              {GRADED_VALUES.map((g) => (
                <button key={g} className={"seg-b" + (d.grade === g ? " on" : "") + (g === "Raw" ? " wide" : "")}
                  onClick={() => set("grade", g)}>{g === "Raw" ? "Raw" : g.replace("PSA ", "")}</button>
              ))}
            </div>
            <span className="faint" style={{ fontSize: 10.5 }}>
              {d.grade ? (isRawPick ? "Ungraded — choose a condition below." : "PSA is the only company supported today.")
                : "Choose the grade of the copy you acquired."}
            </span>
          </label>

          {isRawPick && (
            <label className="fld"><span>Condition <b className="req">*</b></span>
              <div className="seg">
                {CONDITION_VALUES.map((c) => (
                  <button key={c} className={"seg-b" + (d.condition === c ? " on" : "")}
                    onClick={() => set("condition", c)}>{c}</button>
                ))}
              </div>
            </label>
          )}

          {d.grade && !isRawPick && (
            <label className="fld"><span>Certification number <span className="opt">optional</span></span>
              <input className="inp" value={d.cert} onChange={(e) => set("cert", e.target.value)} /></label>
          )}

          {/* only meaningful once the copy identity is known */}
          {held != null && held > 0 && (
            <div className="ai-held-note">
              You currently hold {held} matching cop{held === 1 ? "y" : "ies"}. This adds another.
            </div>
          )}

          <div className="sect-t" style={{ marginTop: 4 }}>Acquisition</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label className="fld"><span>Acquisition cost <span className="opt">optional</span></span>
              <input className="inp" type="number" min="0" step="0.01" inputMode="decimal"
                value={d.cost} onChange={(e) => set("cost", e.target.value)} placeholder="0.00" />
              <span className="faint" style={{ fontSize: 10.5 }}>
                {cost.error ? <span style={{ color: "var(--danger)" }}>Cost can't be negative.</span> : "What you paid."}
              </span>
            </label>
            <label className="fld"><span>Listing price <span className="opt">optional</span></span>
              <input className="inp" type="number" min="0" step="1" inputMode="decimal"
                value={d.ask} onChange={(e) => set("ask", e.target.value)} placeholder="0" />
              <span className="faint" style={{ fontSize: 10.5 }}>
                {ask.error ? <span style={{ color: "var(--danger)" }}>Listing price can't be negative.</span> : "What you're asking."}
              </span>
            </label>
          </div>

          {/* secondary to grade and pricing: today is almost always right */}
          <label className="fld fld-sub"><span>Acquired on <span className="opt">optional</span></span>
            <input className="inp" type="date" value={d.acquired} onChange={(e) => set("acquired", e.target.value)} /></label>

          {!identityResolved && (
            <div className="faint" style={{ fontSize: 11 }}>
              {editions.length > 1 && !d.edition ? "Choose an edition to continue."
                : !d.grade ? "Choose a grade to continue."
                : "Choose a condition to continue."}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function AddCopyModal({ ctx, cardId }) {
  const { card, addCopyToInventory, setModal } = ctx;
  const c = card(cardId);
  const [d, setD] = useState({ cost: "", ask: String(c.value), acquired: TODAY.toISOString().slice(0, 10), cert: "" });
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const cost = optionalMoneyState(d.cost);
  const ask = optionalMoneyState(d.ask);

  return (
    <Modal title="Add to Inventory" sub={cardTitle(c)} onClose={() => setModal(null)} width={520}
      footer={<>
        <button className="btn" onClick={() => setModal(null)}>Cancel</button>
        <button className="btn pri" disabled={cost.error || ask.error} onClick={() => addCopyToInventory(cardId, d)}>Add to Inventory</button>
      </>}>
      <CanonicalIdentity c={c} note="From the recommendation. Identity comes from the card and can't be edited here." />
      <CopyFields d={d} set={set} costError={cost.error} />
    </Modal>
  );
}

/* EDIT ONLY. Creating inventory goes through AddInventoryModal, which selects an
   existing canonical card. This modal is never reachable without an invId, so the
   new-card branch that used to mint an identity here has been removed. */
function CardModal({ ctx, invId }) {
  const { inventory, card, saveCard, setModal } = ctx;
  const inv = invId ? inventory.find((i) => i.invId === invId) : null;
  const existing = inv ? card(inv.cardId) : null;
  if (!inv || !existing) return null;
  const [d, setD] = useState(() => ({ ...existing, ask: inv.ask, cost: inv.cost }));
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const toggleTag = (t) => setD((x) => ({ ...x, tags: x.tags.includes(t) ? x.tags.filter((y) => y !== t) : [...x.tags, t] }));
  const valid = d.name.trim() && d.set.trim() && (d.grade !== "Raw" || !!d.condition);

  return (
    <Modal title="Edit card" sub="Tags drive preference matching across your network" onClose={() => setModal(null)}
      footer={<>
        <button className="btn" onClick={() => setModal(null)}>Cancel</button>
        <button className="btn pri" disabled={!valid} onClick={() => saveCard({ ...d, value: Number(d.value) || Number(d.ask) || 0, ask: Number(d.ask) || 0, cost: Number(d.cost) || 0, year: Number(d.year) }, invId)}>
          Save changes
        </button>
      </>}>
      <label className="fld"><span>Card name</span><input className="inp" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Charizard" /></label>
      <label className="fld"><span>Set</span><input className="inp" value={d.set} onChange={(e) => set("set", e.target.value)} placeholder="Base Set Shadowless" /></label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <label className="fld"><span>Number</span><input className="inp" value={d.num} onChange={(e) => set("num", e.target.value)} placeholder="4/102" /></label>
        <label className="fld"><span>Year</span><input className="inp" type="number" value={d.year} onChange={(e) => set("year", e.target.value)} /></label>
        <label className="fld"><span>Graded</span>
          <select className="inp" value={d.grade} onChange={(e) => set("grade", e.target.value)}>
            {GRADED_VALUES.map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <label className="fld"><span>Print</span>
          <select className="inp" value={d.print} onChange={(e) => set("print", e.target.value)}>
            {PRINT_VALUES.map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
        <label className="fld"><span>Edition</span>
          <select className="inp" value={d.edition} onChange={(e) => set("edition", e.target.value)}>
            {["Unlimited", "1st Edition", "Shadowless", "No Rarity", "Standard"].map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
        <label className="fld"><span>Language</span>
          <select className="inp" value={d.language} onChange={(e) => set("language", e.target.value)}>
            {["English", "Japanese"].map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
      </div>
      {d.grade === "Raw" && (
        <label className="fld"><span>Condition (required for raw cards)</span>
          <select className="inp" value={d.condition || ""} onChange={(e) => set("condition", e.target.value)}>
            <option value="">Select a condition</option>
            {CONDITION_VALUES.map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label className="fld"><span>Your cost</span><input className="inp" type="number" value={d.cost} onChange={(e) => set("cost", e.target.value)} /></label>
        <label className="fld"><span>Ask price</span><input className="inp" type="number" value={d.ask} onChange={(e) => set("ask", e.target.value)} /></label>
      </div>
      <div className="fld">
        <span>Attributes</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {ALL_TAGS.map((t) => (
            <button key={t} className={"btn sm" + (d.tags.includes(t) ? " on" : "")} onClick={() => toggleTag(t)}>{T[t]}</button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function OutreachModal({ ctx, cardId, collectorId, tier }) {
  const { card, collector, goals, setModal, startOutreach } = ctx;
  const c = card(cardId);
  const candidates = goals.filter((g) => g.cardId === cardId && (tier ? g.tier === tier : true) && (collectorId ? g.collectorId === collectorId : true));
  const [pick, setPick] = useState(candidates[0]?.id || null);
  const chosen = candidates.find((g) => g.id === pick);
  const [msg, setMsg] = useState("");

  const held = ctx.inventory.some((i) => !i.archived && identityKey(ctx.card(i.cardId)) === identityKey(c));
  const defaultMsg = chosen
    ? held
      ? `Hi ${collector(chosen.collectorId).name.split(" ")[0]} — you have ${chosen.tier === "primary" ? "a primary goal" : "a secondary goal"} for ${cardShort(c)}. I have a ${c.grade} copy in hand and wanted you to see it first.`
      : `Hi ${collector(chosen.collectorId).name.split(" ")[0]} — I saw ${cardShort(c)} on your goals. I don't have one right now, but I'll keep an eye out and let you know if I can source it.`
    : "";

  return (
    <Modal title="Reach out" sub="Every conversation starts from a card and the goal it answers" onClose={() => setModal(null)} width={540}
      footer={<>
        <button className="btn" onClick={() => setModal(null)}>Cancel</button>
        <button className="btn pri" disabled={!chosen} onClick={() => startOutreach(chosen.collectorId, cardId, chosen.tier, msg || defaultMsg)}>
          <Icon n="send" s={13} />Send message
        </button>
      </>}>
      <div style={{ background: "#F7F9FA", border: "1px solid var(--line)", borderRadius: 4, padding: 11, marginBottom: 14 }}>
        <div className="faint" style={{ fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", fontFamily: "Archivo", fontWeight: 600 }}>Inventory card</div>
        <div className="disp" style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{cardTitle(c)}</div>
      </div>

      <div className="fld">
        <span>Which goal is this conversation about?</span>
        {candidates.length === 0 && <div className="empty">No collector has a goal for this card. Outreach needs a goal to stand on.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {candidates.map((g) => (
            <button key={g.id} onClick={() => setPick(g.id)} style={{
              display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "9px 11px", borderRadius: 4,
              border: "1px solid " + (pick === g.id ? "var(--t1)" : "var(--line)"), background: pick === g.id ? "var(--t1-bg)" : "#FFF",
            }}>
              <span className="av">{initials(collector(g.collectorId).name)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 12.5 }}>{collector(g.collectorId).name}</div>
                <div className="faint" style={{ fontSize: 11.5 }}>{g.note || "No note on this goal"}</div>
              </div>
              <span className={"t-pill " + (g.tier === "primary" ? "p1" : "p2")}>{g.tier}</span>
            </button>
          ))}
        </div>
      </div>

      {chosen && (
        <label className="fld"><span>Message</span>
          <textarea className="inp" rows={4} value={msg} placeholder={defaultMsg} onChange={(e) => setMsg(e.target.value)} />
        </label>
      )}
      <div className="faint" style={{ fontSize: 11.5 }}>This logs the outreach on their timeline. It does not move the opportunity — only the collector can open a negotiation by making an offer.</div>
    </Modal>
  );
}

function InviteModal({ ctx }) {
  const { setModal, inviteCollector } = ctx;
  const [d, setD] = useState({ name: "", email: "", city: "", note: "", prefs: [] });
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const toggle = (t) => setD((x) => ({ ...x, prefs: x.prefs.includes(t) ? x.prefs.filter((y) => y !== t) : [...x.prefs, t] }));
  const valid = d.name.trim() && d.email.includes("@");
  return (
    <Modal title="Invite a collector" sub="They set their own goals once they join — you set the starting context" onClose={() => setModal(null)}
      footer={<><button className="btn" onClick={() => setModal(null)}>Cancel</button>
        <button className="btn pri" disabled={!valid} onClick={() => inviteCollector(d)}>Send invitation</button></>}>
      <label className="fld"><span>Name</span><input className="inp" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Jordan Pierce" /></label>
      <label className="fld"><span>Email</span><input className="inp" value={d.email} onChange={(e) => set("email", e.target.value)} placeholder="jordan@example.com" /></label>
      <label className="fld"><span>City</span><input className="inp" value={d.city} onChange={(e) => set("city", e.target.value)} placeholder="Madison, WI" /></label>
      <div className="fld"><span>What you already know they collect</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {ALL_TAGS.map((t) => <button key={t} className={"btn sm" + (d.prefs.includes(t) ? " on" : "")} onClick={() => toggle(t)}>{T[t]}</button>)}
        </div>
      </div>
      <label className="fld"><span>Note</span><textarea className="inp" rows={3} value={d.note} onChange={(e) => set("note", e.target.value)} placeholder="Met at the Chicago show. Chasing Neo holos." /></label>
    </Modal>
  );
}

function ArchiveModal({ ctx, invId }) {
  const { inventory, card, collector, archiveRisk, archiveInv, setModal } = ctx;
  const inv = inventory.find((i) => i.invId === invId);
  const c = card(inv.cardId);
  const { open, primary } = archiveRisk(inv.cardId);
  const inDeal = open.filter((o) => ["deal", "fulfillment"].includes(o.stage));

  return (
    <Modal title="Archive this card?" sub={cardTitle(c)} onClose={() => setModal(null)} width={520}
      footer={<>
        <button className="btn" onClick={() => setModal(null)}>Keep in inventory</button>
        <button className="btn dgr" style={{ borderColor: "var(--danger)" }} onClick={() => archiveInv(invId, true)}>Archive anyway</button>
      </>}>
      <div style={{ background: "var(--danger-bg)", border: "1px solid #E8CBC9", borderRadius: 4, padding: 12, marginBottom: 14 }}>
        <div style={{ fontWeight: 600, fontSize: 12.5, color: "var(--danger)" }}>
          {inDeal.length > 0
            ? `This card is inside ${inDeal.length} active deal${inDeal.length === 1 ? "" : "s"}.`
            : open.length > 0
              ? `This card has ${open.length} open opportunit${open.length === 1 ? "y" : "ies"}.`
              : `This card fills ${primary.length} primary goal${primary.length === 1 ? "" : "s"}.`}
        </div>
        <div style={{ fontSize: 12, marginTop: 4 }}>
          Archiving removes it from matching and coverage immediately. Open opportunities stay on your board pointing at a card you no longer hold.
        </div>
      </div>

      {open.length > 0 && <>
        <div className="sect-t">Open opportunities</div>
        {open.map((o) => (
          <div key={o.id} className="kv">
            <span className="k">{collector(o.collectorId).name}</span>
            <span className="v" style={{ fontSize: 12 }}>{STAGE_LABEL[o.stage]} · {money(oppValue(o))}</span>
          </div>
        ))}
      </>}

      {primary.length > 0 && <>
        <div className="sect-t" style={{ marginTop: 14 }}>Primary goals this card fills</div>
        {primary.map((g) => (
          <div key={g.id} className="kv">
            <span className="k">{collector(g.collectorId).name}</span>
            <span className="v" style={{ fontSize: 12 }}>{g.note || "no note"}</span>
          </div>
        ))}
      </>}

      <div className="faint" style={{ fontSize: 11.5, marginTop: 14 }}>
        No one is notified. Collectors won't see that this card left your inventory, and their goals stay exactly as they set them.
      </div>
    </Modal>
  );
}

