/* ============================================================================
   DISCOVERY CHOOSES; REVIEW CARD DECIDES

   Two different questions, asked in two different places:

     discovery    which copy do I want to look at?
     Review Card  do I want this one, and what will I pay?

   Discovery used to answer both — its partner row ran the whole offer workflow
   in a modal, so choosing a copy and committing money were the same click. Now
   selecting a copy opens the pursuit on the Goal, and every forward action
   lives there.

   Making that work needed one new fact: WHICH COPY the collector is looking at,
   before they have asked for anything or offered anything. That is
   `copyReviews` — deliberately not `photoRequests`, because the partner's
   inventory reads open requests as demand, and merely deciding to look at a
   card must not put a job on somebody's shelf.
   ========================================================================= */

process.env.METYET_DEV = "1";

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const D = require("../domain/metyet-domain.js");
const { createStore } = require("../domain/metyet-store.js");
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
const copies = () => S().inventory.filter((i) => i.cardId === goal().cardId && !i.archived);
const copy = () => view().partnersWith(goal().cardId)[0].inv;
const pursuit = () => view().pursuitFor(goal().id);

const boot = (stage) => { __store.reset(M.buildCanonicalSeed({ review: true, demoStage: stage }));
  let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r; };
const remount = () => { let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r; };
const cardFor = (r) => {
  const c = S().catalog.find((x) => x.id === goal().cardId);
  return cls(r, "goal").find((n) => txt(n).includes(c.name) && txt(n).includes(c.set));
};
/* CONTRACT CHANGE. The partners who have the card are listed on the Goal
   itself, and each row carries its own Review Card — so choosing no longer
   goes through a sheet that asks the same question again. Once a pursuit
   exists the list collapses to a compact row that opens the read-only sheet. */
const inlineRows = (r) => cls(cardFor(r), "gs-row");
const rowFor = (r, i) => inlineRows(r)[i || 0];
const chooseIn = (node) => node.findAllByType("button")
  .find((b) => /^Review Card$/i.test(txt(b)));
/* Selecting a copy the way the collector now does: on the row, in place. */
const choose = (r, i) => { click(chooseIn(rowFor(r, i))); return r; };
const discoveryRoute = (r) => cls(cardFor(r), "goal-holders")[0];
const openDiscovery = (r) => { const b = discoveryRoute(r); if (b) click(b); return r; };
const labels = (r) => r.root.findAllByType("button").map(txt);
const expand = (r) => { click(cardFor(r).findAllByType("button")
  .find((b) => String(b.props.className || "").includes("goal-deal"))); return cardFor(r); };
const offerCTAs = (r) => cardFor(r).findAllByType("button")
  .map(txt).filter((t) => /^Make an offer/.test(t));

/* A world where the same partner holds a graded copy and a raw one. */
const CARD_G = { id: "kg", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };
const CARD_R = { id: "kr", name: "Blastoise", set: "Base Set", number: "2", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "Raw", condition: "NM" };
const mixed = () => createStore({
  catalog: [CARD_G, CARD_R],
  collectors: [{ id: ME, name: "Casey", prefs: [] }],
  partners: [{ id: "p2", name: "Northline Cards" }, { id: "p3", name: "Complete Collectibles" }],
  goals: [], binder: [], interests: [], conversations: [], opportunities: [],
  preferences: [], photoRequests: [], copyReviews: [],
  inventory: [
    { invId: "g-stock", partnerId: "p2", cardId: "kg", ask: 4200, archived: false,
      photos: { front: null, back: null } },
    { invId: "g-other", partnerId: "p3", cardId: "kg", ask: 4400, archived: false,
      photos: { front: null, back: null } },
    { invId: "r-stock", partnerId: "p2", cardId: "kr", ask: 800, archived: false,
      photos: { front: null, back: null } },
  ],
});
const goalIn = (st, cardId) => st.actions.addGoal({ collectorId: ME, cardId, tier: "primary", at: AT });

