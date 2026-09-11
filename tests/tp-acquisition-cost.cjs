/* ============================================================================
   TP ACQUISITION COST — PERSISTENT PRIVATE CONTEXT, STAGE-DEPENDENT PROMINENCE

   Product rule: Acquisition Cost follows the partner's specific physical
   inventory copy through the whole deal lifecycle and is always private to
   the partner. Once price is agreed, Agreed Price replaces Listed Price as the
   primary shared reference.

   Contract under test (semantics, not pixels):
     - the cost shown is the BOUND copy's own `cost`, read from the partner's
       inventory record — never copied onto the opportunity, never inferred;
     - it is present at every stage once bound, with prominence
         agree-price high · select-trade low · value-trade high ·
         deal medium · fulfillment low · completed high;
     - before agreement: cost → listed price → the offer on the table;
       after agreement: cost → agreed price, listing secondary;
     - the completed record keeps it, marked private, outside the shared terms;
     - the Collector never receives or renders it, in the deal or the receipt,
       and no shared thread text carries it.

   The whole lifecycle is driven through canonical commands on one store while
   both apps stay mounted on it.
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const M = require("../dist/MetYet.cjs");
const Collector = require("../dist/Collector.cjs").default;
const { createStore } = require("../domain/metyet-store.js");

const AT = "2026-08-12";
const COST = { c3: 3131.31, c2: 3434.34 };           // two copies of the same card, different costs
const SHOWN = { c3: "$3,131.31", c2: "$3,434.34" };
const RAW = ["3,131", "3131", "3,434", "3434"];     // any rendering of either cost

function world() {
  const seed = M.buildCanonicalSeed();
  const store = createStore({ ...seed,
    inventory: seed.inventory.map((i) => (i.invId === "inv-c3" ? { ...i, cost: COST.c3 }
      : i.invId === "inv-c2" ? { ...i, cost: COST.c2 } : i)) });
  return store;
}
const x = (store, actor, cmd, payload) => {
  let r; TR.act(() => { r = store.execute(actor, cmd, { at: AT, ...payload }); });
  if (!r.ok) throw new Error(`${cmd} refused: ${r.refused}`);
  return r.value;
};
const txt = (n) => {
  const o = []; const w = (y) => { for (const c of y.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ");
};
const mount = (el) => { let r; TR.act(() => { r = TR.create(el); }); return r; };
const ctxOf = (r) => r.root.findAll((n) => n.props && n.props.ctx && typeof n.props.ctx.setDrawer === "function")[0].props.ctx;
const goOf = (r) => r.root.findAll((n) => n.props && typeof n.props.go === "function")[0].props.go;
const openWorkspace = (r, oppId) => TR.act(() => ctxOf(r).setDrawer({ type: "workspace", oppId }));
const byAttr = (root, key) => root.findAll((n) => typeof n.type === "string" && n.props && n.props[key] != null);
const econ = (r) => {
  const box = byAttr(r.root, "data-prominence")[0] || null;
  const rows = byAttr(r.root, "data-econ").map((n) => ({ key: n.props["data-econ"], cls: String(n.props.className || ""), text: txt(n) }));
  const terms = byAttr(r.root, "data-term").map((n) => ({ key: n.props["data-term"], cls: String(n.props.className || "") }));
  return { prominence: box ? box.props["data-prominence"] : null, rows, terms, text: box ? txt(box) : "" };
};
const rowText = (e, key) => (e.rows.find((x2) => x2.key === key) || {}).text || null;
const keysDeep = (v, out = new Set()) => {
  if (Array.isArray(v)) v.forEach((y) => keysDeep(y, out));
  else if (v && typeof v === "object") for (const k of Object.keys(v)) { out.add(k); keysDeep(v[k], out); }
  return out;
};
function propsKeysBelow(r, rootType) {
  const seen = new Set(), keys = new Set();
  const walk = (v) => {
    if (!v || typeof v !== "object" || seen.has(v)) return; seen.add(v);
    if (v.$$typeof) { walk(v.props); return; }
    for (const k of Object.keys(v)) { if (k.startsWith("_")) continue; keys.add(k); if (typeof v[k] !== "function") walk(v[k]); }
  };
  r.root.findAll(() => true).forEach((n) => { if (n.type !== rootType) walk(n.props); });
  return keys;
}

/* ------------------------------------------------ one lifecycle, snapshotted */
const store = world();
const tp = mount(React.createElement(M.default, { store, partnerId: "p-self" }));
const james = mount(React.createElement(Collector, { store, collectorId: "c2" }));
const J = { collectorId: "c2" }, TP = { partnerId: "p-self" };

