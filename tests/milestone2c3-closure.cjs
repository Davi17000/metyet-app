/* ============================================================================
   MILESTONE 2C.3 — COLLECTOR UX CLOSURE

   Through the real Collector shell over projections of worlds driven by real
   domain commands (the Milestone 2C.1 world, plus a Reverse Holo Mudkip #60
   Goal beside the Normal one):

     A. two printings of one card never read alike: the version comes from the
        canonical card the catalogue describes, on the Goal card, in View
        Matches, in the viewer and in the Deal Workspace
     B. nothing else moved: grade and condition, progress, Primary only, offers
     C. legacy inspections: reachable where they matter, closed only by the
        Collector's own press, never by looking; photo requests keep their state
     D. photo security: a partner's photo reference is never rendered
     E. matching regression: a copy held only by an old inspection or photo
        request is never shown, counted or offered as a match
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const path = require("path");
const React = require("react");
const TR = require("react-test-renderer");
const esbuild = require("esbuild");
const P = require("../domain/metyet-projection.js");
const { createStore } = require("./fixture-store.cjs");
const RT = require("../domain/metyet-runtime.js");

const ROOT = path.join(__dirname, "..");
const AT = "2026-11-03";
let seq = 0;
const runtime = () => RT.createRuntime({ now: () => AT, newId: (p = "") => `${p}${++seq}` });
const A = { collectorId: "casey" };
const J = { collectorId: "jordan" };
const NL = { partnerId: "nl" };
const SV = { partnerId: "sv" };

const world = ({ agreed = true, mudkipMoves = null } = {}) => {
  const st = createStore({
    partners: [{ id: "nl", name: "Northline Cards", tradeRate: 0.7 }, { id: "sv", name: "Silver Vale", tradeRate: 0.7 },
      { id: "far", name: "Faraway Games", tradeRate: 0.7 }],
    collectors: [{ id: "casey", name: "Casey" }, { id: "jordan", name: "Jordan" }],
    relationships: [
      { partnerId: "nl", collectorId: "casey", status: "accepted", at: AT },
      { partnerId: "sv", collectorId: "casey", status: "accepted", at: AT },
      { partnerId: "nl", collectorId: "jordan", status: "accepted", at: AT }],
    /* the server's order: Charizard first, then Mudkip — not the order of urgency */
    goals: [
      { id: "gC", collectorId: "casey", canonicalCardId: "cc-char", tier: "primary", desired: { grade: "PSA 9" } },
      { id: "gV", collectorId: "casey", canonicalCardId: "cc-ven", tier: "secondary", desired: { grade: "PSA 8" } },
      { id: "gM", collectorId: "casey", canonicalCardId: "cc-mud", tier: "primary", desired: { grade: "Raw", condition: "Near Mint" } },
      { id: "gP", collectorId: "casey", canonicalCardId: "cc-pika", tier: "primary", desired: { grade: "PSA 10" } },
      /* Milestone 2C.3: the same Mudkip #60 in its Reverse Holo printing */
      { id: "gR", collectorId: "casey", canonicalCardId: "cc-mudr", tier: "primary", desired: { grade: "PSA 9" } },
      { id: "gJR", collectorId: "jordan", canonicalCardId: "cc-mudr", tier: "primary", desired: { grade: "PSA 9" } },
      { id: "gJ", collectorId: "jordan", canonicalCardId: "cc-ven", tier: "primary", desired: { grade: "PSA 9" } }],
    inventory: [
      { invId: "m1", partnerId: "nl", canonicalCardId: "cc-mud", grade: "Raw", condition: "Near Mint", ask: 12, cost: 6, cert: "CERT-M" },
      { invId: "c1", partnerId: "nl", canonicalCardId: "cc-char", grade: "PSA 9", ask: 1200, cost: 900, cert: "CERT-C1" },
      { invId: "c2", partnerId: "nl", canonicalCardId: "cc-char", grade: "PSA 9", ask: 1250, cost: 950, firmOnPrice: true },
      { invId: "c3", partnerId: "sv", canonicalCardId: "cc-char", grade: "PSA 9", ask: 1180, cost: 800 },
      { invId: "j1", partnerId: "nl", canonicalCardId: "cc-ven", grade: "PSA 9", ask: 1300, cost: 999 },
      { invId: "p1", partnerId: "far", canonicalCardId: "cc-pika", grade: "PSA 10", ask: 500, cost: 300 },
      { invId: "v1", partnerId: "sv", canonicalCardId: "cc-ven", grade: "PSA 8", ask: 300, cost: 150 },
      { invId: "r1", partnerId: "nl", canonicalCardId: "cc-mudr", grade: "PSA 9", ask: 85, cost: 40 },
      { invId: "r2", partnerId: "nl", canonicalCardId: "cc-mudr", grade: "PSA 9", ask: 90, cost: 45 }],
    collectorCopies: [], binders: [], binderEntries: [], opportunities: [], catalog: [], copyReviews: [],
    photoRequests: [], conversations: [], interests: [],
  }, runtime());
  const x = (actor, cmd, payload) => st.execute(actor, cmd, { at: AT, ...(payload || {}) });
  const ok = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
  const mud = ok(x(A, "startOpportunity", { goalId: "gM", invId: "m1", amount: 10 }), "Mudkip offer");
  for (const [who, cmd, p] of mudkipMoves || (agreed ? [[NL, "proposePrice", { amount: 11 }], [A, "acceptPrice"]] : [])) {
    ok(x(who, cmd, { oppId: mud, ...(p || {}) }), cmd);
  }
  const jordans = ok(x(J, "startOpportunity", { goalId: "gJ", invId: "j1", amount: 1111 }), "Jordan's offer");
  return { st, x, mud, jordans };
};

