# MetYet — Option B Implementation: Explicit Pending + Reservation at Final Deal Agreement

**Implementation batch.** Branch `phase-5-option-b-copy-availability`, on top of
`49734483fcf94ea015c3145b0e725efdfafb8399`.

---

## 1. Executive summary

**Starting SHA: `49734483fcf94ea015c3145b0e725efdfafb8399`.** Verified before
editing: `origin/main`, `HEAD` and the SHA the reconciliation reviewed were
byte-identical, and the worktree was clean. Every function the plan named was
re-opened and matched the reconciliation. **No stop condition fired.**

**Option B is fully enforced.** These are now true of MetYet, each proven by
executing the real domain:

> Agreement about information is not agreement to transact.
> Agreed Market Value does not reserve a Trusted Partner's card.
> A partner can deliberately mark one physical copy Pending for one Opportunity.
> Pending stops new pursuits but erases no existing work.
> Final Deal Agreement creates hard exclusivity even if Pending was never used.
> One physical copy cannot be sold twice.
> Sold copies accumulate no further market values or photo requests.
> Collector trade copies stay exclusive from the moment one is offered into a deal.
> Deal Flow stage and inventory availability remain separate truths.

**One architectural assumption from the reconciliation was disproven, and it
changed the work.** The reconciliation said moving the boundary needed four
coordinated edits. The *reason* it gave was right and is worth restating because
it is the thing most likely to be got wrong later: **the old rule was written
several times independently.** `inventoryCopyStatus` is the visible one, but
`acceptPrice` carries its own `INVARIANTS.copyCommittedTo`, and editing only the
first produces a card that reads *Available* in the projection and refuses
`copy-committed` at the command — worse than either end state. Confirmed by
running it.

**The number four, however, was wrong — and I took it as exhaustive, which is
the most serious mistake in this batch.** A fifth holder of the old predicate
sat in `domain/metyet-world.js`, and because `validateWorld` runs on the result
of **every** command and *raises* rather than refusing, the batch's own headline
story would have been a **500 in production** while every test stayed green. It
was found only by a second adversarial pass run after the suite was already
passing. §8a records it and the five smaller defects found with it, all fixed
and all now regression-tested. The lesson to carry: **when a brief names a count
of edit sites, treat it as a floor, and go find the predicate by name.**

**A second assumption was confirmed and is worth banking:** `pendingFor` needed
**no migration**. `metyet.inventory_copies` keeps everything but five columns in
`attrs jsonb`, and the write path spreads unmapped fields through.

**Results.** 134 suites, 4,533 tests, **0 failures** (baseline 133 / 4,481).
Production build OK, 341,053 bytes. Production smoke OK, 83,686 chars.

**Two findings are left for you rather than fixed** — a pre-existing hole that
lets a committed copy's grade and photographs be rewritten, and a refusal
vocabulary that discloses a rival deal's stage. Both are in §8a with the reason
each was not mine to decide inside this batch, and both are listed in §10.

**One thing found that the plan did not anticipate, and it nearly cost the
batch:** `tests/all.cjs` is an explicit list, so a new suite is silently never
run. This batch's headline suite spent its first full run green on its own and
invisible to `npm test`, which still reported ALL SUITES PASSED. A guard is now
part of the suite: **every file in `tests/` that declares tests must be
registered.** It is asked structurally rather than against an exception list,
because a hand-kept exception list is the same class of thing that allowed the
problem.

---

## 2. Before / after behaviour

**Before**

```
Available → Agreed Market Value = committed → Final Deal Agreement = still
committed → Completed = Sold
```

Availability moved exactly twice: at the agreed value, and at completion.
Cancellation released it. Select Trade, Value Trade and Final Deal Agreement
changed nothing, because the card had already gone.

**After**

```
Available
  → inspect · request photos · agree a market value · select trade · value trade
    …all still Available
  → optional: partner marks Pending for Opportunity Y   → Pending
  → Final Deal Agreement                                 → committed
  → Completed                                            → Sold
```

**Release and cancellation.** Pending is released by the same command that set
it, and the card is immediately available again with every thread, agreed value
and photo request intact. A `pendingFor` left pointing at a cancelled deal reads
as available on its own — there is no sweep and nothing to rot. Cancelling a
deal that reached final agreement still requires a reason (an invariant that
predates this batch and only became reachable here).

---

## 3. Item 0 — the two defects, closed

