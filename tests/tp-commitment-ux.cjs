/* ============================================================================
   ONE SETTLEMENT PATH, AND THE MOMENTS THAT COMMIT

   The previous pass built the copy-commitment invariant and routed the
   Collector's acceptance through it — but the Trusted Partner's own accept
   still wrote `agreedPrice` directly. A rule only one seat obeys is not a rule,
   so a partner could have committed a copy another deal had already taken.

   This suite holds the closure of that hole, and the two explanations that
   belong to the two commitments:

     COLLECTOR  before the first offer for a goal — "this starts an active deal"
     PARTNER    before settling a price — "this commits the copy"

   Neither explanation is a second source of truth. Both refuse through the same
   canonical action, and a blocked collector is told the copy is spoken for
   without learning by whom or for how much.
   ========================================================================= */

process.env.METYET_DEV = "1";

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const D = require("../domain/metyet-domain.js");
const { createStore } = require("../domain/metyet-store.js");
const App = require("../dist/Collector.cjs").default;
const { __store } = require("../dist/Collector.cjs");
const M = require("../dist/MetYet.cjs");

const readSrc = (rel) => require("fs").readFileSync(require("path").join(__dirname, "..", rel), "utf8");
const COL = readSrc("collector/MetYetCollector.jsx");
const TP = readSrc("src/MetYet.jsx");
const STORE = readSrc("domain/metyet-store.js");
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

const CHAR = { id: "k1", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };
const BLAST = { id: "k2", name: "Blastoise", set: "Base Set", number: "2", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };
const world = () => createStore({
  catalog: [CHAR, BLAST],
  collectors: [{ id: "casey", name: "Casey", prefs: [] }, { id: "jordan", name: "Jordan", prefs: [] }],
  partners: [{ id: "nl", name: "Northline Cards" }],
  goals: [], binder: [], interests: [], conversations: [], opportunities: [],
  preferences: [], photoRequests: [], copyReviews: [],
  inventory: [
    { invId: "inv-1", partnerId: "nl", cardId: "k1", ask: 4200, archived: false,
      photos: { front: null, back: null } },
    { invId: "inv-2", partnerId: "nl", cardId: "k2", ask: 900, archived: false,
      photos: { front: null, back: null } },
  ],
});
const goalFor = (st, who, cardId) =>
  st.actions.addGoal({ collectorId: who, cardId, tier: "primary", at: AT });
const offer = (st, goalId, who, invId, cardId, amount) =>
  st.actions.startOpportunity({ goalId, collectorId: who, partnerId: "nl", cardId,
    invId, listedPrice: 4200, amount: amount || 3700, at: AT });
const committed = (st, invId) => D.INVARIANTS.copyCommittedTo(invId, st.get().opportunities);

