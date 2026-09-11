/* ============================================================================
   TEST FIXTURE STORE — Relationships declared for hand-built worlds

   Contract §2 makes the TP↔Collector Relationship explicit, and the Phase 1
   command layer refuses network actions between unrelated parties. Most suites
   build a small world by hand to test something else (settlement, turn order,
   privacy between two partners…) and model every partner and collector in it as
   already connected. This wrapper states that assumption once: a hand-built
   seed that declares no `relationships` gets one accepted Relationship per
   partner × collector pair. A seed that declares relationships — including every
   buildCanonicalSeed() world — is passed through untouched.

   Test-only. Product code never imports this.
   ========================================================================== */
const { createStore: canonicalCreateStore } = require("../domain/metyet-store.js");

function relateAll(seed) {
  if (!seed || Array.isArray(seed.relationships)) return seed;
  const relationships = [];
  for (const p of seed.partners || []) {
    for (const c of seed.collectors || []) {
      relationships.push({ partnerId: p.id, collectorId: c.id, status: "accepted", at: null });
    }
  }
  return { ...seed, relationships };
}

const createStore = (seed) => canonicalCreateStore(relateAll(seed));

/* ---------------------------------------------------------------------------
   THE CANONICAL FINAL-BALANCE SEQUENCE (contract §4), stated once for suites
   that test cash settlement rather than turn order.

   Before Phase 1 a collector could propose a final figure at any time and the
   partner's "accept" settled it. The contract fixes the order: the partner
   confirms the current state first; a new figure lapses every confirmation and
   the partner confirms again; the collector's confirmation records the agreed
   figure and advances to Fulfillment. Each step goes through store.execute with
   the actor derived from the Opportunity — nothing is patched.
   ------------------------------------------------------------------------- */
const seatsOf = (st, oppId) => {
  const o = st.get().opportunities.find((x) => x.id === oppId);
  return { tp: { partnerId: o.partnerId }, collector: { collectorId: o.collectorId }, o };
};
/* Bring the Deal to "the collector may propose": the partner confirms first. */
function partnerConfirms(st, oppId, at) {
  const { tp } = seatsOf(st, oppId);
  return st.execute(tp, "acceptDeal", { oppId, at });
}
/* The collector puts a signed figure on the table (partner confirms first if
   they have not yet). Leaves the partner holding the turn. */
function collectorProposesCash(st, oppId, amount, at) {
  const { collector, o } = seatsOf(st, oppId);
  if (!(o.deal && o.deal.tpAgreed)) partnerConfirms(st, oppId, at);
  return st.execute(collector, "proposeFinalBalance", { oppId, amount, at });
}
/* Settle at a signed figure: collector proposes, partner confirms, collector
   confirms. Returns every step's result so a suite can assert on refusals. */
function settleFinalCash(st, oppId, amount, at) {
  const { tp, collector } = seatsOf(st, oppId);
  const proposed = collectorProposesCash(st, oppId, amount, at);
  const partner = st.execute(tp, "acceptDeal", { oppId, at });
  const final = st.execute(collector, "acceptDeal", { oppId, at });
  return { proposed, partner, final, ok: proposed.ok && partner.ok && final.ok };
}

module.exports = { createStore, relateAll, partnerConfirms, collectorProposesCash, settleFinalCash };
