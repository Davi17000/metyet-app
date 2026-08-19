/* ============================================================================
   ONE SURFACE OWNS THE PURSUIT

   Discovery chooses the partner. Review Card owns the pursuit. From then on,
   forward actions happen in the Goal workspace.

   The problem this closes: a Goal with a live Review Card still showed a
   "Make an offer" button in its supply section, which opened the discovery
   sheet — a second, disconnected way to make the same offer against the same
   copy. Two surfaces, one pursuit, and no way to tell which one was real.

   The rule is now expressed once, as a question the UI asks: does
   `pursuitFor(goalId)` return anything? If it does, the workspace owns every
   forward action and every other surface yields. Chat is untouched throughout —
   talking to somebody is not a forward action.

   This is presentation and routing only. No domain action, invariant or
   projection changed.
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
const SRC = readSrc("collector/MetYetCollector.jsx");
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
const AT = "2026-08-19";
const S = () => __store.get().get();
const acts = () => __store.get().actions;
const view = () => collectorView(S(), ME);
const goal = () => view().myGoals().find((g) => /^Review deal/.test(g.note || ""));
const copy = () => view().partnersWith(goal().cardId)[0].inv;

const boot = (stage) => { __store.reset(M.buildCanonicalSeed({ review: true, demoStage: stage }));
  let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r; };
const remount = () => { let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r; };
const cardFor = (r) => {
  const c = S().catalog.find((x) => x.id === goal().cardId);
  return cls(r, "goal").find((n) => txt(n).includes(c.name) && txt(n).includes(c.set));
};
/* Every button on the Goal card that would begin or re-begin an offer. */
const offerCTAs = (r) => cardFor(r).findAllByType("button")
  .map(txt).filter((t) => /^Make an offer/.test(t));
const expand = (r) => { click(cardFor(r).findAllByType("button")
  .find((b) => String(b.props.className || "").includes("goal-deal"))); return cardFor(r); };
/* Two shapes of the same route: an expanded supply list with its own CTA before
   a pursuit exists, and a compact "See all N partners" row once one does. */
const openDiscovery = (r) => {
  const card = cardFor(r);
  const b = cls(card, "goal-holders")[0]
    || cls(card, "gs-offer")[0]
    || card.findAllByType("button").find((x) => /See all/.test(txt(x)));
  assert(b, "a discovery route exists");
  click(b);
  return r;
};
const ask = () => { const i = copy();
  TR.act(() => { acts().requestPhotos({ collectorId: ME, partnerId: i.partnerId,
    invId: i.invId, at: AT }); }); };
const photograph = () => { const i = copy();
  TR.act(() => { acts().addCopyPhotos({ invId: i.invId, front: "f", back: "b", at: AT }); }); };

describe("A. Before a pursuit, discovery still does its job", () => {
  test("the Goal offers a route into partner discovery", () => {
    const r = boot("pre-deal");
    eq(view().pursuitFor(goal().id), null, "nothing is being pursued yet");
    assert(offerCTAs(r).length >= 1 || cls(cardFor(r), "gs-offer")[0],
      "and the Goal still leads somewhere to choose a partner");
  });

  test("discovery presents the forward actions for choosing a copy", () => {
    const r = boot("pre-deal");
    openDiscovery(r);
    /* CONTRACT CHANGE: discovery selects a copy to review; the forward actions
       then live in Review Card on the Goal. */
    const labels = r.root.findAllByType("button").map(txt);
    assert(labels.some((t) => t === "Review card"), "a way to choose a copy");
    assert(!labels.some((t) => /^Make an offer/.test(t)),
      "and no offer workflow in discovery");
    assert(labels.some((t) => /^(Chat|Continue chatting)$/.test(t)), "and to talk first");
    assert(/Chatting is just a conversation/.test(txt(r.root)),
      "with the copy that explains a decision not yet made");
  });

  test("multi-partner discovery is not removed", () => {
    const r = boot("pre-deal");
    openDiscovery(r);
    assert(cls(r, "pick").length >= 1, "partners are listed for comparison");
    assert(/of your partners/.test(txt(r.root)), "and counted");
  });
});

