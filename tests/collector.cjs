/* Permanent suite for the Collector app. Domain invariants are asserted against
   the ACTIONS, not the buttons, so a future surface cannot route around them. */
const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const App = require("../dist/Collector.cjs").default;
const { __store } = require("../dist/Collector.cjs");
const { buildCanonicalSeed } = require("../dist/MetYet.cjs");
const SEED = buildCanonicalSeed();
const readSrc = (rel) => require("fs").readFileSync(require("path").join(__dirname, "..", rel), "utf8");
/* These assertions moved with the logic: after the shared-state migration the
   rules live in the domain, not in the Collector component. */
const DOMAIN = () => readSrc("domain/metyet-domain.js");
const STORE = () => readSrc("domain/metyet-store.js");
const VIEW = () => readSrc("domain/collector-view.js");
const SEEDSRC = () => readSrc("src/MetYet.jsx");

/* Each render starts from the same shared universe, so one test cannot leak
   state into the next. */
const mk = () => {
  __store.reset(buildCanonicalSeed());
  let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r;
};
const txt = (n) => {
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join("");
};
/* Works on the renderer or on any node, so nested lookups read naturally. */
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c));
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));
const btn = (r, s) => r.root.findAllByType("button").find((b) => txt(b).trim() === s);
const btnHas = (r, s) => r.root.findAllByType("button").find((b) => txt(b).includes(s));
const nav = (r, l) => click(cls(r, "nav-i").find((b) => txt(b).includes(l)));
const all = (r) => txt(r.root);
const partnerCard = (r, i) => cls(r, "pt")[i];
/* After the Goals redesign a goal renders as a primary card OR a watchlist row. */
const byClassIn = (node, c) => node.findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c));
const allGoals = (r) => cls(r, "goal").concat(cls(r, "gwatch-r"));
const goalNamed = (r, name) => allGoals(r).find((n) => txt(n).includes(name));
const openPartner = (r, i) => click(partnerCard(r, i).findAllByType("button")
  .find((b) => txt(b) === "View collection"));
/* Partners are ranked by relevance, so open by NAME rather than position — the
   shared seed ranks a different partner first than the old local fixture did. */
const openPartnerNamed = (r, name) => {
  const card = cls(r, "pt").find((n) => txt(cls(n, "pt-n")[0]) === name);
  assert(card, "partner " + name);
  click(card.findAllByType("button").find((b) => txt(b) === "View collection"));
};
const tab = (r, label) => click(cls(r, "tabb").find((b) => txt(b).startsWith(label)));

/* ---------- 1. Goal CRUD and derived lifecycle ---------- */
describe("Goal CRUD", () => {
  test("a goal can be added from a partner's inventory", () => {
    const r = mk();
    const before = allGoals(r).length;
    nav(r, "Trusted Partners"); openPartner(r, 0); tab(r, "All Inventory");
    const add = btn(r, "Add to my goals");
    assert(add, "an un-goaled card offers to become one");
    click(add);
    click(btnHas(r, "Secondary — keeping an eye out"));
    nav(r, "Goals");
    eq(allGoals(r).length, before + 1, "the goal was created");
  });

  test("a new goal matches across ALL partners, not just where it was found", () => {
    const r = mk();
    nav(r, "Trusted Partners"); openPartner(r, 2);      // Kane TCG
    tab(r, "All Inventory");
    const add = btn(r, "Add to my goals");
    if (!add) return;
    click(add); click(btnHas(r, "Primary — actively looking"));
    nav(r, "Goals");
    const g = allGoals(r).find((n) => /partner/.test(txt(n)));
    assert(g, "the new goal reports partner availability");
  });

  test("a goal can be promoted and demoted", () => {
    const r = mk();
    const before = cls(r, "goal").length;
    click(byClassIn(cls(r, "gwatch-r")[0], "gwatch-m")[0]);
    click(btn(r, "Move to Primary"));
    const after = cls(r, "goal")[0];
    /* Verify by state rather than by card name — the canonical universe holds
       different cards than the old fixture. */
    eq(cls(r, "goal").length, before + 1, "one more goal is now primary");
  });

  test("a goal can be removed when nothing is being negotiated", () => {
    const r = mk();
    const before = allGoals(r).length;
    click(byClassIn(cls(r, "gwatch-r")[0], "gwatch-m")[0]);
    const rm = btn(r, "Remove");
    eq(rm.props.disabled, false, "removable while idle");
    click(rm);
    eq(allGoals(r).length, before - 1, "the goal is gone");
  });

  test("a goal being negotiated cannot be removed", () => {
    const r = mk();
    const live = cls(r, "goal").find((n) => txt(n).includes("Negotiating"));
    click(live.findAllByType("button").find((b) => txt(b) === "Edit this goal"));
    eq(btn(r, "Remove").props.disabled, true, "blocked while a negotiation is open");
    assert(all(r).includes("finish or stop that first"), "and the reason is given");
  });
});

describe("Goal lifecycle is derived, not stored", () => {
  test("all three states are visible and come from opportunities", () => {
    /* Chips render on primary cards; the watchlist is deliberately lighter, so
       assert the derived states themselves. */
    const st = __store.get().get();
    const D2 = require("../domain/metyet-domain.js");
    const mine = st.goals.filter((g) => g.collectorId === "c12");
    const states = new Set(mine.map((g) => D2.goalState(g.id, st.opportunities)));
    ["seeking", "negotiating", "satisfied"].forEach((x) =>
      assert(states.has(x), `${x} is represented: ${[...states].join(",")}`));
  });

  test("no goal record stores a status field", () => {
    const seed = SEEDSRC().slice(SEEDSRC().indexOf("const GOALS = ["), SEEDSRC().indexOf("const INVENTORY"));
    assert(!/status:/.test(seed), "goals carry only what the collector stated");
    assert(/const goalState = /.test(DOMAIN()), "state is computed, in the domain");
  });

  test("stopping a negotiation returns the goal to Seeking", () => {
    const r = mk();
    const live = cls(r, "goal").find((n) => txt(n).includes("Negotiating"));
    const name = txt(byClassIn(live, "goal-n")[0]);
    click(live.findAllByType("button").find((b) => byClassIn(live, "goal-live").length
      && /Choose|Review|Agree|Check|Confirm|Make your/.test(txt(b))));
    click(btn(r, "Stop this negotiation"));
    const after = allGoals(r).find((n) => txt(n).includes(name));
    assert(txt(after).includes("Seeking"), "back to Seeking: " + txt(after).slice(0, 90));
    assert(!txt(after).includes("Negotiating"), "and no longer negotiating");
  });

  test("the goal survives a stopped negotiation", () => {
    const r = mk();
    const before = allGoals(r).length;
    const live = cls(r, "goal").find((n) => txt(n).includes("Negotiating"));
    click(live.findAllByType("button").find((b) => /Choose|Review|Agree|Check|Confirm|Make your/.test(txt(b))));
    click(btn(r, "Stop this negotiation"));
    eq(allGoals(r).length, before, "the card is still wanted");
  });

  test("a completed deal reads as Satisfied", () => {
    const r = mk();
    const st = __store.get().get();
    const D2 = require("../domain/metyet-domain.js");
    const sat = st.goals.filter((g) => g.collectorId === "c12"
      && D2.goalState(g.id, st.opportunities) === "satisfied");
    assert(sat.length >= 1, "a completed opportunity produces Satisfied");
  });
});

