/* ============================================================================
   ACTIVE DEAL RE-ENTRY AND ALTERNATIVE PARTNERS

   Two product rules, both resting on the canonical model rather than on screen
   logic:

   1. An active deal is ALWAYS reachable. Owning no stage action means there is
      nothing to do — not that the deal, or the conversation inside it, becomes
      unreachable. Viewing must mutate nothing.
   2. Conversation is not negotiation. The collector may talk to any partner
      holding the card while a deal is live; only the OFFER is limited to one at
      a time, and that limit is the domain's (INVARIANTS.oneNegotiationPerGoal),
      not this screen's.
   ========================================================================= */

const { describe, test, assert, eq } = require("./run.cjs");
const TR = require("react-test-renderer");
const D = require("../domain/metyet-domain.js");
const React = require("react");
const App = require("../dist/Collector.cjs").default;
const { __store } = require("../dist/Collector.cjs");
const { buildCanonicalSeed } = require("../dist/MetYet.cjs");

/* Each render starts from the same shared universe, so one test cannot leak
   state into the next. */
const mountCollector = () => {
  __store.reset(buildCanonicalSeed());
  let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r;
};
/* Re-render against the CURRENT store without resetting it. */
const remount = () => { let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r; };

const txt = (n) => {
  if (!n) return "";
  const s = [];
  const walk = (x) => {
    if (x == null || x === false) return;
    if (typeof x === "string" || typeof x === "number") { s.push(String(x)); return; }
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x.children) x.children.forEach(walk);
  };
  walk(n);
  return s.join(" ");
};
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));
const btn = (r, s) => r.root.findAllByType("button").find((b) => txt(b).trim() === s);
const disclosure = (r, node) => ((node || r.root).findAllByType("button")
  .find((b) => String(b.props.className || "").includes("goal-deal")));
const btns = (r, re) => r.root.findAllByType("button").filter((b) => re.test(txt(b).trim()));
const CHAT = /^(Chat|Continue chatting)$/;

const S = () => __store.get().get();
const acts = () => __store.get().actions;
const liveOpp = () => S().opportunities.find((o) => o.collectorId === "c12" && D.isActive(o));

/* The canonical snapshot re-entry must not disturb. */
const dealShape = (o) => JSON.stringify({
  stage: o.stage, agreedPrice: o.agreedPrice, declined: o.declined,
  priceThread: o.priceThread, trade: o.trade, deal: o.deal,
  fulfillment: o.fulfillment, completedAt: o.completedAt,
  actor: D.nextActor(o).actor, reason: D.nextActor(o).reason,
});

/* Hand the turn to the partner through canonical state: at Select Trade, cards
   submitted and still proposed means the partner is the one who must act. */
const handToPartner = (oppId) => {
  const copy = S().binder.find((b) => b.collectorId === "c12");
  TR.act(() => { acts().patchOpportunity(oppId, (x) => ({ ...x,
    stage: "select-trade",
    trade: { submitted: true,
      cards: [{ binderId: copy.id, cardId: copy.cardId, inclusion: "proposed" }] } })); });
};

describe("Active deal re-entry", () => {
  test("a deal owned by the partner is still reachable", () => {
    const r = mountCollector();
    const o = liveOpp();
    assert(o, "a live negotiation exists");

    /* Force the partner to own the turn: the collector has nothing to do. */
    handToPartner(o.id);
    const after = liveOpp();
    eq(D.nextActor(after).actor, "partner", "the partner owns the turn");

    const r2 = remount();
    /* The deal must still be openable — waiting is not a locked door. */
    assert(disclosure(r2), "the Deal Flow can still be opened while waiting");
    assert(txt(r2.root).includes("Waiting on"), "and the wait is stated plainly");
    r.unmount(); r2.unmount();
  });

  test("viewing a waiting deal mutates neither stage nor turn", () => {
    mountCollector();
    const o = liveOpp();
    handToPartner(o.id);

    const r = remount();
    const before = dealShape(liveOpp());
    click(disclosure(r));
    const after = dealShape(liveOpp());
    eq(after, before, "opening the deal changed nothing at all");
    eq(D.nextActor(liveOpp()).actor, "partner", "nextActor is untouched");
  });

  test("chat is reachable from inside a deal the collector cannot act on", () => {
    mountCollector();
    const o = liveOpp();
    handToPartner(o.id);

    const r = remount();
    const before = dealShape(liveOpp());
    click(disclosure(r));
    /* Conversation is part of the workspace now: nothing to open, nothing to tap. */
    const chat = cls(r, "chat-embed")[0];
    assert(chat, "the conversation is present inline");
    assert(chat.findAllByType("textarea").length === 1, "with its composer");
    eq(cls(r, "dw-chat").length, 0, "and no drawer exists");
    eq(dealShape(liveOpp()), before, "reaching it mutated no deal state");
  });

  test("sending a message while waiting does not change the turn", () => {
    mountCollector();
    const o = liveOpp();
    handToPartner(o.id);

    const r = remount();
    click(disclosure(r));
    const before = dealShape(liveOpp());
    const panel = cls(r, "chat-embed")[0];
    const ta = panel.findAllByType("textarea")[0];
    TR.act(() => { ta.props.onChange({ target: { value: "any news?" } }); });
    click(panel.findAllByType("button").find((b) => txt(b).trim() === "Send"));

    eq(dealShape(liveOpp()), before, "the deal is untouched by the message");
    const t = D.findThread(S().conversations, "c12", liveOpp().partnerId,
      S().catalog.find((c) => c.id === liveOpp().cardId));
    assert(t.entries.some((e) => e.text === "any news?"), "but the message was recorded");
  });
});

