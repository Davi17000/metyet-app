/* ============================================================================
   REVIEW CARD — THE PURSUIT BEFORE THE NEGOTIATION

   Chasing a specific copy begins before any money is discussed. Asking a
   partner to photograph their card is already pursuit, so it belongs on the
   Goal and on the rail — as step one of six.

   It is NOT an opportunity stage, and this suite exists mostly to hold that
   line. An Opportunity's priceThread opens with an offer; manufacturing one so
   a photo request could "be" a stage would put a financial statement in the
   collector's mouth that they never made. So Review Card is DERIVED from the
   photo request that already exists, and the two counts stay different:

     rail    six steps  — the pursuit, as the collector experiences it
     receipt five stages — the negotiation, which is what a deal settles

   The other half of this pass is a deliberate contract change: actual photos
   are no longer an absolute precondition of offering. Seeing the card is
   strongly encouraged, and confirmed when skipped, but a collector who
   understands what they cannot see may price anyway.
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

/* Domain-level world: the demo review goal, before any deal. */
const world = () => createStore(M.buildCanonicalSeed({ review: true, demoStage: "pre-deal" }));
const view = (st) => collectorView(st.get(), ME);
const goal = (st) => view(st).myGoals().find((g) => /^Review deal/.test(g.note || ""));
const copy = (st) => view(st).partnersWith(goal(st).cardId)[0].inv;
const ask = (st) => { const i = copy(st);
  return st.actions.requestPhotos({ collectorId: ME, partnerId: i.partnerId, invId: i.invId, at: AT }); };
const offer = (st, invId) => { const g = goal(st); const i = copy(st);
  return st.actions.startOpportunity({ goalId: g.id, collectorId: ME, partnerId: i.partnerId,
    cardId: g.cardId, invId: invId || i.invId, listedPrice: i.ask, amount: 3700, at: AT }); };

/* UI-level: the same fixture mounted in the Collector app. */
const mk = () => { __store.reset(M.buildCanonicalSeed({ review: true, demoStage: "pre-deal" }));
  let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r; };
const S = () => __store.get().get();
const acts = () => __store.get().actions;
const uiGoal = () => S().goals.find((g) => g.collectorId === ME && /^Review deal/.test(g.note || ""));
const uiCopy = () => collectorView(S(), ME).partnersWith(uiGoal().cardId)[0].inv;
const cardFor = (r) => {
  const c = S().catalog.find((x) => x.id === uiGoal().cardId);
  return cls(r, "goal").find((n) => txt(n).includes(c.name) && txt(n).includes(c.set));
};
const rowIn = (n) => n.findAllByType("button")
  .find((b) => String(b.props.className || "").includes("goal-deal"));
const expand = (r) => { click(rowIn(cardFor(r))); return cardFor(r); };
const remount = () => { let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r; };

describe("A. Six steps on the rail, five in the negotiation", () => {
  test("the pursuit has six steps, Review Card first", () => {
    eq(D.PURSUIT_STEPS.length, 6, "six steps");
    eq(D.PURSUIT_STEPS[0].id, "review-card", "Review Card leads");
    eq(D.PURSUIT_STEPS[0].label, "Review Card", "and is called that");
    eq(D.PURSUIT_STEPS[1].id, "agree-price", "Agree on Price is second");
    eq(D.PURSUIT_STEPS.slice(1).map((x) => x.id).join(","),
      "agree-price,select-trade,value-trade,deal,fulfillment", "then the rest, in order");
  });

  test("only five of them are a negotiation", () => {
    eq(D.PURSUIT_STEPS.filter((x) => x.negotiation).length, 5, "five negotiation steps");
    eq(D.PURSUIT_STEPS[0].negotiation, false, "Review Card is not one of them");
    eq(D.RECEIPT_STAGES.length, 5, "and the receipt still settles five");
    assert(!D.RECEIPT_STAGES.includes("review-card"), "Review Card never settles as a stage");
  });

  test("review-card is never a stage an opportunity can hold", () => {
    assert(!D.STAGES.some((x) => x.id === "review-card"),
      "it is absent from the canonical stage list");
    eq(D.STAGES.filter((x) => x.group === "deal").length, 5, "which still has five deal stages");
    const store = readSrc("domain/metyet-store.js");
    assert(!/stage: "review-card"/.test(store), "and nothing ever writes it as a stage");
  });

  test("the rail renders six labelled steps", () => {
    const r = mk();
    TR.act(() => { acts().requestPhotos({ collectorId: ME, partnerId: uiCopy().partnerId,
      invId: uiCopy().invId, at: AT }); });
    const r2 = remount();
    const labels = cls(cardFor(r2), "rail-l").map(txt);
    eq(labels.join(" | "),
      "Review Card | Agree on Price | Select Trade | Value Trade | Deal | Fulfillment",
      "six steps in pursuit order");
    eq(cls(cardFor(r2), "rail-n").map(txt).join(","), "1,2,3,4,5,6", "numbered 1-6");
  });
});

