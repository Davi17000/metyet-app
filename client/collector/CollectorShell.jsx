/* ============================================================================
   THE COLLECTOR PRODUCTION SHELL — PROJECTION IN, PIXELS OUT

     <CollectorShell state={projection} onSignOut={fn} />

   The first real Collector surface in production. Everything on it arrived in
   one `GET /api/view` response for this Collector, and there is no second way
   for anything to get here: this file imports no store, no session, no api
   client, no domain and no `fetch`. Hand it a projection and it renders.

   THREE THINGS, WHICH ARE THE PRODUCT.

     Goals            what you want. The only transaction workflow in MetYet:
                      a deal is a goal being worked, not a separate thing.
     Your Cards       what you own, and which of it you're offering. Supply,
                      not a workflow. (Called the Trade Binder until C2, when
                      owning and offering became two facts instead of one.)
     Trusted Partners who you deal with. A relationship network, not a market.

   Those are the prototype's own three, with its own labels and its own order,
   because the model is settled and this is a different implementation of it
   rather than a redesign. The shape is the Collector app's too — a tab bar
   along the bottom of a phone, becoming a rail down the side of a wide screen.
   The Trusted Partner workspace is a dark sidebar; this is not, and the
   difference is the point: one of these people is at a desk all day and the
   other is holding a phone in a card shop.

   THIS IS A SHELL. Identity, navigation, counts, sign-out. Each section says
   truthfully what it is and what it holds, and stops there — reading a goal,
   opening one of your own cards, looking at a Trusted Partner's profile all belong to
   the next batch, and a placeholder that pretends otherwise would be worse
   than one that admits it.

   WHAT IT CANNOT DO.

   It cannot decide who you are. `describeActor` reads the seat and the id the
   server sent; the name is found by matching that id against the projection's
   own `collectors` records — which, for a Collector, is exactly one row: their
   own. Nothing here can name somebody the server did not name.

   It cannot see what the server did not send. A Trusted Partner's acquisition
   cost and private notes are stripped by the projection before they leave the
   server (`INVENTORY_FOR_COLLECTOR`, `RELATIONSHIP_PARTNER_PRIVATE`), and
   another Collector's data is never in the response at all. This file also
   never reads those field names, so the screen is not the only thing standing
   between them and a person.

   It cannot compute a rule. The counts are row counts of collections the
   server already scoped. Nothing here decides what "active" means, which is
   why there is no opportunities count: that judgement is the server's.

   It cannot change anything. No command, no mutation, no local write. Moving
   between sections is presentation state and touches neither the projection
   nor the actor.
   ========================================================================== */

import React, { useState } from "react";
import { describeActor } from "../actor.js";
import { rows } from "./present.js";
import { EMPTY_SESSION } from "../browse/CardBrowser.jsx";
import Browse from "./sections/Browse.jsx";
import Binder from "./sections/Binder.jsx";
import Goals from "./sections/Goals.jsx";
import MyCards from "./sections/MyCards.jsx";
import TrustedPartners from "./sections/TrustedPartners.jsx";

/* What the Collector can actually open, in the product's own order and words.
   `count` names the collection whose ROWS are counted: each is a plain count of
   something the server already scoped to this Collector, and none of them is a
   rule. */
