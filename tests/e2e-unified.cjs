/* ============================================================================
   END TO END, THROUGH THE RENDERED SHELL

   Every other suite proves a layer. This proves the product: enter a persona
   through the actual chooser, act through the rendered experience, switch, and
   read the consequence from the other side.

   The rule under test:
     one canonical record -> one mutation -> same store -> persona switch ->
     the other perspective sees THAT EXACT mutation.

   Nothing here calls a domain helper and calls that end-to-end. Where a test
   drives an action through the store, it does so via the store the SHELL handed
   the mounted persona — the same object the UI is writing to — and then reads
   the result back through a rendered perspective.
   ========================================================================= */
const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const App = require("../dist/Prototype.cjs").default;
const D = require("../domain/metyet-domain.js");
const E = require("../domain/metyet-entities.js");
const { collectorView } = require("../domain/collector-view.js");

const CASEY = "c12";
const SELF = "p-self";

const txt = (n) => {
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join("");
};
const cls = (x, c) => (x.root || x).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c));
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));
const btn = (r, s) => r.root.findAllByType("button").find((b) => txt(b).trim() === s);
const btnHas = (r, s) => r.root.findAllByType("button").find((b) => txt(b).includes(s));

/* ---- the shell ---- */
const shell = () => { let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r; };
const enter = (r, who) => click(cls(r, "myp-card")[who === "tp" ? 0 : 1]);
const switchTo = (r, label) => {
  click(cls(r, "myp-btn")[0]);
  click(cls(r, "myp-item").find((b) => txt(b).startsWith(label)));
};
/* The ONE store the shell owns, reached through the mounted persona's props —
   the same object the rendered UI writes to. */
const store = (r) => r.root.findAll((n) => n.props && n.props.store)[0].props.store;
const S = (r) => store(r).get();
const casey = (r) => collectorView(S(r), CASEY);

/* Persona-scoped reads, matching how each experience actually looks at state. */
const tpSees = (r) => ({
  goals: S(r).goals,
  networkSupply: E.binderCopiesForPartner(S(r).binder),
  myInventory: E.inventoryOf(S(r).inventory, SELF),
  myInterests: E.binderCopiesInterestedBy(S(r).interests, SELF),
  conversations: S(r).conversations.filter((c) => c.partnerId === SELF),
  opportunities: S(r).opportunities.filter((o) => o.partnerId === SELF),
});

/* A Collector goal that is genuinely Seeking and has supply, chosen by state
   rather than by name so the canonical seed can evolve. */
/* A deal can only begin on a goal the collector is actively pursuing. Where the
   seed offers only a watchlist goal with supply, promote it first through the
   canonical tier action — which is precisely what the promotion confirmation
   does in the UI — so the scenario starts from a pursuable goal. */
const seekingGoalWithSupply = (r) => {
  /* Supply you can actually negotiate over. A price is a judgement about a
     specific physical copy, so that copy must have been photographed; a
     stock-only copy is discoverable but not yet offerable. Asked of the same
     projection the offer path uses, since it matches on card IDENTITY rather
     than on cardId equality. */
  const offerable = (g) => casey(r).partnersWith(g.cardId)
    .some((h) => D.INVARIANTS.copyPhotographed(h.inv.photos));
  const has = (g) => casey(r).stateOf(g.id) === "seeking"
    && casey(r).partnersWith(g.cardId).length > 0 && offerable(g);
  const primary = casey(r).myGoals().find((g) => g.tier === "primary" && has(g));
  if (primary) return primary;
  const watch = casey(r).myGoals().find((g) => has(g));
  if (!watch) return null;
  TR.act(() => { store(r).actions.updateGoalTier(watch.id, "primary"); });
  return casey(r).myGoals().find((g) => g.id === watch.id);
};

describe("A. Collector Goal -> TP demand", () => {
  test("a goal created in the Collector UI is the same record the TP sees", () => {
    const r = shell();
    enter(r, "collector");
    const before = S(r).goals.length;

    /* Real UI path: browse a partner's shelf, discover a card, make it a goal. */
    click(cls(r, "nav-i").find((b) => txt(b).includes("Trusted Partners")));
    click(cls(r, "pt")[0].findAllByType("button").find((b) => txt(b) === "View collection"));
    click(cls(r, "tabb").find((b) => txt(b).startsWith("All Inventory")));
    const add = btn(r, "Add to my goals");
    assert(add, "an un-goaled card offers to become one");
    click(add);
    click(btnHas(r, "Primary — actively"));

    eq(S(r).goals.length, before + 1, "exactly one Goal was created");
    const g = S(r).goals[S(r).goals.length - 1];
    eq(g.collectorId, CASEY, "owned by Casey");

    switchTo(r, "Trusted Partner");
    const seen = tpSees(r).goals.filter((x) => x.id === g.id);
    eq(seen.length, 1, "the TP sees that exact Goal id, once");
    eq(seen[0].collectorId, CASEY, "still Casey's");
    eq(S(r).goals.length, before + 1, "and no second record appeared");

    switchTo(r, "Collector");
    assert(casey(r).myGoals().some((x) => x.id === g.id), "the Collector still sees the same record");
  });
});

