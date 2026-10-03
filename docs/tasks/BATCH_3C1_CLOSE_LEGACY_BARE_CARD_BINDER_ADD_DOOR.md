# MetYet — Batch 3C-1: "The door with no caller closes"

**Status:** prepared, **not authorized**. Prepared 2026-10-03 from `main` at
`b658e7e` (3B-1 in production). Prepared does not mean authorized.

**Sources:** `docs/METYET_ENGINEERING_CONTEXT.md` (§3, §6, §7, §9);
`Claude outputs/MetYet_Batch_3C_Legacy_Bare_Card_Binder_Retirement_Pre_Implementation_Audit.md`
(the accepted audit — §4, §8, §10, §13, §14, §20, §21, §22 are the working
references); the 2026-10-03 read-only checkpoint (the `[36]` finding, §6
below). File/line references below are as of `b658e7e` — **re-verify every one
before acting.**

## Purpose

Retire **external reachability for creating new legacy bare-card Binder
entries** while preserving:

- object-level Goal / CollectorCopy filing (`fileObject` / `unfileObject`);
- existing legacy rows, their visibility and their removal;
- the internal domain `addBinderEntry`, needed for truthful legacy
  fixtures/history/replay;
- privacy and every object-state invariant.

This is not table retirement, migration, conversion, inference, UX redesign,
or domain expansion.

## Hard prerequisite

Implementation may begin only after **both**:

1. 3B-1 is already in production as its own prior release (true since
   `b658e7e`, deployed around 2026-10-03 01:00 UTC); **and**
2. the release owner **explicitly** decides the stale-client compatibility
   window is sufficient, and the task prompt says so.

The repository cannot prove real browser-tab lifetime. Do not invent
telemetry. If closure is not explicitly authorized, stop before
implementation.

Start from a new branch off synchronized `main`. Confirm `addBinderEntry` is
still in `EXPOSED_COMMANDS` before starting; if it is not, stop and report.

## Expected starting counts

Re-measure rather than trust:

| | Expected |
|---|---|
| Exposed commands | 25 |
| Client-sendable commands | 25 |
| Exact equality | 25 = 25 |
| Domain commands | 53 |
| Migrations | 14 |
| Refusal codes | 44 |
| Projected sections | 21 |
| Durable collections | 18 |
| `CARD_NAMING_COMMANDS` | 4 |

Any unexplained discrepancy is a stop event.

## Mandatory implementation order

The order is load-bearing. Do not reverse it.

### 1. Convert legacy-row HTTP fixtures FIRST

Before closing the door or re-pinning any allow-list/count guard, convert
HTTP-created legacy-row fixtures to the established domain-direct pattern
(`executeCommand(ctx.repository, …)` — see `run1` in
`tests/phase5-c31-binder-foundation.cjs` and `direct` in
`tests/phase5-c33-card-specification.cjs`).

Audit measurement (audit §4.3–§4.6): about seven files / about twenty fixture
call sites; 30 tests predicted at risk; **21 passed vacuously** with the
external command closed and fixtures unchanged; six of them privacy tests;
the 3B-1 "a legacy row is not a Goal's home" test (`phase5-c34b-binder.cjs`
*"filing it makes it leave, on the authoritative refresh"*) among them.

Audit work list (audit §4.5): `phase5-c34b-binder.cjs` (the `file` helper —
one line), `phase5-c33-card-specification.cjs`, `phase5-c31-binder-foundation.cjs`,
`phase5-c35-close-the-loop.cjs`, `phase5-c4-catalog-import.cjs`,
`phase5-c5-tp-inventory-correction.cjs` (and confirm `phase5-c32` is already
domain-direct).

Do not let the suite become green by re-pinning allow-list assertions. File
exit codes are dominated by those pins and will hide vacuity.

After conversion, repeat the audit §4.6 measurement: temporarily remove
`"addBinderEntry"` from `EXPOSED_COMMANDS`, rebuild, run the affected files,
record results **per test, not per file**, then restore byte-identically. No
legacy-row test may pass merely because external add is unavailable — the
set of such tests must be empty.

