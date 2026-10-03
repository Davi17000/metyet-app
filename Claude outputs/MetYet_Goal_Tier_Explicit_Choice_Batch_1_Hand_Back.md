# MetYet — Goal Tier Explicit Choice — Implementation Batch 1 — Hand-Back

**Branch:** `phase-5-four-state`
**Starting SHA:** `5314f5d` (Docs: durable four-state invariant + Binder target architecture audit)
**Final SHA:** `eaf446c` (Goal tier is an explicit choice: refuse a malformed tier instead of defaulting it)

**Stop condition met.** A malformed Goal tier can no longer silently become Secondary. Every valid Goal behaviour, every transaction lock, and every unrelated product behaviour is unchanged. Batch 2 has not been started.

**Read section 10 first if you read nothing else.** Four existing test suites were changed. None of them is in the non-goals list, but all four are areas this batch was not otherwise touching, and one of them is a structural guard that the fix tripped as a false positive.

---

## 1. Starting SHA and final SHA

| | |
|---|---|
| Starting | `5314f5d` |
| Final | `eaf446c` |
| Commits added | 1 |
| Merged to `main` | No |
| Combined with Binder or CollectorCopy disposition work | No |

---

## 2. Exact files changed

```
 client/collector/CardSpecification.jsx     |   5 +
 domain/metyet-commands.js                  |  48 +++-
 domain/metyet-domain.js                    |  29 +++
 tests/all.cjs                              |   2 +-
 tests/phase3-domain-readiness.cjs          |  24 +-
 tests/phase3-persistence.cjs               |  40 +--
 tests/phase3-server.cjs                    |  32 ++-
 tests/phase5-b7-collector-goals.cjs        |  10 +-
 tests/phase5-goal-tier-explicit-choice.cjs | 391 +++++++++++++++++++++++++++++
 9 files changed, 544 insertions(+), 37 deletions(-)
```

Three of those nine are the correction itself; one is the new suite; one is its registration; four are the re-pinning described in section 10.

**`domain/metyet-domain.js`** — added `REFUSE.invalidTier` and the closed vocabulary `GOAL_TIERS` (frozen, exported).
**`domain/metyet-commands.js`** — replaced the coercion in `addGoal` and in `updateGoalTier` with a gate.
**`client/collector/CardSpecification.jsx`** — one entry in the `WHY` refusal-message map, so the new code cannot reach a Collector as a blank. The panel cannot currently produce this refusal (see section 4); the entry is a backstop and is commented as one.

---

## 3. Refusal code, and why that one

**`invalidTier: "invalid-tier"`.** One code, both writers.

It is named for `invalid-amount`, which sits two lines above it in `REFUSE` and answers the same shape of question about a number: *the request named something the domain has no value for*. The repository already distinguishes that class from `not-found` (the thing you named does not exist) and from the lock codes (the thing exists and may not be changed right now), and a malformed tier is squarely the first kind.

One code rather than two — a separate `missing-tier` for absence — because the product rule is a single rule. A Goal's tier is chosen; a request that did not choose one and a request that chose `"banana"` have failed at the same thing, and splitting them would invite a caller to treat absence as the softer case, which is exactly the habit the batch exists to end.

The vocabulary itself is `GOAL_TIERS = ["primary", "secondary"]`, frozen, matching the existing `GRADED_VALUES` / `CONDITION_VALUES` pattern in the same file. See section 10 for why it is a second copy of a list `metyet-world.js` already holds, and what should be done about that.

Nothing new was invented: no new abstraction, no validation layer, no schema. Both gates are one line, in the existing command/result architecture, returning `refuse(...)` exactly as their neighbours do.

---

## 4. Previous behaviour versus new behaviour

Both writers read `tier === "primary" ? "primary" : "secondary"`.

| Requested tier | Before | After |
|---|---|---|
| `"primary"` | Primary, 200 | **unchanged** — Primary, 200 |
| `"secondary"` | Secondary, 200 | **unchanged** — Secondary, 200 |
| key omitted | Secondary, 200 | `invalid-tier`, nothing written |
| `undefined` | Secondary, 200 | `invalid-tier`, nothing written |
| `null` | Secondary, 200 | `invalid-tier`, nothing written |
| `""` | Secondary, 200 | `invalid-tier`, nothing written |
| `"   "` | Secondary, 200 | `invalid-tier`, nothing written |
| `"Primary"` / `"PRIMARY"` | Secondary, 200 | `invalid-tier`, nothing written |
| `"Secondary"` | Secondary, 200 | `invalid-tier`, nothing written |
| `" primary "` | Secondary, 200 | `invalid-tier`, nothing written |
| `"banana"` | Secondary, 200 | `invalid-tier`, nothing written |
| `0`, `1`, `true` | Secondary, 200 | `invalid-tier`, nothing written |
| `["primary"]`, `{ tier: "primary" }` | Secondary, 200 | `invalid-tier`, nothing written |

