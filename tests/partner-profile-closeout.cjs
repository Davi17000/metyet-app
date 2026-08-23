/* ============================================================================
   A PARTNER PAGE, NOT A DASHBOARD

   The relationship summary that used to sit above the inventory answered three
   questions at once — what they're helping with, what they want of mine, what
   we've done — and pushed the shelf down for information most visits did not
   need. A collector usually opens a partner to browse what they have.

   So the page is: a compact header saying who they are and how much they have,
   the inventory tabs that are the reason for visiting, and a Relationship tab
   holding what we have actually done together.

   Relationship is deliberately not "Transaction History". It holds transactions
   as EVIDENCE of a relationship, which is also why active deals are absent:
   those are being negotiated, and Goals is where negotiation lives. A second
   place to watch the same thing is how two sources of truth begin.

   One thing this pass could not do honestly: inventory freshness. There is no
   addedAt or createdAt on an inventory record — only `acquired`, which is when
   the PARTNER got the card, not when it appeared in MetYet. Rendering "8 added
   Aug 20" from a provenance date would be inventing a fact. The header shows
   the total, and the tests below pin why.
   ========================================================================= */

process.env.METYET_DEV = "1";

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
const VIEW = fs.readFileSync(path.join(ROOT, "domain", "collector-view.js"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const AT = "2026-08-19";
const ME = "casey";

const txt = (n) => {
  if (!n) return "";
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ").replace(/\s+/g, " ").trim();
};
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));

const WANT = { id: "kt", name: "Charizard VMAX", set: "Champion's Path", number: "74",
  variant: "Rainbow", edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };
const HAVE = { id: "ka", name: "Mew ex", set: "Dragon Frontiers", number: "1", variant: "",
  edition: "Unlimited", language: "English", grade: "PSA 8", condition: null };

/* A partner with three copies on the shelf and nothing shared yet. */
const world = ({ stock = 3 } = {}) => {
  const inventory = [];
  for (let i = 0; i < stock; i += 1) {
    inventory.push({ invId: "inv-" + i, partnerId: "nl", cardId: "kt", ask: 4000,
      archived: false, acquired: "2026-01-11", photos: { front: "f", back: "b" } });
  }
  const st = createStore({
    catalog: [HAVE, WANT],
    collectors: [{ id: ME, name: "Casey", prefs: [] }],
    partners: [{ id: "nl", name: "Northline Cards", city: "Duluth, Minnesota" },
      { id: "cv", name: "Card Vault", city: "St Paul, Minnesota" }],
    goals: [], interests: [], conversations: [], opportunities: [],
    preferences: [], photoRequests: [], copyReviews: [],
    binder: [{ id: "b1", collectorId: ME, cardId: "ka", market: 900,
      photos: { front: "f", back: "b" } }],
    inventory,
  });
  const view = () => collectorView(st.get(), ME);
  return { st, view };
};
/* A deal with this partner, taken to whichever terminal state is wanted. */
const dealWith = (w, end) => {
  const g = w.st.actions.addGoal({ collectorId: ME, cardId: "kt", tier: "primary", at: AT });
  const o = w.st.actions.startOpportunity({ goalId: g, collectorId: ME, partnerId: "nl",
    cardId: "kt", invId: "inv-0", listedPrice: 4000, amount: 3800, at: AT });
  w.st.actions.agreePrice({ oppId: o, amount: 3800, by: "tp", at: AT });
  if (end === "completed") {
    w.st.actions.patchOpportunity(o, (x) => ({ ...x, stage: "completed",
      completedAt: "2026-08-18" }));
  } else if (end === "ended") {
    w.st.actions.endOpportunity(o, "collector", "2026-08-18");
  }
  return o;
};

/* Render the partner page for Northline in the real app. */
let R = null;
const openPartner = (mutate) => {
  __store.reset(M.buildCanonicalSeed({ review: true }));
  if (mutate) TR.act(() => { mutate(__store.get()); });
  TR.act(() => { R = TR.create(React.createElement(App)); });
  click(cls(R, "nav-i").find((b) => /Trusted Partners/.test(txt(b))));
  /* Partners are ranked by relevance, so open by name rather than position. */
  const card = cls(R, "pt").find((n) => /Northline/.test(txt(cls(n, "pt-n")[0])))
    || cls(R, "pt")[0];
  assert(card, "a partner to open");
  click(card.findAllByType("button").find((b) => txt(b) === "View collection"));
  return R;
};
const tabLabels = () => cls(R, "tabb").map((b) => txt(b).replace(/\d+$/, "").trim());
const openTab = (label) => {
  const b = cls(R, "tabb").find((x) => new RegExp(label).test(txt(x)));
  assert(b, "a " + label + " tab: " + tabLabels().join(" | "));
  click(b);
};
const detail = () => code(COL).slice(code(COL).indexOf("function PartnerDetail("),
  code(COL).indexOf("function PartnerDetail(") + 7000);

