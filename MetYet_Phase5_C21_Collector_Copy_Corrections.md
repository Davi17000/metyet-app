# MetYet — Phase 5 C2.1: Collector Copy Foundation Corrections

**Status: PASS.** `npm run verify` exits 0. 122 suites, 3,965 assertions, production build 341,232 bytes, smoke 83,686 characters.

Every correction in the brief was a real defect. I confirmed each one empirically against a live PGlite database before changing anything, rather than reading the code and agreeing. One of them — the silent unoffering — would have been a production incident on the deploy of C2, and the claim that it *wouldn't* was mine, written into migration 0011's own header.

---

## 1. Current branch / base / head before changes

| | |
|---|---|
| Branch | `phase-5-c2-collector-copy` (worktree `/home/claude/c2`) |
| Remote branch behind PR #65 | `phase-5-c2-collector-copy-imported` |
| Base | `a0aa58d` — *Merge PR #64*, C1 merged |
| Head before this batch | `431984c` — *gitignore: ignore node_modules as a symlink* |

The prompt's hashes were checked rather than assumed: `git ls-remote` on the Mac shows the PR branch at `431984c`, identical to the local head, so C2.1 stacks on the real PR head and not on a stale one.

## 2. Exact files changed

Eight files, +686 / −17.

| File | What changed |
|---|---|
| `persistence/migrations/0012_collector_copy_offered_backfill.sql` | **new** — the historical backfill |
| `domain/metyet-world.js` | `offered` must be a boolean; the permissive blank check is gone |
| `domain/metyet-commands.js` | `setInterest`: gates apply to creation only; new interest requires an available copy |
| `domain/README.md` | corrects the false claim about who supplies `offered`; documents both Interest rules |
| `tests/phase5-c21-collector-copy-corrections.cjs` | **new** — 19 regression tests, sections A–D |
| `tests/phase5-c2-collector-copy.cjs` | migration-scope test corrected and strengthened |
| `tests/phase3-persistence.cjs` | end-of-script `setInterest` repointed; one seed copy added |
| `tests/all.cjs` | registers the new suite |

No production client, server route, projection or command allow-list changed. The exposed command set is byte-identical to C2's.

## 3. How the historical `offered = true` migration was implemented

**First, the inspection.** I did not guess the stored shape. `offered` has no column — `world-repository.js` writes every non-column field into the `attrs` JSONB blob. I built a PGlite database, ran the real migrations, inserted a row in exactly the shape migration 0011 leaves a pre-C2 row in (`attrs` with `cardId`, `cert`, `market`, `photos`, and **no `offered` key**), and loaded it through the real repository:

```
loaded row      : {"id":"b-legacy","collectorId":"c1","cert":"PSA 1","cardId":"k1", … }
typeof offered  : undefined
validateWorld ok: true            ← accepted the ambiguity
TP sees copies  : 0               ← the partner's supply is gone
owner sees      : 1               ← the Collector still owns it
```

That is the defect, reproduced: the card stays owned, the offer evaporates, and nothing says so. Migration 0011's header claimed "the world repository gives existing rows their `offered` value when it next writes them". **Nothing does.** That sentence was wrong when I wrote it.

**The mechanism: `0012_collector_copy_offered_backfill.sql`, one statement.**

```sql
update metyet.collector_copies
   set attrs = attrs || '{"offered": true}'::jsonb
 where attrs -> 'offered' is null;
```

Four decisions behind it:

- **A new file, not an edit to 0011.** `migrate.js` records the SHA-256 of every applied migration and refuses one that changed since it ran ("Restore the original file and add a new migration instead"). Any environment that has already applied 0011 — including any deploy of this PR branch — would reject an edited copy and never run the backfill. A new file runs everywhere, once, in order. A test asserts 0012 exists, sorts after 0011, and that the runner still checksums.
- **`true`, because that is what the absence meant.** Before C2 a Collector's copy existed *only* because it had been put up for trade; adding one **was** the act of offering it, which is the exact conflation C2 exists to undo. A row with no `offered` key is not an unknown — it is a row from a world where the answer was always yes. This preserves meaning rather than guessing.
- **Only where the key is ABSENT.** `attrs -> 'offered' is null` is true for a missing key and false for both `true` and `false`. A copy explicitly recorded as not offered after C2 is a decision its owner made and is left alone. Re-running the file changes nothing, and it cannot un-say something somebody said.
- **`->` rather than `?`.** The jsonb key-exists operator is `?`, which collides with parameter placeholders in several drivers. `attrs -> 'offered' is null` avoids it entirely and is equivalent here.

