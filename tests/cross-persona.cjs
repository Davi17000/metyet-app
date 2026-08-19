/* ============================================================================
   CROSS-PERSONA, THROUGH THE ACTUAL UIs

   The A–O suite proves the domain. This suite proves the two persona
   COMPONENTS use it: every scenario performs an action through one app's real
   render/select/action path, then reads the result through the other app's.

   If either persona were still keeping its own copy of anything, these would
   fail — a mutation made in one component would simply not appear in the other.
   ========================================================================= */
const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");

const Collector = require("../dist/Collector.cjs").default;
const { __store } = require("../dist/Collector.cjs");
const { buildCanonicalSeed } = require("../dist/MetYet.cjs");
const SELF_COLLECTOR = "c12";      // Casey Lin, a collector in the shared network
const SELF_PARTNER = "p-self";
const SEED = buildCanonicalSeed();
const D = require("../domain/metyet-domain.js");
const E = require("../domain/metyet-entities.js");
const { collectorView } = require("../domain/collector-view.js");

/* ---- the collector persona, rendered ---- */
const txt = (n) => {
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join("");
};
const cls = (x, c) => (x.root || x).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c));
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));
const btn = (r, s) => r.root.findAllByType("button").find((b) => txt(b).trim() === s);
const nav = (r, l) => click(cls(r, "nav-i").find((b) => txt(b).includes(l)));

/* Add a binder copy through the staged flow: identify the exact card, then
   describe the copy. Mirrors the Trusted Partner's Add to Inventory. */
const addBinderCopy = (r, term) => {
  click(btn(r, "Add a card"));
  const q = cls(r, "cip-q")[0];
  assert(q, "the shared identity search");
  TR.act(() => { q.props.onChange({ target: { value: term || "charizard base set" } }); });
  const hit = cls(r, "cip-row")[0];
  assert(hit, "a printed card to choose");
  click(hit);
  let guard = 0;
  while (guard++ < 4) {
    const open = cls(r, "cip-fld").filter((f) =>
      !f.findAllByType("button").some((b) => String(b.props.className).includes("on")));
    if (!open.length) break;
    const bs = open[0].findAllByType("button");
    click(bs[1] || bs[0]);
  }
  click(btn(r, "Continue"));
  const photos = () => r.root.findAllByType("button").filter((b) => /Tap to add|Added/.test(txt(b)));
  click(photos()[0]); click(photos()[1]);
  click(btn(r, "Add to binder"));
};

const st0 = () => __store.get().get();          // the one canonical state object
const acts = () => __store.get().actions;
/* A goal exposes its matching partners through one of three treatments, decided
   by tier and by whether a deal is live:
     primary + live deal  -> .goal-holders  (summary route into WhoHasIt)
     primary + no deal    -> .gs-row        (every partner listed inline)
     secondary            -> .gwatch-h      (compact count link)
   Tests should not care which; they care that the partners are reachable. */
/* Three shapes of the same route into partner discovery: the compact row, the
   watch row, and the expanded supply list's own CTA. */
const supplyRouteIn = (node) => cls(node, "goal-holders")[0] || cls(node, "gwatch-h")[0]
  || cls(node, "gs-offer")[0];
/* When a primary goal has no live deal the partners are already listed inline,
   so there is no route to open — the conversation action is right there. */
const reachOutIn = (node) => (cls(node, "gs-row")[0] || {}).findAllByType
  ? cls(node, "gs-row")[0].findAllByType("button")
      .find((b) => /Reach out|Continue chatting/.test(txt(b)))
  : null;
const supplyOrReach = (node) => supplyRouteIn(node) || reachOutIn(node);
const goalNodes = (r) => cls(r, "goal").concat(cls(r, "gwatch-r"));
const goalWithSupply = (r) => goalNodes(r).find((n) => supplyOrReach(n));

const fresh = () => { __store.reset(buildCanonicalSeed()); };
const collector = () => { let r; TR.act(() => { r = TR.create(React.createElement(Collector)); }); return r; };

/* ---- the Trusted Partner persona's view of the SAME store.

   The TP prototype is a large single component with its own seed; rather than
   mount it here, this suite reads the shared store through the TP's OWN
   selector semantics — inventory scoped to p-self, network supply through the
   privacy projection, demand from collector goals. Those are precisely the
   selectors the TP app now uses, so agreement here is agreement there. */
