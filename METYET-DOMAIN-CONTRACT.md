# The MetYet Domain Contract

What must remain true in production, independent of how it is built.

This is not a description of the prototype's implementation. It is the product
contract the prototype was written to pin down. Where the two differ, this
document wins — and §9 marks the places where prototype mechanics should
explicitly *not* be copied forward.

---

## 1. Entities

| Entity | Identity | Owned by | Notes |
|---|---|---|---|
| **Collector** | `collectorId` | — | A person who collects. |
| **Trusted Partner** | `partnerId` | — | A shop or dealer. The logged-in partner is not special; it is one row. |
| **Relationship** | (`partnerId`, `collectorId`) | both | An accepted connection. It places the Collector in that partner's **Collector Network**. Durable, and independent of how the invitation was delivered. |
| **Invitation** | `inviteId` | `partnerId` | A Trusted Partner's offer to connect, delivered by link or QR code. Accepting it creates the Relationship; the invitation is not the relationship. |
| **Card Identity** | `cardId` | — | The abstract printing. Not a physical thing. |
| **InventoryCopy** | `invId` | `partnerId` | One physical copy a partner holds. Photos encouraged, not required. |
| **BinderCopy** | `binderId` | `collectorId` | One physical copy a collector will trade. Both faces photographed. |
| **Goal** | `goalId` | `collectorId` | What a collector wants, at an exact identity. Primary or Secondary. |
| **Preference** | — | `collectorId` | Broad affinity tags. Not a Goal. |
| **TPInterest** | (`partnerId`, `binderId`) | `partnerId` | A relationship, not a flag. |
| **Conversation** | `conversationId` | participants | Contextual thread between related parties. |
| **Opportunity** | `oppId` | both | One structured negotiation between related parties. |

### Card identity is exact

Eight dimensions, all significant: **name, set, printed number, print/finish,
edition, language, grade** — plus **condition** when the grade is `Raw`.

A PSA 9 Base Set Charizard and a PSA 8 Base Set Charizard are **different cards**.
So are the English and Japanese printings, and a PSA 9 and a BGS 9 of one
printing — a grade names its grading company as well as its number. This is the
single matching rule used by goal matching, inventory matching, demand and supply.
Do not loosen it in one place to produce more matches; that silently changes what
every other surface means.

### Physical copies are not identities

An `InventoryCopy` and a `BinderCopy` are things you can photograph. Two copies of
the same card are two records. A transaction always references the **exact copy
id**, never the identity — because when a collector proposes *their* Electabuzz,
both parties must be looking at that copy. For the same reason, one physical copy
can be promised into only one active deal at a time (§4).

### Pilot catalog scope

The controlled pilot supports **Pokémon cards**, and **PSA** is the only grading
company it offers. `Raw`, with its condition, remains a grade as defined above.

PSA is a deliberate constraint on the pilot — less complexity, less choice
overload for collectors — not a property of the identity model. Because a grade
carries its grading company, CGC, BGS and others can be added later without
changing the identity rule. Narrowing the catalog never loosens exactness.

### Seats, accounts and shops

**Collector** and **Trusted Partner** are *seats*: the roles through which a
signed-in account acts.

- In the pilot, a signed-in account operates in one seat at a time. Role
  switching is not offered.
- The identity model must not make holding both seats impossible. Trusted
  Partners often collect, and one person holding both must remain possible later.
- One Trusted Partner seat represents one shop or dealer. Staff logins, employee
  roles and shop-level permissions are out of scope for the pilot.

---

## 2. Relationships

```
TrustedPartner ──issues──> Invitation ──accepted by──> Collector
TrustedPartner <──Relationship──> Collector     (the partner's Collector Network)

Collector ──owns──> BinderCopy ──is a──> CardIdentity
    │                    ▲
    │                    └──interested in── TrustedPartner (related)
    ├──states──> Goal ──names──> CardIdentity
    └──has──> Preference

TrustedPartner ──owns──> InventoryCopy ──is a──> CardIdentity

Opportunity ──within──> Relationship
            ──references──> Goal, Collector, TrustedPartner,
                            InventoryCopy (the card being bought),
                            BinderCopy[] (the cards being traded)

Conversation ──between──> Collector + TrustedPartner (related)
             ──optionally about──> Goal | InventoryCopy | BinderCopy | Opportunity
```

