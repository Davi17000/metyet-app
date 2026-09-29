# MetYet — Post–Option B Integrity & Privacy Cleanup

**Implementation batch.** Branch `phase-5-option-b-copy-availability`, on top of
`9fca5b5f2dc7f9da43a6633e38ba6b4c0ac043bb`.

---

## 1. Executive summary

**Starting SHA: `9fca5b5f2dc7f9da43a6633e38ba6b4c0ac043bb`.** Verified before
editing: worktree clean, Option B present in the code rather than only in its
hand-back (`copyPendingFor`, `copyInLiveDeal`, `setCopyPending`,
`copyBlockedFor`, the `finalAgreementGiven` predicate in `metyet-world.js`, and
the suite registered in `tests/all.cjs`), and the targeted Option B suite green
at 49/49. **No stop condition fired.**

**The two founder-approved findings are closed.**

**Final mutation policy.** Inside the protected window — `copyInLiveDeal` (an
active opportunity with a settled market value) **or** sold — a partner may not
restate what the object *is*:

| | |
|---|---|
| **Protected** | `cert`, `grade`, `condition` |
| **Protected** | changing or clearing an already-filled photograph |
| **Open** | `ask`, `cost`, `acquired`, `note` — the shop's own bookkeeping |
| **Open** | filling an **empty** photograph slot — this is evidence arriving |

**Final privacy policy.** Refusals about a copy are shaped at the seat boundary.
A partner who **owns** the card keeps all three answers, because they act on the
difference and already hold it on their own inventory row. Everyone else gets
one word — `copy-unavailable` — for pending, promised, sold and archived alike.
The domain is **not** flattened: `inventoryCopyStatus` still returns all four.

**Two assumptions in the brief were disproven by the code, and both changed the
work.**

1. *"If `addCopyPhotos` is truly append-only, it may remain allowed."* It is
   not append-only. It merges by slot, so a `front` given for a copy that has
   one **replaces** it, and `front: null` **erases** it — and it carried no deal
   guard at all, not even the certificate lock's. It was the easier of the two
   doors onto the harm the batch exists to close.
2. *"MetYet supports Collectors requesting additional photos."* There is no
   "additional" — a copy has exactly two named slots (`copyPhotographed` is
   `front && back`), and `requestPhotos` returns early once both are filled. A
   photo request can therefore only ever **exist** for an empty slot. That is
   what makes the enrichment rule expressible with no new subsystem: fulfilling
   a request always means filling an empty slot and never means changing a
   filled one. §2 gives the evidence.

**One leak was materially worse than the brief assumed.** `startOpportunity` ran
its availability gate **before** the card-identity and relationship checks, so a
collector with no relationship to the shop, holding a goal for an entirely
different card, read any copy's exact lifecycle stage out of an arbitrary
`invId`. Ordering was part of the fix, not just vocabulary.

**The adversarial pass found a critical defect in this batch's own first
implementation** — the photograph guard was completely bypassable, in two calls,
using the one command that *is* exposed in production. §6 records it in full
because the cause generalises.

**Results.** 135 suites, 4,565 tests, **0 failures** (baseline 134 / 4,533).
Production build OK, 341,629 bytes. Production smoke OK, 83,686 chars.

**One privacy edge is deliberately left open** — inspection still separates
*sold* — because every way of closing it contradicts something already agreed.
It is pinned by a test and costed in §10 for your decision.

---

## 2. Mutation investigation

Answered from the code before anything was edited.

**1. Are photos replaced, appended, merged or transformed?**
Two different answers, which is the root of the whole section:

- `updateInventoryCopy` **assigns** — `clean.photos = p.photos`, then
  `{ ...i, ...clean }`. The patch's value becomes the record's value entire.
- `addCopyPhotos` **merges by slot** —
  `{ front: front !== undefined ? front : existing.front, back: … }`.

