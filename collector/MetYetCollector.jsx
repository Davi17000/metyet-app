import React, { useState, useMemo, useCallback, useEffect, useSyncExternalStore } from "react";
import * as D from "../domain/metyet-domain.js";
import * as E from "../domain/metyet-entities.js";
import { createStore } from "../domain/metyet-store.js";
import { DEV as SHARED_DEV } from "../shared/dev-flag.js";
import { DEMO as SHARED_DEMO } from "../shared/demo-flag.js";
import { collectorView } from "../domain/collector-view.js";
/* THE CANONICAL SEED. The Collector runs on the same universe the Trusted
   Partner does — same cards, same collectors, same inventory copies. Casey Lin
   (c12) is a collector in that network, not a fixture. */
import { buildCanonicalSeed, demoDealFixture, Icon,
  CounterFields, validAmount, percentageOf,
  ActualCardPhoto, FaceSwitch, emptyTradeCard } from "../src/MetYet.jsx";
import CardIdentityPicker from "../shared/CardIdentityPicker.jsx";

const SELF_COLLECTOR = "c12";

/* ============================================================================
   MetYet — COLLECTOR

   A projection over the shared MetYet domain, not an application with its own
   state. Every card, goal, binder copy, interest relationship, conversation and
   opportunity below is the SAME record the Trusted Partner workspace reads.

   This file owns presentation: layout, wording, artwork, and the consumer
   framing of a transaction. It owns no business rules. Matching, the lifecycle,
   turn ownership, settlement and the invariants all live in the domain, so the
   two personas cannot disagree about a deal.
   ========================================================================== */

const TODAY = new Date("2026-08-14T12:00:00Z");
const AT = "2026-08-14";

/* ---- presentation-only formatting. No domain meaning. ---- */
const money = (n) => (n == null || !isFinite(n) ? "—"
  : (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US"));
const pct = (f) => (f == null ? "—" : Math.round(f * 100) + "%");
const daysSince = (d) => Math.max(0, Math.round((TODAY - new Date(d + "T12:00:00Z")) / 86400000));
const ago = (d) => {
  const n = daysSince(d);
  if (n === 0) return "today";
  if (n === 1) return "yesterday";
  if (n < 30) return `${n} days ago`;
  const m = Math.round(n / 30);
  return m < 12 ? `${m} month${m === 1 ? "" : "s"} ago` : `${Math.round(n / 365)} yr ago`;
};
const fmtDate = (d) => new Date(d + "T12:00:00Z")
  .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/* Card wording for a collector. The identity RULE is canonical (D.identityKey);
   these only choose how to say it. */
const gradeLine = (c) => (D.isRaw(c) ? (c.condition ? `Raw · ${c.condition}` : "Raw") : c.grade);
const cardLine = (c) => [c.set, c.num && c.num !== "—" ? `#${c.num}` : null].filter(Boolean).join(" · ");
const cardFull = (c) => [c.name, c.set, c.num !== "—" ? c.num : null, c.print,
  c.edition, c.language, gradeLine(c)].filter(Boolean).join(" · ");

const artUrl = (id) => {
  if (!id) return null;
  const i = id.lastIndexOf("-");
  return `https://images.pokemontcg.io/${id.slice(0, i)}/${id.slice(i + 1)}_hires.png`;
};

/* What the collector must actually DO next, derived from canonical opportunity
   state. A stage name is context, not an instruction: "Select Trade" tells you
   where the deal is, "Choose trade cards" tells you what to do. Every label here
   comes from the shared lifecycle, so no stage is special-cased. */
function nextActionFor(o, st) {
  const t = st.turnFor(o);
  const partner = st.partnerById(o.partnerId);
  const them = partner ? partner.name : "them";
  const mine = t.who === "me";
  const agreed = o.agreedPrice != null
    ? `Price agreed at ${money(o.agreedPrice)} with ${them}` : null;

  switch (o.stage) {
    case "agree-price": {
      const last = D.lastEntry(o.priceThread);
      return { cta: mine ? (last && last.by !== "collector" ? "Review their price" : "Make your offer") : null,
        context: last ? `${last.by === "collector" ? "You offered" : them + " countered"} ${money(last.amount)}`
          : `Listed at ${money(o.listedPrice)}`,
        waiting: mine ? null : `Waiting on ${them}` };
    }
    case "select-trade":
      return { cta: mine ? "Choose trade cards" : null, context: agreed,
        waiting: mine ? null : `Waiting on ${them} — reviewing your cards` };
    case "value-trade":
      return { cta: mine ? "Agree card values" : null, context: agreed,
        waiting: mine ? null : `Waiting on ${them} — valuing your cards` };
    case "deal":
      return { cta: mine ? "Check the balance" : null, context: agreed,
        waiting: mine ? null : `Waiting on ${them} — agreeing the balance` };
    case "fulfillment":
      return { cta: mine ? "Confirm the handoff" : null, context: agreed,
        waiting: mine ? null : `Waiting on ${them} — confirming the handoff` };
    default:
      return { cta: null, context: agreed, waiting: null };
  }
}

/* The deal stages a collector actually moves through. Derived from the shared
   lifecycle — the intent stages are not part of a deal, and Completed is the end
   rather than a step. No Goal-specific stage state exists. */
const DEAL_STEPS = D.STAGES.filter((s) => s.group === "deal").map((s) => s.id);

/* Consumer wording for the canonical goal states. */
const lastEntry = D.lastEntry;
/* Market value agreed, but the trade percentage not yet — the intermediate step
   inside Value Trade. Derived from canonical fields. */
const marketSettled = (c) => c.agreedMarket != null;

const GOAL_STATE = { seeking: "Seeking", negotiating: "Negotiating", satisfied: "Satisfied" };

/* Human wording for preference tags. Presentation only — the tags themselves
   are canonical collector preferences. */
const PREF_LABEL = {
  "base-set": "Base Set", "eeveelution": "Eeveelutions", "holo": "Holos",
  "first-edition": "1st Edition", "neo": "Neo era", "team-rocket": "Team Rocket",
  "fossil": "Fossil", "jungle": "Jungle", "modern": "Modern", "alt-art": "Alt art",
  "gold-star": "Gold Star", "promo": "Promos", "charizard": "Charizard",
};

/* Canonical settlement, surfaced under the names this file already used. */
const acceptedCards = D.acceptedTradeCards;
const cardSettled = D.cardSettled;
const tradeValue = D.tradeValueOf;
const totalTradeValue = D.totalTradeValue;
const calcBalance = D.calculatedBalance;
const finalBalance = D.finalBalance;
const isOpen = D.isActive;
const STAGES = D.STAGES;
const STAGE_IX = D.STAGE_IX;
const STAGE = Object.fromEntries(D.STAGES.map((s) => [s.id, s]));

/* Collector-facing explanation of each stage. Presentation only — the TP app
   assumes fluency in the model; this one does not. */
const STAGE_BLURB = {
  secondary: "On your list, not actively chasing.",
  primary: "You're actively looking for this one.",
  "agree-price": "Settling what the card costs.",
  "select-trade": "Choosing which of your cards to put toward it.",
  "value-trade": "Agreeing what your cards are worth in this trade.",
  deal: "Checking the numbers before either of you commits.",
  fulfillment: "Arranging the handoff.",
  completed: "Done.",
};

/* ============================ VISUAL LANGUAGE ============================
   Unmistakably MetYet — same typeface family, same teal, same neutrals, same
   restraint. Composed completely differently.

   The Trusted Partner app is an operational workspace: fixed sidebar, dense
   tables, 13px base, many decisions in view at once. This is a consumer
   collecting product: mobile-first, bottom navigation, a 15px base, generous
   whitespace, and card artwork given real size. None of the TP layout
   primitives — sidebar, workspace header, table rows, KPI blocks, opportunity
   queues — appear here. */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Public+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

.mc {
  /* ONE LIGHT SYSTEM. The Collector app used to be a dark case you looked into,
     with a light workspace opened inside it for close reading. Two systems, and
     the seam showed: the same component read differently depending on whether a
     deal happened to be open behind it.

     These are the workspace's tokens, promoted to the root. The names are
     unchanged, so every rule that already spoke in tokens simply follows —
     which is why this is a theme change and not a rewrite. The three-level text
     ladder is kept: primary, secondary, tertiary still read as three distinct
     weights, now against white rather than near-black. */
  --bg: #F7F9FA;
  --panel: #FFFFFF;
  --panel-2: #F3F6F7;
  --line: #DFE5E8;
  --line-soft: #EDF1F2;
  --text: #16202A;          /* 15.4:1 on white */
  --muted: #5A6B76;         /*  6.1:1 — secondary, still comfortably readable */
  --faint: #64757F;         /*  4.6:1 on white — tertiary, still clears AA */
  --t1: #0B5D66;
  --t2: #40767D;            /* darkened from #4E8C93 to clear AA on white */
  --t1-bg: #E6F0F1;
  --accent: #0B7A72;
  --accent-bg: #E8F4F3;
  --accent-line: #C6E1DE;
  --amber: #8A5A08;
  --amber-bg: #FBF3E3;
  --danger: #98302C;
  font-family: 'Public Sans', system-ui, sans-serif;
  color: var(--text);
  font-size: 15px;
  line-height: 1.5;
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
  padding-bottom: 78px;
}
.mc * { box-sizing: border-box; }
.mc button { font: inherit; color: inherit; cursor: pointer; }
/* Focus must stay visible on a dark surface — a teal ring, never removed. */
.mc :focus-visible { outline: 2px solid var(--t1); outline-offset: 2px; border-radius: 6px; }
.mc ::selection { background: var(--accent-bg); color: var(--text); }
.mc ::placeholder { color: var(--faint); }
.disp { font-family: 'Archivo', system-ui, sans-serif; letter-spacing: -0.015em; }
.mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }

/* ---- page shell: generous, single column, mobile-first ---- */
.pg { max-width: 580px; margin: 0 auto; padding: 26px 18px 10px; }
.pg-h { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 24px; }
.pg-t { font-size: 31px; font-weight: 700; line-height: 1.08; letter-spacing: -.025em;
  display: flex; align-items: center; gap: 10px; }
.pg-ic { color: var(--t1); display: flex; }
.pg-s { font-size: 14px; color: var(--muted); margin-top: 4px; }
.pg-act { margin-left: auto; display: flex; gap: 8px; align-items: center; }

/* ---- primitives, shared in spirit with the TP app ---- */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  border: 1px solid var(--line); background: var(--panel-2); border-radius: 11px;
  padding: 12px 17px; font-size: 14px; font-weight: 600; transition: all .14s ease;
  box-shadow: 0 1px 2px rgba(15,19,27,.05); }
.btn:active { transform: translateY(1px); }
.btn:hover { border-color: var(--t2); background: var(--panel); }
.btn.pri { background: var(--accent); border-color: var(--accent); color: #FFF;
  box-shadow: 0 2px 8px rgba(11,93,102,.24); }
.btn.pri:hover { background: #096A63; border-color: #096A63; }
.btn.deep { background: var(--t1); border-color: var(--t1); color: #FFF;
  box-shadow: 0 2px 8px rgba(11,93,102,.24); }
.btn.wide { width: 100%; }
.btn.sm { padding: 7px 12px; font-size: 13px; border-radius: 8px; }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.inp { width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px;
  font: inherit; font-size: 16px; background: var(--panel-2); color: var(--text); }
/* The default outline is replaced by a brighter ring, never simply removed. */
.inp:focus-visible { outline: 2px solid var(--t1); outline-offset: 1px; border-color: var(--t2); }
.inp:focus { border-color: var(--t2); box-shadow: 0 0 0 3px var(--accent-bg); }
.chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px;
  border-radius: 999px; font-size: 12px; background: var(--line-soft); color: var(--muted); }
.chip.t { background: var(--t1-bg); color: var(--t1); font-weight: 600; border: 1px solid var(--accent-line); }
.chip.a { background: var(--accent-bg); color: var(--t1); font-weight: 600; border: 1px solid var(--accent-line); }
.link { background: none; border: 0; padding: 0; color: var(--t1); font-weight: 500; text-decoration: none; }
.link:hover { text-decoration: underline; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 18px;
  box-shadow: 0 1px 2px rgba(0,0,0,.30), 0 8px 24px rgba(0,0,0,.28); }
.muted { color: var(--muted); } .faint { color: var(--faint); }
.empty { text-align: center; color: var(--faint); font-size: 14px; padding: 34px 16px; }

/* ---- card artwork: the largest thing on any screen ---- */
.art { border-radius: 9px; flex: 0 0 auto; object-fit: contain; background: transparent;
  filter: drop-shadow(0 4px 14px rgba(0,0,0,.55)); }
/* the fallback keeps the exact footprint, so a late image causes no shift */
.art.ph { display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px; padding: 8px; text-align: center; overflow: hidden; filter: none;
  background: var(--panel-2); border: 1px solid var(--line); }
.ph-n { font-family: 'Archivo'; font-weight: 700; font-size: 12px; line-height: 1.15;
  color: var(--muted); overflow-wrap: anywhere; }
/* Which picture am I looking at? Said plainly, never in internal vocabulary. */
.ph-note { font-size: 12.5px; line-height: 1.45; color: var(--muted); margin: 6px 0 2px; }
.ph-note.actual { color: var(--t1); font-weight: 600; }
.ph-tag { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: .05em;
  text-transform: uppercase; color: var(--muted); background: var(--panel-2);
  border: 1px solid var(--line); border-radius: 5px; padding: 1px 6px; margin-right: 7px; }

.ph-s { font-size: 10.5px; color: var(--faint); line-height: 1.4; }
.art.xl { width: 178px; height: 249px; } .art.xl .ph-n { font-size: 15px; }
.art.lg { width: 132px; height: 184px; } .art.lg .ph-n { font-size: 13px; }
/* On a narrow container the enlarged card steps back down rather than pushing
   the identity column out of the row. */
@media (max-width: 480px) {
  .goal-top > .art.xl, .dw-ctx > .art.xl { width: 132px; height: 184px; }
}
.art.md { width: 100px; height: 140px; } .art.md .ph-n { font-size: 11px; }
.art.sm { width: 58px; height: 81px; } .art.sm .ph-n { font-size: 8px; } .art.sm .ph-s { display: none; }
.art.xs { width: 40px; height: 56px; } .art.xs .ph-n { font-size: 7px; } .art.xs .ph-s { display: none; }

/* ---- goals: aspirational, one card at a time ---- */
.goal { padding: 20px; margin-bottom: 18px; }
.goal-top { display: flex; gap: 20px; }
.goal-b { flex: 1; min-width: 0; }
.tier { font-family: 'Archivo'; font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
  font-weight: 700; padding: 3px 8px; border-radius: 5px; display: inline-block; }
.tier.p { background: var(--accent-bg); color: var(--t1); }
.tier.s { background: var(--panel-2); color: var(--muted); }
.goal-n { font-size: 23px; font-weight: 700; line-height: 1.12; margin-top: 11px; letter-spacing: -.02em; }
.goal-i { font-size: 14px; color: var(--muted); margin-top: 4px; }
.goal-avail { font-size: 14px; margin-top: 12px; }
.faces { display: flex; align-items: center; gap: -6px; margin-top: 8px; }
.face { width: 30px; height: 30px; border-radius: 50%; border: 2px solid var(--panel); margin-right: -8px;
  display: flex; align-items: center; justify-content: center; color: #FFF;
  font-family: 'Archivo'; font-size: 11px; font-weight: 700; }
.goal-live { display: flex; align-items: center; gap: 12px; margin-top: 18px; padding: 14px 16px;
  background: var(--accent-bg); border-radius: 13px; }
.goal-live-t { flex: 1; min-width: 0; font-size: 14px; }
/* the partners who can actually help — a compact row each, not a card each */
.goal-supply { margin-top: 16px; border: 1px solid var(--line); border-radius: 12px;
  overflow: hidden; }
.goal-supply-h { font-family: 'Archivo'; font-size: 11px; letter-spacing: .09em;
  text-transform: uppercase; font-weight: 700; color: var(--muted);
  padding: 11px 14px; background: var(--panel-2); }
.gs-row { display: flex; align-items: center; gap: 11px; padding: 11px 14px;
  border-top: 1px solid var(--line-soft); flex-wrap: wrap; }
.gs-b { flex: 1; min-width: 0; }
.gs-n { font-size: 14px; font-weight: 600; text-align: left; }
.gs-c { font-size: 12px; color: var(--faint); }
.gs-a { display: flex; align-items: center; gap: 10px; }
.gs-ask { font-size: 13.5px; font-weight: 600; }
.gs-offer { margin: 12px 14px 14px; }

/* the receipt: the deal filling itself in. Subordinate to the card and the CTA. */
.rc { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line-soft); }
.rc-h { font-family: 'Archivo'; font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
  font-weight: 700; color: var(--muted); margin-bottom: 10px; }
.rc-s { display: flex; gap: 11px; padding: 9px 0; border-bottom: 1px solid var(--line-soft); }
.rc-s:last-child { border-bottom: 0; }
.rc-n { flex: 0 0 auto; width: 20px; height: 20px; border-radius: 50%; font-size: 11px;
  font-family: 'IBM Plex Mono', monospace; display: flex; align-items: center;
  justify-content: center; border: 1px solid var(--line); color: var(--faint); }
.rc-s.done .rc-n { background: var(--t1-bg); border-color: var(--accent-line); color: var(--t1); }
.rc-s.current .rc-n { background: var(--t1); border-color: var(--t1); color: #FFF; font-weight: 700; }
.rc-b { flex: 1; min-width: 0; }
.rc-t { display: flex; align-items: baseline; gap: 8px; font-size: 13px; font-weight: 600;
  flex-wrap: wrap; }
.rc-s.pending .rc-t { color: var(--muted); font-weight: 600; }
.rc-s.current .rc-t { color: var(--t1); }
.rc-st { margin-left: auto; font-size: 10.5px; font-weight: 600; color: var(--muted);
  text-transform: uppercase; letter-spacing: .06em; font-family: 'Archivo'; }
.rc-f { display: grid; grid-template-columns: minmax(88px, auto) 1fr; gap: 2px 12px;
  margin: 6px 0 0; font-size: 12.5px; }
.rc-f dt { color: var(--muted); }
.rc-f dd { margin: 0; color: var(--text); overflow-wrap: anywhere; }
.rc-s.pending .rc-f dd { color: var(--muted); }
.rc-p { color: var(--faint); font-style: italic; }
.rc-p { color: var(--faint); font-style: italic; }
@media (max-width: 420px) {
  .rc-f { grid-template-columns: 1fr; gap: 0 0; }
  .rc-f dt { margin-top: 4px; font-size: 11.5px; }
  .rc-st { margin-left: 0; }
}

/* deal progress: context under the action, never competing with it */
.goal-prog { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line-soft); }
.goal-prog-bar { display: flex; gap: 3px; }
.gp-seg { flex: 1; height: 4px; border-radius: 2px; background: var(--line); }
.gp-seg.done { background: var(--t2); }
.gp-seg.now { background: var(--t1); box-shadow: 0 0 8px rgba(47,212,196,.45); }
.goal-prog-l { display: flex; gap: 3px; margin-top: 7px; }
.gp-l { flex: 1; font-size: 11px; line-height: 1.4; color: var(--faint); text-align: center;
  overflow: hidden; text-overflow: ellipsis; }
.gp-l.on { color: var(--t1); font-weight: 700; }
@media (max-width: 520px) { .gp-l { font-size: 0; } .gp-l.on { font-size: 11px; } }

/* ---- the shared card identity picker, in the Collector's visual language.
   Same questions as the Trusted Partner asks; consumer spacing and targets. */
.cip-q { margin-bottom: 4px; }
.cip-results { margin-top: 12px; max-height: 340px; overflow-y: auto; }
.cip-row { display: flex; gap: 12px; align-items: center; width: 100%; text-align: left;
  background: none; border: 0; border-bottom: 1px solid var(--line-soft); padding: 10px 4px; }
.cip-row:hover { background: var(--panel-2); }
.cip-main { display: flex; flex-direction: column; min-width: 0; }
.cip-name { font-size: 14.5px; font-weight: 600; line-height: 1.4; }
.cip-sub { font-size: 12.5px; color: var(--muted); }
.cip-var { font-size: 11.5px; color: var(--faint); }
.cip-hint { font-size: 12px; padding: 10px 4px; }
.cip-none { padding: 22px 4px; }
.cip-picked { display: flex; gap: 14px; align-items: flex-start; padding-bottom: 16px;
  border-bottom: 1px solid var(--line-soft); margin-bottom: 16px; }
.cip-fld { margin-bottom: 16px; }
.cip-lbl { display: block; font-size: 13px; font-weight: 600; margin-bottom: 7px; }
.cip-lbl .req { color: var(--danger); font-weight: 700; }
.cip-seg { display: flex; flex-wrap: wrap; gap: 6px; }
.cip-opt { border: 1px solid var(--line); background: var(--panel-2); border-radius: 9px;
  padding: 8px 12px; font-size: 13px; font-weight: 500; min-width: 42px; }
.cip-opt:hover { border-color: var(--t2); }
.cip-opt.on { background: var(--accent); border-color: var(--accent); color: #FFF; }
.cip-opt.wide { min-width: 62px; }

/* ---- goals: two sections doing two different jobs --------------------------
   Primary is the working area — full cards, deal state, next action.
   Secondary is a watchlist — compact rows, no deal machinery. The difference
   should read even with the words "Primary" and "Secondary" removed. */
.gsec-h { display: flex; align-items: baseline; gap: 9px; margin: 0 0 14px; }
.gsec-t { font-family: 'Archivo'; font-size: 17px; font-weight: 700; letter-spacing: -.01em; }
.gsec-n { font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: var(--t1);
  background: var(--accent-bg); border: 1px solid var(--accent-line);
  border-radius: 999px; padding: 1px 8px; }
.gsec-s { margin-left: auto; font-size: 12.5px; color: var(--faint); }
.gsec-empty { padding: 26px 22px; text-align: center; }
.gsec-none { font-size: 13px; padding: 2px 2px 4px; }

/* the live deal: the most consequential thing on a primary goal.

   The display:block here is load-bearing, not decoration. An older .goal-live
   rule further up this stylesheet (a compact status strip on a different
   surface) sets display:flex with align-items:center, and since both match, it
   one governed the deal's macro layout too — which is why the Deal Flow header,
   the rail and the three-column work area sat side by side in a row instead of
   stacking. Every child here is a full-width ROW. */
.goal-live { display: block; margin-top: 16px; padding: 15px 16px;
  background: var(--accent-bg);
  border: 1px solid var(--accent-line); border-left: 3px solid var(--t1);
  border-radius: 12px; }

/* Expanded, the deal IS the card: it drops the compact callout treatment so the
   header and rail can span the full width rather than sitting in a tinted box. */
.goal.deal-open .goal-live { background: none; border: none; padding: 0;
  margin-top: 22px; }
.goal-live-h { display: flex; align-items: baseline; gap: 8px; font-size: 12.5px; }
.goal-live-stage { font-family: 'Archivo'; font-size: 11px; letter-spacing: .1em;
  text-transform: uppercase; font-weight: 700; color: var(--t1); }
.goal-live-c { font-size: 14px; margin-top: 7px; font-weight: 500; }
.goal-live-w { font-size: 13.5px; color: var(--muted); margin-top: 10px; }
/* Conversation embedded in the deal: part of the workspace, never a second app
   underneath it. The stage above stays visually dominant. */
.chat-embed .chat-scroll { max-height: 300px; }
.chat-more { display: block; font-size: 12.5px; margin: 0 0 8px; color: var(--muted); }
/* Active goals read as deals at the entry point, and open straight into one. */
.goal-deal { display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
  min-height: 52px;
  background: var(--t1-bg); border: 1px solid var(--accent-line); border-radius: 10px;
  padding: 9px 11px; margin-top: 10px; cursor: pointer; }
.goal-deal-s { font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase;
  color: var(--t1); font-weight: 700; }
.goal-deal-p { font-size: 13px; font-weight: 600; }
.goal-deal-t { margin-left: auto; font-size: 12px; color: var(--muted); }
/* Demo scaffolding, deliberately not product chrome: it must read as the
   tester standing in for the other side, never as a Collector action. */
.dl-h { font-family: 'Archivo'; font-size: 11px; letter-spacing: .11em;
  text-transform: uppercase; font-weight: 700; color: var(--muted); margin: 16px 0 4px; }
.dl-card { padding: 12px 0; border-bottom: 1px solid var(--line-soft); }
.dl-card-n { font-size: 15px; font-weight: 700; margin-bottom: 7px; }
.dl-card-m { display: flex; justify-content: space-between; font-size: 13.5px;
  color: var(--muted); padding: 2px 0; }
.dl-card-m.tv { color: var(--text); font-weight: 600; margin-top: 4px; }
.dl-cash { font-size: 13.5px; color: var(--muted); line-height: 1.5; margin: 12px 0; }
.dl-agree { margin: 14px 0; padding: 10px 0; border-top: 1px solid var(--line-soft);
  border-bottom: 1px solid var(--line-soft); }
.dl-wait { font-size: 13.5px; color: var(--muted); line-height: 1.5; }

.vcard-top { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 16px; }
.vcard-id { flex: 1; min-width: 0; }
.vcard-n { font-size: 17px; font-weight: 700; line-height: 1.2; }
.vcard-st { font-size: 12.5px; color: var(--t1); margin-top: 8px; font-weight: 600; }
.vcard.out { opacity: .72; }
.vcard-out { font-size: 13px; color: var(--muted); line-height: 1.5; }
.vcard-out-a { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line-soft); }
.vcard-tot { margin-top: 14px; }

