# MetYet — Object-Level Binder Membership Foundation, Batch 3A

**Hand-back.** Branch `phase-5-four-state`. `Davi17000/metyet-app`.

New bare-card Binder filing has not ended yet — that is 3B. What 3A does is build
the thing 3B will cut over to: a durable, additive membership that names **one
Goal or one CollectorCopy**, with the commands, invariants, ownership rules and
schema to hold it, while `binder_entries` keeps running the shipping UI untouched.

---

## 1. Starting SHA

`3600445` — *"Docs: object-level Binder membership — Batch 3 pre-implementation audit"*.

That audit is the batch's own reasoning and two of its conclusions were corrected
during implementation; §19 and §24 record which.

## 2. Implementation SHA

`876e485` — *"A Binder is the home of an object: one Goal or one CollectorCopy"*.

## 3. Docs SHA

This file, committed separately, immediately after `876e485` — a commit cannot
name its own hash, so the SHA is in the bundle's log rather than in the file.

## 4. Files changed

Product code — 8 files, +420 / −18:

| File | What moved |
|---|---|
| `persistence/migrations/0014_binder_memberships.sql` | **new**, 141 lines: the table |
| `persistence/world-repository.js` | the spec, and the collection on the `OPTIONAL` list |
| `domain/metyet-domain.js` | two refusal codes |
| `domain/metyet-commands.js` | `fileObject`, `unfileObject`, `oneTarget`, two removal cascades |
| `domain/metyet-world.js` | the invariant block |
| `domain/metyet-projection.js` | the section, declared and scoped |
| `server/exposed-commands.js` | two doors |
| `client/collector/CardSpecification.jsx` | the minted-id binding, and the scenario-T plan |
| `client/commands.js` | two thunks |

Tests — 1 new suite (`tests/phase5-binder-object-membership.cjs`, 32 assertions,
registered in `tests/all.cjs`) and 21 existing suites re-pinned (§18).

## 5. Final 0014 DDL

```sql
create table metyet.binder_memberships (
  id                text    primary key,
  ord               integer not null,
  binder_id         text    not null,
  goal_id           text    null,
  collector_copy_id text    null,
  -- filedAt, and the mirror keys `goalId` / `collectorCopyId`
  attrs             jsonb   not null,

  constraint binder_memberships_names_one_object check (
    (goal_id is not null) <> (collector_copy_id is not null)
  ),

  constraint binder_memberships_binder_fk foreign key (binder_id)
    references metyet.binders (id) deferrable initially deferred,

  constraint binder_memberships_goal_fk foreign key (goal_id)
    references metyet.goals (id) on delete cascade deferrable initially deferred,

  constraint binder_memberships_copy_fk foreign key (collector_copy_id)
    references metyet.collector_copies (id) on delete cascade deferrable initially deferred,

  constraint binder_memberships_one_home_per_goal
    unique (goal_id) deferrable initially deferred,

  constraint binder_memberships_one_home_per_copy
    unique (collector_copy_id) deferrable initially deferred
);

create index binder_memberships_binder_idx
  on metyet.binder_memberships (binder_id);
```

Four decisions in it worth naming:

- **A new table, not a widened `binder_entries`.** The audit recommended widening.
  That was wrong and §24 says how it failed.
- **A minted id.** `binder_entries` has no id of its own — its primary key is a
  positional `ord` equal to the JS array index, recomputed on every save. A
  membership keys on `bm…`, so a move addresses the same row by the same key and
  nothing renumbers.
- **`on delete cascade` on the two OBJECT keys, and the schema's first `on delete`.**
  It is the rollback property, written where a build cannot roll back past it
  (§23). The **binder** key stays `no action`: nothing deletes a binder, and if a
  delete ever arrives it must be a visible decision about the filings inside.
- **Uniqueness deferrable.** Belt, not braces — see §19, bites 2 and 3.

## 6. Repository spec

