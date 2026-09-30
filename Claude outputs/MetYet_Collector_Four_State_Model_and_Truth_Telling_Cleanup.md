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
2. **A Binder is given something to be coherent about.** *Binder expresses
   coherence. State expresses the Collector's relationship to the card. No state
   → no Binder membership.* A card in none of the four states cannot be filed,
   and a card that loses its last one does not stay filed.
3. **The truth-telling cleanup.** Six places where a screen or a document said
   something that was no longer true.

**Two product decisions arrived after the first implementation and changed it**
(§6). Owning a copy with no disposition is valid but is **not** one of the four,
so it does not open a binder. And when an act removes a card's last state, its
Binder memberships are removed with it — the act itself always lands. Legacy
stateless memberships stay tolerated: not migrated, not swept, never fabricated
into a state.

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

**Owning a copy with no disposition is valid, and is not one of the four.** A
copy nobody has said anything about is a real, honest record — it is what every
copy in every existing world is — and nothing removes it, hides it, or invents a
disposition for it. It simply is not a statement about what the card *means* to
its owner, which is what these four are. One word on the copy changes that.

That line was drawn by the product, not derived from the code. The first
implementation let bare ownership qualify, on the argument that acquiring a card
is itself a collecting decision. The answer is that the four are the vocabulary,
and the domain comment says so explicitly so that the next reader does not
re-argue it from first principles.

**Nothing joins them.** There is no `cardState`, no `intent`, no field that
holds "which of the four". `collectorStatesFor(cardId, goals, copies)` returns a
list — `primary`, `secondary`, `trade-sell`, `pc` — derived on demand, because a
Collector can be in more than one at once and any single-valued answer would be a
lie about the commonest case.

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

## 6. The Binder invariant, and the cascade

> **Binder expresses coherence. State expresses the Collector's relationship to
> the card. No state → no Binder membership.**

Filing used to be unconditional, and C3.1 asserted that on purpose. What it
produced most often was a binder full of cards that appeared nowhere else in the
product and did nothing.

**What qualifies a card, exactly:**

| Situation | May be filed? |
|---|---|
| Primary Goal on the card | yes |
| Secondary Goal on the card | yes |
| Owns a copy marked Trade/Sell | yes |
| Owns a copy marked PC | yes |
| **Owns a copy, nothing said about it** | **no** — valid record, not one of the four |
| Nothing at all | **no** — `card-has-no-state` |
| Another Collector's Goal or copy | **no** |

### The cascade

**When an act removes a card's last qualifying state, that card's Binder
memberships are removed with it.** One predicate, `cardHasState`, answers both
"may it get in" and "does it stay in", so the two rules cannot drift apart.

**The act itself is never blocked or altered.** Stopping wanting a card, selling
a copy, withdrawing an offer and withdrawing a keep are all honest statements,
and refusing one to protect a filing would hold a person to a position they have
abandoned. The statement lands; the organisation follows.

**This destroys curation, and that is the decision rather than an oversight.**
A person who drops their last Goal on a card loses that card's place in every
binder it was in, and MetYet cannot give it back. Because it is destructive and
irreversible, **both** surfaces that can cause it now say so before it happens —
the specification panel and the Goals screen (§8).

**What the cascade does not touch.** One Collector, one canonical card, and only
when that card is now in none of the four. It runs in exactly four commands —
`removeGoal`, `removeCollectorCopy`, `setCollectorCopyOffered`,
`setCollectorCopyKept` — which are the complete set of single-command reducers of
a card's states; every writer of `goals` and `collectorCopies` was enumerated to
establish that, and nothing can change a Goal's or a copy's `canonicalCardId`.
Swaps between the four (Secondary → Primary, Trade/Sell → PC) change nothing.
A no-op returns the same state object.

**Legacy stateless memberships stay tolerated.** Nothing sweeps them, nothing
migrates them, and nothing fabricates a state for them — the prune is about one
card, so a legacy membership on another card is out of its reach entirely
(`[21d]`). If the Collector gives *that* card a state and later withdraws it,
they have said something and taken it back, and the membership follows the rule
like any other (`[21e]`). "Tolerated" means not swept for having been written
before the rule, not immune forever.

