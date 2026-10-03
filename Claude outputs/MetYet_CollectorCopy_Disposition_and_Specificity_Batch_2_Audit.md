# MetYet — CollectorCopy Disposition + Specificity — Batch 2 Pre-Implementation Audit

**Nothing was implemented.** No file in the repository was edited. Worktree clean at `03d40a1`, branch `phase-5-four-state`, `eaf446c` (Batch 1) present.

Tags: **[F]** repository fact, verified by reading or by running the code; **[P]** closed product decision, taken from the brief; **[R]** recommendation.

---

## 0. The three findings that should change how Batch 2 is framed

### 0.1 "Legacy stateless copies" are not legacy. They are being created right now.

**[F]** Migration `0012_collector_copy_offered_backfill.sql` backfilled every pre-C2 row to `offered: true`, and says exactly why: *"a row with no `offered` key is not an unknown; it is a row from a world where the answer was always yes."* Its `where attrs -> 'offered' is null` clause deliberately left explicit `false` alone.

So the undecided population — `offered: false`, no `keeping` key — is **not** historical residue. It has three live sources, all current:

1. `client/commands.js:274-277` — `addOwnedCopy` defaults `offered = false, keeping = false`. **Every** copy added without a stated disposition arrives at the domain as that explicit pair and is written stateless.
2. `CardSpecification.jsx:103` — the `"Haven't decided"` button, which is `BLANK_COPY`'s default (`:107`) and the *third* option in the row.
3. Every withdrawal: `setCollectorCopyOffered(false)` and `setCollectorCopyKept(false)` both land on `offered: false` with no `keeping` key. Verified by running both.

**Why this matters for the batch.** The brief frames the problem as tolerating old data. The actual problem is a tap that is still running. Batch 2 closes the tap; what is left afterwards is a finite set created between C2 and Batch 2, which is exactly the set a later census must size. Framing it as "legacy tolerance" risks building the tolerance and leaving the tap on.

### 0.2 The Batch 1 defect exists verbatim in the disposition field, and is worse

**[F]** Verified by direct execution against `domain/metyet-commands.js`:

```
bare canonical id              {"canonicalCardId":"cc-x","id":"b1","offered":false,"addedAt":"2026-10-01"}
offered:false keeping:false    {"canonicalCardId":"cc-x","id":"b2","offered":false,"addedAt":"2026-10-01"}
offered:"yes"                  {"canonicalCardId":"cc-x","id":"b3","offered":false,"addedAt":"2026-10-01"}
keeping:"yes"                  {"canonicalCardId":"cc-x","id":"b4","offered":false,"addedAt":"2026-10-01"}
keeping:null                   {"canonicalCardId":"cc-x","id":"b5","offered":false,"addedAt":"2026-10-01"}
both true                      REFUSED disposition-conflict
```

`offered: "yes"` — someone trying to offer a card — is silently written as a copy with no disposition at all, with a 200. `offered === true` (`metyet-commands.js:980`) and `keeping === true ? …` (`:981`) are the same shape as `tier === "primary" ? "primary" : "secondary"`: a coercion wearing a validation's clothes.

It is worse than the tier case in one respect. The two **setters** already refuse a non-boolean (`metyet-commands.js:1032`, `:1064`), so the identical input is refused on the switch and coerced at birth. One field, two boundaries, opposite answers.

### 0.3 This repository has already answered the specificity question once, and the answer is "not at birth"

**[F]** `metyet-commands.js:943-948`, on photographs: *"AND A PHOTOGRAPH IS NO LONGER THE PRICE OF ADMISSION… the moment it applies is when the copy enters a trade package, not when its owner writes it down."* `copyPhotographed` is required at `proposeTradeSelection` (`:1759`), not at `addCollectorCopy`.

That is the same question §6 of the brief asks about grade and condition, already decided, with the reasoning written down. **[R]** Batch 2 should follow it rather than relitigate it: requirements attach where they are needed, and the only fact needed *at birth* is the one that cannot be deferred without the record being a lie about intent.

---

## 1. SHA and worktree inspected

| | |
|---|---|
| Branch | `phase-5-four-state` |
| HEAD | `03d40a1` — Docs: Goal tier explicit choice — Batch 1 hand-back |
| Implementation commit | `eaf446c` — present, as the brief expected |
| `git status --porcelain` | empty |
| Full suite at this SHA | 142 suites, 4,846 assertions, 0 failed (from the Batch 1 run) |

---

## 2. CollectorCopy creation-path inventory

**[F] There is exactly one writer.** `domain/metyet-commands.js:983` is the only statement anywhere that appends to `state.collectorCopies`. No production path bypasses `addCollectorCopy`. The five statements that touch the collection at all are `:983` (add), `:1015` (update), `:1040` (offered), `:1068` (kept), `:1093` (remove), and all five are owner-gated. **No transaction or Opportunity flow can bring a copy into existence** — deal code only reads copies (`:1365`, `:1723`, `:1759`).

### Production paths

| # | Call site | Layer | Identity | Grade | Cond. | Cert | Lang/print | Disposition | Card-id only? |
|---|---|---|---|---|---|---|---|---|---|
| P1 | `metyet-commands.js:949-984` | domain — sole writer | `canonicalCardId` XOR legacy `cardId`; refuses both, refuses neither | never required | never required | **never validated at all** | not a field | `offered: offered === true`; `keeping: true` only if literally `true` | **yes** |
| P2 | `client/commands.js:274-277` (`addOwnedCopy`) | production client | `canonicalCardId` only | defaults `null` | defaults `null` | defaults `null` | not sent | **sends both as `false` by default** | **yes** |
| P3 | `client/sign-in/SignIn.jsx:243` | production client dispatcher | injects the panel's `canonicalCardId` | passthrough | passthrough | passthrough | not sent | passthrough | **yes** |
| P4 | `CardSpecification.jsx:188-202`, executed `:443` | production client plan | none — panel prop | `draft.grade \|\| null` | `isRaw(grade) ? … : null` | `draft.cert \|\| null` | never | `offered: d === "offered"`, `keeping: d === "keeping"` — both false for `"unstated"` | **yes** |
| P5 | `server/exposed-commands.js:74` → `server/app.js:454-491` | production server | checks `payload.copy.canonicalCardId` exists in the catalog → `card-unavailable` | not inspected | not inspected | not inspected | not inspected | not inspected | **yes** |
| P6 | `persistence/world-repository.js:204-282` | persistence | `card_id` / `canonical_card_id` are mirror columns; truth in `attrs` | `attrs` | `attrs` | `attrs` | not stored | `attrs` | n/a — creates none |

**[F] The row shape** (`metyet-commands.js:963`, `:980-983`):

```js
const { id: askedId, addedAt: askedAt, updatedAt, offered, keeping, ...facts } = copy;
…
const row = { ...facts, id, collectorId: a.collectorId, offered: offered === true,
  ...(keeping === true ? { keeping: true } : {}),
  ...(addedAt ? { addedAt } : {}) };
```

`...facts` is an **open spread**. Verified: `{ canonicalCardId:"x", language:"ja", whateverIWant:42 }` is accepted and both extra keys are stored. The only field allow-list in the system is the client function signature at `client/commands.js:274`; nothing on the server or in the domain enforces it.

**[F] Required / validated / dropped.** Required: collector seat (`:950`); a `copy` object (`:951`); exactly one card id (`:953`, `:954`); not both dispositions true (`:967`). Validated but optional: the grade/condition *pair* via `gradingProblem` (`:961`); `market` as a non-negative number when non-null (`:962`). Silently dropped: `id`, `addedAt`, `updatedAt`, any payload `collectorId`. Silently defaulted: `offered` → `false` for anything not literally `true`; `keeping` → absent. **Never validated anywhere: `cert`, `photos`, and every other key.**