describe("Alternative Trusted Partners", () => {
  const openWhoHasIt = (r) => {
    const o = liveOpp();
    const g = S().goals.find((x) => x.id === o.goalId);
    const name = S().catalog.find((c) => c.id === g.cardId).name;
    const row = cls(r, "goal").concat(cls(r, "gwatch-r")).find((n) => txt(n).includes(name));
    const route = (cls(row, "goal-holders")[0] || cls(row, "gwatch-h")[0]);
    assert(route, "the supply route is available during a live deal");
    click(route);
    return o;
  };

  test("every holder stays contactable while a deal is live", () => {
    const r = mountCollector();
    const o = openWhoHasIt(r);
    const holders = S().inventory.filter((i) => i.cardId === o.cardId && !i.archived);
    assert(holders.length >= 2, "the card has alternatives");
    assert(btns(r, CHAT).length >= 2, "every partner offers a conversation");
  });

  test("the current partner is marked and their deal re-enterable", () => {
    const r = mountCollector();
    const o = openWhoHasIt(r);
    assert(txt(r.root).includes("CURRENT DEAL"), "the deal partner is marked");
    assert(btn(r, "View Deal"), "and their deal is one tap away");
    eq(cls(r, "whi-current").length, 1, "exactly one partner is the current deal");
    assert(txt(r.root).includes(S().partners.find((p) => p.id === o.partnerId).name),
      "named, not merely implied");
  });

  test("no dead 'Reached out' control remains", () => {
    const r = mountCollector();
    openWhoHasIt(r);
    eq(btns(r, /^Reached out$/).length, 0, "the misleading disabled control is gone");
    btns(r, CHAT).forEach((b) => assert(!b.props.disabled,
      "and no conversation control is ever disabled"));
  });

  test("chatting to an alternative creates NO opportunity", () => {
    const r = mountCollector();
    const o = openWhoHasIt(r);
    const oppsBefore = S().opportunities.length;
    const stageBefore = o.stage;

    /* Talk to a partner who is NOT the one being negotiated with. */
    const rows = cls(r, "pick").filter((n) => !String(n.props.className).includes("whi-current"));
    assert(rows.length >= 1, "an alternative partner is listed");
    click(rows[0].findAllByType("button").find((b) => CHAT.test(txt(b).trim())));
    const ta = r.root.findAllByType("textarea")[0];
    TR.act(() => { ta.props.onChange({ target: { value: "What would you take?" } }); });
    click(r.root.findAllByType("button").find((b) => txt(b).trim() === "Send"));

    eq(S().opportunities.length, oppsBefore, "no Opportunity was created");
    eq(liveOpp().id, o.id, "the live deal is still the same one");
    eq(liveOpp().stage, stageBefore, "at the same stage");

    /* And the alternative's thread inherits nothing from the live deal. */
    const alt = S().conversations.find((t) => t.entries.some((e) => e.text === "What would you take?"));
    assert(alt, "the alternative conversation exists");
    assert(alt.partnerId !== o.partnerId, "with a different partner");
    eq(alt.oppId, null, "and carries no opportunity");
  });

  test("a second Deal Flow is blocked canonically, not by hiding a button", () => {
    const r = mountCollector();
    const o = openWhoHasIt(r);
    eq(btns(r, /^Make an offer$/).length, 0, "the UI offers no second negotiation");

    /* The rule is the domain's: calling the action directly is refused too. */
    const other = S().inventory.find((i) => i.cardId === o.cardId && i.partnerId !== o.partnerId);
    assert(other, "another partner holds the card");
    const res = acts().startOpportunity({ goalId: o.goalId, collectorId: "c12",
      partnerId: other.partnerId, cardId: o.cardId, invId: other.invId,
      listedPrice: other.ask, amount: 100, at: "2026-08-16" });
    assert(res && res.refused === D.REFUSE.alreadyNegotiating,
      "the domain refuses a second negotiation on that goal");
    eq(S().opportunities.filter((x) => x.goalId === o.goalId && D.isActive(x)).length, 1,
      "still exactly one active negotiation");
  });

  test("after the deal ends an alternative can become the new partner, history intact", () => {
    const r = mountCollector();
    const o = openWhoHasIt(r);
    const other = S().inventory.find((i) => i.cardId === o.cardId && i.partnerId !== o.partnerId);

    /* Talk to both, so both have history worth preserving. */
    TR.act(() => { acts().sendMessage({ collectorId: "c12", partnerId: o.partnerId,
      cardId: o.cardId, by: "collector", text: "WITH-CURRENT", at: "2026-08-16" }); });
    TR.act(() => { acts().sendMessage({ collectorId: "c12", partnerId: other.partnerId,
      cardId: o.cardId, by: "collector", text: "WITH-ALTERNATIVE", at: "2026-08-16" }); });
    const convBefore = S().conversations.length;

    TR.act(() => { acts().endOpportunity(o.id, "collector", "2026-08-16"); });

    eq(S().conversations.length, convBefore, "ending the deal erased no conversation");
    const withCurrent = S().conversations.find((t) => t.entries.some((e) => e.text === "WITH-CURRENT"));
    const withAlt = S().conversations.find((t) => t.entries.some((e) => e.text === "WITH-ALTERNATIVE"));
    assert(withCurrent && withAlt, "both histories survive");

    /* The alternative may now become the deal partner. */
    const res = acts().startOpportunity({ goalId: o.goalId, collectorId: "c12",
      partnerId: other.partnerId, cardId: o.cardId, invId: other.invId,
      listedPrice: other.ask, amount: other.ask, at: "2026-08-16" });
    assert(typeof res === "string", "a new negotiation opens with the alternative");
    eq(S().opportunities.filter((x) => x.goalId === o.goalId && D.isActive(x)).length, 1,
      "and still only one is active");

    /* The new deal inherits the conversation already held with THAT partner. */
    TR.act(() => { acts().logMilestone({ collectorId: "c12", partnerId: other.partnerId,
      cardId: o.cardId, text: "Collector made an offer", oppId: res, at: "2026-08-16" }); });
    const t = D.findThread(S().conversations, "c12", other.partnerId,
      S().catalog.find((c) => c.id === o.cardId));
    eq(t.oppId, res, "the new opportunity is inherited by that partner's thread");
    assert(t.entries.some((e) => e.text === "WITH-ALTERNATIVE"),
      "and the conversation held before the deal is still there");
    assert(!t.entries.some((e) => e.text === "WITH-CURRENT"),
      "without absorbing the previous partner's conversation");
  });
});

