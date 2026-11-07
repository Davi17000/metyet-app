/* ============================================================================
   M3A A1P — THE DEMO, THE PROTOTYPES AND THE WORLD AGREE WITH TP-LED SELECTION

   A1 moved the domain. A1P brings everything that still spoke the old language
   with it, and turns on the world-level rule A1 had to defer:

     SEED       no Collector copy is held by two deals, and no copy a completed
                deal traded is still in play; no legacy Collector-proposed rows;
                every seeded Select Trade deal stands at a real TP-led turn.
     WORLD      validateWorld refuses a copy reserved or committed by two active
                deals, a copy traded twice, and a traded copy still in a deal —
                while shared SELECTION stays legal.
     WORDS      the `card-unavailable` status line, and every Collector turn
                message in Select Trade, without repeating the partner's name.
     DATABASE   withdrawal, the Deal-stage reset and reselection survive a round
                trip through the real schema exactly.
     DEMO       the seeded demo deals can actually be finished: selection closes
                and final agreement is reachable.
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const { PGlite } = require("@electric-sql/pglite");
const D = require("../domain/metyet-domain.js");
const W = require("../domain/metyet-world.js");
const RT = require("../domain/metyet-runtime.js");
const { collectorView } = require("../domain/collector-view.js");
const { createStore: canonicalStore } = require("../domain/metyet-store.js");
const { createStore } = require("./fixture-store.cjs");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { executeCommand } = require("../persistence/command-transaction.js");
const M = require("../dist/MetYet.cjs");

const ROOT = path.join(__dirname, "..");
const build = (rel) => {
  const out = esbuild.buildSync({ entryPoints: [path.join(ROOT, rel)], bundle: true, format: "cjs", write: false,
    logLevel: "silent", jsx: "automatic", platform: "node",
    external: ["react", "react-dom", "react/jsx-runtime", "react-test-renderer"] });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};
const NEG = build("client/negotiation.jsx");

const STAGES = [undefined, "pre-deal", "agree-price", "select-trade", "value-trade", "deal", "fulfillment", "completed"];
const VARIANTS = [false, true].flatMap((review) => STAGES.map((demoStage) => ({ review, demoStage })));
const seedOf = ({ review, demoStage }) => canonicalStore(M.buildCanonicalSeed({ review, ...(demoStage ? { demoStage } : {}) })).get();
const label = (v) => `review=${v.review} stage=${v.demoStage || "default"}`;

/* ============================================================== SEED */
describe("A. The demo seed obeys the trade model it demonstrates", () => {
  test("every seed variant is a valid world, with the exclusive-hold rule switched on", () => {
    for (const v of VARIANTS) {
      const r = W.validateWorld(seedOf(v));
      assert(r.ok, `${label(v)}: ${JSON.stringify(r.errors.slice(0, 3))}`);
    }
  });
  test("no copy is held by two deals, and no traded copy is still in play", () => {
    for (const v of VARIANTS) {
      const s = seedOf(v);
      const holds = {};
      for (const o of s.opportunities) {
        for (const row of (o.trade && o.trade.cards) || []) {
          const st = D.binderRowState(o, row);
          if (!st) continue;
          const exclusive = (D.isActive(o) && (st === "reserved" || st === "committed")) || D.isCompleted(o);
          if (exclusive) (holds[row.binderId] = holds[row.binderId] || []).push(o.id);
          if (D.isActive(o)) {
            const elsewhere = D.collectorCopyStatus(row.binderId, s.opportunities, o.id);
            assert(!D.EXCLUSIVE_COPY_STATES.includes(elsewhere) || st !== "selected",
              `${label(v)}: ${o.id} selects ${row.binderId}, which another deal holds (${elsewhere})`);
          }
        }
      }
      for (const [b, ids] of Object.entries(holds)) assert(ids.length === 1, `${label(v)}: ${b} held by ${ids.join(", ")}`);
    }
  });
  test("the conflicts the audit named are gone: cc10/cc21 (o12, o21) and cc16 (o39, o40)", () => {
    const s = seedOf({ review: false });
    const cards = (id) => (s.opportunities.find((o) => o.id === id).trade.cards || []).filter(D.TRADE.liveRow).map((c) => c.binderId);
    const o12 = cards("o12"); const o21 = cards("o21");
    assert(o12.includes("cc10") && o12.includes("cc21"), "o12 keeps its cards: " + o12);
    assert(!o21.some((b) => o12.includes(b)), "o21 shares none of them: " + o21);
    assert(o21.length > 0, "and is still a trade");
    for (const demoStage of ["value-trade", "deal", "fulfillment"]) {
      const t = seedOf({ review: true, demoStage });
      const live = (id) => (t.opportunities.find((o) => o.id === id).trade.cards || []).filter(D.TRADE.liveRow).map((c) => c.binderId);
      assert(!live("o40").some((b) => live("o39").includes(b)), `${demoStage}: o39 and o40 hold different copies`);
    }
  });
  test("no legacy Collector-proposed row survives anywhere in the demo", () => {
    for (const v of VARIANTS) {
      const s = seedOf(v);
      const legacy = s.opportunities.filter((o) => ((o.trade && o.trade.cards) || []).some((c) => c.inclusion === "proposed"));
      eq(legacy.map((o) => o.id).join(","), "", `${label(v)}: proposed rows`);
    }
  });
  test("every seeded Select Trade deal stands at a TP-led turn, and the four turns are all reachable", () => {
    const reasons = new Set();
    for (const v of VARIANTS) {
      for (const o of seedOf(v).opportunities.filter((x) => D.isActive(x) && x.stage === "select-trade")) {
        const r = D.nextActor(o).reason;
        assert(["select-trade", "more-cards", "adding-cards", "close-selection", "trade-reviewed"].includes(r), `${o.id}: ${r}`);
        reasons.add(r);
      }
    }
    for (const r of ["select-trade", "more-cards", "adding-cards", "close-selection"]) assert(reasons.has(r), `the demo reaches ${r}`);
  });
  test("the review scenario opens Select Trade on the Collector's look", () => {
    /* The review scenario is walked from the Collector's seat: at Select Trade
       the partner has already chosen, and the next move is the Collector's. */
    const s = seedOf({ review: true, demoStage: "select-trade" });
    const o39 = s.opportunities.find((o) => o.id === "o39");
    eq(o39.stage, "select-trade", "the review deal is at Select Trade");
    eq(D.nextActor(o39).reason, "more-cards", "with the Collector to look at the partner's choice");
    assert(D.TRADE.liveTradeRows(o39).length > 0, "and something chosen to look at");
  });
  test("each completed trade traded copies of its own, at the values it always traded", () => {
    const s = seedOf({ review: false });
    const copy = (id) => s.collectorCopies.find((b) => b.id === id);
    const o22 = s.opportunities.find((o) => o.id === "o22");
    eq(o22.trade.cards.map((c) => copy(c.binderId).cardId).join(","), "t1,t2", "Sarah traded the same two cards");
    eq(o22.trade.cards.map((c) => copy(c.binderId).market).join(","), "275,250", "at the same values");
    assert(o22.trade.cards.every((c) => !s.opportunities.some((x) => D.isActive(x)
      && D.TRADE.liveTradeRows(x).some((r) => r.binderId === c.binderId))), "copies no live deal holds");
  });
});