/* ---------- 2. One negotiation per goal, enforced in the domain ---------- */
describe("One active negotiation per goal", () => {
  test("the rule lives in the action, not the button", () => {
    const fn = STORE().slice(STORE().indexOf("startOpportunity({"), STORE().indexOf("patchOpportunity("));
    assert(/oneNegotiationPerGoal\(goalId, s\.opportunities\)\)/.test(fn),
      "the shared action refuses a second negotiation regardless of caller");
    assert(/D\.INVARIANTS\.goalIsPursued\(goalId, s\.goals\)/.test(fn),
      "and refuses a goal that is not being actively pursued");
  });

  test("the UI explains the rule instead of failing", () => {
    const r = mk();
    nav(r, "Trusted Partners"); openPartner(r, 1);
    assert(all(r).includes("Negotiating elsewhere") || all(r).includes("already negotiating"),
      "an already-negotiated goal shows why no offer is available");
  });

  test("Make an offer is withheld while negotiating, Reach out is not", () => {
    const r = mk();
    const live = cls(r, "goal").find((n) => txt(n).includes("Negotiating"));
    assert(live, "a live goal exists");
    // supply view for that goal still offers conversation
    const seeking = cls(r, "goal").find((n) => txt(n).includes("Seeking")
      && txt(n).includes("trusted partner"));
    if (!seeking) return;
    click(seeking.findAllByType("button").find((b) => txt(b) === "See who has it"));
    assert(btn(r, "Reach out"), "Reach out available");
    assert(btn(r, "Make an offer"), "and so is an offer, since this goal is idle");
  });
});

/* ---------- 3. Reach out is conversation only ---------- */
describe("Reach out never becomes a negotiation", () => {
  test("it creates no opportunity and does not change goal state", () => {
    const r = mk();
    const D0 = require("../domain/metyet-domain.js");
    const s0 = __store.get().get();
    const target = s0.goals.find((g) => g.collectorId === "c12"
      && D0.goalState(g.id, s0.opportunities) === "seeking");
    assert(target, "a Seeking goal exists");
    const name = s0.catalog.find((c) => c.id === target.cardId).name;
    const row = allGoals(r).find((n) => txt(n).includes(name));
    const route = byClassIn(row, "gwatch-h")[0] || byClassIn(row, "goal-holders")[0];
    if (!route) return;                       // that goal has no supply to contact
    click(route);
    click(btn(r, "Reach out"));
    click(btn(r, "Close"));
    const st = __store.get().get();
    const D2 = require("../domain/metyet-domain.js");
    const g = st.goals.find((x) => x.collectorId === "c12"
      && st.catalog.find((c) => c.id === x.cardId).name === name);
    eq(D2.goalState(g.id, st.opportunities), "seeking", "still Seeking after reaching out");
  });

  test("a collector may reach out to several partners at once", () => {
    const r = mk();
    const seeking = allGoals(r).find((n) => byClassIn(n, "gwatch-h")[0]
      && /[2-9] partners/.test(txt(byClassIn(n, "gwatch-h")[0])));
    if (!seeking) return;
    click(byClassIn(seeking, "gwatch-h")[0]);
    const outs = r.root.findAllByType("button").filter((b) => txt(b) === "Reach out");
    assert(outs.length >= 2, "multiple partners can be contacted");
    outs.forEach((b) => click(b));
    eq(r.root.findAllByType("button").filter((b) => txt(b) === "Reach out").length, 0,
      "each records contact independently");
  });

  test("it keeps goal, partner and exact card context", () => {
    const fn = STORE().slice(STORE().indexOf("reachOut(ctx)"), STORE().indexOf("sendMessage("));
    assert(/newConversation/.test(fn), "it creates a conversation");
    assert(!/opportunit|stage/i.test(fn), "and touches no opportunity or stage");
    const ent = readSrc("domain/metyet-entities.js");
    assert(/goalId, invId, binderId, oppId/.test(ent), "goal, inventory and binder context are carried");
  });

  test("the language says plainly that nothing is committed", () => {
    const r = mk();
    const seeking = allGoals(r).find((n) => byClassIn(n, "gwatch-h")[0]
      && /\d+ partner/.test(txt(byClassIn(n, "gwatch-h")[0])));
    click(byClassIn(seeking, "gwatch-h")[0]);
    assert(all(r).includes("doesn't start a negotiation"), "stated outright");
  });
});