New copies are unaffected: `addCollectorCopy` still writes an explicit `offered: false` unless the caller offers, so the C2 default stands.

## 4. How canonical boolean validation was tightened

`domain/metyet-world.js` previously read:

```js
if (!blank(b.offered) && typeof b.offered !== "boolean") { … }
```

— which accepted a blank `offered` and refused only a non-boolean one. That is what let the undefined state exist. The comment directly above it already said *"A copy that says neither true nor false about offering says nothing, which is not a state."* The code now agrees with the comment:

```js
if (typeof b.offered !== "boolean") {
  report("field.invalid", `${path}.offered`,
    `${who} does not say whether it is offered. Owning a copy and offering it are `
    + `separate facts, and both must be stated (true or false).`);
}
```

Because `validateWorld` runs on **every load and before every save**, absent / null / tri-state is now unrepresentable in canonical state, not merely discouraged. Three states collapse to two, which is the point: a boolean question deserves a boolean.

**Round-trip verified**, and not only in memory. A test reads the raw JSONB back out of Postgres to prove the explicit `false` is really on the row rather than a default something applies on read:

```
addCollectorCopy → attrs.offered === false in the database → reloads as false → validates
setCollectorCopyOffered(true) → attrs.offered === true in the database
```

A separate test proves `repository.saveWorld` refuses an ambiguous world **before issuing a single statement**, and that nothing was written.

## 5. How Interest withdrawal was corrected

C2 wrote one gate and applied it to both directions:

```js
if (copy.offered !== true) return refuse(R.notFound);   // ran for on:true AND on:false
```

So a partner who had pulled a card aside could not put it down once the Collector withdrew the offer. The Collector went on seeing interest in a card they had taken off the table, and the only cure was to re-offer the card they had just decided not to offer.

The gate now applies to **creation only**:

```js
if (!copy) return refuse(R.notFound);
if (on && copy.offered !== true) return refuse(R.notFound);
if (!isRelated(state, a.partnerId, copy.collectorId)) return refuse(R.noRelationship);
const has = …;
if (!!on === has) return done(state, has);              // idempotent either way
if (on && D.collectorCopyStatus(binderId, list(state.opportunities)) !== "available") {
  return refuse(R.copyUnavailable);
}
```

Withdrawal needs the copy to exist and the relationship to be current, and nothing else — it removes a signal rather than making one.

**The ordering is deliberate.** The `offered` check stays *before* the relationship check on the create path, so an unrelated partner probing an unoffered copy still gets `not-found` exactly as in C2 — the refusal cannot be used to tell "exists but withdrawn" from "does not exist". Nothing was made broadly visible or actionable to achieve this: the projection still gives a partner only offered copies, and an unoffered copy still reaches nobody who has not named it in their own submitted package.

## 6. What I found about Interest versus active deal availability

**Inspected first.** `collectorCopyStatus(copyId, opportunities)` is derived, never stored. It reads every opportunity's trade package and answers, for one exact physical copy: `available`, `reserved` (named in a submitted package), `committed` (accepted into a live trade), or `traded` (that deal completed).

Two boundaries, and only one of them was right:

- **The projection was already correct.** For a partner not in the deal, `copyForViewer` returns null when the copy is held elsewhere and the partner has not named it themselves — so they never receive it and cannot see it to act on.
- **The command was not.** `setInterest` asked nothing about status. A partner holding an id — from an earlier view, a log, a prior interest — could register interest in a copy the product had already promised to someone else. **A command may not depend on a screen**, and this one did.

So C2 did *not* already prevent it, and the smallest correction consistent with the existing model was to ask the same derived question at the command: one line, the same `collectorCopyStatus` everything else uses, on the create path only.

What this deliberately is **not**: it does not make Interest reserve anything. The direction is the opposite — a copy a deal is holding refuses new signals. Expressing interest still moves no status and creates no opportunity, and a test asserts exactly that. Existing interest in such a copy stays withdrawable, including after the copy enters a deal, and a test proves withdrawing it leaves the trade package untouched and the world valid. No new persisted state, no second source of truth.

## 7. Migration-scope documentation / test correction