### 2. Verify converted behavior before closure

With the production door still open, prove converted fixtures still exercise
the intended legacy behavior (each fixture's row actually exists where the
test reasons about it). Stop if conversion changes tested behavior.

### 3. Close external add reachability and the dead client binding together

In one coherent implementation commit (audit §10):

- remove `"addBinderEntry"` from `EXPOSED_COMMANDS` (`server/exposed-commands.js`);
- remove `fileCardInBinder` from `client/commands.js`;
- remove the dead wiring that only calls it — its import, the `file:` key in
  the `binder` bundle, and `case "file"` in `client/sign-in/SignIn.jsx` — as
  confirmed by current inspection;
- **retain** `removeBinderEntry` (exposed) and `unfileCardFromBinder` (bound),
  with `case "unfile"` and the panel's legacy Remove (`dropLegacy`);
- **retain** the internal domain `addBinderEntry` unchanged;
- **retain** `CARD_NAMING_COMMANDS` unless current code disproves the audit (§13);
- **retain** `binder_entries` storage, projection/read compatibility and removal;
- add no alias and no alternate route.

A stale pre-3B client attempting the retired add must receive the existing
`409 command-unavailable` (`server/app.js`, `isExposed` guard). Add no refusal code.

### 4. Re-pin the seven legacy-door ratchets

Only after conversion and closure, update R1–R7 (audit §8) to assert the
replacement invariant (audit §9), each carrying its reason in place:

- R4 `closedSince` and R5 `lost` become exactly `["addBinderEntry"]`, as
  literals, so any other closure still fails;
- R6 moves from a bare substring to `execute("…")` matching — a strengthening;
- R3's two behavioral halves (not-owner, card-unavailable) move from HTTP to
  the domain;
- R7: `file` leaves the mapped kinds; `unfile` stays.

Strengthen, never weaken, exact client/exposed equality
(`phase5-b81-plumbing-corrections.cjs` holds at the new number unmodified).

Make the asymmetry explicit — internal domain add: **retained**; external
add: **closed**; external remove: **retained** — and add an assertion pairing
"`addBinderEntry` is in `COMMAND_NAMES`" with "`addBinderEntry` is not in
`EXPOSED_COMMANDS`", plus no alias keys in `COMMANDS`.

### 5. Add missing behavioral assertions

Pin at minimum:

- current Goal filing works;
- current CollectorCopy filing works;
- new Binder + object + file in one Save works;
- the current client removes a legacy row;
- legacy removal from an **archived** Binder works;
- the current client sends no new bare-card add;
- a stale pre-3B add gets `409 command-unavailable`;
- stale/current remove still works;
- a legacy row infers neither a Goal nor a Copy home;
- a legacy row and an object membership coexist distinctly;
- partner projection contains no Binder data;
- direct HTTP retired add gets 409 before the catalog guard and the world lock;
- no alias/alternate binding exposes the retired add;
- direct domain legacy fixture creation still works by design.

### 6. Correct the `[36]` lineage test, and comments made false

`tests/phase5-binder-object-membership.cjs` `[36]` runs
`git diff --name-only ff80c17 -- domain/ persistence/` against the **working
tree**, so it fails on any later edit under `domain/` (including the
`domain/README.md` comment corrections below) for reasons unrelated to 3B-1.
Re-express it, following the repository's own precedent
(`phase5-c35-close-the-loop.cjs`, "BOTH ENDS ARE NAMED"), as a comparison of
**3B-1's own implementation lineage** — its base `ff80c17` and its
implementation commit `f7f820d` — preserving its intent: the accepted 3B-1
implementation did not touch `domain/` or `persistence/`, and later
docs/audit work did not silently alter behavior. Do not weaken or delete it.

