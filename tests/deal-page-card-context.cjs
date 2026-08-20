/* ============================================================================
   THE FULL-PAGE DEAL CARRIES THE SAME PHYSICAL CARD

   The card-context work landed on the Goal's pursuit header, but opening the
   deal led to a second header with its own small thumbnail and no way to look
   at the copy. Two surfaces described the same physical object differently.

   The evidence belongs to the DEAL SHELL rather than to any stage inside it.
   A photograph of the copy is not a fact about pricing, so it does not live in
   AgreePrice(); it stays put while the stage beneath changes, from Agree on
   Price through Fulfillment.

   The copy is resolved from o.invId alone. Not from the card, not from the
   partner, not from the first matching row in inventory — a sibling copy's
   photographs are evidence about a different object. An unbound deal has
   nothing to inspect and says so.
   ========================================================================= */

process.env.METYET_DEV = "1";

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const D = require("../domain/metyet-domain.js");
const { collectorView } = require("../domain/collector-view.js");
const App = require("../dist/Collector.cjs").default;
const { __store } = require("../dist/Collector.cjs");
const M = require("../dist/MetYet.cjs");

const readSrc = (rel) => require("fs").readFileSync(require("path").join(__dirname, "..", rel), "utf8");
const COL = readSrc("collector/MetYetCollector.jsx");
const TPSRC = readSrc("src/MetYet.jsx");
const txt = (n) => {
  if (!n) return "";
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ").replace(/\s+/g, " ").trim();
};
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));
const AT = "2026-08-19";
const ME = "c12";

const S = () => __store.get().get();
const acts = () => __store.get().actions;
const view = () => collectorView(S(), ME);
const goal = () => view().myGoals().find((g) => /^Review deal/.test(g.note || ""));
const opp = () => D.activeOppForGoal(goal().id, S().opportunities);
const snap = () => JSON.stringify(opp());

let R = null;
const ctx = () => cls(R, "dw-ctx")[0];
const inCtx = (re) => ctx().findAllByType("button").find((b) => re.test(txt(b)));
const anyBtn = (re) => R.root.findAllByType("button").find((b) => re.test(txt(b)));
const field = (re) => R.root.findAllByType("input")
  .find((i) => re.test(String(i.props["aria-label"] || "")));

/* The full-page deal is where submitting an offer lands, and the copy chosen on
   the partner row stays bound all the way through. */
const onDealPage = (opts) => {
  __store.reset(M.buildCanonicalSeed({ review: true,
    demoStage: (opts && opts.stockOnly) ? "pre-deal" : "pre-deal-ready" }));
  TR.act(() => { R = TR.create(React.createElement(App)); });
  const c = S().catalog.find((x) => x.id === goal().cardId);
  const card = () => cls(R, "goal").find((n) => txt(n).includes(c.name) && txt(n).includes(c.set));
  click(cls(card(), "gs-row")[0].findAllByType("button")
    .find((b) => /^Review Card$/i.test(txt(b))));
  click(card().findAllByType("button").find((b) => /^Make an offer/.test(txt(b))));
  if (!field(/offer in dollars/)) {
    const go = anyBtn(/^(Continue without photos|Offer anyway|Continue)$/);
    assert(go, "the proceed-without-photos confirmation");
    click(go);
  }
  TR.act(() => { field(/offer in dollars/).props.onChange({ target: { value: "3555" } }); });
  click(anyBtn(/^Submit offer$/));
  assert(ctx(), "the full-page deal workspace is open");
  return R;
};
/* Hand the turn back so the counter fields are on screen. */
const myMove = () => {
  TR.act(() => { acts().patchOpportunity(opp().id, (x) => ({ ...x,
    priceThread: [...x.priceThread, { by: "tp", type: "counter", amount: 3800, at: AT }] })); });
  TR.act(() => { R.update(React.createElement(App)); });
};
const atStage = (stage) => {
  TR.act(() => { acts().patchOpportunity(opp().id, (x) => ({ ...x, stage })); });
  TR.act(() => { R.update(React.createElement(App)); });
};

