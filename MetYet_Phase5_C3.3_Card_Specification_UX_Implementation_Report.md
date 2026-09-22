# MetYet — Phase 5 C3.3: Card Specification UX — Implementation Report

## A. Executive result

**PASS.** `npm run verify` exits 0: **125 suites, 4,086 tests**, production build **345,079 bytes**, smoke **83,686 characters**. No migration was needed and none was written.

The exit standard holds, and each half of it is tested rather than asserted:

> *A Collector can remain inside canonical Browse, inspect a card, organize it into one or more private Binders, state whether and how strongly they want it and the copy they are seeking, record/edit zero or more physical copies they own and whether each exact copy is offered, deliberately commit those independent facts, recover safely from partial failure, and close the specification surface back onto the same Browse context — without a new source of truth, without premature writes, and without leaking Binder organization to Trusted Partners.*

| Clause | Where it is proved |
|---|---|
| remains inside Browse, grid never unmounts | §E — no refetch, session unchanged, sheet rendered *after* the grid and `position: fixed` |
| organize into private Binders | §D, §G, §H — many-to-many, inline creation, nothing reaches a partner |
| state whether, how strongly, and which copy | §C — required on the canonical path, refused when unsayable |
| zero or more copies, each with its own `offered` | §G — two copies, different grades, one offered |
| deliberately commit | §F — one ordered sequence of commands that already existed |
| recover safely from partial failure | §F — the binder stands, the Goal does not, and a second Save creates exactly one of each |
| no new source of truth | §F, §H — no aggregate command, no new collection, no migration |
| no premature writes | §E — open, tick, choose, type, add a copy, Cancel → the world is byte-identical |
| no Binder leakage | §H — asserted against the whole serialised partner body |

**Three deviations from the brief, all deliberate and all narrower than the brief's text.** §I has the detail; none of them is a scope expansion.

---

## B. Verified baseline and branch

| | |
|---|---|
| Base | **`1ef3c94a65694305a8dee1b41664583f07650c5e`** — *Merge pull request #67*, C3.2 |
| Branch | `phase-5-c3-3-card-specification` |
| Commits | `47502ba` (1/2), `f74a976` (2/2), `7433dfc` (suite C–H and the decision trail), plus this report |
| Baseline verify, run to completion before editing | EXIT 0 — 124 suites, 4,030 tests, 344,035 bytes, smoke 83,686 |
| Final verify | EXIT 0 — **125 suites, 4,086 tests, 345,079 bytes, smoke 83,686** |

The baseline run finished before anything was touched. I record that explicitly because I got it wrong in both C3.1 and C3.2, starting to edit while the run was still going so that it failed on my own half-applied changes. It did not happen this time.

**Why four commits rather than one.** §4 of the brief asked for the TP regression to be "independently verifiable before the Card Specification work", so it and the grading correction shipped as `47502ba` with the whole suite green behind them. `f74a976` is the surface. A mid-batch interruption then made a preservation commit the safest thing available; the work was already complete and verified at that point, so nothing was reconstructed afterwards. `7433dfc` closes the batch with the rest of the suite and the decision trail.

---

## C. The live regression, fixed first (§4)

**What was wrong.** The shipped Trusted Partner Inventory → "Add a copy" panel let a partner choose Grade **Raw** and leave Condition on **"Not stated"** — two clicks — and then sent `{ grade: "Raw", condition: null }`. C3.2 had made that pair unsayable, so `addInventoryCopy` refused `grading-incoherent`, and the panel's error mapping had no case for it: the partner got *"MetYet would not accept that copy. Check the details and try again."* with nothing indicating which detail.

**It was a regression, verified against the old code.** `git show 202f316:domain/metyet-commands.js` shows the pre-C3.2 check was `if (copy.grade && !D.GRADED_VALUES.includes(copy.grade))`, and `"Raw"` is in `GRADED_VALUES` — so the same payload was accepted before. `addInventoryCopy` is on the production allow-list and Inventory is a live section, so it was reachable.

