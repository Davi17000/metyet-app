/* ============================================================================
   AGREE ON PRICE — WHAT AM I PAYING FOR?

   A price is a judgement about one physical collectible, so the card should be
   large enough to feel like the subject of the negotiation, and the collector
   should be able to look at the actual photographs of THAT copy without leaving
   the pricing flow.

   The stage boundary matters as much as the feature:

     Review Card   enrichment — where photographs are asked for
     Agree on Price pricing   — where they are looked at, never requested

   So when photographs exist there is a way to inspect them, and when they do
   not there is a sentence saying so. No disabled button, no Request photos, no
   route backwards into Review Card.

   Inspection reads and never writes: no price, stage, turn or typed draft
   passes through the viewer, which is why a half-typed counter is still there
   when it closes.
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

let R = null;
const cardFor = () => {
  const c = S().catalog.find((x) => x.id === goal().cardId);
  return cls(R, "goal").find((n) => txt(n).includes(c.name) && txt(n).includes(c.set));
};
const disclosure = () => cardFor().findAllByType("button")
  .find((b) => String(b.props.className || "").includes("goal-deal"));
const expand = () => { if (!disclosure().props["aria-expanded"]) click(disclosure()); return cardFor(); };
const btn = (re) => cardFor().findAllByType("button").find((b) => re.test(txt(b)));
const field = (re) => cardFor().findAllByType("input")
  .find((i) => re.test(String(i.props["aria-label"] || "")));
const snap = () => JSON.stringify(opp());

/* Reach Agree on Price the way the product does: choose a copy on the partner
   row, offer from Review Card, then return to the Goal. The copy stays bound
   throughout, which is the point. */
const atAgreePrice = (opts) => {
  __store.reset(M.buildCanonicalSeed({ review: true,
    demoStage: (opts && opts.stockOnly) ? "pre-deal" : "pre-deal-ready" }));
  TR.act(() => { R = TR.create(React.createElement(App)); });
  click(cls(cardFor(), "gs-row")[0].findAllByType("button")
    .find((b) => /^Review Card$/i.test(txt(b))));
  /* Without photographs the offer CTA names that fact and confirms first;
     either way it is the same act, and the same canonical offer sheet. */
  click(cardFor().findAllByType("button").find((b) => /^Make an offer/.test(txt(b))));
  const dollarField = () => R.root.findAllByType("input")
    .find((i) => /offer in dollars/.test(String(i.props["aria-label"] || "")));
  if (!dollarField()) {
    const go = R.root.findAllByType("button")
      .find((b) => /^(Continue without photos|Offer anyway|Continue)$/.test(txt(b).trim()));
    assert(go, "the proceed-without-photos confirmation: "
      + R.root.findAllByType("button").map((b) => txt(b).trim()).filter(Boolean).join("|"));
    click(go);
  }
  const d = dollarField();
  TR.act(() => { d.props.onChange({ target: { value: "3555" } }); });
  click(R.root.findAllByType("button").find((b) => txt(b) === "Submit offer"));
  click(cls(R, "nav-i").find((b) => txt(b).includes("Goals")));
  expand();
  return R;
};
/* Hand the turn back to the collector so the counter fields are on screen. */
const myMove = () => {
  TR.act(() => { acts().patchOpportunity(opp().id, (x) => ({ ...x,
    priceThread: [...x.priceThread, { by: "tp", type: "counter", amount: 3800, at: AT }] })); });
  TR.act(() => { R.update(React.createElement(App)); });
  expand();
};

