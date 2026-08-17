/* ============================================================================
   COLLECTOR UX REVIEW HARNESS

   Development/demo scaffolding, not product. Three things are under test:

   1. The five static stage fixtures are CANONICALLY VALID — each carries the
      upstream terms its stage requires, rather than being a stage field set by
      hand. Downstream state is not prematurely exposed.
   2. The designated review deal progresses through the real lifecycle, on ONE
      opportunity record, via canonical mutations.
   3. Promotion of the review Secondary goal uses the existing action and
      creates nothing.

   The harness is OFF by default. That is itself load-bearing: several suites
   freeze the canonical demo world by exact count, so review fixtures must not
   exist unless explicitly asked for.
   ========================================================================= */

process.env.METYET_DEV = "1";                 // before requiring the bundles

const { describe, test, assert, eq } = require("./run.cjs");
const D = require("../domain/metyet-domain.js");
const { createStore } = require("../domain/metyet-store.js");
const { collectorView } = require("../domain/collector-view.js");
const { buildCanonicalSeed } = require("../dist/MetYet.cjs");

const ME = "c12";
const readSrc = (rel) => require("fs").readFileSync(require("path").join(__dirname, "..", rel), "utf8");

const world = () => createStore(buildCanonicalSeed({ review: true }));
const plain = () => buildCanonicalSeed({ review: false });
const view = (st) => collectorView(st.get(), ME);
const goalNoted = (s, re) => s.goals.find((g) => g.collectorId === ME && re.test(g.note || ""));
const oppFor = (s, g) => D.activeOppForGoal(g.id, s.opportunities);

describe("The harness does not exist unless asked for", () => {
  test("the default demo world is untouched by review fixtures", () => {
    const d = plain();
    eq(d.goals.length, 76, "the canonical goal count is unchanged");
    eq(d.opportunities.length, 38, "and the canonical opportunity count");
    eq(d.conversations.length, 0, "and no conversation is invented");
    assert(!d.goals.some((g) => /^Review /.test(g.note || "")),
      "no review goal leaks into the default world");
  });

  test("review fixtures append, so no existing id is renumbered", () => {
    const r = buildCanonicalSeed({ review: true });
    /* The suites reference these directly; buildOpps resolves goals by index. */
    eq(r.goals.find((g) => g.id === "g20").cardId, "i17", "g20 still Casey's Rayquaza");
    eq(r.goals.find((g) => g.id === "g66").cardId, "i21", "g66 unchanged");
    assert(r.opportunities.find((o) => o.id === "o9"), "o9 still exists");
    assert(r.opportunities.find((o) => o.id === "o33"), "o33 still exists");
    plain().goals.forEach((g) => {
      const same = r.goals.find((x) => x.id === g.id);
      eq(same.cardId, g.cardId, "goal " + g.id + " keeps its card");
      eq(same.collectorId, g.collectorId, "and its owner");
    });
  });
});

