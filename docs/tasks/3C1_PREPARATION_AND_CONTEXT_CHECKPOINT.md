# SUBMIT THIS FILE TO CLAUDE --- MetYet 3C-1 Preparation / Context Checkpoint

## Purpose

Prepare the repository for the later Batch 3C-1 implementation **without
implementing 3C-1**.

Production checkpoint: - Batch 3B-1 is merged and live. - Production
SHA: `b658e7e`. - PR #79 was merged into `main` with a merge commit. -
3B-1 is formally closed. - Batch 3C / 3C-1 has not been implemented. -
The accepted 3C pre-implementation audit still holds after the latest
read-only checkpoint. - The stale-client compatibility window began when
3B-1 went live around 2026-10-03 01:00 UTC. - Actual closure remains an
owner/release decision.

This preparation batch has exactly two repository outcomes: 1. Update
the canonical engineering context so it no longer says the immediate
task is landing 3B-1. 2. Add a durable implementation brief for Batch
3C-1.

Do not implement 3C-1 yet.

## Before editing

Read `CLAUDE.md`, `docs/METYET_ENGINEERING_CONTEXT.md`, the accepted
Batch 3C audit/hand-back, and inspect current local/remote `main`, HEAD,
and worktree. Confirm `b658e7e` is in `main` history, no 3C-1
implementation exists, and the latest read-only checkpoint still matches
current code. Stop on any conflict.

Use a new preparation branch from synchronized `main`.

## Outcome A --- Canonical context checkpoint

Narrowly update `docs/METYET_ENGINEERING_CONTEXT.md` to record: - 3B-1
is closed in production at `b658e7e`. - Object-level Binder homes are
the production baseline. - Current client creates/files Goals and
CollectorCopies, not new bare-card Binder entries. - `addBinderEntry`
remains temporarily externally exposed only for stale-client
compatibility. - `removeBinderEntry` remains required for legacy-row
removal. - The accepted 3C audit remains authoritative for retiring the
external add door. - 3C-1 is the next **eligible** engineering cleanup
batch after the release owner decides the compatibility window is
sufficient. - 3C-1 must be a separate release from 3B-1. - Prepared does
not mean authorized. - Phase 6 / UX work remains downstream and must not
be mixed into 3C-1. - Build-gate debt (`build:app` in the canonical
verification gate / production-client smoke) remains separate.

Preserve durable product doctrine. Do not broadly rewrite the context.

## Outcome B --- Create the 3C-1 implementation brief

Create: `docs/tasks/BATCH_3C1_CLOSE_LEGACY_BARE_CARD_BINDER_ADD_DOOR.md`

### Batch 3C-1 --- "The door with no caller closes"

Purpose: retire **external reachability for creating new legacy
bare-card Binder entries** while preserving object-level
Goal/CollectorCopy filing, existing legacy rows, their supported
visibility/removal, internal domain support needed for truthful legacy
fixtures/history/replay, privacy, and object-state invariants.

This is not table retirement, migration, conversion, inference, UX
redesign, or domain expansion.

### Hard prerequisite

Implementation may begin only after: 1. 3B-1 is already in production as
its own prior release; and 2. the release owner explicitly decides the
stale-client compatibility window is sufficient.

The repository cannot prove real browser-tab lifetime. Do not invent
telemetry. If closure is not explicitly authorized, stop before
implementation.

### Expected starting counts

Re-measure rather than blindly trusting: - exposed commands: 25 -
client-sendable: 25 - exact equality: 25 = 25 - domain commands: 53 -
migrations: 14 - refusal codes: 44 - projected sections: 21 - durable
collections: 18 - `CARD_NAMING_COMMANDS`: 4

### Mandatory implementation order

**1. Convert legacy-row HTTP fixtures FIRST.**

Before closing the door or re-pinning allow-list/count guards, convert
affected HTTP legacy-row fixture creation to the established
domain-direct legacy fixture pattern.

The accepted audit measured the central risk: roughly seven affected
files / about twenty fixture call sites; 30 tests predicted at risk;
**21 tests passed vacuously** when the external command was closed with
fixtures unchanged; six were privacy tests; the central 3B-1 "legacy row
is not a Goal home" correction was among them.

Use the established domain-direct fixture pattern. Do not let the suite
become green by merely re-pinning allow-list assertions.

After conversion, repeat the audit's per-test vacuity measurement.
Relevant converted legacy-row tests must not pass merely because
external add is unavailable. Record results **per test, not per file**.

**2. Verify converted behavior before closure.**

Prove converted fixtures still exercise the intended legacy behavior
while the production door remains open. Stop if conversion changes
tested behavior.

**3. Close external add reachability and dead client binding together.**

In one coherent implementation commit: - remove `addBinderEntry` from
`EXPOSED_COMMANDS`; - remove `fileCardInBinder` from the client command
surface; - remove the dead client wiring/case that only calls that
binding, as confirmed by current inspection; - retain
`removeBinderEntry`; - retain `unfileCardFromBinder`; - retain internal
domain `addBinderEntry`; - retain `CARD_NAMING_COMMANDS` unless current
code disproves the audit; - retain `binder_entries` storage,
projection/read compatibility, and removal; - add no alias or alternate
route.

