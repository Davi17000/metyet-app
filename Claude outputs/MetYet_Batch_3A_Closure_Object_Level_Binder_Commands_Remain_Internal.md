# MetYet — Batch 3A Closure: Object-Level Binder Commands Remain Internal Until 3B

**Hand-back.** Branch `phase-5-four-state`. `Davi17000/metyet-app`.

One narrow correction. `fileObject` and `unfileObject` stay exactly as Batch 3A
built them — complete, tested domain commands — and come off the server's
externally exposed set until 3B writes the controls that press them. Nothing about
the foundation moved.

---

## 1. Starting SHA

`592db69` — *"Docs: object-level Binder membership foundation — Batch 3A hand-back"*.

SHAs verified rather than taken from the brief, and all three match what it
reported: audit tip `3600445`, 3A implementation `876e485`, delivered bundle tip
`592db69`.

## 2. Closure implementation SHA

`04467e1` — *"Object-level Binder commands stay in the domain, out of the door,
until 3B"*.

## 3. Docs SHA

This file, committed separately, immediately after `04467e1` — a commit cannot name
its own hash, so the SHA is in the bundle's log.

## 4. Exact files changed

**Product code — 2 files.**

| File | What moved |
|---|---|
| `server/exposed-commands.js` | `"fileObject"` and `"unfileObject"` removed; the comment now says why they are absent |
| `client/commands.js` | `fileObjectInBinder` and `unfileObjectFromBinder` removed; the comment now says why there is no binding yet |

**Tests — 18 files.** `tests/phase5-binder-object-membership.cjs` gained section I
(+142 lines, 6 tests). Seventeen suites had the exposed-count or exposed-list pin
moved back from 25 to 23 (§9).

**Nothing else.** `git diff 592db69 -- persistence/ domain/ client/collector/` is
**empty**.

## 5. Exposed-command change

```
25 → 23.   Removed: fileObject, unfileObject.   Nothing else changed.
```

The file's own rule, quoted from itself: *"Each entry is a command a production
surface sends today, with the surface that sends it. If nothing in `client/` sends
it, it does not belong here."* And: *"WHEN A COMMAND JOINS THIS LIST. When the
product grows a surface that sends it."*

No screen sends either command. 3A's hand-back recorded the mismatch as a decision
for you rather than a fix; this is the fix.

Worth naming precisely, because it is the reason this was worth correcting and not
only tidying: a door open ahead of its surface is reachable over HTTP by an
authenticated caller through a path **no screen can produce and no screen test
exercises**. Authorization is still entirely the domain's — both commands refuse
any actor who does not own both the binder and the object, and that is tested —
so nothing was unsafe. But nothing was verified by use either, and the list is the
one place the product states what it offers.

The comment left in the file says it was listed there for one commit and that this
was a mistake. 3A's hand-back is not rewritten; the prior state is recorded in both.

## 6. Client thunks: removed, and why

**Removed.** The dependency graph was inspected before deciding, and it is
unambiguous — nothing imports either thunk:

```
./server/exposed-commands.js:110:  (a comment naming them)
./client/commands.js:378: export function fileObjectInBinder(target) {
./client/commands.js:386: export function unfileObjectFromBinder(target) {
```

Three hits in the whole repository, of which one is prose and two are the
definitions. `client/sign-in/SignIn.jsx` — the only place that wires bindings onto
the Card Specification panel's step kinds — imports `createBinder`,
`fileCardInBinder` and `unfileCardFromBinder`, and nothing else Binder-shaped.

**They were not required by the minted-id logic.** That logic lives entirely in
`CardSpecification.jsx`'s `commit` and `adopt` and is about step kinds and draft
handles; it never names a command. Its only Binder dispatch goes through
`binder.create` / `binder.file` / `binder.unfile`, which are the card-level
bindings. `CardSpecification.jsx` is unchanged by this closure.

**So they existed for exactly one reason: to satisfy `phase5-b81`'s exact-set
guard** while both doors were open. That is the guard being satisfied rather than
honoured, which is the thing it exists to prevent. Removing the doors removed the
reason for them.

A detail that confirms it from a direction nobody chose: the production bundle is
**byte-identical** before and after (§13), because esbuild had already dropped both
thunks as unreachable. They were dead weight the bundler could see and the test
could not.

