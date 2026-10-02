# MetYet --- Canonical Engineering Context

**Canonical handoff:** 2026-10-02\
**Purpose:** bootstrap a fresh Claude Project without importing the
overloaded historical Project Knowledge.

## 1. Source priority and working method

Use this order when sources conflict: **current repository/tests →
latest accepted audit/hand-back → this file → older
PRDs/prototypes/conversations**. Inspect the repository before acting.
Do not resurrect obsolete behavior because an old document contains it.

Development sequence: **Observe behavior → define human job → audit
existing meaning → make product decision → implement smallest boundary →
adversarially test → reconcile → repeat.** Stabilize meaning before
visual polish. Local cleanup while touching a boundary is good; broad
cleanup waits until the Collector loop is complete and before pilot.

MetYet is a coordination layer for trusted collecting relationships, not
a generic marketplace. Product framing: **"This isn't where
relationships start --- it's where they continue."** Another durable
principle: **any input/participation should benefit the person entering
it and other relevant participants.**

## 2. Authoritative four-state doctrine

Every **durable Collector object** represents a **specific card/copy**
and has exactly one of four meanings: - Primary Goal - Secondary Goal -
PC - Trade/Sell

A **Goal** is a specific sought card/copy and requires
`Primary XOR Secondary`.\
A **CollectorCopy** is a specific physical owned card/copy and, for new
durable writes, requires `PC XOR Trade/Sell`.\
A canonical/catalog card is reference identity only. It is not
Collector-owned durable truth.

Existing historical stateless copies may be tolerated temporarily, but
never infer PC/Trade-Sell and never auto-migrate them.

**Specificity and completeness are different.** Exact canonical
identity + required state is enough at birth. Grade, condition, cert,
photos and market/reference facts may arrive later. Do not force false
physical facts.

For new CollectorCopies there is no durable "Haven't decided." Once
saved, disposition switches `PC ↔ Trade/Sell`.

## 3. Binder doctrine

**State answers why this specific thing matters. Binder answers how it
is organized.**\
**Goals express priority. Binders express coherence.**

Binder is not a fifth state and never manufactures meaning. Nothing
newly enters a Binder unless it is exactly one Goal or one
CollectorCopy. Adding to a Binder is not a third way of adding a card to
MetYet.

Each Goal and CollectorCopy has **zero or one Binder home**. `Unfiled`
is a UI value, not a durable Binder. Move A→B is one semantic move.
Removing from a Binder leaves the object alive/unfiled. State changes
never move Binder home. No hidden/default Binder and no multi-Binder
copies of the same object.

### Legacy bare-card data

Historical `binder_entries` are compatibility/history only. They may be
**read, displayed and removed**, but must never be newly created by the
current product, converted, inferred into Goal/Copy truth, moved as
object membership, or used as an object's home.

Keep these separate:
`stop creating legacy data ≠ stop reading ≠ stop removing ≠ drop persistence`.

## 4. Object-level Binder architecture

Batch 3A introduced additive `binder_memberships` with stable id, Binder
id, exactly one target (`Goal XOR CollectorCopy`) and `filedAt`. One
home per object; owner coherence; archived Binder cannot receive new
filing; unfile is allowed; deleting object removes membership; no legacy
fallback/inference.

Domain commands: `fileObject`, `unfileObject`.

**Naming trap:** legacy transaction code already uses `binderId` to mean
a CollectorCopy id in places. Do not add `binderId` casually to
Goal/Copy. Prefer semantic `filedIn` if object-side naming is needed.

## 5. Accepted Batch 3B-1 --- frozen

CardSpecification now gives the Goal and every CollectorCopy its own
**single-choice** Binder home control with `Unfiled` first. Binder is
optional. One newly created Binder can be selected by multiple objects
in the same Save. Same-Save creation/file planning uses stable draft
handles and interleaves filing after each creation.

Binder view groups visually by canonical card but renders/actions on
specific object subrows. Only objects actually filed there render there.
Inside a Binder use object-level Move/Remove.

If owned copies are physically indistinguishable, do not invent durable
"Copy #1/#2." Current presentation uses truthful added-order language
("the one you added first/next"). Private copy labels are deferred.

