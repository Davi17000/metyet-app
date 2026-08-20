/* ============================================================================
   REVIEW HARNESS — DEMO ANY DEAL STAGE

   A development-only fixture loader. Choosing a stage REBUILDS the demo deal
   from `buildCanonicalSeed({ review: true, demoStage })`, so the row goes
   through buildOpps and picks up the upstream terms that stage genuinely
   requires — a settled price before Select Trade, a reviewed package before
   Value Trade, and so on.

   That distinction is the whole point, and these tests hold it: there is no
   stage setter anywhere, nothing edits a stage field, and every stage the
   picker offers is canonically valid rather than merely renderable.

   It is deliberately NOT a lifecycle simulation. The progression deal, driven
   by real Collector actions and the TP simulator, remains the way to walk the
   lifecycle — both must keep working, and both are asserted below.
   ========================================================================= */

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const D = require("../domain/metyet-domain.js");

const readSrc = (rel) => require("fs").readFileSync(require("path").join(__dirname, "..", rel), "utf8");
const SRC = readSrc("collector/MetYetCollector.jsx");
const SEED_SRC = readSrc("src/MetYet.jsx");
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
const STAGES = ["agree-price", "select-trade", "value-trade", "deal", "fulfillment"];
const LABELS = { "agree-price": "Agree on Price", "select-trade": "Select Trade",
  "value-trade": "Value Trade", deal: "Deal", fulfillment: "Fulfillment" };

/* The bundles read METYET_DEV once, at module load, so each mode needs its own
   module registry. This is the only honest way to test a dev-gated control. */
const load = (dev) => {
  const before = process.env.METYET_DEV;
  if (dev) process.env.METYET_DEV = "1"; else delete process.env.METYET_DEV;
  Object.keys(require.cache).filter((k) => /dist\/(Collector|MetYet)\.cjs$/.test(k))
    .forEach((k) => delete require.cache[k]);
  const mod = require("../dist/Collector.cjs");
  const seed = require("../dist/MetYet.cjs");
  if (before === undefined) delete process.env.METYET_DEV; else process.env.METYET_DEV = before;
  return { App: mod.default, __store: mod.__store, buildCanonicalSeed: seed.buildCanonicalSeed };
};

let DEV = load(true);
const S = () => DEV.__store.get().get();
const acts = () => DEV.__store.get().actions;
const mk = () => { DEV.__store.reset(DEV.buildCanonicalSeed({ review: true }));
  let r; TR.act(() => { r = TR.create(React.createElement(DEV.App)); }); return r; };
const remount = () => { let r; TR.act(() => { r = TR.create(React.createElement(DEV.App)); }); return r; };

const demoGoal = () => S().goals.find((g) => g.collectorId === ME && /^Review deal/.test(g.note || ""));
const demoOpp = () => D.activeOppForGoal(demoGoal().id, S().opportunities);
const stageBtn = (r, id) => cls(r, "rvw-st").find((b) => txt(b).trim() === LABELS[id]);
const resetBtn = (r) => r.root.findAllByType("button")
  .find((b) => /^Reset (review|demo) deal$/.test(txt(b).trim()));
const pick = (r, id) => { click(stageBtn(r, id)); return remount(); };

describe("A. Development only", () => {
  test("the picker does not exist without METYET_DEV", () => {
    const prod = load(false);
    prod.__store.reset(prod.buildCanonicalSeed({ review: true }));
    let r; TR.act(() => { r = TR.create(React.createElement(prod.App)); });
    eq(cls(r, "rvw").length, 0, "no review panel at all");
    eq(cls(r, "rvw-st").length, 0, "and therefore no stage picker");
    assert(!/Demo deal stage/.test(txt(r.root)), "nor its heading");
    DEV = load(true);                       // restore the dev registry
  });

  test("the production seed is untouched by the harness", () => {
    const prod = load(false);
    const d = prod.buildCanonicalSeed();
    eq(d.goals.length, 76, "the canonical goal count holds");
    eq(d.opportunities.length, 38, "and the opportunity count");
    assert(!d.goals.some((g) => /^Review /.test(g.note || "")), "no review goal leaks");
    DEV = load(true);
  });

  test("the control is gated in source, not merely styled away", () => {
    const panel = SRC.slice(SRC.indexOf("function ReviewPanel"), SRC.indexOf("function Goals("));
    /* CONTRACT CHANGE: scenario controls are tester-facing, so they are gated
       on DEMO rather than DEV. The property is the same — the control is absent
       from the tree, not merely hidden — and DEV still implies DEMO. */
    assert(/if \(!DEMO\) return null;/.test(panel), "the panel returns null outside demo mode");
    const fn = SRC.slice(SRC.indexOf("resetReviewDeal:"), SRC.indexOf("dealAgreed:"));
    assert(/if \(!DEMO\) return null;/.test(fn), "and so does the loader itself");
  });
});