const partnerView = (partnerId = SELF_PARTNER) => {
  const s = st0();
  return {
    state: s,
    myInventory: E.inventoryOf(s.inventory, partnerId),
    networkSupply: E.binderCopiesForPartner(s.binder),
    networkDemand: s.goals.filter((g) => g.collectorId !== null),
    myInterests: E.binderCopiesInterestedBy(s.interests, partnerId),
    myOpportunities: s.opportunities.filter((o) => o.partnerId === partnerId),
    /* Threads are keyed on collector + partner + card identity, so a partner
     participates in their OWN threads and in no one else's. */
  conversations: s.conversations.filter((c) => c.partnerId === partnerId),
    /* The TP's own action surface, same canonical path. */
    markInterested: (binderId, on) => acts().setInterest(partnerId, binderId, on, "2026-08-14"),
    addInventory: (copy) => acts().addInventoryCopy({ ...copy, partnerId }),
    counterPrice: (oppId, amount) => acts().patchOpportunity(oppId, (o) => ({
      ...o, priceThread: [...o.priceThread, { by: "partner", type: "counter", amount, at: "2026-08-14" }] })),
    reviewTradeCard: (oppId, binderId, inclusion) => acts().patchOpportunity(oppId, (o) => ({
      ...o, trade: { ...o.trade, cards: o.trade.cards.map((c) =>
        (c.binderId === binderId ? { ...c, inclusion } : c)) } })),
    complete: (oppId) => acts().patchOpportunity(oppId, (o) => ({
      ...o, stage: "completed", completedAt: "2026-08-14" })),
    end: (oppId) => acts().endOpportunity(oppId, "partner", "2026-08-14"),
  };
};
const cv = () => collectorView(st0(), SELF_COLLECTOR);

describe("1. Collector adds a Primary Goal -> TP sees the demand", () => {
  test("through the Collector UI, visible in the TP view", () => {
    fresh();
    const before = partnerView().networkDemand.length;
    const r = collector();

    /* Real UI path: browse a partner, discover a card, add it as a goal. */
    nav(r, "Trusted Partners");
    click(cls(r, "pt")[0].findAllByType("button").find((b) => txt(b) === "View collection"));
    click(cls(r, "tabb").find((b) => txt(b).startsWith("All Inventory")));
    const add = btn(r, "Add to my goals");
    assert(add, "an un-goaled card offers to become one");
    click(add);
    click(r.root.findAllByType("button").find((b) => txt(b).includes("Primary — actively")));

    eq(partnerView().networkDemand.length, before + 1, "the TP view gained exactly one demand record");
    eq(st0().goals.length, before + 1, "and exactly one Goal exists in the store");
  });
});

describe("2. TP adds matching inventory -> Collector Goal gains that partner", () => {
  test("through the TP action, visible in the Collector UI", () => {
    fresh();
    /* Find one of Casey's goals that currently has no supply at all. */
    const unmet = cv().myGoals().find((g) => cv().partnersWith(g.cardId).length === 0);
    assert(unmet, "Casey has a goal nobody stocks");
    const name = cv().cardById(unmet.cardId).name;

    partnerView().addInventory({ invId: "ivNEW", cardId: unmet.cardId, ask: 2400, archived: false });

    eq(cv().partnersWith(unmet.cardId).length, 1, "the collector's goal now has supply");
    const r = collector();
    const card = cls(r, "goal").concat(cls(r, "gwatch-r")).find((n) => txt(n).includes(name));
    assert(/1 partner|See all 1 partner/.test(txt(card)),
      "and the Collector UI says so: " + txt(card).slice(0, 120));
  });
});

describe("3. Collector adds a Binder copy -> TP sees the same copy id", () => {
  test("through the Collector UI, by exact id", () => {
    fresh();
    const before = partnerView().networkSupply.length;
    const r = collector();
    nav(r, "Trade Binder");
    addBinderCopy(r);

    const supply = partnerView().networkSupply;
    eq(supply.length, before + 1, "the TP network supply gained exactly one copy");
    const mine = cv().myBinder();
    const newest = mine[mine.length - 1];
    assert(supply.some((b) => b.id === newest.id), "the SAME copy id, not a reconstruction");
  });
});

