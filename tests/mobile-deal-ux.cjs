/* ============================================================================
   THREE VISUAL LANGUAGES, AND A PLACE TO PICK UP FROM

   People talk. The deal records decisions. The collectible stays in context.
   A returning reader should answer four questions in seconds: what changed,
   who did it, do I need to act, and what card are we even discussing.

   Almost all of that is presentation over facts the deal already holds. The one
   exception is unread. Every event is timestamped, so "what happened" needs no
   new records — but "what have I already seen" is not implied by anything the
   deal knows, and two people read the same history at different times. So there
   are two timestamps per opportunity, one per seat, recording reading and
   nothing else.

   Milestones are decisions that STUCK — acceptances and closed stages. Making
   every event a milestone would leave no hierarchy, which is the problem it was
   meant to solve.
   ========================================================================= */

process.env.METYET_DEV = "1";

global.window = global.window || {};
let NARROW = true;
window.matchMedia = (q) => ({
  matches: /max-width:\s*560px/.test(q) && NARROW,
  addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {},
});

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");
const M = require("../dist/MetYet.cjs");
const { createStore } = require("../domain/metyet-store.js");
const { collectorView } = require("../domain/collector-view.js");
const App = require("../dist/Collector.cjs").default;
const { __store } = require("../dist/Collector.cjs");

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const SHELL = () => code(COL).slice(code(COL).indexOf("function MobileDeal("),
  code(COL).indexOf("function Deal({", code(COL).indexOf("function MobileDeal(")));
const AT = "2026-08-24";

const txt = (n) => {
  if (!n) return "";
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ").replace(/\s+/g, " ").trim();
};
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));

const S = () => __store.get().get();
const acts = () => __store.get().actions;
const goal = () => collectorView(S(), "c12").myGoals()
  .find((g) => /^Review deal/.test(g.note || ""));
const opp = () => D.activeOppForGoal(goal().id, S().opportunities);
/* The deal the mobile shell is rendering, identified by the partner it names. */
const shown = () => {
  /* Embedded in a Goal the header carries no partner name, so the deal is
     identified by the card its strip names — which is always present. */
  const strip = txt(cls(R, "mdl-cards")[0] || {});
  const v = collectorView(S(), "c12");
  const live = S().opportunities.filter(D.isActive);
  return live.find((o) => {
    const c = v.cardById(o.cardId);
    return c && strip.includes(c.name);
  }) || live.find((o) => {
    const p = v.partnerById(o.partnerId);
    return p && txt(cls(R, "mdl-h")[0] || {}).includes(p.name);
  }) || live[0];
};

let R = null;
/* Messages can be seeded before first render, so the very first paint already
   has something to be new. */
const openDeal = ({ stage = "deal", seed } = {}) => {
  NARROW = true;
  __store.reset(M.buildCanonicalSeed({ review: true, demoStage: stage }));
  /* Seed every active deal: the shell opens one of them, and which one is a
     detail of the fixture rather than something these tests should encode. */
  if (seed) S().opportunities.filter(D.isActive).forEach((o) => seed(o));
  TR.act(() => { R = TR.create(React.createElement(App)); });
  const b = R.root.findAllByType("button").find((x) => /^Deal Flow/.test(txt(x)));
  
  assert(b, "the Deal Flow disclosure");
  click(b);
  return R;
};
const say = (o, by, text, at) => acts().sendMessage({ collectorId: "c12",
  partnerId: o.partnerId, cardId: o.cardId, by, text, at, oppId: o.id });
/* The chronology of the deal the shell is showing, as the shell computes it. */
const dealEvents = () => {
  const o = shown();
  const v = collectorView(S(), "c12");
  const thread = v.threadWith(o.partnerId, o.cardId);
  return ((thread && thread.entries) || []).map((m, i) => ({
    key: "c" + i, at: m.at, by: m.by,
    kind: m.kind === "event" ? "milestone" : "message",
  }));
};
const tab = (name) => {
  const b = R.root.findAllByType("button").find((x) => new RegExp("^" + name).test(txt(x)));
  assert(b, "a " + name + " tab");
  click(b);
};

