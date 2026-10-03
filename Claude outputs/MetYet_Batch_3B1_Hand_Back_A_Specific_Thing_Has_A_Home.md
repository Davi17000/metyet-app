# MetYet — Batch 3B-1 Hand-Back: A Specific Thing Has a Home, and the Binder Shows It

Branch `phase-5-four-state`. Implementation only; 3C not started, nothing merged.

---

## 1. Verified start SHA and worktree

```
branch            phase-5-four-state
start HEAD        88712d0  Docs: per-object Binder homes — Batch 3B design audit
git status        clean
```

Lineage verified rather than trusted, and all four SHAs in the brief are present and in
order: `876e485` (3A implementation), `592db69` (3A hand-back), `04467e1` (3A closure),
`ff80c17` (closure docs), `88712d0` (the 3B audit).

Baseline counts, read from the code before any change — all six as the brief expected:
exposed **23**, domain **53**, migrations **14**, refusals **44**, projected sections **21**,
durable collections **18**.

## 2. Implementation and docs SHAs

- Implementation: **`f7f820d`** — *"A specific thing has a home, and the Binder shows it"*.
- Docs: this file, committed separately immediately after `f7f820d`.

## 3. Product files changed — 9 files, +953 / −190

| File | What moved |
|---|---|
| `client/collector/CardSpecification.jsx` | the whole subject change: per-object home controls, two new step kinds, interleaved filing, minted keys, `adopt` for the Goal and the binders, the legacy line, three refusal sentences |
| `client/collector/sections/Collection.jsx` | the binder view reads memberships; objects are the rows; `Move` / `Remove from Binder` |
| `client/collector/sections/Binder.jsx` | the count, the unfiled list, the archived correction, the callbacks |
| `client/collector/present.js` | `copyLabels`, `copyFactsLine`, `addedOrderLabel` — none existed |
| `client/commands.js` | `fileObjectInBinder`, `unfileObjectFromBinder` |
| `client/sign-in/SignIn.jsx` | two bindings, two cases |
| `client/collector/CollectorShell.jsx` | two callbacks threaded |
| `client/production-app.jsx` | two props threaded |
| `server/exposed-commands.js` | two entries, 23 → 25 |

**`git diff ff80c17 -- domain/ persistence/` is empty.** No migration, no domain command, no
refusal code, no projection change, no schema change.

## 4. Test files changed — 19

New assertions: `tests/phase5-binder-object-membership.cjs` gained section J (seven
Collector-experience tests), two retry/archive tests, and section I rewritten as the
reversal of 3A's closure pins — 38 → 47 assertions.

Re-pinned: `phase5-c33-card-specification`, `phase5-c34b-binder`,
`phase5-four-state-and-binder-invariant`, `phase5-collector-identity-stabilization`,
`phase5-c34a-your-cards`, plus the mechanical 23 → 25 count and list pins in
`phase5-c1`, `phase5-c2`, `phase5-c31`, `phase5-c32`, `phase5-c35`, `phase5-c4`,
`phase5-c5`, `phase5-c71`, `phase5-c8`, `phase5-true-match-deal-flow`,
`phase5-qualification-inspect-photos`, `phase5-photo-request-fulfillment`,
`phase5-binders-cross-views`.

**`phase5-b81-plumbing-corrections.cjs` is NOT in the list.** The exact client/exposed
equality moved from 23 = 23 to 25 = 25 with the file untouched.

## 5. Harness corrections, done first

1. **`phase5-c34b`'s `onSpecify` was a recorder, not a sender.** It pushed the step and
   returned `undefined`, which `commit` reads as success while minting nothing — so no test
   in that file could drive a filing from the Binder section through to the database. It now
   records **and** sends, mapped exactly as `SignIn.jsx` maps, and `send` carries `value`
   through (it was dropped, invisible while nothing minted and fatal the moment a step has to
   bind a returned id).
2. **All three independent step dispatchers taught the new kinds** —
   `phase5-c33:1117`, `phase5-collector-identity-stabilization:373`,
   `phase5-binder-object-membership:629`. Each defaults to `command-unavailable`, so an
   untaught kind would have failed as a *silent refusal*.
3. **Two harnesses handed the panel an unscoped world.** `seen()` spread the raw world and
   filtered three collections by hand, leaving `binderMemberships` unscoped — including
   another Collector's rows. The membership harness now calls `projectForActor`, which is the
   honest answer.
