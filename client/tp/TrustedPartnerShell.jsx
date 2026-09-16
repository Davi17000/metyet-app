/* ============================================================================
   THE TRUSTED PARTNER PRODUCTION SHELL — PROJECTION IN, PIXELS OUT

     <TrustedPartnerShell state={projection} onSignOut={fn} />

   The first real Trusted Partner surface in production. Everything on it
   arrived in one `GET /api/view` response, and there is no second way for
   anything to get here: this file imports no store, no session, no api client,
   no domain, and calls no fetch. Hand it a projection and it renders; hand it
   nothing and it says so.

   THE INFORMATION ARCHITECTURE IS THE PRODUCT'S, NOT A NEW ONE. Three sections
   in the order the work actually flows — who you serve, what you hold, where
   the two meet — with the same titles and the same subtitles the prototype has
   carried since Phase 1. This is a different implementation of a settled
   product, not a redesign of it.

   WHAT IT DOES NOT DO, AND WHY EACH ONE MATTERS.

   It does not know who you are. `describeActor` reads the seat and the id the
   server sent; the shop's name is found by matching that id against the
   projection's own partner records. Nothing here can name a partner the server
   did not name.

   It does not compute a domain rule. A copy's status — available, committed,
   sold — is a canonical answer computed by the server and carried on the row.
   The shell reads `row.status`. It does not look at opportunities and work it
   out, because a second implementation of a rule is a second answer to it.
   Counting rows the server sent is not a rule; deciding what a row means is.

   It does not change anything. There is no command, no mutation, no optimistic
   edit, no local write of any kind. Every control that would change something
   is absent, and the screen says plainly that this release is read-only rather
   than offering a button that quietly does nothing.

   It does not assume data exists. A newly registered Trusted Partner has a name
   and nothing else — no collectors, no inventory, no opportunities, sometimes
   not even a catalog. Every list here handles nought rows as an ordinary case
   with a sentence, never as an error and never with invented sample content.
   ========================================================================== */

import React, { useMemo, useState } from "react";
import { describeActor } from "../actor.js";

/* The three sections, with the titles and subtitles the product already uses.
   Order is the prototype's: inputs before their consequences. */
export const SECTIONS = Object.freeze([
  { id: "collectors", label: "Collector Network", title: "Collector Network",
    sub: "Who you're serving, and what you know about them" },
  { id: "inventory", label: "Inventory", title: "Inventory",
    sub: "What you have and how it connects to collector demand" },
  { id: "opportunities", label: "Opportunities", title: "Opportunities",
    sub: "What you're actively coordinating, and what's waiting at each stage" },
]);

/* Canonical stage ids, rendered with the labels the product uses. These are
   presentation strings for values the SERVER decided; no order, no transition
   and no rule is expressed here, which is why a stage the client has never
   heard of falls through to its own id rather than to a guess. */
const STAGE_LABEL = Object.freeze({
  "agree-price": "Agree on Price",
  "select-trade": "Select Trade",
  "value-trade": "Value Trade",
  deal: "Deal",
  fulfillment: "Fulfillment",
  completed: "Completed",
});
const stageLabel = (stage) => STAGE_LABEL[stage] || (stage ? String(stage) : "—");

const COPY_STATUS = Object.freeze({
  available: "Available", committed: "Committed", sold: "Sold", unavailable: "Unavailable",
});

const rows = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
const money = (n) => (typeof n === "number" && Number.isFinite(n)
  ? "$" + Math.round(n).toLocaleString("en-US") : "—");
const day = (value) => (typeof value === "string" && value ? value.slice(0, 10) : "—");