describe("B. Requesting photos becomes visible pursuit", () => {
  test("before asking there is no pursuit at all", () => {
    const st = world();
    eq(view(st).pursuitFor(goal(st).id), null, "matching supply alone is not pursuit");
  });

  test("asking creates a Review Card pursuit, and no negotiation", () => {
    const st = world();
    const opps = st.get().opportunities.length;
    ask(st);
    const p = view(st).pursuitFor(goal(st).id);
    assert(p, "there is now a pursuit");
    eq(p.kind, "review", "of the reviewing kind");
    eq(p.step, "review-card", "at step one");
    eq(p.who, "partner", "waiting on the partner");
    eq(st.get().opportunities.length, opps, "and no opportunity was created");
    eq(D.goalState(goal(st).id, st.get().opportunities), "seeking", "the goal is still sought");
  });

  test("it is copy-specific, naming the exact copy and partner", () => {
    const st = world();
    ask(st);
    const p = view(st).pursuitFor(goal(st).id);
    eq(p.invId, copy(st).invId, "the exact physical copy");
    eq(p.partnerId, copy(st).partnerId, "and the partner holding it");
  });

  test("the Goal shows it, without leaving the supply modal", () => {
    const r = mk();
    TR.act(() => { acts().requestPhotos({ collectorId: ME, partnerId: uiCopy().partnerId,
      invId: uiCopy().invId, at: AT }); });
    const r2 = remount();
    const summary = cls(cardFor(r2), "goal-deal")[0];
    assert(summary, "the Goal now carries a Deal Flow summary");
    assert(/Deal Flow · Review Card/.test(txt(summary)), "named Review Card");
    assert(/Northline Cards/.test(txt(summary)), "with the partner");
    assert(/Waiting on Northline Cards/.test(txt(summary)), "and whose move it is");
  });

  test("expanded, it explains the wait and shows both faces as awaited", () => {
    const r = mk();
    TR.act(() => { acts().requestPhotos({ collectorId: ME, partnerId: uiCopy().partnerId,
      invId: uiCopy().invId, at: AT }); });
    const r2 = remount();
    const card = expand(r2);
    assert(/Waiting on Northline Cards/.test(txt(cls(card, "idf-h")[0])), "the heading");
    assert(/You asked to see the actual card/.test(txt(card)), "why we are waiting");
    const faces = cls(card, "rv-face").map(txt);
    eq(faces.length, 2, "two faces");
    assert(/Front Awaiting photo/.test(faces[0]), "front awaited");
    assert(/Back Awaiting photo/.test(faces[1]), "back awaited");
    eq(cls(card, "chat-embed").length, 1, "with the canonical conversation alongside");
  });
});

describe("C. Photos arrive, and the move returns to the collector", () => {
  test("front alone leaves it with the partner", () => {
    const st = world();
    ask(st);
    st.actions.addCopyPhotos({ invId: copy(st).invId, front: "f", at: AT });
    const p = view(st).pursuitFor(goal(st).id);
    eq(p.ready, false, "not ready to review");
    eq(p.who, "partner", "still their move");
    eq(p.step, "review-card", "and still step one");
  });

  test("both faces make it the collector's move, still with no deal", () => {
    const st = world();
    const opps = st.get().opportunities.length;
    ask(st);
    st.actions.addCopyPhotos({ invId: copy(st).invId, front: "f", back: "b", at: AT });
    const p = view(st).pursuitFor(goal(st).id);
    eq(p.ready, true, "ready to review");
    eq(p.who, "me", "the collector's move");
    eq(p.kind, "review", "but still a review, not a negotiation");
    eq(st.get().opportunities.length, opps, "uploading created no deal");
  });

  test("the workspace switches to Your move and offers the actual photos", () => {
    const r = mk();
    const inv = uiCopy();
    TR.act(() => { acts().requestPhotos({ collectorId: ME, partnerId: inv.partnerId,
      invId: inv.invId, at: AT }); });
    TR.act(() => { acts().addCopyPhotos({ invId: inv.invId, front: "f", back: "b", at: AT }); });
    const r2 = remount();
    const card = expand(r2);
    assert(/Your move/.test(txt(cls(card, "goal-deal-t")[0])), "the summary says so");
    assert(/Your move/.test(txt(cls(card, "idf-h")[0])), "and the workspace heading");
    assert(/Photos of actual card/.test(txt(card)), "labelled as actual photos");
    eq(cls(card, "rv-face").filter((n) => /has/.test(String(n.props.className))).length, 2,
      "both faces now carry an image");
    assert(card.findAllByType("button").some((b) => txt(b) === "Make an offer"),
      "and the offer is available");
  });
});