describe("A. There is exactly one way to settle a price", () => {
  test("no runtime path writes agreedPrice except the canonical action", () => {
    const writes = [];
    [["domain/metyet-store.js", STORE], ["src/MetYet.jsx", TP],
      ["collector/MetYetCollector.jsx", COL]].forEach(([name, src]) => {
      src.split("\n").forEach((line, i) => {
        if (/agreedPrice:/.test(line) && !/agreedPrice: null/.test(line)) {
          writes.push(name + ":" + (i + 1));
        }
      });
    });
    eq(writes.length, 1, "one write site, not several: " + writes.join(", "));
    assert(/^domain\/metyet-store\.js/.test(writes[0]),
      "and it is in the domain, inside agreePrice");
  });

  test("both seats call the canonical action", () => {
    assert(/A\.agreePrice\(\{ oppId: id/.test(COL), "the Collector's accept");
    assert(/store\.actions\.agreePrice\(\{ oppId, by/.test(TP), "the Partner's accept");
    /* Even the dev simulator, which could otherwise fake an impossible state. */
    assert(/A\.agreePrice\(\{ oppId: o\.id, amount: last\.amount, by: "partner"/.test(COL),
      "and the TP simulator");
  });

  test("no dead acceptance branch was left behind", () => {
    assert(!/if \(false\)/.test(COL), "no disabled code pretending to be a path");
  });

  test("the invariant lives with the action, once", () => {
    const fn = STORE.slice(STORE.indexOf("agreePrice({"), STORE.indexOf("REVIEWING A SPECIFIC COPY"));
    assert(/copyCommittedTo\(o\.invId/.test(fn), "it checks the physical copy");
    assert(/REFUSE\.copyCommitted/.test(fn), "and refuses");
    /* Neither app re-implements the rule. */
    [COL, TP].forEach((src) => assert(!/copyCommittedTo\(/.test(src),
      "no app re-derives the commitment rule"));
  });
});

describe("B. The partner's seat is now bound by it", () => {
  test("a partner cannot settle a copy another deal has settled", () => {
    const st = world();
    const gc = goalFor(st, "casey", "k1");
    const gj = goalFor(st, "jordan", "k1");
    const a = offer(st, gc, "casey", "inv-1", "k1");
    const b = offer(st, gj, "jordan", "inv-1", "k1", 3800);
    eq(st.actions.agreePrice({ oppId: a, amount: 3700, by: "tp", at: AT }), a, "the first settles");
    const blocked = st.actions.agreePrice({ oppId: b, amount: 3800, by: "tp", at: AT });
    eq(blocked.refused, D.REFUSE.copyCommitted, "the second cannot");
  });

  test("the blocked deal is left completely untouched", () => {
    const st = world();
    const gc = goalFor(st, "casey", "k1");
    const gj = goalFor(st, "jordan", "k1");
    const a = offer(st, gc, "casey", "inv-1", "k1");
    const b = offer(st, gj, "jordan", "inv-1", "k1", 3800);
    st.actions.agreePrice({ oppId: a, amount: 3700, by: "tp", at: AT });
    const before = JSON.stringify(st.get().opportunities.find((o) => o.id === b));
    st.actions.agreePrice({ oppId: b, amount: 3800, by: "tp", at: AT });
    eq(JSON.stringify(st.get().opportunities.find((o) => o.id === b)), before,
      "nothing was written to it — not the price, not the stage, not the thread");
  });

  test("a losing deal cannot creep forward into Select Trade", () => {
    const st = world();
    const gc = goalFor(st, "casey", "k1");
    const gj = goalFor(st, "jordan", "k1");
    const a = offer(st, gc, "casey", "inv-1", "k1");
    const b = offer(st, gj, "jordan", "inv-1", "k1", 3800);
    st.actions.agreePrice({ oppId: a, amount: 3700, by: "tp", at: AT });
    st.actions.agreePrice({ oppId: b, amount: 3800, by: "tp", at: AT });
    const lost = st.get().opportunities.find((o) => o.id === b);
    eq(lost.stage, "agree-price", "it stays where it was");
    eq(lost.agreedPrice, null, "with no settled price to carry forward");
  });

  test("the refusal tells a blocked collector nothing about the other one", () => {
    const st = world();
    const gc = goalFor(st, "casey", "k1");
    const gj = goalFor(st, "jordan", "k1");
    const a = offer(st, gc, "casey", "inv-1", "k1");
    const b = offer(st, gj, "jordan", "inv-1", "k1", 3800);
    st.actions.agreePrice({ oppId: a, amount: 3700, by: "tp", at: AT });
    const r = JSON.stringify(st.actions.agreePrice({ oppId: b, amount: 3800, by: "tp", at: AT }));
    assert(!/casey/i.test(r), "no identity");
    assert(!/3700/.test(r), "no amount");
    /* And the partner's own message says no more than that. */
    assert(/already committed to another deal/.test(TP), "the partner is told plainly");
    assert(!/committed to (Casey|\$\{)/.test(TP), "without naming anybody");
  });

  test("a blocked collector keeps their history", () => {
    const st = world();
    const gc = goalFor(st, "casey", "k1");
    const gj = goalFor(st, "jordan", "k1");
    const a = offer(st, gc, "casey", "inv-1", "k1");
    const b = offer(st, gj, "jordan", "inv-1", "k1", 3800);
    st.actions.sendMessage({ collectorId: "jordan", partnerId: "nl", cardId: "k1",
      by: "collector", text: "keen on this one", at: AT });
    st.actions.agreePrice({ oppId: a, amount: 3700, by: "tp", at: AT });
    st.actions.agreePrice({ oppId: b, amount: 3800, by: "tp", at: AT });
    const t = D.findThread(st.get().conversations, "jordan", "nl", CHAR);
    assert(t && t.entries.some((e) => e.text === "keen on this one"), "the conversation stands");
    assert(st.get().opportunities.find((o) => o.id === b), "and their deal was not deleted");
  });

  test("the collector's UI explains the block without naming anyone", () => {
    const notice = COL.slice(COL.indexOf("{refused && ("), COL.indexOf("{refused && (") + 900);
    assert(/currently committed to another deal/.test(notice), "it says the copy is taken");
    assert(/keep reviewing/i.test(notice), "and that reviewing and talking continue");
    assert(!/\bwho\b|collectorId|amount/.test(notice), "naming nobody and quoting no price");
  });
});

describe("C. The collector is told what a first offer means", () => {
  const boot = () => { __store.reset(M.buildCanonicalSeed({ review: true, demoStage: "pre-deal" }));
    let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r; };
  const S = () => __store.get().get();

  test("the explanation is attached to submitting, not to reviewing", () => {
    /* CONTRACT CHANGE: the consequence is now stated IN the offer sheet beside
       the fields, and the separate confirmation dialog that repeated it is
       gone. The property is unchanged — the explanation belongs to the act that
       commits, and to nothing earlier. */
    const sheet = COL.slice(COL.indexOf('<Sheet title="Make an offer"') - 2200,
      COL.indexOf('<Sheet title="Make an offer"') + 3000);
    assert(/starts an active deal with \{p\.name\} for this goal/.test(sheet),
      "it explains the consequence, naming the partner and the goal");
    assert(/exclusively with them on it until the deal is completed or the\s+negotiation ends/
      .test(sheet), "and the scope of the exclusivity");
    assert(/Submit offer/.test(sheet), "with the CTA that performs it");
    assert(/Cancel/.test(sheet), "and a way out");
    /* And it belongs to the offer sheet, not to Review Card entry. */
    const rv = COL.slice(COL.indexOf("function ReviewCard("), COL.indexOf("function GoalCard("));
    assert(!/starts an active deal/.test(rv), "reviewing carries no such warning");
    const store = STORE.slice(STORE.indexOf("reviewCopy({"), STORE.indexOf("endReview("));
    assert(!/opportunit/i.test(store), "because reviewing starts nothing");
  });

  test("it does not repeat once the deal exists", () => {
    /* Counters run through priceRespond, which never opens the confirmation. */
    const fn = COL.slice(COL.indexOf("priceRespond: (id, action, amount)"),
      COL.indexOf("submitTrade:"));
    assert(!/confirmFirst|setConfirmFirst/.test(fn),
      "countering inside a live negotiation is not a new commitment");
  });

  test("only Submit offer creates anything", () => {
    const src = COL.slice(COL.indexOf("const submit = () =>"), COL.indexOf("const submit = () =>") + 700);
    assert(/st\.startOffer\(goalId, partnerId, n\)/.test(src),
      "only submit calls the canonical offer action");
    /* Opening the sheet, typing, and cancelling all create nothing: submit is
       the single call site, and it is wired to one button. */
    /* Two call sites, both deliberate: submitting, and the promote-then-continue
       path for a watchlist goal — which is the same offer, after the collector
       agrees to promote. Neither is reachable without an explicit press. */
    eq((COL.match(/st\.startOffer\(/g) || []).length, 2, "submit, and promote-then-submit");
    assert(/st\.setTier\(goalId, "primary"\);\s*\n\s*const res = st\.startOffer/.test(COL),
      "the second is the promotion path, not a stray duplicate");
    assert(/onClick=\{submit\}/.test(COL), "the CTA is wired to submit");
    assert(!/confirmFirst/.test(COL), "with no second dialog in between");
  });

  test("requesting photos triggers no such explanation", () => {
    const r = boot();
    const before = S().opportunities.length;
    const inv = S().inventory.find((i) => i.cardId
      === S().goals.find((g) => /^Review deal/.test(g.note || "")).cardId);
    TR.act(() => { __store.get().actions.requestPhotos({ collectorId: "c12",
      partnerId: inv.partnerId, invId: inv.invId, at: AT }); });
    eq(S().opportunities.length, before, "asking to see a card commits nothing");
    let r2; TR.act(() => { r2 = TR.create(React.createElement(App)); });
    assert(!/starts an active deal/.test(txt(r2.root)), "so nothing is explained about deals");
  });
});

describe("D. What the partner sees, and what it means", () => {
  test("reviewing, requesting and committing are three different states", () => {
    const st = world();
    const inv = "inv-1";
    /* 1. Reviewing — no task, no lock. */
    st.actions.reviewCopy({ collectorId: "casey", partnerId: "nl", invId: inv, at: AT });
    eq(st.get().photoRequests.length, 0, "reviewing asks the partner for nothing");
    eq(committed(st, inv), null, "and commits nothing");

    /* 2. A request — a real task, still no lock. */
    st.actions.requestPhotos({ collectorId: "casey", partnerId: "nl", invId: inv, at: AT });
    eq(st.get().photoRequests.filter((r) => !r.fulfilledAt).length, 1, "now there is work to do");
    eq(committed(st, inv), null, "but still nothing is committed");

    /* 3. A settled price — the lock. */
    const g = goalFor(st, "casey", "k1");
    const o = offer(st, g, "casey", inv, "k1");
    eq(committed(st, inv), null, "an offer alone is still not commitment");
    st.actions.agreePrice({ oppId: o, amount: 3700, by: "tp", at: AT });
    assert(committed(st, inv), "settling the price is");
  });

  test("the partner's surface distinguishes reviewing from a photo task", () => {
    const comp = TP.slice(TP.indexOf("function PhotoDemand("), TP.indexOf("function InventoryRow("));
    assert(/is reviewing this copy/.test(comp), "reviewing is stated as awareness");
    assert(/still needed|Add actual card photos/.test(comp), "a request is stated as work");
    assert(!/committed|reserve|lock/i.test(comp), "and neither implies a lock");
  });

  test("commitment is derived, never stored", () => {
    const st = world();
    const g = goalFor(st, "casey", "k1");
    const o = offer(st, g, "casey", "inv-1", "k1");
    st.actions.agreePrice({ oppId: o, amount: 3700, by: "tp", at: AT });
    const copy = st.get().inventory.find((i) => i.invId === "inv-1");
    assert(!("committed" in copy), "no flag was written to the inventory copy");
    assert(!("committedTo" in copy), "nor any owner");
    eq(committed(st, "inv-1").id, o, "it is read from the deal itself");
  });
});

describe("E. Before, after, and afterwards again", () => {
  test("several offers may stand on one copy before it is settled", () => {
    const st = world();
    const a = offer(st, goalFor(st, "casey", "k1"), "casey", "inv-1", "k1");
    const b = offer(st, goalFor(st, "jordan", "k1"), "jordan", "inv-1", "k1", 3800);
    assert(typeof a === "string" && typeof b === "string", "both are allowed");
    eq(committed(st, "inv-1"), null, "and the copy is free until one settles");
  });

  test("once settled, a new offer on that copy is refused", () => {
    const st = world();
    const a = offer(st, goalFor(st, "casey", "k1"), "casey", "inv-1", "k1");
    st.actions.agreePrice({ oppId: a, amount: 3700, by: "tp", at: AT });
    const late = offer(st, goalFor(st, "jordan", "k1"), "jordan", "inv-1", "k1", 4000);
    eq(late.refused, D.REFUSE.copyCommitted, "there is nothing left to negotiate over");
  });

  test("reviewing that copy is still allowed after it is committed", () => {
    const st = world();
    const a = offer(st, goalFor(st, "casey", "k1"), "casey", "inv-1", "k1");
    st.actions.agreePrice({ oppId: a, amount: 3700, by: "tp", at: AT });
    const id = st.actions.reviewCopy({ collectorId: "jordan", partnerId: "nl",
      invId: "inv-1", at: AT });
    assert(typeof id === "string", "looking at a card is never exclusive");
  });

  test("a different copy is entirely unaffected", () => {
    const st = world();
    const a = offer(st, goalFor(st, "casey", "k1"), "casey", "inv-1", "k1");
    st.actions.agreePrice({ oppId: a, amount: 3700, by: "tp", at: AT });
    const b = offer(st, goalFor(st, "jordan", "k2"), "jordan", "inv-2", "k2", 800);
    assert(typeof b === "string", "another copy may be offered on");
    eq(st.actions.agreePrice({ oppId: b, amount: 800, by: "tp", at: AT }), b,
      "and settled at the same time");
  });

  test("ending the deal frees the copy again", () => {
    const st = world();
    const a = offer(st, goalFor(st, "casey", "k1"), "casey", "inv-1", "k1");
    const b = offer(st, goalFor(st, "jordan", "k1"), "jordan", "inv-1", "k1", 3800);
    st.actions.agreePrice({ oppId: a, amount: 3700, by: "tp", at: AT });
    st.actions.endOpportunity(a, "collector", AT);
    eq(committed(st, "inv-1"), null, "an ended deal holds nothing");
    eq(st.actions.agreePrice({ oppId: b, amount: 3800, by: "tp", at: AT }), b,
      "and the waiting deal may settle");
  });

  test("a sold copy stays gone", () => {
    const st = world();
    const a = offer(st, goalFor(st, "casey", "k1"), "casey", "inv-1", "k1");
    st.actions.agreePrice({ oppId: a, amount: 3700, by: "tp", at: AT });
    st.actions.patchOpportunity(a, (o) => ({ ...o, stage: "completed", completedAt: AT }));
    st.actions.removeInventoryCopy("inv-1");
    eq(offer(st, goalFor(st, "jordan", "k1"), "jordan", "inv-1", "k1", 4000).refused,
      D.REFUSE.copyUnavailable, "unavailable, not merely uncommitted");
  });

  test("the collector's own rule is still per goal", () => {
    const st = world();
    const g = goalFor(st, "casey", "k1");
    offer(st, g, "casey", "inv-1", "k1");
    eq(offer(st, g, "casey", "inv-1", "k1", 3900).refused, D.REFUSE.alreadyNegotiating,
      "one deal per goal");
    const g2 = goalFor(st, "casey", "k2");
    assert(typeof offer(st, g2, "casey", "inv-2", "k2", 800) === "string",
      "and other goals are unaffected");
  });
});

describe("F. Nothing else moved", () => {
  test("the pursuit and receipt models are unchanged", () => {
    eq(D.PURSUIT_STEPS.length, 6, "six visible pursuit steps");
    eq(D.RECEIPT_STAGES.length, 5, "five negotiation stages");
  });

  test("settling still advances to Select Trade with a package and a record", () => {
    const st = world();
    const a = offer(st, goalFor(st, "casey", "k1"), "casey", "inv-1", "k1");
    st.actions.agreePrice({ oppId: a, amount: 3700, by: "tp", at: AT });
    const o = st.get().opportunities.find((x) => x.id === a);
    eq(o.stage, "select-trade", "the next stage");
    assert(o.trade && Array.isArray(o.trade.cards), "with a package");
    eq(D.lastEntry(o.priceThread).type, "accept", "and the acceptance in the thread");
    eq(D.lastEntry(o.priceThread).by, "tp", "attributed to whoever accepted");
  });

  test("counters remain ordinary edits", () => {
    const st = world();
    const a = offer(st, goalFor(st, "casey", "k1"), "casey", "inv-1", "k1");
    st.actions.patchOpportunity(a, (o) => ({ ...o,
      priceThread: [...o.priceThread, { by: "tp", type: "counter", amount: 4000, at: AT }] }));
    const o = st.get().opportunities.find((x) => x.id === a);
    eq(o.agreedPrice, null, "a counter settles nothing");
    eq(committed(st, "inv-1"), null, "and commits nothing");
  });

  test("photos stay shared enrichment of the copy", () => {
    const st = world();
    st.actions.reviewCopy({ collectorId: "casey", partnerId: "nl", invId: "inv-1", at: AT });
    st.actions.reviewCopy({ collectorId: "jordan", partnerId: "nl", invId: "inv-1", at: AT });
    st.actions.addCopyPhotos({ invId: "inv-1", front: "f", back: "b", at: AT });
    assert(D.INVARIANTS.copyPhotographed(st.get().inventory
      .find((i) => i.invId === "inv-1").photos), "both reviewers see the card");
    eq(D.INVARIANTS.copyPhotographed(st.get().inventory
      .find((i) => i.invId === "inv-2").photos), false, "and another copy is untouched");
  });
});

require("./run.cjs").run();
