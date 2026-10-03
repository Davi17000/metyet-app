# MetYet — Binder Membership Belongs to Goals and CollectorCopies — Batch 3 Pre-Implementation Audit

**Nothing was implemented.** No file in the repository was edited.

Tags: **[F]** repository fact, verified by reading or running the code; **[P]** closed product decision, taken from the brief; **[R]** recommendation.

**This document's recommendation changed under adversarial review.** The first draft recommended re-keying `binder_entries` in place. An adversarial pass — which applied the proposed migration to a real in-process Postgres and drove the real repository through it — demonstrated that it produces a **503 on the batch's own headline operation** and that its rollback plan causes a total outage. §6 records the better design and why the first one was wrong. The corrections are not cosmetic and the reasoning is kept visible rather than tidied away.

---

## 0. Four things to read before the rest

### 0.1 [F] A live defect: a Binder created in the same Save is never filed into, and the Collector is told nothing

Shipping behaviour today. Scenario T of the brief.

`CardSpecification.jsx:403` puts a new binder's **name** into `answers.newBinders`. Nothing translates it to an id. `answers.binders` — the set the `file` steps come from (`:263-265`) — is populated only from `state.binderEntries` (`:330`), from `toggleBinder` over `state.binders` (`:394-398`), and from `preselectBinder` checked against `state.binders` (`:350-354`). So the plan contains `make-binder` and **no `file` step for it**. Verified directly:

```
plan (new binder + an existing one ticked):
  [{"kind":"make-binder","name":"Mudkips"},{"kind":"file","binderId":"bd1"}]
plan (only a new binder):
  [{"kind":"make-binder","name":"Mudkips"}]
```

Meanwhile `:590-597` renders the pending binder as a **checked, disabled checkbox** labelled `Mudkips — new`, beside the binders the Collector ticked themselves.

**And on success the panel says nothing at all.** `explain` runs only on a refusal (`:503`); the success path calls `onClose()` at `:538`. So the Collector types a name, sees it ticked, presses Save, the panel closes, and an empty binder exists with the card not in it — with no message of any kind. (The first draft of this audit said the panel "reports unqualified success"; it is quieter than that, and the silence is why nobody finds out.)

**And a retry duplicates it.** `make-binder` is pushed unconditionally (`:147`) with no check against `state.binders`, and `createBinder` has no duplicate-name rule (`:1206-1213`). After a mid-Save refusal the second Save re-sends it and a second binder of the same name appears. The source comment at `:467` — and the sentence `explain` builds at `:877-878`, *"pressing Save again sends only what is left"* — is true for copies, Goals and entries, and **false for binders**.

**[R] A blocker, and it belongs inside Batch 3.** The point of object-level membership is that a Collector can say "this Goal, in this new binder" in one gesture, and that gesture is broken before any of it starts.

### 0.2 [F] A binder entry has no identity of its own, and its primary key is an array index

`binder_entries` is `ord integer primary key, binder_id text not null, canonical_card_id text not null, attrs jsonb not null` (`0013_binders.sql:91-104`). `ord` is assigned in `toRows` as the **JavaScript array index**, recomputed on every save (`world-repository.js:209-211`), and never enters the domain record (`fromRows:248-275`).

Two consequences. **Write amplification:** the diff engine keys rows by `JSON.stringify([ord])` (`:337-343`), so removing the first of fifty entries rewrites forty-nine rows (in two batched statements, not forty-nine round trips). **And no stable handle on a legacy row:** the only durable key is the `(binder_id, canonical_card_id)` unique index.

The second consequence turned out to be the decisive constraint on the whole design — §6, finding S1.

### 0.3 [F] Membership is N:M today and the target is 1:1, and the repository already says so

A canonical card can be filed in **unlimited** binders — the unique index, the validator key and the command's duplicate check are all scoped per binder (`0013:103`, `metyet-world.js:402`, `metyet-commands.js:1275-1276`). Verified: one card, two binders, `validateWorld` → true. And three physical copies of one card share **one** membership row. `metyet-commands.js:1194-1200`:

> *"MEMBERSHIP NAMES THE CANONICAL CARD, AND THAT IS TRANSITIONAL. … owning three physical copies of one card does not mean three places it belongs. That last one is the tell: three actionable objects share one row, which is why the row is on its way to naming the object instead. Until it does, nothing here pretends it already names one."*

So this is not a tightening of one relation. It is a different relation: today *"which cards are in this binder"*, target *"which binder is this object's home"*.

### 0.4 [P] + [F] The doctrine removes a capability the code calls "the commonest state a binder starts in", and that should be said out loud

**[P]** *"Nothing enters a Binder unless it represents a specific Goal or a specific CollectorCopy."*

**[F]** That deletes a capability the repository currently defends in writing. `metyet-world.js:365-368`:

> *"there is deliberately no check that the card is wanted, owned or offered, because a Binder entry whose card the Collector neither wants nor owns is valid curation — **the commonest state a binder starts in**. Coupling this to Goals or copies would make organising imply demand, which is the one thing a Binder must never do."*

And door #2 of the filing routes — Binders → **"Add cards to this binder"** → Browse → tick → Save (`Binder.jsx:213` → `CollectorShell.jsx:644` → `Browse.jsx:179`) — exists for precisely that act. A card reached that way has no Goal and no copy, and under the doctrine it would have nothing to file.

**[R] This is a product decision, not a technical one, and it is the one thing in this audit I would want confirmed before implementing.** Three coherent positions:

1. **Bare-card filing ends.** Door #2 becomes "add a card you want or own to this binder", and the panel's want/own sections become the way in. Honest, and it makes a binder strictly a view over meaningful objects — which is the doctrine as written.
2. **Bare-card filing survives as a third membership kind** — a card-level row that is *intentional* rather than legacy. This contradicts the doctrine's first sentence and re-creates the ambiguity §12 exists to avoid: a card row would again mean two things.
3. **Bare-card filing survives as "shortlist", a different concept with a different name**, outside Binders entirely.

The recommended representation in §6 is deliberately chosen so that **this decision does not have to be made in Batch 3**: it leaves `binder_entries` untouched and working, so card-level filing keeps functioning exactly as it does today while object-level membership is built beside it. Whichever position wins, Batch 3's code is the same.

---

## 1. SHA and worktree

| | |
|---|---|
| Branch | `phase-5-four-state` |
| HEAD | `b006f81` — Docs: Batch 2 hand-back |
| Batch 2 implementation | `8d1840a` — present |
| Batch 3 | not begun |
| Full suite at this SHA | 143 suites, 4,881 assertions, 0 failed |
| `git status --porcelain` | **`?? "Claude outputs/MetYet_Object_Level_Binder_Membership_Batch_3_Audit.md"`** — this document, which `Claude outputs/` does not gitignore. No tracked file is modified. §24 |

---

## 2. Persistence inventory

### [F] `binders` — `0013_binders.sql:77-86`

```sql
create table metyet.binders (
  id           text    primary key,
  ord          integer not null,
  collector_id text    not null,
  attrs        jsonb   not null,
  constraint binders_collector_fk foreign key (collector_id)
    references metyet.collectors (id) deferrable initially deferred
);
create index binders_collector_idx on metyet.binders (collector_id);
```

`attrs` holds `name`, `createdAt`, `archivedAt`. **No `unique (collector_id, name)`** — two binders of one Collector may share a name and the domain does not refuse it.

### [F] `binder_entries` — `0013_binders.sql:91-104`

```sql
create table metyet.binder_entries (
  ord               integer primary key,
  binder_id         text    not null,
  canonical_card_id text    not null,
  attrs             jsonb   not null,     -- addedAt
  constraint binder_entries_binder_fk foreign key (binder_id)
    references metyet.binders (id) deferrable initially deferred,
  constraint binder_entries_canonical_card_fk foreign key (canonical_card_id)
    references metyet_catalog.canonical_cards (canonical_card_id) deferrable initially deferred
);
create unique index binder_entries_one_per_card_idx
  on metyet.binder_entries (binder_id, canonical_card_id);
create index binder_entries_canonical_card_idx on metyet.binder_entries (canonical_card_id);
```

