/* ============================================================================
   AGREE ON PRICE — THE NEGOTIATION STORY

   A price negotiation is a sequence of things people did. The screen now says
   what was done, by whom, and for how much, instead of listing numbers and
   leaving the collector to work out which one is live.

   Every state below is derived from the canonical price thread — there is no
   second history model, and no hard-coded three-event sequence. The LAST event
   is by definition the standing proposal, which is what keeps the reading
   coherent after any number of rounds.
   ========================================================================= */

process.env.METYET_DEV = "1";

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const D = require("../domain/metyet-domain.js");
const App = require("../dist/Collector.cjs").default;
const { __store } = require("../dist/Collector.cjs");
const { buildCanonicalSeed } = require("../dist/MetYet.cjs");

const readSrc = (rel) => require("fs").readFileSync(require("path").join(__dirname, "..", rel), "utf8");
const SRC = readSrc("collector/MetYetCollector.jsx");
const txt = (n) => {
  if (!n) return "";
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ");
};
const flat = (n) => txt(n).replace(/\s+/g, " ").trim();
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));

const ME = "c12";
const S = () => __store.get().get();
const goal = () => S().goals.find((g) => g.collectorId === ME && /^Review deal/.test(g.note || ""));
const opp = () => D.activeOppForGoal(goal().id, S().opportunities);

/* Each negotiation state is produced by shaping the CANONICAL price thread of
   the demo fixture — never by inventing a parallel structure. */
const boot = (mut) => {
  const seed = buildCanonicalSeed({ review: true, demoStage: "agree-price" });
  const g = seed.goals.find((x) => x.collectorId === ME && /^Review deal/.test(x.note || ""));
  const o = seed.opportunities.find((x) => x.goalId === g.id);
  __store.reset({ ...seed,
    opportunities: seed.opportunities.map((x) => (x.id === o.id ? mut({ ...x }) : x)) });
  let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r;
};
const STATE = {
  /* A */ opening: (o) => ({ ...o, priceThread: [] }),
  /* B */ offered: (o) => ({ ...o, priceThread: o.priceThread.slice(0, 1) }),
  /* C */ countered: (o) => o,
  /* D */ rounds: (o) => ({ ...o, priceThread: [...o.priceThread,
    { by: "collector", type: "counter", amount: 3900, at: "2026-08-10" },
    { by: "tp", type: "counter", amount: 3980, at: "2026-08-11" }] }),
};

const cardFor = (r) => {
  const c = S().catalog.find((x) => x.id === goal().cardId);
  return cls(r, "goal").find((n) => txt(n).includes(c.name) && txt(n).includes(c.set));
};
const rowIn = (n) => n.findAllByType("button")
  .find((b) => String(b.props.className || "").includes("goal-deal"));
const open = (r) => { click(rowIn(cardFor(r))); return cardFor(r); };
const at = (state) => { const r = boot(STATE[state]); return { r, card: open(r) }; };

const headline = (card) => flat(cls(card, "ap-who")[0]);
const amount = (card) => flat(cls(card, "ap-amt")[0]);
const acceptBtn = (card) => card.findAllByType("button").find((b) => /^Accept /.test(flat(b)));
const sendBtn = (card) => card.findAllByType("button").find((b) => /^Send (offer|counter)$/.test(flat(b)));
const dollarField = (card) => card.findAllByType("input")
  .find((i) => /dollars/.test(String(i.props["aria-label"] || "")));
const percentField = (card) => card.findAllByType("input")
  .find((i) => /percentage/.test(String(i.props["aria-label"] || "")));
const type = (f, v) => TR.act(() => f.props.onChange({ target: { value: v } }));
const shape = (o) => JSON.stringify({ stage: o.stage, agreedPrice: o.agreedPrice,
  priceThread: o.priceThread, actor: D.nextActor(o).actor });

describe("A. The opening state — the collector proposes first", () => {
  test("it leads with the partner's listing, not a generic heading", () => {
    const { card } = at("opening");
    eq(headline(card), "Northline Cards listed", "actor and action, named");
    eq(amount(card), "$4,200", "the asking price is the number on the table");
    assert(/asking price/.test(flat(cls(card, "ap-sub")[0])), "explained in words");
    assert(!/YOUR MOVE/i.test(flat(cls(card, "ap")[0])), "and no generic Your move block");
  });

  test("there is nothing to accept, so no Accept action is offered", () => {
    const { card } = at("opening");
    eq(acceptBtn(card), undefined, "no Accept when the collector is initiating");
    eq(flat(sendBtn(card)), "Send offer", "the action is to make an offer");
    assert(cls(card, "ap-counter")[0], "with its own entry region");
  });

  test("history stays out of the way when there is none", () => {
    const { card } = at("opening");
    eq(cls(card, "oh").length, 0, "no offer history before anything happened");
  });
});