**What C3.3 did.** Condition is required when Raw is chosen (its empty entry is a `disabled` prompt, not an answer); changing the grade drops a condition that no longer applies; the button is disabled with a sentence saying why; and `grading-incoherent` now maps to language naming the field. The domain still decides — a test asserts the screen holds no copy of the grading vocabulary and only asks whether the one pair it has is complete.

**A second live defect, found while proving the first.** `Panel` renders its `empty` sentence *instead of* its children (`client/tp/parts.jsx:51`), so a partner whose shelf was empty pressed "Add cards" and watched nothing happen — on the first copy they would ever add.

**Fixed at the call site, not in `Panel`.** `client/tp/parts.jsx` is unchanged: rendering a sentence *instead of* an empty list is what that component is for, and every other caller relies on it. The inconsistency was Inventory passing children AND an empty sentence at the same time, so the condition moved there — `empty={live.length || adding ? null : …}` (`Inventory.jsx:129`) — along with the sentence itself, which still claimed adding a copy "isn't part of this release" and had since C1.

---

## D. One authoritative grading reading (§5)

**The gap.** `gradeLine` and `isGraded` existed twice, byte-identically, in both `present.js` files, and a third time written out inline in `Inventory.jsx` — with a fourth `/^raw$/i` in `MyCards.jsx`'s call path. None knew about `problem`, so a copy saying both `PSA 9` and `Damaged` rendered as a clean **"PSA 9"** in both seats.

**The correction, and why this shape.** The brief asked to prefer the pattern already used for derived copy `status`, and that is what this does: the projection carries `grading` from the domain's own `gradingRead`, and the presenters read it. `MyCards.jsx:17–21` had already written down the reason, about `status`, in as many words — *"a second implementation of a rule is a second answer to it, and the two would disagree on exactly the cases that matter."*

It is strictly better than the alternatives the brief warned against:

- it **removes** the second authority rather than synchronising it — after this, no client file decides what a grading string means;
- it needs no CommonJS/ESM bridge between `domain/` and `client/`, and **no domain module enters the production bundle**, which a Phase 4 test asserts by name;
- it is not "duplicate parsing moved into a new shared client authority".

**It adds no information and cannot widen a seat.** `gradingRead` is a pure function of `grade` and `condition`, both already projected to every viewer that receives the row, and `withGrading` is applied **after** `pick()` so a field the allow-list dropped is not in the row it reads. §B of the suite asserts that directly: the reading equals `gradingRead({grade, condition})` recomputed from the two projected fields, and a partner's copy of it carries neither the Collector's reference value nor their private note.

**Label parity was checked before relying on it.** `gradingOf`'s `label` reproduces the old client function in all three branches — graded → the grade; raw → `Raw · condition` or `Raw`; unstated → the condition or null — so no screen changed what it says.

**Three call-site corrections came with it.** `MyCards.jsx` read grading from the *legacy catalogue row*, which has been wrong since Batch 5 moved grade and condition onto the copy: a canonical copy has no catalogue row, so it showed **no grading at all**. It reads the copy now. `Inventory.jsx` lost its inline third implementation. Both seats now render a contradictory copy with an amber "Says PSA 9 and Damaged" tag instead of a clean grade.

---

## E. `updateGoalCriteria`, and where the requirement landed (§3.2, §9, §11)

**Why a command rather than remove-and-recreate.** Not a preference — the alternative is defective in three separate ways, and the first is disqualifying:

- **it is impossible exactly when it matters most.** `removeGoal` refuses `goal-locked` while an Opportunity is active, so a Collector mid-negotiation could never correct the criteria their partner is working from. §C tests precisely this: the removal is refused, the correction succeeds, and the deal is untouched.
- **it is destructive.** `createdAt` is the first step of the only funnel this product has, and Batch 8.1 added it *because* overwriting it had made that moment unrecoverable. `since`, `confirmedAt` and `secondarySince` would go the same way.
- **it is visible to the other seat** as demand disappearing and coming back as new.

