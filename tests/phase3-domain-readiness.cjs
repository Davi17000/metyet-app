/* ============================================================================
   PHASE 3 BATCH 1 — DOMAIN SERVER READINESS

   The command layer, the projection and the canonical world, made ready for a
   server to own them. No server, database, vendor or UI is involved; every test
   drives the pure domain modules directly.

     A  runtime contract — a runtime is required, branded and well formed
     B  injected identifiers — every minted id is the runtime's
     C  injected trusted time — every authoritative timestamp is the runtime's
     D  caller proposals — no payload time or id survives an authoritative runtime
     E  determinism and one clock reading per command
     F  refusals stay atomic
     G  the prototype compatibility adapter is explicit and behaves as before
     H  source guards — no second clock or id source in the domain
     I  read receipts — the other seat's viewedAt never reaches an actor
     J  validateWorld — accepts established worlds
     K  validateWorld — rejects malformed worlds with useful diagnostics
     L  validateWorld — pure
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");
const C = require("../domain/metyet-commands.js");
const RT = require("../domain/metyet-runtime.js");
const { createStore } = require("../domain/metyet-store.js");
const { projectForActor } = require("../domain/metyet-projection.js");
const { validateWorld, REQUIRED_COLLECTIONS } = require("../domain/metyet-world.js");
const M = require("../dist/MetYet.cjs");
const { unrelatedWorld } = require("./fixture-unrelated.cjs");

const R = D.REFUSE;
const ROOT = path.join(__dirname, "..");
/* What a caller's clock and a caller's ids look like. Neither may land. */
const FORGED_AT = "1999-12-31T23:59:59.000Z";
const FORGED = "FORGED-ID";

const card = (id, o = {}) => ({ id, name: o.name || "Charizard", set: o.set || "Base Set",
  num: o.num || "4/102", print: "Holo", edition: "Unlimited", language: "English",
  grade: o.grade || "PSA 9", condition: null, tags: [] });
const photos = (id) => ({ front: id + ":front", back: id + ":back" });

/* A small, fully valid world with every canonical collection present. */
function seed() {
  return {
    catalog: [card("k1"), card("k2", { name: "Blastoise", num: "2/102" }), card("k5", { name: "Venusaur", num: "15/102" })],
    collectors: [{ id: "c1", name: "Casey" }, { id: "c2", name: "Dana" }, { id: "c3", name: "Eli" }],
    partners: [{ id: "p1", name: "Northline", tradeRate: 0.8 }, { id: "p2", name: "Second" }],
    relationships: [{ partnerId: "p1", collectorId: "c1" }, { partnerId: "p1", collectorId: "c2" },
      { partnerId: "p2", collectorId: "c1" }],
    invitations: [],
    goals: [
      { id: "g1", collectorId: "c1", cardId: "k1", tier: "primary" },
      { id: "g2", collectorId: "c2", cardId: "k1", tier: "primary" },
    ],
    inventory: [
      { invId: "i1", partnerId: "p1", cardId: "k1", ask: 1000, cost: 700, archived: false, photos: photos("i1") },
      { invId: "i2", partnerId: "p1", cardId: "k1", ask: 1100, cost: 800, archived: false, photos: photos("i2") },
      { invId: "i3", partnerId: "p1", cardId: "k1", ask: 1200, cost: 900, archived: false, photos: photos("i3") },
    ],
    binder: [
      { id: "b1", collectorId: "c1", cardId: "k2", market: 350, cert: null, photos: photos("b1") },
      { id: "b2", collectorId: "c1", cardId: "k5", market: 200, cert: null, photos: photos("b2") },
    ],
    interests: [], conversations: [], opportunities: [], photoRequests: [], copyReviews: [],
    preferences: [], activity: [],
  };
}

const TP1 = { partnerId: "p1" };
const C1 = { collectorId: "c1" }, C2 = { collectorId: "c2" };
const PLAN = { method: "meetup", date: "2026-09-20", time: "18:00", location: "Card shop" };

const ok = (r, msg) => { assert(r && r.ok, (msg || "expected success") + " — refused: " + (r && r.refused)); return r.value; };
const clone = (v) => JSON.parse(JSON.stringify(v));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const countedId = (prefix) => new RegExp("^" + escapeRe(prefix) + "\\d{6}$");

/* An authoritative runtime that records what it handed out. */
function recording(base = RT.deterministicRuntime()) {
  const log = { times: [], ids: [] };
  const runtime = RT.createRuntime({ name: "recording",
    now: () => { const t = base.now(); log.times.push(t); return t; },
    newId: (prefix) => { const id = base.newId(prefix); log.ids.push(id); return id; } });
  return { runtime, log, last: () => log.times[log.times.length - 1] };
}

/* ------------------------------------------------------------ EVERY COMMAND
   Runs all 41 commands once or more on one store, every call carrying a forged
   `at` and, where a nested record can carry one, a forged id or timestamp too.
   Returns what each step was given (T = that command's runtime time) and what
   it wrote, for the tests below to check. */
