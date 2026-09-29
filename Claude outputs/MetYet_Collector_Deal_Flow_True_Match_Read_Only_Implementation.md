# MetYet — Make the Match True, Then Show It

**Implementation batch.** Branch `phase-5-option-b-copy-availability`.

---

## 1. Executive summary

**Starting SHA: `e2acf156310a095b6969c89c9f190d4019cc0d34`**, worktree clean,
baseline **135 suites / 4,565 tests / 0 failures**.

**Ending SHA: see the commit accompanying this document.**

Three things, and they are one thing: the product stopped answering questions
nobody asked.

1. **A Goal's stated criteria decide which copies match.** A criterion the
   Collector stated must be satisfied exactly; one they did not state restricts
   nothing. Asked by one predicate, from both Discovery and `startOpportunity`.
2. **A negotiation that can never conclude stops holding its Goal.** Derived,
   with no new field, no sweep and no faked ending.
3. **A read-only, Goal-grouped Deal Flow surface** showing the specific
   qualifying physical copies — the first Collector screen that answers rather
   than records.

**Files changed: 28 (+514 / −107).** Four domain files, one client file changed
and one added, one new test suite, and 21 suites re-pinned or fixture-aligned.
**No migration. No new durable fact. No server change. The production allow-list
is byte-identical at 18 commands.**

### Gates

```
targeted   phase5-true-match-deal-flow              46 passed, 0 failed
Option B   phase5-option-b-copy-availability        49 passed, 0 failed
cleanup    phase5-post-option-b-integrity-privacy   32 passed, 0 failed
full       136 suites, 4,612 tests, 0 failures      (baseline 135 / 4,565)
build      PRODUCTION BUILD OK — 342,197 bytes
app        main.js — 305,564 bytes
smoke      PROD SMOKE OK — 83,686 chars
exposure   git diff -- server/ persistence/  →  empty
```

### No stop condition fired, and one was specifically checked

Stop condition 3 asked whether existing domain semantics already define grade or
condition as ranges or thresholds. **They do not.** `GRADED_VALUES` and
`CONDITION_VALUES` are read with `includes` at every site in the repository and
never by index; there is no `>=`, no "or better", no band. The vocabularies look
ordered and are a closed set of names. Exact match was therefore the correct
reading, and §3 pins that in both directions.

### The adversarial pass found two ways to produce an unstorable world

Both were mine, both would have been production 500s, and both are §11. The
short version: releasing a Goal's lock touched two things I had not followed it
into — deleting a Goal leaves an active Opportunity naming nothing, and the
release was not monotonic, so a rival cancelling after final agreement could
resurrect a superseded deal into a second live negotiation. It found two real UI
defects as well, one of which broke the very line this screen exists to show.

---

## 2. The product decision

> **A criterion the Collector stated is a constraint. A criterion they did not
> state is not a guess.**

| | |
|---|---|
| grade stated | the copy's grade must equal it, exactly |
| condition stated | the copy's condition must equal it, exactly |
| either unstated | that dimension restricts nothing |
| neither stated | no criteria restriction at all |

**No inferred preferences and no threshold semantics.** A Collector wanting
PSA 9 is *not* assumed to accept PSA 10. Nobody asked them, and somebody
completing a set at a grade would say no. There is no floor, no ceiling, no
range, no ranked preference and no "close match". If the pilot shows people want
"or better", that is a preference *language* and it gets designed.

**Print, language and edition are not criteria and did not become any.** They
are identity, folded into `canonicalCardId` — wanting the 1st Edition and
wanting the Unlimited are two different cards and therefore two different Goals.
That architecture is unchanged.

**One consequence falls out of the existing grading rule rather than this one.**
A Goal stating only a condition will not match a coherent PSA copy, because
`gradingProblem` forbids a graded copy from carrying a condition at all. A
pre-C3.2 row that carries both *does* match, deliberately: those rows cannot be
repaired, and reading past the condition somebody actually recorded would be the
product guessing. Such a copy renders with its conflict note.

