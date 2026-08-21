/* ============================================================================
   ONE FACT, ONE FIELD

   Two reconciliations, both of the same kind: the same truth was being stored
   or built two different ways depending on which seat you came from.

   FULFILLMENT. The Trusted Partner and every canonical action wrote
   `tpHandoff` / `collectorReceipt`; the Collector wrote `tpDone` /
   `collectorDone`. The two were also READ in different places — turn logic
   asked the raw record for `collectorDone` while the receipt projection asked
   for `collectorReceipt` — so one record could read as "waiting on the
   collector" in the rail and "collector confirmed" in the receipt. The same
   deal disagreeing with itself.

   TRADE CARDS. The Collector built `{binderId, inclusion}`: no stable row id,
   no cardId, no market or percent fields, and neither negotiation thread. Such
   a card could be proposed but never valued, and two rows for the same binder
   copy could not be told apart.

   Neither fix invents a model. Both adopt the one that already existed.
   ========================================================================= */

const { describe, test, assert, eq } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");
const M = require("../dist/MetYet.cjs");
const { createStore } = require("../domain/metyet-store.js");

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const DOM = fs.readFileSync(path.join(ROOT, "domain", "metyet-domain.js"), "utf8");
const F = D.FULFILLMENT;

/* Strip comments so source assertions judge code, not the prose explaining it. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const AT = "2026-08-19";
/* A fulfillment-stage opportunity carrying whatever fulfillment record we want
   to reason about. */
const oppWith = (fulfillment) => ({
  id: "o1", stage: "fulfillment", collectorId: "c", partnerId: "p", cardId: "k",
  priceThread: [{ by: "collector", type: "offer", amount: 100, at: AT }],
  agreedPrice: 100, deal: { tpAgreed: true, collectorAgreed: true },
  trade: { mode: "cash", submitted: true, cards: [] }, fulfillment,
});

describe("A. Fulfillment has one canonical reader", () => {
  test("canonical fields are understood", () => {
    eq(F.handedOff({ tpHandoff: true }), true, "handoff");
    eq(F.received({ collectorReceipt: true }), true, "receipt");
    eq(F.handedOff({ tpHandoff: false }), false, "and their false is false");
    eq(F.received({ collectorReceipt: false }), false, "in both directions");
  });

  test("legacy records still read correctly", () => {
    /* Old and seeded data must keep working — that is the point of a boundary. */
    eq(F.handedOff({ tpDone: true }), true, "a legacy handoff");
    eq(F.received({ collectorDone: true }), true, "a legacy receipt");
    eq(F.handedOff({ tpDone: false }), false, "and legacy false stays false");
  });

  test("a record carrying both is resolved by the canonical field", () => {
    /* Deterministic, and it prefers the field the canonical actions maintain. */
    eq(F.handedOff({ tpHandoff: false, tpDone: true }), false, "canonical wins for handoff");
    eq(F.received({ collectorReceipt: false, collectorDone: true }), false,
      "and for receipt");
    eq(F.handedOff({ tpHandoff: true, tpDone: false }), true, "in the other direction too");
  });

  test("absence is never completion", () => {
    [null, undefined, {}].forEach((f) => {
      eq(F.handedOff(f), false, "nothing is fabricated from a missing record");
      eq(F.received(f), false, "in either fact");
    });
  });

  test("the legacy names are understood in exactly one place", () => {
    /* No `a || b` scattered through the app: one migration boundary. */
    const active = code(DOM);
    /* Two legitimate appearances, and no others:
         1. the reader itself, which is the migration boundary;
         2. the receipt projection's OUTPUT names, which are that view's own
            vocabulary and are fed by the reader — not a second source of truth.
       A bare read of a legacy name off a raw record is what must not exist. */
    const bareReads = active.split("\n")
      .filter((l) => /\.(tpDone|collectorDone)\b/.test(l))
      .filter((l) => !/f\.tpDone|f\.collectorDone/.test(l) || !/FULFILLMENT|!!/.test(l));
    bareReads.forEach((l) => assert(/tpHandoff|collectorReceipt/.test(l),
      "every legacy read sits inside the reader: " + l.trim()));
    /* The projection must derive from the reader, never from the record. */
    assert(/collectorDone: reached\(4\) \? FULFILLMENT\.received/.test(active),
      "the receipt's collector fact comes from the canonical reader");
    assert(/partnerDone: reached\(4\) \? FULFILLMENT\.handedOff/.test(active),
      "and so does its partner fact");
    /* And nowhere in the Collector's own logic. */
    const colActive = code(COL);
    const colHits = colActive.split("\n")
      .filter((l) => /\bf\.tpDone|\bf\.collectorDone|tpDone:|collectorDone:/.test(l));
    eq(colHits.length, 0, "the Collector no longer speaks the legacy dialect: "
      + colHits.map((l) => l.trim()).join(" | "));
  });
});

