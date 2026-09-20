/* ============================================================================
   PHASE 2 · BATCH 1 — THE CANONICAL PROJECTION BOUNDARY

   projectForActor(state, actor) is the one place visibility is decided. These
   tests run it over a world with deliberately UNRELATED parties
   (tests/fixture-unrelated.cjs) — never the everyone-connected fixture, where
   no leak could show — and prove both boundaries of contract §3:

     NETWORK  a party receives only records they are related to or take part in
     FIELD    a record that crosses to another party carries only allowed fields

     A  Collector projection                      (required 1–6)
     B  Trusted Partner projection                (required 7–16)
     C  Shared workflow state                     (required 17–18)
     D  Structural guarantees                     (required 19–20, identity)
     E  Adversarial serialized scans              (every marker × every actor)
     F  Edge states: ended relationship, unsubmitted package, product seed
     G  Closeout rules
          G1 a pending invitation is not a Relationship
          G2 a shared record names a counterparty; it never adds network or supply
          G3 no copy status derives from a deal the viewer is not in

   Nothing here renders UI: Batch 1 introduces the boundary without wiring it.
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const { projectForActor, FIELD_RULES, PROJECTED_COLLECTIONS, PROJECTION_SECTIONS } = require("../domain/metyet-projection.js");
const D = require("../domain/metyet-domain.js");
const { unrelatedWorld } = require("./fixture-unrelated.cjs");

/* One world for the read-only tests; tests that need a variation build their own. */
const W = unrelatedWorld();
const S = W.store.get();
const { V, MARK, ids } = W;
/* PHASE 5 BATCH 2: an invitation names nobody, so there are no invitee
   Collectors to act as. What used to be three pending people is now three
   invitations belonging to three partners, and the only actors in this world
   are the ones who actually exist. */
const ACTORS = { ...W.actors };
const P = {};
for (const [name, actor] of Object.entries(ACTORS)) P[name] = projectForActor(S, actor);

/* ---------------------------------------------------------------- helpers */
const idsOf = (rows, key = "id") => rows.map((r) => r[key]).sort();
const sameSet = (got, want, msg) => eq(JSON.stringify([...got].sort()), JSON.stringify([...want].sort()), msg);
const opp = (proj, id) => proj.opportunities.find((o) => o.id === id);
const json = (x) => JSON.stringify(x);
/* Identifier tokens of a serialized projection: ids embedded in compound strings
   (a conversation key "cA::pA::…", a photo URL "photo:bA:front") are split out,
   so "bA" is found inside a photo URL but never mistaken for part of "bAB1". */
const tokens = (proj) => new Set(json(proj).match(/[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*/g) || []);
/* A number as a whole value, not as digits inside another number. */
const hasNumber = (proj, n) => new RegExp(`(^|[^0-9.])${String(n).replace(".", "\\.")}([^0-9]|$)`).test(json(proj));
const hasText = (proj, s) => json(proj).includes(s);
/* Every key used anywhere in a value. */
function keysDeep(v, out = new Set()) {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === "object") for (const k of Object.keys(v)) { out.add(k); keysDeep(v[k], out); }
  return out;
}
function objectsDeep(v, out = new Set()) {
  if (v && typeof v === "object") { if (out.has(v)) return out; out.add(v); Object.values(v).forEach((x) => objectsDeep(x, out)); }
  return out;
}
/* Which actors' projections satisfy a predicate. */
const whoSees = (pred) => Object.keys(P).filter((name) => pred(P[name])).sort();

