/* ============================================================================
   THE COLLECTOR PRODUCTION SHELL — PROJECTION IN, PIXELS OUT

     <CollectorShell state={projection} onSignOut={fn} />

   The first real Collector surface in production. Everything on it arrived in
   one `GET /api/view` response for this Collector, and there is no second way
   for anything to get here: this file imports no store, no session, no api
   client, no domain and no `fetch`. Hand it a projection and it renders.

   THREE THINGS, WHICH ARE THE PRODUCT — CONCEPTS, NOT TABS. Each of these has
   been a destination at some point and none of them has to be one: Goals is
   read where the card is, and what you own is a set of views inside Binders.
   The navigation below is four tabs and this list is not it.

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
import { newBrowseSession } from "./sections/Browse.jsx";
import Browse from "./sections/Browse.jsx";
import Binder from "./sections/Binder.jsx";
import Goals from "./sections/Goals.jsx";
import DealFlow from "./sections/DealFlow.jsx";

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
  /* AND YOUR CARDS IS NO LONGER BESIDE IT (this batch). Your Cards was
     scaffolding: the true-match batch kept it as a temporary fifth tab because
     Binders could not yet answer "what do I own" or "what am I offering", and
     deleting a working screen to make a navigation diagram true early would
     have removed a real job from the product. Binders now holds those views —
     All Cards, Primary Goals, Secondary Goals, Trade/Sell — derived on every
     render from the binders, goals and copies the server already sent. The
     screen itself was not deleted either: it is `sections/Collection.jsx`, the
     component Binders composes once per view, which is the same move C2 made
     when Trade Binder became Your Cards. One concept, one file, a third name.

     The count is `binders` — how many groupings they have made, which is a fact
     about them rather than about MetYet. It deliberately does not count the
     collection: "how organised am I" and "how much do I have" are different
     questions, and the views say their own numbers. */
  { id: "binder", label: "Binders", count: "binders", unit: ["binder", "binders"], view: Binder,
    title: "Binders",
    sub: "Your collection, and where each card belongs" },
  /* WHAT YOUR SHOPS ACTUALLY HAVE (true-match batch). Last, because it is the
     end of the sentence the other four begin: find a card, say what you want,
     know who you deal with — and then, here, which of them has the thing you
     described. It is the first screen that answers rather than records.

     IT COUNTS NOTHING, FOR THE REASON BROWSE COUNTS NOTHING. Every counted tab
     numbers a collection of the person's OWN things — their binders, their
     cards, their shops. What waits here is neither theirs nor one collection:
     `discoveries` is keyed by (goal, partner), so its length is a number of
     overlaps rather than of copies, and putting it on the tab would disagree
     with the copies the screen itself counts. The panel says "3 copies that
     match", which is the number a person actually wants, in a unit they can
     read. This also keeps the shell's existing rule intact: a tab number is a
     row count of one collection and never something the shell reasoned its way
     to.

     AND IT IS FOUR TABS. Browse, Binders, Deal Flow, Trusted Partners — the
     approved navigation (reordered in Phase 6 P6-1: Deal Flow is where a
     Collector acts, so it sits beside the two places they find and keep cards;
     Trusted Partners, the network they act within, closes the row). Deal Flow arrived while Your Cards
     was still a tab of its own, because deleting Your Cards before Binders
     could hold what it did would have taken away the only way to see what you
     own to make a navigation diagram true early. Binders can hold it now: the
     cross-Binder views are real, Your Cards is a component they compose, and
     the fifth tab is gone rather than deferred. */
  { id: "deal-flow", label: "Deal Flow", count: null, view: DealFlow,
    title: "Deal Flow",
    sub: "Which of your shops has the card you asked for" },
  /* THE NETWORK (Phase 6 P6-1: last). The shops this Collector deals with —
     reference rather than a place to act, so it follows Deal Flow. */
  { id: "partners", label: "Trusted Partners", count: "partners", unit: ["partner", "partners"], view: TrustedPartners,
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
  font-family:var(--font-ui); color:var(--text); font-size:14px;
  line-height:1.5; background:var(--bg); min-height:100vh;
  display:flex; flex-direction:column; -webkit-font-smoothing:antialiased; }
.mcs *,.mcs *::before,.mcs *::after { box-sizing:border-box; }
.mcs button { font-family:inherit; font-size:inherit; cursor:pointer; }
.mcs :focus-visible { outline:2px solid var(--t1); outline-offset:2px; }
.mcs p { margin:0; }
.mcs .disp { font-family:var(--font-display); }

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
/* One line after a new goal is saved (Phase 5 C5). The teal the product uses
   when it is telling somebody something went right. */