```js
{ collection: "binderMemberships", table: "binder_memberships", key: ["id"],
  fields: [["id", "id"], ["binderId", "binder_id"]],
  mirrors: [["goalId", "goal_id"], ["collectorCopyId", "collector_copy_id"]] },
```

`fields` are always-present ids; `mirrors` are "an id or NULL". Exactly one object
column is present on any row, so neither is always an id — the `invitations.collectorId`
shape, for the same reason. The collection joined `OPTIONAL` beside `preferences`
and `activity`: a world written before 3A has no such table and absent reads as none.

A mirror means the column and the `attrs` key must **agree**. A row with `goal_id`
set and no `goalId` in `attrs` is reference drift, which makes the whole world
unloadable rather than one row wrong — so the DDL comment states both halves, and
so does the test fixture that writes rows by hand (§19, finding 7).

## 7. Validator additions

`domain/metyet-world.js`, one block, ten rules. **Every one is vacuous on every
world written before this batch**, because none of them has a membership to fail
one — which is what made it safe to add them all at once. `validateWorld` runs on
**LOAD** as well as before save (`world-repository.js:22,25`; `command-transaction.js:69,153`),
so a rule true only of future worlds turns every stored world into a 500 on the
next read rather than a refusal. This repository has been caught by that three times.

| Rule | Code | Path |
|---|---|---|
| a membership has an id | `id.missing` | `.id` |
| no two share one | `id.duplicate` | `.id` |
| the binder exists | `ref.unknown` | `.binderId` |
| names both | `ref.ambiguous` | `.goalId` |
| names neither | `ref.missing` | `.goalId` |
| the Goal exists | `ref.unknown` | `.goalId` |
| the copy exists | `ref.unknown` | `.collectorCopyId` |
| one home per Goal | `id.duplicate` | `.binderId` |
| one home per copy | `id.duplicate` | `.binderId` |
| same Collector both sides | `ref.owner-mismatch` | `.binderId` |
| `filedAt` is a time or nothing | `field.invalid` | `.filedAt` |

`id.duplicate` for a second home reuses the code the card-level duplicate-pair rule
already uses at `.canonicalCardId` (`metyet-world.js:411`): this file's settled
vocabulary for "this appears twice and may not". The **path** says which.

Nine of these ten had no assertion when the batch was first finished. They do now
— test `[19b]`, one line per rule, and each is bite-verified (§19, bites 18–24).

## 8. Refusal codes — 42 → 44

- **`invalid-target`** — covers absence, garbage and wrong shape with one code, the
  fourth in the family (`invalid-amount` → `invalid-tier` → `invalid-disposition`
  → `invalid-target`). A caller who names both objects, or neither, learns the
  shape is wrong and nothing about what exists.
- **`binder-archived`** — a binder that has been put away takes nothing new. It
  gives up nothing it holds and `unfileObject` is not gated on it at all, because a
  Collector must always be able to take a thing out.

## 9. `fileObject` contract

`fileObject({ binderId, goalId, collectorCopyId })` — files **or moves**, one
command, because from the Collector's side they are the same act.

Gates, in order, and the order is the contract:

1. `invalid-target` — not exactly one of `goalId` / `collectorCopyId`.
2. `not-found` — no such binder.
3. `not-owner` — the seat is not a Collector, or not this binder's.
4. `not-found` — no such Goal / copy.
5. `not-owner` — **the object's owner too, separately.** Owning the binder is not
   enough: a row pairing this Collector's binder with somebody else's Goal would
   put another person's object id on this Collector's screen.
6. then the existing home is read, and:
   - already in this binder → `done(state, existingId)`, no change, the row keeps
     its id and its `filedAt`, because neither changed;
   - somewhere else → the **same row moves**, updated in place with a fresh
     `filedAt`. Never removed and re-added: the membership's id is the handle
     everything else uses.
   - nowhere → `ctx.id("bm")` and a new row.
