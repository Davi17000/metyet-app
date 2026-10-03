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
import { EMPTY_SESSION } from "../browse/CardBrowser.jsx";
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
  { id: "binder", label: "Binders", count: "binders", view: Binder,
    title: "Binders",
    sub: "Your collection, and where each card belongs" },
  { id: "partners", label: "Trusted Partners", count: "partners", view: TrustedPartners,
    title: "Trusted Partners",
    sub: "The shops you deal with" },
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

     AND IT IS FOUR TABS. Browse, Binders, Trusted Partners, Deal Flow — the
     approved navigation, now actually true. Deal Flow arrived while Your Cards
     was still a tab of its own, because deleting Your Cards before Binders
     could hold what it did would have taken away the only way to see what you
     own to make a navigation diagram true early. Binders can hold it now: the
     cross-Binder views are real, Your Cards is a component they compose, and
     the fifth tab is gone rather than deferred. */
  { id: "deal-flow", label: "Deal Flow", count: null, view: DealFlow,
    title: "Deal Flow",
    sub: "Which of your shops has the card you asked for" },
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
.mcs-binder-name { margin:0 0 10px; padding:0 16px; font-family:'Archivo', system-ui, sans-serif;
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
  onInspect = null, onEndInspection = null, onRequestPhotos = null,
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
              : meta.id === "binder"
                  ? { onSpecify, onBrowseCards, onCreateBinder, onRenameBinder,
                    onArchiveBinder, fillingBinder, onFileObject, onUnfileObject,
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
                      ? { onBrowseCards, onInspect, onEndInspection, onRequestPhotos }
                      : {})} />
        </main>
      </div>
    </div>
  );
}