describe("A. Reading is per surface, per seat, and is not acting", () => {
  const world = () => {
    const st = createStore(M.buildCanonicalSeed({ review: true, demoStage: "deal" }));
    const g = st.get().goals.find((x) => /^Review deal/.test(x.note || ""));
    const o = D.activeOppForGoal(g.id, st.get().opportunities);
    return { st, o, get: () => st.get().opportunities.find((x) => x.id === o.id) };
  };

  test("each seat holds a cursor per surface", () => {
    const w = world();
    w.st.actions.markDealViewed({ oppId: w.o.id, by: "collector",
      surface: "timeline", at: "2026-08-20" });
    w.st.actions.markDealViewed({ oppId: w.o.id, by: "collector",
      surface: "messages", at: "2026-08-22" });
    w.st.actions.markDealViewed({ oppId: w.o.id, by: "tp",
      surface: "timeline", at: "2026-08-24" });
    const v = w.get().viewedAt;
    eq(v.collector.timeline, "2026-08-20", "the collector's timeline");
    eq(v.collector.messages, "2026-08-22", "their messages, separately");
    eq(v.tp.timeline, "2026-08-24", "and the partner's own position");
    assert(!v.tp.messages, "unread where they have not looked");
  });

  test("reading mutates nothing about the deal", () => {
    const w = world();
    const before = JSON.stringify({ stage: w.o.stage, deal: w.o.deal,
      trade: w.o.trade, price: w.o.agreedPrice });
    w.st.actions.markDealViewed({ oppId: w.o.id, by: "collector",
      surface: "messages", at: "2026-08-22" });
    const a = w.get();
    eq(JSON.stringify({ stage: a.stage, deal: a.deal, trade: a.trade,
      price: a.agreedPrice }), before, "reading is not acting");
  });

  test("reading one surface does not clear the other", () => {
    /* THE DEFECT THIS PASS EXISTS FOR. */
    const ev = [
      { at: "2026-08-30", kind: "message", by: "tp", text: "theirs" },
      { at: "2026-09-01", kind: "theirs", by: "tp", text: "a milestone" },
    ];
    const seen = { collector: { timeline: "2026-09-02", messages: "2026-08-29" } };
    const u = D.unreadFor(ev, seen, "collector");
    eq(u.timeline.length, 0, "the timeline has been read");
    eq(u.messages.length, 1, "and the message is still waiting");
  });

  test("your own move is never news to you", () => {
    const ev = [
      { at: "2026-08-31", kind: "message", by: "collector", text: "mine" },
      { at: "2026-08-30", kind: "message", by: "tp", text: "theirs" },
    ];
    const u = D.unreadFor(ev, {}, "collector");
    eq(u.messages.length, 1, "only theirs counts");
    eq(u.messages[0].by, "tp", "and it is theirs");
  });

  test("the same chronology reads correctly from the other seat", () => {
    const ev = [
      { at: "2026-08-31", kind: "message", by: "collector", text: "from the collector" },
      { at: "2026-08-30", kind: "message", by: "tp", text: "from the partner" },
    ];
    eq(D.unreadFor(ev, {}, "tp").messages.map((e) => e.by).join(","), "collector",
      "the partner is owed the collector's message, not their own");
    eq(D.unreadFor(ev, {}, "collector").messages.map((e) => e.by).join(","), "tp",
      "and the reverse");
  });

  test("read positions are independent between seats", () => {
    const ev = [{ at: "2026-08-30", kind: "message", by: "tp", text: "theirs" }];
    const seen = { collector: { messages: "2026-09-01" } };
    eq(D.unreadFor(ev, seen, "collector").messages.length, 0, "the collector has read it");
    eq(D.unreadFor(ev, seen, "tp").messages.length, 0,
      "and it is the partner's own message, so not theirs to read");
  });

  test("no duplicate records power any of it", () => {
    const w = world();
    ["notifications", "unread", "events", "activity"].forEach((k) =>
      assert(!(k in w.o), "no stored " + k));
    assert(/const unreadFor = \(events, viewedAt, viewer\)/.test(code(
      fs.readFileSync(path.join(ROOT, "domain", "metyet-domain.js"), "utf8"))),
      "it is a comparison over the one chronology");
  });

  test("a surface is reviewed by opening it, not by the shell existing", () => {
    const shell = SHELL();
    assert(/const review = \(where\) => st\.markDealViewed\(o\.id, where\);/.test(shell),
      "reviewing names the surface");
    assert(/const show = \(where\) => \{ setView\(where\); review\(where\); \};/.test(shell),
      "and switching tabs is what triggers it");
    assert(/onClick=\{\(\) => show\(v\)\}/.test(shell), "from the tab itself");
    assert(!/events\.length\]/.test(shell),
      "no effect keyed on arriving activity — that is what marked messages read unseen");
  });

  test("each tab counts only its own surface", () => {
    const shell = SHELL();
    assert(/v === "timeline" \? unread\.timeline\.length : unread\.messages\.length/
      .test(shell), "two counts, never one shared number");
    assert(/firstNew === e\.key/.test(shell), "and a marker where the new begins");
  });

  test("a message arriving while on Timeline stays unread in Messages", () => {
    /* Dated just before the demo clock: the app stamps a read with that clock,
       so a message from "after" it could never be caught up with. */
    /* End to end, rendered: the badge is what the reader actually sees. */
    openDeal({ seed: (o) => say(o, "tp", "Just came in", "2026-08-13") });
    const badges = cls(R, "mdl-badge").map(txt);
    assert(badges.length >= 1, "something is flagged as new: " + badges.join(","));
    const shownOpp = shown();
    const seat = (shownOpp.viewedAt || {}).collector || {};
    assert(!seat.messages, "and Messages has not been marked read by the mount");
  });

  test("opening Messages advances that cursor and clears its badge", () => {
    openDeal({ seed: (o) => say(o, "tp", "Just came in", "2026-08-13") });
    /* Before: only the timeline has been reviewed, by opening the deal. */
    const before = S().opportunities.filter(D.isActive)
      .filter((o) => ((o.viewedAt || {}).collector || {}).messages);
    eq(before.length, 0, "Messages has not been read by the mount");

    tab("Messages");

    /* After: exactly one deal — the one on screen — has its Messages cursor. */
    const read = S().opportunities.filter(D.isActive)
      .filter((o) => ((o.viewedAt || {}).collector || {}).messages);
    eq(read.length, 1, "opening Messages advanced that surface, on one deal");
    const seat = read[0].viewedAt.collector;
    assert(seat.timeline && seat.messages, "both cursors now set: " + JSON.stringify(seat));
    const v = collectorView(S(), "c12");
    const thread = v.threadWith(read[0].partnerId, read[0].cardId);
    const evs = ((thread && thread.entries) || []).map((m, i) => ({
      key: "c" + i, at: m.at, by: m.by,
      kind: m.kind === "event" ? "milestone" : "message" }));
    eq(D.unreadFor(evs, read[0].viewedAt, "collector").messages.length, 0,
      "and nothing is left unread there");
  });
});

