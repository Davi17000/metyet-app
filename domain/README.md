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
  from Browse, which had no grade control until C3.3's Card Specification
  surface. **Unspecified means the Collector has not said** — it is not
  `{ grade: null }`, and it is certainly not Raw / Near Mint. Requiring criteria
  before the control existed would have broken the shipped app's primary action.
  **C3.3 shipped the control and turned the requirement on** for the canonical
  path only; Goals written before it stay valid and are never filled in.
- Copies written before C3.2 may carry a contradictory pair, because the door
  was open. They **load**, they are **not auto-repaired** (the record does not
  say which half was meant), and `D.gradingRead` reports the contradiction via
  `problem` instead of silently dropping the condition the way `gradingOf`
  alone does. A contradictory copy cannot be edited until the patch makes it
  coherent — which is one patch away.

`desired` lives in the Goal's `attrs`, so C3.2 needed **no migration**.

## Saying it all about one card: Card Specification (Phase 5 C3.3)

A Collector presses a card in Browse and a sheet opens over the grid asking
three questions: which binders it belongs in, whether and how hard they want it
and which copy, and what copies they own and offer. One button writes.

**It composes; it does not aggregate.** There is no `saveCardSpecification`
command, no new record and no new table. The panel
(`client/collector/CardSpecification.jsx`) holds the person's ANSWERS, the
projection holds the truth, and Save sends the DIFFERENCE as a sequence of
commands that already existed. The only thing C3.3 adds to the domain is one
command (`updateGoalCriteria`) and the order the others run in.

**There is no persisted Intent.** Primary, Secondary, "I have it" and
"I'd trade it" are useful labels and are *not* mutually exclusive states. The
durable model stays two independent dimensions:

```
Want:  Not looking | Secondary | Primary      one Goal per Collector per card
Own:   zero or more CollectorCopies           each with its own grading and `offered`
```

A person can hunt a card Primarily, own three, offer one, and file it in two
binders at once. That is an ordinary collection, not an edge case, and an enum
would have to pick one of those and be wrong about somebody on their first day.

**Desired criteria are editable context on the one Goal.** `updateGoalCriteria`
exists because remove-and-recreate is not a workaround here: `removeGoal`
refuses while a deal is live — so the one moment being precise about the copy
matters would be the one moment it was impossible — and a recreate destroys
`createdAt`, `since`, `confirmedAt` and `secondarySince`. It changes `desired`
and nothing else, and it is deliberately **not** blocked by an active
Opportunity, because nothing derives from criteria.

**Criteria still do not filter Discovery.** A Goal wanting a PSA 10 still
discovers a partner's Heavily Played raw copy, and the reverse. Discovery is
exact canonical-card overlap and reads no grading at all — asserted against the
source. Criteria are context for a human deciding whether to start a
conversation, never a rule for a machine deciding whether they may.

**Binder organisation stays private and independent.** Filing a card says
nothing about wanting or owning it, membership survives both, and no partner
receives a binder id, name, membership or count — not even a derived hint.
Filing a card creates no discovery, no activity and no interest.

**Nothing is written until Save.** Opening, ticking, choosing, typing, adding a
copy and Cancel all write nothing. No draft, no bookmark, no queue.

**A partial commit is allowed, because the underlying facts are independent.**
The sequence stops at the first refusal; what stood, stood. A half-applied
commit leaves several true statements, not a corrupt record — so cross-concept
atomicity is not required and no orchestration command was invented to fake it.
The message names both halves and never claims success.

**Retry is diff-based, which is what makes it safe.** Every successful command
returns a fresh authoritative projection. Because the panel commits the
*difference* between that projection and the controls, recomputing it drops
whatever already succeeded — so pressing Save again sends only what is left.
That matters because `createBinder` and `addCollectorCopy` both mint identity
and can never be resent blind: a duplicate physical copy is a legitimate thing
to own, so nothing downstream could tell an accidental resend from a real
second copy. The order exists for the same reason — organisation first because
it is the most reversible, new copies last because they are the least.