**Semantics.** Owner-only; changes `desired` and nothing else; the same shape and coherence checks `addGoal` makes, including the non-string guard that exists because `gradingProblem` reads a number as "not stated" and would otherwise write `{ grade: 9 }` as *no criteria*; idempotent; and **not blocked by an active Opportunity**, because nothing derives from criteria — Discovery reads none of it, asserted against the source.

**Where the requirement is enforced, and why not globally.** The brief said to *"enforce the stronger rule at the smallest authoritative production-canonical boundary"*. Measured before choosing:

Measured at `1ef3c94`, before any change — re-running the same greps today returns 44/11/18, the drift being C3.3's own new suite:

| Scope | Test files affected | Other breakage |
|---|---|---|
| Global on `addGoal` | **43** | the demo prototype's 3 call sites, which use the legacy `cardId` path and have no grade control |
| Canonical only (`canonicalCardId`) | **10** (16 call sites) | none |

So the rule is: **a Goal that names a `canonicalCardId` must state which copy it wants.** That is every Goal the production product can create. The legacy `cardId` path keeps its behaviour, for the same reason `exposed-commands.js` gives about `resolveCardIdentity` — rewriting the demo is a much larger batch wearing this one's name.

**`validateWorld` was deliberately not changed.** The requirement is a *creation* rule, not a world invariant. Goals written before today have no `desired`, remain valid, remain editable and removable, and are never filled in. §C tests all four.

**Clearing.** Allowed on a legacy Goal, refused (`criteria-required`) on a canonical one — a command that let a canonical Goal be emptied would be a way back to a state the product no longer creates. The brief permitted this judgement (*"if that matches current domain representation"*).

---

## F. The panel (§6, §7, §8, §10, §11)

`client/collector/CardSpecification.jsx`, 579 lines. It holds the person's **answers**; the projection holds the truth.

**Initialisation is a pure function of the projection** — `initialAnswers(state, canonicalCardId)` — with no fetch and no loading state, because everything durable is already in the Collector's own projection whole: `binders`, `binderEntries`, `goals` (including `desired`), and `collectorCopies` (including `market`, `offered` and derived `status`). Two rules are pinned:

- a Goal with **no** criteria opens with **empty** controls and a sentence saying so — never Raw / Near Mint;
- a card with **no** copies opens with **no copy rows** — a pre-filled blank form is the product answering "how many do you own" with "one".

**Binder composition.** A checkbox list of every binder the person has, with inline creation. Inline creation was not optional: **nothing in the repository ever creates a Binder** — not registration, not a default, not a seed — so every pilot Collector has zero, and an Organization section without `createBinder` would be an empty list above a control that cannot be used. That is the impossible screen C2 documented for Your Cards and refused to repeat.

**Ownership** is a list, never a boolean. Each row carries its own grade, condition, certificate, reference value and `offered` checkbox, and a new copy starts **unoffered** whatever the others say. Desired grading and actual grading are kept apart by asking two different questions — *"Which copy are you after?"* versus *"What is this copy?"* — in visually separated sections.

**A contradictory legacy copy** shows both halves with an amber note, cannot be saved until the pair is coherent (the domain refuses it, checking the **merged** record), and does not block unrelated binder or goal edits on the same card.

**Browse continuity by construction (§11).** The checkpoint found that the panel rendered *above* the grid in normal flow, so opening it pushed everything down the page while the window's scroll offset stayed put. The sheet is now taken out of flow by `.mcs-spec-scrim` (`CollectorShell.jsx:185`, `position: fixed`) and rendered *after* the grid — a sheet on a phone, a side panel on a wide screen. Nothing moves behind it, so nothing has to be saved or restored, and **no scroll-restoration machinery was built**. A test asserts none was.

