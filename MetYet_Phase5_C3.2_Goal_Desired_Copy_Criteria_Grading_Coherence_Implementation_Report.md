# MetYet — Phase 5 C3.2: Goal Desired-Copy Criteria & Grading Coherence — Implementation Report

## A. Executive result

**PASS.** `npm run verify` exits 0: **124 suites, 4,030 assertions**, production build **344,035 bytes**, smoke **83,686 characters**. No migration was needed and none was added.

All three exit conditions hold, each tested rather than asserted:

> *A Collector's Goal can state desired grade/condition without creating a second Goal or changing whether canonical-card Discovery exists.*

Goal D proves a second Goal for the same card is still `duplicate-goal` however differently described. Goal F proves a Raw/Near Mint Goal still discovers a partner's PSA 8 — and a PSA 10 Goal still discovers a Heavily Played Raw copy.

> *An owned physical copy can no longer enter durable state with contradictory Raw-versus-graded facts through supported write paths.*

Copy C proves it for `addCollectorCopy`, for `updateCollectorCopy` **checked against the merged record**, and for TP inventory on both paths.

> *Existing live C3.1 data remains valid without MetYet inventing grading preferences the Collector never supplied.*

Section D loads a pre-C3.2 Goal and a pre-C3.2 contradictory copy straight from SQL, proves both validate, and proves nothing was invented or rewritten.

**One deviation from the brief, taken with your explicit decision.** §4 says *"New Primary/Secondary Goals require grade."* I checked before implementing: Browse is the Collector app's first live section, its add-goal call sends `{ canonicalCardId, tier }` and nothing else, and `addGoal` is production-exposed — so enforcing that would have made the shipped product's primary action return 409 for every user on deploy, with the control that could satisfy it explicitly deferred to C3.3. You chose **optional now, required in C3.3**. §G has the detail.

---

## B. Verified baseline SHA

Verified, not assumed. The prompt's expectation was correct.

| | |
|---|---|
| `origin/main` | **`202f3166f4f363fe1fa106fc766c18e8ea2f09eb`** — *Merge pull request #66* |
| C3.1 present | **Yes** — `495c19d` and `b8a9522` are ancestors of main |
| `0013_binders` | Present, and the newest migration |
| Branch | `phase-5-c3-2-goal-copy-criteria`, worktree `/home/claude/c32`, from `202f316` |

**Baseline honesty, again.** I started a baseline verify and began editing before it finished, so that run failed on my own half-applied changes. That is the second time; I will run it to completion before touching anything next time. The baseline content at this SHA is C3.1's merged head, whose own final verify was EXIT 0 / 123 suites / 4,005 assertions / 343,142 bytes — the figures this batch is compared against. The end-state verification below is clean.

---

## C. Grading semantic chosen, and why

**One function, `D.gradingProblem(facts)`, asked by every write path.** It returns `null` when a grading pair is sayable, or a reason.

```
Raw          requires a condition       raw alone says the card is ungraded and
                                        nothing about its state — half a sentence
PSA 1..10    carries NO raw condition   the grade IS the assessment; a second,
                                        contradicting one is not a refinement
neither      is fine                    "unstated" is a real answer and always
                                        was: a copy nobody has described is not
                                        a raw copy
```

Three decisions behind it.

**1. The stored string stays.** `grade` remains `"Raw"` or `"PSA 9"` in `attrs`. Splitting into `gradingState` / `grader` / numeric grade would migrate every inventory and collector-copy row already written, plus `identityFrom`, the prototype's picker and both presenters — and C3.2's subject is coherence, not representation. `gradingOf` already exists as the seam that makes that migration cheap when evidence asks for it; this batch spends none of it. **No grader was added, no registry, no range.** The parser can *read* `BGS 9.5`; `gradingProblem` refuses it, and a test asserts the offered vocabulary did not widen.

**2. One rule, not three lists.** Before C3.2 four command sites each asked two half-questions — is the grade in the list, is the condition in the list — and none asked the one that mattered. All four are gone; a test asserts no command references `GRADED_VALUES.includes` or `CONDITION_VALUES.includes` any more, and that at least five call sites ask the single rule.

**3. A contradictory record is reported, not reinterpreted.** `D.gradingRead(copy)` returns `gradingOf`'s reading plus a `problem`, and — crucially — keeps the condition instead of nulling it. Before C3.2 a `PSA 9 / Damaged` row read back as graded with `condition: null`, so a screen would have shown a clean "PSA 9" while the database said something else. That is the invariant the brief names: *durable data is validated by one rule, and presentation cannot silently reinterpret a contradictory fact.*