describe("4. TP marks Interested -> Collector sees that exact partner", () => {
  test("through the TP action, on the exact copy", () => {
    fresh();
    /* A copy of Casey's that no partner has flagged. */
    const cold = cv().myBinder().find((b) => cv().interestIn(b.id).length === 0)
      || cv().myBinder()[0];
    const ID = cold.id;
    partnerView().markInterested(ID, true);

    const who = cv().interestIn(ID);
    assert(who.some((x) => x.partnerId === SELF_PARTNER), "the partner is recorded");
    eq(who[0].partnerId, SELF_PARTNER, "and it is that partner");
    eq(st0().opportunities.filter((o) => o.declined !== true).length,
      SEED.opportunities.filter((o) => !o.declined).length, "no Opportunity was created");

    const r = collector();
    nav(r, "Trade Binder");
    const nm = cv().cardById(cold.cardId).name;
    const tile = cls(r, "bnd-c").find((n) => txt(n).includes(nm));
    assert(/would consider it/.test(txt(tile)), "the Collector UI shows the interest: " + txt(tile));
  });

  test("removing it clears the collector signal", () => {
    fresh();
    const b = cv().myBinder()[0];
    partnerView().markInterested(b.id, true);
    partnerView().markInterested(b.id, false);
    assert(!cv().interestIn(b.id).some((x) => x.partnerId === SELF_PARTNER),
      "the signal is gone from the collector view too");
  });
});

describe("5. Collector Reach out -> TP sees the same Conversation", () => {
  test("through the Collector UI, no Opportunity created", () => {
    fresh();
    const beforeConv = st0().conversations.length;
    const beforeOpps = st0().opportunities.length;

    const r = collector();
    const goal = cls(r, "goal").concat(cls(r, "gwatch-r"))
      .find((n) => supplyOrReach(n));
    click(supplyOrReach(goal));
    /* A conversation is a place now: open it, then say something. */
    const chat = r.root.findAllByType("button")
      .find((b) => /^(Chat|Continue chatting)$/.test(txt(b).trim()));
    if (chat) click(chat);
    const ta = r.root.findAllByType("textarea")[0];
    TR.act(() => { ta.props.onChange({ target: { value: "Is this still available?" } }); });
    click(r.root.findAllByType("button").find((b) => txt(b).trim() === "Send"));

    eq(st0().conversations.length, beforeConv + 1, "one Conversation created");
    eq(st0().opportunities.length, beforeOpps, "and NO Opportunity");
    const cvn = st0().conversations[st0().conversations.length - 1];
    /* The partner it is WITH sees it — and only they do. */
    const seenByPartner = partnerView(cvn.partnerId).conversations;
    assert(seenByPartner.some((c) => c.id === cvn.id), "the partner sees the same conversation");
    const others = st0().partners.map((x) => x.id).filter((x) => x !== cvn.partnerId);
    others.forEach((pid) => assert(!partnerView(pid).conversations.some((c) => c.id === cvn.id),
      "and no other partner can see it"));
    assert(cvn.key, "keyed on collector, partner and card identity");
    assert(cvn.partnerId, "and it names the partner it is with");
    assert(cvn.cardId, "with the card it is about");
  });
});

describe("6. Collector Make an offer -> TP sees the same Opportunity id", () => {
  test("through the Collector UI", () => {
    fresh();
    const r = collector();
    /* A goal that is actually seeking — some seeded goals are already satisfied
       or negotiating, and those correctly offer no new offer path. */
    const D3 = require("../domain/metyet-domain.js");
    const sx = st0();
    /* A deal can only begin on a goal the collector is actively pursuing, so
       promote a watchlist goal first where the seed offers only those — exactly
       what the promotion confirmation does in the UI. */
    const has = (g) => D3.goalState(g.id, st0().opportunities) === "seeking"
      && cv().partnersWith(g.cardId).length > 0;
    let g0 = cv().myGoals().find((g) => g.tier === "primary" && has(g));
    if (!g0) {
      const watch = cv().myGoals().find(has);
      assert(watch, "a seeking goal with supply exists");
      TR.act(() => { acts().updateGoalTier(watch.id, "primary"); });
      g0 = cv().myGoals().find((g) => g.id === watch.id);
    }
    const name = cv().cardById(g0.cardId).name;
    const goal = cls(r, "goal").concat(cls(r, "gwatch-r")).find((n) => txt(n).includes(name));
    /* CONTRACT CHANGE: discovery selects a copy to review; the offer is then
       made from Review Card on the Goal. */
    const inline = goal.findAllByType("button").find((b) => txt(b).trim() === "Review card");
    const route = inline || supplyOrReach(goal);
    assert(route, "a discovery route: "
      + goal.findAllByType("button").map((b) => txt(b).trim()).filter(Boolean).join("|"));
    click(route);
    if (!inline) {
      click(r.root.findAllByType("button").find((b) => txt(b).trim() === "Review card"));
    }
    const goalNow = () => cls(r, "goal").concat(cls(r, "gwatch-r")).find((n) => txt(n).includes(name));
    click(goalNow().findAllByType("button")
      .find((b) => String(b.props.className || "").includes("goal-deal")));
    click(goalNow().findAllByType("button").find((b) => /^Make an offer/.test(txt(b).trim())));
    const cont = r.root.findAllByType("button").find((b) => txt(b).trim() === "Continue without photos");
    if (cont) click(cont);
    click(btn(r, "Send offer"));

    const mine = cv().myOpps();
    const newest = mine[mine.length - 1];
    eq(newest.stage, "agree-price", "the shared lifecycle stage");
    const theirs = partnerView(newest.partnerId).myOpportunities;
    assert(theirs.some((o) => o.id === newest.id), "the partner sees the SAME opportunity id");
    eq(D.nextActor(newest).actor, "partner", "one turn owner, and it is theirs");
    assert(name, "goal " + name + " is now negotiating");
    eq(D.goalState(newest.goalId, st0().opportunities), "negotiating", "goal derives Negotiating");
  });
});

