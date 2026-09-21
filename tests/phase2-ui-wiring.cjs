/* ============================================================================
   PHASE 2 · BATCH 2 — THE PERSONA ROOTS CONSUME PROJECTIONS

   Batch 1 built projectForActor(state, actor). This suite proves the ACTUAL UI
   entry paths use it: the Trusted Partner workspace (src/MetYet.jsx) and the
   Collector app (collector/MetYetCollector.jsx) each project the one canonical
   state for their actor at the root, and nothing below the root can observe
   what the projection withholds — not in rendered text, not in the props and
   context handed to screens.

   The world is the product seed plus deliberately UNRELATED parties and
   private markers, so a leak shows up as a specific string:

     pZ  "Zenith Unrelated Cards"  related only to cZ; stock on Casey's goal card
     cZ  "Zora Unrelated"          related only to pZ; a deal, a thread, a binder
     p2  Complete Collectibles     related to Casey (c12): its own note, activity,
                                   thread and review time on Casey
     p-self (Northline)            its own note/activity on Casey; a pending invitee

     A  Roots receive projected state                        (1, 2, 8)
     B  The Trusted Partner UI                               (3, 4, 7, 9, 11, 13)
     C  The Collector UI                                     (5, 6, 14, 15)
     D  Relationship metadata and activity ownership         (10, 12)
     E  Pending invitees (C1)                                (16, 17, 18)
     F  Ended / declined relationships                       (19)
     G  One mutation, both perspectives
     H  DEV/DEMO canonical helpers in the hosted pilot       (20)
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const fs = require("fs");
const path = require("path");
const M = require("../dist/MetYet.cjs");
const Collector = require("../dist/Collector.cjs").default;
const { createStore } = require("../domain/metyet-store.js");
const { projectForActor } = require("../domain/metyet-projection.js");
const { isRelated } = require("../domain/metyet-commands.js");

const TP = M.default;
const AT = "2026-08-12";
const ROOT = path.join(__dirname, "..");

/* ---------------------------------------------------------------- world */
const MARK = {
  zenith: "Zenith Unrelated Cards", zenithCity: "Zenith City", zenithAbout: "ZENITH-ABOUT",
  zora: "Zora Unrelated", zoraCity: "Zoraville", zoraPref: "zora-pref-marker",
  zenithRelNote: "ZENITH-REL-NOTE-ON-ZORA", zenithThread: "ZENITH-THREAD-MARKER",
  zenithActivity: "ZENITH-ACTIVITY-MARKER", zenithInvitee: "Zenith Invitee",
  zenithInviteEmail: "zenith-invitee@example.test", zenithInviteNote: "ZENITH-INVITE-NOTE",
  p2Note: "COMPLETE-NOTE-ON-CASEY", p2Activity: "COMPLETE-ACTIVITY-ON-CASEY",
  p2Thread: "COMPLETE-THREAD-ON-CASEY", selfActivity: "NORTHLINE-ACTIVITY-ON-CASEY",
  wendy: "Wendy Pending", wendyEmail: "wendy-pending@example.test", wendyCity: "Wendytown",
  wendyPref: "wendy-pref-marker", wendyNote: "WENDY-INVITE-NOTE",
};
const NUM = { selfCost: 98989, zenithCost: 71717, zoraMarket: 65656, caseyMarket: 54545 };
const money = (n) => n.toLocaleString("en-US");
/* Northline's own note on Casey, migrated from the seed's collector row. */
const SELF_NOTE_ON_CASEY = "New-ish. Gold Star curiosity is turning into real intent.";