---

## 3. The criteria predicate

`D.meetsGoalCriteria(desired, copy)` — `domain/metyet-domain.js`.

```js
const meetsGoalCriteria = (desired, copy) => {
  const wantGrade = stated(desired && desired.grade);
  const wantCondition = stated(desired && desired.condition);
  if (wantGrade && stated(copy && copy.grade) !== wantGrade) return false;
  if (wantCondition && stated(copy && copy.condition) !== wantCondition) return false;
  return true;
};
```

`stated` is the existing helper: it trims and returns `""` for anything that is
not a string, so `null`, `undefined`, `""`, `"   "` and a missing key are one
thing — unstated — on both sides.

**Callers, and only these two:**

| Caller | Site |
|---|---|
| `discoveriesIn` | `domain/metyet-discovery.js`, per (goal, copy) inside the join |
| `startOpportunity` | `domain/metyet-commands.js`, after identity and relationship, before availability |

It is asked per (goal, copy) rather than per goal, because one partner may hold
three copies of a card and only one be the right one.

**Identity checks stayed separate.** The join is still an equality on
`canonicalCardId`; criteria are a second, narrower question asked afterwards.
Grade and condition did not become part of canonical identity anywhere, and
`discoveryKey` is still `goalId::partnerId`.

**No band, pinned in three places:** the domain has no `indexOf` on either
vocabulary and no comparison operator on a grade; the existing `BAND` guard in
`phase5-b7` now also covers the discovery module; and `[15]` asserts directly
that PSA 10 does not answer a PSA 9 want, in both directions.

---

## 4. Old → new Discovery

| Goal states | Copy is | Before | After |
|---|---|---|---|
| `PSA 9` | `PSA 9` | overlap | **overlap** |
| `PSA 9` | `PSA 8` | overlap | **none** |
| `PSA 9` | `PSA 10` | overlap | **none** — there is no floor |
| `Raw / Near Mint` | `PSA 8` | overlap | **none** |
| `Raw / Near Mint` | `Raw / Lightly Played` | overlap | **none** |
| `Raw` (grade only) | `Raw / Damaged` | overlap | **overlap** — condition unrestricted |
| `Near Mint` (condition only) | `Raw / Near Mint` | overlap | **overlap** — grade unrestricted |
| `Near Mint` (condition only) | `PSA 9` (coherent) | overlap | **none** — a graded copy has no condition |
| nothing stated | anything | overlap | **overlap** — unchanged |
| any | a different canonical card | none | **none** — unchanged |

A shop holding four copies of one card, of which two match, is **one** answer
carrying **two** copies — the (goal, partner) grouping is unchanged.

**The two tests that pinned the old rule were re-pinned, not deleted**, along
with two more found during the work:

| Suite | Was | Now |
|---|---|---|
| `phase5-c32` Goal F | a Raw/NM Goal discovers a PSA 8 | it does not — **and** supply that matches is added, so the test proves exclusion rather than proving nothing ever matches |
| `phase5-c35` | "criteria change nothing about which cards overlap" | criteria decide, and correcting them changes the answer |
| `phase5-c33` | "criteria are context, not a filter" | criteria are a filter, and Discovery reads them |
| `phase5-c5` | "criteria still do not filter the answer" | they do — plus a new test that correcting a copy *out* of the criteria drops it, and the reverse |
| `phase5-b7` | discovery source contains no `grade|condition|desired` | it asks `meetsGoalCriteria`, has no vocabulary of its own, and still trips no `BAND` |

Each re-pin states the reversal and its reason in the test.

---

## 5. `startOpportunity` consistency

**One predicate, two callers, so they cannot drift.** `[13]` drives a pair
Discovery offers and asserts the command accepts it. `[14]` drives a pair
Discovery does not offer and asserts the command refuses it — reaching the
command directly, past any surface.