function everyCommand(store, rec) {
  const ran = new Set();
  const T = () => rec.last();
  const x = (actor, cmd, payload) => {
    ran.add(cmd);
    return ok(store.execute(actor, cmd, { at: FORGED_AT, ...payload }), cmd);
  };
  const s = () => store.get();
  const opp = (id) => s().opportunities.find((o) => o.id === id);
  const out = { ran, steps: {} };
  const step = (name, value) => { out.steps[name] = { T: T(), ...value }; };

  x(TP1, "resolveCardIdentity", { identity: { ...card("unused", { name: "Mew", num: "8/102" }), id: FORGED } });
  const g = x(C1, "addGoal", { cardId: "k2", tier: "secondary", note: "wanted" });
  step("addGoal", { id: g, goal: s().goals.find((q) => q.id === g) });
  x(C1, "updateGoalTier", { goalId: g, tier: "primary" });
  step("updateGoalTier", { goal: s().goals.find((q) => q.id === g) });
  x(C1, "confirmGoal", { goalId: g });
  step("confirmGoal", { goal: s().goals.find((q) => q.id === g) });
  x(C1, "removeGoal", { goalId: g });

  const inv = x(TP1, "addInventoryCopy", { copy: { cardId: "k1", ask: 1000, cost: 700, acquired: "2020-05-05",
    invId: FORGED, addedAt: FORGED_AT, updatedAt: FORGED_AT } });
  step("addInventoryCopy", { id: inv, copy: s().inventory.find((i) => i.invId === inv) });
  x(TP1, "updateInventoryCopy", { invId: inv, patch: { ask: 1100, updatedAt: FORGED_AT } });
  step("updateInventoryCopy", { copy: s().inventory.find((i) => i.invId === inv) });
  const pr = x(C1, "requestPhotos", { invId: inv });
  step("requestPhotos", { id: pr, request: s().photoRequests.find((r) => r.id === pr) });
  const rv = x(C1, "reviewCopy", { invId: "i3" });
  step("reviewCopy", { id: rv, review: s().copyReviews.find((r) => r.id === rv) });
  x(C1, "endReview", { reviewId: rv });
  step("endReview", { review: s().copyReviews.find((r) => r.id === rv) });
  x(TP1, "addCopyPhotos", { invId: inv, front: "f", back: "b" });
  step("addCopyPhotos", { request: s().photoRequests.find((r) => r.id === pr) });
  x(TP1, "removeInventoryCopy", { invId: inv });

  const b = x(C1, "addBinderCopy", { copy: { cardId: "k2", market: 100, photos: photos("new"),
    id: FORGED, addedAt: FORGED_AT, updatedAt: FORGED_AT } });
  step("addBinderCopy", { id: b, copy: s().binder.find((q) => q.id === b) });
  x(C1, "updateBinderCopy", { binderId: b, patch: { market: 120, addedAt: FORGED_AT, updatedAt: FORGED_AT } });
  step("updateBinderCopy", { copy: s().binder.find((q) => q.id === b) });
  x(TP1, "setInterest", { binderId: b, on: true });
  step("setInterest", { interest: s().interests.find((i) => i.binderId === b) });
  x(C1, "removeBinderCopy", { binderId: b });

  const invitee = x(TP1, "inviteCollector", { email: "new@example.test", note: "met at a show",
    collector: { name: "New Person", id: FORGED, since: FORGED_AT, binderReviewedAt: FORGED_AT } });
  step("inviteCollector", { id: invitee, invitation: s().invitations.find((i) => i.collectorId === invitee) });
  x(TP1, "updatePartnerProfile", { patch: { about: "Vintage specialists" } });
  x(TP1, "markBinderReviewed", { collectorId: "c1" });
  step("markBinderReviewed", { relationship: s().relationships.find((r) => r.partnerId === "p1" && r.collectorId === "c1") });

  const lastEntry = () => { const ts = s().conversations; const t = ts[ts.length - 1]; return t.entries[t.entries.length - 1]; };
  x(C1, "sendMessage", { partnerId: "p1", cardId: "k1", text: "Still looking" });
  step("sendMessage", { entry: lastEntry() });
  x(TP1, "reachOut", { collectorId: "c2", cardId: "k1" });
  step("reachOut", { entry: lastEntry() });
  x(TP1, "recordNote", { collectorId: "c2", cardId: "k1", milestone: "Called",
    activity: { type: "manual", text: "Called Dana", date: FORGED_AT } });
  step("recordNote", { entry: lastEntry(), activity: s().activity[0] });

  /* One full lifecycle with a trade. */
  const o = x(C1, "startOpportunity", { goalId: "g1", invId: "i1", amount: 900 });
  step("startOpportunity", { id: o, opp: opp(o) });
  x(TP1, "proposePrice", { oppId: o, amount: 980 });
  step("proposePrice", { opp: opp(o) });
  x(C1, "acceptPrice", { oppId: o });
  step("acceptPrice", { opp: opp(o) });
  x(C1, "proposeTradeSelection", { oppId: o, binderIds: ["b1"] });
  step("proposeTradeSelection", { opp: opp(o) });
  x(TP1, "reviewTradeCard", { oppId: o, decision: "accepted" });
  step("reviewTradeCard", { opp: opp(o) });
  const row = () => opp(o).trade.cards[0].id;
  x(C1, "proposeMarketValue", { oppId: o, tradeCardId: row(), amount: 300 });
  step("proposeMarketValue", { opp: opp(o) });
  x(TP1, "acceptMarketValue", { oppId: o, tradeCardId: row() });
  step("acceptMarketValue", { opp: opp(o) });
  x(TP1, "proposeTradePercent", { oppId: o, tradeCardId: row(), percent: 0.8 });
  step("proposeTradePercent", { opp: opp(o) });
  x(C1, "acceptTradePercent", { oppId: o, tradeCardId: row() });
  step("acceptTradePercent", { opp: opp(o) });
  x(TP1, "acceptDeal", { oppId: o });
  x(C1, "proposeFinalBalance", { oppId: o, amount: 450 });
  step("proposeFinalBalance", { opp: opp(o) });
  x(TP1, "acceptDeal", { oppId: o });
  x(C1, "acceptDeal", { oppId: o });
  step("acceptDeal", { opp: opp(o) });
  x(TP1, "proposeFulfillment", { oppId: o, plan: { ...PLAN, proposedAt: FORGED_AT, confirmedAt: FORGED_AT } });
  step("proposeFulfillment", { opp: opp(o) });
  x(C1, "requestFulfillmentRevision", { oppId: o, note: "Sunday instead" });
  step("requestFulfillmentRevision", { opp: opp(o) });
  x(TP1, "proposeFulfillment", { oppId: o, plan: { ...PLAN, date: "2026-09-21" } });
  x(C1, "confirmFulfillmentPlan", { oppId: o });
  step("confirmFulfillmentPlan", { opp: opp(o) });
  x(TP1, "confirmHandoff", { oppId: o });
  x(C1, "confirmHandoff", { oppId: o });
  step("confirmHandoff", { opp: opp(o) });
  x(C1, "markDealViewed", { oppId: o, surface: "timeline" });
  step("markDealViewed", { opp: opp(o) });

  /* Withdrawal: a second deal on another copy for the same (now satisfied) Goal. */
  const w = x(C1, "startOpportunity", { goalId: "g1", invId: "i2", amount: 950 });
  x(TP1, "acceptPrice", { oppId: w });
  x(C1, "proposeTradeSelection", { oppId: w, binderIds: ["b2"] });
  x(C1, "withdrawTradeCard", { oppId: w, tradeCardId: opp(w).trade.cards[0].id });
  step("withdrawTradeCard", { opp: opp(w) });

  /* Cash only, then cancellation. */
  const k = x(C2, "startOpportunity", { goalId: "g2", invId: "i3", amount: 1000 });
  x(TP1, "acceptPrice", { oppId: k });
  x(C2, "chooseCashOnly", { oppId: k });
  step("chooseCashOnly", { opp: opp(k) });
  x(C2, "cancelOpportunity", { oppId: k });
  step("cancelOpportunity", { opp: opp(k) });

  out.ids = { goal: g, inv, pr, rv, binder: b, invitee, o, w, k };
  return out;
}

function runEvery(base) {
  const rec = recording(base);
  const store = createStore(seed(), { runtime: rec.runtime });
  const result = everyCommand(store, rec);
  return { store, rec, ...result };
}
let shared = null;
const every = () => (shared || (shared = runEvery()));