function markedWorld() {
  const seed = M.buildCanonicalSeed();
  const world = { ...seed,
    partners: [...seed.partners, { id: "pZ", name: MARK.zenith, city: MARK.zenithCity, tradeRate: 0.6123,
      since: "2011-11-11", note: "ZENITH-PARTNER-NOTE", about: MARK.zenithAbout, email: "shop@zenith.example.test" }],
    collectors: [...seed.collectors, { id: "cZ", name: MARK.zora, short: "Zora U.", city: MARK.zoraCity, prefs: [MARK.zoraPref] }],
    relationships: [
      ...seed.relationships.map((r) => (r.partnerId === "p2" && r.collectorId === "c12"
        ? { ...r, note: MARK.p2Note, binderReviewedAt: "2026-08-09T10:00:00.000Z" } : r)),
      { partnerId: "pZ", collectorId: "cZ", status: "accepted", at: "2020-02-20", note: MARK.zenithRelNote },
    ],
    goals: [...seed.goals, { id: "gZ", collectorId: "cZ", cardId: "i17", tier: "primary", since: AT, createdAt: AT }],
    inventory: [
      ...seed.inventory.map((i) => (i.invId === "inv17" ? { ...i, cost: NUM.selfCost } : i)),
      { invId: "iZ1", partnerId: "pZ", cardId: "i17", ask: 7777, cost: NUM.zenithCost, acquired: "2011-11-12",
        archived: false, addedAt: AT, cert: "PSA-ZENITH", photos: { front: "copy:iZ1:front", back: "copy:iZ1:back" } },
    ],
    collectorCopies: [
      ...seed.collectorCopies.map((b) => (b.id === "cc27" ? { offered: true, ...b, market: NUM.caseyMarket } : b)),
      { offered: true, id: "bZ", collectorId: "cZ", cardId: "x1", market: NUM.zoraMarket, addedAt: AT, cert: "PSA-bZ",
        photos: { front: "binder:bZ:front", back: "binder:bZ:back" } },
    ],
    interests: [...seed.interests, { partnerId: "pZ", binderId: "bZ", at: AT }],
  };
  const store = createStore(world);
  const x = (actor, cmd, payload) => {
    const r = store.execute(actor, cmd, { at: AT, ...payload });
    if (!r.ok) throw new Error(`world step ${cmd} refused: ${r.refused}`);
    return r.value;
  };
  const oZ = x({ collectorId: "cZ" }, "startOpportunity", { goalId: "gZ", invId: "iZ1", amount: 7000 });
  x({ partnerId: "pZ" }, "sendMessage", { collectorId: "cZ", cardId: "i17", text: MARK.zenithThread });
  x({ partnerId: "pZ" }, "recordNote", { collectorId: "cZ", activity: { type: "manual", text: MARK.zenithActivity } });
  x({ partnerId: "p2" }, "recordNote", { collectorId: "c12", activity: { type: "manual", text: MARK.p2Activity } });
  x({ partnerId: "p2" }, "sendMessage", { collectorId: "c12", cardId: "i17", text: MARK.p2Thread });
  x({ partnerId: "p-self" }, "recordNote", { collectorId: "c12", activity: { type: "manual", text: MARK.selfActivity, date: AT } });
  /* PHASE 5 BATCH 2: an invitation names nobody. The recipient is a label the
     partner typed, and the note is theirs alone. */
  const zInvitee = x({ partnerId: "pZ" }, "inviteCollector",
    { recipient: MARK.zenithInvitee, note: MARK.zenithInviteNote });
  const wendy = x({ partnerId: "p-self" }, "inviteCollector",
    { recipient: MARK.wendy, note: MARK.wendyNote });
  return { store, ids: { oZ, zInvitee, wendy } };
}

/* ---------------------------------------------------------------- render */
const txt = (n) => {
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ");
};
const mount = (el) => { let r; TR.act(() => { r = TR.create(el); }); return r; };
const renderTP = (store, partnerId = "p-self") => mount(React.createElement(TP, { store, partnerId }));
const renderCollector = (store, collectorId = "c12") => mount(React.createElement(Collector, { store, collectorId }));
const act = (fn) => { let out; TR.act(() => { out = fn(); }); return out; };
const ctxOf = (r) => r.root.findAll((n) => n.props && n.props.ctx && typeof n.props.ctx.setNav === "function")[0].props.ctx;
const stOf = (r) => r.root.findAll((n) => n.props && n.props.st && typeof n.props.st.myGoals === "function")[0].props.st;
const goOf = (r) => r.root.findAll((n) => n.props && typeof n.props.go === "function")[0].props.go;
const json = (x) => JSON.stringify(x);

/* Every route a partner can reach through its own navigation, rendered in turn. */
function tpScreens(r) {
  const out = [];
  const visit = (label, nav) => { act(() => ctxOf(r).setNav(nav)); out.push({ label, text: txt(r.root), r }); };
  const ctx = ctxOf(r);
  visit("network", { section: "collectors" });
  visit("network binder", { section: "collectors", tab: "binder" });
  visit("inventory current", { section: "inventory", tab: "mine" });
  visit("inventory coverage", { section: "inventory", tab: "coverage" });
  visit("inventory curate", { section: "inventory", tab: "cultivate" });
  visit("opportunities", { section: "opportunities" });
  for (const c of ctx.collectors) {
    visit("profile " + c.id, { section: "collectors", collectorId: c.id });
    const hist = r.root.findAllByType("button").filter((b) => txt(b).includes("History"));
    if (hist.length) { act(() => hist[0].props.onClick({ stopPropagation() {}, preventDefault() {} })); out.push({ label: "history " + c.id, text: txt(r.root) }); }
  }
  return out;
}
/* Every route a collector can reach — including ids that are NOT theirs, as a
   forged link would try. */
