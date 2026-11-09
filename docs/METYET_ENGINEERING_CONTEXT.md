# MetYet --- Canonical Engineering Context

**Canonical handoff:** 2026-10-02\
**Release checkpoint:** 2026-10-03 --- 3B-1 live at `b658e7e` (§9,
§18)\
**Purpose:** bootstrap a fresh Claude Project without importing the
overloaded historical Project Knowledge.

## 1. Source priority and working method

Use this order when sources conflict: **current repository/tests →
latest accepted audit/hand-back → this file → older
PRDs/prototypes/conversations**. Inspect the repository before acting.
Do not resurrect obsolete behavior because an old document contains it.

Development sequence: **Observe behavior → define human job → audit
existing meaning → make product decision → implement smallest boundary →
adversarially test → reconcile → repeat.** Stabilize meaning before
visual polish. Local cleanup while touching a boundary is good; broad
cleanup waits until the Collector loop is complete and before pilot.

MetYet is a coordination layer for trusted collecting relationships, not
a generic marketplace. (P6-F5A, founder decision) **Browse creates exposure.
Binders create coherence. Goals express priority. Deal Flow coordinates
action.** Discovery happens inside the trusted network only — a Collector
sees what their *connected* Trusted Partners have *available*; there is no
public listing, no unconnected shop, no ranking. Product framing: **"This isn't where
relationships start --- it's where they continue."** Another durable
principle: **any input/participation should benefit the person entering
it and other relevant participants.**

## 2. Authoritative four-state doctrine

Every **durable Collector object** represents a **specific card/copy**
and has exactly one of four meanings: - Primary Goal - Secondary Goal -
PC - Trade/Sell

A **Goal** is a specific sought card/copy and requires
`Primary XOR Secondary`.\
A **CollectorCopy** is a specific physical owned card/copy and, for new
durable writes, requires `PC XOR Trade/Sell`.\
A canonical/catalog card is reference identity only. It is not
Collector-owned durable truth.

Existing historical stateless copies may be tolerated temporarily, but
never infer PC/Trade-Sell and never auto-migrate them.

**Specificity and completeness are different.** Exact canonical
identity + required state is enough at birth. Grade, condition, cert,
photos and market/reference facts may arrive later. Do not force false
physical facts.

For new CollectorCopies there is no durable "Haven't decided." Once
saved, disposition switches `PC ↔ Trade/Sell`.

### Changing a card's collecting state (P6-F4 Batch 5, founder-approved)

**Collector-facing: one card, four states. Underneath: Goal and
CollectorCopy remain distinct records.** A saved card shows all four
states; the Collector selects one and presses Submit Update. One
server-authoritative, atomic command — `changeCollectingState({ goalId |
collectorCopyId, from, to })` — carries it:

- **Same type** (`Primary ↔ Secondary`, `PC ↔ Trade/Sell`): the same
  record, under exactly the rules of `updateGoalTier` /
  `setCollectorCopyKept` / `setCollectorCopyOffered`. The id is stable.
- **Cross type** (Goal ↔ CollectorCopy): one commit writes the other kind
  of record on the **same canonical printing**, re-points the **same
  Binder membership row** at it (archived Binder included — a re-point is
  not new filing), and removes the source. **The record id changes**; the
  command returns the new one. Never a second visible card; never merged
  with an existing record.