**Archived binders are not reached into** (`[21f]`). `setBinderArchived` has said
since C3.4 that putting a binder away touches nothing inside it — *"an archived
binder still holds its cards, or unarchiving would be a different binder"* — and
a prune that emptied one would destroy curation permanently, on a screen the
person cannot see. Unarchiving can therefore bring back a stateless membership,
which lands in the category the product already tolerates. **This edge was not
part of the decision**; §17 states the alternative.

### Enforced at the command boundary, never in `validateWorld`

This is the single most important implementation decision in the batch. Worlds
written before this rule hold filed cards with no state; they were legal when
written and they are not corrupt. Adding the rule to `validateWorld` would make
them **unstorable**, which surfaces as a `PersistenceError(invalidNextWorld)` — a
500 on the next command anybody sends, not a refusal. **This repository has made
that exact mistake three times.** `[24]` loads such a world, asserts it is valid
and storable, asserts nothing fabricates a Goal or a copy to rescue it, and
asserts structurally that neither `cardHasNoState` nor `cardHasState` appears in
`metyet-world.js`. `[25]` proves unfiling still works on one.

**No bypass.** `binderEntries` is written in exactly one place —
`addBinderEntry` — filtered in one — `removeBinderEntry` — and pruned in one.
The only other writer is the seed at world load, which is not a command.

## 7. The command plan order — the load-bearing client work

The card specification panel sends a **plan**: a list of small commands derived
from the difference between what is stored and what the person answered. Each
step is its own command, so the cascade runs between them — which makes the
order load-bearing twice over.

```
1  make-binder          a container that names no card, so it cannot fail for want of a state
2  wanted-copy          criteria before tier: a Goal gets more precise before it gets more urgent
3  how-hard
4  start-looking
5  correct-copy         ownership
6  offering / keeping   SAYING one — never both, the domain clears the other side
7  record-copy
8  file                 MEMBERSHIP FOLLOWS STATE
9  unfile               after filing, so a binder swap never passes through belonging nowhere
10 offering / keeping   TAKING one back — a removal, and it waits
11 stop-looking
12 forget-copy
```

**Why state precedes filing.** The old order put filing second, on the reasoning
that organisation is the most reversible thing on the panel. That reasoning
stopped being true the moment the domain learned the invariant: **the commonest
flow in the whole product** — find a card in Browse, tick a binder, say you want
it, Save — would have been refused at its second step.

**Why withdrawals wait, which is the sharper one.** A disposition withdrawal is
a *removal*, and it used to sit in the ownership block at step 6. An adversarial
read found what that cost: somebody who set their only offered copy back to
"haven't decided" **and** recorded a second copy they are keeping sent
`offering(false)` first. For the length of one command the card was in none of
the four; the domain pruned the memberships exactly as it should; the next step
put the card back into a state. **The save ended legal, the panel never warned,
and the binder had silently lost the card** — with no way for the panel to
re-file it. Every step that takes a state away now happens after every step that
adds one and after the filing, so a card never passes through statelessness on
its way somewhere else.

`[26]`, `[27]`, `[28]` and `[28b]` pin the four claims, and `[28b]` proves its
one by **running** the plan against the real domain rather than by reading the
order.

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

**When a binder cannot take a card.** The panel says so **before** it sends, and
the same sentence is the refusal message if the domain answers first:

> A binder holds cards you're looking for, or copies you're trading or keeping.
> Say you want this card, or say what you'd do with a copy, and it can go in a
> binder.

**Before curation is destroyed.** Both surfaces that can cause the cascade name
it first, in plain words, beside the control that does it:

- the panel, when the save would leave nothing said about the card —
  *"Saving this leaves nothing said about the card, so it comes out of all 3
  binders it's in."*
- the **Goals** screen, beside *No longer looking* — *"This is the only thing
  you've said about this card, so it comes out of the binder it's in."*

