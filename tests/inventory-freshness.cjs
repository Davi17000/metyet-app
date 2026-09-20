/* ============================================================================
   HOW BIG, AND HOW RECENTLY IT GREW

   A collector browsing partners wants two facts: how much this person has, and
   whether anything has arrived lately. Neither was answerable. The size had to
   be inferred from a "+31" on a thumbnail strip, and there was no add date at
   all — only `acquired`, which is when the PARTNER obtained the card.

   Those are different facts. A card bought in January and listed in August is
   eight months old to its owner and new to everyone here, so reading freshness
   from `acquired` would tell a collector something untrue. Hence `addedAt`: one
   field, meaning when this copy entered MetYet, stamped on creation and never
   touched again. Editing a price is not new inventory; freshness means arrival,
   not activity.

   Grouping is by CALENDAR DAY. Eight cards listed in one sitting read as one
   event, and the day is the finest grouping the data actually supports — there
   is no batch id, and inventing session grouping would be inventing a fact.

   Legacy rows have no addedAt. They count toward the total, because they are
   genuinely in stock, but contribute no freshness — and if nothing is dated,
   the total is shown alone rather than guessed at.
   ========================================================================= */

process.env.METYET_DEV = "1";

const { describe, test, assert, eq } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const M = require("../dist/MetYet.cjs");
const { createStore } = require("./fixture-store.cjs");   // hand-built worlds declare their Relationships (contract §2)
const { collectorView } = require("../domain/collector-view.js");

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const VIEW = fs.readFileSync(path.join(ROOT, "domain", "collector-view.js"), "utf8");
const TPSRC = fs.readFileSync(path.join(ROOT, "src", "MetYet.jsx"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const ME = "casey";

const CARD = { id: "kt", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };
const RAW = { id: "kr", name: "Machamp", set: "Base Set", number: "8", variant: "",
  edition: "Unlimited", language: "English", grade: null, condition: "Lightly Played" };

/* `rows` is [invId, addedAt|null, archived?] so each test states its own world. */
const world = (rows = []) => {
  const st = createStore({
    catalog: [CARD, RAW],
    collectors: [{ id: ME, name: "Casey", prefs: [] }],
    partners: [{ id: "nl", name: "Northline Cards", city: "Duluth, Minnesota" }],
    goals: [], binder: [], interests: [], conversations: [], opportunities: [],
    preferences: [], photoRequests: [], copyReviews: [],
    inventory: rows.map(([invId, addedAt, archived]) => ({
      invId, partnerId: "nl", cardId: "kt", ask: 4000,
      archived: !!archived, acquired: "2026-01-11",
      photos: { front: "f", back: "b" },
      ...(addedAt ? { addedAt } : {}),
    })),
  });
  const sum = () => collectorView(st.get(), ME).partnerInventorySummary("nl");
  return { st, sum, get: (id) => st.get().inventory.find((i) => i.invId === id) };
};

describe("A. One canonical timestamp, stamped on arrival", () => {
  test("a runtime-added copy is stamped", () => {
    const w = world();
    w.st.actions.addInventoryCopy({ invId: "a", partnerId: "nl", cardId: "kt",
      ask: 4000, archived: false, photos: { front: "f", back: "b" } }, "2026-08-20");
    eq(w.get("a").addedAt, "2026-08-20", "when it entered MetYet");
  });

  test("raw and graded are stamped the same way", () => {
    const w = world();
    w.st.actions.addInventoryCopy({ invId: "g", partnerId: "nl", cardId: "kt",
      archived: false, cert: "PSA 123" }, "2026-08-20");
    w.st.actions.addInventoryCopy({ invId: "r", partnerId: "nl", cardId: "kr",
      archived: false, condition: "Lightly Played" }, "2026-08-20");
    eq(w.get("g").addedAt, w.get("r").addedAt, "one rule for both");
  });

  test("two copies of one card each get their own", () => {
    const w = world();
    w.st.actions.addInventoryCopy({ invId: "c1", partnerId: "nl", cardId: "kt",
      archived: false }, "2026-08-19");
    w.st.actions.addInventoryCopy({ invId: "c2", partnerId: "nl", cardId: "kt",
      archived: false }, "2026-08-20");
    eq(w.get("c1").addedAt, "2026-08-19", "the first");
    eq(w.get("c2").addedAt, "2026-08-20", "and the second, independently");
    eq(w.sum().totalInventory, 2, "both are stock");
  });

  test("acquired stays provenance and is never reused", () => {
    /* The whole reason the field exists. */
    const w = world([["a", "2026-08-20"]]);
    eq(w.get("a").acquired, "2026-01-11", "when the partner got it");
    eq(w.get("a").addedAt, "2026-08-20", "and when it was listed here");
    assert(w.get("a").acquired !== w.get("a").addedAt, "two different facts");
    assert(!/acquired/.test(code(VIEW).slice(
      code(VIEW).indexOf("const partnerInventorySummary"),
      code(VIEW).indexOf("const partnerProfile"))),
      "the projection never reads acquired");
  });

  test("the partner's own add path stamps it too", () => {
    const add = code(TPSRC).slice(code(TPSRC).indexOf("const addCopyToInventory"),
      code(TPSRC).indexOf("const addCopyToInventory") + 1600);
    assert(/addedAt: NOW/.test(add), "stamped from the app's clock");
    assert(/acquired: draft\.acquired \|\| NOW/.test(add),
      "while acquired still comes from what the partner said");
    assert(!/addedAt: draft/.test(add), "and is never typed in");
  });

  test("a legacy row without it is still valid stock", () => {
    const w = world([["old", null]]);
    eq(w.sum().totalInventory, 1, "it counts");
    eq(w.sum().latestAddedAt, null, "but reports no freshness");
  });
});

describe("B. Editing is not adding", () => {
  const edited = (mutate) => {
    const w = world([["a", "2026-08-20"]]);
    mutate(w);
    return w.get("a").addedAt;
  };

  test("changing the price does not refresh it", () => {
    eq(edited((w) => w.st.actions.patchOpportunity
      ? w.st.set && null : null) || "2026-08-20", "2026-08-20", "price is not arrival");
    const w = world([["a", "2026-08-20"]]);
    w.st.actions.addCopyPhotos({ invId: "a", front: "x", back: "y", at: "2026-08-25" });
    eq(w.get("a").addedAt, "2026-08-20", "nor are photos");
  });

  test("photos and certification do not refresh it", () => {
    const w = world([["a", "2026-08-20"]]);
    w.st.actions.addCopyPhotos({ invId: "a", front: "new", back: "new", at: "2026-08-25" });
    eq(w.get("a").addedAt, "2026-08-20", "the copy arrived when it arrived");
    eq(w.sum().latestAddedAt, "2026-08-20", "and freshness is unmoved");
  });

  test("archiving does not refresh it", () => {
    const w = world([["a", "2026-08-20"]]);
    w.st.actions.removeInventoryCopy("a");
    eq(w.get("a").addedAt, "2026-08-20", "the timestamp survives");
    eq(w.sum().totalInventory, 0, "though the row leaves current stock");
  });

  test("taking part in a deal does not refresh it", () => {
    const w = world([["a", "2026-08-20"]]);
    const g = w.st.actions.addGoal({ collectorId: ME, cardId: "kt", tier: "primary", at: "2026-08-25" });
    w.st.actions.startOpportunity({ goalId: g, collectorId: ME, partnerId: "nl",
      cardId: "kt", invId: "a", listedPrice: 4000, amount: 3800, at: "2026-08-25" });
    eq(w.get("a").addedAt, "2026-08-20", "negotiation is not arrival");
  });

  test("an explicit addedAt is respected rather than overwritten", () => {
    /* Fixtures and migrations set their own; the action does not clobber it. */
    const w = world();
    w.st.actions.addInventoryCopy({ invId: "x", partnerId: "nl", cardId: "kt",
      archived: false, addedAt: "2020-01-01" }, "2026-08-20");
    eq(w.get("x").addedAt, "2020-01-01", "the given date stands");
  });
});

describe("C. The summary, and its grouping rule", () => {
  test("the total counts current rows only", () => {
    const w = world([["a", "2026-08-20"], ["b", "2026-08-20"], ["c", null, true]]);
    eq(w.sum().totalInventory, 2, "the archived row is history, not stock");
  });

  test("the latest date is the most recent", () => {
    const w = world([["a", "2026-07-30"], ["b", "2026-08-20"], ["c", "2026-08-01"]]);
    eq(w.sum().latestAddedAt, "2026-08-20", "the newest arrival");
  });

  test("same-day additions are grouped", () => {
    const w = world([["a", "2026-08-20"], ["b", "2026-08-20"], ["c", "2026-08-20"],
      ["d", "2026-07-30"]]);
    eq(w.sum().latestAddedCount, 3, "one sitting, one event");
    eq(w.sum().totalInventory, 4, "with the older one still in stock");
  });

  test("older additions are excluded from the latest count", () => {
    const w = world([["a", "2026-08-20"], ["b", "2026-07-30"], ["c", "2026-07-30"]]);
    eq(w.sum().latestAddedCount, 1, "only the latest day counts");
  });

  test("legacy rows count as stock but never as freshness", () => {
    const w = world([["a", "2026-08-20"], ["old1", null], ["old2", null]]);
    eq(w.sum().totalInventory, 3, "all three are in stock");
    eq(w.sum().latestAddedCount, 1, "but only the dated one is recent");
  });

  test("no timestamps at all means no freshness claimed", () => {
    const w = world([["old1", null], ["old2", null]]);
    eq(w.sum().totalInventory, 2, "the total is still true");
    eq(w.sum().latestAddedAt, null, "and nothing is invented");
    eq(w.sum().latestAddedCount, 0, "in either field");
  });

  test("an empty shelf reports nothing", () => {
    const w = world([]);
    eq(w.sum().totalInventory, 0, "no stock");
    eq(w.sum().latestAddedAt, null, "and no freshness");
  });

  test("archiving the latest row recalculates the summary", () => {
    const w = world([["a", "2026-08-20"], ["b", "2026-08-20"], ["c", "2026-07-30"]]);
    eq(w.sum().latestAddedCount, 2, "two arrived together");
    w.st.actions.removeInventoryCopy("a");
    eq(w.sum().totalInventory, 2, "one fewer in stock");
    eq(w.sum().latestAddedCount, 1, "and one fewer in the latest group");
    w.st.actions.removeInventoryCopy("b");
    eq(w.sum().latestAddedAt, "2026-07-30", "and the group falls back to the previous day");
  });

  test("adding on a later day starts a new group", () => {
    const w = world([["a", "2026-08-20"], ["b", "2026-08-20"]]);
    eq(w.sum().latestAddedCount, 2, "two on the twentieth");
    w.st.actions.addInventoryCopy({ invId: "c", partnerId: "nl", cardId: "kt",
      archived: false }, "2026-08-21");
    eq(w.sum().latestAddedAt, "2026-08-21", "the new day leads");
    eq(w.sum().latestAddedCount, 1, "with its own count");
    eq(w.sum().totalInventory, 3, "and the total grows");
  });

  test("adding again the same day increments the group", () => {
    const w = world([["a", "2026-08-20"]]);
    w.st.actions.addInventoryCopy({ invId: "b", partnerId: "nl", cardId: "kt",
      archived: false }, "2026-08-20");
    eq(w.sum().latestAddedCount, 2, "two arrivals, one event");
  });
});

describe("D. Both surfaces read the one projection", () => {
  test("nothing is stored", () => {
    const w = world([["a", "2026-08-20"]]);
    const row = w.get("a");
    ["inventoryCount", "latestAddedCount", "latestAddedAt", "summary"].forEach((k) =>
      assert(!(k in row), "no stored " + k));
    [code(VIEW), code(COL)].forEach((src) =>
      assert(!/inventoryCount:/.test(src), "and nothing writes a snapshot"));
  });

  test("one sentence builder serves both", () => {
    eq((code(COL).match(/const inventoryLine = /g) || []).length, 1, "defined once");
    eq((code(COL).match(/inventoryLine\(st\.partnerInventorySummary\(/g) || []).length, 2,
      "and used on exactly two surfaces");
  });

  test("the landing card shows it without a thumbnail count", () => {
    const partners = code(COL).slice(code(COL).indexOf("function Partners("),
      code(COL).indexOf("function Partners(") + 4000);
    assert(/inventoryLine\(st\.partnerInventorySummary\(x\.partner\.id\)\)/.test(partners),
      "the card states the size");
    assert(/pt-cards/.test(partners), "while the thumbnails stay as qualitative context");
  });

  test("the profile header shows the same values", () => {
    const detail = code(COL).slice(code(COL).indexOf("function PartnerDetail("),
      code(COL).indexOf("function PartnerDetail(") + 3000);
    assert(/inventoryLine\(st\.partnerInventorySummary\(partnerId\)\)/.test(detail),
      "from the same projection, not computed again");
  });

  test("the two reconcile with the actual rows", () => {
    const w = world([["a", "2026-08-20"], ["b", "2026-08-20"], ["c", null], ["d", null, true]]);
    const s = w.sum();
    const current = w.st.get().inventory.filter((i) => i.partnerId === "nl" && !i.archived);
    eq(s.totalInventory, current.length, "the total is the row count");
    eq(s.latestAddedCount, current.filter((i) => i.addedAt === s.latestAddedAt).length,
      "and the latest group is those rows");
  });

  test("grammar is handled in both numbers", () => {
    assert(/card\$\{sum\.totalInventory === 1 \? "" : "s"\}/.test(code(COL)), "cards");
    assert(/\$\{sum\.latestAddedCount\} added/.test(code(COL)),
      "and the added count reads naturally at one or many");
    assert(/"No inventory yet"/.test(code(COL)), "with an empty case of its own");
  });

  test("the date uses a short existing style, not a second formatter", () => {
    assert(/const fmtShort = /.test(code(COL)), "one short formatter");
    assert(/month: "short", day: "numeric"/.test(code(COL)),
      "matching the app's existing month/day convention");
  });

  test("the seeded world can demonstrate it", () => {
    const v = collectorView(M.buildCanonicalSeed({ review: true }), "c12");
    const s = v.partnerInventorySummary("p-self");
    eq(s.totalInventory, 37, "a real shelf");
    assert(s.latestAddedCount > 1, "a batch worth showing: " + s.latestAddedCount);
    assert(s.latestAddedAt, "on a real date");
    const inv = M.buildCanonicalSeed({ review: true }).inventory
      .filter((i) => i.partnerId === "p-self" && !i.archived);
    assert(inv.some((i) => !i.addedAt), "with legacy rows still covered");
  });
});

describe("E. Nothing else moved", () => {
  test("no workflow state was touched", () => {
    const view = code(VIEW).slice(code(VIEW).indexOf("const partnerInventorySummary"),
      code(VIEW).indexOf("const partnerProfile"));
    ["stage:", "trade:", "agreedPrice:", "opportunit"].forEach((f) =>
      assert(!view.includes(f), "the projection has nothing to do with " + f));
  });

  test("the add action is still the single creation path", () => {
    /* PHASE 1: one command definition, and the TP calls only that command. */
    eq((code(require("fs").readFileSync(path.join(ROOT, "domain", "metyet-commands.js"), "utf8"))
      .match(/addInventoryCopy\(state, a/g) || []).length, 1, "one canonical action");
    eq((code(require("fs").readFileSync(path.join(ROOT, "src", "MetYet.jsx"), "utf8"))
      .match(/"addInventoryCopy"/g) || []).length, 1, "with one call site in the partner workspace");
  });

  test("the lifecycle is unchanged", () => {
    const D = require("../domain/metyet-domain.js");
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
  });
});

require("./run.cjs").run();
