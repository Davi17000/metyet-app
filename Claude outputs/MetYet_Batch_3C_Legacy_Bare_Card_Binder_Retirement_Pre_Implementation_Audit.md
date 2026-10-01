# MetYet — Batch 3C Pre-Implementation Audit: Retire the Legacy Bare-Card Binder Door

**Audit only. Nothing implemented, no migration, no table retirement, nothing merged.**
Working tree clean at `ca9bb41`.

---

## 1. Executive conclusion

**Yes — `addBinderEntry` can leave external reachability now, and nothing in any current
Collector workflow breaks.** Every 3B-1 claim checked out against code. The shipping panel
plans no `kind: "file"` (read off the source with comments stripped: fourteen step kinds, not
one of them `file`), `client/commands.js:357` is the only writer in the repository, and
`fileCardInBinder` is reachable from exactly one place — `SignIn.jsx:252`'s `case "file"` —
which nothing in the current client sends.

**The real work of 3C is not deleting a list entry. It is in the tests, and if it is skipped
the batch quietly destroys its own evidence.**

Seven test files build a legacy `binder_entries` row by POSTing `addBinderEntry` over HTTP.
Eight of those sites assert the response and so **fail loudly** when the door shuts, which is
fine — that is what re-pinning is for. The other sites do not check the response at all
(`await file(…)` / `await post(…)` with the result discarded), so the row simply never lands
and the assertion is then true of an empty world.

**I measured this rather than reasoning about it** (§4.6): I closed the door, ran the seven
affected files with the fixtures unconverted, recorded every result, and reverted. **Twenty-one
tests pass with the command unreachable** — they are already vacuous, by measurement, not by
argument. **Six of the twenty-one are binder-privacy tests** (`phase5-c34b-binder.cjs:1478`,
`:1501`, `:1512`, `:1529`, `phase5-c35-close-the-loop.cjs:889`,
`phase5-c5-tp-inventory-correction.cjs:1053`), each proving a partner receives no binder data
by asserting emptiness — trivially true when the fixture created nothing.

**And the measurement found the trap, which I had not predicted.** All seven files do go red,
so a careless reading says the suite protects itself. It does not: every one of them is red
*because of the allow-list pins* — the count and verbatim-list ratchets that 3C-1 re-pins **by
design**. Re-pin those first, as anyone making the suite green would, and the seven files go
green with the twenty-one tests no longer testing anything. The ratchets mask the vacuity
instead of catching it, which means the fixture conversion cannot be left to "whatever the
suite complains about".

The worst single case is `phase5-c34b-binder.cjs:825-828`, inside *"filing it makes it leave,
on the authoritative refresh"*: the fixture files a card at `:825` and then asserts the Goal
still reads **"Not in a binder yet"** — *"a legacy row was read as the Goal's home"*. That is
3B-1's central correction, and because it asserts a **presence** rather than an absence, a
missing fixture row leaves it green while there is nothing left for it to catch. **It is one
of the twenty-one measured vacuous.**

The conversion is smaller than that danger suggests, because the fixtures funnel through
per-file helpers and the domain-direct pattern already exists in three of the seven files —
`phase5-c31-binder-foundation.cjs:123-132` (`run1`), `phase5-c33-card-specification.cjs:133`
and `phase5-c32-goal-criteria-grading.cjs` (`direct`), all of which go through
`executeCommand(ctx.repository, …)`, the same transaction, advisory lock and `validateWorld`
the route uses. In `phase5-c34b-binder.cjs` the whole conversion is **one line** — the `file`
helper at `:129-130` — and its twenty-five call sites do not change at all. §4.5 costs it out
file by file. That work, not the list edit, is the body of 3C-1.

**`removeBinderEntry` must stay exposed and stay bound.** It is the only path to removing a
legacy row anywhere in the product, reached through one gesture:
`CardSpecification.jsx:1179-1195` → `dropLegacy` (`:866-878`) → `kind: "unfile"` →
`SignIn.jsx:253` → `unfileCardFromBinder` → `removeBinderEntry`. There is no symmetry
argument here and none should be made.

**The stale-tab story is acceptable, and milder than feared.** A pre-3B tab that ticks a
binder and presses Save gets `409 command-unavailable`, which `explain` renders as *"the card
could not be filed — MetYet would not accept it."* The answers stay on screen, the panel does
not close, and nothing is silently lost. What the person cannot do is succeed: the retry
re-sends the same step forever, and the product does not tell them a reload would fix it. One
deploy swaps the server and the client together — Render's build runs `npm run build:app` in
the same service and `server/index.js:47-48` reads `app/` once at boot — so there is no
deploy-ordering choice to make and no version-skew window beyond an already-open tab.

**Three things stay, deliberately:** the internal `addBinderEntry` domain command (dormant,
unreachable, needed by twenty-eight test fixture sites and by nothing else), `CARD_NAMING_COMMANDS`
(its branch simply becomes unreachable), and every legacy read that keeps a row visible and
removable. No migration, no table change.

**One genuine decision is yours** (§25): whether one release of overlap was enough. The
repository cannot tell me how long a browser tab lives in practice or whether the pilot has
active users. My recommendation is to close now, because the failure is reported rather than
silent and a reload clears it — but the condition that would change that answer is named.

---

## 2. Verified branch, start SHA and worktree

```
branch            phase-5-four-state
HEAD              ca9bb41  Docs: Batch 3B-1 hand-back — a specific thing has a home
git status        clean
```

All three SHAs in the brief verified present and in order: `88712d0` (3B audit), `f7f820d`
(3B-1 implementation), `ca9bb41` (3B-1 hand-back).

## 3. Baseline counts

| | Value |
|---|---|
| Exposed commands | **25** |
| Client-sendable commands | **25** |
| Exact client/exposed equality | **true** |
| Domain commands | **53** |
| Migrations | **14** (newest `0014_binder_memberships.sql`) |
| Refusal codes | **44** |
| Projected sections | **21** |
| Durable collections | **18** |

### Every 3B-1 claim, verified against code

| Claim | Verdict | Evidence |
|---|---|---|
| CardSpecification emits no new card-level `file` | **true** | source with comments stripped plans: `make-binder, correct-copy, offering, keeping, record-copy, file-object ×3, start-looking, unfile-object, wanted-copy, how-hard, stop-looking, forget-copy` — and `unfile` twice, both from `dropLegacy` |
| `unfile` remains for historical removal | **true** | `CardSpecification.jsx:873-874` |
| `client/commands.js` is the only writer | **true** | `:357`, and §16 proves no other writer anywhere |
| shipping UI creates zero new rows | **true** | no path reaches `fileCardInBinder` |
| `addBinderEntry` / `removeBinderEntry` still exposed and bound | **true** | `exposed-commands.js:107,125`; `commands.js:352,360` |
| object commands exposed and bound at 25 = 25 | **true** | measured |
| no migration / domain / refusal / projection change | **true** | counts above, and `git diff ff80c17 -- domain/ persistence/` empty |
| seven guards hold the legacy door | **true, and they are exactly seven** | §8 |
| 3C not started | **true** | both doors open, no guard touched |

