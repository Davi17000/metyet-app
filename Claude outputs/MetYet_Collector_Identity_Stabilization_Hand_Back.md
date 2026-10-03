# MetYet — Collector Identity Stabilization Hand-Back

Three integrity corrections following the Collector Object Identity and Binder
Ownership Audit. **No Binder architecture change, no migration, no exposure
change, and the candidate branch is not merged.**

---

## 1. Executive summary

The audit found three holes on the way to the Binder question, all of the same
kind: a record that could no longer be trusted to say what was actually decided.
This batch closes all three and stops.

| | What was wrong | Reachable today? |
|---|---|---|
| **A** | `proposeTradeSelection` never read a copy's disposition, so a copy marked **PC** could be put in a trade package and then crossed to the shop with its grade, cert and both photographs | No — the command is unexposed |
| **B** | `updateGoalCriteria` had no lock, so a Goal's criteria could be rewritten under a live deal and the deal's own admission gate became irreproducible | The command is exposed; the harm arrives with `startOpportunity` |
| **C** | A Save retried after a partial failure **created a duplicate physical copy** | **Yes, in production** |

**Two things need your attention beyond the fixes**, both in §14:

1. **B reverses a deliberate, argued product decision of your own.** C3.3 chose
   `updateGoalCriteria` over remove-and-recreate *specifically* so a Collector
   mid-negotiation could be precise about the copy — the command's own header
   said "SO IT IS NOT BLOCKED BY AN ACTIVE OPPORTUNITY… the criteria are hers,
   correcting them is the honest act", and a test carried the title *"the case
   that decided the command"*. The brief reverses that. I implemented the
   reversal, rewrote the header so the file holds one doctrine rather than two,
   and re-pinned the test to what it still protects. **The cost is real: a
   Collector mid-deal must now choose between the deal and the correction.**
2. **A does not fully close what it appears to close.** An adversarial pass found
   that a copy packaged while offered can then be switched to PC, and it stays
   visible to that partner as `reserved`. A is the door *into* a package; the
   state of a copy already inside one is governed by the deal. I corrected the
   comment that overclaimed, pinned the real behaviour, and surfaced the product
   question rather than inventing an answer.

**141 suites · 4,838 tests · 0 failures. No migration. No schema change. No
`server/` change. Exposed commands 23, unchanged.**

---

## 2. Starting SHA and worktree