export const SECTIONS = Object.freeze([
  /* BROWSE IS FIRST (Phase 5 C1), because it is where a Collector spends time
     and where saying "I'm looking for this" now happens. It counts nothing:
     the catalogue is not a collection of theirs, and a number beside it would
     be a number about MetYet rather than about them. */
  { id: "browse", label: "Browse", count: null, view: Browse,
    title: "Browse",
    sub: "Find a card by Pokémon, by set, or by who drew it" },
  /* WHERE A CARD BELONGS (Phase 5 C3.4). Second, because after finding a card
     the next thing a person does with it is decide where it goes.

     AND WHY GOALS IS NO LONGER A TAB. Binders express coherence and Goals
     express priority, and those are two things to know about one card rather
     than two places to go. A Goal is still an independent durable fact — it
     needs no binder, survives one being emptied, and is set and changed from
     the Card Specification panel exactly as before — but it is read WHERE THE
     CARD IS. `Goals.jsx` is kept and still renders; it simply is not a
     destination of its own, and the Goals that belong to no active binder are
     listed inside Binder so that removing the tab hides nothing.

     The count is `binders` — how many groupings they have made, which is a
     fact about them rather than about MetYet. */
  { id: "binder", label: "Binder", count: "binders", view: Binder,
    title: "Binder",
    sub: "Where your cards belong, and what you're still looking for" },
  /* WHAT YOU OWN, REACHABLE AT LAST (Phase 5 C3.4). Deferred since Batch 8.1
     for reasons that were true at the time and stopped being true one at a
     time: the command existed but demanded a legacy card (fixed by C2), then
     there was no control to record a copy (fixed by C3.3), and then the screen
     itself named canonical cards wrongly — every production copy read "a card
     that isn't in your catalogue", which is why C3.3 declined to promote it and
     left the debt written down. C3.4 fixes the screen and moves it up. */
  { id: "my-cards", label: "Your Cards", count: "collectorCopies", view: MyCards,
    title: "Your Cards",
    sub: "What you own, and what you're offering" },
  { id: "partners", label: "Trusted Partners", count: "partners", view: TrustedPartners,
    title: "Trusted Partners",
    sub: "The shops you deal with" },
]);

/* BUILT AND NOT YET REACHABLE — AND, AS OF C3.4, NOTHING IS.

   Batch 8.1 created this list for Your Cards, which was impossible then: the
   only command that wrote a Collector's copy demanded a row in the legacy
   catalogue, and production's is empty by design. C2 gave a copy a canonical
   card, C3.3 gave a person a way to record one, and C3.4 fixed the screen's own
   canonical naming and moved it into SECTIONS.

   THE LIST STAYS, EMPTY, ON PURPOSE. It is the declared place a built-but-not
   -ready section waits, and having one is what kept Your Cards live and correct
   through four batches instead of being deleted and rebuilt. Deleting the list
   because it happens to be empty would throw away the convention along with its
   only current occupant.

   A person cannot reach anything listed here: `section` is only ever set from
   a SECTIONS id. */
export const DEFERRED_SECTIONS = Object.freeze([
  /* GOALS, WHICH IS NOT GONE (Phase 5 C3.4b). The tab went; the screen did not.
     A Goal is still an independent durable fact — it needs no binder, survives
     one being emptied, and is set and changed from the Card Specification panel
     exactly as before. What changed is that priority is read WHERE THE CARD IS:
     inside a binder, and, for the Goals that are in no active binder, in
     Binder's own "Not in a binder yet" list, so that losing the tab hides none
     of them.

     It is kept here rather than deleted for the reason this list exists: a
     screen that may be wanted again is deferred, not removed and rebuilt. If a
     later batch decides prioritisation deserves its own destination after all,
     it moves one entry. */
  { id: "goals", label: "Goals", count: "goals", view: Goals,
    title: "Goals",
    sub: "What you're looking for, and what your Trusted Partners work from" },
]);

