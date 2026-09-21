# `domain/` — what is production, and what is the prototype

Eleven modules live here and they are not all the same kind of thing. Six are
the running product. Three are the demo prototype's own adapters and are
imported by nothing in `client/`, `server/` or `persistence/`. Reading the wrong
one is the easiest mistake to make in this repository, because they answer the
same questions in different vocabularies.

## Production

| Module | Owns |
|---|---|
| `metyet-domain.js` | Lifecycle, settlement arithmetic, derived status, the `INVARIANTS` and `REFUSE` tables |
| `metyet-commands.js` | Every state change. 48 commands; a command is a pure function of `(state, actor, payload, ctx)` |
| `metyet-world.js` | `validateWorld` — what a valid canonical world is, checked on every load and before every save |
| `metyet-projection.js` | `projectForActor` — **the privacy boundary** |
| `metyet-discovery.js` | `discoveriesIn` — computed Goal × Inventory overlap |
| `metyet-registration.js` | Partner registration and collector-invitation acceptance. Deliberately **not** in the command table |
| `card-identity.js` | Canonical card vocabulary and the two natural keys |
| `metyet-runtime.js` | Time and id generation. The authoritative runtime ignores caller-supplied clocks and ids |

## Prototype / demo compatibility

| Module | Note |
|---|---|
| `collector-view.js` | Collector persona selectors for the demo. Reads `state.catalog` and legacy `cardId`; would not survive a production world, where the catalog is empty |
| `metyet-store.js` | The demo's in-memory store. Production's equivalent is `client/production-store.js` |
| `metyet-entities.js` | Demo selectors, including the legacy `sameIdentity` matching path |

A guard test (`tests/phase4-client-boundary.cjs`) asserts `client/` imports none
of these, and none of `domain/` at all — production surfaces consume the
projection JSON from `GET /api/view` and nothing else.

## A Collector's own cards: owning and offering (Phase 5 C2)

`collectorCopies` is a Collector's own physical cards — the mirror image of a
Trusted Partner's `inventory`, owned by the other seat. **It was called
`binder` and it was never a binder.** The word "Binder" now means the named
grouping a Collector makes for themselves ("Mudkip Collection"), which C3.1
added — see below.

Two facts, not one:

| Fact | Where it lives | How it changes |
|---|---|---|
| **You own this card** | the row's existence | `addCollectorCopy` / `removeCollectorCopy` |
| **You are offering it** | `offered`, a boolean on the row | `setCollectorCopyOffered`, and **only** that |

Before C2 these were the same act. A copy existed only because the Collector had
put it up for trade, so "I own this but I'm not trading it" was unsayable, and
"I've changed my mind" could only be said by deleting the record — throwing away
the photographs, the certificate and the fact of ownership to change an answer
about willingness. Three consequences follow from separating them, and each is
somewhere you can get it wrong:

1. **Supply is offered supply.** `projectForActor` gives a partner a Collector's
   copy only when `offered === true` (plus the network and status rules that
   were always there). A copy the partner already named in a submitted package
   still reaches them as `unavailable`, the same as one committed elsewhere — a
   partner who staked a negotiation on a card is told it is gone, not shown a
   hole. `setInterest` refuses NEW interest in an unoffered copy with
   `not-found`, which is the same answer a copy that does not exist gets, on
   purpose — but **withdrawing** existing interest always works, and so does
   withdrawing it from a copy a deal is holding. Putting a card down is not the
   same act as picking it up: Interest reserves nothing, and a partner whose
   needs have changed must be able to clear a stale signal without the Collector
   having to re-offer a card they just took off the table (C2.1).
   `setInterest` also refuses NEW interest in a copy whose derived status is not
   `available`, so a card already reserved, committed or traded inside a deal
   takes no second claimant. That is the same derivation the projection uses;
   there is no new state and no second source of truth.
2. **`offered` cannot ride in on a patch.** `updateCollectorCopy` refuses it
   with `identity-immutable`, so a screen editing a reference value can never
   change what a card is doing in the world.
3. **New copies default to `offered: false`.** Owning is the base fact. Rows
   that existed before C2 are offered, because creating one *was* offering it —
   migration **0012** writes that answer onto them. C2 claimed the repository
   would supply it on the next write; nothing did, so those rows loaded as
   `undefined`, and `undefined !== true` silently removed every Collector's
   existing supply from their partners' view. `validateWorld` now requires
   `typeof offered === "boolean"`, so absent and tri-state are not states a
   canonical world can be in (C2.1).

**The photograph requirement moved.** It used to be at the door
(`addBinderCopy` refused a copy without both faces), which put an *evaluation*
rule in front of an *ownership* fact and meant a Collector with a shoebox and no
lightbox could record nothing at all. It now lives in `proposeTradeSelection`,
the first moment a specific physical copy is handed to somebody else to put a
value on — the same standard `startOpportunity` already applies to the partner's
copy on the other side. `INVARIANTS.copyPhotographed` is now the single
predicate for both seats; `binderCopyPhotographed` was the same expression under
a second name and is gone.