Correct comments that become factually false after 3C-1 (audit §22 step 6):
the `phase5-c31-binder-foundation.cjs` `CARD_NAMING_COMMANDS` test title,
`server/app.js` comments on `addBinderEntry`, `domain/README.md` references,
and the verbatim-list comment blocks that say the door "stays one release …
and goes in 3C".

### 7. Remove only the dead `filedNow` read

`client/collector/CardSpecification.jsx` — in `planFrom`, `entries` exists
only to build `filedNow`, and `filedNow` is returned but read by nothing
(audit §14; reconfirmed 2026-10-03). Remove both, and update the adjacent
comment that defends keeping it, **only if** current inspection confirms it
remains dead for the same reason. No other cleanup.

## Expected post-3C-1 counts

| | Expected |
|---|---|
| Exposed commands | **24** |
| Client-sendable commands | **24** |
| Exact equality | **24 = 24** |
| Domain commands | **53** (deliberate — the command is retained) |
| Migrations | **14** |
| Refusal codes | **44** |
| Projected sections | **21** |
| Durable collections | **18** |
| `CARD_NAMING_COMMANDS` | **4** |

Any unexplained discrepancy is a stop event.

## Required 12-bite mutation pass

Prove tests fail when each regression is introduced, then revert each fully:

1. re-add external `addBinderEntry`;
2. re-add client `fileCardInBinder`;
3. shipping panel emits bare-card `kind: "file"`;
4. another production path directly calls `addBinderEntry`;
5. external `removeBinderEntry` is removed;
6. legacy Remove breaks, including archived removal;
7. exact equality is weakened to a subset check;
8. the domain command is exposed under an alias;
9. Binder data leaks to a partner;
10. an object home is inferred from a legacy row;
11. Browse / Add Cards regresses to bare-card filing;
12. the dormant internal domain `addBinderEntry` is deleted.

Mutations 1, 5 and 12 prove the deliberate asymmetry.

## Verification

Run targeted tests first, then at minimum:

```text
npm run build
node tests/all.cjs
npm run prod
npm run smoke
npm run build:app
```

If local `build:app` lacks Supabase configuration, use only the
repository-supported `npm run build:app -- --allow-unconfigured` and say so,
distinguishing it from the configured production build. Do not change Node
24 (local) / Node 22 (Render) unless it becomes a real blocker. Do not run
`npm audit fix`. Do not mix build-gate debt into 3C-1.

## Explicitly out of scope

No migration, backfill, conversion or inference of legacy rows; no
`binder_entries` retirement; no removal of legacy reads or removal; no removal
of the internal domain add; no Goal / Copy / four-state semantic change; no
Browse / Search / Goal / Binder / CardSpecification redesign; no Phase 6
UX/UI; no transaction work; no broad cleanup; no migration / refusal / privacy
changes; no unrelated dependency fixes; no merge, push, deploy or next batch
without separate authorization.

## Stop condition

Stop when (audit §22): `addBinderEntry` is not exposed and `fileCardInBinder`
is gone, with direct HTTP add answering 409 `command-unavailable` (asserted);
`removeBinderEntry` is exposed and bound, with legacy removal from active and
archived Binders asserted end to end; legacy rows remain visible and never
read as an object's home; the domain command and `binder_entries` are
untouched (domain 53); 24 = 24 holds with `phase5-b81` unmodified; the per-test
vacuity measurement returns an empty set; R1–R7 carry their replacement
invariants; `[36]` compares 3B-1's own commits; full suite and builds are
green and all twelve mutations bite. **Then stop — before merge or deploy.**

## Eventual hand-back

Report: starting branch/SHA/worktree; the release-window authorization relied
on; files changed; fixture conversions and per-test anti-vacuity evidence;
exact door/binding removals; legacy-removal evidence (active and archived);
the `[36]` correction; ratchets R1–R7; semantic counts before/after;
tests/builds (noting any unconfigured `build:app`); all 12 mutations and what
bit; privacy/invariant evidence; discoveries and deferred work; exact stopping
point.
