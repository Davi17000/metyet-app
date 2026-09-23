# MetYet — Phase 5 C5: The Shop Can Fix Its Own Shelf

## 1. Baseline

Branch `phase-5-c5-tp-inventory-correction`, cut from
`dc2fd2582203689e3372363452b7ad8a266cfacc` — the merge of PR #71 (C4). The gate
matched exactly before anything changed:

```
129 suites / 4,255 tests      ALL SUITES PASSED
PRODUCTION BUILD OK — bytes: 345,079
PROD SMOKE OK — rendered 83,686 chars
newest migration: 0013_binders.sql
allow-list: 16
```

Tracked worktree clean.

---

## 2. What was implemented

The post-C4 checkpoint named one pre-pilot batch, and this is it. A Trusted
Partner could add inventory and never touch it again — and that was not a rough
edge, for a reason worth restating because it is what made this a blocker rather
than a nicety:

A copy leaves live supply only by being archived, or by its derived status
ceasing to be `available`. That status comes entirely from opportunities
(`domain/metyet-projection.js:456`), and the whole deal lifecycle is
deliberately shut. So a production inventory row could never be anything but
available; `archived` could be set by no command a person could reach; and there
is no command anywhere in the domain that ends a relationship. **A card sold over
the counter went on telling a Collector that a shop they trust has it,
indefinitely, and the only lever that stopped the wrong answer was the Collector
giving up their own Goal.**

Five changes, in the order they matter:

1. **Two existing commands exposed and bound** — `updateInventoryCopy` and
   `removeInventoryCopy`, written and tested in Batch 6, shipped without a
   screen.
2. **Edit and Remove on the Trusted Partner Inventory screen.**
3. **The consent language corrected** — two strings promised a partner sees "the
   cards in your Trade Binder".
4. **The anonymous holder count removed** from Card Specification.
5. **A goal-saved confirmation**, and a role-neutral loading sentence.

No migration, no domain change, no new concept. `0013_binders.sql` is still the
newest migration and the domain still holds 49 commands.

---

## 3. The allow-list: 16 → 18

`server/exposed-commands.js`:

```js
"updateInventoryCopy",         // TP → Inventory, correcting a copy's facts
"removeInventoryCopy",         // TP → Inventory, "Remove from inventory"
```

Nothing else joined. `A. the door opened by exactly two` proves it four ways:
the count is 18; both names are present; thirteen dormant commands — the deal
lifecycle, `resolveCardIdentity`, `addCopyPhotos`, `reviewCopy`,
`inviteCollector` — are each asserted to be real commands *and* refused
`command-unavailable` over HTTP; and the set added is measured against
`git show dc2fd25:server/exposed-commands.js` rather than against a literal, so
a nineteenth command cannot be admitted by editing an expectation.

The file's header also said "forty-eight commands… the product offers nine",
written by Batch 8.1 and stale by two batches. Corrected to forty-nine and
eighteen, with a note saying why the numbers moved.

**Client bindings** (`client/commands.js`), following the rule this file has
always had — only it names a command:

```js
export function correctInventoryCopy(target) { … target.execute("updateInventoryCopy", { invId, patch }); }
export function retireInventoryCopy(target)  { … target.execute("removeInventoryCopy", { invId }); }
```

Two bindings, not one, for the same reason `updateOwnedCopy` and
`removeOwnedCopy` are separate on the Collector's side: "I was wrong about this
copy" and "I no longer have this copy" are different claims, and one command
would make correcting a certificate look like taking a card off the shelf.
Bound in `SignIn.jsx`, passed through `production-app.jsx` and
`TrustedPartnerShell.jsx` as `onEditCopy` / `onRetireCopy`. No product surface
spells either command name — asserted.

---

## 4. Edit: the UX, and which fields

Every live copy carries **Edit**. It opens in place, pre-filled with what the
copy already says, and offers the same five questions the add flow asks:

| Field | Why it is here |
|---|---|
| Grade | The add flow states it; a grader changes it |
| Condition | Shown only for a raw copy, exactly as when adding |
| Certificate | The commonest typo on the screen |
| Ask | The commonest thing that changes |
| What it cost you | Partner-private, and mistyped as easily as anything else |

**Why five and not eight.** `updateInventoryCopy` will also accept `note`,
`acquired` and `photos`. None has a control anywhere in this product — `note`
and `photos` are rendered nowhere, and `acquired` is rendered but has never been
settable, because the add flow does not collect it. Giving any of them an
edit-only control would mean inventing a workflow in the batch whose entire
point is that a shop can fix what it already typed. **Left out means untouched**:
a patch carries only the keys it names, so a correction leaves a copy's note,
photographs and acquisition date exactly as they were. Asserted twice — once at
the domain level and once by pressing Save on a rendered form.

The edit guarantees, each pinned:

- **Same `invId`** — the command spreads over the found row and the patch cannot
  name one.
- **Card identity preserved** — `canonicalCardId`, `cardId`, `partnerId` and
  `invId` are refused inside a patch (`identity-immutable`), and the payload
  this form builds contains none of them.
- **Unexposed fields preserved** — see above.
- **Server validation** — the client asks the raw/graded question first as a
  courtesy so a partner is told *which* control to fix, and the domain refuses
  the same payload whether or not that line exists. `grading-incoherent` is
  checked against the **merged** record, so patching `grade: "PSA 9"` onto a
  stored `Raw / Near Mint` copy is refused, exactly as C3.2 intended.
- **Cancel writes nothing** — there is one `await` in the component and it is
  behind Save.
- **Return to Inventory on success** — the store adopts the returned projection,
  the form closes, the corrected row is already on screen.

**Shared code, and why it is not over-abstraction.** Adding and correcting ask
the same five questions, so they ask them through one `useCopyFacts` hook and
one `CopyFactFields` component. That is not tidiness: C3.3 found the raw/graded
rule implemented three times in this repository, and every copy of it read a card
saying both "PSA 9" and "Damaged" as a clean PSA 9. A fourth implementation on a
correction screen would have been the same bug with a new address. A test counts
the implementations and requires exactly one of each.

---

## 5. Remove: the UX, and archive semantics

Every live copy carries **Remove from inventory** — the shop's sentence.
`archived` is the database's, and nobody should have to learn it.

Pressing it sends nothing. It opens a question that names the card and its set,
says who stops seeing it, and offers two differently-labelled buttons:

> **Remove this copy from your inventory?**
> Charizard · Base · #4
> Collectors in your network will stop being told you have this one. MetYet keeps
> the record — it just stops counting as a card on your shelf. If you get
> another, add it again.
> **[Remove it]  [Keep it]**

**It is an archive.** `removeInventoryCopy` sets `archived: true` and keeps the
row with its certificate, cost and dates. Nothing in MetYet hard-deletes a copy,
and C5 did not add the first thing that does — asserted, along with the fact that
re-retiring is byte-identical and a patch of `{ archived: false }` is ignored,
so the screen cannot un-archive by a side door either.

**No undo, deliberately.** There is no un-archive command in the domain. A shop
that retires a copy by accident adds it again, which is the same physical act
they performed the first time. Half a restore would have been worse than the
honest absence.

---

## 6. Discovery before and after a removal

The batch acceptance criterion, run end to end over the real HTTP app:

| | Collector's view | Partner's view |
|---|---|---|
| Goal set, shop stocks the card | 1 discovery, `partnerId: p1`, `copies: 1` | 1 overlap |
| Shop presses Remove → confirms | **0** | **0** |
| The row itself | still present, `archived: true`, cert intact | still projected to its owner |
| The Goal | untouched — same id, same tier, same criteria | — |
| The shop's other copies | untouched | — |

Both seats lose the answer on the same read, because Discovery is derived and
stored nowhere (`domain/metyet-discovery.js`). Nothing about the Goal changes:
what ended is the supply, not the want.

