/* ============================================================================
   PRIMARY GOAL — INLINE DEAL FLOW

   The Goal evolves into the negotiation rather than sending the collector
   somewhere else:

     no active opportunity  -> pursuit / discovery, unchanged
     active opportunity     -> collapsed Deal Flow summary, expandable in place

   Expansion is presentation state. It mounts the SAME canonical workspace, the
   same stage components, the same partner-scoped conversation, the same action
   registration — nothing is cloned into the Goal card.
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

const ME = "c12";
const mk = () => { __store.reset(buildCanonicalSeed({ review: true }));
  let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r; };
const S = () => __store.get().get();
const acts = () => __store.get().actions;
const liveFor = (g) => D.activeOppForGoal(g.id, S().opportunities);
const oppAt = (stage) => S().opportunities.find((x) => x.collectorId === ME
  && D.isActive(x) && x.stage === stage);
const goalOf = (o) => S().goals.find((g) => g.id === o.goalId);

/* Goal cards share card names in this seed, so match on name AND set. */
const cardFor = (r, g) => {
  const c = S().catalog.find((x) => x.id === g.cardId);
  return cls(r, "goal").concat(cls(r, "gwatch-r"))
    .find((n) => txt(n).includes(c.name) && txt(n).includes(c.set));
};
/* The summary row IS the disclosure — one control opens and closes it. */
const discloseIn = (node) => node.findAllByType("button")
  .find((b) => String(b.props.className || "").includes("goal-deal"));
const expand = (r, g) => { click(discloseIn(cardFor(r, g))); return cardFor(r, g); };

/* The canonical snapshot presentation must never disturb. */
const shape = (o) => JSON.stringify({ stage: o.stage, agreedPrice: o.agreedPrice,
  declined: o.declined, priceThread: o.priceThread, trade: o.trade, deal: o.deal,
  fulfillment: o.fulfillment, completedAt: o.completedAt,
  actor: D.nextActor(o).actor, reason: D.nextActor(o).reason });
const worldShape = () => JSON.stringify({
  opps: S().opportunities.map(shape), goals: S().goals.map((g) => [g.id, g.tier, g.cardId]),
  convs: S().conversations.map((t) => [t.key, t.entries.length]) });

describe("A. Collapsed active-deal state", () => {
  test("a Primary Goal with no active deal has no Deal Flow disclosure", () => {
    const r = mk();
    const g = S().goals.find((x) => x.collectorId === ME && x.tier === "primary"
      && !liveFor(x));
    if (!g) return;
    const card = cardFor(r, g);
    eq(cls(card, "goal-deal").length, 0, "no Deal Flow summary");
    assert(!discloseIn(card), "and no disclosure control");
  });

  test("a Secondary Goal never renders a Deal Flow", () => {
    const r = mk();
    S().goals.filter((x) => x.collectorId === ME && x.tier === "secondary").forEach((g) => {
      const card = cardFor(r, g);
      if (!card) return;
      eq(cls(card, "goal-deal").length, 0, "secondary goals carry no deal machinery");
    });
  });

  test("an active Primary Goal shows stage, partner, turn and the five-stage track", () => {
    const r = mk();
    const o = oppAt("select-trade");
    const g = goalOf(o);
    const card = cardFor(r, g);
    const summary = cls(card, "goal-deal")[0];
    assert(summary, "a collapsed Deal Flow summary");
    assert(/Deal Flow/.test(txt(summary)), "labelled Deal Flow");
    assert(txt(summary).includes(D.STAGES.find((s) => s.id === o.stage).label),
      "naming the canonical stage");
    const partner = S().partners.find((p) => p.id === o.partnerId);
    assert(txt(card).includes(partner.name), "and the negotiating partner");
    eq(cls(card, "rail-s").length, 6, "with the compact six-step track");
    assert(discloseIn(card), "and a disclosure control");
  });

  test("the track reflects the canonical stage, exposing nothing ahead of it", () => {
    const r = mk();
    const o = oppAt("select-trade");
    const card = cardFor(r, o && goalOf(o));
    const states = cls(card, "rail-s").map((n) => {
      const k = String(n.props.className);
      return k.includes("current") ? "current" : k.includes("done") ? "done" : "pending";
    });
    /* Six steps now: Review Card is settled once a deal exists, then the five
       negotiation stages carry their canonical settlement. */
    eq(states.join(","), "done,done,current,pending,pending,pending",
      "Review Card settled, Agree on Price settled, Select Trade current");
    /* No downstream term is named while the deal has not reached it. */
    const body = txt(card);
    assert(!/balance/i.test(body), "no Deal-stage balance is shown at Select Trade");
    assert(!/handoff/i.test(body), "and no Fulfillment language");
  });

  test("the disclosure states the turn truthfully", () => {
    const r = mk();
    const o = oppAt("select-trade");
    const g = goalOf(o);
    assert(/Your move/.test(txt(cls(cardFor(r, g), "goal-deal")[0])),
      "the collector's turn is stated");

    const copy = S().binder.find((b) => b.collectorId === ME);
    TR.act(() => { acts().patchOpportunity(o.id, (x) => ({ ...x,
      trade: { mode: "trade", submitted: true,
        cards: [{ binderId: copy.id, cardId: copy.cardId, inclusion: "proposed" }] } })); });
    let r2; TR.act(() => { r2 = TR.create(React.createElement(App)); });
    eq(D.nextActor(liveFor(g)).actor, "partner", "the partner now owns the turn");
    assert(/Waiting on/.test(txt(cls(cardFor(r2, g), "goal-deal")[0])),
      "and the summary says who we wait on");
  });
});