**2. Does `addCopyPhotos` differ from generic inventory editing?** Yes, and not
in the direction its name implies. It merges rather than assigns, but it is
still a *write*, not an append, and before this batch it had **no** deal guard —
`updateInventoryCopy` at least had the certificate lock.

**3. Can a TP remove existing photos?** Before this batch: yes, by either door.
`addCopyPhotos({front: null})` erased a face; `updateInventoryCopy({photos:
null})` erased both.

**4. Can existing evidence be replaced?** Before this batch: yes, on a committed
copy and on a sold one, unguarded.

**5. Do grade/condition affect Discovery, matching, valuation or projection?**
Yes, in four places: the Discovery search haystack
(`metyet-domain.js:1031` builds it from `[name, set, num, year, grade, …]`),
the card specification's resolution (`:1070–1082` — `needsGrade`,
`needsCondition`, `resolved`), the copy's printed label (`:24`, with condition
shown when the grade is `Raw`), and `gradingProblem`'s coherence rule. They are
not decorative facts.

**6. What window does `copyInLiveDeal` represent?** An **active** opportunity
with `agreedPrice != null` — deliberately the older, wider window. Its own
comment states the separation Option B made, and states the reason for exactly
this batch in passing: *"pricing around its grade."* The architecture had
already written down why grade belongs here; only the code had not caught up.

**7. What mutations remained possible after Sold?** `grade`, `condition` and
photographs by both doors. `cert` was protected (Option B closed that half);
archiving remained allowed and still does, deliberately.

**Cancellation/release.** `copyInLiveDeal` requires `isActive(o)`, so ending the
deal closes the window and the partner owns their card again. Proven, `[A10]`.

---

## 3. Implemented mutation invariant

> **Once a specific physical copy is inside the protected window, the partner may
> not rewrite the facts that say what the object is. Evidence may still arrive;
> it may not be restaged.**

**Protected fields:** `cert`, `grade`, `condition`.
**Protected operation:** any write that would change or empty an
already-filled photograph slot.
**Allowed throughout:** `ask`, `cost`, `acquired`, `note`, and filling an empty
photograph slot.
**Window:** `copyInLiveDeal || sold` — unchanged from the certificate lock, and
deliberately *not* the availability boundary.
**Refusal:** `copy-committed`, the code the TP client already renders.
**Cancellation:** ends the window; editing returns.
**Sold:** same protected set, permanently. Archiving stays allowed — tidying the
shelf is not rewriting history.
**No new durable state**, no new field, no migration, no allow-list change.
Proven by `[A12]`, which also asserts no `locked`/`frozen`/`sealed` is assigned
anywhere in the command layer.

**Why a no-op is not a rewrite.** Restating a fact as exactly what it already
says is allowed (`[A5]`), mirroring the certificate lock's existing
`p.cert !== copy.cert`. Idempotent writes are not an attack.

**Files/functions.** All in `domain/metyet-commands.js`:
`PROTECTED_COPY_FACTS`, `copyEditProtected`, `photoSlot`,
`photographsRewritten`, `protectedCopyEdit`; called from `updateInventoryCopy`
and `addCopyPhotos`.

---

## 4. Privacy investigation

**Externally observable refusal behaviour before the fix**, probe-verified
against the real domain across all four copy states.

**Jordan — related to the shop, no opportunity on the copy:**

| copy state | `startOpportunity` | `reviewCopy` | `requestPhotos` |
|---|---|---|---|
| available | OK | OK | OK |
| pending elsewhere | **`copy-pending`** | OK | OK |
| committed elsewhere | **`copy-committed`** | OK | OK |
| sold | **`copy-unavailable`** | `copy-unavailable` | `copy-unavailable` |

`startOpportunity` alone separated all four states, and a new pursuit requires
no prior connection to the card — so it was a free, repeatable oracle.

**Jordan holding a live rival opportunity** was a second, independent channel:
`proposePrice`, `acceptPrice`, `proposeTradeSelection`, `chooseCashOnly`, the
four `valueStep` commands, `proposeFinalBalance` and `acceptDeal` each returned
the three distinct codes, at every stage his own deal had reached.