**Browse stays mounted and the sheet is out of flow.** The panel used to render
*above* the grid in normal flow, so opening it pushed everything down the page
while the window's scroll position stayed put. It is `position: fixed` now and
rendered *after* the grid, so nothing moves behind it — which makes "come back
to exactly where you were" true by construction. **No scroll-restoration
machinery was built, and none should be**: there is nothing to restore.

**Why these five commands are now production-exposed** (9 → 14 in
`server/exposed-commands.js`): each is a control on this panel, which is the
rule that list has always had — a command joins in the batch that ships a way to
send it.

| Command | The control |
|---|---|
| `createBinder` | "New binder…", inline, because every pilot Collector has zero binders and an empty list with no way to act is the impossible screen C2 refused to ship |
| `addBinderEntry` / `removeBinderEntry` | the binder checkboxes |
| `updateCollectorCopy` | editing a copy's grade, condition, certificate or value — C2 wrote it and said it would join "in the batch that gives it a screen"; it is also the only way to correct a copy written before C3.2 that contradicts itself |
| `updateGoalCriteria` | the grade-wanted control |

`renameBinder` and `setBinderArchived` stay **closed**: C3.3 lets a person say
where the card in front of them belongs; managing binders as objects is C3.4.

**A Collector surface may not name a command.** The panel speaks its own
vocabulary — `file`, `how-hard`, `record-copy` — and `client/sign-in/SignIn.jsx`
maps those to commands at the boundary that already holds every other binding.
The panel also does not decide whether a deal is active: it offers "Not looking"
always, and `removeGoal`'s `goal-locked` refusal explains itself. Both of those
are rules the Phase 4 boundary tests caught being broken, not ones anybody
remembered.

**C3.4 owns what is deliberately missing**: Binder list and detail surfaces,
rename and archive, the Your Cards screen (still in `DEFERRED_SECTIONS`: C3.3
fixed its grading, which had been read from the legacy catalogue since Batch 5
moved grade onto the copy, but its TITLE is still resolved that way and a
canonical copy therefore reads "a card that isn't in your catalogue"), and the
derived Trade Binder view. `offered === true` remains a
derived view and is never a persisted special Binder.

**No migration.** `desired` lives in a Goal's `attrs` and nothing else C3.3
writes is a new shape; `0013_binders.sql` is still the newest.

**The `binder_id` naming collision is untouched.** C3.3 writes
`binder_entries.binder_id` (which means a Binder) and reads `interests.binder_id`
(which means a collector copy) in the same batch, and renamed neither — see the
warning under Binders above. A rename is a migration plus every reader of the
trade model, which is not this batch wearing a smaller name.

## Coherence and priority are two different questions (Phase 5 C3.4)

C3.4 gives binders a place and, in the same move, takes Goals out of the
Collector's navigation. Production navigation is now
**Browse · Binder · Your Cards · Trusted Partners**.

**Binders express coherence. Goals express priority.** "This card belongs with
my Mudkips" and "I am actively hunting this card" are two different statements
about one card, and both stay durable and independent: a Goal needs no binder,
filing creates no Goal, unfiling removes none, removing a Goal unfiles nothing,
and one card can sit in several binders while having exactly one Goal. What
changed is that they no longer need two destinations. "These are my Mudkips,
and these two I am still looking for" is one thought, so Primary/Secondary is
read *inside* a binder and inside a card's own experiences rather than beside
them. `Goals.jsx` was not deleted — it moved into `DEFERRED_SECTIONS`, the
declared place a built view waits, which is now the second time that list has
been used and the first time in this direction.