/* One panel shape, used by both units of negotiation. */
.vp { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line-soft); }
.vp-h { font-family: 'Archivo'; font-size: 11px; letter-spacing: .11em;
  text-transform: uppercase; font-weight: 700; color: var(--muted); }
.vp.locked .vp-lock { font-size: 13px; color: var(--faint); margin-top: 8px; line-height: 1.45; }
.vp-agreed, .vp-standing { margin-top: 10px; }
.vp-amt { display: block; font-size: 22px; font-weight: 700; }
.vp-by { display: block; font-size: 12.5px; color: var(--muted); margin-top: 3px; }
.vp-none { font-size: 13px; color: var(--faint); margin-top: 9px; }
.vp-accept { margin-top: 12px; }
.vp-counter { margin-top: 14px; }
.vp-hint { font-size: 12.5px; color: var(--faint); margin-top: 7px; line-height: 1.45; }
.vp-hist { margin-top: 12px; }
.vp-hist-b { background: none; border: 0; padding: 0; font-size: 12.5px;
  color: var(--t1); text-decoration: underline; }
.vp-hist-l { list-style: none; margin: 9px 0 0; padding: 0; }
.vp-hist-l li { display: flex; gap: 7px; font-size: 12.5px; color: var(--muted);
  padding: 3px 0; }
.vp-hist-who { font-weight: 600; color: var(--text); }

.st-alt { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line-soft); }
.st-alt > .btn + .btn { margin-left: 8px; }
.st-cash-n { display: block; font-size: 12.5px; color: var(--faint);
  margin-top: 8px; line-height: 1.45; }

.fh-wait { font-size: 13px; color: var(--muted); line-height: 1.5; margin-bottom: 12px; }
.fh-act { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
.fh-ask { margin-top: 12px; padding: 12px; background: var(--panel-2);
  border: 1px solid var(--line); border-radius: 11px; }

.dpr { margin-top: 16px; padding: 13px 14px; border: 1px dashed var(--line);
  border-radius: 11px; background: var(--panel-2); }
.dpr-h { display: flex; align-items: center; gap: 8px; }
/* Pilot testers read this, not engineers, so it observes the same legibility
   floor as product copy rather than claiming a tooling exemption. */
.dpr-tag { font-family: 'Archivo'; font-size: 10.5px; letter-spacing: .13em;
  text-transform: uppercase; font-weight: 700; color: var(--faint);
  border: 1px solid var(--line); border-radius: 4px; padding: 1px 5px; }
.dpr-l { font-size: 12px; letter-spacing: .04em; text-transform: uppercase;
  color: var(--muted); font-weight: 600; }
.dpr-b { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.dpr-n { font-size: 13px; color: var(--text); margin-top: 10px; }
.dpr-f { font-size: 12px; color: var(--faint); margin-top: 9px; line-height: 1.45; }

/* Copy evidence in the card header: secondary, and absent when there is
   nothing to inspect. */
.cx-ph { margin-top: 10px; }
.cx-ph-btn { font-size: 12.5px; }
.cx-ph-none { font-size: 12.5px; color: var(--faint); line-height: 1.45; }
/* The viewer: one face at a time, at a size worth inspecting. */
.lbx { max-width: 460px; padding: 20px; }
.lbx-b { aspect-ratio: 5 / 7; max-height: 58vh; margin: 14px auto 0; border-radius: 12px;
  border: 1px solid var(--line); background: var(--panel-2); overflow: hidden;
  display: flex; align-items: center; justify-content: center; }
.lbx-b img { width: 100%; height: 100%; object-fit: contain; }
.lbx-nav { display: flex; gap: 8px; }
.lbx-nav .btn.on { border-color: var(--t1); color: var(--t1); font-weight: 600; }

/* Review Card: the two faces of one physical copy, side by side. */
.rv-h { font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
  color: var(--muted); margin: 18px 0 8px; }
.rv-faces { display: flex; gap: 12px; }
.rv-face { flex: 1 1 0; min-width: 0; }
.rv-face-l { font-size: 12.5px; color: var(--muted); margin-bottom: 5px; }
.rv-face-b { aspect-ratio: 5 / 7; border: 1px dashed var(--line); border-radius: 10px;
  background: var(--panel-2); display: flex; align-items: center; justify-content: center;
  overflow: hidden; }
.rv-face.has .rv-face-b { border-style: solid; background: var(--panel); }
.rv-img { width: 100%; height: 100%; object-fit: cover; }
.rv-awaiting { font-size: 12.5px; color: var(--faint); }
.rv-note { font-size: 12.5px; color: var(--muted); line-height: 1.45; margin-top: 12px; }
.rv-confirm { max-width: 460px; padding: 22px; }
.rv-confirm-t { font-size: 14px; line-height: 1.5; color: var(--muted); margin-top: 8px; }
/* Why an offer could not be made. Never says who holds the copy. */
.ap-refused { font-size: 13.5px; line-height: 1.5; color: var(--text); background: var(--amber-bg);
  border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; }

/* ---- AGREE ON PRICE.

   The hierarchy IS the interface here: what just happened, then the number on
   the table, then what it means, then the decision. Everything quieter than the
   standing proposal is deliberately quieter. ---- */
.ap-h { font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
  color: var(--muted); margin-bottom: 8px; }

/* The focal object. Tinted only when the OTHER party is the one waiting on an
   answer, so the collector's eye lands on what they must respond to. */
.ap-now { padding: 16px 18px; border: 1px solid var(--line); border-radius: 12px;
  background: var(--panel-2); }
.ap-now.theirs { background: var(--t1-bg); border-color: var(--accent-line); }
.ap-who { font-size: 11.5px; font-weight: 700; letter-spacing: .07em;
  text-transform: uppercase; color: var(--t1); margin-bottom: 6px; }
.ap-amt { font-size: 32px; font-weight: 700; line-height: 1.1; color: var(--text); }
.ap-sub { font-size: 13.5px; color: var(--muted); line-height: 1.45; margin-top: 5px; }
.ap-prev { font-size: 13px; color: var(--faint); line-height: 1.45; margin-top: 10px;
  padding-top: 10px; border-top: 1px solid var(--line); }

/* The primary decision, immediately beneath the number it acts on. */
.ap-go { margin-top: 16px; }
.ap-counter { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); }
.ap-counter.open { border-top: none; padding-top: 0; }
.ap-send { margin-top: 12px; }
.ap-wait { font-size: 13.5px; color: var(--muted); margin-top: 16px; }

/* Two ways of typing one number, side by side while there is room. */
.ap .pn-in { display: flex; gap: 12px; margin-bottom: 4px; }
.ap .pn-f { flex: 1 1 0; min-width: 0; display: block; }
.ap .pn-fl { display: block; font-size: 12.5px; color: var(--muted); margin-bottom: 5px; }
.ap .pn-w { position: relative; display: block; }
.ap .pn-u { position: absolute; left: 11px; top: 50%; transform: translateY(-50%);
  font-size: 13.5px; color: var(--muted); pointer-events: none; }
.ap .pn-u.r { left: auto; right: 11px; }
.ap .pn-w .inp { padding-left: 24px; }
.ap .pn-w .inp.r { padding-left: 14px; padding-right: 26px; }
@media (max-width: 420px) { .ap .pn-in { flex-direction: column; gap: 10px; } }

/* Offer history — the record, kept quiet. */
.oh { margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--line-soft); }
.oh-h { font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
  color: var(--muted); margin-bottom: 8px; }
.oh-more { display: block; font-size: 12.5px; color: var(--t1); margin-bottom: 8px; }
.oh-l { list-style: none; margin: 0; padding: 0; }
.oh-r { display: flex; align-items: baseline; gap: 8px; padding: 6px 0;
  font-size: 13px; border-bottom: 1px solid var(--line-soft); }
.oh-r:last-child { border-bottom: none; }
.oh-who { font-weight: 600; color: var(--text); }
.oh-act { color: var(--muted); }
.oh-amt { margin-left: auto; color: var(--text); font-variant-numeric: tabular-nums; }
.oh-pct { color: var(--muted); }

/* Its own row, beneath identity — see the rail block in GoalCard. */
.goal-rail { width: 100%; }
.goal-top { flex-wrap: wrap; }

.goal-deal-c { font-size: 17px; line-height: 1; color: var(--muted); transition: transform .15s;
  transform: rotate(90deg); }
.goal-deal-c.on { transform: rotate(-90deg); }
.goal-deal:hover { border-color: var(--t1); }
.goal.deal-open .goal-deal:hover { background: var(--panel-2); }
/* The disclosure row: stage + partner on the left, turn + chevron on the right.
   It is the ONLY control that opens or closes the workspace, and it stays put at
   the top of the expanded Goal. */