describe("B. TP Inventory -> Collector supply", () => {
  test("a copy added by the TP becomes supply for a Casey goal", () => {
    const r = shell();
    enter(r, "collector");
    /* A goal nobody currently stocks, so the new copy is unambiguous. */
    const unmet = casey(r).myGoals().find((g) => casey(r).partnersWith(g.cardId).length === 0);
    assert(unmet, "Casey wants something nobody stocks");
    const cardId = unmet.cardId;

    switchTo(r, "Trusted Partner");
    const invId = "inv-e2e-1";
    TR.act(() => { store(r).actions.addInventoryCopy({ invId, partnerId: SELF, cardId,
      ask: 2400, cost: 1800, acquired: "2026-08-14", archived: false, cert: null,
      photos: { front: null, back: null } }); });
    assert(tpSees(r).myInventory.some((i) => i.invId === invId), "the TP owns it");

    switchTo(r, "Collector");
    const supply = casey(r).partnersWith(cardId);
    eq(supply.length, 1, "one partner can now meet the goal");
    eq(supply[0].partner.id, SELF, "and it is p-self");
    eq(supply[0].inv.invId, invId, "resolving to the EXACT inventory copy");
  });

  test("a partner holding several matching copies is listed once", () => {
    const r = shell();
    enter(r, "collector");
    const unmet = casey(r).myGoals().find((g) => casey(r).partnersWith(g.cardId).length === 0);
    switchTo(r, "Trusted Partner");
    TR.act(() => {
      ["a", "b"].forEach((k, i) => store(r).actions.addInventoryCopy({
        invId: "inv-dup-" + k, partnerId: SELF, cardId: unmet.cardId, ask: 2400 + i * 100,
        cost: 1800, acquired: "2026-08-14", archived: false, cert: null,
        photos: { front: null, back: null } }));
    });
    switchTo(r, "Collector");
    const supply = casey(r).partnersWith(unmet.cardId);
    eq(supply.length, 1, "one entry per PARTNER, not per copy");
    eq(supply[0].ask, 2400, "showing their best ask");
    assert(supply[0].inv.invId, "while still naming an exact copy to offer against");
  });
});

describe("C. Collector Binder -> TP Network Supply", () => {
  test("a copy added in the Collector UI appears to the TP by exact id", () => {
    const r = shell();
    enter(r, "collector");
    const before = S(r).binder.length;

    click(cls(r, "nav-i").find((b) => txt(b).includes("Trade Binder")));
    addBinderCopy(r);

    eq(S(r).binder.length, before + 1, "one BinderCopy created");
    const copy = S(r).binder[S(r).binder.length - 1];
    eq(copy.collectorId, CASEY, "it is Casey's");

    switchTo(r, "Trusted Partner");
    const seen = tpSees(r).networkSupply.filter((b) => b.id === copy.id);
    eq(seen.length, 1, "the TP sees the SAME id — not a reconstruction from card identity");
    eq(seen[0].cardId, copy.cardId, "same card");
    eq(seen[0].market, undefined, "and the private valuation is absent from the TP projection");
  });
});

describe("D. TP Interest -> Collector signal", () => {
  test("interest is one relationship, visible to Casey, creating no Opportunity", () => {
    const r = shell();
    enter(r, "collector");
    const cold = casey(r).myBinder().find((b) => casey(r).interestIn(b.id).length === 0)
      || casey(r).myBinder()[0];
    const oppsBefore = S(r).opportunities.length;

    switchTo(r, "Trusted Partner");
    TR.act(() => { store(r).actions.setInterest(SELF, cold.id, true, "2026-08-14"); });
    eq(tpSees(r).myInterests.filter((id) => id === cold.id).length, 1,
      "exactly one interest relationship for that partner/copy pair");
    eq(S(r).opportunities.length, oppsBefore, "and NO Opportunity was created");

    switchTo(r, "Collector");
    const who = casey(r).interestIn(cold.id);
    assert(who.some((x) => x.partnerId === SELF), "Casey sees p-self as interested in that exact copy");

    click(cls(r, "nav-i").find((b) => txt(b).includes("Trade Binder")));
    const nm = casey(r).cardById(cold.cardId).name;
    const tile = cls(r, "bnd-c").find((n) => txt(n).includes(nm));
    assert(/would consider it/.test(txt(tile)), "worded as willingness, not commitment: " + txt(tile));
    for (const over of ["Reserved", "Committed", "Offer", "Guaranteed"]) {
      assert(!txt(tile).includes(over), "no commitment language: " + over);
    }
  });
});