/* ===================================================== A  COLLECTOR PROJECTION */
describe("A · Collector projection", () => {
  test("1  excludes unrelated Collectors — a collector receives only their own Collector row", () => {
    for (const name of ["cA", "cAB", "cB", "cX"]) {
      sameSet(idsOf(P[name].collectors), [ACTORS[name].collectorId], `${name} collectors`);
    }
    for (const other of ["cAB", "cB", "cX"]) {
      assert(!tokens(P.cA).has(other), `cA's projection names ${other}`);
    }
    assert(!hasText(P.cAB, "Casey Alpha-Only") && !hasText(P.cAB, "Blake Beta-Only"),
      "cAB receives another collector's name");
  });

  test("1b own Collector row omits partner-authored metadata stored on it (D-1)", () => {
    const me = P.cA.collectors[0];
    for (const k of FIELD_RULES.COLLECTOR_PARTNER_AUTHORED) assert(!(k in me), `cA's own row carries ${k}`);
    eq(me.name, "Casey Alpha-Only");
    sameSet(me.prefs, [MARK.prefA], "own matching tags are the collector's own");
  });

  test("2  excludes unrelated Trusted Partners — only the collector's Trusted Partners", () => {
    sameSet(idsOf(P.cA.partners), ["pA"], "cA partners");
    sameSet(idsOf(P.cB.partners), ["pB"], "cB partners");
    sameSet(idsOf(P.cAB.partners), ["pA", "pB"], "cAB partners");
    sameSet(idsOf(P.cX.partners), [], "cX (no network, one pending invitation) partners");
    for (const name of ["cA", "cAB", "cB"]) assert(!tokens(P[name]).has("pC"), `${name} sees Gamma`);
    for (const name of ["cA", "cAB", "cB"]) eq(P[name].counterparties.length, 0, `${name} counterparties`);
    assert(!tokens(P.cA).has("pB"), "cA sees Beta");
    assert(!hasText(P.cA, "Beta Breaks") && !hasText(P.cB, "Alpha Cards"), "unrelated partner name leaked");
  });

  test("2b a related partner arrives with profile-facing fields only (D-3)", () => {
    const allowed = new Set(FIELD_RULES.PARTNER_FOR_COLLECTOR);
    for (const name of ["cA", "cAB", "cB"]) {
      for (const p of P[name].partners) {
        for (const k of Object.keys(p)) assert(allowed.has(k), `${name} receives partner field ${k}`);
      }
    }
    const alpha = P.cA.partners[0];
    eq(alpha.name, "Alpha Cards"); eq(alpha.about, "Alpha about"); eq(alpha.email, "shop@alpha.example.test");
    assert(!("note" in alpha) && !hasText(P.cA, "Alpha public tagline"), "ambiguous partner note reached a collector");
    assert(!("since" in alpha), "partner since reached a collector");
    assert(!("internal" in P.cAB.partners.find((p) => p.id === "pB")), "Beta's internal field reached cAB");
    assert(!hasText(P.cAB, MARK.partnerPrivateB), "Beta's internal value reached cAB");
  });

  test("3  excludes unrelated Opportunities", () => {
    sameSet(idsOf(P.cA.opportunities), [ids.oA], "cA opportunities");
    sameSet(idsOf(P.cAB.opportunities), [ids.oABA, ids.oAB], "cAB opportunities");
    sameSet(idsOf(P.cB.opportunities), [ids.oB], "cB opportunities");
    sameSet(idsOf(P.cX.opportunities), [], "cX opportunities");
    for (const [name, foreign] of [["cA", [ids.oABA, ids.oAB, ids.oB]], ["cB", [ids.oA, ids.oABA, ids.oAB]],
      ["cAB", [ids.oA, ids.oB]]]) {
      for (const o of foreign) assert(!tokens(P[name]).has(o), `${name} names opportunity ${o}`);
    }
  });

  test("4  excludes unrelated messages and history", () => {
    sameSet(P.cA.conversations.map((t) => t.partnerId + "/" + t.collectorId), ["pA/cA"], "cA threads");
    sameSet(P.cAB.conversations.map((t) => t.partnerId + "/" + t.collectorId), ["pA/cAB", "pB/cAB"], "cAB threads");
    assert(hasText(P.cA, MARK.msgA), "cA lost its own thread");
    for (const m of [MARK.msgAB_A, MARK.msgAB_B, MARK.msgB]) assert(!hasText(P.cA, m), `cA sees "${m}"`);
    for (const m of [MARK.msgA, MARK.msgB]) assert(!hasText(P.cAB, m), `cAB sees "${m}"`);
    eq(P.cX.conversations.length, 0);
    /* History: another collector's completed deal is not history this collector has. */
    assert(!hasText(P.cB, "Alpha counter"), "cB sees cA's fulfillment plan");
    for (const name of ["cA", "cAB", "cB", "cX"]) eq(P[name].activity.length, 0, `${name} activity (D-4)`);
  });

  test("5  strips TP inventory cost and private fields", () => {
    const allowed = new Set([...FIELD_RULES.INVENTORY_FOR_COLLECTOR, "status"]);
    for (const name of ["cA", "cAB", "cB"]) {
      for (const row of P[name].inventory) {
        for (const k of Object.keys(row)) assert(allowed.has(k), `${name} receives inventory field ${k}`);
      }
      const keys = keysDeep(P[name]);
      assert(!keys.has("cost") && !keys.has("acquired"), `${name} has a cost/acquired key somewhere`);
    }
    for (const n of [V.costA1, V.costA2, V.costA5, V.costB1, V.costC1, 22222, 11111]) {
      for (const name of ["cA", "cAB", "cB", "cX"]) assert(!hasNumber(P[name], n), `${name} sees cost ${n}`);
    }
    assert(!hasText(P.cA, V.acquiredA1), "cA sees Alpha's acquisition date");
    /* Supply is bounded by the relationship and by availability (§6). */
    const statuses = (proj) => proj.inventory.map((i) => i.invId + ":" + i.status);
    sameSet(statuses(P.cA), ["iA1:sold", "iA2:available"], "cA inventory: Alpha's supply; iA1 by its own deal");
    sameSet(statuses(P.cB), ["iB1:committed"], "cB inventory: its own deal; iB3 is held by another collector's deal");
    sameSet(statuses(P.cAB), ["iA2:available", "iA5:sold", "iB3:committed"],
      "cAB inventory: supply plus own deals; iB1 (a Review Card copy held by cB's deal) is not");
    eq(P.cX.inventory.length, 0, "cX has no supply");
    assert(!tokens(P.cA).has("iA3"), "archived copy offered as supply");
    assert(!tokens(P.cAB).has("iA1"), "another collector's sold copy offered as supply");
  });

  test("6  strips the TP default Trade %", () => {
    for (const name of ["cA", "cAB", "cB", "cX"]) {
      assert(!keysDeep(P[name]).has("tradeRate"), `${name} has a tradeRate key`);
      for (const r of [V.rateA, V.rateB, V.rateC]) assert(!hasNumber(P[name], r), `${name} sees default rate ${r}`);
    }
    /* The canonical opportunity does carry the snapshot — so this is stripping, not absence. */
    eq(S.opportunities.find((o) => o.id === ids.oA).tradeRate, V.rateA);
  });
});