The test was named *"this batch's migration touched one table, and it is the one it says it is"*. The migration touches **two** — `collector_copies` and `opportunity_trade_refs` — deliberately, because without the second a canonical Collector copy could never enter a trade package. Worse than the name: the assertion passed only because its regex happened to omit the very table it should have named. A scope test that passes by not looking is the worst kind.

It is now *"the C2 migrations touch exactly the two tables they say they do"*, and it **extracts** the tables each file alters rather than pattern-matching for a few forbidden names:

```js
const tables = (sql) => [...sql.matchAll(/\balter table\s+metyet\.(\w+)/g)] …
  .map((t) => (t === "binder_copies" ? "collector_copies" : t));   // same table, either side of the rename
eq([...new Set(tables(rename))].sort().join(","), "collector_copies,opportunity_trade_refs");
eq([...new Set(tables(backfill))].sort().join(","), "collector_copies");
```

It also pins that 0012 touches only rows where `offered` is absent, so nobody can later widen the backfill into overwriting explicit answers. The next batch that widens a C2 migration has to widen this line too.

Documentation: 0011 is checksummed and **cannot be edited**, so its false sentence is corrected where a reader will actually meet it — migration 0012's header opens by quoting the claim and saying plainly that it was wrong and why. `domain/README.md` is corrected in both affected places: the pre-C2 rows entry now names migration 0012 and explains the failure mode, and the Interest entry now states both rules (withdrawal always available; new interest requires offered **and** available).

## 8. Regression tests added / changed

**New: `tests/phase5-c21-collector-copy-corrections.cjs`, 19 tests.** Each of the brief's six required properties is covered, plus the mechanism behind each.

| # | Required property | Covered by |
|---|---|---|
| 1 | Legacy row → `offered === true`, still TP-visible under the same authorization | A: *a legacy trade-supply row migrates to offered === true*; *and it is still visible to the same Trusted Partner* |
| 2 | Canonical `offered` cannot be missing / undefined / non-boolean | B: *a canonical copy with no `offered` is refused*; *undefined, null and every tri-state are refused the same way*; *the repository refuses to save such a world* |
| 3 | New copy defaults to `false`, survives round trip | B: *a new copy defaults to false, explicitly, and survives a round trip* |
| 4 | Offered → interest → unoffer → withdraw succeeds | C: *a partner can withdraw Interest after the Collector unoffers the copy* |
| 5 | No new interest on an unoffered copy | C: *a partner cannot create new Interest in an unoffered copy*; *nor after … withdrew from* |
| 6 | Active-deal availability blocks new action; withdrawal still works | D: four tests, including *but Interest expressed BEFORE the deal can still be withdrawn* |

Two of these deserve a note on how they are built:

- **The migration test performs a real upgrade, not a simulation.** It migrates a fresh database only as far as `0011_collector_copies` — the exact state a deployment of C2 is in — writes the legacy row into it, then asks the runner to bring the schema up to date and asserts that `0012` and *only* `0012` applied. That proves the file runs the way it will run in production: in order, once, under the same advisory lock.
- **One test states the bug itself**, so nobody reintroduces it: it reads the pre-backfill row and asserts `typeof offered === "undefined"` and that `offered === true` is `false` — the precise arithmetic that unoffered everybody's cards.

Section D also pins the boundary that was **already right** (*the projection already hid such a copy from an uninvolved partner, and still does*), so the command check reads as the same rule in a second place rather than as a competing answer.

**Changed, not weakened — two, each explained in place:**

1. **`tests/phase3-persistence.cjs` — the end-of-script `setInterest`.** It ran last, by which point copy `b1` had been submitted into a trade package, accepted and traded away. It passed only because `setInterest` asked nothing about availability. It now points at `b3`, a new seed copy owned by the same Collector that no deal touches, so the step exercises exactly what it always did — a related partner expressing interest, persisted and reloaded — at a copy where that is a real thing to do. I first tried moving the step earlier instead; that shifted six index-based `DEAL.slice(0, n)` boundaries and broke an unrelated history test, so repointing was the smaller change.
2. **`tests/phase5-c2-collector-copy.cjs` — the migration-scope test.** Restated as §7 describes. Strictly stronger: it enumerates rather than denylists.

No assertion was relaxed to make this batch pass.

## 9. Full verification results