describe("A. The deal header describes the card", () => {
  test("it uses the same treatment as the Goal's pursuit header", () => {
    onDealPage();
    const art = cls(ctx(), "art")[0];
    assert(art, "the card is shown");
    assert(String(art.props.className).includes("xl"),
      "at the pursuit scale, not the old thumbnail: " + art.props.className);
    /* Both surfaces reach for the same preset, so they cannot drift apart. */
    assert(/<Art card=\{c\} size=\{pursuit \? "xl" : "lg"\} \/>/.test(COL),
      "the Goal surface uses xl while pursuing");
    assert(/<Art card=\{c\} size="xl" \/>/.test(COL), "and the deal shell uses xl too");
  });

  test("the preset keeps the card's proportions and does not overflow", () => {
    const m = /\.art\.xl \{ width: (\d+)px; height: (\d+)px; \}/.exec(COL);
    const lg = /\.art\.lg \{ width: (\d+)px; height: (\d+)px; \}/.exec(COL);
    assert(m && lg, "both presets are declared");
    const [w, h] = [Number(m[1]), Number(m[2])];
    assert(Math.abs((w / h) - (Number(lg[1]) / Number(lg[2]))) < 0.01,
      "the same proportions as every other card treatment");
    assert(/\.goal-top > \.art\.xl, \.dw-ctx > \.art\.xl \{ width: \d+px/.test(COL),
      "and both surfaces step down on a narrow screen");
    assert(/\.dw-ctx \{[^}]*align-items: flex-start/.test(COL),
      "the row aligns rather than stretching");
  });

  test("card and partner identity stay readable beside it", () => {
    onDealPage();
    const c = S().catalog.find((x) => x.id === goal().cardId);
    eq(txt(cls(ctx(), "dw-ctx-n")[0]), c.name, "the card is named");
    const line = txt(cls(ctx(), "dw-ctx-i")[0]);
    assert(line.includes(c.set), "with its set");
    assert(/PSA|Raw/.test(line), "and its grade");
    eq(txt(cls(ctx(), "dw-ctx-pn")[0]), "Northline Cards", "and the partner is unmistakable");
  });
});

describe("B. The evidence is the deal's exact copy", () => {
  test("photographs on file: a real button in the header", () => {
    onDealPage();
    const b = inCtx(/View actual card photos/);
    assert(b, "the action exists in the card context");
    eq(b.type, "button", "as a real button");
    assert(/View actual photos of/.test(String(b.props["aria-label"] || "")),
      "with an accessible label naming the card and partner");
    eq(cls(ctx(), "cx-ph").length, 1, "exactly one evidence affordance in the workspace");
  });

  test("the copy comes from o.invId and nothing else", () => {
    const shell = COL.slice(COL.indexOf("function Deal({ oppId, st, go }) {"),
      COL.indexOf("function Deal({ oppId, st, go }) {") + 2500);
    assert(/const boundCopy = o\.invId \? st\.inventoryCopy\(o\.invId\) : null/.test(shell),
      "resolved from the deal's own invId");
    assert(!/find\(\(i\) => i\.cardId/.test(shell), "never by card identity");
    assert(!/inventory\[0\]|\.filter\(.*partnerId.*\)\[0\]/.test(shell), "never a first match");
  });

  test("a sibling copy's photographs never leak in", () => {
    onDealPage();
    const bound = opp().invId;
    const siblings = S().inventory.filter((i) => i.cardId === goal().cardId && i.invId !== bound);
    assert(siblings.length >= 1, "the same card is stocked more than once");
    /* Strip the bound copy's photos while leaving every sibling photographed. */
    TR.act(() => { acts().addCopyPhotos({ invId: bound, front: null, back: null, at: AT }); });
    TR.act(() => { R.update(React.createElement(App)); });
    assert(siblings.some((s) => D.INVARIANTS.copyPhotographed(
      S().inventory.find((i) => i.invId === s.invId).photos)),
      "the siblings still have photographs");
    assert(!inCtx(/View actual card photos/),
      "but this deal offers none, because its own copy has none");
    assert(/Actual card photos not available/.test(txt(ctx())), "and says so");
  });

  test("a partly photographed copy counts as unavailable", () => {
    onDealPage();
    /* Only the back is withdrawn, so this copy is half-documented. */
    TR.act(() => { acts().addCopyPhotos({ invId: opp().invId, back: null, at: AT }); });
    TR.act(() => { R.update(React.createElement(App)); });
    eq(D.INVARIANTS.copyPhotographed(
      S().inventory.find((i) => i.invId === opp().invId).photos), false,
      "the canonical predicate requires both faces");
    assert(!inCtx(/View actual card photos/), "so there is nothing to inspect");
    assert(/Actual card photos not available/.test(txt(ctx())), "and the fact is stated");
  });

  test("an unbound deal does not crash and shows the unavailable state", () => {
    onDealPage();
    TR.act(() => { acts().patchOpportunity(opp().id, (x) => ({ ...x, invId: null })); });
    TR.act(() => { R.update(React.createElement(App)); });
    assert(ctx(), "the workspace still renders");
    assert(!inCtx(/View actual card photos/), "with no photo action");
    assert(/Actual card photos not available/.test(txt(ctx())), "and quiet text instead");
  });

  test("a stock-only copy states the fact, with no control at all", () => {
    onDealPage({ stockOnly: true });
    assert(/Actual card photos not available/.test(txt(ctx())), "the fact is stated");
    assert(cls(ctx(), "cx-ph-none")[0], "as passive text");
    eq(ctx().findAllByType("button").filter((b) => /photo/i.test(txt(b))).length, 0,
      "no photo control, not even a disabled one");
  });
});

describe("C. Looking, never asking", () => {
  test("the deal workspace never offers to request or upload photographs", () => {
    onDealPage({ stockOnly: true });
    const page = cls(R, "pg")[0];
    ["Request photos", "Request actual photos", "Upload"].forEach((w) =>
      assert(!txt(page).includes(w), "no " + w + " anywhere in the deal"));
    assert(!page.findAllByType("button").some((b) => /^Review Card$/i.test(txt(b))),
      "and no way back into the enrichment stage");
  });

  test("requesting still belongs to Review Card", () => {
    const rv = COL.slice(COL.indexOf("function ReviewCard("), COL.indexOf("function GoalCard("));
    assert(/Request actual photos/.test(rv), "which still offers it");
    const shell = COL.slice(COL.indexOf("function Deal({ oppId, st, go }) {"),
      COL.indexOf("function Deal({ oppId, st, go }) {") + 4000);
    assert(!/requestPhotos|addCopyPhotos/.test(shell), "the deal shell asks for nothing");
  });

  test("the evidence lives in the shell, not inside AgreePrice", () => {
    const ap = COL.slice(COL.indexOf("function AgreePrice("), COL.indexOf("/* Select Trade"));
    assert(!/View actual card photos/.test(ap), "pricing does not own the photographs");
    assert(!/CopyPhotoViewer|copyPhotographed/.test(ap), "nor the viewer, nor readiness");
    const shell = COL.slice(COL.indexOf("function Deal({ oppId, st, go }) {"),
      COL.indexOf("function Deal({ oppId, st, go }) {") + 4000);
    assert(/View actual card photos/.test(shell), "the shell does");
  });
});

describe("D. One viewer, and it changes nothing", () => {
  test("it reuses the Collector shell and the shared face primitives", () => {
    const shell = COL.slice(COL.indexOf("function Deal({ oppId, st, go }) {"),
      COL.indexOf("function Deal({ oppId, st, go }) {") + 4000);
    assert(/<CopyPhotoViewer/.test(shell), "the existing Collector viewer");
    eq((COL.match(/function CopyPhotoViewer\(/g) || []).length, 1, "defined once");
    const v = COL.slice(COL.indexOf("function CopyPhotoViewer("), COL.indexOf("function GoalCard("));
    assert(/<ActualCardPhoto/.test(v) && /<FaceSwitch/.test(v), "using the shared primitives");
    assert(!/copyph-p|aria-pressed|<img/.test(v), "with no second face-rendering rule");
    /* And the Trusted Partner still uses the same primitives. */
    const tp = TPSRC.slice(TPSRC.indexOf("function PhotoLightbox("),
      TPSRC.indexOf("function PhotoLightbox(") + 2000);
    assert(/<ActualCardPhoto/.test(tp) && /<FaceSwitch/.test(tp), "as does the partner's");
  });

  test("it opens on Front, Back is reachable, and closing stays put", () => {
    onDealPage();
    click(inCtx(/View actual card photos/));
    eq(cls(R, "lbx").length, 1, "the viewer is open");
    eq(anyBtn(/^front$/).props["aria-pressed"], true, "showing the front");
    click(anyBtn(/^back$/));
    eq(anyBtn(/^back$/).props["aria-pressed"], true, "the back can be selected");
    eq(anyBtn(/^front$/).props["aria-pressed"], false, "one face at a time");
    click(anyBtn(/^Close$/));
    eq(cls(R, "lbx").length, 0, "it closes");
    eq(cls(R, "dw").length, 1, "back in the same deal workspace");
    assert(inCtx(/View actual card photos/), "with the action still there");
  });

  test("opening, switching and closing mutate nothing", () => {
    onDealPage();
    const before = snap();
    click(inCtx(/View actual card photos/));
    eq(snap(), before, "opening changes nothing");
    click(anyBtn(/^back$/));
    eq(snap(), before, "switching changes nothing");
    click(anyBtn(/^Close$/));
    eq(snap(), before, "closing changes nothing");
    eq(opp().stage, "agree-price", "the stage is unmoved");
  });

  test("a typed pricing draft survives the whole inspection", () => {
    onDealPage();
    myMove();
    TR.act(() => { field(/dollars/).props.onChange({ target: { value: "3700" } }); });
    const dollars = field(/dollars/).props.value;
    const percent = field(/percentage/).props.value;
    assert(dollars === "3700" && percent !== "", "a draft exists, with its synced percentage");
    const before = snap();

    click(inCtx(/View actual card photos/));
    click(anyBtn(/^back$/));
    click(anyBtn(/^Close$/));

    eq(field(/dollars/).props.value, dollars, "the typed dollars are exactly as left");
    eq(field(/percentage/).props.value, percent, "and the synced percentage with them");
    eq(snap(), before, "nothing was submitted");
  });

  test("the draft survives because the shell holds the viewer, not the store", () => {
    const shell = COL.slice(COL.indexOf("function Deal({ oppId, st, go }) {"),
      COL.indexOf("function Deal({ oppId, st, go }) {") + 1200);
    assert(/const \[viewPhotos, setViewPhotos\] = useState\(null\)/.test(shell),
      "which face is showing is local shell state");
    const v = COL.slice(COL.indexOf("function CopyPhotoViewer("), COL.indexOf("function GoalCard("));
    assert(!/patchOpportunity|priceRespond|startOffer/.test(v), "the viewer calls no action");
  });

  test("waiting on the partner, inspection works and grants no pricing action", () => {
    onDealPage();
    eq(D.nextActor(opp()).actor, "partner", "it is their move");
    eq(R.root.findAllByType("input")
      .filter((i) => /dollars/.test(String(i.props["aria-label"] || ""))).length, 0,
      "so no pricing input is offered");
    const before = snap();
    click(inCtx(/View actual card photos/));
    click(anyBtn(/^back$/));
    click(anyBtn(/^Close$/));
    eq(snap(), before, "and looking changed nothing");
    eq(D.nextActor(opp()).actor, "partner", "the turn is unchanged");
  });
});

describe("E. It stays for the whole deal", () => {
  test("the card and its evidence persist through every later stage", () => {
    onDealPage();
    ["agree-price", "select-trade", "value-trade", "deal", "fulfillment"].forEach((stage) => {
      atStage(stage);
      assert(ctx(), "the context header is present at " + stage);
      assert(String(cls(ctx(), "art")[0].props.className).includes("xl"),
        "at the same scale at " + stage);
      assert(inCtx(/View actual card photos/),
        "and the evidence is still inspectable at " + stage);
      eq(cls(ctx(), "cx-ph").length, 1, "exactly once, at " + stage);
    });
  });

  test("the viewer still opens from a later stage", () => {
    onDealPage();
    atStage("fulfillment");
    const before = snap();
    click(inCtx(/View actual card photos/));
    eq(cls(R, "lbx").length, 1, "evidence access does not expire with the negotiation");
    click(anyBtn(/^Close$/));
    eq(snap(), before, "and changes nothing this late either");
  });

  test("pricing, history, conversation and the rail are unchanged", () => {
    onDealPage();
    myMove();
    assert(cls(R, "ap")[0], "the pricing stage renders");
    assert(cls(R, "ap-now")[0], "with its standing proposal");
    assert(cls(R, "oh")[0] || /Offer history/.test(txt(cls(R, "pg")[0])), "offer history is present");
    eq(cls(R, "rail-s").length, 6, "and six pursuit steps");
  });

  test("pricing still works after inspecting", () => {
    onDealPage();
    myMove();
    click(inCtx(/View actual card photos/));
    click(anyBtn(/^Close$/));
    TR.act(() => { field(/dollars/).props.onChange({ target: { value: "3700" } }); });
    click(anyBtn(/^Send counter$/));
    const last = D.lastEntry(opp().priceThread);
    eq(last.amount, 3700, "the counter submits the typed dollars");
    eq(last.by, "collector", "as the collector's move");
    eq(D.nextActor(opp()).actor, "partner", "and the turn passes");
  });

  test("no photo model was introduced, and domain state is untouched", () => {
    onDealPage();
    eq(Object.keys(S()).filter((k) => /photo/i.test(k)).join(","), "photoRequests",
      "the only photo collection is still the request relationship");
    const before = JSON.stringify({ o: S().opportunities, i: S().inventory,
      r: S().photoRequests, c: S().copyReviews });
    click(inCtx(/View actual card photos/));
    click(anyBtn(/^back$/));
    click(anyBtn(/^Close$/));
    eq(JSON.stringify({ o: S().opportunities, i: S().inventory,
      r: S().photoRequests, c: S().copyReviews }), before,
      "no opportunity, copy, request or review changed");
  });
});

require("./run.cjs").run();
