/* ============================================================================
   PHASE 6 P6-F4 BATCH 5 — changeCollectingState: ONE CARD, FOUR STATES
   The four states describe collecting intent; Goals and owned copies remain
   distinct records. Changing state changes state — same printing, same
   binder, nothing discarded, nothing asserted, no second card.
     A. all twelve      each directed transition, its record, binder, facts
     B. lineage         append-only across repeated crossings; bounded by
                        refusal, never by truncation; validated on load
     C. refusals        each one, and each one changes nothing
     D. many copies     one copy changes; its siblings do not
     E. retries, races  a repeat is "already done"; a race is state-changed
     F. privacy         the lineage reaches its Collector and nobody else
     G. through the server and Postgres
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const D = require("../domain/metyet-domain.js");
const C = require("../domain/metyet-commands.js");
const RT = require("../domain/metyet-runtime.js");
const { validateWorld } = require("../domain/metyet-world.js");
const { projectForActor } = require("../domain/metyet-projection.js");
const { createStore, relateAll } = require("./fixture-store.cjs");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");

const AT = "2026-10-01";
const CASEY = { collectorId: "casey" };
const DANA = { collectorId: "dana" };
const TP = { partnerId: "nl" };
const json = (v) => JSON.stringify(v);
const PHOTOS = { front: "f.jpg", back: "b.jpg" };

const GOAL = (tier, extra = {}) => ({ id: "rec", collectorId: "casey", canonicalCardId: "cc-y", tier,
  desired: { grade: "PSA 9" }, note: "the one", createdAt: "2026-01-01", since: "2026-02-01", ...extra });
const COPY = (disp, extra = {}) => ({ id: "rec", collectorId: "casey", canonicalCardId: "cc-y", grade: "PSA 8",
  cert: "K-SECRET", market: 300, photos: PHOTOS, addedAt: "2026-03-01",
  ...(disp === "trade" ? { offered: true } : { offered: false, keeping: true }), ...extra });
const world = (rec, over = {}) => ({
  partners: [{ id: "nl", name: "Northline", tradeRate: 0.7 }],
  collectors: [{ id: "casey", name: "Casey" }, { id: "dana", name: "Dana" }],
  goals: rec && rec.tier ? [rec] : [],
  inventory: [],
  collectorCopies: [...(rec && !rec.tier ? [rec] : []),
    { id: "other", collectorId: "casey", canonicalCardId: "cc-z", grade: "PSA 7", offered: true },
    { id: "theirs", collectorId: "dana", canonicalCardId: "cc-y", grade: "PSA 7", offered: true }],
  binders: [{ id: "A", collectorId: "casey", name: "Hunting", createdAt: AT, archivedAt: null },
    { id: "OLD", collectorId: "casey", name: "Put away", createdAt: AT, archivedAt: AT }],
  binderMemberships: rec ? [{ id: "m-rec", binderId: "A", filedAt: AT, ...(rec.tier ? { goalId: "rec" } : { collectorCopyId: "rec" }) }] : [],
  binderEntries: [], opportunities: [], catalog: [], copyReviews: [], photoRequests: [], conversations: [], interests: [],
  ...over,
});
const store = (rec, over) => createStore(world(rec, over));
const x = (st, actor, payload) => st.execute(actor, "changeCollectingState", { ...payload, at: AT });
const isGoalState = (s) => s === "primary" || s === "secondary";
const make = (s) => (isGoalState(s) ? GOAL(s) : COPY(s));
const stateOf = (r, kind) => (kind === "goal" ? r.tier : r.offered === true ? "trade" : r.keeping === true ? "pc" : null);
const mine = (w) => [...w.goals.filter((g) => g.collectorId === "casey" && g.canonicalCardId === "cc-y").map((g) => ["goal", g]),
  ...w.collectorCopies.filter((c) => c.collectorId === "casey" && c.canonicalCardId === "cc-y").map((c) => ["copy", c])];
const target = (s) => (isGoalState(s) ? { goalId: "rec" } : { collectorCopyId: "rec" });
const raw = (st) => json(st.get());
const sys = RT.systemRuntime();
const direct = (w, actor, payload) => C.execute(w, actor, "changeCollectingState", payload, sys);

/* ============================================================== A */
const STATES = ["primary", "secondary", "pc", "trade"];
describe("A. all twelve directed transitions", () => {
  for (const from of STATES) for (const to of STATES) {
    if (from === to) continue;
    test(`${from} → ${to}`, () => {
      const st = store(make(from));
      const before = st.get();
      const src = make(from);
      const r = x(st, CASEY, { ...target(from), from, to });
      assert(r.ok !== false, `refused: ${r.refused}`);
      const w = st.get();
      assert(validateWorld(w).ok, "the world is invalid");
      const recs = mine(w);
      eq(recs.length, 1, "not exactly one record for this card");
      const [kind, rec] = recs[0];
      eq(kind, isGoalState(to) ? "goal" : "copy");
      eq(stateOf(rec, kind), to);
      eq(rec.canonicalCardId, "cc-y", "the printing changed");
      eq(json(r.value && [r.value.id, r.value.kind, r.value.state]), json([rec.id, kind, to]), "the answer does not name the record");
      const homes = w.binderMemberships.filter((m) => m.goalId === rec.id || m.collectorCopyId === rec.id);
      eq(json(homes.map((m) => [m.id, m.binderId, m.filedAt])), json([["m-rec", "A", AT]]), "the binder home is not the same row");
      eq(w.binderMemberships.length, 1);
      /* untouched: the other copy, the other Collector's copy */
      eq(json(w.collectorCopies.filter((c) => c.id === "other" || c.id === "theirs")), json(before.collectorCopies.filter((c) => c.id === "other" || c.id === "theirs")));
      if (isGoalState(from) === isGoalState(to)) {
        eq(rec.id, "rec", "a same-type change made a new record");
        assert(!rec.formerly, "a same-type change wrote lineage");
        if (kind === "goal") eq(json([rec.desired, rec.note, rec.createdAt]), json([src.desired, src.note, src.createdAt]));
        else eq(json([rec.grade, rec.cert, rec.market, rec.photos, rec.addedAt]), json([src.grade, src.cert, src.market, src.photos, src.addedAt]));
      } else {
        assert(rec.id !== "rec", "the id did not change");
        eq(rec.formerly.length, 1);
        const f = rec.formerly[0];
        eq(json([f.kind, f.id, f.at]), json([isGoalState(from) ? "goal" : "copy", "rec", f.at]));
        const { id, collectorId, canonicalCardId, ...facts } = src;
        eq(json(f.facts), json(facts), "the source's facts are not all kept");
        if (kind === "copy") assert(!("grade" in rec) && !("condition" in rec) && !("cert" in rec), "a wanted grade was asserted as fact");
        else eq(json(rec.desired), json({ grade: "PSA 8" }), "the Goal does not want what the copy was");
      }
      /* repeated Submit Update: done once */
      const again = x(st, CASEY, { ...target(from), from, to });
      assert(again.ok !== false && again.value.already === true && again.value.id === rec.id, `the repeat: ${json(again)}`);
      eq(raw(st), json(w), "the repeat changed something");
    });
  }
});