**A. Prices could be proposed on a card that was gone.** Only *accepting* a
price was checked, so two parties could go on exchanging figures over a card
sold and handed over weeks earlier.

The guard is deliberately **not** `status !== "available" → refuse`, because
availability is a fact about the card and this is a question about one
conversation. A card Pending for *your* deal, or committed to *your* deal, is
unavailable to the world and perfectly fine for you to keep working on; a flat
check would stop the winning deal along with the losing ones. So
`copyBlockedFor(state, o)` (`domain/metyet-commands.js`) asks, for one
opportunity:

| Situation | Answer |
|---|---|
| archived or sold | `copy-unavailable` |
| Pending for another deal | `copy-pending` |
| Final agreement in another deal | `copy-committed` |
| anything else, including Pending or committed **for this deal** | carry on |

It names no ids: a collector learns the shop is working on the card, never with
whom. It is asked by `proposePrice`, `acceptPrice` and `acceptDeal` — one
helper, three callers, rather than three copies that drift.

**B. Photographs could be requested of a sold card.** `reviewCopy` had always
refused a sold copy and `requestPhotos` had not, so a Collector could ask a
partner to photograph a card they no longer owned. The two commands exist for
one purpose and now answer alike. Idempotence and the auto-opened review are
unchanged.

Tests: suite section A `[2]`, section D `[18]`, and the concurrency proof §6
step 8.

---

## 4. Pending

**Persisted field.** `inventory.pendingFor = <opportunityId> | null`.
**No migration** — verified against `0001_canonical_world.sql:127–133` and
`persistence/world-repository.js`, which map five columns and put every other
field into `attrs jsonb`.

**Command.** `setCopyPending(invId, oppId | null)` — one command both ways,
following `setCollectorCopyOffered` and `setBinderArchived`. Authorization, in
order:

- the copy exists and belongs to the acting partner (`not-owner`);
- the copy is not archived (`copy-unavailable`);
- **releasing (`oppId: null`) is always allowed**, even on a sold copy and even
  when already null — a partner taking their own note off a card cannot harm
  anybody, and refusing would be pedantry;
- the copy is not sold (`copy-unavailable`);
- it is not already pending for a different live deal (`copy-pending`);
- the named opportunity exists (`not-found`), is the partner's
  (`not-participant`), names this exact copy (`identity-mismatch`), and is
  active (`terminal`).

**Stale behaviour.** `INVARIANTS.copyPendingFor` asks whether the named
opportunity is still active, so a forgotten `pendingFor` derives as Available
with no cleanup. Proven: cancel the deal, leave the field dangling, and the card
is available and pursuable again.

**Status derivation.** `inventoryCopyStatus(invId, opps, inventory)` answers in
this order, and the order is the meaning:

```
sold       any completed opportunity on this copy
pending    pendingFor names an opportunity that is still active
committed  an active opportunity has finalAgreementGiven
available  everything else — INCLUDING an agreed market value
```

`pending` outranks `committed` deliberately: they rarely coexist, and when they
do the partner's own word is the more useful thing to show them.

**Discovery.** `discoveriesIn` selects supply through `isSupply`, which requires
`status === "available"`, so a Pending copy leaves new Goal Matches with no
change to the discovery rule itself. Existing Opportunities keep the copy
visible as `unavailable`.

**Privacy.** `pendingFor` is not in `INVENTORY_FOR_COLLECTOR`, so it never
reaches a Collector; they receive a derived, viewer-relative status. The
projection computes `own` from the viewer's **own** opportunities, so the same
rule yields *"Pending for your deal"* for the associated Collector and a bare
*"unavailable"* for anybody else — no second rule, and no way to learn another
Collector's deal id. Pinned by a test.

**Two back doors closed.** `updateInventoryCopy`'s allow-list never contained
`pendingFor` (that command describes the card: price, grade, certificate,
notes), and `addInventoryCopy`'s deliberately open field spread now strips it —
a card nobody has ever dealt over cannot honestly be pending for a deal.

**TP control: label only, deliberately no button.** `STATUS_LABEL` gains
`pending` on both seats ("Pending" for the shop, "Pending for your deal" for the
Collector), so the state renders truthfully the moment it can occur. **No
control was built and `setCopyPending` is not exposed**, because
`startOpportunity` is not exposed either — **no production opportunity can
exist**, so a Pending control would have nothing to name. Shipping a button that
cannot function contradicts this repository's own standard ("no disabled
affordance pretending to be one"). It belongs in the batch that gives the
Collector a way to open a conversation.