Card click and `+` remain **one call**, as they already were. The brief allowed a small focus difference; I did not add one, because two code paths to one durable outcome is two things to keep agreeing.

---

## G. Commit, partial failure and retry (§12, §13)

**Sequential existing commands. No orchestration aggregate.** Save computes the difference between the projection and the answers and runs it as an awaited sequence:

```
make-binder → file → unfile → wanted-copy → how-hard →
stop-looking → start-looking → correct-copy → offering → forget-copy → record-copy
```

**The order is chosen for what a failure leaves behind.** Organisation first because filing a card is the most reversible thing here and entangles nothing; **new physical copies last** because a duplicate copy is a legitimate thing to own, so nothing downstream can distinguish an accidental resend from a real second copy. Criteria before tier, so a Goal a partner is already working from becomes *more precise* before it becomes *more urgent*.

**Idempotence, verified command by command** — this is what the retry policy is built on, and it is not uniform:

| Safe to resend | Not safe |
|---|---|
| `addBinderEntry`, `removeBinderEntry` (idempotent by content), `updateGoalTier`, `setCollectorCopyOffered`, `updateCollectorCopy`, `updateGoalCriteria` (no-op when unchanged), `addGoal` / `removeGoal` (refuse rather than duplicate) | **`createBinder`** and **`addCollectorCopy`** — both mint identity |

A client-supplied id does **not** help: under the authoritative runtime `ctx.id` always mints and ignores a proposal (`metyet-runtime.js:150–154`). I checked that specifically, because the payload accepts `copy.id` and assuming otherwise would have been an easy and wrong shortcut.

**So nothing is ever retried automatically.** Retry is the person pressing Save again, and the panel makes that safe: the sequence stops at the first refusal, the panel stays open with the answers intact, and the difference is **recomputed against the projection the server just returned** — so whatever succeeded is no longer a difference. §F proves it end to end: first press makes the binder and is refused on the Goal; second press sends `file, start-looking, record-copy` and the world ends with **exactly one binder, one entry, one goal and one copy**.

**Partial success is legible.** `explain()` names what stood, what failed, why, and that pressing Save again sends only what is left. A commit that partly worked never reports success and never reports a bare failure.

**Cross-concept atomicity is not required and was not invented.** A half-applied commit leaves several true statements — the card is filed, the Goal is not set — not a corrupt record. A test asserts `validateWorld` is satisfied after a partial commit.

---

## H. Exposure (§3.4, §14)

**9 → 14**, pinned by exact value and by count in four separate suites.

| Command | Control | New boundary tests |
|---|---|---|
| `createBinder` | "New binder…" | wrong seat → `not-owner`; blank name → `name-required`; a payload naming an owner is ignored |
| `addBinderEntry` | the checkboxes | wrong seat and non-owner refused; another Collector's binder refused; unknown card → `card-unavailable` **through the guard C3.1 wrote and could not reach**; idempotent, original `addedAt` stands |
| `removeBinderEntry` | the checkboxes | wrong seat / non-owner refused; unfiling leaves the Goal, the copies and `offered` untouched |
| `updateCollectorCopy` | the copy fields | non-owner refused; `canonicalCardId` → `identity-immutable`; `offered` in the patch → `identity-immutable`; incoherent merged record → `grading-incoherent` |
| `updateGoalCriteria` | grade wanted | non-owner refused; incoherent refused; id, card, tier and all four timestamps preserved; correction under an active Opportunity succeeds |

Plus: an unauthenticated caller reaches none of the five (401), and `renameBinder`, `setBinderArchived` and the whole negotiation lifecycle still answer `command-unavailable`.

---

## I. Deviations from the brief

**1. The criteria requirement is scoped to the canonical path, not to `addGoal` globally.** The brief invited this (§9: *"enforce the stronger rule at the smallest authoritative production-canonical boundary"*) and the checkpoint recommended it; §E above has the measured blast radius. Stated as a deviation because §3.4's plain reading is a global rule.