describe("B. Inline expansion", () => {
  test("expanding renders the workspace inside the Goal, with no route change", () => {
    const r = mk();
    const o = oppAt("select-trade");
    const card = expand(r, goalOf(o));
    assert(cls(card, "goal-dw")[0], "the workspace is inside the Goal card");
    assert(cls(card, "idf")[0], "mounted in its inline form");
    assert(cls(card, "idf-stage")[0], "with the current stage workspace");
    assert(cls(card, "chat-embed")[0], "and the embedded conversation");
    assert(cls(r, "goal").length > 1, "the Goals page never went away");
    assert(!cls(card, "dw-ctx")[0], "page-level context chrome is suppressed inline");
  });

  test("the composer and the canonical stage action both render inline", () => {
    const r = mk();
    const card = expand(r, goalOf(oppAt("select-trade")));
    eq(cls(card, "chat-embed")[0].findAllByType("textarea").length, 1, "one composer");
    assert(cls(card, "idf-action")[0], "and the persistent stage action bar");
    assert(!/Chat with/.test(txt(cls(card, "idf-action")[0])), "with no chat destination");
  });

  test("expanding and collapsing mutate nothing at all", () => {
    const r = mk();
    const g = goalOf(oppAt("select-trade"));
    const before = worldShape();
    expand(r, g);
    eq(worldShape(), before, "expanding changed no opportunity, goal or conversation");
    click(discloseIn(cardFor(r, g)));
    eq(worldShape(), before, "and collapsing changed nothing either");
    eq(cls(cardFor(r, g), "goal-dw").length, 0, "the workspace closed");
  });

  test("a waiting deal still expands, with no invalid action offered", () => {
    const r0 = mk();
    const o = oppAt("select-trade");
    const g = goalOf(o);
    const copy = S().binder.find((b) => b.collectorId === ME);
    TR.act(() => { acts().patchOpportunity(o.id, (x) => ({ ...x,
      trade: { mode: "trade", submitted: true,
        cards: [{ binderId: copy.id, cardId: copy.cardId, inclusion: "proposed" }] } })); });
    let r; TR.act(() => { r = TR.create(React.createElement(App)); });
    const before = worldShape();

    const card = expand(r, g);
    assert(cls(card, "goal-dw")[0], "waiting never disables access");
    const bar = cls(card, "idf-action")[0];
    assert(/Waiting on/.test(txt(bar)), "the bar states the wait");
    eq(bar.findAllByType("button").length, 0, "and offers no invalid action");
    eq(cls(card, "chat-embed")[0].findAllByType("textarea").length, 1,
      "but the composer is still usable");
    eq(worldShape(), before, "and expanding a waiting deal mutated nothing");
  });

  test("the same opportunity is used — nothing is cloned", () => {
    const r = mk();
    const o = oppAt("select-trade");
    const oppsBefore = S().opportunities.length;
    expand(r, goalOf(o));
    eq(S().opportunities.length, oppsBefore, "no second opportunity");
    eq(liveFor(goalOf(o)).id, o.id, "the same canonical record");
  });

  test("no stage logic was copied into the Goal card", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    const card = src.slice(src.indexOf("function GoalCard"), src.indexOf("function SimulateTP"));
    assert(card.length > 100, "the GoalCard source was located");
    assert(/<InlineDeal o=\{live\} st=\{st\}/.test(card),
      "the Goal mounts the dedicated inline wrapper");
    ["AgreePrice", "SelectTrade", "ValueTrade", "DealStage", "Fulfillment", "DealChat"]
      .forEach((comp) => assert(!new RegExp("<" + comp + "\\b").test(card),
        comp + " is not re-implemented inside GoalCard"));
    assert(!/register\(/.test(card), "and no action registration is duplicated");
  });
});