/* ============================================================== B */
describe("B. lineage: every crossing kept, in order, never overwritten", () => {
  test("Primary → PC → Secondary → Trade / Sell → Primary: four entries, each the record it was", () => {
    const st = store(GOAL("primary"));
    const hops = [["primary", "pc"], ["pc", "secondary"], ["secondary", "trade"], ["trade", "primary"]];
    let id = "rec"; let kind = "goal"; const seen = [];
    for (const [from, to] of hops) {
      const w0 = st.get();
      const rec = kind === "goal" ? w0.goals.find((g) => g.id === id) : w0.collectorCopies.find((c) => c.id === id);
      const { id: _i, collectorId: _c, canonicalCardId: _k, formerly: _f, ...facts } = rec;
      seen.push({ kind, id, facts });
      /* between crossings, the Collector says something on the copy (the optional prompt) */
      const r = x(st, CASEY, { [kind === "goal" ? "goalId" : "collectorCopyId"]: id, from, to });
      assert(r.ok !== false, `${from}→${to}: ${r.refused}`);
      id = r.value.id; kind = r.value.kind;
      if (kind === "copy") assert(st.execute(CASEY, "updateCollectorCopy", { copyId: id, patch: { grade: "PSA 10", cert: `C-${seen.length}` }, at: AT }).ok !== false);
    }
    const final = st.get().goals.find((g) => g.id === id);
    eq(final.formerly.length, 4);
    eq(json(final.formerly.map((f) => [f.kind, f.id, f.facts])), json(seen.map((s) => [s.kind, s.id, s.facts])), "an earlier snapshot was overwritten");
    eq(final.formerly[1].facts.cert, "C-1"); eq(final.formerly[3].facts.cert, "C-3");
    assert(validateWorld(st.get()).ok);
  });
  test("at the bound the change is refused, and nothing is dropped", () => {
    const full = Array.from({ length: D.COLLECTING_LINEAGE_MAX }, (_, i) => ({ kind: i % 2 ? "copy" : "goal", id: `old-${i}`, at: AT, facts: { n: i } }));
    const st = store(GOAL("primary", { formerly: full }));
    const before = raw(st);
    eq(x(st, CASEY, { goalId: "rec", from: "primary", to: "pc" }).refused, "lineage-full");
    eq(raw(st), before);
    assert(x(st, CASEY, { goalId: "rec", from: "primary", to: "secondary" }).ok !== false, "a same-type change is not limited");
  });
  test("the validator refuses a lineage over the bound, or one that names nothing", () => {
    const validateWorld = (w) => require("../domain/metyet-world.js").validateWorld({ invitations: [], ...relateAll(w) });
    const over = Array.from({ length: D.COLLECTING_LINEAGE_MAX + 1 }, (_, i) => ({ kind: "goal", id: `o${i}`, at: AT, facts: {} }));
    assert(!validateWorld(world(GOAL("primary", { formerly: over }))).ok);
    assert(!validateWorld(world(GOAL("primary", { formerly: [{ kind: "card", id: "x", at: AT, facts: {} }] }))).ok);
    assert(!validateWorld(world(COPY("pc", { formerly: [{ kind: "goal", id: "x", at: AT }] }))).ok);
    assert(!validateWorld(world(COPY("pc", { formerly: { kind: "goal" } }))).ok);
    assert(validateWorld(world(COPY("pc", { formerly: [{ kind: "goal", id: "x", at: AT, facts: {} }] }))).ok);
  });
});

