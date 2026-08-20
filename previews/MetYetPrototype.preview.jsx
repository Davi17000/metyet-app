/* GENERATED PREVIEW — DO NOT EDIT
 *
 * Built from the canonical modular source by build-preview.mjs:
 *   shell/MetYetPrototype.jsx
 *   domain/metyet-domain.js
 *   domain/metyet-entities.js
 *   domain/metyet-store.js
 *   domain/collector-view.js
 *
 * This file exists ONLY so the Collector experience can be previewed in an
 * environment that cannot resolve module imports. It is a build output, not a
 * source of truth, and it is not an input to future development. Change the
 * modules and re-run: node build-preview.mjs
 */
import React, { useState, useRef, useMemo, useCallback, useEffect, useSyncExternalStore } from "react";
const React3 = React;
const React2 = React;
const useState3 = useState;
const useRef2 = useRef;
const useState2 = useState;
const useMemo2 = useMemo;
const useSyncExternalStore2 = useSyncExternalStore;

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// domain/metyet-domain.js
var require_metyet_domain = __commonJS({
  "domain/metyet-domain.js"(exports, module) {
    var identityKey2 = (c) => !c ? "" : [
      c.name,
      c.set,
      c.num,
      c.print,
      c.edition,
      c.language,
      c.grade,
      c.grade === "Raw" ? c.condition || "" : ""
    ].join("|").toLowerCase();
    var isRaw3 = (c) => c && c.grade === "Raw";
    var sameIdentity = (a, b) => identityKey2(a) === identityKey2(b);
    var STAGES4 = [
      { id: "secondary", label: "Secondary Goal", group: "intent" },
      { id: "primary", label: "Primary Goal", group: "intent" },
      { id: "agree-price", label: "Agree on Price", group: "deal" },
      { id: "select-trade", label: "Select Trade", group: "deal" },
      { id: "value-trade", label: "Value Trade", group: "deal" },
      { id: "deal", label: "Deal", group: "deal" },
      { id: "fulfillment", label: "Fulfillment", group: "deal" },
      { id: "completed", label: "Completed", group: "closed" }
    ];
    var STAGE_IX3 = Object.fromEntries(STAGES4.map((s, i) => [s.id, i]));
    var STAGE_LABEL2 = Object.fromEntries(STAGES4.map((s) => [s.id, s.label]));
    var isEnded = (o) => !!o.declined;
    var isCompleted = (o) => o.stage === "completed";
    var isTerminal2 = (o) => isCompleted(o) || isEnded(o);
    var isActive3 = (o) => !isTerminal2(o);
    var isNegotiating2 = (o) => isActive3(o) && STAGE_IX3[o.stage] >= STAGE_IX3["agree-price"];
    var activeOppForGoal = (goalId, opps) => opps.find((o) => o.goalId === goalId && isNegotiating2(o)) || null;
    var goalState = (goalId, opps) => {
      const mine = opps.filter((o) => o.goalId === goalId);
      if (mine.some(isCompleted)) return "satisfied";
      if (mine.some(isNegotiating2)) return "negotiating";
      return "seeking";
    };
    var acceptedTradeCards2 = (o) => (o.trade && o.trade.cards || []).filter((c) => c.inclusion === "accepted" && !c.withdrawn);
    var cardSettled3 = (c) => c.agreedMarket != null && c.agreedPercent != null;
    var tradeValueOf2 = (c) => cardSettled3(c) ? Math.round(c.agreedMarket * c.agreedPercent) : null;
    var totalTradeValue3 = (o) => acceptedTradeCards2(o).reduce((a, c) => a + (tradeValueOf2(c) || 0), 0);
    var calculatedBalance2 = (o) => o.agreedPrice == null ? null : o.agreedPrice - totalTradeValue3(o);
    var finalBalance3 = (o) => o.deal && o.deal.agreedAdj != null ? o.deal.agreedAdj : calculatedBalance2(o);
    var lastEntry4 = (t) => t && t.length ? t[t.length - 1] : null;
    function nextActor(o) {
      if (isEnded(o)) return { actor: null, reason: "ended" };
      switch (o.stage) {
        case "secondary":
        case "primary":
          return { actor: "collector", reason: "offer" };
        case "agree-price": {
          const last = lastEntry4(o.priceThread);
          if (!last) return { actor: "collector", reason: "offer" };
          return last.by === "collector" ? { actor: "partner", reason: "price", amount: last.amount } : { actor: "collector", reason: "price", amount: last.amount };
        }
        case "select-trade":
          if (!o.trade || !o.trade.submitted) return { actor: "collector", reason: "choose-trade" };
          return (o.trade.cards || []).some((c) => c.inclusion === "proposed") ? { actor: "partner", reason: "review-trade" } : { actor: "collector", reason: "trade-reviewed" };
        case "value-trade": {
          const open = acceptedTradeCards2(o).filter((c) => !cardSettled3(c));
          if (!open.length) return { actor: "collector", reason: "values-settled" };
          const waiting = open.every((c) => c.agreedMarket != null ? c.collectorPercent != null : c.collectorMarket != null);
          return waiting ? { actor: "partner", reason: "value", count: open.length } : { actor: "collector", reason: "value", count: open.length };
        }
        case "deal": {
          const d = o.deal || {};
          if (d.tpAgreed && d.collectorAgreed) return { actor: null, reason: "agreed" };
          if (d.proposedBy && d.proposedBy !== "collector") return { actor: "collector", reason: "final" };
          if (d.proposedBy === "collector") return { actor: "partner", reason: "final" };
          return { actor: "collector", reason: "final" };
        }
        case "fulfillment": {
          const f = o.fulfillment || {};
          return f.collectorDone ? { actor: "partner", reason: "handoff" } : { actor: "collector", reason: "handoff" };
        }
        default:
          return { actor: null, reason: "done" };
      }
    }
    var INVARIANTS = {
      /* A collector may pursue one structured negotiation per goal at a time.
         Alternatives stay visible and reachable — only the offer is limited. */
      oneNegotiationPerGoal: (goalId, opps) => activeOppForGoal(goalId, opps) == null,
      /* A binder copy is a physical thing a partner must be able to evaluate.
         Both faces or it does not exist. */
      binderCopyPhotographed: (photos) => !!(photos && photos.front && photos.back)
    };
    module.exports = {
      identityKey: identityKey2,
      isRaw: isRaw3,
      sameIdentity,
      STAGES: STAGES4,
      STAGE_IX: STAGE_IX3,
      STAGE_LABEL: STAGE_LABEL2,
      isEnded,
      isCompleted,
      isTerminal: isTerminal2,
      isActive: isActive3,
      isNegotiating: isNegotiating2,
      activeOppForGoal,
      goalState,
      acceptedTradeCards: acceptedTradeCards2,
      cardSettled: cardSettled3,
      tradeValueOf: tradeValueOf2,
      totalTradeValue: totalTradeValue3,
      calculatedBalance: calculatedBalance2,
      finalBalance: finalBalance3,
      lastEntry: lastEntry4,
      nextActor,
      INVARIANTS
    };
  }
});

// domain/metyet-entities.js
var require_metyet_entities = __commonJS({
  "domain/metyet-entities.js"(exports, module) {
    var D2 = require_metyet_domain();
    var SELF = "p-self";
    var newConversation = ({ collectorId, partnerId, goalId, invId, binderId, oppId, at }) => ({
      id: "cv" + Math.random().toString(36).slice(2, 9),
      collectorId,
      partnerId,
      goalId: goalId || null,
      invId: invId || null,
      binderId: binderId || null,
      oppId: oppId || null,
      openedAt: at,
      messages: []
    });
    var newMessage = (by, text, at) => ({ by, text, at });
    var interestKey = (partnerId, binderId) => partnerId + "::" + binderId;
    var hasInterest = (interests, partnerId, binderId) => interests.some((i) => i.partnerId === partnerId && i.binderId === binderId);
    var partnersInterestedIn = (interests, binderId) => interests.filter((i) => i.binderId === binderId).map((i) => i.partnerId);
    var binderCopiesInterestedBy = (interests, partnerId) => interests.filter((i) => i.partnerId === partnerId).map((i) => i.binderId);
    var inventoryOf = (inventory, partnerId) => inventory.filter((i) => i.partnerId === partnerId && !i.archived);
    var partnersHolding = (inventory, card, cardById) => inventory.filter((i) => !i.archived && D2.sameIdentity(cardById(i.cardId), card));
    var goalsMatchingCard = (goals, card, cardById) => goals.filter((g) => D2.sameIdentity(cardById(g.cardId), card));
    var demandForIdentity = (goals, card, cardById, excludeCollectorId) => goalsMatchingCard(goals, card, cardById).filter((g) => g.collectorId !== excludeCollectorId);
    var binderCopyForPartner = (cc) => {
      if (!cc) return null;
      const { market, ...visible } = cc;
      return visible;
    };
    var binderCopiesForPartner = (ccs) => ccs.map(binderCopyForPartner);
    var binderCopyForOwner = (cc) => cc;
    var submittedMarketOf = (tc, by) => by === "collector" ? tc.collectorMarket : tc.tpMarket;
    module.exports = {
      SELF,
      newConversation,
      newMessage,
      interestKey,
      hasInterest,
      partnersInterestedIn,
      binderCopiesInterestedBy,
      inventoryOf,
      partnersHolding,
      goalsMatchingCard,
      demandForIdentity,
      binderCopyForPartner,
      binderCopiesForPartner,
      binderCopyForOwner,
      submittedMarketOf
    };
  }
});

// domain/metyet-store.js
var require_metyet_store = __commonJS({
  "domain/metyet-store.js"(exports, module) {
    var D2 = require_metyet_domain();
    var E2 = require_metyet_entities();
    function createStore4(seed) {
      let s = {
        /* Spread first so a persona's canonical collections are never silently
           dropped by this whitelist; the named keys below document the core set. */
        ...seed,
        catalog: seed.catalog,
        // card identities
        collectors: seed.collectors,
        partners: seed.partners,
        goals: seed.goals,
        // {id, collectorId, cardId, tier, since, note}
        inventory: seed.inventory,
        // {invId, partnerId, cardId, ask, cost, ...}
        binder: seed.binder,
        // {id, collectorId, cardId, market, photos, cert, addedAt}
        interests: seed.interests,
        // {partnerId, binderId, at}
        conversations: seed.conversations,
        // see entities.newConversation
        opportunities: seed.opportunities,
        preferences: seed.preferences
        // {collectorId, tags[]}
      };
      const subs = /* @__PURE__ */ new Set();
      const get = () => s;
      const set = (next) => {
        s = next;
        subs.forEach((f) => f(s));
      };
      const sub = (f) => {
        subs.add(f);
        return () => subs.delete(f);
      };
      const cardById = (id) => s.catalog.find((c) => c.id === id);
      const actions = {
        /* ---- goals: what a collector wants. Only the collector creates one. ---- */
        addGoal({ collectorId, cardId, tier, at }) {
          if (s.goals.some((g) => g.collectorId === collectorId && g.cardId === cardId)) return null;
          const id = "g" + Math.random().toString(36).slice(2, 9);
          set({ ...s, goals: [...s.goals, {
            id,
            collectorId,
            cardId,
            tier: tier === "primary" ? "primary" : "secondary",
            since: at,
            note: ""
          }] });
          return id;
        },
        updateGoalTier(goalId, tier) {
          set({ ...s, goals: s.goals.map((g) => g.id === goalId ? { ...g, tier: tier === "primary" ? "primary" : "secondary" } : g) });
        },
        removeGoal(goalId) {
          if (D2.activeOppForGoal(goalId, s.opportunities)) return false;
          set({ ...s, goals: s.goals.filter((g) => g.id !== goalId) });
          return true;
        },
        /* ---- inventory: what a partner holds ---- */
        addInventoryCopy(copy) {
          set({ ...s, inventory: [...s.inventory, copy] });
          return copy.invId;
        },
        removeInventoryCopy(invId) {
          set({ ...s, inventory: s.inventory.map((i) => i.invId === invId ? { ...i, archived: true } : i) });
        },
        /* ---- binder: what a collector will trade ---- */
        addBinderCopy(copy) {
          if (!D2.INVARIANTS.binderCopyPhotographed(copy.photos)) return null;
          set({ ...s, binder: [...s.binder, copy] });
          return copy.id;
        },
        removeBinderCopy(binderId) {
          set({
            ...s,
            binder: s.binder.filter((b) => b.id !== binderId),
            interests: s.interests.filter((i) => i.binderId !== binderId)
          });
        },
        /* ---- interest: a partner would consider an exact copy ---- */
        setInterest(partnerId, binderId, on, at) {
          const has = E2.hasInterest(s.interests, partnerId, binderId);
          if (on === has) return;
          set({ ...s, interests: on ? [...s.interests, { partnerId, binderId, at }] : s.interests.filter((i) => !(i.partnerId === partnerId && i.binderId === binderId)) });
        },
        /* ---- conversation: reaching out. Creates NO opportunity, ever. ---- */
        reachOut(ctx) {
          const cv = E2.newConversation(ctx);
          set({ ...s, conversations: [...s.conversations, cv] });
          return cv.id;
        },
        sendMessage(conversationId, by, text, at) {
          set({ ...s, conversations: s.conversations.map((c) => c.id === conversationId ? { ...c, messages: [...c.messages, E2.newMessage(by, text, at)] } : c) });
        },
        /* ---- opportunity: the one structured negotiation ---- */
        startOpportunity({ goalId, collectorId, partnerId, cardId, invId, listedPrice, amount, at }) {
          if (!D2.INVARIANTS.oneNegotiationPerGoal(goalId, s.opportunities)) return null;
          const id = "o" + Math.random().toString(36).slice(2, 9);
          const opp = {
            id,
            goalId,
            collectorId,
            partnerId,
            cardId,
            invId,
            stage: "agree-price",
            listedPrice,
            agreedPrice: null,
            priceThread: [{ by: "collector", type: "offer", amount, at }],
            trade: { submitted: false, cards: [] },
            deal: {},
            fulfillment: {},
            declined: false,
            completedAt: null,
            updated: at
          };
          set({ ...s, opportunities: [...s.opportunities, opp] });
          return id;
        },
        patchOpportunity(oppId, fn) {
          set({ ...s, opportunities: s.opportunities.map((o) => o.id === oppId ? fn(o) : o) });
        },
        endOpportunity(oppId, by, at) {
          actions.patchOpportunity(oppId, (o) => D2.isActive(o) ? { ...o, declined: true, endedBy: by, endedAt: at, endedStage: o.stage } : o);
        }
      };
      const reset = (nextSeed) => set({ ...nextSeed || seed });
      return { get, set, sub, actions, cardById, reset };
    }
    module.exports = { createStore: createStore4 };
  }
});

// domain/collector-view.js
var require_collector_view = __commonJS({
  "domain/collector-view.js"(exports, module) {
    var D2 = require_metyet_domain();
    var E2 = require_metyet_entities();
    function collectorView2(state, meId) {
      const cardById = (id) => state.catalog.find((c) => c.id === id);
      const partnerById = (id) => state.partners.find((p) => p.id === id);
      const myGoals = () => state.goals.filter((g) => g.collectorId === meId);
      const myBinder = () => state.binder.filter((b) => b.collectorId === meId).map(E2.binderCopyForOwner);
      const myOpps = () => state.opportunities.filter((o) => o.collectorId === meId);
      const myPrefs = () => {
        const me = state.collectors.find((c) => c.id === meId);
        if (me && Array.isArray(me.prefs)) return me.prefs;
        const row = (state.preferences || []).find((p) => p.collectorId === meId);
        return row ? row.tags : [];
      };
      const partnersWith = (cardId) => {
        const c = cardById(cardId);
        const best = /* @__PURE__ */ new Map();
        E2.partnersHolding(state.inventory, c, cardById).forEach((inv) => {
          const cur = best.get(inv.partnerId);
          if (!cur || inv.ask < cur.ask) best.set(inv.partnerId, { partner: partnerById(inv.partnerId), inv, ask: inv.ask });
        });
        return [...best.values()].filter((x) => x.partner);
      };
      const interestIn = (binderId) => state.interests.filter((i) => i.binderId === binderId).map((i) => ({ ...i, partner: partnerById(i.partnerId) })).filter((x) => x.partner);
      const interestCountFrom = (partnerId) => E2.binderCopiesInterestedBy(state.interests, partnerId).filter((bid) => state.binder.some((b) => b.id === bid && b.collectorId === meId)).length;
      const forYou = (partnerId) => {
        const prefs = myPrefs();
        const onList = new Set(myGoals().map((g) => g.cardId));
        return E2.inventoryOf(state.inventory, partnerId).filter((inv) => !onList.has(inv.cardId)).map((inv) => ({
          ...inv,
          ask: inv.ask,
          why: (cardById(inv.cardId).tags || []).filter((t) => prefs.includes(t))
        })).filter((x) => x.why.length > 0);
      };
      const partnerProfile = (pid) => {
        const stock = E2.inventoryOf(state.inventory, pid);
        const held = new Set(stock.map((s) => s.cardId));
        return {
          partner: partnerById(pid),
          deals: state.opportunities.filter((o) => o.partnerId === pid && o.collectorId === meId && D2.isCompleted(o)).length,
          stock,
          primary: myGoals().filter((g) => g.tier === "primary" && held.has(g.cardId)).length,
          secondary: myGoals().filter((g) => g.tier === "secondary" && held.has(g.cardId)).length,
          interested: interestCountFrom(pid)
        };
      };
      const stateOf = (goalId) => D2.goalState(goalId, state.opportunities);
      const openOppForGoal = (goalId) => D2.activeOppForGoal(goalId, state.opportunities);
      const goalFor = (cardId) => myGoals().find((g) => g.cardId === cardId);
      const conversationsFor = (goalId, partnerId) => state.conversations.filter((c) => c.collectorId === meId && (!goalId || c.goalId === goalId) && (!partnerId || c.partnerId === partnerId));
      const tradeGroups = (partnerId, opp) => {
        const used = new Set((opp.trade && opp.trade.cards || []).map((c) => c.binderId));
        const open = myBinder().filter((b) => !used.has(b.id));
        const keen = (b) => E2.hasInterest(state.interests, partnerId, b.id);
        return { interested: open.filter(keen), other: open.filter((b) => !keen(b)) };
      };
      const turnFor = (o) => {
        const t = D2.nextActor(o);
        if (!t.actor) return { who: null, what: t.reason === "ended" ? "This deal was stopped." : "Nothing to do." };
        const them = (partnerById(o.partnerId) || {}).name || "them";
        const mine = t.actor === "collector";
        switch (t.reason) {
          case "offer":
            return { who: "me", what: "Make an offer when you're ready \u2014 only you can start a negotiation." };
          case "price":
            return mine ? { who: "me", what: `Accept $${t.amount.toLocaleString()} or send a counter.` } : { who: "partner", what: `Waiting on ${them} to reply to your $${t.amount.toLocaleString()}.` };
          case "choose-trade":
            return { who: "me", what: "Choose which of your cards to put toward this, then send them over." };
          case "review-trade":
            return { who: "partner", what: `Waiting while ${them} reviews your cards.` };
          case "trade-reviewed":
            return { who: "me", what: "They've finished reviewing. Move on to agreeing values." };
          case "value":
            return mine ? { who: "me", what: `${t.count} card${t.count === 1 ? " needs" : "s need"} a value agreed.` } : { who: "partner", what: `Waiting on ${them} for ${t.count} card${t.count === 1 ? "" : "s"}.` };
          case "values-settled":
            return { who: "me", what: "Every card is settled. Time to look at the balance." };
          case "final":
            return mine ? { who: "me", what: "Agree to the balance, or propose a final figure." } : { who: "partner", what: `Waiting on ${them} to answer your figure.` };
          case "handoff":
            return mine ? { who: "me", what: "Confirm once you've got the card and they've got yours." } : { who: "partner", what: `You've confirmed. Waiting on ${them}.` };
          default:
            return { who: null, what: "" };
        }
      };
      return {
        meId,
        cardById,
        partnerById,
        catalog: state.catalog,
        myGoals,
        myBinder,
        myOpps,
        myPrefs,
        partnersWith,
        interestIn,
        interestCountFrom,
        forYou,
        partnerProfile,
        stateOf,
        openOppForGoal,
        goalFor,
        conversationsFor,
        tradeGroups,
        turnFor
      };
    }
    module.exports = { collectorView: collectorView2 };
  }
});

// shell/MetYetPrototype.jsx

// src/MetYet.jsx
var import_metyet_store = __toESM(require_metyet_store());

var CSS = `
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
   construction \u2014 no absolute offsets to drift out of sync.

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
  /* node | flexible name | count | ownership | chevron \u2014 each data column carries
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
/* The open queue belongs to the row above it: inset, indented to the label column,
   and carrying the timeline through so the pipeline still reads as one spine. */
.lc-open { position: relative; margin: 0 var(--lc-pad) 10px var(--lc-label);
  border: 1px solid var(--line-soft); border-radius: 5px; background: #FAFBFC; overflow: hidden; }
.lc-open::before { content: ''; position: absolute; left: calc(var(--lc-axis) - var(--lc-label));
  top: 0; bottom: 0; width: 1px; background: var(--line); }
/* the only new scroller on this page, and only once a queue outgrows it */
.lc-open-scroll { max-height: 340px; overflow-y: auto; }
.lc-open-scroll .tbl th.stick { top: 0; }
.dq-wrap { margin-bottom: 14px; }
.dq-wrap .dq-entry { margin-bottom: 0; }
.dq-open { margin: 0; border-top: 0; border-radius: 0 0 6px 6px; }
.dq-open::before { display: none; }
/* the chevron turns to show the row is open \u2014 same icon, no new affordance */
.lc-chev, .dq-go { transition: transform .12s ease; }
.lc-row.on .lc-chev, .dq-entry.on .dq-go { transform: rotate(90deg); }
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
   weight \u2014 never alert styling. */
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
   headline, expanding explains it. Scanability over visualisation \u2014 no charts. */
.cov-top { padding: 18px 22px; }
.cov-lead { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; overflow: visible; }
.cov-big { font-size: 40px; font-weight: 500; letter-spacing: -0.03em; color: var(--t1);
  line-height: 1.12; padding: 2px 0; display: block; }
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
/* One metric, one baseline: the numerator leads, the slash and denominator sit
   quieter beside it, and every row places the pair in the same column. */
.cov-count { text-align: right; white-space: nowrap; flex: 0 0 auto; min-width: 132px;
  display: inline-flex; align-items: baseline; justify-content: flex-end; gap: 5px; }
/* one coherent metric: the denominator travels with the numerator */
.cov-num { font-size: 20px; font-weight: 500; }
.cov-den { color: var(--faint); font-weight: 400; font-size: 13px; letter-spacing: 0; }
.cov-sec { font-family: 'Archivo'; font-size: 9.5px; letter-spacing: .12em; text-transform: uppercase;
  color: var(--muted); font-weight: 600; padding: 2px 0 10px; margin-bottom: 2px;
  border-bottom: 1px solid var(--line-soft); }
.cov-lead-s { display: block; font-size: 12px; color: var(--muted); margin-top: 2px; font-weight: 400; }
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
.cp-wrap { max-width: 1180px; }
.cp-id { display: flex; align-items: flex-start; gap: 24px; flex-wrap: wrap; }
.cp-idl { flex: 1; min-width: 180px; }
.cp-name { font-size: 21px; font-weight: 600; letter-spacing: -.01em; line-height: 1.15; }
.cp-meta { font-size: 12.5px; color: var(--muted); margin-top: 3px; }
/* The binder is the working surface: give it the strongest section treatment. */
.cp-sec.cp-binder { padding-top: 4px; }
.cp-sec.cp-binder > .cp-sec-h { font-size: 11px; letter-spacing: .12em; }
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
/* ---- network trade binder: a sourcing surface, dense but calm ---- */
.nb-sum { font-size: 12.5px; color: var(--muted); margin: 0 0 12px; }
.nb-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
.nb-search { position: relative; flex: 0 0 260px; max-width: 100%; }
.nb-search .ic { position: absolute; left: 8px; top: 7px; color: var(--faint); pointer-events: none; }
.nb-search .inp { padding-left: 27px; }
.nb-sel { width: auto; min-width: 132px; padding: 5px 8px; font-size: 12px; }
.nb-grid { display: grid; gap: 12px 10px; grid-template-columns: repeat(auto-fill, minmax(178px, 1fr)); }
.nb-card { display: flex; flex-direction: column; min-width: 0; padding: 10px;
  border: 1px solid var(--line-soft); border-radius: 5px; background: var(--panel); }
.nb-card.on { border-color: #BCD3D6; }
.nb-art { display: flex; justify-content: center; }
.nb-b { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.nb-t { font-size: 13px; font-weight: 500; line-height: 1.25; margin-top: 8px; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.nb-s { font-size: 11px; color: var(--muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* Owner: present and clickable, but deliberately quiet. */
.nb-own { margin-top: 6px; font-size: 11.5px; color: var(--muted); }
.nb-who { font-size: 11.5px; text-align: left; }
/* Demand: a different concept, so a different weight. It is the one signal on the
   tile that earns emphasis, and only when it actually exists. */
.nb-dem { display: block; width: 100%; text-align: left; margin-top: 6px; padding: 3px 6px;
  border: 1px solid #CFE0E2; border-radius: 3px; background: var(--t1-bg); color: var(--t1);
  font-size: 11px; font-weight: 600; cursor: pointer; }
.nb-dem:hover { border-color: var(--t2); }
.nb-dem-who { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
.nb-dem2 { margin-top: 6px; font-size: 10.5px; color: var(--muted); }
.nb-note { font-size: 11.5px; color: var(--faint); margin-top: 4px; }
.nb-lbl { font-size: 11.5px; color: var(--faint); }
.nb-dem-l { font-size: 10px; color: var(--faint); text-transform: uppercase; letter-spacing: .08em;
  font-family: 'Archivo'; font-weight: 600; align-self: center; }
.nb-unrev { font-family: 'Archivo'; font-size: 9px; letter-spacing: .09em; text-transform: uppercase;
  font-weight: 600; color: var(--faint); }
/* signals earn their space: shown only when true, never as empty chrome */
.nb-sig { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 6px; min-height: 0; }
.nb-new { font-family: 'Archivo'; font-size: 9px; letter-spacing: .09em; text-transform: uppercase;
  font-weight: 600; color: var(--t1); }
.nb-act { margin-top: auto; padding-top: 9px; display: flex; flex-direction: column; gap: 5px; }
.nb-view, .nb-act .cp-bind-x { width: 100%; justify-content: center; padding: 3px 6px; font-size: 11px; margin-top: 0; }
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
/* margin-top: auto is what aligns the actions, so no tile needs its own spacing
   and no placeholder row is required where the value used to sit. */
.cp-bind-act { margin-top: auto; padding-top: 10px; display: flex; flex-direction: column; gap: 5px; }
.cp-bind-view, .cp-bind-x { margin-top: 0; width: 100%; justify-content: center;
  padding: 3px 6px; font-size: 11px; }
.cp-bind-more { margin-top: 12px; }
/* the collector's own photograph of a copy \u2014 a plate, not catalog art */
.copyph { display: flex; flex-direction: column; align-items: center; }
.copyph-p { border: 1px solid var(--line); border-radius: 3px; background: #FFF; display: flex;
  align-items: center; justify-content: center; text-align: center; color: var(--faint);
  white-space: pre-line; padding: 4px; }
.copyph-p.missing { border-style: dashed; border-color: var(--amber-line); background: var(--amber-bg); color: var(--amber); }
.copyph.sm .copyph-p { width: 62px; height: 86px; font-size: 8.5px; }
.copyph.md .copyph-p { width: 96px; height: 134px; font-size: 10px; }
.copyph.lg .copyph-p { width: 150px; height: 209px; font-size: 11px; }
.bp-req { display: flex; gap: 16px; }
.bp-slot { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.bp-flag { font-family: 'Archivo'; font-size: 9.5px; letter-spacing: .07em; text-transform: uppercase;
  font-weight: 600; color: var(--amber); }
.bp-flag.ok { color: var(--t1); }
.bp-view { display: flex; gap: 14px; margin-bottom: 12px; }
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
.cv-intro { font-size: 12.5px; color: var(--muted); margin: 0 0 14px; }
.cv-sub { font-size: 11.5px; color: var(--faint); margin: 0 0 8px; }
.nw-hit { background: none; border: 0; padding: 0; width: 100%; text-align: left; cursor: pointer; font: inherit; }
.nw-hit.on .nw-lbl { color: var(--t1); font-weight: 600; }
.nw-ev, .cv-ev { display: flex; flex-wrap: wrap; gap: 8px; padding: 6px 0 8px; }
.nw-ev-r, .cv-ev-r { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; }
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
.cov-who { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.cov-foot { padding: 10px 16px; border-top: 1px solid var(--line-soft); background: #FCFDFD;
  font-size: 11.5px; color: var(--muted); }

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
   stronger than secondary \u2014 a weight and border difference, no badges or counts. */
.ro-h { font-family: 'Archivo'; font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase;
  font-weight: 600; color: var(--faint); margin-bottom: 7px; }
.ro-group { margin-bottom: 9px; }
.ro-group:last-of-type { margin-bottom: 0; }
/* Quieter than REACH OUT itself \u2014 a group label, not a competing heading. */
.ro-tier { font-size: 10.5px; color: var(--faint); margin-bottom: 5px; letter-spacing: .02em; }
.ro-list { display: flex; flex-wrap: wrap; gap: 5px; }
/* One treatment for every collector. The group label carries the intent, so nothing
   here depends on colour \u2014 primary differs only by text weight and a slightly
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
/* A readable placeholder, not an error state: same footprint as the artwork, quiet
   enough that a real image is still obviously preferable. */
.cimg.empty { display: flex; align-items: center; justify-content: center; overflow: hidden;
  padding: 4px; text-align: center;
  background: repeating-linear-gradient(135deg, #F2F4F7 0 4px, #EDF0F4 4px 8px);
  border-style: dashed; border-color: var(--line); }
.ws-stock { flex: 0 0 auto; margin-right: 16px; padding-right: 16px; border-right: 1px solid var(--line-soft); }
.vt-stock { flex: 0 0 auto; margin-right: 16px; padding-right: 16px; border-right: 1px solid var(--line-soft); }
.cimg-ph { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.cimg-ph-n { font-size: 10px; font-weight: 600; line-height: 1.15; color: var(--muted);
  overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3;
  -webkit-box-orient: vertical; overflow: hidden; }
.cimg-ph-s, .cimg-ph-g { font-size: 8.5px; line-height: 1.25; color: var(--faint);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cimg-ph-g { margin-top: 2px; }
/* the identity scales with the plate rather than overflowing it */
.cimg.empty.thumbnail .cimg-ph-n { font-size: 7px; -webkit-line-clamp: 2; }
.cimg.empty.triage .cimg-ph-n { font-size: 8px; }
.cimg.empty.feature .cimg-ph-n, .cimg.empty.shelf .cimg-ph-n, .cimg.empty.hero .cimg-ph-n { font-size: 12px; }
.cimg.empty.shelf .cimg-ph-s, .cimg.empty.hero .cimg-ph-s, .cimg.empty.feature .cimg-ph-s { font-size: 10px; }
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
/* deal-level actions: present everywhere, prominent nowhere */
.dm { position: relative; display: inline-flex; }
.dm-btn { font-size: 17px; line-height: 1; letter-spacing: .05em; }
.dm-veil { position: fixed; inset: 0; z-index: 40; }
.dm-pop { position: absolute; top: 26px; right: 0; z-index: 41; min-width: 178px;
  background: #FFF; border: 1px solid var(--line); border-radius: 5px;
  box-shadow: 0 8px 24px rgba(15,19,27,.14); padding: 4px; display: block; }
.dm-item { display: block; width: 100%; text-align: left; background: none; border: 0;
  padding: 7px 9px; border-radius: 3px; font: inherit; font-size: 12.5px; color: var(--text); cursor: pointer; }
.dm-item:hover { background: #F4F7F8; }
.dm-reasons { display: flex; flex-direction: column; gap: 6px; align-items: stretch; }
.dm-reasons .btn { justify-content: flex-start; }

/* Reference context, not a hero: the card sits beside its identity rather than
   spanning the workspace, so the active decision keeps the vertical space. */
.ws-top { padding: 14px; border-bottom: 1px solid var(--line); flex: 0 0 auto;
  background: #FAFBFC; flex: 0 0 auto; }
.ws-cardline { display: flex; gap: 12px; align-items: flex-start; }
.ws-cardid { flex: 1; min-width: 0; }
.ws-cardid .ccopy { flex-direction: column; align-items: flex-start; gap: 5px; }
.ws-photos { display: flex; gap: 8px; flex: 0 0 auto; margin-top: 11px; }
.ws-photo { width: 108px; height: 88px; border: 1px solid var(--line); border-radius: 4px; background: #FFF;
  display: flex; align-items: center; justify-content: center; text-align: center; font-size: 8.5px; color: var(--faint);
  padding: 3px; line-height: 1.25; overflow: hidden; }
.ws-photo.req { border-style: dashed; border-color: var(--amber-line); background: var(--amber-bg); color: var(--amber); }
.ws-photo img { width: 100%; height: 100%; object-fit: cover; }
.ws-ident { display: flex; flex-wrap: wrap; gap: 4px 8px; margin-top: 4px; font-size: 11.5px; color: var(--muted); }
.ws-ident span { position: relative; }
.ws-ident span + span::before { content: '\xB7'; position: absolute; left: -6px; color: var(--line); }
.ws-invbox { margin-top: 11px; padding-top: 10px; border-top: 1px solid var(--line-soft); }
.ws-inv-status { font-family: 'Archivo'; font-size: 10px; letter-spacing: .07em; text-transform: uppercase; font-weight: 600; }
.ws-inv-status.ok { color: var(--t1); }
.ws-inv-status.un { color: var(--amber); }

/* RIGHT > LEFT > CENTER. Fractional rather than fixed so the shell stays fluid.
   THE SINGLE VERTICAL SCROLL OWNER. One deal, one scrollbar: the three columns are
   rows of the same scrolling document rather than independent scrolling panes, so a
   tall Value Trade simply makes the workspace taller. */
.ws-body { flex: 1; min-height: 0; overflow-y: auto; display: grid;
  grid-template-columns: minmax(0,27fr) minmax(0,19fr) minmax(0,54fr);
  align-items: stretch; }
.ws-side { display: flex; flex-direction: column;
  border-right: 1px solid var(--line); background: #FCFDFD; }
.ws-side .ws-top { border-bottom: 0; }
/* One equidistant row across the full width of the workspace, directly under the
   header. Read-only: it reports where the deal stands, it cannot move it. */
.ws-map { display: flex; align-items: flex-start; padding: 14px 16px 12px;
  border-bottom: 1px solid var(--line); background: var(--panel); flex: 0 0 auto; }
.ws-stage { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center;
  gap: 6px; position: relative; text-align: center; }
/* the connector sits behind the dots and stops at the first and last stage */
.ws-stage::before { content: ""; position: absolute; top: 8px; left: -50%; width: 100%;
  height: 1.5px; background: var(--line); }
.ws-stage:first-child::before { display: none; }
.ws-stage.past::before, .ws-stage.now::before { background: var(--t2); }
.ws-dot { width: 17px; height: 17px; border-radius: 50%; border: 1.5px solid var(--line);
  background: #FFF; position: relative; z-index: 1; display: flex; align-items: center;
  justify-content: center; font-size: 10px; line-height: 1; color: #FFF; font-weight: 700; }
.ws-lbl { font-size: 11.5px; color: var(--muted); line-height: 1.25; }
.ws-stage.past .ws-dot { background: var(--t1); border-color: var(--t1); }
.ws-stage.now .ws-dot { background: var(--t1); border-color: var(--t1); box-shadow: 0 0 0 3px var(--t1-bg); }
.ws-stage.now .ws-lbl { color: var(--t1); font-weight: 600; }
.ws-stage.next .ws-lbl { color: var(--faint); }
.ws-stage.skip .ws-lbl { color: var(--faint); text-decoration: line-through; }
.ws-note { font-size: 9.5px; color: var(--faint); }

.ws-chat { display: flex; flex-direction: column; border-right: 1px solid var(--line); }
.ws-chat-scroll { flex: 1; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
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

.ws-stagework { padding: 14px; }
.ws-owner { border-radius: 5px; padding: 13px 15px; margin-bottom: 16px; border: 1px solid var(--line); background: #F7F9FA; }
.ws-owner-d { font-size: 12px; color: var(--muted); margin-top: 5px; max-width: 62ch; }
.ws-owner-s { display: inline-block; margin-top: 9px; font-size: 11.5px; padding: 3px 9px;
  border: 1px solid var(--line); border-radius: 3px; background: #FFF; color: var(--muted); }
.ws-owner.tp { background: var(--t1-bg); border-color: #BFD5D8; }
.ws-owner.collector { background: var(--amber-bg); border-color: var(--amber-line); }
.ws-owner-h { font-family: 'Archivo'; font-size: 10px; letter-spacing: .09em; text-transform: uppercase; font-weight: 600; }
.ws-owner.tp .ws-owner-h { color: var(--t1); }
.ws-owner.collector .ws-owner-h { color: var(--amber); }
.ws-owner.none .ws-owner-h { color: var(--faint); }
.ws-owner-b { font-size: 14.5px; font-weight: 500; margin-top: 3px; line-height: 1.3; }

/* ---- value trade table ---- */
/* From Select Trade onward the structured workspace carries most of the work, so
   the grid flips: map stays compact, chat holds ~1/3, stage workspace takes ~2/3.
   Gated on min-width because the track minimums exceed the workspace below it. */
/* Transaction stages give the decision a little more room again. */
@media (min-width: 1181px) {
  .ws-body.txn { grid-template-columns: minmax(0,25fr) minmax(0,17fr) minmax(0,58fr); }
}

@media (max-width: 1180px) {
  /* the columns tighten rather than reflowing; the decision stays dominant */
  .ws-body, .ws-body.txn { grid-template-columns: 236px minmax(0,0.8fr) minmax(0,1.9fr); }
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
/* Identity is permanently folded into the Card cell \u2014 the table is five columns,
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
/* ---- select trade: card review, not a ledger ----
   Unresolved cards get the space; decided ones collapse to one quiet line so a
   many-card proposal stays navigable. */
/* quiet convenience \u2014 never competing with Accept / Reject / Open to trade */
.ccopy { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 9px; }
/* Compact instances sit inline beside a card identity rather than starting a row,
   so a list of dozens keeps its original height and rhythm. */
.ccopy.compact { display: inline-flex; margin-top: 0; vertical-align: middle; }
.inv-idline { display: flex; align-items: center; gap: 7px; min-width: 0; }
.inv-idline .link { min-width: 0; }
.gc-name .ccopy.compact, .cv-t .ccopy.compact { margin-left: 7px; }
.ccopy-b { color: var(--muted); padding: 2px 7px; font-size: 11px; gap: 4px; }
.ccopy-b:hover { color: var(--t1); border-color: #CBD3DB; }
.ccopy.compact .ccopy-b { padding: 2px 5px; }
.st-group { font-family: 'Archivo'; font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
  font-weight: 600; color: var(--faint); margin: 14px 0 7px; }
.st-card { border: 1px solid var(--line); border-radius: 5px; padding: 13px; margin-bottom: 10px; background: var(--panel); }
.st-name { font-size: 15px; font-weight: 600; font-family: 'Archivo'; letter-spacing: -.01em; }
.st-sub { font-size: 11.5px; color: var(--muted); margin-top: 1px; }
.st-body { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 11px; }
.st-photos { display: flex; gap: 10px; flex: 0 0 auto; }
.st-details { flex: 1 1 260px; min-width: 220px; }
.st-details .kv { padding: 4px 0; }
.st-decide { margin-top: 12px; padding-top: 11px; border-top: 1px solid var(--line-soft); }
.st-ask { font-size: 12.5px; font-weight: 500; margin-bottom: 8px; }
.st-done { display: flex; align-items: center; gap: 10px; padding: 8px 11px; border: 1px solid var(--line-soft);
  border-radius: 4px; margin-bottom: 6px; background: var(--panel); }
.st-done.no { opacity: .62; }
.st-done-b { flex: 1; min-width: 0; }
.st-done-n { font-size: 12.5px; font-weight: 500; }
.st-mark { font-family: 'IBM Plex Mono'; font-size: 12px; width: 18px; text-align: center; flex: 0 0 18px; }
.st-done.ok .st-mark { color: var(--t1); }
.st-done.no .st-mark { color: var(--faint); }
.st-done-s { font-size: 11px; color: var(--muted); flex: 0 0 auto; }
.st-done.ok .st-done-s { color: var(--t1); }
.vt-evidence { display: flex; gap: 16px; padding: 6px 0 10px; flex-wrap: wrap; }
.vt-photos { display: flex; gap: 6px; flex: 0 0 auto; }
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
/* Row variant: the same decision, laid out across the width of a trade-card action
   row instead of down a narrow rail. Nothing new is shown \u2014 only the arrangement. */
.pn.row { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.pn.row .pn-side { flex: 1 1 220px; min-width: 200px; }
.pn.row .pn-amt { font-size: 19px; }
.pn.row .pn-accept, .pn.row .pn-send { width: auto; margin-top: 8px; }
.pn.row .pn-or { flex: 0 0 auto; margin: 0; align-self: center; }
.pn.row .pn-or.v::before, .pn.row .pn-or.v::after { display: none; }
.pn.row.wait { margin-bottom: 10px; }
.pn.row.wait .pn-wait { margin-top: 0; align-self: center; }
/* Value Trade market review: copy on the left, decision on the right, both large
   enough to be useful. Wraps rather than shrinking the photos into uselessness. */
.vt-mkt { display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
.vt-mkt-copy { flex: 0 0 auto; max-width: 240px; }
.vt-mkt-ph { display: flex; gap: 10px; margin-bottom: 8px; }
.vt-mkt-id { font-size: 13px; font-weight: 500; }
.vt-mkt-sub { font-size: 11px; color: var(--muted); margin-top: 1px; }
.vt-mkt-dec { flex: 1 1 380px; min-width: 300px; }
/* who you are negotiating with \u2014 compact, and never competing with the terms */
.np { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.np .av { width: 30px; height: 30px; flex-basis: 30px; font-size: 11.5px; }
.np-n { font-size: 12.5px; font-weight: 500; line-height: 1.2; }
.np-l { font-size: 11px; color: var(--faint); margin-top: 1px; }
/* the photo plate is the button; the chrome stays out of the way */
.copyph-btn { padding: 0; border: 0; background: none; display: block; cursor: zoom-in; }
.copyph-btn .copyph-p { transition: border-color .12s ease, box-shadow .12s ease; }
.copyph-btn:hover .copyph-p { border-color: var(--t2); box-shadow: 0 0 0 3px var(--t3-bg); }
.lb { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.lb .copyph-p { width: 300px; height: 418px; font-size: 13px; }
.lb-side { font-family: 'Archivo'; font-size: 10.5px; letter-spacing: .09em; text-transform: uppercase;
  font-weight: 600; color: var(--muted); }
.lb-nav { display: flex; gap: 6px; margin-right: auto; }
.sect-t { font-family: 'Archivo'; font-size: 10.5px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); font-weight: 600; margin: 0 0 8px; }
@media (prefers-reduced-motion: reduce) { .my-root * { transition: none !important; } }
`;
var Icon = ({ n, s = 16 }) => {
  const p = { width: s, height: s, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    box: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M2 5.2 8 2.3l6 2.9v5.6L8 13.7 2 10.8z" }), /* @__PURE__ */ React.createElement("path", { d: "M2 5.2 8 8.1l6-2.9M8 8.1v5.6" })),
    people: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "6", cy: "5.5", r: "2.2" }), /* @__PURE__ */ React.createElement("path", { d: "M2 13c0-2.2 1.8-3.6 4-3.6s4 1.4 4 3.6" }), /* @__PURE__ */ React.createElement("path", { d: "M11 4.2a2 2 0 0 1 0 3.9M12.2 12.9c0-1.5-.5-2.6-1.4-3.3" })),
    flow: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M2.5 3.5h11l-4 4.5v5l-3-1.6V8z" })),
    search: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "7", cy: "7", r: "4.2" }), /* @__PURE__ */ React.createElement("path", { d: "m10.2 10.2 3 3" })),
    plus: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M8 3v10M3 8h10" })),
    arrow: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M3.5 8h9M9 4.5 12.5 8 9 11.5" })),
    back: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M12.5 8h-9M7 4.5 3.5 8 7 11.5" })),
    chev: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "m5.5 3.5 4 4.5-4 4.5" })),
    dl: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M8 2.5v7M5 7l3 3 3-3M3 13h10" })),
    x: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "m4 4 8 8M12 4l-8 8" })),
    send: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M14 2 7 9M14 2l-4.5 12L7 9 2 6.5z" })),
    copy: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "5.5", y: "5.5", width: "8", height: "8", rx: "1.2" }), /* @__PURE__ */ React.createElement("path", { d: "M10.5 3.5h-8v8" }))
  };
  return /* @__PURE__ */ React.createElement("svg", { ...p }, paths[n]);
};
var TODAY = /* @__PURE__ */ new Date("2026-08-09");
var SELF_PARTNER = "p-self";
var PARTNERS_SEED = [
  {
    id: "p-self",
    name: "Northline Cards",
    city: "Duluth, Minnesota",
    tradeRate: 0.8,
    since: "2022-08-30",
    note: "Your shop."
  },
  {
    id: "p2",
    name: "Complete Collectibles",
    city: "Roseville, Minnesota",
    tradeRate: 0.8,
    since: "2023-04-11",
    note: "First pick on most Base Set breaks in the Twin Cities."
  },
  {
    id: "p3",
    name: "Ryan's Collectibles",
    city: "Minneapolis, Minnesota",
    tradeRate: 0.78,
    since: "2024-02-20",
    note: "Hunts down Neo-era holos better than anyone."
  },
  {
    id: "p4",
    name: "Kane TCG",
    city: "Eagan, Minnesota",
    tradeRate: 0.8,
    since: "2025-09-02",
    note: "Mostly modern, moving into vintage."
  }
];
var PARTNER = PARTNERS_SEED[0];
var COUNTER_LIMIT = null;
var T = {
  charizard: "Charizard",
  "base-set": "Base Set",
  shadowless: "Shadowless",
  "first-edition": "1st Edition",
  psa9plus: "PSA 9+",
  psa10: "PSA 10 only",
  "vintage-wotc": "Vintage WOTC",
  japanese: "Japanese",
  eeveelution: "Eeveelutions",
  "gold-star": "Gold Star",
  sealed: "Sealed product",
  "full-art": "Full Art",
  "alt-art": "Alt Art",
  trainer: "Trainer cards",
  holo: "Holo rares",
  "team-rocket": "Team Rocket",
  "dark-pokemon": "Dark Pok\xE9mon",
  neo: "Neo era",
  shining: "Shining Pok\xE9mon",
  promo: "Promos",
  modern: "Modern era",
  bulk: "Bulk / commons",
  played: "Played condition"
};
var CATALOG_IMAGES = Object.freeze({
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
  "swsh9-154": ["https://images.pokemontcg.io/swsh9/154.png", "https://images.pokemontcg.io/swsh9/154_hires.png"]
});
var catalogImage = (csvId) => csvId && CATALOG_IMAGES[csvId] || null;
var CARDS_SEED = [
  // --- owned ---
  { id: "i1", name: "Charizard", set: "Base Set", num: "4/102", year: 1999, grade: "PSA 9", value: 4200, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["charizard", "base-set", "vintage-wotc", "holo", "psa9plus"], csvId: "base1-4" },
  { id: "i2", name: "Blastoise", set: "Base Set", num: "2/102", year: 1999, grade: "PSA 8", value: 620, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["base-set", "vintage-wotc", "holo"], csvId: "base1-2" },
  { id: "i3", name: "Venusaur", set: "Base Set", num: "15/102", year: 1999, grade: "PSA 9", value: 780, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["base-set", "vintage-wotc", "holo", "psa9plus"], csvId: "base1-15" },
  { id: "i4", name: "Charizard", set: "Base Set", num: "4/102", year: 1999, grade: "PSA 7", value: 3100, edition: "Shadowless", print: "Holo", condition: null, language: "English", tags: ["charizard", "base-set", "shadowless", "vintage-wotc", "holo"], csvId: "base1-4" },
  { id: "i5", name: "Pikachu (Red Cheeks)", set: "Base Set", num: "58/102", year: 1999, grade: "PSA 10", value: 1450, edition: "Unlimited", print: "Normal", condition: null, language: "English", tags: ["base-set", "vintage-wotc", "psa10", "psa9plus"], csvId: "base1-58" },
  { id: "i6", name: "Alakazam", set: "Base Set", num: "1/102", year: 1999, grade: "PSA 8", value: 900, edition: "1st Edition", print: "Holo", condition: null, language: "English", tags: ["base-set", "first-edition", "shadowless", "vintage-wotc", "holo"], csvId: "base1-1" },
  { id: "i7", name: "Machamp", set: "Base Set", num: "8/102", year: 1999, grade: "PSA 9", value: 240, edition: "1st Edition", print: "Holo", condition: null, language: "English", tags: ["base-set", "first-edition", "vintage-wotc", "holo", "psa9plus"], csvId: "base1-8" },
  { id: "i8", name: "Dark Charizard", set: "Team Rocket", num: "4/82", year: 2e3, grade: "PSA 9", value: 1150, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["charizard", "team-rocket", "dark-pokemon", "vintage-wotc", "holo", "psa9plus"], csvId: "base5-4" },
  { id: "i9", name: "Dark Blastoise", set: "Team Rocket", num: "3/82", year: 2e3, grade: "PSA 9", value: 310, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["team-rocket", "dark-pokemon", "vintage-wotc", "holo", "psa9plus"], csvId: "base5-3" },
  { id: "i10", name: "Dark Dragonite", set: "Team Rocket", num: "5/82", year: 2e3, grade: "Raw", value: 260, edition: "Unlimited", print: "Holo", condition: "Lightly Played", language: "English", tags: ["team-rocket", "dark-pokemon", "vintage-wotc", "holo"], csvId: "base5-5" },
  { id: "i11", name: "Lugia", set: "Neo Genesis", num: "9/111", year: 2e3, grade: "PSA 8", value: 2400, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["neo", "vintage-wotc", "holo"], csvId: "neo1-9" },
  { id: "i12", name: "Shining Charizard", set: "Neo Destiny", num: "107/105", year: 2002, grade: "PSA 7", value: 3400, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["charizard", "neo", "shining", "vintage-wotc", "holo"], csvId: "neo4-107" },
  { id: "i13", name: "Shining Mewtwo", set: "Neo Destiny", num: "109/105", year: 2002, grade: "PSA 8", value: 900, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["neo", "shining", "vintage-wotc", "holo"], csvId: "neo4-109" },
  { id: "i14", name: "Umbreon", set: "Neo Discovery", num: "32/75", year: 2001, grade: "PSA 9", value: 780, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["neo", "eeveelution", "vintage-wotc", "holo", "psa9plus"], csvId: "neo2-32" },
  { id: "i15", name: "Espeon", set: "Neo Discovery", num: "20/75", year: 2001, grade: "PSA 9", value: 640, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["neo", "eeveelution", "vintage-wotc", "holo", "psa9plus"], csvId: "neo2-20" },
  { id: "i16", name: "Umbreon Gold Star", set: "POP Series 5", num: "17/17", year: 2007, grade: "PSA 8", value: 12500, edition: "Standard", print: "Holo", condition: null, language: "English", tags: ["gold-star", "eeveelution", "holo"] },
  { id: "i17", name: "Rayquaza Gold Star", set: "EX Deoxys", num: "107/107", year: 2005, grade: "PSA 9", value: 9800, edition: "Standard", print: "Holo", condition: null, language: "English", tags: ["gold-star", "holo", "psa9plus"] },
  { id: "i18", name: "Charizard (No Rarity)", set: "Japanese Base Set", num: "\u2014", year: 1996, grade: "PSA 8", value: 5200, edition: "No Rarity", print: "Holo", condition: null, language: "Japanese", tags: ["charizard", "japanese", "base-set", "vintage-wotc", "holo"] },
  { id: "i19", name: "Eevee", set: "Japanese Vending Series 2", num: "\u2014", year: 1998, grade: "Raw", value: 180, edition: "Standard", print: "Normal", condition: "Near Mint", language: "Japanese", tags: ["japanese", "eeveelution", "promo", "psa9plus"] },
  { id: "i20", name: "Mewtwo", set: "Japanese Trainer Magazine Promo", num: "\u2014", year: 1998, grade: "PSA 8", value: 1100, edition: "Standard", print: "Normal", condition: null, language: "Japanese", tags: ["japanese", "promo"] },
  { id: "i21", name: "Charizard VMAX", set: "Champion's Path", num: "74/73", year: 2020, grade: "PSA 10", value: 420, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["charizard", "modern", "alt-art", "psa10", "psa9plus"], csvId: "swsh35-74" },
  { id: "i22", name: "Umbreon VMAX (Alt Art)", set: "Evolving Skies", num: "215/203", year: 2021, grade: "PSA 9", value: 1600, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["modern", "alt-art", "eeveelution", "psa9plus"], csvId: "swsh7-215" },
  { id: "i23", name: "Rayquaza VMAX (Alt Art)", set: "Evolving Skies", num: "218/203", year: 2021, grade: "PSA 10", value: 480, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["modern", "alt-art", "psa10", "psa9plus"], csvId: "swsh7-218" },
  { id: "i24", name: "Lugia V (Alt Art)", set: "Silver Tempest", num: "186/195", year: 2022, grade: "PSA 10", value: 260, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["modern", "alt-art", "psa10", "psa9plus"], csvId: "swsh12-186" },
  { id: "i25", name: "Professor's Research (Full Art)", set: "Vivid Voltage", num: "178/185", year: 2020, grade: "PSA 10", value: 210, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["modern", "trainer", "full-art", "psa10", "psa9plus"] },
  { id: "i26", name: "Marnie (Full Art)", set: "Sword & Shield", num: "169/202", year: 2020, grade: "PSA 9", value: 190, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["modern", "trainer", "full-art", "psa9plus"], csvId: "swsh1-169" },
  { id: "i27", name: "Lillie (Full Art)", set: "Ultra Prism", num: "151/156", year: 2018, grade: "PSA 9", value: 620, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["modern", "trainer", "full-art", "psa9plus"], csvId: "sm5-151" },
  { id: "i28", name: "Booster Pack (Unlimited)", set: "Base Set", num: "\u2014", year: 1999, grade: "Raw", value: 1700, edition: "Unlimited", print: "Normal", condition: "Near Mint", language: "English", tags: ["sealed", "base-set", "vintage-wotc"] },
  { id: "i29", name: "Booster Box", set: "Evolving Skies", num: "\u2014", year: 2021, grade: "Raw", value: 1250, edition: "Standard", print: "Normal", condition: "Near Mint", language: "English", tags: ["sealed", "modern"] },
  { id: "i30", name: "Booster Box", set: "Japanese Neo Genesis", num: "\u2014", year: 2e3, grade: "Raw", value: 2200, edition: "Standard", print: "Normal", condition: "Near Mint", language: "Japanese", tags: ["sealed", "japanese", "neo", "vintage-wotc"] },
  { id: "i31", name: "Zubat", set: "Fossil", num: "64/62", year: 1999, grade: "PSA 8", value: 25, edition: "Unlimited", print: "Normal", condition: null, language: "English", tags: ["bulk"] },
  { id: "i32", name: "Weedle", set: "Jungle", num: "69/64", year: 1999, grade: "Raw", value: 20, edition: "Unlimited", print: "Normal", condition: "Moderately Played", language: "English", tags: ["bulk"] },
  { id: "i33", name: "Machoke", set: "Base Set", num: "34/102", year: 1999, grade: "Raw", value: 15, edition: "Unlimited", print: "Normal", condition: "Damaged", language: "English", tags: ["played"], csvId: "base1-34" },
  { id: "i34", name: "Pikachu", set: "Vivid Voltage", num: "043/185", year: 2020, grade: "PSA 10", value: 40, edition: "Standard", print: "Reverse Holo", condition: null, language: "English", tags: ["modern", "psa10", "psa9plus"] },
  // --- wanted, not owned ---
  { id: "u1", name: "Charizard", set: "Base Set", num: "4/102", year: 1999, grade: "PSA 9", value: 165e3, edition: "1st Edition", print: "Holo", condition: null, language: "English", tags: ["charizard", "base-set", "first-edition", "shadowless", "vintage-wotc", "holo", "psa9plus"], csvId: "base1-4" },
  { id: "u2", name: "Blastoise", set: "Base Set", num: "2/102", year: 1999, grade: "PSA 8", value: 6800, edition: "1st Edition", print: "Holo", condition: null, language: "English", tags: ["base-set", "first-edition", "shadowless", "vintage-wotc", "holo"], csvId: "base1-2" },
  { id: "u3", name: "Espeon Gold Star", set: "POP Series 5", num: "16/17", year: 2007, grade: "PSA 9", value: 14e3, edition: "Standard", print: "Holo", condition: null, language: "English", tags: ["gold-star", "eeveelution", "holo", "psa9plus"] },
  { id: "u4", name: "Pikachu Illustrator", set: "CoroCoro Promo", num: "\u2014", year: 1998, grade: "PSA 6", value: 375e3, edition: "Standard", print: "Normal", condition: null, language: "Japanese", tags: ["japanese", "promo"] },
  { id: "u5", name: "Charizard", set: "Japanese Base Set", num: "\u2014", year: 1996, grade: "PSA 9", value: 22e3, edition: "1st Edition", print: "Holo", condition: null, language: "Japanese", tags: ["charizard", "japanese", "base-set", "first-edition", "vintage-wotc", "holo", "psa9plus"] },
  { id: "u6", name: "Giratina V (Alt Art)", set: "Lost Origin", num: "186/196", year: 2022, grade: "PSA 10", value: 380, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["modern", "alt-art", "psa10", "psa9plus"], csvId: "swsh11-186" },
  { id: "u7", name: "Shining Gyarados", set: "Neo Revelation", num: "65/64", year: 2001, grade: "PSA 9", value: 1200, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["neo", "shining", "vintage-wotc", "holo", "psa9plus"], csvId: "neo3-65" },
  { id: "u8", name: "Charizard (Crystal)", set: "Skyridge", num: "146/144", year: 2003, grade: "PSA 8", value: 14e3, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["charizard", "vintage-wotc", "holo"], csvId: "ecard3-146" },
  { id: "u9", name: "Vaporeon", set: "Jungle", num: "12/64", year: 1999, grade: "PSA 9", value: 850, edition: "1st Edition", print: "Holo", condition: null, language: "English", tags: ["eeveelution", "first-edition", "vintage-wotc", "holo", "psa9plus"], csvId: "base2-12" },
  { id: "u10", name: "Booster Box (1st Edition)", set: "Team Rocket", num: "\u2014", year: 2e3, grade: "Raw", value: 9500, edition: "1st Edition", print: "Normal", condition: "Near Mint", language: "English", tags: ["sealed", "team-rocket", "first-edition", "vintage-wotc"] },
  { id: "u11", name: "Trophy Pikachu No. 3 (Bronze)", set: "Japanese Tournament Promo", num: "\u2014", year: 1997, grade: "PSA 8", value: 18e3, edition: "Standard", print: "Normal", condition: null, language: "Japanese", tags: ["japanese", "promo"] },
  { id: "u12", name: "Ancient Mew (Sealed)", set: "Movie Promo", num: "\u2014", year: 1999, grade: "Raw", value: 220, edition: "Standard", print: "Normal", condition: "Near Mint", language: "English", tags: ["promo", "sealed"] },
  { id: "u13", name: "Dark Dragonite", set: "Team Rocket", num: "5/82", year: 2e3, grade: "Raw", value: 300, edition: "Unlimited", print: "Holo", condition: "Near Mint", language: "English", tags: ["team-rocket", "dark-pokemon", "vintage-wotc", "holo"], csvId: "base5-5" },
  // --- collector-owned cards, candidates for trade ---
  { id: "t1", name: "Zapdos", set: "Base Set", num: "16/102", year: 1999, grade: "PSA 8", value: 260, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["base-set", "vintage-wotc", "holo"], csvId: "base1-16" },
  { id: "t2", name: "Ninetales", set: "Base Set", num: "12/102", year: 1999, grade: "PSA 9", value: 240, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["base-set", "vintage-wotc", "holo", "psa9plus"], csvId: "base1-12" },
  { id: "t3", name: "Chansey", set: "Base Set", num: "3/102", year: 1999, grade: "PSA 9", value: 300, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["base-set", "vintage-wotc", "holo", "psa9plus"], csvId: "base1-3" },
  { id: "t4", name: "Poliwrath", set: "Base Set", num: "13/102", year: 1999, grade: "Raw", value: 120, edition: "Unlimited", print: "Holo", condition: "Lightly Played", language: "English", tags: ["base-set", "vintage-wotc", "holo"], csvId: "base1-13" },
  { id: "t5", name: "Vaporeon", set: "Japanese Jungle", num: "\u2014", year: 1997, grade: "PSA 9", value: 150, edition: "Unlimited", print: "Holo", condition: null, language: "Japanese", tags: ["japanese", "eeveelution", "holo", "psa9plus"] },
  { id: "t6", name: "Cynthia (Full Art)", set: "Ultra Prism", num: "148/156", year: 2018, grade: "PSA 10", value: 180, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["modern", "trainer", "full-art", "psa10", "psa9plus"], csvId: "sm5-148" },
  { id: "t7", name: "N (Full Art)", set: "Noble Victories", num: "101/101", year: 2011, grade: "PSA 9", value: 420, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["trainer", "full-art", "psa9plus"], csvId: "bw3-101" },
  { id: "t8", name: "Dark Raichu", set: "Team Rocket", num: "83/82", year: 2e3, grade: "PSA 8", value: 700, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["team-rocket", "dark-pokemon", "vintage-wotc", "holo"], csvId: "base5-83" },
  { id: "t9", name: "Typhlosion", set: "Neo Genesis", num: "17/111", year: 2e3, grade: "PSA 9", value: 220, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["neo", "vintage-wotc", "holo", "psa9plus"], csvId: "neo1-17" },
  { id: "t10", name: "Charizard (CD Promo)", set: "Japanese Promo", num: "\u2014", year: 1998, grade: "PSA 9", value: 900, edition: "Standard", print: "Normal", condition: null, language: "Japanese", tags: ["charizard", "japanese", "promo", "psa9plus"] },
  { id: "t11", name: "Pikachu VMAX", set: "Vivid Voltage", num: "188/185", year: 2020, grade: "PSA 10", value: 130, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["modern", "alt-art", "psa10", "psa9plus"], csvId: "swsh4-188" },
  { id: "t12", name: "Charizard ex", set: "FireRed & LeafGreen", num: "105/112", year: 2004, grade: "PSA 8", value: 1400, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["charizard", "holo"], csvId: "ex6-105" },
  { id: "t13", name: "Sylveon VMAX (Alt Art)", set: "Evolving Skies", num: "212/203", year: 2021, grade: "PSA 9", value: 520, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["modern", "alt-art", "eeveelution", "psa9plus"], csvId: "swsh7-212" },
  { id: "t14", name: "Hitmonchan", set: "Base Set", num: "7/102", year: 1999, grade: "PSA 8", value: 400, edition: "1st Edition", print: "Holo", condition: null, language: "English", tags: ["base-set", "first-edition", "vintage-wotc", "holo"], csvId: "base1-7" },
  { id: "t15", name: "Mew ex", set: "Dragon Frontiers", num: "\u2014", year: 2006, grade: "PSA 8", value: 1900, edition: "Standard", print: "Holo", condition: null, language: "English", tags: ["gold-star", "holo"] },
  { id: "t16", name: "Lugia", set: "Japanese Neo Genesis", num: "\u2014", year: 2e3, grade: "PSA 9", value: 700, edition: "Unlimited", print: "Holo", condition: null, language: "Japanese", tags: ["japanese", "neo", "holo", "psa9plus"] },
  { id: "t17", name: "Blaine's Charizard", set: "Gym Challenge", num: "2/132", year: 2e3, grade: "PSA 7", value: 1100, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["charizard", "vintage-wotc", "holo"], csvId: "gym2-2" },
  { id: "t18", name: "Espeon", set: "Japanese Neo Discovery", num: "\u2014", year: 2e3, grade: "PSA 9", value: 190, edition: "Unlimited", print: "Normal", condition: null, language: "Japanese", tags: ["japanese", "eeveelution", "neo", "psa9plus"] },
  { id: "t19", name: "Electabuzz", set: "Base Set", num: "20/102", year: 1999, grade: "PSA 9", value: 180, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["base-set", "vintage-wotc", "holo", "psa9plus"], csvId: "base1-20" },
  { id: "t20", name: "Scyther", set: "Jungle", num: "10/64", year: 1999, grade: "PSA 9", value: 120, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["vintage-wotc", "holo", "psa9plus"], csvId: "base2-10" },
  { id: "t21", name: "Pikachu", set: "Japanese Vending Series 1", num: "\u2014", year: 1998, grade: "PSA 9", value: 150, edition: "Standard", print: "Normal", condition: null, language: "Japanese", tags: ["japanese", "promo", "psa9plus"] },
  { id: "t22", name: "Blastoise", set: "Japanese Base Set", num: "\u2014", year: 1996, grade: "PSA 8", value: 620, edition: "No Rarity", print: "Holo", condition: null, language: "Japanese", tags: ["japanese", "base-set", "holo"] },
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
  { id: "x7", name: "Blastoise", set: "Japanese Base Set", num: "\u2014", year: 1996, grade: "PSA 9", value: 900, edition: "Unlimited", print: "Holo", condition: null, language: "Japanese", tags: ["japanese", "base-set", "vintage-wotc", "holo", "psa9plus"] },
  { id: "x8", name: "Feraligatr", set: "Neo Genesis", num: "5/111", year: 2e3, grade: "PSA 9", value: 260, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["neo", "vintage-wotc", "holo", "psa9plus"], csvId: "neo1-5" },
  { id: "x9", name: "Skyla (Full Art)", set: "Boundaries Crossed", num: "134/149", year: 2012, grade: "PSA 10", value: 300, edition: "Standard", print: "Normal", condition: null, language: "English", tags: ["trainer", "full-art", "psa10", "psa9plus"], csvId: "bw7-134" },
  { id: "x10", name: "Shining Magikarp", set: "Neo Revelation", num: "66/64", year: 2001, grade: "PSA 9", value: 700, edition: "Unlimited", print: "Holo", condition: null, language: "English", tags: ["neo", "shining", "vintage-wotc", "holo", "psa9plus"], csvId: "neo3-66" }
];
var COLLECTORS_SEED = [
  { id: "c1", binderReviewedAt: "2026-07-30", name: "Sarah Mendel", short: "Sarah M.", city: "Minneapolis, MN", since: "2024-06-02", last: "2026-08-05", prefs: ["charizard", "base-set", "shadowless", "first-edition", "psa9plus"], note: "Building a shadowless Base Set run. Buys fast when grade is right." },
  { id: "c2", binderReviewedAt: "2026-07-19", name: "James Rivera", short: "James R.", city: "Austin, TX", since: "2024-09-14", last: "2026-08-01", prefs: ["vintage-wotc", "holo", "base-set", "neo"], note: "Wants the unlimited Base holo set complete before moving to Neo." },
  { id: "c3", binderReviewedAt: "2026-07-24", name: "Alex Trinh", short: "Alex T.", city: "Seattle, WA", since: "2023-11-20", last: "2026-07-28", prefs: ["japanese", "eeveelution", "gold-star", "sealed"], note: "Japanese-first collector. Prefers raw Japanese over graded English." },
  { id: "c4", binderReviewedAt: "2026-08-05", name: "Priya Raman", short: "Priya R.", city: "Chicago, IL", since: "2025-02-08", last: "2026-08-07", prefs: ["modern", "alt-art", "full-art", "trainer"], note: "Trainer supporter cards only. Very responsive to alt art drops." },
  { id: "c5", binderReviewedAt: "2026-07-28", name: "Marcus Webb", short: "Marcus W.", city: "Atlanta, GA", since: "2024-01-17", last: "2026-07-30", prefs: ["team-rocket", "dark-pokemon", "base-set", "psa9plus"], note: "Team Rocket master set. Needs high grades only." },
  { id: "c6", binderReviewedAt: "2026-08-06", name: "Dana Kowalski", short: "Dana K.", city: "Denver, CO", since: "2025-04-22", last: "2026-08-06", prefs: ["neo", "shining", "holo"], note: "Chasing all Shining Pok\xE9mon. Patient, pays well for centering." },
  { id: "c7", binderReviewedAt: "2026-06-30", name: "Hiro Tanaka", short: "Hiro T.", city: "San Jose, CA", since: "2023-08-05", last: "2026-06-11", prefs: ["japanese", "promo", "gold-star", "eeveelution"], note: "Long-time client. Slow to reply but closes big when he does." },
  { id: "c8", binderReviewedAt: "2026-07-20", name: "Ellen Fisher", short: "Ellen F.", city: "Boston, MA", since: "2025-06-30", last: "2026-08-08", prefs: ["trainer", "full-art", "sealed", "modern"], note: "Sealed modern + full art trainers. Buys in volume, small tickets." },
  { id: "c9", binderReviewedAt: "2026-05-19", name: "Tom\xE1s Ortega", short: "Tom\xE1s O.", city: "Miami, FL", since: "2024-03-11", last: "2026-05-19", prefs: ["charizard", "vintage-wotc", "psa10", "holo"], note: "Charizard only. Has gone quiet since spring \u2014 worth a check-in." },
  { id: "c10", binderReviewedAt: "2026-08-01", name: "Nina Alvarez", short: "Nina A.", city: "Portland, OR", since: "2025-01-25", last: "2026-08-02", prefs: ["eeveelution", "japanese", "alt-art", "modern"], note: "Eeveelution completist across eras." },
  { id: "c11", binderReviewedAt: "2026-07-21", name: "Grant Whitfield", short: "Grant W.", city: "Nashville, TN", since: "2023-05-09", last: "2026-07-21", prefs: ["first-edition", "shadowless", "base-set", "sealed"], note: "1st Edition purist. Will wait years for the right copy." },
  { id: "c12", binderReviewedAt: "2026-04-14", name: "Casey Lin", short: "Casey L.", city: "Brooklyn, NY", since: "2025-09-03", last: "2026-04-14", prefs: ["gold-star", "alt-art", "modern", "trainer"], note: "New-ish. Gold Star curiosity is turning into real intent." },
  { id: "c13", binderReviewedAt: "2026-07-15", name: "Robert Nakamura", short: "Robert N.", city: "Honolulu, HI", since: "2023-02-14", last: "2026-07-15", prefs: ["japanese", "promo", "sealed", "vintage-wotc"], note: "Japanese sealed and tournament promos. Highest lifetime value." }
];
var GOALS_SEED = [
  ["c1", "i1", "primary", "Wants a PSA 9 copy before year end", "2026-07-02", "2026-05-16", "2026-08-09"],
  ["c1", "u1", "primary", "Grail. Has budget approved.", "2026-06-20", "2026-04-17", "2026-08-08"],
  ["c2", "i1", "primary", "Final holo needed for unlimited Base run", "2026-06-14", "2026-03-25", "2026-08-07"],
  ["c3", "i1", "primary", "Would take PSA 9 English if Japanese doesn't surface", "2026-05-30", "2026-02-21", "2026-08-06"],
  ["c3", "u3", "primary", "Espeon Gold Star to pair with Umbreon", "2026-05-30", "2026-02-04", "2026-08-04"],
  ["c4", "i27", "primary", "Lillie FA is the centerpiece of her trainer binder", "2026-07-19", "2026-03-09", "2026-08-03"],
  ["c4", "u6", "primary", "Giratina alt art, PSA 10 only", "2026-07-22", "2026-02-23", "2026-07-31"],
  ["c5", "i8", "primary", "Dark Charizard PSA 9 for master set", "2026-06-05", "2025-12-21", "2026-07-28"],
  ["c5", "u10", "primary", "Sealed 1st Ed Team Rocket box", "2026-06-01", "2025-11-30", "2026-07-24"],
  ["c6", "i12", "primary", "Shining Charizard \u2014 will accept PSA 7", "2026-07-11", "2026-06-11", "2026-07-21"],
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
  ["c12", "i17", "primary", "Rayquaza Gold Star \u2014 first big purchase", "2026-03-02", "2026-01-14", "2026-04-21"],
  ["c13", "u11", "primary", "Trophy Pikachu No. 3", "2026-04-06", "2026-02-01", "2026-04-06"],
  ["c13", "i30", "primary", "Japanese Neo Genesis sealed box", "2026-04-06", "2026-01-15", "2026-04-06"],
  ["c1", "i2", "secondary", "", "2025-10-20", "2025-10-20", "2026-03-02"],
  ["c1", "i5", "secondary", "", "2025-11-02", "2025-11-02", "2026-02-05"],
  ["c1", "i28", "secondary", "", "2025-11-27", "2025-11-27", "2026-01-11"],
  ["c1", "u2", "secondary", "", "2025-11-14", "2025-11-14", "2025-12-12"],
  ["c2", "i3", "secondary", "", "2025-12-09", "2025-12-09", "2025-12-09"],
  ["c2", "i2", "secondary", "", "2025-12-18", "2025-12-18", "2025-12-18"],
  ["c2", "i11", "secondary", "", "2026-01-05", "2026-01-05", "2026-01-05"],
  ["c2", "u2", "secondary", "", "2025-12-03", "2025-12-03", "2025-12-03"],
  ["c3", "i19", "secondary", "", "2026-01-15", "2026-01-15", "2026-01-15"],
  ["c3", "i20", "secondary", "", "2026-01-28", "2026-01-28", "2026-01-28"],
  ["c3", "i30", "secondary", "", "2026-02-02", "2026-02-02", "2026-08-09"],
  ["c3", "u4", "secondary", "", "2026-01-09", "2026-01-09", "2026-08-08"],
  ["c4", "i25", "secondary", "", "2026-02-11", "2026-02-11", "2026-08-07"],
  ["c4", "i26", "secondary", "", "2026-02-24", "2026-02-24", "2026-08-06"],
  ["c4", "i23", "secondary", "", "2026-03-06", "2026-03-06", "2026-08-04"],
  ["c4", "i21", "secondary", "", "2026-01-22", "2026-01-22", "2026-08-03"],
  ["c5", "i9", "secondary", "", "2026-03-18", "2026-03-18", "2026-07-31"],
  ["c5", "i10", "secondary", "", "2026-03-27", "2026-03-27", "2026-07-28"],
  ["c5", "i5", "secondary", "", "2026-04-09", "2026-04-09", "2026-07-24"],
  ["c5", "i1", "secondary", "", "2026-02-05", "2026-02-05", "2026-07-21"],
  ["c6", "i13", "secondary", "", "2026-04-21", "2026-04-21", "2026-07-17"],
  ["c6", "i11", "secondary", "", "2026-04-30", "2026-04-30", "2026-07-13"],
  ["c6", "i14", "secondary", "", "2026-05-01", "2026-05-01", "2026-07-06"],
  ["c6", "i15", "secondary", "", "2026-02-17", "2026-02-17", "2026-06-29"],
  ["c7", "i18", "secondary", "", "2026-05-20", "2026-05-20", "2026-06-22"],
  ["c7", "i19", "secondary", "", "2026-05-23", "2026-05-23", "2026-06-15"],
  ["c7", "i30", "secondary", "", "2026-06-07", "2026-06-07", "2026-06-07"],
  ["c7", "i17", "secondary", "", "2026-03-01", "2026-03-01", "2026-05-29"],
  ["c8", "i25", "secondary", "", "2026-06-16", "2026-06-16", "2026-06-16"],
  ["c8", "i26", "secondary", "", "2026-06-30", "2026-06-30", "2026-06-30"],
  ["c8", "i27", "secondary", "", "2026-07-05", "2026-07-05", "2026-07-05"],
  ["c8", "i24", "secondary", "", "2026-03-12", "2026-03-12", "2026-04-06"],
  ["c9", "i1", "secondary", "", "2026-07-16", "2026-07-16", "2026-07-16"],
  ["c9", "i12", "secondary", "", "2026-07-20", "2026-07-20", "2026-07-20"],
  ["c9", "u1", "secondary", "", "2026-03-24", "2026-03-24", "2026-03-24"],
  ["c10", "i14", "secondary", "", "2025-12-30", "2025-12-30", "2026-01-11"],
  ["c10", "i15", "secondary", "", "2026-01-19", "2026-01-19", "2026-01-19"],
  ["c10", "i19", "secondary", "", "2026-02-20", "2026-02-20", "2026-02-20"],
  ["c10", "i23", "secondary", "", "2026-04-02", "2026-04-02", "2026-04-02"],
  ["c11", "i7", "secondary", "", "2026-03-11", "2026-03-11", "2026-03-11"],
  ["c11", "i28", "secondary", "", "2026-04-14", "2026-04-14", "2026-04-14"],
  ["c11", "u10", "secondary", "", "2026-04-15", "2026-04-15", "2026-04-15"],
  /* Casey bought this one — her completed Opportunity references it, so the Goal
     derives Satisfied rather than needing a stored status. */
  ["c12", "x6", "secondary", "Bought it. Done.", "2026-01-20", "2026-01-20", "2026-03-29"],
  ["c12", "i21", "secondary", "", "2026-05-11", "2026-05-11", "2026-05-11"],
  ["c12", "i23", "secondary", "", "2026-06-23", "2026-06-23", "2026-08-09"],
  ["c12", "i16", "secondary", "", "2026-07-09", "2026-07-09", "2026-08-08"],
  ["c12", "u6", "secondary", "", "2026-04-27", "2026-04-27", "2026-08-07"],
  ["c13", "i20", "secondary", "", "2026-02-06", "2026-02-06", "2026-08-06"],
  ["c13", "i18", "secondary", "", "2026-03-30", "2026-03-30", "2026-08-04"],
  ["c13", "i29", "secondary", "", "2026-04-25", "2026-04-25", "2026-08-03"],
  ["c13", "u12", "secondary", "", "2026-05-06", "2026-05-06", "2026-07-31"],
  ["c8", "i34", "secondary", "", "2026-08-06", "2026-08-06", "2026-08-06"],
  ["c5", "u13", "secondary", "", "2026-05-14", "2026-05-14", "2026-07-24"]
];
var STAGES = [
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
  { id: "archived", label: "Archived", group: "closed" }
];
var DEAL_STAGES = ["agree-price", "select-trade", "value-trade", "deal", "fulfillment", "completed"];
var TXN_STAGES = ["select-trade", "value-trade", "deal", "fulfillment", "completed"];
var STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.id, s.label]));
var outcomeLabel = (o) => {
  const where = STAGE_LABEL[o.archivedFrom || o.stage];
  if (o.outcome === "cancelled") return `Cancelled during ${where}`;
  if (o.outcome === "ended") return `Ended during ${where}`;
  return `archived from ${where}`;
};
var END_REASONS = [
  "Couldn\u2019t agree on terms",
  "Changed my mind",
  "Card is no longer available",
  "Collector is no longer interested",
  "Other"
];
var STAGE_NUMBER = Object.fromEntries(
  STAGES.filter((s) => s.group === "deal" && s.id !== "completed").map((s, i) => [s.id, i + 1])
);
var stageNo = (id) => STAGE_NUMBER[id] ? String(STAGE_NUMBER[id]).padStart(2, "0") : null;
var PHOTOS = (id) => ({ front: "binder:" + id + ":front", back: "binder:" + id + ":back" });
var OTHER_INTEREST_SEED = [
  /* Casey's Mew ex already interests p-self; these make it a multi-partner copy,
     which is what the Collector binder needs in order to show more than one. */
  { partnerId: "p2", binderId: "cc16", at: "2026-08-07" },
  { partnerId: "p3", binderId: "cc16", at: "2026-08-11" },
  { partnerId: "p2", binderId: "cc0", at: "2026-08-02" },
  { partnerId: "p2", binderId: "cc4", at: "2026-07-12" },
  { partnerId: "p2", binderId: "cc9", at: "2026-06-28" },
  { partnerId: "p3", binderId: "cc0", at: "2026-08-05" },
  { partnerId: "p3", binderId: "cc12", at: "2026-07-19" },
  { partnerId: "p4", binderId: "cc4", at: "2026-08-04" }
];
var hasBothPhotos = (photos) => !!(photos && photos.front && photos.back);
var COLLECTOR_CARDS_SEED = [
  ["t1", "c1", true, 275, PHOTOS("t1"), "PSA 70551201", "2025-03-04"],
  ["t2", "c1", true, 250, PHOTOS("t2"), "PSA 70551202", "2025-06-18"],
  ["t3", "c2", true, 320, PHOTOS("t3"), "PSA 69884410", "2025-01-22"],
  ["t4", "c2", false, 130, PHOTOS("t4"), null, "2025-05-09"],
  ["t5", "c3", true, 165, PHOTOS("t5"), "PSA 71230067", "2025-04-15"],
  ["t18", "c3", true, 200, PHOTOS("t18"), "PSA 71230068", "2026-08-01"],
  ["t6", "c4", true, 195, PHOTOS("t6"), "PSA 72004511", "2025-06-01"],
  ["t7", "c4", true, 450, PHOTOS("t7"), "PSA 68110934", "2025-09-12"],
  ["t8", "c5", true, 760, PHOTOS("t8"), "PSA 66720188", "2024-11-08"],
  ["t9", "c6", true, 235, PHOTOS("t9"), "PSA 70998123", "2025-08-19"],
  ["t10", "c7", true, 980, PHOTOS("t10"), "PSA 65330472", "2024-10-02"],
  ["t11", "c8", false, 140, PHOTOS("t11"), "PSA 73001284", "2025-07-14"],
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
  /* ---- SOURCING SCENARIOS ----
     Existing catalog identities that collectors already hold goals against, placed in
     the binders of collectors who do NOT hold that goal. Nothing here is a new card,
     a new goal or a new rule: the network trade binder simply now has the range of
     real situations a Trusted Partner has to work through. Owner is always distinct
     from the demanding collectors, so "who wants it" never means "who owns it". */
  // Multiple primary demand (c1, c2, c3), new since Casey last reviewed, not yet reviewed
  ["i1", "c12", false, 4400, PHOTOS("i1"), "PSA 71844902", "2026-08-05"],
  // Single primary demand (c4), new, not yet reviewed
  ["i27", "c6", false, 640, PHOTOS("i27"), "PSA 72910334", "2026-08-08"],
  // Primary demand (c12) on a card reviewed a while ago and still unreviewed
  ["i17", "c2", false, 9200, PHOTOS("i17"), "PSA 70118845", "2026-05-20"],
  // Primary demand (c5) the TP has already marked interested
  ["i8", "c11", true, 1150, PHOTOS("i8"), "PSA 71620073", "2026-06-02"],
  // Secondary-only demand (c4, c10, c12), new, not reviewed
  ["i23", "c13", false, 1300, PHOTOS("i23"), "PSA 74400218", "2026-07-30"],
  // A raw copy carrying primary demand (c13) — sourcing is not graded-only
  ["i30", "c9", false, 780, PHOTOS("i30"), null, "2026-08-04"],
  // New and unreviewed with no demand at all: not everything shared is wanted
  ["i33", "c5", false, 40, PHOTOS("i33"), null, "2026-08-07"]
];
var FULFILLMENT_METHODS = [
  { id: "show", label: "Pick up at next show", fields: ["show", "date"] },
  { id: "meetup", label: "Coordinate meet up", fields: ["date", "time", "location"] }
];
var emptyFulfillment = () => ({
  method: null,
  // 'show' | 'meetup'
  show: "",
  date: "",
  time: "",
  location: "",
  note: "",
  proposedAt: null,
  // TP submitted a plan
  collectorConfirmedPlan: false,
  revisionRequested: null,
  // {note, at} — clears when the TP resubmits
  tpHandoff: false,
  // TP: I handed over my side
  collectorReceipt: false
  // collector: I received and completed mine
});
var planFieldsFilled = (f) => {
  const m = FULFILLMENT_METHODS.find((x) => x.id === f.method);
  return !!m && m.fields.every((k) => String(f[k] || "").trim());
};
var planProposed = (f) => !!f.proposedAt && !f.revisionRequested;
var planAgreed = (f) => planProposed(f) && f.collectorConfirmedPlan;
var fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${(h + 11) % 12 + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
var fulfillmentSummary = (f) => f.method === "show" ? `Pick up at ${f.show} \xB7 ${fmtDate(f.date)}` : f.method === "meetup" ? `Meet at ${f.location} \xB7 ${fmtDate(f.date)} at ${fmtTime(f.time)}` : "no plan yet";
var emptyDeal = () => ({
  collectorAgreed: false,
  tpAgreed: false,
  adjThread: [],
  // {by, type:'propose'|'accept', amount, at} — signed, see cashBalance
  tpAdj: null,
  // standing positions
  collectorAdj: null,
  agreedAdj: null
  // OUTPUT only — written solely by acceptance
});
var emptyOpp = (collectorId, cardId, invId, listedPrice, at, goalId = null, partnerId = SELF_PARTNER) => ({
  id: "o" + Math.random().toString(36).slice(2, 9),
  collectorId,
  cardId,
  invId,
  goalId,
  partnerId,
  stage: "agree-price",
  listedPrice,
  priceThread: [],
  // {by:'collector'|'tp', type:'offer'|'counter'|'accept'|'decline', amount, at}
  agreedPrice: null,
  trade: null,
  // {mode:'cash'|'trade', cards:[tradeCard]}
  tradeRate: PARTNER.tradeRate,
  // the TP's DEFAULT opening % proposal, snapshot at offer
  // time. Never the agreed rate — that is per card.
  deal: emptyDeal(),
  fulfillment: emptyFulfillment(),
  completedAt: null,
  updated: at
});
var lastEntry = (thread) => thread[thread.length - 1] || null;
var emptyTradeCard = (cardId, photos, cert, binderId) => ({
  id: "tc" + cardId + "-" + Math.random().toString(36).slice(2, 7),
  // stable across stages
  cardId,
  binderId: binderId || null,
  // link back to the collector's binder copy
  inclusion: "proposed",
  // proposed | accepted | rejected   (TP-owned, Select Trade)
  reviewedAt: null,
  // when the TP made the inclusion decision
  withdrawn: false,
  // collector pulled it over economics (Value Trade)
  withdrawnAt: null,
  collectorMarket: null,
  // collector's current market position
  tpMarket: null,
  // TP's current market position
  agreedMarket: null,
  // OUTPUT only — never typed directly
  valueThread: [],
  // {by, type:'propose'|'accept', amount, at}
  collectorPercent: null,
  // collector's current % position
  tpPercent: null,
  // TP's current % position
  agreedPercent: null,
  // OUTPUT only — never typed directly
  percentThread: [],
  // {by, type:'propose'|'accept', percent, at}
  cert: cert || null,
  photos: photos || { front: null, back: null }
});
var tradeCards = (opp) => opp.trade?.cards || [];
var proposedCards = (opp) => tradeCards(opp).filter((c) => c.inclusion === "proposed");
var rejectedCards = (opp) => tradeCards(opp).filter((c) => c.inclusion === "rejected");
var includedCards = (opp) => tradeCards(opp).filter((c) => c.inclusion === "accepted");
var withdrawnCards = (opp) => includedCards(opp).filter((c) => c.withdrawn);
var activeTradeCards = (opp) => includedCards(opp).filter((c) => !c.withdrawn);
var marketAgreed = (tc) => tc.agreedMarket != null;
var fullyAgreed = (tc) => tc.agreedMarket != null && tc.agreedPercent != null;
var settledCards = (opp) => activeTradeCards(opp).filter(fullyAgreed);
var PHASE = {
  rejected: "rejected",
  withdrawn: "withdrawn",
  inclusion: "inclusion",
  market: "market",
  percent: "percent",
  settled: "settled"
};
function cardPhase(tc) {
  if (tc.inclusion === "rejected") return PHASE.rejected;
  if (tc.withdrawn) return PHASE.withdrawn;
  if (tc.inclusion === "proposed") return PHASE.inclusion;
  if (!marketAgreed(tc)) return PHASE.market;
  if (tc.agreedPercent == null) return PHASE.percent;
  return PHASE.settled;
}
function cardOwner(tc) {
  switch (cardPhase(tc)) {
    case PHASE.rejected:
      return { owner: null, label: "Rejected", tone: "gone" };
    case PHASE.withdrawn:
      return { owner: null, label: "Withdrawn", tone: "gone" };
    case PHASE.inclusion:
      return { owner: "tp", label: "Review card", tone: "tp" };
    case PHASE.market: {
      if (tc.collectorMarket == null) return { owner: "collector", label: "Propose market", tone: "collector" };
      const last = lastEntry(tc.valueThread);
      return last && last.by === "tp" ? { owner: "collector", label: "Review market", tone: "collector" } : { owner: "tp", label: "Review market", tone: "tp" };
    }
    case PHASE.percent: {
      if (tc.tpPercent == null) return { owner: "tp", label: "Propose trade %", tone: "tp" };
      const last = lastEntry(tc.percentThread);
      return last && last.by === "tp" ? { owner: "collector", label: "Review trade %", tone: "collector" } : { owner: "tp", label: "Review trade %", tone: "tp" };
    }
    default:
      return { owner: null, label: "Agreed", tone: "ok" };
  }
}
var selectTradeSettled = (opp) => !!opp.trade?.submitted && proposedCards(opp).length === 0 && includedCards(opp).length > 0;
var valueTradeSettled = (opp) => {
  const active = activeTradeCards(opp);
  return includedCards(opp).length > 0 && active.every(fullyAgreed);
};
var isArchived = (opp) => !!opp.declined;
var isTerminal = (opp) => opp.stage === "completed" || isArchived(opp);
var isActive = (opp) => !isTerminal(opp);
var allWithdrawn = (opp) => includedCards(opp).length > 0 && activeTradeCards(opp).length === 0;
var tcReviewInclusion = (tc, action, at) => action === "accept" ? { ...tc, inclusion: "accepted", reviewedAt: at } : { ...tc, inclusion: "rejected", reviewedAt: at };
function tcApplyMarket(tc, by, action, amount, at) {
  if (marketAgreed(tc)) return tc;
  if (action === "accept") {
    const other = by === "tp" ? tc.collectorMarket : tc.tpMarket;
    if (other == null) return tc;
    return {
      ...tc,
      agreedMarket: other,
      ...by === "tp" ? { tpMarket: other } : { collectorMarket: other },
      valueThread: [...tc.valueThread, { by, type: "accept", amount: other, at }]
    };
  }
  if (!(amount > 0)) return tc;
  return {
    ...tc,
    ...by === "tp" ? { tpMarket: amount } : { collectorMarket: amount },
    valueThread: [...tc.valueThread, { by, type: "propose", amount, at }]
  };
}
function tcApplyPercent(tc, by, action, percent, at) {
  if (!marketAgreed(tc) || tc.agreedPercent != null || tc.withdrawn) return tc;
  if (by === "tp" && tc.tpPercent == null && action !== "propose") return tc;
  if (by === "collector" && tc.tpPercent == null) return tc;
  if (action === "accept") {
    const other = by === "tp" ? tc.collectorPercent : tc.tpPercent;
    if (other == null) return tc;
    return {
      ...tc,
      agreedPercent: other,
      ...by === "tp" ? { tpPercent: other } : { collectorPercent: other },
      percentThread: [...tc.percentThread, { by, type: "accept", percent: other, at }]
    };
  }
  if (!(percent > 0) || percent > 1) return tc;
  return {
    ...tc,
    ...by === "tp" ? { tpPercent: percent } : { collectorPercent: percent },
    percentThread: [...tc.percentThread, { by, type: "propose", percent, at }]
  };
}
function dealApplyAdj(deal, by, action, amount, at) {
  if (deal.agreedAdj != null) return deal;
  if (action === "accept") {
    const other = by === "tp" ? deal.collectorAdj : deal.tpAdj;
    if (other == null) return deal;
    return {
      ...deal,
      agreedAdj: other,
      ...by === "tp" ? { tpAdj: other } : { collectorAdj: other },
      adjThread: [...deal.adjThread, { by, type: "accept", amount: other, at }],
      // a newly assembled deal must be confirmed again by both sides
      tpAgreed: false,
      collectorAgreed: false
    };
  }
  if (typeof amount !== "number" || !isFinite(amount) || amount === 0) return deal;
  return {
    ...deal,
    ...by === "tp" ? { tpAdj: amount } : { collectorAdj: amount },
    adjThread: [...deal.adjThread, { by, type: "propose", amount, at }],
    tpAgreed: false,
    collectorAgreed: false
  };
}
var adjOpen = (deal) => deal.agreedAdj == null && deal.adjThread.length > 0;
var tcWithdraw = (tc, at) => tc.inclusion === "accepted" && !tc.withdrawn ? { ...tc, withdrawn: true, withdrawnAt: at } : tc;
var creditFor = (tc) => fullyAgreed(tc) ? Math.round(tc.agreedMarket * tc.agreedPercent) : null;
var totalCredit = (opp) => settledCards(opp).reduce((a, c) => a + creditFor(c), 0);
var oppValue = (o) => o.agreedPrice != null ? o.agreedPrice : o.listedPrice;
var baseCash = (opp) => opp.agreedPrice == null ? null : opp.agreedPrice - totalCredit(opp);
var agreedAdjustment = (opp) => opp.deal?.agreedAdj ?? 0;
var cashBalance = (opp) => {
  const base = baseCash(opp);
  if (base == null) return null;
  const net = base + agreedAdjustment(opp);
  return {
    base,
    adjustment: agreedAdjustment(opp),
    net,
    amount: Math.abs(net),
    payer: net > 0 ? "collector" : net < 0 ? "tp" : null,
    recipient: net > 0 ? "tp" : net < 0 ? "collector" : null,
    zero: net === 0
  };
};
var cashLabel = (opp, collectorShort) => {
  const c = cashBalance(opp);
  if (!c) return "\u2014";
  if (c.zero) return "No cash balance";
  return c.payer === "collector" ? `${collectorShort} pays you \u2014 ${money(c.amount)}` : `You pay ${collectorShort} \u2014 ${money(c.amount)}`;
};
var pct = (p) => p == null ? "\u2014" : Math.round(p * 1e3) / 10 + "%";
var countersBy = (thread, who) => thread.filter((e) => e.by === who && e.type === "counter").length;
var percentageOf = (amount, reference) => {
  const a = Number(amount), r = Number(reference);
  if (amount === "" || amount == null || !isFinite(a)) return null;
  if (!isFinite(r) || r <= 0) return null;
  return Math.round(a / r * 100);
};
var amountFromPercentage = (percent, reference) => {
  const p = Number(percent), r = Number(reference);
  if (percent === "" || percent == null || !isFinite(p) || p < 0) return null;
  if (!isFinite(r) || r <= 0) return null;
  return Math.round(r * p / 100);
};
var shareText = (amount, reference) => {
  const p = percentageOf(amount, reference);
  return p == null ? null : p + "%";
};
var canCounter = (thread, who) => COUNTER_LIMIT === null || countersBy(thread, who) < COUNTER_LIMIT;
var COVERAGE_LAYERS = [
  { id: "deal", label: "Deal Flow", q: "Connected to an active opportunity." },
  { id: "primary", label: "Primary Goals", q: "Match a primary collector goal." },
  { id: "secondary", label: "Secondary Goals", q: "Match a secondary collector goal." }
];
var COVERAGE_LENS = [
  { id: "preference", label: "Preferences", q: "Meet one or more stated collector preferences." }
];
function inventoryCoverage({ activeInv, opps, goals, collectors, cardById, today }) {
  var _a;
  const keyOf = (i) => identityKey(cardById(i.cardId));
  const claimed = /* @__PURE__ */ new Map();
  const claim = (inv, layer, why) => {
    if (!claimed.has(inv.invId)) claimed.set(inv.invId, { layer, why });
  };
  const live = opps.filter((o) => isActive(o) && o.stage !== "completed");
  const dealItems = [];
  const takenIds = /* @__PURE__ */ new Set();
  const byCard = {};
  for (const i of activeInv) (byCard[_a = i.cardId] || (byCard[_a] = [])).push(i);
  Object.values(byCard).forEach((l) => l.sort((a, b) => String(a.invId).localeCompare(String(b.invId))));
  for (const o of live) {
    let inv = o.invId ? activeInv.find((i) => i.invId === o.invId) : null;
    if (!inv || takenIds.has(inv.invId)) inv = (byCard[o.cardId] || []).find((i) => !takenIds.has(i.invId));
    if (!inv) continue;
    takenIds.add(inv.invId);
    dealItems.push({ inv, opp: o });
    claim(inv, "deal", o);
  }
  const goalsFor = (inv, tier) => {
    const k = keyOf(inv);
    return goals.filter((g) => g.tier === tier && identityKey(cardById(g.cardId)) === k);
  };
  const tierItems = (tier) => activeInv.filter((i) => !claimed.has(i.invId)).map((inv) => ({ inv, goals: goalsFor(inv, tier) })).filter((r) => r.goals.length > 0);
  const primaryItems = tierItems("primary");
  primaryItems.forEach((r) => claim(r.inv, "primary", r.goals));
  const primaryInDealFlow = dealItems.filter((d) => goalsFor(d.inv, "primary").length > 0);
  const secondaryItems = tierItems("secondary");
  secondaryItems.forEach((r) => claim(r.inv, "secondary", r.goals));
  const noneItems = activeInv.filter((i) => !claimed.has(i.invId)).map((inv) => ({ inv }));
  noneItems.forEach((r) => claim(r.inv, "none", null));
  const prefItems = activeInv.map((inv) => {
    const c = cardById(inv.cardId);
    const who = collectors.map((col) => ({ collector: col, tags: c.tags.filter((t) => col.prefs.includes(t)) })).filter((x) => x.tags.length > 0);
    return { inv, who };
  }).filter((r) => r.who.length > 0);
  const unaligned = noneItems.map((r) => r.inv);
  const collectorsIn = (ids) => new Set(ids).size;
  const total = activeInv.length;
  const share = (n) => total ? n / total : 0;
  const layers = {
    deal: {
      items: dealItems,
      count: dealItems.length,
      share: share(dealItems.length),
      collectors: collectorsIn(dealItems.map((d) => d.opp.collectorId)),
      opportunities: dealItems.length
    },
    primary: {
      items: primaryItems,
      count: primaryItems.length,
      share: share(primaryItems.length),
      available: primaryItems.length,
      inDealFlow: primaryInDealFlow.length,
      alignedTotal: primaryItems.length + primaryInDealFlow.length,
      goals: new Set(primaryItems.flatMap((r) => r.goals.map((g) => g.id))).size,
      collectors: collectorsIn(primaryItems.flatMap((r) => r.goals.map((g) => g.collectorId)))
    },
    secondary: {
      items: secondaryItems,
      count: secondaryItems.length,
      share: share(secondaryItems.length),
      goals: new Set(secondaryItems.flatMap((r) => r.goals.map((g) => g.id))).size,
      collectors: collectorsIn(secondaryItems.flatMap((r) => r.goals.map((g) => g.collectorId)))
    },
    none: { items: noneItems, count: noneItems.length, share: share(noneItems.length) },
    preference: {
      items: prefItems,
      count: prefItems.length,
      share: share(prefItems.length),
      collectors: collectorsIn(prefItems.flatMap((r) => r.who.map((w) => w.collector.id)))
    }
  };
  const invKeys = new Set(activeInv.map(keyOf));
  const uncoveredPrimary = goals.filter((g) => g.tier === "primary" && !invKeys.has(identityKey(cardById(g.cardId))));
  return {
    layers,
    unaligned,
    total,
    uncoveredPrimary,
    connected: dealItems.length + primaryItems.length + secondaryItems.length
  };
}
var networkTally = (goals, cardById, keyOf) => {
  const m = /* @__PURE__ */ new Map();
  for (const g of goals) {
    const c = cardById(g.cardId);
    if (!c) continue;
    const k = keyOf(c);
    if (k == null) continue;
    const e = m.get(k) || { key: k, collectors: /* @__PURE__ */ new Set(), goals: 0, primary: 0, evidence: [] };
    e.collectors.add(g.collectorId);
    e.goals++;
    if (g.tier === "primary") e.primary++;
    e.evidence.push({ collectorId: g.collectorId, tier: g.tier, cardId: g.cardId });
    m.set(k, e);
  }
  return [...m.values()].map((e) => ({
    key: e.key,
    collectors: e.collectors.size,
    goals: e.goals,
    primary: e.primary,
    collectorIds: [...e.collectors],
    evidence: e.evidence
  })).sort((a, b) => b.collectors - a.collectors || b.primary - a.primary || a.key.localeCompare(b.key));
};
function networkProfile({ goals, cardById }) {
  const hasCharacter = (c) => !c.tags.includes("sealed") && !c.tags.includes("trainer");
  const characters = networkTally(goals, cardById, (c) => hasCharacter(c) ? c.name : null);
  const sets = networkTally(goals, cardById, (c) => c.set);
  const format = networkTally(goals, cardById, (c) => GRADED_VALUES.includes(c.grade) ? isRaw(c) ? "Raw" : "Graded" : null);
  const grade = networkTally(goals, cardById, (c) => !isRaw(c) && GRADED_VALUES.includes(c.grade) ? c.grade : null);
  const unclassifiedFormat = goals.filter((g) => {
    const c = cardById(g.cardId);
    return c && !GRADED_VALUES.includes(c.grade);
  }).length;
  return { characters, sets, format, grade, unclassifiedFormat, era: null };
}
function networkDemandCards({ goals, cardById }) {
  const m = /* @__PURE__ */ new Map();
  for (const g of goals) {
    const c = cardById(g.cardId);
    if (!c) continue;
    const k = identityKey(c);
    const e = m.get(k) || { card: c, collectors: /* @__PURE__ */ new Set(), primary: /* @__PURE__ */ new Set(), secondary: /* @__PURE__ */ new Set() };
    e.collectors.add(g.collectorId);
    (g.tier === "primary" ? e.primary : e.secondary).add(g.collectorId);
    m.set(k, e);
  }
  return [...m.values()].map((e) => ({
    card: e.card,
    collectors: e.collectors.size,
    collectorIds: [...e.collectors],
    primary: [...e.primary],
    secondary: [...e.secondary]
  })).sort((a, b) => b.collectors - a.collectors || b.primary.length - a.primary.length || cardTitle(a.card).localeCompare(cardTitle(b.card)));
}
function nextAction(opp) {
  if (isArchived(opp)) return { owner: null, label: "Archived \u2014 closed without completing" };
  switch (opp.stage) {
    case "secondary":
      return { owner: "collector", label: "Collector to promote to Primary Goal" };
    case "primary":
      return { owner: "collector", label: "Collector to make an offer" };
    case "agree-price": {
      const last = lastEntry(opp.priceThread);
      if (!last) return { owner: "collector", label: "Collector to make an offer" };
      return last.by === "collector" ? { owner: "tp", label: "You: accept or counter their offer" } : { owner: "collector", label: "Collector to accept or counter" };
    }
    case "select-trade": {
      const cards = tradeCards(opp);
      if (!cards.length) return { owner: "collector", label: "Collector to add trade cards or choose cash" };
      if (!opp.trade.submitted) return { owner: "collector", label: `Collector assembling package \xB7 ${cards.length} card${cards.length === 1 ? "" : "s"}` };
      const unreviewed = proposedCards(opp).length;
      if (unreviewed) return { owner: "tp", label: `You: accept or reject ${unreviewed} proposed card${unreviewed === 1 ? "" : "s"}` };
      return includedCards(opp).length ? { owner: null, label: "Package settled" } : { owner: "collector", label: "Every card rejected \u2014 collector to re-propose or choose cash" };
    }
    case "value-trade": {
      if (allWithdrawn(opp)) return { owner: "collector", label: "Collector to continue as cash only or stop pursuing" };
      const active = activeTradeCards(opp);
      const settled = active.filter(fullyAgreed).length;
      const mine = active.filter((c) => cardOwner(c).owner === "tp");
      if (mine.length) {
        const m = mine.filter((c) => cardPhase(c) === PHASE.market).length;
        return { owner: "tp", label: m ? `You: review market on ${m} card${m === 1 ? "" : "s"} \xB7 ${settled} of ${active.length} settled` : `You: trade % on ${mine.length} card${mine.length === 1 ? "" : "s"} \xB7 ${settled} of ${active.length} settled` };
      }
      return { owner: "collector", label: `Collector to respond \xB7 ${settled} of ${active.length} settled` };
    }
    case "deal": {
      const d = opp.deal;
      if (adjOpen(d)) {
        const last = lastEntry(d.adjThread);
        return last.by === "collector" ? { owner: "tp", label: "You: accept or counter the final balance" } : { owner: "collector", label: "Collector to accept or counter the final balance" };
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
      if (!f.tpHandoff) return { owner: "tp", label: `You: confirm handoff \u2014 ${fulfillmentSummary(f)}` };
      if (!f.collectorReceipt) return { owner: "collector", label: "Collector to confirm receipt" };
      return { owner: null, label: "Both confirmed" };
    }
    case "completed":
      return { owner: null, label: "Completed" };
    default:
      return { owner: "collector", label: "Collector-owned" };
  }
}
function buildCanonicalSeed() {
  return {
    catalog: CARDS_SEED,
    collectors: COLLECTORS_SEED,
    partners: PARTNERS_SEED,
    inventory: CARDS_SEED.filter((c) => c.id.startsWith("i")).map((c, k) => ({
      invId: "inv" + (k + 1),
      partnerId: SELF_PARTNER,
      cardId: c.id,
      ask: c.value,
      cost: Math.round(c.value * 0.78),
      acquired: "2026-0" + (k % 6 + 1) + "-1" + (k % 9 + 1),
      archived: false,
      cert: "PSA " + (7e7 + k * 13457),
      photos: { front: null, back: null }
    })).concat([
      // extra physical copies of the same card identity, at different prices
      { invId: "inv-c2", partnerId: SELF_PARTNER, cardId: "i1", ask: 4650, cost: 3400, acquired: "2026-05-02", archived: false, cert: "PSA 71204885", photos: { front: null, back: null } },
      { invId: "inv-c3", partnerId: SELF_PARTNER, cardId: "i1", ask: 3950, cost: 3100, acquired: "2026-06-21", archived: false, cert: "PSA 68931507", photos: { front: null, back: null } },
      { invId: "inv-c4", partnerId: SELF_PARTNER, cardId: "i14", ask: 810, cost: 615, acquired: "2026-07-04", archived: false, cert: "PSA 73550142", photos: { front: null, back: null } },
      /* OTHER PARTNERS' STOCK. Same canonical collection, different owner — this is
         what lets a collector see several partners who can meet one goal. Scoped
         out of every TP surface by partnerId, so p-self's shelf is unchanged. */
      { invId: "inv-p2-1", partnerId: "p2", cardId: "i17", ask: 9450, cost: 8100, acquired: "2026-06-02", archived: false, cert: "PSA 70884120", photos: { front: null, back: null } },
      { invId: "inv-p3-1", partnerId: "p3", cardId: "i17", ask: 10200, cost: 8800, acquired: "2026-05-18", archived: false, cert: "PSA 71559034", photos: { front: null, back: null } },
      { invId: "inv-p2-2", partnerId: "p2", cardId: "i23", ask: 1290, cost: 990, acquired: "2026-07-11", archived: false, cert: null, photos: { front: null, back: null } },
      { invId: "inv-p4-1", partnerId: "p4", cardId: "u6", ask: 1380, cost: 1050, acquired: "2026-07-29", archived: false, cert: null, photos: { front: null, back: null } }
    ]),
    goals: GOALS_SEED.map((g, i) => ({
      id: "g" + i,
      collectorId: g[0],
      cardId: g[1],
      tier: g[2],
      note: g[3],
      since: g[4],
      // when the CURRENT priority began
      createdAt: g[5],
      // when the goal first existed
      confirmedAt: g[6],
      // when the collector last said it's still accurate
      secondarySince: g[2] === "primary" ? g[5] : null
    })),
    opportunities: buildOpps(OPPS_SEED),
    binder: COLLECTOR_CARDS_SEED.map((r, i) => ({ id: "cc" + i, cardId: r[0], collectorId: r[1], market: r[3], photos: r[4], cert: r[5], addedAt: r[6] })),
    /* CANONICAL INTEREST: TrustedPartner -> exact BinderCopy. */
    interests: (() => {
      const rows = [];
      COLLECTOR_CARDS_SEED.forEach((r, i) => {
        if (r[2]) rows.push({ partnerId: SELF_PARTNER, binderId: "cc" + i, at: r[6] });
      });
      OTHER_INTEREST_SEED.forEach((x) => rows.push(x));
      return rows;
    })(),
    activity: ACTIVITY_SEED.map((a, i) => ({ id: "a" + i, collectorId: a[0], type: a[1], text: a[2], date: a[3] })),
    /* One thread per Trusted Partner x Collector x card identity. Keyed on identity
       rather than goalId or oppId so it survives Secondary -> Primary and is
       inherited by the Opportunity when the collector makes an offer. */
    conversations: []
  };
}
function useShared(store, key) {
  const state = useSyncExternalStore(store.sub, store.get, store.get);
  const set = useCallback((updater) => {
    const cur = store.get();
    const next = typeof updater === "function" ? updater(cur[key]) : updater;
    store.set({ ...cur, [key]: next });
  }, [store, key]);
  return [state[key], set];
}
function buildOpps(seed) {
  const goalIdFor = (collectorId, cardId) => {
    const ix = GOALS_SEED.findIndex((g) => g[0] === collectorId && g[1] === cardId);
    return ix < 0 ? null : "g" + ix;
  };
  const binder = (cid) => COLLECTOR_CARDS_SEED.filter((r) => r[1] === cid && r[2] && r[4].front && r[3] != null);
  const eligible = (cid) => binder(cid).map((r) => r[0]);
  const binderRow = (id) => COLLECTOR_CARDS_SEED.find((r) => r[0] === id);
  const val = (id) => CARDS_SEED.find((c) => c.id === id)?.value || 0;
  return seed.map((t, i) => {
    const [collectorId, cardId, stage, at, listed] = t;
    const o = {
      ...emptyOpp(collectorId, cardId, null, listed, at, goalIdFor(collectorId, cardId)),
      id: "o" + i,
      stage,
      updated: at
    };
    const offer = Math.round(listed * 0.88);
    const settled = Math.round(listed * 0.95);
    if (stage === "agree-price") {
      o.priceThread = [{ by: "collector", type: "offer", amount: offer, at }];
      if (i % 2 === 1) o.priceThread.push({ by: "tp", type: "counter", amount: Math.round(listed * 0.96), at });
    } else {
      o.priceThread = [
        { by: "collector", type: "offer", amount: offer, at },
        { by: "tp", type: "counter", amount: settled, at },
        { by: "collector", type: "accept", amount: settled, at }
      ];
      o.agreedPrice = settled;
    }
    if (stage === "select-trade") {
      const ids = eligible(collectorId).slice(0, 3);
      const withoutPhotos = COLLECTOR_CARDS_SEED.filter((r) => r[1] === collectorId && r[2] && !r[4].front).map((r) => r[0]);
      const all = [.../* @__PURE__ */ new Set([...ids, ...withoutPhotos.slice(0, 1)])];
      const submitted = i % 3 !== 0;
      o.trade = all.length ? { mode: "trade", submitted, cards: all.map((id, k) => {
        const b = binderRow(id);
        const tc = emptyTradeCard(id, b[4], b[5], id);
        if (submitted && k < all.length - 1) {
          tc.inclusion = (k + i) % 3 === 1 ? "rejected" : "accepted";
          tc.reviewedAt = at;
        }
        return tc;
      }) } : null;
    }
    if (["value-trade", "deal", "fulfillment", "completed"].includes(stage)) {
      const budget = o.agreedPrice * 0.7;
      const cap = stage === "value-trade" ? 5 : 3;
      let used = 0;
      const ids = [];
      for (const id of eligible(collectorId)) {
        const credit = Math.round(Math.round(binderRow(id)[3] * 0.9) * PARTNER.tradeRate);
        if (used + credit <= budget && ids.length < cap) {
          ids.push(id);
          used += credit;
        }
      }
      if (!ids.length && stage === "value-trade") {
        const cheapest = eligible(collectorId).slice().sort((a, b) => binderRow(a)[3] - binderRow(b)[3])[0];
        if (cheapest) ids.push(cheapest);
      }
      if (!ids.length) {
        o.trade = { mode: "cash", submitted: true, cards: [] };
      } else if (stage === "value-trade") {
        o.trade = { mode: "trade", submitted: true, cards: ids.map((id, k) => {
          const b = binderRow(id);
          const tc = emptyTradeCard(id, b[4], b[5], id);
          tc.inclusion = "accepted";
          tc.reviewedAt = at;
          const ask = b[3];
          const slot = (k + i) % 7;
          if (slot >= 1) {
            tc.collectorMarket = ask;
            tc.valueThread.push({ by: "collector", type: "propose", amount: ask, at });
          }
          if (slot >= 2) {
            tc.tpMarket = Math.round(ask * 0.88);
            tc.valueThread.push({ by: "tp", type: "propose", amount: tc.tpMarket, at });
          }
          if (slot >= 3) {
            tc.agreedMarket = tc.tpMarket;
            tc.collectorMarket = tc.tpMarket;
            tc.valueThread.push({ by: "collector", type: "accept", amount: tc.tpMarket, at });
          }
          if (slot >= 4) {
            tc.tpPercent = PARTNER.tradeRate;
            tc.percentThread.push({ by: "tp", type: "propose", percent: tc.tpPercent, at });
          }
          if (slot >= 5) {
            tc.collectorPercent = 0.86;
            tc.percentThread.push({ by: "collector", type: "propose", percent: 0.86, at });
          }
          if (slot === 6) {
            tc.withdrawn = true;
            tc.withdrawnAt = at;
          }
          return tc;
        }) };
      } else {
        const rates = [0.8, 0.75, 0.82];
        o.trade = { mode: "trade", submitted: true, cards: ids.map((id, k) => {
          const b = binderRow(id);
          const v = Math.round(b[3] * 0.9);
          const r = rates[(k + i) % rates.length];
          const tc = emptyTradeCard(id, b[4], b[5], id);
          tc.inclusion = "accepted";
          tc.reviewedAt = at;
          tc.collectorMarket = v;
          tc.tpMarket = v;
          tc.agreedMarket = v;
          tc.valueThread = [
            { by: "collector", type: "propose", amount: b[3], at },
            { by: "tp", type: "propose", amount: v, at },
            { by: "collector", type: "accept", amount: v, at }
          ];
          tc.tpPercent = r;
          tc.collectorPercent = r;
          tc.agreedPercent = r;
          tc.percentThread = [
            { by: "tp", type: "propose", percent: PARTNER.tradeRate, at },
            ...r !== PARTNER.tradeRate ? [{ by: "collector", type: "propose", percent: r, at }] : [],
            { by: r !== PARTNER.tradeRate ? "tp" : "collector", type: "accept", percent: r, at }
          ];
          return tc;
        }) };
      }
    }
    if (stage === "deal" && i % 3 === 0) o.deal = { ...emptyDeal(), tpAgreed: true };
    if (["fulfillment", "completed"].includes(stage)) o.deal = { ...emptyDeal(), collectorAgreed: true, tpAgreed: true };
    if (stage === "fulfillment") {
      const slot = i % 3;
      if (slot === 1) {
        o.fulfillment = {
          ...emptyFulfillment(),
          method: "show",
          show: "Twin Cities Card Show",
          date: "2026-09-12",
          note: "Find me at table 214",
          proposedAt: at
        };
      } else if (slot === 2) {
        o.fulfillment = {
          ...emptyFulfillment(),
          method: "meetup",
          date: "2026-09-08",
          time: "18:00",
          location: "Dreamers Vault \u2014 Minneapolis",
          note: "Meet near the front counter",
          proposedAt: at,
          collectorConfirmedPlan: true
        };
      }
    }
    if (stage === "completed") {
      o.fulfillment = {
        ...emptyFulfillment(),
        method: i % 2 ? "show" : "meetup",
        show: "Twin Cities Card Show",
        date: i % 2 ? "2026-06-13" : "2026-05-30",
        time: "18:00",
        location: "Dreamers Vault \u2014 Minneapolis",
        proposedAt: at,
        collectorConfirmedPlan: true,
        tpHandoff: true,
        collectorReceipt: true
      };
      o.completedAt = at;
    }
    return o;
  });
}
var OPPS_SEED = [
  ["c1", "i1", "agree-price", "2026-08-05", 4200],
  ["c5", "i8", "agree-price", "2026-08-04", 1150],
  ["c11", "i6", "agree-price", "2026-07-21", 900],
  ["c8", "i29", "agree-price", "2026-08-08", 1250],
  ["c4", "i27", "agree-price", "2026-08-07", 620],
  ["c10", "i22", "agree-price", "2026-08-02", 1600],
  ["c2", "i3", "agree-price", "2026-08-01", 780],
  ["c3", "i1", "select-trade", "2026-07-28", 4200],
  ["c6", "i12", "select-trade", "2026-08-06", 3400],
  ["c12", "i17", "select-trade", "2026-04-14", 9800],
  ["c13", "i30", "select-trade", "2026-07-15", 2200],
  ["c9", "i4", "select-trade", "2026-05-19", 3100],
  ["c7", "i16", "value-trade", "2026-06-11", 12500],
  ["c1", "i5", "value-trade", "2026-08-03", 1450],
  ["c8", "i25", "value-trade", "2026-08-08", 210],
  ["c2", "i11", "value-trade", "2026-07-30", 2400],
  ["c6", "i13", "deal", "2026-08-06", 900],
  ["c10", "i14", "deal", "2026-08-02", 780],
  ["c4", "i26", "deal", "2026-08-07", 190],
  ["c13", "i20", "fulfillment", "2026-07-15", 1100],
  ["c12", "i21", "fulfillment", "2026-08-04", 420],
  ["c7", "i17", "fulfillment", "2026-08-06", 9800],
  ["c1", "x1", "completed", "2026-06-18", 1800],
  ["c2", "x2", "completed", "2026-05-02", 300],
  ["c3", "x7", "completed", "2026-07-09", 900],
  ["c4", "x9", "completed", "2026-06-27", 300],
  ["c5", "x3", "completed", "2026-03-14", 350],
  ["c6", "x8", "completed", "2026-05-21", 260],
  ["c7", "x4", "completed", "2026-02-08", 220],
  ["c8", "x6", "completed", "2026-07-31", 380],
  ["c9", "x1", "completed", "2026-01-23", 1800],
  ["c10", "x5", "completed", "2026-06-05", 210],
  ["c11", "x2", "completed", "2026-04-11", 300],
  ["c12", "x6", "completed", "2026-03-29", 380],
  ["c13", "x10", "completed", "2026-07-02", 700],
  ["c13", "x7", "completed", "2025-12-15", 900],
  ["c1", "x3", "completed", "2025-11-08", 350],
  ["c11", "x4", "completed", "2026-02-19", 220]
];
var ACTIVITY_SEED = [
  ["c1", "goal", "Primary goal created \u2014 Charizard, Base Set PSA 9", "2026-07-02"],
  ["c1", "match", "Goal matched to inventory \u2014 Charizard, Base Set PSA 9", "2026-07-02"],
  ["c1", "outreach", "You reached out about Charizard, Base Set PSA 9", "2026-07-29"],
  ["c1", "stage", "Price agreed at $4,200 \u2014 Charizard, Base Set PSA 9", "2026-08-05"],
  ["c1", "completed", "Transaction completed \u2014 Charizard, Base Set PSA 8 ($1,800)", "2026-06-18"],
  ["c2", "goal", "Primary goal created \u2014 Charizard, Base Set PSA 9", "2026-06-14"],
  ["c2", "outreach", "You reached out about Venusaur, Base Set PSA 9", "2026-07-26"],
  ["c2", "stage", "Price agreed at $780 \u2014 Venusaur, Base Set PSA 9", "2026-08-01"],
  ["c3", "goal", "Primary goal created \u2014 Espeon Gold Star PSA 9", "2026-05-30"],
  ["c3", "stage", "Trade selected \u2014 Charizard, Base Set PSA 9", "2026-07-28"],
  ["c4", "match", "Goal matched to inventory \u2014 Lillie (Full Art) PSA 9", "2026-07-19"],
  ["c4", "stage", "Deal reached \u2014 Marnie (Full Art) PSA 9", "2026-08-07"],
  ["c5", "goal", "Primary goal created \u2014 sealed 1st Ed Team Rocket box", "2026-06-01"],
  ["c5", "outreach", "You reached out about Dark Charizard, Team Rocket PSA 9", "2026-07-25"],
  ["c6", "stage", "Deal reached \u2014 Shining Mewtwo, Neo Destiny PSA 8", "2026-08-06"],
  ["c7", "manual", "Called about Umbreon Gold Star \u2014 wants photos of corners", "2026-06-11"],
  ["c8", "stage", "Price agreed at $1,250 \u2014 Evolving Skies booster box", "2026-08-08"],
  ["c9", "manual", "Met at Miami card show, discussed Skyridge Charizard", "2026-05-19"],
  ["c10", "stage", "Deal reached \u2014 Umbreon, Neo Discovery PSA 9", "2026-08-02"],
  ["c11", "goal", "Primary goal created \u2014 Alakazam, Base Set 1st Edition", "2026-05-12"],
  ["c12", "goal", "Primary goal created \u2014 Rayquaza Gold Star PSA 9", "2026-03-02"],
  ["c12", "stage", "Fulfillment started \u2014 Charizard VMAX PSA 10", "2026-08-04"],
  ["c13", "stage", "Fulfillment started \u2014 Mewtwo, Japanese Promo PSA 8", "2026-07-15"],
  ["c13", "completed", "Transaction completed \u2014 Shining Magikarp PSA 9 ($700)", "2026-07-02"]
];
var USD_LOCALE = "en-US";
var money = (n) => {
  if (n == null || !isFinite(n)) return "\u2014";
  const v = Math.round(n);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString(USD_LOCALE);
};
var moneyExact = (n) => {
  if (n == null || !isFinite(n)) return "\u2014";
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString(
    USD_LOCALE,
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  );
};
var fmtDate = (d) => (/* @__PURE__ */ new Date(d + "T12:00:00")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
var daysSince = (d) => Math.round((TODAY - /* @__PURE__ */ new Date(d + "T12:00:00")) / 864e5);
var ago = (d) => {
  const n = daysSince(d);
  return n <= 0 ? "today" : n === 1 ? "1 day ago" : n < 60 ? `${n} days ago` : `${Math.round(n / 30)} mo ago`;
};
var initials = (n) => n.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
var GRADED_VALUES = ["Raw", "PSA 1", "PSA 2", "PSA 3", "PSA 4", "PSA 5", "PSA 6", "PSA 7", "PSA 8", "PSA 9", "PSA 10"];
var CONDITION_VALUES = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];
var PRINT_VALUES = ["Normal", "Holo", "Reverse Holo"];
var isRaw = (c) => c && c.grade === "Raw";
var IDENTITY_FIELDS = ["name", "grade", "print", "edition", "set", "num", "language"];
var PRINT_IDENTITY_FIELDS = ["name", "set", "num", "print"];
var printIdentityKey = (c) => c ? PRINT_IDENTITY_FIELDS.map((f) => String(c[f]).trim().toLowerCase()).join("|") : "";
var identityComplete = (c) => {
  if (!c) return false;
  if (!IDENTITY_FIELDS.every((f) => c[f] != null && String(c[f]).trim() !== "")) return false;
  return !isRaw(c) || c.condition != null && String(c.condition).trim() !== "";
};
var identityKey = (c) => {
  if (!c) return "";
  const base = IDENTITY_FIELDS.map((f) => String(c[f]).trim().toLowerCase());
  base.push(isRaw(c) ? String(c.condition).trim().toLowerCase() : "n/a");
  return base.join("|");
};
var tenureLabel = (since) => {
  const total = daysSince(since);
  if (total == null || !isFinite(total)) return "\u2014";
  if (total < 365) return total + (total === 1 ? " day" : " days");
  const years = Math.floor(total / 365);
  const rem = total % 365;
  const y = years + (years === 1 ? " year" : " years");
  return rem === 0 ? y : `${y} \xB7 ${rem} ${rem === 1 ? "day" : "days"}`;
};
var elapsedAgo = (d) => {
  const e = elapsed(d);
  return e === "Today" ? e : e + " ago";
};
function elapsed(dateStr) {
  const d = daysSince(dateStr);
  if (d <= 0) return "Today";
  if (d < 30) return d === 1 ? "1 day" : d + " days";
  if (d < 365) {
    const m = Math.max(1, Math.round(d / 30));
    return m === 1 ? "1 month" : m + " months";
  }
  const y = Math.max(1, Math.floor(d / 365));
  return y === 1 ? "1 year" : y + " years";
}
var isUnseenAddition = (cc, collector) => {
  const seenAt = collector?.binderReviewedAt || collector?.since || null;
  if (!seenAt) return true;
  return !!(cc.addedAt && Date.parse(cc.addedAt) > Date.parse(seenAt));
};
var unseenAdditions = (binderCards, collector) => binderCards.filter((cc) => isUnseenAddition(cc, collector)).length;
var cardTitle = (c) => `${c.year} ${c.name} \u2014 ${c.set}${c.num && c.num !== "\u2014" ? " #" + c.num : ""}${c.grade ? " \xB7 " + c.grade : ""}`;
var cardShort = (c) => `${c.name} \u2014 ${c.set}`;
var cardInfoText = (c, copy) => {
  if (!c) return "";
  const raw = isRaw(c);
  const condition = copy && copy.condition || c.condition;
  return [
    c.name,
    c.set,
    c.num && c.num !== "\u2014" ? c.num : null,
    c.print && c.print !== "Normal" ? c.print : null,
    c.edition,
    c.language,
    raw ? "Raw" : c.grade,
    raw ? condition : null
  ].filter((v) => v != null && String(v).trim() !== "").join(" \xB7 ");
};
var certNumber = (cert) => {
  if (!cert) return null;
  const n = String(cert).replace(/[^0-9]/g, "");
  return n || null;
};
function MetYet({ store: injectedStore, partnerId = SELF_PARTNER }) {
  const store = useMemo(
    () => injectedStore || (0, import_metyet_store.createStore)(buildCanonicalSeed()),
    [injectedStore]
  );
  const [nav, setNav] = useState({ section: "collectors" });
  const [cardDb, setCardDb] = useShared(store, "catalog");
  const [inventory, setInventory] = useShared(store, "inventory");
  const [goals, setGoals] = useShared(store, "goals");
  const [collectors, setCollectors] = useShared(store, "collectors");
  const [opps, setOpps] = useShared(store, "opportunities");
  const [collectorCards, setCollectorCards] = useShared(store, "binder");
  const [interests, setInterests] = useShared(store, "interests");
  const [activity, setActivity] = useShared(store, "activity");
  const catalog = useMemo(() => {
    const groups = /* @__PURE__ */ new Map();
    for (const c of cardDb) {
      const k = printIdentityKey(c);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    return [...groups.values()].map((v) => ({ ...v[0], variants: v }));
  }, [cardDb]);
  const resolveCanonicalCard = (printed, copy) => {
    const target = { ...printed, edition: copy.edition, grade: copy.grade, condition: copy.condition };
    delete target.variants;
    const k = identityKey(target);
    const hit = cardDb.find((c) => identityKey(c) === k);
    if (hit) return { id: hit.id, card: hit };
    const id = "c" + k.replace(/[^a-z0-9]+/g, "").slice(0, 24) + "-" + cardDb.length;
    const resolved = { ...target, id };
    setCardDb((db) => [...db, resolved]);
    return { id, card: resolved };
  };
  const [threads, setThreads] = useShared(store, "conversations");
  const interestedIn = useCallback((binderId, pid = partnerId) => interests.some((i) => i.binderId === binderId && i.partnerId === pid), [interests, partnerId]);
  const partnersInterested = useCallback((binderId) => interests.filter((i) => i.binderId === binderId).map((i) => i.partnerId), [interests]);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const say = useCallback((m) => {
    setToast(m);
    setTimeout(() => setToast((t) => t === m ? null : t), 2600);
  }, []);
  const card = useCallback((id) => cardDb.find((c) => c.id === id), [cardDb]);
  const collector = useCallback((id) => collectors.find((c) => c.id === id), [collectors]);
  const activeInv = useMemo(
    () => inventory.filter((i) => !i.archived && i.partnerId === SELF_PARTNER),
    [inventory]
  );
  const ownedIds = useMemo(() => new Set(activeInv.map((i) => i.cardId)), [activeInv]);
  const model = useMemo(() => {
    var _a;
    const goalKey = new Set(goals.map((g) => g.collectorId + "|" + g.cardId));
    const prefMatches = [];
    for (const col of collectors) {
      for (const inv of activeInv) {
        const c = cardDb.find((x) => x.id === inv.cardId);
        if (!c) continue;
        if (goalKey.has(col.id + "|" + c.id)) continue;
        const shared = c.tags.filter((t) => col.prefs.includes(t));
        if (shared.length) prefMatches.push({ collectorId: col.id, cardId: c.id, tags: shared });
      }
    }
    const prefInterest = {};
    for (const c of cardDb) {
      if (ownedIds.has(c.id) || c.id.startsWith("x")) continue;
      for (const col of collectors) {
        if (goalKey.has(col.id + "|" + c.id)) continue;
        const shared = c.tags.filter((t) => col.prefs.includes(t));
        if (shared.length >= 2) (prefInterest[_a = c.id] || (prefInterest[_a] = [])).push({ collectorId: col.id, tags: shared });
      }
    }
    return { prefMatches, prefInterest };
  }, [collectors, activeInv, cardDb, goals, ownedIds]);
  const goalMatches = useCallback(
    (goal) => {
      const want = identityKey(card(goal.cardId));
      if (!want) return [];
      return activeInv.filter((i) => identityKey(card(i.cardId)) === want);
    },
    [activeInv, card]
  );
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
      preference: model.prefMatches.filter((p) => p.cardId === cardId)
    }),
    [goals, model]
  );
  const inDeal = useMemo(() => new Set(opps.map((o) => o.collectorId + "|" + o.cardId)), [opps]);
  const goalsAtStage = useCallback(
    (tier) => goals.filter((g) => g.tier === tier && !inDeal.has(g.collectorId + "|" + g.cardId)),
    [goals, inDeal]
  );
  const stageCounts = useMemo(() => {
    const c = { secondary: goalsAtStage("secondary").length, primary: goalsAtStage("primary").length };
    for (const s of DEAL_STAGES) c[s] = opps.filter((o) => o.stage === s && isActive(o)).length;
    c.archived = opps.filter(isArchived).length;
    return c;
  }, [goalsAtStage, opps]);
  const coverage = useMemo(() => inventoryCoverage({
    activeInv,
    opps,
    goals,
    collectors,
    cardById: card,
    today: TODAY
  }), [activeInv, opps, goals, collectors, card]);
  const profile = useMemo(() => networkProfile({ goals, cardById: card }), [goals, card]);
  const demandCards = useMemo(() => networkDemandCards({ goals, cardById: card }), [goals, card]);
  const collectorStats = useCallback(
    (id) => {
      const gs = goals.filter((g) => g.collectorId === id);
      const p = gs.filter((g) => g.tier === "primary");
      const s = gs.filter((g) => g.tier === "secondary");
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
  const collectorFacts = useCallback(
    (id) => {
      const s = collectorStats(id);
      const done = s.done;
      const mine = goals.filter((g) => g.collectorId === id);
      const covered = mine.filter((g) => goalMatches(g).length > 0);
      const c = collector(id);
      const binder = collectorCards.filter((cc) => cc.collectorId === id);
      return {
        memberSince: c ? c.since : null,
        // existing join date, not re-stored
        memberDays: c ? daysSince(c.since) : null,
        // derived from the date
        completedDeals: done.length,
        dealValue: done.reduce((a, o) => a + (o.agreedPrice || 0), 0),
        coverage: mine.length ? covered.length / mine.length : null,
        coveredGoals: covered.length,
        totalGoals: mine.length,
        /* Every card shared, whatever the Trusted Partner thinks of it — interest
           is a TP opinion and has no bearing on how big the binder is. */
        binderTotal: binder.length,
        binderNew: unseenAdditions(binder, c),
        /* What this partner said they'd consider. Read off the interest relationship
           every render, never stored. */
        binderOpen: binder.filter((cc) => interestedIn(cc.id)).length
      };
    },
    [collectorStats, goals, goalMatches, collector, collectorCards, interestedIn]
  );
  const threadKeyFor = useCallback((collectorId, cardId) => collectorId + "::" + identityKey(card(cardId)), [card]);
  const threadFor = useCallback(
    (collectorId, cardId) => threads.find((t) => t.key === threadKeyFor(collectorId, cardId)) || null,
    [threads, threadKeyFor]
  );
  const appendEntry = (collectorId, cardId, entry) => {
    const key = collectorId + "::" + identityKey(card(cardId));
    const stamped = { id: "e" + Date.now() + Math.random().toString(36).slice(2, 6), at: (/* @__PURE__ */ new Date()).toISOString(), ...entry };
    setThreads((ts) => {
      const found = ts.find((t) => t.key === key);
      if (found) return ts.map((t) => t.key === key ? { ...t, entries: [...t.entries, stamped] } : t);
      return [...ts, { id: "t" + key, key, collectorId, cardId, oppId: null, entries: [stamped] }];
    });
  };
  const sendMessage = (collectorId, cardId, by, text) => {
    appendEntry(collectorId, cardId, { kind: "message", by, text });
    if (by === "tp") logActivity(collectorId, "outreach", `You messaged about ${cardShort(card(cardId))} \u2014 ${text.slice(0, 60)}`);
  };
  const logMilestone = (collectorId, cardId, text) => appendEntry(collectorId, cardId, { kind: "event", by: "system", text });
  const hasConversation = useCallback(
    (collectorId, cardId) => {
      const t = threadFor(collectorId, cardId);
      return !!t && t.entries.some((e) => e.kind === "message");
    },
    [threadFor]
  );
  const logActivity = (collectorId, type, text, date) => setActivity((a) => [{ id: "a" + Date.now() + Math.random(), collectorId, type, text, date: date || TODAY.toISOString().slice(0, 10) }, ...a]);
  const startOutreach = (collectorId, cardId, goalTier, message) => {
    const c = card(cardId);
    if (message) appendEntry(collectorId, cardId, { kind: "message", by: "tp", text: message });
    logActivity(collectorId, "outreach", `You reached out about ${cardShort(c)} (${goalTier} goal)${message ? " \u2014 " + message.slice(0, 60) : ""}`);
    say(`Outreach sent to ${collector(collectorId).short}. The stage is unchanged \u2014 only they can start a negotiation.`);
    setModal(null);
  };
  const NOW = TODAY.toISOString().slice(0, 10);
  const patchOpp = (id, fn, note, type = "stage") => {
    const cur = opps.find((o) => o.id === id);
    if (!cur) return;
    const next = { ...fn(cur), updated: NOW };
    setOpps((os) => os.map((o) => o.id === id ? next : o));
    if (note) {
      const text = note(next, cur);
      logActivity(cur.collectorId, type, text);
      logMilestone(cur.collectorId, cur.cardId, text);
    }
  };
  const collectorPromoteGoal = (goalId) => {
    const g = goals.find((x) => x.id === goalId);
    if (!g || g.tier !== "secondary") return;
    setGoals((gs) => gs.map((x) => x.id === goalId ? { ...x, tier: "primary", since: NOW, secondarySince: x.secondarySince || x.since, confirmedAt: NOW } : x));
    logActivity(g.collectorId, "goal", `Secondary goal promoted to Primary \u2014 ${cardShort(card(g.cardId))} (secondary since ${fmtDate(g.since)})`);
    logMilestone(g.collectorId, g.cardId, "Secondary Goal promoted to Primary Goal");
    say(`${collector(g.collectorId).short} promoted this to a Primary Goal.`);
  };
  const collectorConfirmGoal = (goalId) => {
    const g = goals.find((x) => x.id === goalId);
    if (!g) return;
    setGoals((gs) => gs.map((x) => x.id === goalId ? { ...x, confirmedAt: NOW } : x));
    logActivity(g.collectorId, "goal", `${STAGE_LABEL[g.tier]} confirmed \u2014 ${cardShort(card(g.cardId))}`);
    logMilestone(g.collectorId, g.cardId, `${STAGE_LABEL[g.tier]} confirmed as still accurate`);
    say(`${collector(g.collectorId).short} confirmed this goal is still accurate.`);
  };
  const collectorMakeOffer = (goalId, amount, invId) => {
    const g = goals.find((x) => x.id === goalId);
    const inv = inventory.find((i) => i.invId === invId && !i.archived);
    if (!g || !inv) return;
    if (opps.some((o2) => o2.goalId === goalId && isActive(o2) && STAGE_MAP.indexOf(o2.stage) >= STAGE_MAP.indexOf("agree-price"))) return;
    const o = emptyOpp(g.collectorId, g.cardId, inv.invId, inv.ask, NOW, goalId, inv.partnerId || SELF_PARTNER);
    o.priceThread = [{ by: "collector", type: "offer", amount, at: NOW }];
    setOpps((os) => [...os, o]);
    setGoals((gs) => gs.map((x) => x.id === goalId ? { ...x, confirmedAt: NOW } : x));
    logActivity(g.collectorId, "stage", `Made an offer of ${money(amount)} on ${cardShort(card(g.cardId))} (listed ${money(inv.ask)})`);
    logMilestone(g.collectorId, g.cardId, `Collector made an offer \u2014 ${money(amount)} against a listed ${money(inv.ask)}`);
    const key = g.collectorId + "::" + identityKey(card(g.cardId));
    setThreads((ts) => ts.map((t) => t.key === key ? { ...t, oppId: o.id, invId: inv.invId } : t));
    say(`${collector(g.collectorId).short} opened a negotiation at ${money(amount)}.`);
  };
  const priceRespond = (oppId, by, action, amount) => patchOpp(oppId, (o) => {
    const thread = [...o.priceThread, { by, type: action, amount: action === "accept" ? lastEntry(o.priceThread).amount : amount, at: NOW }];
    const agreed = action === "accept" ? lastEntry(o.priceThread).amount : null;
    return {
      ...o,
      priceThread: thread,
      agreedPrice: agreed ?? o.agreedPrice,
      stage: action === "accept" ? "select-trade" : action === "decline" ? o.stage : o.stage,
      declined: action === "decline" ? true : o.declined
    };
  }, (n, o) => {
    const who = by === "tp" ? "You" : collector(o.collectorId).short;
    if (action === "accept") return `Price agreed at ${money(n.agreedPrice)} \u2014 ${cardShort(card(o.cardId))}`;
    if (action === "decline") return `${who} stopped pursuing ${cardShort(card(o.cardId))}`;
    return `${who} countered at ${money(amount)} \u2014 ${cardShort(card(o.cardId))}`;
  });
  const draftPatch = (oppId, fn) => {
    const cur = opps.find((o) => o.id === oppId);
    if (!cur) return;
    setOpps((os) => os.map((o) => o.id === oppId ? { ...fn(o), updated: NOW } : o));
  };
  const tradeAddCard = (oppId, cardId) => draftPatch(oppId, (o) => {
    if (o.trade?.submitted) return o;
    const b = collectorCards.find((cc) => cc.cardId === cardId && cc.collectorId === o.collectorId);
    const existing = o.trade?.cards || [];
    if (existing.some((c) => c.cardId === cardId)) return o;
    return { ...o, trade: { mode: "trade", submitted: false, cards: [...existing, emptyTradeCard(cardId, b?.photos, b?.cert, b?.id)] } };
  });
  const tradeRemoveCard = (oppId, cardId) => draftPatch(oppId, (o) => {
    const tc = o.trade.cards.find((c) => c.cardId === cardId);
    if (!tc || tc.inclusion !== "proposed" || o.trade.submitted) return o;
    return { ...o, trade: { ...o.trade, cards: o.trade.cards.filter((c) => c.cardId !== cardId) } };
  });
  const submitPackageForReview = (oppId) => patchOpp(
    oppId,
    (o) => ({ ...o, trade: { ...o.trade, submitted: true } }),
    (n, o) => `Collector proposed ${o.trade.cards.length} card${o.trade.cards.length === 1 ? "" : "s"} for the trade`
  );
  const selectionExhausted = (o) => !!o.trade?.submitted && proposedCards(o).length === 0 && includedCards(o).length === 0;
  const maybeCloseSelection = (o) => {
    if (selectTradeSettled(o)) return { ...o, stage: "value-trade" };
    if (selectionExhausted(o)) return { ...o, trade: { ...o.trade, mode: "cash" }, stage: "deal" };
    return o;
  };
  const tpReviewInclusion = (oppId, cardId, action) => patchOpp(oppId, (o) => {
    if (o.stage !== "select-trade" || isTerminal(o)) return o;
    const cards = o.trade.cards.map((c) => c.cardId === cardId ? tcReviewInclusion(c, action, NOW) : c);
    return maybeCloseSelection({ ...o, trade: { ...o.trade, cards } });
  }, (n, o) => {
    const nm = card(cardId).name;
    const base = action === "accept" ? `You accepted ${nm} into the trade` : `You rejected ${nm} from the trade`;
    if (n.stage === "value-trade")
      return `${base} \u2014 package settled at ${includedCards(n).length} card${includedCards(n).length === 1 ? "" : "s"}, valuation open`;
    if (n.stage === "deal")
      return `${base}. All proposed trade cards were declined \u2014 continuing as cash only.`;
    return base;
  });
  const collectorChooseCash = (oppId) => patchOpp(
    oppId,
    (o) => isTerminal(o) || !["select-trade", "value-trade"].includes(o.stage) ? o : { ...o, trade: { ...o.trade || {}, mode: "cash", submitted: true, cards: o.trade?.cards || [] }, stage: "deal" },
    (n, o) => `Chose cash only, no trade \u2014 ${cardShort(card(o.cardId))}`
  );
  const dealMutuallyAgreed = (o) => !!(o.deal && o.deal.tpAgreed && o.deal.collectorAgreed);
  const endOpportunity = (oppId, by, reason) => patchOpp(oppId, (o) => isTerminal(o) ? o : {
    ...o,
    declined: true,
    // the existing terminal flag
    archivedAt: NOW,
    archivedFrom: o.stage,
    // the stage it stopped in
    outcome: dealMutuallyAgreed(o) ? "cancelled" : "ended",
    endedBy: by,
    endedReason: reason || null
  }, (n, o) => {
    const who = by === "tp" ? "You" : collector(o.collectorId).short;
    const verb = n.outcome === "cancelled" ? "cancelled the agreed deal" : "ended the deal";
    const where = STAGE_LABEL[o.stage];
    return `${who} ${verb} during ${where}${n.endedReason ? ` \u2014 ${n.endedReason}` : ""}`;
  });
  const collectorStopPursuing = (oppId) => patchOpp(
    oppId,
    (o) => isTerminal(o) ? o : { ...o, declined: true, archivedAt: NOW, archivedFrom: o.stage },
    (n, o) => `${collector(o.collectorId).short} stopped pursuing ${cardShort(card(o.cardId))} \u2014 archived from ${STAGE_LABEL[o.stage]}`
  );
  const maybeCloseValuation = (o) => valueTradeSettled(o) && settledCards(o).length > 0 ? { ...o, stage: "deal" } : o;
  const patchCard = (oppId, cardId, fn, note, type = "stage") => patchOpp(oppId, (o) => {
    if (o.stage !== "value-trade" || isTerminal(o)) return o;
    const cards = o.trade.cards.map((c) => c.cardId === cardId ? fn(c) : c);
    return maybeCloseValuation({ ...o, trade: { ...o.trade, cards } });
  }, note, type);
  const marketAction = (oppId, cardId, by, action, amount) => patchCard(oppId, cardId, (c) => tcApplyMarket(c, by, action, amount, NOW), (n, o) => {
    const nm = card(cardId).name;
    const who = by === "tp" ? "You" : collector(o.collectorId).short;
    const after = n.trade.cards.find((c) => c.cardId === cardId);
    if (action === "accept") return `Market agreed on ${nm} at ${money(after.agreedMarket)}`;
    return `${who} proposed ${money(amount)} market value for ${nm}`;
  });
  const percentAction = (oppId, cardId, by, action, percent) => patchCard(oppId, cardId, (c) => tcApplyPercent(c, by, action, percent, NOW), (n, o) => {
    const nm = card(cardId).name;
    const who = by === "tp" ? "You" : collector(o.collectorId).short;
    const after = n.trade.cards.find((c) => c.cardId === cardId);
    if (action === "accept") return `Trade % agreed on ${nm} at ${pct(after.agreedPercent)} \u2014 trade value ${money(creditFor(after))}`;
    return `${who} proposed a ${pct(percent)} trade rate on ${nm}`;
  });
  const collectorWithdrawCard = (oppId, cardId) => patchCard(
    oppId,
    cardId,
    (c) => tcWithdraw(c, NOW),
    (n, o) => `${collector(o.collectorId).short} withdrew ${card(cardId).name} from the trade \u2014 keeping the card at these economics`
  );
  const dealAgree = (oppId, by) => patchOpp(oppId, (o) => {
    if (o.stage !== "deal" || isTerminal(o) || adjOpen(o.deal)) return o;
    const deal = { ...o.deal, [by === "tp" ? "tpAgreed" : "collectorAgreed"]: true };
    const both = deal.tpAgreed && deal.collectorAgreed;
    return { ...o, deal, stage: both ? "fulfillment" : o.stage };
  }, (n, o) => n.stage === "fulfillment" ? `Deal confirmed \u2014 ${cashLabel(n, collector(o.collectorId).short)}` : `${by === "tp" ? "You" : collector(o.collectorId).short} agreed to the deal`);
  const dealAdjust = (oppId, by, action, amount) => patchOpp(oppId, (o) => {
    if (o.stage !== "deal" || isTerminal(o)) return o;
    return { ...o, deal: dealApplyAdj(o.deal, by, action, amount, NOW) };
  }, (n, o) => {
    const who = by === "tp" ? "You" : collector(o.collectorId).short;
    const short = collector(o.collectorId).short;
    if (action === "accept") return `Final balance agreed \u2014 ${cashLabel(n, short)}`;
    const dir = amount < 0 ? "reduce" : "increase";
    return `${who} proposed a ${money(Math.abs(amount))} ${dir} to the cash balance`;
  });
  const proposeFulfillment = (oppId, plan) => patchOpp(oppId, (o) => ({
    ...o,
    fulfillment: { ...o.fulfillment, ...plan, proposedAt: NOW, revisionRequested: null, collectorConfirmedPlan: false }
  }), (n) => `Fulfillment plan proposed \u2014 ${fulfillmentSummary(n.fulfillment)}`);
  const collectorConfirmPlan = (oppId) => patchOpp(
    oppId,
    (o) => planProposed(o.fulfillment) ? { ...o, fulfillment: { ...o.fulfillment, collectorConfirmedPlan: true } } : o,
    (n) => `Fulfillment agreed \u2014 ${fulfillmentSummary(n.fulfillment)}`
  );
  const collectorRequestPlanRevision = (oppId, note) => patchOpp(oppId, (o) => ({
    ...o,
    fulfillment: { ...o.fulfillment, collectorConfirmedPlan: false, revisionRequested: { note, at: NOW } }
  }), (n, o) => `${collector(o.collectorId).short} asked to change the fulfillment plan \u2014 ${note}`);
  const confirmHandoff = (oppId, by) => patchOpp(
    oppId,
    (o) => {
      if (!planAgreed(o.fulfillment)) return o;
      const f = { ...o.fulfillment, [by === "tp" ? "tpHandoff" : "collectorReceipt"]: true };
      const done = f.tpHandoff && f.collectorReceipt;
      return { ...o, fulfillment: f, stage: done ? "completed" : o.stage, completedAt: done ? NOW : o.completedAt };
    },
    (n, o) => n.stage === "completed" ? `Transaction completed \u2014 ${cardShort(card(o.cardId))} (${money(o.agreedPrice)})` : by === "tp" ? "You confirmed handoff" : `${collector(o.collectorId).short} confirmed receipt`,
    "completed"
  );
  const collectorAddBinderCard = (collectorId, cardId, market, photos, cert) => {
    if (!hasBothPhotos(photos)) {
      say("A trade binder copy needs both a front and a back photo.");
      return false;
    }
    setCollectorCards((cs) => [...cs, {
      id: "cc" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      cardId,
      collectorId,
      market: market == null || market === "" ? null : Number(market),
      photos: { front: photos.front, back: photos.back },
      cert: cert || null,
      addedAt: (/* @__PURE__ */ new Date()).toISOString()
    }]);
    say("Copy added to the trade binder with front and back photos.");
    return true;
  };
  const attachBinderPhotos = (ccId) => {
    setCollectorCards((cs) => cs.map((c) => c.id === ccId ? { ...c, photos: { front: "binder:" + c.cardId + ":front", back: "binder:" + c.cardId + ":back" } } : c));
    say("Photos added to the collector's trade binder.");
  };
  const markBinderReviewed = useCallback((collectorId) => {
    const at = (/* @__PURE__ */ new Date()).toISOString();
    setCollectors((cs) => cs.map((c) => c.id === collectorId ? { ...c, binderReviewedAt: at } : c));
  }, [setCollectors]);
  const setTradeInterest = (ccId, on, partnerId2 = SELF_PARTNER) => {
    setInterests((xs) => on ? xs.some((i) => i.binderId === ccId && i.partnerId === partnerId2) ? xs : [...xs, { partnerId: partnerId2, binderId: ccId, at: NOW }] : xs.filter((i) => !(i.binderId === ccId && i.partnerId === partnerId2)));
    say(on ? "Marked open to trade. It can now be added in Select Trade." : "No longer marked open to trade. It won't appear in Select Trade.");
  };
  const addCopyToInventory = (cardId, draft, resolvedCard) => {
    const c = resolvedCard || card(cardId);
    if (!c) return;
    const money22 = (v, round) => {
      const raw = String(v ?? "").trim();
      if (raw === "") return null;
      const n = Number(raw);
      if (!isFinite(n) || n < 0) return void 0;
      return round ? Math.round(n) : n;
    };
    const cost = money22(draft.cost, false);
    const ask = money22(draft.ask, true);
    if (cost === void 0 || ask === void 0) return;
    setInventory((iv) => [...iv, {
      invId: "inv" + cardId + "-" + Date.now(),
      partnerId: SELF_PARTNER,
      // a copy belongs to the partner who added it
      cardId,
      ask,
      cost,
      acquired: draft.acquired || NOW,
      cert: draft.cert ? draft.cert.trim() : null,
      archived: false,
      photos: { front: null, back: null }
    }]);
    say(cost == null ? `Added to Current \u2014 ${c.name}.` : `Added to Current \u2014 ${c.name} at ${moneyExact(cost)}.`);
    setModal(null);
  };
  const saveCard = (draft, invId) => {
    if (!invId) return;
    setCardDb((db) => db.map((c) => c.id === draft.id ? { ...c, ...draft } : c));
    setInventory((iv) => iv.map((i) => i.invId === invId ? { ...i, ask: draft.ask, cost: draft.cost } : i));
    say(`${draft.name} updated.`);
    setModal(null);
  };
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
    if (!confirmed && archiveRisk(inv.cardId).blocking) {
      setModal({ type: "archive", invId });
      return;
    }
    setInventory((iv) => iv.map((i) => i.invId === invId ? { ...i, archived: true } : i));
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
    nav,
    setNav,
    card,
    collector,
    collectors,
    cardDb,
    catalog,
    resolveCanonicalCard,
    inventory,
    activeInv,
    ownedIds,
    goals,
    opps,
    activity,
    model,
    profile,
    demandCards,
    coverage,
    demandFor,
    goalMatches,
    goalsForIdentity,
    stageCounts,
    goalsAtStage,
    collectorStats,
    collectorFacts,
    say,
    setModal,
    setDrawer,
    drawer,
    startOutreach,
    saveCard,
    addCopyToInventory,
    archiveInv,
    archiveRisk,
    collectorCards,
    setTradeInterest,
    interests,
    interestedIn,
    partnersInterested,
    attachBinderPhotos,
    markBinderReviewed,
    collectorAddBinderCard,
    hasBothPhotos,
    threads,
    threadFor,
    sendMessage,
    hasConversation,
    collectorPromoteGoal,
    collectorConfirmGoal,
    collectorMakeOffer,
    priceRespond,
    tradeAddCard,
    tradeRemoveCard,
    submitPackageForReview,
    tpReviewInclusion,
    endOpportunity,
    dealMutuallyAgreed,
    collectorChooseCash,
    collectorStopPursuing,
    marketAction,
    percentAction,
    collectorWithdrawCard,
    dealAgree,
    dealAdjust,
    proposeFulfillment,
    collectorConfirmPlan,
    collectorRequestPlanRevision,
    confirmHandoff,
    inviteCollector,
    logActivity
  };
  const SECTIONS = {
    opportunities: { title: "Opportunities", sub: "What you're actively coordinating, and what's waiting at each stage" },
    inventory: { title: "Inventory", sub: "What you have and how it connects to collector demand" },
    collectors: { title: "Collector Network", sub: "Who you're serving, and what you know about them" }
  };
  const meta = SECTIONS[nav.section];
  return /* @__PURE__ */ React.createElement("div", { className: "my-root" }, /* @__PURE__ */ React.createElement("style", null, CSS), /* @__PURE__ */ React.createElement(Sidebar, { ctx }), /* @__PURE__ */ React.createElement("div", { className: "main" }, /* @__PURE__ */ React.createElement("div", { className: "top" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", { className: "disp" }, meta.title), /* @__PURE__ */ React.createElement("div", { className: "sub" }, meta.sub)), /* @__PURE__ */ React.createElement("div", { className: "spacer" }), nav.section === "inventory" && /* @__PURE__ */ React.createElement("button", { className: "btn pri", onClick: () => setModal({ type: "addInventory" }) }, /* @__PURE__ */ React.createElement(Icon, { n: "plus", s: 14 }), "Add card"), nav.section === "collectors" && /* @__PURE__ */ React.createElement("button", { className: "btn pri", onClick: () => setModal({ type: "invite" }) }, /* @__PURE__ */ React.createElement(Icon, { n: "plus", s: 14 }), "Invite collector")), /* @__PURE__ */ React.createElement("div", { className: "scroll", key: nav.section + (nav.collectorId || "") }, nav.section === "opportunities" && /* @__PURE__ */ React.createElement(Opportunities, { ctx }), nav.section === "inventory" && /* @__PURE__ */ React.createElement(InventoryView, { ctx }), nav.section === "collectors" && (nav.collectorId ? /* @__PURE__ */ React.createElement(CollectorProfile, { ctx, id: nav.collectorId }) : /* @__PURE__ */ React.createElement(CollectorNetwork, { ctx })))), drawer?.type === "invItem" && /* @__PURE__ */ React.createElement(CardDrawer, { ctx, invId: drawer.invId }), drawer?.type === "binderCopy" && /* @__PURE__ */ React.createElement(BinderCopyDrawer, { ctx, ccId: drawer.ccId }), drawer?.type === "workspace" && /* @__PURE__ */ React.createElement(ConversationWorkspace, { ctx, goalId: drawer.goalId, oppId: drawer.oppId }), modal?.type === "card" && modal.invId && /* @__PURE__ */ React.createElement(CardModal, { ctx, invId: modal.invId }), modal?.type === "addCopy" && /* @__PURE__ */ React.createElement(AddCopyModal, { ctx, cardId: modal.cardId }), modal?.type === "addBinderCopy" && /* @__PURE__ */ React.createElement(AddBinderCopyModal, { ctx, collectorId: modal.collectorId }), modal?.type === "copyPhoto" && /* @__PURE__ */ React.createElement(
    PhotoLightbox,
    {
      ctx,
      photos: modal.photos,
      cardId: modal.cardId,
      cert: modal.cert,
      side: modal.side
    }
  ), modal?.type === "addInventory" && /* @__PURE__ */ React.createElement(AddInventoryModal, { ctx }), modal?.type === "outreach" && /* @__PURE__ */ React.createElement(OutreachModal, { ctx, cardId: modal.cardId, collectorId: modal.collectorId, tier: modal.tier }), modal?.type === "invite" && /* @__PURE__ */ React.createElement(InviteModal, { ctx }), modal?.type === "archive" && /* @__PURE__ */ React.createElement(ArchiveModal, { ctx, invId: modal.invId }), modal?.type === "endDeal" && /* @__PURE__ */ React.createElement(EndDealModal, { ctx, oppId: modal.oppId }), toast && /* @__PURE__ */ React.createElement("div", { className: "toast" }, toast));
}
function Sidebar({ ctx }) {
  const { nav, setNav, activeInv, collectors, opps } = ctx;
  const items = [
    { id: "collectors", label: "Collector Network", icon: "people", count: collectors.length },
    { id: "inventory", label: "Inventory", icon: "box", count: activeInv.length },
    { id: "opportunities", label: "Opportunities", icon: "flow", count: opps.filter((o) => o.stage !== "completed").length }
  ];
  return /* @__PURE__ */ React.createElement("nav", { className: "sb" }, /* @__PURE__ */ React.createElement("div", { className: "sb-brand" }, /* @__PURE__ */ React.createElement("span", { className: "sb-mark" }, /* @__PURE__ */ React.createElement("i", null), /* @__PURE__ */ React.createElement("i", null)), /* @__PURE__ */ React.createElement("span", { className: "sb-word" }, "MetYet")), /* @__PURE__ */ React.createElement("div", { className: "sb-sec" }, "Trusted Partner"), /* @__PURE__ */ React.createElement("div", { className: "sb-nav" }, items.map((i) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: i.id,
      className: "sb-item" + (nav.section === i.id ? " on" : ""),
      onClick: () => setNav({ section: i.id }),
      "aria-current": nav.section === i.id ? "page" : void 0
    },
    /* @__PURE__ */ React.createElement(Icon, { n: i.icon }),
    /* @__PURE__ */ React.createElement("span", { className: "lbl" }, i.label),
    i.count !== "" && /* @__PURE__ */ React.createElement("span", { className: "cnt mono" }, i.count)
  ))), /* @__PURE__ */ React.createElement("div", { className: "sb-foot" }, /* @__PURE__ */ React.createElement("div", { className: "n" }, "Northline Cards"), /* @__PURE__ */ React.createElement("div", { className: "r" }, "Pilot workspace")));
}
function NetworkBar({
  rows,
  unit = "collector",
  max = 5,
  empty = "Not enough data yet.",
  openKey,
  onPick,
  collector,
  setNav
}) {
  if (!rows.length) return /* @__PURE__ */ React.createElement("div", { className: "nw-empty" }, empty);
  const top = rows.slice(0, max);
  const peak = top[0].collectors || 1;
  return /* @__PURE__ */ React.createElement("div", { className: "nw-bars" }, top.map((r) => {
    const on = openKey === r.key;
    const bar = /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "nw-lbl", title: r.key }, r.key), /* @__PURE__ */ React.createElement("span", { className: "nw-track" }, /* @__PURE__ */ React.createElement("i", { style: { width: Math.max(4, r.collectors / peak * 100) + "%" } })), /* @__PURE__ */ React.createElement("span", { className: "nw-n mono" }, r.collectors), /* @__PURE__ */ React.createElement("span", { className: "nw-u" }, unit, r.collectors === 1 ? "" : "s"));
    return /* @__PURE__ */ React.createElement(React.Fragment, { key: r.key }, onPick ? /* @__PURE__ */ React.createElement("button", { className: "nw-bar nw-hit" + (on ? " on" : ""), onClick: () => onPick(r.key), "aria-expanded": on }, bar) : /* @__PURE__ */ React.createElement("div", { className: "nw-bar" }, bar), on && r.collectorIds && /* Reconciles exactly to the count: one entry per distinct collector,
       labelled with the strongest signal behind their demand. */
    /* @__PURE__ */ React.createElement("div", { className: "nw-ev" }, r.collectorIds.map((cid) => {
      const ev = (r.evidence || []).filter((e) => e.collectorId === cid);
      const tier = ev.some((e) => e.tier === "primary") ? "Primary goal" : "Secondary goal";
      return /* @__PURE__ */ React.createElement("span", { key: cid, className: "nw-ev-r" }, /* @__PURE__ */ React.createElement("button", { className: "chip act", onClick: () => setNav && setNav({ section: "collectors", collectorId: cid }) }, collector ? collector(cid).short : cid), /* @__PURE__ */ React.createElement("span", { className: "faint" }, tier));
    })));
  }));
}
function YourNetwork({ ctx }) {
  const { profile, collector, setNav } = ctx;
  const [open, setOpen] = useState(null);
  const panels = [
    {
      id: "characters",
      title: "Characters",
      sub: "Characters your collectors want most.",
      rows: profile.characters,
      empty: "No stated character demand yet."
    },
    {
      id: "sets",
      title: "Sets",
      sub: "Sets most relevant to your network.",
      rows: profile.sets,
      empty: "No stated set demand yet."
    },
    {
      id: "format",
      title: "Format",
      sub: "How collectors prefer their cards.",
      rows: profile.format,
      empty: "No stated format demand yet."
    },
    {
      id: "grade",
      title: "Grade",
      sub: "Grades that matter across your network.",
      rows: profile.grade,
      empty: "No stated grade demand yet."
    }
  ];
  return /* @__PURE__ */ React.createElement("div", { className: "panel nw" }, /* @__PURE__ */ React.createElement("div", { className: "nw-grid" }, panels.map((p) => /* @__PURE__ */ React.createElement("div", { key: p.id, className: "nw-cell" }, /* @__PURE__ */ React.createElement("div", { className: "nw-t" }, p.title), /* @__PURE__ */ React.createElement("div", { className: "nw-s" }, p.sub), /* @__PURE__ */ React.createElement(
    NetworkBar,
    {
      rows: p.rows,
      empty: p.empty,
      openKey: open && open.startsWith(p.id + ":") ? open.slice(p.id.length + 1) : null,
      onPick: (k) => setOpen(open === p.id + ":" + k ? null : p.id + ":" + k),
      collector,
      setNav
    }
  )))), /* @__PURE__ */ React.createElement("div", { className: "nw-foot" }, "Counts are distinct collectors with known demand. A collector may appear in more than one category."));
}
function Cultivate({ ctx }) {
  const { demandCards, setNav, collector } = ctx;
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState(null);
  const rows = showAll ? demandCards : demandCards.slice(0, 8);
  const nCol = (n) => `${n} collector${n === 1 ? "" : "s"}`;
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "cv-intro" }, "Understand what matters across your collector network."), /* @__PURE__ */ React.createElement("div", { className: "sect-t", style: { margin: "0 0 8px" } }, "Network demand"), /* @__PURE__ */ React.createElement(YourNetwork, { ctx }), /* @__PURE__ */ React.createElement("div", { className: "sect-t", style: { margin: "18px 0 4px" } }, "Exact cards"), /* @__PURE__ */ React.createElement("div", { className: "cv-sub" }, "Cards with the strongest known collector demand."), demandCards.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "empty" }, "No stated card demand yet.")) : /* @__PURE__ */ React.createElement("div", { className: "panel" }, rows.map((p, i) => {
    const on = open === p.card.id;
    return /* @__PURE__ */ React.createElement("div", { key: p.card.id, className: "cv-row" + (on ? " on" : "") }, /* @__PURE__ */ React.createElement("span", { className: "cv-rank mono" }, i + 1), /* @__PURE__ */ React.createElement(CardImage, { card: p.card, size: "browse" }), /* @__PURE__ */ React.createElement("div", { className: "cv-main" }, /* @__PURE__ */ React.createElement("div", { className: "cv-t" }, cardTitle(p.card), /* @__PURE__ */ React.createElement(CardCopyActions, { ctx, card: p.card, compact: true, showCert: false })), /* @__PURE__ */ React.createElement("div", { className: "cv-why" }, /* @__PURE__ */ React.createElement("button", { className: "link", onClick: () => setOpen(on ? null : p.card.id), "aria-expanded": on }, /* @__PURE__ */ React.createElement("b", { className: "mono" }, p.collectors), " collector", p.collectors === 1 ? "" : "s")), on && /* @__PURE__ */ React.createElement("div", { className: "cv-ev" }, p.collectorIds.map((cid) => /* @__PURE__ */ React.createElement("span", { key: cid, className: "cv-ev-r" }, /* @__PURE__ */ React.createElement("button", { className: "chip act", onClick: () => setNav({ section: "collectors", collectorId: cid }) }, collector(cid).short), /* @__PURE__ */ React.createElement("span", { className: "faint" }, p.primary.includes(cid) ? "Primary goal" : "Secondary goal"))))));
  }), demandCards.length > 8 && /* @__PURE__ */ React.createElement("div", { className: "cv-foot" }, /* @__PURE__ */ React.createElement("button", { className: "link", onClick: () => setShowAll(!showAll) }, showAll ? "Show top 8" : `Show all ${demandCards.length}`))));
}
var REGIONS = [
  { group: "intent", label: "Collector Intent" },
  { group: "deal", label: "Deal Flow" },
  { group: "closed", label: "History" }
];
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
function LifecycleMap({ ctx, counts, stage, owner, onPick, renderPanel }) {
  const { opps } = ctx;
  const ordered = REGIONS.flatMap((r) => STAGES.filter((s) => s.group === r.group));
  const firstId = ordered[0].id;
  const lastId = ordered[ordered.length - 1].id;
  return /* @__PURE__ */ React.createElement("div", { className: "lc" }, REGIONS.map((region) => {
    const stages = STAGES.filter((s) => s.group === region.group);
    return /* @__PURE__ */ React.createElement("div", { key: region.group, className: "lc-region r-" + region.group }, /* @__PURE__ */ React.createElement("div", { className: "lc-head" }, region.group === "deal" && /* @__PURE__ */ React.createElement("span", { className: "lc-cue", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", { className: "lc-head-t" }, region.label)), stages.map((s) => {
      const n = counts[s.id] || 0;
      const own = region.group === "deal" ? stageOwnership(opps, s.id) : null;
      const on = stage === s.id;
      const cls = [
        "lc-row",
        "n-" + s.id,
        on ? "on" : "",
        s.id === firstId ? "lc-first" : "",
        s.id === lastId ? "lc-last" : ""
      ].filter(Boolean).join(" ");
      return /* @__PURE__ */ React.createElement("div", { key: s.id, className: cls }, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "lc-hit",
          onClick: () => onPick(s.id, null),
          "aria-pressed": on && !owner,
          "aria-label": `Show all ${s.label} opportunities`
        }
      ), /* @__PURE__ */ React.createElement("span", { className: "lc-node", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", { className: "lc-name" }, stageNo(s.id) && /* @__PURE__ */ React.createElement("span", { className: "lc-no mono" }, stageNo(s.id)), s.label), /* @__PURE__ */ React.createElement("span", { className: "lc-cnt" }, n), /* @__PURE__ */ React.createElement("span", { className: "lc-own" }, own && own.total > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "lc-pill tp" + (on && owner === "tp" ? " on" : ""),
          onClick: () => onPick(s.id, owner === "tp" && on ? null : "tp"),
          "aria-pressed": on && owner === "tp",
          "aria-label": nextStepCountLabel("tp", own.tp, s.label)
        },
        "TP ",
        /* @__PURE__ */ React.createElement("b", null, own.tp)
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "lc-pill" + (on && owner === "collector" ? " on" : ""),
          onClick: () => onPick(s.id, owner === "collector" && on ? null : "collector"),
          "aria-pressed": on && owner === "collector",
          "aria-label": nextStepCountLabel("collector", own.c, s.label)
        },
        "C ",
        /* @__PURE__ */ React.createElement("b", null, own.c)
      ), own.none > 0 && /* @__PURE__ */ React.createElement("span", { className: "lc-pill mute", title: "Both sides have acted; nothing is outstanding" }, "\u2014 ", /* @__PURE__ */ React.createElement("b", null, own.none)))), /* @__PURE__ */ React.createElement("span", { className: "lc-chev", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { n: "chev", s: 13 })));
    }).flatMap((row, i) => {
      const s2 = stages[i];
      return stage === s2.id && renderPanel ? [row, /* @__PURE__ */ React.createElement("div", { key: s2.id + "-open", className: "lc-open" }, renderPanel(s2.id))] : [row];
    }));
  }));
}
function Opportunities({ ctx }) {
  const { stageCounts, opps } = ctx;
  const [sel, setSel] = useState({ stage: null, owner: null });
  const pick = (stageId, owner) => setSel((s) => s.stage === stageId && s.owner === owner ? { stage: null, owner: null } : { stage: stageId, owner });
  const mine = opps.filter((o) => isActive(o) && o.stage !== "completed" && nextAction(o).owner === "tp");
  const queueOpen = sel.stage === ALL_STAGES;
  const oldest = mine.reduce((a, o) => Math.max(a, daysSince(o.updated)), 0);
  const panel = (stageId) => /* @__PURE__ */ React.createElement("div", { className: "lc-open-scroll" }, /* @__PURE__ */ React.createElement(
    StageDrilldown,
    {
      key: stageId,
      ctx,
      stage: stageId === ALL_STAGES ? null : stageId,
      owner: sel.owner,
      onClose: () => setSel({ stage: null, owner: null }),
      onClearOwner: () => setSel((s2) => ({ ...s2, owner: null })),
      standalone: true
    }
  ));
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "dq-wrap" + (queueOpen ? " on" : "") }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "dq-entry" + (queueOpen ? " on" : ""),
      "aria-expanded": queueOpen,
      onClick: () => pick(ALL_STAGES, "tp")
    },
    /* @__PURE__ */ React.createElement("span", { className: "dq-n mono" }, mine.length),
    /* @__PURE__ */ React.createElement("span", { className: "dq-l" }, /* @__PURE__ */ React.createElement("b", null, "Needs you"), /* @__PURE__ */ React.createElement("span", { className: "dq-sub" }, mine.length === 0 ? "Nothing needs you right now." : `Across every stage${oldest > 0 ? ` \xB7 longest waiting ${oldest} days` : ""}`)),
    /* @__PURE__ */ React.createElement("span", { className: "dq-go", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { n: "chev", s: 13 }))
  ), queueOpen && /* @__PURE__ */ React.createElement("div", { className: "lc-open dq-open" }, panel(ALL_STAGES))), /* @__PURE__ */ React.createElement("div", { className: "panel lc-card", style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement(
    LifecycleMap,
    {
      ctx,
      counts: stageCounts,
      stage: sel.stage,
      owner: sel.owner,
      onPick: pick,
      renderPanel: panel
    }
  )));
}
var NEXT_STEP = { tp: "Trusted Partner", collector: "Collector" };
var nextStepLabel = (owner) => NEXT_STEP[owner] || null;
var nextStepCountLabel = (owner, n, stageLabel) => `${NEXT_STEP[owner]} next step \u2014 ${n} ${n === 1 ? "opportunity" : "opportunities"} in ${stageLabel}`;
var NextStep = ({ owner }) => {
  const label = nextStepLabel(owner);
  if (!label) return /* @__PURE__ */ React.createElement("span", { className: "faint", style: { fontSize: 11.5 } }, "\u2014");
  return /* @__PURE__ */ React.createElement("span", { className: "nstep " + owner }, /* @__PURE__ */ React.createElement("span", { className: "dot" }), label);
};
var CARD_IMAGE_SIZES = { thumbnail: 34, triage: 52, browse: 54, feature: 124, shelf: 180, hero: 168 };
var CARD_IMAGE_SMALL_ASSET = ["thumbnail", "triage"];
var copyText = (text) => {
  const legacy = () => {
    if (typeof document === "undefined" || !document.body) return false;
    let ta = null;
    try {
      ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.width = "1px";
      ta.style.height = "1px";
      ta.style.padding = "0";
      ta.style.border = "none";
      ta.style.opacity = "0";
      ta.style.pointerEvents = "none";
      document.body.appendChild(ta);
      if (typeof ta.focus === "function") ta.focus();
      if (typeof ta.select === "function") ta.select();
      if (typeof ta.setSelectionRange === "function") ta.setSelectionRange(0, String(text).length);
      return typeof document.execCommand === "function" && document.execCommand("copy") === true;
    } catch {
      return false;
    } finally {
      if (ta && ta.parentNode) ta.parentNode.removeChild(ta);
    }
  };
  const clip = typeof navigator !== "undefined" && navigator ? navigator.clipboard : null;
  if (clip && typeof clip.writeText === "function") {
    try {
      return Promise.resolve(clip.writeText(text)).then(() => true, () => legacy());
    } catch {
      return Promise.resolve(legacy());
    }
  }
  return Promise.resolve(legacy());
};
function CardCopyActions({ ctx, card: c, copy, compact, showCert = true, certAsNumber }) {
  const { say } = ctx;
  if (!c) return null;
  const info = cardInfoText(c, copy);
  const cert = showCert === false ? null : certNumber(copy ? copy.cert : null);
  const write = (textValue, ok) => {
    copyText(textValue).then((done) => say(done ? ok : "Couldn't copy to the clipboard."));
  };
  return /* @__PURE__ */ React.createElement("div", { className: "ccopy" + (compact ? " compact" : "") }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn sm ccopy-b",
      title: "Copy card information \u2014 " + info,
      "aria-label": "Copy card information",
      onClick: () => write(info, "Card information copied")
    },
    /* @__PURE__ */ React.createElement(Icon, { n: "copy", s: 12 }),
    !compact && /* @__PURE__ */ React.createElement("span", null, "Card info")
  ), cert && /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn sm ccopy-b",
      title: "Copy PSA certification number \u2014 " + cert,
      "aria-label": "Copy PSA certification number",
      onClick: () => write(cert, "PSA certification copied")
    },
    /* @__PURE__ */ React.createElement(Icon, { n: "copy", s: 12 }),
    !compact && /* @__PURE__ */ React.createElement("span", null, certAsNumber ? "PSA " + cert : "PSA Cert #")
  ));
}
function CopyPhoto({ photo, side, size = "sm", onOpen, card }) {
  const plate = /* @__PURE__ */ React.createElement("div", { className: "copyph-p" + (photo ? "" : " missing") }, /* @__PURE__ */ React.createElement("span", null, photo ? "collector photo" : "not on file"));
  return /* @__PURE__ */ React.createElement("div", { className: "copyph " + size }, photo && onOpen ? /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "copyph-btn",
      onClick: onOpen,
      title: "View larger",
      "aria-label": `View larger ${side} photo${card ? " of " + cardShort(card) : ""}`
    },
    plate
  ) : plate, /* @__PURE__ */ React.createElement("span", { className: "cimg-cap" }, side));
}
function PhotoLightbox({ ctx, photos, cardId, cert, side: initial }) {
  const { setModal, card } = ctx;
  const [side, setSide] = useState(initial === "back" ? "back" : "front");
  const c = card(cardId);
  const close = () => setModal(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") setSide((v) => v === "front" ? "back" : "front");
    };
    if (typeof window === "undefined") return void 0;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const both = !!(photos?.front && photos?.back);
  return /* @__PURE__ */ React.createElement(
    Modal,
    {
      title: c ? c.name : "Copy photo",
      width: 560,
      sub: c ? [c.set + (c.num && c.num !== "\u2014" ? " \xB7 #" + c.num : ""), isRaw(c) ? "Raw \xB7 " + c.condition : c.grade, cert].filter(Boolean).join(" \xB7 ") : null,
      onClose: close,
      footer: /* @__PURE__ */ React.createElement(React.Fragment, null, both && /* @__PURE__ */ React.createElement("div", { className: "lb-nav", role: "group", "aria-label": "Choose a face" }, ["front", "back"].map((f) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: f,
          className: "btn sm" + (side === f ? " on" : ""),
          "aria-pressed": side === f,
          onClick: () => setSide(f)
        },
        f
      ))), /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: close }, "Close"))
    },
    /* @__PURE__ */ React.createElement("div", { className: "lb" }, /* @__PURE__ */ React.createElement(CardCopyActions, { ctx, card: c, copy: { cert } }), /* @__PURE__ */ React.createElement("div", { className: "lb-side" }, side), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "copyph-p" + (photos?.[side] ? "" : " missing"),
        role: "img",
        "aria-label": `${side} photo of ${c ? cardShort(c) : "this copy"}`
      },
      /* @__PURE__ */ React.createElement("span", null, photos?.[side] ? "collector photo" : "not on file")
    ))
  );
}
function NegotiationParty({ c, label }) {
  if (!c) return null;
  return /* @__PURE__ */ React.createElement("div", { className: "np" }, /* @__PURE__ */ React.createElement("span", { className: "av" }, initials(c.name || c.short || "?")), /* @__PURE__ */ React.createElement("div", { className: "np-b" }, /* @__PURE__ */ React.createElement("div", { className: "np-n" }, c.short), label && /* @__PURE__ */ React.createElement("div", { className: "np-l" }, label)));
}
function CardImage({ card: c, size = "thumbnail", className = "" }) {
  const art = catalogImage(c && c.csvId);
  const [failed, setFailed] = useState(false);
  const w = CARD_IMAGE_SIZES[size] || CARD_IMAGE_SIZES.thumbnail;
  const box = { width: w, height: Math.round(w / 0.716) };
  if (!c || !art || failed) {
    const roomy = w >= CARD_IMAGE_SIZES.browse;
    return /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "cimg empty " + size + " " + className,
        style: box,
        role: "img",
        "aria-label": c ? `${c.name} \u2014 ${c.set} ${c.num}` : "Card image unavailable",
        title: c ? cardShort(c) : "Card image unavailable"
      },
      c && /* @__PURE__ */ React.createElement("span", { className: "cimg-ph" }, /* @__PURE__ */ React.createElement("span", { className: "cimg-ph-n" }, c.name), roomy && c.set && /* @__PURE__ */ React.createElement("span", { className: "cimg-ph-s" }, c.set), roomy && c.num && c.num !== "\u2014" && /* @__PURE__ */ React.createElement("span", { className: "cimg-ph-s" }, "#", c.num), roomy && /* @__PURE__ */ React.createElement("span", { className: "cimg-ph-g" }, isRaw(c) ? "Raw" : c.grade))
    );
  }
  const src = CARD_IMAGE_SMALL_ASSET.includes(size) ? art[0] : art[1];
  return /* @__PURE__ */ React.createElement(
    "img",
    {
      className: "cimg " + className,
      style: box,
      src,
      loading: "lazy",
      decoding: "async",
      onError: () => setFailed(true),
      alt: `${c.name} \u2014 ${c.set} ${c.num}`
    }
  );
}
function SimBlock({ children, who }) {
  return /* @__PURE__ */ React.createElement("div", { style: { border: "1px dashed var(--amber-line)", background: "var(--amber-bg)", borderRadius: 4, padding: 11, marginTop: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "Archivo", fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 600, color: "var(--amber)", marginBottom: 7 } }, "Demo control \xB7 simulating ", who, " \u2014 not a Trusted Partner action"), children);
}
var Money = ({ v }) => /* @__PURE__ */ React.createElement("span", { className: "mono" }, v == null ? "\u2014" : money(v));
var cleanNum = (v) => v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
function CounterFields({ amt, setAmt, reference, pctLabel, pctAria, amtAria, showPercent = true }) {
  const pct3 = percentageOf(amt, reference);
  const usable = showPercent && percentageOf(1, reference) != null;
  const clean = cleanNum;
  const onPct = (v) => {
    const next = clean(v);
    if (next === "") return setAmt("");
    const dollars = amountFromPercentage(next, reference);
    if (dollars != null) setAmt(String(dollars));
  };
  return /* @__PURE__ */ React.createElement("div", { className: "pn-in" }, /* @__PURE__ */ React.createElement("label", { className: "pn-f" }, /* @__PURE__ */ React.createElement("span", { className: "pn-fl" }, "Amount"), /* @__PURE__ */ React.createElement("span", { className: "pn-w" }, /* @__PURE__ */ React.createElement("span", { className: "pn-u" }, "$"), /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "inp",
      type: "text",
      inputMode: "decimal",
      value: amt,
      "aria-label": amtAria,
      onChange: (e) => setAmt(clean(e.target.value))
    }
  ))), usable && /* @__PURE__ */ React.createElement("label", { className: "pn-f" }, /* @__PURE__ */ React.createElement("span", { className: "pn-fl" }, pctLabel), /* @__PURE__ */ React.createElement("span", { className: "pn-w" }, /* @__PURE__ */ React.createElement("span", { className: "pn-u r" }, "%"), /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "inp r",
      type: "text",
      inputMode: "decimal",
      value: pct3 == null ? "" : String(pct3),
      "aria-label": pctAria,
      onChange: (e) => onPct(e.target.value)
    }
  ))));
}
var validAmount = (amt) => amt !== "" && isFinite(Number(amt)) && Number(amt) > 0;
function TradeFields({ pcs, setPcs, market }) {
  const p = Number(pcs);
  const usable = isFinite(Number(market)) && Number(market) > 0;
  const valueOf = (whole) => Math.round(Number(market) * (Number(whole) / 100));
  const shown = pcs === "" || !isFinite(p) ? "" : usable ? String(valueOf(p)) : "";
  const onValue = (v) => {
    const next = cleanNum(v);
    if (next === "" || !usable) return setPcs(next === "" ? "" : pcs);
    const whole = Math.round(Number(next) / Number(market) * 100);
    setPcs(whole > 0 ? String(Math.min(whole, 100)) : "");
  };
  return /* @__PURE__ */ React.createElement("div", { className: "pn-in" }, /* @__PURE__ */ React.createElement("label", { className: "pn-f" }, /* @__PURE__ */ React.createElement("span", { className: "pn-fl" }, "Trade %"), /* @__PURE__ */ React.createElement("span", { className: "pn-w" }, /* @__PURE__ */ React.createElement("span", { className: "pn-u r" }, "%"), /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "inp r",
      type: "text",
      inputMode: "decimal",
      value: pcs,
      "aria-label": "Trade percentage of the agreed market value",
      onChange: (e) => setPcs(cleanNum(e.target.value))
    }
  ))), usable && /* @__PURE__ */ React.createElement("label", { className: "pn-f" }, /* @__PURE__ */ React.createElement("span", { className: "pn-fl" }, "Trade Value"), /* @__PURE__ */ React.createElement("span", { className: "pn-w" }, /* @__PURE__ */ React.createElement("span", { className: "pn-u" }, "$"), /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "inp",
      type: "text",
      inputMode: "decimal",
      value: shown,
      "aria-label": "Trade value in dollars",
      onChange: (e) => onValue(e.target.value)
    }
  ))));
}
function TradeDecision({ tc, by, party, defaultPct, onAccept, onPropose }) {
  const market = tc.agreedMarket;
  const mine = by === "tp" ? tc.tpPercent : tc.collectorPercent;
  const theirs = by === "tp" ? tc.collectorPercent : tc.tpPercent;
  const [pcs, setPcs] = useState(() => by === "tp" && mine == null && defaultPct ? String(defaultPct) : "");
  const p = Number(pcs);
  const valid = pcs !== "" && isFinite(p) && p > 0 && p <= 100;
  const dollars = (frac) => market > 0 ? money(Math.round(market * frac)) : "\u2014";
  return /* @__PURE__ */ React.createElement("div", { className: "pn row" }, theirs != null && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "pn-side" }, party && /* @__PURE__ */ React.createElement(NegotiationParty, { c: party }), /* @__PURE__ */ React.createElement("div", { className: "pn-h" }, "Their trade %"), /* @__PURE__ */ React.createElement("div", { className: "pn-amt mono" }, pct(theirs)), /* @__PURE__ */ React.createElement("div", { className: "pn-pct" }, "Trade Value ", dollars(theirs)), /* @__PURE__ */ React.createElement("div", { className: "pn-pct" }, "on agreed market value ", money(market)), /* @__PURE__ */ React.createElement("button", { className: "btn pri sm pn-accept", onClick: onAccept }, "Accept ", pct(theirs))), /* @__PURE__ */ React.createElement("div", { className: "pn-or v" }, /* @__PURE__ */ React.createElement("span", null, "or counter"))), /* @__PURE__ */ React.createElement("div", { className: "pn-side" }, /* @__PURE__ */ React.createElement("div", { className: "pn-h" }, "Your trade %"), theirs == null && /* @__PURE__ */ React.createElement("div", { className: "pn-pct" }, "on agreed market value ", money(market)), /* @__PURE__ */ React.createElement(TradeFields, { pcs, setPcs, market }), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn sm pn-send" + (valid ? " pri" : ""),
      disabled: !valid,
      onClick: () => {
        onPropose(p / 100);
        setPcs("");
      }
    },
    theirs == null ? "Send trade proposal" : "Send trade counter"
  )));
}
function TradeWaiting({ tc, by, who, party }) {
  const mine = by === "tp" ? tc.tpPercent : tc.collectorPercent;
  if (mine == null) return null;
  const market = tc.agreedMarket;
  return /* @__PURE__ */ React.createElement("div", { className: "pn row wait" }, /* @__PURE__ */ React.createElement("div", { className: "pn-side" }, party && /* @__PURE__ */ React.createElement(NegotiationParty, { c: party }), /* @__PURE__ */ React.createElement("div", { className: "pn-h" }, "Your trade %"), /* @__PURE__ */ React.createElement("div", { className: "pn-amt mono" }, pct(mine)), /* @__PURE__ */ React.createElement("div", { className: "pn-pct" }, "Trade Value ", market > 0 ? money(Math.round(market * mine)) : "\u2014"), /* @__PURE__ */ React.createElement("div", { className: "pn-pct" }, "on agreed market value ", money(market))), /* @__PURE__ */ React.createElement("div", { className: "pn-wait" }, "Waiting on ", who));
}
function MarketDecision({ tc, by, theirHeading, myHeading, party, defaultAmount, onAccept, onPropose }) {
  const [amt, setAmt] = useState(() => defaultAmount != null ? String(defaultAmount) : "");
  const mine = by === "tp" ? tc.tpMarket : tc.collectorMarket;
  const theirs = by === "tp" ? tc.collectorMarket : tc.tpMarket;
  const opening = theirs == null;
  return /* @__PURE__ */ React.createElement("div", { className: "pn row" }, opening ? /* @__PURE__ */ React.createElement("div", { className: "pn-h" }, "Opening market proposal") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "pn-side" }, /* @__PURE__ */ React.createElement(NegotiationParty, { c: party }), /* @__PURE__ */ React.createElement("div", { className: "pn-h" }, theirHeading), /* @__PURE__ */ React.createElement("div", { className: "pn-amt mono" }, money(theirs)), /* @__PURE__ */ React.createElement("div", { className: "pn-pct" }, "Reference value"), /* @__PURE__ */ React.createElement("button", { className: "btn pri sm pn-accept", onClick: onAccept }, "Accept ", money(theirs)))), /* @__PURE__ */ React.createElement("div", { className: "pn-side" }, /* @__PURE__ */ React.createElement("div", { className: "pn-h" }, myHeading), mine != null && !opening && /* @__PURE__ */ React.createElement("div", { className: "pn-pct" }, "Last sent ", money(mine)), /* @__PURE__ */ React.createElement(
    CounterFields,
    {
      amt,
      setAmt,
      showPercent: false,
      amtAria: "Market value in dollars"
    }
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn sm pn-send" + (validAmount(amt) ? " pri" : ""),
      disabled: !validAmount(amt),
      onClick: () => {
        onPropose(Number(amt));
        setAmt("");
      }
    },
    opening ? "Send market value" : "Send market counter"
  )));
}
function MarketWaiting({ tc, by, who, party }) {
  const mine = by === "tp" ? tc.tpMarket : tc.collectorMarket;
  const theirs = by === "tp" ? tc.collectorMarket : tc.tpMarket;
  if (mine == null) return null;
  return /* @__PURE__ */ React.createElement("div", { className: "pn row wait" }, /* @__PURE__ */ React.createElement("div", { className: "pn-side" }, /* @__PURE__ */ React.createElement(NegotiationParty, { c: party }), /* @__PURE__ */ React.createElement("div", { className: "pn-h" }, "Your market value"), /* @__PURE__ */ React.createElement("div", { className: "pn-amt mono" }, money(mine)), /* @__PURE__ */ React.createElement("div", { className: "pn-pct" }, "Sent to ", who)), /* @__PURE__ */ React.createElement("div", { className: "pn-wait" }, "Waiting on ", who));
}
function PriceDecision({ opp, col, na, priceRespond, by = "tp" }) {
  const [amt, setAmt] = useState("");
  const listed = opp.listedPrice;
  const last = lastEntry(opp.priceThread);
  if (!last) return null;
  const theirs = last.by !== by;
  const heading = theirs ? "Their offer" : "Your counter";
  const standing = shareText(last.amount, listed);
  return /* @__PURE__ */ React.createElement("div", { className: "pn" }, by === "tp" && /* @__PURE__ */ React.createElement(NegotiationParty, { c: col }), /* @__PURE__ */ React.createElement("div", { className: "pn-h" }, heading), /* @__PURE__ */ React.createElement("div", { className: "pn-amt mono" }, money(last.amount)), /* @__PURE__ */ React.createElement("div", { className: "pn-pct" }, standing ? standing + " of listed price" : "listed price unavailable"), na.owner !== by ? (
    /* Not this seat's turn: the same two numbers, no live form. Ownership comes
       from the existing nextAction logic, not from a new waiting flag. */
    /* @__PURE__ */ React.createElement("div", { className: "pn-wait" }, "Waiting on ", col.short)
  ) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "btn pri sm pn-accept", onClick: () => priceRespond(opp.id, by, "accept") }, "Accept ", money(last.amount)), canCounter(opp.priceThread, by) && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "pn-or" }, /* @__PURE__ */ React.createElement("span", null, "or counter")), /* @__PURE__ */ React.createElement(
    CounterFields,
    {
      amt,
      setAmt,
      reference: listed,
      pctLabel: "% of listed",
      amtAria: "Counter amount in dollars",
      pctAria: "Counter as a percentage of listed price"
    }
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn sm pn-send" + (validAmount(amt) ? " pri" : ""),
      disabled: !validAmount(amt),
      onClick: () => {
        priceRespond(opp.id, by, "counter", Number(amt));
        setAmt("");
      }
    },
    "Send counter"
  ))));
}
function AmountInput({ value, onChange, onSubmit, label, disabled }) {
  return /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", gap: 6, alignItems: "center" } }, /* @__PURE__ */ React.createElement("input", { className: "inp", style: { width: 96 }, type: "number", value, onChange: (e) => onChange(e.target.value) }), /* @__PURE__ */ React.createElement("button", { className: "btn sm", disabled: disabled || !Number(value), onClick: onSubmit }, label));
}
function DealSummary({ ctx, opp }) {
  const { card, collector } = ctx;
  const cards = settledCards(opp);
  const dropped = [...withdrawnCards(opp), ...rejectedCards(opp)];
  const cb = cashBalance(opp);
  const col = collector(opp.collectorId);
  return /* @__PURE__ */ React.createElement("div", { style: { border: "1px solid var(--line)", borderRadius: 4, overflow: "hidden" } }, /* @__PURE__ */ React.createElement("table", { className: "tbl" }, /* @__PURE__ */ React.createElement("tbody", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: { width: "58%" } }, /* @__PURE__ */ React.createElement("div", { className: "cimg-row" }, /* @__PURE__ */ React.createElement(CardImage, { card: card(opp.cardId), size: "thumbnail" }), /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, fontWeight: 600 } }, cardShort(card(opp.cardId))), /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11 } }, "Card you're transferring \xB7 agreed purchase price")))), /* @__PURE__ */ React.createElement("td", { className: "num mono" }, money(opp.agreedPrice))), cards.map((tc) => /* @__PURE__ */ React.createElement("tr", { key: tc.id }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "cimg-row" }, /* @__PURE__ */ React.createElement(CardImage, { card: card(tc.cardId), size: "thumbnail" }), /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5 } }, cardShort(card(tc.cardId))), /* @__PURE__ */ React.createElement("div", { className: "faint mono", style: { fontSize: 11 } }, "agreed market ", money(tc.agreedMarket), " \xD7 agreed ", pct(tc.agreedPercent))))), /* @__PURE__ */ React.createElement("td", { className: "num mono", style: { color: "var(--t1)" } }, "\u2212" + money(creditFor(tc))))), cards.length === 0 && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { className: "muted", style: { fontSize: 12.5 } }, "No trade cards \u2014 cash only"), /* @__PURE__ */ React.createElement("td", { className: "num mono" }, "\u2014")), /* @__PURE__ */ React.createElement("tr", { style: { background: "#FAFBFC" } }, /* @__PURE__ */ React.createElement("td", { className: "muted", style: { fontSize: 12.5 } }, "Total trade value"), /* @__PURE__ */ React.createElement("td", { className: "num mono" }, money(totalCredit(opp)))), cb && cb.adjustment !== 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { className: "muted", style: { fontSize: 12.5 } }, "Base cash balance"), /* @__PURE__ */ React.createElement("td", { className: "num mono" }, cb.base === 0 ? "\u2014" : money(Math.abs(cb.base)))), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { className: "muted", style: { fontSize: 12.5 } }, "Final negotiation"), /* @__PURE__ */ React.createElement("td", { className: "num mono" }, (cb.adjustment < 0 ? "\u2212" : "+") + money(Math.abs(cb.adjustment))))), /* @__PURE__ */ React.createElement("tr", { style: { background: "#F2F6F6" } }, /* @__PURE__ */ React.createElement("td", { style: { fontSize: 12.5, fontWeight: 600 } }, cb == null || cb.zero ? "Cash balance" : cb.payer === "collector" ? `${col.short} pays you` : `You pay ${col.short}`), /* @__PURE__ */ React.createElement("td", { className: "num mono", style: { fontWeight: 600, fontSize: 14 } }, cb == null ? "\u2014" : cb.zero ? "No cash balance" : money(cb.amount))))), dropped.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11, padding: "7px 12px", borderTop: "1px solid var(--line-soft)" } }, "Not part of this deal: ", dropped.map((tc) => `${card(tc.cardId).name} (${tc.withdrawn ? col.short + " withdrew" : "you rejected"})`).join(", "), "."), /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11, padding: "7px 12px", borderTop: "1px solid var(--line-soft)" } }, "Every figure above was agreed card by card during Value Trade. Percentages differ per card because each was negotiated separately."));
}
var STAGE_MAP = STAGES.map((s) => s.id);
function StageMap({ stage, goal }) {
  const cur = STAGE_MAP.indexOf(stage);
  const skippedSecondary = goal && goal.tier === "primary" && !goal.secondarySince;
  return (
    /* Read-only progress. Stage advancement is owned entirely by the domain
       transitions, so nothing here is interactive. */
    /* @__PURE__ */ React.createElement("div", { className: "ws-map", role: "list", "aria-label": "Opportunity map" }, STAGES.map((s, i) => {
      const state = i < cur ? "past" : i === cur ? "now" : "next";
      const skipped = s.id === "secondary" && skippedSecondary;
      return /* @__PURE__ */ React.createElement("div", { key: s.id, role: "listitem", className: "ws-stage " + (skipped ? "skip" : state) }, /* @__PURE__ */ React.createElement("span", { className: "ws-dot", "aria-hidden": "true" }, state === "past" && !skipped ? "\u2713" : ""), /* @__PURE__ */ React.createElement("span", { className: "ws-lbl" }, s.label), skipped && /* @__PURE__ */ React.createElement("span", { className: "ws-note" }, "skipped"));
    }))
  );
}
function Conversation({ ctx, thread, collectorId, cardId, disabled }) {
  const { collector, sendMessage } = ctx;
  const [draft, setDraft] = useState("");
  const entries = thread?.entries || [];
  const col = collector(collectorId);
  const send = (by) => {
    if (draft.trim()) {
      sendMessage(collectorId, cardId, by, draft.trim());
      setDraft("");
    }
  };
  return /* @__PURE__ */ React.createElement("div", { className: "ws-chat" }, /* @__PURE__ */ React.createElement("div", { className: "ws-chat-scroll" }, entries.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "empty", style: { padding: "36px 14px" } }, "No conversation yet. Opening this workspace doesn't count as reaching out \u2014", /* @__PURE__ */ React.createElement("br", null), "send a message to start the thread."), entries.map((e) => e.kind === "event" ? /* @__PURE__ */ React.createElement("div", { key: e.id, className: "ws-event" }, /* @__PURE__ */ React.createElement("span", { className: "ws-event-rule" }), /* @__PURE__ */ React.createElement("span", { className: "ws-event-txt" }, e.text), /* @__PURE__ */ React.createElement("span", { className: "ws-event-rule" })) : /* @__PURE__ */ React.createElement("div", { key: e.id, className: "ws-msg " + (e.by === "tp" ? "mine" : "theirs") }, /* @__PURE__ */ React.createElement("div", { className: "ws-msg-who" }, e.by === "tp" ? "You" : col.short), /* @__PURE__ */ React.createElement("div", { className: "ws-msg-body" }, e.text)))), /* @__PURE__ */ React.createElement("div", { className: "ws-composer" }, /* @__PURE__ */ React.createElement(
    "textarea",
    {
      className: "inp",
      rows: 2,
      placeholder: `Message ${col.short} about this card\u2026`,
      value: draft,
      onChange: (ev) => setDraft(ev.target.value),
      onKeyDown: (ev) => {
        if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) send("tp");
      }
    }
  ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 6 } }, /* @__PURE__ */ React.createElement("button", { className: "btn pri sm", disabled: !draft.trim(), onClick: () => send("tp") }, /* @__PURE__ */ React.createElement(Icon, { n: "send", s: 12 }), "Send"), /* @__PURE__ */ React.createElement("span", { className: "faint", style: { fontSize: 11 } }, "No terms change. No stage change."), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn sm",
      style: { marginLeft: "auto", borderStyle: "dashed", color: "var(--amber)", borderColor: "var(--amber-line)" },
      disabled: !draft.trim(),
      onClick: () => send("collector"),
      title: "Demo control"
    },
    "Send as ",
    col.short,
    " (demo)"
  ))));
}
var TRADE_COLUMNS = ["Card", "Market Value", "Trade %", "Trade Value", "Status"];
function TradeRow({ ctx, opp, tc }) {
  const {
    card,
    collector,
    setModal,
    collectorCards,
    marketAction,
    percentAction,
    collectorWithdrawCard
  } = ctx;
  const binderRef = tc.binderId ? collectorCards.find((cc) => cc.id === tc.binderId) : null;
  const [open, setOpen] = useState(false);
  const c = card(tc.cardId);
  const col = collector(opp.collectorId);
  const phase = cardPhase(tc);
  const st = cardOwner(tc);
  const dead = phase === PHASE.rejected || phase === PHASE.withdrawn;
  const defaultPct = Math.round(opp.tradeRate * 100);
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("tr", { className: "vt-row" + (dead ? " gone" : "") }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "vt-exp",
      onClick: () => setOpen(!open),
      "aria-expanded": open,
      title: open ? "Hide evidence" : "Show photos and history"
    },
    open ? "\u2212" : "+"
  ), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 500 } }, c.name), /* @__PURE__ */ React.createElement("div", { className: "vt-identline" }, [c.grade, isRaw(c) ? c.condition : null, c.print, c.edition, c.set + " " + c.num, c.language].filter(Boolean).join(" \xB7 "))), /* @__PURE__ */ React.createElement("td", { className: "num" + (phase === PHASE.market ? " vt-live" : "") }, phase === PHASE.inclusion ? /* @__PURE__ */ React.createElement("span", { className: "faint" }, "not yet") : marketAgreed(tc) ? /* @__PURE__ */ React.createElement("span", { className: "mono vt-out" }, money(tc.agreedMarket)) : /* @__PURE__ */ React.createElement("span", { className: "vt-pos" }, /* @__PURE__ */ React.createElement("span", null, col.short, " ", /* @__PURE__ */ React.createElement("b", { className: "mono" }, tc.collectorMarket == null ? "\u2014" : money(tc.collectorMarket))), /* @__PURE__ */ React.createElement("span", null, "You ", /* @__PURE__ */ React.createElement("b", { className: "mono" }, tc.tpMarket == null ? "\u2014" : money(tc.tpMarket))))), /* @__PURE__ */ React.createElement("td", { className: "num" + (phase === PHASE.percent ? " vt-live" : "") }, !marketAgreed(tc) ? /* @__PURE__ */ React.createElement("span", { className: "faint" }, "locked") : tc.agreedPercent != null ? /* @__PURE__ */ React.createElement("span", { className: "mono vt-out" }, pct(tc.agreedPercent)) : /* @__PURE__ */ React.createElement("span", { className: "vt-pos" }, /* @__PURE__ */ React.createElement("span", null, "You ", /* @__PURE__ */ React.createElement("b", { className: "mono" }, pct(tc.tpPercent))), /* @__PURE__ */ React.createElement("span", null, col.short, " ", /* @__PURE__ */ React.createElement("b", { className: "mono" }, pct(tc.collectorPercent))))), /* @__PURE__ */ React.createElement("td", { className: "num mono vt-agreed" }, creditFor(tc) == null ? /* @__PURE__ */ React.createElement("span", { className: "faint" }, "\u2014") : money(creditFor(tc))), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "vt-status " + st.tone }, dead ? st.label : nextStepLabel(st.owner) + ": " + st.label))), phase === PHASE.market && /* @__PURE__ */ React.createElement("tr", { className: "vt-act" }, /* @__PURE__ */ React.createElement("td", { colSpan: 5 }, /* @__PURE__ */ React.createElement("div", { className: "vt-mkt" }, /* @__PURE__ */ React.createElement("div", { className: "vt-mkt-copy" }, /* @__PURE__ */ React.createElement("div", { className: "sect-t" }, "This exact copy"), /* @__PURE__ */ React.createElement("div", { className: "vt-mkt-ph" }, ["front", "back"].map((side) => /* @__PURE__ */ React.createElement(
    CopyPhoto,
    {
      key: side,
      photo: tc.photos?.[side],
      side,
      size: "md",
      card: c,
      onOpen: () => setModal({ type: "copyPhoto", photos: tc.photos, cardId: tc.cardId, cert: tc.cert, side })
    }
  ))), /* @__PURE__ */ React.createElement("div", { className: "vt-mkt-id" }, c.name), /* @__PURE__ */ React.createElement("div", { className: "vt-mkt-sub" }, c.set, c.num && c.num !== "\u2014" ? " \xB7 #" + c.num : ""), /* @__PURE__ */ React.createElement("div", { className: "vt-mkt-sub" }, [isRaw(c) ? "Raw" : c.grade, isRaw(c) ? c.condition : null, c.print, c.edition, c.language].filter(Boolean).join(" \xB7 ")), tc.cert && /* @__PURE__ */ React.createElement("div", { className: "vt-mkt-sub mono" }, tc.cert), /* @__PURE__ */ React.createElement(CardCopyActions, { ctx, card: c, copy: tc })), /* @__PURE__ */ React.createElement("div", { className: "vt-mkt-dec" }, st.owner === "tp" ? /* @__PURE__ */ React.createElement(
    MarketDecision,
    {
      tc,
      by: "tp",
      party: col,
      theirHeading: "Their market value",
      myHeading: "Your market value",
      onAccept: () => marketAction(opp.id, tc.cardId, "tp", "accept"),
      onPropose: (a) => marketAction(opp.id, tc.cardId, "tp", "propose", a)
    }
  ) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(MarketWaiting, { tc, by: "tp", who: col.short, party: col }), /* @__PURE__ */ React.createElement(SimBlock, { who: col.short }, /* @__PURE__ */ React.createElement(
    MarketDecision,
    {
      tc,
      by: "collector",
      defaultAmount: binderRef ? binderRef.market : null,
      theirHeading: "Your market value",
      myHeading: col.short + "'s market value",
      onAccept: () => marketAction(opp.id, tc.cardId, "collector", "accept"),
      onPropose: (a) => marketAction(
        opp.id,
        tc.cardId,
        "collector",
        tc.collectorMarket == null ? "propose" : "counter",
        a
      )
    }
  ))))))), phase === PHASE.percent && /* @__PURE__ */ React.createElement("tr", { className: "vt-act" }, /* @__PURE__ */ React.createElement("td", { colSpan: 5 }, st.owner === "tp" ? /* @__PURE__ */ React.createElement(
    TradeDecision,
    {
      tc,
      by: "tp",
      party: col,
      defaultPct,
      onAccept: () => percentAction(opp.id, tc.cardId, "tp", "accept"),
      onPropose: (frac) => percentAction(opp.id, tc.cardId, "tp", "propose", frac)
    }
  ) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(TradeWaiting, { tc, by: "tp", who: col.short, party: col }), /* @__PURE__ */ React.createElement(SimBlock, { who: col.short }, /* @__PURE__ */ React.createElement(
    TradeDecision,
    {
      tc,
      by: "collector",
      onAccept: () => percentAction(opp.id, tc.cardId, "collector", "accept"),
      onPropose: (frac) => percentAction(opp.id, tc.cardId, "collector", "propose", frac)
    }
  ), /* @__PURE__ */ React.createElement("div", { className: "vt-actions", style: { marginTop: 9 } }, /* @__PURE__ */ React.createElement("button", { className: "btn sm dgr", onClick: () => collectorWithdrawCard(opp.id, tc.cardId) }, "Withdraw \u2014 keep the card")))))), open && /* @__PURE__ */ React.createElement("tr", { className: "vt-exp-row" }, /* @__PURE__ */ React.createElement("td", { colSpan: 5 }, /* @__PURE__ */ React.createElement("div", { className: "vt-evidence" }, /* @__PURE__ */ React.createElement("div", { className: "vt-stock" }, /* @__PURE__ */ React.createElement(CardImage, { card: c, size: "feature" }), /* @__PURE__ */ React.createElement("span", { className: "cimg-cap" }, "Card")), /* @__PURE__ */ React.createElement("div", { className: "vt-photos" }, ["front", "back"].map((side) => /* @__PURE__ */ React.createElement(
    CopyPhoto,
    {
      key: side,
      photo: tc.photos?.[side],
      side: "Their copy \xB7 " + side,
      size: "sm",
      card: c,
      onOpen: () => setModal({ type: "copyPhoto", photos: tc.photos, cardId: tc.cardId, cert: tc.cert, side })
    }
  ))), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { className: "sect-t" }, "This exact copy"), /* @__PURE__ */ React.createElement("div", { className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, "Identity"), /* @__PURE__ */ React.createElement("span", { className: "v", style: { fontSize: 11.5 } }, c.name, " \xB7 ", c.grade, isRaw(c) ? " \xB7 " + c.condition : "", " \xB7 ", c.print, " \xB7 ", c.edition, " \xB7 ", c.set, " ", c.num, " \xB7 ", c.language)), /* @__PURE__ */ React.createElement("div", { className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, "Certification"), /* @__PURE__ */ React.createElement("span", { className: "v", style: { fontSize: 11.5 } }, tc.cert || "not graded")), /* @__PURE__ */ React.createElement("div", { className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, "Binder copy"), /* @__PURE__ */ React.createElement("span", { className: "v", style: { fontSize: 11.5 } }, tc.binderId || "\u2014")), /* @__PURE__ */ React.createElement("div", { className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, "Inclusion"), /* @__PURE__ */ React.createElement("span", { className: "v", style: { fontSize: 11.5 } }, tc.inclusion === "proposed" ? "awaiting your review" : tc.inclusion === "rejected" ? "you rejected this card" + (tc.reviewedAt ? " on " + fmtDate(tc.reviewedAt) : "") : "accepted into the trade" + (tc.reviewedAt ? " on " + fmtDate(tc.reviewedAt) : ""))), tc.withdrawn && /* @__PURE__ */ React.createElement("div", { className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, "Withdrawn"), /* @__PURE__ */ React.createElement("span", { className: "v", style: { fontSize: 11.5 } }, col.short, " kept the card", tc.withdrawnAt ? " on " + fmtDate(tc.withdrawnAt) : "")), fullyAgreed(tc) && /* @__PURE__ */ React.createElement("div", { className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, "Trade value"), /* @__PURE__ */ React.createElement("span", { className: "v" }, money(tc.agreedMarket), " \xD7 ", pct(tc.agreedPercent), " = ", money(creditFor(tc)))), /* @__PURE__ */ React.createElement("div", { className: "sect-t", style: { marginTop: 10 } }, "Market value history"), tc.valueThread.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11.5 } }, "No market proposals yet."), tc.valueThread.map((e, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "vt-hist" }, /* @__PURE__ */ React.createElement("span", { className: "muted" }, e.by === "tp" ? "You" : col.short, " ", e.type === "accept" ? "accepted" : "proposed"), /* @__PURE__ */ React.createElement("span", { className: "mono" }, money(e.amount)))), /* @__PURE__ */ React.createElement("div", { className: "sect-t", style: { marginTop: 10 } }, "Trade % history"), tc.percentThread.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11.5 } }, "Percentage opens once market value is agreed."), tc.percentThread.map((e, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "vt-hist" }, /* @__PURE__ */ React.createElement("span", { className: "muted" }, e.by === "tp" ? "You" : col.short, " ", e.type === "accept" ? "accepted" : "proposed"), /* @__PURE__ */ React.createElement("span", { className: "mono" }, pct(e.percent)))))))));
}
function ProposedCardReview({ ctx, opp, tc }) {
  const { card, setModal, tpReviewInclusion, tradeRemoveCard, collector } = ctx;
  const c = card(tc.cardId);
  const col = collector(opp.collectorId);
  if (!c) return null;
  const details = [
    ["Set", c.set],
    ["Card number", c.num && c.num !== "\u2014" ? c.num : null],
    [isRaw(c) ? "Condition" : "Grade", isRaw(c) ? c.condition : c.grade],
    ["Variant", c.print && c.print !== "Normal" ? c.print : null],
    ["Edition", c.edition],
    ["Language", c.language],
    ["Cert", tc.cert]
  ].filter(([, v]) => v);
  return /* @__PURE__ */ React.createElement("div", { className: "st-card" }, /* @__PURE__ */ React.createElement("div", { className: "st-id" }, /* @__PURE__ */ React.createElement("div", { className: "st-name" }, c.name), /* @__PURE__ */ React.createElement("div", { className: "st-sub" }, [c.set, c.num && c.num !== "\u2014" ? "#" + c.num : null].filter(Boolean).join(" \xB7 "))), /* @__PURE__ */ React.createElement("div", { className: "st-body" }, /* @__PURE__ */ React.createElement("div", { className: "st-photos" }, ["front", "back"].map((side) => /* @__PURE__ */ React.createElement(
    CopyPhoto,
    {
      key: side,
      photo: tc.photos?.[side],
      side,
      size: "lg",
      card: c,
      onOpen: () => setModal({ type: "copyPhoto", photos: tc.photos, cardId: tc.cardId, cert: tc.cert, side })
    }
  ))), /* @__PURE__ */ React.createElement("div", { className: "st-details" }, /* @__PURE__ */ React.createElement("div", { className: "sect-t" }, "Card Details"), details.map(([k, v]) => /* @__PURE__ */ React.createElement("div", { key: k, className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, k), /* @__PURE__ */ React.createElement("span", { className: "v", style: { fontSize: 12 } }, v))), /* @__PURE__ */ React.createElement(CardCopyActions, { ctx, card: c, copy: tc }))), opp.trade.submitted ? /* @__PURE__ */ React.createElement("div", { className: "st-decide" }, /* @__PURE__ */ React.createElement("div", { className: "st-ask" }, "Would you accept this card into the trade?"), /* @__PURE__ */ React.createElement("div", { className: "vt-actions" }, /* @__PURE__ */ React.createElement("button", { className: "btn pri sm", onClick: () => tpReviewInclusion(opp.id, tc.cardId, "accept") }, "Accept into trade"), /* @__PURE__ */ React.createElement("button", { className: "btn sm dgr", onClick: () => tpReviewInclusion(opp.id, tc.cardId, "reject") }, "Reject"))) : /* @__PURE__ */ React.createElement(SimBlock, { who: col.short }, /* @__PURE__ */ React.createElement("div", { className: "vt-actions" }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11.5 } }, "Draft \u2014 not yet sent for your review."), /* @__PURE__ */ React.createElement("button", { className: "btn sm dgr", onClick: () => tradeRemoveCard(opp.id, tc.cardId) }, "Remove from package"))));
}
function ResolvedCardRow({ ctx, tc, accepted }) {
  const c = ctx.card(tc.cardId);
  if (!c) return null;
  const line = [isRaw(c) ? "Raw \xB7 " + c.condition : c.grade, c.set, c.edition].filter(Boolean).join(" \xB7 ");
  return /* @__PURE__ */ React.createElement("div", { className: "st-done" + (accepted ? " ok" : " no") }, /* @__PURE__ */ React.createElement("span", { className: "st-mark", "aria-hidden": "true" }, accepted ? "\u2713" : "\xD7"), /* @__PURE__ */ React.createElement("div", { className: "st-done-b" }, /* @__PURE__ */ React.createElement("div", { className: "st-done-n" }, c.name), /* @__PURE__ */ React.createElement("div", { className: "st-sub" }, line)), /* @__PURE__ */ React.createElement("span", { className: "st-done-s" }, accepted ? "Accepted into trade" : "Rejected"));
}
function SelectTradeReview({ ctx, opp }) {
  const {
    collectorCards,
    card,
    collector,
    tradeAddCard,
    submitPackageForReview,
    collectorChooseCash,
    setDrawer,
    setNav,
    interestedIn
  } = ctx;
  const col = collector(opp.collectorId);
  const cards = tradeCards(opp);
  const toReview = cards.filter((tc) => tc.inclusion === "proposed");
  const accepted = cards.filter((tc) => tc.inclusion === "accepted");
  const rejected = cards.filter((tc) => tc.inclusion === "rejected");
  const inPackage = new Set(cards.map((c) => c.cardId));
  const addable = collectorCards.filter((cc) => cc.collectorId === opp.collectorId && interestedIn(cc.id) && !inPackage.has(cc.cardId));
  const summary = [
    accepted.length ? `${accepted.length} accepted` : null,
    toReview.length ? `${toReview.length} to review` : null,
    rejected.length ? `${rejected.length} rejected` : null
  ].filter(Boolean).join(" \xB7 ");
  return /* @__PURE__ */ React.createElement("div", { className: "vt-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "vt-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "sect-t", style: { margin: 0 } }, "Select Trade"), /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11.5 } }, "Review the cards ", col.short, " proposed for trade.")), /* @__PURE__ */ React.createElement("div", { className: "vt-progress" + (toReview.length === 0 && accepted.length > 0 ? " done" : "") }, summary || "No cards proposed yet")), cards.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "cp-empty" }, "No trade cards proposed yet."), toReview.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "st-group" }, "To review"), toReview.map((tc) => /* @__PURE__ */ React.createElement(ProposedCardReview, { key: tc.id, ctx, opp, tc }))), accepted.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "st-group" }, "Accepted"), accepted.map((tc) => /* @__PURE__ */ React.createElement(ResolvedCardRow, { key: tc.id, ctx, tc, accepted: true }))), rejected.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "st-group" }, "Rejected"), rejected.map((tc) => /* @__PURE__ */ React.createElement(ResolvedCardRow, { key: tc.id, ctx, tc, accepted: false }))), !opp.trade?.submitted ? /* @__PURE__ */ React.createElement(SimBlock, { who: col.short }, addable.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 9 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, marginBottom: 5 } }, "Add an eligible card \u2014 only cards you've marked \u201COpen to trade\u201D in their binder appear here."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 5 } }, addable.map((cc) => /* @__PURE__ */ React.createElement("button", { key: cc.id, className: "btn sm", onClick: () => tradeAddCard(opp.id, cc.cardId) }, "+ ", card(cc.cardId).name)))), addable.length === 0 && cards.length === 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, marginBottom: 9 } }, "None of their cards are flagged as trade-eligible, so cash is the only option."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("button", { className: "btn sm pri", disabled: !cards.length, onClick: () => submitPackageForReview(opp.id) }, "Send package for review"), /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => collectorChooseCash(opp.id) }, "Cash only, no trade"))) : /* @__PURE__ */ React.createElement("div", { className: "vt-foot" }, toReview.length ? /* @__PURE__ */ React.createElement("span", { className: "muted" }, "Accepted cards move to Value Trade.") : accepted.length === 0 ? /* @__PURE__ */ React.createElement("span", { style: { color: "var(--amber)" } }, "You rejected every card, so nothing moves forward as trade.") : /* @__PURE__ */ React.createElement("span", { style: { color: "var(--t1)" } }, "Package settled \u2014 moving to Value Trade.")), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 9 } }, /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => {
    setDrawer(null);
    setNav({ section: "collectors", collectorId: opp.collectorId, focus: "trade-binder" });
  } }, "View ", col.short, "'s Trade Binder")));
}
function TradeTable({ ctx, opp }) {
  const { collector, collectorChooseCash, collectorStopPursuing, setDrawer, setNav } = ctx;
  const cards = tradeCards(opp);
  const col = collector(opp.collectorId);
  const active = activeTradeCards(opp);
  const settled = settledCards(opp);
  const stranded = allWithdrawn(opp);
  return /* @__PURE__ */ React.createElement("div", { className: "vt-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "vt-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "sect-t", style: { margin: 0 } }, "Value Trade"), /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11.5 } }, "Agree market value, then agree what percentage of it becomes trade value.")), /* @__PURE__ */ React.createElement("div", { className: "vt-progress" + (settled.length === active.length && active.length > 0 ? " done" : "") }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, settled.length, " of ", active.length), " settled")), /* @__PURE__ */ React.createElement("div", { className: "vt-scroll" }, /* @__PURE__ */ React.createElement("table", { className: "tbl vt" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, TRADE_COLUMNS.map((h, i) => /* @__PURE__ */ React.createElement("th", { key: h, className: "stick" + (i >= 1 && i <= 3 ? " num" : "") }, h)))), /* @__PURE__ */ React.createElement("tbody", null, cards.map((tc) => /* @__PURE__ */ React.createElement(TradeRow, { key: tc.id, ctx, opp, tc })), cards.length === 0 && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 5, className: "empty" }, "No trade cards proposed yet."))), /* @__PURE__ */ React.createElement("tfoot", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { className: "muted", style: { fontSize: 12 } }, settled.length, " card", settled.length === 1 ? "" : "s", " settled", withdrawnCards(opp).length ? ` \xB7 ${withdrawnCards(opp).length} withdrawn` : ""), /* @__PURE__ */ React.createElement("td", { className: "num mono faint" }, "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "num mono faint" }, "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "num mono", style: { fontWeight: 600 } }, money(totalCredit(opp))), /* @__PURE__ */ React.createElement("td", null))))), stranded ? /* @__PURE__ */ React.createElement(SimBlock, { who: col.short }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, marginBottom: 8 } }, "Every card was withdrawn. The agreed purchase price of ", money(opp.agreedPrice), " still stands \u2014 ", col.short, " decides how to proceed."), /* @__PURE__ */ React.createElement("div", { className: "vt-actions" }, /* @__PURE__ */ React.createElement("button", { className: "btn sm pri", onClick: () => collectorChooseCash(opp.id) }, "Continue as cash only"), /* @__PURE__ */ React.createElement("button", { className: "btn sm dgr", onClick: () => collectorStopPursuing(opp.id) }, "Stop pursuing"))) : /* @__PURE__ */ React.createElement("div", { className: "vt-foot" }, settled.length === active.length && active.length > 0 ? /* @__PURE__ */ React.createElement("span", { style: { color: "var(--t1)" } }, "Every card has an agreed market and an agreed percentage. Trade value ", money(totalCredit(opp)), " \u2014 moving to Deal.") : /* @__PURE__ */ React.createElement("span", { className: "muted" }, active.length - settled.length, " card", active.length - settled.length === 1 ? "" : "s", " still unresolved. Each needs an agreed market value and an agreed trade percentage.")), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 9 } }, /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => {
    setDrawer(null);
    setNav({ section: "collectors", collectorId: opp.collectorId, focus: "trade-binder" });
  } }, "View ", col.short, "'s Trade Binder")));
}
function FulfillmentPanel({ ctx, opp }) {
  const { collector, proposeFulfillment, collectorConfirmPlan, collectorRequestPlanRevision, confirmHandoff } = ctx;
  const f = opp.fulfillment;
  const col = collector(opp.collectorId);
  const agreed = planAgreed(f);
  const [draft, setDraft] = useState({ method: f.method, show: f.show, date: f.date, time: f.time, location: f.location, note: f.note });
  const [revNote, setRevNote] = useState("");
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const ready = planFieldsFilled(draft);
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "sect-t" }, "Coordination \u2014 when and where"), agreed ? /* @__PURE__ */ React.createElement("div", { className: "fx-plan" }, /* @__PURE__ */ React.createElement("div", { className: "fx-plan-t" }, fulfillmentSummary(f)), f.note && /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11.5, marginTop: 2 } }, f.note), /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11, marginTop: 4 } }, "Agreed by both sides. Proposed ", fmtDate(f.proposedAt), ".")) : /* @__PURE__ */ React.createElement(React.Fragment, null, f.revisionRequested && /* @__PURE__ */ React.createElement("div", { className: "fx-rev" }, /* @__PURE__ */ React.createElement("strong", null, col.short, " asked for a change:"), " ", f.revisionRequested.note), /* @__PURE__ */ React.createElement("div", { className: "fx-methods" }, FULFILLMENT_METHODS.map((m) => /* @__PURE__ */ React.createElement("button", { key: m.id, className: "fx-method" + (draft.method === m.id ? " on" : ""), onClick: () => set("method", m.id) }, m.label))), draft.method === "show" && /* @__PURE__ */ React.createElement("div", { className: "fx-fields" }, /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Show / event"), /* @__PURE__ */ React.createElement("input", { className: "inp", value: draft.show, onChange: (e) => set("show", e.target.value), placeholder: "Twin Cities Card Show" })), /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Date"), /* @__PURE__ */ React.createElement("input", { className: "inp", type: "date", value: draft.date, onChange: (e) => set("date", e.target.value) }))), draft.method === "meetup" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "fx-fields" }, /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Date"), /* @__PURE__ */ React.createElement("input", { className: "inp", type: "date", value: draft.date, onChange: (e) => set("date", e.target.value) })), /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Time"), /* @__PURE__ */ React.createElement("input", { className: "inp", type: "time", value: draft.time, onChange: (e) => set("time", e.target.value) }))), /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Location"), /* @__PURE__ */ React.createElement("input", { className: "inp", value: draft.location, onChange: (e) => set("location", e.target.value), placeholder: "Dreamers Vault \u2014 Minneapolis" }))), draft.method && /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Note (optional)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "inp",
      value: draft.note,
      onChange: (e) => set("note", e.target.value),
      placeholder: draft.method === "show" ? "Find me at table 214" : "Meet near the front counter"
    }
  )), draft.method && /* @__PURE__ */ React.createElement("div", { className: "vt-actions" }, /* @__PURE__ */ React.createElement("button", { className: "btn pri sm", disabled: !ready, onClick: () => proposeFulfillment(opp.id, draft) }, f.proposedAt ? "Resubmit plan" : "Propose fulfillment plan"), !ready && /* @__PURE__ */ React.createElement("span", { className: "faint", style: { fontSize: 11 } }, draft.method === "show" ? "Show name and date are needed." : "Date, time and location are needed.")), planProposed(f) && !f.collectorConfirmedPlan && /* @__PURE__ */ React.createElement(SimBlock, { who: col.short }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, marginBottom: 7 } }, "Proposed: ", fulfillmentSummary(f), f.note ? ` \u2014 ${f.note}` : ""), /* @__PURE__ */ React.createElement("div", { className: "vt-actions" }, /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => collectorConfirmPlan(opp.id) }, "Confirm this plan"), /* @__PURE__ */ React.createElement("input", { className: "inp", style: { flex: 1, minWidth: 140 }, placeholder: "Ask for a change", value: revNote, onChange: (e) => setRevNote(e.target.value) }), /* @__PURE__ */ React.createElement("button", { className: "btn sm dgr", disabled: !revNote.trim(), onClick: () => {
    collectorRequestPlanRevision(opp.id, revNote);
    setRevNote("");
  } }, "Request revision")))), /* @__PURE__ */ React.createElement("div", { className: "hr" }), /* @__PURE__ */ React.createElement("div", { className: "sect-t" }, "Completion \u2014 did the exchange happen"), !agreed ? /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 12 } }, "Locked until the plan is agreed. Coordinate first.") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "vt-actions" }, /* @__PURE__ */ React.createElement("button", { className: "btn pri sm", disabled: f.tpHandoff, onClick: () => confirmHandoff(opp.id, "tp") }, f.tpHandoff ? "You confirmed handoff" : "Confirm handoff"), /* @__PURE__ */ React.createElement("span", { className: "faint", style: { fontSize: 11.5 } }, "You gave ", col.short, " the card and received your side of the exchange.")), /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11.5, marginTop: 6 } }, f.collectorReceipt ? `${col.short} confirmed receipt.` : `${col.short} has not confirmed receipt.`), /* @__PURE__ */ React.createElement(SimBlock, { who: col.short }, /* @__PURE__ */ React.createElement("button", { className: "btn sm", disabled: f.collectorReceipt, onClick: () => confirmHandoff(opp.id, "collector") }, "Confirm receipt"))));
}
function nextStepDetail(opp, col) {
  if (!opp) return null;
  const who = col ? col.short : "the collector";
  switch (opp.stage) {
    case "agree-price": {
      const last = lastEntry(opp.priceThread);
      if (!last) return `Nothing is on the table yet \u2014 a price negotiation opens when ${who} makes an offer.`;
      return last.by === "collector" ? `Accept their ${money(last.amount)} or send a counter. Agreeing a price opens Select Trade.` : `Waiting for ${who} to respond to your ${money(last.amount)} counter.`;
    }
    case "select-trade": {
      const cards = tradeCards(opp);
      if (!cards.length || !opp.trade.submitted)
        return `${who} is choosing which cards to put toward the trade. Nothing to review until they send the package.`;
      return proposedCards(opp).length ? `Review the card${proposedCards(opp).length === 1 ? "" : "s"} ${who} proposed for trade and let them know your decision.` : `Accepted cards move to Value Trade, where you agree what each one is worth.`;
    }
    case "value-trade":
      return `Agree a market value for each card, then agree what percentage of it becomes trade value.`;
    case "deal":
      return `Check the card-by-card breakdown and the cash balance before either side agrees.`;
    case "fulfillment":
      return `Confirm the handoff once the cards and payment have changed hands.`;
    default:
      return null;
  }
}
function nextStepStatus(opp) {
  if (!opp) return null;
  if (opp.stage === "select-trade" && opp.trade && opp.trade.submitted) {
    const acc = includedCards(opp).length, rev = proposedCards(opp).length;
    if (acc || rev) return [acc ? `${acc} accepted` : null, rev ? `${rev} to review` : null].filter(Boolean).join(" \xB7 ");
  }
  if (opp.stage === "value-trade") {
    const active = activeTradeCards(opp);
    if (active.length) return `${active.filter(fullyAgreed).length} of ${active.length} settled`;
  }
  return null;
}
function StageWorkspace({ ctx, opp, goal, matches }) {
  const {
    card,
    collector,
    setDrawer,
    setNav,
    setModal,
    priceRespond,
    dealAgree,
    dealAdjust,
    proposeFulfillment,
    collectorConfirmPlan,
    collectorRequestPlanRevision,
    confirmHandoff,
    collectorPromoteGoal,
    collectorConfirmGoal,
    collectorMakeOffer
  } = ctx;
  const [values, setValues] = useState({});
  const [method, setMethod] = useState("");
  const [adjDraft, setAdjDraft] = useState("");
  const [revNote, setRevNote] = useState("");
  const [copy, setCopy] = useState(matches[0]?.invId || "");
  const chosen = matches.find((m) => m.invId === copy) || matches[0];
  const [offer, setOffer] = useState(
    chosen ? String(Math.round((chosen.ask ?? card(chosen.cardId)?.value ?? 0) * 0.9)) : ""
  );
  const stage = opp ? opp.stage : goal.tier;
  const collectorId = opp ? opp.collectorId : goal.collectorId;
  const cardId = opp ? opp.cardId : goal.cardId;
  const col = collector(collectorId);
  const c = card(cardId);
  const na = nextAction(opp || { stage, deal: {}, fulfillment: {} });
  const close = () => setDrawer(null);
  const last = opp ? lastEntry(opp.priceThread) : null;
  return /* @__PURE__ */ React.createElement("div", { className: "ws-stagework" }, /* @__PURE__ */ React.createElement("div", { className: "ws-owner " + (na.owner || "none") }, /* @__PURE__ */ React.createElement("div", { className: "ws-owner-h" }, na.owner ? "Next step \xB7 " + nextStepLabel(na.owner) : "No next step"), /* @__PURE__ */ React.createElement("div", { className: "ws-owner-b" }, na.label), nextStepDetail(opp, col) && /* @__PURE__ */ React.createElement("div", { className: "ws-owner-d" }, nextStepDetail(opp, col)), nextStepStatus(opp) && /* @__PURE__ */ React.createElement("div", { className: "ws-owner-s mono" }, nextStepStatus(opp))), !opp && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "sect-t" }, STAGE_LABEL[stage]), /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: 12.5 } }, stage === "secondary" ? "A secondary goal becomes primary only when the collector decides it has. You can talk about it, but you can't promote it." : matches.length ? "You hold a qualifying copy. Messaging them is fine \u2014 but only their offer opens a negotiation." : "You hold no qualifying copy. You can still talk about sourcing it."), goal.note && /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 12, marginTop: 8 } }, "\u201C", goal.note, "\u201D"), /* @__PURE__ */ React.createElement("div", { className: "hr" }), /* @__PURE__ */ React.createElement("div", { className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, "Last confirmed"), /* @__PURE__ */ React.createElement("span", { className: "v", style: { fontSize: 12 } }, elapsedAgo(goal.confirmedAt))), /* @__PURE__ */ React.createElement("div", { className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, "Created"), /* @__PURE__ */ React.createElement("span", { className: "v", style: { fontSize: 12 } }, fmtDate(goal.createdAt))), /* @__PURE__ */ React.createElement(SimBlock, { who: col.short }, /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 9 } }, /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => collectorConfirmGoal(goal.id) }, "Confirm goal is still accurate")), stage === "secondary" ? /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => collectorPromoteGoal(goal.id) }, "Promote to Primary Goal") : matches.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 12 } }, "No offer is possible \u2014 you hold no qualifying copy.") : /* @__PURE__ */ React.createElement("div", null, matches.length > 1 && /* @__PURE__ */ React.createElement("select", { className: "inp", style: { marginBottom: 7 }, value: copy || matches[0].invId, onChange: (e) => setCopy(e.target.value) }, matches.map((m) => /* @__PURE__ */ React.createElement("option", { key: m.invId, value: m.invId }, money(m.ask), " \xB7 ", m.cert || "no cert"))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, marginBottom: 6 } }, "Offer against ", money(chosen.ask), ":"), /* @__PURE__ */ React.createElement(
    AmountInput,
    {
      value: offer,
      onChange: setOffer,
      label: "Make offer",
      onSubmit: () => collectorMakeOffer(goal.id, Number(offer), chosen.invId)
    }
  )))), opp && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "sect-t" }, "Terms"), /* @__PURE__ */ React.createElement("div", { className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, "Listed price"), /* @__PURE__ */ React.createElement("span", { className: "v" }, /* @__PURE__ */ React.createElement(Money, { v: opp.listedPrice }))), /* @__PURE__ */ React.createElement("div", { className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, "Agreed price"), /* @__PURE__ */ React.createElement("span", { className: "v" }, /* @__PURE__ */ React.createElement(Money, { v: opp.agreedPrice }))), opp.trade && /* @__PURE__ */ React.createElement("div", { className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, "Trade"), /* @__PURE__ */ React.createElement("span", { className: "v", style: { fontSize: 12 } }, opp.trade.mode === "cash" ? "Cash only" : settledCards(opp).length + " card(s)")), opp.agreedPrice != null && opp.trade && /* @__PURE__ */ React.createElement("div", { className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, "Cash balance"), /* @__PURE__ */ React.createElement("span", { className: "v", style: { fontSize: 12 } }, cashLabel(opp, col.short))), opp.stage === "agree-price" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "hr" }), /* @__PURE__ */ React.createElement("div", { className: "sect-t" }, "Price negotiation"), /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 10 } }, opp.priceThread.map((e, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--line-soft)", fontSize: 12.5 } }, /* @__PURE__ */ React.createElement("span", { className: "muted" }, e.by === "tp" ? "You" : col.short, " ", e.type === "offer" ? "offered" : e.type === "counter" ? "countered" : e.type), /* @__PURE__ */ React.createElement("span", { className: "mono" }, money(e.amount), shareText(e.amount, opp.listedPrice) ? " \xB7 " + shareText(e.amount, opp.listedPrice) : "")))), opp.declined ? /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 12.5 } }, col.short, " stopped pursuing this card. The record stays for history.") : /* @__PURE__ */ React.createElement(PriceDecision, { opp, col, na, priceRespond }), na.owner === "collector" && !opp.declined && /* @__PURE__ */ React.createElement(SimBlock, { who: col.short }, /* @__PURE__ */ React.createElement(PriceDecision, { opp, col, na, priceRespond, by: "collector" }), /* @__PURE__ */ React.createElement("div", { className: "vt-actions", style: { marginTop: 9 } }, /* @__PURE__ */ React.createElement("button", { className: "btn sm dgr", onClick: () => priceRespond(opp.id, "collector", "decline") }, "Stop pursuing")))), opp.stage === "select-trade" && /* @__PURE__ */ React.createElement(SelectTradeReview, { ctx, opp }), opp.stage === "value-trade" && /* @__PURE__ */ React.createElement(TradeTable, { ctx, opp }), ["deal", "fulfillment", "completed"].includes(opp.stage) && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "hr" }), /* @__PURE__ */ React.createElement("div", { className: "sect-t" }, "Deal summary"), /* @__PURE__ */ React.createElement(DealSummary, { ctx, opp })), opp.stage === "deal" && (() => {
    const cb = cashBalance(opp);
    const d = opp.deal;
    const open = adjOpen(d);
    const last2 = lastEntry(d.adjThread);
    const mine = open && last2.by === "collector";
    const targetToAdj = (target) => {
      const t = Number(target);
      if (!isFinite(t)) return null;
      const signed = cb.base >= 0 ? t : -t;
      return signed - cb.base;
    };
    const preview = (adj) => cashLabel({ ...opp, deal: { ...d, agreedAdj: adj } }, col.short);
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { marginTop: 12 }, className: "sect-t" }, "Final negotiation"), d.agreedAdj != null ? /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 12 } }, "Final balance agreed. All agreed card values and trade percentages stay unchanged.") : !open ? /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 12 } }, "No final adjustment proposed. The calculated balance remains ", cashLabel(opp, col.short), ".") : /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5 } }, last2.by === "tp" ? "You" : col.short, " proposed ", preview(last2.amount), "."), d.agreedAdj == null && /* @__PURE__ */ React.createElement("div", { className: "vt-actions", style: { marginTop: 8 } }, mine && open && /* @__PURE__ */ React.createElement(NegotiationParty, { c: col, label: "Their proposed balance" }), mine && /* @__PURE__ */ React.createElement("button", { className: "btn pri sm", onClick: () => dealAdjust(opp.id, "tp", "accept") }, "Accept \u2014 ", preview(last2.amount)), /* @__PURE__ */ React.createElement(
      AmountInput,
      {
        value: adjDraft,
        onChange: setAdjDraft,
        label: open ? "Counter balance" : "Propose balance",
        onSubmit: () => {
          const a = targetToAdj(adjDraft);
          if (a !== null && a !== 0) dealAdjust(opp.id, "tp", "propose", a);
          setAdjDraft("");
        }
      }
    ), /* @__PURE__ */ React.createElement("span", { className: "faint", style: { fontSize: 10.5 } }, "Propose a final cash amount \u2014 all agreed card values and trade percentages stay unchanged.")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 12, alignItems: "center" } }, /* @__PURE__ */ React.createElement("button", { className: "btn pri sm", disabled: d.tpAgreed || open, onClick: () => dealAgree(opp.id, "tp") }, d.tpAgreed ? "You agreed" : "Agree to this deal"), /* @__PURE__ */ React.createElement("span", { className: "faint", style: { fontSize: 11.5 } }, open ? "Settle the final balance first" : d.collectorAgreed ? col.short + " has agreed" : col.short + " has not agreed yet")), /* @__PURE__ */ React.createElement(SimBlock, { who: col.short }, /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 8 } }, /* @__PURE__ */ React.createElement("button", { className: "btn sm", disabled: d.collectorAgreed || open, onClick: () => dealAgree(opp.id, "collector") }, "Agree to this deal")), d.agreedAdj == null && /* @__PURE__ */ React.createElement("div", { className: "vt-actions" }, open && last2.by === "tp" && /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => dealAdjust(opp.id, "collector", "accept") }, "Accept \u2014 ", preview(last2.amount)), /* @__PURE__ */ React.createElement(
      AmountInput,
      {
        value: adjDraft,
        onChange: setAdjDraft,
        label: open ? "Counter balance" : "Propose balance",
        onSubmit: () => {
          const a = targetToAdj(adjDraft);
          if (a !== null && a !== 0) dealAdjust(opp.id, "collector", "propose", a);
          setAdjDraft("");
        }
      }
    ))));
  })(), opp.stage === "fulfillment" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "hr" }), /* @__PURE__ */ React.createElement(FulfillmentPanel, { ctx, opp })), opp.stage === "completed" && /* @__PURE__ */ React.createElement("div", { className: "notice", style: { marginTop: 12, marginBottom: 0 } }, "Completed ", fmtDate(opp.completedAt), " \xB7 ", fulfillmentSummary(opp.fulfillment), ". These terms are preserved as history.")));
}
function CardContext({ ctx, c, matches, opp, thread }) {
  const { collector, goalsForIdentity, setDrawer, setNav } = ctx;
  const boundInv = opp && opp.invId ? matches.find((m) => m.invId === opp.invId) : null;
  const serves = goalsForIdentity(c.id);
  const others = serves.primary.length + serves.secondary.length;
  const asks = [...new Set(matches.map((m) => m.ask))].sort((a, b) => a - b);
  const negotiating = opp && DEAL_STAGES.indexOf(opp.stage) >= 0;
  return /* @__PURE__ */ React.createElement("div", { className: "ws-top" }, /* @__PURE__ */ React.createElement("div", { className: "ws-cardline" }, /* @__PURE__ */ React.createElement("div", { className: "ws-stock" }, /* @__PURE__ */ React.createElement(CardImage, { card: c, size: "feature" })), /* @__PURE__ */ React.createElement("div", { className: "ws-cardid" }, /* @__PURE__ */ React.createElement("div", { className: "disp", style: { fontSize: 15, fontWeight: 600, lineHeight: 1.2 } }, c.name), /* @__PURE__ */ React.createElement("div", { className: "ws-ident" }, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("b", null, c.grade)), isRaw(c) && /* @__PURE__ */ React.createElement("span", null, c.condition), /* @__PURE__ */ React.createElement("span", null, c.print), /* @__PURE__ */ React.createElement("span", null, c.set, " \xB7 ", c.num), c.edition !== "Standard" && /* @__PURE__ */ React.createElement("span", null, c.edition), /* @__PURE__ */ React.createElement("span", null, c.language)), /* @__PURE__ */ React.createElement(CardCopyActions, { ctx, card: c, copy: boundInv, certAsNumber: true }))), /* @__PURE__ */ React.createElement("div", { className: "ws-photos" }, ["Front", "Back"].map((side) => {
    const img = boundInv && boundInv.photos ? boundInv.photos[side.toLowerCase()] : null;
    return /* @__PURE__ */ React.createElement("div", { key: side }, /* @__PURE__ */ React.createElement("div", { className: "ws-photo" + (boundInv && !img && negotiating ? " req" : "") }, img ? /* @__PURE__ */ React.createElement("img", { src: img, alt: `Your copy \u2014 ${side}` }) : /* @__PURE__ */ React.createElement("span", null, boundInv && negotiating ? side + " photo required" : side)), /* @__PURE__ */ React.createElement("span", { className: "cimg-cap" }, "Your copy \xB7 ", side));
  })), others > 1 && /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11.5, marginTop: 8 } }, "Also wanted by ", others - 1, " other collector", others - 1 === 1 ? "" : "s", " at this exact identity."), /* @__PURE__ */ React.createElement("div", { className: "ws-invbox" }, matches.length === 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "ws-inv-status un" }, "No matching inventory currently available"), /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11.5, marginTop: 3 } }, "You can still talk about sourcing it.")) : boundInv ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "ws-inv-status ok" }, "Negotiating one specific copy"), /* @__PURE__ */ React.createElement("div", { className: "mono", style: { fontSize: 15, marginTop: 2 } }, money(boundInv.ask)), /* @__PURE__ */ React.createElement("div", { className: "faint mono", style: { fontSize: 11 } }, boundInv.cert || "no cert")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "ws-inv-status ok" }, "Matched \xB7 ", matches.length === 1 ? "1 copy" : matches.length + " copies"), /* @__PURE__ */ React.createElement("div", { className: "mono", style: { fontSize: 15, marginTop: 2 } }, asks.length === 1 ? money(asks[0]) : money(asks[0]) + "\u2013" + money(asks[asks.length - 1])), /* @__PURE__ */ React.createElement("button", { className: "link", style: { fontSize: 11.5 }, onClick: () => setDrawer({ type: "invItem", invId: matches[0].invId }) }, "View inventory"))));
}
function DealMenu({ ctx, opp, col }) {
  const { setModal, dealMutuallyAgreed } = ctx;
  const [open, setOpen] = useState(false);
  if (!opp || isTerminal(opp)) return null;
  const cancelling = dealMutuallyAgreed(opp);
  return /* @__PURE__ */ React.createElement("span", { className: "dm" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "x dm-btn",
      "aria-haspopup": "menu",
      "aria-expanded": open,
      "aria-label": "Deal options",
      onClick: () => setOpen(!open)
    },
    "\u22EF"
  ), open && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "dm-veil", onClick: () => setOpen(false) }), /* @__PURE__ */ React.createElement("span", { className: "dm-pop", role: "menu" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      role: "menuitem",
      className: "dm-item",
      onClick: () => {
        setOpen(false);
        setModal({ type: "endDeal", oppId: opp.id });
      }
    },
    cancelling ? "Cancel agreed deal" : "End deal"
  ))));
}
function EndDealModal({ ctx, oppId }) {
  const { opps, collector, setModal, endOpportunity, dealMutuallyAgreed } = ctx;
  const opp = opps.find((o) => o.id === oppId);
  const [step, setStep] = useState("confirm");
  const [reason, setReason] = useState("");
  if (!opp) return null;
  const col = collector(opp.collectorId);
  const cancelling = dealMutuallyAgreed(opp);
  const finish = (why) => {
    endOpportunity(opp.id, "tp", why || null);
    setModal(null);
  };
  if (step === "reason") {
    return /* @__PURE__ */ React.createElement(
      Modal,
      {
        title: "Why did it end?",
        sub: "Optional \u2014 this is only for your own history.",
        onClose: () => finish(null),
        footer: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: () => finish(null) }, "Skip"), /* @__PURE__ */ React.createElement("button", { className: "btn pri", disabled: !reason, onClick: () => finish(reason) }, "Save"))
      },
      /* @__PURE__ */ React.createElement("div", { className: "dm-reasons" }, END_REASONS.map((rr) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: rr,
          className: "btn sm" + (reason === rr ? " on" : ""),
          "aria-pressed": reason === rr,
          onClick: () => setReason(rr)
        },
        rr
      )))
    );
  }
  return /* @__PURE__ */ React.createElement(
    Modal,
    {
      title: cancelling ? "Cancel this agreed deal?" : `End this deal with ${col.short}?`,
      onClose: () => setModal(null),
      footer: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: () => setModal(null) }, cancelling ? "Keep deal" : "Keep working"), /* @__PURE__ */ React.createElement("button", { className: "btn pri", onClick: () => setStep("reason") }, cancelling ? "Cancel deal" : "End deal"))
    },
    /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, lineHeight: 1.5 } }, cancelling ? /* @__PURE__ */ React.createElement(React.Fragment, null, "You and ", col.short, " already agreed to this deal. Cancelling will stop fulfillment, but the agreement and cancellation will remain in history.") : /* @__PURE__ */ React.createElement(React.Fragment, null, "The deal will stop here. Everything agreed so far will be kept in the opportunity history."))
  );
}
function ConversationWorkspace({ ctx, goalId, oppId }) {
  const { goals, opps, card, collector, threadFor, goalMatches, setDrawer, setNav } = ctx;
  const opp = oppId ? opps.find((o) => o.id === oppId) : null;
  const collectorId = opp ? opp.collectorId : goals.find((g) => g.id === goalId)?.collectorId;
  const cardId = opp ? opp.cardId : goals.find((g) => g.id === goalId)?.cardId;
  const c = cardId ? card(cardId) : null;
  const goal = useMemo(() => {
    if (goalId) return goals.find((g) => g.id === goalId) || null;
    if (!opp) return null;
    const want = identityKey(card(opp.cardId));
    return goals.find((g) => g.collectorId === opp.collectorId && identityKey(card(g.cardId)) === want) || null;
  }, [goalId, goals, opp, card]);
  const liveOpp = useMemo(() => {
    if (opp) return opp;
    if (!goal) return null;
    const want = identityKey(card(goal.cardId));
    return opps.find((o) => o.collectorId === goal.collectorId && identityKey(card(o.cardId)) === want) || null;
  }, [opp, goal, opps, card]);
  const matches = useMemo(() => goal ? goalMatches(goal) : [], [goal, goalMatches]);
  const thread = collectorId && cardId ? threadFor(collectorId, cardId) : null;
  if (!c || !collectorId) return null;
  const stage = liveOpp ? liveOpp.stage : goal ? goal.tier : "secondary";
  const col = collector(collectorId);
  const close = () => setDrawer(null);
  return /* @__PURE__ */ React.createElement("div", { className: "ovl", onClick: close }, /* @__PURE__ */ React.createElement("div", { className: "ws", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "ws-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "disp", style: { margin: 0, fontSize: 15 } }, col.name), /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11.5 } }, STAGE_LABEL[stage], " \xB7 one conversation, all stages")), /* @__PURE__ */ React.createElement("button", { className: "btn sm", style: { marginLeft: "auto" }, onClick: () => {
    close();
    setNav({ section: "collectors", collectorId });
  } }, "Collector profile"), /* @__PURE__ */ React.createElement(DealMenu, { ctx, opp: liveOpp, col }), /* @__PURE__ */ React.createElement("button", { className: "x", onClick: close, "aria-label": "Close" }, /* @__PURE__ */ React.createElement(Icon, { n: "x", s: 15 }))), /* @__PURE__ */ React.createElement(StageMap, { stage, goal }), /* @__PURE__ */ React.createElement("div", { className: "ws-body" + (TXN_STAGES.includes(stage) ? " txn" : "") }, /* @__PURE__ */ React.createElement("div", { className: "ws-side" }, /* @__PURE__ */ React.createElement(CardContext, { ctx, c, matches, opp: liveOpp, thread })), /* @__PURE__ */ React.createElement(Conversation, { ctx, thread, collectorId, cardId }), /* @__PURE__ */ React.createElement(StageWorkspace, { ctx, opp: liveOpp, goal, matches }))));
}
var GOAL_COLUMNS = [
  { h: "Collector", val: (r) => r.collectorName },
  { h: "Card", val: (r) => r.c.name },
  { h: "Graded", val: (r) => GRADED_VALUES.indexOf(r.c.grade) },
  // raw conditions run Near Mint -> Damaged; PSA rows have none, so they sit after
  { h: "Condition", val: (r) => isRaw(r.c) ? CONDITION_VALUES.indexOf(r.c.condition) : CONDITION_VALUES.length },
  { h: "Print", val: (r) => PRINT_VALUES.indexOf(r.c.print) },
  { h: "Set", val: (r) => r.c.set },
  { h: "Set #", val: (r) => parseSetNum(r.c.num) },
  { h: "Language", val: (r) => r.c.language },
  { h: "Inventory Match", num: true, val: (r) => r.matches.length },
  { h: "Listed Price", num: true, val: (r) => r.asks.length ? r.asks[0] : null },
  // ascending = longest without reconfirmation first; descending = freshest first
  { h: "Last Confirmed", num: true, val: (r) => (/* @__PURE__ */ new Date(r.g.confirmedAt + "T12:00:00")).getTime() }
];
function parseSetNum(num) {
  const m = String(num).match(/^\s*(\d+)/);
  return m ? Number(m[1]) : String(num);
}
function compareBy(col, a, b) {
  const av = col.val(a), bv = col.val(b);
  const empty = (v) => v == null || typeof v === "number" && Number.isNaN(v);
  if (empty(av) && empty(bv)) return 0;
  if (empty(av)) return 1;
  if (empty(bv)) return -1;
  const an = typeof av === "number", bn = typeof bv === "number";
  if (an && bn) return av - bv;
  if (an !== bn) return an ? -1 : 1;
  return String(av).localeCompare(String(bv));
}
var SortIndicator = ({ dir }) => /* @__PURE__ */ React.createElement("span", { className: "ind", "aria-hidden": "true" }, dir === "desc" ? "\u2193" : "\u2191");
var DEFAULT_SORT = { primary: { key: "Last Confirmed", dir: "desc" }, secondary: null };
function GoalRowTable({ ctx, stage, rows }) {
  const { card, collector, setNav, setDrawer, goalMatches, hasConversation } = ctx;
  const [sort, setSort] = useState(() => DEFAULT_SORT[stage] || null);
  const onHeader = (h) => setSort((s) => s && s.key === h ? { key: h, dir: s.dir === "asc" ? "desc" : "asc" } : { key: h, dir: "asc" });
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
  return /* @__PURE__ */ React.createElement("div", { className: "tbl-scroll" }, /* @__PURE__ */ React.createElement("table", { className: "tbl" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, GOAL_COLUMNS.map((col) => {
    const on = sort && sort.key === col.h;
    return /* @__PURE__ */ React.createElement(
      "th",
      {
        key: col.h,
        className: "stick sortable" + (col.num ? " num" : ""),
        "aria-sort": on ? sort.dir === "asc" ? "ascending" : "descending" : "none"
      },
      /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "th-btn" + (on ? " on" : ""),
          onClick: () => onHeader(col.h),
          title: "Sort by " + col.h
        },
        /* @__PURE__ */ React.createElement("span", null, col.h),
        /* @__PURE__ */ React.createElement(SortIndicator, { dir: on ? sort.dir : "asc" })
      )
    );
  }), /* @__PURE__ */ React.createElement("th", { className: "stick", style: { textAlign: "right" } }, "Reach Out"))), /* @__PURE__ */ React.createElement("tbody", null, prepared.map(({ g, c, matches, asks }) => {
    const price = asks.length === 0 ? "\u2014" : asks.length === 1 ? money(asks[0]) : money(asks[0]) + "\u2013" + money(asks[asks.length - 1]);
    return /* @__PURE__ */ React.createElement("tr", { key: g.id }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("button", { className: "link", onClick: () => setNav({ section: "collectors", collectorId: g.collectorId }) }, collector(g.collectorId)?.short)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "cimg-row" }, /* @__PURE__ */ React.createElement(CardImage, { card: c, size: "browse" }), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 500 } }, c.name))), /* @__PURE__ */ React.createElement("td", { className: "mono", style: { fontSize: 11.5 } }, c.grade), /* @__PURE__ */ React.createElement("td", { style: { fontSize: 12 } }, isRaw(c) ? c.condition : /* @__PURE__ */ React.createElement("span", { className: "faint" }, "\u2014")), /* @__PURE__ */ React.createElement("td", { style: { fontSize: 12 } }, c.print), /* @__PURE__ */ React.createElement("td", { style: { fontSize: 12 } }, c.set, c.edition !== "Standard" && /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 10.5 } }, c.edition)), /* @__PURE__ */ React.createElement("td", { className: "mono", style: { fontSize: 11.5 } }, c.num), /* @__PURE__ */ React.createElement("td", { style: { fontSize: 12 } }, c.language), /* @__PURE__ */ React.createElement("td", { className: "num", style: { fontSize: 12 } }, matches.length === 0 ? /* @__PURE__ */ React.createElement("span", { className: "faint" }, "Unmatched") : /* @__PURE__ */ React.createElement("span", { style: { color: "var(--t1)", fontWeight: 500 } }, "Matched")), /* @__PURE__ */ React.createElement("td", { className: "num mono", style: { fontSize: 12 } }, price), /* @__PURE__ */ React.createElement("td", { className: "num mono", style: { fontSize: 11.5, color: "var(--muted)" } }, elapsedAgo(g.confirmedAt)), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right" } }, /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => setDrawer({ type: "workspace", goalId: g.id }) }, hasConversation(g.collectorId, g.cardId) ? "Continue Chat" : "Reach Out")));
  }), prepared.length === 0 && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: GOAL_COLUMNS.length + 1, className: "empty" }, "Nothing sits in ", STAGE_LABEL[stage], " right now.")))));
}
var DRILL_COLUMNS = [
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
  { h: "Next Step", val: (r) => r.owner === "tp" ? 0 : 1 }
];
var DRILL_DEFAULT = { key: "Next Step", dir: "asc" };
var DRILL_ALL_DEFAULT = { key: "Waiting", dir: "desc" };
var ALL_STAGES = "__all";
function StageDrilldown({ ctx, stage, owner, onClose, onClearOwner, standalone }) {
  const { goals, model, opps, card, collector, setNav, setDrawer, ownedIds, inventory } = ctx;
  const allStages = stage == null;
  const label = allStages ? "Needs you" : STAGE_LABEL[stage];
  const invByCard = (cid) => inventory.find((i) => i.cardId === cid && !i.archived);
  const [sort, setSort] = useState(allStages ? DRILL_ALL_DEFAULT : DRILL_DEFAULT);
  const onSort = (h) => setSort((s2) => s2.key === h ? { key: h, dir: s2.dir === "asc" ? "desc" : "asc" } : { key: h, dir: "asc" });
  const isGoalStage = stage === "primary" || stage === "secondary";
  const goalRows = isGoalStage ? ctx.goalsAtStage(stage) : [];
  const inStage = (o) => allStages ? isActive(o) && o.stage !== "completed" : stage === "archived" ? isArchived(o) : o.stage === stage && isActive(o);
  const built = isGoalStage ? [] : opps.filter((o) => inStage(o) && (!owner || nextAction(o).owner === owner)).map((o) => ({
    k: o.id,
    collectorId: o.collectorId,
    cardId: o.cardId,
    collectorName: collector(o.collectorId)?.name || "",
    cardName: card(o.cardId)?.name || "",
    sortValue: oppValue(o),
    waitingDays: daysSince(o.updated),
    owner: nextAction(o).owner,
    stage: o.stage,
    action: nextAction(o).label,
    /* Ended and cancelled read differently: one stopped before commitment, the
       other after both sides had agreed. Legacy archives keep their old wording. */
    extra: isArchived(o) ? `${money(oppValue(o))} \xB7 ${outcomeLabel(o)}` : money(oppValue(o)),
    opp: o
  }));
  const col = DRILL_COLUMNS.find((x) => x.h === sort.key) || DRILL_COLUMNS[DRILL_COLUMNS.length - 1];
  const sorted = [...built].sort((a, b) => {
    const av = col.val(a), bv = col.val(b);
    const r = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sort.dir === "desc" ? -r : r;
  });
  const rows = isGoalStage ? goalRows : sorted;
  const stageTotal = isGoalStage ? goalRows.length : opps.filter(inStage).length;
  return /* @__PURE__ */ React.createElement("div", { style: standalone ? void 0 : { borderTop: "1px solid var(--line)", background: "#FBFCFD" } }, /* @__PURE__ */ React.createElement("div", { className: "ph", style: { borderBottom: "1px solid var(--line-soft)" } }, /* @__PURE__ */ React.createElement("h2", null, label, " \u2014 ", owner ? `${rows.length} of ${stageTotal}` : rows.length, " ", stageTotal === 1 && !owner ? "opportunity" : "opportunities"), owner && /* @__PURE__ */ React.createElement("span", { className: "note", style: { marginLeft: 0 } }, "Next Step \xB7 ", nextStepLabel(owner), allStages ? " \xB7 every stage" : ""), /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "auto", display: "flex", gap: 6 } }, owner && /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: onClearOwner }, "Show all ", stageTotal), /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: onClose }, standalone ? allStages ? "Close" : "Close stage" : "Close"))), isGoalStage ? /* @__PURE__ */ React.createElement(GoalRowTable, { key: stage, ctx, stage, rows: goalRows }) : /* @__PURE__ */ React.createElement("div", { style: standalone ? void 0 : { maxHeight: 300, overflowY: "auto" } }, /* @__PURE__ */ React.createElement("table", { className: "tbl" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, DRILL_COLUMNS.map((col2) => {
    const on = sort.key === col2.h;
    return /* @__PURE__ */ React.createElement(
      "th",
      {
        key: col2.h,
        className: "sortable" + (col2.num ? " num" : ""),
        "aria-sort": on ? sort.dir === "asc" ? "ascending" : "descending" : "none"
      },
      /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "th-btn" + (on ? " on" : ""),
          onClick: () => onSort(col2.h),
          title: "Sort by " + col2.h
        },
        /* @__PURE__ */ React.createElement("span", null, col2.h),
        /* @__PURE__ */ React.createElement("span", { className: "ind", "aria-hidden": "true" }, on && sort.dir === "desc" ? "\u2193" : "\u2191")
      )
    );
  }), /* @__PURE__ */ React.createElement("th", null))), /* @__PURE__ */ React.createElement("tbody", null, rows.map((r) => {
    const c = card(r.cardId);
    return /* @__PURE__ */ React.createElement("tr", { key: r.k }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("button", { className: "link", onClick: () => setNav({ section: "collectors", collectorId: r.collectorId }) }, collector(r.collectorId)?.short)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "cimg-row" }, /* @__PURE__ */ React.createElement(CardImage, { card: c, size: "triage" }), invByCard(r.cardId) ? /* @__PURE__ */ React.createElement("button", { className: "link", onClick: () => setDrawer({ type: "invItem", invId: invByCard(r.cardId).invId }) }, cardShort(c)) : /* @__PURE__ */ React.createElement("button", { className: "link", onClick: () => setNav({ section: "inventory", tab: "cultivate", focus: c.id }) }, cardShort(c)))), /* @__PURE__ */ React.createElement("td", { className: "muted", style: { fontSize: 12 } }, /* @__PURE__ */ React.createElement("span", { style: { color: r.unmet ? "var(--amber)" : void 0 } }, r.extra), r.note ? /* @__PURE__ */ React.createElement("span", { className: "faint" }, " \u2014 ", r.note) : null), /* @__PURE__ */ React.createElement("td", { className: "stage-c" }, r.stage && (stageNo(r.stage) ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "stage-n mono" }, stageNo(r.stage)), STAGE_LABEL[r.stage]) : /* @__PURE__ */ React.createElement("span", { className: "faint" }, STAGE_LABEL[r.stage]))), /* @__PURE__ */ React.createElement("td", { className: "num mono", style: { fontSize: 11.5, color: r.waitingDays > 30 ? "var(--amber)" : "var(--muted)" } }, r.waitingDays === 0 ? "today" : r.waitingDays + "d"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(NextStep, { owner: r.opp ? nextAction(r.opp).owner : "collector" }), allStages && r.action && /* @__PURE__ */ React.createElement("div", { className: "dq-act" }, r.action.replace(/^You: /, ""))), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right" } }, /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => setDrawer({ type: "workspace", oppId: r.opp.id }) }, "Open")));
  }), rows.length === 0 && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 6, className: "empty" }, allStages && owner === "tp" ? "Nothing needs you. Every open opportunity sits with a collector." : `Nothing sits in ${label} right now.`))))));
}
function Coverage({ ctx }) {
  const { coverage, card, collector, setNav, setDrawer } = ctx;
  const [open, setOpen] = useState(null);
  const { layers, total, uncoveredPrimary } = coverage;
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "panel cov-top" }, /* @__PURE__ */ React.createElement("div", { className: "cov-lead" }, /* @__PURE__ */ React.createElement("span", { className: "cov-big mono" }, total), /* @__PURE__ */ React.createElement("span", { className: "cov-lead-t" }, /* @__PURE__ */ React.createElement("b", null, "Current inventory"), /* @__PURE__ */ React.createElement("span", { className: "cov-lead-s" }, "See how your inventory connects to known collector demand."))), uncoveredPrimary.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "cov-lead-note" }, /* @__PURE__ */ React.createElement("b", null, uncoveredPrimary.length), " primary goal", uncoveredPrimary.length === 1 ? "" : "s", uncoveredPrimary.length === 1 ? " has" : " have", " no matching inventory.", /* @__PURE__ */ React.createElement("button", { className: "link", style: { marginLeft: 6 }, onClick: () => setNav({ section: "inventory", tab: "cultivate" }) }, "See what to get"))), /* @__PURE__ */ React.createElement("div", { className: "panel", style: { marginTop: 14 } }, /* @__PURE__ */ React.createElement("div", { className: "cov-sec" }, "Explicit demand"), COVERAGE_LAYERS.map((l) => {
    const L = layers[l.id];
    const on = open === l.id;
    return /* @__PURE__ */ React.createElement("div", { key: l.id, className: "cov-layer" + (on ? " on" : "") + (L.count === 0 ? " zero" : "") }, /* @__PURE__ */ React.createElement("button", { className: "cov-row", onClick: () => setOpen(on ? null : l.id), "aria-expanded": on }, /* @__PURE__ */ React.createElement("span", { className: "cov-chev", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { n: "chev", s: 12 })), /* @__PURE__ */ React.createElement("span", { className: "cov-name" }, l.label, /* @__PURE__ */ React.createElement("span", { className: "cov-q" }, l.q)), /* @__PURE__ */ React.createElement("span", { className: "cov-count mono" }, /* @__PURE__ */ React.createElement("span", { className: "cov-num" }, L.count), /* @__PURE__ */ React.createElement("span", { className: "cov-den" }, "/ ", total, " cards"))), on && /* @__PURE__ */ React.createElement("div", { className: "cov-body" }, L.count === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty", style: { padding: "14px 0" } }, "Nothing here. Every item has a stronger collector signal above.") : /* @__PURE__ */ React.createElement("table", { className: "tbl" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Inventory"), /* @__PURE__ */ React.createElement("th", null, l.id === "deal" ? "Active with" : "Relevant to"), /* @__PURE__ */ React.createElement("th", { className: "num" }, "Ask"), /* @__PURE__ */ React.createElement("th", null))), /* @__PURE__ */ React.createElement("tbody", null, L.items.slice(0, 12).map((r) => {
      const c = card(r.inv.cardId);
      return /* @__PURE__ */ React.createElement("tr", { key: r.inv.invId }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "cimg-row" }, /* @__PURE__ */ React.createElement(CardImage, { card: c, size: "browse" }), /* @__PURE__ */ React.createElement("span", { style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement("button", { className: "link", onClick: () => setDrawer({ type: "invItem", invId: r.inv.invId }) }, cardShort(c)), /* @__PURE__ */ React.createElement("div", { className: "faint mono", style: { fontSize: 11 } }, c.grade, " \xB7 ", c.set, " ", c.num)))), /* @__PURE__ */ React.createElement("td", { style: { fontSize: 12 } }, l.id === "deal" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "link", onClick: () => setNav({ section: "collectors", collectorId: r.opp.collectorId }) }, collector(r.opp.collectorId).short), /* @__PURE__ */ React.createElement("span", { className: "faint" }, " \xB7 ", STAGE_LABEL[r.opp.stage])), (l.id === "primary" || l.id === "secondary") && /* @__PURE__ */ React.createElement("span", { className: "cov-who" }, r.goals.map((g) => /* @__PURE__ */ React.createElement("button", { key: g.id, className: "chip act", onClick: () => setNav({ section: "collectors", collectorId: g.collectorId }) }, collector(g.collectorId).short))), l.id === "preference" && /* @__PURE__ */ React.createElement("span", { className: "cov-who" }, r.who.slice(0, 4).map((w) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: w.collector.id,
          className: "chip act",
          title: w.tags.map((t) => T[t] || t).join(", "),
          onClick: () => setNav({ section: "collectors", collectorId: w.collector.id })
        },
        w.collector.short
      )), r.who.length > 4 && /* @__PURE__ */ React.createElement("span", { className: "faint", style: { fontSize: 11 } }, "+", r.who.length - 4))), /* @__PURE__ */ React.createElement("td", { className: "num mono" }, money(r.inv.ask)), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right" } }, l.id === "deal" && /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => setDrawer({ type: "workspace", oppId: r.opp.id }) }, "Open deal")));
    }))), L.items.length > 12 && /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11, padding: "8px 0 0" } }, "Showing 12 of ", L.items.length, ".")));
  }), /* @__PURE__ */ React.createElement("div", { className: "cov-foot" }, "Matched cards are counted once under their strongest explicit-demand signal.")), /* @__PURE__ */ React.createElement("div", { className: "panel", style: { marginTop: 14 } }, /* @__PURE__ */ React.createElement("div", { className: "cov-sec" }, "Preference alignment"), COVERAGE_LENS.map((l) => {
    const L = layers[l.id];
    const on = open === l.id;
    return /* @__PURE__ */ React.createElement("div", { key: l.id, className: "cov-layer" + (on ? " on" : "") + (L.count === 0 ? " zero" : "") }, /* @__PURE__ */ React.createElement("button", { className: "cov-row", onClick: () => setOpen(on ? null : l.id), "aria-expanded": on }, /* @__PURE__ */ React.createElement("span", { className: "cov-chev", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { n: "chev", s: 12 })), /* @__PURE__ */ React.createElement("span", { className: "cov-name" }, l.label, /* @__PURE__ */ React.createElement("span", { className: "cov-q" }, l.q)), /* @__PURE__ */ React.createElement("span", { className: "cov-count mono" }, /* @__PURE__ */ React.createElement("span", { className: "cov-num" }, L.count), /* @__PURE__ */ React.createElement("span", { className: "cov-den" }, "/ ", total, " cards"))), on && /* @__PURE__ */ React.createElement("div", { className: "cov-body" }, L.count === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty", style: { padding: "14px 0" } }, "No held card matches a stated collector preference.") : /* @__PURE__ */ React.createElement("table", { className: "tbl" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Inventory"), /* @__PURE__ */ React.createElement("th", null, "Relevant to"), /* @__PURE__ */ React.createElement("th", { className: "num" }, "Ask"), /* @__PURE__ */ React.createElement("th", null))), /* @__PURE__ */ React.createElement("tbody", null, L.items.slice(0, 12).map((r) => {
      const c = card(r.inv.cardId);
      return /* @__PURE__ */ React.createElement("tr", { key: r.inv.invId }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "cimg-row" }, /* @__PURE__ */ React.createElement(CardImage, { card: c, size: "browse" }), /* @__PURE__ */ React.createElement("span", { style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement("button", { className: "link", onClick: () => setDrawer({ type: "invItem", invId: r.inv.invId }) }, cardShort(c)), /* @__PURE__ */ React.createElement("div", { className: "faint mono", style: { fontSize: 11 } }, c.grade, " \xB7 ", c.set, " ", c.num)))), /* @__PURE__ */ React.createElement("td", { style: { fontSize: 12 } }, /* @__PURE__ */ React.createElement("span", { className: "cov-who" }, r.who.slice(0, 4).map((w) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: w.collector.id,
          className: "chip act",
          title: w.tags.map((t) => T[t] || t).join(", "),
          onClick: () => setNav({ section: "collectors", collectorId: w.collector.id })
        },
        w.collector.short
      )), r.who.length > 4 && /* @__PURE__ */ React.createElement("span", { className: "faint" }, "+", r.who.length - 4))), /* @__PURE__ */ React.createElement("td", { className: "num mono" }, money(r.inv.ask)), /* @__PURE__ */ React.createElement("td", null));
    }))), L.items.length > 12 && /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11, padding: "8px 0 0" } }, "Showing 12 of ", L.items.length, ".")));
  }), /* @__PURE__ */ React.createElement("div", { className: "cov-foot" }, "Preference alignment can overlap with the categories above.")));
}
var INVENTORY_TABS = [
  { id: "mine", label: "Current", sub: "Everything you currently have in inventory." },
  { id: "coverage", label: "Coverage", sub: "See how your inventory connects to collector demand." },
  { id: "cultivate", label: "Cultivate", sub: "Cards most relevant to your network that you don\u2019t have." }
];
function InventoryView({ ctx }) {
  const { nav, setNav } = ctx;
  const tab = nav.tab === "unmet" ? "cultivate" : nav.tab || "mine";
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { className: "tabs" }, INVENTORY_TABS.map((t) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: t.id,
      className: "tab" + (tab === t.id ? " on" : ""),
      onClick: () => setNav({ ...nav, tab: t.id, focus: void 0 })
    },
    t.label
  ))), /* @__PURE__ */ React.createElement("div", { className: "inv-sub" }, INVENTORY_TABS.find((t) => t.id === tab)?.sub)), tab === "mine" && /* @__PURE__ */ React.createElement(MyInventory, { ctx }), tab === "coverage" && /* @__PURE__ */ React.createElement(Coverage, { ctx }), tab === "cultivate" && /* @__PURE__ */ React.createElement(Cultivate, { ctx }));
}
function MyInventory({ ctx }) {
  const { activeInv, card, demandFor, collector, nav, setNav, setDrawer, setModal, inventory } = ctx;
  const [q, setQ] = useState("");
  const [cond, setCond] = useState("all");
  const [sort, setSort] = useState("recent");
  const filter = nav.filter;
  const rows = useMemo(() => {
    let r = activeInv.map((i) => ({ inv: i, c: card(i.cardId), d: demandFor(i.cardId) })).filter((r2) => r2.c);
    if (filter?.collectorId) {
      r = r.filter(({ d }) => {
        if (filter.tier === "primary") return d.primary.some((g) => g.collectorId === filter.collectorId);
        if (filter.tier === "secondary") return d.secondary.some((g) => g.collectorId === filter.collectorId);
        if (filter.tier === "preference") return d.preference.some((p) => p.collectorId === filter.collectorId);
        return d.primary.some((g) => g.collectorId === filter.collectorId) || d.secondary.some((g) => g.collectorId === filter.collectorId) || d.preference.some((p) => p.collectorId === filter.collectorId);
      });
    }
    if (q.trim()) {
      const s = q.toLowerCase();
      r = r.filter(({ c }) => (c.name + " " + c.set + " " + c.grade).toLowerCase().includes(s));
    }
    if (cond !== "all") r = r.filter(({ c }) => c.grade === cond);
    const at = (r2) => {
      const t = r2.inv.acquired ? Date.parse(r2.inv.acquired) : NaN;
      return isFinite(t) ? t : null;
    };
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
  return /* @__PURE__ */ React.createElement(React.Fragment, null, filter?.collectorId && /* @__PURE__ */ React.createElement("div", { className: "notice" }, /* @__PURE__ */ React.createElement(Icon, { n: "people", s: 15 }), /* @__PURE__ */ React.createElement("span", null, "Showing inventory that matches ", /* @__PURE__ */ React.createElement("strong", null, collector(filter.collectorId)?.name), filter.tier ? ` at the ${filter.tier} level` : "", " \u2014 ", rows.length, " card", rows.length === 1 ? "" : "s", "."), /* @__PURE__ */ React.createElement("button", { className: "btn sm", style: { marginLeft: "auto" }, onClick: () => setNav({ section: "inventory", tab: "mine" }) }, "Clear filter")), /* @__PURE__ */ React.createElement("div", { className: "panel", style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { className: "ph", style: { gap: 8, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("div", { style: { position: "relative", flex: "0 0 260px" } }, /* @__PURE__ */ React.createElement("span", { style: { position: "absolute", left: 8, top: 7, color: "var(--faint)" } }, /* @__PURE__ */ React.createElement(Icon, { n: "search", s: 14 })), /* @__PURE__ */ React.createElement("input", { className: "inp", style: { paddingLeft: 27 }, placeholder: "Search card, set or grade", value: q, onChange: (e) => setQ(e.target.value) })), /* @__PURE__ */ React.createElement("select", { className: "inp", style: { width: 160 }, value: cond, onChange: (e) => setCond(e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "all" }, "All conditions"), GRADED_VALUES.map((g) => /* @__PURE__ */ React.createElement("option", { key: g, value: g }, g))), /* @__PURE__ */ React.createElement("select", { className: "inp", style: { width: 150 }, value: sort, onChange: (e) => setSort(e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "recent" }, "Most recent"), /* @__PURE__ */ React.createElement("option", { value: "oldest" }, "Oldest")), /* @__PURE__ */ React.createElement("span", { className: "note" }, rows.length, " of ", activeInv.length, " cards"))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } }, rows.map(({ inv, c, d }) => /* @__PURE__ */ React.createElement(InventoryRow, { key: inv.invId, ctx, inv, c, d })), rows.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "empty" }, "No cards match these filters. Clear a filter, or ", /* @__PURE__ */ React.createElement("button", { className: "link", onClick: () => setModal({ type: "addInventory" }) }, "add inventory"), "."))));
}
function InventoryRow({ ctx, inv, c, d }) {
  const { collector, setNav, setDrawer, setModal } = ctx;
  const [whyOpen, setWhyOpen] = useState(false);
  const reachOut = useMemo(() => {
    const seen = /* @__PURE__ */ new Map();
    for (const g of d.primary) if (!seen.has(g.collectorId)) seen.set(g.collectorId, { id: g.collectorId, tier: "primary", note: g.note });
    for (const g of d.secondary) if (!seen.has(g.collectorId)) seen.set(g.collectorId, { id: g.collectorId, tier: "secondary", note: g.note });
    const all = [...seen.values()];
    return {
      all,
      groups: [
        { tier: "primary", label: "Primary Goals", people: all.filter((p) => p.tier === "primary") },
        { tier: "secondary", label: "Secondary Goals", people: all.filter((p) => p.tier === "secondary") }
      ].filter((g) => g.people.length > 0)
    };
  }, [d]);
  return (
    /* The card owns the left column for the whole row height; MetYet's information
       stacks beside it. Nothing about that information changed — only where it sits. */
    /* @__PURE__ */ React.createElement("div", { className: "panel inv-row" }, /* @__PURE__ */ React.createElement("div", { className: "inv-art" }, /* @__PURE__ */ React.createElement(CardImage, { card: c, size: "shelf" })), /* @__PURE__ */ React.createElement("div", { className: "inv-body" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 14, padding: "12px 14px" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("span", { className: "inv-idline" }, /* @__PURE__ */ React.createElement("button", { className: "link disp", style: { fontSize: 14, fontWeight: 600, textDecoration: "none" }, onClick: () => setDrawer({ type: "invItem", invId: inv.invId }) }, cardTitle(c)), /* @__PURE__ */ React.createElement(CardCopyActions, { ctx, card: c, compact: true, showCert: false })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 5, marginTop: 5, flexWrap: "wrap" } }, c.tags.slice(0, 5).map((t) => /* @__PURE__ */ React.createElement("span", { key: t, className: "tag" }, T[t] || t)))), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "right", flex: "0 0 auto" } }, /* @__PURE__ */ React.createElement("div", { className: "mono", style: { fontSize: 14 } }, money(inv.ask)), /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11 } }, "cost ", moneyExact(inv.cost))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, flex: "0 0 auto" } }, /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => setModal({ type: "card", invId: inv.invId }) }, "Edit"), /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => setDrawer({ type: "invItem", invId: inv.invId }) }, "Open"))), /* @__PURE__ */ React.createElement("div", { style: { borderTop: "1px solid var(--line-soft)", background: "#FCFDFD", padding: "9px 14px" } }, reachOut.all.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 12.5 } }, "No collector in your network currently wants this. Consider trading it out.") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "ro-h" }, "Reach out"), reachOut.groups.map((g) => /* @__PURE__ */ React.createElement("div", { key: g.tier, className: "ro-group" }, /* @__PURE__ */ React.createElement("div", { className: "ro-tier" }, g.label), /* @__PURE__ */ React.createElement("div", { className: "ro-list" }, g.people.map((p) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: p.id,
        className: "ro-name" + (p.tier === "primary" ? " p1" : ""),
        title: p.note || "",
        onClick: () => setModal({ type: "outreach", cardId: c.id, collectorId: p.id, tier: p.tier })
      },
      collector(p.id)?.short
    ))))), d.preference.length > 0 && /* @__PURE__ */ React.createElement("button", { className: "link ro-why", onClick: () => setWhyOpen(!whyOpen), "aria-expanded": whyOpen }, whyOpen ? "Hide" : "Why this matches"), whyOpen && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 7, display: "flex", flexDirection: "column", gap: 3 } }, d.preference.map((p, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { fontSize: 11.5, display: "flex", gap: 7 } }, /* @__PURE__ */ React.createElement("button", { className: "link", style: { flex: "0 0 92px", textAlign: "left" }, onClick: () => setNav({ section: "collectors", collectorId: p.collectorId }) }, collector(p.collectorId)?.short), /* @__PURE__ */ React.createElement("span", { className: "faint" }, "collects ", p.tags.map((t) => T[t] || t).join(" + ")))), /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11, marginTop: 4 } }, "Preference fit is context for a conversation, not a reason to start one. Outreach needs a goal."))))))
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
  return /* @__PURE__ */ React.createElement("div", { className: "ovl", onClick: close }, /* @__PURE__ */ React.createElement("div", { className: "drawer", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "mh" }, /* @__PURE__ */ React.createElement("div", { className: "cimg-row", style: { alignItems: "flex-start", gap: 12 } }, /* @__PURE__ */ React.createElement(CardImage, { card: c, size: "hero" }), /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement("h3", { className: "disp" }, c.name), /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 12 } }, c.year, " ", c.set, c.num !== "\u2014" ? " #" + c.num : "", " \xB7 ", c.grade))), /* @__PURE__ */ React.createElement("button", { className: "x", onClick: close, "aria-label": "Close" }, /* @__PURE__ */ React.createElement(Icon, { n: "x", s: 15 }))), /* @__PURE__ */ React.createElement("div", { className: "mb" }, /* @__PURE__ */ React.createElement("div", { className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, "Ask price"), /* @__PURE__ */ React.createElement("span", { className: "v" }, money(inv.ask))), /* @__PURE__ */ React.createElement("div", { className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, "Your cost"), /* @__PURE__ */ React.createElement("span", { className: "v" }, moneyExact(inv.cost))), /* @__PURE__ */ React.createElement("div", { className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, "Margin at ask"), /* @__PURE__ */ React.createElement("span", { className: "v" }, moneyExact(inv.ask - inv.cost))), /* @__PURE__ */ React.createElement("div", { className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, "Acquired"), /* @__PURE__ */ React.createElement("span", { className: "v" }, fmtDate(inv.acquired))), /* @__PURE__ */ React.createElement(CardCopyActions, { ctx, card: c, copy: inv }), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 5, marginTop: 10, flexWrap: "wrap" } }, c.tags.map((t) => /* @__PURE__ */ React.createElement("span", { key: t, className: "tag" }, T[t] || t))), /* @__PURE__ */ React.createElement("div", { className: "hr" }), /* @__PURE__ */ React.createElement("div", { className: "sect-t" }, "Who this serves"), [["primary", "Primary Goals", "p1", d.primary], ["secondary", "Secondary Goals", "p2", d.secondary]].map(([k, lbl, cls, list]) => /* @__PURE__ */ React.createElement("div", { key: k, style: { marginBottom: 12 } }, /* @__PURE__ */ React.createElement("span", { className: "t-pill " + cls }, lbl, " ", /* @__PURE__ */ React.createElement("span", { className: "mono" }, list.length)), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6 } }, list.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 12.5 } }, "None yet."), list.map((g) => /* @__PURE__ */ React.createElement("div", { key: g.id, style: { display: "flex", alignItems: "center", gap: 9, padding: "6px 0", borderBottom: "1px solid var(--line-soft)" } }, /* @__PURE__ */ React.createElement("span", { className: "av" }, initials(collector(g.collectorId).name)), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("button", { className: "link", onClick: () => {
    close();
    setNav({ section: "collectors", collectorId: g.collectorId });
  } }, collector(g.collectorId).name), g.note && /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11.5 } }, g.note)), /* @__PURE__ */ React.createElement("button", { className: "btn sm pri", onClick: () => setModal({ type: "outreach", cardId: c.id, collectorId: g.collectorId, tier: k }) }, "Reach out")))))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--faint)" } }, /* @__PURE__ */ React.createElement("span", null, "Fits the stated preferences of ", d.preference.length, " collector", d.preference.length === 1 ? "" : "s"), d.preference.length > 0 && /* @__PURE__ */ React.createElement("button", { className: "link", style: { fontSize: 11.5 }, onClick: () => setWhy(!why), "aria-expanded": why }, why ? "Hide" : "Why this matches")), why && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 7, display: "flex", flexDirection: "column", gap: 3 } }, d.preference.map((p, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { fontSize: 11.5, display: "flex", gap: 7 } }, /* @__PURE__ */ React.createElement("button", { className: "link", style: { flex: "0 0 100px", textAlign: "left" }, onClick: () => {
    close();
    setNav({ section: "collectors", collectorId: p.collectorId });
  } }, collector(p.collectorId).short), /* @__PURE__ */ React.createElement("span", { className: "faint" }, "collects ", p.tags.map((t) => T[t] || t).join(" + ")))), /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11, marginTop: 4 } }, "Passive signal. It won't open an opportunity on its own.")), related.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "hr" }), /* @__PURE__ */ React.createElement("div", { className: "sect-t" }, "Open and past opportunities"), related.map((o) => /* @__PURE__ */ React.createElement("div", { key: o.id, style: { display: "flex", alignItems: "center", gap: 9, padding: "6px 0", borderBottom: "1px solid var(--line-soft)" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("button", { className: "link", onClick: () => {
    close();
    setNav({ section: "collectors", collectorId: o.collectorId });
  } }, collector(o.collectorId).short), /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11.5 } }, STAGE_LABEL[o.stage], " \xB7 ", money(oppValue(o)), " \xB7 ", ago(o.updated))), /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => {
    close();
    setDrawer({ type: "workspace", oppId: o.id });
  } }, "Open"))))), /* @__PURE__ */ React.createElement("div", { className: "mf" }, /* @__PURE__ */ React.createElement("button", { className: "btn dgr", onClick: () => archiveInv(inv.invId) }, "Archive card"), /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: () => setModal({ type: "card", invId: inv.invId }) }, "Edit"), /* @__PURE__ */ React.createElement("button", { className: "btn pri", onClick: () => setModal({ type: "outreach", cardId: c.id }) }, "Reach out"))));
}
var NET_COLUMNS = [
  { h: "Collector", w: "c-name", val: (r) => r.c.name, text: true, align: "left" },
  // sorts on the stored date, never the formatted tenure string
  { h: "Member since", w: "c-since", val: (r) => -new Date(r.f.memberSince).getTime(), num: true, align: "ctr" },
  /* Three separate questions, three separate numbers: what changed, how much they
     have shared, and how much of it the TP would take. All sort on the raw count. */
  { h: "New binder", w: "c-new", val: (r) => r.f.binderNew, num: true, align: "ctr" },
  { h: "Total binder", w: "c-tot", val: (r) => r.f.binderTotal, num: true, align: "ctr" },
  { h: "Open to trade", w: "c-open", val: (r) => r.f.binderOpen, num: true, align: "ctr" },
  { h: "Completed deals", w: "c-deals", val: (r) => r.f.completedDeals, num: true, align: "ctr" },
  { h: "Deal value", w: "c-val", val: (r) => r.f.completedDeals === 0 ? null : r.f.dealValue, num: true, align: "num" },
  { h: "Coverage", w: "c-cov", val: (r) => r.f.coverage, num: true, align: "num" }
];
var NET_DEFAULT = { key: "Member since", dir: "desc" };
var netCompare = (col, dir) => (a, b) => {
  const av = col.val(a), bv = col.val(b);
  if (av == null || bv == null) {
    if (av == null && bv == null) return a.c.name.localeCompare(b.c.name);
    return av == null ? 1 : -1;
  }
  const r = col.text ? String(av).localeCompare(String(bv)) : bv - av;
  if (r === 0) return a.c.name.localeCompare(b.c.name);
  return dir === "desc" ? r : -r;
};
var NETWORK_TABS = [
  { id: "collectors", label: "Collectors", sub: "Everyone you serve, and how the relationship stands." },
  { id: "binder", label: "Trade Binder", sub: "Everything your network has available to trade." }
];
function CollectorNetwork({ ctx }) {
  const { nav, setNav } = ctx;
  const tab = nav.tab === "binder" ? "binder" : "collectors";
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "inv-tabs" }, /* @__PURE__ */ React.createElement("div", { className: "tabs" }, NETWORK_TABS.map((t) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: t.id,
      className: "tab" + (tab === t.id ? " on" : ""),
      onClick: () => setNav({ ...nav, tab: t.id, focus: void 0 })
    },
    t.label
  ))), /* @__PURE__ */ React.createElement("div", { className: "inv-sub" }, NETWORK_TABS.find((t) => t.id === tab)?.sub)), tab === "collectors" ? /* @__PURE__ */ React.createElement(CollectorList, { ctx }) : /* @__PURE__ */ React.createElement(NetworkBinder, { ctx }));
}
function NetworkBinder({ ctx }) {
  const { collectorCards, collectors, card, collector, setTradeInterest, setNav, setDrawer, goalsForIdentity, interestedIn } = ctx;
  const [q, setQ] = useState("");
  const [only, setOnly] = useState(null);
  const [demandOnly, setDemandOnly] = useState(false);
  const [who, setWho] = useState("");
  const [form, setForm] = useState("");
  const [openDem, setOpenDem] = useState(null);
  const inNetwork = useMemo(() => new Set(collectors.map((c) => c.id)), [collectors]);
  const rows = useMemo(() => collectorCards.filter((cc) => inNetwork.has(cc.collectorId)).map((cc) => {
    const c = card(cc.cardId);
    const col = collector(cc.collectorId);
    if (!c || !col) return null;
    const g = goalsForIdentity(cc.cardId);
    const dedupe = (gs) => [...new Set(gs.filter((x) => x.collectorId !== cc.collectorId).map((x) => x.collectorId))].map(collector).filter(Boolean);
    const primary = dedupe(g.primary);
    const secondary = dedupe(g.secondary);
    return {
      cc,
      c,
      col,
      primary,
      secondary,
      isNew: isUnseenAddition(cc, col),
      /* Not reviewed is DERIVED from the absence of interest — no second flag, and
         no implication that the TP rejected anything. */
      notReviewed: !interestedIn(cc.id)
    };
  }).filter(Boolean), [collectorCards, inNetwork, card, collector, goalsForIdentity, interestedIn]);
  const query = q.trim().toLowerCase();
  const shown = useMemo(() => {
    let r = rows;
    if (only === "new") r = r.filter((x) => x.isNew);
    if (only === "notReviewed") r = r.filter((x) => x.notReviewed);
    if (only === "interested") r = r.filter((x) => interestedIn(x.cc.id));
    if (demandOnly) r = r.filter((x) => x.primary.length > 0);
    if (who) r = r.filter((x) => x.col.id === who);
    if (form) r = r.filter((x) => form === "raw" ? isRaw(x.c) : !isRaw(x.c));
    if (query) r = r.filter((x) => [x.c.name, x.c.set, x.c.num, x.c.grade, x.col.name].filter(Boolean).join(" ").toLowerCase().includes(query));
    const pri = (x) => x.primary.length > 0;
    return [...r].sort((a, b) => (pri(b) && b.notReviewed) - (pri(a) && a.notReviewed) || pri(b) - pri(a) || (b.secondary.length > 0) - (a.secondary.length > 0) || b.isNew - a.isNew || b.primary.length - a.primary.length || cardTitle(a.c).localeCompare(cardTitle(b.c)));
  }, [rows, only, who, form, query, demandOnly]);
  const newCount = rows.filter((x) => x.isNew).length;
  const demandCount = rows.filter((x) => x.primary.length > 0).length;
  const owners = new Set(rows.map((x) => x.col.id)).size;
  if (rows.length === 0) {
    return /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "empty", style: { padding: "26px 0" } }, "Your collectors haven\u2019t added any Trade Binder cards yet.", /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11.5, marginTop: 6 } }, "Cards a collector adds to their trade binder will appear here for review.")));
  }
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "nb-sum" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, rows.length), " card", rows.length === 1 ? "" : "s", " across", " ", /* @__PURE__ */ React.createElement("span", { className: "mono" }, owners), " collector", owners === 1 ? "" : "s", newCount > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, " \xB7 ", /* @__PURE__ */ React.createElement("span", { className: "net-new mono" }, newCount), " new since your last review"), /* @__PURE__ */ React.createElement("div", { className: "nb-note" }, "Goals belong to your collectors. Interest is yours.")), /* @__PURE__ */ React.createElement("div", { className: "nb-bar" }, /* @__PURE__ */ React.createElement("span", { className: "nb-search" }, /* @__PURE__ */ React.createElement("span", { className: "ic" }, /* @__PURE__ */ React.createElement(Icon, { n: "search", s: 14 })), /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "inp",
      type: "search",
      value: q,
      onChange: (e) => setQ(e.target.value),
      "aria-label": "Search the network trade binder",
      placeholder: "Search cards or collectors..."
    }
  )), /* @__PURE__ */ React.createElement("span", { className: "nb-lbl" }, "Show"), [["new", "New since last review"], ["notReviewed", "You haven\u2019t reviewed"], ["interested", "You\u2019re interested"]].map(([id, label]) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: id,
      className: "btn sm" + (only === id ? " on" : ""),
      "aria-pressed": only === id,
      onClick: () => setOnly(only === id ? null : id)
    },
    label
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn sm" + (demandOnly ? " on" : ""),
      "aria-pressed": demandOnly,
      onClick: () => setDemandOnly(!demandOnly)
    },
    "Wanted by a collector"
  ), /* @__PURE__ */ React.createElement(
    "select",
    {
      className: "inp nb-sel",
      value: who,
      onChange: (e) => setWho(e.target.value),
      "aria-label": "Filter by collector"
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "All collectors"),
    collectors.filter((c) => rows.some((x) => x.col.id === c.id)).map((c) => /* @__PURE__ */ React.createElement("option", { key: c.id, value: c.id }, c.name))
  ), /* @__PURE__ */ React.createElement(
    "select",
    {
      className: "inp nb-sel",
      value: form,
      onChange: (e) => setForm(e.target.value),
      "aria-label": "Filter by graded or raw"
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "Graded and raw"),
    /* @__PURE__ */ React.createElement("option", { value: "graded" }, "Graded"),
    /* @__PURE__ */ React.createElement("option", { value: "raw" }, "Raw")
  )), shown.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "panel" }, /* @__PURE__ */ React.createElement("div", { className: "empty", style: { padding: "22px 0" } }, "No binder cards match these filters.")) : /* @__PURE__ */ React.createElement("div", { className: "nb-grid" }, shown.map((x) => /* @__PURE__ */ React.createElement("div", { key: x.cc.id, className: "nb-card" + (interestedIn(x.cc.id) ? " on" : "") }, /* @__PURE__ */ React.createElement("div", { className: "nb-art" }, /* @__PURE__ */ React.createElement(CardImage, { card: x.c, size: "feature" })), /* @__PURE__ */ React.createElement("div", { className: "nb-b" }, /* @__PURE__ */ React.createElement("div", { className: "nb-t", title: cardTitle(x.c) }, x.c.name), /* @__PURE__ */ React.createElement("div", { className: "nb-s" }, x.c.set, x.c.num && x.c.num !== "\u2014" ? " \xB7 #" + x.c.num : ""), /* @__PURE__ */ React.createElement("div", { className: "nb-s" }, isRaw(x.c) ? x.c.condition ? "Raw \xB7 " + x.c.condition : "Raw" : x.c.grade), /* @__PURE__ */ React.createElement("div", { className: "nb-own" }, "Owned by", " ", /* @__PURE__ */ React.createElement("button", { className: "link nb-who", onClick: () => setNav({ section: "collectors", collectorId: x.col.id, focus: "trade-binder" }) }, x.col.short)), x.primary.length > 0 && /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "nb-dem",
      "aria-expanded": openDem === x.cc.id,
      onClick: () => setOpenDem(openDem === x.cc.id ? null : x.cc.id)
    },
    "Primary goal for ",
    x.primary.length === 1 ? x.primary[0].short : `${x.primary.length} collectors`
  ), openDem === x.cc.id && /* @__PURE__ */ React.createElement("div", { className: "nb-dem-who" }, /* @__PURE__ */ React.createElement("span", { className: "nb-dem-l" }, "Wanted by"), x.primary.map((p) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: p.id,
      className: "chip act",
      onClick: () => setNav({ section: "collectors", collectorId: p.id })
    },
    p.short
  ))), x.primary.length === 0 && x.secondary.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "nb-dem2" }, "Secondary goal for ", x.secondary.length === 1 ? x.secondary[0].short : `${x.secondary.length} collectors`), /* @__PURE__ */ React.createElement("div", { className: "nb-sig" }, x.isNew && /* @__PURE__ */ React.createElement("span", { className: "nb-new" }, "New"), x.notReviewed && /* @__PURE__ */ React.createElement("span", { className: "nb-unrev" }, "Not reviewed")), /* @__PURE__ */ React.createElement("div", { className: "nb-act" }, /* @__PURE__ */ React.createElement("button", { className: "btn sm nb-view", onClick: () => setDrawer({ type: "binderCopy", ccId: x.cc.id }) }, "View copy"), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn sm cp-bind-x" + (interestedIn(x.cc.id) ? " on" : ""),
      "aria-pressed": interestedIn(x.cc.id) ? "true" : "false",
      "aria-label": (interestedIn(x.cc.id) ? "Remove your interest in" : "Mark your interest in") + " " + cardShort(x.c) + " owned by " + x.col.short,
      onClick: () => setTradeInterest(x.cc.id, !interestedIn(x.cc.id))
    },
    /* @__PURE__ */ React.createElement("span", { className: "mk", "aria-hidden": "true" }),
    "You\u2019re interested"
  )))))));
}
function CollectorList({ ctx }) {
  const { collectors, collectorFacts, setNav } = ctx;
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(NET_DEFAULT);
  const onHeader = (h) => setSort((s2) => s2.key === h ? { key: h, dir: s2.dir === "desc" ? "asc" : "desc" } : { key: h, dir: "desc" });
  const rows = useMemo(() => {
    let r = collectors.map((c) => ({ c, f: collectorFacts(c.id) }));
    if (q.trim()) {
      const t = q.toLowerCase();
      r = r.filter(({ c }) => (c.name + " " + c.city).toLowerCase().includes(t));
    }
    const col = NET_COLUMNS.find((x) => x.h === sort.key) || NET_COLUMNS[1];
    return [...r].sort(netCompare(col, sort.dir));
  }, [collectors, collectorFacts, q, sort]);
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "panel", style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { className: "ph", style: { gap: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { position: "relative", flex: "0 0 260px" } }, /* @__PURE__ */ React.createElement("span", { style: { position: "absolute", left: 8, top: 7, color: "var(--faint)" } }, /* @__PURE__ */ React.createElement(Icon, { n: "search", s: 14 })), /* @__PURE__ */ React.createElement("input", { className: "inp", style: { paddingLeft: 27 }, placeholder: "Search name or city", value: q, onChange: (e) => setQ(e.target.value) })), /* @__PURE__ */ React.createElement("span", { className: "note" }, q.trim() ? `${rows.length} of ${collectors.length}` : `${collectors.length} collectors`)), /* @__PURE__ */ React.createElement("table", { className: "tbl net-tbl" }, /* @__PURE__ */ React.createElement("colgroup", null, NET_COLUMNS.map((col) => /* @__PURE__ */ React.createElement("col", { key: col.h, className: col.w }))), /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, NET_COLUMNS.map((col) => {
    const on = sort.key === col.h;
    return /* @__PURE__ */ React.createElement(
      "th",
      {
        key: col.h,
        className: "sortable " + col.align,
        "aria-sort": on ? sort.dir === "desc" ? "descending" : "ascending" : "none"
      },
      /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "th-btn" + (on ? " on" : ""),
          onClick: () => onHeader(col.h),
          title: "Sort by " + col.h
        },
        /* @__PURE__ */ React.createElement("span", null, col.h),
        /* @__PURE__ */ React.createElement(SortIndicator, { dir: on ? sort.dir : "desc" })
      )
    );
  }))), /* @__PURE__ */ React.createElement("tbody", null, rows.length === 0 && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: NET_COLUMNS.length, className: "empty" }, "No collectors match that search.")), rows.map(({ c, f }) => {
    return /* @__PURE__ */ React.createElement("tr", { key: c.id }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 9 } }, /* @__PURE__ */ React.createElement("span", { className: "av" }, initials(c.name)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("button", { className: "link", style: { fontWeight: 600 }, onClick: () => setNav({ section: "collectors", collectorId: c.id }) }, c.name), c.pending && /* @__PURE__ */ React.createElement("span", { className: "tag", style: { marginLeft: 6 } }, "Invite pending"), /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11.5 } }, c.city)))), /* @__PURE__ */ React.createElement("td", { className: "ctr" }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5 } }, fmtDate(f.memberSince)), /* @__PURE__ */ React.createElement("div", { className: "faint mono", style: { fontSize: 11 } }, f.memberDays, " ", f.memberDays === 1 ? "day" : "days")), /* @__PURE__ */ React.createElement("td", { className: "ctr mono", style: { fontSize: 13 } }, f.binderNew === 0 ? /* @__PURE__ */ React.createElement("span", { className: "faint" }, "0") : /* @__PURE__ */ React.createElement("span", { className: "net-new" }, f.binderNew)), /* @__PURE__ */ React.createElement("td", { className: "ctr mono", style: { fontSize: 13 } }, f.binderTotal === 0 ? /* @__PURE__ */ React.createElement("span", { className: "faint" }, "0") : f.binderTotal), /* @__PURE__ */ React.createElement("td", { className: "ctr mono", style: { fontSize: 13 } }, f.binderOpen === 0 ? /* @__PURE__ */ React.createElement("span", { className: "faint" }, "0") : f.binderOpen), /* @__PURE__ */ React.createElement("td", { className: "ctr mono", style: { fontSize: 13 } }, f.completedDeals), /* @__PURE__ */ React.createElement("td", { className: "num mono", style: { fontSize: 13 } }, f.completedDeals === 0 ? /* @__PURE__ */ React.createElement("span", { className: "faint" }, "\u2014") : money(f.dealValue)), /* @__PURE__ */ React.createElement("td", { className: "num mono", style: { fontSize: 13 } }, f.coverage == null ? /* @__PURE__ */ React.createElement("span", { className: "faint" }, "\u2014") : Math.round(f.coverage * 100) + "%"));
  })))));
}
function GoalCard({ ctx, g, tier }) {
  const { card, goalMatches, setDrawer, setModal } = ctx;
  const c = card(g.cardId);
  const matches = goalMatches(g);
  const held = matches.length;
  const tenure = daysSince(g.since);
  return /* @__PURE__ */ React.createElement("div", { className: "gc" + (tier === "secondary" ? " sec" : "") }, /* @__PURE__ */ React.createElement(CardImage, { card: c, size: tier === "primary" ? "feature" : "browse" }), /* @__PURE__ */ React.createElement("div", { className: "gc-main" }, /* @__PURE__ */ React.createElement("div", { className: "gc-name" }, c.name, /* @__PURE__ */ React.createElement(CardCopyActions, { ctx, card: c, compact: true, showCert: false })), /* @__PURE__ */ React.createElement("div", { className: "gc-id" }, [c.set, c.num !== "\u2014" ? `#${c.num}` : null, c.print, c.grade, isRaw(c) ? c.condition : null, c.edition !== "Standard" ? c.edition : null].filter(Boolean).join(" \xB7 ")), g.note && /* @__PURE__ */ React.createElement("div", { className: "gc-note" }, g.note), /* @__PURE__ */ React.createElement("div", { className: "gc-meta" }, /* @__PURE__ */ React.createElement("span", null, tier === "primary" ? "Primary" : "Secondary", " for ", tenure, " ", tenure === 1 ? "day" : "days"), held > 0 && /* @__PURE__ */ React.createElement("button", { className: "gc-have", onClick: () => setDrawer({ type: "invItem", invId: matches[0].invId }) }, held === 1 ? "In inventory" : `${held} copies available`))), /* @__PURE__ */ React.createElement("div", { className: "gc-act" }, held > 0 && /* @__PURE__ */ React.createElement("button", { className: "btn sm pri", onClick: () => setModal({ type: "outreach", cardId: c.id, collectorId: g.collectorId, tier: g.tier }) }, "Reach out")));
}
function BinderCard({ ctx, cc }) {
  const { card, setTradeInterest, setDrawer, interestedIn } = ctx;
  const c = card(cc.cardId);
  if (!c) return null;
  const origin = [c.set, c.num && c.num !== "\u2014" ? "#" + c.num : null].filter(Boolean).join(" \xB7 ");
  const spec = [
    isRaw(c) ? "Raw" : c.grade,
    isRaw(c) ? c.condition : null,
    c.print && c.print !== "Normal" ? c.print : null,
    c.edition,
    c.language
  ].filter(Boolean).join(" \xB7 ");
  return /* @__PURE__ */ React.createElement("div", { className: "cp-bind" + (interestedIn(cc.id) ? " on" : "") }, /* @__PURE__ */ React.createElement("div", { className: "cp-bind-art" }, /* @__PURE__ */ React.createElement(CardImage, { card: c, size: "feature" })), /* @__PURE__ */ React.createElement("div", { className: "cp-bind-t", title: cardTitle(c) }, c.name), origin && /* @__PURE__ */ React.createElement("div", { className: "cp-bind-id" }, origin), spec && /* @__PURE__ */ React.createElement("div", { className: "cp-bind-g", title: spec }, spec), /* @__PURE__ */ React.createElement("div", { className: "cp-bind-act" }, /* @__PURE__ */ React.createElement("button", { className: "btn sm cp-bind-view", onClick: () => setDrawer({ type: "binderCopy", ccId: cc.id }) }, "View copy"), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn sm cp-bind-x" + (interestedIn(cc.id) ? " on" : ""),
      "aria-pressed": interestedIn(cc.id) ? "true" : "false",
      onClick: () => setTradeInterest(cc.id, !interestedIn(cc.id))
    },
    /* @__PURE__ */ React.createElement("span", { className: "mk", "aria-hidden": "true" }),
    "Open to trade"
  )));
}
var DEFAULT_BINDER_LIMIT = 10;
function TradeBinder({ ctx, collectorId, sectionRef }) {
  const { collectorCards, card, interestedIn } = ctx;
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(false);
  const binder = useMemo(
    () => collectorCards.filter((cc) => cc.collectorId === collectorId),
    [collectorCards, collectorId]
  );
  const ordered = useMemo(
    () => [...binder].sort((a, b) => (Date.parse(b.addedAt) || 0) - (Date.parse(a.addedAt) || 0)),
    [binder]
  );
  const query = q.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return ordered;
    return ordered.filter((cc) => {
      const c = card(cc.cardId);
      if (!c) return false;
      return [c.name, c.set, c.num].filter(Boolean).join(" ").toLowerCase().includes(query);
    });
  }, [ordered, query, card]);
  const openCount = binder.filter((cc) => interestedIn(cc.id)).length;
  const oversized = binder.length > DEFAULT_BINDER_LIMIT;
  const capped = !query && !expanded && matches.length > DEFAULT_BINDER_LIMIT;
  const shown = capped ? matches.slice(0, DEFAULT_BINDER_LIMIT) : matches;
  const showToggle = oversized && !query;
  return /* @__PURE__ */ React.createElement("div", { className: "cp-sec cp-binder", ref: sectionRef, tabIndex: -1 }, /* @__PURE__ */ React.createElement("div", { className: "cp-sec-h" }, "Trade Binder ", /* @__PURE__ */ React.createElement("span", { className: "mono" }, binder.length), binder.length > 0 && /* @__PURE__ */ React.createElement("span", { className: "cp-bind-open" }, /* @__PURE__ */ React.createElement("span", { className: "mono" }, openCount), " open to trade")), binder.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "cp-empty" }, "No cards shared in their trade binder.") : /* @__PURE__ */ React.createElement(React.Fragment, null, oversized && /* @__PURE__ */ React.createElement("div", { className: "cp-bind-search" }, /* @__PURE__ */ React.createElement("span", { className: "ic" }, /* @__PURE__ */ React.createElement(Icon, { n: "search", s: 14 })), /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "inp",
      type: "search",
      value: q,
      onChange: (e) => setQ(e.target.value),
      "aria-label": "Search trade binder by card name or set",
      placeholder: "Search trade binder..."
    }
  )), matches.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "cp-empty" }, "No cards match your search.") : /* @__PURE__ */ React.createElement("div", { className: "cp-bind-grid" }, shown.map((cc) => /* @__PURE__ */ React.createElement(BinderCard, { key: cc.id, ctx, cc }))), showToggle && /* @__PURE__ */ React.createElement("button", { className: "btn sm cp-bind-more", "aria-expanded": expanded, onClick: () => setExpanded(!expanded) }, expanded ? "Show fewer" : `View all ${binder.length} cards`)), /* @__PURE__ */ React.createElement(SimBlock, { who: ctx.collector(collectorId)?.short }, /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => ctx.setModal({ type: "addBinderCopy", collectorId }) }, "Add a copy to the trade binder")));
}
function BinderCopyDrawer({ ctx, ccId }) {
  const { collectorCards, card, collector, setDrawer, setModal } = ctx;
  const cc = collectorCards.find((x) => x.id === ccId);
  const c = cc && card(cc.cardId);
  if (!cc || !c) return null;
  const col = collector(cc.collectorId);
  return /* @__PURE__ */ React.createElement("div", { className: "ovl", onClick: () => setDrawer(null) }, /* @__PURE__ */ React.createElement("div", { className: "drawer", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "mh" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "disp" }, c.name), /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 12 } }, col?.short, "\u2019s trade binder copy")), /* @__PURE__ */ React.createElement("button", { className: "x", onClick: () => setDrawer(null), "aria-label": "Close" }, /* @__PURE__ */ React.createElement(Icon, { n: "x", s: 15 }))), /* @__PURE__ */ React.createElement("div", { className: "mb" }, /* @__PURE__ */ React.createElement("div", { className: "sect-t" }, "This exact copy"), /* @__PURE__ */ React.createElement("div", { className: "bp-view" }, ["front", "back"].map((side) => /* @__PURE__ */ React.createElement(
    CopyPhoto,
    {
      key: side,
      photo: cc.photos?.[side],
      side,
      size: "lg",
      card: c,
      onOpen: () => setModal({ type: "copyPhoto", photos: cc.photos, cardId: cc.cardId, cert: cc.cert, side })
    }
  ))), /* @__PURE__ */ React.createElement("div", { className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, "Identity"), /* @__PURE__ */ React.createElement("span", { className: "v", style: { fontSize: 11.5 } }, [c.name, c.grade, isRaw(c) ? c.condition : null, c.print, c.edition, c.set + " " + c.num, c.language].filter(Boolean).join(" \xB7 "))), /* @__PURE__ */ React.createElement("div", { className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, "Certification"), /* @__PURE__ */ React.createElement("span", { className: "v", style: { fontSize: 11.5 } }, cc.cert || "not graded")), /* @__PURE__ */ React.createElement("div", { className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, "Shared"), /* @__PURE__ */ React.createElement("span", { className: "v", style: { fontSize: 11.5 } }, fmtDate(String(cc.addedAt).slice(0, 10)))), /* @__PURE__ */ React.createElement(CardCopyActions, { ctx, card: c, copy: cc }))));
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
  const { markBinderReviewed } = ctx;
  useEffect(() => {
    markBinderReviewed(id);
  }, [id, markBinderReviewed]);
  const binderRef = useRef(null);
  useEffect(() => {
    if (nav.focus !== "trade-binder") return;
    const el = binderRef.current;
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start", behavior: "smooth" });
    if (el && typeof el.focus === "function") el.focus({ preventScroll: true });
  }, [nav.focus, id]);
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "cp-wrap" }, /* @__PURE__ */ React.createElement("button", { className: "btn sm", style: { marginBottom: 12 }, onClick: () => setNav({ section: "collectors" }) }, /* @__PURE__ */ React.createElement(Icon, { n: "back", s: 13 }), "All collectors"), /* @__PURE__ */ React.createElement("div", { className: "cp-head" }, /* @__PURE__ */ React.createElement("span", { className: "av lg" }, initials(c.name)), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { className: "cp-id" }, /* @__PURE__ */ React.createElement("div", { className: "cp-idl" }, /* @__PURE__ */ React.createElement("div", { className: "disp cp-name" }, c.name), /* @__PURE__ */ React.createElement("div", { className: "cp-meta" }, c.city), /* @__PURE__ */ React.createElement("div", { className: "cp-meta" }, "Member since ", fmtDate(f.memberSince), " \xB7 ", tenureLabel(f.memberSince))), /* @__PURE__ */ React.createElement("div", { className: "cp-life" }, /* @__PURE__ */ React.createElement("div", { className: "cp-life-i" }, /* @__PURE__ */ React.createElement("div", { className: "cp-life-l" }, "Completed deals"), /* @__PURE__ */ React.createElement("div", { className: "cp-life-v mono" }, f.completedDeals)), /* @__PURE__ */ React.createElement("div", { className: "cp-life-i" }, /* @__PURE__ */ React.createElement("div", { className: "cp-life-l" }, "Deal value"), /* @__PURE__ */ React.createElement("div", { className: "cp-life-v mono" }, f.completedDeals === 0 ? /* @__PURE__ */ React.createElement("span", { className: "faint" }, "\u2014") : money(f.dealValue))), /* @__PURE__ */ React.createElement("div", { className: "cp-life-i" }, /* @__PURE__ */ React.createElement("div", { className: "cp-life-l" }, "Coverage"), /* @__PURE__ */ React.createElement("div", { className: "cp-life-v mono" }, f.coverage == null ? /* @__PURE__ */ React.createElement("span", { className: "faint" }, "\u2014") : Math.round(f.coverage * 100) + "%")))), c.note && /* @__PURE__ */ React.createElement("div", { className: "cp-note" }, c.note), /* @__PURE__ */ React.createElement("div", { className: "cp-prefs" }, c.prefs.map((t) => /* @__PURE__ */ React.createElement("span", { key: t, className: "tag" }, T[t] || t))))), /* @__PURE__ */ React.createElement(TradeBinder, { ctx, collectorId: id, sectionRef: binderRef }), /* @__PURE__ */ React.createElement("div", { className: "cp-sec" }, /* @__PURE__ */ React.createElement("div", { className: "cp-sec-h" }, "Primary Goals ", /* @__PURE__ */ React.createElement("span", { className: "mono" }, s.primary.length)), s.primary.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "cp-empty" }, "No primary goals set.") : s.primary.map((g) => /* @__PURE__ */ React.createElement(GoalCard, { key: g.id, ctx, g, tier: "primary" }))), s.secondary.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "cp-sec" }, /* @__PURE__ */ React.createElement("button", { className: "cp-sec-h as-btn", onClick: () => setShowSec(!showSec), "aria-expanded": showSec }, "Secondary Goals ", /* @__PURE__ */ React.createElement("span", { className: "mono" }, s.secondary.length), /* @__PURE__ */ React.createElement("span", { className: "cp-chev", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { n: "chev", s: 12 }))), showSec && s.secondary.map((g) => /* @__PURE__ */ React.createElement(GoalCard, { key: g.id, ctx, g, tier: "secondary" }))), active.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "cp-sec" }, /* @__PURE__ */ React.createElement("div", { className: "cp-sec-h" }, "Active Opportunities ", /* @__PURE__ */ React.createElement("span", { className: "mono" }, active.length)), active.map((o) => {
    const oc = card(o.cardId);
    const na = nextAction(o);
    return /* @__PURE__ */ React.createElement("div", { key: o.id, className: "cp-opp" }, /* @__PURE__ */ React.createElement(CardImage, { card: oc, size: "thumbnail" }), /* @__PURE__ */ React.createElement("div", { className: "cp-opp-main" }, /* @__PURE__ */ React.createElement("div", { className: "cp-opp-t" }, oc.name, " \u2014 ", oc.set), /* @__PURE__ */ React.createElement("div", { className: "cp-opp-s" }, STAGE_LABEL[o.stage], na.owner && /* @__PURE__ */ React.createElement("span", { className: "faint" }, " \xB7 Next step: ", nextStepLabel(na.owner)))), /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => setDrawer({ type: "workspace", oppId: o.id }) }, "Open"));
  })), /* @__PURE__ */ React.createElement("div", { className: "cp-sec" }, /* @__PURE__ */ React.createElement("button", { className: "cp-sec-h as-btn", onClick: () => setShowHist(!showHist), "aria-expanded": showHist }, "History", /* @__PURE__ */ React.createElement("span", { className: "cp-chev", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { n: "chev", s: 12 }))), /* @__PURE__ */ React.createElement("div", { className: "cp-hist-sum" }, f.completedDeals === 0 ? "No completed deals yet." : `${f.completedDeals} completed deal${f.completedDeals === 1 ? "" : "s"} \xB7 ${money(f.dealValue)} total`), showHist && (acts.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "cp-empty" }, "Nothing logged yet.") : /* @__PURE__ */ React.createElement("div", { className: "cp-acts" }, acts.map((a) => /* @__PURE__ */ React.createElement("div", { key: a.id, className: "cp-act" }, /* @__PURE__ */ React.createElement("span", { className: "cp-act-d mono" }, fmtDate(a.date)), /* @__PURE__ */ React.createElement("span", null, a.text))))))));
}
function Modal({ title, sub, onClose, children, footer, width }) {
  return /* @__PURE__ */ React.createElement("div", { className: "ovl", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "modal", style: width ? { width } : void 0, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "mh" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "disp" }, title), sub && /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 12 } }, sub)), /* @__PURE__ */ React.createElement("button", { className: "x", onClick: onClose, "aria-label": "Close" }, /* @__PURE__ */ React.createElement(Icon, { n: "x", s: 15 }))), /* @__PURE__ */ React.createElement("div", { className: "mb" }, children), /* @__PURE__ */ React.createElement("div", { className: "mf" }, footer)));
}
var ALL_TAGS = Object.keys(T);
function CopyFields({ d, set, costError, showCert = true }) {
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Cost"), /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "inp",
      type: "number",
      min: "0",
      step: "0.01",
      inputMode: "decimal",
      value: d.cost,
      onChange: (e) => set("cost", e.target.value),
      placeholder: "0.00",
      autoFocus: true
    }
  ), /* @__PURE__ */ React.createElement("span", { className: "faint", style: { fontSize: 10.5 } }, costError ? /* @__PURE__ */ React.createElement("span", { style: { color: "var(--danger)" } }, "Cost can't be negative.") : "What you paid for this item.")), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } }, /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Ask price"), /* @__PURE__ */ React.createElement("input", { className: "inp", type: "number", min: "0", step: "1", value: d.ask, onChange: (e) => set("ask", e.target.value) })), /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Acquired on"), /* @__PURE__ */ React.createElement("input", { className: "inp", type: "date", value: d.acquired, onChange: (e) => set("acquired", e.target.value) }))), showCert && /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Certification number"), /* @__PURE__ */ React.createElement("input", { className: "inp", value: d.cert, onChange: (e) => set("cert", e.target.value), placeholder: "optional" })));
}
function CanonicalIdentity({ c, note, onChange }) {
  return /* @__PURE__ */ React.createElement("div", { className: "ac-id" }, /* @__PURE__ */ React.createElement("div", { className: "ac-id-head" }, /* @__PURE__ */ React.createElement("div", { className: "sect-t", style: { margin: 0 } }, "Card"), onChange && /* @__PURE__ */ React.createElement("button", { className: "link", style: { fontSize: 11.5 }, onClick: onChange }, "Change card")), /* @__PURE__ */ React.createElement("div", { className: "ac-id-t" }, c.name), /* @__PURE__ */ React.createElement("div", { className: "ac-id-s" }, [c.grade, isRaw(c) ? c.condition : null, c.print, c.edition, `${c.set} ${c.num}`, c.language].filter(Boolean).join(" \xB7 ")), note && /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 10.5, marginTop: 4 } }, note));
}
var optionalMoneyState = (raw) => {
  const entered = String(raw ?? "").trim() !== "";
  const n = Number(raw);
  return { entered, error: entered && !(isFinite(n) && n >= 0) };
};
function searchCards(cards, query) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored = [];
  for (const c of cards) {
    const name = String(c.name).toLowerCase();
    const hay = [c.name, c.set, c.num, c.year, c.grade, c.edition, c.print, c.language].filter(Boolean).join(" ").toLowerCase();
    if (!terms.every((t) => hay.includes(t))) continue;
    const inName = terms.filter((t) => name.includes(t)).length;
    scored.push({ c, inName, pos: name.indexOf(terms[0]) });
  }
  return scored.sort((a, b) => b.inName - a.inName || (a.pos < 0 ? 99 : a.pos) - (b.pos < 0 ? 99 : b.pos) || a.c.name.localeCompare(b.c.name) || a.c.set.localeCompare(b.c.set)).map((x) => x.c);
}
function AddInventoryModal({ ctx }) {
  const { catalog, inventory, card, resolveCanonicalCard, addCopyToInventory, setModal } = ctx;
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(null);
  const [d, setD] = useState({
    edition: "",
    grade: "",
    condition: "",
    cert: "",
    cost: "",
    ask: "",
    acquired: TODAY.toISOString().slice(0, 10)
  });
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const results = useMemo(() => searchCards(catalog, q), [catalog, q]);
  const editions = picked ? [...new Set(picked.variants.map((v) => v.edition))] : [];
  const edition = editions.length === 1 ? editions[0] : d.edition;
  const isRawPick = d.grade === "Raw";
  const copy = { edition, grade: d.grade, condition: isRawPick ? d.condition : null };
  const identityResolved = !!picked && !!edition && !!d.grade && (!isRawPick || !!d.condition);
  const cost = optionalMoneyState(d.cost);
  const ask = optionalMoneyState(d.ask);
  const canAdd = identityResolved && !cost.error && !ask.error;
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
    setD((x) => ({ ...x, edition: eds.length === 1 ? eds[0] : "" }));
  };
  const submit = () => {
    const resolved = resolveCanonicalCard(picked, copy);
    addCopyToInventory(
      resolved.id,
      { cost: d.cost, ask: d.ask, acquired: d.acquired, cert: isRawPick ? "" : d.cert },
      resolved.card
    );
  };
  const held = heldMatching();
  return /* @__PURE__ */ React.createElement(
    Modal,
    {
      title: "Add Inventory",
      sub: picked ? `${picked.name} \xB7 ${picked.set} ${picked.num}` : "Find the printed card, then describe your copy.",
      onClose: () => setModal(null),
      width: 560,
      footer: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: () => setModal(null) }, "Cancel"), picked && /* @__PURE__ */ React.createElement("button", { className: "btn pri", disabled: !canAdd, onClick: submit }, "Add to Inventory"))
    },
    !picked ? (
      /* The search field is the whole interaction. No label, no instructions, and
         no results container until there is something to put in it. */
      /* @__PURE__ */ React.createElement("div", { className: "ai-search-state" + (q.trim() === "" ? " quiet" : "") }, /* @__PURE__ */ React.createElement("div", { className: "ai-field" }, /* @__PURE__ */ React.createElement("span", { className: "ai-field-i", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { n: "search", s: 16 })), /* @__PURE__ */ React.createElement(
        "input",
        {
          className: "ai-input",
          value: q,
          autoFocus: true,
          type: "search",
          onChange: (e) => setQ(e.target.value),
          "aria-label": "Search cards by name, set, or number",
          placeholder: "Search by card name, set, or number..."
        }
      )), q.trim() === "" ? null : results.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "ai-none" }, /* @__PURE__ */ React.createElement("div", { className: "ai-none-t" }, "No cards found"), /* @__PURE__ */ React.createElement("div", { className: "ai-none-s" }, "Try a card name, set, or number.")) : /* @__PURE__ */ React.createElement("div", { className: "ai-results" }, results.slice(0, 40).map((c) => /* @__PURE__ */ React.createElement("button", { key: printIdentityKey(c), className: "ai-row", onClick: () => choose(c) }, /* @__PURE__ */ React.createElement(CardImage, { card: c, size: "browse" }), /* @__PURE__ */ React.createElement("span", { className: "ai-main" }, /* @__PURE__ */ React.createElement("span", { className: "ai-name" }, c.name), /* @__PURE__ */ React.createElement("span", { className: "ai-sub" }, [c.set, c.num, c.year].filter(Boolean).join(" \xB7 ")), /* @__PURE__ */ React.createElement("span", { className: "ai-var" }, [c.print, c.language].filter(Boolean).join(" \xB7 "))))), results.length > 40 && /* @__PURE__ */ React.createElement("div", { className: "ai-hint" }, "Showing 40 of ", results.length, ". Add another term to narrow.")))
    ) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "ac-id" }, /* @__PURE__ */ React.createElement("div", { className: "ac-id-head" }, /* @__PURE__ */ React.createElement("div", { className: "sect-t", style: { margin: 0 } }, "Printed card"), /* @__PURE__ */ React.createElement("button", { className: "link", style: { fontSize: 11.5 }, onClick: () => setPicked(null) }, "Change card")), /* @__PURE__ */ React.createElement("div", { className: "cimg-row", style: { alignItems: "flex-start", gap: 12 } }, /* @__PURE__ */ React.createElement(CardImage, { card: picked, size: "feature" }), /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { className: "ac-id-t" }, picked.name), /* @__PURE__ */ React.createElement("div", { className: "ac-id-s" }, [picked.set, `#${picked.num}`, picked.print].join(" \xB7 "))))), editions.length > 1 && /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Edition ", /* @__PURE__ */ React.createElement("b", { className: "req" }, "*")), /* @__PURE__ */ React.createElement("div", { className: "seg" }, editions.map((e) => /* @__PURE__ */ React.createElement("button", { key: e, className: "seg-b" + (d.edition === e ? " on" : ""), onClick: () => set("edition", e) }, e)))), /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "PSA Grade ", /* @__PURE__ */ React.createElement("b", { className: "req" }, "*")), /* @__PURE__ */ React.createElement("div", { className: "gradepick" }, GRADED_VALUES.map((g) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: g,
        className: "seg-b" + (d.grade === g ? " on" : "") + (g === "Raw" ? " wide" : ""),
        onClick: () => set("grade", g)
      },
      g === "Raw" ? "Raw" : g.replace("PSA ", "")
    ))), /* @__PURE__ */ React.createElement("span", { className: "faint", style: { fontSize: 10.5 } }, d.grade ? isRawPick ? "Ungraded \u2014 choose a condition below." : "PSA is the only company supported today." : "Choose the grade of the copy you acquired.")), isRawPick && /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Condition ", /* @__PURE__ */ React.createElement("b", { className: "req" }, "*")), /* @__PURE__ */ React.createElement("div", { className: "seg" }, CONDITION_VALUES.map((c) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: c,
        className: "seg-b" + (d.condition === c ? " on" : ""),
        onClick: () => set("condition", c)
      },
      c
    )))), d.grade && !isRawPick && /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Certification number ", /* @__PURE__ */ React.createElement("span", { className: "opt" }, "optional")), /* @__PURE__ */ React.createElement("input", { className: "inp", value: d.cert, onChange: (e) => set("cert", e.target.value) })), held != null && held > 0 && /* @__PURE__ */ React.createElement("div", { className: "ai-held-note" }, "You currently hold ", held, " matching cop", held === 1 ? "y" : "ies", ". This adds another."), /* @__PURE__ */ React.createElement("div", { className: "sect-t", style: { marginTop: 4 } }, "Acquisition"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } }, /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Acquisition cost ", /* @__PURE__ */ React.createElement("span", { className: "opt" }, "optional")), /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "inp",
        type: "number",
        min: "0",
        step: "0.01",
        inputMode: "decimal",
        value: d.cost,
        onChange: (e) => set("cost", e.target.value),
        placeholder: "0.00"
      }
    ), /* @__PURE__ */ React.createElement("span", { className: "faint", style: { fontSize: 10.5 } }, cost.error ? /* @__PURE__ */ React.createElement("span", { style: { color: "var(--danger)" } }, "Cost can't be negative.") : "What you paid.")), /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Listing price ", /* @__PURE__ */ React.createElement("span", { className: "opt" }, "optional")), /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "inp",
        type: "number",
        min: "0",
        step: "1",
        inputMode: "decimal",
        value: d.ask,
        onChange: (e) => set("ask", e.target.value),
        placeholder: "0"
      }
    ), /* @__PURE__ */ React.createElement("span", { className: "faint", style: { fontSize: 10.5 } }, ask.error ? /* @__PURE__ */ React.createElement("span", { style: { color: "var(--danger)" } }, "Listing price can't be negative.") : "What you're asking."))), /* @__PURE__ */ React.createElement("label", { className: "fld fld-sub" }, /* @__PURE__ */ React.createElement("span", null, "Acquired on ", /* @__PURE__ */ React.createElement("span", { className: "opt" }, "optional")), /* @__PURE__ */ React.createElement("input", { className: "inp", type: "date", value: d.acquired, onChange: (e) => set("acquired", e.target.value) })), !identityResolved && /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11 } }, editions.length > 1 && !d.edition ? "Choose an edition to continue." : !d.grade ? "Choose a grade to continue." : "Choose a condition to continue."))
  );
}
function AddBinderCopyModal({ ctx, collectorId }) {
  const { catalog, collector, collectorAddBinderCard, setModal } = ctx;
  const [cardId, setCardId] = useState("");
  const [market, setMarket] = useState("");
  const [photos, setPhotos] = useState({ front: null, back: null });
  const col = collector(collectorId);
  const c = catalog.find((x) => x.id === cardId);
  const ready = !!cardId && hasBothPhotos(photos);
  const capture = (side) => setPhotos((p) => ({ ...p, [side]: "binder:" + (cardId || "new") + ":" + side }));
  return /* @__PURE__ */ React.createElement(
    Modal,
    {
      title: "Add a copy to the trade binder",
      width: 520,
      sub: `Demo control \xB7 simulating ${col?.short}`,
      onClose: () => setModal(null),
      footer: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: () => setModal(null) }, "Cancel"), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "btn pri",
          disabled: !ready,
          onClick: () => {
            if (collectorAddBinderCard(collectorId, cardId, market, photos, c?.grade && !isRaw(c) ? c.cert || null : null)) setModal(null);
          }
        },
        "Add to Trade Binder"
      ))
    },
    /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Card"), /* @__PURE__ */ React.createElement("select", { className: "inp", value: cardId, onChange: (e) => setCardId(e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Choose a card\u2026"), catalog.map((x) => /* @__PURE__ */ React.createElement("option", { key: x.id, value: x.id }, cardTitle(x))))),
    /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Their value ", /* @__PURE__ */ React.createElement("span", { className: "opt" }, "optional")), /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "inp",
        type: "text",
        inputMode: "decimal",
        value: market,
        onChange: (e) => setMarket(e.target.value.replace(/[^\d.]/g, "")),
        placeholder: "0"
      }
    )),
    /* @__PURE__ */ React.createElement("div", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Photos of this copy"), /* @__PURE__ */ React.createElement("div", { className: "bp-req" }, ["front", "back"].map((side) => /* @__PURE__ */ React.createElement("div", { key: side, className: "bp-slot" }, /* @__PURE__ */ React.createElement(CopyPhoto, { photo: photos[side], side, size: "md" }), /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => capture(side) }, photos[side] ? "Replace" : "Add " + side), /* @__PURE__ */ React.createElement("span", { className: "bp-flag" + (photos[side] ? " ok" : "") }, photos[side] ? "On file" : "Required")))), /* @__PURE__ */ React.createElement("span", { className: "faint", style: { fontSize: 11 } }, "A trade binder copy needs both faces so the Trusted Partner can evaluate it without asking for photos mid-deal."))
  );
}
function AddCopyModal({ ctx, cardId }) {
  const { card, addCopyToInventory, setModal } = ctx;
  const c = card(cardId);
  const [d, setD] = useState({ cost: "", ask: String(c.value), acquired: TODAY.toISOString().slice(0, 10), cert: "" });
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const cost = optionalMoneyState(d.cost);
  const ask = optionalMoneyState(d.ask);
  return /* @__PURE__ */ React.createElement(
    Modal,
    {
      title: "Add to Inventory",
      sub: cardTitle(c),
      onClose: () => setModal(null),
      width: 520,
      footer: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: () => setModal(null) }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "btn pri", disabled: cost.error || ask.error, onClick: () => addCopyToInventory(cardId, d) }, "Add to Inventory"))
    },
    /* @__PURE__ */ React.createElement(CanonicalIdentity, { c, note: "From the recommendation. Identity comes from the card and can't be edited here." }),
    /* @__PURE__ */ React.createElement(CopyFields, { d, set, costError: cost.error })
  );
}
function CardModal({ ctx, invId }) {
  const { inventory, card, saveCard, setModal } = ctx;
  const inv = invId ? inventory.find((i) => i.invId === invId) : null;
  const existing = inv ? card(inv.cardId) : null;
  if (!inv || !existing) return null;
  const [d, setD] = useState(() => ({ ...existing, ask: inv.ask, cost: inv.cost }));
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const toggleTag = (t) => setD((x) => ({ ...x, tags: x.tags.includes(t) ? x.tags.filter((y) => y !== t) : [...x.tags, t] }));
  const valid = d.name.trim() && d.set.trim() && (d.grade !== "Raw" || !!d.condition);
  return /* @__PURE__ */ React.createElement(
    Modal,
    {
      title: "Edit card",
      sub: "Tags drive preference matching across your network",
      onClose: () => setModal(null),
      footer: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: () => setModal(null) }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "btn pri", disabled: !valid, onClick: () => saveCard({ ...d, value: Number(d.value) || Number(d.ask) || 0, ask: Number(d.ask) || 0, cost: Number(d.cost) || 0, year: Number(d.year) }, invId) }, "Save changes"))
    },
    /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Card name"), /* @__PURE__ */ React.createElement("input", { className: "inp", value: d.name, onChange: (e) => set("name", e.target.value), placeholder: "Charizard" })),
    /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Set"), /* @__PURE__ */ React.createElement("input", { className: "inp", value: d.set, onChange: (e) => set("set", e.target.value), placeholder: "Base Set Shadowless" })),
    /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 } }, /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Number"), /* @__PURE__ */ React.createElement("input", { className: "inp", value: d.num, onChange: (e) => set("num", e.target.value), placeholder: "4/102" })), /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Year"), /* @__PURE__ */ React.createElement("input", { className: "inp", type: "number", value: d.year, onChange: (e) => set("year", e.target.value) })), /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Graded"), /* @__PURE__ */ React.createElement("select", { className: "inp", value: d.grade, onChange: (e) => set("grade", e.target.value) }, GRADED_VALUES.map((g) => /* @__PURE__ */ React.createElement("option", { key: g }, g))))),
    /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 } }, /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Print"), /* @__PURE__ */ React.createElement("select", { className: "inp", value: d.print, onChange: (e) => set("print", e.target.value) }, PRINT_VALUES.map((v) => /* @__PURE__ */ React.createElement("option", { key: v }, v)))), /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Edition"), /* @__PURE__ */ React.createElement("select", { className: "inp", value: d.edition, onChange: (e) => set("edition", e.target.value) }, ["Unlimited", "1st Edition", "Shadowless", "No Rarity", "Standard"].map((v) => /* @__PURE__ */ React.createElement("option", { key: v }, v)))), /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Language"), /* @__PURE__ */ React.createElement("select", { className: "inp", value: d.language, onChange: (e) => set("language", e.target.value) }, ["English", "Japanese"].map((v) => /* @__PURE__ */ React.createElement("option", { key: v }, v))))),
    d.grade === "Raw" && /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Condition (required for raw cards)"), /* @__PURE__ */ React.createElement("select", { className: "inp", value: d.condition || "", onChange: (e) => set("condition", e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Select a condition"), CONDITION_VALUES.map((v) => /* @__PURE__ */ React.createElement("option", { key: v }, v)))),
    /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } }, /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Your cost"), /* @__PURE__ */ React.createElement("input", { className: "inp", type: "number", value: d.cost, onChange: (e) => set("cost", e.target.value) })), /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Ask price"), /* @__PURE__ */ React.createElement("input", { className: "inp", type: "number", value: d.ask, onChange: (e) => set("ask", e.target.value) }))),
    /* @__PURE__ */ React.createElement("div", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Attributes"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 5 } }, ALL_TAGS.map((t) => /* @__PURE__ */ React.createElement("button", { key: t, className: "btn sm" + (d.tags.includes(t) ? " on" : ""), onClick: () => toggleTag(t) }, T[t]))))
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
  const defaultMsg = chosen ? held ? `Hi ${collector(chosen.collectorId).name.split(" ")[0]} \u2014 you have ${chosen.tier === "primary" ? "a primary goal" : "a secondary goal"} for ${cardShort(c)}. I have a ${c.grade} copy in hand and wanted you to see it first.` : `Hi ${collector(chosen.collectorId).name.split(" ")[0]} \u2014 I saw ${cardShort(c)} on your goals. I don't have one right now, but I'll keep an eye out and let you know if I can source it.` : "";
  return /* @__PURE__ */ React.createElement(
    Modal,
    {
      title: "Reach out",
      sub: "Every conversation starts from a card and the goal it answers",
      onClose: () => setModal(null),
      width: 540,
      footer: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: () => setModal(null) }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "btn pri", disabled: !chosen, onClick: () => startOutreach(chosen.collectorId, cardId, chosen.tier, msg || defaultMsg) }, /* @__PURE__ */ React.createElement(Icon, { n: "send", s: 13 }), "Send message"))
    },
    /* @__PURE__ */ React.createElement("div", { style: { background: "#F7F9FA", border: "1px solid var(--line)", borderRadius: 4, padding: 11, marginBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", fontFamily: "Archivo", fontWeight: 600 } }, "Inventory card"), /* @__PURE__ */ React.createElement("div", { className: "disp", style: { fontSize: 14, fontWeight: 600, marginTop: 2 } }, cardTitle(c))),
    /* @__PURE__ */ React.createElement("div", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Which goal is this conversation about?"), candidates.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "empty" }, "No collector has a goal for this card. Outreach needs a goal to stand on."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, candidates.map((g) => /* @__PURE__ */ React.createElement("button", { key: g.id, onClick: () => setPick(g.id), style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      textAlign: "left",
      padding: "9px 11px",
      borderRadius: 4,
      border: "1px solid " + (pick === g.id ? "var(--t1)" : "var(--line)"),
      background: pick === g.id ? "var(--t1-bg)" : "#FFF"
    } }, /* @__PURE__ */ React.createElement("span", { className: "av" }, initials(collector(g.collectorId).name)), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: 12.5 } }, collector(g.collectorId).name), /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11.5 } }, g.note || "No note on this goal")), /* @__PURE__ */ React.createElement("span", { className: "t-pill " + (g.tier === "primary" ? "p1" : "p2") }, g.tier))))),
    chosen && /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Message"), /* @__PURE__ */ React.createElement("textarea", { className: "inp", rows: 4, value: msg, placeholder: defaultMsg, onChange: (e) => setMsg(e.target.value) })),
    /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11.5 } }, "This logs the outreach on their timeline. It does not move the opportunity \u2014 only the collector can open a negotiation by making an offer.")
  );
}
function InviteModal({ ctx }) {
  const { setModal, inviteCollector } = ctx;
  const [d, setD] = useState({ name: "", email: "", city: "", note: "", prefs: [] });
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const toggle = (t) => setD((x) => ({ ...x, prefs: x.prefs.includes(t) ? x.prefs.filter((y) => y !== t) : [...x.prefs, t] }));
  const valid = d.name.trim() && d.email.includes("@");
  return /* @__PURE__ */ React.createElement(
    Modal,
    {
      title: "Invite a collector",
      sub: "They set their own goals once they join \u2014 you set the starting context",
      onClose: () => setModal(null),
      footer: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: () => setModal(null) }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "btn pri", disabled: !valid, onClick: () => inviteCollector(d) }, "Send invitation"))
    },
    /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Name"), /* @__PURE__ */ React.createElement("input", { className: "inp", value: d.name, onChange: (e) => set("name", e.target.value), placeholder: "Jordan Pierce" })),
    /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Email"), /* @__PURE__ */ React.createElement("input", { className: "inp", value: d.email, onChange: (e) => set("email", e.target.value), placeholder: "jordan@example.com" })),
    /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "City"), /* @__PURE__ */ React.createElement("input", { className: "inp", value: d.city, onChange: (e) => set("city", e.target.value), placeholder: "Madison, WI" })),
    /* @__PURE__ */ React.createElement("div", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "What you already know they collect"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 5 } }, ALL_TAGS.map((t) => /* @__PURE__ */ React.createElement("button", { key: t, className: "btn sm" + (d.prefs.includes(t) ? " on" : ""), onClick: () => toggle(t) }, T[t])))),
    /* @__PURE__ */ React.createElement("label", { className: "fld" }, /* @__PURE__ */ React.createElement("span", null, "Note"), /* @__PURE__ */ React.createElement("textarea", { className: "inp", rows: 3, value: d.note, onChange: (e) => set("note", e.target.value), placeholder: "Met at the Chicago show. Chasing Neo holos." }))
  );
}
function ArchiveModal({ ctx, invId }) {
  const { inventory, card, collector, archiveRisk, archiveInv, setModal } = ctx;
  const inv = inventory.find((i) => i.invId === invId);
  const c = card(inv.cardId);
  const { open, primary } = archiveRisk(inv.cardId);
  const inDeal = open.filter((o) => ["deal", "fulfillment"].includes(o.stage));
  return /* @__PURE__ */ React.createElement(
    Modal,
    {
      title: "Archive this card?",
      sub: cardTitle(c),
      onClose: () => setModal(null),
      width: 520,
      footer: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: () => setModal(null) }, "Keep in inventory"), /* @__PURE__ */ React.createElement("button", { className: "btn dgr", style: { borderColor: "var(--danger)" }, onClick: () => archiveInv(invId, true) }, "Archive anyway"))
    },
    /* @__PURE__ */ React.createElement("div", { style: { background: "var(--danger-bg)", border: "1px solid #E8CBC9", borderRadius: 4, padding: 12, marginBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: 12.5, color: "var(--danger)" } }, inDeal.length > 0 ? `This card is inside ${inDeal.length} active deal${inDeal.length === 1 ? "" : "s"}.` : open.length > 0 ? `This card has ${open.length} open opportunit${open.length === 1 ? "y" : "ies"}.` : `This card fills ${primary.length} primary goal${primary.length === 1 ? "" : "s"}.`), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, marginTop: 4 } }, "Archiving removes it from matching and coverage immediately. Open opportunities stay on your board pointing at a card you no longer hold.")),
    open.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "sect-t" }, "Open opportunities"), open.map((o) => /* @__PURE__ */ React.createElement("div", { key: o.id, className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, collector(o.collectorId).name), /* @__PURE__ */ React.createElement("span", { className: "v", style: { fontSize: 12 } }, STAGE_LABEL[o.stage], " \xB7 ", money(oppValue(o)))))),
    primary.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "sect-t", style: { marginTop: 14 } }, "Primary goals this card fills"), primary.map((g) => /* @__PURE__ */ React.createElement("div", { key: g.id, className: "kv" }, /* @__PURE__ */ React.createElement("span", { className: "k" }, collector(g.collectorId).name), /* @__PURE__ */ React.createElement("span", { className: "v", style: { fontSize: 12 } }, g.note || "no note")))),
    /* @__PURE__ */ React.createElement("div", { className: "faint", style: { fontSize: 11.5, marginTop: 14 } }, "No one is notified. Collectors won't see that this card left your inventory, and their goals stay exactly as they set them.")
  );
}

// collector/MetYetCollector.jsx
var D = __toESM(require_metyet_domain());
var E = __toESM(require_metyet_entities());
var import_metyet_store2 = __toESM(require_metyet_store());
var import_collector_view = __toESM(require_collector_view());

var SELF_COLLECTOR = "c12";
var TODAY2 = /* @__PURE__ */ new Date("2026-08-14T12:00:00Z");
var AT = "2026-08-14";
var money2 = (n) => n == null || !isFinite(n) ? "\u2014" : (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
var pct2 = (f) => f == null ? "\u2014" : Math.round(f * 100) + "%";
var daysSince2 = (d) => Math.max(0, Math.round((TODAY2 - /* @__PURE__ */ new Date(d + "T12:00:00Z")) / 864e5));
var ago2 = (d) => {
  const n = daysSince2(d);
  if (n === 0) return "today";
  if (n === 1) return "yesterday";
  if (n < 30) return `${n} days ago`;
  const m = Math.round(n / 30);
  return m < 12 ? `${m} month${m === 1 ? "" : "s"} ago` : `${Math.round(n / 365)} yr ago`;
};
var fmtDate2 = (d) => (/* @__PURE__ */ new Date(d + "T12:00:00Z")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
var gradeLine = (c) => D.isRaw(c) ? c.condition ? `Raw \xB7 ${c.condition}` : "Raw" : c.grade;
var cardLine = (c) => [c.set, c.num && c.num !== "\u2014" ? `#${c.num}` : null].filter(Boolean).join(" \xB7 ");
var cardFull = (c) => [
  c.name,
  c.set,
  c.num !== "\u2014" ? c.num : null,
  c.print,
  c.edition,
  c.language,
  gradeLine(c)
].filter(Boolean).join(" \xB7 ");
var artUrl = (id) => {
  if (!id) return null;
  const i = id.lastIndexOf("-");
  return `https://images.pokemontcg.io/${id.slice(0, i)}/${id.slice(i + 1)}_hires.png`;
};
var lastEntry3 = D.lastEntry;
var marketSettled = (c) => c.agreedMarket != null;
var GOAL_STATE = { seeking: "Seeking", negotiating: "Negotiating", satisfied: "Satisfied" };
var PREF_LABEL = {
  "base-set": "Base Set",
  "eeveelution": "Eeveelutions",
  "holo": "Holos",
  "first-edition": "1st Edition",
  "neo": "Neo era",
  "team-rocket": "Team Rocket",
  "fossil": "Fossil",
  "jungle": "Jungle",
  "modern": "Modern",
  "alt-art": "Alt art",
  "gold-star": "Gold Star",
  "promo": "Promos",
  "charizard": "Charizard"
};
var acceptedCards = D.acceptedTradeCards;
var cardSettled2 = D.cardSettled;
var tradeValue = D.tradeValueOf;
var totalTradeValue2 = D.totalTradeValue;
var calcBalance = D.calculatedBalance;
var finalBalance2 = D.finalBalance;
var isOpen = D.isActive;
var STAGES3 = D.STAGES;
var STAGE_IX2 = D.STAGE_IX;
var STAGE = Object.fromEntries(D.STAGES.map((s) => [s.id, s]));
var STAGE_BLURB = {
  secondary: "On your list, not actively chasing.",
  primary: "You're actively looking for this one.",
  "agree-price": "Settling what the card costs.",
  "select-trade": "Choosing which of your cards to put toward it.",
  "value-trade": "Agreeing what your cards are worth in this trade.",
  deal: "Checking the numbers before either of you commits.",
  fulfillment: "Arranging the handoff.",
  completed: "Done."
};
var CSS2 = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Public+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

.mc {
  --bg: #F7F8FA;
  --panel: #FFFFFF;
  --line: #E4E8ED;
  --line-soft: #F0F3F6;
  --text: #131922;
  --muted: #616B7A;
  --faint: #8B95A3;
  --t1: #0B5D66;
  --t2: #4E8C93;
  --t1-bg: #E6F0F1;
  --accent: #6C5CE0;
  --accent-bg: #F0EDFC;
  --amber: #9A6408;
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
.disp { font-family: 'Archivo', system-ui, sans-serif; letter-spacing: -0.015em; }
.mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }

/* ---- page shell: generous, single column, mobile-first ---- */
.pg { max-width: 580px; margin: 0 auto; padding: 26px 18px 10px; }
.pg-h { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 24px; }
.pg-t { font-size: 31px; font-weight: 700; line-height: 1.08; letter-spacing: -.025em; }
.pg-s { font-size: 14px; color: var(--muted); margin-top: 4px; }
.pg-act { margin-left: auto; display: flex; gap: 8px; align-items: center; }

/* ---- primitives, shared in spirit with the TP app ---- */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  border: 1px solid var(--line); background: #FFF; border-radius: 11px;
  padding: 12px 17px; font-size: 14px; font-weight: 600; transition: all .14s ease;
  box-shadow: 0 1px 2px rgba(15,19,27,.05); }
.btn:active { transform: translateY(1px); }
.btn:hover { border-color: #C9D2DB; }
.btn.pri { background: var(--accent); border-color: var(--accent); color: #FFF;
  box-shadow: 0 2px 8px rgba(108,92,224,.28); }
.btn.pri:hover { background: #5B4BD0; }
.btn.deep { background: var(--t1); border-color: var(--t1); color: #FFF;
  box-shadow: 0 2px 8px rgba(11,93,102,.24); }
.btn.wide { width: 100%; }
.btn.sm { padding: 7px 12px; font-size: 13px; border-radius: 8px; }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.inp { width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px;
  font: inherit; font-size: 16px; background: #FFF; }
.inp:focus { outline: none; border-color: var(--t2); box-shadow: 0 0 0 3px var(--t1-bg); }
.chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px;
  border-radius: 999px; font-size: 12px; background: var(--line-soft); color: var(--muted); }
.chip.t { background: var(--t1-bg); color: var(--t1); font-weight: 600; }
.chip.a { background: var(--accent-bg); color: var(--accent); font-weight: 600; }
.link { background: none; border: 0; padding: 0; color: var(--t1); font-weight: 500; text-decoration: none; }
.link:hover { text-decoration: underline; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 18px;
  box-shadow: 0 1px 2px rgba(15,19,27,.04), 0 6px 18px rgba(15,19,27,.05); }
.muted { color: var(--muted); } .faint { color: var(--faint); }
.empty { text-align: center; color: var(--faint); font-size: 14px; padding: 34px 16px; }

/* ---- card artwork: the largest thing on any screen ---- */
.art { border-radius: 9px; flex: 0 0 auto; object-fit: contain; background: transparent;
  filter: drop-shadow(0 3px 10px rgba(15,19,27,.16)); }
/* the fallback keeps the exact footprint, so a late image causes no shift */
.art.ph { display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px; padding: 8px; text-align: center; overflow: hidden; filter: none;
  background: #EEF1F4; border: 1px solid var(--line); }
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
.tier.p { background: var(--accent-bg); color: var(--accent); }
.tier.s { background: var(--line-soft); color: var(--muted); }
.goal-n { font-size: 23px; font-weight: 700; line-height: 1.12; margin-top: 11px; letter-spacing: -.02em; }
.goal-i { font-size: 14px; color: var(--muted); margin-top: 4px; }
.goal-avail { font-size: 14px; margin-top: 12px; }
.faces { display: flex; align-items: center; gap: -6px; margin-top: 8px; }
.face { width: 30px; height: 30px; border-radius: 50%; border: 2px solid #FFF; margin-right: -8px;
  display: flex; align-items: center; justify-content: center; color: #FFF;
  font-family: 'Archivo'; font-size: 11px; font-weight: 700; }
.goal-live { display: flex; align-items: center; gap: 12px; margin-top: 18px; padding: 14px 16px;
  background: var(--accent-bg); border-radius: 13px; }
.goal-live-t { flex: 1; min-width: 0; font-size: 14px; }
.goal-note { font-size: 13.5px; color: var(--muted); font-style: italic; margin-top: 11px;
  padding-left: 11px; border-left: 2px solid var(--line); }

/* ---- trade binder: a digital binder, not a table ---- */
.bnd { display: grid; grid-template-columns: repeat(auto-fill, minmax(156px, 1fr)); gap: 16px; }
.bnd-c { padding: 16px 12px 14px; display: flex; flex-direction: column; align-items: center;
  text-align: center; transition: transform .14s ease, box-shadow .14s ease; }
.bnd-c:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(15,19,27,.06), 0 14px 30px rgba(15,19,27,.08); }
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
.trk { display: flex; gap: 5px; margin: 16px 0 6px; }
.trk i { flex: 1; height: 5px; border-radius: 3px; background: var(--line); transition: background .2s ease; }
.trk i.done { background: var(--t2); } .trk i.now { background: var(--t1); }
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
  border-radius: 13px; margin-bottom: 10px; width: 100%; text-align: left; background: #FFF;
  transition: border-color .14s ease, background .14s ease; }
.pick.on { border-color: var(--accent); background: var(--accent-bg); }
.pick-b { flex: 1; min-width: 0; }

/* ---- tabs: browsing one partner's shelf, or filtering your binder ---- */
.tabs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 16px; }
.tabb { flex: 0 0 auto; background: #FFF; border: 1px solid var(--line); border-radius: 999px;
  padding: 8px 14px; font-size: 13.5px; font-weight: 600; color: var(--muted); }
.tabb.on { background: var(--accent); border-color: var(--accent); color: #FFF; }
.tabb.on .faint { color: rgba(255,255,255,.75); }
.act-2 { display: flex; gap: 8px; margin-top: 10px; }
.act-2 .btn { flex: 1; }
.goal-edit { margin-top: 16px; padding-top: 13px; border-top: 1px solid var(--line-soft); }
.rowb { width: 100%; background: none; border: 0; border-bottom: 1px solid var(--line-soft);
  text-align: left; }
.rowb:hover { background: var(--line-soft); }
/* derived goal state \u2014 describes reality, never stored */
.state { font-family: 'Archivo'; font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase;
  font-weight: 700; padding: 3px 8px; border-radius: 5px; }
.state.seeking { background: var(--line-soft); color: var(--muted); }
.state.negotiating { background: var(--t1-bg); color: var(--t1); }
.state.satisfied { background: #E8F3EA; color: #2E6B3D; }

/* ---- bottom navigation: consumer, thumb-reachable ---- */
.nav { position: fixed; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,.96);
  backdrop-filter: blur(8px); border-top: 1px solid var(--line); display: flex;
  padding: 8px 0 max(8px, env(safe-area-inset-bottom)); z-index: 30; }
.nav-i { flex: 1; background: none; border: 0; display: flex; flex-direction: column;
  align-items: center; gap: 4px; padding: 5px 0; color: var(--faint); }
.nav-i.on { color: var(--accent); }
.nav-l { font-size: 11px; font-weight: 600; }
.nav-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }

/* ---- sheet ---- */
.ovl { position: fixed; inset: 0; background: rgba(15,19,27,.42); z-index: 40; display: flex;
  align-items: flex-end; justify-content: center; }
.sheet { background: #FFF; width: 100%; max-width: 560px; border-radius: 20px 20px 0 0;
  max-height: 90vh; overflow-y: auto; padding: 22px 18px calc(22px + env(safe-area-inset-bottom)); }
.sheet-t { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
.sheet-s { font-size: 14px; color: var(--muted); margin-bottom: 18px; }

/* ---- desktop: more room, never more density ---- */
@media (min-width: 900px) {
  .mc { padding-bottom: 0; display: flex; }
  .nav { position: sticky; top: 0; bottom: auto; height: 100vh; width: 232px; flex-direction: column;
    align-items: stretch; border-top: 0; border-right: 1px solid var(--line); padding: 26px 14px;
    background: #FFF; backdrop-filter: none; }
  .nav-i { flex: 0 0 auto; flex-direction: row; gap: 12px; justify-content: flex-start;
    padding: 12px 14px; border-radius: 10px; font-size: 15px; }
  .nav-i.on { background: var(--accent-bg); }
  .nav-l { font-size: 15px; }
  .mc-main { flex: 1; min-width: 0; }
  .pg { max-width: 800px; padding: 46px 38px 70px; }
  .pg-t { font-size: 34px; }
  .bnd { grid-template-columns: repeat(auto-fill, minmax(184px, 1fr)); gap: 22px; }
  .ovl { align-items: center; }
  .sheet { border-radius: 18px; max-width: 520px; }
}
`;
function Art({ card, size = "lg" }) {
  const [failed, setFailed] = useState2(false);
  const src = artUrl(card.csvId);
  if (!src || failed) {
    return /* @__PURE__ */ React2.createElement("div", { className: "art " + size + " ph", role: "img", "aria-label": cardFull(card), title: cardFull(card) }, /* @__PURE__ */ React2.createElement("span", { className: "ph-n" }, card.name), /* @__PURE__ */ React2.createElement("span", { className: "ph-s" }, cardLine(card)), /* @__PURE__ */ React2.createElement("span", { className: "ph-s" }, gradeLine(card)));
  }
  return /* @__PURE__ */ React2.createElement(
    "img",
    {
      className: "art " + size,
      src,
      alt: cardFull(card),
      title: cardFull(card),
      loading: "lazy",
      decoding: "async",
      onError: () => setFailed(true)
    }
  );
}
var initials2 = (s) => s.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
function Face({ partner, size = 30 }) {
  return /* @__PURE__ */ React2.createElement(
    "span",
    {
      className: "face",
      title: partner.name,
      style: { background: partner.tone, width: size, height: size }
    },
    initials2(partner.name)
  );
}
function Sheet({ title, sub, onClose, children, footer }) {
  return /* @__PURE__ */ React2.createElement("div", { className: "ovl", onClick: onClose }, /* @__PURE__ */ React2.createElement("div", { className: "sheet", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React2.createElement("div", { className: "sheet-t disp" }, title), sub && /* @__PURE__ */ React2.createElement("div", { className: "sheet-s" }, sub), children, footer && /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 10, marginTop: 20 } }, footer)));
}
function Track({ stage }) {
  const at = STAGE_IX2[stage];
  return /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { className: "trk", role: "img", "aria-label": `Stage ${at + 1} of ${STAGES3.length}: ${STAGE[stage].label}` }, STAGES3.map((s, i) => /* @__PURE__ */ React2.createElement("i", { key: s.id, className: i < at ? "done" : i === at ? "now" : "" }))), /* @__PURE__ */ React2.createElement("div", { className: "stage-n" }, STAGE[stage].label), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13.5 } }, STAGE_BLURB[stage]));
}
function Turn({ o, st }) {
  const t = st.turnFor(o);
  const who = t.who === "me" ? "Your move" : t.who === "partner" ? "Waiting on them" : "Nothing to do";
  return /* @__PURE__ */ React2.createElement("div", { className: "turn " + (t.who || "none") }, /* @__PURE__ */ React2.createElement("div", { className: "turn-w" }, who), /* @__PURE__ */ React2.createElement("div", { className: "turn-t" }, t.what));
}
function Goals({ st, go }) {
  const { goals, opps } = st;
  const primary = goals.filter((g) => g.tier === "primary");
  const secondary = goals.filter((g) => g.tier === "secondary");
  return /* @__PURE__ */ React2.createElement("div", { className: "pg" }, /* @__PURE__ */ React2.createElement("div", { className: "pg-h" }, /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("h1", { className: "pg-t disp" }, "Goals"), /* @__PURE__ */ React2.createElement("div", { className: "pg-s" }, primary.length, " primary \xB7 ", secondary.length, " secondary"))), goals.length === 0 && /* @__PURE__ */ React2.createElement("div", { className: "card empty" }, "Nothing on your list yet."), primary.map((g) => /* @__PURE__ */ React2.createElement(GoalCard2, { key: g.id, g, st, go })), secondary.length > 0 && /* @__PURE__ */ React2.createElement("div", { className: "sec-h", style: { margin: "26px 0 12px" } }, "Also looking for"), secondary.map((g) => /* @__PURE__ */ React2.createElement(GoalCard2, { key: g.id, g, st, go })));
}
function GoalCard2({ g, st, go }) {
  const c = st.cardById(g.cardId);
  const holders = st.partnersWith(g.cardId);
  const live = st.openOppForGoal(g.id);
  const partner = live ? st.partnerById(live.partnerId) : null;
  const state = st.stateOf(g.id);
  const [menu, setMenu] = useState2(false);
  return /* @__PURE__ */ React2.createElement("div", { className: "card goal" }, /* @__PURE__ */ React2.createElement("div", { className: "goal-top" }, /* @__PURE__ */ React2.createElement(Art, { card: c, size: "lg" }), /* @__PURE__ */ React2.createElement("div", { className: "goal-b" }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" } }, /* @__PURE__ */ React2.createElement("span", { className: "tier " + (g.tier === "primary" ? "p" : "s") }, g.tier === "primary" ? "Primary" : "Secondary"), /* @__PURE__ */ React2.createElement("span", { className: "state " + state }, GOAL_STATE[state])), /* @__PURE__ */ React2.createElement("div", { className: "goal-n disp" }, c.name), /* @__PURE__ */ React2.createElement("div", { className: "goal-i" }, cardLine(c)), /* @__PURE__ */ React2.createElement("div", { className: "goal-i" }, gradeLine(c)), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13, marginTop: 6 } }, "On your list since ", fmtDate2(g.since)))), g.note && /* @__PURE__ */ React2.createElement("div", { className: "goal-note" }, g.note), /* @__PURE__ */ React2.createElement("div", { className: "goal-avail" }, holders.length === 0 ? /* @__PURE__ */ React2.createElement("span", { className: "faint" }, "None of your partners have this right now.") : /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("b", null, holders.length), " trusted partner", holders.length === 1 ? " has" : "s have", " this", /* @__PURE__ */ React2.createElement("div", { className: "faces" }, holders.slice(0, 4).map((h) => /* @__PURE__ */ React2.createElement(Face, { key: h.partner.id, partner: h.partner })), holders.length > 4 && /* @__PURE__ */ React2.createElement("span", { className: "chip", style: { marginLeft: 14 } }, "+", holders.length - 4)))), live ? (
    /* One negotiation per goal. Because it exists, the app offers to continue
       it rather than to start another. */
    /* @__PURE__ */ React2.createElement("div", { className: "goal-live" }, /* @__PURE__ */ React2.createElement("div", { className: "goal-live-t" }, /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 12 } }, STAGE[live.stage].label), /* @__PURE__ */ React2.createElement("div", { style: { fontWeight: 600 } }, "with ", partner.name)), /* @__PURE__ */ React2.createElement("button", { className: "btn pri sm", onClick: () => go({ v: "deal", oppId: live.id }) }, "Continue"))
  ) : holders.length > 0 ? /* @__PURE__ */ React2.createElement(
    "button",
    {
      className: "btn wide",
      style: { marginTop: 15 },
      onClick: () => go({ v: "start", goalId: g.id })
    },
    "See who has it"
  ) : null, /* @__PURE__ */ React2.createElement("div", { className: "goal-edit" }, /* @__PURE__ */ React2.createElement("button", { className: "link", onClick: () => setMenu(!menu), "aria-expanded": menu }, "Edit this goal"), menu && /* @__PURE__ */ React2.createElement("div", { className: "act-2", style: { marginTop: 10 } }, g.tier === "secondary" ? /* @__PURE__ */ React2.createElement("button", { className: "btn sm", onClick: () => st.setTier(g.id, "primary") }, "Move to Primary") : /* @__PURE__ */ React2.createElement("button", { className: "btn sm", onClick: () => st.setTier(g.id, "secondary") }, "Move to Secondary"), /* @__PURE__ */ React2.createElement(
    "button",
    {
      className: "btn sm",
      disabled: !!live,
      title: live ? "Finish or stop the negotiation first" : void 0,
      onClick: () => st.removeGoal(g.id)
    },
    "Remove"
  )), menu && live && /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 12, marginTop: 7 } }, "You're negotiating this one \u2014 finish or stop that first to remove it.")));
}
function Binder({ st, go }) {
  const { binder } = st;
  const [open, setOpen] = useState2(null);
  const [filter, setFilter] = useState2("all");
  const withInterest = binder.filter((b) => st.interestIn(b.id).length > 0).length;
  const shown = binder.filter((b) => {
    if (filter === "all") return true;
    const who = st.interestIn(b.id);
    return filter === "interested" ? who.length > 0 : who.some((i) => i.partnerId === filter);
  });
  const partnersWithInterest = st.partners.filter((p) => st.interestCountFrom(p.id) > 0);
  return /* @__PURE__ */ React2.createElement("div", { className: "pg" }, /* @__PURE__ */ React2.createElement("div", { className: "pg-h" }, /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("h1", { className: "pg-t disp" }, "Trade Binder"), /* @__PURE__ */ React2.createElement("div", { className: "pg-s" }, binder.length, " cards you'd put toward a trade", withInterest > 0 && /* @__PURE__ */ React2.createElement(React2.Fragment, null, " \xB7 ", withInterest, " a partner would consider"))), /* @__PURE__ */ React2.createElement("div", { className: "pg-act" }, /* @__PURE__ */ React2.createElement("button", { className: "btn sm pri", onClick: () => go({ v: "add" }) }, "Add a card"))), /* @__PURE__ */ React2.createElement("div", { className: "tabs" }, /* @__PURE__ */ React2.createElement("button", { className: "tabb" + (filter === "all" ? " on" : ""), onClick: () => setFilter("all") }, "All ", /* @__PURE__ */ React2.createElement("span", { className: "faint" }, binder.length)), /* @__PURE__ */ React2.createElement("button", { className: "tabb" + (filter === "interested" ? " on" : ""), onClick: () => setFilter("interested") }, "Interested ", /* @__PURE__ */ React2.createElement("span", { className: "faint" }, withInterest)), partnersWithInterest.map((p) => /* @__PURE__ */ React2.createElement("button", { key: p.id, className: "tabb" + (filter === p.id ? " on" : ""), onClick: () => setFilter(p.id) }, p.name, " ", /* @__PURE__ */ React2.createElement("span", { className: "faint" }, st.interestCountFrom(p.id))))), binder.length === 0 ? /* @__PURE__ */ React2.createElement("div", { className: "card empty" }, "Your binder is empty.", /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 8 } }, "Cards you add here are what partners can trade against.")) : shown.length === 0 ? /* @__PURE__ */ React2.createElement("div", { className: "card empty" }, "No cards match this filter.") : /* @__PURE__ */ React2.createElement("div", { className: "bnd" }, shown.map((b) => {
    const c = st.cardById(b.cardId);
    const who = st.interestIn(b.id);
    return /* @__PURE__ */ React2.createElement("button", { key: b.id, className: "card bnd-c", onClick: () => setOpen(b.id) }, /* @__PURE__ */ React2.createElement(Art, { card: c, size: "md" }), /* @__PURE__ */ React2.createElement("div", { className: "bnd-n" }, c.name), /* @__PURE__ */ React2.createElement("div", { className: "bnd-i" }, cardLine(c)), /* @__PURE__ */ React2.createElement("div", { className: "bnd-i" }, gradeLine(c)), /* @__PURE__ */ React2.createElement("div", { className: "bnd-int" + (who.length ? "" : " none") }, who.length === 0 ? "No partner has flagged this" : `${who.length} partner${who.length === 1 ? "" : "s"} would consider it`));
  })), open && /* @__PURE__ */ React2.createElement(BinderCopy, { b: binder.find((x) => x.id === open), st, go, onClose: () => setOpen(null) }));
}
function BinderCopy({ b, st, onClose, go }) {
  const c = st.cardById(b.cardId);
  const who = st.interestIn(b.id);
  return /* @__PURE__ */ React2.createElement(
    Sheet,
    {
      title: c.name,
      sub: cardFull(c),
      onClose,
      footer: /* @__PURE__ */ React2.createElement("button", { className: "btn wide", onClick: onClose }, "Close")
    },
    /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 14, justifyContent: "center", marginBottom: 20 } }, ["front", "back"].map((side) => /* @__PURE__ */ React2.createElement("div", { key: side, style: { textAlign: "center" } }, /* @__PURE__ */ React2.createElement(Art, { card: c, size: "lg" }), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: {
      fontSize: 11,
      marginTop: 6,
      textTransform: "uppercase",
      letterSpacing: ".08em",
      fontFamily: "Archivo",
      fontWeight: 700
    } }, "Your photo \xB7 ", side)))),
    /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Added"), /* @__PURE__ */ React2.createElement("span", null, fmtDate2(b.added))),
    b.cert && /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Certification"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, b.cert)),
    /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "What you think it's worth"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money2(b.market))),
    /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 12.5, marginTop: 4 } }, "Only you can see this. Partners never see your number."),
    /* @__PURE__ */ React2.createElement("div", { className: "sec-h", style: { marginTop: 22 } }, "Partner interest"),
    who.length === 0 ? /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 14 } }, "No partner has flagged this yet. That's normal \u2014 it just means nobody's mentioned it.") : /* @__PURE__ */ React2.createElement(React2.Fragment, null, who.map((i) => /* @__PURE__ */ React2.createElement(
      "button",
      {
        key: i.partnerId,
        className: "row rowb",
        onClick: () => {
          onClose();
          go({ v: "partner", partnerId: i.partnerId });
        }
      },
      /* @__PURE__ */ React2.createElement("span", { style: { display: "flex", alignItems: "center", gap: 9 } }, /* @__PURE__ */ React2.createElement(Face, { partner: st.partnerById(i.partnerId), size: 26 }), /* @__PURE__ */ React2.createElement("span", { style: { marginLeft: 8, fontWeight: 500 } }, st.partnerById(i.partnerId).name)),
      /* @__PURE__ */ React2.createElement("span", { className: "faint", style: { fontSize: 13 } }, ago2(i.at), " \u203A")
    )), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 12.5, marginTop: 10 } }, "These partners would consider this card in a trade. That's willingness to look at it \u2014 not an offer, a reservation, or a commitment."))
  );
}
function Partners({ st, go }) {
  const ranked = useMemo2(
    () => st.partners.map((p) => st.partnerProfile(p.id)).sort((a, b) => b.primary - a.primary || b.secondary - a.secondary || b.deals - a.deals),
    [st]
  );
  return /* @__PURE__ */ React2.createElement("div", { className: "pg" }, /* @__PURE__ */ React2.createElement("div", { className: "pg-h" }, /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("h1", { className: "pg-t disp" }, "Trusted Partners"), /* @__PURE__ */ React2.createElement("div", { className: "pg-s" }, "People you trust. Collections that match."))), ranked.map((x, i) => /* @__PURE__ */ React2.createElement("div", { key: x.partner.id, className: "card pt" }, /* @__PURE__ */ React2.createElement("div", { className: "pt-top" }, /* @__PURE__ */ React2.createElement("span", { className: "pt-av", style: { background: x.partner.tone } }, initials2(x.partner.name)), /* @__PURE__ */ React2.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } }, /* @__PURE__ */ React2.createElement("span", { className: "pt-n disp" }, x.partner.name), i === 0 && x.primary > 0 && /* @__PURE__ */ React2.createElement("span", { className: "chip a" }, "Best match")), /* @__PURE__ */ React2.createElement("div", { className: "pt-c" }, x.partner.city))), /* @__PURE__ */ React2.createElement("div", { className: "pt-stats" }, /* @__PURE__ */ React2.createElement("div", { className: "pt-s" }, /* @__PURE__ */ React2.createElement("div", { className: "pt-s-n" }, x.primary), /* @__PURE__ */ React2.createElement("div", { className: "pt-s-l" }, "of your primary goals")), /* @__PURE__ */ React2.createElement("div", { className: "pt-s" }, /* @__PURE__ */ React2.createElement("div", { className: "pt-s-n" }, x.secondary), /* @__PURE__ */ React2.createElement("div", { className: "pt-s-l" }, "of your secondary goals")), /* @__PURE__ */ React2.createElement("div", { className: "pt-s" }, /* @__PURE__ */ React2.createElement("div", { className: "pt-s-n" }, x.interested), /* @__PURE__ */ React2.createElement("div", { className: "pt-s-l" }, "of your cards they'd consider"))), x.stock.length > 0 && /* @__PURE__ */ React2.createElement("div", { className: "pt-cards" }, x.stock.slice(0, 6).map((s) => /* @__PURE__ */ React2.createElement(Art, { key: s.invId || s.cardId, card: st.cardById(s.cardId), size: "sm" })), x.stock.length > 6 && /* @__PURE__ */ React2.createElement("span", { className: "chip", style: { alignSelf: "center" } }, "+", x.stock.length - 6)), /* @__PURE__ */ React2.createElement("div", { className: "pt-hist" }, x.deals > 0 ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, x.deals, " deal", x.deals === 1 ? "" : "s", " completed together \xB7 known since ", fmtDate2(x.partner.since)) : /* @__PURE__ */ React2.createElement(React2.Fragment, null, "No deals yet \xB7 known since ", fmtDate2(x.partner.since))), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13.5, marginTop: 8 } }, x.partner.note), /* @__PURE__ */ React2.createElement(
    "button",
    {
      className: "btn wide",
      style: { marginTop: 14 },
      onClick: () => go({ v: "partner", partnerId: x.partner.id })
    },
    "View collection"
  ))));
}
function PartnerDetail({ partnerId, st, go }) {
  const p = st.partnerById(partnerId);
  const x = st.partnerProfile(partnerId);
  const [tab, setTab] = useState2("primary");
  const [adding, setAdding] = useState2(null);
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
    { id: "all", label: "All Inventory", list: stock }
  ];
  const active = tabs.find((t) => t.id === tab) || tabs[0];
  return /* @__PURE__ */ React2.createElement("div", { className: "pg" }, /* @__PURE__ */ React2.createElement("button", { className: "link", onClick: () => go({ v: "partners" }) }, "\u2190 All partners"), /* @__PURE__ */ React2.createElement("div", { className: "pt-top", style: { marginTop: 16, marginBottom: 8 } }, /* @__PURE__ */ React2.createElement("span", { className: "pt-av", style: { background: p.tone } }, initials2(p.name)), /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { className: "pt-n disp" }, p.name), /* @__PURE__ */ React2.createElement("div", { className: "pt-c" }, p.city), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13, marginTop: 4 } }, x.deals, " deal", x.deals === 1 ? "" : "s", " together \xB7", " ", "open to ", x.interested, " of your binder card", x.interested === 1 ? "" : "s"))), /* @__PURE__ */ React2.createElement("div", { className: "tabs" }, tabs.map((t) => /* @__PURE__ */ React2.createElement(
    "button",
    {
      key: t.id,
      className: "tabb" + (tab === t.id ? " on" : ""),
      onClick: () => setTab(t.id)
    },
    t.label,
    " ",
    /* @__PURE__ */ React2.createElement("span", { className: "faint" }, t.list.length)
  ))), active.id === "foryou" && /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13, margin: "2px 0 14px" } }, "Based only on what you've told us you collect:", " ", st.myPrefs().map((t) => PREF_LABEL[t] || t).join(" \xB7 ")), active.list.length === 0 ? /* @__PURE__ */ React2.createElement("div", { className: "card empty" }, active.id === "foryou" ? "Nothing here matches what you collect right now." : active.id === "all" ? "Nothing listed right now." : `Nothing here is on your ${active.id} list.`) : /* @__PURE__ */ React2.createElement("div", { className: "bnd" }, active.list.map((s2) => {
    const c = st.cardById(s2.cardId);
    const g = st.goalFor(s2.cardId);
    const state = g ? st.stateOf(g.id) : null;
    return /* @__PURE__ */ React2.createElement("div", { key: s2.invId || s2.cardId, className: "card bnd-c" }, /* @__PURE__ */ React2.createElement(Art, { card: c, size: "md" }), /* @__PURE__ */ React2.createElement("div", { className: "bnd-n" }, c.name), /* @__PURE__ */ React2.createElement("div", { className: "bnd-i" }, cardLine(c)), /* @__PURE__ */ React2.createElement("div", { className: "bnd-i" }, gradeLine(c)), /* @__PURE__ */ React2.createElement("div", { style: { fontWeight: 700, marginTop: 8 } }, money2(s2.ask)), s2.why && s2.why.length > 0 && /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 11.5, marginTop: 5 } }, s2.why.map((t) => PREF_LABEL[t] || t).join(" \xB7 ")), g ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(
      "span",
      {
        className: "tier " + (g.tier === "primary" ? "p" : "s"),
        style: { marginTop: 9 }
      },
      g.tier === "primary" ? "Primary" : "Secondary"
    ), state === "negotiating" ? /* @__PURE__ */ React2.createElement("div", { className: "bnd-int", style: { color: "var(--muted)" } }, "Negotiating elsewhere") : /* @__PURE__ */ React2.createElement("div", { className: "act-2" }, /* @__PURE__ */ React2.createElement("button", { className: "btn sm", onClick: () => st.reachOut(g.id, partnerId, c.id) }, "Reach out"), /* @__PURE__ */ React2.createElement(
      "button",
      {
        className: "btn sm pri",
        onClick: () => go({ v: "offer", goalId: g.id, partnerId, cardId: c.id })
      },
      "Make an offer"
    ))) : (
      /* Discovered inventory can become a goal. Adding one recalculates
         matches across every partner, not just this one. */
      /* @__PURE__ */ React2.createElement(
        "button",
        {
          className: "btn sm",
          style: { marginTop: 10, width: "100%" },
          onClick: () => setAdding(c.id)
        },
        "Add to my goals"
      )
    ));
  })), adding && /* @__PURE__ */ React2.createElement(AddGoalSheet, { cardId: adding, st, onClose: () => setAdding(null) }));
}
function AddGoalSheet({ cardId, st, onClose, onAdded }) {
  const c = st.cardById(cardId);
  return /* @__PURE__ */ React2.createElement(
    Sheet,
    {
      title: "Add to your goals",
      sub: cardFull(c),
      onClose,
      footer: /* @__PURE__ */ React2.createElement("button", { className: "btn wide", onClick: onClose }, "Cancel")
    },
    /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "center", marginBottom: 18 } }, /* @__PURE__ */ React2.createElement(Art, { card: c, size: "lg" })),
    /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, marginBottom: 14 } }, "How much are you chasing this one?"),
    /* @__PURE__ */ React2.createElement(
      "button",
      {
        className: "btn pri wide",
        style: { marginBottom: 10 },
        onClick: () => {
          const id = st.addGoal(cardId, "primary");
          onClose();
          onAdded && onAdded(id);
        }
      },
      "Primary \u2014 actively looking"
    ),
    /* @__PURE__ */ React2.createElement(
      "button",
      {
        className: "btn wide",
        onClick: () => {
          const id = st.addGoal(cardId, "secondary");
          onClose();
          onAdded && onAdded(id);
        }
      },
      "Secondary \u2014 keeping an eye out"
    ),
    /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 12.5, marginTop: 14 } }, "We'll check every one of your partners for this card, not just this shop.")
  );
}
function Deal({ oppId, st, go }) {
  const o = st.opps.find((x) => x.id === oppId);
  if (!o) return /* @__PURE__ */ React2.createElement("div", { className: "pg" }, /* @__PURE__ */ React2.createElement("div", { className: "card empty" }, "This deal is no longer open."));
  const g = st.goals.find((x) => x.id === o.goalId);
  const c = st.cardById(g.cardId);
  const p = st.partnerById(o.partnerId);
  const t = st.turnFor(o);
  return /* @__PURE__ */ React2.createElement("div", { className: "pg" }, /* @__PURE__ */ React2.createElement("button", { className: "link", onClick: () => go({ v: "goals" }) }, "\u2190 Goals"), /* @__PURE__ */ React2.createElement("div", { className: "card dl-hero", style: { marginTop: 14 } }, /* @__PURE__ */ React2.createElement(Art, { card: c, size: "lg" }), /* @__PURE__ */ React2.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React2.createElement("div", { className: "goal-n disp", style: { marginTop: 0 } }, c.name), /* @__PURE__ */ React2.createElement("div", { className: "goal-i" }, cardLine(c)), /* @__PURE__ */ React2.createElement("div", { className: "goal-i" }, gradeLine(c)), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 12 } }, /* @__PURE__ */ React2.createElement(Face, { partner: p, size: 26 }), /* @__PURE__ */ React2.createElement("span", { style: { marginLeft: 8, fontWeight: 600 } }, p.name)))), /* @__PURE__ */ React2.createElement("div", { className: "card sec" }, /* @__PURE__ */ React2.createElement(Track, { stage: o.stage })), /* @__PURE__ */ React2.createElement(Turn, { o, st }), o.stage === "agree-price" && /* @__PURE__ */ React2.createElement(AgreePrice, { o, st }), o.stage === "select-trade" && /* @__PURE__ */ React2.createElement(SelectTrade, { o, st }), o.stage === "value-trade" && /* @__PURE__ */ React2.createElement(ValueTrade, { o, st }), o.stage === "deal" && /* @__PURE__ */ React2.createElement(DealStage, { o, st }), o.stage === "fulfillment" && /* @__PURE__ */ React2.createElement(Fulfillment, { o, st }), o.stage === "completed" && /* @__PURE__ */ React2.createElement(Completed, { o }), STAGE_IX2[o.stage] > STAGE_IX2["agree-price"] && /* @__PURE__ */ React2.createElement(Terms, { o, st }), isOpen(o) && /* @__PURE__ */ React2.createElement("div", { style: { textAlign: "center", padding: "6px 0 10px" } }, /* @__PURE__ */ React2.createElement(
    "button",
    {
      className: "link",
      style: { color: "var(--muted)" },
      onClick: () => {
        st.endNegotiation(o.id);
        go({ v: "goals" });
      }
    },
    "Stop this negotiation"
  ), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 12.5, marginTop: 5 } }, "The card stays on your goals \u2014 you can start again with anyone.")));
}
function Terms({ o, st }) {
  const cards = acceptedCards(o);
  const settled = cards.filter(cardSettled2);
  return /* @__PURE__ */ React2.createElement("div", { className: "card sec" }, /* @__PURE__ */ React2.createElement("div", { className: "sec-h" }, "Agreed so far"), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Their price"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money2(o.listedPrice))), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Price you agreed"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money2(o.agreedPrice))), settled.map((tcd) => {
    const b = st.binderById(tcd.binderId);
    return /* @__PURE__ */ React2.createElement("div", { key: tcd.binderId, className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, st.cardById(b.cardId).name), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money2(tcd.agreedMarket), " \xD7 ", pct2(tcd.agreedPercent), " = ", money2(tradeValue(tcd))));
  }), settled.length > 0 && /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Your cards are worth"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money2(totalTradeValue2(o)))), /* @__PURE__ */ React2.createElement("div", { className: "row tot" }, /* @__PURE__ */ React2.createElement("span", null, calcBalance(o) >= 0 ? "You'd pay" : "They'd pay you"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money2(Math.abs(calcBalance(o))))));
}
function AgreePrice({ o, st }) {
  const last = lastEntry3(o.priceThread);
  const mine = st.turnFor(o).who === "me";
  const [amt, setAmt] = useState2("");
  const n = Number(amt);
  const ok = amt !== "" && isFinite(n) && n > 0;
  return /* @__PURE__ */ React2.createElement("div", { className: "card sec" }, /* @__PURE__ */ React2.createElement("div", { className: "sec-h" }, "Price"), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "They're asking"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money2(o.listedPrice))), o.priceThread.map((e, i) => /* @__PURE__ */ React2.createElement("div", { key: i, className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, e.by === "me" ? "You" : "They", " ", e.type === "offer" ? "offered" : e.type === "accept" ? "accepted" : "countered"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money2(e.amount), " \xB7 ", Math.round(e.amount / o.listedPrice * 100), "%"))), mine && last && /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(
    "button",
    {
      className: "btn deep wide",
      style: { marginTop: 16 },
      onClick: () => st.priceRespond(o.id, "accept")
    },
    "Accept ",
    money2(last.amount)
  ), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13, textAlign: "center", margin: "14px 0 10px" } }, "or offer something else"), /* @__PURE__ */ React2.createElement(
    "input",
    {
      className: "inp",
      inputMode: "decimal",
      value: amt,
      placeholder: "$",
      "aria-label": "Your counter offer",
      onChange: (e) => setAmt(e.target.value.replace(/[^\d.]/g, ""))
    }
  ), ok && /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13, marginTop: 7 } }, "That's ", Math.round(n / o.listedPrice * 100), "% of what they're asking."), /* @__PURE__ */ React2.createElement(
    "button",
    {
      className: "btn pri wide",
      style: { marginTop: 12 },
      disabled: !ok,
      onClick: () => {
        st.priceRespond(o.id, "counter", n);
        setAmt("");
      }
    },
    "Send counter"
  )));
}
function SelectTrade({ o, st }) {
  const [picked, setPicked] = useState2([]);
  const groups = st.eligibleFor(o.partnerId, o);
  const eligible = [...groups.interested, ...groups.other];
  const inPack = o.trade.cards;
  if (!o.trade.submitted) {
    return /* @__PURE__ */ React2.createElement("div", { className: "card sec" }, /* @__PURE__ */ React2.createElement("div", { className: "sec-h" }, "Your cards"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, marginBottom: 14 } }, "Pick what you'd put toward this. You'll agree what each one is worth after they've said yes or no."), eligible.length === 0 ? /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 14 } }, "Your binder is empty, so this would be a cash purchase.") : /* @__PURE__ */ React2.createElement(React2.Fragment, null, [
      ["interested", "They've already shown interest", groups.interested],
      ["other", "Other cards from your Trade Binder", groups.other]
    ].filter(([, , list]) => list.length > 0).map(([key, heading, list]) => /* @__PURE__ */ React2.createElement("div", { key }, /* @__PURE__ */ React2.createElement("div", { className: "sec-h", style: { marginTop: 14 } }, heading), list.map((b) => {
      const c = st.cardById(b.cardId);
      const on = picked.includes(b.id);
      return /* @__PURE__ */ React2.createElement(
        "button",
        {
          key: b.id,
          className: "pick" + (on ? " on" : ""),
          "aria-pressed": on,
          onClick: () => setPicked(on ? picked.filter((x) => x !== b.id) : [...picked, b.id])
        },
        /* @__PURE__ */ React2.createElement(Art, { card: c, size: "sm" }),
        /* @__PURE__ */ React2.createElement("div", { className: "pick-b" }, /* @__PURE__ */ React2.createElement("div", { style: { fontWeight: 600 } }, c.name), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13 } }, cardLine(c), " \xB7 ", gradeLine(c))),
        on && /* @__PURE__ */ React2.createElement("span", { className: "chip a" }, "Chosen")
      );
    })))), eligible.length > 0 && /* @__PURE__ */ React2.createElement(
      "button",
      {
        className: "btn pri wide",
        style: { marginTop: 14 },
        disabled: !picked.length,
        onClick: () => st.submitTrade(o.id, picked)
      },
      "Send ",
      picked.length || "",
      " card",
      picked.length === 1 ? "" : "s",
      " for review"
    ));
  }
  return /* @__PURE__ */ React2.createElement("div", { className: "card sec" }, /* @__PURE__ */ React2.createElement("div", { className: "sec-h" }, "Cards you offered"), inPack.map((tcd) => {
    const b = st.binderById(tcd.binderId);
    const c = st.cardById(b.cardId);
    const label = tcd.inclusion === "accepted" ? "They'll take it" : tcd.inclusion === "rejected" ? "Not this one" : "Still deciding";
    return /* @__PURE__ */ React2.createElement("div", { key: tcd.binderId, className: "pick", style: { cursor: "default" } }, /* @__PURE__ */ React2.createElement(Art, { card: c, size: "sm" }), /* @__PURE__ */ React2.createElement("div", { className: "pick-b" }, /* @__PURE__ */ React2.createElement("div", { style: { fontWeight: 600 } }, c.name), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13 } }, cardLine(c), " \xB7 ", gradeLine(c))), /* @__PURE__ */ React2.createElement("span", { className: "chip" + (tcd.inclusion === "accepted" ? " t" : "") }, label));
  }));
}
function ValueTrade({ o, st }) {
  return /* @__PURE__ */ React2.createElement(React2.Fragment, null, acceptedCards(o).map((tcd) => /* @__PURE__ */ React2.createElement(ValueCard, { key: tcd.binderId, o, tcd, st })));
}
function ValueCard({ o, tcd, st }) {
  const b = st.binderById(tcd.binderId);
  const c = st.cardById(b.cardId);
  const [mkt, setMkt] = useState2(tcd.collectorMarket != null ? String(tcd.collectorMarket) : String(b.market ?? ""));
  const [pc, setPc] = useState2(tcd.collectorPercent != null ? String(Math.round(tcd.collectorPercent * 100)) : "80");
  const settled = cardSettled2(tcd);
  const mSettled = marketSettled(tcd);
  return /* @__PURE__ */ React2.createElement("div", { className: "card sec" }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 14 } }, /* @__PURE__ */ React2.createElement(Art, { card: c, size: "md" }), /* @__PURE__ */ React2.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 17, fontWeight: 700 } }, c.name), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13.5 } }, cardLine(c), " \xB7 ", gradeLine(c)), settled && /* @__PURE__ */ React2.createElement("span", { className: "chip t", style: { marginTop: 8 } }, "Settled"))), settled ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Value you both agreed"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money2(tcd.agreedMarket))), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Share going to the trade"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, pct2(tcd.agreedPercent))), /* @__PURE__ */ React2.createElement("div", { className: "row tot" }, /* @__PURE__ */ React2.createElement("span", null, "Worth toward the card"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money2(tradeValue(tcd))))) : !mSettled ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { className: "sec-h" }, "What's it worth?"), tcd.tpMarket != null && /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "They say"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money2(tcd.tpMarket))), tcd.tpMarket != null && /* @__PURE__ */ React2.createElement(
    "button",
    {
      className: "btn deep wide",
      style: { margin: "12px 0" },
      onClick: () => st.marketRespond(o.id, tcd.binderId, "accept")
    },
    "Agree on ",
    money2(tcd.tpMarket)
  ), /* @__PURE__ */ React2.createElement(
    "input",
    {
      className: "inp",
      inputMode: "decimal",
      value: mkt,
      "aria-label": "What you think it's worth",
      onChange: (e) => setMkt(e.target.value.replace(/[^\d.]/g, ""))
    }
  ), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 12.5, marginTop: 6 } }, "Starts from your own note. They only see what you send."), /* @__PURE__ */ React2.createElement(
    "button",
    {
      className: "btn pri wide",
      style: { marginTop: 12 },
      disabled: !(Number(mkt) > 0),
      onClick: () => st.marketRespond(o.id, tcd.binderId, "propose", Number(mkt))
    },
    "Send ",
    money2(Number(mkt))
  )) : /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Value you both agreed"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money2(tcd.agreedMarket))), /* @__PURE__ */ React2.createElement("div", { className: "sec-h", style: { marginTop: 16 } }, "How much counts toward the card?"), tcd.tpPercent != null && /* @__PURE__ */ React2.createElement(
    "button",
    {
      className: "btn deep wide",
      style: { marginBottom: 12 },
      onClick: () => st.pctRespond(o.id, tcd.binderId, "accept")
    },
    "Agree on ",
    pct2(tcd.tpPercent),
    " \u2014 ",
    money2(Math.round(tcd.agreedMarket * tcd.tpPercent))
  ), /* @__PURE__ */ React2.createElement(
    "input",
    {
      className: "inp",
      inputMode: "decimal",
      value: pc,
      "aria-label": "Percentage toward the trade",
      onChange: (e) => setPc(e.target.value.replace(/[^\d.]/g, ""))
    }
  ), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13, marginTop: 7 } }, Number(pc) > 0 ? `${Math.round(Number(pc))}% of ${money2(tcd.agreedMarket)} is ${money2(Math.round(tcd.agreedMarket * Number(pc) / 100))} toward the card.` : "Enter a percentage to see what it's worth."), /* @__PURE__ */ React2.createElement(
    "button",
    {
      className: "btn pri wide",
      style: { marginTop: 12 },
      disabled: !(Number(pc) > 0 && Number(pc) <= 100),
      onClick: () => st.pctRespond(o.id, tcd.binderId, "propose", Number(pc) / 100)
    },
    "Send ",
    Math.round(Number(pc) || 0),
    "%"
  )));
}
function DealStage({ o, st }) {
  const [amt, setAmt] = useState2("");
  const calc = calcBalance(o);
  const p = st.partnerById(o.partnerId);
  const proposed = o.deal.proposedAdj != null ? o.deal.proposedAdj : null;
  const fromPartner = o.deal.proposedBy && o.deal.proposedBy !== "collector";
  const n = Number(amt);
  return /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { className: "card sec" }, /* @__PURE__ */ React2.createElement("div", { className: "sec-h" }, "How the balance works out"), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Price you agreed"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money2(o.agreedPrice))), acceptedCards(o).map((tcd) => {
    const b = st.binderById(tcd.binderId);
    return /* @__PURE__ */ React2.createElement("div", { key: tcd.binderId, className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, st.cardById(b.cardId).name), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, "\u2212", money2(tradeValue(tcd))));
  }), /* @__PURE__ */ React2.createElement("div", { className: "row tot" }, /* @__PURE__ */ React2.createElement("span", null, calc >= 0 ? "You pay" : `${p.name} pays you`), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money2(Math.abs(calc))))), /* @__PURE__ */ React2.createElement("div", { className: "card sec" }, /* @__PURE__ */ React2.createElement("div", { className: "sec-h" }, "Final negotiation"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, marginBottom: 12 } }, proposed == null ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, "The numbers above are settled. If you'd like to land somewhere different, propose a final figure \u2014 everything you already agreed stays the same.") : fromPartner ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, p.name, " suggested settling at ", /* @__PURE__ */ React2.createElement("b", { className: "mono" }, money2(o.deal.proposedAdj)), " instead of ", money2(Math.abs(calc)), ".") : /* @__PURE__ */ React2.createElement(React2.Fragment, null, "You suggested ", /* @__PURE__ */ React2.createElement("b", { className: "mono" }, money2(o.deal.proposedAdj)), ". Waiting on them.")), st.turnFor(o).who === "me" && /* @__PURE__ */ React2.createElement(React2.Fragment, null, fromPartner && /* @__PURE__ */ React2.createElement(
    "button",
    {
      className: "btn deep wide",
      style: { marginBottom: 12 },
      onClick: () => st.dealAgree(o.id, o.deal.proposedAdj)
    },
    "Agree on ",
    money2(o.deal.proposedAdj)
  ), !fromPartner && /* @__PURE__ */ React2.createElement(
    "button",
    {
      className: "btn deep wide",
      style: { marginBottom: 12 },
      onClick: () => st.dealAgree(o.id, calc)
    },
    "Agree on ",
    money2(Math.abs(calc))
  ), /* @__PURE__ */ React2.createElement(
    "input",
    {
      className: "inp",
      inputMode: "decimal",
      value: amt,
      placeholder: "Propose a different figure",
      "aria-label": "Propose a final cash amount",
      onChange: (e) => setAmt(e.target.value.replace(/[^\d.]/g, ""))
    }
  ), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 12.5, marginTop: 6 } }, "Only the cash changes. Card values and percentages stay exactly as agreed."), /* @__PURE__ */ React2.createElement(
    "button",
    {
      className: "btn pri wide",
      style: { marginTop: 12 },
      disabled: !(n > 0),
      onClick: () => {
        st.dealPropose(o.id, n);
        setAmt("");
      }
    },
    "Propose ",
    money2(n || 0)
  ))));
}
function Fulfillment({ o, st }) {
  const f = o.fulfillment || {};
  const p = st.partnerById(o.partnerId);
  return /* @__PURE__ */ React2.createElement("div", { className: "card sec" }, /* @__PURE__ */ React2.createElement("div", { className: "sec-h" }, "Handoff"), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "How"), /* @__PURE__ */ React2.createElement("span", null, f.method)), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Where"), /* @__PURE__ */ React2.createElement("span", null, f.where)), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "When"), /* @__PURE__ */ React2.createElement("span", null, f.when)), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Settling up"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money2(Math.abs(finalBalance2(o))), " ", finalBalance2(o) >= 0 ? "to them" : "to you")), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, p.name), /* @__PURE__ */ React2.createElement("span", null, f.tpDone ? "Confirmed" : "Not yet")), !f.collectorDone && /* @__PURE__ */ React2.createElement("button", { className: "btn pri wide", style: { marginTop: 16 }, onClick: () => st.confirmHandoff(o.id) }, "I've got the card"));
}
function Completed({ o }) {
  return /* @__PURE__ */ React2.createElement("div", { className: "card sec" }, /* @__PURE__ */ React2.createElement("div", { className: "sec-h" }, "Completed"), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Finished"), /* @__PURE__ */ React2.createElement("span", null, fmtDate2(o.completedAt))), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Price agreed"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money2(o.agreedPrice))), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Your cards covered"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money2(totalTradeValue2(o)))), /* @__PURE__ */ React2.createElement("div", { className: "row tot" }, /* @__PURE__ */ React2.createElement("span", null, "You paid"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money2(Math.abs(finalBalance2(o))))));
}
function WhoHasIt({ goalId, st, go }) {
  const g = st.goals.find((x) => x.id === goalId);
  const c = st.cardById(g.cardId);
  const holders = st.partnersWith(g.cardId).slice().sort((a, b) => a.ask - b.ask);
  const live = st.openOppForGoal(goalId);
  const [sent, setSent] = useState2([]);
  return /* @__PURE__ */ React2.createElement(
    Sheet,
    {
      title: c.name,
      sub: `${cardLine(c)} \xB7 ${gradeLine(c)}`,
      onClose: () => go({ v: "goals" }),
      footer: /* @__PURE__ */ React2.createElement("button", { className: "btn wide", onClick: () => go({ v: "goals" }) }, "Close")
    },
    /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, marginBottom: 6 } }, holders.length, " of your partners ", holders.length === 1 ? "has" : "have", " this card."),
    live && /* Alternatives stay visible during a negotiation — the collector can still
       talk to anyone. Only the structured offer is limited to one at a time. */
    /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13, marginBottom: 12 } }, "You're negotiating this card with ", st.partnerById(live.partnerId).name, ". You can still reach out to others, but you can only negotiate with one at a time."),
    holders.map((h) => {
      const already = sent.includes(h.partner.id) || st.contactsFor(goalId, h.partner.id).length > 0;
      const openness = st.interestCountFrom(h.partner.id);
      return /* @__PURE__ */ React2.createElement("div", { key: h.partner.id, className: "pick", style: { cursor: "default", alignItems: "flex-start" } }, /* @__PURE__ */ React2.createElement(Face, { partner: h.partner, size: 38 }), /* @__PURE__ */ React2.createElement("div", { className: "pick-b", style: { marginLeft: 10 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontWeight: 600 } }, h.partner.name), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13 } }, h.partner.city), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 12.5, marginTop: 3 } }, cardLine(c), " \xB7 ", gradeLine(c)), openness > 0 && /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12.5, color: "var(--t1)", marginTop: 3 } }, "Open to ", openness, " of your binder card", openness === 1 ? "" : "s"), /* @__PURE__ */ React2.createElement("div", { className: "act-2", style: { marginTop: 9 } }, /* @__PURE__ */ React2.createElement(
        "button",
        {
          className: "btn sm",
          disabled: already,
          onClick: () => {
            st.reachOut(goalId, h.partner.id, c.id);
            setSent([...sent, h.partner.id]);
          }
        },
        already ? "Reached out" : "Reach out"
      ), !live && /* @__PURE__ */ React2.createElement(
        "button",
        {
          className: "btn sm pri",
          onClick: () => go({ v: "offer", goalId, partnerId: h.partner.id })
        },
        "Make an offer"
      ))), /* @__PURE__ */ React2.createElement("div", { className: "mono", style: { fontWeight: 700 } }, money2(h.ask)));
    }),
    /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 12.5, marginTop: 12 } }, "Reaching out is just a conversation \u2014 it doesn't start a negotiation or commit you to anything. Only you can make an offer.")
  );
}
function StartOffer({ goalId, partnerId, st, go }) {
  const g = st.goals.find((x) => x.id === goalId);
  const c = st.cardById(g.cardId);
  const p = st.partnerById(partnerId);
  const match = st.partnersWith(g.cardId).find((x) => x.partner.id === partnerId);
  const stock = match ? { ask: match.ask } : null;
  const live = st.openOppForGoal(goalId);
  const [amt, setAmt] = useState2(stock ? String(Math.round(stock.ask * 0.9)) : "");
  const n = Number(amt);
  if (live) {
    return /* @__PURE__ */ React2.createElement(
      Sheet,
      {
        title: "You're already negotiating this card",
        sub: `With ${st.partnerById(live.partnerId).name}, at ${STAGE[live.stage].label}.`,
        onClose: () => go({ v: "goals" }),
        footer: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("button", { className: "btn", onClick: () => go({ v: "goals" }) }, "Back"), /* @__PURE__ */ React2.createElement("button", { className: "btn pri", style: { flex: 1 }, onClick: () => go({ v: "deal", oppId: live.id }) }, "Continue that one"))
      },
      /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14.5 } }, "You can only have one negotiation running per goal, so the terms never get tangled. Finish or stop that one first.")
    );
  }
  return /* @__PURE__ */ React2.createElement(
    Sheet,
    {
      title: "Make an offer",
      sub: `${c.name} \xB7 ${cardLine(c)} \xB7 ${gradeLine(c)}`,
      onClose: () => go({ v: "partner", partnerId }),
      footer: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("button", { className: "btn", onClick: () => go({ v: "partner", partnerId }) }, "Cancel"), /* @__PURE__ */ React2.createElement(
        "button",
        {
          className: "btn pri",
          style: { flex: 1 },
          disabled: !(n > 0),
          onClick: () => {
            const id = st.startOffer(goalId, partnerId, n);
            go({ v: "deal", oppId: id });
          }
        },
        "Send offer"
      ))
    },
    /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 14, alignItems: "center", marginBottom: 18 } }, /* @__PURE__ */ React2.createElement(Art, { card: c, size: "md" }), /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { fontWeight: 600 } }, p.name), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13.5 } }, "asking ", money2(stock?.ask)))),
    /* @__PURE__ */ React2.createElement(
      "input",
      {
        className: "inp",
        inputMode: "decimal",
        value: amt,
        "aria-label": "Your offer",
        onChange: (e) => setAmt(e.target.value.replace(/[^\d.]/g, ""))
      }
    ),
    n > 0 && stock && /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13, marginTop: 8 } }, "That's ", Math.round(n / stock.ask * 100), "% of what they're asking."),
    /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 12.5, marginTop: 14 } }, "Only you can start a negotiation. Once this is open, you'll work through price, then any cards you trade, then the balance \u2014 one step at a time.")
  );
}
function AddCopy({ st, go }) {
  const [cardId, setCardId] = useState2("");
  const [mine, setMine] = useState2("");
  const [ph, setPh] = useState2({ front: null, back: null });
  const ready = cardId && ph.front && ph.back;
  const owned = new Set(st.binder.map((b) => b.cardId));
  const options = st.catalog.filter((c) => !owned.has(c.id));
  return /* @__PURE__ */ React2.createElement(
    Sheet,
    {
      title: "Add a card to your binder",
      sub: "Cards here are what partners can trade against.",
      onClose: () => go({ v: "binder" }),
      footer: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("button", { className: "btn", onClick: () => go({ v: "binder" }) }, "Cancel"), /* @__PURE__ */ React2.createElement(
        "button",
        {
          className: "btn pri",
          style: { flex: 1 },
          disabled: !ready,
          onClick: () => {
            st.addCopy(cardId, mine, ph);
            go({ v: "binder" });
          }
        },
        "Add to binder"
      ))
    },
    /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 13.5, fontWeight: 600, marginBottom: 6 } }, "Which card?"),
    /* @__PURE__ */ React2.createElement("select", { className: "inp", value: cardId, onChange: (e) => setCardId(e.target.value) }, /* @__PURE__ */ React2.createElement("option", { value: "" }, "Choose\u2026"), options.map((c) => /* @__PURE__ */ React2.createElement("option", { key: c.id, value: c.id }, cardFull(c)))),
    /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 13.5, fontWeight: 600, margin: "18px 0 6px" } }, "What do you think it's worth? ", /* @__PURE__ */ React2.createElement("span", { className: "faint", style: { fontWeight: 400 } }, "optional")),
    /* @__PURE__ */ React2.createElement(
      "input",
      {
        className: "inp",
        inputMode: "decimal",
        value: mine,
        placeholder: "$",
        onChange: (e) => setMine(e.target.value.replace(/[^\d.]/g, ""))
      }
    ),
    /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 12.5, marginTop: 6 } }, "Just for you. Partners never see it."),
    /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 13.5, fontWeight: 600, margin: "20px 0 8px" } }, "Photos \u2014 both sides, so partners can actually look at it"),
    /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 12 } }, ["front", "back"].map((side) => /* @__PURE__ */ React2.createElement("div", { key: side, style: { flex: 1, textAlign: "center" } }, /* @__PURE__ */ React2.createElement(
      "button",
      {
        className: "btn wide",
        style: {
          height: 96,
          flexDirection: "column",
          borderStyle: ph[side] ? "solid" : "dashed",
          borderColor: ph[side] ? "var(--t2)" : "var(--line)",
          background: ph[side] ? "var(--t1-bg)" : "#FFF"
        },
        onClick: () => setPh({ ...ph, [side]: `${side}:new` })
      },
      /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 13, textTransform: "capitalize" } }, side),
      /* @__PURE__ */ React2.createElement("span", { className: "faint", style: { fontSize: 12 } }, ph[side] ? "Added" : "Tap to add")
    )))),
    !ready && cardId && /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 12.5, marginTop: 10 } }, "Both photos are needed before this can go in your binder.")
  );
}
var NAV = [
  { id: "goals", label: "Goals", icon: "\u25CE" },
  { id: "binder", label: "Trade Binder", icon: "\u25A4" },
  { id: "partners", label: "Trusted Partners", icon: "\u25CD" }
];
var __fallback = null;
var __store = {
  get: () => __fallback || (__fallback = (0, import_metyet_store2.createStore)(buildCanonicalSeed())),
  reset: (seed) => {
    (__fallback || (__fallback = (0, import_metyet_store2.createStore)(buildCanonicalSeed()))).reset(seed || buildCanonicalSeed());
  }
};
function MetYetCollector({ store: injectedStore, collectorId = SELF_COLLECTOR }) {
  const store = useMemo2(() => injectedStore || __store.get(), [injectedStore]);
  const state = useSyncExternalStore2(store.sub, store.get, store.get);
  const [nav, setNav] = useState2({ v: "goals" });
  const st = useMemo2(() => {
    const v = (0, import_collector_view.collectorView)(state, collectorId);
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
      addGoal: (cardId, tier) => A.addGoal({ collectorId, cardId, tier, at: AT }),
      setTier: (goalId, tier) => A.updateGoalTier(goalId, tier),
      removeGoal: (goalId) => A.removeGoal(goalId),
      addCopy: (cardId, mine, photos) => A.addBinderCopy({
        id: "b" + Date.now().toString(36),
        collectorId,
        cardId,
        market: mine === "" ? null : Number(mine),
        cert: null,
        addedAt: AT,
        photos
      }),
      reachOut: (goalId, partnerId, cardId) => A.reachOut({ collectorId, partnerId, goalId, cardId, at: AT }),
      /* Returns null when the one-negotiation invariant refuses it. The refusal
         is the domain's, not this screen's. */
      startOffer: (goalId, partnerId, amount) => {
        const g = v.myGoals().find((x) => x.id === goalId);
        const inv = v.partnersWith(g.cardId).find((x) => x.partner.id === partnerId);
        return A.startOpportunity({
          goalId,
          collectorId,
          partnerId,
          cardId: g.cardId,
          invId: inv ? inv.inv.invId : null,
          listedPrice: inv ? inv.ask : amount,
          amount,
          at: AT
        });
      },
      endNegotiation: (oppId) => A.endOpportunity(oppId, "collector", AT),
      priceRespond: (id, action, amount) => A.patchOpportunity(id, (o) => {
        if (action === "accept") {
          const last = D.lastEntry(o.priceThread);
          return {
            ...o,
            agreedPrice: last.amount,
            stage: "select-trade",
            priceThread: [...o.priceThread, { by: "collector", type: "accept", amount: last.amount, at: AT }]
          };
        }
        return { ...o, priceThread: [...o.priceThread, { by: "collector", type: "counter", amount, at: AT }] };
      }),
      submitTrade: (id, binderIds) => A.patchOpportunity(id, (o) => ({
        ...o,
        trade: { submitted: true, cards: binderIds.map((b) => ({ binderId: b, inclusion: "proposed" })) }
      })),
      marketRespond: (id, binderId, action, amount) => A.patchOpportunity(id, (o) => ({
        ...o,
        trade: { ...o.trade, cards: o.trade.cards.map((c) => c.binderId !== binderId ? c : action === "accept" ? { ...c, agreedMarket: c.tpMarket } : { ...c, collectorMarket: amount }) }
      })),
      pctRespond: (id, binderId, action, frac) => A.patchOpportunity(id, (o) => {
        const next = { ...o, trade: { ...o.trade, cards: o.trade.cards.map((c) => c.binderId !== binderId ? c : action === "accept" ? { ...c, agreedPercent: c.tpPercent } : { ...c, collectorPercent: frac }) } };
        return D.acceptedTradeCards(next).every(D.cardSettled) ? { ...next, stage: "deal" } : next;
      }),
      dealPropose: (id, amount) => A.patchOpportunity(id, (o) => ({
        ...o,
        deal: { ...o.deal, proposedBy: "collector", proposedAdj: amount }
      })),
      dealAgree: (id, amount) => A.patchOpportunity(id, (o) => ({
        ...o,
        stage: "fulfillment",
        deal: { ...o.deal, agreedAdj: amount, tpAgreed: true, collectorAgreed: true },
        fulfillment: {
          method: "Meet in person",
          where: "To arrange",
          when: "To arrange",
          collectorDone: false,
          tpDone: false
        }
      })),
      confirmHandoff: (id) => A.patchOpportunity(id, (o) => {
        const f = { ...o.fulfillment, collectorDone: true };
        return f.tpDone ? { ...o, fulfillment: f, stage: "completed", completedAt: AT } : { ...o, fulfillment: f };
      })
    };
  }, [state, store, collectorId]);
  const go = (n) => setNav(n);
  const tab = ["goals", "start", "deal"].includes(nav.v) ? "goals" : ["binder", "add"].includes(nav.v) ? "binder" : "partners";
  const liveCount = st.opps.filter((o) => D.isNegotiating(o) && st.turnFor(o).who === "me").length;
  return /* @__PURE__ */ React2.createElement("div", { className: "mc" }, /* @__PURE__ */ React2.createElement("style", null, CSS2), /* @__PURE__ */ React2.createElement("nav", { className: "nav" }, NAV.map((n) => /* @__PURE__ */ React2.createElement(
    "button",
    {
      key: n.id,
      className: "nav-i" + (tab === n.id ? " on" : ""),
      "aria-current": tab === n.id ? "page" : void 0,
      onClick: () => go({ v: n.id })
    },
    /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 19, lineHeight: 1 }, "aria-hidden": "true" }, n.icon),
    /* @__PURE__ */ React2.createElement("span", { className: "nav-l" }, n.label),
    n.id === "goals" && liveCount > 0 && /* @__PURE__ */ React2.createElement("span", { className: "nav-dot", "aria-label": `${liveCount} need you` })
  ))), /* @__PURE__ */ React2.createElement("div", { className: "mc-main" }, nav.v === "goals" && /* @__PURE__ */ React2.createElement(Goals, { st, go }), nav.v === "binder" && /* @__PURE__ */ React2.createElement(Binder, { st, go }), nav.v === "partners" && /* @__PURE__ */ React2.createElement(Partners, { st, go }), nav.v === "partner" && /* @__PURE__ */ React2.createElement(PartnerDetail, { partnerId: nav.partnerId, st, go }), nav.v === "deal" && /* @__PURE__ */ React2.createElement(Deal, { oppId: nav.oppId, st, go })), nav.v === "start" && /* @__PURE__ */ React2.createElement(WhoHasIt, { goalId: nav.goalId, st, go }), nav.v === "offer" && /* @__PURE__ */ React2.createElement(StartOffer, { goalId: nav.goalId, partnerId: nav.partnerId, st, go }), nav.v === "add" && /* @__PURE__ */ React2.createElement(AddCopy, { st, go }));
}

// shell/MetYetPrototype.jsx
var import_metyet_store3 = __toESM(require_metyet_store());
var SELF_PARTNER2 = "p-self";
var SELF_COLLECTOR2 = "c12";
var PERSONAS = [
  {
    id: "tp",
    label: "Trusted Partner",
    who: "Northline Cards",
    blurb: "Manage your collector network, inventory, opportunities and sourcing.",
    cta: "Continue as Trusted Partner"
  },
  {
    id: "collector",
    label: "Collector",
    who: "Casey Lin",
    blurb: "Manage your collecting goals, Trade Binder and Trusted Partner relationships.",
    cta: "Continue as Collector"
  }
];
var CSS3 = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Public+Sans:wght@400;500;600&display=swap');
.myp { font-family: 'Public Sans', system-ui, sans-serif; color: #131922; }
.myp * { box-sizing: border-box; }
.myp button { font: inherit; color: inherit; cursor: pointer; }

/* ---- startup chooser: a prototype entry point, not a marketing page ---- */
.myp-enter { min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: #F1F3F6; padding: 28px 20px; }
.myp-box { width: 100%; max-width: 760px; }
.myp-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 26px; }
.myp-mark { width: 30px; height: 30px; border-radius: 8px; background: #0B5D66; color: #FFF;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Archivo'; font-weight: 700; font-size: 15px; }
.myp-wm { font-family: 'Archivo'; font-weight: 700; font-size: 19px; letter-spacing: -.01em; }
.myp-h { font-family: 'Archivo'; font-size: 27px; font-weight: 700; letter-spacing: -.02em;
  line-height: 1.15; margin: 0 0 6px; }
.myp-sub { font-size: 14px; color: #616B7A; margin-bottom: 26px; }
.myp-grid { display: grid; gap: 16px; grid-template-columns: 1fr; }
@media (min-width: 720px) { .myp-grid { grid-template-columns: 1fr 1fr; } }
.myp-card { background: #FFF; border: 1px solid #DFE4EA; border-radius: 14px; padding: 22px;
  display: flex; flex-direction: column; text-align: left;
  box-shadow: 0 1px 2px rgba(15,19,27,.04), 0 8px 22px rgba(15,19,27,.05);
  transition: border-color .14s ease, transform .14s ease; }
.myp-card:hover { border-color: #B9C4CE; transform: translateY(-2px); }
.myp-role { font-family: 'Archivo'; font-size: 18px; font-weight: 700; }
.myp-who { font-size: 12.5px; color: #8B95A3; margin-top: 2px; }
.myp-blurb { font-size: 13.5px; color: #616B7A; line-height: 1.5; margin: 12px 0 20px; flex: 1; }
.myp-cta { display: inline-flex; align-items: center; justify-content: center;
  border-radius: 10px; padding: 11px 16px; font-size: 14px; font-weight: 600;
  background: #0B5D66; border: 1px solid #0B5D66; color: #FFF; }
.myp-card:nth-child(2) .myp-cta { background: #6C5CE0; border-color: #6C5CE0; }
.myp-note { font-size: 12px; color: #8B95A3; margin-top: 22px; text-align: center; }

/* ---- prototype strip: outside both product IAs, quiet by design ---- */
.myp-bar { display: flex; align-items: center; gap: 10px; padding: 6px 14px;
  background: #0F131B; color: #C6CEDA; font-size: 12px; position: relative; z-index: 60; }
.myp-tag { font-family: 'Archivo'; font-size: 9px; letter-spacing: .13em; text-transform: uppercase;
  font-weight: 700; color: #7E8AA0; }
.myp-viewing { color: #FFF; font-weight: 600; }
.myp-actions { margin-left: auto; display: flex; gap: 8px; align-items: center; }
.myp-btn { background: none; border: 1px solid #2A3446; color: #C6CEDA; border-radius: 7px;
  padding: 4px 10px; font-size: 12px; }
.myp-btn:hover { border-color: #46536B; color: #FFF; }
.myp-menu { position: absolute; top: 32px; right: 14px; background: #FFF; color: #131922;
  border: 1px solid #DFE4EA; border-radius: 9px; padding: 4px; min-width: 190px;
  box-shadow: 0 10px 28px rgba(15,19,27,.18); }
.myp-item { display: block; width: 100%; text-align: left; background: none; border: 0;
  padding: 8px 10px; border-radius: 6px; font-size: 13px; }
.myp-item:hover { background: #F1F4F7; }
.myp-item.on { color: #0B5D66; font-weight: 600; }
.myp-veil { position: fixed; inset: 0; z-index: 55; }
.myp-body { position: relative; }
`;
function MetYetPrototype() {
  const storeRef = useRef2(null);
  if (storeRef.current === null) storeRef.current = (0, import_metyet_store3.createStore)(buildCanonicalSeed());
  const store = storeRef.current;
  const [persona, setPersona] = useState3(null);
  const [menu, setMenu] = useState3(false);
  const [epoch, setEpoch] = useState3(0);
  if (persona === null) {
    return /* @__PURE__ */ React3.createElement("div", { className: "myp" }, /* @__PURE__ */ React3.createElement("style", null, CSS3), /* @__PURE__ */ React3.createElement("div", { className: "myp-enter" }, /* @__PURE__ */ React3.createElement("div", { className: "myp-box" }, /* @__PURE__ */ React3.createElement("div", { className: "myp-brand" }, /* @__PURE__ */ React3.createElement("span", { className: "myp-mark" }, "M"), /* @__PURE__ */ React3.createElement("span", { className: "myp-wm" }, "MetYet")), /* @__PURE__ */ React3.createElement("h1", { className: "myp-h" }, "How would you like to explore MetYet?"), /* @__PURE__ */ React3.createElement("div", { className: "myp-sub" }, "Both experiences run on the same live data. Anything you do as one side is visible from the other."), /* @__PURE__ */ React3.createElement("div", { className: "myp-grid" }, PERSONAS.map((p) => /* @__PURE__ */ React3.createElement("button", { key: p.id, className: "myp-card", onClick: () => setPersona(p.id) }, /* @__PURE__ */ React3.createElement("span", { className: "myp-role" }, p.label), /* @__PURE__ */ React3.createElement("span", { className: "myp-who" }, p.who), /* @__PURE__ */ React3.createElement("span", { className: "myp-blurb" }, p.blurb), /* @__PURE__ */ React3.createElement("span", { className: "myp-cta" }, p.cta)))), /* @__PURE__ */ React3.createElement("div", { className: "myp-note" }, "Prototype \u2014 you can switch sides at any time."))));
  }
  const current = PERSONAS.find((p) => p.id === persona);
  return /* @__PURE__ */ React3.createElement("div", { className: "myp" }, /* @__PURE__ */ React3.createElement("style", null, CSS3), /* @__PURE__ */ React3.createElement("div", { className: "myp-bar" }, /* @__PURE__ */ React3.createElement("span", { className: "myp-tag" }, "Prototype"), /* @__PURE__ */ React3.createElement("span", null, "Viewing as ", /* @__PURE__ */ React3.createElement("span", { className: "myp-viewing" }, current.label), " \xB7 ", current.who), /* @__PURE__ */ React3.createElement("span", { className: "myp-actions" }, /* @__PURE__ */ React3.createElement(
    "button",
    {
      className: "myp-btn",
      "aria-haspopup": "menu",
      "aria-expanded": menu,
      onClick: () => setMenu(!menu)
    },
    "Switch persona"
  ), /* @__PURE__ */ React3.createElement("button", { className: "myp-btn", onClick: () => {
    store.reset(buildCanonicalSeed());
    setEpoch((e) => e + 1);
    setMenu(false);
  } }, "Reset demo")), menu && /* @__PURE__ */ React3.createElement(React3.Fragment, null, /* @__PURE__ */ React3.createElement("span", { className: "myp-veil", onClick: () => setMenu(false) }), /* @__PURE__ */ React3.createElement("span", { className: "myp-menu", role: "menu" }, PERSONAS.map((p) => /* @__PURE__ */ React3.createElement(
    "button",
    {
      key: p.id,
      role: "menuitem",
      className: "myp-item" + (p.id === persona ? " on" : ""),
      onClick: () => {
        setPersona(p.id);
        setMenu(false);
      }
    },
    p.label,
    " \xB7 ",
    p.who
  ))))), /* @__PURE__ */ React3.createElement("div", { className: "myp-body" }, persona === "tp" ? /* @__PURE__ */ React3.createElement(MetYet, { key: "tp-" + epoch, store, partnerId: SELF_PARTNER2 }) : /* @__PURE__ */ React3.createElement(MetYetCollector, { key: "col-" + epoch, store, collectorId: SELF_COLLECTOR2 })));
}


export default MetYetPrototype;