const CSS = `
.tps { --sidebar:#0F131B; --sidebar-2:#1A2130; --sidebar-line:#232B3A; --bg:#F1F3F6;
  --panel:#FFF; --line:#DFE4EA; --line-soft:#EDF0F4; --text:#131922; --muted:#616B7A;
  --faint:#8B95A3; --t1:#0B5D66; --t1-bg:#E6F0F1; --amber:#9A6408; --amber-bg:#FBF3E3;
  --amber-line:#EBD9B4;
  font-family:'Public Sans',system-ui,sans-serif; color:var(--text); font-size:13px;
  line-height:1.45; display:flex; height:100vh; overflow:hidden; background:var(--bg);
  -webkit-font-smoothing:antialiased; }
.tps *,.tps *::before,.tps *::after { box-sizing:border-box; }
.tps button { font-family:inherit; font-size:inherit; cursor:pointer; }
.tps :focus-visible { outline:2px solid var(--t1); outline-offset:1px; }
.tps .mono { font-family:'IBM Plex Mono',ui-monospace,monospace; font-variant-numeric:tabular-nums; }
.tps .disp { font-family:'Archivo',system-ui,sans-serif; }

.tps-sb { width:228px; flex:0 0 228px; background:var(--sidebar); color:#C6CDD8;
  display:flex; flex-direction:column; border-right:1px solid var(--sidebar-line); }
.tps-brand { padding:18px; border-bottom:1px solid var(--sidebar-line); display:flex;
  align-items:center; gap:9px; }
.tps-mark { width:18px; height:18px; position:relative; flex:0 0 18px; }
.tps-mark i { position:absolute; width:11px; height:11px; border:1.5px solid #4E8C93; display:block; }
.tps-mark i:first-child { top:0; left:0; }
.tps-mark i:last-child { bottom:0; right:0; border-color:#E8EDF2; background:rgba(232,237,242,.08); }
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

.tps-main { flex:1; display:flex; flex-direction:column; min-width:0; }
.tps-top { background:#FFF; border-bottom:1px solid var(--line); padding:13px 22px; flex:0 0 auto; }
.tps-top h1 { font-family:'Archivo'; font-size:17px; font-weight:600; margin:0; letter-spacing:-.01em; }
.tps-top .sub { color:var(--muted); font-size:12.5px; margin-top:1px; }
.tps-ro { display:flex; gap:8px; align-items:baseline; background:var(--amber-bg);
  border-bottom:1px solid var(--amber-line); color:var(--amber); padding:7px 22px; font-size:12.5px; }
.tps-scroll { flex:1; overflow-y:auto; padding:18px 22px 40px; }

.tps-panel { background:var(--panel); border:1px solid var(--line); border-radius:5px;
  box-shadow:0 1px 1px rgba(19,25,34,.03); margin-bottom:14px; }
.tps-ph { display:flex; align-items:center; gap:10px; padding:10px 14px;
  border-bottom:1px solid var(--line-soft); }
.tps-ph h2 { font-family:'Archivo'; font-size:10.5px; font-weight:600; letter-spacing:.09em;
  text-transform:uppercase; color:var(--muted); margin:0; }
.tps-ph .note { margin-left:auto; font-size:11.5px; color:var(--faint); }
.tps-empty { padding:22px 14px; color:var(--muted); font-size:13px; }
.tps-tbl { width:100%; border-collapse:separate; border-spacing:0; }
.tps-tbl th { font-family:'Archivo'; font-size:10px; letter-spacing:.08em; text-transform:uppercase;
  color:var(--faint); font-weight:600; text-align:left; padding:8px 12px;
  border-bottom:1px solid var(--line); white-space:nowrap; }
.tps-tbl td { padding:9px 12px; border-bottom:1px solid var(--line-soft); vertical-align:middle; }
.tps-tbl tr:last-child td { border-bottom:0; }
.tps-tbl .num { text-align:right; }
.tps-who { font-weight:600; }
.tps-dim { color:var(--muted); }
.tps-tag { display:inline-block; font-size:10.5px; letter-spacing:.03em; padding:1px 6px;
  border-radius:3px; background:#F2F4F7; color:var(--muted); border:1px solid var(--line-soft); }
`;

/* --------------------------------------------------------------- pieces */

function Panel({ title, note, empty, children }) {
  return (
    <div className="tps-panel">
      <div className="tps-ph">
        <h2>{title}</h2>
        {note ? <span className="note">{note}</span> : null}
      </div>
      {empty ? <div className="tps-empty">{empty}</div> : children}
    </div>
  );
}

/* --------------------------------------------------------------- sections */