**Supply and demand are the same computation read from opposite ends, inside the
network.** "Which of my Trusted Partners have what I want" and "which collectors
in my Collector Network want what I hold" are one identity match, not two
features — and both are bounded by accepted Relationships.

### Relationships and the Collector Network

MetYet is a relationship network, not an open marketplace (§8).

1. A Trusted Partner creates an **Invitation**, which may be delivered as a link
   or a QR code.
2. A new Collector uses it to create their account; an existing Collector accepts
   it from their account.
3. Acceptance creates the **Relationship** and adds the Collector to that
   partner's **Collector Network**.
4. A Collector may belong to any number of Collector Networks. There is one
   Relationship per partner–collector pair.

The link or QR code only delivers the invitation. The Relationship is durable
domain data and does not depend on how it was formed.

The Relationship is the network boundary: it decides *whose* data a party may see
and with whom they may coordinate (§3). It never decides *which fields* — a
Relationship gives no access to the collector's binder reference value or to
anyone's unsubmitted negotiation input.

---

## 3. Visibility

Visibility is a **domain rule**, not a UI convention. Enforce it where the data
is projected, not on each screen — a screen that forgets is a leak.

Two boundaries apply together: the **network** boundary (an accepted Relationship
must exist) and the **field** boundary (the table below). Neither substitutes for
the other.

| Field | Collector | Trusted Partner |
|---|---|---|
| Relationship | read own (their Trusted Partners) | read own (their Collector Network) |
| Invitation | accept one they were given | create / read own |
| Goal (card, tier, note) | read/write own | read, for Collectors in their network (network demand) |
| InventoryCopy identity, ask, photos | read, for their Trusted Partners | read/write own |
| InventoryCopy cost | — | read/write own |
| BinderCopy identity, photos, cert | read/write own | read, for Collectors in their network |
| **BinderCopy reference value** | **read own** | **never** |
| TPInterest | sees which of their Trusted Partners | read/write own, on copies in their network |
| Conversation | participants only | participants only |
| Opportunity terms, history, cancellation reason | participants only | participants only |
| Draft negotiation input | own, until submitted | own, until submitted |

### The two private values

**The collector's binder reference value** is their own note about what a card is
worth to them. It may prefill their own Value Trade field. It is never an asking
price, and it must never reach a partner — not in network supply, not in a
collector profile, not in Select Trade, not through an interest signal.

**Draft negotiation input** on either side is private until submitted. Typing a
number is not proposing it.

Both follow the same principle: **intent becomes shared only when the person
deliberately submits it.** A Relationship changes neither.

---

## 4. Opportunity lifecycle

```
Goal:         Secondary Goal ──promote──> Primary Goal
                                              │  Review Card (optional; creates nothing)
                                              ▼  the collector opens a negotiation
Opportunity:  Agree on Price → Select Trade → Value Trade → Deal → Fulfillment → Completed

              Cancelled — by either participant, at any point before Completed
```

Secondary Goal and Primary Goal are **tiers of a Goal**, not stages of an
Opportunity. They are the intent that precedes a negotiation; an Opportunity
exists only from Agree on Price onward.

**An active Opportunity locks its Goal at Primary.** While the Opportunity is
active, the Goal cannot be demoted to Secondary or removed, and its negotiation
stays attached to it until the Opportunity is terminal. After cancellation the
Goal is released under the derived-state rules and may be demoted, edited or
removed if otherwise allowed; completion satisfies it (§6).

| Stage | What is being settled | Advances when |
|---|---|---|
| Secondary / Primary Goal *(Goal tier)* | nothing — this is intent | Secondary: the collector promotes it. Primary: the collector opens a negotiation |
| Review Card *(pre-deal, optional)* | nothing — context about one exact copy | — (creates no Opportunity) |
| Agree on Price | the price of the card being bought | both accept a figure; the exact InventoryCopy becomes committed |
| Select Trade | *which* copies are included — no values. Submitting the package reserves each copy; the partner accepting a copy commits it, after which the collector cannot withdraw it | the partner has reviewed every proposal |
| Value Trade | per card: market value, then trade %. Accepted copies stay committed | every accepted card has both terms |
| Deal | the cash balance, and an optional final concession | the partner gives final agreement to the current economic state, then the collector does; changing the figure restarts confirmation |
| Fulfillment | the in-person handoff | the collector confirms the partner's plan; the partner confirms the handoff; the collector confirms receipt |
| Completed | — | terminal |
| Cancelled | — | terminal; either participant, before Completed |