**[F] `ctx.id` position.** `const id = ctx.id("b", askedId)` is at `:968`. All seven content refusals precede it. The only refusal after the mint is the id-collision `copy-in-use` at `:969`, which is unreachable in practice under an authoritative runtime and short-circuits under `prototypeRuntime`. Verified: five consecutive refusals, then the first success still returns `b000001`. **No refusal consumes a copy id today, and Batch 2 must not change that** — the gate belongs beside the existing conflict check at `:967`.

**[F] The retry binding is intact.** `draftId` on a `record-copy` step: written at `CardSpecification.jsx:198`, bound at `:456-459`, adopted at `:428-432`, called on both the refusal and success exits. Per-draft, so two new copies in one Save keep two ids. The rationale at `:407-427` forbids de-duplication by contents, because owning two identical copies is legitimate.

**[F] The blank-draft hole, exactly.** `BLANK_COPY` (`:106-107`) is all-empty with `disposition: "unstated"`. `addCopy()` (`:370-374`) pushes it. `localProblem` (`:390-404`) checks only grade/condition coherence and the market number for a copy draft. So "add a copy" then Save sends `{grade:null, condition:null, cert:null, market:null, offered:false, keeping:false}`. The asymmetry is in the same function: a **Goal** is refused locally without a grade (`:392`, *"Say which copy you're looking for."*); a **copy** has no equivalent requirement.

### Prototype / demo (not production)

| # | Call site | Identity | Disposition |
|---|---|---|---|
| D1 | `src/MetYet.jsx:3196-3209`, UI at `:7704`, `:7722` | legacy `cardId` | **`offered: true` hardcoded** |
| D2 | `collector/MetYetCollector.jsx:5817-5820` | legacy `cardId` | **`offered: true` hardcoded** |
| D3 | `src/MetYet.jsx:2226` in `buildCanonicalSeed` | legacy `cardId` | `offered: true` on every seed row; **writes rows directly into the seed object** |

**[F] No prototype path sets `keeping` at all, and no prototype path calls either setter** — the `setCollectorCopyOffered` facade at `domain/metyet-store.js:138-141` has no caller in any source tree, and there is no `setCollectorCopyKept` facade.

### Fixtures and tests (not production)

`domain/metyet-store.js:129` (test-only facade, runs the real command); `tests/helpers/command-server.cjs:105-106`, `harness/review-scenario.cjs:53-62` (direct seed rows, `offered: true`); and **raw SQL inserts** at `tests/phase5-c21-collector-copy-corrections.cjs:147,187` and `tests/phase5-c32-goal-criteria-grading.cjs:494,522`, which bypass the domain, the command and `validateWorld` entirely.

---

## 3. Canonical identity findings

**[F] A `canonicalCardId` pins eleven things, not six** — three levels (`domain/card-identity.js:6-16`):

| Level | Segments |
|---|---|
| Expansion | `game`, `code` | 
| Card Context | `game`, `expansionId`, `collectorNumber`, `cardName`, `discriminator` |
| Canonical Card | `cardContextId`, `printRun`, `finish`, `language`, `stamp`, `printVariation` |

Vocabularies, all frozen: `GAMES` (`:53`), `PRINT_RUNS` (`:72-78`), `FINISHES` (`:81-88`), `STAMPS` (`:93-98`), `PRINT_VARIATIONS` (`:103-107`). `language` is a shape regex `/^[a-z]{2}$/` (`:112`), not an enum. `collectorNumber` is arbitrary text, never parsed.

**[F] The id is opaque and server-minted, not a hash.** `0006_card_catalog.sql:35-42`: *"a server-minted token with no meaning: not a provider's id, not a hash of the card's dimensions."* The natural key is a separate UNIQUE column used only for import idempotence; re-import revives rather than re-mints (`catalog-repository.js:184-190`).

**[F] A default means "this is the value", never "unknown"** — `card-identity.js:209-211`: *"**Unstated is not unknown**: a caller that does not mention `stamp` is describing an unstamped card."* And `:122-134`, headed **"UNKNOWN IS NOT A VALUE"**: *"Minting `print_run = unknown` would create a canonical card that a Goal could point at and an Inventory copy could match — a real, durable, wrong answer."* Unmappable source records are **quarantined** instead (`0006:179-184`).

One honest caveat on your specific worry: `withDefaults` is applied unconditionally at `catalog-repository.js:176`, so a caller that omits `language` gets `"en"` stamped on. `:109-111` says English-only is the pilot's import scope. By the file's own rule that is read as the value. The structural possibility of a silent `"en"` exists; it is a catalog-import concern, not a copy concern, and it is outside Batch 2.

**[F] Grading is explicitly not identity**, said in three places and pinned by a test:
- `card-identity.js:33-38`: *"Grade, grading company, certification number and condition describe a physical copy somebody holds, not which card it is… None of them appear in any key in this file, and a test says so."*
- `0006_card_catalog.sql:144-147`: *"GRADE AND CONDITION ARE NOT HERE and never will be."*
- `metyet-domain.js:1056-1058`: *"`grader` is deliberately not a canonical-card dimension."*
- `tests/phase5-c2-collector-copy.cjs:575-576`: `assert(!("grader" in identity), "a grading company entered card identity")`.

`0007_inventory_canonical_card.sql:11-18` records the consequence: two rows of one card at different grades are possible *because* Batch 5 moved grading off identity. Before that they were different cards.

### Once `canonicalCardId` is known, what is settled

**Settled, and no per-copy field may restate it:** game, expansion, collector number, card name, discriminator, print run, finish, language, stamp, print variation — plus presentation (artist, rarity, images). `metyet-commands.js:636-639` states it as a command rule: *"a copy REFERS to a card, it does not describe one, and a browser that could describe one could invent one."*

**Genuinely open as per-copy physical fact:** `grade`, `condition`, `cert`, `photos`, `market`, `offered`, `keeping`, `addedAt`, `updatedAt`. `status` is derived, never stored (`0011_collector_copies.sql:37-44`).

**[F] Duplication:** none on the canonical path. On the **legacy `cardId` path**, yes, and the repo calls it debt — `metyet-projection.js:398-405`: *"a card's identity folds in its grade and condition — `identityFrom` still does, **which is written-down debt**."* For a legacy copy, `grade`/`condition` exist on both the copy and the card row, and `client/tp/sections/Inventory.jsx:225-227` falls back between them. **[R]** Batch 2 adds no per-copy identity field, so it neither worsens nor touches this.

---

## 4. Grade / condition / cert semantics

**[F] "Raw" is a sentinel inside the grade vocabulary**, not a flag and not absence (`metyet-domain.js:1022-1023`):

```js
const GRADED_VALUES = ["Raw", "PSA 1", … "PSA 10"];
const CONDITION_VALUES = ["Near Mint", "Lightly Played", "Moderately Played",
  "Heavily Played", "Damaged"];
```

**[F] There are three grading states, and the third is absence.** `metyet-domain.js:1068-1075`: *"'Raw' stated, or nothing stated at all: those are different answers and stay different. **A copy nobody has described is not a raw copy.**"* The importer says the same (`server/inventory/templates.js:124-129`): *"a blank grade means nobody said, and 'Raw' is a claim that the card is ungraded."*

**[F] One stored enum, a derived two-shape reading.** `gradingOf` (`:1035-1075`) parses the label into `{state, grader, grade, condition, label}`; `:1035-1045` calls itself *"the seam between"* the stored and conceptual shapes. The reader is deliberately wider than the writable vocabulary — it parses `BGS 9.5` correctly while commands refuse it.

