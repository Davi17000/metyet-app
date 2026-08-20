/* ============================================================================
   CHOOSING A COPY HAPPENS WHERE THE COPIES ARE

   The Goal already lists every partner who has the card, with their asking
   price and a way to talk to them. Asking "which one?" in a separate sheet made
   the collector answer a question they were already looking at the answer to —
   and worse, returning from that sheet routed back to Goals, which remounted
   the page with fresh state: the goal collapsed and the view jumped to the top.

   That was never a scroll bug. It was a route change discarding component
   state. So selection now happens on the row itself: no navigation, no sheet,
   and the Goal expands in place around the copy that was chosen.

   The fuller sheet still exists for the partners NOT being pursued, reached
   from the compact row once a pursuit is under way. It is read-only context
   there, which is what it was always good at.
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
const pursuit = () => view().pursuitFor(goal().id);

const boot = (stage) => { __store.reset(M.buildCanonicalSeed({ review: true, demoStage: stage }));
  let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r; };
const cardFor = (r) => {
  const c = S().catalog.find((x) => x.id === goal().cardId);
  return cls(r, "goal").find((n) => txt(n).includes(c.name) && txt(n).includes(c.set));
};
const rows = (r) => cls(cardFor(r), "gs-row");
const chooseIn = (node) => node.findAllByType("button").find((b) => /^Review Card$/i.test(txt(b)));
const chatIn = (node) => node.findAllByType("button")
  .find((b) => /^(Chat|Continue chatting)$/.test(txt(b)));
/* Everything about the app's location and shape that a route change would move. */
const shell = (r) => JSON.stringify({
  pages: cls(r, "pg").length,
  overlays: cls(r, "ovl").length,
  sheets: cls(r, "sheet").length,
  nav: cls(r, "nav-i").map(txt),
  goals: cls(r, "goal").length,
});

describe("A. The partner rows are the choice", () => {
  test("every partner who has the card is listed on the Goal", () => {
    const r = boot("pre-deal");
    const list = rows(r);
    assert(list.length >= 1, "the partners are on the Goal");
    eq(list.length, view().partnersWith(goal().cardId).length,
      "one row per partner, matching the canonical supply projection");
  });

  test("each row carries price, a way to talk, and a way to choose", () => {
    const r = boot("pre-deal");
    rows(r).forEach((n) => {
      assert(/\$/.test(txt(n)), "the asking price, to compare");
      assert(chatIn(n), "a way to talk first");
      assert(chooseIn(n), "and a way to choose this copy");
    });
  });

  test("exactly one way to choose per row", () => {
    const r = boot("pre-deal");
    rows(r).forEach((n) => eq(n.findAllByType("button")
      .filter((b) => /^Review Card$/i.test(txt(b))).length, 1,
      "no duplicate selection control"));
  });

  test("the standalone selection CTA is retired", () => {
    const r = boot("pre-deal");
    eq(cls(cardFor(r), "gs-offer").length, 0, "no button that only opens a sheet");
    assert(!/Choose a copy to review/.test(SRC), "and it is gone from the source");
  });

  test("no offer can be started at the point of choosing", () => {
    const r = boot("pre-deal");
    const labels = rows(r).flatMap((n) => n.findAllByType("button").map(txt));
    assert(!labels.some((t) => /^Make an offer/.test(t)),
      "choosing a copy is not the same act as pricing it");
  });
});