describe("C. One expanded deal at a time", () => {
  const twoActive = () => {
    const all = S().goals.filter((g) => g.collectorId === ME && g.tier === "primary" && liveFor(g));
    return all.length >= 2 ? [all[0], all[1]] : null;
  };

  test("opening a second active Goal collapses the first, changing no data", () => {
    const r = mk();
    const pair = twoActive();
    assert(pair, "the seed has two active Primary goals");
    const [a, b] = pair;
    const before = worldShape();

    expand(r, a);
    assert(cls(cardFor(r, a), "goal-dw")[0], "the first is expanded");

    expand(r, b);
    eq(cls(cardFor(r, a), "goal-dw").length, 0, "the first collapsed");
    assert(cls(cardFor(r, b), "goal-dw")[0], "and the second opened");
    eq(cls(r, "goal-dw").length, 1, "exactly one inline workspace is open");
    eq(worldShape(), before, "switching changed no deal state");
  });

  test("returning to the first shows the same canonical data", () => {
    const r = mk();
    const [a, b] = twoActive();
    const stage = liveFor(a).stage;
    expand(r, a); expand(r, b); expand(r, a);
    const card = cardFor(r, a);
    assert(cls(card, "goal-dw")[0], "the first is open again");
    eq(liveFor(a).stage, stage, "at the same canonical stage");
    assert(cls(card, "idf-stage")[0], "with its workspace intact");
  });
});

describe("D. Every stage renders inline", () => {
  ["agree-price", "select-trade", "value-trade", "deal", "fulfillment"].forEach((stage) => {
    test(stage + " expands inline", () => {
      const r = mk();
      const o = oppAt(stage);
      assert(o, stage + ": an example exists");
      const card = expand(r, goalOf(o));
      assert(cls(card, "goal-dw")[0], stage + ": expanded inside the Goal");
      assert(cls(card, "idf-stage")[0], stage + ": with its stage workspace");
      assert(cls(card, "chat-embed")[0], stage + ": and its conversation");
      /* Value Trade in particular must resolve real BinderCopies. */
      if (["value-trade", "deal", "fulfillment"].includes(stage)) {
        const owned = new Set(S().binder.filter((x) => x.collectorId === ME).map((x) => x.id));
        D.acceptedTradeCards(o).forEach((tc) => assert(owned.has(tc.binderId),
          stage + ": every trade term names a real copy"));
      }
    });
  });
});

describe("E. Conversation inside the inline workspace", () => {
  const send = (r, g, text) => {
    const ta = cls(cardFor(r, g), "chat-embed")[0].findAllByType("textarea")[0];
    TR.act(() => { ta.props.onChange({ target: { value: text } }); });
    click(cls(cardFor(r, g), "chat-embed")[0].findAllByType("button")
      .find((b) => txt(b).trim() === "Send"));
  };

  test("the collector can send from the inline workspace, changing no deal state", () => {
    const r = mk();
    const o = oppAt("select-trade");
    const g = goalOf(o);
    expand(r, g);
    const before = shape(liveFor(g));
    send(r, g, "sending these over");

    const t = D.findThread(S().conversations, ME, o.partnerId,
      S().catalog.find((c) => c.id === o.cardId));
    assert(t.entries.some((e) => e.text === "sending these over"),
      "written to the canonical partner-scoped thread");
    eq(shape(liveFor(g)), before, "and neither stage nor nextActor moved");
  });

  test("partner messages and lifecycle events render inline, in order", () => {
    const r0 = mk();
    const o = oppAt("select-trade");
    const g = goalOf(o);
    TR.act(() => { acts().sendMessage({ collectorId: ME, partnerId: o.partnerId,
      cardId: o.cardId, by: "collector", text: "FROM-ME", at: "2026-08-17" }); });
    TR.act(() => { acts().logMilestone({ collectorId: ME, partnerId: o.partnerId,
      cardId: o.cardId, text: "Price agreed", oppId: o.id, at: "2026-08-17" }); });
    TR.act(() => { acts().sendMessage({ collectorId: ME, partnerId: o.partnerId,
      cardId: o.cardId, by: "tp", text: "FROM-THEM", at: "2026-08-17" }); });

    let r; TR.act(() => { r = TR.create(React.createElement(App)); });
    const card = expand(r, g);
    const panel = cls(card, "chat-embed")[0];
    assert(/FROM-ME/.test(txt(panel)) && /FROM-THEM/.test(txt(panel)), "both sides render");
    assert(cls(panel, "chat-ev").length >= 1, "the event keeps its own treatment");
    const t = D.findThread(S().conversations, ME, o.partnerId,
      S().catalog.find((c) => c.id === o.cardId));
    eq(t.entries.map((e) => e.kind).join(","), "message,event,message", "chronological");
  });

  test("no chat drawer returns", () => {
    const r = mk();
    expand(r, goalOf(oppAt("select-trade")));
    eq(cls(r, "dw-chat").length, 0, "no drawer renders");
    const src = readSrc("collector/MetYetCollector.jsx");
    assert(!/dw-chat-ovl/.test(src.slice(src.indexOf("function Deal("))),
      "and no drawer markup remains in the workspace");
  });
});