**No `id`. No CHECK on either table.** The domain row is exactly `{ binderId, canonicalCardId, addedAt }` — verified by running the command. **Nothing records what caused the row**: no goal id, no copy id, no actor, no collector id.

### [F] Referential actions

`grep "on delete|on update" persistence/migrations/*.sql` returns **nothing**. Every FK in the schema is NO ACTION, DEFERRABLE INITIALLY DEFERRED.

### [F] The `fields` / `mirrors` contract — load-bearing for §7

`world-repository.js:61-67`:

> *"`fields` are always present ids in a valid world (validateWorld guarantees it), so they live only in their column. `mirrors` may be null, absent or … not an id at all: the record keeps the value in attrs exactly, and the column mirrors it as an id or NULL."*

With the named precedent at `:74-79`: `invitations.collectorId` is a mirror because *"an invitation exists before anyone has joined, so it is null until a redemption resolves one, and a mirror is exactly the shape for 'an id or NULL'."* **A nullable reference is a mirror in this repository, never a field.** The first draft of this audit got that backwards.

### [F] Readers, writers, projections

| | |
|---|---|
| Writers of `binderEntries` | `addBinderEntry` (`:1278`) and `removeBinderEntry` (`:1292`). Nothing else, anywhere |
| Writers of `binders` | `createBinder` (write at `:1211`, id returned `:1212`), `renameBinder` (`:1224`), `setBinderArchived` (`:1250`) |
| Owner's projection | `binders: clone(myBinders)`, `binderEntries: clone(… filter(myBinderIds.has(e.binderId)))` (`metyet-projection.js:427-428`) — **whole rows, no field allow-list** |
| Partner's projection | `binders: []`, `binderEntries: []` (`:521-522`), explicit empties |
| Archived binders | still project, entries included. Only the UI hides them (`Binder.jsx:83-85`) |
| An unknown collection | **tolerated.** Verified: `validateWorld` accepts a world carrying a collection it has never heard of. Decisive for §6 |

### [F] `validateWorld`'s binder rules today — `metyet-world.js:362-408`

Nine rules: both collections present and arrays; every element an object; binder ids present and unique; `collectorId` resolves to a collector; `name` a non-blank string; `archivedAt` a string or blank; entry's `binderId` resolves to a binder; entry's `canonicalCardId` a non-blank id (existence left to the catalog FK); `(binderId, canonicalCardId)` unique world-wide. No owner-coherence rule of any kind, because an entry names a card and a card has no owner.

---

## 3. Command inventory

[F] Six commands match `/binder/i`; five are real.

| Command | Refusals, in order | `ctx.id` | Archived check | Duplicate | Exposed |
|---|---|---|---|---|---|
| `createBinder({name})` `:1206` | `notOwner` `:1207`; `nameRequired` `:1209` | `"bd"` `:1210`, **after** both | n/a | **none — duplicate names allowed** | yes `:106` |
| `renameBinder` `:1215` | `notFound` `:1217`; `notOwner` `:1218`; `nameRequired` `:1220` | no | **none** | n/a | yes `:128` |
| `setBinderArchived` `:1243` | `notFound` `:1245`; `notOwner` `:1246`; `notFound` for a non-boolean `:1247` | no | idempotent `:1248-1249` | n/a | yes `:129` |
| `addBinderEntry` `:1265` | `notFound` `:1267`; `notOwner` `:1268`; `notFound` for a blank card `:1274` | **never — the pair is the key** | **NONE.** The domain files into an archived binder; only the UI filters (`CardSpecification.jsx:385`) | **idempotent**, `done(state, true)` | yes `:107`, plus the server's `card-unavailable` guard (`app.js:86-91, 475-488`) |
| `removeBinderEntry` `:1285` | `notFound` `:1287`; `notOwner` `:1288` | no | **none** | idempotent, `done(state, false)` | yes `:108` |
| `markBinderReviewed` `:1382` | — | — | — | — | a **relationship** command; `exposed-commands.js:125-127`: it *"has nothing to do with a Binder but its name"* |

**[F] No refusal is wasted on an id.** Only `createBinder` mints, after both its refusals.

**[F] There is no MOVE.** Remove-then-add: two commands, two transactions, a fresh `addedAt`. `client/commands.js:352-365` exposes the two thunks independently.

**[F] `addBinderEntry` can name nothing but a canonical card** (`metyet-world.js:391-396`), and **there is no binder-specific refusal code anywhere** — `not-found` does triple duty. One binder code existed and was deleted with the filing guard in `b68b1ae`.

---

## 4. Filing entry points

**[F] Exactly one writer of a binder entry in the whole client**: `CardSpecification`'s `file`/`unfile` steps, dispatched at `client/sign-in/SignIn.jsx:232-233`. So "routes" means "mount sites of the panel": four mounts, one unreachable, **five reachable doors**.

