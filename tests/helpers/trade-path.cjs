/* ============================================================================
   THE TRADE PATH, STATED ONCE FOR SUITES THAT TEST SOMETHING ELSE (M3A A1)

   Many suites need a deal to REACH Value Trade or Deal so they can test what
   happens there — settlement, turn order, privacy, money. Before M3A A1 they got
   there through the Collector-proposes / partner-accepts selection
   (`proposeTradeSelection` then `reviewTradeCard`), which is retired. This is the
   one place that knows the TP-led path instead, so those suites keep testing what
   they were written to test and none of them re-states the selection rules:

     selectAndClose   the partner selects the copies, the Collector says they are
                      ready, the partner closes selection — Value Trade, with
                      every copy reserved for this deal
     cashOnly         the Collector chooses cash only — Deal, no cards

   `run(actor, command, payload)` is the suite's own way to execute a command (a
   fixture store's `execute`, or a wrapper around `C.execute`); it must return
   `{ ok, value }` or `{ ok:false, refused }`. Every step goes through it, so
   every rule of the command layer still applies — nothing is patched. A refusal
   throws, naming the step, because a suite that meant to reach Value Trade and
   did not should fail where it went wrong.

   Test-only. Product code never imports this.
   ========================================================================== */

const step = (r, what) => {
  if (!r || r.ok === false) throw new Error(`trade path: ${what} refused (${r && r.refused})`);
  return r.value;
};

/* `tp` and `collector` are actor handles ({ partnerId } / { collectorId }).
   Returns the new trade row ids, in the order the copies were given. */
function selectAndClose(run, { tp, collector, oppId, copyIds, at }) {
  const ids = step(run(tp, "selectTradeCards", { oppId, copyIds, ...(at ? { at } : {}) }), "partner selects");
  step(run(collector, "continueTradeSelection", { oppId, ...(at ? { at } : {}) }), "collector is ready");
  step(run(tp, "closeTradeSelection", { oppId, ...(at ? { at } : {}) }), "partner closes selection");
  return ids;
}

function cashOnly(run, { collector, oppId, at }) {
  return step(run(collector, "chooseCashOnly", { oppId, ...(at ? { at } : {}) }), "collector chooses cash only");
}

/* The one-call replacement for the retired `proposeTradeSelection` +
   `reviewTradeCard(accept)` pair: copies → reserved rows in Value Trade; no
   copies → cash only. */
function tradeOrCash(run, { tp, collector, oppId, copyIds, at }) {
  return copyIds && copyIds.length
    ? selectAndClose(run, { tp, collector, oppId, copyIds, at })
    : (cashOnly(run, { collector, oppId, at }), []);
}

/* THE FIXTURE SHORTCUT, RESTATED. Suites that test valuation or settlement
   without caring how the cards were chosen used to patch Collector-proposed
   rows onto a deal and have the partner accept them with the retired
   `reviewTradeCard`, which `closeSelection` then moved into Value Trade. This
   writes the state `closeTradeSelection` produces — the rows selected by the
   partner and reserved, the stage Value Trade, the Collector having said they
   were ready — through the store's own fixture door (`patchOpportunity`), so
   those suites keep testing what they test. It decides nothing a command would
   refuse: a suite that needs selection or reservation RULES uses
   `selectAndClose`, which runs the real commands. */
function reachValuationByFixture(store, oppId, rows, at) {
  const when = at || null;
  const patch = store.actions && store.actions.patchOpportunity
    ? store.actions.patchOpportunity : store.fixture.patchOpportunity;
  patch(oppId, (x) => ({ ...x, stage: "value-trade",
    trade: { ...(x.trade || {}), mode: "trade",
      selection: { sentAt: when || true, readyAt: when || true },
      cards: rows.map((r) => ({ ...r, inclusion: "accepted", by: "tp",
        reviewedAt: when, selectedAt: when, reservedAt: when })) } }));
}

/* For suites built on a fixture store (`createStore`). */
const storeRunner = (st) => (actor, command, payload) => st.execute(actor, command, payload);

module.exports = { selectAndClose, cashOnly, tradeOrCash, storeRunner, reachValuationByFixture };