Refusal is **`criteria-mismatch`**, a new code beside `identity-mismatch`. It is
distinct on purpose: the same card in a grade you did not ask for is a different
answer from the wrong card, and only the first is worth telling somebody about.
It discloses nothing private — both halves are the Collector's own criteria and
the copy's own publicly projected facts — and the refusal object is exactly
`{ok, refused}` with no payload.

**Gate order is unchanged and matters.** Criteria are asked *after* identity and
relationship, so a stranger never reaches the answer — the ordering the
integrity/privacy batch established. Every prior gate still stands in front:
seat, Goal ownership, Primary, one-negotiation-per-Goal, canonical identity,
accepted relationship, inventory existence, archived, and Option B availability.

---

## 6. The dead-Opportunity lock

### What was wrong

Two Collectors legitimately pursue one copy; one reaches Final Agreement. The
other's Opportunity stays `agree-price`, `declined: false` — alive, unmarked,
and unable to proceed, because every economic command refuses. It held the Goal
for ever, and nothing had told the Collector it had lost.

### The rule now

```js
const transactionallyLost = (o, opps) => {
  const invId = o && o.invId;
  if (invId == null) return false;
  if (soldInventoryIds(opps || []).has(invId)) return true;
  return (opps || []).some((other) => other && other.invId === invId
    && other.id !== o.id && finalAgreementGiven(other));
};
```

Both inputs come from the opportunities alone, so this needs no inventory, no
new field, no lifecycle state and no sweep. Applied at `activeOppForGoal`, which
is the single chokepoint for `goalState`, `goalLocked` and
`oneNegotiationPerGoal` — and, critically, at `validateWorld`'s
`invariant.one-negotiation-per-goal` holder, so the world the commands produce
stays storable.

**Keyed on EVER promised, not currently promised.** `copyCommittedTo` asks
whether a commitment stands *now*, because its question is "may somebody else
pursue this?". Asking it here made the release non-monotonic — see §11.2.
Final agreement is never un-given, so losing is permanent, which is what losing
is.

### Proofs

| | |
|---|---|
| `[16][17]` | a **normal** live negotiation on an available copy still locks: cannot pursue elsewhere, cannot demote, cannot delete. **The rule did not loosen.** |
| `[18]` | a copy committed elsewhere releases it; the Collector may demote |
| `[19]` | a sold copy releases it; the Collector may pursue elsewhere |
| `[19b]` | but **deleting** the Goal still waits for the dead deal to be closed (§11.1) |
| `[19c]` | losing is permanent: the rival cancelling does not resurrect it (§11.2) |
| `[19d]` | three rounds of commit → replace → cancel never accumulate live deals |
| `[22]` | the released Goal can be used elsewhere, and the world is storable |
| "the winner is not released" | the deal holding the commitment still holds its Goal |
| `[20][21]` | the losing record is **byte-identical** afterwards — same stage, `declined` still false, no ending, still active. Only the lock released. |
| `[23]` | cancellation still works and is still the honest way out |
| "no new durable state" | no `lost`/`stranded`/`superseded`/`releasedAt` field is written or assigned anywhere |

**Releasing the lock is not releasing the reference.** A Collector may demote
the Goal and pursue the card elsewhere; they may not *delete* it while an active
Opportunity names it, because `validateWorld` requires that name to resolve.
Cancelling the dead deal is one command away and is the honest record anyway.

---

## 7. The Deal Flow surface

`client/collector/sections/DealFlow.jsx`, registered in `CollectorShell.jsx`.

**Grouping.** By Goal — the card is the heading, the shops are the answer. A
shop appears as many times as it has an answer. Deliberately the opposite shape
from a listing feed: no For You, no New, no Ending Soon, no Nearby, nothing
sorted by price, nothing scored. Goals with answers render before those without;
that is the only ordering, and it is not a ranking.

**Fields**, all from `INVENTORY_FOR_COLLECTOR`: shop name, grade, condition (via
the derived `grading` the server already attaches), cert, a photographs note,
and the asking price. Card name and artwork come from the existing
`GET /api/canonical-cards`, asked once for the ids on screen.