7. `binder-archived` — **below** the idempotency check, deliberately. It was above
   it first, which refused a re-statement of a home the Collector already has in a
   binder they have since archived: a no-op answered with an error, which
   `addBinderEntry` does not do either.

A refused call mints nothing — `ctx.id("bm")` is the last statement reached, pinned
by test `[4]` and bite-verified.

## 10. `unfileObject` contract

`unfileObject({ goalId, collectorCopyId })` — **names no binder.** An object has one
home or none, so naming the one being left is a fact a caller could get wrong for
no gain.

1. `invalid-target` — not exactly one object.
2. `not-owner` — **the seat, before the lookup.** This was one line below the
   lookup, which answered `not-found` for an id that does not exist and `not-owner`
   for one that does, to any authenticated caller including a Trusted Partner with
   no relationship to the owner. The difference between those two answers is a fact
   about somebody else's collection. `fileObject` never had the problem because it
   reaches the binder first; the other commands in the file that probe before
   checking probe **binder** ids, which a partner never receives. This is the first
   that probes an object, so it asks about the seat first.
3. `not-found`, then `not-owner` for the object.
4. already unfiled → `done(state, false)`. Idempotent, and a success.
5. otherwise the row is removed.

No archived gate. Taking a thing out of a binder you have put away is exactly what
a person would expect to be able to do.

## 11. Removal lifecycle

`removeGoal` filters `binderMemberships` on `m.goalId !== goalId`.
`removeCollectorCopy` filters on `m.collectorCopyId !== copyId`, beside its existing
`interests` cascade.

This is **not** the `pruneOrphanedMemberships` state-coupling that an earlier batch
withdrew. That rule removed a filing as a consequence of a **state change** —
deciding not to pursue a card un-filed it — and it was wrong because organising must
never be collateral damage of meaning. Deleting the subject is not a state change.
A row that NAMES the thing goes when the thing goes, which is why `interests` is
cascaded by `removeCollectorCopy` for exactly the same reason.

0013 named this as its first argument for card-level membership: a copy-named
membership would be "destroyed by a sale". That is now the correct outcome rather
than the hazard. A membership is **that copy's** home; when the copy leaves the
Collector's hands there is no object left to have one. The Goal's home, the sibling
copies' homes and every other card in the binder are untouched — asserted, not
argued, in tests `[15]` and `[16]`.

The database says the same thing independently, via `on delete cascade`, and §23
explains why that is not redundant.

## 12. Privacy and projection

`binderMemberships` is declared in `COLLECTIONS` (`metyet-projection.js:298`), so
the section exists and is **empty by default** for any seat not told otherwise —
which is what makes "an unclassified section cannot appear unnoticed" a real guard
rather than a list someone edits.

**Collector:** scoped by **both** owners.

```js
binderMemberships: clone(list(state.binderMemberships).filter((m) => myBinderIds.has(m.binderId)
  && (m.goalId == null || myGoalIds.has(m.goalId))
  && (m.collectorCopyId == null || myCopyIds.has(m.collectorCopyId))
  && (m.goalId != null || m.collectorCopyId != null))),
```

**The first version of this was wrong and leaked.** It dispatched on `m.goalId`
being set and checked only that side, so a row pairing this Collector's binder and
Goal with a **stranger's copy** passed the filter and put the stranger's copy id on
their screen. An adversarial pass on the finished batch built the row by hand and
read the id back out:

```
Casey sees: [{"id":"m1","binderId":"A","goalId":"g1","collectorCopyId":"theirs",…}]
-> leaked Dana's copy id: ["theirs"]
```