| | |
|---|---|
| **Worked from** | `5931dbb` on `phase-5-four-state` — confirmed against the repository, not assumed |
| **Ancestry** | `5931dbb` ← `f43d946` ← `64f88e1` (merge PR #78) |
| **Worktree** | `/home/claude/s1`, clean at start apart from the audit document |
| **Merged?** | **No.** The candidate branch is not merged and this work sits on top of it |

---

## 3. Exact files changed

| File | Change |
|---|---|
| `domain/metyet-domain.js` | one refusal code, `copyNotOffered: "copy-not-offered"` |
| `domain/metyet-commands.js` | **A** the disposition bar in `proposeTradeSelection`; **B** the lock in `updateGoalCriteria` and its rewritten header |
| `domain/collector-view.js` | the prototype's trade picker follows the command's new line, and the comment that said it already did |
| `client/collector/CardSpecification.jsx` | **C** `draftKey` → `draftId` and now read; `adopt`; a draft id minted synchronously |
| `tests/phase5-collector-identity-stabilization.cjs` | **new**, 20 tests |
| `tests/phase5-c33-card-specification.cjs` | one directly contradicted test, re-pinned |
| `tests/all.cjs` | registration |

**8 files, +1,771 / −30**, of which 897 lines are the previous audit document.
`persistence/` and `server/` are byte-identical to `5931dbb`.

---

## 4. A — PC is a hard bar to a trade package

```
proposeTradeSelection, per copy in the package:
  copy must exist                          → not-found
  copy must be this Collector's            → not-owner
  copy must be OFFERED                     → copy-not-offered      ← new
  copy must be photographed, both faces    → photos-required
  copy must not be reserved / committed    → copy-reserved / copy-committed / copy-unavailable
```

**`offered === true`, and nothing weaker.** Refusing only `keeping` would still
let a copy nobody has said anything about — which is **every copy written before
PC existed** — be reserved against its owner's silence. A package is where
property is committed, so the answer has to have been given. The predicate is
`D.copyOffered`, the same one the projection's `inSupply` uses, so the two
cannot drift.

**A refusal of its own, not `copy-unavailable`.** Unavailable means the product
cannot use the copy — archived, reserved, sold. This copy is perfectly usable and
its owner has simply not offered it, which is a sentence a person can act on.
Nothing leaks: the only actor who can reach it is the copy's own owner.

**One bad id refuses the whole package** rather than dropping a row, so nobody is
told "submitted" about a set they did not choose (`[4]`).

**Blast radius, checked rather than assumed.** Every fixture, harness and seed
that packages a copy already sets `offered: true` — the demo seed sets it on
every collector copy — so no existing suite reached the new guard and no
`photos-required` assertion flipped. The one place that did need changing is the
prototype's Select Trade picker (`domain/collector-view.js`), which listed
un-offered copies on the explicit argument that *"the command draws the same
line"*. It no longer does, and that file's own rule — a list must not offer "a
button that fails" — required the filter.

---

## 5. B — a live deal holds the criteria still

`updateGoalCriteria` now refuses `goal-locked` when `D.goalNamedByActive(goalId,
opportunities)`, placed immediately after the ownership check.

**`goalNamedByActive`, not `goalLocked`, and the choice is deliberate.**
`goalLocked` is narrower — negotiating, and not transactionally lost — because it
answers a different question: whether a Goal may be **demoted** from Primary,
where Option B deliberately released a dead deal. This question is whether a
shared record may be rewritten underneath a live one, and that harm lasts as long
as the Opportunity does, fulfilment included. The refusal code is the existing
one, which is what a person already sees when they try to stop looking.

**`goalLocked` is not redefined and nothing is snapshotted.** Carrying `desired`
onto the Opportunity at `startOpportunity` would preserve both the deal's gate
and the Collector's freedom to correct; the brief explicitly defers it, and §14
records what that costs.

**Two consequences worth naming:**

- A `transactionallyLost` deal — the shop sold the copy to somebody else, the
  deal is dead but not cancelled — now locks the criteria as well as the
  removal. The way through is to cancel the dead deal.
- The panel sends `wanted-copy` at step 2 and halts on the first refusal, so a
  Collector who edits criteria **and** records a copy in one Save gets the whole
  Save stopped and the copy unrecorded. The refusal is legible ("This card is
  part of an active deal") and nothing is lost — her answers are still in the
  panel — but she cannot complete that Save until she reverts the edit.
  Reordering the plan would fix it and is out of scope here; it is written up in
  §17.

---

## 6. C — the draft retry identity fix

The panel promises *"pressing Save again sends only what is left"*, and for every
step but one it was true — a Goal that exists is not created twice, a binder
entry is idempotent. A new copy was the exception: the draft carried `id: null`,
the server's minted id was thrown away, and the step field `draftKey` was written
and read by nothing.

**The fix is the id the server already returns.** After a successful
`record-copy`, the minted `value` is bound onto the draft that asked for it, keyed
by that draft's own id; `planFrom` then sees a draft with an id and emits a
correction or nothing. Binding happens on every exit path, which is what makes
the refusal and lost-contact paths — the ones a retry actually follows — safe.

**Nothing de-duplicates by content.** Two Raw Near Mint copies with no certificate
are an ordinary thing to own, and `[13]` pins that the second is still
recordable. No uniqueness by canonical card was added.

**Two smaller corrections the fix required:**

- **`draftKey` → `draftId`.** The Collector surface has a standing rule, enforced
  by `phase4-collector-read-experiences`, that every map it builds is keyed on an
  id. The draft handle *is* one — the identity of a copy that does not have a
  durable one yet — so the field says so rather than the rule being widened.
- **A draft id is now minted synchronously.** `addCopy` read its counter from the
  render closure while updating the list functionally, so two clicks batched into
  one render could both produce `new-1`. Harmless while nothing read the key;
  **not** harmless once one minted id would bind to two drafts, where a later "I
  no longer own this" would remove the wrong copy. A ref is incremented at the
  moment of the click.

---

## 7. Result-contract change

**None was needed, and that is worth stating because it was the most likely place
for this fix to be invisible.** The identity already travels the whole way:

```
addCollectorCopy            → done(state, id)            domain/metyet-commands.js
server command handler      → returns result.value       server/app.js
production store `execute`  → { ok, value, state, … }    client/production-store.js
addOwnedCopy                → returns that answer        client/commands.js
record-copy step            → answer.value               CardSpecification.jsx
```

The panel was discarding a value that was already in its hand. `[12]`–`[15]`
drive the real chain, and the trace above was verified end to end rather than
assumed — a prior batch shipped a fix that never arrived because exactly this
link was missing.

---

## 8. The seventeen adversarial cases

All run in `tests/phase5-collector-identity-stabilization.cjs` (20 tests; the
extra three are §D, "what did not move"). **Every load-bearing case was proved to
bite by reverting the code it guards.**

| # | Case | Test | Result |
|---|---|---|---|
| 1 | PC copy → `proposeTradeSelection` → refused | `[1]` | pass — refused `copy-not-offered`, no row written, copy still `available`, still `keeping` |
| 2 | Trade/Sell copy meeting existing requirements → accepted | `[2]` | pass — row lands, copy `reserved` |
| 3 | Neither disposition → cannot enter a package | `[3]` | pass — and the fixture asserts the copy stored no `keeping` key, so it is the real pre-PC shape |
| 4 | Direct domain invocation cannot bypass | `[4]` | pass — three orderings of a mixed set all refused, nothing partially submitted, and the command is confirmed unexposed |
| 5 | Refused PC copy not partner-visible via `referencedCopies` | `[5]` | pass — projection empty, and a **positive control** proves the same world with the copy offered puts cert and both photographs in front of the shop, so the negative scan means something |
| 6 | PC → Trade/Sell makes the same copy eligible | `[6]` | pass — and the other requirements are intact: photographs still refuse `photos-required`, somebody else's copy still refuses `not-owner`, a stranger still refuses `not-participant` |
| 7 | Active Opportunity → `updateGoalCriteria` → `goal-locked` | `[7]` | pass — four payload shapes, and the deal's admission gate still answers yes afterwards |
| 8 | `updateGoalTier` unchanged | `[8]` | pass — demotion still refused; **promotion still allowed** under a live deal, asserted with real work rather than a no-op that short-circuits |
| 9 | `removeGoal` unchanged | `[9]` | pass |
| 10 | Ended Opportunity → editing behaves as before | `[10]` | pass — and `criteria-required` / `grading-incoherent` still surface first-class with no deal |
| 11 | True Match exactness unchanged | `[11]` | pass — exact stated grade, no "or better", unstated unrestricted |
| 12 | Copy created, later step fails, retry adds zero | `[12]` | pass — **real panel**, real refusal, and the retry is asserted to send exactly `file` |
| 13 | Two intentional identical copies still creatable | `[13]` | pass |
| 14 | Two drafts in one Save keep distinct durable ids | `[14]` | pass — retry sends only `file` |
| 15 | One of two created before failure → retry creates only the missing one | `[15]` | pass — retry sends exactly one `record-copy` |
| 16 | An existing-copy edit never falls back to `record-copy` | `[16]` | pass — including a draft whose id the server no longer has, which sends nothing |
| 17 | The real plan/result path, not an invented fixture | `[12]`, `[14]`, `[15]`, `[17]` | pass — see below |

**On case 17, and a correction I had to make to my own suite.** The first draft
of §C re-implemented the panel's binding inside the test and asserted the
re-implementation — which passes whether or not the product does it, and is
exactly the mistake that let a defect through two batches ago. The adversarial
pass caught a second, subtler version: even after mounting the real component,
the harness never refreshed the `state` prop between presses, so the retry passed
through `planFrom`'s "already gone; nothing to do" branch instead of the real
diff. Both are fixed: the harness hands the panel a fresh projection after every
command exactly as the production store does, and each case asserts **what the
panel actually sent**, because "no duplicate exists" is also true of a panel that
sent nothing for the wrong reason.

**Mutation verification:**

| Reverted | Fails |
|---|---|
| the `offered` bar in `proposeTradeSelection` | `[1]`, `[3]`, `[4]`, `[5]`, `[6]` |
| the lock in `updateGoalCriteria` | `[7]`, `[10]` |
| `adopt` in the panel | `[12]`, `[14]`, `[15]` |

---

## 9. Full suite, build and smoke

```
$ node tests/all.cjs
ALL SUITES PASSED          141 suites · 4,838 tests · 0 failures

$ npm run prod     → PRODUCTION BUILD OK — bytes: 345,605
$ npm run smoke    → PROD SMOKE OK — rendered 83,686 chars
$ npm run build:app -- --allow-unconfigured → main.js 320,784 bytes
```

| | Before (`5931dbb`) | After | Explanation |
|---|---|---|---|
| Suites | 140 | **141** | one new suite |
| Tests | 4,818 | **4,838** | the new suite's 20 |
| Failures | 0 | **0** | |
| Exposed commands | 23 | **23** | nothing exposed, nothing removed |
| Domain commands | 51 | **51** | no command added |
| Migrations | 13 | **13** | `0013_binders.sql` still last |
| Production build | 345,458 | 345,605 | +147 bytes: one refusal code and two guards |
| Smoke | 83,686 chars | 83,686 chars | identical — no rendered output changed |

**No count moved unexplained.** One existing test was re-pinned (§14); nothing
else in any suite changed.

---

## 10. Command, migration and exposure counts

- **Exposed: 23.** `git diff 5931dbb -- server/` is **empty**. `[18]` asserts the
  count and, for fourteen transaction and closed-decision commands, that each is
  a real command *and* still unexposed — so the list cannot quietly assert
  nothing.
- **Domain commands: 51.** None added; `copy-not-offered` is a refusal code, not
  a command.
- **Migrations: 13.** `git diff 5931dbb -- persistence/` is **empty**. `[19]`
  asserts both the count and that `0013_binders.sql` is still last.
- **No transaction command became exposed.**

---

## 11. Binder architecture was not changed

`[19]` asserts it structurally: a binder entry's field set is still exactly
`{addedAt, binderId, canonicalCardId}`, and `setBinderArchived` still works.

Nothing here adds a dependency on `cardHasState`, on card-level membership, on
the `addBinderEntry` state guard, on `pruneOrphanedMemberships`, or on the
command-plan ordering that exists to serve them — all four are scheduled for
reassessment, and the new suite deliberately touches none of them. No `binderId`
on Goal or CollectorCopy; `binder_entries` untouched; Archive neither removed nor
replaced; no Binder UI change.

---

## 12. Search and filtering were not implemented

No search, no state filters, no cross-binder retrieval, no Trade/Sell binder
concept, no PC view, no new tab. Nothing in this batch reads or writes anything
that a future search would depend on.

---

## 13. Goal cardinality was not changed

`[20]` asserts a second Goal for one canonical card is still refused
`duplicate-goal`. The unique index `goals_one_per_collector_card_idx` is
untouched, and `CardSpecification` was not redesigned for multiple Goals.

---

## 14. Newly discovered contradictions

### 14.1 B reverses a deliberate product decision — **please confirm**

`updateGoalCriteria`'s own header, written in C3.3 and unchanged until now, said:

> *"`removeGoal` refuses `goal-locked` while an Opportunity is active, so a
> Collector mid negotiation could never correct the criteria their partner is
> working from — the one moment being precise about the copy actually matters…
> **SO IT IS NOT BLOCKED BY AN ACTIVE OPPORTUNITY**… the criteria are hers,
> correcting them is the honest act, and the deal she opened remains hers to
> finish or to cancel."*

And `tests/phase5-c33-card-specification.cjs` carried a test titled **"criteria
can be corrected while a deal is under way — the case that decided the
command"**.

The brief reverses this, with a good reason of its own: nothing snapshots the
criteria, so an edit mid-deal leaves a record whose admission gate cannot be
reproduced. **Both arguments are sound and they cannot both hold.** I implemented
the reversal because it is the newer and explicit instruction, rewrote the header
so the file holds one doctrine, and re-pinned the test to what it still protects —
that a correction is made **in place** and never by destroying and recreating the
Goal, which was the command's other and still-valid reason for existing.

**What it costs, plainly:** mid-deal, a Collector must choose between the deal and
the correction. **The option that would have kept both** — carrying `desired` onto
the Opportunity at `startOpportunity`, so the deal keeps its own gate and she
keeps her Goal — was named in the audit and explicitly deferred by the brief. If
that trade-off is not what you intended, this is the one change in the batch to
revisit, and it is two lines.

### 14.2 A closes the door into a package, not the state of a copy inside one

An adversarial pass found the remaining half:

```
package an OFFERED copy                → ok
setCollectorCopyKept(copy, true)       → OK        (exposed; no reserved guard)
partner's projection                   → the copy, "reserved", with cert and both photographs
reviewTradeCard(accepted)              → "committed"
```

`copyForViewer` returns a row whenever its status is not `available`, so
`offered` is never consulted for a reserved copy. This is the same asymmetry
`setCollectorCopyOffered` already documents — *"a deal that has already taken the
copy is untouched"* — and unwinding a package is `withdrawTradeCard` or
cancelling, not a disposition. So it is defensible, and it is **not** what my
comment claimed: I had written that A was "the second half" of a doubled
protection. **That was still an overclaim, and it is now corrected in the code.**

**The product question, surfaced rather than answered:** should
`setCollectorCopyKept(true)` refuse while a package holds the copy, the way
`removeCollectorCopy` refuses? Adding it unasked would create its own asymmetry
with `setCollectorCopyOffered`, which deliberately allows the same move.

### 14.3 Smaller, recorded rather than fixed

- The new lock preempts `updateGoalCriteria`'s shape validation, so a malformed
  payload under a live deal answers `goal-locked` rather than
  `grading-incoherent`. Truthful — nothing could be written either way — but a
  caller bug is reported as a lock.
- `adopt` on the success path is defensive only: both successful exits either
  close the panel or freeze it, so no retry follows. Kept because it costs
  nothing and stops being dead the moment either of those changes.

---

## 15. Exact commits

One commit on `phase-5-four-state`, on top of `5931dbb`. The branch is **not**
merged, no transaction work is exposed, and no Binder migration was begun. The
SHA is stated with the bundle.

---

## 16. Ending worktree status

`/home/claude/s1`, `git status --porcelain` **empty**. `persistence/` and
`server/` byte-identical to `5931dbb`. The previous batch's two commits are
unchanged beneath this one.

---

## 17. Recommendation for the next smallest batch — not implemented

> **Salvage the four-state branch, then move Binder membership onto the object.**

The audit's finding stands: a Goal already *is* the sought-copy object and a
CollectorCopy already *is* the owned-copy object, and the Binder is the only
place the model is still card-shaped. The smallest honest sequence, in order, and
each step independently revertable:

1. **Merge the four-state branch minus its Binder machinery** — `keeping`,
   `withDisposition`, copy-level mutual exclusion, the exposure, the
   Offered/Keeping/nothing presentation and the truth-telling cleanup, with
   `cardHasState`, the `addBinderEntry` guard, `pruneOrphanedMemberships` and
   §C of that suite removed. That is the "keep as-is" column of the audit's §12
   and it stands on its own.
2. **`binderId` on CollectorCopy only**, alongside the existing entries, with
   `validateWorld` accepting both. Copies are the easier half — they already have
   stable ids and a per-copy UI.
3. **`binderId` on Goal**, the same shape.
4. **Migrate and drop `binder_entries`**, by the determinism rule in the audit's
   §11 — and only after the ambiguous-row count has been measured against the
   live database, which no repository reading can supply.

That sequence deletes a table, a predicate, a guard, a refusal code, a cascade,
the command-plan ordering constraint and roughly 280 lines of test, and adds one
nullable field to two rows. It is the only direction evaluated where the
complexity goes down.

**Before any of it, two decisions** (audit §15): whether a Collector may hold two
sought copies of one card, and §14.2 above. And one thing worth doing first
because it is two lines and unrelated to all of it: **reorder the command plan so
the Goal steps follow the ownership steps**, so a refused criteria edit can no
longer abort a copy the person was recording in the same Save (§5).

Explicitly **not** recommended next: exposing any transaction command, building
TP Inventory, a PC view, search, or reopening the six closed decisions.