describe("B. Turn logic and projections cannot disagree", () => {
  const states = [
    ["plan not agreed", { proposedAt: AT }],
    ["plan agreed, no handoff", { proposedAt: AT, collectorConfirmedPlan: true }],
    ["handed off, not received",
      { proposedAt: AT, collectorConfirmedPlan: true, tpHandoff: true }],
    ["received", { proposedAt: AT, collectorConfirmedPlan: true, tpHandoff: true,
      collectorReceipt: true }],
    ["LEGACY received", { proposedAt: AT, collectorConfirmedPlan: true, tpDone: true,
      collectorDone: true }],
  ];

  states.forEach(([name, f]) => {
    test(name + ": one answer, whoever asks", () => {
      const o = oppWith(f);
      const turn = D.nextActor(o);
      /* The rail's question and the receipt's question resolve to the same
         underlying facts — that identity is the whole point of the fix. */
      const received = F.received(o.fulfillment);
      const expected = received ? "partner" : "collector";
      eq(turn.actor, expected,
        "the turn follows the canonical receipt fact, not one seat's spelling");
    });
  });

  test("a legacy record and its canonical twin behave identically", () => {
    const legacy = oppWith({ proposedAt: AT, collectorConfirmedPlan: true,
      tpDone: true, collectorDone: true });
    const canonical = oppWith({ proposedAt: AT, collectorConfirmedPlan: true,
      tpHandoff: true, collectorReceipt: true });
    eq(D.nextActor(legacy).actor, D.nextActor(canonical).actor, "same turn");
    eq(F.received(legacy.fulfillment), F.received(canonical.fulfillment), "same receipt");
    eq(F.handedOff(legacy.fulfillment), F.handedOff(canonical.fulfillment), "same handoff");
  });

  test("agreeing the plan is still not completing the exchange", () => {
    /* Five distinct facts, and this pass collapses none of them. */
    const f = { proposedAt: AT, collectorConfirmedPlan: true, method: "Meet in person",
      where: "Duluth", when: "Saturday" };
    assert(f.proposedAt, "1. the partner proposed terms");
    assert(f.collectorConfirmedPlan, "2. the collector agreed to them");
    eq(F.handedOff(f), false, "3. but has not handed the card over");
    eq(F.received(f), false, "4. nor confirmed receipt");
    eq(oppWith(f).stage, "fulfillment", "5. so the deal is not completed");
    ["method", "where", "when"].forEach((k) => assert(f[k], k + " is preserved"));
  });

  test("handoff and receipt remain two separate events", () => {
    const half = { proposedAt: AT, collectorConfirmedPlan: true, tpHandoff: true };
    eq(F.handedOff(half), true, "the partner has handed over");
    eq(F.received(half), false, "and the collector has not yet confirmed");
    assert(F.handedOff(half) !== F.received(half), "one boolean could not express this");
  });
});

describe("C. Collector trade cards use the canonical shape", () => {
  const CARD = { id: "k1", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
    edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };
  const made = () => M.emptyTradeCard("k1", { front: "f", back: "b" }, "cert-1", "b1");

  test("the factory is shared, not re-declared", () => {
    assert(typeof M.emptyTradeCard === "function", "the canonical factory is exported");
    assert(/emptyTradeCard/.test(code(COL)), "and the Collector uses it");
    eq((code(COL).match(/inclusion: "proposed"/g) || []).length, 0,
      "the Collector no longer hand-builds a reduced card");
  });

  test("a created card carries every field the model needs", () => {
    const tc = made();
    ["id", "cardId", "binderId", "inclusion", "withdrawn",
      "collectorMarket", "tpMarket", "agreedMarket", "valueThread",
      "collectorPercent", "tpPercent", "agreedPercent", "percentThread"]
      .forEach((k) => assert(k in tc, k + " exists"));
    assert(Array.isArray(tc.valueThread), "the market thread is a thread");
    assert(Array.isArray(tc.percentThread), "and so is the percent thread");
  });

  test("nothing is agreed, accepted or valued on creation", () => {
    const tc = made();
    eq(tc.inclusion, "proposed", "proposing is not the partner accepting");
    eq(tc.withdrawn, false, "and it is part of the trade until withdrawn");
    [tc.agreedMarket, tc.agreedPercent, tc.collectorMarket, tc.tpMarket,
      tc.collectorPercent, tc.tpPercent].forEach((v) => eq(v, null, "no value invented"));
    eq(tc.valueThread.length, 0, "no negotiation invented");
    eq(tc.percentThread.length, 0, "in either dimension");
  });

  test("each card gets its own identity", () => {
    /* Two rows for the SAME binder copy must still be distinguishable — the
       reduced shape could not do this, because binderId was all it had. */
    const a = M.emptyTradeCard("k1", null, null, "b1");
    const b = M.emptyTradeCard("k1", null, null, "b1");
    assert(a.id && b.id, "both have a row id");
    assert(a.id !== b.id, "and the ids differ even for one binder copy");
    eq(a.cardId, b.cardId, "while the card identity is shared");
    eq(a.binderId, b.binderId, "as is the binder link");
  });

  test("the three identifiers mean three different things", () => {
    const tc = M.emptyTradeCard("k1", null, "cert-9", "b7");
    eq(tc.cardId, "k1", "cardId identifies WHICH CARD it is");
    eq(tc.binderId, "b7", "binderId identifies the collector's physical copy");
    assert(tc.id.startsWith("tc"), "and id identifies THIS ROW of this trade");
    assert(tc.id !== tc.cardId && tc.id !== tc.binderId, "none is a substitute for another");
  });

  test("the resulting card can enter the valuation model", () => {
    /* The reason the shape matters: a reduced card had nowhere to put this. */
    const tc = { ...made(), agreedMarket: 1804, agreedPercent: 0.8 };
    eq(D.tradeValueOf(tc), Math.round(1804 * 0.8), "market x percent yields trade value");
    const settledOpp = { trade: { cards: [{ ...tc, inclusion: "accepted" }] } };
    eq(D.totalTradeValue(settledOpp), Math.round(1804 * 0.8), "and totals correctly");
    const unsettled = { trade: { cards: [{ ...made(), inclusion: "accepted" }] } };
    eq(D.totalTradeValue(unsettled), 0, "while an unagreed card contributes nothing");
  });

  test("acceptance and withdrawal still filter as the model expects", () => {
    const base = made();
    const opp = { trade: { cards: [
      { ...base, id: "t1", inclusion: "accepted" },
      { ...base, id: "t2", inclusion: "proposed" },
      { ...base, id: "t3", inclusion: "rejected" },
      { ...base, id: "t4", inclusion: "accepted", withdrawn: true },
    ] } };
    eq(D.acceptedTradeCards(opp).map((c) => c.id).join(","), "t1",
      "only accepted, unwithdrawn cards carry economics");
  });
});