One observation recorded rather than fixed: a correction still succeeds on an
archived copy, because archiving is a fact about the copy and not a lock on it.
The domain says so and C5 did not change it; a test pins the behaviour so that a
later batch changing it does so on purpose.

---

## 7. Multiple copies

| Action | Overlap | `copies` |
|---|---|---|
| Two available copies of the wanted card | 1 | 2 |
| Remove one | **1** | **1** |
| Remove the last | **0** | — |
| Correct a copy instead of removing it | 1 | **2** |

The last row is the one worth having: correcting is not removing, and a batch
about correcting grades is exactly the batch where a count might quietly start
depending on one.

Also pinned here, because this is where somebody would be tempted: **criteria
still do not filter Discovery.** A Goal asking for a PSA 9 still discovers a
shop's heavily-played raw copy of the same card, and correcting that copy's
grade does not end the overlap. That is C3.2's decision and C5 did not revisit
it.

---

## 8. Authorization

Eight proofs over the production HTTP path, plus the checkpoint's missing pin.

| Proof | Result |
|---|---|
| Owning shop corrects and retires its own copy | 200, 200 |
| Another Trusted Partner tries both | `not-owner`; the ask and `archived` unchanged |
| A Collector tries both (two different Collectors) | `not-owner` for all four |
| Fabricated / malformed copy ids (`""`, `null`, `42`, an object) | `not-found`, and the refusal body carries no certificate and no ask |
| A patch naming `canonicalCardId`, `cardId`, `partnerId` or `invId` | `identity-immutable`; card, shop and copy unmoved |
| The grading rule, checked against the merged record | `grading-incoherent`, nothing written |
| Bad amounts | `invalid-amount`, the stored ask survives each |
| A related Collector after a correction | sees the new ask; `cost`, `acquired`, `note` absent from the row and from the whole response body |

**And the pin the post-C4 checkpoint asked for.** That checkpoint found that
`updateGoalCriteria`'s ownership clause was enforced but unpinned — every test
exercising the refusal used a Trusted Partner actor, tripping only the seat half
— and proved it by mutation: the clause deleted, all 4,255 tests still passed.
Section I now uses a second Collector, `dana`, against `casey`'s Goal, and does
the same for `updateGoalTier` and `removeGoal`. No implementation changed; the
code was always correct.

---

## 9. The consent correction

Two user-visible strings said a partner would see "goals you set and the cards
in your **Trade Binder**". Wrong twice: the Trade Binder stopped existing in C2,
when owning and offering became two facts; and a partner has never received a
Collector's cards merely for being owned.

What the projection actually does — Goals of Collectors in the partner's network,
copies those Collectors marked `offered`
(`inSupply: inNetwork(b.collectorId) && b.offered === true`), and nothing of
binders (`binders: []`, an explicit empty). Now said:

> Accepting adds you to Northline's Collector Network. From then on they can see
> the goals you set, so they know what to look out for, and any of your cards you
> choose to offer for trade or sale — along with your name. Cards you own but
> haven't offered stay private, and so do your binders. Nothing is shared with
> any other shop.

The post-join banner in `CollectorShell.jsx` carries the short form of the same
promise.

**One correction the adversarial pass forced.** My first version ended "Nothing
else about you is shared", which the projection contradicts:
`COLLECTOR_FOR_PARTNER` carries a Collector's name, short name, city and
preference tags to their whole network. No exposed command can set the last
three, so the sentence was true of the product and false of the code — the wrong
side of that line for a disclosure. It now names the one a person would expect,
and makes no absolute.

**The regression pin does not test the wording.** The old pins matched the
sentence word for word, which is precisely how they froze a disclosure that had
been wrong since C2 — an exact-copy assertion cannot tell a rewrite from a
regression. The new pins ask for the substance (Goals, offering as a choice,
what stays private, binders mentioned, the absolute absent) and forbid
`/Trade Binder/i` outright, across six production files.