A real stale-projection race was found: a Binder minted during Save
might not yet be in parent projection. 3B-1 preserves locally created
Binder knowledge (`madeBinders`-style) so retries do not silently drop
that destination. Do not simplify back to projection-only validation.

Current product emits **no new bare-card `file` step**. Existing legacy
rows remain visible/removable and never seed object homes.

## 6. Batch 3C audit --- accepted, implementation NOT started

Audit conclusion: `addBinderEntry` can leave external reachability
without breaking current 3B workflows, while `removeBinderEntry` must
remain for historical cleanup.

But **3B-1 must ship as its own production release first. Do not
implement 3C-1 in the same release.**

Reason: old pre-3B tabs may still send `addBinderEntry`. The current 3B
client does not. A stale-tab refusal is visible/reload-recoverable, not
silent/corrupting. One separated production release is sufficient; no
elaborate compatibility program is needed.

### Required overlap-release state

Expected before 3C-1 (verify in repo): - Exposed commands: 25 -
Client-sendable commands: 25 - Exact equality: 25=25 - Domain commands:
53 - Migrations: 14 - Refusals: 44 - Projected sections: 21 - Durable
collections: 18

During overlap: - `addBinderEntry` remains externally reachable; -
`fileCardInBinder` remains bound; - `removeBinderEntry` remains
externally reachable; - `unfileCardFromBinder` remains bound; -
**current CardSpecification emits no `kind:"file"`**.

## 7. Critical 3C test-vacuity finding

The audit temporarily closed the add door and measured the seven
affected test files. **21 tests still passed even though the legacy
fixture they were meant to reason about had not been created.**
File-level redness was largely caused by allow-list ratchets, masking
behavioral vacuity.

Eventual 3C-1 order is load-bearing: 1. Fix/convert legacy fixtures
first so historical rows are definitely created through
internal/domain-direct setup. 2. Verify relevant individual tests
observe the fixture. 3. Then re-pin the seven ratchets. 4. Close
external add exposure/client binding. 5. Preserve read/remove
compatibility. 6. Run mutation/bite pass.

Do not reverse that order.

### Expected eventual 3C-1 boundary (only after overlap release)

Subject to repository verification: - remove `addBinderEntry` from
`EXPOSED_COMMANDS`; - remove `fileCardInBinder` client binding; - retain
`removeBinderEntry` / `unfileCardFromBinder`; - retain internal domain
`addBinderEntry`; - retain `binder_entries`; - retain legacy
reads/display/removal; - exact exposed/client equality expected 24=24; -
domain expected 53; migrations 14; refusals 44; projected sections 21;
durable collections 18.

Do **not** drop `binder_entries` in 3C-1.

Later table retirement requires: external add closed + no current
writer + removal reachable + census capability + production census
zero + rollback window expired. Repository currently has no production
census proving legacy rows are zero.

## 8. Build/release verification debt

`npm run prod` and `npm run smoke` exercise the old `src/MetYet.jsx`
prototype. The production Collector client is built by
`npm run build:app`.

For current releases explicitly run at least: - `npm run build` -
`node tests/all.cjs` - `npm run prod` - `npm run smoke` -
`npm run build:app`

Do not treat green prototype smoke as proof the Collector client
contains the batch. Fixing the canonical gate is engineering debt for
before pilot, not a reason to expand Binder retirement.

Never conflate local commit, bundle, remote branch, merged `main`, and
deployed production.

## 9. Immediate task

Immediate task is **landing/deploying accepted work through 3B-1 onto
`main` as its own production overlap release**.

Use task file:
`SUBMIT_THIS_FILE_TO_CLAUDE_MetYet_Land_and_Deploy_Through_Batch_3B1.md`

Hard stop after production verification. Do not begin 3C-1.

Expected recent lineage --- **verify, do not trust blindly**: -
`64f88e1` earlier main baseline after qualification/photo work -
`88712d0` 3B audit lineage - `f7f820d` 3B-1 implementation - `ca9bb41`
3B-1 hand-back/docs - `3a2b3ef` 3C pre-implementation audit/docs

Pushes from prior Claude sessions were blocked by repository
authorization/proxy 403. Never route around authorization. If blocked,
preserve clean state, give exact owner action, and do not claim
deployment.

