/* GENERATED PREVIEW — DO NOT EDIT
 *
 * Built from the canonical modular source by build-preview.mjs:
 *   collector/MetYetCollector.jsx
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
import React, { useState, useMemo, useSyncExternalStore } from "react";

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
    var identityKey = (c) => !c ? "" : [
      c.name,
      c.set,
      c.num,
      c.print,
      c.edition,
      c.language,
      c.grade,
      c.grade === "Raw" ? c.condition || "" : ""
    ].join("|").toLowerCase();
    var isRaw2 = (c) => c && c.grade === "Raw";
    var sameIdentity = (a, b) => identityKey(a) === identityKey(b);
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
    var isTerminal = (o) => isCompleted(o) || isEnded(o);
    var isActive2 = (o) => !isTerminal(o);
    var isNegotiating2 = (o) => isActive2(o) && STAGE_IX3[o.stage] >= STAGE_IX3["agree-price"];
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
    var lastEntry3 = (t) => t && t.length ? t[t.length - 1] : null;
    function nextActor(o) {
      if (isEnded(o)) return { actor: null, reason: "ended" };
      switch (o.stage) {
        case "secondary":
        case "primary":
          return { actor: "collector", reason: "offer" };
        case "agree-price": {
          const last = lastEntry3(o.priceThread);
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
      identityKey,
      isRaw: isRaw2,
      sameIdentity,
      STAGES: STAGES4,
      STAGE_IX: STAGE_IX3,
      STAGE_LABEL: STAGE_LABEL2,
      isEnded,
      isCompleted,
      isTerminal,
      isActive: isActive2,
      isNegotiating: isNegotiating2,
      activeOppForGoal,
      goalState,
      acceptedTradeCards: acceptedTradeCards2,
      cardSettled: cardSettled3,
      tradeValueOf: tradeValueOf2,
      totalTradeValue: totalTradeValue3,
      calculatedBalance: calculatedBalance2,
      finalBalance: finalBalance3,
      lastEntry: lastEntry3,
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
    function createStore3(seed) {
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
    module.exports = { createStore: createStore3 };
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

// collector/MetYetCollector.jsx
var D = __toESM(require_metyet_domain());
var E = __toESM(require_metyet_entities());
var import_metyet_store2 = __toESM(require_metyet_store());
var import_collector_view = __toESM(require_collector_view());

// src/MetYet.jsx
var import_metyet_store = __toESM(require_metyet_store());

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
var STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.id, s.label]));
var STAGE_NUMBER = Object.fromEntries(
  STAGES.filter((s) => s.group === "deal" && s.id !== "completed").map((s, i) => [s.id, i + 1])
);
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
var STAGE_MAP = STAGES.map((s) => s.id);
var ALL_TAGS = Object.keys(T);

// collector/MetYetCollector.jsx
var SELF_COLLECTOR = "c12";
var TODAY = /* @__PURE__ */ new Date("2026-08-14T12:00:00Z");
var AT = "2026-08-14";
var money = (n) => n == null || !isFinite(n) ? "\u2014" : (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
var pct = (f) => f == null ? "\u2014" : Math.round(f * 100) + "%";
var daysSince = (d) => Math.max(0, Math.round((TODAY - /* @__PURE__ */ new Date(d + "T12:00:00Z")) / 864e5));
var ago = (d) => {
  const n = daysSince(d);
  if (n === 0) return "today";
  if (n === 1) return "yesterday";
  if (n < 30) return `${n} days ago`;
  const m = Math.round(n / 30);
  return m < 12 ? `${m} month${m === 1 ? "" : "s"} ago` : `${Math.round(n / 365)} yr ago`;
};
var fmtDate = (d) => (/* @__PURE__ */ new Date(d + "T12:00:00Z")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
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
var lastEntry2 = D.lastEntry;
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
var CSS = `
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
var initials = (s) => s.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
function Face({ partner, size = 30 }) {
  return /* @__PURE__ */ React2.createElement(
    "span",
    {
      className: "face",
      title: partner.name,
      style: { background: partner.tone, width: size, height: size }
    },
    initials(partner.name)
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
  return /* @__PURE__ */ React2.createElement("div", { className: "pg" }, /* @__PURE__ */ React2.createElement("div", { className: "pg-h" }, /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("h1", { className: "pg-t disp" }, "Goals"), /* @__PURE__ */ React2.createElement("div", { className: "pg-s" }, primary.length, " primary \xB7 ", secondary.length, " secondary"))), goals.length === 0 && /* @__PURE__ */ React2.createElement("div", { className: "card empty" }, "Nothing on your list yet."), primary.map((g) => /* @__PURE__ */ React2.createElement(GoalCard, { key: g.id, g, st, go })), secondary.length > 0 && /* @__PURE__ */ React2.createElement("div", { className: "sec-h", style: { margin: "26px 0 12px" } }, "Also looking for"), secondary.map((g) => /* @__PURE__ */ React2.createElement(GoalCard, { key: g.id, g, st, go })));
}
function GoalCard({ g, st, go }) {
  const c = st.cardById(g.cardId);
  const holders = st.partnersWith(g.cardId);
  const live = st.openOppForGoal(g.id);
  const partner = live ? st.partnerById(live.partnerId) : null;
  const state = st.stateOf(g.id);
  const [menu, setMenu] = useState2(false);
  return /* @__PURE__ */ React2.createElement("div", { className: "card goal" }, /* @__PURE__ */ React2.createElement("div", { className: "goal-top" }, /* @__PURE__ */ React2.createElement(Art, { card: c, size: "lg" }), /* @__PURE__ */ React2.createElement("div", { className: "goal-b" }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" } }, /* @__PURE__ */ React2.createElement("span", { className: "tier " + (g.tier === "primary" ? "p" : "s") }, g.tier === "primary" ? "Primary" : "Secondary"), /* @__PURE__ */ React2.createElement("span", { className: "state " + state }, GOAL_STATE[state])), /* @__PURE__ */ React2.createElement("div", { className: "goal-n disp" }, c.name), /* @__PURE__ */ React2.createElement("div", { className: "goal-i" }, cardLine(c)), /* @__PURE__ */ React2.createElement("div", { className: "goal-i" }, gradeLine(c)), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13, marginTop: 6 } }, "On your list since ", fmtDate(g.since)))), g.note && /* @__PURE__ */ React2.createElement("div", { className: "goal-note" }, g.note), /* @__PURE__ */ React2.createElement("div", { className: "goal-avail" }, holders.length === 0 ? /* @__PURE__ */ React2.createElement("span", { className: "faint" }, "None of your partners have this right now.") : /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("b", null, holders.length), " trusted partner", holders.length === 1 ? " has" : "s have", " this", /* @__PURE__ */ React2.createElement("div", { className: "faces" }, holders.slice(0, 4).map((h) => /* @__PURE__ */ React2.createElement(Face, { key: h.partner.id, partner: h.partner })), holders.length > 4 && /* @__PURE__ */ React2.createElement("span", { className: "chip", style: { marginLeft: 14 } }, "+", holders.length - 4)))), live ? (
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
    /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Added"), /* @__PURE__ */ React2.createElement("span", null, fmtDate(b.added))),
    b.cert && /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Certification"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, b.cert)),
    /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "What you think it's worth"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money(b.market))),
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
      /* @__PURE__ */ React2.createElement("span", { className: "faint", style: { fontSize: 13 } }, ago(i.at), " \u203A")
    )), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 12.5, marginTop: 10 } }, "These partners would consider this card in a trade. That's willingness to look at it \u2014 not an offer, a reservation, or a commitment."))
  );
}
function Partners({ st, go }) {
  const ranked = useMemo2(
    () => st.partners.map((p) => st.partnerProfile(p.id)).sort((a, b) => b.primary - a.primary || b.secondary - a.secondary || b.deals - a.deals),
    [st]
  );
  return /* @__PURE__ */ React2.createElement("div", { className: "pg" }, /* @__PURE__ */ React2.createElement("div", { className: "pg-h" }, /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("h1", { className: "pg-t disp" }, "Trusted Partners"), /* @__PURE__ */ React2.createElement("div", { className: "pg-s" }, "People you trust. Collections that match."))), ranked.map((x, i) => /* @__PURE__ */ React2.createElement("div", { key: x.partner.id, className: "card pt" }, /* @__PURE__ */ React2.createElement("div", { className: "pt-top" }, /* @__PURE__ */ React2.createElement("span", { className: "pt-av", style: { background: x.partner.tone } }, initials(x.partner.name)), /* @__PURE__ */ React2.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } }, /* @__PURE__ */ React2.createElement("span", { className: "pt-n disp" }, x.partner.name), i === 0 && x.primary > 0 && /* @__PURE__ */ React2.createElement("span", { className: "chip a" }, "Best match")), /* @__PURE__ */ React2.createElement("div", { className: "pt-c" }, x.partner.city))), /* @__PURE__ */ React2.createElement("div", { className: "pt-stats" }, /* @__PURE__ */ React2.createElement("div", { className: "pt-s" }, /* @__PURE__ */ React2.createElement("div", { className: "pt-s-n" }, x.primary), /* @__PURE__ */ React2.createElement("div", { className: "pt-s-l" }, "of your primary goals")), /* @__PURE__ */ React2.createElement("div", { className: "pt-s" }, /* @__PURE__ */ React2.createElement("div", { className: "pt-s-n" }, x.secondary), /* @__PURE__ */ React2.createElement("div", { className: "pt-s-l" }, "of your secondary goals")), /* @__PURE__ */ React2.createElement("div", { className: "pt-s" }, /* @__PURE__ */ React2.createElement("div", { className: "pt-s-n" }, x.interested), /* @__PURE__ */ React2.createElement("div", { className: "pt-s-l" }, "of your cards they'd consider"))), x.stock.length > 0 && /* @__PURE__ */ React2.createElement("div", { className: "pt-cards" }, x.stock.slice(0, 6).map((s) => /* @__PURE__ */ React2.createElement(Art, { key: s.invId || s.cardId, card: st.cardById(s.cardId), size: "sm" })), x.stock.length > 6 && /* @__PURE__ */ React2.createElement("span", { className: "chip", style: { alignSelf: "center" } }, "+", x.stock.length - 6)), /* @__PURE__ */ React2.createElement("div", { className: "pt-hist" }, x.deals > 0 ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, x.deals, " deal", x.deals === 1 ? "" : "s", " completed together \xB7 known since ", fmtDate(x.partner.since)) : /* @__PURE__ */ React2.createElement(React2.Fragment, null, "No deals yet \xB7 known since ", fmtDate(x.partner.since))), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13.5, marginTop: 8 } }, x.partner.note), /* @__PURE__ */ React2.createElement(
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
  return /* @__PURE__ */ React2.createElement("div", { className: "pg" }, /* @__PURE__ */ React2.createElement("button", { className: "link", onClick: () => go({ v: "partners" }) }, "\u2190 All partners"), /* @__PURE__ */ React2.createElement("div", { className: "pt-top", style: { marginTop: 16, marginBottom: 8 } }, /* @__PURE__ */ React2.createElement("span", { className: "pt-av", style: { background: p.tone } }, initials(p.name)), /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { className: "pt-n disp" }, p.name), /* @__PURE__ */ React2.createElement("div", { className: "pt-c" }, p.city), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13, marginTop: 4 } }, x.deals, " deal", x.deals === 1 ? "" : "s", " together \xB7", " ", "open to ", x.interested, " of your binder card", x.interested === 1 ? "" : "s"))), /* @__PURE__ */ React2.createElement("div", { className: "tabs" }, tabs.map((t) => /* @__PURE__ */ React2.createElement(
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
    return /* @__PURE__ */ React2.createElement("div", { key: s2.invId || s2.cardId, className: "card bnd-c" }, /* @__PURE__ */ React2.createElement(Art, { card: c, size: "md" }), /* @__PURE__ */ React2.createElement("div", { className: "bnd-n" }, c.name), /* @__PURE__ */ React2.createElement("div", { className: "bnd-i" }, cardLine(c)), /* @__PURE__ */ React2.createElement("div", { className: "bnd-i" }, gradeLine(c)), /* @__PURE__ */ React2.createElement("div", { style: { fontWeight: 700, marginTop: 8 } }, money(s2.ask)), s2.why && s2.why.length > 0 && /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 11.5, marginTop: 5 } }, s2.why.map((t) => PREF_LABEL[t] || t).join(" \xB7 ")), g ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(
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
  return /* @__PURE__ */ React2.createElement("div", { className: "card sec" }, /* @__PURE__ */ React2.createElement("div", { className: "sec-h" }, "Agreed so far"), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Their price"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money(o.listedPrice))), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Price you agreed"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money(o.agreedPrice))), settled.map((tcd) => {
    const b = st.binderById(tcd.binderId);
    return /* @__PURE__ */ React2.createElement("div", { key: tcd.binderId, className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, st.cardById(b.cardId).name), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money(tcd.agreedMarket), " \xD7 ", pct(tcd.agreedPercent), " = ", money(tradeValue(tcd))));
  }), settled.length > 0 && /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Your cards are worth"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money(totalTradeValue2(o)))), /* @__PURE__ */ React2.createElement("div", { className: "row tot" }, /* @__PURE__ */ React2.createElement("span", null, calcBalance(o) >= 0 ? "You'd pay" : "They'd pay you"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money(Math.abs(calcBalance(o))))));
}
function AgreePrice({ o, st }) {
  const last = lastEntry2(o.priceThread);
  const mine = st.turnFor(o).who === "me";
  const [amt, setAmt] = useState2("");
  const n = Number(amt);
  const ok = amt !== "" && isFinite(n) && n > 0;
  return /* @__PURE__ */ React2.createElement("div", { className: "card sec" }, /* @__PURE__ */ React2.createElement("div", { className: "sec-h" }, "Price"), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "They're asking"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money(o.listedPrice))), o.priceThread.map((e, i) => /* @__PURE__ */ React2.createElement("div", { key: i, className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, e.by === "me" ? "You" : "They", " ", e.type === "offer" ? "offered" : e.type === "accept" ? "accepted" : "countered"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money(e.amount), " \xB7 ", Math.round(e.amount / o.listedPrice * 100), "%"))), mine && last && /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(
    "button",
    {
      className: "btn deep wide",
      style: { marginTop: 16 },
      onClick: () => st.priceRespond(o.id, "accept")
    },
    "Accept ",
    money(last.amount)
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
  return /* @__PURE__ */ React2.createElement("div", { className: "card sec" }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 14 } }, /* @__PURE__ */ React2.createElement(Art, { card: c, size: "md" }), /* @__PURE__ */ React2.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 17, fontWeight: 700 } }, c.name), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13.5 } }, cardLine(c), " \xB7 ", gradeLine(c)), settled && /* @__PURE__ */ React2.createElement("span", { className: "chip t", style: { marginTop: 8 } }, "Settled"))), settled ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Value you both agreed"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money(tcd.agreedMarket))), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Share going to the trade"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, pct(tcd.agreedPercent))), /* @__PURE__ */ React2.createElement("div", { className: "row tot" }, /* @__PURE__ */ React2.createElement("span", null, "Worth toward the card"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money(tradeValue(tcd))))) : !mSettled ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { className: "sec-h" }, "What's it worth?"), tcd.tpMarket != null && /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "They say"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money(tcd.tpMarket))), tcd.tpMarket != null && /* @__PURE__ */ React2.createElement(
    "button",
    {
      className: "btn deep wide",
      style: { margin: "12px 0" },
      onClick: () => st.marketRespond(o.id, tcd.binderId, "accept")
    },
    "Agree on ",
    money(tcd.tpMarket)
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
    money(Number(mkt))
  )) : /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Value you both agreed"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money(tcd.agreedMarket))), /* @__PURE__ */ React2.createElement("div", { className: "sec-h", style: { marginTop: 16 } }, "How much counts toward the card?"), tcd.tpPercent != null && /* @__PURE__ */ React2.createElement(
    "button",
    {
      className: "btn deep wide",
      style: { marginBottom: 12 },
      onClick: () => st.pctRespond(o.id, tcd.binderId, "accept")
    },
    "Agree on ",
    pct(tcd.tpPercent),
    " \u2014 ",
    money(Math.round(tcd.agreedMarket * tcd.tpPercent))
  ), /* @__PURE__ */ React2.createElement(
    "input",
    {
      className: "inp",
      inputMode: "decimal",
      value: pc,
      "aria-label": "Percentage toward the trade",
      onChange: (e) => setPc(e.target.value.replace(/[^\d.]/g, ""))
    }
  ), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13, marginTop: 7 } }, Number(pc) > 0 ? `${Math.round(Number(pc))}% of ${money(tcd.agreedMarket)} is ${money(Math.round(tcd.agreedMarket * Number(pc) / 100))} toward the card.` : "Enter a percentage to see what it's worth."), /* @__PURE__ */ React2.createElement(
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
  return /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { className: "card sec" }, /* @__PURE__ */ React2.createElement("div", { className: "sec-h" }, "How the balance works out"), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Price you agreed"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money(o.agreedPrice))), acceptedCards(o).map((tcd) => {
    const b = st.binderById(tcd.binderId);
    return /* @__PURE__ */ React2.createElement("div", { key: tcd.binderId, className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, st.cardById(b.cardId).name), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, "\u2212", money(tradeValue(tcd))));
  }), /* @__PURE__ */ React2.createElement("div", { className: "row tot" }, /* @__PURE__ */ React2.createElement("span", null, calc >= 0 ? "You pay" : `${p.name} pays you`), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money(Math.abs(calc))))), /* @__PURE__ */ React2.createElement("div", { className: "card sec" }, /* @__PURE__ */ React2.createElement("div", { className: "sec-h" }, "Final negotiation"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, marginBottom: 12 } }, proposed == null ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, "The numbers above are settled. If you'd like to land somewhere different, propose a final figure \u2014 everything you already agreed stays the same.") : fromPartner ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, p.name, " suggested settling at ", /* @__PURE__ */ React2.createElement("b", { className: "mono" }, money(o.deal.proposedAdj)), " instead of ", money(Math.abs(calc)), ".") : /* @__PURE__ */ React2.createElement(React2.Fragment, null, "You suggested ", /* @__PURE__ */ React2.createElement("b", { className: "mono" }, money(o.deal.proposedAdj)), ". Waiting on them.")), st.turnFor(o).who === "me" && /* @__PURE__ */ React2.createElement(React2.Fragment, null, fromPartner && /* @__PURE__ */ React2.createElement(
    "button",
    {
      className: "btn deep wide",
      style: { marginBottom: 12 },
      onClick: () => st.dealAgree(o.id, o.deal.proposedAdj)
    },
    "Agree on ",
    money(o.deal.proposedAdj)
  ), !fromPartner && /* @__PURE__ */ React2.createElement(
    "button",
    {
      className: "btn deep wide",
      style: { marginBottom: 12 },
      onClick: () => st.dealAgree(o.id, calc)
    },
    "Agree on ",
    money(Math.abs(calc))
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
    money(n || 0)
  ))));
}
function Fulfillment({ o, st }) {
  const f = o.fulfillment || {};
  const p = st.partnerById(o.partnerId);
  return /* @__PURE__ */ React2.createElement("div", { className: "card sec" }, /* @__PURE__ */ React2.createElement("div", { className: "sec-h" }, "Handoff"), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "How"), /* @__PURE__ */ React2.createElement("span", null, f.method)), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Where"), /* @__PURE__ */ React2.createElement("span", null, f.where)), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "When"), /* @__PURE__ */ React2.createElement("span", null, f.when)), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Settling up"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money(Math.abs(finalBalance2(o))), " ", finalBalance2(o) >= 0 ? "to them" : "to you")), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, p.name), /* @__PURE__ */ React2.createElement("span", null, f.tpDone ? "Confirmed" : "Not yet")), !f.collectorDone && /* @__PURE__ */ React2.createElement("button", { className: "btn pri wide", style: { marginTop: 16 }, onClick: () => st.confirmHandoff(o.id) }, "I've got the card"));
}
function Completed({ o }) {
  return /* @__PURE__ */ React2.createElement("div", { className: "card sec" }, /* @__PURE__ */ React2.createElement("div", { className: "sec-h" }, "Completed"), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Finished"), /* @__PURE__ */ React2.createElement("span", null, fmtDate(o.completedAt))), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Price agreed"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money(o.agreedPrice))), /* @__PURE__ */ React2.createElement("div", { className: "row" }, /* @__PURE__ */ React2.createElement("span", { className: "k" }, "Your cards covered"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money(totalTradeValue2(o)))), /* @__PURE__ */ React2.createElement("div", { className: "row tot" }, /* @__PURE__ */ React2.createElement("span", null, "You paid"), /* @__PURE__ */ React2.createElement("span", { className: "mono" }, money(Math.abs(finalBalance2(o))))));
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
      ))), /* @__PURE__ */ React2.createElement("div", { className: "mono", style: { fontWeight: 700 } }, money(h.ask)));
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
    /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 14, alignItems: "center", marginBottom: 18 } }, /* @__PURE__ */ React2.createElement(Art, { card: c, size: "md" }), /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { fontWeight: 600 } }, p.name), /* @__PURE__ */ React2.createElement("div", { className: "faint", style: { fontSize: 13.5 } }, "asking ", money(stock?.ask)))),
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
  return /* @__PURE__ */ React2.createElement("div", { className: "mc" }, /* @__PURE__ */ React2.createElement("style", null, CSS), /* @__PURE__ */ React2.createElement("nav", { className: "nav" }, NAV.map((n) => /* @__PURE__ */ React2.createElement(
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


export default MetYetCollector;