**"Not in a binder yet" is derived presentation, not a Binder.** Removing the
Goals tab must not hide a Goal, so the Goals whose canonical card is in no
ACTIVE binder are listed at the bottom of the Binder library, recomputed on
every render from the binders and entries the server sent. There is no record,
no synthetic binder and no persisted membership: file one and it leaves on the
next authoritative refresh, take a card out of its last active binder and it
comes back, stop looking and it is simply gone. A Goal whose only binders are
put away counts as unfiled, because the question the list answers is about the
binders a person is actually using.

**Put away, not deleted.** `setBinderArchived(id, false)` is the restore — there
is no third command and no delete, because the domain has none. Archiving keeps
everything: the binder's entries survive, and the Goals and copies of those
cards are not touched. Archived binders are hidden behind one quiet control
rather than moved to a second screen.

**A binder shows a card's identity and its priority, and nothing about copies.**
Picture, name, set, collector number, and Primary/Secondary when a Goal exists.
No owned-copy count, no offered count, no status line — the checkpoint proposed
`"Actively hunting · own 2 · 1 offered"` and the product correction rejected it.
Ownership and availability are facts about a shelf, and Your Cards is the shelf;
a count of either here would turn curation into inventory one number at a time.

**Your Cards is card-first presentation over exact CollectorCopies.** The canonical
card is a heading with its catalogue picture, name, set and number; the physical
copies are the records beneath it, each with its own grading, certificate,
reference value and `offered`. Nothing is ever aggregated to the heading — two
copies of one card are two objects and a single grade would describe neither.
Titles come from one batched `describe(ids)`, never the legacy catalogue, which
is what had kept the screen deferred for four batches.

**Trade and Sell stay derived from `offered === true`.** The only new filter is
"Offered only" over exact copies. There is no persisted Trade Binder, no Buy or
Sell surface, and no view record.

**Card Specification is the shared specification capability and was not
refactored.** It is reusable from Browse, Your Cards, a binder and the unfiled
list with no change, because one canonical `describe` row satisfies both `card`
and `context` and `onCommit(step, canonicalCardId)` was already
surface-agnostic. The one addition is `preselectBinder`, an initial ANSWER —
tickable off, never a record, and ignored for a binder that is put away.

**Binder organisation is private, whole.** No partner receives a binder id,
name, membership, count or archive fact, not even a derived hint; the
collections are present and empty in every other seat, because a projection
that changed shape would itself leak which seat it was. Membership is not
demand: filing a card creates no discovery, no interest and no activity.

**Canonical metadata is described, never mirrored.** Every name, set, number and
image on these screens comes from one batched catalogue `describe(ids)` for the
ids already on screen. Nothing canonical is copied into the transactional world.

**Adding cards to a binder is transient context, not a mode.** `Add cards`
carries `{binderId, name}` in the shell beside the existing session state, Browse
says quietly which binder is being filled, the panel preselects it, and pressing
Binder while filling returns to that binder's detail. Nothing is written by
carrying it, one press ends it, and there is no `collectors.prefs`, no persisted
default and no scroll-restoration machinery.

**Why these two commands are now production-exposed** (14 → 16 in
`server/exposed-commands.js`): the same rule as always — a command joins in the
batch that ships a way to send it.

| Command | The control |
|---|---|
| `renameBinder` | "Rename", inline in the library |
| `setBinderArchived` | "Put away" and "Bring back" |

`markBinderReviewed` stays **closed** and is not a Binder command at all: it is
the legacy "a partner opened this Collector's cards" command and shares nothing
with a Binder but its name.

**No migration, and no new durable concept.** `0013_binders.sql` is still the
newest. C3.4 creates no persisted Trade Binder, synthetic Unfiled Binder,
snapshot, aggregate, draft, bookmark, pending queue, persisted default or Intent
enum.

**The `binder_id` naming collision is still untouched.** `binder_entries.binder_id`
means a Binder and `interests.binder_id` means a collector copy — see the warning
under Binders above. C3.4 documents it again rather than migrating it.

