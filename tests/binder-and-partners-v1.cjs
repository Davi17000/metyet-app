/* ============================================================================
   SUPPLY AND NETWORK, NOT A SECOND WORKFLOW

   Goals is where transactions happen. Trade Binder answers a narrower question
   — what do I own that I'd put into a trade? — and Trusted Partners answers
   another: who do I trust to help, and how does that connect to the first two.

   Neither may hold its own idea of a deal. Both PROJECT from the same
   opportunities Goals owns, which is why availability is derived rather than
   stored: a flag would give two answers the moment a deal moved on.

   The boundary follows the trade model already in force. A card that has only
   been PROPOSED is not spoken for — the partner hasn't accepted it, and the
   same copy may sit in more than one proposal until somebody does. It becomes
   "in a deal" when a partner accepts it into an active trade, and "traded" when
   that deal completes. Withdrawing or rejecting releases it.

   Identity is the binder copy throughout. Two copies of one card are two
   objects and can be in two different places at once.
   ========================================================================= */

process.env.METYET_DEV = "1";

const { describe, test, assert, eq } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");
const M = require("../dist/MetYet.cjs");
const { createStore } = require("./fixture-store.cjs");   // hand-built worlds declare their Relationships (contract §2)
const { collectorView } = require("../domain/collector-view.js");

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const VIEW = fs.readFileSync(path.join(ROOT, "domain", "collector-view.js"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const AT = "2026-08-19";
const ME = "casey";

const WANT = { id: "kt", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };
const HAVE = { id: "ka", name: "Mew ex", set: "Dragon Frontiers", number: "1", variant: "",
  edition: "Unlimited", language: "English", grade: "PSA 8", condition: null };

/* A collector with two copies of the same card, and one partner. */
const world = () => {
  const st = createStore({
    catalog: [HAVE, WANT],
    collectors: [{ id: ME, name: "Casey", prefs: [] }],
    partners: [{ id: "nl", name: "Northline Cards" }, { id: "cv", name: "Card Vault" }],
    goals: [], interests: [], conversations: [], opportunities: [],
    preferences: [], photoRequests: [], copyReviews: [],
    collectorCopies: [
      { offered: true, id: "b1", collectorId: ME, cardId: "ka", market: 900, photos: { front: "f", back: "b" } },
      { offered: true, id: "b2", collectorId: ME, cardId: "ka", market: 900, photos: { front: "f", back: "b" } },
    ],
    inventory: [{ invId: "inv-1", partnerId: "nl", cardId: "kt", ask: 4000,
      archived: false, photos: { front: "f", back: "b" } }],
  });
  const view = () => collectorView(st.get(), ME);
  return { st, view };
};
/* Take a goal to Select Trade with the given binder copies proposed. */
const offering = (w, binderIds) => {
  const g = w.st.actions.addGoal({ collectorId: ME, cardId: "kt", tier: "primary", at: AT });
  const o = w.st.actions.startOpportunity({ goalId: g, collectorId: ME, partnerId: "nl",
    cardId: "kt", invId: "inv-1", listedPrice: 4000, amount: 3800, at: AT });
  w.st.actions.agreePrice({ oppId: o, amount: 3800, by: "tp", at: AT });
  const rows = binderIds.map((bid) => M.emptyTradeCard("ka", null, null, bid));
  w.st.actions.patchOpportunity(o, (x) => ({ ...x, stage: "select-trade",
    trade: { ...x.trade, submitted: true, cards: rows } }));
  return { o, rows };
};
const stateOf = (w, bid) => w.view().collectorCopyState(bid).state;

describe("A. Availability is derived from the deals themselves", () => {
  test("an untouched copy is available", () => {
    const w = world();
    eq(stateOf(w, "b1"), "available", "nothing has claimed it");
    eq(w.view().collectorCopyState("b1").opp, null, "and no deal is named");
  });

  /* PHASE 1 (contract §4): submitting the package RESERVES each exact copy,
     and one BinderCopy may sit in only one active submitted package at a time.
     Superseded: "a proposed copy is not yet spoken for" (the same copy could sit
     in several packages until a partner decided). A proposal is still not an
     acceptance — reserved is not committed. */
  test("a proposed copy is reserved, not yet committed", () => {
    const w = world();
    offering(w, ["b1"]);
    eq(stateOf(w, "b1"), "reserved", "submitted, but the partner has not accepted it");
    eq(stateOf(w, "b2"), "available", "its twin is untouched");
  });

  test("acceptance into an active deal claims it", () => {
    const w = world();
    const { o } = offering(w, ["b1"]);
    w.st.actions.reviewTradeCards({ oppId: o, decision: "accepted", at: AT });
    eq(stateOf(w, "b1"), "in-deal", "now it is committed");
    eq(w.view().collectorCopyState("b1").opp.id, o, "and the deal is identified");
  });

  test("completion makes it traded", () => {
    const w = world();
    const { o } = offering(w, ["b1"]);
    w.st.actions.reviewTradeCards({ oppId: o, decision: "accepted", at: AT });
    w.st.actions.patchOpportunity(o, (x) => ({ ...x, stage: "completed", completedAt: AT }));
    eq(stateOf(w, "b1"), "traded", "the card has gone");
  });

  test("rejection and withdrawal release it", () => {
    const rejected = world();
    const a = offering(rejected, ["b1"]);
    rejected.st.actions.reviewTradeCards({ oppId: a.o, decision: "rejected", at: AT });
    eq(stateOf(rejected, "b1"), "available", "a rejected card is still yours to offer");

    /* PHASE 1 (contract §4): withdrawal is valid only while the copy is
       Reserved; once the partner accepts it, it is committed and the collector
       cannot withdraw it alone. */
    const gone = world();
    const b = offering(gone, ["b1"]);
    gone.st.actions.withdrawTradeCard({ oppId: b.o, tradeCardId: b.rows[0].id, at: AT });
    eq(stateOf(gone, "b1"), "available", "as is a withdrawn one");

    const kept = world();
    const c = offering(kept, ["b1"]);
    kept.st.actions.reviewTradeCards({ oppId: c.o, decision: "accepted", at: AT });
    kept.st.actions.withdrawTradeCard({ oppId: c.o, tradeCardId: c.rows[0].id, at: AT });
    eq(stateOf(kept, "b1"), "in-deal", "while an accepted one stays committed");
  });

  test("an ended deal releases it too", () => {
    const w = world();
    const { o } = offering(w, ["b1"]);
    w.st.actions.reviewTradeCards({ oppId: o, decision: "accepted", at: AT });
    eq(stateOf(w, "b1"), "in-deal", "committed while the deal lives");
    w.st.actions.endOpportunity(o, "collector", AT);
    eq(stateOf(w, "b1"), "available", "and free once it does not");
  });

  test("two copies of one card stay independent", () => {
    const w = world();
    const { o } = offering(w, ["b1"]);
    w.st.actions.reviewTradeCards({ oppId: o, decision: "accepted", at: AT });
    eq(stateOf(w, "b1"), "in-deal", "the offered copy");
    eq(stateOf(w, "b2"), "available", "its twin is untouched");
  });

  test("nothing stores availability", () => {
    const w = world();
    const copy = w.view().myCopies().find((b) => b.id === "b1");
    ["availability", "available", "inDeal", "traded"].forEach((k) =>
      assert(!(k in copy), "no stored " + k + " flag"));
    assert(/const collectorCopyState = \(binderId\)/.test(code(VIEW)),
      "it is a projection");
    assert(/c\.binderId === binderId/.test(code(VIEW)),
      "keyed on the exact copy, never the card");
  });

  test("the Binder shows it without inventing a second source", () => {
    assert(/st\.collectorCopyState\(b\.id\)/.test(code(COL)), "read from the projection");
    assert(!/availability:/.test(code(COL)), "and never written by the UI");
  });
});

describe("B. Trusted Partners is a relationship, not a CRM", () => {
  const related = () => {
    const w = world();
    const { o } = offering(w, ["b1"]);
    w.st.actions.setInterest("nl", "b2", true, AT);
    return { w, o };
  };

  test("it projects the three questions from canonical records", () => {
    const { w, o } = related();
    const rel = w.view().partnerRelationship("nl");
    eq(rel.partner.id, "nl", "one canonical partner identity");
    eq(rel.active.length, 1, "what they're helping with");
    eq(rel.active[0].id, o, "the same opportunity Goals owns");
    eq(rel.interests.map((b) => b.id).join(","), "b2", "what we could help them with");
    eq(rel.history.length, 0, "and nothing finished yet");
  });

  test("history uses the existing terminal semantics", () => {
    const { w, o } = related();
    w.st.actions.patchOpportunity(o, (x) => ({ ...x, stage: "completed", completedAt: AT }));
    const rel = w.view().partnerRelationship("nl");
    eq(rel.active.length, 0, "no longer active");
    eq(rel.history.length, 1, "and now history");
    assert(D.isCompleted(rel.history[0]), "by the domain's own definition");
  });

  test("an ended deal is history, not an active goal", () => {
    const { w, o } = related();
    w.st.actions.endOpportunity(o, "collector", AT);
    const rel = w.view().partnerRelationship("nl");
    eq(rel.active.length, 0, "it is over");
    eq(rel.history.length, 1, "and recorded");
  });

  test("interest alone never implies a deal", () => {
    const w = world();
    w.st.actions.setInterest("nl", "b1", true, AT);
    const rel = w.view().partnerRelationship("nl");
    eq(rel.interests.length, 1, "they want it");
    eq(rel.active.length, 0, "but no deal exists");
    eq(stateOf(w, "b1"), "available", "and the copy is still available");
  });

  test("a partner with no shared history still reads sensibly", () => {
    const w = world();
    const rel = w.view().partnerRelationship("cv");
    eq(rel.active.length, 0, "nothing active");
    eq(rel.interests.length, 0, "nothing wanted");
    eq(rel.history.length, 0, "nothing past");
    assert(rel.partner, "but the partner is still a real relationship");
  });

  test("the page adds no scoring or rating", () => {
    const rel = code(COL).slice(code(COL).indexOf("function PartnerDetail("),
      code(COL).indexOf("function PartnerDetail(") + 5000);
    ["score", "rating", "review", "reputation", "stars"].forEach((w2) =>
      assert(!new RegExp(w2, "i").test(rel), "no " + w2));
  });

  test("history routes into Goals rather than reproducing it", () => {
    /* CONTRACT CHANGE: the summary panel above the inventory was removed and
       its history moved into a Relationship tab. Active goals and binder
       interests are no longer surfaced here at all — active work belongs in
       Goals, and the partner's interest in a card is shown on the card. What
       remains is history, and it still routes rather than reproducing. */
    const rel = code(COL).slice(code(COL).indexOf("function PartnerDetail("),
      code(COL).indexOf("function PartnerDetail(") + 6000);
    assert(/go\(\{ v: "deal", oppId: o\.id \}\)/.test(rel), "history routes to the deal");
    assert(!/What they're helping with/.test(rel), "no active-goal summary remains");
    assert(!/What you could help them with/.test(rel), "nor a binder-interest summary");
  });
});

describe("C. Cross-tab integrity", () => {
  test("the same binder copy reconciles from Binder and from the deal", () => {
    const w = world();
    const { o, rows } = offering(w, ["b1"]);
    w.st.actions.reviewTradeCards({ oppId: o, decision: "accepted", at: AT });
    const fromDeal = w.view().myOpps().find((x) => x.id === o)
      .trade.cards.find((c) => c.binderId === "b1");
    const fromBinder = w.view().myCopies().find((b) => b.id === "b1");
    eq(fromDeal.binderId, fromBinder.id, "one copy identity");
    eq(fromDeal.id, rows[0].id, "and the trade row keeps its own");
    assert(fromDeal.id !== fromDeal.binderId, "the two are not interchangeable");
  });

  test("the same partner reconciles across every surface", () => {
    const { w, o } = (() => {
      const x = world();
      const r = offering(x, ["b1"]);
      x.st.actions.setInterest("nl", "b2", true, AT);
      return { w: x, o: r.o };
    })();
    const v = w.view();
    const fromRel = v.partnerRelationship("nl").partner.id;
    const fromDeal = v.myOpps().find((x) => x.id === o).partnerId;
    const fromInterest = v.interestIn("b2")[0].partnerId;
    eq(fromRel, fromDeal, "relationship and deal agree");
    eq(fromRel, fromInterest, "as does the interest record");
  });

  test("interest projects identically from both tabs", () => {
    const w = world();
    w.st.actions.setInterest("nl", "b1", true, AT);
    const v = w.view();
    const fromBinder = v.interestIn("b1").map((i) => i.partnerId);
    const fromPartner = v.partnerRelationship("nl").interests.map((b) => b.id);
    eq(fromBinder.join(","), "nl", "the binder card knows who wants it");
    eq(fromPartner.join(","), "b1", "and the partner knows which card");
    eq(v.interestCountFrom("nl"), 1, "one relationship, counted once");
  });

  test("neither tab keeps deal state of its own", () => {
    /* The architectural priority: Goals is the only source of truth. */
    const view = code(VIEW);
    const rel = view.slice(view.indexOf("const partnerRelationship"),
      view.indexOf("const partnerProfile"));
    ["stage:", "agreedPrice:", "agreedAdj:", "tpHandoff:", "collectorReceipt:", "trade:"]
      .forEach((f) => assert(!rel.includes(f), "the projection writes no " + f));
    const binder = code(COL).slice(code(COL).indexOf("function Binder("),
      code(COL).indexOf("function Binder(") + 4000);
    ["stage:", "agreedMarket:", "agreedAdj:", "inclusion:"].forEach((f) =>
      assert(!binder.includes(f), "the Binder writes no " + f));
  });

  test("a terminal deal is never reopened as active", () => {
    const w = world();
    const { o } = offering(w, ["b1"]);
    w.st.actions.reviewTradeCards({ oppId: o, decision: "accepted", at: AT });
    w.st.actions.patchOpportunity(o, (x) => ({ ...x, stage: "completed", completedAt: AT }));
    const rel = w.view().partnerRelationship("nl");
    eq(rel.active.length, 0, "it stays finished");
    eq(stateOf(w, "b1"), "traded", "and the copy stays gone");
    assert(!D.isActive(rel.history[0]), "by the domain's own test");
  });
});

describe("D. Binder still feeds Select Trade", () => {
  test("a newly added copy becomes eligible", () => {
    const w = world();
    const { o } = offering(w, ["b1"]);
    const before = w.view().tradeGroups("nl", w.view().myOpps().find((x) => x.id === o));
    const beforeIds = [...before.interested, ...before.other].map((b) => b.id);
    /* RESTATED IN C2. It used to read: an unphotographed copy is REFUSED at the
       add door. It now reads: an unphotographed copy is created — you own it —
       but it does not become OFFERABLE, because the trade-selection view only
       lists copies a partner could actually evaluate. The rule did not weaken;
       it moved to where it bites, and this assertion follows it rather than
       being deleted. */
    const unshot = w.st.actions.addCollectorCopy({ offered: true, id: "bx", collectorId: ME, cardId: "ka", market: 900 });
    eq(unshot, "bx", "an unphotographed card is still a card you own");
    w.st.actions.addCollectorCopy({ offered: true, id: "b3", collectorId: ME, cardId: "ka", market: 900,
      photos: { front: "f", back: "b" } });
    const after = w.view().tradeGroups("nl", w.view().myOpps().find((x) => x.id === o));
    const afterIds = [...after.interested, ...after.other].map((b) => b.id);
    assert(!beforeIds.includes("b3"), "not there before");
    assert(afterIds.includes("b3"), "and offerable after");
    assert(!afterIds.includes("bx"), "the unphotographed copy is owned, and not offerable");
  });

  test("a copy already in this trade is not offered twice", () => {
    const w = world();
    const { o } = offering(w, ["b1"]);
    const groups = w.view().tradeGroups("nl", w.view().myOpps().find((x) => x.id === o));
    const ids = [...groups.interested, ...groups.other].map((b) => b.id);
    assert(!ids.includes("b1"), "the proposed copy is excluded");
    assert(ids.includes("b2"), "while its twin remains available");
  });

  test("interested cards are grouped from canonical interest", () => {
    const w = world();
    w.st.actions.setInterest("nl", "b2", true, AT);
    const { o } = offering(w, ["b1"]);
    const groups = w.view().tradeGroups("nl", w.view().myOpps().find((x) => x.id === o));
    eq(groups.interested.map((b) => b.id).join(","), "b2",
      "the partner's own interest drives the grouping");
  });

  test("visiting the Binder mutates no opportunity", () => {
    const w = world();
    const { o } = offering(w, ["b1"]);
    const before = JSON.stringify(w.st.get().opportunities);
    /* Reading is all the Binder does. */
    w.view().myCopies().forEach((b) => w.view().collectorCopyState(b.id));
    w.view().partnerRelationship("nl");
    eq(JSON.stringify(w.st.get().opportunities), before, "byte-identical afterwards");
  });

  test("the route back from the Binder carries no hidden state", () => {
    assert(/go\(\{ v: "binder" \}\)/.test(code(COL)), "plain navigation");
    const st = code(COL).slice(code(COL).indexOf("function SelectTrade("),
      code(COL).indexOf("function SelectTrade(") + 4000);
    assert(!/sessionStorage|localStorage|window\./.test(st),
      "no fragile hidden state to preserve context");
  });
});

describe("E. Goals remains the only workflow", () => {
  test("neither tab offers a negotiation action", () => {
    [["Binder", "function Binder("], ["Trusted Partners", "function PartnerDetail("]]
      .forEach(([name, marker]) => {
        const block = code(COL).slice(code(COL).indexOf(marker),
          code(COL).indexOf(marker) + 5000);
        ["marketRespond", "pctRespond", "dealAgree", "dealPropose", "confirmHandoff",
          "chooseCashOnly", "reviewTradeCards"].forEach((a) =>
          assert(!block.includes(a), name + " offers no " + a));
      });
  });

  test("no new stage was introduced", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
  });

  test("the availability projection is read-only", () => {
    const view = code(VIEW);
    const fn = view.slice(view.indexOf("const collectorCopyState"),
      view.indexOf("const partnerRelationship"));
    assert(!/state\.opportunities\s*=|\.push\(|patch/.test(fn), "it mutates nothing");
    assert(/D\.isCompleted\(o\)/.test(fn) && /D\.isActive\(o\)/.test(fn),
      "and uses the domain's own lifecycle tests");
  });
});

require("./run.cjs").run();