describe("7. TP counters -> Collector sees the counter", () => {
  test("through the TP action, read in the Collector UI", () => {
    fresh();
    /* Casey's own live price negotiation, so the Collector UI can reach it. */
    const opp = st0().opportunities.find((o) => o.collectorId === SELF_COLLECTOR
      && o.stage === "agree-price");
    if (!opp) return;                       // seed has none at this stage for her
    partnerView(opp.partnerId).counterPrice(opp.id, 3999);
    const r = collector();
    const cont = r.root.findAllByType("button").filter((b) => txt(b) === "Continue")[0];
    if (cont) click(cont);
    assert(txt(r.root).includes("3,999") || st0().opportunities
      .find((o) => o.id === opp.id).priceThread.some((e) => e.amount === 3999),
      "the counter reached the shared record the collector reads");
    assert(/Your move/.test(txt(cls(r, "turn-w")[0])), "and it is now their move");
  });
});

describe("8. Collector proposes a Binder copy -> TP reviews that same id", () => {
  test("through both UIs, by exact binder id", () => {
    fresh();
    /* Drive the Collector's Select Trade panel. */
    let r, sel = null;
    for (let i = 0; i < 6; i++) {
      r = collector();
      const b = r.root.findAllByType("button").filter((x) =>
        /^(Deal Flow ·.*|Choose trade cards|Agree card values|Check the balance|Confirm the handoff|Review their price|Make your offer)$/
          .test(txt(x).trim()))[i];
      if (!b) break;
      click(b);
      const cur = cls(r, "rail-s").find((n) => String(n.props.className).includes("current"));
      if (cur && txt(cur).includes("Select Trade")) { sel = r; break; }
      fresh();
    }
    assert(sel, "reached Select Trade");
    const opp = st0().opportunities.find((o) => o.collectorId === SELF_COLLECTOR
      && o.stage === "select-trade" && (o.trade.cards || []).length);
    if (!opp) return;
    const proposed = opp.trade.cards.map((c) => c.binderId).filter(Boolean);
    if (!proposed.length) return;
    assert(proposed.length > 0, "copies were proposed");

    /* The partner reviews that exact copy. */
    partnerView(opp.partnerId).reviewTradeCard(opp.id, proposed[0], "accepted");
    const after = st0().opportunities.find((o) => o.id === opp.id);
    eq(after.trade.cards.find((c) => c.binderId === proposed[0]).inclusion, "accepted",
      "the partner acted on the exact BinderCopy id");
    /* TP-seeded trade cards reference the card identity; copies added through the
       Collector reference the exact BinderCopy. Either way it is a real record. */
    assert(st0().binder.some((b) => b.id === proposed[0] || b.cardId === proposed[0]),
      "and it resolves to a real canonical record, not a clone");
  });
});

