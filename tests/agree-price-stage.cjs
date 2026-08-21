/* ============================================================================
   AGREE ON PRICE — STAGE REFINEMENT

   One stage, one number, two ways to say it and two ways to answer.

   The defect this pass corrects was not cosmetic. The shell offers a stage ONE
   action slot, and Agree on Price used it for both decisions: the button read
   "Accept $3,650" until anything was typed, at which point it silently became
   "Send counter". Typing removed the Accept path. Accept and Counter are now
   two regions with two submits, and the stage tells the shell it owns them.

   Dollars stay canonical everywhere — the percentage field is a second way of
   typing the same number, converted on entry, never stored. All of it runs
   through the Trusted Partner's existing helpers, so both seats negotiate
   price through one implementation.
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
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));

const ME = "c12";
const S = () => __store.get().get();
const acts = () => __store.get().actions;

/* The demo deal, loaded at Agree on Price through the canonical fixture path. */
const mk = () => {
  __store.reset(buildCanonicalSeed({ review: true, demoStage: "agree-price" }));
  let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r;
};
const goal = () => S().goals.find((g) => g.collectorId === ME && /^Review deal/.test(g.note || ""));
const opp = () => D.activeOppForGoal(goal().id, S().opportunities);
const cardFor = (r) => {
  const c = S().catalog.find((x) => x.id === goal().cardId);
  return cls(r, "goal").find((n) => txt(n).includes(c.name) && txt(n).includes(c.set));
};
const rowIn = (node) => node.findAllByType("button")
  .find((b) => String(b.props.className || "").includes("goal-deal"));
const open = (r) => { click(rowIn(cardFor(r))); return cardFor(r); };

/* The two entry fields, by their accessible names. */
const dollarField = (card) => card.findAllByType("input")
  .find((i) => /dollars/.test(String(i.props["aria-label"] || "")));
const percentField = (card) => card.findAllByType("input")
  .find((i) => /percentage/.test(String(i.props["aria-label"] || "")));
const type = (field, v) => TR.act(() => field.props.onChange({ target: { value: v } }));
const btn = (card, re) => card.findAllByType("button").find((b) => re.test(txt(b).trim()));

const shape = (o) => JSON.stringify({ stage: o.stage, agreedPrice: o.agreedPrice,
  priceThread: o.priceThread, actor: D.nextActor(o).actor });

describe("A. Dollars and percentage are one number", () => {
  test("both fields are offered, labelled against listed price", () => {
    const r = mk();
    const card = open(r);
    assert(dollarField(card), "a dollar field");
    assert(percentField(card), "and a percentage field");
    assert(/% of listed price/.test(txt(cls(card, "ap-counter")[0])),
      "the percentage is labelled as a share of listed price");
  });

  test("typing dollars updates the percentage", () => {
    const r = mk();
    let card = open(r);
    const listed = opp().listedPrice;
    type(dollarField(card), String(Math.round(listed * 0.8)));
    card = cardFor(r);
    eq(percentField(card).props.value, "80", "80% of listed");
  });

  test("typing a percentage updates the dollars", () => {
    const r = mk();
    let card = open(r);
    const listed = opp().listedPrice;
    type(percentField(card), "75");
    card = cardFor(r);
    eq(dollarField(card).props.value, String(Math.round(listed * 0.75)),
      "converted to whole dollars");
  });

  test("dollars are what actually get submitted", () => {
    const r = mk();
    let card = open(r);
    const listed = opp().listedPrice;
    type(percentField(card), "60");
    card = cardFor(r);
    click(btn(card, /^Send counter$/));

    const last = D.lastEntry(opp().priceThread);
    eq(last.type, "counter", "a counter was submitted");
    eq(last.amount, Math.round(listed * 0.6), "as a dollar amount");
    eq(typeof last.amount, "number", "a number, not a percentage string");
    /* Nothing anywhere stores a percentage. */
    assert(!("percent" in last), "no percentage field is persisted");
    assert(!/agreedPercent|pricePercent/.test(JSON.stringify(opp())),
      "and none appears on the opportunity");
  });

  test("a missing or zero listed price never yields NaN, and hides the field", () => {
    /* percentageOf and amountFromPercentage guard the reference; the field is
       simply not offered when there is nothing to measure against. */
    const seed = buildCanonicalSeed({ review: true, demoStage: "agree-price" });
    const g = seed.goals.find((x) => x.collectorId === ME && /^Review deal/.test(x.note || ""));
    const o = seed.opportunities.find((x) => x.goalId === g.id);
    __store.reset({ ...seed, opportunities: seed.opportunities.map((x) =>
      (x.id === o.id ? { ...x, listedPrice: 0 } : x)) });
    let r; TR.act(() => { r = TR.create(React.createElement(App)); });
    const card = open(r);
    assert(dollarField(card), "dollars can still be entered");
    eq(percentField(card), undefined, "but no percentage field is offered");
    assert(!/NaN|Infinity/.test(txt(card)), "and nothing renders as NaN or Infinity");
  });
});

