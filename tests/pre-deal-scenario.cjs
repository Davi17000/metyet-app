/* ============================================================================
   PRE-DEAL REVIEW SCENARIO — THE PHOTO-REQUEST LOOP

   Every other fixture the demo picker offers begins after an offer has been
   made. These two begin BEFORE one exists, so the demand-gated photo workflow
   can be walked the way the product actually runs it:

     stock-only copy -> Request photos -> partner adds front -> still not ready
     -> partner adds back -> request fulfilled -> Make an offer -> Agree on Price

   Nothing here is a Deal Flow stage. There are still exactly five, no
   "photo-request" stage is ever written to opportunity.stage, and selecting the
   scenario creates no Opportunity — only an explicit offer does that.
   ========================================================================= */

process.env.METYET_DEV = "1";

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const D = require("../domain/metyet-domain.js");
const { createStore } = require("../domain/metyet-store.js");
const { collectorView } = require("../domain/collector-view.js");
const M = require("../dist/MetYet.cjs");

const readSrc = (rel) => require("fs").readFileSync(require("path").join(__dirname, "..", rel), "utf8");
const SHELL = readSrc("shell/MetYetPrototype.jsx");
const SEED_SRC = readSrc("src/MetYet.jsx");
const txt = (n) => {
  if (!n) return "";
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ").replace(/\s+/g, " ").trim();
};
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));

const ME = "c12";
const STAGES = ["agree-price", "select-trade", "value-trade", "deal", "fulfillment"];

/* Loaded exactly as the prototype header loads it: build the normal world, then
   apply the shared fixture loader. No stage field is written anywhere. */
const load = (which) => {
  const st = createStore(M.buildCanonicalSeed());
  const next = M.demoDealFixture(st.get(), { collectorId: ME, demoStage: which });
  assert(next, "the fixture loaded");
  st.set(next);
  return st;
};
const view = (st) => collectorView(st.get(), ME);
const goal = (st) => view(st).myGoals().find((g) => /^Review deal/.test(g.note || ""));
const copy = (st) => view(st).partnersWith(goal(st).cardId)[0].inv;
const liveOpp = (st) => D.activeOppForGoal(goal(st).id, st.get().opportunities) || null;

/* Prototype bundles read METYET_DEV once at load, so each mode needs its own
   module registry — the only honest way to test a dev-gated control. */
const loadShell = (dev) => {
  const before = process.env.METYET_DEV;
  if (dev) process.env.METYET_DEV = "1"; else delete process.env.METYET_DEV;
  Object.keys(require.cache).filter((k) => /dist[\\/](Prototype|Collector|MetYet)\.cjs$/.test(k))
    .forEach((k) => delete require.cache[k]);
  const mod = require("../dist/Prototype.cjs");
  if (before === undefined) delete process.env.METYET_DEV; else process.env.METYET_DEV = before;
  return mod;
};
const asCollector = (mod) => {
  let r; TR.act(() => { r = TR.create(React.createElement(mod.default)); });
  click(cls(r, "myp-card")[1]);
  return r;
};
const selectorIn = (r) => r.root.findAllByType("select")
  .find((s) => /Demo stage/.test(String(s.props["aria-label"] || "")));

describe("A. The bundle under test is the one just built", () => {
  /* This suite reads the app from dist/, which `npm test` does not rebuild.
     Nine of this suite's assertions once failed for that reason alone, so the
     dependency is now stated rather than assumed: if the fixture ids are absent
     from the bundle, say THAT, instead of failing later for reasons that never
     name the cause. tests/run.cjs also guards this globally. */
  test("the built bundle contains the pre-deal fixture", () => {
    const built = readSrc("dist/MetYet.cjs");
    assert(/pre-deal-ready/.test(built),
      "dist/MetYet.cjs knows the pre-deal fixtures — run `npm run build` if not");
    assert(/demoDealFixture/.test(built), "and exports the shared fixture loader");
    const shell = readSrc("dist/Prototype.cjs");
    assert(/Pre-deal/.test(shell) && /Deal stage/.test(shell),
      "dist/Prototype.cjs has the grouped selector — run `npm run build` if not");
  });
});