/* ============================================================== C */
const refusedUnchanged = (st, actor, payload, code) => {
  const before = raw(st);
  const r = x(st, actor, payload);
  eq(r.refused, code, json(r));
  eq(raw(st), before, "a refusal changed something");
};
describe("C. refusals: exact, and nothing changes", () => {
  test("another Collector's record: not-owner", () => refusedUnchanged(store(GOAL("primary")), DANA, { goalId: "rec", from: "primary", to: "pc" }, "not-owner"));
  test("a partner: not-owner", () => refusedUnchanged(store(GOAL("primary")), TP, { goalId: "rec", from: "primary", to: "pc" }, "not-owner"));
  test("no such record: not-found; both or neither named: not-found", () => {
    const st = store(GOAL("primary"));
    refusedUnchanged(st, CASEY, { goalId: "nope", from: "primary", to: "pc" }, "not-found");
    refusedUnchanged(st, CASEY, { goalId: "rec", collectorCopyId: "other", from: "primary", to: "pc" }, "not-found");
    refusedUnchanged(st, CASEY, { from: "primary", to: "pc" }, "not-found");
  });
  test("not one of the four: invalid-state", () => {
    const st = store(GOAL("primary"));
    refusedUnchanged(st, CASEY, { goalId: "rec", from: "primary", to: "wishlist" }, "invalid-state");
    refusedUnchanged(st, CASEY, { goalId: "rec", from: "hunting", to: "pc" }, "invalid-state");
  });
  test("the screen was stale: state-changed", () => {
    refusedUnchanged(store(GOAL("secondary")), CASEY, { goalId: "rec", from: "primary", to: "pc" }, "state-changed");
  });
  test("a legacy record with no canonical printing: state-change-unsupported", () => {
    const g = { id: "rec", collectorId: "casey", cardId: "k1", tier: "primary" };
    const w = world(null, { goals: [g], catalog: [{ id: "k1", name: "Mudkip" }] });
    const r = direct(w, CASEY, { goalId: "rec", from: "primary", to: "pc" });
    eq(r.refused, "state-change-unsupported");
  });
  test("Goal → copy while a live deal names the Goal: goal-locked; the deal is untouched", () => {
    const st = store(GOAL("primary"));
    const inv = st.execute(TP, "addInventoryCopy", { copy: { canonicalCardId: "cc-y", grade: "PSA 9", ask: 100, photos: PHOTOS }, at: AT }).value;
    assert(st.execute(CASEY, "startOpportunity", { goalId: "rec", invId: inv, amount: 100, at: AT }).ok !== false);
    refusedUnchanged(st, CASEY, { goalId: "rec", from: "primary", to: "pc" }, "goal-locked");
    refusedUnchanged(st, CASEY, { goalId: "rec", from: "primary", to: "trade" }, "goal-locked");
    refusedUnchanged(st, CASEY, { goalId: "rec", from: "primary", to: "secondary" }, "goal-locked");
  });
  test("copy → Goal while a deal holds the copy: copy-committed / copy-reserved; ever in a trade: copy-in-use", () => {
    const opp = (rows, extra = {}) => ({ id: "o1", goalId: "gx", stage: "negotiation", trade: { cards: rows, ...extra } });
    const w = (o) => world(COPY("trade"), { opportunities: [o] });
    eq(direct(w(opp([{ binderId: "rec", inclusion: "accepted" }])), CASEY, { collectorCopyId: "rec", from: "trade", to: "primary" }).refused, "copy-committed");
    eq(direct(w(opp([{ binderId: "rec", inclusion: "proposed" }], { submitted: true })), CASEY, { collectorCopyId: "rec", from: "trade", to: "primary" }).refused, "copy-reserved");
    eq(direct(w({ ...opp([{ binderId: "rec", inclusion: "rejected" }]), declined: true }), CASEY, { collectorCopyId: "rec", from: "trade", to: "primary" }).refused, "copy-in-use");
    eq(direct(w({ ...opp([{ binderId: "rec", inclusion: "accepted" }]), stage: "completed" }), CASEY, { collectorCopyId: "rec", from: "trade", to: "secondary" }).refused, "copy-committed");
  });
  test("copy → Goal with a Trusted Partner's interest: partner-interest; the interest stays", () => {
    const st = store(COPY("trade"));
    assert(st.execute(TP, "setInterest", { binderId: "rec", on: true, at: AT }).ok !== false);
    refusedUnchanged(st, CASEY, { collectorCopyId: "rec", from: "trade", to: "primary" }, "partner-interest");
    /* PC ↔ Trade / Sell is the same record: allowed, and the interest stays */
    assert(x(st, CASEY, { collectorCopyId: "rec", from: "trade", to: "pc" }).ok !== false);
    eq(st.get().interests.length, 1);
    refusedUnchanged(st, CASEY, { collectorCopyId: "rec", from: "pc", to: "secondary" }, "partner-interest");
  });
  test("copy → Goal when a Goal for this printing exists: duplicate-goal; nothing merged", () => {
    const st = store(COPY("pc"), { goals: [{ id: "g-has", collectorId: "casey", canonicalCardId: "cc-y", tier: "secondary", desired: { grade: "PSA 10" } }] });
    refusedUnchanged(st, CASEY, { collectorCopyId: "rec", from: "pc", to: "primary" }, "duplicate-goal");
  });
  test("copy → Goal with no grade, or Raw with no condition: criteria-required", () => {
    refusedUnchanged(store(COPY("pc", { grade: undefined })), CASEY, { collectorCopyId: "rec", from: "pc", to: "primary" }, "criteria-required");
    refusedUnchanged(store(COPY("pc", { grade: "Raw" })), CASEY, { collectorCopyId: "rec", from: "pc", to: "primary" }, "criteria-required");
    const ok = store(COPY("pc", { grade: "Raw", condition: "Near Mint" }));
    const r = x(ok, CASEY, { collectorCopyId: "rec", from: "pc", to: "secondary" });
    eq(json(ok.get().goals.find((g) => g.id === r.value.id).desired), json({ grade: "Raw", condition: "Near Mint" }));
  });
});