describe("B. Accept and Counter are distinct decisions", () => {
  test("they occupy separate regions, not one block of equal buttons", () => {
    const r = mk();
    const card = open(r);
    const accept = btn(card, /^Accept /);
    const counter = cls(card, "ap-counter")[0];
    assert(accept && counter, "two regions");
    assert(btn(accept, /^Accept /), "Accept lives in its own region");
    eq(accept.findAllByType("input").length, 0, "with no form of its own");
    assert(btn(counter, /^Send counter$/), "Counter owns its form and submit");
    eq(counter.findAllByType("input").length >= 1, true, "with its fields");
  });

  test("Accept names the standing figure from the price thread", () => {
    const r = mk();
    const card = open(r);
    const last = D.lastEntry(opp().priceThread);
    const accept = btn(btn(card, /^Accept /), /^Accept /);
    assert(txt(accept).includes(String(last.amount).replace(/\B(?=(\d{3})+(?!\d))/g, ",")),
      "the button names the standing amount: " + txt(accept));
  });

  test("accepting submits the standing value, never what was typed", () => {
    const r = mk();
    let card = open(r);
    const standing = D.lastEntry(opp().priceThread).amount;
    /* Type something quite different, then accept. */
    type(dollarField(card), "1");
    card = cardFor(r);
    click(btn(card, /^Accept /));

    const now = opp();
    eq(now.agreedPrice, standing, "the standing figure was accepted");
    assert(now.agreedPrice !== 1, "not the typed counter");
  });

  test("countering submits the typed value and never triggers accept", () => {
    const r = mk();
    let card = open(r);
    const listed = opp().listedPrice;
    type(dollarField(card), String(Math.round(listed * 0.5)));
    card = cardFor(r);
    click(btn(card, /^Send counter$/));

    const now = opp();
    eq(now.agreedPrice, null, "nothing was agreed");
    eq(D.lastEntry(now.priceThread).amount, Math.round(listed * 0.5), "the typed value was sent");
    eq(D.nextActor(now).actor, "partner", "and the turn passed canonically");
  });

  test("the counter CTA is inert until the input is valid", () => {
    const r = mk();
    let card = open(r);
    eq(btn(card, /^Send counter$/).props.disabled, true, "disabled while empty");
    assert(!/\bpri\b/.test(String(btn(card, /^Send counter$/).props.className)),
      "and not painted as ready");
    type(dollarField(card), "3000");
    card = cardFor(r);
    eq(btn(card, /^Send counter$/).props.disabled, false, "enabled once valid");
    assert(/\bpri\b/.test(String(btn(card, /^Send counter$/).props.className)),
      "and now reads as the ready action");
  });

  test("waiting on the partner exposes no pricing controls", () => {
    const r = mk();
    let card = open(r);
    type(dollarField(card), "3000");
    card = cardFor(r);
    click(btn(card, /^Send counter$/));
    eq(D.nextActor(opp()).actor, "partner", "the partner owns the turn");

    let r2; TR.act(() => { r2 = TR.create(React.createElement(App)); });
    const c2 = open(r2);
    eq(cls(c2, "ap-accept").length, 0, "no Accept while waiting");
    eq(cls(c2, "ap-counter").length, 0, "and no counter form");
    assert(/Waiting on/.test(txt(c2)), "the wait is stated instead");
  });

  test("the shell no longer collapses both decisions into one slot", () => {
    const stage = SRC.slice(SRC.indexOf("function AgreePrice("), SRC.indexOf("/* Select Trade"));
    assert(/register\(mine \? \{ own: true \} : null\)/.test(stage),
      "the stage tells the shell it owns its actions");
    assert(!/label: ok \?/.test(stage),
      "and no single label flips between Accept and Send counter");
    assert(/!\(bar && bar\.own\)/.test(SRC),
      "the shell yields its action slot to a stage that owns its own");
  });

  test("both seats price through one implementation", () => {
    assert(/CounterFields, validAmount, percentageOf/.test(SRC),
      "the Collector imports the shared price helpers");
    /* Matched by name rather than by the exact export list, so adding another
       shared helper strengthens the sharing instead of breaking the assertion. */
    const tp = readSrc("src/MetYet.jsx");
    ["CounterFields", "validAmount", "percentageOf"].forEach((name) =>
      assert(new RegExp("export \\{[^}]*\\b" + name + "\\b[^}]*\\}").test(tp),
        name + " is shared from the Trusted Partner's implementation"));
    const stage = SRC.slice(SRC.indexOf("function AgreePrice("), SRC.indexOf("/* Select Trade"));
    assert(!/const pct =|Math\.round\(\(n \/ o\.listedPrice\)/.test(stage),
      "and the Collector re-derives no conversion of its own");
  });
});

describe("C. A pricing stage shows only pricing", () => {
  test("there is no details column at Agree on Price", () => {
    const r = mk();
    const card = open(r);
    eq(cls(card, "idf-mid").length, 0, "no centre region");
    eq(cls(card, "idf-det").length, 0, "and no details block");
    assert(!/Details \(unsettled\)|Details/i.test(txt(cls(card, "idf-work")[0])),
      "nor the heading");
  });

  test("the work area is pricing and conversation only", () => {
    const r = mk();
    const card = open(r);
    const work = cls(card, "idf-work")[0];
    const kids = work.children.filter((c) => typeof c !== "string")
      .map((c) => String(c.props.className || ""));
    eq(kids.length, 2, "two regions");
    assert(/idf-task/.test(kids[0]), "pricing first");
    assert(/idf-side/.test(kids[1]), "conversation second");
    assert(/\btwo\b/.test(String(work.props.className)), "and the grid knows it is two-up");
  });

  test("other stages keep their details column", () => {
    __store.reset(buildCanonicalSeed({ review: true, demoStage: "value-trade" }));
    let r; TR.act(() => { r = TR.create(React.createElement(App)); });
    const card = open(r);
    eq(cls(card, "idf-mid").length, 1, "Value Trade still has its details");
    assert(cls(card, "idf-det-k").length > 0, "with canonical fields");
  });

  test("no future-stage value appears", () => {
    const r = mk();
    const body = txt(cls(open(r), "idf-work")[0]);
    ["Balance", "Trade value", "Handoff", "Settlement", "Calculated"]
      .forEach((w) => assert(!new RegExp(w, "i").test(body),
        w + " belongs to a later stage"));
  });
});

describe("D. Top composition and disclosure", () => {
  test("the rail has its own region, beneath the card identity", () => {
    /* CONTRACT CHANGE: the rail used to be a third flex sibling inside
       .goal-top with `flex: 1 1 320px` against an identity column of basis 0,
       so it claimed most of the free space and broke long card names across
       three lines. Identity now owns the top row; the rail sits below it. The
       guarantees that mattered are unchanged and still asserted here: exactly
       one rail, all six steps, never inside the work grid. */
    const r = mk();
    const card = open(r);
    const top = cls(card, "goal-top")[0];
    assert(top, "a top row");
    eq(cls(top, "rail-s").length, 0, "which the rail no longer competes for");
    assert(cls(top, "art")[0], "identity keeps the artwork");
    assert(cls(top, "goal-b")[0], "and the name and metadata");
    const rail = cls(card, "goal-rail")[0];
    assert(rail, "the rail is its own region");
    eq(cls(rail, "rail-s").length, 6, "carrying all six steps");
    eq(cls(card, "rail-s").length, 6, "and exactly one rail in the whole card");
    eq(cls(cls(card, "idf-work")[0], "rail-s").length, 0, "never inside the work grid");
  });

  test("identity reflows on a narrow card rather than being crushed", () => {
    /* The rail no longer needs a flex basis to "drop cleanly" — it is already
       on its own row at every width. What still has to reflow is the identity
       row itself, and the rail's own steps when there is genuinely no room. */
    assert(/\.goal-top \{ flex-wrap: wrap; \}/.test(SRC),
      "artwork and identity wrap rather than overflowing");
    assert(/\.goal-rail \{ width: 100%; \}/.test(SRC),
      "the rail spans its own row");
    assert(/\.rail \{ flex-direction: column/.test(SRC),
      "and becomes a list only when the width truly demands it");
  });

  test("one disclosure, with a comfortable target and clear state", () => {
    const r = mk();
    const row = () => rowIn(cardFor(r));
    eq(row().props["aria-expanded"], false, "collapsed to begin with");
    assert(/Show Deal Flow with/.test(row().props["aria-label"] || ""), "and says so");
    click(row());
    eq(row().props["aria-expanded"], true, "then reports expanded");
    assert(/Hide Deal Flow with/.test(row().props["aria-label"] || ""), "and offers to hide");
    assert(String(cls(row(), "goal-deal-c")[0].props.className).includes("on"),
      "the chevron turns");
    assert(/\.goal-deal \{[^}]*min-height: 52px/.test(SRC), "with a comfortable tap target");
    assert(/\.goal-deal:hover \{/.test(SRC), "and a hover treatment");
    /* No second show/hide control anywhere. */
    ["Hide Deal Flow", "View Deal Flow", "Continue Deal Flow"].forEach((l) =>
      eq(cardFor(r).findAllByType("button").filter((b) => txt(b).trim() === l).length, 0,
        "no standalone " + l));
  });

  test("expanding and collapsing mutate nothing", () => {
    const r = mk();
    const before = shape(opp());
    open(r);
    click(rowIn(cardFor(r)));
    click(rowIn(cardFor(r)));
    eq(shape(opp()), before, "no stage, price, thread or turn changed");
  });
});

describe("E. Stopping, and the conversation", () => {
  test("there is exactly one stop route, in the overflow menu", () => {
    const r = mk();
    const card = open(r);
    eq(cls(card, "idf-stop").length, 0, "nothing in the body");
    assert(!/Stop this negotiation|Cancel agreed deal/.test(txt(cls(card, "idf-work")[0])),
      "nor anywhere in the working columns");
    click(cls(cardFor(r), "goal-edit-b")[0]);
    const stops = cls(cardFor(r), "goal-stop");
    eq(stops.length, 1, "exactly one stop control, in the menu");
    assert(!String(stops[0].props.className).includes("pri"),
      "and never styled as forward progress");
  });

  test("opening the stop confirmation mutates nothing until confirmed", () => {
    const r = mk();
    open(r);
    const before = shape(opp());
    click(cls(cardFor(r), "goal-edit-b")[0]);
    click(cls(cardFor(r), "goal-stop")[0]);
    eq(shape(opp()), before, "the deal is untouched by opening the confirmation");
    assert(D.isActive(opp()), "and still live");
  });

  test("the conversation is present and changes nothing when used", () => {
    const r = mk();
    const card = open(r);
    const side = cls(card, "idf-side")[0];
    eq(cls(side, "chat-embed").length, 1, "one conversation, beside the pricing");
    const before = shape(opp());
    const ta = side.findAllByType("textarea")[0];
    TR.act(() => { ta.props.onChange({ target: { value: "would you take less?" } }); });
    click(cls(cardFor(r), "idf-side")[0].findAllByType("button")
      .find((b) => txt(b).trim() === "Send"));
    eq(shape(opp()), before, "stage, price, thread and turn all unchanged");
    const t = D.findThread(S().conversations, ME, opp().partnerId,
      S().catalog.find((c) => c.id === opp().cardId));
    assert(t.entries.some((e) => e.text === "would you take less?"), "but the message was sent");
  });
});

require("./run.cjs").run();
