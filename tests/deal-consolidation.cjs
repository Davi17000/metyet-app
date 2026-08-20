/* ============================================================================
   COLLECTOR DEAL FLOW CONSOLIDATION

   Two UX rules, both resting on the canonical model rather than new state:

   A. A Primary Goal WITHOUT an active opportunity is a pursuit/discovery
      experience. WITH one, its entry point opens the Deal Flow directly — no
      intermediary detail step, whoever holds the turn.
   B. Conversation is part of the Deal Flow, not a destination reached from it.
      The same canonical thread (collector + partner + card) renders inline.

   Neither introduces a second lifecycle, conversation model, or history store.
   ========================================================================= */

process.env.METYET_DEV = "1";                 // review harness fixtures

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const D = require("../domain/metyet-domain.js");
const App = require("../dist/Collector.cjs").default;
const { __store } = require("../dist/Collector.cjs");
const { buildCanonicalSeed } = require("../dist/MetYet.cjs");

const readSrc = (rel) => require("fs").readFileSync(require("path").join(__dirname, "..", rel), "utf8");
const txt = (n) => {
  if (!n) return "";
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ");
};
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));
const btn = (r, s) => r.root.findAllByType("button").find((b) => txt(b).trim() === s);

const mk = () => { __store.reset(buildCanonicalSeed({ review: true }));
  let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r; };
const remount = () => { let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r; };
const S = () => __store.get().get();
const acts = () => __store.get().actions;
const ME = "c12";
const goalNoted = (re) => S().goals.find((g) => g.collectorId === ME && re.test(g.note || ""));
const reviewOpp = () => D.activeOppForGoal(goalNoted(/^Review deal/).id, S().opportunities);

/* The canonical snapshot navigation must never disturb. */
const shape = (o) => JSON.stringify({ stage: o.stage, agreedPrice: o.agreedPrice,
  declined: o.declined, priceThread: o.priceThread, trade: o.trade, deal: o.deal,
  fulfillment: o.fulfillment, completedAt: o.completedAt,
  actor: D.nextActor(o).actor, reason: D.nextActor(o).reason });

/* Reach the Goals card for a specific GOAL. Matching on card name alone is
   ambiguous — the seed holds four different Charizards — so prefer the goal's
   own note, which is unique, and fall back to the card name. */
const nameOf = (cardId) => S().catalog.find((c) => c.id === cardId).name;
const cardFor = (r, g) => {
  const c = S().catalog.find((x) => x.id === g.cardId);
  const nodes = cls(r, "goal").concat(cls(r, "gwatch-r"));
  /* Name AND set: "Charizard" alone matches four different goals. */
  return nodes.find((n) => txt(n).includes(c.name) && txt(n).includes(c.set));
};
const goalOf = (o) => S().goals.find((g) => g.id === o.goalId);
const ALL_STAGES = ["agree-price", "select-trade", "value-trade", "deal", "fulfillment"];
/* Value Trade is back: the seed defect that made it unrenderable — trade terms
   pointing at BinderCopy ids that did not exist — has been repaired. */
const RENDERABLE = ALL_STAGES;
const cardForOpp = (r, o) => cardFor(r, goalOf(o));