---

## 5. The reservation-boundary move

Four coordinated edits. Skipping any one is worse than doing none.

| # | Site | Change |
|---|---|---|
| 1 | `inventoryCopyStatus` (`metyet-domain.js`) | reserve on `finalAgreementGiven`, not `agreedPrice`; add the `pending` branch; take `inventory` |
| 2 | `INVARIANTS.copyCommittedTo` (`metyet-domain.js`), used only by `acceptPrice` | same move — **otherwise the projection says Available and the command refuses** |
| 3 | `acceptDeal` (`metyet-commands.js`) | **new** — `copyBlockedFor` before the acceptance that would create mutual final agreement |
| 4 | `updateInventoryCopy`, `removeInventoryCopy` | switch to the **new, separately named** `INVARIANTS.copyInLiveDeal`, which keeps the *old* predicate |

**Why edit 4 uses a different predicate, written down in the source.** Two
questions look alike and are not the same:

> *may another collector still pursue this copy?* — availability
> *may the partner still **change** this copy?* — mutation safety

Availability moved to final agreement. Mutation safety must not. From the moment
a market value is settled, a Collector is reasoning about **this exact slab** —
assembling a trade package against its certificate, pricing around its grade.
Letting the partner re-certify it or archive it out from under that is a
different kind of harm from letting somebody else ask about it. `copyInLiveDeal`
is the older, wider window, named separately so the two can never be moved
together by accident again. Pinned by suite section E, which asserts both that
the guards still bite *and* that the two predicates genuinely disagree at the
same moment.

**Why edit 3 is required.** The reconciliation seeded two agreed deals on one
copy and ran both to completion with every command allowed — nothing downstream
of `acceptPrice` re-checks the card. That state was **unreachable** under the
old gate. Moving the boundary makes it reachable, so the guard has to move with
it. `acceptDeal` is the literal commitment boundary: past it, one Collector has
been promised this exact card.

**`startOpportunity`** now refuses `copy-pending` and `copy-committed`
separately, because a Collector told *"the shop is working on this one"* and one
told *"it's sold"* are owed different next moves.

---

## 6. Concurrency proof

Driven on the real domain: one partner, one physical copy `i1`, Collectors Casey
and Jordan, both related, both holding Primary Goals. **No seeded state.**

```
1. Both negotiate while the card is Available
   Casey opens a conversation                         allowed
   Jordan opens one too                               allowed
   Northline counters Casey                           allowed
   world=available | Casey sees available, match ["i1"] | Jordan sees available, match ["i1"]

2. Casey agrees a market value — the card stays Available
   Casey counters 27                                  allowed
   Northline agrees 27 with Casey                     allowed
   world=available | Casey sees available, match ["i1"] | Jordan sees available, match ["i1"]
   (Jordan is left mid-negotiation on purpose, so the refusals below are
    about the CARD rather than about their stage.)

3. Northline marks the card Pending for Casey's deal
   Pending for Casey                                  allowed
   world=pending  | Casey sees pending, match none | Jordan sees unavailable, match none
   a new figure with Jordan                           REFUSED copy-pending

4. Casey carries on regardless
   Casey chooses cash                                 allowed
   Northline says yes                                 allowed

5. Northline releases Pending — Jordan may pursue again
   released                                           allowed
   world=available | Casey sees available, match ["i1"] | Jordan sees available, match ["i1"]
   a new figure with Jordan                           allowed

6. Pending, then Casey walks away — the card is not stranded
   Pending for Casey again                            allowed
   Casey cancels                                      allowed
   pendingFor still points at the ended deal: true
   world=available | Casey sees available, match ["i1"] | Jordan sees available, match ["i1"]

7. A final agreement blocks a second final agreement
   value agreed with Casey                            allowed
   value agreed with Jordan                           allowed      ← both may value one card
   Northline promises Casey                           allowed
   Casey accepts — final agreement                    allowed
   world=committed
   Northline tries to promise Jordan too              REFUSED copy-committed

8. Casey completes — Jordan can do nothing economic on a sold card
   handed over · received                             allowed
   world=sold
   trying to promise Jordan the sold card             REFUSED copy-unavailable
   Jordan asks for photographs                        REFUSED copy-unavailable
   Jordan inspects it                                 REFUSED copy-unavailable

9. And Jordan's conversation is still there, unrewritten
   exists=true  stage=deal  declined=false  thread=2 entries
   Jordan sees the card as: unavailable
   and Jordan may close it themselves                 allowed
   completed deals on this physical card: 1
```