**What that cost, before.** `INVARIANTS.goalIsPursued` is `tier === "primary"`, and `startOpportunity` consults it: a Secondary Goal cannot begin a deal. So a fumbled field — a client shipped with a renamed constant, a mis-cased string out of an import, a `tier` read from the wrong object — silently closed the only door a Goal exists to open, and reported success while doing it.

**`validateWorld` was not asleep, but it could not help here.** It has required the exact two strings since it was written, and it does real work on hand-built seeds and on worlds read back from persistence (`phase3-domain-readiness` already feeds it a bad tier and expects rejection). What it could not do is answer a *caller*: it runs on save and on load, so a malformed tier arriving through a command was normalised long before the validator saw the world. The DB is weaker still — `goals.tier` is `generated always as (attrs ->> 'tier') stored`, nullable, no `CHECK` — and was not touched.

**No production caller changes behaviour.** Every call site passes an explicit legal tier today: `client/commands.js:151,173`; the Card Specification panel's `WANTS` list is the closed `none` / `secondary` / `primary`, and both `start-looking` and `how-hard` are gated on `want !== "none"`; `SignIn.jsx:237` passes that value straight through; the prototype's `AddGoalPicker`, `MetYetCollector.jsx:3301/3305/5808/5810/5811` and `src/MetYet.jsx:2959` all pass literals. The only callers that relied on the default were tests — section 10.

---

## 5. Guard and refusal ordering

### `updateGoalTier` — the ordering the brief asked about

Order is now: `not-found` → `not-owner` → **`invalid-tier`** → idempotent no-op → `goal-locked` demotion lock.

**Before the lock. This is observable, and it is the decision.**

Previously, a Primary Goal held by an active Opportunity, asked to become `"banana"` or `"Secondary"`, coerced to `"secondary"`, hit the lock, and answered `goal-locked`. Three things are wrong with that:

1. **It is untrue.** `goal-locked` is a claim about the world — *this Goal is in a live deal, so it may not be demoted*. The request named no tier and therefore asked for no demotion. The caller was told to end its negotiation when what it had to fix was its payload.
2. **It is unstable.** The identical malformed request answered `goal-locked` or (before this batch) succeeded-as-Secondary depending on whether a partner happened to have an Opportunity open. That is not a fact about the request.
3. **One capital letter used to be a valid demotion request.** `"Secondary"` is the case that shows it most sharply, and it is in the test.

The gate sits *after* `not-found` and `not-owner` because those settle whether this caller may address this Goal at all: without a Goal you may speak for, there is nothing for a tier to be wrong about. That is the command's own existing order, not a new principle.

**Before the no-op — not observable, and not claimed to be.** The audit brief asked for the ordering to be reasoned rather than assumed, so this half is stated honestly: `next` is now the caller's own value, so a malformed tier can never equal a stored one and the no-op simply falls through to the gate. Placing the gate after the no-op would give identical answers for every world `validateWorld` permits. It sits first because the two belong together — what the request said, then what the world says about it — not because anything forces it. The code comment says exactly this.

The lock itself is untouched: a real demotion (`tier: "secondary"`) under a live deal still answers `goal-locked`, and a promotion under a live deal is still allowed. Both are pinned.

### `addGoal` — the ordering, and a correction I made to my own first attempt

Order is now: `not-owner` → **`invalid-tier`** → grading-shape checks → `not-found` → `duplicate-goal` → `ctx.id("g")` → `criteria-required` → write.

My first implementation placed the gate **last**, immediately before the goal row, on the reasoning that a request already wrong in an older way should keep its old answer. Adversarial review killed that, on two counts, and it was right on both:

- **It contradicted the reasoning I had just used for `updateGoalTier`.** There I argued a malformed request must not get an answer that depends on world state. Placed last, `addGoal` did exactly that: `{ tier: "banana" }` answered `duplicate-goal` or `invalid-tier` depending on whether the Collector already had a Goal for that card. Both commands cannot be right; the stability argument is the better one, so `addGoal` moved to match.
- **It made `invalid-tier` the one `addGoal` refusal that leaves a mark.** `ctx.id("g")` calls `newId`, which advances the runtime's id sequence the instant it is called. A gate below it meant a rejected request burned a Goal id — a gap in the sequence caused by something that never happened. Scope item 7 is *a refusal does not mutate*; an id sequence is something. The gate is now above the mint, and `[4b]` pins it with a counting runtime.

