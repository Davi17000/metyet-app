/* ============================================================================
   PHASE 1 CLOSEOUT

   A  The Trusted Partner workspace's Collector simulation is engineering
      tooling. Outside DEV it does not render, and the workspace holds no actor
      that could execute a Collector-owned command.
   B  The partner's final-balance control speaks the signed settlement:
      positive = the collector pays the partner, negative = the partner pays the
      collector, zero = no cash changes hands. Direction is derived from the
      sign everywhere; nothing else is stored.
   C  The mirror image of A: the Collector app's partner-response helper acts as
      the Trusted Partner, so it is DEV-only too. Production and the hosted
      pilot (DEMO on, DEV off) cannot make a partner move from the Collector
      side; scenario loading, reset and persona switching still work.
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const D = require("../domain/metyet-domain.js");
const { createStore } = require("../domain/metyet-store.js");
const U = require("./util.cjs");

const ROOT = path.join(__dirname, "..");
const TP_SRC = fs.readFileSync(path.join(ROOT, "src", "MetYet.jsx"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/* ---- the partner workspace, built the way each mode ships ---------------- */
const MODES = {
  product: { dev: false, demo: false },   // prod.build.mjs
  pilot: { dev: false, demo: true },      // site.build.mjs (app.metyet.io)
  dev: { dev: true, demo: true },         // engineering
};
const cache = {};
const tpBuild = (mode) => {
  if (cache[mode]) return cache[mode];
  const out = path.join(ROOT, "dist", `CloseoutTP-${mode}.cjs`);
  esbuild.buildSync({
    entryPoints: [path.join(ROOT, "src", "MetYet.jsx")], outfile: out,
    bundle: true, format: "cjs", platform: "node", external: ["react", "react-dom"],
    jsx: "automatic", logLevel: "silent",
    define: { __METYET_DEV__: String(MODES[mode].dev), __METYET_DEMO__: String(MODES[mode].demo) },
  });
  delete require.cache[require.resolve(out)];
  return (cache[mode] = require(out));
};
const mount = (mode) => {
  let r; TR.act(() => { r = TR.create(React.createElement(tpBuild(mode).default)); });
  return r;
};

/* Every page a partner reaches from a collector: the profile (binder), and each
   goal or opportunity it opens — which covers every stage's workspace and the
   conversation composer inside it. */
const COLLECTORS = ["James Rivera", "Alex Trinh", "Hiro Tanaka", "Nina Alvarez", "Casey Lin",
  "Ellen Fisher", "Priya Raman"];
const SIM_TEXT = /Demo control · simulating/;
const SIM_BUTTON = (label) => /\(demo\)$/.test(label) || /^Add a copy to the trade binder$/.test(label);
const sweep = (mode) => {
  const seen = [];
  for (const who of COLLECTORS) {
    const opens = (() => { const r = mount(mode); U.goProfile(r, who);
      seen.push({ where: who + " profile", text: U.allText(r), buttons: U.buttons(r).map((b) => U.text(b).trim()) });
      return U.btns(r, "Open").filter((b) => U.text(b).trim() === "Open").length; })();
    for (let i = 0; i < opens; i++) {
      const r = mount(mode);
      U.goProfile(r, who);
      U.click(U.btns(r, "Open").filter((b) => U.text(b).trim() === "Open")[i]);
      seen.push({ where: `${who} · open #${i + 1}`, text: U.allText(r),
        buttons: U.buttons(r).map((b) => U.text(b).trim()) });
    }
  }
  return seen;
};