**[F] `gradingProblem` in full** (`metyet-domain.js:1112-1120`):

```js
const gradingProblem = (facts) => {
  const grade = stated(facts && facts.grade);
  const condition = stated(facts && facts.condition);
  if (grade && !GRADED_VALUES.includes(grade)) return GRADING_PROBLEM.grade;
  if (condition && !CONDITION_VALUES.includes(condition)) return GRADING_PROBLEM.condition;
  if (/^raw$/i.test(grade) && !condition) return GRADING_PROBLEM.rawNeedsCondition;
  if (grade && !/^raw$/i.test(grade) && condition) return GRADING_PROBLEM.gradedHasCondition;
  return null;
};
```

Condition is **required** in exactly one case (grade is `"Raw"`), **forbidden** in exactly one (grade is a real grade), and `{condition, no grade}` is legal and intentional. `:1093-1104`: *"**neither is fine. 'Unstated' is a real answer and always has been.**"*

**[F] A graded copy with a condition** is refused at all six write boundaries (`addGoal:386`, `updateGoalCriteria:571`, `addInventoryCopy:658`, `updateInventoryCopy:773`, `addCollectorCopy:961`, `updateCollectorCopy:1013`) and **tolerated on load**, deliberately — `:1122-1135`: *"Rows written before C3.2 may carry a contradictory pair… They cannot be repaired — 'PSA 9 / Damaged' does not say which half the person meant… They also must not make a world unloadable."* `gradingRead` reports the contradiction, and both presenters surface it as a `Says PSA 9 and Damaged` tag.

**[F] `cert` is entirely unconstrained**, at every layer:

| Layer | Treatment |
|---|---|
| `addCollectorCopy` | no check — falls through the open spread |
| `updateCollectorCopy` | a lock only (`:1000-1002`, `copy-committed` on `committed`/`traded`), never a format check |
| `validateWorld` | **the string `cert` does not appear in `metyet-world.js`** |
| DB | no column; lives in `attrs` |
| Projection | crosses to the counterparty on both seats |

**[F] And the repository already knows this is a hole.** `server/inventory/mapping.js:536-552`: *"A CERTIFICATE NUMBER IS A CLAIM ABOUT A SLAB… **The domain does not check it — `gradingProblem` never looks at `cert`** — so an earlier draft wrote a certification number onto raw cards and onto cards with no grade at all, and nothing anywhere noticed. A cert without a grade is a graded card MetYet has not been told the grade of, which is a worse record than no cert."* The importer refuses `cert-without-grade`, `cert` on `Raw`, and a cert shared across `quantity > 1`. **None of those rules exist in the domain.** A cert written through the UI or the command bypasses all three.

### Does anything depend on grade or condition being absent?

**[F] Yes — in four distinct ways, and this is the evidence that decides §5.**

**(a) Presentation renders absence as a first-class answer.**
- `Collection.jsx:381` — `title={gradeLine(copy) || "Not stated"}`. An absent grade is the copy's title on the shelf.
- `Collection.jsx:409`, `tp/sections/Inventory.jsx:258` — `<Fact label={graded ? "Cert" : "Serial"}>`. **An ungraded copy's cert field is labelled "Serial".** Requiring a grade deletes that branch.
- `tp/sections/Inventory.jsx:528-540` — the three-case rule for whether the form may speak about condition; the "Grade NOT STATED" case omits the key rather than sending `null`. `domain/README.md:679-685` records that getting this wrong cost a real defect: *"a Save that changed nothing else deleted the one fact the copy had."*

**(b) `meetsGoalCriteria` treats absence as a wildcard, on both sides** (`metyet-domain.js:1188-1194`, `:1168-1171`): *"UNSTATED IS UNRESTRICTED… Absence is absence — the one thing this file already refuses to read as a statement."* Two consumers: discovery (`metyet-discovery.js:179`) and `startOpportunity` (`metyet-commands.js:1576`).

**(c) Partner projections carry absence across unmodified** — `grading.state === "unstated"`, `grading.label === null`.

**(d) Tests assert absence directly**, including the sharpest one, `tests/phase5-c33-card-specification.cjs:279-285`: *"'Not stated' is a real answer for a copy nobody has described, and it stays on the GRADE control — **asserted here so that requiring a condition is not quietly turned into requiring a grade**"*, failing with *"a copy nobody has described can no longer be left unstated"*. Also `phase5-c33:412-419` (*"an unstated copy stays unstated — it does not become Raw"*), `phase5-c2:564`, `phase5-c35:593-605`, `phase5-collector-identity-stabilization:348`, `inventory-freshness:44`.

### Legitimate durable copies with neither grade nor condition

**[F] Five, four of them currently supported:**

1. **A copy nobody has described yet** — `metyet-domain.js:1100-1102`. Supported.
2. **Ownership recorded before the card is evaluated** — the same principle as `:943-948` on photographs. Supported.
3. **A CSV row with a blank grade cell** — `mapping.js:148-152`, `:533-534` writes `grade` only `if (graded.stated)`. Supported.
4. **A condition with no grade** — `{grade: null, condition: "Near Mint"}` passes `gradingProblem`, renders, and crosses to partners. Supported, with a regression already on record.
5. **A grade MetYet cannot hold** — a real BGS 9.5 slab. `gradingOf` parses it; `GRADED_VALUES` refuses it on write; the importer calls it `ungradeable-grade`. **Not supported as a stored grade.** `templates.js:119-123`: *"a source that says `BGS 9.5` is saying something MetYet cannot hold."*

Case 5 is decisive for §5 and I return to it there.

**[F] Goal `desired` versus owned copy** — same function, different requirement. `gradingProblem` judges both (`metyet-world.js:235-239`: *"an impossible desire is still not a sentence"*). The differences: a Goal's criteria are namespaced under `desired` and a bare `grade` on `addGoal` is **refused** (`:370`); a Goal's `desired` shape is policed strictly while a copy's facts are spread open; and **required-ness is reversed** — a canonical Goal *must* state criteria (`:437`, `criteria-required`), an owned copy need not state anything, mirrored in the UI at `CardSpecification.jsx:392` versus `:396-403`.

---

## 5. Minimum durable physical-copy recommendation

### The candidates, judged

| | **A** — identity + disposition | **B** — + grading state | **C** — A, plus coherence tightenings only |
|---|---|---|---|
| Product truthfulness | High. Records what is known, refuses to invent what is not. | **Fails.** Forces a statement where none is known. | High. |
| Specificity | Identity is exact (11 dimensions). Physical facts optional. | Nominally higher. | Same as A. |
| User burden | One decision at birth. | A grade and possibly a condition before a card can be written down at all. | One decision. |
| UI compatibility | `BLANK_COPY` already starts blank; the empty Grade option stays. | **Breaks** `phase5-c33:279-285` by name, and the "Serial" label branch, and the TP form's three-case rule. | Compatible. |
| Existing data | Untouched. | Every undescribed copy becomes retroactively invalid in spirit; enforcement later would need a backfill that cannot be honest. | Untouched. |
| Trade usefulness | Unchanged — the package door already requires photographs, not grades. | No gain; the door does not read grade. | Unchanged. |
| Matching usefulness | Unchanged — absence is a wildcard by design. | **Changes matching semantics for every copy.** | Unchanged. |
| Migration risk | None. | High. | None. |
| Inference risk | None. | **The BGS 9.5 case forces a false statement**: a real slab can only be recorded by saying `Raw` + a condition. | None. |
| Fake precision | None. | This is the definition of it. | None. |

### [R] Recommendation: **Candidate A**. No new required physical fields.

Grade, condition, cert and photographs stay optional at birth, under the existing `gradingProblem` coherence rule. The minimum for a durable `CollectorCopy` is:

> **exactly one `canonicalCardId` (or a resolvable legacy `cardId`), and exactly one disposition.**

Three reasons, in order of weight:

1. **Requiring a grading state would make a real physical card unrecordable.** MetYet holds `Raw` and `PSA 1–10`. A BGS 9.5 slab is a specific, well-identified, physically unambiguous copy whose grade the product cannot express. Under Candidate B its owner's only way to record it is to claim it is raw and invent a condition. A rule that forces a false statement to satisfy a specificity requirement has produced less specificity, not more.
2. **The repository has decided this exact question and written down the reasoning** — `metyet-commands.js:943-948` on photographs. Specificity requirements attach at the moment they matter (the trade-package door), not at birth. Candidate B contradicts that without new evidence.
3. **"Unstated" is load-bearing in nine places**, including a test whose failure message exists precisely to catch this proposal (`phase5-c33:285`). Requiring grade would be a state-model change wearing a validation's clothes — the brief's own §8 says this should be *"a very small domain-boundary correction."*

### What "specific" then means, honestly stated

Identity is already exact to eleven dimensions before a single physical fact is entered. What remains open is the *condition of this particular object*, and the product's truthful position is that this is **observed over time, not known at acquisition**. The specificity the brief is reaching for is already delivered by `canonicalCardId`; adding per-copy requirements would add precision about the object's state that the owner frequently does not have.

### [F][R] One real gap, named and deliberately excluded

**`cert` without a grade.** The importer refuses it with reasoning quoted in §4 (*"a graded card MetYet has not been told the grade of, which is a worse record than no cert"*); the domain does not. That is a genuine truthfulness defect and it is one line.

**[R] Leave it out of Batch 2.** It is a *coherence* rule (it stops one specific lie), not a *minimum* rule (it makes no copy more specific), and it belongs in `gradingProblem` — which is shared by six write boundaries and by `validateWorld` for Goals. Changing it changes behaviour for inventory copies and goal criteria too, which is three non-goals away from this batch. Recorded here as a separable, well-evidenced follow-up.

---

## 6. Disposition command recommendation

### [F] What exists

```js
const withDisposition = (copy, offered, keeping, at) => {           // :59-63
  const { keeping: _withdrawn, ...rest } = copy;
  return { ...rest, offered: offered === true,
    ...(keeping === true ? { keeping: true } : {}),
    ...(at ? { updatedAt: at } : {}) };
};
```

The two fields are **structurally different**, by design (`:45-58`): `offered` is a required boolean that `validateWorld` insists on (`metyet-world.js:323-327`); `keeping` is an optional presence-only flag whose **absence is the stateless answer** (`:328-340`), never written as `false`. Pinned by `tests/phase5-four-state-and-binder-invariant.cjs:683-698`.

Both setters refuse in the same order: `not-found` (no such copy) → `not-owner` → `not-found` **(not a boolean)**. Neither calls `ctx.id`. Neither has a reserved-or-committed guard. The third refusal reusing `not-found` for "that is not a boolean" means a caller cannot tell a missing copy from a malformed argument.

**[F] `false` has exactly one production producer:** `CardSpecification.jsx:183` and `:185`, the two `withdrawals.push` branches, which fire only when a stored disposition is being replaced by `"unstated"` — the "Haven't decided" button.

**[F] `validateWorld` does not require a disposition**, and two tests assert that explicitly (`phase5-four-state-and-binder-invariant.cjs:198-210`, `:441-444`).

**[F]** Exposed commands: 23. Both setters exposed (`:75`, `:85`). **Six suites pin the exposed list verbatim** (`phase5-c1:780`, `c31:675`, `c32:690`, `c33:685`, `c34b:1001`, `c35:755`), plus two that assert membership.

### The options, judged

**Option A — keep both setters, prohibit `false`.** Exposed count unmoved, no new binding in `client/commands.js`, no re-pinning of six verbatim lists. Cost: the product concept ("one question, two answers") stays expressed as two commands with yes-only arguments, and a reader must know that `offered(true)` silently clears `keeping`.

**Option B — one `setCollectorCopyDisposition({copyId, disposition})`.** Says what the product means; one honest refusal; collapses the panel's two call sites. Cost: exposed 23 → 24, six verbatim lists re-pinned, a new client binding, and the two old setters either stay (two ways to do one thing) or are retired (breaking 8 test files and the store facade).

### [R] Recommendation: **Option A, with one refusal code shared across all three sites.**

Keep `setCollectorCopyOffered` and `setCollectorCopyKept` as the wire commands. Prohibit anything but `true`. The reasoning:

- Batch 2's job is a **behaviour** change (invalid durable states become impossible). Option B is additionally a **vocabulary** change. The last several batches on this branch have repeatedly shown that mixing the two is where defects hide — the four-state batch shipped a cascade bug for exactly that reason. A semantic command can ride later as a pure rename with no behaviour movement.
- Option A needs no exposed-count movement and no re-pinning of six lists that three different suites assert verbatim. That is not laziness: every one of those re-pins is a chance to assert the wrong thing.
- **[R] Record Option B as the intended destination**, after the invariant is live and the census is in hand. At that point retiring the booleans from the *wire* (not from storage) is a mechanical change against a settled rule.

### [R] The refusal code: one new code, `invalid-disposition`

Mirroring Batch 1's `invalid-tier` exactly, which was in turn named for `invalid-amount`: *the request named something the domain has no value for.*

It covers all three sites with one honest sentence:
- `addCollectorCopy` with neither disposition true, or a non-boolean, or both absent → `invalid-disposition`.
- `setCollectorCopyOffered(copyId, false)` → `invalid-disposition`. The caller named a value the domain no longer has a durable meaning for.
- `setCollectorCopyKept(copyId, false)` → `invalid-disposition`.
- Non-boolean on either setter → `invalid-disposition`, **replacing the current `not-found`**, which today conflates "no such copy" with "that is not a boolean".

**[F] `disposition-conflict` keeps its current meaning, unchanged**: both true. It is raised in exactly one place (`:967`), has a Collector-facing message (`CardSpecification.jsx:806`), and is pinned by a test. Reusing it for "you did not choose" would make that message wrong for the case it is shown on — *"A copy is either one you'd part with or one you're keeping — not both"* is not an answer to "you said neither".

