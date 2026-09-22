# MetYet — Phase 5 C4: Catalog Ingestion Runner — Implementation Report

**Branch** `phase-5-c4-catalog-ingestion-runner`
**Baseline** `97fdba3f53eef3fd11deb51cb384f629f5e22ec9` (PR #70 / C3.5)
**Implementation** `7e4175d` — *the catalog can be loaded*
**Not merged.** Stopped for review, as instructed.

---

## 1. Baseline gate

| Fact | Expected | Found |
|---|---|---|
| `main` | `97fdba3f53eef3fd11deb51cb384f629f5e22ec9` | same ✔ |
| Suites / tests | 128 / 4,205 | 128 / 4,205 ✔ |
| Build | 345,079 | 345,079 ✔ |
| Smoke | 83,686 | 83,686 ✔ |
| Newest migration | `0013_binders.sql` | `0013_binders.sql` ✔ |
| Allow-list | 16 | 16 ✔ |

Nothing differed; nothing unrelated was repaired.

---

## 2. What was built

### The CLI contract

```
node server/cli.js catalog-import --provider=<name> \
    --vocabulary=<path> --records=<path> [--dry-run] [--limit=<n>]
```

npm alias `catalog:import`, beside `db:migrate` and `partner:invite`.

| Flag | Rule |
|---|---|
| `--provider` | required, non-empty after trimming; lineage only, written to every mapping row |
| `--vocabulary` | required path to a JSON mapping table MetYet owns |
| `--records` | required path to a JSON **array** of source records |
| `--dry-run` | classifies everything, writes nothing |
| `--limit=<n>` | positive whole number; takes the first n, for operator testing |

**Two paths, because they are two different kinds of thing.** The vocabulary is
a declaration MetYet owns and reviewed; the records are somebody else's data.
Conflating them is how a provider's words end up deciding MetYet's.

**Parsed, never `require`d.** `JSON.parse` on a string the CLI read — `require`
on an operator-supplied path is arbitrary code execution wearing a configuration
flag. Nothing in either file is ever used *as* a path.

### Files

| File | Lines | What |
|---|---|---|
| `server/catalog/import.js` | 253 (new) | the loop, the batches, the summary |
| `server/catalog/translation.js` | +139/−15 | the three boundary fixes, the third outcome, the doc correction |
| `server/cli.js` | +124 | the `catalog-import` operation, usage, header table |
| `package.json` | +1 | the alias |
| `tests/phase5-c4-catalog-import.cjs` | 1,135 (new) | 50 tests |
| `tests/all.cjs` | +1 | registration |
| `domain/README.md` | +94 | the decision trail |

`git diff --stat 97fdba3 HEAD -- persistence/ domain/ client/` reports **one**
file: `domain/README.md`. No persistence, no domain source, no client.

---

## 3. The three boundary fixes

The C4 checkpoint drove the pipeline against a real database and found three
ordinary inputs that threw. All three are fixed **at the translation boundary**,
where the rule belongs, not in CLI glue.

### ① A record that is not a record

`translate(null)` — and a bare string, a number, an array — threw
`TypeError: translation: a source record is required`. A `null` element is an
ordinary artefact of a trailing comma or a failed row in somebody's export.

It is now **rejected**: `{ ok: false, rejected: { reason: "unreadable-record" } }`.

### ② A record with no provider card id — and why it needed a third outcome

`translate` refused this as `incomplete-record`, correctly. Then
`applyTranslation` handed the blank id to `recordSourceMapping`, which requires
one and threw — **from inside a quarantine write**, which is the one place a
quarantine must never fail.

The cause is structural: `source_mappings` is unique on
`(provider, provider_card_id, provider_variant_key)`, so a record with no
provider card id **has no identity to be remembered by**. A quarantine that
cannot be stored is not a quarantine.

The brief was explicit, and it is the right call: **do not fabricate one.** A
made-up `provider_card_id` is a durable lie about somebody else's data, and it
would collide with the next made-up one. So the boundary grew a third outcome:

```
translate(source) -> { ok: true,  record, ignored? }
                   | { ok: false, quarantine: { reason, detail } }   durable, keyed, waits
                   | { ok: false, rejected:   { reason, detail } }   counted, named, stored nowhere
```

`applyTranslation` returns `{ rejected: true }` for the third and **reaches no
repository method at all** — asserted directly with a proxy, because that is the
contract the runner depends on.

### ③ A printed total the column cannot hold

`"abc"` became `NaN`; `10.5` and `99999999999` are finite and still fail an
`int4`. All three aborted the insert. The baseline had no guard at all
(`translation.js` at `97fdba3` does `Number(...)` and passes it on); the
*checkpoint document's* first proposed guard was `Number.isFinite`, which lets
`10.5` and `99999999999` through — which is why the fix is
`Number.isInteger(n) && INT4_MIN <= n <= INT4_MAX`.

**It is not a quarantine, and that is a judgement worth defending.**
`printed_total` is nullable and explicitly descriptive — `0006:65-67` says
nothing validates a collector number against it, because secret rares
legitimately exceed it. An unusable total means "nobody told us", which is
*true*. Quarantining would claim the card cannot be identified, which is *false*.

The deciding argument is structural: `expansionPrintedTotal` arrives on an
**expansion**, and every card in that release carries it. One mistyped set total
would otherwise quarantine hundreds of perfectly identifiable cards.

It is **not silent** — `translate` reports `ignored: ["expansion-printed-total"]`
and the run counts and prints it.

### And the documentation correction

`discriminator` was consumed by `translate` from the first day and missing from
the source-record shape in the header comment. It is the **fifth segment of a
card context's natural key** and the reserved collision-breaker, so an adapter
written from that comment alone could not break the collision the schema
reserves it for. Added, with the reason.

---

## 4. Durable quarantine vs run-level rejection

| | Quarantine | Rejection |
|---|---|---|
| Stored | yes — a `source_mappings` row, `status='quarantined'`, `canonical_card_id` null | **no row at all** |
| Keyed | yes, by `(provider, providerCardId, providerVariantKey)` | cannot be |
| Survives the run | yes; re-examined next import | no |
| Retried by | widening the vocabulary and running again | fixing the adapter |
| Reasons | `unknown-variant`, `unknown-expansion`, `incomplete-record`, `lossy-mapping` | `unreadable-record`, `unkeyable-record` |
| Counted in the summary | yes, grouped by reason | yes, grouped by reason |

Rejection is **not** a softer quarantine. It is the honest answer to "we cannot
even remember that we saw this", and the operator's fix is upstream.

Both are counted separately and both push the exit code to 3.

---

## 5. Transactions

- **Batches of 500** (`DEFAULT_BATCH_SIZE`), one `db.transaction` each.
- **Every write is given the caller's `tx`** — asserted behaviourally by
  wrapping the repository and recording any write that arrives without one.
  This is not an optimisation: without a `tx` the repository runs each statement
  in its own transaction, splitting every upsert's existence check from its
  write.
- **A record's four writes are atomic**, proved by making
  `recordSourceMapping` throw and asserting the expansion, context and card
  written before it did not survive.
- **A durable quarantine is inside the transaction**, proved the same way.
- **A fault stops the run.** The summary names the failed record range
  (`{ from, to, size, message }`), the batch rolled back whole, and no later
  batch is attempted — asserted by counting calls. A skipped batch would be
  silent data loss wearing a success code.
- **Rerun is the recovery.** Proved: a run limited to one record, then a full
  run, mints only what was missing.

---

## 6. Dry run

`--dry-run` parses, validates, builds the translator (so a bad vocabulary still
fails) and classifies every record — then returns before any write.

- On an empty catalog the four table counts are unchanged; on a **populated**
  one **every row of every table** is compared, not just counts — a dry run that
  rewrote a presentation column or bumped a `last_seen_at` would pass a count
  comparison and still have written.
- `mappable`, `quarantined`, `rejected`, both reason groupings, `ignored`,
  `read`, `processed` and `status` are **identical to the real run's**, asserted
  over a fixture that exercises all three outcomes — comparing two all-good runs
  would have compared 0 with 0.
- `created` and `reused` are **`null`**, because a run that wrote nothing cannot
  know them. Asserted.
- The mode is labelled in the output: `mode: dry-run  (nothing was written)`.

---

## 7. Summary and exit codes

```
provider:    alpha
mode:        write
records:     18212 read
mappable:    18104
quarantined: 106  (unknown-variant: 91, lossy-mapping: 15)
rejected:    2  (unreadable-record: 2)
ignored:     (expansion-printed-total: 1)
expansions:  new 12  reused 18092
contexts:    new 9182  reused 8922
cards:       new 18104  reused 0
mappings:    18210 written
status:      completed-with-quarantine
```

(18,104 + 106 + 2 = 18,212 processed; 18,104 + 106 = 18,210 mapping rows,
because a rejected record writes none. The suite pins both identities.)

| Code | Meaning |
|---|---|
| **0** | clean — everything mappable, nothing waiting |
| **1** | operational failure: a file, a vocabulary, a database fault |
| **2** | an invocation nobody could act on |
| **3** | completed, with quarantine or rejection |

All four are asserted reachable and distinct. **3 is the one that earns its
keep**: a run that queued a thousand records has not failed — the good rows
landed — but `0` would let a scheduler swallow it.

**`mapped → quarantined` transitions are NOT reported, and that is a change of
mind during this batch.** The brief asked for them "if safely observable". They
are not, and the first implementation shipped a counter that lied — see §10.

**No raw payloads and no credentials in output.** Asserted: no record is ever
printed, a record's card name does not appear, and an induced error carrying
`postgres://user:hunter2@…  token=abc123` is redacted to `<connection string>`
by the same `safeMessage` every other operator command uses.

One honest qualification. Nothing the runner *chooses* to print comes from a
record, but `failedBatch.message` is a database error message passed through
`safeText`, and Postgres writes the offending values into some of them — a
unique violation names the key it collided on, which for `source_mappings` is a
provider id and a variant key. Those are provider identifiers rather than
secrets or payload bodies, and the alternative is an operator staring at a
stopped run with no way to find the row, so the message stays. It is flagged
because "no raw payloads" is otherwise an absolute claim and this is the one
seam in it.

---

## 8. Verification

```
129 suites / 4,255 tests      ALL SUITES PASSED
PRODUCTION BUILD OK — bytes: 345,079
PROD SMOKE OK — rendered 83,686 chars
newest migration: 0013_binders.sql
allow-list: 16
```

**50 tests** in `tests/phase5-c4-catalog-import.cjs`, over real PGlite and
fixtures, in eight sections: three outcomes (8), rerun is recovery (7), what the
run says (5), dry run (3), the transaction (7), the operator's door (8), the
boundaries hold (9), and then it works (3).

Build and smoke are unchanged, which is itself a check: `prod.build.mjs` builds
the demo prototype, so those numbers move only when the domain sources change —
and this batch changed none.

**No existing pin was restated or weakened.** Every suite that passed at
`97fdba3` still passes untouched; `tests/all.cjs` gained one line.

### The brief's 33 proofs

All covered. The mapping, where the wording differs:

- #6 (same-provider convergence *reported*) — asserted as
  `created.mappings − created.cards === 1`, so the convergence is visible in the
  summary rather than refused.
- #15 (`mapped→quarantined` surfaced) — **not met, deliberately.** It was
  implemented, measured to report transitions that had not happened, and
  removed; a test now pins its absence so it cannot come back unnoticed. The
  brief's "if safely observable" is the clause I am leaning on. §10 ④ has the
  measurements and §11 names the repository read that would make it honest.
- #16 (real writes use the caller transaction) — asserted by wrapping the
  repository, not by reading source text.
- #22 (summary reconciles with DB) — every counter compared against `count(*)`,
  plus `processed === mappable + quarantined + rejected`.
- #33 (Discovery derives, no provider identity in product state) — the full
  projection body of both seats is searched for four provider strings.

Six proofs beyond the brief's list, each earned by something the work turned
up: `applyTranslation` reaches no repository method for a rejected translation;
the runner requires nothing but its own boundary; presentation is
last-write-wins (below); a rolled-back batch contributes nothing to any counter;
a batch that committed before a later one failed is still counted; and the
summary carries no transition counter.

---

## 9. Architecture invariants

| Promise | Result |
|---|---|
| Allow-list 16 | ✔ and `server/exposed-commands.js` is **byte-identical** to `97fdba3`, asserted by a test |
| No migration | ✔ `0013_binders.sql` newest; `git diff 97fdba3 HEAD -- persistence/` is **empty**, asserted by a test |
| No HTTP exposure | ✔ no catalogue write route; seven ingestion-shaped command names all refused `command-unavailable`; `server/app.js` does not reach the runner |
| No provider, network or SDK | ✔ no `fetch`/`axios`/`undici`, no provider name, no credential in any of the four ingestion files; no dependency added |
| `pokemon_cards.json` | ✔ unreferenced by ingestion code, unchanged in the diff, still present — all asserted |
| Bounded lineage | ✔ `raw` is asserted to hold exactly five keys after an import carrying rarity, supertype, subtypes, pokédex numbers and a large image |
| `unmappable` is diagnostic | ✔ reaches no card, lands in the quarantine reason and the bounded lineage |
| No destructive sync | ✔ a provider dropping two of three records withdraws, deletes and repoints nothing; the runner is asserted to contain no withdrawal machinery |

---

## 10. Deviations and judgement calls

**1. An unusable `expansionPrintedTotal` is dropped to null, not quarantined.**
The brief says it "must be an integer within PostgreSQL int4 range" but does not
say what to do when it is not. Reasoning in §3 ③: the field is descriptive and
nullable, it arrives on an expansion, and quarantining would take the whole
release down for a mistyped number. Counted and reported, never silent. Flagged
here because it is the one place I chose a remedy the brief left open.

**2. `unkeyable-record` and `unreadable-record` are two reasons, not one.** The
brief names one category. They fail for genuinely different reasons — one is a
malformed element, the other a well-formed record missing the one field that
makes it storable — and an operator fixes them in different places. Both are
rejections; both are counted; the grouping just says which.

**3. `--limit` takes the first n.** The brief says "optional positive integer
for operator testing" without specifying. First-n is the predictable reading and
keeps a rerun-after-limit meaningful.

**4. The `mapped → quarantined` counter was built, then deleted.** This is the
one place where I shipped something and took it back, so it is worth the space.

The first implementation read the quarantine queue before writing, and treated
every key *not* in it as "mapped before this run" — so a key that came back
quarantined was scored as a card taken away. Two measurements killed it:

- a record quarantined on its **first ever sighting**, against an empty
  database, reported `requarantined = 1`. The complement of "currently
  quarantined" contains every key the database has never seen.
- a **renamed variant** — a new provider variant key, the old row still mapped
  and untouched — also reported 1. Nothing had transitioned.

And underneath both, `readQuarantine` clamps to a hundred rows, so past a
hundred quarantined keys the "before" picture is truncated and even
already-quarantined keys fall into the same bucket. A signal meant to warn an
operator that their vocabulary has fallen behind would have cried wolf on every
clean first import of a large file.

Observing it properly needs a read the catalog repository does not offer, and
adding one is a persistence change this batch has no business making (§11). So
the counter, `summary.requarantined` and the CLI's `unmapped:` line are all
gone, a comment in `import.js` records why, and a test asserts the field is
absent. Reporting nothing is a gap; reporting a number that is wrong in the
common case is worse, because somebody would act on it.

---

## 11. Remaining debt

| Debt | Status |
|---|---|
| **Presentation is last-write-wins** | Observed, unchanged, newly **pinned by a test**. Two records for one checklist line disagree by whoever is read last, and a record omitting a field blanks it. A runner deciding which source is more trustworthy would be a second authority over somebody else's data |
| **`mapped → quarantined` is not observable** | The missing piece is a repository read of the *mapped* rows for a provider and a given set of keys — something like `readMappings({ provider, keys })` on `server/catalog/catalog-repository.js`, which today offers `readQuarantine` (capped at 100) and nothing else that answers "what is the current state of these exact keys". With that read the runner could compare before and after honestly, inside the same transaction, without a queue scan. It is a persistence-layer addition, so it belongs to whichever batch is allowed to touch that file |
| **`--dry-run` still requires `DATABASE_URL`** | `catalog-import` is not in `server/cli.js`'s `WITHOUT_DATABASE` set, so a dry run — which reads two files, translates in memory and writes nothing — still refuses to start without a connection string. Adding it to that set means the operation must also tolerate a null `db`, which `importCatalog` already does; it was left alone because the set is shared with every other verb and changing it is a CLI-wide decision, not a C4 one |
| Withdrawal is not sticky | Unchanged and now documented: `putCanonicalCard` sets `status='active'` on every sighting, so an import reverses a withdrawal |
| Marking mappings withdrawn by `last_seen_at` | Deliberately not built (§9) |
| Merge / split / de-duplication tooling | Not built; the runner refuses to guess |
| A live provider adapter | Separate batch, permission-dependent. Nothing here chooses one |
| `receiptForOpportunity` legacy `cardId` | Untouched, still latent |
| `binder_id` naming collision | Untouched, documented |
| `relationships.note` / `.last` have no writer | Untouched |
| `pokemon_cards.json` (13.6 MB, unreferenced) | Untouched by instruction; removal is its own housekeeping batch |

---

## 12. Hand-back

| | |
|---|---|
| Branch | `phase-5-c4-catalog-ingestion-runner` |
| Baseline | `97fdba3f53eef3fd11deb51cb384f629f5e22ec9` |
| Implementation | `7e4175d` (the runner), then one correction commit on top of it — two counters that lied, §10 ④, and this report. A commit cannot carry its own hash, so the second is simply the branch tip |
| Files | 7 changed, +1,747 / −16 |
| Allow-list | **16 → 16** (byte-identical file) |
| Suites / tests | 128 / 4,205 → **129 / 4,255** |
| Build | 345,079 bytes (unchanged) |
| Smoke | 83,686 chars (unchanged) |
| Migration | none; `0013_binders.sql` newest |
| New files | `server/catalog/import.js`, `tests/phase5-c4-catalog-import.cjs` |
| Report | `Claude outputs/MetYet_Phase5_C4_Catalog_Ingestion_Runner_Implementation_Report.md` |

**Not merged.** Direct push remains unavailable from this environment, so the
commits are delivered by the established bundle route and the branch is left
intact for review.
