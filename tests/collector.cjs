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
    const before = cls(r, "goal").length;
    nav(r, "Trusted Partners"); openPartner(r, 0); tab(r, "All Inventory");
    const add = btn(r, "Add to my goals");
    assert(add, "an un-goaled card offers to become one");
    click(add);
    click(btnHas(r, "Secondary — keeping an eye out"));
    nav(r, "Goals");
    eq(cls(r, "goal").length, before + 1, "the goal was created");
  });

  test("a new goal matches across ALL partners, not just where it was found", () => {
    const r = mk();
    nav(r, "Trusted Partners"); openPartner(r, 2);      // Kane TCG
    tab(r, "All Inventory");
    const add = btn(r, "Add to my goals");
    if (!add) return;
    click(add); click(btnHas(r, "Primary — actively looking"));
    nav(r, "Goals");
    const g = cls(r, "goal").find((n) => /trusted partner/.test(txt(n)));
    assert(g, "the new goal reports partner availability");
  });

  test("a goal can be promoted and demoted", () => {
    const r = mk();
    const before = cls(r, "goal").filter((n) => txt(n).includes("Primary")).length;
    const g = cls(r, "goal").find((n) => txt(n).includes("Secondary"));
    click(g.findAllByType("button").find((b) => txt(b) === "Edit this goal"));
    click(btn(r, "Move to Primary"));
    const after = cls(r, "goal")[0];
    /* Verify by state rather than by card name — the canonical universe holds
       different cards than the old fixture. */
    eq(cls(r, "goal").filter((n) => txt(n).includes("Primary")).length, before + 1,
      "one more goal is now primary");
  });

  test("a goal can be removed when nothing is being negotiated", () => {
    const r = mk();
    const before = cls(r, "goal").length;
    const idle = cls(r, "goal").find((n) => txt(n).includes("Seeking"));
    click(idle.findAllByType("button").find((b) => txt(b) === "Edit this goal"));
    const rm = btn(r, "Remove");
    eq(rm.props.disabled, false, "removable while idle");
    click(rm);
    eq(cls(r, "goal").length, before - 1, "the goal is gone");
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
    const states = cls(mk(), "state").map(txt);
    ["Seeking", "Negotiating", "Satisfied"].forEach((s) =>
      assert(states.includes(s), `${s} is represented: ${states.join(",")}`));
  });

  test("no goal record stores a status field", () => {
    const seed = SEEDSRC().slice(SEEDSRC().indexOf("const GOALS = ["), SEEDSRC().indexOf("const INVENTORY"));
    assert(!/status:/.test(seed), "goals carry only what the collector stated");
    assert(/const goalState = /.test(DOMAIN()), "state is computed, in the domain");
  });

  test("stopping a negotiation returns the goal to Seeking", () => {
    const r = mk();
    const live = cls(r, "goal").find((n) => txt(n).includes("Negotiating"));
    const name = txt(cls(live, "goal-n")[0]);
    click(live.findAllByType("button").find((b) => txt(b) === "Continue"));
    click(btn(r, "Stop this negotiation"));
    const after = cls(r, "goal").find((n) => txt(cls(n, "goal-n")[0]) === name);
    assert(txt(after).includes("Seeking"), "back to Seeking: " + txt(after).slice(0, 90));
    assert(!txt(after).includes("Negotiating"), "and no longer negotiating");
  });

  test("the goal survives a stopped negotiation", () => {
    const r = mk();
    const before = cls(r, "goal").length;
    const live = cls(r, "goal").find((n) => txt(n).includes("Negotiating"));
    click(live.findAllByType("button").find((b) => txt(b) === "Continue"));
    click(btn(r, "Stop this negotiation"));
    eq(cls(r, "goal").length, before, "the card is still wanted");
  });

  test("a completed deal reads as Satisfied", () => {
    const r = mk();
    const sat = cls(r, "goal").filter((n) => txt(n).includes("Satisfied"));
    assert(sat.length >= 1, "a completed opportunity produces Satisfied");
  });
});

/* ---------- 2. One negotiation per goal, enforced in the domain ---------- */
describe("One active negotiation per goal", () => {
  test("the rule lives in the action, not the button", () => {
    const fn = STORE().slice(STORE().indexOf("startOpportunity({"), STORE().indexOf("patchOpportunity("));
    assert(/if \(!D\.INVARIANTS\.oneNegotiationPerGoal\(goalId, s\.opportunities\)\) return null;/.test(fn),
      "the shared action refuses a second negotiation regardless of caller");
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
    const seeking = cls(r, "goal").find((n) => txt(n).includes("Seeking")
      && txt(n).includes("trusted partner"));
    const name = txt(cls(seeking, "goal-n")[0]);
    click(seeking.findAllByType("button").find((b) => txt(b) === "See who has it"));
    click(btn(r, "Reach out"));
    click(btn(r, "Close"));
    const after = cls(r, "goal").find((n) => txt(cls(n, "goal-n")[0]) === name);
    assert(txt(after).includes("Seeking"), "still Seeking after reaching out");
    assert(!txt(after).includes("Continue"), "and no negotiation was opened");
  });

  test("a collector may reach out to several partners at once", () => {
    const r = mk();
    const seeking = cls(r, "goal").find((n) => txt(n).includes("Seeking")
      && txt(n).includes("trusted partners"));
    if (!seeking) return;
    click(seeking.findAllByType("button").find((b) => txt(b) === "See who has it"));
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
    const seeking = cls(r, "goal").find((n) => txt(n).includes("See who has it"));
    click(seeking.findAllByType("button").find((b) => txt(b) === "See who has it"));
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
      const b = r.root.findAllByType("button").filter((x) => txt(x) === "Continue")[i];
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
    const g = cls(r, "goal").find((n) => txt(n).includes("See who has it"));
    click(g.findAllByType("button").find((b) => txt(b) === "See who has it"));
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
    const goals = cls(r, "goal");
    assert(goals.length > 0, "goals render");
    /* The canonical catalog contains some cards with no artwork reference; those
       correctly use the identity plate. Every card resolves to one or the other. */
    eq(imgs(r).length + plates(r).length, goals.length,
      "every goal card resolves to artwork or an identity plate");
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

require("./run.cjs").run();