/* ============================================================== D */
describe("D. many copies of one printing, and the binder", () => {
  test("one of two copies becomes a Goal; the other is untouched; then the other is refused duplicate-goal", () => {
    const st = store(COPY("pc"), { collectorCopies: [COPY("pc"), { ...COPY("trade"), id: "twin", cert: "T-1" },
      { id: "theirs", collectorId: "dana", canonicalCardId: "cc-y", grade: "PSA 7", offered: true }] });
    const twin = json(st.get().collectorCopies.find((c) => c.id === "twin"));
    assert(x(st, CASEY, { collectorCopyId: "rec", from: "pc", to: "primary" }).ok !== false);
    eq(json(st.get().collectorCopies.find((c) => c.id === "twin")), twin);
    refusedUnchanged(st, CASEY, { collectorCopyId: "twin", from: "trade", to: "secondary" }, "duplicate-goal");
  });
  test("a record in a put-away binder keeps that home across a crossing", () => {
    const st = store(GOAL("secondary"), { binderMemberships: [{ id: "m-rec", binderId: "OLD", filedAt: AT, goalId: "rec" }] });
    const r = x(st, CASEY, { goalId: "rec", from: "secondary", to: "trade" });
    eq(json(st.get().binderMemberships), json([{ id: "m-rec", binderId: "OLD", filedAt: AT, collectorCopyId: r.value.id }]));
    assert(validateWorld(st.get()).ok);
  });
  test("an Unfiled record stays Unfiled", () => {
    const st = store(GOAL("primary"), { binderMemberships: [] });
    x(st, CASEY, { goalId: "rec", from: "primary", to: "pc" });
    eq(st.get().binderMemberships.length, 0);
  });
});