.mcs-spec-saved { margin:0; padding:9px 11px; border-radius:6px; background:var(--t1-bg);
  border:1px solid #CBE0E2; color:var(--t1); font-size:13px; }
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
/* THE TILE WITH NO PICTURE IN IT (Phase 5 C7.1). One class for every art tile
   in the collector, whatever its size, because what it says is the same thing
   in all of them: which card this is. It wraps rather than truncates, so a long
   name reflows inside a 34px tile instead of spilling out of it —
   the tile keeps its 5/7 box either way, so nothing on the row moves when a
   picture is absent or fails. */
.mcs-art-plate { font-size:10px; line-height:1.15; color:var(--muted); text-align:center;
  padding:4px; overflow:hidden; overflow-wrap:anywhere;
  /* TRUNCATE AT THE BOTTOM, NOT AT BOTH ENDS. The plate is centred inside the
     tile, so a name too long for the box would otherwise be clipped top AND
     bottom — half a line of letters at each end, which reads worse than the
     empty tile it replaced. The clamp cuts whole lines off the end and marks
     the cut, which at least stays readable. */
  display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; }
.mcs-has-art .mcs-art-plate { font-size:8px; padding:2px; -webkit-line-clamp:4; }
.mcs-group .mcs-rec { padding-left:16px; padding-right:16px; }
.mcs-group .mcs-rec:last-child { border-bottom:0; }

/* ---- the collection views and the search box (binders batch) ----

   A row of plain buttons, not tabs inside tabs: they change which cards the
   list underneath is about, and the pressed one says so through aria-pressed
   rather than through colour alone. The search box is a real search input
   at 16px so iOS does not zoom when it takes focus, the same as every other
   text input in this shell. */
.mcs-views { display:flex; flex-wrap:wrap; gap:6px; margin:0 0 10px; padding:0 16px; }
.mcs-view { appearance:none; border:1px solid var(--line); background:var(--panel);
  color:var(--text); font:inherit; font-size:12.5px; font-weight:600; padding:6px 11px;
  border-radius:999px; cursor:pointer; }
.mcs-view[aria-pressed="true"] { background:var(--t1-bg); border-color:#CBE0E2; color:var(--t1); }
.mcs-view.quiet { color:var(--muted); font-weight:500; }
.mcs-find { display:flex; gap:8px; align-items:center; margin:0 0 12px; padding:0 16px; }
.mcs-find .mcs-in { flex:1 1 auto; min-width:0; }
.mcs-binder-name { margin:0 0 10px; padding:0 16px; font-family:var(--font-display);
  font-size:16px; font-weight:700; color:var(--text); }

/* ---- deal flow: the copies your shops have (true-match batch) ----

   ARTWORK-FORWARD AT THE GOAL, PLAIN AT THE COPY. The card is the thing a
   person recognises, so it keeps the same 5/7 tile every other collector
   surface uses; a physical copy is a row of facts and gets no picture of its
   own, because a photograph of THIS slab is what Request Photos is for and that
   is not this batch. Each copy reads as one line on a phone and stays one line
   on a desktop — grade first, because it is what the Collector asked about. */
.mcs-df-copies { list-style:none; margin:0; padding:0 16px 14px; display:flex;
  flex-direction:column; gap:6px; }
.mcs-df-copy { display:flex; flex-wrap:wrap; gap:4px 10px; align-items:baseline;
  padding:8px 10px; background:var(--line-soft); border-radius:7px; }
.mcs-df-shop { font-weight:600; font-size:12.5px; color:var(--text); }
.mcs-df-facts { display:flex; flex-wrap:wrap; gap:4px 10px; align-items:baseline;
  min-width:0; font-size:12px; color:var(--muted); }
.mcs-df-grade { color:var(--t1); font-weight:600; }
.mcs-df-ask { margin-left:auto; color:var(--text); font-variant-numeric:tabular-nums; }
.mcs-df-note { flex-basis:100%; font-size:11.5px; color:var(--amber); }
/* QUALIFICATION CONTROLS, ON THEIR OWN LINE UNDER THE COPY THEY ACT ON. The
   facts above read left to right; these wrap to a full row so a press is never
   next to a number it might be mistaken for. */
.mcs-df-do { flex-basis:100%; display:flex; flex-wrap:wrap; gap:8px;
  align-items:center; margin-top:6px; }
.mcs-df-state { font-size:11.5px; color:var(--dim); }
.mcs-df-trouble { font-size:11.5px; color:var(--amber); }
/* ---- making an offer, and the offer under its Goal (Batch 3B) ----
   On the copy it is for, a full row under the copy's own controls; under the
   Goal, a box above the copies. One column at every width. */
.mcs-offer { flex-basis:100%; display:flex; flex-direction:column; gap:7px; margin:8px 0 2px;
  padding:11px 12px; border:1px solid var(--line); border-radius:8px; }
.mcs-offer-live { margin:0 16px 12px; }
.mcs-offer-card { margin:0; font-size:13px; font-weight:600; color:var(--text); }
.mcs-offer-terms { margin:0; font-size:12px; color:var(--muted); }
.mcs-offer-status { margin:0; font-size:13px; font-weight:600; color:var(--text); }
.mcs-offer-trail { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:2px;
  font-size:12px; color:var(--muted); font-variant-numeric:tabular-nums; }
.mcs-offer-trail .mine { color:var(--text); }
.mcs-offer-do, .mcs-offer-mode { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.mcs-offer-entry { display:flex; flex-direction:column; gap:8px; margin:0; }
.mcs-offer-field { display:flex; align-items:center; gap:6px; max-width:220px; }
.mcs-offer-field input { flex:1; min-width:0; padding:10px 12px; border:1px solid var(--line); border-radius:6px;
  font-size:16px; font-variant-numeric:tabular-nums; }
.mcs-offer-unit { color:var(--muted); font-weight:600; }
.mcs-offer-line { margin:0; font-size:12px; color:var(--muted); }
.mcs-offer-problem { margin:0; font-size:12px; color:var(--amber); }
.mcs-chip { background:#FFF; border:1px solid var(--line); color:var(--muted); border-radius:999px;
  padding:7px 12px; font-size:12.5px; }
.mcs-chip.on { border-color:var(--accent); color:var(--text); font-weight:600; }
/* THE THREE THINGS A PERSON CAN MEAN ABOUT ONE COPY. A row, because they are
   one question with three answers rather than three separate switches. */
.mcs-disp { display:flex; flex-wrap:wrap; gap:6px; margin:6px 0 0; }
.mcs-df-none { margin:0; padding:2px 16px 14px; font-size:12.5px; color:var(--muted); }
.mcs-rec-facts { display:flex; flex-wrap:wrap; gap:4px 14px; margin-top:8px; }

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
/* Scoped to the brand (P6-2): .mcs-mark is also the card version chip, and
   the unscoped 16px width squeezed every chip's text on top of the next. */
.mcs-brand .mcs-mark { width:16px; height:16px; position:relative; display:block; flex:0 0 16px; }
.mcs-brand .mcs-mark i { position:absolute; width:10px; height:10px; border:1.5px solid #4E8C93; display:block; }
.mcs-brand .mcs-mark i:first-child { top:0; left:0; }
.mcs-brand .mcs-mark i:last-child { bottom:0; right:0; border-color:#0A1014; }
.mcs-word { font-family:var(--font-display); font-weight:700; font-size:15px; letter-spacing:-.01em; }
.mcs-me { margin-left:auto; text-align:right; min-width:0; }
.mcs-me .n { font-weight:600; font-size:13.5px; }
.mcs-me .r { color:var(--faint); font-size:10.5px; letter-spacing:.07em; text-transform:uppercase;
  font-family:var(--font-display); font-weight:600; }
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
.mcs-h { font-family:var(--font-display); font-size:20px; font-weight:700; letter-spacing:-.02em; margin:0; }
.mcs-sub { color:var(--muted); font-size:13.5px; margin-top:2px; }

/* ---- panels and records ---- */
.mcs-panel { background:var(--panel); border:1px solid var(--line); border-radius:12px;
  margin-top:16px; max-width:760px; overflow:hidden; }
.mcs-ph { display:flex; align-items:baseline; gap:10px; padding:12px 16px;
  border-bottom:1px solid var(--line-soft); }
.mcs-ph h2 { font-family:var(--font-display); font-size:10.5px; font-weight:700; letter-spacing:.09em;
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
.mcs-fact-l { font-family:var(--font-display); font-size:9.5px; letter-spacing:.07em;
  text-transform:uppercase; color:var(--faint); font-weight:700; white-space:nowrap; }
.mcs-fact-v { font-size:13px; font-variant-numeric:tabular-nums; }

.mcs-sub { list-style:none; margin:11px 0 0; padding:10px 0 0;
  border-top:1px dashed var(--line-soft); display:flex; flex-direction:column; gap:8px; }
.mcs-sub li { display:flex; gap:8px; flex-wrap:wrap; align-items:baseline; }
.mcs-sub-t { font-size:13.5px; }
.mcs-sub-s { font-size:12.5px; color:var(--faint); }
.mcs-sub-f { display:flex; gap:6px 16px; flex-wrap:wrap; align-items:baseline; }

/* ---- what a shop has that you asked for (Phase 5 C3.5) ---- */
.mcs-has-line { margin:11px 0 0; padding-top:10px; font-size:13.5px; color:var(--t1);
  border-top:1px dashed var(--line-soft); }
.mcs-has { margin-top:8px; padding-top:0; border-top:0; gap:10px; }
.mcs-has li { align-items:center; }
.mcs-has-art { flex:0 0 34px; width:34px; aspect-ratio:5/7; display:flex;
  align-items:center; justify-content:center; overflow:hidden; border-radius:3px;
  background:var(--line-soft); }
.mcs-has-art img { width:100%; height:100%; object-fit:contain; }

/* ---- the tab bar, at the bottom, where a thumb is ---- */
.mcs-nav { position:fixed; left:0; right:0; bottom:0; display:flex; z-index:10;
  background:rgba(10,16,20,.96); border-top:1px solid #1B242C; }
.mcs-i { flex:1; background:none; border:0; color:#8C99A6; padding:11px 6px 13px;
  display:flex; flex-direction:column; align-items:center; gap:3px; }
.mcs-i .l { font-size:11.5px; }
.mcs-i .c { font-family:var(--font-display); font-weight:700; font-size:15px; line-height:1; }
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

/* ==========================================================================
   PHASE 6 VISUAL FOUNDATION (P6-1)
   The frozen Phase 6 prototype (phase6-prototype-01 @ fca2c61) is the visual
   and interaction reference; production's palette and type are kept. This
   layer comes LAST on purpose: it restyles the classes the screens already
   use, so no section changed its markup or behaviour to receive it.
     tokens      the Phase 6 canvas and radii; the three tokens earlier rules
                 used without ever defining (--ink, --accent, --dim); and font
                 stacks that fall back to the system face, because production
                 loads no web font and a bare 'Archivo' fell back to serif
     header      the screen title stays in view as the screen scrolls
     tab bar     light, label-first, a teal rule over the current tab; the
                 count is a small badge; clears the iPhone home indicator
     sidebar     the same four, light, from 860px
     pills       one pill control for doorways, views and choices: white, and
                 filled dark when pressed
     grid        two columns on a phone, more as the screen widens
     sheet       the bottom sheet: Phase 6 corners and a grab handle; a side
                 panel on a wide screen. .mcs-sheet* names the primitive and
                 shares every rule with the Card Specification sheet
     feedback    acknowledgements are one rounded, quiet note (.mcs-toast,
                 shared with the existing saved / filling / joined notes)
   ========================================================================== */
.mcs { --bg:#EEF1F4; --ink:var(--text); --accent:var(--t1); --dim:var(--faint);
  --font-ui:'Public Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  --font-display:'Archivo',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  --r-card:12px; --r-sheet:18px; --tabbar-h:58px; }

/* the top of a phone: compact */
.mcs-top { padding:10px 16px; gap:10px; }
.mcs-word { font-size:16px; }
.mcs-me .n { font-size:13px; }
.mcs-out { border-radius:10px; padding:6px 12px; }

/* notices read as notes, not as a band across the screen */
.mcs-ro, .mcs-joined { margin:12px 16px 0; border-radius:10px; padding:9px 12px;
  font-size:12px; line-height:1.4; gap:4px 8px; }
.mcs-ro { border:1px solid var(--amber-line); }
.mcs-joined { border:1px solid #CFE3E5; }

/* the screen: a sticky title, then its content */
.mcs-main { padding:0 16px calc(var(--tabbar-h) + 32px + env(safe-area-inset-bottom, 0px)); }
.mcs-hd { position:sticky; top:0; z-index:5; display:flex; align-items:baseline; gap:10px;
  margin:0 -16px; padding:16px 16px 6px; background:var(--bg); }
.mcs-h { font-size:22px; line-height:1.2; }
.mcs-hd-count { margin-left:auto; color:var(--faint); font-size:12px; white-space:nowrap; }
.mcs-sub { margin-top:0; font-size:13px; }
/* Browse's controls sit inside a panel; give them the panel's own gutter. */
.mcs-panel .mcs-br { padding:12px 16px 16px; }
.mcs-panel { border-radius:14px; margin-top:14px; }

/* the tab bar, Phase 6: light, label first, a rule over the current tab */
.mcs-nav { background:#FFF; border-top:1px solid var(--line);
  padding-bottom:env(safe-area-inset-bottom, 0px); box-shadow:0 -6px 18px rgba(10,16,20,.05); }
.mcs-i { color:var(--faint); font-weight:600; min-height:var(--tabbar-h); padding:9px 4px 11px;
  justify-content:center; gap:4px; }
.mcs-i .l { order:1; font-size:12px; line-height:1.15; text-align:center; }
/* On a phone the tab bar is labels only, as in Phase 6: the count moves to the
   screen's header. It is still in the markup, and is shown in the sidebar. */
.mcs-i .c { display:none; order:2; font-family:var(--font-ui); font-size:10.5px; font-weight:700; line-height:1;
  padding:2px 6px; border-radius:999px; background:var(--line-soft); color:var(--muted); }
.mcs-i.on { color:var(--t1); box-shadow:inset 0 2px 0 var(--t1); }
.mcs-i.on .c { background:var(--t1-bg); color:var(--t1); }

/* pills: one control for doorways, collection views and two-way choices */
.mcs-br-door, .mcs-view, .mcs-chip { border:1px solid var(--line); background:#FFF; color:var(--muted);
  border-radius:999px; padding:6px 12px; font-size:12.5px; font-weight:600; white-space:nowrap; }
.mcs-br-door.on, .mcs-view[aria-pressed="true"], .mcs-chip.on { background:var(--text);
  border-color:var(--text); color:#FFF; }
.mcs-view.quiet { font-weight:500; }
.mcs-br-doors, .mcs-views { flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; padding-bottom:2px; }
.mcs-br-doors::-webkit-scrollbar, .mcs-views::-webkit-scrollbar { display:none; }

/* the card grid: two up on a phone */
.mcs-br-grid { grid-template-columns:1fr 1fr; gap:14px 12px; }
.mcs-br-card { border-radius:var(--r-card); padding:6px; box-shadow:0 1px 2px rgba(10,16,20,.05); }
.mcs-br-art, .mcs-group-art { border-radius:8px; }
.mcs-br-name { font-size:13.5px; }

/* buttons: Phase 6 corners */
.mcs-go, .mcs-br-page { border-radius:10px; }

/* the bottom sheet (and its primitive) */
.mcs-sheet-scrim { position:fixed; inset:0; z-index:30; display:flex; align-items:flex-end;
  justify-content:center; }
.mcs-sheet { background:var(--panel); width:100%; max-width:640px; max-height:88vh; overflow:auto;
  display:flex; flex-direction:column; gap:16px; }
.mcs-spec-scrim, .mcs-sheet-scrim { background:rgba(10,16,20,.32); }
.mcs-spec-panel, .mcs-sheet { border-top:0; border-radius:var(--r-sheet) var(--r-sheet) 0 0;
  padding:10px 16px calc(20px + env(safe-area-inset-bottom, 0px));
  box-shadow:0 -10px 30px rgba(10,16,20,.14); }
.mcs-spec-panel::before, .mcs-sheet::before { content:""; flex:0 0 auto; display:block; width:36px;
  height:4px; border-radius:999px; background:var(--line); margin:0 auto 2px; }

/* feedback: one quiet, rounded note */
.mcs-toast, .mcs-spec-saved, .mcs-filling { background:var(--t1-bg); color:var(--t1);
  border:1px solid #CFE3E5; border-radius:10px; padding:9px 12px; font-size:12.5px; }
.mcs-toast.warn, .mcs-spec-conflict { background:var(--amber-bg); color:var(--amber);
  border:1px solid var(--amber-line); border-radius:10px; }

/* ---- the Binders screen, Phase 6 (P6-2) ----
   Search and state filters, then three disclosures: the binders (one opens in
   place), Unfiled, and Your Cards. Tiles are the Collector's own Goals and
   copies — a picture, then why it matters and where it lives. */
.mcs-bcontrols { position:sticky; top:52px; z-index:4; background:var(--bg); margin:0 -16px;
  padding:4px 16px 2px; }
.mcs-bcontrols .mcs-find { padding:0; margin:0 0 8px; }
.mcs-bcontrols .mcs-in { border-radius:12px; background:#FFF; font-size:16px; padding:9px 12px; }
.mcs-lenses { padding:0; margin:0 0 8px; }
.mcs-bsection { margin-top:10px; }
.mcs-sechead { display:flex; align-items:baseline; gap:8px; width:100%; text-align:left; border:0;
  background:none; padding:6px 0 10px 18px; position:relative; font-family:var(--font-display);
  font-size:11.5px; font-weight:700; letter-spacing:.07em; text-transform:uppercase; color:var(--muted); }
.mcs-sechead::before { content:"▸"; position:absolute; left:0; top:4px; font-size:14px;
  transition:transform .15s; }
.mcs-sechead[aria-expanded="true"]::before { transform:rotate(90deg); }
.mcs-sechead .mcs-bmatch { margin-left:auto; text-transform:none; letter-spacing:0; }
.mcs-covers { display:flex; flex-direction:column; gap:10px; }
/* P6-3.1: the ROW is the card. An open binder's cards sit beneath it on the
   page itself — no wide empty box around a few tiles. */
.mcs-binders { max-width:1040px; }
.mcs-bcover { display:block; width:100%; text-align:left; }
.mcs-bhead-row { display:flex; align-items:center; border:1px solid var(--line); background:#FFF;
  border-radius:14px; }
.mcs-bcover.open .mcs-bhead-row { border-color:var(--t1); }
.mcs-bhead { display:block; flex:1 1 auto; min-width:0; text-align:left; border:0; background:none; position:relative;
  padding:12px 12px 12px 30px; }
.mcs-bhead-row .mcs-more { flex:0 0 auto; padding:10px 14px; font-size:18px; }
.mcs-bmenu { display:flex; flex-direction:column; margin:6px 0 0 auto; width:min(260px,100%); background:#FFF;
  border:1px solid var(--line); border-radius:12px; box-shadow:0 10px 30px rgba(16,22,27,.12); overflow:hidden; }
.mcs-bmenu button { border:0; background:#FFF; text-align:left; padding:11px 14px; font-size:13.5px; color:var(--text); }
.mcs-bmenu button + button { border-top:1px solid var(--line-soft); }
.mcs-bmenu button:hover { background:var(--line-soft); }
.mcs-bhead::before { content:"▸"; position:absolute; left:12px; top:11px; color:var(--muted);
  font-size:15px; transition:transform .15s; }
.mcs-bcover.open .mcs-bhead::before { transform:rotate(90deg); }
.mcs-bline { display:flex; align-items:baseline; justify-content:space-between; gap:8px; min-width:0; }
.mcs-bline b { font-size:15.5px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mcs-bline span { color:var(--faint); font-size:12.5px; white-space:nowrap; }
.mcs-bmatch { display:block; margin-top:3px; font-size:11.5px; color:var(--t1); font-weight:600; }
.mcs-bbody { padding:12px 0 6px; }
.mcs-btools { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:10px; }
.mcs-btools .mcs-bsum { margin:0; }
.mcs-badd { flex:0 0 auto; font-weight:600; white-space:nowrap; }
.mcs-openb { display:block; margin:8px 0 0; font-size:12.5px; }
.mcs-newcover { display:block; width:100%; text-align:center; color:var(--t1); font-weight:600; background:none;
  border:1px dashed var(--line); border-radius:14px; padding:12px; }
.mcs-newb { margin:0; }
.mcs-away { align-self:flex-start; font-size:12.5px; }
.mcs-bempty { margin:0 0 10px; }
.mcs-results { margin-top:14px; padding-top:12px; border-top:1px solid var(--line); }
.mcs-rhead { margin:0 0 2px; font-family:var(--font-display); font-size:11.5px; font-weight:700;
  letter-spacing:.07em; text-transform:uppercase; color:var(--muted); }
.mcs-rcount { margin:0 0 8px; font-size:12px; color:var(--muted); font-weight:600; }
/* the tiles: three across on a phone, as in Phase 6's library; on a wider
   screen a fixed card size, never stretched to fill (P6-3.1) */
.mcs-ogrid { list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(3, minmax(0, 1fr));
  gap:14px 10px; }
.mcs-otile { display:flex; flex-direction:column; min-width:0; }
.mcs-otap { display:block; width:100%; border:0; background:none; padding:0; text-align:left; }
button.mcs-otap { cursor:pointer; }
.mcs-otile-art { display:flex; align-items:center; justify-content:center; aspect-ratio:63/88; width:100%;
  border-radius:8px; overflow:hidden; background:var(--line-soft); box-shadow:0 1px 2px rgba(10,16,20,.08); }
.mcs-otile-art img { width:100%; height:100%; object-fit:cover; }
.mcs-ometa { display:flex; flex-direction:column; gap:2px; margin-top:6px; min-width:0; }
.mcs-oname { font-size:12.5px; font-weight:600; line-height:1.25; color:var(--text);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mcs-onum { font-weight:400; color:var(--muted); }
.mcs-ostate { display:flex; flex-wrap:wrap; align-items:center; gap:2px 6px; font-size:11px; line-height:1.35; }
.mcs-oqual { font-size:11px; color:var(--text); }
.mcs-mk { display:inline-block; font-size:9.5px; font-weight:600; padding:0 6px; border-radius:999px;
  border:1px solid currentColor; background:#FFF; }
.mcs-mk-primary { color:var(--t1); } .mcs-mk-secondary { color:#3E6B8A; } .mcs-mk-pc { color:#5B4B8A; }
.mcs-mk-trade { color:var(--amber); } .mcs-mk-owned, .mcs-mk-goal { color:var(--muted); }
.mcs-mk-earlier { color:var(--faint); border-style:dashed; }
.mcs-ohome { color:var(--text); font-weight:600; } .mcs-ohome.unf { color:var(--muted); font-weight:500; }
.mcs-oq { font-size:10.5px; line-height:1.3; color:var(--faint); overflow:hidden; text-overflow:ellipsis;
  white-space:nowrap; }
/* THE CARD SHEET (P6-4) — mobile first: thumb-sized choices, the card on
   top, one column, nothing technical until asked for. */
.mcs-osheet { position:relative; max-height:92vh; gap:14px; padding-top:12px; }
.mcs-x { position:absolute; top:8px; right:8px; width:44px; height:44px; border:0; border-radius:999px;
  background:var(--line-soft); color:var(--text); font-size:16px; }
.mcs-ohero { display:flex; justify-content:center; padding-top:6px; }
.mcs-ohero-art { width:96px; aspect-ratio:63/88; display:flex; align-items:center; justify-content:center;
  border-radius:10px; overflow:hidden; background:var(--line-soft); box-shadow:0 8px 22px rgba(10,16,20,.14); }
.mcs-ohero-art img { width:100%; height:100%; object-fit:cover; }
.mcs-oident { text-align:center; }
.mcs-oident h2 { margin:0; font-family:var(--font-display); font-size:21px; }
.mcs-oident p { margin:3px 0 0; color:var(--muted); font-size:13px; }
.mcs-osect { display:flex; flex-direction:column; gap:8px; border-top:1px solid var(--line-soft); padding-top:12px; }
.mcs-osect h3 { margin:0; font-size:12px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); }
.mcs-opair { display:flex; flex-direction:column; gap:5px; }
.mcs-opair-t { font-size:12px; color:var(--faint); }
.mcs-states { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.mcs-state { min-height:56px; display:flex; flex-direction:column; align-items:flex-start; justify-content:center;
  gap:2px; text-align:left; padding:8px 12px; border:1.5px solid var(--line); border-radius:12px; background:#FFF;
  color:var(--text); }
.mcs-state b { font-size:15px; } .mcs-state span { font-size:12px; color:var(--muted); }
.mcs-state.on { border-color:var(--t1); background:var(--t1-bg); }
.mcs-state.on b { color:var(--t1); }
.mcs-state.saving { border-style:dashed; border-color:var(--t1); }
.mcs-state.across { background:transparent; border-style:dashed; opacity:.62; }
.mcs-state.justset { box-shadow:0 0 0 3px rgba(23,102,110,.18); }
.mcs-stateack { margin:0; min-height:18px; font-size:13px; color:var(--t1); font-weight:600; }
.mcs-across { background:var(--line-soft); border-radius:12px; padding:10px 12px; font-size:13px; }
.mcs-across p { margin:0 0 8px; }
.mcs-oconfig { margin:0; display:flex; gap:8px; align-items:baseline; font-size:14px; }
.mcs-oconfig span { color:var(--muted); font-size:12.5px; }
.mcs-onote { margin:0; font-size:12.5px; }
.mcs-ohome { margin:0; font-size:15px; font-weight:600; }
.mcs-oacts { margin:0; display:flex; flex-wrap:wrap; gap:8px; }
.mcs-oacts .mcs-go, .mcs-ochoice { min-height:44px; }
.mcs-omove { display:flex; flex-direction:column; gap:6px; }
.mcs-omove p { margin:0; font-size:12.5px; }
.mcs-ochoice { text-align:left; padding:10px 14px; border:1px solid var(--line); border-radius:12px; background:#FFF;
  font-size:15px; font-weight:600; color:var(--text); }
.mcs-omore { align-self:flex-start; border:0; background:none; padding:6px 0; font-weight:600; color:var(--t1); font-size:14px; }
.mcs-omore::before { content:"▸ "; } .mcs-omore[aria-expanded="true"]::before { content:"▾ "; }
.mcs-ofull { align-self:flex-start; min-height:44px; }
/* the confirmation bar: above the tab bar, above an open sheet, below a
   filing in progress; only the bar itself takes touches */
.mcs-snack-wrap { position:fixed; left:0; right:0; z-index:45; pointer-events:none; display:flex; justify-content:center;
  padding:0 12px; bottom:calc(var(--tabbar-h) + 10px + env(safe-area-inset-bottom, 0px)); }
.mcs-snack { pointer-events:auto; margin:0; display:flex; align-items:center; gap:12px; width:100%; max-width:480px;
  background:var(--text); color:#FFF; border:0; border-radius:12px; padding:10px 8px 10px 14px; font-size:13.5px;
  box-shadow:0 10px 26px rgba(10,16,20,.28); }
.mcs-snack span { flex:1 1 auto; min-width:0; }
.mcs-snack.mcs-toast { background:var(--text); color:#FFF; border:0; }
.mcs-snack.warn { background:#5A3A06; color:#FFF; }
.mcs-undo, .mcs-snack-x { flex:0 0 auto; min-height:40px; min-width:44px; border:0; border-radius:10px; background:rgba(255,255,255,.14);
  color:#FFF; font-weight:700; padding:0 12px; }
.mcs-undo:disabled { opacity:.5; }
/* Details, as a sheet (P6-3.1) */
.mcs-detail-head { display:flex; gap:12px; align-items:flex-start; }
.mcs-detail-art { flex:0 0 84px; width:84px; aspect-ratio:63/88; display:flex; align-items:center; justify-content:center;
  border-radius:8px; overflow:hidden; background:var(--line-soft); }
.mcs-detail-art img { width:100%; height:100%; object-fit:cover; }
.mcs-detail-id { display:flex; flex-direction:column; gap:3px; min-width:0; }
.mcs-detail-id strong { font-size:16px; }
.mcs-detail-facts { display:flex; flex-direction:column; gap:6px; }
/* an opened binder: back, its name, add, and one quiet menu */
.mcs-bview-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:4px 0 6px; }
.mcs-bview-head .mcs-binder-name { padding:0; margin:0; flex:1 1 auto; min-width:0; }
.mcs-back { font-weight:600; text-decoration:none; }
.mcs-more { border:0; background:none; color:var(--muted); font-size:16px; letter-spacing:1px; padding:0 2px; }
.mcs-menu { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 10px; }
.mcs-ostatus { font-size:10.5px; font-weight:600; color:var(--t1); }
.mcs-oconflict { font-size:10.5px; color:var(--amber); }
.mcs-oview { align-self:flex-start; font-size:11px; padding:0; }
.mcs-ofacts { display:flex; flex-direction:column; gap:2px; margin-top:4px; padding:6px 8px; border-radius:8px;
  background:#FFF; border:1px solid var(--line); }
.mcs-ofacts .mcs-fact { font-size:11px; }
/* ---- filing (P6-3): pick a card up, put it where it belongs ---- */
.mcs-otap.holdable { -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
.mcs-otap.holdable img { -webkit-user-drag:none; pointer-events:none; }
.mcs-otile.lifted { opacity:.28; }
.mcs-otile.filing { opacity:.6; }
.mcs-otile.landed .mcs-otile-art { animation:mcs-landed 1.2s ease-out; }
@keyframes mcs-landed { 0% { transform:scale(1.06); box-shadow:0 0 0 3px var(--t1); } 100% { transform:none; } }
.mcs-filing { position:fixed; inset:0; z-index:60; background:rgba(245,247,249,.95); display:flex;
  flex-direction:column; padding:14px 16px calc(16px + env(safe-area-inset-bottom, 0px)); touch-action:none;
  -webkit-user-select:none; user-select:none; }
.mcs-fhead { margin-bottom:10px; } .mcs-fhead b { display:block; font-size:16px; }
.mcs-fhead span { color:var(--muted); font-size:12px; }
.mcs-dests { display:flex; flex-direction:column; gap:8px; overflow:auto; flex:1; max-width:520px; width:100%; margin:0 auto; }
.mcs-dest { border:1.5px solid var(--line); background:#FFF; border-radius:14px; padding:14px; min-height:52px;
  display:flex; flex-direction:column; justify-content:center; cursor:pointer;
  transition:background .08s, border-color .08s, transform .08s; }
.mcs-dest b { font-size:15px; } .mcs-dest span { font-size:11.5px; color:var(--faint); }
.mcs-dest.over { border-color:var(--t1); background:var(--t1-bg); transform:scale(1.015); }
.mcs-dest.off { opacity:.45; border-style:dashed; cursor:default; }
.mcs-dest.cancel { margin-top:auto; text-align:center; align-items:center; background:#F4F6F8; }
.mcs-dest.cancel.over { background:#E9EDF1; border-color:var(--muted); }
.mcs-ghost { position:fixed; width:92px; transform:translate(-50%,-60%) rotate(-3deg) scale(1.04); pointer-events:none;
  z-index:61; filter:drop-shadow(0 12px 18px rgba(10,16,20,.35)); }
.mcs-undo { margin-left:8px; font-weight:600; }
.mcs-ohomeset { margin-top:4px; } .mcs-ohomeset select { font-size:13px; padding:6px 8px; }
.mcs-viewmode { padding:0; margin:0 0 10px; }
.mcs-bsum { margin:0 0 10px; font-size:12.5px; color:var(--muted); } .mcs-bsum b { color:var(--text); font-size:15px; }

@media (min-width:600px) {
  .mcs-br-grid { grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); }
  .mcs-ogrid { grid-template-columns:repeat(auto-fill, minmax(132px, 152px)); gap:18px 14px; justify-content:start; }
  .mcs-osheet { border-radius:var(--r-sheet); margin-bottom:24px; max-height:86vh; }
  .mcs-ohero-art { width:132px; }
}

/* a wide screen: the same four down the side, light */
@media (min-width:860px) {
  .mcs-nav { background:var(--panel); border-top:0; border-right:1px solid var(--line);
    box-shadow:none; padding:14px 10px; }
  .mcs-i { min-height:0; color:var(--muted); box-shadow:none; justify-content:flex-start; padding:10px 12px; }
  .mcs-i .l { font-size:13.5px; text-align:left; }
  .mcs-i .c { display:inline-block; }
  .mcs-i:hover { background:var(--line-soft); }
  .mcs-i.on { color:var(--t1); background:var(--t1-bg); box-shadow:none; }
  .mcs-main { padding:0 28px 40px; }
  /* The sidebar on the left, where the Trusted Partner's is: the earlier
     row-reverse put the Collector's on the right. */
  .mcs-body { flex-direction:row; }
  .mcs-hd { margin:0 -28px; padding:22px 28px 6px; }
  /* the account bar and banner are on screen here (P6-F1): no phone controls */
  .mcs .mcs-acct, .mcs .mcs-scope { display:none; }   /* .mcs: outranks the base rules, which come later */
  /* no tab bar here: the confirmation sits at the foot of the window */
  .mcs-snack-wrap { bottom:20px; justify-content:flex-start; padding-left:264px; }
  /* clear of the card sheet, which opens as a panel on the right here */
  .mcs-snack { max-width:min(480px, max(280px, calc(100vw - 760px))); }
  .mcs-ro, .mcs-joined { margin:12px 28px 0; }
  .mcs-sheet-scrim { align-items:stretch; justify-content:flex-end; }
  .mcs-spec-panel, .mcs-sheet { border-radius:0; border-left:1px solid var(--line); width:min(460px,100%);
    max-height:100vh; padding:16px; box-shadow:-10px 0 30px rgba(10,16,20,.10); }
  .mcs-spec-panel::before, .mcs-sheet::before { display:none; }
}


/* ============================================================================
   P6-F1 — THE PHASE 6 PHONE, RESTORED (fidelity recovery)
   Reference: the frozen prototype (fca2c61) index.html. Values below are the
   prototype's own, named where they come from; production-only needs (four
   tabs, 16px search text) are recorded in docs/PHASE6_APPROVED_DEVIATIONS.md.
   ========================================================================== */
/* the no-picture card, ported from the prototype's .art (every width). Named
   mcs-cardph: .mcs-ph is the shell's PANEL HEAD (parts.jsx), and sharing the
   name turned every panel head into a card (found in review, fixed before P6-F2). */
.mcs .mcs-cardph { --h:200; --h2:180; position:relative; display:flex; flex-direction:column; align-items:stretch;
  justify-content:flex-start; aspect-ratio:63/88; border-radius:9px; overflow:hidden; padding:6%;
  background:linear-gradient(160deg,hsl(var(--h) 55% 62%),hsl(var(--h2) 50% 45%));
  box-shadow:0 1px 2px rgba(0,0,0,.18), inset 0 0 0 3px hsl(48 70% 72%); color:#0B1620; font-size:13px; line-height:1.2; }
.mcs-cardph-top { display:flex; justify-content:space-between; gap:4px; font-size:.8em; min-width:0; }
.mcs-cardph-top b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mcs-cardph-window { flex:1; margin:6% 0; border-radius:4px; display:flex; align-items:center; justify-content:center;
  background:radial-gradient(circle at 50% 35%,hsl(var(--h2) 70% 88%),hsl(var(--h) 45% 70%)); box-shadow:inset 0 0 0 2px rgba(0,0,0,.12); }
.mcs-cardph-pose { width:86%; } .mcs-cardph-pose .body { fill:hsl(var(--h) 70% 52%); } .mcs-cardph-pose .fin { fill:hsl(var(--h) 75% 40%); }
.mcs-cardph-pose .eye { fill:#0B1620; } .mcs-cardph-pose .cheek { fill:hsl(28 90% 60%); } .mcs-cardph-pose .shadow { fill:rgba(0,0,0,.15); }
.mcs-cardph-pose.p1 { transform:scaleX(-1); } .mcs-cardph-pose.p2 { transform:rotate(-8deg); } .mcs-cardph-pose.p3 { transform:scale(.8) translateY(6px); }
.mcs-cardph-pose.p4 { transform:scaleX(-1) rotate(6deg); }
.mcs-cardph-foot { display:flex; justify-content:space-between; gap:4px; font-size:.68em; opacity:.85; min-width:0; }
.mcs-cardph-foot span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mcs-cardph-none { position:absolute; left:8%; right:8%; bottom:16%; text-align:center; font-size:.62em; color:rgba(11,22,32,.65);
  background:rgba(255,255,255,.6); border-radius:4px; padding:1px 0; }
/* the card sheet's picture is still P6-4's 96px (its rebuild is P6-F2): the
   placeholder's type scales to it rather than overflowing */
.mcs .mcs-ohero-art.mcs-cardph { font-size:11.5px; padding:6px; }  /* 6% of its own 96px: a % pads by the PARENT's width */

/* the account button and sheet; the one-line notice (phone only, see below) */
.mcs-acct { flex:0 0 auto; width:44px; height:44px; margin:-8px -8px -8px 0; border:0; background:none; padding:6px;
  display:inline-flex; align-items:center; justify-content:center; align-self:center; }
.mcs-acct span { width:30px; height:30px; border-radius:999px; background:var(--t1-bg); color:var(--t1);
  font-weight:700; font-size:13px; display:inline-flex; align-items:center; justify-content:center; }
.mcs-acct-sheet { gap:14px; }
.mcs-acct-who { display:flex; align-items:center; gap:12px; }
.mcs-acct-who > span:last-child { display:flex; flex-direction:column; }
.mcs-acct-big { width:44px; height:44px; border-radius:999px; background:var(--t1-bg); color:var(--t1); font-weight:700;
  font-size:18px; display:inline-flex; align-items:center; justify-content:center; }
.mcs-acct-scope { display:flex; flex-direction:column; gap:6px; font-size:13px; color:var(--text); }
.mcs-acct-scope .dim { color:var(--muted); }
.mcs-scope { margin:0 0 10px; font-size:12px; color:var(--muted); }

@media (max-width:859px) {
  /* the phone panel is white (prototype .phone); #EEF1F4 was its STAGE */
  .mcs { --bg:#FFF; --tabbar-h:47px; }
  /* no account bar and no banner on the phone: the account button and the
     one-line notice carry them */
  .mcs-top, .mcs-ro { display:none; }
  /* the screen title (prototype .hd: 22px, 18px above, 10px below) */
  .mcs-hd { padding:14px 16px 8px; align-items:center; }
  .mcs-at-browse > .mcs-sub, .mcs-at-binder > .mcs-sub { display:none; }
  /* search and filters (prototype .library .narrow / .lenses / .filters) */
  .mcs-bcontrols { top:52px; padding:0 16px; }
  .mcs-bcontrols .mcs-find { margin:0 0 8px; }
  .mcs-bcontrols .mcs-in { background:#F7F9FA; border:1px solid var(--line); border-radius:12px; padding:5px 11px; }
  .mcs-lenses { margin:0; padding:0 0 8px; gap:6px; }
  .mcs-lenses .mcs-view { padding:5px 10px; font-size:12px; }
  /* the disclosures (prototype .sechead / .unfhead / .unfiled) */
  .mcs-bsection { margin-top:0; }
  .mcs-unfiled { margin-top:8px; }
  .mcs-bsection.mcs-results { margin-top:14px; }
  .mcs-sechead { padding:4px 0 10px 18px; font-family:inherit; font-size:11px; font-weight:600; letter-spacing:.06em; }
  .mcs-sechead::before { top:2px; }
  .mcs-rhead { font-family:inherit; font-size:11px; letter-spacing:.06em; }
  /* the grid (prototype .library .grid, .otile) */
  .mcs-ogrid { gap:10px 8px; }
  .mcs-otile { padding:4px; }
  /* the tab bar (prototype .tabbar: 12px / 14px, labels on one line) — four
     tabs, each as wide as its label needs, the rest shared */
  .mcs-i { flex:1 1 auto; min-height:0; padding:12px 4px 14px; }
  .mcs-i .l { font-size:13px; line-height:20px; white-space:nowrap; }
}

/* ============================================================================
   P6-F2 — BROWSE, FROM THE PROTOTYPE (fca2c61 index.html: .narrow.unified,
   .chips, .suggestions, .tabs, .gens/.filters, .tiles, .rows/.rowbtn/.fan,
   .grid/.cell/.cap, .markers, .more, .empty). Values are the prototype's; the
   search text is 16px (register B3: iPhone Safari zooms below 16px).
   ========================================================================== */
/* the account button sits at the right edge whether or not a count is there */
.mcs-hd .mcs-acct { margin-left:auto; }
.mcs-hd .mcs-hd-count + .mcs-acct { margin-left:0; }

.mcs-browse { max-width:1040px; }
.mcs-dsearch { position:relative; margin:4px 0 12px; }
.mcs-dsearch-in { width:100%; box-sizing:border-box; padding:11px 34px 11px 14px; border:1px solid var(--t1); border-radius:12px;
  background:#FFF; font-size:16px; color:var(--text); font-family:inherit; }
.mcs-dclear { position:absolute; right:6px; top:50%; transform:translateY(-50%); border:0; background:none; font-size:18px;
  color:var(--muted); width:36px; height:36px; }
.mcs-dchips { display:flex; flex-wrap:wrap; gap:6px; margin:-4px 0 12px; }
.mcs-dchip { border:1px solid var(--t1); background:var(--t1-bg); color:var(--t1); border-radius:999px; padding:5px 10px;
  font-size:12.5px; font-weight:600; }
.mcs-dchip.clearall { border-color:var(--line); background:#FFF; color:var(--muted); font-weight:500; }
.mcs-dsugg { list-style:none; margin:-4px 0 12px; padding:0; border:1px solid var(--line); border-radius:12px; overflow:hidden; }
.mcs-dsugg li + li { border-top:1px solid var(--line-soft); }
.mcs-dsugg button { width:100%; text-align:left; border:0; background:#FFF; padding:9px 12px; display:flex; gap:6px; align-items:baseline;
  color:var(--text); font-size:14px; }
.mcs-dsugg .sk { color:var(--faint); font-size:11.5px; width:52px; flex:none; }
.mcs-dsugg .sn { margin-left:auto; color:var(--faint); font-size:11.5px; white-space:nowrap; }
.mcs-dtabs { display:flex; gap:6px; margin-bottom:14px; }
.mcs-dtabs button { flex:1; padding:9px 0; border:1px solid var(--line); border-radius:999px; background:#FFF; font-weight:600;
  color:var(--muted); font-size:14px; }
.mcs-dtabs button.on { background:var(--text); color:#FFF; border-color:var(--text); }
.mcs-dgens { display:flex; gap:6px; overflow-x:auto; padding:2px 0 10px; margin:-2px 0 10px; scrollbar-width:none; }
.mcs-dgens::-webkit-scrollbar { display:none; }
.mcs-dgens button { white-space:nowrap; padding:6px 11px; border-radius:999px; border:1px solid var(--line); background:#FFF;
  font-size:12.5px; font-weight:600; color:var(--muted); }
.mcs-dgens button.on { background:var(--text); color:#FFF; border-color:var(--text); }
.mcs-dtiles { list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px; }
.mcs-dtile { border:0; background:none; padding:0; text-align:left; width:100%; color:var(--text); }
.mcs-dtile b { display:block; margin-top:6px; font-size:15px; }
.mcs-dtile > span:last-child { color:var(--faint); font-size:12px; }
.mcs-dtile-art, .mcs-dcell-art { display:flex; align-items:center; justify-content:center; aspect-ratio:63/88; width:100%;
  border-radius:9px; overflow:hidden; background:var(--line-soft); }
.mcs-dtile-art img, .mcs-dcell-art img { width:100%; height:100%; object-fit:cover; }
.mcs-drows { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:10px; }
.mcs-drow { display:flex; gap:14px; align-items:center; width:100%; text-align:left; border:1px solid var(--line); background:#FFF;
  border-radius:14px; padding:10px; color:var(--text); }
.mcs-drow-t { display:flex; flex-direction:column; min-width:0; }
.mcs-drow-t b { font-size:15px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mcs-drow-t span { color:var(--faint); font-size:12px; }
.mcs-dfan { display:flex; flex:0 0 auto; }
.mcs-dfan-art { width:56px; flex:0 0 56px; margin-right:-26px; aspect-ratio:63/88; display:flex; border-radius:6px; overflow:hidden; }
.mcs-dfan-art:last-child { margin-right:0; }
.mcs .mcs-dfan-art.mcs-cardph { padding:3px; border-radius:6px; }
.mcs-dfan .mcs-cardph-top, .mcs-dfan .mcs-cardph-foot, .mcs-dfan .mcs-cardph-none { display:none; }
.mcs-dgrid { list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px 12px; }
.mcs-dcell { border:0; background:none; padding:0; text-align:left; width:100%; border-radius:12px; color:var(--text); }
.mcs-dcell.on { outline:2px solid var(--t1); outline-offset:3px; }
.mcs-dcap { display:flex; justify-content:space-between; gap:6px; color:var(--faint); font-size:11.5px; margin-top:5px; }
.mcs-dcap span:first-child { min-width:0; }   /* wraps, as the prototype's caption does */
.mcs-dcap span:last-child { white-space:nowrap; }
.mcs-dmarks { display:flex; flex-wrap:wrap; gap:4px; margin-top:5px; }
.mcs-dmarks .mcs-mk { font-size:10.5px; }
.mcs-dmore { display:block; width:100%; border:0; background:none; text-align:center; color:var(--faint); font-size:12px; margin:14px 0; min-height:44px; }
.mcs-dempty { color:var(--faint); font-size:12.5px; margin-top:18px; text-align:center; }
@media (min-width:600px) {
  .mcs-dtiles, .mcs-dgrid { grid-template-columns:repeat(auto-fill, minmax(150px, 180px)); justify-content:start; }
}
`;

/* THE NOTICE HAS TO BE TRUE, AND BATCH 7 CHANGED WHAT IS TRUE. Goals can now
   be set, changed and removed from here, so a blanket "read-only" would be a
   lie — and "Goals … arrive in a later release" doubly so. What is still
   read-only is everything else, and the notice says which. IT ONLY SAYS SO
   WHEN IT CAN: handed no callback, this shell can change nothing, and
   claiming otherwise would be the same lie in the other direction.
   ONE WORDING, THREE PLACES (P6-F1): the banner on a wide screen, the account
   sheet on a phone, and — shortened, never changed — the one-line note. */
function scopeNotice(onAddGoal, onOpenOffer) {
  return onAddGoal ? (
    <>
      <span>Your goals are yours to change — say what you&apos;re looking for and how hard.</span>
      <span className="dim">{onOpenOffer
        ? "Offers are yours to make and answer in Deal Flow. Everything else here is read-only for now: trades and messages arrive later."
        : "Everything else here is read-only for now: trades and messages arrive later."}</span>
    </>
  ) : (
    <>
      <span>Read-only for now — everything here is what MetYet holds for you.</span>
      <span className="dim">Goals, trades and messages arrive in a later release.</span>
    </>
  );
}
/* The phone's one line, for the screens it is true of. */
function scopeLine(sectionId, onAddGoal) {
  if (!onAddGoal) return "Read-only for now — everything here is what MetYet holds for you.";
  return sectionId === "deal-flow" || sectionId === "partners" ? "Trades and messages arrive later." : null;
}

export default function CollectorShell({ state, onSignOut, joined = null, onDismissJoined = null,
  onAddGoal = null, onSetPriority = null, onRemoveGoal = null, onBrowseCards = null,
  onSpecify = null, onCreateBinder = null, onRenameBinder = null,
  onInspect = null, onEndInspection = null, onRequestPhotos = null,
  onOpenOffer = null, onCounterOffer = null, onAcceptOffer = null, onWithdrawOffer = null,
  onRefresh = null,
  onArchiveBinder = null,
  /* WHERE A FILED THING GOES NEXT (Batch 3B-1). Bound at the entrance like
     every other command and handed down, so a section stays a surface that
     calls what it was given. */
  onFileObject = null, onUnfileObject = null }) {
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
  const [browseSession, setBrowseSession] = useState(newBrowseSession);
  /* How many cards Browse is showing, for the count beside its title (P6-F2,
     as the prototype puts it); null when it is showing the doorways. */
  const [browseCount, setBrowseCount] = useState(null);
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
  /* THE ACCOUNT, ON A PHONE (P6-F1). The Phase 6 phone has no account bar:
     the screen is the collection. Who is signed in, what this release can
     and cannot do, and Sign out move into one sheet behind a small button in
     the screen's own header — one tap away, never in the way. */
  const [accountOpen, setAccountOpen] = useState(false);
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
      {/* THE SAME PROMISE AS THE CONSENT SENTENCE, KEPT THE SAME (Phase 5 C5).
          This banner and the paragraph somebody read before accepting are two
          halves of one disclosure, and they had drifted together: both named a
          "Trade Binder", which C2 removed, and both implied that owning a card
          was enough to share it. What a partner actually receives is this
          Collector's Goals and the copies they have marked as offered — never a
          binder, and never a card kept back. */}
      {joined ? (
        <div className="mcs-joined" role="status">
          <span>You've joined <strong>{joined}</strong>'s Collector Network. They can see the
            goals you set, and any cards you choose to offer.</span>
          {onDismissJoined ? (
            <button className="mcs-joined-x" type="button" onClick={onDismissJoined}>Got it</button>
          ) : null}
        </div>
      ) : null}

      {/* The notice (see scopeNotice). On a phone it moves to the account
          sheet and, where it applies, one line under the screen title. */}
      <div className="mcs-ro" role="note">{scopeNotice(onAddGoal, onOpenOffer)}</div>

      {accountOpen ? (
        <div className="mcs-sheet-scrim" role="dialog" aria-modal="true" aria-label="Account"
          onClick={(e) => { if (e.target === e.currentTarget) setAccountOpen(false); }}
          onKeyDown={(e) => { if (e.key === "Escape") setAccountOpen(false); }}>
          <div className="mcs-sheet mcs-acct-sheet">
            <div className="mcs-acct-who">
              <span className="mcs-acct-big" aria-hidden="true">{(who.name || "?").trim().charAt(0).toUpperCase()}</span>
              <span><strong>{who.name || "Your account"}</strong><span className="mcs-dim">Collector</span></span>
            </div>
            <div className="mcs-acct-scope" role="note">
              <strong>What works today</strong>
              {scopeNotice(onAddGoal, onOpenOffer)}
            </div>
            <p className="mcs-goal-do">
              <button className="mcs-go" type="button" onClick={onSignOut}>Sign out</button>
              <button className="mcs-go quiet" type="button" autoFocus onClick={() => setAccountOpen(false)}>Close</button>
            </p>
          </div>
        </div>
      ) : null}

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
        <main className={`mcs-main mcs-at-${meta.id}`} key={section}>
          {/* THE SCREEN'S OWN HEADER (Phase 6 P6-1). The title stays in view
              while the screen scrolls, as in the Phase 6 prototype; the line
              under it scrolls away with the content it introduces. */}
          <header className="mcs-hd">
            <h1 className="mcs-h disp">{meta.title}</h1>
            {/* The same row count the tab carries, in words (Phase 6 puts it
                here, beside the title, and keeps the phone's tab bar to labels). */}
            {meta.count && meta.unit ? (
              <span className="mcs-hd-count">
                {`${counts[meta.id]} ${counts[meta.id] === 1 ? meta.unit[0] : meta.unit[1]}`}
              </span>
            ) : meta.id === "browse" && browseCount != null ? (
              <span className="mcs-hd-count">{`${browseCount.toLocaleString()} ${browseCount === 1 ? "card" : "cards"}`}</span>
            ) : null}
            <button type="button" className="mcs-acct" aria-haspopup="dialog"
              aria-label={`Account: ${who.name || "Your account"}`} onClick={() => setAccountOpen(true)}>
              <span aria-hidden="true">{(who.name || "?").trim().charAt(0).toUpperCase()}</span>
            </button>
          </header>
          <p className="mcs-sub">{meta.sub}</p>
          {/* WHAT DOES NOT WORK YET, SAID WHERE IT MATTERS (P6-F1). On a phone
              the full notice lives in the account sheet; a screen whose
              features are limited says so in one line. Binders and Browse
              need none when Goals can be changed — everything there works. */}
          {scopeLine(meta.id, onAddGoal) ? (
            <p className="mcs-scope">{scopeLine(meta.id, onAddGoal)}{" "}
              <button type="button" className="mcs-linkish" onClick={() => setAccountOpen(true)}>What works today</button></p>
          ) : null}
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
              ? { onSpecify, onBrowseCards, session: browseSession, onSession: setBrowseSession, onCount: setBrowseCount,
                fillingBinder, onDoneFilling: () => setFillingBinder(null) }
              : meta.id === "binder"
                  ? { onSpecify, onBrowseCards, onCreateBinder, onRenameBinder,
                    onArchiveBinder, fillingBinder, onFileObject, onUnfileObject, onRefresh,
                    onAddCards: (into) => { setFillingBinder(into); setSection("browse"); } }
                  : meta.id === "partners"
                    /* Trusted Partners asks the catalog what the cards a shop
                       has for you are called, and takes nothing else (Phase 5
                       C3.5). ONE read prop and no command: this screen answers
                       a question and offers no way to act on the answer. */
                    ? { onBrowseCards }
                    : meta.id === "deal-flow"
                      /* AND THE QUALIFICATION COMMANDS (this batch). Deal Flow
                         was handed no command while Inspect and Request Photos
                         were unexposed, because a control that cannot work is a
                         promise the product has not kept. They work now, so it
                         gets exactly those three and no more: Agree Market
                         Value, Pending and everything downstream of them are
                         still real domain commands with no surface, and this
                         screen still stops at the line before a transaction. */
                      ? { onBrowseCards, onInspect, onEndInspection, onRequestPhotos,
                        onOpenOffer, onCounterOffer, onAcceptOffer, onWithdrawOffer, onRefresh }
                      : {})} />
        </main>
      </div>
    </div>
  );
}
