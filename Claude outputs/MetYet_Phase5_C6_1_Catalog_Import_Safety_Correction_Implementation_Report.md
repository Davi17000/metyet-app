# MetYet — Phase 5 C6.1: Catalog Import Safety Correction

## 1. Baseline

Branch `phase-5-c6-1-catalog-import-safety`, cut from
`df84c0328fac783b8131c0d51427e86a890d8045` — the merge of PR #72 (C5). The gate
matched exactly before anything changed:

```
130 suites / 4,317 tests      ALL SUITES PASSED
PRODUCTION BUILD OK — bytes: 345,079
PROD SMOKE OK — rendered 83,686 chars
newest migration: 0013_binders.sql
allow-list: 18
```

Tracked worktree clean. The C6 checkpoint's two findings were treated as
hypotheses and both were re-measured against the code before anything was
edited.

---

## 2. Reproducing the defect, before editing

With the real runner, real PGlite, real migrations, and this batch's own
vocabulary and cards — nothing borrowed from an existing fixture. In every case
a **valid record was placed first**, so "the valid row did not land" could not be
explained by ordering.

| Case | Classified | Run status | Cards written |
|---|---|---|---|
| **A** — no `providerCardId`, no `cardName` | `quarantined incomplete-record` | **failed** | **0** |
| **B** — no `providerCardId`, no `collectorNumber` | `quarantined incomplete-record` | **failed** | **0** |
| control — no `providerCardId` only | `rejected unkeyable-record` | completed-with-quarantine | 1 |

Both failing runs named the same cause:

```
failedBatch : catalog: a source mapping needs its provider and card id
```

So the hypothesis held in full: the malformed row is routed to quarantine,
persistence then fails because it cannot be keyed, and the transaction takes the
valid row with it. The control confirms C4's own proof — a record missing *only*
the provider card id is still rejected — and that proof is preserved.

**And the blast radius is larger than one batch.** A batch fault does not skip
and continue; it returns the summary (`server/catalog/import.js`), so every
later batch is never attempted. Measured separately at 601 records with the bad
row at index 10 and the default batch size of 500: 600 mappable, **0 written**.
For the English Pokémon catalogue that is every printing, lost to one row.

---

## 3. Root cause

Two gates in `server/catalog/translation.js`, in the wrong order.

The `incomplete-record` check ran **first**. The `unkeyable-record` rejection —
written by C4 for exactly this situation — ran **second**, so it only ever fired
for a record that was otherwise complete. A record missing the card id *and* a
number or a name matched the incomplete test, went to quarantine, and threw
inside the batch transaction, because `source_mappings` is keyed by
`(provider, provider_card_id, provider_variant_key)` and there was no id to key
it by.

The comment above the rejection described the intended behaviour correctly —
*"before C4 that refusal arrived as a thrown TypeError from inside a quarantine
write, which is the one place a quarantine must never fail"* — and the code
never reached it in the case that mattered.

**Why C4's own tests missed it**: the test named *"a record with no provider card
id is rejected"* (`tests/phase5-c4-catalog-import.cjs:215-232`) supplies
`collectorNumber` and `cardName` — precisely the two fields that make the id gate
reachable. The defect sat directly underneath the test written to catch it.

---

## 4. The fix

**The `providerCardId` gate is asked first.** A row that cannot be durably keyed
is classified before any path can attempt to persist it. Nothing else about
either gate changed: the same `text()` helper decides what counts as a usable id
(so blank and whitespace-only are no id at all), the same reason constants are
used, no repository method is reached, no id is fabricated, and it is not an
operational error.

**The incomplete gate's detail was corrected.** It said *"a source record needs a
provider card id, a collector number and a card name"* — no longer true of a gate
that no longer checks the id, and it sent an operator looking for a field that
was there. It now reads *"a source record needs a collector number and a card
name"*.

The quarantine and rejection concepts are unchanged and were not redesigned:
quarantine is a keyable row that can be stored and revisited; rejection is a row
that cannot safely be keyed, counted but never persisted.

---

## 5. Measured, before and after

Same probe, same fixture, before and after the reorder:

| | Before | After |
|---|---|---|
| Case A classified | `quarantined incomplete-record` | **`rejected unkeyable-record`** |
| Case B classified | `quarantined incomplete-record` | **`rejected unkeyable-record`** |
| control classified | `rejected unkeyable-record` | `rejected unkeyable-record` (unchanged) |
| Run status, A and B | `failed` | **`completed-with-quarantine`** |
| Exit code | 1 | **3** |
| Cards written | 0 | **1** (the valid record) |

