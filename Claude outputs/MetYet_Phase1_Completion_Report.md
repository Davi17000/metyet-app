# MetYet Phase 1 — Canonical Command-Layer Hardening: Completion Report

**Status: implemented, not committed. It passes the full `npm run verify` in a Linux scratch copy of this working tree. It still needs a `npm run verify` on the Mac before it can be called complete.**

---

## 1. Branch and HEAD

- Branch: `phase-1-command-hardening`, created from `main` at `d07660b383ea947eb942e1d615885834ee659707`
- HEAD: `d07660b383ea947eb942e1d615885834ee659707`. Nothing is committed, and all Phase 1 work is in the working tree.
- Nothing was merged or pushed. No history was rewritten, and no reset or clean was run.
- The GitHub Desktop stash (`stash@{0}: On main: !!GitHub_Desktop<main>`) was not touched.
- Housekeeping: a stale `.git/index.lock` was moved, with your permission, to `.git/_to_delete/index.lock.stale-20260910T201628Z`. You can delete that file whenever you like.

## 2. Files changed

- **New (3):**
  - `domain/metyet-commands.js` (696 lines)
  - `tests/phase1-command-layer.cjs`
  - `tests/fixture-store.cjs`
- **Product and domain (7):**
  - `domain/metyet-domain.js`
  - `domain/metyet-store.js` (rewritten)
  - `domain/collector-view.js`
  - `src/MetYet.jsx`
  - `collector/MetYetCollector.jsx`
  - `shell/MetYetPrototype.jsx`
  - `harness/review-scenario.cjs`
- **Tests (54 modified):** includes `tests/all.cjs` (registers the new suite) and `tests/util.cjs` (one shared helper). The full list is in §18.

## 3. Command-layer architecture

- **`execute(state, actor, command, payload)` in `domain/metyet-commands.js`** is the one authoritative boundary.
  - Every command is a pure function. It returns either `{ ok, state, value }` or `{ ok:false, refused }`.
  - A refused command returns no state, so refusal is atomic by construction.
  - There are 41 commands, covering catalog identity, goals, inventory, binder, interest, conversation and notes, review and photo requests, and the full lifecycle.
- **The seat comes only from the actor.**
  - `resolveActor` needs exactly one of `partnerId` or `collectorId`, and that record must exist in state.
  - Payload `by`, seat and owner fields are ignored for authority.
- **Every Opportunity command passes `oppGate` first:** the Opportunity must exist, the actor must be a participant, and it must not be terminal.
- **Each command then checks, in order:**
  - stage
  - turn: `turnFor(actor, opp, ...reasons)` against the one turn engine `D.nextActor`, and `D.cardOwner` for trade cards
  - Relationship
  - Goal locks
  - copy status
  - money validity
- **`createStore(seed)`** returns `{ get, sub, execute, actorFor, cardById, fixture, actions }`.
  - `execute` updates state once, and only when the command succeeds.
  - `fixture` (`set`, `reset`, `patchOpportunity`) is explicit and non-product.
  - `actions` is a test-only legacy facade. Every write in it goes through `execute`, with the seat taken from the Opportunity.
- **The domain keeps the shared rules:**
  - the turn engine
  - derived copy status: `inventoryCopyStatus`, `binderCopyStatus`, `soldInventoryIds`
  - `goalLocked`, `finalAgreementGiven`, `currentCashFigure`
  - the canonical factories: `emptyDeal`, `emptyFulfillment`, `emptyTradeCard`

## 4. Mutation paths migrated

- **Trusted Partner workspace (`src/MetYet.jsx`):**
  - It reads canonical state only, through `useSyncExternalStore`. The `useShared` setter adapter is removed.
  - Every handler issues a command as `tpActor`. This covers price, trade review, market and %, deal confirmation and proposals, fulfillment, cancellation, inventory add/edit/archive/photos, binder photos, interest, messages, notes, invites and identity resolution.
  - The trade draft stays local until `proposeTradeSelection`.
  - `nextAction` and `cardOwner` now delegate to the domain turn engine.
- **Collector app:** every `st.*` write is `exec(command, payload)` acting as that collector.
- **Collector demo helpers:** `DemoPartnerResponse` (DEMO) and `SimulateTP` (DEV) use `partnerDemo(store)`, which issues real partner-seat commands.
- **Shell:** the scenario picker and Reset demo use `store.fixture.set` and `store.fixture.reset` (DEMO-gated).
- **Harness:** `review-scenario.cjs` now walks the canonical sequence, and its seed includes Relationships.

## 5. Escape hatches that remain (all explicit, none in normal product flow)