describe("B. Waiting on the Trusted Partner", () => {
  test("it leads with what the collector just did", () => {
    const { card } = at("offered");
    eq(headline(card), "You offered", "the collector's own action, named");
    eq(amount(card), "$3,696", "with their figure");
    assert(/88% of their \$4,200 listed price/.test(flat(cls(card, "ap-sub")[0])),
      "measured against the listed price");
  });

  test("no pricing controls are offered while it is not the collector's turn", () => {
    const { card } = at("offered");
    eq(acceptBtn(card), undefined, "nothing to accept");
    eq(sendBtn(card), undefined, "and nothing to send");
    assert(/Waiting on Northline Cards/.test(flat(card)), "the wait is stated instead");
  });
});

describe("C. Responding to a counter", () => {
  test("actor, action and the current amount lead", () => {
    const { card } = at("countered");
    eq(headline(card), "Northline Cards countered", "who did what");
    eq(amount(card), "$4,032", "and the number now on the table");
    assert(/96% of their \$4,200 listed price/.test(flat(cls(card, "ap-sub")[0])),
      "with its meaning");
  });

  test("the collector's own previous offer is subordinate context", () => {
    const { card } = at("countered");
    const prev = cls(card, "ap-prev")[0];
    assert(prev, "previous context is present");
    assert(/Your offer was \$3,696 · 88%/.test(flat(prev)), "naming their own last figure");
    /* Subordinate, not a second headline. */
    eq(cls(prev, "ap-amt").length, 0, "it is not given the focal treatment");
  });

  test("the standing proposal is presented once, not three times", () => {
    const { card } = at("countered");
    const body = flat(cls(card, "ap")[0]);
    const hits = (body.match(/\$4,032/g) || []).length;
    /* Once as the focal amount, once on the Accept button — the button
       repetition describes the consequence of the action. */
    eq(hits, 2, "the current figure appears as the headline amount and on Accept only");
    assert(!/Their counter/i.test(body), "no second labelled restatement");
    assert(!/They countered/i.test(body), "and no ledger row duplicating it");
  });

  test("Accept and Counter stay independent", () => {
    const { r, card } = at("countered");
    const before = flat(acceptBtn(card));
    type(dollarField(card), "1");
    const after = cardFor(r);
    eq(flat(acceptBtn(after)), before, "typing does not change the Accept amount");
    assert(acceptBtn(after), "nor hide it");
    assert(sendBtn(after), "and the counter keeps its own submit");

    click(acceptBtn(after));
    eq(opp().agreedPrice, 4032, "accepting takes the standing figure, not the typed one");
  });

  test("countering submits the typed value and passes the turn", () => {
    const { r, card } = at("countered");
    type(dollarField(card), "3800");
    click(sendBtn(cardFor(r)));
    const now = opp();
    eq(now.agreedPrice, null, "nothing was agreed");
    eq(D.lastEntry(now.priceThread).amount, 3800, "the typed figure was sent");
    eq(D.lastEntry(now.priceThread).by, "collector", "as the collector's move");
    eq(D.nextActor(now).actor, "partner", "and the turn passed");
  });
});

describe("D. Several rounds stay coherent", () => {
  test("it leads with the newest proposal, whatever the round", () => {
    const { card } = at("rounds");
    eq(headline(card), "Northline Cards countered", "the latest actor and action");
    eq(amount(card), "$3,980", "the latest figure, not the first");
    assert(/Your offer was \$3,900/.test(flat(cls(card, "ap-prev")[0])),
      "with the collector's most recent figure as context");
  });

  test("earlier events are preserved chronologically in history", () => {
    const { card } = at("rounds");
    const rows = cls(card, "oh-r").map(flat);
    assert(rows.length >= 2, "history is present");
    /* Chronological: each row's position matches the canonical thread order. */
    const joined = rows.join(" || ");
    assert(joined.indexOf("$4,032") < joined.indexOf("$3,900"),
      "older events come first: " + joined);
    assert(!/\$3,980/.test(joined), "and the standing proposal is not repeated in history");
  });

  test("older rounds are collapsed behind a control, never lost", () => {
    const { r, card } = at("rounds");
    const more = card.findAllByType("button").find((b) => /^Show \d+ earlier$/.test(flat(b)));
    assert(more, "earlier events are reachable");
    const before = cls(cardFor(r), "oh-r").length;
    click(more);
    assert(cls(cardFor(r), "oh-r").length > before, "and expand in place");
    assert(/\$4,200/.test(flat(cls(cardFor(r), "oh")[0])), "back to the original listing");
  });

  test("history is derived, with no second model", () => {
    /* The derivation itself is pure. (OfferHistory holds a collapse toggle,
       which is presentation state about the view, not about the negotiation.) */
    const derive = SRC.slice(SRC.indexOf("const priceEvents"), SRC.indexOf("function OfferHistory"));
    assert(/o\.priceThread/.test(derive), "it folds the canonical price thread");
    assert(/o\.listedPrice/.test(derive), "with the listing as its first event");
    assert(!/useState|history:|events:/.test(derive), "holding no state and storing nothing");
    const full = SRC.slice(SRC.indexOf("function AgreePrice("), SRC.indexOf("/* Select Trade"));
    assert(!/priceHistory|offerLog/.test(full), "and no parallel history structure exists");
  });
});