- **Nothing discarded:** the new record carries `formerly`, an append-only
  lineage of `{ kind, id, at, facts }` — every earlier record's full facts
  (a copy's grade, condition, cert, value, photos, dates, disposition; a
  Goal's tier, wanted grade, note, dates). Bounded at
  `D.COLLECTING_LINEAGE_MAX` (64) by **refusal** (`lineage-full`), never by
  truncation. Stored in the record's JSON attributes (no migration);
  Collector-only — no partner allow-list names it.
- **Changing state changes only state (B5.2):** the grade and condition
  travel. A copy made from a Goal carries the Goal's saved configuration as
  saved — Raw and its condition, or the graded grade — and nothing that was
  not saved (a Raw Goal with no condition, or a Goal with no criteria,
  yields a copy with no grade; nothing is fabricated). A Goal made from a
  copy wants what the copy is. This is the Collector reusing what they
  entered, by their own explicit action — **not** MetYet verifying a
  physical card, and no projection or screen claims verification. Nothing is
  asked after a state change; grade and condition stay independently
  editable. What a Goal cannot hold (an earlier copy's certificate,
  reference value, photos) stays in `formerly`; the copy's Copy details may
  offer it quietly as a recovery that only fills the draft.
- **Refused, changing nothing:** not the Collector's; unknown state
  (`invalid-state`); stale screen (`state-changed`); legacy non-canonical
  record (`state-change-unsupported`); Goal → copy while an active
  opportunity names the Goal (`goal-locked`); copy → Goal while a deal
  holds the copy (`copy-reserved` / `copy-committed`), if any trade ever
  named it (`copy-in-use`), if a Trusted Partner marked interest
  (`partner-interest` — partner relationships are never silently
  discarded), if a Goal for the printing exists (`duplicate-goal`), or if
  the copy lacks grade/condition (`criteria-required`).
- **Retry-safe:** a repeat of a change that landed — including after a
  lost answer, found through `formerly` — is answered as done, never done
  twice; a race from a stale `from` is `state-changed`.

Creating an additional Goal or copy is Browse's and Binder "+ Add cards"'
job, not a state change.

## 3. Binder doctrine

**State answers why this specific thing matters. Binder answers how it
is organized.**\
**Goals express priority. Binders express coherence.**

Binder is not a fifth state and never manufactures meaning. Nothing
newly enters a Binder unless it is exactly one Goal or one
CollectorCopy. Adding to a Binder is not a third way of adding a card to
MetYet.

Each Goal and CollectorCopy has **zero or one Binder home**. `Unfiled`
is a UI value, not a durable Binder. Move A→B is one semantic move.
Removing from a Binder leaves the object alive/unfiled. State changes
never move Binder home. No hidden/default Binder and no multi-Binder
copies of the same object.

### Legacy bare-card data

Historical `binder_entries` are compatibility/history only. They may be
**read, displayed and removed**, but must never be newly created by the
current product, converted, inferred into Goal/Copy truth, moved as
object membership, or used as an object's home.

Keep these separate:
`stop creating legacy data ≠ stop reading ≠ stop removing ≠ drop persistence`.

## 4. Object-level Binder architecture

Batch 3A introduced additive `binder_memberships` with stable id, Binder
id, exactly one target (`Goal XOR CollectorCopy`) and `filedAt`. One
home per object; owner coherence; archived Binder cannot receive new
filing; unfile is allowed; deleting object removes membership; no legacy
fallback/inference.

Domain commands: `fileObject`, `unfileObject`.

**Naming trap:** legacy transaction code already uses `binderId` to mean
a CollectorCopy id in places. Do not add `binderId` casually to
Goal/Copy. Prefer semantic `filedIn` if object-side naming is needed.

## 5. Accepted Batch 3B-1 --- frozen

CardSpecification now gives the Goal and every CollectorCopy its own
**single-choice** Binder home control with `Unfiled` first. Binder is
optional. One newly created Binder can be selected by multiple objects
in the same Save. Same-Save creation/file planning uses stable draft
handles and interleaves filing after each creation.

Binder view groups visually by canonical card but renders/actions on
specific object subrows. Only objects actually filed there render there.
Inside a Binder use object-level Move/Remove.

If owned copies are physically indistinguishable, do not invent durable
"Copy #1/#2." Current presentation uses truthful added-order language
("the one you added first/next"). Private copy labels are deferred.

A real stale-projection race was found: a Binder minted during Save
might not yet be in parent projection. 3B-1 preserves locally created
Binder knowledge (`madeBinders`-style) so retries do not silently drop
that destination. Do not simplify back to projection-only validation.

Current product emits **no new bare-card `file` step**. Existing legacy
rows remain visible/removable and never seed object homes.

## 6. Batch 3C audit --- accepted, implementation NOT started

Audit conclusion: `addBinderEntry` can leave external reachability
without breaking current 3B workflows, while `removeBinderEntry` must
remain for historical cleanup.

But **3B-1 must ship as its own production release first. Do not
implement 3C-1 in the same release.**

Reason: old pre-3B tabs may still send `addBinderEntry`. The current 3B
client does not. A stale-tab refusal is visible/reload-recoverable, not
silent/corrupting. One separated production release is sufficient; no
elaborate compatibility program is needed.

### Required overlap-release state

Expected before 3C-1 (verify in repo): - Exposed commands: 25 -
Client-sendable commands: 25 - Exact equality: 25=25 - Domain commands:
53 - Migrations: 14 - Refusals: 44 - Projected sections: 21 - Durable
collections: 18

During overlap: - `addBinderEntry` remains externally reachable; -
`fileCardInBinder` remains bound; - `removeBinderEntry` remains
externally reachable; - `unfileCardFromBinder` remains bound; -
**current CardSpecification emits no `kind:"file"`**.

## 7. Critical 3C test-vacuity finding

The audit temporarily closed the add door and measured the seven
affected test files. **21 tests still passed even though the legacy
fixture they were meant to reason about had not been created.**
File-level redness was largely caused by allow-list ratchets, masking
behavioral vacuity.

Eventual 3C-1 order is load-bearing: 1. Fix/convert legacy fixtures
first so historical rows are definitely created through
internal/domain-direct setup. 2. Verify relevant individual tests
observe the fixture. 3. Then re-pin the seven ratchets. 4. Close
external add exposure/client binding. 5. Preserve read/remove
compatibility. 6. Run mutation/bite pass.

Do not reverse that order.

### Expected eventual 3C-1 boundary (only after overlap release)

Subject to repository verification: - remove `addBinderEntry` from
`EXPOSED_COMMANDS`; - remove `fileCardInBinder` client binding; - retain
`removeBinderEntry` / `unfileCardFromBinder`; - retain internal domain
`addBinderEntry`; - retain `binder_entries`; - retain legacy
reads/display/removal; - exact exposed/client equality expected 24=24; -
domain expected 53; migrations 14; refusals 44; projected sections 21;
durable collections 18.

Do **not** drop `binder_entries` in 3C-1.

Later table retirement requires: external add closed + no current
writer + removal reachable + census capability + production census
zero + rollback window expired. Repository currently has no production
census proving legacy rows are zero.

## 8. Build/release verification debt

`npm run prod` and `npm run smoke` exercise the old `src/MetYet.jsx`
prototype. The production Collector client is built by
`npm run build:app`.

For current releases explicitly run at least: - `npm run build` -
`node tests/all.cjs` - `npm run prod` - `npm run smoke` -
`npm run build:app`

Do not treat green prototype smoke as proof the Collector client
contains the batch. Fixing the canonical gate is engineering debt for
before pilot, not a reason to expand Binder retirement.

Never conflate local commit, bundle, remote branch, merged `main`, and
deployed production.

## 9. Release checkpoint (2026-10-03) and next eligible batch

**3B-1 is closed in production.** PR #79 merged into `main` with a merge
commit; production runs `b658e7e` (deployed around 2026-10-03 01:00
UTC). The stale-client compatibility window began then.

Production baseline: - object-level Binder homes (`binder_memberships`,
`fileObject`/`unfileObject`) are the production baseline; - the current
client creates and files Goals and CollectorCopies and creates no new
bare-card Binder entries; - `addBinderEntry` remains externally exposed
**temporarily, only for stale-client compatibility**; -
`removeBinderEntry` remains required for legacy-row removal.

The accepted 3C audit remains authoritative for retiring the external
add door, together with the 2026-10-03 read-only checkpoint addition
that test `[36]` must compare 3B-1's own commits rather than the working
tree.

**3C-1 is the next eligible engineering cleanup batch**, defined in
`docs/tasks/BATCH_3C1_CLOSE_LEGACY_BARE_CARD_BINDER_ADD_DOOR.md`. It
becomes actionable only after the release owner explicitly decides the
compatibility window is sufficient. It must ship as a separate release
from 3B-1. **Prepared does not mean authorized.**

Phase 6 / UX work remains downstream and must not be mixed into 3C-1.
Build-gate debt (§8: `build:app` in the canonical verification gate, a
production-client smoke) remains separate from 3C-1.

Never route around repository authorization. If a push or deploy is
blocked, preserve clean state, give the exact owner action, and do not
claim deployment.

## 10. Qualification / photos / visibility

Collector flow already implemented: **Goal → exact trusted match →
inspect physical copy → request photos**.

Participant-aware visibility principle: \> **Pending closes the door; it
does not throw out the people already in the room.**

A newly unavailable copy is closed to new qualification. Existing
authorized participants retain only access needed for their
already-authorized interaction. Unrelated Collectors learn unavailable,
not rival deal details. Do not expose pending/committed/sold
distinctions as an oracle.

Partner photo fulfilment is also implemented: owning TP only;
`addCopyPhotos`; front+back fulfills open requests; fulfillment does not
change availability and may happen after Pending/committed/sold; privacy
preserved.

## 11. True Match --- closed

Matching is exact: - stated criterion → exact equality; - unstated
criterion → unrestricted.

No fuzzy matching, bands, thresholds, "or better," or preference
scoring.

## 12. Transactions / Market Value --- deferred

Do not proceed until object/Binder correction and retirement are
complete.

Keep distinct: 1. `collectorCopy.market` --- private reference; 2.
`tradeCard.agreedMarket` --- negotiated Collector trade-card value; 3.
opportunity/deal `agreedPrice` / "Agree Market Value" --- shop-copy
transaction value.

There is a naming collision to resolve before transaction entry.
`startOpportunity` is a shared-record boundary; price acceptance is
mutation-sensitive; final agreement creates hard exclusivity; Pending is
a separate availability boundary.

## 13. Browse/Search direction

Observed Collector behavior: browse by Pokémon, set and artist; artwork
is central. Product progression: **Exposure → Refinement → Curation**.

Useful discovery direction: visual Pokémon/set/artist browsing, direct
search, complete known card universe, artwork-first grid,
context-preserving navigation, lightweight TP availability overlay.

**Historical warning:** the September Browser PRD described one-tap
Pending Interest → card-level Binder assignment → later Goal priority.
That durable lifecycle is superseded where it conflicts with the
four-state/object-Binder doctrine. Do not recreate durable stateless
interest or bare-card Binder membership. Reuse the discovery ideas
later, reconciled with current invariants.

### Trusted-network inventory discovery (P6-F5A, founder-approved)

Supersedes the Phase 4 / Phase 5 rule that a Trusted Partner's copy is
never shown outside Deal Flow and that Browse names no shop. **A Collector
may discover available inventory from their connected Trusted Partners
without first creating a Goal.** This is trusted-network discovery, not an
unrestricted public marketplace:

- **Who:** only partners with an accepted relationship to the Collector;
  an unconnected shop is never named, counted or listed.
- **What:** only copies whose status *for this Collector* is `available`
  (the projection's `copyForViewer`); never archived, pending,
  committed, sold or otherwise held. Exact printing (`canonicalCardId`)
  only — a printing match is never a claim about grade or condition.
- **Shown on the Browse card:** shop name, printing, grading, Proposed
  Market Price (`ask`), Open to Offers / Firm on Price. **Never** the
  certificate, photographs, cost or acquisition date.
- **Language and scope (F5A.1):** Browse has two scopes directly under
  the search — **All Cards | Trusted Partners** (default All Cards).
  Trusted Partners is the server-side catalogue flag (`atMyShops`,
  computed from the actor's own projection by `availableAtShops`), so
  paging and search are exact and no request can widen it; switching keeps
  the search and the Pokémon / set / artist chosen. The grid's quiet line
  reads "With a Trusted Partner"; the card's section "Available from your
  Trusted Partners", grouped under each partner's own name. Collector
  Browse avoids storefront words ("shop") for this; identifiers keep
  their names.
- **Order:** grouped by shop, shops by name; within a shop by printing
  then date added. Never ranked by price; nothing recommended.
- **Looking is looking:** browsing creates no Goal, opportunity or offer.
  Starting Market Validation still requires a Primary Goal; no Goal-free
  offers.
- **Known limitation:** opening a deal does not by itself mark a copy
  unavailable — reservation happens only in deal steps not yet shipped
  (`setCopyPending` is unexposed). F5A invents no reservation behaviour.

### From discovery to Market Validation (P6-F5B, founder-approved)

Discover card → express priority → make an offer → follow Deal Flow.
Discovering a card is not wanting it: every step is the Collector's own.
Each available copy on the Browse card shows one next step, read from the
server's own answers (the Goal for that exact printing, `discoveries`,
live deals via the projected turn):

- matching **Primary** Goal (a discovery) → **Make an Offer**: opens Deal
  Flow's existing composer on that exact copy; nothing is sent until the
  Collector submits (`startOpportunity` with their amount or percentage);
- **no Goal** → **Add as Primary Goal**: fills the card's own questions from
  that copy (printing, grade/condition, looking, Primary); the Collector
  still presses Add (`addGoal`); the card stays open and the copy then
  offers Make an Offer; never an automatic opportunity;
- **Secondary** Goal → **Make it Primary** (`changeCollectingState`);
- a **live deal on the card** (any partner) → "under way with …" and **Open
  in Deal Flow** (one live offer per card is the server's rule);
- a **Primary Goal for another grade** → explained, with **Edit your Goal in
  Binders**; the Goal is never changed to fit inventory — Collector
  priorities drive opportunities, not the reverse.

No new command. Eligibility stays `startOpportunity`'s.

### Four prices, never one (Market Validation)

1. **Proposed Market Price** — the partner's own valuation of a specific
   copy (`inventory.ask`), captured on the opportunity when the Collector
   opens (`listedPrice`, with `firmOnPrice`). A reference, not a verified
   market price and not an agreement. Later shelf edits never move it.
2. **Collector's Offer** — always the Collector's opening, in whole
   dollars or a whole-number percentage of the captured price
   (`priceThread[0]`). Firm on Price: the opening must equal the captured
   price — still only an offer.
3. **Agreed Market Price** — exists only once one party explicitly accepts
   the other's latest proposal (`agreedPrice`, null until then), stored
   apart from `listedPrice`. Nothing is auto-accepted, not even an offer at
   the price. It is the card's value for later calculations — not the cash
   that changes hands.
4. **Final cash difference** — later: Agreed Market Price − total agreed
   trade value, then any final adjustment. Not built in this batch.

Opening a deal reserves nothing (B44): the copy stays available until a
later, not yet shipped, step holds it.

### Trade Selection, withdrawal and the lost shop card (M3A A1, founder-approved)

**In production since M3A A3:** Select Trade's six commands are on the
allow-list — `selectTradeCards`, `deselectTradeCard` and `closeTradeSelection`
(sent from the shop's Opportunity) and `holdTradeSelection`,
`continueTradeSelection` and `withdrawTradeCard` (sent from the Collector's
Deal Workspace). `withdrawTradeCard` keeps its full domain permission (until
final agreement); the product offers it in Select Trade and, since M3B B4,
Value Trade. Deal, Fulfillment and `chooseCashOnly` stay closed until the
screens that send them ship. Value Trade's commands opened in M3B B3 with the
shop's screen and the Collector's followed in B4 (below). A refused
close names only the caller's own rows (`detail.tradeCardIds`). The shop's
Collector Network shows each connected Collector's Trade/Sell copies,
read-only (A2). An open deal re-reads the server on arrival, on return to the
page and every 15 s while visible, deal by deal; a failed check pauses the
deal's moves until one succeeds (A3 freshness).

- **TP-led selection.** The partner selects specific copies from the
  Collector's Trade/Sell supply (`selectTradeCards`); the Collector never
  submits cards and cannot force one in. The Collector may say "hold on, I'm
  adding more cards" any number of times (`holdTradeSelection`), adds cards
  only by offering them in Browse, and says when they are ready
  (`continueTradeSelection`). The partner may deselect (`deselectTradeCard`)
  and closes selection (`closeTradeSelection`). Selection never writes
  `offered` or `keeping`. `proposeTradeSelection` / `reviewTradeCard` are
  retired (`superseded`).
- **Selected is not reserved.** A selected copy's grade, condition,
  certificate and existing photos are locked (`copy-in-deal`; an empty photo
  slot may still be filled) and snapshotted on the row, and it cannot be
  switched to PC — but other deals, the same partner's included, may select
  it too. Closing selection reserves every selected copy atomically and moves
  to Value Trade; any conflict refuses the close and changes nothing. Final
  agreement commits; completion trades. All of it is derived from the deal's
  stage (`binderRowState`); nothing is stored on the copy. No photograph is
  required anywhere.
- **Withdrawal.** The Collector may withdraw any selected card from one deal
  until final agreement. History stays; Trade/Sell is untouched; other cards'
  agreements stand; in Deal a `reset` entry voids standing figures and both
  confirmations. The last card leaving Value Trade or Deal returns the deal to
  Select Trade. Reselection is a new row. Cash only is never automatic.
- **Stale screens.** `closeTradeSelection`, `proposeFinalBalance` and
  `acceptDeal` take an optional `expect` and refuse `terms-changed`.
- **The lost shop card.** A deal whose InventoryCopy is promised to another
  deal (final agreement) or removed by the partner (before a price is agreed)
  is ENDED in the same write, `outcome: "card-unavailable"`, `endedBy: null`.
  One active deal per Goal now has no exception; a hold (`pendingFor`) ends
  nothing; an ended deal never comes back. A rival can therefore tell "held
  for now" from "gone" — by design — but not promised from sold.
- **Inventory identity.** A removed shop copy is never revived: re-adding the
  same card mints a new `invId`, and nothing (deals, holds, matches) carries
  over. The CSV import only adds.
- **Done in A1P:** the demo seed no longer holds one Collector copy in two
  deals, so `validateWorld` now enforces "reserved or committed by at most one
  active deal", "traded at most once" and "a traded copy is in no other
  exclusive hold" — while shared SELECTION stays legal. Both dev prototypes'
  Select Trade screens use the TP-led commands.

### Value Trade, card by card (M3B, founder-approved)

**Built: domain (B1), server boundary (B2), relationship guard (B2.5), the
Trusted Partner's screen (B3), the Collector's screen and the Deal Summary
(B4). Not merged or deployed: B3 and B4 ship together, on founder approval.**

- **Two steps per held card.** Its market value — the Collector opens it,
  then whoever is answering a proposal — then the trade percentage of it the
  shop credits — the shop opens it, the same back-and-forth. Accepting takes
  the other side's standing proposal; nothing is auto-accepted. A card's
  credit exists only once both are agreed: `Math.round(market × percent)`.
  When every card still in the deal is agreed, the deal moves to Deal.
- **Whole numbers (D1).** A proposed market value is whole dollars above $0;
  a proposed percentage is a whole 1–100%, still stored as the fraction
  (0.8). Anything else is refused `invalid-amount`, never rounded. Screens
  refuse it before sending; the dev prototypes still pass decimals through
  and now get that refusal.
- **Whose move.** Each card has a pending seat (`cardOwner`); the deal has
  one turn — when both seats have cards waiting, whoever moved last keeps the
  turn while they still hold a card, and with no history the partner goes
  first. Every trade row in both people's views carries `owner` (the
  domain's `cardOwner`, projected; never stored). A card waiting on you is
  "your move" only when the deal's turn is also yours; otherwise "you're
  next". Screens read `owner` and `turn`; they never work out a turn.
- **The shop may decline a card (D2, D7, D8)** — `declineTradeCard`, at any
  turn, in Value Trade only, on a card still in the deal. The row becomes
  `rejected` with `declinedAt`/`declinedStage` and its history kept; its
  hold is released and it stops counting; no other card changes. No card left:
  back to Select Trade. Every remaining card agreed: on to Deal. An optional
  note, one line of at most 140 characters (spaces collapsed, counted by
  character), is stored as `declineNote` and seen by both. Nothing is written
  to a copy or the shelf.
- **The cash on screen is provisional.** The agreed price minus the credits
  of the cards whose values are both agreed (`calculatedBalance`): positive,
  the Collector pays the shop; negative, the shop pays the Collector. The
  final balance is Deal's.
- **Production (B3).** The five — `proposeMarketValue`, `acceptMarketValue`,
  `proposeTradePercent`, `acceptTradePercent`, `declineTradeCard` — are on
  the allow-list (42), sent by the Trusted Partner's Opportunities. No
  default rate is ever filled in for the shop's percentage. A deal whose
  cards are all agreed shows them read-only, "Deal coming soon": no Deal
  control. Deal, Fulfillment and `chooseCashOnly` stay closed.
- **The Collector's screen (B4).** In the Deal Workspace, with four of the
  same bindings — open and counter a market value, accept the shop's, counter
  and accept its % — plus the existing `withdrawTradeCard`, now offered in
  Value Trade too, after a confirmation (Select Trade and Value Trade only;
  Deal has no screen). Never the shop's decline; no allow-list change (42).
  A card the shop declined shows the shop's note and that the card is out of
  this deal and still Trade/Sell. Steps 1–4 of the journey are available.
- **The Deal Summary (B4 foundation): one deal, one shared truth, two
  perspectives.** One component (`client/deal-summary.jsx`) rendered on both
  seats from Value Trade on — the Collector's Deal Workspace and the Trusted
  Partner's Opportunity — with one stylesheet. There is no secret view: both
  see the same card being bought (catalogue picture, name, set, printed number
  with the release's printed total when the catalogue holds one — "173/165",
  else "#173", never an invented denominator — exact printing including
  language, the shop copy's own grade and cert or raw condition, the agreed
  price), each trade-in still in the deal (the same identification, text only,
  with grade and cert when graded; `market × % = −credit`, or "Not valued
  yet"), the deal's valuation status, and the bottom line. The bottom line is
  **"You Owe" and "You Receive"**, both always shown, relative to the viewer:
  one signed balance (the domain's `calculatedBalance`), never negative, never
  both above $0, mirror images across the two seats. Above them, "Agreed
  trade-in value $X" (a positive subtotal; each trade-in line keeps its
  `−$credit`). While any trade-in is still being valued the amounts are
  labelled "Current amounts", preceded by "These amounts may change until all
  trade-in values are agreed.", and drawn quieter; once every value is agreed
  the label and note go and the amount due takes its full weight. Both seats
  give it the same width on a phone; on a wide screen it is a centred,
  receipt-width card. One wording for one card on every deal surface
  (`client/printing.js`): the printed number with its set total where the
  catalogue holds one, a raw copy as "Near Mint · Ungraded". It is a
  presentation of the projected deal — not a ledger,
  snapshot, receipt or record of payment. Shared financial truth does not
  share permissions or private fields (a shop's cost, a Collector's own
  reference value). The picture is the catalogue's, captioned: a copy's
  `photos` are typed references, not images MetYet holds, so they are never
  shown as one. It is meant to grow into the handoff reference and the
  permanent receipt; those, export, sharing and the Copy Summary (#83) are not
  built.
- **B3 and B4 ship together** in one M3B PR, merged and deployed only with
  further founder approval.

### Relationship ending: loss of capability, not loss of record (M3B, founder-approved 2026-11-08)

**Approved future requirement — NOT implemented.** No relationship-ending
command exists yet. When one is built, ending a Collector–Trusted Partner
relationship must:

- make every deal between the two that is not already completed permanently
  terminal, whatever its stage — Fulfillment included;
- record `relationship-ended` as each such deal's outcome, preserving the
  stage it ended at and its history;
- release every outstanding reservation held by those deals;
- leave neither party able to reopen or continue those deals in MetYet;
  re-establishing the relationship never reactivates them;
- leave completed deals completed;
- keep history readable by the original participants, within the existing
  privacy boundaries;
- never present a recorded physical transfer as reversed because the
  relationship ended. Unresolved real-world obligations are settled outside
  MetYet.

This supersedes the earlier recommendation that Fulfillment continue after a
relationship ends.

**Interim safeguard (M3B B2.5, in code now).** Until that lifecycle exists,
`metyet-commands.js` refuses new deal commitments with `no-relationship` when
the deal's own pair has no current accepted relationship: `proposePrice`,
`acceptPrice`, the four Value Trade valuation commands, `chooseCashOnly`,
`proposeFinalBalance`, `acceptDeal`, and marking a shop copy pending (as
`startOpportunity`, `selectTradeCards` and `closeTradeSelection` already
did). Ways out stay open (withdraw, decline, deselect, hold, cancel, decline
offer, releasing a pending mark), as do deal messages, read marks and
Fulfillment for finally agreed deals. Nothing is ended or released
automatically. The guard is not the final lifecycle: the future command
replaces "Fulfillment continues" with termination as above.

## 14. TP inventory ingestion --- deferred

Potential ingestion: manual lookup/add, CSV import from tools, dedicated
integrations. Do not build this before the Collector loop is stable. TP
demand should derive from specific Goals with privacy proven.

## 15. Visual reconciliation --- later

Current work establishes meaning/domain/interactions/privacy, not final
visual direction. When visual work begins, use founder-provided
mockups/screenshots as targets and preserve domain constraints. Do not
let implementation convenience invent a new visual language.

## 16. Testing standard

Green is necessary, not sufficient. For boundary changes: - identify
doctrinal assertions; - deliberately reverse/update them when doctrine
changes; - replace them with the new invariant; - run adversarial
scenarios; - mutation-test load-bearing claims; - verify individual
tests are non-vacuous; - then full suite/build.

Do not accept a green test whose fixture never existed, or an allow-list
failure as proof behavioral assertions bite.

## 17. Seed a fresh Claude Project with only these

**Required:** 1. `METYET_CANONICAL_ENGINEERING_CONTEXT_2026-10-02.md`
(this file) 2.
`SUBMIT_THIS_FILE_TO_CLAUDE_MetYet_Land_and_Deploy_Through_Batch_3B1.md`
3.
`MetYet_Batch_3C_Legacy_Bare_Card_Binder_Retirement_Pre_Implementation_Audit.md`
4. Current repository access **or** latest verified git bundle (repo
preferred; bundle fallback)

**Only if implementation archaeology is needed:** 5. Batch 3B-1
hand-back 6. Batch 3B audit 7. Batch 3A closure hand-back

Do **not** preload the old Claude Project or all historical PRDs/chats.
Add older artifacts only when a task actually needs them.

## 18. Immediate instruction to the next Claude session

Read this file first, then the current task prompt and latest 3C audit.
Inspect the repository before action.

3B-1 is landed and live (§9). Do not begin 3C-1 unless the current task
explicitly states that the release owner has authorized closing the
stale-client compatibility window. When authorized, follow
`docs/tasks/BATCH_3C1_CLOSE_LEGACY_BARE_CARD_BINDER_ADD_DOOR.md`
exactly, including its mandatory order: fixtures converted first,
per-test anti-vacuity proof, then closure.