**Only the collector opens a negotiation**, only from a **Primary Goal**, and only
with a Trusted Partner they have a Relationship with. A Secondary Goal must be
promoted first. A partner expressing interest or reaching out does not start one.

**Review Card is pre-deal context.** The collector looks closely at one exact
InventoryCopy — its photos, or a request to see them — before deciding whether to
make an offer. It creates no Opportunity, takes no negotiation slot and commits
nothing. Only opening a negotiation does.

**Every stage has exactly one owner.** The system must always be able to say
whose move it is. Store the *actor*; let each persona choose the words —
`actor: "collector"` reads as "Your move" to them and "Waiting on the collector"
to the partner. Never store the phrasing.

**Where both participants must confirm, the order is fixed**, so there is still
exactly one current actor:

- **Final agreement in Deal.** Final agreement is agreement to the **current
  economic state**: the agreed price and trade values, and the current final
  cash figure — the calculated balance, or the latest proposed figure. The
  Trusted Partner confirms that state first and the Collector second. Only the
  Collector's confirmation of the current state advances the Opportunity to
  Fulfillment.

  **Change the deal → reconfirm the deal.** If the final cash figure changes
  after either participant has confirmed — including a new final-balance
  proposal after the partner has confirmed the previous figure — every
  confirmation of the superseded state lapses, the new figure becomes the
  current state, and confirmation starts again: partner first, Collector
  second. A confirmation never carries over to a figure it did not approve.
- **Handoff in Fulfillment.** Once the Collector has confirmed the partner's plan,
  the Trusted Partner confirms the physical handoff first and the Collector
  confirms receipt second. The Collector's confirmation completes the
  Opportunity.

Both personas derive the same actor from this one rule. There is one turn rule,
never one per persona.

### Fulfillment: in-person handoff

Pilot fulfillment is an **in-person handoff**, the only fulfillment method in the
pilot.

1. The Trusted Partner proposes the handoff plan — where and when.
2. The Collector confirms the plan. If it does not work, the partner proposes
   again; nothing is handed over against an unconfirmed plan.
3. The Trusted Partner confirms the physical handoff.
4. The Collector confirms receipt. That confirmation completes the Opportunity.

Shipping is out of scope: no addresses, tracking, carriers, insurance or shipping
states. A fulfillment plan names its method, so another method can be added later
without changing the lifecycle.

### Physical copies through the lifecycle

A copy's status is derived from the Opportunities that reference that exact copy
(§6). Nothing is written to the copy when a deal moves.

| | InventoryCopy (partner) | BinderCopy (collector) |
|---|---|---|
| **Available** | not committed, not archived | not reserved, not committed |
| **Reserved** | — | in a submitted trade package of an active Opportunity, not yet accepted by the partner |
| **Committed** | price agreed in an active Opportunity | accepted by the partner into an active Opportunity's trade |
| **After Completed** | **Sold** — no longer available supply | **Traded** — no longer available Binder supply |
| **After Cancelled** | released: available again | released: available again |

- A committed copy is committed to **one** Opportunity at a time. It cannot be
  committed to another. A committed InventoryCopy cannot be removed or archived,
  and a committed BinderCopy cannot be withdrawn by the collector alone or
  removed from the Binder.
- While a copy is committed, nothing that would change *which copy* the parties
  believe they are negotiating over — its card identity or its certification —
  may change, until the deal completes or is cancelled.
- **One exact BinderCopy may participate in only one active submitted trade
  package at a time.**
  - *Draft.* Before the collector submits the trade package, selecting or
    deselecting a copy is private draft input. It reserves nothing.
  - *Reserved.* Submitting the package reserves each copy in it for that
    Opportunity. A reserved copy cannot be submitted into another active
    Opportunity. It remains the collector's and is not yet accepted into the
    trade. It is released if the partner rejects it, the collector withdraws it
    before the partner accepts it (where the Select Trade workflow permits), or
    the Opportunity is cancelled.
  - *Committed.* When the partner accepts it into the trade, it is committed to
    that Opportunity. The collector cannot withdraw it unilaterally or remove it
    from the Binder, it cannot be submitted or committed into another
    Opportunity, and its identity and certification are locked. It stays
    committed until the Opportunity completes, when it becomes Traded, or is
    cancelled, when it is released. No pilot action changes an accepted trade
    package; any future change would have to be an explicit, mutual
    renegotiation.