/* ============================================================== A */
describe("A. runtime contract", () => {
  test("execute refuses to run without a runtime — it throws before reading anything", () => {
    const state = createStore(seed()).get();
    const before = JSON.stringify(state);
    for (const bad of [undefined, null, {}, { now: () => "t", newId: (p) => p + "1" }]) {
      let threw = null;
      try { C.execute(state, C1, "addGoal", { cardId: "k2" }, bad); } catch (e) { threw = e; }
      assert(threw instanceof TypeError, "a missing or unbranded runtime throws a TypeError");
      assert(/runtime is required/.test(threw.message), "and says a runtime is required");
    }
    eq(JSON.stringify(state), before, "state untouched");
  });

  test("createRuntime validates its capabilities; only branded runtimes are runtimes", () => {
    const threw = (fn) => { try { fn(); return false; } catch (e) { return e instanceof TypeError; } };
    assert(threw(() => RT.createRuntime({ newId: () => "x1" })), "now is required");
    assert(threw(() => RT.createRuntime({ now: () => "t" })), "newId is required");
    assert(threw(() => RT.createRuntime({ now: () => "t", newId: () => "x1", mode: "client" })), "mode is closed");
    const rt = RT.createRuntime({ now: () => "t", newId: (p) => p + "1" });
    assert(RT.isRuntime(rt) && Object.isFrozen(rt), "a created runtime is branded and frozen");
    eq(rt.mode, "authoritative", "authoritative by default");
    assert(!RT.isRuntime({ ...rt }), "a copy of its fields is not a runtime");
    assert(threw(() => createStore(seed(), { runtime: { now: () => "t", newId: (p) => p + "1" } })),
      "createStore refuses an unbranded runtime");
  });

  test("a runtime that returns a bad time or id is a wiring error, not a silent default", () => {
    const state = createStore(seed()).get();
    const threw = (rt, cmd, payload) => { try { C.execute(state, C1, cmd, payload, rt); return false; } catch (e) { return e instanceof TypeError; } };
    assert(threw(RT.createRuntime({ now: () => "", newId: (p) => p + "1" }), "addGoal", { cardId: "k2" }), "empty time");
    assert(threw(RT.createRuntime({ now: () => 123, newId: (p) => p + "1" }), "addGoal", { cardId: "k2" }), "non-string time");
    assert(threw(RT.createRuntime({ now: () => "t", newId: (p) => p }), "addGoal", { cardId: "k2" }), "id that is only the prefix");
    assert(threw(RT.createRuntime({ now: () => "t", newId: () => "zz1" }), "addGoal", { cardId: "k2" }), "id without the prefix");
  });

  test("the command context exposes time and ids only — no identity, no payload", () => {
    const ctx = RT.callContext(RT.deterministicRuntime(), { at: FORGED_AT, partnerId: "p1", seat: "tp" });
    eq(Object.keys(ctx).sort().join(","), "at,id,mode,now,time", "context keys");
    assert(Object.isFrozen(ctx), "and it is frozen");
    assert(ctx.at !== FORGED_AT, "the payload clock is not the context's time");
  });

  test("systemRuntime reads the injected clock and mints prefix + 16 unbiased symbols from Web Crypto", () => {
    const rt = RT.systemRuntime({ clock: () => new Date("2027-03-04T05:06:07.089Z") });
    eq(rt.now(), "2027-03-04T05:06:07.089Z", "ISO time from the clock");
    const ids = new Set();
    for (let i = 0; i < 5000; i += 1) {
      const id = rt.newId("o");
      assert(/^o[0-9a-hjkmnp-tv-z]{16}$/.test(id), "shape: " + id);
      ids.add(id);
    }
    eq(ids.size, 5000, "5000 ids, no collision");
    assert(typeof globalThis.crypto.getRandomValues === "function", "Web Crypto is the source");
  });

  test("deterministicRuntime is scripted: same options, same sequence", () => {
    const a = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 60000 });
    const b = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 60000 });
    eq(a.now(), "2030-01-01T00:00:00.000Z"); eq(a.now(), "2030-01-01T00:01:00.000Z");
    eq(b.now(), "2030-01-01T00:00:00.000Z");
    eq(a.newId("g"), "g000001"); eq(a.newId("o"), "o000002"); eq(b.newId("g"), "g000001");
  });
});

/* ============================================================== B */
describe("B. every minted id comes from the injected runtime", () => {
  test("all 41 commands ran", () => {
    const { ran } = every();
    const missing = C.COMMAND_NAMES.filter((n) => !ran.has(n));
    eq(missing.join(","), "", "commands not exercised");
    eq(C.COMMAND_NAMES.length, 41, "the command set");
  });

  test("each new record's id is exactly what the runtime handed out, with the record's prefix", () => {
    const { steps, rec, ids } = every();
    const handed = new Set(rec.log.ids);
    const expect = [["addGoal", "g"], ["addInventoryCopy", "invk1-"], ["requestPhotos", "pr"],
      ["reviewCopy", "rv"], ["addBinderCopy", "b"], ["inviteCollector", "c"], ["startOpportunity", "o"]];
    for (const [name, prefix] of expect) {
      const id = steps[name].id;
      assert(countedId(prefix).test(id), `${name} id "${id}" has the runtime's shape for "${prefix}"`);
      assert(handed.has(id), `${name} id was handed out by the runtime`);
      assert(id !== FORGED, `${name} ignored the caller's id`);
    }
    assert(countedId("inv-").test(steps.inviteCollector.invitation.id), "invitation id");
    assert(countedId("e").test(steps.sendMessage.entry.id), "message entry id");
    assert(countedId("e").test(steps.recordNote.entry.id), "milestone entry id");
    assert(countedId("a").test(steps.recordNote.activity.id), "activity id");
    assert(countedId("tck2-").test(steps.proposeTradeSelection.opp.trade.cards[0].id), "trade row id");
    eq(steps.requestPhotos.request.id, ids.pr, "request id");
  });

  test("ids the domain DERIVES rather than mints are unchanged: thread, review-with-request, catalog", () => {
    const { store, ids } = every();
    const s = store.get();
    assert(s.copyReviews.some((r) => r.id === "rv" + ids.pr), "a photo request's Review Card is rv + request id");
    s.conversations.forEach((t) => eq(t.id, "t" + t.key, "a thread id is derived from its key"));
    assert(s.catalog.some((c) => /^cmew/.test(c.id)), "a new catalog identity is derived from the identity key");
  });

  test("the system runtime drives every command without Math.random", () => {
    const original = Math.random;
    Math.random = () => { throw new Error("Math.random was called"); };
    try {
      const { store, rec } = runEvery(RT.systemRuntime());
      assert(rec.log.ids.length >= 15, "ids were minted: " + rec.log.ids.length);
      rec.log.ids.forEach((id) => assert(/[0-9a-hjkmnp-tv-z]{16}$/.test(id), "crypto token: " + id));
      assert(validateWorld(store.get()).ok, "and the world it built is valid");
    } finally { Math.random = original; }
  });
});