Neither blocks the statement and neither offers to keep the filing; they read the
same four states the domain reads and say what the click will do. The Goals
screen mattered most: it is one button, with no panel and no confirmation, and
an adversarial read found it doing the damage in silence.

**There is still no PC *view*.** A sixth tab is finally *possible* now that PC is
a fact, and it is deliberately not added: nobody asked for one, and how somebody
wants to browse what they own is a different question from whether they can say
it. The cross-views test was re-pinned to assert exactly that distinction.

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

**New suite `tests/phase5-four-state-and-binder-invariant.cjs` — 50 tests**,
registered in `tests/all.cjs`.

| Section | Covers |
|---|---|
| **A** `[1]`–`[8]` | What a Collector can say: specification required, both dispositions need a copy, `offered === false` is never PC, mutual exclusion unreachable in four directions, neither field travels in a patch, a both-true world is reported, a pre-PC world is valid |
| **B** `[9]`–`[15]` | One card, two copies, two truths: kept and offered at once, changing or removing one does not rewrite the other, the partner sees only the offered one, the kept one does not leak because its sibling is offered, the allow-list, and wanting a card you own |
| **C** `[16]`–`[25]` | The invariant and the cascade: refusal with no state, the four qualifying situations and the one that does not, no cross-Collector qualification, several binders, removing one of several states, removing the **last** by four different routes, the prune's scope, legacy memberships on another card and on the same one, archived binders, Primary ↔ Secondary, swaps, the legacy world, and unfiling |
| **D** `[26]`–`[29]` | The panel's ordering, including the whole plan **run against the real domain** (`[28b]`), and the three-answer disposition |
| **D2** `[30]`–`[34]` | **Every adversarial finding** (§15), including both destruction warnings |
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
| the panel's destruction warning | `[33b]` |
| the three-way tag | `[34]` |
| the cascade | `[21b]`, `[21c]`, `[21d]` |
| withdrawals running last | `[28b]` |

**Existing suites re-pinned: 19.** Thirteen tests across nine suites were
**directly contradicted** and were rewritten to assert the new rule while
preserving what each was really protecting, never worked around. The five from
the first pass:

| Suite | Claimed | Now asserts |
|---|---|---|
| `c31` | "a binder may hold a card the Collector neither wants nor owns" | the refusal, and that a binder still holds cards in *any* of the qualifying states |
| `c33` | "a card can be filed with no goal and no copy" | filing follows state, with the plan order proved |
| `c34b` | "a card with neither Goal nor copy stays filed" | a legacy membership survives; a new one is refused |
| `c34a` | "Offered" and "Not offered" prove offering is per copy | **"Offered" and "Keeping"** prove a *disposition* is per copy, and "Not offered" must not reappear |
| `binders-cross-views` | the "Not offered" label is the honest one | it has become the dishonest one now PC is sayable; there is still no PC **view** |

And the eight the two product decisions contradicted, every one of them an
assertion that membership is independent of state:

| Suite / test | Claimed | Now asserts |
|---|---|---|
| `c31` **C** | dropping the Goal leaves membership alone | it does, **while the copy is kept** — and `C2` pins that dropping the last of the four does not |
| `c31` **E** | the last owned copy leaving does not un-file the card | membership names the **card**, proved with a Goal behind it — and `E2` pins the last-state case |
| `c31` **F** | owning three copies is one card meaning something | one **word** about one of the three is what opens the binder |
| `c32` **Goal G** | removing the Goal leaves membership alone | *editing* a Goal — criteria, tier — never disturbs organisation, with a kept copy carrying the card |
| `c33` | selling the last copy leaves the membership | what a membership **names**, with a Goal behind it; the last-state case is `[21b]` |
| `c34b` ×3 | a card whose Goal has gone stays filed; Save files a bare-owned card; removing a Goal never un-files | the card is **kept**; Save needs one of the four; both halves — a Goal dropped beside a kept copy leaves the filing, and dropping the last one does not |

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

### A second pass, over the two product decisions

The narrowing and the cascade were reviewed adversarially in turn, and the first
finding is the worst defect in either batch.

#### 8. A save could destroy a binder on its way to a legal end state