/* ================================================ B  TRUSTED PARTNER PROJECTION */
describe("B · Trusted Partner projection", () => {
  test("7  includes only related Collectors — an invitation adds nobody at all", () => {
    sameSet(idsOf(P.pA.collectors), ["cA", "cAB"], "pA collectors");
    sameSet(idsOf(P.pB.collectors), ["cAB", "cB"], "pB collectors");
    sameSet(idsOf(P.pC.collectors), [], "pC collectors");
    /* An outstanding invitation names nobody, so it produces no counterparty
       either — there is no person yet to be one. pC's only counterparty is the
       collector it shares a record with. */
    sameSet(idsOf(P.pA.counterparties), [], "pA counterparties");
    sameSet(idsOf(P.pB.counterparties), [], "pB counterparties");
    sameSet(idsOf(P.pC.counterparties), ["cX"], "pC counterparties");
    assert(!tokens(P.pA).has("cB") && !tokens(P.pA).has("cX"), "pA names an unrelated collector");
    const allowed = new Set(FIELD_RULES.COLLECTOR_FOR_PARTNER);
    for (const name of ["pA", "pB", "pC"]) {
      for (const c of P[name].collectors) for (const k of Object.keys(c)) assert(allowed.has(k), `${name} receives collector field ${k}`);
    }
    sameSet(idsOf(P.pA.relationships, "collectorId"), ["cA", "cAB"], "pA relationships");
    eq(P.pC.relationships.length, 0, "pC relationships");
  });

  test("8  includes only related Collectors' Goals", () => {
    sameSet(idsOf(P.pA.goals), ["gA", "gAB", "gAB2"], "pA goals");
    sameSet(idsOf(P.pB.goals), ["gAB", "gAB2", "gB"], "pB goals");
    eq(P.pC.goals.length, 0);
    assert(!hasText(P.pA, MARK.goalNoteB), "pA sees cB's goal note");
    assert(hasText(P.pB, MARK.goalNoteB), "pB lost its network's goal note (contract §3: card, tier, note)");
  });

  test("9  includes only network-facing preference tags of related Collectors (D-2)", () => {
    sameSet(idsOf(P.pA.preferences, "collectorId"), ["cA", "cAB"], "pA preference rows");
    sameSet(idsOf(P.pB.preferences, "collectorId"), ["cAB", "cB"], "pB preference rows");
    eq(P.pC.preferences.length, 0);
    for (const row of [...P.pA.preferences, ...P.pB.preferences]) {
      sameSet(Object.keys(row), FIELD_RULES.PREFERENCE_FOR_PARTNER, "preference row fields");
    }
    assert(hasText(P.pA, MARK.prefAB) && hasText(P.pB, MARK.prefAB), "shared collector's tags reach both partners");
    /* There is nowhere for a tag typed at invitation to live any more: the
       command takes two labels and creates no Collector to hang a profile on. */
    assert(!hasText(P.pA, MARK.inviteePrefA), "tags typed at invitation reach the partner before a Relationship");
    assert(!hasText(P.pA, MARK.prefB) && !hasText(P.pB, MARK.prefA), "tags crossed networks");
    for (const name of ["pA", "pB", "pC"]) assert(!hasText(P[name], MARK.prefX), `${name} sees cX's tags`);
  });

  test("10 excludes unrelated Opportunities — including a TP with no deals of its own", () => {
    sameSet(idsOf(P.pA.opportunities), [ids.oA, ids.oABA], "pA opportunities");
    sameSet(idsOf(P.pB.opportunities), [ids.oB, ids.oAB], "pB opportunities");
    sameSet(idsOf(P.pC.opportunities), [], "pC (no deals) opportunities");
    for (const o of [ids.oA, ids.oABA, ids.oB, ids.oAB]) assert(!tokens(P.pC).has(o), `pC names ${o}`);
  });

  test("11 excludes unrelated conversations and history", () => {
    sameSet(P.pA.conversations.map((t) => t.collectorId), ["cA", "cAB"], "pA threads");
    sameSet(P.pB.conversations.map((t) => t.collectorId), ["cAB", "cB"], "pB threads");
    eq(P.pC.conversations.length, 0);
    assert(!hasText(P.pA, MARK.msgAB_B) && !hasText(P.pA, MARK.msgB), "pA reads Beta's threads");
    assert(!hasText(P.pB, MARK.msgA) && !hasText(P.pB, MARK.msgAB_A), "pB reads Alpha's threads");
    assert(!hasText(P.pB, "Alpha counter"), "pB sees Alpha's fulfillment plan");
    eq(P.pA.photoRequests.length, 1, "pA receives the photo request addressed to it");
    eq(P.pB.photoRequests.length, 0);
    for (const name of ["pA", "pB", "pC"]) eq(P[name].copyReviews.length, 0, `${name} sees a collector's Review Card`);
  });

  test("12 strips the Collector Binder reference value", () => {
    for (const name of ["pA", "pB", "pC"]) {
      assert(!keysDeep(P[name]).has("market"), `${name} has a market key somewhere`);
      for (const n of [V.marketA, V.marketAB1, V.marketAB2, V.marketB, V.marketX]) {
        assert(!hasNumber(P[name], n), `${name} sees binder reference value ${n}`);
      }
      const allowed = new Set([...FIELD_RULES.BINDER_FOR_PARTNER, "status"]);
      for (const b of P[name].binder) for (const k of Object.keys(b)) assert(allowed.has(k), `${name} binder field ${k}`);
    }
    /* Network supply (§6) excludes copies another deal holds or traded; own deals keep theirs. */
    const statuses = (proj) => proj.binder.map((b) => b.id + ":" + b.status);
    sameSet(statuses(P.pA), ["bA:traded", "bAB1:traded"], "pA binder: bAB2 is held by Beta's deal");
    sameSet(statuses(P.pB), ["bAB2:reserved", "bB:available"], "pB binder: bAB1 was traded to Alpha");
    eq(P.pC.binder.length, 0);
  });

  test("13 excludes another TP's Interest", () => {
    sameSet(P.pA.interests.map((x) => x.partnerId + "/" + x.binderId), ["pA/bA", "pA/bAB1"], "pA interests");
    sameSet(P.pB.interests.map((x) => x.partnerId + "/" + x.binderId), ["pB/bAB1", "pB/bB"], "pB interests");
    eq(P.pC.interests.length, 0);
    /* The collector sees which of THEIR partners are interested (contract §3). */
    sameSet(P.cAB.interests.map((x) => x.partnerId), ["pA", "pB"], "cAB sees both of its partners' interest");
    sameSet(P.cA.interests.map((x) => x.partnerId), ["pA"], "cA sees Alpha's interest only");
  });

  test("14 excludes another TP's invitations and invitee emails", () => {
    sameSet(idsOf(P.pA.invitations), [ids.invA], "pA invitations");
    sameSet(idsOf(P.pB.invitations), [ids.invB], "pB invitations");
    sameSet(idsOf(P.pC.invitations), [ids.invC, ids.invX], "pC invitations");
    /* PHASE 5 BATCH 2: the invitation carries the two labels the partner typed
       — who it is for, and their own note — and both are theirs alone. */
    eq(P.pA.invitations[0].recipient, MARK.inviteeA, "pA keeps its own recipient label");
    eq(P.pA.invitations[0].note, V.invEmailA, "pA keeps its own note");
    eq(P.pA.invitations[0].collectorId, null, "an outstanding invitation names somebody");
    assert(!hasText(P.pA, V.invEmailB) && !hasText(P.pA, V.invEmailC), "pA sees another partner's invitee note");
    assert(!hasText(P.pB, V.invEmailA) && !hasText(P.pC, V.invEmailA), "Alpha's invitation note leaked");
    assert(!hasText(P.pA, MARK.inviteeB) && !hasText(P.pA, MARK.inviteeC), "pA sees another partner's invitee");
    /* The invitee sees who invited them, not the address the partner typed. */
    /* PHASE 5 BATCH 2: nobody is the invitee until a redemption resolves one,
       so an outstanding invitation reaches no Collector's projection at all.
       That is stronger than the rule it replaces — there is no seat that could
       receive it — and Batch 3 is what gives an invitation a person. */
    for (const name of ["cA", "cAB", "cB", "cX"]) {
      for (const i of P[name].invitations) {
        assert(![ids.invA, ids.invB, ids.invC].includes(i.id),
          `${name} received an invitation that names nobody`);
      }
    }
    /* cX is the exception that proves the rule: its invitation was seeded
       already naming them, which is the shape Batch 3 will produce at
       redemption — and it reaches exactly the person it names. */
    sameSet(idsOf(P.cX.invitations), [ids.invX], "a resolved invitation reaches its collector");
  });

  test("15 excludes another TP's notes and activity (D-1, D-4)", () => {
    sameSet(idsOf(P.pA.activity), ["a1"], "pA activity");
    sameSet(idsOf(P.pB.activity), ["a2"], "pB activity");
    eq(P.pC.activity.length, 0);
    assert(!hasText(P.pA, MARK.actB) && !hasText(P.pB, MARK.actA), "activity crossed partners");
    for (const name of Object.keys(P)) assert(!hasText(P[name], MARK.actLegacy), `${name} sees ownerless activity`);
    const noteOf = (proj, cid) => (proj.relationships.find((r) => r.collectorId === cid) || {}).note;
    eq(noteOf(P.pA, "cAB"), MARK.relNoteA_AB, "pA keeps its own relationship note");
    eq(noteOf(P.pB, "cAB"), MARK.relNoteB_AB, "pB keeps its own relationship note");
    assert(!hasText(P.pA, MARK.relNoteB_AB) && !hasText(P.pB, MARK.relNoteA_AB), "relationship note crossed partners");
    for (const r of P.cAB.relationships) {
      sameSet(Object.keys(r), FIELD_RULES.RELATIONSHIP_SHARED, "collector relationship fields");
    }
    for (const m of [MARK.relNoteA_A, MARK.relNoteA_AB, MARK.relNoteB_AB]) {
      assert(!hasText(P.cA, m) && !hasText(P.cAB, m), `collector sees partner note "${m}"`);
    }
    for (const m of [MARK.legacyNoteA, MARK.legacyNoteAB, MARK.legacyNoteB]) {
      eq(whoSees((p) => hasText(p, m)).join(), "", `legacy collector-row note "${m}" projected`);
    }
  });

  test("16 retains its own inventory cost and private fields", () => {
    const iA1 = P.pA.inventory.find((i) => i.invId === "iA1");
    eq(iA1.cost, V.costA1); eq(iA1.acquired, V.acquiredA1); eq(iA1.status, "sold");
    sameSet(idsOf(P.pA.inventory, "invId"), ["iA1", "iA2", "iA3", "iA5"], "pA inventory incl. archived and sold");
    eq(P.pB.inventory.find((i) => i.invId === "iB1").cost, V.costB1);
    sameSet(idsOf(P.pC.inventory, "invId"), ["iC1"], "pC inventory");
    eq(P.pA.partners[0].tradeRate, V.rateA, "pA keeps its default Trade %");
    eq(P.pB.partners[0].internal, MARK.partnerPrivateB, "pB keeps its own internal field");
    eq(opp(P.pA, ids.oA).tradeRate, V.rateA, "pA keeps the Trade % snapshot on its deal");
    assert(!hasNumber(P.pA, V.costB1) && !hasNumber(P.pB, V.costA1), "cost crossed partners");
  });
});