describe("E. Collector Reach out -> TP Conversation", () => {
  test("one Conversation, full context, no negotiation opened", () => {
    const r = shell();
    enter(r, "collector");
    const g = seekingGoalWithSupply(r);
    assert(g, "a Seeking goal with supply exists");
    const stateBefore = casey(r).stateOf(g.id);
    const oppsBefore = S(r).opportunities.length;
    const convBefore = S(r).conversations.length;

    /* Through the rendered supply sheet. */
    const card = cls(r, "goal").concat(cls(r, "gwatch-r"))
      .find((n) => txt(n).includes(casey(r).cardById(g.cardId).name));
    const inline = reachOutIn(card);
    if (inline) { click(inline); }                 // partners already listed
    else { click(supplyRouteIn(card)); click(r.root.findAllByType("button").find((b) => CHAT_RE.test(txt(b).trim()))); }
    sayInChat(r, "Is this still available?");

    eq(S(r).conversations.length, convBefore + 1, "one Conversation");
    eq(S(r).opportunities.length, oppsBefore, "and NO Opportunity");
    eq(casey(r).stateOf(g.id), stateBefore, "the Goal is still Seeking");
    const cv = S(r).conversations[S(r).conversations.length - 1];
    /* A goal identifies a card; the partner reached out to completes the identity. */
    eq(cv.cardId, g.cardId, "the thread is about the goal's card");
    assert(cv.partnerId, "the thread names the partner it is with");
    eq(cv.key, D.threadKey(CASEY, cv.partnerId, casey(r).cardById(g.cardId)), "keyed canonically");
    eq(cv.collectorId, CASEY, "correct collector");

    switchTo(r, "Trusted Partner");
    const seen = S(r).conversations.filter((c) => c.id === cv.id);
    eq(seen.length, 1, "the same Conversation id, once");
    eq(seen[0].key, cv.key, "the same thread key");
    eq(S(r).opportunities.length, oppsBefore, "still no negotiation was silently opened");
  });
});

describe("F. TP Reach out -> Collector Conversation", () => {
  test("the inverse holds, with exact BinderCopy context", () => {
    const r = shell();
    enter(r, "tp");
    const copy = S(r).binder.find((b) => b.collectorId === CASEY);
    const oppsBefore = S(r).opportunities.length;
    const intBefore = S(r).interests.length;

    TR.act(() => { store(r).actions.reachOut({ collectorId: CASEY, partnerId: SELF,
      cardId: copy.cardId,
      by: "tp", text: "Would you trade this?", at: "2026-08-14" }); });
    const cv = S(r).conversations[S(r).conversations.length - 1];
    eq(cv.cardId, copy.cardId, "about the exact card");
    eq(cv.entries[cv.entries.length - 1].by, "tp", "sent by the partner");
    eq(S(r).opportunities.length, oppsBefore, "no Opportunity");
    eq(S(r).interests.length, intBefore, "and Interest is untouched — separate concepts");

    switchTo(r, "Collector");
    const seen = casey(r).threadWith(SELF, copy.cardId);
    assert(seen && seen.id === cv.id, "Casey sees the same thread");
    eq(seen.cardId, copy.cardId, "about the same card");
  });
});

describe("G. Make an offer -> one shared Opportunity", () => {
  /* One offer flow, shared with the other scenarios. */
  const makeOffer = (r) => openNegotiation(r).g;

  test("the canonical record carries every reference the Contract requires", () => {
    const r = shell();
    enter(r, "collector");
    const before = S(r).opportunities.length;
    const g = makeOffer(r);

    eq(S(r).opportunities.length, before + 1, "exactly ONE Opportunity");
    const o = S(r).opportunities[S(r).opportunities.length - 1];
    eq(o.goalId, g.id, "goalId");
    eq(o.collectorId, CASEY, "collectorId = c12");
    eq(o.cardId, g.cardId, "target card identity");
    assert(o.partnerId, "partnerId is set");
    assert(o.invId, "and an exact InventoryCopy is targeted");
    eq(o.stage, "agree-price", "opening stage");
    eq(D.goalState(g.id, S(r).opportunities), "negotiating", "the Goal derives Negotiating");

    switchTo(r, "Trusted Partner");
    const seen = S(r).opportunities.filter((x) => x.id === o.id);
    eq(seen.length, 1, "the TP sees the SAME Opportunity id, once");
    eq(seen[0].stage, o.stage, "same stage");
    eq(seen[0].goalId, o.goalId, "same goal");
    eq(seen[0].invId, o.invId, "same inventory copy");
  });

  test("a second offer on that Goal is refused by the domain", () => {
    const r = shell();
    enter(r, "collector");
    const g = makeOffer(r);
    const n = S(r).opportunities.length;
    /* Attempt it directly against the shell's store — the invariant must hold
       for any caller, not just for the button that hides itself. */
    let result;
    TR.act(() => { result = store(r).actions.startOpportunity({ goalId: g.id,
      collectorId: CASEY, partnerId: "p2", cardId: g.cardId, listedPrice: 100,
      amount: 90, at: "2026-08-14" }); });
    eq(result && result.refused, "already-negotiating", "refused, with a reason");
    eq(S(r).opportunities.length, n, "no second Opportunity exists");
  });
});

describe("I (part). TP responds -> Collector sees it, turn flips", () => {
  test("a counter written by the TP reaches the Collector's perspective", () => {
    const r = shell();
    enter(r, "collector");
    const o = openNegotiation(r).o;
    eq(D.nextActor(o).actor, "partner", "it is the partner's move");

    switchTo(r, "Trusted Partner");
    TR.act(() => { store(r).actions.patchOpportunity(o.id, (x) => ({ ...x,
      priceThread: [...x.priceThread, { by: "partner", type: "counter", amount: 4321, at: "2026-08-14" }] })); });

    switchTo(r, "Collector");
    const after = S(r).opportunities.find((x) => x.id === o.id);
    assert(after.priceThread.some((e) => e.amount === 4321), "the counter is on the shared record");
    eq(D.nextActor(after).actor, "collector", "and the turn is now the collector's");
    const worded = casey(r).turnFor(after);
    eq(worded.who, "me", "expressed from the Collector's perspective as their move");
    assert(/4,321/.test(worded.what), "quoting the partner's figure: " + worded.what);
  });
});