## 7. Proof the client/exposed invariant is truthful

`phase5-b81`'s guard reads `client/commands.js` for everything it can send and
asserts **set equality in both directions** against `EXPOSED_COMMANDS`:

```js
eq(json([...sent].sort()), json([...EXPOSED_COMMANDS].sort()),
  "the door and the client disagree about what the product offers");
```

It passes, **unmodified**, at 23 = 23. Not weakened to a subset assertion, not
given an exception list, not touched at all — `tests/phase5-b81-plumbing-corrections.cjs`
is not in the changed-files list.

New test `[35]` measures the same equality from the same two sources inside the
membership suite, so the invariant is visible beside the removal that restored it,
and `eq(sent.size, 23)` pins the size on the client side too.

Both directions are bite-verified: re-opening a door without a thunk fails
(bites A, B) and re-adding a thunk without a door fails (bite E), in `phase5-b81`
**and** in section I.

## 8. Proof the domain commands remain intact

- `COMMAND_NAMES.length` is **53**, and both names are in it — test `[32]`, which
  also asserts `typeof COMMANDS[name] === "function"` for each.
- Test `[32]` then **drives them**: files a Goal, reads the home back, unfiles it,
  reads the collection empty. Unexposed is not unbuilt, and that is asserted rather
  than argued.
- Sections A–H are unchanged and all 32 assertions still pass: exactly-one target,
  one home, move in place, three homes for one card, both-owner ownership,
  projection scoping, removal lifecycle, legacy separation, archived binders,
  scenario T and retry U through the real mounted panel, and the PGlite DDL section.
- `git diff 592db69 -- domain/` is **empty**. Gate ordering, idempotency,
  move-in-place semantics, the archive gate's position below the idempotency check,
  the seat-before-lookup ordering in `unfileObject`, the two refusal codes, the
  validator block, the projection scoping and the removal cascades are all exactly
  as 3A left them.
- `git diff 592db69 -- persistence/` is **empty**: migration 0014, its `on delete
  cascade` and deferrable constraints, the minted id and the repository mirrors are
  untouched.
- `git diff 592db69 -- client/collector/` is **empty**: the minted-id
  generalisation, scenario T and retry U are untouched.

## 9. Test re-pins

**17 suites, one kind of change, and it is the exact mirror of 3A's.**

- `EXPOSED_COMMANDS.length` **25 → 23** — 16 suites.
- the verbatim exposed-list pins — 7 suites. The two names and the comment 3A added
  are removed, and the comment left in their place says they were there for one
  commit and why they are not now.
- `phase5-c5`'s exposed-door delta, which measures against `dc2fd25` **out of git**
  rather than against a literal — back to the seven it was. That guard did its job
  twice: it failed when the doors opened and again when they shut, which is the
  whole reason it reads git.

**Added, not re-pinned:** section I of `tests/phase5-binder-object-membership.cjs`,
six tests, which is where the brief's required proofs live.

**Nothing was weakened.** No count became a range, no exact equality became a
subset check, no regex was loosened, no assertion was deleted, and `phase5-b81` was
not edited. Two assertions that 3A had *strengthened* — `phase5-c31`'s
per-binder-section empty loop and `phase5-collector-identity-stabilization`'s
no-inference assertion — are untouched and still hold.

One re-pin needed a second pass and is worth recording. Test `[33]` scans every
file under `client/` for either command name, and it failed on its first run
against **my own new comment** in `client/commands.js`, which explains the two
commands by name. A scan that counts prose cannot tell an explanation from a
dispatch, so it now strips comments before scanning — the same `replace(/\/\*…\*\//g)`
the suite's other source guards use. Test `[34]` likewise first asserted against
`SignIn.jsx` for `addBinderEntry`, which is not where that string lives; it now
follows the real chain — the panel plans a `file` step, `SignIn.jsx` maps the kind
onto `binder.file`, and `client/commands.js` sends `addBinderEntry` — so all three
links are pinned instead of one guess.

## 10. Bite results

Five mutations, as the brief specifies. **All five bite.**