```
npm run verify   EXIT 0
  build          dist/MetYet.cjs, dist/Collector.cjs, dist/Prototype.cjs, test bundle
  test           ALL SUITES PASSED — 122 suites, 3,965 assertions
  prod           PRODUCTION BUILD OK — bytes: 341232
  smoke          PROD SMOKE OK — rendered 83686 chars
  previews       MetYetCollector.preview.jsx 7,712 lines; MetYetPrototype.preview.jsx 11,941 lines
```

Against C2's head: 3,946 → **3,965** assertions (+19), 121 → **122** suites, build 341,147 → **341,232** bytes.

**Failures encountered and resolved during the batch** (all mine, all fixed rather than papered over):

| Failure | Cause | Resolution |
|---|---|---|
| `a legacy trade-supply row migrates to offered === true` | My test ran `migrate` on a database that had *already* applied 0012, so the runner correctly skipped it | Rewrote it to migrate only through 0011 first — a better test than the one I meant to write |
| `violates foreign key constraint "binder_copies_collector_fk"` | The bare database had no collector or catalogue parent rows | Inserted them; noted in the test that the constraint keeps its old name because constraint names follow a renamed table |
| `phase3-persistence` × 4 — `setInterest refused: copy-unavailable` | The new availability rule working, against a script step that was never realistic | Repointed to `b3` (§8) |
| `0011 touched a table it does not declare` — got `binder_copies,collector_copies,opportunity_trade_refs` | My own extractor counted the rename's *source* name as a third table | Collapse `binder_copies` into `collector_copies`: one object, two names either side of one statement |

Migration tests: covered in A (ordering, checksum rule, real upgrade, idempotence, explicit-answer preservation). Persistence round-trip: covered in B, through raw JSONB in both directions. Interest regressions: C and D, nine tests. Active-deal availability: D, four tests plus the projection boundary.

## 10. New commit SHA

`131435f` (code) and `cd94feb` (report) — *Phase 5 C2.1: corrections to the Collector Copy foundation*

## 11. Updated PR head SHA

`cd94feb`. The branch is now:

```
cd94feb  Phase 5 C2.1 report: Collector Copy foundation corrections
131435f  Phase 5 C2.1: corrections to the Collector Copy foundation
431984c  gitignore: ignore node_modules as a symlink, not only as a directory
22751a1  Phase 5 C2 report: Collector Copy foundation
4095a95  Phase 5 C2: Collector Copy foundation — owning and offering are two facts
a0aa58d  (base — C1 merged)
```

**Push from this environment still fails**: the cloud git proxy refuses to inject a credential for `Davi17000/metyet-app` (403 — "not in this session's authorized repository set"). The bundle remains the handoff, as it has for every batch this phase. **The PR is not merged.**

## 12. Confirmation of what was not introduced

| Boundary | Status |
|---|---|
| **C3** — named Binders, BinderEntry, membership, Binder UI, unified Card Specification UX, four-state Collector UI, Browse defaults | None. The C2 assertion that no Binder exists in the command table, the migrations or the navigation still passes, unchanged. |
| **TP offers** — Make an Offer, cash/counter/multi-card offers, new negotiation states, TP pricing | None. No negotiation command was added or altered; `setInterest` gained a read of existing derived status and nothing else. |
| **New Interest taxonomy** — Would Buy, Would Consider in Trade, or similar | None. Interest is still one lightweight signal with one boolean. |
| **Reputation / scoring** — follow-through %, reliability scores, Binder hygiene, staleness penalties | None. Nothing in this batch judges a Collector or a partner for changing their mind; the whole of §5 exists to make changing it *easier*. |
| **Provider / catalog work** — imports, fabricated catalog data, provider strategy, provider ids as identity | None. No catalog file was touched. Canonical identity remains server-minted and provider-neutral. |

Architectural invariants preserved: server-authoritative state; actor identity derived server-side; projection-based privacy (the only projection change in C2.1 is none); provider-neutral canonical identity; physical copy identity distinct from canonical card identity; TP Inventory and CollectorCopy separate; Goal as demand; Discovery derived; Opportunity persisted; **Interest does not reserve a card**; no private field leaks; the explicit command allow-list unchanged at nine; no browser-authored actor identity; no new durable concept; no parallel source of truth.

---

## Handoff

Branch `phase-5-c2-collector-copy`, head `cd94feb`, off `a0aa58d`. Bundle delivered separately; import with:

```
git fetch <bundle> HEAD:phase-5-c2-collector-copy-imported --force
```

**Do not merge the PR.**
