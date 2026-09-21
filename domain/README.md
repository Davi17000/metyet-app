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
| `metyet-commands.js` | Every state change. 43 commands; a command is a pure function of `(state, actor, payload, ctx)` |
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
`binder` and it was never a binder.** The word "Binder" is wanted for a named
grouping a Collector makes for themselves ("Mudkip Collection"), whose
membership points at a *canonical card*; that concept does not exist yet.

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
| Goals | `metyet-commands.js` `addGoal` → `GOAL_FOR_PARTNER` in `metyet-projection.js` → `client/collector/sections/Goals.jsx` |
| Inventory | `metyet-commands.js` `addInventoryCopy` → `INVENTORY_FOR_COLLECTOR` → `client/tp/sections/Inventory.jsx` |
| A Collector's own cards | `metyet-commands.js` `addCollectorCopy` / `setCollectorCopyOffered` → `COLLECTOR_COPY_FOR_PARTNER` → `client/collector/sections/MyCards.jsx` (built, not yet in the navigation) |
| Discovery | `metyet-discovery.js` → `withDiscoveries` in `metyet-projection.js` → both shells |
| Opportunity | `metyet-commands.js` `startOpportunity` → `metyet-domain.js` `STAGES` (no production surface sends these yet) |

The trace for any of them is the same shape: *command → validateWorld →
persistence → projection → screen.*