.goal-deal-m { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
/* Expanded: a wide header row, not a bordered chip floating at the left. */
.goal.deal-open .goal-deal { width: 100%; background: none; border: none;
  border-radius: 0; padding: 0 0 14px; align-items: flex-start; }
.goal.deal-open .goal-deal-s { font-size: 13px; letter-spacing: .08em; }
.goal.deal-open .goal-rail { margin-top: 0; padding-top: 0; border-top: none;
  padding-bottom: 20px; }
.goal-deal-p { display: flex; align-items: center; gap: 6px; }
.goal-deal-pn { font-size: 13.5px; font-weight: 600; }
.goal-deal-r { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.goal-deal-t.mine { color: var(--t1); font-weight: 600; }

/* ---- ONE SURFACE. Expanded, the Goal card IS the Deal Flow: the workspace
   contributes sections, not another bordered panel inside a panel. Everything
   below flattens the old page shell rather than re-styling it. ---- */
.goal-dw { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 4px; }
/* ================================================= INLINE DEAL FLOW GEOMETRY

   Purpose-built for the Primary Goal card. Nothing here descends from the
   standalone page shell: no viewport height, no page padding, no fixed bar, no
   inherited column placement. The Goal card is the outer container. */
.idf { display: block; }

/* Section headings shared by all three regions — one typographic voice. */
.idf-h { font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
  color: var(--t1); margin-bottom: 8px; }
.idf-h.quiet { color: var(--muted); }
.idf-guide-t { font-size: 14px; line-height: 1.5; color: var(--text); margin-bottom: 16px; }

/* Mobile is the base case: one column, one natural scroll, in reading order —
   task, then details, then conversation. */
.idf-work { display: block; background: var(--panel-2);
  border: 1px solid var(--line-soft); border-radius: 12px; padding: 20px; }
.idf-task, .idf-mid, .idf-side { min-width: 0; }
.idf-mid, .idf-side { margin-top: 22px; padding-top: 20px; border-top: 1px solid var(--line); }

/* Sections inside the stage are bands of one document, not cards in a card. */
.idf-stage > .card, .idf-stage > .sec, .idf-stage .card, .idf-stage .sec {
  background: none; border: none; border-radius: 0; box-shadow: none;
  padding: 0; margin: 0 0 16px; width: auto; }
.idf-stage .pick, .idf-stage .bnd-r, .idf-stage .tc-r {
  background: var(--panel); border: 1px solid var(--line); border-radius: 10px; }

/* One action, in flow with the task it belongs to. Never fixed. */
.idf-action { margin-top: 18px; }
.idf-action-go { width: 100%; }
.idf-action-wait { font-size: 13.5px; color: var(--muted); }

/* Centre column: a quiet definition list, aligned, sized to its content. */
.idf-det-l { margin: 0; }
.idf-det-r { display: flex; align-items: baseline; gap: 12px; padding: 7px 0;
  border-bottom: 1px solid var(--line-soft); }
.idf-det-r:last-child { border-bottom: none; }
.idf-det-k { margin: 0; font-size: 13px; color: var(--muted); flex: 1 1 auto; }
.idf-det-v { margin: 0; font-size: 13.5px; color: var(--text); font-weight: 600;
  text-align: right; font-variant-numeric: tabular-nums; }

/* CONTAINMENT. A grid item's default min-width is auto, i.e. its min-content
   width — so the composer's textarea could force the conversation column wider
   than its track and spill past the card's right edge. Every wrapper between
   the track and the textarea must be allowed to shrink, and the control must
   include its own padding in its width. */
.idf-side, .idf-side .chat, .idf-side .chat-embed,
.idf-side .chat-scroll, .idf-side .chat-composer { min-width: 0; max-width: 100%; }
.idf-side .chat-composer { flex-wrap: wrap; }
.idf-side .inp { min-width: 0; max-width: 100%; box-sizing: border-box; }
.idf-side .chat-m { max-width: 100%; }
.idf-side .chat-body { overflow-wrap: anywhere; }

/* Conversation owns no scroller — the page scrolls, once. */
.idf .chat-embed .chat-scroll { max-height: none; overflow: visible; }
.idf .chat, .idf .chat-embed { background: none; border: none; box-shadow: none;
  border-radius: 0; padding: 0; margin: 0; }

/* Ending the deal: present, quiet, and as far from the CTA as the card allows. */

/* CONTAINER-AWARE, NOT VIEWPORT-AWARE. A wide browser window says nothing about
   how much room this deal actually has: the Goals column has its own width, and
   splitting on viewport alone is what squeezed the stage and the conversation
   into strips. The expanded Goal declares itself a query container and the work
   area answers to ITS width. */
.goal.deal-open { container-type: inline-size; container-name: deal; }

/* 980px is the smallest width at which three columns are all still readable:
   conversation floors at 320px, details at 240px, the task at 260px, plus two
   64px dividers/gutters. Below it we fall back to two columns, and below 820px
   to one — stacking is always the honest answer when the room is not there. */
@container deal (min-width: 820px) {
  .idf-work { display: grid; grid-template-columns: minmax(0, 3fr) minmax(320px, 2fr);
    gap: 28px; align-items: start; }
  .idf-main, .idf-side { grid-column: auto; }
  .idf-mid, .idf-side { margin-top: 0; padding-top: 0; border-top: none; }
  /* Two columns: task and details share the left, conversation takes the right. */
  .idf-mid { margin-top: 22px; padding-top: 20px; border-top: 1px solid var(--line-soft); }
  .idf-side { border-left: 1px solid var(--line-soft); padding-left: 28px; }
}

@container deal (min-width: 980px) {
  /* THREE REGIONS: current task, stage details, conversation. Conversation is
     the widest, as the reference composition has it — prose needs the room, and
     the task no longer dominates. Columns align to the top and size to their
     content, so no region stretches into blank space. */
  .idf-work { grid-template-columns:
      minmax(260px, 0.95fr) minmax(240px, 0.95fr) minmax(320px, 1.3fr);
    gap: 0; align-items: start; }
  .idf-task, .idf-mid, .idf-side { grid-column: auto; grid-row: auto; }
  .idf-task { padding-right: 28px; }
  /* Subtle vertical dividers rather than more boxes. */
  .idf-mid { margin-top: 0; padding: 0 28px; border-top: none;
    border-left: 1px solid var(--line-soft); }
  .idf-side { padding-left: 28px; border-left: 1px solid var(--line-soft); }
}

/* AGREE ON PRICE has no details column, so its work area is two regions, not
   three. Declared after the base tiers so it overrides them at both widths. */
@container deal (min-width: 820px) {
  .idf-work.two { grid-template-columns: minmax(0, 1.05fr) minmax(320px, 1fr); }
}
@container deal (min-width: 980px) {
  .idf-work.two { grid-template-columns: minmax(0, 1.05fr) minmax(340px, 1fr); }
}

/* Alternative partners stay reachable but visually subordinate. */
.goal-holders { font-size: 12.5px; }



/* Review harness — dev only, deliberately plain so it never reads as product. */
.rvw { border: 1px dashed var(--line); border-radius: 10px; padding: 10px 12px; margin-bottom: 14px; }
.rvw-h { font-size: 12.5px; font-weight: 600; color: var(--muted); margin-bottom: 7px; }
.rvw-tag { font-size: 10px; letter-spacing: .06em; background: var(--t1-bg); color: var(--t1);
  border-radius: 4px; padding: 1px 5px; margin-right: 7px; text-transform: uppercase; }
.rvw-r { display: flex; align-items: baseline; gap: 9px; padding: 2px 0; font-size: 12.5px; }
.rvw-stage { min-width: 108px; color: var(--t1); font-weight: 600; }
.rvw-w { font-size: 11.5px; }
.rvw-a { margin-top: 9px; display: flex; align-items: center; gap: 9px; }
.rvw-note { font-size: 11.5px; }
.rvw-sec { margin-top: 11px; padding-top: 10px; border-top: 1px dashed var(--line); }
.rvw-sec-h { font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
  color: var(--muted); margin-bottom: 7px; }
.rvw-stages { display: flex; flex-wrap: wrap; gap: 6px; }
.rvw-st.on { border-color: var(--t1); color: var(--t1); font-weight: 600; }
.rvw-note-l { font-size: 11.5px; color: var(--faint); margin-top: 7px; line-height: 1.45; }
/* Re-entry while the partner holds the turn: present, but plainly secondary to
   the primary action it replaces. */
.goal-live-view { }
/* Conversation vs negotiation, said in the layout as well as the words. */
.whi-current { border-color: var(--accent-line); background: var(--t1-bg); }
.whi-badge { margin-left: 7px; font-size: 10.5px; letter-spacing: .04em; vertical-align: 2px; }
.whi-live { line-height: 1.45; }
.pc-banner { font-size: 12.5px; padding: 9px 11px; border-radius: 8px; margin-bottom: 11px;
  border: 1px solid var(--line); color: var(--muted); line-height: 1.45; }
.pc-banner.is-deal { border-color: var(--accent-line); background: var(--t1-bg); color: var(--t1); }

/* supply stays reachable even mid-negotiation */
.goal-holders { display: flex; align-items: center; gap: 12px; width: 100%;
  background: none; border: 0; padding: 10px 0 0; text-align: left; }
.goal-holders-t { flex: 1; font-size: 13.5px; color: var(--t1); font-weight: 500; }
.goal-holders:hover .goal-holders-t { text-decoration: underline; }
.goal-holders-c { color: var(--faint); font-size: 17px; }

/* the watchlist: one row per card, deliberately light */
.gwatch { padding: 4px 0; }
.gwatch-r { display: flex; align-items: center; gap: 12px; padding: 10px 14px;
  border-bottom: 1px solid var(--line-soft); flex-wrap: wrap; }
.gwatch-r:last-child { border-bottom: 0; }
.gwatch-b { flex: 1; min-width: 0; }
.gwatch-n { font-size: 14px; font-weight: 600; line-height: 1.25; }
.gwatch-i { font-size: 12px; color: var(--faint); margin-top: 1px; }
.gwatch-a { display: flex; align-items: center; gap: 10px; }
.gwatch-h { font-size: 12.5px; }
.gwatch-live { padding: 4px 10px; font-size: 12px; }
.gwatch-m { background: none; border: 0; color: var(--faint); font-size: 16px;
  line-height: 1; padding: 4px 6px; border-radius: 6px; }
.gwatch-m:hover { background: var(--panel-2); color: var(--text); }
.gwatch-menu { flex: 0 0 100%; display: flex; gap: 8px; padding: 4px 0 6px; }

/* ---- trade binder: a digital binder, not a table ---- */
.bnd { display: grid; grid-template-columns: repeat(auto-fill, minmax(156px, 1fr)); gap: 16px; }
.bnd-c { padding: 16px 12px 14px; display: flex; flex-direction: column; align-items: center;
  text-align: center; transition: transform .14s ease, box-shadow .14s ease; }
.bnd-c:hover { transform: translateY(-2px); border-color: var(--t2);
  box-shadow: 0 6px 14px rgba(0,0,0,.36), 0 18px 40px rgba(0,0,0,.32); }
.bnd-n { font-size: 14px; font-weight: 600; margin-top: 11px; line-height: 1.25; overflow-wrap: anywhere; }
.bnd-i { font-size: 12px; color: var(--faint); margin-top: 3px; }
.bnd-int { margin-top: 10px; font-size: 12.5px; color: var(--t1); font-weight: 600; }
.bnd-int.none { color: var(--faint); font-weight: 400; }

/* ---- partners: relationships ---- */
.pt { padding: 20px; margin-bottom: 18px; }
.pt-top { display: flex; gap: 14px; align-items: flex-start; }
.pt-av { width: 58px; height: 58px; border-radius: 16px; flex: 0 0 auto; display: flex;
  align-items: center; justify-content: center; color: #FFF; font-family: 'Archivo';
  font-weight: 700; font-size: 17px; }
.pt-n { font-size: 18px; font-weight: 700; line-height: 1.2; }
.pt-c { font-size: 13.5px; color: var(--muted); margin-top: 2px; }
.pt-stats { display: flex; gap: 14px; margin-top: 18px; padding: 14px 4px;
  border-top: 1px solid var(--line-soft); border-bottom: 1px solid var(--line-soft); }
.pt-s { flex: 1; }
.pt-s-n { font-size: 25px; font-weight: 700; color: var(--t1); line-height: 1; letter-spacing: -.02em; }
.pt-s-l { font-size: 11.5px; color: var(--muted); margin-top: 4px; line-height: 1.4; }
.pt-hist { font-size: 13px; color: var(--muted); margin-top: 13px; padding-top: 12px;
  border-top: 1px solid var(--line-soft); }
.pt-cards { display: flex; gap: 7px; margin-top: 13px; overflow-x: auto; padding-bottom: 2px; }

/* ---- deal ---- */
.dl-hero { padding: 22px; display: flex; gap: 20px; align-items: flex-start; margin-bottom: 16px; }
/* the named stage rail — horizontal where it fits, a vertical stepper when it
   doesn't. Never anonymous bars. */
.sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.rail { display: flex; gap: 4px; list-style: none; margin: 16px 0 0; padding: 0; }
.rail-s { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center;
  gap: 5px; padding-top: 12px; position: relative; border-top: 3px solid var(--line); }
.rail-s.done { border-top-color: var(--t2); }
.rail-s.current { border-top-color: var(--t1); }
.rail-n { width: 20px; height: 20px; border-radius: 50%; font-size: 11px;
  font-family: 'IBM Plex Mono', monospace; display: flex; align-items: center;
  justify-content: center; border: 1px solid var(--line); color: var(--muted); }
.rail-s.done .rail-n { background: var(--t1-bg); border-color: var(--accent-line); color: var(--t1); }
.rail-s.current .rail-n { background: var(--t1); border-color: var(--t1); color: #FFF; font-weight: 700; }
.rail-l { font-size: 11.5px; line-height: 1.4; text-align: center; color: var(--muted);
  overflow-wrap: anywhere; }
/* In an expanded deal the rail has the full card width, so labels break between
   words at worst — never letter by letter, which is what overflow-wrap:anywhere
   was doing when the rail was squeezed into a narrow column. */
/* HIERARCHY WHILE A DEAL IS OPEN.

   The card is the subject, so its name gets the full width of the block rather
   than sharing a row with the six-step rail. Previously the identity column and
   the tracker competed for the same space and both lost: names broke to three
   lines ("Rayquaza / Gold / Star") while stage labels shrank to near-illegible
   columns, on a card with plenty of width to spare.

   Reading order becomes: identity, then status, then the rail as secondary
   context, then the workspace. Nothing about the lifecycle changes — the six
   steps, their names and their order are untouched. */
.goal.deal-open .goal-b { display: flex; flex-direction: column; min-width: 0; }
.goal.deal-open .goal-n { font-size: 26px; margin-top: 8px;
  /* Let a long name use the room it has instead of hyphenating into a column. */
  overflow-wrap: normal; word-break: normal; hyphens: none; }
.goal.deal-open .goal-i { font-size: 14.5px; margin-top: 6px; }
/* The rail is context, so it is separated rather than interleaved. */
.goal.deal-open .goal-rail { margin-top: 18px; }
.goal.deal-open .rail-l { overflow-wrap: normal; word-break: normal; hyphens: none; }
.goal.deal-open .rail { gap: 8px; }
.goal.deal-open .rail-s { min-width: 0; }
.rail-s.done .rail-l { color: var(--text); }
.rail-s.current .rail-l { color: var(--t1); font-weight: 700; }
@media (max-width: 560px) {
  /* Stack rather than shrink the labels past legibility. */
  .rail { flex-direction: column; gap: 0; }
  .rail-s { flex-direction: row; align-items: center; gap: 10px; padding: 8px 0 8px 0;
    border-top: 0; border-left: 3px solid var(--line); padding-left: 12px; }
  .rail-s.done { border-left-color: var(--t2); border-top-color: transparent; }
  .rail-s.current { border-left-color: var(--t1); border-top-color: transparent; }
  .rail-l { font-size: 13px; text-align: left; }
}
.stage-n { font-size: 12px; color: var(--t1); font-weight: 600; margin-bottom: 3px;
  font-family: 'Archivo'; letter-spacing: .06em; text-transform: uppercase; }
.turn { padding: 17px 18px; border-radius: 14px; margin-bottom: 16px; }
.turn.me { background: var(--accent-bg); }
.turn.partner { background: var(--amber-bg); }
.turn.none { background: var(--line-soft); }
.turn-w { font-family: 'Archivo'; font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
  font-weight: 700; margin-bottom: 5px; }
.turn.me .turn-w { color: var(--accent); } .turn.partner .turn-w { color: var(--amber); }
.turn-t { font-size: 15px; line-height: 1.45; }
.sec { padding: 20px; margin-bottom: 16px; }
.sec-h { font-family: 'Archivo'; font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
  font-weight: 700; color: var(--muted); margin-bottom: 12px; }
.row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
  padding: 9px 0; border-bottom: 1px solid var(--line-soft); font-size: 14.5px; }
.row:last-child { border-bottom: 0; }
.row .k { color: var(--muted); }
.row.tot { font-weight: 700; border-top: 1px solid var(--line); margin-top: 4px; padding-top: 12px; }
.pick { display: flex; gap: 13px; align-items: center; padding: 12px; border: 1px solid var(--line);
  border-radius: 13px; margin-bottom: 10px; width: 100%; text-align: left; background: var(--panel-2);
  transition: border-color .14s ease, background .14s ease; }
.pick.on { border-color: var(--accent); background: var(--accent-bg); }
.pick-b { flex: 1; min-width: 0; }

/* ---- tabs: browsing one partner's shelf, or filtering your binder ---- */
.tabs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 16px; }
.tabb { flex: 0 0 auto; background: var(--panel-2); border: 1px solid var(--line); border-radius: 999px;
  padding: 8px 14px; font-size: 13.5px; font-weight: 600; color: var(--muted); }
.tabb.on { background: var(--accent); border-color: var(--accent); color: #FFF; }
.tabb.on .faint { color: rgba(255,255,255,.75); }
.act-2 { display: flex; gap: 8px; margin-top: 10px; }
.act-2 .btn { flex: 1; }
/* management sits in the header, out of the forward path */
.goal-hd { display: flex; align-items: flex-start; gap: 10px; }
.goal-hd > div:first-child { flex: 1; min-width: 0; }
.goal-edit-b { background: none; border: 1px solid transparent; color: var(--faint);
  font-size: 17px; line-height: 1; padding: 6px 9px; border-radius: 8px; flex: 0 0 auto; }
.goal-edit-b:hover { background: var(--panel-2); border-color: var(--line); color: var(--text); }
.goal-menu { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px;
  padding: 12px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 11px; }
.goal-stop { color: var(--danger); border-color: var(--line); }
.goal-stop:hover { border-color: var(--danger); }
.btn.danger { background: var(--danger); border-color: var(--danger); color: #FFF; }

/* the rail sits between the action and the receipt */
.goal-rail { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line-soft); }

/* who the deal is with — stated once, at the top of the active block */
.goal-with { display: flex; flex-direction: column; gap: 7px; padding-bottom: 13px;
  margin-bottom: 12px; border-bottom: 1px solid var(--accent-line); }
.goal-with-l { font-family: 'Archivo'; font-size: 11px; letter-spacing: .11em;
  text-transform: uppercase; font-weight: 700; color: var(--t1); }
.goal-with-p { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.goal-with-n { font-size: 16px; font-weight: 700; color: var(--text); }
.goal-with-b { font-size: 10.5px; padding: 2px 8px; }

/* ============================================================================
   THE DEAL WORKSPACE — light, scoped.

   Goals, Trade Binder and Trusted Partners stay dark: that is browsing, and the
   artwork carries it. A deal is close reading — prices, percentages, card lists,
   a conversation — so it gets a light, high-clarity treatment. The tokens are
   overridden ONLY within .dw, so nothing else in the app shifts. */
/* No token overrides here any more: the workspace's palette IS the app's
   palette now, so this rule only carries the workspace's own layout. */
.goal.deal-open, .dw {
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  /* room for the persistent bar */
  padding-bottom: calc(74px + env(safe-area-inset-bottom));
}
/* An expanded Goal IS the deal, so it takes the deal's light treatment: the
   whole card becomes the bright close-reading surface, and the browsing pages
   around it stay exactly as they were. Without this the flattened inline
   sections showed the dark browsing card through them. */
.goal.deal-open {
  background: var(--panel);
  color: var(--text);
  border-color: var(--line);
  min-height: 0;
  padding-bottom: 0;
}
.goal.deal-open .goal-n, .goal.deal-open .sec-h { color: var(--text); }
.dw .card { box-shadow: 0 1px 2px rgba(22,32,42,.05), 0 4px 14px rgba(22,32,42,.05); }
.dw .btn { box-shadow: none; }
.dw .art.ph { background: var(--panel-2); }

/* 1. deal context — compact enough for a phone */
.dw-ctx { display: flex; gap: 13px; align-items: flex-start; padding: 14px; margin-top: 14px; }
.dw-ctx-b { flex: 1; min-width: 0; }
.dw-ctx-n { font-family: 'Archivo'; font-size: 18px; font-weight: 700; line-height: 1.2;
  letter-spacing: -.01em; }
.dw-ctx-i { font-size: 12.5px; color: var(--muted); margin-top: 2px; }
.dw-ctx-p { display: flex; align-items: center; gap: 8px; margin-top: 9px; }
.dw-ctx-pn { font-size: 13.5px; font-weight: 600; }

/* 2. compact progress */
.dw-prog { padding: 14px 12px 12px; margin-top: 12px; }
.rail.compact { gap: 2px; }
.rail.compact .rail-s { padding-top: 9px; gap: 4px; }
.rail.compact .rail-n { width: 18px; height: 18px; font-size: 10px; }
.rail.compact .rail-l { font-size: 11px; }

/* 3. guidance */
.dw-guide { margin-top: 12px; padding: 13px 15px; border-radius: 12px;
  background: var(--accent-bg); border: 1px solid var(--accent-line); }
.dw-guide.partner { background: var(--amber-bg); border-color: var(--line); }
.dw-guide.none { background: var(--panel-2); border-color: var(--line); }
.dw-guide-w { font-family: 'Archivo'; font-size: 11px; letter-spacing: .1em;
  text-transform: uppercase; font-weight: 700; color: var(--t1); margin-bottom: 4px; }
.dw-guide.partner .dw-guide-w { color: var(--amber); }
.dw-guide-t { font-size: 14.5px; line-height: 1.45; }

/* 4. the stage owns the page */
.dw-stage { margin-top: 14px; }
.dw-flow { margin-top: 14px; }

/* 6. persistent action bar */
.dw-bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 35; display: flex;
  gap: 9px; padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
  background: rgba(255,255,255,.97); border-top: 1px solid var(--line);
  backdrop-filter: blur(8px); }
.dw-bar-chat { flex: 0 1 auto; white-space: nowrap; }
.dw-bar-go { flex: 1; }
.dw-bar-wait { flex: 1; display: flex; align-items: center; justify-content: center;
  font-size: 13.5px; color: var(--muted); }

/* 7. chat drawer */
.dw-chat-ovl { align-items: flex-end; }
.dw-chat { background: var(--panel); color: var(--text); width: 100%; max-width: 560px;
  border-radius: 18px 18px 0 0; max-height: 86vh; display: flex; flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom); }
.dw-chat-h { display: flex; align-items: center; gap: 10px; padding: 15px 16px;
  border-bottom: 1px solid var(--line-soft); font-weight: 700; font-size: 15px; }
.dw-chat-x { margin-left: auto; background: none; border: 0; font-size: 24px; line-height: 1;
  color: var(--faint); padding: 0 4px; }
.chat-bare { padding: 14px 16px 16px; overflow-y: auto; }
.chat-bare .chat-scroll { max-height: 46vh; }

@media (min-width: 900px) {
  /* Desktop keeps the bar inline rather than pinned across the whole viewport. */
  .dw-bar { position: sticky; bottom: 0; margin: 16px -34px 0; padding-left: 34px;
    padding-right: 34px; border-radius: 0; }
  .dw-chat-ovl { align-items: center; }
  .dw-chat { border-radius: 16px; max-height: 78vh; }
}

/* development-only simulator — deliberately unlike a MetYet product control */
.sim { margin: 6px 0 14px; border: 1px dashed var(--line); border-radius: 11px; }
.sim-t { display: flex; align-items: center; gap: 9px; width: 100%; background: none;
  border: 0; padding: 10px 13px; font-size: 12.5px; color: var(--muted); text-align: left; }
.sim-tag { font-family: 'Archivo'; font-size: 9px; letter-spacing: .1em; text-transform: uppercase;
  font-weight: 700; color: var(--amber); background: var(--amber-bg); padding: 2px 6px;
  border-radius: 4px; }
.sim-turn { margin-left: auto; font-size: 11.5px; }
.sim-body { padding: 0 13px 13px; }
.sim-note { font-size: 11.5px; margin-bottom: 9px; }
.sim-acts { display: flex; flex-wrap: wrap; gap: 7px; }
.sim-done { font-size: 12px; color: var(--t1); margin-top: 9px; }

/* the shared conversation */
.chat-scroll { max-height: 320px; overflow-y: auto; padding: 4px 0 10px; }
.chat-empty { font-size: 13.5px; line-height: 1.5; padding: 18px 2px; }
.chat-m { max-width: 84%; margin-bottom: 10px; }
.chat-m.mine { margin-left: auto; }
.chat-who { font-size: 11px; color: var(--faint); margin-bottom: 3px; }
.chat-m.mine .chat-who { text-align: right; }
.chat-body { font-size: 14px; line-height: 1.45; padding: 9px 12px; border-radius: 12px;
  background: var(--panel-2); border: 1px solid var(--line); overflow-wrap: anywhere; }
.chat-m.mine .chat-body { background: var(--accent-bg); border-color: var(--accent-line); }
.chat-ev { display: flex; align-items: center; gap: 9px; margin: 12px 0; }
.chat-ev-r { flex: 1; height: 1px; background: var(--line-soft); }
.chat-ev-t { font-size: 11.5px; color: var(--muted); text-align: center; }
.chat-composer { display: flex; flex-direction: column; gap: 8px; padding-top: 10px;
  border-top: 1px solid var(--line-soft); }
.chat-composer .btn { align-self: flex-end; }

/* the receipt, collapsed until asked for */
.rc-wrap { margin-top: 14px; border-top: 1px solid var(--line-soft); }
.rc-toggle { display: flex; align-items: center; gap: 10px; width: 100%; background: none;
  border: 0; padding: 13px 0 4px; text-align: left; }
.rc-toggle-t { font-family: 'Archivo'; font-size: 11px; letter-spacing: .1em;
  text-transform: uppercase; font-weight: 700; color: var(--muted); }
.rc-toggle-s { font-size: 12px; margin-left: auto; color: var(--muted); }
.rc-chev { color: var(--faint); font-size: 17px; transition: transform .16s ease;
  display: inline-block; }
.rc-chev.on { transform: rotate(90deg); color: var(--t1); }
.rc-wrap .rc { border-top: 0; padding-top: 4px; margin-top: 0; }

.goal-edit { margin-top: 16px; padding-top: 13px; border-top: 1px solid var(--line-soft); }
.rowb { width: 100%; background: none; border: 0; border-bottom: 1px solid var(--line-soft);
  text-align: left; }
.rowb:hover { background: var(--panel-2); }
/* derived goal state — describes reality, never stored */
.state { font-family: 'Archivo'; font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
  font-weight: 700; padding: 3px 8px; border-radius: 5px; }
.state.seeking { background: var(--panel-2); color: var(--muted); border: 1px solid var(--line); }
.state.negotiating { background: var(--t1-bg); color: var(--t1); border: 1px solid var(--accent-line); }
.state.satisfied { background: #E7F4EA; color: #1B6B36; border: 1px solid #BEE0C8; }

/* ---- bottom navigation: consumer, thumb-reachable ---- */
.nav { position: fixed; left: 0; right: 0; bottom: 0; background: rgba(10,16,20,.94);
  backdrop-filter: blur(8px); border-top: 1px solid var(--line); display: flex;
  padding: 8px 0 max(8px, env(safe-area-inset-bottom)); z-index: 30; }
.nav-i { flex: 1; background: none; border: 0; display: flex; flex-direction: column;
  align-items: center; gap: 4px; padding: 5px 0; color: var(--faint); }
.nav-i.on { color: var(--t1); }
/* Status is never colour alone: the active tab also carries a marker. */
.nav-i.on .nav-ic { position: relative; }
.nav-i.on .nav-ic::after { content: ""; position: absolute; left: 50%; bottom: -5px;
  transform: translateX(-50%); width: 14px; height: 2px; border-radius: 1px;
  background: var(--t1); }
.nav-ic { display: flex; }
.nav-l { font-size: 11px; font-weight: 600; }
.nav-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }

/* ---- sheet ---- */
.ovl { position: fixed; inset: 0; background: rgba(0,0,0,.62); z-index: 40; display: flex;
  align-items: flex-end; justify-content: center; }
.sheet { background: var(--panel); width: 100%; max-width: 560px; border-radius: 20px 20px 0 0;
  max-height: 90vh; overflow-y: auto; padding: 22px 18px calc(22px + env(safe-area-inset-bottom)); }
.sheet-t { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
.sheet-s { font-size: 14px; color: var(--muted); margin-bottom: 18px; }

/* ---- desktop: more room, never more density ---- */
@media (min-width: 900px) {
  .mc { padding-bottom: 0; display: flex; }
  .nav { position: sticky; top: 0; bottom: auto; height: 100vh; width: 232px; flex-direction: column;
    align-items: stretch; border-top: 0; border-right: 1px solid var(--line); padding: 26px 14px;
    background: var(--panel); backdrop-filter: none; }
  .nav-i { flex: 0 0 auto; flex-direction: row; gap: 12px; justify-content: flex-start;
    padding: 12px 14px; border-radius: 10px; font-size: 15px; }
  .nav-i.on { background: var(--accent-bg); }
  .nav { border-right: 1px solid var(--line); }
  .nav-l { font-size: 15px; }
  .mc-main { flex: 1; min-width: 0; }
  .pg { max-width: 800px; padding: 46px 38px 70px; }
  /* An open Deal Flow takes most of the workspace right of the nav, while the
     page keeps its normal gutters. Collapsed goals inside it stay compact
     because .goal has no width of its own — only the page grew. */
  .pg.pg-wide { max-width: 1240px; }
  .pg-t { font-size: 34px; }
  .bnd { grid-template-columns: repeat(auto-fill, minmax(184px, 1fr)); gap: 22px; }
  .ovl { align-items: center; }
  .sheet { border-radius: 18px; max-width: 520px; }
}
`;

/* ============================ SHARED PIECES ============================ */

/* Card artwork stands in for a real image. Even at the smallest size it always
   carries the card's name, so a screen never degrades into blank plates. */
function Art({ card, size = "lg", copy }) {
  const [failed, setFailed] = useState(false);
  /* ONE IMAGE-SOURCE RULE: the actual front photo of THIS copy if it exists,
     otherwise the stock/reference artwork, otherwise the identity plate. Once
     actual photos exist the stock image stops being shown here, so there is
     never a question of which picture is the physical card. */
  const actual = copy && copy.photos && copy.photos.front && copy.photos.back
    ? copy.photos.front : null;
  const src = actual || artUrl(card.csvId);
  /* Artwork is the point of a collecting product, so it gets real images. But it
     is never the card's identity: if the image is slow, blocked or missing the
     plate still says which card this is, at the same dimensions, so a grid never
     collapses into blank boxes and nothing shifts when it does load. */
  if (!src || failed) {
    return (
      <div className={"art " + size + " ph"} role="img" aria-label={cardFull(card)} title={cardFull(card)}>
        <span className="ph-n">{card.name}</span>
        <span className="ph-s">{cardLine(card)}</span>
        <span className="ph-s">{gradeLine(card)}</span>
      </div>
    );
  }
  return (
    <img className={"art " + size} src={src} alt={cardFull(card)} title={cardFull(card)}
      loading="lazy" decoding="async" onError={() => setFailed(true)} />
  );
}

const initials = (s) => s.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function Face({ partner, size = 30 }) {
  return (
    <span className="face" title={partner.name}
      style={{ background: partner.tone, width: size, height: size }}>
      {initials(partner.name)}
    </span>
  );
}

function Sheet({ title, sub, onClose, children, footer }) {
  return (
    <div className="ovl" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-t disp">{title}</div>
        {sub && <div className="sheet-s">{sub}</div>}
        {children}
        {footer && <div style={{ display: "flex", gap: 10, marginTop: 20 }}>{footer}</div>}
      </div>
    </div>
  );
}

/* One row of the deal's progress. Read-only: stages advance when the required
   action happens, never because someone tapped ahead. */
/* The five stages, always named. A collector should never have to decode a bar:
   each step carries its number, its label and its state, on every surface. The
   states come from the same projection the receipt uses. */
/* THE PURSUIT RAIL — six steps, of which five are a negotiation.

   Reviewing a specific copy is where chasing it begins, so it is step 1. It is
   NOT an opportunity stage: `review` is passed when the collector is still
   looking at the card, and the settlement states for steps 2-6 continue to come
   from the canonical receipt, which knows about five. */
function Track({ stage, o, st, compact, review }) {
  const r = D.receiptForOpportunity(o || { stage, trade: { cards: [] } }, {
    binderById: st && st.binderById, cardById: st && st.cardById,
    partnerById: st && st.partnerById });
  /* Step 1 is settled the moment a deal exists — the collector has decided. */
  const first = { id: "review-card", n: 1, label: "Review Card",
    state: review ? "current" : "done" };
  const rest = r.stages.map((x) => ({ ...x, n: x.n + 1,
    state: review ? "todo" : x.state }));
  const steps = [first, ...rest];
  const at = steps.findIndex((x) => x.state === "current");
  return (
    <>
      <ol className={"rail" + (compact ? " compact" : "")}
        aria-label={`Step ${at + 1} of ${steps.length}: ${steps[at] ? steps[at].label : ""}`}>
        {steps.map((s2) => (
          <li key={s2.id} className={"rail-s " + s2.state}
            aria-current={s2.state === "current" ? "step" : undefined}>
            <span className="rail-n" aria-hidden="true">{s2.n}</span>
            <span className="rail-l">{s2.label}</span>
            <span className="sr">{s2.state === "done" ? "complete"
              : s2.state === "current" ? "current" : "not started"}</span>
          </li>
        ))}
      </ol>
      {!compact && <div className="faint" style={{ fontSize: 13.5, marginTop: 10 }}>{STAGE_BLURB[stage]}</div>}
    </>
  );
}

function Turn({ o, st }) {
  const t = st.turnFor(o);
  const who = t.who === "me" ? "Your move" : t.who === "partner" ? "Waiting on them" : "Nothing to do";
  return (
    <div className={"turn " + (t.who || "none")}>
      <div className="turn-w">{who}</div>
      <div className="turn-t">{t.what}</div>
    </div>
  );
}

/* ============================ GOALS ============================
   The first screen, and the reason the app exists. Cards lead: large artwork,
   identity beneath, tier as a quiet label. A goal with nothing happening is a
   normal state, not a gap to be filled, so it reads calmly rather than nagging. */

/* ------------------------------------------------------- REVIEW HARNESS (dev)

   A compact index of the seeded review scenarios: one Primary Goal at each
   active stage, the goal meant to be driven through the lifecycle, and the
   promotion case. Renders ONLY under METYET_DEV=1, so the production Collector
   experience is untouched — there is no gated-off markup in a normal build
   because the component returns null before rendering anything.

   It navigates and resets; it does not edit state. Stage names shown here are
   read from the canonical derivation, never stored on the harness. */
function ReviewPanel({ st, go }) {
  const [note, setNote] = useState("");
  if (!DEMO) return null;
  /* Index every stage example, not just the seeded ones: Select Trade and
     Fulfillment are covered by Casey's pre-existing deals, and a stage index
     that silently omitted them would defeat the point. Review-noted goals are
     always listed; other goals appear when they are the example for a stage
     nothing else covers. */
  const noted = st.goals.filter((g) => REVIEW_ANY_NOTE.test(g.note || ""));
  const covered = new Set(noted.map((g) => {
    const o = st.openOppForGoal(g.id); return o && o.stage;
  }).filter(Boolean));
  const fill = st.goals.filter((g) => {
    if (REVIEW_ANY_NOTE.test(g.note || "")) return false;
    const o = st.openOppForGoal(g.id);
    if (!o || covered.has(o.stage)) return false;
    covered.add(o.stage);
    return true;
  });
  const mine = [...noted, ...fill].sort((a, b) => {
    const oa = st.openOppForGoal(a.id), ob = st.openOppForGoal(b.id);
    return DEAL_STEPS.indexOf(oa && oa.stage) - DEAL_STEPS.indexOf(ob && ob.stage);
  });
  if (!mine.length) return null;

  const row = (g) => {
    const o = st.openOppForGoal(g.id);
    const c = st.cardById(g.cardId);
    const t = o ? st.turnFor(o) : null;
    return (
      <div key={g.id} className="rvw-r">
        <span className="rvw-stage">{o ? STAGE[o.stage].label : g.tier === "secondary" ? "Secondary" : "No deal"}</span>
        <button className="link rvw-n" onClick={() => (o
          ? go({ v: "deal", oppId: o.id })
          : go({ v: "start", goalId: g.id }))}>
          {c.name}
        </button>
        {t && <span className="faint rvw-w">{t.who === "me" ? "your move" : t.who === "partner" ? "waiting" : ""}</span>}
      </div>
    );
  };

  const rd = st.reviewGoal();
  const rdOpp = rd ? st.openOppForGoal(rd.id) : null;
  const rdStage = rdOpp ? rdOpp.stage : null;
  return (
    <div className="rvw">
      <div className="rvw-h">
        <span className="rvw-tag">Dev</span>
        Review scenarios
      </div>
      <div className="rvw-b">
        {mine.map(row)}
      </div>
      {rd && (
        <>
          {/* STAGE PICKER — a fixture loader, not a lifecycle simulation. Each
              button REBUILDS the demo deal at that stage from the canonical seed
              builder, so the upstream terms are derived rather than faked.
              Switching stages discards edits; that is the point of a fixture.
              To walk the lifecycle for real, use the progression deal below with
              the TP simulator instead. */}
          <div className="rvw-sec">
            <div className="rvw-sec-h">Demo deal stage</div>
            <div className="rvw-stages">
              {DEAL_STEPS.map((sid) => (
                <button key={sid} className={"btn sm rvw-st"
                  + (rdStage === sid ? " on" : "")}
                  aria-pressed={rdStage === sid}
                  onClick={() => {
                    const id = st.resetReviewDeal(sid);
                    setNote(id ? `Demo deal rebuilt at ${STAGE[sid].label}.`
                      : "Could not rebuild.");
                  }}>{STAGE[sid].label}</button>
              ))}
            </div>
            <div className="rvw-note-l">
              Rebuilds the demo fixture at that stage. Edits are not kept — walk
              the lifecycle on the progression deal instead.
            </div>
          </div>
          <div className="rvw-a">
            <button className="btn sm" onClick={() => {
              const id = st.resetReviewDeal();
              setNote(id ? "Demo deal reset to Agree on Price." : "Could not reset.");
            }}>Reset demo deal</button>
            {note && <span className="faint rvw-note">{note}</span>}
          </div>
        </>
      )}
    </div>
  );
}

function Goals({ st, go }) {
  const { goals } = st;
  const [adding, setAdding] = useState(false);
  /* ONE EXPANDED DEAL AT A TIME. Presentation state, held here rather than in
     each card so opening one collapses the other. Switching touches no deal. */
  const [openDeal, setOpenDeal] = useState(null);
  /* `force` opens rather than toggles: selecting a copy should always reveal the
     workspace, whatever the card's previous state was. */
  const toggleDeal = (id, force) => setOpenDeal((cur) => (force ? id : (cur === id ? null : id)));
  const primary = goals.filter((g) => g.tier === "primary");
  const secondary = goals.filter((g) => g.tier === "secondary");

  return (
    /* The page widens ONLY while a Deal Flow is open: browsing stays a narrow,
       comfortable reading column, and the deal gets room to actually work in. */
    <div className={"pg" + (openDeal ? " pg-wide" : "")}>
      <div className="pg-h">
        <div>
          <h1 className="pg-t disp">Goals</h1>
          <div className="pg-s">What you're looking for, and where each one stands.</div>
        </div>
        {/* Stating a want must not require finding supply first. */}
        <div className="pg-act">
          <button className="btn sm pri" onClick={() => setAdding(true)}>Add goal</button>
        </div>
      </div>

      <ReviewPanel st={st} go={go} />

      {/* PRIMARY — the working area. Full cards, deal progress, next action. */}
      <div className="gsec-h">
        <span className="gsec-t">Primary</span>
        <span className="gsec-n">{primary.length}</span>
        <span className="gsec-s">Actively chasing</span>
      </div>
      {primary.length === 0 ? (
        <div className="card gsec-empty">
          <div style={{ fontWeight: 600, fontSize: 15 }}>Nothing on your active list</div>
          <div className="faint" style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.5 }}>
            A primary goal is a card you're actively trying to get. It's where your
            partners' attention goes, and where deals start.
          </div>
          <button className="btn pri" style={{ marginTop: 14 }} onClick={() => setAdding(true)}>
            Add your first goal
          </button>
        </div>
      ) : primary.map((g) => (
        <GoalCard key={g.id} g={g} st={st} go={go}
          open={openDeal === g.id} onToggle={toggleDeal} />
      ))}

      {/* SECONDARY — a watchlist. Compact rows, no deal machinery. */}
      <div className="gsec-h" style={{ marginTop: 30 }}>
        <span className="gsec-t">Also looking for</span>
        <span className="gsec-n">{secondary.length}</span>
        <span className="gsec-s">Keeping an eye out</span>
      </div>
      {secondary.length === 0 ? (
        <div className="faint gsec-none">Nothing here yet.</div>
      ) : (
        <div className="card gwatch">
          {secondary.map((g) => <WatchRow key={g.id} g={g} st={st} go={go} />)}
        </div>
      )}

      {adding && <AddGoalPicker st={st} go={go} onClose={() => setAdding(false)} />}
    </div>
  );
}

/* Search the canonical catalog and state a want. Supply is irrelevant here —
   a goal is the collector's intent, not a shopping selection. Creation itself
   is delegated to AddGoalSheet, so there is one goal-creation path. */
function AddGoalPicker({ st, go, onClose }) {
  const [identity, setIdentity] = useState(null);

  /* Stage two: intent. Only asked once MetYet knows exactly which card this is —
     a tier is meaningless until the target is unambiguous. */
  if (identity) {
    const c = identity.card;
    const add = (tier) => { st.addGoalForIdentity(identity, tier); onClose(); };
    return (
      <Sheet title="How much are you chasing this one?" sub={cardFull(c)} onClose={onClose}
        footer={<button className="btn wide" onClick={() => setIdentity(null)}>Back</button>}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <Art card={c} size="lg" />
        </div>
        <button className="btn pri wide" style={{ marginBottom: 10 }}
          onClick={() => add("primary")}>Primary — actively looking</button>
        <button className="btn wide" onClick={() => add("secondary")}>
          Secondary — keeping an eye out
        </button>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 14 }}>
          We'll check every one of your partners for this exact card, and tell you
          when one of them has it.
        </div>
      </Sheet>
    );
  }

  /* Stage one: the SAME identity search the Trusted Partner uses. A goal is
     defined by the same criteria as any other card in MetYet. */
  return (
    <Sheet title="Add a goal"
      sub="Find the exact card you're after — a partner doesn't need to have it yet."
      onClose={onClose}>
      <CardIdentityPicker
        catalog={st.catalog}
        Art={Art}
        confirmLabel="Continue"
        searchPlaceholder="Search by card name, set, or number..."
        onCancel={onClose}
        onResolved={(id) => setIdentity(st.resolveIdentity(id))}
      />
    </Sheet>
  );
}

/* Renders the derived receipt. Every gating decision was made in the domain, so
   this component only chooses how to say "not yet". */
function Receipt({ o, st, expanded, inline }) {
  const r = D.receiptForOpportunity(o, {
    binderById: st.binderById, cardById: st.cardById, partnerById: st.partnerById });
  if (!r) return null;
  const pend = (v, word) => (v == null || v === "" ? <span className="rc-p">{word}</span> : v);

  return (
    <div className={"rc" + (expanded ? " rc-x" : "")}>
      {/* The disclosure above already names this section; a second heading would
          only repeat it. */}
      {!inline && <div className="rc-h">Deal Flow</div>}
      {r.stages.map((s2) => (
        <div key={s2.id} className={"rc-s " + s2.state}>
          <span className="rc-n" aria-hidden="true">{s2.n}</span>
          <div className="rc-b">
            <div className="rc-t">
              {s2.label}
              {/* State is named, never colour alone. */}
              <span className="rc-st">{s2.state === "done" ? "Settled"
                : s2.state === "current" ? "Deciding now" : "Not yet"}</span>
            </div>

            {s2.id === "agree-price" && (
              <dl className="rc-f">
                <dt>Partner</dt><dd>{pend(s2.partner, "—")}</dd>
                <dt>Purchase price</dt>
                <dd>{s2.price != null ? money(s2.price)
                  : <span className="rc-p">{s2.state === "current" ? "Negotiating" : "Pending"}</span>}</dd>
              </dl>
            )}

            {s2.id === "select-trade" && (
              <dl className="rc-f">
                <dt>Your cards</dt>
                <dd>{s2.cards.length
                  ? s2.cards.map((c) => c.name).join(", ")
                  : <span className="rc-p">{s2.state === "pending" ? "Pending" : "Not selected"}</span>}</dd>
              </dl>
            )}

            {s2.id === "value-trade" && (
              <dl className="rc-f">
                {s2.cards.length > 0 && s2.cards.some((c) => c.tradeValue != null)
                  ? s2.cards.map((c) => (
                    <React.Fragment key={c.binderId}>
                      <dt>{c.name}</dt>
                      <dd>{c.tradeValue != null
                        ? `${money(c.agreedMarket)} × ${pct(c.agreedPercent)} = ${money(c.tradeValue)}`
                        : <span className="rc-p">Not valued</span>}</dd>
                    </React.Fragment>))
                  : <><dt>Trade value</dt><dd><span className="rc-p">
                      {s2.state === "pending" ? "Pending" : "Not valued"}</span></dd></>}
                {s2.total != null && s2.total > 0 && (
                  <><dt>Total</dt><dd>{money(s2.total)}</dd></>)}
              </dl>
            )}

            {s2.id === "deal" && (
              <dl className="rc-f">
                <dt>Balance</dt>
                <dd>{s2.balance != null ? money(Math.abs(s2.balance)) + (s2.balance >= 0 ? " to them" : " to you")
                  : <span className="rc-p">{s2.state === "pending" ? "Pending" : "Not finalized"}</span>}</dd>
                {s2.finalAdj != null && (<><dt>Final negotiation</dt><dd>{money(s2.finalAdj)}</dd></>)}
              </dl>
            )}

            {s2.id === "fulfillment" && (
              <dl className="rc-f">
                <dt>How</dt><dd>{pend(s2.method, "Not scheduled")}</dd>
                <dt>When</dt>
                <dd>{s2.date ? fmtDate(s2.date) + (s2.time ? ` at ${s2.time}` : "")
                  : <span className="rc-p">Not scheduled</span>}</dd>
                <dt>Where</dt><dd>{pend(s2.location, "Not scheduled")}</dd>
                <dt>Handoff</dt>
                <dd>{s2.state === "pending" ? <span className="rc-p">Pending</span>
                  : s2.collectorDone && s2.partnerDone ? "Both confirmed"
                  : s2.collectorDone ? "You confirmed"
                  : s2.partnerDone ? "They confirmed"
                  : <span className="rc-p">Not confirmed</span>}</dd>
              </dl>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* A secondary goal is a watchlist entry: identity, coverage, and the ability to
   promote it. Deliberately no deal block — a secondary goal is not being worked. */
function WatchRow({ g, st, go }) {
  const c = st.cardById(g.cardId);
  const holders = st.partnersWith(g.cardId);
  const live = st.openOppForGoal(g.id);
  const [menu, setMenu] = useState(false);

  return (
    <div className="gwatch-r">
      <Art card={c} size="xs" />
      <div className="gwatch-b">
        <div className="gwatch-n">{c.name}</div>
        <div className="gwatch-i">{cardLine(c)} · {gradeLine(c)}</div>
      </div>
      <div className="gwatch-a">
        {/* A secondary goal is not a working area, but a live negotiation must
            never be stranded: show a compact route into it. */}
        {live && (
          <button className="btn sm pri gwatch-live"
            onClick={() => go({ v: "deal", oppId: live.id })}>
            {nextActionFor(live, st).cta || "Open deal"}
          </button>
        )}
        {holders.length > 0 ? (
          <button className="link gwatch-h" onClick={() => go({ v: "start", goalId: g.id })}>
            {holders.length} {holders.length === 1 ? "partner" : "partners"}
          </button>
        ) : <span className="faint gwatch-h">No one has it</span>}
        <button className="gwatch-m" aria-label={"Edit " + c.name}
          aria-expanded={menu} onClick={() => setMenu(!menu)}>&#8943;</button>
      </div>
      {menu && (
        <div className="gwatch-menu">
          <button className="btn sm" onClick={() => st.setTier(g.id, "primary")}>
            Move to Primary
          </button>
          <button className="btn sm" disabled={!!live}
            title={live ? "Finish or stop the negotiation first" : undefined}
            onClick={() => st.removeGoal(g.id)}>Remove</button>
        </div>
      )}
    </div>
  );
}

/* Says which image the collector is looking at, so the two are never confused. */
function PhotoNote({ inv, st }) {
  const phase = st.photoState(inv);
  if (phase === "ready") {
    return <div className="ph-note actual">Photos of actual card · Front &amp; Back</div>;
  }
  if (phase === "requested") {
    return (
      <div className="ph-note">
        <span className="ph-tag">Stock image</span>
        Photos requested — waiting on {st.partnerById(inv.partnerId).name}.
      </div>
    );
  }
  return (
    <div className="ph-note">
      <span className="ph-tag">Stock image</span>
      See the actual card before negotiating price.
    </div>
  );
}

/* ------------------------------------------------------------- REVIEW CARD

   Step one of the pursuit: deciding whether this specific copy is worth
   negotiating over. Actual photographs are the strongest way to answer that,
   which is why asking for them is the emphasis — but they are not a condition
   of proceeding, and the collector may price a card they cannot fully see if
   they understand that is what they are doing. A grade already carries much of
   a card's condition; a raw card carries none of it. */
function ReviewCard({ g, pursuit, partner, st, go }) {
  const c = st.cardById(g.cardId);
  const inv = pursuit.copy;
  const photos = (inv && inv.photos) || {};
  const [confirm, setConfirm] = useState(false);
  const graded = !!(c.grade && !D.isRaw(c));

  const face = (label, url) => (
    <div className={"rv-face" + (url ? " has" : "")}>
      <div className="rv-face-l">{label}</div>
      <div className="rv-face-b">
        {url ? <img className="rv-img" src={url} alt={label + " of the actual card"} />
          : <span className="rv-awaiting">Awaiting photo</span>}
      </div>
    </div>
  );

  return (
    <div className="idf rv">
      <div className="idf-work two">
        <div className="idf-task">
          <div className="idf-h">
            {pursuit.who === "me" ? "Your move" : "Waiting on " + partner.name}
          </div>
          <div className="idf-guide-t">
            {pursuit.ready
              ? `${partner.name} has added photos of the actual card. Have a look, then decide whether to make an offer.`
              : pursuit.asked
                ? `You asked to see the actual card before making an offer. You'll be able to review the photos here when ${partner.name} adds them.`
                /* Nothing has been asked for yet: the next move is genuinely
                   the collector's, so say what it is. */
                : `${partner.name} hasn't photographed this copy. Ask to see it before you price it, or make an offer on what you can see.`}
          </div>

          <div className="rv-h">
            {pursuit.ready ? "Photos of actual card" : "Actual card photos"}
          </div>
          <div className="rv-faces">
            {face("Front", photos.front)}
            {face("Back", photos.back)}
          </div>
          {!pursuit.ready && (
            <div className="rv-note">
              {graded
                ? `This copy is graded ${c.grade}, so much of its condition is already established. Photos still show the slab, cert and eye appeal.`
                : "This copy is raw, so its condition is not established by a grade. Photos are the only way to judge it."}
            </div>
          )}

          <div className="idf-action">
            {pursuit.ready ? (
              <button className="btn pri idf-action-go"
                onClick={() => go({ v: "offer", goalId: g.id, partnerId: partner.id })}>
                Make an offer
              </button>
            ) : (<>
              {/* Asking to see the card is the emphasis while it is unseen —
                  unless nobody has asked yet AND the grade already carries the
                  condition, in which case the two are genuinely balanced. */}
              {!pursuit.asked && (
                <button className={"btn idf-action-go" + (graded ? "" : " pri")}
                  style={{ marginBottom: 10 }}
                  onClick={() => st.requestPhotos(inv)}>
                  Request actual photos
                </button>
              )}
              {/* The quieter path: proceeding without seeing the card is allowed,
                  and confirmed once so the collector knows what they are missing. */}
              <button className={"btn idf-action-go" + (graded ? " pri" : "")}
                onClick={() => setConfirm(true)}>
                Make an offer without photos
              </button>
            </>)}
          </div>
        </div>

        <div className="idf-side">
          <div className="idf-h">Conversation</div>
          <DealChat partnerId={partner.id} cardId={g.cardId} st={st} embedded headless />
        </div>
      </div>

      {confirm && (
        <div className="ovl" onClick={() => setConfirm(false)}>
          <div className="sheet rv-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-h">Make an offer without actual photos?</div>
            <div className="rv-confirm-t">
              {partner.name} hasn't added photos of this copy yet. You can wait for
              them, or continue and price it on what you can see.
            </div>
            <div className="act-2" style={{ marginTop: 16 }}>
              <button className="btn" onClick={() => setConfirm(false)}>Keep waiting</button>
              <button className="btn pri" onClick={() => {
                setConfirm(false);
                go({ v: "offer", goalId: g.id, partnerId: partner.id });
              }}>Continue without photos</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------- ACTUAL COPY PHOTO VIEWER

   One physical copy, one face at a time. The face itself and the front/back
   switch are the SHARED primitives both personas use; only the shell around
   them is the Collector's own. The Trusted Partner's PhotoLightbox could not be
   reused whole because it is wired to that app's ctx/setModal and its inventory
   actions — but everything below that shell is now common to both.

   It reads; it never writes. No price, stage, turn or draft passes through it,
   which is why the collector can open it mid-counter and find their typed
   amount exactly where they left it. */
function CopyPhotoViewer({ copy, card, side, onSide, onClose }) {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        onSide(side === "front" ? "back" : "front");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [side, onSide, onClose]);

  return (
    <div className="ovl" onClick={onClose}>
      <div className="sheet lbx" role="dialog" aria-modal="true"
        aria-label={"Actual photos of " + card.name}
        onClick={(e) => e.stopPropagation()}>
        <div className="sheet-h">{card.name}</div>
        <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>
          {cardLine(card)} · {gradeLine(card)}
        </div>
        <div className="lbx-b">
          <ActualCardPhoto photos={copy.photos} side={side} cardLabel={card.name} />
        </div>
        <div className="act-2" style={{ marginTop: 16 }}>
          <FaceSwitch photos={copy.photos} side={side} onSide={onSide} />
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function GoalCard({ g, st, go, open, onToggle }) {
  const c = st.cardById(g.cardId);
  const holders = st.partnersWith(g.cardId);
  const live = st.openOppForGoal(g.id);
  /* One pursuit, two phases: reviewing a copy, then negotiating over it. Both
     render the same workspace on the Goal — only the second is a deal. */
  const pursuit = st.pursuitFor(g.id);
  const reviewing = !!pursuit && pursuit.kind === "review";
  const partner = live ? st.partnerById(live.partnerId)
    : reviewing ? st.partnerById(pursuit.partnerId) : null;
  const state = st.stateOf(g.id);
  const [menu, setMenu] = useState(false);
  /* Which face is on screen, or null. Purely local: inspecting evidence is not
     a lifecycle event, and nothing about it belongs in the domain. */
  const [viewPhotos, setViewPhotos] = useState(null);
  /* The exact physical copy this pursuit is bound to — the same invId the deal
     names, so the photos can only ever be of the card being negotiated. */
  const boundCopy = pursuit && pursuit.invId ? st.inventoryCopy(pursuit.invId) : null;
  const copyHasPhotos = !!boundCopy && D.INVARIANTS.copyPhotographed(boundCopy.photos);
  /* Detail-on-demand, and purely local: a disclosure is not canonical state, and
     it resets whenever Goals is re-entered. */
  const [openReceipt, setOpenReceipt] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const act = live ? nextActionFor(live, st) : null;
  const settled = live ? D.receiptForOpportunity(live, {
    binderById: st.binderById, cardById: st.cardById, partnerById: st.partnerById })
    .stages.filter((x) => x.state === "done").length : 0;

  return (
    <div className={"card goal" + (open && live ? " deal-open" : "")}>
      <div className="goal-top">
        {/* ANCHORING THE NEGOTIATION. Browsing a list of goals and deciding what
            to pay for one physical copy are different acts, so once a pursuit is
            open the card steps up to the product's existing xl preset. No new
            size was invented: xl already existed, and its 178:249 keeps the
            card's proportions. */}
        <Art card={c} size={pursuit ? "xl" : "lg"} />
        <div className="goal-b">
          <div className="goal-hd">
            <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
              <span className="tier p">Primary</span>
              <span className={"state " + state}>{GOAL_STATE[state]}</span>
            </div>
            {/* Management, not forward progress: quiet, and out of the way. */}
            <button className="goal-edit-b" aria-expanded={menu}
              aria-label={"Edit goal: " + c.name}
              onClick={() => setMenu(!menu)}>&#8943;</button>
          </div>
          <div className="goal-n disp">{c.name}</div>
          <div className="goal-i">{cardLine(c)}</div>
          <div className="goal-i">{gradeLine(c)}</div>
          <div className="faint" style={{ fontSize: 13, marginTop: 6 }}>
            On your list since {fmtDate(g.since)}
          </div>

          {/* COPY EVIDENCE, where the card is identified. Actual photographs
              belong to the physical copy, so once they exist they stay
              inspectable at every stage — a price is a judgement about what
              those photos show. This is a way to LOOK, never a way to ask:
              requesting photos belongs to Review Card, and Agree on Price does
              not reach backwards for it. When there is nothing to inspect the
              fact is simply stated, with no disabled control. */}
          {pursuit && (
            <div className="cx-ph">
              {copyHasPhotos ? (
                <button className="btn sm cx-ph-btn"
                  aria-label={"View actual photos of this " + c.name + " from "
                    + (partner ? partner.name : "this partner")}
                  onClick={() => setViewPhotos("front")}>
                  View actual card photos
                </button>
              ) : (
                <div className="cx-ph-none">
                  Actual card photos not available
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* THE RAIL GETS ITS OWN ROW. It used to be a third flex sibling inside
          .goal-top, with `flex: 1 1 320px` against an identity column of basis
          0 — so the rail claimed most of the free space and the name was left
          with a couple of hundred pixels, breaking "Rayquaza Gold Star" across
          three lines on a card that had room to spare. Identity and artwork now
          own the top row; where the deal stands is its own region beneath,
          which is also the order someone reads in: what this is, then how far
          along it is. */}
      {(live || reviewing) && (
        <div className="goal-rail">
          <Track stage={live ? live.stage : "agree-price"} o={live} st={st}
            review={reviewing} />
        </div>
      )}

      {menu && (
        <div className="goal-menu">
          <button className="btn sm" onClick={() => st.setTier(g.id, "secondary")}>
            Move to Secondary
          </button>
          <button className="btn sm" disabled={!!live}
            title={live ? "Finish or stop the negotiation first" : undefined}
            onClick={() => st.removeGoal(g.id)}>Remove goal</button>
          {live && (
            <button className="btn sm goal-stop" onClick={() => { setMenu(false); setConfirmStop(true); }}>
              {st.dealAgreed(live) ? "Cancel agreed deal" : "Stop negotiation"}
            </button>
          )}
        </div>
      )}

      {/* 1a. REVIEWING A COPY — the pursuit before any offer. Same workspace,
             same disclosure, one step earlier on the rail. */}
      {reviewing && !live && (
        <div className="goal-live">
          <button className="goal-deal" aria-expanded={open}
            aria-label={(open ? "Hide" : "Show") + " Deal Flow with " + partner.name
              + " — Review Card"}
            onClick={() => onToggle(open ? null : g.id)}>
            <span className="goal-deal-m">
              <span className="goal-deal-s">Deal Flow · Review Card</span>
              <span className="goal-deal-p">
                <Face partner={partner} size={20} />
                <span className="goal-deal-pn">{partner.name}</span>
              </span>
            </span>
            <span className="goal-deal-r">
              <span className={"goal-deal-t" + (pursuit.who === "me" ? " mine" : "")}>
                {pursuit.who === "me" ? "Your move" : "Waiting on " + partner.name}
              </span>
              <span className={"goal-deal-c" + (open ? " on" : "")} aria-hidden="true">&#8250;</span>
            </span>
          </button>

          {open && (
            <div className="goal-dw">
              <ReviewCard g={g} pursuit={pursuit} partner={partner} st={st} go={go} />
            </div>
          )}
        </div>
      )}

      {/* 1. WHAT DO I NEED TO DO NOW? */}
      {live && (
        <div className="goal-live">

          {/* THE GOAL BECOMES THE DEAL. Once an offer exists, the Goal's working
              experience is the Deal Flow — so it opens HERE rather than sending
              the collector somewhere else. Collapsed by default: stage, partner,
              turn and the canonical five-stage track, and nothing further. The
              stage shown is the canonical opportunity stage, not a second
              indicator, and no future-stage terms are exposed. */}
          {/* THE SUMMARY ROW IS THE DISCLOSURE. One control opens and closes the
              workspace, and it stays at the top of the expanded Goal so the
              collector never scrolls to find a way out. Stage, partner and turn
              are stated here ONCE — no separate header repeats them below. */}
          <button className="goal-deal" aria-expanded={open}
            aria-label={(open ? "Hide" : "Show") + " Deal Flow with " + partner.name
              + " — " + STAGE[live.stage].label}
            onClick={() => onToggle(open ? null : g.id)}>
            <span className="goal-deal-m">
              <span className="goal-deal-s">Deal Flow · {STAGE[live.stage].label}</span>
              <span className="goal-deal-p">
                <Face partner={partner} size={20} />
                <span className="goal-deal-pn">{partner.name}</span>
              </span>
            </span>
            <span className="goal-deal-r">
              <span className={"goal-deal-t" + (act.cta ? " mine" : "")}>
                {act.cta ? "Your move" : act.waiting || "Open"}
              </span>
              <span className={"goal-deal-c" + (open ? " on" : "")} aria-hidden="true">&#8250;</span>
            </span>
          </button>
          {/* RE-ENTRY, now in place. An active deal is always expandable, whoever
              owns the turn: having no stage action means there is nothing to DO,
              not that the deal or its conversation becomes unreachable.
              Expanding is presentation only — it mutates nothing. */}
          {open && (
            <div className="goal-dw">
              <InlineDeal o={live} st={st} go={go} />
            </div>
          )}
        </div>
      )}

      {/* 3. WHAT HAS THIS DEAL ESTABLISHED? Collapsed until asked for. */}
      {live && (
        <div className="rc-wrap">
          <button className="rc-toggle" aria-expanded={openReceipt}
            onClick={() => setOpenReceipt(!openReceipt)}>
            <span className="rc-toggle-t">Deal Flow</span>
            <span className="faint rc-toggle-s">{settled} of 5 settled</span>
            <span className={"rc-chev" + (openReceipt ? " on" : "")} aria-hidden="true">&#8250;</span>
          </button>
          {openReceipt && <Receipt o={live} st={st} inline />}
        </div>
      )}

      {/* 4. WHO ELSE COULD HELP ME? Available, but subordinate. */}
      {holders.length === 0 ? (
        <div className="goal-avail faint">
          None of your partners have this yet. They'll see you're looking.
        </div>
      ) : (live || reviewing) ? (
        /* A pursuit is under way, so the Goal workspace above owns every forward
           action. What remains here is supply as CONTEXT: who else has the card,
           one tap away — never a second place to make the same offer. */
        <button className="goal-holders" onClick={() => go({ v: "start", goalId: g.id })}>
          <span className="faces">
            {holders.slice(0, 4).map((h) => <Face key={h.partner.id} partner={h.partner} />)}
          </span>
          <span className="goal-holders-t">
            See all {holders.length} partner{holders.length === 1 ? "" : "s"} with this card
          </span>
          <span className="goal-holders-c" aria-hidden="true">&#8250;</span>
        </button>
      ) : (
        <div className="goal-supply">
          <div className="goal-supply-h">
            {holders.length} {holders.length === 1 ? "partner has" : "partners have"} this card
          </div>
          {holders.map((h) => {
            /* Per partner — talking to one says nothing about the others. */
            const talked = st.hasThreadAbout(g.cardId, h.partner.id);
            return (
              <div key={h.partner.id} className="gs-row">
                <Face partner={h.partner} size={30} />
                <div className="gs-b">
                  <button className="link gs-n"
                    onClick={() => go({ v: "partner", partnerId: h.partner.id })}>
                    {h.partner.name}
                  </button>
                  <div className="gs-c">{h.partner.city}</div>
                </div>
                <div className="gs-a">
                  <span className="gs-ask mono">{money(h.ask)}</span>
                  <button className="btn sm"
                    onClick={() => go({ v: "chat", goalId: g.id, partnerId: h.partner.id, cardId: g.cardId })}>
                    {talked ? "Continue chatting" : "Chat"}
                  </button>
                  {/* THE ROWS ARE THE CHOICE. The collector is already looking at
                      every partner who has the card, so choosing one belongs
                      here rather than behind a sheet that asks the same question
                      again. Selecting binds this exact copy and expands the Goal
                      in place — no route change, so nothing scrolls away. */}
                  <button className="btn sm pri"
                    onClick={() => { st.reviewCopy(h.inv); onToggle(g.id, true); }}>
                    Review Card
                  </button>
                </div>
              </div>
            );
          })}

        </div>
      )}

      {viewPhotos && boundCopy && (
        <CopyPhotoViewer copy={boundCopy} card={c} side={viewPhotos}
          onSide={setViewPhotos} onClose={() => setViewPhotos(null)} />
      )}

      {confirmStop && live && (
        <StopDeal o={live} st={st} onClose={() => setConfirmStop(false)} />
      )}
    </div>
  );
}

/* ============================================================================
   TRUSTED PARTNER SIMULATOR — DEVELOPMENT ONLY

   The Collector flow depends on the partner responding, which makes it awkward
   to exercise without switching personas. This exposes the partner's side of
   the CURRENT stage so a tester can stay in the Collector experience.

   THE RULE: it exposes TP actions, it never implements TP behaviour. Every
   button below calls the same canonical store action the real Trusted Partner
   workspace calls. Nothing here writes a field directly to force a visual
   state, and no action is offered that the partner could not actually take
   right now — the options are derived from the opportunity itself.

   Hidden unless explicitly enabled, so it cannot appear in a normal build. */
/* The one canonical flag — browser-safe, resolved in shared/dev-flag.js. */
const DEV = SHARED_DEV;
/* Scenario loading and reset are how a tester reaches a late stage at all;
   simulating the other side of a negotiation is not, and stays on DEV. */
const DEMO = SHARED_DEMO;

/* Which seeded goal is which review scenario. Matched on the seed note rather
   than an index-derived id, so appending to the seed cannot break the harness.
   Nothing here renders unless DEV is on, so no internal vocabulary can reach a
   production surface. */
const REVIEW_DEAL_NOTE = /^Review deal/;
const REVIEW_PROMOTE_NOTE = /^Review promotion/;
const REVIEW_ANY_NOTE = /^Review (deal|fixture|promotion)/;

/* ------------------------------------------------ DEMO: PARTNER RESPONSE

   Pilot testing is a one-person job: without this, moving a deal forward means
   switching persona, finding the matching workflow, acting, and switching back.
   This offers the partner's move where the tester already is.

   It is NOT the engineering simulator wearing product clothes. The rule it
   obeys is that every response goes through the SAME canonical action the real
   Trusted Partner seat uses — so a demo move cannot reach a state the product
   could not reach, and cannot skip a validation the real seat enforces.

   That rule is also why this control is smaller than it might look like it
   should be. Only price agreement currently has a shared canonical action
   (store.actions.agreePrice). The later stages' partner moves — accepting
   proposed cards, proposing values, agreeing the balance, confirming handoff —
   live inside the Trusted Partner component itself, built on its own patch
   helper with its own guards. Reaching them from here would mean duplicating
   that decision logic, which is exactly the thing that makes a demo lie. So
   where no canonical action exists, this control says so and points at the
   real seat rather than offering a button that fakes it. */
function DemoPartnerResponse({ o, st }) {
  if (!DEMO || !o) return null;
  const partner = st.partnerById(o.partnerId);
  const them = partner ? partner.name : "the partner";
  const [note, setNote] = useState("");

  /* THE PARTNER'S MOVE, WHERE THE TESTER ALREADY IS.

     A pilot is usually one person, so without this every step means switching
     persona, finding the matching screen, acting, and switching back. This
     offers the counterparty's move in place.

     It is not a shortcut past the rules. Every response calls the SAME canonical
     action the real Trusted Partner seat calls, with `by: "tp"` — so a demo move
     cannot reach a state the product could not, cannot skip a validation, and
     cannot agree on the collector's behalf. Only moves that are valid RIGHT NOW
     are offered; when it is the collector's turn, this shows nothing. */
  const A = st.simulate;
  const responses = [];
  const say = (t) => setNote(t);

  if (!D.isTerminal(o)) {
    if (o.stage === "agree-price") {
      const last = D.lastEntry(o.priceThread);
      if (last && last.by === "collector" && last.type !== "accept") {
        responses.push([`${them} accepts ${money(last.amount)}`, () => {
          const res = A.agreePrice({ oppId: o.id, amount: last.amount, by: "partner", at: AT });
          say(res && res.refused ? "That copy is already committed to another deal."
            : `${them} agreed at ${money(last.amount)}.`);
        }]);
      }
    }

    /* Select Trade: the partner decides which proposed cards to include. */
    if (o.stage === "select-trade" && o.trade && o.trade.submitted) {
      const undecided = (o.trade.cards || []).filter((c) => c.inclusion === "proposed");
      if (undecided.length) {
        responses.push([`${them} accepts ${undecided.length} proposed card${undecided.length === 1 ? "" : "s"}`, () => {
          A.reviewTradeCards({ oppId: o.id, decision: "accepted", at: AT });
          say(`${them} accepted the cards — on to agreeing what they're worth.`);
        }]);
      }
    }

    /* Value Trade: market first, then percentage, one card at a time. */
    if (o.stage === "value-trade") {
      const active = D.acceptedTradeCards(o);
      const needsMarket = active.find((c) => c.agreedMarket == null);
      if (needsMarket) {
        const name = (st.cardById(needsMarket.cardId) || {}).name || "that card";
        if (needsMarket.collectorMarket != null) {
          responses.push([`${them} accepts ${money(needsMarket.collectorMarket)} for ${name}`, () => {
            A.tradeMarketRespond({ oppId: o.id, tradeCardId: needsMarket.id, by: "tp",
              action: "accept", at: AT });
            say(`Market value agreed for ${name}.`);
          }]);
        } else {
          const b = st.binderById(needsMarket.binderId);
          const ref = b && b.market ? b.market : 1000;
          responses.push([`${them} proposes ${money(ref)} for ${name}`, () => {
            A.tradeMarketRespond({ oppId: o.id, tradeCardId: needsMarket.id, by: "tp",
              action: "propose", amount: ref, at: AT });
            say(`${them} put ${money(ref)} on ${name}.`);
          }]);
        }
      } else {
        const needsPct = active.find((c) => c.agreedPercent == null);
        if (needsPct) {
          const name = (st.cardById(needsPct.cardId) || {}).name || "that card";
          if (needsPct.collectorPercent != null) {
            responses.push([`${them} accepts ${pct(needsPct.collectorPercent)} for ${name}`, () => {
              A.tradePercentRespond({ oppId: o.id, tradeCardId: needsPct.id, by: "tp",
                action: "accept", at: AT });
              say(`Trade % agreed for ${name}.`);
            }]);
          } else {
            responses.push([`${them} proposes 80% for ${name}`, () => {
              A.tradePercentRespond({ oppId: o.id, tradeCardId: needsPct.id, by: "tp",
                action: "propose", percent: 0.8, at: AT });
              say(`${them} proposed 80% on ${name}.`);
            }]);
          }
        }
      }
    }

    /* Deal: the partner's own agreement, and nothing else. */
    if (o.stage === "deal") {
      const d = o.deal || {};
      if (d.agreedAdj == null && d.collectorAdj != null) {
        responses.push([`${them} accepts ${money(d.collectorAdj)}`, () => {
          A.dealAdjustRespond({ oppId: o.id, by: "tp", action: "accept", at: AT });
          say(`${them} accepted your figure.`);
        }]);
      }
      if (!d.tpAgreed) {
        responses.push([`${them} agrees to this deal`, () => {
          A.dealAgree({ oppId: o.id, by: "tp", at: AT });
          say(`${them} has agreed. The deal moves on once you have too.`);
        }]);
      }
    }

    /* Fulfillment: propose the plan, then hand over once it is agreed. */
    if (o.stage === "fulfillment") {
      const f = o.fulfillment || {};
      const planOnTable = !!f.proposedAt && !f.revisionRequested;
      if (!planOnTable) {
        responses.push([`${them} proposes a handoff plan`, () => {
          A.proposeFulfillment({ oppId: o.id,
            plan: { method: "Meet in person", where: "Duluth, Minnesota", when: "Saturday, 2pm" },
            at: AT });
          say(`${them} proposed how, where and when.`);
        }]);
      } else if (f.collectorConfirmedPlan && !D.FULFILLMENT.handedOff(f)) {
        responses.push([`${them} confirms handoff`, () => {
          A.confirmHandoff({ oppId: o.id, by: "tp", at: AT });
          say(`${them} handed the card over.`);
        }]);
      }
    }
  }

  if (!responses.length) return null;

  return (
    <div className="dpr">
      <div className="dpr-h">
        <span className="dpr-tag">Demo</span>
        <span className="dpr-l">Partner response</span>
      </div>
      <div className="dpr-b">
        {responses.map(([label, run]) => (
          <button key={label} className="btn sm" onClick={run}>{label}</button>
        ))}
      </div>
      {note && <div className="dpr-n">{note}</div>}
      <div className="dpr-f">
        Acts as {them}, through the same actions their own screen uses.
        Switch persona for the full Trusted Partner workflow.
      </div>
    </div>
  );
}

function SimulateTP({ o, st }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  if (!DEV) return null;

  const A = st.simulate;
  const partner = st.partnerById(o.partnerId);
  const them = partner ? partner.name : "the partner";
  const turn = D.nextActor(o);
  const cards = D.acceptedTradeCards(o);
  const did = (t) => { setNote(t); };

  /* Only what the partner can genuinely do at this stage, in this state. */
  const actions = [];
  if (o.stage === "agree-price") {
    const last = D.lastEntry(o.priceThread);
    if (last && last.by === "collector") {
      actions.push(["Counter at 96%", () => {
        A.patchOpportunity(o.id, (x) => ({ ...x, priceThread: [...x.priceThread,
          { by: "partner", type: "counter", amount: Math.round(x.listedPrice * 0.96), at: AT }] }));
        did("Countered");
      }]);
      actions.push(["Accept the offer", () => {
        /* Even the simulator settles through the canonical action: a dev tool
           that could commit an already-committed copy would be simulating
           something that cannot happen. */
        const res = A.agreePrice({ oppId: o.id, amount: last.amount, by: "partner", at: AT });
        did(res && res.refused === D.REFUSE.copyCommitted
          ? "That copy is already committed to another deal"
          : "Accepted — moved to Select Trade");
      }]);
    }
  }
  if (o.stage === "select-trade" && o.trade && o.trade.submitted
      && (o.trade.cards || []).some((c) => c.inclusion === "proposed")) {
    actions.push(["Accept proposed cards", () => {
      A.patchOpportunity(o.id, (x) => ({ ...x, trade: { ...x.trade,
        cards: x.trade.cards.map((c) => (c.inclusion === "proposed"
          ? { ...c, inclusion: "accepted" } : c)) } }));
      did("Reviewed the cards");
    }]);
  }
  if (o.stage === "value-trade") {
    const open2 = cards.filter((c) => !D.cardSettled(c));
    if (open2.length) actions.push([`Propose values for ${open2.length} card${open2.length === 1 ? "" : "s"}`, () => {
      A.patchOpportunity(o.id, (x) => ({ ...x, trade: { ...x.trade,
        cards: x.trade.cards.map((c) => (D.cardSettled(c) ? c
          : { ...c, tpMarket: c.tpMarket != null ? c.tpMarket : 200, tpPercent: 0.8 })) } }));
      did("Proposed values");
    }]);
  }
  if (o.stage === "deal" && !(o.deal && o.deal.tpAgreed)) {
    actions.push(["Agree the balance", () => {
      /* Through the canonical action, acting AS the partner — the simulator
         stands in for that seat rather than reaching past the rule. */
      A.dealAgree({ oppId: o.id, by: "tp", at: AT });
      did("Agreed");
    }]);
  }
  if (o.stage === "fulfillment" && !(o.fulfillment && o.fulfillment.tpHandoff)) {
    actions.push(["Confirm handoff", () => {
      A.confirmHandoff({ oppId: o.id, by: "tp", at: AT });
      did("Handed over");
    }]);
  }
  if (D.isActive(o)) {
    actions.push(["Send a message", () => {
      A.sendMessage({ collectorId: o.collectorId, partnerId: o.partnerId,
        cardId: o.cardId, by: "tp",
        text: "Sounds good — let me know.", oppId: o.id, at: AT });
      did("Message sent");
    }]);
    actions.push([st.dealAgreed(o) ? "Cancel the agreed deal" : "End the deal", () => {
      A.endOpportunity(o.id, "partner", AT);
      did("Ended");
    }]);
  }

  return (
    <div className="sim">
      <button className="sim-t" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="sim-tag">Dev</span>
        Simulate {them}
        <span className="faint sim-turn">
          {turn.actor === "partner" ? "their move" : turn.actor ? "waiting on you" : "settled"}
        </span>
      </button>
      {open && (
        <div className="sim-body">
          <div className="faint sim-note">
            Every action below calls the same canonical action the real Trusted
            Partner workspace uses.
          </div>
          <div className="sim-acts">
            {actions.length === 0
              ? <span className="faint">Nothing for {them} to do at this stage.</span>
              : actions.map(([label, run]) => (
                <button key={label} className="btn sm" onClick={run}>{label}</button>
              ))}
          </div>
          {note && <div className="sim-done">{note}</div>}
        </div>
      )}
    </div>
  );
}

/* THE SHARED CONVERSATION. The same thread the Trusted Partner reads and writes —
   one per collector + PARTNER + card identity, spanning goals and the whole deal.
   Lifecycle events sit inline with messages, so the record reads chronologically.

   One component serves both a negotiation and a plain conversation with an
   alternative partner: the difference is whether an opportunity happens to be
   attached, never a second chat model. Sending a message NEVER touches deal
   state — it only appends to the thread. */
function DealChat({ o, partnerId, cardId, st, bare, embedded, headless }) {
  const [draft, setDraft] = useState("");
  const [full, setFull] = useState(false);
  const pid = partnerId != null ? partnerId : (o && o.partnerId);
  const cid = cardId != null ? cardId : (o && o.cardId);
  const partner = st.partnerById(pid);
  const thread = st.threadWith(pid, cid);
  const all = thread ? thread.entries : [];
  /* Embedded in a deal, the conversation must not bury the stage work: show the
     tail by default and expand IN PLACE. Chronology is never reordered — this
     is a window onto the canonical thread, not a different ordering of it. */
  const RECENT = 3;
  const hidden = embedded && !full ? Math.max(0, all.length - RECENT) : 0;
  const entries = hidden ? all.slice(all.length - RECENT) : all;
  const them = partner ? partner.name : "them";
  const send = () => {
    if (!draft.trim()) return;
    /* The oppId is passed only when this thread IS the negotiation's thread. */
    st.sendMessage(pid, cid, draft, o && o.partnerId === pid ? o.id : undefined);
    setDraft("");
  };

  return (
    <div className={embedded ? "card sec chat chat-embed" : bare ? "chat chat-bare" : "card sec chat"}>
      {!bare && !headless && <div className="sec-h">Conversation</div>}
      {hidden > 0 && (
        <button className="link chat-more" onClick={() => setFull(true)}>
          Earlier messages ({hidden})
        </button>
      )}
      <div className="chat-scroll">
        {entries.length === 0 ? (
          <div className="faint chat-empty">
            Nothing here yet. Opening this deal doesn't count as reaching out — send
            {" "}{them} a message to start the thread.
          </div>
        ) : entries.map((e) => (e.kind === "event" ? (
          /* Lifecycle events, inline and chronological — the TP's contract. */
          <div key={e.id} className="chat-ev">
            <span className="chat-ev-r" /><span className="chat-ev-t">{e.text}</span>
            <span className="chat-ev-r" />
          </div>
        ) : (
          <div key={e.id} className={"chat-m " + (e.by === "collector" ? "mine" : "theirs")}>
            <div className="chat-who">{e.by === "collector" ? "You" : them}</div>
            <div className="chat-body">{e.text}</div>
          </div>
        )))}
      </div>
      <div className="chat-composer">
        <textarea className="inp" rows={2} value={draft}
          aria-label={"Message " + them + " about this card"}
          placeholder={`Message ${them} about this card…`}
          onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) send(); }} />
        <button className="btn pri sm" disabled={!draft.trim()} onClick={send}>Send</button>
      </div>
    </div>
  );
}

/* Ending a deal is deliberate. Opening this changes nothing; only the explicit
   destructive action calls the canonical endOpportunity. The wording follows the
   canonical distinction the Trusted Partner already makes: a mutually agreed
   deal is CANCELLED, an unagreed one is simply STOPPED. */
function StopDeal({ o, st, onClose }) {
  const agreed = st.dealAgreed(o);
  const partner = st.partnerById(o.partnerId);
  const [busy, setBusy] = useState(false);
  const them = partner ? partner.name : "your partner";
  return (
    <Sheet title={agreed ? "Cancel this agreed deal?" : "Stop this negotiation?"}
      sub={`${STAGE[o.stage].label} with ${them}`}
      onClose={onClose}
      footer={<>
        <button className="btn" style={{ flex: 1 }} onClick={onClose}>
          {agreed ? "Keep the deal" : "Keep negotiating"}
        </button>
        <button className="btn danger" disabled={busy}
          onClick={() => { if (busy) return; setBusy(true); st.endNegotiation(o.id); onClose(); }}>
          {agreed ? "Cancel deal" : "Stop negotiation"}
        </button>
      </>}>
      <div style={{ fontSize: 14.5, lineHeight: 1.55 }}>
        {agreed
          ? `You and ${them} had agreed this one. Cancelling keeps the whole record — every
             price, value and message stays in your history.`
          : `Everything agreed so far stays in your history, and your conversation with
             ${them} is kept. The card goes back on your list, so you can pick it up with
             another partner whenever you like.`}
      </div>
    </Sheet>
  );
}

function Binder({ st, go }) {
  const { binder } = st;
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("all");     // all | interested | <partnerId>
  const withInterest = binder.filter((b) => st.interestIn(b.id).length > 0).length;
  /* Filters read the same interest records the cards do. Nothing is copied onto
     the binder card itself. */
  const shown = binder.filter((b) => {
    if (filter === "all") return true;
    const who = st.interestIn(b.id);
    return filter === "interested" ? who.length > 0 : who.some((i) => i.partnerId === filter);
  });
  const partnersWithInterest = st.partners.filter((p) => st.interestCountFrom(p.id) > 0);

  return (
    <div className="pg">
      <div className="pg-h">
        <div>
          <h1 className="pg-t disp">Trade Binder</h1>
          <div className="pg-s">
            {binder.length} cards you'd put toward a trade
            {withInterest > 0 && <> · {withInterest} a partner would consider</>}
          </div>
        </div>
        <div className="pg-act">
          <button className="btn sm pri" onClick={() => go({ v: "add" })}>Add a card</button>
        </div>
      </div>

      <div className="tabs">
        <button className={"tabb" + (filter === "all" ? " on" : "")} onClick={() => setFilter("all")}>
          All <span className="faint">{binder.length}</span>
        </button>
        <button className={"tabb" + (filter === "interested" ? " on" : "")} onClick={() => setFilter("interested")}>
          Interested <span className="faint">{withInterest}</span>
        </button>
        {partnersWithInterest.map((p) => (
          <button key={p.id} className={"tabb" + (filter === p.id ? " on" : "")} onClick={() => setFilter(p.id)}>
            {p.name} <span className="faint">{st.interestCountFrom(p.id)}</span>
          </button>
        ))}
      </div>

      {binder.length === 0 ? (
        <div className="card empty">
          Your binder is empty.
          <div style={{ marginTop: 8 }}>Cards you add here are what partners can trade against.</div>
        </div>
      ) : (
        shown.length === 0 ? (
          <div className="card empty">No cards match this filter.</div>
        ) : (
        <div className="bnd">
          {shown.map((b) => {
            const c = st.cardById(b.cardId);
            const who = st.interestIn(b.id);
            return (
              <button key={b.id} className="card bnd-c" onClick={() => setOpen(b.id)}>
                <Art card={c} size="md" />
                <div className="bnd-n">{c.name}</div>
                <div className="bnd-i">{cardLine(c)}</div>
                <div className="bnd-i">{gradeLine(c)}</div>
                <div className={"bnd-int" + (who.length ? "" : " none")}>
                  {who.length === 0 ? "No partner has flagged this"
                    : `${who.length} partner${who.length === 1 ? "" : "s"} would consider it`}
                </div>
              </button>
            );
          })}
        </div>
        )
      )}

      {open && <BinderCopy b={binder.find((x) => x.id === open)} st={st} go={go} onClose={() => setOpen(null)} />}
    </div>
  );
}

function BinderCopy({ b, st, onClose, go }) {
  const c = st.cardById(b.cardId);
  const who = st.interestIn(b.id);
  return (
    <Sheet title={c.name} sub={cardFull(c)} onClose={onClose}
      footer={<button className="btn wide" onClick={onClose}>Close</button>}>
      <div style={{ display: "flex", gap: 14, justifyContent: "center", marginBottom: 20 }}>
        {["front", "back"].map((side) => (
          <div key={side} style={{ textAlign: "center" }}>
            <Art card={c} size="lg" />
            <div className="faint" style={{ fontSize: 11, marginTop: 6, textTransform: "uppercase",
              letterSpacing: ".08em", fontFamily: "Archivo", fontWeight: 700 }}>
              Your photo · {side}
            </div>
          </div>
        ))}
      </div>

      <div className="row"><span className="k">Added</span><span>{fmtDate(b.added)}</span></div>
      {b.cert && <div className="row"><span className="k">Certification</span><span className="mono">{b.cert}</span></div>}
      {/* Private. Shown here because it is the collector's own note, and nowhere
          a partner can see it. It is not an asking price. */}
      <div className="row">
        <span className="k">What you think it's worth</span>
        {/* The canonical BinderCopy field. `mine` was the standalone fixture's
            name and no longer exists. */}
        <span className="mono">{money(b.market)}</span>
      </div>
      <div className="faint" style={{ fontSize: 12.5, marginTop: 4 }}>
        Only you can see this. Partners never see your number.
      </div>

      <div className="sec-h" style={{ marginTop: 22 }}>Partner interest</div>
      {who.length === 0 ? (
        <div className="faint" style={{ fontSize: 14 }}>
          No partner has flagged this yet. That's normal — it just means nobody's mentioned it.
        </div>
      ) : (
        <>
          {who.map((i) => (
            <button key={i.partnerId} className="row rowb"
              onClick={() => { onClose(); go({ v: "partner", partnerId: i.partnerId }); }}>
              <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <Face partner={st.partnerById(i.partnerId)} size={26} />
                <span style={{ marginLeft: 8, fontWeight: 500 }}>{st.partnerById(i.partnerId).name}</span>
              </span>
              <span className="faint" style={{ fontSize: 13 }}>{ago(i.at)} ›</span>
            </button>
          ))}
          <div className="faint" style={{ fontSize: 12.5, marginTop: 10 }}>
These partners would consider this card in a trade. That's willingness to look at
            it — not an offer, a reservation, or a commitment.
          </div>
        </>
      )}
    </Sheet>
  );
}

/* ============================ TRUSTED PARTNERS ============================
   People, not vendor records. Each answers: can this person help me with what
   I actually want, and how has working with them gone? */

function Partners({ st, go }) {
  const ranked = useMemo(() => st.partners.map((p) => st.partnerProfile(p.id))
    .sort((a, b) => b.primary - a.primary || b.secondary - a.secondary || b.deals - a.deals),
  [st]);

  return (
    <div className="pg">
      <div className="pg-h">
        <div>
          <h1 className="pg-t disp">Trusted Partners</h1>
          <div className="pg-s">People you trust. Collections that match.</div>
        </div>
      </div>

      {ranked.map((x, i) => (
        <div key={x.partner.id} className="card pt">
          <div className="pt-top">
            <span className="pt-av" style={{ background: x.partner.tone }}>
              {initials(x.partner.name)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="pt-n disp">{x.partner.name}</span>
                {i === 0 && x.primary > 0 && <span className="chip a">Best match</span>}
              </div>
              <div className="pt-c">{x.partner.city}</div>
            </div>
          </div>

          {/* The three numbers a collector actually cares about. */}
          <div className="pt-stats">
            <div className="pt-s">
              <div className="pt-s-n">{x.primary}</div>
              <div className="pt-s-l">of your primary goals</div>
            </div>
            <div className="pt-s">
              <div className="pt-s-n">{x.secondary}</div>
              <div className="pt-s-l">of your secondary goals</div>
            </div>
            <div className="pt-s">
              <div className="pt-s-n">{x.interested}</div>
              <div className="pt-s-l">of your cards they'd consider</div>
            </div>
          </div>

          {x.stock.length > 0 && (
            <div className="pt-cards">
              {x.stock.slice(0, 6).map((s) => (
                <Art key={s.invId || s.cardId} card={st.cardById(s.cardId)} size="sm" />
              ))}
              {x.stock.length > 6 && <span className="chip" style={{ alignSelf: "center" }}>+{x.stock.length - 6}</span>}
            </div>
          )}

          <div className="pt-hist">
            {x.deals > 0
              ? <>{x.deals} deal{x.deals === 1 ? "" : "s"} completed together · known since {fmtDate(x.partner.since)}</>
              : <>No deals yet · known since {fmtDate(x.partner.since)}</>}
          </div>
          <div className="faint" style={{ fontSize: 13.5, marginTop: 8 }}>{x.partner.note}</div>

          <button className="btn wide" style={{ marginTop: 14 }}
            onClick={() => go({ v: "partner", partnerId: x.partner.id })}>
            View collection
          </button>
        </div>
      ))}
    </div>
  );
}

function PartnerDetail({ partnerId, st, go }) {
  const p = st.partnerById(partnerId);
  const x = st.partnerProfile(partnerId);
  const [tab, setTab] = useState("primary");
  const [adding, setAdding] = useState(null);

  /* All browsing is scoped to this partner's inventory. The tabs are four
     different questions about the same shelf. */
  const stock = x.stock;
  const byTier = (tier) => stock.filter((s2) => {
    const g = st.goalFor(s2.cardId);
    return g && g.tier === tier;
  });
  const forYou = st.forYou(partnerId);
  const tabs = [
    { id: "primary", label: "Primary Goals", list: byTier("primary") },
    { id: "secondary", label: "Secondary Goals", list: byTier("secondary") },
    { id: "foryou", label: "For You", list: forYou },
    { id: "all", label: "All Inventory", list: stock },
  ];
  const active = tabs.find((t) => t.id === tab) || tabs[0];

  return (
    <div className="pg">
      <button className="link" onClick={() => go({ v: "partners" })}>← All partners</button>
      <div className="pt-top" style={{ marginTop: 16, marginBottom: 8 }}>
        <span className="pt-av" style={{ background: p.tone }}>{initials(p.name)}</span>
        <div>
          <div className="pt-n disp">{p.name}</div>
          <div className="pt-c">{p.city}</div>
          <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>
            {x.deals} deal{x.deals === 1 ? "" : "s"} together ·{" "}
            {/* Interest is willingness to consider, never demand. */}
            open to {x.interested} of your binder card{x.interested === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={"tabb" + (tab === t.id ? " on" : "")}
            onClick={() => setTab(t.id)}>
            {t.label} <span className="faint">{t.list.length}</span>
          </button>
        ))}
      </div>

      {active.id === "foryou" && (
        <div className="faint" style={{ fontSize: 13, margin: "2px 0 14px" }}>
          Based only on what you've told us you collect:{" "}
          {st.myPrefs().map((t) => PREF_LABEL[t] || t).join(" · ")}
        </div>
      )}

      {active.list.length === 0 ? (
        <div className="card empty">
          {active.id === "foryou"
            ? "Nothing here matches what you collect right now."
            : active.id === "all" ? "Nothing listed right now."
            : `Nothing here is on your ${active.id} list.`}
        </div>
      ) : (
        <div className="bnd">
          {active.list.map((s2) => {
            const c = st.cardById(s2.cardId);
            const g = st.goalFor(s2.cardId);
            const state = g ? st.stateOf(g.id) : null;
            /* Whose deal is it? "Negotiating" is only a dead end if it is not
               with this partner — and even then, only for the OFFER. */
            const liveG = g ? st.openOppForGoal(g.id) : null;
            const isCurrent = !!liveG && liveG.partnerId === partnerId;
            /* The exact physical copy on this partner's shelf — photos belong to
               it, never to the card identity. */
            const inv = st.inventoryCopy(s2.invId);
            return (
              <div key={s2.invId || s2.cardId} className="card bnd-c">
                <Art card={c} size="md" copy={inv} />
                <div className="bnd-n">{c.name}</div>
                {inv && <PhotoNote inv={inv} st={st} />}
                <div className="bnd-i">{cardLine(c)}</div>
                <div className="bnd-i">{gradeLine(c)}</div>
                <div style={{ fontWeight: 700, marginTop: 8 }}>{money(s2.ask)}</div>

                {s2.why && s2.why.length > 0 && (
                  <div className="faint" style={{ fontSize: 11.5, marginTop: 5 }}>
                    {s2.why.map((t) => PREF_LABEL[t] || t).join(" · ")}
                  </div>
                )}

                {g ? (
                  <>
                    <span className={"tier " + (g.tier === "primary" ? "p" : "s")}
                      style={{ marginTop: 9 }}>
                      {g.tier === "primary" ? "Primary" : "Secondary"}
                    </span>
                    {isCurrent && <div className="bnd-int">Your current deal</div>}
                    {state === "negotiating" && !isCurrent && (
                      <div className="bnd-int" style={{ color: "var(--muted)" }}>
                        Negotiating elsewhere — you can still talk
                      </div>
                    )}
                    <div className="act-2">
                      {/* Conversation is always open, whoever the deal is with. */}
                      <button className="btn sm"
                        onClick={() => go({ v: "chat", goalId: g.id, partnerId, cardId: c.id })}>
                        {st.hasThreadAbout(c.id, partnerId) ? "Continue chatting" : "Chat"}
                      </button>
                      {isCurrent ? (
                        <button className="btn sm pri"
                          onClick={() => go({ v: "deal", oppId: liveG.id })}>
                          View Deal
                        </button>
                      ) : state !== "negotiating" ? (
                        <button className="btn sm pri"
                          onClick={() => { st.reviewCopy(inv); go({ v: "goals" }); }}>
                          Review card
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : (
                  /* Discovered inventory can become a goal. Adding one recalculates
                     matches across every partner, not just this one. */
                  <button className="btn sm" style={{ marginTop: 10, width: "100%" }}
                    onClick={() => setAdding(c.id)}>
                    Add to my goals
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {adding && <AddGoalSheet cardId={adding} st={st} onClose={() => setAdding(null)} />}
    </div>
  );
}

/* Adding a goal is the collector stating what they want. Tier is their choice. */
function AddGoalSheet({ cardId, st, onClose, onAdded }) {
  const c = st.cardById(cardId);
  return (
    <Sheet title="Add to your goals" sub={cardFull(c)} onClose={onClose}
      footer={<button className="btn wide" onClick={onClose}>Cancel</button>}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
        <Art card={c} size="lg" />
      </div>
      <div style={{ fontSize: 14, marginBottom: 14 }}>
        How much are you chasing this one?
      </div>
      <button className="btn pri wide" style={{ marginBottom: 10 }}
        onClick={() => { const id = st.addGoal(cardId, "primary"); onClose(); onAdded && onAdded(id); }}>
        Primary — actively looking
      </button>
      <button className="btn wide"
        onClick={() => { const id = st.addGoal(cardId, "secondary"); onClose(); onAdded && onAdded(id); }}>
        Secondary — keeping an eye out
      </button>
      <div className="faint" style={{ fontSize: 12.5, marginTop: 14 }}>
        We'll check every one of your partners for this card, not just this shop.
      </div>
    </Sheet>
  );
}

/* ============================ THE DEAL ============================
   One card, one partner, one stage. Always says whose move it is and what the
   stage means in plain language. Terms already agreed are shown as settled
   history; no stage can reopen them. */

/* ============================================================================
   THE COLLECTOR DEAL WORKSPACE

   A mobile-first shell every stage plugs into:

     deal context  ->  progress  ->  guidance  ->  stage work  ->  action bar

   The stage owns its controls, as before. The action bar does NOT reimplement
   them: each stage registers its primary action here, and the bar renders that
   same handler. One definition, two places it can be pressed.
   ========================================================================= */
/* ====================================================================== INLINE
   DEAL FLOW — the Primary Goal's own working surface.

   PURPOSE-BUILT GEOMETRY. This does NOT reuse the standalone Deal page shell.
   That shell is a page: it owns `min-height: 100vh`, page padding, a fixed
   action bar and its own context header, and every one of those fought the Goal
   card when mounted inside it. Overriding them produced layout that was
   technically inline but read as a page squeezed into a card.

   What IS reused is everything that matters: the same stage components, the
   same `register` contract for the canonical action, the same DealChat on the
   same partner-scoped thread, the same opportunity. No business logic lives
   here — this file section decides placement and nothing else.

   The Goal card supplies the summary row, the rail, the receipt, the partner
   alternatives and the end control; this wrapper supplies only the work area
   between them. */
/* THE CENTRE COLUMN — what this stage has actually established.

   Every field comes from the canonical receipt, whose `reached(i)` guards blank
   out any term belonging to a later stage. Reading only the CURRENT stage's row
   therefore cannot leak future data, and nothing here is invented: when a stage
   genuinely has little to show, the column stays light rather than padded.
   Its heading says whether the stage is settled, which is derived, not stored. */
function StageDetails({ o, st }) {
  const r = D.receiptForOpportunity(o, { binderById: st.binderById,
    cardById: st.cardById, partnerById: st.partnerById });
  if (!r || r.stageIndex < 0) return null;
  const cur = r.stages[r.stageIndex];
  const rows = [];
  const add = (label, value) => rows.push({ label, value });
  const dash = "—";

  if (cur.id === "agree-price") {
    /* The standing figure is the last thing said in the price thread — current
       stage data, not a downstream term. */
    const last = (o.priceThread || [])[o.priceThread.length - 1];
    add("Listed", cur.listed != null ? money(cur.listed) : dash);
    add(last ? (last.by === "collector" ? "Your offer" : "Their counter") : "Offer",
      last && last.amount != null ? money(last.amount) : dash);
    add("Agreed", cur.price != null ? money(cur.price) : dash);
  } else if (cur.id === "select-trade") {
    /* Deliberately empty. Every figure this used to show — how many cards were
       proposed, accepted, still unresolved — is already legible in the card list
       a few inches away, each attached to the card it describes. Counting them
       again in a column was density without information. Other stages keep
       their details, because those summarise terms that are NOT otherwise on
       screen. */
  } else if (cur.id === "value-trade") {
    add("Cards accepted", String(cur.cards.length));
    add("Values agreed",
      String(cur.cards.filter((c) => c.agreedMarket != null && c.agreedPercent != null).length));
    add("Trade value", cur.total != null ? money(cur.total) : dash);
  } else if (cur.id === "deal") {
    const price = r.stages[0].price;
    add("Agreed price", price != null ? money(price) : dash);
    add("Trade value", r.stages[2].total != null ? money(r.stages[2].total) : dash);
    add("Calculated", cur.calculated != null ? money(cur.calculated) : dash);
    add("Balance", cur.balance != null
      ? money(Math.abs(cur.balance)) + (cur.balance >= 0 ? " to them" : " to you") : dash);
  } else if (cur.id === "fulfillment") {
    add("How", cur.method || dash);
    add("Where", cur.location || dash);
    add("When", [cur.date, cur.time].filter(Boolean).join(" · ") || dash);
    add("You", cur.collectorDone ? "Confirmed" : "Not yet");
    add(cur.partner || st.partnerById(o.partnerId).name,
      cur.partnerDone ? "Confirmed" : "Not yet");
  }

  /* A stage with nothing to summarise renders no column at all, rather than an
     empty shell that reserves width in the layout. */
  if (rows.length === 0) return null;

  const settled = rows.every((x) => x.value !== dash && x.value !== "Not yet");
  return (
    <div className="idf-det">
      <div className="idf-h">Details{settled ? "" : " (unsettled)"}</div>
      <dl className="idf-det-l">
        {rows.map((x) => (
          <div className="idf-det-r" key={x.label}>
            <dt className="idf-det-k">{x.label}</dt>
            <dd className="idf-det-v">{x.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function InlineDeal({ o, st, go }) {
  /* Filled by whichever stage is mounted; null while waiting. Identical
     contract to the standalone shell, so stages need no inline special case. */
  const [bar, setBar] = useState(null);
  const register = useCallback((next) => setBar(next), []);

  const p = st.partnerById(o.partnerId);
  const t = st.turnFor(o);
  const short = p ? p.name.split(" ")[0] : "them";
  const stageProps = { o, st, register, go };

  return (
    <div className="idf">
      <div className={"idf-work" + (o.stage === "agree-price" ? " two" : "")}>
        {/* LEFT — the current task. Guidance, the stage's own work, and the one
            canonical action, together, because they are one thought. */}
        <div className="idf-task">
          <div className="idf-h">{t.who === "me" ? "Your move"
            : t.who === "partner" ? `Waiting on ${short}` : "Nothing to do"}</div>
          <div className="idf-guide-t">{t.what}</div>

          <div className="idf-stage">
            {o.stage === "agree-price" && <AgreePrice {...stageProps} />}
            {o.stage === "select-trade" && <SelectTrade {...stageProps} />}
            {o.stage === "value-trade" && <ValueTrade {...stageProps} />}
            {o.stage === "deal" && <DealStage {...stageProps} />}
            {o.stage === "fulfillment" && <Fulfillment {...stageProps} />}
            {o.stage === "completed" && <Completed o={o} />}
          </div>

          {/* Exactly one primary action: the stage registers it, this renders it.
              Stages suppress their own copy whenever a register is supplied. */}
          {/* A stage that presents two genuinely different decisions renders them
              itself; the shell's single slot would have to collapse them into
              one control. */}
          {isOpen(o) && !(bar && bar.own) && (
            <div className="idf-action">
              {bar && bar.run ? (
                <button className="btn pri idf-action-go" disabled={!!bar.disabled}
                  onClick={bar.run}>{bar.label}</button>
              ) : (
                <span className="idf-action-wait">
                  {t.who === "partner" ? `Waiting on ${short}` : "Nothing to send yet"}
                </span>
              )}
            </div>
          )}
        </div>

        {/* CENTRE — what this stage has established, from the canonical receipt.
            Agree on Price is a single decision about one number, so it shows the
            pricing and the conversation and nothing else: a "Details (unsettled)"
            column there could only ever list terms this stage has not reached. */}
        {o.stage !== "agree-price" && (
          <div className="idf-mid">
            <StageDetails o={o} st={st} />
          </div>
        )}

        {/* RIGHT — the canonical conversation, with ending the deal beneath it:
            reachable, but as far from the forward action as the card allows. */}
        <div className="idf-side">
          {/* The column owns the single heading; DealChat is told not to add a
              second one. Two headings existed semantically, not just visually. */}
          <div className="idf-h">Conversation</div>
          <DealChat o={o} partnerId={o.partnerId} cardId={o.cardId} st={st}
            embedded headless />

        </div>
      </div>

      <DemoPartnerResponse o={o} st={st} />
      <SimulateTP o={o} st={st} />
    </div>
  );
}

/* THE ONE ACTIVE-DEAL WORKSPACE. Rendered either as its own page or, when
   `inline`, inside the Primary Goal it belongs to. The prop suppresses page
   chrome only — the back link and the card/partner context the Goal already
   states. Every stage component, action registration, conversation, receipt and
   simulator below is the same code in both cases; nothing is cloned. */
function Deal({ oppId, st, go }) {
  const o = st.opps.find((x) => x.id === oppId);
  const [chat, setChat] = useState(false);
  /* Which face is on screen, or null. Local to the shell, so opening it cannot
     remount the stage below and cannot disturb a half-typed counter. */
  const [viewPhotos, setViewPhotos] = useState(null);

  const [flow, setFlow] = useState(false);
  /* Filled by whichever stage is mounted; null while waiting. */
  const [bar, setBar] = useState(null);
  const register = useCallback((next) => setBar(next), []);

  if (!o) return <div className="pg"><div className="card empty">This deal is no longer open.</div></div>;
  const g = st.goals.find((x) => x.id === o.goalId);
  const c = st.cardById(g.cardId);
  const p = st.partnerById(o.partnerId);
  const t = st.turnFor(o);
  const them = p ? p.name : "them";
  const short = p ? p.name.split(" ")[0] : "them";
  /* THE EXACT COPY THIS DEAL NAMES. Resolved from o.invId alone: not from the
     card, not from the partner, not from the first matching row in inventory —
     a sibling copy's photographs are evidence about a different object. An
     unbound deal simply has nothing to inspect. */
  const boundCopy = o.invId ? st.inventoryCopy(o.invId) : null;
  const copyHasPhotos = !!boundCopy && D.INVARIANTS.copyPhotographed(boundCopy.photos);
  const stageProps = { o, st, register, go };

  return (
    <div className="pg dw">
      {viewPhotos && boundCopy && (
        <CopyPhotoViewer copy={boundCopy} card={c} side={viewPhotos}
          onSide={setViewPhotos} onClose={() => setViewPhotos(null)} />
      )}
      <button className="link" onClick={() => go({ v: "goals" })}>← Goals</button>

      {/* 1. DEAL CONTEXT — compact, and always the first thing read. Inline, the
          Goal has already said which card and which partner this is. */}
      {(
        <div className="card dw-ctx">
          {/* The same scale the Goal's pursuit header uses, so both surfaces
              describe the same physical card the same way. */}
          <Art card={c} size="xl" />
          <div className="dw-ctx-b">
            <div className="dw-ctx-n">{c.name}</div>
            <div className="dw-ctx-i">{cardLine(c)} · {gradeLine(c)}</div>
            <div className="dw-ctx-p">
              <Face partner={p} size={22} />
              <span className="dw-ctx-pn">{them}</span>
            </div>
            {/* COPY EVIDENCE BELONGS TO THE SHELL, not to whichever stage is
                mounted below: the photographs describe the object being traded,
                and stay inspectable from pricing through fulfillment. This is a
                way to LOOK and nothing else — asking for photographs belongs to
                Review Card, which this deal is already past. */}
            <div className="cx-ph">
              {copyHasPhotos ? (
                <button className="btn sm cx-ph-btn"
                  aria-label={"View actual photos of this " + c.name + " from " + them}
                  onClick={() => setViewPhotos("front")}>
                  View actual card photos
                </button>
              ) : (
                <div className="cx-ph-none">Actual card photos not available</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. PROGRESS — the same canonical five stages, compact. Inline, the
          collapsed summary already carries the track. */}
      {(
        <div className="card dw-prog">
          <Track stage={o.stage} o={o} st={st} compact />
        </div>
      )}

      {/* 3-7. THE WORKING AREA. Guidance, stage work and its one action form the
          primary column; the conversation is the supporting column. On a phone
          these stack in this order; on a wide screen they sit side by side
          INSIDE the same Goal surface — never two separate cards. */}
      {/* 3. GUIDANCE — canonical turn logic, in plain language. */}
      <div className={"dw-guide " + (t.who || "none")}>
        <div className="dw-guide-w">
          {t.who === "me" ? "Your move"
            : t.who === "partner" ? `Waiting on ${short}` : "Nothing to do"}
        </div>
        <div className="dw-guide-t">{t.what}</div>
      </div>

      {/* 4. STAGE WORKSPACE — the dominant content, unchanged in substance. */}
      <div className="dw-stage">
        {o.stage === "agree-price" && <AgreePrice {...stageProps} />}
        {o.stage === "select-trade" && <SelectTrade {...stageProps} />}
        {o.stage === "value-trade" && <ValueTrade {...stageProps} />}
        {o.stage === "deal" && <DealStage {...stageProps} />}
        {o.stage === "fulfillment" && <Fulfillment {...stageProps} />}
        {o.stage === "completed" && <Completed o={o} />}
      </div>

      {/* 6. PRIMARY STAGE ACTION — directly beneath the stage work it belongs to,
          so the collector never scrolls past the whole conversation to reach it.
          PERSISTENT ACTION BAR — the canonical stage action, or an honest
          waiting state. The Chat button is gone: conversation is part of this
          workspace now, not a destination to be sent to. The bar still presses
          the handler each stage registers; no stage logic lives in the shell. */}
      {isOpen(o) && (
        <div className="dw-bar">
          {bar && bar.run ? (
            <button className="btn pri dw-bar-go" disabled={!!bar.disabled} onClick={bar.run}>
              {bar.label}
            </button>
          ) : (
            <span className="dw-bar-wait">
              {t.who === "partner" ? `Waiting on ${short}` : "Nothing to send yet"}
            </span>
          )}
        </div>
      )}

      {/* 7. CONVERSATION, INLINE. The same canonical thread scoped to collector +
          partner + card — read and written through the same component the
          pre-deal surfaces use. Not a second messaging system, and no longer a
          drawer: what was said and what was agreed belong to the deal. */}
      <DealChat o={o} partnerId={o.partnerId} cardId={o.cardId} st={st} embedded />

      {/* 8. DEAL FLOW — inspectable, but secondary during active work. Inline,
          the Goal already carries this receipt below the workspace, so rendering
          it again here would repeat the heading and the settled count. */}
      {<div className="card sec dw-flow">
        <button className="rc-toggle" aria-expanded={flow} onClick={() => setFlow(!flow)}>
          <span className="rc-toggle-t">Deal Flow</span>
          <span className="faint rc-toggle-s">
            {D.receiptForOpportunity(o, { binderById: st.binderById, cardById: st.cardById,
              partnerById: st.partnerById }).stages.filter((x) => x.state === "done").length} of 5 settled
          </span>
          <span className={"rc-chev" + (flow ? " on" : "")} aria-hidden="true">&#8250;</span>
        </button>
        {flow && <Receipt o={o} st={st} expanded inline />}
      </div>}

      <DemoPartnerResponse o={o} st={st} />
      <SimulateTP o={o} st={st} />

      {isOpen(o) && (
        <div style={{ textAlign: "center", padding: "6px 0 10px" }}>
          <button className="link" style={{ color: "var(--muted)" }}
            onClick={() => { st.endNegotiation(o.id); go({ v: "goals" }); }}>
            Stop this negotiation
          </button>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 5 }}>
            The card stays on your goals — you can start again with anyone.
          </div>
        </div>
      )}

    </div>
  );
}

/* ---------------------------------------------------- AGREE ON PRICE

   A negotiation is a sequence of things people did, so the screen says what was
   done, by whom, and for how much — rather than listing numbers and leaving the
   collector to work out which one is live.

   Everything below is derived from the canonical price thread. There is no
   second history model: `events()` folds the partner's listing and the thread
   into one chronological read, and the LAST event is by definition the standing
   proposal. That holds after any number of rounds. */

const PRICE_VERB = { offer: "offered", counter: "countered", accept: "accepted" };

/* Actor language, always naming who acted. */
const priceEvents = (o, partnerName) => {
  const rows = [];
  if (o.listedPrice != null) {
    rows.push({ who: partnerName, mine: false, verb: "listed",
      amount: o.listedPrice, at: null, listing: true });
  }
  (o.priceThread || []).forEach((e, i) => rows.push({
    who: e.by === "collector" ? "You" : partnerName,
    mine: e.by === "collector",
    verb: PRICE_VERB[e.type] || e.type,
    amount: e.amount, at: e.at, key: i,
  }));
  return rows;
};

/* The quiet chronological record. Supports the decision; never competes. */
function OfferHistory({ events, listed }) {
  const [open, setOpen] = useState(false);
  if (events.length < 2) return null;
  /* The newest row is already the headline above, so history is the rest. */
  const earlier = events.slice(0, -1);
  const shown = open ? earlier : earlier.slice(-2);
  const hidden = earlier.length - shown.length;

  return (
    <div className="oh">
      <div className="oh-h">Offer history · {events.length} events</div>
      {hidden > 0 && (
        <button className="link oh-more" onClick={() => setOpen(true)}>
          Show {hidden} earlier
        </button>
      )}
      <ol className="oh-l">
        {shown.map((e, i) => (
          <li key={i} className={"oh-r" + (e.mine ? " mine" : "")}>
            <span className="oh-who">{e.who}</span>
            <span className="oh-act">{e.verb}</span>
            <span className="oh-amt mono">{money(e.amount)}
              {percentageOf(e.amount, listed) != null
                && <span className="oh-pct"> · {percentageOf(e.amount, listed)}%</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function AgreePrice({ o, st, register }) {
  const thread = o.priceThread || [];
  const last = lastEntry(thread);
  const mine = st.turnFor(o).who === "me";
  const partner = st.partnerById(o.partnerId);
  const them = partner ? partner.name : "them";
  const [amt, setAmt] = useState("");
  const canSend = validAmount(amt);

  const events = priceEvents(o, them);
  const latest = events[events.length - 1];
  /* The collector's own most recent figure, when the standing one is not theirs
     — subordinate context, not a second headline. */
  const minePrev = [...events].reverse().find((e) => e.mine && e !== latest);
  const opening = thread.length === 0;          // nobody has proposed yet

  /* Two genuinely different decisions, so the stage renders its own actions
     rather than borrowing the shell's single slot. */
  useEffect(() => {
    if (!register) return;
    register(mine ? { own: true } : null);
  }, [register, mine]);

  const pctOf = (v) => percentageOf(v, o.listedPrice);
  const share = (v) => (pctOf(v) == null ? null
    : pctOf(v) + "% of " + (opening ? "listed price" : "their " + money(o.listedPrice) + " listed price"));

  return (
    <div className="ap">
      {/* WHAT JUST HAPPENED — actor, action, and the number on the table. */}
      <div className={"ap-now" + (latest && !latest.mine && !latest.listing ? " theirs" : "")}>
        <div className="ap-who">
          {latest ? latest.who + " " + latest.verb : "Not yet listed"}
        </div>
        {latest && <div className="ap-amt mono">{money(latest.amount)}</div>}
        {latest && (opening
          ? <div className="ap-sub">This is their asking price. {share(latest.amount)}.</div>
          : share(latest.amount) && <div className="ap-sub">{share(latest.amount)}</div>)}
        {minePrev && (
          <div className="ap-prev">
            Your offer was {money(minePrev.amount)}
            {pctOf(minePrev.amount) != null && " · " + pctOf(minePrev.amount) + "%"}
          </div>
        )}
      </div>

      {mine && (
        opening || !last ? (
          /* OPENING — the collector proposes first, so there is nothing to
             accept and no Accept action is offered. */
          <div className="ap-counter open">
            <div className="ap-h">Your offer</div>
            <CounterFields amt={amt} setAmt={setAmt} reference={o.listedPrice}
              pctLabel="% of listed price"
              amtAria="Your offer in dollars"
              pctAria="Your offer as a percentage of listed price" />
            <button className={"btn wide ap-send" + (canSend ? " pri" : "")}
              disabled={!canSend}
              onClick={() => { st.priceRespond(o.id, "counter", Number(amt)); setAmt(""); }}>
              Send offer
            </button>
          </div>
        ) : (<>
          {/* ACCEPT — reads only from the standing proposal, so it cannot be
              changed, replaced or hidden by anything typed below. */}
          <button className="btn pri wide ap-go"
            onClick={() => st.priceRespond(o.id, "accept")}>
            Accept {money(last.amount)}
          </button>

          {/* COUNTER — its own input, its own submit, its own validity. */}
          <div className="ap-counter">
            <div className="ap-h">or counter</div>
            <CounterFields amt={amt} setAmt={setAmt} reference={o.listedPrice}
              pctLabel="% of listed price"
              amtAria="Counter amount in dollars"
              pctAria="Counter as a percentage of listed price" />
            <button className={"btn wide ap-send" + (canSend ? " pri" : "")}
              disabled={!canSend}
              onClick={() => { st.priceRespond(o.id, "counter", Number(amt)); setAmt(""); }}>
              Send counter
            </button>
          </div>
        </>)
      )}

      {!mine && <div className="ap-wait">Waiting on {them}</div>}

      <OfferHistory events={events} listed={o.listedPrice} />
    </div>
  );
}

/* Select Trade — choosing which of your cards to put toward the purchase.
   Inclusion only: no values, no percentages, no money anywhere on this stage.
   Only copies the partner has already shown interest in are eligible. */
function SelectTrade({ o, st, register, go }) {
  const [picked, setPicked] = useState([]);   // never pre-selected: the collector chooses
  const groups = st.eligibleFor(o.partnerId, o);
  const eligible = [...groups.interested, ...groups.other];
  const inPack = o.trade.cards;
  /* What is currently IN the trade, counting both what has been committed and
     what is picked but not yet sent. Either makes cash-only contradictory. */
  const liveRows = [...D.TRADE.liveTradeRows(o), ...picked];
  useEffect(() => {
    if (!register) return;
    register(!o.trade.submitted && eligible.length
      ? { label: `Send ${picked.length || ""} card${picked.length === 1 ? "" : "s"} for review`.replace("  ", " "),
          disabled: !picked.length, run: () => st.submitTrade(o.id, picked) }
      : null);
  }, [register, o.id, o.trade.submitted, picked.length, eligible.length]);

  if (!o.trade.submitted) {
    return (
      <div className="card sec">
        {/* No preamble: the stage guidance above already says what this is for,
            and the grouped card list says what to do with it. */}
        {eligible.length === 0 ? (
          <div className="faint" style={{ fontSize: 14 }}>
            Your binder is empty, so this would be a cash purchase.
          </div>
        ) : (
          <>
            {[["interested", "They've already shown interest", groups.interested],
              ["other", "Other cards from your Trade Binder", groups.other]]
              .filter(([, , list]) => list.length > 0)
              .map(([key, heading, list]) => (
                <div key={key}>
                  <div className="sec-h" style={{ marginTop: 14 }}>{heading}</div>
                  {list.map((b) => {
                    const c = st.cardById(b.cardId);
                    const on = picked.includes(b.id);
                    return (
                      <button key={b.id} className={"pick" + (on ? " on" : "")}
                        aria-pressed={on}
                        onClick={() => setPicked(on ? picked.filter((x) => x !== b.id) : [...picked, b.id])}>
                        <Art card={c} size="sm" />
                        <div className="pick-b">
                          <div style={{ fontWeight: 600 }}>{c.name}</div>
                          <div className="faint" style={{ fontSize: 13 }}>{cardLine(c)} · {gradeLine(c)}</div>
                        </div>
                        {on && <span className="chip a">Chosen</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
          </>
        )}
        {/* The shell's action bar already presents this exact action from the
            registration above, so rendering it here too showed the collector two
            identical primary buttons. One registration, one handler, one button. */}
        {eligible.length > 0 && !register && (
          <button className="btn pri wide" style={{ marginTop: 14 }} disabled={!picked.length}
            onClick={() => st.submitTrade(o.id, picked)}>
            Send {picked.length || ""} card{picked.length === 1 ? "" : "s"} for review
          </button>
        )}

        {/* A CASH DEAL IS A REAL OUTCOME, not a failure to trade. It is offered
            plainly and styled as the secondary path it is — never as cancelling,
            because the deal continues either way. It goes through the canonical
            action, which records the decision, so "decided not to trade" stays
            distinguishable from "hasn't chosen yet". */}
        <div className="st-alt">
          {/* Navigation only. Nothing about this deal changes — the collector is
              going to fetch more cards and coming back to the same package. */}
          <button className="btn sm" onClick={() => go({ v: "binder" })}>
            Update Binder
          </button>

          {/* CASH-ONLY IS THE EMPTY-PACKAGE PATH. Offered only when nothing is in
              the trade: choosing it with cards selected produced a deal that was
              a cash purchase AND a pending trade at once. Hidden rather than
              disabled, because with cards selected it is not a choice being
              withheld — it is simply not the situation the collector is in. */}
          {liveRows.length === 0 && (
            <>
              <button className="btn sm" onClick={() => st.chooseCashOnly(o.id)}>
                Continue without trade
              </button>
              <span className="st-cash-n">
                Pay the full agreed price in cash. You can't add trade cards afterwards.
              </span>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card sec">
      <div className="sec-h">Cards you offered</div>
      {inPack.map((tcd) => {
        const b = st.binderById(tcd.binderId);
        const c = st.cardById(b.cardId);
        const label = tcd.inclusion === "accepted" ? "They'll take it"
          : tcd.inclusion === "rejected" ? "Not this one" : "Still deciding";
        return (
          <div key={tcd.binderId} className="pick" style={{ cursor: "default" }}>
            <Art card={c} size="sm" />
            <div className="pick-b">
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              <div className="faint" style={{ fontSize: 13 }}>{cardLine(c)} · {gradeLine(c)}</div>
            </div>
            <span className={"chip" + (tcd.inclusion === "accepted" ? " t" : "")}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* Value Trade — market value in whole dollars, then the percentage of it that
   becomes trade value. The dollar meaning of a percentage is always visible, so
   the collector is never agreeing to an abstraction. */
function ValueTrade({ o, st, register }) {
  /* Values are agreed card by card, so there is no single bar action here. */
  useEffect(() => { if (register) register(null); }, [register]);
  return (
    <>
      {acceptedCards(o).map((tcd) => (
        <ValueCard key={tcd.id || tcd.binderId} o={o} tcd={tcd} st={st} />
      ))}
    </>
  );
}

/* ---------------------------------------------- ONE NEGOTIATION, TWO UNITS

   Market value and Trade % are the same conversation held twice: somebody puts
   a number on the table, the other side accepts it or answers with their own.
   So they get the same shape — standing proposal, who made it, accept, counter
   — and differ only in how the number is written. Learning it once is enough.

   Everything shown is read from the card's own threads; nothing is recomputed
   or remembered locally beyond the draft being typed. */
function Phase({ label, standing, standingBy, agreed, format, partnerName,
  yourTurn, draft, setDraft, inputLabel, hint, onAccept, onPropose, sendLabel,
  thread, locked, lockNote }) {
  const [showHistory, setShowHistory] = useState(false);

  if (locked) {
    return (
      <div className="vp locked">
        <div className="vp-h">{label}</div>
        <div className="vp-lock">{lockNote}</div>
      </div>
    );
  }

  return (
    <div className="vp">
      <div className="vp-h">{label}</div>

      {agreed != null ? (
        <div className="vp-agreed">
          <span className="vp-amt mono">{format(agreed)}</span>
          <span className="vp-by">Agreed by you both</span>
        </div>
      ) : standing != null ? (
        <>
          <div className="vp-standing">
            <span className="vp-amt mono">{format(standing)}</span>
            <span className="vp-by">
              Proposed by {standingBy === "tp" ? partnerName : "you"}
              {yourTurn ? " — your move" : ` — waiting on ${partnerName}`}
            </span>
          </div>
          {yourTurn && (
            <button className="btn deep wide vp-accept" onClick={onAccept}>
              Accept {format(standing)}
            </button>
          )}
        </>
      ) : (
        <div className="vp-none">
          No proposal yet{yourTurn ? " — put a number on the table." : "."}
        </div>
      )}

      {agreed == null && (
        <div className="vp-counter">
          <label className="pn-f">
            <span className="pn-fl">{standing != null ? "Your counter" : "Your proposal"}</span>
            <input className="inp" inputMode="decimal" value={draft} aria-label={inputLabel}
              onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))} />
          </label>
          {hint && <div className="vp-hint">{hint}</div>}
          <button className="btn pri wide" style={{ marginTop: 10 }}
            disabled={!sendLabel} onClick={onPropose}>
            {sendLabel || "Enter an amount"}
          </button>
        </div>
      )}

      {thread.length > 0 && (
        <div className="vp-hist">
          <button className="vp-hist-b" aria-expanded={showHistory}
            onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? "Hide" : "Show"} history ({thread.length})
          </button>
          {showHistory && (
            <ul className="vp-hist-l">
              {thread.map((e, n) => (
                <li key={n}>
                  <span className="vp-hist-who">{e.by === "tp" ? partnerName : "You"}</span>
                  <span className="vp-hist-act">{e.type === "accept" ? "accepted" : "proposed"}</span>
                  <span className="mono">{format(e.type === "accept"
                    ? (e.amount != null ? e.amount : e.percent)
                    : (e.amount != null ? e.amount : e.percent))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ValueCard({ o, tcd, st }) {
  const b = st.binderById(tcd.binderId);
  const c = st.cardById(b ? b.cardId : tcd.cardId);
  /* Their private reference value prefills the field as a convenience. Nothing
     reaches the partner until they press send. */
  const [mkt, setMkt] = useState(tcd.collectorMarket != null
    ? String(tcd.collectorMarket) : String((b && b.market) ?? ""));
  const [pc, setPc] = useState(tcd.collectorPercent != null
    ? String(Math.round(tcd.collectorPercent * 100)) : "");
  const [confirmOut, setConfirmOut] = useState(false);

  const partner = st.partnerById(o.partnerId);
  const them = partner ? partner.name : "them";
  const settled = cardSettled(tcd);
  const mSettled = marketSettled(tcd);
  const out = !!tcd.withdrawn;

  /* Whose move it is, per phase, derived from the card's own standing
     positions — never from a local flag. */
  const marketStanding = tcd.tpMarket != null && tcd.agreedMarket == null
    ? { amount: tcd.tpMarket, by: "tp" }
    : tcd.collectorMarket != null && tcd.agreedMarket == null
      ? { amount: tcd.collectorMarket, by: "collector" } : null;
  const marketMine = !!marketStanding && marketStanding.by === "tp";
  const pctStanding = tcd.tpPercent != null && tcd.agreedPercent == null
    ? { amount: tcd.tpPercent, by: "tp" }
    : tcd.collectorPercent != null && tcd.agreedPercent == null
      ? { amount: tcd.collectorPercent, by: "collector" } : null;
  const pctMine = !!pctStanding && pctStanding.by === "tp";

  return (
    <div className={"card sec vcard" + (out ? " out" : "")}>
      <div className="vcard-top">
        <Art card={c} size="md" copy={b} />
        <div className="vcard-id">
          <div className="vcard-n">{c.name}</div>
          <div className="faint" style={{ fontSize: 13.5 }}>{cardLine(c)} · {gradeLine(c)}</div>
          <div className="vcard-st">
            {out ? "Removed from the trade"
              : settled ? "Settled"
                : !mSettled ? "Agreeing what it's worth"
                  : "Agreeing how much counts"}
          </div>
        </div>
      </div>

      {out ? (
        /* The row stays, because the negotiation happened. It simply stops
           counting toward the deal. */
        <div className="vcard-out">
          This card is no longer part of the trade. Its history is kept below.
        </div>
      ) : (
        <>
          <Phase
            label="Market value"
            standing={marketStanding ? marketStanding.amount : null}
            standingBy={marketStanding ? marketStanding.by : null}
            agreed={tcd.agreedMarket}
            format={money}
            partnerName={them}
            yourTurn={marketMine}
            draft={mkt} setDraft={setMkt}
            inputLabel="What you think it's worth, in dollars"
            hint="Starts from your own note. They only see what you send."
            onAccept={() => st.marketRespond(o.id, tcd.id, "accept")}
            onPropose={() => st.marketRespond(o.id, tcd.id, "propose", Number(mkt))}
            sendLabel={Number(mkt) > 0 ? `Send ${money(Number(mkt))}` : null}
            thread={tcd.valueThread || []}
          />

          <Phase
            label="Trade %"
            locked={!mSettled}
            lockNote="Available once you've agreed what this card is worth."
            standing={pctStanding ? pctStanding.amount : null}
            standingBy={pctStanding ? pctStanding.by : null}
            agreed={tcd.agreedPercent}
            format={pct}
            partnerName={them}
            yourTurn={pctMine}
            draft={pc} setDraft={setPc}
            inputLabel="Percentage of the market value toward this card"
            hint={Number(pc) > 0 && tcd.agreedMarket != null
              ? `${Math.round(Number(pc))}% of ${money(tcd.agreedMarket)} is ${money(D.tradeValueAt(tcd.agreedMarket, Number(pc) / 100))} toward the card.`
              : null}
            onAccept={() => st.pctRespond(o.id, tcd.id, "accept")}
            onPropose={() => st.pctRespond(o.id, tcd.id, "propose", Number(pc) / 100)}
            sendLabel={Number(pc) > 0 && Number(pc) <= 100
              ? `Send ${Math.round(Number(pc))}%` : null}
            thread={tcd.percentThread || []}
          />

          {/* What this card actually contributes, once both halves are agreed. */}
          {settled && (
            <div className="row tot vcard-tot"><span>Worth toward the card</span>
              <span className="mono">{money(tradeValue(tcd))}</span></div>
          )}

          {/* Secondary by design: taking a card out is a valid move, not the
              one being encouraged. */}
          {!settled && (
            <div className="vcard-out-a">
              <button className="btn sm" onClick={() => setConfirmOut(true)}>
                Remove from trade
              </button>
            </div>
          )}
        </>
      )}

      {confirmOut && (
        <div className="ovl" onClick={() => setConfirmOut(false)}>
          <div className="sheet rv-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-h">Remove {c.name} from the trade?</div>
            <div className="rv-confirm-t">
              It stops counting toward the deal. What you and {them} agreed about
              it is kept.
            </div>
            <div className="act-2" style={{ marginTop: 16 }}>
              <button className="btn" onClick={() => setConfirmOut(false)}>Keep it in</button>
              <button className="btn pri" onClick={() => {
                st.withdrawTradeCard(o.id, tcd.id); setConfirmOut(false);
              }}>Remove it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* Deal — the calculated balance, its derivation, then an optional final
   negotiation. Nothing here reopens a price, a value or a percentage. */
function DealStage({ o, st, register }) {
  const [amt, setAmt] = useState("");
  const calc = calcBalance(o);
  const p = st.partnerById(o.partnerId);
  const them = p ? p.name : "them";
  const n = Number(amt);

  /* THE ADJUSTMENT, READ CANONICALLY. Pass 2 replaced `proposedAdj`/`proposedBy`
     with one standing position per side plus a thread; this screen was still
     reading the old fields and so showed nothing at all after a proposal. */
  const deal = o.deal || {};
  const adjStanding = deal.agreedAdj == null && deal.tpAdj != null ? { amount: deal.tpAdj, by: "tp" }
    : deal.agreedAdj == null && deal.collectorAdj != null
      ? { amount: deal.collectorAdj, by: "collector" } : null;
  const fromPartner = !!adjStanding && adjStanding.by === "tp";
  const cash = D.finalBalance(o);
  const cashOnly = (o.trade && o.trade.mode === "cash") || acceptedCards(o).length === 0;

  /* Agreement belongs to whoever gave it. Never inferred, never combined. */
  const iAgreed = !!deal.collectorAgreed;
  const theyAgreed = !!deal.tpAgreed;

  return (
    <>
      <div className="card sec">
        <div className="sec-h">What this deal comes to</div>

        <div className="row"><span className="k">Price you agreed</span>
          <span className="mono">{money(o.agreedPrice)}</span></div>

        {/* EVERY NUMBER TRACEABLE TO A CARD-LEVEL AGREEMENT. The breakdown shows
            what each card was agreed to be worth, what share of it counts, and
            the credit that produces — so the total is arithmetic the collector
            can follow rather than a figure to take on trust. */}
        {cashOnly ? (
          <div className="dl-cash">
            No cards are going into this trade, so the full price is settled in cash.
          </div>
        ) : (
          <>
            <div className="dl-h">Cards you're trading</div>
            {acceptedCards(o).map((tcd) => {
              const b = st.binderById(tcd.binderId);
              const c = st.cardById(b ? b.cardId : tcd.cardId);
              return (
                <div key={tcd.id || tcd.binderId} className="dl-card">
                  <div className="dl-card-n">{c.name}</div>
                  <div className="dl-card-m">
                    <span>Agreed market value</span>
                    <span className="mono">{money(tcd.agreedMarket)}</span>
                  </div>
                  <div className="dl-card-m">
                    <span>Agreed Trade %</span>
                    <span className="mono">{pct(tcd.agreedPercent)}</span>
                  </div>
                  <div className="dl-card-m tv">
                    <span>Trade value</span>
                    <span className="mono">{money(tradeValue(tcd))}</span>
                  </div>
                </div>
              );
            })}
            <div className="row"><span className="k">Total trade value</span>
              <span className="mono">−{money(D.totalTradeValue(o))}</span></div>
          </>
        )}

        {/* Direction in words, because a sign is not an explanation. */}
        <div className="row tot">
          <span>{cash >= 0 ? `You pay ${them}` : `${them} pays you`}</span>
          <span className="mono">{money(Math.abs(cash))}</span>
        </div>
      </div>

      <div className="card sec">
        <div className="sec-h">Final negotiation</div>
        <div style={{ fontSize: 14, marginBottom: 12 }}>
          {adjStanding == null
            ? <>The numbers above are settled. If you'd like to land somewhere different, propose a final figure — everything you already agreed stays the same.</>
            : fromPartner
              ? <>{them} suggested settling at <b className="mono">{money(adjStanding.amount)}</b> instead of {money(Math.abs(calc))}.</>
              : <>You suggested <b className="mono">{money(adjStanding.amount)}</b>. Waiting on {them}.</>}
        </div>

        {/* Whose agreement is in, stated separately for each person. */}
        <div className="dl-agree">
          <div className="row"><span className="k">You</span>
            <span>{iAgreed ? "Agreed" : "Not yet"}</span></div>
          <div className="row"><span className="k">{them}</span>
            <span>{theyAgreed ? "Agreed" : "Not yet"}</span></div>
        </div>

        {!iAgreed && (
          <>
            {adjStanding && fromPartner && (
              <button className="btn deep wide" style={{ marginBottom: 12 }}
                onClick={() => st.dealAdjustAccept(o.id)}>
                Accept {money(adjStanding.amount)}
              </button>
            )}
            <button className="btn pri wide" style={{ marginBottom: 12 }}
              onClick={() => st.dealAgree(o.id)}>
              Agree to this deal
            </button>
            <input className="inp" inputMode="decimal" value={amt} placeholder="Propose a different figure"
              aria-label="Propose a final cash amount"
              onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ""))} />
            <div className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>
              Only the cash changes. Card values and percentages stay exactly as agreed.
            </div>
            <button className="btn wide" style={{ marginTop: 12 }} disabled={!(n > 0)}
              onClick={() => { st.dealPropose(o.id, n); setAmt(""); }}>
              Propose {money(n || 0)}
            </button>
          </>
        )}

        {iAgreed && !theyAgreed && (
          <div className="dl-wait">You've agreed. Waiting on {them}.</div>
        )}
      </div>
    </>
  );
}

function Fulfillment({ o, st, register }) {
  const f = o.fulfillment || {};
  const p = st.partnerById(o.partnerId);
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);

  /* THREE DISTINCT MOMENTS, and the collector is only ever in one of them:
       1. the partner has not proposed how the exchange happens — nothing to do;
       2. a plan is on the table — agree to it, or ask for a change;
       3. the plan is agreed — confirm receipt when the card actually arrives.
     Agreeing to a plan is not receiving a card, so those never share a button.
     Before Pass 2 this screen showed a plan nobody had proposed; now it shows
     the absence honestly and waits. */
  const proposed = !!f.proposedAt && !f.revisionRequested;
  const agreed = proposed && !!f.collectorConfirmedPlan;
  const received = D.FULFILLMENT.received(f);

  useEffect(() => {
    if (!register) return;
    register(
      !proposed ? null
        : !agreed ? { label: "Agree to this plan", run: () => st.confirmPlan(o.id) }
          : !received ? { label: "I've got the card", run: () => st.confirmHandoff(o.id) }
            : null);
  }, [register, o.id, proposed, agreed, received]);

  const term = (k, v) => (
    <div className="row"><span className="k">{k}</span>
      <span>{v || <span className="faint">Not proposed yet</span>}</span></div>
  );

  return (
    <div className="card sec">
      <div className="sec-h">Handoff</div>

      {!proposed && (
        <div className="fh-wait">
          {f.revisionRequested
            ? `You asked ${p.name} to change the plan. Waiting for a new proposal.`
            : `${p.name} will propose how, where and when to hand the card over.`}
        </div>
      )}

      {term("How", f.method)}
      {term("Where", f.where)}
      {term("When", f.when)}
      <div className="row"><span className="k">Settling up</span>
        <span className="mono">{money(Math.abs(finalBalance(o)))} {finalBalance(o) >= 0 ? "to them" : "to you"}</span></div>

      {/* The plan and the exchange are reported separately, because they are
          separate facts: agreeing a Saturday meet is not having the card. */}
      <div className="row"><span className="k">Plan</span>
        <span>{agreed ? "Agreed by you both"
          : proposed ? `Proposed by ${p.name} — your move`
            : "Not proposed yet"}</span></div>
      <div className="row"><span className="k">{p.name}</span>
        <span>{D.FULFILLMENT.handedOff(f) ? "Handed over" : "Not yet"}</span></div>
      <div className="row"><span className="k">You</span>
        <span>{received ? "Confirmed receipt" : "Not yet"}</span></div>

      {proposed && !agreed && (
        <div className="fh-act">
          {!register && (
            <button className="btn pri" onClick={() => st.confirmPlan(o.id)}>
              Agree to this plan
            </button>
          )}
          <button className="btn" onClick={() => setAsking(true)}>Ask for a change</button>
        </div>
      )}

      {asking && (
        <div className="fh-ask">
          <label className="pn-f">
            <span className="pn-fl">What would work better?</span>
            <input className="inp" value={note} aria-label="What would work better"
              onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="act-2" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => { setAsking(false); setNote(""); }}>Cancel</button>
            <button className="btn pri" disabled={!note.trim()}
              onClick={() => { st.requestPlanRevision(o.id, note.trim()); setAsking(false); setNote(""); }}>
              Send request
            </button>
          </div>
        </div>
      )}

      {agreed && !received && !register && (
        <button className="btn pri wide" style={{ marginTop: 16 }} onClick={() => st.confirmHandoff(o.id)}>
          I've got the card
        </button>
      )}
    </div>
  );
}

function Completed({ o }) {
  return (
    <div className="card sec">
      <div className="sec-h">Completed</div>
      <div className="row"><span className="k">Finished</span><span>{fmtDate(o.completedAt)}</span></div>
      <div className="row"><span className="k">Price agreed</span><span className="mono">{money(o.agreedPrice)}</span></div>
      <div className="row"><span className="k">Your cards covered</span><span className="mono">{money(totalTradeValue(o))}</span></div>
      <div className="row tot"><span>You paid</span><span className="mono">{money(Math.abs(finalBalance(o)))}</span></div>
    </div>
  );
}

/* Which of my partners has this, and what are they asking? The comparison a
   collector actually makes before opening a negotiation. */
function WhoHasIt({ goalId, st, go }) {
  const g = st.goals.find((x) => x.id === goalId);
  const c = st.cardById(g.cardId);
  const holders = st.partnersWith(g.cardId).slice().sort((a, b) => a.ask - b.ask);
  const live = st.openOppForGoal(goalId);
  /* A pursuit already under way — a Review Card, or a deal. Either way the Goal
     workspace owns it, and this sheet becomes discovery-only. */
  const pursuit = st.pursuitFor(goalId);
  const pursued = pursuit && pursuit.kind === "review" ? pursuit : null;

  return (
    <Sheet title={c.name} sub={`${cardLine(c)} · ${gradeLine(c)}`} onClose={() => go({ v: "goals" })}
      footer={<button className="btn wide" onClick={() => go({ v: "goals" })}>Close</button>}>
      <div style={{ fontSize: 14, marginBottom: 6 }}>
        {holders.length} of your partners {holders.length === 1 ? "has" : "have"} this card.
      </div>
      {live && (
        /* Alternatives stay visible during a negotiation — the collector can still
           talk to anyone. Only the structured offer is limited to one at a time.
           CONVERSATION IS NOT NEGOTIATION: this is the sentence that says so. */
        <div className="faint whi-live" style={{ fontSize: 13, marginBottom: 12 }}>
          Your deal for this card is with {st.partnerById(live.partnerId).name}. You can talk to
          anyone else here — chatting starts nothing. Making an offer stays closed until that
          deal ends or completes.
        </div>
      )}

      {holders.map((h) => {
        /* Scoped to THIS partner. A conversation with one partner says nothing
           about whether another has been spoken to. */
        const talked = st.hasThreadAbout(c.id, h.partner.id);
        const current = !!live && live.partnerId === h.partner.id;
        const openness = st.interestCountFrom(h.partner.id);
        return (
          <div key={h.partner.id} className={"pick" + (current ? " whi-current" : "")}
            style={{ cursor: "default", alignItems: "flex-start" }}>
            <Face partner={h.partner} size={38} />
            <div className="pick-b" style={{ marginLeft: 10 }}>
              <div style={{ fontWeight: 600 }}>
                {h.partner.name}
                {current && <span className="chip t whi-badge">CURRENT DEAL</span>}
              </div>
              <div className="faint" style={{ fontSize: 13 }}>{h.partner.city}</div>
              <div className="faint" style={{ fontSize: 12.5, marginTop: 3 }}>
                {cardLine(c)} · {gradeLine(c)}
              </div>
              {h.inv && <PhotoNote inv={h.inv} st={st} />}
              {openness > 0 && (
                <div style={{ fontSize: 12.5, color: "var(--t1)", marginTop: 3 }}>
                  Open to {openness} of your binder card{openness === 1 ? "" : "s"}
                </div>
              )}
              <div className="act-2" style={{ marginTop: 9 }}>
                {/* Never disabled. Opening a conversation is always available, and
                    it is a conversation — it creates no opportunity, ever. */}
                <button className="btn sm"
                  onClick={() => go({ v: "chat", goalId, partnerId: h.partner.id, cardId: c.id })}>
                  {talked ? "Continue chatting" : "Chat"}
                </button>
                {/* DISCOVERY CHOOSES; THE WORKSPACE OWNS. Before a pursuit
                    exists this is where a partner and copy get chosen, so the
                    forward actions live here. Once one is being pursued, this
                    sheet stops offering any way to act on it — it hands back to
                    the Goal, so there is only ever one surface that can start
                    the same offer. Chat above is unaffected: talking is not a
                    forward action. */}
                {current ? (
                  <button className="btn sm pri"
                    onClick={() => go({ v: "deal", oppId: live.id })}>
                    View Deal
                  </button>
                ) : pursued && pursued.partnerId === h.partner.id ? (
                  <button className="btn sm pri"
                    onClick={() => go({ v: "goals" })}>
                    Open Review Card
                  </button>
                ) : !live && !pursued ? (
                  /* DISCOVERY CHOOSES; REVIEW CARD DECIDES. Selecting a copy
                     opens the pursuit on the Goal — it does not open an offer
                     workflow here, because deciding what to pay is a different
                     question from deciding which copy to look at. */
                  <button className="btn sm pri"
                    onClick={() => { st.reviewCopy(h.inv); go({ v: "goals" }); }}>
                    Review card
                  </button>
                ) : null}
              </div>
            </div>
            <div className="mono" style={{ fontWeight: 700 }}>{money(h.ask)}</div>
          </div>
        );
      })}
      {/* Explains a decision the collector has not made yet. Once they are
          pursuing a copy, Review Card provides that context instead. */}
      {!live && !pursued && (
        <div className="faint" style={{ fontSize: 12.5, marginTop: 12 }}>
          Chatting is just a conversation — it doesn't start a negotiation or commit you
          to anything. Only you can make an offer.
        </div>
      )}
      {pursued && (
        <div className="faint" style={{ fontSize: 12.5, marginTop: 12 }}>
          You're reviewing {st.partnerById(pursued.partnerId).name}'s copy. Carry on from
          the Deal Flow on this goal — you can still talk to anyone here.
        </div>
      )}
    </Sheet>
  );
}

/* A CONVERSATION, NOT A NEGOTIATION. The same canonical thread the Trusted
   Partner reads — one per collector + partner + card — reached from "Who has
   it" for any partner holding the card, whether or not a deal is under way with
   somebody else. Opening or using this NEVER touches opportunity state. */
function PartnerChat({ goalId, partnerId, cardId, st, go }) {
  const c = st.cardById(cardId);
  const partner = st.partnerById(partnerId);
  const live = goalId ? st.openOppForGoal(goalId) : null;
  const current = !!live && live.partnerId === partnerId;
  const back = () => go(goalId ? { v: "start", goalId } : { v: "goals" });

  return (
    <Sheet title={`Chat with ${partner.name}`} sub={`${c.name} · ${gradeLine(c)}`}
      onClose={back}
      footer={<button className="btn wide" onClick={back}>Close</button>}>
      <div className={"pc-banner " + (current ? "is-deal" : "is-chat")}>
        {current
          ? <>This is your <b>current deal</b> for this card.</>
          : <>This is a conversation, not a negotiation. Nothing here starts a deal.</>}
      </div>
      {current && (
        <button className="btn sm pri wide" style={{ marginBottom: 10 }}
          onClick={() => go({ v: "deal", oppId: live.id })}>
          View Deal
        </button>
      )}
      {!current && live && (
        <div className="faint" style={{ fontSize: 12.5, marginBottom: 10 }}>
          You can only negotiate one deal per card at a time, and yours is with{" "}
          {st.partnerById(live.partnerId).name}. Making an offer to {partner.name} opens up once
          that deal ends or completes.
        </div>
      )}
      <DealChat o={current ? live : null} partnerId={partnerId} cardId={cardId} st={st} bare />
    </Sheet>
  );
}

/* ---- Starting a negotiation. Deliberate, confirmed, and the one-at-a-time
       rule is stated BEFORE the collector commits, not after they try. ---- */
function StartOffer({ goalId, partnerId, st, go }) {
  const [promote, setPromote] = useState(null);
  const [refused, setRefused] = useState(null);
  const g = st.goals.find((x) => x.id === goalId);
  const c = st.cardById(g.cardId);
  const p = st.partnerById(partnerId);
  /* Canonical supply: this partner's inventory at the goal's exact identity. */
  const match = st.partnersWith(g.cardId).find((x) => x.partner.id === partnerId);
  const stock = match ? { ask: match.ask } : null;
  const live = st.openOppForGoal(goalId);
  /* BLANK. The field used to open at 90% of asking — a hardcoded 0.9 that read
     as a recommendation MetYet has no business making. The first offer is the
     collector's judgement, so they enter it deliberately. Nothing seeds it:
     not the asking price, not a private valuation, not a prior negotiation. */
  const [amt, setAmt] = useState("");
  const n = Number(amt);

  if (live) {
    return (
      <Sheet title="You're already negotiating this card"
        sub={`With ${st.partnerById(live.partnerId).name}, at ${STAGE[live.stage].label}.`}
        onClose={() => go({ v: "goals" })}
        footer={<>
          <button className="btn" onClick={() => go({ v: "goals" })}>Back</button>
          <button className="btn pri" style={{ flex: 1 }} onClick={() => go({ v: "deal", oppId: live.id })}>
            Continue that one
          </button>
        </>}>
        <div style={{ fontSize: 14.5 }}>
          You can only have one negotiation running per goal, so the terms never get
          tangled. Finish or stop that one first.
        </div>
      </Sheet>
    );
  }

  if (promote != null) {
    return (
      <Sheet title="Make this a Primary Goal?" sub={`${c.name} · ${cardLine(c)}`}
        onClose={() => setPromote(null)}
        footer={<>
          <button className="btn" onClick={() => setPromote(null)}>Not now</button>
          <button className="btn pri" style={{ flex: 1 }}
            onClick={() => {
              /* Promote the SAME goal, then continue — no replacement record. */
              st.setTier(goalId, "primary");
              const res = st.startOffer(goalId, partnerId, promote);
              if (res && res.refused) { setPromote(null); return; }
              go({ v: "deal", oppId: res });
            }}>
            Make Primary &amp; continue
          </button>
        </>}>
        <div style={{ fontSize: 14.5, lineHeight: 1.55 }}>
          You've been keeping an eye on this one. Making an offer means you're
          actively going after it, so MetYet will move it to your Primary goals.
        </div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 12 }}>
          You can move it back to your watchlist any time.
        </div>
      </Sheet>
    );
  }

  /* THE FIRST OFFER IS THE COMMITMENT. Reviewing a card, asking to see it and
     chatting about it are all reversible; submitting a price is the moment this
     goal acquires a deal and other partners stop being available for it. So the
     consequence is explained once, here — and not again on any counter, because
     by then the collector is already in the deal it describes. */
  const submit = () => {
    const res = st.startOffer(goalId, partnerId, n);
    /* Refused because this is a watchlist goal — offer promotion rather than a
       dead end. The collector decides; MetYet never promotes for them. */
    if (res && res.refused === D.REFUSE.notPrimary) { setPromote(n); return; }
    if (res && res.refused) { setRefused(res.refused); return; }
    go({ v: "deal", oppId: res });
  };

  return (
    <Sheet title="Make an offer" sub={`${c.name} · ${cardLine(c)} · ${gradeLine(c)}`}
      onClose={() => go({ v: "partner", partnerId })}
      footer={<>
        <button className="btn" onClick={() => go({ v: "partner", partnerId })}>Cancel</button>
        {/* "Submit offer", not "Send offer": this establishes the active deal
            rather than merely sending a message. The consequence is stated in
            the sheet itself, so there is no second dialog repeating it. */}
        <button className="btn pri" style={{ flex: 1 }} disabled={!(n > 0)}
          onClick={submit}>
          Submit offer
        </button>
      </>}>
      {refused && (
        <div className="ap-refused">
          {refused === D.REFUSE.copyCommitted
            /* Says only that the copy is taken — never by whom, or for how much. */
            ? "This copy is currently committed to another deal. You can keep reviewing it and talking to " + p.name + ", but it can't be offered on until that deal ends."
            : refused === D.REFUSE.alreadyNegotiating
              ? "You already have an active deal for this goal. Finish or stop it before offering elsewhere."
              : "That copy isn't available."}
        </div>
      )}
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 18 }}>
        <Art card={c} size="md" />
        <div>
          <div style={{ fontWeight: 600 }}>{p.name}</div>
          <div className="faint" style={{ fontSize: 13.5 }}>asking {money(stock?.ask)}</div>
        </div>
      </div>
      {/* The same synced pair both seats use at Agree on Price: dollars are the
          canonical value, the percentage is a second way of typing the same
          number. Nothing here rates a percentage as good, fair or market. */}
      <div className="ap">
        <CounterFields amt={amt} setAmt={setAmt} reference={stock ? stock.ask : null}
          amtLabel="Your offer" pctLabel="% of asking"
          amtAria="Your offer in dollars"
          pctAria="Your offer as a percentage of the asking price" />
      </div>
      {/* What this moment actually commits — not what happens four stages later.
          Scoped to THIS goal: other goals are unaffected, and the partner has
          committed nothing yet. */}
      <div className="faint" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.5 }}>
        Submitting an offer starts an active deal with {p.name} for this goal.
        You'll work exclusively with them on it until the deal is completed or the
        negotiation ends.
      </div>
    </Sheet>
  );
}

/* ---- Adding to the binder. Both photos are required to create a copy, so the
       requirement is visible before committing and never asked for again. ---- */
function AddCopy({ st, go }) {
  /* Two stages, matching the Trusted Partner's Add to Inventory: identify the
     exact card, then describe the copy. The identity half is literally the same
     component, so the two personas cannot resolve a card differently. */
  const [identity, setIdentity] = useState(null);
  const [mine, setMine] = useState("");
  const [cert, setCert] = useState("");
  const [ph, setPh] = useState({ front: null, back: null });
  const ready = !!identity && ph.front && ph.back;

  if (!identity) {
    return (
      <Sheet title="Add a card to your binder"
        sub="Find the exact card, then describe the copy you'd trade."
        onClose={() => go({ v: "binder" })}>
        <CardIdentityPicker
          catalog={st.catalog}
          Art={Art}
          confirmLabel="Continue"
          searchPlaceholder="Search by card name, set, or number..."
          onCancel={() => go({ v: "binder" })}
          onResolved={(id) => setIdentity(st.resolveIdentity(id))}
        />
      </Sheet>
    );
  }

  const c = identity.card;
  return (
    <Sheet title="Describe your copy" sub={cardFull(c)}
      onClose={() => go({ v: "binder" })}
      footer={<>
        <button className="btn" onClick={() => setIdentity(null)}>Back</button>
        <button className="btn pri" style={{ flex: 1 }} disabled={!ready}
          onClick={() => { st.addCopy(identity.id, mine, ph, cert); go({ v: "binder" }); }}>
          Add to binder
        </button>
      </>}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
        <Art card={c} size="lg" />
      </div>

      {/* The collector's own note. Never sent to a partner. */}
      <label style={{ display: "block", fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>
        What do you think it's worth? <span className="faint" style={{ fontWeight: 400 }}>optional</span>
      </label>
      <input className="inp" inputMode="decimal" value={mine} placeholder="$"
        onChange={(e) => setMine(e.target.value.replace(/[^\d.]/g, ""))} />
      <div className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>
        Just for you. Partners never see it.
      </div>

      {/* Graded copies carry a cert; raw ones do not, exactly as on the TP side. */}
      {!D.isRaw(c) && (
        <>
          <label style={{ display: "block", fontSize: 13.5, fontWeight: 600, margin: "18px 0 6px" }}>
            Certification number <span className="faint" style={{ fontWeight: 400 }}>optional</span>
          </label>
          <input className="inp" value={cert} onChange={(e) => setCert(e.target.value)} />
        </>
      )}

      <div style={{ fontSize: 13.5, fontWeight: 600, margin: "20px 0 8px" }}>
        Photos — both sides, so partners can actually look at it
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        {["front", "back"].map((side) => (
          <div key={side} style={{ flex: 1, textAlign: "center" }}>
            <button className="btn wide" style={{ height: 96, flexDirection: "column",
              borderStyle: ph[side] ? "solid" : "dashed",
              borderColor: ph[side] ? "var(--t2)" : "var(--line)",
              background: ph[side] ? "var(--t1-bg)" : "var(--panel-2)" }}
              onClick={() => setPh({ ...ph, [side]: `${side}:new` })}>
              <span style={{ fontSize: 13, textTransform: "capitalize" }}>{side}</span>
              <span className="faint" style={{ fontSize: 12 }}>
                {ph[side] ? "Added" : "Tap to add"}
              </span>
            </button>
          </div>
        ))}
      </div>
      {!ready && (
        <div className="faint" style={{ fontSize: 12.5, marginTop: 10 }}>
          Both photos are needed before this can go in your binder.
        </div>
      )}
    </Sheet>
  );
}

/* ============================ ROOT ============================ */
/* The same icon set the Trusted Partner workspace uses — crosshairs for what
   you're targeting, a binder for what you'd trade, people for who can help. */
const NAV = [
  { id: "goals", label: "Goals", icon: "target" },
  { id: "binder", label: "Trade Binder", icon: "binder" },
  { id: "partners", label: "Trusted Partners", icon: "people" },
];

/* The one shared store. Both persona apps in this prototype construct it from
   the same seed; in production it would be one server-side domain. */
/* Standalone fallback only. An injected store always wins, so the unified shell
   can hand the Collector and the Trusted Partner the SAME runtime. */
let __fallback = null;
export const __store = {
  get: () => (__fallback || (__fallback = createStore(buildCanonicalSeed()))),
  reset: (seed) => { (__fallback || (__fallback = createStore(buildCanonicalSeed())))
    .reset(seed || buildCanonicalSeed()); },
};

export default function MetYetCollector({ store: injectedStore, collectorId = SELF_COLLECTOR }) {
  /* Injected store wins; the fallback is built only when nothing was passed, so
     one mount never holds two canonical runtimes. */
  const store = useMemo(() => injectedStore || __store.get(), [injectedStore]);
  /* Subscribe to canonical state. No local copy of anything shared exists in
     this component — when the domain changes, this re-renders from it. */
  const state = useSyncExternalStore(store.sub, store.get, store.get);
  const [nav, setNav] = useState({ v: "goals" });

  const st = useMemo(() => {
    const v = collectorView(state, collectorId);
    const A = store.actions;
    return {
      /* ---- canonical reads, via the persona selector ---- */
      ...v,
      goals: v.myGoals(),
      binder: v.myBinder(),
      opps: v.myOpps(),
      partners: state.partners,
      binderById: (id) => v.myBinder().find((b) => b.id === id),
      contactsFor: (goalId, partnerId) => v.conversationsFor(goalId, partnerId),
      eligibleFor: (pid, o) => v.tradeGroups(pid, o),

      /* ---- canonical writes. Every one of these is a shared action; nothing
             here mutates a local array. ---- */
      addGoal: (cardId, tier) =>
        A.addGoal({ collectorId, cardId, tier, at: AT }),
      /* Resolve an exact identity to a canonical catalog record, creating one if
         this printing/grade combination has never been seen. The SAME rule the
         Trusted Partner uses when adding a copy — one catalog, one identityKey. */
      resolveIdentity: (identity) => {
        const key = D.identityKey(identity);
        const hit = state.catalog.find((c) => D.identityKey(c) === key);
        if (hit) return { id: hit.id, card: hit };
        const id = "c" + key.replace(/[^a-z0-9]+/g, "").slice(0, 24) + "-" + state.catalog.length;
        const card = { ...identity, id };
        store.set({ ...store.get(), catalog: [...store.get().catalog, card] });
        return { id, card };
      },
      /* A goal is intent at an exact identity. Creation still goes through the
         one canonical action. */
      addGoalForIdentity: (resolved, tier) =>
        A.addGoal({ collectorId, cardId: resolved.id, tier, at: AT }),
      setTier: (goalId, tier) => A.updateGoalTier(goalId, tier),
      removeGoal: (goalId) => A.removeGoal(goalId),
      addCopy: (cardId, mine, photos, cert) => A.addBinderCopy({
        id: "b" + Date.now().toString(36), collectorId, cardId,
        market: mine === "" ? null : Number(mine),
        cert: cert && cert.trim() ? cert.trim() : null, addedAt: AT, photos }),
      /* Reaching out writes to the SAME thread that Trusted Partner reads — and
         only that one. An opportunity is inherited by the thread only when the
         negotiation is actually with this partner, so chatting to an
         alternative never inherits, or disturbs, the active deal. */
      reachOut: (goalId, partnerId, cardId, text) => {
        const open = v.openOppForGoal(goalId);
        return A.reachOut({ collectorId, partnerId, cardId,
          oppId: open && open.partnerId === partnerId ? open.id : undefined,
          text: text || null, at: AT });
      },
      sendMessage: (partnerId, cardId, text, oppId) =>
        A.sendMessage({ collectorId, partnerId, cardId, by: "collector", text, oppId, at: AT }),
      /* Development only — see SimulateTP. Every call is a canonical action. */
      simulate: A,
      /* Returns null when the one-negotiation invariant refuses it. The refusal
         is the domain's, not this screen's. */
      startOffer: (goalId, partnerId, amount) => {
        const g = v.myGoals().find((x) => x.id === goalId);
        const inv = v.partnersWith(g.cardId).find((x) => x.partner.id === partnerId);
        /* The domain may refuse — a Secondary goal is not being pursued, and a
           goal already in a negotiation cannot start another. The refusal is
           handed back so the UI can offer the right next step. */
        return A.startOpportunity({ goalId, collectorId, partnerId,
          cardId: g.cardId, invId: inv ? inv.inv.invId : null,
          listedPrice: inv ? inv.ask : amount, amount, at: AT });
      },
      endNegotiation: (oppId) => A.endOpportunity(oppId, "collector", AT),

      /* Asking to see a specific physical copy. Not a deal: it creates no
         opportunity, touches no goal, and repeated clicks do not pile up. */
      requestPhotos: (inv) => (inv ? A.requestPhotos({ collectorId, partnerId: inv.partnerId,
        invId: inv.invId, at: AT }) : null),
      /* Choosing which copy to pursue. Creates no offer and asks nothing of the
         partner — it simply makes the pursuit real and visible on the Goal. */
      reviewCopy: (inv) => (inv ? A.reviewCopy({ collectorId, partnerId: inv.partnerId,
        invId: inv.invId, at: AT }) : null),
      endReview: (id) => A.endReview(id, AT),

      /* ---- REVIEW HARNESS (development only) --------------------------------
         Scoped restore of the designated review deal to its canonical starting
         fixture. This is a FIXTURE swap, not a state editor: the replacement
         record is rebuilt by buildCanonicalSeed/buildOpps, the same code that
         produces it at hydration, so no stage is set by hand and no field is
         edited individually. Everything outside the review scenario is left
         exactly as it was. */
      reviewGoal: () => v.myGoals().find((g) => REVIEW_DEAL_NOTE.test(g.note || "")),
      reviewPromoteGoal: () => v.myGoals().find((g) => REVIEW_PROMOTE_NOTE.test(g.note || "")),
      /* Load the review deal at a requested canonical stage, or at its default
         starting stage when none is named. Both are the SAME operation: rebuild
         the fixture from the canonical seed builder and swap it in. Nothing
         edits a stage field, so there is no stage setter to misuse. */
      resetReviewDeal: (demoStage) => {
        if (!DEMO) return null;
        /* Delegates to the one shared loader, so the review panel and the
           prototype header cannot drift apart. */
        const next = demoDealFixture(store.get(), { collectorId, demoStage });
        if (!next) return null;
        store.set(next);
        return "o-review";
      },
      /* The canonical distinction the Trusted Partner already makes: once both
         sides agree, ending it is a CANCELLATION rather than a stop. */
      dealAgreed: (o) => !!(o && o.deal && o.deal.tpAgreed && o.deal.collectorAgreed),

      priceRespond: (id, action, amount) => {
        if (action === "accept") {
          /* Settling the price commits the physical copy, so it goes through the
             canonical action that enforces that — not a blind patch. Returns a
             refusal when another deal settled this copy first. */
          const o = store.get().opportunities.find((x) => x.id === id);
          const last = o && D.lastEntry(o.priceThread);
          return A.agreePrice({ oppId: id, amount: last ? last.amount : amount,
            by: "collector", at: AT });
        }
        /* A counter is an ordinary edit; only acceptance commits anything. */
        return A.patchOpportunity(id, (o) => ({ ...o,
          priceThread: [...o.priceThread, { by: "collector", type: "counter", amount, at: AT }] }));
      },
      /* ONE TRADE-CARD SHAPE. This used to build {binderId, inclusion} — a
         reduced object missing the stable row id, the cardId, both negotiation
         threads and every market/percent field. A card created that way could
         be proposed but could never be valued: the Value Trade model had
         nothing to write into, and two rows for the same binder copy could not
         be told apart. It now uses the same factory the Trusted Partner's own
         path uses, so both seats observe one object.

         Nothing is agreed on creation: inclusion starts "proposed", withdrawn
         false, both threads empty, every agreed field null. Proposing a card is
         not the partner accepting it. */
      submitTrade: (id, binderIds) => A.patchOpportunity(id, (o) => ({
        ...o,
        trade: { ...(o.trade || {}), submitted: true,
          cards: binderIds.map((bid) => {
            const b = st.binderById(bid);
            return emptyTradeCard(b ? b.cardId : null,
              b ? b.photos : null, b ? b.cert : null, bid);
          }) } })),
      /* STAGE 4-6 GO THROUGH THE CANONICAL ACTIONS. These used to be local
         shortcuts that wrote agreed values with no thread history, agreed on
         the partner's behalf, and invented a fulfillment plan nobody proposed.
         The rules now live in the domain, so this layer only names the actor.

         Trade cards are addressed by their own row id — binderId could not tell
         two rows for the same binder copy apart. */
      marketRespond: (id, tradeCardId, action, amount) =>
        A.tradeMarketRespond({ oppId: id, tradeCardId, by: "collector", action, amount, at: AT }),
      pctRespond: (id, tradeCardId, action, frac) =>
        A.tradePercentRespond({ oppId: id, tradeCardId, by: "collector", action, percent: frac, at: AT }),
      dealPropose: (id, amount) =>
        A.dealAdjustRespond({ oppId: id, by: "collector", action: "propose", amount, at: AT }),
      /* Agreeing means agreeing for the collector. Whether the deal is mutually
         agreed is derived from both bits, not asserted by one seat. */
      dealAgree: (id) => A.dealAgree({ oppId: id, by: "collector", at: AT }),
      confirmPlan: (id) => A.confirmFulfillmentPlan({ oppId: id, at: AT }),
      requestPlanRevision: (id, note) =>
        A.requestFulfillmentRevision({ oppId: id, note, at: AT }),
      dealAdjustAccept: (id) =>
        A.dealAdjustRespond({ oppId: id, by: "collector", action: "accept", at: AT }),
      chooseCashOnly: (id) => A.chooseCashOnly({ oppId: id, at: AT }),
      withdrawTradeCard: (id, tradeCardId) =>
        A.withdrawTradeCard({ oppId: id, tradeCardId, at: AT }),
      confirmHandoff: (id) => A.confirmHandoff({ oppId: id, by: "collector", at: AT }),
    };
  }, [state, store, collectorId]);

  const go = (n) => setNav(n);
  const tab = ["goals", "start", "deal"].includes(nav.v) ? "goals"
    : ["binder", "add"].includes(nav.v) ? "binder" : "partners";
  const liveCount = st.opps.filter((o) => D.isNegotiating(o) && st.turnFor(o).who === "me").length;

  return (
    <div className="mc">
      <style>{CSS}</style>

      <nav className="nav">
        {NAV.map((n) => (
          <button key={n.id} className={"nav-i" + (tab === n.id ? " on" : "")}
            aria-current={tab === n.id ? "page" : undefined}
            onClick={() => go({ v: n.id })}>
            <span className="nav-ic" aria-hidden="true"><Icon n={n.icon} s={20} /></span>
            <span className="nav-l">{n.label}</span>
            {n.id === "goals" && liveCount > 0 && <span className="nav-dot" aria-label={`${liveCount} need you`} />}
          </button>
        ))}
      </nav>

      <div className="mc-main">
        {nav.v === "goals" && <Goals st={st} go={go} />}
        {nav.v === "binder" && <Binder st={st} go={go} />}
        {nav.v === "partners" && <Partners st={st} go={go} />}
        {nav.v === "partner" && <PartnerDetail partnerId={nav.partnerId} st={st} go={go} />}
        {nav.v === "deal" && <Deal oppId={nav.oppId} st={st} go={go} />}
      </div>

      {nav.v === "start" && <WhoHasIt goalId={nav.goalId} st={st} go={go} />}
      {nav.v === "chat" && <PartnerChat goalId={nav.goalId} partnerId={nav.partnerId}
        cardId={nav.cardId} st={st} go={go} />}
      {nav.v === "offer" && <StartOffer goalId={nav.goalId} partnerId={nav.partnerId} st={st} go={go} />}
      {nav.v === "add" && <AddCopy st={st} go={go} />}
    </div>
  );
}