A stale pre-3B client attempting retired add must receive existing
`409 command-unavailable`. Add no refusal code.

**4. Re-pin the seven legacy-door ratchets.**

Only after fixture conversion and closure, update affected guards to
assert the replacement invariant. Strengthen, never weaken, exact
client/exposed equality.

Make the asymmetry explicit: - internal domain add: retained; - external
add: closed; - external remove: retained.

Add an assertion pairing "command exists in domain" with "command is not
externally exposed."

**5. Add missing behavioral assertions.**

Pin at minimum: - current Goal filing works; - current CollectorCopy
filing works; - new Binder + object + file in one Save works; - current
client removes a legacy row; - archived-Binder legacy removal works; -
current client sends no new bare-card add; - stale pre-3B add gets
`409 command-unavailable`; - stale/remove still works; - legacy row
infers neither Goal nor Copy home; - legacy row and object membership
coexist distinctly; - partner projection contains no Binder data; -
direct HTTP retired-add gets 409 before deeper command execution; - no
alias/alternate binding exposes retired add; - direct domain legacy
fixture creation still works by design.

**6. Correct newly identified `[36]` lineage test.**

The latest checkpoint found that `[36]` must compare **3B-1's own
implementation lineage/commits**, rather than a diff boundary that
becomes false/misleading after merge-commit landing. Preserve its
intent: prove the accepted 3B-1 implementation boundary and that later
docs/audit work did not silently alter behavior. Do not weaken/delete
the guard.

Correct comments that would become factually false after 3C-1.

**7. Remove only the previously identified dead `filedNow` read**, and
only if current inspection confirms it remains dead for the same reason.
No opportunistic cleanup.

### Expected post-3C-1 counts

-   exposed: **24**
-   client-sendable: **24**
-   exact equality: **24 = 24**
-   domain: **53**
-   migrations: **14**
-   refusals: **44**
-   projected sections: **21**
-   durable collections: **18**
-   `CARD_NAMING_COMMANDS`: **4**

Any unexplained discrepancy is a stop event. Domain staying 53 is
deliberate.

### Required 12-bite mutation pass

Prove tests fail if each regression is introduced: 1. re-add external
`addBinderEntry`; 2. re-add client `fileCardInBinder`; 3. shipping panel
emits bare-card `kind: "file"`; 4. another production path directly
calls `addBinderEntry`; 5. external `removeBinderEntry` is removed; 6.
legacy Remove breaks, including archived removal; 7. exact equality is
weakened to subset; 8. domain command is exposed under an alias; 9.
Binder data leaks to partner; 10. object home is inferred from legacy
row; 11. Browse/Add Cards regresses to bare-card filing; 12. dormant
internal domain `addBinderEntry` is deleted.

Mutations 1, 5, 12 prove the deliberate asymmetry. Revert every mutation
fully.

### Verification

Run targeted tests, then at minimum: `npm run build`
`node tests/all.cjs` `npm run prod` `npm run smoke` `npm run build:app`

If local `build:app` lacks Supabase configuration, use only the
repository-supported unconfigured local mechanism and distinguish it
from configured production build. Do not fix Node 24 local / Node 22
Render unless it becomes a blocker. Do not run `npm audit fix`. Do not
mix build-gate debt into 3C-1.

### Explicitly out of scope

No migration/backfill/conversion/inference of legacy rows; no
`binder_entries` retirement; no removal of legacy reads/removal; no
removal of internal domain add; no Goal/Copy/four-state semantic
changes; no Browse/Search/Goal/Binder/CardSpecification redesign; no
Phase 6 UX/UI; no transaction work; no broad cleanup; no
migration/refusal/privacy changes; no unrelated dependency fixes; no
merge/push/deploy/next batch without separate authorization.

### Eventual implementation hand-back

Report starting branch/SHA/worktree; release-window authorization; files
changed; fixture conversions and per-test anti-vacuity evidence; exact
door/binding removals; legacy removal evidence; `[36]` correction;
ratchets; semantic counts; tests/builds; all 12 mutations and bites;
privacy/invariant evidence; discoveries/deferred work; exact stopping
point. Stop before merge/deploy.

## THIS PREPARATION TASK ONLY

Do **not** execute 3C-1 now.

Allowed edits only: 1. narrow checkpoint update to
`docs/METYET_ENGINEERING_CONTEXT.md`; 2. creation of
`docs/tasks/BATCH_3C1_CLOSE_LEGACY_BARE_CARD_BINDER_ADD_DOOR.md`.

After editing: - inspect diff for accidental doctrine changes; - confirm
no source/test/migration/dependency/build file changed; - commit only
these docs on the preparation branch with a clear docs-only message; -
do not merge, push, deploy, or begin 3C-1; - hand back branch, starting
SHA, commit SHA, exact files changed, and confirmation product behavior
is untouched; - stop.