**Two honest notes on the proof.** In step 8 Jordan had reached stage `deal`
during step 7, so `proposePrice` answers `wrong-stage` before the availability
guard — suite test `[18]` drives the same refusal from `agree-price`, where the
answer is `copy-unavailable`. And an earlier draft of this proof accepted
Jordan's price in step 2, which advanced them past `agree-price` and made steps
3 and 5 answer `wrong-stage` — the guard under test was never reached. The
script was restructured rather than reported as-is.

---

## 7. Collector trade-copy regression

**No architecture changed, and exclusivity re-proved** (suite section G):

```
kA1 into deal 1                             allowed → status: reserved
the SAME kA1 into deal 2                    REFUSED copy-reserved
kA2 twice in one package                    REFUSED copy-in-use
a different copy kA2 into deal 2            allowed
kA1 after the partner accepts it            committed
kA1 after deal 1 is cancelled               available
kA1 after the deal completes                traded
```

No `locked` field was introduced; a test asserts none exists in any of the three
domain modules, and that nothing is written onto an inventory copy at
commitment. Binder membership, `offered`, CollectorCopy trade participation and
TP Inventory Pending remain four independent facts.

---

## 8. Tests

**New suite:** `tests/phase5-option-b-copy-availability.cjs` — **49 tests**,
discharging all 28 required invariants (each test names its number) plus the
registration guard, two back-door checks, the privacy check, and a section **H**
holding the six regressions found by the second adversarial pass (§8a).

**Re-pinned, not deleted — 13 suites.** Every failure was a test asserting the
*old* boundary. Each moved to the new one rather than being removed, so the
property it protected still has a test:

| Suite | What moved |
|---|---|
| `tp-commitment-ux` | "settling the price commits the copy" → settling commits nothing; a promise does |
| `exclusion-boundaries` | section C's whole premise; plus cancelling after a promise needs a reason |
| `phase1-command-layer` | the fuzz invariant now counts **promises** and **completions**, not settled prices |
| `phase2-projection` | supply and audience widen, because an agreed value no longer hides a card |
| `phase5-b8-opportunity-discovery` | both Pending and the promise now demonstrated as the boundaries |
| `initial-offer-pricing` | renamed to what it really proves — the turn rule |
| `phase3-domain-readiness` | exercises `setCopyPending` both ways; **and** `copy-committed-once` re-pinned at final agreement (see §8a.1) |
| 5 count pins (`c5`, `c8`, `c34b`, `c35`, `c71`) | 49 → 50 commands, each with the reason written in |
| `shared-state` | a fixed 1600-character window replaced by the function's real extent |
| `phase5-c35` | a stale `git show <base>` against the working tree replaced by **both ends named** |

Two of those deserve calling out because they are the same failure mode C7.1
documented and would have recurred forever: a **fixed byte window** into a
source file that any added comment breaks, and a pin that ranges a batch's base
against the *working tree*, which is true on merge day and false for every later
batch. Both are now written so they cannot go stale.

**Results.**

```
targeted   phase5-option-b-copy-availability   49 passed, 0 failed
full       134 suites, 4,533 tests, 0 failures   (baseline 133 / 4,481)
build      PRODUCTION BUILD OK — 341,053 bytes
smoke      PROD SMOKE OK — 83,686 chars
```

---

## 8a. What the second adversarial pass found — after the suite was green

The implementation was complete, all 28 invariants discharged and the whole
suite green when a second adversarial pass was run over it. It found **six real
defects**, one of them a production blocker. All six are fixed and each has a
regression test in section H of the new suite. They are recorded here rather
than quietly folded in, because five of the six share one cause worth naming.

**The cause.** The brief specified Item 2 as *"four coordinated edits"*, and I
treated that number as the complete set of places the old boundary was held. It
was not. A predicate that several modules copy is not moved by editing the ones
the brief happened to name.