---

## 10. The holder count

`Card Specification` said "*N* of your Trusted Partners have this" and named
none of them. Removed, with its plumbing: `holdersOf` in `Browse.jsx`, the
`holders` prop, and the `mcs-spec-net` stylesheet rule.

Three things were wrong with it:

- **Anonymous where everything adjacent is named.** The Trusted Partners section
  says "Northline has a card you're looking for". A bare number beside that is a
  weaker answer to a question nobody asked.
- **Inconsistent by entry point.** `holders` was passed only from Browse, so the
  same panel opened from Binder or Your Cards showed nothing. One card, one
  person, two answers depending on the door.
- **A different question.** It answered "who has it"; every named answer in the
  product answers "who has something you asked for", which needs a Goal. The two
  could disagree without either being wrong.

Nothing depended on it: presentation only, computed from rows the server had
already sent, read by no command, step or stored fact.

**Pinned by rendering, not by grepping.** The source assertions are there, but
the load-bearing test opens the real panel through Browse, chooses a printing —
the count only ever appeared once one was chosen, so a test that stopped at the
chooser would have asserted the absence of something that was never going to be
present — and asserts the panel reached both the goal and copies sections before
asserting the silence. Verified by reintroducing the count: the test fails.

C1's own test, which asserted the count's presence, was rewritten rather than
deleted. Its load-bearing half — that a partner's ask, cost, certificate and name
do not reach a Collector through Browse — survives verbatim.

---

## 11. Goal-save feedback, and the loading sentence

**Done, in the panel.** On a commit whose finished steps include
`start-looking`, the panel holds open and says one sentence:

> Saved. Your Trusted Partners can see this goal, so they know to look out for it.

or, when the Collector has no partners yet:

> Saved. When you join a shop's Collector Network, they'll see what you're
> looking for.

It is not a confirmation screen: the panel is already open, the button row it
replaces is the same row, and nothing is stored, queued or announced. It names
no shop and claims nobody has looked — asserted against seven phrases it must
never contain. The empty-network variant exists because "your Trusted Partners
can see it" is a promise to nobody when the network is empty.

**A defect the adversarial pass caught here.** The first version left every
control live behind the confirmation, so a person could tick a binder or add a
copy after the sentence, press Done, and lose it silently — the panel closed
without a second commit and nothing said so. Before C5 a successful commit
closed the panel, so that state did not exist. The panel now freezes once it has
said something landed (`locked = saving || !!saved`), with the header close
deliberately exempt so a confirmation is never a panel you cannot leave.

**The loading sentence.** "Signed in. Loading your shop…" was shown to
Collectors too, who do not have one — the last thing they read before the app
appeared. It is now "Signed in. One moment…". Role-neutral rather than branched,
because the seat arrives with the projection that step is fetching.

---

## 12. Deviations and reasoning

**1. Five editable fields, not eight.** §4. The brief said to use the command's
patch allow-list as authority and to leave out anything lacking an existing
workflow; `acquired` falls in the same category as `note` and `photos` — it is
rendered but has never been settable — so it is left out on the same principle
rather than given an edit-only control the add flow cannot match.

**2. The add flow was refactored, not just extended.** The brief said to reuse
existing form code "where clean, but do not force abstraction". Extracting
`useCopyFacts` and `CopyFactFields` changes the add path, which is more than
strictly necessary. Justification: the alternative was a fourth implementation of
a rule that had already been wrong three times, and the test that counts
implementations is the point of the change rather than a side effect.

**3. `server/exposed-commands.js`'s header numbers were corrected.** Not asked
for. They were stale by two batches — "forty-eight commands… the product offers
nine" against 49 and 18 — and a reader checking any claim about the allow-list
against that header would have found them disagreeing. One paragraph, no
behaviour.

**4. Three existing "byte-identical" pins were re-scoped.** §13.