function collectorScreens(r, store) {
  const out = [];
  const visit = (label, nav) => {
    try { act(() => goOf(r)(nav)); out.push({ label, text: txt(r.root) }); }
    catch (e) { out.push({ label, text: "", error: e.message }); act(() => goOf(r)({ v: "goals" })); }
  };
  const st = stOf(r);
  visit("goals", { v: "goals" });
  visit("binder", { v: "binder" });
  visit("partners", { v: "partners" });
  for (const p of store.get().partners) visit("partner " + p.id, { v: "partner", partnerId: p.id });
  for (const g of st.goals) visit("start " + g.id, { v: "start", goalId: g.id });
  for (const o of st.opps) visit("deal " + o.id, { v: "deal", oppId: o.id });
  return out;
}
const leakIn = (screens, needle) => screens.filter((s) => s.text.includes(needle)).map((s) => s.label);

/* Props and context handed to every rendered node below the persona root. */
function propsBelowRoot(r, rootType) {
  const seen = new Set(), objs = new Set(), keys = new Set();
  const walk = (v) => {
    if (!v || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    if (v.$$typeof) { walk(v.props); return; }                 // a React element: its props only
    objs.add(v);
    for (const k of Object.keys(v)) {
      if (k.startsWith("_")) continue;
      keys.add(k);
      if (typeof v[k] !== "function") walk(v[k]);
    }
  };
  r.root.findAll(() => true).forEach((n) => { if (n.type !== rootType) walk(n.props); });
  return { objs, keys };
}
function objectsDeep(v, out = new Set()) {
  if (v && typeof v === "object" && !out.has(v)) { out.add(v); Object.values(v).forEach((x) => objectsDeep(x, out)); }
  return out;
}

/* One world and its renders, shared by the read-only tests. */
const W = markedWorld();
const TPR = renderTP(W.store);
const TP_SCREENS = tpScreens(TPR);
const COLR = renderCollector(W.store);
const COL_SCREENS = collectorScreens(COLR, W.store);

/* ================================================== A  ROOTS RECEIVE PROJECTIONS */
describe("A · The persona roots hand screens a projection, never the canonical world", () => {
  test("1  TP root: every collection in context is this partner's projection", () => {
    const r = renderTP(W.store);
    const ctx = ctxOf(r);
    const proj = projectForActor(W.store.get(), { partnerId: "p-self" });
    const pairs = { collectors: "collectors", opps: "opportunities", inventory: "inventory", goals: "goals",
      collectorCards: "collectorCopies", interests: "interests", activity: "activity", threads: "conversations",
      cardDb: "catalog", invitations: "invitations", counterparties: "counterparties" };
    for (const [local, key] of Object.entries(pairs)) eq(json(ctx[local]), json(proj[key]), `ctx.${local} is projection.${key}`);
    /* Non-vacuous: the canonical world really holds more. */
    assert(W.store.get().collectors.length > ctx.collectors.length, "canonical has collectors outside the network");
    assert(W.store.get().opportunities.length > ctx.opps.length, "canonical has other partners' deals");
    const canonical = objectsDeep(W.store.get());
    const { objs } = propsBelowRoot(r, TP);
    for (const o of objs) assert(!canonical.has(o), "a canonical object is reachable from TP props/context");
    assert(!r.root.findAll((n) => n.type !== TP && n.props && n.props.store).length, "no screen receives the store");
  });

  test("2  Collector root: selectors and screens read the collector's projection", () => {
    const r = renderCollector(W.store);
    const st = stOf(r);
    const proj = projectForActor(W.store.get(), { collectorId: "c12" });
    eq(json(st.partners), json(proj.partners), "Trusted Partners");
    eq(json(st.opps), json(proj.opportunities.filter((o) => o.collectorId === "c12")), "own deals");
    eq(json(st.goals), json(proj.goals), "own goals");
    eq(st.inventoryCopy("iZ1"), null, "an unrelated partner's canonical copy is not reachable");
    assert(W.store.get().inventory.some((i) => i.invId === "iZ1"), "…though it exists canonically");
    assert(!("cost" in st.inventoryCopy("inv17")), "a visible copy arrives without its cost");
    assert(st.catalog !== W.store.get().catalog, "the catalog is the projection's copy");
    const canonical = objectsDeep(W.store.get());
    const { objs } = propsBelowRoot(r, Collector);
    for (const o of objs) assert(!canonical.has(o), "a canonical object is reachable from Collector props");
    assert(!r.root.findAll((n) => n.type !== Collector && n.props && n.props.store).length, "no screen receives the store");
  });

  test("8  TP direct reads no longer bypass the projection", () => {
    const src = fs.readFileSync(path.join(ROOT, "src", "MetYet.jsx"), "utf8");
    const body = src.slice(src.indexOf("export default function MetYet("));
    const gets = body.match(/store\.get\(\)/g) || [];
    eq(gets.length, 1, "exactly one call-time read of the store");
    assert(/const readView = \(\) => projectForActor\(store\.get\(\), tpActor\);/.test(body), "…and it is projected");
    assert(!/useSyncExternalStore\(store\.sub, store\.get, store\.get\);\s*\n\s*const cardDb = /.test(body), "no unprojected subscription feeds the screens");
    /* Behaviour: a handler that reads state after its command (act → before/after)
       still produces its note, reading the projection. */
    const w = markedWorld();
    const r = renderTP(w.store);
    const last = (o) => o.priceThread[o.priceThread.length - 1];
    const opp = ctxOf(r).opps.find((o) => o.stage === "agree-price" && o.priceThread && o.priceThread.length
      && last(o).by === "collector");
    assert(opp, "a Northline deal awaiting the partner's price answer");
    const before = w.store.get().activity.length;
    const counter = last(opp).amount + 50;
    act(() => ctxOf(r).priceRespond(opp.id, "tp", "counter", counter));
    const now = w.store.get().opportunities.find((o) => o.id === opp.id);
    eq(last(now).amount, counter, "the canonical command ran");
    const added = w.store.get().activity.slice(0, w.store.get().activity.length - before);
    assert(added.length === 1 && added[0].partnerId === "p-self" && /countered/.test(added[0].text),
      "the before/after note was written from projected reads, owned by this partner");
  });
});

/* ======================================================= B  TRUSTED PARTNER UI */
describe("B · Rendered Trusted Partner UI", () => {
  test("3  another partner's opportunity is absent", () => {
    for (const s of [MARK.zenith, MARK.zenithThread, "7,777", W.ids.oZ]) eq(leakIn(TP_SCREENS, s).join(), "", `TP rendered "${s}"`);
    assert(!ctxOf(TPR).opps.some((o) => o.id === W.ids.oZ), "unrelated deal in context");
  });

  test("4  unrelated collectors are absent", () => {
    for (const s of [MARK.zora, MARK.zoraCity, MARK.zoraPref, money(NUM.zoraMarket), MARK.zenithInvitee]) {
      eq(leakIn(TP_SCREENS, s).join(), "", `TP rendered "${s}"`);
    }
    eq(ctxOf(TPR).collectors.length, 13, "the network is Northline's thirteen");
  });

  test("7  the Binder reference value never reaches the TP", () => {
    eq(leakIn(TP_SCREENS, money(NUM.caseyMarket)).join(), "", "Casey's own value rendered to the partner");
    assert(!propsBelowRoot(TPR, TP).keys.has("market"), "a `market` field is present in TP props/context");
  });

  test("9  notes are relationship-scoped: each partner reads its own note on Casey", () => {
    const self = TP_SCREENS.find((s) => s.label === "profile c12");
    assert(self.text.includes(SELF_NOTE_ON_CASEY), "Northline's note renders on its profile of Casey");
    assert(!self.text.includes(MARK.p2Note), "Complete Collectibles' note renders for Northline");
    const r2 = renderTP(W.store, "p2");
    act(() => ctxOf(r2).setNav({ section: "collectors", collectorId: "c12" }));
    const t2 = txt(r2.root);
    assert(t2.includes(MARK.p2Note), "Complete Collectibles reads its own note");
    assert(!t2.includes(SELF_NOTE_ON_CASEY), "…and not Northline's");
  });

  test("11 one partner cannot see another's relationship notes or review time", () => {
    const rels = ctxOf(TPR).relationshipWith("c12");
    eq(rels.partnerId, "p-self");
    for (const s of [MARK.p2Note, MARK.zenithRelNote]) eq(leakIn(TP_SCREENS, s).join(), "", `TP rendered "${s}"`);
    const p2ctx = ctxOf(renderTP(W.store, "p2"));
    const canonRel = (pid) => W.store.get().relationships.find((x) => x.partnerId === pid && x.collectorId === "c12");
    eq(p2ctx.relationshipWith("c12").binderReviewedAt, canonRel("p2").binderReviewedAt, "p2 reads its own review time");
    eq(ctxOf(renderTP(W.store)).relationshipWith("c12").binderReviewedAt, canonRel("p-self").binderReviewedAt, "Northline reads its own");
    assert(canonRel("p2").binderReviewedAt !== canonRel("p-self").binderReviewedAt, "and the two differ");
    const p2rels = p2ctx.collectors.map((c) => p2ctx.relationshipWith(c.id));
    assert(p2rels.length > 0 && p2rels.every((x) => x.partnerId === "p2"), "p2 reads only p2's relationships");
    assert(!json(p2rels).includes(SELF_NOTE_ON_CASEY), "p2's context carries Northline's note");
  });

  test("13 one partner cannot see another's activity", () => {
    for (const s of [MARK.p2Activity, MARK.zenithActivity]) eq(leakIn(TP_SCREENS, s).join(), "", `TP rendered "${s}"`);
    assert(leakIn(TP_SCREENS, MARK.selfActivity).length > 0, "Northline's own activity on Casey is still shown");
    assert(ctxOf(TPR).activity.every((a) => a.partnerId === "p-self"), "context holds only Northline's activity");
  });

  test("no other partner's invitation or invitee email reaches the TP", () => {
    for (const s of [MARK.zenithInviteEmail, MARK.zenithInviteNote, MARK.p2Thread]) eq(leakIn(TP_SCREENS, s).join(), "", `TP rendered "${s}"`);
  });
});

/* ============================================================= C  COLLECTOR UI */
describe("C · Rendered Collector UI", () => {
  test("screens render without error across every route", () => {
    eq(COL_SCREENS.filter((s) => s.error).map((s) => s.label + ": " + s.error).join(" | "), "", "route errors");
    const forged = COL_SCREENS.find((s) => s.label === "partner pZ");
    assert(forged && !forged.text.includes(MARK.zenith), "a forged partner route lands on Trusted Partners, not Zenith's page");
  });

  test("5  an unrelated partner, its profile and its supply are absent", () => {
    for (const s of [MARK.zenith, MARK.zenithCity, MARK.zenithAbout, "7,777"]) eq(leakIn(COL_SCREENS, s).join(), "", `Collector rendered "${s}"`);
    const st = stOf(COLR);
    assert(!st.partners.some((p) => p.id === "pZ"), "Zenith in Trusted Partners");
    assert(!st.partnersWith("i17").some((x) => x.partner.id === "pZ"), "Zenith's copy offered as supply");
    assert(st.partnersWith("i17").length >= 2, "…while Casey's own partners still are");
  });

  test("6  TP acquisition cost and default Trade % never render or reach props", () => {
    for (const s of [money(NUM.selfCost), String(NUM.selfCost), money(NUM.zenithCost)]) eq(leakIn(COL_SCREENS, s).join(), "", `Collector rendered "${s}"`);
    const { keys } = propsBelowRoot(COLR, Collector);
    for (const k of ["cost", "acquired", "tradeRate"]) assert(!keys.has(k), `\`${k}\` present in Collector props`);
    const st = stOf(COLR);
    for (const inv of W.store.get().inventory) {
      const seen = st.inventoryCopy(inv.invId);
      if (seen) assert(!("cost" in seen) && !("acquired" in seen), `${inv.invId} carries cost`);
    }
  });

  test("14 the Collector receives no TP-private activity or notes", () => {
    for (const s of [MARK.selfActivity, MARK.p2Activity, SELF_NOTE_ON_CASEY, MARK.p2Note, MARK.zenithActivity]) {
      eq(leakIn(COL_SCREENS, s).join(), "", `Collector rendered "${s}"`);
    }
    assert(!propsBelowRoot(COLR, Collector).keys.has("binderReviewedAt"), "a partner review time reached Collector props");
  });

  test("the Collector's own Binder value stays available to the Collector", () => {
    eq(stOf(COLR).binderById("cc27").market, NUM.caseyMarket);
  });

  test("15 “known since” is the Relationship's start and a valid date", () => {
    const t = COL_SCREENS.find((s) => s.label === "partners").text;
    assert(!t.includes("Invalid Date"), "no invalid dates");
    const since = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    for (const rel of W.store.get().relationships.filter((x) => x.collectorId === "c12")) {
      assert(t.includes("known since " + since(rel.at)), `known since ${since(rel.at)} for ${rel.partnerId}`);
    }
    const src = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
    assert(!/partner\.since/.test(src), "no read of a partner-profile `since`");
  });
});

/* ============================================= D  RELATIONSHIP METADATA · ACTIVITY */
describe("D · Relationship metadata and activity ownership", () => {
  test("10 markBinderReviewed updates only the acting partner's Relationship", () => {
    const w = markedWorld();
    const before = w.store.get();
    const r = renderTP(w.store);
    act(() => ctxOf(r).setNav({ section: "collectors", collectorId: "c12" }));   // opening the profile is the review
    const after = w.store.get();
    const rel = (s, pid) => s.relationships.find((x) => x.partnerId === pid && x.collectorId === "c12");
    assert(rel(after, "p-self").binderReviewedAt !== rel(before, "p-self").binderReviewedAt, "Northline's review time moved");
    for (const pid of ["p2", "p3", "p4"]) eq(json(rel(after, pid)), json(rel(before, pid)), `${pid}'s relationship untouched`);
    eq(json(after.collectors.find((c) => c.id === "c12")), json(before.collectors.find((c) => c.id === "c12")), "the shared Collector record untouched");
    assert(!("binderReviewedAt" in after.collectors.find((c) => c.id === "c12")), "and it carries no review time");
    /* Command level, as another partner. */
    const r2 = w.store.execute({ partnerId: "p2" }, "markBinderReviewed", { collectorId: "c12", at: "2026-09-01T00:00:00.000Z" });
    assert(r2.ok);
    eq(rel(w.store.get(), "p2").binderReviewedAt, "2026-09-01T00:00:00.000Z");
    eq(rel(w.store.get(), "p-self").binderReviewedAt, rel(after, "p-self").binderReviewedAt, "Northline's unchanged by p2's review");
  });

  test("seed migration: Northline's metadata lives on its Relationships; no other pair's is invented", () => {
    const seed = M.buildCanonicalSeed();
    for (const c of seed.collectors) {
      for (const f of ["note", "since", "last", "binderReviewedAt"]) assert(!(f in c), `${c.id}.${f} still on the shared record`);
    }
    const selfRows = seed.relationships.filter((r) => r.partnerId === "p-self");
    eq(selfRows.length, 13);
    assert(selfRows.every((r) => r.at && r.binderReviewedAt), "every Northline row has its start and review time");
    const others = seed.relationships.filter((r) => r.partnerId !== "p-self");
    assert(others.every((r) => !("note" in r) && !("binderReviewedAt" in r) && !("last" in r)), "no metadata invented for other pairs");
    assert(seed.activity.every((a) => a.partnerId === "p-self"), "seeded activity is Northline's");
  });

  test("12 activity recorded by a TP is stamped with that TP's partnerId", () => {
    const w = markedWorld();
    const r = renderTP(w.store);
    /* PHASE 5 BATCH 2: inviting somebody no longer writes an activity row —
       there is no collector for one to be about until they accept. The rule
       under test is unchanged, so it is proved by the act that does write one. */
    act(() => ctxOf(r).logActivity("c12", "manual", "stamp@example.test"));
    const row = w.store.get().activity.find((a) => /stamp@example\.test/.test(a.text));
    assert(row, "the note was logged");
    eq(row.partnerId, "p-self");
    const zRow = w.store.get().activity.find((a) => a.text === MARK.zenithActivity);
    eq(zRow.partnerId, "pZ", "a command-recorded row carries its partner");
    const legacy = createStore({ ...M.buildCanonicalSeed(), activity: [{ id: "ownerless", collectorId: "c12", type: "manual", text: "OWNERLESS-ROW", date: AT }] });
    eq(projectForActor(legacy.get(), { partnerId: "p-self" }).activity.length, 0, "an ownerless row is still projected to nobody");
  });
});

/* ====================================================== E  PENDING INVITEES (C1) */
describe("E · Pending invitees", () => {
  const network = () => TP_SCREENS.find((s) => s.label === "network");
  const pendingRow = (r) => r.root.findAll((n) => n.type === "tr" && n.props["data-invitation"]);

  test("16 the owning TP sees a minimal invitation-management row", () => {
    const r = renderTP(W.store);
    act(() => ctxOf(r).setNav({ section: "collectors" }));
    const rows = pendingRow(r);
    eq(rows.length, 1, "one pending invitation");
    const t = txt(rows[0]);
    for (const s of [MARK.wendy, "Invite pending", "sent"]) assert(t.includes(s), `row shows "${s}"`);
    eq(rows[0].findAllByType("td").length, 2, "identity cell and one note cell — no network columns");
    eq(rows[0].findAllByType("button").length, 0, "no profile link or other network action");
    assert(network().text.includes("1 invite pending"), "counted as an invitation, not a collector");
  });

  test("17 an outstanding invitation is a note to yourself, and reaches nobody else", () => {
    /* PHASE 5 BATCH 2: there is no invitee to expose anything about, because
       inviting creates no Collector. What a partner typed is theirs. */
    for (const s of [MARK.wendyCity, MARK.wendyPref]) eq(leakIn(TP_SCREENS, s).join(), "", `TP rendered "${s}"`);
    const ctx = ctxOf(TPR);
    const invId = W.ids.wendy;
    const inv = ctx.invitations.find((i) => i.id === invId);
    assert(inv, "the partner lost its own invitation");
    eq(inv.collectorId, null, "the invitation named somebody");
    eq(inv.recipient, MARK.wendy, "the recipient label the partner typed");
    eq(inv.note, MARK.wendyNote, "the partner's own invite note is kept on its Invitation");
    /* Nobody was created, so nothing can be joined to one. */
    assert(!ctx.collectors.some((c) => c.name === MARK.wendy), "inviting created a Collector");
    assert(!ctx.counterparties.some((c) => c.name === MARK.wendy), "inviting created a counterparty");
  });

  test("18 an invitation stays outside Relationship / network domain logic", () => {
    const s = W.store.get();
    eq(s.invitations.filter((i) => i.partnerId === "p-self" && !i.acceptedAt).length, 1, "one outstanding");
    eq(ctxOf(TPR).collectors.length, 13, "network size unchanged by the invitation");
    /* Nothing an invitation does makes anybody related. */
    for (const i of s.invitations) {
      if (!i.collectorId) continue;
      assert(!isRelated(s, i.partnerId, i.collectorId), "an invitation created a Relationship");
    }
    eq(s.relationships.filter((r) => r.collectorId === null).length, 0, "a relationship with nobody");
  });
});

/* ================================================ F  ENDED / DECLINED RELATIONSHIPS */
describe("F · Ended and declined relationships", () => {
  test("19 an ended relationship leaves the network but keeps shared deals renderable", () => {
    const seed = M.buildCanonicalSeed();
    const status = (pid, cid, st) => (r) => (r.partnerId === pid && r.collectorId === cid ? { ...r, status: st } : r);
    const store = createStore({ ...seed, relationships: seed.relationships
      .map(status("p-self", "c2", "ended")).map(status("p-self", "c3", "declined")).map(status("p-self", "c12", "ended")) });
    const r = renderTP(store);
    const ctx = ctxOf(r);
    for (const cid of ["c2", "c3"]) assert(!ctx.collectors.some((c) => c.id === cid), `${cid} left the network`);
    eq(ctx.collectors.length, 10, "ten collectors remain");
    act(() => ctxOf(r).setNav({ section: "opportunities" }));
    assert(txt(r.root).includes("Deal Flow"), "Opportunities still renders");
    assert(ctxOf(r).opps.filter((o) => o.collectorId === "c2").length === 3, "James's deals with Northline are still Northline's history");
    eq(ctxOf(r).collector("c2").short, "James R.", "and name him, by bare identity");
    for (const o of ctxOf(r).opps.filter((x) => x.collectorId === "c2")) {
      act(() => ctxOf(r).setDrawer({ type: "workspace", oppId: o.id }));      // the Opportunities "Open deal" route
      assert(txt(r.root).includes("James"), `his ${o.stage} deal workspace renders, named`);
      act(() => ctxOf(r).setDrawer(null));
    }
    act(() => ctxOf(r).setNav({ section: "collectors", collectorId: "c2" }));
    assert(/James Rivera is\s+not in your Collector Network/.test(txt(r.root)), "no profile after the relationship ended");
    /* Collector side: Casey's ended relationship with Northline. */
    const cr = renderCollector(store, "c12");
    const st = stOf(cr);
    assert(!st.partners.some((p) => p.id === "p-self"), "Northline left Casey's Trusted Partners");
    eq(json(st.partnerById("p-self")), json({ id: "p-self", name: "Northline Cards" }), "named by identity for the shared deals");
    assert(!st.partnersWith("i17").some((x) => x.partner.id === "p-self"), "no longer supply");
    const screens = collectorScreens(cr, store);
    eq(screens.filter((s) => s.error).map((s) => s.label + ": " + s.error).join(" | "), "", "every Collector route still renders");
    assert(screens.some((s) => s.label.startsWith("deal ") && s.text.includes("Northline")), "a deal with Northline still renders, named");
  });
});

/* =========================================== G  ONE MUTATION, BOTH PERSPECTIVES */
describe("G · One canonical mutation, both perspectives, no synchronisation", () => {
  test("a UI action hits canonical execution once and both projections re-derive", () => {
    const w = markedWorld();
    const tp = renderTP(w.store), col = renderCollector(w.store);
    let notified = 0; w.store.sub(() => { notified += 1; });
    const beforeCount = w.store.get().conversations.length;
    act(() => stOf(col).sendMessage("p-self", "i17", "BOTH-SIDES-MARKER"));
    eq(notified, 1, "exactly one canonical state change");
    const canonical = w.store.get().conversations.filter((t) => t.entries.some((e) => e.text === "BOTH-SIDES-MARKER"));
    eq(canonical.length, 1, "one thread holds it canonically");
    assert(w.store.get().conversations.length >= beforeCount);
    assert(json(ctxOf(tp).threads).includes("BOTH-SIDES-MARKER"), "the partner's projection has it");
    assert(json(stOf(col).threadsForCard("i17")).includes("BOTH-SIDES-MARKER"), "the collector's projection has it");
    const p2 = renderTP(w.store, "p2");
    assert(!json(ctxOf(p2).threads).includes("BOTH-SIDES-MARKER"), "a third party's projection does not");
  });
});

/* ================================= H  DEV / DEMO CANONICAL HELPERS IN THE HOSTED PILOT */
describe("H · Canonical helpers in the hosted pilot", () => {
  const esbuild = require("esbuild");
  const build = (dev, demo, out) => {
    esbuild.buildSync({ entryPoints: [path.join(ROOT, "shell", "MetYetPrototype.jsx")],
      outfile: path.join(ROOT, "dist", out), bundle: true, format: "cjs", platform: "node",
      external: ["react", "react-dom"], jsx: "automatic", logLevel: "silent",
      define: { __METYET_DEV__: String(dev), __METYET_DEMO__: String(demo) } });
    const p = path.join(ROOT, "dist", out);
    delete require.cache[require.resolve(p)];
    return require(p).default;
  };
  const enter = (Shell, label) => {
    const r = mount(React.createElement(Shell));
    const b = r.root.findAllByType("button").find((x) => txt(x).includes(label));
    act(() => b.props.onClick({}));
    return r;
  };

  test("20 DEV partner simulation cannot act in the hosted pilot; the DEMO loader returns no state", () => {
    const Hosted = build(false, true, "Batch2Hosted.cjs");
    const r = enter(Hosted, "Continue as Collector");
    const st = stOf(r);
    const o = st.opps.find((x) => x.stage === "agree-price") || st.opps[0];
    const store = r.root.findAll((n) => n.props && n.props.store && n.props.collectorId)[0].props.store;
    const before = json(store.get());
    const out = act(() => st.simulate.agreePrice({ oppId: o.id }));
    assert(out && out.refused, "the partner simulation is refused without DEV");
    act(() => st.simulate.sendMessage({ collectorId: "c12", partnerId: o.partnerId, cardId: o.cardId, text: "SIM" }));
    eq(json(store.get()), before, "canonical state unchanged by DEV helpers");
    /* The DEMO scenario loader is a tester-facing fixture swap (shared/demo-flag.js):
       it may run in the hosted pilot, but hands the screen only an id, never state. */
    const loaded = act(() => st.resetReviewDeal("agree-price"));
    assert(loaded === null || typeof loaded === "string", "the loader returns an id or nothing");
    const Plain = build(false, false, "Batch2Plain.cjs");
    const pr = enter(Plain, "Continue as Collector");
    eq(act(() => stOf(pr).resetReviewDeal("agree-price")), null, "and does nothing at all when DEMO is off");
  });
});

run();