**1. `validateWorld` still enforced the old rule — production blocker.**
`domain/metyet-world.js:466` held `active && o.agreedPrice != null`, the
predicate `INVARIANTS.copyCommittedTo` had moved off. The batch's *headline
story* — two collectors agreeing a value on one copy — was therefore legal in
the domain and rejected by the validator. This was not a cosmetic mismatch:
`persistence/command-transaction.js:69` runs `validateWorld` on the result of
**every** command and raises `PersistenceError(invalidNextWorld)`, so in
production the second `acceptPrice` would have been a **500, not a refusal**,
and `loadWorld`/`saveWorld` would have refused to read such a world back at all.
No test caught it because the prototype store never calls `validateWorld`.

Fixed to `active && D.finalAgreementGiven(o)`. Verified in both directions: two
agreed **values** now store cleanly, and two **promises** on one copy are still
rejected as `invariant.copy-committed-once`.

**2. `proposeFinalBalance` was left out of the guarded set.** Seven commands
received `copyBlockedFor`; the one that puts the *final signed number* on the
table did not. Reachable in practice: the partner takes the deal turn, the copy
is then promised to someone else, and the collector could still propose a figure
for a card that is no longer theirs to buy — learning nothing until the very
last click. Now guarded; it is the eighth caller.

**3. `reviewTradeCard` guarded the wrong side of the verdict.** The guard sat
before `decision` was read, so it blocked **rejecting** a card as well as
accepting one. Rejecting *releases* the collector's copy — the same shape as
`withdrawTradeCard`, which is deliberately unguarded — so a partner could no
longer close down a deal they already knew was dead, and the collector's card
stayed tied up. The guard now applies only to `accept`.

**4. Pending survived archiving.** A copy pended *before* any price is settled
is still archivable (`removeInventoryCopy` keys on `copyInLiveDeal`), and
`copyPendingFor` never consulted `archived`. Both seats were shown "Pending" —
"Pending for your deal" to the collector — for a copy every command answers
`copy-unavailable` about. The derived status contradicted the command layer
outright, in exactly the place the status field exists to prevent the browser
re-deriving. `copyPendingFor` now returns null for an archived copy, which
falls through to `unavailable` as it did before the batch.

**5. `pendingFor` had no validation at all.** The only availability-bearing
field on a copy was neither type- nor shape-checked by `validateWorld`. A
bootstrap, an import or a hand-edited pilot world could carry
`pendingFor: 42`. It degrades safely at read time, but the validator is what
stops it being *stored*. Now shape-checked — and deliberately **not**
freshness-checked, because a stale `pendingFor` deriving Available with no
sweep is the design, not a defect to validate away.

**6. Two stale 2-argument `inventoryCopyStatus` calls** in
`tests/phase1-command-layer.cjs` passed `inventory` as `undefined`, so
`copyPendingFor` short-circuited and the `"released"` assertion on line 377
could not have failed for the new status. Both now pass `inventory`.

### Two findings deliberately NOT acted on

**`grade`, `condition` and `photos` stay mutable on committed and sold copies.**
The cert lock covers `cert` only; the same argument written in its comment — a
collector is reasoning about *this* physical slab — applies just as well to its
grade and its photographs, and a shop can today agree a deal on a PSA 9 and then
rewrite the row. This is real, and it is **pre-existing**: the batch did not
widen it, and the brief's instruction was to *preserve* the inventory mutation
guards under a different predicate, not to extend their reach. Closing it is a
scope decision for you, not a fix to smuggle into this batch. Flagged in §10.

**The three refusal codes disclose a competitor's deal *stage*.** The projection
holds the line — a copy held by someone else's deal reads `unavailable`
unchanged through pending, committed and sold. The command layer does not:
`copy-pending`, `copy-committed` and `copy-unavailable` are three distinct
answers, and any collector can poll them with a command they are entitled to
send, reading a rival negotiation's timeline to the minute. Collapsing them to
one code is a one-line change, but the brief required these refusals by name and
distinguishing them is what makes the UI legible, so this is a founder decision
about which of two stated principles gives. Flagged in §10.

---

## 9. Diff summary