- Completion never deletes a copy. The completed Opportunity is the historical
  record connecting the transferred copies to the agreed terms.
- Received trade cards do **not** become partner inventory automatically. A
  later, explicit workflow — *Add received cards to inventory* — may let the
  partner create InventoryCopies from them deliberately.

### Cancellation

MetYet coordinates agreements. An agreement recorded in MetYet is not treated by
the product as a legally binding transaction, and this contract prescribes no
penalties or legal consequences.

- **Either participant may cancel** at any point before the Opportunity is
  Completed.
- **Before final agreement**, cancelling ends the Opportunity. A reason may be
  given.
- **After both participants have given final agreement**, either may still
  cancel, but **a reason is required**, and history shows the deal as
  **cancelled after agreement**.
- Cancelling never deletes the Opportunity and never rewrites its terms. Who
  cancelled, when, at which stage and why are kept alongside everything that was
  agreed.
- Cancelling releases what the deal held — the Goal returns to Seeking and
  reserved and committed copies become available, staying in their owner's
  Binder or inventory — by derivation, with no further mutation (§6). Deal
  history keeps its references to them.
- **Completed and Cancelled are both terminal.** A completed deal cannot be
  cancelled, reopened or amended; a cancelled deal cannot be resumed. Negotiating
  again means opening a new Opportunity.

---

## 5. Invariants

These are the rules that must hold no matter which surface or client is calling.
Enforce them **in the action**, not in a button's disabled state.

1. **One active negotiation per Goal.** A collector may talk to every Trusted
   Partner holding the card, but may negotiate with only one at a time.
   Alternatives stay visible; only the offer is limited.
2. **Reach out never creates an Opportunity.** Conversation and negotiation are
   different acts.
3. **TP Interest is not a commitment.** It means "I would consider this copy in a
   trade" — not an offer, reservation, valuation, or demand.
4. **TP Interest references an exact BinderCopy**, never a card identity.
5. **A BinderCopy requires both photographed faces.** Enforced at creation, so
   nothing downstream ever has to re-ask or handle a partial copy. (InventoryCopy
   photos are encouraged, not required.)
6. **Select Trade establishes no value.** Which copies, not what they are worth.
7. **Interest orders Select Trade; it does not gate it.** Every binder copy is
   eligible. Letting a partner's willingness decide what a collector may *offer*
   is backwards. (A copy already reserved or committed in another active
   Opportunity is not available to submit — §4.)
8. **The collector's reference value never reaches a partner.**
9. **Agreed terms are preserved downstream.** Once a price, a card value or a
   trade percentage is agreed, no later stage may silently change it. The Deal
   stage's final negotiation moves *cash only*. Cancellation preserves them too.
10. **Successful completion satisfies the Goal** and retires the transferred
    copies from available supply. No separate mutation.
11. **Cancellation unlocks the Goal** and releases reserved and committed copies,
    and the cancelled opportunity is kept as history, with its agreed terms
    intact. Never delete it.
12. **Relationships bound the network.** A partner sees Collector demand, Binder
    context and deal activity only for Collectors in their Collector Network; a
    Collector reaches out to and negotiates only with Trusted Partners they are
    related to. A Relationship never widens field-level privacy.
13. **A negotiation opens only from a Primary Goal, and holds it there.** Review
    Card and reach out never open one. While the Opportunity is active, its Goal
    cannot be demoted to Secondary or removed.
14. **Agreeing the price commits the exact InventoryCopy.** A committed copy
    cannot be committed to a second Opportunity, and cannot be removed or
    archived while committed.
15. **A committed copy keeps its identity.** The card identity and certification
    of a committed InventoryCopy or BinderCopy cannot change until completion or
    cancellation.
16. **Handoff follows a confirmed plan.** The partner proposes the in-person plan
    and the collector confirms it before the handoff can be confirmed.