**Riley — a total stranger, no relationship, goal for a different card:** still
`copy-pending` / `copy-committed` / `copy-unavailable`, because the availability
gate ran before both the identity and relationship checks.

**Commands reviewed.** `copyBlockedFor` and all eight of its call sites
(`proposePrice`, `acceptPrice`, `proposeTradeSelection`, `reviewTradeCard`,
`proposeFinalBalance`, `acceptDeal`, `valueStep`→4 commands, `chooseCashOnly`);
and independently `startOpportunity`, `reviewCopy`, `requestPhotos`,
`setCopyPending`, `updateInventoryCopy`, `removeInventoryCopy`,
`updateCollectorCopy`, `removeCollectorCopy`, `setInterest`,
`withdrawTradeCard`.

**Leak channels beyond the code.** `refuse` is `(code) => ({ ok: false, refused:
code })` — no call anywhere passes a second argument, and `execute` re-wraps to
strip strays. The refused shape is exactly `{ok, refused}`. Over HTTP the
`message` is a constant for all three and `version` does not vary. The
projection was already clean: `INVENTORY_FOR_COLLECTOR` excludes `pendingFor`,
and a rival-held copy is absent from a bystander's inventory entirely. **The
command layer was undoing a line the projection had always held.**

---

## 5. Implemented privacy invariant

> **A collector may learn that a copy is not available for them to progress. They
> may not learn which of pending, promised or sold it is, nor whose.**

**An unrelated or competing collector** cannot distinguish pending, committed,
sold or archived — all four answer `copy-unavailable` (`[B1]`, `[B2]`, `[B6]`).
`available` remains distinguishable, which is the point (`[B3]`). No refusal
carries an id, price, stage or any other payload (`[B7]`), and the projection
did not start leaking to compensate (`[B8]`).

**A stranger never reaches the availability answer at all.** `startOpportunity`
now asks card-identity and relationship first; `reviewCopy` and `requestPhotos`
ask relationship first. Riley gets `no-relationship` in every state (`[B4]`,
`[B5]`), and archiving no longer flips what he sees (`[C6]`).

**The partner who owns the card keeps every distinction** — `copy-pending`,
`copy-committed` and `copy-unavailable`, three states to three answers (`[B11]`).
This is deliberate and it matters: at `setCopyPending`, *"you already promised
this"* (cancel that deal first) and *"you already pencilled it in"* (release,
then re-mark) are different instructions, and flattening them would make Option
B's own mechanism unreadable at the command that manages it. Nothing is
disclosed that is not already on their own inventory row, which carries the
derived status and `pendingFor` outright.

**The collector whose own deal controls the copy loses nothing.** This looked
like the risky case and is not: `copyBlockedFor` exempts their own opportunity,
so they never received these three reasons in the first place. What they are
told — `not-your-turn`, `wrong-stage`, `terminal` — comes from the turn and
stage rules, and their status comes from their own projected row. Probe-verified
across all four states before the change was written, and pinned by `[B9]` and
`[B10]`.

**The domain was not flattened** (`[B12]`): all four states still derive, and
`copyPendingFor` still answers. Only what crosses a seat boundary changed.

**Mechanism.** `shapeCopyRefusal(reason, copy, actor)` in
`domain/metyet-commands.js` — the precise reason for the owning partner, and
`copy-unavailable` for everyone else. `copyBlockedFor(state, o, a)` routes every
one of its eight call sites through it; `[C1]` is a structural guard that fails
if any call site is added without the actor.

---

## 6. Adversarial proof

An adversarial pass was run against the finished implementation, with the full
suite already green. **It found the photograph guard completely bypassable.**

### The critical defect, and why it generalises

**The guard and the write disagreed about what a patch means.** The first
implementation read the patch slot by slot and treated a slot the patch did not
mention as *unchanged*. `updateInventoryCopy` does not merge — it assigns
`photos` wholesale — so a slot the patch does not mention is *deleted*.