The cascade runs per command, and the panel's plan is a sequence of commands.
Withdrawing a disposition sat in the ownership block, so this plan —

```
offering(false)   copy A back to "haven't decided"
record-copy       a second copy, marked "I'm keeping this one"
```

— left the card in **none of the four for the length of one command**. The
domain pruned the memberships exactly as it is meant to. The next step put the
card back into a state. So the save ended legal, `willHaveState` was true, the
panel's warning correctly stayed silent, and **the binder had lost the card with
no way for the panel to re-file it.** Reproduced end to end; three variants, one
of which destroys an old membership while creating a new one in the same press.

This is my error and it is the same shape as the batch-7 defect: a guard I had
just added, doing damage through a door I had just opened. **And my own suite
missed it for the same reason as batch 7 — it tested the domain one command at a
time, never the sequence the panel actually sends.** Fixed by moving every
state-removing step after every state-adding step and after the filing (§7), and
pinned by `[28b]`, which runs the plan against the real domain rather than
reading the order.

#### 9. The Goals screen destroyed curation in total silence

*No longer looking* is one button, on the main Goals screen, with no panel and
no confirmation — and it can take a card out of every binder it is in. The
warning shipped in the first pass existed on the specification panel only. Fixed:
the Goals screen now reads the same four states and says what the click will do,
and `[33c]` pins that it appears when the loss is real, stays silent when the
card is kept, and treats bare ownership as not holding the filing up.

#### 10. Archived binders were being emptied invisibly

The prune reached every binder, including archived ones — contradicting
`setBinderArchived`'s own stated invariant, and destroying curation on a screen
the person cannot see. Fixed: the prune skips archived binders (§6), and the
panel's warning counts only binders the person can see. `[21f]`.

#### 11. `[21d]` over-claimed, and five comments had become false

The test was titled *"a legacy stateless membership is left alone, not swept"*,
but the code only guarantees that for a membership on **another** card; on the
same card, a state given and withdrawn is pruned like any other, which is
correct. Retitled to what it proves, with `[21e]` added for the other case. The
false comments — `removeCollectorCopy`'s *"selling a card must not un-file it"*,
`addBinderEntry`'s *"they are independent"*, the plan's *"a product decision that
has not been made"*, the new suite's own header still arguing that bare ownership
must qualify, and a c31 comment left directly above its own re-pin — are all
corrected.

Two smaller ones were confirmed and left: the panel's warning can promise a loss
that will not happen if `removeGoal` is about to be refused `goal-locked` (the
panel deliberately never predicts deal state), and the demo/prototype shell has
remove controls with no warning (it is not production).

### Verified correct by the reviewer and left alone

No route produces a both-true copy. No bypass of the binder invariant — every
writer of `binderEntries` was enumerated. No privacy leak: `keeping` reaches no
partner projection, no deal record, and no cross-Collector qualification exists.
**No existing world is made invalid** — `validateWorld` requires nothing new, and
`attrs` is jsonb with no allow-list. The keep-then-unkeep asymmetry is a
deliberate change of mind, not data loss. And no disposition control renders for
a copy the viewer does not own.

From the second pass: the cascade's four commands are the **complete** set of
single-command reducers (every writer of `goals` and `collectorCopies` was
enumerated; nothing can change a `canonicalCardId`); it never over-reaches to
another Collector, another card, or a card that still has a state, including the
two-copy case; it cannot make a world unstorable or throw on a missing
collection; every no-op returns the same object; and the client has no second
source for binder contents, so a pruned membership disappears on the next paint.

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

## 17. The decisions, and the one edge they did not cover

The first implementation left two questions open and wrote out the alternatives.
Both have been answered by the product, and the answers are what §6 implements.

### A. What happens when the last state is removed — **ANSWERED**

> **Automatically remove that card's Binder memberships, while preserving the
> Goal/copy action itself.**

Of the three options written out, this is option 1 — the one the first
implementation argued against, on the grounds that MetYet would silently destroy
curation the person built in response to an unrelated act. The product's answer
is that the act is not unrelated: a binder holds cards that mean something, so a
card that means nothing is not in one. What the earlier argument did earn is the
warnings in §8 — the destruction is not negotiable, but it is no longer silent on
either surface that can cause it.

