import React, { useState, useMemo, useSyncExternalStore } from "react";
import * as D from "../domain/metyet-domain.js";
import * as E from "../domain/metyet-entities.js";
import { createStore } from "../domain/metyet-store.js";
import { collectorView } from "../domain/collector-view.js";
/* THE CANONICAL SEED. The Collector runs on the same universe the Trusted
   Partner does — same cards, same collectors, same inventory copies. Casey Lin
   (c12) is a collector in that network, not a fixture. */
import { buildCanonicalSeed, Icon } from "../src/MetYet.jsx";
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
        waiting: mine ? null : `${them} is reviewing your cards` };
    case "value-trade":
      return { cta: mine ? "Agree card values" : null, context: agreed,
        waiting: mine ? null : `Waiting on ${them} to value your cards` };
    case "deal":
      return { cta: mine ? "Check the balance" : null, context: agreed,
        waiting: mine ? null : `Waiting on ${them} to agree` };
    case "fulfillment":
      return { cta: mine ? "Confirm the handoff" : null, context: agreed,
        waiting: mine ? null : `Waiting on ${them} to confirm` };
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
  /* DARK MODE, on MetYet's teal family. The Trusted Partner workspace is a lit
     room you work in; the Collector app is a case you look into, so the cards
     carry the light and the surfaces recede behind them. Same brand hue —
     #0B5D66 lifted to an aqua that reads on near-black. */
  --bg: #0A1014;
  --panel: #121B21;
  --panel-2: #16212A;
  --line: #22313B;
  --line-soft: #1A2730;
  --text: #EAF2F4;
  --muted: #9FB2BC;
  --faint: #6E8492;
  --t1: #2FD4C4;
  --t2: #1E8E88;
  --t1-bg: #122A2E;
  /* The action colour. Brighter than the TP's #0B5D66 because it has to carry
     on a dark surface, but the same hue family. */
  --accent: #17B3A6;
  --accent-bg: #10262A;
  --accent-line: #1E4A4C;
  --amber: #E0A63C;
  --amber-bg: #241C0E;
  --danger: #E06B62;
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
.mc ::selection { background: var(--accent); color: #04120F; }
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
.btn.pri { background: var(--accent); border-color: var(--accent); color: #04120F;
  box-shadow: 0 2px 8px rgba(11,93,102,.24); }
.btn.pri:hover { background: #5B4BD0; }
.btn.deep { background: var(--t1); border-color: var(--t1); color: #04120F;
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
.ph-s { font-size: 9.5px; color: var(--faint); line-height: 1.2; }
.art.xl { width: 178px; height: 249px; } .art.xl .ph-n { font-size: 15px; }
.art.lg { width: 132px; height: 184px; } .art.lg .ph-n { font-size: 13px; }
.art.md { width: 100px; height: 140px; } .art.md .ph-n { font-size: 11px; }
.art.sm { width: 58px; height: 81px; } .art.sm .ph-n { font-size: 8px; } .art.sm .ph-s { display: none; }
.art.xs { width: 40px; height: 56px; } .art.xs .ph-n { font-size: 7px; } .art.xs .ph-s { display: none; }

/* ---- goals: aspirational, one card at a time ---- */
.goal { padding: 20px; margin-bottom: 18px; }
.goal-top { display: flex; gap: 20px; }
.goal-b { flex: 1; min-width: 0; }
.tier { font-family: 'Archivo'; font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase;
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
.goal-supply-h { font-family: 'Archivo'; font-size: 10px; letter-spacing: .09em;
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
.rc-h { font-family: 'Archivo'; font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
  font-weight: 700; color: var(--muted); margin-bottom: 10px; }
.rc-s { display: flex; gap: 11px; padding: 9px 0; border-bottom: 1px solid var(--line-soft); }
.rc-s:last-child { border-bottom: 0; }
.rc-n { flex: 0 0 auto; width: 20px; height: 20px; border-radius: 50%; font-size: 11px;
  font-family: 'IBM Plex Mono', monospace; display: flex; align-items: center;
  justify-content: center; border: 1px solid var(--line); color: var(--faint); }
.rc-s.done .rc-n { background: var(--t1-bg); border-color: var(--accent-line); color: var(--t1); }
.rc-s.current .rc-n { background: var(--t1); border-color: var(--t1); color: #04120F; font-weight: 700; }
.rc-b { flex: 1; min-width: 0; }
.rc-t { display: flex; align-items: baseline; gap: 8px; font-size: 13px; font-weight: 600;
  flex-wrap: wrap; }
.rc-s.pending .rc-t { color: var(--muted); font-weight: 500; }
.rc-s.current .rc-t { color: var(--t1); }
.rc-st { margin-left: auto; font-size: 10.5px; font-weight: 500; color: var(--faint);
  text-transform: uppercase; letter-spacing: .06em; font-family: 'Archivo'; }
.rc-f { display: grid; grid-template-columns: minmax(88px, auto) 1fr; gap: 2px 12px;
  margin: 6px 0 0; font-size: 12.5px; }
.rc-f dt { color: var(--faint); }
.rc-f dd { margin: 0; color: var(--text); overflow-wrap: anywhere; }
.rc-s.pending .rc-f dd { color: var(--muted); }
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
.gp-l { flex: 1; font-size: 9.5px; line-height: 1.25; color: var(--faint); text-align: center;
  overflow: hidden; text-overflow: ellipsis; }
.gp-l.on { color: var(--t1); font-weight: 700; }
@media (max-width: 520px) { .gp-l { font-size: 0; } .gp-l.on { font-size: 10px; } }

/* ---- the shared card identity picker, in the Collector's visual language.
   Same questions as the Trusted Partner asks; consumer spacing and targets. */
.cip-q { margin-bottom: 4px; }
.cip-results { margin-top: 12px; max-height: 340px; overflow-y: auto; }
.cip-row { display: flex; gap: 12px; align-items: center; width: 100%; text-align: left;
  background: none; border: 0; border-bottom: 1px solid var(--line-soft); padding: 10px 4px; }
.cip-row:hover { background: var(--panel-2); }
.cip-main { display: flex; flex-direction: column; min-width: 0; }
.cip-name { font-size: 14.5px; font-weight: 600; line-height: 1.25; }
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
.cip-opt.on { background: var(--accent); border-color: var(--accent); color: #04120F; }
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

/* the live deal: the most consequential thing on a primary goal */
.goal-live { margin-top: 16px; padding: 15px 16px; background: var(--accent-bg);
  border: 1px solid var(--accent-line); border-left: 3px solid var(--t1);
  border-radius: 12px; }
.goal-live-h { display: flex; align-items: baseline; gap: 8px; font-size: 12.5px; }
.goal-live-stage { font-family: 'Archivo'; font-size: 9.5px; letter-spacing: .1em;
  text-transform: uppercase; font-weight: 700; color: var(--t1); }
.goal-live-c { font-size: 14px; margin-top: 7px; font-weight: 500; }
.goal-live-w { font-size: 13.5px; color: var(--muted); margin-top: 10px; }

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
.pt-s-l { font-size: 11.5px; color: var(--muted); margin-top: 4px; line-height: 1.3; }
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
  justify-content: center; border: 1px solid var(--line); color: var(--faint); }
.rail-s.done .rail-n { background: var(--t1-bg); border-color: var(--accent-line); color: var(--t1); }
.rail-s.current .rail-n { background: var(--t1); border-color: var(--t1); color: #04120F; font-weight: 700; }
.rail-l { font-size: 10.5px; line-height: 1.25; text-align: center; color: var(--faint);
  overflow-wrap: anywhere; }
.rail-s.done .rail-l { color: var(--muted); }
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
.turn-w { font-family: 'Archivo'; font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
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
.tabb.on { background: var(--accent); border-color: var(--accent); color: #04120F; }
.tabb.on .faint { color: rgba(255,255,255,.75); }
.act-2 { display: flex; gap: 8px; margin-top: 10px; }
.act-2 .btn { flex: 1; }
.goal-edit { margin-top: 16px; padding-top: 13px; border-top: 1px solid var(--line-soft); }
.rowb { width: 100%; background: none; border: 0; border-bottom: 1px solid var(--line-soft);
  text-align: left; }
.rowb:hover { background: var(--panel-2); }
/* derived goal state — describes reality, never stored */
.state { font-family: 'Archivo'; font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase;
  font-weight: 700; padding: 3px 8px; border-radius: 5px; }
.state.seeking { background: var(--panel-2); color: var(--muted); border: 1px solid var(--line); }
.state.negotiating { background: var(--t1-bg); color: var(--t1); border: 1px solid var(--accent-line); }
.state.satisfied { background: #102A18; color: #57C97E; border: 1px solid #1E4A2C; }

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
  .pg-t { font-size: 34px; }
  .bnd { grid-template-columns: repeat(auto-fill, minmax(184px, 1fr)); gap: 22px; }
  .ovl { align-items: center; }
  .sheet { border-radius: 18px; max-width: 520px; }
}
`;

/* ============================ SHARED PIECES ============================ */

/* Card artwork stands in for a real image. Even at the smallest size it always
   carries the card's name, so a screen never degrades into blank plates. */
function Art({ card, size = "lg" }) {
  const [failed, setFailed] = useState(false);
  /* The shared catalog names this csvId — the same field the Trusted Partner
     app uses, so both personas render identical artwork. */
  const src = artUrl(card.csvId);
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
function Track({ stage, o, st }) {
  const r = D.receiptForOpportunity(o || { stage, trade: { cards: [] } }, {
    binderById: st && st.binderById, cardById: st && st.cardById,
    partnerById: st && st.partnerById });
  return (
    <>
      <ol className="rail" aria-label={`Stage ${r.stageIndex + 1} of 5: ${STAGE[stage].label}`}>
        {r.stages.map((s2) => (
          <li key={s2.id} className={"rail-s " + s2.state}
            aria-current={s2.state === "current" ? "step" : undefined}>
            <span className="rail-n" aria-hidden="true">{s2.n}</span>
            <span className="rail-l">{s2.label}</span>
            <span className="sr">{s2.state === "done" ? "complete"
              : s2.state === "current" ? "current" : "not started"}</span>
          </li>
        ))}
      </ol>
      <div className="faint" style={{ fontSize: 13.5, marginTop: 10 }}>{STAGE_BLURB[stage]}</div>
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

function Goals({ st, go }) {
  const { goals } = st;
  const [adding, setAdding] = useState(false);
  const primary = goals.filter((g) => g.tier === "primary");
  const secondary = goals.filter((g) => g.tier === "secondary");

  return (
    <div className="pg">
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
      ) : primary.map((g) => <GoalCard key={g.id} g={g} st={st} go={go} />)}

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
function Receipt({ o, st, expanded }) {
  const r = D.receiptForOpportunity(o, {
    binderById: st.binderById, cardById: st.cardById, partnerById: st.partnerById });
  if (!r) return null;
  const pend = (v, word) => (v == null || v === "" ? <span className="rc-p">{word}</span> : v);

  return (
    <div className={"rc" + (expanded ? " rc-x" : "")}>
      <div className="rc-h">Deal receipt</div>
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

function GoalCard({ g, st, go }) {
  const c = st.cardById(g.cardId);
  const holders = st.partnersWith(g.cardId);
  const live = st.openOppForGoal(g.id);
  const partner = live ? st.partnerById(live.partnerId) : null;
  const state = st.stateOf(g.id);
  const [menu, setMenu] = useState(false);
  const act = live ? nextActionFor(live, st) : null;

  return (
    <div className="card goal">
      <div className="goal-top">
        <Art card={c} size="lg" />
        <div className="goal-b">
          <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
            <span className="tier p">Primary</span>
            <span className={"state " + state}>{GOAL_STATE[state]}</span>
          </div>
          <div className="goal-n disp">{c.name}</div>
          <div className="goal-i">{cardLine(c)}</div>
          <div className="goal-i">{gradeLine(c)}</div>
          <div className="faint" style={{ fontSize: 13, marginTop: 6 }}>
            On your list since {fmtDate(g.since)}
          </div>
        </div>
      </div>

      {/* THE ACTIVE DEAL. Stage is context; the CTA names the actual next action,
          derived from canonical opportunity state. Navigation only. */}
      {live && (
        <div className="goal-live">
          <div className="goal-live-h">
            <span className="goal-live-stage">{STAGE[live.stage].label}</span>
            <span className="faint">with {partner.name}</span>
          </div>
          {act.context && <div className="goal-live-c">{act.context}</div>}
          {act.cta ? (
            <button className="btn pri wide" style={{ marginTop: 11 }}
              onClick={() => go({ v: "deal", oppId: live.id })}>
              {act.cta}
            </button>
          ) : (
            <div className="goal-live-w">{act.waiting}</div>
          )}
        </div>
      )}

      {/* SUPPLY. With no deal running, the partners who can help ARE the action:
          list them all, each contactable. With a deal running, they stay one tap
          away, because a negotiation with one partner must not hide the others. */}
      {holders.length === 0 ? (
        <div className="goal-avail faint">
          None of your partners have this yet. They'll see you're looking.
        </div>
      ) : live ? (
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
            const talked = st.contactsFor(g.id, h.partner.id).length > 0;
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
                  <button className="btn sm" onClick={() => st.reachOut(g.id, h.partner.id, g.cardId)}>
                    {talked ? "Continue chatting" : "Reach out"}
                  </button>
                </div>
              </div>
            );
          })}
          <button className="btn sm pri gs-offer" onClick={() => go({ v: "start", goalId: g.id })}>
            Make an offer
          </button>
        </div>
      )}

      {/* THE RECEIPT. A deal fills itself in as it advances: settled stages show
          what was agreed, the current stage shows what is being decided, and
          later stages stay deliberately blank. Every value is a projection of
          canonical opportunity state — see receiptForOpportunity. */}
      {live && <Receipt o={live} st={st} />}

      <div className="goal-edit">
        <button className="link" onClick={() => setMenu(!menu)} aria-expanded={menu}>
          Edit this goal
        </button>
        {menu && (
          <div className="act-2" style={{ marginTop: 10 }}>
            <button className="btn sm" onClick={() => st.setTier(g.id, "secondary")}>
              Move to Secondary
            </button>
            <button className="btn sm" disabled={!!live}
              title={live ? "Finish or stop the negotiation first" : undefined}
              onClick={() => st.removeGoal(g.id)}>Remove</button>
          </div>
        )}
        {menu && live && (
          <div className="faint" style={{ fontSize: 12, marginTop: 7 }}>
            You're negotiating this one — finish or stop that first to remove it.
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================ TRADE BINDER ============================
   A digital binder: a grid of the collector's own cards, artwork first. The
   private reference value lives here and nowhere else — it is the collector's
   own note to self, never sent to a partner. */

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
            return (
              <div key={s2.invId || s2.cardId} className="card bnd-c">
                <Art card={c} size="md" />
                <div className="bnd-n">{c.name}</div>
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
                    {state === "negotiating" ? (
                      <div className="bnd-int" style={{ color: "var(--muted)" }}>
                        Negotiating elsewhere
                      </div>
                    ) : (
                      <div className="act-2">
                        <button className="btn sm" onClick={() => st.reachOut(g.id, partnerId, c.id)}>
                          Reach out
                        </button>
                        <button className="btn sm pri"
                          onClick={() => go({ v: "offer", goalId: g.id, partnerId, cardId: c.id })}>
                          Make an offer
                        </button>
                      </div>
                    )}
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

function Deal({ oppId, st, go }) {
  const o = st.opps.find((x) => x.id === oppId);
  if (!o) return <div className="pg"><div className="card empty">This deal is no longer open.</div></div>;
  const g = st.goals.find((x) => x.id === o.goalId);
  const c = st.cardById(g.cardId);
  const p = st.partnerById(o.partnerId);
  const t = st.turnFor(o);

  return (
    <div className="pg">
      <button className="link" onClick={() => go({ v: "goals" })}>← Goals</button>

      <div className="card dl-hero" style={{ marginTop: 14 }}>
        <Art card={c} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="goal-n disp" style={{ marginTop: 0 }}>{c.name}</div>
          <div className="goal-i">{cardLine(c)}</div>
          <div className="goal-i">{gradeLine(c)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <Face partner={p} size={26} />
            <span style={{ marginLeft: 8, fontWeight: 600 }}>{p.name}</span>
          </div>
        </div>
      </div>

      <div className="card sec">
        <Track stage={o.stage} o={o} st={st} />
      </div>

      <Turn o={o} st={st} />

      {o.stage === "agree-price" && <AgreePrice o={o} st={st} />}
      {o.stage === "select-trade" && <SelectTrade o={o} st={st} />}
      {o.stage === "value-trade" && <ValueTrade o={o} st={st} />}
      {o.stage === "deal" && <DealStage o={o} st={st} />}
      {o.stage === "fulfillment" && <Fulfillment o={o} st={st} />}
      {o.stage === "completed" && <Completed o={o} />}

      {/* THE SAME RECEIPT the Goal card shows, expanded. One projection, two
          densities — so the two surfaces cannot disagree. */}
      <div className="card sec">
        <Receipt o={o} st={st} expanded />
      </div>

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

function AgreePrice({ o, st }) {
  const last = lastEntry(o.priceThread);
  const mine = st.turnFor(o).who === "me";
  const [amt, setAmt] = useState("");
  const n = Number(amt);
  const ok = amt !== "" && isFinite(n) && n > 0;

  return (
    <div className="card sec">
      <div className="sec-h">Price</div>
      <div className="row"><span className="k">They're asking</span><span className="mono">{money(o.listedPrice)}</span></div>
      {o.priceThread.map((e, i) => (
        <div key={i} className="row">
          <span className="k">{e.by === "me" ? "You" : "They"} {e.type === "offer" ? "offered" : e.type === "accept" ? "accepted" : "countered"}</span>
          <span className="mono">{money(e.amount)} · {Math.round((e.amount / o.listedPrice) * 100)}%</span>
        </div>
      ))}
      {mine && last && (
        <>
          <button className="btn deep wide" style={{ marginTop: 16 }}
            onClick={() => st.priceRespond(o.id, "accept")}>
            Accept {money(last.amount)}
          </button>
          <div className="faint" style={{ fontSize: 13, textAlign: "center", margin: "14px 0 10px" }}>
            or offer something else
          </div>
          <input className="inp" inputMode="decimal" value={amt} placeholder="$"
            aria-label="Your counter offer"
            onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ""))} />
          {ok && <div className="faint" style={{ fontSize: 13, marginTop: 7 }}>
            That's {Math.round((n / o.listedPrice) * 100)}% of what they're asking.
          </div>}
          <button className="btn pri wide" style={{ marginTop: 12 }} disabled={!ok}
            onClick={() => { st.priceRespond(o.id, "counter", n); setAmt(""); }}>
            Send counter
          </button>
        </>
      )}
    </div>
  );
}

/* Select Trade — choosing which of your cards to put toward the purchase.
   Inclusion only: no values, no percentages, no money anywhere on this stage.
   Only copies the partner has already shown interest in are eligible. */
function SelectTrade({ o, st }) {
  const [picked, setPicked] = useState([]);   // never pre-selected: the collector chooses
  const groups = st.eligibleFor(o.partnerId, o);
  const eligible = [...groups.interested, ...groups.other];
  const inPack = o.trade.cards;

  if (!o.trade.submitted) {
    return (
      <div className="card sec">
        <div className="sec-h">Your cards</div>
        <div style={{ fontSize: 14, marginBottom: 14 }}>
          Pick what you'd put toward this. You'll agree what each one is worth after
          they've said yes or no.
        </div>
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
        {eligible.length > 0 && (
          <button className="btn pri wide" style={{ marginTop: 14 }} disabled={!picked.length}
            onClick={() => st.submitTrade(o.id, picked)}>
            Send {picked.length || ""} card{picked.length === 1 ? "" : "s"} for review
          </button>
        )}
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
function ValueTrade({ o, st }) {
  return (
    <>
      {acceptedCards(o).map((tcd) => (
        <ValueCard key={tcd.binderId} o={o} tcd={tcd} st={st} />
      ))}
    </>
  );
}

function ValueCard({ o, tcd, st }) {
  const b = st.binderById(tcd.binderId);
  const c = st.cardById(b.cardId);
  /* Their private reference value prefills the field as a convenience. Nothing
     reaches the partner until they press send. */
  const [mkt, setMkt] = useState(tcd.collectorMarket != null ? String(tcd.collectorMarket) : String(b.market ?? ""));
  const [pc, setPc] = useState(tcd.collectorPercent != null ? String(Math.round(tcd.collectorPercent * 100)) : "80");
  const settled = cardSettled(tcd);
  const mSettled = marketSettled(tcd);

  return (
    <div className="card sec">
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 14 }}>
        <Art card={c} size="md" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{c.name}</div>
          <div className="faint" style={{ fontSize: 13.5 }}>{cardLine(c)} · {gradeLine(c)}</div>
          {settled && <span className="chip t" style={{ marginTop: 8 }}>Settled</span>}
        </div>
      </div>

      {settled ? (
        <>
          <div className="row"><span className="k">Value you both agreed</span>
            <span className="mono">{money(tcd.agreedMarket)}</span></div>
          <div className="row"><span className="k">Share going to the trade</span>
            <span className="mono">{pct(tcd.agreedPercent)}</span></div>
          <div className="row tot"><span>Worth toward the card</span>
            <span className="mono">{money(tradeValue(tcd))}</span></div>
        </>
      ) : !mSettled ? (
        <>
          <div className="sec-h">What's it worth?</div>
          {tcd.tpMarket != null && (
            <div className="row"><span className="k">They say</span>
              <span className="mono">{money(tcd.tpMarket)}</span></div>
          )}
          {tcd.tpMarket != null && (
            <button className="btn deep wide" style={{ margin: "12px 0" }}
              onClick={() => st.marketRespond(o.id, tcd.binderId, "accept")}>
              Agree on {money(tcd.tpMarket)}
            </button>
          )}
          <input className="inp" inputMode="decimal" value={mkt} aria-label="What you think it's worth"
            onChange={(e) => setMkt(e.target.value.replace(/[^\d.]/g, ""))} />
          <div className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>
            Starts from your own note. They only see what you send.
          </div>
          <button className="btn pri wide" style={{ marginTop: 12 }} disabled={!(Number(mkt) > 0)}
            onClick={() => st.marketRespond(o.id, tcd.binderId, "propose", Number(mkt))}>
            Send {money(Number(mkt))}
          </button>
        </>
      ) : (
        <>
          <div className="row"><span className="k">Value you both agreed</span>
            <span className="mono">{money(tcd.agreedMarket)}</span></div>
          <div className="sec-h" style={{ marginTop: 16 }}>How much counts toward the card?</div>
          {tcd.tpPercent != null && (
            <button className="btn deep wide" style={{ marginBottom: 12 }}
              onClick={() => st.pctRespond(o.id, tcd.binderId, "accept")}>
              Agree on {pct(tcd.tpPercent)} — {money(Math.round(tcd.agreedMarket * tcd.tpPercent))}
            </button>
          )}
          <input className="inp" inputMode="decimal" value={pc} aria-label="Percentage toward the trade"
            onChange={(e) => setPc(e.target.value.replace(/[^\d.]/g, ""))} />
          <div className="faint" style={{ fontSize: 13, marginTop: 7 }}>
            {Number(pc) > 0
              ? `${Math.round(Number(pc))}% of ${money(tcd.agreedMarket)} is ${money(Math.round(tcd.agreedMarket * Number(pc) / 100))} toward the card.`
              : "Enter a percentage to see what it's worth."}
          </div>
          <button className="btn pri wide" style={{ marginTop: 12 }}
            disabled={!(Number(pc) > 0 && Number(pc) <= 100)}
            onClick={() => st.pctRespond(o.id, tcd.binderId, "propose", Number(pc) / 100)}>
            Send {Math.round(Number(pc) || 0)}%
          </button>
        </>
      )}
    </div>
  );
}

/* Deal — the calculated balance, its derivation, then an optional final
   negotiation. Nothing here reopens a price, a value or a percentage. */
function DealStage({ o, st }) {
  const [amt, setAmt] = useState("");
  const calc = calcBalance(o);
  const p = st.partnerById(o.partnerId);
  const proposed = o.deal.proposedAdj != null ? o.deal.proposedAdj : null;
  const fromPartner = o.deal.proposedBy && o.deal.proposedBy !== "collector";
  const n = Number(amt);

  return (
    <>
      <div className="card sec">
        <div className="sec-h">How the balance works out</div>
        <div className="row"><span className="k">Price you agreed</span>
          <span className="mono">{money(o.agreedPrice)}</span></div>
        {acceptedCards(o).map((tcd) => {
          const b = st.binderById(tcd.binderId);
          return (
            <div key={tcd.binderId} className="row">
              <span className="k">{st.cardById(b.cardId).name}</span>
              <span className="mono">−{money(tradeValue(tcd))}</span>
            </div>
          );
        })}
        <div className="row tot">
          <span>{calc >= 0 ? "You pay" : `${p.name} pays you`}</span>
          <span className="mono">{money(Math.abs(calc))}</span>
        </div>
      </div>

      <div className="card sec">
        <div className="sec-h">Final negotiation</div>
        <div style={{ fontSize: 14, marginBottom: 12 }}>
          {proposed == null
            ? <>The numbers above are settled. If you'd like to land somewhere different, propose a final figure — everything you already agreed stays the same.</>
            : fromPartner
              ? <>{p.name} suggested settling at <b className="mono">{money(o.deal.proposedAdj)}</b> instead of {money(Math.abs(calc))}.</>
              : <>You suggested <b className="mono">{money(o.deal.proposedAdj)}</b>. Waiting on them.</>}
        </div>

        {st.turnFor(o).who === "me" && (
          <>
            {fromPartner && (
              <button className="btn deep wide" style={{ marginBottom: 12 }}
                onClick={() => st.dealAgree(o.id, o.deal.proposedAdj)}>
                Agree on {money(o.deal.proposedAdj)}
              </button>
            )}
            {!fromPartner && (
              <button className="btn deep wide" style={{ marginBottom: 12 }}
                onClick={() => st.dealAgree(o.id, calc)}>
                Agree on {money(Math.abs(calc))}
              </button>
            )}
            <input className="inp" inputMode="decimal" value={amt} placeholder="Propose a different figure"
              aria-label="Propose a final cash amount"
              onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ""))} />
            <div className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>
              Only the cash changes. Card values and percentages stay exactly as agreed.
            </div>
            <button className="btn pri wide" style={{ marginTop: 12 }} disabled={!(n > 0)}
              onClick={() => { st.dealPropose(o.id, n); setAmt(""); }}>
              Propose {money(n || 0)}
            </button>
          </>
        )}
      </div>
    </>
  );
}

function Fulfillment({ o, st }) {
  const f = o.fulfillment || {};
  const p = st.partnerById(o.partnerId);
  return (
    <div className="card sec">
      <div className="sec-h">Handoff</div>
      <div className="row"><span className="k">How</span><span>{f.method}</span></div>
      <div className="row"><span className="k">Where</span><span>{f.where}</span></div>
      <div className="row"><span className="k">When</span><span>{f.when}</span></div>
      <div className="row"><span className="k">Settling up</span>
        <span className="mono">{money(Math.abs(finalBalance(o)))} {finalBalance(o) >= 0 ? "to them" : "to you"}</span></div>
      <div className="row"><span className="k">{p.name}</span>
        <span>{f.tpDone ? "Confirmed" : "Not yet"}</span></div>
      {!f.collectorDone && (
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
  const [sent, setSent] = useState([]);

  return (
    <Sheet title={c.name} sub={`${cardLine(c)} · ${gradeLine(c)}`} onClose={() => go({ v: "goals" })}
      footer={<button className="btn wide" onClick={() => go({ v: "goals" })}>Close</button>}>
      <div style={{ fontSize: 14, marginBottom: 6 }}>
        {holders.length} of your partners {holders.length === 1 ? "has" : "have"} this card.
      </div>
      {live && (
        /* Alternatives stay visible during a negotiation — the collector can still
           talk to anyone. Only the structured offer is limited to one at a time. */
        <div className="faint" style={{ fontSize: 13, marginBottom: 12 }}>
          You're negotiating this card with {st.partnerById(live.partnerId).name}. You can still
          reach out to others, but you can only negotiate with one at a time.
        </div>
      )}

      {holders.map((h) => {
        const already = sent.includes(h.partner.id)
          || st.contactsFor(goalId, h.partner.id).length > 0;
        const openness = st.interestCountFrom(h.partner.id);
        return (
          <div key={h.partner.id} className="pick" style={{ cursor: "default", alignItems: "flex-start" }}>
            <Face partner={h.partner} size={38} />
            <div className="pick-b" style={{ marginLeft: 10 }}>
              <div style={{ fontWeight: 600 }}>{h.partner.name}</div>
              <div className="faint" style={{ fontSize: 13 }}>{h.partner.city}</div>
              <div className="faint" style={{ fontSize: 12.5, marginTop: 3 }}>
                {cardLine(c)} · {gradeLine(c)}
              </div>
              {openness > 0 && (
                <div style={{ fontSize: 12.5, color: "var(--t1)", marginTop: 3 }}>
                  Open to {openness} of your binder card{openness === 1 ? "" : "s"}
                </div>
              )}
              <div className="act-2" style={{ marginTop: 9 }}>
                <button className="btn sm" disabled={already}
                  onClick={() => { st.reachOut(goalId, h.partner.id, c.id); setSent([...sent, h.partner.id]); }}>
                  {already ? "Reached out" : "Reach out"}
                </button>
                {!live && (
                  <button className="btn sm pri"
                    onClick={() => go({ v: "offer", goalId, partnerId: h.partner.id })}>
                    Make an offer
                  </button>
                )}
              </div>
            </div>
            <div className="mono" style={{ fontWeight: 700 }}>{money(h.ask)}</div>
          </div>
        );
      })}
      <div className="faint" style={{ fontSize: 12.5, marginTop: 12 }}>
        Reaching out is just a conversation — it doesn't start a negotiation or commit you
        to anything. Only you can make an offer.
      </div>
    </Sheet>
  );
}

/* ---- Starting a negotiation. Deliberate, confirmed, and the one-at-a-time
       rule is stated BEFORE the collector commits, not after they try. ---- */
function StartOffer({ goalId, partnerId, st, go }) {
  const [promote, setPromote] = useState(null);
  const g = st.goals.find((x) => x.id === goalId);
  const c = st.cardById(g.cardId);
  const p = st.partnerById(partnerId);
  /* Canonical supply: this partner's inventory at the goal's exact identity. */
  const match = st.partnersWith(g.cardId).find((x) => x.partner.id === partnerId);
  const stock = match ? { ask: match.ask } : null;
  const live = st.openOppForGoal(goalId);
  const [amt, setAmt] = useState(stock ? String(Math.round(stock.ask * 0.9)) : "");
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

  return (
    <Sheet title="Make an offer" sub={`${c.name} · ${cardLine(c)} · ${gradeLine(c)}`}
      onClose={() => go({ v: "partner", partnerId })}
      footer={<>
        <button className="btn" onClick={() => go({ v: "partner", partnerId })}>Cancel</button>
        <button className="btn pri" style={{ flex: 1 }} disabled={!(n > 0)}
          onClick={() => {
            const res = st.startOffer(goalId, partnerId, n);
            /* Refused because this is a watchlist goal — offer promotion rather
               than a dead end. The collector decides; MetYet never promotes for
               them. */
            if (res && res.refused === D.REFUSE.notPrimary) { setPromote(n); return; }
            if (res && res.refused) return;
            go({ v: "deal", oppId: res });
          }}>
          Send offer
        </button>
      </>}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 18 }}>
        <Art card={c} size="md" />
        <div>
          <div style={{ fontWeight: 600 }}>{p.name}</div>
          <div className="faint" style={{ fontSize: 13.5 }}>asking {money(stock?.ask)}</div>
        </div>
      </div>
      <input className="inp" inputMode="decimal" value={amt} aria-label="Your offer"
        onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ""))} />
      {n > 0 && stock && (
        <div className="faint" style={{ fontSize: 13, marginTop: 8 }}>
          That's {Math.round((n / stock.ask) * 100)}% of what they're asking.
        </div>
      )}
      <div className="faint" style={{ fontSize: 12.5, marginTop: 14 }}>
        Only you can start a negotiation. Once this is open, you'll work through price,
        then any cards you trade, then the balance — one step at a time.
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
      reachOut: (goalId, partnerId, cardId) =>
        A.reachOut({ collectorId, partnerId, goalId, cardId, at: AT }),
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

      priceRespond: (id, action, amount) => A.patchOpportunity(id, (o) => {
        if (action === "accept") {
          const last = D.lastEntry(o.priceThread);
          return { ...o, agreedPrice: last.amount, stage: "select-trade",
            priceThread: [...o.priceThread, { by: "collector", type: "accept", amount: last.amount, at: AT }] };
        }
        return { ...o, priceThread: [...o.priceThread, { by: "collector", type: "counter", amount, at: AT }] };
      }),
      submitTrade: (id, binderIds) => A.patchOpportunity(id, (o) => ({
        ...o, trade: { submitted: true, cards: binderIds.map((b) => ({ binderId: b, inclusion: "proposed" })) } })),
      marketRespond: (id, binderId, action, amount) => A.patchOpportunity(id, (o) => ({
        ...o, trade: { ...o.trade, cards: o.trade.cards.map((c) => (c.binderId !== binderId ? c
          : action === "accept" ? { ...c, agreedMarket: c.tpMarket } : { ...c, collectorMarket: amount })) } })),
      pctRespond: (id, binderId, action, frac) => A.patchOpportunity(id, (o) => {
        const next = { ...o, trade: { ...o.trade, cards: o.trade.cards.map((c) => (c.binderId !== binderId ? c
          : action === "accept" ? { ...c, agreedPercent: c.tpPercent } : { ...c, collectorPercent: frac })) } };
        return D.acceptedTradeCards(next).every(D.cardSettled) ? { ...next, stage: "deal" } : next;
      }),
      dealPropose: (id, amount) => A.patchOpportunity(id, (o) => ({
        ...o, deal: { ...o.deal, proposedBy: "collector", proposedAdj: amount } })),
      dealAgree: (id, amount) => A.patchOpportunity(id, (o) => ({
        ...o, stage: "fulfillment",
        deal: { ...o.deal, agreedAdj: amount, tpAgreed: true, collectorAgreed: true },
        fulfillment: { method: "Meet in person", where: "To arrange", when: "To arrange",
          collectorDone: false, tpDone: false } })),
      confirmHandoff: (id) => A.patchOpportunity(id, (o) => {
        const f = { ...o.fulfillment, collectorDone: true };
        return f.tpDone ? { ...o, fulfillment: f, stage: "completed", completedAt: AT }
          : { ...o, fulfillment: f };
      }),
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
      {nav.v === "offer" && <StartOffer goalId={nav.goalId} partnerId={nav.partnerId} st={st} go={go} />}
      {nav.v === "add" && <AddCopy st={st} go={go} />}
    </div>
  );
}