4. **Memberships populated in the mounted fixtures**, and section J mounts the real
   `Collection` over the real projection.
5. **The explicit silent-failure regression, `[39]`:** a binder with memberships and **zero**
   legacy entries is not empty. `rows()` tolerates `undefined` and the collection is
   optional, so a regression that stopped reading memberships would render an *empty* binder
   — a Collector would watch their organising vanish and the logs would say nothing.
6. **Global index and checkbox probes replaced with accessible per-object selectors.**
   `phase5-collector-identity-stabilization`'s helper counted every `select` and called each
   one a grade control; a copy row now carries a home as well, so it addressed the wrong one.
   Controls are picked out by their `aria-label`, never by position — which is also why the
   labels are worth having.

## 6. Exposure and client proof, 25 = 25

```
25  server/exposed-commands.js  (+fileObject, +unfileObject)
25  client/commands.js          (+fileObjectInBinder, +unfileObjectFromBinder)
```

`phase5-b81-plumbing-corrections.cjs:191-197` asserts set equality in **both** directions and
passes unmodified. A door without a binding fails it; a binding without a door fails it. Both
sides moved in one commit because that assertion does not permit anything else — which is
exactly what made 3A's closure necessary, and it is not weakened, exception-listed or turned
into a subset check.

New test `[35]` measures the same equality inside the membership suite **and** adds the half
the set guard cannot see: every binding must be *imported* by something. A thunk nothing
imports satisfies set equality while being dead, which is precisely what 3A's two were.

Payloads carry one binder and one object. `phase5-b7:313-334` forbids a card or an owner in a
binding, and `[33]` asserts it directly over the function body. Neither command joined
`CARD_NAMING_COMMANDS` — they name no canonical card, the object named its card when it was
created, and a Collector must still be able to organise a Goal for a card the catalogue has
since withdrawn.

## 7. CardSpecification: before and after

**Before** — three sections, binders first, subject the card:

```
Which binders does this card belong in?
  [x] Mudkip Collection   [ ] Keepers   [ ] Untouched
  [ New binder… ] (Add binder)
Are you looking for it?   …
Do you have one?          (rows with no heading at all)
```

**After** — subject the thing:

```
Are you looking for it?        Not looking / Keeping an eye out / Actively hunting
  Grade wanted: PSA 10
  Binder: [ Mudkip Master Set ▾ ]          ← only when there is a Goal

Do you have one?
  PSA 10 · cert 111
    Grade / Condition / Certificate / Your reference value
    (•) I'm keeping this one
    Binder: [ Personal Collection ▾ ]
    I no longer own this

  PSA 9 · cert 222
    …
    Binder: [ Trade Night ▾ ]

Need a new binder?
  Mudkip Master Set — new    Don't make it
  [ New binder… ] (Add binder)

Filed before                                   ← only when a legacy row exists
  This card was filed in Trade Night before Binders organised specific cards.  Remove
```

The card-level section is gone, not relabelled. A copy row has a heading for the first time.

## 8. The Goal's home

Offered **only when there is a Goal to have one**: "Not looking" means there is no thing for
a binder to organise, and a binder may not manufacture one. For a new Goal the choice applies
to the Goal this Save creates, via a constant handle (`GOAL_DRAFT`, because a card has at
most one Goal) that is client-plan identity and reaches nothing downstream.

Seeded from `binderMemberships` and **never** from a legacy row: a card filed before 3B opens
with every object Unfiled, and the legacy line says why rather than standing in for an answer.

## 9. Each copy's home

One per copy draft, keyed on the copy's durable id or — for a new copy — its minted client
key, never its array position. A new copy's filing names the key `record-copy` declared and is
resolved to the minted id immediately before dispatch.

A copy nobody filed opens `Unfiled`, which is an answer rather than a blank, and emits
nothing. Pinned by `phase5-four-state` `[27b]` and by
`phase5-copy-disposition-explicit-choice`'s exact-empty-plan canary, which still holds.

## 10. Identical copies: presentation and stable targeting

`copyLabels(list)` decides across the whole set, because a label can only be known to
distinguish a copy by looking at its siblings.

| Case | Label |
|---|---|
| facts unique in the set | `PSA 10 · cert 111` |
| facts shared | `The one you added first · PSA 9` |
| no facts at all | `The one you added first` / `…next` / `…third` |

