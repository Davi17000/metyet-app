# MetYet — Phase 5 C3.1: Binder Foundation — Implementation Report

## A. Executive result

**PASS.** `npm run verify` exits 0: **123 suites, 4,005 assertions**, production build **343,142 bytes**, smoke **83,686 characters**, migration `0013_binders` applies cleanly to a fresh database and as an upgrade from the C2.1 schema.

MetYet now stores a fourth durable fact about a Collector and a card, and it is the first one that is about how a person *thinks* about their collection rather than what they want, own or will part with:

```
Binder        this card belongs here                 ← new in C3.1
Goal          I want this card
CollectorCopy I own this physical copy
offered       I am willing to trade or sell it
```

**Both exit conditions hold, and are tested rather than asserted in prose.**

> *A Collector can durably organize canonical cards into private named Binders without changing or implying what they want, what they own, what they offer, or what their Trusted Partners can see.*

Proved by section D of the new suite (a partner's whole serialised projection contains no binder name, id, membership or count while still containing that Collector's goals and offered copies) and by the "a binder may hold a card the Collector neither wants nor owns" test, which also asserts the filed card produces no Discovery.

> *Removing a Goal, changing a Goal tier, acquiring a copy, offering a copy, or losing the last owned copy cannot silently reorganize the Collector's Binder.*

Proved by the five canonical scenarios, each driven through the real commands rather than by constructing state.

**No UI, no Browse change, no client binding, and the production allow-list is unchanged at nine commands.** A person still cannot reach a Binder.

---

## B. Verified baseline SHA

Verified rather than assumed.

| | |
|---|---|
| `origin/main` | **`c848837e6c638d5e0b30a57ef5fce0de01c65ccb`** — *Merge pull request #65* |
| C2 + C2.1 present | **Yes** — `4095a95` and `b41df49` are both ancestors of main |
| Branch | `phase-5-c3-1-binder-foundation`, worktree `/home/claude/c31`, from `c848837` |
| Next migration | `0013` — confirmed by listing `persistence/migrations/`, last existing is `0012` |

**A note on baseline honesty.** I started a baseline `npm run verify` at `c848837` and then began editing before it finished, so that run failed on my own half-applied changes rather than on the repository. I did not re-run it. The baseline at this exact SHA *was* verified cleanly in the preceding read-only C3 checkpoint — 122 suites, 3,965 assertions, EXIT 0, build 341,232 bytes, smoke 83,686 — which is the number this batch's result is compared against. The end-state verification below is clean and is the one that matters, but the intermediate mistake is mine and is recorded rather than glossed.

---

## C. Exact product decisions implemented

Every locked decision from the brief, and where it is enforced:

| Decision | Where |
|---|---|
| Binder = where a card belongs organisationally | migration 0013 header; `domain/README.md` |
| Binder is not demand, not ownership, not a trade selection | no binder command reads or writes a Goal or copy; tested |
| Membership points at the **canonical card** | `binder_entries.canonical_card_id`; `validateWorld`; scenarios C, E, F |
| A canonical card may belong to multiple Binders | no cross-binder constraint; scenario G |
| Within one Binder, a card appears at most once | unique index + `validateWorld` + idempotent command |
| Membership survives tier change, Goal removal, copy creation, last copy leaving | scenarios B, C, E |
| A Binder may hold a card with neither Goal nor copy | tested, including that it creates no Discovery |
| Binder organisation is Collector-private | `projectForActor`; section D |
| Lifecycle: create, rename, archive, add card, remove card | five commands |
| **No permanent deletion** | none implemented; archive is reversible |
| **No persisted system Trade Binder** | none created; README states the derived rule |

**One deviation from the brief, taken under the permission it gives.** The brief lists `archiveBinder` and then says: *"If the current command vocabulary strongly favors a `set...Archived` command over a one-way archive command, inspect and choose the smallest coherent convention."* It does. C2 established `setCollectorCopyOffered` — one command, a boolean, idempotent — for exactly this shape: a reversible state a person controls. A one-way `archiveBinder` would need a second command to undo it, which is two names for one decision, and the brief also requires archiving to be *"reversible representation in durable state"*. So the command is **`setBinderArchived(binderId, archived)`**.

The durable form is a **timestamp**, `archivedAt`, not a flag: "when did I put this away" is worth knowing and a boolean cannot say it. `null` means active.

---

## D. Schema / migration

**`persistence/migrations/0013_binders.sql`** — additive only. Two tables, three foreign keys, one unique index, two ordinary indexes. No backfill, no default binder, no change to any existing table.