- **`store.fixture.set` / `reset` / `patchOpportunity`** are for tests, the DEMO scenario picker, the Collector's DEMO `resetReviewDeal`, and `__store.reset`.
- **`store.actions`** is the legacy test facade. It goes through `execute`, except `patchOpportunity`, which is an alias for the fixture.
- **Counterparty simulators** act as the other seat, using real actors and all the rules. They are persona impersonation until auth exists:
  - TP-screen `SimBlock` (not flag-gated)
  - `SimulateTP` (DEV)
  - `DemoPartnerResponse` (DEMO)

## 6. Turn ownership changes (one canonical owner, `D.nextActor`)

- **Value Trade:**
  - The collector opens market value; the partner can no longer open it.
  - The partner opens Trade %.
  - Across cards there is one owner per Opportunity: the seat that moved last keeps the turn while it still holds a card (ordered by `seq` stamps), and otherwise it falls back to the partner.
- **Deal:** the partner confirms first and the collector second. The collector's confirmation records `agreedAdj` and advances to Fulfillment.
- **Fulfillment:** the partner proposes the plan, the collector confirms it, the partner confirms handoff, and the collector's receipt completes the Opportunity.
- **Both apps use this one rule.** The TP rail, the Collector `turnFor`, the Collector cash editor and both demo helpers read `D.nextActor`. Each only offers a move while the turn is that seat's.

## 7. Goal locks

- Only a Primary Goal can open a negotiation, and only one active Opportunity per Goal is allowed.
- An active Opportunity blocks demotion (`updateGoalTier` → `goal-locked`) and removal (`removeGoal`).
- Cancelling releases the lock; this is derived, with nothing written.
- Satisfied state after completion is derived.

## 8. InventoryCopy rules (TP)

- **Offers:** an offer must name one existing, unarchived, unsold copy whose identity matches the Goal. The partner is taken from that copy.
- **Competing offers:** allowed until a price is settled.
- **`acceptPrice`** commits the copy. A second commitment is refused with `copy-committed`, and the refusal names no other deal, collector or price.
- **Committed copies:** they cannot be archived or removed, their identity fields are immutable, and their cert cannot change while not available.
- **Cancel** releases the copy. **Completion** marks it Sold, and a sold copy is dropped from the partner's shelf and from Collector supply.

## 9. BinderCopy rules

- **Draft:** local UI state only.
- **Reserved:** set when the package is submitted. A copy that is reserved, committed or traded elsewhere is refused. The TP draft picker now offers only available copies.
- **Committed:** set when the partner accepts the copy. The collector cannot withdraw it (withdrawal is only allowed while Reserved), remove it, or change its cert.
- **Released:** by rejection, withdrawal while Reserved, or cancellation.
- **Traded:** on completion.

## 10. Final agreement

- **A new final balance** can only come from the seat whose turn it is. It lapses every confirmation, and confirmation restarts with the partner.
- **A stale confirmation cannot advance** the deal. Once the collector has confirmed, no further change to the economics is accepted.
- **Fixed a pre-existing cross-seat defect:**
  - The TP workspace proposed *deltas* and added `agreedAdj` to its base.
  - The domain and the Collector treat that figure as the final signed balance.
  - So one agreement read as two different numbers. The TP now proposes and displays the absolute figure, and a new test covers it.

## 11. Terminal protections

- Every Opportunity command is refused on Completed or Cancelled records, and the state stays byte-identical (test C).
- A completed deal cannot be cancelled.
- Cancelling after final agreement requires a reason. `cancelOpportunity` refuses without one, and both the TP modal and the Collector sheet ask for it. The record shows "cancelled".
- TP trade rows on a terminal record no longer render Accept, simulator or "waiting on" controls.

## 12. Relationship checks

- **Required for:** `startOpportunity`, `sendMessage` (and reach-out), `recordNote` (a pending invite also qualifies), `setInterest`, `requestPhotos`, `reviewCopy`, `markBinderReviewed`.
- **Seeding:** Relationships are seeded in `buildCanonicalSeed` and the harness. Hand-built test worlds declare them through `tests/fixture-store.cjs`.
- **Unrelated pairs** are refused with `no-relationship`.
- **Invited collectors** stay unrelated until acceptance, which is out of scope for this phase.

## 13. Existing tests changed, and why

**No test was deleted.** Every suite on `main` has the same or a higher test count; two tests were added. Every change carries a `PHASE 1` comment naming the contract rule. The groups below are the reasons.

- **Relationships (contract §2), 31 suites:** now import `fixture-store.cjs`.
- **The collector opens market value:** negotiation-grammar, negotiation-parity, simulator-accept-parity, signed-cash-direction, cash-slider-render, money-interaction-closeout, deal-cash-directionality, deal-and-demo-progression, mobile-deal-timeline, stage-progression-regression, trade-review-progression.
- **One Value Trade turn per Opportunity:**
  - Multi-card fixtures are batched per turn.
  - The seeded Hiro Tanaka tests (value-trade, trade-pct, photo-identity, card-copy, binder-copy) answer the standing 86% first, through `answerStandingTradePct` in `util.cjs`.
