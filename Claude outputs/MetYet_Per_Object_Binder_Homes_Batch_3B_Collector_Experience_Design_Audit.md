# MetYet — Per-Object Binder Homes — Batch 3B Collector Experience Design Audit

**Design and audit only. Nothing was implemented.** Branch `phase-5-four-state`, working tree
clean at `ff80c17`.

---

## 1. Executive conclusion

**The domain is ready and the UI is not pointed at it.** `binderMemberships` is already
projected to the Collector, correctly scoped by both owners — and **not one file under
`client/` reads it.** Every Binder-shaped read in the client is `state.binderEntries`.
The whole organisation experience is card-subject, top to bottom, and the change 3B
makes is a change of subject in the UI only.

Five things decide the shape of 3B, and four of them are findings rather than opinions.

**One home means one choice, not a set of ticks.** The panel's Binder control today is a
checkbox list, and checkboxes are the right shape for "this card is in these binders" —
which is the question going away. An object has **zero or one** home, so the per-object
control is a single choice with `Unfiled` as its first value. That is not a styling
preference: a checkbox list beside a one-home object would let a Collector express a state
the domain refuses, and `fileObject` is already the move, so there is nothing for a second
tick to mean.

**Filing something you cannot see is the half-migrated experience the stop condition
forbids.** So the smallest coherent batch is not "add the controls" — it is the controls
**and** the Binder view that shows what they did. §22 names it.

**A binder should group by card and act on objects.** Collapsing a card's objects into one
row is what 3B exists to stop; splitting one card into three unrelated rows throws away the
only thing that makes a binder legible at a glance. The recommendation is a card heading
with an object subrow each — and crucially that keeps the library's "2 cards" count honest
and keeps the existing one-describe-per-screen invariant intact.

**Three repository facts constrain the implementation before any design does.**
`tests/phase5-c34b-binder.cjs:589-590` reads `Binder.jsx`'s source and forbids the
substring `collectorCopies`, so 3B cannot render objects there without deliberately
reversing a doctrinal guard. `tests/phase5-c33-card-specification.cjs:1083-1095` forbids
the panel from naming any exposed command — which, the moment the list grows to 25,
**automatically forbids `"fileObject"` in the panel** and forces the design to go through a
step kind. And `tests/phase5-binder-object-membership.cjs:782-789` forbids the strings
`"record-copy"`, `"offering"` and `"file"` inside one specific statement in `commit`, which
is why §12 recommends naming the new step kinds `file-object` / `unfile-object` rather than
reusing `file`.

**New bare-card filing can end in 3B without touching a single door.** The panel simply
stops emitting the `file` step. Removing `addBinderEntry` from the exposed list is blocked
by six separate guards, one of which is a deliberate one-way ratchet — and it does not need
doing to honour the closed decision. §15 recommends behaviour in 3B, surface in 3C.

**One genuine product choice cannot be settled from the repository** and is isolated for you
in §20: two owned copies of one card with no distinguishing physical facts. The projection
carries nothing but a minted id and `addedAt`. I have a recommendation; it is a choice, not
a deduction.

---

## 2. Verified starting SHA and worktree

```
branch            phase-5-four-state
HEAD              ff80c17  Docs: Batch 3A closure — object-level Binder commands remain internal
git status        clean
```

Lineage verified against the brief, all four present and in order:

| SHA | Subject |
|---|---|
| `876e485` | A Binder is the home of an object: one Goal or one CollectorCopy |
| `592db69` | Docs: object-level Binder membership foundation — Batch 3A hand-back |
| `04467e1` | Object-level Binder commands stay in the domain, out of the door, until 3B |
| `ff80c17` | Docs: Batch 3A closure — object-level Binder commands remain internal |

Current semantic counts, read from the code: exposed **23**, domain commands **53**,
migrations **14** (newest `0014_binder_memberships.sql`), refusal codes **44**, projected
sections **21**, durable collections **18**.

---

## 3. Current surface map

| Surface | Current subject | Data source | Binder behaviour | Distinguishes Goal/Copy? | Distinguishes copies? | Target responsibility (3B) |
|---|---|---|---|---|---|---|
| `client/collector/CardSpecification.jsx` | one canonical card | `binders`, `binderEntries`, `goals`, `collectorCopies`, `partners` (`:131-137`, `:350-354`, `:411`) | **card-level checkbox list** + "New binder…" creator, one section at the top (`:652-690`) | partly — the Goal is `want`+`desired`, copies are an array; filing is above both | **no.** A copy row has no heading or label at all (`:762-850`) | **a home beside each object**; the card-level section becomes legacy-only |
| `client/collector/sections/Binder.jsx` | a binder, then a card list | `binders`, `binderEntries`, `goals` (`:59-61`) | library + per-binder view + "Add cards" (`:211-219`) | no | no | **render objects**; count what opening shows |
| `client/collector/sections/Collection.jsx` | a card-identity string (`groupIdOf`, `:120-131`) | `collectorCopies`, `goals`, `binderEntries`, `catalog` (`:135-138`) | the binder view's row set is `entries.filter(...).map(groupIdOf)`, de-duplicated (`:169-173`, `:239`); **`withCopies = kind !== "binder"` (`:283`)** | shows a Goal tier tag joined by card id (`:362-366`) | **yes, outside a binder** (`:375-434`); **switched off inside one** | binder view reads memberships and turns copies back on |
| `client/collector/sections/Goals.jsx` | one Goal | `goals`, `catalog`, `opportunities`, `discoveries`, `partners`, `counterparties` | **none** | n/a | n/a | none — the section is unreachable (`CollectorShell.jsx:162-178`) |
| `client/collector/sections/Browse.jsx` | a search result → a printing | `onBrowseCards.read`, `goals`, `collectorCopies` | passes `preselectBinder` into the panel (`:179`) | no | no | the banner survives; what it preselects changes |
| `client/collector/CollectorShell.jsx` | navigation | counts from the projection | holds `fillingBinder` in memory (`:538`), `onAddCards` → Browse (`:644`) | no | no | one new callback at most |
| `client/commands.js` | command bindings | — | `fileCardInBinder` / `unfileCardFromBinder` → `addBinderEntry` / `removeBinderEntry` (`:352-366`) | no | no | **add** `fileObjectInBinder` / `unfileObjectFromBinder` |
| `client/sign-in/SignIn.jsx` | step → command | — | `case "file" / "unfile"` → `binder.file / binder.unfile` (`:232-233`) | no | no | **add** two cases |
| `client/collector/present.js` | formatting | — | **no binder presenter and no disposition presenter exist** | `tierLabel`/`tierIntent` yes | `gradeLine`/`gradeConflictLine`, both null-able | needs an object-label presenter |

Navigation, exactly as a Collector sees it (`CollectorShell.jsx:75-144`, rendered `:615-623`):
**Browse · Binders · Trusted Partners · Deal Flow**. `Collection` is not a tab — `Binder.jsx`
composes it. **`Goals` is not reachable at all**, which means *the shipping product has no
surface whose subject is a Goal.* That is the single most important fact in this table for 3B:
a Goal's home has nowhere to live except the Card Specification panel.

### Two live incoherences found while mapping, both pre-existing

**(i) "Not in a binder yet" answers the wrong question.** `Binder.jsx:102-107`:

```js
const filedSomewhereActive = new Set(entries
  .filter((e) => activeIds.has(e.binderId))
  .map((e) => e.canonicalCardId));
const unfiled = goals
  .filter((g) => g.canonicalCardId && !filedSomewhereActive.has(g.canonicalCardId));
```

A Goal counts as filed when **any** entry for its card sits in **any** active binder — an
entry nobody connected to that Goal, possibly filed before the Goal existed. It is the
card-level answer standing in for an object-level one, and it is wrong today. 3B fixes it by
construction: a Goal is unfiled when it has no membership. (Note also `g.canonicalCardId &&`
— a legacy `cardId` Goal never appears in this list at all.)

**(ii) An archived binder can be opened and filled, and the filling silently cannot work.**
`Binder.jsx:308` opens an archived binder in the same per-binder view as a live one, with
nothing saying it is put away, and the **"Add cards" button is live** (`:211-219`). It routes
to Browse and into the panel with `preselectBinder` — where `CardSpecification.jsx:377`
requires `!b.archivedAt` to pre-tick and `:411` filters archived binders out of the checkbox
list entirely. So the Collector presses "Add cards" on a put-away binder, picks a card, and
the binder they came from **is not even in the list**, with no explanation. Worth fixing in
3B because 3B touches both ends; it is not caused by 3B.

---

## 4. Current card-level flow, verified end to end