const oppId = x(store, J, "startOpportunity", { goalId: "g2", invId: "inv-c3", amount: 3500 });
const opp = () => store.get().opportunities.find((o) => o.id === oppId);
const rowId = () => opp().trade.cards[0].id;
const LIFE = {};                                     // stage label -> { tp econ, tp text, collector text, collector keys }
const snap = (label) => {
  openWorkspace(tp, oppId);
  TR.act(() => goOf(james)({ v: "deal", oppId }));
  LIFE[label] = { stage: opp().stage, econ: econ(tp), tpText: txt(tp.root), colText: txt(james.root),
    colKeys: propsKeysBelow(james, Collector), inventoryCost: store.get().inventory.find((i) => i.invId === "inv-c3").cost };
  TR.act(() => ctxOf(tp).setDrawer(null));
};
snap("offer");                                                        // collector's offer on the table
x(store, TP, "proposePrice", { oppId, amount: 3800 });
snap("counter");                                                      // partner's counter on the table
x(store, J, "acceptPrice", { oppId });
x(store, J, "proposeTradeSelection", { oppId, binderIds: ["cc3"] });
snap("select-trade");
x(store, TP, "reviewTradeCard", { oppId, tradeCardId: rowId(), decision: "accepted" });
x(store, J, "proposeMarketValue", { oppId, tradeCardId: rowId(), amount: 500 });
snap("value-trade");
x(store, TP, "acceptMarketValue", { oppId, tradeCardId: rowId() });
x(store, TP, "proposeTradePercent", { oppId, tradeCardId: rowId(), percent: 0.8 });
x(store, J, "acceptTradePercent", { oppId, tradeCardId: rowId() });
snap("deal");
x(store, TP, "acceptDeal", { oppId });
x(store, J, "acceptDeal", { oppId });
snap("fulfillment");
x(store, TP, "proposeFulfillment", { oppId, plan: { method: "meetup", location: "Duluth counter", date: "2026-08-20", time: "12:00" } });
x(store, J, "confirmFulfillmentPlan", { oppId });
x(store, TP, "confirmHandoff", { oppId });
x(store, J, "confirmHandoff", { oppId });
snap("completed");