describe("A. Choosing a copy is what opens Review Card", () => {
  test("before choosing, there is no pursuit", () => {
    const st = mixed();
    const gid = goalIn(st, "kg");
    eq(collectorView(st.get(), ME).pursuitFor(gid), null,
      "matching supply alone is not pursuit");
  });

  test("choosing a copy opens Review Card, with nothing else created", () => {
    const st = mixed();
    const gid = goalIn(st, "kg");
    const id = st.actions.reviewCopy({ collectorId: ME, partnerId: "p2", invId: "g-stock", at: AT });
    assert(typeof id === "string", "a review was recorded");
    const p = collectorView(st.get(), ME).pursuitFor(gid);
    assert(p, "the pursuit exists");
    eq(p.kind, "review", "of the reviewing kind");
    eq(p.step, "review-card", "at step one");
    eq(st.get().opportunities.length, 0, "no opportunity");
    eq(st.get().photoRequests.length, 0, "and crucially, no photo request");
  });

  test("it does not ask the partner for anything", () => {
    /* The partner's shelf reads OPEN REQUESTS as work to do. Looking at a card
       is not a job, so it must not appear as one. */
    const st = mixed();
    goalIn(st, "kg");
    st.actions.reviewCopy({ collectorId: ME, partnerId: "p2", invId: "g-stock", at: AT });
    eq(st.get().photoRequests.filter((r) => r.invId === "g-stock" && !r.fulfilledAt).length, 0,
      "no demand was created on the partner's inventory");
  });

  test("it is bound to the exact collector, partner and copy", () => {
    const st = mixed();
    const gid = goalIn(st, "kg");
    st.actions.reviewCopy({ collectorId: ME, partnerId: "p2", invId: "g-stock", at: AT });
    const r = st.get().copyReviews[0];
    eq(r.collectorId, ME, "the collector");
    eq(r.partnerId, "p2", "the partner");
    eq(r.invId, "g-stock", "and the exact physical copy");
    eq(r.endedAt, null, "still open");
    /* Never attached to card identity: the sibling copy is untouched, even
       though it is the same card from a different partner. */
    const p = collectorView(st.get(), ME).pursuitFor(gid);
    eq(p.invId, "g-stock", "the pursuit names the chosen copy");
    assert(p.invId !== "g-other", "and not the other partner's copy of the same card");
  });

  test("choosing twice does not pile up", () => {
    const st = mixed();
    goalIn(st, "kg");
    const a = st.actions.reviewCopy({ collectorId: ME, partnerId: "p2", invId: "g-stock", at: AT });
    const b = st.actions.reviewCopy({ collectorId: ME, partnerId: "p2", invId: "g-stock", at: AT });
    eq(a, b, "the same review is returned");
    eq(st.get().copyReviews.length, 1, "one record, not two");
  });

  test("an unavailable copy cannot be taken up", () => {
    const st = mixed();
    goalIn(st, "kg");
    st.actions.removeInventoryCopy("g-stock");
    eq(st.actions.reviewCopy({ collectorId: ME, partnerId: "p2", invId: "g-stock", at: AT }).refused,
      D.REFUSE.copyUnavailable, "refused");
  });

  test("it can be abandoned without touching anything else", () => {
    const st = mixed();
    const gid = goalIn(st, "kg");
    const id = st.actions.reviewCopy({ collectorId: ME, partnerId: "p2", invId: "g-stock", at: AT });
    st.actions.endReview(id, AT);
    eq(collectorView(st.get(), ME).pursuitFor(gid), null, "the pursuit is over");
    eq(st.get().opportunities.length, 0, "and nothing was created or destroyed elsewhere");
  });

  test("asking for photos still opens a review on its own", () => {
    /* Backwards compatible: a pursuit begun the old way reads correctly. */
    const st = mixed();
    const gid = goalIn(st, "kg");
    st.actions.requestPhotos({ collectorId: ME, partnerId: "p2", invId: "g-stock", at: AT });
    const p = collectorView(st.get(), ME).pursuitFor(gid);
    assert(p && p.kind === "review", "the pursuit exists");
    eq(p.invId, "g-stock", "on the copy that was asked about");
    eq(st.get().copyReviews.length, 1, "and the two stay in step");
  });
});