/* ============================================================== C */
describe("C. every authoritative timestamp is the injected runtime's time", () => {
  const cases = {
    addGoal: (x) => [x.goal.since],
    updateGoalTier: (x) => [x.goal.since, x.goal.confirmedAt],
    confirmGoal: (x) => [x.goal.confirmedAt],
    addInventoryCopy: (x) => [x.copy.addedAt],
    updateInventoryCopy: (x) => [x.copy.updatedAt],
    requestPhotos: (x) => [x.request.at],
    reviewCopy: (x) => [x.review.at],
    endReview: (x) => [x.review.endedAt],
    addCopyPhotos: (x) => [x.request.fulfilledAt],
    addBinderCopy: (x) => [x.copy.addedAt],
    updateBinderCopy: (x) => [x.copy.updatedAt],
    setInterest: (x) => [x.interest.at],
    inviteCollector: (x) => [x.invitation.at],
    markBinderReviewed: (x) => [x.relationship.binderReviewedAt],
    sendMessage: (x) => [x.entry.at],
    reachOut: (x) => [x.entry.at],
    recordNote: (x) => [x.entry.at, x.activity.date],
    startOpportunity: (x) => [x.opp.priceThread[0].at, x.opp.updated],
    proposePrice: (x) => [D.lastEntry(x.opp.priceThread).at, x.opp.updated],
    acceptPrice: (x) => [D.lastEntry(x.opp.priceThread).at, x.opp.updated],
    proposeTradeSelection: (x) => [x.opp.updated],
    reviewTradeCard: (x) => [x.opp.trade.cards[0].reviewedAt, x.opp.updated],
    proposeMarketValue: (x) => [D.lastEntry(x.opp.trade.cards[0].valueThread).at],
    acceptMarketValue: (x) => [D.lastEntry(x.opp.trade.cards[0].valueThread).at],
    proposeTradePercent: (x) => [D.lastEntry(x.opp.trade.cards[0].percentThread).at],
    acceptTradePercent: (x) => [D.lastEntry(x.opp.trade.cards[0].percentThread).at, x.opp.updated],
    proposeFinalBalance: (x) => [D.lastEntry(x.opp.deal.adjThread).at, x.opp.updated],
    acceptDeal: (x) => [D.lastEntry(x.opp.deal.adjThread).at, x.opp.updated, x.opp.at],
    proposeFulfillment: (x) => [x.opp.fulfillment.proposedAt, x.opp.updated],
    requestFulfillmentRevision: (x) => [x.opp.fulfillment.revisionRequested.at],
    confirmFulfillmentPlan: (x) => [x.opp.fulfillment.confirmedAt],
    confirmHandoff: (x) => [x.opp.completedAt, x.opp.updated],
    markDealViewed: (x) => [x.opp.viewedAt.collector.timeline],
    withdrawTradeCard: (x) => [x.opp.trade.cards[0].withdrawnAt, x.opp.updated],
    chooseCashOnly: (x) => [x.opp.trade.cashOnlyAt, x.opp.updated],
    cancelOpportunity: (x) => [x.opp.endedAt, x.opp.updated],
  };
  for (const [name, read] of Object.entries(cases)) {
    test(`${name} stamps the runtime's time`, () => {
      const x = every().steps[name];
      assert(x, "step recorded");
      const values = read(x);
      values.forEach((v, i) => eq(v, x.T, `${name} timestamp #${i + 1}`));
    });
  }

  test("user-entered date facts stay the person's: acquired, meeting date and time", () => {
    const { steps, store, ids } = every();
    eq(steps.addInventoryCopy.copy.acquired, "2020-05-05", "acquisition date kept");
    const f = store.get().opportunities.find((o) => o.id === ids.o).fulfillment;
    eq(f.date, "2026-09-21", "meeting date kept");
    eq(f.time, "18:00", "meeting time kept");
  });

  test("a revised plan cannot carry its own proposal or confirmation time", () => {
    const { steps } = every();
    const f = steps.proposeFulfillment.opp.fulfillment;
    eq(f.proposedAt, steps.proposeFulfillment.T, "proposedAt is the command's");
    assert(f.confirmedAt !== FORGED_AT, "a plan's confirmedAt is not taken from the payload");
  });
});

/* ============================================================== D */
describe("D. caller proposals never survive an authoritative runtime", () => {
  test("no forged time or id appears anywhere in canonical state", () => {
    const text = JSON.stringify(every().store.get());
    assert(!text.includes(FORGED_AT), "a caller's timestamp landed");
    assert(!text.includes(FORGED), "a caller's id landed");
    assert(!text.includes("1999-"), "nothing from the caller's calendar at all");
  });

  test("nested timestamps a copy or patch carries are replaced, not merged", () => {
    const { steps } = every();
    eq(steps.addBinderCopy.copy.updatedAt, undefined, "a new binder copy has no caller updatedAt");
    eq(steps.addInventoryCopy.copy.updatedAt, undefined, "a new inventory copy has no caller updatedAt");
    eq(steps.updateBinderCopy.copy.addedAt, steps.addBinderCopy.T, "a patch cannot move addedAt");
  });

  test("an invitation cannot pre-date its collector's relationship metadata", () => {
    const { store, ids } = every();
    const pending = store.get().collectors.find((c) => c.id === ids.invitee);
    for (const f of ["since", "binderReviewedAt"]) assert(!(f in pending), f + " dropped from the invitee");
  });

  test("the actor stays the only authority: runtime and payload cannot change the seat", () => {
    const rec = recording();
    const store = createStore(seed(), { runtime: rec.runtime });
    const before = store.get();
    const r = store.execute(C1, "acceptPrice", { oppId: "nope", seat: "tp", partnerId: "p1", by: "tp", at: FORGED_AT });
    assert(!r.ok, "refused");
    const unknown = store.execute({ partnerId: "p9" }, "addGoal", { collectorId: "c1", cardId: "k2" });
    eq(unknown.refused, R.unknownActor, "an unknown actor is refused whatever the runtime");
    assert(store.get() === before, "nothing changed");
  });
});

