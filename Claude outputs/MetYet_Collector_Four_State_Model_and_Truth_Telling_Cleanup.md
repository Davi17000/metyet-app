# MetYet — The Four-State Model, and the Truth-Telling Cleanup

Implementation hand-back. Phase 5, the batch that made a Collector's four
statements about a card sayable, mutually honest, and the thing a Binder is
coherent about.

---

## 1. Executive summary

The reconciliation audit found that MetYet stored four independent truths —
Binder membership, a Goal and its tier, a CollectorCopy, and `offered` — and had
no name for the one the product talks about most: **PC**, "I own this and I am
keeping it". The only fact that looked like it was `offered === false`, which
means *no offer has been stated* and nothing more. So the product's own screens
were reporting an absence as a decision.

This batch does three things and nothing else:

1. **PC becomes a positive fact.** `keeping` on a physical copy, with its own
   command, never inferred from `offered === false`, and mutually exclusive with
   `offered` **per copy** — which is what lets one Collector keep one Mudkip and
   offer another.
2. **A Binder is given something to be coherent about.** A card the Collector
   has said nothing about cannot be filed. *Binder expresses coherence. State
   expresses the Collector's relationship to the card. No state → no Binder
   membership.*
3. **The truth-telling cleanup.** Six places where a screen or a document said
   something that was no longer true.

**No migration. No new concept. No generic state field. Nothing transactional
moved.** The exposed surface grew by exactly one command.

---

## 2. The six CLOSED decisions

These were resolved before this batch and are **recorded, not reopened**. This
document does not recommend revisiting any of them, and nothing in the
implementation leaves a door for them.

| # | Closed decision | How the code honours it |
|---|---|---|
| 1 | **No Select / Noticed persistence.** *MetYet does not persist curiosity. It persists collecting decisions.* | Nothing was added. `[41]` asserts no `noticed`, `bookmark`, `favourite`, `watchlist`, `shortlist` or `wishlist` concept exists anywhere in the domain |
| 2 | **No unspecified Goals** — `criteria-required` is intentional | Unchanged. `[1]`, `[2]` pin that both tiers require a specification and that a Goal cannot have its last criterion taken away |
| 3 | **No generic `intent`** | `[40]` forbids the field shape in the domain, and checks that the one surviving occurrence of the word is the Phase 1 **deal-stage grouping**, which is a grouping of stages and not a fact about a card |
| 4 | **No generic `cardState`** | `[40]`. The four states are read, never stored: `collectorStatesFor` derives them from Goals and copies |
| 5 | **No Binder types** | No binder gained a kind, a rule, or a smart membership. `[29]` of the cross-views suite still holds |
| 6 | **No "Not this one" / rejection persistence** | Nothing was added, and nothing here creates a place to put one |

And the seventh, which this batch had to implement rather than merely respect:

> **PC must be positive if implemented, and never inferred from
> `offered === false`.**

Implemented positively as `keeping`, and `[4]` walks an offer all the way in and
back out again to prove that withdrawing it never produces a keep.

---

## 3. SHAs and branch