**5. `--dry-run` still requires `DATABASE_URL`, the catalogue is still not
reportable, and neither was touched.** Both were C-class findings in the
checkpoint; neither is this batch.

---

## 13. Adversarial findings and corrections

A full adversarial review ran against the first green build. It found **two real
product defects, five weak or vacuous tests, and one false claim in my own
copy.** Each is recorded because the batch is better for them.

**Product defects, both fixed and both now mutation-proved:**

1. **A no-change Save destroyed a stored condition.**
   `{ grade: null, condition: "Near Mint" }` is a legal copy — `gradingProblem`
   accepts it, the shelf renders it, and it crosses to related Collectors. The
   form shows a condition control only for a raw copy, so opening Edit on such a
   copy and pressing Save with nothing touched sent `condition: null` and the
   fact was gone. The payload was re-deriving a domain rule from *form* state
   instead of carrying what the copy already said. Fixed by omitting the key
   whenever the grade is unstated. **The general rule this produced: a form may
   only speak for the fields it actually showed.**

2. **A numeric certificate was wiped by being looked at.** `factsOf` read the
   copy through `text()`, which answers null for anything that is not a string;
   the API accepts a numeric `cert`. The form showed an empty box and Save wrote
   the emptiness back. Fixed with a coercion that can represent everything a
   record can hold. A numeric cert now normalises to the digits it always
   displayed as.

Both are the same class — data destroyed by opening a form — and neither was
visible to any source-level assertion.

**My own tests, corrected:**

3. **Five vacuous assertions.** A slice ran from `setSaved(` to the *first*
   `setSaving(false);`, which occurs earlier in the file, so the slice was empty
   and five claims about what the goal sentence must not say passed against
   nothing.

4. **The headline UI had no rendered coverage at all.** Edit, the pre-fill, the
   patch, the two-press confirmation and the refusal wording were covered by four
   regexes over source. The reviewer's mutation makes the point: wiring Remove
   straight to the command with no confirmation left every assertion passing.
   Section F2 now presses the real controls — seven tests — and would have caught
   defect 1 on the first run.

5. **A test that restated the one above it**, with a comment claiming to read the
   baseline while comparing against a hardcoded `16` three lines below an
   assertion that the list is 18. Now reads `git show dc2fd25:…`.

6. **A comment claiming the panel was opened from two doors.** It opens from
   one. Corrected to say which, and why the other cannot regress.

7. **A vacuous check I caught myself**, before the review: an assertion that
   `mcs-spec-net` is absent from `dist/MetYet.prod.js` — which is the prototype
   bundle, built from `src/MetYet.jsx`, and never contained it.

**And one false claim in the product copy:** "Nothing else about you is shared",
contradicted by `COLLECTOR_FOR_PARTNER`. §9.

**Confirmed clean by the review**, each checked against running code rather than
source: edit never replaces a copy; remove never deletes; an archived copy
cannot produce an overlap on either seat; multi-copy counts are exact; cross-TP
and cross-Collector mutation is refused at every route including envelope-level
spoofing; private fields do not leak through a correction or a refusal body; the
confirmation cannot be bypassed; and nothing changed that the brief excluded.

**One mistake of mine worth recording.** Midway through, I used `git checkout --`
to undo a scratch mutation on a file that also held uncommitted C5 work, and lost
all of that file's edits. I reapplied them and re-verified. The lesson is
mechanical: back a file up before mutating it, never revert one with uncommitted
work in it.

---

## 14. Verification

```
130 suites / 4,317 tests      ALL SUITES PASSED
PRODUCTION BUILD OK — bytes: 345,079
PROD SMOKE OK — rendered 83,686 chars
newest migration: 0013_binders.sql
allow-list: 18
```

**62 tests** in `tests/phase5-c5-tp-inventory-correction.cjs`, over real PGlite
and the real Fastify app, in ten sections: the door (4), authorization (8),
correcting (5), taking one off (6), more than one (5), the client boundary (6),
the controls pressed (7), what the product says (9), nothing else moved (9), and
the checkpoint's missing goal-criteria pin (3).