Order derived from `addedAt`, with the stable id as tiebreak, **never** array position —
pinned by `[40]`, which reverses the projection's array and asserts the label does not move.
No invented number, no id on screen; `[40]` asserts both. Inside a binder the copy subrow's
*title* is this label rather than `gradeLine || "Not stated"`, because in a binder the
question is which copy this is, and "Not stated" answers nothing.

Per-copy accessible labels: the row carries `aria-label`, and each home control is
`Binder for <that label>`. Before this batch every disposition group on every copy row
carried the identical `aria-label`.

## 11. New-binder stable draft keys

One creator at panel level, so one new binder can be chosen by several things and produce
**one** `make-binder` — asserted in `phase5-c33`'s ordering test.

The handle was `new-binder-${i}`, the array index, which was survivable while only the card
referred to a new binder: `adopt` removed the created entries and the next plan recomputed
the indices. It stops being survivable the moment an object's chosen home refers to one,
because a partial Save removes an earlier entry and re-points every later object. Keys are
now minted at the click from the same `useRef` counter `addCopy` uses, and the lesson is the
one already written out there.

A draft binder nothing chose can be removed with "Don't make it", and anything that had
chosen it falls back to Unfiled. The rows used to be `checked readOnly disabled`, so a typo
could only be escaped by cancelling every other answer on the screen.

No name dedupe anywhere: `[42]` files into one of two binders called "Trade Night" and
asserts the other stays empty.

## 12. The Goal's minted id, and `adopt`

`start-looking` carries `goalDraftId`; `commit` records the minted id against it; `adopt`
stores `madeGoal: { id, tier, desired }` — **as it was sent**, not as the answers now read,
so a person who fixed the tier between two presses still has the correction travel as its own
step. `planFrom` treats `stateGoal || madeGoal` as the Goal, so a retry neither re-creates it
nor loses the home it was going to be given.

`adopt` also records `madeBinders`, which was a finding rather than a plan: bite 16 did not
bite until I chased why, and the answer was that a home naming a binder the server had just
minted was being dropped as a destination the panel could not yet see — so the retry quietly
did nothing. The server returned the id; that is knowing it exists.

Tested with the projection held **still** (`[24b]`), because that is the real race: `commit`
reads the `state` prop and the parent's refresh is a round trip, so a person pressing Save
again the instant the message appears can beat it. `addGoal` is the one step in the plan that
is neither idempotent nor content-addressable — a re-send earns `duplicate-goal`, which is a
refusal for work that already succeeded.

## 13. Plan ordering, with partial-Save examples

```
make-binder          ×M   (containers; one per new binder, whoever chose it)
offering / keeping        (dispositions on copies that already exist)
record-copy  →  file-object        ← each new copy, filed immediately
start-looking →  file-object       ← the new Goal, filed immediately
file-object / unfile-object        ← the homes of things that already existed
correct-copy, wanted-copy, how-hard   (what a live deal can refuse)
stop-looking, forget-copy             (removals, last of all)
```

The refusal-class doctrine is unchanged: `fileObject` can be refused only for itself, so it
may sit anywhere ahead of the three a deal can refuse, and it does. What moved is that a new
thing's filing is **adjacent** to its creation. `phase5-c33` asserts adjacency per thing
rather than by global index, because a global comparison would not notice one inverted pair.

**Binder succeeds, object refuses:** `make-binder` lands, `record-copy` #2 is refused, the
sequence stops. The binder exists with the first copy already in it; `explain` names what
stood; the retry recomputes and sends only the rest. Asserted in
`phase5-collector-identity-stabilization` `[12]`.

**Earlier object succeeds and files, later sibling refuses:** `record-copy` #1,
`file-object` #1, `record-copy` #2 refused. The first copy **keeps its binder** — which is
the whole reason the order moved, and bite 17 proves it: moving the filing back to a block at
the end fails `[12]` and the c33 sequence.

**Retry after a partial Save** duplicates nothing: no second binder (minted key), no second
Goal (`madeGoal`), no second copy (`draftId`), and no second filing for a thing already where
the answer says it goes.

## 14. Proof the shipping UI no longer emits a card-level `file`

- `[34]`: the panel source contains `kind: "file-object"` and `kind: "unfile-object"` and,
  with comments stripped, **no** `kind: "file"`.
