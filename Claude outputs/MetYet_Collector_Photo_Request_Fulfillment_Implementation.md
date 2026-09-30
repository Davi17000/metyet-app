# MetYet — Closing the Collector Qualification Loop: Trusted Partner Photo Fulfilment

Implementation hand-back. Phase 5, the shop's half of Request Photos.

---

## 1. Executive summary

The qualification batch gave a Collector two verbs about one physical copy —
Inspect it, and ask to be shown it — and shipped the asking without the
answering. `addCopyPhotos` is the only command that closes a photo request, it
belongs to the shop that owns the card, and it had no surface. So a Collector
could ask and nobody could answer. That was written down as a gap rather than a
decision; this batch closes it, and nothing else.

Almost all of the behaviour was already correct in the domain and is **pinned
here rather than built**. Two things were not, and both were reachable the
moment the command got a door — §4 and §15.

---

## 2. SHAs and branch

| | |
|---|---|
| **Branch** | `phase-5-photo-fulfillment` |
| **Starting SHA** | `f464c5f` (merge PR #77) — determined, not assumed |
| **Ending SHA** | `6111fba` |
| **Worktree** | `/home/claude/p1` |

PR #77 confirmed in ancestry (`c5f6fc5`, `a9d6b0c`), as is PR #76 (`67c1cf0`).

---

## 3. Baseline

Reproduced the previous hand-back exactly before editing:

| | Before | After |
|---|---|---|
| Suites | 138 | **139** |
| Tests | 4,716 | **4,766** |
| Failures | 0 | **0** |
| Allow-list | 21 | **22** |
| Migrations | 13 (`0013_binders.sql`) | **13, unchanged** |
| Production build | OK | OK — 343,529 bytes; `main.js` 317,825 |
| Production smoke | OK | OK — 83,686 chars |

Confirmed before starting: Inspect, Done inspecting and Request photos all
present; participant-aware visibility intact; a bystander gets the flat
`unavailable`; `addCopyPhotos` still the fulfilment command and still unexposed.

---

## 4. Audit findings

| Question | Answer, proved by running it |
|---|---|
| Who may call `addCopyPhotos`? | Only the TP that **owns** the copy. A Collector, another Collector, another shop → `not-owner`. Authorization was already sufficient; nothing was added. |
| Payload and mutation | `{invId, front?, back?}`. Merges by slot: a face not mentioned is untouched, a face mentioned replaces, `null` erases. Writes the copy's `photos` and the `fulfilledAt` of requests against that copy. Nothing else. |
| Fulfilment rule | `copyPhotographed(photos)` — **both** faces. One face is not an answer. |
| One request or all? | **All** open requests on that copy, keyed on `invId`. |
| Multiple requesters | Two Collectors asking about one copy are both answered by one submission. Already true; pinned `[5]`. |
| After Pending/committed/sold | The shop can still answer an outstanding request. Availability does not change. Already true; pinned `[10]`. |
| After the relationship ends | The shop still owns the card and may still photograph it. Pinned `[4]`. |
| Owning vs unrelated TP | The owning shop sees its own requests (already, from the previous batch). An unrelated shop sees none. |
| Can protected evidence be overwritten? | No — `protectedCopyEdit` is asked, with the post-write value. |
| Server-side ownership sufficient? | Yes. The only additions were the two defects below. |
| Photo representation | A **string reference** per face. There is no upload path anywhere in the product. |
| Smallest TP surface | The inventory copy itself — §8. |

**Two things were not true.**

1. **It did not normalise its input.** `front: {}` — which `copyPhotographed`
   reads as present — let a shop mark every outstanding request **FULFILLED**
   while the copy held no photograph at all:

   ```
   before: casey:open
   addCopyPhotos front={} back={}  ->  OK
   after : casey:FULFILLED  | photos {"front":{},"back":{}}
   copyPhotographed says: true
   ```

2. **It leaked existence.** `not-found` for a missing copy was answered *before*
   the ownership check, so a shop could tell an id that exists somewhere from
   one that exists nowhere.

Both harmless while the command had no door; both reachable the instant it had
one.

---

## 5. Exact `addCopyPhotos` semantics, as it now stands

```
seat must be tp                                  → else not-owner
copy must exist AND be this partner's            → else not-owner   (one answer)
copy must not be archived                        → else copy-unavailable
each SUPPLIED face: a reference or null          → else photo-unusable
merged  = supplied face, or the stored one untouched
guard   = protectedCopyEdit(normalised before, normalised after)
complete= copyPhotographed(normalised merged)
write   = the merged value; fulfilledAt on every open request iff complete
```

Three jobs kept apart, and §15 is the record of what happened when they were
not: **what is supplied is checked**, **what is stored is left alone**, and
**completeness and the guard both read the normalised view**.

---

## 6. Request lifecycle

Unchanged. Two states, one closing field.

```
(no row) --requestPhotos--> OPEN {fulfilledAt: null} --addCopyPhotos, both faces--> FULFILLED
```

No cancel, no expiry, no reopen, no delete, no acknowledgement, no task record.
`[23]` asserts the row's field set is exactly what it was.

---

## 7. Multiple-requester semantics

**One set of photographs of one physical object answers everybody who asked
about it.** Proved, not changed (`[5]`): two accepted Collectors both request
the same copy, one submission closes both, and both rows survive as fulfilled
rather than being deleted. There is no per-request photo ownership and none was
introduced.

`[6]` pins the other half: one face closes nothing, because a card is judged on
both sides.

---

## 8. TP authorization, privacy, and surface

**Authorization** is the owning shop and nobody else, checked in the domain and
proved over real HTTP (`[45]`–`[47]`): the requester herself, another Collector
and another shop all get `not-owner`; an unauthenticated caller gets 401; a
payload naming another `partnerId` is ignored because `resolveActor` re-derives
the seat.

**Privacy — the actual rule, as asked for.** The shop is told **who asked**, and
that is not an expansion: a Trusted Partner already sees the Collectors it has
an accepted relationship with, by name, on this same projection — that is what
the Collector Network screen is made of — and the request row has carried
`collectorId` since long before this batch. Joining the two adds nothing the
shop could not already read. Nothing else travels with it: no Goal, no other
shop, no Opportunity, no Binder, no qualification history. An unrelated shop
sees no request at all.

**Surface.** The smallest existing one that owns the action: the physical
inventory copy. On a copy with an outstanding request the row gains a *Photos
requested* tag, a *Photos* fact showing what evidence exists, and one control —
**Add requested photos** — beside the existing Edit and Remove. The form names
who is waiting, asks only for the faces that are **missing**, and says plainly
that MetYet stores a link rather than a picture. No list, no inbox, no queue, no
dashboard, no demand analytics, and the control is absent entirely when nothing
is outstanding (`[26]`).

---

## 9. The Collector's end-to-end result

All eleven steps, through the real projection and — for the whole loop — real
HTTP (`[44]`):

1–4. She has an exact match, sees the shop's physical copy, requests photos, and
the request is durable and visible to the right people.
5. The owning shop sees it on that copy.
6–7. The shop supplies both faces; every outstanding request closes.
8–9. She sees the new evidence and her request reads fulfilled.
10. It still works when the copy closed after she asked (§10).
11. No Opportunity, reservation, Market Value, Pending change, final agreement
or transaction advancement happens anywhere in it — `[21]` snapshots the
opportunities and the copy across the whole loop and asserts they are identical.

---

## 10. Closed-copy behaviour

A request made while the copy was available can still be answered after
somebody else's deal takes it, and this was already true. What is pinned:

- the shop can answer (`[10]`), and `opportunities` is byte-identical before and
  after;
- the status stays `committed` — answering does **not** reopen the copy;
- the requester sees the evidence at the **flat `unavailable`** (`[11]`), never
  which kind;
- nobody gains access: an unrelated Collector still sees nothing and still gets
  `no-relationship`, and a Collector who knows the shop but never asked still
  gets `copy-unavailable` (`[12]`).

---

## 11. Photo-integrity proof

Through the real production path (`[13]`–`[16]`, `[34]`–`[38]`, `[48]`):

- an empty face can still be filled inside a live deal — evidence arriving is
  not evidence rewritten;
- a filled face cannot be rewritten or erased inside one, by any of five patch
  shapes, and the bytes do not move;
- a successful fulfilment does not leave the door open behind it — both
  `addCopyPhotos` and `updateInventoryCopy` then refuse;
- omission cannot delete: an unmentioned face is carried across untouched,
  including a legacy non-string one (`[37]`);
- malformed input is **refused**, and destroys nothing (`[34]`, `[48]`);
- grade, condition, cert, ask, cost, archived, identity and `pendingFor` are all
  unchanged by a fulfilment (`[16]`), and no Opportunity appears.

The invariant holds in its exact form: the guard reasons about the photographs
the write will produce. `[20]` pins that structurally, including that **both**
sides of its comparison are normalised.

---

## 12. Command exposure

**21 → 22.** Added: `addCopyPhotos`, and nothing else.

Justified before exposing: owning-TP authorization, Collector refusal,
wrong-TP refusal, authenticated identity rather than payload injection, safe
malformed input, and HTTP parity with the domain — all in §I of the new suite.
Every transaction command remains unreachable (`[22]`, `[49]`), now with each
name checked against the command table so the list cannot quietly assert
nothing.

---

## 13. Durable-state proof

**No new durable fact. No migration. No second lifecycle.**

- `git diff --cached f464c5f -- persistence/` is empty; migrations still 13.
- `[23]` asserts no field-shaped occurrence of `acknowledged`, `fulfilment`,
  `photoTask`, `notified`, `requestStatus` or `photoUpload` anywhere in the
  domain, and that the request row's field set is exactly what it was.
- `[24]` runs the whole loop including the closed-copy case and validates the
  world.

One thing was added that is **not** a durable fact: a refusal code,
`photo-unusable`. Nothing is written, no lifecycle gains a state, and no
migration follows. It exists because the alternative — the coercion I wrote
first — destroyed data silently (§15).

---

## 14. Tests

**139 suites, 4,766 tests, 0 failures.** New suite
`tests/phase5-photo-request-fulfillment.cjs` — **50 tests**, registered in
`tests/all.cjs`, registration verified by experiment (removing the entry makes
the structural guard name the exact file).

| Section | Covers |
|---|---|
| A | only the owning shop may answer; no identity injection; no existence oracle |
| B | one object, one set of evidence; both faces; untouched faces; idempotence |
| C | a request outlives the copy's availability |
| D | the evidence stays protected |
| E | the two things that were not true |
| F | the transaction did not start; allow-list; no durable fact; True Match; four tabs |
| G | the shop's screen |
| **H** | **every adversarial finding** |
| **I** | **the whole loop over real HTTP** |

---

## 15. Adversarial findings and fixes

A subagent reviewed the finished, green batch and reproduced everything it
reported. **The first finding is my own error, and it is worse than the defect
it was fixing.**

### I swapped one defect for a worse one

My fix for "junk masquerading as evidence" was a **coercion** — normalise the
merged value to string-or-null. That turned `front: {}` from *junk that pretends
to be a photograph* into *junk that destroys one*:

```
before: {"front":"REAL-front.jpg","back":"b.jpg"}
addCopyPhotos front={}  ->  OK
after : {"front":null,"back":"b.jpg"}
```

A shop's only record of a card's condition, erased on a 200, through a door I
had just opened. And **my own test missed it because it only ever ran the junk
shapes against an empty copy** — it proved junk cannot fake evidence and never
that junk cannot destroy it. That is the same shape of mistake as a test written
to the behaviour I expected rather than the behaviour that matters.

Malformed input is now **refused**. An explicit `null` still means "there is no
photograph", and the guard still decides whether that erase is allowed (`[35]`).

### And the same coercion had a second victim

Normalising the *merged* value also destroyed a stored face the caller never
mentioned, and made a legacy non-string face read as a rewrite of itself — which
**refused the exact fulfilment case**, filling a genuinely empty face, leaving a
request that could never be answered:

```
NEW  supply the missing back: copy-committed      ← frozen
OLD  supply the missing back: OK
```

Not reachable through any door today, but `photos` lives in a jsonb column that
nothing validates on load, and the exposed `addInventoryCopy` spread caller
facts verbatim until one batch ago. Fixed by keeping the three jobs apart (§5).

### The rest

| # | Finding | Fix | Pin |
|---|---|---|---|
| 3 | **No archived check.** A shop could close every request on a card it had withdrawn — and an archived copy is invisible to the requester, so the record claimed evidence nobody could ever see | Refuses like the other three copy verbs; the request honestly stays open | `[39]` |
| 4 | **Re-pinning the closed-command loops removed the only HTTP assertion that a non-owner is refused**, with nothing in its place | §I added — the whole loop and every refusal over the real server | `[44]`–`[50]` |
| 5 | **A dead assertion**: `reviewCopy2` is not a command anywhere, so that line asserted nothing | Every name checked against the command table first | `[22]` |
| 6 | The screen called a requester whose relationship had ended *"A Collector you work with"* while holding their name in `counterparties` | Names them | `[40]` |
| 7 | Three clicks in one tick sent three writes (`working` is a stale closure) | A ref | `[41]` |
| 8 | A partial answer closed the form on success saying nothing, while the request stayed open | Says so | `[42]` |
| 9 | A refusal was worded *"would not save that correction"* | Photo-specific wording | `[43]` |
| 10 | An unbounded reference string persisted 200,000 characters | Bounded at this door | `[36]` |
| 11 | The `RetireCopy` doc comment was orphaned by inserting a function between it and its function | Moved | — |

Four of my own earlier tests (`[17]`–`[20]`) had to be **re-pinned to the new
design**. `[19]` is the one worth naming: it claimed photographs are "stored in
one shape at all three doors" and *passed* by finding a substring, while
`addCopyPhotos` had deliberately stopped storing a normalised value. A test that
passes on a substring after its sentence has become false is worse than no test,
so it now asserts what each door actually does and why they differ.

**Verified correct** by the reviewer and left alone: authorization in process and
over HTTP, including three injection attempts; the allow-list delta (`added:
['addCopyPhotos']`, no removals); fulfilment semantics, including that
`fulfilledAt` is written in exactly one place and no route closes a request
without `copyPhotographed`; closed-copy behaviour in full; photo integrity inside
a live deal; privacy, with no oracle found in wording or ordering; scope, with no
facelift and no migration; and — checked specifically — that a too-broad regex
which briefly deleted real `addCopyPhotos` call sites in tests left **no trace**:
`phase3-domain-readiness`, `phase5-b6`, `agree-price-card-context`,
`pursuit-ownership` and `copy-photos` all have zero diff against `f464c5f`.

---

## 16. Architecture check

- **Existing behaviour**: a trusted seller supplies better evidence about one
  specific card, because the buyer asked to see it properly.
- **Collector job**: "Is this specific copy worth continuing with?"
- **TP job**: "Show the Collector the evidence they asked for."
- **UX**: the Collector asks in Deal Flow; the shop answers from the inventory
  copy itself.
- **Durable owners**: the request is `photoRequests` (Open → Fulfilled); the
  photographs are the inventory copy's `photos`; the copy is `inventory`.
  Fulfilment is a field on the request, not a record of its own.
- **New fact vs derived interaction**: **no new durable fact.** One refusal code,
  which is not one.
- **Why below React**: ownership, the mutation guard, and the fulfilment rule are
  all in the domain and all proved over HTTP. The screen cannot grant itself the
  shop's seat, cannot rewrite protected evidence, and cannot close a request —
  it can only ask, and be refused.
- **Pre-pilot proof**: exact match → inspect → request evidence → the seller
  supplies it → the Collector receives it, with no negotiation anywhere in it,
  and still working when the copy closed in between.

---

## 17. Completion gate

```
$ node tests/all.cjs
ALL SUITES PASSED          139 suites · 4,766 tests · 0 failures

$ npm run prod     → PRODUCTION BUILD OK — bytes: 343337 → 343529
$ npm run smoke    → PROD SMOKE OK — rendered 83686 chars
$ npm run build:app --allow-unconfigured → main.js 317,825 bytes
```

Confirmed: no unintended durable fact; no Opportunity created; no availability,
price or Pending change; participant-aware visibility intact; True Match
unchanged (`[25]`); four Collector tabs unchanged (`[25]`); world valid and
storable (`[24]`); and the TP change is one control on one row, not a facelift.

---

## 18. Changed files

| File | Change |
|---|---|
| `domain/metyet-commands.js` | `addCopyPhotos`: ownership before existence, archived refusal, face validation, merged value preserved, guard and completeness on the normalised view; `unusableFace` |
| `domain/metyet-domain.js` | one refusal code, `photo-unusable` |
| `server/exposed-commands.js` | 21 → 22 |
| `client/commands.js` | `provideCopyPhotos` |
| `client/tp/sections/Inventory.jsx` | the tag, the Photos fact, one control, `ProvidePhotos`, photo-specific refusal wording |
| `client/tp/present.js` | `photoNote` (the same sentence the Collector reads) |
| `client/tp/TrustedPartnerShell.jsx`, `production-app.jsx`, `sign-in/SignIn.jsx` | prop wiring |
| `tests/phase5-photo-request-fulfillment.cjs` | **new**, 50 tests |
| 16 existing suites | re-pinned, each with its reason in place |

**25 files, +1,362 / −43.** `persistence/` untouched.

---

## 19. Deferred work

Per the brief: no TP facelift, Inventory or Browse redesign; no demand
visualisation or counts; no CSV or import work; no inventory architecture
change; no task centre, notifications or messaging; no Agree Market Value or
naming cleanup; no `startOpportunity`, price proposal, Pending controls,
reservation, transaction construction, trade selection, final agreement or
handoff UI; no PC; no fuzzy/range matching; no recommendations; no
species/generation Browse; no broad Collector redesign.

---

## 20. Risks and debt

- **A photograph is a link, not a file.** MetYet stores one string per face and
  has no storage, media service or upload endpoint anywhere. The shop pastes an
  address, and the screen says so rather than pretending to be a file picker.
  This is the largest honest gap in the loop: it works, and it is not what a
  shop on a phone in a card shop will want. Real upload is an infrastructure
  project, and §8 of the brief was right to keep it out of this batch.
- **A face reference is bounded only at this door.** `updateInventoryCopy`'s
  `photos` path still accepts an arbitrarily long string. Fixing it there means
  a second validation rule in a command that assigns wholesale; recorded rather
  than done inconsistently.
- **A legacy non-string photograph can still read as evidence to
  `copyPhotographed`** if it was written before normalisation existed, since the
  raw value is deliberately preserved. It no longer closes a request (the
  completeness test reads the normalised view) but it will render oddly. No
  exposed door can create one today.
- **`fulfilledAt: at || null`** — pre-existing. Under a runtime that omits `at`,
  a copy becomes fully photographed while the request stays open forever and
  `requestPhotos` will not mint a replacement. Production is on an authoritative
  clock.
- **Requests are never garbage-collected**, and a request on a copy the shop
  later archives now stays open permanently — which is the honest outcome of the
  archived fix, but it is still a row nobody can close.
- **An ended relationship does not cancel an outstanding request.** The shop may
  still answer it and the ex-Collector will never see the evidence. Pinned as
  correct (`[4]`) because the shop owns the card, but it is a wart.

---

## 21. Recommendation for the next smallest Collector-side batch

The loop is closed, so the runway returns to the Collector as the brief says.
The next smallest honest step:

> **Let the Collector act on the evidence: an explicit "keep looking" or "not
> this one" on a copy they have inspected.**

The argument for it is what this batch just made observable. A Collector can now
inspect a copy, ask for evidence, and receive it — and then the product has
nothing for them to do with the answer except leave the review open forever.
`endReview` exists and is exposed, but "I have decided against this copy" and "I
stopped looking at this copy" are the same gesture today, so Deal Flow cannot
tell a Collector which copies they have already considered and rejected. That is
a derived-view batch over existing durable facts, not a new concept.

It is also the last piece of qualification that does not touch valuation, which
makes it the right thing before Agree Market Value — the first genuinely
transactional step, and one worth starting from a clean qualification surface
rather than an ambiguous one.

Explicitly **not** recommended next: Agree Market Value or Pending (transaction),
and photo upload infrastructure (a project, not a batch).