/* ============================================================ DEMO */
describe("B. The seeded demo deals can be finished", () => {
  test("every Select Trade deal at the partner's final review can close", () => {
    for (const v of VARIANTS) {
      const st = canonicalStore(M.buildCanonicalSeed({ review: v.review, ...(v.demoStage ? { demoStage: v.demoStage } : {}) }));
      for (const o of st.get().opportunities.filter((x) => D.isActive(x) && D.nextActor(x).reason === "close-selection")) {
        const r = st.execute({ partnerId: o.partnerId }, "closeTradeSelection", { oppId: o.id, at: "2026-11-05" });
        assert(r.ok, `${label(v)}: ${o.id} could not close (${r.refused})`);
        eq(st.get().opportunities.find((x) => x.id === o.id).stage, "value-trade", `${o.id} is in valuation`);
      }
    }
  });
  test("every Deal-stage demo deal can reach final agreement", () => {
    for (const v of VARIANTS) {
      const st = canonicalStore(M.buildCanonicalSeed({ review: v.review, ...(v.demoStage ? { demoStage: v.demoStage } : {}) }));
      for (const o of st.get().opportunities.filter((x) => D.isActive(x) && x.stage === "deal")) {
        for (let k = 0; k < 2; k += 1) {
          const cur = st.get().opportunities.find((x) => x.id === o.id);
          if (cur.stage !== "deal") break;
          const actor = D.nextActor(cur).actor === "partner" ? { partnerId: cur.partnerId } : { collectorId: cur.collectorId };
          const r = st.execute(actor, "acceptDeal", { oppId: o.id, at: "2026-11-05" });
          assert(r.ok, `${label(v)}: ${o.id} final agreement refused (${r.refused})`);
        }
        eq(st.get().opportunities.find((x) => x.id === o.id).stage, "fulfillment", `${o.id} agreed`);
        assert(W.validateWorld(st.get()).ok, `${label(v)}: the world stays valid after ${o.id}`);
      }
    }
  });
});