const build = (rel) => {
  const out = esbuild.buildSync({ entryPoints: [path.join(ROOT, rel)], bundle: true, format: "cjs", write: false,
    logLevel: "silent", jsx: "automatic", platform: "node",
    external: ["react", "react-dom", "react/jsx-runtime", "react-test-renderer"] });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};
const Shell = build("client/collector/CollectorShell.jsx").default;
const DF = build("client/collector/sections/DealFlow.jsx");
const PARTS = build("client/collector/deal-parts.jsx");
const PG = build("client/collector/deal-progress.js");
const CARDS = {
  "cc-mud": { canonicalCardId: "cc-mud", cardName: "Mudkip", expansionName: "Ruby & Sapphire", collectorNumber: "60",
    finish: "non_holo", printRun: "not_applicable", language: "en", imageSmall: "https://example.test/mud.png" },
  /* the same artwork as cc-mud: the finish, not the picture, tells them apart */
  "cc-mudr": { canonicalCardId: "cc-mudr", cardName: "Mudkip", expansionName: "Ruby & Sapphire", collectorNumber: "60",
    finish: "reverse_holofoil", printRun: "not_applicable", language: "en", imageSmall: "https://example.test/mud.png" },
  "cc-char": { canonicalCardId: "cc-char", cardName: "Charizard", expansionName: "Base Set", collectorNumber: "4" },
  "cc-pika": { canonicalCardId: "cc-pika", cardName: "Pikachu", expansionName: "Jungle", collectorNumber: "60" },
  "cc-ven": { canonicalCardId: "cc-ven", cardName: "Venusaur", expansionName: "Base Set", collectorNumber: "15" } };
const door = { describe: async (ids) => ({ cards: ids.map((id) => CARDS[id]).filter(Boolean) }) };
const settle = async () => { for (let i = 0; i < 10; i += 1) await TR.act(async () => { await new Promise((d) => setTimeout(d, 0)); }); };

const textOf = (n) => (typeof n === "string" ? n : (n && n.children ? n.children.map(textOf).join(" ") : ""));
const flat = (n) => textOf(n).replace(/\s+/g, " ").trim();
const cls = (n) => String((n.props && n.props.className) || "").split(" ");
const byCls = (root, c) => root.findAll((n) => typeof n.type === "string" && cls(n).includes(c));
const buttons = (root) => root.findAll((n) => n.type === "button").map((b) => flat(b));
const bars = (root) => root.findAll((n) => n.props && n.props.role === "progressbar");
/* The deal block's three lines, in order, with the bar shown as [bar]. */
const lines = (card) => byCls(byCls(card, "mcs-dg-deal")[0], "mcs-dg-progress")[0].findAll((n) => typeof n.type === "string"
  && (n.type === "p" || n.props.role === "progressbar")).map((n) => (n.props.role === "progressbar" ? "[bar]" : flat(n))).join(" | ");

/* The Collector's shell over the store, sending real commands and
   re-projecting after each, as the production entrance does. */