```sql
create table metyet.binders (
  id           text primary key,
  ord          integer not null,
  collector_id text not null,
  attrs        jsonb not null,          -- name, createdAt, archivedAt
  constraint binders_collector_fk foreign key (collector_id)
    references metyet.collectors (id) deferrable initially deferred
);

create table metyet.binder_entries (
  ord               integer primary key,
  binder_id         text not null,
  canonical_card_id text not null,
  attrs             jsonb not null,     -- addedAt
  constraint binder_entries_binder_fk foreign key (binder_id)
    references metyet.binders (id) deferrable initially deferred,
  constraint binder_entries_canonical_card_fk foreign key (canonical_card_id)
    references metyet_catalog.canonical_cards (canonical_card_id) deferrable initially deferred
);

create unique index binder_entries_one_per_card_idx
  on metyet.binder_entries (binder_id, canonical_card_id);
```

Conventions followed exactly as the existing schema uses them: identity and foreign keys are columns, everything else is `attrs`; FKs are deferrable; `binder_entries` keys on `ord` because membership carries no domain id of its own — the same choice `interests`, `preferences` and `relationships` already make.

**No live-data backfill is required or performed.** Existing Collectors have zero Binders, which is the complete and correct answer. Inventing a "My Collection" for everyone would be the product deciding something on a person's behalf — and, on the C2.1 lesson, an absence that genuinely means "none" must not be filled in.

**The naming collision is documented in three places** — the migration header, `world-repository.js` beside the specs, and a table in `domain/README.md`:

| Column / field | What it actually names |
|---|---|
| `binder_entries.binder_id` | **a Binder** (C3.1) — the only place the name means what it says |
| `interests.binder_id` | a collector copy — legacy |
| `opportunity_trade_refs.binder_id` | a collector copy — legacy |
| `binderId` on a trade card, `binderIds` on `proposeTradeSelection` | a collector copy — legacy |
| `markBinderReviewed`, `relationships.binderReviewedAt` | a partner opened a Collector's cards — legacy |

C3.1 renames none of them; that remains the trade batch's work.

---

## E. Domain model and invariants

```
Binder        { id, collectorId, name, createdAt, archivedAt }
BinderEntry   { binderId, canonicalCardId, addedAt }
```

No description, cover, ordering, sharing flag, visibility, tags, default state, Goal state, copy state, trade state or analytics metadata — as the brief requires.

`binders` and `binderEntries` are **REQUIRED** collections in `validateWorld`, not optional. That is deliberate and is the C2.1 lesson applied in advance: an optional collection is one an absence can stand in for, and "this Collector has organised nothing" is a real answer that an empty array states and a missing key does not. A world omitting either is refused on load and before every save.

`validateWorld` rejects, each with a test:

| Invariant | Code |
|---|---|
| Binder names a Collector who does not exist | `ref.unknown` |
| Binder has no name, or only whitespace | `field.invalid` |
| Binder `archivedAt` is neither a timestamp nor null | `field.invalid` |
| BinderEntry names a Binder that does not exist | `ref.unknown` |
| BinderEntry names no canonical card | `ref.missing` |
| One Binder files one card twice | `id.duplicate` |
| Either collection missing entirely | `collection.missing` |

**Validation is deliberately not coupled to Goals or CollectorCopies.** A BinderEntry whose canonical card the Collector neither wants nor owns is valid, and is tested as such — it is curation, the state most binders start in.

Canonical card *existence* is not checked by `validateWorld`, which is consistent rather than an omission: `validateWorld` has no database and cannot see `metyet_catalog`, so a Goal's canonical card is not checked there either. Existence is the server guard's answer and the foreign key's — §I.

---

## F. Commands and authorization

Five commands, all Collector-owned. Ownership is derived from the authenticated actor and **never** read from the payload — tested by sending `collectorId: "c2"` and asserting the resulting binder belongs to `c1`.

| Command | Behaviour |
|---|---|
| `createBinder({ name })` | server-mints `bd…`; owner = actor; trims the name and refuses blank (`name-required`); `createdAt` from the command's clock; `archivedAt: null` |
| `renameBinder({ binderId, name })` | owner only; name only — owner, `createdAt` and membership are asserted unchanged |
| `setBinderArchived({ binderId, archived })` | owner only; boolean or refused; idempotent (a repeat writes nothing, asserted byte-identical); sets or clears `archivedAt`; touches no entry, Goal or copy |
| `addBinderEntry({ binderId, canonicalCardId })` | owner only; canonical id only; **idempotent** — a repeat is a no-op and the original `addedAt` stands, so "when did this go in the binder" does not become "when did I last click it"; creates no Goal and no copy |
| `removeBinderEntry({ binderId, canonicalCardId })` | owner only; removes organisation only; returns `false` when there was nothing to remove rather than refusing |