A systematic behaviour diff was also run against `df84c03`'s translation
boundary across the full cross-product of field states — missing, blank,
whitespace, non-string and bad-value, for every field the contract accepts, plus
non-object sources. **Exactly two classification deltas**, both intended: the
detail rewording, and `quarantined:incomplete-record → rejected:unkeyable-record`
for a missing provider card id. Nothing moved the other way, and no shape changed
its quarantine reason, `unmappable` handling, or `ignored` accounting.

---

## 6. Regression coverage

`tests/phase5-c61-catalog-import-safety.cjs` — 37 tests, five sections, all at
the runner boundary through real PGlite. No test asserts on source text.

| # | Pin | Where |
|---|---|---|
| 1 | missing only the provider id → rejected, no mapping | A, C |
| 2 | missing provider id + name → rejected | A |
| 3 | missing provider id + collector number → rejected | A |
| 4 | the valid records in the same batch land — the bad row placed in the **middle** | A |
| 5 | the run completes non-clean (exit 3) rather than as an operational failure | A |
| 6 | no synthetic provider id appears anywhere in `source_mappings` | C |
| 7 | a keyable incomplete record still quarantines, and is readable in the queue | B |
| 8 | unknown variant and unknown expansion still quarantine | B |
| 9 | a genuine repository fault still stops the run and rolls the batch back | B |

Plus: blank, whitespace and non-string ids; non-object records still rejected as
unreadable; no repository **write** method reached for a rejected record; every
record accounted for exactly once; and a twelve-record file with a bad row at
index 1 and `batchSize: 3`, which before the fix lost everything behind it.

**Mutation-tested.** Reverting the gate order fails **12** of these tests. The
corrected detail string is pinned separately (reverting it alone fails one),
because the adversarial pass found it unpinned.

---

## 7. The expansion hazard, reproduced

Reproduced exactly as C6 described. Two provider sets, mapped to `FOSSIL` and
`FOSSSIL` by an operator who meant both to be one release:

```
DRY RUN  : status=complete  mappable=2  quarantined=0  rejected=0
           created=null          <-- a dry run said nothing about expansions
REAL RUN : status=complete  created={"expansions":2,...}
EXPANSIONS: [{"code":"FOSSIL"},{"code":"FOSSSIL"}]
```

Two canonical releases, and the run reported success.

**What is authoritative before an import?** Nothing, about intent. `variants` are
validated against the domain when the translator is built, because their values
are a closed vocabulary the domain owns. An expansion code is not: it is whatever
the operator declares, and it has to be, because a genuinely new release must be
declarable in one step. There is no master set list, and adding one would be a
second source of truth about somebody else's catalogue — which the constraints
forbid and which would be wrong anyway.

So `evo` and `evvo` are equally valid, and **no validation can distinguish an
intended new code from a typo.** That part of C6's framing is correct and cannot
be engineered away.

---

## 8. The decision: fixed, as reporting rather than validation

What *is* exactly knowable is a different question: **which codes would this run
create?** That is the codes its mappable records resolve to, minus the ones the
catalogue already holds — one read-only lookup, no new source of truth, no master
list, no provider knowledge, no migration.

So C6.1 does not validate and refuses nothing. It **names**, before it acts:

```
opening:     FOSSIL, FOSSSIL
             2 releases the catalog did not have — check this is what you meant
```

A list of names is a different kind of check from a count: `created.expansions: 2`
reads as correct to somebody who has not counted; `FOSSIL, FOSSSIL` does not.

**It is quiet when it should be.** Measured across a sequence:

| | `opening` |
|---|---|
| first import of a new release | `["FOSSIL"]` |
| the same file again | `[]` |
| a deliberately added second release | `["JUNGLE"]` only |
| both known | `[]` |

So it is loud exactly when something new is about to open — which is when a typo
would be — and silent on the re-imports that make up ordinary operation.
Intentional new releases remain a single step.

---

## 9. The exact solution

**`persistence/catalog-repository.js` — one read-only method, `knownExpansionCodes`.**
Takes MetYet expansion codes, returns the ones the catalogue already holds. It
keys by `CI.expansionNaturalKey` — the same function `putExpansion` writes by —
and returns the caller's own spelling. Parameterised SQL, one column of one
table, tolerant of null, non-arrays and non-strings.

**`server/catalog/import.js` — the preflight.** After translation and before any
write, in both modes:

```js
summary.expansions = { known, touched, existing, opening }
```

`touched` is de-duplicated **by natural key**, the way the write will
de-duplicate. The lookup is wrapped: if the catalogue cannot answer, `known` is
`false` and nothing is claimed.

**`server/cli.js` — the output.** `opening` and `adding to:` lines inside
`reportImport`, printed only when the lookup actually answered. No new verb, no
new flag, no new route.

**The operator invariant this establishes**, recorded in `domain/README.md`:

> A run names every release it is about to open, before it opens it — and it
> refuses none of them. Nothing here decides whether a code *should* exist; the
> catalogue has no opinion about that and neither does this.

---

## 10. Adversarial findings and corrections

The adversarial pass found **five real defects in my own first version**, one of
them serious enough that the safety feature was worse than nothing in exactly the
case it existed for. Each is recorded.

**1. The lookup asked a case-folded question and gave a case-sensitive answer.**
`expansionNaturalKey` lower-cases; the first version looked rows up by that key
and then filtered the result against the stored `code` column, which
`putExpansion` never rewrites. Measured: a catalogue holding `base1`, asked about
`Base1`, answered "not known" — so the preflight printed *"one release the
catalog did not have — check this is what you meant"* about a run that then
**reused the existing Base Set row and renamed it "Base Set 2"**, with every Goal
and Inventory copy pointing at it. The summary contradicted itself in the same
breath: `opening: ["Base1"]` beside `created.expansions: 0`.

The mirror case was a permanent false alarm that would have trained an operator
to ignore the line. Fixed by keying throughout and returning the caller's
spelling; pinned by two new tests, and mutation-tested.

**2. Two spellings of one release were counted as two.** `touched` de-duplicated
by literal string, so `FOSSIL` and `fossil` in one run promised two new releases
and created one. Fixed by de-duplicating on the natural key. Measured before and
after.

**3. The preflight read could throw out of `importCatalog`.** It sat outside
every fault handler, so a database that could not answer an *advisory* read
escaped C4's contract that a run returns a summary naming what happened — and the
operator would have seen no classification at all for the most recoverable fault
the runner has. Fixed: the read is wrapped, the run continues, and the first real
write reports a genuine fault in the shape built for it.

**4. A catalogue that could not answer was reported as "nothing exists".** The
first version left the answer empty whether the lookup was missing or had failed,
so every touched code landed in `opening` — a positive false claim dressed as
graceful degradation. Fixed with an explicit `known: false`, and the CLI prints
nothing when the answer is unknown.

**5. The CLI copy was written for a dry run and printed on every run.** On a
completed write it said "not in the catalog yet" about releases that same run had
just created. Reworded to be tense-honest in both modes.

**And three things were unpinned that should not have been**, all found by
mutation testing: the corrected detail string (reverting it passed 31/31), the
`--limit` interaction, and the case-folding behaviour. All three now have tests.

**One test of mine pinned the defect as intended behaviour** — it asserted that
`knownExpansionCodes(["fossil"])` returns `[]` when the catalogue holds `FOSSIL`,
captioned "a code is compared as the domain keys it" when the domain in fact
case-folds. Correcting the method failed that test, which is how the caption was
caught being wrong. Replaced.

**Confirmed clean by the pass:** the reordering is complete (`recordSourceMapping`
has exactly two callers, both below the gate, and the runner additionally filters
rejects out before persistence); no unintended classification moved; the lookup
is injection-safe and cheap (50,000 codes in 133 ms, one round trip); the dry run
still writes nothing and still declines to claim what it would create; nothing
provider-specific entered the runner; and no existing pin was weakened.

---

## 11. Architecture preserved

Expansion → Card Context → Canonical Card → Physical Copy, untouched. Provider
ids remain lineage only. The `source_mappings` schema, the quarantine model, the
batch size and transaction model, rerun idempotency, provider-disappearance
semantics and presentation last-write-wins are all unchanged. No browser or API
command surface moved; the allow-list is still 18 and the domain still holds 49
commands. No migration — `0013_binders.sql` is still newest and
`git diff --name-only df84c03 -- persistence/migrations/` is empty. No provider
SDK, no network dependency, no new package. `pokemon_cards.json` untouched.

**One pin was restated rather than weakened.** C4 asserted the runner's requires
were exactly `["require(\"./translation.js\")"]`. C6.1 gives the runner a second
static import — `domain/card-identity.js`, so it de-duplicates by the same
natural key `putExpansion` writes by rather than re-implementing the folding rule
and becoming a second answer to it. That exact list was a snapshot of C4, not the
property it protected. The test now asserts the property directly — every require
is a static module literal, none is built from caller input, and the two modules
are named so a third has to be added on purpose — which is strictly stronger than
counting them.

---

## 12. Verification

```
131 suites / 4,354 tests      ALL SUITES PASSED
PRODUCTION BUILD OK — bytes: 345,079
PROD SMOKE OK — rendered 83,686 chars
newest migration: 0013_binders.sql
allow-list: 18
domain commands: 49
```

Build and smoke are unchanged, which is expected: `prod.build.mjs` builds the
prototype, and this batch changed no domain source it reads.

