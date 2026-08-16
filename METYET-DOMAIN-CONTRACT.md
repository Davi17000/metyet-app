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
| **Card Identity** | `cardId` | — | The abstract printing. Not a physical thing. |
| **InventoryCopy** | `invId` | `partnerId` | One physical copy a partner holds. |
| **BinderCopy** | `binderId` | `collectorId` | One physical copy a collector will trade. |
| **Goal** | `goalId` | `collectorId` | What a collector wants, at an exact identity. |
| **Preference** | — | `collectorId` | Broad affinity tags. Not a Goal. |
| **TPInterest** | (`partnerId`, `binderId`) | `partnerId` | A relationship, not a flag. |
| **Conversation** | `conversationId` | participants | Contextual thread. |
| **Opportunity** | `oppId` | both | One structured negotiation. |

### Card identity is exact

Eight dimensions, all significant: **name, set, printed number, print/finish,
edition, language, grade** — plus **condition** when the grade is `Raw`.

A PSA 9 Base Set Charizard and a PSA 8 Base Set Charizard are **different cards**.
So are the English and Japanese printings. This is the single matching rule used
by goal matching, inventory matching, demand and supply. Do not loosen it in one
place to produce more matches; that silently changes what every other surface means.

### Physical copies are not identities

An `InventoryCopy` and a `BinderCopy` are things you can photograph. Two copies of
the same card are two records. A transaction always references the **exact copy
id**, never the identity — because when a collector proposes *their* Electabuzz,
both parties must be looking at that copy.

---

## 2. Relationships

```
Collector ──owns──> BinderCopy ──is a──> CardIdentity
    │                    ▲
    │                    └──interested in── TrustedPartner
    ├──states──> Goal ──names──> CardIdentity
    └──has──> Preference

TrustedPartner ──owns──> InventoryCopy ──is a──> CardIdentity

Opportunity ──references──> Goal, Collector, TrustedPartner,
                            InventoryCopy (the card being bought),
                            BinderCopy[] (the cards being traded)

Conversation ──between──> Collector + TrustedPartner
             ──optionally about──> Goal | InventoryCopy | BinderCopy | Opportunity
```

**Supply and demand are the same computation read from opposite ends.** "Which
partners have what I want" and "which collectors want what I hold" are one
identity match, not two features.

---

## 3. Visibility

Visibility is a **domain rule**, not a UI convention. Enforce it where the data
is projected, not on each screen — a screen that forgets is a leak.

| Field | Collector | Trusted Partner |
|---|---|---|
| Goal (card, tier, note) | read/write own | read (network demand) |
| InventoryCopy identity, ask | read | read/write own |
| InventoryCopy cost | — | read/write own |
| BinderCopy identity, photos, cert | read/write own | read |
| **BinderCopy reference value** | **read own** | **never** |
| TPInterest | sees which partners | read/write own |
| Conversation | participants only | participants only |
| Opportunity agreed terms | read | read |
| Draft negotiation input | own, until submitted | own, until submitted |

### The two private values

**The collector's binder reference value** is their own note about what a card is
worth to them. It may prefill their own Value Trade field. It is never an asking
price, and it must never reach a partner — not in network supply, not in a
collector profile, not in Select Trade, not through an interest signal.

**Draft negotiation input** on either side is private until submitted. Typing a
number is not proposing it.

Both follow the same principle: **intent becomes shared only when the person
deliberately submits it.**

---

## 4. Opportunity lifecycle

```
Secondary Goal → Primary Goal → Agree on Price → Select Trade
    → Value Trade → Deal → Fulfillment → Completed
```

| Stage | What is being settled | Advances when |
|---|---|---|
| Secondary / Primary Goal | nothing — this is intent | the collector makes an offer |
| Agree on Price | the price of the card being bought | both accept a figure |
| Select Trade | *which* copies are included — no values | the partner has reviewed every proposal |
| Value Trade | per card: market value, then trade % | every accepted card has both terms |
| Deal | the cash balance, and an optional final concession | both agree |
| Fulfillment | the physical handoff | both confirm |
| Completed | — | terminal |

**Only the collector opens a negotiation.** A partner expressing interest or
reaching out does not start one.

**Every stage has exactly one owner.** The system must always be able to say
whose move it is. Store the *actor*; let each persona choose the words —
`actor: "collector"` reads as "Your move" to them and "Waiting on the collector"
to the partner. Never store the phrasing.

---

## 5. Invariants

These are the rules that must hold no matter which surface or client is calling.
Enforce them **in the action**, not in a button's disabled state.

1. **One active negotiation per Goal.** A collector may talk to every partner
   holding the card, but may negotiate with only one at a time. Alternatives stay
   visible; only the offer is limited.