Observed, on a **sold** copy, by the owning partner, using
`updateInventoryCopy`, which **is** on the production surface:

```
photos: {}              -> OK   now={}            both faces erased
photos: ""              -> OK   now=""
photos: 0 / false / []  -> OK                     field type corrupted too
photos: {front:"F"}     -> OK   now={front:"F"}   back erased by omission
photos: null            -> refused                the ONE shape it caught
```

and therefore, in two exposed calls on a card already handed over:

```
step 1  updateInventoryCopy {photos: {}}                    -> OK   (both slots now empty)
step 2  updateInventoryCopy {photos: {front:"FORGED", …}}   -> OK   (empty slots may be filled)
final photos: {"front":"FORGED","back":"FORGED2"}    status: sold
```

Step 2 was allowed *by the enrichment rule itself*. The guard was not merely
incomplete — its permissive case was the exploit.

**Fix.** Each caller now computes the photographs its own write will produce and
hands **those** to the guard, which compares them against the current ones.
There is no longer any way to describe an edit the guard will not see, because
it is no longer reading a description. Re-verified: all eleven shapes above now
refuse, and the two-step route dies at step 1 (`[C3]`, `[C4]`).

### Mutation — after the fix

| probe | committed | sold |
|---|---|---|
| `cert` rewrite | `copy-committed` | `copy-committed` |
| `grade` rewrite | `copy-committed` | `copy-committed` |
| `condition` rewrite | `copy-committed` | `copy-committed` |
| photo replace / clear / drop / any shape | `copy-committed` | `copy-committed` |
| `addCopyPhotos` replace or erase | `copy-committed` | `copy-committed` |
| **fill an empty slot** | **OK** | **OK** |
| `ask`, `cost`, `note`, `acquired` | **OK** | **OK** |
| no-op restatement | **OK** | **OK** |

**Legitimate enrichment still works end to end** (`[A8]`): a collector requests
the back of a card while their own deal is committed, the partner photographs
it, the request is marked fulfilled — and *then* that slot is closed like the
rest.

**Other bypasses hunted and found clean:** every writer of `state.inventory` in
the domain (only two touch copy facts, and both ask the guard); the CSV/bulk
import path, which emits only `addInventoryCopy`; archive-then-re-add (refused,
`copy-in-use`); archive-then-modify; a sold path skipping `soldInventoryIds`;
prototype-chain patches and `__proto__` payloads; and cross-partner attempts
(`not-owner`).

**Also fixed:** a non-object `patch` reached `"cardId" in p` and threw a
`TypeError` — a 500 on an exposed command where a refusal was meant. It now
refuses (`[C5]`).

### Privacy — after the fix

| prober | pending elsewhere | committed elsewhere | sold |
|---|---|---|---|
| competing collector, `startOpportunity` | `copy-unavailable` | `copy-unavailable` | `copy-unavailable` |
| competing collector, live rival deal | `copy-unavailable` | `copy-unavailable` | `copy-unavailable` |
| stranger, any command | `no-relationship` | `no-relationship` | `no-relationship` |
| **owning partner** | `copy-pending` | `copy-committed` | `copy-unavailable` |

**Also hunted clean:** ordering oracles across the eight `copyBlockedFor` call
sites (the refusal that fires does not vary by rival state); success-vs-refusal
on every copy-independent command; the projection's row counts and array lengths
(identical across all four states); Discovery, which inherits the projection's
silence; `validateWorld`, which never runs on a refused command; and traces a
prober leaves behind.

**One bypass found and deliberately not closed** — §10.

---

## 7. Option B regression proof

Every Option B behaviour the brief lists is intact, run as part of the full
suite. The Option B suite itself is green at 49/49, including: concurrent market
value conversations; two collectors agreeing a value while the copy stays
Available; agreed value not reserving; Pending for A blocking contradictory B
progression while A continues; release restoring pursuit; stale Pending after
cancellation deriving Available; final agreement blocking a second final
agreement; one copy never completing two deals; Sold blocking economic
progression; the losing opportunity remaining as history; collector trade-copy
exclusivity; exact Discovery; `nextActor` authority; and agreed market value
staying separate from final transaction economics.