describe("B. All five stages are offered and load", () => {
  test("every canonical active stage has a button", () => {
    const r = mk();
    eq(cls(r, "rvw-st").length, 5, "five stage buttons");
    STAGES.forEach((id) => assert(stageBtn(r, id), "a button for " + LABELS[id]));
  });

  STAGES.forEach((id) => {
    test(LABELS[id] + ": loads at exactly that stage", () => {
      const r = mk();
      const r2 = pick(r, id);
      eq(demoOpp().stage, id, "the demo deal is at " + id);
      assert(stageBtn(r2, id).props["aria-pressed"], "and the button reflects it");
      STAGES.filter((x) => x !== id).forEach((other) =>
        eq(stageBtn(r2, other).props["aria-pressed"], false, other + " is not marked"));
    });
  });

  test("the same collector, partner and card are used throughout", () => {
    const r = mk();
    const first = demoOpp();
    const ids = { collector: first.collectorId, partner: first.partnerId, card: first.cardId };
    STAGES.forEach((id) => {
      pick(r, id);
      const o = demoOpp();
      eq(o.collectorId, ids.collector, id + ": same collector");
      eq(o.partnerId, ids.partner, id + ": same partner");
      eq(o.cardId, ids.card, id + ": same card — continuity across stages");
    });
  });

  test("switching stages creates no duplicate opportunity", () => {
    const r = mk();
    const g = demoGoal();
    const before = S().opportunities.length;
    STAGES.forEach((id) => pick(r, id));
    eq(S().opportunities.filter((o) => o.goalId === g.id).length, 1,
      "exactly one opportunity on the demo goal");
    eq(S().opportunities.length, before, "and the world did not grow");
    eq(S().opportunities.filter((o) => o.goalId === g.id && D.isActive(o)).length, 1,
      "one active negotiation, as the rule requires");
  });

  test("unrelated demo records are left alone", () => {
    const r = mk();
    const g = demoGoal();
    const others = () => JSON.stringify(S().opportunities.filter((o) => o.goalId !== g.id)
      .map((o) => [o.id, o.stage, o.agreedPrice, o.completedAt, o.declined]));
    const before = others();
    STAGES.forEach((id) => pick(r, id));
    eq(others(), before, "every other opportunity is untouched");
    eq(S().goals.length, 81, "and no goal was added or removed");
  });
});