Build and smoke are unchanged, and that is itself worth stating plainly rather
than reporting as a pass: `prod.build.mjs` builds `src/MetYet.jsx`, the
prototype. **It does not cover the production client at all**, and `npm run
verify` does not run `build:app`. The production client is exercised by suites
that compile it with esbuild and render it — which is why C5's load-bearing UI
assertions are rendered ones. There is no byte-size gate on the production
bundle; that is pre-existing and is not something this batch invented or fixed.

**Expected properties, each confirmed:** no persistence migration (`git diff
--name-only dc2fd25 -- persistence/` is empty); no new API surface beyond the
two commands through the existing endpoint; no route writes inventory; no
provider or network dependency; no Opportunity command exposed; no
`pokemon_cards.json` dependency and the file untouched; no dependency added.

**Preserved pins, re-run:** binder privacy; relationship-scoped Goal visibility;
relationship-scoped Discovery; no cross-Collector leakage; TP-private inventory
fields; no provider ids in product state; catalogue import unreachable from a
browser; criteria as context rather than a Discovery filter; offered separate
from owned; TP inventory separate from CollectorCopy.

---

## 15. Files changed

23 files, +861 / −198.

| File | Lines | What |
|---|---|---|
| `client/tp/sections/Inventory.jsx` | +360 / −82 | Edit and Remove, the shared fact form, the refusal sentences |
| `client/collector/CardSpecification.jsx` | +95 / −30 | holder count removed; goal-saved sentence; the panel freezes once it has confirmed |
| `client/sign-in/SignIn.jsx` | +41 / −4 | two bindings; the consent sentence; the loading line |
| `client/commands.js` | +33 | the two bindings |
| `client/collector/sections/Browse.jsx` | +12 / −19 | `holdersOf` and its plumbing removed |
| `client/collector/CollectorShell.jsx` | +12 / −2 | the join banner; the saved-line style; the orphaned rule removed |
| `client/tp/TrustedPartnerShell.jsx` | +7 / −2 | the callbacks through to Inventory; the row-actions style |
| `client/production-app.jsx` | +6 / −4 | two props to the TP seat only |
| `server/exposed-commands.js` | +30 / −5 | two entries, and the stale header numbers |
| `domain/README.md` | +74 | the decision trail |
| `tests/phase5-c5-tp-inventory-correction.cjs` | 1,110 (new) | 62 tests |
| `tests/all.cjs` | +1 / −1 | registration |
| 12 existing suites | +190 / −49 | see below |

**All twelve existing-suite changes, and why none is a weakened pin:**

| Suite | Change | Judgement |
|---|---|---|
| `phase3-server` | `updateInventoryCopy` now asked at the door instead of past it | **Stronger** — adds an HTTP `not-owner` check that did not exist; the direct-domain assertion is untouched |
| `phase5-b6` | Two tests moved from "proved shut over HTTP" to "asked over HTTP"; the now-unused helper removed | Legitimate — the closure was the thing that changed. The rules are Batch 6's, unedited |
| `phase5-b3`, `b3b` | Exact-copy disclosure pin → five semantic pins | **Stronger** — the old pin had frozen a disclosure wrong since C2 |
| `phase5-c1` | Holder-count test inverted; door list gains two | Legitimate — behaviour changed. The load-bearing half survives verbatim |
| `c2`, `c31`, `c32`, `c33` | 16 → 18 plus two names in a sorted list | Bookkeeping |
| `c4`, `c34b`, `c35` | "byte-identical to my branch point" re-scoped to name both of that batch's own ends | See below |