/* ================================================== C  SHARED WORKFLOW STATE */
describe("C · Workflow state shared by both participants", () => {
  test("17 participant deal history is visible to both participants — and only them", () => {
    for (const [oid, c, p] of [[ids.oA, "cA", "pA"], [ids.oABA, "cAB", "pA"], [ids.oB, "cB", "pB"], [ids.oAB, "cAB", "pB"]]) {
      const mine = opp(P[c], oid), theirs = opp(P[p], oid);
      assert(mine && theirs, `${oid} missing for a participant`);
      const { tradeRate, ...partnerView } = theirs;
      eq(json(mine), json(partnerView), `${oid}: participants see the same deal, less the partner's default Trade %`);
      eq(whoSees((x) => !!opp(x, oid)).join(), [c, p].sort().join(), `${oid} audience`);
    }
    const done = opp(P.cA, ids.oA);
    eq(done.stage, "completed");
    eq(done.agreedPrice, 3700, "submitted offer");
    eq(done.trade.cards[0].agreedMarket, 500, "submitted market-value proposal");
    eq(done.trade.cards[0].agreedPercent, 0.8, "submitted Trade %");
    eq(done.deal.agreedAdj, -150, "signed final balance");
    eq(done.fulfillment.location, "Alpha counter", "fulfillment plan");
    eq(opp(P.cB, ids.oB).deal.collectorAdj, 3333, "a standing proposed balance at Deal");
    eq(opp(P.pB, ids.oB).deal.collectorAdj, 3333);
  });

  test("18 exact copy identity is available to participants without owner-private fields", () => {
    /* Partner side: the collector's exact BinderCopy in Alpha's completed deal. */
    const row = opp(P.pA, ids.oA).trade.cards[0];
    eq(row.binderId, "bA"); eq(row.cert, "PSA-bA"); eq(row.photos.front, "photo:bA:front");
    const bA = P.pA.binder.find((b) => b.id === "bA");
    eq(bA.cert, "PSA-bA"); eq(bA.status, "traded"); assert(!("market" in bA), "bA market reached pA");
    /* A reserved copy in a submitted package, seen by its partner. */
    const bAB2 = P.pB.binder.find((b) => b.id === "bAB2");
    eq(bAB2.status, "reserved"); assert(!("market" in bAB2));
    eq(opp(P.pB, ids.oAB).trade.cards[0].binderId, "bAB2");
    /* Collector side: the exact InventoryCopy they bought. */
    eq(opp(P.cA, ids.oA).invId, "iA1");
    const iA1 = P.cA.inventory.find((i) => i.invId === "iA1");
    eq(iA1.cert, "PSA-A1"); eq(iA1.ask, 4000); eq(iA1.status, "sold");
    assert(!("cost" in iA1) && !("acquired" in iA1), "owner-private inventory field reached the buyer");
    const iA5 = P.cAB.inventory.find((i) => i.invId === "iA5");
    eq(iA5.status, "sold"); assert(!("cost" in iA5));
    /* The collector's own copy keeps its own reference value. */
    eq(P.cA.binder.find((b) => b.id === "bA").market, V.marketA);
  });
});

/* ===================================================== D  STRUCTURAL GUARANTEES */
describe("D · Structural guarantees", () => {
  test("19 no reference back to the canonical world", () => {
    const canonical = objectsDeep(S);
    for (const name of Object.keys(P)) {
      for (const o of objectsDeep(P[name])) assert(!canonical.has(o), `${name} projection shares an object with canonical state`);
      eq(json(JSON.parse(json(P[name]))), json(P[name]), `${name} projection is plain data`);
      for (const [k, v] of Object.entries(P[name])) assert(typeof v !== "function", `${name}.${k} is a function`);
    }
    /* Output shape is exactly the classified collections — nothing passes through. */
    for (const name of Object.keys(P)) sameSet(Object.keys(P[name]), PROJECTION_SECTIONS, `${name} projection keys`);
    const withExtra = { ...S, secrets: [{ id: "s1", text: "UNCLASSIFIED-COLLECTION" }] };
    for (const actor of [ACTORS.pA, ACTORS.cA]) {
      assert(!hasText(projectForActor(withExtra, actor), "UNCLASSIFIED-COLLECTION"), "an unclassified collection passed through");
    }
    for (const k of Object.keys(S)) assert(PROJECTED_COLLECTIONS.includes(k), `canonical collection ${k} has no projection rule`);
  });

  test("20 deterministic and non-mutating", () => {
    const before = json(S);
    for (const [name, actor] of Object.entries(ACTORS)) {
      eq(json(projectForActor(S, actor)), json(P[name]), `${name}: same state and actor, same projection`);
    }
    eq(json(S), before, "projecting mutated canonical state");
    /* Vandalise every projection; canonical state and later projections are unaffected. */
    for (const name of Object.keys(P)) {
      const p = projectForActor(S, ACTORS[name]);
      for (const k of [...PROJECTED_COLLECTIONS, "counterparties"]) {
        for (const r of p[k]) for (const f of Object.keys(r)) r[f] = "VANDALISED";
        p[k].push({ id: "junk" });
      }
    }
    eq(json(S), before, "mutating a projection reached canonical state");
    eq(json(projectForActor(S, ACTORS.pA)), json(P.pA), "a later projection changed");
  });

  test("identity follows the Phase 1 convention: seat derived, claims ignored, unknown actors get nothing", () => {
    eq(json(projectForActor(S, { seat: "tp", collectorId: "cA" })), json(P.cA), "claimed tp seat on a collector");
    eq(json(projectForActor(S, { seat: "collector", partnerId: "pA" })), json(P.pA), "claimed collector seat on a partner");
    const nothing = (p, what) => {
      eq(p.actor, null, what + " actor");
      for (const k of [...PROJECTED_COLLECTIONS, "counterparties"]) eq(p[k].length, 0, `${what} ${k}`);
    };
    nothing(projectForActor(S, { partnerId: "p-nobody" }), "unknown partner");
    nothing(projectForActor(S, { collectorId: "c-nobody" }), "unknown collector");
    nothing(projectForActor(S, { partnerId: "pA", collectorId: "cA" }), "ambiguous identity");
    nothing(projectForActor(S, { seat: "tp" }), "seat without identity");
    nothing(projectForActor(S, null), "null actor");
    nothing(projectForActor(null, ACTORS.pA), "null state");
    eq(json(P.pA.actor), json({ seat: "tp", partnerId: "pA" }));
    eq(json(P.cAB.actor), json({ seat: "collector", collectorId: "cAB" }));
  });

  test("the module is a pure domain module: no React, no UI, no demo fixtures", () => {
    const src = fs.readFileSync(path.join(__dirname, "../domain/metyet-projection.js"), "utf8");
    const requires = [...src.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]).sort();
    /* RESTATED IN PHASE 5 BATCH 8, which added `./metyet-discovery.js` — the
       overlap between a Goal and an available Copy, derived for each seat. What
       this assertion has always been protecting is that the projection reaches
       nothing outside the domain: every dependency is a sibling in this folder,
       and none of them is React, a fixture, a store or a network. Naming the
       three explicitly keeps that exact, and keeps a fourth from arriving
       unremarked — the list is the point, not its length. */
    sameSet(requires,
      ["./metyet-commands.js", "./metyet-discovery.js", "./metyet-domain.js"],
      "projection dependencies");
    for (const r of requires) assert(/^\.\/metyet-[a-z-]+\.js$/.test(r), `${r} is not a domain sibling`);
    assert(!/import\s|React|fixture|demo|localStorage|fetch\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")),
      "projection code references UI, demo, persistence or network");
  });
});