**A Goal that names no canonical card reaches no surface.** A pre-C2 Goal names
`cardId` and nothing canonical, so it cannot be described, filed or specified,
and it is deliberately not listed under "Not in a binder yet" — a list whose
every row promises all three. Nothing in production can create one. This is a
consequence of removing the Goals tab, recorded here rather than discovered
later.

## The answer, not the tab (Phase 5 C3.5)

C3.4 was right to remove Goals as a destination, and it had one consequence
nobody looked at until afterwards: **`Goals.jsx` was the only file in the client
that read `state.discoveries`**, and it went into `DEFERRED_SECTIONS` with the
tab. The server kept computing the overlap, kept scoping it to accepted
relationships and kept sending it — and no Collector could see any of it. A
person could say "I am looking for this", their shop could read it, and the
product said nothing back.

**C3.5 restores the ANSWER, not the Goals tab.** Goals stays out of the
navigation and `Goals.jsx` stays deferred. What came back is the fact a
Collector was missing, and it came back where it belongs: under the shop.

**Trusted Partners answers the Goal.** Each accepted partner now shows the cards
that partner has *and this Collector already asked for* — "Northline has 2 cards
you're looking for.", then the card's picture, name, set, number and how hard
they said they were looking. A shop with nothing of yours says nothing at all,
because "0 cards you're looking for" reads as a judgement on a shop that has
done nothing wrong.

**It is relationship-aware discovery, not marketplace browsing.** This is the
distinction the old note in `TrustedPartners.jsx` was protecting, and it still
holds: a Collector never browses a shop's stock. The screen shows only where a
partner's supply meets a Goal the Collector stated themselves. Nothing is
searched across shops, nothing is inferred from browsing, from binder membership
or from what somebody owns, and nothing is scored. The projection carries the
partner's whole available shelf; the screen is what narrows it to the question
that was asked.

**Discovery is still derived.** No record is written, no read position, no
dismissal, no notification. File a card, own a card, archive a copy — the answer
changes on the next authoritative refresh because the server recomputed it, not
because anything was stored.

**`goal.desired` is sourcing context for a partner, and nothing else.** C3.2
wrote it, C3.3 gave a Collector the controls to state it, `GOAL_FOR_PARTNER` has
carried it across the seat boundary ever since — and no partner screen rendered
it, so the one person it was written for could not read it. Collector Network
now says "Looking for: PSA 10" beside the goal. Two facts stay two facts:
Primary/Secondary is **how hard** somebody is looking, `desired` is **which
copy** would answer it, and they are separate sentences. The partner cannot edit
it, and it still does not filter Discovery — a Goal wanting a PSA 10 still
discovers a partner's Heavily Played raw copy, exactly as C3.2 said it must.

**`desiredLine` decides nothing.** Its first version asked whether the grade was
"Raw" so it could drop a stray condition, and C3.3's pin caught it — a presenter
that works out what a grading pair MEANS is the second authority C3.3 removed.
The fix was not to weaken the pin but to stop needing a rule: `desired` is
already coherent when stored (`CardSpecification` drops a condition with no raw
grade to belong to; `addGoal` and `updateGoalCriteria` refuse an incoherent
pair), so the presenter joins what is there. A contradictory pre-C3.2 pair shows
**both halves**, for the same reason `gradeConflictLine` does.

**Opportunity stays deferred, deliberately.** There is no Ask, no Message, no
offer and no disabled button pretending to be one. Knowing which shop has your
card is the whole feature; what a person does next, they do the way they always
have. `startOpportunity` also still needs an `invId`, and this screen
deliberately does not print one — the server's handle on a physical copy is not
a thing a person should learn to quote.

**Nothing durable changed.** No new concept, no exposed command (still 16), no
projection change, no migration; `0013_binders.sql` is still the newest. Both
readers render data that was already projected and already authorized, and
canonical names, sets, numbers and images still come from one batched
`describe(ids)` at the catalog boundary rather than being copied into a
discovery, a goal or a relationship.

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