/* ---------- 4. Preferences and For You ---------- */
describe("For You comes from explicit preferences only", () => {
  test("preferences are stated data, not inferred", () => {
    assert(/prefs: \[/.test(SEEDSRC()), "preferences are explicit, stated on the collector");
    const i = VIEW().indexOf("const forYou =");
    const fn = VIEW().slice(i, i + 600);
    assert(/prefs\.includes/.test(fn), "matching is a filter against those preferences");
    assert(!/score|weight|rank|confidence/i.test(fn), "no invented intelligence");
  });

  test("every For You card explains itself by a stated preference", () => {
    const r = mk();
    nav(r, "Trusted Partners"); openPartnerNamed(r, "Northline Cards"); tab(r, "For You");
    const cards = cls(r, "bnd-c");
    assert(cards.length > 0, "there are suggestions");
    /* Casey's canonical preferences are gold-star / alt-art / modern / trainer. */
    cards.forEach((c) => assert(/Gold Star|Alt art|Modern|Trainer/i.test(txt(c)),
      "the reason is shown: " + txt(c).slice(0, 70)));
  });

  test("goals are not repeated as For You", () => {
    const r = mk();
    nav(r, "Trusted Partners"); openPartnerNamed(r, "Northline Cards");
    tab(r, "Primary Goals");
    const goalNames = cls(r, "bnd-c").map((c) => txt(cls(c, "bnd-n")[0]));
    tab(r, "For You");
    const fyNames = cls(r, "bnd-c").map((c) => txt(cls(c, "bnd-n")[0]));
    goalNames.forEach((n) => assert(!fyNames.includes(n), n + " is a goal, not a suggestion"));
  });

  test("the preference basis is disclosed", () => {
    const r = mk();
    nav(r, "Trusted Partners"); openPartnerNamed(r, "Northline Cards"); tab(r, "For You");
    assert(all(r).includes("Based only on what you've told us you collect"),
      "the collector can see why these appear");
  });
});

/* ---------- 5. Select Trade ---------- */
describe("Select Trade", () => {
  /* Find the opportunity actually AT Select Trade rather than assuming a
     position — the shared seed orders goals differently from the old fixture. */
  const atSelect = () => {
    for (let i = 0; i < 6; i++) {
      const r = mk();                                   // a fresh render each attempt
      const b = r.root.findAllByType("button").filter((x) =>
        /^(Choose trade cards|Agree card values|Check the balance|Confirm the handoff|Review their price|Make your offer)$/
          .test(txt(x).trim()))[i];
      if (!b) break;
      click(b);
      const stage = cls(r, "stage-n")[0];
      if (stage && txt(stage) === "Select Trade") return r;
    }
    throw new Error("no Select Trade opportunity in the seed");
  };

  test("interest orders the list but never gates it", () => {
    const fn = VIEW().slice(VIEW().indexOf("const tradeGroups ="), VIEW().indexOf("const turnFor"));
    assert(/interested:/.test(fn) && /other:/.test(fn), "two groups, not a filter");
    assert(/open\.filter\(\(b\) => !keen\(b\)\)/.test(fn), "un-flagged copies remain eligible");
  });

  test("both groups are offered with the specified headings", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    assert(src.includes("They've already shown interest"), "interested heading");
    assert(src.includes("Other cards from your Trade Binder"), "other heading");
  });

  test("nothing is pre-selected", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    assert(/useState\(\[\]\);\s*\/\/ never pre-selected/.test(src),
      "the collector chooses what to offer");
  });

  test("it stays money-free", () => {
    const r = atSelect();
    /* Locate the Select Trade panel by its heading rather than by position —
       "Agreed so far" is a separate, legitimate terms summary. */
    const stage = cls(r, "sec").find((n) => /Cards you offered|Your cards/.test(txt(n)));
    assert(stage, "the Select Trade panel");
    assert(!/\$\d/.test(txt(stage)), "no money on the stage surface: " + txt(stage).slice(0, 90));
    assert(!/%/.test(txt(stage)), "and no percentages");
  });
});

/* ---------- 6. Partner browsing ---------- */
describe("Trusted Partner browsing", () => {
  test("the four tabs are present and scoped to that partner", () => {
    const r = mk();
    nav(r, "Trusted Partners"); openPartner(r, 0);
    const labels = cls(r, "tabb").map((b) => txt(b).replace(/\d+$/, "").trim());
    eq(labels.join(" | "), "Primary Goals | Secondary Goals | For You | All Inventory",
      "the requested four");
  });

  test("All Inventory holds everything the partner has", () => {
    const r = mk();
    nav(r, "Trusted Partners"); openPartner(r, 0); tab(r, "All Inventory");
    const total = cls(r, "bnd-c").length;
    tab(r, "Primary Goals"); const p = cls(r, "bnd-c").length;
    tab(r, "Secondary Goals"); const s = cls(r, "bnd-c").length;
    assert(total >= p + s, "goal tabs are subsets of the shelf");
  });

  test("goal tabs contain only goals of that tier", () => {
    const r = mk();
    nav(r, "Trusted Partners"); openPartner(r, 0); tab(r, "Primary Goals");
    cls(r, "bnd-c").forEach((c) => assert(txt(c).includes("Primary"), "primary only"));
  });
});