### Naming debt, written down rather than rediscovered

These still say "binder" and each names a collector copy. Renaming them touches
the interest model and the trade package, which is the trade batch's work:

| Where | What it is |
|---|---|
| `interests.binder_id` (column and field) | the collector copy a partner registered interest in |
| `opportunity_trade_refs.binder_id` (column) | the collector copy a trade row names |
| `binderId` on a trade card, `binderIds` on `proposeTradeSelection` | the same, in the domain |
| `relationships.binderReviewedAt` | when a partner last opened a Collector's cards |

The table itself is `metyet.collector_copies` (migration 0011); foreign keys
followed the rename automatically, so those columns point at exactly the rows
they always did.

## Where a card belongs: Binders (Phase 5 C3.1)

**Four durable facts about a Collector and a card, and they are independent:**

| Fact | Record | Changed by |
|---|---|---|
| **This card belongs here** | `binders` + `binderEntries` | `createBinder`, `renameBinder`, `setBinderArchived`, `addBinderEntry`, `removeBinderEntry` |
| **I want this card** | `goals` | `addGoal` / `updateGoalTier` / `removeGoal` |
| **I own this physical copy** | `collectorCopies` | `addCollectorCopy` / `removeCollectorCopy` |
| **I'll trade or sell that copy** | `offered` | `setCollectorCopyOffered` |

A `Binder` is an id, an owner, a name, `createdAt` and `archivedAt` (a
timestamp or null — archiving is reversible and there is no permanent delete).
A `BinderEntry` is a `binderId` and a `canonicalCardId`. Nothing else; no
description, cover, ordering, sharing flag, tags or counts.

**Membership points at the CANONICAL CARD — not a Goal, not a CollectorCopy.**
This is the whole design and it is load-bearing. `removeCollectorCopy` deletes
a copy and cascades its interests, so if membership named a copy, *selling a
card would silently delete its place in the binder*. If it named a Goal,
satisfying the goal would do the same. The canonical card is the only reference
that survives every transition the product supports. It also answers the copies
question for free: three physical copies of one card are three objects and
**one** place that card belongs.

**Organising is not wanting.** A binder may hold a card the Collector neither
wants nor owns — that is curation, and it is the state most binders start in.
Nothing in the binder commands reads or writes a Goal or a copy, and a filed
card produces no Discovery. Demand is a Goal, and a Goal is the only way a
partner ever learns that a Collector wants something.

**Binders are Collector-private.** `projectForActor` gives them to the owner
whole and to every partner as an explicit empty — no name, no id, no
membership, and **no count**: "this card is in three of their binders" leaks
how much the Collector cares about a card, which is negotiating information
they never offered. A test asserts against the whole serialised partner
response, not a field list.

**There is no persisted "Trade Binder", and there will not be one.** A trade
view is `collectorCopies` where `offered === true` — a read over a fact that
already exists. Storing it as a Binder would be a second source of truth for a
boolean.

### ⚠ `binder_id` means two different things in this schema

| Where | What it actually names |
|---|---|
| `binder_entries.binder_id` | **a Binder** (C3.1) — the only place that column name means what it says |
| `interests.binder_id` | a **collector copy** — legacy |
| `opportunity_trade_refs.binder_id` | a **collector copy** — legacy |
| `binderId` on a trade card, `binderIds` on `proposeTradeSelection` | a **collector copy** — legacy |
| `markBinderReviewed`, `relationships.binderReviewedAt` | a partner opened a Collector's **cards** — legacy |

The legacy names predate C2's rename of `binder_copies` to `collector_copies`
and were left alone because renaming a column inside the trade package is the
trade batch's work. **Never join them to a Binder.** C3.1 did not rename them.

## Grade and condition: two sentences, one rule (Phase 5 C3.2)

A Collector says two different things with the same vocabulary:

| | Where | Means |
|---|---|---|
| **Desired criteria** | `goal.desired = { grade, condition }` | *what I'm trying to get* — a preference about a copy that does not exist yet |
| **Copy facts** | `grade` / `condition` on a CollectorCopy or InventoryCopy | *what this object in a drawer actually is* |

They are named apart on purpose. `goal.grade` and `copy.grade` would read alike
and mean "hoped for" and "is" — the collision that produces a bug nobody sees
in review. A Goal's criteria live under `desired`.

**`D.gradingProblem(facts)` is the one rule, and every write path asks it.**

```
Raw          requires a condition        (raw alone is half a sentence)
PSA 1..10    carries no raw condition    (the grade IS the assessment)
neither      is fine — "unstated" is a real answer, and is not "Raw"
```

It governs Goal criteria, CollectorCopies and TP Inventory alike; no command
checks the vocabularies itself any more. A violation is refused as
`grading-incoherent`. On an UPDATE the rule is asked of the **merged** record,
not the patch — a Raw/NM copy patched to `PSA 9` still has its old condition.