**Navigation — five tabs, and why.** The approved target is Browse · Binders ·
Trusted Partners · Deal Flow, with Your Cards folded into Binders as one of its
cross-Binder views. Those views do not exist and building them is the Binder
redesign, which is out of scope. Deleting Your Cards now would remove the only
way to see what you own in order to make a diagram true early. So it stays, Deal
Flow arrives beside it, and **the fifth tab is the temporary shape**. `[24]`
pins that all four prior sections survived.

**It counts nothing on the tab.** Every counted tab numbers a collection of the
person's own things. `discoveries` is keyed by (goal, partner), so its length is
a number of overlaps rather than copies and would disagree with the copies the
screen itself counts. The panel says "2 copies that match", which is the number
a person wants in a unit they can read. This also keeps the shell's existing
rule — a tab number is a row count, never something the shell reasoned its way
to — which is a rule the codebase already had and I did not want to argue with.

**Empty states — four silences, four sentences:**

| Situation | What it says |
|---|---|
| no Trusted Partners | "A shop invites you, and once you accept…" |
| Goals but no partners' answer | "You haven't said what you're looking for yet…" |
| asked, nobody has it | "None of your shops has this one right now." |
| **they have it, in another form** | "No copies match what you asked for — though 2 copies of this card are available at your shops in a different grade or condition." |

The last is the one worth having: without it the screen looks broken to somebody
who can see the card in a shop's window. It names **no shop**, because a copy
this Goal did not match is not theirs to be told about in any more detail. It is
computed per Goal from rows already present — no new projection, no second
matching rule.

**Privacy.** `[29]` asserts no rival opportunity id, rival collector, rival
stage or `pendingFor` can reach the screen, and that a copy held by somebody
else's deal never enters the Collector's projection at all. The file never
touches `state.opportunities`.

---

## 8. Production exposure

**Unchanged, and provable:**

```
$ git diff e2acf15 -- server/ persistence/
(empty)
```

`EXPOSED_COMMANDS.length === 18`, pinned by `[33]` along with an explicit check
that `reviewCopy`, `endReview`, `requestPhotos`, `startOpportunity`,
`proposePrice`, `acceptPrice`, `cancelOpportunity`, `setCopyPending`,
`acceptDeal`, `proposeTradeSelection` and `confirmHandoff` are all still closed.
The domain still holds exactly 50 commands.

`[30]` asserts Deal Flow renders **no button and no form**, names none of the
eight closed commands, and reaches for no command channel. It is handed one prop
— `onBrowseCards` — and nothing else. There is no greyed-out Inspect control,
deliberately: a control that cannot work is a promise the product has not kept.

---

## 9. Tests

**New suite:** `tests/phase5-true-match-deal-flow.cjs` — **46 tests**, sections
A (criteria), B (Discovery), C (the command boundary), D (the goal lock),
E (the surface), F (what must not have moved). All 40 required pins are
discharged and numbered; the six extra are the adversarial regressions.

**Registered, and the guard verified by experiment.** The registration was
removed and the Option B suite's structural guard run: it failed naming the
exact file (`written but never run — phase5-true-match-deal-flow.cjs`).
Restored.

**21 suites re-pinned or fixture-aligned.** Two kinds, kept distinct:

- **Re-pinned** (the rule reversed): `phase5-b7`, `phase5-c32`, `phase5-c33`,
  `phase5-c35`, `phase5-c5`, `phase5-option-b`, `phase1-command-layer` (the fuzz
  invariant), `shared-state` (the source pin on the lock predicate),
  `phase4-collector-read-experiences` (the shop-window rule, narrowed — `ask`
  and `invId` are now checked everywhere *except* Deal Flow, while `cost` and
  `acquired` remain checked everywhere including it),
  `phase4-collector-production-shell` (Deal Flow joins the product-owned labels).