/* ============================================================ WORLD */
const AT = "2026-11-05";
let seq = 0;
const runtime = () => RT.createRuntime({ now: () => AT, newId: (p = "") => `${p}${++seq}` });
const PH = { front: "f.jpg", back: "b.jpg" };
const world = () => createStore({
  partners: [{ id: "nl", name: "Northline" }, { id: "rv", name: "Riverside" }],
  collectors: [{ id: "casey", name: "Casey" }],
  goals: [
    { id: "gA", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } },
    { id: "gB", collectorId: "casey", canonicalCardId: "cc-w", tier: "primary", desired: { grade: "PSA 9" } }],
  inventory: [
    { invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 300, grade: "PSA 9", photos: PH },
    { invId: "i2", partnerId: "rv", canonicalCardId: "cc-w", ask: 300, grade: "PSA 9", photos: PH }],
  collectorCopies: [{ id: "k1", collectorId: "casey", canonicalCardId: "cc-y", grade: "PSA 8", offered: true, photos: PH }],
  binders: [], binderEntries: [], opportunities: [], catalog: [],
  copyReviews: [], photoRequests: [], conversations: [], interests: [],
}, runtime());
const x = (st, actor, cmd, p) => st.execute(actor, cmd, { at: AT, ...(p || {}) });
const ok = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
const opp = (st, id) => st.get().opportunities.find((o) => o.id === id);
const agreed = (st, goalId, invId, tp) => {
  const id = ok(x(st, { collectorId: "casey" }, "startOpportunity", { goalId, invId, amount: 300 }), "open");
  ok(x(st, tp, "acceptPrice", { oppId: id }), "price");
  return id;
};
const codes = (st) => W.validateWorld(st.get()).errors.map((e) => e.code);