The refusal is its own code, `grading-incoherent`, rather than the `not-found` the old half-checks answered with — which told a caller nothing about what was wrong.

**One case deliberately left permissive:** a condition with no grade (`{ condition: "Damaged" }`) is sayable. It reads as `state: "unstated"` with a condition, which is honest, and requiring a grade whenever a condition appears would be a new rule that could invalidate live inventory. Noted in §P.

---

## D. Goal desired-copy criteria

A Goal may now carry `desired: { grade, condition }`.

**The name is doing work.** `goal.grade` and `copy.grade` would read alike and mean "hoped for" and "is" — the kind of collision that produces a bug nobody catches in review. A test asserts the Goal record never grows a bare `grade` or `condition` key of its own.

| Requirement | Status |
|---|---|
| `addGoal` persists criteria | Goal A, including the raw JSONB |
| criteria round-trip | Goal A — database → world → projection |
| `updateGoalTier` preserves them exactly | Goal E, both directions |
| tier changes do not rewrite criteria | Goal E — `createdAt` also unchanged |
| Binder membership unaffected | Goal G |
| Goal removal does not touch Binder or copies | Goal G |
| projection exposes criteria only where the Goal already appears | §L |
| no second desired-copy aggregate | no new record, no new table, no new command |

**The silent drop is fixed loudly.** A payload carrying bare `grade`/`condition` used to return 200 and discard them. It is now refused — a success that loses data is worse than a refusal, because nothing says so. So is a non-string value inside `desired`: `{ grade: 9 }` would otherwise have fallen through `gradingProblem`'s string handling and been written as *no criteria*, which is the same defect wearing a different hat. That one I found while writing the tests.

**Criteria are written only when stated.** An absent `desired` stays absent — never `{ grade: null, condition: null }`, which would look like an answer. An empty object is the same as none.

**No `updateGoalCriteria` command was added**, as the brief directs. C3.3 may reveal the right interaction; a command with no surface is not shipped.

---

## E. CollectorCopy coherence correction

`addCollectorCopy` and `updateCollectorCopy` now refuse an unsayable pair, and **the update path is checked against the merged record**.

That last point is the one that would have been missed by a careless fix. A Raw / Near Mint copy patched with `{ grade: "PSA 9" }` sends no condition — but the copy still has one, and the result is exactly the contradiction the batch exists to remove. What has to be sayable is the card *as it will be afterwards*. Copy C tests precisely this case.

`offered` is untouched by any of it, and Copy D proves a grading correction leaves offering, the certificate, the reference value, a partner's Interest and the derived deal status all exactly as they were.

**`updateCollectorCopy` was not exposed to solve this.** It remains off the production allow-list, as C2 left it, and is exercised past the door.

---

## F. TP Inventory impact and decision

**The same one rule, no redesign.** `addInventoryCopy` and `updateInventoryCopy` were asking the same two half-questions and accepting the same contradiction; both now call `gradingProblem`, and the update path is likewise checked against the merged record.

This was necessary rather than optional. The brief asks for *one* authoritative grading semantic, and leaving a partner's shelf on a second, laxer rule would have meant a TP could stock a `PSA 9 / Damaged` copy that a Collector could not own — and that copy would then flow into Discovery and a trade package. The correction is four lines and changes no other inventory behaviour: `ask`, `cost`, `acquired`, `cert`, `note` and `photos` are untouched.

---

## G. Historical compatibility

The rule, stated once and tested three ways: **absence means the Collector has not said, and MetYet does not fill it in.**

**Goals.** Criteria are optional. Every Goal written before C3.2 has no `desired`, and so does every Goal added from today's Browse. Unspecified is distinguishable from every value it could have been given — in particular it is **not** Raw / Near Mint, which is the inference the brief forbids and the one a careless default would have made. A test asserts a pre-C3.2 Goal inserted as raw SQL loads, validates, saves again, and grows no criteria.

This is also why grade is not required yet. Requiring it would break the live add-goal path (§A); **C3.3 ships the Card Specification control and turns the requirement on in the same batch.** A named test pins that today's no-criteria path still works, so whoever flips it will see exactly what they are changing.

**Copies.** A contradictory pair is theoretically live, because the door was open from C2 through C3.1. Such rows:

- **load**, and `validateWorld` accepts them — making them invalid would mean one bad row from last month locks a Collector out of everything, which is the one thing a compatibility rule must not do;
- are **not auto-repaired** — `PSA 9 / Damaged` does not say which half the person meant, and guessing would be MetYet inventing a fact about somebody else's card;
- **read honestly** — `gradingRead` names the contradiction and keeps both halves visible;
- **cannot be edited until made coherent** — editing the certificate alone is refused, because the result would still be contradictory. The correction is one patch away and is tested.