**Three Option B tests were re-pinned rather than deleted**, because they
asserted the old *wording* and their property survives: `[10]` ("in its own
words" → "without saying why", now also asserting the domain still knows),
"a promised copy still refuses a new pursuit", and the `proposeFinalBalance`
refusal. Each now additionally asserts `inventoryCopyStatus` still names the
true state, so a future flattening of the domain would fail them.

`[B13]` proves the normalisation did not weaken the rule that matters: the
second promise is still refused, the world still validates, and exactly one
completion exists.

---

## 8. Tests

**New suite:** `tests/phase5-post-option-b-integrity-privacy.cjs` — **32 tests**.
Section A (12) discharges the mutation proofs, section B (14) the privacy
proofs, section C (6) proves neither fix rests on a single helper and pins the
adversarial findings.

**Registered, and the guard verified by experiment.** The suite was added to
`tests/all.cjs`. To confirm the Option B registration guard actually works
rather than trusting it, the registration was removed and the guard run: it
failed naming the exact file (`written but never run —
phase5-post-option-b-integrity-privacy.cjs`). Restored.

**Re-pinned — 5 suites.**

| Suite | What moved |
|---|---|
| `phase5-option-b-copy-availability` | three refusal codes → the collapsed word, each now also asserting the domain is not flattened |
| `exclusion-boundaries` | `copy-committed` → `copy-unavailable` for a competing collector; `copyBlockedFor` signature pin relaxed |
| `tp-commitment-ux` | same two |
| `phase5-b5-canonical-card-identity` | the "no command reaches the catalog" guard now strips comments before reading — it is a question about imports, and a comment naming the module failed it |
| `tests/all.cjs` | register the new suite |

That last one is the C7.1 failure mode again in a third costume: a source guard
that prose can trip. It now reads code, using the same comment-stripping the
Option B suite's own no-generic-lock guard uses.

**Results.**

```
targeted   phase5-post-option-b-integrity-privacy   32 passed, 0 failed
option B   phase5-option-b-copy-availability        49 passed, 0 failed
full       135 suites, 4,565 tests, 0 failures      (baseline 134 / 4,533)
build      PRODUCTION BUILD OK — 341,629 bytes
smoke      PROD SMOKE OK — 83,686 chars
```

---

## 9. Diff summary

```
 domain/metyet-commands.js                          | 222 ++--   shapeCopyRefusal, protectedCopyEdit,
                                                                 8 shaped call sites, 2 photo doors,
                                                                 3 gate reorderings, 1 malformed-patch guard
 tests/phase5-post-option-b-integrity-privacy.cjs   | new        32 tests
 tests/all.cjs                                      |   2 +-     register it
 tests/exclusion-boundaries.cjs                     |  10 +-     re-pinned
 tests/tp-commitment-ux.cjs                         |   7 +-     re-pinned
 tests/phase5-option-b-copy-availability.cjs        |  17 +-     re-pinned
 tests/phase5-b5-canonical-card-identity.cjs        |   8 +-     guard reads code, not prose
```

**One domain file.** No projection change, no `metyet-world.js` change, no
migration, no allow-list change, no new durable concept — as the brief predicted
the architecture would allow.

---

## 10. Remaining known behaviour

**Needs a decision — the one privacy edge left open.**
`reviewCopy` and `requestPhotos` do not consult the availability question at
all: pending and committed pass, **sold refuses**. For a collector who is not in
the controlling deal that is a success-vs-refusal oracle on the most valuable
bit there is — the moment a rival deal completed. It is pinned by `[B-OPEN]`.
It is left open because every way of closing it contradicts something already
agreed:

| option | what it costs |
|---|---|
| refuse pending/committed too | Option B says Pending *"stops new pursuits but erases no existing work"*, and its invariant `[1]` says inspecting and requesting photographs reserve nothing. This makes Pending govern inspection — a redesign of it. |
| let sold through | Option B Item 0 closed exactly this: `requestPhotos` had to stop accepting a card the shop no longer owns. |
| participant-aware inspection | still blocks a bystander on pending and committed, so it carries the first objection unchanged. |

Neither command is on the production surface, so nothing reachable today turns
on it. My own read is that the first option is the most coherent — inspection
and pursuit are both "may I engage with this card", and the projection already
hides rival-held copies from a bystander entirely, so the command layer would
simply stop contradicting it — but it is a change to Pending's meaning and so is
yours to make.

**Carried forward, unsolved, as the brief directed.**

- **Review- and photo-only interactions still lose sight of an unavailable
  copy.** `referencedInv` counts opportunities only.
- **No inventory source/authority concept.**
- **Freshness** — not touched.
- **No Collector deal UI**, and `setCopyPending` is still unexposed, so nothing
  in production can create an opportunity for it to name.
- **Fulfilment is still show pickup / meetup.**

**Consciously deferred edges.**

- **Cancelling a committed deal reopens editing immediately.** `copyInLiveDeal`
  requires an active opportunity, so a partner can cancel a deal they had
  promised and at once restate the copy's grade and certificate, leaving the
  cancelled record pointing at facts that no longer match what was agreed. This
  is arguably right — nobody is relying on a dead deal — but cancellation is
  one-sided, so it is worth knowing you have chosen it.
- **The window opens at a settled value, not before.** A copy under active price
  negotiation with no agreed figure is freely mutable. This is Option B's
  documented design, restated here so it is a choice.
- **`photos` has no type check outside the protected window.** `photos: 0`
  persists and `copyPhotographed` then reads the copy as unphotographed.
  Pre-existing, unrelated to either finding, and `validateWorld` does not check
  the field either — left alone rather than widened into.
- **`updateCollectorCopy` is a CollectorCopy id-existence oracle** — it answers
  `copy-unavailable` for an unknown id before the `not-owner` check. Production
  reachable, but it discloses *existence*, not an Opportunity's state, so it is
  a different finding from the two approved here and was not folded in.

---

## 11. Next-batch readiness

> **Is MetYet now ready to implement the production Collector flow — Available
> copies → Inspect → Request Photos → Agree Market Value?**

**Yes, for that flow as scoped**, with one piece of plumbing that batch must
carry itself.

The evidence, step by step:

- **Available copies.** Availability derives correctly for all four states, a
  bystander cannot tell the unavailable ones apart, and Discovery inherits the
  projection's silence rather than re-deriving anything. `INVENTORY_FOR_COLLECTOR`
  excludes `pendingFor`.
- **Inspect.** `reviewCopy` works, is idempotent, and reserves nothing. The open
  edge in §10 concerns what a *bystander* learns from probing it with a raw
  `invId`, not whether the flow functions — and both commands are off the
  production surface until that batch puts them on it. **That is the one thing
  to settle first:** exposing `reviewCopy` and `requestPhotos` is what makes the
  §10 oracle reachable, so the decision there should be taken as part of
  exposing them, not after.
- **Request Photos.** Works, is correctly refused on a sold or archived copy,
  cannot be created once both faces exist, and — closed by this batch — the
  partner can fulfil it inside a live deal while being unable to restage what is
  already there.
- **Agree Market Value.** `startOpportunity` and `acceptPrice` are sound: two
  collectors may agree a value on one copy concurrently, the world validates in
  that state, and neither is owed the card. The economics are untouched.

**The plumbing that batch owns:** none of `startOpportunity`, `reviewCopy`,
`requestPhotos` or `acceptPrice` is in `server/exposed-commands.js`. The flow is
correct in the domain and has no production door. That is the expected shape —
the brief says qualification and Market Value commands get exposed together —
but it is work, not a formality, and the §10 decision rides on it.

**No blocker in the domain.** Not implemented here, as instructed.
