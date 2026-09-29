# MetYet — Collector Qualification: Participant-Aware Visibility → Inspect → Request Photos

Implementation hand-back. Phase 5, Collector qualification boundary.

---

## 1. Executive summary

Deal Flow could already say *"this exact copy, at this shop, is the card you
asked for"* and could do nothing with the answer. This batch is what a Collector
may now do about it, and the whole of it is two verbs — **Inspect** and
**Request photos**. Neither settles a value, reserves the card, tells the shop
anything about intent, or begins a deal.

Getting there required fixing the rule underneath first, because it was wrong in
both directions at once. That is §7, and it is the real content of the batch.

---

## 2. Starting and ending SHA

| | |
|---|---|
| **Branch** | `phase-5-collector-qualification` |
| **Starting SHA** | `67c1cf0` (merge PR #76) — as the prompt specified |
| **Ending SHA** | `a9d6b0c` |
| **Worktree** | `/home/claude/q1` |

`main` was confirmed at `67c1cf0`, with `d6dfdfe` (Binders) and `6713efb` (True
Match) both ancestors. Worktree clean before any edit.

---

## 3. Baseline gate

| | Before | After |
|---|---|---|
| Suites | 137 | **138** |
| Tests | 4,655 | **4,716** |
| Failures | 0 | **0** |
| Allow-list | 18 | **21** |
| Migrations | 13 (`0013_binders.sql`) | **13, unchanged** |
| Production build | OK | OK — 343,337 bytes; `main.js` 313,112 |
| Production smoke | OK | OK — 83,686 chars |

Deal Flow was confirmed read-only and the Collector navigation confirmed as
exactly Browse · Binders · Trusted Partners · Deal Flow, before and after
(`[44]`).

---

## 4. Pre-implementation audit — findings

Two parallel read-only audits traced every command, caller and durable
structure before a line was edited. The load-bearing results:

1. **`reviewCopy` creates no Opportunity.** Verified in source and by row-count
   assertions. The stop condition in §6 of the brief did not fire.
2. **`requestPhotos` creates no Opportunity either** — but it *does* create a
   `copyReviews` row as a side effect when none is open. Pre-existing since long
   before this batch; pinned now (`[23]`) because the button is new and a reader
   should not be surprised that "Request photos" also starts an inspection.
3. **`protectedCopyEdit` was sound.** Both callers already handed it the true
   final photo state. Re-verified through real writes anyway (§13).
4. **The door was open and leaking** — §7.
5. **`addCopyPhotos` is the only fulfilment command, and it is unexposed** with
   no Trusted Partner surface. §11 and §19.

---

## 5. Exact discovered semantics

| Thing | What it actually is |
|---|---|
| `reviewCopy(state, a, {invId})` | Appends one `copyReviews` row `{id, collectorId, partnerId, invId, at, endedAt:null}`. Collector seat only; authorised by an accepted relationship with the copy's owner. Idempotent — an open review returns its own id and writes nothing. |
| `endReview(state, a, {reviewId})` | Sets `endedAt`. Never deletes. Row-ownership check only; a partner can never end one. |
| `requestPhotos(state, a, {invId})` | Appends one `photoRequests` row `{…, fulfilledAt:null}` **and** a `copyReviews` row when none is open. |
| Photo fulfilment | `addCopyPhotos` only. Sets `fulfilledAt` on **every** open request for that copy, keyed on `invId`, and only when the result satisfies `copyPhotographed` (front **and** back). |
| Request lifecycle | Two states. Open → fulfilled. No cancel, no expiry, no reopen, no delete. |
| Copy availability | `inventoryCopyStatus` → `sold` / `committed` / `pending` / `available`, in that precedence. This is the Option B authority and this batch did not touch it. |
| Participant visibility | **Did not exist.** `referencedInv` was built from opportunities only, with a written-down decision that "a photo request or Review Card names a copy but adds none". |
| `protectedCopyEdit` | Refuses a cert/grade/condition change or a photograph *rewrite* inside `copyInLiveDeal` (settled price) or once sold. Filling an empty slot is allowed — evidence arriving is not evidence rewritten. |

---

## 6. Implemented product behaviour

**Goal → exact trusted match → Inspect that physical copy → Request photos.**
Deal Flow stops there.

The Collector can see which Goal matched, which trusted shop has it, which
physical copy is being considered, its grade/cert/photos/ask, whether they are
inspecting it, whether photos were requested, whether evidence arrived, and —
new — whether a copy they were already qualifying on has since become
unavailable.

---

## 7. The participant-aware visibility rule

> **Pending closes the door; it does not throw out the people already in the room.**

Both halves were violated, in opposite directions. Reproduced before fixing:

**The door was wide open.**

```
status     reviewCopy        requestPhotos
available  OK                OK
pending    OK                OK
committed  OK                OK
sold       copy-unavailable  copy-unavailable
```

A copy pending for — or already promised to — somebody else's deal accepted a
total stranger to it. Worse, `committed` ≠ `sold` is a success-versus-refusal
oracle on the single most valuable fact there is: the moment a rival's deal
completed.

**And people already inside were evicted.**

```
copy goes pending    review kept:true  copy row: GONE  <-- dangling
copy goes committed  review kept:true  copy row: GONE  <-- dangling
copy goes sold       review kept:true  copy row: GONE  <-- dangling
```

### The rule now

```
openToNewQualification(inv)  :=  inventoryCopyStatus(inv, opps, inventory) === "available"
qualifyingOn(inv, cid, …)    :=  an OPEN copyReview  |  an OPEN photoRequest
                                 |  an active opportunity of one's own
holdingCopy(inv, cid, …)     :=  the deal that actually HOLDS the copy is yours
                                 (copyCommittedTo, or the partner's pendingFor).
                                 Sold holds nothing.
```

- **Commands.** A closed copy refuses everybody except the holder — with the
  same answer for pending, promised and sold. An open review or request of one's
  own is answered with itself *before* the door, so the commands stay idempotent.
- **Projection.** An open review or request keeps the copy visible **to that
  Collector alone**, at flat `unavailable`. Never `pending`, `committed` or
  `sold`. Excluded when the copy is archived, or the relationship has ended.
- **It ends when qualification ends.** Close the review and, with no open
  request left, the copy leaves exactly as before (`[7]`).

### Why "existing participant" is narrow

The brief permits an existing participant only "the access necessary to
understand/complete the already-authorized qualification interaction". So a
participant keeps **visibility** and keeps `endReview`; they do not get to
*start* something new on a closed copy. The one exception is the Collector whose
own deal holds the card — an adversarial run showed that closing `committed`
without that exception locked the **winner** out of the card they had just been
promised.

### The objection the old test raised, and the answer

`[B-OPEN]` pinned the oracle deliberately and named participant-aware inspection
as carrying an objection: it "would make Pending govern inspection, which is a
redesign of it". That does not survive reading Option B's own sentence — Pending
*"stops new pursuits but erases no existing work"*. Stopping a bystander from
**starting** is the first half; the second half is honoured exactly, since the
review row survives, the copy stays on screen, and `endReview` still works.
Option B invariant [1] (inspecting and asking reserve nothing) is untouched and
still proven: several Collectors may qualify on one available copy at once and
none is ahead (`[16]`).

The test is now `[B-CLOSED]`, and is strictly **stronger** than what it replaced.

---

## 8. Privacy proof

| Claim | Test |
|---|---|
| Every closed state gives the identical refusal | `[2]`, `[50]` |
| A qualifying Collector is shown flat `unavailable`, never which | `[4]`, `[5]` |
| No `pendingFor`, rival id, stage, price or agreement reaches them | `[5]` |
| A stranger to the shop is told about the shop, never the copy | `[11]` |
| No Collector sees another's review or request | `[12]` |
| A partner never sees a Review Card; they do see a photo request | `[13]` |
| The owning partner keeps the precise state | `[14]` |
| An archived copy is not a readable fourth state | `[49]` |
| An ended relationship revokes it | `[8]` |
| The refusal message leaks nothing | `[36]` |

The adversarial reviewer independently diffed the whole Collector projection
across pending/committed/sold for a qualifying Collector and found it
**byte-identical** apart from a random review id, and confirmed the Deal Flow
near-miss count is **not** an oracle — it drops by exactly one, identically, for
pending, committed, sold and archived, which is the same signal the row simply
vanishing already gave.

**Residual, reported not hidden:** a Collector may keep a copy visible
indefinitely by never ending a review. It is not an information channel — the
row says flat `unavailable` and flips back to `available` if the rival cancels,
which is exactly what a non-reviewer observes by the copy reappearing.

**Also reported:** existence-ordering oracles (`copy-unavailable` for an unknown
`invId` before the relationship check; `not-found` vs `not-owner` on
`endReview`). Pre-existing ordering; exposure is what made them reachable.
Production ids are random tokens, so enumeration is impractical. Recorded rather
than fixed, because fixing it is a change to a refusal-ordering rule that other
batches depend on.

---

## 9. Inspect UX

On the physical copy's own row in Deal Flow, never on the Goal. A single
**Inspect** button; once open, the row says *"You're inspecting this copy"* and
offers **Done inspecting**. No reservation language, no price, no shop-facing
implication, nothing disabled.

A copy that closes while you are inspecting it now **stays on screen**, marked
*"No longer available"*, carrying only the way out — this was the adversarial
pass's most serious finding (§15).

---

## 10. Request Photos UX

A **Request photos** button, which becomes *"Photos requested"* once asked and
disappears entirely once both faces exist (nothing left to ask for). If evidence
arrives it shows *"Photos arrived"*. No freeform message, no deadline, no
urgency, no notification.

---

## 11. Command exposure, before and after

**18 → 21.** Added: `reviewCopy`, `endReview`, `requestPhotos`.

Each one is a Collector action, refused unless the caller's own seat is a
Collector in an accepted relationship with the owning shop, creates no
Opportunity and no reservation, and cannot be started on a copy that is pending,
promised or sold to anybody else. Proven over real HTTP against the real server
and database in §I (`[56]`–`[60]`): the three get through; ten transaction
commands answer `command-unavailable`; a caller cannot name another identity;
nobody else can end an inspection; malformed payloads refuse cleanly with no
500s.

`endReview` is exposed because a Collector who cannot close an inspection is one
whose Goal stays pinned to the first copy they ever opened — a known prototype
bug not worth shipping again.

**Still closed:** `startOpportunity`, all price/Market Value commands,
`setCopyPending`, final agreement, trade selection, fulfilment, handoff,
messaging, `setInterest` — and `addCopyPhotos`. See §19.

---

## 12. Durable-state proof

**No new durable fact. No migration. No new domain noun.**

- Migrations unchanged at 13; `git diff --stat 67c1cf0 -- persistence/migrations`
  is empty.
- `[41]` asserts that `participant`, `authorizedViewer`,
  `qualificationParticipant`, `visibilityGrant`, `cardState` and `qualifiedBy`
  appear in no field position anywhere in `domain/` and reach persistence in no
  form.
- `[42]` runs the commands and validates the resulting world — if the rule
  needed a fact of its own, the world would stop being storable.

Both predicates are pure derivations over rows that already existed.

---

## 13. Photo-integrity proof

Tested through **real write paths**, not the guard in isolation (`[28]`–`[32]`):
every patch shape — `{}`, a single slot, `null`, `"gotcha"`, `[]`, a full
replacement — is refused inside a live deal and moves no bytes; the
empty-then-refill route is closed at its first step; evidence *arriving* into an
empty slot is still allowed and that slot then closes.

`updateInventoryCopy` now computes the final photographs **before** asking the
guard and reuses that same value for the write, which is the guard's own
contract; `[32]` pins the ordering structurally.

**Honest severity on the shape fix.** Storing a malformed `photos` value was
possible only on an *available* copy, where wiping photographs was already
legal — so it bought no power over evidence that a plain wipe did not. Real
evidence in a live deal was never rewritable, before or after; I verified the
dangerous ordering explicitly. This is **data hygiene and defence in depth, not
a closed exploit**, and I am not claiming otherwise. The adversarial reviewer
independently diffed 27 (start-state × patch-shape) combinations against the
baseline and confirmed **every refuse/allow decision is identical** — only the
stored representation is canonicalised.

The one real behavioural gain: `{front:{}, back:{}}` used to satisfy
`copyPhotographed`, so a copy holding no evidence told the Collector there was
nothing left to ask for (`[51]`).

---

## 14. Tests

**138 suites, 4,716 tests, 0 failures.** New suite
`tests/phase5-qualification-inspect-photos.cjs` — **60 tests**, registered in
`tests/all.cjs`, registration verified by experiment (removing the entry makes
the structural guard name the exact file).

| Section | Covers |
|---|---|
| A | the rule itself, both halves, all four copy states |
| B | what a stranger, a rival and the owning partner see |
| C | Inspect: authorisation, idempotence, reserves nothing, no hijack, no injection |
| D | Request Photos: authorisation, idempotence, reserves nothing |
| E | photo integrity through real writes |
| F | the screen, and what it sends |
| G | the boundary: allow-list, migrations, True Match, four tabs |
| **H** | **every adversarial finding** |
| **I** | **the three commands over real HTTP** |

---

## 15. Adversarial findings and fixes

A subagent reviewed the finished, green batch and reproduced everything it
reported. Findings in its severity order:

| # | Finding | Fix | Pin |
|---|---|---|---|
| 1 | **The batch's headline was invisible in the product.** Deal Flow builds its copy list from `discoveries`, which require `status === "available"` — so the copy the projection worked to keep was dropped by the screen anyway. The Collector lost the card exactly as before, and with it the only route to **Done inspecting**, which pinned the copy into their projection *permanently*. | Copies the Collector is still qualifying on are rendered under their Goal, marked *"No longer available"*, carrying only the way out | `[45]`, `[46]` |
| 2 | **The gate sat above the "already in the room" short-circuit**, so both commands did the exact opposite of the comments beside them, and broke the idempotence `client/commands.js` promises in shipped documentation | Short-circuits moved above the door | `[47]`, `[48]` |
| 3 | **An archived copy stayed visible carrying `archived: true`** — a distinguishable fourth state, exactly the difference flat `unavailable` exists to hide | Archived excluded from participant visibility | `[49]` |
| 4 | `copyPhotographed` short-circuited **above** the door, so a closed photographed copy answered differently from a closed bare one | Moved below | `[50]` |
| 5 | The photo-shape comment claimed `updateInventoryCopy` was **"the only door"**. It is not — `addInventoryCopy` is also on the allow-list and also writes the field, and `{front:{},back:{}}` went in reading as fully photographed | Both doors normalise; comment corrected | `[51]` |
| 6 | **One `busy` flag for the whole screen** silently swallowed a press on a second copy, with no message; and one panel-wide error banner did not say which copy | Per-control `busy`, per-copy message | `[52]`, `[53]` |
| 7 | **`qualifyingOn` was dead code** — written, exported, documented as half the rule, called by nothing, while the projection restated a narrower version inline | The projection now asks the predicate | `[54]` |
| 8 | Test hygiene: three stale titles ("sixteen", "Eighteen since C5"); `[38]` lost its `!/<button/` bound with nothing replacing it; no HTTP test of the batch's central act | Retitled; upper bound added; §I added | `[55]`, `[56]`–`[60]` |

Verified **correct** by the reviewer and left alone: the privacy claim (no oracle
found, whole-projection diff identical); participant visibility across ended
relationships, non-accepted relationships, fulfilled-only requests, ended
reviews and stale review partners; `holdingCopy` against cancelled deals, other
copies, other collectors, stale `pendingFor`, and the sold case; photo integrity
on every path; exposure over HTTP; and **no test weakening** — every re-pinned
"closed commands" loop *gained* more names than it lost, and `[B-OPEN]` →
`[B-CLOSED]` is strictly stronger than what it replaced.

---

## 16. Full test, build and smoke

```
$ node tests/all.cjs
ALL SUITES PASSED          138 suites · 4,716 tests · 0 failures

$ npm run prod
PRODUCTION BUILD OK — bytes: 343337

$ npm run smoke
PROD SMOKE OK — rendered 83686 chars; binder strings shipped, old CTA wording absent

$ npm run build:app -- --allow-unconfigured
  index.html — 457 bytes
  main.js — 313112 bytes
```

`--allow-unconfigured` is needed only because this worktree has no Supabase
environment; the flag builds a bundle that refuses to start rather than one
pretending to be configured. No secret was requested, printed or needed.

---

## 17. Changed files

| File | Change |
|---|---|
| `domain/metyet-domain.js` | `qualifyingOn`, `openToNewQualification`, `holdingCopy`; `photoRef` / `photographs` |
| `domain/metyet-commands.js` | the door in `reviewCopy` and `requestPhotos`; photo normalisation at both write doors; guard fed the final value |
| `domain/metyet-projection.js` | participant visibility in `referencedInv`, gated on relationship and archived |
| `server/exposed-commands.js` | 18 → 21 |
| `client/commands.js` | `inspectCopy`, `endInspection`, `requestCopyPhotos` |
| `client/collector/sections/DealFlow.jsx` | the two controls, qualifying-copy rendering, per-copy busy/error |
| `client/collector/CollectorShell.jsx`, `production-app.jsx`, `sign-in/SignIn.jsx` | prop wiring |
| `tests/phase5-qualification-inspect-photos.cjs` | **new**, 60 tests |
| 13 existing suites | re-pinned, each with its reason in place |

**25 files, +1,656 / −94.** `persistence/` untouched.

---

## 18. Deferred functionality

Not implemented, per the brief: PC or any positive keep fact; Agree Market
Value; `startOpportunity`; price proposal/acceptance; Pending controls;
reservation; transaction construction; trade selection; final agreement;
fulfilment/handoff/Sold UI; fuzzy, range or "or better" matching; preference
scoring; species/generation/Pokémon-first Browse; messaging, chat or
notifications; TP Inventory or any TP visual work; broader visual redesign.

True Match is untouched — stated is exact, unstated is unrestricted, no bands
(`[43]`). Navigation is still exactly four tabs (`[44]`).

---

## 19. Remaining risks and debt

**The one that matters — a request nobody can answer.** `addCopyPhotos` is the
only command that fulfils a photo request. It is a Trusted Partner action, it is
not exposed, and no TP surface exists — building one is deferred TP work. So a
request made today is real, durable and correctly shown as outstanding, and the
partner has **no production door to answer it through**. Exposing a command no
screen can send would not fix that; the screen would. The domain path works
end to end and is proven (`[6]`): when the photos do arrive, the requester sees
them, even if the copy closed in the meantime.

Other debt:

- **`requestPhotos` silently opens a review.** Existing domain behaviour, now
  reachable from a button; pinned (`[23]`) so it cannot surprise a later reader.
- **Reviews are never garbage-collected.** No lifecycle hook ends one. A
  Collector who never presses Done inspecting keeps the copy visible; harmless,
  but it accumulates.
- **Existence-ordering oracles** (§8) — pre-existing, now reachable, impractical
  to exploit against random ids.
- **`endReview` writes `endedAt: at || null`**, so under a runtime that omits
  `at` it reports success while leaving the review open. Production always
  supplies `at`; the prototype store does not.
- **`interests.binderId`** remains legacy naming for a collector-copy id.

---

## 20. Recommendation for the next smallest Collector-side batch

> **Partner-side photo fulfilment: give `addCopyPhotos` a Trusted Partner
> surface, and show the Collector the evidence when it lands.**

This is the smallest batch that makes what shipped here actually complete, and
§19 is the argument for it: the Collector can now ask, and nobody can answer.
It is narrow — one command, one list ("copies somebody has asked to see"), one
upload path — and it needs no new durable fact, since `photoRequests` already
carries the whole lifecycle and `addCopyPhotos` already closes it.

It is also the right place to spend the next unit of care, because the photo
guard is the one piece of this area that has already produced a bypassable
version of itself. `protectedCopyEdit`'s contract — the guard reasons about the
photographs the write will *produce* — should be treated as load-bearing when
that command is exposed, not as an implementation detail to route around.

Prefer it over Agree Market Value or Pending, both of which are transaction
steps that would cross the line this batch deliberately stopped at.