function CollectorNetwork({ collectors, relationships, invitations, goals, binder }) {
  const since = useMemo(() => {
    const out = new Map();
    for (const r of relationships) if (r.collectorId) out.set(r.collectorId, r.at || null);
    return out;
  }, [relationships]);
  /* Counting rows the server sent. No rule is being decided here — a goal
     belongs to the collector whose id it carries, and that is the server's
     word, not an inference. */
  const countBy = (list, key) => {
    const out = new Map();
    for (const row of list) {
      const id = row && row[key];
      if (id) out.set(id, (out.get(id) || 0) + 1);
    }
    return out;
  };
  const goalCount = useMemo(() => countBy(goals, "collectorId"), [goals]);
  const binderCount = useMemo(() => countBy(binder, "collectorId"), [binder]);
  const pending = invitations.filter((i) => i && i.status !== "accepted");

  return (
    <>
      <Panel
        title="Collectors"
        note={collectors.length ? `${collectors.length} in your network` : null}
        empty={collectors.length ? null
          : "No collectors in your network yet. A collector joins by accepting an invitation from you — "
            + "sending one isn't part of this release."}
      >
        <table className="tps-tbl">
          <thead>
            <tr>
              <th>Collector</th><th>City</th><th>Since</th>
              <th className="num">Goals</th><th className="num">Binder copies</th>
            </tr>
          </thead>
          <tbody>
            {collectors.map((c) => (
              <tr key={c.id}>
                <td className="tps-who">{c.name || c.short || "—"}</td>
                <td className="tps-dim">{c.city || "—"}</td>
                <td className="tps-dim mono">{day(since.get(c.id))}</td>
                <td className="num mono">{goalCount.get(c.id) || 0}</td>
                <td className="num mono">{binderCount.get(c.id) || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {pending.length ? (
        <Panel title="Invitations outstanding" note={`${pending.length}`}>
          <table className="tps-tbl">
            <thead><tr><th>Invited</th><th>Sent</th><th>Status</th></tr></thead>
            <tbody>
              {pending.map((i) => (
                <tr key={i.id || i.collectorId}>
                  <td>{i.name || i.email || i.collectorId || "—"}</td>
                  <td className="tps-dim mono">{day(i.at || i.createdAt)}</td>
                  <td><span className="tps-tag">{i.status || "sent"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : null}
    </>
  );
}

function Inventory({ inventory, catalog }) {
  const card = useMemo(() => {
    const out = new Map();
    for (const c of catalog) if (c && c.id) out.set(c.id, c);
    return out;
  }, [catalog]);
  const live = inventory.filter((i) => !i.archived);

  return (
    <Panel
      title="Your copies"
      note={live.length ? `${live.length} not archived` : null}
      empty={live.length ? null
        : "Nothing in your inventory yet. Adding a copy isn't part of this release."}
    >
      <table className="tps-tbl">
        <thead>
          <tr><th>Card</th><th>Set</th><th>Grade</th><th>Status</th><th className="num">Ask</th></tr>
        </thead>
        <tbody>
          {live.map((i) => {
            const c = card.get(i.cardId) || null;
            return (
              <tr key={i.invId}>
                <td className="tps-who">{(c && c.name) || "—"}</td>
                <td className="tps-dim">{(c && c.set) || "—"}</td>
                <td className="tps-dim">{(c && c.grade) || i.cert || "—"}</td>
                {/* The SERVER's answer, carried on the row. Not recomputed. */}
                <td><span className="tps-tag">{COPY_STATUS[i.status] || i.status || "—"}</span></td>
                <td className="num mono">{money(i.ask)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function Opportunities({ opportunities, collectors, counterparties, catalog }) {
  const name = useMemo(() => {
    const out = new Map();
    for (const c of [...collectors, ...counterparties]) if (c && c.id) out.set(c.id, c.name || c.short);
    return out;
  }, [collectors, counterparties]);
  const card = useMemo(() => {
    const out = new Map();
    for (const c of catalog) if (c && c.id) out.set(c.id, c);
    return out;
  }, [catalog]);
  const active = opportunities.filter((o) => o.stage !== "completed");
  const closed = opportunities.length - active.length;

  return (
    <Panel
      title="In progress"
      note={closed ? `${closed} completed` : null}
      empty={active.length ? null
        : (opportunities.length
          ? "Nothing in progress. Everything you've coordinated is complete."
          : "Nothing in progress yet. Opportunities begin from a collector's goal.")}
    >
      <table className="tps-tbl">
        <thead>
          <tr><th>Collector</th><th>Card</th><th>Stage</th><th className="num">Listed</th></tr>
        </thead>
        <tbody>
          {active.map((o) => (
            <tr key={o.id}>
              <td className="tps-who">{name.get(o.collectorId) || "—"}</td>
              <td className="tps-dim">{((card.get(o.cardId) || {}).name) || "—"}</td>
              <td><span className="tps-tag">{stageLabel(o.stage)}</span></td>
              <td className="num mono">{money(o.listedPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/* --------------------------------------------------------------- the shell */

export default function TrustedPartnerShell({ state, onSignOut }) {
  const [section, setSection] = useState(SECTIONS[0].id);

  const who = describeActor(state);
  const collectors = rows(state && state.collectors);
  const relationships = rows(state && state.relationships);
  const invitations = rows(state && state.invitations);
  const goals = rows(state && state.goals);
  const binder = rows(state && state.binder);
  const inventory = rows(state && state.inventory);
  const catalog = rows(state && state.catalog);
  const opportunities = rows(state && state.opportunities);
  const counterparties = rows(state && state.counterparties);

  const counts = {
    collectors: collectors.length,
    inventory: inventory.filter((i) => !i.archived).length,
    opportunities: opportunities.filter((o) => o.stage !== "completed").length,
  };
  const meta = SECTIONS.find((s) => s.id === section) || SECTIONS[0];

  return (
    <div className="tps">
      <style>{CSS}</style>

      <nav className="tps-sb" aria-label="Trusted Partner">
        <div className="tps-brand">
          <span className="tps-mark"><i /><i /></span>
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
              <span className="cnt mono">{counts[s.id]}</span>
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
        <div className="tps-ro" role="note">
          <span>Read-only for now — everything here is what the server holds for you.</span>
          <span className="tps-dim">Actions arrive in a later release.</span>
        </div>
        <div className="tps-scroll" key={section}>
          {section === "collectors" && (
            <CollectorNetwork collectors={collectors} relationships={relationships}
              invitations={invitations} goals={goals} binder={binder} />
          )}
          {section === "inventory" && <Inventory inventory={inventory} catalog={catalog} />}
          {section === "opportunities" && (
            <Opportunities opportunities={opportunities} collectors={collectors}
              counterparties={counterparties} catalog={catalog} />
          )}
        </div>
      </div>
    </div>
  );
}