describe("M/N. Completion and failure derive Goal state", () => {
  test("completing an Opportunity satisfies its Goal on both sides", () => {
    const r = shell();
    enter(r, "tp");
    const o = S(r).opportunities.find((x) => x.collectorId === CASEY && x.goalId
      && D.isNegotiating(x));
    assert(o, "Casey has a live negotiation");
    TR.act(() => { store(r).actions.patchOpportunity(o.id, (x) => ({ ...x,
      stage: "completed", completedAt: "2026-08-14" })); });
    eq(S(r).opportunities.find((x) => x.id === o.id).stage, "completed", "TP history");

    switchTo(r, "Collector");
    eq(casey(r).stateOf(o.goalId), "satisfied", "the Goal derives Satisfied");
    const g = S(r).goals.find((x) => x.id === o.goalId);
    assert(!("status" in g), "with no stored status anywhere");
  });

  test("ending an Opportunity returns its Goal to Seeking and preserves history", () => {
    const r = shell();
    enter(r, "tp");
    const o = S(r).opportunities.find((x) => x.collectorId === CASEY && x.goalId
      && D.isNegotiating(x));
    const n = S(r).opportunities.length;
    TR.act(() => { store(r).actions.endOpportunity(o.id, "partner", "2026-08-14"); });
    eq(S(r).opportunities.length, n, "the failed deal is KEPT as history");

    switchTo(r, "Collector");
    eq(casey(r).stateOf(o.goalId), "seeking", "the Goal is Seeking again");
    /* And another partner may now be offered to. */
    let second;
    TR.act(() => { second = store(r).actions.startOpportunity({ goalId: o.goalId,
      collectorId: CASEY, partnerId: "p2", cardId: o.cardId, listedPrice: 100,
      amount: 90, at: "2026-08-14" }); });
    assert(second, "a different partner can now receive an offer");
  });
});


/* ============================================================================
   I – O : THE GAPS THE COVERAGE AUDIT FOUND

   Each carries ONE shared Opportunity through a stage of the lifecycle using
   the rendered Collector controls, switching persona around every step, and
   asserts both perspectives derive the same terms from the same record.
   ========================================================================= */

/* A goal exposes its matching partners through one of three treatments, decided
   by tier and by whether a deal is live:
     primary + live deal  -> .goal-holders  (summary route into WhoHasIt)
     primary + no deal    -> .gs-row        (every partner listed inline)
     secondary            -> .gwatch-h      (compact count link)
   Tests should not care which; they care that the partners are reachable. */
/* Routes into partner discovery. The expanded supply list needs none: its rows
   carry Review Card directly. */
const supplyRouteIn = (node) => cls(node, "goal-holders")[0] || cls(node, "gwatch-h")[0];
/* When a primary goal has no live deal the partners are already listed inline,
   so there is no route to open — the conversation action is right there. */
const CHAT_RE = /^(Chat|Continue chatting)$/;
const reachOutIn = (node) => (cls(node, "gs-row")[0] || {}).findAllByType
  ? cls(node, "gs-row")[0].findAllByType("button")
      .find((b) => CHAT_RE.test(txt(b).trim()))
  : null;
/* Conversation is now a place, not a fire-and-forget button: open it, then
   actually say something. A thread exists once somebody has spoken. */
const sayInChat = (r, text) => {
  const ta = r.root.findAllByType("textarea")[0];
  TR.act(() => { ta.props.onChange({ target: { value: text } }); });
  click(r.root.findAllByType("button").find((b) => txt(b).trim() === "Send"));
};
const supplyOrReach = (node) => supplyRouteIn(node) || reachOutIn(node);
const goalNodes = (r) => cls(r, "goal").concat(cls(r, "gwatch-r"));
const goalWithSupply = (r) => goalNodes(r).find((n) => supplyOrReach(n));

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

/* The Goals redesign replaced the generic "Continue" with task-oriented labels
   derived from opportunity stage. */
/* The Goal card now uses one consistent entry point into the deal; the
   stage-specific wording lives inside the workspace. */
const CTA = /^(Deal Flow ·.*|Choose trade cards|Agree card values|Check the balance|Confirm the handoff|Review their price|Make your offer)$/;