- **Partner confirms the deal first:** cash settlement fixtures use `settleFinalCash` / `collectorProposesCash`, or explicit confirm steps (signed-cash, simulator-accept-parity, money-interaction, deal-cash, deal-and-demo, cash-slider, e2e, stage-progression, agreement-gate-receipt).
- **Handoff before receipt:** e2e-unified, stage-pilot-ux, canonical-reconciliation.
- **Committed cards cannot be withdrawn:** the old "withdraw an accepted card to close Value Trade" expectations now assert refusal. They also cover the valid Reserved withdrawal (negotiation-grammar, stage-progression, binder-and-partners-v1, trade-pilot-ux, value-trade-closeout).
- **Reserved on submission:** binder-and-partners-v1 ("a proposed copy is not yet spoken for" became "reserved, not committed").
- **One exact BinderCopy in one active package:** select-trade, value-trade (private-value group) and trade-binder moved off James Rivera, whose open-to-trade copies are all committed or traded, to Priya Raman or Ellen Fisher.
- **Offers need an exact InventoryCopy and a positive amount:** shared-state (a `listed()` helper), review-harness, e2e-unified, cross-persona (an amount is typed before Submit).
- **Accepting takes the other side's standing figure:** initial-offer-pricing and mobile-messaging now use the canonical counter and the correct accepting seat.
- **Audit D-5 privacy leak closed:** "the collector's own field is prepopulated" became "the TP screen never pre-fills it".
- **Source-regex tests pointed at removed internals:** they now assert the command-layer equivalents, and several are stricter:
  - `patchOpportunity`, `store.set`, `useShared`, `store.reset`
  - store action bodies and `A.patchOpportunity`
  - "exactly one raw patch remains" became "none remains"
  - Suites: shared-state, collector, exclusion-boundaries, tp-commitment-ux, copy-photos, pursuit-ownership, inline-review-selection, inventory-freshness, binder-edit, demo-scenarios, pre-deal-scenario, pilot-enablement, deal-consolidation, add-inventory-repro, select-trade-closeout, stage-pilot-ux, canonical-reconciliation, canonical-stage-actions, ux-harness.
- **Goal locks:**
  - collector.cjs "promote/demote" finds the promoted card by identity instead of position.
  - The "no primary goals" empty state now cancels live negotiations first.
- **Terminal records:** end-deal compares figure rows only (the live decision rows are intentionally gone), and a cancellation after agreement supplies a reason.
- **Demo helper legality:** deal-and-demo-progression makes the collector's real counter first. Before, the helper offered a partner move the reducer would refuse.

## 14. New tests (`tests/phase1-command-layer.cjs`, 108)

| Suite | Tests |
|---|---|
| A · command × actor × stage matrix | 72 |
| B · one canonical turn owner, read identically by TP `nextAction` and Collector `turnFor` | 14 |
| C · terminal immutability, byte-identical | 3 |
| D · Goal locks | 4 |
| E · InventoryCopy commitment | 2 |
| E · BinderCopy reservation and commitment | 4 |
| F · final agreement invalidation, including the new cross-seat balance test | 3 |
| G · seeded randomized walks (seeds 7, 42, 2026; 3,000 steps; reach both Completed and Cancelled) | 3 |
| H · product code has no raw mutation path | 3 |

Two tests were also added to existing suites:

- stage-progression-regression: "withdrawing the last reserved card resolves Select Trade"
- trade-binder: "a flagged copy committed elsewhere is not offered"

## 15. Exact counts

| | Suites | Passed | Failed |
|---|---|---|---|
| Baseline `main` @ d07660b (same Linux scratch method) | 87 | 2,584 | 0 |
| Phase 1 working tree | 88 | **2,694** | **0** |

The Phase 1 total is 2,584 existing tests, plus 2 added to existing suites, plus 108 in the new suite.

## 16. Full `npm run verify` result

- **Linux scratch copy of this working tree** (`npm ci`, Linux esbuild): **exit 0.**
  - build OK
  - `ALL SUITES PASSED` (88 suites, 2,694 passed, 0 failed)
  - `PRODUCTION BUILD OK — bytes: 321847`
  - `PROD SMOKE OK`
  - previews written: Collector 6,872 lines, Prototype 11,031 lines
  - The smoke step prints Node's `MODULE_TYPELESS_PACKAGE_JSON` warning, which is unrelated to Phase 1.
- **Mac: NOT YET RUN.** The device bridge cannot run the macOS esbuild binary. Please run `npm run verify` in `metyet-app` on the Mac. Phase 1 should not be called complete until it passes there.

## 17. Remaining blockers and known gaps