**[F] Candidates considered and rejected**, with why each would be a lie: `criteriaRequired` (right shape, wrong object — it is about a Goal's `desired`, and its client sentence says "goal"); `invalidTier` (the same product argument, wrong noun); `gradingIncoherent` (different field, and "incoherent" means contradictory, not absent); `notFound` (tells the caller nothing); `identityImmutable` (says "not here", not "you must say"); `copyNotOffered` (a guard on the package door, means "offer it first"); `nameRequired` (nearest naming precedent for a required field, but bound to binder names).

---

## 7. `addCollectorCopy` target contract

**[R] Keep the booleans. Require exactly one true. Refuse beside the existing conflict check.**

1. **Should creation accept the current booleans?** **Yes.** The client already sends them, `withDisposition` and the row shape are boolean, and the brief forbids migrating storage to an enum. A semantic `disposition` string at the creation boundary while the setters take booleans would be a third dialect.
2. **Should it accept semantic `disposition` and translate?** **No**, for Batch 2 — see Option B above.
3. **How does CardSpecification call it today?** `offered: draft.disposition === "offered"`, `keeping: draft.disposition === "keeping"` (`:196-197`). The three draft values map onto the two booleans losslessly *only because* the all-false pair is representable. Removing that state means the panel must stop being able to produce it.
4. **Which choice minimises scope?** Requiring `offered === true` XOR `keeping === true` at `addCollectorCopy`. One condition, one line, beside `:967`.
5. **Where should it be refused?** Both: **the domain command** (authoritative) **and the panel's `localProblem`** (so Save is not offered into a guaranteed refusal — the four-state batch shipped exactly that defect with "Add cards to this binder").
6. **Must refusal precede `ctx.id`?** **Yes, and it is free.** `ctx.id("b", askedId)` is at `:968`; the conflict check is at `:967`. Placing the new gate immediately after it keeps the Batch 1 property that no refusal consumes an id — verified to hold today.
7. **What refusal code?** `invalid-disposition`.
8. **Does an existing refusal fit?** No — see §6.

**[R] One further change the audit uncovered: `client/commands.js:274-277` must stop defaulting.** `offered = false, keeping = false` would become a default that *guarantees* a refusal. A default that cannot succeed is worse than no default, because the omission surfaces at the server instead of at the call site. Make both required in the signature. Safe: the only caller is `SignIn.jsx:243`, which spreads `step.copy`, and `planFrom` always supplies both.

---

## 8. CardSpecification: draft versus durable

**[F]** `DISPOSITIONS` (`:99-105`) is three options with `"unstated"` third and default; the control is a three-button `role="group"` where one is always pressed; `localProblem` never looks at `disposition`; `asDraft:90` reads a stored row back into the draft word; `planFrom:176` compares three ways.

**[F]** The word `"unstated"` is **never written to storage** anywhere in the repository. But it is not UI-only either: `D.copyDisposition` (`metyet-domain.js:1552`) returns it as its third value, exported and asserted on by tests, and `gradingOf` returns `state: "unstated"` for a wholly different concept — **one string, three layers, two meanings.**

### [R] Recommendation: keep a draft sentinel, rename it, and refuse locally

1. **`unstated` does not disappear from the domain.** `D.copyDisposition` reads existing data, and copies with no disposition will exist for as long as the pre-Batch-2 set does. It is a reader of a real state; leave it alone.
2. **The draft sentinel stays, renamed to `"unanswered"`.** The brief's distinction is exactly right — *a UI draft may begin unanswered; a durable object may not* — and `BLANK_COPY` must still start somewhere. Renaming decouples the panel's word from the domain's word and from the grading vocabulary's identical word. Four occurrences move (`:90`, `:103`, `:107`, `:176`) plus three test fixtures that pass it into `planFrom`.
3. **The third button goes.** `DISPOSITIONS` becomes two options for a copy that has not been recorded yet. A new draft starts with **none pressed** — which the control does not currently support and is the one visual change required.
4. **`localProblem` gains one check**: a new copy draft with no disposition returns a message and disables Save. This is the panel's existing pattern for the Goal branch (`:392`), applied to the half that lacks it.
5. **The two `withdrawals.push` branches at `:183` and `:185` are deleted.** They are the only production producers of `false`, and `false` is being prohibited.
6. **`WHY` gains an `invalid-disposition` entry**, following the `invalid-tier` precedent at `:798-802`.

**[R] An existing undecided copy is a different case and must not be forced.** When `asDraft` reads a stored copy with no disposition, the panel should show the two buttons with neither pressed and require a choice **only if that copy is otherwise being changed** — not on every Save that touches an unrelated copy or a Goal. See §9.

---

## 9. Legacy stateless-copy transition policy

**[F] What an undecided copy can do today** — verified by running each:

| Action | Today |
|---|---|
| Load + `validateWorld` | **passes, untouched.** `:341` is guarded by `"keeping" in b`, so absence is never reported |
| Shown on the Collector's shelf | `Collection.jsx:400-405` — **no tag at all.** The comment at `:386-399`: *"silence says nothing — no tag, because 'hasn't decided' is not a decision to display"* |
| Trade/Sell view and count | excluded; counted in the denominator only |
| Binder screens | render no copies at all (`Binder.jsx:16-20`, `Collection.jsx:289`) |
| Deal Flow | reads `state.inventory`, never `collectorCopies` |
| Projected to a partner | **the row does not cross.** `copyForViewer:251-256` returns `null` |
| `updateCollectorCopy` grade/condition/cert/market | **OK.** And `:998` refuses `offered`/`keeping` in a patch with `identity-immutable`, so that command *cannot* express a resolution |
| `addBinderEntry` / `removeBinderEntry` | **OK** — deliberately decoupled by the four-state salvage batch |
| `proposeTradeSelection` | **refused, `copy-not-offered`.** `:1726-1757`: *"Refusing only `keeping` would still let a copy nobody has said anything about… be reserved against its owner's silence"* |
| `setInterest` | refused, `not-found` (`:1367`) |
| `setCollectorCopyKept(true)` | **OK**, writes `offered: false, keeping: true, updatedAt` — one key added |
| `setCollectorCopyOffered(true)` | **OK**, writes `offered: true`, no `keeping` key |
| `setCollectorCopy*(false)` | **OK, a silent no-op that writes nothing** |
| `removeCollectorCopy` | OK when not in a deal |

**[F] Nothing infers a disposition for an undecided copy.** Four read models treat it *identically to PC*, by design and with the reason recorded: `metyet-projection.js:481`, `metyet-commands.js:1367`, `:1758`, `collector-view.js:298`. Four places distinguish three states: `copyDisposition`, the `Collection` tag ladder, the panel, and `validateWorld`'s `in` guard.

**[F] One pre-existing partner-facing label defect, found in passing and *not* a Batch 2 item.** `client/tp/sections/CollectorNetwork.jsx:521` renders `label="Copies offered"` over `copiesOf`, which includes `referenced` rows carrying `offered: false`. Its own comment at `:518-520` asserts the projection dropped the rest, which `copyForViewer:254` makes false. Reachable only with a *referenced* copy, so it is orthogonal to the undecided question — but it is the one place a disposition label disagrees with the field. Recorded for a later batch.

### [R] Recommendation: policy 2 — resolution is required only where the disposition is what is being asked about

| Action | After Batch 2 |
|---|---|
| Load, view, project | **unchanged.** No resolution, ever, on a read |
| Edit grade / condition / cert / market | **unchanged.** Blocking a grade correction on an unrelated decision is the surprising policy the brief warns against — and `updateCollectorCopy` cannot express a resolution anyway (`identity-immutable`) |
| File / unfile in a Binder | **unchanged** — reversing the salvage batch's decoupling is a non-goal |
| Enter a trade package, `setInterest` | **unchanged** — already refused, and already treats undecided exactly as PC |
| `setCollectorCopy*(true)` | **unchanged** — resolves cleanly from undecided, verified |
| `setCollectorCopy*(false)` | **refused** `invalid-disposition`. This is the only new restriction, and it is the whole of the two-way switch |
| Creating a new copy | must state one |

Three reasons: it follows the repository's own precedent (requirements attach where they are needed); it needs no migration, no `validateWorld` change and no backfill; and it never auto-resolves — a copy becomes PC or Trade/Sell only because its owner said so.

**[R]** The practical consequence worth stating plainly: after Batch 2 the undecided set is **closed and shrinking**. No path creates a new member; every switch removes one. That is what makes a later hard invariant reachable without a migration that invents intent.

---

## 10. Live-data availability and census

**[F] There is no live database access in this session.** Verified without printing anything: no `DATABASE_URL` or related name in the environment, no `.env` file in the repository, and `npm run db:status` returns

```
failed:      The configuration is incomplete: DATABASE_URL is not set
code:        config.invalid
```

**No census was run and no figure is estimated.** Nothing below is a measurement.

### [R] The census, when a read-only connection exists

Read-only, one statement, no writes:

```sql
select count(*)                                                        as total,
       count(*) filter (where attrs->>'offered' = 'true')              as offered_true,
       count(*) filter (where attrs->>'keeping' = 'true')              as keeping_true,
       count(*) filter (where attrs->>'offered' = 'true'
                          and attrs->>'keeping' = 'true')              as both,
       count(*) filter (where attrs->>'offered' = 'false'
                          and attrs ? 'keeping' = false)               as neither,
       count(*) filter (where attrs ? 'offered' = false)               as offered_missing,
       count(*) filter (where attrs ? 'grade' = false
                           or attrs->>'grade' is null)                 as grade_missing,
       count(*) filter (where canonical_card_id is null)               as legacy_card_id_only,
       count(*) filter (where (attrs ? 'cert') and attrs->>'cert' <> ''
                          and (attrs->>'grade' is null
                            or lower(attrs->>'grade') = 'raw'))        as cert_without_grade
  from metyet.collector_copies;
```

`offered_missing` should be **zero** after migration 0012; a non-zero result means 0012 did not run in that environment and is itself the finding. `both` should be zero — `validateWorld` rejects the pair, so a non-zero result means rows reached the table outside the domain (the raw-SQL test inserts show that path exists). `cert_without_grade` sizes the §5 gap.

### [R] Is the census required before Batch 2? **No.**

Batch 2 as recommended is **refusal-only at the command boundary**. It adds no invariant to `validateWorld`, writes no migration, and changes no stored row. **[F]** `validateWorld` runs on **load** as well as before save (`world-repository.js:22,25`; `command-transaction.js:69,153`) — which is precisely why this distinction matters, and this repository has been caught by it three times. A command-boundary refusal cannot make an existing world unloadable; a `validateWorld` rule can, and would turn every undecided copy into a 500 on the next read.

**[R] The census is required before the later hard-validation batch**, and before then it is needed to answer one question that genuinely cannot be guessed: how many undecided copies exist, and whether the number is small enough to be resolved by their owners through the UI rather than by a migration nobody can write honestly.

---

## 11. Transaction compatibility

**[F] Confirmed unchanged by the recommended Batch 2.** Nothing in §6–§9 touches a transaction command, a predicate, a projection, or a stage machine.

| Guarantee | Mechanism | After Batch 2 |
|---|---|---|
| Only Trade/Sell copies enter a package | `metyet-commands.js:1758` `if (!D.copyOffered(b)) return refuse(R.copyNotOffered)` | unchanged |
| PC copies barred | the same line — `copyOffered` is `offered === true` and nothing weaker | unchanged |
| Undecided copies barred | the same line, deliberately (`:1726-1757`) | unchanged |
| `copyOffered` | four call sites: `:1758`, `:1041`, `:1065`, `collector-view.js:298` | unchanged |
| `setInterest` | `:1367` `offered !== true` → `not-found`; `:1372-1374` status gate | unchanged |
| `inSupply` | `metyet-projection.js:481` `inNetwork && offered === true` | unchanged |
| Trade picker | `collector-view.js:296-300` — offered + photographed + `status === "available"` + not already used | unchanged |
| Partner privacy | `COLLECTOR_COPY_FOR_PARTNER` (`:202-203`); a PC or undecided copy's **row is barred entirely** by `copyForViewer`, not field-filtered | unchanged |
| `collectorCopyStatus` | `metyet-domain.js:1683-1698`, four statuses from `opportunities` only — **never reads disposition** | unchanged |

Photographs remain required at the package door (`:1759`) and not at birth, which is the precedent §5 relies on.

### [F] The known edge case, documented and not solved

**A copy already in a submitted / reserved / committed trade package can be switched to PC, and this succeeds at every stage.** Verified by running it:

| Phase | `collectorCopyStatus` | `setCollectorCopyKept(true)` | Row after |
|---|---|---|---|
| reserved | `reserved` | **OK** | `offered: false, keeping: true` |
| committed | `committed` | **OK** | `offered: false, keeping: true` |
| completed deal | `committed` | **OK** | `offered: false, keeping: true` |

`setCollectorCopyKept` (`:1059-1073`) checks existence, seat, ownership, boolean-ness and idempotence. **It never calls `collectorCopyStatus`.** The repository predicted this in prose at `:1744-1753`: *"a Collector may package an offered copy and then say they are keeping it, and the copy stays visible to that partner as `reserved` because it IS reserved to their deal… Whether PC should additionally refuse while a package holds the copy is a product question this batch surfaced rather than answered."*

**What the partner continues to see and do.** `copyForViewer:252` short-circuits on `own !== "available"` *before* `inSupply` is read, so the row crosses with grade, condition, cert and **both photographs**, labelled `"Reserved"`. Verified: in the reserved phase the partner can still issue `reviewTradeCard({decision: "accepted"})` successfully — **driving a PC copy from `reserved` to `committed` after its owner said they were keeping it.** Nothing in the partner's path re-reads the disposition. The Collector's remedy is `withdrawTradeCard` (works while reserved, refused `copy-committed` once committed), exactly as `:1753` says.

**[F] The guard asymmetry inside one command family.** `updateCollectorCopy` reads `collectorCopyStatus` (`:995`) and has a `copy-committed` guard (`:999-1002`) — **for `cert` only**. Verified on a committed copy: patching `cert` → `copy-committed`; patching `grade` → **OK**; `setCollectorCopyKept` → **OK**. Three different answers to "is this copy frozen?"

**[R] Orthogonal, and Batch 2 leaves it exactly where it is.** The entry condition requires `offered: true` (nothing else passes `:1758`), so requiring a disposition *at creation* cannot reach it. And a two-way switch does not widen what crosses to a partner, because **every read model that could be widened by `offered: true` is already conjoined with a `collectorCopyStatus` check**: `:481` with `:252-254`, `:1367` with `:1372`, `:1758` with `:1760-1763`. What a two-way switch changes is the *symmetric* case — a committed copy switched back to Trade/Sell now lands on `offered: true` instead of stateless — and the status conjunctions absorb it. The defect is a missing guard in `setCollectorCopyKept`, not a property of the disposition's shape. It belongs to transaction work.

---

## 12. Scenarios A–M

Each row states today's verified behaviour and what the recommended Batch 2 changes.

| | Scenario | **Today [F]** | **After Batch 2 [R]** |
|---|---|---|---|
| **A** | New owned copy, no disposition | **Creates a durable stateless copy, 200.** Verified: `{canonicalCardId:"cc-x"}` → `{offered:false}`. The panel's Save is enabled and `localProblem` is silent | Refused `invalid-disposition` in the domain; Save disabled in the panel with a message; **no row, and no copy id consumed** |
| **B** | New PC copy | Works — `keeping: true`, `offered: false` | Unchanged |
| **C** | New Trade/Sell copy | Works — `offered: true`, no `keeping` key | Unchanged |
| **D** | PC → Trade/Sell | One command, atomic. `setCollectorCopyOffered(true)` writes `offered: true` and **removes** the `keeping` key in the same `withDisposition` call. No durable intermediate | Unchanged |
| **E** | Trade/Sell → PC | One command, atomic. `setCollectorCopyKept(true)` writes `keeping: true` and `offered: false` together | Unchanged |
| **F** | Withdraw PC | **Succeeds.** Verified: `setCollectorCopyKept(pc, false)` → OK, row becomes `offered: false` with no `keeping` key — a durable stateless copy | **Refused `invalid-disposition`.** The only exit from PC is Trade/Sell |
| **G** | Withdraw Trade/Sell | **Succeeds.** Verified: `setCollectorCopyOffered(ts, false)` → OK, row becomes stateless | **Refused `invalid-disposition`** |
| **H** | Legacy stateless copy loads | Loads, validates, renders with **no disposition tag**, does not cross to partners | **Unchanged — this is the compatibility guarantee.** No `validateWorld` change, so no existing world becomes unloadable |
| **I** | Legacy copy resolves to PC | `setCollectorCopyKept(true)` → OK, adds exactly one key, no guessing | Unchanged |
| **J** | Legacy copy resolves to Trade/Sell | `setCollectorCopyOffered(true)` → OK | Unchanged |
| **K** | Malformed disposition | **`offered:"yes"` → silently a stateless copy, 200.** Verified. On the *setters* the same input is refused `not-found` | Refused `invalid-disposition` at all three sites, no mutation, no id consumed. The setters' `not-found`-for-a-non-boolean is replaced by the honest code |
| **L** | Minimally specified physical copy | A bare `{canonicalCardId}` is durable and valid. Graded needs a `GRADED_VALUES` grade and no condition; raw needs `"Raw"` plus a `CONDITION_VALUES` condition; a condition with no grade is legal; a BGS 9.5 slab **cannot be recorded at its real grade** | Unchanged — §5 recommends no new required physical fields. A disposition becomes the one new requirement |
| **M** | Copy in a trade package switches to PC | **Succeeds at reserved, committed and completed.** Partner keeps the row as `"Reserved"` with both photographs and can still accept the trade card. Verified | **Unchanged and documented.** Orthogonal — see §11 |

---

## 13. Risks, contradictions, and the measured test blast radius

### 13.1 [F] The test blast radius, measured rather than estimated

The trace in §2 suggested a handful of affected tests. That was wrong, and guessing would have under-scoped the batch, so it was **measured**: the creation gate was inserted temporarily, the full suite run, and the source then restored and re-verified (`git status --porcelain` clean, the most-affected suite back at 44/0).

**Result: 121 failing assertions across 12 suites** — creation alone, before the setters' `false` refusal is added.

| Suite | Failing assertions |
|---|---|
| `tests/phase3-domain-readiness.cjs` | 66 |
| `tests/phase5-four-state-and-binder-invariant.cjs` | 17 |
| `tests/phase5-c2-collector-copy.cjs` | 10 |
| `tests/phase5-c33-card-specification.cjs` | 7 |
| `tests/phase5-c34a-your-cards.cjs` | 6 |
| `tests/phase5-c32-goal-criteria-grading.cjs` | 4 |
| `tests/phase5-c21-collector-copy-corrections.cjs` | 4 |
| `tests/phase5-c5-tp-inventory-correction.cjs` | 2 |
| `tests/phase5-c34b-binder.cjs` | 2 |
| `phase5-collector-identity-stabilization`, `phase5-c4-catalog-import`, `phase5-c31-binder-foundation` | 1 each |

**[F] The 66 is a cascade, not 66 decisions.** `phase3-domain-readiness.cjs:115-148` builds one scripted transcript, recording every command's effect through a `step()` helper. The single `addCollectorCopy` at `:146` — which passes `cardId`, `market`, `photos`, `id` and `addedAt` but no disposition — invalidates the whole transcript, and every downstream assertion about ids, times and command coverage fails with it. **It is one edit.**

**[F] Across the twelve suites the work concentrates in roughly 50 call sites**, most of them a per-suite `own(app, token, copy)` helper (defined in `phase5-c2:135`, `c21:120`, `c31:139`, `c32:110`, `c33:119`, `c34a:120`, `c34b:132`, and as `own(st, actor, card, cert, extra)` at `phase5-four-state-and-binder-invariant:101`) invoked without a disposition. The helpers themselves pass the caller's `copy` straight through, so the disposition is missing at the call site, not in the helper.

**[R] A judgement call the implementer must make deliberately, not by reflex.** The cheap fix is to give each suite's `own()` helper a default disposition — one edit per suite instead of fifty. That reintroduces a default for the exact field whose default this batch exists to remove. It is acceptable **in a test helper**, where the disposition is scaffolding and not the subject, and only if the helper carries a comment saying so — the same treatment and the same reasoning as Batch 1's re-pinning of the `phase3` suites. It is **not** acceptable in the five suites where the disposition *is* the subject (`phase5-four-state-and-binder-invariant`, `phase5-c2`, `phase5-c33`, `phase5-c34a`, `phase5-c34b`), where each call should state what it means.

### 13.2 Risks and contradictions

1. **[F] The two-boundary contradiction, and tests that assert the wrong half.** `tests/phase5-c33-card-specification.cjs:1519` posts `setCollectorCopyOffered({offered: false})` and asserts `200`. Batch 2 makes that a refusal. Eight sites pass `false`: `phase5-four-state-and-binder-invariant.cjs:147`, `:381`, `:434`, `:436`, `:693`, `:697`; `phase3-domain-readiness.cjs:161`; `phase5-c33:1519`. Two need care rather than mechanical editing:

   - **Test `[4]`, `phase5-four-state-and-binder-invariant.cjs:140-152`, titled "`offered === false` is not PC, and never becomes it."** Its claim stays true, but its *mechanism* — offer, then withdraw, then assert the copy did not become PC — is exactly what Batch 2 forbids. The test must be re-pinned to assert that withdrawal is now refused, while keeping its original claim about what absence means. Deleting it would remove a named product guarantee.
   - **Test `[31]`, `:683-698`, "neither setter ever stores `keeping: false`."** The claim stays true; the proof calls both setters with `false` and asserts success. Re-pin to assert the refusal and keep the claim about the stored shape.

2. **[F] `addOwnedCopy`'s defaults become a trap.** `client/commands.js:274-277` would default every call into a guaranteed refusal. Fixing it is part of the batch, not a follow-up.

3. **[R] The panel's two-button control with neither pressed is the one genuinely new UI state.** Today one of three is always pressed. Getting this wrong reproduces the four-state batch's defect — a Save button enabled over a guaranteed refusal — so the local check and the control must land together.

4. **[F] `"unstated"` means two different things in two layers** (disposition and grading state) and the rename in §8 only separates the *draft* word. `D.copyDisposition`'s third value and `gradingOf`'s `state: "unstated"` will still collide. Not worth a batch; worth knowing when reading either.

5. **[F] Raw SQL inserts in two test suites bypass the domain, the command and `validateWorld`** (`phase5-c21:147,187`; `phase5-c32:494,522`). They can create any shape, including shapes Batch 2 forbids. They are testing persistence, so this is legitimate — but a census or a later invariant must not assume every stored row came through a command.

6. **[F] The open spread in `addCollectorCopy`** (`:963`) means arbitrary keys are stored. Unrelated to this batch, but it is why "the minimum contract" cannot be enforced by a field allow-list without a separate decision.

7. **[R] The `cert`-without-grade gap** (§5) will keep producing dishonest rows through the UI until it is closed. Named, evidenced, deliberately out of scope.

8. **[F] `CollectorNetwork.jsx:521`'s "Copies offered"** label counts non-offered copies. Pre-existing, orthogonal, recorded.

---

## 14. Crisp answers to the eighteen questions

1. **Minimum facts for a new durable CollectorCopy** — exactly one `canonicalCardId` (or a resolvable legacy `cardId`), and exactly one disposition. Nothing else.
2. **Required for a graded copy** — a grade in `GRADED_VALUES` and **no** condition. If no grade is stated, nothing is required.
3. **Required for a raw copy** — grade `"Raw"` **and** a condition in `CONDITION_VALUES`; that pairing already exists and does not change.
4. **Is cert ever required?** **No**, and it is currently never even validated. The importer's `cert-without-grade` rule should eventually reach the domain; not in Batch 2.
5. **Is grade always required?** **No.** Requiring it would make a BGS 9.5 slab unrecordable except by a false statement, and would break nine places that treat absence as a real answer, including a test written to catch this proposal.
6. **Is condition ever required?** **Yes, in exactly one case** — when the grade is `"Raw"`. Unchanged.
7. **What canonical identity already supplies** — game, expansion, collector number, card name, discriminator, print run, finish, language, stamp, print variation, plus presentation. Eleven dimensions, settled before any physical fact.
8. **Target command API for choosing and switching** — the existing `setCollectorCopyOffered` / `setCollectorCopyKept`, accepting `true` only. One semantic command is the right destination for a later, behaviour-neutral batch.
9. **What happens to `false`** — refused `invalid-disposition`, on both setters. It is the only production producer of a stateless durable copy outside creation.
10. **Target `addCollectorCopy` contract** — unchanged booleans, with `offered === true` XOR `keeping === true` required, refused beside the existing `disposition-conflict` check at `:967` and therefore before `ctx.id` at `:968`.
11. **`unstated`'s remaining role** — a **draft sentinel only**, renamed `"unanswered"` in `CardSpecification.jsx`. `D.copyDisposition` keeps returning `"unstated"` for copies that genuinely have none.
12. **When must a legacy stateless copy be resolved?** Only when its disposition is the thing being changed, or when it is needed for a trade (where it is already refused). Never by inference, never on a read, never as the price of an unrelated edit.
13. **What can still happen before resolution** — loading, viewing, projecting, editing grade/condition/cert/market, filing and unfiling in a Binder, removal. All unchanged.
14. **Validation at the command boundary now** — disposition required and exactly one of two, at creation and on every switch, with no mutation and no id consumed on refusal.
15. **What stays out of `validateWorld`** — the XOR requirement itself. `validateWorld` runs on load, so adding it would make every existing undecided copy a 500 rather than a refusal. It keeps today's rules: `offered` must be boolean; `keeping` boolean if present; both-true reported.
16. **Census required before hard validation** — the nine counts in §10, read-only. `offered_missing` must be zero (or migration 0012 did not run there); `both` must be zero (or rows arrived outside the domain); `neither` is the number that decides whether owners can resolve through the UI or whether a migration is needed that nobody can write honestly.
17. **Does Batch 2 require a migration?** **No.** No stored row changes shape, and no existing row becomes invalid.
18. **Does Batch 2 alter transaction semantics?** **No.** The package door, the predicates, the projections, the picker and the statuses are untouched, and the reserved-copy edge case is left exactly as it is, documented.

---

## 15. Proposed Batch 2 — one small implementation batch, not executed

**Name.** CollectorCopy Disposition Is an Explicit Choice — Implementation Batch 2.

**Start from** `03d40a1` on `phase-5-four-state`.

### Files, exactly

| File | Change |
|---|---|
| `domain/metyet-domain.js` | add `REFUSE.invalidDisposition: "invalid-disposition"` beside `invalidTier`, with the reasoning comment. **No new vocabulary constant** — the rule is "exactly one of two booleans", not a list |
| `domain/metyet-commands.js` | `addCollectorCopy`: require `offered === true` XOR `keeping === true`, immediately after the `disposition-conflict` check at `:967` and before `ctx.id` at `:968`. `setCollectorCopyOffered` and `setCollectorCopyKept`: refuse anything but `true` with `invalid-disposition`, replacing the current `not-found`-for-a-non-boolean |
| `client/commands.js` | `addOwnedCopy`: remove the `offered = false, keeping = false` defaults |
| `client/collector/CardSpecification.jsx` | `DISPOSITIONS` → two options; `BLANK_COPY.disposition` → `"unanswered"`; `asDraft` and `planFrom`'s `was` renamed; delete the two `withdrawals.push` branches at `:183`/`:185`; `localProblem` requires a disposition on every non-removed copy draft; `WHY` gains `invalid-disposition` |
| `tests/phase5-copy-disposition-explicit-choice.cjs` | new suite (below), registered in `tests/all.cjs` |
| **twelve existing suites** | re-pin, per the measurement in §13.1: **121 assertions, ~50 call sites.** `phase3-domain-readiness:146` is one edit that recovers 66 of them. `phase5-four-state-and-binder-invariant` needs tests `[4]` and `[31]` re-pinned by hand (see §13.2); `phase5-c33:1519` likewise, plus its three `disposition: "unstated"` draft fixtures at `:947`, `:1211`, `:1302`. The remaining suites are `own()`-helper call sites |

**Refusal code:** one, `invalid-disposition`. `disposition-conflict` unchanged.

### Tests

Table-driven, mirroring the Batch 1 suite's shape:
- `addCollectorCopy`: `{offered:true}` succeeds and stores Trade/Sell; `{keeping:true}` succeeds and stores PC; neither / both-absent / `{offered:false,keeping:false}` / `offered:"yes"` / `keeping:"yes"` / `keeping:null` / numbers / objects all refused; both-true still `disposition-conflict`; a refusal leaves the world byte-identical **and consumes no copy id** (counting runtime, as Batch 1's `[4b]`).
- Both setters: `true` works from every starting state; `false` refused; non-boolean refused with the new code, not `not-found`; a refusal mutates nothing.
- Switching: PC → Trade/Sell and back, each one atomic, asserting no durable stateless intermediate and that `keeping: false` is still never stored.
- Legacy: a stored undecided copy loads, validates, projects (absent from the partner's view), accepts a grade edit, files in a binder, is refused at the package door, and resolves either way — all unchanged.
- `validateWorld`: a stored undecided copy is **still valid**. This is the compatibility pin and it must fail loudly if anyone later adds the invariant there.
- The panel, mounted: a new copy draft with no disposition disables Save and shows a message; choosing either enables it; the plan emits no `offering`/`keeping` step with `false`.
- Transactions: the package door, `setInterest` and `collectorCopyStatus` behave identically.

### Bite mutations

1. Restore `offered: offered === true` / `keeping === true ? …` coercion in `addCollectorCopy` → the creation table must fail.
2. Allow `false` in `setCollectorCopyOffered` → the withdrawal tests must fail.
3. Allow `false` in `setCollectorCopyKept` → same.
4. Move the creation gate below `ctx.id` → the id test must fail.
5. Remove the panel's `localProblem` check → the mounted-panel test must fail.
6. Add the XOR rule to `validateWorld` → the legacy-loadability pin must fail.

### Checks and expected count movement

Full suite (142 suites), `npm run build`, `npm run prod`, `npm run smoke`. **Budget for the re-pinning, not just the change**: on the measurement above, the test work is the larger half of this batch, and it is the half where a careless edit silently deletes a product guarantee.

| | Before | After |
|---|---|---|
| Exposed commands | 23 | **23** |
| Domain commands | 51 | **51** |
| Migrations | 13 | **13** |
| Refusal codes | 41 | **42** (+1, `invalid-disposition`) |
| Prod bundle | 344,646 | small increase — one `WHY` string and the panel's local message |

**Rollback:** a single commit revert. No migration, no stored row changed, no `validateWorld` rule added — nothing to undo outside the source.

**Stop condition:** a new durable `CollectorCopy` cannot exist without being exactly PC or Trade/Sell; no command can return one to statelessness; every existing undecided copy still loads, renders, projects and edits exactly as it does today, and none has been assigned a disposition by inference.

---

## 16. Stop condition for this audit

Audited, not implemented. No file changed; worktree clean at `03d40a1`.

**The key question, answered:**

> The smallest truthful contract is **exact canonical identity plus exactly one disposition** — and nothing else. Physical condition is observed over time, not known at acquisition, and the one fact that cannot be deferred without the record lying about intent is the owner's intent. Existing undecided copies stay loadable because the rule lives at the command boundary and not in `validateWorld`, and they are never assigned intent because the only thing that can assign it is their owner saying so.

**Batch 2 was not begun.**