| # | Door | Mount |
|---|---|---|
| 1 | Browse → card → printing → panel | `Browse.jsx:175-182`; user ticks |
| 2 | Binders → open a binder → **"Add cards"** → Browse → card | `Binder.jsx:213` → `CollectorShell.jsx:644` → `Browse.jsx:179`; `preselectBinder` pre-ticked at `CardSpecification.jsx:348-356`. **The bare-card door — see §0.4** |
| 3 | Binders library → "Not in a binder yet" (a Goal's row) → Open | `Binder.jsx:229-231`, opened `:332` |
| 4 | Binders → a collection view → Open | `Collection.jsx:315-316`, opened `:340` |
| 5 | Binders → open a binder → a card row inside it → Open | same component (`Binder.jsx:209-210` composes `Collection`); also how unfiling happens |
| — | **dead** | `Binder.jsx:198-203` — nothing in the `looking` branch sets `specifying` |

Corrections to the brief's list: there is no Goals-screen route (`Goals.jsx` is deferred, `CollectorShell.jsx:162-175`, and names no binder); "Collection/owned-card view" is the same component and panel instance as #4/#5; door #5 was not listed.

### [F] Per-door answers (identical — it is one panel)

1. **Before:** anything — no object, a Goal, 1..n copies, or an existing membership elsewhere.
2. **After:** that, plus one row per newly ticked binder.
3. **A Collector can file a card they neither want nor own, and it is designed.** Verified: a card with no Goal and no copies, two binders ticked → `[{file bd1},{file bd2}]`. Filing cannot create an object.
4. **A Goal plus two copies of one card, two binders → two memberships, not six.** Inside a binder, `withCopies = kind !== "binder"` means **no copies are shown at all** (`Collection.jsx:287`).
5. **One Save can create an object and file its card — only into a binder that already existed.** §0.1.
6. **Ids in hand:** `canonicalCardId`; `binderId` only ever already-minted; `plan.goal.id` only for an existing Goal; `draft.id` or `draft.key`. **Nothing for a binder named this session.**

**[F] No other screen writes an entry**, but there is **no repo-wide pin** that only `CardSpecification` may produce a `file` step; `phase5-binders-cross-views.cjs:376` asserts it of `Collection.jsx` alone, and its regex does not include any new command name.

---

## 5. Ids, minted ids and the frozen plan

[F] All verified after Batch 2.

| | |
|---|---|
| `addGoal` | `ctx.id("g")` `:397`, returned `:443` |
| `addCollectorCopy` | `ctx.id("b", askedId)` `:1008`, returned `:1027` |
| `createBinder` | `ctx.id("bd")` `:1210`, returned `:1212` |
| `addBinderEntry` | **returns a boolean**, never an id |
| Caller-proposed ids | only `addCollectorCopy` reads one, honoured only by the **prototype** runtime (`metyet-runtime.js:148` vs `:154`); `executeCommand` refuses anything but authoritative (`command-transaction.js:54-57`). **In production no caller can propose any id** |

**[F] Exactly one step kind carries an id binding: `record-copy`, via `draftId`.** `commit:507` narrows it to `step.kind === "record-copy" && step.draftId`; `adopt:479-483` rewrites only `answers.copies`; `steps` is a `const` at `:490`, never rewritten. Therefore the minted **Goal** id and the minted **Binder** id are both discarded — the latter being the mechanism of §0.1 — and there is **no id binding for `start-looking`** at all.

**[F] Retry re-derives the plan from the projection rather than replaying steps.** `record-copy` skipped because `adopt` filled `draft.id`; `start-looking`, `file`, `unfile` skipped because the projection moved; **`make-binder` re-sent every time**, `:147` being unconditional.

**[F] And there is a one-transaction batch fold that is already in production.** `executeCommands` (`command-transaction.js:116-167`) is required and called by `server/inventory/import.js:39,226` for CSV import, pinned by `phase5-c8:1151-1165`, and its per-command refusal contract `{ok:false, refused, at, version}` (`:135`) is already mapped back to a source line at `import.js:231-240`. (The first draft of this audit said nothing called it. False.) **What is missing is an HTTP entry point, not the mechanism** — which matters for §10, because a genuinely atomic Save is closer than it looks.

---

## 6. Representation recommendation

### [F] Why the obvious answer is wrong — demonstrated, not argued

The first draft recommended **re-keying `binder_entries` in place**: nullable `goal_id` and `collector_copy_id` beside a now-nullable `canonical_card_id`, a three-way CHECK, two partial unique indexes. An adversarial pass applied exactly that to a real in-process Postgres (PGlite + the real migrations, the same harness `phase5-c31` uses at `:34-71`) and drove the real repository through it. Three findings, in descending severity:

**S1 — a legitimate move fails with a unique violation, and the Collector gets a 503.** `ord` is positional (§0.2). If filing replaces a home the natural way — `filter` out the old row, push the new one — the array reorders, every `ord` shifts, and the repository issues **one multi-row `INSERT … ON CONFLICT (ord) DO UPDATE`** (`:344-346`). A non-deferrable unique index is maintained per row as that statement progresses, so the reshuffle creates a transient duplicate:

```
MOVE via repository-style upsert -> FAILED:
  duplicate key value violates unique constraint "binder_entries_one_home_per_goal_idx"
MOVE in place (ord stable)       -> SUCCEEDED
```

Both row orderings collide, so it is not luck. **The pre-existing `binder_entries_one_per_card_idx` has the same hazard** — swapping a legacy row for an object row at a shifted position made the real repository throw `persistence.database`, which maps to `service_unavailable` (`server/errors.js:57`). A 503 on "move this Goal to that binder".

**S2 — the nullable columns would have been put in the wrong slot.** Per the contract quoted in §2, a nullable reference is a `mirror`, not a `field`. As `fields` they would also add `goalId: null` to every legacy record, breaking the three-key fact §2 verifies, and a junk value like `"   "` would reach the column raw and fail the FK at COMMIT — a 500 where a refusal belongs.

**S3 — and making `canonicalCardId` a mirror too makes every stored world unloadable**, because the value lives in the column and not in `attrs`, so the mirror check computes `expected = null` and reports drift. It would need an `attrs` backfill migration of its own.

**S4 — the rollback claim was false, and the failure is a total outage.** With one object row written, the **reverted** repository cannot load the world at all: `persistence.invalid-world — ref.missing at binderEntries[0].canonicalCardId`. `loadWorld` runs on every command and every `/api/view`, so after the first filing the reverted build is down for everyone.

### [R] Recommendation: a new `binder_memberships` table, with `binder_entries` frozen

```
binder_memberships(id, binder_id, goal_id?, collector_copy_id?, attrs{filedAt})
```

A minted id of its own. Exactly one of the two object columns. `binder_entries` is not altered at all.

**Why this and not the in-place re-key:**

| | in-place re-key | **new table** |
|---|---|---|
| S1, the reshuffle 503 | present, and needs a new unstated invariant ("no command may reorder `binderEntries`") plus deferrable constraints | **gone.** An id-keyed table never shifts rows |
| S2 / S3, the mirror subtlety | two traps in one spec | **gone.** A fresh spec whose columns are all always-present |
| S4, rollback | **total outage** after the first filing | **safe.** Verified: `validateWorld` tolerates a collection it has never heard of, and a reverted `world-repository.js` has no spec for the table, so it is simply not read. Memberships become invisible; nothing breaks |
| §0.2's amplification and the missing stable handle | deferred to a later, *non-additive* PK change — ahead of a bulk resolution campaign that needs stable handles | **solved inside Batch 3** |
| "exactly one target" | a three-way CHECK | a two-way CHECK |
| Retirement | drop a column, an index, the CHECK's third branch, and the writer | **`DROP TABLE binder_entries`** |
| §0.4, bare-card filing | forces the decision now — the card column's fate is the same question | **defers it.** `binder_entries` keeps working either way |
| "What is in this binder?" | one table | two — but §11 requires two visually distinct groups anyway, and `Collection.jsx:203-207` already unions entries ∪ goals ∪ copies on another screen |

**[F] And the argument the first draft leaned on does not hold.** It invoked a "house pattern": five records that name their card in one of two spellings (`metyet-world.js:214-223`, `:266-275`, `:298-307`, `:451-458`, `:536-545`). Those five are *exactly one of two spellings of the same referent* — every branch answers "which card?", the subject never changes, neither branch carries an owner. A three-way row whose branch decides **what the row is about** is a discriminated union with three lifecycles and two owner-bearing branches, which is why that draft also had to concede that the DB could not check owner coherence. §0.3 says as much in its own words — "a different relation" — and the draft then cited the same-relation precedent anyway.

**[R] Candidate B, object-side `filedIn`, is not recommended but was under-credited.** Its "at most one home" really is structural — no index, no CHECK, no uniqueness rule, and no reshuffle hazard — and the `addedAt` objection was a straw man (`filedIn` + `filedAt` as sibling scalars is this repo's own idiom). It loses on two counts: `binder_entries` has to survive for the legacy rows regardless, so it is two representations either way; and `addCollectorCopy`'s rest-spread (`:963`) writes any unlisted key onto the stored row — verified: `copy.filedIn` is stored verbatim and `validateWorld` accepts it — so object-side membership is writable by the creation command. That is one line to fix and `server/inventory/import.js:215-220` shows the repo already fixing it at a caller, so it is a smaller objection than the first draft claimed; but with the new table winning on every other axis, B has no remaining advantage.

---

## 7. Transitional schema

**[R]** Designed, not written. Migration `0014_binder_memberships.sql`.

```sql
create table metyet.binder_memberships (
  id                text    primary key,
  ord               integer not null,
  binder_id         text    not null,
  goal_id           text    null,
  collector_copy_id text    null,
  attrs             jsonb   not null,          -- filedAt
  constraint binder_memberships_names_one_object check (
    (goal_id is not null) <> (collector_copy_id is not null)
  ),
  constraint binder_memberships_binder_fk foreign key (binder_id)
    references metyet.binders (id) deferrable initially deferred,
  constraint binder_memberships_goal_fk foreign key (goal_id)
    references metyet.goals (id) deferrable initially deferred,
  constraint binder_memberships_copy_fk foreign key (collector_copy_id)
    references metyet.collector_copies (id) deferrable initially deferred,
  constraint binder_memberships_one_home_per_goal unique (goal_id) deferrable initially deferred,
  constraint binder_memberships_one_home_per_copy unique (collector_copy_id) deferrable initially deferred
);

create index binder_memberships_binder_idx on metyet.binder_memberships (binder_id);
```

**[R] Four deliberate choices, each with its reason.**

1. **`(a is not null) <> (b is not null)`** rather than a three-term sum: with two columns, XOR *is* exactly-one, and it reads as the rule.
2. **`unique … deferrable initially deferred`, not a partial unique index.** This is the direct answer to S1. A deferrable *constraint* is checked at COMMIT, so it survives any reshuffle the repository's batched upsert performs; a partial *index* cannot be deferred and is the one form that breaks. NULLs are distinct in a unique constraint, so the `where … is not null` clause buys only index size and costs deferrability. The adversarial pass verified both halves: a move succeeds, and two homes for one Goal is still refused.
3. **No `ON DELETE`**, because no FK in this schema has one and introducing the first here would make `removeGoal` fail at COMMIT. Removal is handled at the command boundary — §14.
4. **No composite owner FK yet.** It is the right eventual answer and the precedent exists (`opportunity_trade_refs` carries a redundant `collector_id` with an FK on `(binder_id, collector_id)`, `0001_canonical_world.sql:215-217`, backed by `binder_copies_owner_key unique (id, collector_id)` at `0001:150`, inherited by `collector_copies` through the `0011` rename). But `binders` and `goals` are `id`-only today, so two new unique keys would be needed first. The command and the validator can both express the rule now — §8.

**[R] `binder_entries` is not touched by this migration at all.** No new column, no widened NOT NULL, no changed constraint. That is the point.

**[R] `NOT VALID` is not needed** — a brand-new empty table is validated instantly, which is a further small advantage over altering a populated one under `ACCESS EXCLUSIVE`.

**[R] The repository spec**, for `world-repository.js`:

```js
{ collection: "binderMemberships", table: "binder_memberships", key: ["id"],
  fields: [["id", "id"], ["binderId", "binder_id"]],
  mirrors: [["goalId", "goal_id"], ["collectorCopyId", "collector_copy_id"]] },
```

`id` and `binderId` are always present, so they are **fields**; the two object columns are nullable by construction, so they are **mirrors** — the `invitations.collectorId` shape exactly (§2). This is the S2/S3 correction.

---

## 8. Constraints, indexes and FKs — what enforces what

| Rule | Command | DB | `validateWorld` |
|---|---|---|---|
| names exactly one of goal / copy | yes, by construction (two commands, one subject each) | **yes**, the XOR CHECK | yes, the exactly-one idiom |
| at most one Binder per Goal | yes | **yes**, deferrable unique | yes, the `filed`-set idiom at `:402-408` |
| at most one Binder per Copy | yes | **yes**, deferrable unique | yes |
| the object exists | yes | **yes**, two FKs | yes — `goals` and `collectorCopies` are already indexed at `:131`/`:133` |
| binder and object share an owner | **yes — the only layer that can today** | not without two new unique keys and a redundant column (§7) | yes, `ownerMismatch` `:148` is the verb and `:470-472` the shape |
| no NEW legacy card row | **yes, if §0.4 position 1 wins**, by un-exposing `addBinderEntry` | no — the DB cannot date a row | no |

---

## 9. Command recommendation

### [R] Two new commands

```
fileObject({ binderId, goalId?, collectorCopyId? })      — file, and therefore MOVE
unfileObject({ goalId?, collectorCopyId? })              — no home
```

**Why `fileObject` is also the move**, and the argument is not the one the first draft gave. The `setBinderArchived`-over-`archiveBinder` precedent (`:1228-1235`) is about one reversible state versus two one-way commands, which is a different question. The real reason is in the panel: remove-then-add across two transactions can leave an object belonging **nowhere** if the second fails, and `planFrom` already orders unfile *after* file for exactly that reason (`CardSpecification.jsx:261-262`). One command cannot half-happen.

**[R] And the implementation is constrained, not free.** `fileObject` must **update the existing row in place** (`map`, never `filter`-then-push). With the deferrable constraints of §7 a reshuffle no longer breaks, but in-place is still correct: it preserves the row's id, which is the handle everything else will use.

| Situation | Answer |
|---|---|
| exactly one of `goalId` / `collectorCopyId`, each a non-blank string | required |
| both, or neither, or a non-string, **or a blank/whitespace id** | **`invalid-target`**, refused before any mint |
| no such binder / object | `not-found` |
| binder or object not this Collector's | `not-owner` |
| **binder is archived** | **`binder-archived`** |
| already filed in this binder | **idempotent**, `done(state, true)`, `filedAt` preserved |
| filed in another binder | **replace in place**, one step, new `filedAt` |
| `unfileObject` on an unfiled object | **idempotent**, `done(state, false)` |
| a legacy card row for the same card | **untouched.** Filing a Goal does not consume, convert or remove it |

**[R] Blank ids are refused explicitly**, because `isId` does not trim (`world-repository.js:174`) and a whitespace id would otherwise reach the column and fail the FK at COMMIT — a 500 where a refusal belongs. `addBinderEntry:1269-1274` already wrote this lesson down: *"A BLANK IS NOT AN ID … a door should say no for its own reasons."*

**[R] One refusal code, `invalid-target`, for neither / both / malformed / blank** — with the counter-argument recorded, because it is a fair one. `validateWorld` distinguishes `ref.ambiguous` from `ref.missing` at all five two-spelling sites, so the codebase does separate contradiction from absence. But those are **validator report codes**, not refusal codes, and the refusal vocabulary has consistently gone the other way: Batch 1's `invalid-tier` and Batch 2's `invalid-disposition` each cover absence, garbage and wrong-shape with one code, on the argument that they all fail at the same thing. Here they do too: *the request did not name exactly one object.* Refusal codes 42 → **44**.

**[R] `binder-archived` is defence-in-depth, and that is enough justification.** It is unreachable from the UI today (`CardSpecification.jsx:385`, `:350-351`), which is exactly the condition under which this repo still adds a door — `:1269-1273`. The *product* argument the first draft gave ("a home should not be a shelf put away") is weaker than it looked, because `Collection.jsx:196-202` reasons at length that archiving *"does not un-file what is in it"*. **And it creates an asymmetry worth stating:** after this, `unfileObject` works on an archived binder and `fileObject` does not, and `addBinderEntry` — if it survives §0.4 — still permits filing into one. Two tables, one shelf, different archived semantics.

**[R] Exposed commands: 23 → 25.** `addBinderEntry`'s exposure is **not** touched in Batch 3; its fate is §0.4's decision and belongs to whichever phase makes it.

---

## 10. Create-and-file recommendation

### [R] Generalise the panel's minted-id binding; keep filing as its own command

Not "carry a binder in `addGoal` / `addCollectorCopy`": it couples creation to organisation, which the salvage batch deliberately decoupled (`:1176-1180`), and it still cannot file into a binder created in the same Save — the actual broken case.

The binding must be **general**, not a second special case beside `record-copy`:

1. `commit` records `answer.value` for **every** minting step, keyed by the step.
2. `make-binder` carries a client-side handle of the same shape as `draftId` — honest for the same reason: it is the identity of a binder with no durable one yet. A later step may name that handle, resolved from the minted map at dispatch.
3. `adopt` extends to `answers.newBinders`, rewriting a created binder into `answers.binders` with its real id — the same move it already makes for copies.
4. `start-looking` and `record-copy` likewise yield ids a later `fileObject` can name, which is what makes "new Goal, new binder, one Save" work.

**[R] The first draft's fourth item was wrong and is withdrawn.** It proposed skipping `make-binder` when a binder of that name already exists. But there is no `unique (collector_id, name)` and `createBinder` has no duplicate-name rule (§2), so that skip would silently remove a legal capability — two binders of one name — and on retry "the name exists" cannot say *which* binder it is, so the follow-on filing could target the wrong one. Items 1–3 already solve the retry: once the minted id is adopted, the step is not re-derived.

**[F] A Save is still N transactions.** One POST per step (`commit`'s loop; `production-store.js:180-181` serialises them), one transaction per command (`command-transaction.js:60-83`, header: *"One HTTP request is one command is one transaction"*). What changes is that the retry becomes honest and the new binder is actually used.

**[R] True atomicity is nearer than it looks and is still its own batch.** `executeCommands` is live in production for CSV import and already answers "which of four failed" (§5). What it lacks is an HTTP entry point and a client that stops sending one POST per step. Worth naming as the destination; not Batch 3.

---

## 11. Legacy compatibility

### [R] The brief's strong prior is correct, and should be adopted verbatim

> Legacy rows are **readable** and **removable**, **never creatable**, and **never a fallback answer** to "which Binder is this Goal or CollectorCopy in?"

| | |
|---|---|
| displayable | **yes** — they are what a binder's card list is made of today |
| removable | **yes**, `removeBinderEntry` unchanged |
| movable / editable | **no.** Moving a row whose meaning is unknown is a decision about what it meant |
| newly creatable | **§0.4's decision.** The recommended representation does not force it in Batch 3 |
| a fallback for an object's home | **never.** If no membership names the object, the object is **unfiled**, and the UI must say so |
| converted automatically | **never**, however few candidates exist. §12 |

**[R] The rendering consequence is the real work.** A binder's contents become two groups: the objects filed in it, and — labelled as what they are — the cards filed before memberships named objects. §16/P2 and §19 explain why this is larger than it sounds.

---

## 12. The ambiguity matrix

[F] All verified by running the domain.

| # | Situation | Possible? | Resolvable by inference? |
|---|---|---|---|
| 1 | no Goal and no copy | **yes — the designed common case** (`metyet-world.js:365-368`) | nothing to resolve to |
| 2 | exactly one Goal, no copies | yes | **no** — below |
| 3 | exactly one copy, no Goal | yes | **no** |
| 4 | one Goal and one copy | yes | no — two candidates |
| 5 | **two Goals for one card for one Collector** | **not through `addGoal`** (`duplicate-goal`, `:391-396`) — **but yes in any hand-assembled world**: no validator rule, no unique index. Verified: `valid: true` | no |
| 6 | several copies of one card | **yes, legitimate and load-bearing** (`metyet-domain.js:1549-1555`) | no — N candidates |
| 7 | one Goal plus several copies | yes | no |
| 8 | same card in several binders | yes | no — and an object can only be in one, so N rows cannot all become object rows |
| 9 | binder archived | yes, membership untouched (`:1237-1239`) | orthogonal |
| 10 | legacy-`cardId` copy with no canonical id | the copy can exist; its card **cannot be filed** in production; **no card row can ever match it** — `groupIdOf` keys it `legacy:<cardId>` while entries key canonically (`Collection.jsx:121-131`), so *"the two vocabularies never meet"* (`metyet-world.js:496-509`) | **impossible by construction** |

### [R] Case 2 is the trap, and the answer is still no

**It is not a fact about today.** The row was written when a Collector filed a *card*. The Goal may post-date it; a copy they held at the time may have been sold. The row records an act, not a referent, and **nothing on it records what caused it** (§2) — so "exactly one candidate now" is a statement about the present world, not about the row's intent.

**And the one-candidate premise is not guaranteed.** Case 5 shows Goal cardinality is a *door*, not an invariant: command-only, no validator rule, no unique index. Any automatic mapping would rest on a rule the database does not enforce.

**[R] So unresolved legacy rows stay compatibility rows until a person resolves or removes them.** The product may *offer* a resolution — "this card is in Mudkips; is that the Goal, this copy, or just the card?" — which is a Collector deciding, and the only kind of answer that is true.

---

## 13. Archive and delete

**[F] `setBinderArchived` writes `archivedAt` and nothing else** (`:1237-1239`: *"IT TOUCHES NOTHING ELSE. Not the entries — an archived binder still holds its cards, or unarchiving would be a different binder."*). Archived binders and their entries still project; only the UI hides them.

**[F] There is no Binder delete command anywhere, at any layer** — the domain's runtime `COMMANDS`, the exposed list, `client/commands.js`, `Binder.jsx`, the prototype, the harness. `exposed-commands.js:122-125` says so in prose.

**[R] Batch 3 invents no Delete Binder.** If one is ever added: unfile each member, leave the objects alive, by command rather than FK cascade — this schema has no referential actions and here would be a surprising place to start.

**[R] Archive gets one new rule and no more:** `fileObject` refuses `binder-archived`, with the asymmetry noted in §9.

---

## 14. Object removal

**[F] `removeGoal` and `removeCollectorCopy` do not touch `binderEntries`, by recorded decision.** `removeGoal:620-622`: *"ORGANISATION IS NOT A CONSEQUENCE OF THIS."* `removeCollectorCopy:1158-1160`: *"Interests cascade because they NAME this copy … **A binder entry names a card, not this copy, so it is not touched**"* — a sentence that becomes false the moment a row names the copy. The coupling was deleted in `b68b1ae` with `pruneOrphanedMemberships`.

**[F] `removeCollectorCopy` cascades `interests` and only `interests`**; trade rows are a *refusal* (`copy-committed` / `copy-reserved` / `copy-in-use`), so none can be orphaned.

**[F] And `domain/README.md:142-149` states the rule Batch 3 reverses**, giving this very reason: *"**Membership points at the CANONICAL CARD — not a Goal, not a CollectorCopy.** This is the whole design and it is load-bearing"* — because `removeCollectorCopy` deletes, so a copy-named membership would die with a sale. §14's answer is that dying with the sale is **correct**: the membership is that copy's home, and the copy is gone.

**[R] Removal deletes the object's membership, in the same command, and the comments are rewritten.** Three reasons: the FKs have no `ON DELETE`, so a surviving row would make removal fail at COMMIT; `interests` is the precedent *in the very same command* for cascading a row that names the object; and the withdrawn rule this does not resurrect is a different one — pruning on a **state change** is not removing a membership whose subject no longer exists. The replacement rule holds: *Binder organisation must not determine whether a Goal or CollectorCopy is meaningful, and state changes must not silently destroy organisation.* Deleting the object is not a state change.

---

## 15. Privacy and projections

**[F] Sound today, and asserted.** The partner gets `binders: []`, `binderEntries: []` as explicit empties with the reasoning at `metyet-projection.js:509-518`. Pinned by six tests in `phase5-c31-binder-foundation.cjs`, including a whole-body grep for the name and id (`:498`) and a no-count-leak test (`:518`).

**[F] `binderId` is overloaded three ways**, written down in four places. Genuinely a Binder: `binderEntries[].binderId`, `binder_entries.binder_id`, four command parameters. A **CollectorCopy** wearing the pre-C2 name: `interests[].binderId`, `trade.cards[].binderId`, `opportunity_trade_refs.binder_id`, `proposeTradeSelection({binderIds})`, `collectorCopyStatus(binderId,…)`, `referencedCopies`. A relationship timestamp: `markBinderReviewed`.

**[F] No other channel carries a binder.** Opportunity rows, conversations and trade snapshots have none. `validateWorld` messages do name binder ids, but `CODES.invalidWorld` is absent from `PERSISTENCE_TO_API` (`server/errors.js:55-58`), so the client sees `"Something went wrong."`

**[R] A new boundary appears, and it is not the partner one.** The first draft examined only the partner and concluded "leaks nothing new". The Collector→Collector boundary is new: `metyet-projection.js:428` scopes entries **by binder ownership only**, so a membership naming another Collector's Goal would project **that Collector's object id into my own view**. A new table scoped the same way inherits the same gap.

**[R] So the owner check is at the command on both sides, and the projection scopes memberships by the object's owner too — not only the binder's.** A `validateWorld` rule is the right backstop for non-command paths, but it must not be the *only* defence: it fails closed on the whole world (`loadWorld` throws `invalid-world` for every user), which is a worse failure mode than a filtered row. Both, in that order.

**[R] One new privacy pin:** a filed Goal and copy, with a live deal referencing the copy, asserting the partner's view carries neither a binder id nor a membership — the `referencedCopies` path specifically, since that is the one that has been wrong before (`:1794-1807`).

---

## 16. Scenarios A–X

| | Scenario | Today **[F]** | Target **[R]** |
|---|---|---|---|
| **A** | new Primary Goal, unfiled | works | unchanged |
| **B** | new Secondary Goal + Binder A, same Save | two POSTs; `file` names A's existing id; membership is **card-level** | `start-looking` then `fileObject`; needs the general id binding (§10) |
| **C** | new PC Copy + Binder A | as B | `record-copy` then `fileObject` |
| **D** | new Trade/Sell Copy + Binder A | as C | as C |
| **E** | existing Goal, unfiled → A | files the **card** | `fileObject` |
| **F** | Goal A → B | remove-then-add on the card, two transactions | **one `fileObject`**, in place |
| **G** | Goal A → unfiled | removes the **card's** organisation. **No copy was ever filed, so none is unfiled** — which is exactly why scenario L's capability does not exist today | `unfileObject({goalId})`; copies untouched |
| **H** | existing Copy, unfiled → A | files the card | `fileObject` |
| **I** | Copy A → B | as F | one `fileObject` |
| **J** | Copy A → unfiled | as G | `unfileObject({collectorCopyId})` |
| **K** | one card: Primary Goal + PC Copy + Trade/Sell Copy, different homes | **impossible** — one row per (binder, card) | three memberships, three homes. **Needs a per-object control — §19/M1** |
| **L** | two Copies of one card, in A and B | **impossible** | two memberships |
| **M** | legacy row, no Goal/Copy | the common case | stays; readable, removable, never an object's home |
| **N** | legacy row, exactly one Goal | indistinguishable from M | stays **unresolved** — §12 |
| **O** | legacy row, Goal + two Copies | one row | unresolved; resolving it is choosing one of three |
| **P** | one card legacy-filed in A and B | two rows, both valid | both stay; an object may later be filed in one of them |
| **Q** | archived Binder holding filed objects | entries untouched, still project | unchanged; `fileObject` refuses a new filing into it |
| **R** | Binder deletion | **does not exist** | not invented |
| **S** | object removed while filed | nothing dangles (membership is card-level) | removal deletes the membership (§14) |
| **T** | object and Binder both created in one Save | **BROKEN — §0.1**, and silently | works, via the general id binding |
| **U** | retry after partial failure | **duplicates the binder** | the minted id is adopted, so the step is not re-derived (§10) |
| **V** | cross-owner filing | the hole does not exist | `not-owner` on both sides; projection scoped by the object's owner; validator backstop (§15) |
| **W** | partner projection of a filed Copy | `[]` for both | unchanged, plus the `referencedCopies` pin |
| **X** | legacy-`cardId` Copy with no canonical id | the copy exists; its card cannot be filed | **filable at the domain layer** — `fileObject` names the copy by id and never touches card identity. **But invisible on screen until the rendering work**, because every reader keys on the entry's own card spelling (below). A 3B capability, not a free win |

**[F] The rendering dependency, which the first draft missed entirely.** Three readers key on an entry's *card*, so an object-level membership is invisible to all of them until they are changed:

- `Collection.jsx:171-172` — a binder's `cardKeys` are `groupIdOf(e.canonicalCardId, e.cardId, null)`; a membership has neither, so `groupIdOf` returns `null` and **the row is filtered out: the object you just filed is invisible inside the binder**;
- `Binder.jsx:92-97` — `cardsIn` the same way, so the library's card count ignores it;
- `Binder.jsx:100-107` — `filedSomewhereActive` is a set of `canonicalCardId`, so **a filed Goal still appears under "Not in a binder yet."**

**[R] Blockers before implementation: two.** Scenario T, a defect in the shipped build; and the per-object control in §19/M1, without which scenario K — the headline capability — cannot be expressed by any screen.

---

## 17. Census availability

**[F] No production data to count.** No `DATABASE_URL`, no `.env`; `npm run db:status` → `config.invalid`. **No count below is a measurement.**

**[F] But the DDL and every constraint are testable right now.** The suite runs a real in-process Postgres — `new PGlite()` + `fromPGlite` + `await migrate(db)` (`phase5-c31-binder-foundation.cjs:34-71`) — which is how S1–S4 were demonstrated. The first draft's "no live database" was true of the census and misleading about what can be proved.

**[R] Read-only census, for when a production connection exists:**

```sql
select count(*)                                                      as entries,
       count(distinct binder_id)                                     as binders_with_entries
  from metyet.binder_entries;

with e as (
  select be.canonical_card_id, b.collector_id, b.attrs->>'archivedAt' as archived
    from metyet.binder_entries be join metyet.binders b on b.id = be.binder_id)
select (select count(*) from metyet.goals g
          where g.collector_id = e.collector_id
            and g.attrs->>'canonicalCardId' = e.canonical_card_id)   as goals,
       (select count(*) from metyet.collector_copies c
          where c.collector_id = e.collector_id
            and c.canonical_card_id = e.canonical_card_id)           as copies,
       count(*) as rows
  from e group by 1, 2 order by 3 desc;                 -- classification only, never a mapping

select collector_id, canonical_card_id, count(*) as homes
  from (select be.canonical_card_id, b.collector_id
          from metyet.binder_entries be join metyet.binders b on b.id = be.binder_id) e
 group by 1, 2 having count(*) > 1;                     -- one card, several binders

select count(*) from metyet.binder_entries be join metyet.binders b on b.id = be.binder_id
 where b.attrs->>'archivedAt' is not null;              -- memberships in a put-away binder

select count(*) from metyet.collector_copies where canonical_card_id is null;   -- can never match a card row

select collector_id, attrs->>'canonicalCardId' as card, count(*)
  from metyet.goals where attrs->>'canonicalCardId' is not null
 group by 1, 2 having count(*) > 1;                     -- the premise case 5 breaks
```

**[R] The census blocks nothing in Batch 3.** The recommendation adds a new empty table and reads no legacy row. It blocks exactly one thing: **retirement** — `DROP TABLE binder_entries` requires every row resolved or removed, and that needs the numbers. The lock-window concern that would have applied to altering a populated table does not arise for a new one.

---

## 18. Validator sequencing

**[F] The constraint is load-bearing**, and the file names the lesson twice (`metyet-world.js:226-233`, `:473-480`). `validateWorld` runs inside `loadWorld`'s read-only transaction (`world-repository.js:311-316`), in `saveWorld` (`:370-374`), and twice in `command-transaction.js`.

**[F] Under the recommended representation every new rule is about a collection that does not exist in any stored world**, so all of them are safe immediately:

| Rule | Now? | Why |
|---|---|---|
| names exactly one of goal / copy | **yes** | the new collection is empty everywhere; a stored world has no membership to fail it |
| at most one Binder per Goal | **yes** | same |
| at most one Binder per Copy | **yes** | same |
| the object exists | **yes** | `goals` and `collectorCopies` already indexed at `:131`/`:133` |
| binder and object share an owner | **yes** | `ownerMismatch` `:148`, guarded on a resolved ref as every other owner check is |
| `binder_entries` rules | **unchanged** | they are not touched |
| no NEW legacy card row | **never in the validator** | it cannot date a row. That is §0.4's decision, enforced by exposure |
| zero legacy rows | **not until retirement** | it is the retirement condition |

**[F] And this is where the in-place re-key failed hardest.** Under it, today's rule at `:396-398` — `canonicalCardId` required on *every* entry — would itself reject an object row (verified: `ref.missing … names no canonical card`), so the widening and the new rules had to land together, and the strict "exactly one object" form could never be added until every stored row had been migrated. A separate collection has none of that coupling.

**[R] One message fix regardless:** `metyet-world.js:388` builds `Binder entry for card "${e.canonicalCardId}"`. Any new rule needs its own `who`, or a membership reports `card "undefined"`.

---

## 19. Risks

1. **[F] Scenario T is a live defect**, and fixing it means touching the commit loop that carries the draft→minted retry binding three batches have protected. The binding must be **generalised**, not replaced.
2. **[F] The test budget is 20 suites, not six.** Measured: **16** suites pin `EXPOSED_COMMANDS.length === 23`; **7** pin the verbatim sorted list (the first draft said six and missed `c2:827`); **11** reference `0013_binders.sql` as the last migration; **1** pins `migrations.length === 13` (`phase5-collector-identity-stabilization.cjs:661`); **4** pin `COMMAND_NAMES.length === 51`; and `addBinderEntry` appears in **14** test files. Union ≈ 20.
3. **[F] Three of those are doctrinal guards that forbid the later phases, not re-pins.** `phase5-c5:234` (*"a door somebody else opened was closed"*) and `phase5-c34b:1083` (*"a door open at C3.3 has since been closed"*) both compute against historical lists containing `addBinderEntry`; `phase5-c31:645-660` asserts `addBinderEntry` **is** exposed and POSTs it expecting `not-owner`. And `phase5-collector-identity-stabilization.cjs:657-674` is titled **"[19] no migration, and no Binder architecture change"** and pins the entry's exact key set with the message *"a binder entry changed shape"* — a test whose whole purpose is to assert this transition has not begun. Each needs a deliberate, recorded reversal.
4. **[F] `phase5-b81-plumbing-corrections.cjs:195` pins exact set equality** between `client/commands.js`'s `execute("…")` names and `EXPOSED_COMMANDS` — *"nothing may be offered that no screen sends."* So the two new thunks and the two new exposures must land in the same commit, and any later un-exposure must delete its thunk in the same commit.
5. **[F] Goal cardinality is a door, not an invariant** (§12 case 5). Any resolution UI must handle two.
6. **[F] `addCollectorCopy`'s rest-spread** writes any unlisted key onto the row and `validateWorld` accepts it. Not exploited by the recommendation, but an open door worth closing on its own terms — one line, with `import.js:215-220` as the precedent.
7. **[F] `Binder.jsx:94-97` already reads a legacy `e.cardId` shape no command can produce** and the validator rejects. Dead defensive code that will read as precedent for the card-level fallback §11 forbids. It should go.
8. **[R] The UI work is a redesign of the one control the batch exists to change** — §19/M1 below — and the first draft's "largest part of the work and not a redesign" was wrong.

### [F]/[R] M1 — the panel's binder question changes subject

`CardSpecification.jsx:576` asks *"Which binders does this card belong in?"*, and `answers.binders` is a `Set` of binder ids **keyed to the card** (`:330`, `:394-398`). Under object membership one card can carry a Goal and two copies with **three different homes** — scenario K, the headline capability. **A per-card checkbox set cannot express that.** The binder section has to become per-object: a home picker beside the want section and beside each copy row. That reshapes `initialAnswers` (`:323-337`), the file/unfile block (`:263-268`), the step payload, `localProblem`, and the translation at `client/sign-in/SignIn.jsx:230-246`.

**[R] Which is why Batch 3A must not touch the panel's control, and its tests must be domain- and plan-level only.** The first draft listed a mounted-panel `fileObject` test inside a phase it also described as "no visual change" — the panel cannot send `fileObject` without knowing which object, so that phase contradicted itself.

### [R] M2–M6, the other gaps the first draft missed

- **`client/sign-in/SignIn.jsx:230-246`** is the only step→command translation (*"A Collector surface may not name a command"*) and must change shape. It was absent from the file list, and the path was written as `client/collector/SignIn.jsx`.
- **The two new refusal codes need `WHY` sentences** (`CardSpecification.jsx:840-868`), by this repo's explicit rule — *"a refusal with no sentence behind it reaches a Collector as a blank"* — written even for codes believed unreachable.
- **`domain/README.md:126-149`** states the rule Batch 3 reverses, in bold, with its reason. It must be rewritten in the same batch, as Batch 2's README correction established.
- **`server/app.js:86-91` `CARD_NAMING_COMMANDS`** lists `addBinderEntry` and is pinned verbatim at `phase5-c31:741-743`; it needs no change in 3A but is where a future un-exposure leaves a dead entry.
- **The bite mutations that remove a CHECK or a constraint need a DB-backed test**, which the PGlite harness supplies (§17) — worth saying, because a DDL mutation is invisible to a suite that never applies the migration.

---

## 20. The eighteen adversarial answers

1. **Can a generic canonical card be newly filed?** Today yes, and it is designed. **Target: §0.4's open decision.** The doctrine says no; the recommendation does not force it in Batch 3, and the consequence for door #2 should be settled deliberately rather than by a migration.
2. **Can one Goal be in two Binders?** Today the question cannot be asked. **Target: no** — a deferrable unique constraint, a validator rule, and `fileObject` replacing in place.
3. **Can one Copy be in two?** No.
4. **Can a Goal and a Copy of one card be in different Binders?** Today **no**. **Target: yes** — the headline capability, and it needs the per-object control.
5. **Can two Copies of one card be in different Binders?** Today no. **Target: yes.**
6. **Does Primary↔Secondary move a home?** No. `updateGoalTier` touches no membership and must not start.
7. **Does PC↔Trade/Sell move a home?** No.
8. **Does archive change object state?** No. Only `fileObject` gains a refusal.
9. **Can an unresolved legacy membership answer an object's home?** **Never.** No membership, no home. The single most important rule in the transition.
10. **Can a partner see Binder membership?** No — `[]` for both, pinned six ways. The new table is projected on the same terms.
11. **Can a transaction snapshot it?** No. `trade.cards[].binderId` is a **CollectorCopy** id.
12. **Can a malformed command name a Goal and a Copy at once?** It can be sent; refused `invalid-target` before any mutation or mint; the XOR CHECK refuses it independently.
13. **Can cross-owner filing occur?** The hole is new. Closed at the command on both sides **and** by scoping the projection on the object's owner, not only the binder's — because a validator-only backstop fails closed on the whole world. §15.
14. **Can object deletion leave dangling membership?** Removal deletes the membership in the same command; the FKs have no `ON DELETE`, so a survivor would fail at COMMIT; the validator's object-exists rule catches any other path.
15. **Can a retry duplicate membership?** Not a membership — `fileObject` is idempotent. A retry can duplicate a *binder* today (U), which the batch fixes.
16. **Can a Binder and an object created in one Save file together?** **Today no — T is broken and silent.** With the general id binding, yes; a Save remains N transactions, so "reliably" means the retry is honest.
17. **Can a legacy row be silently converted because exactly one candidate exists?** **No** — the firmest position in this audit. §12: the row records an act, not a referent, and the one-candidate premise is not an invariant.
18. **Can a legacy row be moved without resolving what it means?** **No.** Readable and removable, not movable.

---

## 21. The twenty architecture answers

1. **Storage** — a new `binder_memberships` table with a minted id; `binder_entries` frozen and untouched.
2. **Transitional schema** — §7: `id`, `binder_id`, nullable `goal_id`, nullable `collector_copy_id`, XOR CHECK, three FKs, two **deferrable** unique constraints.
3. **Authority for new membership** — a membership row naming exactly one Goal or one CollectorCopy.
4. **Zero-or-one home** — a deferrable unique constraint per object column, a validator rule, and `fileObject` replacing in place.
5. **Exactly-one target** — the XOR CHECK, the validator rule, and `invalid-target` at the command (including blank ids).
6. **Legacy card rows** — compatibility. Readable, removable, never movable, never an object's home.
7. **New legacy rows creatable?** §0.4's decision; not forced by Batch 3.
8. **Legacy rows movable?** No.
9. **Legacy rows removable?** Yes, unchanged.
10. **Does object membership fall back to legacy?** Never.
11. **Command API** — `fileObject` (also the move, in place) and `unfileObject`. New codes `invalid-target`, `binder-archived`.
12. **Create + file** — generalise the panel's minted-id binding; filing stays its own command. Fixes T and U.
13. **CardSpecification minted-id handling** — record `answer.value` for every minting step; a client handle on `make-binder`; `adopt` extends to `answers.newBinders`; resolve a filing target from the minted map.
14. **Same-Save Binder + object creation** — works after 13. Still N transactions; `executeCommands` is the destination for real atomicity and already exists in production.
15. **Object removal** — deletes the object's membership in the same command; no FK cascade.
16. **Binder archive** — unchanged; `fileObject` refuses an archived binder, with the asymmetry stated.
17. **Binder delete** — does not exist; not invented.
18. **Privacy** — partner unchanged. The new boundary is Collector→Collector: scope memberships by the object's owner as well as the binder's.
19. **What waits for the census** — nothing in Batch 3. Only retirement.
20. **Retirement condition** — every `binder_entries` row resolved by its owner or removed; then `DROP TABLE metyet.binder_entries` and its command.

---

## 22. The proposed implementation batch — not executed

**[R]** Three phases. 3A is additive and provable without touching a screen.

### Batch 3A — the representation and the commands

| File | Change |
|---|---|
| `persistence/migrations/0014_binder_memberships.sql` | **new** — exactly §7. A new empty table; nothing existing is altered |
| `persistence/world-repository.js` | the spec in §7: `id`/`binderId` as **fields**, the two object columns as **mirrors** |
| `domain/metyet-world.js` | `binderMemberships` added to `OPTIONAL_COLLECTIONS` (not required — a reverted or older world has none); five new rules, all about a collection no stored world has |
| `domain/metyet-domain.js` | `REFUSE.invalidTarget`, `REFUSE.binderArchived` |
| `domain/metyet-commands.js` | `fileObject`, `unfileObject`; `removeGoal` and `removeCollectorCopy` delete the object's membership and their comments are rewritten |
| `domain/metyet-projection.js` | `binderMemberships` to the owner, scoped by **both** the binder's and the object's owner; `[]` to a partner |
| `server/exposed-commands.js` | `+fileObject`, `+unfileObject` → **25** |
| `client/commands.js` | two thunks, in the same commit (`phase5-b81:195`) |
| `client/collector/CardSpecification.jsx` | **the scenario T fix only** — the generalised minted-id binding and `adopt` over `newBinders`. The binder control is untouched; no `fileObject` step is emitted yet |
| `domain/README.md` | `:126-149` rewritten |
| `tests/phase5-binder-object-membership.cjs` | **new suite** |
| ~20 existing suites | re-pin per §19.2–19.4, including the three doctrinal guards and `[19] no Binder architecture change` |

**Tests** — domain and plan level, plus DDL through the PGlite harness: exactly one target succeeds for a Goal and a Copy; both / neither / non-string / **blank** refused `invalid-target`, no mutation, no id consumed; archived refused; cross-owner refused on each side; same-binder idempotent with `filedAt` preserved; **another binder replaces in place and the row keeps its id**; `unfileObject` idempotent; a Goal and two copies of one card in three binders (K); two copies in two binders (L); a legacy-`cardId` copy filed (X, domain level); removal deletes the membership (S); **a world of purely legacy rows still loads and `binder_entries` is byte-unchanged** (the compatibility pin); a legacy row is never an object's home; the partner sees nothing even for a copy a live deal references (W); **a Collector does not receive another Collector's membership**; `make-binder` + an object in one Save, and a retry that creates no second binder (T, U) — through `planFrom` and `commit`, not the binder control; and **through Postgres**: the XOR CHECK, both unique constraints, and a move that reshuffles `ord` and still commits.

**Bite mutations** — remove the CHECK; make each unique constraint non-deferrable (the move test must fail — this is S1's pin); make each non-unique; have `fileObject` push instead of replacing in place; drop the cross-owner check on the object side; drop the archived check; make removal leave the membership; let a legacy row answer an object's home; revert the minted-id generalisation (T and U must fail); put the two object columns in `fields` instead of `mirrors` (the legacy-record shape test must fail — S2's pin).

**Counts** — exposed 23 → **25**; domain commands 51 → **53**; migrations 13 → **14**; refusal codes 42 → **44**.

**Rollback** — revert the commit and leave `0014` applied. **Verified safe**: `validateWorld` tolerates an unknown collection, and a reverted `world-repository.js` has no spec for the table, so it is simply not read. Memberships become invisible; nothing fails. This is the single largest advantage over the in-place re-key, whose rollback was a total outage after the first filing (§6/S4).

**Stop condition** — a membership names exactly one Goal or one CollectorCopy; each object has at most one home; filing replaces in place; removal unfiles; a binder created in the same Save is actually usable and a retry does not duplicate it; `binder_entries` is untouched and every existing world loads; and no legacy row has been read, mapped or moved.

### Batch 3B — the Collector's side

The per-object home control (§19/M1); `Binder.jsx` and `Collection.jsx` read memberships as well as entries, rendering legacy cards as the labelled compatibility group; `Binder.jsx`'s dead `e.cardId` branch removed; `SignIn.jsx` translation; `WHY` sentences; `filedSomewhereActive` asks the object. Scenarios K, L and X become visible here.

### Batch 3C and later, in order

§0.4's decision and, if it goes that way, un-exposing `addBinderEntry` with its thunk in the same commit → an object-level resolution UI (an owner's decision, never an inference) → census → `DROP TABLE binder_entries` at zero unresolved rows.

---

## 23. Nothing was implemented

No file was edited, no migration written, no test changed, no projection or UI touched. No Goal, disposition, grading, transaction, Opportunity, qualification, Pending, Market Value or search behaviour was altered. No default Binder, no automatic legacy mapping, no cleanup, no merge, no push workaround. **The scenario T defect was found and documented, not fixed.**

## 24. `git status --porcelain`

```
?? "Claude outputs/MetYet_Object_Level_Binder_Membership_Batch_3_Audit.md"
```

This document, untracked; `Claude outputs/` is not gitignored. **No tracked file is modified.** (The first draft of this section printed an empty block, which was wrong.)

---

## Stop condition

> **How does MetYet make a Binder the optional home of one specific Goal or one specific CollectorCopy — never a generic card — while preserving unresolved legacy card-level Binder rows without pretending to know what they meant?**

By leaving the legacy rows exactly where they are. A new `binder_memberships` table, with an id of its own, names one Goal or one CollectorCopy and nothing else; an XOR check makes "exactly one" structural, and a deferrable unique constraint per object column makes "at most one home" a fact the database keeps even while the repository reshuffles rows around it. New rows are written only by `fileObject`, which replaces an object's home in place rather than accumulating one, refuses an archived binder, and refuses a binder or an object that is not the caller's. `binder_entries` is not altered, not widened and not re-keyed: its rows keep working, stay readable and removable, lose nothing, and are **never** the answer to "which Binder is this Goal in" — because the row records an act of filing a card, nothing on it records what caused it, and the one-candidate premise that would make a mapping look safe is not even an invariant in this schema. They are resolved when their owner says what they meant, and the table is dropped when none is left.