- `phase5-c33`'s ordering test: `plan.filter(k === "file" || k === "unfile").length === 0`.
- `phase5-c33`'s step-kind inventory: the panel-produces exception shrank from
  `file` *and* `unfile` to **`file` alone** — `unfile` is still produced, by the legacy line's
  Remove, which is the one card-level gesture left.
- `phase5-c34b`'s Save-from-preselect test asserts `binderEntries.length === 0` after a full
  Save through the real panel against the real server.
- Bites 5 and 14 make the panel emit a card-level `file` again; both fail.

## 15. Binder rendering model

```
Trade Night                                           2 cards

  Mudkip · Ruby & Sapphire #10                        ← heading: identity only, no action
    Actively hunting · Looking for PSA 10             ← the Goal, its own row
      Move ▾ · Remove from Binder
    PSA 9 · cert 222 · Offered                        ← one copy, its own row
      Move ▾ · Remove from Binder

  Charizard · Base Set #4
    Filed before Binders organised specific cards     ← history, no actions
```

Grouped by canonical card, one subrow per filed object, every statement and every action on
the thing. `[38]` asserts one `mcs-group` article for a Goal and a copy of one card in one
binder, and two things inside it — counted structurally, because the card's name legitimately
appears twice in a heading (the picture's label and the title).

Inside a binder the heading's Goal tag and copy count are suppressed: both are statements
about things, and things have rows now.

## 16. Proof only filed objects show

`[37]` files a Goal in Hunting, a kept copy in Keepers and an offered copy in Trade Night —
all one card — and leaves a second offered copy nowhere. Each binder is rendered and asserted
to show its own thing and **not** its siblings.

`phase5-c34b`'s reversed telemetry test does the same from the other side: two owned copies,
one filed, and the unfiled one must be absent as a row and absent from any count.

Bite 7 (`binderView ? mine` — join every sibling copy by card) fails both.

## 17. Library count

Unchanged in meaning: **the cards opening the binder shows**, from three sources unioned into
one set — the card each filed Goal names, the card each filed copy names, and the card each
legacy row names. A Goal and two copies of one card in one binder is still one card.

No global "things organised" metric anywhere. `phase5-c34b` asserts the library screen still
carries no ownership telemetry, exactly as C3.4 wrote it.

## 18. The archived-binder correction

An archived binder opened in the same view as a live one, with nothing saying so and a **live
"Add cards"** button that routed to a panel where that binder could not be chosen at all.

Now: the name reads `— put away`, the route is replaced by **Bring back**, archived binders
are not offered as destinations, and a thing already in one shows its home as
`Trade Night (put away)` rather than appearing unfiled (a lie) or normal (misleading).
`Remove from Binder` stays live there, which the domain has allowed since 3A.

`[24c]` covers the stale case: a binder put away while the panel is open stops being a
destination, and the plan says **nothing** for that thing rather than sending a guaranteed
refusal or quietly reading the answer as Unfiled — "leave it there" is what the person said.
Bite 11.

## 19. The "Not in a binder yet" correction

It collected the cards named by every entry in an active binder and called a Goal filed if its
**card** was among them — so a Goal counted as filed because somebody had once put that card
in a binder, possibly before the Goal existed. A Goal is now unfiled when **that Goal** has no
membership. Bite 10.

A Goal naming no canonical card stays out of the list, as it always has: every row promises a
describable card and an Open that reaches the panel, and a pre-C2 Goal can do neither. 3B-1
makes such a Goal *fileable* for the first time, which is a reason to revisit the list's
promise rather than to put an unopenable row in front of somebody. Recorded as debt.

## 20. Browse / Add cards

The ritual is unchanged — Binders → Add cards → Browse → the panel — and what it produces
changed. The binder is offered to what this Save **creates**: a Goal that does not exist yet.
An object that already has a home keeps it, and an object already Unfiled keeps that too,
because Unfiled is an answer. Coming in from a binder is not a reason to move somebody's
things; `phase5-c34b`'s new mirror test asserts exactly that.

**It does not silently claim both a Goal and a copy.** The preselect lands on the Goal's home
only, and a copy's home is a choice the person makes on that copy's row — so the UI never
assumes an intent it did not capture.

## 21. Legacy coexistence

| | |
|---|---|
| Visible | in its binder (as history, no actions) and in the card's own panel |
| Wording | "This card was filed in *Trade Night* before Binders organised specific cards." No jargon, no ids, no "binder entry". |
| Removable | yes, from the panel — one press, one command, its own gesture, never part of the Save's difference |
| Movable | no. Moving it would assert the thing it cannot assert. |
| Inferred | never. Not even where one Goal is the only candidate. |
| Created | never again by the product |

## 22. Proof of zero new `binder_entries` through the 3B UI

- `[34]`: the panel plans no card-level filing.
- `[23]`: a full Save through the mounted panel — new binder, new Goal, home chosen —
  leaves `binderEntries.length === 0` and `binderMemberships.length === 1`.
- `phase5-c33`'s full-specification test: `binderEntries.length === 0`,
  `binderMemberships.length === 2`.
- `phase5-c34b`'s Save-from-preselect test: `binderEntries.length === 0`.
- `client/commands.js:357` remains the only writer of `binder_entries` in the repository — no
  seed, no import, no migration writes one — and no step the panel can plan reaches it.

## 23. Proof of no inference and no conversion

- `[41]` (scenario Q rendered): one legacy row, a Goal and three copies. The row shows as
  history; nothing reads it as a home; no Move is offered on it.
- `phase5-c34b`'s new mirror test: a card-level row in a binder that does not hold the Goal
  produces no `Looking for` and no tier anywhere.
- `phase5-c34b`'s re-pinned "filing it makes it leave": filing the **card** leaves the Goal in
  "Not in a binder yet", and filing the **Goal** is what settles it. The correction asserted
  as the correction.
- `initialAnswers` does not read `binderEntries` at all; `phase5-c33` asserts a card with a
  legacy row still opens with the second copy `home: null`.
- 3A's `[19]` (a legacy row is never an object's home) and
  `phase5-collector-identity-stabilization` `[19]` (`addBinderEntry` invents no membership)
  pass untouched.