const CSS = `
.mcs { --bg:#F7F9FA; --panel:#FFF; --line:#DFE4EA; --line-soft:#EDF0F4; --text:#131922;
  --muted:#616B7A; --faint:#8B95A3; --t1:#0B5D66; --t1-bg:#E6F0F1; --amber:#9A6408;
  --amber-bg:#FBF3E3; --amber-line:#EBD9B4; --rail:#0A1014;
  font-family:'Public Sans',system-ui,sans-serif; color:var(--text); font-size:14px;
  line-height:1.5; background:var(--bg); min-height:100vh;
  display:flex; flex-direction:column; -webkit-font-smoothing:antialiased; }
.mcs *,.mcs *::before,.mcs *::after { box-sizing:border-box; }
.mcs button { font-family:inherit; font-size:inherit; cursor:pointer; }
.mcs :focus-visible { outline:2px solid var(--t1); outline-offset:2px; }
.mcs p { margin:0; }
.mcs .disp { font-family:'Archivo',system-ui,sans-serif; }

/* ---- browse: the doorways, the grid and the specification panel (C1) ---- */
.mcs-br { display:flex; flex-direction:column; gap:10px; }
.mcs-br-doors { display:flex; gap:6px; }
.mcs-br-door { border:1px solid var(--line); background:var(--panel); color:var(--muted);
  border-radius:999px; padding:5px 12px; font-size:13px; }
.mcs-br-door.on { border-color:var(--t1); background:var(--t1-bg); color:var(--t1); font-weight:600; }
.mcs-br-find { display:grid; grid-template-columns:1fr auto; gap:4px 10px; align-items:center; }
.mcs-br-lab { font-size:12px; color:var(--faint); }
.mcs-br-in { border:1px solid var(--line); border-radius:6px; padding:7px 9px; font:inherit;
  background:var(--panel); color:var(--text); min-width:0; }
.mcs-br-in.n { width:88px; }
.mcs-br-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:4px;
  max-height:240px; overflow:auto; }
.mcs-br-note { font-size:12px; color:var(--faint); }
.mcs-br-open { display:flex; align-items:center; justify-content:space-between; gap:10px; margin:0; }
.mcs-br-back { border:0; background:none; color:var(--t1); font-size:13px; padding:0;
  text-decoration:underline; }
.mcs-br-empty { margin:0; color:var(--muted); font-size:13px; }
.mcs-br-count { margin:0; color:var(--faint); font-size:12px; }
.mcs-br-grid { list-style:none; margin:0; padding:0; display:grid; gap:10px;
  grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); }
.mcs-br-cell { position:relative; }
.mcs-br-cell.on .mcs-br-card { border-color:var(--t1); background:var(--t1-bg); }
.mcs-br-card { display:flex; flex-direction:column; gap:4px; width:100%; text-align:left;
  border:1px solid var(--line); border-radius:8px; background:var(--panel); padding:8px; }
.mcs-br-art { display:flex; align-items:center; justify-content:center; aspect-ratio:5/7;
  background:var(--line-soft); border-radius:5px; overflow:hidden; }
.mcs-br-art img { width:100%; height:100%; object-fit:contain; }
.mcs-br-plate { font-size:12px; color:var(--muted); text-align:center; padding:6px; }
.mcs-br-name { font-size:13px; font-weight:600; }
.mcs-br-sub { font-size:11px; color:var(--faint); }
.mcs-br-plus { position:absolute; top:12px; right:12px; width:26px; height:26px; border-radius:999px;
  border:1px solid var(--line); background:var(--panel); color:var(--t1); font-size:16px;
  line-height:1; display:flex; align-items:center; justify-content:center; }
.mcs-br-pager { display:flex; align-items:center; justify-content:center; gap:12px; margin:0; }
.mcs-br-page { border:1px solid var(--line); background:var(--panel); color:var(--text);
  border-radius:6px; padding:5px 10px; font-size:13px; }
.mcs-br-page:disabled { color:var(--faint); }
.mcs-br-pos { font-size:12px; color:var(--faint); }
.mcs-spec-sub { margin:0; font-size:12px; color:var(--muted); }
.mcs-spec-ask { margin:0; font-size:13px; font-weight:600; }
.mcs-spec-net { margin:0; font-size:13px; color:var(--t1); }

/* THE SPECIFICATION SHEET SITS OVER THE GRID (Phase 5 C3.3).

   Out of flow, and that is the point rather than the style. Until C3.3 this
   panel was rendered above the grid in ordinary flow, so opening it pushed
   everything the person was looking at down the page while the window's scroll
   position stayed where it was — the cards jumped on open and jumped back on
   close. C3.3's panel is several times taller, so the same arrangement would
   have shoved the grid most of a screen.

   Fixed, the grid underneath does not move at all, which makes "come back to
   exactly where you were" true by construction: there is nothing to save and
   nothing to restore, and so no restoration code that could get it wrong.

   A sheet from the bottom on a phone, where a thumb is; a panel down the side
   on a wide screen, where the grid can stay visible beside it. */
.mcs-spec-scrim { position:fixed; inset:0; z-index:30; display:flex; align-items:flex-end;
  justify-content:center; background:rgba(11,25,34,.34); }
.mcs-spec-panel { background:var(--panel); border-top:1px solid var(--line);
  border-radius:14px 14px 0 0; width:100%; max-width:640px; max-height:88vh; overflow:auto;
  padding:16px; display:flex; flex-direction:column; gap:16px; }
.mcs-spec-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.mcs-spec-head strong { font-size:15px; }
.mcs-spec-part { display:flex; flex-direction:column; gap:9px;
  padding-top:14px; border-top:1px solid var(--line-soft); }
.mcs-spec-part:first-of-type { border-top:0; padding-top:0; }
.mcs-spec-binders, .mcs-spec-copies { list-style:none; margin:0; padding:0;
  display:flex; flex-direction:column; gap:8px; }
.mcs-spec-copies > li { border:1px solid var(--line); border-radius:9px; padding:11px;
  display:flex; flex-direction:column; gap:8px; }
.mcs-spec-copies > li.gone { background:var(--line-soft); }
.mcs-spec-wants { display:flex; flex-wrap:wrap; gap:8px; margin:0; }
.mcs-spec-new { display:flex; gap:8px; margin:0; }
.mcs-spec-conflict { margin:0; padding:9px 11px; border-radius:6px; background:var(--amber-bg);
  border:1px solid var(--amber-line); color:var(--amber); font-size:13px; }
.mcs-check { display:flex; align-items:center; gap:9px; font-size:13.5px; }
.mcs-check input { width:17px; height:17px; }
.mcs-in { flex:1; min-width:0; border:1px solid var(--line); border-radius:6px; padding:9px 11px;
  font:inherit; font-size:16px; background:#FFF; color:var(--text); }
.mcs-field { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--muted); }
.mcs-field select, .mcs-field input { padding:9px 11px; border:1px solid var(--line);
  border-radius:6px; font:inherit; font-size:16px; background:#FFF; color:var(--text); }
.mcs-linkish { border:0; background:none; padding:0; color:var(--t1); font-size:13px;
  text-decoration:underline; }

/* ---- your cards: the card, then the copies of it (Phase 5 C3.4) ---- */
.mcs-filter { display:flex; align-items:center; gap:10px; flex-wrap:wrap;
  margin:0; padding:12px 16px; border-bottom:1px solid var(--line-soft); }
.mcs-group { border-bottom:1px solid var(--line); }
.mcs-group:last-child { border-bottom:0; }
.mcs-group-head { display:flex; gap:12px; align-items:flex-start; padding:14px 16px 4px; }
.mcs-group-art { flex:0 0 52px; width:52px; aspect-ratio:5/7; display:flex; align-items:center;
  justify-content:center; background:var(--line-soft); border-radius:5px; overflow:hidden; }
.mcs-group-art img { width:100%; height:100%; object-fit:contain; }
.mcs-group-plate { font-size:10px; color:var(--muted); text-align:center; padding:4px; }
.mcs-group .mcs-rec { padding-left:16px; padding-right:16px; }
.mcs-group .mcs-rec:last-child { border-bottom:0; }

/* ---- binder: the library, and one binder's cards (Phase 5 C3.4) ---- */
.mcs-binder { border-bottom:1px solid var(--line-soft); }
.mcs-binder:last-child { border-bottom:0; }
.mcs-binder-head { display:flex; gap:12px; align-items:center; padding:12px 16px; }
.mcs-binder-open { flex:1; min-width:0; text-align:left; border:0; background:none; padding:0;
  display:flex; flex-direction:column; gap:2px; }
.mcs-binder-do { display:flex; gap:12px; flex-wrap:wrap; }
.mcs-filling { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:0 0 10px;
  padding:9px 12px; border-radius:8px; background:var(--t1-bg); color:var(--t1);
  border:1px solid #CBE0E2; font-size:13px; }

@media (min-width:860px) {
  .mcs-spec-scrim { align-items:stretch; justify-content:flex-end; }
  .mcs-spec-panel { border-radius:0; border-top:0; border-left:1px solid var(--line);
    width:min(460px,100%); max-height:100vh; }
}

/* ---- the top of a phone ---- */
.mcs-top { background:var(--panel); border-bottom:1px solid var(--line); padding:14px 16px;
  display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.mcs-brand { display:flex; align-items:center; gap:8px; }
.mcs-mark { width:16px; height:16px; position:relative; display:block; flex:0 0 16px; }
.mcs-mark i { position:absolute; width:10px; height:10px; border:1.5px solid #4E8C93; display:block; }
.mcs-mark i:first-child { top:0; left:0; }
.mcs-mark i:last-child { bottom:0; right:0; border-color:#0A1014; }
.mcs-word { font-family:'Archivo'; font-weight:700; font-size:15px; letter-spacing:-.01em; }
.mcs-me { margin-left:auto; text-align:right; min-width:0; }
.mcs-me .n { font-weight:600; font-size:13.5px; }
.mcs-me .r { color:var(--faint); font-size:10.5px; letter-spacing:.07em; text-transform:uppercase;
  font-family:'Archivo'; font-weight:600; }
.mcs-out { background:none; border:1px solid var(--line); color:var(--muted); border-radius:7px;
  padding:6px 11px; font-size:13px; }
.mcs-out:hover { border-color:#B9C4CE; color:var(--text); }

.mcs-ro { display:flex; gap:8px; flex-wrap:wrap; align-items:baseline; background:var(--amber-bg);
  border-bottom:1px solid var(--amber-line); color:var(--amber); padding:8px 16px; font-size:12.5px; }
.mcs-ro .dim { color:#A9863F; }
.mcs-joined { display:flex; gap:10px; flex-wrap:wrap; align-items:baseline; background:var(--t1-bg);
  border-bottom:1px solid var(--line); color:var(--t1); padding:10px 22px; font-size:12.5px; }
.mcs-joined strong { font-weight:600; }
.mcs-joined-x { margin-left:auto; background:none; border:0; padding:0; color:var(--t1);
  font-weight:600; font-size:12.5px; }

.mcs-body { flex:1; display:flex; min-width:0; }
.mcs-main { flex:1; min-width:0; padding:18px 16px 92px; }
.mcs-h { font-family:'Archivo'; font-size:20px; font-weight:700; letter-spacing:-.02em; margin:0; }
.mcs-sub { color:var(--muted); font-size:13.5px; margin-top:2px; }

/* ---- panels and records ---- */
.mcs-panel { background:var(--panel); border:1px solid var(--line); border-radius:12px;
  margin-top:16px; max-width:760px; overflow:hidden; }
.mcs-ph { display:flex; align-items:baseline; gap:10px; padding:12px 16px;
  border-bottom:1px solid var(--line-soft); }
.mcs-ph h2 { font-family:'Archivo'; font-size:10.5px; font-weight:700; letter-spacing:.09em;
  text-transform:uppercase; color:var(--muted); margin:0; }
.mcs-pnote { margin-left:auto; font-size:11.5px; color:var(--faint); }
.mcs-empty { padding:22px 16px; color:var(--muted); max-width:58ch; }

/* SAYING WHAT YOU WANT (Batch 7). One column, thumb-sized controls, no modal:
   somebody adding a card they are hunting is usually standing in a shop with a
   phone, and a sheet that covered the list would hide what they already said. */
.mcs-addbar { margin:0 0 12px; }
.mcs-add { background:var(--panel); border:1px solid var(--line); border-radius:12px;
  padding:14px; margin-bottom:14px; display:flex; flex-direction:column; gap:10px; }
.mcs-add-head { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.mcs-field { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--muted); }
.mcs-field input { padding:10px 12px; border:1px solid var(--line); border-radius:6px;
  font:inherit; font-size:16px; color:var(--ink); background:#FFF; }
.mcs-go { padding:10px 14px; border:1px solid var(--line); border-radius:6px; background:#FFF;
  font:inherit; font-size:14px; font-weight:600; color:var(--ink); cursor:pointer; }
.mcs-go:hover { border-color:var(--accent); }
.mcs-go.quiet { font-weight:400; color:var(--muted); }
.mcs-go[disabled] { opacity:.55; cursor:default; }
.mcs-add-row { display:flex; flex-direction:column; align-items:flex-start; gap:2px; width:100%;
  text-align:left; padding:10px 12px; border:1px solid var(--line); border-radius:6px;
  background:#FFF; font:inherit; cursor:pointer; }
.mcs-add-row:hover, .mcs-add-row.on { border-color:var(--accent); }
.mcs-add-card { display:flex; flex-direction:column; align-items:flex-start; gap:5px; margin:0; }
.mcs-add-versions, .mcs-add-intent { display:flex; flex-direction:column; gap:7px;
  font-size:12px; color:var(--muted); }
.mcs-add-problem { margin:0; padding:10px 12px; border-radius:6px; background:#FBEDEC;
  border:1px solid #EBD9B4; color:#98302C; font-size:13px; }
.mcs-dim { color:var(--muted); font-size:12.5px; }
.mcs-goal-do { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0 0; }
.mcs-list { display:flex; flex-direction:column; }

.mcs-rec { padding:14px 16px; border-bottom:1px solid var(--line-soft); }
.mcs-rec:last-child { border-bottom:0; }
.mcs-rec-head { display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap; }
.mcs-rec-id { min-width:0; flex:1 1 240px; }
.mcs-rec-t { font-weight:600; font-size:15px; }
.mcs-rec-s { color:var(--muted); font-size:13px; margin-top:1px; }
.mcs-rec-tags { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
.mcs-rec-note { margin-top:9px; color:var(--muted); font-size:13.5px; display:flex; gap:7px;
  flex-wrap:wrap; max-width:60ch; }

.mcs-tag { display:inline-block; font-size:10.5px; letter-spacing:.03em; padding:2px 7px;
  border-radius:4px; background:#F1F4F6; color:var(--muted); border:1px solid var(--line-soft);
  white-space:nowrap; }
.mcs-tag-strong { background:var(--t1-bg); color:var(--t1); border-color:#CBE0E2; }
.mcs-tag-unknown { background:var(--amber-bg); color:var(--amber); border-color:var(--amber-line); }

.mcs-marks { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
.mcs-mark { font-size:11px; color:var(--faint); border:1px solid var(--line-soft);
  border-radius:4px; padding:1px 7px; }

.mcs-facts { display:flex; flex-wrap:wrap; gap:6px 18px; margin-top:10px; }
.mcs-fact { display:flex; gap:6px; align-items:baseline; min-width:0; }
.mcs-fact-l { font-family:'Archivo',system-ui,sans-serif; font-size:9.5px; letter-spacing:.07em;
  text-transform:uppercase; color:var(--faint); font-weight:700; white-space:nowrap; }
.mcs-fact-v { font-size:13px; font-variant-numeric:tabular-nums; }

.mcs-sub { list-style:none; margin:11px 0 0; padding:10px 0 0;
  border-top:1px dashed var(--line-soft); display:flex; flex-direction:column; gap:8px; }
.mcs-sub li { display:flex; gap:8px; flex-wrap:wrap; align-items:baseline; }
.mcs-sub-t { font-size:13.5px; }
.mcs-sub-f { display:flex; gap:6px 16px; flex-wrap:wrap; align-items:baseline; }

/* ---- the tab bar, at the bottom, where a thumb is ---- */
.mcs-nav { position:fixed; left:0; right:0; bottom:0; display:flex; z-index:10;
  background:rgba(10,16,20,.96); border-top:1px solid #1B242C; }
.mcs-i { flex:1; background:none; border:0; color:#8C99A6; padding:11px 6px 13px;
  display:flex; flex-direction:column; align-items:center; gap:3px; }
.mcs-i .l { font-size:11.5px; }
.mcs-i .c { font-family:'Archivo'; font-weight:700; font-size:15px; line-height:1; }
.mcs-i.on { color:#FFF; }
.mcs-i.on .c { color:#7FC2C9; }

/* ---- a wide screen: the same three, down the side ---- */
@media (min-width:860px) {
  .mcs-nav { position:sticky; top:0; bottom:auto; height:100vh; width:236px; flex:0 0 236px;
    flex-direction:column; border-top:0; border-right:1px solid #1B242C; padding:14px 10px; gap:4px; }
  .mcs-i { flex:0 0 auto; flex-direction:row; justify-content:flex-start; gap:12px;
    border-radius:8px; padding:11px 13px; }
  .mcs-i .l { font-size:13.5px; flex:1; text-align:left; }
  .mcs-i.on { background:#161F26; }
  .mcs-main { padding:24px 28px 40px; }
  .mcs-body { flex-direction:row-reverse; }
}
`;