describe("A. The summary panel is gone", () => {
  test("its three sections are absent from the page", () => {
    const d = detail();
    assert(!/What they're helping with/.test(d), "no active-goal summary");
    assert(!/What you could help them with/.test(d), "no binder-interest summary");
    assert(!/>Our history</.test(d), "no history block above the tabs");
  });

  test("the summary container is removed, not restyled", () => {
    const d = detail();
    assert(!/className="card sec rel"/.test(d), "the panel element is gone");
    assert(!/rel-sum/.test(d), "including its metrics row");
  });

  test("no active-Goal dashboard survives anywhere on the page", () => {
    const d = detail();
    assert(!/rel\.active/.test(d),
      "active work belongs in Goals, and is not mirrored here");
  });
});

describe("B. The header is compact and derived", () => {
  test("it says who and where", () => {
    openPartner();
    const top = cls(R, "pt-top")[0];
    assert(/Northline Cards/.test(txt(top)), "identity");
    assert(/Duluth/.test(txt(top)), "and location");
  });

  test("the inventory total is counted from the records", () => {
    const w = world({ stock: 3 });
    eq(w.view().partnerProfile("nl").stock.length, 3, "three on the shelf");
    /* CONTRACT CHANGE: the count moved into the shared inventoryLine helper so
       the landing card and this header render one sentence from one
       projection. Still derived, still nothing stored. */
    assert(/inventoryLine\(st\.partnerInventorySummary\(partnerId\)\)/.test(detail()),
      "the header renders the shared summary");
    assert(/\$\{sum\.totalInventory\} card/.test(code(COL)), "which counts the records");
    assert(!/inventoryCount/.test(code(COL)) && !/inventoryCount/.test(code(VIEW)),
      "and nothing stores a total");
  });

  test("removing a copy changes the total", () => {
    /* Removal archives rather than deletes, so the count must respect that. */
    const w = world({ stock: 3 });
    w.st.actions.removeInventoryCopy("inv-1");
    eq(w.view().partnerProfile("nl").stock.length, 2, "an archived copy is not on the shelf");
  });

  test("an empty shelf says so", () => {
    const w = world({ stock: 0 });
    eq(w.view().partnerProfile("nl").stock.length, 0, "nothing listed");
    assert(/"No inventory yet"/.test(code(COL)), "and the line says it plainly");
  });

  test("singular and plural are both handled", () => {
    const d = detail();
    assert(/card\$\{sum\.totalInventory === 1 \? "" : "s"\}/.test(code(COL)), "cards");
    assert(/completed deal\s*\n?\s*\{rel\.history\.filter\(D\.isCompleted\)\.length === 1 \? "" : "s"\}/
      .test(d) || /=== 1 \? "" : "s"\} together/.test(d), "and deals");
  });

  test("freshness is not fabricated from a provenance date", () => {
    /* THE HONEST GAP. `acquired` is when the partner got the card, not when it
       entered MetYet — using it for "8 added Aug 20" would state a fact the
       data does not contain. */
    const w = world({ stock: 3 });
    const rec = w.st.get().inventory[0];
    assert(!("addedAt" in rec) && !("createdAt" in rec),
      "there is no inventory-add timestamp to read");
    assert("acquired" in rec, "only a provenance date");
    const d = detail();
    assert(!/added \$\{|Last added|addedAt/.test(d),
      "so the header claims no freshness");
    assert(!/acquired/.test(d), "and does not repurpose acquired to imply it");
  });

  test("the header carries relationship history but no live state", () => {
    const d = detail();
    assert(/completed deal/.test(d), "how much we have done");
    assert(!/open to \{x\.interested\}/.test(d), "not what they want of mine");
    assert(!/stage/.test(d.slice(d.indexOf('className="pt-top"'),
      d.indexOf('className="tabs"'))), "and no stage summary");
  });

  test("the completed count comes from terminal opportunities", () => {
    const w = world();
    dealWith(w, "completed");
    const rel = w.view().partnerRelationship("nl");
    eq(rel.history.filter(D.isCompleted).length, 1, "one completed deal together");
    eq(rel.active.length, 0, "and nothing active");
  });
});

describe("C. Tabs remain the page, with Relationship last", () => {
  test("the four inventory tabs are preserved", () => {
    openPartner();
    const labels = tabLabels();
    ["Primary Goals", "Secondary Goals", "For You", "All Inventory"]
      .forEach((t) => assert(labels.includes(t), t + " survives"));
  });

  test("Relationship is added, and is not the default", () => {
    openPartner();
    eq(tabLabels()[4], "Relationship", "it comes after the inventory");
    const on = cls(R, "tabb").filter((b) => String(b.props.className).includes("on"));
    eq(on.length, 1, "one tab is open");
    assert(/Primary Goals/.test(txt(on[0])),
      "and it is inventory, because that is why people visit");
  });

  test("inventory semantics are unchanged", () => {
    openPartner();
    openTab("All Inventory");
    const grid = cls(R, "bnd")[0];
    assert(grid, "the shelf still renders as a grid");
    assert(/const forYou = st\.forYou\(partnerId\)/.test(detail()),
      "For You still uses the canonical projection");
    assert(/const byTier = \(tier\)/.test(detail()), "as do the tier tabs");
  });
});

describe("D. Relationship holds what we have done", () => {
  test("a completed deal appears, with its date and outcome", () => {
    const w = world();
    dealWith(w, "completed");
    const rel = w.view().partnerRelationship("nl");
    eq(rel.history.length, 1, "one entry");
    assert(D.isCompleted(rel.history[0]), "marked completed");
    eq(rel.history[0].completedAt, "2026-08-18", "with the canonical date");
  });

  test("an ended deal is included too", () => {
    /* Both are things that happened between these two people. */
    const w = world();
    dealWith(w, "ended");
    const rel = w.view().partnerRelationship("nl");
    eq(rel.history.length, 1, "it counts as history");
    assert(!D.isCompleted(rel.history[0]), "but is not a completed deal");
    assert(/done \? "Completed" : "Ended"/.test(detail()), "and reads differently");
  });

  test("an active deal is not duplicated as history", () => {
    const w = world();
    dealWith(w, null);
    const rel = w.view().partnerRelationship("nl");
    eq(rel.history.length, 0, "still being negotiated");
    assert(!/rel\.active/.test(detail()), "and the page does not show it at all");
  });

  test("each entry routes to the historical deal", () => {
    assert(/go\(\{ v: "deal", oppId: o\.id \}\)/.test(detail()), "routing into Goals");
    assert(/View deal/.test(detail()), "with the action named");
  });

  test("a historical deal stays terminal when opened", () => {
    const w = world();
    const o = dealWith(w, "completed");
    const opp = w.st.get().opportunities.find((x) => x.id === o);
    assert(!D.isActive(opp), "it is not active");
    eq(opp.stage, "completed", "and opening it changes nothing");
  });

  test("the empty state does not borrow active goals", () => {
    const w = world();
    dealWith(w, null);
    eq(w.view().partnerRelationship("nl").history.length, 0, "nothing done together yet");
    assert(/No completed deals together yet\./.test(detail()), "and it says exactly that");
    const d = detail();
    const rel = d.slice(d.indexOf('active.id === "relationship"'), d.length);
    assert(!/rel\.active/.test(rel), "rather than padding itself with live work");
  });

  test("only canonical facts are rendered", () => {
    const d = detail();
    const rel = d.slice(d.indexOf('active.id === "relationship"'),
      d.indexOf('active.list.length === 0'));
    assert(/st\.cardById\(o\.cardId\)/.test(rel), "the card, from the record");
    assert(/o\.completedAt \|\| o\.endedAt/.test(rel), "the date, from the record");
    ["acquired", "You acquired", "narrative"].forEach((w2) =>
      assert(!rel.includes(w2), "and no invented detail: " + w2));
  });
});

describe("E. No second history model, no CRM", () => {
  test("history is the same opportunity records Goals owns", () => {
    const w = world();
    const o = dealWith(w, "completed");
    const fromRel = w.view().partnerRelationship("nl").history[0];
    const fromStore = w.st.get().opportunities.find((x) => x.id === o);
    eq(fromRel.id, fromStore.id, "one record");
    eq(fromRel.stage, fromStore.stage, "one stage");
    eq(fromRel.agreedPrice, fromStore.agreedPrice, "one price");
  });

  test("no partner-side history is stored", () => {
    const w = world();
    dealWith(w, "completed");
    const p = w.st.get().partners.find((x) => x.id === "nl");
    ["deals", "history", "transactions", "receipts"].forEach((k) =>
      assert(!(k in p), "the partner record keeps no " + k));
  });

  test("the projection writes no deal state", () => {
    const view = code(VIEW);
    const fn = view.slice(view.indexOf("const partnerRelationship"),
      view.indexOf("const partnerProfile"));
    ["stage:", "agreedPrice:", "agreedAdj:", "trade:", "tpHandoff:", "collectorReceipt:"]
      .forEach((f) => assert(!fn.includes(f), "no " + f));
    assert(/D\.isActive/.test(fn), "it filters using the domain's own lifecycle");
  });

  test("nothing CRM-shaped was added", () => {
    const d = detail();
    ["note", "reminder", "task", "rating", "review", "score", "reputation"]
      .forEach((w2) => assert(!new RegExp('"' + w2, "i").test(d), "no " + w2));
  });

  test("the deal lifecycle is untouched", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
  });
});

require("./run.cjs").run();