```
CardSpecification  "Which binders does this card belong in?"   :654
  answers.binders : Set<binderId>                               :356
  answers.newBinders : string[]  (names, index-keyed)           :429
      ↓ planFrom
  { kind: "make-binder", name, binderDraftId: `new-binder-${i}` }   :165-167
  { kind: "file",   binderId }            ticked & not in filedNow  :283-285
  { kind: "file",   binderDraftId }       every new binder          :289-291
  { kind: "unfile", binderId }            in filedNow & not ticked  :292-294
      ↓ commit  — handles resolved immediately before dispatch      :540-564
SignIn.jsx  case "file"  → binder.file(step.binderId, canonicalCardId)   :232
client/commands.js  fileCardInBinder → execute("addBinderEntry", {binderId, canonicalCardId})  :352-358
server/app.js  isExposed → CARD_NAMING_COMMANDS catalog guard → command   :435, :86-91
domain  addBinderEntry({binderId, canonicalCardId})                 :1300
persistence  binder_entries (ord PK, binder_id, canonical_card_id NOT NULL, attrs)
```

Scenario T's minted-id fix is intact (`:165-167`, `:289-291`, `:540-564`), and a handle that
never got an id is a loud failure rather than a silent skip (`:550-564`).

**The question this flow asks cannot represent the product.** Verified against the real
domain, with four objects on one card and three binders:

```
Goal (primary)                     -> Mudkip Master Set
Copy PSA 10 cert 111 (PC)          -> Personal Collection
Copy PSA 9 cert 222 (Trade/Sell)   -> Trade Night
Copy Raw/NM (Trade/Sell)           -> (unfiled)

card-level binder_entries for this card: []
```

One checkbox list has no value that distinguishes those four, and no value that could.

Two further facts about the legacy table worth having before §14:

- `binder_entries.canonical_card_id` is **NOT NULL with a foreign key into
  `metyet_catalog.canonical_cards`** (`0013_binders.sql:85-97`). A legacy row always names a
  card that really exists. There is no such thing as a dangling or legacy-only card id in
  production — the `legacy:` prefix in `Collection.jsx:124` serves the demo world.
- `addBinderEntry` is idempotent per (binder, card) (`metyet-commands.js:1310-1312`), and the
  only writer in the entire repository is `client/commands.js:357`. There is no seed, no
  import and no migration that writes one.

---

## 5. Target mental model

One sentence, in Collector words:

> **A Binder answers "where does this live?" — asked of each thing you have said something
> about, not of the card.**

Which decomposes into four rules the UI must make obvious:

1. **The thing is the subject.** A Goal is a thing. Each owned copy is a thing. A card is
   where things of the same picture are grouped for reading, never the unit of action.
2. **Zero or one home.** Every thing shows a home or shows `Unfiled`. Never a blank, never a
   hidden default binder, never a set of homes.
3. **Meaning and place are independent, in both directions.** Changing Primary↔Secondary or
   PC↔Trade/Sell never moves a thing. Filing a thing says nothing about whether it is wanted
   or offered. Both directions are already enforced and tested; the UI must not imply
   otherwise by, for example, grouping a binder's contents under "Hunting" and "Keeping".
4. **Organising is optional and reversible.** `Unfiled` is a first-class value. "Remove from
   Binder" leaves the thing and its state exactly as they were.

And one rule about what the model is *not*: a binder is not a fifth state, not a shortlist,
and not inventory. The existing doctrine — "a count of ownership here would turn curation
into inventory one number at a time" (`Binder.jsx:8-23`) — survives 3B **as applied to the
library**, and is deliberately reversed **inside a binder**, where the whole point is now to
say which specific things are here. §20 revisits this, because it is the one place the
existing guards and the new design genuinely collide.

---

## 6. Human jobs, by surface

The job first, then where it is answered. Where no surface answers it today, that is said.

| Job, in the Collector's words | Answered today? | Target surface |
|---|---|---|
| "I decided I want this exact card — put that hunt with my Mudkip project." | **No.** The panel can only file the card. | Card Specification, a home beside the Goal |
| "I own three of these. One I keep, two I'd trade. Organise them separately." | **No**, and the panel cannot even tell the three apart (`:762-850` has no row label) | Card Specification, a home beside each copy row |
| "I'm looking at a binder. Tell me why each of these is here." | **Partly** — a Goal tier tag joined by card id (`Collection.jsx:362-366`); copy facts are suppressed (`:283`) | Binder view, an object subrow per thing with its own meaning |
| "Move this specific one to another binder." | **No** — only by opening the card and re-ticking | Binder view subrow, and the panel |
| "Take it out of the binder without changing what it means." | **No** — only by unticking the card | Binder view subrow (`Remove from Binder`), and the panel's `Unfiled` |
| "I found a card in search and I want it in a binder." | **Yes, and that is the problem** — a bare card can be filed with nothing else said (`:272-282`) | Browse → panel → say what it means → then its home |

The last one is the only job whose *answer* has to change rather than its location.

**Binder cannot be the first durable act.** Today it can: ticking one binder is one step,
Save is enabled on one step, and `planFrom` emits `file` unconditionally (`:283-285`). After
3B there is no object for a membership to point at until the Collector has said "I'm looking
for this" or "I own one", so the least-friction honest path is:

```
Browse  →  pick the printing  →  the panel opens
           say what it means:  Looking for it  /  I own one
           its home (Unfiled by default, or the binder you came from)
           Save
```

