# MetYet — Phase 5 Batch 8 Goal Loop

## Opportunity Discovery — Relationship-Aware Supply Meets Explicit Demand

**Outcome: PASS.** Implemented, verified, committed as `97e410a`, delivered by the
established bundle/import handoff. Not pushed, not merged, not deployed.

---

### 1. Baseline SHA / tree

| | |
|---|---|
| `origin/main` | `7fb3fe510793bacfc5f9b99d0998830d078a633f` |
| tree | `3a0d027e032cfbadcc50fe9bcde0220f91085c3a` |
| worktree | `/home/claude/b8`, branch `phase-5-b8-opportunity-discovery`, clean apart from the untracked `Claude outputs/` and `node_modules/` |
| baseline verification | `npm run build` OK, `npm test` **ALL SUITES PASSED** |

### 2. B5 / B6 / B7 presence

All three are ancestors of `origin/main`, confirmed with `git merge-base --is-ancestor`:

| Batch | Commit | PR | Ancestor |
|---|---|---|---|
| B5 canonical card identity | `aec9d4f` | #59 | yes |
| B6 Trusted Partner inventory | `f03e9d1` | #60 | yes |
| B7 Collector goals | `3e1bb26` | #61 | yes |

B7 was merged between the end of the B7 loop and the start of this one, so the
brief's "stop/report if B7 is absent" condition did not apply.

### 3. Architecture found

Three schemas: `metyet` (the canonical transactional world), `metyet_auth`
(accounts, invitations, credentials), `metyet_catalog` (card reference work,
added by B5). The canonical world is loaded whole under one advisory lock,
validated by `validateWorld`, and projected per seat by `projectForActor`.
Commands are pure functions of `(state, actor, payload, ctx)`.

Two facts decided this batch:

1. **Everything of this kind in the codebase is derived, never stored.** Goal
   state (seeking / negotiating / satisfied), inventory copy status (available /
   committed / sold), binder copy status (available / reserved / committed /
   traded), whether a copy has been asked about, whether a goal is locked — none
   of them is a column. Each is computed from the Opportunities. The house rule
   is explicit in the source: two answers to one question is how a product
   starts lying to one of the people using it.

2. **The matching path already exists and the codebase already says it is one
   computation.** `domain/metyet-entities.js`: *"Which partners hold the exact
   identity a goal names. This is the single matching path: the collector's
   'who has this' and the partner's 'who wants what I hold' are the same
   computation read from opposite ends."* Its callers are the demo prototype
   only; the production projection had no discovery at all.

### 4. Existing Opportunity semantics

`metyet.opportunities` is **a negotiation aggregate, not a discovery record**.
It carries `stage` (agree-price → select-trade → value-trade → deal →
fulfillment → completed), a `priceThread`, an `agreedPrice`, a trade package,
a deal balance, a fulfillment plan, `declined` / `completedAt`, and a per-seat
read position. It is created by exactly one command, `startOpportunity(goalId,
invId, amount)` — a Collector making an offer with a figure a person chose.

Three domain rules hang off its existence:

- `oneNegotiationPerGoal` — a Goal may have one active negotiation at a time;
- `goalLocked` — an active Opportunity locks its Goal at Primary and makes
  `removeGoal` refuse;
- `inventoryCopyStatus` / `copyCommittedTo` — a Copy with a settled price is
  committed and cannot be offered to anybody else; a completed deal sells it.

`validateWorld` enforces all three across the whole world.

### 5. Computed-vs-persisted decision, with evidence

**Discovery is computed. The negotiation record stays persisted.** MetYet is
therefore already the hybrid the brief asks about; B8 names the seam rather than
inventing one.

Evidence for computing:

- Writing discovery rows into `opportunities` would fabricate negotiations
  nobody opened, and the domain would believe them: the Goal would lock at
  Primary and become unremovable, the Copy would read as committed, and a
  second Goal-level negotiation would be refused. **Discovery would have
  reserved inventory and frozen demand** — invariants 8, 9 and 10, broken by
  the act of noticing.
- `validateWorld` would reject the result immediately: an active Opportunity
  must name a Goal, and a Goal may hold one.