/* ============================================================== E */
describe("E. retries and races", () => {
  test("the same crossing twice: one record, answered as already done", () => {
    const st = store(GOAL("primary"));
    const a = x(st, CASEY, { goalId: "rec", from: "primary", to: "pc" });
    const b = x(st, CASEY, { goalId: "rec", from: "primary", to: "pc" });
    eq(b.value.id, a.value.id); eq(b.value.already, true);
    eq(mine(st.get()).length, 1);
  });
  test("two screens race from Primary: the first wins; the second (to Trade / Sell) is state-changed", () => {
    const st = store(GOAL("primary"));
    assert(x(st, CASEY, { goalId: "rec", from: "primary", to: "pc" }).ok !== false);
    refusedUnchanged(st, CASEY, { goalId: "rec", from: "primary", to: "trade" }, "state-changed");
    refusedUnchanged(st, CASEY, { goalId: "rec", from: "primary", to: "secondary" }, "state-changed");
  });
  test("same-type race: Primary → Secondary twice is done once; a stale Primary → PC after it is state-changed", () => {
    const st = store(GOAL("primary"));
    assert(x(st, CASEY, { goalId: "rec", from: "primary", to: "secondary" }).ok !== false);
    eq(x(st, CASEY, { goalId: "rec", from: "primary", to: "secondary" }).value.already, true);
    refusedUnchanged(st, CASEY, { goalId: "rec", from: "primary", to: "pc" }, "state-changed");
  });
});