`validateWorld` therefore enforces coherence on **Goal criteria** (a new field, so no historical data exists) but not on **copies** (where it does). That asymmetry is deliberate and is the honest place to draw it.

---

## H. Migration decision

**None, and none is needed.**

`desired` lives in the Goal's `attrs`, which is where `tier`, `note`, `since` and `createdAt` already live — `tier` is a generated column read *from* attrs. A new attrs key needs no DDL. Coherence is a validation rule, not a shape.

And there is nothing to backfill: a Goal whose owner never stated a preference has no true value to write, and a copy whose pair contradicts itself has no repairable one. A migration here would either fabricate data or mark the batch for its own sake, and the brief forbids both.

A test asserts `0013_binders` is still the newest migration, so this decision cannot be quietly reversed.

---

## I. Command and API changes

| Command | Change | Exposed? |
|---|---|---|
| `addGoal` | accepts and persists `desired`; refuses bare grade/condition; refuses unsayable or malformed criteria | already, unchanged |
| `updateGoalTier` | unchanged — preserves criteria by construction (it patches named fields) | already, unchanged |
| `addCollectorCopy` | one rule instead of two half-checks | already, unchanged |
| `updateCollectorCopy` | one rule, merged | **no**, as C2 left it |
| `addInventoryCopy` | one rule | already, unchanged |
| `updateInventoryCopy` | one rule, merged | already, unchanged |

**The production allow-list is byte-identical at nine commands**, pinned exactly by a test, which also asserts no `updateGoalCriteria` was added and that `updateCollectorCopy` was not exposed to solve grading.

One new refusal code: `grading-incoherent`.

---

## J. Discovery proof

**Unchanged, and asserted from both directions plus the source.**

- A Goal wanting Raw / Near Mint **still discovers** a partner's PSA 8 of that canonical card.
- A Goal wanting PSA 10 **still discovers** a Heavily Played Raw copy.
- A *different printing* still discovers nothing — the exact-canonical rule was not loosened either.
- `domain/metyet-discovery.js` contains no reference to grade, condition or `desired`, asserted against the source with comments stripped.

No match score, compatibility state, close-match logic, ranking or grade filter exists anywhere. Criteria are context for a human deciding whether to start a conversation, not a filter for a machine deciding whether they may.

---

## K. Binder independence proof

Goal G: a card is filed in a Binder and carries a Goal with criteria. The tier changes — membership unchanged. The Goal is removed entirely — membership unchanged, the Binder still there. A separate test confirms a partner still receives no binder name, id or membership.

---

## L. Privacy proof

`desired` joined `GOAL_FOR_PARTNER` and nothing else moved.

| Seat | Receives criteria |
|---|---|
| the owning Collector | yes, whole |
| a related Trusted Partner | yes — a Goal is already how they learn about demand, and which copy is wanted is part of the same sentence |
| an unrelated partner | **no** — asserted against the whole serialised body, which contains no `Near Mint` |

No new seat, no new record, no new rule. Binder organisation is still projected to nobody; unoffered copies are still not supply; TP private inventory fields are untouched.

---

## M. Tests and verification counts

```
npm run verify   EXIT 0
  test           ALL SUITES PASSED — 124 suites, 4,030 assertions
  prod           PRODUCTION BUILD OK — bytes: 344035
  smoke          PROD SMOKE OK — rendered 83686 chars
  previews       both preview bundles written
```

Against C3.1's merged head: 123 → **124** suites, 4,005 → **4,030** assertions (+25), 343,142 → **344,035** bytes.

**New suite: `tests/phase5-c32-goal-criteria-grading.cjs`, 25 tests** — A the rule, B goal criteria, C copy coherence, D compatibility, E what was not touched. Every canonical test the brief names is present: Goal A–G and Copy A–D, plus the compatibility fixtures.

### One superseded assertion, restated

**`phase5-b7-collector-goals` — "grade and condition are not demand, and no band was invented"**

*What it protected*, in two halves: that a Goal was demand for a printing and knew nothing about a physical copy; and that nobody had invented a grade **band** — "PSA 9 or better", "NM+" — which would turn stated demand into a matching rule.

*Why the first half is no longer correct*: which copy a Collector is trying to get is a real part of the ask, and a Goal could not say it. C3.2 adds `desired`.

*What replaces it, and why it is stricter*: the band half is **untouched** and was always the load-bearing half. Three assertions are added — criteria live under `desired` and never as a bare `grade`/`condition` on the Goal record; the discovery module still reads no grading at all; and the offered vocabulary did not widen.