describe("A. Primary Goal becomes the Deal Flow once an offer exists", () => {
  test("a Primary Goal with NO active deal stays a discovery experience", () => {
    const r = mk();
    const g = S().goals.find((x) => x.collectorId === ME && x.tier === "primary"
      && !D.activeOppForGoal(x.id, S().opportunities));
    if (!g) return;                              // seed may cover every primary
    const card = cardFor(r, g);
    assert(card, "the goal is on the Goals page");
    eq(cls(card, "goal-deal").length, 0, "with no Deal Flow entry point");
    assert(/partner/i.test(txt(card)) || /None of your partners/.test(txt(card)),
      "and supply/partner discovery instead");
  });

  test("a Primary Goal WITH an active deal exposes direct entry", () => {
    const r = mk();
    const o = reviewOpp();
    const card = cardForOpp(r, o);
    const entry = cls(card, "goal-deal")[0];
    assert(entry, "the active goal carries a Deal Flow entry point");
    assert(/Deal Flow/.test(txt(entry)), "labelled as the Deal Flow");
    /* The stage shown is the canonical one, not a second indicator. */
    assert(txt(entry).includes(D.STAGES.find((s) => s.id === o.stage).label),
      "showing the canonical opportunity stage");
  });

  test("one tap opens the workspace — no intermediary step", () => {
    const r = mk();
    const o = reviewOpp();
    const entry = cls(cardForOpp(r, o), "goal-deal")[0];
    click(entry);
    assert(cls(r, "idf-stage")[0], "the Deal Flow workspace is open");
    assert(cls(r, "chat-embed")[0], "with its conversation");
    /* It opened IN PLACE: the Goal is still on screen, now containing the deal. */
    assert(cls(r, "goal-dw")[0], "the workspace is inside the Goal");
    assert(cls(r, "goal")[0], "and the Goals list never went away");
  });

  test("direct entry works on the collector's turn and on the partner's", () => {
    /* Collector's turn. */
    let r = mk();
    let o = reviewOpp();
    eq(D.nextActor(o).actor, "collector", "the review deal starts with the collector");
    click(cls(cardForOpp(r, o), "goal-deal")[0]);
    assert(cls(r, "idf-stage")[0], "opens directly when it is your move");

    /* Hand the turn to the partner through canonical state, then re-enter. */
    const copy = S().binder.find((b) => b.collectorId === ME);
    TR.act(() => { acts().patchOpportunity(o.id, (x) => ({ ...x,
      agreedPrice: 4032, stage: "select-trade",
      trade: { mode: "trade", submitted: true,
        cards: [{ binderId: copy.id, cardId: copy.cardId, inclusion: "proposed" }] } })); });
    r = remount();
    o = reviewOpp();
    eq(D.nextActor(o).actor, "partner", "now the partner owns the turn");
    const entry = cls(cardForOpp(r, o), "goal-deal")[0];
    assert(entry, "the deal is still represented on the Goals page");
    assert(/Waiting on/.test(txt(entry)), "stating truthfully who we wait on");
    click(entry);
    assert(cls(r, "idf-stage")[0], "and it still opens directly while waiting");
  });

  test("re-entering a waiting deal mutates nothing", () => {
    const r = mk();
    const o = reviewOpp();
    const copy = S().binder.find((b) => b.collectorId === ME);
    TR.act(() => { acts().patchOpportunity(o.id, (x) => ({ ...x,
      agreedPrice: 4032, stage: "select-trade",
      trade: { mode: "trade", submitted: true,
        cards: [{ binderId: copy.id, cardId: copy.cardId, inclusion: "proposed" }] } })); });

    const r2 = remount();
    const before = shape(reviewOpp());
    const goalsBefore = S().goals.length, oppsBefore = S().opportunities.length;
    click(cls(cardForOpp(r2, o), "goal-deal")[0]);
    eq(shape(reviewOpp()), before, "opening changed no term, stage or turn");
    eq(S().goals.length, goalsBefore, "and created no second Goal");
    eq(S().opportunities.length, oppsBefore, "and no second opportunity");
  });

  test("an unsuccessful end returns the Goal to pursuit, history intact", () => {
    const r = mk();
    const o = reviewOpp();
    const g = goalNoted(/^Review deal/);
    TR.act(() => { acts().sendMessage({ collectorId: ME, partnerId: o.partnerId,
      cardId: o.cardId, by: "collector", text: "BEFORE-END", at: "2026-08-17" }); });
    const convBefore = S().conversations.length;

    TR.act(() => { acts().endOpportunity(o.id, "collector", "2026-08-17"); });

    const g2 = S().goals.find((x) => x.id === g.id);
    assert(g2, "the Goal did not disappear because one negotiation failed");
    eq(g2.tier, "primary", "and is still Primary");
    eq(D.goalState(g2.id, S().opportunities), "seeking", "back to pursuit");
    eq(S().conversations.length, convBefore, "conversation history preserved");
    const t = D.findThread(S().conversations, ME, o.partnerId,
      S().catalog.find((c) => c.id === o.cardId));
    assert(t.entries.some((e) => e.text === "BEFORE-END"), "including what was said");
    assert(S().opportunities.find((x) => x.id === o.id).declined,
      "the terminal opportunity record survives");
    eq(S().opportunities.filter((x) => x.goalId === g.id && D.isActive(x)).length, 0,
      "and no replacement deal was started automatically");

    /* The Goals page shows discovery again, not a Deal Flow entry. */
    const r2 = remount();
    const card = cardForOpp(r2, o);
    eq(cls(card, "goal-deal").length, 0, "the entry point reverted to pursuit");
  });

  test("completion follows the existing satisfied behaviour", () => {
    mk();
    const o = reviewOpp();
    const g = goalNoted(/^Review deal/);
    TR.act(() => { acts().patchOpportunity(o.id, (x) => ({ ...x,
      stage: "completed", completedAt: "2026-08-17" })); });
    eq(D.goalState(g.id, S().opportunities), "satisfied", "the Goal derives Satisfied");
    eq(S().goals.filter((x) => x.id === g.id).length, 1, "with no new post-deal record");
  });
});