17. **Completed is final; cancelling after agreement needs a reason.** A completed
    Opportunity cannot be cancelled or reopened. Cancelling after both final
    agreements requires a reason and is recorded as cancelled after agreement.
18. **One BinderCopy, one active trade package.** Submitting a trade package
    reserves each exact BinderCopy in it; the partner's acceptance commits it. A
    reserved or committed copy cannot be submitted into another active
    Opportunity. Draft selection reserves nothing. A committed copy cannot be
    withdrawn unilaterally or removed from the Binder; it stays committed until
    the Opportunity completes or is cancelled.
19. **Two-sided confirmations are ordered.** At final agreement in Deal and at the
    handoff in Fulfillment, the Trusted Partner confirms first and the Collector
    second. The Collector's final agreement advances the deal to Fulfillment;
    the Collector's receipt completes it.
20. **Change the deal → reconfirm the deal.** A final agreement holds only for the
    economic state it confirmed. Any change to the final cash figure clears every
    earlier final agreement, and confirmation restarts with the partner. A stale
    confirmation never advances the Opportunity.

---

## 6. Derived state — calculate, do not persist

Storing any of these creates a second source of truth that will drift.

| Derived | From |
|---|---|
| **Goal state** — Seeking / Negotiating / Satisfied | the goal's opportunities |
| **Copy status** — Available / Reserved / Committed / Sold or Traded | the opportunities referencing the exact copy (§4) |
| **Collector Network** | the partner's accepted Relationships |
| **Turn ownership** | opportunity stage + last thread entry + the fixed confirmation order (§4) |
| **Matching supply** | identity match, goals × inventory of the collector's Trusted Partners, excluding sold and archived copies |
| **Network demand** | identity match, inventory × goals of Collectors in the partner's network, owner excluded |
| **Network supply** | binder copies of Collectors in the partner's network, excluding traded copies |
| **Trade value** | `agreedMarket × agreedPercent`, both required |
| **Cash balance** | `agreedPrice − totalTradeValue` |
| **"New since review"** | `addedAt` vs the partner's review timestamp |
| **Final agreement in force** | confirmations given to the current economic state; confirmations of a superseded state count for nothing |
| **Cancelled after agreement** | a cancelled opportunity on which both participants had confirmed the same, then-current economic state |

**Goal state deserves emphasis.** Because it derives, cancelling a negotiation
returns a goal to Seeking with *no mutation at all*, and completion satisfies it
the same way. A stored `goal.status` would need resetting in both cases, and
would eventually disagree with the opportunities. The tier lock derives the same
way: a Goal is locked at Primary exactly while it has an active Opportunity.

**Copy status follows the same rule.** Submitting a trade package reserves its
BinderCopies and acceptance commits them; completion makes the InventoryCopy Sold
and each traded BinderCopy Traded; cancellation releases them; neither touches
the copy records. A persistence model may represent these statuses for querying,
but they must always agree with, and be recomputable from, the opportunities.

**Directionality matters.** A positive balance means the collector pays the
partner; negative means the partner pays the collector. Keep one sign convention
and let each persona word it.

---

## 7. Canonical actions

One path per business operation. Persona permission wraps these; it does not
reimplement them.

```
createInvitation · acceptInvitation
addGoal · updateGoalTier · removeGoal
addInventoryCopy · updateInventoryCopy · removeInventoryCopy
addBinderCopy · updateBinderCopy · removeBinderCopy
setInterest
reachOut · sendMessage
startOpportunity · proposePrice · acceptPrice
proposeTradeSelection · withdrawTradeCard · reviewTradeCard
proposeMarketValue · acceptMarketValue
proposeTradePercent · acceptTradePercent
proposeFinalBalance · acceptDeal
proposeFulfillment · confirmFulfillmentPlan · confirmHandoff
cancelOpportunity
```