## 24. Privacy

**No projection change.** `git diff ff80c17 -- domain/` is empty.

`[43]` is the new rendering-layer proof: a Goal and a copy filed, and a partner's projection
asserted to carry no binder name, no id, `binderMemberships: []`, `binders: []`,
`binderEntries: []` and no derived `binderCount|filedIn|binderTotal`. `[13]` and `[14]` (both
owners scoped, including hand-seeded both-named and neither-named rows) pass untouched, as do
`phase5-c31`'s privacy section, `phase5-c33:1621-1651` and `phase5-c34b` section G.

No client-side owner filtering: the binder view filters by `binderId` and by object id, never
by owner. `phase5-c34b:1333-1337` forbids `collectorId ===` in `Binder.jsx` and still passes.
Bite 13 leaks memberships to a partner and fails three assertions.

## 25. Version skew

| | |
|---|---|
| **New client, old server** | `fileObject` is not exposed → `server/app.js:435` returns **409 `command-unavailable`**, in the command vocabulary. `commit` treats it as a refusal, stops, reports, keeps the answers. `WHY` now has the sentence: *"This version of MetYet cannot file that yet. Reload the page and try again."* |
| **Old client, new server** | sends `addBinderEntry`, still exposed, still works. Memberships it cannot read render as nothing, so a binder looks emptier than it is — confusing, not broken, and the reason the door stays one release. |
| **Rollback** | 3A proved both halves against the actual pre-batch code; this batch changes no schema and no projection, so the UI rollback simply returns the card-level screens and the memberships wait. |
| **Deploy order** | the server exposure is additive and inert until a client sends; everything else ships together because the b81 equality binds it. |