- **Fixture-aligned** (the test was about something else and its supply simply
  did not state the grade its Goal asked for): `phase5-b8`, `phase5-c1`,
  `phase5-c2`, `phase5-c21`, `phase5-c31`, `phase5-c4`, `phase5-b81`,
  `phase5-c34a`, `phase5-c34b`, `phase5-post-option-b`. Where a helper defaults
  a grade it does so **only when the copy states neither grade nor condition**,
  so a copy that was deliberately Raw or deliberately contradictory is never
  overridden into an incoherent pair.

---

## 10. Build and smoke

```
PRODUCTION BUILD OK — 342,197 bytes
PROD SMOKE OK — 83,686 chars; binder strings shipped, old CTA wording absent
app.build.mjs  main.js — 305,564 bytes  (Deal Flow present in the bundle)
```

---

## 11. The adversarial pass

Run against the finished batch with the full suite already green. **Four real
defects, two of them critical.** All fixed, all regression-tested.

### 11.1 CRITICAL — deleting a released Goal produced an unstorable world

`removeGoal` used `goalLocked`, which I had just released. The delete then
succeeded and left an **active Opportunity naming a Goal that no longer
exists** — which `validateWorld` refuses as `ref.unknown`, and which
`command-transaction.js` raises rather than refusing. **A 500, not a refusal.**

```
i1 status = sold
validateWorld BEFORE removeGoal: true
removeGoal -> OK
validateWorld AFTER  removeGoal: false   ["ref.unknown"]
```

This is precisely the Option B failure — a predicate moved in the domain and
left behind in the validator — reintroduced one predicate over, in the batch
whose own comment cites that lesson. **And my own test `[19]` asserted the
success without validating the world.**

**Fix:** releasing the *negotiation* lock is not releasing the *reference*.
`removeGoal` now asks `goalNamedByActive`, a separate predicate: any active
Opportunity naming the Goal blocks deletion, whether or not it can still
proceed. Demotion and pursuing elsewhere stay released. Cancelling the dead deal
is the way through, and the brief already required cancellation to remain valid.
Pinned by `[19b]`, which validates the world on both sides of the delete.

### 11.2 CRITICAL — the release was not monotonic, and the damage was unbounded

`copyCommittedTo` requires the committing opportunity to be **active**. So a
rival who cancelled *after* final agreement un-lost the loser — and a Collector
who had legitimately opened a replacement in the meantime then held **two
genuinely live negotiations** on one Goal:

```
1. A opens on i1                    goalState(gA) = negotiating
2. rival commits i1                 goalState(gA) = seeking      (release works)
3. A opens a replacement on i9      validateWorld.ok = true
4. rival CANCELS                    i1 back to available
5. live negotiations on gA: 2
6. validateWorld.ok = FALSE   invariant.one-negotiation-per-goal
```

Worse, the world is then unstorable, so **every** subsequent command in it fails
at the transaction boundary — including the cancellation that would clear it.
Repeating the cycle reaches three, four, any number.

**Fix:** key on **ever promised** rather than currently promised. Final
agreement is never un-given — cancelling writes an ending and rewrites no term —
so `finalAgreementGiven` stays true on a cancelled deal for ever. Losing is now
permanent, which is what losing is; the copy returning to the shelf is a fresh
opportunity for anybody who wants it, not a reason to resurrect a superseded
conversation. Pinned by `[19c]` and `[19d]`.

### 11.3 HIGH — the screen told every Collector they had asked for nothing

`gradeLine(goal.desired)` reads the derived `grading` object the server attaches
to *copies*. A Goal's `desired` is a bare `{grade, condition}` and never carries
one, so the line was unconditionally `null` and fell through to its default:

> Charizard · Base Set · #4 · Actively hunting · 1 copy · **You asked for any
> grade or condition** · Northline PSA 9 …

On the one screen built to prove that criteria now matter, the line stating the
criteria was wrong for **every** Goal. **Fix:** a new `criteriaLine` in the
collector's `present.js`, reading `desired.grade`/`desired.condition` directly.
Pinned by a regression covering grade-only, both, and genuinely-unstated.