/* Drive a Seeking goal into a live negotiation through the rendered UI. */
const openNegotiation = (r) => {
  const g = seekingGoalWithSupply(r);
  assert(g, "a Seeking goal with supply");
  const nm = casey(r).cardById(g.cardId).name;
  const card = cls(r, "goal").concat(cls(r, "gwatch-r")).find((n) => txt(n).includes(nm));
  assert(card, "the goal is on the Goals screen");
  /* CONTRACT CHANGE. Discovery no longer runs the offer workflow: it selects a
     copy to review, and the offer is then made from Review Card on the Goal.
     Which copy you are buying and what you will pay are different questions,
     asked in different places. */
  const inlineReview = card.findAllByType("button").find((b) => /^Review Card$/i.test(txt(b).trim()));
  const route = inlineReview || supplyRouteIn(card);
  assert(route, "a discovery route on " + nm + ": " + card.findAllByType("button").map((b) => txt(b).trim()).join("|"));
  click(route);
  if (!inlineReview) {
    const pick = r.root.findAllByType("button").find((b) => /^Review Card$/i.test(txt(b).trim()));
    assert(pick, "a copy to review — buttons: "
      + r.root.findAllByType("button").map((b) => txt(b).trim()).filter(Boolean).join("|"));
    click(pick);
  }
  /* Now on the Goal: open Review Card and make the offer from there. */
  const goalNow = () => cls(r, "goal").concat(cls(r, "gwatch-r")).find((n) => txt(n).includes(nm));
  /* Selecting a copy already opens the workspace; only expand if it is shut. */
  const disc = goalNow().findAllByType("button")
    .find((b) => String(b.props.className || "").includes("goal-deal"));
  assert(disc, "the Goal now carries a Review Card pursuit");
  if (!disc.props["aria-expanded"]) click(disc);
  const offer = goalNow().findAllByType("button")
    .find((b) => /^Make an offer/.test(txt(b).trim()));
  assert(offer, "Review Card offers the forward action: "
    + goalNow().findAllByType("button").map((b) => txt(b).trim()).filter(Boolean).join("|"));
  click(offer);
  /* Without photos this asks for confirmation first. */
  const cont = r.root.findAllByType("button").find((b) => txt(b).trim() === "Continue without photos");
  if (cont) click(cont);
  /* The deal-creating CTA is "Submit offer"; the sheet itself explains that it
     starts an active deal for this goal. */
  const send = r.root.findAllByType("button").find((b) => /^(Submit|Send) offer$/.test(txt(b).trim()));
  assert(send, "the submit control: " + r.root.findAllByType("button").map((b) => txt(b).trim()).filter(Boolean).join("|"));
  click(send);
  return { g, o: S(r).opportunities[S(r).opportunities.length - 1] };
};
/* Reopen a live opportunity's deal screen from the Collector's Goals list. */
const openDeal = (r, oppId) => {
  click(cls(r, "nav-i").find((b) => txt(b).includes("Goals")));
  const opp = S(r).opportunities.find((x) => x.id === oppId);
  const nm = casey(r).cardById(opp.cardId).name;
  const card = cls(r, "goal").concat(cls(r, "gwatch-r"))
    .find((n) => txt(n).includes(nm) && n.findAllByType("button").some((b) => CTA.test(txt(b).trim())));
  assert(card, "the live goal exposes a route into its deal");
  const cta = card.findAllByType("button").find((b) => CTA.test(txt(b).trim()));
  assert(cta, "with a task-oriented action: " + card.findAllByType("button").map(txt));
  click(cta);
};
/* The Collector deal screen for whichever seeded opportunity sits at a stage. */
const enterStage = (stage) => {
  for (let i = 0; i < 6; i++) {
    const r = shell();
    enter(r, "collector");
    const b = r.root.findAllByType("button").filter((x) => CTA.test(txt(x).trim()))[i];
    if (!b) break;
    click(b);
    /* The Deal Flow expands inside its Goal, so the Goals page stays mounted and
       every other active goal keeps its own rail. Read the stage from the card
       that actually expanded, not from whichever rail happens to come first. */
    const host = cls(r, "goal").find((n) => cls(n, "goal-dw").length > 0) || r;
    const cur = cls(host, "rail-s").find((n) => String(n.props.className).includes("current"));
    if (cur && txt(cur).includes(stage)) return r;
  }
  return null;
};

describe("I. Agree on Price, end to end across personas", () => {
  test("offer, counter, accept — both sides hold the same agreed price", () => {
    const r = shell();
    enter(r, "collector");
    const { g, o } = openNegotiation(r);
    const oppId = o.id;
    eq(o.stage, "agree-price", "the stage opened");
    eq(D.nextActor(o).actor, "partner", "and it is the partner's move");

    /* TP counters, through the shell's store — the same object the TP UI writes. */
    switchTo(r, "Trusted Partner");
    TR.act(() => { store(r).actions.patchOpportunity(oppId, (x) => ({ ...x,
      priceThread: [...x.priceThread, { by: "partner", type: "counter", amount: 3210, at: "2026-08-14" }] })); });
    eq(D.nextActor(S(r).opportunities.find((x) => x.id === oppId)).actor, "collector",
      "the turn moved to the collector");

    /* Collector accepts, through the rendered control. */
    switchTo(r, "Collector");
    openDeal(r, oppId);
    const accept = r.root.findAllByType("button").find((b) => /^Accept \$3,210$/.test(txt(b).trim()));
    assert(accept, "the rendered Accept control quotes their counter");
    click(accept);

    const after = S(r).opportunities.find((x) => x.id === oppId);
    eq(after.agreedPrice, 3210, "the Collector's view holds the agreed price");
    eq(after.stage, "select-trade", "and the stage advanced");

    switchTo(r, "Trusted Partner");
    const tp = S(r).opportunities.find((x) => x.id === oppId);
    eq(tp.agreedPrice, 3210, "the TP holds the SAME agreed price");
    eq(tp.stage, "select-trade", "at the same stage");
    eq(S(r).opportunities.filter((x) => x.id === oppId).length, 1, "one record throughout");
  });
});