describe("B. Discovery selects; it does not negotiate", () => {
  test("the discovery row offers Review card, not an offer workflow", () => {
    const r = boot("pre-deal");
    openDiscovery(r);
    const seen = labels(r);
    assert(seen.some((t) => /^Review Card$/i.test(t)), "a way to choose a copy");
    eq(seen.filter((t) => /^Make an offer/.test(t)).length, 0,
      "and no offer workflow in discovery");
  });

  test("the Goal's own discovery CTA says what it does", () => {
    const r = boot("pre-deal");
    const cta = cls(cardFor(r), "gs-offer")[0];
    if (cta) eq(txt(cta), "Choose a copy to review",
      "it opens discovery, so it says so rather than promising an offer");
  });

  test("selecting from discovery lands the pursuit on the Goal", () => {
    const r = boot("pre-deal");
    const opps = S().opportunities.length;
    choose(r);
    eq(S().opportunities.length, opps, "no negotiation was created");
    const p = pursuit();
    assert(p && p.kind === "review", "a Review Card pursuit exists");
    const r2 = remount();
    assert(/Deal Flow · Review Card/.test(txt(cls(cardFor(r2), "goal-deal")[0])),
      "and the Goal shows it immediately, without a photo request first");
  });

  test("no photo request is created merely by selecting", () => {
    const r = boot("pre-deal");
    choose(r);
    eq(S().photoRequests.length, 0, "the partner has not been asked for anything");
  });

  test("multi-partner comparison survives, on the Goal itself", () => {
    const r = boot("pre-deal");
    const rows = inlineRows(r);
    assert(rows.length >= 1, "every partner who has the card is listed");
    rows.forEach((n) => {
      assert(chooseIn(n), "each with its own way in");
      assert(n.findAllByType("button").some((b) => /^(Chat|Continue chatting)$/.test(txt(b))),
        "and its own way to talk first");
      assert(/\$/.test(txt(n)), "and its asking price to compare");
    });
  });

  test("choosing a different partner reviews that partner's copy", () => {
    const st = mixed();
    const gid = goalIn(st, "kg");
    st.actions.reviewCopy({ collectorId: ME, partnerId: "p3", invId: "g-other", at: AT });
    const p = collectorView(st.get(), ME).pursuitFor(gid);
    eq(p.invId, "g-other", "the exact copy chosen");
    eq(p.partnerId, "p3", "and that partner");
  });
});

