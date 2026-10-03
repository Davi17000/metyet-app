# MetYet — Four-State Salvage and Binder Decoupling Hand-Back

The four-state work kept; the Binder rule built on the rejected abstraction
removed; the command plan reordered on the line that actually matters. **No
object-level Binder membership, no migration, nothing merged.**

Throughout: **[F]** observed repository fact, **[B]** product decision from the
brief, **[C]** implementation choice I made and am accountable for.

---

## 1. Executive summary

**The batch deletes more than it adds — 541 lines in, 984 out** — which is the
shape a salvage should have. What went is one predicate, one aggregate, one
guard, one refusal code, one cascade in four commands, two UI warnings, a
pre-send check and the ordering constraint they forced. What stayed is every
per-object fact: PC as positive `keeping`, `withDisposition`, per-copy mutual
exclusion, `setCollectorCopyKept`, Offered/Keeping/neither, the partner
allow-list, and all three `17743d5` integrity fixes.

The rule now reads:

> **Binder organisation must not determine whether a Goal or CollectorCopy is
> meaningful, and state changes must not silently destroy organisation.**

**The one thing worth your attention** is §6. The brief asked me to reorder the
plan so an owned-copy declaration is not lost to a refused Goal edit. My first
attempt moved *all ownership* ahead of demand — and **an adversarial pass caught
it mirroring the exact bug it was fixing.** `updateCollectorCopy` answers
`copy-committed` once a deal has taken the copy, so `correct-copy` is
deal-refusable too: a mistyped certificate on a traded copy would now have cost
the person their tier change, their new copy and their filing. The line is not
ownership versus demand. It is **refusable-for-itself versus
refusable-for-a-deal**, and that is what shipped.

**141 suites · 4,830 tests · 0 failures.** `persistence/` byte-identical.
Exposed commands 23, domain commands 51, migrations 13 — all unchanged.

---

## 2. Starting SHA, branch, worktree