Option 2 (refuse the removal) is explicitly not what shipped: an honest statement
is never blocked to protect a filing.

### B. Which states qualify — **ANSWERED**

> **Only Primary Goal, Secondary Goal, Trade/Sell and PC. Ownership without
> disposition is valid, and is not one of them.**

The first implementation let bare ownership qualify. The narrowing costs
something real and it is worth naming: **every copy in every existing world has
no disposition**, so a card whose only relationship is an undeclared copy is not
filable until its owner says one word about it. That is the intended trade —
the four are the vocabulary, and a binder rests on the vocabulary.

### C. Archived binders — **NOT COVERED, AND READ CONSERVATIVELY**

The decision says to remove "that card's Binder memberships". An archived binder
is a binder, so the literal reading would empty it too. The implementation does
**not**, for one reason: `setBinderArchived` has said since C3.4 that putting a
binder away touches nothing inside it, and emptying one would destroy curation
permanently on a screen the person cannot currently see. The conservative reading
destroys nothing.

The consequence, stated plainly: **unarchiving a binder can bring back a
membership on a card that is now in none of the four.** That is exactly the
legacy-tolerated category — a membership the rules permit to exist but would not
create — so it needs no new machinery. If the product wants the literal reading
instead, it is one filter in `pruneOrphanedMemberships` and one test (`[21f]`),
and it should be decided rather than drifted into.

### D. The binder swap on a legacy stateless entry — **UNCHANGED**

A card filed before this rule, with no Goal and no copy, still cannot be **moved**
between binders: the plan files before it unfiles (so a swap never passes through
belonging nowhere), and the file is refused. The panel explains why and names
what would make it legal. The fourth way out — letting `addBinderEntry` accept a
stateless card *if it is already filed somewhere* — is still **not** taken,
because it would make membership self-justifying, which is the opposite of the
rule.

## 18. Changed files

| File | Change |
|---|---|
| `domain/metyet-domain.js` | two refusal codes; `copyKept`, `copyOffered`, `copyDisposition`, `collectorStatesFor` (the four, narrowed), `cardHasState` |
| `domain/metyet-commands.js` | `withDisposition`; `pruneOrphanedMemberships`; `setCollectorCopyKept` (new); `setCollectorCopyOffered` clears a keep without residue; `addCollectorCopy` accepts and validates `keeping`; `updateCollectorCopy` refuses it; `addBinderEntry` holds the invariant; the cascade in four commands; `acceptPrice` header |
| `domain/metyet-world.js` | `keeping` optional and boolean; the both-true contradiction reported |
| `domain/metyet-projection.js` | the partner allow-list documented — `keeping` deliberately absent |
| `domain/README.md` | the True Match rule, corrected |
| `server/exposed-commands.js` | 22 → 23; the hand-written count removed |
| `client/commands.js` | `setCopyKept`; `addOwnedCopy` carries `keeping` |
| `client/sign-in/SignIn.jsx` | the `keeping` step bound |
| `client/collector/CardSpecification.jsx` | the plan order — state before filing, **withdrawals last**; three-value disposition; the refusal message; the pre-send check; the destruction warning |
| `client/collector/sections/Collection.jsx` | Offered / Keeping / nothing; the `interests` block, indexes, dead import and stale comments removed |
| `client/collector/sections/Goals.jsx` | "Wanted since" from `createdAt`; the "Confirmed" fact removed; the destruction warning beside *No longer looking* |
| `client/collector/CollectorShell.jsx`, `client/tp/sections/CollectorNetwork.jsx` | copy corrections |
| `tests/phase5-four-state-and-binder-invariant.cjs` | **new**, 42 tests |
| `tests/all.cjs` + 18 existing suites | registered; re-pinned, each with its reason in place |

**34 code files, +2,257 / −217**, across the first implementation and the two
product decisions that followed it. `persistence/` untouched.

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