Every one refuses `not-owner` for a Trusted Partner and for a different Collector, across all five, with the world asserted unchanged afterwards.

---

## G. Persistence integration

Both collections go through the established path; nothing bypasses `normalizeWorld` or `validateWorld`.

- `world-repository.js` — two table specs. `binders` keys on `id` with `id` and `collectorId` as fields; `binderEntries` keys on `ord` with `binderId` and `canonicalCardId` as fields. `name`, `createdAt`, `archivedAt` and `addedAt` are `attrs`, as every non-identity fact in this schema is.
- `metyet-world.js` — both in `REQUIRED_COLLECTIONS`; validation block added.
- `metyet-projection.js` — both in the projected `COLLECTIONS` list, so the empty view and section shape include them.
- `metyet-store.js` — the prototype store defaults both to `[]`. The demo seeds none, and the comment says why: a Binder organises *canonical* cards and the prototype world is built on the legacy catalogue, so there is nothing there for one to hold. Empty is the honest answer, not a gap.

Round-trip is tested through the database, not only in memory: the test reads `metyet.binders.attrs` and `metyet.binder_entries.attrs` back out of Postgres to prove the name, `archivedAt` and `addedAt` really reached the JSONB, and that an archived binder comes back as the same timestamp.

---

## H. Projection / privacy proof

**Owner:** receives `binders` and `binderEntries` whole. Entries are scoped *through* the binders — `binderEntries` carries no `collectorId` of its own (asserted), so an entry is reachable only via a binder the actor owns, which makes it structurally impossible to project one without its binder.

**Every partner, related or not:** receives `binders: []` and `binderEntries: []` — written as an **explicit empty rather than an omitted key**, so the answer is a statement somebody made rather than a line nobody wrote.

The privacy test does what the brief asks and does not settle for `view.binders === undefined`:

- A binder is created with the name `ZZ-MUDKIP-CURATION-MARKER-7741` — a string nothing else in the world could produce, so a card name or set code cannot make the test pass by accident.
- The **whole serialised `/api/view` body** for the related partner is searched for the name and for the binder id. Both absent.
- The same for an unrelated partner, and for a second Collector.
- **The count is tested as a leak in its own right.** Three binders each file the same card; every value on the goal the partner receives is checked against `3`, and the partner's section list is pinned. "This card is in three of their binders" would tell a partner how much the Collector cares about that card, which is negotiating information nobody offered.
- And the partner still receives everything they are entitled to — that Collector's goals and offered copies — so the absence above is a boundary rather than an empty world.

**Nothing became demand.** A filed card produces no Discovery (tested directly: a card that is only filed discovers nothing, while a card with a Goal still does), no Goal, and no change to CollectorCopy supply.

Privacy is enforced in the projection. No client filtering exists, because no client code was written at all.

---

## I. Catalog guard

`addBinderEntry` names a canonical card, so it joins the same authoritative boundary `addGoal`, `addInventoryCopy` and `addCollectorCopy` cross. It is **not** a second mechanism.

The guard was a chain of `command === "…"` comparisons inside the route. I turned it into a named, exported list — `CARD_NAMING_COMMANDS`, with `CARD_IN_COPY` for the payload-shape difference — for the same reason `server/exposed-commands.js` is a list: a rule spread across an `if` cannot be asserted, and the next person to add a card-naming command has to notice the guard exists. The test pins the exact set rather than grepping the source.

**Honest scope note.** Because `addBinderEntry` is not on the production allow-list, the route refuses it as `command-unavailable` before the guard runs — so the guard is **unreachable from a browser today**. It is written now so the batch that opens that door does not also have to remember to close this one. What *is* tested end to end is the backstop that actually applies past the door: filing a nonexistent canonical card is refused by the foreign key (`23503`), with nothing written. This is verified to be **identical to `addGoal`'s** behaviour on the same path — both throw rather than writing a dangling reference — so C3.1 introduces no new laxity.

---

## J. Canonical scenario results

All five, each driven through the real commands. **Tested, not inferred.**

| | Scenario | Result |
|---|---|---|
| **B** | Card filed; Goal Secondary → Primary | Goal moved; membership unchanged |
| **C** | Card filed; Goal exists; copy acquired; Goal then removed | Membership unchanged at both steps; copy still owned |
| **E** | Card filed; copy owned; copy removed through `removeCollectorCopy` | Copy gone; **membership remains** — the scenario the whole design turns on, since that command cascades interests and would have cascaded organisation too if membership named a copy |
| **F** | One card filed; three physical copies with independent grade and `offered` | Three copies, `[false, true, false]`; **one** membership |
| **G** | Same card in two binders; removed from one | Gone from one, still in the other |