**One Goal per Collector per canonical card, unchanged.** Criteria do not
create a second Goal: wanting a PSA 10 of a card you already want Raw is a
change of mind about one demand, and two Goals would make the tier ambiguous.

**Criteria are preference, never a filter.** Discovery still matches on the
exact canonical card and reads no grading at all — a partner holding a PSA 8
of a card somebody wants Raw still surfaces, and the criteria tell them how
close it is. Criteria travel exactly as far as the Goal already does
(`GOAL_FOR_PARTNER`) and open no new seat.

**Binders are untouched by any of it** — where a card belongs is independent of
what copy of it you want (see above).

### What the product may not invent

Criteria are **optional**, and that is a compatibility rule rather than a gap:

- Every Goal written before C3.2 has no `desired`, and so does every Goal added
  from Browse, which has no grade control until C3.3's Card Specification
  surface. **Unspecified means the Collector has not said** — it is not
  `{ grade: null }`, and it is certainly not Raw / Near Mint. Requiring criteria
  before the control exists would break the shipped app's primary action;
  C3.3 ships the control and turns the requirement on.
- Copies written before C3.2 may carry a contradictory pair, because the door
  was open. They **load**, they are **not auto-repaired** (the record does not
  say which half was meant), and `D.gradingRead` reports the contradiction via
  `problem` instead of silently dropping the condition the way `gradingOf`
  alone does. A contradictory copy cannot be edited until the patch makes it
  coherent — which is one patch away.

`desired` lives in the Goal's `attrs`, so C3.2 needed **no migration**.

## Five things to know before changing anything

**Discovery is computed; Opportunity is persisted.** They share a word and are
not the same concept. A *discovery* is an overlap that exists right now — this
Collector's Goal, this Partner's available Copy, the same canonical card, inside
an accepted relationship. It is recomputed on every read and stored nowhere. An
*Opportunity* is a negotiation a person started with an offer, and it is a row.
Writing a discovery into the opportunities table would lock the Goal at Primary,
commit the Copy to a deal nobody opened, and reserve inventory — see the header
of `metyet-discovery.js`.

**Canonical card identity is server-owned.** Ids are minted by the server and
opaque; they are never hashes of the dimensions, and no provider identifier
appears in any public contract. A client names a card by an id it was given and
can never create one — `server/exposed-commands.js` is what makes that true at
the HTTP boundary.

**The projection is the privacy boundary.** Not the screens. Field allow-lists
in `metyet-projection.js` decide what each seat receives; an unclassified field
is projected to nobody. A network relationship (`isRelated`) is the only thing
that puts a counterparty's data in view — taking part in one record makes *that
record* visible and adds nobody to the network.

**Derive it, don't store it.** Goal state, copy status, collector copy status,
unread position and discovery are all computed from the records that imply
them. `offered` is the exception that proves it: it is *stored*, because it is
not derivable from anything — it is a statement its owner makes. It sits beside
a derived status (`available` / `reserved` / `committed` / `traded`) and answers
a different question: that one says what a DEAL has done to a copy, this one
says what its OWNER is willing to do with it. Storing the second one as a
status column beside the first would invite somebody to write the first one
down too — two answers to one question is how a product starts disagreeing with
itself; `metyet-domain.js` has the worked example of when that last happened.

**Legacy card identity still exists.** `conversations` and
`opportunity_trade_refs` still carry a legacy `card_id`, and conversation thread
keys are built from `identityKey`. Goals (B7), Inventory (B6), Opportunities
(B8) and Collector copies (C2) have moved to `canonicalCardId` and enforce
exactly one reference. The rest move with the batches that own them.

## Where to start tracing

| Concept | Start at |
|---|---|
| Relationship | `metyet-registration.js` `acceptCollectorInvitation` → `isRelated` in `metyet-commands.js` |
| Goals | `metyet-commands.js` `addGoal` (+ `desired`, C3.2) → `GOAL_FOR_PARTNER` in `metyet-projection.js` → `client/collector/sections/Goals.jsx` |
| Grading | `metyet-domain.js` `gradingProblem` (the one rule) / `gradingRead` (the honest reader) → every copy and Goal write path |
| Inventory | `metyet-commands.js` `addInventoryCopy` → `INVENTORY_FOR_COLLECTOR` → `client/tp/sections/Inventory.jsx` |
| Binders | `metyet-commands.js` `createBinder` / `addBinderEntry` → `projectForActor` (owner only) → no surface yet (C3.1 ships none) |
| A Collector's own cards | `metyet-commands.js` `addCollectorCopy` / `setCollectorCopyOffered` → `COLLECTOR_COPY_FOR_PARTNER` → `client/collector/sections/MyCards.jsx` (built, not yet in the navigation) |
| Discovery | `metyet-discovery.js` → `withDiscoveries` in `metyet-projection.js` → both shells |
| Opportunity | `metyet-commands.js` `startOpportunity` → `metyet-domain.js` `STAGES` (no production surface sends these yet) |

The trace for any of them is the same shape: *command → validateWorld →
persistence → projection → screen.*