describe("B. A Review Card pursuit takes ownership", () => {
  test("the duplicate lower Make an offer disappears", () => {
    const r = boot("pre-deal");
    eq(cls(cardFor(r), "gs-offer").length, 1, "before the pursuit it is there");
    ask();
    const r2 = remount();
    eq(cls(cardFor(r2), "gs-offer").length, 0, "and once reviewing, it is gone");
    eq(offerCTAs(r2).length, 0, "with no offer CTA at all on the collapsed Goal");
  });

  test("supply becomes supporting context, not a second workflow", () => {
    const r = boot("pre-deal");
    ask();
    const r2 = remount();
    const card = cardFor(r2);
    assert(cls(card, "goal-holders")[0], "supply is still reachable");
    assert(/See all .* partner/.test(txt(cls(card, "goal-holders")[0])),
      "as a compact discovery row");
    eq(cls(card, "goal-supply").length, 0, "not as an actionable supply list");
  });

  test("waiting on photos: the only forward action is inside Review Card", () => {
    const r = boot("pre-deal");
    ask();
    const r2 = remount();
    const card = expand(r2);
    eq(offerCTAs(r2).join(","), "Make an offer without photos",
      "exactly one, and it is the review's own quieter path");
    assert(/Waiting on/.test(txt(cls(card, "idf-h")[0])), "the workspace states the wait");
    assert(cls(card, "rv-face").length === 2, "and shows both faces as awaited");
  });

  test("photos ready: exactly one canonical Make an offer", () => {
    const r = boot("pre-deal");
    ask();
    photograph();
    const r2 = remount();
    expand(r2);
    eq(offerCTAs(r2).join(","), "Make an offer", "one action, in the workspace");
    eq(offerCTAs(r2).length, 1, "and only one");
  });

  test("discovery yields to the workspace for the pursued copy", () => {
    const r = boot("pre-deal");
    ask();
    const r2 = remount();
    openDiscovery(r2);
    const labels = r2.root.findAllByType("button").map(txt);
    eq(labels.filter((t) => /^Make an offer/.test(t)).length, 0,
      "no offer can be started from discovery while a pursuit exists");
    eq(labels.filter((t) => /^Request photos$/.test(t)).length, 0,
      "and no second request either");
    assert(labels.some((t) => t === "Open Review Card"), "it points back at the workspace");
  });

  test("the discovery explanation gives way to the pursuit's own context", () => {
    const r = boot("pre-deal");
    ask();
    const r2 = remount();
    openDiscovery(r2);
    assert(!/Chatting is just a conversation/.test(txt(r2.root)),
      "the deciding-whether-to-engage copy is gone");
    assert(/You're reviewing/.test(txt(r2.root)), "replaced by where the pursuit stands");
  });

  test("Chat survives everywhere", () => {
    const r = boot("pre-deal");
    ask();
    const r2 = remount();
    openDiscovery(r2);
    assert(r2.root.findAllByType("button").some((b) => /^(Chat|Continue chatting)$/.test(txt(b))),
      "talking to a partner is never a forward action, so it stays");
    const r3 = remount();
    expand(r3);
    eq(cls(cardFor(r3), "chat-embed").length, 1, "and the workspace has its own conversation");
  });
});

describe("C. Later stages cannot reopen an initial offer", () => {
  ["agree-price", "select-trade", "value-trade", "deal", "fulfillment"].forEach((stage) => {
    test(stage + ": no initial-offer route on the Goal or in discovery", () => {
      const r = boot(stage);
      eq(offerCTAs(r).length, 0, "none on the Goal card");
      eq(cls(cardFor(r), "gs-offer").length, 0, "and no supply CTA");
      openDiscovery(r);
      eq(r.root.findAllByType("button").map(txt).filter((t) => /^Make an offer/.test(t)).length, 0,
        "nor any in discovery");
    });
  });

  test("the current deal is reachable, and stop/cancel is unchanged", () => {
    const r = boot("agree-price");
    openDiscovery(r);
    assert(r.root.findAllByType("button").some((b) => txt(b) === "View Deal"),
      "discovery points at the live deal rather than a new offer");
    const r2 = remount();
    click(cls(cardFor(r2), "goal-edit-b")[0]);
    eq(cls(cardFor(r2), "goal-stop").length, 1, "and stopping is still one route, in the menu");
  });

  test("the one-negotiation rule still holds in the domain", () => {
    boot("agree-price");
    const g = goal();
    const o = D.activeOppForGoal(g.id, S().opportunities);
    const res = acts().startOpportunity({ goalId: g.id, collectorId: ME,
      partnerId: o.partnerId, cardId: g.cardId, invId: o.invId,
      listedPrice: 100, amount: 90, at: AT });
    eq(res.refused, D.REFUSE.alreadyNegotiating, "a second offer is refused as before");
  });
});

describe("D. The handoffs still work end to end", () => {
  test("discovery request photos hands ownership to the Goal", () => {
    const r = boot("pre-deal");
    const opps = S().opportunities.length;
    openDiscovery(r);
    const pick = r.root.findAllByType("button").find((b) => txt(b) === "Review card");
    assert(pick, "discovery offers the copy for review");
    click(pick);
    eq(S().opportunities.length, opps, "no negotiation was created");
    const p = view().pursuitFor(goal().id);
    assert(p && p.kind === "review", "a Review Card pursuit now exists");
    const r2 = remount();
    eq(cls(cardFor(r2), "gs-offer").length, 0, "and the Goal has taken ownership");
  });

  test("discovery initial offer advances to Agree on Price", () => {
    const r = boot("pre-deal");
    const i = copy();
    const oid = acts().startOpportunity({ goalId: goal().id, collectorId: ME,
      partnerId: i.partnerId, cardId: goal().cardId, invId: i.invId,
      listedPrice: i.ask, amount: 3700, at: AT });
    assert(typeof oid === "string", "the canonical offer path created it");
    const p = view().pursuitFor(goal().id);
    eq(p.kind, "deal", "the pursuit is now a negotiation");
    eq(p.step, "agree-price", "at Agree on Price");
    const r2 = remount();
    eq(offerCTAs(r2).length, 0, "and no initial-offer surface remains");
  });

  test("proceed-without-photos advances, fabricating nothing", () => {
    const r = boot("pre-deal");
    ask();
    const r2 = remount();
    const card = expand(r2);
    click(card.findAllByType("button").find((b) => txt(b) === "Make an offer without photos"));
    assert(/Make an offer without actual photos\?/.test(txt(cardFor(r2))),
      "the lightweight confirmation appears");
    const i = copy();
    eq(D.INVARIANTS.copyPhotographed(i.photos), false, "and no photos were invented");
    /* Continuing routes to the canonical offer sheet, not a parallel one. */
    const rv = SRC.slice(SRC.indexOf("function ReviewCard("), SRC.indexOf("function GoalCard("));
    assert(/go\(\{ v: "offer", goalId: g\.id, partnerId: partner\.id \}\)/.test(rv),
      "it uses the one canonical offer route");
  });
});

describe("E. Nothing underneath moved", () => {
  test("no domain action, invariant or projection changed", () => {
    ["requestPhotos", "addCopyPhotos", "startOpportunity"].forEach((fn) =>
      assert(new RegExp(fn + "\\(").test(readSrc("domain/metyet-store.js")),
        fn + " is still the canonical action"));
    assert(D.INVARIANTS.copyPhotographed, "the photo invariant is intact");
    eq(D.PURSUIT_STEPS.length, 6, "six visible pursuit steps");
    eq(D.RECEIPT_STAGES.length, 5, "and five negotiation stages");
  });

  test("photo requests and copy photos are still copy-specific", () => {
    boot("pre-deal");
    ask();
    const i = copy();
    const r = S().photoRequests.find((x) => x.invId === i.invId);
    assert(r, "the request names the exact copy");
    photograph();
    const siblings = S().inventory.filter((x) => x.cardId === i.cardId && x.invId !== i.invId
      && !x.archived);
    siblings.forEach((x) => eq(D.INVARIANTS.copyPhotographed(x.photos), false,
      "an identical sibling copy is untouched"));
  });

  test("Agree on Price is unchanged", () => {
    const r = boot("agree-price");
    const card = expand(r);
    assert(cls(card, "ap")[0], "the pricing stage renders");
    assert(cls(card, "ap-now")[0], "with its standing-proposal block");
    eq(cls(card, "idf-mid").length, 0, "and no details column");
    assert(/of 5 settled/.test(txt(cls(card, "rc-wrap")[0])),
      "the negotiation receipt still counts five");
    eq(cls(card, "rail-s").length, 6, "while the pursuit rail shows six");
  });

  test("the ownership rule is asked once, from the canonical projection", () => {
    assert(/const pursuit = st\.pursuitFor\(goalId\)/.test(SRC),
      "discovery asks the projection");
    assert(/const pursuit = st\.pursuitFor\(g\.id\)/.test(SRC),
      "and so does the Goal card");
    assert(!/photoRequests\.find/.test(SRC),
      "neither re-derives pursuit from raw state");
  });
});

require("./run.cjs").run();