`acceptInvitation` creates the Relationship, or leaves an existing one in place.
`removeGoal`, and `updateGoalTier` demoting to Secondary, refuse while the Goal
has an active Opportunity. `startOpportunity` refuses a second negotiation on the
same goal, a Secondary Goal, and a partner the collector has no Relationship
with. `acceptPrice` refuses an InventoryCopy already committed elsewhere.
`proposeTradeSelection` refuses a BinderCopy already reserved or committed in
another active Opportunity. `withdrawTradeCard` is valid only for a Reserved
BinderCopy and refuses a Committed one. `removeInventoryCopy` refuses a committed
copy, and `removeBinderCopy` refuses a committed copy. `updateInventoryCopy` and
`updateBinderCopy` refuse identity or certification changes to a committed copy.
`addBinderCopy` refuses a copy without both photos. `proposeFinalBalance`
refuses outside the Deal stage; a new figure supersedes the current economic
state and clears every final agreement already given. `acceptDeal` refuses
outside the Deal stage, refuses the collector's agreement until the partner has
agreed to the current economic state, and never counts an agreement given to a
superseded state. `confirmHandoff` refuses until the collector has confirmed the
plan, and refuses the collector's receipt until the partner has confirmed the
handoff. `cancelOpportunity` refuses a Completed Opportunity, and requires a
reason once both final agreements have been given. These refusals belong to the
action.

Completion is not a separate action: the collector's confirmation of receipt
completes the Opportunity (Invariant 10). *Add received cards to inventory* is a
later, explicit partner workflow and is not part of the pilot set.

---

## 8. The governing rules

> **MetYet is a relationship network, not an open marketplace.**

Trusted Partners build Collector Networks through explicit accepted
relationships. Demand, supply context and deal coordination are surfaced within
those relationships, while the existing privacy and ownership boundaries continue
to apply. In the pilot there is no open discovery outside them.

> **One mutation → one canonical state change → two perspectives → no synchronisation.**

If an action requires updating a second record so another persona can see it, the
model is wrong. There is one Relationship, one Goal, one InventoryCopy, one
BinderCopy, one interest relationship, one Conversation and one Opportunity — each
rendered differently depending on who is looking.

---

## 9. Prototype vs. production

### Should survive

Everything above: the entities and their identity rules, the relationships and
the Collector Network, the visibility table, the lifecycle and its transition
conditions, the invariants, the derived-state list, and both governing rules.

Also the **vocabulary**. Primary Goal, Secondary Goal, Trade Binder, Agree on
Price, Select Trade, Value Trade, Deal, Fulfillment, Market Value, Trade %, Trade
Value, Final negotiation, Collector Network, Review Card, Cancelled after
agreement. These words are load-bearing — they were chosen so the two personas can
discuss one transaction without translation.

### Should not be copied forward

- **In-memory store and plain-object graph.** Sufficient for a prototype; not a
  data model.
- **Seed fixtures and fixed dates.** Demo scaffolding.
- **Id formats** (`p-self`, `cc0`, `k1`). Arbitrary.
- **Single-file components and inline CSS.** Prototype packaging.
- **Photo placeholders.** The invariant is real; `"binder:t1:front"` is not.
- **Demo simulation controls** that act as the other party.
- **The persona chooser and hard-coded seats** (`p-self`, `c12`). A seat belongs
  to a signed-in account.
- **An implicit network in which everyone is connected.** Relationships are
  explicit (§2).
- **The PSA grade list as the definition of grade.** PSA is pilot scope, not the
  identity model (§1).
- **The specific projection functions.** The *boundary* must exist; its shape is
  yours to choose.

### Pilot scope

Deliberate limits of the controlled pilot, each defined in its section. None may
be built in a way that makes the later extension impossible.

| In the pilot | Not in the pilot | Must stay possible |
|---|---|---|
| Relationships formed by partner invitation (§2) | Open marketplace discovery | — |
| In-person handoff (§4) | Shipping, addresses, tracking, carriers, insurance | Other fulfillment methods |
| One seat per shop (§1) | Staff logins, employee roles, shop permissions | Multi-staff shops |
| One seat per signed-in account at a time (§1) | Role switching | One person holding both seats |
| Pokémon cards, PSA grading (§1) | Other grading companies | CGC, BGS and others |
| Received trade cards stay out of inventory (§4) | Automatic inventory creation | An explicit *Add received cards to inventory* workflow |

### Deliberately unspecified

Database, API shape, framework, authentication, authorisation mechanism,
transport, hosting, and how invitations are delivered (link or QR code format).
The contract says what must remain true, not how to build it.

One caution worth carrying forward: the privacy rules and the invariants are the
parts most likely to be lost in a rewrite, because they are invisible when
working correctly. They are the parts most worth testing first.