- **The cascade is irreversible, and that is by design.** MetYet cannot restore a
  membership it pruned. Both production surfaces warn first; the demo and
  prototype shells have remove controls that do not, because they are not
  production. If a person ever asks "where did my binder go", the answer is in
  this section rather than in the product.
- **Every existing copy has no disposition**, so the narrowing means a card whose
  only relationship is an undeclared copy is not filable until its owner says one
  word about it. Nothing migrates, nothing is fabricated, and the panel explains
  the refusal — but the first pilot Collector with a shoebox full of undeclared
  copies will meet this.
- **Unarchiving a binder can bring back a stateless membership** (§17 C). The
  category is already tolerated, so nothing breaks; it is a known consequence of
  the conservative reading, not an accident.
- **The panel's warning can promise a loss that will not happen.** If
  `removeGoal` is about to be refused `goal-locked`, nothing is saved and nothing
  is pruned, but the sentence was already on screen. The panel deliberately never
  predicts deal state, so fixing this means teaching it to — which is a second
  implementation of a rule.
- **A legacy `cardId`-only Goal or copy does not qualify a card for filing.**
  `collectorStatesFor` matches on `canonicalCardId` only, and migration 0011
  deliberately keeps the legacy column for the demo's copies. Binder entries are
  canonical-keyed, so this is unreachable in production data, but a demo world
  that routes a canonical id to a legacy-keyed group would be refused on its
  face. Recorded rather than fixed, because fixing it means deciding whether a
  legacy id is an identity, which is a closed question in the other direction.
- **The keep-then-unkeep asymmetry** loses an earlier offer. Defensible — the
  offer was withdrawn by the keep, which the person asked for — but it will
  surprise somebody, and one existing suite needed an explicit re-offer because
  of it.
- **Three places now compute "does this card mean something".** The domain
  (authoritative), the panel's pre-send check, and the Goals screen's warning.
  The latter two are messages, not authorities — removing either changes only
  what a person reads — but they are second and third statements of the same
  rule and they can drift. The domain remains the only thing that decides.
- **`keeping` is unbounded by a migration.** It lives in `attrs` jsonb with no
  column and no constraint. `validateWorld` is the guard.
- **`disposition-conflict` is now reachable** where before it was not, because
  `keeping` travels through `addCollectorCopy`. The panel cannot produce it, but
  the door is open and the refusal exists for that reason.

## 21. Completion gate

```
$ node tests/all.cjs
ALL SUITES PASSED          140 suites · 4,818 tests · 0 failures

$ npm run prod     → PRODUCTION BUILD OK — bytes: 345,458
$ npm run smoke    → PROD SMOKE OK — rendered 83,686 chars
$ npm run build:app -- --allow-unconfigured → main.js 320,550 bytes
```

Baseline reproduced before editing:

| | Before | After |
|---|---|---|
| Suites | 139 | **140** |
| Tests | 4,766 | **4,818** |
| Failures | 0 | **0** |
| Allow-list | 22 | **23** |
| Domain commands | 50 | **51** |
| Migrations | 13 (`0013_binders.sql`) | **13, unchanged** |
| Production build | 343,529 | 345,458 |
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

> **Decide §17 C: whether the cascade should reach into archived binders.**

It is the only question this batch answered by reading rather than by being told,
it is one filter and one test either way, and leaving it undecided means the
product has a rule with an unstated edge. It is genuinely small, so it belongs
folded into whatever comes next rather than being a batch on its own.

The candidate for that next batch is **the PC view** — a sixth tab on Your Cards,
now that PC is a fact. It is a derived view over an existing durable fact, adds
no concept, and would be the first screen that treats keeping as a way to browse
rather than a label. It is also the natural place to find out whether people
actually declare dispositions, which the narrowing now depends on.

The alternative, if pilot feedback is wanted first: **nothing**. Two product
rules landed here that change what a binder is, one of them destructive, and the
cheapest way to learn whether they are right is to put them in front of a
Collector before building on top of them.

Explicitly **not** recommended next: anything transactional (Market Value,
Pending, price), any generic abstraction over the four states, and any reopening
of the six closed decisions in §2.