| | Mutation | Fails |
|---|---|---|
| A | re-add `fileObject` to external exposure | `[31]`, `[35]`, **and** `phase5-b81` |
| B | re-add `unfileObject` to external exposure | `[31]`, `[35]`, **and** `phase5-b81` |
| C | remove the domain `fileObject` | 20 assertions in the membership suite |
| D | remove the domain `unfileObject` | 8 assertions in the membership suite |
| E | re-add a client thunk with no door | `[33]`, `[35]`, **and** `phase5-b81` |

A, B and E failing in **two** places is the point: section I states the decision,
and `phase5-b81` independently refuses any disagreement between the door and the
client. Neither is relying on the other.

C and D failing broadly is the proof for §8 from the other direction — the commands
are not merely present, they are load-bearing for twenty and eight assertions
respectively.

## 11. Full suite, build, prod, smoke

```
node tests/all.cjs   144 suites, 4,920 assertions, 0 failed — ALL SUITES PASSED
npm run build        OK
npm run prod         PRODUCTION BUILD OK — bytes: 346749
npm run smoke        PROD SMOKE OK — rendered 83686 chars
```

Run detached (`setsid nohup`); the full suite is about twelve minutes and a
foreground shell times out at two. `npm run build` before every run — the suite
exits 1 if `domain/` is newer than `dist/`.

Assertions 4,914 → 4,920: section I's six new tests, less nothing, because no
assertion was removed.

## 12. Final counts

| | Expected | Actual |
|---|---|---|
| Exposed commands | 23 | **23** ✓ |
| Domain commands | 53 | **53** ✓ |
| Migrations | 14 | **14** ✓ |
| Refusal codes | 44 | **44** ✓ |

No deviation. Projected sections stay at 21 and durable collections at 18 — this
closure is about external reachability and touched neither.

## 13. Prod-byte movement

```
346749 → 346749.   Zero.
```

**Not a measurement error, and worth one line of explanation.** `EXPOSED_COMMANDS`
is server-side and never enters the client bundle, so removing two entries from it
cannot change a byte. The two client thunks *were* in a bundled file — but nothing
imported them, so esbuild had already tree-shaken them out of the 3A bundle. Read
out of the built artifact:

```
fileObjectInBinder       false
unfileObjectFromBinder   false
"fileObject"             false      (no quoted command name reaches the client)
binderMemberships        true       (the domain and its invariants are bundled)
```

So the thunks never shipped, and their absence from the bundle is independent
confirmation of §6: they had no caller.

## 14. `git status --porcelain`

```
?? "Claude outputs/MetYet_Batch_3A_Closure_Object_Level_Binder_Commands_Remain_Internal.md"
```

## 15. 3B was not started

Confirmed, and asserted rather than stated.

- No per-object Binder control exists anywhere. Test `[33]` scans **every** `.js`
  and `.jsx` file under `client/` (comments stripped) and fails if any of them names
  `fileObject`, `unfileObject`, or either removed thunk.
- The card-level chain is intact end to end, pinned link by link in test `[34]`: the
  Card Specification panel plans `kind: "file"` / `kind: "unfile"`, `SignIn.jsx`
  maps those kinds onto `binder.file` / `binder.unfile`, and `client/commands.js`
  sends `addBinderEntry` / `removeBinderEntry`. `[34]` also asserts neither
  `SignIn.jsx` nor the panel mentions an object-level command.
- No Binder-home rendering, no resolution UI, no legacy-write retirement, no
  `binder_entries` change, no migration change, no Shortlist, no Binder delete, no
  search, no Goal / disposition / transaction / Opportunity / Pending / Market Value
  / qualification work, no broad cleanup, no merge.
- `git diff 592db69 -- persistence/ domain/ client/collector/` is empty, which is
  the strongest single statement of it: the foundation and the shipping UI are
  bit-for-bit what 3A delivered.

**Stop condition met.** `fileObject` and `unfileObject` are fully implemented,
fully tested domain capabilities and are not externally reachable. The shipping
card-level Binder UI is otherwise unchanged.

---

## Push

Still refused. The cloud proxy returns 403 — `Davi17000/metyet-app is not in this
session's authorized repository set`. Not routed around. The commits are delivered
as the usual git bundle with its SHA-256 verified on the Mac; `git bundle verify`
then `git fetch` applies them.
