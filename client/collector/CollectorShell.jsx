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

/* Only arrays, only truthy rows. A projection missing a collection entirely —
   an older server, a narrowed projection — is an ordinary case, not a crash. */
const rows = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

/* The Collector's three, in the product's own order and words. `count` names
   the collection whose ROWS are counted: each is a plain count of something
   the server already scoped to this Collector, and none of them is a rule. */
export const SECTIONS = Object.freeze([
  { id: "goals", label: "Goals", count: "goals",
    title: "Goals",
    sub: "What you're looking for, and what your Trusted Partners work from",
    one: "goal", many: "goals",
    what: "A goal is a card you want. Your Trusted Partners see your goals and bring you copies — "
      + "it is the only way a deal starts in MetYet.",
    empty: "You haven't set any goals yet. A goal is how you tell your Trusted Partners what to look for." },
  { id: "binder", label: "Trade Binder", count: "binder",
    title: "Trade Binder",
    sub: "What you could put into a trade",
    one: "card", many: "cards",
    what: "Your Trade Binder is what you are willing to trade. Trusted Partners can register interest "
      + "in a copy, and it can go into a deal on one of your goals.",
    empty: "Your Trade Binder is empty. Cards you add here are what you can offer in a trade." },
  { id: "partners", label: "Trusted Partners", count: "partners",
    title: "Trusted Partners",
    sub: "The shops you deal with",
    one: "Trusted Partner", many: "Trusted Partners",
    what: "A Trusted Partner is a shop you have a relationship with. They see your goals and your "
      + "Trade Binder; nobody else does.",
    empty: "You have no Trusted Partners yet. A partner invites you, and the relationship starts when "
      + "you accept." },
]);

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

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

.mcs-body { flex:1; display:flex; min-width:0; }
.mcs-main { flex:1; min-width:0; padding:18px 16px 92px; }
.mcs-h { font-family:'Archivo'; font-size:20px; font-weight:700; letter-spacing:-.02em; margin:0; }
.mcs-sub { color:var(--muted); font-size:13.5px; margin-top:2px; }

.mcs-card { background:var(--panel); border:1px solid var(--line); border-radius:12px;
  padding:20px 18px; margin-top:16px; max-width:620px; }
.mcs-n { font-family:'Archivo'; font-size:34px; font-weight:700; letter-spacing:-.03em;
  line-height:1.05; color:var(--t1); }
.mcs-n-l { color:var(--muted); font-size:13.5px; margin-top:2px; }
.mcs-what { color:var(--muted); margin-top:14px; max-width:58ch; }
.mcs-soon { margin-top:14px; padding-top:13px; border-top:1px solid var(--line-soft);
  color:var(--faint); font-size:13px; max-width:58ch; }

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

/* One section body: the count, what the section IS, and what is not here yet.
   Deliberately this and no more — reading a goal or a binder copy is the next
   batch, and a placeholder that pretended otherwise would be worse than one
   that says so. */
function Section({ meta, count }) {
  return (
    <>
      <h1 className="mcs-h disp">{meta.title}</h1>
      <p className="mcs-sub">{meta.sub}</p>
      <section className="mcs-card">
        {count > 0 ? (
          <>
            <div className="mcs-n">{count}</div>
            <div className="mcs-n-l">{plural(count, meta.one, meta.many)}</div>
          </>
        ) : (
          <p>{meta.empty}</p>
        )}
        <p className="mcs-what">{meta.what}</p>
        <p className="mcs-soon">
          {count > 0
            ? `Opening ${meta.many === "goals" ? "a goal" : "this"} arrives in the next release. `
            : ""}
          Nothing here can be changed yet — this release shows you what MetYet holds for you.
        </p>
      </section>
    </>
  );
}

export default function CollectorShell({ state, onSignOut }) {
  const [section, setSection] = useState(SECTIONS[0].id);

  const who = describeActor(state);
  /* Row counts of collections the SERVER scoped to this Collector. Nothing
     here decides what any of them mean — which is why there is no
     opportunities count: "active" is a judgement, and it is the server's. */
  const counts = {};
  for (const s of SECTIONS) counts[s.id] = rows(state && state[s.count]).length;

  const meta = SECTIONS.find((s) => s.id === section) || SECTIONS[0];

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

      <div className="mcs-ro" role="note">
        <span>Read-only for now — everything here is what MetYet holds for you.</span>
        <span className="dim">Goals, trades and messages arrive in a later release.</span>
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
          <Section meta={meta} count={counts[meta.id]} />
        </main>
      </div>
    </div>
  );
}
