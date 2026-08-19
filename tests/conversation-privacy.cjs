/* ============================================================================
   CROSS-PARTNER CONVERSATION PRIVACY

   A Conversation is between a Collector and a Trusted Partner (Contract §
   "Conversation ──between──> Collector + TrustedPartner", visibility
   "participants only"). The canonical key is therefore

       collectorId :: partnerId :: card identity

   These tests prove the boundary that key exists to enforce: two partners
   holding the SAME card identity hold two separate private threads, neither
   able to read the other, while "one conversation, all stages" still holds
   within each collector-partner-card relationship.
   ========================================================================= */

const { describe, test, assert, eq } = require("./run.cjs");
const D = require("../domain/metyet-domain.js");
const E = require("../domain/metyet-entities.js");
const { createStore } = require("../domain/metyet-store.js");
const { collectorView } = require("../domain/collector-view.js");

const AT = "2026-08-14";
const CARD = { id: "k1", name: "Rayquaza", set: "Evolving Skies", number: "218/203",
  variant: "Alt Art", edition: "Standard", language: "English", grade: "PSA 10", condition: null };
const OTHER = { id: "k2", name: "Charizard", set: "Base Set", number: "4",
  variant: "Holo", edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };

/* Two partners hold the very same identity — the case the old key collapsed. */
const world = () => createStore({
  catalog: [CARD, OTHER],
  collectors: [{ id: "c1", name: "Casey", prefs: [] }],
  partners: [{ id: "p2", name: "Rina" }, { id: "p3", name: "Marcus" }],
  goals: [], binder: [], interests: [], conversations: [], opportunities: [],
  preferences: [],
  /* Photographed: these tests are about who can read a conversation, not about
     photography, so the copies must be ones a collector could negotiate over. */
  inventory: [
    { invId: "i-p2", partnerId: "p2", cardId: "k1", ask: 9450, archived: false,
      photos: { front: "copy:i-p2:front", back: "copy:i-p2:back" } },
    { invId: "i-p3", partnerId: "p3", cardId: "k1", ask: 10200, archived: false,
      photos: { front: "copy:i-p3:front", back: "copy:i-p3:back" } },
  ],
});

/* How each Trusted Partner workspace actually reads state: scoped to itself. */
const asPartner = (s, partnerId) => ({
  conversations: s.conversations.filter((c) => c.partnerId === partnerId),
  opportunities: s.opportunities.filter((o) => o.partnerId === partnerId),
});
const textsSeenBy = (s, partnerId) => asPartner(s, partnerId).conversations
  .flatMap((t) => t.entries.map((e) => e.text));