describe("D. Both personas observe one object", () => {
  const CARD = { id: "k1", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
    edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };
  const world = () => createStore({
    catalog: [CARD], collectors: [{ id: "casey", name: "Casey", prefs: [] }],
    partners: [{ id: "nl", name: "Northline Cards" }],
    goals: [], binder: [], interests: [], conversations: [], opportunities: [],
    preferences: [], photoRequests: [], copyReviews: [],
    inventory: [{ invId: "inv-1", partnerId: "nl", cardId: "k1", ask: 4000,
      archived: false, photos: { front: "f", back: "b" } }],
  });

  test("a card proposed on one side is the same row on the other", () => {
    const st = world();
    const g = st.actions.addGoal({ collectorId: "casey", cardId: "k1",
      tier: "primary", at: AT });
    const o = st.actions.startOpportunity({ goalId: g, collectorId: "casey",
      partnerId: "nl", cardId: "k1", invId: "inv-1", listedPrice: 4000,
      amount: 3600, at: AT });
    st.actions.agreePrice({ oppId: o, amount: 3600, by: "tp", at: AT });
    /* Propose a canonical card, as the Collector now does. */
    const tc = M.emptyTradeCard("k1", null, null, "b1");
    st.actions.patchOpportunity(o, (x) => ({ ...x,
      trade: { ...x.trade, submitted: true, cards: [tc] } }));

    const seen = st.get().opportunities.find((x) => x.id === o).trade.cards[0];
    eq(seen.id, tc.id, "the same row id is visible to the other seat");
    eq(seen.inclusion, "proposed", "in the same state");

    /* The partner decides inclusion on that same row — no duplicate created. */
    st.actions.patchOpportunity(o, (x) => ({ ...x, trade: { ...x.trade,
      cards: x.trade.cards.map((c) => (c.id === tc.id
        ? { ...c, inclusion: "accepted", reviewedAt: AT } : c)) } }));
    const after = st.get().opportunities.find((x) => x.id === o).trade.cards;
    eq(after.length, 1, "one object, not two");
    eq(after[0].id, tc.id, "still the same row");
    eq(after[0].inclusion, "accepted", "carrying the partner's decision");
  });

  test("no persona-specific copy of the economics exists", () => {
    const active = code(COL);
    assert(!/collectorTrade|myTradeCards|localTrade/.test(active),
      "the Collector keeps no private trade structure");
  });
});

describe("E. Nothing else moved", () => {
  test("the lifecycle is untouched", () => {
    eq(D.PURSUIT_STEPS.length, 6, "six steps");
    eq(D.RECEIPT_STAGES.length, 5, "five receipt stages");
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "in order");
  });

  test("the trade-value formula is unchanged", () => {
    eq(D.tradeValueOf({ inclusion: "accepted", agreedMarket: 900, agreedPercent: 0.75 }),
      675, "market x percent, rounded");
  });

  test("no seat asserts the other seat's agreement", () => {
    /* CONTRACT CHANGE: in Pass 1 this test DOCUMENTED the fabricated
       `tpAgreed: true, collectorAgreed: true` as known-remaining work. Pass 2
       removed it, so the assertion now protects its absence — the same concern,
       flipped from a record of a defect to a guard against its return. */
    const active = code(COL);
    assert(!/tpAgreed: true/.test(active),
      "the Collector never sets the partner's agreement");
    assert(!/collectorAgreed: true, tpAgreed/.test(active), "in either order");
    assert(!/collectorReceipt: true, tpHandoff: true/.test(active),
      "nor both completion facts at once");
  });
});

require("./run.cjs").run();