**On the three re-scoped pins.** Each said "*this* batch opened no door" by
comparing the working tree against its own branch point — true only while no
later batch was permitted to open one. C5 is permitted to open two. Each now
compares that batch's branch point against that batch's own merge, which states
the same fact permanently and would still fail if that batch were rewritten. The
honest caveat, which the review was right to press on: these are now assertions
about history, not about the working tree. The live surface remains guarded by
the full sorted-list pins in six other suites plus C5's own, and `c34b`'s
"a door C3.3 opened was closed" check — the one that genuinely lost reach — was
restored against today's list.

---

## 16. Remaining debt

| Debt | Status |
|---|---|
| `note`, `acquired` and `photos` have no control | Deliberate (§4). They survive a correction untouched |
| Amounts are read through `Number(...)`, so `true` arrives as 1 and `[]` as 0 | Batch 6's coercion, on both inventory doors. C5 exposed a second door onto the same rule and did not widen it; pinning a stricter behaviour would pin a rule that does not exist |
| A contradictory legacy copy is silently "repaired" by a Save | A pre-C3.2 `PSA 9` + `Damaged` row shows a "Says…" tag; Edit shows only the grade and Save drops the other half without announcing it. This is what `updateCollectorCopy` was exposed for on the Collector side, so it is the intended outcome — but it is the product picking a side unannounced, and it is written down here rather than defended |
| A correction still succeeds on an archived copy | The domain's behaviour, now pinned so a change is deliberate |
| No un-archive | No such command exists; adding half a restore was out of scope |
| `archived` is tested three ways across the codebase (`!== true`, truthy, truthy) | Pre-existing; they would disagree only on a non-boolean, which nothing writes |
| No byte-size gate on the production client bundle | Pre-existing; `verify` does not run `build:app` (§14) |
| Everything the post-C4 checkpoint classed C, D or E | Untouched, as intended — including the catalogue not being reportable and `--dry-run` needing `DATABASE_URL` |

---

## 17. Pilot-readiness impact

The post-C4 checkpoint named two hard blockers. **This batch clears the second
of them.**

**Scenario S5 now passes without database intervention**, which was the stated
acceptance criterion:

- **S5a — wrong fact.** A shop adds a copy, opens Edit, corrects the grade,
  certificate and ask, saves. Same `invId`, same card, corrected facts on screen,
  nothing private leaked to the Collector.
- **S5b — sold or no longer held.** A Collector's Goal and a matching copy
  produce a named discovery on both seats; the shop presses Remove and confirms;
  the row is archived rather than deleted; the discovery is gone from both
  views; the Goal is untouched.

The founder no longer needs to reach a database to fix a shop's typo or withdraw
a copy that has left the shelf. The scenario that was designed to fail now
passes.

**What still blocks a pilot: the first blocker, which is not code.** There is no
approved card data in the production catalogue. A freshly migrated database holds
zero canonical cards; the route refuses any Goal naming a card that was not
imported (`card-unavailable`), and the foreign key refuses it underneath. No
Goal, no Discovery, no loop. The C4 runner works and a four-record import was
shown to produce a working loop end to end — what is missing is permission and a
dataset, not a batch.

So: **the code side of pilot readiness is done.** The remaining item is the data
question, and until it is answered there is nothing further worth building.

---

## 18. Hand-back

| | |
|---|---|
| Branch | `phase-5-c5-tp-inventory-correction` |
| Baseline | `dc2fd2582203689e3372363452b7ad8a266cfacc` (PR #71 merge) |
| Files | 23 changed, +861 / −198 |
| Allow-list | **16 → 18** |
| Suites / tests | 129 / 4,255 → **130 / 4,317** |
| Build | 345,079 bytes (unchanged — prototype bundle, §14) |
| Smoke | 83,686 chars (unchanged) |
| Migration | none; `0013_binders.sql` still newest |
| Domain commands | 49, unchanged |
| New files | `tests/phase5-c5-tp-inventory-correction.cjs` |
| Report | `Claude outputs/MetYet_Phase5_C5_TP_Inventory_Correction_Implementation_Report.md` |

**Not merged.** Left intact for review.