**2. Clearing criteria is refused on a canonical Goal.** §3.2 said to support clearing *"if that matches current domain representation"*. It does not: after C3.3 a canonical Goal states which copy it wants, and a command that emptied one would be a route back to a state the product no longer creates. Legacy Goals can be cleared. The conditional in the brief is what permits this.

**3. Two fixes outside the batch's nominal scope, both one condition each.** The `Panel`-hides-children defect (§C) was blocking the very flow §4 asked me to fix, and its empty sentence was factually wrong. Neither is a TP Inventory redesign.

**Two rules I broke and the tests caught**, recorded because the tests deserve the credit rather than me:

- the panel **named commands** (`addGoal`, `createBinder`…) in its step kinds, which a Collector surface may not do. It speaks its own vocabulary now — `file`, `how-hard`, `record-copy` — and `SignIn.jsx` maps them at the boundary that already holds every other binding. This is better than what I first wrote.
- the panel **compared `o.stage`** to decide whether a live deal locked a Goal, which is a second implementation of a lifecycle rule the server owns. "Not looking" is now always offered and `removeGoal`'s `goal-locked` refusal explains itself.

---

## J. Tests and evidence

**New suite: `tests/phase5-c33-card-specification.cjs`, 1,405 lines, 54 tests**, eight sections: A the raw condition, B one grading reading, C criteria on a Goal, D the door, E the panel, F the commit, G independence, H privacy. It drives the **real components** through `react-test-renderer` against a **real server, real repository and real catalog** — no new infrastructure; C1 established the harness.

**On what "the grid stayed put" is allowed to mean.** `react-test-renderer` has no DOM and no scroll, so no test claims a pixel position. What is asserted is the *mechanism*: no refetch (call-counted on the browse door), the session is not rewritten, and the sheet is rendered after the grid and is `position: fixed`. That is a real guarantee; "scroll survived" would not be, and the brief said not to claim it.

**Thirteen superseded pins restated, none loosened** — four in commit 1/2, nine in 2/2. Each carries the repository's three-part explanation — what it protected, why it is no longer correct, what replaces it and why that is stricter. Highlights:

- the two projection allow-lists now name the derived key **and open the reading to check what is inside it**, because a derived field is a new way for a private fact to travel;
- the TP presenter test asserts the same six cases against readings the **domain** produces, and adds two the old form could not make (a row with no reading is not parsed; a contradiction is not shown clean);
- the Collector fixture gives a copy and its card **different** grades, so which one the screen reads is provable — the old form could not tell them apart;
- C3.2's "the door is exactly where C3.1 left it" is now checked **against C3.2's own implementation commit** (`2a5e988`, merged as `1ef3c94`), which is the claim that batch actually made and stays true after later batches move on.

One assertion was **narrowed rather than restated**: `phase5-b7`'s "a priority change carries no card" sliced the source from `updateGoalTier` to `confirmGoal`, and `updateGoalCriteria` landed between them, so it was reading a command it was never about. The boundary is named now, the rule is untouched, and a companion test applies the same rule to the new command's payload.

---

## K. Files changed

29 tracked files, **+3,230 / −283** against `1ef3c94` — 30 counting this report.

| Area | Files |
|---|---|
| New | `client/collector/CardSpecification.jsx` (579), `tests/phase5-c33-card-specification.cjs` (1,405) |
| Domain | `metyet-commands.js` (+88), `metyet-projection.js`, `metyet-domain.js`, `README.md` (+115/−3) |
| Server | `exposed-commands.js` |
| Client | `Browse.jsx`, `CollectorShell.jsx`, `commands.js`, `production-app.jsx`, `SignIn.jsx`, `MyCards.jsx`, both `present.js`, `tp/sections/Inventory.jsx` |
| Tests | 12 existing suites, plus `all.cjs` |