1. The Mac `npm run verify` above.
2. The counterparty simulators are persona impersonation. The TP `SimBlock` is not flag-gated. This belongs in the auth phase.
3. Relationship acceptance and invites are out of scope; an invited collector stays unrelated.
4. The TP "Propose balance" input keeps the current payer direction and cannot propose $0. The Collector slider can do both. This is a pre-existing UI limitation.
5. The status column on a terminal TP trade row still shows the last card-owner label. This is cosmetic.
6. The Collector has no UI to withdraw a Reserved card before review. The command supports it, and the contract makes it optional.
7. `binderReviewedAt` is still one shared field per collector rather than per partner. This is pre-existing.
8. Nothing is committed. Commit and push are waiting for your go-ahead.

## 18. `git diff --stat` (tracked files; 3 new untracked files are not included)

```
 collector/MetYetCollector.jsx             | 356 +++++-------
 domain/collector-view.js                  |  30 +-
 domain/metyet-domain.js                   | 214 ++++++-
 domain/metyet-store.js                    | 650 +++++-----------------
 harness/review-scenario.cjs               |  45 +-
 shell/MetYetPrototype.jsx                 |   4 +-
 src/MetYet.jsx                            | 889 ++++++++++++++----------------
 tests/add-inventory-repro.cjs             |   5 +-
 tests/agreement-gate-receipt.cjs          |  30 +-
 tests/all.cjs                             |   2 +-
 tests/binder-and-partners-v1.cjs          |  24 +-
 tests/binder-copy.cjs                     |   5 +-
 tests/binder-edit-and-partner-profile.cjs |   9 +-
 tests/canonical-reconciliation.cjs        |  23 +-
 tests/canonical-stage-actions.cjs         |  96 ++--
 tests/card-copy.cjs                       |   5 +-
 tests/cash-slider-render.cjs              |  53 +-
 tests/collector.cjs                       |  49 +-
 tests/conversation-privacy.cjs            |   2 +-
 tests/copy-photos.cjs                     |  11 +-
 tests/cross-persona.cjs                   |   4 +
 tests/deal-and-demo-progression.cjs       |  72 ++-
 tests/deal-cash-directionality.cjs        |  19 +-
 tests/deal-consolidation.cjs              |   4 +-
 tests/demo-scenarios.cjs                  |   4 +-
 tests/discovery-review-card.cjs           |   2 +-
 tests/e2e-unified.cjs                     |  40 +-
 tests/end-deal.cjs                        |  25 +-
 tests/exclusion-boundaries.cjs            |  18 +-
 tests/initial-offer-pricing.cjs           |  18 +-
 tests/inline-review-selection.cjs         |   5 +-
 tests/inventory-freshness.cjs             |   9 +-
 tests/mobile-deal-timeline.cjs            |  19 +-
 tests/mobile-deal-ux.cjs                  |   2 +-
 tests/mobile-messaging-and-demo.cjs       |  16 +-
 tests/money-interaction-closeout.cjs      |  70 ++-
 tests/negotiation-grammar.cjs             |  72 ++-
 tests/negotiation-parity.cjs              | 102 ++--
 tests/partner-profile-closeout.cjs        |   2 +-
 tests/photo-identity.cjs                  |  15 +-
 tests/pilot-enablement.cjs                |   5 +-
 tests/pre-deal-scenario.cjs               |  16 +-
 tests/pursuit-ownership.cjs               |   3 +-
 tests/review-card.cjs                     |   2 +-
 tests/review-harness.cjs                  |   9 +-
 tests/select-trade-closeout.cjs           |   9 +-
 tests/select-trade.cjs                    |  13 +-
 tests/shared-state.cjs                    | 148 +++--
 tests/signed-cash-direction.cjs           |  30 +-
 tests/simulator-accept-parity.cjs         |  67 ++-
 tests/stage-pilot-ux.cjs                  |  17 +-
 tests/stage-progression-regression.cjs    |  78 ++-
 tests/tp-commitment-ux.cjs                |  18 +-
 tests/trade-binder.cjs                    |  27 +-
 tests/trade-pct.cjs                       |   4 +-
 tests/trade-pilot-ux.cjs                  | 107 ++--
 tests/trade-review-progression.cjs        |   9 +-
 tests/util.cjs                            |  15 +-
 tests/ux-harness.cjs                      |   9 +-
 tests/value-trade-closeout.cjs            |  72 ++-
 tests/value-trade.cjs                     |  42 +-
 61 files changed, 1974 insertions(+), 1746 deletions(-)
```

## 19. `git status --short`

- 61 files marked ` M`: every path listed in §18
- 3 untracked files:

```
?? domain/metyet-commands.js
?? tests/fixture-store.cjs
?? tests/phase1-command-layer.cjs
```