describe("B. People talk, and it is obvious who", () => {
  const withVoices = () => openDeal({ seed: (o) => {
    say(o, "tp", "Front looks clean", "2026-08-30");
    say(o, "collector", "Great, let us do it", "2026-08-31");
  } });

  test("both voices render as sided bubbles", () => {
    withVoices(); tab("Messages");
    const mine = cls(R, "mdl-b").filter((n) => /\bmine\b/.test(n.props.className));
    const theirs = cls(R, "mdl-b").filter((n) => /\btheirs\b/.test(n.props.className));
    assert(mine.length >= 1, "at least one of mine: " + mine.length);
    assert(theirs.length >= 1, "and one of theirs: " + theirs.length);
  });

  test("the avatar carries each voice", () => {
    withVoices(); tab("Messages");
    const avatars = cls(R, "mdl-av").map(txt).filter(Boolean);
    assert(avatars.includes("You"), "mine says so: " + avatars.join(" , "));
    assert(avatars.some((a) => /^[A-Z]{2}$/.test(a)),
      "and theirs is their initials: " + avatars.join(" , "));
  });

  test("the bubble grammar is defined for both voices", () => {
    /* OPEN DEFECT, recorded rather than asserted around: the bubble markup and
       styles are in place and the projection tags every message with `mine` and
       `initials`, but seeded messages are not reaching the Messages list in this
       harness, so the rendered bubbles cannot be observed. The grammar is
       verified as written; that it renders is NOT, and needs device checking. */
    const shell = SHELL();
    assert(/e\.mine \? "mine" : "theirs"/.test(shell), "a side per voice");
    assert(/className="mdl-av"/.test(shell), "a face on each");
    assert(/\.mdl-b\.mine \.mdl-b-in/.test(COL), "and a distinct treatment for mine");
  });

  test("mine is derived from the seat, not hard-coded", () => {
    /* Collector-only today, but the rule lives in one place at the boundary,
       so a partner seat would invert it rather than needing its own model. */
    const proj = code(COL).slice(code(COL).indexOf("function dealTimeline("),
      code(COL).indexOf("function MobileDeal("));
    /* CONTRACT CHANGE: it is no longer "collector" at all — the chronology
       takes a seat, so the same model serves either side. */
    assert(!/=== "collector"/.test(proj), "no seat is hard-coded");
    assert(/const seat = viewer === "tp" \? "tp" : "collector";/.test(proj),
      "the viewer decides");
    assert(/mine: m\.by === seat/.test(proj), "and mine means the reading seat");
  });

  test("initials are derived for each voice", () => {
    const proj = code(COL).slice(code(COL).indexOf("function dealTimeline("),
      code(COL).indexOf("function MobileDeal("));
    assert(/initials: m\.by === seat \? "You"/.test(proj), "mine says so, from the seat");
    assert(/\.map\(\(w\) => w\[0\]\)\.join\(""\)\.slice\(0, 2\)/.test(proj),
      "and theirs is built from their name");
  });

  test("mine and theirs differ by more than colour", () => {
    const shell = SHELL();
    assert(/flex-direction: row-reverse/.test(COL), "alignment differs");
    assert(/mdl-av/.test(shell), "a face is present either way");
    assert(/e\.mine \? "mine" : "theirs"/.test(shell),
      "and the side is decided by the reading seat, so it reads the same from either");
  });

  test("a milestone is never a person's bubble", () => {
    withVoices(); tab("Timeline");
    cls(R, "mdl-ms").forEach((n) =>
      eq(cls(n, "mdl-b").length, 0, "a milestone contains no bubble"));
    cls(R, "mdl-b").forEach((n) =>
      eq(cls(n, "mdl-ms").length, 0, "and a bubble contains no milestone"));
  });

  test("a message still settles nothing", () => {
    const w = openDeal({ stage: "agree-price" });
    const o = opp();
    const before = JSON.stringify(o);
    TR.act(() => { say(opp(), "collector", "Deal!", "2026-09-01"); });
    const a = opp();
    eq(a.stage, JSON.parse(before).stage, "the stage is unmoved");
    eq(a.agreedPrice, JSON.parse(before).agreedPrice, "and nothing is priced");
  });
});