- The established pattern for exactly this class of fact is derivation (§3).
- Idempotency is then structural, not defended: there is nothing to
  de-duplicate (invariant 12) and nothing that reconciliation could erase
  (invariant 16).
- It is reversible. If a later batch needs durable discovery — "you were told
  about this on the fourth" is a real product question — a table can be added
  then and filled from the same pure function. The other direction is not
  cheap.

**Alternative considered and rejected:** a `metyet.discoveries` table
reconciled at command time on `addGoal`, `removeGoal`, `updateGoalTier`,
`addInventoryCopy`, `removeInventoryCopy` and relationship acceptance. It
duplicates the matching rule into six write paths, needs a suppression or
tombstone model so a dismissed discovery does not return, and gives invariant
16 real teeth for the first time. Nothing in the repository records when
anybody first learned of a copy, so nothing demands durability today.

### 6. Exact B8 Opportunity definition

A **discovery** exists, at read time, exactly when all four hold:

```
an explicit Collector Goal naming canonical card K
+ a Trusted Partner Copy naming the same K, on the shelf and not spoken for
+ a current accepted relationship between that Collector and that Partner
+ K is identical on both sides (string equality on an opaque canonical id)
```

Order of creation is irrelevant — Goal-first, Inventory-first and
relationship-first all yield the discovery the moment the third element exists,
because nothing is written when any of them is created.

`domain/metyet-discovery.js` exposes `discoveriesIn(view)`, a pure function of
one seat's **finished projection**.

Record shape — ids and a tier, and deliberately no field for anything else:

```js
{ key, goalId, collectorId, partnerId, canonicalCardId, tier, invIds: [...], copies }
```

### 7. Unit and uniqueness rule

**The unit is one Goal and one Trusted Partner.** Key: `goalId + "::" + partnerId`,
derived and stable.

Evidence: the prototype's own `partnersWith` returns one entry per *partner*
with the exact copies carried — a Collector's question is "who has this", and a
partner holding three copies is one person to talk to. The copies are carried
(an offer eventually names one) but never multiplied. Modelling it as
Goal ↔ Copy would multiply rows by stock and invite reservation thinking.

Consequences, all tested: two copies at one partner is one discovery with
`copies: 2`; two Collectors wanting one card are two independent discoveries
over the same copies, neither taking anything from the other.

### 8. Discovery triggers and reconciliation

**None, and that is the mechanism.** Discovery is computed inside
`projectForActor`, so every read answers the question afresh. No trigger on any
command, no background job, no event infrastructure, no reconciliation
primitive — there is nothing stored to reconcile. This is the single coherent
mechanism the brief asked for, and it is strictly less machinery than
command-time reconciliation.

### 9. Primary / Secondary behaviour

Both tiers participate; the tier travels verbatim.