| | |
|---|---|
| **Worked from** | `17743d5` on `phase-5-four-state` — confirmed against the repository [F] |
| **Ancestry** | `17743d5` ← `5931dbb` ← `f43d946` ← `64f88e1` (merge PR #78) |
| **Worktree** | `/home/claude/s1`, clean at start |
| **Merged?** | **No.** Not merged, and no migration begun |

---

## 3. Exact files changed

| File | Change | +/− |
|---|---|---|
| `domain/metyet-domain.js` | `cardHasState`, `collectorStatesFor` and the `cardHasNoState` refusal deleted; a note in their place saying why there is no card-level answer | 18 / 49 |
| `domain/metyet-commands.js` | `pruneOrphanedMemberships` and its four call sites deleted; the `addBinderEntry` state guard deleted; the independence doctrine restored; a blank card id refused for its own reason | 46 / 129 |
| `client/collector/CardSpecification.jsx` | plan reordered by refusal class; `willHaveState`, the pre-send filing check and the `consequence` warning deleted; the `card-has-no-state` message deleted | 93 / 137 |
| `client/collector/sections/Goals.jsx` | the destruction warning deleted | 0 / 32 |
| `server/app.js` | **comment only** — a false claim that `addBinderEntry` is unexposed | 5 / 5 |
| `tests/phase5-four-state-and-binder-invariant.cjs` | header rewritten; section C inverted; `[28b]` replaced; `[32]`–`[33c]` deleted | — |
| `tests/phase5-c31-binder-foundation.cjs` | three tests restored to C3.1's claims; two cascade tests deleted | — |
| `tests/phase5-c33-card-specification.cjs` | four ordering/filing tests re-pinned | — |
| `tests/phase5-c34b-binder.cjs` | one independence test restored | — |

**9 files, +541 / −984.** `persistence/` untouched.

---

## 4. Four-state behaviour preserved

Verified by running, not by reading. [F]

| Kept | Where | Proof |
|---|---|---|
| positive `keeping`, never inferred from `offered === false` | `domain/metyet-commands.js`, `domain/metyet-domain.js` | `[4]`, `[31]` |
| `withDisposition` — absence, never `keeping: false` | `metyet-commands.js` | `[31]` |
| per-copy mutual exclusion, unreachable in all four directions | `metyet-commands.js` | `[5]`, `[7]` |
| `setCollectorCopyKept`, exposed | `server/exposed-commands.js` (23) | `[39]` |
| two copies of one card, two different truths | domain + projection | `[9]`–`[15]` |
| Offered / Keeping / nothing, with silence undrawn | `Collection.jsx` | `[34]` |
| partner allow-list: `keeping` never crosses | `metyet-projection.js` | `[12]`–`[14]` |
| the truth-telling cleanup A–F | unchanged | existing suites |
| **A** — `proposeTradeSelection` needs `D.copyOffered` | `metyet-commands.js` | stabilization `[1]`–`[6]` |
| **B** — `updateGoalCriteria` locked under an active deal | `metyet-commands.js` | stabilization `[7]`–`[10]` |
| **C** — minted copy id bound to its draft | `CardSpecification.jsx` | stabilization `[12]`–`[17]` |

**[C] One judgement call:** `collectorStatesFor` is deleted too, and it is not on
the brief's keep-list or its remove-list. Its only consumer was `cardHasState`,
so it was dead the moment the guard went — and its signature *is* the rejected
abstraction: one call returning every label a **canonical card** carries. The
four states survive where they always lived, on the objects: a Goal's `tier` and
a copy's `copyDisposition`. A dead card-level aggregate left exported is what
gets picked up later as if it were doctrine. If you want it kept, it is one
revert.

---

## 5. Obsolete Binder-state machinery removed

| Deleted | Old invariant | Why it is no longer product truth |
|---|---|---|
| `D.cardHasState` (9 lines) | "this canonical card is in at least one of the four states" | Asks what a **card** means in aggregate. A card kept in one copy, offered in another and hunted in a third has no single answer |
| `D.collectorStatesFor` (~39 lines) | the list of labels a canonical card carries | The same aggregate, one layer down. Its only caller was `cardHasState` |
| `R.cardHasNoState` refusal | "a card with no state cannot be filed" | The rule it answered for is withdrawn; no caller, no message, no test |
| the `addBinderEntry` guard (~31 lines) | filing required current aggregate state | **Organisation does not decide whether anything else is meaningful.** Filing is now refused only for a binder that is not yours, or a card id that is not one |
| `pruneOrphanedMemberships` (~50 lines) + **4 call sites** in `removeGoal`, `removeCollectorCopy`, `setCollectorCopyOffered`, `setCollectorCopyKept` | losing the last state removed the memberships | **State changes must not silently destroy organisation.** This was the destructive half, and it made curation a consequence of state |
| `willHaveState` + the pre-send filing check (~20 lines) | the panel predicted the guard | The guard is gone; predicting it is predicting nothing |
| the panel's `consequence` warning (~22 lines) | named the destruction before it happened | Nothing is destroyed to warn about |
| `Goals.jsx` `bindersLost` (~32 lines) | the same warning on the one-click surface | Same |
| `WHY["card-has-no-state"]` | the refusal's sentence | The refusal cannot occur |
| the plan's "state before filing" constraint | filing had to follow what made it legal | Filing depends on nothing; the order is decided by refusal class instead (§6) |

**One line added rather than removed** [C]: `addBinderEntry` now rejects a
whitespace-only card id for its own reason. The withdrawn guard refused it
incidentally — a card of spaces has no Goal and no copy — so removing the guard
left the door a shade wider than it was. Unreachable from production (the server
asks the catalog first) and caught by the foreign key underneath, but a door
should say no for its own reasons.

**Kept deliberately** [C]: **removals still run last**, disposition withdrawals
included. That position had two reasons and one of them was the prune. The other
predates it and stands alone — *a sequence that stops should leave a person with
more said about their card than they started with, never less* — so the ordering
survives on the reason it had before the prune existed. It is not dead ceremony:
a refused earlier step no longer strands a withdrawal.

---

## 6. CardSpecification ordering reconciliation

**The brief's finding was confirmed at `17743d5`** [F]: `commit` halts on the
first refusal, demand ran before ownership, so a Collector who corrected her
criteria *and* recorded a card she had just bought lost the card to a
`goal-locked` refusal that had nothing to do with it.

**My first fix moved all ownership ahead of demand, and it was wrong.** [C] An
adversarial pass found that `updateCollectorCopy` answers `copy-committed` once
a deal has taken the copy — so `correct-copy` is deal-refusable too, and putting
it first mirrored the bug: a mistyped certificate on a traded copy would have
cost the tier change, the new copy **and** the filing. The same pass found that
`file` was still stranded behind the demand block, so a ticked binder was still
lost to a locked Goal.

**What shipped.** Exactly three commands can be refused for something that is not
about what they say: `updateGoalCriteria` and `updateGoalTier` (`goal-locked`),
and `updateCollectorCopy` (`copy-committed`). Everything else answers only for
itself. The plan is ordered on that line:

```
1  make-binder                    names no card
2  offering / keeping  (set)      only about the copy
   record-copy                    only about the copy
   start-looking                  only about the goal it creates
3  file                           only "is this binder yours"
   unfile                         after filing: a swap never belongs nowhere
4  correct-copy                   a deal can refuse this
   wanted-copy · how-hard         a deal can refuse these
5  offering / keeping  (withdraw)
   stop-looking · forget-copy     taking things away, last of all
```

Verified end to end: [F]

```
new goal + copy + file   →  record-copy -> start-looking -> file
edits on a filed card    →  keeping -> unfile -> correct-copy -> wanted-copy -> how-hard
```

**No refusal is swallowed, nothing fakes atomicity, and the executor is
unchanged.** A refused Goal edit is still refused, still reported by name, and
the criteria are still untouched — it simply no longer costs the person work it
had nothing to do with.

---

## 7. The twenty-three adversarial scenarios

| # | Scenario | Where | Result |
|---|---|---|---|
| **Four-state identity** ||||
| 1 | Copy A = PC, Copy B = Trade/Sell, identities distinct | `[9]` | pass |
| 2 | A PC→Trade/Sell does not mutate B | `[10]` | pass |
| 3 | B Trade/Sell→PC does not mutate A | `[10]`, `[11]` | pass |
| 4 | neither-disposition is not presented as PC | `[4]`, `[31]`, `[34]` | pass — no `keeping` key, no tag |
| 5 | Goal tier does not derive from copy disposition | `[15]`, `[22]` | pass |
| 6 | copy disposition does not derive from Goal priority | `[22]`, `[23]` | pass |
| **Binder decoupling** ||||
| 7 | `addBinderEntry` no longer refuses for want of state | `[16]`, `[17]` | pass — six cards incl. one nobody has said anything about |
| 8 | removing the last state does not prune membership | `[21]` | pass — Goal, then keep, then the copy itself; two memberships stand |
| 9 | PC↔Trade/Sell does not touch membership | `[23]` | pass — six transitions, byte-identical entries |
| 10 | Primary↔Secondary does not touch membership | `[22]` | pass |
| 11 | Archive otherwise unchanged | `[25b]` | pass — archive, file into an archived binder, remove a Goal, unarchive |
| 12 | no test claims the card-shaped row identifies an object | `[25c]` | pass — asserts the row's exact field set and that a Goal + two copies produce **one** membership |
| **Plan ordering** ||||
| 13 | a new copy survives a refused Goal edit in the same Save | `[28b]` | pass — driven against the real domain with a live Opportunity |
| 14 | the refused Goal edit stays refused, criteria unchanged | `[28b]` | pass — `goal-locked`, `desired` still PSA 9 |
| 15 | the retry creates no duplicate copy | `[28b]`, stabilization `[12]` | pass |
| 16 | an existing-copy edit never falls back to `record-copy` | stabilization `[16]` | pass |
| 17 | the real resulting plan, not an invented fixture | `[26]`–`[28b]`, c33 | pass — `planFrom` + the real commands |
| **Integrity regression** ||||
| 18 | PC still cannot enter `proposeTradeSelection` | stabilization `[1]` | pass |
| 19 | neither-disposition still cannot | stabilization `[3]` | pass |
| 20 | Trade/Sell still eligible on existing rules | stabilization `[2]`, `[6]` | pass |
| 21 | active Opportunity still blocks `updateGoalCriteria` | stabilization `[7]` | pass |
| 22 | True Match exactness unchanged | `[37]`, stabilization `[11]` | pass |
| 23 | no transaction command exposed | `[39]`, stabilization `[18]` | pass — 23, and fourteen shut commands each checked to be real first |

---

## 8. Bite verification

Every load-bearing change was proved to fail when reverted. [F]

| Reverted | Fails |
|---|---|
| the ownership/demand reorder (restore demand-first) | c33 ordering test, `[28b]` |
| `adopt` (the retry binding) | stabilization `[12]`, `[14]`, `[15]` |
| the `offered` bar in `proposeTradeSelection` | stabilization `[1]`, `[3]`, `[4]`, `[5]`, `[6]` |
| the `updateGoalCriteria` lock | stabilization `[7]`, `[10]` |
| **a cascade reintroduced** — a new command filtering `binderEntries` | `[21b]` |

That last one matters most: `[21b]` is the guard against this batch being quietly
undone. It was first written as a regex counting `.filter` calls, which the
adversarial pass showed would miss a cascade spelled any other way. It now splits
the command layer into command bodies and asserts that **only `addBinderEntry`
and `removeBinderEntry` mention `binderEntries` at all** — and a planted
`prunePretend` command makes it fail.

---

## 9. Full suite, build and smoke

```
$ node tests/all.cjs
ALL SUITES PASSED          141 suites · 4,830 tests · 0 failures

$ npm run prod     → PRODUCTION BUILD OK — bytes: 344,515
$ npm run smoke    → PROD SMOKE OK — rendered 83,686 chars
$ npm run build:app -- --allow-unconfigured → main.js 319,112 bytes
```

| Suite | Before | After |
|---|---|---|
| `phase5-four-state-and-binder-invariant` | 50 | **44** |
| `phase5-c31-binder-foundation` | 43 | **41** |
| `phase5-c33-card-specification` | 55 | 55 |
| `phase5-c34b-binder` | 63 | 63 |
| `phase5-collector-identity-stabilization` | 20 | 20 |

---

## 10. Before/after counts

| | `17743d5` | Now | Explanation |
|---|---|---|---|
| Suites | 141 | **141** | none added, none removed |
| Tests | 4,838 | **4,830** | **−8, every one accounted for**: −4 the panel-message and warning tests (`[32]`, `[33]`, `[33b]`, `[33c]`) whose subjects were deleted; −2 the cascade tests in c31 (`C2`, `E2`); −2 net in section C, where 15 guard/prune tests became 13 decoupling tests |
| Failures | 0 | **0** | |
| Exposed commands | 23 | **23** | nothing exposed, nothing removed |
| Domain commands | 51 | **51** | `addBinderEntry` kept its name; only its body shrank |
| Migrations | 13 | **13** | `0013_binders.sql` still last |
| Production build | 345,605 | 344,515 | −1,090 bytes: the guard, the cascade, the warnings |
| `main.js` | 320,784 | 319,112 | −1,672 bytes, same cause |
| Smoke | 83,686 chars | 83,686 chars | identical — no rendered output changed |

**No count moved unexplained.**

---

## 11. Persistence and server diffs

- **`git diff 17743d5 -- persistence/` is EMPTY.** [F] No migration, no schema
  change, nothing encoded about the future architecture.
- **`git diff 17743d5 -- server/` is 5 insertions, 5 deletions in `server/app.js`,
  and is comment-only.** [C] The catalog guard's own comment claimed
  `addBinderEntry` *"is not on the production allow-list yet, so this guard is
  unreachable from a browser today"* — false since C3.3 exposed it, and found by
  the adversarial pass while checking what the removal touched. No behaviour
  changed; I judged a false statement about the product worth correcting in the
  file where a reader meets it. Reverting it is one line if you would rather
  `server/` stayed byte-identical.

---

## 12. What was deleted, and why

Covered line by line in §5. In total: **two domain predicates, one refusal code,
one command guard, one cascade function with four call sites, one client
pre-send check, two UI warnings, one refusal message, and ~280 lines of tests
written to defend them.** Roughly 984 deleted lines against 541 added.

The single sentence behind every one of them: **all of it derived whether
organisation could exist, or continue to exist, from what a canonical card
currently meant in aggregate — and that aggregate is not a thing the product
believes in.**

---

## 13. `binder_entries` remains card-shaped and transitional

[F] The row is still exactly `{binderId, canonicalCardId, addedAt}`, asserted by
`[25c]`, which also asserts that **a Goal and two copies of one card produce one
membership** — the tell that the row does not identify an object, said out loud
so nothing downstream reads more into it. The same test fails if a `goalId`,
`collectorCopyId`, `copyId` or `objectId` ever appears on it without the batch
that is supposed to put it there.

The domain comment on `addBinderEntry` says the same in prose, and names the
three-copies case as the reason the row is on its way to naming the object
instead.

---

## 14–18. Confirmations

- **14 — no `binderId` on Goal or CollectorCopy.** [F] Neither row gained a
  field; `validateWorld` is untouched by this diff.
- **15 — Archive remains.** [F] `setBinderArchived`, `archivedAt`, the UI split
  and the exposure are unchanged; `[25b]` exercises archive, file-while-archived,
  a state removal and unarchive.
- **16 — no search or filtering.** [F] Nothing was added that a future search
  would read; no cross-binder retrieval, no state filters, no Binder types, no
  Trade/Sell binder.
- **17 — Goal cardinality unchanged.** [F] `duplicate-goal` still refuses a
  second Goal per canonical card (`[20]` of the stabilization suite); the unique
  index is untouched; `CardSpecification` was not redesigned for multiple Goals.
- **18 — transaction commands remain unexposed.** [F] 23 exposed, unchanged.
  `[39]` and stabilization `[18]` each check fourteen shut commands, verifying
  first that each name is a real command so the list cannot assert nothing.

---

## 19. Contradictions and unexpected dependencies

**19.1 — the guard was incidentally protecting a different door.** [F] `phase5-c31`
had a test proving a canonical card that does not exist is refused by the
**foreign key** — the documented backstop, since the domain holds no database.
When the four-state batch landed, that test was re-pinned to `card-has-no-state`
on the reasoning that a nonexistent card can have no Goal or copy either. True,
but it meant the guard stood in front of a door whose real protection is the key.
Removing the guard revealed the key still doing its job, and the test is restored
to what it always said. **Nothing was broken; a protection had been obscured.**

**19.2 — `correct-copy` is deal-refusable, which the first reorder assumed
away.** [F] Detailed in §6. The premise I wrote — *"a copy record can only be
refused for something about the copy"* — was false for `updateCollectorCopy`. The
lesson is narrow and worth keeping: **"ownership" and "demand" are not the
categories; who can refuse you is.**

**19.3 — a section heading was lost and restored.** [C] Deleting the two cascade
tests from `phase5-c31` took a `describe` banner with them, silently re-homing
five scenarios under the previous section. Caught by the adversarial pass, since
the suite still passed either way.

**19.4 — no contradiction found that blocks the transitional card-level Binder.**
[F] This was the brief's stop condition. Probed: `addBinderEntry` with `""`,
`null`, `undefined`, `42`, `{}`, `["a"]` all refuse `not-found`; a duplicate is
idempotent; an archived binder accepts; and after every removal command the world
still validates. **No command can now write a world `validateWorld` would
reject** — the rule was always in the command and never in `validateWorld`,
which is why withdrawing it could not strand a stored world.

---

## 20. Exact commits

One commit on `phase-5-four-state`, on top of `17743d5`. Not merged. The SHA is
stated with the bundle.

---

## 21. Ending worktree status

`/home/claude/s1`, `git status --porcelain` **empty**. `persistence/`
byte-identical to `17743d5`; `server/` differs by five comment lines.

---

## 22. Recommendation for the next smallest batch — not implemented

> **Additive object-level Binder membership, beginning with CollectorCopy.**

The ground is now clear: nothing derives validity from card-level state, nothing
prunes, and the plan's ordering rests on refusal classes rather than on a
withdrawn rule. The smallest next step, and it is additive rather than a
migration:

1. **Add `binderId` to CollectorCopy only**, nullable, alongside the existing
   `binder_entries` — `validateWorld` accepting both, and a `ref` + owner-match
   rule per copy. Copies are the easier half: they already have stable ids and a
   per-copy UI, so the panel can file a copy without inventing a way to address
   one.
2. Read from the new field where it is set and fall back to the card-level row
   where it is not, so nothing has to migrate to be correct.
3. Only then **`binderId` on Goal**, the same shape.
4. Only then **migrate and drop `binder_entries`**, by the determinism rule in the
   audit's §11 — and only after the ambiguous-row count has been measured against
   the live database, which no repository reading can supply.

Two decisions are still open and both are cheap to state before step 1: whether a
Collector may hold two sought copies of one card (audit §15.3), and whether
`setCollectorCopyKept` should refuse while a trade package holds the copy
(identity-stabilization §14.2). Neither blocks step 1.

**One caution.** `0012` exists because an absent `attrs` key silently did the work
of a real value and cost a Collector their visible supply. A nullable `binderId`
in `attrs` has exactly that shape: **"no home" and "not yet migrated" must be
distinguishable**, or this repeats that failure precisely.

Explicitly **not** recommended next: exposing any transaction command, removing
Archive, building TP Inventory, a PC view, search, or reopening the six closed
decisions.