/* ============================================================== E */
describe("E. determinism and one reading per command", () => {
  test("the same commands on the same runtime script produce the same world", () => {
    const a = runEvery(RT.deterministicRuntime({ start: "2030-05-05T00:00:00.000Z" })).store.get();
    const b = runEvery(RT.deterministicRuntime({ start: "2030-05-05T00:00:00.000Z" })).store.get();
    eq(JSON.stringify(a), JSON.stringify(b), "byte-identical worlds");
  });

  test("a different clock moves only the times", () => {
    const a = runEvery(RT.deterministicRuntime({ start: "2030-05-05T00:00:00.000Z" })).store.get();
    const b = runEvery(RT.deterministicRuntime({ start: "2032-06-06T00:00:00.000Z" })).store.get();
    assert(JSON.stringify(a) !== JSON.stringify(b), "the worlds differ");
    const strip = (w) => JSON.stringify(w).replace(/20\d\d-\d\d-\d\dT[\d:.]+Z/g, "T");
    eq(strip(a), strip(b), "and only in their timestamps");
  });

  test("each command reads the clock exactly once, successful or refused", () => {
    const rec = recording();
    const store = createStore(seed(), { runtime: rec.runtime });
    ok(store.execute(C1, "startOpportunity", { goalId: "g1", invId: "i1", amount: 900 }));
    eq(rec.log.times.length, 1, "one reading for a success");
    store.execute(C1, "proposePrice", { oppId: "missing", amount: 1 });
    eq(rec.log.times.length, 2, "one reading for a refusal");
    ok(store.execute(C1, "sendMessage", { partnerId: "p1", cardId: "k1", text: "a thread entry needs a time" }));
    eq(rec.log.times.length, 3, "one reading where a timestamp must exist");
  });

  test("everything one command writes carries one time", () => {
    const { steps } = every();
    const o = steps.acceptDeal.opp;
    eq(new Set([D.lastEntry(o.deal.adjThread).at, o.updated, o.at]).size, 1, "adjThread, updated and at agree");
  });
});

/* ============================================================== F */
describe("F. refusals stay atomic", () => {
  test("refused commands under an authoritative runtime change nothing and return no state", () => {
    const rec = recording();
    const store = createStore(seed(), { runtime: rec.runtime });
    const o = ok(store.execute(C1, "startOpportunity", { goalId: "g1", invId: "i1", amount: 900 }));
    const refs = [
      [TP1, "startOpportunity", { goalId: "g1", invId: "i1", amount: 900 }, R.notOwner],
      [C1, "proposePrice", { oppId: o, amount: 950 }, R.notYourTurn],
      [TP1, "proposePrice", { oppId: o, amount: -5 }, R.invalidAmount],
      [C2, "acceptPrice", { oppId: o }, R.notParticipant],
      [C1, "chooseCashOnly", { oppId: o }, R.wrongStage],
      [C1, "removeGoal", { goalId: "g1" }, R.goalLocked],
      [C1, "addBinderCopy", { copy: { cardId: "k2", photos: { front: "f" } } }, R.photosRequired],
      [C1, "noSuchCommand", {}, R.unknownCommand],
    ];
    for (const [actor, cmd, payload, code] of refs) {
      const before = store.get();
      const text = JSON.stringify(before);
      const r = store.execute(actor, cmd, { ...payload, at: FORGED_AT });
      eq(r.refused, code, cmd + " refusal");
      assert(store.get() === before, cmd + ": same state object");
      eq(JSON.stringify(store.get()), text, cmd + ": same bytes");
      const direct = C.execute(before, actor, cmd, payload, rec.runtime);
      assert(!("state" in direct), cmd + ": a refusal carries no next state");
    }
  });
});

/* ============================================================== G */
describe("G. the prototype compatibility adapter", () => {
  test("the in-process store defaults to it, explicitly", () => {
    const src = fs.readFileSync(path.join(ROOT, "domain", "metyet-store.js"), "utf8");
    assert(/"runtime" in options \? options\.runtime : RT\.prototypeRuntime\(\)/.test(src),
      "createStore's default runtime is prototypeRuntime()");
    let threw = false;
    try { createStore(seed(), { runtime: undefined }); } catch (e) { threw = e instanceof TypeError; }
    assert(threw, "naming a runtime that is undefined does not silently fall back to the adapter");
    eq(RT.prototypeRuntime().mode, "prototype", "and it declares itself");
    eq(RT.systemRuntime().mode, "authoritative");
    eq(RT.deterministicRuntime().mode, "authoritative");
  });

  test("it honours the demo clock and fixture ids exactly as before", () => {
    const store = createStore(seed());
    const g = ok(store.execute(C1, "addGoal", { cardId: "k2", tier: "primary", at: "2026-08-14" }));
    eq(store.get().goals.find((x) => x.id === g).since, "2026-08-14", "the shell's demo date");
    eq(ok(store.execute(TP1, "addInventoryCopy", { copy: { invId: "inv-fixture", cardId: "k1", ask: 5 }, at: "2026-08-09" })),
      "inv-fixture", "a fixture's own id");
    eq(store.get().inventory.find((i) => i.invId === "inv-fixture").addedAt, "2026-08-09", "stamped with the demo date");
    const b = ok(store.execute(C1, "addBinderCopy", { copy: { id: "b-fixture", cardId: "k2", photos: photos("x"), addedAt: "2026-08-01" } }));
    eq(store.get().binder.find((x) => x.id === b).addedAt, "2026-08-01", "a copy's own addedAt");
  });

  test("with no demo date, optional stamps stay absent and thread entries take the process clock", () => {
    const store = createStore(seed());
    const o = ok(store.execute(C1, "startOpportunity", { goalId: "g1", invId: "i1", amount: 900 }));
    eq(store.get().opportunities.find((x) => x.id === o).updated, undefined, "no invented updated");
    const t0 = new Date().toISOString();
    ok(store.execute(C1, "sendMessage", { partnerId: "p1", cardId: "k1", text: "hello" }));
    const e = store.get().conversations[0].entries[0];
    assert(e.at >= t0 && e.at <= new Date().toISOString(), "entry time from the adapter's clock");
    assert(/^e[0-9a-hjkmnp-tv-z]{16}$/.test(e.id), "entry id from Web Crypto, not Math.random");
  });

  test("the same store runs authoritatively when a runtime is injected", () => {
    const store = createStore(seed(), { runtime: RT.deterministicRuntime({ start: "2033-01-01T00:00:00.000Z" }) });
    const g = ok(store.execute(C1, "addGoal", { cardId: "k2", at: "2026-08-14" }));
    eq(g, "g000001", "minted");
    eq(store.get().goals.find((x) => x.id === g).since, "2033-01-01T00:00:00.000Z", "runtime time, not the demo date");
  });
});