The seat check still answers first, because a partner has no business naming a Collector's intent at all. Every other `addGoal` refusal — `grading-incoherent`, `not-found`, `duplicate-goal`, `criteria-required` — is exactly where it was for any request carrying a legal tier, and that is pinned too: the gate added an answer, it did not take one away.

---

## 6. Tests added and changed

### Added: `tests/phase5-goal-tier-explicit-choice.cjs` — 16 assertions, registered in `tests/all.cjs`

**A. `addGoal`**
- `[1]` both tiers accepted and stored exactly as chosen; world stays valid.
- `[2]` table-driven over 15 malformed shapes (omitted, `undefined`, `null`, `""`, whitespace, `"Primary"`, `"PRIMARY"`, `"Secondary"`, `" primary "`, `"banana"`, `0`, `1`, `true`, array, object) — each refused `invalid-tier`, each leaves the serialised world byte-identical, no Goal written.
- `[3]` the legacy `cardId` demo path is held to the same rule. It is exempt from the criteria requirement on the record; it is not exempt from this one, because a tier is not a criterion — it is the meaning of the Goal.
- `[4]` the answer does not depend on the world: four payloads malformed in their tier *and* in something the command used to answer for all say `invalid-tier`; the seat check still answers first; and with a legal tier all four older refusals are exactly where they were.
- `[4b]` a refused Goal consumes no runtime id — driven through `C.execute` with a counting runtime.

**B. `updateGoalTier`**
- `[5]` Primary → Secondary and Secondary → Primary.
- `[6]` re-stating the current tier is still a no-op that writes nothing (load-bearing: the Card Specification panel re-sends its plan on retry and must not churn `since`).
- `[7]` the same 15-shape table — each refused, the Goal still Primary, world byte-identical.
- `[8]` `not-found` and `not-owner` still settle addressing before the tier is read.

**C. the locks**
- `[9]` demotion under a live deal still `goal-locked`; promotion under a live deal still allowed (the half a no-op assertion would miss).
- `[10]` the ordering pin: seven malformed values on a locked Primary Goal answer `invalid-tier`, not `goal-locked`; nothing moves; and a real demotion still answers `goal-locked`.
- `[11]` `removeGoal` and `updateGoalCriteria` still answer `goal-locked`.
- `[12]` a Secondary Goal still cannot begin a deal and a Primary one still can — the reason the tier is worth refusing over.

**D. the vocabulary**
- `[13]` reads `GOAL_TIERS` out of `metyet-world.js`'s source and requires it to equal the domain's, so the two copies cannot drift.
- `[14]` the old ternary is forbidden in source, and each writer is sliced out and required to carry its own gate — so a correctly-guarded third writer added later passes rather than failing, which a bare count would not.
- `[15]` the refusal has a Collector-facing message.

`withDeal()` asserts `D.goalLocked` directly rather than trusting its own fixture; `[12]` proves its `startOpportunity` would otherwise have succeeded. No test re-implements the code it tests.

### Changed: four existing suites — see section 10

---

## 7. Bite verification

Five mutations, each applied to the shipped code, suite run, code restored. Every one drew blood.

| # | Mutation | Result |
|---|---|---|
| 1 | Restore `addGoal`'s coercion | 3 FAIL — `[2]`, `[3]`, `[14]` |
| 2 | Restore `updateGoalTier`'s coercion | 3 FAIL — `[7]`, `[10]`, `[14]` |
| 3 | Let the lock answer before the tier gate (the alternative ordering in §5) | 2 FAIL — `[10]`, `[14]` |
| 4 | Add a third value to the domain's `GOAL_TIERS` only | 1 FAIL — `[13]` |
| 5 | Move `addGoal`'s gate back below `ctx.id("g")` | 2 FAIL — `[4]`, `[4b]` |

Bites 3 and 5 are the ones worth noting: they prove the two ordering decisions in section 5 are genuinely pinned and not merely asserted in prose.

**Two tests do not bite, by design, and are not claimed to.** `[4]`'s "with a legal tier the older refusals are where they were" half and `[8]` both pass against the old code. They guard against a *future* reorder, which is what §4 of the brief asked for. `[6]` likewise.

---

## 8. Full suite, build, smoke

| | |
|---|---|
| `node tests/all.cjs` | **142 suites, 4846 assertions, 0 failed — ALL SUITES PASSED** (exit 0) |
| `npm run build` | OK |
| `npm run prod` | PRODUCTION BUILD OK — 344,646 bytes |
| `npm run smoke` | PROD SMOKE OK — rendered 83,686 chars |

The full suite was run twice: once to find the breakage in section 10, and once clean after the repairs, with nothing else touching `dist/` during the run. The clean run is the one quoted.

---

## 9. Command, migration and build counts