describe("B. Conversation is embedded, not a destination", () => {
  const openDeal = (r, o) => { click(cls(cardForOpp(r, o), "goal-deal")[0]); return r; };
  const panel = (r) => cls(r, "chat-embed")[0];
  const send = (r, text) => {
    const ta = panel(r).findAllByType("textarea")[0];
    TR.act(() => { ta.props.onChange({ target: { value: text } }); });
    /* Re-query after the re-render: the Send button was disabled a moment ago. */
    click(panel(r).findAllByType("button").find((b) => txt(b).trim() === "Send"));
  };

  test("the drawer is gone and the action bar carries no chat control", () => {
    const r = mk();
    openDeal(r, reviewOpp());
    eq(cls(r, "dw-chat").length, 0, "no chat drawer renders");
    /* The review deal sits at Agree on Price, which owns its Accept and Counter
       rather than borrowing the shell's single action slot. */
    const bar = cls(r, "idf-action")[0] || cls(r, "ap-now")[0];
    assert(bar, "an action path exists");
    assert(!/Chat with/.test(txt(bar)), "carrying no separate chat destination");
    const src = readSrc("collector/MetYetCollector.jsx");
    assert(!/dw-bar-chat/.test(src.slice(src.indexOf('className="dw-bar"'))),
      "and the chat button is removed from the source, not merely hidden");
  });

  test("a message can be sent inline, with no drawer to open first", () => {
    const r = mk();
    const o = reviewOpp();
    openDeal(r, o);
    send(r, "Would you consider $4,000?");
    const t = D.findThread(S().conversations, ME, o.partnerId,
      S().catalog.find((c) => c.id === o.cardId));
    assert(t, "written to the canonical partner-scoped thread");
    assert(t.entries.some((e) => e.text === "Would you consider $4,000?"), "carrying the message");
    eq(t.partnerId, o.partnerId, "scoped to this deal's partner alone");
    eq(S().conversations.filter((x) => x.cardId === o.cardId).length, 1,
      "and no second conversation was created");
  });

  test("sending alters no stage, term or turn", () => {
    const r = mk();
    const o = reviewOpp();
    openDeal(r, o);
    const before = shape(reviewOpp());
    const opps = S().opportunities.length;
    send(r, "just checking in");
    eq(shape(reviewOpp()), before, "stage, terms and nextActor are untouched");
    eq(S().opportunities.length, opps, "and no opportunity was created");
  });

  test("the collector can write while the partner owns the turn", () => {
    const r = mk();
    const o = reviewOpp();
    const copy = S().binder.find((b) => b.collectorId === ME);
    TR.act(() => { acts().patchOpportunity(o.id, (x) => ({ ...x,
      agreedPrice: 4032, stage: "select-trade",
      trade: { mode: "trade", submitted: true,
        cards: [{ binderId: copy.id, cardId: copy.cardId, inclusion: "proposed" }] } })); });
    const r2 = remount();
    eq(D.nextActor(reviewOpp()).actor, "partner", "the partner owns the turn");
    openDeal(r2, reviewOpp());
    const before = shape(reviewOpp());
    send(r2, "any news?");
    eq(D.nextActor(reviewOpp()).actor, "partner", "writing did not take the turn back");
    eq(shape(reviewOpp()), before, "and changed nothing about the deal");
  });

  test("both sides render, chronologically, with events structurally distinct", () => {
    const r = mk();
    const o = reviewOpp();
    const card = S().catalog.find((c) => c.id === o.cardId);
    TR.act(() => { acts().sendMessage({ collectorId: ME, partnerId: o.partnerId,
      cardId: o.cardId, by: "collector", text: "FIRST", at: "2026-08-17" }); });
    TR.act(() => { acts().logMilestone({ collectorId: ME, partnerId: o.partnerId,
      cardId: o.cardId, text: "Price agreed", oppId: o.id, at: "2026-08-17" }); });
    TR.act(() => { acts().sendMessage({ collectorId: ME, partnerId: o.partnerId,
      cardId: o.cardId, by: "tp", text: "SECOND", at: "2026-08-17" }); });

    const t = D.findThread(S().conversations, ME, o.partnerId, card);
    eq(t.entries.map((e) => e.kind).join(","), "message,event,message",
      "one thread, chronological, messages and events interleaved");

    const r2 = remount();
    openDeal(r2, reviewOpp());
    const p = panel(r2);
    assert(/FIRST/.test(txt(p)), "the collector's message renders");
    assert(/SECOND/.test(txt(p)), "and the partner's");
    assert(cls(p, "chat-ev").length >= 1, "the event renders as an event row");
    assert(cls(p, "chat-m").length >= 2, "and messages as messages");
    assert(cls(p, "chat-m").some((n) => String(n.props.className).includes("theirs")),
      "with the partner's distinguished from the collector's own");
  });

  test("long threads show the recent tail and expand inline", () => {
    const r = mk();
    const o = reviewOpp();
    for (let i = 0; i < 6; i++) {
      TR.act(() => { acts().sendMessage({ collectorId: ME, partnerId: o.partnerId,
        cardId: o.cardId, by: i % 2 ? "tp" : "collector", text: "MSG" + i, at: "2026-08-17" }); });
    }
    const r2 = remount();
    openDeal(r2, reviewOpp());
    const p = panel(r2);
    assert(/MSG5/.test(txt(p)), "the most recent entries are shown");
    assert(!/MSG0/.test(txt(p)), "the oldest are not, so the stage stays dominant");
    const more = r2.root.findAllByType("button").find((b) => /Earlier messages/.test(txt(b)));
    assert(more, "with an inline control to see the rest");
    click(more);
    assert(/MSG0/.test(txt(panel(r2))), "which expands in place");
    eq(cls(r2, "dw-chat").length, 0, "without routing anywhere or opening a drawer");
  });

  test("a composer exists at every renderable active stage", () => {
    /* Uses the canonically-valid static fixtures rather than setting a stage by
       hand: forcing a stage without its upstream terms is exactly what the
       harness forbids, and the workspace rightly cannot render it.
       VALUE_TRADE_BLOCKED is documented in the suite below. */
    RENDERABLE.forEach((stage) => {
      const r = mk();
      const o = S().opportunities.find((x) => x.collectorId === ME && D.isActive(x)
        && x.stage === stage);
      openDeal(r, o);
      const p = panel(r);
      assert(p, stage + ": conversation is present");
      eq(p.findAllByType("textarea").length, 1, stage + ": with exactly one composer");
    });
  });

  test("one thread survives stage transitions", () => {
    const r = mk();
    const o = reviewOpp();
    const card = S().catalog.find((c) => c.id === o.cardId);
    openDeal(r, o);
    send(r, "AT-PRICE");
    const copy = S().binder.find((b) => b.collectorId === ME);
    TR.act(() => { acts().patchOpportunity(o.id, (x) => ({ ...x,
      agreedPrice: 4032, stage: "select-trade",
      trade: { mode: "trade", submitted: false,
        cards: [{ binderId: copy.id, cardId: copy.cardId, inclusion: "proposed" }] } })); });
    const r2 = remount();
    openDeal(r2, reviewOpp());
    send(r2, "AT-TRADE");

    const mine = S().conversations.filter((t) => t.cardId === o.cardId && t.partnerId === o.partnerId);
    eq(mine.length, 1, "still exactly ONE canonical thread");
    assert(/AT-PRICE/.test(txt(panel(r2))) && /AT-TRADE/.test(txt(panel(r2))),
      "carrying both stages' messages");
    eq(D.findThread(S().conversations, ME, o.partnerId, card).id, mine[0].id,
      "the same record throughout");
  });

  test("no second conversation or history store was introduced", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    assert(/st\.threadWith\(pid, cid\)/.test(src), "the workspace reads the canonical thread");
    assert(!/useState\(\[\]\)[^;]*messages/i.test(src), "and keeps no local message list");
    assert(!/activityLog|historyStore|dealEvents\s*=/.test(src), "no parallel history store");
    const store = readSrc("domain/metyet-store.js");
    assert(/appendThreadEntry/.test(store), "writes go through the canonical append");
  });
});