/* ============================================================== H */
describe("H. source guards", () => {
  const domainFiles = fs.readdirSync(path.join(ROOT, "domain")).filter((f) => f.endsWith(".js"));
  const code = (f) => fs.readFileSync(path.join(ROOT, "domain", f), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  test("no domain module but the runtime reads a clock or a random source", () => {
    for (const f of domainFiles) {
      if (f === "metyet-runtime.js") continue;
      const c = code(f);
      assert(!/Math\.random/.test(c), f + " uses Math.random");
      assert(!/Date\.now\s*\(/.test(c), f + " reads Date.now()");
      assert(!/new Date\s*\(\s*\)/.test(c), f + " reads new Date()");
    }
    assert(!/Math\.random/.test(code("metyet-runtime.js")), "the runtime itself never uses Math.random");
  });

  test("no command reads the payload's `at`", () => {
    const c = code("metyet-commands.js");
    const signatures = c.match(/\(state, a, \{[^}]*\}/g) || [];
    assert(signatures.length >= 30, "command signatures found");
    signatures.forEach((sig) => assert(!/\bat\b/.test(sig), "destructures at: " + sig));
    assert(/const \{ at, \.\.\.args \} = payload \|\| \{\};/.test(c), "execute removes at before dispatch");
    assert(!/payload\.at/.test(c), "nothing reads payload.at");
  });

  test("appendThreadEntry refuses to invent an id or a time", () => {
    const threw = (args) => { try { D.appendThreadEntry([], args); return false; } catch (e) { return e instanceof TypeError; } };
    const base = { collectorId: "c1", partnerId: "p1", card: card("k1"), cardId: "k1", entry: { kind: "message", by: "tp", text: "x" } };
    assert(threw({ ...base, at: "t" }), "no id");
    assert(threw({ ...base, id: "e1" }), "no time");
    eq(D.appendThreadEntry([], { ...base, id: "e1", at: "t" })[0].entries[0].id, "e1", "given both, it appends");
  });

  test("the validator and runtime modules take no dependency and do no I/O", () => {
    for (const f of ["metyet-runtime.js", "metyet-world.js"]) {
      const c = code(f);
      const reqs = (c.match(/require\("([^"]+)"\)/g) || []).map((r) => r.slice(9, -2));
      reqs.forEach((r) => assert(r.startsWith("./"), f + " requires " + r));
      assert(!/\b(fs|http|https|net|process)\b\./.test(c), f + " touches I/O or the process");
    }
  });
});

/* ============================================================== I */
describe("I. read receipts: the other seat's viewedAt never reaches an actor", () => {
  /* Distinctive times per seat, so a leak is a substring. */
  const seatWorld = () => {
    const store = createStore(seed(), { runtime: RT.deterministicRuntime({ start: "2031-01-01T00:00:00.000Z", stepMs: 3600000 }) });
    const o = ok(store.execute(C1, "startOpportunity", { goalId: "g1", invId: "i1", amount: 900 }));
    return { store, o };
  };
  const oppIn = (proj, id) => proj.opportunities.find((x) => x.id === id);
  const times = (seatMarks) => Object.values(seatMarks || {});

  test("a collector opening a deal changes nothing the Trusted Partner receives", () => {
    const { store, o } = seatWorld();
    const before = JSON.stringify(projectForActor(store.get(), TP1));
    ok(store.execute(C1, "markDealViewed", { oppId: o, surface: "timeline" }));
    ok(store.execute(C1, "markDealViewed", { oppId: o, surface: "messages" }));
    assert(store.get().opportunities[0].viewedAt.collector.messages, "canonical state keeps the collector's position");
    eq(JSON.stringify(projectForActor(store.get(), TP1)), before, "the partner's whole projection is byte-identical");
  });

  test("a partner opening a deal changes nothing the Collector receives", () => {
    const { store, o } = seatWorld();
    const before = JSON.stringify(projectForActor(store.get(), C1));
    ok(store.execute(TP1, "markDealViewed", { oppId: o, surface: "timeline" }));
    ok(store.execute(TP1, "markDealViewed", { oppId: o, surface: "messages" }));
    assert(store.get().opportunities[0].viewedAt.tp.timeline, "canonical state keeps the partner's position");
    eq(JSON.stringify(projectForActor(store.get(), C1)), before, "the collector's whole projection is byte-identical");
  });

  test("when both have looked, each receives only its own position, intact", () => {
    const { store, o } = seatWorld();
    ok(store.execute(TP1, "markDealViewed", { oppId: o, surface: "timeline" }));
    ok(store.execute(C1, "markDealViewed", { oppId: o, surface: "messages" }));
    const canon = store.get().opportunities[0].viewedAt;
    const tp = projectForActor(store.get(), TP1);
    const col = projectForActor(store.get(), C1);
    eq(JSON.stringify(oppIn(tp, o).viewedAt), JSON.stringify({ tp: canon.tp }), "partner: own seat only");
    eq(JSON.stringify(oppIn(col, o).viewedAt), JSON.stringify({ collector: canon.collector }), "collector: own seat only");
    const tpText = JSON.stringify(tp), colText = JSON.stringify(col);
    times(canon.collector).forEach((t) => assert(!tpText.includes(t), "collector time reached the partner: " + t));
    times(canon.tp).forEach((t) => assert(!colText.includes(t), "partner time reached the collector: " + t));
  });

  test("a seat that has never looked receives no viewedAt field at all", () => {
    const { store, o } = seatWorld();
    ok(store.execute(C1, "markDealViewed", { oppId: o, surface: "timeline" }));
    assert(!("viewedAt" in oppIn(projectForActor(store.get(), TP1), o)), "field absent for the partner");
    ok(store.execute(TP1, "markDealViewed", { oppId: o, surface: "timeline" }));
    const fresh = seatWorld();
    ok(fresh.store.execute(TP1, "markDealViewed", { oppId: fresh.o, surface: "timeline" }));
    assert(!("viewedAt" in oppIn(projectForActor(fresh.store.get(), C1), fresh.o)), "field absent for the collector");
  });

  test("terminal deals too — completed and cancelled", () => {
    const { store, ids } = runEvery(RT.deterministicRuntime({ start: "2034-01-01T00:00:00.000Z" }));
    for (const id of [ids.o, ids.k]) {
      const o = store.get().opportunities.find((x) => x.id === id);
      const tpActor = { partnerId: o.partnerId }, colActor = { collectorId: o.collectorId };
      ok(store.execute(tpActor, "markDealViewed", { oppId: id, surface: "messages" }));
      ok(store.execute(colActor, "markDealViewed", { oppId: id, surface: "messages" }));
      eq(Object.keys(oppIn(projectForActor(store.get(), tpActor), id).viewedAt).join(), "tp", id + " partner");
      eq(Object.keys(oppIn(projectForActor(store.get(), colActor), id).viewedAt).join(), "collector", id + " collector");
    }
  });

  test("across a multi-party world, no projection carries another seat's position", () => {
    const w = unrelatedWorld();
    for (const o of w.store.get().opportunities) {
      ok(w.store.execute({ partnerId: o.partnerId }, "markDealViewed", { oppId: o.id, surface: "timeline" }));
      ok(w.store.execute({ collectorId: o.collectorId }, "markDealViewed", { oppId: o.id, surface: "timeline" }));
    }
    for (const [name, actor] of Object.entries(w.actors)) {
      const seat = actor.partnerId ? "tp" : "collector";
      for (const o of projectForActor(w.store.get(), actor).opportunities) {
        const keys = Object.keys(o.viewedAt || {});
        assert(keys.every((k) => k === seat), `${name} received ${keys.join(",")} on ${o.id}`);
      }
    }
  });

  test("the collector's unread state is unchanged by the projection", () => {
    const { store, o } = seatWorld();
    ok(store.execute(C1, "markDealViewed", { oppId: o, surface: "messages" }));
    ok(store.execute(TP1, "proposePrice", { oppId: o, amount: 980 }));
    ok(store.execute(TP1, "markDealViewed", { oppId: o, surface: "timeline" }));
    const canon = store.get().opportunities[0];
    const mine = oppIn(projectForActor(store.get(), C1), o);
    const events = (canon.priceThread || []).map((e) => ({ ...e, kind: "message" }));
    eq(JSON.stringify(D.unreadFor(events, mine.viewedAt, "collector")),
      JSON.stringify(D.unreadFor(events, canon.viewedAt, "collector")), "same unread from the projection");
  });

  test("the byte-identity check does catch a leak (detector self-test)", () => {
    const { store, o } = seatWorld();
    const before = JSON.stringify(projectForActor(store.get(), TP1));
    ok(store.execute(C1, "markDealViewed", { oppId: o, surface: "timeline" }));
    const honest = projectForActor(store.get(), TP1);
    const leaky = { ...honest, opportunities: honest.opportunities.map((x) => ({ ...x,
      viewedAt: store.get().opportunities.find((c) => c.id === x.id).viewedAt })) };
    eq(JSON.stringify(honest), before, "honest projection unchanged");
    assert(JSON.stringify(leaky) !== before, "a projection forwarding canonical viewedAt is detected");
  });
});

/* ============================================================== J */
const DEMO_STAGES = ["pre-deal", "agree-price", "select-trade", "value-trade", "deal", "fulfillment", "completed"];
const explain = (r) => r.errors.slice(0, 5).map((e) => `${e.code} @ ${e.path}: ${e.message}`).join(" | ");

describe("J. validateWorld accepts established worlds", () => {
  test("the product seed, as the store holds it", () => {
    const r = validateWorld(createStore(M.buildCanonicalSeed()).get());
    assert(r.ok, explain(r));
    eq(r.errors.length, 0);
  });

  test("the review seed and every demo stage", () => {
    const r0 = validateWorld(createStore(M.buildCanonicalSeed({ review: true })).get());
    assert(r0.ok, "review: " + explain(r0));
    for (const demoStage of DEMO_STAGES) {
      const r = validateWorld(createStore(M.buildCanonicalSeed({ review: true, demoStage })).get());
      assert(r.ok, demoStage + ": " + explain(r));
    }
  });

  test("the multi-party visibility fixture at every recorded step", () => {
    const w = unrelatedWorld();
    const r = validateWorld(w.store.get());
    assert(r.ok, "final: " + explain(r));
    for (const [name, snap] of Object.entries(w.snapshots.oABA)) {
      const rs = validateWorld(snap);
      assert(rs.ok, name + ": " + explain(rs));
    }
  });

  test("a world built by all 41 commands, before and after a JSON round trip", () => {
    const { store } = every();
    const r = validateWorld(store.get());
    assert(r.ok, explain(r));
    const copy = clone(store.get());
    assert(validateWorld(copy).ok, "a persisted copy validates");
    for (const actor of [TP1, C1, C2]) {
      eq(JSON.stringify(projectForActor(copy, actor)), JSON.stringify(projectForActor(store.get(), actor)),
        "and projects identically for " + JSON.stringify(actor));
    }
  });

  test("history stays valid: a satisfied Goal removed, a sold copy archived, a relationship ended", () => {
    const { store, ids } = every();
    const world = clone(store.get());
    world.goals = world.goals.filter((g) => g.id !== "g2");   // cancelled deal k keeps g2's id
    world.inventory = world.inventory.map((i) => (i.invId === "i1" ? { ...i, archived: true } : i));
    world.relationships = world.relationships.map((r) => (r.collectorId === "c2" ? { ...r, status: "ended" } : r));
    world.opportunities.find((o) => o.id === ids.o).goalId = null;
    const r = validateWorld(world);
    assert(r.ok, explain(r));
  });

  test("optional collections may be absent; unknown extra keys are not judged", () => {
    const world = clone(createStore(seed()).get());
    delete world.preferences; delete world.activity;
    world.somethingNew = [1, 2, 3];
    assert(validateWorld(world).ok, explain(validateWorld(world)));
  });
});

/* ============================================================== K */
describe("K. validateWorld rejects malformed worlds, naming what to fix", () => {
  const base = () => clone(every().store.get());
  const ids = () => every().ids;
  const expectError = (world, code, pathPart, mentions = []) => {
    const r = validateWorld(world);
    assert(!r.ok, "expected the world to be rejected");
    const hit = r.errors.find((e) => e.code === code && e.path.includes(pathPart));
    assert(hit, `expected ${code} at ${pathPart}; got ${explain(r)}`);
    mentions.forEach((m) => assert(hit.message.includes(m), `message names ${m}: ${hit.message}`));
    ["code", "path", "message"].forEach((k) => assert(typeof hit[k] === "string", k + " is a string"));
    return r;
  };
  const oppIndex = (w, id) => w.opportunities.findIndex((o) => o.id === id);

  test("not a world", () => {
    for (const bad of [null, undefined, 7, "world", []]) {
      const r = validateWorld(bad);
      assert(!r.ok && r.errors[0].code === "world.not-object", JSON.stringify(bad));
    }
  });

  test("a missing or mistyped collection, and a non-object record", () => {
    const w = base(); delete w.opportunities;
    expectError(w, "collection.missing", "opportunities");
    const w2 = base(); w2.binder = {};
    expectError(w2, "collection.not-array", "binder");
    const w3 = base(); w3.activity = "none";
    expectError(w3, "collection.not-array", "activity");
    const w4 = base(); w4.goals.push("g9");
    expectError(w4, "record.not-object", "goals[");
    eq(REQUIRED_COLLECTIONS.length, 13, "thirteen required collections");
  });

  test("identity: missing and duplicate ids", () => {
    const w = base(); w.inventory.push({ ...w.inventory[0] });
    expectError(w, "id.duplicate", "inventory[", [w.inventory[0].invId]);
    const w2 = base(); delete w2.collectors[0].id;
    expectError(w2, "id.missing", "collectors[0].id");
    const w3 = base(); w3.opportunities[oppIndex(w3, ids().o)].trade.cards.push({ ...w3.opportunities[oppIndex(w3, ids().o)].trade.cards[0] });
    expectError(w3, "id.duplicate", ".trade.cards[");
  });

  test("dangling references", () => {
    const w = base(); const i = oppIndex(w, ids().o);
    w.opportunities[i].partnerId = "p404";
    expectError(w, "ref.unknown", `opportunities[${i}].partnerId`, [ids().o, "p404"]);
    const w2 = base(); const i2 = oppIndex(w2, ids().o);
    w2.opportunities[i2].invId = "inv404";
    expectError(w2, "ref.unknown", `opportunities[${i2}].invId`, ["inv404"]);
    const w3 = base(); w3.goals[0].cardId = "k404";
    expectError(w3, "ref.unknown", "goals[0].cardId", ["k404"]);
    const w4 = base(); const i4 = oppIndex(w4, ids().o);
    w4.opportunities[i4].trade.cards[0].binderId = "b404";
    expectError(w4, "ref.unknown", `opportunities[${i4}].trade.cards[0].binderId`, ["b404"]);
    const w5 = base(); w5.interests.push({ partnerId: "p1", binderId: "b404", at: "t" });
    expectError(w5, "ref.unknown", "interests[", ["b404"]);
  });

  test("an active negotiation whose Goal is gone or unnamed", () => {
    const w = base(); const i = oppIndex(w, ids().w);
    w.goals = w.goals.filter((g) => g.id !== "g1");
    expectError(w, "ref.unknown", `opportunities[${i}].goalId`, [ids().w, "g1"]);
    const w2 = base(); const i2 = oppIndex(w2, ids().w);
    w2.opportunities[i2].goalId = null;
    expectError(w2, "ref.missing", `opportunities[${i2}].goalId`);
  });

  test("ownership: a copy, Goal or binder copy that belongs to someone else", () => {
    const w = base(); const i = oppIndex(w, ids().o);
    w.inventory.find((c) => c.invId === "i1").partnerId = "p2";
    expectError(w, "ref.owner-mismatch", `opportunities[${i}].invId`, ["p1", "p2"]);
    const w2 = base(); const i2 = oppIndex(w2, ids().o);
    w2.goals.find((g) => g.id === "g1").collectorId = "c2";
    expectError(w2, "ref.owner-mismatch", `opportunities[${i2}].goalId`, ["c1", "c2"]);
    const w3 = base(); const i3 = oppIndex(w3, ids().o);
    w3.binder.find((b) => b.id === "b1").collectorId = "c2";
    expectError(w3, "ref.owner-mismatch", `opportunities[${i3}].trade.cards[0].binderId`, ["b1"]);
    const w4 = base(); w4.photoRequests[0].partnerId = "p2";
    expectError(w4, "ref.owner-mismatch", "photoRequests[0].partnerId");
  });

  test("a bound copy that is a different card identity", () => {
    const w = base(); const i = oppIndex(w, ids().o);
    w.inventory.find((c) => c.invId === "i1").cardId = "k2";
    expectError(w, "ref.identity-mismatch", `opportunities[${i}].invId`, ["i1"]);
  });

  test("cross-record invariants the commands maintain", () => {
    const w = base();
    const live = w.opportunities.find((o) => o.id === ids().w);
    w.opportunities.push({ ...clone(live), id: "o-dup" });
    expectError(w, "invariant.one-negotiation-per-goal", "opportunities", ["g1", ids().w, "o-dup"]);
    const w2 = base();
    const agreed = w2.opportunities.find((o) => o.id === ids().w);
    w2.opportunities.push({ ...clone(agreed), id: "o-twin", goalId: "g2", collectorId: "c2", trade: { submitted: false, cards: [] } });
    expectError(w2, "invariant.copy-committed-once", "opportunities", ["i2"]);
    const w3 = base();
    const sold = w3.opportunities.find((o) => o.id === ids().o);
    w3.opportunities.push({ ...clone(sold), id: "o-resold", trade: { submitted: false, cards: [] } });
    expectError(w3, "invariant.copy-sold-once", "opportunities", ["i1"]);
    const w4 = base(); w4.relationships.push({ partnerId: "p1", collectorId: "c1" });
    expectError(w4, "invariant.one-relationship-per-pair", "relationships[");
  });

  test("conversations that would break a command: no partner, a wrong key, a foreign deal", () => {
    const w = base(); delete w.conversations[0].partnerId;
    expectError(w, "ref.missing", "conversations[0].partnerId");
    const w2 = base(); w2.conversations[0].key = "c1::p2::whatever";
    expectError(w2, "field.invalid", "conversations[0].key");
    const w3 = base(); w3.conversations[0].oppId = ids().k;
    expectError(w3, "ref.owner-mismatch", "conversations[0].oppId", [ids().k]);
    const w4 = base(); delete w4.conversations[0].entries[0].at;
    expectError(w4, "field.invalid", "conversations[0].entries[0].at");
  });

  test("shapes: stage, tier, money, reading positions", () => {
    const w = base(); w.opportunities[0].stage = "haggling";
    expectError(w, "field.invalid", "opportunities[0].stage", ["haggling"]);
    const w2 = base(); w2.goals[0].tier = "urgent";
    expectError(w2, "field.invalid", "goals[0].tier");
    const w3 = base(); w3.inventory[0].ask = -1;
    expectError(w3, "field.invalid", "inventory[0].ask");
    const w4 = base(); const i4 = oppIndex(w4, ids().o);
    w4.opportunities[i4].viewedAt = { collector: { timeline: "t" }, observer: {} };
    expectError(w4, "field.invalid", `opportunities[${i4}].viewedAt.observer`);
  });

  test("every problem is reported, not just the first", () => {
    const w = base();
    w.goals[0].cardId = "k404";
    w.inventory[0].partnerId = "p404";
    w.conversations[0].key = "wrong";
    const r = validateWorld(w);
    const codes = new Set(r.errors.map((e) => e.path));
    assert(codes.has("goals[0].cardId") && codes.has("inventory[0].partnerId") && codes.has("conversations[0].key"),
      "all three reported: " + explain(r));
  });
});

/* ============================================================== L */
describe("L. validateWorld is pure", () => {
  /* A deep read-only view that throws on any write, so a mutation cannot be
     silently ignored the way a frozen object ignores it in sloppy mode. */
  const readOnly = (v) => (v && typeof v === "object" ? new Proxy(v, {
    get: (t, k) => readOnly(t[k]),
    set: () => { throw new Error("validateWorld wrote to its input"); },
    defineProperty: () => { throw new Error("validateWorld defined a property on its input"); },
    deleteProperty: () => { throw new Error("validateWorld deleted from its input"); },
  }) : v);

  test("it never writes to the world, valid or not", () => {
    const valid = clone(every().store.get());
    const broken = clone(valid); broken.goals[0].cardId = "k404"; delete broken.catalog;
    for (const world of [valid, broken]) {
      const text = JSON.stringify(world);
      validateWorld(readOnly(world));
      eq(JSON.stringify(world), text, "bytes unchanged");
    }
  });

  test("the same world gives the same diagnostics", () => {
    const broken = clone(every().store.get()); broken.inventory[0].partnerId = "p404"; broken.opportunities[0].stage = "x";
    eq(JSON.stringify(validateWorld(broken)), JSON.stringify(validateWorld(broken)), "deterministic");
  });

  test("it reads no clock and no randomness", () => {
    const originalRandom = Math.random, originalNow = Date.now;
    Math.random = () => { throw new Error("Math.random"); };
    Date.now = () => { throw new Error("Date.now"); };
    try { assert(validateWorld(clone(every().store.get())).ok, "validated"); }
    finally { Math.random = originalRandom; Date.now = originalNow; }
  });
});

run();