async function shell(st, actor = A) {
  const sent = [];
  let r;
  const props = () => ({
    state: P.projectForActor(st.get(), actor), onSignOut: () => {}, onBrowseCards: door,
    onAddGoal: async () => ({ ok: true }),
    onOpenOffer: (goalId, invId, price) => send("startOpportunity", { goalId, invId, ...price }),
    onCounterOffer: (oppId, price) => send("proposePrice", { oppId, ...price }),
    onAcceptOffer: (oppId) => send("acceptPrice", { oppId }),
    onWithdrawOffer: (oppId) => send("cancelOpportunity", { oppId }),
    onInspect: (invId) => send("reviewCopy", { invId }),
    onEndInspection: (reviewId) => send("endReview", { reviewId }),
    onRequestPhotos: (invId) => send("requestPhotos", { invId }),
    onRefresh: async () => { await TR.act(async () => { r.update(el()); }); },
  });
  const send = async (cmd, payload) => {
    sent.push(cmd);
    const out = st.execute(actor, cmd, { at: AT, ...payload });
    await TR.act(async () => { r.update(el()); });
    await settle();
    return out;
  };
  const el = () => React.createElement(Shell, props());
  await TR.act(async () => { r = TR.create(el()); });
  await settle();
  const s = { sent, get r() { return r; } };
  s.go = async (label) => { const b = r.root.findAll((n) => n.type === "button" && flat(n).includes(label) && cls(n).includes("mcs-i"))[0];
    await TR.act(async () => { b.props.onClick(); }); await settle(); };
  s.cards = () => r.root.findAll((n) => n.type === "article" && n.props["data-goal"]);
  s.goal = (id) => s.cards().find((a) => a.props["data-goal"] === id) || null;
  s.press = async (root, label) => { const b = root.findAll((n) => n.type === "button" && (flat(n) === label || n.props["aria-label"] === label))[0];
    assert(b, `no "${label}" in: ${flat(root).slice(0, 300)}`);
    await TR.act(async () => { await b.props.onClick(); }); await settle(); };
  s.ws = () => r.root.findAll((n) => n.type === "div" && n.props.className === "mcs-ws")[0] || null;
  s.gm = () => r.root.findAll((n) => n.type === "div" && cls(n).includes("mcs-gm"))[0] || null;
  s.nav = () => r.root.findAll((n) => n.type === "nav").length;
  return s;
}
const landing = async (opts) => { const w = world(opts); const s = await shell(w.st); await s.go("Deal Flow"); return { ...w, s }; };


const okv = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
const PRESENT = build("client/collector/present.js");
const dialog = (s) => s.r.root.findAll((n) => n.props && n.props.role === "dialog")[0] || null;
const rowOf = (s, inv) => s.gm().findAll((n) => n.type === "li" && n.props["data-inv"] === inv)[0] || null;
const thumbOf = (s, inv) => byCls(rowOf(s, inv), "mcs-pv-thumb")[0];
/* A copy closed to Casey the way the domain closes one: Jordan's deal on it,
   pended by the partner. */
const closeForCasey = (w, invId) => {
  const opp = okv(w.x(J, "startOpportunity", { goalId: "gJR", invId, amount: 80 }), "Jordan opens");
  okv(w.x(NL, "setCopyPending", { invId, oppId: opp }), "pend");
};