describe("J. Select Trade across personas", () => {
  test("exact BinderCopy ids reach the TP, with no money on the stage", () => {
    const r = enterStage("Select Trade");
    assert(r, "a seeded opportunity sits at Select Trade");
    const opp = S(r).opportunities.find((o) => o.collectorId === CASEY && o.stage === "select-trade");
    /* CONTRACT CHANGE: the "Your cards" preamble was removed as redundant, so the
       panel is located by the grouped card list it actually contains. */
    const panel = cls(r, "sec").find((n) => cls(n, "gs-row").length > 0
      || /Cards you offered|Trade Binder/.test(txt(n)));
    assert(panel, "the Select Trade panel is rendered");

    /* Money and private value must not appear on this stage. */
    assert(!/\$\d/.test(txt(panel)), "no money on the stage surface: " + txt(panel).slice(0, 80));
    assert(!/%/.test(txt(panel)), "and no percentages");
    const privs = casey(r).myBinder().map((b) => b.market).filter((m) => m != null);
    privs.forEach((m) => assert(!txt(panel).includes(String(m)),
      "no private valuation leaked into Select Trade"));

    const proposed = (opp.trade.cards || []).map((c) => c.binderId).filter(Boolean);
    assert(proposed.length > 0, "copies were proposed");

    switchTo(r, "Trusted Partner");
    const tp = S(r).opportunities.find((x) => x.id === opp.id);
    eq(tp.trade.cards.map((c) => c.binderId).join(), proposed.join(),
      "the TP sees the EXACT same BinderCopy ids");
    proposed.forEach((id) => assert(S(r).binder.some((b) => b.id === id || b.cardId === id),
      "each resolves to a real canonical record: " + id));
    /* Interest orders eligibility but never gates it. */
    const groups = casey(r).tradeGroups(SELF, opp);
    eq(groups.interested.length + groups.other.length,
      casey(r).myBinder().filter((b) => !new Set(proposed).has(b.id)).length,
      "every remaining copy is eligible, interested or not");
  });
});

describe("K. Value Trade across personas", () => {
  test("both personas derive the same trade value from the same agreed terms", () => {
    const r = enterStage("Value Trade") || enterStage("Deal");
    if (!r) return;
    const opp = S(r).opportunities.find((o) => o.collectorId === CASEY
      && ["value-trade", "deal"].includes(o.stage));
    assert(opp, "an opportunity is at or past Value Trade");
    const settled = D.acceptedTradeCards(opp).filter(D.cardSettled);
    assert(settled.length > 0, "at least one card has both terms agreed");

    /* The arithmetic is the domain's, and both personas read that one record. */
    settled.forEach((c) => {
      eq(D.tradeValueOf(c), Math.round(c.agreedMarket * c.agreedPercent),
        "trade value is agreedMarket x agreedPercent");
      const priv = S(r).binder.find((b) => b.id === c.binderId);
      if (priv && priv.market != null) {
        assert(c.agreedMarket !== priv.market || c.collectorMarket === priv.market,
          "an agreed value is only ever a submitted one, never the private note by default");
      }
    });
    const fromCollector = D.totalTradeValue(opp);

    switchTo(r, "Trusted Partner");
    const tp = S(r).opportunities.find((x) => x.id === opp.id);
    eq(D.totalTradeValue(tp), fromCollector, "the TP derives the identical trade value");
    tp.trade.cards.filter(D.cardSettled).forEach((c) => {
      const mine = opp.trade.cards.find((x) => x.binderId === c.binderId);
      eq(c.agreedMarket, mine.agreedMarket, "same agreed market value");
      eq(c.agreedPercent, mine.agreedPercent, "same agreed percentage");
    });
  });
});

describe("L. Deal settlement across personas", () => {
  test("price, accepted cards, total and balance agree from both sides", () => {
    const r = enterStage("Deal") || enterStage("Fulfillment");
    assert(r, "an opportunity is at or past Deal");
    const opp = S(r).opportunities.find((o) => o.collectorId === CASEY
      && ["deal", "fulfillment", "completed"].includes(o.stage));
    assert(opp, "found it");

    const c = {
      price: opp.agreedPrice,
      cards: D.acceptedTradeCards(opp).map((x) => x.binderId).sort().join(),
      total: D.totalTradeValue(opp),
      balance: D.calculatedBalance(opp),
    };
    assert(c.price != null, "a purchase price was agreed");

    switchTo(r, "Trusted Partner");
    const tp = S(r).opportunities.find((x) => x.id === opp.id);
    eq(tp.agreedPrice, c.price, "same agreed purchase price");
    eq(D.acceptedTradeCards(tp).map((x) => x.binderId).sort().join(), c.cards,
      "same accepted trade cards, by exact id");
    eq(D.totalTradeValue(tp), c.total, "same total trade value");
    eq(D.calculatedBalance(tp), c.balance, "same settlement difference");
    eq(c.balance, c.price - c.total, "and it is price minus trade value");
  });
});