### 11.4 MEDIUM-HIGH — two Goals for one card cancelled each other's silence

The near-miss count was built from **every** discovery, then used as the
exclusion for **each** Goal. So a Goal wanting PSA 9 and a Goal wanting PSA 10 of
the same card: the copy satisfying the first counted as "matched" for the second,
which then said *"None of your shops has this one right now"* — to the one
person who can see it in the window, which is exactly the reader that silence
exists for. **Fix:** the exclusion is per Goal. Pinned by a regression.

### Also corrected

Three comments the pass found stale and load-bearing: `updateGoalCriteria`'s
stated justification ("nothing derives from `desired`" — now false, and the
command is still deliberately unblocked, for a narrower reason now written down);
`GOAL_FOR_PARTNER`'s "Discovery reads none of it"; and my own claim that a
condition-only Goal cannot match a PSA copy, which holds for coherent rows and
not for pre-C3.2 contradictory ones (deliberately, now documented).

### Checked and found clean

Whitespace and case handling on both sides; `null`/`undefined`/`""`/missing keys;
non-object `desired`; prototype-inherited fields; legacy Goals with no criteria
(genuinely unchanged); grade and condition not entering canonical identity;
Discovery and `startOpportunity` never disagreeing for the same pair; a normal
live negotiation still locking under every variation tried (pending copy,
archived copy, self-commitment, null `invId`, legacy opportunities); the winner
never released; eleven degenerate render inputs producing no crash, no
`undefined`, no `NaN`, no `[object Object]`; the allow-list byte-identical; and
the test diff reviewed for weakened assertions — the fixture alignments are
guarded so a deliberately Raw or deliberately contradictory copy is never
overridden.

---

## 12. Remaining known behaviour

- **Inspect and Request Photos are unexposed**, and so is the participant-aware
  visibility work that belongs with them (a copy pending for another deal
  vanishes from a pre-existing reviewer's projection, and a fulfilled photo
  request can arrive into that hole). Deliberately untouched here.
- **Agree Market Value, Pending and the rest of the lifecycle are unexposed.**
  No deal or qualification command was opened.
- **The "Agree Market Value" naming collision is unresolved** —
  `proposeMarketValue`/`acceptMarketValue` are the per-trade-card valuation step
  and have nothing to do with the product term, which maps to `acceptPrice`.
- **Species, generation and Pokémon tiles** remain the one genuine domain gap.
- **PC has no representation**, and Trade/Sell remains per-copy while the target
  UX treats it as per-card.
- **No preference language:** no ranges, no multiple acceptable values, no
  ranked preferences, no "or better". Pilot evidence decides whether any is
  wanted.
- **Correcting criteria mid-deal can strand a Collector** in a live negotiation
  on a copy their own Deal Flow no longer lists. The deal is still theirs to
  finish or cancel, and the world stays valid; the command is deliberately not
  blocked. Worth watching in the pilot.
- **Five tabs, not four**, until Binders can hold the cross-Binder views.
- **Browse is unchanged** — one search box, the TP lens and the catalog itself
  are all later batches, and the production catalog is very likely still empty.

---

## 13. Next recommended batch — not implemented

> ### Inspect + Request Photos, with participant-aware visibility.

Expose `reviewCopy`, `endReview` and `requestPhotos`, give Deal Flow its first
two actions, and — in the same batch, because this is the batch that creates
people who can be orphaned — widen the standing test in `copyForViewer` so that
a Collector holding an open review or an open photo request keeps seeing the
copy as `unavailable` rather than having it vanish.

It is the right next step because Deal Flow now shows a person a specific
physical copy and gives them nothing to do about it, and because "look properly,
then ask to see it" is the smallest pair of actions that neither commits anybody
nor touches price. It stops before Agree Market Value, which is where an
Opportunity is created and where the naming collision must be settled first.

**Not implemented.**