Also tested: filing the same card twice is one membership with the original `addedAt`; a binder may hold a card with neither Goal nor copy (and produces no Discovery); archiving touches no entry, Goal, copy or `offered`; archiving is reversible and idempotent; and removing an entry leaves the Goal, the copy, the offer, a partner's Interest and the derived deal status all exactly as they were.

---

## K. Tests and verification counts

```
npm run verify   EXIT 0
  test           ALL SUITES PASSED — 123 suites, 4,005 assertions
  prod           PRODUCTION BUILD OK — bytes: 343142
  smoke          PROD SMOKE OK — rendered 83686 chars
  previews       both preview bundles written
```

Against the checkpoint-verified baseline at `c848837`: 122 → **123** suites, 3,965 → **4,005** assertions (+40), 341,232 → **343,142** bytes.

**New suite: `tests/phase5-c31-binder-foundation.cjs`, 40 tests**, sections A–F (ownership, the set, independence, privacy, the closed door, persistence). Binder commands have no production surface, so they run past the door through `executeCommand` — the same transaction, advisory lock and `validateWorld` the route would use — and are *also* proved shut at `/api/commands`.

Migration tests: next-in-sequence, applies to a fresh database, and **applies as a real upgrade** from a database migrated only through `0012` (the state a C2.1 deployment is in), asserting `0013` and only `0013` applied and both tables then exist.

### Four superseded assertions, each restated with its reason

None was loosened; two became stricter.

**1. `phase3-domain-readiness` — "all 43 commands ran" / `COMMAND_NAMES.length === 43`**
*Protected:* that the id-and-time proofs exercise every command in the table, exactly.
*No longer correct:* the table holds 48.
*Replaced by:* the same assertion at 48, with the five new commands named in a comment and **actually exercised** by the script — which is the point of this suite, since it runs the whole table past the production door.

**2. `phase3-domain-readiness` — "twelve required collections"**
*Protected:* that the required-collection list is exact.
*No longer correct:* `binders` and `binderEntries` are required.
*Replaced by:* the same assertion at 14, **plus** a new loop proving each of the two is genuinely required by deleting it and expecting `collection.missing`. Stricter than before.

**3. `phase5-c2-collector-copy` — "the concepts C3 owns do not exist yet"**
*Protected:* that C2 did not quietly begin C3.
*No longer correct:* C3.1 built them, by its own batch and its own migration. Keeping the wording would mean C3.1 could only pass by deleting its own subject.
*Replaced by:* **"C2 shipped no Binder surface, and C3.1 still ships none"** — which is the property C2 actually owned. It asserts C2's own migrations create no Binder table, that the Binder commands exist but **none is exposed to production**, and the navigation checks unchanged. The old file-name check had degenerated into "nobody named a file Binder"; naming the door is better.

**4. `phase5-c21-collector-copy-corrections` — the upgrade test**
*Protected:* that the `offered` backfill runs on a real upgrade from the C2 schema.
*No longer correct:* it required the upgrade to apply *exactly* `0012`, which becomes false the moment anything is added after it.
*Replaced by:* pinning the backfill's **position** — it must be the first thing the upgrade applies — plus an assertion that nothing already recorded was re-applied. That is what the test always meant.

---

## L. Files changed

62 files, +1,362 / −85.

| File | Change |
|---|---|
| `persistence/migrations/0013_binders.sql` | **new** — the two tables |
| `tests/phase5-c31-binder-foundation.cjs` | **new** — 40 tests |
| `domain/metyet-commands.js` | five commands |
| `domain/metyet-world.js` | two required collections; validation block |
| `domain/metyet-projection.js` | owner receives both; every partner receives explicit empties |
| `domain/metyet-store.js` | prototype defaults |
| `domain/README.md` | the four durable facts, privacy, derived Trade Binder, the `binder_id` collision table, command count |
| `persistence/world-repository.js` | two table specs, plus a warning beside `interests.binder_id` |
| `server/app.js` | `CARD_NAMING_COMMANDS` as an exported list; `addBinderEntry` added |
| `server/exposed-commands.js` | **comment only** — the stale "forty-two / six" corrected to "forty-eight / nine" |
| `tests/all.cjs` | registers the new suite |
| 51 other test/harness files | world fixtures gain `binders: [], binderEntries: [],` |
| 4 of those | the superseded pins above |

**`server/exposed-commands.js` behaviour is byte-for-byte identical.** Only the stale prose count changed, which the brief explicitly permits.

---

## M. Explicit non-goals confirmed absent