---

## 4. Complete dependency census

Scoped to real source (`client/`, `server/`, `domain/`, `persistence/`, build scripts) and
`tests/`. `dist/` and `site/main.js` are build output and gitignored; markdown is prose.

### `addBinderEntry`

| Site | Class |
|---|---|
| `client/commands.js:357` (`execute("addBinderEntry", …)`) | **production write caller** — the only one |
| `server/exposed-commands.js:107` | **exposure plumbing** |
| `server/app.js:90` (`CARD_NAMING_COMMANDS`) | **compatibility path** — a guard list, consulted after `isExposed` |
| `server/app.js:468,473` | documentation/comment |
| `domain/metyet-commands.js:1300-1318` | **server/domain implementation** |
| `domain/metyet-commands.js:1335,1342,1381`, `metyet-domain.js:938`, `domain/README.md` ×4 | documentation/comment |
| 15 test files | **test-only** / fixture — §5 and §4.1 |

### `removeBinderEntry`

| Site | Class |
|---|---|
| `client/commands.js:365` | **production removal caller** — the only one |
| `server/exposed-commands.js:125` | **exposure plumbing** |
| `domain/metyet-commands.js:1320-1330` | **server/domain implementation** |
| `domain/README.md` ×2 | documentation/comment |
| 12 test files | test-only / fixture |

### `fileCardInBinder`

| Site | Class |
|---|---|
| `client/commands.js:352-358` | **exposure/binding plumbing** |
| `client/sign-in/SignIn.jsx:52` (import), `:222` (`binder.file`) | **binding plumbing** |
| `client/sign-in/SignIn.jsx:252` (`case "file"`) | **dead/unreachable from the current client** — nothing sends `kind: "file"` |
| tests | **none** |

### `unfileCardFromBinder`

| Site | Class |
|---|---|
| `client/commands.js:360-366` | binding plumbing — **live** |
| `client/sign-in/SignIn.jsx:52, 223, 253` | binding plumbing — **live**, reached by `dropLegacy` |
| tests | none |

### `kind: "file"` / `kind: "unfile"`

