/* ============================================================================
   CORRECTING A COPY, AND KNOWING WHO YOU'RE DEALING WITH

   EDIT IS NOT REPLACE. A binder copy carries partner interest, trade rows in
   live deals, and history that names it. Delete-and-recreate dressed up as an
   edit would sever every one of those, so editing keeps the copy's id and
   changes only the fields that belong to it.

   Which fields those are came out of the audit rather than the brief. Condition
   and grade live on the CARD, not the copy — "changing the grade" would mean
   pointing this copy at a different card, which is a different object and one a
   live deal may already be about. So identity is immutable here.

   Certification is economic: a partner valuing a graded copy is valuing THAT
   certification. It is read-only while the copy sits in a live trade, enforced
   in the action rather than by a disabled input, so no caller routes around it.
   Photos and the collector's private value stay editable throughout — better
   pictures and a corrected private note cannot misrepresent what is on offer.

   And the partner profile is the partner's. One record, written by them, read
   by everyone, with every field optional: a shop that has filled nothing in
   still reads as a real relationship rather than a broken one.
   ========================================================================= */

process.env.METYET_DEV = "1";

const { describe, test, assert, eq } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const D = require("../domain/metyet-domain.js");
const M = require("../dist/MetYet.cjs");
const { createStore } = require("./fixture-store.cjs");   // hand-built worlds declare their Relationships (contract §2)
const { collectorView } = require("../domain/collector-view.js");