/* ================================================ E  ADVERSARIAL SERIALIZED SCANS */
describe("E · Adversarial scans — who can see each marker, id and private value", () => {
  test("the scan is sound: no marker contains another", () => {
    const all = [...Object.values(MARK), V.invEmailA, V.invEmailB, V.invEmailC, V.invEmailX];
    for (const a of all) for (const b of all) assert(a === b || !a.includes(b), `marker "${a}" contains "${b}"`);
  });

  /* The complete audience of every distinctive value in the world. A value
     reaching one actor too many — or one too few — fails, naming it. */
  const RA = S.photoRequests[0].id;
  const RV = (cid) => S.copyReviews.find((r) => r.collectorId === cid).id;
  const ID_AUDIENCE = {
    pA: ["pA", "cA", "cAB"], pB: ["pB", "cAB", "cB"], pC: ["pC", "cX"],
    cA: ["cA", "pA"], cAB: ["cAB", "pA", "pB"], cB: ["cB", "pB"], cX: ["cX", "pC"],

    [ids.oA]: ["cA", "pA"], [ids.oABA]: ["cAB", "pA"], [ids.oAB]: ["cAB", "pB"], [ids.oB]: ["cB", "pB"],
    [ids.invA]: ["pA"], [ids.invB]: ["pB"], [ids.invC]: ["pC"], [ids.invX]: ["pC", "cX"],
    iA1: ["pA", "cA"], iA2: ["pA", "cA", "cAB"], iA3: ["pA"], iA5: ["pA", "cAB"],
    /* iB1 reaches cAB only as the id inside cAB's own Review Card record. */
    iB1: ["pB", "cAB", "cB"], iB3: ["pB", "cAB"], iC1: ["pC"],
    /* bAB1: Beta's own interest record still names it. */
    bA: ["cA", "pA"], bAB1: ["cAB", "pA", "pB"], bAB2: ["cAB", "pB"], bB: ["cB", "pB"], bX: ["cX"],
    gA: ["cA", "pA"], gAB: ["cAB", "pA", "pB"], gAB2: ["cAB", "pA", "pB"], gB: ["cB", "pB"], gX: ["cX"],
    a1: ["pA"], a2: ["pB"], a3: [],
    [RA]: ["cA", "pA"], [RV("cA")]: ["cA"], [RV("cAB")]: ["cAB"],
  };
  test("every id reaches exactly its audience", () => {
    for (const [id, audience] of Object.entries(ID_AUDIENCE)) {
      eq(whoSees((p) => tokens(p).has(id)).join(), [...audience].sort().join(), `audience of id ${id}`);
    }
  });

  const TEXT_AUDIENCE = {
    [MARK.relNoteA_A]: ["pA"], [MARK.relNoteA_AB]: ["pA"], [MARK.relNoteB_AB]: ["pB"],
    [MARK.legacyNoteA]: [], [MARK.legacyNoteAB]: [], [MARK.legacyNoteB]: [],
    "2020-02-02": [], "2026-08-01": [], "2026-07-01": [],               // legacy since / last / reviewed on collector rows
    "2026-08-10": ["pA"], "2026-08-11": ["pA"], "2026-08-12": ["pB"],   // relationship-private review / last contact
    [MARK.actA]: ["pA"], [MARK.actB]: ["pB"], [MARK.actLegacy]: [],
    [MARK.msgA]: ["cA", "pA"], [MARK.msgAB_A]: ["cAB", "pA"], [MARK.msgAB_B]: ["cAB", "pB"], [MARK.msgB]: ["cB", "pB"],
    [MARK.prefA]: ["cA", "pA"], [MARK.prefAB]: ["cAB", "pA", "pB"], [MARK.prefB]: ["cB", "pB"], [MARK.prefX]: ["cX"],
    [MARK.goalNoteB]: ["cB", "pB"], [MARK.partnerPrivateB]: ["pB"],
    /* The recipient a partner typed is theirs alone: nobody else has an
       invitation naming it, and there is no invitee to receive it. */
    [MARK.inviteeA]: ["pA"], [MARK.inviteeB]: ["pB"], [MARK.inviteeC]: ["pC"],
    [V.invEmailA]: ["pA"], [V.invEmailB]: ["pB"], [V.invEmailC]: ["pC"], [V.invEmailX]: ["pC"],
    [MARK.inviteePrefA]: [], [MARK.inviteeCityA]: [],   // nothing at invitation makes a person
    "Nowhere": ["cX"], "Xander No-Network": ["cX", "pC"],               // pending invitee: name only
    "Alpha public tagline": ["pA"], "Beta public tagline": ["pB"],       // ambiguous partner note: closed
    "Alpha about": ["pA", "cA", "cAB"], "Elsewhere": ["pC"],
    [V.acquiredA1]: ["pA"], "2019-09-09": ["pA"], "2018-08-08": ["pB"],  // partner-row since: partner-private
    "Alpha counter": ["cA", "pA"],
  };
  test("every private or party-specific text reaches exactly its audience", () => {
    for (const [text, audience] of Object.entries(TEXT_AUDIENCE)) {
      eq(whoSees((p) => hasText(p, text)).join(), [...audience].sort().join(), `audience of "${text}"`);
    }
  });

  const NUMBER_AUDIENCE = {
    [V.costA1]: ["pA"], [V.costA2]: ["pA"], [V.costA5]: ["pA"], 11111: ["pA"],
    [V.costB1]: ["pB"], 22222: ["pB"], [V.costC1]: ["pC"],
    [V.marketA]: ["cA"], [V.marketAB1]: ["cAB"], [V.marketAB2]: ["cAB"], [V.marketB]: ["cB"], [V.marketX]: ["cX"],
    [V.rateA]: ["pA"], [V.rateB]: ["pB"], [V.rateC]: ["pC"],
  };
  test("every private number reaches exactly its owner", () => {
    for (const [n, audience] of Object.entries(NUMBER_AUDIENCE)) {
      eq(whoSees((p) => hasNumber(p, n)).join(), [...audience].sort().join(), `audience of ${n}`);
    }
  });

  test("forbidden field names never appear in the wrong seat", () => {
    for (const name of ["cA", "cAB", "cB", "cX"]) {
      const keys = keysDeep(P[name]);
      for (const k of ["cost", "acquired", "tradeRate", "internal"]) {
        assert(!keys.has(k), `${name} projection has field ${k}`);
      }
      for (const c of P[name].collectors) {
        for (const k of FIELD_RULES.COLLECTOR_PARTNER_AUTHORED) assert(!(k in c), `${name} own row has ${k}`);
      }
      for (const inv of P[name].invitations) assert(!("email" in inv), `${name} invitation has email`);
    }
    for (const name of ["pA", "pB", "pC"]) {
      const keys = keysDeep(P[name]);
      assert(!keys.has("market"), `${name} projection has field market`);
      for (const c of P[name].collectors) {
        for (const k of FIELD_RULES.COLLECTOR_PARTNER_AUTHORED) assert(!(k in c), `${name} collector row has ${k}`);
      }
    }
  });
});