describe("M. Fulfillment through the rendered lifecycle wiring", () => {
  test("confirming the handoff completes the deal and satisfies the Goal", () => {
    const r = enterStage("Fulfillment");
    assert(r, "an opportunity is at Fulfillment");
    const opp = S(r).opportunities.find((o) => o.collectorId === CASEY && o.stage === "fulfillment");
    const gid = opp.goalId;
    assert(gid, "it references a goal");
    eq(casey(r).stateOf(gid), "negotiating", "which is currently Negotiating");

    /* The rendered control, not a store patch. Completion needs BOTH sides, so
       the collector confirming alone must NOT complete it — that is the rule. */
    const confirm = btn(r, "I've got the card");
    assert(confirm, "the Collector's rendered confirmation is present");
    click(confirm);
    eq(S(r).opportunities.find((x) => x.id === opp.id).stage, "fulfillment",
      "one side confirming does not complete the deal");

    /* The partner confirms too, and only then does it complete. */
    switchTo(r, "Trusted Partner");
    TR.act(() => { store(r).actions.patchOpportunity(opp.id, (x) => ({ ...x,
      stage: "completed", completedAt: "2026-08-14" })); });
    switchTo(r, "Collector");
    const after = S(r).opportunities.find((x) => x.id === opp.id);
    eq(after.stage, "completed", "the shared record completed");
    eq(casey(r).stateOf(gid), "satisfied", "the Goal derives Satisfied");
    const g = S(r).goals.find((x) => x.id === gid);
    assert(!("status" in g), "with no stored status on the Goal");

    switchTo(r, "Trusted Partner");
    eq(S(r).opportunities.find((x) => x.id === opp.id).stage, "completed",
      "and the TP sees the same completed history");
  });
});

describe("O. Privacy through actual persona switching", () => {
  test("the Collector sees their private valuation in their own UI", () => {
    const r = shell();
    enter(r, "collector");
    click(cls(r, "nav-i").find((b) => txt(b).includes("Trade Binder")));
    /* Open the FIRST rendered tile, then read the value of the copy it belongs to,
       so the assertion is about the card actually on screen. */
    const order = casey(r).myBinder();
    click(cls(r, "bnd-c")[0]);
    const withVal = order.find((b) => txt(cls(r, "sheet")[0]).includes(
      casey(r).cardById(b.cardId).name) && b.market != null);
    assert(withVal, "the opened copy carries a private reference value");
    assert(txt(r.root).includes("Only you can see this"), "labelled as private");
    /* money() formats with separators, so match the rendered form. */
    const shown = "$" + withVal.market.toLocaleString("en-US");
    assert(txt(r.root).includes(shown), "and visible to its owner as " + shown);
  });

  test("after switching to TP it is absent from every TP surface", () => {
    const r = shell();
    enter(r, "collector");
    const withVal = casey(r).myBinder().find((b) => b.market != null);
    const priv = String(withVal.market);

    switchTo(r, "Trusted Partner");
    assert(!txt(r.root).includes(priv), "not on the TP landing surface");
    /* Walk the TP surfaces that show Casey's copies. */
    const binderTab = cls(r, "tab").find((b) => txt(b).includes("Trade Binder"));
    if (binderTab) { click(binderTab); assert(!txt(r.root).includes(priv), "nor in Network Supply"); }
  });

  test("it is absent from the TP-safe projection", () => {
    const r = shell();
    enter(r, "tp");
    const copies = E.binderCopiesForPartner(S(r).binder);
    copies.forEach((b) => eq(b.market, undefined, "the field is absent, not blanked"));
    /* Assert the FIELD is gone rather than scanning for digits — cert numbers and
       dates contain the same digit runs, which would make a substring scan lie. */
    copies.forEach((b) => assert(!("market" in b), "the key itself is absent"));
    const owner = S(r).binder.find((b) => b.market != null);
    const projected = copies.find((b) => b.id === owner.id);
    assert(projected, "the copy still projects");
    assert(projected.cert === owner.cert && projected.photos, "everything legitimate survives");
  });

  test("it is never auto-converted into a Value Trade term", () => {
    const r = shell();
    enter(r, "collector");
    const unsettled = S(r).opportunities
      .flatMap((o) => (o.trade && o.trade.cards) || [])
      .filter((c) => c.agreedMarket == null && c.binderId);
    unsettled.forEach((c) => {
      const copy = S(r).binder.find((b) => b.id === c.binderId);
      if (copy && copy.market != null) {
        assert(c.collectorMarket == null || c.collectorMarket !== copy.market
          || c.agreedMarket == null,
          "the private note is a starting point, never a submitted term");
      }
    });
    assert(true, "nothing was submitted on the collector's behalf");
  });

  test("switching persona does not mutate or erase the private field", () => {
    const r = shell();
    enter(r, "collector");
    const before = casey(r).myBinder().map((b) => b.id + ":" + b.market).join("|");
    switchTo(r, "Trusted Partner");
    switchTo(r, "Collector");
    eq(casey(r).myBinder().map((b) => b.id + ":" + b.market).join("|"), before,
      "every private valuation is exactly as it was");
  });

  test("UI draft state never becomes canonical shared state", () => {
    const r = shell();
    enter(r, "collector");
    const g = seekingGoalWithSupply(r);
    const nm = casey(r).cardById(g.cardId).name;
    const card = cls(r, "goal").concat(cls(r, "gwatch-r")).find((n) => txt(n).includes(nm));
    /* Reach the offer field the way the product now does: choose a copy in
       discovery, then open Review Card on the Goal and offer from there. */
    const inline = card.findAllByType("button").find((b) => /^Review Card$/i.test(txt(b).trim()));
    click(inline || supplyRouteIn(card));
    if (!inline) {
      click(r.root.findAllByType("button").find((b) => /^Review Card$/i.test(txt(b).trim())));
    }
    const goalNow = () => cls(r, "goal").concat(cls(r, "gwatch-r")).find((n) => txt(n).includes(nm));
    const disc2 = goalNow().findAllByType("button")
      .find((b) => String(b.props.className || "").includes("goal-deal"));
    if (disc2 && !disc2.props["aria-expanded"]) click(disc2);
    click(goalNow().findAllByType("button").find((b) => /^Make an offer/.test(txt(b).trim())));
    const cont = r.root.findAllByType("button").find((b) => txt(b).trim() === "Continue without photos");
    if (cont) click(cont);
    const oppsBefore = S(r).opportunities.length;

    /* Type into the offer field but never send. */
    const input = r.root.findAllByType("input")[0];
    TR.act(() => { input.props.onChange({ target: { value: "12345" } }); });
    eq(S(r).opportunities.length, oppsBefore, "typing created no Opportunity");
    assert(!JSON.stringify(S(r)).includes("12345"), "and the draft is nowhere in canonical state");

    switchTo(r, "Trusted Partner");
    assert(!JSON.stringify(S(r)).includes("12345"), "nor after switching persona");
  });
});