describe("C. Each loaded stage is canonically valid", () => {
  STAGES.forEach((id) => {
    test(LABELS[id] + ": upstream terms are real, downstream are not invented", () => {
      const r = mk();
      pick(r, id);
      const o = demoOpp();
      const owned = new Set(S().binder.filter((b) => b.collectorId === ME).map((b) => b.id));

      if (id === "agree-price") {
        eq(o.agreedPrice, null, "no settled price yet");
        assert((o.priceThread || []).length >= 1, "but a live price conversation");
        assert(!(o.trade && o.trade.cards && o.trade.cards.length), "and no trade terms early");
      } else {
        assert(o.agreedPrice != null, "the price is settled before any trade stage");
      }
      if (["value-trade", "deal", "fulfillment"].includes(id)) {
        assert(o.trade && o.trade.submitted, "the package was actually submitted");
        assert(D.acceptedTradeCards(o).length >= 1, "with at least one accepted card");
      }
      /* Every trade term must name a BinderCopy this collector really owns. */
      ((o.trade && o.trade.cards) || []).forEach((c) => assert(owned.has(c.binderId),
        id + ": binderId " + c.binderId + " resolves to a real copy"));
      if (id !== "fulfillment") eq(o.completedAt, null, "and it is not complete");
      assert(D.isActive(o), "the opportunity is live");
      eq(D.goalState(demoGoal().id, S().opportunities), "negotiating", "the goal derives Negotiating");
    });
  });

  STAGES.forEach((id) => {
    test(LABELS[id] + ": opens in the real inline Deal Flow", () => {
      const r = mk();
      const r2 = pick(r, id);
      const g = demoGoal();
      const c = S().catalog.find((x) => x.id === g.cardId);
      const card = cls(r2, "goal").find((n) => txt(n).includes(c.name) && txt(n).includes(c.set));
      assert(card, "the demo goal is on the Goals page");
      const row = card.findAllByType("button")
        .find((b) => String(b.props.className || "").includes("goal-deal"));
      assert(row, "with its Deal Flow disclosure");
      click(row);
      const open = cls(r2, "goal").find((n) => txt(n).includes(c.name) && txt(n).includes(c.set));
      assert(cls(open, "idf-stage")[0], id + ": the real stage workspace renders");
      assert(cls(open, "chat-embed")[0], id + ": with the canonical conversation");
      if (id !== "agree-price") {
        assert(cls(open, "idf-det")[0], id + ": and the stage details column");
      }
    });
  });
});