describe("1. One valid Primary Goal at each active stage", () => {
  const STAGES = ["agree-price", "select-trade", "value-trade", "deal", "fulfillment"];

  test("every active stage has at least one Collector example", () => {
    const s = world().get();
    const mine = s.goals.filter((g) => g.collectorId === ME && g.tier === "primary");
    STAGES.forEach((stage) => {
      const hit = mine.filter((g) => { const o = oppFor(s, g); return o && o.stage === stage; });
      assert(hit.length >= 1, "a Primary Goal sits at " + stage);
    });
  });

  test("each example is a real opportunity on a Primary goal", () => {
    const s = world().get();
    STAGES.forEach((stage) => {
      const o = s.opportunities.find((x) => x.collectorId === ME && D.isActive(x) && x.stage === stage);
      const g = s.goals.find((x) => x.id === o.goalId);
      assert(g, stage + ": the opportunity resolves a real goal");
      eq(g.tier, "primary", stage + ": on a Primary goal");
      eq(D.goalState(g.id, s.opportunities), "negotiating", stage + ": deriving Negotiating");
      assert(D.INVARIANTS.goalIsPursued(g.id, s.goals), stage + ": the goal is genuinely pursued");
    });
  });

  test("upstream terms exist wherever the stage requires them", () => {
    const s = world().get();
    const at = (stage) => s.opportunities.find((x) => x.collectorId === ME && D.isActive(x) && x.stage === stage);

    /* Agree on Price: price NOT yet settled, and nothing downstream shown. */
    const ap = at("agree-price");
    eq(ap.agreedPrice, null, "Agree on Price has no settled price");
    assert(ap.priceThread.length >= 1, "but a live price conversation exists");
    assert(!(ap.trade && ap.trade.cards && ap.trade.cards.length),
      "and no trade terms are exposed early");

    /* Select Trade: price settled, cards being chosen, no values yet. */
    const stg = at("select-trade");
    assert(stg.agreedPrice != null, "Select Trade has a settled price");
    assert(stg.trade, "and a trade package under way");
    assert(!D.acceptedTradeCards(stg).some((c) => c.agreedMarket != null),
      "with no per-card values agreed yet");

    /* Value Trade: accepted cards exist and settlement is legitimately open. */
    const vt = at("value-trade");
    assert(vt.agreedPrice != null, "Value Trade has a settled price");
    assert(vt.trade && vt.trade.submitted, "its package was actually submitted");
    assert(D.acceptedTradeCards(vt).length >= 1, "and at least one card was accepted");

    /* Deal: upstream settled, balance derivable, not completed. */
    const dl = at("deal");
    assert(dl.agreedPrice != null, "Deal has a settled price");
    eq(dl.completedAt, null, "and is not complete");

    /* Fulfillment: still open, not completed. */
    const ff = at("fulfillment");
    assert(ff.agreedPrice != null, "Fulfillment has a settled price");
    eq(ff.completedAt, null, "and completion has not happened yet");
  });

  test("no fixture invents a stage field the domain does not derive from", () => {
    const src = readSrc("src/MetYet.jsx");
    /* The review rows are five-tuples routed through buildOpps, exactly like
       every other seeded opportunity — not object literals with a stage. */
    assert(/const REVIEW_OPPS_SEED = \[/.test(src), "review opportunities are seed tuples");
    const block = src.slice(src.indexOf("const REVIEW_OPPS_SEED"),
      src.indexOf("const REVIEW_DEAL_CARD"));
    assert(!/agreedPrice|priceThread|trade:|fulfillment:|deal:/.test(block),
      "and carry no hand-written downstream terms");
    assert(/buildOpps\(oppsSeed, goalsSeed\)/.test(src),
      "they are built by the same canonical builder as every other opportunity");
  });
});

describe("2. The designated review deal walks the real lifecycle", () => {
  test("it starts at Agree on Price, distinct from the static examples", () => {
    const s = world().get();
    const g = goalNoted(s, /^Review deal/);
    assert(g, "the review goal is identifiable");
    eq(g.tier, "primary", "and is Primary");
    const o = oppFor(s, g);
    eq(o.stage, "agree-price", "starting at Agree on Price");
    /* Static coverage must survive progressing this one. */
    const others = s.opportunities.filter((x) => x.collectorId === ME && D.isActive(x) && x.id !== o.id);
    ["agree-price", "select-trade", "value-trade", "deal", "fulfillment"]
      .forEach((stage) => assert(others.some((x) => x.stage === stage),
        stage + " is still covered by a different record"));
  });

  test("one opportunity carries the whole lifecycle — no replacement", () => {
    const st = world();
    const g = goalNoted(st.get(), /^Review deal/);
    const o0 = oppFor(st.get(), g);
    const id = o0.id;
    const A = st.actions;
    const cur = () => st.get().opportunities.find((x) => x.id === id);
    const AT = "2026-08-17";

    /* Agree on Price -> settle, via the canonical price thread. */
    A.patchOpportunity(id, (o) => ({ ...o,
      priceThread: [...o.priceThread, { by: "collector", type: "accept", amount: 4032, at: AT }],
      agreedPrice: 4032, stage: "select-trade" }));
    eq(cur().stage, "select-trade", "advanced to Select Trade");
    eq(cur().agreedPrice, 4032, "carrying the settled price forward");

    /* Select Trade -> submit a package the partner then reviews. */
    const copy = st.get().binder.find((b) => b.collectorId === ME);
    A.patchOpportunity(id, (o) => ({ ...o, trade: { mode: "trade", submitted: true,
      cards: [{ binderId: copy.id, cardId: copy.cardId, inclusion: "proposed" }] } }));
    eq(D.nextActor(cur()).actor, "partner", "the wait falls to the partner naturally");

    A.patchOpportunity(id, (o) => ({ ...o, trade: { ...o.trade,
      cards: o.trade.cards.map((c) => ({ ...c, inclusion: "accepted", reviewedAt: AT })) } }));
    eq(D.nextActor(cur()).actor, "collector", "and returns to the collector once reviewed");

    A.patchOpportunity(id, (o) => ({ ...o, stage: "value-trade" }));
    eq(cur().agreedPrice, 4032, "the price still survives at Value Trade");
    eq(D.acceptedTradeCards(cur()).length, 1, "and so does the accepted package");

    A.patchOpportunity(id, (o) => ({ ...o, stage: "deal" }));
    A.patchOpportunity(id, (o) => ({ ...o, stage: "fulfillment" }));
    A.patchOpportunity(id, (o) => ({ ...o, stage: "completed", completedAt: AT }));

    /* One record, start to finish. */
    eq(st.get().opportunities.filter((x) => x.goalId === g.id).length, 1,
      "exactly one opportunity ever existed for this goal");
    eq(cur().id, id, "the same record throughout");
    eq(cur().agreedPrice, 4032, "with its accumulated terms intact");
    eq(D.goalState(g.id, st.get().opportunities), "satisfied", "and the Goal derives Satisfied");
  });

  test("the TP simulator is dev-gated and uses canonical actions only", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    const sim = src.slice(src.indexOf("function SimulateTP"), src.indexOf("function DealChat"));
    assert(/if \(!DEV\) return null;/.test(sim), "the simulator is hidden outside dev");
    assert(/st\.simulate/.test(sim), "and acts only through the canonical store actions");
    assert(!/useState\(\{[^}]*stage/.test(sim), "it keeps no lifecycle state of its own");
  });
});

describe("3. Reset restores only the review scenario", () => {
  test("no arbitrary stage setter was introduced", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    assert(!/setStage\(|forceStage|jumpToStage|stageOverride/i.test(src),
      "no stage jump control exists");
    const panel = src.slice(src.indexOf("function ReviewPanel"), src.indexOf("function Goals("));
    assert(!/patchOpportunity|agreedPrice|priceThread/.test(panel),
      "the review panel edits no deal state — it navigates and resets");
  });

  test("reset is a fixture rebuild, not a field editor", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    const fn = src.slice(src.indexOf("resetReviewDeal:"), src.indexOf("dealAgreed:"));
    assert(/buildCanonicalSeed\(\{ review: true \}\)/.test(fn),
      "the replacement comes from the canonical seed builder");
    assert(/if \(!DEV\) return null;/.test(fn), "and it is dev-only");
  });
});