describe("A2. The control, and where it sits", () => {
  test("it exists only in development", () => {
    const prod = loadShell(false);
    const r = asCollector(prod);
    eq(r.root.findAllByType("select").length, 0, "no demo selector at all in a normal build");
    assert(!/Photo request/.test(txt(cls(r, "myp-bar")[0])), "and no pre-deal option");
    loadShell(true);
  });

  test("pre-deal states are listed apart from the five stages", () => {
    const dev = loadShell(true);
    const r = asCollector(dev);
    const groups = selectorIn(r).children.filter((c) => typeof c !== "string");
    const pre = groups.find((g) => g.props.label === "Pre-deal");
    const deal = groups.find((g) => g.props.label === "Deal stage");
    assert(pre && deal, "two clearly separate groups");
    const preIds = pre.children.filter((c) => typeof c !== "string").map((o) => o.props.value);
    assert(preIds.includes("pre-deal"), "the photo-request scenario is offered");
    preIds.forEach((id) => assert(!STAGES.includes(id),
      id + " is not one of the Deal Flow stages"));
    /* And it is never numbered or labelled as a stage. */
    const labels = pre.children.filter((c) => typeof c !== "string").map((o) => txt(o));
    labels.forEach((l) => assert(!/stage|step|^\d/i.test(l), "plain label: " + l));
  });

  test("the Deal Flow still has exactly five stages", () => {
    const dev = loadShell(true);
    const r = asCollector(dev);
    const deal = selectorIn(r).children.filter((c) => typeof c !== "string")
      .find((g) => g.props.label === "Deal stage");
    eq(deal.children.filter((c) => typeof c !== "string").length, 5, "five, unchanged");
    eq(D.STAGES.filter((x) => x.group === "deal").length, 5, "and five in the domain");
    assert(!D.STAGES.some((x) => /photo|pre-deal/i.test(x.id)),
      "no photo stage was added to the lifecycle");
  });

  test("no stage setter was introduced", () => {
    [SHELL, SEED_SRC].forEach((src) =>
      assert(!/setStage\s*[(:]|jumpStage|forceStage|stageOverride/i.test(src),
        "no arbitrary stage setter"));
    /* The pre-deal fixture removes an opportunity; it never writes a stage. */
    const blk = SEED_SRC.slice(SEED_SRC.indexOf("const preDeal ="),
      SEED_SRC.indexOf("const oppsSeed ="));
    assert(/filter\(\(row\) => row\[1\] !== REVIEW_DEAL_CARD\)/.test(blk),
      "it simply does not seed the opportunity");
    assert(!/stage:/.test(blk), "and assigns no stage");
  });

  test("it rebuilds through the canonical fixture builder", () => {
    assert(/buildCanonicalSeed\(\{ review: true, demoStage:/.test(SEED_SRC),
      "the one seed builder produces it");
    eq((SEED_SRC.match(/export function demoDealFixture/g) || []).length, 1,
      "and there is one loader, not a parallel one");
  });
});

describe("B. The starting position", () => {
  test("a Primary goal with matching supply, and no deal", () => {
    const st = load("pre-deal");
    const g = goal(st);
    assert(g, "the review goal is present");
    eq(g.tier, "primary", "Primary");
    eq(liveOpp(st), null, "with no opportunity");
    eq(D.goalState(g.id, st.get().opportunities), "seeking", "so it derives Seeking");
    assert(view(st).partnersWith(g.cardId).length > 0, "and a partner holds the card");
  });

  test("the exact copy is available and stock-only", () => {
    const st = load("pre-deal");
    const inv = copy(st);
    assert(inv, "an exact inventory copy");
    eq(inv.archived, false, "available");
    eq(D.INVARIANTS.copyPhotographed(inv.photos), false, "with no actual photos");
    eq(view(st).photoState(inv), "stock", "so the collector sees a stock image");
  });

  test("every copy behind that goal is stock-only, so the picker cannot route around it", () => {
    const st = load("pre-deal");
    const g = goal(st);
    const all = st.get().inventory.filter((i) => i.cardId === g.cardId && !i.archived);
    assert(all.length >= 1, "there are copies");
    all.forEach((i) => eq(D.INVARIANTS.copyPhotographed(i.photos), false,
      i.invId + " is stock-only"));
  });

  test("nobody has asked yet", () => {
    const st = load("pre-deal");
    eq(view(st).photoRequestFor(copy(st).invId), null, "no outstanding request");
  });

  test("loading the scenario creates no Opportunity", () => {
    const plain = createStore(M.buildCanonicalSeed());
    const before = plain.get().opportunities.length;
    const st = load("pre-deal");
    assert(st.get().opportunities.length <= before,
      "loading removed the review deal rather than adding one");
    eq(liveOpp(st), null, "and the review goal has none");
  });

  test("the control reports which pre-deal position is loaded", () => {
    eq(M.demoDealStage(load("pre-deal").get(), ME), "pre-deal", "photo request");
    eq(M.demoDealStage(load("pre-deal-ready").get(), ME), "pre-deal-ready", "photos ready");
  });
});

describe("C. The loop runs on real actions", () => {
  test("requesting photos uses the canonical action and starts no deal", () => {
    const st = load("pre-deal");
    const inv = copy(st);
    const opps = st.get().opportunities.length;
    const id = st.actions.requestPhotos({ collectorId: ME, partnerId: inv.partnerId,
      invId: inv.invId, at: "D1" });
    assert(id, "the canonical requestPhotos created it");
    eq(st.get().opportunities.length, opps, "no opportunity");
    eq(view(st).photoState(copy(st)), "requested", "the collector is now waiting");
    eq(D.goalState(goal(st).id, st.get().opportunities), "seeking", "the goal has not moved");
  });

  test("the partner sees the request against the exact copy and collector", () => {
    const st = load("pre-deal");
    const inv = copy(st);
    st.actions.requestPhotos({ collectorId: ME, partnerId: inv.partnerId, invId: inv.invId, at: "D1" });
    const r = st.get().photoRequests.find((x) => x.invId === inv.invId);
    assert(r, "the request is in shared state");
    eq(r.collectorId, ME, "naming the collector");
    eq(r.invId, inv.invId, "and the exact copy");
    assert(st.get().collectors.some((c) => c.id === r.collectorId), "who resolves to a real person");
  });

  test("front alone does not finish the job", () => {
    const st = load("pre-deal");
    const inv = copy(st);
    st.actions.requestPhotos({ collectorId: ME, partnerId: inv.partnerId, invId: inv.invId, at: "D1" });
    eq(st.actions.addCopyPhotos({ invId: inv.invId, front: "f", at: "D2" }), false, "not ready");
    eq(st.get().photoRequests[0].fulfilledAt, null, "the request stays open");
    /* And the domain still refuses an offer. */
    const refused = st.actions.startOpportunity({ goalId: goal(st).id, collectorId: ME,
      partnerId: inv.partnerId, cardId: goal(st).cardId, invId: inv.invId,
      listedPrice: inv.ask, amount: 100, at: "D2" });
    eq(refused.refused, D.REFUSE.photosNeeded, "still not offerable");
  });

  test("both faces resolve the request and open the offer", () => {
    const st = load("pre-deal");
    const inv = copy(st);
    st.actions.requestPhotos({ collectorId: ME, partnerId: inv.partnerId, invId: inv.invId, at: "D1" });
    st.actions.addCopyPhotos({ invId: inv.invId, front: "f", at: "D2" });
    eq(st.actions.addCopyPhotos({ invId: inv.invId, back: "b", at: "D3" }), true, "ready");
    assert(st.get().photoRequests[0].fulfilledAt, "the request is fulfilled");
    eq(view(st).photoState(copy(st)), "ready", "the collector sees actual photos");
    const p = view(st).copyPhotos(copy(st));
    assert(p.actual && p.front && p.back, "front and back are both available");
  });

  test("only the explicit offer creates the Opportunity, at Agree on Price", () => {
    const st = load("pre-deal");
    const inv = copy(st);
    const before = st.get().opportunities.length;
    st.actions.requestPhotos({ collectorId: ME, partnerId: inv.partnerId, invId: inv.invId, at: "D1" });
    st.actions.addCopyPhotos({ invId: inv.invId, front: "f", back: "b", at: "D2" });
    eq(st.get().opportunities.length, before, "nothing so far has created a deal");

    const oid = st.actions.startOpportunity({ goalId: goal(st).id, collectorId: ME,
      partnerId: inv.partnerId, cardId: goal(st).cardId, invId: inv.invId,
      listedPrice: inv.ask, amount: 3700, at: "D3" });
    assert(typeof oid === "string", "the offer created it");
    eq(st.get().opportunities.length, before + 1, "exactly one");
    eq(liveOpp(st).stage, "agree-price", "beginning at Agree on Price");
    eq(liveOpp(st).invId, inv.invId, "against the copy that was photographed");
  });

  test("one active negotiation still applies afterwards", () => {
    const st = load("pre-deal");
    const inv = copy(st);
    st.actions.addCopyPhotos({ invId: inv.invId, front: "f", back: "b", at: "D2" });
    const g = goal(st);
    const first = st.actions.startOpportunity({ goalId: g.id, collectorId: ME,
      partnerId: inv.partnerId, cardId: g.cardId, invId: inv.invId,
      listedPrice: inv.ask, amount: 3700, at: "D3" });
    assert(typeof first === "string", "the first opens");
    const second = st.actions.startOpportunity({ goalId: g.id, collectorId: ME,
      partnerId: inv.partnerId, cardId: g.cardId, invId: inv.invId,
      listedPrice: inv.ask, amount: 3600, at: "D4" });
    eq(second.refused, D.REFUSE.alreadyNegotiating, "the second is refused");
  });
});

describe("D. State survives the persona switch", () => {
  test("one store carries request and photos across both sides", () => {
    /* The prototype switches which app is mounted, not which world exists. */
    assert(/store\.reset\(buildCanonicalSeed\(\)\)/.test(SHELL),
      "the shell reseeds only on an explicit reset");
    /* The store is built once, and reseeded only by the explicit Reset demo
       button — never as a side effect of anything else. */
    assert(/storeRef\.current === null\) storeRef\.current = createStore\(buildCanonicalSeed\(\)\)/
      .test(SHELL), "the world is created once");
    eq((SHELL.match(/store\.reset\(/g) || []).length, 1, "and reset exactly one way");
    const setPersona = SHELL.slice(SHELL.indexOf("setPersona("),
      SHELL.indexOf("setPersona(") + 400);
    assert(!/buildCanonicalSeed|store\.reset/.test(setPersona),
      "switching persona never rebuilds the world");
  });

  test("what the collector asked for is what the partner sees, and back again", () => {
    const st = load("pre-deal");
    const inv = copy(st);
    st.actions.requestPhotos({ collectorId: ME, partnerId: inv.partnerId, invId: inv.invId, at: "D1" });

    /* The partner's read of the same shared state. */
    const asPartner = st.get().photoRequests.filter((r) => r.partnerId === inv.partnerId
      && !r.fulfilledAt);
    eq(asPartner.length, 1, "the partner sees exactly one open request");
    eq(asPartner[0].invId, inv.invId, "for the exact copy");

    st.actions.addCopyPhotos({ invId: inv.invId, front: "f", back: "b", at: "D2" });
    /* And the collector's read of the partner's work. */
    const seen = view(st).copyPhotos(copy(st));
    eq(seen.front, st.get().inventory.find((i) => i.invId === inv.invId).photos.front,
      "the very same image, not a copy of it");
    eq(copy(st).invId, inv.invId, "and still the same physical copy");
  });
});

describe("E. The ready shortcut, and the existing harness", () => {
  test("photos-ready starts photographed, with no deal", () => {
    const st = load("pre-deal-ready");
    eq(goal(st).tier, "primary", "Primary goal");
    eq(liveOpp(st), null, "still no opportunity");
    eq(view(st).photoState(copy(st)), "ready", "but the copy is ready to offer on");
    eq(view(st).photoRequestFor(copy(st).invId), null, "with nothing to request");
  });

  test("the five stage fixtures still load with their opportunity", () => {
    STAGES.forEach((stage) => {
      const st = load(stage);
      const o = liveOpp(st);
      assert(o, stage + ": an opportunity exists");
      eq(o.stage, stage, stage + ": at the requested stage");
    });
  });

  test("reset restores the normal world", () => {
    const st = load("pre-deal");
    eq(liveOpp(st), null, "pre-deal has no deal");
    /* Reset demo rebuilds the canonical seed exactly as before. */
    st.reset(M.buildCanonicalSeed());
    const back = M.buildCanonicalSeed();
    eq(st.get().opportunities.length, back.opportunities.length, "the world is restored");
    eq(st.get().inventory.length, back.inventory.length, "including inventory");
  });

  test("the production seed is untouched by any of this", () => {
    const prod = M.buildCanonicalSeed({ review: false });
    eq(prod.goals.length, 76, "canonical goal count");
    eq(prod.opportunities.length, 38, "canonical opportunity count");
    assert(!prod.goals.some((g) => /^Review /.test(g.note || "")), "no review fixture leaks");
  });
});

require("./run.cjs").run();