/* ======================================================= F  EDGE STATES */
describe("F · Edge states", () => {
  test("an ended relationship keeps shared history and drops network data", () => {
    const s = { ...S, relationships: S.relationships.map((r) => (r.partnerId === "pA" && r.collectorId === "cA"
      ? { ...r, status: "ended" } : r)) };
    const pA = projectForActor(s, ACTORS.pA), cA = projectForActor(s, ACTORS.cA);
    /* History both took part in survives. */
    assert(opp(pA, ids.oA) && opp(cA, ids.oA), "completed deal history lost");
    assert(pA.conversations.some((t) => t.collectorId === "cA"), "partner lost its thread");
    /* Identity survives; the network-facing matching profile does not (D-2). */
    assert(!pA.collectors.some((c) => c.id === "cA"), "ex-network collector still in the Collector Network");
    const row = pA.counterparties.find((c) => c.id === "cA");
    assert(row && !("prefs" in row), "cA's tags still reach pA after the relationship ended");
    assert(!pA.preferences.some((p) => p.collectorId === "cA"), "cA preference row still reaches pA");
    assert(!hasText(pA, MARK.prefA), "cA tags leaked");
    /* No goals; only the copy the partner's own deal traded, without a reference value. */
    eq(pA.goals.filter((g) => g.collectorId === "cA").length, 0, "goals of an ex-network collector");
    sameSet(pA.binder.filter((b) => b.collectorId === "cA").map((b) => b.id + ":" + b.status), ["bA:traded"],
      "binder of an ex-network collector");
    assert(!hasNumber(pA, V.marketA));
    /* Collector side: Alpha's supply is gone — photo request and Review Card notwithstanding. */
    sameSet(cA.inventory.map((i) => i.invId + ":" + i.status), ["iA1:sold"], "only the copy cA bought");
    eq(cA.partners.length, 0, "an ex-partner is still a Trusted Partner");
    eq(json(cA.counterparties), json([{ id: "pA", name: "Alpha Cards" }]), "ex-partner named for the shared records");
    eq(cA.interests.length, 0, "an ex-partner's interest still reaches the collector");
  });

  test("an unsubmitted trade package never reaches the partner", () => {
    const s = { ...S, opportunities: S.opportunities.map((o) => (o.id === ids.oAB
      ? { ...o, trade: { ...o.trade, submitted: false } } : o)) };
    const pB = projectForActor(s, ACTORS.pB), cAB = projectForActor(s, ACTORS.cAB);
    eq(opp(pB, ids.oAB).trade.cards.length, 0, "partner sees draft package rows");
    eq(opp(cAB, ids.oAB).trade.cards.length, 1, "collector lost its own draft");
    eq(pB.binder.find((b) => b.id === "bAB2").status, "available", "a draft reserves nothing");
  });

  test("the product seed's collections are all classified, and its projections hold the field boundary", () => {
    const { buildCanonicalSeed } = require("../dist/MetYet.cjs");
    const { createStore } = require("../domain/metyet-store.js");
    const seed = createStore(buildCanonicalSeed({ review: true })).get();
    for (const k of Object.keys(seed)) assert(PROJECTED_COLLECTIONS.includes(k), `seed collection ${k} has no projection rule`);
    for (const c of seed.collectors.slice(0, 5)) {
      const p = projectForActor(seed, { collectorId: c.id });
      const keys = keysDeep(p);
      assert(!keys.has("cost") && !keys.has("tradeRate"), `seed collector ${c.id} receives cost/tradeRate`);
      for (const o of p.opportunities) eq(o.collectorId, c.id);
    }
    for (const partner of seed.partners) {
      const p = projectForActor(seed, { partnerId: partner.id });
      assert(!keysDeep(p).has("market"), `seed partner ${partner.id} receives a binder reference value`);
      for (const o of p.opportunities) eq(o.partnerId, partner.id);
      for (const i of p.interests) eq(i.partnerId, partner.id);
    }
  });
});

/* ============================================================ G  CLOSEOUT RULES */
/* A variation of canonical state with one Relationship's status changed. No
   command accepts an invitation or ends a Relationship yet, so these states are
   constructed — the projection is a pure function of whatever state it is given. */
const withRelationship = (state, partnerId, collectorId, status) => {
  const rest = state.relationships.filter((r) => !(r.partnerId === partnerId && r.collectorId === collectorId));
  return status ? { ...state, relationships: [...rest, { partnerId, collectorId, status, at: "2026-09-03" }] }
    : { ...state, relationships: rest };
};
/* Network calculations read these: an "available" copy is supply. */
const supplyRows = (proj) => proj.inventory.filter((i) => i.status === "available");
const binderSupplyRows = (proj) => proj.binder.filter((b) => b.status === "available");