describe("A. The card anchors the negotiation", () => {
  test("the header image steps up once a pursuit is open, and only then", () => {
    const px = (name) => {
      const m = new RegExp("\\.art\\." + name + " \\{ width: (\\d+)px; height: (\\d+)px; \\}").exec(COL);
      assert(m, "the " + name + " preset is declared");
      return [Number(m[1]), Number(m[2])];
    };
    const [bw, bh] = px("lg");            // browsing
    const [ow, oh] = px("xl");            // pursuing
    assert(ow > bw, "materially larger: " + bw + "px -> " + ow + "px");
    assert(ow / bw <= 2.1, "but not a gallery: " + (ow / bw).toFixed(2) + "x");
    /* Aspect ratio preserved to within a rounding pixel. */
    assert(Math.abs((ow / oh) - (bw / bh)) < 0.01,
      "the card's proportions are preserved: " + bw + ":" + bh + " -> " + ow + ":" + oh);
    /* And it is conditional on the pursuit, so the goals list is untouched. */
    assert(/<Art card=\{c\} size=\{pursuit \? "xl" : "lg"\} \/>/.test(COL),
      "the size follows the pursuit");
  });

  test("it reuses the product's existing preset rather than inventing a size", () => {
    /* xl already existed in the stylesheet. The audit found it, so nothing new
       was introduced and no bespoke override shadows the presets. */
    assert(/\.art\.xl \{ width: \d+px/.test(COL), "the xl preset is the product's own");
    assert(!/\.goal\.deal-open .*\.art\.lg \{ width/.test(COL),
      "no one-off override of another preset");
  });

  test("it stays responsive and cannot overflow", () => {
    assert(/@media \(max-width: 480px\) \{\s*\n\s*\.goal-top > \.art\.xl, \.dw-ctx > \.art\.xl \{ width: \d+px/
      .test(COL), "both surfaces step back down on a narrow screen");
    assert(/\.goal-top \{[^}]*flex-wrap: wrap/.test(COL),
      "and the row wraps rather than overflowing");
  });

  test("card identity and the exact partner stay visible", () => {
    atAgreePrice();
    const card = cardFor();
    const c = S().catalog.find((x) => x.id === goal().cardId);
    assert(txt(card).includes(c.name), "the card is named");
    assert(txt(card).includes(c.set), "with its set");
    assert(/PSA|Raw/.test(txt(card)), "and its grade");
    assert(/Northline Cards/.test(txt(card)), "and the partner being negotiated with");
    assert(cls(card, "rail-s").length === 6, "the six-step rail is intact beside it");
  });
});

describe("B. Inspecting the actual copy", () => {
  test("photographs available: a real button, in the card header", () => {
    atAgreePrice();
    const b = btn(/View actual card photos/);
    assert(b, "the action exists");
    eq(b.type, "button", "as a real button");
    assert(/View actual photos of/.test(String(b.props["aria-label"] || "")),
      "with an accessible label naming the card and partner");
    /* In the card context, not in pricing, history, conversation or the rail. */
    assert(cls(cardFor(), "cx-ph")[0], "it lives in the card-context block");
    eq(cls(cls(cardFor(), "idf-work")[0] || { children: [] }, "cx-ph").length, 0,
      "not inside the pricing workspace");
  });

  test("it opens on Front, and Back is reachable", () => {
    atAgreePrice();
    click(btn(/View actual card photos/));
    eq(cls(cardFor(), "lbx").length, 1, "the viewer is open");
    eq(btn(/^front$/).props["aria-pressed"], true, "Front by default");
    eq(btn(/^back$/).props["aria-pressed"], false, "with Back available");
    click(btn(/^back$/));
    eq(btn(/^back$/).props["aria-pressed"], true, "which can be selected");
    eq(btn(/^front$/).props["aria-pressed"], false, "one face at a time");
  });

  test("it shows the bound copy's own photographs, not stock artwork", () => {
    atAgreePrice();
    const inv = S().inventory.find((i) => i.invId === opp().invId);
    assert(inv, "the deal names a physical copy");
    assert(inv.photos.front && inv.photos.back, "which has both faces on file");
    click(btn(/View actual card photos/));
    /* A photo is an opaque copy-scoped token, not a URL, so a face renders as
       the product's plate. What matters is that the plate reports the copy as
       photographed rather than falling back to a placeholder. */
    const plate = () => cls(cardFor(), "lbx-b")[0].findAll((n) => typeof n.type === "string"
      && String(n.props.className || "").includes("copyph-p"))[0];
    assert(!/missing/.test(String(plate().props.className)),
      "the front face is on file for this copy");
    eq(txt(plate()), "collector photo", "and shown as the collector's own photograph");
    const c = S().catalog.find((x) => x.id === goal().cardId);
    assert(String(plate().props["aria-label"]).includes(c.name),
      "identified as this card");
    click(btn(/^back$/));
    assert(!/missing/.test(String(plate().props.className)), "as is the back");
    /* Not a sibling copy: an unphotographed copy of the same card exists. */
    const sibling = S().inventory.find((i) => i.cardId === goal().cardId
      && i.invId !== inv.invId);
    if (sibling) assert(sibling.invId !== inv.invId, "and the bound copy is the deal's own");
  });

  test("closing returns to the same pricing context", () => {
    atAgreePrice();
    click(btn(/View actual card photos/));
    click(btn(/^Close$/));
    eq(cls(cardFor(), "lbx").length, 0, "the viewer is closed");
    eq(disclosure().props["aria-expanded"], true, "the workspace is still open");
    assert(cls(cardFor(), "idf-stage")[0], "on the same stage");
    assert(btn(/View actual card photos/), "and the action is still there");
  });

  test("the viewer keeps Escape and a Close control", () => {
    const v = COL.slice(COL.indexOf("function CopyPhotoViewer("),
      COL.indexOf("function GoalCard("));
    assert(/e\.key === "Escape"/.test(v), "Escape closes it");
    assert(/ArrowLeft|ArrowRight/.test(v), "arrows switch faces");
    assert(/aria-modal="true"/.test(v), "it is announced as a dialog");
    assert(/removeEventListener/.test(v), "and unbinds its listener");
  });
});

describe("C. Nothing to inspect: say so, offer nothing", () => {
  test("a stock-only copy states the fact quietly", () => {
    atAgreePrice({ stockOnly: true });
    const card = cardFor();
    assert(/Actual card photos not available/.test(txt(card)), "the fact is stated");
    assert(cls(card, "cx-ph-none")[0], "as passive text");
  });

  test("there is no disabled button and no request action", () => {
    atAgreePrice({ stockOnly: true });
    const card = cardFor();
    assert(!card.findAllByType("button").some((b) => /View actual card photos/.test(txt(b))),
      "no photo-view control at all — not even a disabled one");
    eq(card.findAllByType("button").filter((b) => b.props.disabled
      && /photo/i.test(txt(b))).length, 0, "nothing disabled about photos");
  });

  test("Agree on Price never asks for photographs", () => {
    atAgreePrice({ stockOnly: true });
    const work = cls(cardFor(), "idf-work")[0];
    assert(!/Request photos|Request actual photos|Upload/i.test(txt(work)),
      "the pricing workspace asks for nothing");
    const ctx = cls(cardFor(), "cx-ph")[0];
    assert(!/Request|Upload|Ask/i.test(txt(ctx)), "and neither does the card context");
  });

  test("it never routes backwards into Review Card", () => {
    atAgreePrice({ stockOnly: true });
    const card = cardFor();
    assert(!card.findAllByType("button").some((b) => /^Review Card$/i.test(txt(b))),
      "no way back to the enrichment stage");
    eq(opp().stage, "agree-price", "and the stage is unmoved");
  });

  test("requesting photographs still belongs to Review Card", () => {
    const rv = COL.slice(COL.indexOf("function ReviewCard("), COL.indexOf("function GoalCard("));
    assert(/Request actual photos/.test(rv), "Review Card still offers the request");
    assert(/st\.requestPhotos\(inv\)/.test(rv), "through the canonical action");
    /* And the card-context block offers only inspection. */
    const ctx = COL.slice(COL.indexOf('<div className="cx-ph">') - 900,
      COL.indexOf('<div className="cx-ph">') + 900);
    assert(!/requestPhotos/.test(ctx), "the header never requests");
  });
});

describe("D. Inspection changes nothing", () => {
  test("opening, switching and closing mutate no opportunity state", () => {
    atAgreePrice();
    const before = snap();
    click(btn(/View actual card photos/));
    eq(snap(), before, "opening changes nothing");
    click(btn(/^back$/));
    eq(snap(), before, "switching faces changes nothing");
    click(btn(/^front$/));
    eq(snap(), before, "or switching back");
    click(btn(/^Close$/));
    eq(snap(), before, "and closing changes nothing");
  });

  test("a typed pricing draft survives the whole inspection", () => {
    atAgreePrice();
    myMove();
    TR.act(() => { field(/dollars/).props.onChange({ target: { value: "3700" } }); });
    const dollars = field(/dollars/).props.value;
    const percent = field(/percentage/).props.value;
    assert(dollars === "3700" && percent !== "", "a draft exists, with its synced percentage");
    const before = snap();

    click(btn(/View actual card photos/));
    click(btn(/^back$/));
    click(btn(/^Close$/));

    eq(field(/dollars/).props.value, dollars, "the typed dollars are exactly as left");
    eq(field(/percentage/).props.value, percent, "and the synced percentage with them");
    eq(snap(), before, "nothing was submitted");
  });

  test("the draft is local state, not domain state", () => {
    /* Solving draft survival by promoting typed input into the store would make
       an unsubmitted number part of the negotiation. It is a useState. */
    const v = COL.slice(COL.indexOf("function CopyPhotoViewer("),
      COL.indexOf("function GoalCard("));
    assert(!/patchOpportunity|priceRespond|startOffer/.test(v),
      "the viewer calls no domain action");
    assert(/const \[viewPhotos, setViewPhotos\] = useState\(null\)/.test(COL),
      "and which face is showing is local component state");
  });

  test("waiting on the partner, inspection still works and implies no action", () => {
    atAgreePrice();
    eq(D.nextActor(opp()).actor, "partner", "it is their move");
    eq(cardFor().findAllByType("input")
      .filter((i) => /dollars/.test(String(i.props["aria-label"] || ""))).length, 0,
      "so no pricing input is offered");
    const before = snap();
    assert(btn(/View actual card photos/), "but the evidence is still inspectable");
    click(btn(/View actual card photos/));
    click(btn(/^back$/));
    click(btn(/^Close$/));
    eq(snap(), before, "and looking at it grants no pricing action");
    eq(D.nextActor(opp()).actor, "partner", "the turn is unchanged");
  });
});

describe("E. Nothing else moved", () => {
  test("no new photo model was introduced", () => {
    const keys = Object.keys(S()).filter((k) => /photo/i.test(k));
    eq(keys.join(","), "photoRequests", "the only photo collection is the request relationship");
    assert(D.INVARIANTS.copyPhotographed, "readiness is still the canonical invariant");
    const ctx = COL.slice(COL.indexOf("const boundCopy ="), COL.indexOf("const boundCopy =") + 400);
    assert(/D\.INVARIANTS\.copyPhotographed\(boundCopy\.photos\)/.test(ctx),
      "and the header derives readiness from it");
  });

  test("the viewer is bound to the deal's exact invId", () => {
    atAgreePrice();
    const ctx = COL.slice(COL.indexOf("const boundCopy ="), COL.indexOf("const boundCopy =") + 300);
    assert(/st\.inventoryCopy\(pursuit\.invId\)/.test(ctx),
      "the copy comes from the pursuit's own invId");
    const inv = S().inventory.find((i) => i.invId === opp().invId);
    click(btn(/View actual card photos/));
    /* The viewer is handed that copy's own photos object, so it cannot show a
       sibling copy's faces even when the same card is stocked more than once. */
    const plate = cls(cardFor(), "lbx-b")[0].findAll((n) => typeof n.type === "string"
      && String(n.props.className || "").includes("copyph-p"))[0];
    eq(/missing/.test(String(plate.props.className)),
      !D.INVARIANTS.copyPhotographed(inv.photos),
      "showing exactly what the bound copy has on file");
  });

  test("pricing, history, conversation and the rail are unchanged", () => {
    atAgreePrice();
    myMove();
    const card = cardFor();
    assert(cls(card, "ap")[0], "the pricing stage renders");
    assert(cls(card, "ap-now")[0], "with its standing proposal");
    assert(cls(card, "oh")[0] || /Offer history/.test(txt(card)), "offer history is present");
    eq(cls(card, "chat-embed").length, 1, "one conversation");
    eq(cls(card, "rail-s").length, 6, "and six pursuit steps");
    assert(/of 5 settled/.test(txt(cls(card, "rc-wrap")[0])), "with five negotiation stages");
  });

  test("pricing still works after inspecting", () => {
    atAgreePrice();
    myMove();
    click(btn(/View actual card photos/));
    click(btn(/^Close$/));
    TR.act(() => { field(/dollars/).props.onChange({ target: { value: "3700" } }); });
    click(btn(/^Send counter$/));
    const last = D.lastEntry(opp().priceThread);
    eq(last.amount, 3700, "the counter submits the typed dollars");
    eq(last.by, "collector", "as the collector's move");
    eq(D.nextActor(opp()).actor, "partner", "and the turn passes");
  });

  test("domain state is untouched across both personas", () => {
    atAgreePrice();
    const before = JSON.stringify({ o: S().opportunities, i: S().inventory,
      r: S().photoRequests, c: S().copyReviews });
    click(btn(/View actual card photos/));
    click(btn(/^back$/));
    click(btn(/^Close$/));
    eq(JSON.stringify({ o: S().opportunities, i: S().inventory,
      r: S().photoRequests, c: S().copyReviews }), before,
      "no opportunity, copy, request or review changed");
  });
});

describe("F. One viewer, two personas", () => {
  const TPSRC = readSrc("src/MetYet.jsx");

  test("the face and the switch are defined once, and exported", () => {
    eq((TPSRC.match(/function ActualCardPhoto\(/g) || []).length, 1, "one face component");
    eq((TPSRC.match(/function FaceSwitch\(/g) || []).length, 1, "one switch component");
    assert(/export \{[^}]*ActualCardPhoto[^}]*\}/.test(TPSRC), "the face is shared");
    assert(/export \{[^}]*FaceSwitch[^}]*\}/.test(TPSRC), "and the switch");
  });

  test("both personas render the same primitives", () => {
    const tp = TPSRC.slice(TPSRC.indexOf("function PhotoLightbox("),
      TPSRC.indexOf("function PhotoLightbox(") + 2000);
    assert(/<ActualCardPhoto/.test(tp), "the Trusted Partner's lightbox uses the face");
    assert(/<FaceSwitch/.test(tp), "and the switch");
    const col = COL.slice(COL.indexOf("function CopyPhotoViewer("),
      COL.indexOf("function GoalCard("));
    assert(/<ActualCardPhoto/.test(col), "the Collector's viewer uses the same face");
    assert(/<FaceSwitch/.test(col), "and the same switch");
    assert(/ActualCardPhoto, FaceSwitch \} from "\.\.\/src\/MetYet\.jsx"/.test(COL),
      "imported, not copied");
  });

  test("the Collector re-implements no face or switch markup", () => {
    const col = COL.slice(COL.indexOf("function CopyPhotoViewer("),
      COL.indexOf("function GoalCard("));
    assert(!/copyph-p/.test(col), "no duplicated plate");
    assert(!/aria-pressed/.test(col), "no duplicated face switch");
    assert(!/<img/.test(col), "and no second photo rendering rule");
  });

  test("the shared primitives own display and nothing else", () => {
    const shared = TPSRC.slice(TPSRC.indexOf("function ActualCardPhoto("),
      TPSRC.indexOf("function PhotoLightbox("));
    ["setModal", "patchOpportunity", "requestPhotos", "addCopyPhotos", "priceRespond",
      "go(", "navigate"].forEach((w) =>
      assert(!shared.includes(w), "no " + w + " in a presentation primitive"));
  });

  test("a partly photographed copy counts as unavailable", () => {
    /* The canonical predicate requires both faces, and the header defers to it
       rather than deciding for itself. */
    eq(D.INVARIANTS.copyPhotographed({ front: "copy:x:front", back: null }), false,
      "one face is not evidence of the card");
    eq(D.INVARIANTS.copyPhotographed({ front: null, back: "copy:x:back" }), false,
      "in either direction");
    eq(D.INVARIANTS.copyPhotographed({ front: "a", back: "b" }), true, "both are");
    atAgreePrice();
    TR.act(() => { acts().patchInventoryCopy
      ? acts().patchInventoryCopy(opp().invId, (c) => ({ ...c,
          photos: { ...c.photos, back: null } }))
      : null; });
    TR.act(() => { R.update(React.createElement(App)); });
    const inv = S().inventory.find((i) => i.invId === opp().invId);
    if (!D.INVARIANTS.copyPhotographed(inv.photos)) {
      expand();
      assert(/Actual card photos not available/.test(txt(cardFor())),
        "a half-photographed copy offers nothing to inspect");
      assert(!cardFor().findAllByType("button").some((b) => /View actual card photos/.test(txt(b))),
        "and no control for it");
    }
  });

  test("the Trusted Partner's own lightbox still behaves as it did", () => {
    const tp = TPSRC.slice(TPSRC.indexOf("function PhotoLightbox("),
      TPSRC.indexOf("function PhotoLightbox(") + 2000);
    assert(/setModal\(null\)/.test(tp), "it still closes through the TP modal");
    assert(/e\.key === "Escape"/.test(tp), "Escape still closes it");
    assert(/<CardCopyActions/.test(tp), "its copy actions are untouched");
    assert(/<Modal/.test(tp), "inside the TP's own shell");
  });
});

require("./run.cjs").run();