describe("B. Choosing navigates nowhere", () => {
  test("the app's shell is unchanged by selecting", () => {
    const r = boot("pre-deal");
    const before = shell(r);
    click(chooseIn(rows(r)[0]));
    eq(shell(r), before, "same page, same nav, no sheet or overlay opened");
  });

  test("no sheet or modal is involved at any point", () => {
    const r = boot("pre-deal");
    eq(cls(r, "ovl").length, 0, "none before");
    click(chooseIn(rows(r)[0]));
    eq(cls(r, "ovl").length, 0, "and none after");
    eq(cls(r, "sheet").length, 0, "nothing sheet-shaped either");
  });

  test("the handler routes nowhere", () => {
    /* The jump was a route change remounting Goals with fresh state, not a
       scroll problem — so the fix is that there is no route change. */
    const row = SRC.slice(SRC.indexOf('className="gs-row"'), SRC.indexOf('className="gs-row"') + 1400);
    assert(/st\.reviewCopy\(h\.inv\); onToggle\(g\.id, true\)/.test(row),
      "it binds the copy and opens the Goal in place");
    assert(!/go\(\{ v: "goals" \}\)/.test(row), "with no navigation");
    assert(!/go\(\{ v: "start"/.test(row), "and no sheet");
  });

  test("the Goal stays exactly where it was in the list", () => {
    const r = boot("pre-deal");
    const order = () => cls(r, "goal").map((n) => txt(n).slice(0, 40));
    const before = order();
    click(chooseIn(rows(r)[0]));
    eq(JSON.stringify(order()), JSON.stringify(before),
      "the goals are in the same order, so nothing has moved under the reader");
  });
});

describe("C. It opens Review Card on the copy chosen", () => {
  test("the pursuit binds to that exact copy and partner", () => {
    const r = boot("pre-deal");
    const inv = view().partnersWith(goal().cardId)[0].inv;
    click(chooseIn(rows(r)[0]));
    const p = pursuit();
    assert(p, "a pursuit exists");
    eq(p.kind, "review", "of the reviewing kind");
    eq(p.invId, inv.invId, "on the exact physical copy chosen");
    eq(p.partnerId, inv.partnerId, "with that partner");
  });

  test("the Goal expands in place, showing the workspace", () => {
    const r = boot("pre-deal");
    click(chooseIn(rows(r)[0]));
    const card = cardFor(r);
    eq(cls(card, "goal-dw").length, 1, "the workspace is open, inside the Goal");
    eq(txt(cls(card, "goal-deal-s")[0]), "Deal Flow · Review Card", "headed Review Card");
    assert(cls(card, "rv-face").length === 2, "with both faces of the copy");
    assert(cls(card, "chat-embed")[0], "and the conversation");
  });

  test("selection always opens, never toggles shut", () => {
    /* Choosing a copy should reveal the workspace whatever state the card was
       in — a collector who selects should never be met with nothing. */
    const r = boot("pre-deal");
    click(chooseIn(rows(r)[0]));
    eq(cls(cardFor(r), "goal-dw").length, 1, "open after choosing");
    assert(/const toggleDeal = \(id, force\)/.test(SRC), "the toggle takes a force flag");
    assert(/onToggle\(g\.id, true\)/.test(SRC), "which selection uses");
  });

  test("choosing creates no offer and asks the partner for nothing", () => {
    const r = boot("pre-deal");
    const opps = S().opportunities.length;
    click(chooseIn(rows(r)[0]));
    eq(S().opportunities.length, opps, "no negotiation");
    eq(S().photoRequests.length, 0, "and no photo request — looking is not asking");
    eq(D.goalState(goal().id, S().opportunities), "seeking", "the goal is still merely sought");
  });

  test("the rows give way to the pursuit once one exists", () => {
    const r = boot("pre-deal");
    click(chooseIn(rows(r)[0]));
    eq(cls(cardFor(r), "gs-row").length, 0, "no second place to choose from");
    assert(cls(cardFor(r), "goal-holders")[0], "supply becomes a compact context row");
    assert(/See all/.test(txt(cls(cardFor(r), "goal-holders")[0])), "naming what it opens");
  });
});

describe("D. Multi-partner comparison is not lost", () => {
  test("the collector can compare before choosing", () => {
    const r = boot("pre-deal");
    const list = rows(r);
    list.forEach((n) => {
      assert(/\$/.test(txt(n)), "asking price");
      assert(chatIn(n), "and a conversation, per partner");
    });
    /* Talking to one says nothing about the others. */
    eq(list.filter((n) => /Continue chatting/.test(txt(n))).length <= list.length, true,
      "chat state is per partner");
  });

  test("the full list stays reachable once a pursuit exists", () => {
    const r = boot("pre-deal");
    click(chooseIn(rows(r)[0]));
    const route = cls(cardFor(r), "goal-holders")[0];
    assert(route, "the compact route exists");
    click(route);
    assert(cls(r, "pick").length >= 1, "the fuller list opens");
    assert(cls(r, "ph-note").length >= 1, "with stock vs actual photo state");
  });

  test("that list is context, not a second way to choose", () => {
    const r = boot("pre-deal");
    click(chooseIn(rows(r)[0]));
    click(cls(cardFor(r), "goal-holders")[0]);
    const labels = r.root.findAllByType("button").map(txt);
    assert(!labels.some((t) => /^Make an offer/.test(t)), "no offer workflow there");
    assert(labels.some((t) => t === "Open Review Card"), "it points back at the workspace");
    assert(labels.some((t) => /^(Chat|Continue chatting)$/.test(t)), "and Chat still works");
  });
});

describe("E. The rest of the pursuit is unchanged", () => {
  test("requesting photos still hands the move to the partner", () => {
    const r = boot("pre-deal");
    click(chooseIn(rows(r)[0]));
    eq(pursuit().who, "me", "the collector's move on selection");
    const card = cardFor(r);
    const ask = card.findAllByType("button").find((b) => txt(b) === "Request actual photos");
    assert(ask, "asking is offered");
    click(ask);
    eq(pursuit().who, "partner", "then it is theirs");
    eq(S().opportunities.filter((o) => o.goalId === goal().id).length, 0,
      "and still no negotiation on this goal");
  });

  test("photos ready leads to the offer, which states the commitment", () => {
    const r = boot("pre-deal");
    click(chooseIn(rows(r)[0]));
    const inv = pursuit().copy;
    TR.act(() => { acts().addCopyPhotos({ invId: inv.invId, front: "f", back: "b", at: AT }); });
    let r2; TR.act(() => { r2 = TR.create(React.createElement(App)); });
    const disc = cardFor(r2).findAllByType("button")
      .find((b) => String(b.props.className || "").includes("goal-deal"));
    if (!disc.props["aria-expanded"]) click(disc);
    const offer = cardFor(r2).findAllByType("button").find((b) => txt(b) === "Make an offer");
    assert(offer, "the offer is available");
    click(offer);
    /* Review Card routes to the canonical offer sheet, which states the
       commitment beside the fields rather than behind a second dialog. */
    assert(/starts an active deal with .* for this goal/.test(txt(r2.root)),
      "the sheet explains what a first offer commits");
    assert(r2.root.findAllByType("button").some((b) => txt(b) === "Submit offer"),
      "with the CTA that performs it");
    assert(r2.root.findAllByType("button").some((b) => txt(b) === "Cancel"),
      "and a way out");
  });

  test("the ownership rule still holds", () => {
    const r = boot("pre-deal");
    click(chooseIn(rows(r)[0]));
    eq(cls(cardFor(r), "gs-offer").length, 0, "no CTA outside the workspace");
    const card = cardFor(r);
    eq(card.findAllByType("button").filter((b) => /^Make an offer/.test(txt(b))).length, 1,
      "exactly one forward action, inside Review Card");
  });

  test("nothing canonical moved", () => {
    eq(D.PURSUIT_STEPS.length, 6, "six pursuit steps");
    eq(D.RECEIPT_STAGES.length, 5, "five negotiation stages");
    const store = readSrc("domain/metyet-store.js");
    assert(/reviewCopy\(\{/.test(store), "reviewCopy is still the canonical action");
    assert(!/reviewCopy/.test(readSrc("domain/collector-view.js").replace(/copyReviews/g, "")),
      "and the view derives rather than writes");
  });
});

require("./run.cjs").run();
