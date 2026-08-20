/* ============================================================================
   SEED DATA INTEGRITY — TRADE TERMS REFERENCE REAL BINDER COPIES

   A trade term names an exact BinderCopy (Contract: "TP Interest references an
   exact BinderCopy, never a card identity" — the same exactness applies to what
   a collector puts INTO a trade). A BinderCopy's canonical id is "cc"+index.

   buildOpps used to write the CARD id into binderId, so all 36 seeded trade
   cards pointed at copies that did not exist. Nothing surfaced it until a
   Collector had a Value Trade example of their own to open, at which point the
   workspace could not render.

   These tests hold the referential contract for the seed, and pin the ids and
   terms that the repair had to leave untouched.
   ========================================================================= */

process.env.METYET_DEV = "1";                 // include the review fixtures

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const D = require("../domain/metyet-domain.js");
const App = require("../dist/Collector.cjs").default;
const { __store } = require("../dist/Collector.cjs");
const { buildCanonicalSeed } = require("../dist/MetYet.cjs");

const txt = (n) => {
  if (!n) return "";
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ");
};
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));

const ME = "c12";
const seed = (review) => buildCanonicalSeed({ review: !!review });
const tradeCardsOf = (s) => s.opportunities.flatMap((o) =>
  ((o.trade && o.trade.cards) || []).map((c) => ({ o, c })));

describe("Every seeded trade term names a real BinderCopy", () => {
  [false, true].forEach((review) => {
    const label = review ? "review harness seed" : "default seed";

    test(label + ": every binderId resolves", () => {
      const s = seed(review);
      const byId = new Map(s.binder.map((b) => [b.id, b]));
      const all = tradeCardsOf(s);
      assert(all.length > 0, "there are seeded trade terms to check");
      all.forEach(({ o, c }) => {
        assert(c.binderId, o.id + ": the trade term carries a binderId");
        assert(byId.has(c.binderId),
          o.id + ": binderId " + c.binderId + " resolves to a real BinderCopy");
      });
    });

    test(label + ": the copy belongs to the opportunity's collector", () => {
      const s = seed(review);
      const byId = new Map(s.binder.map((b) => [b.id, b]));
      tradeCardsOf(s).forEach(({ o, c }) => {
        const b = byId.get(c.binderId);
        eq(b.collectorId, o.collectorId,
          o.id + ": a collector may only trade their OWN copy");
      });
    });

    test(label + ": the copy is the card the term claims", () => {
      const s = seed(review);
      const byId = new Map(s.binder.map((b) => [b.id, b]));
      tradeCardsOf(s).forEach(({ o, c }) => {
        eq(byId.get(c.binderId).cardId, c.cardId,
          o.id + ": binderId and cardId describe the same card");
      });
    });

    test(label + ": no binderId is a card id in disguise", () => {
      const s = seed(review);
      const cardIds = new Set(s.catalog.map((c) => c.id));
      tradeCardsOf(s).forEach(({ o, c }) => {
        assert(!cardIds.has(c.binderId),
          o.id + ": " + c.binderId + " is a BinderCopy id, not a card id");
        assert(/^cc\d+$/.test(c.binderId), o.id + ": and uses the canonical form");
      });
    });
  });

  test("the repaired link names a copy that carries a market value", () => {
    /* photos, cert and market were always read from one COLLECTOR_CARDS row, and
       the binderId now names that row. Two different deals may legitimately
       settle the same copy at different values, so the invariant asserted here
       is referential, not arithmetic: the copy exists and is valued. */
    const s = seed(true);
    const byId = new Map(s.binder.map((b) => [b.id, b]));
    tradeCardsOf(s).forEach(({ o, c }) => {
      const b = byId.get(c.binderId);
      assert(b.market != null, o.id + ": the referenced copy has a market value");
      if (c.collectorMarket != null) {
        assert(c.collectorMarket > 0, o.id + ": and the stated market is real");
      }
    });
  });
});