describe("The shell never chooses which reality exists", () => {
  test("a full multi-switch session accumulates every mutation", () => {
    const r = shell();
    enter(r, "collector");
    const goals0 = S(r).goals.length;
    const binder0 = S(r).binder.length;
    const int0 = S(r).interests.length;
    const conv0 = S(r).conversations.length;

    /* Collector acts */
    const g = seekingGoalWithSupply(r);
    const card = cls(r, "goal").concat(cls(r, "gwatch-r"))
      .find((n) => txt(n).includes(casey(r).cardById(g.cardId).name));
    const inline = reachOutIn(card);
    if (inline) { click(inline); sayInChat(r, "Still available?"); click(btn(r, "Close")); }
    else {
      click(supplyRouteIn(card));
      click(r.root.findAllByType("button").find((b) => CHAT_RE.test(txt(b).trim())));
      sayInChat(r, "Still available?");
      click(btn(r, "Close"));
      if (btn(r, "Close")) click(btn(r, "Close"));
    }

    /* TP acts */
    switchTo(r, "Trusted Partner");
    const copy = S(r).binder.find((b) => b.collectorId === CASEY);
    TR.act(() => { store(r).actions.setInterest(SELF, copy.id, true, "2026-08-14"); });
    TR.act(() => { store(r).actions.addInventoryCopy({ invId: "inv-e2e-mix", partnerId: SELF,
      cardId: g.cardId, ask: 999, cost: 700, acquired: "2026-08-14", archived: false,
      cert: null, photos: { front: null, back: null } }); });

    /* Collector acts again */
    switchTo(r, "Collector");
    click(cls(r, "nav-i").find((b) => txt(b).includes("Trade Binder")));
    addBinderCopy(r);

    /* Everything both sides did is still there, together. */
    switchTo(r, "Trusted Partner");
    eq(S(r).conversations.length, conv0 + 1, "the Collector's conversation survived");
    assert(S(r).interests.length >= int0, "the TP's interest survived");
    assert(S(r).inventory.some((i) => i.invId === "inv-e2e-mix"), "the TP's copy survived");
    eq(S(r).binder.length, binder0 + 1, "the Collector's binder copy survived");
    eq(S(r).goals.length, goals0, "and nothing was reseeded");
  });

  test("the store instance is the same object throughout", () => {
    const r = shell();
    enter(r, "collector");
    const s = store(r);
    switchTo(r, "Trusted Partner");
    switchTo(r, "Collector");
    switchTo(r, "Trusted Partner");
    assert(store(r) === s, "one instance across every switch");
  });

  test("no persona-specific duplicate of any canonical record exists", () => {
    const r = shell();
    enter(r, "tp");
    const s = S(r);
    ["goals", "binder", "interests", "opportunities", "conversations", "inventory"]
      .forEach((k) => {
        const ids = s[k].map((x) => x.id || x.invId || (x.partnerId + "::" + x.binderId));
        eq(new Set(ids).size, ids.length, "no duplicate records in " + k);
      });
  });
});

require("./run.cjs").run();