| | |
|---|---|
| **Branch** | `phase-5-four-state` |
| **Starting SHA** | `64f88e1` (merge PR #78) — determined, not assumed |
| **Ending SHA** | the single commit on this branch — a hand-back cannot name the commit that contains it, so it is stated with the bundle and verifiable by `git log 64f88e1..` |
| **Worktree** | `/home/claude/s1` |

PR #78 confirmed in ancestry, as are #77 (`f464c5f`) and #76 (`67c1cf0`).

---

## 4. The four states, and why they live at two levels

```
Primary Goal     I am actively hunting this card, in this grade      CANONICAL CARD
Secondary Goal   I want it, in this grade, less urgently             CANONICAL CARD
Trade/Sell       I own this copy and would part with it              PHYSICAL COPY
PC               I own this copy and intend to keep it               PHYSICAL COPY
```

**The levels are the point, and the two-copy case is why.** Somebody who owns
two copies of one card may truthfully keep one and offer the other. Flattening
the four onto the card would make that unsayable. So:

- Primary and Secondary are **mutually exclusive per card** — they are one
  Goal's `tier`, which was already true.
- Trade/Sell and PC are **mutually exclusive per copy**, and only per copy.
- A Goal for a card you already own is **not** a contradiction. It is somebody
  hunting a better copy, and `[15]` pins it.

**Nothing joins them.** There is no `cardState`, no `intent`, no field that
holds "which of the four". `collectorStatesFor(cardId, goals, copies)` returns a
list, derived on demand, because a Collector can be in more than one of them at
once and any single-valued answer would be a lie about the commonest case.

---

## 5. PC: the exact semantics

```
keeping === true    →  "I am keeping this copy"     a decision
keeping absent      →  "nothing has been said"      the state of every copy
                                                     written before this batch
keeping === false   →  never stored
```

**Absence is the honest answer, and it is load-bearing.** Every copy in every
existing world carries no `keeping` key, because PC has only just become
sayable. If MetYet wrote `keeping: false` on copies nobody has spoken about, "I
have not decided" and "I decided not to" would be the same row — which is
precisely the confusion migration 0012 exists to remember, and which once cost a
Collector their visible supply. So:

- `addCollectorCopy` writes the key **only when it is true**;
- both setters route through one writer, `withDisposition`, which **removes**
  the key rather than writing `false`;
- `validateWorld` type-checks `keeping` **only when the key is present**, so a
  pre-PC world is valid exactly as written.

`[31]` walks every path — offer, withdraw, keep, un-keep, and a keep cleared by
an offer — and asserts the key is absent at the end of each.

**The two doors, and why there are two.** Willingness to part with a card is not
a correctable typo and neither is the decision to keep one, so neither travels
inside a patch:

| Command | Effect |
|---|---|
| `setCollectorCopyOffered(copyId, true)` | offers; **clears any keep**, leaving no residue |
| `setCollectorCopyOffered(copyId, false)` | withdraws the offer; **does not** set `keeping` |
| `setCollectorCopyKept(copyId, true)` | keeps; **clears any offer** |
| `setCollectorCopyKept(copyId, false)` | withdraws the keep; **does not** restore an earlier offer |
| `updateCollectorCopy` | refuses `identity-immutable` for either field |
| `addCollectorCopy` | refuses `disposition-conflict` if both are asserted at birth |

**The asymmetry is deliberate.** Keeping a copy that was on offer withdraws the
offer, because the person just said the opposite thing. Un-keeping it returns
the copy to *unstated* rather than back to *offered*, because MetYet has no
grounds to re-publish supply nobody re-offered. That is a real behaviour and it
is stated here rather than buried: one existing suite needed an explicit re-offer
after a keep round-trip, and the comment there names the asymmetry as the point.

**Mutual exclusion is unreachable rather than merely refused** — `[5]` attacks
it in all four directions (born-with-both, keep-then-offer, offer-then-keep, and
through a patch) and every one is either refused or cleared. `[7]` proves
`validateWorld` still *reports* a both-true row, for a world no command can
produce.

---

## 6. The Binder invariant

> **Binder expresses coherence. State expresses the Collector's relationship to
> the card. No state → no Binder membership.**

Filing used to be unconditional, and C3.1 asserted that on purpose. What it
produced most often was a binder full of cards that appeared nowhere else in the
product and did nothing.

**What counts as a state, exactly:**

| Situation | May be filed? |
|---|---|
| Primary Goal on the card | yes |
| Secondary Goal on the card | yes |
| Owns a copy, offered | yes |
| Owns a copy, kept | yes |
| **Owns a copy, nothing said about it** | **yes** |
| Nothing at all | **no** — `card-has-no-state` |
| Another Collector's Goal or copy | **no** |

**Owning counts whatever the disposition**, and that is not a softening.
"I own this and have not decided whether I would part with it" is a real
relationship and it is the one every copy in every existing world is in.
Requiring a disposition before filing would make the commonest card in the
product unfilable and would push people into declaring an intention they have
not formed.

**Enforced at the command boundary, never in `validateWorld`.** This is the
single most important implementation decision in the batch. Worlds written
before this rule hold filed cards with no state; they were legal when written
and they are not corrupt. Adding the rule to `validateWorld` would make them
**unstorable**, which surfaces as a `PersistenceError(invalidNextWorld)` — a 500
on the next command anybody sends, not a refusal. **This repository has made that
exact mistake three times.** `[24]` loads such a world, asserts it is valid and
storable, asserts nothing fabricates a Goal or a copy to rescue it, and asserts
structurally that neither `cardHasNoState` nor `cardMeansSomething` appears in
`metyet-world.js`. `[25]` proves unfiling still works on one.

**No bypass.** `binderEntries` is written in exactly one place — `addBinderEntry`
— and filtered in one — `removeBinderEntry`. The only other writer is the seed
at world load, which is not a command. There is no import, bulk or demo path that
files a card.

---

## 7. The command plan reorder — the load-bearing client fix

The card specification panel sends a **plan**: a list of small commands derived
from the difference between what is stored and what the person answered. The old
order put filing second, on the reasoning that organisation is the most
reversible thing on the panel.

That reasoning stopped being true the moment the domain learned the invariant.
An adversarial read of the plan found that **the commonest flow in the whole
product** — find a card in Browse, tick a binder, say you want it, Save — would
have been refused at its second step, because the Goal that makes the filing
legal had not been written yet.

The order is now:

```
1  make-binder          a container that names no card, so it cannot fail for want of a state
2  wanted-copy          criteria before tier: a Goal gets more precise before it gets more urgent
3  how-hard
4  start-looking
5  correct-copy         ownership
6  offering / keeping   one command or the other, never both
7  record-copy
8  file                 MEMBERSHIP FOLLOWS STATE
9  unfile               after filing, so a binder swap never passes through belonging nowhere
10 stop-looking         removals last of all
11 forget-copy
```

`[26]`, `[27]` and `[28]` pin the three claims, and reverting the order makes
`[26]` and `[27]` fail — verified by experiment, not asserted.

---

## 8. What the Collector actually sees

**On a copy (the card specification panel).** One question with three answers,
where there used to be a checkbox:

```
( ) I'd trade or sell this one
( ) I'm keeping this one
(•) Haven't decided
```

Choosing sends one command or none; a swap is one step, not two, because the
domain clears the other side. `[29]` pins that no change sends nothing, and that
returning to "Haven't decided" withdraws whichever statement was actually made.

**On Your Cards.** A copy now reads **Offered**, or **Keeping**, or carries no
disposition tag at all. It used to read "Offered" or "Not offered" — which
displayed a copy somebody had deliberately marked PC in exactly the same words
as one they had never mentioned. Silence is not a decision and is no longer
drawn as one.

**When a binder cannot take a card.** The panel says so **before** it sends:

> A binder holds cards you're looking for or copies you own. Say you want this
> card, or record a copy, and it can go in a binder.

and the same sentence is the refusal message if the domain answers first.

**There is still no PC *view*.** A sixth tab is finally *possible* now that PC is
a fact, and it is deliberately not added: nobody asked for one, and how somebody
wants to browse what they own is a different question from whether they can say
it. The cross-views test was re-pinned to assert exactly that distinction.

---

## 9. Command exposure

**22 → 23.** Added: `setCollectorCopyKept`, and nothing else.

Justified before exposing: collector seat required; ownership required
(`not-owner` for anybody else's copy); non-boolean refused; idempotent; cannot
create a copy; cannot write `keeping: false`; and it is the **only** other writer
of a disposition besides `setCollectorCopyOffered`. `[3]`, `[5]`, `[6]`, `[31]`.

`[39]` asserts the count is 23, that `setCollectorCopyKept` is on the list, and
that eleven transaction and closed-decision commands — `startOpportunity`,
`proposePrice`, `acceptPrice`, `acceptMarketValue`, `proposeMarketValue`,
`acceptDeal`, `setCopyPending`, `proposeTradeSelection`, `confirmHandoff`,
`setInterest`, `sendMessage` — remain unreachable. Each name is checked against
the command table first, so the list cannot quietly assert nothing.

Domain commands: **50 → 51**.

---

## 10. Durable-state proof

**No migration. Migrations still 13 (`0013_binders.sql`).
`git diff --cached 64f88e1 -- persistence/` is empty.**

`keeping` needs no migration because a collector copy's flexible facts live in
an `attrs` jsonb column — `offered` has lived there since C2 — and the world
repository has no field allow-list. **And there is no backfill, because there is
nothing to backfill:** nobody has ever said "keep", so every existing copy is
honestly unstated and absence is exactly right.

`[40]` asserts the migration list is unchanged and that no generic state field
appears in the domain. `[41]` asserts no curiosity concept exists.

---

## 11. Privacy

**`keeping` never crosses to a Trusted Partner, and the protection is doubled on
purpose.**

1. A kept copy is never offered, so the row does not reach a partner at all.
2. `keeping` is not on `COLLECTOR_COPY_FOR_PARTNER`, the allow-list every
   partner-bound copy row is filtered through.

`[12]`, `[13]` and `[14]` prove all three halves of the load-bearing case: with
Copy A kept and Copy B offered, a partner sees **only B**; the string `keeping`
and Copy A's certificate appear nowhere in the partner's whole projection; and an
unrelated shop sees neither. `[18]` proves another Collector's state does not
qualify your card. Binder privacy is unchanged — partners receive `[]`.

---

## 12. Boundaries this batch did not cross

| Boundary | Pin |
|---|---|
| Binder membership creates no True Match and no demand | `[35]` |
| PC creates no True Match and no demand | `[36]` |
| Trade/Sell creates no Collector demand | `[36]` |
| An exact Goal still matches exactly — stated criteria are string equality, no bands, no "or better" | `[37]` |
| Qualification (Inspect, Request photos) remains transaction-free and does not change availability | `[38]` |
| No transaction command newly exposed | `[39]` |
| The four Collector tabs are unchanged | `[42]` |

Nothing in this batch touches Market Value, price, reservation, Pending,
fulfilment, handoff, or any shared record.

---

## 13. The truth-telling cleanup

Six places where the product said something that was no longer true.

| | Where | What was wrong | What it says now |
|---|---|---|---|
| **A** | `Goals.jsx` | *"Wanted since"* read `goal.since`, and a *"Confirmed"* Fact showed a promotion date whose command is not exposed — so it meant "last promoted", to nobody | Reads `createdAt` with the legacy fallback; the Fact is gone |
| **B** | `Collection.jsx` | An *"Interested · &lt;shop&gt;"* block rendered `interests`, whose only writer, `setInterest`, is **not exposed** — so it could only ever be empty | Block and both indexes removed; `setInterest` stays unexposed |
| **C** | `domain/README.md` | The True Match paragraph stated the rule **backwards** | The correct rule, plus the `criteria-required` and closed-vocabulary consequences that follow from it |
| **D** | `acceptPrice` header | A stale pre-Option-B comment | Corrected |
| **E** | `server/exposed-commands.js` | A hand-written count in the header, guaranteed to rot | Gone; the count is asserted in a test instead |
| **F** | Three strings | *"not offering any of your cards"*, *"Cards offered"*, *"A card cannot be both graded and in a raw condition"* — all about **physical copies**, not cards | *copies*, *"Copies offered"*, *"A copy cannot be…"* |

---

## 14. Tests

**New suite `tests/phase5-four-state-and-binder-invariant.cjs` — 42 tests**,
registered in `tests/all.cjs`.

| Section | Covers |
|---|---|
| **A** `[1]`–`[8]` | What a Collector can say: specification required, both dispositions need a copy, `offered === false` is never PC, mutual exclusion unreachable in four directions, neither field travels in a patch, a both-true world is reported, a pre-PC world is valid |
| **B** `[9]`–`[15]` | One card, two copies, two truths: kept and offered at once, changing or removing one does not rewrite the other, the partner sees only the offered one, the kept one does not leak because its sibling is offered, the allow-list, and wanting a card you own |
| **C** `[16]`–`[25]` | The invariant: refusal with no state, all five qualifying situations, no cross-Collector qualification, several binders, removing one of several states, Primary ↔ Secondary, disposition changes, the legacy world, and unfiling |
| **D** `[26]`–`[29]` | The panel's ordering, and the three-answer disposition |
| **D2** `[30]`–`[34]` | **Every adversarial finding** (§15) |
| **E** `[35]`–`[42]` | What must not have moved |

**Mutation-verified, not assumed.** Each load-bearing test was proved to bite by
reverting the code it guards and watching it fail:

| Reverted | Fails |
|---|---|
| the `addBinderEntry` guard | `[16]`, `[18]`, `[20]` |
| offering clears keeping | `[5]` |
| the plan reorder | `[26]`, `[27]` |
| `keeping` in the client binding | `[30]` |
| the absent-key writer | `[4]`, `[31]` |
| the refusal message and local check | `[32]`, `[33]` |
| the three-way tag | `[34]` |

**Existing suites re-pinned: 19.** Five were **directly contradicted** and were
rewritten to assert the new rule while preserving what each was really
protecting, never worked around:

| Suite | Claimed | Now asserts |
|---|---|---|
| `c31` | "a binder may hold a card the Collector neither wants nor owns" | the refusal, and that a binder still holds cards in *any* of the qualifying states |
| `c33` | "a card can be filed with no goal and no copy" | filing follows state, with the plan order proved |
| `c34b` | "a card with neither Goal nor copy stays filed" | a legacy membership survives; a new one is refused |
| `c34a` | "Offered" and "Not offered" prove offering is per copy | **"Offered" and "Keeping"** prove a *disposition* is per copy, and "Not offered" must not reappear |
| `binders-cross-views` | the "Not offered" label is the honest one | it has become the dishonest one now PC is sayable; there is still no PC **view** |

---

## 15. Adversarial findings and fixes

A subagent reviewed the finished, green batch. Everything below was reproduced
before it was fixed, and every fix is pinned by a test that was proved to fail
without it. **Two of these are my errors, and the first is the batch's headline
going missing.**

### 1. The new fact was dropped one line before the command

`addOwnedCopy` in `client/commands.js` rebuilds its payload from a fixed field
list, and `keeping` was not on it. So "I'm keeping this one" on a **new** copy
survived the plan, survived the binding switch, and was discarded at the
boundary. The copy stored silently as unstated, the panel reopened saying
"Haven't decided", and the only way to record PC was to save the copy, reopen it
and say it a second time.

This is the same shape as the batch-6 defect where the headline fix was invisible
because the screen rendered from a source it never read: **a correct domain, a
correct plan, and nothing arriving.** Fixed, and `[30]` drives the real binding
and then stores the payload it produced.

### 2. Your Cards displayed PC as "Not offered"

The row read `copy.offered === true ? "Offered" : "Not offered"`, and `keeping`
appeared nowhere in the client outside the panel. A copy deliberately marked PC
was drawn in exactly the same words as one nobody had ever mentioned — **the
precise conflation this batch exists to end**, surviving inside the batch that
ends it. Worse, the comment directly above it still asserted *"it is not a
Personal Collection either, which nobody has said"*, which had just become false.
Three states were visible out of four. Fixed: **Offered / Keeping / nothing**,
with the comments rewritten. `[34]`.

### 3. `setCollectorCopyOffered` stored `keeping: false`

Offering a copy wrote a durable `keeping: false` on a copy that had never said
anything — contradicting the batch's own rule, its own comment, and the migration
it cites as the reason for the rule. Nothing read it differently today (every
predicate tests `=== true`), so the harm was contract rather than behaviour, but
it is exactly the failure mode named at the top of this document. **My test
missed it because `[4]` asserted the *predicate* (`copyDisposition === "unstated"`)
rather than the *shape* (`!("keeping" in copy)`)** — the same class of mistake as
batch 7's junk-shapes test, which only ever ran against an empty copy.

Both setters now route through one writer that removes the key, and `[31]`
asserts absence on every path.

### 4. The one rule the batch added was the one the panel could not explain

No `card-has-no-state` entry in the refusal map and no name for the new `keeping`
step, so a person who ticked a binder for a stateless card got
*"Nothing was saved: the card could not be filed — MetYet would not accept it."*
Fixed with a sentence that names what would make it legal. `[32]`.

### 5. "Add cards to this binder" fired into a refusal

That flow lands in Browse — the screen explicitly built for *finding a card you
have said nothing about* — with a binder pre-ticked, and the Save button stayed
enabled. Fixed with a pre-send check on the panel, so the sentence appears before
anything is sent rather than after. `[33]`. The **binder swap** case is covered
by the same check; the deferred half of it is in §17.

### 6. Two dead assertions I introduced while re-pinning `c33`

One guarded the batch's load-bearing property — "state before filing" — inside an
`if (kinds.includes("file"))` that could never be true in that test, and the
other compared an index against `make-binder`, which is always zero. Both
rewritten to assert unconditionally, with a second binder added so the plan
actually contains a filing.

### 7. A dead import

`groupBy` in `Collection.jsx`, orphaned by the `interests` removal, together with
the header paragraph documenting a surface that no longer exists. Both gone.

### Verified correct by the reviewer and left alone

No route produces a both-true copy. No bypass of the binder invariant — every
writer of `binderEntries` was enumerated. No privacy leak: `keeping` reaches no
partner projection, no deal record, and no cross-Collector qualification exists.
**No existing world is made invalid** — `validateWorld` requires nothing new, and
`attrs` is jsonb with no allow-list. The keep-then-unkeep asymmetry is a
deliberate change of mind, not data loss. And no disposition control renders for
a copy the viewer does not own.

---

## 16. Architecture check

- **Existing behaviour**: a Collector says what a card means to them, and MetYet
  stores exactly that and nothing more.
- **Collector job**: "What is this card to me — am I hunting it, or do I have it,
  and am I keeping it?"
- **TP job**: unchanged. A shop sees offered supply from Collectors it works
  with, and now provably nothing else.
- **UX**: one question with three answers on a copy; a truthful tag on Your
  Cards; a sentence when a binder cannot take a card.
- **Durable owners**: a Goal's `tier` owns Primary/Secondary; a CollectorCopy's
  `offered` and `keeping` own Trade/Sell and PC; `binderEntries` owns membership.
  Nothing owns "the state", because there is no such thing.
- **New fact vs derived interaction**: **one new durable fact** (`keeping`, on a
  copy), and two refusal codes, which are not facts. The four states themselves
  are **derived** — `collectorStatesFor` computes them from the facts on demand.
- **Why below React**: mutual exclusion, the binder invariant and the refusal to
  infer PC all live in the domain and are all reachable over HTTP. The panel's
  pre-send check is a courtesy, not the rule — removing it changes the message,
  not the outcome.
- **Pre-pilot proof**: a Collector with two copies of one card keeps one, offers
  the other, files the card in two binders, and a shop sees exactly one copy.

---

## 17. Two things deliberately NOT decided

Both are product decisions the principles do not settle, and the brief's stop
conditions say to stop rather than guess. **Nothing in the code assumes an
answer to either.**

### A. What happens when the last state is removed while memberships remain

Today: `addBinderEntry` is guarded and **removal is untouched**, so a Collector
who drops their last Goal on a filed card leaves a membership the invariant would
not now allow. The world stays valid and storable; the card simply sits in a
binder with nothing behind it, exactly as every pre-batch membership does.

The three options, with the argument for and against each:

| Option | For | Against |
|---|---|---|
| **1. Auto-remove** the memberships when the last state goes | The invariant becomes true of the whole world, not just of new writes | MetYet silently destroys curation the person built, in response to an unrelated act. Destructive, and unasked-for |
| **2. Refuse** the removal while memberships exist | Nothing is destroyed and the rule is total | A Collector cannot stop wanting a card without first finding every binder it is in. The product blocks an honest statement to protect a filing rule |
| **3. Allow it** (today's behaviour) — the invariant governs what can be *added* | Nothing is destroyed, nothing is blocked, and it is the only option that treats a pre-batch membership and a newly-orphaned one the same way | The invariant is true of writes rather than of the world; a binder can hold a card with no state, just not gain one |

**Option 3 is what ships**, because it is the only one that neither destroys nor
blocks, and because it is what the existing worlds already require. It is not
presented as the answer to the question — the question is which of the three
MetYet *wants*, and that has not been asked.

### B. The binder swap on a legacy stateless entry

A card filed before this rule, with no Goal and no copy, cannot be **moved**
between binders: the plan files before it unfiles (so a swap never passes through
belonging nowhere), and the file is refused. The panel now explains why and names
the two things that would fix it, which is the honest outcome — but it is a
legacy membership that can be removed and not relocated.

The three ways out are the same three above, plus a fourth that was **not**
taken: letting `addBinderEntry` accept a stateless card **if it is already filed
somewhere**. That would make membership self-justifying, which is the opposite of
what the invariant says, so it is recorded here rather than done quietly.

---

## 18. Changed files

| File | Change |
|---|---|
| `domain/metyet-domain.js` | two refusal codes; `copyKept`, `copyOffered`, `copyDisposition`, `collectorStatesFor`, `cardMeansSomething` |
| `domain/metyet-commands.js` | `withDisposition`; `setCollectorCopyKept` (new); `setCollectorCopyOffered` clears a keep without residue; `addCollectorCopy` accepts and validates `keeping`; `updateCollectorCopy` refuses it; `addBinderEntry` holds the invariant; `acceptPrice` header |
| `domain/metyet-world.js` | `keeping` optional and boolean; the both-true contradiction reported |
| `domain/metyet-projection.js` | the partner allow-list documented — `keeping` deliberately absent |
| `domain/README.md` | the True Match rule, corrected |
| `server/exposed-commands.js` | 22 → 23; the hand-written count removed |
| `client/commands.js` | `setCopyKept`; `addOwnedCopy` carries `keeping` |
| `client/sign-in/SignIn.jsx` | the `keeping` step bound |
| `client/collector/CardSpecification.jsx` | the plan reorder; three-value disposition; the refusal message; the pre-send check |
| `client/collector/sections/Collection.jsx` | Offered / Keeping / nothing; the `interests` block, indexes, dead import and stale comments removed |
| `client/collector/sections/Goals.jsx` | "Wanted since" from `createdAt`; the "Confirmed" fact removed |
| `client/collector/CollectorShell.jsx`, `client/tp/sections/CollectorNetwork.jsx` | copy corrections |
| `tests/phase5-four-state-and-binder-invariant.cjs` | **new**, 42 tests |
| `tests/all.cjs` + 18 existing suites | registered; re-pinned, each with its reason in place |

**33 files, +1,599 / −190.** `persistence/` untouched.

---

## 19. Deferred work

Per the brief: no Market Value, price, transaction entry or any transactional
step; no generic abstraction over the four states; no clean sweep of legacy
state (`interests` rows, conversations, activity, `binderReviewedAt`,
`confirmGoal`, `preferences`, opportunity machinery all remain); no PC **view**;
no Binder types; no rejection persistence; no Select/Noticed; no fuzzy or range
matching; no recommendations; no TP facelift; no notifications or task centre.

---

## 20. Risks and debt

- **§17 A is unanswered**, and until it is, a binder can hold a card with no
  state — it just cannot gain one. Every pre-batch membership is in this
  position already.
- **A legacy `cardId`-only Goal or copy does not qualify a card for filing.**
  `collectorStatesFor` matches on `canonicalCardId` only, and migration 0011
  deliberately keeps the legacy column for the demo's copies. Binder entries are
  canonical-keyed, so this is unreachable in production data, but a demo world
  that routes a canonical id to a legacy-keyed group would be refused on its face
  — "I own this and you say I've said nothing". Recorded rather than fixed,
  because fixing it means deciding whether a legacy id is an identity, which is a
  closed question in the other direction.
- **The keep-then-unkeep asymmetry** loses an earlier offer. Defensible — the
  offer was withdrawn by the keep, which the person asked for — but it will
  surprise somebody, and one existing suite needed an explicit re-offer because
  of it.
- **The panel's pre-send check duplicates the domain's rule in a second place.**
  It is a message, not an authority (removing it changes only the wording a
  person sees), but it is a second statement of when filing is legal and it can
  drift. The domain remains the only thing that decides.
- **`keeping` is unbounded by a migration.** It lives in `attrs` jsonb with no
  column and no constraint, so nothing at the database level prevents a future
  writer from putting something else there. `validateWorld` is the guard.
- **`disposition-conflict` is now reachable** where before it was not, because
  `keeping` travels through `addCollectorCopy`. The panel cannot produce it (the
  disposition is one of three), but the door is open and the refusal exists for
  that reason.

---

## 21. Completion gate

```
$ node tests/all.cjs
ALL SUITES PASSED          140 suites · 4,808 tests · 0 failures

$ npm run prod     → PRODUCTION BUILD OK — bytes: 344,879
$ npm run smoke    → PROD SMOKE OK — rendered 83,686 chars
$ npm run build:app -- --allow-unconfigured → main.js 319,166 bytes
```

Baseline reproduced before editing:

| | Before | After |
|---|---|---|
| Suites | 139 | **140** |
| Tests | 4,766 | **4,808** |
| Failures | 0 | **0** |
| Allow-list | 22 | **23** |
| Domain commands | 50 | **51** |
| Migrations | 13 (`0013_binders.sql`) | **13, unchanged** |
| Production build | 343,529 | 344,879 |
| Production smoke | 83,686 chars | 83,686 chars |

Confirmed: exposed commands 22 → 23, one addition, no removals; domain commands
50 → 51; migrations 13, unchanged, `persistence/` diff empty; True Match
unchanged; the four Collector tabs unchanged; qualification still
transaction-free; world valid and storable, including a legacy stateless world;
and the new suite's registration verified by the structural guard.

---

## 22. What this batch proved about the model

The audit asked whether MetYet's stored truths matched the four states the
product talks about. They did, for three of them. The fourth was being read out
of an absence — and the two defects found by the adversarial pass (§15.2, §15.3)
show how strong that habit is: **within the batch built to end it, the product
was still displaying an absence as a decision, and still writing one down.**

The model that ships is deliberately not a model. Four facts, at two levels, none
of them joined, and the "state" computed on demand from whatever the person has
actually said. A Collector who has said nothing has no state, and MetYet now has
somewhere honest to put that: nowhere.

---

## 23. Recommendation for the next smallest batch

> **Answer §17 A: decide what happens to a Binder membership when the last state
> behind it is removed.**

It is the only question this batch deliberately left open, it is small, it
touches one command, and every alternative is already written down with its
argument. It also has to be answered before any batch that treats binders as
something a person can rely on, because until then "a binder holds cards you have
a relationship with" is true of new filings and not of the binder.

The second candidate, if that is judged too small to be a batch on its own, is
**the PC view** — a sixth tab on Your Cards, now that PC is a fact. It is a
derived view over an existing durable fact, adds no concept, and would be the
first screen that treats keeping as a way to browse rather than a label.

Explicitly **not** recommended next: anything transactional (Market Value,
Pending, price), any generic abstraction over the four states, and any reopening
of the six closed decisions in §2.