**No migration. No client file outside `client/`. No demo prototype change** (`src/`, `shell/`, `collector/`, `site-src/` untouched). **No catalog or provider ingestion.** No secrets accessed or printed. Unrelated `Claude outputs/` and the other seventeen worktrees untouched.

---

## L. Explicit non-goals confirmed absent

Durable Draft · Bookmark · pending-interest queue · persisted Collector defaults (**none at all** — the panel needs no defaults, and every control is one tap from its answer) · `collectors.prefs` reuse · four-valued Intent · mutually exclusive Want/Own · public or shared Binders · TP Binder visibility · persisted Trade Binder · Binder rename/archive/list/detail · full Your Cards management · **promotion of the known-broken canonical Your Cards surface** (still in `DEFERRED_SECTIONS`) · TP Make an Offer · multi-card offers · reputation or scoring · automatic Interest cleanup · grade-filtered or ranked Discovery · multiple Goals per canonical card · new graders · provider/catalog ingestion · Opportunity/Deal redesign · broad navigation redesign · canonical-card mirror in the transactional world · orchestration aggregate · scroll-restoration registry.

---

## M. Remaining debt

1. **`MyCards.jsx` still resolves its TITLE from the legacy catalogue by `cardId`**, so a canonical copy reads "a card that isn't in your catalogue". C3.3 fixed the grading; the title needs the `describe(ids)` call `Goals.jsx` already uses. The section stays in `DEFERRED_SECTIONS` and C3.4 owns the fix — promoting it now would have shipped a broken screen.
2. **A condition with no grade is still permitted** (`{ condition: "Damaged" }`), reading as `unstated` with a condition. Requiring a grade whenever a condition appears would be a new rule that could invalidate live inventory. Unchanged from C3.2; decide with pilot evidence.
3. **Scroll is still not restored across a SECTION change.** `<main key={section}>` remounts, and no code saves the offset. C3.3's flow never leaves Browse, so this was out of scope; the Trusted Partner shell is in the same position (`.tps-scroll` is named for a scroll container but has no `overflow`, so both shells scroll the document).
4. **`metyet.interests` has no database uniqueness** on `(partner_id, binder_id)`. Unchanged since C3.1.
5. **The `binder_id` naming collision persists.** C3.3 writes `binder_entries.binder_id` (a Binder) and reads `interests.binder_id` (a collector copy) in the same batch and renamed neither, as instructed. Documented in `domain/README.md`.
6. **`identityFrom` still folds grade and condition into card identity** on the legacy prototype path. Demo-only; flagged since the C3 checkpoint.

---

## N. The C3.4 boundary

C3.3 lets a person say where **the card in front of them** belongs. C3.4 owns:

- Binder **list and detail** surfaces; `renameBinder` and `setBinderArchived`, which stay unexposed because no control here sends them;
- the **Your Cards** screen, including debt item 1;
- the derived **Trade Binder** view over `offered === true` — still derived, never persisted;
- whether the Goals screen keeps its lightweight tier flip as a second surface with a lighter rule (§3.1 locked it in for the pilot; it remains an open product question rather than a defect).

---

## O. Handoff

| | |
|---|---|
| Branch | `phase-5-c3-3-card-specification` |
| Base | `1ef3c94a65694305a8dee1b41664583f07650c5e` |
| Commits | `47502ba`, `f74a976`, `7433dfc`, plus this report |
| Verified state | `7433dfc` — the working tree at the final verify and the commit are the same content |

Push is unavailable from this environment and no credentials were requested or handled — the cloud proxy answers `Davi17000/metyet-app is not in this session's authorized repository set` with HTTP 403, and the Mac has no credential helper and no `gh`. The branch is delivered as a verified git bundle. After importing:

```bash
cd ~/Documents/GitHub/metyet-app
git push -u origin phase-5-c3-3-card-specification
```

Then open a PR against `main`. **Not merged as part of this batch.**
