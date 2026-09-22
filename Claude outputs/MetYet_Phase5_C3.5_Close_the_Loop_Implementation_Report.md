# MetYet — Phase 5 C3.5: Close the Loop — Implementation Report

**Branch** `phase-5-c3-5-close-the-loop`
**Baseline** `aef60e4e7d375954e8070f5c13b2dfb9ffd5ff8e` (PR #69 / C3.4)
**Implementation** `54c004b` — *the answer, not the tab*
**Not merged.** Stopped for review, as instructed.

---

## 1. Baseline gate

| Fact | Expected | Found |
|---|---|---|
| `main` | `aef60e4e…` | `aef60e4e…` ✔ |
| Suites / tests | 127 / 4,168 | 127 / 4,168 ✔ |
| Build | 345,079 bytes | 345,079 ✔ |
| Smoke | 83,686 chars | 83,686 ✔ |
| Newest migration | `0013_binders.sql` | `0013_binders.sql` ✔ |
| Allow-list | 16 | 16 ✔ |

Nothing differed, so nothing unrelated was repaired.

---

## 2. What was built

### The Collector half — Trusted Partners answers the Goal

`client/collector/sections/TrustedPartners.jsx` keeps its shape: the shops are
the objects, and each one's relationship facts come first. Underneath a shop
that has something, one sentence and then the cards:

> **Northline has 2 cards you're looking for.**
> 🂠 Charizard · Base · #4 · *Actively hunting*
> 🂠 Mudkip · Base · #63 · *Keeping an eye out*

- The sentence is said **once per shop, with the shop's name in it** —
  `hasWantedLine` in `client/collector/present.js`, the shop-side twin of
  `holdingLine`. It counts **cards this Collector asked for**, never the shop's
  copies: one is a fact about what you said, the other is a fact about their
  shelf.
- A shop with nothing of yours renders **nothing** — not "0 cards you're
  looking for", which reads as a judgement on a shop that has done nothing
  wrong.
- Each card is identified through the **existing catalog description
  boundary**: one batched `onBrowseCards.describe(ids)` for the ids already on
  screen, exactly as Goals has asked since Batch 7. A card the catalogue has
  not described yet still renders — the shop still has it.
- Priority is shown in the words a person reads — *Actively hunting* /
  *Keeping an eye out*. The test reads the tier tags **off the tree** and holds
  them to exactly those two strings, because the real risk on this seat is
  `tierIntent` failing and the row falling through to `tierLabel`, which here
  says the bare word "Primary".

**What the row deliberately does not carry:** the ask, the grade of their copy,
how many they hold, and `invId`. A price and a grade belong to a conversation
nobody has started, a count there would read as stock, and `invId` is the
server's internal handle on one physical copy — printing it would turn a private
identifier into something a person learns to quote.

Beyond the projection every section gets, the shell hands this one a **single**
additional prop — `onBrowseCards` — and it is a read. No command callback
reaches it.

### The TP half — which copy the Collector wants

`client/tp/sections/CollectorNetwork.jsx` renders `goal.desired` as its own line
in the existing goal list, via `desiredLine` in `client/tp/present.js`:

> Charizard · Base · #4 · holofoil · first_edition   **[Primary goal]**
> Casey is actively looking for this card.
> **Looking for: PSA 10**
> *their own note*

`desired` has crossed the seat boundary in `GOAL_FOR_PARTNER` since C3.2 and no
partner screen rendered it. This is the reader and nothing more.

**Two facts stay two facts.** Primary/Secondary says *how hard*; `desired` says
*which copy*. They are separate sentences, asserted as separate elements rather
than as separate words — a flattened string reads the same either way.

A goal that named no copy renders **nothing**, not "any". An unspecified goal is
a real thing a Collector may have, because criteria were not required until
C3.3, and the honest answer is silence.

### One thing I got wrong, and the test that caught it

`desiredLine` first asked whether the grade was `"Raw"` so it could drop a stray
condition beside a graded want. Two existing pins failed —
`phase5-c33-card-specification.cjs:403` and `phase4-tp-read-experiences.cjs:428-429`
— both asserting that `client/tp/present.js` carries no raw-versus-graded rule.

**The pins were right and my code was wrong.** A presenter that works out what a
grading pair *means* is a second authority, which is exactly what C3.3 removed
for copies by projecting `grading`. `desired` is not a copy and carries no
projected reading — but the answer is not to re-derive one, it is to stop
needing one.

`desired` is already coherent by the time it is stored: `CardSpecification`
drops a condition with no raw grade to belong to, and `addGoal` /
`updateGoalCriteria` refuse an incoherent pair. So the presenter now **joins
what is there** and decides nothing:

```js
export const desiredLine = (desired) => {
  const said = [text(desired && desired.grade), text(desired && desired.condition)]
    .filter(Boolean);
  return said.length ? `Looking for: ${said.join(" · ")}` : null;
};
```

This is simpler *and* more correct. A contradictory pre-C3.2 pair — `PSA 9` and
`Damaged` — now shows **both halves**, which is what the domain's own doctrine
demands (`metyet-domain.js:941-946`: *"A presenter can then say 'PSA 9 — this
record also says Damaged' rather than picking a side"*) and what
`gradeConflictLine` already does for copies. The first version would have
silently hidden the contradiction.

The result is pinned against `gradingOf`, the domain's own function, for every
pair the product can actually store — so the two cannot drift apart.

---

## 3. Architecture facts

| Expected | Result |
|---|---|
| 0 new durable concepts | ✔ none |
| 0 new exposed commands | ✔ **16**; `server/exposed-commands.js` is **byte-identical** to `aef60e4`, asserted by a test |
| 0 projection changes | ✔ `domain/metyet-projection.js` and `domain/metyet-discovery.js` are **byte-identical** to `aef60e4`, asserted by a test |
| 0 migrations | ✔ `0013_binders.sql` still newest |
| Canonical presentation from the catalog boundary | ✔ one batched `describe(ids)`; nothing mirrored into a discovery, goal or relationship |
| Privacy server-authoritative | ✔ no client-side scoping rule added |

`git diff --stat aef60e4 HEAD -- domain/ server/ persistence/` reports **one**
changed file: `domain/README.md`. No domain, server or persistence source was
touched.

---

## 4. What was not built, on purpose

No shop catalogue or inventory browse, no search across shops, no Opportunity or
`startOpportunity`, no message or reach-out, no notification, read position or
dismissal, no persisted Discovery, no TP binder visibility, no offered-card
expansion, no inventory edit or archive, no catalog ingestion, no command
exposure, no projection change, no migration, no Intent or Match, no scoring, no
Bookmark or queue, no Buy/Sell or Trade Binder, no navigation change, no
Opportunity naming or receipt cleanup, and `pokemon_cards.json` is untouched.

There is nothing to press on either new surface. The Collector section renders
**zero** buttons, asserted directly.

---

## 5. Deviations from the brief

**One, and it is a copy fix in a file the batch already changes.**

The Trusted Partners empty state read:

> "…they can then see your goals and your **Trade Binder**."

"Trade Binder" was the prototype's name for a Collector's tradeable cards, and
**C2 renamed it to Your Cards** precisely because owning and offering had stopped
being one fact. The sentence was telling people about a thing the product no
longer has. It now reads:

> "…they can then see what you're looking for and the cards you're offering."

Strictly this is outside the two outcomes the brief names. It is one phrase, in
a file this batch rewrites the header of, and it was a user-visible falsehood
about the product's own vocabulary. Flagged here rather than done quietly.

**No pin was restated.** The brief allows for it; none was needed. The two pins
that fired were not superseded — they were correct, and the code changed to
satisfy them. Weakening either would have been the wrong trade.

---

## 6. Evidence

**New suite** `tests/phase5-c35-close-the-loop.cjs` — **37 tests**, six sections,
every one driving the real components over the real server:

- **A. under your own shop** (7) — the shop is named and the card is the one you
  asked for, with an explicit assertion that the **anonymous holder count was not
  reproduced**; canonical name/set/number/image with **one** `describe` call; two
  shops keep their answers apart, proved by position rather than presence; three
  cards count as three even when the shop holds four copies; a shop with nothing
  says nothing and is still listed; both priorities render in a person's words,
  asserted against the tags in the tree rather than the flattened text; a card
  with no catalogue description still appears.
- **B. only what you asked for** (7) — binder membership creates no demand;
  ownership creates none; another Collector's goals never arrive (and that
  Collector *is* answered, so the fixture proves something); an unrelated shop is
  absent entirely; **the rest of the shelf never appears** — the projection
  carries three copies and the screen shows one; a partner's cost, cert and ask
  are absent from the screen *and* from the projection; an archived copy stops
  being an answer.
- **C. it only reads** (5) — zero buttons and no Ask/Message/Offer/Reserve
  wording; the file names **no** exposed command and none of the six unexposed
  ones it might have wanted, and the shell hands it no callback but
  `onBrowseCards`;
  rendering leaves the world byte-identical with no Interest, Opportunity,
  activity or conversation; no notification/dismissal/read-state collection
  exists and the section reaches for no browser storage; **`invId` is in the
  projection and is never printed**, with the section asserted not to read it.
- **D. which copy they want** (6) — raw + condition; a graded want with **no
  invented condition**; an unspecified goal renders safely with no "any"; the
  sentence matches `gradingOf` for every storable pair; a contradictory pair
  shows both halves; the partner has no control beside it **and** is refused
  `not-owner` by the server if they try.
- **E. still two facts** (4) — tier and criteria both shown and not merged; the
  same criteria at two priorities stay with their own cards; the note keeps its
  own line, asserted **structurally**; changing the criteria leaves the overlap
  byte-identical.
- **F. the boundaries hold** (8) — allow-list 16 by value and count, and 49
  domain commands; **`server/exposed-commands.js` byte-compared against `aef60e4`** — the file, not the name set, so a comment quietly promising a future exposure fails too;
  the deal lifecycle and every adjacent command still refused
  `command-unavailable`; no migration and the canonical world's collections
  unchanged; **`metyet-projection.js` and `metyet-discovery.js` byte-identical to
  the baseline**; a distinctively named binder reaches no partner; navigation is
  exactly what C3.4 left on both seats and `Goals.jsx` still exists, deferred;
  and the answer is reachable from a **navigated** section rather than a deferred
  one — the regression stated as the thing that was actually wrong.

### Final verification

```
128 suites / 4,205 tests      ALL SUITES PASSED
PRODUCTION BUILD OK — bytes: 345,079
PROD SMOKE OK — rendered 83,686 chars
newest migration: 0013_binders.sql
allow-list: 16
```

Build and smoke are unchanged from baseline, and that is itself a check:
`prod.build.mjs` builds `src/MetYet.jsx`, the demo prototype, so those numbers
move only when the domain sources change — and this batch changed none.

The whole diff was read for scope and the changed files scanned for
credentials; nothing was found, and no secret, OTP, database URL or key was
requested, printed or handled.

---

## 7. Remaining debt

| Debt | Status |
|---|---|
| A Collector still cannot act on the answer | Deliberate. `startOpportunity` needs an `invId` this screen declines to print, and the receipt defect below would need fixing first |
| `receiptForOpportunity` resolves trade-card names through legacy `cardId` only (`metyet-domain.js:1073-1078`) | Untouched. Latent — every caller is the prototype — but it must be fixed before any production surface renders a receipt |
| `binder_id` naming collision in `interests` and `trade.cards` | Untouched, documented |
| `relationships.note` and `.last` have no writer in the domain, yet Collector Network renders them | Untouched. Dead UI reading legacy fields; either the writers or the facts should go |
| No production path fills the catalog | Untouched, and out of scope by the brief. Until it exists nothing in this batch can be demonstrated to a real person |
| Inventory copies cannot be edited or archived | Untouched; `updateInventoryCopy` and `removeInventoryCopy` exist and are unexposed |

---

## 8. Hand-back

| | |
|---|---|
| Branch | `phase-5-c3-5-close-the-loop` |
| Baseline | `aef60e4e7d375954e8070f5c13b2dfb9ffd5ff8e` |
| Implementation | `54c004b` |
| Report | committed on top (SHA in the handoff message) |
| Files changed | 8 files, +1,125 / −7 |
| Allow-list | **16 → 16** (unchanged) |
| Domain commands | 49, unchanged |
| Suites / tests | 127 / 4,168 → **128 / 4,205** |
| Build | 345,079 bytes (unchanged) |
| Smoke | 83,686 chars (unchanged) |
| Migration | none; `0013_binders.sql` newest |
| Projection | byte-identical to baseline |
| New test file | `tests/phase5-c35-close-the-loop.cjs` |
| Report | `Claude outputs/MetYet_Phase5_C3.5_Close_the_Loop_Implementation_Report.md` |

**Not merged.** Direct push remains unavailable from this environment, so the
commits are delivered by the established bundle route and the branch is left
intact for review.