describe("A. TP-side Collector simulation is DEV-only", () => {
  const product = sweep("product");
  const pilot = sweep("pilot");

  test("the sweep covers every deal stage, so absence is meaningful", () => {
    const all = product.map((p) => p.text).join("\n");
    ["Agree on Price", "Select Trade", "Value Trade", "Final negotiation", "Fulfillment"].forEach((s) =>
      assert(all.includes(s), "the product sweep reached " + s));
    assert(product.length >= 15, "pages visited: " + product.length);
  });

  test("product build: no simulation panel or control renders anywhere", () => {
    product.forEach((p) => {
      assert(!SIM_TEXT.test(p.text), "no simulation panel on " + p.where);
      const bad = p.buttons.filter(SIM_BUTTON);
      eq(bad.length, 0, "no act-as-collector control on " + p.where + ": " + bad.join(" | "));
    });
  });

  test("pilot build (DEMO on, DEV off): the same — a partner never acts as the collector", () => {
    pilot.forEach((p) => {
      assert(!SIM_TEXT.test(p.text), "no simulation panel on " + p.where);
      eq(p.buttons.filter(SIM_BUTTON).length, 0, "no act-as-collector control on " + p.where);
    });
  });

  test("the engineering build still has it, so the gate is the only difference", () => {
    const r = mount("dev");
    U.goProfile(r, "James Rivera");
    assert(U.buttons(r).some((b) => U.text(b).trim() === "Add a copy to the trade binder"), "binder simulation");
    U.click(U.btns(r, "Open").filter((b) => U.text(b).trim() === "Open")[0]);
    assert(SIM_TEXT.test(U.allText(r)), "stage simulation panel");
    assert(U.buttons(r).some((b) => SIM_BUTTON(U.text(b).trim())), "and the composer's send-as control");
  });

  test("outside DEV the workspace holds no Collector actor at all", () => {
    eq(tpBuild("product").collectorSimActor("c12"), null, "product: no actor");
    eq(tpBuild("pilot").collectorSimActor("c12"), null, "pilot: no actor");
    eq(JSON.stringify(tpBuild("dev").collectorSimActor("c12")), JSON.stringify({ collectorId: "c12" }),
      "dev: the simulated collector");
  });

  test("so every Collector-owned command it could issue is refused, and nothing changes", () => {
    const M = tpBuild("product");
    const st = createStore(M.buildCanonicalSeed());
    const g = st.get().goals.find((x) => x.collectorId === "c12" && x.tier === "secondary");
    const o = st.get().opportunities.find((x) => x.collectorId === "c12" && x.stage === "select-trade");
    const before = JSON.stringify(st.get());
    const actor = M.collectorSimActor("c12");
    [["updateGoalTier", { goalId: g.id, tier: "primary" }],
      ["chooseCashOnly", { oppId: o.id }],
      ["cancelOpportunity", { oppId: o.id, reason: "x" }],
      ["sendMessage", { partnerId: o.partnerId, cardId: o.cardId, text: "as the collector" }]]
      .forEach(([cmd, payload]) => eq(st.execute(actor, cmd, payload).refused, D.REFUSE.unknownActor, cmd));
    eq(JSON.stringify(st.get()), before, "state is byte-identical");
  });

  test("the workspace has no other way to name a Collector actor", () => {
    const tp = code(TP_SRC);
    assert(/const asCollector = collectorSimActor;/.test(tp), "asCollector IS the gated actor");
    assert(/const seatActor = \(o, by\) => \(by === "tp" \? tpActor : asCollector\(o\.collectorId\)\);/.test(tp),
      "and every seat-routed move uses it");
    assert(!/(run|act|store\.execute)\(\s*\{\s*collectorId/.test(tp), "no literal collector actor is passed anywhere");
    assert(/const COLLECTOR_SIMULATION = SHARED_DEV;/.test(tp), "gated on the canonical DEV flag, not a new one");
    assert(/if \(!COLLECTOR_SIMULATION\) return null;/.test(tp), "the panel renders nothing outside DEV");
  });
});

/* ---- B. signed final balance, in the product workspace -------------------- */
const App = require("../dist/Prototype.cjs").default;
const ninaDeal = () => {
  let r; TR.act(() => { r = TR.create(React.createElement(App)); });
  U.click(U.byClass(r, "myp-card")[0]);                       // Trusted Partner
  const store = r.root.findAll((n) => n.props && n.props.store)[0].props.store;
  U.goProfile(r, "Nina Alvarez");
  const row = U.byClass(r, "cp-opp").find((n) => U.text(n).includes("Deal"));
  U.click(row.findAllByType("button").find((b) => U.text(b).trim() === "Open"));
  const nina = store.get().collectors.find((c) => c.name === "Nina Alvarez").id;
  const id = store.get().opportunities.find((o) => o.collectorId === nina && o.stage === "deal").id;
  const o = () => store.get().opportunities.find((x) => x.id === id);
  const partner = store.get().partners.find((p) => p.id === o().partnerId).name;
  return { r, store, id, o, nina, partner,
    tp: { partnerId: o().partnerId }, collector: { collectorId: nina } };
};
const stage = (w) => U.byClass(w.r, "ws-stagework")[0];
const field = (w) => stage(w).findAllByType("input").find((i) => i.props["aria-label"] === "Final cash balance");
const typeIn = (w, v) => TR.act(() => { field(w).props.onChange({ target: { value: v } }); });
const proposeBtn = (w) => stage(w).findAllByType("button")
  .find((b) => /^(Propose|Counter) balance$/.test(U.text(b).trim()));
const previewText = (w) => U.text(U.byClass(w.r, "tp-cash-preview")[0]);
const propose = (w, v) => { typeIn(w, v); U.click(proposeBtn(w)); };
const partnerAgree = (w) => U.click(stage(w).findAllByType("button").find((b) => U.text(b).trim() === "Agree to this deal"));
const exec = (w, actor, cmd, payload) => { let res; TR.act(() => { res = w.store.execute(actor, cmd, { oppId: w.id, ...payload }); }); return res; };

describe("B. The partner's final balance is one signed figure", () => {
  test("positive, negative and $0 are all submittable; non-amounts are not", () => {
    const w = ninaDeal();
    [["300", false], ["-120", false], ["0", false], ["", true], ["abc", true], ["-", true], ["1.234", true]]
      .forEach(([v, disabled]) => { typeIn(w, v); eq(!!proposeBtn(w).props.disabled, disabled, `"${v}"`); });
  });

  test("the entry is described by the one settlement formatter before sending", () => {
    const w = ninaDeal();
    assert(/Positive: Nina A\. pays you · Negative: you pay Nina A\. · 0: no cash changes hands/.test(previewText(w)),
      "the sign convention is stated: " + previewText(w));
    typeIn(w, "300"); eq(previewText(w), "Proposes: Nina A. pays you — $300", "positive");
    typeIn(w, "-120"); eq(previewText(w), "Proposes: You pay Nina A. — $120", "negative");
    typeIn(w, "0"); eq(previewText(w), "Proposes: No cash balance", "zero");
  });

  [[300, "collector-to-tp", 300, "Nina A. pays you — $300", "You pay"],
    [-120, "tp-to-collector", 120, "You pay Nina A. — $120", "pays you"],
    [0, "settled", 0, "No cash balance", "No cash owed"]].forEach(([signed, dir, amount, tpWords, colWords]) => {
    test(`a ${signed > 0 ? "positive" : signed < 0 ? "negative" : "zero"} proposal is stored signed and read the same by both seats`, () => {
      const w = ninaDeal();
      propose(w, String(signed));
      eq(D.currentCashFigure(w.o()), signed, "the domain holds the signed figure");
      eq(w.o().deal.tpAdj, signed, "as the partner's standing position");
      eq(Object.keys(w.o().deal).filter((k) => /payer|direction/i.test(k)).length, 0, "and no payer direction is stored");
      const p = D.cashReceipt(w.o()).proposed;
      eq(p.by, "tp", "proposed by the partner");
      eq(p.balance.direction, dir, "direction derives from the sign");
      eq(p.balance.amount, amount, "with an unsigned magnitude");
      assert(U.text(stage(w)).includes(`You proposed ${tpWords}.`), "the partner reads: " + tpWords);
      const col = D.settlement(D.currentCashFigure(w.o()), { viewer: "collector", partner: w.partner });
      assert(col.sentence.includes(colWords), "the collector reads the same agreement: " + col.sentence);
      eq(D.nextActor(w.o()).actor, "partner", "confirmation restarts with the partner");
    });
  });

  test("a negative figure survives confirmation, acceptance and the receipt", () => {
    const w = ninaDeal();
    propose(w, "-120");
    partnerAgree(w);
    eq(w.o().deal.tpAgreed, true, "the partner confirmed the figure");
    eq(exec(w, w.collector, "acceptDeal", {}).ok, true, "the collector confirms second");
    eq(w.o().stage, "fulfillment", "on to Fulfillment");
    eq(w.o().deal.agreedAdj, -120, "the agreed figure is the signed one");
    eq(D.finalBalance(w.o()), -120, "and so is the final balance");
    const fin = D.cashReceipt(w.o()).final;
    eq(fin.direction, "tp-to-collector", "the partner pays");
    eq(fin.amount, 120, "$120");
    assert(/Cash balance\s*You pay Nina A\. — \$120/.test(U.text(stage(w))), "the partner's receipt says so");
    eq(exec(w, w.tp, "proposeFinalBalance", { amount: 50 }).refused, D.REFUSE.wrongStage,
      "and nothing can change it after agreement");
    assert(!field(w), "the control is gone once the balance is agreed");
  });

  test("$0 is a real settlement", () => {
    const w = ninaDeal();
    propose(w, "0");
    partnerAgree(w);
    exec(w, w.collector, "acceptDeal", {});
    eq(w.o().deal.agreedAdj, 0, "agreed at zero, not treated as missing");
    eq(D.cashReceipt(w.o()).final.direction, "settled", "no cash changes hands");
  });

  test("turn ownership, invalidation and authorization are unchanged", () => {
    const w = ninaDeal();
    partnerAgree(w);                                          // partner confirms the current state
    eq(D.nextActor(w.o()).actor, "collector", "the collector holds the move");
    const before = JSON.stringify(w.o());
    propose(w, "-75");
    eq(JSON.stringify(w.o()), before, "the partner cannot change the figure on the collector's turn");
    eq(exec(w, w.collector, "proposeFinalBalance", { amount: 250 }).ok, true, "the collector proposes");
    propose(w, "-50");
    eq(D.currentCashFigure(w.o()), -50, "the partner's signed counter is current");
    assert(!w.o().deal.tpAgreed && !w.o().deal.collectorAgreed, "every earlier confirmation lapsed");
    eq(D.nextActor(w.o()).actor, "partner", "and confirmation restarts with the partner");
    eq(stage(w).findAllByType("button").filter((b) => U.text(b).trim() === "Agree to this deal").length, 1,
      "the product workspace offers only the partner's own confirmation");
    eq(exec(w, { collectorId: w.nina, seat: "tp" }, "acceptDeal", {}).refused, D.REFUSE.notYourTurn,
      "a claimed seat in the actor grants nothing");
  });
});

/* ---- C. Collector-side partner impersonation is DEV-only ------------------ */
const COL_SRC = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const M0 = require("../dist/MetYet.cjs");
const bundle = (entry, name, dev, demo) => {
  const out = path.join(ROOT, "dist", name);
  if (!cache[out]) {
    esbuild.buildSync({
      entryPoints: [path.join(ROOT, entry)], outfile: out,
      bundle: true, format: "cjs", platform: "node", external: ["react", "react-dom"],
      jsx: "automatic", logLevel: "silent",
      define: { __METYET_DEV__: String(dev), __METYET_DEMO__: String(demo) },
    });
    delete require.cache[require.resolve(out)];
    cache[out] = require(out);
  }
  return cache[out];
};
const collectorBuild = (mode) => bundle("collector/MetYetCollector.jsx", `CloseoutCOL-${mode}.cjs`,
  MODES[mode].dev, MODES[mode].demo);
const shellBuild = (mode) => bundle("shell/MetYetPrototype.jsx", `CloseoutSHELL-${mode}.cjs`,
  MODES[mode].dev, MODES[mode].demo).default;

const t = (n) => U.text(n);
const expandGoals = (r) => U.byClass(r, "goal").forEach((g) => {
  const d = g.findAllByType("button").find((b) => String(b.props.className || "").includes("goal-deal"));
  if (d && !d.props["aria-expanded"]) U.click(d);
});
const enterShell = (mode, who) => {
  let r; TR.act(() => { r = TR.create(React.createElement(shellBuild(mode))); });
  U.click(U.buttons(r).find((b) => t(b).includes("Continue as " + who)));
  return r;
};
const shellStore = (r) => r.root.findAll((n) => n.props && n.props.store)[0].props.store;
const scenarioSelect = (r) => r.root.findAllByType("select").find((x) => x.props["aria-label"] === "Scenario");
const pickScenario = (r, v) => { TR.act(() => { scenarioSelect(r).props.onChange({ target: { value: v } }); }); expandGoals(r); };
const switchPersona = (r, who) => {
  U.click(U.byClass(r, "myp-bar")[0].findAllByType("button").find((b) => t(b) === "Switch persona"));
  U.click(U.byClass(r, "myp-menu")[0].findAllByType("button").find((b) => t(b).includes(who)));
};
const IMPERSONATION = (r) => U.byClass(r, "dpr").length > 0 || /Partner response/.test(U.allText(r));
const partnersTurn = (st) => st.opportunities.filter((o) => o.collectorId === "c12" && D.isActive(o)
  && D.nextActor(o).actor === "partner");
const STAGES = ["pre-deal", "pre-deal-ready", "agree-price", "select-trade", "value-trade", "deal", "fulfillment"];

describe("C. Collector-side partner impersonation is DEV-only", () => {
  test("production build: the partner-response helper is absent", () => {
    const C = collectorBuild("product");
    C.__store.reset(M0.buildCanonicalSeed());
    assert(partnersTurn(C.__store.get().get()).length > 0, "Casey has deals where the partner holds the turn");
    let r; TR.act(() => { r = TR.create(React.createElement(C.default)); });
    expandGoals(r);
    assert(!IMPERSONATION(r), "no partner-response control");
    assert(!/Simulate/.test(U.allText(r)), "and no engineering simulator");
  });

  test("hosted pilot build: absent at every scenario, including on the partner's turn", () => {
    const r = enterShell("pilot", "Collector");
    STAGES.forEach((stage) => {
      pickScenario(r, stage);
      assert(!IMPERSONATION(r), "no partner-response control at " + stage);
      assert(!/Simulate/.test(U.allText(r)), "no simulator at " + stage);
    });
    pickScenario(r, "fulfillment");
    assert(partnersTurn(shellStore(r).get()).length > 0, "a scenario where the partner holds the turn was checked");
  });

  test("development build: the helper is available where intended", () => {
    const r = enterShell("dev", "Collector");
    pickScenario(r, "fulfillment");
    const box = U.byClass(r, "dpr")[0];
    assert(box, "the partner-response control renders on the partner's turn");
    assert(/proposes a handoff plan/.test(t(box)), "offering the partner's real next move");
  });

  test("outside DEV a partner-owned action from the Collector app is refused, and nothing changes", () => {
    ["product", "pilot"].forEach((mode) => {
      const C = collectorBuild(mode);
      eq(C.partnerSimActor("p-self"), null, mode + ": no partner actor");
      const st = createStore(M0.buildCanonicalSeed({ review: true }));
      const turn = partnersTurn(st.get());
      assert(turn.length > 0, "a partner-turn opportunity to attempt");
      const o = turn[0];
      const before = JSON.stringify(st.get());
      const A = C.partnerDemo(st);
      [A.agreePrice({ oppId: o.id }), A.proposePrice({ oppId: o.id, amount: 1 }),
        A.dealAgree({ oppId: o.id }), A.proposeFulfillment({ oppId: o.id, plan: { method: "Meet" } }),
        A.confirmHandoff({ oppId: o.id }), A.endOpportunity(o.id, "partner", null, "x"),
        A.sendMessage({ collectorId: o.collectorId, partnerId: o.partnerId, cardId: o.cardId, text: "as the partner" })]
        .forEach((res, i) => eq(res && res.refused, D.REFUSE.unknownActor, mode + ": call " + i + " refused"));
      eq(JSON.stringify(st.get()), before, mode + ": canonical state is byte-identical");
    });
    const dev = collectorBuild("dev");
    eq(JSON.stringify(dev.partnerSimActor("p-self")), JSON.stringify({ partnerId: "p-self" }), "dev: the simulated partner");
    const st = createStore(M0.buildCanonicalSeed({ review: true }));
    const o = partnersTurn(st.get()).find((x) => x.stage === "agree-price");
    assert(!dev.partnerDemo(st).agreePrice({ oppId: o.id }).refused, "dev: the same call executes");
  });

  test("DEMO scenario loading and reset still work in the hosted pilot", () => {
    const r = enterShell("pilot", "Collector");
    const initial = scenarioSelect(r).props.value;
    const target = STAGES.find((x) => x !== initial && ["deal", "value-trade"].includes(x));
    pickScenario(r, target);
    eq(scenarioSelect(r).props.value, target, "the scenario loaded");
    const g = shellStore(r).get().goals.find((x) => /^Review deal/.test(x.note || ""));
    eq(D.activeOppForGoal(g.id, shellStore(r).get().opportunities).stage, target, "the review deal is at that stage");
    U.click(U.buttons(r).find((b) => t(b) === "Reset demo"));
    eq(scenarioSelect(r).props.value, initial, "reset returns to the demo baseline");
  });

  test("persona switching still works in the hosted pilot", () => {
    const r = enterShell("pilot", "Collector");
    assert(/Collector/.test(t(U.byClass(r, "myp-viewing")[0])), "starts as the Collector");
    switchPersona(r, "Trusted Partner");
    assert(/Trusted Partner/.test(t(U.byClass(r, "myp-viewing")[0])), "switches to the Trusted Partner");
    assert(U.buttons(r).some((b) => /^Collector Network/.test(t(b))), "the partner workspace is mounted");
    switchPersona(r, "Collector");
    assert(/Collector/.test(t(U.byClass(r, "myp-viewing")[0])), "and back");
  });

  test("the partner workspace's Collector simulation stays DEV-only inside the shell", () => {
    const open = (mode) => {
      const r = enterShell(mode, "Trusted Partner");
      U.goProfile(r, "James Rivera");
      U.click(U.btns(r, "Open").filter((b) => t(b).trim() === "Open")[0]);
      return U.allText(r);
    };
    assert(!/Demo control · simulating/.test(open("pilot")), "pilot: absent");
    assert(!/Demo control · simulating/.test(open("product")), "product: absent");
    assert(/Demo control · simulating/.test(open("dev")), "dev: present");
  });

  test("no raw mutation or actor-bypass path was introduced", () => {
    const col = code(COL_SRC);
    assert(/const PARTNER_SIMULATION = DEV;/.test(col), "gated on the canonical DEV flag, not a new one");
    assert(/export const partnerSimActor = \(partnerId\) =>\s*\(PARTNER_SIMULATION && partnerId \? \{ partnerId \} : null\);/.test(col),
      "the only partner actor the Collector app can form is the gated one");
    assert(/return o \? partnerSimActor\(o\.partnerId\) : null;/.test(col), "every opportunity move uses it");
    assert(/store\.execute\(partnerSimActor\(partnerId\), "sendMessage"/.test(col), "and so does its message");
    assert(!/execute\(\s*\{\s*partnerId/.test(col), "no literal partner actor is passed anywhere");
    assert(!/store\.set\(|\.patchOpportunity\(/.test(col), "no raw store write or opportunity patch");
    eq((col.match(/\.fixture\./g) || []).length, 2, "fixture use is only the standalone reset and the DEMO scenario loader");
    const tp = code(TP_SRC);
    assert(!/(run|act|store\.execute)\(\s*\{\s*collectorId/.test(tp), "the partner workspace still mints no collector actor");
  });
});

run();