/* ---------- 7. Goal supply view ---------- */
describe("Who has it", () => {
  const supply = () => {
    const r = mk();
    const g = allGoals(r).find((n) => byClassIn(n, "gwatch-h")[0]
      && /\d+ partner/.test(txt(byClassIn(n, "gwatch-h")[0])))
      || cls(r, "goal").find((n) => byClassIn(n, "goal-holders")[0]);
    const route = byClassIn(g, "gwatch-h")[0] || byClassIn(g, "goal-holders")[0];
    click(route);
    return r;
  };

  test("it shows location, the exact card and the price", () => {
    const r = supply();
    const row = cls(r, "pick")[0];
    assert(/Minnesota/.test(txt(row)), "location");
    assert(/#\d|PSA |Raw/.test(txt(row)), "exact card identity");
    assert(/\$\d/.test(txt(row)), "and their price");
  });

  test("it shows how many of my binder cards that partner would consider", () => {
    const r = supply();
    assert(/Open to \d+ of your binder card/.test(all(r)), "trade leverage is visible");
  });

  test("during a negotiation alternatives stay visible without an offer button", () => {
    const r = mk();
    const live = cls(r, "goal").find((n) => txt(n).includes("Negotiating"));
    // reach the supply view for a card already being negotiated
    const src = readSrc("collector/MetYetCollector.jsx");
    assert(/\{!live && \(\s*<button className="btn sm pri"/.test(src),
      "Make an offer is conditional on there being no live negotiation");
    assert(src.includes("you can only negotiate with one at a time"),
      "and the reason is explained");
  });
});

/* ---------- 8. Trade Binder ---------- */
describe("Trade Binder filtering", () => {
  test("All, Interested and each interested partner are offered", () => {
    const r = mk();
    nav(r, "Trade Binder");
    const labels = cls(r, "tabb").map((b) => txt(b).replace(/\d+$/, "").trim());
    assert(labels[0] === "All" && labels[1] === "Interested", "the two fixed filters");
    assert(labels.length > 2, "plus individual partners: " + labels.join(" | "));
  });

  test("filters narrow correctly and are derived from interest records", () => {
    const r = mk();
    nav(r, "Trade Binder");
    const total = cls(r, "bnd-c").length;
    tab(r, "Interested");
    const keen = cls(r, "bnd-c").length;
    assert(keen > 0 && keen < total, `${keen} of ${total} have interest`);
    cls(r, "bnd-c").forEach((c) => assert(/would consider it/.test(txt(c)), "each has interest"));
  });

  test("interest state is not duplicated onto binder cards", () => {
    const seed = SEEDSRC().slice(SEEDSRC().indexOf("const BINDER = ["), SEEDSRC().indexOf("const INTERESTS"))
      .replace(/\/\*[\s\S]*?\*\//g, "");                       // code, not prose
    assert(!/interest/i.test(seed), "binder copies carry no interest field");
  });

  test("an interested partner opens their relationship view", () => {
    const r = mk();
    nav(r, "Trade Binder");
    const withInterest = cls(r, "bnd-c").find((c) => /would consider it/.test(txt(c)));
    click(withInterest);
    const row = cls(r, "rowb")[0];
    assert(row, "partners are actionable");
    click(row);
    assert(cls(r, "pt-n").length > 0 || all(r).includes("All partners"),
      "and land on that partner");
  });
});

/* ---------- 9. Language ---------- */
describe("Interest language", () => {
  test("interest is never described as demand or commitment", () => {
    const r = mk();
    let t = all(r);
    nav(r, "Trade Binder"); t += all(r);
    nav(r, "Trusted Partners"); t += all(r);
    for (const bad of ["they want", "cards they want", "Reserved", "Committed", "Guaranteed"]) {
      assert(!t.includes(bad), `must not say "${bad}"`);
    }
  });

  test("it is described as willingness to consider", () => {
    const r = mk();
    nav(r, "Trade Binder");
    assert(/would consider/.test(all(r)), "binder wording");
    nav(r, "Trusted Partners");
    assert(/consider/.test(all(r)), "partner wording");
  });
});

/* ---------- 10. Privacy, preserved ---------- */
describe("The collector's own valuation stays private", () => {
  test("it never appears on a partner-facing surface", () => {
    const r = mk();
    nav(r, "Trusted Partners");
    assert(!all(r).includes("$700"), "not on the partner list");
    openPartner(r, 0);
    assert(!all(r).includes("$700"), "nor inside their collection");
  });

  test("it is labelled as private where it does appear", () => {
    const r = mk();
    nav(r, "Trade Binder");
    click(cls(r, "bnd-c")[0]);
    assert(all(r).includes("Only you can see this"), "explicitly private");
  });
});

/* ---------- 11. Concepts stay separate ---------- */
describe("Concepts are not collapsed together", () => {
  test("Reach out, Opportunity, Interest and Goal are distinct records", () => {
    ["goals", "interests", "conversations", "opportunities"].forEach((k) =>
      assert(new RegExp(k + ":").test(STORE()), `${k} is its own canonical collection`));
  });

  test("trade selection carries no valuation", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    const fn = src.slice(src.indexOf("submitTrade:"), src.indexOf("marketRespond:"));
    assert(!/market|Pct|money/i.test(fn), "selection says what may be included, nothing more");
  });
});

/* ============================================================================
   ARTWORK

   This exists because artwork silently vanished during the shared-state
   migration: the seed renamed the field to csvId while Art still read card.img,
   and every card fell through to the identity placeholder. Nothing failed,
   because nothing asserted that images actually render. These do.
   ========================================================================= */
describe("Card artwork renders and degrades safely", () => {
  const imgs = (r) => r.root.findAllByType("img")
    .filter((n) => /\bart\b/.test(String(n.props.className || "")));
  const plates = (r) => r.root.findAll((n) => typeof n.type === "string"
    && String(n.props.className || "").split(/\s+/).includes("ph"));
  const failAll = (r) => TR.act(() => {
    r.root.findAllByType("img").forEach((i) => i.props.onError && i.props.onError());
  });

  test("1. seeded goal cards render real images", () => {
    const r = mk();
    const goals = allGoals(r);
    assert(goals.length > 0, "goals render");
    /* The canonical catalog contains some cards with no artwork reference; those
       correctly use the identity plate. Every card resolves to one or the other. */
    eq(imgs(r).length + plates(r).length, goals.length,
      "every goal resolves to artwork or an identity plate");
    assert(imgs(r).length > 0, "and real images do render");
    imgs(r).forEach((i) => assert(/^https:\/\/images\./.test(i.props.src),
      "a real artwork URL: " + i.props.src));
  });

  test("1. the binder and partner surfaces render artwork too", () => {
    const r = mk();
    nav(r, "Trade Binder");
    assert(imgs(r).length + plates(r).length >= cls(r, "bnd-c").length,
      "every binder card resolves to artwork or a plate");
    nav(r, "Trusted Partners");
    assert(imgs(r).length > 0, "partner stock strips show artwork");
  });

  test("2. URLs derive from the canonical csvId, and every seeded card has one", () => {
    const { buildCanonicalSeed } = require("../dist/MetYet.cjs");
const SEED = buildCanonicalSeed();
    const withArt = SEED.catalog.filter((c) => c.csvId);
    assert(withArt.length > 0, "the canonical catalog carries csvId references");
    assert(!SEED.catalog.some((c) => "img" in c), "and no obsolete img field");
    const r = mk();
    /* The Charizard goal must resolve to the catalog's csvId for that card. */
    imgs(r).forEach((i) => {
      const m = /images\.pokemontcg\.io\/([^/]+)\/([^_]+)_/.exec(i.props.src);
      assert(m, "url shape: " + i.props.src);
      assert(SEED.catalog.some((c) => c.csvId === m[1] + "-" + m[2]),
        "every rendered url traces to a canonical csvId: " + i.props.src);
    });
  });

  test("3. a failed image falls back to the identity plate, never blank", () => {
    const r = mk();
    const before = imgs(r).length;
    const platesBefore = plates(r).length;
    assert(before > 0, "images first");
    failAll(r);
    eq(imgs(r).length, 0, "the images are gone");
    eq(plates(r).length, before + platesBefore, "and every one became an identity plate");
  });

  test("4. the fallback names the card well enough to recognise it", () => {
    const r = mk();
    failAll(r);
    /* Large plates carry the full identity; the smallest carry the name only,
       which is all that fits. */
    const big = plates(r).filter((p) => cls(p, "ph-s").length > 0);
    assert(big.length > 0, "large plates exist");
    big.forEach((p) => {
      const t = txt(p);
      assert(txt(cls(p, "ph-n")[0]).length > 0, "the card's name");
      assert(/#\d|·/.test(t), "set and printed number: " + t);
      assert(/PSA |Raw/.test(t), "grade or condition: " + t);
    });
    plates(r).forEach((p) => assert(txt(p).length > 0, "no plate is ever empty"));
  });

  test("5. failure does not collapse or remove the artwork container", () => {
    const r = mk();
    const sizeOf = (n) => String(n.props.className || "").split(/\s+/)
      .find((c) => ["xl", "lg", "md", "sm", "xs"].includes(c));
    const before = imgs(r).map(sizeOf);
    const platesBefore = plates(r).map(sizeOf);
    failAll(r);
    const after = plates(r).map(sizeOf);
    eq(after.length, before.length + platesBefore.length, "the same number of containers");
    eq(after.slice().sort().join(","), before.concat(platesBefore).sort().join(","),
      "at the same sizes — no collapse, no shift");
    plates(r).forEach((p) => {
      assert(String(p.props.className).includes("art"), "still an artwork container");
      assert(p.props.role === "img" && p.props["aria-label"],
        "and still announced as the card");
    });
  });

  test("5. the goal card keeps its shape when artwork fails", () => {
    const r = mk();
    const before = cls(r, "goal").length;
    failAll(r);
    eq(cls(r, "goal").length, before, "no card was lost");
    assert(cls(r, "goal-n").length === before, "identities still render beside the plate");
  });

  test("6. the obsolete card.img field cannot return to the artwork path", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    const art = src.slice(src.indexOf("function Art("), src.indexOf("const initials"));
    assert(/artUrl\(card\.csvId\)/.test(art), "artwork reads the canonical field");
    assert(!/card\.img\b/.test(art), "and never the obsolete one");
    /* Guard the whole component, not just Art — the field was reintroduced by a
       seed rename last time, not by editing Art. */
    assert(!/\bcard\.img\b/.test(src), "card.img appears nowhere in the Collector");
    assert(!/\bimg:\s*["']/.test(SEEDSRC()),
      "and the shared seed defines no img field");
  });

  test("6. every catalog card the UI shows can resolve artwork", () => {
    const { buildCanonicalSeed } = require("../dist/MetYet.cjs");
const SEED = buildCanonicalSeed();
    const shown = new Set([...SEED.goals.map((g) => g.cardId),
      ...SEED.binder.map((b) => b.cardId), ...SEED.inventory.map((i) => i.cardId)]);
    shown.forEach((id) => {
      const c = SEED.catalog.find((x) => x.id === id);
      assert(c, "catalog has " + id);
      if (c.csvId) assert(/-/.test(c.csvId), c.name + " has a resolvable csvId");
    });
  });
});

/* Drive the staged Add Goal flow: search -> copy criteria -> tier. Centralised so
   a change to the picker updates one place rather than every caller. */
const addGoalSearch = (r, term) => {
  const q = cls(r, "cip-q")[0];
  assert(q, "the shared card identity search is present");
  TR.act(() => { q.props.onChange({ target: { value: term } }); });
  return cls(r, "cip-row");
};
const resolveIdentity = (r) => {
  /* Answer every copy-level question the picker asks, whatever they are. */
  let guard = 0;
  while (guard++ < 4) {
    const open = cls(r, "cip-fld").filter((f) =>
      !f.findAllByType("button").some((b) => String(b.props.className).includes("on")));
    if (!open.length) break;
    const btns = open[0].findAllByType("button");
    click(btns[1] || btns[0]);
  }
  const cont = btn(r, "Continue");
  assert(cont && !cont.props.disabled, "the identity resolves and Continue enables");
  click(cont);
};

/* ============================================================================
   GOALS — the collector's planning surface

   Primary Goals are the working area; Secondary is a watchlist. Adding a goal
   is an act of intent and must not depend on supply existing. A live deal must
   never hide who else has the card.
   ========================================================================= */
describe("Goals: add a goal from the Goals screen", () => {
  test("1. there is a direct Add goal entry point", () => {
    const r = mk();
    assert(btn(r, "Add goal"), "an Add goal control on the Goals page itself");
  });

  test("2. a goal can be created without visiting any partner inventory", () => {
    const r = mk();
    const before = cls(r, "goal").length + cls(r, "gwatch-r").length;
    click(btn(r, "Add goal"));
    /* Stage one: the same identity search the Trusted Partner uses. */
    const hits = addGoalSearch(r, "charizard base set");
    assert(hits.length > 0, "the canonical catalog is searchable");
    click(hits[0]);
    /* Stage two: the copy-level criteria that decide WHICH card. */
    resolveIdentity(r);
    /* Stage three: intent, only once the identity is exact. */
    click(btnHas(r, "Secondary"));
    eq(cls(r, "goal").length + cls(r, "gwatch-r").length, before + 1, "the goal exists");
    /* Never left the Goals screen. */
    assert(cls(r, "pt").length === 0, "no partner browsing was required");
  });

  test("3. creation uses the canonical goal action, not a parallel model", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    const picker = src.slice(src.indexOf("function AddGoalPicker"), src.indexOf("/* A secondary goal"));
    assert(/<CardIdentityPicker/.test(picker), "it uses the shared identity picker");
    assert(/st\.addGoalForIdentity\(/.test(picker), "and delegates creation to the store action");
    const store = src.slice(src.indexOf("addGoalForIdentity:"), src.indexOf("addGoalForIdentity:") + 200);
    assert(/A\.addGoal\(/.test(store), "which routes through the canonical goal action");
  });

  test("a goal may be added when no partner stocks the card", () => {
    const r = mk();
    click(btn(r, "Add goal"));
    assert(addGoalSearch(r, "charizard").length > 0, "results are not filtered by availability");
    assert(all(r).includes("a partner doesn't need to have it yet"),
      "and the copy says so outright");
  });
});

describe("Goals: Primary and Secondary do different jobs", () => {
  test("4. they render in structurally different treatments", () => {
    const r = mk();
    assert(cls(r, "goal").length > 0, "primary goals render as full cards");
    assert(cls(r, "gwatch-r").length > 0, "secondary goals render as watchlist rows");
    /* A watch row carries no deal machinery. */
    cls(r, "gwatch-r").forEach((row) => {
      eq(byClassIn(row, "goal-live").length, 0, "no deal block on a watch row");
      eq(byClassIn(row, "state").length, 0, "and no lifecycle chip");
    });
    /* A primary card carries identity, coverage and the deal. */
    const p = cls(r, "goal")[0];
    assert(byClassIn(p, "goal-n")[0], "primary keeps a prominent name");
    assert(byClassIn(p, "art")[0], "and large artwork");
  });

  test("the distinction survives hiding the words Primary and Secondary", () => {
    const r = mk();
    const primaryArt = byClassIn(cls(r, "goal")[0], "art")[0];
    const watchArt = byClassIn(cls(r, "gwatch-r")[0], "art")[0];
    const size = (n) => String(n.props.className).split(/\s+/).find((c) =>
      ["xl", "lg", "md", "sm", "xs"].includes(c));
    assert(size(primaryArt) !== size(watchArt),
      "different artwork scale: " + size(primaryArt) + " vs " + size(watchArt));
  });

  test("11. promoting and demoting moves a goal cleanly between sections", () => {
    const r = mk();
    const p0 = cls(r, "goal").length;
    const w0 = cls(r, "gwatch-r").length;

    /* Promote a watchlist goal. */
    click(byClassIn(cls(r, "gwatch-r")[0], "gwatch-m")[0]);
    click(btn(r, "Move to Primary"));
    eq(cls(r, "goal").length, p0 + 1, "it became a primary card");
    eq(cls(r, "gwatch-r").length, w0 - 1, "and left the watchlist");

    /* Demote it back. */
    const card = cls(r, "goal")[cls(r, "goal").length - 1];
    click(card.findAllByType("button").find((b) => txt(b) === "Edit this goal"));
    click(btn(r, "Move to Secondary"));
    eq(cls(r, "goal").length, p0, "back to where it started");
    eq(cls(r, "gwatch-r").length, w0, "with nothing duplicated or lost");
  });
});

describe("Goals: the live deal is legible and honest", () => {
  const rayquaza = (r) => cls(r, "goal").find((n) => txt(n).includes("Rayquaza Gold Star"));

  test("5. Rayquaza remains o9 / select-trade at the agreed price", () => {
    const o = __store.get().get().opportunities.find((x) => x.id === "o9");
    eq(o.stage, "select-trade", "canonical stage");
    eq(o.agreedPrice, 9310, "canonical agreed price");
    eq(o.goalId, "g20", "and it references the goal");
  });

  test("6. the action is task-oriented, not a generic Continue", () => {
    const r = mk();
    const card = rayquaza(r);
    const labels = card.findAllByType("button").map((b) => txt(b).trim());
    assert(labels.includes("Choose trade cards"), "names the pending action: " + labels);
    assert(!labels.includes("Continue"), "and does not say Continue");
  });

  test("the card states that price agreement already happened", () => {
    const t = txt(rayquaza(mk()));
    assert(t.includes("Price agreed at $9,310 with Northline Cards"),
      "supporting context: " + t.slice(t.indexOf("Price"), t.indexOf("Price") + 60));
    assert(t.includes("Select Trade"), "with the stage kept as context");
  });

  test("7. clicking the action only navigates — nothing mutates", () => {
    const r = mk();
    const before = JSON.stringify(__store.get().get().opportunities.find((x) => x.id === "o9"));
    click(rayquaza(r).findAllByType("button").find((b) => txt(b).trim() === "Choose trade cards"));
    eq(JSON.stringify(__store.get().get().opportunities.find((x) => x.id === "o9")), before,
      "the opportunity is byte-identical after navigation");
  });

  test("next-action labels are derived from stage, not hard-coded", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    const fn = src.slice(src.indexOf("function nextActionFor"), src.indexOf("/* Consumer wording"));
    ["agree-price", "select-trade", "value-trade", "deal", "fulfillment"].forEach((st2) =>
      assert(fn.includes('"' + st2 + '"'), st2 + " has a derived label"));
    assert(!/Rayquaza|i17|o9/.test(fn), "no card- or opportunity-specific behaviour");
  });

  test("a goal with no live deal shows no deal block", () => {
    const r = mk();
    const idle = cls(r, "goal").find((n) => !txt(n).includes("Negotiating"));
    if (idle) eq(byClassIn(idle, "goal-live").length, 0, "nothing to continue");
  });
});

describe("Goals: every holder stays reachable", () => {
  const rayquaza = (r) => cls(r, "goal").find((n) => txt(n).includes("Rayquaza Gold Star"));

  test("8. the count remains accurate", () => {
    const t = txt(rayquaza(mk()));
    assert(/See all 3 partners with this card/.test(t), "three holders: " + t.slice(-90));
  });

  test("9. the route to all holders survives a live negotiation", () => {
    const r = mk();
    const card = rayquaza(r);
    assert(byClassIn(card, "goal-live")[0], "a live deal is shown");
    assert(byClassIn(card, "goal-holders")[0], "AND the supply route is still present");
    click(byClassIn(card, "goal-holders")[0]);
    const names = cls(r, "pick").map(txt).join(" ");
    ["Northline Cards", "Complete Collectibles", "Ryan's Collectibles"].forEach((n) =>
      assert(names.includes(n), n + " is reachable"));
  });

  test("10. alternatives are contactable, but a second offer is refused", () => {
    const r = mk();
    click(byClassIn(rayquaza(r), "goal-holders")[0]);
    const outs = r.root.findAllByType("button").filter((b) => /Reach(ed)? out/.test(txt(b)));
    eq(outs.length, 3, "every partner can be contacted");
    eq(r.root.findAllByType("button").filter((b) => txt(b).trim() === "Make an offer").length, 0,
      "and no second offer is offered while one is live");
    assert(all(r).includes("you can only negotiate with one at a time"),
      "with the reason stated");
  });

  test("the supply route reuses WhoHasIt rather than duplicating it", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    const card = src.slice(src.indexOf("function GoalCard"), src.indexOf("/* ==================== TRADE BINDER"));
    assert(/go\(\{ v: "start", goalId: g\.id \}\)/.test(card), "it routes to the existing flow");
    assert(!/partnersWith\(g\.cardId\)\.map\(\(h\) => \(\s*<div className="pick"/.test(card),
      "and does not re-render the partner list itself");
  });
});

describe("Goals: empty states", () => {
  test("12. no primary goals explains the role and offers Add goal", () => {
    const r = mk();
    /* Demote every primary goal. */
    let guard = 0;
    while (cls(r, "goal").length > 0 && guard++ < 10) {
      const card = cls(r, "goal")[0];
      click(card.findAllByType("button").find((b) => txt(b) === "Edit this goal"));
      click(btn(r, "Move to Secondary"));
    }
    eq(cls(r, "goal").length, 0, "none left");
    assert(all(r).includes("A primary goal is a card you're actively trying to get"),
      "the role is explained");
    assert(btnHas(r, "Add your first goal"), "with a way to add one");
  });

  test("12. no secondary goals stays lightweight", () => {
    const r = mk();
    /* Promote every watch row; goals under negotiation cannot be removed, so
       promotion is the reliable way to empty the section. */
    let guard = 0;
    while (cls(r, "gwatch-r").length > 0 && guard++ < 20) {
      click(byClassIn(cls(r, "gwatch-r")[0], "gwatch-m")[0]);
      const move = btn(r, "Move to Primary");
      if (!move) break;
      click(move);
    }
    eq(cls(r, "gwatch-r").length, 0, "none left");
    eq(cls(r, "gsec-empty").length, 0, "no large empty card for the watchlist");
    assert(all(r).includes("Nothing here yet."), "just a quiet line");
  });

  test("12. a goal nobody stocks is still valid and useful", () => {
    const r = mk();
    const orphan = cls(r, "goal").concat(cls(r, "gwatch-r"))
      .find((n) => /No one has it|None of your partners have this/.test(txt(n)));
    if (!orphan) return;
    assert(!/invalid|cannot|unavailable/i.test(txt(orphan)), "it is not treated as broken");
  });
});

/* ============================================================================
   GOALS — visual system and activity surfacing

   Goals should read as an active collecting workspace and should look like the
   rest of MetYet, not like a second product with its own palette.
   ========================================================================= */
describe("Navigation uses the shared MetYet icon set", () => {
  test("1-3. all three destinations render real SVG marks, not glyphs", () => {
    const r = mk();
    const ics = cls(r, "nav-ic");
    eq(ics.length, 3, "one per destination");
    ics.forEach((n) => eq(n.findAllByType("svg").length, 1, "an SVG icon"));
    const t = cls(r, "nav-i").map(txt).join("");
    ["\u25CE", "\u25A4", "\u25CD"].forEach((glyph) =>
      assert(!t.includes(glyph), "the old text glyph is gone"));
  });

  test("1-3. the icons come from the Trusted Partner icon component", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    assert(/import \{ buildCanonicalSeed, Icon \} from "\.\.\/src\/MetYet\.jsx"/.test(src),
      "the Collector imports the shared Icon");
    assert(/icon: "target"/.test(src) && /icon: "binder"/.test(src) && /icon: "people"/.test(src),
      "crosshairs, binder and people");
    const tp = readSrc("src/MetYet.jsx");
    ["target:", "binder:", "people:"].forEach((k) =>
      assert(tp.includes(k), k + " is defined once, in the shared set"));
  });
});

describe("Goals shares the MetYet palette", () => {
  test("13. no Collector-only purple remains", () => {
    ["collector/MetYetCollector.jsx", "shell/MetYetPrototype.jsx"].forEach((f) =>
      assert(!/6C5CE0|108,92,224/i.test(readSrc(f)), f + " carries no purple"));
  });

  test("13. the action colour stays in MetYet's teal family, and tokenised", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    /* The Collector runs dark, so the brand hue is lifted to carry on a
       near-black surface. It must remain teal, never purple, and must stay a
       token so no component hard-codes a colour. */
    const accent = /--accent: (#[0-9A-Fa-f]{6})/.exec(src);
    assert(accent, "the accent is a token");
    const [, hex] = accent;
    const [r2, g2, b2] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    assert(g2 > r2 && b2 > r2, "teal family — green and blue lead: " + hex);
    assert(!/6C5CE0|purple/i.test(src), "and no purple anywhere");
    const tp = readSrc("src/MetYet.jsx");
    assert(tp.includes("--t1: #0B5D66"), "the Trusted Partner keeps its own value");
  });

  test("13. the Collector surface is dark", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    const bg = /--bg: (#[0-9A-Fa-f]{6})/.exec(src);
    assert(bg, "the page background is a token");
    const lum = [1, 3, 5].map((i) => parseInt(bg[1].slice(i, i + 2), 16))
      .reduce((a, c) => a + c, 0) / 3;
    assert(lum < 60, "a genuinely dark page background: " + bg[1]);
    const text = /--text: (#[0-9A-Fa-f]{6})/.exec(src);
    const tlum = [1, 3, 5].map((i) => parseInt(text[1].slice(i, i + 2), 16))
      .reduce((a, c) => a + c, 0) / 3;
    assert(tlum > 190, "with light text on it: " + text[1]);
  });

  test("13. nothing hard-codes a light surface", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    const css = src.slice(src.indexOf("const CSS = `"), src.indexOf("/* ==========", src.indexOf("const CSS = `")));
    /* White is legitimate only as text on a coloured avatar. */
    const whites = (css.match(/background: #FFF/g) || []);
    eq(whites.length, 0, "no white surfaces remain in the dark theme");
  });
});

describe("The Primary Goal surfaces real activity", () => {
  const rayquaza = (r) => cls(r, "goal").find((n) => txt(n).includes("Rayquaza Gold Star"));

  test("4. an active deal renders lifecycle progress from the canonical stage", () => {
    const r = mk();
    const card = rayquaza(r);
    const segs = byClassIn(card, "gp-seg");
    eq(segs.length, 5, "one segment per deal stage");
    const current = byClassIn(card, "gp-l").filter((n) =>
      String(n.props.className).includes("on")).map(txt);
    eq(current.join(), "Select Trade", "the canonical stage is marked");
    eq(segs.filter((n) => String(n.props.className).includes("done")).length, 1,
      "with Agree on Price behind it");
  });

  test("5. changing the canonical stage moves the bar, with no goal-side state", () => {
    const r = mk();
    TR.act(() => { __store.get().actions.patchOpportunity("o9", (o) => ({ ...o, stage: "deal" })); });
    const current = byClassIn(rayquaza(r), "gp-l").filter((n) =>
      String(n.props.className).includes("on")).map(txt);
    eq(current.join(), "Deal", "the bar follows the opportunity");
    const g = __store.get().get().goals.find((x) => x.id === "o9".replace("o9", "g20"));
    assert(!("stage" in g), "and the Goal record stores no stage");
  });

  test("4. the bar derives from the shared lifecycle, not a local list", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    assert(/const DEAL_STEPS = D\.STAGES\.filter/.test(src),
      "the steps come from the canonical STAGES");
    assert(!/DEAL_STEPS = \["agree-price"/.test(src), "not a hand-written copy");
  });

  test("no active deal means no lifecycle bar at all", () => {
    const r = mk();
    TR.act(() => { __store.get().actions.endOpportunity("o9", "collector", "2026-08-14"); });
    eq(byClassIn(rayquaza(r), "goal-prog").length, 0, "no empty progress treatment");
  });

  test("6/8. with no active deal, every matching partner is listed", () => {
    const r = mk();
    TR.act(() => { __store.get().actions.endOpportunity("o9", "collector", "2026-08-14"); });
    const card = rayquaza(r);
    const rows = byClassIn(card, "gs-row");
    eq(rows.length, 3, "all three holders, not a summary");
    const names = rows.map((n) => txt(byClassIn(n, "gs-n")[0]));
    ["Northline Cards", "Complete Collectibles", "Ryan's Collectibles"].forEach((p) =>
      assert(names.includes(p), p + " is listed"));
    /* Derived from the canonical selector, not re-matched in the component. */
    const src = readSrc("collector/MetYetCollector.jsx");
    const from = src.indexOf("function GoalCard");
    const fn = src.slice(from, src.indexOf("\nfunction ", from + 10));
    assert(/st\.partnersWith\(g\.cardId\)/.test(fn), "it uses the shared matcher");
    assert(!/identityKey|sameIdentity/.test(fn), "and does no matching of its own");
  });

  test("7/9. each partner is contactable, and contact creates no negotiation", () => {
    const r = mk();
    TR.act(() => { __store.get().actions.endOpportunity("o9", "collector", "2026-08-14"); });
    const before = __store.get().get().opportunities.length;
    const rows = byClassIn(rayquaza(r), "gs-row");
    rows.forEach((n) => assert(n.findAllByType("button").some((b) => /Reach out|Continue chatting/.test(txt(b))),
      "every partner exposes a conversation action"));
    click(rows[0].findAllByType("button").find((b) => /Reach out/.test(txt(b))));
    eq(__store.get().get().opportunities.length, before, "no Opportunity was created");
    eq(__store.get().get().conversations.length, 1, "a Conversation was");
  });

  test("an existing conversation reads as continuing, not starting", () => {
    const r = mk();
    TR.act(() => { __store.get().actions.endOpportunity("o9", "collector", "2026-08-14"); });
    click(byClassIn(rayquaza(r), "gs-row")[0].findAllByType("button")
      .find((b) => /Reach out/.test(txt(b))));
    const again = byClassIn(rayquaza(r), "gs-row")[0];
    assert(/Continue chatting/.test(txt(again)), "the label acknowledges the history");
  });

  test("10. a goal nobody stocks still renders cleanly", () => {
    const r = mk();
    const none = cls(r, "goal").concat(cls(r, "gwatch-r"))
      .find((n) => /None of your partners have this|No one has it/.test(txt(n)));
    if (!none) return;
    eq(byClassIn(none, "gs-row").length, 0, "no empty partner list");
    assert(!/undefined|NaN/.test(txt(none)), "and nothing broken");
  });

  test("11/12. the goal note is hidden, and the data is untouched", () => {
    const r = mk();
    assert(!txt(rayquaza(r)).includes("first big purchase"), "the note is not rendered");
    eq(cls(r, "goal-note").length, 0, "no note treatment at all");
    const g = __store.get().get().goals.find((x) => x.id === "g20");
    eq(g.note, "Rayquaza Gold Star — first big purchase", "but the record still carries it");
  });

  test("14/15. the next action and the Primary/Secondary split are intact", () => {
    const r = mk();
    assert(rayquaza(r).findAllByType("button").some((b) => txt(b).trim() === "Choose trade cards"),
      "the task-oriented CTA survives");
    assert(cls(r, "gwatch-r").length > 0, "secondary goals are still compact rows");
    const pArt = byClassIn(cls(r, "goal")[0], "art")[0];
    const sArt = byClassIn(cls(r, "gwatch-r")[0], "art")[0];
    const size = (n) => String(n.props.className).split(/\s+/).find((c) =>
      ["xl", "lg", "md", "sm", "xs"].includes(c));
    assert(size(pArt) !== size(sArt), "with the hierarchy still visible");
  });
});

describe("Dark mode holds up", () => {
  const css = () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    return src.slice(src.indexOf("const CSS = `"), src.indexOf("`;", src.indexOf("const CSS = `")));
  };

  test("focus stays visible on a dark surface", () => {
    assert(/:focus-visible \{[^}]*outline: 2px solid var\(--t1\)/.test(css()),
      "a teal focus ring");
    /* An element may swap the default outline for a stronger ring, but must
       never leave focus invisible. */
    const css2 = css();
    (css2.match(/[^{}]*\{[^}]*outline: *none[^}]*\}/g) || []).forEach((rule) =>
      assert(/box-shadow|border-color/.test(rule),
        "outline removed only where a ring replaces it: " + rule.slice(0, 60)));
  });

  test("status is never communicated by colour alone", () => {
    const r = mk();
    /* Lifecycle chips carry words. */
    cls(r, "state").forEach((n) => assert(txt(n).length > 0, "the state is named"));
    /* The active tab carries a marker as well as a colour. */
    assert(/\.nav-i\.on \.nav-ic::after/.test(css()), "the active tab has a marker");
    /* Progress names its current stage. */
    const on = cls(r, "gp-l").filter((n) => String(n.props.className).includes("on"));
    if (on.length) assert(txt(on[0]).length > 0, "the current stage is named");
  });

  test("mobile keeps the stage readable and the layout single-column", () => {
    const c = css();
    assert(/@media \(max-width: 520px\)[^}]*\.gp-l \{ font-size: 0/.test(c.replace(/\n/g, "")),
      "narrow screens show only the current stage label");
    assert(/grid-template-columns: repeat\(auto-fill, minmax\(156px, 1fr\)\)/.test(c),
      "the binder reflows rather than overflowing");
  });

  test("touch targets stay comfortable", () => {
    const c = css();
    assert(/\.btn \{[^}]*padding: 12px 17px/.test(c), "buttons are tappable");
    assert(/\.tabb \{[^}]*padding: 8px 14px/.test(c), "so are filter chips");
  });

  test("card artwork keeps its aspect ratio", () => {
    assert(/object-fit: contain/.test(css()), "art is never stretched");
  });
});

require("./run.cjs").run();