Such a row is refused by `fileObject` and by `validateWorld` — which is precisely
the "relying on both of those being perfect forever" the filter exists to avoid.
Now every reference present must be this Collector's, and a row naming none is
excluded outright. Pinned in test `[13]` from three directions (stranger's copy,
stranger's Goal, no object at all) and bite-verified; the original half-a-row
spelling is bite 15b and fails `[13]`.

**Trusted Partner:** an explicit `[]`, beside `binders: []` and `binderEntries: []`.
Where a Collector keeps a copy is not a fact about a trade, and "this one lives in
their Keepers binder" is negotiating information they never offered. Test `[14]`
searches the whole serialised partner body for binder ids and names, with the copy
in a **live deal** and filed — the hard case, because a copy a partner's own
submitted package names reaches them whatever its disposition says. No count, no
derived hint: `phase5-c31`'s privacy test now enumerates every binder-shaped section
a partner receives and asserts each is `[]`.

## 13. Minted-id binding

`CardSpecification.jsx`. Before this batch the binding was
`step.kind === "record-copy" && step.draftId` — a copy's minted id was adopted and a
Goal's and a binder's were returned and dropped on the floor. Now:

```js
const draftId = step.draftId || (step.kind === "make-binder" ? step.binderDraftId : null);
if (draftId && answer && typeof answer.value === "string" && answer.value) {
  minted.set(draftId, answer.value);
}
```

Every minting step, not one of them. A step says which draft id it is answering for
and whatever comes back under it is what later steps may name. Handles are resolved
immediately before dispatch and the key is **removed** rather than set to
`undefined` — a spread with `binderDraftId: undefined` leaves the own property in
place, and sent every `make-binder` out carrying a stray `binderId: undefined`:

```js
const { binderDraftId, ...rest } = step;
const sending = binderDraftId && step.kind !== "make-binder"
  ? { ...rest, binderId: minted.get(binderDraftId) } : rest;
```

A handle with no minted id is now a **failure that says so**, not a `continue`. The
`continue` it replaced carried a comment claiming the only cause was an earlier
refusal — impossible, because a refusal returns out of the loop. The reachable cause
is an answer with no `value`, and skipping on it reproduced exactly the defect this
batch fixed: binder made, card not filed, panel closes silently, next Save makes a
second binder. Test `[23b]`.

Nothing about this is special-cased on a binder. `adopt` moves created binders from
`newBinders` into `binders` the same way it adopts a new copy's id, and no code
anywhere identifies a binder by its **name**.

## 14. Scenario T — before and after

**T:** a Collector types a new binder name and ticks nothing else, and presses Save.

**Before.** The panel emitted `make-binder` and nothing else. The filing step could
only name a binder that already had an id, so a brand-new binder was created
**empty** and the card was never put in it. The panel closed looking successful.

**After.** Verified through the real mounted panel (test `[23]`):

```
steps sent: [{"kind":"make-binder","name":"Mudkips"},{"kind":"file","binderId":"bd1"}]
binders: ["Mudkips"]
entries: [{"binderId":"bd1","canonicalCardId":"cc-x","addedAt":"2026-10-01"}]
-> the new binder got the card: YES
```

`planFrom` now emits one `file` per binder the plan names — ticked-and-not-already-holding-this-card,
**and** being created in this same Save — which is pinned as that rule rather than
as this fixture's arithmetic in `phase5-c33`.

**This is the card-level `addBinderEntry` path, not `fileObject`.** T is a live
defect in the shipping UI and the brief asks for it; fixing it with the per-object
command would have been 3B. The generalised binding is what both paths will use.

## 15. Retry U — before and after

**U:** the first Save creates the binder, the Goal is refused, the person fixes the
criteria and presses Save again.

**Before.** `make-binder` was re-sent on every press, because nothing recorded that
it had already happened — a second binder of the same name.

**After.** The panel adopts the projection the server returned, so the binder it made
is part of the truth and is no longer a difference; the filing it was going to do is
replaced by filing this card in the one that exists. Not fixed by de-duplicating on
the **name** — two binders may legally share one and a name cannot say which was
made — but by adopting the minted id, exactly as a new copy's is adopted. Test
`[24]`, and `phase5-c33`'s retry test drives the same thing through `planFrom`:

```
first press:  make-binder,record-copy,start-looking,file   (stops at start-looking)
landed:       make-binder,record-copy
second press: start-looking,file                           (no make-binder, no record-copy)
```

## 16. Legacy compatibility

`binder_entries` is **compatibility data**. It is never inferred from, never
automatically converted, and it never answers "which Binder is this Goal or
CollectorCopy in?" Not even where exactly one Goal or one copy could be the
candidate: that row records an act of filing a **CARD**, nothing on it records what
caused it, and one-Goal-per-card is a rule the command keeps and the database does
not — so "only one candidate" is a fact about today rather than about what somebody
meant.

Both write paths are open at once, deliberately. The screens move across in 3B, and
until they do the card-level door is the only one anything presses.

Test `[19]` has a structural half as well as a behavioural one: the two membership
commands must not mention `binderEntries`, and the two card-level commands must not
mention `binderMemberships`. Test `[21]` drives the card-level commands and asserts
filing a card makes no membership. `phase5-collector-identity-stabilization`'s `[19]`
asserts the same thing from the other side (§18).

## 17. Proof `binder_entries` is unchanged

- **DDL:** `git diff 3600445 -- persistence/migrations/` is **empty** except for the
  new untracked file. No applied migration was edited.
- **Columns on disk**, read out of a real database after a 0014 round-trip:
  `ord,binder_id,canonical_card_id,attrs` — exactly as 0013 left them.
- **Record shape:** `phase5-collector-identity-stabilization` pins
  `addedAt,binderId,canonicalCardId`, unchanged.
- **Round-trip:** test `[29]` saves a card-level row and a membership together and
  asserts the card-level row comes back byte-identical, and that the membership
  carries only its own keys (no `goalId: null` left behind by the NULL mirror).
- **Rules:** test `[20]` re-asserts the card-level duplicate-pair rule and the
  names-a-card rule still refuse.
- **Counts:** `binder_entries` has no new column, no new index, no new constraint
  and no new row written by anything in this batch.

## 18. Test re-pins

21 suites. The brief asked for each to be classified; none fell into the third
category.

**Scaffolding — a count or list that had to move (no claim superseded):**

- `EXPOSED_COMMANDS.length` 23 → 25 — 13 suites.
- `COMMAND_NAMES.length` / `COMMANDS` 51 → 53 — 7 suites. Each already carried a
  running tally comment; each gained the 3A line.
- newest-migration pins `0013_binders.sql` → `0014_binder_memberships.sql` — 11 files.
- `migrations.length` 13 → 14 — 1 suite.
- `phase5-c5`'s exposed-door delta, which reads the baseline **out of git** rather
  than from a literal, so a door opening anywhere still fails it.
- `phase3-persistence`'s `asJson` optional-collection default — applied to **both**
  sides of the comparison, so not a loosening.
- three `planFrom` step-sequence literals in `phase5-c33`, now carrying the `file`
  step that is the scenario-T fix.
- `phase5-c35`'s canonical-world collection list, and `phase5-c31`'s privacy
  section list.

**Superseded historical contract, with the supersession recorded in place:**

- `phase5-collector-identity-stabilization` `[19]`, formerly *"no migration, and no
  Binder architecture change"*. That was true of the batch that wrote it and is
  deliberately not true now. **Retitled** *"the card-level Binder entry is exactly
  what it was"*, because the rest of the test is not superseded — it is the proof
  3A owes. It also **gained** an assertion: filing a card invents no membership.
- five test titles still saying *"0013 is still the newest"* while their bodies
  pinned 0014. Retitled to the claim they actually make (*"C8 wrote no migration:
  the newest is still somebody else's"*). This mattered more than tidiness —
  `phase5-c71` has a guard that reads C4's **file** for `0013_binders.sql` to check
  the live assertion had not been dropped, and once 3A landed that guard was being
  satisfied by C4's stale **title** while the assertion underneath had already
  moved. It now reads the assertion itself, against whatever is newest on disk.

**Still-valid invariants, honoured rather than worked around:**

- `phase5-b81`'s client/exposed **set equality** — satisfied by writing the two
  client thunks, not by relaxing the pin. 25 = 25.
- `phase4-collector-read-experiences`'s *"names and emails are never used as keys"*
  — my `minted.set(handle, …)` tripped it. Fixed by **renaming the variable to
  `draftId`**, because that is what it is, rather than widening the regex.
- `phase2-projection` / `phase5-b8`'s *"the section is declared"* pins read
  `PROJECTION_SECTIONS` from the projection module, so the fix was to **declare the
  section** in `COLLECTIONS`. No test edit at all — which is the mechanism working.
- `phase3-domain-readiness`'s *"all N commands ran"* — the new commands are now
  **exercised** by that suite's script, and `fileObject` is pinned for its
  authoritative timestamp and its `bm` id prefix alongside every other minting
  command.

**Nothing was deleted, no exact equality became a subset check, no regex was
loosened.** Two re-pins made a test stricter: `phase5-c31`'s privacy section list
now enumerates and empties every binder-shaped section, and
`phase5-collector-identity-stabilization` `[19]` gained the no-inference assertion.

## 19. Bite results

25 mutations. **23 bit. 2 do not, and that is the finding.**

| # | Mutation | Result |
|---|---|---|
| 1 | remove the XOR check | `[26]` |
| 2 | Goal uniqueness non-deferrable | **no bite — see below** |
| 3 | Copy uniqueness non-deferrable | **no bite — see below** |
| 4 | remove Goal uniqueness | `[27]` |
| 5 | remove Copy uniqueness | `[27]` |
| 6 | `fileObject` accumulates instead of replacing | `[6]` + 1 |
| 7 | remove the object-owner check | `[12]` |
| 8 | remove the Binder-owner check | `[4]`, `[12]` |
| 9 | remove the archived refusal | `[4]`, `[22]` |
| 10 | leave the membership on Goal removal | `[15]` |
| 11 | leave the membership on Copy removal | `[16]` |
| 12 | let a legacy row answer an object's home | 10 failures |
| 13 | revert the minted-id generalisation | `[23]` + 2 |
| 14 | nullable refs in `fields` instead of `mirrors` | `[29]` |
| 15 | project on the Binder's owner alone | `[13]` |
| 15b | project on the **Goal side only** | `[13]` |
| 16 | remove `on delete cascade` from the goal key | `[30]` |
| 17 | remove `on delete cascade` from the copy key | `[30]` |
| 18 | remove the exactly-one validator rule | `[19b]` |
| 19 | remove the one-home validator rule | `[19b]` |
| 20 | remove the `filedAt` validator rule | `[19b]` |
| 21 | remove the owner-mismatch validator rule | `[12]`, `[19b]` |
| 22 | remove `index()` — id presence and uniqueness | `[19b]` |
| 23 | stop resolving the object reference | `[19b]` |
| 24 | stop resolving the binder reference | `[19b]` |
| 25 | skip a step with no minted id, silently | `[23b]` |

All DDL mutations (1–5, 16, 17) are DB-backed through the PGlite harness.

**Bites 2 and 3 do not bite, and the migration comment was rewritten to say so.**
A non-deferrable partial unique index passes every test in this batch, because
`binder_memberships` keys on a **minted id**: the repository's batched upsert never
reshuffles, so no transient duplicate ever exists to trip over. The stable id is the
load-bearing half; deferrability is defence in depth, kept because it costs nothing
and because the rule should keep holding if anything ever reintroduces positional
keying here. The original comment claimed deferrability was what removed the hazard.
It was wrong, and bite 2 is how that was found.

**Five bites were added after an adversarial pass**, because five load-bearing
decisions had nothing to mutate: 15b (the projection leak), 16 and 17 (the cascade),
18–24 (the validator block, nine of whose ten rules were unasserted), and 25 (the
silent skip). Each now fails a named assertion. Two earlier bites needed the tests
strengthened before they would bite: bite 12 (test `[19]` gained its structural half)
and bite 17 (test `[30]` gained the copy half — removing the cascade from the copy
key passed while only the Goal half existed, which is why the two halves are written
out rather than argued from symmetry).

## 20. Full suite, build, prod, smoke

```
node tests/all.cjs   144 suites, 4,914 assertions, 0 failed — ALL SUITES PASSED
npm run build        OK
npm run prod         PRODUCTION BUILD OK — bytes: 346749
npm run smoke        PROD SMOKE OK — rendered 83686 chars
```

Run detached (`setsid nohup`): the full suite is about twelve minutes and a
foreground shell times out at two. `npm run build` first every time — the suite
exits 1 if `domain/` is newer than `dist/`.

## 21. Count movement

| | Before | After | Expected |
|---|---|---|---|
| Exposed commands | 23 | **25** | 25 ✓ |
| Domain commands | 51 | **53** | 53 ✓ |
| Migrations | 13 | **14** | 14 ✓ |
| Refusal codes | 42 | **44** | 44 ✓ |

Projected sections 20 → 21 (`binderMemberships`). Durable collections 17 → 18.

## 22. Bundle movement

`346749 − 344750 = **+1999 bytes**` (+0.58%), measured by building the production
bundle at `3600445` in a clean checkout and again at `HEAD`.

Two new commands, their validator rules, the projection scope and the panel's
handle resolution. Nothing was added to the client that a screen does not use
except the two thunks in §24.

## 23. Rollback verification

The brief asks for safe rollback. **Reading was safe. Writing was not, and the
first version of this batch shipped the claim without testing it.**

**Reading.** Verified against the **actual pre-batch code** — `3600445` in a clean
checkout, with 0014 copied in and rows in the table:

```
migrations applied by the OLD code: 14 0014_binder_memberships
rows left behind in the new table: 1
the OLD code loaded the world: true
it does not read the section: true
and the OLD validator accepts it: true
binder_entries round-tripped unchanged: [{"binderId":"bd1","canonicalCardId":"cc1","addedAt":"2026-01-02"}]
memberships surviving a save by the old code: 1
```

`validateWorld` tolerates a collection it does not know and the repository writes
only collections it has a spec for, so the memberships go quiet rather than being
destroyed. That property is why this is a CREATE and not an ALTER.

**Writing — the defect.** A rolled-back build does not run the cascade in
`removeGoal`, so it issues a bare `DELETE` on `goals` and leaves the membership
behind. With the object foreign keys as `no action`:

```
DELETE FAILED: update or delete on table "goals" violates foreign key
constraint "binder_memberships_goal_fk" on table "binder_memberships"
```

Because the constraint is deferred it fires at COMMIT, after the write has returned
— a 500, not a refusal. Concretely: deploy 3A, a Collector files one Goal, roll the
code back for any unrelated reason, and that Collector can never press "No longer
looking" on that Goal again until the code goes forward. Every attempt a 500.

**The fix** is `on delete cascade` on the goal and copy keys, and nothing else. The
semantics agree with the command exactly — a membership is that object's home, and
an object that no longer exists cannot have one — so there is no state in which the
two disagree about what should happen. The command still removes the row itself, so
the decision stays visible in the domain and a reader of `metyet-commands.js` never
has to know the clause exists; the clause is what holds when the code running is not
that code.

**No backfill is needed in either direction.** Forward: nothing reads a legacy row
to produce a membership. Backward: nothing reads a membership to produce a legacy
row, and an old build does not read the table at all.

Test `[30]` now proves all of it — the stored row, read back; an old reader's view
differing by exactly one key and validating; the DELETE succeeding; and the world an
old build reads after its own delete still valid. Both halves bite (16, 17).

## 24. Unexpected scope, and three things I got wrong

**The audit's own recommendation was wrong, and I withdrew it.** It recommended
re-keying `binder_entries` in place. Designed, applied to a real database and driven
through the real repository before 0014 was written, it failed three ways:
a legitimate move produced a **503** (positional `ord` primary key + non-deferrable
partial index → transient duplicate mid-statement); nullable refs in `fields`
violated the repository's own contract and would have sent a whitespace id to a
foreign key as a 500 rather than a refusal; and the rollback was a **total outage**,
because a row with a null card id fails the validator rule that every entry names a
canonical card, and `loadWorld` runs on every command. A separate table has none of
those. Three further audit claims were corrected: `executeCommands` **is** used
(`server/inventory/import.js:226`), the test budget was ~20 suites not 6, and the
panel control is per-card and cannot express three homes.

**Two doors are open ahead of their surface, and that is the one thing
`exposed-commands.js` says not to do.** That file's rule is *"if nothing in
`client/` sends it, it does not belong here"*. `fileObject` and `unfileObject` are
sent by `fileObjectInBinder` / `unfileObjectFromBinder` in `client/commands.js` and
by nothing else — no component imports either, because the per-object controls are
3B and this batch is forbidden to build them. The brief fixes the exposed count at
25, so leaving them shut for 3B to open was not available. It is recorded in the
file itself rather than left for a reader to discover, and both are refused for any
actor who does not own **both** the binder and the object. **If you would rather
they stayed shut until 3B, say so and I will close them and re-pin the count — it
is a four-line change.**

**An adversarial pass over the finished batch found ten things and I fixed all of
them.** Three were defects, not tidiness: the rollback FK above; the projection leak
in §12; and the `continue` whose stated reason was impossible while its real
condition silently restored the scenario-T defect. Two were tests that did not test
what they said: `[30]` validated a snapshot taken **before** the row was written, so
it could not have observed it at all, and `[23]`'s "no handle reached the command
layer" was laundered through `JSON.parse(JSON.stringify(...))`, which drops keys
holding `undefined` — exactly what the panel was sending. The rest: the validator
block's nine unasserted rules; the `attrs` column comment documenting the wrong
shape (and the test fixture propagating it — rows that would have been unloadable);
`unfileObject`'s probe-before-seat oracle; the archived gate above the idempotency
check; the stale test titles; and three weak assertions in the new suite, including
one I had written myself in `phase5-c33` that was fixture arithmetic dressed as a
rule.

**Nothing else.** No per-object UI, no legacy retirement, no resolution UI, no
automatic conversion, no census migration, no `binder_entries` drop, no Binder
delete, no Shortlist, no multi-home object, no search UX, no Goal / disposition /
grading / transaction / Opportunity / Pending / Market Value / qualification change,
no broad cleanup, no visual redesign, no merge, no push workaround.

## 25. `git status --porcelain`

```
?? "Claude outputs/MetYet_Object_Level_Binder_Membership_Batch_3A_Hand_Back.md"
```

## 26. 3B was not started

Confirmed. The per-card Binder checkbox in `CardSpecification.jsx` still sends
`addBinderEntry` and `removeBinderEntry` and still files a **CARD**. No control
anywhere sends `fileObject` or `unfileObject`. No screen shows a Goal's or a copy's
Binder. `binder_entries` is written exactly as before, by exactly the same code
paths, and nothing reads a membership to render anything.

The one place scenario T touches the panel is the plan it builds and the id it binds
— the card-level commands it sends are unchanged, and the generalised binding is
what 3B will use when it changes which command the control sends.

**No blocker was hit.** Scenario T is fully fixed without the per-object UI, because
T is a defect in how the panel sequences and binds the commands it already sends,
not in which commands those are.

---

## Push

Still refused. The cloud proxy returns 403 — `Davi17000/metyet-app is not in this
session's authorized repository set` — re-verified at the end of this batch. Not
worked around. The commits are delivered as a git bundle with its SHA-256 verified
on the Mac; `git bundle verify` then `git fetch` applies them.