describe("C. validateWorld: selected by many, held by one", () => {
  test("a copy selected by two deals — two partners — is a valid world", () => {
    const st = world();
    const a = agreed(st, "gA", "i1", { partnerId: "nl" });
    const b = agreed(st, "gB", "i2", { partnerId: "rv" });
    ok(x(st, { partnerId: "nl" }, "selectTradeCards", { oppId: a, copyIds: ["k1"] }), "A selects");
    ok(x(st, { partnerId: "rv" }, "selectTradeCards", { oppId: b, copyIds: ["k1"] }), "B selects");
    eq(codes(st).join(","), "", "shared selection is legal");
  });
  test("a copy reserved by two active deals is refused, naming both", () => {
    const st = world();
    const a = agreed(st, "gA", "i1", { partnerId: "nl" });
    const b = agreed(st, "gB", "i2", { partnerId: "rv" });
    ok(x(st, { partnerId: "nl" }, "selectTradeCards", { oppId: a, copyIds: ["k1"] }), "A selects");
    ok(x(st, { collectorId: "casey" }, "continueTradeSelection", { oppId: a }), "ready");
    ok(x(st, { partnerId: "nl" }, "closeTradeSelection", { oppId: a }), "A reserves");
    const row = opp(st, a).trade.cards[0];
    st.fixture.patchOpportunity(b, (o) => ({ ...o, stage: "value-trade", trade: { mode: "trade", cards: [{ ...row, id: "tc-forged" }] } }));
    const r = W.validateWorld(st.get());
    const e = r.errors.find((x2) => x2.code === "invariant.collector-copy-exclusive-once");
    assert(e && e.message.includes(a) && e.message.includes(b), "reported for both deals: " + JSON.stringify(r.errors));
  });
  /* RESTATED (M3A A1P final corrections). This test used to forge a deal that
     merely SELECTED a traded copy and expect the world to refuse it. That state
     is reachable through the commands alone (see the next test), so the rule
     refused a legitimate completed trade. Selection is not a hold: only a
     reserved or committed use alongside a completed trade is a contradiction. */
  test("a copy traded twice, or traded and still reserved by a live deal, is refused; merely selected is not", () => {
    const st = world();
    const a = agreed(st, "gA", "i1", { partnerId: "nl" });
    const b = agreed(st, "gB", "i2", { partnerId: "rv" });
    ok(x(st, { partnerId: "rv" }, "selectTradeCards", { oppId: b, copyIds: ["k1"] }), "B selects k1");
    const row = { ...opp(st, b).trade.cards[0] };
    st.fixture.patchOpportunity(a, (o) => ({ ...o, stage: "completed", deal: { ...D.emptyDeal(), tpAgreed: true, collectorAgreed: true },
      trade: { mode: "trade", cards: [{ ...row, id: "tc-traded" }] } }));
    eq(codes(st).join(","), "", "traded by A while B still only selects it: valid");
    st.fixture.patchOpportunity(b, (o) => ({ ...o, stage: "value-trade" }));
    assert(codes(st).includes("invariant.collector-copy-traded-in-use"), "traded yet reserved elsewhere: " + codes(st));
    st.fixture.patchOpportunity(b, (o) => ({ ...o, stage: "deal", deal: { ...D.emptyDeal(), tpAgreed: true, collectorAgreed: true } }));
    assert(codes(st).includes("invariant.collector-copy-traded-in-use"), "traded yet committed elsewhere: " + codes(st));
    st.fixture.patchOpportunity(b, (o) => ({ ...o, stage: "completed" }));
    assert(codes(st).includes("invariant.collector-copy-traded-once"), "traded twice: " + codes(st));
  });
  test("two deals select one copy; one reserves and completes it; the other's selection does not undo that", () => {
    const st = world();
    const a = agreed(st, "gA", "i1", { partnerId: "nl" });
    const b = agreed(st, "gB", "i2", { partnerId: "rv" });
    const NL = { partnerId: "nl" }, RV = { partnerId: "rv" }, CO1 = { collectorId: "casey" };
    const [ra] = ok(x(st, NL, "selectTradeCards", { oppId: a, copyIds: ["k1"] }), "A selects");
    const [rb] = ok(x(st, RV, "selectTradeCards", { oppId: b, copyIds: ["k1"] }), "B selects");
    ok(x(st, CO1, "continueTradeSelection", { oppId: a }), "ready A");
    ok(x(st, NL, "closeTradeSelection", { oppId: a, expect: { tradeCardIds: [ra] } }), "A reserves");
    ok(x(st, CO1, "proposeMarketValue", { oppId: a, tradeCardId: ra, amount: 100 }), "market");
    ok(x(st, NL, "acceptMarketValue", { oppId: a, tradeCardId: ra }), "market agreed");
    ok(x(st, NL, "proposeTradePercent", { oppId: a, tradeCardId: ra, percent: 0.8 }), "percent");
    ok(x(st, CO1, "acceptTradePercent", { oppId: a, tradeCardId: ra }), "percent agreed");
    ok(x(st, NL, "acceptDeal", { oppId: a }), "partner agrees");
    ok(x(st, CO1, "acceptDeal", { oppId: a }), "collector agrees");
    ok(x(st, NL, "proposeFulfillment", { oppId: a, plan: { method: "meet" } }), "plan");
    ok(x(st, CO1, "confirmFulfillmentPlan", { oppId: a }), "plan confirmed");
    ok(x(st, NL, "confirmHandoff", { oppId: a }), "handed over");
    ok(x(st, CO1, "confirmHandoff", { oppId: a }), "received");
    eq(opp(st, a).stage, "completed", "A completed");
    assert(D.TRADE.liveTradeRows(opp(st, b)).some((r) => r.binderId === "k1"), "B still selects k1");
    eq(codes(st).join(","), "", "the completed trade and B's stale selection are a valid world");
    ok(x(st, CO1, "continueTradeSelection", { oppId: b }), "ready B");
    const before = JSON.stringify(st.get());
    eq(x(st, RV, "closeTradeSelection", { oppId: b, expect: { tradeCardIds: [rb] } }).refused, "copy-unavailable",
      "B cannot reserve a copy that has been traded");
    eq(JSON.stringify(st.get()), before, "and nothing was written");
  });
  test("atomic failure and stale commands leave a world that still validates", () => {
    const st = world();
    const a = agreed(st, "gA", "i1", { partnerId: "nl" });
    const b = agreed(st, "gB", "i2", { partnerId: "rv" });
    ok(x(st, { partnerId: "nl" }, "selectTradeCards", { oppId: a, copyIds: ["k1"] }), "A selects");
    const [rb] = ok(x(st, { partnerId: "rv" }, "selectTradeCards", { oppId: b, copyIds: ["k1"] }), "B selects");
    ok(x(st, { collectorId: "casey" }, "continueTradeSelection", { oppId: a }), "ready A");
    ok(x(st, { collectorId: "casey" }, "continueTradeSelection", { oppId: b }), "ready B");
    ok(x(st, { partnerId: "nl" }, "closeTradeSelection", { oppId: a }), "A reserves first");
    const before = JSON.stringify(st.get());
    const r = x(st, { partnerId: "rv" }, "closeTradeSelection", { oppId: b, expect: { tradeCardIds: [rb] } });
    eq(r.refused, "copy-unavailable", "B cannot also reserve it");
    eq(JSON.stringify(st.get()), before, "nothing was written");
    const stale = x(st, { partnerId: "rv" }, "closeTradeSelection", { oppId: b, expect: { tradeCardIds: [] } });
    eq(stale.refused, "terms-changed", "a stale screen is refused before anything is checked");
    assert(W.validateWorld(st.get()).ok, "the world is still valid");
  });
});