describe("C. Review Card entry states", () => {
  test("a freshly selected copy is the collector's move, not a wait", () => {
    /* Nothing has been asked of the partner yet, so saying "Waiting on them"
       would be false — and would hide the fact that the next move is a choice. */
    const r = boot("pre-deal");
    choose(r);
    const r2 = remount();
    eq(txt(cls(cardFor(r2), "goal-deal-t")[0]), "Your move", "the move is theirs to make");
    const card = expand(r2);
    const acts2 = card.findAllByType("button").map(txt).filter((t) => /photos|offer/i.test(t));
    assert(acts2.includes("Request actual photos"), "asking to see it is offered");
    assert(acts2.includes("Make an offer without photos"), "and so is proceeding");
    assert(/hasn't photographed this copy/.test(txt(card)), "with the reason stated plainly");
  });

  test("asking hands the move to the partner", () => {
    const r = boot("pre-deal");
    choose(r);
    let r2 = remount();
    click(expand(r2).findAllByType("button").find((b) => txt(b) === "Request actual photos"));
    r2 = remount();
    assert(/Waiting on/.test(txt(cls(cardFor(r2), "goal-deal-t")[0])), "now it is their move");
    eq(S().photoRequests.length, 1, "one request was made");
    eq(S().opportunities.filter((o) => o.goalId === goal().id).length, 0, "and no negotiation");
  });

  test("stock-only leads with asking to see the card", () => {
    const r = boot("pre-deal");
    choose(r);
    const r2 = remount();
    const card = expand(r2);
    eq(offerCTAs(r2).join(","), "Make an offer without photos",
      "proceeding is possible, but it is the quieter path");
    assert(cardFor(r2).findAllByType("button").some((b) => txt(b) === "Request actual photos"),
      "with asking to see the card offered alongside");
    assert(cls(card, "rv-face").length === 2, "both faces are shown as awaited");
    assert(/Awaiting photo/.test(txt(card)), "and said so plainly");
  });

  test("a raw copy says its condition is not established", () => {
    const rv = SRC.slice(SRC.indexOf("function ReviewCard("), SRC.indexOf("function GoalCard("));
    assert(/raw, so its condition is not established/.test(rv),
      "raw copies say photos are the only way to judge");
    assert(/graded \$\{c\.grade\}/.test(rv) || /graded \${c.grade}/.test(rv),
      "graded copies say what the grade already establishes");
    assert(/graded \? " pri" : ""/.test(rv),
      "and only a graded copy reads as ready to offer on without photos");
  });

  test("photos-ready leads with the offer", () => {
    const r = boot("pre-deal-ready");
    choose(r);
    const r2 = remount();
    expand(r2);
    eq(offerCTAs(r2).join(","), "Make an offer", "exactly one, and it is the offer");
    assert(/Photos of actual card/.test(txt(cardFor(r2))), "with the actual photos");
  });

  test("requesting photos from Review Card uses the canonical action", () => {
    const st = mixed();
    const gid = goalIn(st, "kg");
    st.actions.reviewCopy({ collectorId: ME, partnerId: "p2", invId: "g-stock", at: AT });
    const opps = st.get().opportunities.length;
    st.actions.requestPhotos({ collectorId: ME, partnerId: "p2", invId: "g-stock", at: AT });
    eq(st.get().opportunities.length, opps, "no negotiation was created");
    const p = collectorView(st.get(), ME).pursuitFor(gid);
    eq(p.step, "review-card", "still step one");
    eq(p.who, "partner", "now waiting on them");
    eq(st.get().copyReviews.length, 1, "and no second review was opened");
  });
});

describe("D. Offering happens in Review Card", () => {
  test("proceed-without-photos confirms, then stays in the workspace", () => {
    const r = boot("pre-deal");
    choose(r);
    const r2 = remount();
    const card = expand(r2);
    click(card.findAllByType("button").find((b) => txt(b) === "Make an offer without photos"));
    assert(/Make an offer without actual photos\?/.test(txt(cardFor(r2))),
      "the lightweight confirmation appears");
    assert(/Keep waiting/.test(txt(cardFor(r2))), "with a way back");
    eq(S().opportunities.filter((o) => o.goalId === goal().id).length, 0,
      "and nothing is created by asking");
    eq(D.INVARIANTS.copyPhotographed(copy().photos), false, "no photos were invented");
  });

  test("submitting the offer advances the same pursuit to Agree on Price", () => {
    const st = mixed();
    const gid = goalIn(st, "kg");
    st.actions.reviewCopy({ collectorId: ME, partnerId: "p2", invId: "g-stock", at: AT });
    const oid = st.actions.startOpportunity({ goalId: gid, collectorId: ME, partnerId: "p2",
      cardId: "kg", invId: "g-stock", listedPrice: 4200, amount: 3700, at: AT });
    assert(typeof oid === "string", "one opportunity was created");
    eq(st.get().opportunities.length, 1, "exactly one");
    const p = collectorView(st.get(), ME).pursuitFor(gid);
    eq(p.kind, "deal", "the pursuit became a negotiation");
    eq(p.step, "agree-price", "at Agree on Price");
    eq(p.invId, "g-stock", "against the same copy");
    eq(p.partnerId, "p2", "with the same partner");
  });

  test("Review Card reads as settled once the deal exists", () => {
    const r = boot("pre-deal-ready");
    choose(r);
    const inv = copy();
    TR.act(() => { acts().startOpportunity({ goalId: goal().id, collectorId: ME,
      partnerId: inv.partnerId, cardId: goal().cardId, invId: inv.invId,
      listedPrice: inv.ask, amount: 3700, at: AT }); });
    const r2 = remount();
    const states = cls(cardFor(r2), "rail-s").map((n) =>
      (String(n.props.className).includes("current") ? "current"
        : String(n.props.className).includes("done") ? "done" : "pending"));
    eq(states[0], "done", "Review Card is behind us");
    eq(states[1], "current", "Agree on Price is current");
    eq(offerCTAs(r2).length, 0, "and no initial-offer surface remains");
  });
});

describe("E. The legacy modal is gone from this flow", () => {
  test("only Review Card routes to the offer sheet", () => {
    const routes = [...SRC.matchAll(/v: "offer"/g)].map((m) => m.index);
    eq(routes.length, 2, "exactly two routes remain");
    const rv = [SRC.indexOf("function ReviewCard("), SRC.indexOf("function GoalCard(")];
    routes.forEach((ix) => assert(ix > rv[0] && ix < rv[1],
      "and both are inside ReviewCard"));
  });

  test("the old discovery-row control was removed, not merely unused", () => {
    assert(!/function CopyAction\(/.test(SRC), "CopyAction no longer exists");
    assert(!/<CopyAction/.test(SRC), "and nothing references it");
  });

  test("the Goal keeps the information discovery was good at", () => {
    const r = boot("pre-deal");
    const rows = inlineRows(r);
    assert(rows.length >= 1, "the partners are on the Goal");
    assert(/\$/.test(txt(cardFor(r))), "with listed prices to compare");
    assert(rows.some((n) => n.findAllByType("button")
      .some((b) => /^(Chat|Continue chatting)$/.test(txt(b)))), "and Chat");
    /* The fuller sheet is still reachable once a pursuit exists, for the
       partners not being pursued. */
    choose(r);
    assert(discoveryRoute(r), "and the compact route to the full list remains");
    openDiscovery(r);
    assert(cls(r, "ph-note").length >= 1, "where stock vs actual photo state is shown");
  });
});

describe("F. Nothing underneath moved", () => {
  test("the pursuit projection is still the single source", () => {
    assert(/const pursuit = st\.pursuitFor\(g\.id\)/.test(SRC), "the Goal asks it");
    assert(/const pursuit = st\.pursuitFor\(goalId\)/.test(SRC), "and discovery asks it");
    eq(D.PURSUIT_STEPS.length, 6, "six visible pursuit steps");
    eq(D.RECEIPT_STAGES.length, 5, "and five negotiation stages");
    assert(!D.STAGES.some((x) => x.id === "review-card"),
      "review-card is still never an opportunity stage");
  });

  test("copy photos and requests are unchanged", () => {
    const st = mixed();
    goalIn(st, "kg");
    st.actions.reviewCopy({ collectorId: ME, partnerId: "p2", invId: "g-stock", at: AT });
    st.actions.requestPhotos({ collectorId: ME, partnerId: "p2", invId: "g-stock", at: AT });
    eq(st.actions.addCopyPhotos({ invId: "g-stock", front: "f", at: AT }), false,
      "front alone is still not enough");
    eq(st.actions.addCopyPhotos({ invId: "g-stock", back: "b", at: AT }), true, "both faces are");
    assert(st.get().photoRequests[0].fulfilledAt, "and the ask resolves");
    eq(D.INVARIANTS.copyPhotographed(st.get().inventory
      .find((i) => i.invId === "g-other").photos), false,
      "while the sibling copy stays untouched");
  });

  test("one active negotiation per goal still holds", () => {
    const st = mixed();
    const gid = goalIn(st, "kg");
    st.actions.startOpportunity({ goalId: gid, collectorId: ME, partnerId: "p2",
      cardId: "kg", invId: "g-stock", listedPrice: 4200, amount: 3700, at: AT });
    const second = st.actions.startOpportunity({ goalId: gid, collectorId: ME, partnerId: "p3",
      cardId: "kg", invId: "g-other", listedPrice: 4400, amount: 3800, at: AT });
    eq(second.refused, D.REFUSE.alreadyNegotiating, "a second is refused as before");
  });

  test("Agree on Price is unchanged", () => {
    const r = boot("agree-price");
    const card = expand(r);
    assert(cls(card, "ap")[0], "the pricing stage renders");
    assert(cls(card, "ap-now")[0], "with its standing-proposal block");
    assert(/of 5 settled/.test(txt(cls(card, "rc-wrap")[0])), "five settled stages");
    eq(cls(card, "rail-s").length, 6, "and six pursuit steps");
  });
});

require("./run.cjs").run();