## 10. Qualification / photos / visibility

Collector flow already implemented: **Goal → exact trusted match →
inspect physical copy → request photos**.

Participant-aware visibility principle: \> **Pending closes the door; it
does not throw out the people already in the room.**

A newly unavailable copy is closed to new qualification. Existing
authorized participants retain only access needed for their
already-authorized interaction. Unrelated Collectors learn unavailable,
not rival deal details. Do not expose pending/committed/sold
distinctions as an oracle.

Partner photo fulfilment is also implemented: owning TP only;
`addCopyPhotos`; front+back fulfills open requests; fulfillment does not
change availability and may happen after Pending/committed/sold; privacy
preserved.

## 11. True Match --- closed

Matching is exact: - stated criterion → exact equality; - unstated
criterion → unrestricted.

No fuzzy matching, bands, thresholds, "or better," or preference
scoring.

## 12. Transactions / Market Value --- deferred

Do not proceed until object/Binder correction and retirement are
complete.

Keep distinct: 1. `collectorCopy.market` --- private reference; 2.
`tradeCard.agreedMarket` --- negotiated Collector trade-card value; 3.
opportunity/deal `agreedPrice` / "Agree Market Value" --- shop-copy
transaction value.

There is a naming collision to resolve before transaction entry.
`startOpportunity` is a shared-record boundary; price acceptance is
mutation-sensitive; final agreement creates hard exclusivity; Pending is
a separate availability boundary.

## 13. Browse/Search direction --- later

Observed Collector behavior: browse by Pokémon, set and artist; artwork
is central. Product progression: **Exposure → Refinement → Curation**.

Useful discovery direction: visual Pokémon/set/artist browsing, direct
search, complete known card universe, artwork-first grid,
context-preserving navigation, lightweight TP availability overlay.

**Historical warning:** the September Browser PRD described one-tap
Pending Interest → card-level Binder assignment → later Goal priority.
That durable lifecycle is superseded where it conflicts with the
four-state/object-Binder doctrine. Do not recreate durable stateless
interest or bare-card Binder membership. Reuse the discovery ideas
later, reconciled with current invariants.

## 14. TP inventory --- deferred

Potential ingestion: manual lookup/add, CSV import from tools, dedicated
integrations. Do not build this before the Collector loop is stable. TP
demand should derive from specific Goals with privacy proven.

## 15. Visual reconciliation --- later

Current work establishes meaning/domain/interactions/privacy, not final
visual direction. When visual work begins, use founder-provided
mockups/screenshots as targets and preserve domain constraints. Do not
let implementation convenience invent a new visual language.

## 16. Testing standard

Green is necessary, not sufficient. For boundary changes: - identify
doctrinal assertions; - deliberately reverse/update them when doctrine
changes; - replace them with the new invariant; - run adversarial
scenarios; - mutation-test load-bearing claims; - verify individual
tests are non-vacuous; - then full suite/build.

Do not accept a green test whose fixture never existed, or an allow-list
failure as proof behavioral assertions bite.

## 17. Seed a fresh Claude Project with only these

**Required:** 1. `METYET_CANONICAL_ENGINEERING_CONTEXT_2026-10-02.md`
(this file) 2.
`SUBMIT_THIS_FILE_TO_CLAUDE_MetYet_Land_and_Deploy_Through_Batch_3B1.md`
3.
`MetYet_Batch_3C_Legacy_Bare_Card_Binder_Retirement_Pre_Implementation_Audit.md`
4. Current repository access **or** latest verified git bundle (repo
preferred; bundle fallback)

**Only if implementation archaeology is needed:** 5. Batch 3B-1
hand-back 6. Batch 3B audit 7. Batch 3A closure hand-back

Do **not** preload the old Claude Project or all historical PRDs/chats.
Add older artifacts only when a task actually needs them.

## 18. Immediate instruction to the next Claude session

Read this file first, then the current task prompt and latest 3C audit.
Inspect the repository before action.

For the immediate release: - land/deploy through accepted 3B-1; -
preserve `addBinderEntry` external reachability for overlap; - prove
current client emits no new bare-card filing; - preserve
`removeBinderEntry`; - explicitly run `build:app`; - verify
production; - stop.

**Do not start 3C-1 in that release.**