describe("E. Dollars stay canonical; percentages are derived", () => {
  test("typing dollars updates the percentage, and the reverse", () => {
    const { r, card } = at("countered");
    type(dollarField(card), "2100");
    eq(percentField(cardFor(r)).props.value, "50", "$2,100 of $4,200 is 50%");
    type(percentField(cardFor(r)), "75");
    eq(dollarField(cardFor(r)).props.value, "3150", "75% of $4,200 is $3,150");
  });

  test("what is submitted is a whole-dollar number", () => {
    const { r, card } = at("countered");
    type(percentField(card), "70");
    click(sendBtn(cardFor(r)));
    const last = D.lastEntry(opp().priceThread);
    eq(last.amount, 2940, "converted to dollars before submission");
    eq(typeof last.amount, "number", "as a number");
    assert(!/percent/i.test(JSON.stringify(last)), "no percentage is persisted");
  });

  test("the opening offer is measured against the same listed price", () => {
    const { r, card } = at("opening");
    type(percentField(card), "90");
    eq(dollarField(cardFor(r)).props.value, "3780", "90% of the listed $4,200");
  });

  test("a zero listed price never renders NaN or Infinity", () => {
    const r = boot((o) => ({ ...o, listedPrice: 0 }));
    const card = open(r);
    assert(!/NaN|Infinity/.test(flat(card)), "nothing renders as NaN or Infinity");
    eq(percentField(card), undefined, "and no percentage field is offered");
    assert(dollarField(card), "dollars can still be entered");
  });
});

describe("F. The rest of the stage is unchanged", () => {
  test("no StageDetails returns, and the rail stays out of the work grid", () => {
    const { card } = at("countered");
    eq(cls(card, "idf-mid").length, 0, "no details column");
    eq(cls(card, "idf-det").length, 0, "and no details block");
    eq(cls(card, "rail-s").length, 6, "exactly one rail");
    eq(cls(cls(card, "idf-work")[0], "rail-s").length, 0, "outside the pricing grid");
    eq(cls(cls(card, "goal-top")[0], "rail-s").length, 6, "beside the card identity");
  });

  test("stopping remains only in the overflow menu", () => {
    const { r, card } = at("countered");
    eq(cls(card, "idf-stop").length, 0, "nothing in the workspace");
    assert(!/Stop this negotiation/.test(flat(cls(card, "idf-work")[0])), "nor in the columns");
    click(cls(cardFor(r), "goal-edit-b")[0]);
    eq(cls(cardFor(r), "goal-stop").length, 1, "exactly one route, in the menu");
  });

  test("the disclosure remains the single expand control", () => {
    const r = boot(STATE.countered);
    eq(rowIn(cardFor(r)).props["aria-expanded"], false, "collapsed to begin with");
    click(rowIn(cardFor(r)));
    eq(rowIn(cardFor(r)).props["aria-expanded"], true, "then expanded");
    ["Hide Deal Flow", "View Deal Flow"].forEach((l) =>
      eq(cardFor(r).findAllByType("button").filter((b) => flat(b) === l).length, 0,
        "no competing " + l));
  });

  test("conversation is separate, and sending changes no pricing state", () => {
    const { r, card } = at("countered");
    const side = cls(card, "idf-side")[0];
    eq(cls(side, "chat-embed").length, 1, "the conversation sits beside the pricing");
    /* Pricing events are deal state, not chat. */
    assert(!/countered \$4,032/.test(flat(cls(side, "chat-embed")[0])),
      "pricing events are not written into the thread");
    const before = shape(opp());
    const ta = side.findAllByType("textarea")[0];
    TR.act(() => { ta.props.onChange({ target: { value: "any flexibility?" } }); });
    click(cls(cardFor(r), "idf-side")[0].findAllByType("button")
      .find((b) => flat(b) === "Send"));
    eq(shape(opp()), before, "stage, price, thread and turn all unchanged");
  });

  test("accepting still advances safely to Select Trade", () => {
    const { r, card } = at("countered");
    click(acceptBtn(card));
    const now = opp();
    eq(now.stage, "select-trade", "the stage advanced");
    eq(now.agreedPrice, 4032, "carrying the agreed figure");
    assert(now.trade && Array.isArray(now.trade.cards), "with a trade package to work in");
    /* And the next stage genuinely renders. */
    let r2; TR.act(() => { r2 = TR.create(React.createElement(App)); });
    assert(cls(open(r2), "idf-stage")[0], "Select Trade renders without crashing");
  });

  test("expanding and collapsing mutate nothing", () => {
    const r = boot(STATE.countered);
    const before = shape(opp());
    open(r);
    click(rowIn(cardFor(r)));
    eq(shape(opp()), before, "presentation only");
  });
});

require("./run.cjs").run();