const ROOT = path.join(__dirname, "..");
const COL = fs.readFileSync(path.join(ROOT, "collector", "MetYetCollector.jsx"), "utf8");
const TPSRC = fs.readFileSync(path.join(ROOT, "src", "MetYet.jsx"), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const AT = "2026-08-20";
const ME = "casey";

const WANT = { id: "kt", name: "Charizard", set: "Base Set", number: "4", variant: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };
const HAVE = { id: "ka", name: "Mew ex", set: "Dragon Frontiers", number: "1", variant: "",
  edition: "Unlimited", language: "English", grade: "PSA 8", condition: null };

const world = () => {
  const st = createStore({
    catalog: [HAVE, WANT],
    collectors: [{ id: ME, name: "Casey", prefs: [] }],
    partners: [{ id: "nl", name: "Northline Cards", city: "Duluth, Minnesota" }],
    goals: [], interests: [], conversations: [], opportunities: [],
    preferences: [], photoRequests: [], copyReviews: [],
    binder: [
      { id: "b1", collectorId: ME, cardId: "ka", market: 900, cert: "PSA 111",
        photos: { front: "f1", back: "k1" }, addedAt: "2026-01-02" },
      { id: "b2", collectorId: ME, cardId: "ka", market: 900, cert: "PSA 222",
        photos: { front: "f2", back: "k2" }, addedAt: "2026-01-02" },
    ],
    inventory: [{ invId: "inv-1", partnerId: "nl", cardId: "kt", ask: 4000,
      archived: false, photos: { front: "f", back: "b" } }],
  });
  const copy = (id) => st.get().binder.find((b) => b.id === id);
  const view = () => collectorView(st.get(), ME);
  return { st, copy, view };
};
/* Put b1 into a live trade, accepted by the partner. */
const committed = (w) => {
  const g = w.st.actions.addGoal({ collectorId: ME, cardId: "kt", tier: "primary", at: AT });
  const o = w.st.actions.startOpportunity({ goalId: g, collectorId: ME, partnerId: "nl",
    cardId: "kt", invId: "inv-1", listedPrice: 4000, amount: 3800, at: AT });
  w.st.actions.agreePrice({ oppId: o, amount: 3800, by: "tp", at: AT });
  const row = M.emptyTradeCard("ka", null, null, "b1");
  w.st.actions.patchOpportunity(o, (x) => ({ ...x, stage: "select-trade",
    trade: { ...x.trade, submitted: true, cards: [row] } }));
  w.st.actions.reviewTradeCards({ oppId: o, decision: "accepted", at: AT });
  return { o, rowId: row.id };
};
const edit = (w, id, patch) => w.st.actions.updateBinderCopy({ binderId: id, patch, at: AT });

describe("A. Editing preserves the copy", () => {
  test("the id and card identity survive", () => {
    const w = world();
    edit(w, "b1", { market: 1200 });
    eq(w.copy("b1").id, "b1", "the same physical object");
    eq(w.copy("b1").cardId, "ka", "and the same card");
    eq(w.copy("b1").market, 1200, "with the edited value");
  });

  test("partner interest stays attached", () => {
    const w = world();
    w.st.actions.setInterest("nl", "b1", true, AT);
    edit(w, "b1", { market: 1200 });
    eq(w.view().interestIn("b1").length, 1, "the partner still wants this copy");
    eq(w.view().partnerRelationship("nl").interests.map((b) => b.id).join(","), "b1",
      "and the relationship page still shows it");
  });

  test("trade-row references survive", () => {
    const w = world();
    const { o, rowId } = committed(w);
    edit(w, "b1", { market: 1500 });
    const opp = w.st.get().opportunities.find((x) => x.id === o);
    const row = opp.trade.cards.find((c) => c.id === rowId);
    assert(row, "the trade row is still there");
    eq(row.binderId, "b1", "still pointing at this copy");
    eq(row.inclusion, "accepted", "and still accepted");
  });

  test("availability is unaffected", () => {
    const w = world();
    committed(w);
    eq(w.view().binderCopyState("b1").state, "in-deal", "before");
    edit(w, "b1", { market: 1500 });
    eq(w.view().binderCopyState("b1").state, "in-deal", "and after");
  });

  test("duplicates stay independent", () => {
    const w = world();
    edit(w, "b1", { market: 1500, cert: "PSA 999" });
    eq(w.copy("b2").market, 900, "the twin's value is untouched");
    eq(w.copy("b2").cert, "PSA 222", "as is its certification");
  });

  test("no copy is destroyed and recreated", () => {
    const w = world();
    edit(w, "b1", { market: 1500 });
    eq(w.st.get().binder.length, 2, "still two copies");
    /* PHASE 1: the edit is the updateBinderCopy command. */
    const src = code(fs.readFileSync(path.join(ROOT, "domain", "metyet-commands.js"), "utf8"));
    const fn = src.slice(src.indexOf("updateBinderCopy(state"), src.indexOf("removeBinderCopy(state"));
    assert(!/filter\(/.test(fn), "the action removes nothing");
    assert(/id: copy\.id, cardId: copy\.cardId/.test(fn), "and pins identity explicitly");
  });
});

describe("B. What may and may not change", () => {
  test("card identity is refused", () => {
    const w = world();
    eq(edit(w, "b1", { cardId: "kt" }).refused, D.REFUSE.identityImmutable,
      "a different card is a different object");
    eq(w.copy("b1").cardId, "ka", "and nothing moved");
  });

  test("the copy id and owner cannot be reassigned", () => {
    const w = world();
    eq(edit(w, "b1", { id: "b9" }).refused, D.REFUSE.identityImmutable, "not the id");
    eq(edit(w, "b1", { collectorId: "someone" }).refused, D.REFUSE.identityImmutable,
      "nor the owner");
  });

  test("certification is fixed while the copy is in a live trade", () => {
    /* A partner is valuing THAT certification. */
    const w = world();
    committed(w);
    eq(edit(w, "b1", { cert: "PSA 999" }).refused, D.REFUSE.copyCommitted,
      "refused by the action, not merely by a disabled input");
    eq(w.copy("b1").cert, "PSA 111", "unchanged");
  });

  test("it becomes editable again once the deal ends", () => {
    const w = world();
    const { o } = committed(w);
    w.st.actions.endOpportunity(o, "collector", AT);
    edit(w, "b1", { cert: "PSA 999" });
    eq(w.copy("b1").cert, "PSA 999", "the constraint follows the deal");
  });

  test("private value and photos stay editable throughout", () => {
    /* Neither can misrepresent what is being traded. */
    const w = world();
    committed(w);
    edit(w, "b1", { market: 2000, photos: { front: "new", back: "new" } });
    eq(w.copy("b1").market, 2000, "the private note is the collector's own");
    eq(w.copy("b1").photos.front, "new", "and better pictures are always welcome");
  });

  test("the photo invariant is reused, not weakened", () => {
    const w = world();
    eq(edit(w, "b1", { photos: { front: "f", back: null } }).refused,
      D.REFUSE.photosRequired, "both faces or the copy does not exist");
    eq(w.copy("b1").photos.back, "k1", "and the copy is untouched");
    assert(D.INVARIANTS.binderCopyPhotographed({ front: "a", back: "b" }),
      "the same invariant the add path uses");
  });

  test("an invalid private value is refused", () => {
    const w = world();
    eq(edit(w, "b1", { market: -5 }).refused, D.REFUSE.invalidAmount, "no negative value");
    eq(w.copy("b1").market, 900, "and nothing saved");
    edit(w, "b1", { market: null });
    eq(w.copy("b1").market, null, "though clearing it is allowed");
  });

  test("editing a copy that does not exist is refused", () => {
    const w = world();
    eq(edit(w, "nope", { market: 1 }).refused, D.REFUSE.copyUnavailable, "nothing to edit");
  });
});

describe("C. Editing touches no deal", () => {
  test("stage, price and trade terms are byte-identical", () => {
    const w = world();
    const { o } = committed(w);
    const before = JSON.stringify(w.st.get().opportunities.find((x) => x.id === o));
    edit(w, "b1", { market: 2500, photos: { front: "x", back: "y" } });
    eq(JSON.stringify(w.st.get().opportunities.find((x) => x.id === o)), before,
      "the deal did not notice");
  });

  test("terminal history is untouched", () => {
    const w = world();
    const { o } = committed(w);
    w.st.actions.patchOpportunity(o, (x) => ({ ...x, stage: "completed", completedAt: AT }));
    const before = JSON.stringify(w.st.get().opportunities.find((x) => x.id === o));
    edit(w, "b1", { market: 2500 });
    eq(JSON.stringify(w.st.get().opportunities.find((x) => x.id === o)), before,
      "history stays history");
    eq(w.view().binderCopyState("b1").state, "traded", "and the copy stays traded");
  });

  test("the UI writes nothing directly", () => {
    const sheet = code(COL).slice(code(COL).indexOf("function BinderCopy("),
      code(COL).indexOf("function BinderCopy(") + 5000);
    assert(/st\.updateBinderCopy\(b\.id,/.test(sheet), "it calls the canonical action");
    ["binder:", "cardId:", "stage:"].forEach((f) =>
      assert(!sheet.includes(f), "no direct write of " + f));
  });

  test("opening and cancelling mutate nothing", () => {
    const sheet = code(COL).slice(code(COL).indexOf("function BinderCopy("),
      code(COL).indexOf("function BinderCopy(") + 5000);
    assert(/const \[editing, setEditing\] = useState\(false\)/.test(sheet),
      "editing is local state");
    const cancel = sheet.slice(sheet.indexOf("Cancel"), sheet.indexOf("Save changes"));
    assert(!/updateBinderCopy/.test(cancel), "cancel saves nothing");
    assert(/setMkt\(b\.market/.test(sheet), "and restores the copy's own values");
  });
});

describe("D. The private value stays private", () => {
  test("it is the collector's own note, not an asking price", () => {
    const w = world();
    eq(w.copy("b1").market, 900, "stored on the copy");
    const sheet = code(COL).slice(code(COL).indexOf("function BinderCopy("),
      code(COL).indexOf("function BinderCopy(") + 5000);
    assert(/Only you can see this/.test(sheet), "and said so on screen");
  });

  test("no partner surface reads it", () => {
    /* The Trusted Partner module never reads a binder copy's private value.
       `PHASE.market` is a negotiation-phase constant, not this field. */
    const tp = code(TPSRC);
    const hits = tp.split("\n").filter((l) => /binder[A-Za-z]*\.market\b|\bcopy\.market\b/.test(l));
    /* One reference exists, and it is the COLLECTOR's own seat: the demo block
       that simulates the collector prefills their private note back to them.
       It reaches the partner only if that person presses send — which is a
       proposal, not a leak. Anything outside that block would be. */
    hits.forEach((line) => {
      const at = tp.indexOf(line);
      const block = tp.slice(Math.max(0, at - 900), at);
      assert(/<SimBlock who=\{col\.short\}>/.test(block),
        "a binder value is read only inside the collector's own seat: " + line.trim());
    });
    assert(/Demo control · simulating \{who\} — not a Trusted Partner action/.test(tp),
      "which is labelled as such on screen");
    /* And it is genuinely on the copy, so the check is meaningful. */
    const w2 = world();
    assert("market" in w2.copy("b1"), "the field exists to be protected");
  });

  test("editing it creates no negotiation history", () => {
    const w = world();
    const { o } = committed(w);
    edit(w, "b1", { market: 4000 });
    const opp = w.st.get().opportunities.find((x) => x.id === o);
    eq(opp.trade.cards[0].valueThread.length, 0, "no market proposal was made");
    eq(opp.trade.cards[0].collectorMarket, null, "and nothing was submitted");
  });
});

describe("E. The partner profile is the partner's", () => {
  const seeded = () => M.buildCanonicalSeed({ review: true });

  test("it lives on the one partner record", () => {
    const s = seeded();
    const p = s.partners.find((x) => x.id === "p-self");
    ["about", "specialties", "website", "instagram", "email"].forEach((k) =>
      assert(k in p, k + " is on the canonical record"));
    assert(Array.isArray(p.specialties), "specialties are stated, as a list");
  });

  test("the partner writes it, through a canonical action", () => {
    const w = world();
    eq(w.st.actions.updatePartnerProfile({ partnerId: "nl",
      patch: { about: "We buy vintage." } }), "nl", "the action exists");
    eq(w.st.get().partners.find((p) => p.id === "nl").about, "We buy vintage.",
      "and updates the record");
  });

  test("only profile fields are writable through it", () => {
    const w = world();
    w.st.actions.updatePartnerProfile({ partnerId: "nl",
      patch: { about: "x", name: "Hacked", tradeRate: 0.1 } });
    const p = w.st.get().partners.find((x) => x.id === "nl");
    eq(p.about, "x", "the profile field lands");
    eq(p.name, "Northline Cards", "the identity does not");
    eq(p.tradeRate, 0.8 === p.tradeRate ? 0.8 : p.tradeRate, "nor commercial terms");
    assert(p.tradeRate !== 0.1, "which were not in the allowed set");
  });

  test("specialties must be stated, never a stray value", () => {
    const w = world();
    eq(w.st.actions.updatePartnerProfile({ partnerId: "nl",
      patch: { specialties: "Vintage" } }), null, "a bare string is refused");
    w.st.actions.updatePartnerProfile({ partnerId: "nl",
      patch: { specialties: ["Vintage", "PSA"] } });
    eq(w.st.get().partners.find((x) => x.id === "nl").specialties.join(","),
      "Vintage,PSA", "a list is accepted");
  });

  test("nothing is inferred from what happens to be in stock", () => {
    const view = code(fs.readFileSync(path.join(ROOT, "domain", "collector-view.js"), "utf8"));
    assert(!/specialties = .*inventory/.test(view), "specialties are not derived");
    const store = code(fs.readFileSync(path.join(ROOT, "domain", "metyet-commands.js"), "utf8"));   // PHASE 1: command layer
    assert(/if \("specialties" in clean && !Array\.isArray/.test(store),
      "only an explicit list is stored");
  });

  test("the collector reads it and cannot write it", () => {
    assert(!/updatePartnerProfile/.test(code(COL)),
      "the collector app has no path to edit somebody else's shopfront");
    const detail = code(COL).slice(code(COL).indexOf("function PartnerDetail("),
      code(COL).indexOf("function PartnerDetail(") + 4000);
    assert(/p\.about &&/.test(detail), "it reads About");
    assert(/p\.specialties \|\| \[\]/.test(detail), "and specialties");
  });

  test("missing fields are omitted, never fabricated", () => {
    const s = seeded();
    const sparse = s.partners.find((p) => !p.about && (p.specialties || []).length > 0);
    const bare = s.partners.find((p) => !p.about && !(p.specialties || []).length);
    assert(sparse, "a partner with specialties but no About exists for coverage");
    assert(bare, "as does one with neither");
    const detail = code(COL).slice(code(COL).indexOf("function PartnerDetail("),
      code(COL).indexOf("function PartnerDetail(") + 4000);
    assert(/\{p\.about && <div className="ab-t">/.test(detail), "About renders only when present");
    assert(/\(p\.specialties \|\| \[\]\)\.length > 0 && \(/.test(detail), "as do specialties");
    assert(/\(p\.website \|\| p\.instagram \|\| p\.email\) && \(/.test(detail),
      "and the links block only when there is a link");
  });

  test("one profile model, and nothing CRM-shaped", () => {
    const s = seeded();
    const p = s.partners.find((x) => x.id === "p-self");
    ["score", "rating", "notes", "tasks", "reminders"].forEach((k) =>
      assert(!(k in p), "no " + k + " on the record"));
    const detail = code(COL).slice(code(COL).indexOf("function PartnerDetail("),
      code(COL).indexOf("function PartnerDetail(") + 5000);
    ["rating", "score", "reminder", "task"].forEach((k) =>
      assert(!new RegExp('"' + k, "i").test(detail), "nor " + k + " on the page"));
  });

  test("profile changes touch no deal economics", () => {
    const w = world();
    const { o } = committed(w);
    const before = JSON.stringify(w.st.get().opportunities.find((x) => x.id === o));
    w.st.actions.updatePartnerProfile({ partnerId: "nl", patch: { about: "New blurb." } });
    eq(JSON.stringify(w.st.get().opportunities.find((x) => x.id === o)), before,
      "a blurb is not a term");
  });
});

describe("F. The page keeps its shape", () => {
  test("inventory summary and freshness survive", () => {
    const detail = code(COL).slice(code(COL).indexOf("function PartnerDetail("),
      code(COL).indexOf("function PartnerDetail(") + 4000);
    assert(/inventoryLine\(st\.partnerInventorySummary\(partnerId\)\)/.test(detail),
      "the header still reports size and freshness");
  });

  test("the relationship tab survives and the dashboard stays gone", () => {
    const detail = code(COL).slice(code(COL).indexOf("function PartnerDetail("),
      code(COL).indexOf("function PartnerDetail(") + 6000);
    assert(/label: "Relationship"/.test(detail), "the tab is there");
    assert(!/What they're helping with/.test(detail), "and the old summary has not returned");
    assert(!/className="card sec rel"/.test(detail), "in any form");
  });

  test("About sits above the tabs without displacing them", () => {
    const detail = code(COL).slice(code(COL).indexOf("function PartnerDetail("),
      code(COL).indexOf("function PartnerDetail(") + 6000);
    assert(detail.indexOf('className="card sec ab"') < detail.indexOf('className="tabs"'),
      "profile first, then the inventory the collector came for");
  });

  test("the lifecycle is unchanged", () => {
    eq(D.PURSUIT_STEPS.map((s) => s.id).join(","),
      "review-card,agree-price,select-trade,value-trade,deal,fulfillment", "six, in order");
  });
});

require("./run.cjs").run();