/* ============================================================== SOURCE OF TRUTH */
describe("The bound physical copy is the source of truth", () => {
  test("the lifecycle really moved through every stage", () => {
    eq(["offer", "counter", "select-trade", "value-trade", "deal", "fulfillment", "completed"].map((k) => LIFE[k].stage).join(","),
      "agree-price,agree-price,select-trade,value-trade,deal,fulfillment,completed");
  });

  test("TP sees the bound copy's own Acquisition Cost", () => {
    const e = LIFE.offer.econ;
    assert(rowText(e, "acquisition-cost").includes(SHOWN.c3), "cost of inv-c3: " + rowText(e, "acquisition-cost"));
    assert(rowText(e, "acquisition-cost").includes("Private to you"), "marked private");
  });

  test("multiple copies of the same card resolve to the selected copy's cost", () => {
    const s2 = world();
    const r = mount(React.createElement(M.default, { store: s2, partnerId: "p-self" }));
    const goal = x(s2, { collectorId: "c4" }, "addGoal", { cardId: "i1", tier: "primary" });
    const onC2 = x(s2, { collectorId: "c4" }, "startOpportunity", { goalId: goal, invId: "inv-c2", amount: 4000 });
    const onC3 = x(s2, J, "startOpportunity", { goalId: "g2", invId: "inv-c3", amount: 3500 });
    openWorkspace(r, onC2);
    const a = econ(r);
    TR.act(() => ctxOf(r).setDrawer(null));
    openWorkspace(r, onC3);
    const b = econ(r);
    assert(rowText(a, "acquisition-cost").includes(SHOWN.c2) && !a.text.includes(SHOWN.c3), "Priya's deal shows inv-c2's cost only");
    assert(rowText(b, "acquisition-cost").includes(SHOWN.c3) && !b.text.includes(SHOWN.c2), "James's deal shows inv-c3's cost only");
    assert(rowText(a, "listed-price").includes("$4,650") && rowText(b, "listed-price").includes("$3,950"), "each against its own listing");
  });

  test("no bound copy, no Acquisition Cost — nothing is inferred", () => {
    const s3 = world();
    const r = mount(React.createElement(M.default, { store: s3, partnerId: "p-self" }));
    const unbound = s3.get().opportunities.find((o) => o.cardId === "i1" && o.partnerId === "p-self" && !o.invId);
    assert(unbound, "a seeded opportunity on the same card without a bound copy");
    openWorkspace(r, unbound.id);
    const e = econ(r);
    eq(e.prominence, null, "no economics block");
    eq(e.rows.filter((row) => row.key.startsWith("acquisition-cost")).length, 0, "no cost row");
    for (const v of ["3,276", "3,131", "3,434", "Acquisition cost"]) assert(!txt(r.root).includes(v), `nothing inferred: "${v}"`);
  });

  test("prominence never duplicates or mutates the canonical cost", () => {
    for (const k of Object.keys(LIFE)) eq(LIFE[k].inventoryCost, COST.c3, `${k}: the copy's cost is unchanged`);
    assert(!keysDeep(opp()).has("cost") && !keysDeep(opp()).has("acquired"), "the opportunity carries no cost field");
    assert(!JSON.stringify(opp()).includes("3131.31"), "and no cost value");
  });
});

/* ======================================================= PRICE PROGRESSION */
describe("Listed Price gives way to Agreed Price", () => {
  test("during price negotiation: cost → listed price → the offer on the table", () => {
    eq(LIFE.offer.econ.rows.map((r) => r.key).join(","), "acquisition-cost,listed-price,current-offer");
    assert(rowText(LIFE.offer.econ, "listed-price").includes("$3,950"), "listed price of the bound copy");
    assert(rowText(LIFE.offer.econ, "current-offer").includes("Current offer") && rowText(LIFE.offer.econ, "current-offer").includes("$3,500"), "the collector's offer");
    assert(rowText(LIFE.counter.econ, "current-offer").includes("Your counter") && rowText(LIFE.counter.econ, "current-offer").includes("$3,800"), "then the partner's counter");
    eq(LIFE.offer.econ.terms.map((t) => t.key).join(","), "listed-price,agreed-price", "terms lead with the listing before agreement");
  });

  test("after agreement: Agreed Price is primary and the listing recedes", () => {
    for (const k of ["select-trade", "value-trade", "deal", "fulfillment", "completed"]) {
      const e = LIFE[k].econ;
      eq(e.rows.filter((r) => !r.key.endsWith("record")).map((r) => r.key).join(","), "acquisition-cost,agreed-price,listed-price", `${k}: order`);
      assert(e.rows.find((r) => r.key === "agreed-price").cls.includes("primary"), `${k}: agreed price is primary`);
      assert(e.rows.find((r) => r.key === "listed-price").cls.includes("secondary"), `${k}: listing is secondary`);
      assert(rowText(e, "agreed-price").includes("$3,800"), `${k}: agreed at the accepted counter`);
      assert(!e.rows.some((r) => r.key === "current-offer"), `${k}: no stale offer row`);
      eq(e.terms.map((t) => t.key).join(","), "agreed-price,listed-price", `${k}: terms lead with the agreed price`);
      assert(e.terms[1].cls.includes("sec"), `${k}: listed price is secondary in the terms`);
    }
  });
});