/* ================================================================ A */
describe("A. two printings of one card never read alike", () => {
  test("Normal and Reverse Holo Mudkip #60 Goals are told apart on their cards, with nothing opened", async () => {
    const { s } = await landing();
    const set = (id) => flat(byCls(s.goal(id), "mcs-dg-set")[0]);
    eq(set("gM"), "Ruby & Sapphire · #60 · Normal");
    eq(set("gR"), "Ruby & Sapphire · #60 · Reverse Holo");
    assert(flat(s.goal("gM")) !== flat(s.goal("gR")), "the two cards read identically");
    eq(flat(byCls(s.goal("gM"), "mcs-dg-name")[0]), flat(byCls(s.goal("gR"), "mcs-dg-name")[0]), "precondition: same name");
  });
  test("the version is the canonical card's own — not the picture, not the number", () => {
    const base = { expansionName: "Ruby & Sapphire", collectorNumber: "60", imageSmall: "https://example.test/mud.png" };
    eq(PRESENT.printingLine({ ...base, finish: "non_holo" }), "Ruby & Sapphire · #60 · Normal");
    eq(PRESENT.printingLine({ ...base, finish: "reverse_holofoil" }), "Ruby & Sapphire · #60 · Reverse Holo");
    eq(PRESENT.printingLine({ ...base, finish: "holofoil", printRun: "first_edition" }), "Ruby & Sapphire · #60 · Holo · First Edition");
    eq(PRESENT.printingLine({ ...base, finish: "holofoil", stamp: "prerelease", printVariation: "shadowless", language: "ja" }),
      "Ruby & Sapphire · #60 · Holo · Prerelease stamp · Shadowless · JA");
    /* the usual is left unsaid, exactly as on the Browse card */
    eq(PRESENT.printingLine({ ...base, finish: "non_holo", printRun: "unlimited", stamp: "none", printVariation: "standard", language: "en" }),
      "Ruby & Sapphire · #60 · Normal");
    /* nothing named, nothing guessed: no "Version", no finish read off the art —
       and what IS known still said */
    eq(PRESENT.printingLine(base), "Ruby & Sapphire · #60");
    eq(PRESENT.printingLine({ ...base, language: "ja" }), "Ruby & Sapphire · #60 · JA");
    eq(PRESENT.printingLine({ collectorNumber: "60" }), "#60");
    eq(PRESENT.printingLine(null), null);
    /* the Browse card's own label is exactly as it was */
    eq(PRESENT.versionLabel({ finish: "holofoil", printRun: "first_edition" }), "Holo · First Edition");
    eq(PRESENT.versionLabel({ finish: "holofoil", printRun: "unlimited" },
      [{ finish: "holofoil", printRun: "unlimited" }, { finish: "holofoil", printRun: "first_edition" }]), "Holo · Unlimited");
    const CD = build("client/collector/CardDetail.jsx");
    for (const finish of ["non_holo", "reverse_holofoil", "holofoil", "cosmos_holofoil"]) {
      eq(CD.versionLabel({ finish }), PRESENT.versionLabel({ finish }), "the Browse card and Deal Flow name versions two ways");
    }
    assert(/export \{ versionLabel \}/.test(require("fs").readFileSync(path.join(ROOT, "client/collector/CardDetail.jsx"), "utf8")),
      "CardDetail keeps a second definition");
  });
  test("the grade or condition asked for is unchanged beside the version", async () => {
    const { s } = await landing();
    eq(flat(byCls(s.goal("gM"), "mcs-dg-want")[0]), "Raw · Near Mint");
    eq(flat(byCls(s.goal("gR"), "mcs-dg-want")[0]), "PSA 9");
  });
  test("View Matches, the photo viewer and the Deal Workspace carry the same version", async () => {
    const { s } = await landing();
    await s.press(s.goal("gR"), "View Matches");
    assert(/Ruby & Sapphire · #60 · Reverse Holo · PSA 9/.test(flat(byCls(s.gm(), "mcs-ws-hd")[0])), flat(byCls(s.gm(), "mcs-ws-hd")[0]));
    await TR.act(async () => { thumbOf(s, "r1").props.onClick(); });
    assert(/Reverse Holo · PSA 9 · Northline Cards/.test(flat(dialog(s))), flat(dialog(s)));
    await s.press(dialog(s), "Close");
    await s.press(s.gm(), "Back to Deal Flow");
    await s.press(s.goal("gM"), "View Agreement");
    assert(/Ruby & Sapphire · #60 · Normal · with Northline Cards/.test(flat(byCls(s.ws(), "mcs-ws-hd")[0])), flat(byCls(s.ws(), "mcs-ws-hd")[0]));
  });
});

/* ================================================================ B */
describe("B. nothing else moved", () => {
  test("progress, the one action and Primary-only filtering are as they were", async () => {
    const { s } = await landing();
    eq(s.cards().map((a) => a.props["data-goal"]).join(), "gC,gM,gP,gR");
    eq(bars(s.goal("gM")).length, 1);
    eq(byCls(s.goal("gM"), "mcs-dg-progress")[0].findAll((n) => n.type === "p").map((p) => flat(p)).join(" | "),
      "Market price agreed | Select Trade not yet available");
    eq(buttons(s.goal("gM")).join("|"), "View Agreement");
    eq(bars(s.goal("gR")).length, 0);
    eq(buttons(s.goal("gR")).join("|"), "View Matches");
    eq(flat(byCls(s.goal("gR"), "mcs-dg-match")[0]), "1 Trusted Partner matches");
  });
  test("an opening offer in dollars still opens the deal on the copy chosen", async () => {
    const { s, st } = await landing();
    await s.press(s.goal("gR"), "View Matches");
    await s.press(rowOf(s, "r2"), "Make an offer");
    const box = byCls(rowOf(s, "r2"), "mcs-oo")[0];
    await TR.act(async () => { box.findAll((n) => n.type === "input")[0].props.onChange({ target: { value: "70" } }); });
    eq(s.sent.length, 0);
    await TR.act(async () => { await byCls(rowOf(s, "r2"), "mcs-oo")[0].props.onSubmit({ preventDefault() {} }); });
    await settle(); await settle();
    const o = st.get().opportunities.find((x) => x.goalId === "gR");
    eq([o.invId, o.priceThread[0].amount].join(), "r2,70");
    eq(s.ws() && s.ws().props["data-opp"], o.id);
  });
});

/* ================================================================ C */
describe("C. legacy inspections", () => {
  test("an inspection on a copy that has since closed stays on screen, and Remove from list ends exactly it", async () => {
    const w = world();
    const rv = okv(w.x(A, "reviewCopy", { invId: "r1" }), "an inspection from before Milestone 2C.2");
    closeForCasey(w, "r1");
    const s = await shell(w.st); await s.go("Deal Flow"); await s.press(s.goal("gR"), "View Matches");
    const row = rowOf(s, "r1");
    assert(row && /No longer available/.test(flat(row)), "the closed copy vanished");
    await s.press(row, "Remove from list");
    eq(JSON.stringify(s.sent), JSON.stringify(["endReview"]), "not the existing endReview command");
    const kept = w.st.get().copyReviews.find((r) => r.id === rv);
    assert(kept && kept.endedAt, "the inspection was not ended — or its record was deleted");
    eq(rowOf(s, "r1"), null, "Remove from list did not remove it");
  });
  test("with a photo request still open, the row says so and does not offer a Remove that would not remove", async () => {
    const w = world();
    okv(w.x(A, "requestPhotos", { invId: "r1" }), "asked (which opens the inspection too)");
    closeForCasey(w, "r1");
    const s = await shell(w.st); await s.go("Deal Flow"); await s.press(s.goal("gR"), "View Matches");
    const row = rowOf(s, "r1");
    assert(/No longer available/.test(flat(row)) && /Photos requested/.test(flat(row)), flat(row));
    assert(!buttons(row).includes("Remove from list") && !buttons(row).includes("Request actual photos"), buttons(row).join("|"));
    eq(w.st.get().photoRequests.filter((r) => r.invId === "r1" && !r.fulfilledAt).length, 1, "the request changed");
  });
  test("an inspection on an available copy is left as it is: nothing is closed silently, and looking closes nothing", async () => {
    const w = world();
    okv(w.x(A, "reviewCopy", { invId: "r2" }), "an old inspection");
    const before = JSON.stringify(w.st.get().copyReviews);
    const s = await shell(w.st); await s.go("Deal Flow"); await s.press(s.goal("gR"), "View Matches");
    assert(!/inspect/i.test(flat(s.gm())), "inspection wording came back");
    await TR.act(async () => { thumbOf(s, "r2").props.onClick(); });
    await s.press(dialog(s), "Close");
    eq(s.sent.length, 0, "looking sent a command");
    eq(JSON.stringify(w.st.get().copyReviews), before, "an inspection changed by looking or by rendering");
  });
  test("an old inspection of a copy that is still on the shelf but no longer matches is said as that, not as gone", async () => {
    const w = world();
    okv(w.x(A, "reviewCopy", { invId: "r1" }), "inspected while it matched");
    okv(w.x(NL, "updateInventoryCopy", { invId: "r1", patch: { grade: "PSA 8" } }), "the partner regrades it");
    const s = await shell(w.st); await s.go("Deal Flow"); await s.press(s.goal("gR"), "View Matches");
    const row = rowOf(s, "r1");
    assert(row && /No longer matches your Goal/.test(flat(row)) && !/No longer available/.test(flat(row)), row ? flat(row) : "gone");
    assert(buttons(row).includes("Remove from list") && !buttons(row).includes("Make an offer"), buttons(row).join("|"));
  });
  test("a photo request keeps its pending state across a return to Deal Flow", async () => {
    const { s, st } = await landing();
    await s.press(s.goal("gR"), "View Matches");
    await s.press(rowOf(s, "r2"), "Request actual photos");
    await s.press(s.gm(), "Back to Deal Flow");
    await s.press(s.goal("gR"), "View Matches");
    assert(/Photos requested/.test(flat(rowOf(s, "r2"))) && !buttons(rowOf(s, "r2")).includes("Request actual photos"), flat(rowOf(s, "r2")));
    eq(st.get().photoRequests.filter((r) => r.invId === "r2").length, 1);
  });
});

/* ================================================================ D */
describe("D. photo security", () => {
  test("a partner's external photo reference is never rendered — on the row, in the viewer or anywhere", async () => {
    const w = world();
    okv(w.x(NL, "addCopyPhotos", { invId: "r1", front: "https://tracker.example/front.jpg?who=casey", back: "https://tracker.example/back.jpg" }), "photos");
    const s = await shell(w.st); await s.go("Deal Flow"); await s.press(s.goal("gR"), "View Matches");
    await TR.act(async () => { thumbOf(s, "r1").props.onClick(); });
    const srcs = s.r.root.findAll((n) => n.type === "img").map((n) => String(n.props.src));
    assert(srcs.length > 0 && srcs.every((u) => u === "https://example.test/mud.png"), "an image other than the catalogue's: " + srcs.join(", "));
    assert(!/tracker\.example/.test(JSON.stringify(s.r.toJSON())), "the reference reached the page");
    /* RESTATED (Milestone 2D.2 refinement): shorter, same facts — the
       partner's photos exist, and MetYet does not draw them. */
    assert(/Northline Cards has added photos of this copy \(front and back\), but MetYet can't show them yet\./.test(flat(dialog(s))), flat(dialog(s)));
  });
  test("the source still renders catalogue images only", () => {
    const strip = (f) => require("fs").readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const f of ["client/collector/sections/DealFlow.jsx", "client/collector/DealWorkspace.jsx"]) {
      for (const src of strip(f).match(/src=\{[^}]*\}/g) || []) assert(/image[A-Z]/.test(src) && !/photos/.test(src), `${f}: ${src}`);
    }
  });
});


/* ================================================================ E */
const DFM = build("client/collector/sections/DealFlow.jsx");
const entryOf = (w, goalId) => DFM.dealFlowGoals(P.projectForActor(w.st.get(), A)).find((g) => g.goal.id === goalId);
const inMatches = (s, inv) => s.gm().findAll((n) => n.type === "section" && cls(n).includes("mcs-gm-partner"))
  .some((sec) => sec.findAll((n) => n.type === "li" && n.props["data-inv"] === inv).length);
const inHeld = (s, inv) => s.gm().findAll((n) => n.type === "section" && cls(n).includes("mcs-gm-held"))
  .some((sec) => sec.findAll((n) => n.type === "li" && n.props["data-inv"] === inv).length);
describe("E. matching regression: held is not matched", () => {
  test("an exact PSA 9 Goal: PSA 9 copies are matches; a PSA 8 copy is not", async () => {
    const w = world();
    const c8 = okv(w.x(NL, "addInventoryCopy", { copy: { canonicalCardId: "cc-char", grade: "PSA 8", ask: 900 } }), "a PSA 8 on the shelf");
    const e = entryOf(w, "gC");
    eq(e.partners.flatMap((g) => g.copies.map((c) => c.copy.invId)).sort().join(), "c1,c2,c3", "the matches");
    eq(e.held.length, 0, "an uninspected PSA 8 is held");
    const s = await shell(w.st); await s.go("Deal Flow"); await s.press(s.goal("gC"), "View Matches");
    assert(inMatches(s, "c1") && inMatches(s, "c3"), "a PSA 9 match is missing");
    assert(!inMatches(s, c8) && !inHeld(s, c8), "the PSA 8 is shown");
  });
  test("an inspected PSA 8 stays out of the matches and the count, apart, with no offer — and its inspection is kept", async () => {
    const w = world();
    const c8 = okv(w.x(NL, "addInventoryCopy", { copy: { canonicalCardId: "cc-char", grade: "PSA 8", ask: 900 } }), "a PSA 8 on the shelf");
    const rv = okv(w.x(A, "reviewCopy", { invId: c8 }), "Casey inspected it");
    const e = entryOf(w, "gC");
    eq([e.partnerCount, e.copyCount].join(), "2,3", "the inspection changed the match");
    eq(e.held.map((h) => h.copy.invId).join(), c8);
    const s = await shell(w.st); await s.go("Deal Flow");
    eq(flat(byCls(s.goal("gC"), "mcs-dg-match")[0]), "2 Trusted Partners match");
    await s.press(s.goal("gC"), "View Matches");
    assert(!inMatches(s, c8), "the inspected PSA 8 sits among the matches");
    assert(inHeld(s, c8), "the inspected PSA 8 is not reachable at all");
    const row = rowOf(s, c8);
    assert(/Northline Cards · No longer matches your Goal/.test(flat(row)), flat(row));
    eq(row.findAll((n) => n.type === "button" && !cls(n).includes("mcs-pv-thumb")).map((b) => flat(b)).join("|"), "Remove from list",
      "an ineligible copy offers more than Remove from list");
    assert(/Copies you looked at before/.test(flat(s.gm())), "the held list is not named");
    const kept = w.st.get().copyReviews.find((r) => r.id === rv);
    assert(kept && !kept.endedAt, "rendering touched the inspection");
    eq(w.x(A, "startOpportunity", { goalId: "gC", invId: c8, amount: 800 }).refused, "criteria-mismatch", "the server's rule");
  });
  test("a partner whose only copy is held is not a matching Trusted Partner", async () => {
    const w = world();
    okv(w.x(A, "reviewCopy", { invId: "c3" }), "inspected while PSA 9");
    okv(w.x(SV, "updateInventoryCopy", { invId: "c3", patch: { grade: "PSA 8" } }), "Silver Vale regrades it");
    eq(entryOf(w, "gC").partnerCount, 1);
    const s = await shell(w.st); await s.go("Deal Flow");
    eq(flat(byCls(s.goal("gC"), "mcs-dg-match")[0]), "1 Trusted Partner matches");
    await s.press(s.goal("gC"), "View Matches");
    eq(s.gm().findAll((n) => n.type === "section" && cls(n).includes("mcs-gm-partner")).map((sec) => flat(sec.findAll((h) => h.type === "h2")[0])).join("|"),
      "Northline Cards", "Silver Vale is listed as a match");
    assert(inHeld(s, "c3"), "the held copy is gone");
  });
  test("the same for the finish: an inspected Normal Mudkip never appears under the Reverse Holo Goal", async () => {
    const w = world({ agreed: false, mudkipMoves: [[A, "cancelOpportunity"]] });
    okv(w.x(A, "reviewCopy", { invId: "m1" }), "inspected the Normal");
    const e = entryOf(w, "gR");
    assert(!e.partners.concat([{ copies: e.held }]).some((g) => g.copies.some((c) => c.copy.invId === "m1")), "the Normal reached the Reverse Holo Goal");
    const s = await shell(w.st); await s.go("Deal Flow"); await s.press(s.goal("gR"), "View Matches");
    eq(rowOf(s, "m1"), null);
  });
  test("with a held copy beside them, an eligible copy still opens a deal as before", async () => {
    const w = world();
    const c8 = okv(w.x(NL, "addInventoryCopy", { copy: { canonicalCardId: "cc-char", grade: "PSA 8", ask: 900 } }), "PSA 8");
    okv(w.x(A, "reviewCopy", { invId: c8 }), "inspected");
    const s = await shell(w.st); await s.go("Deal Flow"); await s.press(s.goal("gC"), "View Matches");
    await s.press(rowOf(s, "c1"), "Make an offer");
    await TR.act(async () => { byCls(rowOf(s, "c1"), "mcs-oo")[0].findAll((n) => n.type === "input")[0].props.onChange({ target: { value: "1100" } }); });
    await TR.act(async () => { await byCls(rowOf(s, "c1"), "mcs-oo")[0].props.onSubmit({ preventDefault() {} }); });
    await settle(); await settle();
    const o = w.st.get().opportunities.find((x) => x.goalId === "gC");
    eq([o.invId, o.priceThread[0].amount].join(), "c1,1100");
    eq(s.ws() && s.ws().props["data-opp"], o.id);
  });
});

run();