/* ============================================================ WORDS */
describe("D. What people are told", () => {
  test("a deal ended because the shop's card went elsewhere says so, the same way to both", () => {
    const deal = { declined: true, outcome: "card-unavailable", agreedPrice: 300 };
    const line = "This card is no longer available, so this deal has ended.";
    eq(NEG.statusLine(deal, "collector", "Northline", "Select Trade"), line, "the Collector");
    eq(NEG.statusLine(deal, "tp", "Casey", "Select Trade"), line, "the partner");
    assert(!/Casey|Northline/.test(line), "and nobody else is named");
  });
  test("each Collector turn in Select Trade has its own message, none repeating the partner's name", () => {
    const st = world();
    const a = agreed(st, "gA", "i1", { partnerId: "nl" });
    const say = () => collectorView(st.get(), "casey").turnFor(opp(st, a));
    const seen = {};
    seen["select-trade"] = say();
    ok(x(st, { partnerId: "nl" }, "selectTradeCards", { oppId: a, copyIds: [] }), "send nothing yet");
    seen["more-cards"] = say();
    ok(x(st, { collectorId: "casey" }, "holdTradeSelection", { oppId: a }), "hold");
    seen["adding-cards"] = say();
    ok(x(st, { collectorId: "casey" }, "continueTradeSelection", { oppId: a }), "ready");
    seen["close-selection"] = say();
    ok(x(st, { partnerId: "nl" }, "closeTradeSelection", { oppId: a }), "close empty");
    seen["trade-reviewed"] = say();
    eq(seen["select-trade"].what, "Waiting while they look at your Trade/Sell cards.", "select-trade");
    eq(seen["more-cards"].what, "They've chosen cards to consider. Add more cards first, or tell them you're ready.", "more-cards");
    eq(seen["adding-cards"].what, "Mark any other cards you'd trade as Trade/Sell, then tell them you're ready.", "adding-cards");
    eq(seen["close-selection"].what, "Waiting while they finish choosing cards.", "close-selection");
    eq(seen["trade-reviewed"].what, "They didn't choose any cards. Add more cards, pay cash only, or end the deal.", "trade-reviewed");
    eq([seen["more-cards"], seen["adding-cards"], seen["trade-reviewed"]].map((t) => t.who).join(), "me,me,me", "the Collector's turns");
    eq([seen["select-trade"], seen["close-selection"]].map((t) => t.who).join(), "partner,partner", "the partner's turns");
    for (const t of Object.values(seen)) assert(!/Northline/.test(t.what), "no partner name: " + t.what);
  });
});