Every item on the brief's list, verified rather than asserted:

| Non-goal | Evidence |
|---|---|
| Binder UI | no file under `client/` changed; no section added |
| Browse changes | `CardBrowser.jsx`, `Browse.jsx` untouched |
| Card Specification UX | not started |
| Production exposure of Binder commands | allow-list pinned at the same nine; each of the five proved `command-unavailable` over HTTP |
| Collector defaults / persisted defaults | none; `prefs` and `preferences` untouched |
| Goal desired grade/condition | `addGoal` unchanged |
| Grade/condition coherence correction | deliberately not fixed — §N |
| Four-state / two-axis UI | no UI at all |
| TP Binder visibility | explicit empties; whole-projection test |
| Binder sharing / public binders | no field, no command |
| Permanent Binder deletion | not implemented |
| Trade Binder persistence | none; README states the derived rule |
| TP Make an Offer, multi-card offers, cash/trade percentages | untouched |
| Reputation / follow-through / hygiene scoring | none |
| Automatic Interest cleanup | none; `setInterest` unchanged |
| TP interest taxonomy expansion | none |
| Provider / catalog ingestion | no catalog file changed |
| Grading-company expansion | `GRADED_VALUES` untouched |
| Opportunity / Deal redesign | untouched; tested unchanged |
| Legacy trade `binder_id` rename | not renamed; documented |
| Unrelated cleanup | none, beyond the permitted comment |

---

## N. Defects and debt discovered but not fixed

Found while working, deliberately left for the batch that owns them:

1. **`addGoal` silently drops desired grade/condition** (found in the C3 checkpoint, still present). A caller sending them gets `200` and loses the data. **C3.2's**, named in the checkpoint.
2. **An incoherent grade/condition pair is accepted and becomes unreachable** — `grade: "PSA 9"` with `condition: "Damaged"` is stored, and `gradingOf` reads the condition as `null`. **C3.2's**, and explicitly a non-goal here.
3. **`metyet.interests` has no database uniqueness** on `(partner_id, binder_id)` though the domain treats the pair as unique. The world lock makes a duplicate near-impossible in practice. Tighten when the trade batch renames that column.
4. **Three C2 commands are exposed ahead of their screen** — `addCollectorCopy`, `setCollectorCopyOffered`, `removeCollectorCopy` are on the allow-list while `my-cards` sits unreachable in `DEFERRED_SECTIONS`. Not changed: closing them would be a behaviour change outside C3.1, and the brief permits only a provably necessary correction.
5. **`gradeLine` / `isGraded` are duplicated in both `present.js` files**, each with its own `/^raw$/i` test — the drift `gradingOf`'s comment was written to prevent. The client cannot import the domain, so the fix is to carry the parsed shape across in the projection. A C3.2/C3.3 concern.
6. **Scroll position does not survive a section change** (`key={section}` remounts `<main>`). Relevant to C3.3's "preserve Browse session exactly"; it is new work, not something C1 already does.

---

## O. Branch and commit

| | |
|---|---|
| Branch | `phase-5-c3-1-binder-foundation` |
| Base | `c848837e6c638d5e0b30a57ef5fce0de01c65ccb` |
| Commit | **`495c19d`** — *Phase 5 C3.1: the durable Binder foundation* |

Only C3.1 work is committed. Untracked `Claude outputs/` material was not modified or deleted. **Not merged.**

---

## P. Exact next step / handoff

**Push is unavailable from this environment** and no credentials were requested or handled. The cloud git proxy refuses to inject a credential for this repository (403 — not in the session's authorized set); fetching works, pushing does not.

From the Mac, after importing the bundle:

```bash
cd ~/Documents/GitHub/metyet-app
git fetch <bundle> HEAD:phase-5-c3-1-binder-foundation
git push -u origin phase-5-c3-1-binder-foundation
```

Then open a PR against `main`. **Do not merge as part of this batch.**

**The next batch is C3.2 — Goal desired-copy criteria**, which the C3 checkpoint scoped. It carries one **blocking prerequisite that is a product decision, not an engineering one**:

> Can a Collector want a Raw NM copy *and* a PSA 10 copy of the same card as two separate Goals?

Today they cannot — one Goal per Collector per canonical card is enforced both in the domain (`duplicate-goal`) and by a unique index, `goals_one_per_collector_card_idx`. The checkpoint recommends keeping it and treating desired criteria as preference rather than filter. **It must be answered before C3.2 begins**, because the index is what would have to change, and relaxing it later is additive while tightening it after multi-goal data exists is not.

C3.2 should also fix defects 1 and 2 in §N, which sit in exactly the field it makes user-facing.
