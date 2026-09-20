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
| `metyet-commands.js` | Every state change. 42 commands; a command is a pure function of `(state, actor, payload, ctx)` |
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

**Derive it, don't store it.** Goal state, copy status, binder copy status,
unread position and discovery are all computed from the records that imply
them. Two answers to one question is how a product starts disagreeing with
itself; `metyet-domain.js` has the worked example of when that last happened.

**Legacy card identity still exists.** `binder_copies`, `conversations` and
`opportunity_trade_refs` still carry a legacy `card_id`, and conversation thread
keys are built from `identityKey`. Goals (B7), Inventory (B6) and Opportunities
(B8) have moved to `canonicalCardId` and enforce exactly one reference. The rest
move with the batches that own them.

## Where to start tracing

| Concept | Start at |
|---|---|
| Relationship | `metyet-registration.js` `acceptCollectorInvitation` → `isRelated` in `metyet-commands.js` |
| Goals | `metyet-commands.js` `addGoal` → `GOAL_FOR_PARTNER` in `metyet-projection.js` → `client/collector/sections/Goals.jsx` |
| Inventory | `metyet-commands.js` `addInventoryCopy` → `INVENTORY_FOR_COLLECTOR` → `client/tp/sections/Inventory.jsx` |
| Discovery | `metyet-discovery.js` → `withDiscoveries` in `metyet-projection.js` → both shells |
| Opportunity | `metyet-commands.js` `startOpportunity` → `metyet-domain.js` `STAGES` (no production surface sends these yet) |

The trace for any of them is the same shape: *command → validateWorld →
persistence → projection → screen.*