/* ========================================================= DATABASE */
let pglite = null;
const fresh = async () => {
  const pg = pglite || (pglite = new PGlite());
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  return createWorldRepository(db);
};
const card = (id, name) => ({ id, name, set: "Base Set", num: id, print: "Holo", edition: "Unlimited",
  language: "English", grade: "PSA 9", condition: null, tags: [] });
const dbSeed = () => ({
  catalog: [card("k1", "Charizard"), card("k2", "Blastoise"), card("k5", "Venusaur")],
  collectors: [{ id: "c1", name: "Casey" }], partners: [{ id: "p1", name: "Northline", tradeRate: 0.8 }],
  relationships: [{ partnerId: "p1", collectorId: "c1", status: "accepted" }], invitations: [],
  goals: [{ id: "g1", collectorId: "c1", cardId: "k1", tier: "primary" }],
  inventory: [{ invId: "i1", partnerId: "p1", cardId: "k1", ask: 1000, archived: false, photos: PH }],
  collectorCopies: [
    { offered: true, id: "b1", collectorId: "c1", cardId: "k2", market: 350, cert: null, photos: PH },
    { offered: true, id: "b3", collectorId: "c1", cardId: "k5", market: 180, cert: null, photos: PH }],
  binders: [], binderEntries: [], interests: [], conversations: [], opportunities: [], photoRequests: [], copyReviews: [],
});
const T = { partnerId: "p1" }, CO = { collectorId: "c1" };
/* Key order is not data: compare the way phase3-persistence does. */
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  return JSON.stringify(v === undefined ? null : v);
}