Two more sentences were added for the same reason `invalid-tier` has one — a refusal with no
sentence behind it reaches a Collector as a blank: `binder-archived` ("That binder has been
put away. Bring it back first, or choose another.") and `invalid-target`.

## 26. Doctrinal reversals, each with its replacement

**(a) "A binder shows cards, never inventory"** — `phase5-c34b:573-591`,
`phase5-binders-cross-views:238-247`.
*Old claim:* a copy's grade and disposition are facts about a shelf nobody asked this screen
for. *Why superseded:* a binder holds a Goal, or one copy, or two of three copies — opening
one must say WHICH of your things are here, and a thing cannot say which it is without
saying what it is. *Replacement:* the test is now "a binder says what is IN it and still
counts no shelf": the filed copy says what it is, the **unfiled** sibling must be absent as a
row and absent from any count, and the library outside still carries no ownership telemetry.
*Mutation-verified:* bites 6 and 7.

**(b) The source guard forbidding `collectorCopies` in `Binder.jsx`** — same test, source
half. Counting the cards in a binder now means reading the card each filed copy names.
Replaced by the behavioural assertions above plus the still-live guards that `Binder.jsx`
names no command and does no owner filtering. *Verified:* bites 6, 7, 13.

**(c) 3A's closure pins** — `phase5-binder-object-membership` section I, `[31]`–`[35]`.
*Old claim:* not exposed, nothing in `client/` names them, no thunk, client sends 23. *Why
superseded:* the rule those pins enforced is that an entry names the screen that sends it;
3B-1 is that screen. *Replacement:* both are reachable and the card-level pair still is; `[33]`
asserts **exactly one** file in `client/` names them and it is the bindings; `[35]` asserts
25 = 25 **and** that every binding is imported by something. *Verified:* bites 1, 2, 3, 4.

**(d) The card-level panel heading** as proof the panel opened — four tests in `phase5-c34b`
and `phase5-c34a`. Re-pointed at the question the panel still asks, plus `Unfiled`.

**(e) The exact plan sequences and the preselect expectations** —
`phase5-c33` (×4), `phase5-four-state` `[26]`/`[27]`, `phase5-c34b` (×3). Each re-pinned with
the interleaving reason written out; `[26]`'s claim became *structural* rather than aesthetic
and `[27b]` was added for the Unfiled case.

**(f) "Filing the card makes the Goal leave the unfiled list"** — `phase5-c34b`. Re-pinned to
assert the opposite as the correction: the card-level row deliberately does **not** settle it.

## 27. Still-valid guards, unweakened

`phase5-b81`'s exact client/exposed equality (untouched, 25 = 25) · no Collector presentation
surface names a command (`phase5-c33:1083-1095`, `phase5-c34b:633-636`,
`phase5-c34a:534-544` — all **tightened by themselves** when the list grew to 25, and they
are what forced the step-kind design) · membership is not a field on a Goal or a copy
(`phase5-binders-cross-views:426-436`) · a legacy row invents no membership
(`phase5-collector-identity-stabilization` `[19]`) · the legacy row's exact shape
(`phase5-four-state` `[25c]`) · All Cards lists one card once and the binder grouping does
not leak into the other four views · one catalogue describe per screen · Unfiled emits no
filing · a replay sends nothing · privacy, one-home, move-in-place, no inference · a thing is
created before it is filed · no binder-name dedupe · no owner or card in a binding
(`phase5-b7:313-334,694`) · `CARD_NAMING_COMMANDS` still exactly four · `addBinderEntry` and
`removeBinderEntry` still exposed and still bound (six guards).

## 28. Bite results — 18 mutations, 18 bite

| # | Mutation | Fails |
|---|---|---|
| 1 | remove `fileObject` exposure | `[31]`, `[35]`, **b81** |
| 2 | remove `unfileObject` exposure | `[31]`, `[35]`, **b81** |
| 3 | remove a client thunk | `[33]`, `[35]`, **b81** |
| 4 | a door with no binding | `[31]`, `[35]`, **b81** |
| 5 | panel emits legacy `file` for a bare card | `[23]` +2, c33 ×2 |
| 6 | render a memberships-only binder empty | `[37]` +2, c34b |
| 7 | join every sibling copy by card inside a binder | `[37]`, c34b |
| 8 | collapse the Goal into the card heading | `[37]`, `[38]` |
| 9 | target identical copies by array position | `[40]` |
| 10 | infer a Goal's home from a legacy row | c34b |
| 11 | offer an archived binder as a new destination | `[24c]` |
| 12 | a state change clears the membership | `[10]`, four-state |
| 13 | leak binder data to a partner | `[14]` +2, c34b |
| 14 | create a `binder_entries` row through the panel | `[34]`, c33 ×3 |
| 15 | retry duplicates the new binder (index handles) | `[24]` |
| 16 | retry duplicates the new Goal | `[24b]` |
| 17 | a sibling refusal costs an earlier object its filing | c33 ×3, id-stabilization ×3 |
| 18 | array-index handle for a new binder | `[23]`, `[24]` |

Bites 11 and 16 did **not** bite on the first pass, and chasing 16 found a real defect (§12,
`madeBinders`). Both now fail a named assertion.

## 29. Full verification

```
node tests/all.cjs   144 suites, 4,932 assertions, 0 failed — ALL SUITES PASSED
npm run build        OK
npm run prod         PRODUCTION BUILD OK — bytes: 346749
npm run smoke        PROD SMOKE OK — rendered 83686 chars
npm run build:app    main.js — 328515 bytes        (see §31)
```

## 30. Final counts

| | Expected | Actual |
|---|---|---|
| Exposed commands | 25 | **25** ✓ |
| Domain commands | 53 | **53** ✓ |
| Migrations | 14 | **14** ✓ |
| Refusal codes | 44 | **44** ✓ |
| Projected sections | 21 | **21** ✓ |
| Durable collections | 18 | **18** ✓ |

No deviation.

## 31. Prod-byte movement — and the number the brief asks for does not measure this batch

```
npm run prod   346,749 → 346,749        zero
```

**That is not a measurement error, and it is a finding worth having.** `prod.build.mjs`
bundles `src/MetYet.jsx` — the **prototype** — and `npm run smoke` smokes that bundle.
`build-all.mjs` bundles the prototype, the demo collector and the demo shell. **None of them
contains the production client.** Read out of the built artifact: `dist/MetYet.prod.js` and
`dist/Collector.cjs` contain none of this batch's strings, and neither contained 3A's.

The production client is bundled by `npm run build:app` (`app.build.mjs`, entry
`client/production-app.jsx`), and **that** number moved:

```
app/main.js   319,873 → 328,515        +8,642 bytes  (+2.70%)
```

Verified to contain the batch: `Unfiled`, `file-object`, `fileObjectInBinder`,
`"The one you added "`, `Need a new binder?`, `put away`, `Earlier filing`,
`That binder has been put away`, `cannot file that yet` — and **not**
`Which binders does this card belong in`.

So the prod/smoke pair is a real gate on the prototype and says nothing about Collector-client
changes. 3A's hand-back reported +1,999 bytes on that bundle and attributed it to 3A's
domain work, which was right — the domain *is* in the prototype bundle. 3A's zero-byte line in
the closure hand-back was also right, for the reason given there. This batch is the first
whose code is entirely outside those bundles, which is why it is worth writing down rather
than reporting a zero.

## 32. `git status --porcelain`

```
?? "Claude outputs/MetYet_Batch_3B1_Hand_Back_A_Specific_Thing_Has_A_Home.md"
```

## 33. 3C not started

Confirmed. `addBinderEntry` and `removeBinderEntry` are both still exposed and still bound;
`[31]` asserts it. None of the seven guards that hold the legacy door was touched. No
conversion, no resolution UI, no backfill, no `binder_entries` change, no migration. The
`file` case remains in `SignIn.jsx` for a stale browser tab, and `unfile` remains because the
legacy line's Remove presses it.

## 34. Unexpected findings and scope pressure

**The `madeBinders` finding** (§12) was not in the plan. Bite 16 refused to bite; chasing it
showed that a home naming a just-minted binder was dropped as a destination the panel could
not yet see, so a retry against a stale projection silently did nothing. Fixed and pinned.

**The prod-byte finding** (§31) — the metric the brief asks for does not cover this batch's
code, and the real one does.

**One scope decision I made and want on the record.** Inside a binder, a copy's subrow title
is now the copy label rather than `gradeLine || "Not stated"`. That is a presentation change
beyond the literal brief, and the reason is that "Not stated" on a row with a Move control is
unusable: the person cannot tell which copy they are about to move. Outside a binder the title
is unchanged.

**One thing I did not do.** The audit flagged two stale 3A comments in `phase5-c71` and
`phase5-c8` that claimed the pair was exposed while asserting 23. 3B-1 makes the count 25,
which would have let them become correct by accident. Both were rewritten to state the real
history — 3A wrote them, 3A's closure unexposed the pair and left the prose, 3B-1 re-exposed
it for the right reason — rather than left to be accidentally true.

**No blocker, no deviation, nothing forced.** No migration, no domain command, no refusal
code, no projection change, no Goal or copy field, no private copy label, no Shortlist, no
Binder delete, no multi-home, no Goals-section revival, no search redesign, no visual polish,
no broad cleanup, no merge.

---

## Push

Refused, as for every batch in this window: the cloud proxy returns 403 —
`Davi17000/metyet-app is not in this session's authorized repository set`. Not routed around.
The commits are delivered as the usual git bundle with its SHA-256 verified on the Mac.