| | `5314f5d` | `eaf446c` | Movement |
|---|---|---|---|
| Exposed commands | 23 | 23 | none |
| Domain commands | 51 | 51 | none |
| Migrations | 13 | 13 | none |
| Refusal codes | 40 | 41 | **+1** — `invalid-tier` |
| Prod bundle bytes | 344,515 | 344,646 | **+131** |

The +1 is the batch's whole purpose. The +131 bytes are the single Collector-facing message string added to the `WHY` map — no other client code changed, and the domain is not in the production bundle's growth path here.

---

## 10. What was *not* broadened — and the four suites that were changed

### Not broadened

Confirmed by `git diff 5314f5d..HEAD`: nothing outside the nine files moved. Specifically untouched — `CollectorCopy`; `offered` / `keeping`; `unstated` on CardSpecification; PC XOR Trade/Sell; `validateWorld`; the persistence schema and every migration; `binder_entries`; object-level Binder membership; CardSpecification's Binder behaviour; Goal criteria semantics and the temporary criteria lock; Goal cardinality; Opportunity and transaction progression; search, filter, Binder Delete and Archive. No UI was redesigned; the single client change is one string in a message map. The four-state salvage, the offered-only trade-package bar and the draft → minted CollectorCopy retry binding are all intact and still covered by their own suites.

### Changed anyway — called out as the brief requires

**a. Twelve assertions across `phase3-server`, `phase3-persistence` and `phase3-domain-readiness` called `addGoal` with no tier.**

They are about the HTTP boundary, the world lock and versioning, and the injected runtime; `addGoal` is scaffolding in all of them, and they relied on the default the batch exists to remove. Each payload now states `tier: "primary"`, and each file carries a short note saying why the tier is there and that it is load-bearing for nothing. No assertion's meaning changed; all three suites are back at their `5314f5d` counts (50/0, 47/0, 95/0).

This is the honest shape of the change: those tests were *directly contradicted* by an intentional product decision, so they were re-pinned rather than worked around.

**b. `phase5-b7`'s "the duplicate test is exact identity, never a resemblance" guard failed as a false positive.**

It slices `addGoal` out of the source and forbids `includes(`, `toLowerCase(`, `similar`, `fuzzy`, `distance` anywhere in it — a guard against the duplicate rule ever softening into fuzzy matching. `D.GOAL_TIERS.includes(tier)` is the first `includes(` that body has ever contained.

It was not loosened. The test now requires the tier gate to appear exactly once, removes that one occurrence by name, and runs the original regex over the rest — so a *second* `includes(`, which is the shape a resemblance rule would actually take, still fails it. The protection is intact and now says what it means.

### Two things found during review and deliberately left alone

- **`GOAL_TIERS` exists twice** — `metyet-domain.js` and `metyet-world.js:74`. `metyet-world.js` already imports the domain and could read the exported constant, which would make this single-sourced and make test `[13]` unnecessary. Changing `validateWorld`'s file is an explicit non-goal, so the copies stand and `[13]` holds them level. **Collapsing them is one line and belongs to a batch permitted to edit that file.**
- **`tierLabel` renders an unknown tier verbatim** to both a Collector and a Trusted Partner (`client/collector/present.js:244`, `client/tp/present.js:256`), and `src/MetYet.jsx:2215` builds prototype goal rows directly from a seed rather than through `addGoal`. Both are pre-existing, both are well-formed today, and neither is reachable from the defect this batch closed. Reported, not fixed.

---

## 11. `git status --porcelain`

```
```

Empty. Worktree clean at `eaf446c`. (This document is delivered alongside; if it is committed it will be a separate docs commit, as with the previous batches.)

---

## 12. Bundle and push status

**Push remains unavailable, and was not worked around.** Re-verified at the end of this batch:

```
remote: access denied by the git proxy: Davi17000/metyet-app is not in this
session's authorized repository set, so the proxy will not inject a credential
for it.
fatal: ... The requested URL returned error: 403
```

The refreshed bundle covers `64f88e1..HEAD` — the full branch, so it applies the same way every previous hand-back's bundle did — and carries seven commits:

```
eaf446c  Goal tier is an explicit choice: refuse a malformed tier instead of defaulting it
5314f5d  Docs: durable four-state invariant + Binder target architecture audit
0e2cce8  Docs: CollectorCopy Binder cutover design audit
b68b1ae  Phase 5: salvage the four states, decouple the Binder
17743d5  Phase 5: three integrity fixes before the Binder migration
5931dbb  Phase 5: only the four states qualify, and the last one leaving takes the binders
f43d946  Phase 5: the four-state model, and the truth-telling cleanup
```

**Commit to fetch: `eaf446c7baacca40a866c00c186599734992e1c9`.** The bundle's SHA-256 is reported with the file itself.

---

## Batch 2 has not been started.