describe("D. It is a fixture loader, not a stage setter", () => {
  test("no general-purpose stage mutation helper exists", () => {
    [SRC, SEED_SRC].forEach((src) => {
      assert(!/setStage\s*[(:]|jumpStage|forceStage|stageOverride|gotoStage/i.test(src),
        "no stage setter in the source");
    });
    const panel = SRC.slice(SRC.indexOf("function ReviewPanel"), SRC.indexOf("function Goals("));
    assert(!/patchOpportunity|agreedPrice|priceThread|trade:/.test(panel),
      "the picker edits no deal state — it rebuilds and navigates");
  });

  test("the loader rebuilds through the canonical seed builder", () => {
    const fn = SRC.slice(SRC.indexOf("resetReviewDeal:"), SRC.indexOf("dealAgreed:"));
    assert(/demoDealFixture\(store\.get\(\), \{ collectorId, demoStage \}\)/.test(fn),
      "it delegates to the one shared loader");
    /* And that loader rebuilds from the canonical seed builder. */
    assert(/buildCanonicalSeed\(\{ review: true, demoStage: demoStage \|\| undefined \}\)/
      .test(SEED_SRC), "the replacement comes from buildCanonicalSeed");
    assert(!/stage:\s*demoStage/.test(SEED_SRC + fn), "no stage field is ever assigned");
  });

  test("the requested stage is derived by buildOpps, not written", () => {
    /* The demo row is swapped in the SEED and re-derived; no downstream field
       is authored by hand. */
    const blk = SEED_SRC.slice(SEED_SRC.indexOf("const demoStage ="),
      SEED_SRC.indexOf("const oppsSeed ="));
    assert(/REVIEW_OPPS_SEED\.map/.test(blk), "the seed row is rebuilt");
    assert(!/agreedPrice|priceThread|trade:|fulfillment:|deal:/.test(blk),
      "carrying no hand-written downstream terms");
    assert(/buildOpps\(oppsSeed, goalsSeed\)/.test(SEED_SRC),
      "and the same canonical builder derives them");
  });

  test("dev copy states that edits are not preserved", () => {
    const r = mk();
    const panel = cls(r, "rvw")[0];
    assert(/Rebuilds the demo fixture/.test(txt(panel)), "it says it rebuilds");
    assert(/Edits are not kept/.test(txt(panel)), "and that edits are discarded");
    assert(/progression deal/.test(txt(panel)), "pointing at the real walk-forward path");
  });
});

describe("E. Reset and the progression scenario both survive", () => {
  test("reset rebuilds the default fixture", () => {
    const r = mk();
    pick(r, "fulfillment");
    eq(demoOpp().stage, "fulfillment", "moved away from the start");
    const r2 = remount();
    click(resetBtn(r2));
    eq(demoOpp().stage, "agree-price", "reset returns to the starting stage");
    eq(S().opportunities.filter((o) => o.goalId === demoGoal().id).length, 1, "still one deal");
  });

  test("the progression deal still advances through canonical actions", () => {
    const r = mk();
    const r2 = remount();
    click(resetBtn(r2));                     // known starting fixture
    const g = demoGoal();
    const o = demoOpp();
    eq(o.stage, "agree-price", "starting at Agree on Price");

    /* Advance exactly as the collector's own price handler does — settling the
       price AND opening the trade package, because a stage without its upstream
       state is precisely what this harness refuses to produce. */
    const last = D.lastEntry(o.priceThread);
    TR.act(() => { DEV.__store.get().actions.patchOpportunity(o.id, (x) => ({ ...x,
      priceThread: [...x.priceThread, { by: "collector", type: "accept",
        amount: last.amount, at: "2026-08-18" }],
      agreedPrice: last.amount, stage: "select-trade",
      trade: { mode: "trade", submitted: false, cards: [] } })); });

    const now = D.activeOppForGoal(g.id, S().opportunities);
    eq(now.id, o.id, "the same opportunity progressed — not replaced");
    eq(now.stage, "select-trade", "to the next canonical stage");
    eq(now.agreedPrice, last.amount, "carrying its settled term forward");
  });

  test("the picker and the progression deal remain separate concepts", () => {
    const r = mk();
    const panel = cls(r, "rvw")[0];
    assert(/Demo deal stage/.test(txt(panel)), "the picker is its own labelled section");
    assert(cls(panel, "rvw-sec").length >= 1, "in its own region");
    /* The static five stage examples still exist independently of both. */
    STAGES.forEach((id) => assert(S().opportunities.some((x) => x.collectorId === ME
      && D.isActive(x) && x.stage === id), id + " still has a standing example"));
  });

  test("Secondary to Primary still works, creating no opportunity", () => {
    mk();
    const pg = S().goals.find((g) => g.collectorId === ME && /^Review promotion/.test(g.note || ""));
    assert(pg, "the promotion scenario exists");
    eq(pg.tier, "secondary", "starting Secondary");
    const opps = S().opportunities.length;
    const convs = S().conversations.length;
    TR.act(() => { acts().updateGoalTier(pg.id, "primary"); });
    eq(S().goals.find((g) => g.id === pg.id).tier, "primary", "promoted in place");
    eq(S().opportunities.length, opps, "creating no opportunity");
    eq(S().conversations.length, convs, "and erasing no conversation");
  });

  test("conversation privacy and one-active-deal are unaffected", () => {
    const r = mk();
    pick(r, "value-trade");
    const o = demoOpp();
    TR.act(() => { acts().sendMessage({ collectorId: ME, partnerId: o.partnerId,
      cardId: o.cardId, by: "collector", text: "DEMO-ONLY", at: "2026-08-18" }); });
    const mine = S().conversations.filter((t) => t.cardId === o.cardId);
    mine.forEach((t) => assert(t.partnerId, "every thread names its partner"));
    const leaked = S().conversations.filter((t) => t.partnerId !== o.partnerId
      && t.entries.some((e) => e.text === "DEMO-ONLY"));
    eq(leaked.length, 0, "nothing leaked to another partner");

    const other = S().inventory.find((i) => i.cardId === o.cardId && i.partnerId !== o.partnerId);
    if (other) {
      const res = acts().startOpportunity({ goalId: o.goalId, collectorId: ME,
        partnerId: other.partnerId, cardId: o.cardId, invId: other.invId,
        listedPrice: other.ask, amount: 100, at: "2026-08-18" });
      assert(res && res.refused === D.REFUSE.alreadyNegotiating,
        "a second negotiation is still refused");
    }
  });
});

require("./run.cjs").run();