export default function CollectorShell({ state, onSignOut, joined = null, onDismissJoined = null,
  onAddGoal = null, onSetPriority = null, onRemoveGoal = null, onBrowseCards = null,
  onSpecify = null, onCreateBinder = null, onRenameBinder = null,
  onArchiveBinder = null }) {
  /* JUST ACCEPTED? OPEN ON THE THING THAT CHANGED (Phase 5 Batch 3A). A person
     who has this second finished joining a shop's network; the section that now
     holds that shop is what they came for. Everyone else opens where they
     always did. */
  const [section, setSection] = useState(joined ? "partners" : SECTIONS[0].id);
  /* THE BROWSING SESSION LIVES HERE, above the section that uses it, so that
     leaving Browse and coming back lands where it was left rather than at an
     empty search box. It holds a doorway, what was typed, which set or artist
     is open, the page and the rows — and nothing durable: it is gone when the
     tab is closed, which is exactly what a browsing session should be. */
  const [browseSession, setBrowseSession] = useState(EMPTY_SESSION);
  /* WHICH BINDER IS BEING FILLED, IF ONE IS (Phase 5 C3.4). "Add cards" in a
     binder sends a person to Browse, and this is the note they carry: a binder
     id and its name, held here for the same reason the browsing session is —
     above the section, so it survives the trip, and in memory, so it is gone
     when the tab closes.

     IT IS NOT A PREFERENCE AND IT IS NOT STORED. Nothing persists it, and in
     particular it is not `collectors.prefs`, which a Trusted Partner receives.
     All it does is tick a checkbox in the specification panel, which the
     Collector can untick; Save still writes only the difference, and Cancel
     still writes nothing. */
  const [fillingBinder, setFillingBinder] = useState(null);

  const who = describeActor(state);
  /* Row counts of collections the SERVER scoped to this Collector. Nothing
     here decides what any of them mean — which is why there is no
     opportunities count: "active" is a judgement, and it is the server's. */
  const counts = {};
  for (const s of SECTIONS) {
    if (s.count) counts[s.id] = rows(state && state[s.count]).length;
  }

  const meta = SECTIONS.find((s) => s.id === section) || SECTIONS[0];
  const View = meta.view;

  return (
    <div className="mcs">
      <style>{CSS}</style>

      <header className="mcs-top">
        <span className="mcs-brand">
          <span className="mcs-mark"><i /><i /></span>
          <span className="mcs-word">MetYet</span>
        </span>
        <span className="mcs-me">
          {/* Their own name, found by their own id. When the server named
              nobody, nothing is substituted for it. */}
          <span className="n">{who.name || "Your account"}</span>
          <span className="r" style={{ display: "block" }}>Collector</span>
        </span>
        <button className="mcs-out" type="button" onClick={onSignOut}>Sign out</button>
      </header>

      {/* ONE GREETING, FOR THE ONE THING THAT JUST HAPPENED. It is handed in
          from the entrance, which read it out of the server's own reply; this
          file decides nothing about it and it grants nothing. Dismissing it is
          the end of it — there is no second copy anywhere. */}
      {joined ? (
        <div className="mcs-joined" role="status">
          <span>You've joined <strong>{joined}</strong>'s Collector Network. They can see the
            goals you set and the cards in your Trade Binder.</span>
          {onDismissJoined ? (
            <button className="mcs-joined-x" type="button" onClick={onDismissJoined}>Got it</button>
          ) : null}
        </div>
      ) : null}

      {/* THE NOTICE HAS TO BE TRUE, AND BATCH 7 CHANGED WHAT IS TRUE. Goals can
          now be set, changed and removed from here, so a blanket "read-only"
          would be a lie — and "Goals … arrive in a later release" doubly so.
          What is still read-only is everything else, and the notice says which.

          IT ONLY SAYS SO WHEN IT CAN. Handed no callback, this shell can change
          nothing, and claiming otherwise would be the same lie in the other
          direction. */}
      <div className="mcs-ro" role="note">
        {onAddGoal ? (
          <>
            <span>Your goals are yours to change — say what you&apos;re looking for and how hard.</span>
            <span className="dim">Everything else here is read-only for now: trades and messages arrive later.</span>
          </>
        ) : (
          <>
            <span>Read-only for now — everything here is what MetYet holds for you.</span>
            <span className="dim">Goals, trades and messages arrive in a later release.</span>
          </>
        )}
      </div>

      <div className="mcs-body">
        <nav className="mcs-nav" aria-label="Collector">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button"
              className={"mcs-i" + (s.id === section ? " on" : "")}
              aria-current={s.id === section ? "page" : undefined}
              onClick={() => setSection(s.id)}>
              {s.count ? <span className="c">{counts[s.id]}</span> : null}
              <span className="l">{s.label}</span>
            </button>
          ))}
        </nav>
        <main className="mcs-main" key={section}>
          <h1 className="mcs-h disp">{meta.title}</h1>
          <p className="mcs-sub">{meta.sub}</p>
          {/* Goals is the one section a person can change something from
              (Batch 7), so it is the one that receives callbacks. Every other
              section is handed the projection and nothing else. */}
          {/* Goals is prioritisation — "how hard am I looking?" — and keeps its
              own two callbacks. Browse is specification — "what copy, where
              does it belong, what do I own?" — and takes ONE, because every
              durable change it makes is a step in a sequence the panel
              composes (Phase 5 C3.3). */}
          <View state={state} {...(meta.id === "goals"
            ? { onAddGoal, onSetPriority, onRemoveGoal, onBrowseCards }
            : meta.id === "browse"
              ? { onSpecify, onBrowseCards, session: browseSession, onSession: setBrowseSession,
                fillingBinder, onDoneFilling: () => setFillingBinder(null) }
              : meta.id === "my-cards"
                /* Your Cards asks the catalog what its canonical cards are
                   called, and opens the same specification panel Browse does
                   (Phase 5 C3.4). Two props, both already bound above. */
                ? { onSpecify, onBrowseCards }
                : meta.id === "binder"
                  ? { onSpecify, onBrowseCards, onCreateBinder, onRenameBinder,
                    onArchiveBinder, fillingBinder,
                    onAddCards: (into) => { setFillingBinder(into); setSection("browse"); } }
                  : {})} />
        </main>
      </div>
    </div>
  );
}
