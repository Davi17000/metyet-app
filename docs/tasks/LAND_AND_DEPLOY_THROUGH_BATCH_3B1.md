# SUBMIT THIS FILE TO CLAUDE

# MetYet — Land and Deploy Through Accepted Batch 3B-1

## Mission
Safely land the already-accepted work through **Batch 3B-1** onto `main` and verify that production is running that release.

This is a release/landing batch, not a product implementation batch. **Do not implement 3C-1 yet.** Do not close `addBinderEntry`, change legacy compatibility, migrate, or redesign anything.

The accepted 3C audit established the sequencing prerequisite: **3B-1 must reach production as its own release before the legacy bare-card add door closes in a later 3C-1 release.**

## 1. Verify ground truth first
Expected branch: `phase-5-four-state`.

Expected recent lineage:
- `88712d0` — 3B audit
- `f7f820d` — 3B-1 implementation
- `ca9bb41` — 3B-1 hand-back
- `3a2b3ef` — 3C audit docs

Do not trust these blindly. Verify repository, branch, HEAD, worktree, ancestry, current local/remote `main`, bundle contents if used, and whether anything has already reached the remote.

The release we want is the **accepted product state through 3B-1**. The 3C commit is audit/docs only and may land with the history if it is truly docs-only. Prove everything after the accepted 3B-1 implementation is docs/audit only unless explicitly accounted for.

Critically, prove `addBinderEntry` is **still externally exposed**. If it has already been closed in code, stop; do not deploy that state as the overlap release.

## 2. Verify accepted 3B-1 behavior
Confirm without changing:
- Goal has its own optional Binder home.
- Every CollectorCopy has its own optional Binder home.
- Home is a single choice with `Unfiled` first.
- Goal/copies file independently; move/unfile does not change state; state changes do not move home.
- New Binder can be created and used in the same Save.
- same-Save filing uses stable handles and the stale-projection/new-Binder race remains fixed.
- Binder groups by canonical card and renders specific Goal/Copy subrows.
- Only objects actually filed there render there.
- indistinguishable copies use truthful added-order language.
- current product emits no new bare-card `file`.
- existing legacy rows remain visible/removable and never infer an object's home.
- `addBinderEntry` remains exposed for stale-client overlap.
- `removeBinderEntry` remains exposed for cleanup.
- partner/unrelated actors receive no Binder organization.

## 3. Verify semantic counts
Expected pre-3C state:
```text
Exposed commands:          25
Client-sendable commands:  25
Exact equality:            25 = 25
Domain commands:           53
Migrations:                14
Refusal codes:             44
Projected sections:        21
Durable collections:       18
```
Measure actual values. If different, investigate; do not re-pin merely to make tests green.

## 4. Full verification
At minimum run:
```text
npm run build
node tests/all.cjs
npm run prod
npm run smoke
npm run build:app
```
Run any canonical repository verification command too, but do not substitute it for the above.

`build:app` is required because the accepted audit established that prod/smoke target the prototype while `build:app` builds the production Collector client. Do not fix that build-gate debt in this release; just run and record it.

## 5. Prove the 3C prerequisite has NOT landed
Explicitly prove:
```text
addBinderEntry ∈ EXPOSED_COMMANDS
fileCardInBinder remains bound
removeBinderEntry ∈ EXPOSED_COMMANDS
unfileCardFromBinder remains bound
```
Also prove CardSpecification emits no `kind: "file"`, legacy `kind: "unfile"` remains reachable, and exact client/exposed equality is 25=25.

This is intentional: **the old add command remains reachable for stale clients while the current client no longer uses it.**

## 6. Land onto `main`
Use the repository's normal integration process. Preserve reviewed history rather than rebuilding manually.

Before changing `main`, inspect/fetch remote `main`, determine whether it advanced independently, and identify conflicts. Do not overwrite newer work, force-push, or silently resolve semantic conflicts.

If a PR is required, use it. If the established process permits a normal merge/fast-forward, use that.

If authorization still blocks pushing:
- do not route around the proxy or invent credentials;
- leave a clean reproducible state;
- provide the exact owner command/action needed;
- distinguish “prepared locally” from “actually on remote main.”

A local merge is not a deployment.

## 7. Deployment
The accepted audit says Render deploys `main` and production client/API are one service/artifact. After the work is genuinely on remote `main`, determine whether deployment is automatic or requires an established supported action.

Do not make unrelated Render/config changes.

Record:
- remote `main` SHA;
- deployed SHA;
- deployment/build status;
- whether the running service actually corresponds to the expected release.

Do not call a push a deployment.

## 8. Production verification
Perform a narrow, non-destructive post-deploy verification sufficient to prove the overlap release is live.

At minimum establish that the deployed application corresponds to the expected commit/build and the service is healthy. Where supported, verify the production Collector bundle contains the 3B-1 behavior.

Do not create destructive production data just to prove deployment. If authenticated production smoke is unavailable, state exactly what was and was not verified.

## 9. Hard stop — do not start 3C-1
After deployment, do **not**:
- remove `addBinderEntry` exposure;
- remove `fileCardInBinder`;
- convert the seven legacy fixtures;
- re-pin the seven 3C ratchets;
- move 25=25 to 24=24;
- delete the dead `filedNow` read;
- add 3C retirement assertions;
- migrate/drop `binder_entries`.

Those belong to the **next release**. This batch exists to create a real production overlap period.

## Required hand-back
Return:

# MetYet — Through Batch 3B-1 Landing and Deployment Hand-Back

Include:
1. Starting branch/SHA/worktree.
2. Verified lineage.
3. Remote `main` before integration.
4. Exact commits integrated.
5. Proof post-3B-1 commits were docs/audit only, or exceptions.
6. Pre-merge semantic counts.
7. Full test/build results including `build:app`.
8. Proof `addBinderEntry` remains exposed while current UI emits no new `file`.
9. Integration method.
10. Remote `main` SHA afterward.
11. Deployment mechanism/result.
12. Deployed SHA/version.
13. Production verification.
14. Anything not verifiable.
15. Confirmation **3C-1 was not started**.
16. Exact next condition for beginning 3C-1.

If blocked, instead provide exact blocker, exact prepared state, smallest owner action required, and what must be verified afterward. Do not call a blocked local state deployed.

## Stop condition
### Successful
Stop when:
- accepted work through 3B-1 is on remote `main`;
- production has deployed it;
- deployment is verified as far as available tooling permits;
- `addBinderEntry` remains externally reachable;
- current 3B client does not use it;
- `removeBinderEntry` remains available;
- tests/builds are green;
- 3C-1 has not started.

### Blocked
If authorization, CI, deployment or another external dependency prevents that:
- stop at the blocker;
- preserve a clean repository;
- say exactly what completed and what did not;
- give the smallest owner action needed;
- do not start 3C-1.

The next product implementation batch remains:

> **Batch 3C-1 — close the legacy bare-card add door only after this 3B-1 overlap release has actually been live.**