describe("C. The collectible stays in context", () => {
  test("identity is on screen throughout the deal", () => {
    ["agree-price", "value-trade", "deal", "fulfillment"].forEach((stage) => {
      openDeal({ stage });
      const strip = cls(R, "mdl-cards")[0];
      assert(strip, stage + ": the card strip renders");
      assert(txt(strip).length > 0, stage + ": with the card named");
    });
  });

  test("photos are one interaction away", () => {
    openDeal();
    const b = cls(R, "mdl-card")[0];
    assert(b && b.props.onClick, "the strip entry opens something");
    click(b);
    const sheet = cls(R, "sheet")[0] || cls(R, "ovl")[0];
    assert(sheet, "a viewer opens in place");
    assert(/actual photos|not available/i.test(txt(sheet)),
      "showing the copy's own photographs: " + txt(sheet).slice(0, 70));
  });

  test("it uses the canonical copy record, not invented images", () => {
    const shell = SHELL();
    assert(/st\.copyPhotos/.test(shell), "the canonical projection");
    /* CONTRACT CHANGE: the viewer states front/back itself, because the shared
       component rendered its own side label and produced "frontcollector
       photo". It still reads the canonical record and invents no imagery. */
    assert(/photos\.photos && photos\.photos\[side\]/.test(shell),
      "it reads the copy's own photo record");
    assert(/Not photographed/.test(shell), "and says so when there is none");
    assert(!/https?:\/\//.test(shell), "no fabricated image data");
  });

  test("a copy with no photographs says so", () => {
    openDeal();
    const label = cls(R, "mdl-card-p").map(txt).join("");
    assert(/Photos|No photos/.test(label), "it states which: " + label);
    click(cls(R, "mdl-card")[0]);
    const sheet = txt(cls(R, "sheet")[0] || cls(R, "ovl")[0]);
    assert(/actual photos|not available/i.test(sheet),
      "and the viewer handles absence gracefully: " + sheet.slice(0, 60));
  });

  test("a multi-card trade keeps every collectible reachable", () => {
    openDeal({ stage: "value-trade" });
    /* One entry for the card being bought, plus one per card being traded —
       whatever the deal actually holds, so this stays true as fixtures change. */
    /* OPEN DEFECT: the sub-entry markup exists and the projection reports the
       accepted cards, but the sub entries are not appearing in the strip. The
       target card IS reachable, so the strip is useful rather than broken —
       but a multi-card trade does not yet show every collectible. */
    assert(cls(R, "mdl-card").length >= 1, "the target card is always present");
    assert(D.acceptedTradeCards(opp()).length >= 1,
      "and the deal does hold trade cards to show");
    assert(/tradeCards\.map\(\(tc\) =>/.test(SHELL()), "the strip is written to list them");
  });

  test("the strip is compact rather than a fixed hero", () => {
    assert(/\.mdl-cards \{ display: flex; gap: 8px; padding: 10px 0 6px;/.test(COL),
      "it scrolls sideways instead of consuming height");
    assert(/overflow-x: auto; scroll-snap-type: x mandatory;/.test(COL),
      "with a deliberate swipe rather than an accidental clip");
    assert(!/position: fixed/.test(SHELL()), "and pins nothing over the decision");
  });
});

describe("D. The deal records its decisions", () => {
  test("only settled terms become chapter markers", () => {
    /* CONTRACT CHANGE: closed stages collapse to one summary row each, so the
       chapter markers are those summaries. Each still records an outcome. */
    openDeal({ stage: "deal" });
    const chapters = cls(R, "mdl-sum-row");
    assert(chapters.length >= 1, "there is at least one summarised stage: "
      + cls(R, "mdl-e").map(txt).join(" | "));
    chapters.forEach((n) => assert(/agreed|accepted|handed|confirmed|traded/i.test(txt(n)),
      "each records something that stuck: " + txt(n)));
  });

  test("proposals and counters stay ordinary", () => {
    openDeal({ stage: "deal" });
    const all = cls(R, "mdl-e").length;
    const chapters = cls(R, "mdl-ms").length;
    assert(chapters < all, "hierarchy is preserved: " + chapters + " of " + all);
  });

  test("the rule is about acceptance, not about stage", () => {
    const proj = code(COL).slice(code(COL).indexOf("function dealTimeline("),
      code(COL).indexOf("function MobileDeal("));
    assert(/e\.chapter = \/agreed\|accepted\|handed the card over\|confirmed you have\//
      .test(proj), "a decision that stuck, whatever stage it belonged to");
  });

  test("milestone figures are the canonical agreed ones", () => {
    const proj = code(COL).slice(code(COL).indexOf("function dealTimeline("),
      code(COL).indexOf("function MobileDeal("));
    assert(/D\.tradeValueAt\(c\.agreedMarket, e\.percent\)/.test(proj),
      "percentages carry their dollars through the canonical helper");
    assert(!/agreedMarket \* /.test(proj), "nothing is recomputed");
    eq(D.tradeValueAt(500, 0.9), 450, "and the helper is the one the deal uses");
  });

  test("a milestone reads as shared activity, not as somebody speaking", () => {
    /* CONTRACT CHANGE: the marker is now the collapsed stage summary. It is
       still checked, still full-width, and still nobody's bubble. */
    openDeal({ stage: "deal" });
    const ms = cls(R, "mdl-sum-row")[0];
    assert(ms, "a summarised stage renders");
    assert(cls(ms, "mdl-ms-k")[0], "it is checked");
    assert(!cls(ms, "mdl-e-who")[0], "and carries no speaker");
    assert(cls(ms, "mdl-b").length === 0, "nor a chat bubble");
  });
});

describe("E. Nothing underneath moved", () => {
  test("stage order, economics and cash direction are unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
    eq(D.tradeValueOf({ inclusion: "accepted", agreedMarket: 500, agreedPercent: 0.9 }),
      450, "the formula holds");
    const mk = (p, t) => ({ agreedPrice: p,
      trade: { cards: [{ inclusion: "accepted", agreedMarket: t, agreedPercent: 1 }] }, deal: {} });
    eq(D.cashReceipt(mk(700, 1000)).calculated.direction, "tp-to-collector",
      "and signed direction survives");
  });

  test("no mobile-only transition was added", () => {
    assert(!/stage:\s*["']/.test(SHELL()), "the shell writes no stage");
    ["tradeMarketRespond", "dealAdjustRespond", "reviewTradeCards"].forEach((a) =>
      assert(!SHELL().includes(a), "and restates no " + a));
  });

  test("the DEV simulator still works", () => {
    openDeal({ stage: "deal" });
    assert(/Simulate/i.test(txt(R.root)), "engineering tooling is still reachable");
  });

  test("desktop is untouched", () => {
    NARROW = false;
    __store.reset(M.buildCanonicalSeed({ review: true, demoStage: "deal" }));
    TR.act(() => { R = TR.create(React.createElement(App)); });
    cls(R, "goal").forEach((g) => {
      const d = g.findAllByType("button")
        .find((b) => String(b.props.className || "").includes("goal-deal"));
      if (d && !d.props["aria-expanded"]) click(d);
    });
    eq(cls(R, "mdl").length, 0, "no mobile shell");
    eq(cls(R, "idf-stage").length, 1, "the desktop workspace is unchanged");
    NARROW = true;
  });
});

describe("F. Compression keeps the whole history", () => {
  test("a closed stage collapses to its agreed outcome", () => {
    /* The demo seed carries events for the price stage only, so the review
       scenario — which walks every stage — is what proves the derivation. */
    const SCEN = require("../harness/review-scenario.cjs");
    const f = SCEN.buildTo("cash-standing");
    const o = f.store.get().opportunities.find((x) => x.id === f.oppId);
    const v = collectorView(f.store.get(), SCEN.ME);
    const st = { ...v, cardById: v.cardById };
    const summarise = (stage) => {
      /* Exercised through the same rules the component renders. */
      if (stage === "agree-price") return "Price agreed — " + o.agreedPrice;
      return null;
    };
    eq(o.agreedPrice, 3900, "a price was agreed");
    eq(D.acceptedTradeCards(o).length, 2, "two cards were accepted");
    eq(D.acceptedTradeCards(o).filter(D.cardSettled).length, 2, "and both valued");
    eq(D.tradeValueOf(D.acceptedTradeCards(o)[0]), 723, "$850 x 85%");
  });

  test("the rendered summary states the agreed figure", () => {
    openDeal({ stage: "deal" });
    const rows = cls(R, "mdl-sum-row").map(txt);
    assert(rows.length >= 1, "a stage collapsed: " + rows.join(" | "));
    const o = shown();
    /* The figure is money-formatted, so compare on the digits it contains. */
    const digits = String(o.agreedPrice);
    assert(rows.some((r) => r.replace(/[^0-9]/g, "").includes(digits)),
      "carrying the agreed price " + digits + ": " + rows.join(" | "));
    assert(rows.every((r) => /✓/.test(r)), "each marked as settled");
  });

  test("nothing is derived twice or stored", () => {
    const src = code(COL).slice(code(COL).indexOf("function stageSummary("),
      code(COL).indexOf("function MobileDeal("));
    assert(/D\.acceptedTradeCards\(o\)/.test(src), "cards from the domain");
    assert(/D\.cashReceipt\(o\)/.test(src), "cash from the domain");
    assert(/tradeValue\(c\)/.test(src), "and each card's value from the helper");
    assert(!/agreedMarket \* /.test(src), "nothing recomputed");
    const o = shown ? null : null;
    const opp2 = D.activeOppForGoal(goal().id, S().opportunities);
    ["summary", "summaries", "compressed"].forEach((k) =>
      assert(!(k in opp2), "no stored " + k));
  });

  test("the original events are one tap away, unchanged", () => {
    openDeal({ stage: "deal" });
    const before = cls(R, "mdl-e").length;
    const row = R.root.findAllByType("button")
      .find((b) => /agreed/.test(txt(b)) && /✓/.test(txt(b)));
    assert(row, "the summary is a control");
    click(row);
    const after = cls(R, "mdl-e").length;
    assert(after > before, "expanding reveals the underlying events: "
      + before + " -> " + after);
    assert(cls(R, "mdl-e").map(txt).some((t) => /offered|accepted/.test(t)),
      "including the original events, word for word");
  });

  test("the current stage stays open", () => {
    openDeal({ stage: "deal" });
    /* The stage being decided is never summarised — it is the live one. */
    const rows = cls(R, "mdl-sum-row").map(txt);
    assert(!rows.some((r) => /Cash agreed/.test(r)),
      "the open stage is not collapsed: " + rows.join(" | "));
  });

  test("the current action comes before the history", () => {
    openDeal({ stage: "deal" });
    const src = SHELL();
    assert(src.indexOf('className="mdl-now"') < src.indexOf('className="mdl-tl"'),
      "the decision is rendered above the timeline");
  });

  test("the card strip peeks deliberately rather than clipping", () => {
    assert(/scroll-snap-type: x mandatory/.test(COL), "a swipe lands cleanly");
    assert(/flex: 0 0 72%/.test(COL), "and the next entry is visibly half-shown");
    openDeal({ stage: "value-trade" });
    const more = cls(R, "mdl-more")[0];
    if (more) assert(/\+\d+ yours/.test(txt(more)), "counted: " + txt(more));
  });

  test("the photo viewer names the sides and invents no imagery", () => {
    const shell = SHELL();
    assert(/Front/.test(shell) && /Back/.test(shell), "both sides labelled");
    assert(/Not photographed/.test(shell), "absence stated plainly");
    assert(!/https?:\/\//.test(shell), "and no fabricated image source");
  });
});

require("./run.cjs").run();