/* ============================================================== F */
describe("F. the lineage is the Collector's alone", () => {
  test("a Trusted Partner's projection carries no lineage, and none of what it holds", () => {
    const st = store(COPY("pc"));
    const r = x(st, CASEY, { collectorCopyId: "rec", from: "pc", to: "primary" });
    const tp = json(projectForActor(st.get(), TP));
    assert(tp.includes(r.value.id), "the partner cannot see the Goal at all — the test proves nothing");
    assert(!tp.includes("formerly") && !tp.includes("K-SECRET") && !tp.includes("f.jpg"), "the lineage reached a partner");
    const mineView = projectForActor(st.get(), CASEY);
    eq(mineView.goals.find((g) => g.id === r.value.id).formerly[0].facts.cert, "K-SECRET");
    const dana = json(projectForActor(st.get(), DANA));
    assert(!dana.includes("formerly") && !dana.includes("K-SECRET"));
  });
  test("a copy made from a Goal: its lineage stays private, and partners see an ordinary Trade / Sell copy", () => {
    const st = store(GOAL("primary", { note: "PRIVATE-NOTE" }));
    const r = x(st, CASEY, { goalId: "rec", from: "primary", to: "trade" });
    const tp = projectForActor(st.get(), TP);
    const c = tp.collectorCopies.find((k) => k.id === r.value.id);
    assert(c, "a Trade / Sell copy is not in supply");
    assert(!json(tp).includes("formerly") && !json(tp).includes("PRIVATE-NOTE"));
  });
});

/* ============================================================== G */
describe("G. the door, and the database", () => {
  test("the command is offered to the product", () => {
    assert(EXPOSED_COMMANDS.includes("changeCollectingState"));
  });
  test("through the real server and Postgres: a crossing commits atomically, reloads with its lineage, and a refusal writes nothing", async () => {
    const { serve } = require("../harness/phase6-world.cjs");
    const ctx = await serve();
    try {
      const send = async (command, payload) => {
        const res = await fetch(ctx.url + "api/commands", { method: "POST", headers: { authorization: "Bearer casey", "content-type": "application/json" }, body: JSON.stringify({ command, payload }) });
        return { status: res.status, body: await res.json() };
      };
      const w0 = await ctx.world();
      const goal = w0.goals.find((g) => g.id === ctx.ids.goal);
      const home = (w0.binderMemberships || []).find((m) => m.goalId === goal.id);
      const r = await send("changeCollectingState", { goalId: goal.id, from: "primary", to: "pc" });
      assert(r.status === 200, json(r));
      const w1 = await ctx.world();
      const copy = w1.collectorCopies.find((c) => c.formerly && c.formerly.some((f) => f.id === goal.id));
      assert(copy && copy.keeping === true && copy.canonicalCardId === goal.canonicalCardId, "the copy did not reload");
      assert(!w1.goals.some((g) => g.id === goal.id), "the Goal is still there");
      eq(json(copy.formerly[0].facts.desired), json(goal.desired));
      const home1 = w1.binderMemberships.find((m) => m.collectorCopyId === copy.id);
      eq(json([home1.id, home1.binderId]), json([home.id, home.binderId]), "the home did not survive Postgres");
      /* a refusal through the server: the copy has no grade, so it cannot become a Goal */
      const before = json(await ctx.world());
      const no = await send("changeCollectingState", { collectorCopyId: copy.id, from: "pc", to: "primary" });
      assert(no.status !== 200 && /criteria-required/.test(json(no.body)), json(no));
      eq(json(await ctx.world()), before, "a refusal wrote something");
      /* and the repeat of the first is answered as done */
      const again = await send("changeCollectingState", { goalId: goal.id, from: "primary", to: "pc" });
      assert(again.status === 200 && /"already":true/.test(json(again.body)), json(again));
      eq(json(await ctx.world()), before);
    } finally { ctx.server.close(); }
  });
});

run();