describe("C. The review harness still works after consolidation", () => {
  test("a static example exists at each of the five active stages", () => {
    ALL_STAGES.forEach((stage) => {
      assert(S().opportunities.some((x) => x.collectorId === ME && D.isActive(x)
        && x.stage === stage), stage + ": a static example exists");
    });
  });

  test("all five examples open directly, with conversation embedded", () => {
    RENDERABLE.forEach((stage) => {
      const r = mk();
      const o = S().opportunities.find((x) => x.collectorId === ME && D.isActive(x)
        && x.stage === stage);
      const entry = cls(cardForOpp(r, o), "goal-deal")[0];
      assert(entry, stage + ": exposes direct Deal Flow entry");
      click(entry);
      assert(cls(r, "idf-stage")[0], stage + ": opens its workspace");
      assert(cls(r, "chat-embed")[0], stage + ": with embedded conversation");
    });
  });

  /* --------------------------------------------------------- REPAIRED DEFECT
     buildOpps used to write CARD ids into trade cards' binderId while BinderCopy
     ids are "cc"+index, so every seeded trade term pointed at a copy that did
     not exist and the Collector's Value Trade workspace could not render. The
     seed now resolves the binder copy through the same lookup it reads photos,
     cert and market value from. Fully covered in tests/seed-integrity.cjs. */
  test("seeded trade terms resolve to real binder copies", () => {
    mk();
    const ids = new Set(S().binder.filter((b) => b.collectorId === ME).map((b) => b.id));
    const o = S().opportunities.find((x) => x.collectorId === ME && D.isActive(x)
      && x.stage === "value-trade");
    const cards = D.acceptedTradeCards(o);
    assert(cards.length >= 1, "the fixture has accepted trade cards");
    cards.forEach((c) => assert(ids.has(c.binderId),
      "every trade term names a BinderCopy this collector actually owns"));
  });

  test("reset still restores the review deal, and promotion still works", () => {
    const r = mk();
    const o = reviewOpp();
    TR.act(() => { acts().patchOpportunity(o.id, (x) => ({ ...x,
      agreedPrice: 4032, stage: "value-trade" })); });
    eq(reviewOpp().stage, "value-trade", "the review deal moved");

    const r2 = remount();
    click(r2.root.findAllByType("button").find((b) => /^Reset (review|demo) deal$/.test(txt(b).trim())));
    eq(reviewOpp().stage, "agree-price", "reset restored the starting fixture");

    const p = goalNoted(/^Review promotion/);
    const opps = S().opportunities.length;
    TR.act(() => { acts().updateGoalTier(p.id, "primary"); });
    eq(S().goals.find((g) => g.id === p.id).tier, "primary", "promotion still works");
    eq(S().opportunities.length, opps, "and still creates no opportunity");
  });
});

require("./run.cjs").run();