2. **Reach out never creates an Opportunity.** Conversation and negotiation are
   different acts.
3. **TP Interest is not a commitment.** It means "I would consider this copy in a
   trade" — not an offer, reservation, valuation, or demand.
4. **TP Interest references an exact BinderCopy**, never a card identity.
5. **A BinderCopy requires both photographed faces.** Enforced at creation, so
   nothing downstream ever has to re-ask or handle a partial copy.
6. **Select Trade establishes no value.** Which copies, not what they are worth.
7. **Interest orders Select Trade; it does not gate it.** Every binder copy is
   eligible. Letting a partner's willingness decide what a collector may *offer*
   is backwards.
8. **The collector's reference value never reaches a partner.**
9. **Agreed terms are preserved downstream.** Once a price, a card value or a
   trade percentage is agreed, no later stage may silently change it. The Deal
   stage's final negotiation moves *cash only*.
10. **Successful completion satisfies the Goal.** No separate mutation.
11. **Unsuccessful termination unlocks the Goal**, and the failed opportunity is
    kept as history, with its agreed terms intact. Never delete it.

---

## 6. Derived state — calculate, do not persist

Storing any of these creates a second source of truth that will drift.

| Derived | From |
|---|---|
| **Goal state** — Seeking / Negotiating / Satisfied | the goal's opportunities |
| **Turn ownership** | opportunity stage + last thread entry |
| **Matching supply** | identity match, goals × inventory |
| **Network demand** | identity match, inventory × goals, owner excluded |
| **Network supply** | binder copies across the network |
| **Trade value** | `agreedMarket × agreedPercent`, both required |
| **Cash balance** | `agreedPrice − totalTradeValue` |
| **"New since review"** | `addedAt` vs the partner's review timestamp |

**Goal state deserves emphasis.** Because it derives, ending a negotiation
returns a goal to Seeking with *no mutation at all*, and completion satisfies it
the same way. A stored `goal.status` would need resetting in both cases, and
would eventually disagree with the opportunities.

**Directionality matters.** A positive balance means the collector pays the
partner; negative means the partner pays the collector. Keep one sign convention
and let each persona word it.

---

## 7. Canonical actions

One path per business operation. Persona permission wraps these; it does not
reimplement them.

```
addGoal · updateGoalTier · removeGoal
addInventoryCopy · updateInventoryCopy · removeInventoryCopy
addBinderCopy · updateBinderCopy · removeBinderCopy
setInterest
reachOut · sendMessage
startOpportunity · proposePrice · acceptPrice
proposeTradeSelection · reviewTradeCard
proposeMarketValue · acceptMarketValue
proposeTradePercent · acceptTradePercent
proposeFinalBalance · acceptDeal
proposeFulfillment · confirmHandoff
completeOpportunity · endOpportunity
```

`removeGoal` refuses while a negotiation is live. `startOpportunity` refuses a
second negotiation on the same goal. `addBinderCopy` refuses a copy without both
photos. These refusals belong to the action.

---

## 8. The governing rule

> **One mutation → one canonical state change → two perspectives → no synchronisation.**

If an action requires updating a second record so another persona can see it, the
model is wrong. There is one Goal, one InventoryCopy, one BinderCopy, one
interest relationship, one Conversation and one Opportunity — each rendered
differently depending on who is looking.

---

## 9. Prototype vs. production

### Should survive

Everything above: the entities and their identity rules, the relationships, the
visibility table, the lifecycle and its transition conditions, the eleven
invariants, the derived-state list, and the governing rule.

Also the **vocabulary**. Primary Goal, Secondary Goal, Trade Binder, Agree on
Price, Select Trade, Value Trade, Deal, Fulfillment, Market Value, Trade %, Trade
Value, Final negotiation. These words are load-bearing — they were chosen so the
two personas can discuss one transaction without translation.

### Should not be copied forward

- **In-memory store and plain-object graph.** Sufficient for a prototype; not a
  data model.
- **Seed fixtures and fixed dates.** Demo scaffolding.
- **Id formats** (`p-self`, `cc0`, `k1`). Arbitrary.
- **Single-file components and inline CSS.** Prototype packaging.
- **Photo placeholders.** The invariant is real; `"binder:t1:front"` is not.
- **Demo simulation controls** that act as the other party.
- **The specific projection functions.** The *boundary* must exist; its shape is
  yours to choose.

### Deliberately unspecified

Database, API shape, framework, authentication, authorisation mechanism,
transport, and hosting. The contract says what must remain true, not how to
build it.

One caution worth carrying forward: the privacy rules and the invariants are the
parts most likely to be lost in a rewrite, because they are invisible when
working correctly. They are the parts most worth testing first.