```
 client/collector/present.js                 |   5 +      "Pending for your deal"
 client/tp/present.js                        |   6 +      "Pending"
 domain/metyet-commands.js                   | 222 ++--    copyBlockedFor (8 callers),
                                                           setCopyPending, 2 back doors
 domain/metyet-domain.js                     | 120 ++--    copyPendingFor, copyInLiveDeal,
                                                           copyCommittedTo, inventoryCopyStatus,
                                                           copy-pending
 domain/metyet-projection.js                 |  10 +-      three call sites take `inventory`
 domain/metyet-world.js                      |  18 +-      copy-committed-once moved with the
                                                           predicate; pendingFor shape-checked
 tests/…                                     | 14 files    re-pinned
 tests/phase5-option-b-copy-availability.cjs | new         49 tests
 tests/all.cjs                               |   1 +       register it
 21 files changed, 1414 insertions(+), 96 deletions(-)
```

**No migration. No allow-list change. No new model, table or state machine.**

**Deliberate naming debt, carried not fixed:** `proposeTradeSelection` still
takes `binderIds`, which are **collector copy ids** — pre-existing, recorded in
`domain/README.md`, and now more confusing than ever since real Binders exist.
Renaming it is its own batch.

---

## 10. Remaining known behaviour

- **Review- and photo-only interactions still lose sight of an unavailable
  copy.** `referencedInv` counts opportunities only, so a Collector holding a
  review or a photo request and no Opportunity sees a Pending or Sold copy
  disappear rather than turn `unavailable`. Deferred as the plan directed; the
  fix would be extending `referencedInv` and is not trivial enough to smuggle in.
- **No inventory source/authority concept**, and none added. `setCopyPending`
  being a command rather than a patch field is the seam an external system's
  authorization would one day be checked at.
- **Freshness** — not touched.
- **`setCopyPending` is not exposed and has no TP control** (§4). Nothing in
  production can create an opportunity for it to name.
- **No Collector deal UI**, and the prototype's was not ported.
- **Fulfilment is still show pickup / meetup**; nothing widened, and no shipping.
- **A committed or sold copy's `grade`, `condition` and `photos` are still
  editable** (§8a). Pre-existing and not widened by this batch, but real: a shop
  can agree a deal on a PSA 9 and then rewrite the row. The `cert` lock's own
  stated reason covers these fields too. **Needs a decision** — the fix is to
  extend the lock's field set, which is a deliberate widening of an inventory
  guard and so is not mine to make inside this batch.
- **The refusal vocabulary discloses a competitor's deal stage** (§8a). The
  projection deliberately does not; the command layer's three codes do, and are
  pollable. **Needs a decision**: either the refusals collapse to one code and
  the UI loses a distinction the brief asked for by name, or the stated
  projection principle is narrowed to "the projection does not leak" rather than
  "the other deal's lifecycle cannot be read".

---

## 11. Next recommended batch — not implemented

**The architecture is safe to proceed to
`Available copies → Inspect → Request Photos → Agree Market Value`.** No blocker.
Specifically:

- Availability is now truthful for everything that flow does: inspecting,
  requesting photographs and agreeing a value all leave the card Available, and
  the Collector's projection already carries `invId`, grade, cert, photos and a
  derived status for every related partner's copy.
- Every command that flow needs — `reviewCopy`, `endReview`, `requestPhotos`,
  `addCopyPhotos`, `startOpportunity`, `proposePrice`, `acceptPrice`,
  `cancelOpportunity` — exists, is tested, and is guarded against a card that is
  gone or spoken for.
- Nothing in that flow can now silently reserve a card, which was the reason
  this batch had to land first.

**Two things that batch must carry, and they are small:**

1. **Expose the eight commands** above, and `setCopyPending` with them — the TP
   Pending control becomes buildable in the same batch, because opportunities
   will finally exist for it to name.
2. **Say the quiet part in the UI.** Two Collectors can be in conversation over
   one card and neither is told. That is the model working as designed, and it
   is also the first thing a pilot Collector will be surprised by. One sentence
   on the valuation surface.

**Recommended order:** that batch, then the Collector deal surface beyond
Agree Market Value.

---

## Hand-back

**Gate.** `origin/main` = `HEAD` = the reviewed SHA, worktree clean, every named
function re-opened and matching. No stop condition fired.

**Delivered.** Branch `phase-5-option-b-copy-availability`, commit `e49b639`.
Push refused by the cloud proxy as in every batch (`Davi17000/metyet-app is not
in this session's authorized repository set`), so the change ships as a git
bundle alongside this report.

**What to check first if you read only one thing:** §5's edit 4. It is the edit
that exists purely so that moving one boundary did not silently move another,
and it is the one a future refactor is most likely to undo.

**Stopped where instructed.** The Collector Agree Market Value UI was not built.