describe("G1 · A pending invitation is not a Relationship", () => {
  test("TP with a pending invitation to an unrelated Collector sees its invitation, never that Collector's network data", () => {
    const pC = P.pC;
    const inv = pC.invitations.find((i) => i.id === ids.invX);
    assert(inv, "pC lost its own invitation");
    eq(inv.collectorId, "cX"); eq(inv.email, V.invEmailX); eq(inv.acceptedAt, null);
    /* The invitee is named, not networked. */
    assert(!pC.collectors.some((c) => c.id === "cX"), "invitee is in pC's Collector Network");
    eq(json(pC.counterparties.find((c) => c.id === "cX")),
      json({ id: "cX", name: "Xander No-Network", short: "Xander N." }), "invitee identity");
    /* None of cX's network-facing data. */
    eq(pC.goals.length, 0, "invitee goals"); eq(pC.binder.length, 0, "invitee binder");
    eq(pC.preferences.length, 0, "invitee preference rows"); eq(pC.interests.length, 0);
    for (const t of [MARK.prefX, "Nowhere"]) assert(!hasText(pC, t), `pC sees invitee's "${t}"`);
    for (const id of ["gX", "bX"]) assert(!tokens(pC).has(id), `pC names ${id}`);
    assert(!hasNumber(pC, V.marketX), "invitee binder value");
    /* A command-created invitation names nobody, so it produces no counterparty
       at all — and nothing a partner typed at invitation can become a person. */
    eq(P.pA.counterparties.length, 0, "an invitation naming nobody produced a counterparty");
    assert(!hasText(P.pA, MARK.inviteePrefA) && !hasText(P.pA, MARK.inviteeCityA), "typed invitee profile reached pA");
    for (const name of ["pA", "pB", "pC"]) {
      for (const c of P[name].counterparties) {
        for (const k of Object.keys(c)) assert(FIELD_RULES.COLLECTOR_IDENTITY.includes(k), `${name} counterparty field ${k}`);
      }
    }
  });

  test("acceptance, not the invitation, opens the network", () => {
    const accepted = withRelationship(S, "pC", "cX", "accepted");
    const pC = projectForActor(accepted, ACTORS.pC), cX = projectForActor(accepted, ACTORS.cX);
    sameSet(idsOf(pC.collectors), ["cX"], "now in the Collector Network");
    assert(!pC.counterparties.some((c) => c.id === "cX"), "network and counterparties overlap");
    sameSet(idsOf(pC.goals), ["gX"]); sameSet(idsOf(pC.binder), ["bX"]);
    assert(hasText(pC, MARK.prefX), "tags reach the partner once related");
    assert(!hasNumber(pC, V.marketX), "reference value still never crosses");
    sameSet(idsOf(cX.partners), ["pC"]); eq(cX.counterparties.length, 0);
    sameSet(cX.inventory.map((i) => i.invId + ":" + i.status), ["iC1:available"], "Gamma's supply once related");
    for (const status of ["pending", "declined", "ended"]) {
      const p = projectForActor(withRelationship(S, "pC", "cX", status), ACTORS.pC);
      eq(p.collectors.length + p.goals.length + p.binder.length + p.preferences.length, 0, `relationship ${status}`);
    }
  });
});

describe("G2 · A shared record names a counterparty; it never adds network or supply", () => {
  test("a pending invitation shows the Collector the inviter's bare identity — not a Trusted Partner, not supply", () => {
    const cX = P.cX;
    eq(cX.partners.length, 0, "inviter became a Trusted Partner");
    eq(json(cX.counterparties), json([{ id: "pC", name: "Gamma Gaming" }]), "inviter identity");
    eq(cX.inventory.length, 0, "inviter's stock offered as supply");
    assert(!tokens(cX).has("iC1") && !hasText(cX, "Elsewhere"), "inviter stock or profile leaked");
    sameSet(idsOf(cX.invitations), [ids.invX]);
    sameSet(Object.keys(cX.invitations[0]), FIELD_RULES.INVITATION_FOR_INVITEE, "invitee's invitation fields");
    for (const who of []) {
      eq(P[who].partners.length, 0, `${who} partners`); eq(P[who].inventory.length, 0, `${who} supply`);
      sameSet(Object.keys(P[who].counterparties[0]), FIELD_RULES.PARTNER_IDENTITY, `${who} counterparty fields`);
    }
  });

  test("deal history, threads, photo requests and Review Cards with an ex-partner grant no network", () => {
    const s = withRelationship(S, "pA", "cA", "ended");
    const cA = projectForActor(s, ACTORS.cA), pA = projectForActor(s, ACTORS.pA);
    /* Every record still names Alpha … */
    assert(opp(cA, ids.oA) && cA.conversations.length === 1 && cA.photoRequests.length === 1 && cA.copyReviews.length === 1,
      "cA lost its own records");
    /* … and Alpha is only a name. */
    eq(cA.partners.length, 0, "Trusted Partners");
    eq(json(cA.counterparties), json([{ id: "pA", name: "Alpha Cards" }]));
    for (const t of ["Alpha about", "shop@alpha.example.test", "@alpha"]) assert(!hasText(cA, t), `ex-partner profile "${t}"`);
    eq(supplyRows(cA).length, 0, "ex-partner supply");
    assert(!cA.inventory.some((i) => i.invId === "iA2"), "photo-request / Review Card copy became supply");
    /* Partner side, symmetric. */
    assert(!pA.collectors.some((c) => c.id === "cA"));
    eq(json(pA.counterparties.find((c) => c.id === "cA")), json({ id: "cA", name: "Casey Alpha-Only", short: "Casey A." }));
    eq(binderSupplyRows(pA).filter((b) => b.collectorId === "cA").length, 0, "ex-network binder supply");
  });

  test("an active deal with an ex-partner keeps the deal's copy and nothing else", () => {
    const s = withRelationship(S, "pB", "cB", "ended");
    const cB = projectForActor(s, ACTORS.cB), pB = projectForActor(s, ACTORS.pB);
    sameSet(cB.inventory.map((i) => i.invId + ":" + i.status), ["iB1:committed"], "cB inventory");
    eq(cB.partners.length, 0); eq(json(cB.counterparties), json([{ id: "pB", name: "Beta Breaks" }]));
    assert(opp(cB, ids.oB) && opp(pB, ids.oB), "active deal lost");
    assert(!pB.collectors.some((c) => c.id === "cB"));
    eq(pB.goals.filter((g) => g.collectorId === "cB").length, 0, "ex-network goals");
    assert(!hasText(pB, MARK.goalNoteB) && !hasText(pB, MARK.prefB), "ex-network goal note or tags");
    assert(!pB.binder.some((b) => b.collectorId === "cB"), "ex-network binder");
  });

  test("every supply row, in every projection, belongs to the actor's network", () => {
    const states = { S, endedA: withRelationship(S, "pA", "cA", "ended"), endedB: withRelationship(S, "pB", "cB", "ended"),
      acceptedX: withRelationship(S, "pC", "cX", "accepted") };
    for (const [label, state] of Object.entries(states)) {
      for (const [name, actor] of Object.entries(ACTORS)) {
        const p = projectForActor(state, actor);
        const net = new Set([...p.partners, ...p.collectors].map((x) => x.id));
        for (const i of supplyRows(p)) assert(net.has(i.partnerId), `${label}/${name}: supply ${i.invId} from outside the network`);
        for (const b of binderSupplyRows(p)) assert(net.has(b.collectorId), `${label}/${name}: binder supply ${b.id} from outside the network`);
        for (const c of p.counterparties) assert(!net.has(c.id), `${label}/${name}: ${c.id} is both network and counterparty`);
        if (p.actor && p.actor.seat === "collector") {
          for (const x of p.interests) assert(net.has(x.partnerId), `${label}/${name}: interest from outside the network`);
        } else {
          for (const g of p.goals) assert(net.has(g.collectorId), `${label}/${name}: goal from outside the network`);
          for (const r of p.preferences) assert(net.has(r.collectorId), `${label}/${name}: preferences from outside the network`);
        }
      }
    }
  });
});