describe("4. Secondary -> Primary graduation", () => {
  test("the promotion scenario is seeded with context worth preserving", () => {
    const s = world().get();
    const g = goalNoted(s, /^Review promotion/);
    assert(g, "the promotion goal exists");
    eq(g.tier, "secondary", "starting as Secondary");
    eq(D.goalState(g.id, s.opportunities), "seeking", "and not in a negotiation");
    assert(collectorView(s, ME).partnersWith(g.cardId).length >= 1, "with real supply");
    assert(D.hasConversation(s.conversations, ME, "p-self", s.catalog.find((c) => c.id === g.cardId)),
      "and an existing conversation");
  });

  test("promotion uses the canonical action and preserves the record", () => {
    const st = world();
    const g0 = goalNoted(st.get(), /^Review promotion/);
    const before = {
      id: g0.id, cardId: g0.cardId, collectorId: g0.collectorId,
      note: g0.note, createdAt: g0.createdAt,
      convs: st.get().conversations.length,
      opps: st.get().opportunities.length,
      supply: collectorView(st.get(), ME).partnersWith(g0.cardId).length,
      interests: st.get().interests.length,
    };

    st.actions.updateGoalTier(g0.id, "primary");

    const g1 = st.get().goals.find((g) => g.id === before.id);
    eq(g1.tier, "primary", "the tier changed");
    eq(g1.id, before.id, "the SAME goal record");
    eq(g1.cardId, before.cardId, "same card identity");
    eq(g1.collectorId, before.collectorId, "same owner");
    eq(g1.note, before.note, "private collector note survives");
    eq(g1.createdAt, before.createdAt, "and its history");
    eq(st.get().opportunities.length, before.opps, "promotion created NO opportunity");
    eq(st.get().conversations.length, before.convs, "and erased no conversation");
    eq(st.get().interests.length, before.interests, "interest relationships untouched");
    eq(collectorView(st.get(), ME).partnersWith(g1.cardId).length, before.supply,
      "supply is still visible");
    assert(D.hasConversation(st.get().conversations, ME, "p-self",
      st.get().catalog.find((c) => c.id === g1.cardId)), "the conversation survived promotion");
  });

  test("the promoted goal becomes eligible for a Deal Flow, once", () => {
    const st = world();
    const g = goalNoted(st.get(), /^Review promotion/);
    /* Before promotion the domain refuses: a Secondary goal is not pursued. */
    const early = st.actions.startOpportunity({ goalId: g.id, collectorId: ME,
      partnerId: "p-self", cardId: g.cardId, listedPrice: 2400, amount: 2200, at: "2026-08-17" });
    assert(early && early.refused === D.REFUSE.notPrimary, "Secondary cannot open a deal");

    st.actions.updateGoalTier(g.id, "primary");
    const ok = st.actions.startOpportunity({ goalId: g.id, collectorId: ME,
      partnerId: "p-self", cardId: g.cardId, listedPrice: 2400, amount: 2200, at: "2026-08-17" });
    assert(typeof ok === "string", "after promotion a deal may begin");

    /* And the one-negotiation rule still governs. */
    const second = st.actions.startOpportunity({ goalId: g.id, collectorId: ME,
      partnerId: "p2", cardId: g.cardId, listedPrice: 2400, amount: 2100, at: "2026-08-17" });
    assert(second && second.refused === D.REFUSE.alreadyNegotiating,
      "a second negotiation is still refused");

    /* The conversation held before promotion is inherited, not duplicated. */
    const t = D.findThread(st.get().conversations, ME, "p-self",
      st.get().catalog.find((c) => c.id === g.cardId));
    assert(t, "the pre-promotion thread is still the one in play");
    assert(t.entries.length >= 2, "with its history intact");
  });
});

require("./run.cjs").run();