**Nothing was weakened.** Four failures during development were all my own test's fault and were fixed rather than accommodated: a non-string grade that revealed a real silent-drop hole in my own implementation (now refused), and three fixtures that set a mirror column without its `attrs` key.

---

## N. Files changed

8 files, +931 / −17.

| File | Change |
|---|---|
| `tests/phase5-c32-goal-criteria-grading.cjs` | **new** — 25 tests |
| `domain/metyet-domain.js` | `gradingProblem`, `gradingRead`, `GRADING_PROBLEM`, the `grading-incoherent` refusal |
| `domain/metyet-commands.js` | `addGoal` takes `desired`; four copy write paths ask the one rule, two of them merged |
| `domain/metyet-world.js` | validates `desired` when present |
| `domain/metyet-projection.js` | `desired` on `GOAL_FOR_PARTNER` |
| `domain/README.md` | the two sentences, the one rule, the compatibility rule, the no-migration reason |
| `tests/phase5-b7-collector-goals.cjs` | the superseded pin, restated |
| `tests/all.cjs` | registers the new suite |

No migration, no client file, no server route, no allow-list change.

---

## O. Explicit non-goals confirmed absent

| Non-goal | Evidence |
|---|---|
| Card Specification UI | no `client/` file changed |
| Browse / Binder UI | untouched |
| Binder command exposure | allow-list pinned at nine; binder commands proved `command-unavailable` |
| Defaults / session controls / scroll restoration | none |
| Want/Own two-axis UI | no UI at all |
| TP Make an Offer, multi-card offers, cash/trade percentages | untouched |
| Reputation / scoring | none |
| Automatic Interest cleanup | none; Copy D asserts Interest survives a grading correction |
| Grade-filtered Discovery, matching, ranking, acceptable ranges | asserted absent in source and behaviour |
| Multiple Goals per canonical card | Goal D |
| New grading companies | vocabulary pinned |
| Provider / catalog ingestion | no catalog file changed |
| Opportunity / Deal redesign | untouched |
| Legacy trade `binderId` rename | untouched |

---

## P. Deferred defects and debt

1. **A condition with no grade is permitted** (`{ condition: "Damaged" }`). It reads as `unstated` with a condition, which is honest. Requiring a grade whenever a condition appears would be a new rule that could invalidate live inventory rows, so it is left — decide with pilot evidence.
2. **`gradeLine` / `isGraded` are still duplicated in both `client/*/present.js`**, each with its own `/^raw$/i` test, and neither knows about `problem`. The client cannot import the domain, so **a contradictory copy will still render as a clean "PSA 9" on screen** — the domain now reports it, but nothing reads the report. The fix is to carry the parsed shape across in the projection. **This is the most consequential item on this list**; it belongs to whichever batch next touches presentation.
3. **`metyet.interests` has no database uniqueness** on `(partner_id, binder_id)`. Unchanged from C3.1.
4. **Three C2 commands remain exposed ahead of their screen** (`my-cards` is still in `DEFERRED_SECTIONS`). Unchanged.
5. **Scroll position does not survive a section change.** Relevant to C3.3.
6. **`identityFrom` still folds grade and condition into card identity** on the legacy prototype path, contradicting the canonical model. Demo-only; flagged since the C3 checkpoint.

---

## Q. Branch and commit

| | |
|---|---|
| Branch | `phase-5-c3-2-goal-copy-criteria` |
| Base | `202f3166f4f363fe1fa106fc766c18e8ea2f09eb` |
| Commit | **`2a5e988`** — *Phase 5 C3.2: Goal desired-copy criteria and grading coherence* |

Only C3.2 work is committed; untracked `Claude outputs/` material was not touched. **Not merged.**

---

## R. Exact handoff

Push is unavailable from this environment and no credentials were requested or handled — the cloud proxy refuses a credential for this repository, and the Mac has no credential helper. After importing the bundle:

```bash
cd ~/Documents/GitHub/metyet-app
git fetch <bundle> HEAD:phase-5-c3-2-goal-copy-criteria
git push -u origin phase-5-c3-2-goal-copy-criteria
```

Then open a PR against `main`. **Do not merge as part of this batch.**

**C3.3 — Card Specification UX** is next, and inherits two things from here:

1. **It owns the flip.** When Browse gains a grade control, `addGoal` should start requiring `desired` on new Goals. The test that currently pins the optional path names C3.3 so the change is deliberate.
2. **It should fix §P item 2.** The domain now reports a contradictory grading record; until a presenter reads that report, the screen still shows a clean answer for a record that disagrees with itself — which is half the invariant this batch set out to establish.