describe("D. Proceeding without photos", () => {
  test("the domain no longer forbids it", () => {
    const st = world();
    const inv = copy(st);
    eq(D.INVARIANTS.copyPhotographed(inv.photos), false, "no actual photos");
    const oid = offer(st);
    assert(typeof oid === "string", "the offer is accepted");
    eq(D.activeOppForGoal(goal(st).id, st.get().opportunities).stage, "agree-price",
      "and begins at Agree on Price");
  });

  test("the copy itself is still enforced", () => {
    const st = world();
    const gone = st.get().inventory.find((i) => i.archived);
    if (!gone) return;
    const res = st.actions.startOpportunity({ goalId: goal(st).id, collectorId: ME,
      partnerId: gone.partnerId, cardId: goal(st).cardId, invId: gone.invId,
      listedPrice: 100, amount: 90, at: AT });
    eq(res.refused, D.REFUSE.copyUnavailable, "an unavailable copy is still refused");
  });

  test("the interface asks once, without alarming the collector", () => {
    const r = mk();
    TR.act(() => { acts().requestPhotos({ collectorId: ME, partnerId: uiCopy().partnerId,
      invId: uiCopy().invId, at: AT }); });
    const r2 = remount();
    const card = expand(r2);
    const go = card.findAllByType("button").find((b) => txt(b) === "Make an offer without photos");
    assert(go, "the quieter path exists");
    click(go);
    const body = txt(cardFor(r2));
    assert(/Make an offer without actual photos\?/.test(body), "a confirmation appears");
    assert(/hasn't added photos of this copy yet/.test(body), "saying what is missing");
    assert(/Keep waiting/.test(body) && /Continue without photos/.test(body),
      "with both ways out");
    /* Nothing legalistic, and nothing fabricated. */
    assert(!/warning|risk|liability|waive/i.test(body), "and no frightening language");
    eq(D.INVARIANTS.copyPhotographed(uiCopy().photos), false, "no photos were invented");
  });

  test("the confirmation creates nothing by itself", () => {
    const r = mk();
    TR.act(() => { acts().requestPhotos({ collectorId: ME, partnerId: uiCopy().partnerId,
      invId: uiCopy().invId, at: AT }); });
    const r2 = remount();
    const before = S().opportunities.length;
    click(expand(r2).findAllByType("button").find((b) => txt(b) === "Make an offer without photos"));
    eq(S().opportunities.length, before, "opening the confirmation starts no deal");
  });

  test("raw and graded are told apart only where the data supports it", () => {
    const rv = SRC.slice(SRC.indexOf("function ReviewCard("), SRC.indexOf("function GoalCard("));
    assert(/D\.isRaw\(c\)/.test(rv), "it uses the canonical raw test");
    assert(/graded \$\{c\.grade\}/.test(rv) || /graded \${c.grade}/.test(rv),
      "a graded copy says what its grade already establishes");
    assert(/raw, so its condition is not established/.test(rv),
      "and a raw copy says the opposite");
    /* Emphasis differs; neither is blocked. */
    assert(/graded \? " pri" : ""/.test(rv) || /\(graded \? " pri" : ""\)/.test(rv),
      "the offer reads as primary only when a grade already carries condition");
  });
});

describe("E. Into Agree on Price, and afterwards", () => {
  test("offering advances the same pursuit to step two", () => {
    const st = world();
    ask(st);
    st.actions.addCopyPhotos({ invId: copy(st).invId, front: "f", back: "b", at: AT });
    const inv = copy(st);
    const oid = offer(st);
    assert(typeof oid === "string", "the offer was made");
    const p = view(st).pursuitFor(goal(st).id);
    eq(p.kind, "deal", "the pursuit is now a negotiation");
    eq(p.step, "agree-price", "at Agree on Price");
    eq(p.invId, inv.invId, "against the same physical copy");
    eq(p.partnerId, inv.partnerId, "with the same partner");
  });

  test("Review Card reads as settled once a deal exists", () => {
    const r = mk();
    const inv = uiCopy();
    TR.act(() => { acts().addCopyPhotos({ invId: inv.invId, front: "f", back: "b", at: AT }); });
    TR.act(() => { acts().startOpportunity({ goalId: uiGoal().id, collectorId: ME,
      partnerId: inv.partnerId, cardId: uiGoal().cardId, invId: inv.invId,
      listedPrice: inv.ask, amount: 3700, at: AT }); });
    const r2 = remount();
    const card = cardFor(r2);
    const states = cls(card, "rail-s").map((n) => (String(n.props.className).includes("current")
      ? "current" : String(n.props.className).includes("done") ? "done" : "pending"));
    eq(states[0], "done", "Review Card is behind us");
    eq(states[1], "current", "Agree on Price is where we are");
  });

  test("an outstanding request survives an early offer, and resolves later", () => {
    const st = world();
    ask(st);                                   /* asked, but did not wait */
    const inv = copy(st);
    const oid = offer(st, inv.invId);
    assert(typeof oid === "string", "the collector proceeded anyway");
    const open = st.get().photoRequests.filter((r) => !r.fulfilledAt);
    eq(open.length, 1, "the request did not mysteriously disappear");

    const stageBefore = D.activeOppForGoal(goal(st).id, st.get().opportunities).stage;
    st.actions.addCopyPhotos({ invId: inv.invId, front: "f", back: "b", at: AT });
    const now = D.activeOppForGoal(goal(st).id, st.get().opportunities);
    eq(now.id, oid, "the same negotiation");
    eq(now.stage, stageBefore, "at the same stage — photos did not reset it");
    eq(st.get().photoRequests.filter((r) => !r.fulfilledAt).length, 0, "and the ask is resolved");
    assert(D.INVARIANTS.copyPhotographed(st.get().inventory
      .find((i) => i.invId === inv.invId).photos), "with the photos now available to inspect");
  });
});

describe("F. Nothing about the copy or the negotiation changed", () => {
  test("photos still belong to the exact copy, not the identity", () => {
    const st = world();
    const g = goal(st);
    const copies = st.get().inventory.filter((i) => i.cardId === g.cardId && !i.archived);
    if (copies.length < 2) return;
    st.actions.addCopyPhotos({ invId: copies[0].invId, front: "f", back: "b", at: AT });
    eq(D.INVARIANTS.copyPhotographed(st.get().inventory
      .find((i) => i.invId === copies[1].invId).photos), false,
      "an identical sibling copy is untouched");
  });

  test("a later collector reuses the photos without asking again", () => {
    const st = world();
    ask(st);
    const inv = copy(st);
    st.actions.addCopyPhotos({ invId: inv.invId, front: "f", back: "b", at: AT });
    const other = collectorView(st.get(), "c1");
    eq(other.photoState(st.get().inventory.find((i) => i.invId === inv.invId)), "ready",
      "the next collector sees a ready copy");
    eq(other.photoRequestFor(inv.invId), null, "with nothing to request");
  });

  test("the receipt still counts five settled stages", () => {
    const r = mk();
    const inv = uiCopy();
    TR.act(() => { acts().addCopyPhotos({ invId: inv.invId, front: "f", back: "b", at: AT }); });
    TR.act(() => { acts().startOpportunity({ goalId: uiGoal().id, collectorId: ME,
      partnerId: inv.partnerId, cardId: uiGoal().cardId, invId: inv.invId,
      listedPrice: inv.ask, amount: 3700, at: AT }); });
    const r2 = remount();
    assert(/of 5 settled/.test(txt(cls(cardFor(r2), "rc-wrap")[0])),
      "the negotiation receipt is unchanged by the six-step rail");
  });

  test("Agree on Price itself is untouched", () => {
    const r = mk();
    const inv = uiCopy();
    TR.act(() => { acts().addCopyPhotos({ invId: inv.invId, front: "f", back: "b", at: AT }); });
    TR.act(() => { acts().startOpportunity({ goalId: uiGoal().id, collectorId: ME,
      partnerId: inv.partnerId, cardId: uiGoal().cardId, invId: inv.invId,
      listedPrice: inv.ask, amount: 3700, at: AT }); });
    const r2 = remount();
    const card = expand(r2);
    assert(cls(card, "ap")[0], "the pricing stage renders");
    assert(cls(card, "ap-now")[0], "with its standing-proposal block");
    eq(cls(card, "idf-mid").length, 0, "and no details column, as before");
  });
});

require("./run.cjs").run();
