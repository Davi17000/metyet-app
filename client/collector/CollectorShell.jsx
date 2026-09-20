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
     Trade Binder     what you could trade. Supply, not a workflow.
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
   opening a binder copy, looking at a Trusted Partner's profile all belong to
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
import Goals from "./sections/Goals.jsx";
import TradeBinder from "./sections/TradeBinder.jsx";
import TrustedPartners from "./sections/TrustedPartners.jsx";

/* What the Collector can actually open, in the product's own order and words.
   `count` names the collection whose ROWS are counted: each is a plain count of
   something the server already scoped to this Collector, and none of them is a
   rule. */
export const SECTIONS = Object.freeze([
  { id: "goals", label: "Goals", count: "goals", view: Goals,
    title: "Goals",
    sub: "What you're looking for, and what your Trusted Partners work from" },
  { id: "partners", label: "Trusted Partners", count: "partners", view: TrustedPartners,
    title: "Trusted Partners",
    sub: "The shops you deal with" },
]);

/* BUILT, AND NOT YET TRUE (Phase 5 Batch 8.1).

   The Trade Binder shipped as a destination before it shipped as a feature. Its
   section renders, its nav counts rows, and the collection it reads can never
   have any: the only command that writes a binder copy needs a row in the
   legacy catalogue, and production's legacy catalogue is empty and is meant to
   stay that way. So every Collector had a tab that promised something, opened,
   and was permanently empty — which is a worse answer than not offering it.

   It is kept here rather than deleted because none of it is wrong: the section
   component, the domain commands, the table and the projection are all ready
   for the batch that makes a Binder real. That batch moves this entry back up
   into SECTIONS, and does nothing else here.

   A person cannot reach it: it is not in the navigation, and `section` is only
   ever set from a SECTIONS id. */
export const DEFERRED_SECTIONS = Object.freeze([
  { id: "binder", label: "Trade Binder", count: "binder", view: TradeBinder,
    title: "Trade Binder",
    sub: "What you could put into a trade" },
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
  onAddGoal = null, onSetPriority = null, onRemoveGoal = null, onBrowseCards = null }) {
  /* JUST ACCEPTED? OPEN ON THE THING THAT CHANGED (Phase 5 Batch 3A). A person
     who has this second finished joining a shop's network; the section that now
     holds that shop is what they came for. Everyone else opens where they
     always did. */
  const [section, setSection] = useState(joined ? "partners" : SECTIONS[0].id);

  const who = describeActor(state);
  /* Row counts of collections the SERVER scoped to this Collector. Nothing
     here decides what any of them mean — which is why there is no
     opportunities count: "active" is a judgement, and it is the server's. */
  const counts = {};
  for (const s of SECTIONS) counts[s.id] = rows(state && state[s.count]).length;

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
              <span className="c">{counts[s.id]}</span>
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
          <View state={state} {...(meta.id === "goals"
            ? { onAddGoal, onSetPriority, onRemoveGoal, onBrowseCards } : {})} />
        </main>
      </div>
    </div>
  );
}