describe("E. Withdrawal, the Deal reset and reselection survive the real schema", () => {
  test("every step round-trips through PGlite exactly and stays valid", async () => {
    const repo = await fresh();
    await repo.saveWorld(dbSeed());
    const rt = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 60000 });
    let last = null;
    const step = async (actor, command, payload) => {
      const r = await executeCommand(repo, { actor, command, payload, runtime: rt });
      assert(r.ok, `${command}: ${r.refused || (r.error && r.error.message)}`);
      const back = await repo.loadWorld();
      eq(stable(back.opportunities), stable(r.world.opportunities), `${command}: the stored deal is the computed deal`);
      assert(W.validateWorld(back).ok, `${command}: the reloaded world validates`);
      last = back;
      return r.value;
    };
    const oppId = await step(CO, "startOpportunity", { goalId: "g1", invId: "i1", amount: 900 });
    await step(T, "acceptPrice", { oppId });
    const [r1, r3] = await step(T, "selectTradeCards", { oppId, copyIds: ["b1", "b3"] });
    await step(CO, "continueTradeSelection", { oppId });
    await step(T, "closeTradeSelection", { oppId, expect: { tradeCardIds: [r1, r3] } });
    for (const [row, amount] of [[r1, 300], [r3, 150]]) await step(CO, "proposeMarketValue", { oppId, tradeCardId: row, amount });
    for (const row of [r1, r3]) await step(T, "acceptMarketValue", { oppId, tradeCardId: row });
    for (const row of [r1, r3]) await step(T, "proposeTradePercent", { oppId, tradeCardId: row, percent: 0.8 });
    for (const row of [r1, r3]) await step(CO, "acceptTradePercent", { oppId, tradeCardId: row });
    await step(T, "proposeFinalBalance", { oppId, amount: 500 });
    await step(T, "acceptDeal", { oppId });
    await step(CO, "withdrawTradeCard", { oppId, tradeCardId: r3 });           // the Deal-stage reset
    let o = last.opportunities.find((x2) => x2.id === oppId);
    eq(o.deal.adjThread[o.deal.adjThread.length - 1].type, "reset", "the reset entry is stored");
    eq(o.deal.tpAgreed, false, "and the cleared confirmation");
    eq(o.trade.cards.find((c) => c.id === r3).withdrawnStage, "deal", "withdrawal recorded where it happened");
    await step(CO, "withdrawTradeCard", { oppId, tradeCardId: r1 });           // the last card: back to Select Trade
    o = last.opportunities.find((x2) => x2.id === oppId);
    eq(o.stage, "select-trade", "back to selection, stored");
    const [again] = await step(T, "selectTradeCards", { oppId, copyIds: ["b1"] });   // reselection
    o = last.opportunities.find((x2) => x2.id === oppId);
    assert(again !== r1, "a new row");
    eq(o.trade.cards.filter((c) => c.binderId === "b1").length, 2, "both rows for b1 stored");
    eq(o.trade.cards.find((c) => c.id === r1).withdrawn, true, "the old one still withdrawn");
    eq(o.trade.cards.find((c) => c.id === r1).agreedMarket, 300, "with its agreed value kept as history");
  });
  test("a completion persists while another deal still selects the traded copy", async () => {
    const repo = await fresh();
    const seed = dbSeed();
    seed.catalog.push(card("k6", "Mewtwo"));
    seed.partners.push({ id: "p2", name: "Riverside", tradeRate: 0.8 });
    seed.relationships.push({ partnerId: "p2", collectorId: "c1", status: "accepted" });
    seed.goals.push({ id: "g2", collectorId: "c1", cardId: "k6", tier: "primary" });
    seed.inventory.push({ invId: "i2", partnerId: "p2", cardId: "k6", ask: 1000, archived: false, photos: PH });
    await repo.saveWorld(seed);
    const rt = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 60000 });
    const T2 = { partnerId: "p2" };
    const step = async (actor, command, payload) => {
      const r = await executeCommand(repo, { actor, command, payload, runtime: rt });
      assert(r.ok, `${command}: ${r.refused || (r.error && r.error.message)}`);
      return r.value;
    };
    const a = await step(CO, "startOpportunity", { goalId: "g1", invId: "i1", amount: 900 });
    await step(T, "acceptPrice", { oppId: a });
    const b = await step(CO, "startOpportunity", { goalId: "g2", invId: "i2", amount: 900 });
    await step(T2, "acceptPrice", { oppId: b });
    const [ra] = await step(T, "selectTradeCards", { oppId: a, copyIds: ["b1"] });
    const [rb] = await step(T2, "selectTradeCards", { oppId: b, copyIds: ["b1"] });
    await step(CO, "continueTradeSelection", { oppId: a });
    await step(T, "closeTradeSelection", { oppId: a, expect: { tradeCardIds: [ra] } });
    await step(CO, "proposeMarketValue", { oppId: a, tradeCardId: ra, amount: 300 });
    await step(T, "acceptMarketValue", { oppId: a, tradeCardId: ra });
    await step(T, "proposeTradePercent", { oppId: a, tradeCardId: ra, percent: 0.8 });
    await step(CO, "acceptTradePercent", { oppId: a, tradeCardId: ra });
    await step(T, "acceptDeal", { oppId: a });
    await step(CO, "acceptDeal", { oppId: a });
    await step(T, "proposeFulfillment", { oppId: a, plan: { method: "meet" } });
    await step(CO, "confirmFulfillmentPlan", { oppId: a });
    await step(T, "confirmHandoff", { oppId: a });
    await step(CO, "confirmHandoff", { oppId: a });                       // the write the old rule refused
    const back = await repo.loadWorld();
    eq(back.opportunities.find((o) => o.id === a).stage, "completed", "the completion is stored");
    assert(D.TRADE.liveTradeRows(back.opportunities.find((o) => o.id === b)).some((r) => r.id === rb), "B's selection is stored too");
    assert(W.validateWorld(back).ok, "and the stored world reloads valid");
    await step(CO, "continueTradeSelection", { oppId: b });
    const r = await executeCommand(repo, { actor: T2, command: "closeTradeSelection",
      payload: { oppId: b, expect: { tradeCardIds: [rb] } }, runtime: rt });
    eq(r.refused, "copy-unavailable", "B still cannot reserve the traded copy");
  });
});

run();