| Site | Class |
|---|---|
| `CardSpecification.jsx:873-874` — `kind: "unfile"` | **production removal caller** (the legacy line's Remove) |
| `SignIn.jsx:252` — `case "file"` | dead/unreachable |
| `SignIn.jsx:253` — `case "unfile"` | live |
| `kind: "file"` anywhere in `client/` | **does not exist** |
| five test-local step dispatchers with `case "file"` | dead branches — nothing in `tests/` produces `kind: "file"` either |

### `binderEntries` / `binder_entries` in production

Fully enumerated in §14. Summary: one projection read, one partner empty, two structural
declarations, one validator loop, one repository mapping, two domain-command bodies, four
client reads — **plus one dead read**, `CardSpecification.jsx:151-153` and `:455`, which
computes `filedNow` that nothing consumes.

### 4.1 Which test sites use which mechanism

Every `addBinderEntry` site in `tests/`, classified by how it reaches the command. **Only the
HTTP sites are affected by closing the door.**

| Mechanism | Sites | Affected? |
|---|---|---|
| **Domain-direct** — `executeCommand` / `run1` / `direct` / the in-memory `x` helper | **28**: `phase3-domain-readiness:199`, `phase5-binder-object-membership:583,647`, `phase5-c31:132`, `phase5-c32:637,790`, `phase5-collector-identity-stabilization:379,742`, `phase5-copy-disposition-explicit-choice:706,751`, and `phase5-four-state-and-binder-invariant` (17 sites) | **no** — and they are why the domain command is retained (§13) |
| **HTTP POST, response asserted** | **8** | **yes — fails loudly** |
| **HTTP POST, response discarded** | **14 source sites**, creating 38 fixture rows | **yes — silently vacuous** |
| List / verbatim pin / comment | the rest | re-pinned per §8 |

### 4.2 The eight that fail loudly

These POST and assert the answer, so they break visibly — which is correct, and is what §8's
re-pinning is for:

`phase5-c31-binder-foundation.cjs:664` (not-owner) and `:671` (card-unavailable) — R3's
behavioural halves · `phase5-c33-card-specification.cjs:810`, `:815`, `:822`, `:826` (the
owner-only and catalog-guard test at `:805`) and `:1643` · `phase5-c4-catalog-import.cjs:1200`.

### 4.3 Measured: twenty-one tests already pass without the command

These discard the response, so the fixture row silently fails to exist. Measured with the door
closed and the fixtures unconverted (§4.5 gives the method):

| File | Fixture sites | Predicted at risk | **Measured vacuous** | Fails loudly on its own |
|---|---|---|---|---|
| `phase5-c34b-binder.cjs` | the `file` helper at **`:129-130`**, 25 call sites | 18 | **14** | 4 — `:421`, `:471`, `:621`, `:725` |
| `phase5-c33-card-specification.cjs` | `:836`, `:950`, `:1298`, `:1663`, `:1675`, `:1701`, `:1746`, `:1747`, `:1776` | 8 | **3** | 5 — `:938`, `:1658`, `:1670`, `:1686`, `:1738` |
| `phase5-c35-close-the-loop.cjs` | `:357`, `:894` | 2 | **2** | 0 |
| `phase5-c4-catalog-import.cjs` | `:377` | 1 | **1** | 0 |
| `phase5-c5-tp-inventory-correction.cjs` | `:1058` | 1 | **1** | 0 |
| | | 30 | **21** | 9 |

**The twenty-one, by name:**

`c34b:364` *each binder shows its name and how many cards are in it* · `:489` *archiving
touches the archive state and nothing else* · `:516` *renaming touches the name and nothing
else* · `:534` *there is no delete, here or in the domain* · `:571` *Primary and Secondary when
there is a Goal, and no tag when there is not* · `:767` *one describe for the ids on screen* ·
**`:814`** *filing it makes it leave, on the authoritative refresh* · `:1439` *putting one away
leaves its entries, Goals and copies alone* · `:1478` *a distinctively named binder is nowhere
in a partner's view* · `:1501` *another Collector receives nothing of it either* · `:1512`
*membership is not demand* · `:1529` *no new partner-facing field appeared anywhere* · `:1553`
*opening Binder writes nothing at all* · `:1623` *a Goal remains a durable independent fact* ·
`c33:832` *unfiling removes organisation and nothing else* · `:1291` *what only answers for
itself goes first* · `:1769` *filing a card creates no discovery, no activity and no interest* ·
`c35:353` *a card in a binder, wanted by nobody, is not an answer* · `:889` *a binder is still
the Collector's alone* · `c4:365` *what people already said survives a rerun, whole* ·
`c5:1053` *binder privacy, unchanged*.

**Six are privacy tests** — `c34b:1478`, `:1501`, `:1512`, `:1529`, `c35:889`, `c5:1053`. Each
proves its point by asserting emptiness, so each passes trivially when the fixture creates
nothing. (`c33:1738`, the seventh privacy test, does check its fixture and **fails loudly** —
which is the right shape and worth copying.)

**`c34b:814` is the one that matters most**, and it is worse than the privacy tests because it
asserts a *presence*. The test is *"filing it makes it leave, on the authoritative refresh"*;
its fixture files a card at `:825`, and it then asserts the Goal **still** reads "Not in a
binder yet", with the message *"a legacy row was read as the Goal's home"* (`:827-828`). That
is 3B-1's central correction. Measured: it passes with the command unreachable. So the test
goes green with nothing left to catch, and the batch that shipped the correction loses the
guard that protects it.

### 4.4 Why the suite will not catch this for you

Every one of the seven files does fail with the door shut — 25 failing tests in total — which
makes it tempting to conclude the suite defends itself. **It does not, and this is the finding
I would most want carried into 3C-1.**

The failures are dominated by the allow-list ratchets, which 3C-1 re-pins *on purpose*:

| File | What actually turns it red |
|---|---|
| `phase5-c35`, `phase5-c32` | **only** the allow-list pin |
| `phase5-c4`, `phase5-c5`, `phase5-c31` | the allow-list pins plus one behavioural test each |
| `phase5-c33` | the allow-list pin, the `:805` owner/catalog test, and 5 real legacy tests |
| `phase5-c34b` | the allow-list pins plus 4–8 real legacy tests |

Re-pin the counts and verbatim lists first — the natural instinct, since that is the visible,
expected breakage — and `phase5-c35`, `phase5-c32`, `phase5-c4` and `phase5-c5` go **fully
green** with four of their legacy tests proving nothing, and the twenty-one vacuous tests
across all seven disappear into a green suite. The ratchets mask the vacuity rather than
catching it.

**Therefore: convert the fixtures BEFORE re-pinning the ratchets**, and verify at the
**test** level, never the file level — file exit codes are dominated by the pins and will tell
you everything is fine.

### 4.5 What the conversion actually costs

Less than that danger suggests, because the fixtures funnel through helpers and three of the
seven files already have the domain-direct path in them:

| File | Work |
|---|---|
| `phase5-c34b-binder.cjs` | **one line** — point the `file` helper at `executeCommand`. All 25 call sites unchanged. Needs the import. |
| `phase5-c33-card-specification.cjs` | `direct()` already exists at `:133` (import at `:43`) — swap 9 fixture sites; move the 5 asserted sites to domain assertions |
| `phase5-c31-binder-foundation.cjs` | `run1` already exists at `:123` — move `:664` / `:671` to the domain |
| `phase5-c32-goal-criteria-grading.cjs` | **nothing** — already domain-direct |
| `phase5-c35`, `phase5-c4`, `phase5-c5` | no `executeCommand` import — add one import and a two-line helper each, then 4 fixture sites |

Seven files, about twenty fixture call sites, one of which is a single line covering
twenty-five. That is why §22 puts the conversion **inside** 3C-1 and **first**: it is cheap,
and skipping it is the one way this batch can destroy its own evidence.

### 4.6 How §4.3 and §4.4 were measured

Not reasoned — run. The procedure, which 3C-1 should repeat as its own check:

1. Remove the single `"addBinderEntry"` line from `server/exposed-commands.js`; leave every
   fixture, every ratchet and every count pin exactly as it is.
2. `npm run build`, then run the seven affected files individually, recording each test's
   pass/fail by name — **not** the file's exit code, for the reason in §4.4.
3. Restore the line, rebuild, and assert the file is byte-identical to the original.

Baseline first: all seven green at `ca9bb41`. With the door shut: 25 tests fail across the
seven, and of the thirty tests predicted at risk, **twenty-one still pass**. Those twenty-one
are the conversion's work list, and after conversion that set must be **empty** — a test that
passes while the command is unreachable is, by definition, not testing a legacy row.

The measurement was reverted in full; the tree is clean at `ca9bb41` and
`server/exposed-commands.js` is unchanged. **No door was closed by this audit.**

## 5. `addBinderEntry` production reachability

```
(nothing)
   ↓
client/commands.js:352  fileCardInBinder
   ↑ imported by SignIn.jsx:52, wired at :222 as binder.file
   ↑ called only from SignIn.jsx:252  case "file"
   ↑ reached only by a step with kind: "file"
   ↑ produced by: NOTHING in client/
```

The chain is intact and its head is empty. `fileCardInBinder` is not a dead export the way
3A's two thunks were — it *is* imported and wired — but the branch that calls it is
unreachable, because no component plans the step that selects it.

**What breaks if external reachability closes: nothing in production.** What breaks is the
test surface in §4.2 and §4.3.

## 6. `removeBinderEntry` production reachability

```
Collector sees "Filed before" in the Card Specification panel
   CardSpecification.jsx:1179-1195   (rendered only when legacyHere.length)
     ← legacyHere from :857-858, the one legitimate card-level read in the panel
   presses Remove
   CardSpecification.jsx:866-878  dropLegacy(binderId)
     → onCommit({ kind: "unfile", binderId }, canonicalCardId)
   SignIn.jsx:253  case "unfile" → binder.unfile(step.binderId, canonicalCardId)
   client/commands.js:360  unfileCardFromBinder
     → execute("removeBinderEntry", { binderId, canonicalCardId })
   server/app.js:435  isExposed → :491 executeCommand
   domain/metyet-commands.js:1320  removeBinderEntry
```

**It must remain.** This is the only way a legacy row can ever leave, and the brief's own
doctrine requires rows to stay removable. It is a *separate gesture* from the Save — `commit`
never carries it — so it is not part of the plan's difference and cannot be confused with an
object's home.

Verified: owner-only (`:1321-1322`, seat + `binder.collectorId`), works for an archived
binder (no archive gate), and touches no Goal, no copy and no membership (`:1327` filters
`binderEntries` alone). Section E of `phase5-binder-object-membership` already asserts the two
tables never read each other.

**Recommendation: `removeBinderEntry` stays externally exposed after 3C, indefinitely.** Do
not reason from symmetry — "stop creating" and "stop removing" are different decisions and
only the first is settled.

## 7. Proof the current UI does not need the add door

Each of the brief's checks, with evidence:

| Check | Result |
|---|---|
| no shipping interaction plans a bare-card `file` | **proved** — the panel's fourteen step kinds contain none; `grep 'kind: "file"' client/` is empty |
| no shipping client path invokes `fileCardInBinder` | **proved** — one call site, in a `case` nothing selects |
| no non-Collector / import path creates current data with it | **proved** — §16 |
| no CSV / seed / bootstrap / demo path relies on it | **proved** — §16 |
| Binder → Add cards → Browse no longer needs it | **proved** — §12 |
| no 3B retry path needs it | **proved** — the retry recomputes the plan, which cannot contain `file` |
| `fileObject` fully owns new object filing | **proved** — three `file-object` emission sites plus `homeStep`, covering new Goal, new copy, and both existing |
| closing external add does not require deleting the domain command or the table | **proved** — §13, §17 |

**No blocker.** No check is false.

---

## 8. The exact seven ratchet guards

| | File / assertion | Current doctrine | Reverse in 3C? | Replacement invariant | Mutation that must bite |
|---|---|---|---|---|---|
| **R1** | `phase5-binder-object-membership.cjs:1385-1387` — `for (const name of ["addBinderEntry","removeBinderEntry"]) assert(EXPOSED_COMMANDS.includes(name))` | both card-level doors are open | **Yes, half of it** | `removeBinderEntry` is reachable; `addBinderEntry` is **not**, and the only path to a legacy row leaving is the panel's Remove | re-add `addBinderEntry` to the list |
| **R2** | `phase5-c2-collector-copy.cjs:1212,1218-1220` — `OPENED_BY_C33` incl. `addBinderEntry`, each must still be exposed | every door C3.3/C3.4 opened still has a surface | **Yes** | C3.3's doors are open **except** the one whose surface the product removed; a door may close only when its last caller is gone, and the list names which and why | re-add it |
| **R3** | `phase5-c31-binder-foundation.cjs:653-655` plus the behavioural halves at `:664-666` (`not-owner`) and `:671-673` (`card-unavailable`) | C3.3's three doors are open, and the add door's ownership and catalog guards are reachable over HTTP | **Yes** | the two guards are asserted **in the domain** rather than over HTTP, because the command is no longer externally reachable — and `command-unavailable` is now the HTTP answer | re-add it; and separately, remove the owner check from the domain command |
| **R4** | `phase5-c34b-binder.cjs:1328-1329` — `eq(json(closedSince), json([]), "a door open at C3.3 has since been closed")`, measured live against git `8c61ec8` | **a one-way ratchet**: no door C3.3/C3.4b opened may ever close | **Yes — this is the doctrinal one** | a door may close when the product has removed its caller, and the batch that closes it says so by name. `closedSince` becomes `["addBinderEntry"]` **exactly**, asserted as a literal, so any *other* closure still fails | close a second door (e.g. `createBinder`) |
| **R5** | `phase5-c5-tp-inventory-correction.cjs:226,239` — `eq(json(lost), json([]), "a door somebody else opened was closed")`, measured live against git `dc2fd25` | same ratchet, from C5's baseline | **Yes** | same replacement: `lost` is exactly `["addBinderEntry"]` | close a second door |
| **R6** | `phase5-c31-binder-foundation.cjs:745-752` — `client/commands.js` must bind all five binder commands | the client binds every binder command | **Yes, half** | the client binds the four with a caller and **not** the one without — and the assertion must read `execute("name"` rather than a bare substring | remove `unfileCardFromBinder`; **and** leave a comment containing the text `addBinderEntry` (see below) |
| **R7** | `phase5-c33-card-specification.cjs:1172-1180` (`ORDER` includes `"file"`) **and** `phase5-binder-object-membership.cjs:1454-1456` | the entrance maps `case "file"` | **Yes** | the entrance maps every kind the product produces and **no kind it does not**; `file` leaves `ORDER` with `unfile` staying, because the panel really does produce it | re-add `case "file"` with no producer |

**R6 is weaker than it looks and should be strengthened while it is being re-pinned.** It is a
bare whole-file `client.includes(name)`, so deleting `fileCardInBinder` while leaving any
comment containing the literal text `addBinderEntry` would let it pass with the binding gone.
`phase5-c34b-binder.cjs:1465-1468` already shows the right shape (`execute\("${name}"`), but
only for two commands. 3C should move R6 to that shape for all of them — which is a
strengthening, not a loosening, and it is what makes the mutation in the last column bite.

**R3's behavioural halves are the only ones that need real work.** Its two HTTP assertions —
that the add door refuses a non-owner and that the catalog guard answers `card-unavailable` —
become `command-unavailable` once the door shuts. Those two rules are still true of the
domain command and are worth keeping; they move from `post(app, …)` to
`executeCommand(ctx.repository, …)`, which is the same conversion §4.3 needs anyway.

---

## 9. Replacement invariant, stated once

The brief's candidate doctrine is right, and I would add one clause:

> **`addBinderEntry` is not externally reachable by any client, because the product has no
> caller for it. `removeBinderEntry` remains reachable, solely so a Collector can remove a
> row filed before Binders organised specific things. The domain command, the table and every
> read that makes a legacy row visible all stay.**

The clause worth adding is *because the product has no caller for it* — that is what turns a
one-way ratchet into a rule rather than an exception. A door closes when its last caller is
gone, the batch that closes it names the door, and `closedSince` / `lost` go from "must be
empty" to "must be exactly this one". Any other closure still fails, which is the whole value
of the ratchet and is preserved.

---

## 10. Exact client/exposed change

**Remove:**

- `server/exposed-commands.js:107` — `"addBinderEntry"`
- `client/commands.js:352-358` — `fileCardInBinder`
- `client/sign-in/SignIn.jsx:52` — the import
- `client/sign-in/SignIn.jsx:222` — the `file:` key in the `binder` bundle
- `client/sign-in/SignIn.jsx:252` — `case "file"`

**Keep, untouched:**

- `server/exposed-commands.js:125` — `"removeBinderEntry"`
- `client/commands.js:360-366` — `unfileCardFromBinder`
- `client/sign-in/SignIn.jsx:223, 253` — the `unfile:` key and its case
- `server/app.js:86-91` — `CARD_NAMING_COMMANDS` including `addBinderEntry` (§13)
- `domain/metyet-commands.js:1300-1318` — the command itself

**Equality after:** 24 exposed = 24 client-sendable, measured the same way by the same
unmodified assertion. `phase5-b81-plumbing-corrections.cjs:195` is not edited; it simply holds
at a new number, which is exactly what it did at 23 and at 25. **No exception list, no subset
check, no weakening.**

The five removals must land in **one commit**, because the equality guard fails in either
direction if they do not.

---

## 11. Stale-client and deployment analysis

### What the repository establishes

**Server and client are one artifact, one deploy.** `render.yaml`'s build is
`npm ci --omit=dev && npm run build:app`, in the **same service** as the API; the blueprint
says why in its own words — *"this one service serves both the API and the production client,
and server/index.js reads `app/` once at boot."* `server/index.js:47-48` confirms it:
`loadClient()` reads `app/index.html` and `app/main.js` into memory at startup.

**Consequence: there is no deploy-ordering choice.** "Client first" and "server first" are not
options the architecture offers — one deploy replaces both, atomically from a browser's point
of view. Migration runs pre-deploy, before the new version serves traffic.

**No cache headers, no content hash, no service worker.** `/main.js` is served by
`server/app.js:852` with `Content-Type` and nothing else — no `Cache-Control`, no `ETag`, no
`immutable`, no hashed filename. There is no service-worker registration anywhere in
`client/` or `app.build.mjs`. So a reload fetches `/main.js` from the running instance, which
is the new one, and no intermediary is instructed to hold the old one indefinitely.

**An already-open tab can live arbitrarily long.** Nothing expires it, polls a version, or
prompts a reload. That is the entire remaining exposure.

### Exactly what a stale pre-3B tab does

1. The person ticks a binder in the old card-level section and presses Save.
2. The plan contains `{ kind: "file", binderId }`.
3. `POST /api/commands` → `server/app.js:435` `isExposed("addBinderEntry")` is false →
   **409** with `{ refused: "command-unavailable" }`, before the catalog guard and before the
   world lock.
4. `commit` reads `answer.ok === false`, stops, calls `adopt`, and sets the message.
5. `explain({kind:"file"}, "command-unavailable", finished)` — and the pre-3B `WHY` has **no
   entry** for that code (verified against `ff80c17`), so it falls to the default:

> **"Nothing was saved: the card could not be filed — MetYet would not accept it."**

or, when earlier steps landed:

> **"The goal was saved. But the card could not be filed — MetYet would not accept it. Your
> answers are still here, and pressing Save again sends only what is left."**

### Is the intent silently lost?

**No.** It is reported in a `role="alert"`, the answers stay on screen, the panel does not
close, and anything else in the Save that succeeded is named. This is the partial-commit
machinery working as designed.

**But the person cannot recover inside the tab.** The retry re-sends the same step and gets
the same refusal, forever. The message does not say the build is stale and does not suggest a
reload — and a reload is the whole fix. 3B-1 added that sentence
(*"This version of MetYet cannot file that yet. Reload the page and try again."*) to the
**current** client, which is the one that will never need it; the stale client is the one that
does, and it cannot be given it, because it is already in the browser.

That asymmetry is unavoidable and worth stating plainly: **the sentence that would help can
only ever be in a build that does not need it.** It is still worth having — it covers the
reverse skew, a new client against an older server — but it does not solve this direction.

### What the repository cannot tell me

- How long tabs stay open in practice.
- Whether the pilot has active users at all right now, and how many.
- Whether any user had a tab open across the 3B-1 deploy.
- Whether 3B-1 has even been deployed yet — `render.yaml` deploys `main`, and this work is on
  `phase-5-four-state` with nineteen unpushed commits, so **as of this audit 3B-1 is not in
  production**.

That last point reframes the question, and §25 states it as the decision.

### Is one release enough?

**Architecturally, yes, with one qualification.** The failure is reported, bounded to one
gesture, leaves every other fact the Save carried intact, and clears on reload. Nothing is
corrupted and nothing is silently dropped. A time-based compatibility window buys only a
better *message* for a small number of tabs, and it cannot buy the best message, for the
reason above.

The qualification is §25's: 3B-1 must actually be in production, and have been for long
enough that any tab predating it has been reloaded, before closing the door means anything.
Closing the door in the same release as 3B-1 would mean the *3B-1* client is the stale one for
nobody and the *pre-3B* client is stale for everybody who had a tab open — which is the only
genuinely bad ordering available.

---

## 12. Rollback analysis

| Situation | Behaviour | Verdict |
|---|---|---|
| **new server + current 3B client** | the client never sends `addBinderEntry`; everything works; the legacy line's Remove still works | **safe** |
| **new server + stale pre-3B client** | §11 — one reported refusal per ticked binder, recoverable by reload | **acceptable** |
| **server rollback after 3C** | the door reopens and the pre-3C client (which does not send it) is unaffected; a pre-3B tab starts working again. No data to repair: nothing was created or destroyed by the closure | **fully reversible** |
| **client rollback after 3C** | not independently possible — one artifact. Rolling back the deploy rolls back both, which is the row above | **n/a by architecture** |

**Recommended sequence: one deploy, server and client together — which is the only sequence
the architecture offers.** The prerequisite is temporal, not ordinal: *3B-1 in production
first, as its own release.* No migration, so nothing to run before or after.

Nothing in 3C reopens bare-card product behaviour on any path: a rollback restores a door with
no caller, not a gesture.

---

## 13. Internal domain command: retain

**Recommendation: close external reachability only. Keep `domain/metyet-commands.js:1300-1318`
exactly as it is.**

Evidence for retaining:

- **Twenty-eight test fixture sites depend on it**, through the domain-direct path
  (`phase5-c31-binder-foundation.cjs:123-132`'s `run1`, `phase5-c32`/`phase5-c33`'s `direct`),
  plus the in-memory `x` helpers in `phase3-domain-readiness`,
  `phase5-four-state-and-binder-invariant` (17 sites alone),
  `phase5-binder-object-membership`, `phase5-collector-identity-stabilization` and
  `phase5-copy-disposition-explicit-choice`. **Legacy rows cannot be tested without a way to
  make one**, and the honest way is the command that made the real ones. After 3C-1's
  conversion this number grows rather than shrinks.
- Removing it would drop the domain count 53 → 52, which is a change to the foundation 3C has
  no reason to make.
- `phase3-domain-readiness`'s golden transcript exercises every command; removing one means
  re-pinning the transcript for no product gain.
- Rollback stays trivially safe with it present.

Evidence for removing: none found. There is no concrete value.

**The guard that proves it cannot become externally reachable by accident** already exists in
the right shape and needs one addition. `phase5-b81-plumbing-corrections.cjs:195`'s exact
equality means `addBinderEntry` cannot re-enter `EXPOSED_COMMANDS` without someone also
re-adding a client binding that names it — two edits, both visible. 3C should add the
complement: an assertion that the command is **in** `COMMAND_NAMES` and **not in**
`EXPOSED_COMMANDS`, stated together, so a reader sees the deliberate pairing rather than
inferring it from two files. §21 bite 1 and bite 8 cover it.

**`CARD_NAMING_COMMANDS` stays too.** `server/app.js:454`'s branch sits *after* `isExposed` at
`:435`, so for an unexposed name it is simply unreachable — no behaviour changes, nothing to
correct. It is pinned by exactly one test, `phase5-c31-binder-foundation.cjs:754-763`, which
reads `CARD_NAMING_COMMANDS` only and **keeps passing**. Only its title goes stale
(*"ready for the batch that opens the door"* — the door is closing), which is a comment
correction. Dropping the name from that list would fail two assertions for no gain.

---

## 14. Legacy read-model census

### Must survive — the minimum set

| Site | Role |
|---|---|
| `domain/metyet-projection.js:434` | **historical display** — the one read that puts legacy rows on their owner's screen. Everything below depends on it. |
| `domain/metyet-projection.js:555` | **privacy** — the partner's explicit `[]`, pinned by `c33:1746`, `c35:894`, `c5:1058`, `c34b:1478/:1529` |
| `domain/metyet-projection.js:299` | structural — `binderEntries` in `COLLECTIONS`, the basis of "an unclassified section cannot appear unnoticed" |
| `domain/metyet-world.js:67`, `:394-…` | structural + **validation** — legacy rows must keep validating on every save |
| `domain/metyet-store.js:52` | the in-memory store the prototype and the domain suites run on |
| `persistence/world-repository.js:110` | **removal targeting** — the load *and* save mapping; without it a removal could not persist |
| `domain/metyet-commands.js:1324, 1327` | **removal targeting** — inside `removeBinderEntry` |
| `domain/metyet-commands.js:1310, 1313` | the idempotence read and append inside `addBinderEntry` — retained with the command, unreachable from production |
| `CardSpecification.jsx:857-858` → `:1179-1195` | **the card panel's legacy line**, and the only path to Remove |
| `Binder.jsx:76` → `:138-146` | **the library count** |
| `Collection.jsx:138` → `:278-280` | **historical display** — an open binder's contents |
| `Collection.jsx:138` → `:465-467`, `:538-544` | **historical display** — the "Earlier filing" row |
| `Collection.jsx:138` → `:313` | **required** — a card whose only trace is a legacy row vanishes from All Cards without it |
| `Collection.jsx:138` → `:339` | ordering by `addedAt`; weak but real |

### Obsolete — and worth deleting in 3C

**`CardSpecification.jsx:151-153` and `:455`.** `entries` exists only to build `filedNow`, and
`filedNow` is consumed by nothing: the only readers of `planFrom`'s result are `plan.goal`
(`:556`) and `plan.steps` (`:712`, `:826`), and no test references it. The file admits it at
`:450-454`.

It is worth deleting in 3C rather than later, for a reason beyond tidiness: **it is the last
place in the panel that reads card-level rows while computing a plan**, which is precisely the
inference the panel's own comments at `:163-166` and `:469-473` say the product must never
make. Removing it is a pure deletion with no behaviour change, and it makes the panel's
"nothing is seeded from a legacy row" claim true of its code and not only of its output.

**Nothing else is uncertain.** Every read resolves to a named category.

---

## 15. Legacy UX after closure

Traced against the 3B-1 code; nothing in 3C changes any of it.

| Case | Behaviour |
|---|---|
| **active binder + legacy row** | one card heading, a subrow reading *"Filed before Binders organised specific cards / Open the card to remove it."* with an `Earlier filing` tag. No Move, no home, no actions. |
| **archived binder + legacy row** | same, plus the binder name reads `— put away`; no "Add cards" route; Remove still reachable from the card panel |
| **card panel + legacy row** | the "Filed before" section: *"This card was filed in **Trade Night** before Binders organised specific cards."* with **Remove** |
| **legacy + Goal** | the Goal shows its own home (or Unfiled); the row shows separately. **No inference** — `phase5-c34b`'s mirror test and `phase5-collector-identity-stabilization` `[19]` both pin it |
| **legacy + several copies** | each copy its own home; the row still says nothing about any of them. Scenario Q, pinned by `[41]` |
| **legacy + membership, same binder** | both visible in one binder under one card heading: the thing with its meaning and actions, the row as history with none |
| **legacy + membership, different binders** | the thing appears in its binder; the row appears in the other. Both true, neither derived from the other |

**The confusing duplicate is real and should not be redesigned in 3C.** A card can legitimately
show an object subrow *and* an "Earlier filing" row in the same binder. The wording already
distinguishes them and the Remove is one press away in the panel. Changing it is a visual
decision, and 3C is a command-retirement batch.

---

## 16. Hidden-writer audit

Searched beyond the obvious. **No shipping writer, and no writer anywhere outside the domain
command and the test fixtures.**

| Path | Finding |
|---|---|
| CSV / inventory import | `server/inventory/import.js:214-224` builds one command kind only — `{ command: "addInventoryCopy", … }` — repeated `row.quantity` times, run by `executeCommands` at `:226`. No binder command. |
| bootstrap | `server/bootstrap.js:41-60` builds `emptyWorld()`, **refuses outright if any collection is non-empty** (`:52-56`), then saves. It can only write zero rows. |
| seed | none exists. `server/cli.js:231` says so: *"all empty — no demo data, no example records."* |
| migrations | `0013_binders.sql:85-107` is DDL only; `0014`'s header states `binder_entries` is deliberately untouched |
| CLI / operator | `server/cli.js:710`'s `OPERATIONS[name]` is the operator's own table; none executes a domain command by a caller-supplied name |
| other `executeCommand` callers | `server/collector-invitation.js:64` (hardcoded `"inviteCollector"`); `server/inventory/import.js:226`. That is all. |
| registration / acceptance | touch no command table — named domain functions plus `repository.saveWorld` directly |
| replay / recovery | none exists; `app.js:781`'s "replay" is prose |
| browser-storage hydration | none — `phase4-collector-read-experiences:772-788` forbids `localStorage` et al. across `client/collector/` |
| dev commands in production | `app.build.mjs` defines `__METYET_DEV__: "false"` and `__METYET_DEMO__: "false"` as literals, so a stray import cannot turn either on |
| direct repository calls | only the two above, neither binder-shaped |

**Conclusion: after the door closes the legacy row set is strictly non-growing.** No route, no
import, no bootstrap, no CLI operation and no migration can create one; `removeBinderEntry` is
the only thing that can shrink it. That is exactly the condition §23 needs.

---

## 17. Security and privacy

| Check | Result |
|---|---|
| historical removal is owner-only | **yes** — `metyet-commands.js:1321-1322`, seat + `binder.collectorId` |
| partner projections reveal no Binder organisation | **yes, unchanged** — `metyet-projection.js:555` and the five privacy suites. 3C changes no projection. |
| a stale client cannot recreate bare-card filing through another command | **yes** — no other exposed command writes `binderEntries` (§16), and `fileObject` requires a Goal or copy id the stale client does not have and cannot mint |
| no generic mutation endpoint bypasses `EXPOSED_COMMANDS` | **yes** — `POST /api/commands` (`app.js:418`) is the only generic route in the repository, and `isExposed` runs at `:435` before the catalog guard and before the world lock. No other file registers a route. |
| no alias can expose the internal command | **yes** — the domain's only dynamic lookup is `metyet-commands.js:2233`'s `COMMANDS[command]`, reachable only through `executeCommand`/`executeCommands`, whose three callers pass hardcoded literals or the guarded route |

**Proof of external unreachability after closure:** one route, one guard, one list. The guard
is a plain `includes` over a frozen array, and the equality assertion means the name cannot
return to that array without a second visible edit in `client/commands.js`.

---

## 18. Build-gate debt

**Recommendation: a separate engineering batch. Do not mix it into 3C.**

The facts: `npm run prod` and `npm run smoke` build and smoke `src/MetYet.jsx` — the
prototype. `npm run verify` is
`build && test && prod && smoke && previews` and **does not include `build:app`**, which is
the production client. The repository already knows: `phase5-c5-tp-inventory-correction.cjs:57`
says in so many words that *"build (`npm run build:app`) is not part of `verify`"*.

**3C can be fully verified without fixing it.** Everything 3C changes is covered by
`node tests/all.cjs` — the exposed list, the client bindings, the step mapping, the legacy
reads and the fixtures are all asserted by suites that run there. `build:app` would add
nothing 3C needs.

So the gate is real debt and not 3C's. It is also not nothing: `tests/phase3-deployment.cjs:528`
and `phase5-tp-profile.cjs:949` assert the *blueprint* runs `build:app`, so a client that
fails to build fails the deploy rather than a test — which is a real backstop, just a late
one. The separate batch should add `build:app` to `verify` and give the production bundle a
smoke of its own; mixing it into a command retirement would put two unrelated reversals in one
hand-back.

---

## 19. Expected counts after 3C-1

| | Before | After | Why |
|---|---|---|---|
| Exposed commands | 25 | **24** | `addBinderEntry` removed; `removeBinderEntry` stays |
| Client bindings (sendable) | 25 | **24** | `fileCardInBinder` removed; `unfileCardFromBinder` stays |
| Client/exposed equality | 25 = 25 | **24 = 24** | unchanged assertion, new number |
| Domain commands | 53 | **53** | the command is retained, dormant |
| Migrations | 14 | **14** | no migration |
| Refusal codes | 44 | **44** | no new code; `command-unavailable` already exists |
| Projected sections | 21 | **21** | `binderEntries` stays projected |
| Durable collections | 18 | **18** | the table stays |
| `CARD_NAMING_COMMANDS` | 4 | **4** | unchanged; its branch becomes unreachable |

**The domain count does not fall.** That is the deliberate decision in §13, not an oversight.

---

## 20. Adversarial matrix

| # | Scenario | Expected | Protecting invariant |
|---|---|---|---|
| 1 | current client creates and files a Goal | works | `[23]`, `[37]`; `phase5-c34b` Save-from-preselect |
| 2 | current client creates and files a Copy | works | `[37]`, `[39]`; `phase5-c33` full-specification |
| 3 | new binder + object + file in one Save | works, one `make-binder` | `phase5-c33` ordering; `[23]` |
| 4 | current client removes a legacy row | works | **needs a new assertion** — §21 bite 6 |
| 5 | archived legacy removal | works (no archive gate on remove) | **needs a new assertion** — §21 bite 6 |
| 6 | current client never sends add | holds | `[34]`; `phase5-c33` step-kind inventory |
| 7 | **stale pre-3B client sends add** | 409 `command-unavailable`; reported, answers kept, reload required | §11; **needs a new assertion** pinning the 409 |
| 8 | stale client sends remove | works | R1's replacement |
| 9 | server rollback | the door reopens; no data to repair | §12 |
| 10 | client rollback | not independent; one artifact | §12 |
| 11 | legacy + Goal, same card | no inference | `phase5-c34b` mirror; `identity-stabilization` `[19]` |
| 12 | legacy + Copy | no inference | `[41]` |
| 13 | legacy + membership, same binder | both visible, distinct | `[38]`, `[41]` |
| 14 | legacy + membership, different binders | each in its own | `[37]` |
| 15 | duplicate binder names | id-keyed | `[42]` |
| 16 | partner projection | no binder data | `[14]`, `[43]`, `phase5-c34b` §G |
| 17 | **direct HTTP retired add attempt** | 409 `command-unavailable`, before the catalog guard and the world lock | **needs a new assertion** |
| 18 | alias / alternate binding attempt | impossible — one route, one guard | §17; equality guard |
| 19 | test or demo direct domain call | works, by design | the 28 domain-direct sites; `[32]`-shaped assertion |
| 20 | **a future developer re-adds the client thunk** | equality fails | `phase5-b81:195`; R6 strengthened to `execute("…"` |

Four rows need assertions that do not exist yet (4, 5, 7/17). They are the new tests in §22.

---

## 21. Proposed bite plan

Every mutation tied to a named assertion. Twelve, matching the brief's list.

| # | Mutation | Must fail |
|---|---|---|
| 1 | re-add `"addBinderEntry"` to `EXPOSED_COMMANDS` | R1′, R4′ (`closedSince` literal), R5′ (`lost` literal), `b81:195`, and the new "in the domain, not at the door" assertion |
| 2 | re-add `fileCardInBinder` to `client/commands.js` | `b81:195`, R6′ |
| 3 | make the shipping panel emit `kind: "file"` | R7′ ("no kind the entrance does not map"), the new no-card-level-filing assertion |
| 4 | call `addBinderEntry` directly from a production path | the new "one route, one guard" assertion; `b81:204-208` |
| 5 | remove `"removeBinderEntry"` from `EXPOSED_COMMANDS` | R1′, `b81:195`, the new legacy-Remove end-to-end test |
| 6 | break the legacy Remove (drop `dropLegacy`, or `case "unfile"`, or `unfileCardFromBinder`) | the new legacy-Remove test (active **and** archived binder) |
| 7 | weaken the equality guard to a subset check | a new assertion that `b81`'s source still contains the two-directional `eq(json([...sent].sort()), json([...EXPOSED_COMMANDS].sort()))` |
| 8 | expose the command under an alias (`"fileCard"` → `COMMANDS.addBinderEntry`) | the new assertion that every exposed name is a key of `COMMANDS` **and** that `COMMANDS` has no alias keys |
| 9 | leak binder data to a partner | `[14]`, `[43]`, `phase5-c34b` §G |
| 10 | infer an object's home from a legacy row | `phase5-c34b`'s mirror test; `identity-stabilization` `[19]`; `[41]` |
| 11 | regress Add Cards / Browse to bare-card filing | `phase5-c34b` Save-from-preselect; `[34]` |
| 12 | delete the dormant domain `addBinderEntry` | the 28 domain-direct sites, and the new "retained and dormant" assertion |

Mutations 1, 5 and 12 are the three that prove the asymmetry is deliberate: closed, open, and
kept-but-unreachable are three different states and each has its own guard.

---

## 22. One smallest recommended implementation batch

### Batch 3C-1 — "The door with no caller closes"

**Prerequisite, and it is not optional:** 3B-1 is in production, as its own release, and has
been long enough that a tab predating it has been reloaded. As of this audit it is not — the
work is on `phase-5-four-state` with nineteen unpushed commits and `render.yaml` deploys
`main`. Closing the add door in the same release as 3B-1 is the one genuinely bad ordering
(§11), so this is a sequencing condition rather than a code one.

**1. Convert the HTTP legacy-row fixtures to the domain-direct path — first, and before the
ratchets are re-pinned.** Seven files, about twenty call sites, costed in §4.5. The work list
is the **twenty-one measured vacuous tests named in §4.3** — six of them privacy tests, one of
them `c34b:814`, the guard on 3B-1's central correction. Use the pattern
`phase5-c31-binder-foundation.cjs:123-132` already establishes; in `phase5-c34b-binder.cjs` it
is one line.

**This is the body of the batch, and the order is load-bearing.** §4.4 measured that all seven
files go red mainly because of the allow-list pins that step 3 re-pins by design. Re-pin
first and four of the seven go fully green with their legacy tests proving nothing. Convert
first, and every later breakage is a real one.

Re-run the §4.6 measurement at the end of the conversion. The set of tests that pass while
`addBinderEntry` is unreachable must be **empty** — that single check is the whole risk this
batch carries, and it must be read per test, never per file.

**2. Close the door and the binding, in one commit.** The five removals in §10. 25 → 24 on
both sides, with `phase5-b81` untouched.

**3. Re-pin the seven ratchets with the replacement invariant** (§8, §9), each carrying the
reason in place. R6 is moved from a bare substring to `execute("…")` — a strengthening. R3's
two behavioural halves move from HTTP to the domain, where the rules they assert still live.

**4. Add the four missing assertions** (§20): the legacy Remove end to end, from an active and
an archived binder; the retired command answering **409 `command-unavailable`** over HTTP
before the catalog guard and the world lock; and the pairing — `addBinderEntry` is in
`COMMAND_NAMES` and not in `EXPOSED_COMMANDS`, stated together, with no alias key in
`COMMANDS`.

**5. Delete the one dead read** — `CardSpecification.jsx:151-153` and `:455` (§14). Pure
deletion, and it makes the panel's own no-inference claim true of its code.

**6. Correct the stale comments** that the change makes false:
`phase5-c31-binder-foundation.cjs:754-763`'s title (*"ready for the batch that opens the
door"*), `server/app.js:468,473`, `domain/README.md:132,345,821`, and the seven verbatim-list
comment blocks that say *"the door stays one release … and goes in 3C."* Deliberately, not by
accident.

**7. Run the bite pass** (§21) and the full suite, build, prod, smoke.

**Explicitly not in 3C-1:** no migration, no table change, no census, no `binderEntries` read
removed beyond the dead one, no change to the internal command, no change to
`CARD_NAMING_COMMANDS`, no `removeBinderEntry` change, no visual redesign of the legacy line,
and no build-gate work (§18).

### Exact stop condition

> **Stop when:**
>
> 1. `addBinderEntry` is not in `EXPOSED_COMMANDS` and `fileCardInBinder` is not in
>    `client/commands.js`, and a direct `POST /api/commands` naming it answers
>    **409 `command-unavailable`** — asserted, before the catalog guard and the world lock;
> 2. `removeBinderEntry` is still exposed and still bound, and a Collector can remove a legacy
>    row from an **active** and from an **archived** binder — both asserted end to end;
> 3. every legacy row is still visible in its binder, in the card panel, and in All Cards, and
>    is never read as any object's home;
> 4. the domain command and `binder_entries` are untouched, and the domain count is still 53;
> 5. exact client/exposed equality holds at **24 = 24** with `phase5-b81` unmodified;
> 6. **no test that builds a legacy row has become vacuous** — every fixture that needs one
>    makes it through the domain, and **the §4.6 measurement returns an empty set** — no test
>    passes while `addBinderEntry` is unreachable, read per test and not per file;
> 7. each of the seven ratchets carries its replacement invariant and the reason for the
>    reversal, in place;
> 8. the full suite, build, prod and smoke are green, and all twelve mutations bite.
>
> **Then stop.** No migration, no table retirement, no merge.

---

## 23. Deferred table-retirement conditions

**Do not drop `binder_entries` in 3C. The repository cannot support the decision yet.**

What it cannot tell me, and said plainly:

- **the production legacy-row count** — there is no telemetry, no census command and no
  reporting path. `server/cli.js`'s `view` renders one actor's projection; nothing counts rows
  across collectors.
- **who owns them** — derivable from `binders.collectorId` by a query, but no code does it.
- **whether all rows have been removed** — unknowable from here.
- **cleanup telemetry** — none. `removeBinderEntry` logs like any command (`app.js:436`-style
  info lines) but nothing aggregates.

A safe census is *buildable* — one read-only `cli.js` operation joining `binder_entries` to
`binders` and grouping by collector would do it, and it needs no new command and no migration.
That is the natural first step of a later batch, not of 3C.

**Evidence required before considering retirement:**

```
external add closed (3C-1)
+ no current writer anywhere          (§16 — already true)
+ removal still reachable             (§6 — must remain true)
+ a census capability exists          (does not exist; buildable)
+ production census reaches zero      (unknowable today)
+ the rollback window has expired     (an ops decision, not a code one)
→ then consider retiring the domain read, the remove command, and the table, in that order
```

The order matters: the read goes last of the three, because a row that cannot be read cannot
be shown to its owner before it is removed.

---

## 24. Explicit non-goals

Not in this audit and not in 3C-1: no implementation, merge, migration, drop, conversion or
inference. No removal of historical visibility or of cleanup. No visual redesign of the legacy
line. No copy labels, membership or state changes. No search redesign, Binder delete, broad
cleanup, or transaction / Opportunity / Pending / Market Value work. No build-infrastructure
fix (§18). No table census built here. No change to the internal domain command,
`CARD_NAMING_COMMANDS`, or `removeBinderEntry`.

---

## 25. The one decision repository evidence cannot settle

**How much production overlap 3B-1 needs before the add door closes.**

The repository establishes the mechanics completely: one artifact, one deploy, no cache
headers, no service worker, a reload gets the new build, and a stale tab's failure is reported
rather than silent and clears on reload. What it cannot establish is the *population*: how
many tabs, open how long, and whether 3B-1 has shipped at all.

**The condition, stated exactly:**

> Close the add door in a release **after** the one that ships 3B-1, not in the same release,
> and not before 3B-1 has been live long enough that any browser tab predating it has been
> reloaded.

That is the whole prerequisite, and it is temporal rather than technical. **My recommendation
is one release of separation and no more** — a time-based compatibility window buys only a
marginally better message for a small number of tabs, and it cannot buy the best one, because
the sentence that would help can only ever live in a build that does not need it.

What would change my answer: if the pilot has a meaningful number of users who keep the app
open for days and reload rarely, the kind thing is to leave the door open for a second release
and spend that release giving the *current* client a version check that prompts a reload —
which is a small, separate, generally useful piece of work and the only thing that actually
fixes this class of problem. The repository has no evidence either way, and nineteen unpushed
commits suggest the pilot has not seen 3B-1 at all yet, which would make this moot.

---

**Audit only. Nothing implemented, no migration, no table retirement, nothing merged. Working
tree clean at `ca9bb41`.**

Push remains refused by the cloud proxy — `Davi17000/metyet-app` is not in this session's
authorized repository set. Not routed around.