describe("G3 · No copy status derives from a deal the viewer is not in", () => {
  const snaps = W.snapshots.oABA;
  const project = (label, who) => projectForActor(snaps[label], ACTORS[who]);
  const HELD = ["reserved", "committed", "valued", "deal", "fulfillment", "traded"];

  test("the lifecycle really moves: Alpha sees bAB1 reserved, committed, traded", () => {
    const world = (label) => D.binderCopyStatus("bAB1", snaps[label].opportunities);
    eq([ "agreed", "reserved", "committed", "traded"].map(world).join(), "available,reserved,committed,traded", "canonical bAB1");
    const alpha = (label) => project(label, "pA").binder.find((b) => b.id === "bAB1").status;
    eq(["agreed", "reserved", "committed", "traded"].map(alpha).join(), "available,reserved,committed,traded", "Alpha's own view");
    eq(project("committed", "cAB").binder.find((b) => b.id === "bAB1").status, "committed", "the owner's view");
  });

  test("Beta, related to the same Collector, cannot tell Alpha's deal reserved, committed or completed the copy", () => {
    const beta = Object.fromEntries(Object.keys(snaps).map((label) => [label, json(project(label, "pB"))]));
    for (const label of HELD) {
      eq(beta[label], beta.reserved, `Beta's whole projection at "${label}" differs from "reserved"`);
      assert(!tokens(project(label, "pB")).has(ids.oABA), `Beta names Alpha's deal at ${label}`);
    }
    for (const label of ["beforeOffer", "offered", "agreed"]) eq(beta[label], beta.beforeOffer, `Beta at "${label}"`);
    /* While free, the copy is Beta's supply; once Alpha's deal holds it, it is simply gone. */
    eq(project("agreed", "pB").binder.find((b) => b.id === "bAB1").status, "available");
    for (const label of HELD) assert(!project(label, "pB").binder.some((b) => b.id === "bAB1"), `bAB1 visible to Beta at ${label}`);
    /* Beta's own interest in the copy is Beta's record and does not move. */
    assert(project("traded", "pB").interests.some((x) => x.binderId === "bAB1"));
    /* No status anywhere in Beta's projection comes from a deal Beta is not in. */
    for (const label of Object.keys(snaps)) {
      const p = project(label, "pB");
      const mine = snaps[label].opportunities.filter((o) => o.partnerId === "pB");
      for (const b of p.binder) {
        if (b.status === "available" || b.status === "unavailable") continue;
        eq(b.status, D.binderCopyStatus(b.id, mine), `${label}: Beta's status for ${b.id}`);
      }
    }
  });

  test("the same holds for inventory: another Collector's deal is invisible in a Collector's supply", () => {
    const casey = Object.fromEntries(Object.keys(snaps).map((label) => [label, json(project(label, "cA"))]));
    eq(casey.offered, casey.beforeOffer, "cA while cAB's offer on iA5 is unanswered");
    for (const label of ["reserved", "committed", "valued", "deal", "fulfillment", "traded"]) {
      eq(casey[label], casey.agreed, `cA's whole projection at "${label}" differs from "agreed"`);
    }
    eq(project("offered", "cA").inventory.find((i) => i.invId === "iA5").status, "available");
    assert(!project("agreed", "cA").inventory.some((i) => i.invId === "iA5"), "a copy committed to cAB is offered to cA");
    for (const who of ["pC", "cB", "cX"]) {
      const views = Object.keys(snaps).map((label) => json(project(label, who)));
      for (const v of views) eq(v, views[0], `${who} projection moved with a deal it has no part in`);
    }
  });

  test("a copy Beta's own deal names, now held by Alpha's deal, reads only \"unavailable\"", () => {
    const w = unrelatedWorld();
    const at = "2026-09-02";
    const x = (actor, cmd, payload) => {
      const r = w.store.execute(actor, cmd, { at, ...payload });
      if (!r.ok) throw new Error(`${cmd} refused: ${r.refused}`);
      return r.value;
    };
    const betaDeal = w.store.get().opportunities.find((o) => o.id === w.ids.oAB);
    x(w.actors.cAB, "withdrawTradeCard", { oppId: betaDeal.id, tradeCardId: betaDeal.trade.cards[0].id });
    const free = projectForActor(w.store.get(), w.actors.pB).binder.find((b) => b.id === "bAB2");
    eq(free.status, "available", "withdrawn from Beta's deal, free again");
    const invId = x(w.actors.pA, "addInventoryCopy", { copy: { cardId: "k5", ask: 1600, cost: 1 } });
    const alphaDeal = x(w.actors.cAB, "startOpportunity", { goalId: "gAB2", invId, amount: 1500 });
    x(w.actors.pA, "acceptPrice", { oppId: alphaDeal });
    x(w.actors.cAB, "proposeTradeSelection", { oppId: alphaDeal, binderIds: ["bAB2"] });
    const reserved = w.store.get();
    eq(D.binderCopyStatus("bAB2", reserved.opportunities), "reserved", "canonical");
    const pB1 = projectForActor(reserved, w.actors.pB);
    eq(pB1.binder.find((b) => b.id === "bAB2").status, "unavailable", "Beta's view of a copy its own deal names");
    x(w.actors.pA, "reviewTradeCard", { oppId: alphaDeal, decision: "accepted" });
    const pB2 = projectForActor(w.store.get(), w.actors.pB);
    eq(json(pB2), json(pB1), "Beta's projection moved when Alpha's deal committed the copy");
    assert(!tokens(pB2).has(alphaDeal), "Beta names Alpha's deal");
    eq(projectForActor(w.store.get(), w.actors.pA).binder.find((b) => b.id === "bAB2").status, "committed", "Alpha's own view");
  });
});

run();
