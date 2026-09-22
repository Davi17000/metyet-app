# MetYet — Phase 5 C3.4: Binder + Your Cards — Implementation Report

**Branch** `phase-5-c3-4-binder-your-cards`
**Baseline** `8c61ec89861b8a08f05af612f3124cbe3de9d4a1` (PR #68 / C3.3)
**C3.4a** `00dee91f19e985eae30dd8ec12fd7b077b1c0471` — *Your Cards, reachable at last*
**C3.4b** `add9ceb` — *Binder, and Goals stops being a place*
**Not merged.** Stopped for review, as instructed.

---

## 1. Verified before editing

| Fact | Expected | Found |
|---|---|---|
| `main` | `8c61ec8…` | `8c61ec8…` ✔ |
| Suites / tests | 125 / 4,086 | 125 / 4,086 ✔ |
| Production build | 345,079 bytes | 345,079 ✔ |
| Prod smoke | 83,686 chars | 83,686 ✔ |
| Newest migration | `0013_binders.sql` | `0013_binders.sql` ✔ |

Nothing differed, so no repair of unrelated failures was needed or attempted.

---

## 2. What was built

### The product correction, and what followed from it

The brief superseded the checkpoint's recommendation to keep a top-level Goals
tab. **Binders express coherence. Goals express priority.** They stay two
independent durable facts and stop being two destinations.

Production Collector navigation is now **Browse · Binder · Your Cards ·
Trusted Partners**.

Removing the tab put one obligation on the batch — *it must not hide a Goal* —
and that obligation shaped most of the work below.

### C3.4a — Your Cards (`00dee91`)

`MyCards.jsx` was rewritten card-first. It had been deferred since Batch 8.1 for
reasons that expired one at a time; the last one was its own naming, which
resolved titles through the **legacy** catalogue by `cardId`, so every
production copy rendered as "a card that isn't in your catalogue".

- Titles, sets, numbers and images now come from one batched canonical
  `onBrowseCards.describe(ids)` for the ids already on screen — the pattern
  Goals has used since Batch 7.
- Card is a heading; the physical copies are the records beneath it. **Nothing
  is aggregated to the heading** — no grade, ever, because two copies of one
  card are two objects and a single grade would describe neither.
- Each copy keeps its own projected authoritative `grading`, certificate,
  reference value, status and `offered`.
- A quiet Primary/Secondary indicator when a Goal exists, so Want and Own stay
  visibly independent.
- One derived **Offered only** filter over exact copies where `offered === true`.
- The group and each copy open the same `CardSpecification` panel, rendered as a
  sibling in a `.mcs-spec-scrim` so the list behind it is never unmounted.

**No allow-list change in C3.4a.** That was the recovery seam's whole point, and
it is now pinned against C3.4a's own commit rather than against a live reading
(see §5).

### C3.4b — Binder (`add9ceb`)

**`client/collector/sections/Binder.jsx`** (new, 332 lines) is a library and a
detail view in one section.

*The library* lists active binders newest-first with name and card count, a
create control, a quiet reveal for archived binders, and the derived
"Not in a binder yet" list. No dashboard, no recommendations, no analytics.

*A binder's detail* shows, per card: the catalogue's picture, the card name, the
set and collector number, and — only when a Goal exists — "Actively hunting" or
"Keeping an eye out". **Nothing about copies.** The checkpoint's proposed
`"Actively hunting · own 2 · 1 offered"` line is deliberately not built: priority
belongs here because a Goal refines a coherent binder, but ownership and
availability are facts about a shelf, and Your Cards is the shelf.

*Lifecycle.* Create, rename in place, "Put away", "Bring back". Archived binders
are hidden behind one control rather than moved to a second screen. Entries
survive; Goals and copies of those cards are untouched. There is no delete,
because the domain has none.

*"Not in a binder yet"* is derived on every render from the binders and entries
the server sent: the Goals whose `canonicalCardId` is in no **active**
BinderEntry. There is no record, no synthetic binder and no persisted
membership. File one and it leaves on the next authoritative refresh; remove the
last active membership and it returns; archive the only binder holding it and it
returns too, because the question the list answers is about the binders a person
is actually using. Stop looking and it is gone.

*Add cards.* "Add cards" puts `{binderId, name}` in the shell's transient state
beside the browsing session and moves to Browse. Browse says quietly "Adding to
**X**" with one control to stop. `CardSpecification` gained one prop,
`preselectBinder`, which ticks that binder as an **answer** the person can untick
— it writes nothing until Save, Cancel forgets it, and a binder that is put away
is never preselected and is not offered. Pressing Binder while filling returns to
that binder's detail rather than the library, by reading the context the shell is
already holding.

*Navigation.* `Goals.jsx` was **not deleted**. It moved into
`DEFERRED_SECTIONS`, the declared place a built screen waits — the second use of
that list, and the first in this direction.

### Command exposure

`server/exposed-commands.js`: **14 → 16**, verified by value and by count, not
assumed.

| Command | The control that sends it |
|---|---|
| `renameBinder` | "Rename", inline in the library |
| `setBinderArchived` | "Put away" and "Bring back" — one reversible `set`, so restore is not a second concept |

`markBinderReviewed` remains **closed**. It is the legacy "a partner opened this
Collector's cards" command and shares nothing with a Binder but its name; that
is now asserted by name in five suites rather than implied by a list.

---

## 3. What was not built, on purpose

No persisted Trade Binder, synthetic Unfiled Binder, Binder snapshot, Your Cards
aggregate, durable draft, Bookmark, pending queue, persisted default, Intent
enum, or duplicated canonical metadata. No `collectors.prefs`. No
scroll-restoration infrastructure. No Buy/Sell surface. No Binder delete. No
`saveCardSpecification` aggregate command. No new partner-facing projection
field. No refactor of `CardSpecification` for symmetry, and no shared
description hook — the third caller's fetch is not identical to the other two, so
extracting one would have changed semantics to buy tidiness.

**No migration.** `0013_binders.sql` is still the newest. C3.4 adds no durable
concept.

---

## 4. Deviations from the brief, and why

**1. "Newest first" is day-granular, not instant-granular.**
The brief says "newest first *if existing ordering supports it*". The existing
ordering is `byRecency`, which reads a **day**, because that is what every other
recency-ordered surface in this product shows. Binders created on different days
come back newest first; binders created on the same day keep the order the
server sent. A finer sort here would be a second ordering authority for one
screen. Both behaviours are asserted, separately and by name.

**2. A legacy Goal that names no canonical card reaches no surface.**
A pre-C2 Goal names `cardId` and nothing canonical. It cannot be described,
cannot be filed, and cannot be specified — so it is deliberately not listed under
"Not in a binder yet", a list whose every row promises all three. Before this
batch the Goals tab showed it; after it, nothing does. Production cannot create
one: a legacy `addGoal` needs a row in the LEGACY catalogue, and production's is
empty by design, so it is refused `not-found` — the same wall that kept Your
Cards deferred for four batches. This therefore affects only pre-C2 imported
data. It is recorded in `domain/README.md` and
pinned by a test, rather than left to be discovered.

**3. "Return to the same Binder detail context" is scoped to the filling trip.**
The brief asks for it; the debt boundary says to *accommodate* the
`<main key={section}>` remount rather than fix it. Both are satisfied by reading
the transient `fillingBinder` the shell already holds for Browse's sake: while a
binder is being filled, Binder opens on it. After "Stop adding to it", Binder
opens on the library. No second memory, no restoration machinery, two lines of
code. General section-state preservation remains unbuilt.

**4. `Goals.jsx` was moved into `DEFERRED_SECTIONS`, not left orphaned.**
The brief said not to *needlessly delete* it. Leaving it imported by nothing
would have been deletion by neglect; the deferral list is the repository's own
declared place for a screen that may be wanted again, and the shell's existing
`show()` convention already renders deferred views directly, which is how the
suites that exercise Goals still exercise it.

**5. Three existing tests in `phase5-b8-opportunity-discovery.cjs` now render
the Goals view instead of pressing a tab.** They read the discovery sentence off
the goal list, and there is no button to press. They render the view *and the
props* the shell declares for it, rather than importing `Goals.jsx` directly —
which is stricter, because a change to what the shell hands Goals would change
what these render too.

No deviation weakens an architectural or privacy assertion. None was made to get
a test to pass.

---

## 5. Superseded pins, restated

Twelve suites carry restatements, each in the repository's three-part form —
what it protected, why it is no longer correct, what replaces it and why that is
stricter. None was loosened. The substantive ones:

| Where | Was | Now |
|---|---|---|
| `phase5-c2-collector-copy.cjs` | `STILL_C34 = ["renameBinder","setBinderArchived"]` | `STILL_C34 = []` — the batch it named arrived. The Binder command **table** is still pinned exactly, and `markBinderReviewed` is now asserted shut by name |
| `phase5-c2` | "no file is named Binder", "no Binder in the navigation" | asserted against **C2's own commit** (`4095a95`), reading its two frozen section lists rather than its prose — C2's shell says "Trade Binder" in a sentence, which is not a destination |
| `phase5-c31`, `c32`, `c33`, `c1` | allow-list `14` | `16`, still by value **and** by count |
| `phase5-c33` | "C3.3 opened five doors" as a live reading | asserted against **C3.3's own merge** (`8c61ec8`), where it stays true forever |
| `phase5-c34a` | "C3.4a opened no door" as a live reading | asserted against **C3.4a's own commit** (`00dee91`) — the recovery seam held to its own promise, which a live reading could not do once C3.4b landed |
| `phase5-c31` | "the two with no surface are unreachable" | the **one** command that is not a Binder command — `markBinderReviewed` — is unreachable |
| `phase4-collector-production-shell`, `b81` | `DEFERRED_SECTIONS` is empty | `DEFERRED_SECTIONS` is `["goals"]`, **and every id in it has a live component**, which is the property "deferring never became deleting" actually needs |
| `phase4-tp-production-shell`, `phase4-integration-closeout`, `phase4-collector-read-experiences` | NAV containing Goals | NAV = Browse · Binder · Your Cards · Trusted Partners |
| `phase4-integration-closeout` | press Goals, read the goal's note off the screen | the goal is read **out of the projection the real server sent to the real client**, with its note *and* its tier — the seam this test is about, checked at the seam |

Moving three claims onto their own commits is the change worth noticing: a pin
that asserts "this batch did X" against a live reading can only ever be deleted
by the next batch. Against a commit, it survives.

---

## 6. Evidence

**New suite** `tests/phase5-c34b-binder.cjs` — 63 tests, sections A–H:

- **A. the library** (7) — empty state, saying what a binder is and is not;
  creating one, with a blank name refused *before* it is sent; name and card
  count and nothing else, with owned and offered copies present so a count of
  either would have had something to show; newest-first by day; same-day
  stability; rename in place keeping every card; Cancel writes nothing.
- **B. put away** (5) — leaves the library and is not gone; hidden by default,
  revealed, brought back with its card; archiving touches archive state only
  (entries, Goals, copies, name, `createdAt` all byte-compared); renaming
  touches the name only; there is no delete, here or in the domain.
- **C. inside a binder** (8) — picture/name/set/number; Primary and Secondary
  only where a Goal exists; a card with neither Goal nor copy stays filed; **no
  ownership or availability telemetry however much of it is true**, asserted on
  the screen *and* against the source; empty binder; one card in several
  binders, one entry each; the panel opens with the binder still mounted behind
  it and **the file names no exposed command**; one `describe` for three cards.
- **D. not in a binder yet** (8) — listed with priority; no synthetic record;
  filing removes it on refresh; removing the last **active** membership returns
  it; archived-only membership counts as unfiled *and the entry is untouched*;
  stopping looking removes it; click opens the same panel and there is only one
  such file; a legacy Goal is not dressed up as a canonical one.
- **E. add cards** (9) — Add cards enters the real Browse and says which binder;
  transient, writing nothing, ended by one press; nothing persisted and
  `0013_binders.sql` still newest; preselected and untickable; an archived binder
  neither preselected nor offered; Cancel writes nothing; **pressing Binder while
  filling returns to that binder**, and to the library once filling stops; Save
  files into the binder they came from through C3.3's grammar; Save after
  unticking files nothing.
- **F. the two new doors** (12) — sixteen by value and count; the added two are
  exactly those two and nothing was closed, diffed against C3.3's commit;
  `markBinderReviewed` shut for both seats; the deal lifecycle unmoved; an
  unknown name refused **byte-identically** to a closed one (request id aside);
  owner only — other Collector, partner and unauthenticated all refused and
  nothing stuck; blank rename refused; unknown binder not found for everyone;
  archive idempotent both ways; rename never mints; **HTTP proof** that putting
  one away leaves entries, Goals and copies intact; the client binds both
  through the same `execute`.
- **G. privacy** (6) — a distinctively renamed, filed, archived binder is
  nowhere in a partner's view, and the collections are **present and empty**
  (an absent key would itself leak which seat it is); another Collector receives
  nothing; **membership is not demand** — filing creates no discovery and no
  Goal; no row anywhere grew a binder-shaped field; opening Binder and a binder
  and coming back leaves the world byte-identical with no Interest, activity or
  review; the section re-implements no scoping rule.
- **H. the navigation** (8) — exactly `Browse · Binder · Your Cards · Trusted
  Partners`; Goals deferred with a live view and `Goals.jsx` on disk; no Buy,
  Sell, Trade Binder, dashboard or discover; Goal priority still reachable and
  still editable through the panel; **a Goal survives filing, unfiling and
  archiving, and removing a Goal unfiles nothing**; the nav count is a row
  count; `0013_binders.sql` newest and 49 commands; a historical criteria-less
  Goal is still listed, still opens, and `updateGoalCriteria` still reaches it.

`tests/phase5-c34a-your-cards.cjs` — 18 tests, sections A–F, committed in
`00dee91` and restated here where C3.4b superseded two of its claims.

### Final verification

```
127 suites / 4,168 tests      ALL SUITES PASSED
PRODUCTION BUILD OK — bytes: 345,079
PROD SMOKE OK — rendered 83,686 chars
newest migration: 0013_binders.sql
```

Build bytes and smoke chars are unchanged from baseline, which is expected and
is itself a check: `prod.build.mjs` builds `src/MetYet.jsx`, the demo prototype,
so those numbers move only when the domain sources change. C3.4 changed no
file under `domain/` but its README.

The whole diff against the baseline was read for scope, and the changed files
scanned for credentials; nothing was found and no secret, OTP, database URL or key was
requested, printed or handled at any point.

---

## 7. Three things worth flagging

**The new suite was written but not registered.** `tests/all.cjs` is an explicit
list, and the first full run after writing 63 tests reported 126 suites and
4,105 — a *pass*, with the new file never executed. It was caught by checking
the totals against what they should have been, not by the runner. Registering it
gave 127 / 4,168. Worth knowing that a suite can be added and silently not run.

**Removing one navigation entry broke fifteen tests across eleven suites, and
that was informative rather than annoying.** They failed for three different
reasons: the `NAV` constant that two suites use to recognise the Collector app
at all (`looksLikeCollectorShell` / `hasNav`); a direct `clickText(r, "Goals")`
in four more; and explicit pins on the section and deferral lists in the rest.
It shows how much of the test estate reads the navigation as the product's
identity — a good property, and a reason no navigation change is ever small.
Every one was repaired by restating the pin, never by weakening it.

**A fixture was asserting that zero equals zero.** `FULL` in
`phase4-collector-production-shell.cjs` had no binders, so the moment the nav
count became Binder's, `assert(/0 Binder/)` would have passed while proving
nothing. It was given a binder and an entry. Worth remembering when a count
moves from one collection to another: the fixture that satisfied the old
assertion may make the new one vacuous.

---

## 8. Remaining debt

| Debt | Status |
|---|---|
| `binder_entries.binder_id` (a Binder) vs `interests.binder_id` (a collector copy) | Documented again in `domain/README.md`; not migrated. A rename is a migration plus every reader of the trade model |
| `<main key={section}>` remounts a section | Accommodated. The filling trip preserves its own context; general section state does not survive a tab change |
| Legacy Goals with no `canonicalCardId` reach no surface | Deliberate (§4.2), documented, pinned by a test. Production cannot create one |
| Condition-without-grade historical behaviour | Deferred, as instructed |
| Interest DB uniqueness | Deferred |
| Prototype `identityFrom` debt | Deferred |
| Binder delete | Not built. Whether the product should ever truly delete one is a question pilot evidence has not been asked |
| Push to GitHub | Unavailable from this environment; delivered by bundle (below) |

---

## 9. Hand-back

| | |
|---|---|
| Branch | `phase-5-c3-4-binder-your-cards` |
| Baseline | `8c61ec89861b8a08f05af612f3124cbe3de9d4a1` |
| C3.4a | `00dee91f19e985eae30dd8ec12fd7b077b1c0471` |
| C3.4b | `add9ceb` |
| Files changed vs baseline | 24 files, +3,238 / −220 |
| — C3.4a | 7 files, +987 / −134 |
| — C3.4b | 23 files, +2,295 / −130 |
| Allow-list | 14 → **16** (`renameBinder`, `setBinderArchived`) |
| Domain commands | 49, unchanged |
| Suites / tests | 125 / 4,086 → **127 / 4,168** |
| Build | 345,079 bytes (unchanged) |
| Smoke | 83,686 chars (unchanged) |
| Migrations | unchanged; `0013_binders.sql` newest |
| New production file | `client/collector/sections/Binder.jsx` |
| New test file | `tests/phase5-c34b-binder.cjs` |
| Report | `Claude outputs/MetYet_Phase5_C3.4_Binder_Your_Cards_Implementation_Report.md` |

**Not merged.** Direct push remains unavailable from this environment (the cloud
proxy refuses the repository and the Mac has no credential helper or `gh`), so
the commits are delivered by the established bundle route and the branch is left
intact for review.