describe("F. Ending and completing", () => {
  test("ending removes the inline Deal Flow and returns the Goal to pursuit", () => {
    const r0 = mk();
    const o = oppAt("select-trade");
    const g = goalOf(o);
    TR.act(() => { acts().sendMessage({ collectorId: ME, partnerId: o.partnerId,
      cardId: o.cardId, by: "collector", text: "HISTORY", at: "2026-08-17" }); });
    const convs = S().conversations.length;

    TR.act(() => { acts().endOpportunity(o.id, "collector", "2026-08-17"); });
    let r; TR.act(() => { r = TR.create(React.createElement(App)); });

    const card = cardFor(r, g);
    eq(cls(card, "goal-deal").length, 0, "the Deal Flow summary is gone");
    assert(!discloseIn(card), "and so is the disclosure");
    assert(S().goals.find((x) => x.id === g.id), "the Goal was not deleted");
    eq(D.goalState(g.id, S().opportunities), "seeking", "it is back to pursuit");
    eq(S().conversations.length, convs, "conversation history remains");
    assert(S().opportunities.find((x) => x.id === o.id).declined,
      "the terminal opportunity record remains");
    eq(S().opportunities.filter((x) => x.goalId === g.id && D.isActive(x)).length, 0,
      "and nothing was auto-started");
  });

  test("a completed deal leaves no active expandable Deal Flow", () => {
    const r0 = mk();
    const o = oppAt("fulfillment");
    const g = goalOf(o);
    TR.act(() => { acts().patchOpportunity(o.id, (x) => ({ ...x,
      stage: "completed", completedAt: "2026-08-17" })); });
    let r; TR.act(() => { r = TR.create(React.createElement(App)); });

    eq(D.goalState(g.id, S().opportunities), "satisfied", "existing Satisfied behaviour");
    const card = cardFor(r, g);
    if (card) {
      eq(cls(card, "goal-deal").length, 0, "no active Deal Flow summary remains");
      assert(!discloseIn(card), "and no disclosure remains");
    }
  });
});

describe("G. The review harness still works", () => {
  test("all five static examples collapse and expand", () => {
    ["agree-price", "select-trade", "value-trade", "deal", "fulfillment"].forEach((stage) => {
      const r = mk();
      const o = oppAt(stage);
      const g = goalOf(o);
      assert(cls(cardFor(r, g), "goal-deal")[0], stage + ": collapsed summary");
      const card = expand(r, g);
      assert(cls(card, "idf-stage")[0], stage + ": expands inline");
      assert(cls(card, "chat-embed")[0], stage + ": with conversation");
    });
  });

  test("reset and Secondary to Primary still work", () => {
    const r = mk();
    const rg = S().goals.find((g) => g.collectorId === ME && /^Review deal/.test(g.note || ""));
    const o = liveFor(rg);
    TR.act(() => { acts().patchOpportunity(o.id, (x) => ({ ...x,
      agreedPrice: 4032, stage: "value-trade" })); });
    let r2; TR.act(() => { r2 = TR.create(React.createElement(App)); });
    click(r2.root.findAllByType("button").find((b) => /^Reset (review|demo) deal$/.test(txt(b).trim())));
    eq(liveFor(rg).stage, "agree-price", "reset restored the starting fixture");

    const pg = S().goals.find((g) => g.collectorId === ME && /^Review promotion/.test(g.note || ""));
    const opps = S().opportunities.length;
    TR.act(() => { acts().updateGoalTier(pg.id, "primary"); });
    eq(S().goals.find((g) => g.id === pg.id).tier, "primary", "promotion still works");
    eq(S().opportunities.length, opps, "creating no opportunity");
  });
});

require("./run.cjs").run();