describe("The repair moved no id, stage or term", () => {
  /* Every opportunity's identity and settled terms, independent of binderId. */
  const fingerprintRows = (s) => s.opportunities.map((o) => [o.id, o.goalId, o.collectorId,
    o.partnerId, o.cardId, o.stage, o.agreedPrice, o.completedAt, o.declined,
    JSON.stringify(o.priceThread),
    ((o.trade && o.trade.cards) || []).map((c) => [c.cardId, c.inclusion,
      c.collectorMarket, c.tpMarket, c.agreedMarket]).join("|"),
  ].join("~"));
  const fingerprint = (s) => fingerprintRows(s).join("\n");

  test("opportunity ids, stages and agreed terms are unchanged", () => {
    const s = seed(false);
    /* Counts and ids the rest of the suite pins directly. */
    eq(s.opportunities.length, 38, "the canonical opportunity count holds");
    eq(s.goals.length, 76, "and the canonical goal count");
    ["o9", "o20", "o33"].forEach((id) =>
      assert(s.opportunities.find((o) => o.id === id), id + " still exists"));
    eq(s.goals.find((g) => g.id === "g20").cardId, "i17", "g20 unchanged");
    eq(s.goals.find((g) => g.id === "g66").cardId, "i21", "g66 unchanged");

    /* Stage distribution is exactly as before the repair. */
    const byStage = {};
    s.opportunities.forEach((o) => { byStage[o.stage] = (byStage[o.stage] || 0) + 1; });
    eq(JSON.stringify(byStage), JSON.stringify({
      "agree-price": 7, "select-trade": 5, "value-trade": 4,
      deal: 3, fulfillment: 3, completed: 16 }), "stage distribution is unchanged");
  });

  test("the fingerprint is stable across rebuilds", () => {
    eq(fingerprint(seed(false)), fingerprint(seed(false)), "the seed is deterministic");
    /* Review rows only ever append. */
    const base = fingerprintRows(seed(false));
    const withReview = fingerprintRows(seed(true));
    base.forEach((line, i) => eq(withReview[i], line,
      "review fixtures append without disturbing record " + i));
  });

  test("every seeded stage is still canonically coherent", () => {
    const s = seed(true);
    s.opportunities.filter((o) => D.isActive(o)).forEach((o) => {
      if (o.stage !== "agree-price") {
        assert(o.agreedPrice != null, o.id + ": price settled before trade stages");
      } else {
        eq(o.agreedPrice, null, o.id + ": Agree on Price has no settled price");
      }
      /* Value Trade must have something to value. Deal and Fulfillment may be
         cash-only — o18 legitimately carries no trade package at all — so the
         invariant there is referential: whatever IS carried must resolve. */
      if (o.stage === "value-trade") {
        assert(D.acceptedTradeCards(o).length >= 1,
          o.id + ": accepted cards exist to be valued");
      }
      const owned = new Set(s.binder.filter((b) => b.collectorId === o.collectorId)
        .map((b) => b.id));
      ((o.trade && o.trade.cards) || []).forEach((c) => assert(owned.has(c.binderId),
        o.id + ": every trade term names a copy this collector owns"));
    });
  });
});

describe("All five Collector review stages open", () => {
  const mk = () => { __store.reset(buildCanonicalSeed({ review: true }));
    let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r; };
  const S = () => __store.get().get();

  ["agree-price", "select-trade", "value-trade", "deal", "fulfillment"].forEach((stage) => {
    test(stage + " opens and reconciles", () => {
      const r = mk();
      const o = S().opportunities.find((x) => x.collectorId === ME && D.isActive(x)
        && x.stage === stage);
      assert(o, stage + ": a Collector example exists");
      const c = S().catalog.find((x) => x.id === o.cardId);
      const card = cls(r, "goal").concat(cls(r, "gwatch-r"))
        .find((n) => txt(n).includes(c.name) && txt(n).includes(c.set));
      const entry = cls(card, "goal-deal")[0];
      assert(entry, stage + ": exposes direct Deal Flow entry");
      click(entry);                             // would throw if it cannot render
      assert(cls(r, "idf-stage")[0], stage + ": the workspace rendered");
      assert(cls(r, "chat-embed")[0], stage + ": with embedded conversation");

      /* Downstream stages must reconcile their trade terms against real copies. */
      if (["value-trade", "deal", "fulfillment"].includes(stage)) {
        const owned = new Set(S().binder.filter((b) => b.collectorId === ME).map((b) => b.id));
        D.acceptedTradeCards(o).forEach((tc) => assert(owned.has(tc.binderId),
          stage + ": every accepted card is a copy the collector owns"));
        assert(st_binderResolves(S(), o), stage + ": the workspace can resolve every term");
      }
    });
  });

  /* The lookup the workspace itself performs when rendering a trade term. */
  const st_binderResolves = (s, o) => D.acceptedTradeCards(o).every((tc) =>
    s.binder.some((b) => b.id === tc.binderId));

  test("Value Trade specifically renders its per-card rows", () => {
    const r = mk();
    const o = S().opportunities.find((x) => x.collectorId === ME && D.isActive(x)
      && x.stage === "value-trade");
    const c = S().catalog.find((x) => x.id === o.cardId);
    const card = cls(r, "goal").concat(cls(r, "gwatch-r"))
      .find((n) => txt(n).includes(c.name) && txt(n).includes(c.set));
    click(cls(card, "goal-deal")[0]);
    const body = txt(r.root);
    D.acceptedTradeCards(o).forEach((tc) => {
      const bc = S().binder.find((b) => b.id === tc.binderId);
      const cc = S().catalog.find((x) => x.id === bc.cardId);
      assert(body.includes(cc.name),
        "the traded card " + cc.name + " is named in the workspace");
    });
  });
});

require("./run.cjs").run();