One existing pin failed during the batch and was **not** weakened:
`tests/phase3-registration.cjs`'s "no show-specific framing" check, which scans
`server/cli.js` for marketplace and event language. A comment I wrote used the
words "shows up". The pin is right and my prose was wrong — reworded to "appears",
and every line this batch added was then re-checked against that suite's own
pattern.

---

## 13. Files changed

7 tracked files, +231 / −18, plus one new suite.

| File | Lines | What |
|---|---|---|
| `server/catalog/translation.js` | +32 / −14 | the gate reorder and the corrected detail |
| `server/catalog/import.js` | +71 | the preflight, de-duplicated by natural key |
| `persistence/catalog-repository.js` | +34 | `knownExpansionCodes`, read-only |
| `server/cli.js` | +21 | the `opening` / `adding to` lines |
| `tests/phase5-c4-catalog-import.cjs` | +18 / −3 | the require pin restated as its property |
| `tests/all.cjs` | +1 / −1 | registration |
| `tests/phase5-c61-catalog-import-safety.cjs` | 532 (new) | 37 tests |
| `domain/README.md` | +54 | the decision trail (§11 of the brief) |

---

## 14. Remaining catalog debt

| Debt | Status |
|---|---|
| `applyTranslation` has no key check of its own | The defence is gate order in one file plus the runner filtering rejects before persistence. A future second caller of `applyTranslation` inherits neither. Not a live risk — it has one caller — but it is where a third would go wrong |
| The preflight assumes `game: "pokemon"` | The lookup hard-defaults it and the runner never passes the per-record game. Harmless while `GAMES === ["pokemon"]`; it would silently ask the wrong question about a second game |
| `--limit` describes the run, not the file | Deliberate — a limited run should report what it did — but a limited dry run used as a sanity check gives a clean bill of health for a typo past the limit. Pinned so the behaviour is known rather than assumed |
| Two provider sets deliberately mapped to one MetYet release | Legitimate and sometimes intended (a set and its promos). The preflight names one release, correctly, and the descriptive name is last-write-wins |
| `--dry-run` requires `DATABASE_URL` | Unchanged, and now slightly more load-bearing: the preflight is a read, so a dry run genuinely uses the database. It degrades honestly if it cannot |
| `mapped → quarantined` still not reported | Unchanged since C4. Needs a repository read this batch had no reason to add |
| Everything the C6 checkpoint classed C, D or E | Untouched, as intended — including the Artist doorway pagination, which this brief explicitly excluded as Browse behaviour rather than import safety |

---

## 15. Is C4 now safe for an approved transformed provider file?

**For the two risks C6 identified, yes.** A malformed row no longer fails the
run; it is counted, named and skipped, and every good record in the file lands.
An operator is told which releases a run is about to open before it opens them,
in the dry run, with the answer keyed the same way the write is.

**Three honest qualifications**, none of which is a reason to wait:

- Safety is not the same as correctness of mapping. The runner will faithfully
  import whatever a vocabulary declares. A wrong *variant* mapping still produces
  a wrong card, and no validation can catch that — which is why the dry run's
  quarantine reasons are the operator's real check.
- The preflight reports; it does not refuse. An operator who does not read the
  `opening` line is exactly where they were before.
- Nothing here has been exercised against real provider data, because there is
  none to exercise it against. The measurements are against fixtures of this
  batch's own making.

---

## 16. What still waits on Scrydex permission

Everything else. The C6 checkpoint's blocker is unchanged: there is no approved
catalogue data, and until Scrydex confirms in writing that MetYet may store
normalised metadata in its own database, there is nothing to import. This batch
did not contact them and did not begin an adapter.

After permission, C6's §8 stands: an acquisition-side transformation from a
provider's card objects to the flat source records C4 consumes, one record per
variant, living **outside** `server/catalog/` so the neutral runner never learns a
provider's field names.

**Founder next action is unchanged: send the letter.**

---

## 17. Hand-back

| | |
|---|---|
| Branch | `phase-5-c6-1-catalog-import-safety` |
| Baseline | `df84c0328fac783b8131c0d51427e86a890d8045` (PR #72 merge) |
| Files | 7 changed, +231 / −18, plus one new suite |
| Allow-list | **18 → 18** |
| Migration | none; `0013_binders.sql` still newest |
| Domain commands | 49, unchanged |
| Suites / tests | 130 / 4,317 → **131 / 4,354** |
| Build | 345,079 bytes (unchanged) |
| Smoke | 83,686 chars (unchanged) |
| Expansion safety | **Fixed** — as reporting, not validation (§8) |
| New files | `tests/phase5-c61-catalog-import-safety.cjs` |
| Report | `Claude outputs/MetYet_Phase5_C6_1_Catalog_Import_Safety_Correction_Implementation_Report.md` |

**Not merged.** Left intact for review.