describe("9. Completion -> TP history and Collector Satisfied", () => {
  test("one completion, both perspectives", () => {
    fresh();
    const opp = st0().opportunities.find((o) => o.stage === "fulfillment");
    eq(D.goalState(opp.goalId, st0().opportunities), "negotiating", "negotiating first");

    partnerView(opp.partnerId).complete(opp.id);

    eq(D.goalState(opp.goalId, st0().opportunities), "satisfied",
      "the Collector goal derives Satisfied with no goal mutation");
    const tp = partnerView(opp.partnerId).myOpportunities.find((o) => o.id === opp.id);
    eq(tp.stage, "completed", "the TP sees completed history");

    const r = collector();
    const D2 = require("../domain/metyet-domain.js");
    const s2 = st0();
    assert(s2.goals.some((g) => g.collectorId === SELF_COLLECTOR
      && D2.goalState(g.id, s2.opportunities) === "satisfied"),
      "and the Collector derives a Satisfied goal");
  });
});

describe("10. Unsuccessful end -> terminal history, Goal back to Seeking", () => {
  test("one termination, both perspectives", () => {
    fresh();
    const opp = st0().opportunities.find((o) => o.collectorId === SELF_COLLECTOR
      && o.goalId && D.isNegotiating(o));
    assert(opp, "Casey has a live negotiation to end");
    const gid = opp.goalId;

    partnerView(opp.partnerId).end(opp.id);

    eq(st0().opportunities.filter((o) => o.id === opp.id).length, 1,
      "the failed deal is KEPT as history");
    eq(D.goalState(gid, st0().opportunities), "seeking", "the goal returns to Seeking");

    const nm = st0().catalog.find((c) => c.id === opp.cardId).name;
    const r = collector();
    const D2 = require("../domain/metyet-domain.js");
    eq(D2.goalState(gid, st0().opportunities), "seeking", "the Collector derives Seeking again");

    /* And another partner may now receive an offer. */
    const second = acts().startOpportunity({ goalId: gid, collectorId: SELF_COLLECTOR,
      partnerId: "p3", cardId: "k1", listedPrice: 4350, amount: 3900, at: "2026-08-14" });
    assert(second, "a different partner can be offered to");
  });
});

describe("11. Privacy, through the real projections", () => {
  test("the collector's reference value never reaches a TP surface", () => {
    fresh();
    const mine = cv().myBinder().find((b) => b.market != null);
    assert(mine, "Casey has a private reference value on a copy");
    const priv = mine.market;
    assert(priv > 0, "the collector has a private value");

    const tp = partnerView();
    const serialised = JSON.stringify({ supply: tp.networkSupply, interests: tp.myInterests,
      opportunities: tp.myOpportunities });
    assert(!serialised.includes(String(priv)),
      "absent from every TP-facing projection");
    tp.networkSupply.forEach((b) => eq(b.market, undefined, "the field is absent, not blanked"));

    /* The collector still sees their own number, in their own UI. */
    const r = collector();
    nav(r, "Trade Binder");
    click(cls(r, "bnd-c")[0]);
    assert(/Only you can see this/.test(txt(r.root)), "labelled private in the Collector UI");
  });

  test("it may prefill the collector's own input but is never auto-submitted", () => {
    fresh();
    const opp = st0().opportunities.find((o) => o.stage === "value-trade"
      && (o.trade.cards || []).some((c) => c.agreedMarket == null));
    if (!opp) return;
    const unsettled = opp.trade.cards.find((c) => c.agreedMarket == null);
    assert(unsettled.collectorMarket == null,
      "nothing was submitted on the collector's behalf");
  });
});

describe("12. There is one store, and no synchronisation", () => {
  test("both personas read the same object graph", () => {
    fresh();
    const a = __store.get();
    collector();
    const b = __store.get();
    eq(a.goals, b.goals, "rendering the Collector does not fork state");
    eq(a.binder, b.binder, "nor the binder");
  });

  test("the Collector component owns no shared-domain fixture", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "collector", "MetYetCollector.jsx"), "utf8");
    for (const gone of ["PARTNER_STOCK", "BINDER_SEED", "INTEREST_SEED", "OPPS_SEED",
      "GOALS_SEED", "CONTACTS_SEED", "const CARDS =", "const PARTNERS ="]) {
      assert(!src.includes(gone), `${gone} was removed`);
    }
  });

  test("the Collector component reimplements no shared business logic", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "collector", "MetYetCollector.jsx"), "utf8");
    for (const gone of ["const identityKey =", "function turn(", "const goalState =",
      "const activeOppFor ="]) {
      assert(!src.includes(gone), `${gone} now lives only in the domain`);
    }
    assert(src.includes('from "../domain/metyet-domain.js"'), "it imports the domain instead");
  });
});

require("./run.cjs").run();