describe("Two partners, one card identity, two private threads", () => {
  test("separate threads are created, keyed on the partner", () => {
    const st = world();
    st.actions.reachOut({ collectorId: "c1", partnerId: "p2", cardId: "k1",
      text: "Is yours still available?", at: AT });
    st.actions.reachOut({ collectorId: "c1", partnerId: "p3", cardId: "k1",
      text: "What would you take for yours?", at: AT });

    const cs = st.get().conversations;
    eq(cs.length, 2, "two Conversations, not one merged thread");
    eq(cs[0].key, D.threadKey("c1", "p2", CARD), "the first is keyed to p2");
    eq(cs[1].key, D.threadKey("c1", "p3", CARD), "the second is keyed to p3");
    assert(cs[0].key !== cs[1].key, "the keys genuinely differ");
    eq(cs[0].cardId, cs[1].cardId, "about the very same card identity");
  });

  test("neither partner can read the other's entries", () => {
    const st = world();
    st.actions.sendMessage({ collectorId: "c1", partnerId: "p2", cardId: "k1",
      by: "collector", text: "RINA-ONLY: can you do 8800?", at: AT });
    st.actions.sendMessage({ collectorId: "c1", partnerId: "p3", cardId: "k1",
      by: "collector", text: "MARCUS-ONLY: Rina offered lower", at: AT });

    const s = st.get();
    const rina = textsSeenBy(s, "p2");
    const marcus = textsSeenBy(s, "p3");

    eq(rina.length, 1, "Rina sees exactly her own thread's entries");
    eq(marcus.length, 1, "Marcus sees exactly his own");
    assert(rina.some((t) => /RINA-ONLY/.test(t)), "Rina sees what was said to her");
    assert(!rina.some((t) => /MARCUS-ONLY/.test(t)), "Rina CANNOT see what was said to Marcus");
    assert(marcus.some((t) => /MARCUS-ONLY/.test(t)), "Marcus sees what was said to him");
    assert(!marcus.some((t) => /RINA-ONLY/.test(t)), "Marcus CANNOT see what was said to Rina");
  });

  test("a partner's own lookup finds only their thread", () => {
    const st = world();
    st.actions.sendMessage({ collectorId: "c1", partnerId: "p2", cardId: "k1",
      by: "tp", text: "Still here", at: AT });

    const s = st.get();
    assert(D.findThread(s.conversations, "c1", "p2", CARD), "p2 finds their thread");
    eq(D.findThread(s.conversations, "c1", "p3", CARD), null,
      "p3 finds nothing — silence, not somebody else's conversation");
    eq(D.hasConversation(s.conversations, "c1", "p2", CARD), true, "p2 has a conversation");
    eq(D.hasConversation(s.conversations, "c1", "p3", CARD), false, "p3 does not");
  });

  test("a TP milestone never lands in another partner's thread", () => {
    const st = world();
    st.actions.sendMessage({ collectorId: "c1", partnerId: "p2", cardId: "k1",
      by: "collector", text: "opening", at: AT });
    st.actions.sendMessage({ collectorId: "c1", partnerId: "p3", cardId: "k1",
      by: "collector", text: "opening", at: AT });
    st.actions.logMilestone({ collectorId: "c1", partnerId: "p2", cardId: "k1",
      text: "Price agreed at $8,800", at: AT });

    const s = st.get();
    assert(textsSeenBy(s, "p2").some((t) => /Price agreed/.test(t)), "p2 sees the milestone");
    assert(!textsSeenBy(s, "p3").some((t) => /Price agreed/.test(t)),
      "p3 never learns the terms agreed with p2");
  });

  test("the domain refuses a partnerless thread rather than merging one", () => {
    let threw = false;
    try { D.threadKey("c1", null, CARD); } catch (e) { threw = /partnerId is required/.test(e.message); }
    assert(threw, "a thread with no partner is a programming error, not a shared inbox");
    const st = world();
    eq(st.actions.reachOut({ collectorId: "c1", cardId: "k1", text: "hi", at: AT }), null,
      "and the store refuses it instead of writing one");
    eq(st.get().conversations.length, 0, "no thread was created");
  });
});

describe("One conversation, all stages — within the relationship", () => {
  test("messages and events share one thread per partner", () => {
    const st = world();
    st.actions.reachOut({ collectorId: "c1", partnerId: "p2", cardId: "k1", text: "one", at: AT });
    st.actions.logMilestone({ collectorId: "c1", partnerId: "p2", cardId: "k1",
      text: "Secondary Goal promoted to Primary Goal", at: AT });
    st.actions.sendMessage({ collectorId: "c1", partnerId: "p2", cardId: "k1",
      by: "tp", text: "two", at: AT });

    const mine = st.get().conversations.filter((t) => t.partnerId === "p2");
    eq(mine.length, 1, "still exactly ONE thread for that relationship");
    eq(mine[0].entries.map((e) => e.kind).join(","), "message,event,message",
      "messages and lifecycle events interleave chronologically");
  });

  test("the thread survives promotion and is inherited by that partner's deal", () => {
    const st = world();
    const gid = st.actions.addGoal({ collectorId: "c1", cardId: "k1", tier: "secondary", at: AT });
    st.actions.reachOut({ collectorId: "c1", partnerId: "p2", cardId: "k1",
      text: "early interest", at: AT });
    st.actions.updateGoalTier(gid, "primary");
    const oid = st.actions.startOpportunity({ goalId: gid, collectorId: "c1", partnerId: "p2",
      cardId: "k1", invId: "i-p2", listedPrice: 9450, amount: 8800, at: AT });
    assert(typeof oid === "string", "the negotiation opened");
    st.actions.sendMessage({ collectorId: "c1", partnerId: "p2", cardId: "k1",
      by: "collector", text: "during the deal", at: AT, oppId: oid });

    const mine = st.get().conversations.filter((t) => t.partnerId === "p2");
    eq(mine.length, 1, "one conversation across watchlist, pursuit and negotiation");
    eq(mine[0].oppId, oid, "and the opportunity is inherited by it");
    assert(mine[0].entries.some((e) => e.text === "early interest"), "pre-deal history is intact");
  });

  test("an opportunity inherits ONLY its own partner's thread", () => {
    const st = world();
    const gid = st.actions.addGoal({ collectorId: "c1", cardId: "k1", tier: "primary", at: AT });
    st.actions.reachOut({ collectorId: "c1", partnerId: "p2", cardId: "k1", text: "to Rina", at: AT });
    st.actions.reachOut({ collectorId: "c1", partnerId: "p3", cardId: "k1", text: "to Marcus", at: AT });
    const oid = st.actions.startOpportunity({ goalId: gid, collectorId: "c1", partnerId: "p2",
      cardId: "k1", invId: "i-p2", listedPrice: 9450, amount: 8800, at: AT });
    st.actions.logMilestone({ collectorId: "c1", partnerId: "p2", cardId: "k1",
      text: "Collector made an offer", oppId: oid, at: AT });

    const s = st.get();
    const rina = s.conversations.find((t) => t.partnerId === "p2");
    const marcus = s.conversations.find((t) => t.partnerId === "p3");
    eq(rina.oppId, oid, "the deal partner's thread carries the opportunity");
    eq(marcus.oppId, null, "the alternative's thread carries NO opportunity");
    assert(!marcus.entries.some((e) => /made an offer/.test(e.text)),
      "and never sees the offer milestone");
  });

  test("ending the deal erases no conversation history, on either side", () => {
    const st = world();
    const gid = st.actions.addGoal({ collectorId: "c1", cardId: "k1", tier: "primary", at: AT });
    st.actions.reachOut({ collectorId: "c1", partnerId: "p2", cardId: "k1", text: "to Rina", at: AT });
    st.actions.reachOut({ collectorId: "c1", partnerId: "p3", cardId: "k1", text: "to Marcus", at: AT });
    const oid = st.actions.startOpportunity({ goalId: gid, collectorId: "c1", partnerId: "p2",
      cardId: "k1", invId: "i-p2", listedPrice: 9450, amount: 8800, at: AT });
    const before = st.get().conversations.map((t) => [t.key, t.entries.length]);

    st.actions.endOpportunity(oid, "collector", AT);

    const after = st.get().conversations.map((t) => [t.key, t.entries.length]);
    eq(JSON.stringify(after), JSON.stringify(before),
      "every thread and every entry survives the deal ending");
    assert(st.get().conversations.every((t) => t.entries.length > 0), "nothing was emptied");
  });
});