describe("Conversation is visibly not negotiation", () => {
  test("an alternative chat says so, and offers no deal controls", () => {
    const r = mountCollector();
    const o = liveOpp();
    const g = S().goals.find((x) => x.id === o.goalId);
    const other = S().inventory.find((i) => i.cardId === g.cardId && i.partnerId !== o.partnerId);
    assert(other, "an alternative exists");

    const name = S().catalog.find((c) => c.id === g.cardId).name;
    const row = cls(r, "goal").concat(cls(r, "gwatch-r")).find((n) => txt(n).includes(name));
    click(cls(row, "goal-holders")[0] || cls(row, "gwatch-h")[0]);
    const alt = cls(r, "pick").filter((n) => !String(n.props.className).includes("whi-current"))[0];
    click(alt.findAllByType("button").find((b) => CHAT.test(txt(b).trim())));

    assert(/not a negotiation/.test(txt(r.root)), "the banner distinguishes the two acts");
    eq(btns(r, /^Make an offer$/).length, 0, "and offers no way to start a deal");
    eq(cls(r, "pc-banner").filter((n) => String(n.props.className).includes("is-deal")).length, 0,
      "it is not dressed as the current deal");
  });

  test("the current partner's chat is marked as the deal", () => {
    const r = mountCollector();
    const o = liveOpp();
    const g = S().goals.find((x) => x.id === o.goalId);
    const name = S().catalog.find((c) => c.id === g.cardId).name;
    const row = cls(r, "goal").concat(cls(r, "gwatch-r")).find((n) => txt(n).includes(name));
    click(cls(row, "goal-holders")[0] || cls(row, "gwatch-h")[0]);
    const cur = cls(r, "whi-current")[0];
    click(cur.findAllByType("button").find((b) => CHAT.test(txt(b).trim())));

    assert(/current deal/i.test(txt(r.root)), "it says this is the deal");
    assert(btn(r, "View Deal"), "and routes into the Deal Flow");
  });
});

require("./run.cjs").run();