Repository evidence for including Secondary: `GOAL_FOR_PARTNER` projects `tier`
to the partner; `demandLine` already gives Secondary its own sentence ("This
card is on X's secondary list."); `partnerProfile` counts primary and secondary
separately as two kinds of demand; migration 0008 calls both explicit demand.

The only rule that excludes Secondary is `goalIsPursued`, which refuses
`startOpportunity` on a Secondary goal. That is the **offer** boundary, not the
awareness boundary, and it is untouched. B8 never mutates a tier, never infers
urgency, invents no score and creates no third match class.

### 10. Inventory availability

B6's existing lifecycle, unchanged. A Copy is current supply when
`archived !== true` **and** its projected `status === "available"` — the status
already derived from the Opportunities, which reads `committed` once a price is
settled and `sold` once a deal completes. Both are copies `startOpportunity`
itself refuses, so nothing is offered here that could not be bought.

Grade and condition are never consulted: B5 moved them off card identity and
onto the Copy, and they describe the card, not whether it exists to be had. No
reservation, hold, allocation or quantity lock is introduced.

### 11. Goal removal

The discovery disappears, because it was never written. History is untouched:
the Opportunity persists with its price thread and outcome. `removeGoal` still
refuses while a negotiation is live (`goal-locked`), which is B7's rule and is
unchanged. Removing and re-adding a Goal produces one discovery with a new key,
not two.

### 12. Inventory archive

`removeInventoryCopy` archives; the discovery stops on the next read for both
seats. Re-listing produces one discovery naming the new copy. An archived copy
never acts as current supply.

### 13. Relationship lifecycle

An ended relationship removes the discovery from both sides immediately — the
predicate is the same one the command layer uses (`status == null ||
status === "accepted"`). The Goal and the Copy are untouched: neither was ever
about that relationship. A pending invitation is not a relationship and does not
appear in the collection at all.

### 14. Progressed state and history preservation

Nothing about discovery can erase anything, because it writes nothing. The
durable half is the Opportunity, which keeps every agreed term as history — an
ended deal is marked, never deleted.

Two behaviours worth naming:

- A copy **committed** to one deal stops being supply for other Collectors; a
  partner's *other* free copy still produces their discovery. One overlap never
  silently removes another's legitimate one (invariant 11, tested both ways).
- A **live deal** on the same Goal and partner is the truer statement, so both
  screens drop the discovery against it rather than saying both. The server
  still reports it — this is a presentation join on `goalId::partnerId`, not a
  server-side suppression.

Catalog withdrawal does not retroactively erase intent: an existing Goal and an
existing Copy keep their overlap, while the withdrawn card can no longer be
chosen anew (`card-unavailable`).

### 15. Migration and schema

`persistence/migrations/0009_opportunity_canonical_card.sql` — additive, one
table:

```sql
alter table metyet.opportunities add column canonical_card_id text;
alter table metyet.opportunities add constraint opportunities_canonical_card_fk
  foreign key (canonical_card_id)
  references metyet_catalog.canonical_cards (canonical_card_id)
  deferrable initially deferred;
alter table metyet.opportunities alter column card_id drop not null;
create index opportunities_canonical_card_idx on metyet.opportunities (canonical_card_id);
```

No `update`, no `insert`, no `drop`. Nothing is backfilled and no canonical
identity is guessed; production holds no opportunities. Demo compatibility is
preserved — the legacy column and its foreign key stay, and a NULL satisfies a
foreign key.

**No unique index**, deliberately. "One negotiation at a time" is a rule about
active deals and about the *Goal*, held by `oneNegotiationPerGoal` and checked
by `validateWorld`. Uniqueness on (collector, canonical card) would forbid a
Collector who bought this card once from ever buying another.

`world-repository.js`: `cardId` becomes a mirror and `canonicalCardId` joins it,
matching what B6 did for copies and B7 for goals.

`validateWorld`: an Opportunity names its card one way or the other — neither is
`ref.missing`, both is `ref.ambiguous` — and a canonical deal must name a copy
that names the same canonical card, with the two vocabularies never compared
against each other.

### 16. Legacy compatibility

`metyet.catalog_cards` is not dropped. Legacy Goals, Copies and Opportunities
behave exactly as before, including `startOpportunity` over two legacy records
via `sameIdentity`. **Legacy references take no part in discovery at all** — not
because they are old, but because a catalogue row cannot say which printing it
means, and a discovery is a claim about an exact card. The demo's own
`partnersWith` / `partnersHolding` path is untouched and still runs on the
legacy key.

### 17. Command and API surface

No new command, no new route, no new client method.

- `discoveries` rides in the existing `GET /api/view` payload and in the
  projection returned by `POST /api/commands`. The production store assigns the
  whole `state` it is given, so no client boundary file changed — the
  `client/api.js` and `client/production-store.js` line pins (158/160 each) are
  untouched.
- `startOpportunity` gained the canonical identity comparison and writes
  `canonicalCardId` when the Goal is canonical.

### 18. Authorization

Unchanged, and deliberately not re-decided. `discoveriesIn` reads a projection;
it never touches canonical state, never calls `resolveActor`, and never calls
`isRelated`. The seat was established before it ran. The accepted relationship
is nevertheless re-checked inside the function, so the rule is stated where it
is relied on rather than inferred from how the projection happens to be built.

A payload cannot forge one: the view is a GET, and `addGoal`/`startOpportunity`
take their owner from the actor, as they always did.

### 19. Collector projection and privacy

A Collector's projection holds their own Goals and their Trusted Partners'
available supply, so the cross product is "partners who have what I want". The
discovery record carries only ids the seat already holds plus the tier of their
own goal. Tested against the raw response body: the partner's `cost`,
`acquired` and private `note` do not appear, and the record has exactly eight
keys with no field for anything else.

A Collector is told nothing about another Collector's demand.

### 20. TP projection and privacy

A partner's projection holds their own supply and their Collector Network's
Goals, so the same cross product is "collectors who want what I have". Only
collectors in an accepted relationship appear at all. A partner outside the
relationship receives an empty `discoveries` and has no demand to compute one
from. No collector-private field travels.

Because the input is the finished projection, there is no second visibility
rule here that could disagree with the first.

### 21. Catalog display

B5–B7 mechanisms reused unchanged. Ids are stored; names are resolved through
the existing `POST`-free `GET /api/canonical-cards?ids=…` batch route via
`onBrowseCards.describe` — one request for the set the screen already holds,
never one per row, never the whole catalog. No provider id is exposed anywhere.
A card whose description has not arrived still renders as a row a person can
act on.

### 22. Collector UI

`client/collector/sections/Goals.jsx`. There is no "Matches" section, for the
same reason there is no Opportunities section: a partner having the card is a
fact about the goal, so it shows **on the goal**, above the deals, because it is
what comes before one.

> **Available now** — Northline has this card.

Plural when it is more than one: *"Northline has 2 of this card."* The count is
of copies to talk about, never a quantity reserved. The join is `goalId` and
nothing else; no card is compared on this screen.

### 23. TP UI

`client/tp/sections/Opportunities.jsx` gains a **Ready to coordinate** panel
above "In progress" — the place a partner with no started deals previously saw
an empty screen.

> **On your shelf** · Primary goal — Casey is actively looking for this card.

Secondary keeps its own sentence: *"This card is on Casey's secondary list."*
With more than one copy: *"You have 2 of them."* No score, no ranking, no
recommendation, no stranger. The section is handed `onBrowseCards` and no
command; it still cannot write.

### 24. Empty and error states

- No overlap ⇒ **no panel at all**, not an empty one. The existing "Nothing in
  progress yet" text is unchanged.
- A description that has not arrived (or a failed describe call) renders "A card
  MetYet is still describing" and keeps the demand sentence. A name that did not
  arrive is not a reason to hide a card you have.
- A goal with no discovery and no deal renders exactly as it did before.
- `discoveriesIn(null | undefined | {} | "no" | 7)` returns `[]`; it never
  throws.

### 25. Files changed

```
 client/collector/present.js                        |   19 +
 client/collector/sections/Goals.jsx                |   39 +-
 client/tp/TrustedPartnerShell.jsx                  |    8 +-
 client/tp/present.js                               |   19 +
 client/tp/sections/Opportunities.jsx               |   89 +-
 domain/metyet-commands.js                          |   26 +-
 domain/metyet-discovery.js                         |  187 ++    (new)
 domain/metyet-projection.js                        |   24 +-
 domain/metyet-world.js                             |   29 +-
 persistence/migrations/0009_…_canonical_card.sql   |   66 ++    (new)
 persistence/world-repository.js                    |    9 +-
 tests/all.cjs                                      |    2 +-
 tests/phase2-projection.cjs                        |   12 +-
 tests/phase5-b8-opportunity-discovery.cjs          | 1031 ++     (new)
 14 files changed, 1544 insertions(+), 16 deletions(-)
```

### 26. Tests added

`tests/phase5-b8-opportunity-discovery.cjs` — **60 tests**, eight sections:

- **A. what makes an overlap real (8)** — goal-first, inventory-first,
  relationship-last, both seats see one key, Primary participates, Secondary
  participates, two copies are one partner, two collectors are independent.
- **B. what is not an overlap (10)** — no goal, no copy, different printing,
  same artwork in a later expansion, unrelated pair, another partner's stock,
  another collector's goal, browsing the catalog, a withdrawn card, a preference
  tag, legacy references on either side.
- **C. idempotency (6)** — repeated reads are byte-identical and move no
  version, tier flip makes no duplicate, remove/recreate a goal, archive/re-list
  a copy, the derivation is pure and non-mutating, malformed input is `[]`.
- **D. lifecycle (7)** — archive, a committed copy, one deal not taking another
  collector's overlap, goal removal with history intact, relationship loss,
  catalog withdrawal, a progressed deal.
- **E. privacy (6)** — unrelated seats, TP cost/acquired/note absent from the
  raw body, collector note not crossing, payload forgery, privacy computed after
  projection, the section is declared so an unclassified one cannot appear.
- **F. canonical Opportunity (8)** — canonical identity stored, **the hole**,
  mixed vocabularies refused, card comes from the records not the caller, legacy
  deals unchanged, `validateWorld` refusing none-or-two, the foreign-key
  backstop, the migration being additive and single-table.
- **G. compatibility (7)** — B5/B6/B7 behaviour, no provider anywhere, no score
  or fuzzy comparison, the derivation cannot write and has no clock, no
  discovery table or collection exists, the demo's matching untouched, exactly
  one command still creates an Opportunity.
- **H. what each person reads (8)** — both shells rendered, both sentences, the
  count, the unnamed-card fallback, the absent panel, the live-deal join, and
  the sections having no way to write.

**One pin restated, none loosened.** `tests/phase2-projection.cjs` pinned the
projection's exact dependency list at two modules. It was protecting "the
projection reaches nothing outside the domain". Restated to name all three and
to additionally assert every dependency matches `^\./metyet-[a-z-]+\.js$` —
tighter than it was, not looser.

### 27. Exact verification

| Step | Result |
|---|---|
| `node tests/phase5-b8-opportunity-discovery.cjs` | 60 passed, 0 failed |
| `tests/phase5-b5-canonical-card-identity.cjs` | 30 passed, 0 failed |
| `tests/phase5-b6-trusted-partner-inventory.cjs` | 32 passed, 0 failed |
| `tests/phase5-b7-collector-goals.cjs` | 40 passed, 0 failed |
| `npm test` (117 suites) | **ALL SUITES PASSED** |
| `npm run verify` | **EXIT 0** |

`npm run verify` runs build → test → prod → smoke → previews. Invitation, auth,
registration, deployment, hosted-environment, projection, persistence and every
demo suite are inside it and all pass.

### 28. Production build and smoke

| | B7 | B8 |
|---|---|---|
| production bundle | 337,799 bytes | **339,282 bytes** (+1,483) |
| prod smoke | 83,686 chars | **83,686 chars** |

`PRODUCTION BUILD OK` / `PROD SMOKE OK — binder strings shipped, old CTA wording
absent`. Previews written.

### 29. Feature SHA / tree

| | |
|---|---|
| commit | `97e410a9f036afcdadb6eceea5949cfed9ff70d5` |
| tree | `5f3aca016323ce736338d3f410ff173458f6e517` |
| parent | `7fb3fe510793bacfc5f9b99d0998830d078a633f` |
| branch | `phase-5-b8-opportunity-discovery` |
| distance from `origin/main` | one code commit, plus one documentation commit adding this report |

The feature commit is deliberately alone: this report names that commit's own
SHA, so it cannot live inside it. `git diff origin/main..97e410a` is the whole
of B8's change to the product.

### 30. PR status

**Not pushed.** `git push` is refused in the cloud environment by the agent
proxy — *"Davi17000/metyet-app is not in this session's authorized repository
set"* (HTTP 403) — and the Mac's Cowork VM has no GitHub credential helper, no
`gh` and no SSH key. This is the fourth consecutive batch ending this way.

Delivered instead by the established verified bundle/import handoff:

| | |
|---|---|
| bundle | `metyet-phase-5-b8-opportunity-discovery.bundle` (feature commit + this report) |
| imported branch | `phase-5-b8-opportunity-discovery-imported` |

The bundle's sha256 is stated in the handoff message and was compared on both
sides before importing. The bundle itself is a transfer artifact, not part of
the change: it is left untracked beside this report and can be deleted once the
branch is pushed.

To push and open the PR:

```
git push -u origin phase-5-b8-opportunity-discovery-imported
```

Nothing was merged or deployed.

### 31. No-provider confirmation

No provider implementation, call, import, key or credential. No fabricated
production cards. `pokemon_cards.json` is not promoted, read or referenced. The
production catalog stays empty behind the Scrydex licensing gate; B8 does not
change that. Tested: the discovery path is scanned for `scrydex`,
`pokemontcg`, `providerCardId`, `apiKey`, `pokemon_cards.json`, `fetch(` and
`axios`, and contains none of them.

Live production proof is therefore impossible and was not attempted: with no
canonical cards in production there is nothing for a production Goal or Copy to
name. Every test above runs against a real Postgres (PGlite) with the real
migrations, the real repository and the real server.

### 32. Remaining legacy `card_id` references and their future owner

| Table | Column | Moves with |
|---|---|---|
| `metyet.binder_copies` | `card_id` | the batch that rewrites `addBinderCopy` |
| `metyet.opportunity_trade_refs` | `card_id` | the trade batch (these are the Collector's cards offered *back*) |
| `metyet.conversations` | `card_id` | the batch that moves threads (`threadKey` is built from `identityKey`) |
| `metyet.catalog_cards` + `resolveCardIdentity` | — | removable once all of the above have moved |

`metyet.opportunities.card_id` is now off this list: it keeps the demo's deals
and is no longer written by new ones.

### 33. B9+ deferrals

Not implemented, and no groundwork laid for them: B9 price agreement changes,
B10 cash and completion, B11 photos, B12 Binder, B13 trade deal workflow, public
marketplace, stranger discovery, recommendations, inferred demand, preference or
fuzzy matching, market prices, automatic purchase or reservation, provider
integration or import, grade bands, onboarding redesign. Notifications are out —
nothing in the discovery path is separable into one, because nothing in it is an
event.

### 34. Unresolved product questions and alternatives worth review

1. **Should a discovery ever be dismissible?** Today a Collector cannot say "I
   know, stop telling me" without removing the Goal. Persisting a dismissal is
   the one product requirement that would force a table. Worth a decision before
   a network has enough overlap for the list to get long.
2. **Ordering.** Discoveries are returned in key order, which is deliberately
   not a ranking. A Collector with many might want them by ask or by how
   recently a partner listed one; both are facts the screen already holds and
   neither needs a score. Not chosen, because choosing would have been
   inventing a preference.
3. **The live-deal join lives in two screens.** Both drop a discovery against a
   live deal on the same `goalId::partnerId`. If a third surface ever needs it,
   it should move into the derivation rather than be written a third time.
4. **Should a Secondary goal be ordered below a Primary one in the partner's
   panel?** The brief permits communicating order. Not done: both are shown with
   their own sentence and the tier tag, and ordering them would be the first
   step toward ranking demand.
5. **Discovery over an unavailable copy.** A copy committed to one deal vanishes
   from other Collectors entirely, which is correct but silent — the partner
   cannot tell another Collector "I have one, but it is spoken for". That is a
   B9/B10 conversation about how commitment is communicated.

### 35. Remaining risks

- **The demo shows no discoveries.** Discovery is canonical-only and the demo
  world is legacy throughout. This is intended and tested, but it means the
  feature is invisible in the prototype and only appears in production once the
  catalog is populated — which is behind the Scrydex licensing gate.
- **Read cost.** The derivation is O(goals + copies) per projection with one
  index map, and the projection already walks both collections. At current
  scale this is nothing. At a scale where one partner has thousands of copies
  and hundreds of network goals, it is still linear, but it happens on every
  read; a future batch may want to cache it per world version.
- **The live-deal join is presentational.** A raw `GET /api/view` consumer that
  is not one of the two shells will see a discovery alongside a live deal for
  the same goal and partner. That is honest — both are true — but a third
  client would need to know it.
- **`opportunity_trade_refs.card_id` still points at `catalog_cards`.** A
  canonical Opportunity with a submitted trade package would write trade rows
  naming legacy cards. No such package can exist today (Binder copies are
  legacy-only), but the trade batch must move both together.

### 36. Verdict

**PASS.**

Every B8 invariant is implemented and tested. Discovery is computed from
explicit Goals and available Copies inside accepted relationships on exact
canonical identity, and nothing else; it reserves nothing, mutates nothing,
duplicates nothing and erases nothing. The Opportunity record's own canonical
migration is additive and closes a real identity hole rather than tidying one.
B5, B6, B7, invitation, auth and demo behaviour are intact, `npm run verify`
exits 0, and the work is committed and delivered without being merged or
deployed.