describe("The Collector's side of the same fact", () => {
  const view = (st) => collectorView(st.get(), "c1");

  test("the collector sees every partner thread for one identity", () => {
    const st = world();
    st.actions.reachOut({ collectorId: "c1", partnerId: "p2", cardId: "k1", text: "to Rina", at: AT });
    st.actions.reachOut({ collectorId: "c1", partnerId: "p3", cardId: "k1", text: "to Marcus", at: AT });

    const v = view(st);
    eq(v.threadsForCard("k1").length, 2, "both conversations belong to the collector");
    eq(v.partnersTalkedTo("k1").sort().join(","), "p2,p3", "one per partner");
    eq(v.threadWith("p2", "k1").entries[0].text, "to Rina", "and each is addressable");
    eq(v.threadWith("p3", "k1").entries[0].text, "to Marcus", "independently");
  });

  test("hasTalkedAbout answers per partner, and for anyone", () => {
    const st = world();
    st.actions.sendMessage({ collectorId: "c1", partnerId: "p2", cardId: "k1",
      by: "collector", text: "hello", at: AT });

    const v = view(st);
    eq(v.hasTalkedAbout("k1", "p2"), true, "talked to p2");
    eq(v.hasTalkedAbout("k1", "p3"), false, "but not to p3");
    eq(v.hasTalkedAbout("k1"), true, "and yes, to somebody");
    eq(v.hasTalkedAbout("k2"), false, "about a different identity, nobody");
  });

  test("a different card identity is never confused for the same one", () => {
    const st = world();
    st.actions.sendMessage({ collectorId: "c1", partnerId: "p2", cardId: "k1",
      by: "collector", text: "about k1", at: AT });
    st.actions.sendMessage({ collectorId: "c1", partnerId: "p2", cardId: "k2",
      by: "collector", text: "about k2", at: AT });

    const v = view(st);
    eq(v.threadsForCard("k1").length, 1, "one thread on k1");
    eq(v.threadsForCard("k2").length, 1, "one thread on k2");
    assert(v.threadWith("p2", "k1").key !== v.threadWith("p2", "k2").key,
      "same collector, same partner, different identity — different threads");
  });

  test("another collector's conversation is not visible", () => {
    const st = world();
    st.actions.sendMessage({ collectorId: "c1", partnerId: "p2", cardId: "k1",
      by: "collector", text: "mine", at: AT });
    st.actions.sendMessage({ collectorId: "c99", partnerId: "p2", cardId: "k1",
      by: "collector", text: "someone else's", at: AT });

    eq(view(st).threadsForCard("k1").length, 1, "the collector sees only their own");
    eq(view(st).threadWith("p2", "k1").entries[0].text, "mine", "and it is theirs");
  });
});

require("./run.cjs").run();