The friction added is exactly one answer, and it is an answer the product already asks for
on this screen. The panel's existing gate is the precedent: a **new copy** already cannot be
saved without a disposition (`:470-480`, "Say whether you'd part with that copy or you're
keeping it"). Requiring meaning before a home is the same rule applied to organisation, and
the pre-flight message writes itself: *"Say whether you're looking for this card or you own
one before choosing where it belongs."*

---

## 7. Scenario matrix A–T

Every row audited against the real architecture; the behavioural ones were driven through
the real domain rather than reasoned about.

| | Scenario | What the domain does now | What the Collector sees now | 3B |
|---|---|---|---|---|
| **A** | Goal only, Binder A | `fileObject({binderId:A, goalId})` ✓ | **nowhere.** No surface shows a Goal's home; `Goals.jsx` is unreachable | panel, Looking-for section |
| **B** | PC copy only, Binder B | `fileObject({binderId:B, collectorCopyId})` ✓ | nowhere | panel, that copy's row |
| **C** | Goal→A, Copy→B, same card | two rows, independent ✓ (probed) | **impossible.** One checkbox set, no value distinguishes them. Proven in §4 | two controls, visibly separate |
| **D** | PC #1→A, Trade #2→B, Trade #3 unfiled | three independent rows ✓ (probed) | impossible; and the three copy rows are visually identical unless they happen to carry facts | three controls; §20 on telling them apart |
| **E** | two copies, **no distinguishing facts** | both filable; `grade`/`cert`/`condition` are **absent keys**, not nulls (probed) | two identical blocks of four blank controls, in array order. `gradeLine` returns `null` → `"Not stated"` | **unsettled product choice — §20** |
| **F** | Goal and Copy of one card, both in A | two rows in one binder ✓ | one card, once | **one card heading, two subrows.** §9 |
| **G** | new Goal + new Binder, one Save | — | `make-binder` → `file` (card) ✓ since 3A | `make-binder` → `start-looking` → `file-object` naming the Goal's handle |
| **H** | new Copy + new Binder, one Save | — | same card-level pair | `make-binder` → `record-copy` → `file-object` naming the copy's `draftId` |
| **I** | new Goal **and** new Copy, one Save | — | **supported today.** `record-copy` (`:245`) and `start-looking` (`:268`) land in one `steps` array | two `file-object` steps, two different handles |
| **J** | move A→B | **one `fileObject`.** Same row, updated in place, fresh `filedAt`; row count stays 1 (probed) | re-tick two boxes | one control change, one command |
| **K** | unfile | `unfileObject`; object and state untouched; idempotent (`done(state,false)`) | untick | `Unfiled`, or `Remove from Binder` on the subrow |
| **L** | Primary↔Secondary, PC↔Trade/Sell | **home does not move** (probed: tier flip left the home at Trade Night) | n/a | must stay invisible — no re-render that implies a move |
| **M** | archive the destination binder | membership stays; **new** filing refused `binder-archived`; **re-stating the same home** is accepted as a no-op; **unfile allowed** (all probed) | the archived binder vanishes from the panel list, and §3(ii) | archived binders excluded from the choice; §20 on what an archived home displays as |
| **N** | delete the object | **membership goes with it** in the same command, and `on delete cascade` holds it at the database too (probed) | n/a | nothing to do; no prerequisite, no warning |
| **O** | legacy entry, no Goal, no copy | row stands; **never inferred** (`[19]`) | a card in the binder | legacy row, shown as such, removable only |
| **P** | legacy entry + one Goal | still never inferred — `[19]` of `phase5-collector-identity-stabilization` asserts `addBinderEntry` invents no membership even when one Goal is the only candidate | one card | the Goal shows `Unfiled`; the legacy row shows separately. **Two truths, not one guess** |
| **Q** | legacy entry + Goal + several copies | the ambiguity is irreducible: the row records filing a **card**, nothing on it records a cause, and one-Goal-per-card is a rule the command keeps and the database does not | one card | **this is the case that forbids auto-conversion.** The honest display is: the objects, each with its own home, plus "This card was filed here before Binders organised specific cards" + Remove |
| **R** | the current "Add cards" door | `Binder.jsx:211-219` "Add cards" → `CollectorShell.jsx:644` sets `fillingBinder`, switches to Browse → `Browse.jsx:112-121` banner → `:179` `preselectBinder` → panel pre-ticks (`:375-381`) → `file` | works, writes nothing until Save (tested) | **becomes meaning-first**: Find card → Looking for / I own → required state → then that binder as the new object's home |
| **S** | browse/search → Binder | a bare card can be filed with nothing else said (`:272-282`) | works | same rule as R, from the same screen |
| **T** | binder with several objects sharing one picture | fine | one card, once; copies suppressed | card heading + subrows; actions on subrows only |

Four of these are worth drawing out.

**C is the proof the batch exists.** It is not that the card-level answer is coarse — it is
that there is no card-level value that could be right. Two independent homes, one checkbox.

**I is better than expected.** The panel already composes a new Goal and a new copy into one
Save, so 3B does not have to invent multi-object creation — only multi-object *filing*, over
plumbing (`minted`, a single `Map` consulted per step) that already supports it.

**M's three behaviours are all correct and all need UI words.** Archiving does not evict; a
no-op re-statement is accepted rather than erroring; taking a thing out always works. The
design must not offer an archived binder as a *new* home, must not hide a thing that already
lives in one, and must keep `Remove from Binder` live there.

**Q is the whole legacy argument in one scenario.** Three objects, one legacy row, no fact
anywhere that says which object — if any — that row was about. Any conversion is a guess
dressed as a migration.

---

## 8. CardSpecification recommendation

The hypothesis in the brief is close, and the audit changes one thing about it: **the control
is a single choice, not a checkbox.**

### Recommended structure

```
LOOKING FOR IT
  ( ) Not looking    ( ) Keeping an eye out    (•) Actively hunting
  Which copy are you after?   Grade: PSA 10
  Binder:  [ Mudkip Master Set  ▾ ]        ← Unfiled is the first option

CARDS YOU OWN
  ─ The one you added first · PSA 10 · cert 111
    Grade / Condition / Certificate / Your reference value
    (•) I'm keeping this one   ( ) I'd trade or sell this one
    Binder:  [ Personal Collection ▾ ]
    I no longer own this

  ─ The one you added next · PSA 9 · cert 222
    …
    Binder:  [ Trade Night ▾ ]

  I own one of these

NEW BINDER
  [ New binder…        ] (Add binder)      ← one creator, selectable by every object above

FILED BEFORE  (only when a legacy row exists for this card)
  This card was filed in Trade Night before Binders organised specific cards.   Remove
```

### The decisions behind it

**Does the component already separate Goal from copies? Partly, and asymmetrically.** Three
sections exist (`:653`, `:693`, `:758`), so the *reading* structure is already there. But the
Goal is flattened into two scalar fields (`want`, `desired`, `:358-360`) with no id in
`answers`, while copies are an array of drafts (`:361`, `asDraft` `:93-110`). A Goal's home
therefore has an obvious home in `answers` — one more field — and a copy's home needs one
field per draft. The Goal's id is re-derived from the projection on every plan (`:135`),
which is also where its handle for a new Goal must come from (§11).

**The Binder control belongs beside each object's state, and the card-level section goes.**
It is one section above everything today (`:652-690`), peer to the Goal and to the whole
copies list. Moved down, it sits next to the one thing it is a fact about. The card-level
section does not become "legacy": it disappears, and a *separate, differently-worded* block
appears only when this card actually has a legacy row (§14).

**Single choice, `Unfiled` first.** A `<select>` or a radio group, never checkboxes, for
three reasons: one home is what the domain enforces, so a tick-many control offers a state
that cannot exist; `fileObject` is already the move, so "untick A, tick B" is one command and
should look like one gesture; and it makes `Unfiled` a value the Collector picks rather than
the absence of a tick. A practical fourth: `tests/phase5-c34b-binder.cjs:877-896` asserts
`boxes.length === 0` when an archived binder is in play, counting **every checkbox in the
panel** — a `<select>` keeps that guard meaningful instead of forcing it to be re-scoped.

**Binder optional at creation — yes, and that must stay true.** `planFrom` emits nothing for
an object whose home is `Unfiled`, exactly as it emits nothing for an unanswered disposition
(`:243`, `if (draft.disposition === UNANSWERED) continue;`). A Collector who never opens the
Binder control must produce a plan identical to today's minus the `file` step.
`tests/phase5-copy-disposition-explicit-choice.cjs:595` (`steps === "[]"`) is the canary for
this and should stay exact.

**`Unfiled` is a UI value and never a Binder.** No "Unfiled" binder record, no default
binder, no hidden membership. The word appears in the control and in the Binder view's "Not
in a binder yet" list, and nowhere in the data.

**Save, not autosave.** Unchanged, and worth restating because it is the panel's oldest rule
(`:22-27`): *"NOTHING IS WRITTEN UNTIL THE LAST BUTTON."* Opening a binder dropdown writes
nothing. 3B must not reach for autosave to make per-object filing feel lighter.

**New binder creation: one creator, shared by every object in the Save.** Keep a single "New
binder…" input at panel level and let each object's dropdown select a just-named binder. This
is what makes "one new binder, two new objects" work with **one** `make-binder` — which the
`minted` map already supports, since nothing consumes or clears a handle after first use
(`:548`). Two notes carried from the audit:

- Today a new binder's pseudo-row is `checked readOnly disabled` (`:671`), so a mistyped name
  can only be escaped by cancelling the whole panel. The per-object design needs it to be
  removable, because a name that nothing selects should simply disappear.
- `answers.newBinders` is **index-keyed**, and `adopt` filters it by index (`:525`). With
  object-level homes referring to a new binder, a handle must survive that re-indexing
  between a failed Save and a retry. **Recommendation: give each new binder a minted client
  key from a `useRef` counter, exactly as `addCopy` does (`:433-437`), and stop using the
  array index as the handle.** The copy-key defect this mirrors is already documented at
  `:402-408`, and its lesson applies verbatim.

**Minted-id composition.** §11.

**Refusal recovery.** The existing machinery is right and needs three new sentences. `WHY`
(`:918-946`) has no entry for `invalid-target`, `binder-archived`, or `command-unavailable`,
so each currently reaches a Collector as *"MetYet would not accept it."* There is a precedent
with a test behind it — `tests/phase5-goal-tier-explicit-choice.cjs:384-387` asserts
`invalid-tier` has a sentence in this panel precisely because "a refusal with no sentence
behind it reaches a Collector as a blank." Mirror it:

- `binder-archived` → "That binder has been put away. Bring it back first, or choose another."
- `invalid-target` → should be unreachable from this panel; write it anyway, per the
  `invalid-tier` precedent.
- `command-unavailable` → "This version of MetYet cannot file that yet. Reload and try
  again." This one is the version-skew path (§16) and is the only refusal a *correct* client
  can receive from a *correct* older server.

---

## 9. Binder-view recommendation

A binder answers: **what specific things have I organised together here?**

**Recommended: group by canonical card, one subrow per object, actions on subrows only.**

```
Trade Night                                           2 cards

  Mudkip · Ruby & Sapphire #10
    Actively hunting                      Binder ▾   Remove
    PSA 9 · cert 222 · I'd trade or sell  Binder ▾   Remove

  Charizard · Base Set #4
    PSA 10 · I'm keeping this one         Binder ▾   Remove
```

### Why grouping rather than flat objects

Three independent reasons, and the third is the one that decided it.

**It is how a Collector reads a binder.** The picture is the thing you scan for. A card whose
Goal and two copies appear as three unrelated rows is three times the scanning for no new
information.

**It preserves object truth where object truth lives.** The heading carries card identity and
nothing else — which is already this file's rule (`Collection.jsx:36-40`, *"THE GROUP IS A
HEADING, NOT A RECORD … it NEVER shows a grade"*). Every fact about a thing, and every action
on a thing, is on that thing's subrow. Grouping is a reading aid; it collapses no identity and
owns no action.

**It keeps three existing invariants true instead of reversing them.**
`tests/phase5-binders-cross-views.cjs:652-666` requires the library's count to equal what the
binder opens showing — with a card heading, "2 cards" stays literally correct and the G5
invariant survives as stated. `tests/phase5-c34b-binder.cjs:639-657` requires **one**
catalogue describe per screen with the exact id list — grouping by card means the de-duplication
that guard checks happens naturally, where flat objects would need it added. And
`tests/phase5-binders-cross-views.cjs:213-224` forbids a group heading from carrying one
object's grading — which a card heading honours and an object row could not.

### What each subrow must carry

- **What it is, in the Collector's words.** A Goal: `Actively hunting` / `Keeping an eye out`
  (`tierIntent`, already exists). A copy: its grading line and `I'm keeping this one` /
  `I'd trade or sell this one`. This is the reversal: `Collection.jsx:283`
  (`withCopies = kind !== "binder"`) becomes true for a binder, and
  `tests/phase5-binders-cross-views.cjs:238-247` ("a binder shows cards, never inventory")
  is **deliberately superseded**. §20 argues the doctrine rather than just flipping it.
- **Its own home control and its own `Remove from Binder`.** One object, one gesture. This is
  the job the brief lists that no surface answers today.
- **Nothing derived.** No counts, no "2 of 3 filed", no ownership totals on the library screen.
  The anti-inventory doctrine survives everywhere except inside an open binder.

### What stays exactly as it is

The library's three panels, the archive toggle, `Rename` / `Put away` / `Bring back`, the
absence of delete, the search box's placement and its emptying on view change, and the four
cross-binder views (`All Cards`, `Primary Goals`, `Secondary Goals`, `Trade/Sell`), whose
card-identity axis is right for what they ask. **3B must not let the binder view's object
grouping leak into those four** — `tests/phase5-binders-cross-views.cjs:180-187` is the guard
and it should keep passing untouched.

Two corrections 3B should carry because it is already in both files: the archived-binder
"Add cards" path (§3 ii), and the "Not in a binder yet" list becoming membership-based
(§3 i) — which also, for the first time, lets it include a Goal that has no `canonicalCardId`.

---

## 10. Collection / library recommendation

**"Collection" is not a section.** It is a component `Binder.jsx` composes (`:206-210`,
`:236`), and it is absent from `SECTIONS`. Its row subject is a card-identity string from
`groupIdOf` (`:120-131`), which normalises three different things onto one axis: a canonical
card, a legacy catalogue card (`legacy:`), or — when a copy has no card identity at all — the
copy standing in for its own card (`copy:`). Rows are built from entries, goals and copies
together (`:203-207`) and de-duplicated (`:239`); owned copies nest under the heading
(`:375-434`).

So it already mixes all four things the brief asks about, deliberately and coherently: the
*axis* is "a card you have some relationship with", and the relationships hang beneath it.

**Recommendation: do not redefine Collection. Change exactly one thing.**

The smallest correction for object-level truth is in the `binder` branch only:

| today | 3B |
|---|---|
| `Collection.jsx:169-173` — rows from `entries.filter(e => e.binderId === id).map(groupIdOf)` | rows from `binderMemberships.filter(m => m.binderId === id)`, resolved to their object's card, **plus** any legacy entries for that binder (shown as such) |
| `Collection.jsx:283` — `withCopies = kind !== "binder"` | the binder view lists **the filed objects**, not every copy of the card |

That second line matters more than it looks. Outside a binder, `listed` is *every* copy of the
card (or every offered one in the Trade view). Inside a binder it must be **only the copies
filed here** — otherwise opening Trade Night shows a PC copy that lives in Personal Collection,
which is the opposite of what the screen now claims to answer. The Goal subrow follows the same
rule: shown when **this Goal** is filed here, not when a Goal for this card exists.

Everything else in the file — the four other views, the group heading's discipline, the
one-describe-per-screen behaviour, the search filter, the `copy:`/`legacy:` fallbacks — stays.

---

## 11. Same-Save plan design

`planFrom`'s ordering rationale is explicit and 3B does not change its logic: containers
first; then everything refusable only for itself; then filing; then the three a live deal can
refuse; then removals last (`:145-164`, `:169-192`, `:272-282`, `:296-299`, `:310-326`).
**Object filing belongs exactly where card filing is today** — in block 3 — because
`fileObject` can be refused only for itself.

Two new step kinds, named `file-object` and `unfile-object` (§12 explains why not `file`):

```js
{ kind: "file-object",   binderId | binderDraftId,  goalDraftId | copyDraftId | goalId | collectorCopyId }
{ kind: "unfile-object",                            goalDraftId | copyDraftId | goalId | collectorCopyId }
```

### The eight cases

| case | plan, in order | handles resolved at dispatch |
|---|---|---|
| existing object → existing binder | `file-object{binderId, goalId}` | none |
| existing object → new binder | `make-binder{binderDraftId}` … `file-object{binderDraftId, goalId}` | binder |
| new Goal → existing binder | `start-looking{goalDraftId}` … `file-object{binderId, goalDraftId}` | object |
| new Goal → new binder | `make-binder{binderDraftId}` … `start-looking{goalDraftId}` … `file-object{binderDraftId, goalDraftId}` | **both** |
| new Copy → existing binder | `record-copy{draftId}` … `file-object{binderId, copyDraftId}` | object |
| new Copy → new binder | `make-binder` … `record-copy` … `file-object{binderDraftId, copyDraftId}` | both |
| several new objects → one new binder | **one** `make-binder` … `record-copy` ×N … `file-object` ×N, all naming the same `binderDraftId` | both, N times |
| several objects → different new binders | `make-binder` ×M … then the objects … then `file-object` ×N | both |

### Sequential Save is sufficient. No atomic batch.

Four pieces of evidence, not a preference:

1. **`fileObject` is idempotent and is the move.** Re-stating an existing home returns the
   same row and the same `filedAt`; filing elsewhere updates one row in place. A resent step
   cannot duplicate anything.
2. **The difference is recomputed from the projection on every press** (`:535`), so a partial
   Save leaves the projection further along and the retry sends only what is left. That is the
   property `adopt` exists to maintain, and it already covers both the copy-id and
   binder-id cases (`:511-528`).
3. **A refusal stops the sequence** (`:566-575`), so a dependent filing never runs after its
   object was refused. This is the brief's requirement and it is already the behaviour — and
   it becomes *structurally* true rather than merely ordered: `file-object` for a new object
   cannot be sent at all without the id `record-copy`/`start-looking` minted, and an
   unresolved handle is a loud failure (`:550-564`).
4. **Nothing in the eight cases needs two writes to be simultaneous.** A binder that exists
   with nothing in it yet, or an object with no home yet, are both legal, visible, honest
   states — not inconsistencies. There is no window in which the world is wrong.

So: no architectural widening. The thing to add is one more handle kind, and one more lookup
in the same `minted` map.

### Four implementation requirements that fall out

- **A new Goal needs a handle.** `start-looking` carries none today (`:268-270`). Add one.
  Since there is at most one Goal per card, a constant (`goalDraftId: "the-goal"`) is honest
  and avoids an index.
- **New-binder handles must stop being array indices** (§8), because an object now refers to
  one across a retry that re-indexes `newBinders`.
- **`adopt` must learn the Goal.** It already adopts minted copy ids and minted binder ids
  (`:511-528`); a minted Goal id must land in `answers` too, or the retry re-sends
  `start-looking` and gets `duplicate-goal`.
- **No name dedupe, anywhere.** `createBinder` has no duplicate rule and the schema has no
  unique key (`:161-164`). Two binders may share a name; a name can never identify one.

---

## 12. Exact `fileObject` / `unfileObject` invocation points

| # | Site | Call | Why here |
|---|---|---|---|
| 1 | `CardSpecification.jsx` → `planFrom` block 3 | emits `file-object` / `unfile-object` | the only place that knows the whole difference for this card |
| 2 | `client/sign-in/SignIn.jsx` step switch | `case "file-object"` → `binder.fileObject(...)`, `case "unfile-object"` → `binder.unfileObject(...)` | the one translation point from panel vocabulary to command vocabulary |
| 3 | `client/commands.js` | `fileObjectInBinder` / `unfileObjectFromBinder` | the only file allowed to name a command |
| 4 | `Binder.jsx` / `Collection.jsx` subrow `Binder ▾` and `Remove from Binder` | **via a callback passed down**, never by naming the command | see below |

**Site 4 cannot name the command, and that is enforced.**
`tests/phase5-c34b-binder.cjs:633-636` iterates `EXPOSED_COMMANDS` and asserts `Binder.jsx`
contains no `"name"` for any of them, and `phase5-c34a-your-cards.cjs:534-544` does the same
for `Collection.jsx` plus forbids `execute(`. Both guards **tighten automatically** when the
exposed list grows to 25. The same applies to the panel:
`tests/phase5-c33-card-specification.cjs:1083-1095` forbids the panel from naming any exposed
command — so the moment `fileObject` is exposed, the panel is forbidden from containing the
string, and the design is forced through a step kind. **That is the right answer, and the
guards arrive at it without being asked.** The Binder view's subrow actions therefore take a
callback from `CollectorShell.jsx` (one new prop), exactly as `onArchiveBinder` and
`onRenameBinder` do today.

**Step-kind naming is a constraint, not a taste.**
`tests/phase5-binder-object-membership.cjs:782-789` asserts that the `const draftId = …;`
statement in `commit` mentions `draftId` and does **not** mention `"record-copy"`,
`"offering"` or `"file"`, and that it is a single statement with no interior `;`. A step kind
spelled exactly `"file"` appearing in that binding would fail a guard that has nothing to do
with what it protects. `file-object` / `unfile-object` sidestep it, read better in `NAMES`
and `FAILED`, and keep the legacy `file` / `unfile` kinds distinguishable for as long as they
exist.

**One more guard worth knowing before writing the bindings.**
`tests/phase5-b7-collector-goals.cjs:313-316`, `:331-334`, `:694` assert that a binding in
`client/commands.js` names no card and no owner, and that `collectorId:` appears nowhere in
the file. So `fileObjectInBinder` must carry **only** `binderId` plus one of `goalId` /
`collectorCopyId` — which is exactly the command's signature. And `fileObject` must **not**
join `CARD_NAMING_COMMANDS` in `server/app.js:86-91` (pinned to exactly four by
`tests/phase5-c31-binder-foundation.cjs:750-760`): it names no canonical card, the object it
names already named one when it was created, and a Collector must still be able to organise a
Goal for a card the catalogue has since withdrawn.

---

## 13. Exposure and client-thunk sequencing

**One commit, four files, simultaneously.** The boundary is precise:

```
client/collector/CardSpecification.jsx   per-object controls + two new step kinds
client/sign-in/SignIn.jsx                two new cases
client/commands.js                       fileObjectInBinder / unfileObjectFromBinder
server/exposed-commands.js               "fileObject", "unfileObject"   (23 → 25)
```

They cannot be split, because `tests/phase5-b81-plumbing-corrections.cjs:191-197` asserts
**exact set equality in both directions** between what `client/commands.js` can send and
`EXPOSED_COMMANDS`. A door without a binding fails it; a binding without a door fails it. That
guard is what made the 3A closure necessary and it is what keeps 3B honest — it must move from
23 = 23 to 25 = 25 in one commit, and it must not be weakened to a subset check or given an
exception list.

The comments in both files currently explain why the two are *absent* (`exposed-commands.js:108-123`,
`client/commands.js:368-388`). Both get rewritten to name the surface that sends them, which is
the format `exposed-commands.js` requires of every entry.

---

## 14. Legacy coexistence and cutover

Hard rules, restated because they are the load-bearing part: **never auto-convert, never
infer, never attach.** Scenario Q is why — three objects, one legacy row, and nothing anywhere
that records which object it was about.

| Question | Answer |
|---|---|
| Where do legacy rows remain visible? | In the binder that holds them, and in the Card Specification panel for that card. Nowhere else. |
| Special labelling? | **Yes, and plainly, without jargon.** "This card was filed here before Binders organised specific cards." Never "legacy row", never "binder entry". |
| Removal? | **Stays.** `removeBinderEntry` keeps its door and its binding. A `Remove` on the legacy line is the only cleanup path a Collector gets, and it must keep working. |
| Movement or editing? | **No.** A legacy row is a fact about the past; moving it would be asserting the thing it cannot assert. Remove it and file the object you meant. |
| Coexistence with memberships? | Side by side, in the same binder, visibly different. `[19]` of the membership suite already asserts the two tables never read each other. |
| Duplicate-looking content? | Yes, and unavoidable: a card can have a legacy row *and* a filed Goal in the same binder. The card heading appears once; the legacy line sits with the object subrows, worded so it reads as history rather than as a thing. |
| When is `addBinderEntry` unexposed? | **3C.** §15. |
| Does `removeBinderEntry` remain? | **Yes, indefinitely** — until no legacy rows exist anywhere, which is not a thing this product can know. |
| Future resolution concept | A Collector-driven "this row was about…" prompt, offering only the objects on that card plus "just remove it". **Named, not built.** It is the only honest way a row acquires a subject, and it needs a real Collector in front of it before it is designed. |

---

## 15. Recommendation: stop new `binder_entries` in 3B or 3C?

**Recommendation: stop the WRITES in 3B. Retire the DOOR in 3C.**

The closed decision is *"new bare-card Binder filing ends."* That is a statement about what
the product does, and 3B can satisfy it completely by having `planFrom` stop emitting the
`file` step. After that commit nothing in the product can create a `binder_entries` row —
`client/commands.js:357` is the **only** writer in the entire repository (verified: no seed,
no import, no migration, no demo path writes one), and it is reachable only from that step.

Removing `addBinderEntry` from `EXPOSED_COMMANDS` is a different and much larger act, and the
repository argues against doing it in the same batch. **Six guards forbid it**, and one of
them is deliberately a one-way ratchet:

| Guard | What it says |
|---|---|
| `tests/phase5-c34b-binder.cjs:1090-1091` | `eq(json(closedSince), json([]), "a door open at C3.3 has since been closed")` — measured against the **live** list |
| `tests/phase5-c34b-binder.cjs:1092-1094` | every C3.3/C3.4 binder command must still be exposed |
| `tests/phase5-c2-collector-copy.cjs:1213-1215` | same claim, from C2 |
| `tests/phase5-c31-binder-foundation.cjs:652-655` | `addBinderEntry`/`removeBinderEntry` were opened by C3.3 and must still be exposed |
| `tests/phase5-c31-binder-foundation.cjs:739-748` | `client/commands.js` must still **bind** it |
| `tests/phase5-c5-tp-inventory-correction.cjs:237` | `eq(json(lost), json([]), "a door somebody else opened was closed")` |
| `tests/phase5-binder-object-membership.cjs:1047-1049` | 3A's own line: both card-level commands must stay reachable |

That ratchet exists for a good reason — a silently closed door is how a working screen breaks
— and reversing it is a doctrinal act that deserves its own batch, its own reasoning and its
own hand-back. Doing it inside 3B would mean reversing seven guards while also moving the
subject of the entire organisation UI, which is more superseded doctrine in one batch than
anyone can review honestly.

There is also a correctness argument for the delay. Keeping the door open for one release
means an **older client still works** against a 3B server: it sends `addBinderEntry`, gets a
200, and files a card. Closing the door in the same batch turns every stale browser tab into
a refusal on a gesture that looks fine. §16 relies on that.

So: **3B ends the behaviour. 3C removes the surface** — and 3C is then a small, legible batch
whose whole content is "the door nothing presses any more", with the seven reversals and the
evidence that nothing presses it.

---

## 16. Deploy, rollback and version skew

| Situation | What happens | Verdict |
|---|---|---|
| **New client, old server** | `fileObject` is not exposed → `server/app.js:435` returns **409 `command-unavailable`**, in the command vocabulary, not a 500. `commit` treats it as a refusal, stops, reports, keeps the answers, and a retry is possible. But `WHY` has **no sentence** for `command-unavailable`, so the Collector reads *"MetYet would not accept it."* | **Safe but mute.** Add the sentence (§8). This is the one skew path a correct client hits against a correct server. |
| **Old client, new server** | Sends `addBinderEntry`, which is still exposed → works. Memberships it cannot read render as nothing, so a binder filled object-wise looks **emptier than it is**. | **Acceptable and reversible.** It is the strongest argument for §15's recommendation: keeping the door open is what makes this merely confusing rather than broken. |
| **Rollback after memberships exist** | 3A already proved both halves against the actual pre-batch code: the world loads, the section goes quiet, `binder_entries` round-trips unchanged, a save by the old code does not destroy rows it cannot see, and `on delete cascade` lets a rolled-back build still delete a filed Goal. The UI rollback adds nothing new — the card-level screens return and the memberships wait. | **Safe.** No new hazard. |
| **Coexistence** | Both tables populated, both visible, neither read by the other (`[19]`). | **By design.** |
| **Exposure change** | Additive; `isExposed` is a list membership test with no ordering or state. | **Safe to ship first.** |
| **Projection compatibility** | `binderMemberships` has been projected since 3A and is unconsumed, so **no projection change is needed at all** and no client needs a new field. | **Nothing to sequence.** |

**Recommended order, each step independently safe:** (1) the server exposure, deployable
alone and inert until a client sends; (2) the client bindings, `SignIn` cases, panel controls
and Binder view, together, because the b81 equality binds them; (3) nothing else.

**One hazard worth naming.** `client/collector/present.js:32` (`rows`) tolerates `undefined`,
and `metyet-world.js` treats `binderMemberships` as optional. So a 3B regression that fails to
read memberships **renders an empty binder instead of failing loudly** — a Collector would
see their organising vanish and the logs would say nothing. §19 asks for one explicit test
that a binder with memberships and no legacy entries is not empty.

---

## 17. Privacy

**No projection change is needed. Say so and change nothing.**

Verified against the real projection with three binders, a Goal and three copies filed:

```
partner binderMemberships: []   binders: []   binderEntries: []
no binder name or id anywhere in the partner's whole body: true
```

The collector branch scopes memberships by **both** owners — the binder's and the object's —
and excludes a row naming neither (`metyet-projection.js:446-461`). The partner branch is an
explicit `[]` beside `binders: []` and `binderEntries: []`, and `binderMemberships` is in
`COLLECTIONS` (`:298-303`) so the default for any unclassified seat is empty.

3B must not weaken any of it, and three specific temptations are worth naming in advance:

- **No binder name or count on any Deal Flow, Opportunity or reference-copy surface.** The
  existing guards cover it: `tests/phase5-c33-card-specification.cjs:1644` forbids a derived
  `binderCount|filedIn|binderTotal` reaching a partner, and
  `tests/phase5-binders-cross-views.cjs:535-546` forbids the collection reading partner,
  deal or inventory state.
- **No client-side owner filtering.** `tests/phase5-c34b-binder.cjs:1333-1337` forbids
  `collectorId ===` / `partnerId ===` in `Binder.jsx`. 3B filters memberships by
  `binderId` and by object id — never by owner, because the server already did.
- **Two test harnesses currently hand the panel an unscoped world.**
  `tests/phase5-binder-object-membership.cjs:641-653` and
  `tests/phase5-collector-identity-stabilization.cjs:424-428` build `seen()` by spreading the
  raw world and filtering three collections by hand, so `binderMemberships` reaches the panel
  **including another Collector's rows**. Harmless for card-level filing; for object-level
  homes it means a panel test could pass against a projection production never produces.
  **3B should switch those harnesses to `projectForActor`**, or at minimum add a
  memberships filter. Listed under §19.

---

## 18. Component and file impact map

| File | Change | Notes |
|---|---|---|
| `client/collector/CardSpecification.jsx` | per-object home controls; two new step kinds; `answers` gains a home per object; one shared new-binder creator with minted keys; `adopt` learns the Goal; three `WHY` sentences; the card-level section replaced by a legacy block | the biggest change in the batch |
| `client/sign-in/SignIn.jsx` | two `case`s | forced by `phase5-c33:1135-1148` |
| `client/commands.js` | two bindings | no card, no owner in the payload (`phase5-b7:313-334`) |
| `server/exposed-commands.js` | two entries, 23 → 25; comments rewritten | **not** `CARD_NAMING_COMMANDS` |
| `client/collector/sections/Collection.jsx` | the `binder` branch reads memberships; `withCopies` true for a binder; subrows carry a home control and `Remove`; the binder's copies are the filed ones, not all of them | the one correction, deliberately narrow |
| `client/collector/sections/Binder.jsx` | `unfiled` becomes membership-based; the library count counts cards in memberships + legacy rows; archived-binder view says so and does not offer "Add cards" | **blocked by a source guard** — see §19 |
| `client/collector/CollectorShell.jsx` | one callback down to Binder for the subrow actions | mirrors `onArchiveBinder` |
| `client/collector/present.js` | **new**: an object-label presenter, and a disposition presenter | neither exists today; `"Offered"`/`"Keeping"` are literal JSX in `Collection.jsx:401-403` |
| `client/collector/sections/Browse.jsx` | the banner survives; what the preselect lands on changes | §20 |
| `client/collector/sections/Goals.jsx` | **nothing** | unreachable; do not wake it in 3B |
| `domain/`, `persistence/`, `server/app.js` | **nothing** | 3A's semantics are frozen, and the projection already ships the data |

**Stale READMEs and comments to correct:** `client/collector/sections/Binder.jsx:8-23` (the
anti-inventory header, which must say where the rule still applies and where it no longer
does); `Collection.jsx:279-283`; `server/exposed-commands.js:108-123`;
`client/commands.js:368-388`; `domain/README.md` where it describes `binderEntries` as the
organisation record.

---

## 19. Test impact map

### Scaffolding — counts and lists that simply move

17 pins of `EXPOSED_COMMANDS.length` (23 → 25) and 7 verbatim exposed-list literals (each
needs the two names added and 3A's "AND NOT" comment removed): `phase5-c1-catalog-browse`,
`phase5-c2-collector-copy`, `phase5-c31-binder-foundation`, `phase5-c32-goal-criteria-grading`,
`phase5-c33-card-specification`, `phase5-c34b-binder`, `phase5-c35-close-the-loop`, plus
count-only pins in `phase5-c4`, `phase5-c5`, `phase5-c71`, `phase5-c8`,
`phase5-true-match-deal-flow`, `phase5-qualification-inspect-photos`,
`phase5-photo-request-fulfillment`, `phase5-four-state-and-binder-invariant`,
`phase5-collector-identity-stabilization`, `phase5-binders-cross-views`, and
`phase5-binder-object-membership:1044`. Plus `phase5-c5:212-239` (the git-measured delta,
which gains both names) and `phase5-binder-object-membership:1126` (`sent.size`).

**Unaffected:** `COMMAND_NAMES.length` stays 53 (3B adds no domain command); all 15 migration
pins stay at 14; `REFUSE` stays 44; and the stored-world collection list and the
binder-shaped-section pin **already include `binderMemberships`** — 3A did that work.

### Doctrinal guards requiring explicit reversal

These are the ones that need a recorded reason, not a new number.

| Guard | Claim being reversed |
|---|---|
| **`tests/phase5-c34b-binder.cjs:589-590`** | `assert(!/collectorCopies\|offered\|gradeLine\|grading/.test(code("client/collector/sections/Binder.jsx")), "the section reads a copy at all")` — **the single hardest blocker in the repository.** 3B cannot render objects from that file without the file containing `collectorCopies`. |
| **`tests/phase5-binders-cross-views.cjs:238-247`** | "a binder shows cards, never inventory" — forbids a certificate or `Offered`/`Not offered` reaching a binder. **The headline reversal.** |
| `tests/phase5-c34b-binder.cjs:573-591` | "no ownership or availability telemetry, however much of it is true" |
| `tests/phase5-c34b-binder.cjs:311-335`, `:604-620`, `phase5-binders-cross-views.cjs:652-666` | the library's card count and its one-derivation rule — the **principle survives** (library count = what the binder opens showing); the values and the derivation move |
| `tests/phase5-binder-object-membership.cjs:1039-1127` (section I, `[31]`–`[35]`) | **all of 3A's own closure pins**: not exposed, nothing in `client/` names them, no thunk exists, `sent.size === 23`. Every one of these is mine and every one must flip, with the reason recorded beside it. |
| `tests/phase5-binder-object-membership.cjs:1108-1111` (in `[34]`) | `assert(!new RegExp(cmd).test(panel))` — the panel will name a step kind, and `SignIn.jsx` will name the command |
| `tests/phase5-c34b-binder.cjs:939-976` | `eq(json(sent), json(["file"]))` — the preselect→Save path's exact step |
| `tests/phase5-c34b-binder.cjs:848-874` | the preselect test's global checkbox counts — **and the place where §20's preselect question gets answered** |
| `tests/phase5-c34a-your-cards.cjs:522`, `phase5-c34b-binder.cjs:629`, `:759`, `:1455` | four tests that use the heading *"Which binders does this card belong in?"* as proof the panel opened; re-point them at the new heading |
| `tests/phase5-c33-card-specification.cjs:1172`, `:1269-1271`, `:1377`, `:1412` | the exact `planFrom` sequence literals |

### Still-valid invariants 3B must NOT break

- **`tests/phase5-c33-card-specification.cjs:1083-1095`** and
  **`phase5-c34b-binder.cjs:633-636`** / **`phase5-c34a:534-544`** — no Collector surface may
  name a command. These **tighten** at 25 and force the step-kind design. Keep.
- **`tests/phase5-four-state-and-binder-invariant.cjs:586-600`, `:602-615`, `:617-629`** — a
  binder is ticked after the thing it organises; a copy is recorded before it is filed;
  removals last. Restate for the new kinds; `[27]` becomes *structurally* true rather than
  merely ordered.
- **`tests/phase5-c33-card-specification.cjs:1289-1322`** — refusable-for-itself before
  refusable-for-a-deal. Extend to the new kinds; do not relax.
- **`tests/phase5-binders-cross-views.cjs:426-436`** — no Goal may grow a `binderId`.
  Membership lives in its own table; neither a Goal nor a copy gains a field.
- **`tests/phase5-collector-identity-stabilization.cjs:657-686`** — `addBinderEntry` invents
  no object membership, even when one candidate is obvious.
- **`tests/phase5-four-state-and-binder-invariant.cjs:550-570`** — the legacy row's exact
  shape, and that it names no object.
- **`tests/phase5-binders-cross-views.cjs:180-187`** — `All Cards` lists one card once; the
  binder view's grouping must not leak into the other four views.
- **`tests/phase5-c34b-binder.cjs:639-657`** — one catalogue describe per screen (the `3`
  becomes "distinct cards").
- **`tests/phase5-copy-disposition-explicit-choice.cjs:595`** — an unanswered draft produces
  an exactly empty plan. The canary for "a home is optional".
- **`tests/phase5-collector-identity-stabilization.cjs:620-640`** — a replay sends nothing.
- **`tests/phase5-b81-plumbing-corrections.cjs:191-197`** — exact client/exposed equality, to
  move 23 = 25 together and never to be weakened.
- **`phase4-collector-read-experiences.cjs:640-647`** — every `.set(X,` in
  `client/collector/` must have `id` in the key expression. 3B's membership maps must key on
  `objectId` or similar, not on `key`.
- The whole privacy regression set: `phase5-binder-object-membership` `[13]` `[14]`,
  `phase5-c31` privacy section, `phase5-c33:1621-1651`, `phase5-c34b` section G,
  `phase5-binders-cross-views:535-546`.
- The whole no-inference set: `phase5-binder-object-membership` `[18]` `[19]` `[19b]` `[20]`
  `[29]` `[30]`.
- The whole one-home / move set: `[6]`–`[9]`, `[26]`–`[28]`.

### Brittle guards that will bite for reasons unrelated to what they protect

Worth knowing before writing code, because each fails confusingly:

- `phase5-binder-object-membership.cjs:782-789` — the `const draftId = …;` statement must be
  one semicolon-free statement mentioning `draftId` and not `"record-copy"`, `"offering"` or
  `"file"`. **The reason §12 names the kinds `file-object` / `unfile-object`.**
- `phase5-c33-card-specification.cjs:1452-1454` — requires the literal
  `await onCommit(sending`. Constrains how `commit` may be refactored.
- `phase5-binders-cross-views.cjs:296-298` — a source slice between `const needle` and
  `const shown` in `Collection.jsx` must contain no `execute`, `command` or `onSpecify(`.
- `phase5-binders-cross-views.cjs:213-224` — a slice between `mcs-group-head` and
  `listed.map(` must not contain `gradeLine`. Both anchors must survive the rewrite.
- `phase5-binders-cross-views.cjs:301-317` — requires `setQuery("")` inside a **brace-free**
  `chooseView` body.
- `phase5-c34b-binder.cjs:484-485` — forbids the substring `delete` anywhere in `Binder.jsx`,
  including inside a word or a comment.
- `phase5-c5-tp-inventory-correction.cjs:998-1013` — anchored on the exact post-save sentence
  text in the panel.

### Harness gaps 3B must close first

1. **`tests/phase5-c34b-binder.cjs:255` — `onSpecify` is a recorder, not a sender.** It pushes
   the step and returns `undefined`, which `commit` reads as success while minting nothing.
   **No test in that file can drive an object filing from the Binder section through to the
   database.** The single biggest gap; wire it to the same `send` helper the other callbacks
   use.
2. **Three independent copies of the step→command switch**, each defaulting to
   `command-unavailable`, so a new step kind fails *as a silent refusal*:
   `phase5-c33:1118-1134`, `phase5-collector-identity-stabilization:371-388`,
   `phase5-binder-object-membership:626-634`. All three must learn the new kinds.
3. **Two harnesses hand the panel an unscoped world** (§17). Switch to `projectForActor`.
4. **Checkbox probes are global, not scoped** (`phase5-c34b:862-864`, `:892`, `:995`;
   `phase5-c33:1009` takes the *first* checkbox and calls it a binder). Per-object controls
   need per-object selectors — an `aria-label` naming the object is the natural answer and is
   also an accessibility requirement, since today every disposition group on every copy row
   carries the identical `aria-label` (`CardSpecification.jsx:828`).
5. **No fixture anywhere populates `binderMemberships` for a mounted view.** Every
   `world()`/`FULL()` in `phase5-binders-cross-views`, `phase5-c34b-binder`,
   `phase5-four-state-and-binder-invariant` and `phase5-copy-disposition-explicit-choice`
   needs a memberships arm — and because `rows()` tolerates `undefined`, **add one explicit
   test that a binder with memberships and no legacy entries is not empty**, or the §16
   failure mode ships silently.

### New test surface

`tests/phase5-binder-object-membership.cjs` — extend section G, **replace section I** (3A's
closure pins belong beside their reversal). `tests/phase5-c33-card-specification.cjs` section
F — the plan sequences, the retry, the panel↔entrance mapping.
`tests/phase5-four-state-and-binder-invariant.cjs` section D — the ordering doctrine,
restated. `tests/phase5-binders-cross-views.cjs` (`showView`) and
`tests/phase5-c34b-binder.cjs` (`screen`) — the binder renders objects. A **new 3B suite** for
the two doors and the controls that press them, so the by-value pin can be stated as
archaeology later.

---

## 20. Adversarial findings, and the design revisions they forced

I attacked the design above with the sixteen cases in the brief. Eleven held. Five changed it,
and one is handed to you.

**1. Three same-card copies with no physical facts — the design had nothing to say, and still
has a choice to make.** Probed: a bare copy's `grade`, `cert` and `condition` are **absent
keys**, not nulls. `gradeLine` returns `null`, and the row falls back to the literal
`"Not stated"`. So three such copies are three identical subrows, and a `Binder ▾` on each is
three identical controls — worse than today, because today you cannot act on one at all and
after 3B you can act on the wrong one.

The repository offers exactly two durable discriminators: the minted id, and `addedAt`.
Four candidate answers:

| | Approach | Honest? | Cost |
|---|---|---|---|
| (a) show nothing extra, rely on order | **no** — the order is array order, which is arrival order but says so nowhere | none |
| (b) **ordinal by `addedAt`, id as tiebreak**: "The one you added first" / "…added next" | **yes**, if worded as a sentence about when, not as a name | one presenter |
| (c) let the Collector give a copy a short private label | yes, and best in the long run | a new durable field — **scope growth, 3B-sized on its own** |
| (d) require a distinguishing fact before a second copy may be filed | no — coercive, and the product's whole position is that optional facts are optional | friction |

**Recommendation: (b) for 3B, and name (c) as the real answer for later.** The wording matters
and must not drift into identity: *"the one you added first"* is a true sentence about when;
*"Copy #1"* is a fake name that the Collector will reasonably expect to be stable and
meaningful, and it is neither. **This is the one genuine product choice the repository cannot
settle, and I am flagging it rather than deciding it for you** — if you would rather 3B carry
a private label, say so and it becomes part of the batch.

**2. Goal + three copies, four different homes — the Binder view double-counts.** With card
grouping, the same card heading appears in four binders. Verified against the existing
invariant: `phase5-binders-cross-views.cjs:652-666` requires the library count to equal what
the binder opens showing, so counting *cards per binder* is consistent — Trade Night says
"1 card" and shows one heading with one subrow. **Revision:** the library counts cards whose
objects are filed in that binder (plus its legacy rows), never objects, and never a global
total. A Collector asking "how many things have I organised" is not a question any screen
should answer, for the same reason the anti-inventory doctrine exists.

**3. Goal + Copy in the same binder — "Binder" on both subrows reads as duplication.**
**Revision:** the home control is shown on a subrow **only when more than one home is
possible on this screen**, and inside a binder the natural control is `Move` + `Remove from
Binder` rather than a dropdown repeating the binder you are already looking at. Inside Trade
Night, a subrow reads `… I'd trade or sell this one — Move · Remove`. The dropdown form lives
in the panel, where all of a card's objects are visible together.

**4. One new binder used by two new objects; first object succeeds, second refuses.** Walked
through: `make-binder` lands, `record-copy` #1 lands, `record-copy` #2 is refused, `commit`
stops — so **neither** `file-object` ran, and the Collector has a new binder with nothing in
it and one unfiled copy. The message is honest (`explain` names what stood), the retry
recomputes and files both. But the ordering is wrong: filing sits in block 3, *after* all the
object creation in block 2, so one refusal costs the filing of an object that **did** succeed.
**Revision: interleave filing per object** — emit each object's `file-object` immediately
after the step that creates it, still ahead of block 4. This keeps the existing doctrine
exactly (`file-object` is refusable only for itself, so it may sit anywhere before the
deal-refusable three) and makes a stopped sequence lose strictly less. It also makes
`phase5-four-state-and-binder-invariant` `[27]` ("a copy is recorded before it is filed")
adjacent rather than merely ordered.

**5. Binder succeeds, object refuses; and retry after a partial Save.** The binder persists,
which is correct (`:148-160` — a created binder is a real thing and the retry must not make a
second one). `adopt` moves it from `newBinders` into `binders`. **Revision, carried from §8
and §11:** the new-binder handle must be a minted client key rather than the array index,
because an object's chosen home refers to that handle across a retry that re-indexes
`newBinders` — and `adopt` must also bind a minted **Goal** id, or the retry re-sends
`start-looking` and earns `duplicate-goal`.

**6. The archived destination, and what an archived home displays as.** Probed: filing
something **new** into an archived binder is refused `binder-archived`; re-stating an existing
home there is accepted as a no-op; unfiling always works. So a thing can legitimately live in
a binder the Collector has put away. **Revision:** archived binders are excluded from the
dropdown's options (as today, `:411`), **but** a thing already in one shows its home with a
plain note — `Trade Night (put away)` — rather than appearing unfiled, which would be a lie,
or appearing normal, which would mislead. `Remove from Binder` stays live. And the `Add cards`
defect in §3(ii) gets fixed in the same pass.

**7. Object deleted while a Binder is open.** The membership goes with it in the same command
and the database cascades (probed). The open view re-renders from the next projection with one
fewer subrow. No prerequisite, no warning, no orphan. **Holds.**

**8. Stale client.** §16. **Revision:** `command-unavailable` needs a `WHY` sentence, or the
only skew path a correct client can hit reports as a blank.

**9. Partner projection.** Probed clean, no change needed (§17). **Holds.**

**10. Duplicate binder names.** `createBinder` has no duplicate rule and the schema has no
unique key. A dropdown listing "Trade Night" twice is legal and confusing. **Revision:** the
control's options are keyed by id (never by name, which `phase5-binder-object-membership:784`
already guards against in the panel), and two same-named binders are disambiguated by the
oldest-first order the library already uses — **not** by appending a number, which would
invent an identity the data does not have. Flagging rather than fixing: if duplicate names
become a real complaint, the answer is a rename prompt, not a synthetic suffix.

**11. No binders at all; and a Collector who chooses no binder.** The panel's empty state
already says the right thing (`:678-681`). With per-object controls and no binders, each
control shows `Unfiled` and offers only "New binder…" — which is correct and needs no special
case. A Collector who never touches it produces a plan with no filing steps, which the
`phase5-copy-disposition-explicit-choice:595` canary protects. **Holds.**

**12. Legacy row plus all of the above.** Scenario Q. The design shows the objects with their
own homes and the legacy line as history, which is the only arrangement that asserts nothing
false. **Holds**, and it is why §14's rules are hard rules.

### And one defect in the repository, found while auditing

**Two comments I wrote in Batch 3A still say the opposite of the assertion beside them.**
`tests/phase5-c71-catalog-hygiene.cjs:513-515` and
`tests/phase5-c8-inventory-csv-mapping.cjs:1031-1032` read *"Those two ARE exposed, and the
door above moved 23 → 25"* — directly above `eq(EXPOSED_COMMANDS.length, 23, …)`. The closure
moved the counts and the verbatim lists and fixed five stale test **titles**, and missed these
two comment **bodies**. It is exactly the failure the closure hand-back named: a stale
explanation is worse than an old one.

**I have not fixed it, because this batch is audit-only.** It is a two-comment change with no
behavioural effect, and 3B will touch both lines anyway when the count moves to 25 — at which
point the comments become true by accident, which is the wrong way to be right. Say the word
and I will correct them in a one-minute commit of their own.

---

## 21. Explicit non-goals

Not in 3B, and not in this audit: any change to 3A's persistence or domain semantics —
migration 0014, the cascades, the deferrable constraints, the minted id, the repository
mirrors, the validator rules, the command contracts, the gate ordering, the idempotency, the
move-in-place behaviour, the removal lifecycle or the projection scoping. No new migration.
No new domain command. No new refusal code. No projection change. No `binder_entries` schema
change, no backfill, no conversion, no inference, no census, no drop. No removal of
`addBinderEntry` or `removeBinderEntry` from the exposed list (that is 3C). No resolution UI.
No Binder delete. No Shortlist, Saved, Maybe, Binder-only or fifth state. No multi-home
object. No search or browse UX beyond the meaning-first routing of the existing "Add cards"
banner. No change to Goal tiers, dispositions, grading, transactions, Opportunities, Pending,
Market Value or qualification. No waking of the deferred `Goals` section. No visual styling
work. No broad cleanup. No merge. No push workaround.

---

## 22. One smallest recommended implementation batch, with an exact stop condition

### Batch 3B-1 — "A specific thing has a home, and the binder shows it"

The irreducible unit is that a Collector can **put a specific thing somewhere and then see it
there**. Filing you cannot see, or a binder view with nothing filed into it, are both the
half-migrated experience the stop condition forbids. So the batch is:

**1. Expose and bind, in one commit with the surface.**
`fileObject` / `unfileObject` into `EXPOSED_COMMANDS` (23 → 25); `fileObjectInBinder` /
`unfileObjectFromBinder` in `client/commands.js`; two cases in `SignIn.jsx`. The b81 equality
moves 23 = 25 together and is not weakened.

**2. Per-object homes in the Card Specification panel.**
A single-choice home with `Unfiled` first, beside the Goal and beside each copy row. One
shared new-binder creator with minted client keys. Two new step kinds, `file-object` /
`unfile-object`, emitted immediately after the step that creates each object. `adopt` learns
the minted Goal id. Three new `WHY` sentences. An object label honest enough to tell two bare
copies apart (§20 case 1, option b, unless you choose otherwise).

**3. The card-level `file` step stops being emitted.** New bare-card filing ends here. The
door stays open for one release (§15), and `removeBinderEntry` stays for legacy cleanup.

**4. The binder view renders objects.**
`Collection.jsx`'s `binder` branch reads `binderMemberships`; `withCopies` true for a binder
and scoped to the copies filed *there*; a card heading with an object subrow each, carrying
its meaning and its own `Move` / `Remove from Binder`. `Binder.jsx`'s `unfiled` list becomes
membership-based and its library count counts cards whose objects are filed there, plus legacy
rows.

**5. Legacy rows shown as history.** A plainly-worded line in the panel and in the binder,
with `Remove` and nothing else. Never inferred, never converted, never moved.

**6. The two pre-existing defects in the surfaces being touched:** the archived-binder
"Add cards" path, and the "Not in a binder yet" list that answers the card-level question.

**7. The harness work first, not last** (§19): wire `phase5-c34b`'s `onSpecify` to a real
sender, teach all three step→command switches the new kinds, switch the two unscoped `seen()`
harnesses to `projectForActor`, add per-object test selectors, populate memberships in the
mounted-view fixtures, and add the explicit "a binder with memberships is not empty" test.

**Deliberately out of 3B-1:** the Collection views other than `binder`; waking `Goals.jsx`;
any private copy label (§20 case 1 option c); the explicit legacy-resolution concept; and
removing `addBinderEntry` from the exposed list.

### Exact stop condition

> **Stop when a Collector can, in the shipping product:**
>
> 1. open one card that has a Goal and two owned copies, see **three separate things** each
>    showing its own home or `Unfiled`, and give each of them a **different** binder in one
>    Save — including a binder created in that same Save;
> 2. open each of those binders and see **that specific thing** listed there with its own
>    meaning, and nothing that isn't filed there;
> 3. **move** one of them to another binder, and **remove** another from its binder, each in
>    one gesture, with neither action changing what the thing means;
> 4. change a Goal's tier and a copy's disposition and watch **nothing move**;
>
> **and** every one of the following is still true:
>
> 5. a Trusted Partner's projection contains no binder id, name, count or hint — the existing
>    privacy suites pass untouched;
> 6. no `binder_entries` row is created by anything in the product, and every existing one is
>    still visible and still removable, and nothing anywhere inferred an object from one;
> 7. no migration, no domain command, no refusal code and no projection change was added;
> 8. the client/exposed set equality holds at 25 = 25, unweakened;
> 9. every reversed doctrinal guard carries the reason it was reversed, in place;
> 10. the full suite, build, prod and smoke are green, and every new load-bearing assertion
>     has been mutation-verified.

### What I would want decided before starting

One thing only, and it is §20 case 1: **how two owned copies of one card with no
distinguishing physical facts are told apart.** My recommendation is an honest ordinal
sentence derived from `addedAt` ("the one you added first"), with a private Collector-given
label named as the better long-term answer and left out of 3B. If you would rather have the
label now, 3B grows by a durable field and a migration, and I would want to say so in the
plan rather than discover it halfway through.

---

**Design and audit only. Nothing implemented, nothing merged, 3B not started. Working tree
clean at `ff80c17`.**

Push remains refused by the cloud proxy — `Davi17000/metyet-app` is not in this session's
authorized repository set. Not routed around; this document is delivered as a file and in the
project, with the usual verified bundle if you want the commit.