/* ===================================================== STAGE PROMINENCE */
describe("Acquisition Cost is always there; its weight follows the decision", () => {
  const expect = { offer: "high", counter: "high", "select-trade": "low", "value-trade": "high",
    deal: "medium", fulfillment: "low", completed: "high" };
  for (const [k, level] of Object.entries(expect)) {
    test(`${k}: available, prominence ${level}`, () => {
      const e = LIFE[k].econ;
      eq(e.prominence, level, "prominence");
      assert(rowText(e, "acquisition-cost") && rowText(e, "acquisition-cost").includes(SHOWN.c3), "the cost is present");
      assert(rowText(e, "acquisition-cost").includes("Private to you"), "and marked private");
    });
  }

  test("Fulfillment keeps coordination primary: the cost is present but quiet", () => {
    const f = LIFE.fulfillment;
    eq(f.econ.prominence, "low");
    assert(f.tpText.includes("Coordination — when and where"), "fulfillment coordination is the workspace's focus");
    assert(rowText(f.econ, "acquisition-cost").includes(SHOWN.c3), "while the cost stays in the copy context");
  });

  test("the completed record keeps the cost, private and outside the shared terms", () => {
    const rec = LIFE.completed.econ.rows.find((r) => r.key === "acquisition-cost-record");
    assert(rec, "a private cost line in the completed deal summary");
    assert(rec.text.includes(SHOWN.c3) && rec.text.includes("Private to you") && rec.text.includes("not part of the shared terms"), rec.text);
    assert(LIFE.completed.tpText.includes("Sold · this specific copy"), "the copy reads as sold, still identified");
    eq(LIFE.deal.econ.rows.filter((r) => r.key === "acquisition-cost-record").length, 0, "the record line belongs to the completed deal only");
  });

  test("an archived copy's completed record still works", () => {
    const s4 = createStore(store.get());
    TR.act(() => s4.fixture.set({ ...s4.get(), inventory: s4.get().inventory.map((i) => (i.invId === "inv-c3" ? { ...i, archived: true } : i)) }));
    const r = mount(React.createElement(M.default, { store: s4, partnerId: "p-self" }));
    openWorkspace(r, oppId);
    const e = econ(r);
    assert(rowText(e, "acquisition-cost").includes(SHOWN.c3), "cost still shown for an archived, sold copy");
    assert(rowText(e, "acquisition-cost-record").includes(SHOWN.c3), "and in the record");
  });
});

/* ======================================================== COLLECTOR PRIVACY */
describe("The Collector never sees Acquisition Cost", () => {
  test("not in the Collector's view of the opportunity, at any stage", () => {
    for (const [k, s] of Object.entries(LIFE)) {
      assert(s.colText.includes("Charizard") && s.colText.includes("Northline Cards") && s.colText.includes("Agree on Price"),
        `${k}: the Collector's deal page actually rendered this opportunity`);
      for (const v of [...RAW, "Acquisition cost", "Private to you"]) assert(!s.colText.includes(v), `${k}: Collector rendered "${v}"`);
      for (const key of ["cost", "acquired"]) assert(!s.colKeys.has(key), `${k}: \`${key}\` reached Collector props`);
    }
  });

  test("not in the Collector's completed receipt or history", () => {
    const t = LIFE.completed.colText;
    assert(/\$3,800/.test(t), "the Collector's receipt shows the shared agreed price");
    TR.act(() => goOf(james)({ v: "partner", partnerId: "p-self" }));
    const hist = txt(james.root);
    for (const v of [...RAW, "Acquisition cost"]) assert(!hist.includes(v), `partner history rendered "${v}"`);
  });

  test("no shared thread or message text carries the cost", () => {
    const shared = JSON.stringify(store.get().conversations.filter((c) => c.collectorId === "c2"));
    for (const v of ["3131", "3,131", "Acquisition"]) assert(!shared.includes(v), `shared thread text contains "${v}"`);
  });
});

run();
